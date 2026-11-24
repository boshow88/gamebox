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
const shapeOf = (board) => `${board.rows}×${board.cols}`;
const mulCount = (board) => board.cells.filter((c) => c && c.type === 'mul').length;
const mostMuls = (cells) => Math.max(0, ...(Gen.MULS[cells] || []).filter((m) => m[1] > 0).map((m) => m[0]));

// A puzzle text belongs to `tier`, recomputed without the generator's shortcuts: the board
// starts full in one of the tier's shapes, with no more ×2 tiles than its size allows, the
// waste (merges a smallest-first player makes and undoes) is in range, and reasoning alone
// solves it.
function checkBoard(text, tier, label) {
    const board = R.parse(text);
    assert.ok(Gen.SHAPES[tier].some(([rows, cols]) => rows === board.rows && cols === board.cols), `${label}: ${shapeOf(board)} is a ${tier} shape`);
    assert.equal(R.tileCount(board), board.rows * board.cols, `${label}: starts full`);
    const muls = mulCount(board);
    assert.ok(muls <= mostMuls(board.rows * board.cols), `${label}: ${muls} ×2 tiles on ${shapeOf(board)}`);
    assert.ok(board.cells.every((c) => c.type === 'num' || c === R.mul(2)), `${label}: only numbers and ×2 tiles`);
    const range = Gen.DIFFICULTY[tier], minimum = R.tileCount(board) - 1;
    const waste = Reasoning.trialMerges(R, board, minimum + (range.max === Infinity ? range.min : range.max + 1)) - minimum;
    assert.ok(waste >= range.min && waste <= range.max, `${label}: waste ${waste} within ${tier}`);
    const path = Reasoning.humanPath(R, board, { stopAtSearch: true });
    assert.equal(path.complete, true, `${label}: solved by reasoning alone`);
    assert.equal(path.searchSteps, 0);
    return { board, waste };
}

// Reverse operations are exact inverses of legal forward merges, on every shape and with
// ×2 tiles, and a build places exactly the ×2 tiles asked for.
{
    const rng = Gen.makeRng(31), styles = Object.keys(Gen.STYLES);
    let checked = 0;
    for (let n = 0; n < 150; n++) {
        const [rows, cols] = [[3, 3], [3, 4], [4, 3], [4, 4]][n % 4], muls = n % 3;
        const exps = Gen.EXPONENTS[rows * cols];
        const built = Gen.reverseBuild(rng, rows, cols, exps[n % exps.length] + muls, styles[n % 3], muls);
        if (!built) continue;
        checked++;
        assert.equal(R.tileCount(built.board), rows * cols);
        assert.equal(mulCount(built.board), muls);
        assert.equal(R.status(replay(built.board, built.solution)), 'won');
        const next = R.applyMerge(built.board, built.solution[0]);
        for (const op of Gen.REVERSE_OPS) {
            for (const o of op.options(next)) {
                assert.equal(R.key(R.applyMerge(o.prior, o.move)), R.key(next));
                assert.equal(mulCount(o.prior) - mulCount(next), op.mul ? 1 : 0, `${op.id} adds a ×2 tile only when marked`);
            }
        }
    }
    assert.ok(checked > 100, `reverse builds checked (${checked})`);
    const both = Gen.REVERSE_OPS.find((op) => op.mul).options(R.parse('. 8'));
    assert.deepEqual(both.map((o) => R.serialize(o.prior)).sort(), ['4 x2', 'x2 4'], 'a ×2 merge is undone in both directions');
}

// Generated puzzles: deterministic per seed, verified, and in the requested tier.
const timings = [], wastes = {}, shapes = {};
let generated = 0, total = 0;
for (const tier of Gen.TIERS) {
    const boards = new Set();
    wastes[tier] = []; shapes[tier] = new Set();
    for (let seed = 1; seed <= 8; seed++) {
        const t0 = Date.now();
        const p = Gen.generate({ difficulty: tier, seed });
        timings.push(Date.now() - t0);
        total++;
        assert.deepEqual(Gen.generate({ difficulty: tier, seed }), p, 'same seed, same puzzle');
        assert.equal(p.game, 'fuse');
        assert.equal(p.difficulty, tier);
        assert.equal(p.seed, seed);
        assert.equal(p.id, `fuse-${tier}-${seed.toString(36)}`);
        assert.ok(p.attempts >= 1 && p.attempts <= Gen.ATTEMPTS[tier]);
        const { board, waste } = checkBoard(p.board, tier, `${tier}#${seed}`);
        assert.equal(p.rows, board.rows);
        assert.equal(p.cols, board.cols);
        assert.equal(R.status(replay(board, p.solution)), 'won', 'the stored solution replays');
        assert.equal(p.metrics.muls, mulCount(board));
        if (tier !== 'hard') assert.equal(p.metrics.waste, waste);
        else assert.ok(waste >= p.metrics.waste, 'hard waste is counted up to the threshold');
        if (p.source === 'generated') generated++;
        boards.add(p.board);
        wastes[tier].push(Reasoning.trialMerges(R, board, 5000) - (R.tileCount(board) - 1));
        shapes[tier].add(shapeOf(board) + (mulCount(board) ? ' x2' : ''));
    }
    assert.equal(boards.size, 8, `${tier}: seeds give different puzzles`);
}
assert.equal(generated, total, `generated rather than curated (${generated}/${total})`);
const big = Gen.generate({ difficulty: 'easy', seed: 4294967295 });
assert.equal(big.id, `fuse-easy-${(4294967295).toString(36)}`);
assert.equal(big.seed, 4294967295);

// Tiers really differ: the waste ranges never overlap, and each tier mixes its shapes.
assert.ok(Math.max(...wastes.easy) < Math.min(...wastes.medium), `easy below medium (${wastes.easy} / ${wastes.medium})`);
assert.ok(Math.max(...wastes.medium) < Math.min(...wastes.hard), `medium below hard (${wastes.medium} / ${wastes.hard})`);
assert.ok(shapes.easy.has('3×3') && [...shapes.easy].some((s) => s !== '3×3'), `easy shapes ${[...shapes.easy]}`);
assert.ok([...shapes.medium].some((s) => s.startsWith('4×4')) && [...shapes.medium].some((s) => !s.startsWith('4×4')), `medium shapes ${[...shapes.medium]}`);
assert.ok(shapes.hard.has('4×4') && shapes.hard.has('4×4 x2'), `hard shapes ${[...shapes.hard]}`);
for (const tier of Gen.TIERS) assert.ok([...shapes[tier]].some((s) => s.endsWith(' x2')), `${tier} serves ×2 tiles (${[...shapes[tier]]})`);

// Curated fallbacks are valid members of their tier, and the fallback path is bounded.
for (const tier of Gen.TIERS) {
    const list = Gen.CURATED[tier];
    assert.ok(list.length >= 3);
    list.forEach((text, i) => {
        assert.equal(R.serialize(R.parse(text)), text, `curated ${tier}[${i}] is in canonical form`);
        const { board } = checkBoard(text, tier, `curated ${tier}[${i}]`);
        assert.ok(Gen.judge(board, tier, Solver.createSolver(R).solve(board)), `curated ${tier}[${i}] passes the generator's judge`);
    });
    let curated = 0;
    for (let seed = 1; seed <= 12; seed++) {
        const p = Gen.generate({ difficulty: tier, seed, attempts: 1 });
        assert.equal(p.attempts, 1);
        assert.equal(p.difficulty, tier);
        if (p.source === 'curated') {
            curated++;
            assert.equal(p.board, list[seed % list.length]);
            assert.equal(R.status(replay(R.parse(p.board), p.solution)), 'won');
            assert.ok(p.metrics, 'curated puzzles carry metrics');
            assert.deepEqual(Gen.generate({ difficulty: tier, seed, attempts: 1 }), p);
        }
    }
    assert.ok(curated > 0, `${tier}: one attempt sometimes falls back`);
}

// Unknown options fall back to supported ones instead of looping or throwing; an old size
// option is ignored.
const expert = Gen.generate({ difficulty: 'expert', seed: 3 });
assert.equal(expert.difficulty, 'medium');
assert.equal(expert.id, 'fuse-medium-3');
assert.deepEqual(Gen.generate({ size: 7, difficulty: 'easy', seed: 3 }), Gen.generate({ difficulty: 'easy', seed: 3 }));

// The async wrapper yields to the page and returns the same puzzle as the sync core.
(async () => {
    const progress = [];
    const p = await Gen.generatePuzzle('hard', 77, (f) => { progress.push(f); });
    assert.deepEqual(p, Gen.generate({ difficulty: 'hard', seed: 77 }));
    assert.ok(progress.every((f) => f > 0 && f <= 1));
    timings.sort((a, b) => a - b);
    const worst = timings[timings.length - 1];
    assert.ok(worst < 5000, `generation stays fast (worst ${worst} ms)`);
    const range = (xs) => `${Math.min(...xs)}–${Math.max(...xs)}`;
    console.log(`fuse generator: ok (${total} puzzles; waste easy ${range(wastes.easy)}, medium ${range(wastes.medium)}, hard ${range(wastes.hard)}; ` +
        `puzzle median ${timings[timings.length >> 1]} ms, worst ${worst} ms)`);
})().catch((err) => { console.error(err); process.exit(1); });
