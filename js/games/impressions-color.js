/* Color question v1 / default scoring v4, with frozen v1/v2/v3 compatibility. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ImpressionsColor = factory();
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var GENERATION = Object.freeze({ channelMin: 24, channelMax: 240,
        minLightness: 0.4, maxLightness: 0.85, minChroma: 0.06, maxChroma: 0.28, maxAttempts: 256 });
    var LEGACY_SCORING = Object.freeze({ version: 1, tolerance: 0.20, exponent: 1.4 });
    var V2_SCORING = Object.freeze({ version: 2, tolerance: 0.20, exponent: 1.4, knee: 0.06, width: 0.05, strength: 1.2 });
    var V3_SCORING = Object.freeze({ version: 3, tolerance: 0.20, exponent: 1.4,
        knee: 0.06, width: 0.08, strength: 0.5, penaltyExponent: 1.5 });
    var V4_SCORING = Object.freeze({ version: 4, tolerance: 0.20, exponent: 1.4,
        knee: 0.08, width: 0.10, strength: 0.35, penaltyExponent: 1.5 });
    var SCORING = V4_SCORING;
    var SCORE_SCALE = 1000;
    // W3C CSS Color 4, "Sample code for Color Conversions": sRGB -> XYZ D65 -> Oklab.
    // https://www.w3.org/TR/css-color-4/#color-conversion-code
    var RGB_TO_XYZ = [[506752 / 1228815, 87881 / 245763, 12673 / 70218],
        [87098 / 409605, 175762 / 245763, 12673 / 175545],
        [7918 / 409605, 87881 / 737289, 1001167 / 1053270]];
    var XYZ_TO_LMS = [[0.8190224379967030, 0.3619062600528904, -0.1288737815209879],
        [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
        [0.0481771893596242, 0.2642395317527308, 0.6335478284694309]];
    var LMS_TO_LAB = [[0.2104542683093140, 0.7936177747023054, -0.0040720430116193],
        [1.9779985324311684, -2.4285922420485799, 0.4505937096174110],
        [0.0259040424655478, 0.7827717124575296, -0.8086757549230774]];

    function validateAnswer(rgb) {
        return Array.isArray(rgb) && rgb.length === 3 && [0, 1, 2].every(function (i) {
            return Number.isInteger(rgb[i]) && rgb[i] >= 0 && rgb[i] <= 255;
        });
    }
    function requireRgb(rgb) {
        if (!validateAnswer(rgb)) throw new TypeError('RGB must contain three integers from 0 to 255.');
    }
    function multiply(matrix, vector) {
        return matrix.map(function (row) { return row.reduce(function (sum, value, i) { return sum + value * vector[i]; }, 0); });
    }
    // Inverses of the exact W3C matrices used in ImpressionsColor v1, retaining enough
    // precision for sRGB boundary round trips. No production conversion is replaced.
    // https://www.w3.org/TR/css-color-4/#color-conversion-code
    var LAB_TO_LMS = [[1.0000000000000002, 0.39633777737617504, 0.21580375730991364],
        [1, -0.10556134581565856, -0.06385417282581334],
        [1, -0.08948417752981182, -1.2914855480194094]];
    var LMS_TO_XYZ = [[1.226879875845924, -0.557814994460217, 0.2813910456659646],
        [-0.040575745214800875, 1.1122868032803173, -0.07171105806551642],
        [-0.07637293667466001, -0.4214933324022431, 1.5869240198367816]];
    var XYZ_TO_RGB = [[3.240969941904521, -1.537383177570093, -0.4986107602930031],
        [-0.9692436362808795, 1.8759675015077204, 0.04155505740717561],
        [0.05563007969699361, -0.20397695888897655, 1.0569715142428784]];
    var GAMUT_EPSILON = 1e-12;
    function inverseMultiply(matrix, vector) {
        return matrix.map(function (row) { return row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]; });
    }
    function labToRgb(lab) {
        if (!Array.isArray(lab) || lab.length !== 3 || ![0, 1, 2].every(function (i) { return Number.isFinite(lab[i]); }))
            throw new TypeError('Oklab must contain three finite coordinates.');
        var lms = inverseMultiply(LAB_TO_LMS, lab).map(function (n) { return n * n * n; });
        var linear = inverseMultiply(XYZ_TO_RGB, inverseMultiply(LMS_TO_XYZ, lms));
        if (linear.some(function (n) { return !Number.isFinite(n) || n < -GAMUT_EPSILON || n > 1 + GAMUT_EPSILON; })) return null;
        // No gamut mapping or channel clipping. The epsilon admits only floating
        // point round-off at 0/1; rounding valid channels supplies the game's RGB8.
        return linear.map(function (n) {
            var channel = Math.round(255 * (n <= 0.0031308 ? 12.92 * n : 1.055 * Math.pow(n, 1 / 2.4) - 0.055));
            return channel === 0 ? 0 : channel; // Normalize a floating-point -0.
        });
    }
    function srgbToOklab(rgb) {
        requireRgb(rgb);
        var linear = rgb.map(function (channel) {
            var value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
        });
        var lms = multiply(XYZ_TO_LMS, multiply(RGB_TO_XYZ, linear));
        return multiply(LMS_TO_LAB, lms.map(Math.cbrt));
    }
    function calculateColorError(target, answer) {
        var a = srgbToOklab(target), b = srgbToOklab(answer);
        return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }
    function scoringParameters(parameters) {
        var version = parameters && parameters.version !== undefined ? parameters.version : SCORING.version;
        if (!supportsScoringVersion(version)) throw new RangeError('Unsupported color scoring version.');
        var settings = Object.assign({}, version === 1 ? LEGACY_SCORING : version === 2 ? V2_SCORING : version === 3 ? V3_SCORING : V4_SCORING, parameters);
        if (![settings.tolerance, settings.exponent].every(function (n) { return Number.isFinite(n) && n > 0; }))
            throw new RangeError('Scoring tolerance and exponent must be finite and positive.');
        if (version === 1) return { version: version, tolerance: settings.tolerance, exponent: settings.exponent };
        if (!Number.isFinite(settings.knee) || settings.knee < 0 || !Number.isFinite(settings.width) || settings.width <= 0
            || !Number.isFinite(settings.strength) || settings.strength < 0)
            throw new RangeError('Penalty knee/strength must be finite and nonnegative; width must be finite and positive.');
        var result = { version: version, tolerance: settings.tolerance, exponent: settings.exponent,
            knee: settings.knee, width: settings.width, strength: settings.strength };
        if (version === 3 || version === 4) {
            if (!Number.isFinite(settings.penaltyExponent) || settings.penaltyExponent <= 0)
                throw new RangeError('Penalty exponent must be finite and positive.');
            result.penaltyExponent = settings.penaltyExponent;
        }
        return result;
    }
    function supportsScoringVersion(version) { return version === 1 || version === 2 || version === 3 || version === 4; }
    function mapColorErrorToScore(error, parameters) {
        var settings = scoringParameters(parameters);
        if (!Number.isFinite(error) || error < 0) throw new RangeError('Color error must be finite and nonnegative.');
        if (error === 0) return 100;
        var score = 100 * Math.exp(-Math.pow(error / settings.tolerance, settings.exponent));
        // Preserve the original curve exactly up to the knee. A zero strength is
        // also the original curve, including when the normalized excess overflows.
        if (settings.version === 2 && settings.strength > 0 && error > settings.knee) {
            var excess = (error - settings.knee) / settings.width;
            score *= Math.exp(-settings.strength * excess * excess);
        } else if ((settings.version === 3 || settings.version === 4) && settings.strength > 0 && error > settings.knee) {
            var candidateExcess = (error - settings.knee) / settings.width;
            score *= Math.exp(-settings.strength * Math.pow(candidateExcess, settings.penaltyExponent));
        }
        return Math.max(0, Math.min(100, score));
    }
    function grade(target, answer, parameters) {
        requireRgb(target);
        var settings = scoringParameters(parameters);
        if (!validateAnswer(answer)) return { valid: false, error: null, score: 0 };
        var error = calculateColorError(target, answer);
        return { valid: true, error: error, score: Math.round(mapColorErrorToScore(error, settings) * SCORE_SCALE) / SCORE_SCALE };
    }
    function generationParameters(parameters) {
        var settings = Object.assign({}, GENERATION, parameters);
        if (![settings.channelMin, settings.channelMax].every(function (n) { return Number.isInteger(n) && n >= 0 && n <= 255; })
            || settings.channelMin > settings.channelMax
            || ![settings.minLightness, settings.maxLightness, settings.minChroma, settings.maxChroma]
                .every(function (n) { return Number.isFinite(n) && n >= 0 && n <= 1; })
            || settings.minLightness > settings.maxLightness || settings.minChroma > settings.maxChroma
            || !Number.isInteger(settings.maxAttempts) || settings.maxAttempts < 1 || settings.maxAttempts > 4096)
            throw new RangeError('Invalid color generation parameters.');
        return settings;
    }
    // Isolated Mulberry32 stream: rendering never consumes question randomness.
    function randomFromSeed(seed) {
        var state = seed >>> 0;
        return function () {
            state = (state + 0x6d2b79f5) | 0;
            var value = Math.imul(state ^ (state >>> 15), 1 | state);
            value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }
    function generateQuestion(seed, parameters) {
        if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Seed must be a uint32.');
        var settings = generationParameters(parameters), random = randomFromSeed(seed);
        for (var attempt = 0; attempt < settings.maxAttempts; attempt++) {
            var rgb = [0, 1, 2].map(function () {
                return settings.channelMin + Math.floor(random() * (settings.channelMax - settings.channelMin + 1));
            });
            var lab = srgbToOklab(rgb), chroma = Math.hypot(lab[1], lab[2]);
            if (lab[0] >= settings.minLightness && lab[0] <= settings.maxLightness
                && chroma >= settings.minChroma && chroma <= settings.maxChroma)
                return Object.freeze({ type: 'color', version: 1, seed: seed, target: Object.freeze(rgb) });
        }
        // An impossible configuration must not silently produce an out-of-range target.
        throw new RangeError('No color satisfied the configured bounds within maxAttempts.');
    }
    return { version: 1, scoringVersion: SCORING.version, supportsScoringVersion: supportsScoringVersion,
        SCORE_SCALE: SCORE_SCALE, defaults: Object.freeze({ generation: GENERATION, scoring: SCORING }),
        validateAnswer: validateAnswer, generationParameters: generationParameters, scoringParameters: scoringParameters,
        oklabToSrgb: labToRgb, gamutEpsilon: GAMUT_EPSILON, srgbToOklab: srgbToOklab, calculateColorError: calculateColorError,
        mapColorErrorToScore: mapColorErrorToScore, grade: grade, generateQuestion: generateQuestion };
});
