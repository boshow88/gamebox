/* Compatibility and actual physical skill progression across the sixteen CPU levels. */
'use strict';
const assert = require('node:assert/strict');
const Difficulty = require('../js/games/darts-cpu-difficulty.js');
const Gesture = require('../js/games/darts-cpu-gesture.js');
const Strategy = require('../js/games/darts-cpu-strategy.js');
const Rules = require('../js/games/darts-rules.js');
const physics = require('./helpers/darts-physics.js')(), cpu = Gesture.create(physics);
const old = {
    easy: { velocity: 300, timing: .045, shape: .10, lapse: .10, lapseVelocity: 650 },
    normal: { velocity: 100, timing: .030, shape: .055, lapse: .04, lapseVelocity: 650 },
    hard: { velocity: 55, timing: .015, shape: .025, lapse: .015, lapseVelocity: 650 },
    insane: { velocity: 36, timing: .008, shape: .012, lapse: .006, lapseVelocity: 650 }
};
assert.deepEqual(Difficulty.legacy, { easy: 1, normal: 6, hard: 11, insane: 14 });
assert.equal(Difficulty.defaultLevel, 6);
for (const bad of [-1, 16, 1.5, NaN, Infinity, null, undefined, false, {}, '', '01', '16', '1.5', 'bogus']) {
    assert.equal(Difficulty.valid(bad), false, String(bad));
    assert.equal(Difficulty.normalize(bad), 6);
}
for (const n of Difficulty.values) {
    assert(Difficulty.valid(n)); assert(Difficulty.valid(String(n)));
    assert.equal(Difficulty.normalize(String(n)), n);
    if (n) for (const key of ['velocity', 'timing', 'shape', 'lapse']) assert(Difficulty.profiles[n][key] < Difficulty.profiles[n - 1][key]);
}
for (const [alias, n] of Object.entries(Difficulty.legacy)) {
    assert.deepEqual(Difficulty.profiles[n], old[alias], 'The original execution profile stays exact');
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
console.log(JSON.stringify(rows));
console.log('PASS: sixteen-level validation, exact legacy anchors, seeded gesture/tactic compatibility and increasing physical scoring/Cork precision.');
