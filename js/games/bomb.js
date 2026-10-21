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
            bombOnline: 'Online', bombNetTitle: 'Online match', bombNetSub: 'Head-to-head 1v1 over the internet.',
            bombHostBtn: 'Create room', bombJoinBtn: 'Join', bombCloseBtn: 'Close', bombLeaveBtn: 'Leave',
            bombCodeLabel: 'Give this code to your opponent', bombWaiting: 'Waiting for an opponent\u2026',
            bombNetConnecting: 'Connecting\u2026', bombNetFailed: 'Connection failed. Try again.',
            bombNetNoRoom: 'Room not found.', bombNetErr: 'Network error.', bombRoomGone: 'Room closed.',
            bombNetNoDb: 'Realtime DB not set up yet.',
            bombRematch: 'Rematch', bombWaitHost: 'Waiting for the host to restart\u2026', bombOppLeft: 'Opponent left.',
            bombHelp1Html: 'Move with <kbd>\u2191\u2193\u2190\u2192</kbd>/<kbd>WASD</kbd> (or the on-screen pad). Drop a bomb with <kbd>Space</kbd> / the <strong>BOMB</strong> button.',
            bombHelp2Html: 'Blasts break <strong>soft blocks</strong> (some drop power-ups: fire, extra bomb, speed, kick) and destroy players. Be the <strong>last one standing</strong>.',
        },
        zh: {
            bombName: '轟炸人', bombDrop: '放炸彈',
            bombReady: '放炸彈炸開磚塊與對手，撿道具強化，成為最後存活者！',
            bombWin: '你贏了！', bombLose: '你被炸飛了！', bombDraw: '同歸於盡！',
            bombOnline: '線上對戰', bombNetTitle: '線上對戰', bombNetSub: '透過網路 1v1 對戰。',
            bombHostBtn: '建立房間', bombJoinBtn: '加入', bombCloseBtn: '關閉', bombLeaveBtn: '離開',
            bombCodeLabel: '把房號給對手', bombWaiting: '等待對手加入\u2026',
            bombNetConnecting: '連線中\u2026', bombNetFailed: '連線失敗，請再試一次。',
            bombNetNoRoom: '找不到房間。', bombNetErr: '網路錯誤。', bombRoomGone: '房間已關閉。',
            bombNetNoDb: '即時資料庫尚未設定。',
            bombRematch: '再來一場', bombWaitHost: '等待房主再來一場\u2026', bombOppLeft: '對手已離開。',
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

    // ================= ONLINE — deterministic ROLLBACK over a Firebase RTDB relay =================
    // Both peers run the SAME engine from the SAME seed, fully symmetric (no host authority).
    // Rollback (GGPO-style) hides latency: your OWN input applies instantly, and the opponent's
    // input is PREDICTED (repeat their last) until the real one arrives. Each frame we rebuild the
    // shown "present" by re-simulating a short window from the last CONFIRMED state (only ticks for
    // which both real inputs are known). When the opponent's real input lands it folds into the
    // confirmed timeline — identical on both peers — so the official result never diverges; the only
    // artifact is the opponent occasionally snapping to a correction. Transport is RTDB (bomb_live):
    // it ALWAYS connects (no NAT/TURN), its relay latency only affects how big corrections get, not
    // your own responsiveness. Firestore (bomb_rooms) stays the lobby (room code + presence).
    var GROUP = 'bomb_rooms';                   // Firestore lobby collection
    var LIVE = 'bomb_live';                     // Realtime Database relay root
    var MAX_PREDICT = 25;                       // cap the predicted window (~0.4s); beyond it we hold a frame to let the opponent catch up
    var NEUTRAL = { dir: -1, bomb: 0 };
    var netCtx = null;                          // { group, code, role, gen, conn, slot, seed, data, roomUnsub, _status }

    function online() { return !!(M && M.mode === 'online'); }
    function getNet() { return (window.ArcadeNet && window.ArcadeNet.ok) ? window.ArcadeNet : null; }
    function onlineWorld(seed) { return E.create(Object.assign({}, CFG, { players: 2 }), seed); }
    function netSend(obj) { if (netCtx && netCtx.conn) netCtx.conn.send(obj); }
    function relayPath(sub) { return LIVE + '/' + netCtx.code + (sub ? '/' + sub : ''); }
    function ensureAuth() {
        var N = getNet(); if (!N) return Promise.reject(new Error('no net'));
        if (N.currentUser()) return Promise.resolve();
        return new Promise(function (res, rej) {
            var done = false;
            N.onAuth(function (u) { if (u && !done) { done = true; res(); } });
            N.signInGuest().catch(function (e) { if (!done) { done = true; rej(e); } });
            setTimeout(function () { if (!done) { done = true; N.currentUser() ? res() : rej(new Error('auth timeout')); } }, 8000);
        });
    }

    // ----- lobby UI (rendered into the #lobby overlay, layered over the board) -----
    function lobbyCard() { return $('lobby-card'); }
    function showLobby() { var o = $('lobby'); if (o) o.hidden = false; }
    function hideLobby() { var o = $('lobby'); if (o) o.hidden = true; }
    function setStatus(msg) { if (netCtx) netCtx._status = msg; var s = $('lobby-status'); if (s) s.textContent = msg; }
    function lobbyErr() { setStatus(t('bombNetErr')); }
    function btn(label, cls, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = label; b.addEventListener('click', fn); return b; }
    function titleEl(txt) { var h = document.createElement('div'); h.className = 'lobby-title'; h.textContent = txt; return h; }
    function subEl(txt) { var s = document.createElement('div'); s.className = 'lobby-sub'; s.textContent = txt; return s; }

    function openLobby() {
        var N = getNet(); if (!N) return;
        ensureAuth().catch(function () { });
        if (N.mp.cleanup) N.mp.cleanup(GROUP).catch(function () { });
        if (!netCtx) renderLobbyMenu(); else renderLobby();
        showLobby();
    }
    function renderLobbyMenu() {
        var card = lobbyCard(); if (!card) return;
        card.innerHTML = '';
        card.appendChild(titleEl(t('bombNetTitle')));
        card.appendChild(subEl(t('bombNetSub')));
        var r1 = document.createElement('div'); r1.className = 'lobby-row';
        r1.appendChild(btn(t('bombHostBtn'), 'btn-primary', doHost));
        card.appendChild(r1);
        var r2 = document.createElement('div'); r2.className = 'lobby-row';
        var inp = document.createElement('input'); inp.id = 'lobby-code-input'; inp.maxLength = 4; inp.placeholder = '----'; inp.autocomplete = 'off';
        inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') doJoin(inp.value); });
        r2.appendChild(inp); r2.appendChild(btn(t('bombJoinBtn'), '', function () { doJoin(inp.value); }));
        card.appendChild(r2);
        var st = document.createElement('div'); st.className = 'lobby-status'; st.id = 'lobby-status'; card.appendChild(st);
        card.appendChild(btn(t('bombCloseBtn'), '', hideLobby));
    }
    function renderLobby() {
        var card = lobbyCard(); if (!card || !netCtx) return;
        card.innerHTML = '';
        card.appendChild(titleEl(t('bombNetTitle')));
        if (netCtx.role === 'host') { card.appendChild(subEl(t('bombCodeLabel'))); var cc = document.createElement('div'); cc.className = 'lobby-code'; cc.textContent = netCtx.code; card.appendChild(cc); }
        var st = document.createElement('div'); st.className = 'lobby-status'; st.id = 'lobby-status'; st.textContent = netCtx._status || ''; card.appendChild(st);
        card.appendChild(btn(t('bombLeaveBtn'), '', leaveOnline));
    }

    function doHost() {
        var N = getNet(); if (!N) return;
        setStatus(t('bombNetConnecting'));
        ensureAuth().then(function () { return N.mp.create(GROUP, { maxPlayers: 2 }); }).then(function (code) {
            netCtx = { group: GROUP, code: code, role: 'host', gen: 1, conn: null, slot: 0, seed: (Math.random() * 1e9) >>> 0, _status: t('bombWaiting') };
            watchRoom(); renderLobby(); openRelay();
        }).catch(lobbyErr);
    }
    function doJoin(code) {
        var N = getNet(); if (!N) return;
        code = String(code || '').trim().toUpperCase(); if (code.length < 4) return;
        setStatus(t('bombNetConnecting'));
        ensureAuth().then(function () { return N.mp.join(GROUP, code); }).then(function () {
            netCtx = { group: GROUP, code: code, role: 'guest', gen: 0, conn: null, slot: 1, seed: 0, _status: t('bombNetConnecting') };
            watchRoom(); renderLobby(); openRelay();
        }).catch(function () { setStatus(t('bombNetNoRoom')); });
    }
    function watchRoom() {
        if (!netCtx) return;
        if (netCtx.roomUnsub) { try { netCtx.roomUnsub(); } catch (e) { } }
        netCtx.roomUnsub = getNet().mp.watch(netCtx.group, netCtx.code, onRoom);
    }
    function onRoom(d, err) {
        if (!netCtx) return;
        if (err) { setStatus(t('bombNetErr')); return; }
        if (!d) { if (AC.toast) AC.toast.show(t('bombRoomGone')); leaveOnline(); return; }   // room vanished
        netCtx.data = d;
        if (netCtx.role === 'host' && !online() && netCtx.conn) {        // guest arrived (and our relay is up) → publish + start
            var n = (d.order ? d.order.length : Object.keys(d.players || {}).length);
            if (n >= 2) hostBegin();
        }
    }
    // Wire up the RTDB relay listeners for this room. Host waits for the guest (onRoom) before
    // publishing meta + starting; guest starts when it reads the host's meta (seed + generation).
    function openRelay() {
        var N = getNet(); if (!N || !netCtx) return;
        if (!N.rtdb || !N.rtdb.ok) { setStatus(t('bombNetNoDb')); return; }
        teardownRelay(); netCtx.unsubs = [];
        var mySlot = netCtx.slot, otherSlot = 1 - mySlot;
        var noop = function () { };
        netCtx.conn = {
            send: function (m) {
                if (m.t === 'i') N.rtdb.set(relayPath('g' + netCtx.gen + '/in/' + mySlot + '/' + m.k), { d: m.d, b: m.b }).catch(noop);
                else if (m.t === 'bye') N.rtdb.set(relayPath('bye/' + mySlot), true).catch(noop);
            },
            close: function () { teardownRelay(); },
        };
        N.rtdb.onDisconnectSet(relayPath('bye/' + mySlot), true);        // auto-forfeit if our tab vanishes
        N.rtdb.set(relayPath('bye/' + mySlot), false).catch(function () { });   // clear any stale leave flag
        netCtx.unsubs.push(N.rtdb.onValue(relayPath('bye/' + otherSlot), function (v) { if (v === true) onNetMessage({ t: 'bye' }); }));
        bindInputs();
        if (netCtx.role === 'guest') {                                   // follow the host's generation (first match + rematches)
            netCtx.unsubs.push(N.rtdb.onValue(relayPath('meta'), function (meta) {
                if (!meta || meta.gen == null) return;
                if (meta.gen !== netCtx.gen || !online()) { netCtx.gen = meta.gen; netCtx.seed = meta.seed; bindInputs(); startOnlineMatch(meta.seed); }
            }));
        }
    }
    function hostBegin() {                                               // host: publish seed+gen, then start the match
        var N = getNet(); if (!N || !netCtx || netCtx.role !== 'host') return;
        N.rtdb.set(relayPath('meta'), { seed: netCtx.seed, gen: netCtx.gen }).catch(function () { });
        bindInputs(); startOnlineMatch(netCtx.seed);
    }
    function bindInputs() {                                              // (re)subscribe to the opponent's inputs for the CURRENT generation
        var N = getNet(); if (!N || !netCtx || !N.rtdb || !N.rtdb.ok) return;
        if (netCtx.inUnsub) { try { netCtx.inUnsub(); } catch (e) { } }
        var otherSlot = 1 - netCtx.slot;
        netCtx.inUnsub = N.rtdb.onChild(relayPath('g' + netCtx.gen + '/in/' + otherSlot), function (key, val) {
            if (val) onNetMessage({ t: 'i', k: Number(key), d: val.d, b: val.b });
        });
    }
    function teardownRelay() {
        if (!netCtx) return;
        (netCtx.unsubs || []).forEach(function (u) { try { u(); } catch (e) { } });
        netCtx.unsubs = [];
        if (netCtx.inUnsub) { try { netCtx.inUnsub(); } catch (e) { } netCtx.inUnsub = null; }
    }
    function leaveOnline() {
        if (netCtx) {
            netSend({ t: 'bye' });
            if (netCtx.roomUnsub) { try { netCtx.roomUnsub(); } catch (e) { } }
            teardownRelay();
            var N = getNet(); if (N) N.mp.leave(netCtx.group, netCtx.code).catch(function () { });
            netCtx = null;
        }
        M = null; hideLobby(); shell.goIdle();
    }

    // ----- the rollback match -----
    function startOnlineMatch(seed) {
        var base = onlineWorld(seed);
        M = {
            mode: 'online', slot: netCtx ? netCtx.slot : 0,
            cur: 0,                      // next live tick to simulate (advances ~1 per frame, holds when predicting too far)
            confTick: 0,                 // every tick < confTick is CONFIRMED (both real inputs known) and folded into conf
            conf: base,                  // authoritative state at confTick — only confirmed inputs, identical on both peers
            local: {}, remote: {},       // input maps by tick
            lastRemote: -1, predicted: NEUTRAL,   // predict the opponent by repeating their latest confirmed input
            keyOrder: [], dpadDir: -1, bombQueued: false,
            started: true, over: false,
        };
        world = E.clone(base);           // the shown (predicted) present; starts equal to conf
        hideLobby(); syncChips();
        if (!shell.isPlaying()) shell.start();
    }
    function onNetMessage(m) {                                         // m is a plain object delivered by the relay
        if (!m) return;
        if (m.t === 'i') { if (!online()) return; M.remote[m.k] = { dir: m.d, bomb: m.b }; if (m.k > M.lastRemote) { M.lastRemote = m.k; M.predicted = M.remote[m.k]; } }
        else if (m.t === 'bye') { if (online() && !M.over) endOnline(M.slot, 'left'); }
    }
    function remoteInputAt(tk) { return M.remote[tk] || M.predicted; }   // real input if we have it, else our prediction
    function orderedInputs(tk) {                                         // map local/remote onto player slots 0/1
        var mine = M.local[tk] || NEUTRAL, theirs = remoteInputAt(tk);
        return M.slot === 0 ? [mine, theirs] : [theirs, mine];
    }
    function confirmStep() {                                            // fold every tick with BOTH real inputs into the confirmed timeline
        while (M.local[M.confTick] != null && M.remote[M.confTick] != null) {
            var evs = E.step(M.conf, orderedInputs(M.confTick));
            for (var j = 0; j < evs.length; j++) playEvent(evs[j]);     // audio fires on CONFIRMED events only (no dupes, no false sounds)
            M.confTick++;
            if (M.conf.over) { world = E.clone(M.conf); endOnline(M.conf.winner, 'normal'); return; }
            delete M.local[M.confTick - 180]; delete M.remote[M.confTick - 180];   // prune long-consumed inputs
        }
    }
    function updateOnline() {
        if (!M.started || M.over) return;
        confirmStep();                                                 // 1) advance the authoritative timeline (drives audio + result)
        if (M.over) return;
        if (M.cur - M.confTick < MAX_PREDICT) {                        // 2) advance one live tick (hold if too far ahead → let the opponent catch up)
            M.local[M.cur] = humanInput();                             //    sample + send our input for this tick EXACTLY once
            netSend({ t: 'i', k: M.cur, d: M.local[M.cur].dir, b: M.local[M.cur].bomb });
            M.cur++;
        }
        world = E.clone(M.conf);                                       // 3) rebuild the predicted present from the confirmed base
        for (var tk = M.confTick; tk < M.cur; tk++) E.step(world, orderedInputs(tk));
        syncChips();
    }
    function endOnline(winnerSlot, reason) {
        if (!M || M.over) return;
        M.over = true;
        var draw = winnerSlot == null, win = winnerSlot === M.slot;
        shell.gameOver({ score: 0, win: win, meta: { winner: winnerSlot, online: true } });
        showResult(win, reason, draw);
    }
    function showResult(win, reason, draw) {
        var card = lobbyCard(); if (!card) return;
        card.innerHTML = '';
        card.appendChild(titleEl(draw ? t('bombDraw') : (win ? t('bombWin') : t('bombLose'))));
        if (reason === 'left' || reason === 'drop') card.appendChild(subEl(t('bombOppLeft')));
        var row = document.createElement('div'); row.className = 'lobby-row';
        if (netCtx && netCtx.role === 'host') row.appendChild(btn(t('bombRematch'), 'btn-primary', doRematch));
        else card.appendChild(subEl(t('bombWaitHost')));
        row.appendChild(btn(t('bombLeaveBtn'), '', leaveOnline));
        card.appendChild(row);
        showLobby();
    }
    function doRematch() {
        if (!netCtx || netCtx.role !== 'host') return;
        var N = getNet(); if (!N) return;
        netCtx.gen++; netCtx.seed = (Math.random() * 1e9) >>> 0;       // new generation + new map; the guest follows the meta change
        N.rtdb.set(relayPath('meta'), { seed: netCtx.seed, gen: netCtx.gen }).catch(function () { });
        bindInputs(); startOnlineMatch(netCtx.seed);
        setStatus(t('bombNetConnecting')); renderLobby();
    }

    // ---------------- loop ----------------
    function update() {
        if (!M) return;
        if (M.mode === 'online') { updateOnline(); return; }
        if (world.over) return;
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
        var meId = online() ? M.slot : 0;
        for (var j = 0; j < box.children.length; j++) { var p = world.players[j], chip = box.children[j]; chip.classList.toggle('dead', !p.alive); var nm = online() ? ('P' + (j + 1)) : (j === 0 ? 'P1' : 'CPU'); chip._lab.textContent = nm + (j === meId ? '  ✦' + p.power + ' ✚' + p.bombs + ' »' + (p.speed - CFG.speed + 1) : ''); }
    }

    // ---------------- boot ----------------
    function dirFromKey(k) { k = k.toLowerCase(); if (k === 'arrowup' || k === 'w') return 0; if (k === 'arrowright' || k === 'd') return 1; if (k === 'arrowdown' || k === 's') return 2; if (k === 'arrowleft' || k === 'a') return 3; return -1; }
    function boot() {
        canvas = $('stage'); canvas.width = CW * DPR; canvas.height = CH * DPR;
        ctx = canvas.getContext('2d'); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

        window.addEventListener('keydown', function (e) {
            if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;   // don't hijack the room-code field
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
            restartToReady: false,
            onStart: function () { if (online()) return; newMatch(); },                 // online is driven by startOnlineMatch, not the shell's Start
            reset: function () { if (online()) return; M = null; world = E.create(CFG, 1); syncChips(); render(); },   // never tear down a live online match
            canPause: function () { return false; }, canRestart: function () { return !online(); },
            overlayContent: function (state) {
                if (state === 'idle') return { badge: 'bomb', title: t('bombName'), message: t('bombReady'), button: t('start') };
                if (state === 'over') { var me = online() ? M.slot : 0, ttl = world.winner === me ? t('bombWin') : (world.winner == null ? t('bombDraw') : t('bombLose')); return { badge: world.winner === me ? 'trophy' : 'skull', title: ttl, message: '', button: t('restart') }; }
                return {};
            },
        });
        AC.i18n.subscribe(function () { if (!M) shell.refreshOverlay(); });
        var ob = $('online-btn');
        if (ob) ob.addEventListener('click', function () { AC.audio.unlock(); openLobby(); });
        function netReady() { var N = getNet(); if (N && ob) { ob.hidden = false; if (N.mp.cleanup) N.mp.cleanup(GROUP).catch(function () { }); } }
        if (window.ArcadeNet) netReady(); else window.addEventListener('arcade-net-ready', netReady, { once: true });
        window.addEventListener('beforeunload', function () { if (netCtx && getNet()) { try { netSend({ t: 'bye' }); getNet().mp.leave(netCtx.group, netCtx.code); } catch (e) { } } });
        world = E.create(CFG, 1); syncChips(); render();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
