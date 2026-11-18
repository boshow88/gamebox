/* Quantity variants v1 and multi-group scoring v2. Original scalar Quantity stays unchanged. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./impressions-quantity.js'), require('./impressions-progression.js'));
    else root.ImpressionsQuantityGroups = factory(root.ImpressionsQuantity, root.ImpressionsProgression);
})(typeof window === 'object' ? window : globalThis, function (Quantity, Progression) {
    'use strict';
    var IDS = Object.freeze(['single', 'multi2', 'multi3']);
    var GROUPS = Object.freeze([Object.freeze({ id: 'circle', shape: 'circle', color: '#79b8ff' }), Object.freeze({ id: 'square', shape: 'square', color: '#ffa86b' }), Object.freeze({ id: 'triangle', shape: 'triangle', color: '#c5a0ff' })]);
    var SCORING = Object.freeze({ version: 2, tolerance: 0.30, exponent: 1.5 });
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
    function unit(seed) { var n = seed >>> 0; n = Math.imul(n ^ n >>> 16, 0x7feb352d); n = Math.imul(n ^ n >>> 15, 0x846ca68b); return ((n ^ n >>> 16) >>> 0) / 4294967296; }
    function scoringParameters(input) {
        var p = Object.assign({}, SCORING, input);
        if (p.version !== 2 || ![p.tolerance, p.exponent].every(function (n) { return Number.isFinite(n) && n > 0; })) throw new RangeError('Invalid multi-group scoring parameters.');
        return { version: 2, tolerance: p.tolerance, exponent: p.exponent };
    }
    function configuration(input) {
        input = input || {};
        var p = { version: input.version === undefined ? 1 : input.version, scoring: scoringParameters(input.scoring),
            weights: { easy: Object.assign({ single: 4, multi2: 2, multi3: 1 }, input.weights && input.weights.easy), hard: Object.assign({ single: 2, multi2: 3, multi3: 3 }, input.weights && input.weights.hard) },
            multi2: Object.assign({ minCount: 15, maxCount: 65, answerMax: 90, initialAnswer: 8, memorizeScale: 1.25 }, input.multi2),
            multi3: Object.assign({ minCount: 10, maxCount: 45, answerMax: 60, initialAnswer: 6, memorizeScale: 1.5 }, input.multi3),
            jitter: input.jitter === undefined ? 0.22 : input.jitter, dotRadius: input.dotRadius === undefined ? 0.0105 : input.dotRadius };
        if (p.version !== 1) throw new RangeError('Unknown Quantity variant version.');
        ['easy', 'hard'].forEach(function (end) { if (!IDS.every(function (id) { return Number.isFinite(p.weights[end][id]) && p.weights[end][id] >= 0 && p.weights[end][id] <= 10; }) || IDS.reduce(function (sum, id) { return sum + p.weights[end][id]; }, 0) <= 0) throw new RangeError('Enable at least one Quantity variant.'); });
        ['multi2', 'multi3'].forEach(function (id) {
            var settings = p[id], count = id === 'multi2' ? 2 : 3;
            if (![settings.minCount, settings.maxCount, settings.answerMax, settings.initialAnswer].every(Number.isInteger)
                || settings.minCount < 10 || settings.maxCount < settings.minCount || settings.maxCount > settings.answerMax
                || settings.answerMax * count > 220 || settings.initialAnswer < 0 || settings.initialAnswer > settings.answerMax
                || !Number.isFinite(settings.memorizeScale) || settings.memorizeScale < 1 || settings.memorizeScale > 2) throw new RangeError('Invalid multi-group quantity range/density.');
            Quantity.generationParameters({ minCount: 1, maxCount: settings.answerMax * count, poolSize: settings.answerMax * count, jitter: p.jitter, dotRadius: p.dotRadius });
        });
        return p;
    }
    function initialState() { return { version: 1, draw: 0, last: null, streak: 0 }; }
    function select(seed, difficulty, input, previous) {
        if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isFinite(difficulty) || difficulty < 1 || difficulty > 10) throw new RangeError('Invalid variant seed/difficulty.');
        var p = configuration(input), state = previous || initialState(), ratio = (difficulty - 1) / 9;
        if (state.version !== 1) throw new RangeError('Unknown Quantity variant state.');
        var weights = Object.fromEntries(IDS.map(function (id) { return [id, p.weights.easy[id] + (p.weights.hard[id] - p.weights.easy[id]) * ratio]; }));
        var eligible = IDS.filter(function (id) { return weights[id] > 0; });
        if (state.streak >= 2 && eligible.some(function (id) { return id !== state.last; })) eligible = eligible.filter(function (id) { return id !== state.last; });
        var ticket = unit((seed ^ Math.imul(state.draw + 1, 0x632be5ab)) >>> 0) * eligible.reduce(function (sum, id) { return sum + weights[id]; }, 0), chosen = eligible[eligible.length - 1];
        eligible.some(function (id) { ticket -= weights[id]; if (ticket < 0) { chosen = id; return true; } return false; });
        return { variant: chosen, state: { version: 1, draw: state.draw + 1, last: chosen, streak: chosen === state.last ? state.streak + 1 : 1 } };
    }
    function prepare(seed, base, difficultyState, previous) {
        var p = configuration(base.quantity.multi), original = Progression.prepare('quantity', seed, base, difficultyState, base.adaptive);
        var selected = select(seed, original.difficulty.effective, p, previous);
        if (selected.variant === 'single') return { variant: 'single', state: selected.state, metadata: original };
        var settings = p[selected.variant], altered = Object.assign({}, base, { quantity: Object.assign({}, base.quantity, { generation: Quantity.generationParameters({
            minCount: settings.minCount, maxCount: settings.maxCount, poolSize: settings.answerMax, jitter: p.jitter, dotRadius: p.dotRadius }) }) });
        var metadata = Progression.prepare('quantity', seed, altered, difficultyState, base.adaptive);
        metadata.parameters.timing.memorizeMs = Math.min(3600000, Math.round(metadata.parameters.timing.memorizeMs * settings.memorizeScale / 100) * 100);
        return { variant: selected.variant, state: selected.state, metadata: metadata };
    }
    function definitions(variant) { if (!['multi2', 'multi3'].includes(variant)) throw new RangeError('Unknown grouped variant.'); return GROUPS.slice(0, variant === 'multi2' ? 2 : 3); }
    function generationParameters(variant, input) { var p = configuration()[variant]; definitions(variant); return Quantity.generationParameters(input || { minCount: p.minCount, maxCount: p.maxCount, poolSize: p.answerMax, jitter: 0.22, dotRadius: 0.0105 }); }
    function requireSeed(seed) { if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Seed must be uint32.'); }
    function generateQuestion(seed, variant, input) {
        requireSeed(seed); var p = generationParameters(variant, input), groups = definitions(variant), target = {};
        groups.forEach(function (group, i) { target[group.id] = Quantity.generateQuestion((seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0, p).target; });
        return freeze({ type: 'quantity', version: 2, variant: variant, variantVersion: 1, seed: seed, groups: copy(groups), target: target, scoringVersion: 2 });
    }
    function createPools(seed, variant, input) {
        requireSeed(seed); var p = generationParameters(variant, input), groups = definitions(variant), capacity = groups.length * p.poolSize;
        if (capacity > 220) throw new RangeError('Combined quantity pool is too dense.');
        var pool = Quantity.createPool((seed ^ 0x51ed270b) >>> 0, { minCount: 1, maxCount: capacity, poolSize: capacity, jitter: p.jitter, dotRadius: p.dotRadius });
        var result = {};
        groups.forEach(function (group, index) { result[group.id] = Object.freeze(pool.filter(function (_, i) { return i % groups.length === index; })); });
        return Object.freeze(result);
    }
    function validateAnswer(question, answer, generation) {
        if (!question || !['multi2', 'multi3'].includes(question.variant) || !answer || typeof answer !== 'object' || Array.isArray(answer)) return false;
        var groups = definitions(question.variant), maximum = generationParameters(question.variant, generation).poolSize;
        return Object.keys(answer).length === groups.length && groups.every(function (group) { return Object.hasOwn(answer, group.id) && Quantity.validateAnswer(answer[group.id], maximum); });
    }
    function supported(question, generation, scoring) {
        if (!question || question.type !== 'quantity' || question.version !== 2 || question.variantVersion !== 1 || !['multi2', 'multi3'].includes(question.variant) || !scoring || scoring.version !== 2 || question.scoringVersion !== 2) return false;
        var expected = definitions(question.variant);
        generation = generationParameters(question.variant, generation);
        return Array.isArray(question.groups) && question.groups.length === expected.length && question.groups.every(function (group, i) { return group.id === expected[i].id && group.shape === expected[i].shape && group.color === expected[i].color; }) && validateAnswer(question, question.target, generation)
            && expected.every(function (group) { return question.target[group.id] >= generation.minCount && question.target[group.id] <= generation.maxCount; });
    }
    function initialAnswer(question, input) { var p = configuration(input), settings = p[question.variant]; return Object.fromEntries(definitions(question.variant).map(function (group) { return [group.id, settings.initialAnswer]; })); }
    function grade(question, answer, input, generation) {
        var p = scoringParameters(input);
        if (!supported(question, generation, p) || !validateAnswer(question, answer, generation)) return { valid: false, error: null, errors: null, score: 0 };
        var groups = definitions(question.variant), errors = Object.fromEntries(groups.map(function (group) { return [group.id, Math.abs(answer[group.id] - question.target[group.id]) / question.target[group.id]]; }));
        var rms = Math.sqrt(groups.reduce(function (sum, group) { return sum + errors[group.id] * errors[group.id]; }, 0) / groups.length);
        var score = 100 * Math.exp(-Math.pow(rms / p.tolerance, p.exponent));
        return { valid: true, error: rms, errors: errors, score: Math.round(Math.max(0, Math.min(100, score)) * 1000) / 1000 };
    }
    return { version: 1, scoringVersion: 2, variants: IDS, definitions: definitions, configuration: configuration, generationParameters: generationParameters, scoringParameters: scoringParameters,
        initialState: initialState, select: select, prepare: prepare, generateQuestion: generateQuestion, createPools: createPools,
        validateAnswer: validateAnswer, supported: supported, initialAnswer: initialAnswer, grade: grade };
});
