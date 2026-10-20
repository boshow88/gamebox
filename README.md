# GameBox

A single static site that hosts every game from the old **Arcade Games** and
**Puzzle Games** collections, browsable by **tags**. Pure static HTML/CSS/JS —
no build step, works offline, deployable on GitHub Pages.

"Arcade" and "Puzzle" are **no longer folders or separate sites** — they are
just a **theme**, chosen per page with `<body data-theme="arcade">` or
`<body data-theme="puzzle">`. Everything lives in one flat tree.

## Layout

```
index.html            Unified launcher (tag-driven game picker)
favicon.svg           GameBox mark
firestore.rules       Firestore security rules (Rune Stones online PvP)
css/
  common.css          Shared base + BOTH themes, scoped under [data-theme="…"]
  launcher.css        Launcher-only hub theme
  arcade.css          Arcade game-page chrome (HUD, canvas stage, overlay)
  puzzle.css          Puzzle game-page chrome (board, cells, hints, keypad)
js/
  launcher.js         Game manifest (GAMES) + tag taxonomy (TAGS) + render + filter
  arcade.js           Arcade engine (window.ArcadeCommon: loop, input, audio, scores, shell)
  puzzle.js           Puzzle engine (window.PuzzleCommon: timer, generate, undo, share, shell)
  firebase-config.js  Public Firebase web config (online PvP)
  net/net.js          Firebase room layer (window.ArcadeNet)
  cloud-sync.js       Cross-device high-score sync (window.CloudSync)
  games/*.js          One module per game (logic + rendering)
  generators/*.js     Puzzle generators & solvers
games/*.html          One page per game (all 13, each sets <body data-theme="…">)
tools/*.html          Puzzle dev tools (generators/solvers test harnesses)
docs/
  rules.md            Full player-facing rules for every game (merged)
  DEV.md              Arcade engine architecture & conventions
  DEBUG.md            Puzzle generator/solver debug notes
```

## Themes

Both palettes live in `css/common.css`, scoped so they never clobber each
other. A game page loads `css/common.css` + its chrome file
(`css/arcade.css` or `css/puzzle.css`) and declares one attribute:

```html
<body data-theme="arcade">   <!-- dark neon -->
<body data-theme="puzzle">   <!-- light -->
```

The language choice (EN/中) is stored under the shared key `gamebox:lang`, so
it carries across the launcher and every game.

## Tags

The launcher classifies games with a 7-tag taxonomy (a game can have several):

| Tag | When to check it |
| --- | --- |
| `puzzle` 益智 | Core fun is solving / thinking the next step (speed-independent). |
| `action` 動作 | Needs hand-eye coordination, dodging, or timing — real-time input. |
| `casual` 休閒 | Very simple rules + no failure pressure + light + one-hand play. |
| `progression` 成長 | Has an earn/collect ➡ buy/upgrade/unlock loop (high scores don't count). |
| `timeattack` 計時 | A **countdown** timer that affects win/score (a count-up stopwatch doesn't count). |
| `single` 單人 | Playable solo. |
| `multi` 多人 | Supports 2+ players, same-screen or online. |

A tag with **zero** games is auto-hidden from the filter bar (so `casual` and
`progression` stay defined for future games without showing an empty category).

## Adding a game

1. Drop the game page at `games/<id>.html` with `<body data-theme="arcade">`
   or `"puzzle"`, a Back link to `../index.html`, and `<link>`/`<script>`
   paths pointing at `../css/…` and `../js/…`. Put its module at
   `js/games/<id>.js` (and any generator at `js/generators/<id>.js`).
2. Append one entry to `GAMES` in `js/launcher.js` (`id`, `href`, `icon`,
   `color`, `tags`).
3. Add that game's `*_name` / `*_tagline` / `*_body` strings (EN + 中) to
   `STRINGS` in `js/launcher.js`.

Adding a game is an **append**, so two people adding different games rarely
conflict on shared files.

## Run locally

```powershell
python -m http.server 8000   # then open http://localhost:8000
```

## Deploy on GitHub Pages

Settings → Pages → Source: `main` branch, `/` (root). All paths are relative.
Rune Stones' online PvP uses Firebase; its authorized domains are domain-level
(`boshow88.github.io`), so sign-in keeps working.
