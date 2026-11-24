/** node tools/fuse/solver-check.js — exact solver against an independent brute force. */
'use strict';
const assert = require('node:assert/strict');
const Rules = require('../../js/games/fuse/rules.js');
const Solver = require('../../js/games/fuse/solver.js');
const Gen = require('../../js/generators/fuse.js');
const R = Rules.DEFAULT;

// Plain exhaustive search: no memo, no pruning, no shared code beyond the merge rules.
function bruteSolvable(b) {
    if (R.tileCount(b) === 1) return true;
    return R.legalMoves(b).some((m) => bruteSolvable(R.applyMerge(b, m)));
}
function bruteProb(b) {
    if (R.tileCount(b) === 1) return 1;
    const moves = R.legalMoves(b);
    if (!moves.length) return 0;
    return moves.reduce((sum, m) => sum + bruteProb(R.applyMerge(b, m)), 0) / moves.length;
}
// Every winning sequence, and the distinct merge sets they use (the final merge's direction
// is free, so it is recorded as an unordered pair).
function bruteCounts(board) {
    const plans = new Set();
    let sequences = 0;
    (function walk(b, path) {
        if (R.tileCount(b) === 1) {
            sequences++;
            const last = path[path.length - 1];
            const keys = path.slice(0, -1).map(Rules.moveKey).sort();
            plans.add(keys.join(' ') + ' | ' + Math.min(last.from, last.to) + '~' + Math.max(last.from, last.to));
            return;
        }
        for (const m of R.legalMoves(b)) walk(R.applyMerge(b, m), path.concat([m]));
    })(board, []);
    return { sequences, plans: plans.size };
}
function replay(board, moves) {
    let b = board;
    for (const m of moves) { assert.ok(R.canMerge(b, m.from, m.to), 'solution move is legal'); b = R.applyMerge(b, m); }
    return b;
}

// Board pool: random boards (often unsolvable) plus reverse-built solvable ones.
const rng = Gen.makeRng(2024);
const pool = [];
const values = [1, 1, 2, 2, 2, 4, 4, 8];
while (pool.length < 500) {
    const rows = 2 + Math.floor(rng() * 2), cols = 2 + Math.floor(rng() * 2), grid = [];
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) row.push(rng() < 0.15 ? '.' : String(values[Math.floor(rng() * values.length)]));
        grid.push(row.join(' '));
    }
    const b = R.parse(grid.join('/'));
    if (R.tileCount(b) >= 2 && R.tileCount(b) <= 7) pool.push(b);
}
for (let n = 0; n < 300; n++) {
    const built = Gen.reverseBuild(rng, 2, 3, 3 + Math.floor(rng() * 3), ['even', 'mixed', 'deep'][n % 3]);
    if (built) pool.push(built.board);
}

let solvable = 0, unsolvable = 0, deadEnds = 0;
for (const board of pool) {
    const expected = bruteSolvable(board);
    const pruned = Solver.createSolver(R), plain = Solver.createSolver(R, { prune: false });
    assert.equal(pruned.isSolvable(board), expected, R.serialize(board));
    assert.equal(plain.isSolvable(board), expected, R.serialize(board));

    const a = pruned.analyze(board);
    for (const m of a.moves) assert.equal(m.outcome, bruteSolvable(R.applyMerge(board, m)) ? 'win' : 'lose');
    assert.equal(a.moves.length, R.legalMoves(board).length);
    if (!a.moves.length) { assert.equal(a.status, 'dead-end'); deadEnds++; }
    else assert.equal(a.status, expected ? 'solvable' : 'unsolvable');
    if (expected) {
        solvable++;
        assert.equal(R.status(replay(board, a.solution)), 'won');
        assert.equal(R.status(replay(board, pruned.solve(board))), 'won');
        assert.equal(pruned.classify(board, a.moves.find((m) => m.outcome === 'win')), 'win');
    } else {
        if (a.moves.length) unsolvable++;
        assert.equal(a.solution, null);
        assert.equal(pruned.solve(board), null);
    }

    const counts = bruteCounts(board);
    assert.equal(pruned.countSequences(board), counts.sequences, 'sequences ' + R.serialize(board));
    assert.equal(pruned.countPlans(board), counts.plans, 'plans ' + R.serialize(board));
    assert.ok(Math.abs(pruned.randomPlayWin(board) - bruteProb(board)) < 1e-12, 'random play ' + R.serialize(board));
}
assert.ok(solvable > 200 && unsolvable > 50 && deadEnds > 5, `pool mix ${solvable}/${unsolvable}/${deadEnds}`);

// Counting caps, and plans versus sequences on a board with interchangeable orders.
const ladder = R.parse('1 1 2 4');
const ls = Solver.createSolver(R);
assert.equal(ls.countSequences(ladder), 2);
assert.equal(ls.countPlans(ladder), 1, 'only the final merge direction differs');
const twin = R.parse('2 2/2 2');
assert.ok(ls.countSequences(twin) > ls.countPlans(twin));
assert.equal(ls.countSequences(twin, 3), 3);
assert.equal(ls.countPlans(twin, 1), 1);
assert.equal(Solver.independent({ from: 0, to: 1 }, { from: 2, to: 3 }), true);
assert.equal(Solver.independent({ from: 0, to: 1 }, { from: 1, to: 3 }), false);

// Status vocabulary: won, dead-end, unsolvable with legal moves, invalid.
const s = Solver.createSolver(R);
assert.equal(s.analyze(R.parse('. 8/. .')).status, 'won');
assert.equal(s.analyze(R.parse('2 4/4 2')).status, 'dead-end');
const trap = s.analyze(R.parse('2 2 1'));
assert.equal(trap.status, 'unsolvable');
assert.ok(trap.moves.length > 0 && trap.moves.every((m) => m.outcome === 'lose'));
assert.equal(s.analyze(R.parse('. ./. .')).status, 'invalid');

// Budget: an exhausted budget reports unknown instead of guessing; the memo is reused.
const big = R.parse('1 1 1/1 1 1/2 4 4');
const tiny = Solver.createSolver(R, { maxStates: 3, prune: false });
assert.equal(tiny.isSolvable(big), undefined);
assert.equal(tiny.solve(big), undefined);
const unknown = tiny.analyze(big);
assert.ok(['unknown', 'solvable'].includes(unknown.status));
assert.ok(unknown.moves.some((m) => m.outcome === 'unknown') || unknown.status === 'solvable');
const roomy = Solver.createSolver(R);
assert.equal(roomy.isSolvable(big), true);
const explored = roomy.stats().explored;
assert.equal(roomy.isSolvable(big), true);
assert.equal(roomy.stats().explored, explored, 'a solved position is answered from the memo');
assert.equal(roomy.analyze(big).status, 'solvable');
roomy.reset();
assert.equal(roomy.stats().memo, 0);

// The solver only calls the rules, so it works unchanged for other adjacency and tile types.
const K = Rules.createRules({ adjacency: 'king' });
assert.equal(Solver.createSolver(K).isSolvable(K.parse('2 ./. 2')), true);
assert.equal(Solver.createSolver(R).isSolvable(R.parse('2 ./. 2')), false);
const STAR = Object.freeze({ type: 'star' });
const X = Rules.createRules({
    tileTypes: { star: { tile: true, token: () => '*', parse: (t) => (t === '*' ? STAR : undefined) } },
    merges: { 'num>star': (src) => src, 'star>num': (src, dst) => dst },
});
const xs = Solver.createSolver(X);
assert.equal(xs.isSolvable(X.parse('2 * 2')), true);
assert.equal(xs.isSolvable(X.parse('2 * 4')), false);

console.log(`fuse solver: ok (${pool.length} boards: ${solvable} solvable, ${unsolvable} unsolvable with moves, ${deadEnds} dead ends)`);
