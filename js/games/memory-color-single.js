/* New single-color questions: canonical RGB8 answers, shared by RGB/HSL controls. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./memory-color.js'), require('./memory-color-variants.js'));
    else root.MemoryColorSingle = factory(root.MemoryColor, root.MemoryColorVariants);
})(typeof window === 'object' ? window : globalThis, function (Color, Legacy) {
    'use strict';
    var WEIGHTS = Object.freeze({ single: 1, hue2: 0, hue3: 0, hue4: 0 });
    function legacy(input) { return Object.assign({}, input, { version: 1, variantSelectionVersion: 1, weights: { easy: WEIGHTS, hard: WEIGHTS } }); }
    function configuration(input) { if (input && input.version !== undefined && ![1, 2].includes(input.version)) throw new RangeError('Unsupported single Color configuration.'); return Object.assign(Legacy.configuration(legacy(input)), { version: 2, variantSelectionVersion: 2 }); }
    function prepare(seed, base, state, previous) {
        var result = Legacy.prepare(seed, Object.assign({}, base, { color: legacy(base.color) }), state, previous);
        result.metadata.parameters.color = { version: 2 };
        return result;
    }
    function generateQuestion(seed, input, scoringVersion) {
        var q = Legacy.generateQuestion(seed, 'single', legacy(input), undefined, scoringVersion);
        return Object.freeze(Object.assign({}, q, { version: 3, variantVersion: 2, answerSchema: 'rgb8-v1' }));
    }
    function supported(q, input, scoring) {
        return !!q && q.type === 'color' && q.version === 3 && q.variant === 'single' && q.variantVersion === 2 && q.answerSchema === 'rgb8-v1'
            && !!input && input.variantSelectionVersion === 2 && input.version === 2 && !!scoring && q.scoringVersion === scoring.version
            && Color.supportsScoringVersion(q.scoringVersion) && Color.validateAnswer(q.target) && Legacy.validHsl(q.targetHsl)
            && Legacy.hslToRgb(q.targetHsl).every(function (v, i) { return v === q.target[i]; });
    }
    function initialAnswer(input) { return Legacy.hslToRgb(configuration(input).initialHsl); }
    function equalAnswer(a, b) { return Color.validateAnswer(a) && Color.validateAnswer(b) && a.every(function (v, i) { return v === b[i]; }); }
    return { configuration: configuration, prepare: prepare, generateQuestion: generateQuestion, supported: supported,
        initialAnswer: initialAnswer, validateAnswer: Color.validateAnswer, equalAnswer: equalAnswer,
        grade: function (q, answer, scoring) { return Color.grade(q.target, answer, scoring); } };
});
