# Shared room matchmaking

`js/net/rooms.mjs` owns room membership, seats, readiness, host selection,
transactional starts, rematches and subscription lifetime. It has no Firebase or
DOM dependency. `js/net/firebase-rooms.mjs` adapts those operations to Firestore.
`js/net/room-lobby.mjs` and `css/room-lobby.css` provide the shared lobby view.
`js/net/net.js` handles authentication and exposes `ArcadeNet.rooms.create(options)`,
`rooms.presence(options)` and `rooms.lobby(options)`.

Games supply the lobby's translated text, player badges, results and actions,
while the shared view owns its DOM and layout. Match simulation, heartbeat cadence
and timeouts remain game-specific. Configuration and synchronous lifecycle hooks
replace separate copies of room CRUD and readiness checks.

## Existing game policies

| Policy | Beam | Rune Stones |
| --- | --- | --- |
| Collection | `beam_rooms` | `duel_rooms` |
| Identity | One player per page instance; same account can occupy multiple seats | One player per page instance; same account can occupy both seats |
| Capacity | 2–4 | Exactly 2 |
| Seat layout | Join `order`, stable player colour indices | `slots`, host and guest |
| Start | Host presses Start; guests must be ready | Both press Ready; the host's subscription starts automatically |
| Spectators | Watch without joining or consuming a seat | Disabled |
| Departure | Clear only the departing player's ready flag; match continues | Record a forfeit during play, clear both ready flags, preserve the room and wait for replacement |
| Rematch | Host resets to lobby; everyone readies again | Both ready again from results |
| Host availability | Game supplies heartbeat-based `isAvailable` | Per-player presence counters; release missing peers after 15 seconds |

The existing collection names and document layouts are retained, including
Rune Stones' distinction between an occupied room (`status: 'playing'`) and a
running match (`game.status: 'playing'`). Existing rooms need no migration.

## Creating a service

```js
const matchmaking = net.rooms.create({
    collection: 'beam_rooms',
    identity: 'tab',               // 'account' (default) or 'tab'
    layout: 'order',               // 'order' (default) or 'slots'
    minPlayers: 2,
    maxPlayers: 4,
    startMode: 'host',             // 'host' (default) or 'all-ready'
    allowSpectators: true,
    startPatch(data, playerIds) {
        const hp = Object.fromEntries(playerIds.map(uid => [uid, 3]));
        return { status: 'playing', game: { status: 'playing', round: 1, hp } };
    },
});
```

Choose a collection permitted by `firestore.rules`. Adding a game requires no
changes to the networking implementation. Capacity belongs to the configured
service; a different mode can configure a different service.

Additional configuration:

- `waitingStatus` defaults to `lobby`; `occupiedStatus` defaults to the same value.
  Joining requires the waiting status and a match that is not running.
- `onCreate(input)` supplies initial game data. `create(input)` forwards game
  options such as Rune Stones' seed. Core membership fields are set by the service.
- `onJoin(data, player, playerIds)` and `onLeave(data, player, remainingIds)` return
  extra patches, such as resetting the game on a duel departure. Readiness for the
  arriving/departing player is cleared by default; other readiness is preserved.
- `isAvailable(uid, data)` filters eligible players and host candidates, without
  prescribing a heartbeat mechanism or timeout.
- `isPlaying(data)` defaults to checking `game.status === 'playing'`; games with a
  different match schema can supply their own predicate and `startPatch`.
- `onReset(data)` customizes the host's rematch reset. The default reset clears
  `game`, `round` and readiness and restores the waiting status.

Hooks return plain patches and must not perform writes, DOM changes or other side
effects: Firestore can retry a transaction. Dotted fields are supported in patches.
Membership hooks run inside the same transaction as the membership change.

`net.rooms.presence({ timeoutMs })` creates a reusable presence observer. Call
`observe(data)` on room snapshots, write an increasing per-page counter to
`presence.<playerUid>`, and use `isAvailable(uid)` in the service configuration.
It tracks changes on the observer's own clock, including a grace period for
players who have never sent a beat; client wall clocks need not agree.
`disconnected(data)` returns the missing players and their observed counters.
`releaseDisconnected(code, candidates)` rechecks membership, availability and the
counter in a transaction before releasing one seat. A newer heartbeat cancels
the eviction. Normal departure hooks also handle these releases.

Rune Stones sends a beat every 3 seconds and checks presence every second, in
the lobby and during play. A surviving player can release a disconnected host,
inherit the room and accept a replacement. Ready flags are cleared on departure.
Its lobby retains room code/copy controls after pairing, lists player roles,
connection and ready states, and preserves input value, focus and selection on
redraw. A released tab can rejoin but cannot control or enter a replacement match.

## Service API

| Method | Behavior |
| --- | --- |
| `currentPlayer()` | Account information with the room UID, or `null` when signed out |
| `create(input)`, `join(code)` | Return the normalized room code; same-player reconnect is idempotent |
| `leave(code)` | Remove this player, migrate the host, delete an empty room; observers do not mutate membership |
| `setReady(code, ready = true)` | Member-only, transactional readiness; ignored during play |
| `playerIds(data, availableOnly = false)`, `host(data)` | Seat order and host selection |
| `canStart(data)` | Local UI eligibility, including host, readiness and minimum player count |
| `start(code)` | Recheck eligibility in a transaction and apply the game's start patch once |
| `reset(code)` | Host-only rematch reset; ignored during play |
| `releaseDisconnected(code, candidates)` | Release a missing peer only if its observed counter is still unchanged |
| `updateMatch(code, expected, buildPatch)` | Transactional gameplay update guarded by match ID, round, status and optional additional game fields |
| `settleRound(code, expected, buildPatch)` | Guarded, member-only, once-per-round settlement from the current document |
| `get(code)`, `watch(code, cb)`, `update(code, patch)`, `remove(code)` | Collection-scoped document transport for gameplay |
| `cleanup(maxAgeMs)` | Remove inactive rooms in this collection; default 5 minutes |

`start` and `reset` return `false` when ineligible. Other errors include a stable
`room/*` code and readable message, such as `room/full`, `room/started`,
`room/not-found`, `room/auth` and `room/spectator`. Game UI translates errors.

Creation, membership changes, readiness and starts all use transactions. Capacity
checks and ready checks use the authoritative snapshot, preventing concurrent
joins from overfilling a room or repeated starts from replacing an active match.
Gameplay `update` remains available for the game's own synchronization protocol.
These client checks use the existing Firestore access rules; they are not server
authority or cheat prevention.

## Match and round guards

Every successful start assigns a new random `game.matchId` and initializes
`game.settledRound` to zero. Match IDs distinguish two games in the same room even
when both are at round one. They also protect against room-code reuse.

```js
await matchmaking.settleRound(code, { matchId: observed.matchId, round: observed.round }, data => {
    const game = data.game; // authoritative inputs/HP, not the caller's old snapshot
    if (!bothAttacksSubmitted(game)) return null;
    return { 'game.hp': computeHp(game), 'game.round': game.round + 1, 'game.atk': {} };
});
```

Only the first valid transaction commits and records `game.settledRound`. A
retry, another coordinator, or a previous match's delayed request returns `false`.
Returning `null` when inputs are incomplete does not consume the settlement.
`updateMatch` requires explicit `matchId`, `round` and `status` guards, and accepts
additional exact game fields. Gameplay submissions use it too, so an old attack
or answer cannot enter the next round. Legacy games without a match ID can use
an explicitly captured `undefined` until their next start assigns an ID.

Rune Stones settles damage and advances the round in one transaction. Beam
settles HP/results once, stores `game.pending` for a decided match, and lets the
reveal animation finish. Its next-round and game-over writes also check the match,
round and settled marker. A replacement host reads the pending outcome from the
document. Its solo mode continues to use local room updates.

## Owning a subscription

```js
const session = matchmaking.session({
    onChange(data, activeRoom) {
        room = activeRoom;          // { code, data, unsub, spectate, starting }
        renderLobby();
        onRoomGame(data);
    },
    onError: showLobbyError,
});
session.attach(code);               // replaces the previous subscription
session.attach(code, { spectate: true }); // only when allowSpectators is enabled
await session.leave();              // detach and release this seat
session.detach();                   // unsubscribe only; do not release the seat
```

Callbacks queued before unsubscribe are ignored, even after attaching another
room with the same code. Each session has at most one subscription. For
`all-ready` rooms, only the host's non-spectating session calls `start`, and the
transaction makes repeated snapshot notifications safe. Errors reach `onError`.

Keep the subscription for a rematch; detach when switching to solo. Page-exit
writes remain best-effort, with heartbeat/forfeit/cleanup rules handling abandoned
clients. Both games release their own seat on page exit, preserve rooms with
remaining players and delete empty rooms. Rune Stones uses the same departure
policy in the lobby and during play, whether the host or guest closes a page.

## Shared lobby layout

Both game pages load `css/room-lobby.css`. Create one view after the network layer
is ready and keep its element/reference handles for showing, hiding and errors:

```js
const view = net.rooms.lobby({ onClose: closeLobby, onError: showLobbyError });
lobbyEl = view.element;
lobbyRefs = view.refs;
view.render({
    title: t('online'), closeLabel: t('close'), status: statusText,
    auth: { text: accountLabel, actions: [signOutAction] },
    room: {
        code, players, notes: [],
        copy: { label: t('copy'), onClick: () => copyCode(code) },
        primary: { label: t('ready'), primary: true, onClick: doReady },
        leave: { label: t('leaveRoom'), onClick: doLeave },
    },
});
```

An action has `label`, `onClick`, optional `primary` and `disabled`; rejected
action promises and synchronous errors reach `onError`. Auth actions also have an
`id`. A waiting primary action is `{ text: waitingMessage }`. Each player supplies
`uid`, `name`, optional `color`/`muted` and `badges: [{ label, tone }]`; supported
badge tones include `host`, `ready` and `rank`. Text is rendered as text, not HTML.

Before joining, supply `entry` instead of `room`: `codeLabel`, `create`, `join`
and optional `spectate` actions. Join/spectate callbacks receive the entered code.
The shared view preserves the input value, focus and selection across redraws;
Enter activates Join outside an IME composition.

The modal is attached to the document body and uses the same viewport-based
width, spacing and responsive styling in both games, independent of board size:

1. Title and account controls.
2. Entry: Create, code input, then Join and optional Spectate.
3. In-room: room code, player list and optional notes.
4. Copy and the primary action together (Start, Ready, Rematch or waiting text).
5. Leave on a separate full-width row, followed by status and Close.

The game decides which actions to expose. Beam supplies spectator notes and rank
badges; Rune Stones supplies online/ready badges. Both share the exact element
structure and CSS. The view never joins/leaves a room or decides when a game starts.

## Offline checks

```text
node tools/rooms-check.js
node tools/beam-room-check.js
node tools/rune-room-check.js
# Optional: real Chrome pages with a local fake Firebase SDK
node tools/rooms-browser-check.js
```

The first exercises the shared core and real Firebase adapter against a serialized
in-memory Firestore fixture, including concurrent operations, capacity, host
authority, alternate game policies, cleanup and delayed subscriptions. The game
checks execute each game's real matchmaking handlers with DOM/drawing stubbed.
They cover independent Beam tabs, spectators, both start modes, rematches,
departures, host migration, readiness resets, simultaneous settlements and stale
round/match writes without network writes. Presence tests use a controlled clock,
including recovery immediately before an eviction transaction.
The optional browser check loads both actual pages, ES modules and lobby UI in
headless Chrome with a temporary profile. It exercises creation, joining, starts,
results, rematches, rejoining, input preservation, shared action placement,
320px/desktop overflow checks and actual round settlement,
including Beam solo play. Pass a Chrome executable path as the first
argument if it is not installed at the Windows default path. All SDK calls are
redirected to the local fixture; production Firebase is never contacted.
