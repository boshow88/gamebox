/* Flick — a hot-seat flick-soccer prototype built on ArcadeCommon + FlickEngine.
 * This first cut is PHYSICS + hot-seat (two humans, one device). Online and CPU
 * come next and will reuse the same deterministic FlickEngine. */
(function () {
    'use strict';
    var AC = window.ArcadeCommon, E = window.FlickEngine;
    var t = AC.i18n.t;

    // ---------------- i18n ----------------
    var STRINGS = {
        en: {
            flickName: 'Flick',
            flickReady: 'Two players, one device. On your turn, drag one of your players back and release to flick it — carom into the ball and score. First to 3 wins.',
            flickScore: 'Score', flickTurn: 'Turn',
            flickTeam0: 'Blue', flickTeam1: 'Red',
            flickAim: function (n) { return n + ' to shoot'; },
            flickWin: function (n) { return n + ' wins!'; },
            flickGoal: 'GOAL!',
            flickHelp1Html: 'Hot-seat for <strong>two players</strong>. On your turn, <strong>drag one of your players back</strong> and release to flick it — like a slingshot.',
            flickHelp2Html: 'Carom off teammates, rivals and the ball to knock the <strong>ball into the far goal</strong>. Knock it into your own net and the point goes to your rival.',
            flickHelp3Html: '<strong>Right-click</strong> (or the corner ✕) cancels a drag so you can pick another player. First to <strong>3 goals</strong> wins. <kbd>R</kbd> restart · <kbd>M</kbd> mute.',
        },
        zh: {
            flickName: 'Flick',
            flickReady: '兩人同機對戰。輪到你時，往後拖曳你的一個球員再放開彈射——撞擊球把它送進對方球門。先得 3 分者獲勝。',
            flickScore: '比分', flickTurn: '出手',
            flickTeam0: '藍方', flickTeam1: '紅方',
            flickAim: function (n) { return n + '出手'; },
            flickWin: function (n) { return n + '獲勝！'; },
            flickGoal: '進球！',
            flickHelp1Html: '<strong>兩人</strong>同機輪流。輪到你時，<strong>往後拖曳你的一個球員</strong>再放開彈射，像彈弓一樣。',
            flickHelp2Html: '撞擊隊友、對手與球，把<strong>球撞進對方球門</strong>。若撞進自家球門，分數就送給對手。',
            flickHelp3Html: '<strong>按右鍵</strong>（或畫面角落的 ✕）可取消拖曳、改選別的球員。先得 <strong>3 分</strong>者獲勝。<kbd>R</kbd> 重來 · <kbd>M</kbd> 靜音。',
        },
    };
    Object.assign(AC.i18n.STRINGS.en, STRINGS.en);
    Object.assign(AC.i18n.STRINGS.zh, STRINGS.zh);

    // ---------------- constants ----------------
    var CW = 600, CH = 760, FMX = 24, FMT = 46, FMB = 24;   // margins: sides, top header (caption + ✕), bottom
    var FW = CW - 2 * FMX, FH = CH - FMT - FMB;             // field size (the header keeps the ✕ off the pitch)
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var TEAM = ['#38bdf8', '#fb7185'];               // 0 = bottom (blue), 1 = top (red)
    var BALL = '#eef2f7';
    var MAXPULL = 175, MAXSPEED = 1550;              // drag distance -> launch speed
    var SUB = 4;                                     // physics sub-steps per frame
    var TARGET = 3;                                  // goals to win
    var CANCEL_R = 17;                               // corner cancel button radius

    var canvas, ctx, shell, world;
    var G = { phase: 'aim', turn: 0, score: [0, 0], drag: null, flash: 0 };

    function $(id) { return document.getElementById(id); }

    // ---------------- match lifecycle ----------------
    function newMatch() {
        world = E.create({ W: FW, H: FH });
        G.score = [0, 0];
        G.turn = Math.random() < 0.5 ? 0 : 1;        // coin-flip first shooter
        G.drag = null; G.flash = 0; G.phase = 'aim';
        syncHud();
    }
    function syncHud() {
        var s = $('score'); if (s) s.textContent = G.score[0] + ' : ' + G.score[1];
        var tn = $('turn'); if (tn) { tn.textContent = t('flickTeam' + G.turn); tn.style.color = TEAM[G.turn]; }
    }
    function endTurn() { G.turn = 1 - G.turn; G.phase = 'aim'; G.drag = null; syncHud(); }
    function handleGoal(side) {
        var scorer = side === 'top' ? 0 : 1;         // top net breached -> bottom team (0) scored
        G.score[scorer]++; G.flash = 1; AC.audio.play('gem'); syncHud();
        if (G.score[scorer] >= TARGET) { G.phase = 'aim'; shell.gameOver({ score: 0, win: true, meta: { winner: scorer, score: G.score.slice() } }); return; }
        E.reset(world);
        G.turn = side === 'top' ? 1 : 0;             // the team that conceded kicks off
        G.phase = 'aim'; G.drag = null; syncHud();
    }

    // ---------------- loop ----------------
    function update() {
        if (G.flash > 0) G.flash = Math.max(0, G.flash - 1 / 60 / 0.6);
        if (G.phase !== 'sim') return;
        var dt = (1 / 60) / SUB;
        for (var i = 0; i < SUB; i++) { var g = E.step(world, dt); if (g) { handleGoal(g); return; } }
        if (E.atRest(world)) { E.freeze(world); endTurn(); }
    }

    // ---------------- rendering ----------------
    function fx(x) { return FMX + x; }
    function fy(y) { return FMT + y; }
    function clear() { ctx.clearRect(0, 0, CW, CH); ctx.fillStyle = '#0a1628'; ctx.fillRect(0, 0, CW, CH); }
    function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

    function drawField() {
        // pitch
        ctx.save();
        roundRect(FMX, FMT, FW, FH, 14); ctx.fillStyle = '#123a2a'; ctx.fill();
        ctx.clip();
        // subtle mow stripes
        for (var i = 0; i < 8; i++) { ctx.fillStyle = (i % 2) ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)'; ctx.fillRect(FMX, FMT + FH * i / 8, FW, FH / 8); }
        ctx.restore();
        // lines
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
        roundRect(FMX + 4, FMT + 4, FW - 8, FH - 8, 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(FMX, fy(FH / 2)); ctx.lineTo(FMX + FW, fy(FH / 2)); ctx.stroke();
        ctx.beginPath(); ctx.arc(fx(FW / 2), fy(FH / 2), 58, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(fx(FW / 2), fy(FH / 2), 3, 0, Math.PI * 2); ctx.fill();
        // goals (mouth + net in the margin), coloured by defending team
        drawGoal(world.goalX0, world.goalX1, true);   // top net — defended by red (team 1)
        drawGoal(world.goalX0, world.goalX1, false);  // bottom net — defended by blue (team 0)
    }
    function drawGoal(gx0, gx1, top) {
        var y = top ? FMT : (FMT + FH), depth = 16, team = top ? 1 : 0;
        ctx.save();
        ctx.strokeStyle = TEAM[team]; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(fx(gx0), y); ctx.lineTo(fx(gx0), y + (top ? -depth : depth));
        ctx.moveTo(fx(gx1), y); ctx.lineTo(fx(gx1), y + (top ? -depth : depth));
        ctx.moveTo(fx(gx0), y + (top ? -depth : depth)); ctx.lineTo(fx(gx1), y + (top ? -depth : depth));
        ctx.stroke();
        ctx.globalAlpha = 0.18; ctx.fillStyle = TEAM[team];
        ctx.fillRect(fx(gx0), top ? y - depth : y, gx1 - gx0, depth);
        ctx.restore();
    }
    function drawBodies() {
        var b = world.bodies, i, o;
        for (i = 0; i < b.length; i++) {
            o = b[i];
            var col = o.kind === 'ball' ? BALL : TEAM[o.team];
            var pickable = (G.phase === 'aim' && o.kind === 'player' && o.team === G.turn);
            ctx.save();
            if (pickable) { ctx.shadowColor = col; ctx.shadowBlur = 14; }
            ctx.beginPath(); ctx.arc(fx(o.x), fy(o.y), o.r, 0, Math.PI * 2);
            ctx.fillStyle = col; ctx.fill();
            ctx.restore();
            ctx.lineWidth = o.kind === 'ball' ? 2 : 2.5;
            ctx.strokeStyle = o.kind === 'ball' ? 'rgba(15,23,42,0.5)' : 'rgba(255,255,255,0.65)';
            ctx.beginPath(); ctx.arc(fx(o.x), fy(o.y), o.r, 0, Math.PI * 2); ctx.stroke();
            if (o.kind === 'ball') { ctx.fillStyle = 'rgba(15,23,42,0.55)'; ctx.beginPath(); ctx.arc(fx(o.x), fy(o.y), o.r * 0.34, 0, Math.PI * 2); ctx.fill(); }
        }
    }
    function drawAim() {
        if (!G.drag) return;
        var o = world.bodies[G.drag.idx];
        var dx = o.x - G.drag.x, dy = o.y - G.drag.y;            // launch dir = pull-back opposite
        var dist = Math.min(Math.hypot(dx, dy), MAXPULL), u = dist / MAXPULL;
        if (dist < 1) return;
        var nx = dx / (Math.hypot(dx, dy) || 1), ny = dy / (Math.hypot(dx, dy) || 1);
        // faint pull line (body -> pointer)
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.moveTo(fx(o.x), fy(o.y)); ctx.lineTo(fx(G.drag.x), fy(G.drag.y)); ctx.stroke(); ctx.setLineDash([]);
        // power arrow (body -> launch dir)
        var len = 24 + dist, ex = fx(o.x + nx * len), ey = fy(o.y + ny * len);
        var col = mix('#34d399', '#f87171', u);
        ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(fx(o.x), fy(o.y)); ctx.lineTo(ex, ey); ctx.stroke();
        var ah = 11, a = Math.atan2(ny, nx);
        ctx.beginPath(); ctx.moveTo(ex, ey);
        ctx.lineTo(ex - ah * Math.cos(a - 0.4), ey - ah * Math.sin(a - 0.4));
        ctx.lineTo(ex - ah * Math.cos(a + 0.4), ey - ah * Math.sin(a + 0.4));
        ctx.closePath(); ctx.fillStyle = col; ctx.fill();
        drawCancel();
    }
    function cancelXY() { return { x: CW - FMX - CANCEL_R - 4, y: FMT / 2 }; }   // in the top header, clear of the pitch
    function drawCancel() {
        var c = cancelXY();
        ctx.save(); ctx.fillStyle = 'rgba(15,23,42,0.85)'; ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(c.x, c.y, CANCEL_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; var k = CANCEL_R * 0.42;
        ctx.beginPath(); ctx.moveTo(c.x - k, c.y - k); ctx.lineTo(c.x + k, c.y + k); ctx.moveTo(c.x + k, c.y - k); ctx.lineTo(c.x - k, c.y + k); ctx.stroke();
        ctx.restore();
    }
    function caption(text, color) {
        ctx.fillStyle = color || 'rgba(226,232,240,0.95)';
        ctx.font = '800 22px ' + (getComputedStyle(document.body).getPropertyValue('--font-display') || 'sans-serif');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, CW / 2, FMT / 2);
    }
    function render() {
        if (!ctx) return;
        clear(); drawField(); drawBodies(); drawAim();
        if (G.flash > 0) { ctx.save(); ctx.globalAlpha = G.flash * 0.5; ctx.fillStyle = '#fde68a'; ctx.fillRect(0, 0, CW, CH); ctx.restore(); caption(t('flickGoal'), '#fde68a'); }
        else if (G.phase === 'aim') caption(t('flickAim', t('flickTeam' + G.turn)), TEAM[G.turn]);
    }
    function mix(a, b, u) {
        function h(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
        var A = h(a), B = h(b); u = AC.math.clamp(u, 0, 1);
        return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * u) + ',' + Math.round(A[1] + (B[1] - A[1]) * u) + ',' + Math.round(A[2] + (B[2] - A[2]) * u) + ')';
    }

    // ---------------- input ----------------
    function evToField(e) {
        var r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (CW / r.width) - FMX, y: (e.clientY - r.top) * (CH / r.height) - FMT };
    }
    function hitPlayer(p) {
        var b = world.bodies, best = -1, bd = 1e9;
        for (var i = 0; i < b.length; i++) {
            var o = b[i]; if (o.kind !== 'player' || o.team !== G.turn) continue;
            var d = Math.hypot(o.x - p.x, o.y - p.y);
            if (d < o.r + 10 && d < bd) { bd = d; best = i; }
        }
        return best;
    }
    function inCancel(e) {
        var r = canvas.getBoundingClientRect();
        var cx = (e.clientX - r.left) * (CW / r.width), cy = (e.clientY - r.top) * (CH / r.height), c = cancelXY();
        return Math.hypot(cx - c.x, cy - c.y) <= CANCEL_R + 4;
    }
    function onDown(e) {
        if (!shell.isPlaying() || G.phase !== 'aim') return;
        var p = evToField(e), idx = hitPlayer(p);
        if (idx < 0) return;
        AC.audio.unlock();
        G.drag = { idx: idx, x: p.x, y: p.y }; e.preventDefault();
    }
    function onMove(e) { if (!G.drag) return; var p = evToField(e); G.drag.x = p.x; G.drag.y = p.y; e.preventDefault(); }
    function onUp(e) {
        if (!G.drag) return;
        if (inCancel(e)) { G.drag = null; AC.audio.play('click'); e.preventDefault(); return; }   // release over the ✕ → cancel (works on touch too)
        var o = world.bodies[G.drag.idx], dx = o.x - G.drag.x, dy = o.y - G.drag.y, dist = Math.hypot(dx, dy);
        var idx = G.drag.idx; G.drag = null;
        if (dist < 14) return;                                   // tiny pull -> treat as cancel, keep aiming
        var power = Math.min(dist, MAXPULL) / MAXPULL * MAXSPEED;
        E.applyShot(world, idx, dx, dy, power); AC.audio.play('laser');
        G.phase = 'sim'; e.preventDefault();
    }
    function cancelDrag() { if (G.drag) { G.drag = null; AC.audio.play('click'); } }

    // ---------------- boot ----------------
    function boot() {
        canvas = $('stage'); canvas.width = CW * DPR; canvas.height = CH * DPR;
        ctx = canvas.getContext('2d'); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        canvas.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); cancelDrag(); });
        window.addEventListener('keydown', function (e) { if (e.key === 'Escape') cancelDrag(); });

        shell = AC.shell.create({
            gameId: 'flick', step: 1 / 60,
            update: update, render: render, reset: newMatch,
            canPause: function () { return false; },
            canRestart: function () { return true; },
            overlayContent: function (state, result) {
                if (state === 'idle') return { badge: 'soccer', title: t('flickName'), message: t('flickReady'), button: t('start') };
                if (state === 'over') {
                    var m = (result && result.meta) || {}, w = m.winner || 0, sc = m.score || G.score;
                    return { badge: 'trophy', title: t('flickWin', t('flickTeam' + w)), message: t('flickScore') + '  ' + sc[0] + ' : ' + sc[1], button: t('restart') };
                }
                return {};
            },
        });
        AC.i18n.subscribe(function () { syncHud(); if (shell.state === 'idle' || shell.state === 'over') shell.refreshOverlay(); });
        // a blank field behind the ready overlay
        world = E.create({ W: FW, H: FH }); syncHud(); render();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
