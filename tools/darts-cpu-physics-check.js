/* node tools/darts-cpu-physics-check.js -- real gesture feasibility and seeded execution calibration. */
'use strict';
const assert = require('node:assert/strict');
const G = require('../js/games/darts-cpu-gesture.js');
const Rules = require('../js/games/darts-rules.js');
const loadPhysics = require('./helpers/darts-physics.js');
const physics = loadPhysics(), cpu = G.create(physics);
const tuning = JSON.stringify(physics.TUNING);
function point(base, mult) {
    if (base === 25) return { x: 0, y: mult === 1 ? 11 : 0 };
    const sectors = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
    const angle = sectors.indexOf(base) * Math.PI / 10, radius = mult === 3 ? 103 : mult === 2 ? 166 : 132;
    return { x: radius * Math.sin(angle), y: radius * Math.cos(angle) };
}
function throwSamples(samples) {
    const analysis = physics.analyseGesture(samples);
    const launch = physics.computeThrow(analysis), impact = physics.computeImpact(launch);
    return { analysis, launch, impact, result: Rules.scoreAt(impact.x, impact.y, physics.TUNING) };
}
function validAttempt(target, difficulty, rng) {
    // Invalid upward gestures consume time in production, not a dart. Never retry a valid miss.
    for (let attempt = 0; attempt < 100; attempt++) {
        const actual = throwSamples(cpu.generate(target, difficulty, rng).samples);
        if (actual.analysis.valid) return actual;
    }
    throw new Error('CPU cannot produce a valid gesture');
}
const targets = [[20, 3], [20, 1], [16, 2], [25, 2], [25, 1], [3, 3], [6, 2], [11, 1]];
const feasibility = [];
for (const [base, mult] of targets) {
    const target = point(base, mult), gesture = cpu.ideal(target), actual = throwSamples(gesture.samples);
    assert.equal(actual.analysis.valid, true);
    assert.deepEqual(actual.result, Rules.hit(base, mult));
    assert.ok(Math.hypot(actual.impact.x - target.x, actual.impact.y - target.y) < 0.05);
    assert.equal(JSON.stringify(actual), JSON.stringify(throwSamples(gesture.samples)), 'Same gesture is deterministic');
    feasibility.push({ target: actual.result.label, errorMM: +gesture.diagnostics.error.toFixed(6),
        evaluations: gesture.diagnostics.evaluations });
}
const miss = throwSamples(cpu.ideal({ x: 230, y: 0 }).samples);
assert.equal(miss.analysis.valid, true); assert.equal(miss.result.miss, true);
for (let base = 1; base <= 20; base++) {
    for (let mult = 1; mult <= 3; mult++) {
        const actual = throwSamples(cpu.ideal(point(base, mult)).samples);
        assert.equal(actual.analysis.valid, true);
        assert.deepEqual(actual.result, Rules.hit(base, mult), 'All sectors and rings are targetable');
    }
}
const bullLaunch = throwSamples(cpu.ideal(point(25, 2)).samples);
const tripleLaunch = throwSamples(cpu.ideal(point(20, 3)).samples);
assert.notEqual(bullLaunch.launch.vel.y, tripleLaunch.launch.vel.y, 'Distinct samples derive distinct launches');
assert.notEqual(physics.dartPosAt(bullLaunch.launch, 0.1).y,
    physics.dartPosAt(tripleLaunch.launch, 0.1).y, 'Distinct launches derive distinct physical trajectories');
for (const width of [320, 390, 1280]) {
    const ideal = cpu.ideal(point(20, 3));
    // Browser input divides pointer deltas by canvas dimensions; CPU already supplies logical coordinates.
    const normalized = ideal.samples.map(s => ({ t: s.t, x: s.x * width / 480 * 480 / width,
        y: s.y * width / 480 * 480 / width }));
    assert.equal(throwSamples(normalized).result.label, 'T20');
}
assert.equal(JSON.stringify(physics.TUNING), tuning, 'CPU does not alter human physics settings');
const before = cpu.stats().evaluations;
cpu.ideal(point(20, 3)); assert.equal(cpu.stats().evaluations, before, 'Cached targets require no search');
const seedA = cpu.generate(point(20, 3), 'normal', G.seeded('repeat'));
const seedB = cpu.generate(point(20, 3), 'normal', G.seeded('repeat'));
assert.deepEqual(seedA, seedB, 'Synthetic samples reproduce from seed');
console.log('Stage A actual human-pipeline feasibility:', JSON.stringify(feasibility));

const count = 12000, report = [];
for (const difficulty of ['easy', 'normal', 'hard', 'insane']) {
    const target = point(difficulty === 'normal' ? 25 : 20, difficulty === 'normal' ? 2 : difficulty === 'easy' ? 1 : 3);
    const desired = Rules.scoreAt(target.x, target.y), rng = G.seeded('ordinary-' + difficulty);
    let total = 0, misses = 0, invalid = 0, hits = 0, attempts = 0;
    const distribution = { miss: 0, single: 0, double: 0, triple: 0, bull: 0, bullseye: 0 }, turns = [];
    let turn = 0;
    for (let i = 0; i < count; i++) {
        let actual;
        do {
            actual = throwSamples(cpu.generate(target, difficulty, rng).samples); attempts++;
            if (!actual.analysis.valid) invalid++;
        } while (!actual.analysis.valid);
        const result = actual.result;
        total += result.score; turn += result.score;
        misses += result.miss ? 1 : 0; hits += result.label === desired.label ? 1 : 0;
        distribution[result.region]++;
        if (i % 3 === 2) { turns.push(turn); turn = 0; }
    }
    const ppr = total / count * 3, sd = Math.sqrt(turns.reduce((sum, v) => sum + (v - ppr) ** 2, 0) / turns.length);
    report.push({ difficulty, target: desired.label, darts: count, PPR: +ppr.toFixed(2),
        missPct: +(misses / count * 100).toFixed(2), invalidGesturePct: +(invalid / attempts * 100).toFixed(2),
        targetPct: +(hits / count * 100).toFixed(2), turnSD: +sd.toFixed(2), distribution });
}
assert.deepEqual(report.map(r => r.PPR).slice().sort((a, b) => a - b), report.map(r => r.PPR));
report.forEach(r => assert.ok(r.missPct > 0, r.difficulty + ' can miss'));
// Fixed-target probes at the four legacy labels, now using the easier curve.
const ranges = [[17, 24], [28, 40], [50, 65], [85, 100]];
report.forEach((r, i) => assert.ok(r.PPR >= ranges[i][0] && r.PPR <= ranges[i][1], r.difficulty + ' calibrated PPR'));
console.log('Ordinary scoring PPR = sum of physical 25/50 scores / darts * 3; no opening or checkout restrictions.');
console.log(JSON.stringify(report, null, 2));
const cork = [];
for (const difficulty of ['easy', 'normal', 'hard', 'insane']) {
    const rng = G.seeded('cork-' + difficulty), distances = [];
    let misses = 0, inner = 0, near = 0;
    for (let i = 0; i < count; i++) {
        const actual = validAttempt(point(25, 2), difficulty, rng);
        const d = Math.hypot(actual.impact.x, actual.impact.y);
        distances.push(d); misses += d > 170 ? 1 : 0; inner += d <= 6.35 ? 1 : 0; near += d <= 15.9 ? 1 : 0;
    }
    distances.sort((a, b) => a - b);
    cork.push({ difficulty, meanMM: +(distances.reduce((s, d) => s + d, 0) / count).toFixed(2),
        medianMM: +distances[count / 2].toFixed(2), missPct: +(misses / count * 100).toFixed(2),
        innerBullPct: +(inner / count * 100).toFixed(2), nearBullPct: +(near / count * 100).toFixed(2) });
}
assert.deepEqual(cork.map(r => r.meanMM).slice().sort((a, b) => b - a), cork.map(r => r.meanMM));
console.log('Physical Cork (no score proxies):', JSON.stringify(cork));
const accuracy = [];
for (const difficulty of ['easy', 'normal', 'hard', 'insane']) {
    const row = { difficulty };
    for (const [base, mult] of [[20, 1], [20, 3], [16, 2], [25, 1], [25, 2]]) {
        const target = point(base, mult), label = Rules.hit(base, mult).label;
        const rng = G.seeded('accuracy-' + difficulty + '-' + label);
        let hits = 0;
        for (let i = 0; i < 3000; i++) hits += validAttempt(target, difficulty, rng).result.label === label ? 1 : 0;
        row[label] = +(hits / 3000 * 100).toFixed(2);
    }
    accuracy.push(row);
}
console.log('Physical target accuracy % (3,000 darts per region/difficulty):', JSON.stringify(accuracy));
const checkout = [];
for (const difficulty of ['easy', 'normal', 'hard', 'insane']) {
    const rng = G.seeded('checkout-' + difficulty);
    let wins = 0, busts = 0;
    for (let i = 0; i < count; i++) {
        const actual = validAttempt(point(16, 2), difficulty, rng);
        let state = Rules.create({ mode: 'x01', startingScore: 301, inRule: 'open', outRule: 'double',
            roundLimit: 0 }, ['CPU', 'human'], 0);
        state.scores.CPU = state.turnStartScore = 32; state.active = 'CPU';
        const next = Rules.throwDart(state, 'CPU', actual.result, 1);
        wins += next.winner === 'CPU' ? 1 : 0;
        busts += next.lastDart && next.lastDart.reason === 'bust' ? 1 : 0;
    }
    checkout.push({ difficulty, situation: '32 left, one D16 attempt, Double Out',
        checkoutPct: +(wins / count * 100).toFixed(2), bustPct: +(busts / count * 100).toFixed(2) });
}
console.log('Actual rules checkout/bust:', JSON.stringify(checkout));
console.log('CPU gesture checks passed.');
