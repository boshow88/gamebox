/* node tools/darts-cpu-strategy-check.js -- target decisions checked against the actual game rules. */
'use strict';
const assert = require('node:assert/strict');
const Rules = require('../js/games/darts-rules.js');
const CPU = require('../js/games/darts-cpu-strategy.js');
const fixed = () => 0.5;
const choose = (s, difficulty = 'insane') => CPU.choose(s, s.active, difficulty, fixed);
function game(config = {}) { return Rules.create({ mode: 'x01', roundLimit: 0, ...config }, ['A', 'B'], 1000); }
function remaining(score, config = {}, dart = 0) {
    const s = game(config); s.scores.A = s.turnStartScore = score; s.dart = dart; return s;
}
function apply(s, t) { return Rules.throwDart(s, s.active, Rules.scoreAt(t.x, t.y), 2000, t); }

// Every selectable point represents its advertised physical region on the real board.
for (let n = 1; n <= 20; n++) for (let mult = 1; mult <= 3; mult++) {
    const t = CPU.target(n, mult), r = Rules.scoreAt(t.x, t.y);
    assert.equal(r.base, n); assert.equal(r.mult, mult);
}
for (const mult of [1, 2]) assert.equal(Rules.scoreAt(CPU.target(25, mult).x, CPU.target(25, mult).y).mult, mult);
assert.equal(CPU.target(25, 3), null); assert.equal(CPU.target(0, 0), null);

for (const score of Rules.STARTING_SCORES) for (const difficulty of CPU.DIFFICULTIES) {
    const s = game({ startingScore: score }), before = JSON.stringify(s), t = choose(s, difficulty);
    assert(t && Number.isFinite(t.x) && Number.isFinite(t.y));
    assert.equal(JSON.stringify(s), before, 'Target selection leaves Match state untouched');
    assert.equal(Object.hasOwn(t, 'score'), false, 'CPU never assigns its own score');
}
for (const difficulty of CPU.DIFFICULTIES) {
    assert.equal(choose(remaining(32), difficulty).label, 'D16');
    assert.equal(choose(remaining(60, { outRule: 'open' }), difficulty).label, 'T20');
    assert.equal(choose(remaining(60, { outRule: 'master' }), difficulty).label, 'T20');
    const t = choose(remaining(50, { outRule: 'double', bullMode: '50-50' }), difficulty);
    assert.equal(t.label, 'BULL', 'An outer Bull worth 50 remains invalid for Double Out');
    assert.equal(apply(remaining(50, { outRule: 'double', bullMode: '50-50' }), t).lastDart.reason, 'checkout');
}
assert.equal(choose(remaining(50, { outRule: 'master', bullMode: '50-50' })).label, 'OUTER BULL');
for (const inRule of ['open', 'master', 'double']) for (const outRule of ['open', 'master', 'double']) {
    for (const bullMode of ['25-50', '50-50']) for (const difficulty of CPU.DIFFICULTIES) {
        for (const left of [2, 3, 15, 32, 40, 50, 53, 62, 99, 170, 301]) {
            const s = remaining(left, { inRule, outRule, bullMode });
            if (left < 301) s.entered.A = true;
            const t = choose(s, difficulty), next = apply(s, t);
            assert.notEqual(next.lastDart.reason, 'bust', `${difficulty} must not deliberately bust ${left}, ${inRule}/${outRule}/${bullMode}`);
            assert.equal(next.entered.A, true, `Entry ${difficulty}/${left}/${inRule}/${outRule}/${bullMode}: ${t.label}`);
        }
    }
}
for (const outRule of ['open', 'master', 'double']) for (const bullMode of ['25-50', '50-50']) {
    // The strong policy finds actual three-dart routes, then adapts to the remaining darts.
    for (const left of [32, 53, 62, 99, 100, 120, 160, 170]) {
        let s = remaining(left, { outRule, bullMode });
        for (let i = 0; i < 3 && s.status === 'playing' && s.active === 'A'; i++) s = apply(s, choose(s));
        assert.equal(s.winner, 'A', `Reachable ${outRule}/${bullMode} checkout ${left}`);
    }
}
// A one-dart checkout search must not depend on unused darts from the next turn.
const oneDart = remaining(62, {}, 2), setup = choose(oneDart);
assert.notEqual(apply(oneDart, setup).lastDart.reason, 'bust');
assert.equal(choose(game({ mode: 'countup' }), 'normal').label, 'BULL');
assert.equal(choose(game({ mode: 'countup' }), 'hard').label, 'T20');
assert.equal(choose(game({ mode: 'countup' }), 'insane').label, 'T20');
for (const difficulty of ['normal', 'hard', 'insane']) {
    assert.equal(choose(game({ mode: 'countup', bullMode: '50-50' }), difficulty).label, 'BULL',
        'The broad 50-point Bull is a better expected-value scoring target');
    assert.equal(choose(game({ mode: 'x01', bullMode: '50-50' }), difficulty).label, 'BULL');
}
assert.equal(choose(game({ mode: 'countup', bullMode: '50-50' }), 'easy').label, 'S20',
    'Easy can retain a simple suboptimal scoring policy');
assert.equal(choose(game({ mode: 'practice' })), null);

function cricket(variant, own, opponent) {
    const s = game({ mode: 'cricket', cricketVariant: variant });
    s.scores.A = own; s.scores.B = opponent;
    s.marks.A[20] = 3;
    // Leave other targets unfinished and useful for closing.
    return s;
}
assert.equal(choose(cricket('standard', 40, 100)).base, 20, 'Standard Cricket attacks to catch the score leader');
assert.equal(choose(cricket('cutthroat', 40, 100)).base, 19, 'Cut-Throat closes when already ahead on penalties');
assert.equal(choose(cricket('standard', 100, 40)).base, 19, 'Standard Cricket closes when already ahead');
assert.equal(choose(cricket('cutthroat', 100, 40)).base, 20, 'Cut-Throat attacks the lower-penalty rival');
let s = cricket('standard', 0, 0); s.marks.B[20] = 3;
assert.notEqual(choose(s).base, 20, 'A target closed by everyone has no remaining value');
for (const variant of ['standard', 'cutthroat']) {
    s = cricket(variant, 0, 0);
    Rules.TARGETS.forEach(n => { s.marks.A[n] = 3; }); s.marks.A[25] = 2;
    assert.equal(choose(s).base, 25, 'Close the final target when the score permits victory');
    assert.equal(apply(s, choose(s)).winner, 'A');
}
s = Rules.create({ mode: 'cricket', cricketVariant: 'cutthroat' }, ['A', 'B', 'C'], 0);
Rules.TARGETS.forEach(n => { s.marks.A[n] = s.marks.B[n] = 3; });
s.scores.A = 100; s.scores.B = 40; s.scores.C = 0;
assert.notEqual(choose(s)?.base, 20, 'Do not penalize only C and award the closed opponent B a win');

for (const purpose of ['opening', 'tie', 'limit']) {
    s = game(); s.phase = 'cork'; s.corkPurpose = purpose; s.corkPlayers = ['A', 'B'];
    for (const difficulty of CPU.DIFFICULTIES) assert.deepEqual(choose(s, difficulty), CPU.target(25, 2));
    s.corkPlayers = ['B']; assert.equal(choose(s), null, 'Excluded players never rethrow Cork');
}
s = game(); assert.equal(CPU.choose(s, 'B', 'normal', fixed), null);
s.withdrawn = ['A']; assert.equal(choose(s), null);
s = game(); s.status = 'over'; assert.equal(choose(s), null);
console.log('Darts CPU strategy checks passed: physical targets, 6 X01 scores, all In/Out/Bull rules, checkout routes, distinct Cricket tactics and Cork eligibility.');
