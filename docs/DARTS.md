# Darts

The existing relative mouse/touch flick, release smoothing, ballistics and camera
remain in `js/games/darts.js`. `darts-rules.js` owns canonical dartboard results,
mode rules and immutable turn/leg/match transitions. `darts-room.js` supplies the
game policy for the existing `ArcadeNet.rooms` service and RTDB adapter.

## Modes and outcomes

- Practice: unlimited throws; D toggles the original gesture/trajectory diagnostics.
- Count-Up: solo or local/online 1v1; eight turns and at most 24 darts per player.
  Outer Bull scores 25 and inner Bull 50. Solo results include average per three
  actual darts, best round, Bulls and Triple 20s.
- 501: local/online 1v1, double-out including inner Bull. A negative remainder,
  remainder of one, or zero without a double immediately restores the turn's
  starting score and passes play.
- Cricket: local/online 1v1, 20–15 and Bull. Closing-dart excess marks score while
  the other player has that target open. Close all targets with at least as many
  points as the opponent to win.

Multiplayer/local matches support BO1 and BO3 (first to one/two leg wins). A
Count-Up draw awards no leg win and offers a replay with the starter alternating.
The leg counter includes drawn attempts, so a drawn BO3 can exceed three attempts.
Local solo Count-Up always plays one leg. The initial online starter is selected
from the room's random seed; subsequent legs alternate, including drawn legs.
Either player can continue from the persistent between-leg result screen.

## Online policy

Publish the updated **Realtime Database** rules from `database.rules.json` before
using this version online. The new group is `/rooms/darts_rooms/R-XXXX`; public
codes remain four characters. Firestore rules and shared room implementation do
not need changes. A website deployment does not publish Firebase rules.

The policy follows Rune Stones: two independent page seats, host Start after
guest Ready, 3-second piggybacked heartbeats, 15-second missing-peer release,
forfeit on departure, host migration and replacement players in the same room.
Host Rematch resets the same room and readiness; the guest readies again before
the next host Start. Opening the room panel during play does not pause a match.
Closing the result room panel leaves the room and restores the local ready screen.
Brief reconnects retain the seat and resume the authoritative snapshot. A released
page cannot enter or write a replacement match; it can join again explicitly.
As with the existing games, reloading creates a new page identity rather than
recovering the old page's seat; the old seat is released by presence handling.

Every throw is an `updateMatch` transaction guarded by match ID, monotonically
increasing turn `round`, revision `seq` and status. The transaction verifies the
active player, presentation gate and turn deadline before calculating a result
from the supplied flight and applying rules to the authoritative snapshot. This
prevents stale/double submissions and competing turn advances. Between-leg state
also counts as a running match, so it cannot be overwritten by Start/Rematch or
joined mid-match. This uses the existing honor-system access policy, not a new
server-authoritative anti-cheat implementation.

The default online turn is 60 seconds; creation settings offer 30/60/90 seconds.
Unused darts are forfeited on timeout; valid points already scored remain. Either
peer's watchdog can advance an expired turn once. The next player's deadline
starts after the previous flight/result presentation, giving a full turn to aim.
Deadlines follow the existing games' client wall-clock convention.

Accepted throws store one compact `lastThrow` event (flight, impact, canonical
result and sequence). Both clients animate the same trajectory and reveal the
committed scoreboard at impact. Rules are committed before presentation, so a
throttled/hidden tab does not control scoring correctness. Presence snapshots do
not replay a throw. No pointer samples or per-frame movement are networked.

## Verification

```text
node tools/darts-rules-check.js
node tools/darts-room-check.js
node tools/rooms-browser-check.js --darts
node tools/rooms-browser-check.js --darts --invalid-rtdb
```

The first two checks run without packages or network. The room check uses the real
room core, darts controller and RTDB adapter against the native-tree fixture,
including contention, timer races, reconnect/eviction, forfeit, rematch, full
Count-Up and a tied-leg replay. The browser check uses real pages, physics,
canvas, shared lobby and modules with only Firebase SDK imports redirected to
local fakes. It exercises practice, solo completion, online turn/leg/match flow,
opponent presentation, rematches, result closing, translations and 320/768px
layout. All game test hooks are injected by the local test server, never shipped
in the game page. These checks never access production Firebase; published-rule
authorization still needs the Firebase evaluator or a deployed two-tab check.
