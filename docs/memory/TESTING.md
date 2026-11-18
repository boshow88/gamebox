# Memory tests and diagnostics

Commands run from the repository root. Current contracts are in
[README.md](README.md); analytics/export tests are in [ANALYTICS.md](ANALYTICS.md).
Test source and frozen fixtures define expected behavior. Old per-phase pass
counts, screenshots and synthetic score tables are not maintained here.

## Core checks

| Area | Node scripts under `tools/` |
|---|---|
| Scoring/Color | `memory-check.js`, `memory-v4-check.js`, `memory-color-variants-check.js`, `memory-color-map-check.js` |
| Quantity | `memory-quantity-check.js`, `memory-quantity-groups-check.js`, `memory-challenge-check.js` |
| Pitch/audio | `memory-pitch-check.js`, `memory-pitch-variations-check.js`, `memory-audio-check.js`, `memory-pitch-initialization-check.js` |
| Match/room/CPU | `memory-room-check.js`, `memory-cpu-check.js`, `memory-progression-check.js`, `memory/recovery-check.cjs` |
| UX/results | `memory-ux-check.js`, `memory-flow-check.js`, `memory-ranking-check.js`, `memory-rematch-ux-check.js` |
| Diagnostics/analytics | `memory-playtest-check.js`, `memory-focused-check.js`, `memory-analytics-check.js`, `memory-analytics-tools-check.js` |

For example: `node tools/memory-check.js`. Add `--diagnostics` to supported
scoring/variant checks for representative pairs, not human-performance evidence.
Frozen regression data lives in `tools/fixtures/memory-v*-frozen.json`.

## Browser checks

Chrome is required; scripts use its Windows default path or accept an executable
path as a positional argument. Local fixtures do not access live Firebase.

```text
node tools/memory-browser-check.js
node tools/memory-online-browser-check.js
node tools/memory-online-browser-check.js --flow --screenshots
node tools/memory-online-browser-check.js --ranking --screenshots
node tools/memory-online-browser-check.js --rematch --screenshots
node tools/memory-online-browser-check.js --analytics
node tools/memory-online-browser-check.js --analytics --disable-recorder
node tools/memory-online-browser-check.js --analytics --throw-recorder
node tools/memory-online-browser-check.js --recovery --screenshots
```

Other focused online modes: `--groups`, `--color-variants`, `--pitch`, `--mixed`,
`--pitch-variations`, `--weighted`, `--challenge`, `--cpu --playtest`, `--ux`,
`--errors-only`. Offline modes include `--quantity-only`, `--groups-only`,
`--color-variants-only`, `--pitch-only`, `--pitch-variations-only`,
`--weighted-only`, `--playtest-only`, `--focused-only`, `--ux-local-only`,
`--pitch-init-only`, `--cpu-tool-only`, `--color-layout-only`, `--map-only`,
`--calibration-only`, `--challenge-only`. Check each script's argument branches
before extending it; some modes deliberately freeze earlier protocols.

The integration scenarios cover native input, shared deadlines, early settlement,
duplicate receipts/settlements, ownership, rematches and 1200/390/320px layouts.
Screenshots and failure snapshots go under ignored `.cache/`. Desktop Chrome
emulation and scheduled AudioContext checks do not establish physical phone
usability, speaker audibility, latency or human balance.

### Refresh and reconnection

The recovery mode uses actual reloads, delayed fixture Auth restoration, desktop
and mobile viewports, two humans with separately owned CPUs, eight actors, native
opener sessionStorage copying, immutable receipts, shared deadlines, results and
rematch recovery. It also checks separate Ready/audio state, explicit Leave,
presence expiry and host migration. Pure recovery checks cover blocked storage,
missing locking support, UID changes, removed membership/rooms and late old
connection disconnection. Existing frozen scoring/CPU/match suites must also pass.

For a real environment smoke test, explicitly run:

```text
node tools/memory-live-smoke.js --live --recovery
```

This serves local assets, uses two isolated real anonymous Auth/RTDB contexts,
refreshes host/guest across phases with eight actors and two CPU owners, verifies
accepted receipts/CPU resumption, tests copied-tab fencing, permanent disconnect
cleanup and explicit Leave. Temporary rooms/accounts are removed in `finally`;
production analytics is disabled for synthetic live tests. The report is ignored
under `.cache/memory-live-recovery-smoke.json`. It does not deploy Rules or publish
the site. Physical phone/browser suspension behavior still needs human testing.

## Calibration tools

Open directly or through the normal static server; these tools need no Firebase.
They reuse game modules and do not change production settings.

| Page under `tools/` | Purpose |
|---|---|
| `memory-color-map.html` | Same-target/scale V1–V4 curves, real-score contours, Oklab slices, gamut omissions and RGB8 pair samples |
| `memory-scoring.html` | Color pair diagnostics |
| `memory-color-variants.html` | Retained HSL/Hue variants |
| `memory-quantity-groups.html` | Shape/pool geometry and count-error comparison |
| `memory-pitch-variations.html` | References, contours and playback |
| `memory-pitch-initialization.html` | Initial-frequency experiment; production stays 440 Hz |
| `memory-difficulty.html` | Seeded challenge/stage settings and retained legacy adaptation |
| `memory-cpu.html` | CPU profile/model diagnostics and synthetic samples |
| `memory-playtest.html` | Import and summarize opt-in playtest JSON |

Color contour radii use the real continuous scorer's inverse search; gamut-invalid
colors are not silently clipped. Equal-distance contours in fixed-L Oklab are
circles, but a 2D slice cannot show all 3D differences. CPU simulations are seeded
synthetic data, never evidence of human performance or grounds for auto-tuning.

## Human playtest workflow

1. Serve the repository, e.g. `python -m http.server 8000`, and open
   `http://localhost:8000/games/memory.html?playtest=1`.
2. Keep Data source `human` for real play; use `synthetic`/`automated` for tests.
3. For local practice, choose the Color/Quantity/Pitch/Mixed 12-question preset.
   It enables recording and stops recording after twelve completed questions.
   Local practice has no HP/damage. For online play, enable recording on one
   observer per match and configure the normal round cap/categories in the lobby.
4. Export JSON/CSV regularly; the developer recorder is page memory only, with a
   2,000-question limit. Refresh/close loses unexported data. It is distinct from
   the automatic Firestore recorder and has a different export format.
5. Import JSON into `tools/memory-playtest.html`. Human summaries exclude CPU and
   declared synthetic/automated data by default. Compare category/variant errors,
   scores, answer timing, missing rates, within-round spreads, damage and stages.

One observer avoids cross-export double counting; aliases cannot identify the
same person across devices or sessions. Recording started mid-match is partial.
Targets enter completed-round exports only. Accepted receipt times are not exact
thinking time, and auto-submission does not establish an actual timeout. Low
average score alone does not establish unfair damage: compare score gaps too.

## Real Firebase and Rules

Localhost can connect to real Auth/RTDB without a website push. Explicitly run:

```text
node tools/memory-live-smoke.js --live --rematch
node tools/memory-live-smoke.js --live --flow
node tools/memory-live-smoke.js --live --ranking
```

Other live modes include `--connect-only`, `--pitch`, `--focused --playtest`,
`--cpu --playtest`, `--ux` and `--v4`. They create isolated room/users, use real
SDK/server-clock estimates and clean up their own resources. The live harness
disables automatic production analytics and unrelated stale-room maintenance.
No production analytics test write is part of these room smoke tests.

For Firestore analytics Rules/export tests use the **demo loopback emulator**
commands in [ANALYTICS.md](ANALYTICS.md#tests-and-deployment). Existing
`tools/memory-rtdb-rules-check.mjs` tests the separate RTDB policy; its emulator
setup follows the shared [room checks](../DEBUG.md#room-checks).

Report fixtures, emulator, real Firebase, deployed website and physical-device
checks separately. Do not redeploy unchanged Rules. Analytics production Rules
or test writes require explicit approval; see the shared
[deployment policy](../ROOMS.md#development-stage-deployment-policy).
