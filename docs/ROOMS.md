# Shared room matchmaking

`js/net/rooms.mjs` owns room membership, seats, readiness, host selection,
transactional starts, rematches and subscription lifetime. It has no Firebase or
DOM dependency. `js/net/rtdb-rooms.mjs` provides the Realtime Database transport;
[Deployment and Firebase configuration](#deployment-and-firebase-configuration)
covers Console setup and Firestore room retirement.
`js/net/room-lobby.mjs` and `css/room-lobby.css` provide the shared lobby view.
`js/net/net.js` handles authentication and exposes `ArcadeNet.rooms.create(options)`,
`rooms.presence(options)` and `rooms.lobby(options)`. First call and await
`ArcadeNet.rooms.ready()` before using any of these methods. It shares one lazy
load of the RTDB SDK and local room modules; `rooms.ok` is null until loaded, true
on success, and false on failure. A rejected load can be retried. Account/Auth
readiness is independent of rooms. Beam and Rune Stones initialize rooms on their
game pages; Darts, Impressions and Trash Toss wait until online entry (Impressions also
initializes for a stored recovery location). The launcher never loads them.
`rooms.clock()` also requires this readiness. Auth restoration is published through
`ArcadeAuth` before Firestore; guest sign-in waits for restoration instead of
replacing a restoring Google session with an anonymous account.

Rune Stones supplies translated text, player badges, results and actions
to the shared lobby view. Beam and Darts each use their own unified lobby view on
the same room service — Darts so one device can control several participants, Beam
(`js/games/beam-lobby.js`) for its Solo/Online tabs and custom CPUs. Impressions also uses
its own lobby with the same service; its simultaneous submission protocol is
described in [Impressions room and match protocol](#impressions-room-and-match-protocol). Match simulation,
heartbeat cadence and timeouts remain game-specific. Configuration and
synchronous lifecycle hooks replace separate copies of room CRUD and readiness
checks.

## Existing game policies

| Policy | Beam | Rune Stones | Darts |
| --- | --- | --- | --- |
| Collection | `beam_rooms` | `duel_rooms` | `darts_rooms` |
| Identity | One player per page instance; same account can occupy multiple seats | One player per page instance; same account can occupy both seats | One connection per page instance; each connection controls one or more participant slots |
| Capacity | 2–8 (humans and CPUs combined) | Exactly 2 | 1–4 participants across 1–4 devices |
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

## Impressions room and match protocol

Impressions uses `/rooms/memory_rooms/R-XXXX`, four-character public codes and
the shared service with tab/controller identity, join order, presence and
guarded transactions. Separate frozen participants/seat order include one human
per controller plus any owned CPUs; there are 2–8 actors at Start and at least
one human. The room need not be full. See
[current match contracts](impressions/README.md) and [player rules](rules.md#impressions).

- Host Start requires connected human controllers, current guest Ready and
  usable Pitch audio acknowledgements when needed. CPU settings/ownership and
  all gameplay settings freeze into the new match.
- Each actor has one accepted receipt per question. Match/round/question guards,
  ownership checks and the settled-round guard prevent ordinary stale/duplicate
  client operations. These checks live in browser code, not a trusted scorer.
- V14 elimination metadata commits with HP settlement. V13+ can settle early
  after all eligible valid receipts; earlier frozen matches keep their deadlines.
- Preparing the next match retains the finished game, room/roster/settings and
  usable audio, clears Ready and opens the lobby for everyone. Host Start creates
  a new match; it is not an automatic rematch. Previous standings are readonly.
- Leaving withdraws the controller's human and CPUs during play. Host migration
  retains the 15s presence grace. Impressions supports membership-only same-tab refresh
  recovery using sessionStorage and an exclusive controller lock; see
  [recovery contracts and limitations](impressions/README.md#same-tab-recovery).
  Last-controller departure deletes the room. Current question/receipts and the
  latest result are retained, not full round history.

### Impressions deployment and trust boundary

RTDB must have the reviewed `memory_rooms` policy. If it already works, do not
redeploy unchanged RTDB Rules for a presentation or analytics change. The policy
permits authenticated browser room writes with basic metadata validation; it
does not enforce scoring, immutable game state or malicious-client ownership
checks. UI hiding is not anti-cheat protection.

[Automatic analytics](impressions/ANALYTICS.md) observes snapshots without changing
room transactions. Its Firestore create-only Rules/indexes are a separate
deployment, require explicit approval and do not make room data trusted.
See [tests](impressions/TESTING.md#real-firebase-and-rules) and the
[shared deployment policy](#development-stage-deployment-policy).

## Darts room and match protocol

V2 keeps the existing `/rooms/darts_rooms/R-XXXX` path and four-character public
codes. No additional Firebase rule change is needed if the current
`database.rules.json`, which already permits `darts_rooms`, has been published.
Firestore room access remains retired.

Darts opens a local lobby with one participant. Local Practice, Count-Up and
shared-device games use the same lobby without opening a network room. Invite or
Join loads the online service; creating an invitation promotes the current local
participants and configuration into a shared room. Solo Practice and Count-Up
require one participant; X01 and Cricket require two. Every mode allows at most
four participants.

Local and coded Darts rooms can include CPU slots in competitive modes. A CPU
uses its owning device's ordinary `controllerId`, never a new connection or
Ready identity. Each device must retain a human slot. Creating a code imports
the current human/CPU roster; joining uses the existing one-human join, after
which the guest can add its CPUs. CPU additions/removals, renames and difficulty
changes are owner-only lobby transactions that clear all Ready states and
increment the revision. Practice cannot start with CPUs. No bot host, ownership
transfer or new production synchronization transport is introduced.

CPU difficulty uses numeric levels 0–15, with Normal III (6) as default. The legacy
strings `easy`/`normal`/`hard`/`insane` remain valid aliases for levels 1/6/11/14.
Imports and edits normalize to numbers, including level zero; existing frozen
participant snapshots retain their exact values and ownership guards.

Match start captures CPU type/name/difficulty/owner in `game.participants` and
`game.owners`. Only the active CPU's owner runs the existing gesture generator
and submits a physical flight through the normal accepted-throw transaction.
Expected Match/Leg/phase/active/turn/sequence guards reject duplicates and stale
requests, including delayed acknowledgements; deadlines are checked again when
the transaction executes. CPU diagnostics remain local. The adapter exposes its
existing connection observation so disconnected owners stop scheduling. Native
presence and the normal grace/reaping policy remove all departed human/CPU slots
without transferring CPUs. A same-page reconnect can recover before reaping;
refresh creates a new random page identity and does not reclaim old slots.

This remains a browser-trust architecture: published RTDB rules permit the
existing authenticated room writes; they do not enforce game physics, difficulty
or anti-cheat validation on a server. Client transaction guards protect ordinary
application races, not malicious clients that bypass the room API.

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

X01 starting score, round cap/settlement and opening starter selection use the
same configuration/Ready transaction and freeze with the other Match options.
Legacy 501 configurations normalize to X01/501. Opening, tied-result and direct
limit Cork phases share the rules engine, physical impact distances and slot
ownership guards. They add no separate room or transport. A final throw commits
its completed result immediately; the one-second final-hit presentation is local
UI state and cannot admit another throw or timeout into a finished Leg.

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
| `isConnected()` | The store's observed connection status; true for stores without a connection observer |
| `create(input)`, `join(code)` | Return the normalized room code; same-player reconnect is idempotent |
| `resume(code, buildPatch)` | Recover existing membership transactionally, pulse presence and apply a pure game-specific recovery patch; missing rooms/members reject without running Join |
| `leave(code)` | Remove this player, migrate the host, delete an empty room; observers do not mutate membership |
| `kick(code, targetUid)` | Host-only removal of another member (frees a seat held by a departed/disconnected player); migrates the host and deletes an empty room via the same departure path |
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

Rune Stones renders its primary action from `primaryAction`, then supplies its
own translated text and handlers to the shared lobby. (Beam uses its own lobby
view like Darts.) A host sees a disabled Start
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

The Rune Stones page loads `css/room-lobby.css`. Create one view after the network
layer is ready and keep its element/reference handles for showing, hiding and errors:

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

The game decides which actions to expose. Rune Stones supplies online/ready badges
through this shared structure and CSS. (Beam renders its own spectator notes and
rank badges in `js/games/beam-lobby.js`.) The view never joins/leaves a room or
decides when a game starts.

## Traffic and storage

Rooms, gameplay and presence use RTDB. Authentication, account records/scores,
admin settings, feedback and best-effort Impressions analytics use the existing
Auth/Firestore APIs independently of room transactions. There is
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

### Cleanup time and entry points

`rtdb-rooms.mjs.cleanup()` retains a five-minute default based on `lastActionAt`;
heartbeats and other committed room writes refresh that field with
`serverTimestamp()`. `expireAt` is not an automatic TTL. Each pass only queries
its own game collection. The 60-second cooldown uses monotonic time, independently
of the game clock and the client calendar clock.

`createRealtimeCleanupClock()` in `rtdb-clock.mjs` is separate from game timing.
`net.js` creates one at RTDB initialization and shares it with room stores. It
requires both a finite `.info/serverTimeOffset` calibration and a connected
handshake observed after a disconnected state (a late cached `connected=true`
alone is insufficient), anchors server time to monotonic elapsed time, and uses a one-second
conservative uncertainty margin. The default expiry setting remains five minutes;
rooms near the boundary may wait for a later pass. Missing calibration can wait
up to 1.5s in the **background cleanup task**, then returns zero without querying.
Disconnects, information-listener errors, invalid samples and detected wall-clock
jumps invalidate the clock. Cached duplicate info cannot revalidate a wall jump;
a fresh offset/connected calibration is required. Cleanup never reconnects the
SDK or changes game clocks to obtain calibration.

Each deletion transaction/retry must still have the pass's valid calibration,
an unchanged finite nonnegative `lastActionAt` from the query, and an activity
time older than the conservative cutoff. A new heartbeat, changed calibration or
lost connection cancels that deletion. Query/transaction failures resolve to zero
or the count of successful deletions; they do not feed errors into gameplay.
This protects ordinary clock/race failures, not malicious authenticated clients
that bypass the honor-system room API.

Impressions attempts one background cleanup per authenticated page entry after its
optional original-room recovery has committed. Darts attempts it after online
Auth initialization; expanding **Invite / join** starts that initialization,
while its ordinary offline lobby remains local. Repeated initialization for the
same UID does not start another entry sweep. Create/join never await cleanup.
Impressions's 60s and Darts' 30s host-maintenance calls remain; adapter throttling still
limits queries to one per 60s. Beam/Rune Stones keep their existing lobby-entry
and periodic cleanup calls. Failed/pending cleanup cannot block room recovery,
admission or gameplay. If calibration is unavailable on entry, later normal
maintenance can retry; without any eligible online client there is no server job.

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

By default, native `onDisconnect` marks this player's presence counter as `-1` and is
rearmed after reconnect. Existing observers retain the deadline from the last
positive beat. Periodic pulses preserve the existing 8/15-second timeouts even
when server disconnect detection takes longer. Native member-presence registration
starts after room use; the independent cleanup clock observes RTDB info at online
initialization. Solo startup does not scan rooms.
Impressions alone opts out of that shared disconnect-marker write to avoid stale
connection overwrites during refresh; it retains heartbeat/grace cleanup. Its
explicit tab-session override does not change Darts or other games' identities.

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

### Release gates

Before publishing, preserve and review the complete working tree, including
untracked game modules, fixtures and static assets. Fetch and compare the release
branch before integrating shared Auth/room changes. Retain parallel changes such
as lazy SDK initialization, departure hooks and permissions for other games;
adding Impressions must not remove another game's room collection. Test the integrated
candidate, not just each branch separately.

Compare the **published** Firestore Rules, RTDB Rules and index configuration
with the reviewed candidate using authorized Console/CLI access. A Git diff only
compares repository versions; it cannot establish whether rules were published
manually. If access is unavailable, report deployment state as unverified rather
than requesting an unnecessary redeployment. Retain existing profile, feedback,
announcement and room permissions/indexes. Wait for required index changes to
finish before enabling dependent queries.

After approval, publish only required Rules/index changes, then commit/push the
reviewed website through the repository's configured GitHub Pages source. Check
the Pages build and actual served assets; a successful push alone is insufficient.
Verify Impressions, Darts, Beam and Rune Stones, plus any other changed game, with
fresh browser sessions. Include profiles, feedback and announcements when their
shared Auth/Firestore boundary changed. Follow
[Impressions analytics operations](impressions/ANALYTICS.md#tests-and-deployment) for the
separate upload/export check. Rules deployment, website publication and live
verification remain separately approved/reported actions.

This repository's Pages source is **Deploy from a branch: `main`, `/` (root)**.
GitHub runs the generated `pages-build-deployment` workflow; there is no local
website build step. Pushing `main` can publish automatically. A local commit does
not publish. Approve the complete release commit before pushing, then verify the
successful Pages run and actual served files for that commit.

For a machine without Firebase CLI credentials, run `npx firebase-tools login`
with an existing project-authorized Google account, then
`npx firebase-tools projects:list` to confirm access to `games-7e19b`. This login is
separate from game/browser Auth and does not deploy anything. Use Console or
authorized read-only APIs to compare active RTDB/Firestore Rules and indexes;
do not infer a missing deployment from Git history. ADC/IAM used by analytics
export is a separate credential, described in [analytics operations](impressions/ANALYTICS.md).

### RTDB security boundary

The current collection-level authenticated reads and room-level authenticated
writes are an honor-system policy. Anonymous Firebase users are authenticated:
they can enumerate allowed game collections and edit/delete another room, not
just their own seat. Metadata validation is not an ownership check, and `.validate`
does not run on deletes. Client transaction guards and the conservative cleanup
clock protect normal clients from races/skew; they cannot stop a malicious client
from issuing a direct write. These permissions do not grant access to Firestore
profiles or private feedback.

A small hardening option is to reject `lastActionAt > now + 5000` in the room
validation, using RTDB's server `now`. An emulator-only candidate has verified
ordinary server-timestamp writes, expiry queries and legacy presence-marker
writes alongside this bound. This option is **not applied to the checked-in
rules** and does not prevent enumeration, other-room mutation or deletion.
Compatibility/security review and approval are still required before adopting it.

Changing only the delete predicate to trust a mutable `hostUid` is insufficient
while arbitrary writes can replace that field or membership. Reliable access
isolation needs protected Auth-to-controller ownership and field-specific write
permissions compatible with shared settlement, host migration and frozen rooms.
That can be evaluated without a paid backend, but is a separate permission change;
do not claim the existing rules provide it. Public release must explicitly resolve
or accept this room-tampering risk. Test adversarial cases only in a demo emulator,
never by scanning/deleting real player rooms.

The initial Impressions release for friend playtesting retains this honor-system
policy with the project owner's explicit acceptance of its cheating and
cross-room mutation/deletion risks. The proposed access layer below is deferred;
do not describe the current rooms as isolated or server-authoritative.

### Proposed room access protection (not implemented)

The smallest viable direction is a **shared room admission/access layer**, not
server-authoritative scoring. Keep the existing room transaction path and game
reducers, but authorize writes using protected Firebase Auth ownership rather
than trusting `hostUid`, a controller-ID prefix or caller-supplied new membership.

- Put authorization records outside the writable room snapshot, for example
  `/roomAccess/<game>/<code>/<instanceId>`. A whole-room transaction must never
  grant permission to edit this sibling ACL. Bind a fresh room incarnation to its
  creator and verified human Auth/controller ownership; code reuse must not inherit
  old grants. Require the incarnation on existing-room writes and protect it from
  deletion/replacement. CPUs use their human owner's authorization.
- Existing verified members retain whole-room transactions for simultaneous
  answers, deadlines, settlement and host migration. A nonmember can only submit
  a constrained join request. An authorized seated client admits it through the
  existing lobby policy before the join transaction. Never allow an arbitrary
  caller to grant itself membership merely by knowing a code. Automatic admission
  can preserve the current public-room interaction; a legitimately admitted player
  is then trusted inside that room, including one who joined with bad intent.
- Keep ACL grants/revocations separate from ordinary game writes. Explicit Leave,
  stale-seat eviction and same-account multi-tab cases need per-controller grant
  tracking so one departure neither retains unintended access nor ejects another
  active tab. Room deletion/recreation, failed admission, concurrent joins and
  orphaned ACL/request cleanup need bounded, retry-safe lifecycle handling.
- Active whole-room deletion should require verified last-controller departure,
  not just a mutable host field. Unrelated clients may delete only a server-proven
  stale room after five minutes. Enforce server activity timestamps (while allowing
  unchanged timestamps for native presence-only disconnect writes); otherwise a
  forged old timestamp bypasses that expiry exception. Recheck expiry in Rules
  against current committed data as well as in the cleanup transaction.

This is a proposal, not audited rule code or a claim of current protection.
It changes the shared service/adapter, admission handshake, Rules and tests;
it does not require five independent game rewrites or a paid backend. Additional
ACL/request/grant traffic is concentrated at create/join/leave, not each answer or
physics tick. Exact traffic and implementation effort require a small emulator
prototype. Existing RTDB storage/download/connection quotas still apply.
Rules authenticate accounts, not browser locks: same-UID tabs share that security
principal. Per-controller bookkeeping preserves their lifecycle without claiming
cryptographic isolation between tabs signed into the same account. See
[Firebase pricing](https://firebase.google.com/pricing) for the existing quotas.

Rollout cannot silently secure legacy rooms that lack verified ownership. New
protected rooms need an explicit transport access version; frozen gameplay
protocols/scoring can remain unchanged. Choose either a coordinated refresh after
legacy rooms finish, or a time-limited legacy policy with its old risk clearly
accepted. Do not permanently permit an unprotected fallback, or let a client
downgrade a protected room. Old loaded clients will not automatically understand
the admission handshake. Deployment/migration remains a separate approval.

Before implementation approval, prototype the authorization boundary in the RTDB
Emulator. Required cases include outsider overwrite/delete and self-grant denial,
admission races, replayed grants after code reuse, revocation, same-account tabs,
Impressions refresh/owned CPUs, Darts multi-seat ownership, Beam spectators, Rune
forfeit, Trash Toss departure reasons, host migration, native disconnect and
heartbeat-versus-expiry deletion. Privacy/read-enumeration restrictions are a
separate decision; closing write access alone does not hide targets from readers.

Firebase's [cascading write permissions](https://firebase.google.com/docs/database/security/core-syntax#read_and_write_rules_cascade)
explain why a restrictive child `.write` cannot override a broad parent grant.
Use the [Rules API](https://firebase.google.com/docs/reference/security/database)
for concrete conditions; Rules `val()` on an object is not deep-object equality.

### Development-stage deployment policy

Firebase RTDB Rules may be deployed during development/testing when required.
The development stage is not itself a reason to defer deployment. Before a
rule deployment, validate security and backward compatibility with existing
games/room protocols and run the relevant local rules, shared-room, Darts and
Impressions regression tests. Report a breaking migration or security-sensitive
change before proceeding. Do not redeploy unchanged rules.

After a rule change, supplement local fixtures/emulator checks with real Firebase
Darts and Impressions room verification. Use isolated test clients/rooms, test only
those rooms and clean them up afterward. Do not use fixture SDKs or simulated
clocks for the live smoke test. Check create/join, readiness, shared deadlines,
independent accepted answers, scoring/HP, one settlement, rematch and leaving.

Reports must distinguish three separate actions: **Firebase Rules deployment**,
**website deployment**, and **verification against real Firebase**. Publishing
the website does not publish rules; successful local fixtures do not establish
that the deployed website/rules work together. State the tested website URL and
version, whether rules were changed/deployed, and whether tests used real
Firebase, local fixtures or physical devices.

The current website can run on **localhost against real Firebase** without a
push or website deployment. Verify that the local page and current modules load;
Impressions's [live test modes](impressions/TESTING.md#real-firebase-and-rules) use isolated
clients/rooms, real SDK/Auth/RTDB and normal deadlines, then remove their temporary
room and guest accounts. The explicit `--live` flag is required. The harness
disables unrelated stale-room cleanup and automatic production analytics.

Once published, also verify the actual deployed page. A missing public page
means that website verification is pending; it does not block localhost-to-real-
Firebase verification or imply that rules need republishing. Report the origin
(`localhost` versus a deployed URL) separately from the backend
(real Firebase versus a fixture).

### Configure RTDB in a new environment

Use the same Firebase project as the existing Auth/Firestore configuration.
Check **Realtime Database > Data** for the existing database URL; create a new
database in Locked mode only if no database exists. Publish the complete contents
of [`database.rules.json`](../database.rules.json) in **Realtime Database > Rules**.
This is separate from **Firestore Database > Rules**.

The supplied rules allow authenticated users, including existing anonymous guest
accounts, to use `/rooms/beam_rooms`, `/rooms/duel_rooms`, `/rooms/darts_rooms`,
`/rooms/trash_toss_rooms` and `/rooms/memory_rooms`. Publish
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

## Trash Toss rooms

Trash Toss reuses the Darts/shared room stack: Google/anonymous auth, four-code
entry, one tab identity per connection, captured session listeners, presence
counters, host-controlled start and preparation of the next match. Its own collection
is `trash_toss_rooms`, capacity is two humans, spectators are disabled. The guest
must ready up before the host starts. The room lobby has a host-controlled map
selector; the initial map may come from the offline selection but is editable
after room creation. Preparing the next match retains both players and the room
code, so another map does not require a new room. Scene changes clear readiness
and use a guarded room revision; guests must ready again. Mid-match map changes
are rejected. The UI keeps offline settings
locked while a room is attached. Results retain membership; the host presses Play
again to prepare the same room and open scene selection directly. The guest
readies again and the next start gets a fresh `matchId` and field. Player-facing
Trash Toss text uses Room rather than Lobby.

`js/games/trash-toss/room.js` is DOM-free; `js/games/trash-toss/online.js` uses the shared lobby,
adds its scene selector, and rebuilds visible lobby UI only when displayed
configuration/readiness/availability changes. Hidden lobby heartbeat snapshots
do not rebuild DOM. Trash Toss scopes its room styles with `tt-room-lobby`:
Ready/Start is a full-width primary action at least 56px high and first in DOM
and visual order; copy and leave are secondary, with at least 44px touch targets.
A disabled host action explicitly says it is waiting for opponent readiness.
The room `game` contains the accepted `match`, `seats`, `names`, `last[2]`,
`originAt`, `turnStartedAt`, `world`, `active`, `round`, `status` and `seq`.
`world` has an integer 60 Hz tick, debris and cleaning state. Statuses are `aim`,
`flight`, `over`. Authenticated membership and exact `matchId/round/status/seq`
transaction guards reject another seat, duplicate release, old match or old turn.
Only finite angles 15–80 and power 0–100 are accepted before the 12 s deadline.
The game remains a client-authoritative casual room, with the same trust limits
as existing games; this is not server-side anti-cheat.

On input release, the transaction takes a fresh shared clock reading and schedules
physical launch 400 ms ahead (quantized to the 60 Hz clock). This lead starts at
the current transaction calculation, rather than the original click timestamp,
so transaction retries do not consume the entire delivery allowance. It advances
the world/cleaning to that launch tick, runs the actual physics, and publishes the
accepted input, future launch time, outcome and resulting world. Projection keeps
actors and debris moving during the lead while the object remains in the hand;
launch occurs when the shared clock reaches `shot.at`. The object also stays
visible while the transaction is pending. A success acknowledgment does not unlock
another throw before the authoritative room sequence arrives. The controller invalidates
its paint budget on the first launched frame. This avoids skipping early flight
when event delivery fits within the lead. A reconnect or event delayed beyond the
lead still catches up to the common timeline rather than replaying an obsolete
turn or changing the score/deadline. This is a bounded synchronization allowance,
not an arbitrary-latency guarantee.
Both clients replay the accepted input from that same initial world at fixed
1/60 s steps with 1/240 s physics substeps. No frame stream or client-submitted
score is used. Cached projection catches a hidden tab up using the same steps.
The outcome boundary plus 0.45 s result pause advances to the next turn once;
any connected participant can commit that guarded boundary or a timeout. The
world and moving actors continue through aims/throws/results, without resetting
on A/B handoff. Both players share the round item/weight/weather. Last released
weight/wind references belong to each seat. Online bests use the owned seat's
first five regulation rounds in `online-<scene>-standard-v5`.

The shared network layer exposes `rooms.now()` using RTDB's
`.info/serverTimeOffset`; online release, deadline and replay use that clock.
Presence remains based on locally observed changing counters rather than remote
wall-clock timestamps. Polling every 250 ms performs only due boundary writes;
heartbeats keep the shared 3 s write throttle. After 15 s without a changed
counter, a live member transactionally rechecks/releases the missing peer. A
mid-match departure forfeits to the remaining seat, recording `left` for intentional
departure or `disconnected` for presence expiry; host migration follows the
shared service. Session detach invalidates old callbacks and page exit closes
owned listeners. Online play cannot be paused/restarted via the offline shell.
Transient watch/poll/throw errors show an inline message and permit reconnect or
retry, without opening the create/join panel. A deleted room and permission errors
open recovery with specific messages. See [the regression checks](trash-toss/ROOM-FIXES.md).

**Deployment:** `database.rules.json` adds `trash_toss_rooms` to the existing
RTDB collection allowlist. Publish this updated file in Firebase Console's
Realtime Database Rules tab before live creation/join tests. Shipping HTML/JS
or pushing Git does not publish these rules; `firebase.json` currently configures
Firestore only. The UI reports permission denial explicitly. This change does
not publish rules or alter the configured production project. Local native RTDB
fixture tests and real-page in-memory tests do not prove deployed authorization.
