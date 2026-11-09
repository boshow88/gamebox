# Unshackle

## Integration and ownership

Static, offline, vanilla JS; no packages, CDN, build or account requirement.
`PuzzleCommon` supplies language, sound, timer, staged selectors, solve records,
progress, sharing and undo snapshots. Shared puzzle/arcade infrastructure and
unrelated games remain unchanged. Player copy is English / Traditional
Chinese; comments and docs are English.

Game modules are grouped under `js/games/unshackle/`:

- `engine.js`: tube geometry, continuous collision queries, bounds and graph analysis.
- `view.js`: local WebGL meshes, lighting, depth-tested ID picking and camera.
- `game.js`: shell integration, generation lifecycle, input, animation and undo.
- `free.js`: continuous axial positions, contact intervals, solver and seeded generation.

`js/generators/unshackle.js` contains generation and grading, following the existing
one-generator-file-per-game convention. `games/unshackle.html` owns the page and
game-specific styles. Its accent is copper red (`#b5684e`), matching the launcher
card; the in-game title has no prototype badge. New shared abstractions are unnecessary.

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
Classic offers 12, 18, 24, 30, 36 and 48 pieces, defaulting to 12. The generator
also accepts legacy 6/8/10/16/20 shared links. A local
Mulberry32 stream drives construction and Fisher-Yates shuffles, including seed
zero. IDs/colours are shuffled after assembly
so they do not reveal construction order.
Existing version-1 outputs through 24 pieces remain unchanged, including colours,
preserving existing shared links. New larger puzzles use an extended 48-colour
palette, a longer root and a larger permitted cluster radius. Cached
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
Legacy counts remain in the table for shared-link compatibility.

| Count | Easy depth | Medium depth | Hard depth |
| --- | --- | --- | --- |
| 6 | 2-3 | 4 | 5 |
| 8 | 2-3 | 4 | 5-7 |
| 10 | 2-3 | 4-5 | 6-9 |
| 12 | 2-3 | 4-6 | 7-11 |
| 16 | 2-4 | 5-6 | 7-15 |
| 18 | 2-4 | 5-6 | 7-17 |
| 20 | 2-4 | 5-7 | 8-19 |
| 24 | 2-4 | 5-8 | 9-23 |
| 30 | 2-4 | 5-9 | 10-29 |
| 36 (match geometry) | 2-5 | 6-11 | 12-35 |
| 48 (match geometry) | 2-6 | 7-14 | 15-47 |

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

## Optional triple-match mode

The mode selector stages Classic / Triple match until New Game, just like size
and difficulty. Classic remains the default; old links without `mode` still load
Classic. A new match share link includes `mode=match&mv=2`, size, difficulty and
seed. Match links without `mv` use `generateLegacy` and retain their original
six-colour generation. New Game always creates the current version; Classic
links carry neither match parameter.
Sharing always identifies the running puzzle, even with another mode staged.
The selectors remember each mode's size while switching within the page.

Triple match offers 12, 18, 24, 30, 36 and 48 pieces. New 24/36/48-piece boards use all
eight colours; 12 pieces can contain only four complete triples, so use four
colours selected from the palette. Every colour also has a unique symbol.
Group symbols are off by default; an optional
local preference enables them on cap labels, piece buttons and waiting loops.
Every colour count is divisible by three.

At most five pieces can wait. `unshackleMatch.pullPlan` checks capacity before an
extraction: an unmatched sixth piece is refused without movement, history, timer
penalty or a losing state. A completing third piece is always allowed. After it
clears the structure, the two matching waiting loops and the third piece gather
above the serving plate. They spiral together and fuse into one same-colour star
treat, with a small pulse and glint. Only that single treat travels to the creature's
mouth; no sixth waiting position is created. The creature receives it and chews.
Logical state
and history commit when feeding finishes, before a possible win overlay. Undo
restores the pre-feed pair and puts the third piece back on the board. Solves
remain separate from Classic in `solves:unshackle-match`, once per attempt.

Rejected match moves also prompt a brief creature reaction: a blocked pull or
return gets a curious head tilt, blink and small round mouth; an unmatched pull
at full capacity gets puffed cheeks and a gentle head shake. Reactions last 900ms,
can restart on another rejection, and clear on the next action, reset, undo,
generation or context loss. They affect no puzzle state or history. Feeding and
chewing retain their original animation; reduced-motion mode keeps the facial
expression while suppressing the tilt, shake, blink and transitions.

Waiting loops sit on a small ceramic-style serving plate inside the existing white
board, above the original SVG creature. Five recessed places are always visible;
empty places carry faint position numbers and occupied places contain return
buttons. The plate count and a full-plate accent reinforce its five-piece capacity.
The plate intercepts clicks on empty places so they cannot pull a 3D piece behind
it. There is no external column or legend. Both modes retain the shared page width.
A match-only projection inset makes room inside the board;
rendering, cap labels and picking use the same inset. Classic camera behavior,
mesh geometry and palette are unchanged. Mode and size controls use content width.

Match extraction has a continuous board-to-plate presentation. Full swept-path
legality is still checked first. A view-only axial preview stops before the piece
would leave the visible board or pass behind the plate. Its exact projected loop
then shrinks and morphs into the plate miniature while moving to the destination.
An invisible preview in the next empty place supplies the actual CSS geometry;
the moving loop is replaced only on arrival. Three-dimensional rendering/picking
of that piece is hidden during the overlay handoff, without duplicate meshes.
The miniature overlay is clipped to the board and follows current projection and
destination layout. This does not introduce partially extracted gameplay states.

A matching third piece transfers to the visible fusion area instead of reserving
a sixth plate place. Feeding starts from that actual arrival position, replacing
the former offscreen exit and clamped edge spawn. Classic retains its original
exit animation. Cancellation and effect errors leave no partially committed move.

Each waiting loop can return independently, leaving completed feedings intact.
Its original continuous swept path must be clear. For an A-blocks-B pair extracted
A then B, returning B then A is possible; returning A first blocks B's return.
Other active obstacles can also prevent insertion. The existing physical blocking
graph checks the exact reverse path.

Return animation has two phases: a projected miniature transfers to the clear
outer end of the original pull axis, then the actual full-size WebGL mesh slides
in along that axis with monotonically decreasing offset. Geometry is visible and
pickable during insertion even though the removed set commits only on arrival.
Both match pulls and returns record undo snapshots only on successful completion.
Reset, generation and context loss cancel active overlays and effects without
partial logical changes. Effect factory/drawing failures unlock controls and add
no empty history snapshot. The four Unshackle scripts share an asset revision in
the page; bump it together when their interfaces change to avoid mixed cached APIs.

Match rules and generation are one optional IIFE appended to the existing generator
file, exposed as `PuzzleGenerators.unshackleMatch`. The Classic generator above that
block and the geometry engine are unchanged. UI, effects and rendering stay in
the original three runtime modules; no additional module or shared shell change
is required. Creature artwork is inline SVG, with no image or network dependency.

Version 3 uses one shared difficulty policy for the generator and match toolbar:

| Difficulty | New puzzle sizes | Colours | Greedy completions (four strategies) |
| --- | --- | --- | --- |
| Easy | 12, 18 | One unique triple per colour | At least three |
| Medium | 24, 30 | One unique triple per colour | At most one |
| Hard | 36, 48 | Eight colours, some with two triples | None |

Minimum required occupancy remains 2–3 / 4 / 5. Medium requires a verified bad
choice at four places (the fifth provides tolerance); Hard requires two at the
actual five-place capacity. These forks do not necessarily involve a completed
triple. Hard allows that mechanism without requiring it in every puzzle.
Easy additionally checks every empty-plate subset reachable by repeatedly
clearing an accessible triple: each must have a verified five-place continuation.
Unknown searches reject an assignment. This guarantee does not cover arbitrary
partial extractions with leftovers on the plate.

New puzzles use a muted twelve-colour palette with separated hue and lightness, replacing
the old teal/blue-green pairing. Only Medium 36 needs all twelve; Easy and Hard
use at most eight. Symbols remain optional and off by default. Colour alone still
needs human assessment on small screens and under the renderer's lighting.
Difficulty changes select the nearest allowed piece count. Classic is unaffected.
Version-1 and version-2 shared URLs retain their original geometry, assignments,
colours and permitted historical sizes. New shares carry `mv=3`; both strategic
versions use the same generator with explicit version-dependent policy.
Undo restores eaten triples as well as waiting pieces; direct returns only apply
to pieces still on the plate. Its existing 64-action limit is unchanged.

The following describes the retained Version-2 grading and solver foundations.

Version 2 reuses Classic Easy geometry for Easy, and Medium geometry for both
Medium and Hard. Colour/geometry coupling and actual choices determine the match
grade; a longer forced chain alone is not sufficient. Generation tries up to six
deterministically salted geometries and 64 balanced colour assignments each.
Returned puzzles retain the original public seed for exact replay. A memoized
subset solver verifies a complete capacity-constrained solution. Every accepted
puzzle also has a witnessed extraction sequence whose last move would exceed
capacity; the UI rejects that last move.
Required peak waiting occupancy grades Easy at 2–3, Medium at 4 and Hard at 5.
All tiers provide five places. Additional requirements measure planning:

- A triple-only simulation repeatedly clears a fully accessible same-colour triple
  with no leftovers. Medium permits this to clear at most half of the board; Hard
  permits at most a quarter and no more than one initial complete triple.
- Four deterministic greedy players prioritize completing triples, then tray
  pairs and accessible same-colour pieces, with ID/unblocking tie-break variants.
  Easy requires at least two to finish; Hard requires all four to stall.
- Along the verified route, every third prefix is inspected for an alternative
  physically legal extraction. A 10,000-visit exact search must prove that this
  alternative prevents completion at the tier's target capacity. Medium requires
  one such fork at four places, retaining the fifth place as error tolerance.
  Hard requires two forks with different bad piece IDs at the actual five-place
  capacity (one fork for the small 12-piece introductory board).

`matchStats` records colour count, greedy results, triple-only removals and the
verified forks, including their prefix, good/bad choices and tested capacity.
Budget exhaustion never counts as a bad choice. These grades measure
extraction-only planning; returns remain available for recovery. Greedy failure
does not prove a particular level of subjective human difficulty.

Immediate matching makes residual colour counts depend only on the removed subset.
The solver uses BigInt masks so pieces beyond bit 31 remain distinct. On boards
above 24 pieces, available pieces of the same colour use an exact dominance
reduction: prefer a piece whose remaining dependents include all of the other's,
breaking equivalent ties by ID. Either choice has the same tray effect; delaying
the preferred piece cannot unlock anything blocked by the other first.
Hint and solution searches have a deterministic 60,000-visit budget. Version-2
lower-capacity grading permits 250,000 visits. Legacy grading retains its original
budgets and seeded behaviour;
exhaustion returns `budget`, not `unsolvable`. Generation rejects unverified
assignments. Hints search for a
complete safe continuation; an extraction dead end suggests returning, undoing or
resetting. Reset replays the exact puzzle, and Share identifies the running mode,
size, difficulty and seed even when different settings are staged. Undo retains
64 actions so a complete 48-piece removal sequence can be reversed.

Run `node tools/unshackle-match-check.js`. By default it checks 120 puzzles across the six current
settings, verified solution prefixes, rejected capacity moves, direct matching
at capacity, exact replay, geometric graph agreement and continuation hints.
An independent exhaustive dynamic program checks minimum capacity and decision
forks for 12-piece puzzles, including padded versions exercising large-mask dominance.
Forced 36/48-piece chains independently check capacity, high-numbered pieces and
continuations after piece 32. Existing Classic checks use the updated count list.
Replay checks also require monotonic progress. Optional size/difficulty/sample
arguments can target a setting; `all all 4` samples all six current settings.
Browser checks cover five visible plate places, return and empty-place restoration,
three-to-one fusion with only one delivered treat, actual two-phase axis insertion,
A/B return order, feeding at full capacity, feeding undo, complete wins, optional symbols, record separation,
effect failure recovery, reset cancellation and responsive layout. Camera checks
cover the original 36 rotations and picking with the match projection inset.
Transfer checks additionally verify in-view previews across rotated/upside-down
poses, exact projected start and plate landing coordinates, continuous entry into
fusion, capacity, cancellation, and full 24-piece solves.

The eight-colour update sampled four seeds in all twelve settings: 48 puzzles and
1,884 verified solution-prefix steps passed. Twelve small boards were cross-checked
with the independent capacity/decision oracle. All twelve legacy settings at seed
zero remained byte-for-byte identical. Browser checks cover both new symbols,
a verified bad move and return recovery, a full eight-colour win, complete undo,
versioned URLs and the transition from a legacy link to a new game.

## Checks

Run `node tools/unshackle-check.js` with no packages. It checks mid-motion contact,
clearance, degenerate sweeps, distant obstacles, cycles, sampled-distance agreement,
all 15 Classic settings across 40 seeds, exact replay with/without progress callbacks,
duplicate fingerprints, structural variation, independently recomputed graphs,
positive starting clearance and every reachable play order for selected puzzles
up to 12 pieces. Larger puzzles are checked through 64 legal removal walks,
avoiding exponential enumeration. The count expansion passed 600 Classic puzzles
and 49,158 assertions, and additionally compared 27 original Classic/match shared
puzzles against the prior generator byte for byte.

Expansion browser checks cover complete 30-piece Classic and 48-piece match wins,
undo of every extraction, high-numbered piece picking, staged mode/count changes,
correct played-setting solve records, mode-specific count memory, legacy shared
links, copper accents and both title translations. The updated controls fit
320px, 390px and 1200px viewports without horizontal overflow. Large boards take
longer to generate because collision and exact capacity verification both grow.

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

## Continuous sliding: compact structural interlocks (versions 4–5)

The three toolbar modes are Classic, Triple match and Continuous slide. The old
fixed-stop mode and its level bank, controls, solver and checks have been removed.
Continuous slide offers 12/18/24/30/36/48-piece Interwoven layouts, defaulting
to 12. Six- and eight-piece generation remains available for internal core
construction and existing shared links, but is no longer offered in new-game
settings. Piece counts use the common numeric segmented control.
Larger layouts retain an eight-piece blocked core and grow connected frames by
reverse insertion with bounded backtracking when an insertion leaves no space
for subsequent frames. Each added frame has a clear exit and robustly blocks existing
bodies; the full removal and sliding witness is replayed. More pieces increase
assembly size and do not establish a higher difficulty rating. The selector labels describe structure, not calibrated human
difficulty. New Game generates a fresh arrangement; Share preserves size and seed.
The two-layout prototype and artificial second-rescue-path obstacle are retired.

`free.js` owns continuous positions, contact intervals, generation and route
search. Pieces retain their exact real-valued position on release. Escape,
pointer cancellation and pinching discard a preview. Contact intervals use
continuous swept capsules and bisection, with a 0.0001-unit clearance. Reverse
travel has no artificial stop in an unobstructed direction. Full removal remains
toward the white cap. A clear full ray and a deliberate 56px forward pull show
Release to remove; release animates the remaining checked exit. An obstacle
anywhere along the full ray disables that assistance.

The compact construction profile uses 1.25-unit-wide frames, 4–4.8-unit roots and
3.2–4.5-unit other frames, with a 5.2-unit assembly-radius ceiling. Visible rounded
shoulders on the locked core are real collision capsules, rendered at the same
radius and orientation. The white end cap is contained by its structural shoulder;
a blocking cycle cannot be supported solely by the white marker. Shoulders are
removed from already-extractable outer pieces to reduce clutter, and the final
geometry is checked again. Shared `engine.piece` accepts an optional width, and
the shared reverse-assembly generator accepts an optional construction profile.
Defaults preserve Classic and legacy Triple match seeds exactly.

Generation reverse-assembles these actual physical parts, then scrambles legal
continuous translations near the assembly. Collision-limited scrambles stop at
contact instead of repeatedly rejecting the whole attempted move. The 1.6-unit
scramble bound is a generation constraint only. Reversing the legal scramble
provides a constructive witness; the final shoulder/outer-frame configuration
also requires a complete, independently replayed solution.

Acceptance checks physical layout rather than counting small extra moves:

- Greedy extraction leaves at least three pieces in Practice and four in the
  8-piece layout. There is a cycle made of structural bodies alone.
- Those body-blocking edges survive 0.04-unit perturbations in both transverse
  directions. At least 80% of all blocking edges are stable, and none are
  end-cap-only catches.
- The blocked core is connected by nearby body surfaces (at most a 0.55-unit
  surface gap). Its center span is at most 3.2 units; the whole board's is at most
  4.4. Overall radius may grow by at most 10% from the compact assembly.
- A bounded search verifies one to four useful shifts. Shifts are at least
  0.38 units. Under- and overshooting a target by 0.18 units must both preserve
  the remaining route; a real physical contact clamps the overshoot.
- Fingerprints include the actual shoulder geometry as well as frames, not just
  piece labels or a rendered camera scale.

There is no requirement to manufacture a second shift or obstruct an otherwise
valid rescue path. `stats.verifiedShifts` and `coordinatedPieces` describe the
witness, not a global minimum or a claim of subjective difficulty. Initial hints
and matching remaining-piece sets reuse a geometrically revalidated suffix;
arbitrary poses use bounded search. Unknown searches reject generation candidates
and never prove a playing position unsolvable.

Progress yields roughly every 35ms without affecting seeded results. Generation
uses at most 256/384 compact assemblies for 6/8 pieces, each with up to 144 scramble
attempts. The optional construction profile asks for one accepted assembly per
16 attempts. Solves use `solves:unshackle-free`. Undo, reset, framing and input are
shared with the page; Reset view refits current poses to recover offscreen parts.

Run `node tools/unshackle-free-check.js [samples per size]`. It independently
sweeps every witness motion, checks both sides of the opening tolerance, rejects
an end-cap-only grazing fixture, verifies tight body-connected cores and physical
shoulders, checks exact seeded replay, hints, fractional positions and contacts.
Classic and legacy Match replay checks cover the default geometry profile.
Browser checks complete both sizes using real pointer drags and verify that a
short clear-path pull cues removal, exits and undoes correctly.

Generation runs in `free-worker.js` in browsers; only serializable puzzle data
crosses the worker boundary, and the main thread rebuilds the collision model.
Node and environments without Worker use the same deterministic generator directly.
Collision tests cache immutable capsule bounds, and continuous models cache pairwise
full-ray results (bounded to 32768 entries). Fresh continuous layouts are no longer
discarded solely for matching a recent degree signature; geometry fingerprints
still prevent repeats. Larger layouts use a square-root-scaled overall span bound;
the locked core retains the original compactness and tolerance checks.

## Shared count selector and continuous difficulty

All three modes show 12/18/24/30/36/48 at every difficulty. The common settings
policy lives in `unshackleInternals.SETTINGS`: Easy allows 12/18; Medium allows
24/30; Hard allows 36/48. Ineligible buttons remain visible but disabled,
with per-button difficulty tooltips and accessible labels. There is no explanatory
block below the count selector.
Changing difficulty selects the nearest eligible count if needed. Generation
locks do not re-enable ineligible buttons when generation ends. Legacy shared
boards still replay even when outside the current new-game policy.

Continuous difficulty is now selectable. Easy accepts a verified route with one
repositioning move; Medium permits up to three and requires a blocked core of at
least four. Hard permits up to four and chooses the stronger of two verified core
candidates, scored by core size, repositioning count and coordinated actors. This
is bounded candidate grading, not a proof of minimum move count or a guarantee
that every Hard puzzle exceeds every Medium puzzle in human difficulty. All
levels retain visible structural contacts and the existing opening tolerance.

## Partial-pull relays (version 6)

New Continuous slide games now build connected three-part relays throughout the
board. Every part starts physically blocked; adding more pieces no longer adds
an extraction-only shell around a single small sliding core. Each constructive
route contains A partway forward, B out, C out, then A out. A's original body
blocks B; its partial position clears B while C still blocks A. B blocks C until
B leaves, and A remains at its partial coordinate until C leaves. The generator
independently audits all of these intermediate geometric states.

A parameterized three-frame construction supplies a comfortable opening window.
Frame positions, lengths, widths and shoulders vary with the seed. New relays are
rotated/reflected and placed near the existing assembly, with at least one real
body-blocking dependency on an older relay. Each new four-move witness is checked
against all older geometry; removing the new relay leaves the older witness
intact. Piece IDs and colours are shuffled independently of helper roles. This
is a construction primitive, not a bank of complete stored levels. The difficulty
counts remain 12/18, 24/30 and 36/48: their witnesses contain 4/6, 8/10 and 12/16
partial pulls respectively. These are witnessed counts, not globally optimal
move counts or calibrated human difficulty ratings.

Quality checks retain exact continuous collision, no initial overlaps (0.02-unit
clearance), no end-cap-only blocking, connected nearby bodies and compact local
three-part interlocks. All new blocking relations survive the existing 0.04-unit
transverse perturbations. Moving 0.18 units short or long of each intended partial
pull must preserve the full continuation; an overshoot clamps at real contact.
A partial helper never qualifies for assisted extraction while its path is
blocked. The whole assembly can contain multiple tight cores, so its center span
is bounded by `4.5 * sqrt(pieceCount / 3)` and its radius by
`4 + 2.5 * sqrt(pieceCount / 3)` instead of applying the old single-core span to
all parts. Every initial piece belongs to the extraction-blocked core.

Small relay geometry is validated before trying assembly placements. Fixed
candidate/backtracking budgets and monotonic progress preserve seeded replay.
The verified route, opening tolerance, cross-relay body edges and relay count are
recorded with the puzzle. Hints first revalidate a witness continuation, then try
a physical relay continuation from the player's actual coordinates, then use the
existing bounded contact search. Partial positions remain real values; there are
no scripted stops, logical gates, or automatic position resets.

New shares carry `mode=free&fv=6`. Unversioned existing Continuous slide shares
continue to use the unchanged version-4/5 generator through `generateLegacy`;
New Game switches to version 6. Both the worker and the no-worker path respect
the share version. Other modes remove `fv` from their URLs.

`node tools/unshackle-free-check.js 10` passed 80 boards and 2,400 independently
swept witness motions, including 60 new relay boards across all six count/tier
settings. The checks prove the A/B/C dependency sequence, retained partial
coordinates, fractional dragging, opening tolerance, exact replay, verified hints
at every prefix and noncanonical opening positions, geometric diversity, and
byte-for-byte preservation of two large legacy shares. Assembly-only timings for
the new hard boards are measured separately from these more extensive checks.

Browser checks also passed a complete 12-piece solve using 16 real pointer drags,
including A held partway while B/C leave, undo back through the partial state,
reset, a 48-piece worker-generated board and its 64-move verified hint, Chinese
instructions, a 390px viewport, legacy-to-new-game share version transitions,
and Classic/Match URL cleanup without browser exceptions. Separate local Node
benchmarks for hard seeds 0/1 measured 36-piece generation at 509/367ms and
48-piece generation at 423/517ms; timings depend on device and seed.
