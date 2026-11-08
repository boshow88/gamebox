/* Shared 0-15 CPU scale, legacy names, difficulty curve and translated labels. */
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.DartsCpuDifficulty = api;
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var TIERS = ['easy', 'normal', 'hard', 'insane'], ROMAN = ['I', 'II', 'III', 'IV'];
    var LEGACY = Object.freeze({ easy: 1, normal: 6, hard: 11, insane: 14 });
    var CURVE_POWER = 1.8;
    var ORDINARY_ERROR_SCALE = 0.97;
    var LAPSE_SPREAD_MULTIPLIER = 2.5;
    var ANCHORS = [
        { level: 0, velocity: 380, timing: 0.055, shape: 0.12, lapse: 0.13 },
        { level: 1, velocity: 330, timing: 0.048, shape: 0.105, lapse: 0.10 },
        { level: 6, velocity: 130, timing: 0.035, shape: 0.065, lapse: 0.04 },
        { level: 11, velocity: 75, timing: 0.020, shape: 0.035, lapse: 0.015 },
        { level: 14, velocity: 52, timing: 0.011, shape: 0.018, lapse: 0.006 },
        { level: 15, velocity: 45, timing: 0.009, shape: 0.015, lapse: 0.004 }
    ];
    var VALUES = Object.freeze(Array.from({ length: 16 }, function (_, i) { return i; }));
    function valid(value) {
        return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 16 ||
            typeof value === 'string' && (Object.hasOwn(LEGACY, value) || /^(?:[0-9]|1[0-5])$/.test(value));
    }
    function normalize(value) {
        if (!valid(value)) return LEGACY.normal;
        return Object.hasOwn(LEGACY, value) ? LEGACY[value] : Number(value);
    }
    function label(value, t) {
        var n = normalize(value), tier = TIERS[Math.floor(n / 4)];
        return t('dartsCpuLevel', t('dartsCpu' + tier[0].toUpperCase() + tier.slice(1)), ROMAN[n % 4]);
    }
    function strength(value) {
        var n = normalize(value);
        // Compress intermediate levels toward the easier part of the reference
        // scale for both subsystems. The profile range is tuned independently.
        return n === 0 || n === 15 ? n : 15 * Math.pow(n / 15, CURVE_POWER);
    }
    var profiles = VALUES.map(function (level) {
        level = strength(level);
        var hi = ANCHORS.findIndex(function (a) { return a.level >= level; });
        var a = ANCHORS[Math.max(0, hi - 1)], b = ANCHORS[hi], p = {};
        var fraction = a.level === b.level ? 0 : (level - a.level) / (b.level - a.level);
        ['velocity', 'timing', 'shape', 'lapse'].forEach(function (key) {
            p[key] = level === a.level ? a[key] : level === b.level ? b[key] : a[key] * Math.pow(b[key] / a[key], fraction);
        });
        // Slightly sharpen ordinary execution, ramping smoothly away from the
        // unchanged weakest profile. Lapse frequency and target policies stay fixed.
        var scale = Math.pow(ORDINARY_ERROR_SCALE, Math.min(1, level));
        ['velocity', 'timing', 'shape'].forEach(function (key) { p[key] *= scale; });
        // A lapse is a broader version of this player's normal execution error.
        // Strong CPUs no longer jump to the same 650 px/s spread as beginners.
        p.lapseVelocity = Math.min(650, p.velocity * LAPSE_SPREAD_MULTIPLIER);
        return Object.freeze(p);
    });
    // Blend established tactics at the same curved strength as execution error.
    // Endpoints consume no extra RNG and retain their previous target decisions.
    function strategy(value, rng) {
        var n = strength(value), tiers = Object.keys(LEGACY);
        if (n <= LEGACY.easy) return 'easy';
        for (var i = 1; i < tiers.length; i++) {
            var lo = LEGACY[tiers[i - 1]], hi = LEGACY[tiers[i]];
            if (n === hi) return tiers[i];
            if (n < hi) return rng() < (n - lo) / (hi - lo) ? tiers[i] : tiers[i - 1];
        }
        return 'insane';
    }
    return Object.freeze({ values: VALUES, legacy: LEGACY, defaultLevel: LEGACY.normal,
        valid: valid, normalize: normalize, label: label, strategy: strategy,
        strength: strength, curvePower: CURVE_POWER,
        ordinaryErrorScale: ORDINARY_ERROR_SCALE,
        lapseSpreadMultiplier: LAPSE_SPREAD_MULTIPLIER,
        profiles: Object.freeze(profiles) });
});
