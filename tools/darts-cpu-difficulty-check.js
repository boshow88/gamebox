/* Compatibility and actual physical skill progression across the sixteen CPU levels. */
'use strict';
const assert = require('node:assert/strict');
const Difficulty = require('../js/games/darts-cpu-difficulty.js');
const Gesture = require('../js/games/darts-cpu-gesture.js');
const Strategy = require('../js/games/darts-cpu-strategy.js');
const Rules = require('../js/games/darts-rules.js');
const physics = require('./helpers/darts-physics.js')(), cpu = Gesture.create(physics);
assert.deepEqual(Difficulty.profiles[0], { velocity: 380, timing: .055, shape: .12, lapse: .13, lapseVelocity: 650 }, 'Easy I retains its original physical difficulty');
assert.deepEqual(Difficulty.profiles[15], { velocity: 30, timing: .006, shape: .009, lapse: .004, lapseVelocity: 650 }, 'Insane IV retains its original physical difficulty');
assert.equal(Difficulty.strength(0), 0); assert.equal(Difficulty.strength(15), 15);
const noExtraRandom = () => { throw Error('Endpoints must not consume a policy blending draw'); };
assert.equal(Difficulty.strategy(0, noExtraRandom), 'easy');
assert.equal(Difficulty.strategy(15, noExtraRandom), 'insane');
assert.deepEqual(Difficulty.legacy, { easy: 1, normal: 6, hard: 11, insane: 14 });
assert.equal(Difficulty.defaultLevel, 6);
for (const bad of [-1, 16, 1.5, NaN, Infinity, null, undefined, false, {}, '', '01', '16', '1.5', 'bogus']) {
    assert.equal(Difficulty.valid(bad), false, String(bad));
    assert.equal(Difficulty.normalize(bad), 6);
}
for (const n of Difficulty.values) {
    assert(Difficulty.valid(n)); assert(Difficulty.valid(String(n)));
    assert.equal(Difficulty.normalize(String(n)), n);
    if (n && n < 15) assert(Difficulty.strength(n) < n, 'Every intermediate level is easier than its previous strength');
    if (n) {
        assert(Difficulty.strength(n) > Difficulty.strength(n - 1), 'Strength remains strictly ordered');
        for (const key of ['velocity', 'timing', 'shape', 'lapse']) assert(Difficulty.profiles[n][key] < Difficulty.profiles[n - 1][key]);
    }
}
for (const [alias, n] of Object.entries(Difficulty.legacy)) {
    for (const mode of ['x01', 'countup', 'cricket']) {
        const state = Rules.create({ mode }, ['A', 'B'], 0, 0);
        const a = Gesture.seeded(alias), b = Gesture.seeded(alias);
        for (let i = 0; i < 20; i++) {
            const ta = Strategy.choose(state, state.active, alias, a), tb = Strategy.choose(state, state.active, n, b);
            assert.deepEqual(ta, tb, 'Legacy and numeric tactics agree');
            assert.deepEqual(cpu.generate(ta, alias, a).samples, cpu.generate(tb, n, b).samples, 'Legacy and numeric physical gestures agree');
        }
    }
}
const rows = [];
for (const n of Difficulty.values) {
    const state = Rules.create({ mode: 'countup' }, ['A'], 0, 0), rng = Gesture.seeded('scale-progression');
    let points = 0, misses = 0, distance = 0, corkDarts = 0;
    const corkRng = Gesture.seeded('scale-cork');
    for (let i = 0; i < 6000; i++) {
        const target = Strategy.choose(state, 'A', n, rng), samples = cpu.generate(target, n, rng).samples;
        const analysis = physics.analyseGesture(samples);
        if (analysis.valid) {
            const hit = physics.computeImpact(physics.computeThrow(analysis)), result = Rules.scoreAt(hit.x, hit.y);
            points += result.score; misses += Number(result.score === 0);
        } else misses++;
        const cork = cpu.generate(Strategy.target(25, 2), n, corkRng).samples;
        const corkAnalysis = physics.analyseGesture(cork);
        if (corkAnalysis.valid) {
            const hit = physics.computeImpact(physics.computeThrow(corkAnalysis));
            distance += Math.hypot(hit.x, hit.y); corkDarts++;
        }
    }
    rows.push({ level: n + 1, PPR: +(points / 2000).toFixed(2), missPct: +(misses / 60).toFixed(2), corkMM: +(distance / corkDarts).toFixed(2) });
}
for (let i = 1; i < rows.length; i++) {
    assert(rows[i].PPR > rows[i - 1].PPR, 'Physical scoring must improve between levels ' + i + ' and ' + (i + 1));
    assert(rows[i].corkMM < rows[i - 1].corkMM, 'Cork precision must improve between adjacent levels');
}
assert.deepEqual([rows[0], rows[15]], [
    { level: 1, PPR: 19.56, missPct: 48.4, corkMM: 125.53 },
    { level: 16, PPR: 109.64, missPct: .3, corkMM: 9.84 }
], 'Seeded endpoint scoring and Cork results remain unchanged by the curve');
console.log(JSON.stringify(rows));
console.log('PASS: sixteen-level validation, fixed endpoint profiles/tactics, easier ordered intermediate strengths, legacy gesture/tactic compatibility and increasing physical scoring/Cork precision.');
