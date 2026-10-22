/* Prime Zuma — a prime-factorisation spin on Zuma (WIP prototype).
 *
 * A turret in the CENTRE spits PRIME balls into a chain that spirals inward toward a
 * death end. "Front" = toward the death end (centre); "back" = toward the source (outer).
 *
 * A shot prime p, once it lands in the chain, peels one factor of p off every ball in a
 * CONTIGUOUS run divisible by p (run length, incl. the shot, >= k) — balls that reach 1 pop.
 * Elimination leaves GAPS that split the chain into sub-queues. Only the backmost sub-queue
 * is fed/advances; the rest sit still UNLESS the facing ends across a gap are EQUAL, in which
 * case the front sub-queue slides BACK and crashes into the one behind it:
 *   • facing pair composite → they merge with a little extra backward "inertia" nudge;
 *   • facing pair prime     → an extra peel is attempted at the junction, so clears CHAIN.
 * Several of these can resolve in the same tick, so rapid-fire play can set off big chains.
 *
 * Single-player; continuous motion along an arc-length-parameterised spiral. Everything that
 * governs FEEL lives in CFG so we can tune after playing. (No win yet — endless feed.) */
(function () {
    'use strict';
    var AC = window.ArcadeCommon;
    var t = AC.i18n.t;

    // ---------------- i18n ----------------
    var STRINGS = {
        en: {
            pzName: 'Prime Zuma', pzScore: 'Score',
            pzReady: 'Prime Zuma',
            pzIntro: 'Fire prime balls into the chain. A prime peels a factor off a matching run (3+) — balls that hit 1 pop. Clear the chain before it reaches the centre.',
            pzStartHintHtml: 'Aim with the mouse / your finger · tap or click to shoot.',
            pzOverMsgHtml: 'The chain reached the core. Score <strong>{0}</strong>.',
            pzHelp1Html: 'A turret in the centre shoots <strong>prime</strong> balls; the chain spirals inward and you lose if it reaches the <strong>core</strong>.',
            pzHelp2Html: 'A shot prime <strong>p</strong> divides every ball in a contiguous run divisible by p (length <strong>3+</strong>) by p — any that become 1 are removed.',
            pzHelp3Html: 'Gaps split the chain; <strong>matching</strong> ends pull together and crash — primes can chain more clears. <kbd>P</kbd> pause · <kbd>R</kbd> restart.',
        },
        zh: {
            pzName: '質因數祖瑪', pzScore: '分數',
            pzReady: '質因數祖瑪',
            pzIntro: '朝球鏈發射質數球。質數會把一段「可被它整除」的連續球鏈（3 顆以上）各除以它一次，變成 1 的球就消除。趕在球鏈抵達中心前清掉它。',
            pzStartHintHtml: '用滑鼠／手指瞄準 · 點擊或輕觸發射。',
            pzOverMsgHtml: '球鏈抵達核心了。分數 <strong>{0}</strong>。',
            pzHelp1Html: '中央砲台發射<strong>質數</strong>球；球鏈往內盤旋，抵達<strong>核心</strong>就輸了。',
            pzHelp2Html: '射出的質數 <strong>p</strong> 會把一段可被 p 整除的連續球鏈（<strong>3 顆以上</strong>）全部除以 p，變成 1 的球消除。',
            pzHelp3Html: '消除留下的空隙會把球鏈切成數段；<strong>相同</strong>的相鄰端會互相吸引後撞——若是質數可再觸發連鎖。<kbd>P</kbd> 暫停 · <kbd>R</kbd> 重來。',
        },
    };
    Object.assign(AC.i18n.STRINGS.en, STRINGS.en);
    Object.assign(AC.i18n.STRINGS.zh, STRINGS.zh);

    // ---------------- config (all the FEEL knobs) ----------------
    var CFG = {
        turns: 3, Rin: 50, Rout: 212,            // spiral: inner (death) and outer (source) radii, px from centre
        D: 27, rBall: 12.5,                       // chain spacing (arc px) + ball draw radius (px)
        vFeed: 15, vRetreat: 180, impulse: 70, impDecay: 7,  // forward feed / magnet-retreat / inertia impulse + decay (/s)
        k: 3,                                     // run length (incl. shot) needed to eliminate
        P: [2, 3, 5], maxFactors: 3, valCap: 30,  // prime palette + spawned chain values = product of 1..maxFactors primes (<= cap)
        shotSpeed: 480,                           // projectile speed (px/s)
        insertPush: 'front',                      // where insertion makes room: 'front' = shove the front toward death (back untouched)
        startLen: 5,                              // balls pre-seeded at the source
    };
    var CW = 460, CH = 460, CX = CW / 2, CY = CH / 2, DPR = Math.min(window.devicePixelRatio || 1, 2);

    // ---------------- spiral path (arc-length table) ----------------
    var PATH = (function build() {
        var steps = 2400, thetaMax = CFG.turns * 2 * Math.PI, pts = [], arc = [0], total = 0, prev = null;
        for (var i = 0; i <= steps; i++) {
            var th = thetaMax * i / steps, r = CFG.Rin + (CFG.Rout - CFG.Rin) * (th / thetaMax);
            var x = CX + r * Math.cos(th), y = CY + r * Math.sin(th);
            if (prev) { total += Math.hypot(x - prev.x, y - prev.y); arc.push(total); }
            pts.push({ x: x, y: y }); prev = { x: x, y: y };
        }
        return { pts: pts, arc: arc, len: total };   // s = 0 at pts[0] (innermost = death), s = len at the outer source
    })();
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
    function randInt(n) { return (rng() * n) | 0; }
    function isPrime(v) { if (v < 2) return false; for (var i = 2; i * i <= v; i++) if (v % i === 0) return false; return true; }
    function gcd(a, b) { a = a < 0 ? -a : a; b = b < 0 ? -b : b; while (b) { var m = a % b; a = b; b = m; } return a; }
    function randPrime() { return CFG.P[randInt(CFG.P.length)]; }
    function spawnValue() { var n = 1, f = 1 + randInt(CFG.maxFactors); for (var i = 0; i < f; i++) { var p = randPrime(); if (n * p > CFG.valCap) break; n *= p; } return n === 1 ? randPrime() : n; }

    // ---------------- state ----------------
    // queues: [{ vals:[front..back], head:(s of front ball), imp:(inertia velocity) }] ordered front(small s) -> back(large s)
    var canvas, ctx, shell, queues, shots, cannon, score, over;

    function $(id) { return document.getElementById(id); }
    function backEndS(q) { return q.head + (q.vals.length - 1) * CFG.D; }
    function gapBetween(f, b) { return b.head - backEndS(f) - CFG.D; }   // 0 = touching, <0 = overlapping

    function newGame() {
        rngState = (Date.now() >>> 0) || 1;
        shots = []; cannon = { aim: -Math.PI / 2, cur: randPrime(), next: randPrime() }; score = 0; over = false;
        var vals = []; for (var i = 0; i < CFG.startLen; i++) vals.push(spawnValue());
        queues = [{ vals: vals, head: PATH.len - CFG.startLen * CFG.D, imp: 0 }];
        syncHud();
    }

    // ---------------- elimination ----------------
    function regroup(balls) {   // balls: [{s,v}] sorted by s → contiguous runs become queues
        var out = [], cur = null;
        for (var i = 0; i < balls.length; i++) {
            if (cur && Math.abs(balls[i].s - (cur.head + cur.vals.length * CFG.D)) <= CFG.D * 0.5) cur.vals.push(balls[i].v);
            else { if (cur) out.push(cur); cur = { vals: [balls[i].v], head: balls[i].s, imp: 0 }; }
        }
        if (cur) out.push(cur);
        return out;
    }
    // Peel a factor of p off the contiguous divisible run around index `idx`. Returns true if it cleared.
    function tryEliminate(q, idx, p) {
        if (!q || q.vals[idx] % p !== 0) return false;
        var lo = idx, hi = idx;
        while (lo - 1 >= 0 && q.vals[lo - 1] % p === 0) lo--;
        while (hi + 1 < q.vals.length && q.vals[hi + 1] % p === 0) hi++;
        if (hi - lo + 1 < CFG.k) return false;
        var balls = [], cleared = 0;
        for (var j = 0; j < q.vals.length; j++) {
            var v = q.vals[j];
            if (j >= lo && j <= hi) { v = v / p; if (v === 1) { cleared++; continue; } }
            balls.push({ s: q.head + j * CFG.D, v: v });
        }
        score += cleared * 10 + (hi - lo + 1);
        AC.audio.play('laser');
        var at = queues.indexOf(q);
        if (at >= 0) { var groups = regroup(balls); queues.splice.apply(queues, [at, 1].concat(groups)); }
        return true;
    }

    // ---------------- collisions (merge / chain / inertia) ----------------
    function resolveCollisions() {
        for (var guard = 0; guard < 200; guard++) {
            var merged = false;
            for (var i = 0; i < queues.length - 1; i++) {
                var f = queues[i], b = queues[i + 1];
                if (gapBetween(f, b) < -0.01) {
                    var a = f.vals[f.vals.length - 1], c = b.vals[0], junction = f.vals.length - 1;
                    // anchor the ball that was NOT moving into the other; keep the chain rigid at D spacing
                    var frontFed = (b.vel || 0) < 0 && (f.vel || 0) <= 0;   // backmost fed forward into a still front queue
                    var retreating = (f.vel || 0) > 0;                      // this crash came from an attraction (retreat), not a plain feed catch-up
                    var mq = { vals: f.vals.concat(b.vals), head: frontFed ? f.head : (b.head - f.vals.length * CFG.D), imp: 0 };
                    queues.splice(i, 2, mq);
                    if (retreating) {
                        if (a === c && isPrime(a)) tryEliminate(mq, junction, a);   // SAME PRIME → chain another peel
                        else mq.imp = CFG.impulse;                                  // otherwise (shares a factor) → inertia nudge backward
                    }
                    merged = true;
                    break;
                }
            }
            if (!merged) break;
        }
    }

    // ---------------- shooting / insertion ----------------
    function shoot() {
        var mx = CX + Math.cos(cannon.aim) * 24, my = CY + Math.sin(cannon.aim) * 24;
        shots.push({ x: mx, y: my, vx: Math.cos(cannon.aim) * CFG.shotSpeed, vy: Math.sin(cannon.aim) * CFG.shotSpeed, v: cannon.cur });
        cannon.cur = cannon.next; cannon.next = randPrime();
        AC.audio.play('click');
    }
    function nearestBall(x, y) {
        var best = null, bd = Infinity;
        for (var qi = 0; qi < queues.length; qi++) { var q = queues[qi]; for (var j = 0; j < q.vals.length; j++) { var pos = posAt(q.head + j * CFG.D), dx = pos.x - x, dy = pos.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { q: q, j: j, s: q.head + j * CFG.D }; } } }
        if (best) best.dist = Math.sqrt(bd);
        return best;
    }
    function insertShot(shot, hit) {
        var q = hit.q, shotS = nearestS(shot.x, shot.y), j = shotS < hit.s ? hit.j : hit.j + 1;   // insert on the side the ball came from
        q.vals.splice(j, 0, shot.v);
        if (CFG.insertPush === 'front') q.head -= CFG.D;   // make room by shoving the FRONT toward death; the back is untouched
        tryEliminate(q, j, shot.v);
    }

    // ---------------- main loop ----------------
    function update() {
        if (over || !queues) return;
        // 1) feed the backmost sub-queue from the source
        if (queues.length) { var bq = queues[queues.length - 1]; if (backEndS(bq) <= PATH.len - CFG.D) bq.vals.push(spawnValue()); }
        else queues.push({ vals: [spawnValue()], head: PATH.len - CFG.D, imp: 0 });
        var dt = 1 / 60, i, q;
        // 2) velocities: backmost feeds forward; a queue whose back end matches the queue behind retreats; + decaying inertia
        for (i = 0; i < queues.length; i++) {
            q = queues[i]; var v = 0;
            if (i === queues.length - 1) v = -CFG.vFeed;
            else if (gcd(q.vals[q.vals.length - 1], queues[i + 1].vals[0]) > 1) v = CFG.vRetreat;   // share a factor (not coprime) → attract & retreat
            q.vel = v + (q.imp || 0);
            q.imp = (q.imp || 0) * Math.max(0, 1 - CFG.impDecay * dt);
            if (Math.abs(q.imp) < 1) q.imp = 0;
        }
        for (i = 0; i < queues.length; i++) queues[i].head += queues[i].vel * dt;
        resolveCollisions();
        // 3) projectiles: fly straight; insert on contact; drop if they leave the field
        for (i = shots.length - 1; i >= 0; i--) {
            var s = shots[i]; s.x += s.vx * dt; s.y += s.vy * dt;
            var rr = Math.hypot(s.x - CX, s.y - CY);
            if (rr > CFG.Rout + 46 || rr < 6) { shots.splice(i, 1); continue; }
            var hit = nearestBall(s.x, s.y);
            if (hit && hit.dist < CFG.rBall * 1.9) { insertShot(s, hit); shots.splice(i, 1); }
        }
        resolveCollisions();
        // 4) prune empties, check death (front of the frontmost queue reached the core)
        for (i = queues.length - 1; i >= 0; i--) if (!queues[i].vals.length) queues.splice(i, 1);
        if (queues.length && queues[0].head <= 0) { over = true; shell.gameOver({ score: score, win: false }); }
        syncHud();
    }

    // ---------------- render ----------------
    function hue(v) { return (v * 47) % 360; }
    function render() {
        if (!ctx) return;
        ctx.clearRect(0, 0, CW, CH);
        // spiral guide
        ctx.strokeStyle = 'rgba(148,163,184,0.18)'; ctx.lineWidth = CFG.rBall * 2 + 3; ctx.lineCap = 'round'; ctx.beginPath();
        for (var p = 0; p < PATH.pts.length; p += 3) { var pt = PATH.pts[p]; if (p === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); }
        ctx.stroke();
        // death core
        var d0 = posAt(0);
        ctx.fillStyle = 'rgba(239,68,68,0.9)'; ctx.beginPath(); ctx.arc(d0.x, d0.y, 7, 0, 7); ctx.fill();
        // chain balls
        for (var qi = 0; qi < queues.length; qi++) {
            var q = queues[qi];
            for (var j = 0; j < q.vals.length; j++) {
                var v = q.vals[j], pos = posAt(q.head + j * CFG.D), prime = isPrime(v), h = hue(v);
                ctx.beginPath(); ctx.arc(pos.x, pos.y, CFG.rBall, 0, 7);
                ctx.fillStyle = 'hsl(' + h + ',70%,' + (prime ? 56 : 42) + '%)'; ctx.fill();
                ctx.lineWidth = prime ? 3 : 1.5; ctx.strokeStyle = prime ? '#fff' : 'rgba(255,255,255,0.4)'; ctx.stroke();
                ctx.fillStyle = '#0a1322'; ctx.font = 'bold ' + (v > 9 ? 12 : 15) + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(String(v), pos.x, pos.y + 0.5);
            }
        }
        // shots
        for (var si = 0; si < shots.length; si++) { var s = shots[si]; ctx.beginPath(); ctx.arc(s.x, s.y, CFG.rBall * 0.9, 0, 7); ctx.fillStyle = 'hsl(' + hue(s.v) + ',75%,58%)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.fillStyle = '#0a1322'; ctx.font = 'bold 14px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(s.v), s.x, s.y + 0.5); }
        // cannon barrel (rotates to aim), with the loaded ball at the muzzle
        ctx.save(); ctx.translate(CX, CY); ctx.rotate(cannon.aim);
        ctx.fillStyle = '#334155'; ctx.fillRect(0, -5, 30, 10);
        ctx.restore();
        drawChip(CX + Math.cos(cannon.aim) * 30, CY + Math.sin(cannon.aim) * 30, cannon.cur, 12);   // loaded (next to fire)
        ctx.beginPath(); ctx.arc(CX, CY, 17, 0, 7); ctx.fillStyle = '#1e293b'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#64748b'; ctx.stroke();
        drawChip(CX, CY, cannon.next, 10);   // next up, parked in the hub
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
        cannon.aim = Math.atan2(y - CY, x - CX);
    }

    // ---------------- boot ----------------
    function boot() {
        canvas = $('stage'); canvas.width = CW * DPR; canvas.height = CH * DPR;
        ctx = canvas.getContext('2d'); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

        canvas.addEventListener('pointermove', function (e) { if (!over) aimTo(e.clientX, e.clientY); });
        canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); AC.audio.unlock(); if (shell.isPlaying() && !over) { aimTo(e.clientX, e.clientY); shoot(); } }, { passive: false });
        window.addEventListener('keydown', function (e) { if ((e.key === ' ') && shell.isPlaying() && !over) { e.preventDefault(); shoot(); } });

        shell = AC.shell.create({
            gameId: 'prime-zuma', step: 1 / 60, preventKeys: ['Space'],
            update: update, render: render,
            reset: newGame,
            restartToReady: true,
            overlayContent: function (state, result) {
                if (state === 'idle') return { badge: 'coins', title: t('pzReady'), message: t('pzIntro'), button: t('play'), hint: t('pzStartHintHtml') };
                if (state === 'over') { var msg = t('pzOverMsgHtml', AC.format.score(result ? result.score : score)); if (result && result.isNewBest) msg += ' <strong>' + t('newBest') + '</strong>'; return { badge: 'skull', title: t('gameOver'), message: msg, button: t('restart') }; }
                return {};
            },
        });
        AC.i18n.subscribe(function () { if (!shell.isPlaying()) shell.refreshOverlay && shell.refreshOverlay(); });
        newGame(); shell.refreshBest && shell.refreshBest(); render();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
