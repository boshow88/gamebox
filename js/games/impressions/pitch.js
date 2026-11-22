/* Pitch Impressions v1. Frequencies in Hz; wheel/generation intervals in cents. No DOM/audio/network. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ImpressionsPitch = factory();
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var GENERATION = Object.freeze({ toneCount: 4, minHz: 220, maxHz: 880, minInterval: 150, maxInterval: 720 });
    var SCORING = Object.freeze({ version: 1, tolerance: 180, exponent: 1.3 });
    var AUDIO = Object.freeze({ toneMs: 550, gapMs: 160, repeatGapMs: 450, repeats: 2, leadMs: 250, volume: 0.10, attackMs: 15, releaseMs: 45 });
    var TIMING = Object.freeze({ memorizeMs: 8000, answerMs: 35000 });
    function hzToCents(hz) { if (!Number.isFinite(hz) || hz <= 0) throw new RangeError('Frequency must be positive and finite.'); return 1200 * Math.log2(hz / 220); }
    function centsToHz(cents) { if (!Number.isFinite(cents)) throw new RangeError('Cents must be finite.'); var hz = 220 * Math.pow(2, cents / 1200); if (!Number.isFinite(hz) || hz <= 0) throw new RangeError('Frequency overflow.'); return Math.round(hz * 1e6) / 1e6; }
    function generationParameters(input) {
        var p = Object.assign({}, GENERATION, input);
        if (!Number.isInteger(p.toneCount) || p.toneCount < 3 || p.toneCount > 4
            || !Number.isFinite(p.minHz) || !Number.isFinite(p.maxHz) || p.minHz < 80 || p.maxHz > 2000 || p.minHz >= p.maxHz
            || !Number.isFinite(p.minInterval) || !Number.isFinite(p.maxInterval) || p.minInterval < 20 || p.maxInterval < p.minInterval
            || p.maxInterval > 1200 || hzToCents(p.maxHz) - hzToCents(p.minHz) < p.minInterval * 2 + 2)
            throw new RangeError('Invalid Pitch generation parameters.');
        return p;
    }
    function scoringParameters(input) {
        var p = Object.assign({}, SCORING, input);
        if (p.version !== 1 || ![p.tolerance, p.exponent].every(function (n) { return Number.isFinite(n) && n > 0; })) throw new RangeError('Invalid Pitch scoring version/parameters.');
        return { version: 1, tolerance: p.tolerance, exponent: p.exponent };
    }
    function audioParameters(input) {
        var p = Object.assign({}, AUDIO, input);
        if (!['toneMs', 'gapMs', 'repeatGapMs', 'leadMs', 'attackMs', 'releaseMs', 'volume'].every(function (key) { return Number.isFinite(p[key]) && p[key] >= 0; })
            || p.toneMs < 150 || p.toneMs > 1200 || p.gapMs > 1000 || p.repeatGapMs > 2000 || p.leadMs > 1000
            || !Number.isInteger(p.repeats) || p.repeats < 1 || p.repeats > 3 || p.volume <= 0 || p.volume > 0.18
            || p.attackMs < 5 || p.releaseMs < 10 || p.attackMs + p.releaseMs >= p.toneMs) throw new RangeError('Invalid Pitch audio parameters.');
        return p;
    }
    function sequenceDuration(toneCount, audio) { return toneCount * audio.toneMs + (toneCount - 1) * audio.gapMs; }
    function configuration(input) {
        input = input || {}; var generation = generationParameters(input.generation), audio = audioParameters(input.audio), timing = Object.assign({}, TIMING, input.timing);
        var initialHz = input.initialHz === undefined ? Math.max(generation.minHz, Math.min(generation.maxHz, 440)) : input.initialHz;
        if (!['memorizeMs', 'answerMs'].every(function (key) { return Number.isFinite(timing[key]) && timing[key] >= 1000 && timing[key] <= 90000; })
            || audio.leadMs + audio.repeats * sequenceDuration(generation.toneCount, audio) + (audio.repeats - 1) * audio.repeatGapMs > timing.memorizeMs
            || !Number.isFinite(initialHz) || initialHz < generation.minHz || initialHz > generation.maxHz) throw new RangeError('Invalid Pitch timing/initial pitch.');
        return { generation: generation, scoring: scoringParameters(input.scoring), audio: audio, timing: timing, initialHz: initialHz };
    }
    function randomFromSeed(seed) {
        var state = seed >>> 0; return function () { state = (state + 0x6d2b79f5) | 0; var n = Math.imul(state ^ (state >>> 15), 1 | state); n ^= n + Math.imul(n ^ (n >>> 7), 61 | n); return ((n ^ (n >>> 14)) >>> 0) / 4294967296; };
    }
    function generateQuestion(seed, input) {
        if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Seed must be a uint32.');
        var p = generationParameters(input), random = randomFromSeed(seed), low = Math.ceil(hzToCents(p.minHz)), high = Math.floor(hzToCents(p.maxHz));
        var cents = [Math.round(low + (high - low) * (0.25 + random() * 0.5))], intervals = [300, 400, 500, 700];
        while (cents.length < p.toneCount) {
            var previous = cents[cents.length - 1], next = null;
            for (var attempt = 0; attempt < 64; attempt++) {
                var step = Math.max(p.minInterval, Math.min(p.maxInterval, intervals[Math.floor(random() * intervals.length)] + Math.round((random() * 2 - 1) * 35)));
                var candidate = previous + (random() < 0.5 ? -step : step);
                if (candidate >= low && candidate <= high) { next = candidate; break; }
            }
            if (next === null) next = previous + (previous < (low + high) / 2 ? 1 : -1) * Math.ceil(p.minInterval);
            cents.push(next);
        }
        return Object.freeze({ type: 'pitch', version: 1, seed: seed, target: Object.freeze(cents.map(centsToHz)) });
    }
    function validFrequencies(answer, generation) {
        return Array.isArray(answer) && answer.length === generation.toneCount && answer.every(function (hz) { return Number.isFinite(hz) && hz >= generation.minHz && hz <= generation.maxHz; });
    }
    function validateAnswer(target, answer, input) { var p = generationParameters(input); return validFrequencies(target, p) && validFrequencies(answer, p) && answer[0] === target[0]; }
    function initialAnswer(question, input) { var p = configuration(input); return question.target.map(function (hz, i) { return i === 0 ? hz : p.initialHz; }); }
    function calculateError(target, answer) {
        if (!Array.isArray(target) || !Array.isArray(answer) || target.length < 2 || target.length !== answer.length
            || !target.concat(answer).every(function (hz) { return Number.isFinite(hz) && hz > 0; })) throw new RangeError('Invalid pitch sequence.');
        var errors = target.slice(1).map(function (hz, i) { return 1200 * Math.log2(answer[i + 1] / hz); });
        return { errors: errors, rms: Math.sqrt(errors.reduce(function (sum, n) { return sum + n * n; }, 0) / errors.length) };
    }
    function mapErrorToScore(error, input) { var p = scoringParameters(input); if (!Number.isFinite(error) || error < 0) throw new RangeError('Invalid RMS cents.'); return Math.max(0, Math.min(100, 100 * Math.exp(-Math.pow(error / p.tolerance, p.exponent)))); }
    function grade(target, answer, input, generation) {
        var scoring = scoringParameters(input);
        if (!validateAnswer(target, answer, generation)) return { valid: false, error: null, errors: null, score: 0 };
        var error = calculateError(target, answer);
        return { valid: true, error: error.rms, errors: error.errors, score: Math.round(mapErrorToScore(error.rms, scoring) * 1000) / 1000 };
    }
    return { version: 1, scoringVersion: 1, defaults: Object.freeze({ generation: GENERATION, scoring: SCORING, audio: AUDIO, timing: TIMING, initialHz: 440 }),
        hzToCents: hzToCents, centsToHz: centsToHz, generationParameters: generationParameters, scoringParameters: scoringParameters, audioParameters: audioParameters,
        sequenceDuration: sequenceDuration, configuration: configuration, generateQuestion: generateQuestion, validateAnswer: validateAnswer,
        initialAnswer: initialAnswer, calculateError: calculateError, mapErrorToScore: mapErrorToScore, grade: grade };
});
