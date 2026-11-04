# Shared room matchmaking

`js/net/rooms.mjs` owns room membership, seats, readiness, host selection,
transactional starts, rematches and subscription lifetime. It has no Firebase or
DOM dependency. `js/net/rtdb-rooms.mjs` provides the Realtime Database transport;
[Deployment and Firebase configuration](#deployment-and-firebase-configuration)
covers Console setup and Firestore room retirement.
`js/net/room-lobby.mjs` and `css/room-lobby.css` provide the shared lobby view.
`js/net/net.js` handles authentication and exposes `ArcadeNet.rooms.create(options)`,
`rooms.presence(options)` and `rooms.lobby(options)`.

Beam and Rune Stones supply translated text, player badges, results and actions
to the shared lobby view. Darts uses its own unified lobby view on the same room
service so one device can control several participants. Match simulation,
heartbeat cadence and timeouts remain game-specific. Configuration and
synchronous lifecycle hooks replace separate copies of room CRUD and readiness
checks.

## Existing game policies

| Policy | Beam | Rune Stones | Darts |
| --- | --- | --- | --- |
| Collection | `beam_rooms` | `duel_rooms` | `darts_rooms` |
| Identity | One player per page instance; same account can occupy multiple seats | One player per page instance; same account can occupy both seats | One connection per page instance; each connection controls one or more participant slots |
| Capacity | 2–4 | Exactly 2 | 1–4 participants across 1–4 devices |
| Seat layout | Join `order`, stable player colour indices | `slots`, host and guest | Connection `slots` plus separate `participants` and `seatOrder`; four participant slots total |
| Start | Host presses Start; guests must be ready | Host presses Start; guest must be ready | Host starts after all guest controllers confirm the current configuration; mode validates participant count |
| Spectators | Watch without joining or consuming a seat | Disabled | Disabled |
| Departure | Clear only the departing player's ready flag; match continues | Record a forfeit during play, clear both ready flags, preserve the room and wait for replacement | Withdraw all slots owned by the departing controller; competitive play continues with 2+ remaining participants, Practice with 1+ |
| Rematch | Host resets the same room; guests ready again, then host starts | Same flow | Return to the same lobby, retain slots/names/configuration and finished results, then configure and start a new match |
| Closing results | Leave the room and return to solo ready screen | Same flow | Keep room membership; leaving is an explicit action |
| Host availability | Game supplies heartbeat-based `isAvailable` | Per-player presence counters; release missing peers after 15 seconds | Same per-connection presence and host migration; temporary loss retains every owned participant slot |

[Darts](DEV.md#darts-implementation) uses the same service with guarded turn/revision
updates, physical throw events, optional turn timers, configurable rules and
first-to-one/two/three leg wins.

The logical collection names and room layouts are retained, including
Rune Stones' distinction between an occupied room (`status: 'playing'`) and a
running match (`game.status: 'playing'`). Players see and share four-character
codes such as `ABCD`. The adapter keeps the existing `R-ABCD` RTDB key and stored
metadata, so active rooms and published rules need no migration. Firestore rooms
remain retired; four-character input always addresses RTDB.

## Darts room and match protocol

V2 keeps the existing `/rooms/darts_rooms/R-XXXX` path and four-character public
codes. No additional Firebase rule change is needed if the current
`database.rules.json`, which already permits `darts_rooms`, has been published.
Firestore room access remains retired.

Darts opens a local lobby with one participant. Local Practice, Count-Up and
shared-device games use the same lobby without opening a network room. Invite or
Join loads the online service; creating an invitation promotes the current local
participants and configuration into a shared room. Solo Practice and Count-Up
require one participant; 501 and Cricket require two. Every mode allows at most
four participants.

The shared service's `players`, connection `slots`, `hostUid`, readiness and
presence still identify page connections. Darts stores participant slots
separately in `participants`, ordered by `seatOrder`. A participant has a display
name, controller connection ID and type. Each connection can add, rename or
remove its own local participants in the lobby, retaining at least one owned
participant; a remote join and local addition share the same four-slot capacity
check inside transactions. Names and participant IDs survive invitation creation
and successive matches. Known signed-in account display names are used as the
first local participant's default; guests and extra local participants use
numbered names. Manual edits remain authoritative. The auth layer's local
display-name hint allows this even before Darts loads online services; the hint
is not used for authentication or controller ownership. Actual names are separate
from the indication of which device controls the slot.

The room's `phase` is `lobby`, `playing` or `results`; the transport status is
`waiting`, `playing` or `results` respectively. Host-only lobby configuration can
change modes, in/out and Bull rules, Cricket variant, round limits, target leg
wins and turn timers. Configuration and membership changes increment the lobby
`revision` and clear device readiness. A controller confirms Ready once for all
its local participants, against the revision it saw. A stale confirmation after
a rules change is rejected. The host's Start action confirms its own readiness;
all other controllers must have confirmed the current configuration. The shared
service's optional `canStart(data, availableIds, uid)` policy hook rechecks mode,
participant capacity, controller availability and room phase inside the start
transaction.

Start captures the mode/rules, participant list, participant-to-controller
`game.owners` map and display-name `roster`. The active match owns this immutable
configuration; lobby edits cannot change a match in progress. For shared
execution, each accepted
throw derives the active participant from the current game and checks its frozen
owner against the calling connection. Changing a supplied participant ID cannot
select another controller's turn. The `updateMatch` transaction also checks match
ID, monotonically increasing turn `round`, revision `seq`, status, presentation
gate and enabled turn deadline, preventing stale/double submissions and competing
turn advances through this client protocol. The Firebase rules retain the
existing authenticated honor-system access policy; these transactions do not
introduce server-authoritative anti-cheat enforcement.

The same Start transaction fixes `game.execution`. When the host connection owns
every participant and no other connection is present, it selects `local`. The
host runs throws, history, timers and Leg changes through the offline rules path
without per-dart network updates. The code, captured membership and initial match
remain reserved by the normal room heartbeat; joins stay blocked until the lobby
returns. Timer-Off local matches can pause, while enabled local deadlines keep
the existing offline policy.

The live local scores, result and history stay on the host until Return to Lobby.
`syncLocal(state, true)` checks the stored match ID, host ownership, participant
order, frozen rule settings and sequence before publishing the finished snapshot
and reopening the same lobby in one transaction. The stored match is not updated
automatically merely because local play has ended. Configuration and readiness
then follow the normal lobby protocol. A later match with another device selects
`shared`; a shared match does not change execution mode when a peer leaves.

Between-leg state counts as a running match. New connections and participant
changes are allowed only in the lobby. On match completion, results remain in
the same room. Host Return to Lobby clears readiness while preserving
participants, names, room code, selected configuration and the finished match's
results/history. A new Start replaces only match-specific state with a new match
ID. The host can also end unlimited Practice and return to this lobby without
awarding a winner. Closing the room panel leaves membership intact; Leave is
explicit. No new invitation is needed to switch modes or play again.

Presence uses the existing 3-second piggybacked connection heartbeats,
15-second missing-peer grace period and host migration. Brief reconnects retain
all slots owned by the connection. Release or intentional departure withdraws
all those slots together from the captured match; departed names and seats remain
in the match HUD/history. Competitive matches continue with at least two
participants and award a forfeit to the final survivor; Practice continues with
one. A released page cannot act in a replacement match and can join again from
the lobby. Reloading still creates a new page identity, so the previous
connection's slots are released through normal presence handling.

Timers offer Off/30/60/90 seconds, defaulting to Off for Practice and 60 seconds
for competitive modes. Unused darts are forfeited on timeout; valid points
already scored remain. In shared execution, any seated controller's watchdog can advance an expired
turn once. The next participant's deadline starts after the previous flight and
result presentation, giving a full turn to aim. An Off timer never expires.
Opening lobby or history panels does not stop an enabled timer. Deadlines follow
the existing games' client wall-clock convention.

Accepted throws store one compact `lastThrow` event with flight, physical impact,
configured result and sequence in shared execution. Bull scoring preserves the physical inner/outer
category, and Cut-Throat Cricket records the applicable opponent penalties. All
clients animate the accepted flight and reveal committed scores/history at
impact. Presence snapshots do not replay throws; pointer samples and per-frame
movement are not networked. Round limits apply per participant, with equal turn
opportunities before settlement. Ties use one closest-to-Bull dart per tied
participant, repeating only among those still tied. History spans the match's
legs, is bounded to 500 turns and resets on the next match's Start.

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

Choose a room group permitted by `database.rules.json`. Adding a game requires
authorizing its group in the RTDB rules, but no changes to the networking
implementation. Capacity belongs to the configured service; a different mode
can configure a different service.

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
- `presenceField` optionally names the room counter map (`presence` for Rune
  Stones, `game.beat` for Beam). Successful member writes include a counter in the
  same commit. Call `heartbeat(code, intervalMs)` on the watchdog; it sends a
  separate pulse only when this player's own committed activity is not recent.
- `isPlaying(data)` defaults to checking `game.status === 'playing'`; games with a
  different match schema can supply their own predicate and `startPatch`.
- `canStart(data, availablePlayerIds, uid)` optionally adds game-specific start
  requirements after the shared host, readiness and minimum-count checks. It runs
  in both local eligibility checks and the Start transaction and defaults to true.
- `onReset(data)` customizes the host's rematch reset. The default reset clears
  `game`, `round` and readiness and restores the waiting status.

Hooks return plain patches and must not perform writes, DOM changes or other side
effects: RTDB can retry a transaction. Dotted fields are supported in patches.
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
Meaningful gameplay and membership writes can replace a separate pulse within
that interval; silent players still send their regular heartbeats.

## Service API

| Method | Behavior |
| --- | --- |
| `currentPlayer()` | Account information with the room UID, or `null` when signed out |
| `create(input)`, `join(code)` | Return the normalized room code; same-player reconnect is idempotent |
| `leave(code)` | Remove this player, migrate the host, delete an empty room; observers do not mutate membership |
| `setReady(code, ready = true)` | Member-only, transactional readiness; ignored during play |
| `playerIds(data, availableOnly = false)`, `host(data)` | Seat order and host selection |
| `canStart(data)` | Local UI eligibility, including host, readiness, minimum player count and optional game policy |
| `primaryAction(data, { finished }?)` | Shared action policy: join, start, ready, wait-ready, rematch, wait-rematch, or no action |
| `start(code)` | Recheck eligibility in a transaction and apply the game's start patch once |
| `reset(code)` | Host-only rematch reset; ignored during play |
| `releaseDisconnected(code, candidates)` | Release a missing peer only if its observed counter is still unchanged |
| `heartbeat(code, intervalMs = 3000)` | Publish liveness only when this player's last committed operation is not recent |
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
These client checks use the RTDB access rules; they are not server
authority or cheat prevention.

Beam and Rune Stones render their primary action from `primaryAction`, then supply their
own translated text and handlers to the shared lobby. A host sees a disabled Start
until the guest is ready, a ready guest waits for the host, and results offer
Rematch only to the host while guests see a waiting message. Rematch clears all
readiness inside the same room; it does not create a room or start automatically.
`finished` defaults to `game.status === 'over'`; custom schemas may override it.
The generic core still supports `startMode: 'all-ready'` for future games.

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

## Traffic and storage

Rooms, gameplay and presence use RTDB. Authentication, account records/scores,
admin settings and feedback still use the existing Auth/Firestore APIs. There is
no room backend selector, legacy routing or cross-database fallback. Invalid
RTDB configuration disables rooms while account sync and solo play remain usable.

The room service preserves immediate gameplay updates, the 3-second liveness
interval, Beam's 8-second timeout and Rune Stones' 15-second timeout:

- Successful member operations include their presence counter in the same write.
  Only that player's committed activity postpones its standalone heartbeat.
  Rejected/stale actions and another player's activity do not prove liveness.
  Send times drive scheduling, so delayed acknowledgements cannot extend the
  deadline; failures back off one interval without refreshing presence.
- Identical payloads produce no write or listener update. Transactions still read
  authoritative data and retain their concurrency guards.
- Rune Stones combines phase updates, and Beam skips impossible local work.
- Each adapter shares an in-flight cleanup query and a 60-second cooldown across
  repeated calls. A pass considers at most 20 old rooms, rechecks inactivity in
  per-room transactions, and deletes only rooms that are still inactive. Cleanup
  is not a presence mechanism and can take several passes to drain a backlog.

The deterministic traffic fixture compares fixed and piggybacked heartbeats:
30 gameplay actions per minute produce 50 versus 30 writes and 100 versus 60
update deliveries to two listeners. Idle clients retain their heartbeat cadence.
These are fixture operation counts, not measurements of Firebase billing or
network bytes. RTDB costs depend on connections, downloads and stored data; see
[Firebase pricing](https://firebase.google.com/pricing).

The RTDB adapter encodes null, empty containers and arrays explicitly, since
native null deletes a field and empty containers disappear. Reserved
`__room_*` markers are internal; callers receive ordinary JSON. Cleanup metadata
remains numeric/indexable at the room root. Cold-cache transactions confirm
server state before evaluating a missing-room decision, disable optimistic game
notifications and retry against fresh data. This client's updates are serialized
with its room transactions to avoid cancelling its own pending transaction.

Native `onDisconnect` marks this player's presence counter as `-1` and is
rearmed after reconnect. Existing observers retain the deadline from the last
positive beat. Periodic pulses preserve the existing 8/15-second timeouts even
when server disconnect detection takes longer. Connection monitoring starts only
after room use; solo startup does not scan rooms.

The shared service normalizes `ABCD` and `R-ABCD` to the same public code. The
adapter validates the four-character suffix before SDK access and deterministically
maps it to `R-ABCD` for storage. No second lookup, dual writes or alias records are
needed. Transactions decode room metadata for callers and restore its stored code
before writing, preserving the existing rule that metadata matches the RTDB key.

The input accepts four characters and copy/display omit the prefix. Typing or
pasting an old prefixed code is normalized before input truncation. Malformed
codes cannot initiate room reads, subscriptions or writes. Old clients can still
use prefixed room codes; reload them to get the four-character input experience.

## Verification

Local core, game and browser checks live in [DEBUG.md](DEBUG.md#room-checks).
The two-tab procedure below verifies the deployed rules; local fakes cannot do so.

## Deployment and Firebase configuration

### Configure RTDB in a new environment

Use the same Firebase project as the existing Auth/Firestore configuration.
Check **Realtime Database > Data** for the existing database URL; create a new
database in Locked mode only if no database exists. Publish the complete contents
of [`database.rules.json`](../database.rules.json) in **Realtime Database > Rules**.
This is separate from **Firestore Database > Rules**.

The supplied rules allow authenticated users, including existing anonymous guest
accounts, to use `/rooms/beam_rooms`, `/rooms/duel_rooms` and `/rooms/darts_rooms`. Publish
the current RTDB rules before using online rooms; see [Darts room and match protocol](#darts-room-and-match-protocol).
They validate basic
room metadata and index `lastActionAt` for cleanup. The project's existing
honor-system room policy remains; these are not server-authoritative anti-cheat
rules. Unknown roots are denied. Local JSON checks do not evaluate server rules.

The public URL is configured in [`js/firebase-config.js`](../js/firebase-config.js):

```js
window.FIREBASE_ROOMS = {
    databaseURL: 'https://games-7e19b-default-rtdb.asia-southeast1.firebasedatabase.app/',
};
```

Use the exact Console URL, without a `/rooms` path, `.json` suffix or query.
Account/project configuration remains in `FIREBASE_CONFIG`. A missing/invalid
room URL disables online rooms while account sync and solo play continue.
RTDB permission/network errors propagate to the caller; they cannot select a
different database or create a fallback room. Deploy all changed modules together.

### Verify in two fresh tabs

1. Reload the deployed page and sign in through the existing Google/guest flow.
2. Create a Beam room, confirm a code such as `ABCD`, and join from a second
   tab. Same-account tabs must occupy separate seats. Test readiness, starting,
   finishing, same-room rematch, leave/rejoin and disconnect recovery.
3. Repeat with Rune Stones. As in Beam, the guest readies up and the host presses
   Start. After results, the host chooses Rematch in the same room; the guest
   readies again and the host starts. Closing results leaves the room and restores
   the solo ready screen. A survivor retains the room when the other leaves or
   disconnects.
4. Confirm RTDB data appears under `rooms/beam_rooms/R-ABCD` or
   `rooms/duel_rooms/R-EFGH`. Existing RTDB rooms need no migration.
5. Check account records/scores still appear; they remain in Firestore profiles.
6. Copied codes must omit `R-`; pasting a previous `R-ABCD` code must normalize to
   `ABCD` and join the same RTDB room. After publishing Firestore rules, a stale
   Firestore client must no longer be able to read or write Firestore rooms.
7. Observe RTDB Usage for connections/downloads and Firestore Usage for accounts.
   Current room clients perform no Firestore room operations. Server rule changes
   are needed to stop stale clients from continuing the old transport.

`window.ArcadeNet.rooms.backend` reports `rtdb`. Successful room creation/joining
is the permissions test; the reported backend alone is not.

### Retired Firestore room access

The following steps complete the server-side cutoff. A website deployment alone
does not publish Firebase rules, and already-loaded old clients retain their old
JavaScript until refreshed.

1. Deploy this code through the existing GitHub Pages branch-based deployment.
   Refresh or close old game tabs. New clients only use RTDB rooms.
2. In Firebase Console, select `games-7e19b`, open **Firestore Database > Rules**,
   replace the complete rules with [`firestore.rules`](../firestore.rules), and
   publish. This file no longer permits `beam_rooms` or `duel_rooms`; unmatched
   paths are denied. Existing profile, admin and feedback rules remain intact.
   Old clients will lose Firestore room access and should reload the website.
3. Verify both games with the [two-tab checks](#verify-in-two-fresh-tabs) and confirm profile records
   still load. Publishing rules ends access to active Firestore matches, so do
   not expect an old Firestore room to continue after this cutoff.
4. If old room data is no longer needed, back up and remove only the Firestore
   collections `beam_rooms` and `duel_rooms` from the Console. Rule publication
   does not delete documents. This code does not delete production data.

No RTDB rule change is needed for this retirement: [`database.rules.json`](../database.rules.json)
already uses the current paths and `R-XXXX` format. Do not remove either database
or change Firestore account collections. There is no `legacyFirestore` flag,
backend selector or built-in Firestore room rollback anymore. Reintroducing that
transport would require restoring compatible code and rules together.

Official references: [setup](https://firebase.google.com/docs/database/web/start),
[transactions](https://firebase.google.com/docs/database/web/read-and-write),
[presence](https://firebase.google.com/docs/database/web/offline-capabilities),
[RTDB rules](https://firebase.google.com/docs/database/security),
[Firestore rules](https://firebase.google.com/docs/firestore/security/get-started).
