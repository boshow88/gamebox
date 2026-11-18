/* Versioned weighted bags and independent human-performance difficulty. No DOM/network. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MemoryProgression = factory();
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var TYPES = Object.freeze(['color', 'quantity', 'pitch']);
    var WEIGHTS = Object.freeze({ color: 2, quantity: 2, pitch: 2 });
    var ADAPTIVE = Object.freeze({ version: 1, enabled: true, min: 1, max: 10, initial: 5, mappingCenter: 5, step: 0.5, low: 55, high: 85, window: 4, minRounds: 3, minObservations: 3, jitter: 0.25 });
    var MAPPINGS = Object.freeze({ color: Object.freeze({ easyMemorizeScale: 1.35, hardMemorizeScale: 0.70, minMemorizeMs: 1500 }),
        quantity: Object.freeze({ easyMinFraction: 0, easyMaxFraction: 0.30, hardMinFraction: 0.55, hardMaxFraction: 1, easyMemorizeScale: 1.15, hardMemorizeScale: 0.85, minMemorizeMs: 1500 }),
        pitch: Object.freeze({ threeToneThrough: 4, easyMaxInterval: 500, hardMaxInterval: 720 }) });
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
    function unit(seed) { var n = seed >>> 0; n = Math.imul(n ^ n >>> 16, 0x7feb352d); n = Math.imul(n ^ n >>> 15, 0x846ca68b); return ((n ^ n >>> 16) >>> 0) / 4294967296; }
    function weights(input) { var p = Object.assign({}, WEIGHTS, input); if (!TYPES.every(function (id) { return [0, 1, 2, 4].includes(p[id]); })) throw new RangeError('Invalid category frequency.'); return Object.fromEntries(TYPES.map(function (id) { return [id, p[id]]; })); }
    function total(input) { return TYPES.reduce(function (sum, id) { return sum + input[id]; }, 0); }
    function preset(id) { return id === 'mixed' || id === 'weighted' ? copy(WEIGHTS) : Object.fromEntries(TYPES.map(function (type) { return [type, type === id ? 2 : 0]; })); }
    function parameters(input) {
        input = input || {}; var p = Object.assign({}, ADAPTIVE, input);
        if (p.version !== 1 || typeof p.enabled !== 'boolean' || !['min', 'max', 'initial', 'mappingCenter', 'step', 'low', 'high', 'jitter'].every(function (key) { return Number.isFinite(p[key]); })
            || p.min < 1 || p.max > 10 || p.min >= p.max || p.initial < p.min || p.initial > p.max || p.step <= 0 || p.step > 1
            || p.mappingCenter < 1 || p.mappingCenter > 10 || p.low < 0 || p.high > 100 || p.low >= p.high || p.jitter < 0 || p.jitter > 0.5
            || !Number.isInteger(p.window) || p.window < 3 || p.window > 5 || !Number.isInteger(p.minRounds) || p.minRounds < 2 || p.minRounds > p.window
            || !Number.isInteger(p.minObservations) || p.minObservations < 2 || p.minObservations > 40) throw new RangeError('Invalid adaptive difficulty settings.');
        p.initialByType = Object.assign({}, Object.fromEntries(TYPES.map(function (id) { return [id, p.initial]; })), input.initialByType);
        if (!TYPES.every(function (id) { return Number.isFinite(p.initialByType[id]) && p.initialByType[id] >= p.min && p.initialByType[id] <= p.max; })) throw new RangeError('Invalid initial category difficulty.');
        p.mappings = {};
        TYPES.forEach(function (id) { p.mappings[id] = Object.assign({}, MAPPINGS[id], input.mappings && input.mappings[id]); if (!Object.values(p.mappings[id]).every(function (n) { return Number.isFinite(n); })) throw new RangeError('Invalid difficulty mapping.'); });
        ['color', 'quantity'].forEach(function (id) { var m = p.mappings[id]; if (m.easyMemorizeScale < 1 || m.easyMemorizeScale > 2 || m.hardMemorizeScale < 0.5 || m.hardMemorizeScale > 1 || m.minMemorizeMs < 1000 || m.minMemorizeMs > 60000) throw new RangeError('Invalid memorization mapping.'); });
        var q = p.mappings.quantity, pitch = p.mappings.pitch;
        if (![q.easyMinFraction, q.easyMaxFraction, q.hardMinFraction, q.hardMaxFraction].every(function (n) { return n >= 0 && n <= 1; })
            || q.easyMinFraction > q.easyMaxFraction || q.hardMinFraction > q.hardMaxFraction || q.easyMinFraction > q.hardMinFraction || q.easyMaxFraction > q.hardMaxFraction
            || pitch.threeToneThrough < 1 || pitch.threeToneThrough > 10 || pitch.easyMaxInterval < 150 || pitch.hardMaxInterval > 720 || pitch.easyMaxInterval > pitch.hardMaxInterval) throw new RangeError('Invalid generation mapping.');
        return p;
    }
    function selection(seed) { if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Selection seed must be uint32.'); return { version: 1, seed: seed, draw: 0, cycle: 0, remaining: { color: 0, quantity: 0, pitch: 0 }, last: null, streak: 0 }; }
    function draw(state, input) {
        var p = weights(input); if (!total(p)) throw new RangeError('Enable at least one category.');
        if (!state || state.version !== 1) throw new RangeError('Unknown selection state.');
        var next = copy(state); if (!total(next.remaining)) { next.remaining = copy(p); next.cycle++; }
        var ids = TYPES.filter(function (id) { return next.remaining[id] > 0; });
        if (next.streak >= 2 && ids.some(function (id) { return id !== next.last; })) ids = ids.filter(function (id) { return id !== next.last; });
        // Preserve enough separators for the rest of this small bag where possible.
        var feasible = ids.filter(function (chosen) { var left = total(next.remaining) - 1, streak = chosen === next.last ? next.streak + 1 : 1;
            return TYPES.every(function (id) { var count = next.remaining[id] - (id === chosen ? 1 : 0); return count <= 2 * (left - count + 1) - (id === chosen ? streak : 0); }); });
        if (feasible.length) ids = feasible;
        var sum = ids.reduce(function (n, id) { return n + next.remaining[id]; }, 0), ticket = unit((next.seed ^ Math.imul(next.draw + 1, 0x9e3779b9)) >>> 0) * sum;
        var chosen = ids[ids.length - 1]; ids.some(function (id) { ticket -= next.remaining[id]; if (ticket < 0) { chosen = id; return true; } return false; });
        next.remaining[chosen]--; next.draw++; next.streak = chosen === next.last ? next.streak + 1 : 1; next.last = chosen;
        return { categoryId: chosen, state: next };
    }
    function difficulty(input) { var p = parameters(input); return { version: 1, difficultyByType: copy(p.initialByType), historyByType: { color: [], quantity: [], pitch: [] }, lastRoundByType: { color: 0, quantity: 0, pitch: 0 }, lastUpdate: null }; }
    function median(values) { if (!values.length) return null; var sorted = values.slice().sort(function (a, b) { return a - b; }), i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; }
    function observe(state, type, round, observations, input) {
        var p = parameters(input); if (!TYPES.includes(type) || !state || state.version !== 1 || !Number.isInteger(round) || round < 1) throw new RangeError('Invalid difficulty observation.');
        if (round <= state.lastRoundByType[type]) return state;
        var next = copy(state); next.lastRoundByType[type] = round;
        var scores = observations.filter(function (o) { return o.human === true && o.accepted === true && o.valid === true && !o.withdrawn && Number.isFinite(o.score) && o.score >= 0 && o.score <= 100; }).map(function (o) { return o.score; });
        var before = next.difficultyByType[type]; next.lastUpdate = { categoryId: type, round: round, before: before, after: before, median: null, observations: 0, rounds: 0 };
        if (!scores.length) return next;
        next.historyByType[type].push({ round: round, scores: scores }); next.historyByType[type] = next.historyByType[type].slice(-p.window);
        var history = next.historyByType[type], values = history.flatMap(function (entry) { return entry.scores; }), center = median(values);
        if (p.enabled && history.length >= p.minRounds && values.length >= p.minObservations) next.difficultyByType[type] = clamp(before + (center > p.high ? p.step : center < p.low ? -p.step : 0), p.min, p.max);
        next.lastUpdate = { categoryId: type, round: round, before: before, after: next.difficultyByType[type], median: center, observations: values.length, rounds: history.length }; return next;
    }
    function prepare(type, seed, base, state, input) {
        var p = parameters(input), level = state.difficultyByType[type], variation = p.enabled ? (unit((seed ^ 0xa511e9b3) >>> 0) * 2 - 1) * p.jitter : 0;
        var effective = clamp(level + variation, p.min, p.max), ratio = (effective - p.min) / (p.max - p.min);
        var settings = type === 'color' ? { generation: copy(base.generation), timing: copy(base.timing) } : { generation: copy(base[type].generation), timing: Object.assign({}, base.timing, type === 'pitch' ? base.pitch.timing : {}) };
        if (p.enabled) {
            var m = p.mappings[type];
            if (type === 'color' || type === 'quantity') {
                var middle = (clamp(p.mappingCenter, p.min, p.max) - p.min) / (p.max - p.min), scale = ratio <= middle ? m.easyMemorizeScale + (1 - m.easyMemorizeScale) * (middle ? ratio / middle : 1) : 1 + (m.hardMemorizeScale - 1) * ((ratio - middle) / (1 - middle || 1));
                settings.timing.memorizeMs = Math.max(m.minMemorizeMs, Math.round(settings.timing.memorizeMs * scale / 100) * 100);
            }
            if (type === 'quantity') {
                var span = settings.generation.maxCount - settings.generation.minCount, low = settings.generation.minCount;
                settings.generation.minCount = low + Math.round(span * (m.easyMinFraction + (m.hardMinFraction - m.easyMinFraction) * ratio));
                settings.generation.maxCount = low + Math.round(span * (m.easyMaxFraction + (m.hardMaxFraction - m.easyMaxFraction) * ratio));
            }
            if (type === 'pitch') {
                settings.generation.toneCount = effective <= m.threeToneThrough ? 3 : settings.generation.toneCount;
                settings.generation.maxInterval = Math.max(settings.generation.minInterval, Math.min(settings.generation.maxInterval, Math.round(m.easyMaxInterval + (m.hardMaxInterval - m.easyMaxInterval) * ratio)));
            }
        }
        return { difficulty: { version: 1, base: level, variation: variation, effective: effective }, parameters: { version: 1, generation: settings.generation, timing: settings.timing } };
    }
    return { types: TYPES, defaults: Object.freeze({ weights: WEIGHTS, adaptive: ADAPTIVE, mappings: MAPPINGS }), weights: weights, total: total, preset: preset,
        parameters: parameters, selection: selection, draw: draw, difficulty: difficulty, median: median, observe: observe, prepare: prepare };
});
