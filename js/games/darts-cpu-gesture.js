/* CPU intent -> synthetic logical pointer samples. Human analysis and physics stay authoritative. */
(function (root, factory) {
    'use strict';
    var api = factory(typeof module === 'object' && module.exports ? require('./darts-cpu-difficulty.js') : root.DartsCpuDifficulty);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.DartsCpuGesture = api;
})(typeof window === 'object' ? window : globalThis, function (Difficulty) {
    'use strict';
    // Velocity is raw logical px/s; timing is relative duration deviation and shape
    // changes the acceleration exponent. Rare lapses have broad execution error.
    // Ordinary 25/50 scoring calibration is reproducible in darts-cpu-physics-check.js.
    var PROFILES = Object.assign({}, Difficulty.profiles);
    Object.keys(Difficulty.legacy).forEach(function (key) { PROFILES[key] = PROFILES[Difficulty.legacy[key]]; });
    Object.freeze(PROFILES);
    function seeded(seed) {
        var value = typeof seed === 'string' ? Array.from(seed).reduce(function (h, c) {
            return Math.imul(h ^ c.charCodeAt(0), 16777619);
        }, 2166136261) >>> 0 : Number(seed) >>> 0;
        return function () {
            value = (value + 0x6D2B79F5) >>> 0;
            var t = value;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    function gaussian(rng) {
        return Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());
    }
    function samples(vx, vy, duration, power) {
        var out = [], count = 16;
        for (var i = 0; i <= count; i++) {
            var u = i / count, distance = duration * Math.pow(u, power) / power;
            out.push({ t: u * duration, x: vx * distance, y: vy * distance });
        }
        return out;
    }
    function create(physics) {
        ['analyseGesture', 'computeThrow', 'computeImpact'].forEach(function (name) {
            if (!physics || typeof physics[name] !== 'function') throw new Error('Missing CPU physics callback: ' + name);
        });
        var cache = new Map(), evaluations = 0;
        function evaluate(vx, vy) {
            var path = samples(vx, vy, 0.22, 1.20), analysis = physics.analyseGesture(path);
            var launch = physics.computeThrow(analysis), impact = physics.computeImpact(launch);
            evaluations++;
            return { samples: path, analysis: analysis, launch: launch, impact: impact };
        }
        function ideal(target) {
            if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) throw new Error('Invalid CPU target');
            var key = target.x.toFixed(4) + ':' + target.y.toFixed(4), cached = cache.get(key);
            if (!cached) {
                var vx = target.x * 4, vy = 1600 + target.y * 4, iterations = 0, start = evaluations, result;
                for (; iterations < 10; iterations++) {
                    result = evaluate(vx, vy);
                    var ex = target.x - result.impact.x, ey = target.y - result.impact.y;
                    if (Math.hypot(ex, ey) < 0.0001 && result.analysis.valid) break;
                    var dx = evaluate(vx + 5, vy), dy = evaluate(vx, vy + 5);
                    var a = (dx.impact.x - result.impact.x) / 5, b = (dy.impact.x - result.impact.x) / 5;
                    var c = (dx.impact.y - result.impact.y) / 5, d = (dy.impact.y - result.impact.y) / 5;
                    var determinant = a * d - b * c;
                    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) break;
                    vx += Math.max(-800, Math.min(800, (ex * d - b * ey) / determinant));
                    vy += Math.max(-800, Math.min(800, (a * ey - ex * c) / determinant));
                }
                result = evaluate(vx, vy);
                var error = Math.hypot(target.x - result.impact.x, target.y - result.impact.y);
                if (!result.analysis.valid || !Number.isFinite(error) || error > 0.05) {
                    throw new Error('CPU gesture target is unreachable: ' + key + ' (' + error + ' mm)');
                }
                cached = { vx: vx, vy: vy, iterations: iterations, evaluations: evaluations - start, error: error };
                cache.set(key, cached);
            }
            return { samples: samples(cached.vx, cached.vy, 0.22, 1.20), target: Object.assign({}, target),
                diagnostics: Object.assign({}, cached) };
        }
        function generate(target, difficulty, rng) {
            difficulty = Difficulty.normalize(difficulty);
            rng = rng || Math.random;
            var calibration = ideal(target), p = PROFILES[difficulty], lapse = rng() < p.lapse;
            var spread = lapse ? p.lapseVelocity : p.velocity;
            var vx = calibration.diagnostics.vx + gaussian(rng) * spread;
            var vy = calibration.diagnostics.vy + gaussian(rng) * spread;
            var duration = 0.22 * Math.max(0.65, Math.min(1.35, 1 + gaussian(rng) * p.timing));
            var power = Math.max(0.65, 1.20 + gaussian(rng) * p.shape);
            // This is input generation only. No evaluation, retries or post-impact corrections occur here.
            return { samples: samples(vx, vy, duration, power), target: Object.assign({}, target), difficulty: difficulty,
                diagnostics: { vx: vx, vy: vy, duration: duration, power: power, lapse: lapse,
                    calibration: calibration.diagnostics } };
        }
        return { ideal: ideal, generate: generate, clearCache: function () { cache.clear(); },
            stats: function () { return { targets: cache.size, evaluations: evaluations }; } };
    }
    return { create: create, seeded: seeded, profiles: PROFILES };
});
