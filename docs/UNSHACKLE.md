# Unshackle

## Integration and ownership

Static, offline, vanilla JS; no packages, CDN, build or account requirement.
`PuzzleCommon` supplies language, sound, timer, staged selectors, solve records,
progress, sharing and undo snapshots. Shared engines, CSS, existing games,
generators and their tests are unchanged. Player copy is English / Traditional
Chinese; comments and docs are English.

The three game modules are grouped under `js/games/unshackle/`, as requested:

- `engine.js`: tube geometry, continuous collision queries, bounds and graph analysis.
- `view.js`: local WebGL meshes, lighting, depth-tested ID picking and camera.
- `game.js`: shell integration, generation lifecycle, input, animation and undo.

`js/generators/unshackle.js` contains generation and grading, following the existing
one-generator-file-per-game convention. `games/unshackle.html` owns the page and
game-specific styles. New shared abstractions are unnecessary.

## Rules and camera

Every piece translates along its long axis toward its white cap. Dragging rotates
the view, never individual pieces. Unit quaternions accumulate incremental turns
about the current screen axes: horizontal input uses screen-up, vertical input
uses screen-right, even after tilting or turning upside down. Neither direction
has an angular limit. Pinch/wheel zoom (up to 3x), directional camera buttons, view
reset and keyboard controls are available. The camera fits a bounding sphere of
the actual tube/cap geometry, keeping the original puzzle in view during rotation.

Tap a visible piece or its numbered button to pull. A blocked pull nudges back and
highlights blockers. Hint identifies a currently free piece. Reset preserves the
puzzle; undo can leave a win. New Game/Next puzzle generate fresh puzzles. Size and
difficulty remain staged until generation. Solve records use the played settings
even if another difficulty/size has been staged.

This is constrained disassembly, without gravity, bending, freely rotating parts
or general rigid-body simulation. Removing an available piece can only reduce
obstacles, so it cannot turn a solvable board into a dead end.

## Geometry and validation

Tubes are chains of capsule segments; caps are spheres. A centre segment's
continuous translation sweeps a parallelogram. Its distance to a stationary
segment is computed against two triangles, including degenerate cases; contact
uses the sum of their radii. Curves are a finite polyline approximation, shared
with rendering. Collision checks cover the entire translation, not sampled frames.

Exit distance comes from the scene's bounds projected along the pull direction,
replacing the prototype's fixed 12-unit distance. Animation adds enough travel to
leave the fitted view. Authored levels have been removed.

For each piece the graph records every piece blocking its full exit. An acyclic
graph is necessary and sufficient for complete disassembly under these rules.
Layered topological removal computes a solution, opening choices, chain depths,
edge count and join count. A cyclic graph is rejected.

## Seeded reverse assembly

Generator version 1 accepts `(size, difficulty, seed, onProgress)` and returns
pieces, graph, solution, geometry fingerprint, structural signature and stats.
Sizes are 6, 8, 10, 12, 16, 20 and 24. A local Mulberry32 stream drives construction and
Fisher-Yates shuffles, including seed zero. IDs/colours are shuffled after assembly
so they do not reveal construction order.
The original 6-12-piece version-1 outputs remain unchanged, including colours,
preserving existing shared links. Larger puzzles use an extended 24-colour
palette, a bounded root length and a larger permitted cluster radius. Cached
downstream graph depths avoid repeatedly traversing the same dependency paths.

1. Start with one randomly sized ring.
2. Propose rings on a perpendicular plane, with random offsets, length and pull sign.
3. Require positive initial clearance (0.035 world units), a clear exit for the new
   ring, and at least one older ring that it blocks. The reverse insertion order
   is therefore a witness solution. Keep the cluster spatially bounded.
4. Steer attachments toward shallow branches or deeper dependencies according to
   the requested difficulty, rejecting configurations above the depth ceiling.
5. Collect a small pool, grade it, shuffle labels, recompute the full geometric
   graph and independently check both difficulty and the constructive witness.

Budgets are deterministic: at most 180 placement proposals per added piece and 48
assembly attempts, targeting 2 valid candidates for Easy or 4 for Medium/Hard.
Progress callbacks yield after chunks of work, without affecting random choices
or acceptance. Failed searches return an error, never an unverified board or a
silently downgraded difficulty. The UI can try another seed and preserves an
existing puzzle on failure.

## Difficulty version 1

Chain depth includes both end pieces. All delivered puzzles are connected through
their construction; independent mini-puzzles are not simply combined.

| Count | Easy depth | Medium depth | Hard depth |
| --- | --- | --- | --- |
| 6 | 2-3 | 4 | 5 |
| 8 | 2-3 | 4 | 5-7 |
| 10 | 2-3 | 4-5 | 6-9 |
| 12 | 2-3 | 4-6 | 7-11 |
| 16 | 2-4 | 5-6 | 7-15 |
| 20 | 2-4 | 5-7 | 8-19 |
| 24 | 2-4 | 5-8 | 9-23 |

Easy requires at least two opening exits, or three above 12 pieces. Medium permits at most `ceil(N*0.45)`;
Hard at most `max(2, floor(N*0.25))`. Medium/Hard require at least one multiply
blocked piece, and Hard excludes a depth-N total chain. Among qualified candidates,
the score combines depth, edges per piece, join count and opening-exit fraction;
Easy picks the gentler end, the others the higher score. These are structural
difficulty bands, not a measured prediction of human solving time. Spatial
readability, feedback revealing blockers, and real-device play still need user
calibration before calling the tiers final.

## Variation and exact replay

The geometry fingerprint ignores IDs, colours, translations and all signed axis
permutations (rotations/reflections). Coordinates are quantized to 0.001 units.
A coarse structural signature summarizes depth/in-degree/out-degree; it is a
diversity preference rather than a graph-isomorphism proof.

The UI remembers 24 distinct recent geometries and prefers a structure different
from the last three at matching settings. It does this by selecting a new seed,
never by changing a seed's generated output. Geometry repetition is rejected;
structural preference is best effort. Shared URLs carry size, difficulty and seed
and bypass history filtering, preserving exact replay on another device. New Game
changes the puzzle, Reset keeps it, and Share always identifies the running puzzle.
Global or unlimited non-repetition is not promised.

## Checks

Run `node tools/unshackle-check.js` with no packages. It checks mid-motion contact,
clearance, degenerate sweeps, distant obstacles, cycles, sampled-distance agreement,
all 21 settings across 40 seeds, exact replay with/without progress callbacks,
duplicate fingerprints, structural variation, independently recomputed graphs,
positive starting clearance and every reachable play order for selected puzzles
up to 12 pieces. Larger puzzles are checked through 64 legal removal walks,
avoiding exponential enumeration. The current run passed 840 generated puzzles
and 46,204 assertions. A separate comparison against the previous commit confirmed
24 original shared puzzles are byte-for-byte unchanged.

Browser QA passed 32 checks for generation, staged settings, applied-setting solve
records, blocked pulls, hints, undo/reset/wins, new seeds, localization, camera
full turns and a 320px viewport. The camera update additionally passed 36 checks
for screen-relative axes at tilted/upside-down poses, reversibility, full turns,
numerical stability after 3,000 mixed turns, reset and picking.
The larger-board UI passed 20 checks covering 16/20/24-piece generation, staged
settings, hints, a full 24-piece win and undo of every removal. Count controls
were checked at widths 320, 390, 520, 600 and 1200 without clipping or overflow.
Native pointer checks verified horizontal dragging and piece picking after a flip.
Additional checks cover seed replay, direct
picking and small viewports. WebGL is required; unavailable or lost contexts
display localized feedback. Desktop Chromium and synthetic touch events do not
establish physical iOS/Android behavior.
