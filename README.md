# GameBox

A single static site that hosts every game from the old **Arcade Games** and
**Puzzle Games** collections, browsable by **tags** instead of by collection.
Pure static HTML/CSS/JS — no build step, works offline, deployable on GitHub
Pages (same as the two sites it replaces).

## Layout

```
index.html            Unified launcher (tag-driven game picker)
css/launcher.css      Launcher theme (a neutral "hub" — distinct from both collections)
js/launcher.js        Game manifest (GAMES) + tag taxonomy (TAGS) + render + filter
favicon.svg           GameBox mark
arcade/               The former Arcade Games repo, verbatim (dark neon theme)
  index.html          Redirects up to the launcher
  games/*.html        One page per game (Back → ../../index.html)
  js/ css/ ...         Its own common.js (ArcadeCommon), firebase-config.js, net/, firestore.rules
puzzle/               The former Puzzle Games repo, verbatim (light theme)
  index.html          Redirects up to the launcher
  games/*.html        One page per game (Back → ../../index.html)
  js/ css/ tools/ ...  Its own common.js (PuzzleCommon), generators/, dev tools
```

Each collection keeps its **own** `common.js` / `common.css` / `game.css`, so
both designs (Arcade dark, Puzzle light) are preserved exactly — the launcher
does not touch them. The only edits made during the merge were: each game
page's Back link (`../index.html` → `../../index.html`) and the two collection
`index.html` files (now redirects to the launcher).

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

1. Put the game page + assets under `arcade/` or `puzzle/` (whichever theme it
   uses). Make its Back link point to `../../index.html`.
2. Append one entry to `GAMES` in `js/launcher.js` with `id`, `href`, `icon`,
   `color`, and its `tags` array.
3. Add that game's `*_name` / `*_tagline` / `*_body` strings (EN + 中) to
   `STRINGS` in the same file.

Nothing else needs editing — the launcher renders cards and the tag bar from
`GAMES`. Because adding a game is an **append**, two people adding different
games rarely conflict.

## Run locally

```powershell
# from this folder
python -m http.server 8000
# then open http://localhost:8000
```

## Deploy on GitHub Pages

Settings → Pages → Source: `main` branch, `/` (root). All paths are relative.
The online PvP in Rune Stones uses Firebase; its authorized domains are
domain-level (`boshow88.github.io`), so sign-in keeps working on the new path.
