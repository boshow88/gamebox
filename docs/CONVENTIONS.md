# Conventions & house style

Shared rules of the house for this repo, so separate games stay consistent and a
few hard-won gotchas don't get lost. Read this before adding a game or a shared
feature.

## Project shape

- **Static, no build step.** Plain HTML/CSS/vanilla JS, served as-is. Run locally
  with `python -m http.server 8000`.
- Each game is: one page in `games/<id>.html`, its UI in `js/games/<id>.js`, and
  (for puzzles) a generator in `js/generators/<id>.js`.
- Two shared **shells** carry everything common to a collection:
  - `js/puzzle.js` → every puzzle game (`data-theme="puzzle"`).
  - `js/arcade.js` → every arcade game (`data-theme="arcade"`).
  Fixing a shell fixes every game of that type; there is no lower shared JS layer,
  so cross-cutting behaviour that must exist in *both* collections has to be
  mirrored in both shells (and noted here).
- The launcher (`index.html` + `js/launcher.js`) is data-driven: add a game by
  appending one entry to `GAMES` plus its strings.

## iOS double-tap-to-zoom

iOS Safari does **not** reliably honour CSS `touch-action` for double-tap-to-zoom
— it ignores it outright on `<svg>` and `<canvas>`. So `touch-action: manipulation`
on `body` (set per theme in `css/common.css`) is not enough on its own.

Both shells therefore run a small JS guard that cancels the quick second
`touchend` (killing the zoom and its synthesised click) and re-dispatches a real
`click` so buttons/cells still fire:

- `js/puzzle.js` — scoped to the SVG board.
- `js/arcade.js` — at the document level (covers the canvas stage, HUD and overlay
  buttons).

**If you add a new shell or a standalone interactive page, add the same guard.**
Keep the two copies in sync.

## Staged settings & live preview

Difficulty / size pickers **stage** a change rather than apply it at once — the
running game isn't regenerated until the player commits (puzzle: *New Game*;
arcade: *Start*). While a change is staged, show a live **"current → pending"**
readout so the player sees what's running versus what they've picked, and that it
hasn't taken effect yet:

- Update on the control's `input` event (live while dragging), not `change`.
- When staged equals applied (nothing pending), show the plain value.
- When they differ, render `current → pending` — e.g. `9×9 → 11×11` or
  `Normal II → Hard I` — with a `pending` class; style the current value muted,
  the arrow fainter, and the pending value in the game colour.
- Make the readout granular enough that **every** step previews a change (e.g.
  Beam shows a Roman-numeral sub-step within a tier, so same-tier moves still read
  as a change).

Reference: `js/puzzle.js` → `syncSizeButtons` (`.size-readout`), and
`js/games/beam.js` → `syncDiffControl` (`.diff-readout`).

## Icons

- **DOM icon registries** (`js/launcher.js`, `js/puzzle.js`, `js/arcade.js` → their
  `ICONS` objects) are keyed by the Lucide icon name and hold the icon's inner SVG
  verbatim where possible.
- **Canvas icons** (e.g. Rune Stones' runes/UI in `js/games/rune-stones.js`) store
  the Lucide path fed to `Path2D`. Every entry records its source in a comment:
  - `// lucide: <kebab-name>` — the Lucide icon verbatim (re-fetch/verify at
    `lucide.dev/icons/<name>`).
  - `// lucide: <name> (modified)` — that icon, hand-edited.
  - `// custom` — hand-drawn, no Lucide equivalent.
  Keep the annotation accurate whenever an icon changes — it's the only way to tell
  later what a path actually is.

## Language & copy

- **Player-facing text** lives in the i18n tables (English + Traditional Chinese).
- **Code comments and docs are English.** Chinese appears *only* in player-facing
  content — never in comments, identifiers, or internal docs.

### House style for copy

- Calm, rational, concise, tidy. When in doubt, say less.
- Don't narrate self-evident UI (e.g. "filter by tag", "tap to play"). Prefer a
  confident identity line over an instruction.
- Keep each game's in-game copy in the same voice as its siblings.
- No emoji unless explicitly requested.

## Git & local dev

- Shell commands here are PowerShell: chain with `;`, not `&&`.
- Work ships to the protected `main`. If the remote has moved, `git pull --rebase`
  before pushing.
