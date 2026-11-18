/* Quantity Impressions v1: one seeded stationary dot pool and scalar grading. No DOM/network. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ImpressionsQuantity = factory();
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var GENERATION = Object.freeze({ minCount: 30, maxCount: 150, poolSize: 220, jitter: 0.22, dotRadius: 0.009 });
    var SCORING = Object.freeze({ version: 1, tolerance: 0.30, exponent: 1.5 }), ASPECT = 4 / 3;
    function randomFromSeed(seed) {
        var state = seed >>> 0;
        return function () {
            state = (state + 0x6d2b79f5) | 0;
            var n = Math.imul(state ^ (state >>> 15), 1 | state);
            n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
            return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
        };
    }
    function requireSeed(seed) { if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Seed must be a uint32.'); }
    function generationParameters(input) {
        var settings = Object.assign({}, GENERATION, input);
        if (![settings.minCount, settings.maxCount, settings.poolSize].every(function (n) { return Number.isInteger(n) && n > 0 && n <= 1000; })
            || settings.minCount > settings.maxCount || settings.maxCount > settings.poolSize
            || !Number.isFinite(settings.jitter) || settings.jitter < 0 || settings.jitter > 0.3)
            throw new RangeError('Invalid quantity generation parameters.');
        var columns = Math.ceil(Math.sqrt(settings.poolSize * ASPECT)), rows = Math.ceil(settings.poolSize / columns);
        var radiusLimit = Math.min((1 - 2 * settings.jitter) / columns, (1 - 2 * settings.jitter) / rows / ASPECT) / 2;
        if (!input || input.dotRadius === undefined) settings.dotRadius = Math.min(GENERATION.dotRadius, radiusLimit * 0.8);
        if (!Number.isFinite(settings.dotRadius) || settings.dotRadius <= 0 || settings.dotRadius >= radiusLimit)
            throw new RangeError('Dots must fit inside their cells without overlap.');
        return settings;
    }
    function scoringParameters(input) {
        var settings = Object.assign({}, SCORING, input);
        if (settings.version !== 1 || ![settings.tolerance, settings.exponent].every(function (n) { return Number.isFinite(n) && n > 0; }))
            throw new RangeError('Invalid quantity scoring version/parameters.');
        return { version: 1, tolerance: settings.tolerance, exponent: settings.exponent };
    }
    function validateAnswer(answer, maximum) { return Number.isInteger(answer) && answer >= 0 && answer <= (maximum === undefined ? GENERATION.poolSize : maximum); }
    function configuration(input) {
        input = input || {};
        var generation = generationParameters(input.generation), initial = input.initialAnswer === undefined ? 15 : input.initialAnswer;
        if (!validateAnswer(initial, generation.poolSize)) throw new RangeError('Invalid initial quantity answer.');
        return { generation: generation, scoring: scoringParameters(input.scoring), initialAnswer: initial };
    }
    function generateQuestion(seed, input) {
        requireSeed(seed); var settings = generationParameters(input), random = randomFromSeed(seed);
        return Object.freeze({ type: 'quantity', version: 1, seed: seed,
            target: settings.minCount + Math.floor(random() * (settings.maxCount - settings.minCount + 1)) });
    }
    function createPool(seed, input) {
        requireSeed(seed);
        var settings = generationParameters(input), columns = Math.ceil(Math.sqrt(settings.poolSize * ASPECT));
        var rows = Math.ceil(settings.poolSize / columns);
        // Keep the original memorization layout as the canonical pool for every phase.
        var random = randomFromSeed((seed ^ 0x51d7348d) >>> 0);
        var cells = [];
        for (var y = 0; y < rows; y++) for (var x = 0; x < columns; x++) cells.push({
            x: (x + 0.5 + (random() * 2 - 1) * settings.jitter) / columns,
            y: (y + 0.5 + (random() * 2 - 1) * settings.jitter) / rows });
        // A jittered cell prevents overlaps; best-candidate ordering spreads even
        // short prefixes without turning the display into fixed rows or a counter.
        var pool = [], distances = cells.map(function () { return Infinity; });
        while (pool.length < settings.poolSize) {
            var best = -1, bestDistance = -1;
            for (var candidate = 0; candidate < Math.min(16, cells.length); candidate++) {
                var index = Math.floor(random() * cells.length);
                if (distances[index] > bestDistance) { best = index; bestDistance = distances[index]; }
            }
            var point = cells.splice(best, 1)[0]; distances.splice(best, 1); pool.push(Object.freeze(point));
            for (var i = 0; i < cells.length; i++) {
                var dx = cells[i].x - point.x, dy = (cells[i].y - point.y) / ASPECT;
                distances[i] = Math.min(distances[i], dx * dx + dy * dy);
            }
        }
        return Object.freeze(pool);
    }
    function visibleDots(pool, count) {
        if (!Array.isArray(pool) || !validateAnswer(count, pool.length)) throw new RangeError('Invalid visible dot count.');
        return pool.slice(0, count);
    }
    function calculateError(target, answer) {
        if (!Number.isInteger(target) || target <= 0 || !Number.isInteger(answer) || answer < 0) throw new RangeError('Quantity counts must be integers; target must be positive.');
        return Math.abs(answer - target) / target;
    }
    function mapErrorToScore(error, input) {
        var settings = scoringParameters(input);
        if (!Number.isFinite(error) || error < 0) throw new RangeError('Quantity error must be finite and nonnegative.');
        return Math.max(0, Math.min(100, 100 * Math.exp(-Math.pow(error / settings.tolerance, settings.exponent))));
    }
    function grade(target, answer, input, maximum) {
        if (!Number.isInteger(target) || target <= 0) throw new RangeError('Target quantity must be positive.');
        var settings = scoringParameters(input);
        if (!validateAnswer(answer, maximum)) return { valid: false, error: null, score: 0 };
        var error = calculateError(target, answer);
        return { valid: true, error: error, score: Math.round(mapErrorToScore(error, settings) * 1000) / 1000 };
    }
    return { version: 1, scoringVersion: 1, aspect: ASPECT, defaults: Object.freeze({ generation: GENERATION, scoring: SCORING, initialAnswer: 15 }),
        generationParameters: generationParameters, scoringParameters: scoringParameters, configuration: configuration,
        generateQuestion: generateQuestion, createPool: createPool, visibleDots: visibleDots, validateAnswer: validateAnswer,
        calculateError: calculateError, mapErrorToScore: mapErrorToScore, grade: grade };
});
