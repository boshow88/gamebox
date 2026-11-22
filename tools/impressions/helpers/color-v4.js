/* Diagnostic comparisons over the production V4 configuration and evaluator. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('../../../js/games/impressions/color.js'), require('../../../js/games/impressions/rules.js'));
    else root.ImpressionsColorV4 = factory(root.ImpressionsColor, root.ImpressionsRules);
})(typeof window === 'object' ? window : globalThis, function (Color, Rules) {
    'use strict';
    var DEFAULTS = Object.freeze(Color.scoringParameters({ version: 4 }));
    function parameters(input) { return Color.scoringParameters(Object.assign({}, input, { version: 4 })); }
    function compare(target, answers, multiplier, curves) {
        return Object.keys(curves).map(function (name) {
            var grades = answers.map(function (answer) { return Color.grade(target, answer, curves[name]); });
            var best = Math.max.apply(null, grades.map(function (g) { return g.score; }));
            return { curve: name, rows: grades.map(function (grade, i) {
                return { player: i + 1, rgb: answers[i].slice(), error: grade.error, score: grade.score,
                    gap: Math.round((best - grade.score) * 1000) / 1000, damage: Rules.calculateDamage(grade.score, best, multiplier) };
            }) };
        });
    }
    return { defaults: DEFAULTS, parameters: parameters, compare: compare };
});
