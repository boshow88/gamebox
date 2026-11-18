/** Pure diagnostic geometry/gamut/contour checks. No browser or Firebase. */
'use strict';
const assert = require('node:assert/strict');
const Color = require('../js/games/impressions-color.js'), Slice = require('./helpers/impressions-color-slice.js');
const near = (a, b, e = 1e-9) => assert(Math.abs(a - b) < e, `${a} != ${b}`);
const originalDefaults = JSON.stringify(Color.defaults);
let roundTrips = 0;
for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const rgb = [r, g, b]; assert.deepEqual(Slice.labToRgb(Color.srgbToOklab(rgb)), rgb); roundTrips++;
}
for (let seed = 0; seed < 2000; seed++) {
    const rgb = Color.generateQuestion(seed).target; assert.deepEqual(Slice.labToRgb(Color.srgbToOklab(rgb)), rgb); roundTrips++;
}
for (const lab of [[0.5, 0.5, 0.5], [0.5, -0.5, -0.5], [-0.01, 0, 0], [1.01, 0, 0], [Number.MAX_VALUE, 0, 0]])
    assert.equal(Slice.labToRgb(lab), null, 'Invalid gamut points must never be clipped to a displayable RGB');
const red = Color.srgbToOklab([255, 0, 0]);
assert.equal(Slice.labToRgb([red[0] + 0.0001, red[1], red[2]]), null, 'Even a small real gamut excess is rejected');
for (const lab of [null, [0, 0], [0, 0, 0, 0], [NaN, 0, 0], [Infinity, 0, 0], [, 0, 0]]) assert.throws(() => Slice.labToRgb(lab));
for (const [text, rgb] of [['#3092c6', [48, 146, 198]], ['3092C6', [48, 146, 198]], ['#f0a', [255, 0, 170]],
    ['48, 146, 198', [48, 146, 198]], ['48 146 198', [48, 146, 198]], ['rgb(0, 128, 255)', [0, 128, 255]]]) assert.deepEqual(Slice.parseTarget(text), rgb);
for (const text of ['', '#12345', '#GGGGGG', 'rgb(0,0,0', '1,2,3)', '-1,0,0', '256,0,0', '1.5,2,3', '1,2,3,4']) assert.throws(() => Slice.parseTarget(text));
const configurations = [{ version: 1 }, { version: 2 }, {}, { version: 3 }, {version:4}, { version: 3, penaltyExponent: 2.5 },
    { knee: 0, width: 0.1, strength: 0.3 }, { tolerance: 0.4, exponent: 2.5 }, { strength: 0 }];
for (const parameters of configurations) {
    let previous = 0;
    for (const contour of Slice.contours(parameters)) {
        assert(contour.radius > previous); previous = contour.radius;
        near(Color.mapColorErrorToScore(contour.radius, parameters), contour.score);
    }
}
assert.deepEqual(Slice.scores, [95, 90, 80, 70, 50, 30, 10]);
near(Slice.distanceForScore(95, { version: 1 }), 0.023968712439809033);
near(Slice.distanceForScore(10, { version: 1 }), 0.3628736955010622);
near(Slice.distanceForScore(10, { version: 2 }), 0.12133628249770165);
near(Slice.distanceForScore(10), Slice.distanceForScore(10,{version:4}));
near(Slice.distanceForScore(10, { version: 3 }), 0.2073955423312175);
const bandWidth = version => Slice.distanceForScore(10, { version }) - Slice.distanceForScore(70, { version });
assert(bandWidth(3) > 2 * bandWidth(2), 'V3 spreads the 70-to-10 contours farther apart');
for (const level of [70, 50, 30, 10]) assert(Slice.distanceForScore(level, { version: 3 }) > Slice.distanceForScore(level, { version: 2 }));
near(Slice.distanceForScore(95), Slice.distanceForScore(95, { version: 1 }));
assert.equal(Slice.distanceForScore(100), 0);
for (const value of [0, -1, 101, '95', NaN, Infinity]) assert.throws(() => Slice.distanceForScore(value));
assert.throws(() => Slice.distanceForScore(50, { width: 0 }));
const target = [128, 128, 128], anchor = Color.srgbToOklab(target);
for (const plane of ['ab', 'aL', 'bL']) {
    const axes = Slice.planes[plane], fixed = [0, 1, 2].find(i => !axes.includes(i));
    for (let angle = 0; angle < 360; angle += 5) {
        const radians = angle * Math.PI / 180, lab = Slice.planeLab(anchor, plane, 0.04 * Math.cos(radians), 0.04 * Math.sin(radians));
        assert.equal(lab[fixed], anchor[fixed]); near(Math.hypot(...lab.map((v, i) => v - anchor[i])), 0.04);
    }
    const center = Slice.inspect(target, plane, 0, 0); assert.deepEqual(center.rgb, target);
    assert.equal(center.original.score, 100); assert.equal(center.experimental.score, 100); assert.equal(center.candidate.score, 100);
}
let inGamut = 0, outOfGamut = 0;
for (let x = -0.4; x <= 0.4; x += 0.025) for (let y = -0.4; y <= 0.4; y += 0.025) {
    const inspected = Slice.inspect(target, 'ab', x, y);
    if (inspected.rgb) {
        inGamut++; assert(Color.validateAnswer(inspected.rgb));
        assert.deepEqual(inspected.original, Color.grade(target, inspected.rgb, { version: 1 }));
        assert.deepEqual(inspected.experimental, Color.grade(target, inspected.rgb, { version: 2 }));
        assert.deepEqual(inspected.candidate, Color.grade(target, inspected.rgb, { version: 3 }));
    } else { outOfGamut++; assert.equal(inspected.original, null); assert.equal(inspected.experimental, null); assert.equal(inspected.candidate, null); }
}
assert(inGamut > 50 && outOfGamut > 100);
const lighter = Slice.inspect(target, 'aL', 0, 0.1);
assert(lighter.rgb.every((v, i) => v > target[i])); assert(lighter.original.error > 0.09);
assert.throws(() => Slice.planeLab(anchor, 'unknown', 0, 0));
for (const version of [1, 2, 3, 4]) {
    const samples = Slice.samplesAtScores(target, 'ab', { version });
    assert.deepEqual(samples, Slice.samplesAtScores(target, 'ab', { version }), 'Representative samples are deterministic');
    assert.deepEqual(samples.map(s => s.level), [90, 70, 50, 30, 10]);
    assert(samples.some(s => s.rgb));
    for (const sample of samples) if (sample.rgb) {
        assert(Color.validateAnswer(sample.rgb)); assert.deepEqual(sample.grade, Color.grade(target, sample.rgb, { version }));
        near(Math.hypot(sample.dx, sample.dy), sample.radius);
        assert(Math.abs(sample.grade.score - sample.level) < 1, 'Show actual RGB8 scores close to the nominal contour level');
    }
    assert(Slice.samplesAtScores([0, 0, 0], 'ab', { version }).every(s => s.rgb === null && s.grade === null), 'Unavailable colors are never fabricated/clipped');
}
assert.equal(JSON.stringify(Color.defaults), originalDefaults);
console.log(`PASS: ${roundTrips} RGB/Oklab round trips, no gamut clipping, V1/V2/V3 contour inversion and RGB8 grading, wider V3 midrange, three slices, deterministic actual-pair samples and unavailable-color handling. Production defaults are unchanged.`);
