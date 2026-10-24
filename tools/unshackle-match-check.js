/** Run with `node tools/unshackle-match-check.js`. Only the optional match mode. */
'use strict';
require('../js/games/unshackle/engine.js');
require('../js/generators/unshackle.js');
const assert = require('node:assert/strict');
const E = globalThis.UnshackleEngine, Match = globalThis.PuzzleGenerators.unshackleMatch;
let puzzles = 0, prefixes = 0;

// Independent exhaustive dynamic program: enumerate physical removal subsets,
// retaining the smallest peak occupancy for each, without using the mode solver.
function minimumCapacity(puzzle) {
    const n = puzzle.size, costs = new Map([[0, 0]]), full = (1 << n) - 1;
    for (let mask = 0; mask <= full; mask++) {
        if (!costs.has(mask)) continue;
        for (let i = 0; i < n; i++) {
            if ((mask & (1 << i)) || !puzzle.graph[i].every(id => mask & (1 << (id - 1)))) continue;
            const next = mask | (1 << i), counts = Array(6).fill(0);
            puzzle.pieces.forEach((p, j) => { if (next & (1 << j)) counts[p.group]++; });
            const used = counts.reduce((s, c) => s + c % 3, 0);
            costs.set(next, Math.min(costs.get(next) ?? Infinity, Math.max(costs.get(mask), used)));
        }
    }
    return costs.get(full);
}
function checkWalk(puzzle, order, capacity) {
    const removed = new Set();
    for (const id of order) {
        assert(!removed.has(id));
        assert(puzzle.graph[id - 1].every(b => removed.has(b)));
        const plan = Match.pullPlan(puzzle, removed, id);
        assert(plan.allowed);
        removed.add(id); prefixes++;
        const tray = Match.trayAfter(puzzle, removed);
        assert.deepEqual(plan.tray, tray);
        assert(tray.length <= capacity);
        for (let g = 0; g < 6; g++) assert(tray.filter(id => puzzle.pieces[id - 1].group === g).length < 3);
    }
    assert.equal(removed.size, puzzle.size);
    assert.deepEqual(Match.trayAfter(puzzle, removed), []);
}

(async () => {
    // A full buffer permits direct feeding, and rejects an unmatched extraction.
    const fixture = { size: 9, pieces: [0,0,1,1,2,0,1,2,2].map((group, i) => ({ id: i + 1, group })), graph: Array.from({ length: 9 }, () => []) };
    assert.equal(Match.trayAfter(fixture, [1,2,3,4,5]).length, 5);
    assert.equal(Match.trayAfter(fixture, [1,2,3,4,5,6]).length, 3);
    assert.equal(Match.trayAfter(fixture, [1,2,3,4,5,8]).length, 6);
    const match = Match.pullPlan(fixture, [1,2,3,4,5], 6);
    assert(match.allowed && match.matching);
    assert.deepEqual(match.consumed, [1,2,6]); assert.equal(match.tray.length, 3);
    const full = Match.pullPlan(fixture, [1,2,3,4,5], 8);
    assert(!full.allowed); assert.deepEqual(full.tray, [1,2,3,4,5]);
    assert.equal(Match.solve(fixture, [1,2,3,4,5]).status, 'solved');
    assert.equal(Match.solve(fixture, [1,2,3,4,5,8]).status, 'unsolvable');
    assert.equal(Match.solve(fixture, [], 5, 0).status, 'budget');
    for (const size of Match.SIZES) for (const difficulty of ['easy', 'medium', 'hard']) {
        for (let seed = 0; seed < 20; seed++) {
            const puzzle = await Match.generate(size, difficulty, seed); puzzles++;
            assert.equal(puzzle.size, size); assert.equal(puzzle.difficulty, difficulty);
            assert.equal(puzzle.mode, 'match'); assert.equal(puzzle.seed, seed);
            for (let g = 0; g < 6; g++) assert.equal(puzzle.pieces.filter(p => p.group === g).length % 3, 0);
            checkWalk(puzzle, puzzle.solution, 5);
            const trap = new Set();
            for (const [i, id] of puzzle.trap.entries()) {
                assert(puzzle.graph[id - 1].every(b => trap.has(b))); trap.add(id);
                const before = [...trap].slice(0,-1), plan = Match.pullPlan(puzzle, before, id);
                assert.equal(plan.allowed, i < puzzle.trap.length - 1);
            }
            assert(Match.trayAfter(puzzle, trap).length > 5);
            if (seed < 3) {
                assert.deepEqual(await Match.generate(size, difficulty, seed, async () => {}), puzzle);
                assert.deepEqual(E.blockingGraph(puzzle.pieces), puzzle.graph);
                const prefix = puzzle.solution.slice(0, Math.floor(size / 3));
                const continuation = Match.solve(puzzle, prefix);
                assert.equal(continuation.status, 'solved');
                checkWalk(puzzle, [...prefix, ...continuation.solution], 5);
            }
            if (size === 12) {
                const minimum = minimumCapacity(puzzle);
                assert.equal(minimum, puzzle.matchStats.requiredSlots);
                assert(difficulty === 'easy' ? minimum <= 3 : minimum === (difficulty === 'medium' ? 4 : 5));
                assert.equal(Match.solve(puzzle, [], minimum - 1).status, 'unsolvable');
            }
        }
        console.log(`${size} ${difficulty}: 20 seeds, verified solutions, full-buffer rejection paths and replay`);
    }
    console.log(`${puzzles} match puzzles; ${prefixes} solution prefixes checked; 60 exhaustive minimum-capacity comparisons passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
