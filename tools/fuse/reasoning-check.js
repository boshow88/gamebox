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
const rankOf = (s) => s.level * 1000 + (s.verifiedBySearch ? 100 : 0) + s.cost;
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
assert.equal(Reasoning.refute(Reasoning.context(R), R.parse('2 2 4'), { from: 1, to: 0 }, 1).reason.id, 'dead-end');
// ×2 tiles. The 8's only partner is the ×2, yet merging them loses: the 4 has to use the ×2
// first, leaving an 8 beside the 8. So a ×2 partner never makes a forced pair.
assert.deepEqual(Reasoning.forcedPairs(R, R.parse('8 x2 4')), []);
{
    const s = Reasoning.nextStep(R, R.parse('8 x2 4'));
    assert.equal(s.technique, 'eliminate');
    assert.deepEqual([s.move.from, s.move.to], [2, 1]);
}
{
    const s = Reasoning.nextStep(R, R.parse('16 x2'));
    assert.equal(s.technique, 'final');
    assert.equal(s.alternatives.length, 2, 'a ×2 finishes in either direction');
}
assert.equal(Reasoning.nextStep(R, R.parse('x2 x2')).technique, 'dead-end', 'two ×2 tiles alone are stuck');
assert.equal(Reasoning.mergeSize(R.parse('8 x2'), { from: 1, to: 0 }), 8, 'a ×2 merge is as big as its number');
assert.equal(Reasoning.mergeSize(R.parse('8 x2'), { from: 0, to: 1 }), 8);

// Every reachable state of generated boards: every candidate step on a solvable board wins,
// every refuted merge loses, explainDead never fires on a solvable board, and nextStep only
// recommends winning merges with all equivalent alternatives listed.
// A third of the 3×3 boards carry ×2 tiles; the last is a 3×4 board.
const rng = Gen.makeRng(4242), styles = Object.keys(Gen.STYLES), exps = Gen.EXPONENTS[9];
const techniques = {}, reasons = {};
let states = 0, unsolvableStates = 0, unexplained = 0, mulStates = 0;
for (let n = 0; n < 19; n++) {
    const cols = n === 18 ? 4 : 3, muls = n % 3 === 2 ? 1 + (n % 2) : 0;
    const built = Gen.reverseBuild(rng, 3, cols, (cols === 4 ? 6 : exps[n % exps.length]) + muls, styles[n % styles.length], muls);
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
        if (!R.numbersOnly(b)) mulStates++;
        const exact = solver.analyze(b);
        const outcome = (m) => { const hit = exact.moves.find((x) => same(x, m)); return hit ? hit.outcome : 'lose'; };
        const dead = Reasoning.explainDead(R, b);
        if (exact.status === 'solvable') {
            assert.equal(dead, null, 'explainDead on solvable ' + R.serialize(b));
            const valid = Reasoning.candidates(R, b).filter((s) => !s.verifiedBySearch || s.alternatives.every((m) => outcome(m) === 'win'));
            for (const step of valid) {
                assert.equal(outcome(step.move), 'win', `${step.technique} on ${R.serialize(b)}`);
                for (const r of step.refuted || []) assert.equal(outcome(r.move), 'lose', `refuted by ${r.reason.id} on ${R.serialize(b)}`);
                for (const alt of step.alternatives || []) assert.equal(outcome(alt), 'win');
                if (step.technique === 'trial') assert.equal(R.status(replay(b, step.chain)), 'won', 'trial chain wins');
            }
            const step = Reasoning.nextStep(R, b, { solver });
            // The easiest valid candidate; trials only count when nothing below level 5 holds.
            const easy = valid.filter((s) => s.level < 5);
            const expected = (easy.length ? easy : valid).sort((x, y) => rankOf(x) - rankOf(y))[0];
            if (R.tileCount(b) === 2) assert.equal(step.technique, 'final');
            else if (expected) assert.deepEqual([step.technique, step.move], [expected.technique, expected.move], 'nextStep picks the easiest valid step on ' + R.serialize(b));
            else assert.equal(step.technique, 'search');
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
assert.ok(mulStates > 300, `states with a ×2 tile checked (${mulStates})`);
for (const id of ['final', 'lone', 'only-pair', 'forced-pair', 'trial', 'search']) assert.ok(techniques[id] > 0, `technique ${id} exercised`);
for (const id of ['dead-end', 'stuck']) assert.ok(reasons[id] > 0, `reason ${id} exercised`);

// Lower level caps never invent deductions: they fall back to search (or easier steps).
{
    let built = null;
    for (let seed = 5; !built; seed++) built = Gen.reverseBuild(Gen.makeRng(seed), 3, 3, 6, 'deep');
    const capped = Reasoning.humanPath(R, built.board, { maxLevel: 2 });
    assert.ok(capped.steps.every((s) => s.level <= 2 || s.level === Reasoning.SEARCH));
}

// Trial merges recomputed from the definition: smallest first (the number a ×2 doubles
// counts for a ×2 merge; board order among equals), skipping results with a dead end or a
// level <= 2 contradiction, undoing when stuck, remembering failed positions.
function trialReference(board) {
    const failed = new Set();
    let merges = 0;
    const size = (b, m) => (b.cells[m.from].type === 'mul' ? b.cells[m.to].value : b.cells[m.from].value);
    const solve = (b) => {
        if (R.tileCount(b) === 1) return true;
        if (failed.has(R.key(b))) return false;
        const options = R.legalMoves(b).map((m, i) => ({ i, value: size(b, m), next: R.applyMerge(b, m) }))
            .filter((o) => { const d = Reasoning.explainDead(R, o.next); return !d || d.level > 2; })
            .sort((x, y) => x.value - y.value || x.i - y.i);
        for (const o of options) { merges++; if (solve(o.next)) return true; }
        failed.add(R.key(b));
        return false;
    };
    solve(board);
    return merges;
}

// Human path: the replayable easiest-step walk. Trial merges: as defined, at least the
// minimum on a solvable board, reproducible, capped, and finite on lost boards.
let backtracked = 0;
for (let n = 0; n < 40; n++) {
    const muls = n % 3 === 0 ? 1 : 0;
    const built = Gen.reverseBuild(rng, 3, 3, exps[n % exps.length] + muls, styles[(n + 1) % styles.length], muls);
    if (!built) continue;
    const path = Reasoning.humanPath(R, built.board);
    assert.equal(path.complete, true);
    assert.equal(R.status(replay(built.board, path.steps.map((s) => s.move))), 'won');
    assert.equal(path.steps.length, R.tileCount(built.board) - 1);
    assert.equal(path.maxLevel, Math.max(...path.steps.map((s) => s.level)));
    assert.equal(path.searchSteps, path.steps.filter((s) => s.level === Reasoning.SEARCH).length);
    const stopped = Reasoning.humanPath(R, built.board, { stopAtSearch: true });
    assert.equal(stopped.complete, path.searchSteps === 0);
    const merges = Reasoning.trialMerges(R, built.board);
    assert.equal(merges, trialReference(built.board), 'trial merges follow the definition on ' + R.serialize(built.board));
    assert.ok(merges >= R.tileCount(built.board) - 1);
    if (merges > R.tileCount(built.board) - 1) backtracked++;
    assert.equal(Reasoning.trialMerges(R, built.board), merges, 'reproducible');
    assert.equal(Reasoning.trialMerges(R, built.board, 3), Math.min(3, merges), 'capped');
}
assert.ok(backtracked > 0, 'some boards need undoing');
assert.equal(Reasoning.humanPath(R, R.parse('2 2 1')).complete, false);
assert.equal(Reasoning.humanPath(R, R.parse('2 2 1')).steps.length, 0);
assert.equal(Reasoning.trialMerges(R, R.parse('2 2')), 1);
assert.equal(Reasoning.trialMerges(R, R.parse('4 2 2')), 2, 'the 2s merge toward the 4, then the 4s');
assert.equal(Reasoning.trialMerges(R, R.parse('2 2 1')), 0, 'every merge is visibly lost');
assert.equal(Reasoning.visiblyLost(R, R.parse('2 2 1')), true);
assert.equal(Reasoning.visiblyLost(R, R.parse('2 . 2')), true, 'nothing can merge');
assert.equal(Reasoning.visiblyLost(R, R.parse('2 2 . 4 4')), false, 'a split needs a closer look (level 3)');
assert.equal(Reasoning.visiblyLost(R, R.parse('8')), false);

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

console.log(`fuse reasoning: ok (${states} states, ${mulStates} with a ×2 tile, ${unsolvableStates} lost, ${unexplained} lost without a deduction; ` +
    `next steps ${JSON.stringify(techniques)}; refutations ${JSON.stringify(reasons)})`);
