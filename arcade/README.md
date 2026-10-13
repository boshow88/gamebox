# Arcade Games

A small collection of fast, pick-up-and-play arcade games.
Pure static HTML/CSS/JS — no build step, works offline, deployable on
GitHub Pages. Sibling project to [Puzzle Games](https://github.com/boshow88/Puzzle-Games).

Every game here is built to the same brief: real-time input, some kind
of countdown / speed / rhythm pressure, a score / time / combo to chase,
simple rules you grasp in seconds, short repeated play, and instant
retry.

## Status

| Game           | Status   | Notes                                                               |
| -------------- | -------- | ------------------------------------------------------------------- |
| Colour Ladder | Playable | Real-time ghost-leg: move colour-gated rungs to route colour balls into baskets |
| Bullet Storm   | Playable | Omnidirectional bullet-dodge survival; relative-drag control, lasers & homing, score = survival time |
| Rune Clash     | Playable | Two-phase orb-spinning versus match — raise shields, play cards, then spin to break the rival's shields. Vs a real-spinning computer opponent (Easy/Normal/Hard) or online by room code; best = fewest rounds to beat the computer |

Full rule reference: [`docs/rules.md`](docs/rules.md).
Architecture & dev notes: [`docs/DEV.md`](docs/DEV.md).

## Layout

```
index.html                 Launcher (game picker)
games/colour-ladder.html   One page per game
css/                       common.css (theme tokens + launcher), game.css (shared arcade game UI)
js/                        common.js (ArcadeCommon: storage, scores, loop, input, audio, i18n, shell)
                           + js/games/*.js (per-game logic + canvas rendering)
docs/rules.md              full rule reference
docs/DEV.md                architecture, conventions, how to add a game, tuning knobs
```

`ArcadeCommon` (in `js/common.js`) provides the shared plumbing:
local storage + high scores, a mulberry32 PRNG, a fixed-timestep game
loop, keyboard input, a tiny WebAudio blip synth, EN/中 i18n, a toast,
and an arcade **shell** that owns the idle → playing → paused → over
lifecycle plus the start / pause / game-over overlay.

## Controls

- **Start**: overlay button, or `Space` / `Enter`
- **Pause**: `P` / `Esc` · **Restart**: `R` · **Mute**: `M`
- Per-game controls are listed in each page's *How to play* footer.

## Run locally

```powershell
# from repo root
python -m http.server 8000
# then open http://localhost:8000
```

Because everything is relative and framework-free, opening
`index.html` directly (file://) also works.

## Deploy on GitHub Pages

Repo Settings → Pages → Source: `main` branch, `/` (root).
All asset paths are relative, so pushes to `main` redeploy
automatically. No build step.
