/* Shared visual/CLI calibration samples. Scores always come from ImpressionsColor. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('../../js/games/impressions-color.js'));
    else root.ImpressionsScoringFixtures = factory(root.ImpressionsColor);
})(typeof window === 'object' ? window : globalThis, function (Color) {
    'use strict';
    var pairs = [
        ['exact', '完全相同', [48, 146, 198], [48, 146, 198]],
        ['very-close', '非常接近', [48, 146, 198], [50, 147, 199]],
        ['close', '接近原色', [48, 146, 198], [58, 140, 192]],
        ['high-accuracy', '高準確度區間', [48, 146, 198], [70, 130, 185]],
        ['hue-blue', '中等色相差異 · 藍', [48, 146, 198], [100, 110, 210]],
        ['hue-green', '中等色相差異 · 綠', [90, 180, 110], [160, 160, 85]],
        ['brightness-light', '中等亮度差異 · 偏亮', [48, 146, 198], [70, 185, 240]],
        ['brightness-dark', '中等亮度差異 · 偏暗', [48, 146, 198], [35, 110, 155]],
        ['brightness-gray', '中等亮度差異 · 灰階', [128, 128, 128], [165, 165, 165]],
        ['saturation-blue', '飽和度差異 · 藍', [48, 146, 198], [120, 140, 150]],
        ['saturation-red', '飽和度差異 · 紅', [198, 90, 66], [135, 120, 115]],
        ['inaccurate', '明顯不準確 · 藍變綠', [48, 146, 198], [48, 180, 160]],
        ['very-inaccurate', '明顯不準確 · 橘變紫', [198, 90, 66], [160, 100, 170]],
        ['wrong-hue', '大幅色相差異', [48, 146, 198], [220, 90, 70]],
        ['extreme', '極端差異 · 黑與白', [0, 0, 0], [255, 255, 255]],
    ].map(function (row) {
        return Object.freeze({ id: row[0], label: row[1], target: Object.freeze(row[2]), answer: Object.freeze(row[3]) });
    });
    function compare(parameters) {
        var settings = Color.scoringParameters(Object.assign({ version: 2 }, parameters));
        return pairs.map(function (pair) {
            return { pair: pair, old: Color.grade(pair.target, pair.answer, { version: 1 }),
                proposed: Color.grade(pair.target, pair.answer, settings) };
        });
    }
    return Object.freeze({ pairs: Object.freeze(pairs), compare: compare });
});
