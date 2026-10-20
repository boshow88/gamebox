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

## Accounts & cloud sync

Sign-in is **Google-only**, via `ArcadeNet` (`js/net/net.js`), surfaced globally on
the launcher. One shared engine — `js/cloud-sync.js` (`window.CloudSync`) — does
everything; it loads on the launcher and every arcade game (right after `net/net.js`).

- **Cloud is the source of truth for an account; the live keys are a working copy.**
  Only the **guest** identity is cached locally (a single "guest drawer"). On sign-in
  CloudSync stashes the guest's live records, **clears the live keys** (so guest
  scores can't bleed into the account), then pulls the account from the cloud; on
  sign-out it brings the guest drawer back. Accounts are never mirrored to a local
  drawer. Signing in on the launcher syncs **all** games at once.
- **Descriptors** (in `cloud-sync.js`) define each record family: how to read/write
  its slice of the game's own localStorage, how to merge two record objects (per
  field **max** for scores, **min** for ranks/rounds), and how it maps to the profile
  doc. Everything nests under `games.<id>`: generic high scores
  (`games.<game>.bests[<mode>]`), Beam ranks (`games.beam.ranks[<notch>]`), Rune
  Stones Sandbag (`games.rune-stones.sandbag[<level>]`).
- Sync only **monotonic bests** (a max or a min). Cumulative counts (plays, wins)
  stay device-local — they don't merge cleanly.
- **Guest → account** is a per-game **claim** (move, not copy), offered only at the
  moment of signing in and only for games the account doesn't have yet but the device
  does. Accepting merges just those games in, pushes, and drops them from the guest
  drawer; games the account already has are left in the drawer untouched. Because
  "already has the game" is the gate, a game is claimable into a given account **at
  most once**. Declining or ignoring the prompt just waits until the next sign-in.
- Games stay out of it — they just `CloudSync.onApplied(repaint)` and call
  `CloudSync.sync()` after writing a new best. Everything is guarded, so **guests and
  offline play are unaffected**.
- A game that syncs must load `firebase-config.js` + `net/net.js` + `cloud-sync.js`,
  and `firestore.rules` must allow `profiles/{uid}` for its owner.
- **Sign-in needs an authorized https domain.** Google OAuth uses a **popup on every
  platform** — a full-page redirect would need the app and Firebase's `authDomain` to
  share an origin, which GitHub Pages can't do, so browsers' cross-site storage
  partitioning silently drops the redirected session. It only works on a domain in
  Firebase's *Authorized domains* over https — i.e. `localhost` or the deployed site.
  A phone hitting a LAN-IP `http` dev server **can't** sign in (the popup flashes and
  vanishes); test sign-in on the deployed site or an https tunnel.

## Git & local dev

- Shell commands here are PowerShell: chain with `;`, not `&&`.
- Work ships to the protected `main`. If the remote has moved, `git pull --rebase`
  before pushing.
