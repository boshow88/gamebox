/**
 * Unshackle geometry and continuous straight-pull tests.
 * No renderer or DOM dependency. Each tube is a chain of capsules; sweeping
 * a capsule's centre segment produces a parallelogram, tested as two triangles.
 * This tests the entire pull, rather than sampling frames or storing an order.
 */
(function (global) {
    'use strict';

    const add = (a, b) => a.map((v, i) => v + b[i]);
    const sub = (a, b) => a.map((v, i) => v - b[i]);
    const mul = (a, n) => a.map(v => v * n);
    const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
    const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    const unit = a => mul(a, 1 / (Math.hypot(...a) || 1));
    const clamp = n => Math.max(0, Math.min(1, n));
    const EPS = 1e-10;
    const RADIUS = 0.105;

    function segmentDistance2(p, q, a, b) {
        const d1 = sub(q, p), d2 = sub(b, a), r = sub(p, a);
        const aa = dot(d1, d1), ee = dot(d2, d2), f = dot(d2, r);
        let s = 0, t = 0;
        if (aa <= EPS && ee <= EPS) return dot(r, r);
        if (aa <= EPS) t = clamp(f / ee);
        else {
            const c = dot(d1, r);
            if (ee <= EPS) s = clamp(-c / aa);
            else {
                const bb = dot(d1, d2), denom = aa * ee - bb * bb;
                if (denom > EPS) s = clamp((bb * f - c * ee) / denom);
                t = (bb * s + f) / ee;
                if (t < 0) { t = 0; s = clamp(-c / aa); }
                else if (t > 1) { t = 1; s = clamp((bb - c) / aa); }
            }
        }
        const delta = sub(add(p, mul(d1, s)), add(a, mul(d2, t)));
        return dot(delta, delta);
    }

    function insideTriangle(p, a, b, c) {
        const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
        const aa = dot(ab, ab), bb = dot(ab, ac), cc = dot(ac, ac);
        const d = aa * cc - bb * bb;
        if (d <= EPS) return false;
        const u = (cc * dot(ap, ab) - bb * dot(ap, ac)) / d;
        const v = (aa * dot(ap, ac) - bb * dot(ap, ab)) / d;
        return u >= -EPS && v >= -EPS && u + v <= 1 + EPS;
    }

    function pointTriangleDistance2(p, a, b, c) {
        const normal = cross(sub(b, a), sub(c, a)), nn = dot(normal, normal);
        if (nn > EPS) {
            const d = dot(sub(p, a), normal) / nn;
            if (insideTriangle(sub(p, mul(normal, d)), a, b, c)) return d * d * nn;
        }
        return Math.min(segmentDistance2(p, p, a, b), segmentDistance2(p, p, b, c), segmentDistance2(p, p, c, a));
    }

    function segmentTriangleDistance2(p, q, a, b, c) {
        const normal = cross(sub(b, a), sub(c, a));
        const denom = dot(sub(q, p), normal);
        if (Math.abs(denom) > EPS) {
            const t = dot(sub(a, p), normal) / denom;
            if (t >= 0 && t <= 1 && insideTriangle(add(p, mul(sub(q, p), t)), a, b, c)) return 0;
        }
        return Math.min(pointTriangleDistance2(p, a, b, c), pointTriangleDistance2(q, a, b, c),
            segmentDistance2(p, q, a, b), segmentDistance2(p, q, b, c), segmentDistance2(p, q, c, a));
    }

    function piece(id, color, center, u, v, length = 3.2, sign = 1) {
        const width = 0.94, corner = 0.34;
        const point = (x, y) => add(center, add(mul(u, x), mul(v, y)));
        const path = [];
        // Rounded rectangle centreline, in its own plane.
        for (let k = 0; k < 4; k++) {
            const angle = k * Math.PI / 2;
            const cx = (k === 0 || k === 3 ? 1 : -1) * (length / 2 - corner);
            const cy = (k < 2 ? 1 : -1) * (width / 2 - corner);
            for (let j = 0; j <= 8; j++) {
                const a = angle + j / 8 * Math.PI / 2;
                path.push(point(cx + corner * Math.cos(a), cy + corner * Math.sin(a)));
            }
        }
        const dir = mul(u, sign);
        const stem = [point(sign * length / 2, 0), point(sign * (length / 2 + 0.43), 0)];
        const knob = stem[1];
        const segments = path.map((p, i) => ({ a: p, b: path[(i + 1) % path.length], r: RADIUS }));
        segments.push({ a: stem[0], b: stem[1], r: RADIUS }, { a: knob, b: knob, r: 0.19 });
        return { id, color, center, u, v, dir, length, width, path, stem, knob, segments, radius: RADIUS };
    }

    function bounds(pieces) {
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const p of pieces) for (const s of p.segments) for (let k = 0; k < 3; k++) {
            lo[k] = Math.min(lo[k], s.a[k] - s.r, s.b[k] - s.r);
            hi[k] = Math.max(hi[k], s.a[k] + s.r, s.b[k] + s.r);
        }
        const center = mul(add(lo, hi), 0.5);
        return { lo, hi, center, radius: Math.hypot(...sub(hi, lo)) / 2 };
    }

    function exitDistance(moving, pieces) {
        const projection = p => dot(p, moving.dir);
        let minMoving = Infinity, maxScene = -Infinity;
        for (const p of pieces) for (const s of p.segments) {
            maxScene = Math.max(maxScene, projection(s.a) + s.r, projection(s.b) + s.r);
            if (p === moving) minMoving = Math.min(minMoving, projection(s.a) - s.r, projection(s.b) - s.r);
        }
        return maxScene - minMoving + 1;
    }

    function overlaps(a, b, margin = 0) {
        for (const s of a.segments) for (const t of b.segments) {
            const r = s.r + t.r + margin;
            if (s.a.some((v, k) => Math.min(v, s.b[k]) > Math.max(t.a[k], t.b[k]) + r || Math.max(v, s.b[k]) < Math.min(t.a[k], t.b[k]) - r)) continue;
            if (segmentDistance2(s.a, s.b, t.a, t.b) < r * r - 1e-8) return true;
        }
        return false;
    }

    function sweptCollision(moving, fixed, travel = exitDistance(moving, [moving, fixed])) {
        const offset = mul(moving.dir, travel);
        for (const a of moving.segments) {
            const a2 = add(a.a, offset), b2 = add(a.b, offset);
            const lo = a.a.map((v, i) => Math.min(v, a.b[i], a2[i], b2[i]) - a.r);
            const hi = a.a.map((v, i) => Math.max(v, a.b[i], a2[i], b2[i]) + a.r);
            for (const b of fixed.segments) {
                if (lo.some((v, i) => v > Math.max(b.a[i], b.b[i]) + b.r || hi[i] < Math.min(b.a[i], b.b[i]) - b.r)) continue;
                const r2 = (a.r + b.r) ** 2;
                const d2 = Math.min(segmentTriangleDistance2(b.a, b.b, a.a, a.b, b2),
                    segmentTriangleDistance2(b.a, b.b, a.a, b2, a2));
                if (d2 < r2 - 1e-8) return true;
            }
        }
        return false;
    }

    function blockingGraph(pieces) {
        return pieces.map(a => {
            const distance = exitDistance(a, pieces);
            return pieces.filter(b => a !== b && sweptCollision(a, b, distance)).map(b => b.id);
        });
    }

    function analyze(graph) {
        const order = [], remaining = new Set(graph.map((_, i) => i + 1)), depths = graph.map(() => 0), choices = [];
        while (remaining.size) {
            const free = [...remaining].filter(id => graph[id - 1].every(b => !remaining.has(b)));
            if (!free.length) return { solvable: false, order, depth: Infinity };
            choices.push(free.length);
            for (const id of free) {
                depths[id - 1] = 1 + Math.max(0, ...graph[id - 1].map(b => depths[b - 1]));
                order.push(id);
            }
            free.forEach(id => remaining.delete(id));
        }
        const edges = graph.reduce((s, bs) => s + bs.length, 0), joins = graph.filter(bs => bs.length > 1).length;
        const depth = Math.max(...depths), free = choices[0];
        const score = depth * 12 + edges / graph.length * 8 + joins * 2 - free / graph.length * 16;
        return { solvable: true, order, depths, depth, free, edges, joins, choices, score };
    }

    global.UnshackleEngine = { piece, bounds, exitDistance, overlaps, analyze, blockingGraph, sweptCollision, segmentDistance2,
        math: { add, sub, mul, dot, cross, unit } };
})(typeof window === 'undefined' ? globalThis : window);
