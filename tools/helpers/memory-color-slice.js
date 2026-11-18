/* Diagnostic geometry only. Forward conversion and all scoring use MemoryColor. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('../../js/games/memory-color.js'));
    else root.MemoryColorSlice = factory(root.MemoryColor);
})(typeof window === 'object' ? window : globalThis, function (Color) {
    'use strict';
    var SCORES = Object.freeze([95, 90, 80, 70, 50, 30, 10]);
    var PLANES = Object.freeze({ ab: Object.freeze([1, 2]), aL: Object.freeze([1, 0]), bL: Object.freeze([2, 0]) });
    var GAMUT_EPSILON = Color.gamutEpsilon;
    function labToRgb(lab) { return Color.oklabToSrgb(lab); }
    function parseTarget(value) {
        var text = String(value).trim(), hex = text.match(/^#?([\da-f]{6}|[\da-f]{3})$/i);
        if (hex) {
            var digits = hex[1]; if (digits.length === 3) digits = digits.split('').map(function (d) { return d + d; }).join('');
            return [0, 2, 4].map(function (i) { return parseInt(digits.slice(i, i + 2), 16); });
        }
        if (/^rgb\(.*\)$/i.test(text)) text = text.slice(4, -1).trim();
        if (!/^\d{1,3}(?:\s*,\s*|\s+)\d{1,3}(?:\s*,\s*|\s+)\d{1,3}$/.test(text)) throw new RangeError('Enter #RRGGBB or three RGB integers from 0 to 255.');
        var rgb = text.split(/[\s,]+/).map(Number);
        if (!Color.validateAnswer(rgb)) throw new RangeError('RGB channels must be integers from 0 to 255.');
        return rgb;
    }
    function planeLab(anchor, plane, dx, dy) {
        if (!PLANES[plane] || !Number.isFinite(dx) || !Number.isFinite(dy)) throw new RangeError('Invalid slice coordinates.');
        var lab = anchor.slice(); lab[PLANES[plane][0]] += dx; lab[PLANES[plane][1]] += dy; return lab;
    }
    function distanceForScore(score, parameters) {
        if (!Number.isFinite(score) || score <= 0 || score > 100) throw new RangeError('Contour score must be in (0,100].');
        var settings = Color.scoringParameters(parameters);
        if (score === 100) return 0;
        var low = 0, high = 1;
        while (Color.mapColorErrorToScore(high, settings) > score) {
            high *= 2; if (!Number.isFinite(high)) throw new RangeError('Contour radius exceeds the numeric range.');
        }
        for (var i = 0; i < 80; i++) {
            var middle = low + (high - low) / 2;
            if (Color.mapColorErrorToScore(middle, settings) > score) low = middle; else high = middle;
        }
        return low + (high - low) / 2;
    }
    function contours(parameters) { return SCORES.map(function (score) { return { score: score, radius: distanceForScore(score, parameters) }; }); }
    function inspect(target, plane, dx, dy, original, experimental, candidate) {
        var lab = planeLab(Color.srgbToOklab(target), plane, dx, dy), rgb = labToRgb(lab);
        return { target: target.slice(), rgb: rgb, lab: lab, idealError: Math.hypot(dx, dy),
            original: rgb ? Color.grade(target, rgb, original || { version: 1 }) : null,
            experimental: rgb ? Color.grade(target, rgb, experimental || { version: 2 }) : null,
            candidate: rgb ? Color.grade(target, rgb, candidate || { version: 3 }) : null };
    }
    function samplesAtScores(target, plane, parameters, levels) {
        var settings = Color.scoringParameters(parameters), anchor = Color.srgbToOklab(target);
        return (levels || [90, 70, 50, 30, 10]).map(function (level) {
            var radius = distanceForScore(level, settings), best = null;
            // Deterministic angular search on the requested ideal circle. Do not
            // substitute a clipped RGB when a level is unavailable in this slice.
            for (var i = 0; i < 180; i++) {
                var angle = (level + i * 2) * Math.PI / 180, dx = radius * Math.cos(angle), dy = radius * Math.sin(angle);
                var rgb = labToRgb(planeLab(anchor, plane, dx, dy)); if (!rgb) continue;
                var grade = Color.grade(target, rgb, settings), difference = Math.abs(grade.score - level);
                if (!best || difference < best.difference) best = { level: level, radius: radius, rgb: rgb,
                    grade: grade, difference: difference, dx: dx, dy: dy };
            }
            return best || { level: level, radius: radius, rgb: null, grade: null };
        });
    }
    return Object.freeze({ scores: SCORES, planes: PLANES, gamutEpsilon: GAMUT_EPSILON,
        labToRgb: labToRgb, parseTarget: parseTarget, planeLab: planeLab,
        distanceForScore: distanceForScore, contours: contours, inspect: inspect, samplesAtScores: samplesAtScores });
});
