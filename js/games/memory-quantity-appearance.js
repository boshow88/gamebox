/* Versioned presentation only. Pools, counts, scoring and ordering are unchanged. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MemoryQuantityAppearance = factory();
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var COLORS = Object.freeze({ circle: '#56b4e9', square: '#e69f00', triangle: '#cc79a7' });
    var CURRENT_COLORS=Object.freeze({circle:COLORS.circle,square:COLORS.square,triangle:'#55c477'});
    function version(q) { return q && q.renderingVersion === 3 ? 3 : q && q.renderingVersion >= 2 ? 2 : 1; }
    function group(g, v) { return v >= 2 ? Object.assign({}, g, { color: (v===3?CURRENT_COLORS:COLORS)[g.id] }) : g; }
    function radius(generation, groupCount) {
        var capacity = generation.poolSize * groupCount, columns = Math.ceil(Math.sqrt(capacity * 4 / 3)), rows = Math.ceil(capacity / columns);
        // Same full-pool cell bound as the generator, with the largest new shape
        // radius (triangle: 1.4r). Independent of hidden target/answer counts.
        var gap = Math.min((1 - 2 * generation.jitter) / columns, (1 - 2 * generation.jitter) / rows * 3 / 4);
        return Math.min(generation.dotRadius, gap / (2 * 1.4) * 0.98);
    }
    function shape(g, point, baseRadius) {
        var x = point.x * 400, y = point.y * 300, r = baseRadius * 400;
        if (g.shape === 'circle') return { tag: 'circle', attributes: { cx: x, cy: y, r: 0.9 * r } };
        if (g.shape === 'square') return { tag: 'rect', attributes: { x: x - 0.8 * r, y: y - 0.8 * r, width: 1.6 * r, height: 1.6 * r } };
        var t = 1.4 * r;
        return { tag: 'polygon', attributes: { points: x + ',' + (y - t) + ' ' + (x + Math.sqrt(3) * t / 2) + ',' + (y + t / 2) + ' ' + (x - Math.sqrt(3) * t / 2) + ',' + (y + t / 2) } };
    }
    return { version: version, group: group, radius: radius, shape: shape, colors: COLORS, currentColors:CURRENT_COLORS,
        relativeAreas: Object.freeze({ circle: Math.PI * 0.9 ** 2, square: 1.6 ** 2, triangle: 3 * Math.sqrt(3) / 4 * 1.4 ** 2 }) };
});
