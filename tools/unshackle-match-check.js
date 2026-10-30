/** Run with `node tools/unshackle-match-check.js [size|all] [difficulty|all] [samples]`. */
'use strict';
require('../js/games/unshackle/engine.js');
require('../js/generators/unshackle.js');
const assert = require('node:assert/strict');
const E = globalThis.UnshackleEngine, Match = globalThis.PuzzleGenerators.unshackleMatch;
let puzzles = 0, prefixes = 0, capacityChecks = 0;
const sizes = process.argv[2] && process.argv[2] !== 'all' ? [Number(process.argv[2])] : Match.SIZES;
const difficulties = process.argv[3] && process.argv[3] !== 'all' ? [process.argv[3]] : ['easy', 'medium', 'hard'];
const samples = Number(process.argv[4] || 20);
assert(Number.isInteger(samples) && samples > 0);
assert(sizes.every(size => Match.SIZES.includes(size)));
assert(difficulties.every(difficulty => ['easy', 'medium', 'hard'].includes(difficulty)));

// Independent exhaustive dynamic program: enumerate physical removal subsets,
// retaining the smallest peak occupancy for each, without using the mode solver.
function minimumCapacity(puzzle, removed = []) {
    const n = puzzle.size, initial = removed.reduce((mask, id) => mask | (1 << (id - 1)), 0);
    const counts = Array(Match.GROUPS.length).fill(0);
    removed.forEach(id => counts[puzzle.pieces[id - 1].group]++);
    const costs = new Map([[initial, counts.reduce((n, count) => n + count % 3, 0)]]), full = (1 << n) - 1;
    for (let mask = 0; mask <= full; mask++) {
        if (!costs.has(mask)) continue;
        for (let i = 0; i < n; i++) {
            if ((mask & (1 << i)) || !puzzle.graph[i].every(id => mask & (1 << (id - 1)))) continue;
            const next = mask | (1 << i), counts = Array(Match.GROUPS.length).fill(0);
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
        for (let g = 0; g < Match.GROUPS.length; g++) assert(tray.filter(id => puzzle.pieces[id - 1].group === g).length < 3);
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
    for (const [difficulty, settings] of Object.entries(Match.SETTINGS)) {
        for (const size of Match.SIZES.filter(n => !settings.sizes.includes(n)))
            await assert.rejects(Match.generate(size, difficulty, 0), /Invalid match settings/);
    }
    // Accessible independent triples stay safe in any order.
    const independent = { size: 9, pieces: [0,0,0,1,1,1,2,2,2].map((group, i) => ({ id: i + 1, group })),
        graph: [[],[],[],[],[],[],[],[],[]] };
    assert(Match.safeTripleClears(independent));
    const obvious = { size: 24, pieces: Array.from({ length: 24 }, (_, i) => ({ id: i + 1, group: Math.floor(i / 3) })),
        graph: Array.from({ length: 24 }, () => []) };
    assert.equal(Match.strategy(obvious).tripleOnlyRemoved, 24);
    assert.equal(Match.strategy(obvious).greedyWins, 4);
    // A forced route has an independently known peak and crosses bits 31/32.
    // It catches mask aliasing, including continuations after piece 32 is gone.
    for (const size of [36, 48]) {
        const groups = Array.from({ length: size }, (_, i) => i < 36 ? [0,1,2,0,1,0,2,1,2][i % 9] : Math.floor((i - 36) / 3) % 6);
        const chain = { size, pieces: groups.map((group, i) => ({ id: i + 1, group })),
            graph: groups.map((_, i) => i ? [i] : []) };
        const solved = Match.solve(chain);
        assert.equal(solved.status, 'solved');
        assert.deepEqual(solved.solution, groups.map((_, i) => i + 1));
        assert.equal(Match.solve(chain, [], 4).status, 'unsolvable');
        const prefix = solved.solution.slice(0, 33);
        const continuation = Match.solve(chain, prefix);
        assert.equal(continuation.status, 'solved');
        assert.deepEqual(continuation.solution, solved.solution.slice(33));
        checkWalk(chain, [...prefix, ...continuation.solution], 5);
    }
    for (const size of sizes) for (const difficulty of difficulties) {
        if (!Match.SETTINGS[difficulty].sizes.includes(size)) continue;
        for (let seed = 0; seed < samples; seed++) {
            const puzzle = await Match.generate(size, difficulty, seed).catch(error => {
                throw new Error(`${size} ${difficulty} seed ${seed}: ${error.message}`, { cause: error });
            }); puzzles++;
            if (process.argv[2]) console.log(`${size} ${difficulty} seed ${seed}: generated`);
            assert.equal(puzzle.size, size); assert.equal(puzzle.difficulty, difficulty);
            assert.equal(puzzle.mode, 'match'); assert.equal(puzzle.seed, seed);
            assert.equal(puzzle.matchVersion, 3);
            assert.equal(new Set(puzzle.pieces.map(p => p.group)).size, difficulty === 'hard' ? 8 : size / 3);
            assert(puzzle.pieces.every(p => /^#[0-9a-f]{6}$/i.test(p.color)));
            for (let g = 0; g < Match.GROUPS.length; g++) assert.equal(puzzle.pieces.filter(p => p.group === g).length % 3, 0);
            checkWalk(puzzle, puzzle.solution, puzzle.matchStats.requiredSlots);
            const measured = puzzle.matchStats;
            if (difficulty !== 'hard') {
                for (const group of new Set(puzzle.pieces.map(p => p.group)))
                    assert.equal(puzzle.pieces.filter(p => p.group === group).length, 3);
            }
            if (difficulty === 'easy') assert(Match.safeTripleClears(puzzle));
            assert(measured.greedyWins >= Match.SETTINGS[difficulty].greedyMin);
            assert(measured.greedyWins <= Match.SETTINGS[difficulty].greedyMax);
            if (difficulty === 'easy') assert(measured.greedyWins >= 3);
            else {
                assert(measured.tripleOnlyRemoved <= size * (difficulty === 'hard' ? 0.25 : 0.5));
                assert(measured.decisions.length >= (difficulty === 'hard' && size > 12 ? 2 : 1));
                assert.equal(new Set(measured.decisions.map(d => d.bad)).size, measured.decisions.length);
                if (difficulty === 'hard') { assert.equal(measured.greedyWins, 0); assert(measured.openingTriples <= 1); }
                for (const decision of measured.decisions) {
                    const removed = new Set(decision.removed);
                    assert(puzzle.graph[decision.bad - 1].every(id => removed.has(id)));
                    assert(Match.pullPlan(puzzle, removed, decision.bad).allowed);
                    assert(Match.trayAfter(puzzle, [...removed, decision.bad]).length <= decision.capacity);
                    assert.equal(Match.solve(puzzle, [...removed, decision.bad], decision.capacity, 10000).status, 'unsolvable');
                    if (size === 12) {
                        assert(minimumCapacity(puzzle, [...removed, decision.bad]) > decision.capacity);
                        assert(minimumCapacity(puzzle, [...removed, decision.good]) <= decision.capacity);
                    }
                }
            }
            const trap = new Set();
            for (const [i, id] of puzzle.trap.entries()) {
                assert(puzzle.graph[id - 1].every(b => trap.has(b))); trap.add(id);
                const before = [...trap].slice(0,-1), plan = Match.pullPlan(puzzle, before, id);
                assert.equal(plan.allowed, i < puzzle.trap.length - 1);
            }
            assert(Match.trayAfter(puzzle, trap).length > 5);
            if (seed === 0) {
                let previous = 0;
                assert.deepEqual(await Match.generate(size, difficulty, seed, async fraction => {
                    assert(fraction >= previous && fraction <= 1); previous = fraction;
                }), puzzle);
                assert.deepEqual(E.blockingGraph(puzzle.pieces), puzzle.graph);
                const prefix = puzzle.solution.slice(0, Math.floor(size / 3));
                const continuation = Match.solve(puzzle, prefix);
                assert.equal(continuation.status, 'solved');
                checkWalk(puzzle, [...prefix, ...continuation.solution], 5);
            }
            if (size === 12) {
                const minimum = minimumCapacity(puzzle);
                capacityChecks++;
                assert.equal(minimum, puzzle.matchStats.requiredSlots);
                assert(difficulty === 'easy' ? minimum <= 3 : minimum === (difficulty === 'medium' ? 4 : 5));
                assert.equal(Match.solve(puzzle, [], minimum - 1).status, 'unsolvable');
                // Exercise large-mask dominance against the independent oracle.
                // Already removed filler triples leave the 12-piece puzzle intact.
                const padded = { ...puzzle, size: 36,
                    pieces: [...puzzle.pieces, ...Array.from({ length: 24 }, (_, i) => ({ id: i + 13, group: Math.floor(i / 3) % 6 }))],
                    graph: [...puzzle.graph, ...Array.from({ length: 24 }, () => [])] };
                const removed = Array.from({ length: 24 }, (_, i) => i + 13);
                assert.equal(Match.solve(padded, removed, minimum).status, 'solved');
                assert.equal(Match.solve(padded, removed, minimum - 1).status, 'unsolvable');
            }
        }
        console.log(`${size} ${difficulty}: ${samples} seeds, verified solutions, strategy grades, decisions and replay`);
    }
    console.log(`${puzzles} match puzzles; ${prefixes} solution prefixes checked; ${capacityChecks} exhaustive minimum-capacity comparisons passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
