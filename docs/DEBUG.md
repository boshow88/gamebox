# Debug & dev affordances

A running list of the non-shipping dev surface in the project.

The per-game debug / demo **URL flags** (`?hashi_debug`, `?sudoku_demo`,
`?patches_demo`, `?patches_debug`, `?queens_debug`, `?zip_debug`, and the arcade
`?debug=1` overlay / cheat console) have all been removed — no `[DEBUG-HOOK]`
URL flags remain in the code. The `*Internals` generator exports below are kept
because the `tools/` self-test pages depend on them.

## Dev tools (`tools/`)

Standalone pages, not linked from anywhere in the app (no nav points at them),
loaded manually by opening the file. Safe to ship, but they are dev surface:

| Tool | Purpose |
| --- | --- |
| `tools/queens-solver-trace.html` | Step through the Queens generator/solver and inspect each deduction + score. |
| `tools/sudoku-solver-trace.html` | Step through the Sudoku solver technique-by-technique on a generated/seeded puzzle. |
| `tools/tango-solver-trace.html` | Step through the Tango solver's deductions one at a time. |
| `tools/patches-solver-trace.html` | Step through the Patches solver (single / core) on a generated puzzle; `?tech=core\|tier3\|commit` auto-jumps to that hint. |
| `tools/patches-gentest.html` | Self-test: drives the real `generate()` a few seeds per size/tier — checks solvability + soundness, that medium lands in its hardness window, that median hardness climbs (easy ≤ medium ≤ hard), and reports tiling-density stats. |
| `tools/patches-hintfix.html` | Self-test: hint soundness + full solve walkthrough, plus the no-leak and forced-cell-merge regressions. |
| `tools/zip-gentest.html` | Self-test: drives the real `generate()` across sizes/tiers — checks each solution is valid + unique (cross-validated against an independent cell-based counter on small N) and that base checkpoint density is monotonic; reports checkpoint/wall counts + timing. |
| `tools/nonogram-gentest.html` | Self-test: drives the real `generate()` across sizes/difficulties — checks each board is line-solvable and **unique** (cross-validated against an independent DFS solution counter), that the clues match the solution, that the difficulty score climbs (easy ≤ medium ≤ hard), and that tier-3 (enumeration) reliance is non-decreasing; reports the per-difficulty technique profile (n1/n2/n3), median depth, score + timing. |
| `tools/nonogram-hintview.html` | Visual check for Nonogram hints: renders generated boards with the first `nextStep` hint drawn (row/column clue ranges + fills/blanks) using the real board geometry so the hint overlay can be eyeballed. |
| `tools/guards-gentest.html` | Self-test for Guards (Akari / Light Up): drives the real `generate()` across sizes/difficulties — checks each shipped solution is valid, is **unique** (independent backtracking counter) and solvable at its difficulty's depth (Easy/Medium by pure propagation, Hard by one assume→contradiction step), that Hard genuinely needs that step, and that the shown-clue count is monotonic (Easy ≥ Medium ≥ Hard); also sweeps larger sizes for timing + never-blank. |
| `tools/hashi-gentest.html` | Self-test for Hashi (Bridges): drives the real `generate()` across sizes/difficulties — checks each shipped solution is valid, is **unique** (solver counter cross-validated against an independent brute-force counter on small boards), is solvable within its difficulty's reasoning budget and **hint-drivable** (the `nextStep`/`nextStepDeep` engine solves it from empty), that island numbers are within capacity, and that difficulty tier is monotonic; reports island counts + timing. |
| `tools/hashi-view.html` | Visual check for Hashi rendering: draws a generated board solved (single/double bridges), won (green), with a hint band + ghost, and a conflict (crossing bridges + over-filled island) — reuses the real CSS classes to eyeball the board vocabulary. |
| `tools/hashi-hintview.html` | Visual check for Hashi hints: finds a board state that surfaces a grounded deduce hint (e.g. "one short of full") and a Hard assume→contradiction walk-through, then renders each with its anchor rings, ghosts and numbered chain so the hint vocabulary can be eyeballed. |

## Room checks

```text
node tools/rooms-check.js
node tools/room-traffic-check.js
node tools/beam-room-check.js
node tools/rune-room-check.js
node tools/rtdb-room-check.js
# Optional: real Chrome pages with a local fake Firebase SDK
node tools/rooms-browser-check.js
node tools/rooms-browser-check.js --invalid-rtdb
```

For Darts-specific commands and coverage, see [Darts checks](#darts-checks).

The core check uses the actual RTDB adapter and a serialized native-tree fixture
for contention, capacity, policies, authority, subscription lifetime and cleanup.
Game checks execute both games' actual handlers with DOM/drawing stubbed, covering
independent tabs, spectators, host-controlled starts, readiness resets, departures,
host migration, rematches, result closing, vanished rooms and single settlement.
The core check also covers opt-in all-ready starts. Controlled clocks cover presence,
recovery before eviction and native disconnect/reconnect.

The optional browser check loads the real pages, modules and shared UI. It covers
creation, joining, starts, results, rematches, rejoining, input preservation,
320px/768px layout and Beam solo settlement. Firestore stubs reject room access;
profile reads/writes still work even with invalid RTDB settings. All SDK calls
are redirected locally; these checks never access production Firebase. Pass a
Chrome executable as the first argument if the Windows default path is unavailable.
Rules JSON is checked locally, but server-side authorization still requires the
Firebase rule evaluator or a live-project check after publishing rules.

## Darts checks

```text
node tools/darts-rules-check.js
node tools/darts-room-check.js
node tools/darts-feedback-check.js
node tools/darts-hud-check.js
node tools/rooms-browser-check.js --darts
node tools/rooms-browser-check.js --darts --invalid-rtdb
```

The four Darts module checks run without packages or network. The rules check covers
Open/Master/Double In and Out, whole-turn score/entry rollback, physical Bull
identity under 25/50 and 50/50 scoring, Standard/Cut-Throat recipients and wins
(including a non-throwing winner), per-participant round limits, score settlement
and Cork distances/repeated ties. It also covers unlimited single/multiple-player
Practice, first-to-1/2/3 Leg progression, history retention and atomic controller
departures. The real gesture/ballistics functions still run against their golden
velocities and deterministic pitch-rotation checks.

X01 expansion checks preserve the old 501 scenarios and cover all six starting
scores across every In/Out combination, automatic defaults versus explicit caps,
all expanded round choices and equal opportunities. Opening Cork is exercised
with 2/3/4 players, tied retries, timeouts, controller departures, unchanged normal
statistics and later-Leg rotation. Direct X01 limit Cork includes all contenders
regardless of prior scores; numeric ties retain the existing tied-leader Cork.

The Cork coverage audit found existing exact-distance/tolerance rethrows and a
four-controller opening tie. Additional deterministic cases now cover all three
purposes with 2/3/4 players: a tolerance tie, a second exact tie and a decisive
third round. Only tied players rethrow and normal scoring data stays unchanged.
Room cases exercise each purpose with four remote controllers, excluded-owner
rejection, stale-round guards and concurrent duplicates accepted only once.

The feedback check covers same-device ownership transitions, fresh confirmation,
stale confirmations after timeouts, snapshot/event deduplication, actual accepted
penalty recipients, Bust-to-handoff sequencing and result priority. The HUD check
uses accepted rule transitions for the Leg/Match victory-reason matrix, every
mode's cap, tied-score Cricket closures and Cork distance, plus restored Bust
scores/history and penalty effects that expire without discarding accepted data.
Final-impact checks hold the accepted finished state while showing its last hit,
expire without replay, reject scoring/timeout after completion and clear on reset.

The room check uses the actual room core, Darts policy and RTDB adapter against
the native-tree fixture. It exercises separate controllers and player slots,
one- and multiple-slot ownership, same-device and mixed-device matches, capacity,
configuration/Ready races, locked match snapshots, rejected impersonation and
duplicate throws, timers including Off, full Count-Up, Cut-Throat penalties,
same-code mode switching, retained results/history and reconnect/eviction with
host transfer. Host-only invitation scenarios keep four slots and two Legs local
across 120 throws without changing the stored scoring sequence, skip the network
turn watchdog, and upload finished history once on Return to Lobby. They reject
altered ownership/rules and duplicate boundary writes, retain the invitation,
and select shared execution after another device joins the next match. Default
numbered names remain distinct after seat removal. The check also covers older
room values starting a normalized match.

The browser check also exercises Google account display-name defaults without
starting local matchmaking, account changes deferred until the lobby, preserved
custom names on invitation creation, and sign-out clearing the name hint.

The browser check loads real pages, physics, canvas, the unified lobby and modules
with only Firebase SDK imports redirected to local fakes. Its V2 scenarios live
in `tools/helpers/darts-browser-v2.js`, injected by the local server; game test
hooks are never shipped in the production page. Scenarios cover immediate
offline Practice/Count-Up without loading networking, mode minimums, promotion
preserving local slots, two players per device, four remote controllers,
Ready invalidation, ownership, match locking, results and another mode in the
same room. The lobby uses one Room toolbar entry, with invitations inside it,
and explains the currently selected rules and valid player count. History
scenarios exercise player/all filtering, independent scrolling,
live-update anchor preservation, modal input blocking and focus restoration.
Invalid-backend checks leave local Practice and account profiles working.

Gameplay UX cases cover four-slot handoffs at small mobile sizes, blocked bottom
panel gestures, confirmation without throwing, stale releases/clicks across
timeouts, and continued countdowns. Mixed-device turns require confirmation only
between two slots on that device. Accepted impacts show actual Cut-Throat changes
for 3/2/1/0 opponents without heartbeat replay; Bust restores the accepted score
and retains history. Result reasons are checked in EN/ZH. Room-loss fallback keeps
a pending local handoff, while a timeout superseding a flight suppresses its stale
scoring effects.

Expansion browser cases check actual X01 variant labels, all caps, explicit cap
preservation, independent Cork controls, frozen settings and Ready resets. Local
opening Cork covers 2/3/4 slots; mixed-device Cork uses actual accepted flights.
Decisive X01/Cricket/Count-Up/Cork impacts show their hit for one second before
the result appears, on both clients when shared. Expanded advanced settings keep
Start/Ready reachable on small mobile viewports.

Cork clarity checks verify context-specific entry/rethrow notices, handoff-first
queuing, current eligibility and retained comparison distances on mobile/desktop.
Status checks measure real overflow, inspect the paused-endpoint animation,
confirm no animation for fitting text and test resize/language/state resets.
Reduced-motion checks disable movement while preserving the accessible full-text
popup. Fixed region bounds, timer/control separation and page horizontal overflow
are checked at 320x568, 390x844 and desktop sizes in EN/ZH.

Lobby checks keep the header/footer visible at every content scroll position
with four players and expanded rules at 320x568, 390x844 and 1200x420. They verify
mode-aware Start/Starting/Ready/waiting labels, minimum-player reasons, per-device
readiness counts and cancellation, and matching compact/detailed rule summaries.
A simulated visual viewport resize/offset checks name editing with a keyboard-sized
visible area; this does not automate a physical mobile keyboard.

Layout checks compare board/player/mode bounds before and after Start and across
modes at 320/390/768/1200px. They cover four-player Cricket, visible dart counters,
player HUD drags that must not throw, and board/bottom-panel gestures that must.
Optional screenshot checks write ignored artifacts to `.cache/darts-mobile.png`
and `.cache/darts-desktop.png`:

```text
node tools/rooms-browser-check.js --darts-mobile
node tools/rooms-browser-check.js --darts-desktop
```

These checks never access production Firebase; published-rule
authorization still needs the Firebase evaluator or a deployed two-tab check.

## Birthday checks

Run from the repository root:

```text
node tools/birthday-check.js
node tools/birthday-browser-check.js
node tools/birthday-browser-check.js --reduced-motion
node tools/birthday-settings-browser-check.js
```

The Node check covers dates, directional wind/recovery, profile caching and
account-switch safety. The Chrome checks use actual pages with fake accounts,
profile writes and a fixed local clock. They verify birthday entry, candle
controls, completion/repeat behavior, midnight expiry, manual settings and the
absence of an anytime entry or birthday-eligibility bypass. They use no real
Firebase data. Browser checks require Chrome and Node 22+.

For a real local test, serve the site with `python -m http.server 8000`, sign in
normally, and open **Menu > Personalization**. Save today's month/day. The entry
updates immediately behind settings; automatic entry waits until the dialog closes.
A different date, deleted/missing date or signed-out account must hide the entry
and prevent direct ceremony access.
Changing settings does not require Google birthday permissions or Console changes.

To repeat a complete first-entry test on the same day, remove the current
account/date's `entered` and `completed` keys from **both** localStorage and
sessionStorage, then reload the homepage. The key formats and data flow are in
[DEV.md](DEV.md#birthday-personalization). Removing only `entered` restores the
automatic redirect while preserving completed-proceedings wording. Normal use
does not reset markers when the birthday field changes. Localhost and the deployed
site, different browsers and different devices have independent marker storage.

## Ungated console logging

Not behind any flag — plain defensive/dev `console.warn` / `console.log` that
fires in normal runs. Nothing here changes behaviour, but strip/quiet it if you
want a silent console. Find them with `rg "console\.(log|warn)"`. Current spots:

- `js/generators/tango.js` — row-rejection budget exhausted; "returning unverified".
- `js/games/queens.js` — a solver-state warning.
- `js/games/rune-stones.js` / `js/games/beam.js` — `[duel]` / `[lobby]` network errors.
- `js/net/net.js` — `[ArcadeNet]` disabled on boot (missing/invalid config) and stale-room cleanup failures.
- `js/puzzle.js` / `js/arcade.js` — `[common]` storage read/write + `[i18n]` subscriber failures (plus, in the arcade shell, an `[input]` press-handler guard).

## Cleanup checklist

When preparing a release build:

1. `rg "console\.(log|warn)"` and quiet anything you don't want shipping.
2. Decide whether to ship or drop the `tools/` pages.
3. Update this file.
