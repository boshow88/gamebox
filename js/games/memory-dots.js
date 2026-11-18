/* Prefix-only SVG presentation. No randomness, timers, scoring or network. */
(function () {
    'use strict';
    window.MemoryDots = { create: function (host) {
        var doc = host.ownerDocument, ns = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(ns, 'svg'), pool = [], radius = 0.009;
        svg.setAttribute('viewBox', '0 0 400 300'); svg.setAttribute('role', 'img'); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        host.append(svg);
        function clear() { svg.replaceChildren(); pool = []; }
        return { setPool: function (next, nextRadius, label) {
            if (pool !== next || radius !== nextRadius) { svg.replaceChildren(); pool = next; radius = nextRadius; }
            svg.setAttribute('aria-label', label);
        }, setCount: function (count) {
            if (!Number.isInteger(count) || count < 0 || count > pool.length) throw new RangeError('Invalid rendered count.');
            while (svg.children.length > count) svg.lastElementChild.remove();
            while (svg.children.length < count) {
                var p = pool[svg.children.length], circle = doc.createElementNS(ns, 'circle');
                circle.setAttribute('cx', String(p.x * 400)); circle.setAttribute('cy', String(p.y * 300)); circle.setAttribute('r', String(radius * 400)); svg.append(circle);
            }
        }, clear: clear, count: function () { return svg.children.length; }, element: svg };
    } };
})();
