/** node tools/fuse/reasoning-check.js — human techniques are sound under the exact rules,
 * hints never hide alternatives, and search is always labelled as search. */
'use strict';
const assert = require('node:assert/strict');
const Rules = require('../../js/games/fuse/rules.js');
const Solver = require('../../js/games/fuse/solver.js');
const Reasoning = require('../../js/games/fuse/reasoning.js');
const Gen = require('../../js/generators/fuse.js');
const R = Rules.DEFAULT;

const same = (a, b) => Rules.sameMove(a, b);
const winsOf = (a) => a.moves.filter((m) => m.outcome === 'win');
function replay(board, moves) {
    let b = board;
    for (const m of moves) { assert.ok(R.canMerge(b, m.from, m.to), 'chain move is legal'); b = R.applyMerge(b, m); }
    return b;
}

// Crafted positions with a known easiest step.
{
    const s = Reasoning.nextStep(R, R.parse('2 2'));
    assert.equal(s.technique, 'final');
    assert.equal(s.alternatives.length, 2, 'both final directions are offered');
}
{
    const s = Reasoning.nextStep(R, R.parse('2 2 4'));
    assert.equal(s.technique, 'lone');
    assert.deepEqual([s.move.from, s.move.to], [0, 1]);
    assert.equal(s.level, 1);
}
{
    const s = Reasoning.nextStep(R, R.parse('2 2/4 8'));
    assert.equal(s.technique, 'only-pair');
    assert.deepEqual([s.move.from, s.move.to], [1, 0]);
    assert.equal(s.direction, 'refuted');
    assert.equal(s.refuted[0].reason.id, 'dead-end');
}
{
    const s = Reasoning.nextStep(R, R.parse('2 . 2'));
    assert.equal(s.technique, 'dead-end');
    assert.equal(s.reason.id, 'dead-end');
}
{
    const s = Reasoning.nextStep(R, R.parse('2 2 1'));
    assert.equal(s.technique, 'unsolvable');
    assert.equal(s.reason.id, 'stuck');
    assert.equal(s.verifiedBySearch, false, 'the reason is a deduction, not a search result');
}
assert.equal(Reasoning.nextStep(R, R.parse('. 8')).technique, 'won');
assert.equal(Reasoning.explainDead(R, R.parse('4 4/8 16')), null);
assert.equal(Reasoning.refute({ R, maxLevel: 5, depth: 3, trialDepth: 8 }, R.parse('2 2 4'), { from: 1, to: 0 }, 1).reason.id, 'dead-end');

// Every reachable state of generated boards: every candidate step on a solvable board wins,
// every refuted merge loses, explainDead never fires on a solvable board, and nextStep only
// recommends winning merges with all equivalent alternatives listed.
const rng = Gen.makeRng(4242), styles = Object.keys(Gen.STYLES), exps = Gen.PLAN[3].exponents;
const techniques = {}, reasons = {};
let states = 0, unsolvableStates = 0, unexplained = 0;
for (let n = 0; n < 18; n++) {
    const built = Gen.reverseBuild(rng, 3, 3, exps[n % exps.length], styles[n % styles.length]);
    if (!built) continue;
    const solver = Solver.createSolver(R);
    const seen = new Set();
    const stack = [built.board];
    while (stack.length) {
        const b = stack.pop(), k = R.key(b);
        if (seen.has(k)) continue;
        seen.add(k);
        if (R.tileCount(b) < 2) continue;
        states++;
        const exact = solver.analyze(b);
        const outcome = (m) => { const hit = exact.moves.find((x) => same(x, m)); return hit ? hit.outcome : 'lose'; };
        const dead = Reasoning.explainDead(R, b);
        if (exact.status === 'solvable') {
            assert.equal(dead, null, 'explainDead on solvable ' + R.serialize(b));
            for (const step of Reasoning.candidates(R, b, outcome)) {
                assert.equal(outcome(step.move), 'win', `${step.technique} on ${R.serialize(b)}`);
                for (const r of step.refuted || []) assert.equal(outcome(r.move), 'lose', `refuted by ${r.reason.id} on ${R.serialize(b)}`);
                for (const alt of step.alternatives || []) assert.equal(outcome(alt), 'win');
                if (step.technique === 'trial') assert.equal(R.status(replay(b, step.chain)), 'won', 'trial chain wins');
            }
            const step = Reasoning.nextStep(R, b, { solver });
            techniques[step.technique] = (techniques[step.technique] || 0) + 1;
            for (const r of step.refuted || []) reasons[r.reason.id] = (reasons[r.reason.id] || 0) + 1;
            assert.equal(step.validated, true);
            assert.equal(outcome(step.move), 'win', `nextStep ${step.technique} on ${R.serialize(b)}`);
            const wins = winsOf(exact);
            if (step.technique === 'search') {
                assert.equal(step.level, Reasoning.SEARCH);
                assert.equal(step.verifiedBySearch, true);
                assert.equal(step.alternatives.length, wins.length, 'search lists every winning merge');
            } else {
                assert.ok(step.level <= 5);
            }
            if (step.technique === 'free') {
                assert.equal(step.verifiedBySearch, true);
                assert.equal(step.alternatives.length, wins.length, 'a free choice lists every winning merge');
            }
            if (step.technique === 'eliminate') assert.equal(wins.length, 1, 'elimination leaves exactly one winning merge');
            if (step.technique === 'only-pair') assert.ok(wins.every((m) => [m.from, m.to].sort().join() === step.pair.slice().sort().join()));
        } else {
            unsolvableStates++;
            const step = Reasoning.nextStep(R, b, { solver });
            assert.ok(['unsolvable', 'dead-end'].includes(step.technique));
            assert.equal(step.move, undefined, 'no merge is recommended on a lost board');
            if (step.technique === 'unsolvable' && !step.reason) { unexplained++; assert.equal(step.verifiedBySearch, true); assert.equal(step.level, Reasoning.SEARCH); }
        }
        for (const m of R.legalMoves(b)) stack.push(R.applyMerge(b, m));
    }
}
assert.ok(states > 2000, `states checked (${states})`);
for (const id of ['final', 'lone', 'only-pair', 'forced-pair', 'trial', 'search']) assert.ok(techniques[id] > 0, `technique ${id} exercised`);
for (const id of ['dead-end', 'stuck']) assert.ok(reasons[id] > 0, `reason ${id} exercised`);

// Lower level caps never invent deductions: they fall back to search (or easier steps).
{
    let built = null;
    for (let seed = 5; !built; seed++) built = Gen.reverseBuild(Gen.makeRng(seed), 3, 3, 6, 'deep');
    const board = built.board, solver = Solver.createSolver(R);
    const capped = Reasoning.evaluate(R, board, { solver, maxLevel: 2 });
    assert.ok(capped.path.every((p) => p.level <= 2 || p.level === Reasoning.SEARCH));
}

// Evaluate: the path is the replayable easiest-step walk and the metrics summarise it.
for (let n = 0; n < 12; n++) {
    const built = Gen.reverseBuild(rng, 3, 3, exps[n % exps.length], styles[(n + 1) % styles.length]);
    if (!built) continue;
    const m = Reasoning.evaluate(R, built.board);
    assert.equal(m.solvable, true);
    assert.equal(R.status(replay(built.board, m.path.map((p) => p.move))), 'won');
    assert.equal(m.path.length, R.tileCount(built.board) - 1);
    assert.equal(m.maxLevel, Math.max(...m.path.map((p) => p.level)));
    assert.equal(m.span, Math.max(...m.path.map((p) => p.span)));
    assert.equal(Object.values(m.levelCounts).reduce((a, b) => a + b, 0), m.path.length);
    assert.equal(m.searchSteps, m.levelCounts[6]);
    assert.ok(m.plans >= 1 && m.plans <= 50);
    assert.ok(m.randomWin > 0 && m.randomWin <= 1);
    // Skipping only merges that are certainly lost can never lower the win chance.
    assert.ok(m.casualWin >= m.randomWin - 1e-12 && m.casualWin <= 1);
    assert.ok(Math.abs(m.casualWin - casualReference(built.board)) < 1e-9, 'casual win matches a solver-free recursion');
}
// The casual player, recomputed without the solver: random among merges whose result shows
// no dead end or level <= 2 contradiction, falling back to any merge.
function casualReference(board, memo = new Map()) {
    const n = R.tileCount(board);
    if (n <= 1) return n;
    const key = R.key(board);
    if (memo.has(key)) return memo.get(key);
    const kids = R.legalMoves(board).map((m) => R.applyMerge(board, m));
    const fine = kids.filter((c) => { const d = Reasoning.explainDead(R, c); return !d || d.level > 2; });
    const pool = fine.length ? fine : kids;
    const v = pool.length ? pool.reduce((s, c) => s + casualReference(c, memo), 0) / pool.length : 0;
    memo.set(key, v);
    return v;
}
const lost = Reasoning.evaluate(R, R.parse('2 2 1'));
assert.equal(lost.solvable, false);
assert.equal(lost.path.length, 0);
assert.equal(Reasoning.casualWin(R, R.parse('2 2 1'), Solver.createSolver(R)), 0);
assert.equal(Reasoning.casualWin(R, R.parse('2 2'), Solver.createSolver(R)), 1);

// Other tile types: number-specific techniques stay silent, every hint still wins, and
// anything not explained by generic techniques is labelled search.
const STAR = Object.freeze({ type: 'star' });
const X = Rules.createRules({
    tileTypes: { star: { tile: true, token: () => '*', parse: (t) => (t === '*' ? STAR : undefined) } },
    merges: { 'num>star': (src) => src, 'star>num': (src, dst) => dst },
});
const generic = new Set(['final', 'only-pair', 'eliminate', 'free', 'trial', 'search']);
let starSteps = 0;
for (const text of ['2 * 2/4 4 8', '* 1 1/2 * 4', '4 4 */8 * 16', '1 1 */2 4 *', '* 2 2/* 4 8']) {
    const board = X.parse(text);
    const solver = Solver.createSolver(X);
    let b = board;
    while (X.status(b) === 'playing') {
        const exact = solver.analyze(b);
        const step = Reasoning.nextStep(X, b, { solver });
        if (exact.status !== 'solvable') { assert.ok(['unsolvable', 'unknown'].includes(step.technique)); break; }
        if (!X.numbersOnly(b)) assert.ok(generic.has(step.technique), `${step.technique} with special tiles on ${X.serialize(b)}`);
        assert.equal(exact.moves.find((m) => same(m, step.move)).outcome, 'win');
        starSteps++;
        b = X.applyMerge(b, step.move);
    }
}
assert.ok(starSteps > 5, `special-tile steps exercised (${starSteps})`);

console.log(`fuse reasoning: ok (${states} states, ${unsolvableStates} lost, ${unexplained} lost without a deduction; ` +
    `next steps ${JSON.stringify(techniques)}; refutations ${JSON.stringify(reasons)})`);
