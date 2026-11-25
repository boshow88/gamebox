/** node tools/sumbreak/generator-check.js — reproducible, verified, correctly tiered puzzles. */
'use strict';
const assert = require('node:assert/strict');
const Rules = require('../../js/games/sumbreak/rules.js');
const Solver = require('../../js/games/sumbreak/solver.js');
const Reasoning = require('../../js/games/sumbreak/reasoning.js');
const Gen = require('../../js/generators/sumbreak.js');
const R = Rules.DEFAULT;

function replay(board, moves) {
    let b = board;
    for (const m of moves) { assert.ok(R.canMerge(b, m.from, m.to), 'solution move is legal'); b = R.applyMerge(b, m); }
    return b;
}
const shapeOf = (board) => `${board.rows}×${board.cols}`;
const mulCount = (board) => board.cells.filter((c) => c && c.type === 'mul').length;
const mostMuls = (tier, cells) => Math.max(0, ...(Gen.MULS[tier][cells] || []).filter((m) => m[1] > 0).map((m) => m[0]));

// A puzzle text belongs to `tier`, recomputed without the generator's shortcuts: the board
// starts full in one of the tier's shapes, with no more ×2 tiles than the tier allows there, the
// waste (merges a smallest-first player makes and undoes) and the first-try chance are in
// range, and reasoning alone solves it.
function checkBoard(text, tier, label) {
    const board = R.parse(text);
    assert.ok(Gen.SHAPES[tier].some(([rows, cols]) => rows === board.rows && cols === board.cols), `${label}: ${shapeOf(board)} is a ${tier} shape`);
    assert.equal(R.tileCount(board), board.rows * board.cols, `${label}: starts full`);
    const muls = mulCount(board);
    assert.ok(muls <= mostMuls(tier, board.rows * board.cols), `${label}: ${muls} ×2 tiles on ${shapeOf(board)}`);
    assert.ok(board.cells.every((c) => c.type === 'num' || c === R.mul(2)), `${label}: only numbers and ×2 tiles`);
    assert.equal(Math.min(...board.cells.filter((c) => c.type === 'num').map((c) => c.value)), 1, `${label}: the smallest number is 1`);
    const range = Gen.DIFFICULTY[tier], minimum = R.tileCount(board) - 1;
    const waste = Reasoning.trialMerges(R, board, minimum + (range.max === Infinity ? range.min : range.max + 1)) - minimum;
    assert.ok(waste >= range.min && waste <= range.max, `${label}: waste ${waste} within ${tier}`);
    const path = Reasoning.humanPath(R, board, { stopAtSearch: true });
    assert.equal(path.complete, true, `${label}: solved by reasoning alone`);
    assert.equal(path.searchSteps, 0);
    let firstTry = null;
    if (range.firstTry) {
        firstTry = 100 * Reasoning.firstTryWin(R, board, Solver.createSolver(R));
        assert.ok(firstTry >= range.firstTry.min && firstTry <= range.firstTry.max, `${label}: first-try ${firstTry.toFixed(1)}% within ${tier}`);
    }
    return { board, waste, firstTry };
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

// Normalizing (dividing every number by the smallest) keeps the puzzle: the same merges,
// contradictions, solvability, waste and reasoning path.
{
    const rng = Gen.makeRng(57), styles = Object.keys(Gen.STYLES);
    const scale = (b, f) => R.withCells(b, b.cells.map((c) => (c && c.type === 'num' ? R.num(c.value * f) : c)));
    const outline = (b) => {
        const path = Reasoning.humanPath(R, b, { stopAtSearch: true });
        return {
            moves: R.legalMoves(b).map(Rules.moveKey), contradictions: R.contradictions(b).map((c) => c.id),
            solvable: Solver.createSolver(R).isSolvable(b), waste: Reasoning.trialMerges(R, b, 400),
            path: path.steps.map((s) => s.technique + ':' + Rules.moveKey(s.move)), complete: path.complete,
        };
    };
    let checked = 0;
    for (let n = 0; n < 40; n++) {
        const [rows, cols] = [[3, 3], [3, 4], [4, 3]][n % 3], muls = n % 2;
        const exps = Gen.EXPONENTS[rows * cols];
        const built = Gen.reverseBuild(rng, rows, cols, exps[n % exps.length] + muls, styles[n % 3], muls);
        if (!built) continue;
        checked++;
        const b = built.board, big = scale(b, 1 << (1 + (n % 3)));
        assert.equal(Math.min(...b.cells.filter((c) => c.type === 'num').map((c) => c.value)), 1, 'builds are normalized');
        assert.equal(R.key(Gen.normalize(big)), R.key(b), 'normalize undoes scaling');
        assert.deepEqual(outline(big), outline(b), `scaling keeps the puzzle (${R.serialize(b)})`);
    }
    assert.ok(checked > 30, `normalized builds checked (${checked})`);
    assert.equal(R.serialize(Gen.normalize(R.parse('8 x2/. 16'))), '1 x2/. 2');
}

// Generated puzzles: deterministic per seed, verified, and in the requested tier.
const timings = {}, wastes = {}, chances = {}, shapes = {}, mulCounts = {};
let generated = 0, total = 0;
for (const tier of Gen.TIERS) {
    const boards = new Set();
    timings[tier] = []; wastes[tier] = []; chances[tier] = []; shapes[tier] = new Set(); mulCounts[tier] = new Set();
    for (let seed = 1; seed <= 8; seed++) {
        const t0 = Date.now();
        const p = Gen.generate({ difficulty: tier, seed });
        timings[tier].push(Date.now() - t0);
        total++;
        assert.deepEqual(Gen.generate({ difficulty: tier, seed }), p, 'same seed, same puzzle');
        assert.equal(p.game, 'fuse');
        assert.equal(p.difficulty, tier);
        assert.equal(p.seed, seed);
        assert.equal(p.id, `fuse-${tier}-${seed.toString(36)}`);
        assert.ok(p.attempts >= 1 && p.attempts <= Gen.ATTEMPTS[tier]);
        const { board, waste, firstTry } = checkBoard(p.board, tier, `${tier}#${seed}`);
        assert.equal(p.rows, board.rows);
        assert.equal(p.cols, board.cols);
        assert.equal(R.status(replay(board, p.solution)), 'won', 'the stored solution replays');
        assert.equal(p.metrics.muls, mulCount(board));
        if (Gen.DIFFICULTY[tier].max !== Infinity) assert.equal(p.metrics.waste, waste);
        else assert.ok(waste >= p.metrics.waste, `${tier} waste is counted up to the threshold`);
        if (firstTry !== null) {
            assert.equal(p.metrics.firstTry, Math.round(firstTry * 10) / 10, 'the first-try chance does not depend on the solver budget');
            chances[tier].push(firstTry);
        } else assert.equal(p.metrics.firstTry, undefined);
        if (p.source === 'generated') generated++;
        boards.add(p.board);
        wastes[tier].push(Reasoning.trialMerges(R, board, 5000) - (R.tileCount(board) - 1));
        shapes[tier].add(shapeOf(board) + (mulCount(board) ? ' x2' : ''));
        mulCounts[tier].add(mulCount(board));
    }
    assert.equal(boards.size, 8, `${tier}: seeds give different puzzles`);
}
assert.equal(generated, total, `generated rather than curated (${generated}/${total})`);
const big = Gen.generate({ difficulty: 'easy', seed: 4294967295 });
assert.equal(big.id, `fuse-easy-${(4294967295).toString(36)}`);
assert.equal(big.seed, 4294967295);

// Tiers really differ: Easy's waste stays below Medium's, Medium's first-try chance above
// Hard's, and the shapes are each tier's.
assert.ok(Math.max(...wastes.easy) < Math.min(...wastes.medium), `easy below medium (${wastes.easy} / ${wastes.medium})`);
assert.ok(Math.min(...chances.medium) > Math.max(...chances.hard), `medium first-try above hard (${chances.medium.map(Math.round)} / ${chances.hard.map(Math.round)})`);
assert.ok(shapes.easy.has('3×3') && [...shapes.easy].some((s) => s !== '3×3'), `easy shapes ${[...shapes.easy]}`);
for (const tier of ['medium', 'hard']) assert.ok(shapes[tier].has('4×4') && shapes[tier].has('4×4 x2') && shapes[tier].size === 2, `${tier} shapes ${[...shapes[tier]]}`);
for (const tier of Gen.TIERS) assert.ok([...shapes[tier]].some((s) => s.endsWith(' x2')), `${tier} serves ×2 tiles (${[...shapes[tier]]})`);
assert.ok(mulCounts.hard.has(2), `hard serves boards with two ×2 tiles (${[...mulCounts.hard]})`);

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
    // Hard is made ahead of time in the page (a worker), so it may take longer.
    const worst = (tier) => Math.max(...timings[tier]);
    assert.ok(worst('easy') < 1000 && worst('medium') < 5000 && worst('hard') < 25000, `generation stays fast (worst ${Gen.TIERS.map(worst)} ms)`);
    const range = (xs) => `${Math.round(Math.min(...xs))}–${Math.round(Math.max(...xs))}`;
    const median = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
    console.log(`sumbreak generator: ok (${total} puzzles; waste easy ${range(wastes.easy)}, medium ${range(wastes.medium)}, hard ${range(wastes.hard)}; ` +
        `first-try medium ${range(chances.medium)}%, hard ${range(chances.hard)}%; median ms ${Gen.TIERS.map((t) => median(timings[t]))}, worst ${Gen.TIERS.map(worst)})`);
})().catch((err) => { console.error(err); process.exit(1); });
