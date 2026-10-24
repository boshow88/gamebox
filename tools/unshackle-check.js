/** Run with `node tools/unshackle-check.js`. No packages required. */
'use strict';
require('../js/games/unshackle/engine.js');
require('../js/generators/unshackle.js');
const E = globalThis.UnshackleEngine;
let checks = 0;
function assert(ok, label) { checks++; if (!ok) throw new Error(label); }
const primitive = (a, b, r = 0.1, dir = [1, 0, 0]) => ({ dir, segments: [{ a, b, r }] });

// Contact occurs between endpoints of the motion, so a start/end-only test fails.
const moving = primitive([0, -1, 0], [0, 1, 0]);
const crossing = primitive([1, 0, -1], [1, 0, 1]);
assert(!E.sweptCollision(moving, crossing, 0), 'Clear initially');
assert(!E.sweptCollision(primitive([2, -1, 0], [2, 1, 0]), crossing, 0), 'Clear at the end');
assert(E.sweptCollision(moving, crossing, 2), 'Continuous sweep catches a mid-motion crossing');
assert(!E.sweptCollision(moving, primitive([1, 1.21, -1], [1, 1.21, 1]), 2), 'Clearance outside the swept face');
assert(E.sweptCollision(moving, primitive([1, 1.19, -1], [1, 1.19, 1]), 2), 'Tube radii count near a swept edge');
assert(E.sweptCollision(primitive([0, 0, 0], [0, 0, 0]), primitive([0.34567, 0, 0], [0.34567, 0, 0]), 2), 'Degenerate moving sphere sweep');
assert(!E.sweptCollision(primitive([0, 0, 0], [1, 0, 0]), primitive([0.5, 0.21, 0], [1.5, 0.21, 0]), 3), 'Parallel tubes with clearance');
assert(E.sweptCollision(primitive([0, 0, 0], [1, 0, 0]), primitive([2, 0, 0], [3, 0, 0]), 3), 'Collinear swept tubes');

assert(E.sweptCollision(primitive([0, 0, 0], [0, 1, 0]), primitive([30, 0, 0], [30, 1, 0])), 'Exit distance covers obstacles beyond the old 12-unit limit');
assert(!E.analyze([[2], [1]]).solvable, 'Reject a cyclic blocking graph');
// An independent distance sampler cross-checks the swept-face collision model.
const horizontal = E.piece(1, '#43b9de', [0,0,0], [1,0,0], [0,0,1], 3.8);
const vertical = E.piece(2, '#f4a34f', [0,0,0], [0,1,0], [1,0,0]);
for (const [a, b] of [[horizontal, vertical], [vertical, horizontal]]) {
    let contact = false;
    for (let t = 0; t <= E.exitDistance(a, [a,b]) && !contact; t += 0.04) {
        const offset = E.math.mul(a.dir, t);
        for (const s of a.segments) {
            const aa = E.math.add(s.a, offset), bb = E.math.add(s.b, offset);
            for (const r of b.segments) if (E.segmentDistance2(aa, bb, r.a, r.b) < (s.r + r.r) ** 2 - 1e-8) { contact = true; break; }
            if (contact) break;
        }
    }
    assert(contact === E.sweptCollision(a, b), 'Independent sampled distance agrees with continuous collision');
}

function checkEveryOrder(graph) {
    const size = graph.length;
    const seen = new Set();
    function visit(mask) {
        if (seen.has(mask)) return;
        seen.add(mask);
        if (mask === (1 << size) - 1) return;
        const legal = graph.map((bs, i) => !(mask & (1 << i)) && bs.every(id => mask & (1 << (id - 1))) ? i : -1).filter(i => i !== -1);
        assert(legal.length > 0, `No reachable dead end at ${mask}`);
        legal.forEach(i => visit(mask | (1 << i)));
    }
    visit(0);
}

function checkLargeOrders(graph) {
    // Do not enumerate exponentially many subsets on a 30-piece Easy board.
    // Exercise 64 different legal choices, with the independent DAG proof above.
    for (let trial = 0; trial < 64; trial++) {
        const remaining = new Set(graph.map((_, i) => i + 1));
        for (let step = 0; remaining.size; step++) {
            const legal = [...remaining].filter(id => graph[id - 1].every(b => !remaining.has(b)));
            assert(legal.length > 0, 'Large puzzle has a legal exit after each removal');
            remaining.delete(legal[(trial * 7 + step * 11) % legal.length]);
        }
    }
}

(async () => {
    const G = globalThis.PuzzleGenerators.unshackle, I = globalThis.PuzzleGenerators.unshackleInternals;
    let generated = 0;
    for (const size of I.SIZES) for (const difficulty of ['easy', 'medium', 'hard']) {
        const fingerprints = new Set(), structures = new Set(), depths = [], times = [];
        for (let seed = 0; seed < 40; seed++) {
            const started = Date.now(), p = await G(size, difficulty, seed); times.push(Date.now() - started); generated++;
            assert(p.pieces.length === size, 'Exact requested piece count');
            assert(p.pieces.every(p => /^#[0-9a-f]{6}$/i.test(p.color)), 'Every piece has a renderable colour');
            assert(I.qualifies(p.stats, size, difficulty), 'Actual graph meets requested difficulty');
            assert(p.stats.solvable, 'Generated graph is acyclic');
            assert(!fingerprints.has(p.fingerprint), 'Fresh geometry across tested seeds');
            assert(p.solution.length === size && new Set(p.solution).size === size, 'Solution covers every piece once');
            fingerprints.add(p.fingerprint); structures.add(p.structure); depths.push(p.stats.depth);
            const removed = new Set();
            for (const id of p.solution) { assert(p.graph[id - 1].every(b => removed.has(b)), 'Witness obeys geometric blockers'); removed.add(id); }
            if (seed < 2) {
                const repeat = await G(size, difficulty, seed, async () => {});
                assert(JSON.stringify(p) === JSON.stringify(repeat), 'Seed replays exactly, independently of progress yields');
                assert(JSON.stringify(E.blockingGraph(p.pieces)) === JSON.stringify(p.graph), 'Recomputed geometry matches the returned graph');
                for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) assert(!E.overlaps(p.pieces[i], p.pieces[j], 0.03), 'Positive initial clearance');
                if (size <= 12) checkEveryOrder(p.graph);
                else checkLargeOrders(p.graph);
                const transformed = p.pieces.slice().reverse().map(q => E.piece(q.id, '#000000',
                    [q.center[2]+7, -q.center[0]+4, q.center[1]-3], [q.u[2], -q.u[0], q.u[1]], [q.v[2], -q.v[0], q.v[1]], q.length, E.math.dot(q.u, q.dir)));
                assert(I.fingerprint(transformed) === p.fingerprint, 'Duplicate identity ignores labels, colour, translation and axis rotations/reflections');
            }
        }
        assert(structures.size > 1, 'More than one blocking structure per difficulty/size');
        console.log(`${size} ${difficulty}: 40 seeds, depth ${Math.min(...depths)}–${Math.max(...depths)}, ${structures.size} structures, avg ${Math.round(times.reduce((a,b)=>a+b,0)/times.length)} ms, max ${Math.max(...times)} ms`);
    }
    console.log(`${generated} generated puzzles; ${checks} checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
