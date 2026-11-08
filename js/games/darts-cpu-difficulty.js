/* Shared 0-15 CPU scale, legacy anchors, execution profiles and translated labels. */
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.DartsCpuDifficulty = api;
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var TIERS = ['easy', 'normal', 'hard', 'insane'], ROMAN = ['I', 'II', 'III', 'IV'];
    var LEGACY = Object.freeze({ easy: 1, normal: 6, hard: 11, insane: 14 });
    var ANCHORS = [
        { level: 0, velocity: 380, timing: 0.055, shape: 0.12, lapse: 0.13 },
        { level: 1, velocity: 300, timing: 0.045, shape: 0.10, lapse: 0.10 },
        { level: 6, velocity: 100, timing: 0.030, shape: 0.055, lapse: 0.04 },
        { level: 11, velocity: 55, timing: 0.015, shape: 0.025, lapse: 0.015 },
        { level: 14, velocity: 36, timing: 0.008, shape: 0.012, lapse: 0.006 },
        { level: 15, velocity: 30, timing: 0.006, shape: 0.009, lapse: 0.004 }
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
    var profiles = VALUES.map(function (level) {
        var hi = ANCHORS.findIndex(function (a) { return a.level >= level; });
        var a = ANCHORS[Math.max(0, hi - 1)], b = ANCHORS[hi], p = { lapseVelocity: 650 };
        var fraction = a.level === b.level ? 0 : (level - a.level) / (b.level - a.level);
        ['velocity', 'timing', 'shape', 'lapse'].forEach(function (key) {
            p[key] = level === a.level ? a[key] : level === b.level ? b[key] : a[key] * Math.pow(b[key] / a[key], fraction);
        });
        return Object.freeze(p);
    });
    // Blend established tactics only between anchors. Anchors consume no extra RNG,
    // preserving their previous seeded decisions and physical gestures exactly.
    function strategy(value, rng) {
        var n = normalize(value), tiers = Object.keys(LEGACY);
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
        profiles: Object.freeze(profiles) });
});
