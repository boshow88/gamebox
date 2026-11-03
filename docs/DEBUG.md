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
