/* Bomber — deterministic BombEngine on ArcadeCommon. Single-player for now: you are
 * P1 (blue); the rest are simple CPUs. The engine is a pure function of (seed, inputs
 * per tick), so this same loop will drive lockstep / rollback online later — the CPU
 * lives HERE (game layer), never inside the engine. Keyboard + on-screen D-pad. */
(function () {
    'use strict';
    var AC = window.ArcadeCommon, E = window.BombEngine;
    var t = AC.i18n.t;

    var STRINGS = {
        en: {
            bombName: 'Bomber', bombDrop: 'BOMB',
            bombReady: 'Drop bombs to blow up blocks and rivals. Grab power-ups. Be the last one standing!',
            bombWin: 'You win!', bombLose: 'You were blown up!', bombDraw: 'Everyone\u2019s gone!',
            bombHelp1Html: 'Move with <kbd>\u2191\u2193\u2190\u2192</kbd>/<kbd>WASD</kbd> (or the on-screen pad). Drop a bomb with <kbd>Space</kbd> / the <strong>BOMB</strong> button.',
            bombHelp2Html: 'Blasts break <strong>soft blocks</strong> (some drop power-ups: fire, extra bomb, speed, kick) and destroy players. Be the <strong>last one standing</strong>.',
        },
        zh: {
            bombName: '轟炸人', bombDrop: '放炸彈',
            bombReady: '放炸彈炸開磚塊與對手，撿道具強化，成為最後存活者！',
            bombWin: '你贏了！', bombLose: '你被炸飛了！', bombDraw: '同歸於盡！',
            bombHelp1Html: '用 <kbd>\u2191\u2193\u2190\u2192</kbd>/<kbd>WASD</kbd>（或螢幕方向鍵）移動。<kbd>空白鍵</kbd> / <strong>放炸彈</strong>鈕 放炸彈。',
            bombHelp2Html: '爆風會炸開<strong>軟磚</strong>（部分掉落道具：火力、炸彈數、速度、踢）並炸死玩家。當<strong>最後存活者</strong>。',
        },
    };
    Object.assign(AC.i18n.STRINGS.en, STRINGS.en);
    Object.assign(AC.i18n.STRINGS.zh, STRINGS.zh);

    var CFG = { cols: 13, rows: 11, players: 4, fuse: 150, flameTicks: 28, softRate: 0.80, itemRate: 0.42, speed: 5, maxSpeed: 11, power: 2, bombs: 1 };
    var TILE = 34, CW = CFG.cols * TILE, CH = CFG.rows * TILE, DPR = Math.min(window.devicePixelRatio || 1, 2);
    var DRAW_RATIO = 0.85;          // player draw radius as a fraction of the collision half-size (visual only)
    var PCOL = ['#38bdf8', '#fb7185', '#34d399', '#fbbf24'];
    var ICOL = { fire: '#f97316', bomb: '#94a3b8', speed: '#22d3ee', kick: '#a78bfa' };
    var ICH = { fire: '✦', bomb: '✚', speed: '»', kick: '●' };

    var canvas, ctx, shell, world, M = null;

    function $(id) { return document.getElementById(id); }
    function inB(w, x, y) { return x >= 0 && y >= 0 && x < w.cols && y < w.rows; }

    // ---------------- match lifecycle ----------------
    function newMatch() {
        var seed = (Math.random() * 1e9) >>> 0;
        world = E.create(CFG, seed);
        M = { cpu: [], keyOrder: [], dpadDir: -1, bombQueued: false, danger: null };
        for (var i = 0; i < world.players.length; i++) M.cpu.push({});
        hideOverlay(); syncChips();
    }
    function hideOverlay() { var o = $('overlay'); if (o) o.hidden = true; }
    function finish() {
        var win = world.winner === 0;
        shell.gameOver({ score: 0, win: win, meta: { winner: world.winner } });
    }

    // ---------------- input ----------------
    function humanInput() {
        var dir = M.dpadDir >= 0 ? M.dpadDir : (M.keyOrder.length ? M.keyOrder[M.keyOrder.length - 1] : -1);
        var bomb = M.bombQueued ? 1 : 0; M.bombQueued = false;
        return { dir: dir, bomb: bomb };
    }

    // ---------------- CPU (danger grid + BFS; lives in the game layer, single-player only) ----------------
    function buildDanger(w) {
        var g = [], y, x, i;
        for (y = 0; y < w.rows; y++) { g.push([]); for (x = 0; x < w.cols; x++) g[y].push(false); }
        for (i = 0; i < w.flames.length; i++) { var f = w.flames[i]; if (inB(w, f.x, f.y)) g[f.y][f.x] = true; }
        for (i = 0; i < w.bombs.length; i++) { var b = w.bombs[i]; markBlast(w, g, b.x, b.y, b.power); }
        return g;
    }
    function markBlast(w, g, bx, by, power) {
        g[by][bx] = true;
        for (var di = 0; di < 4; di++) { var d = E.DIRS[di]; for (var k = 1; k <= power; k++) { var tx = bx + d.dx * k, ty = by + d.dy * k, tt = E.tileAt(w, tx, ty); if (tt === 1) break; if (inB(w, tx, ty)) g[ty][tx] = true; if (tt === 2) break; } }
    }
    function blastKeys(w, bx, by, power) {
        var s = {}; s[bx + ',' + by] = true;
        for (var di = 0; di < 4; di++) { var d = E.DIRS[di]; for (var k = 1; k <= power; k++) { var tx = bx + d.dx * k, ty = by + d.dy * k, tt = E.tileAt(w, tx, ty); if (tt === 1) break; s[tx + ',' + ty] = true; if (tt === 2) break; } }
        return s;
    }
    // BFS over open floor (walls/soft/bombs block); returns the first-step DIR to the nearest tile where goalFn()
    function bfs(w, sx, sy, goalFn, avoid) {
        var q = [[sx, sy]], seen = {}, firstDir = {};
        seen[sx + ',' + sy] = true;
        while (q.length) {
            var cur = q.shift(), cx = cur[0], cy = cur[1];
            if ((cx !== sx || cy !== sy) && goalFn(cx, cy)) return firstDir[cx + ',' + cy];
            for (var di = 0; di < 4; di++) {
                var d = E.DIRS[di], nx = cx + d.dx, ny = cy + d.dy, key = nx + ',' + ny;
                if (seen[key] || !inB(w, nx, ny)) continue;
                if (E.tileAt(w, nx, ny) !== 0 || E.bombAt(w, nx, ny)) continue;
                if (avoid && avoid(nx, ny)) continue;
                seen[key] = true;
                firstDir[key] = (cx === sx && cy === sy) ? di : firstDir[cx + ',' + cy];
                q.push([nx, ny]);
            }
        }
        return -1;
    }
    function adjSoftOrEnemy(w, p, pt) {
        var di, d;
        for (di = 0; di < 4; di++) { d = E.DIRS[di]; if (E.tileAt(w, pt.tx + d.dx, pt.ty + d.dy) === 2) return true; }
        for (var i = 0; i < w.players.length; i++) {
            var q = w.players[i]; if (!q.alive || q.id === p.id) continue; var qt = E.ptile(q);
            if (qt.tx === pt.tx && Math.abs(qt.ty - pt.ty) <= p.power) return true;
            if (qt.ty === pt.ty && Math.abs(qt.tx - pt.tx) <= p.power) return true;
        }
        return false;
    }
    function softTarget(w, x, y) { for (var di = 0; di < 4; di++) { var d = E.DIRS[di]; if (E.tileAt(w, x + d.dx, y + d.dy) === 2) return true; } return false; }
    // pick an open, non-danger neighbour; prefer not to reverse (less wobble); tie-break deterministically (lockstep-safe)
    function roamDir(w, p, pt, dg, prev) {
        var opts = [], di, d, nx, ny, rev = prev >= 0 ? (prev + 2) % 4 : -1;
        for (di = 0; di < 4; di++) { d = E.DIRS[di]; nx = pt.tx + d.dx; ny = pt.ty + d.dy; if (E.tileAt(w, nx, ny) === 0 && !E.bombAt(w, nx, ny) && !dg[ny][nx]) opts.push(di); }
        if (opts.length > 1 && rev >= 0) { var f = opts.filter(function (x) { return x !== rev; }); if (f.length) opts = f; }
        return opts.length ? opts[(w.tick + p.id * 7) % opts.length] : -1;
    }
    // Decide the next move → {dir, fire}. Called ONLY when the body is centred in a tile (see cpuInput), so any
    // perpendicular turn is within centerTol and never jams the full-tile body against a wall.
    function cpuDecide(w, p, pt, dg, prev) {
        if (dg[pt.ty][pt.tx]) return { dir: bfs(w, pt.tx, pt.ty, function (x, y) { return !dg[y][x]; }, null), fire: 0 };   // in a blast → flee
        if (p.placed < p.bombs && adjSoftOrEnemy(w, p, pt)) {            // next to a soft block/enemy → bomb iff a safe escape exists
            var nb = blastKeys(w, pt.tx, pt.ty, p.power), esc = bfs(w, pt.tx, pt.ty, function (x, y) { return !dg[y][x] && !nb[x + ',' + y]; }, null);
            if (esc >= 0) return { dir: esc, fire: 1 };
        }
        var dir = bfs(w, pt.tx, pt.ty, function (x, y) { return softTarget(w, x, y); }, function (x, y) { return dg[y][x]; });  // head to nearest soft block
        if (dir < 0) dir = roamDir(w, p, pt, dg, prev);
        return { dir: dir, fire: 0 };
    }
    // Commit a direction and re-decide ONLY at tile centres. Turning mid-tile is exactly what jammed the body on a
    // wall (the "walks to a cell edge, tries to turn sideways, freezes and bombs itself" bug) — so even fleeing waits
    // until the body is aligned. Centre = both axes within one step of 50.
    function cpuInput(p) {
        if (!p.alive) return { dir: -1, bomb: 0 };
        var w = world, dg = M.danger, pt = E.ptile(p), sp = p.speed, cs = M.cpu[p.id];
        var atCenter = Math.abs((p.x % w.GRID) - w.GRID / 2) <= sp && Math.abs((p.y % w.GRID) - w.GRID / 2) <= sp;
        if (atCenter || cs.dir == null) { var r = cpuDecide(w, p, pt, dg, cs.dir == null ? -1 : cs.dir); cs.dir = r.dir; cs.fire = r.fire; }
        var bomb = cs.fire || 0; cs.fire = 0;                          // bomb fires once, on the decision tick
        return { dir: cs.dir == null ? -1 : cs.dir, bomb: bomb };
    }

    // ---------------- loop ----------------
    function update() {
        if (!M || world.over) return;
        M.danger = buildDanger(world);
        var inputs = [humanInput()];
        for (var i = 1; i < world.players.length; i++) inputs[i] = cpuInput(world.players[i]);
        var evs = E.step(world, inputs);
        for (var j = 0; j < evs.length; j++) playEvent(evs[j]);
        if (world.over) finish();
        syncChips();
    }
    function playEvent(e) {
        if (e.e === 'bomb') AC.audio.play('click');
        else if (e.e === 'explode') AC.audio.play('laser');
        else if (e.e === 'pickup') AC.audio.play('gem');
    }

    // ---------------- render ----------------
    function px(u) { return u / world.GRID * TILE; }
    function render() {
        if (!ctx || !world) return;
        ctx.clearRect(0, 0, CW, CH);
        var x, y, i;
        for (y = 0; y < world.rows; y++) for (x = 0; x < world.cols; x++) {
            var tt = world.grid[y][x];
            ctx.fillStyle = tt === 1 ? '#3b475b' : tt === 2 ? '#8d6748' : ((x + y) % 2 ? '#132033' : '#17263c');
            ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
            if (tt === 1) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, 4); }
            if (tt === 2) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x * TILE + 3, y * TILE + TILE - 7, TILE - 6, 4); }
        }
        for (i = 0; i < world.items.length; i++) { var it = world.items[i]; if (it.hidden) continue; var cx = it.x * TILE + TILE / 2, cy = it.y * TILE + TILE / 2; ctx.fillStyle = ICOL[it.type] || '#fff'; ctx.beginPath(); ctx.arc(cx, cy, TILE * 0.32, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#0a1322'; ctx.font = 'bold ' + (TILE * 0.42 | 0) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ICH[it.type] || '?', cx, cy + 1); }
        for (i = 0; i < world.bombs.length; i++) { var b = world.bombs[i], bx = b.x * TILE + TILE / 2, by = b.y * TILE + TILE / 2, pulse = 1 + 0.12 * Math.sin(world.tick * 0.4); ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(bx, by, TILE * 0.34 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fbbf24'; ctx.fillRect(bx - 1, by - TILE * 0.46, 2, 6); }
        for (i = 0; i < world.flames.length; i++) { var f = world.flames[i]; ctx.save(); ctx.globalAlpha = 0.85; var grd = ctx.createRadialGradient(f.x * TILE + TILE / 2, f.y * TILE + TILE / 2, 2, f.x * TILE + TILE / 2, f.y * TILE + TILE / 2, TILE * 0.6); grd.addColorStop(0, '#fff7ed'); grd.addColorStop(0.5, '#fb923c'); grd.addColorStop(1, '#ea580c'); ctx.fillStyle = grd; ctx.fillRect(f.x * TILE, f.y * TILE, TILE, TILE); ctx.restore(); }
        for (i = 0; i < world.players.length; i++) {
            var p = world.players[i]; if (!p.alive) continue;
            var ax = px(p.x), ay = px(p.y), r = px(E.HALF * DRAW_RATIO);
            ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI * 2); ctx.fillStyle = PCOL[p.id]; ctx.fill();
            ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
            ctx.fillStyle = 'rgba(10,15,30,0.55)'; ctx.beginPath(); ctx.arc(ax + (p.dir === 1 ? 3 : p.dir === 3 ? -3 : 0), ay + (p.dir === 2 ? 3 : p.dir === 0 ? -3 : 0), r * 0.32, 0, Math.PI * 2); ctx.fill();
        }
    }
    function syncChips() {
        var box = $('chips'); if (!box) return;
        if (!box._built || box.childElementCount !== (world ? world.players.length : 0)) {
            box.innerHTML = ''; box._built = true;
            if (world) for (var i = 0; i < world.players.length; i++) { var c = document.createElement('span'); c.className = 'pchip'; var dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = PCOL[i]; var lab = document.createElement('span'); c.append(dot, lab); c._lab = lab; box.appendChild(c); }
        }
        if (!world) return;
        for (var j = 0; j < box.children.length; j++) { var p = world.players[j], chip = box.children[j]; chip.classList.toggle('dead', !p.alive); chip._lab.textContent = (j === 0 ? 'P1' : 'CPU') + (j === 0 ? '  ✦' + p.power + ' ✚' + p.bombs + ' »' + (p.speed - CFG.speed + 1) : ''); }
    }

    // ---------------- boot ----------------
    function dirFromKey(k) { k = k.toLowerCase(); if (k === 'arrowup' || k === 'w') return 0; if (k === 'arrowright' || k === 'd') return 1; if (k === 'arrowdown' || k === 's') return 2; if (k === 'arrowleft' || k === 'a') return 3; return -1; }
    function boot() {
        canvas = $('stage'); canvas.width = CW * DPR; canvas.height = CH * DPR;
        ctx = canvas.getContext('2d'); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

        window.addEventListener('keydown', function (e) {
            if (!M) return; var d = dirFromKey(e.key);
            if (d >= 0) { if (M.keyOrder.indexOf(d) < 0) M.keyOrder.push(d); e.preventDefault(); }
            else if (e.key === ' ' || e.key.toLowerCase() === 'k') { M.bombQueued = true; e.preventDefault(); AC.audio.unlock(); }
        });
        window.addEventListener('keyup', function (e) { if (!M) return; var d = dirFromKey(e.key); if (d >= 0) { var i = M.keyOrder.indexOf(d); if (i >= 0) M.keyOrder.splice(i, 1); } });

        var dpad = document.querySelector('.dpad');
        if (dpad) dpad.querySelectorAll('button').forEach(function (btn) {
            var dir = parseInt(btn.getAttribute('data-dir'), 10);
            btn.addEventListener('pointerdown', function (e) { if (M) { M.dpadDir = dir; AC.audio.unlock(); } e.preventDefault(); });
            var clr = function (e) { if (M && M.dpadDir === dir) M.dpadDir = -1; if (e) e.preventDefault(); };
            btn.addEventListener('pointerup', clr); btn.addEventListener('pointercancel', clr); btn.addEventListener('pointerleave', clr);
        });
        var bb = $('bomb-btn'); if (bb) bb.addEventListener('pointerdown', function (e) { if (M) { M.bombQueued = true; AC.audio.unlock(); } e.preventDefault(); });

        shell = AC.shell.create({
            gameId: 'bomb', step: 1 / 60,
            update: update, render: render,
            restartToReady: false, onStart: newMatch,
            reset: function () { M = null; world = E.create(CFG, 1); syncChips(); render(); },
            canPause: function () { return false; }, canRestart: function () { return true; },
            overlayContent: function (state) {
                if (state === 'idle') return { badge: 'bomb', title: t('bombName'), message: t('bombReady'), button: t('start') };
                if (state === 'over') { var ttl = world.winner === 0 ? t('bombWin') : (world.winner == null ? t('bombDraw') : t('bombLose')); return { badge: world.winner === 0 ? 'trophy' : 'skull', title: ttl, message: '', button: t('restart') }; }
                return {};
            },
        });
        AC.i18n.subscribe(function () { if (!M) shell.refreshOverlay(); });
        world = E.create(CFG, 1); syncChips(); render();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
