/* Load the actual private browser physics without starting the UI. No duplicated equations. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
module.exports = function loadPhysics() {
    const rules = require('../../js/games/darts-rules.js');
    const sandbox = {
        window: {
            DartsRules: rules,
            DartsFeedback: require('../../js/games/darts-feedback.js'),
            DartsCpuGesture: require('../../js/games/darts-cpu-gesture.js'),
            ArcadeCommon: { i18n: { STRINGS: { en: {}, zh: {} }, t: key => key },
                math: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } }
        },
        document: { readyState: 'loading', addEventListener() {},
            getElementById: id => id === 'stage' ? { getContext: () => ({}) } : null }
    };
    const source = fs.readFileSync(path.join(__dirname, '../../js/games/darts.js'), 'utf8');
    if (!/\}\)\(\);\s*$/.test(source)) throw new Error('Cannot export Darts private physics');
    vm.runInNewContext(source.replace(/\}\)\(\);\s*$/,
        'window.physics = { analyseGesture, computeThrow, computeImpact, dartPosAt, scoreAt, TUNING };})();'), sandbox);
    return sandbox.window.physics;
};
