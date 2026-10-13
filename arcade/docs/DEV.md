# Developer notes

How this collection is put together, the conventions to follow, and how
to add another game. For per-game *rules* see [`rules.md`](rules.md).

## Philosophy

- **No build step.** Plain HTML/CSS/JS. It runs from `file://`,
  `python -m http.server`, or GitHub Pages with no tooling.
- **Framework-free.** Everything shared lives on one global,
  `window.ArcadeCommon` (`js/common.js`), created by an IIFE.
- **Offline-capable.** No CDNs. Icons are an inlined subset of Lucide;
  sound is synthesised with WebAudio (no asset files).
- **Relative paths everywhere**, so the site can live at any base URL.
- **Each game owns its own HUD + scoring.** The shared chrome only
  provides the lifecycle, overlay, loop and a generic high-score store —
  it never hard-codes a game's stats. A game defines whatever HUD pills
  it wants in its own page and updates them itself.

## File layout

```
index.html                   Launcher (game picker)
favicon.svg                  Four arcade buttons
css/common.css               Theme tokens (CSS variables) + launcher styles + toast
css/game.css                 Shared game-page chrome: topbar, HUD pills, stamina bar,
                             controls, canvas stage, start/pause/over overlay
js/common.js                 ArcadeCommon — all shared plumbing (see below)
js/games/colour-ladder.js    One file per game: logic + Canvas 2D rendering
docs/rules.md                Player-facing rules
docs/DEV.md                  This file
```

## `ArcadeCommon` surface (`js/common.js`)

| Namespace | What |
| --- | --- |
| `storage` | `readJSON` / `writeJSON` / `storageKey` — namespaced `localStorage` (prefix `arcadeGames`). |
| `prefs` | `get(game)` / `set(game, patch)` — per-game preferences. |
| `scores` | `best(game, mode)` / `submit(game, mode, score, meta)` / `stats(game)` / `resetIfStale(game, epoch)` — per-(game, mode) high scores + a recent-runs ring buffer. |
| `rng` | `make(seed)` (mulberry32) + `int` / `float` / `one` / `shuffle`. |
| `math` | `clamp` / `lerp` / `dist`. |
| `format` | `score(n)` (thousands) / `clock(ms|sec, asSeconds)` (mm:ss). |
| `el` / `svgEl` | Tiny DOM/SVG builders. |
| `icon(name)` / `icons.render(root)` | Inline Lucide-subset icons; fills every `[data-icon]` placeholder. |
| `i18n` | EN/中 strings, `t(key, ...args)`, `setLocale`, `subscribe`, `translateNode`, and the mutable `STRINGS` table. |
| `toast` | One shared bottom-centre notice: `toast.show(text, ms)`. |
| `input.keyboard(opts)` | Window-level key state + edge (`onPress`) callbacks. |
| `loop.create(opts)` | Fixed-timestep rAF loop (accumulator). |
| `audio` | WebAudio blip synth. `play(name)`; `unlock()`; `isMuted` / `toggleMuted`. |
| `shell.create(opts)` | Lifecycle + overlay + loop glue (below). |

### The shell

`shell.create(opts)` owns the state machine
`idle → playing → paused → over`, the fixed-timestep loop, the
start/pause/over overlay, and the Pause / Restart / Sound buttons and
their keyboard shortcuts. The game supplies `update(dt)` / `render()` /
`reset()` and calls `shell.gameOver({ score, win, meta })` when the run
ends. It intentionally knows nothing about the game's own HUD.

Config keys: `gameId`, `mode()` (leaderboard bucket), `scoreEpoch` (one-time
score reset — see below), `step`, `preventKeys`, `update`, `render`, `reset`,
`onStart` / `onPause` / `onResume` / `onGameOver`, `restartToReady`
(Restart → ready screen), and `overlayContent(state, result)` returning
`{ badge, title, message, button, hint }`.

**Resetting everyone's high scores once**: set `scoreEpoch` to an integer in
`shell.create` (we just use the date, e.g. `20261009`). Each save is stamped
with the epoch it was written under; bump `scoreEpoch` whenever a mechanics
change invalidates old scores, and every returning player's next load wipes
that game's bests exactly once, then stores the new epoch. Leave it unset to
never auto-reset. (Manual one-off: `ArcadeCommon.scores.resetIfStale(game, epoch)`.)

DOM ids the shell looks for (all optional): `#overlay`,
`#overlay-badge`, `#overlay-title`, `#overlay-message`, `#overlay-btn`,
`#overlay-hint`, `#pause-btn`, `#restart-btn`, `#sound-btn`, `#best`.

Global shortcuts: `Space`/`Enter` start from idle/over, `P`/`Esc` pause,
`R` restart (to the ready screen if `restartToReady`), `M` mute.
Switching tabs mid-run auto-pauses.

### i18n conventions

- `data-i18n="key"` sets `textContent`; keys ending in **`Html`** set
  `innerHTML` (may contain markup / `[data-icon]`).
- `data-i18n-title` / `data-i18n-aria-label` handle those attributes.
- A game registers its strings by mutating
  `ArcadeCommon.i18n.STRINGS.en` / `.zh` at load time (top of the game
  file, synchronously) — before the DOM-ready translate pass.
- Dynamic text subscribes with `ArcadeCommon.i18n.subscribe(cb)`.

## Adding a new game

1. **Launcher card** in `index.html`: copy a `.game-card` block, give it
   a class (e.g. `panda-dash`) and `href="./games/panda-dash.html"`.
2. **Accent colour**: add `.game-card.<class> { --game-color: #…; }` in
   `css/common.css`, and set `body { --game-color: #…; }` in the game
   page's inline `<style>`.
3. **Game page** `games/<id>.html`: copy `colour-ladder.html` — topbar,
   the HUD pills **your** game needs, a `.stage-wrap` with the
   `<canvas id="stage">` + overlay, controls, and the *How to play*
   footer. Load `../js/common.js` then `../js/games/<id>.js`.
4. **Game module** `js/games/<id>.js`: an IIFE that
   - registers its strings on `AC.i18n.STRINGS`,
   - grabs the canvas + its own HUD nodes,
   - builds state,
   - calls `AC.shell.create({ gameId, update, render, reset, … })`,
   - wires its own input and updates its own HUD,
   - calls `shell.gameOver({ score, win })` when the run ends.
5. **Launcher strings** for the card go in `js/common.js` `STRINGS`
   (EN + 中); per-game gameplay strings stay in the game file.
6. Add a rules section to `docs/rules.md`.

Canvas convention: render at a fixed logical resolution (Colour Ladder
uses 600×760 portrait, capped/centred via a `.stage-wrap { max-width }`
on its page) and scale the backing store by `devicePixelRatio` in a
`fitCanvas()`.

## Colour Ladder internals

- **Tuning lives up top** in `CONFIG` (shared: `ballSpeed`, wave gap, …) +
  `DIFFICULTIES` (per preset: the fixed layout `lanes`=`colors`, `lives`,
  `twoBall` chance, and the `freq` wave-rate curve). Change balance there.
- **Difficulty** is a preset (`easy` / `normal` / `hard`), chosen with
  the on-page selector and stored in prefs; high scores are kept
  per-difficulty (`shell.mode` returns `G.difficulty`). Each preset has one
  **fixed layout** where `lanes === colors`, so every basket is a distinct
  colour.
- **Ladder model.** `G.rungs` is a fixed list of `{ gap, y, color }` (gap = the
  left lane of the pair; `y` = a free, continuous height; `color` = the one
  colour it does NOT affect). A ball tracks its logical `lane` and each frame
  crosses any adjacent rung whose colour differs from it (in height order) —
  a ball slips straight through rungs of its own colour — easing its `x`
  toward the lane centre (`CONFIG.xEase`) for a diagonal slide.
  Lanes draw a faint full-height rail plus a brighter capped segment marking
  the rung band (`RUNG_TOP`–`RUNG_BOTTOM`).
- **Colour-gate rungs.** `initRungs` seeds **one rung per colour**
  (`COLOR_SETS[G.colors]`) spread out by `placeRungSpread` (a best-candidate
  pick that keeps rungs apart via soft repulsion); it also scatters
  `DIFFICULTIES.*.fixedRungs` **immovable obstacle rungs** (`fixed: true`,
  upper-biased ~26%) that deflect **every** colour
  (crossing skips the colour test for them) and can't be grabbed (`rungIndexAt`
  ignores them). A gate rung deflects
  every colour EXCEPT its own (a ball passes straight through its own colour's
  rungs), so every rung interacts with almost every ball — managing those side
  effects is the puzzle, and an own-colour rung is a "safe gate". Drawn as a
  neutral bar with coloured end-rings (`drawRung`). Rungs move, never add/remove.
  Pointer input grabs the rung under the cursor (`rungIndexAt`); while held it
  is placed freely — the gap snaps to the nearest pair (`nearestGap`) and the
  height follows the cursor. `resolveDropY` dodges conflicts: rungs that share a
  lane (same or adjacent gap) must stay `CONFIG.rungMinSep` apart, so the ghost
  slides to the nearest free height (or turns red / snaps back if the column is
  full). The held rung keeps steering at its old spot until release
  (`drawDragGhost`).
- **Baskets** (`makeBaskets`) lay the fixed colour set in a **fixed order** (no
  shuffle, from `COLOR_SETS`), one per lane. A ball's colour (chosen uniformly,
  differing within a wave) is both its destination (the same-colour basket) and
  the rung colour that can move it.
- **Steady wave spawning.** `waveRate()` = `freq.base + freq.k·ln(1 + t/freq.tau)`
  — unbounded but decelerating. A single accumulator (`G.spawnAcc`) fires a wave when
  it crosses 1 and `CONFIG.waveMinGap` has passed; the rhythm stays even (no
  jitter). `spawnWave` drops one ball, or two (on distinct free lanes) with
  `DIFFICULTIES.*.twoBall` probability — never more than two.
- **Fall speed** is `ballSpeed()` = `CONFIG.speed.base + k·ln(1 + t/tau)`
  (shared across difficulties), computed once per frame and applied to every
  ball — the whole field accelerates together as it rises.
- **Rung cooldown.** Moving a rung sets `rg.readyAt = elapsed +
  cooldownDuration()`, where `cooldownDuration()` = `CONFIG.rungCooldown ×
  speed(0)/speed(t)` (≈ `rungCooldown` s early, shorter as `ballSpeed` rises, so
  moves-per-ball-drop stays roughly constant). While cooling, `rungIndexAt`
  skips it (can't grab) and its end-rings draw as a sweeping recharge arc.
- **Opening countdown.** `onStart` sets `G.countdown` (`CONFIG.countdownSec`);
  while it ticks down `update` freezes the scene (no spawning or falling) and
  `drawCountdown` paints a 3‑2‑1 overlay, so play doesn't start the instant you
  press Start. The difficulty clock (`G.elapsed`) only begins afterwards.
- **No overlap at spawn.** `laneBlockedAtTop` keeps a lane clear until its top
  ball descends past `CONFIG.laneClearY`; within a two-ball wave `createBall`'s
  `used` set forces two different colours. In a two-ball wave each ball picks a
  free lane independently, so the pair may coincide (stacked — peel apart with a
  colour rung) or not; stacked/converged balls are spread side by side for
  readability (`drawBalls`).
- **Difficulty over time** is only the wave rate rising, `base + k·ln(1 + t/tau)`:
  unbounded (never plateaus) but ever gentler, so late game stays fair and good
  players last long. `tau` drifts the gentle opening. Easy/Normal share a curve;
  Hard's is a touch lower (its extra colours already carry the load).
- **Delivery** compares the ball's colour to its final lane's basket. Correct →
  score (plus +1 life if it's a heal ball, capped at `G.maxLives`); wrong → a
  life lost, **except heal balls, which are harmless when misplaced**. Zero
  lives ends the run. (No combo system.)
- **Heal balls** (`b.heal`) come from a separate accumulator (`spawnHeal`) at
  `waveRate / CONFIG.healEveryWaves` — EXTRA balls on their own timeline, not
  part of a wave, so ~1 per `healEveryWaves` waves (scales with the rate). They
  fall `CONFIG.healSpeedMul×` the normal speed and draw with a trail + white `+`.
- **Lives HUD** renders as pips via `renderLives` (easier to read at a glance).

## Debug / dev affordances

All gated behind `?debug=1` on the game page and tagged in code with a
`[DEBUG-HOOK]` comment (find them with `rg "\[DEBUG-HOOK\]"`).

### URL flags (`games/colour-ladder.html`)

| Flag | Effect |
| --- | --- |
| `?debug=1` | Enables the debug overlay, keyboard shortcuts and the `window.LC` console API. |
| `?t=<seconds>` | Starts every run at that elapsed time — jumps the difficulty (wave rate) to that moment. Works with or without `?debug`. |

Example: `games/colour-ladder.html?debug=1&t=120`.

### Console API — `window.LC` (debug only)

| Call | What |
| --- | --- |
| `LC.setTime(sec)` / `LC.addTime(sec=30)` | Jump the difficulty clock. |
| `LC.addLife(n=1)` | Add lives. |
| `LC.diff("easy"\|"normal"\|"hard")` | Switch difficulty (restarts). |
| `LC.info()` | Snapshot of the live state. |

### Debug keys (debug only)

`]` +30s difficulty · `[` −30s difficulty · `L` +1 life. A readout in
the top-right shows difficulty, elapsed, layout, wave rate (waves/10s), the
two-ball chance, and ball count.

### Stripping the debug code later

Everything above is gated behind `?debug=1` and tagged `[DEBUG-HOOK]`.
To remove: `rg "\[DEBUG-HOOK\]"`, delete those lines (`PARAMS` /
`DEBUG` / `START_T`, the two `if (DEBUG) …` calls), set the run's start
time back from `START_T` to `0` in `resetRun`, and delete the
`setupDebug` / `drawDebugOverlay` functions. Nothing else references
them.

### Ungated logging

Defensive `console.warn` in `js/common.js` (storage read/write + i18n
subscriber failures). Find with `rg "console\.(log|warn)"`.

## Run locally & deploy

```powershell
python -m http.server 8000   # then open http://localhost:8000
```

GitHub Pages: Settings → Pages → Source `main` / root. All paths are
relative, so pushes to `main` redeploy automatically. No build step.
