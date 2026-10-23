/* Prime Zuma — a prime-factorisation spin on Zuma (WIP).
 *
 * A turret in the CENTRE spits PRIME balls into a chain spiralling inward toward a death core.
 * A shot prime p peels one factor of p off every ball in a contiguous run divisible by p (run >= k);
 * balls that hit 1 pop. Gaps split the chain; facing ends that share a factor attract & crash
 * (same prime → chains another peel; otherwise merge with an inertia nudge).
 *
 * Modes: 一般/Levels (pick a level on a grid; clear a FINITE chain to win) and 無盡/Endless (survive;
 * everything ramps with time). Field (spiral geometry + theme) and per-level difficulty live in the
 * data file prime-zuma-levels.js. FEEL knobs live in CFG. */
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
            pzReady: 'Prime Zuma',
            pzIntro: 'Fire prime balls into the chain. A prime peels a factor off a matching run (3+) — balls that hit 1 pop.',
            pzStartHintHtml: 'Aim with the mouse / your finger · tap or click to shoot.',
            pzHelp1Html: 'A turret in the centre shoots <strong>prime</strong> balls; the chain spirals inward and you lose if it reaches the <strong>core</strong>.',
            pzHelp2Html: 'A shot prime <strong>p</strong> divides every ball in a contiguous run divisible by p (length <strong>3+</strong>) by p — any that become 1 are removed.',
            pzHelp3Html: '<strong>Levels</strong>: clear a finite chain to win. <strong>Endless</strong>: survive as it ramps up. <kbd>P</kbd> pause · <kbd>R</kbd> restart.',
        },
        zh: {
            pzName: '質因數祖瑪', pzScore: '分數',
            pzLevelMode: '一般', pzEndless: '無盡', pzEasy: '簡單', pzNormal: '普通', pzHard: '困難',
            pzPickLevel: '選擇關卡', pzClear: '過關！', pzFailed: '失敗',
            pzReady: '質因數祖瑪',
            pzIntro: '朝球鏈發射質數球。質數會把一段「可被它整除」的連續球鏈（3 顆以上）各除以它一次，變成 1 的球就消除。',
            pzStartHintHtml: '用滑鼠／手指瞄準 · 點擊或輕觸發射。',
            pzHelp1Html: '中央砲台發射<strong>質數</strong>球；球鏈往內盤旋，抵達<strong>核心</strong>就輸了。',
            pzHelp2Html: '射出的質數 <strong>p</strong> 會把一段可被 p 整除的連續球鏈（<strong>3 顆以上</strong>）全部除以 p，變成 1 的球消除。',
            pzHelp3Html: '<strong>一般</strong>：清光有限球鏈即過關。<strong>無盡</strong>：撐著,難度隨時間升高。<kbd>P</kbd> 暫停 · <kbd>R</kbd> 重來。',
        },
    };
    Object.assign(AC.i18n.STRINGS.en, STRINGS.en);
    Object.assign(AC.i18n.STRINGS.zh, STRINGS.zh);

    // ---------------- config (FEEL knobs; geometry/difficulty are in the data file) ----------------
    var CFG = {
        D: 27, rBall: 12.5,                       // chain spacing (arc px) + ball draw radius (px)
        vRetreat: 180, impulse: 70, impDecay: 7,  // magnet-retreat speed / inertia impulse + decay (/s); feed speed comes from the level/endless
        k: 3,                                     // run length (incl. shot) needed to eliminate
        cannonFloor: 1.5,                         // baseline weight every active prime keeps regardless of board demand
        shotSpeed: 480,                           // projectile speed (px/s)
        insertPush: 'front',                      // insertion makes room by shoving the FRONT toward death (back untouched)
        startLen: 5,                              // balls pre-seeded at the source
        smooth: 16,                               // render-easing rate (balls lerp to logical spots → smooth slides/accel)
        compositeColor: '#4b5a70',                // all composite balls share ONE calm colour; only primes are colourful
    };
    var CW = 460, CH = 460, CX = CW / 2, CY = CH / 2, DPR = Math.min(window.devicePixelRatio || 1, 2);

    // ---------------- path (arc-length table + cannon), rebuilt per field ----------------
    // A field's `shape` generates a polyline from DEATH (pts[0]) to SOURCE (last) plus the cannon position.
    // Everything else (movement, shooting, render) works off that polyline, so new shapes are just new generators.
    var PATH = null, CAN = { x: CX, y: CY };
    function genSpiral(f) {
        var steps = 2400, thetaMax = f.turns * 2 * Math.PI, pts = [];
        for (var i = 0; i <= steps; i++) { var th = thetaMax * i / steps, r = f.Rin + (f.Rout - f.Rin) * (th / thetaMax); pts.push({ x: CX + r * Math.cos(th), y: CY + r * Math.sin(th) }); }
        return { pts: pts, cannon: { x: CX, y: CY } };   // pts[0] = innermost = death
    }
    function genSquare(f) {   // same spiral but each ring is a SQUARE (Chebyshev radius) → angular, boxy look
        var steps = 2600, thetaMax = f.turns * 2 * Math.PI, pts = [];
        for (var i = 0; i <= steps; i++) { var th = thetaMax * i / steps, r = f.Rin + (f.Rout - f.Rin) * (th / thetaMax), c = Math.cos(th), s = Math.sin(th), sq = 1 / Math.max(Math.abs(c), Math.abs(s), 1e-4); pts.push({ x: CX + r * c * sq, y: CY + r * s * sq }); }
        return { pts: pts, cannon: { x: CX, y: CY } };
    }
    function genSnake(f) {   // horizontal serpentine, source at TOP, death at BOTTOM, cannon at bottom-centre
        var m = 34, x0 = m, x1 = CW - m, yTop = m, yBot = CH - 66, rows = f.rows || 7, gap = (yBot - yTop) / (rows - 1), seg = 7, pts = [], r, k, steps;
        for (r = 0; r < rows; r++) {                     // build source(top)→death(bottom), then reverse
            var y = yTop + r * gap, ltr = (r % 2 === 0), xa = ltr ? x0 : x1, xb = ltr ? x1 : x0;
            steps = Math.max(2, Math.round(Math.abs(xb - xa) / seg));
            for (k = 0; k <= steps; k++) pts.push({ x: xa + (xb - xa) * k / steps, y: y });
            if (r < rows - 1) { var ny = y + gap, vs = Math.max(2, Math.round(gap / seg)); for (k = 1; k <= vs; k++) pts.push({ x: xb, y: y + (ny - y) * k / vs }); }
        }
        pts.reverse();
        return { pts: pts, cannon: { x: CX, y: Math.min(CH - 16, yBot + 40) } };
    }
    function buildPath(field) {
        var raw = field.shape === 'square' ? genSquare(field) : field.shape === 'snake' ? genSnake(field) : genSpiral(field);
        var pts = raw.pts, arc = [0], total = 0;
        for (var i = 1; i < pts.length; i++) { total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); arc.push(total); }
        return { pts: pts, arc: arc, len: total, cannon: raw.cannon };
    }
    function posAt(s) {
        s = s < 0 ? 0 : s > PATH.len ? PATH.len : s;
        var a = PATH.arc, lo = 0, hi = a.length - 1;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (a[mid] < s) lo = mid + 1; else hi = mid; }
        var i = lo > 0 ? lo - 1 : 0, seg = (a[i + 1] - a[i]) || 1, f = (s - a[i]) / seg;
        var p0 = PATH.pts[i], p1 = PATH.pts[i + 1] || p0;
        return { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f };
    }
    function nearestS(x, y) {
        var best = 0, bd = Infinity;
        for (var i = 0; i < PATH.pts.length; i += 2) { var p = PATH.pts[i], dx = p.x - x, dy = p.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = PATH.arc[i]; } }
        return best;
    }

    // ---------------- rng + number helpers ----------------
    var rngState = 1;
    function rng() { rngState = (rngState + 0x6D2B79F5) | 0; var x = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }
    function isPrime(v) { if (v < 2) return false; for (var i = 2; i * i <= v; i++) if (v % i === 0) return false; return true; }
    function gcd(a, b) { a = a < 0 ? -a : a; b = b < 0 ? -b : b; while (b) { var m = a % b; a = b; b = m; } return a; }
    function activePrimes() { return R.full.slice(0, R.activeN); }
    function pickCannonPrime() {   // next prime weighted by the board's live factor DEMAND (+ floor) → shots match what the chain needs
        var n = R.activeN, dem = [], i, j, pi, total = 0;
        for (i = 0; i < n; i++) dem[i] = CFG.cannonFloor;
        if (queues) for (i = 0; i < queues.length; i++) { var vals = queues[i].vals; for (j = 0; j < vals.length; j++) { var v = vals[j].v; for (pi = 0; pi < n; pi++) { var p = R.full[pi], m = v; while (m % p === 0) { m /= p; dem[pi]++; } } } }
        for (i = 0; i < n; i++) total += dem[i];
        var r = rng() * total;
        for (i = 0; i < n; i++) if ((r -= dem[i]) <= 0) return R.full[i];
        return R.full[n - 1];
    }
    function rebuildCandidates() {   // every P-smooth number in [2, cap] with Ω <= maxOmega, + its Ω
        var primes = activePrimes(), list = [];
        for (var n = 2; n <= R.cap; n++) {
            var m = n, omega = 0;
            for (var i = 0; i < primes.length; i++) { var p = primes[i]; while (m % p === 0) { m /= p; omega++; } }
            if (m === 1 && omega <= R.maxOmega) list.push({ v: n, w: omega });
        }
        R.candidates = list.length ? list : [{ v: 2, w: 1 }];
    }
    function spawnValue() {   // weighted pick: bias^Ω (bias<1 favours simple, 1 = uniform, >1 complex)
        var list = R.candidates, bias = R.bias, sum = 0, i, wt;
        if (!list || !list.length) return 2;   // safety: never read an empty list

        for (i = 0; i < list.length; i++) sum += Math.pow(bias, list[i].w);
        var r = rng() * sum;
        for (i = 0; i < list.length; i++) { wt = Math.pow(bias, list[i].w); if ((r -= wt) <= 0) return list[i].v; }
        return list[list.length - 1].v;
    }
    function updateProgression() {   // ENDLESS only: elapsed time ramps cap / feed / bias / Ω / prime-set
        var d = R.e, T = frame / 60, prog = Math.min(1, T / d.ramp);
        var activeN = Math.min(d.primes.length, 3 + (isFinite(d.unlockEvery) ? Math.floor(T / d.unlockEvery) : 0));
        var cap = Math.round(d.capA + (d.capB - d.capA) * prog);
        var maxOmega = Math.round(d.omegaA + (d.omegaB - d.omegaA) * prog);
        R.bias = d.biasA + (d.biasB - d.biasA) * prog;
        R.feed = d.feedA + (d.feedB - d.feedA) * prog;
        if (activeN !== R.activeN || cap !== R.cap || maxOmega !== R.maxOmega) { R.activeN = activeN; R.cap = cap; R.maxOmega = maxOmega; rebuildCandidates(); }
    }

    // ---------------- state ----------------
    var canvas, ctx, shell, queues, shots, cannon, score, over, fx, frame, combo, lastElimFrame, R;
    var mode = 'level', sel = { world: 1, fieldIdx: 0 }, endlessSel = { diff: 'easy', fieldIdx: 0 }, pending = null, lastResult = null;
    function makeBall(v, x, y) { return { v: v, rx: x, ry: y, pop: 0 }; }   // v=value · rx/ry=rendered pos · pop=divide pulse

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
            var e = DATA.ENDLESS[p.diff] || DATA.ENDLESS.easy; field = DATA.FIELDS[p.fieldIdx] || DATA.FIELDS[0];
            R = { isLevel: false, field: field, e: e, full: e.primes, activeN: 3, cap: e.capA, maxOmega: e.omegaA, bias: e.biasA, feed: e.feedA, quota: Infinity, spawned: 0, candidates: [] };
        }
        PATH = buildPath(field); CAN = PATH.cannon;
        frame = 0; combo = 0; lastElimFrame = -999;
        rebuildCandidates();                                      // always build the initial candidate set (endless then ramps it in update)
        shots = []; fx = []; score = 0; over = false;
        var seedN = Math.min(CFG.startLen, R.quota), head = PATH.len - seedN * CFG.D, vals = [];
        for (var i = 0; i < seedN; i++) { var pos = posAt(head + i * CFG.D); vals.push(makeBall(spawnValue(), pos.x, pos.y)); }
        queues = seedN ? [{ vals: vals, head: head, imp: 0 }] : [];
        R.spawned = seedN;
        cannon = { aim: -Math.PI / 2, cur: pickCannonPrime(), next: pickCannonPrime() };
        syncHud();
    }

    // ---------------- particles ----------------
    function burst(x, y, h) {
        fx.push({ x: x, y: y, r0: CFG.rBall * 0.5, r1: CFG.rBall * 2.6, life: 0, max: 0.34, h: h, ring: true });
        for (var i = 0; i < 7; i++) { var a = (i / 7) * Math.PI * 2 + rng() * 0.7, sp = 70 + rng() * 110; fx.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.4 + rng() * 0.25, h: h }); }
    }
    function updateFx(dt) {
        for (var i = fx.length - 1; i >= 0; i--) {
            var f = fx[i]; f.life += dt;
            if (!f.ring) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.88; f.vy *= 0.88; }
            if (f.life >= f.max) fx.splice(i, 1);
        }
    }

    // ---------------- elimination ----------------
    function regroup(items) {
        var out = [], cur = null;
        for (var i = 0; i < items.length; i++) {
            if (cur && Math.abs(items[i].s - (cur.head + cur.vals.length * CFG.D)) <= CFG.D * 0.5) cur.vals.push(items[i].b);
            else { if (cur) out.push(cur); cur = { vals: [items[i].b], head: items[i].s, imp: 0 }; }
        }
        if (cur) out.push(cur);
        return out;
    }
    function tryEliminate(q, idx, p) {
        if (!q || q.vals[idx].v % p !== 0) return false;
        var lo = idx, hi = idx;
        while (lo - 1 >= 0 && q.vals[lo - 1].v % p === 0) lo--;
        while (hi + 1 < q.vals.length && q.vals[hi + 1].v % p === 0) hi++;
        if (hi - lo + 1 < CFG.k) return false;
        var items = [], cleared = 0;
        for (var j = 0; j < q.vals.length; j++) {
            var b = q.vals[j], sPos = q.head + j * CFG.D;
            if (j >= lo && j <= hi) {
                b.v = b.v / p;
                if (b.v === 1) { burst(b.rx, b.ry, hue(p)); cleared++; continue; }
                b.pop = 1;
            }
            items.push({ s: sPos, b: b });
        }
        score += cleared * 10 + (hi - lo + 1);
        combo = (frame - lastElimFrame <= 42) ? combo + 1 : 1; lastElimFrame = frame;
        sfxPop(combo);
        var at = queues.indexOf(q);
        if (at >= 0) { var groups = regroup(items); queues.splice.apply(queues, [at, 1].concat(groups)); }
        return true;
    }

    // ---------------- collisions ----------------
    function resolveCollisions() {
        var crashes = 0;
        for (var guard = 0; guard < 200; guard++) {
            var merged = false;
            for (var i = 0; i < queues.length - 1; i++) {
                var f = queues[i], b = queues[i + 1];
                if (gapBetween(f, b) < -0.01) {
                    var a = f.vals[f.vals.length - 1].v, c = b.vals[0].v, junction = f.vals.length - 1;
                    var frontFed = (b.vel || 0) < 0 && (f.vel || 0) <= 0;
                    var retreating = (f.vel || 0) > 0;
                    var mq = { vals: f.vals.concat(b.vals), head: frontFed ? f.head : (b.head - f.vals.length * CFG.D), imp: 0 };
                    queues.splice(i, 2, mq);
                    if (retreating) {
                        if (a === c && isPrime(a)) tryEliminate(mq, junction, a);
                        else { mq.imp = CFG.impulse; if (crashes < 2) { sfxCrash(); crashes++; } }
                    }
                    merged = true;
                    break;
                }
            }
            if (!merged) break;
        }
    }

    // ---------------- sound ----------------
    function sfxShoot(v) { var idx = R.full.indexOf(v); if (idx < 0) idx = 0; var f = [466, 587, 698, 880, 1047][idx % 5]; AC.audio.tone(f * 1.4, 0.07, { type: 'triangle', volume: 0.07, attack: 0.002, slideTo: f }); }
    function sfxInsert() { AC.audio.tone(300, 0.05, { type: 'triangle', volume: 0.06, attack: 0.002, slideTo: 215 }); }
    function sfxCrash() { AC.audio.tone(170, 0.09, { type: 'triangle', volume: 0.08, attack: 0.002, slideTo: 115 }); AC.audio.noise(0.05, { volume: 0.035, filter: { type: 'lowpass', freq: 760 } }); }
    function sfxPop(n) {
        var f = 523.25 * Math.pow(2, Math.min(n - 1, 12) / 12);
        AC.audio.tone(f, 0.16, { type: 'sine', volume: 0.12, attack: 0.003, slideTo: f * 1.5 });
        AC.audio.tone(f * 2, 0.11, { type: 'triangle', volume: 0.045, attack: 0.002 });
        AC.audio.noise(0.06, { volume: 0.045, filter: { type: 'bandpass', freq: 2600 } });
    }

    // ---------------- shooting / insertion ----------------
    function shoot() {
        var mx = CAN.x + Math.cos(cannon.aim) * 24, my = CAN.y + Math.sin(cannon.aim) * 24, fired = cannon.cur;
        shots.push({ x: mx, y: my, vx: Math.cos(cannon.aim) * CFG.shotSpeed, vy: Math.sin(cannon.aim) * CFG.shotSpeed, v: fired });
        cannon.cur = cannon.next; cannon.next = pickCannonPrime();
        sfxShoot(fired);
    }
    function nearestBall(x, y) {
        var best = null, bd = Infinity;
        for (var qi = 0; qi < queues.length; qi++) { var q = queues[qi]; for (var j = 0; j < q.vals.length; j++) { var b = q.vals[j], dx = b.rx - x, dy = b.ry - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { q: q, j: j, s: q.head + j * CFG.D }; } } }
        if (best) best.dist = Math.sqrt(bd);
        return best;
    }
    function insertShot(shot, hit) {
        var q = hit.q, shotS = nearestS(shot.x, shot.y), j = shotS < hit.s ? hit.j : hit.j + 1;
        q.vals.splice(j, 0, makeBall(shot.v, shot.x, shot.y));
        if (CFG.insertPush === 'front') q.head -= CFG.D;
        if (!tryEliminate(q, j, shot.v)) sfxInsert();
    }

    // ---------------- main loop ----------------
    function update() {
        if (over || !queues) return;
        frame++;
        if (!R.isLevel) updateProgression();
        // 1) feed one ball from the source (level mode stops once its quota is reached)
        var lastQ = queues.length ? queues[queues.length - 1] : null;
        var canFeed = R.isLevel ? (R.spawned < R.quota) : true;
        if (canFeed && (!lastQ || backEndS(lastQ) <= PATH.len - CFG.D)) {
            if (lastQ && PATH.len - backEndS(lastQ) <= CFG.D + 0.5) { var pe = posAt(backEndS(lastQ) + CFG.D); lastQ.vals.push(makeBall(spawnValue(), pe.x, pe.y)); }
            else { var ps = posAt(PATH.len); queues.push({ vals: [makeBall(spawnValue(), ps.x, ps.y)], head: PATH.len, imp: 0 }); }
            R.spawned++;
        }
        var dt = 1 / 60, i, q;
        // 2) velocities + motion
        for (i = 0; i < queues.length; i++) {
            q = queues[i]; var v = 0;
            if (i === queues.length - 1) v = -R.feed;
            else if (gcd(q.vals[q.vals.length - 1].v, queues[i + 1].vals[0].v) > 1) v = CFG.vRetreat;
            q.vel = v + (q.imp || 0);
            q.imp = (q.imp || 0) * Math.max(0, 1 - CFG.impDecay * dt);
            if (Math.abs(q.imp) < 1) q.imp = 0;
        }
        for (i = 0; i < queues.length; i++) queues[i].head += queues[i].vel * dt;
        resolveCollisions();
        // 3) projectiles
        for (i = shots.length - 1; i >= 0; i--) {
            var s = shots[i]; s.x += s.vx * dt; s.y += s.vy * dt;
            if (s.x < -30 || s.x > CW + 30 || s.y < -30 || s.y > CH + 30) { shots.splice(i, 1); continue; }   // left the field (works for any shape/cannon)
            var hit = nearestBall(s.x, s.y);
            if (hit && hit.dist < CFG.rBall * 1.9) { insertShot(s, hit); shots.splice(i, 1); }
        }
        resolveCollisions();
        // 4) prune, pulses, particles, win/lose
        for (i = queues.length - 1; i >= 0; i--) if (!queues[i].vals.length) queues.splice(i, 1);
        for (i = 0; i < queues.length; i++) { var vv = queues[i].vals; for (var jj = 0; jj < vv.length; jj++) if (vv[jj].pop > 0) vv[jj].pop = Math.max(0, vv[jj].pop - dt * 6); }
        updateFx(dt);
        if (!over && R.isLevel && R.spawned >= R.quota && queues.length === 0) { over = true; shell.gameOver({ score: score, win: true, meta: { level: sel.world + '-' + (sel.fieldIdx + 1) } }); }
        else if (!over && queues.length && queues[0].head <= 0) { over = true; shell.gameOver({ score: score, win: false }); }
        syncHud();
    }

    // ---------------- render ----------------
    function hue(v) { return (v * 47) % 360; }
    function drawBall(x, y, v, r) {
        var prime = isPrime(v);
        if (prime) {
            var h = hue(v);
            ctx.save(); ctx.shadowColor = 'hsl(' + h + ',95%,62%)'; ctx.shadowBlur = 11;
            ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = 'hsl(' + h + ',72%,58%)'; ctx.fill(); ctx.restore();
            ctx.lineWidth = 1.5; ctx.strokeStyle = 'hsl(' + h + ',100%,84%)'; ctx.stroke();
            ctx.fillStyle = '#0a1322';
        } else {
            ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = CFG.compositeColor; ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
            ctx.fillStyle = '#e8edf5';
        }
        ctx.font = 'bold ' + (v > 9 ? Math.round(r * 0.95) : Math.round(r * 1.2)) + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(v), x, y + 0.5);
    }
    var lastT = 0;
    function render() {
        if (!ctx || !queues || !cannon || !R) return;
        var now = performance.now() / 1000, dt = lastT ? Math.min(0.05, now - lastT) : 1 / 60; lastT = now;
        var ease = 1 - Math.exp(-dt * CFG.smooth);
        ctx.fillStyle = R.field.bg; ctx.fillRect(0, 0, CW, CH);
        // spiral guide (tinted by the field accent)
        ctx.save(); ctx.globalAlpha = 0.16; ctx.strokeStyle = R.field.accent; ctx.lineWidth = CFG.rBall * 2 + 3; ctx.lineCap = 'round'; ctx.beginPath();
        for (var p = 0; p < PATH.pts.length; p += 3) { var pt = PATH.pts[p]; if (p === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); }
        ctx.stroke(); ctx.restore();
        var d0 = posAt(0), pr = 7 + Math.sin(now * 4) * 1.5;
        ctx.fillStyle = 'rgba(239,68,68,0.9)'; ctx.beginPath(); ctx.arc(d0.x, d0.y, pr, 0, 7); ctx.fill();
        for (var qi = 0; qi < queues.length; qi++) {
            var q = queues[qi];
            for (var j = 0; j < q.vals.length; j++) {
                var b = q.vals[j], lp = posAt(q.head + j * CFG.D);
                b.rx += (lp.x - b.rx) * ease; b.ry += (lp.y - b.ry) * ease;
                drawBall(b.rx, b.ry, b.v, CFG.rBall * (1 + (b.pop || 0) * 0.35));
            }
        }
        for (var fi = 0; fi < fx.length; fi++) {
            var f = fx[fi], tt = f.life / f.max, al = 1 - tt; ctx.globalAlpha = al < 0 ? 0 : al;
            if (f.ring) { ctx.lineWidth = 2 + 3 * al; ctx.strokeStyle = 'hsl(' + f.h + ',90%,66%)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * tt, 0, 7); ctx.stroke(); }
            else { ctx.fillStyle = 'hsl(' + f.h + ',90%,66%)'; ctx.beginPath(); ctx.arc(f.x, f.y, 1 + 3 * al, 0, 7); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
        for (var si = 0; si < shots.length; si++) { var s = shots[si]; drawBall(s.x, s.y, s.v, CFG.rBall * 0.9); }
        ctx.save(); ctx.translate(CAN.x, CAN.y); ctx.rotate(cannon.aim); ctx.fillStyle = '#334155'; ctx.fillRect(0, -5, 30, 10); ctx.restore();
        drawChip(CAN.x + Math.cos(cannon.aim) * 30, CAN.y + Math.sin(cannon.aim) * 30, cannon.cur, 12);
        ctx.beginPath(); ctx.arc(CAN.x, CAN.y, 17, 0, 7); ctx.fillStyle = '#1e293b'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#64748b'; ctx.stroke();
        drawChip(CAN.x, CAN.y, cannon.next, 10);
    }
    function drawChip(x, y, v, r) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = 'hsl(' + hue(v) + ',75%,58%)'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#0a1322'; ctx.font = 'bold 15px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(v), x, y + 0.5);
    }
    function syncHud() { var sc = $('score'); if (sc) sc.textContent = String(score); }

    // ---------------- input ----------------
    function aimTo(clientX, clientY) {
        var r = canvas.getBoundingClientRect();
        var x = (clientX - r.left) / r.width * CW, y = (clientY - r.top) / r.height * CH;
        cannon.aim = Math.atan2(y - CAN.y, x - CAN.x);
    }

    // ---------------- selection panel (modes / level grid / endless pickers) ----------------
    function persist() { try { if (AC.prefs) AC.prefs.set('prime-zuma', { mode: mode, diff: endlessSel.diff, field: endlessSel.fieldIdx }); } catch (e) { /* ignore */ } }
    function showPanel() { var o = $('pz-panel'); if (o) { renderPanel(); o.hidden = false; } }
    function hidePanel() { var o = $('pz-panel'); if (o) o.hidden = true; }
    function optBtn(label, active, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = 'pz-opt' + (active ? ' active' : ''); b.textContent = label; b.addEventListener('click', fn); return b; }
    function renderPanel() {
        var card = $('pz-card'); if (!card) return;
        card.innerHTML = '';
        if (lastResult) { var rb = document.createElement('div'); rb.className = 'pz-result' + (lastResult.win ? ' win' : ''); rb.textContent = (lastResult.win ? t('pzClear') : t('pzFailed')) + '  ·  ' + t('pzScore') + ' ' + AC.format.score(lastResult.score); card.appendChild(rb); }
        var title = document.createElement('div'); title.className = 'pz-title'; title.textContent = mode === 'level' ? t('pzPickLevel') : t('pzEndless'); card.appendChild(title);
        if (mode === 'level') {
            for (var w = 1; w <= 4; w++) {
                var row = document.createElement('div'); row.className = 'pz-row';
                for (var f = 0; f < DATA.X; f++) (function (w, f) {
                    var b = document.createElement('button'); b.type = 'button'; b.className = 'pz-lvl'; b.textContent = w + '-' + (f + 1);
                    b.addEventListener('click', function () { AC.audio.unlock(); startLevel(w, f); });
                    row.appendChild(b);
                })(w, f);
                card.appendChild(row);
            }
        } else {
            var dr = document.createElement('div'); dr.className = 'pz-row';
            ['easy', 'normal', 'hard'].forEach(function (d) { dr.appendChild(optBtn(t(d === 'easy' ? 'pzEasy' : d === 'normal' ? 'pzNormal' : 'pzHard'), endlessSel.diff === d, function () { endlessSel.diff = d; persist(); renderPanel(); })); });
            card.appendChild(dr);
            var fr = document.createElement('div'); fr.className = 'pz-row';
            for (var fi = 0; fi < DATA.X; fi++) (function (fi) { fr.appendChild(optBtn(DATA.FIELDS[fi].name, endlessSel.fieldIdx === fi, function () { endlessSel.fieldIdx = fi; persist(); renderPanel(); })); })(fi);
            card.appendChild(fr);
            var go = document.createElement('button'); go.type = 'button'; go.className = 'btn btn-primary'; go.textContent = t('play'); go.addEventListener('click', function () { AC.audio.unlock(); startEndless(); }); card.appendChild(go);
        }
    }
    // build the chosen config NOW (restartToReady makes shell.start() from 'idle' skip reset, so we must), then play
    function startLevel(w, f) { sel = { world: w, fieldIdx: f }; pending = { kind: 'level', world: w, fieldIdx: f }; lastResult = null; newGame(); hidePanel(); shell.start(); }
    function startEndless() { pending = { kind: 'endless', diff: endlessSel.diff, fieldIdx: endlessSel.fieldIdx }; lastResult = null; newGame(); hidePanel(); shell.start(); }
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
            canPause: function () { return false; },     // no pause: the shell overlay it would use is hidden here
            onGameOver: function (result) { lastResult = { win: !!(result && result.win), score: result ? result.score : score }; showPanel(); },
            overlayContent: function (state) {
                if (state === 'idle') return { badge: 'coins', title: t('pzReady'), message: t('pzIntro'), button: t('play'), hint: t('pzStartHintHtml') };
                return { badge: 'coins', title: t('pzName'), message: '', button: t('restart') };
            },
        });

        var seg = $('mode-seg');
        if (seg) seg.addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('button[data-mode]') : null; if (b) { AC.audio.unlock(); mode = b.getAttribute('data-mode'); persist(); syncModeSeg(); if (!shell.isPlaying()) showPanel(); } });
        syncModeSeg();
        var rb = $('restart-btn'); if (rb) rb.addEventListener('click', function () { setTimeout(function () { if (!shell.isPlaying()) showPanel(); }, 0); });

        AC.i18n.subscribe(function () { if (!shell.isPlaying()) { renderPanel(); shell.refreshOverlay && shell.refreshOverlay(); } });
        pending = mode === 'level' ? { kind: 'level', world: 1, fieldIdx: 0 } : { kind: 'endless', diff: endlessSel.diff, fieldIdx: endlessSel.fieldIdx };
        newGame(); shell.refreshBest && shell.refreshBest(); render(); showPanel();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
