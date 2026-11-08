/* Compatibility and actual physical skill progression across the sixteen CPU levels. */
'use strict';
const assert = require('node:assert/strict');
const Difficulty = require('../js/games/darts-cpu-difficulty.js');
const Gesture = require('../js/games/darts-cpu-gesture.js');
const Strategy = require('../js/games/darts-cpu-strategy.js');
const Rules = require('../js/games/darts-rules.js');
const physics = require('./helpers/darts-physics.js')(), cpu = Gesture.create(physics);
assert.deepEqual(Difficulty.profiles[0], { velocity: 380, timing: .055, shape: .12, lapse: .13, lapseVelocity: 650 }, 'Easy I retains its original physical difficulty');
assert.deepEqual(Difficulty.profiles[15], { velocity: 45 * .97, timing: .009 * .97, shape: .015 * .97, lapse: .004, lapseVelocity: 45 * .97 * 2.5 }, 'Insane IV receives a small precision increase while retaining softer lapses');
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
    assert(Difficulty.profiles[n].lapseVelocity >= Difficulty.profiles[n].velocity);
    assert(Difficulty.profiles[n].lapseVelocity <= Math.min(650, Difficulty.profiles[n].velocity * 2.5));
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
assert.deepEqual(rows[0], { level: 1, PPR: 19.56, missPct: 48.4, corkMM: 125.53 }, 'The weakest baseline remains unchanged');
assert(rows[15].PPR >= 75 && rows[15].PPR <= 95, 'Top-level ordinary scoring is weaker even after softening its rare lapses');
const lapseAudit = [];
for (const [name, base, mult] of [['T20', 20, 3], ['BULL', 25, 2], ['D16', 16, 2]]) {
    const rng = Gesture.seeded('insane-iv-miss-audit-' + name), target = Strategy.target(base, mult), errors = [];
    let darts = 0, misses = 0, lapses = 0;
    for (let i = 0; i < 30000; i++) {
        const generated = cpu.generate(target, 15, rng), analysis = physics.analyseGesture(generated.samples);
        if (!analysis.valid) continue;
        const hit = physics.computeImpact(physics.computeThrow(analysis));
        darts++; misses += Number(Rules.scoreAt(hit.x, hit.y).miss);
        if (generated.diagnostics.lapse) { lapses++; errors.push(Math.hypot(hit.x - target.x, hit.y - target.y)); }
    }
    errors.sort((a, b) => a - b);
    const p95 = errors[Math.floor(errors.length * .95)];
    assert(lapses > 50, 'The audit actually exercises rare lapses');
    assert(p95 < 100, 'High-level lapses stay near the intended target in the seeded physical sample');
    if (name !== 'D16') assert(misses / darts < .001, 'High-level inner targets rarely miss the entire board');
    else assert(misses / darts > .1, 'Edge doubles still miss naturally; no impact is clamped back onto the board');
    lapseAudit.push({ target: name, missPct: +(misses / darts * 100).toFixed(3), lapseP95MM: +p95.toFixed(2) });
}
console.log(JSON.stringify(rows));
console.log(JSON.stringify(lapseAudit));
console.log('PASS: sixteen-level validation, ordered profiles, legacy compatibility, unchanged weakest baseline, softer high-level lapses and natural edge-double misses.');
