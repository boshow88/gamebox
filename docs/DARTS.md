# Darts

The existing relative mouse/touch flick, release smoothing, ballistics and camera
remain in `js/games/darts.js`. `darts-rules.js` owns canonical dartboard results,
mode rules and immutable turn/leg/match transitions. `darts-room.js` supplies the
game policy for the existing `ArcadeNet.rooms` service and RTDB adapter.
`darts-hud.js` maps shared state into player/turn/mode presentation data and renders
the components; responsive composition lives in `css/darts.css`.
`darts-history.js` owns the accessible, scrollable player/all-player history dialog.

## Gameplay viewport

The same fixed viewport holds essential gameplay information in every mode.
Above 760px, players occupy the left column, the board the centre and the mode
panel the right. At narrower widths, a compact 2x2 player summary sits above the
board and the mode panel sits below it. The mobile viewport is portrait (3:5),
desktop is landscape (3:2). The page header stays visible and the game fits in the
remaining screen height from the initial ready screen onward. Start/Restart do
not hide page sections, change viewport geometry or force a scroll. Settings,
rules/help and detailed post-leg statistics live in a Settings dialog available
from the persistent game toolbar. No mobile/desktop scoring branches are needed.

Panel bounds stay constant across Practice, 501, Cricket and Count-Up. Primary
scores appear only in the player summary. The mode panel shows three individual
turn darts and subtotal, Cricket's seven-row mark matrix, or practice release
feedback. Numbered/coloured seats link four-player marks to the player summary
without long names in table headers. Current player, dart, mode, leg/round and
optional timer remain visible. Completed turns retain their three results under
an explicit "Last turn" label until the next player throws.

Pointer-downs in `#throw-surface` or `#mode-panel` can begin a throw, allowing a
mobile flick to start below the board. Buttons, links, inputs, player cards and
result overlays keep normal interaction. History/Settings dialogs block throwing
behind them; history scrolling uses native vertical touch scrolling. Movements
and releases can continue across the window. Secondary pointers are ignored and
resize cancels a gesture. The
renderer is cropped around the existing board centre, without changing gesture
maths, tuning or ballistics. Backing resolution follows its display size. Detailed
Count-Up statistics are expandable after a leg inside Settings.

## Throw history

Click a player card for that player's records, or History for the entire roster.
The dialog filters by player and shows newest turns first: leg, per-player round,
three individual hits, effective turn points, resulting score, and bust/checkout/
timeout/departure/in-progress status. Reading history does not pause an online
turn; a visible note explains this while its timer is running.

Rules maintain `game.history` and `game.historyDropped` in the same guarded
transaction as scoring. Each turn is appended once and updated as its darts land;
rejected or duplicate submissions cannot create extra records. History survives
leg changes and brief reconnects, but a new match/rematch clears it. Departed
players keep their names through the existing match roster. Practice records
landed throws in local session memory. There is no profile or permanent archive.

To bound RTDB room payloads, retain the latest 500 turns per match, or 500 throws
in Practice. A visible notice appears if older records were trimmed. An open
history dialog refreshes without resetting its filter, focus or the visible row
when new records arrive. Native modal focus trapping, Escape/Close and restored
player-card focus support touch and keyboard use. Game shortcuts do not propagate
out of these dialogs.

## Modes and outcomes

- Practice: unlimited throws; D toggles the original gesture/trajectory diagnostics.
- Count-Up: 1–4 local or 2–4 online players; eight turns and at most 24 darts per player.
  Outer Bull scores 25 and inner Bull 50. Solo results include average per three
  actual darts, best round, Bulls and Triple 20s.
- 501: 2–4 local/online players, double-out including inner Bull. A negative remainder,
  remainder of one, or zero without a double immediately restores the turn's
  starting score and passes play.
- Cricket: 2–4 local/online players, 20–15 and Bull. Closing-dart excess marks score
  once while any remaining opponent has the target open. Close all targets with
  at least as many points as every remaining opponent to win. Withdrawn players
  do not block scoring or victory.

Multiplayer/local matches support first to one/two leg wins. First to two is BO3
with two players; with four players it can take five decisive legs, so the UI uses
"First to 2 legs" rather than promising a maximum of three. A Count-Up draw awards
no leg win and offers a replay for all remaining players. The leg counter includes
drawn attempts.
Local solo Count-Up always plays one leg. The initial online starter is selected
from the room's random seed; subsequent legs rotate through remaining players,
including drawn legs.
Either player can continue from the persistent between-leg result screen.

## Online policy

Publish the updated **Realtime Database** rules from `database.rules.json` before
using this version online. The new group is `/rooms/darts_rooms/R-XXXX`; public
codes remain four characters. Firestore rules and shared room implementation do
not need changes. A website deployment does not publish Firebase rules.

The policy uses four independent page seats, host Start after all guests Ready,
3-second piggybacked heartbeats, 15-second missing-peer release and host migration.
The room remains `waiting` while gathering 2–4 players, then changes to `playing`
on Start. A departure skips that player and retains the running match while 2+
remain; the last player wins by forfeit. Departed players stay in the match HUD
with a muted "Left" indicator, and names are retained in the room's match roster.
Replacement players can join after a rematch reset, not during a running leg/match.
Host Rematch resets the same room and readiness; guests ready again before
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
in the game page. Four-client checks cover readiness, turn rotation, host migration
and continued play after departure. Stress tests compare exact board/player/mode
panel bounds across modes at 320/390/768/1200px, including four-player Cricket and
HUD drags that must not initiate throws. Optional screenshot checks write ignored
artifacts to `.cache/darts-mobile.png` and `.cache/darts-desktop.png`:

```text
node tools/rooms-browser-check.js --darts-mobile
node tools/rooms-browser-check.js --darts-desktop
```

These checks never access production Firebase; published-rule
authorization still needs the Firebase evaluator or a deployed two-tab check.
