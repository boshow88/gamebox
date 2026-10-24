/* Prime Zuma — a prime-factorisation spin on Zuma (WIP).
 *
 * A turret spits PRIME balls into chains spiralling inward toward a death end. A shot prime p peels
 * one factor of p off every ball in a contiguous run divisible by p (run >= k); balls that hit 1 pop.
 * Gaps split a chain; facing ends that share a factor attract & crash (same prime → chains another peel).
 *
 * Fields are generalised to one OR MORE "lanes" (each lane = its own polyline path + chain) sharing a
 * single cannon — so a 'dual' field is a double spiral with two death ends. Shapes/levels/difficulty live
 * in prime-zuma-levels.js; FEEL knobs in CFG. Modes: Levels (clear a finite chain) and Endless. */
(function () {
    'use strict';
    var AC = window.ArcadeCommon, DATA = window.PrimeZumaData;
    var t = AC.i18n.t;

    // ---------------- i18n ----------------
    var STRINGS = {
        en: {
            pzName: 'Prime Zuma', pzScore: 'Score',
            pzLevelMode: 'Levels', pzEndless: 'Endless', pzEasy: 'Easy', pzNormal: 'Normal', pzHard: 'Hard',
            pzPickLevel: 'Pick a level', pzClear: 'Cleared!', pzFailed: 'Failed',
            pzHelp1Html: 'A turret shoots <strong>prime</strong> balls; chains spiral inward and you lose if one reaches a <strong>core</strong>.',
            pzHelp2Html: 'A shot prime <strong>p</strong> divides every ball in a contiguous run divisible by p (length <strong>3+</strong>) by p — any that become 1 are removed.',
            pzHelp3Html: '<strong>Levels</strong>: clear a finite chain to win. <strong>Endless</strong>: survive as it ramps up. <kbd>P</kbd> pause · <kbd>R</kbd> restart.',
        },
        zh: {
            pzName: '質因數祖瑪', pzScore: '分數',
            pzLevelMode: '一般', pzEndless: '無盡', pzEasy: '簡單', pzNormal: '普通', pzHard: '困難',
            pzPickLevel: '選擇關卡', pzClear: '過關！', pzFailed: '失敗',
            pzHelp1Html: '砲台發射<strong>質數</strong>球；球鏈往內盤旋,抵達<strong>核心</strong>就輸了。',
            pzHelp2Html: '射出的質數 <strong>p</strong> 會把一段可被 p 整除的連續球鏈（<strong>3 顆以上</strong>）全部除以 p,變成 1 的球消除。',
            pzHelp3Html: '<strong>一般</strong>：清光有限球鏈即過關。<strong>無盡</strong>：撐著,難度隨時間升高。<kbd>P</kbd> 暫停 · <kbd>R</kbd> 重來。',
        },
    };
    Object.assign(AC.i18n.STRINGS.en, STRINGS.en);
    Object.assign(AC.i18n.STRINGS.zh, STRINGS.zh);

    // ---------------- config (FEEL knobs) ----------------
    var CFG = {
        D: 27, rBall: 12.5,
        vRetreat: 180, impulse: 70, impDecay: 7,
        k: 3,
        cannonFloor: 1.5,
        shotSpeed: 480,
        insertPush: 'front',
        startLen: 5,
        smooth: 16,
        compositeColor: '#4b5a70',
    };
    var CW = 460, CH = 460, CX = CW / 2, CY = CH / 2, DPR = Math.min(window.devicePixelRatio || 1, 2);

    // ---------------- path shapes → polyline + cannon (one path per call; a field can build several) ----------------
    var SRC_EXT = 44;    // how far the source end must sit BEYOND the screen edge so the spawn point is safely out of view
    function cen(f) { return { x: CX + (f.ox || 0), y: CY + (f.oy || 0) }; }   // field centre (optionally nudged off canvas-centre for visual balance)
    function genSpiral(f, phase) {   // mirror:true flips left↔right (⇒ reverses the winding handedness, CCW↔CW)
        phase = phase || 0;
        var c0 = cen(f), mir = f.mirror ? -1 : 1, steps = 2400, thetaMax = f.turns * 2 * Math.PI, pts = [];
        for (var i = 0; i <= steps; i++) { var th = thetaMax * i / steps, r = f.Rin + (f.Rout - f.Rin) * (th / thetaMax); pts.push({ x: c0.x + mir * r * Math.cos(th + phase), y: c0.y + r * Math.sin(th + phase) }); }
        return { pts: pts, cannon: c0 };   // pts[0] = innermost = death
    }
    function genSquare(f, phase) {   // smooth rounded square (squircle, exponent n) — no hard 90° corners; phase rotates the whole square (e.g. entrance to the top-right)
        phase = phase || 0;
        var c0 = cen(f), mir = f.mirror ? -1 : 1, steps = 2600, thetaMax = f.turns * 2 * Math.PI, e = 2 / (f.n || 3.0), pts = [];
        for (var i = 0; i <= steps; i++) {
            var tt = thetaMax * i / steps, th = tt + phase, r = f.Rin + (f.Rout - f.Rin) * (tt / thetaMax), c = Math.cos(th), s = Math.sin(th);
            pts.push({ x: c0.x + mir * r * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), e), y: c0.y + r * (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), e) });
        }
        return { pts: pts, cannon: c0 };
    }
    function genPoly(f, phase) {   // a smooth n-sided (rounded) spiral via an n-fold radius modulation; sides:3 → triangle style
        phase = phase || 0;
        var c0 = cen(f), mir = f.mirror ? -1 : 1, sides = f.sides || 3, amp = f.polyAmp != null ? f.polyAmp : 0.17, steps = 2600, thetaMax = f.turns * 2 * Math.PI, pts = [];
        for (var i = 0; i <= steps; i++) { var th = thetaMax * i / steps, rb = f.Rin + (f.Rout - f.Rin) * (th / thetaMax), r = rb * (1 + amp * Math.cos(sides * (th + phase))); pts.push({ x: c0.x + mir * r * Math.cos(th + phase), y: c0.y + r * Math.sin(th + phase) }); }
        return { pts: pts, cannon: c0 };
    }
    function genSnake(f) {   // serpentine over a grid, rows joined by rounded U-turns; stops ~60% down, cannon at bottom
        var rows = f.rows || 4, m = 34, yTop = 48, yBot = CH * 0.60, gap = (yBot - yTop) / (rows - 1), R = gap / 2;
        var xL = m + R, xR = CW - m - R, seg = 6, pts = [], r, k, steps;
        for (r = 0; r < rows; r++) {
            var y = yTop + r * gap, ltr = (r % 2 === 0), xa = ltr ? xL : xR, xb = ltr ? xR : xL;
            steps = Math.max(2, Math.round(Math.abs(xb - xa) / seg));
            for (k = 0; k <= steps; k++) pts.push({ x: xa + (xb - xa) * k / steps, y: y });
            if (r < rows - 1) { var dir = ltr ? 1 : -1, cx = xb, cy = y + R, aSteps = Math.max(6, Math.round(Math.PI * R / seg)); for (k = 1; k <= aSteps; k++) { var a = -Math.PI / 2 + Math.PI * k / aSteps; pts.push({ x: cx + dir * R * Math.cos(a), y: cy + R * Math.sin(a) }); } }
        }
        pts.reverse();
        return { pts: pts, cannon: { x: CX, y: CH - 26 } };
    }
    function segInt(a, b, c, d) {   // intersection of segments a-b and c-d → {t,u,x,y} (t along a-b, u along c-d) or null
        var rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-9) return null;
        var t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den, u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
        if (t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4) return { t: t, u: u, x: a.x + rx * t, y: a.y + ry * t };
        return null;
    }
    function revUnder(baseLen, ranges) { return ranges.map(function (r) { return [baseLen - r[1], baseLen - r[0]]; }); }   // flip arc-ranges when a path is reversed to death-first order
    function genStar(f) {   // 5-point star (pentagram) in one stroke. Each straight line meets 2 crossings — FIRST (nearer entrance) stays above, SECOND goes underground.
        var c0 = cen(f), mir = f.mirror ? -1 : 1, Rs = f.Rstar || 214, rot = (f.phase != null ? f.phase : -Math.PI / 2), rFil = f.tipR || 30, w = f.underW || CFG.D * 1.3, seg = 6;
        var tip = [], i, j; for (i = 0; i < 5; i++) { var aa = rot + i * 2 * Math.PI / 5; tip.push({ x: c0.x + mir * Rs * Math.cos(aa), y: c0.y + Rs * Math.sin(aa) }); }
        var order = [0, 2, 4, 1, 3], S = order.map(function (k) { return tip[k]; });   // tips in stroke order; traverse S0→S1→S2→S3→S4→S0 (entrance=death=S0 tip)
        S.push(S[0]);
        var E = [], dir = [], len = []; for (i = 0; i < 5; i++) { E.push([S[i], S[i + 1]]); var dx = S[i + 1].x - S[i].x, dy = S[i + 1].y - S[i].y, L = Math.hypot(dx, dy); len.push(L); dir.push({ x: dx / L, y: dy / L }); }
        var cross = []; for (i = 0; i < 5; i++) cross.push([]);
        for (i = 0; i < 5; i++) for (j = 0; j < 5; j++) { if (j === i) continue; var it = segInt(E[i][0], E[i][1], E[j][0], E[j][1]); if (it) cross[i].push(it.t); }
        for (i = 0; i < 5; i++) cross[i].sort(function (p, q) { return p - q; });
        var cut = rFil / Math.tan(Math.PI / 10), dT = f.deathT != null ? f.deathT : 0.72;   // back-off along each edge so a radius-rFil arc is tangent (interior tip angle = 36° ⇒ half = 18°); deathT = where on the final edge the death core sits (1 = the tip, less = pulled inward toward the centre)
        var pts = [], arc = 0, underE = [], k;
        function push(p) { if (pts.length) arc += Math.hypot(p.x - pts[pts.length - 1].x, p.y - pts[pts.length - 1].y); pts.push(p); }
        for (k = 0; k < 5; k++) {
            var A = E[k][0], L = len[k], d = dir[k], t0 = (k === 0) ? 0 : cut / L, t1 = (k === 4) ? dT : 1 - cut / L;
            if (k === 0) push({ x: A.x, y: A.y });
            var sStart = arc, nS = Math.max(2, Math.round(L * (t1 - t0) / seg)), tc = cross[k].length ? cross[k][cross[k].length - 1] : -1, got = false;
            for (var q = 1; q <= nS; q++) { var tt = t0 + (t1 - t0) * q / nS; push({ x: A.x + d.x * L * tt, y: A.y + d.y * L * tt }); if (!got && tc >= 0 && tt >= tc) { var ca = sStart + (tc - t0) * L; underE.push([ca - w, ca + w]); got = true; } }   // SECOND crossing → under
            if (k < 4) {   // round the interior tip S[k+1] with a 144° (2/5-circle) arc tangent to both edges
                var W = S[k + 1], di = dir[k], dou = dir[k + 1], Ain = { x: W.x - di.x * cut, y: W.y - di.y * cut }, Aout = { x: W.x + dou.x * cut, y: W.y + dou.y * cut };
                var turn = (di.x * dou.y - di.y * dou.x) < 0 ? -1 : 1, O = { x: Ain.x - di.y * turn * rFil, y: Ain.y + di.x * turn * rFil };
                var a0 = Math.atan2(Ain.y - O.y, Ain.x - O.x), a1 = Math.atan2(Aout.y - O.y, Aout.x - O.x), da = a1 - a0;
                if (turn > 0) { while (da <= 0) da += 2 * Math.PI; } else { while (da >= 0) da -= 2 * Math.PI; }
                var nf = Math.max(5, Math.round(Math.abs(da) * rFil / seg)); for (var q2 = 1; q2 <= nf; q2++) { var aa2 = a0 + da * q2 / nf; push({ x: O.x + rFil * Math.cos(aa2), y: O.y + rFil * Math.sin(aa2) }); }
            }
        }
        var baseLen = arc; pts.reverse();
        return { pts: pts, cannon: c0, under: revUnder(baseLen, underE) };
    }
    function genClover(f) {   // "井"/clover in one stroke: 3 corners loop into big round leaves (270° = 3/4-circle arcs, tangent to both lines), the 4th corner open (entrance = right vertical's foot, death = bottom horizontal's right end).
        var c0 = cen(f), cx = c0.x, cy = c0.y, gx = f.gx || 50, gy = f.gy || 50, leafR = f.leafR || 76, w = f.underW || CFG.D * 1.3, seg = 6;   // line overhang beyond the crossings = leafR ⇒ each 270° leaf is tangent to its two lines
        var VRb = { x: cx + gx, y: cy + gy + leafR }, VRt = { x: cx + gx, y: cy - gy - leafR }, HTr = { x: cx + gx + leafR, y: cy - gy }, HTl = { x: cx - gx - leafR, y: cy - gy };
        var VLt = { x: cx - gx, y: cy - gy - leafR }, VLb = { x: cx - gx, y: cy + gy + leafR }, HBl = { x: cx - gx - leafR, y: cy + gy }, HBr = { x: cx + gx + leafR + (f.deathExt || 0), y: cy + gy };   // HBr = death (deathExt lengthens the run up to it)
        var pts = [], arc = 0, under = [], sw = 3 * Math.PI / 2;
        function push(p) { if (pts.length) arc += Math.hypot(p.x - pts[pts.length - 1].x, p.y - pts[pts.length - 1].y); pts.push(p); }
        function straight(a, b) { var L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(2, Math.round(L / seg)); for (var q = 1; q <= n; q++) push({ x: a.x + (b.x - a.x) * q / n, y: a.y + (b.y - a.y) * q / n }); }
        function leaf(ox, oy, a0) { var n = Math.max(20, Math.round(sw * leafR / seg)); for (var q = 1; q <= n; q++) { var aa = a0 + sw * q / n; push({ x: ox + leafR * Math.cos(aa), y: oy + leafR * Math.sin(aa) }); } }   // +270° arc, centre (ox,oy)
        push(VRb);   // which strand is UNDER at each of the 4 crossings (the other strand becomes the bridge on top):
        var aB = arc; straight(VRb, VRt); under.push([aB + leafR - w, aB + leafR + w]);   // VR×HB → right-vertical UNDER
        leaf(cx + gx + leafR, cy - gy - leafR, Math.PI);              // top-right leaf
        var aD = arc; straight(HTr, HTl); under.push([aD + leafR - w, aD + leafR + w]);   // VR×HT → top-horizontal UNDER
        leaf(cx - gx - leafR, cy - gy - leafR, Math.PI / 2);         // top-left leaf
        var aF = arc; straight(VLt, VLb); under.push([aF + leafR - w, aF + leafR + w]);   // VL×HT → left-vertical UNDER
        leaf(cx - gx - leafR, cy + gy + leafR, 0);                   // bottom-left leaf
        var aH = arc; straight(HBl, HBr); under.push([aH + leafR - w, aH + leafR + w]);   // VL×HB → bottom-horizontal UNDER; death at HBr
        var baseLen = arc; pts.reverse();
        return { pts: pts, cannon: c0, under: revUnder(baseLen, under) };
    }
    function polyRound(wp, r, seg) {   // polyline through waypoints; interior corners rounded (radius r) with a quadratic fillet, straight runs sampled ~every seg px. pts[0] = death, pts[last] = entrance.
        var pts = [], i;
        function push(p) { pts.push(p); }
        function line(a, b, skip) { var L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.round(L / seg)); for (var k = skip ? 1 : 0; k <= n; k++) push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }); }
        var prev = wp[0]; push(prev);
        for (i = 1; i < wp.length - 1; i++) {
            var cor = wp[i], nxt = wp[i + 1], dix = cor.x - prev.x, diy = cor.y - prev.y, di = Math.hypot(dix, diy) || 1, dox = nxt.x - cor.x, doy = nxt.y - cor.y, dol = Math.hypot(dox, doy) || 1;
            dix /= di; diy /= di; dox /= dol; doy /= dol;
            var rr = Math.min(r, di * 0.5, dol * 0.5), ain = { x: cor.x - dix * rr, y: cor.y - diy * rr }, aout = { x: cor.x + dox * rr, y: cor.y + doy * rr };
            line(prev, ain, true);
            var nf = 8; for (var q = 1; q <= nf; q++) { var t = q / nf, mt = 1 - t; push({ x: mt * mt * ain.x + 2 * mt * t * cor.x + t * t * aout.x, y: mt * mt * ain.y + 2 * mt * t * cor.y + t * t * aout.y }); }
            prev = aout;
        }
        line(prev, wp[wp.length - 1], true);
        return pts;
    }
    function genDuo(f) {   // two offset rounded-square loops (each its own lane/chain), overlapping like the sketch. Each loop is open at one corner → one end is the death core, the other is the off-screen entrance.
        var o = cen(f), h = f.half || 128, r = f.cr || 24, gap = f.gap || 28, sep = f.sep || 58, seg = 6, w = f.underW || CFG.D * 1.3, hs = h - sep;
        function sq(cx, cy) { return { TL: { x: cx - h, y: cy - h }, TR: { x: cx + h, y: cy - h }, BR: { x: cx + h, y: cy + h }, BL: { x: cx - h, y: cy + h } }; }
        var a = sq(o.x - sep, o.y - sep), b = sq(o.x + sep, o.y + sep);
        var loopA = polyRound([{ x: a.TL.x + gap, y: a.TL.y }, a.TR, a.BR, a.BL, { x: a.TL.x, y: a.TL.y + gap }], r, seg);   // upper-left square, open at TL (death on top, entrance up the left)
        var loopB = polyRound([{ x: b.BR.x - gap, y: b.BR.y }, b.BL, b.TL, b.TR, { x: b.BR.x, y: b.BR.y - gap }], r, seg);   // lower-right square, open at BR (death on bottom, entrance down the right)
        function arcAt(pts, x, y) { var best = 0, bd = Infinity, acc = 0; for (var i = 0; i < pts.length; i++) { if (i > 0) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); var dx = pts[i].x - x, dy = pts[i].y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = acc; } } return best; }
        var caBL = arcAt(loopA, o.x - hs, o.y + hs), cbTR = arcAt(loopB, o.x + hs, o.y - hs);   // loop A goes UNDER at the bottom-left crossing; loop B goes UNDER at the top-right crossing (→ dim + occluded there)
        return { loops: [loopA, loopB], under: [[[caBL - w, caBL + w]], [[cbTR - w, cbTR + w]]] };
    }
    function buryHorizontalRanges(path) {   // arc-ranges where the path runs ~horizontally (|dy| small) — used to tuck the flat runs of a square underground
        var res = [], pts = path.pts, arc = path.arc, inRun = false, s0 = 0, i;
        for (i = 1; i < pts.length; i++) {
            var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y, horiz = (dx * dx + dy * dy) > 0 && Math.abs(dy) <= Math.abs(dx) * 0.42;
            if (horiz && !inRun) { inRun = true; s0 = arc[i - 1]; }
            else if (!horiz && inRun) { inRun = false; if (arc[i - 1] - s0 > CFG.D * 1.2) res.push([s0, arc[i - 1]]); }
        }
        if (inRun && arc[pts.length - 1] - s0 > CFG.D * 1.2) res.push([s0, arc[pts.length - 1]]);
        return res;
    }
    function pathOf(pts) { var arc = [0], total = 0; for (var i = 1; i < pts.length; i++) { total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); arc.push(total); } return { pts: pts, arc: arc, len: total }; }
    function extendOut(pts, exitAng) {   // continue the source end OFF-SCREEN so balls enter unseen. Normally along its own tangent (smooth, no kink);
        var a = pts[pts.length - 2], b = pts[pts.length - 1], dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy) || 1, step = 8, x = b.x, y = b.y, g = 0;
        dx /= m; dy /= m;
        var tx = dx, ty = dy, bend = 0;             // if exitAng given, gently curve from the tangent toward that fixed heading (e.g. 4 o'clock) over `bend` steps — no kink at the join
        if (exitAng != null) { tx = Math.cos(exitAng); ty = Math.sin(exitAng); bend = 46; }
        while (g++ < 240 && x >= -SRC_EXT && x <= CW + SRC_EXT && y >= -SRC_EXT && y <= CH + SRC_EXT) {
            var t = bend > 0 ? Math.min(1, g / bend) : 1, ux = dx + (tx - dx) * t, uy = dy + (ty - dy) * t, um = Math.hypot(ux, uy) || 1;
            x += ux / um * step; y += uy / um * step; pts.push({ x: x, y: y });
        }
    }
    function buildField(field) {   // → { paths:[{pts,arc,len,under}...], cannon }
        var c0 = cen(field), under = field.under || [], can = { x: c0.x + (field.canDx || 0), y: c0.y + (field.canDy || 0) };   // cannon may be nudged independently of the field
        function make(pts, exitAng, underArc) {
            var baseP = pathOf(pts), baseLen = baseP.len;          // length BEFORE the off-screen lead-in
            if (underArc == null && field.buryHorizontal) underArc = buryHorizontalRanges(baseP);
            extendOut(pts, exitAng);
            var p = pathOf(pts);
            p.under = underArc ? underArc : under.map(function (u) { return [u[0] * baseLen, u[1] * baseLen]; });   // buried (unshootable) arc ranges — explicit arc-ranges, or field.under given as fractions
            return p;
        }
        if (field.shape === 'dual') { var ph = field.phase != null ? field.phase : -Math.PI / 4; return { paths: [make(genSpiral(field, ph).pts, field.exitAng), make(genSpiral(field, ph + Math.PI).pts, field.exitAng2)], cannon: can }; }
        if (field.shape === 'square') return { paths: [make(genSquare(field, field.phase || 0).pts, field.exitAng)], cannon: can };
        if (field.shape === 'poly') return { paths: [make(genPoly(field, field.phase || 0).pts, field.exitAng)], cannon: can };
        if (field.shape === 'star') { var gs = genStar(field); return { paths: [make(gs.pts, field.exitAng, gs.under)], cannon: can }; }
        if (field.shape === 'clover') { var gc = genClover(field); return { paths: [make(gc.pts, field.exitAng, gc.under)], cannon: can }; }
        if (field.shape === 'duo') { var gd = genDuo(field); return { paths: gd.loops.map(function (pts, i) { return make(pts, undefined, gd.under[i]); }), cannon: can }; }
        if (field.shape === 'snake') { var g = genSnake(field); return { paths: [make(g.pts)], cannon: g.cannon }; }
        return { paths: [make(genSpiral(field, field.phase || 0).pts, field.exitAng)], cannon: can };
    }
    function buriedS(path, s) { var u = path.under; if (u) for (var i = 0; i < u.length; i++) if (s >= u[i][0] && s <= u[i][1]) return true; return false; }   // ball at arc-length s is underground → unshootable + drawn dim
    function posAt(path, s) {
        s = s < 0 ? 0 : s > path.len ? path.len : s;
        var a = path.arc, lo = 0, hi = a.length - 1;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (a[mid] < s) lo = mid + 1; else hi = mid; }
        var i = lo > 0 ? lo - 1 : 0, seg = (a[i + 1] - a[i]) || 1, f = (s - a[i]) / seg;
        var p0 = path.pts[i], p1 = path.pts[i + 1] || p0;
        return { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f };
    }
    function nearestS(path, x, y) {
        var best = 0, bd = Infinity;
        for (var i = 0; i < path.pts.length; i += 2) { var p = path.pts[i], dx = p.x - x, dy = p.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = path.arc[i]; } }
        return best;
    }

    // ---------------- rng + number helpers ----------------
    var rngState = 1;
    function rng() { rngState = (rngState + 0x6D2B79F5) | 0; var x = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }
    function isPrime(v) { if (v < 2) return false; for (var i = 2; i * i <= v; i++) if (v % i === 0) return false; return true; }
    function gcd(a, b) { a = a < 0 ? -a : a; b = b < 0 ? -b : b; while (b) { var m = a % b; a = b; b = m; } return a; }
    function activePrimes() { return R.full.slice(0, R.activeN); }
    function pickCannonPrime() {   // weighted by the live factor DEMAND across ALL lanes (+ floor)
        var n = R.activeN, dem = [], i, L, qi, j, pi, total = 0;
        for (i = 0; i < n; i++) dem[i] = CFG.cannonFloor;
        if (lanes) for (L = 0; L < lanes.length; L++) { var qs = lanes[L].qs; for (qi = 0; qi < qs.length; qi++) { var vals = qs[qi].vals; for (j = 0; j < vals.length; j++) { var v = vals[j].v; for (pi = 0; pi < n; pi++) { var p = R.full[pi], m = v; while (m % p === 0) { m /= p; dem[pi]++; } } } } }
        for (i = 0; i < n; i++) total += dem[i];
        var r = rng() * total;
        for (i = 0; i < n; i++) if ((r -= dem[i]) <= 0) return R.full[i];
        return R.full[n - 1];
    }
    function rebuildCandidates() {
        var primes = activePrimes(), list = [];
        for (var n = 2; n <= R.cap; n++) { var m = n, omega = 0; for (var i = 0; i < primes.length; i++) { var p = primes[i]; while (m % p === 0) { m /= p; omega++; } } if (m === 1 && omega <= R.maxOmega) list.push({ v: n, w: omega }); }
        R.candidates = list.length ? list : [{ v: 2, w: 1 }];
    }
    function spawnValue() {
        var list = R.candidates, bias = R.bias, sum = 0, i, wt;
        if (!list || !list.length) return 2;
        for (i = 0; i < list.length; i++) sum += Math.pow(bias, list[i].w);
        var r = rng() * sum;
        for (i = 0; i < list.length; i++) { wt = Math.pow(bias, list[i].w); if ((r -= wt) <= 0) return list[i].v; }
        return list[list.length - 1].v;
    }
    function updateProgression() {   // ENDLESS only — walk the flattened stage keyframes, interpolate cap/feed/bias between them; primes & Ω step at each stage
        var st = R.e.stages, T = frame / 60, i = 0;
        while (i < st.length - 1 && T >= st[i + 1].t) i++;
        var a = st[i], b = st[i + 1] || a, span = (b.t - a.t) || 1, u = (b === a) ? 0 : Math.max(0, Math.min(1, (T - a.t) / span));
        var cap = Math.round(a.cap + (b.cap - a.cap) * u);
        R.bias = a.bias + (b.bias - a.bias) * u;
        R.feed = a.feed + (b.feed - a.feed) * u;
        if (a.primes !== R.full || cap !== R.cap || a.omega !== R.maxOmega) { R.full = a.primes; R.activeN = a.primes.length; R.cap = cap; R.maxOmega = a.omega; rebuildCandidates(); }
    }

    // ---------------- state ----------------
    // lanes: [{ path:{pts,arc,len}, qs:[ {vals:[ball..], head, imp} ... ] }]  — each lane is an independent chain.
    var canvas, ctx, shell, lanes, shots, cannon, score, over, fx, frame, combo, lastElimFrame, R, CAN = { x: CX, y: CY };
    var mode = 'level', sel = { world: 1, fieldIdx: 0 }, endlessSel = { diff: 'easy', fieldIdx: 0 }, pending = null, lastResult = null, paused = false;
    function makeBall(v, x, y) { return { v: v, rx: x, ry: y, pop: 0 }; }

    function $(id) { return document.getElementById(id); }
    function backEndS(q) { return q.head + (q.vals.length - 1) * CFG.D; }
    function gapBetween(f, b) { return b.head - backEndS(f) - CFG.D; }

    function newGame() {
        rngState = (Date.now() >>> 0) || 1;
        var p = pending || { kind: 'level', world: 1, fieldIdx: 0 }, field;
        if (p.kind === 'level') {
            var lv = DATA.level(p.world, p.fieldIdx); field = lv.field;
            R = { isLevel: true, field: field, full: lv.primes, activeN: lv.primes.length, cap: lv.cap, maxOmega: lv.maxOmega, bias: lv.bias, feed: lv.feed, quota: lv.quota, spawned: 0, candidates: [] };
        } else {
            var e = DATA.ENDLESS[p.diff] || DATA.ENDLESS.easy, s0 = e.stages[0]; field = DATA.FIELDS[p.fieldIdx] || DATA.FIELDS[0];
            R = { isLevel: false, field: field, e: e, full: s0.primes, activeN: s0.primes.length, cap: s0.cap, maxOmega: s0.omega, bias: s0.bias, feed: s0.feed, quota: Infinity, spawned: 0, candidates: [] };
        }
        var fb = buildField(field); CAN = fb.cannon;
        frame = 0; combo = 0; lastElimFrame = -999;
        rebuildCandidates();
        shots = []; fx = []; score = 0; over = false;
        var nLanes = fb.paths.length, seedPer = Math.min(CFG.startLen, R.isLevel ? Math.max(1, Math.floor(R.quota / nLanes)) : CFG.startLen);
        lanes = [];
        for (var L = 0; L < nLanes; L++) {
            var path = fb.paths[L], head = path.len - seedPer * CFG.D, vals = [];
            for (var i = 0; i < seedPer; i++) { var pos = posAt(path, head + i * CFG.D); vals.push(makeBall(spawnValue(), pos.x, pos.y)); }
            lanes.push({ path: path, qs: seedPer ? [{ vals: vals, head: head, imp: 0 }] : [] });
        }
        R.spawned = seedPer * nLanes;
        cannon = { aim: -Math.PI / 2, cur: pickCannonPrime(), next: pickCannonPrime() };
        syncHud();
    }

    // ---------------- particles ----------------
    function burst(x, y, h) {
        fx.push({ x: x, y: y, r0: CFG.rBall * 0.5, r1: CFG.rBall * 2.6, life: 0, max: 0.34, h: h, ring: true });
        for (var i = 0; i < 7; i++) { var a = (i / 7) * Math.PI * 2 + rng() * 0.7, sp = 70 + rng() * 110; fx.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.4 + rng() * 0.25, h: h }); }
    }
    function updateFx(dt) {
        for (var i = fx.length - 1; i >= 0; i--) { var f = fx[i]; f.life += dt; if (!f.ring) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.88; f.vy *= 0.88; } if (f.life >= f.max) fx.splice(i, 1); }
    }

    // ---------------- elimination (scoped to a lane's queues `qs`) ----------------
    function regroup(items) {
        var out = [], cur = null;
        for (var i = 0; i < items.length; i++) {
            if (cur && Math.abs(items[i].s - (cur.head + cur.vals.length * CFG.D)) <= CFG.D * 0.5) cur.vals.push(items[i].b);
            else { if (cur) out.push(cur); cur = { vals: [items[i].b], head: items[i].s, imp: 0 }; }
        }
        if (cur) out.push(cur);
        return out;
    }
    function tryEliminate(qs, q, idx, p) {
        if (!q || q.vals[idx].v % p !== 0) return false;
        var lo = idx, hi = idx;
        while (lo - 1 >= 0 && q.vals[lo - 1].v % p === 0) lo--;
        while (hi + 1 < q.vals.length && q.vals[hi + 1].v % p === 0) hi++;
        if (hi - lo + 1 < CFG.k) return false;
        var items = [], cleared = 0;
        for (var j = 0; j < q.vals.length; j++) {
            var b = q.vals[j], sPos = q.head + j * CFG.D;
            if (j >= lo && j <= hi) { b.v = b.v / p; if (b.v === 1) { burst(b.rx, b.ry, hue(p)); cleared++; continue; } b.pop = 1; }
            items.push({ s: sPos, b: b });
        }
        score += cleared * 10 + (hi - lo + 1);
        combo = (frame - lastElimFrame <= 42) ? combo + 1 : 1; lastElimFrame = frame;
        sfxPop(combo);
        var at = qs.indexOf(q);
        if (at >= 0) { var groups = regroup(items); qs.splice.apply(qs, [at, 1].concat(groups)); }
        return true;
    }
    function resolveCollisions(qs) {
        var crashes = 0;
        for (var guard = 0; guard < 200; guard++) {
            var merged = false;
            for (var i = 0; i < qs.length - 1; i++) {
                var f = qs[i], b = qs[i + 1];
                if (gapBetween(f, b) < -0.01) {
                    var a = f.vals[f.vals.length - 1].v, c = b.vals[0].v, junction = f.vals.length - 1;
                    var frontFed = (b.vel || 0) < 0 && (f.vel || 0) <= 0, retreating = (f.vel || 0) > 0;
                    var mq = { vals: f.vals.concat(b.vals), head: frontFed ? f.head : (b.head - f.vals.length * CFG.D), imp: 0 };
                    qs.splice(i, 2, mq);
                    if (retreating) { if (a === c && isPrime(a)) tryEliminate(qs, mq, junction, a); else { mq.imp = CFG.impulse; if (crashes < 2) { sfxCrash(); crashes++; } } }
                    merged = true; break;
                }
            }
            if (!merged) break;
        }
    }

    // ---------------- sound ----------------
    function sfxShoot(v) { var idx = R.full.indexOf(v); if (idx < 0) idx = 0; var f = [466, 587, 698, 880, 1047][idx % 5]; AC.audio.tone(f * 1.4, 0.07, { type: 'triangle', volume: 0.07, attack: 0.002, slideTo: f }); }
    function sfxInsert() { AC.audio.tone(300, 0.05, { type: 'triangle', volume: 0.06, attack: 0.002, slideTo: 215 }); }
    function sfxCrash() { AC.audio.tone(170, 0.09, { type: 'triangle', volume: 0.08, attack: 0.002, slideTo: 115 }); AC.audio.noise(0.05, { volume: 0.035, filter: { type: 'lowpass', freq: 760 } }); }
    function sfxPop(n) { var f = 523.25 * Math.pow(2, Math.min(n - 1, 12) / 12); AC.audio.tone(f, 0.16, { type: 'sine', volume: 0.12, attack: 0.003, slideTo: f * 1.5 }); AC.audio.tone(f * 2, 0.11, { type: 'triangle', volume: 0.045, attack: 0.002 }); AC.audio.noise(0.06, { volume: 0.045, filter: { type: 'bandpass', freq: 2600 } }); }

    // ---------------- shooting / insertion ----------------
    function shoot() {
        var mx = CAN.x + Math.cos(cannon.aim) * 24, my = CAN.y + Math.sin(cannon.aim) * 24, fired = cannon.cur;
        shots.push({ x: mx, y: my, vx: Math.cos(cannon.aim) * CFG.shotSpeed, vy: Math.sin(cannon.aim) * CFG.shotSpeed, v: fired });
        cannon.cur = cannon.next; cannon.next = pickCannonPrime();
        sfxShoot(fired);
    }
    function nearestBall(x, y) {
        var best = null, bd = Infinity, R0 = CFG.rBall;
        for (var L = 0; L < lanes.length; L++) {
            var lane = lanes[L], qs = lane.qs;
            for (var qi = 0; qi < qs.length; qi++) { var q = qs[qi]; for (var j = 0; j < q.vals.length; j++) { var b = q.vals[j], sB = q.head + j * CFG.D; if (b.rx < -R0 || b.rx > CW + R0 || b.ry < -R0 || b.ry > CH + R0 || buriedS(lane.path, sB)) continue; var dx = b.rx - x, dy = b.ry - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { lane: lane, q: q, j: j, s: sB }; } } }
        }
        if (best) best.dist = Math.sqrt(bd);
        return best;
    }
    function insertShot(shot, hit) {
        var lane = hit.lane, q = hit.q, shotS = nearestS(lane.path, shot.x, shot.y), j = shotS < hit.s ? hit.j : hit.j + 1;
        q.vals.splice(j, 0, makeBall(shot.v, shot.x, shot.y));
        if (CFG.insertPush === 'front') q.head -= CFG.D;
        if (!tryEliminate(lane.qs, q, j, shot.v)) sfxInsert();
    }

    // ---------------- main loop ----------------
    function update() {
        if (over || !lanes) return;
        frame++;
        if (!R.isLevel) updateProgression();
        var dt = 1 / 60, i, L, qs;
        // 1) feed each lane from its source (level stops once the TOTAL quota is reached)
        for (L = 0; L < lanes.length; L++) {
            qs = lanes[L].qs; var lastQ = qs.length ? qs[qs.length - 1] : null, path = lanes[L].path, canFeed = R.isLevel ? (R.spawned < R.quota) : true;
            if (canFeed && (!lastQ || backEndS(lastQ) <= path.len - CFG.D)) {
                if (lastQ && path.len - backEndS(lastQ) <= CFG.D + 0.5) { var pe = posAt(path, backEndS(lastQ) + CFG.D); lastQ.vals.push(makeBall(spawnValue(), pe.x, pe.y)); }
                else { var ps = posAt(path, path.len); qs.push({ vals: [makeBall(spawnValue(), ps.x, ps.y)], head: path.len, imp: 0 }); }
                R.spawned++;
            }
        }
        // 2) velocities + motion + collisions, per lane
        for (L = 0; L < lanes.length; L++) {
            qs = lanes[L].qs;
            for (i = 0; i < qs.length; i++) { var q = qs[i], v = 0; if (i === qs.length - 1) v = -R.feed; else if (gcd(q.vals[q.vals.length - 1].v, qs[i + 1].vals[0].v) > 1) v = CFG.vRetreat; q.vel = v + (q.imp || 0); q.imp = (q.imp || 0) * Math.max(0, 1 - CFG.impDecay * dt); if (Math.abs(q.imp) < 1) q.imp = 0; }
            for (i = 0; i < qs.length; i++) qs[i].head += qs[i].vel * dt;
            resolveCollisions(qs);
        }
        // 3) projectiles (hit the nearest ball across ALL lanes)
        for (i = shots.length - 1; i >= 0; i--) {
            var s = shots[i]; s.x += s.vx * dt; s.y += s.vy * dt;
            if (s.x < -30 || s.x > CW + 30 || s.y < -30 || s.y > CH + 30) { shots.splice(i, 1); continue; }
            var hit = nearestBall(s.x, s.y);
            if (hit && hit.dist < CFG.rBall * 1.9) { insertShot(s, hit); shots.splice(i, 1); }
        }
        for (L = 0; L < lanes.length; L++) resolveCollisions(lanes[L].qs);
        // 4) prune, pulses, win/lose
        var allEmpty = true, dead = false;
        for (L = 0; L < lanes.length; L++) {
            qs = lanes[L].qs;
            for (i = qs.length - 1; i >= 0; i--) if (!qs[i].vals.length) qs.splice(i, 1);
            for (i = 0; i < qs.length; i++) { var vv = qs[i].vals; for (var jj = 0; jj < vv.length; jj++) if (vv[jj].pop > 0) vv[jj].pop = Math.max(0, vv[jj].pop - dt * 6); }
            if (qs.length) { allEmpty = false; if (qs[0].head <= 0) dead = true; }
        }
        updateFx(dt);
        if (!over) {
            if (dead) { over = true; shell.gameOver({ score: score, win: false }); }
            else if (R.isLevel && R.spawned >= R.quota && allEmpty) { over = true; shell.gameOver({ score: score, win: true, meta: { level: sel.world + '-' + (sel.fieldIdx + 1) } }); }
        }
        syncHud();
    }

    // ---------------- render ----------------
    function hue(v) { return (v * 47) % 360; }
    function hslLum(h, s, l) {   // perceived luminance (0..1) of an hsl colour → lets us pick black vs white text for best contrast on each ball
        s /= 100; l /= 100; var c = (1 - Math.abs(2 * l - 1)) * s, hh = (((h % 360) + 360) % 360) / 60, x = c * (1 - Math.abs(hh % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
        if (hh < 1) { r = c; g = x; } else if (hh < 2) { r = x; g = c; } else if (hh < 3) { g = c; b = x; } else if (hh < 4) { g = x; b = c; } else if (hh < 5) { r = x; b = c; } else { r = c; b = x; }
        return 0.299 * (r + m) + 0.587 * (g + m) + 0.114 * (b + m);
    }
    function ballSheen(x, y, r) {   // gentle sphere shading: a small top-left shine + a faint shade at the far edge (kept light so digits stay readable)
        var gg = ctx.createRadialGradient(x - r * 0.34, y - r * 0.38, r * 0.1, x, y, r);
        gg.addColorStop(0, 'rgba(255,255,255,0.22)'); gg.addColorStop(0.55, 'rgba(255,255,255,0.03)'); gg.addColorStop(1, 'rgba(0,0,0,0.12)');
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = gg; ctx.fill();
    }
    function drawBall(x, y, v, r) {
        var prime = isPrime(v), textCol;
        if (prime) {
            var h = hue(v);
            ctx.save(); ctx.shadowColor = 'hsl(' + h + ',95%,62%)'; ctx.shadowBlur = 11;
            ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = 'hsl(' + h + ',72%,58%)'; ctx.fill(); ctx.restore();
            ctx.lineWidth = 1.5; ctx.strokeStyle = 'hsl(' + h + ',100%,84%)'; ctx.stroke();
            textCol = hslLum(h, 72, 58) > 0.55 ? '#0a1322' : '#ffffff';   // dark text on light fills (yellow/green), white on dark fills (blue/purple)
        } else {
            ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = CFG.compositeColor; ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
            textCol = '#ffffff';
        }
        ballSheen(x, y, r);
        ctx.fillStyle = textCol;
        ctx.font = 'bold ' + (v > 9 ? Math.round(r * 0.95) : Math.round(r * 1.2)) + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(v), x, y + 0.5);
    }
    function strokeArcRange(path, s0, s1) {   // stroke just the path points whose arc-length is within [s0,s1]
        var on = false, p, pt; ctx.beginPath();
        for (p = 0; p < path.pts.length; p++) { if (path.arc[p] >= s0 && path.arc[p] <= s1) { pt = path.pts[p]; if (!on) { ctx.moveTo(pt.x, pt.y); on = true; } else ctx.lineTo(pt.x, pt.y); } else on = false; }
        ctx.stroke();
    }
    function strokeAll(path, width, style, alpha) {   // stroke the WHOLE road in one continuous stroke (no gaps, so no round seam at a crossing)
        ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); for (var p = 0; p < path.pts.length; p++) { var pt = path.pts[p]; if (p === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); } ctx.stroke(); ctx.restore();
    }
    // thin material road: dark rim + slate body + lighter centre sheen + accent rail. ALL layers OPAQUE, so an overdraw lands on identical pixels (no brighten/darken). Bridge decks use BUTT caps so they're cut cleanly — never a round head.
    var RIM_W = CFG.rBall * 2 + 9, BODY_W = CFG.rBall * 2 + 2, SHEEN_W = CFG.rBall * 2 - 7;
    var RIM = '#0e131c', BODY = '#2a3340', SHEEN = '#3b4553', BODY_UNDER = '#161c25';
    function roadLayers(stroke, accent) { stroke(RIM_W, RIM); stroke(BODY_W, BODY); stroke(SHEEN_W, SHEEN); stroke(3, accent); }
    function roadStroke(path, accent) {   // the whole continuous road, drawn once as the base
        roadLayers(function (w, st) { strokeAll(path, w, st, 1); }, accent);
    }
    function tintUnderground(path, s0, s1, accent) {   // the UNDERGROUND stretch keeps a clear colour difference (darker body) so you can tell it's below-grade; the ball over it is drawn semi-transparent. BUTT caps = a clean "tunnel mouth".
        ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
        ctx.strokeStyle = BODY_UNDER; ctx.lineWidth = BODY_W; strokeArcRange(path, s0, s1);
        ctx.strokeStyle = accent; ctx.lineWidth = 3; strokeArcRange(path, s0, s1);
        ctx.restore();
    }
    function otherPassArc(path, P, cu) {   // at a self-crossing, find the OTHER pass's arc-length (the strand that shares point P but is far away in arc from cu)
        var best = -1, bd = Infinity;
        for (var p = 0; p < path.pts.length; p++) { if (Math.abs(path.arc[p] - cu) < CFG.D * 2) continue; var dx = path.pts[p].x - P.x, dy = path.pts[p].y - P.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = path.arc[p]; } }
        return bd < CFG.rBall * CFG.rBall ? best : -1;
    }
    function drawBridge(path, co, wb, accent) {   // the UPPER strand laid across the crossing as a deck: EXACT same opaque layers/widths as the base road (⇒ invisible overdraw on the upper strand) with BUTT (cleanly-cut) ends. Only its coverage of the lower strand + the semi-transparent ball shows = the overpass; the ball is occluded exactly at the true road width (no faked widening).
        var s0 = co - wb, s1 = co + wb;
        ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
        roadLayers(function (w, st) { ctx.strokeStyle = st; ctx.lineWidth = w; strokeArcRange(path, s0, s1); }, accent);
        ctx.restore();
    }
    var lastT = 0;
    function render() {
        if (!ctx || !lanes || !cannon || !R) return;
        var now = performance.now() / 1000, dt = lastT ? Math.min(0.05, now - lastT) : 1 / 60; lastT = now;
        var ease = 1 - Math.exp(-dt * CFG.smooth), pr = 7 + Math.sin(now * 4) * 1.5, L, qi, j, p, pt;
        ctx.fillStyle = R.field.bg; ctx.fillRect(0, 0, CW, CH);
        for (L = 0; L < lanes.length; L++) {
            var lane = lanes[L], path = lane.path, qs = lane.qs, hasU = path.under && path.under.length, accent = (R.field.accent2 && L > 0) ? R.field.accent2 : R.field.accent;   // a multi-lane field (Twin) can tint its arms differently
            roadStroke(path, accent);                                   // (1) continuous base road
            if (hasU) for (var ut = 0; ut < path.under.length; ut++) tintUnderground(path, path.under[ut][0], path.under[ut][1], accent);   // (2) darken the underground stretches (clear colour difference)
            for (qi = 0; qi < qs.length; qi++) { var q = qs[qi]; for (j = 0; j < q.vals.length; j++) { var b = q.vals[j], sB = q.head + j * CFG.D, lp = posAt(path, sB); b.rx += (lp.x - b.rx) * ease; b.ry += (lp.y - b.ry) * ease; if (buriedS(path, sB)) { ctx.globalAlpha = 0.42; drawBall(b.rx, b.ry, b.v, CFG.rBall * (1 + (b.pop || 0) * 0.35)); ctx.globalAlpha = 1; } } }   // (3) ease every ball; underground ones drawn semi-transparent (not hidden)
            if (hasU) for (var ub = 0; ub < path.under.length; ub++) { var b0 = path.under[ub][0], b1 = path.under[ub][1]; if (b1 - b0 <= CFG.D * 3) { var cu = (b0 + b1) / 2, P = posAt(path, cu), co = otherPassArc(path, P, cu); if (co >= 0) drawBridge(path, co, CFG.D * 1.0, accent); } }   // (4) crossings: deck the UPPER strand over → it partially covers the semi-transparent ball (tunnels get no deck, so their balls stay visible-but-dim)
            var d0 = posAt(path, 0); ctx.fillStyle = 'rgba(239,68,68,0.9)'; ctx.beginPath(); ctx.arc(d0.x, d0.y, pr, 0, 7); ctx.fill();   // (5) death core
            for (qi = 0; qi < qs.length; qi++) { var qB = qs[qi]; for (j = 0; j < qB.vals.length; j++) { var bb = qB.vals[j], sBB = qB.head + j * CFG.D; if (!buriedS(path, sBB)) drawBall(bb.rx, bb.ry, bb.v, CFG.rBall * (1 + (bb.pop || 0) * 0.35)); } }   // (6) surface balls — top
        }
        if (R.field.shape === 'duo' && lanes.length >= 2) {   // Duo interlock: redraw lane A's road + balls OVER lane B at the top-right crossing (lane B is drawn last so it already sits over at the bottom-left crossing)
            var fo = cen(R.field), h2 = R.field.half || 140, sp2 = R.field.sep || 50, la = lanes[0], coA = nearestS(la.path, fo.x + h2 - sp2, fo.y + sp2 - h2);
            drawBridge(la.path, coA, CFG.D * 1.0, R.field.accent);
            var qa = la.qs; for (qi = 0; qi < qa.length; qi++) { var qc = qa[qi]; for (j = 0; j < qc.vals.length; j++) { var bz = qc.vals[j], sz = qc.head + j * CFG.D; if (Math.abs(sz - coA) < CFG.D * 1.8) drawBall(bz.rx, bz.ry, bz.v, CFG.rBall * (1 + (bz.pop || 0) * 0.35)); } }
        }
        for (var fi = 0; fi < fx.length; fi++) {
            var f = fx[fi], tt = f.life / f.max, al = 1 - tt; ctx.globalAlpha = al < 0 ? 0 : al;
            if (f.ring) { ctx.lineWidth = 2 + 3 * al; ctx.strokeStyle = 'hsl(' + f.h + ',90%,66%)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * tt, 0, 7); ctx.stroke(); }
            else { ctx.fillStyle = 'hsl(' + f.h + ',90%,66%)'; ctx.beginPath(); ctx.arc(f.x, f.y, 1 + 3 * al, 0, 7); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
        for (var si = 0; si < shots.length; si++) { var sh = shots[si]; drawBall(sh.x, sh.y, sh.v, CFG.rBall); }   // shot/loaded/next balls all use the same size as the queued balls
        ctx.save(); ctx.translate(CAN.x, CAN.y); ctx.rotate(cannon.aim); ctx.fillStyle = '#334155'; ctx.fillRect(0, -5, 30, 10); ctx.restore();
        drawChip(CAN.x + Math.cos(cannon.aim) * 30, CAN.y + Math.sin(cannon.aim) * 30, cannon.cur, CFG.rBall);   // loaded ball = full size
        ctx.beginPath(); ctx.arc(CAN.x, CAN.y, CFG.rBall * 0.8 + 5, 0, 7); ctx.fillStyle = '#1e293b'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#64748b'; ctx.stroke();
        drawChip(CAN.x, CAN.y, cannon.next, CFG.rBall * 0.8);   // next ball a bit smaller → reads as a preview
    }
    function drawChip(x, y, v, r) { drawBall(x, y, v, r); }   // cannon's loaded / next ball — identical to a queued ball
    function syncHud() { var sc = $('score'); if (sc) sc.textContent = AC.format.score(score); }

    // ---------------- input ----------------
    function aimTo(clientX, clientY) {
        var r = canvas.getBoundingClientRect();
        var x = (clientX - r.left) / r.width * CW, y = (clientY - r.top) / r.height * CH;
        cannon.aim = Math.atan2(y - CAN.y, x - CAN.x);
    }

    // ---------------- selection panel (modes / level grid / endless pickers / paused) ----------------
    function persist() { try { if (AC.prefs) AC.prefs.set('prime-zuma', { mode: mode, diff: endlessSel.diff, field: endlessSel.fieldIdx }); } catch (e) { /* ignore */ } }
    function showPanel() { var o = $('pz-panel'); if (o) { renderPanel(); o.hidden = false; } }
    function hidePanel() { var o = $('pz-panel'); if (o) o.hidden = true; }
    function optBtn(label, active, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = 'pz-opt' + (active ? ' active' : ''); b.textContent = label; b.addEventListener('click', fn); return b; }
    var fbCache = {};
    function fbOf(fi) { return fbCache[fi] || (fbCache[fi] = buildField(DATA.FIELDS[fi])); }   // built field cached for the picker thumbnails
    function fieldThumb(fi, size) {   // a mini preview of a field's path(s) — used instead of a text name
        var f = DATA.FIELDS[fi], built = fbOf(fi), c = document.createElement('canvas');
        c.width = size * DPR; c.height = size * DPR; c.style.width = size + 'px'; c.style.height = size + 'px'; c.style.display = 'block';
        var g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
        g.fillStyle = f.bg; g.fillRect(0, 0, size, size);
        var sc = size / CW; g.lineCap = 'round'; g.lineJoin = 'round';
        for (var L = 0; L < built.paths.length; L++) {
            var path = built.paths[L], acc = (f.accent2 && L > 0) ? f.accent2 : f.accent;
            g.strokeStyle = acc; g.lineWidth = Math.max(2.5, (CFG.rBall * 2 + 9) * sc);
            g.beginPath(); for (var p = 0; p < path.pts.length; p++) { var pt = path.pts[p]; if (p === 0) g.moveTo(pt.x * sc, pt.y * sc); else g.lineTo(pt.x * sc, pt.y * sc); } g.stroke();
        }
        var d0 = posAt(built.paths[0], 0); g.fillStyle = '#ef4444'; g.beginPath(); g.arc(d0.x * sc, d0.y * sc, Math.max(2, 4 * sc), 0, 7); g.fill();
        return c;
    }
    function thumbBtn(fi, active, fn) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'pz-opt pz-thumb' + (active ? ' active' : '');
        b.style.padding = '4px'; b.style.lineHeight = '0'; b.title = DATA.FIELDS[fi].name || ''; b.setAttribute('aria-label', b.title);
        b.appendChild(fieldThumb(fi, 42)); b.addEventListener('click', fn); return b;
    }
    function renderPanel() {
        var card = $('pz-card'); if (!card) return;
        card.innerHTML = '';
        if (paused) {
            var ph = document.createElement('div'); ph.className = 'pz-title'; ph.textContent = t('paused'); card.appendChild(ph);
            var rb = document.createElement('button'); rb.type = 'button'; rb.className = 'btn btn-primary'; rb.textContent = t('resume'); rb.addEventListener('click', function () { shell.resume(); }); card.appendChild(rb);
            return;
        }
        if (lastResult) { var r = document.createElement('div'); r.className = 'pz-result' + (lastResult.win ? ' win' : ''); r.textContent = (lastResult.win ? t('pzClear') : t('pzFailed')) + '  ·  ' + t('pzScore') + ' ' + AC.format.score(lastResult.score); card.appendChild(r); }
        var title = document.createElement('div'); title.className = 'pz-title'; title.textContent = mode === 'level' ? t('pzPickLevel') : t('pzEndless'); card.appendChild(title);
        if (mode === 'level') {
            for (var w = 1; w <= 4; w++) {
                var row = document.createElement('div'); row.className = 'pz-row';
                for (var f = 0; f < DATA.X; f++) (function (w, f) { var b = document.createElement('button'); b.type = 'button'; b.className = 'pz-lvl'; b.textContent = w + '-' + (f + 1); b.addEventListener('click', function () { AC.audio.unlock(); startLevel(w, f); }); row.appendChild(b); })(w, f);
                card.appendChild(row);
            }
        } else {
            var dr = document.createElement('div'); dr.className = 'pz-row';
            ['easy', 'normal', 'hard'].forEach(function (d) { dr.appendChild(optBtn(t(d === 'easy' ? 'pzEasy' : d === 'normal' ? 'pzNormal' : 'pzHard'), endlessSel.diff === d, function () { endlessSel.diff = d; persist(); renderPanel(); })); });
            card.appendChild(dr);
            var fr = document.createElement('div'); fr.className = 'pz-row pz-thumbs';
            for (var fi = 0; fi < DATA.X; fi++) (function (fi) { fr.appendChild(thumbBtn(fi, endlessSel.fieldIdx === fi, function () { endlessSel.fieldIdx = fi; persist(); renderPanel(); })); })(fi);
            card.appendChild(fr);
            var go = document.createElement('button'); go.type = 'button'; go.className = 'btn btn-primary'; go.textContent = t('play'); go.addEventListener('click', function () { AC.audio.unlock(); startEndless(); }); card.appendChild(go);
        }
    }
    function startLevel(w, f) { sel = { world: w, fieldIdx: f }; pending = { kind: 'level', world: w, fieldIdx: f }; lastResult = null; paused = false; newGame(); hidePanel(); shell.start(); }
    function startEndless() { pending = { kind: 'endless', diff: endlessSel.diff, fieldIdx: endlessSel.fieldIdx }; lastResult = null; paused = false; newGame(); hidePanel(); shell.start(); }
    function syncModeSeg() {
        var seg = $('mode-seg'); if (!seg) return;
        var bs = seg.querySelectorAll('button[data-mode]');
        for (var i = 0; i < bs.length; i++) { var on = bs[i].getAttribute('data-mode') === mode; bs[i].classList.toggle('active', on); bs[i].setAttribute('aria-checked', on ? 'true' : 'false'); }
    }

    // ---------------- boot ----------------
    function boot() {
        canvas = $('stage'); canvas.width = CW * DPR; canvas.height = CH * DPR;
        ctx = canvas.getContext('2d'); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

        var surface = document.querySelector('.stage-pad') || canvas;
        window.addEventListener('pointermove', function (e) { if (!over && cannon) aimTo(e.clientX, e.clientY); });
        surface.addEventListener('pointerdown', function (e) {
            if (e.target && e.target.closest && e.target.closest('.overlay, button, a')) return;
            e.preventDefault(); AC.audio.unlock();
            if (shell.isPlaying() && !over) { aimTo(e.clientX, e.clientY); shoot(); }
        }, { passive: false });
        window.addEventListener('keydown', function (e) { if ((e.key === ' ') && shell.isPlaying() && !over) { e.preventDefault(); shoot(); } });

        try { var sv = AC.prefs && AC.prefs.get('prime-zuma'); if (sv) { if (sv.mode === 'level' || sv.mode === 'endless') mode = sv.mode; if (DATA.ENDLESS[sv.diff]) endlessSel.diff = sv.diff; if (sv.field >= 0 && sv.field < DATA.X) endlessSel.fieldIdx = sv.field; } } catch (e) { /* defaults */ }

        shell = AC.shell.create({
            gameId: 'prime-zuma', step: 1 / 60, preventKeys: ['Space'],
            mode: function () { return mode === 'level' ? ('L' + sel.world + '-' + (sel.fieldIdx + 1)) : ('E-' + endlessSel.diff); },
            update: update, render: render,
            reset: newGame,
            restartToReady: true,
            onPause: function () { paused = true; showPanel(); },
            onResume: function () { paused = false; hidePanel(); },
            onGameOver: function (result) { paused = false; lastResult = { win: !!(result && result.win), score: result ? result.score : score }; showPanel(); },
        });

        var seg = $('mode-seg');
        if (seg) seg.addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('button[data-mode]') : null; if (b) { AC.audio.unlock(); mode = b.getAttribute('data-mode'); persist(); syncModeSeg(); if (!shell.isPlaying()) showPanel(); } });
        syncModeSeg();
        var rb = $('restart-btn'); if (rb) rb.addEventListener('click', function () { paused = false; setTimeout(function () { if (!shell.isPlaying()) showPanel(); }, 0); });

        AC.i18n.subscribe(function () { if (!shell.isPlaying()) { renderPanel(); shell.refreshOverlay && shell.refreshOverlay(); } });
        pending = mode === 'level' ? { kind: 'level', world: 1, fieldIdx: 0 } : { kind: 'endless', diff: endlessSel.diff, fieldIdx: endlessSel.fieldIdx };
        newGame(); shell.refreshBest && shell.refreshBest(); render(); showPanel();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
