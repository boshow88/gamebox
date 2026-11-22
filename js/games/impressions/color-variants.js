/* HSL input / Color variants v1. Legacy RGB/Oklab graders are deliberately unchanged. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./color.js'), require('./progression.js'));
    else root.ImpressionsColorVariants = factory(root.ImpressionsColor, root.ImpressionsProgression);
})(typeof window === 'object' ? window : globalThis, function (Color, Progression) {
    'use strict';
    var IDS = Object.freeze(['single', 'hue2', 'hue3', 'hue4']), SWATCHES = Object.freeze(['a', 'b', 'c', 'd']);
    function copy(v) { return JSON.parse(JSON.stringify(v)); }
    function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
    function wrap(h) { if (!Number.isFinite(h)) throw new RangeError('Hue must be finite.'); return ((h % 360) + 360) % 360; }
    function hue(h) { return Number.isFinite(h) && h >= 0 && h <= 360; }
    function keys(value, expected) { return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === expected.length && expected.every(function (k) { return Object.hasOwn(value, k); }); }
    function validHsl(v) { return keys(v, ['h', 's', 'l']) && hue(v.h) && [v.s, v.l].every(function (n) { return Number.isFinite(n) && n >= 0 && n <= 100; }); }
    // CSS Color 4 §7.1: https://www.w3.org/TR/css-color-4/#hsl-to-rgb
    // Canonical 8-bit sRGB is used for BOTH display and the existing Oklab grader.
    function hslToRgb(v) {
        if (!validHsl(v)) throw new TypeError('Invalid HSL color.');
        var h = wrap(v.h), s = v.s / 100, l = v.l / 100, a = s * Math.min(l, 1 - l);
        return [0, 8, 4].map(function (n) { var k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); });
    }
    function rgbToHsl(rgb) {
        if (!Color.validateAnswer(rgb)) throw new TypeError('Invalid RGB color.');
        var c = rgb.map(function (v) { return v / 255; }), max = Math.max(...c), min = Math.min(...c), d = max - min, l = (max + min) / 2, h = 0;
        if (d) h = max === c[0] ? (c[1] - c[2]) / d : max === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
        return { h: wrap(h * 60), s: d ? d / (1 - Math.abs(2 * l - 1)) * 100 : 0, l: l * 100 };
    }
    function circularDistance(a, b) { var d = Math.abs(wrap(a) - wrap(b)); return Math.min(d, 360 - d); }
    function scoringParameters(input) { input = input || {}; if (input.version !== undefined && input.version !== 1) throw new RangeError('Unknown multi-Hue scoring version.'); var curve = Color.scoringParameters(Object.assign({ version: 3 }, input.curve)); if (curve.version !== 3) throw new RangeError('Multi-Hue curve must use mapping v3.'); return { version: 1, curve: curve }; }
    function configuration(input) {
        input = input || {};
        var p = { version: input.version === undefined ? 1 : input.version, variantSelectionVersion: input.variantSelectionVersion === undefined ? 1 : input.variantSelectionVersion,
            initialHsl: Object.assign({ h: 180, s: 50, l: 50 }, input.initialHsl), initialHue: input.initialHue === undefined ? 180 : input.initialHue,
            single: Object.assign({ minS: 35, maxS: 90, minL: 30, maxL: 70 }, input.single), fixed: Object.assign({ s: 65, l: 55 }, input.fixed),
            weights: { easy: Object.assign({ single: 4, hue2: 2, hue3: 1, hue4: 1 }, input.weights && input.weights.easy), hard: Object.assign({ single: 3, hue2: 2, hue3: 2, hue4: 2 }, input.weights && input.weights.hard) },
            separation: Object.assign({ easy: 50, hard: 18 }, input.separation), multiScoring: scoringParameters(input.multiScoring) };
        IDS.slice(1).forEach(function (id, i) { p[id] = Object.assign({ memorizeMs: 5000 + i * 1000, answerMs: 28000 + i * 5000 }, input[id]); });
        if (p.version !== 1 || ![0, 1].includes(p.variantSelectionVersion) || !validHsl(p.initialHsl) || p.initialHsl.s <= 0 || p.initialHsl.l <= 0 || p.initialHsl.l >= 100 || !hue(p.initialHue)) throw new RangeError('Invalid Color variant/initial configuration.');
        if (![p.single.minS, p.single.maxS, p.single.minL, p.single.maxL, p.fixed.s, p.fixed.l].every(function (n) { return Number.isFinite(n) && n >= 10 && n <= 95; }) || p.single.minS > p.single.maxS || p.single.minL > p.single.maxL || p.single.maxL > 85 || p.fixed.l > 85) throw new RangeError('Use visible, chromatic HSL ranges.');
        ['easy', 'hard'].forEach(function (end) { if (!IDS.every(function (id) { return Number.isFinite(p.weights[end][id]) && p.weights[end][id] >= 0 && p.weights[end][id] <= 10; }) || IDS.reduce(function (sum, id) { return sum + p.weights[end][id]; }, 0) <= 0) throw new RangeError('Enable at least one Color variant.'); });
        if (![p.separation.easy, p.separation.hard].every(function (n) { return Number.isFinite(n) && n >= 0 && n <= 75; }) || p.separation.hard > p.separation.easy) throw new RangeError('Invalid Hue separation.');
        IDS.slice(1).forEach(function (id) { if (![p[id].memorizeMs, p[id].answerMs].every(function (n) { return Number.isInteger(n) && n >= 1000 && n <= 90000; })) throw new RangeError('Invalid multi-Hue timing.'); });
        return p;
    }
    function initialState() { return { version: 1, draw: 0, last: null, streak: 0 }; }
    function random(seed) { var state = seed >>> 0; return function () { state = (state + 0x6d2b79f5) | 0; var v = Math.imul(state ^ state >>> 15, 1 | state); v ^= v + Math.imul(v ^ v >>> 7, 61 | v); return ((v ^ v >>> 14) >>> 0) / 4294967296; }; }
    function select(seed, level, input, previous) {
        var p = configuration(input), s = previous || initialState();
        if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isFinite(level) || level < 1 || level > 10 || s.version !== 1 || !Number.isInteger(s.draw) || s.draw < 0) throw new RangeError('Invalid Color variant state/seed/level.');
        var ratio = (level - 1) / 9, weights = Object.fromEntries(IDS.map(function (id) { return [id, p.weights.easy[id] + (p.weights.hard[id] - p.weights.easy[id]) * ratio]; })), eligible = IDS.filter(function (id) { return weights[id] > 0; });
        if (s.streak >= 2 && eligible.some(function (id) { return id !== s.last; })) eligible = eligible.filter(function (id) { return id !== s.last; });
        var ticket = random((seed ^ Math.imul(s.draw + 1, 0x73c54b21)) >>> 0)() * eligible.reduce(function (sum, id) { return sum + weights[id]; }, 0), variant = eligible.at(-1);
        eligible.some(function (id) { ticket -= weights[id]; if (ticket < 0) { variant = id; return true; } return false; });
        return { variant: variant, state: { version: 1, draw: s.draw + 1, last: variant, streak: s.last === variant ? s.streak + 1 : 1 } };
    }
    function prepare(seed, base, state, previous) {
        var p = configuration(base.color), metadata = Progression.prepare('color', seed, base, state, base.adaptive), selected = select(seed, metadata.difficulty.effective, p, previous);
        if (selected.variant !== 'single') {
            var scale = metadata.parameters.timing.memorizeMs / base.timing.memorizeMs;
            metadata.parameters.timing.memorizeMs = Math.max(1500, Math.round(p[selected.variant].memorizeMs * scale / 100) * 100);
            metadata.parameters.timing.answerMs = p[selected.variant].answerMs;
        }
        metadata.parameters.color = { version: 1, separation: p.separation.easy + (p.separation.hard - p.separation.easy) * ((metadata.difficulty.effective - 1) / 9) };
        return { variant: selected.variant, state: selected.state, metadata: metadata };
    }
    function generateQuestion(seed, variant, input, parameters, singleScoringVersion) {
        if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !IDS.includes(variant)) throw new RangeError('Invalid Color question seed/variant.');
        var p = configuration(input), rng = random((seed ^ 0x43ac298f) >>> 0), q = { type: 'color', version: 2, variant: variant, variantVersion: 1, seed: seed }, sample = function (min, max) { return Math.round((min + rng() * (max - min)) * 100) / 100; };
        if (variant === 'single') {
            q.answerSchema = 'hsl-v1'; q.targetHsl = { h: sample(0, 359.99), s: sample(p.single.minS, p.single.maxS), l: sample(p.single.minL, p.single.maxL) }; q.target = hslToRgb(q.targetHsl); q.scoringVersion = singleScoringVersion === undefined ? 3 : singleScoringVersion;
        } else {
            var count = Number(variant.slice(-1)), separation = parameters && parameters.separation !== undefined ? parameters.separation : p.separation.easy;
            if (!Number.isFinite(separation) || separation < 0 || separation > 75) throw new RangeError('Invalid frozen Hue separation.');
            q.answerSchema = 'hues-v1'; q.swatches = SWATCHES.slice(0, count); q.fixed = copy(p.fixed); q.target = {}; q.scoringVersion = 1;
            // Retry the entire palette when an early random choice blocks a later
            // swatch. Never replace an impossible prefix with a predictable rainbow.
            for (var paletteAttempt = 0; paletteAttempt < 128; paletteAttempt++) {
                q.target = {};
                for (var index = 0; index < count; index++) {
                    for (var attempt = 0; attempt < 256; attempt++) { var h = sample(0, 359.99); if (Object.values(q.target).every(function (other) { return circularDistance(h, other) >= separation; })) { q.target[q.swatches[index]] = h; break; } }
                    if (Object.keys(q.target).length !== index + 1) break;
                }
                if (Object.keys(q.target).length === count) break;
            }
            if (Object.keys(q.target).length !== count) throw new RangeError('Could not generate a separated Hue palette.');
        }
        return freeze(q);
    }
    function validateAnswer(q, answer) { return q.variant === 'single' ? validHsl(answer) : Array.isArray(q.swatches) && keys(answer, q.swatches) && q.swatches.every(function (id) { return hue(answer[id]); }); }
    function initialAnswer(q, input) { var p = configuration(input); return q.variant === 'single' ? copy(p.initialHsl) : Object.fromEntries(q.swatches.map(function (id) { return [id, p.initialHue]; })); }
    function targetAnswer(q) { return copy(q.variant === 'single' ? q.targetHsl : q.target); }
    function answerRgb(q, answer, id) { return hslToRgb(q.variant === 'single' ? answer : { h: answer[id], s: q.fixed.s, l: q.fixed.l }); }
    function supported(q, input, scoring) {
        if (!q || q.type !== 'color' || q.version !== 2 || q.variantVersion !== 1 || !IDS.includes(q.variant)) return false;
        var p; try { p = configuration(input); } catch (_) { return false; }
        if (q.variant === 'single') return !!scoring && q.answerSchema === 'hsl-v1' && q.scoringVersion === scoring.version && Color.supportsScoringVersion(scoring.version) && validHsl(q.targetHsl) && Color.validateAnswer(q.target) && hslToRgb(q.targetHsl).every(function (v, i) { return v === q.target[i]; });
        return q.answerSchema === 'hues-v1' && q.scoringVersion === p.multiScoring.version && Array.isArray(q.swatches) && q.swatches.length === Number(q.variant.slice(-1)) && q.swatches.every(function (id, i) { return id === SWATCHES[i]; }) && q.fixed && q.fixed.s === p.fixed.s && q.fixed.l === p.fixed.l && validateAnswer(q, q.target);
    }
    function grade(q, answer, input, singleScoring) {
        var p = configuration(input); singleScoring = Color.scoringParameters(singleScoring || { version: q.variant === 'single' ? q.scoringVersion : 3 });
        if (!supported(q, p, singleScoring) || !validateAnswer(q, answer)) return { valid: false, error: null, errors: null, score: 0 };
        if (q.variant === 'single') return Color.grade(q.target, hslToRgb(answer), singleScoring);
        var errors = Object.fromEntries(q.swatches.map(function (id) { return [id, Color.calculateColorError(answerRgb(q, q.target, id), answerRgb(q, answer, id))]; })), rms = Math.sqrt(q.swatches.reduce(function (sum, id) { return sum + errors[id] ** 2; }, 0) / q.swatches.length);
        return { valid: true, error: rms, errors: errors, score: Math.round(Color.mapColorErrorToScore(rms, p.multiScoring.curve) * Color.SCORE_SCALE) / Color.SCORE_SCALE };
    }
    function equalAnswer(q, a, b) { return validateAnswer(q, a) && validateAnswer(q, b) && (q.variant === 'single' ? wrap(a.h) === wrap(b.h) && a.s === b.s && a.l === b.l : q.swatches.every(function (id) { return wrap(a[id]) === wrap(b[id]); })); }
    return { version: 1, variants: IDS, configuration: configuration, scoringParameters: scoringParameters, wrap: wrap, circularDistance: circularDistance, validHsl: validHsl, hslToRgb: hslToRgb, rgbToHsl: rgbToHsl,
        initialState: initialState, select: select, prepare: prepare, generateQuestion: generateQuestion, supported: supported, validateAnswer: validateAnswer, initialAnswer: initialAnswer, targetAnswer: targetAnswer, answerRgb: answerRgb, equalAnswer: equalAnswer, grade: grade };
});
