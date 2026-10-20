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
