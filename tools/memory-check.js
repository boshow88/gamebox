/** node tools/memory-check.js [--diagnostics] — pure Color Memory and battle checks. */
'use strict';
const assert = require('node:assert/strict');
const C = require('../js/games/memory-color.js');
const R = require('../js/games/memory-rules.js');
const near = (actual, expected, epsilon = 1e-7) => assert(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
const json = value => JSON.stringify(value);

// Known Oklab reference values for the sRGB primaries and D65 white.
// https://www.w3.org/TR/css-color-4/#color-conversion-code
for (const [rgb, expected] of [
    [[0, 0, 0], [0, 0, 0]], [[255, 255, 255], [1, 0, 0]],
    [[255, 0, 0], [0.62795536, 0.22486306, 0.12584630]],
    [[0, 255, 0], [0.86643961, -0.23388757, 0.17949848]],
    [[0, 0, 255], [0.45201372, -0.03245698, -0.31152815]],
    [[128, 128, 128], [0.59987081, 0, 0]],
]) C.srgbToOklab(rgb).forEach((value, i) => near(value, expected[i]));
assert(C.validateAnswer([0, 128, 255]));
const invalid = [null, undefined, {}, [], [0, 0], [0, 0, 0, 0], [, 0, 0], [-1, 0, 0], [256, 0, 0],
    [0.5, 0, 0], ['128', 0, 0], [NaN, 0, 0], [Infinity, 0, 0]];
for (const value of invalid) {
    assert.equal(C.validateAnswer(value), false);
    assert.throws(() => C.srgbToOklab(value));
    assert.throws(() => C.calculateColorError([0, 0, 0], value));
    assert.deepEqual(C.grade([10, 20, 30], value), { valid: false, error: null, score: 0 });
}
assert.throws(() => C.grade(null, [0, 0, 0]));

assert.deepEqual(C.generateQuestion(42).target, [154, 121, 208], 'Generator v1 is pinned, including PRNG call order');
const generation = { channelMin: 40, channelMax: 220, minLightness: 0.45, maxLightness: 0.8, minChroma: 0.08 };
const originalGeneration = json(generation), distinct = new Set();
for (let seed = 0; seed < 2000; seed++) {
    const a = C.generateQuestion(seed), b = C.generateQuestion(seed), custom = C.generateQuestion(seed, generation);
    assert.deepEqual(a, b); assert(C.validateAnswer(a.target));
    distinct.add(a.target.join(','));
    const lab = C.srgbToOklab(a.target), chroma = Math.hypot(lab[1], lab[2]);
    assert(a.target.every(n => n >= 24 && n <= 240));
    assert(lab[0] >= 0.4 && lab[0] <= 0.85 && chroma >= 0.06 && chroma <= 0.28);
    const customLab = C.srgbToOklab(custom.target);
    assert(custom.target.every(n => n >= 40 && n <= 220));
    assert(customLab[0] >= 0.45 && customLab[0] <= 0.8 && Math.hypot(customLab[1], customLab[2]) >= 0.08);
}
assert(distinct.size > 1950, 'Default generation should not cluster into a small set');
assert.equal(json(generation), originalGeneration);
assert.deepEqual(C.generateQuestion(0xffffffff), C.generateQuestion(0xffffffff));
for (const seed of [-1, 2 ** 32, 1.2, '42', NaN, Infinity]) assert.throws(() => C.generateQuestion(seed));
for (const settings of [{ channelMin: -1 }, { channelMax: 256 }, { channelMin: 250, channelMax: 20 },
    { minLightness: 0.9, maxLightness: 0.2 }, { minChroma: NaN }, { maxAttempts: 0 }])
    assert.throws(() => C.generateQuestion(1, settings));
assert.throws(() => C.generateQuestion(1, { channelMin: 0, channelMax: 0, maxAttempts: 3 }), /No color satisfied/);

for (const target of [[0, 0, 0], [255, 255, 255], [255, 0, 0], [128, 128, 128], [12, 67, 231]]) {
    assert.equal(C.calculateColorError(target, target), 0);
    assert.equal(C.grade(target, target).score, 100);
}
near(C.calculateColorError([0, 0, 0], [255, 255, 255]), 1);
near(C.calculateColorError([15, 90, 180], [220, 30, 40]), C.calculateColorError([220, 30, 40], [15, 90, 180]));
for (const parameters of [{}, { version: 1 }, { version: 2 }, { version: 3 }, {version:4}, { version: 3, penaltyExponent: 0.5 },
    { version: 3, strength: 0 }, { tolerance: 0.1, exponent: 1 }, { tolerance: 0.3, exponent: 2 },
    { knee: 0, width: 0.1, strength: 0.3 }, { strength: 0 }, { width: Number.MIN_VALUE }]) {
    let previous = 100;
    for (let i = 0; i <= 10000; i++) {
        const score = C.mapColorErrorToScore(i / 10000, parameters);
        assert(Number.isFinite(score) && score >= 0 && score <= previous); previous = score;
    }
}
near(C.mapColorErrorToScore(0.2, { version: 1 }), 100 / Math.E);
assert.equal(C.version, 1, 'Question generation remains v1');
assert.equal(C.scoringVersion, 4);
assert.deepEqual(C.scoringParameters(), { version: 4, tolerance: 0.2, exponent: 1.4, knee: 0.08, width: 0.10, strength: 0.35, penaltyExponent: 1.5 });
assert.deepEqual(C.scoringParameters({ version: 2 }), { version: 2, tolerance: 0.2, exponent: 1.4, knee: 0.06, width: 0.05, strength: 1.2 });
for (let i = 0; i <= 1000; i++) {
    const error = i / 10000, old = C.mapColorErrorToScore(error, { version: 1 }), proposed = C.mapColorErrorToScore(error);
    if (error <= 0.06 || old >= 85) assert.equal(proposed, old, 'High accuracy retains exactly the original curve');
    assert(proposed <= old);
    assert.equal(C.mapColorErrorToScore(error, { strength: 0 }), old);
    assert.equal(C.mapColorErrorToScore(error), proposed, 'Repeated raw scoring is deterministic');
}
near(C.mapColorErrorToScore(0.1, { version: 2 }), 31.76106556, 0.00001);
near(C.mapColorErrorToScore(0.12, { version: 2 }), 10.89228042, 0.00001);
assert(C.mapColorErrorToScore(0.08, { version: 2 }) > 60 && C.mapColorErrorToScore(0.08, { version: 2 }) < 65);
assert(C.mapColorErrorToScore(0.14, { version: 2 }) > 2 && C.mapColorErrorToScore(0.14, { version: 2 }) < 3);
assert(C.mapColorErrorToScore(0.18) > 0.01, 'Large but non-extreme errors retain useful sub-point gradation');
assert(C.mapColorErrorToScore(0.1, { width: 0.05 }) > C.mapColorErrorToScore(0.1, { width: 0.04 }), 'Chosen width avoids the initial proposal\'s steeper collapse');
const knee = C.defaults.scoring.knee, epsilon = 1e-7, atKnee = C.mapColorErrorToScore(knee);
near(C.mapColorErrorToScore(knee - epsilon), atKnee, 0.001);
near(C.mapColorErrorToScore(knee + epsilon), atKnee, 0.001);
// The 1.5 power has slower finite-difference convergence than the old square.
const slopeStep = 1e-9;
near((atKnee - C.mapColorErrorToScore(knee - slopeStep)) / slopeStep,
    (C.mapColorErrorToScore(knee + slopeStep) - atKnee) / slopeStep, 0.1);
assert.equal(C.mapColorErrorToScore(Number.MAX_VALUE, { strength: 0, width: Number.MIN_VALUE }), 0, 'Disabled penalties cannot produce zero-times-infinity NaN');
assert(C.mapColorErrorToScore(0.15, { tolerance: 0.3 }) > C.mapColorErrorToScore(0.15, { tolerance: 0.1 }));
assert.equal(C.mapColorErrorToScore(Number.MAX_VALUE), 0);
for (const error of [-1, NaN, Infinity, '0', null]) assert.throws(() => C.mapColorErrorToScore(error));
for (const parameters of [{ tolerance: 0 }, { tolerance: NaN }, { tolerance: Infinity }, { exponent: 0 }, { exponent: -1 },
    { version: 0 }, { version: 5 }, { version: '2' }, { version: null }, { knee: -1 }, { knee: NaN }, { knee: Infinity },
    { width: 0 }, { width: -1 }, { width: Infinity }, { strength: -1 }, { strength: NaN }, { strength: Infinity }])
    assert.throws(() => C.mapColorErrorToScore(0.1, parameters));
const candidate = C.scoringParameters({ version: 3 });
assert.deepEqual(candidate, { version: 3, tolerance: 0.2, exponent: 1.4, knee: 0.06, width: 0.08, strength: 0.5, penaltyExponent: 1.5 });
assert.equal(C.scoringVersion, 4, 'Local/default grading now uses the approved V4');
for (const penaltyExponent of [0, -1, NaN, Infinity, null, '1.5'])
    assert.throws(() => C.scoringParameters({ version: 3, penaltyExponent }));
for (let i = 0; i <= 10000; i++) {
    const error = i / 10000, v1 = C.mapColorErrorToScore(error, { version: 1 }), v2 = C.mapColorErrorToScore(error, { version: 2 }), v3 = C.mapColorErrorToScore(error, candidate);
    assert.equal(v3, C.mapColorErrorToScore(error, { version: 3 })); assert(v3 <= v1);
    assert.equal(C.mapColorErrorToScore(error), C.mapColorErrorToScore(error,{version:4}), 'Every default score is V4');
    if (error <= candidate.knee) assert.equal(v3, v1);
    if (error >= 0.063) assert(v3 >= v2, 'V3 softens the V2 mid/low-score region');
}
assert(C.mapColorErrorToScore(0.061, candidate) < C.mapColorErrorToScore(0.061, { version: 2 }), 'The proposed powers cross just above the knee; do not claim universal V2 <= V3');
near(C.mapColorErrorToScore(0.1, candidate), 57.367, 0.001);
near(C.mapColorErrorToScore(0.2, candidate), 11.561, 0.001);
near(C.mapColorErrorToScore(0.06 - 1e-8, candidate), C.mapColorErrorToScore(0.06 + 1e-8, candidate), 0.001);
assert.equal(C.mapColorErrorToScore(Number.MAX_VALUE, { version: 3 }), 0);
assert.equal(C.mapColorErrorToScore(Number.MAX_VALUE, { version: 3, strength: 0, width: Number.MIN_VALUE }), 0);
const fixtures = require('./helpers/memory-scoring-fixtures.js');
const scoringInput = { knee: 0.07, width: 0.06, strength: 0.9 }, beforeScoring = json(scoringInput);
for (const { pair, old, proposed } of fixtures.compare()) {
    assert.deepEqual(C.grade(pair.target, pair.answer, { version: 2 }), proposed);
    assert.deepEqual(C.grade(pair.target, pair.answer), C.grade(pair.target, pair.answer, { version: 4 }));
    assert(proposed.score <= old.score && proposed.score >= 0 && proposed.score <= 100);
    near(proposed.score * 1000, Math.round(proposed.score * 1000), 1e-8);
    assert.deepEqual(C.grade(pair.target, pair.answer, scoringInput), C.grade(pair.target, pair.answer, scoringInput));
}
assert.equal(json(scoringInput), beforeScoring);

// Fixed precision is a protocol choice, independent of one-decimal UI formatting.
assert.equal(R.SCALE, 1000);
assert.equal(R.SCALE, C.SCORE_SCALE, 'Category grading and battle arithmetic use the same canonical precision');
assert.equal(R.scoreToUnits(80.1234), 80123);
assert.equal(R.scoreToUnits(80.1236), 80124);
assert.equal((80.004).toFixed(1), (80.003).toFixed(1));
assert.equal(R.calculateDamage(64, 86, 2), 44);
assert.equal(R.calculateDamage(86, 86, 1000), 0);
assert.equal(R.calculateDamage(90, 80, 1), 0);
assert.equal(R.calculateDamage(80.003, 80.004, 2), 0.002);
assert.equal(R.calculateDamage(80.0003, 80.0004, 2), 0, 'Sub-thousandth differences share the canonical score');
assert.equal(R.calculateDamage(60, 90, 0), 0);
assert.equal(R.applyDamage(20, 50), 0);
assert.equal(R.applyDamage(20.123, 0.002), 20.121);
for (const score of [-1, 101, NaN, Infinity, '80', null]) assert.throws(() => R.scoreToUnits(score));
for (const multiplier of [-1, NaN, Infinity, 1001]) assert.throws(() => R.calculateDamage(0, 100, multiplier));
assert.throws(() => R.applyDamage(-1, 0));
assert.deepEqual([1, 3, 4, 6, 7, 1000].map(round => R.multiplierForRound(round)), [1, 1, 1.5, 1.5, 2, 4]);
assert.equal(R.multiplierForRound(4, { base: 2, increase: 1, every: 1, max: 10 }), 5);
assert.equal(R.multiplierForRound(Number.MAX_SAFE_INTEGER), 4);
for (const round of [0, -1, 1.5, NaN]) assert.throws(() => R.multiplierForRound(round));
for (const schedule of [{ every: 0 }, { increase: -1 }, { max: 0 }, { base: NaN }])
    assert.throws(() => R.multiplierForRound(1, schedule));

const initial = R.createBattle(['a', 'b', 'c', 'd']);
assert(Object.values(initial.hpUnits).every(hp => hp === 500000));
const before = json(initial), scores = { a: 86, b: 86, c: 64 }, beforeScores = json(scores);
const settled = R.settleRound(initial, 1, scores);
assert.equal(json(initial), before); assert.equal(json(scores), beforeScores);
assert.deepEqual(settled.lastResult.topIds, ['a', 'b']);
assert.deepEqual(settled.hpUnits, { a: 500000, b: 500000, c: 478000, d: 414000 });
assert.equal(settled.round, 2); assert.equal(settled.settledRound, 1);
assert.equal(R.settleRound(settled, 1, scores), null, 'Repeated settlement must not damage twice');
assert.equal(R.settleRound(initial, 2, scores), null, 'Future/stale rounds are rejected');
assert.deepEqual(R.settleRound(initial, 1, {}).hpUnits, initial.hpUnits, 'All missing answers tie at zero');
const precise = R.settleRound(R.createBattle(['a', 'b']), 1, { a: 80.004, b: 80.003 });
assert.deepEqual(precise.lastResult.topIds, ['a']);
assert.equal(precise.hpUnits.b, 499999);
const tied = R.settleRound(R.createBattle(['a', 'b']), 1, { a: 80.0003, b: 80.0004 });
assert.deepEqual(tied.lastResult.topIds, ['a', 'b']);
const lowHp = R.createBattle(['a', 'b', 'c'], { startingHp: 20, multiplierSchedule: { base: 2, max: 2 } });
const eliminated = R.settleRound(lowHp, 1, { a: 100, b: 80, c: 0 });
assert.deepEqual(eliminated.hpUnits, { a: 20000, b: 0, c: 0 });
assert.equal(eliminated.status, 'over'); assert.deepEqual(eliminated.winners, ['a']);
assert.equal(eliminated.lastResult.rows.filter(row => row.eliminated).length, 2);
assert.equal(R.settleRound(eliminated, 2, { a: 0, b: 100, c: 100 }), null);
const partial = R.settleRound(R.createBattle(['a', 'b', 'c'], { startingHp: 50 }), 1, { a: 100, b: 99, c: 0 });
const next = R.settleRound(partial, 2, { a: 90, b: 100, c: 100 });
assert.equal(next.hpUnits.c, 0); assert.equal(next.lastResult.rows.length, 2, 'Eliminated participants do not reenter settlement');
assert.equal(next.hpUnits.a, 40000);
assert.equal(R.createBattle(Array.from({ length: 8 }, (_, i) => 'p' + i)).participants.length, 8);
for (const ids of [[], ['a'], ['a', 'a'], ['__proto__', 'b'], Array.from({ length: 9 }, (_, i) => 'p' + i)])
    assert.throws(() => R.createBattle(ids));
assert.throws(() => R.createBattle(['a', 'b'], { startingHp: 0 }));
assert.throws(() => R.settleRound(initial, 1, { outsider: 100 }));
assert.throws(() => R.settleRound(initial, 1, { a: NaN }));

const timeline = R.createTimeline(1000);
assert.deepEqual(timeline, { startAt: 1000, memorizeAt: 4000, answerAt: 8000, deadline: 33000 });
assert.deepEqual([1000, 3999, 4000, 7999, 8000, 32999, 33000, 90000].map(t => R.phaseAt(timeline, t)),
    ['prepare', 'prepare', 'memorize', 'memorize', 'answer', 'answer', 'expired', 'expired']);
assert.equal(R.phaseAt(R.createTimeline(0, { prepareMs: 0 }), 0), 'memorize');
for (const timing of [{ answerMs: 0 }, { memorizeMs: -1 }, { resultMinMs: NaN }]) assert.throws(() => R.createTimeline(0, timing));
assert.throws(() => R.createTimeline(NaN)); assert.throws(() => R.phaseAt(timeline, Infinity));
console.log('PASS: Memory generation (2,000 seeds), Oklab references, default V3 and explicit V1/V2/V3 monotonic/bounded/deterministic scores, unchanged high accuracy, continuous knee, crossover, parameter validation/overflow, fixed precision, damage, HP and phase guards.');

if (process.argv.includes('--diagnostics')) {
    console.table(fixtures.compare().map(({ pair, old, proposed }) => ({ fixture: pair.id,
        target: pair.target.join(','), answer: pair.answer.join(','), error: old.error.toFixed(6),
        legacyV1: old.score.toFixed(3), legacyV2: proposed.score.toFixed(3),
        defaultV3: C.grade(pair.target, pair.answer).score.toFixed(3) })));
    console.log('Visual calibration: tools/memory-color-map.html (all three versions; current default V3), tools/memory-scoring.html (historical V1/V2 pairs).');
}
