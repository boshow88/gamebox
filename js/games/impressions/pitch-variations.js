/* Pitch question v2 / variation selection v1. Original Pitch v1 remains untouched. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./pitch.js'), require('./progression.js'));
    else root.ImpressionsPitchVariations = factory(root.ImpressionsPitch, root.ImpressionsProgression);
})(typeof window === 'object' ? window : globalThis, function (Pitch, Progression) {
    'use strict';
    var CONTOURS = Object.freeze(['ascending', 'descending', 'arch', 'valley', 'mixed', 'echo']);
    function copy(v) { return JSON.parse(JSON.stringify(v)); }
    function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
    function integer(v, low, high) { return Number.isInteger(v) && v >= low && v <= high; }
    function random(seed) { var s = seed >>> 0; return function () { s = (s + 0x6d2b79f5) | 0; var n = Math.imul(s ^ s >>> 15, 1 | s); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296; }; }
    function requireSeed(seed) { if (!integer(seed, 0, 0xffffffff)) throw new RangeError('Pitch seed must be uint32.'); }
    function configuration(input) {
        input = input || {};
        var p = { version: input.version === undefined ? 1 : input.version,
            lengths: { easy: Object.assign({ n3: 3, n4: 4, n5: 2 }, input.lengths && input.lengths.easy), hard: Object.assign({ n3: 2, n4: 3, n5: 3 }, input.lengths && input.lengths.hard) },
            references: { easy: Object.assign({ one: 4, two: 1 }, input.references && input.references.easy), hard: Object.assign({ one: 6, two: 1 }, input.references && input.references.hard) },
            positions: Object.assign({ first: 1, middle: 1, last: 1, interior: 1 }, input.positions),
            contours: Object.assign({ ascending: 2, descending: 2, arch: 2, valley: 2, mixed: 4, echo: 1 }, input.contours),
            timing: { memoryScales: Object.assign({ n3: 0.9, n4: 1, n5: 1.2 }, input.timing && input.timing.memoryScales), answerScales: Object.assign({ n3: 1, n4: 1, n5: 1.15 }, input.timing && input.timing.answerScales),
                easyScale: input.timing && input.timing.easyScale !== undefined ? input.timing.easyScale : 1.15, hardScale: input.timing && input.timing.hardScale !== undefined ? input.timing.hardScale : 0.9,
                safetyMs: input.timing && input.timing.safetyMs !== undefined ? input.timing.safetyMs : 300 } };
        if (p.version !== 1) throw new RangeError('Unknown Pitch variation version.');
        ['easy', 'hard'].forEach(function (end) {
            if (![3, 4, 5].every(function (n) { return Number.isFinite(p.lengths[end]['n' + n]) && p.lengths[end]['n' + n] >= 0 && p.lengths[end]['n' + n] <= 10; }) || [3, 4, 5].reduce(function (sum, n) { return sum + p.lengths[end]['n' + n]; }, 0) <= 0) throw new RangeError('Enable a Pitch sequence length.');
            if (!['one', 'two'].every(function (key) { return Number.isFinite(p.references[end][key]) && p.references[end][key] >= 0 && p.references[end][key] <= 10; }) || p.references[end].one + p.references[end].two <= 0) throw new RangeError('Enable a reference option.');
        });
        if (!CONTOURS.every(function (id) { return Number.isFinite(p.contours[id]) && p.contours[id] >= 0 && p.contours[id] <= 10; }) || CONTOURS.reduce(function (sum, id) { return sum + p.contours[id]; }, 0) <= 0) throw new RangeError('Enable a melodic contour.');
        if (!['first', 'middle', 'last', 'interior'].every(function (id) { return Number.isFinite(p.positions[id]) && p.positions[id] >= 0 && p.positions[id] <= 10; }) || Object.values(p.positions).reduce(function (sum, value) { return sum + value; }, 0) <= 0 || (p.lengths.easy.n3 > 0 || p.lengths.hard.n3 > 0) && p.positions.first + p.positions.middle + p.positions.last <= 0) throw new RangeError('Enable a valid reference position for each sequence length.');
        if (![3, 4, 5].every(function (n) { return [p.timing.memoryScales['n' + n], p.timing.answerScales['n' + n]].every(function (v) { return Number.isFinite(v) && v >= 0.5 && v <= 2; }); })
            || !Number.isFinite(p.timing.easyScale) || p.timing.easyScale < 1 || p.timing.easyScale > 2 || !Number.isFinite(p.timing.hardScale) || p.timing.hardScale < 0.5 || p.timing.hardScale > 1
            || !integer(p.timing.safetyMs, 100, 2000)) throw new RangeError('Invalid Pitch variation timing.');
        return p;
    }
    function initialState() { return { version: 1, draw: 0, lastStructure: null, streak: 0, lastContour: null, contourStreak: 0 }; }
    function baseConfiguration(input) {
        input = input || {}; var generation = Pitch.generationParameters(input.generation), audio = Pitch.audioParameters(input.audio), timing = Object.assign({}, Pitch.defaults.timing, input.timing), initialHz = input.initialHz === undefined ? Math.max(generation.minHz, Math.min(generation.maxHz, 440)) : input.initialHz;
        if (!['memorizeMs', 'answerMs'].every(function (id) { return Number.isFinite(timing[id]) && timing[id] >= 1000 && timing[id] <= 90000; }) || !Number.isFinite(initialHz) || initialHz < generation.minHz || initialHz > generation.maxHz) throw new RangeError('Invalid varied Pitch timing/initial pitch.');
        var variations = configuration(input.variations), span = Math.floor(Pitch.hzToCents(generation.maxHz)) - Math.ceil(Pitch.hzToCents(generation.minHz));
        if ([3, 4, 5].some(function (n) { return (variations.lengths.easy['n' + n] > 0 || variations.lengths.hard['n' + n] > 0) && span < Math.ceil(generation.minInterval) * (n - 1); })) throw new RangeError('The audible range is too narrow for an enabled Pitch length.');
        return { generation: generation, scoring: Pitch.scoringParameters(input.scoring), audio: audio, timing: timing, initialHz: initialHz };
    }
    function weighted(items, rng) { var ticket = rng() * items.reduce(function (sum, item) { return sum + item.weight; }, 0), result = items[items.length - 1]; items.some(function (item) { ticket -= item.weight; if (ticket < 0) { result = item; return true; } return false; }); return result; }
    function select(seed, level, input, previous) {
        requireSeed(seed); var p = configuration(input), state = previous || initialState(), ratio = (level - 1) / 9;
        if (!Number.isFinite(level) || level < 1 || level > 10 || state.version !== 1 || !integer(state.draw, 0, Number.MAX_SAFE_INTEGER)) throw new RangeError('Invalid Pitch selection state/difficulty.');
        var rng = random((seed ^ Math.imul(state.draw + 1, 0x57ac291d)) >>> 0), candidates = [];
        [3, 4, 5].forEach(function (n) {
            var lengthWeight = p.lengths.easy['n' + n] + (p.lengths.hard['n' + n] - p.lengths.easy['n' + n]) * ratio, one = n === 3 ? 1 : p.references.easy.one + (p.references.hard.one - p.references.easy.one) * ratio, two = n === 3 ? 0 : p.references.easy.two + (p.references.hard.two - p.references.easy.two) * ratio;
            if (!lengthWeight) return;
            var positions = Array.from({ length: n }, function (_, i) { return p.positions[i === 0 ? 'first' : i === n - 1 ? 'last' : i === Math.floor(n / 2) ? 'middle' : 'interior']; }), positionTotal = positions.reduce(function (sum, value) { return sum + value; }, 0);
            if (one) for (var i = 0; i < n; i++) if (positions[i]) candidates.push({ toneCount: n, fixedIndices: [i], structure: n + ':' + i, weight: lengthWeight * one / (one + two) * positions[i] / positionTotal });
            if (two) candidates.push({ toneCount: n, fixedIndices: [0, n - 1], structure: n + ':0,' + (n - 1), weight: lengthWeight * two / (one + two) });
        });
        if (state.streak >= 2 && candidates.some(function (item) { return item.structure !== state.lastStructure; })) candidates = candidates.filter(function (item) { return item.structure !== state.lastStructure; });
        var chosen = weighted(candidates, rng), contours = CONTOURS.filter(function (id) { return p.contours[id] > 0; });
        if (state.contourStreak >= 2 && contours.some(function (id) { return id !== state.lastContour; })) contours = contours.filter(function (id) { return id !== state.lastContour; });
        var contour = weighted(contours.map(function (id) { return { id: id, weight: p.contours[id] }; }), rng).id;
        return { variation: { version: 1, toneCount: chosen.toneCount, fixedIndices: chosen.fixedIndices, contour: contour },
            state: { version: 1, draw: state.draw + 1, lastStructure: chosen.structure, streak: chosen.structure === state.lastStructure ? state.streak + 1 : 1, lastContour: contour, contourStreak: contour === state.lastContour ? state.contourStreak + 1 : 1 } };
    }
    function validVariation(v) { return !!v && v.version === 1 && integer(v.toneCount, 3, 5) && CONTOURS.includes(v.contour) && Array.isArray(v.fixedIndices) && v.fixedIndices.length >= 1 && v.fixedIndices.length <= 2 && v.toneCount - v.fixedIndices.length >= 2 && v.fixedIndices.every(function (i, j) { return integer(i, 0, v.toneCount - 1) && (!j || i > v.fixedIndices[j - 1]); }); }
    function generationParameters(input) {
        var p = Object.assign({}, Pitch.defaults.generation, input);
        if (!integer(p.toneCount, 3, 5) || ![p.minHz, p.maxHz, p.minInterval, p.maxInterval].every(Number.isFinite) || p.minHz < 80 || p.maxHz > 2000 || p.minHz >= p.maxHz || p.minInterval < 20 || p.maxInterval < p.minInterval || p.maxInterval > 1200
            || Math.ceil(p.minInterval) > Math.floor(p.maxInterval) || Math.floor(Pitch.hzToCents(p.maxHz)) - Math.ceil(Pitch.hzToCents(p.minHz)) < Math.ceil(p.minInterval) * (p.toneCount - 1)) throw new RangeError('Invalid varied Pitch generation bounds.');
        return { toneCount: p.toneCount, minHz: p.minHz, maxHz: p.maxHz, minInterval: Math.ceil(p.minInterval), maxInterval: Math.floor(p.maxInterval) };
    }
    function requiredMemorizeMs(count, audio, safety) { var p = Pitch.audioParameters(audio); return p.leadMs + p.repeats * Pitch.sequenceDuration(count, p) + (p.repeats - 1) * p.repeatGapMs + (safety === undefined ? 300 : safety); }
    function prepare(seed, base, difficultyState, previous) {
        var p = configuration(base.pitch.variations), metadata = Progression.prepare('pitch', seed, base, difficultyState, base.adaptive), selected = select(seed, metadata.difficulty.effective, p, previous), n = selected.variation.toneCount;
        var generation = Object.assign({}, metadata.parameters.generation, { toneCount: n }), span = Math.floor(Pitch.hzToCents(generation.maxHz)) - Math.ceil(Pitch.hzToCents(generation.minHz));
        generation.maxInterval = Math.min(generation.maxInterval, Math.floor(span / (n - 1)));
        metadata.parameters.generation = generationParameters(generation);
        var ratio = (metadata.difficulty.effective - 1) / 9, middle = (base.adaptive.mappingCenter - 1) / 9;
        var scale = !base.adaptive.enabled ? 1 : ratio <= middle ? p.timing.easyScale + (1 - p.timing.easyScale) * (middle ? ratio / middle : 1) : 1 + (p.timing.hardScale - 1) * ((ratio - middle) / (1 - middle || 1));
        var memory = base.pitch.timing.memorizeMs * p.timing.memoryScales['n' + n] * scale, required = requiredMemorizeMs(n, base.pitch.audio, p.timing.safetyMs);
        metadata.parameters.timing.memorizeMs = Math.ceil(Math.max(memory, required) / 100) * 100;
        metadata.parameters.timing.answerMs = Math.round(base.pitch.timing.answerMs * p.timing.answerScales['n' + n] / 100) * 100;
        metadata.parameters.pitch = { version: 1, variation: copy(selected.variation), requiredMemorizeMs: required, safetyMs: p.timing.safetyMs };
        if (metadata.parameters.timing.memorizeMs > 3600000 || metadata.parameters.timing.answerMs > 3600000) throw new RangeError('Varied Pitch timeline is too long.');
        return { variation: selected.variation, state: selected.state, metadata: metadata };
    }
    function generateQuestion(seed, variation, input) {
        requireSeed(seed); if (!validVariation(variation)) throw new RangeError('Invalid Pitch variation.'); var p = generationParameters(Object.assign({}, input, { toneCount: variation.toneCount })), rng = random((seed ^ 0x72d5a91b) >>> 0);
        var low = Math.ceil(Pitch.hzToCents(p.minHz)), high = Math.floor(Pitch.hzToCents(p.maxHz)), offsets;
        for (var attempt = 0; attempt < 256; attempt++) {
            offsets = [0]; var turn = 1 + Math.floor(rng() * (p.toneCount - 2)), echo = Math.round(p.minInterval + rng() * (p.maxInterval - p.minInterval));
            for (var i = 1; i < p.toneCount; i++) {
                var span = p.maxInterval - p.minInterval, step = variation.contour === 'echo' ? echo + Math.round((rng() * 2 - 1) * 27) : variation.contour === 'mixed' ? p.minInterval + span * (rng() < 0.55 ? rng() * 0.35 : 0.65 + rng() * 0.35) : p.minInterval + rng() * span;
                step = Math.max(p.minInterval, Math.min(p.maxInterval, Math.round(step))); if (step % 100 === 0 && step < p.maxInterval) step++;
                var sign = variation.contour === 'ascending' ? 1 : variation.contour === 'descending' ? -1 : variation.contour === 'arch' ? i <= turn ? 1 : -1 : variation.contour === 'valley' ? i <= turn ? -1 : 1 : rng() < 0.5 ? -1 : 1;
                offsets.push(offsets[i - 1] + sign * step);
            }
            if (Math.max(...offsets) - Math.min(...offsets) <= high - low) break;
        }
        var minimum = Math.min(...offsets), maximum = Math.max(...offsets); if (maximum - minimum > high - low) throw new RangeError('Pitch contour does not fit the audible range.');
        var base = low - minimum + Math.floor(rng() * (high - low - maximum + minimum + 1)), tones = Array.from({ length: p.toneCount }, function (_, i) { return 'n' + (i + 1); });
        return freeze({ type: 'pitch', version: 2, variant: 'melody', variationVersion: 1, answerSchema: 'pitch-hz-map-v1', scoringVersion: 1, seed: seed, variation: copy(variation), tones: tones,
            fixed: variation.fixedIndices.map(function (i) { return tones[i]; }), target: Object.fromEntries(tones.map(function (id, i) { return [id, Pitch.centsToHz(base + offsets[i])]; })) });
    }
    function validMap(q, answer, generation) { return !!answer && typeof answer === 'object' && !Array.isArray(answer) && Object.keys(answer).length === q.tones.length && q.tones.every(function (id) { return Object.hasOwn(answer, id) && Number.isFinite(answer[id]) && answer[id] >= generation.minHz && answer[id] <= generation.maxHz; }); }
    function supported(q, generation, scoring) {
        if (!q || q.type !== 'pitch' || q.version !== 2 || q.variant !== 'melody' || q.variationVersion !== 1 || q.answerSchema !== 'pitch-hz-map-v1' || q.scoringVersion !== 1 || !scoring || scoring.version !== 1 || !validVariation(q.variation)) return false;
        if (generation && generation.toneCount !== q.variation.toneCount) return false;
        try { generation = generationParameters(Object.assign({}, generation, { toneCount: q.variation.toneCount })); Pitch.scoringParameters(scoring); } catch (_) { return false; }
        return Array.isArray(q.tones) && q.tones.length === q.variation.toneCount && q.tones.every(function (id, i) { return id === 'n' + (i + 1); }) && Array.isArray(q.fixed) && q.fixed.length === q.variation.fixedIndices.length && q.fixed.every(function (id, i) { return id === q.tones[q.variation.fixedIndices[i]]; }) && validMap(q, q.target, generation);
    }
    function validateAnswer(q, answer, generation) { if (!supported(q, generation, Pitch.defaults.scoring)) return false; var g = generationParameters(Object.assign({}, generation, { toneCount: q.tones.length })); return validMap(q, answer, g) && q.fixed.every(function (id) { return answer[id] === q.target[id]; }); }
    function initialAnswer(q, initialHz) { return Object.fromEntries(q.tones.map(function (id) { return [id, q.fixed.includes(id) ? q.target[id] : initialHz === undefined ? 440 : initialHz]; })); }
    function sequence(q, answer) { return q.tones.map(function (id) { return answer[id]; }); }
    function grade(q, answer, scoring, generation) {
        var p = Pitch.scoringParameters(scoring); if (!supported(q, generation, p) || !validateAnswer(q, answer, generation)) return { valid: false, error: null, errors: null, score: 0 };
        var ids = q.tones.filter(function (id) { return !q.fixed.includes(id); }), errors = Object.fromEntries(ids.map(function (id) { return [id, 1200 * Math.log2(answer[id] / q.target[id])]; }));
        var rms = Math.sqrt(ids.reduce(function (sum, id) { return sum + errors[id] * errors[id]; }, 0) / ids.length);
        return { valid: true, error: rms, errors: errors, score: Math.round(Pitch.mapErrorToScore(rms, p) * 1000) / 1000 };
    }
    function equalAnswer(q, a, b, generation) { return validateAnswer(q, a, generation) && validateAnswer(q, b, generation) && q.tones.every(function (id) { return a[id] === b[id]; }); }
    return { version: 1, contours: CONTOURS, configuration: configuration, baseConfiguration: baseConfiguration, initialState: initialState, select: select, validVariation: validVariation, generationParameters: generationParameters, requiredMemorizeMs: requiredMemorizeMs,
        prepare: prepare, generateQuestion: generateQuestion, supported: supported, validateAnswer: validateAnswer, initialAnswer: initialAnswer, sequence: sequence, grade: grade, equalAnswer: equalAnswer };
});
