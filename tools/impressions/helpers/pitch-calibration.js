/* Diagnostic comparisons only; all curves call the unchanged production Pitch mapper. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('../../../js/games/impressions/pitch.js'));
    else root.ImpressionsPitchCalibration = factory(root.ImpressionsPitch);
})(typeof window === 'object' ? window : globalThis, function (Pitch) {
    'use strict';
    var TOLERANCES = [180, 210, 240], ERRORS = [0, 25, 50, 75, 100, 150, 180, 210, 240, 300, 450, 600, 1200];
    function scores(error) { return TOLERANCES.map(function (tolerance) { return Math.round(Pitch.mapErrorToScore(error, { version: 1, tolerance: tolerance, exponent: 1.3 }) * 1000) / 1000; }); }
    function table() { return ERRORS.map(function (error) { return { rmsCents: error, scores: scores(error) }; }); }
    function observations(values) {
        var groups = new Map();
        values.filter(function (o) { return o.round.category === 'pitch'; }).forEach(function (o) {
            var key = o.source + ' / ' + o.round.variant;
            if (!groups.has(key)) groups.set(key, { label: key, observations: 0, validErrors: [], scores: [[], [], []], fractions: [], knownTimeouts: [], missing: 0, initialRms: [], unreachable: 0 });
            var g = groups.get(key); g.observations++; if (o.missing) g.missing++;
            if (o.timedOut !== null) g.knownTimeouts.push(o.timedOut);
            if (Number.isFinite(o.answerElapsedMs) && o.round.answerMs > 0) g.fractions.push(o.answerElapsedMs / o.round.answerMs);
            if (!o.missing && Number.isFinite(o.error)) { g.validErrors.push(o.error); scores(o.error).forEach(function (score, i) { g.scores[i].push(score); }); }
            var tones = o.metrics.tones || [], adjustable = tones.filter(function (tone) { return !tone.fixed; }), pitch = o.session.configuration.pitch || {}, generation = o.round.parameters.generation || pitch.generation || {};
            if (adjustable.length && Number.isFinite(pitch.initialHz)) {
                g.initialRms.push(Math.sqrt(adjustable.reduce(function (sum, tone) { var e = Pitch.hzToCents(pitch.initialHz) - Pitch.hzToCents(tone.targetHz); return sum + e * e; }, 0) / adjustable.length));
                g.unreachable += adjustable.filter(function (tone) { return tone.targetHz < generation.minHz || tone.targetHz > generation.maxHz; }).length;
            }
        });
        return Array.from(groups.values());
    }
    return { tolerances: TOLERANCES, scores: scores, table: table, observations: observations };
});
