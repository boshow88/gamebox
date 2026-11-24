/** node tools/fuse/generator-check.js — reproducible, verified, correctly tiered puzzles. */
'use strict';
const assert = require('node:assert/strict');
const Rules = require('../../js/games/fuse/rules.js');
const Solver = require('../../js/games/fuse/solver.js');
const Reasoning = require('../../js/games/fuse/reasoning.js');
const Gen = require('../../js/generators/fuse.js');
const R = Rules.DEFAULT;

function replay(board, moves) {
    let b = board;
    for (const m of moves) { assert.ok(R.canMerge(b, m.from, m.to), 'solution move is legal'); b = R.applyMerge(b, m); }
    return b;
}
function tiersOf(metrics) { return Gen.TIERS.filter((t) => Gen.DIFFICULTY[t](metrics)); }
function checkBoard(text, tier, label) {
    const board = R.parse(text);
    assert.equal(R.tileCount(board), board.rows * board.cols, `${label}: starts full`);
    const total = R.numberTotal(board);
    assert.ok(Rules.isPowerOfTwo(total), `${label}: total ${total} can end in one tile`);
    const metrics = Reasoning.evaluate(R, board);
    assert.equal(metrics.solvable, true, `${label}: solvable`);
    assert.equal(metrics.searchSteps, 0, `${label}: no step needs search`);
    assert.deepEqual(tiersOf(metrics), [tier], `${label}: exactly one tier (${JSON.stringify(Gen.summary(metrics))})`);
    assert.equal(Gen.classify(metrics), tier);
    return { board, metrics };
}

// Reverse operations are exact inverses of legal forward merges.
const rng = Gen.makeRng(31);
for (let n = 0; n < 200; n++) {
    const built = Gen.reverseBuild(rng, 3, 3, 4 + (n % 4), Object.keys(Gen.STYLES)[n % 3]);
    if (!built) continue;
    assert.equal(R.status(replay(built.board, built.solution)), 'won');
    for (const op of Gen.REVERSE_OPS) {
        for (const o of op.options(R.applyMerge(built.board, built.solution[0]))) {
            assert.equal(R.key(R.applyMerge(o.prior, o.move)), R.key(R.applyMerge(built.board, built.solution[0])));
            assert.equal(R.numberTotal(o.prior), R.numberTotal(built.board));
        }
    }
}

// Generated puzzles: deterministic per seed, verified, and in the requested tier.
const timings = [], boards = new Set();
let generated = 0, total = 0;
for (const tier of Gen.TIERS) {
    for (let seed = 1; seed <= 8; seed++) {
        const t0 = Date.now();
        const p = Gen.generate({ size: 3, difficulty: tier, seed });
        timings.push(Date.now() - t0);
        total++;
        assert.deepEqual(Gen.generate({ size: 3, difficulty: tier, seed }), p, 'same seed, same puzzle');
        assert.equal(p.game, 'fuse');
        assert.equal(p.difficulty, tier);
        assert.equal(p.seed, seed);
        assert.equal(p.id, `fuse-3x3-${tier}-${seed.toString(36)}`);
        assert.ok(p.attempts >= 1 && p.attempts <= Gen.PLAN[3].attempts);
        const { board, metrics } = checkBoard(p.board, tier, `${tier}#${seed}`);
        assert.equal(R.status(replay(board, p.solution)), 'won', 'the stored solution replays');
        assert.deepEqual(p.metrics, Gen.summary(metrics));
        if (p.source === 'generated') generated++;
        boards.add(p.board);
    }
}
assert.ok(generated >= total - 1, `generated rather than curated (${generated}/${total})`);
assert.ok(boards.size >= total - 2, `seeds give different puzzles (${boards.size}/${total})`);
assert.notDeepEqual(Gen.generate({ size: 3, difficulty: 'easy', seed: 1 }).board, Gen.generate({ size: 3, difficulty: 'easy', seed: 2 }).board);

// Tiers really differ in the measured reasoning, not only by label.
const byTier = {};
for (const tier of Gen.TIERS) {
    byTier[tier] = [];
    for (let seed = 101; seed <= 106; seed++) byTier[tier].push(Gen.generate({ size: 3, difficulty: tier, seed }).metrics);
}
assert.ok(byTier.easy.every((m) => m.maxLevel <= 2 && m.hypotheticals === 0));
assert.ok(byTier.medium.every((m) => m.maxLevel >= 3 && m.hypotheticals <= 1));
assert.ok(byTier.hard.every((m) => m.maxLevel === 5 && (m.span >= 7 || m.hypotheticals >= 2)));

// Curated fallbacks are valid members of their tier, and the fallback path is bounded.
for (const tier of Gen.TIERS) {
    const list = Gen.CURATED[3][tier];
    assert.ok(list.length >= 3);
    list.forEach((text, i) => checkBoard(text, tier, `curated ${tier}[${i}]`));
    let curated = 0;
    for (let seed = 1; seed <= 12; seed++) {
        const p = Gen.generate({ size: 3, difficulty: tier, seed, attempts: 1 });
        assert.equal(p.attempts, 1);
        assert.equal(p.difficulty, tier);
        if (p.source === 'curated') {
            curated++;
            assert.equal(p.board, R.serialize(R.parse(list[seed % list.length])));
            assert.equal(R.status(replay(R.parse(p.board), p.solution)), 'won');
            assert.deepEqual(Gen.generate({ size: 3, difficulty: tier, seed, attempts: 1 }), p);
        }
    }
    assert.ok(curated > 0, `${tier}: one attempt sometimes falls back`);
}

// Unknown options fall back to supported ones instead of looping or throwing.
assert.equal(Gen.generate({ size: 7, difficulty: 'easy', seed: 3 }).size, 3);
assert.equal(Gen.generate({ size: 3, difficulty: 'expert', seed: 3 }).difficulty, 'medium');

// The async wrapper yields to the page and returns the same puzzle as the sync core.
(async () => {
    const progress = [];
    const p = await Gen.generatePuzzle(3, 'hard', 77, (f) => { progress.push(f); });
    assert.deepEqual(p, Gen.generate({ size: 3, difficulty: 'hard', seed: 77 }));
    assert.ok(progress.every((f) => f > 0 && f <= 1));
    timings.sort((a, b) => a - b);
    const worst = timings[timings.length - 1];
    assert.ok(worst < 5000, `generation stays fast (worst ${worst} ms)`);
    console.log(`fuse generator: ok (${total} puzzles, ${generated} generated, median ${timings[timings.length >> 1]} ms, worst ${worst} ms)`);
})().catch((err) => { console.error(err); process.exit(1); });
