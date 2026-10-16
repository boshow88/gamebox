/**
 * Beam — a reflex "flash & trace" game, solo or online (2–4 players).
 *
 *   1. A grid of mirrors (/ and \) flashes briefly — memorise it.
 *   2. The mirrors hide; a laser fires from one edge. Tap the border where
 *      you think it exits before the timer runs out.
 *   3. The beam replays: as it reaches the edge the true exit is revealed.
 *
 * SOLO: a miss / timeout costs a life (3), score + combos, endless, grids grow.
 * ONLINE: everyone gets the SAME puzzle (shared seed). Answers stay hidden until
 *   the replay. If some hit and some miss, the ones who missed lose a life. First
 *   to 0 is eliminated to the back of the standings; play continues until one
 *   remains (1st). Everyone still in the room sees the final results.
 *
 * Built on window.ArcadeCommon (shell + loop + audio + i18n) and the shared
 * window.ArcadeNet (Firebase rooms). Online is latency-tolerant by design:
 * the only synced moments are "submit a tiny answer" and "reveal", never a live
 * board — so Firestore's ~100–300ms is invisible.
 */
(function () {
    'use strict';

    var AC = window.ArcadeCommon;
    if (!AC) { console.error('[beam] ArcadeCommon missing'); return; }

    // ---- i18n ----
    Object.assign(AC.i18n.STRINGS.en, {
        beamArcName: 'Beam',
        beamRound: 'Round',
        beamModeSolo: 'Solo', beamModeOnline: 'Online', beamOnlineBtn: 'Online',
        beamWatch: 'Memorise the mirrors!',
        beamRecall: 'Where does it exit?',
        beamReplay: 'Tracing…',
        beamHit: 'Hit!', beamMiss: 'Missed!', beamTimeUp: 'Too slow!',
        beamReadyMsg: 'Mirrors flash, then hide. Trace the laser in your head and tap where it <strong>exits</strong>.',
        beamOverTitle: 'Game Over',
        beamGetReady: 'Get ready!',
        beamSpectating: 'You\u2019re out — watching',
        beamWaitNext: 'Waiting for next round…',
        // lobby
        beamLobbyTitle: 'Online room',
        beamClose: 'Close',
        beamSignInGoogle: 'Sign in with Google', beamSignInGuest: 'Play as guest',
        beamSignedIn: function (n) { return 'Signed in as ' + n; }, beamSignOut: 'Sign out', beamGuest: 'Guest',
        beamCreateRoom: 'Create room', beamRoomCode: 'Code', beamJoinRoom: 'Join',
        beamCopyCode: 'Copy code', beamLeaveRoom: 'Leave', beamCopied: 'Copied!',
        beamReadyUp: 'I\u2019m ready', beamReadyWait: 'Ready — waiting…', beamStartMatch: 'Start match',
        beamWaitingPlayers: 'Waiting for players…', beamNeedTwo: 'Need at least 2 players',
        beamHostStarts: 'The host starts once everyone is ready.', beamSignInFirst: 'Sign in to play online.',
        beamRoomNotFound: 'Room not found', beamRoomFull: 'Room is full', beamAlreadyStarted: 'That match already started',
        beamNetErr: 'Network error', beamPlayers: 'Players', beamYou: 'You', beamHost: 'Host', beamReadyTag: 'Ready',
        beamResultsTitle: 'Final results', beamWinner: function (n) { return n + ' wins!'; },
        beamRematch: 'Rematch', beamRoomGone: 'The room closed.', beamOffline: 'Disconnected',
        beamEndLeft: 'Everyone else left — you win!',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        beamArcName: 'Beam',
        beamRound: '回合',
        beamModeSolo: '單人', beamModeOnline: '連線', beamOnlineBtn: '連線對戰',
        beamWatch: '記住鏡子的位置！',
        beamRecall: '它從哪裡射出？',
        beamReplay: '回放中…',
        beamHit: '命中！', beamMiss: '沒中！', beamTimeUp: '太慢了！',
        beamReadyMsg: '鏡子會先閃現再隱藏。在腦中追蹤雷射，點出它<strong>射出</strong>的邊界位置。',
        beamOverTitle: '遊戲結束',
        beamGetReady: '準備好！',
        beamSpectating: '你已出局，觀戰中',
        beamWaitNext: '等待下一回合…',
        beamLobbyTitle: '連線房間',
        beamClose: '關閉',
        beamSignInGoogle: '用 Google 登入', beamSignInGuest: '以訪客遊玩',
        beamSignedIn: function (n) { return '已登入：' + n; }, beamSignOut: '登出', beamGuest: '訪客',
        beamCreateRoom: '建立房間', beamRoomCode: '房號', beamJoinRoom: '加入',
        beamCopyCode: '複製房號', beamLeaveRoom: '離開', beamCopied: '已複製！',
        beamReadyUp: '我準備好了', beamReadyWait: '已準備，等待中…', beamStartMatch: '開始對戰',
        beamWaitingPlayers: '等待玩家加入…', beamNeedTwo: '至少需要 2 位玩家',
        beamHostStarts: '大家準備好後，由房主開始。', beamSignInFirst: '請先登入才能連線遊玩。',
        beamRoomNotFound: '找不到房間', beamRoomFull: '房間已滿', beamAlreadyStarted: '該場對戰已經開始',
        beamNetErr: '連線錯誤', beamPlayers: '玩家', beamYou: '你', beamHost: '房主', beamReadyTag: '準備',
        beamResultsTitle: '最終名次', beamWinner: function (n) { return n + ' 獲勝！'; },
        beamRematch: '再來一場', beamRoomGone: '房間已關閉。', beamOffline: '已離線',
        beamEndLeft: '其他玩家都離開了，你獲勝！',
    });
    var t = AC.i18n.t;
    function placeLabel(n) {
        if ((AC.i18n.locale || 'en') === 'zh') return '第' + n + '名';
        var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    // ---- geometry / reflection ----
    var EMPTY = 0, SLASH = 1, BACK = 2;
    var U = 0, D = 1, L = 2, R = 3;
    var DR = [-1, 1, 0, 0], DC = [0, 0, -1, 1];
    var OPP = [D, U, R, L];
    var SLASH_MAP = [R, L, D, U];
    var BACK_MAP = [L, R, U, D];
    function reflect(dir, m) { return m === SLASH ? SLASH_MAP[dir] : BACK_MAP[dir]; }

    // ---- layout ----
    var CW = 600, CH = 700, TOPH = 84;
    var MARGIN = 60;
    var GRID = CW - MARGIN * 2, GX = MARGIN, GY = TOPH + Math.round(((CH - TOPH) - GRID) / 2);
    var BEAM = '#22d3ee', BEAM_GLOW = 'rgba(34,211,238,0.35)';

    // ---- tunables ----
    var ANSWER_SEC = 6.0, RESULT_SEC = 1.25;
    function memoSec(m) { return AC.math.clamp(0.9 + 0.11 * m, 0.9, 2.8); }
    function replaySec(b) { return 0.5 + 0.09 * b; }
    // online
    var GROUP = 'beam_rooms', MAX_PLAYERS = 4, HP_START = 3;
    var SETTLE_MS = 500;        // after the answer window, brief wait for in-flight taps before tallying
    var HOST_BUFFER_MS = 800;   // after a round fully plays locally, extra wait before advancing (covers lag)
    var BEAT_MS = 3000;         // presence heartbeat interval
    var STALL_MS = 8000;        // no beat for this long → treated as disconnected
    // adaptive online difficulty: a shared "centre" level that drifts with the group's
    // results (all-right → harder, all-wrong → easier, mixed → hold), plus per-round jitter.
    var LEVEL_MIN = 1, LEVEL_MAX = 38, START_LEVEL = 5;    // level 1 → 2×2 (floor), level 37 → 20×20 (ceiling)
    var STEP_UP = 0.7, STEP_DOWN = 0.9, JITTER = 2.0;      // wider per-round spread → harder to read
    var SOLO_RAMP = 0.6;                                   // solo difficulty climbs ~0.6 level per round (gentler)
    var SOLO_JITTER = 1.0;                                 // solo also varies round-to-round (still trends up)
    var ZERO_MAX = 0.2;                                    // max chance of a straight-through (0-bounce) laser
    // per-player colours (distinct from the cyan laser / green "correct" ring)
    var PCOLORS = ['#f59e0b', '#ec4899', '#a855f7', '#3b82f6', '#f97316', '#eab308', '#8b5cf6', '#ef4444'];
    function colorForOrder(i) { i = i || 0; return PCOLORS[((i % PCOLORS.length) + PCOLORS.length) % PCOLORS.length]; }
    function countSec(round) { return round <= 1 ? 3 : 2; }
    // Long online matches gradually speed up so they always resolve: after ACCEL_START
    // rounds, memorize + answer times shrink a little each round — smooth, never a sudden
    // drop, but relentless (a soft floor keeps it skill, not a coin-flip).
    var ACCEL_START = 6, ACCEL_DECAY = 0.93, ACCEL_FLOOR = 0.12;
    function accelFactor(round) { return round <= ACCEL_START ? 1 : Math.max(ACCEL_FLOOR, Math.pow(ACCEL_DECAY, round - ACCEL_START)); }

    // ---- state ----
    var S = { mode: 'solo', round: 1, score: 0, lives: 3, combo: 0, phase: 'memorize', t: 0, memo: 1.2, replay: 0.7, puzzle: null, choice: null, answerLeft: 0, lastKind: '' };
    var om = null;                         // online match state while S.mode === 'online'
    var canvas, ctx, DPR = Math.min(window.devicePixelRatio || 1, 2), shell = null;

    // ===============================================================
    // puzzle (deterministic when given a seeded rng)
    // ===============================================================
    function cellCenter(r, c, N) { var cs = GRID / N; return { x: GX + (c + 0.5) * cs, y: GY + (r + 0.5) * cs }; }
    // The answer "ports" are CELL-shaped tiles hugging the grid edge: top/bottom tiles
    // are as wide as a grid column, left/right tiles as tall as a grid row.
    function portDepth(N) { var cs = GRID / N; return Math.min(cs, MARGIN - 6); }
    function portRect(r, c, side, N) {
        var cs = GRID / N, pd = portDepth(N), g = Math.min(2, cs * 0.06);
        if (side === U) return { x: GX + c * cs + g, y: GY - pd, w: cs - 2 * g, h: pd - g };
        if (side === D) return { x: GX + c * cs + g, y: GY + GRID + g, w: cs - 2 * g, h: pd - g };
        if (side === L) return { x: GX - pd, y: GY + r * cs + g, w: pd - g, h: cs - 2 * g };
        return { x: GX + GRID + g, y: GY + r * cs + g, w: pd - g, h: cs - 2 * g };
    }
    function portCenter(r, c, side, N) { var R = portRect(r, c, side, N); return { x: R.x + R.w / 2, y: R.y + R.h / 2 }; }
    // where the beam crosses the grid boundary for a border cell (so the trace stays INSIDE the grid)
    function gridEdge(r, c, side, N) {
        var cs = GRID / N;
        if (side === U) return { x: GX + (c + 0.5) * cs, y: GY };
        if (side === D) return { x: GX + (c + 0.5) * cs, y: GY + GRID };
        if (side === L) return { x: GX, y: GY + (r + 0.5) * cs };
        return { x: GX + GRID, y: GY + (r + 0.5) * cs };
    }
    // forgiving hit test: any tap in the border band, aligned with a column/row, selects that tile
    function hitPort(x, y, N) {
        var cs = GRID / N, cl = function (v) { return Math.max(0, Math.min(N - 1, v | 0)); };
        if (x >= GX && x <= GX + GRID) {
            if (y < GY && y >= GY - MARGIN) return { r: 0, c: cl((x - GX) / cs), side: U };
            if (y > GY + GRID && y <= GY + GRID + MARGIN) return { r: N - 1, c: cl((x - GX) / cs), side: D };
        }
        if (y >= GY && y <= GY + GRID) {
            if (x < GX && x >= GX - MARGIN) return { r: cl((y - GY) / cs), c: 0, side: L };
            if (x > GX + GRID && x <= GX + GRID + MARGIN) return { r: cl((y - GY) / cs), c: N - 1, side: R };
        }
        return null;
    }
    function portList(N) {
        var out = [];
        for (var c = 0; c < N; c++) { out.push({ r: 0, c: c, side: U }); out.push({ r: N - 1, c: c, side: D }); }
        for (var r = 0; r < N; r++) { out.push({ r: r, c: 0, side: L }); out.push({ r: r, c: N - 1, side: R }); }
        return out;
    }
    function trace(grid, N, entry) {
        var r = entry.r, c = entry.c, dir = OPP[entry.side], steps = 0, bounces = 0;
        var pts = [gridEdge(entry.r, entry.c, entry.side, N)];      // beam enters at the grid edge (not out in the band)
        while (true) {
            pts.push(cellCenter(r, c, N));
            var m = grid[r * N + c];
            if (m !== EMPTY) { bounces++; dir = reflect(dir, m); }
            var nr = r + DR[dir], nc = c + DC[dir];
            if (nr < 0 || nc < 0 || nr >= N || nc >= N) { pts.push(gridEdge(r, c, dir, N)); return { exit: { r: r, c: c, side: dir }, points: pts, bounces: bounces, looped: false }; }
            r = nr; c = nc;
            if (++steps > 4 * N * N) return { looped: true };
        }
    }
    function samePort(a, b) { return a && b && a.r === b.r && a.c === b.c && a.side === b.side; }
    // Difficulty is driven by a continuous `level`. The PRIMARY lever is mirror
    // COMPLEXITY (how many mirrors you must memorise — grid size + count). The laser
    // PATH is deliberately NOT tuned to a target: we pick a RANDOM valid laser, so the
    // bounce count varies widely — sometimes many, sometimes few, sometimes ZERO
    // (straight through) — which keeps even strong players from pre-guessing the exit.
    function paramsForLevel(level) {
        level = Math.max(1, level);
        var N = AC.math.clamp(2 + Math.floor((level - 1) / 2), 2, 20), cells = N * N;   // 2×2 floor → 20×20 ceiling
        var frac = AC.math.clamp(0.12 + 0.018 * level, 0.12, 0.42);        // mirror density = primary difficulty
        var M = AC.math.clamp(Math.round(cells * frac), 1, Math.floor(cells * 0.45));
        return { N: N, M: M };
    }
    function genPuzzleLevel(level, rng) {
        rng = rng || Math.random;
        var pr = paramsForLevel(level), N = pr.N, M = pr.M, cells = N * N;
        var ports = portList(N);
        for (var attempt = 0; attempt < 80; attempt++) {
            var grid = new Int8Array(cells), order = [];
            for (var i = 0; i < cells; i++) order.push(i);
            for (var j = order.length - 1; j > 0; j--) { var k = (rng() * (j + 1)) | 0; var tmp = order[j]; order[j] = order[k]; order[k] = tmp; }
            for (var mi = 0; mi < M; mi++) grid[order[mi]] = rng() < 0.5 ? SLASH : BACK;
            // any laser that cleanly exits is fair game — pick one at random (bounces may be 0..many)
            var valid = [];
            for (var e = 0; e < ports.length; e++) {
                var res = trace(grid, N, ports[e]);
                if (res.looped || samePort(res.exit, ports[e])) continue;
                valid.push({ entry: ports[e], res: res });
            }
            if (valid.length) {
                var bouncers = valid.filter(function (v) { return v.res.bounces >= 1; });
                var pool = (bouncers.length && rng() >= ZERO_MAX) ? bouncers : valid;   // cap how often a straight-through is picked
                var pick = pool[(rng() * pool.length) | 0];
                return build(N, grid, pick.entry, pick.res);
            }
        }
        var g = new Int8Array(cells), ee = portList(N)[0], rr = trace(g, N, ee);   // degenerate fallback
        return build(N, g, ee, rr);
    }
    function build(N, grid, entry, res) {
        var seg = [0], total = 0;
        for (var i = 1; i < res.points.length; i++) { total += Math.hypot(res.points[i].x - res.points[i - 1].x, res.points[i].y - res.points[i - 1].y); seg.push(total); }
        return { N: N, grid: grid, entry: entry, exit: res.exit, points: res.points, seg: seg, total: total, bounces: res.bounces };
    }
    function countMirrors(p) { var n = 0; for (var i = 0; i < p.grid.length; i++) if (p.grid[i] !== EMPTY) n++; return n; }
    function puzzleForLevel(seed, round, level) { return genPuzzleLevel(level, AC.rng.make((seed + round * 7919) >>> 0)); }

    // ===============================================================
    // SOLO
    // ===============================================================
    function soloNewPuzzle() {
        var level = Math.max(1, 1 + (S.round - 1) * SOLO_RAMP + (Math.random() * 2 - 1) * SOLO_JITTER);   // gentler climb, still varies
        S.puzzle = genPuzzleLevel(level, Math.random);
        S.choice = null; S.lastKind = '';
        S.memo = memoSec(S.puzzle.bounces + countMirrors(S.puzzle));
        soloPhase('memorize'); AC.audio.play('click');
    }
    function soloReset() { S.round = 1; S.score = 0; S.lives = 3; S.combo = 0; soloNewPuzzle(); syncHud(); }
    function soloPhase(p) { S.phase = p; S.t = 0; if (p === 'replay') { S.replay = replaySec(S.puzzle.bounces); AC.audio.play('laser'); } }
    function soloJudge() {
        var correct = samePort(S.choice, S.puzzle.exit);
        if (correct) {
            var speed = Math.round((S.answerLeft / ANSWER_SEC) * 120), mult = 1 + Math.min(S.combo, 5) * 0.2;
            S.score += Math.round((100 + speed + S.round * 10) * mult); S.combo++; S.lastKind = 'hit';
            AC.audio.play('gem'); bump('score');
        } else { S.lives--; S.combo = 0; S.lastKind = S.choice ? 'miss' : 'timeup'; AC.audio.play('explode'); bump('lives'); }
        syncHud();
    }
    function soloAdvance() { if (S.lives <= 0) { shell.gameOver({ score: S.score, win: false, meta: { round: S.round } }); return; } S.round++; soloNewPuzzle(); syncHud(); }
    function updateSolo(dt) {
        S.t += dt;
        if (S.phase === 'memorize') { if (S.t >= S.memo) soloPhase('answer'); }
        else if (S.phase === 'answer') { if (S.t >= ANSWER_SEC) { S.choice = null; S.answerLeft = 0; soloPhase('replay'); } }
        else if (S.phase === 'replay') { if (S.t >= S.replay) { soloJudge(); soloPhase('result'); } }
        else if (S.phase === 'result') { if (S.t >= RESULT_SEC) soloAdvance(); }
    }

    // ===============================================================
    // ONLINE match
    // ===============================================================
    // local phase from the moment this client started the current round
    function phaseAt(nowMs) {
        var e = (nowMs - om.localStart) / 1000, c = countSec(om.round);
        if (e < c) return { phase: 'countdown', remain: c - e };
        var tt = e - c;
        if (tt < om.memo) return { phase: 'memorize', ts: tt };
        tt -= om.memo;
        if (tt < om.answerSec) return { phase: 'answer', ts: tt };
        tt -= om.answerSec;
        if (tt < om.replay) return { phase: 'reveal', ts: tt };
        tt -= om.replay;
        if (tt < RESULT_SEC) return { phase: 'result', ts: tt };
        return { phase: 'await' };
    }
    function startLocalRound(round, data) {
        var g = data.game || {};
        om.round = round;
        om.localStart = performance.now();
        om.level = (g.level != null) ? g.level : START_LEVEL;          // shared difficulty for this round
        om.puzzle = puzzleForLevel(om.seed, round, om.level);
        var sp = accelFactor(round);                                   // long matches squeeze the clock
        om.memo = memoSec(om.puzzle.bounces + countMirrors(om.puzzle)) * sp;
        om.answerSec = ANSWER_SEC * sp;
        om.replay = replaySec(om.puzzle.bounces);
        om.choice = null; om.submitted = false; om.lastPhase = '';
        om.alive = !(g.alive && g.alive[om.myUid] === false);
        om.hpStart = Object.assign({}, g.hp || {});       // pre-round snapshot — shown until the reveal (no spoiler)
        om.aliveStart = Object.assign({}, g.alive || {});
        if (om.host) { om.host.tallied = false; om.host.over = false; }
        AC.audio.play('click');
    }
    function myCorrect() { return om && om.choice && om.puzzle && samePort(om.choice, om.puzzle.exit); }

    function enterMatch(data) {
        if (S.mode === 'online') return;
        var g = data.game || {};
        S.mode = 'online';
        om = { myUid: netUser.uid, seed: g.seed || 0, round: 0, localStart: 0, puzzle: null, choice: null, submitted: false, alive: true, over: false, lastPhase: '', hpStart: {}, aliveStart: {}, host: { tallied: false, over: false } };
        closeLobby();
        hideShellOverlay();
        applyHudMode();
        setControlsForMatch(true);
        if (!shell.isPlaying()) shell.start();      // reset() no-ops in online; the loop drives renderOnline
        startLocalRound(g.round || 1, data);
        renderPlayersBar(data);
    }
    function exitMatch() {
        om = null; S.mode = 'solo';
        setControlsForMatch(false);
        var pb = $('players'); if (pb) pb.hidden = true;
        applyHudMode();
        shell.goIdle();                              // back to the solo ready screen (lobby overlay may sit on top)
    }
    function onRoom(data, err) {
        if (err) { showLobbyError(err); return; }
        if (!data) {                                  // room vanished
            if (S.mode === 'online') { if (AC.toast) AC.toast.show(t('beamRoomGone')); exitMatch(); }
            if (room) room.data = null; renderLobby(); return;
        }
        if (room) room.data = data;
        var g = data.game || {};
        updatePres(g);
        if (S.mode !== 'online') {                    // sitting in the lobby
            if (g.status === 'playing') { enterMatch(data); return; }
            renderLobby(); return;
        }
        // in a match
        if (g.status === 'playing') {
            om.over = false;
            if (g.round && g.round !== om.round) startLocalRound(g.round, data);
            else om.alive = !(g.alive && g.alive[om.myUid] === false);
            renderPlayersBar(data);
            if (lobbyEl && !lobbyEl.hidden) renderLobby();
        } else if (g.status === 'over') {
            if (g.round && g.round !== om.round) startLocalRound(g.round, data);
            renderPlayersBar(data);
            if (!om.over) { om.over = true; openLobby(); if (g.endReason === 'left' && AC.toast) AC.toast.show(t('beamEndLeft')); }   // reveal the final standings once
            renderLobby();
        } else {                                      // reset back to lobby (rematch)
            var hadMatch = !!om;
            if (hadMatch) { exitMatch(); openLobby(); }
            renderLobby();
        }
    }

    // submit (or CHANGE) my answer — you can re-pick freely until the answer window ends
    // (hidden to others until the host reveals). The latest pick is what counts.
    function submitAnswer(port) {
        if (!om || !om.alive) return;
        om.choice = port; om.submitted = true;
        AC.audio.play('click');
        net.mp.update(GROUP, room.code, { ['game.answers.' + om.myUid]: { r: port.r, c: port.c, side: port.side, at: Date.now() } }).catch(function () { });
    }

    // ---- host authority (effective host = host if present, else first in join order present) ----
    // The player who drives the match. Prefer the named host, but if they left OR
    // dropped (no heartbeat), the first LIVE player in join order auto-takes over —
    // so a host closing their tab mid-match never freezes the room.
    function effectiveHost(d) {
        var players = d.players || {};
        if (d.hostUid && players[d.hostUid] && !isStale(d.hostUid)) return d.hostUid;
        var order = d.order || Object.keys(players);
        for (var i = 0; i < order.length; i++) if (players[order[i]] && !isStale(order[i])) return order[i];
        for (var j = 0; j < order.length; j++) if (players[order[j]]) return order[j];   // all stale → anyone present
        return null;
    }
    // Runs whenever we're attached to a room (lobby OR match) so presence works everywhere.
    function watchdog() {
        if (!net || !room || !room.data || !netUser) return;
        var d = room.data, g = d.game || {}, now = Date.now();
        if (!beatT || now - beatT > BEAT_MS) { beatT = now; beatN++; net.mp.update(GROUP, room.code, { ['game.beat.' + netUser.uid]: beatN }).catch(function () { }); }
        if (effectiveHost(d) === netUser.uid && (!gcT || now - gcT > 15000)) { gcT = now; net.mp.cleanup(GROUP).catch(function () { }); }
        if (S.mode === 'online' && om && g.status === 'playing' && effectiveHost(d) === om.myUid) { hostCheckForfeit(d, g); if (!om.host.over) hostDrive(d, g); }
    }
    // If everyone but (at most) one has left/disconnected, end the match NOW by walkover
    // (don't make the survivor wait out a round) and flag it so they're told WHY they won.
    function hostCheckForfeit(d, g) {
        if (g.status !== 'playing' || om.host.over) return;
        var players = d.players || {}, order = d.order || Object.keys(players), alive = g.alive || {};
        var aliveNow = order.filter(function (u) { return alive[u] !== false; });
        if (aliveNow.length < 2) return;
        var live = aliveNow.filter(function (u) { return players[u] && !isStale(u); });
        if (live.length > 1) return;                       // still a contest
        var winner = live[0] || null, cnt = aliveNow.length;
        var ranks = Object.assign({}, g.rankByUid || {}), aliveMap = Object.assign({}, alive);
        var dropped = aliveNow.filter(function (u) { return u !== winner; }).sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
        dropped.forEach(function (u) { aliveMap[u] = false; ranks[u] = cnt; cnt--; });
        if (winner) ranks[winner] = 1;
        om.host.over = true;
        net.mp.update(GROUP, room.code, { 'game.alive': aliveMap, 'game.rankByUid': ranks, 'game.status': 'over', 'game.winner': winner, 'game.endReason': 'left', 'status': 'lobby' }).catch(function () { });
    }
    function hostDrive(d, g) {
        if (g.round !== om.round || om.host.over) return;      // stale echo, or match already decided
        var r = g.round, nowp = performance.now(), full = countSec(r) + om.memo + om.answerSec;
        var answerEnd = om.localStart + full * 1000;
        var roundEnd = om.localStart + (full + om.replay + RESULT_SEC) * 1000;
        if (!om.host.tallied) {
            // tally only once the window is truly over (+ a short settle for in-flight taps) so
            // players can keep CHANGING their answer right up to the end
            if (nowp >= answerEnd + SETTLE_MS) { hostTally(d, g); om.host.tallied = true; }
        } else if (g.status === 'playing' && nowp >= roundEnd + HOST_BUFFER_MS) {
            hostNextRound(d, g);                                // advance only after the whole round (incl. reveal) has played
        }
    }
    function hostTally(d, g) {
        var r = g.round, players = d.players || {}, order = d.order || Object.keys(players);
        var exit = om.puzzle.exit, answers = g.answers || {};
        var hp = Object.assign({}, g.hp || {}), alive = Object.assign({}, g.alive || {}), ranks = Object.assign({}, g.rankByUid || {});
        var results = {};
        var aliveBefore = order.filter(function (u) { return alive[u] !== false; });
        // a player who left the room OR stopped sending heartbeats is eliminated immediately
        var present = aliveBefore.filter(function (u) { return players[u] && !isStale(u); });
        var gone = aliveBefore.filter(function (u) { return !players[u] || isStale(u); });
        var correct = [], wrong = [];
        present.forEach(function (u) {
            var a = answers[u], ok = a && a.side != null && samePort({ r: a.r, c: a.c, side: a.side }, exit);
            results[u] = ok ? 1 : 0;
            (ok ? correct : wrong).push(u);
        });
        var deaths = [];
        // only deal damage when it's MIXED (some hit, some miss); all-hit or all-miss is harmless
        if (correct.length > 0 && wrong.length > 0) {
            wrong.forEach(function (u) { hp[u] = (hp[u] || 0) - 1; if (hp[u] <= 0) deaths.push(u); });
        }
        gone.forEach(function (u) { if (deaths.indexOf(u) === -1) deaths.push(u); });   // left → out
        // assign the worst remaining places to those eliminated this round (join order tiebreak)
        var aliveCount = aliveBefore.length;
        deaths.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
        deaths.forEach(function (u) { alive[u] = false; ranks[u] = aliveCount; aliveCount--; });
        var remaining = aliveBefore.filter(function (u) { return alive[u] !== false; });
        var over = remaining.length <= 1, winner = null;
        if (over && remaining.length === 1) { ranks[remaining[0]] = 1; winner = remaining[0]; }
        // adaptive difficulty: all-right together → harder; all-wrong together → easier; mixed → hold
        if (om.host.center == null) om.host.center = (g.center != null ? g.center : START_LEVEL);
        if (correct.length > 0 && wrong.length === 0) om.host.center = Math.min(LEVEL_MAX, om.host.center + STEP_UP);
        else if (wrong.length > 0 && correct.length === 0) om.host.center = Math.max(LEVEL_MIN, om.host.center - STEP_DOWN);
        var patch = {
            'game.hp': hp, 'game.alive': alive, 'game.results': results, 'game.revealedRound': r, 'game.rankByUid': ranks, 'game.center': om.host.center,
        };
        if (over) { patch['game.status'] = 'over'; patch['game.winner'] = winner; patch['game.endReason'] = (gone.length > 0 ? 'left' : 'normal'); patch['status'] = 'lobby'; }  // reopen room for rematch/rejoin
        om.host.over = over;                                   // guard local advance until the 'over' echo lands
        net.mp.update(GROUP, room.code, patch).catch(function () { });
    }
    function hostNextRound(d, g) {
        var nr = (g.round || 1) + 1;
        var center = (om.host.center != null) ? om.host.center : (g.center != null ? g.center : START_LEVEL);
        var level = AC.math.clamp(center + (Math.random() * 2 - 1) * JITTER, LEVEL_MIN, LEVEL_MAX);   // per-round spread around the centre
        net.mp.update(GROUP, room.code, { 'game.round': nr, 'game.level': level, 'game.answers': {}, 'game.results': {}, 'game.revealedRound': 0 }).catch(function () { });
        var d2 = { game: Object.assign({}, g, { round: nr, level: level }), players: d.players };
        startLocalRound(nr, d2);   // advance the host locally in lockstep with the write (with the new level)
    }

    function updateOnline() {
        if (!om || !om.puzzle) return;
        var ph = phaseAt(performance.now()).phase;
        if (ph !== om.lastPhase) {
            if (ph === 'reveal') AC.audio.play('laser');
            if (ph === 'result') { if (om.alive) AC.audio.play(myCorrect() ? 'gem' : 'explode'); }
            // the ✓/✗ + HP only reveal once WE locally reach the reveal (never during the hidden-answer phase)
            if ((ph === 'reveal' || ph === 'result' || ph === 'await') && room && room.data) renderPlayersBar(room.data);
            om.lastPhase = ph;
        }
    }

    // ===============================================================
    // input
    // ===============================================================
    function onPointer(ev) {
        var rect = canvas.getBoundingClientRect();
        var cx = (ev.clientX - rect.left) / rect.width * CW, cy = (ev.clientY - rect.top) / rect.height * CH;
        if (S.mode === 'online') {
            if (!om || !om.alive || !om.puzzle) return;             // may re-pick until the window ends
            if (phaseAt(performance.now()).phase !== 'answer') return;
            var p1 = hitPort(cx, cy, om.puzzle.N); if (!p1 || samePort(p1, om.puzzle.entry)) return;
            if (om.choice && samePort(p1, om.choice)) return;        // tapped the same tile → no change
            ev.preventDefault(); submitAnswer(p1); return;
        }
        if (!shell.isPlaying() || S.phase !== 'answer' || !S.puzzle) return;
        var p2 = hitPort(cx, cy, S.puzzle.N); if (!p2 || samePort(p2, S.puzzle.entry)) return;
        ev.preventDefault();
        S.choice = p2; S.answerLeft = Math.max(0, ANSWER_SEC - S.t); AC.audio.play('click'); soloPhase('replay');
    }

    // ===============================================================
    // render helpers
    // ===============================================================
    function clear() { ctx.clearRect(0, 0, CW, CH); }
    function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function drawGrid(N) {
        var cs = GRID / N;
        roundRect(GX - 4, GY - 4, GRID + 8, GRID + 8, 12); ctx.fillStyle = 'rgba(148,163,184,0.08)'; ctx.fill();
        ctx.strokeStyle = 'rgba(148,163,184,0.22)'; ctx.lineWidth = 1;
        for (var i = 0; i <= N; i++) {
            ctx.beginPath(); ctx.moveTo(GX + i * cs, GY); ctx.lineTo(GX + i * cs, GY + GRID); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(GX, GY + i * cs); ctx.lineTo(GX + GRID, GY + i * cs); ctx.stroke();
        }
    }
    function drawMirror(r, c, m, N, alpha) {
        var cs = GRID / N, pad = cs * 0.22, x0 = GX + c * cs, y0 = GY + r * cs;
        ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = Math.max(3, cs * 0.09); ctx.lineCap = 'round';
        ctx.beginPath();
        if (m === SLASH) { ctx.moveTo(x0 + cs - pad, y0 + pad); ctx.lineTo(x0 + pad, y0 + cs - pad); }
        else { ctx.moveTo(x0 + pad, y0 + pad); ctx.lineTo(x0 + cs - pad, y0 + cs - pad); }
        ctx.stroke(); ctx.restore();
    }
    function drawMirrors(p, alpha) { for (var i = 0; i < p.grid.length; i++) if (p.grid[i] !== EMPTY) drawMirror((i / p.N) | 0, i % p.N, p.grid[i], p.N, alpha); }
    // ---- border-tile helpers ----
    function cellPath(R) { roundRect(R.x, R.y, R.w, R.h, Math.max(3, Math.min(8, Math.min(R.w, R.h) * 0.22))); }
    function fillCell(R, color, alpha, glow) { ctx.save(); if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 12; } ctx.globalAlpha = alpha == null ? 1 : alpha; cellPath(R); ctx.fillStyle = color; ctx.fill(); ctx.restore(); }
    function strokeCell(R, color, lw) { ctx.save(); cellPath(R); ctx.strokeStyle = color; ctx.lineWidth = lw || 2; ctx.stroke(); ctx.restore(); }
    // your current pick — bold so it's unmistakable (filled colour + bright glowing border)
    function highlightCell(R, color) { fillCell(R, color, 0.6, true); strokeCell(R, '#ffffff', 3.5); }
    // the laser SOURCE: light up the entry tile + a small inward arrow (no line into the centre)
    function drawEntry(p) {
        var e = p.entry, R = portRect(e.r, e.c, e.side, p.N), cen = portCenter(e.r, e.c, e.side, p.N);
        fillCell(R, BEAM, 0.92, true);
        var dir = OPP[e.side], ux = DC[dir], uy = DR[dir], px = -uy, py = ux, len = Math.min(R.w, R.h) * 0.3;
        ctx.save(); ctx.fillStyle = '#052630';
        ctx.beginPath(); ctx.moveTo(cen.x + ux * len, cen.y + uy * len);
        ctx.lineTo(cen.x - ux * len + px * len * 0.75, cen.y - uy * len + py * len * 0.75);
        ctx.lineTo(cen.x - ux * len - px * len * 0.75, cen.y - uy * len - py * len * 0.75);
        ctx.closePath(); ctx.fill(); ctx.restore();
    }
    function drawPorts(p) {
        var N = p.N, ports = portList(N);
        for (var i = 0; i < ports.length; i++) {
            if (samePort(ports[i], p.entry)) continue;
            var R = portRect(ports[i].r, ports[i].c, ports[i].side, N);
            fillCell(R, 'rgba(34,211,238,0.14)', 1); strokeCell(R, 'rgba(34,211,238,0.85)', 2);
        }
    }
    function lightExit(p) { fillCell(portRect(p.exit.r, p.exit.c, p.exit.side, p.N), '#34d399', 0.92, true); }
    function drawBeamUpTo(p, frac) {
        var dist = p.total * frac, pts = p.points, seg = p.seg;
        ctx.save(); ctx.strokeStyle = BEAM; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowColor = BEAM_GLOW; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) {
            if (seg[i] <= dist) ctx.lineTo(pts[i].x, pts[i].y);
            else { var span = seg[i] - seg[i - 1], f = span > 0 ? (dist - seg[i - 1]) / span : 0; ctx.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f); break; }
        }
        ctx.stroke(); ctx.restore();
    }
    // one player's guess as a filled dot inside its tile (used by solo)
    function drawDotInCell(port, N, color, idx, count) {
        var R = portRect(port.r, port.c, port.side, N), horiz = (port.side === U || port.side === D), f = (idx + 1) / (count + 1);
        var cx = horiz ? (R.x + R.w * f) : (R.x + R.w / 2), cy = horiz ? (R.y + R.h / 2) : (R.y + R.h * f);
        var rad = AC.math.clamp((horiz ? R.w / (count + 1) : R.h / (count + 1)) * 0.42, 3, 12);
        ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(2,14,20,0.55)'; ctx.stroke(); ctx.restore();
    }
    var TIMER_Y = 62, TIMER_H = 9;
    function drawTimerBar(frac, danger) {
        ctx.strokeStyle = 'rgba(148,163,184,0.25)'; ctx.lineWidth = 1; roundRect(GX, TIMER_Y, GRID, TIMER_H, TIMER_H / 2); ctx.stroke();
        ctx.fillStyle = danger ? '#f87171' : BEAM; roundRect(GX, TIMER_Y, GRID * AC.math.clamp(frac, 0, 1), TIMER_H, TIMER_H / 2); ctx.fill();
    }
    function caption(text, color) {
        ctx.fillStyle = color || 'rgba(226,232,240,0.92)';
        ctx.font = '800 26px ' + (getComputedStyle(document.body).getPropertyValue('--font-display') || 'sans-serif');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, CW / 2, 36);
    }
    function bigCountdown(n) {
        ctx.fillStyle = BEAM; ctx.font = '800 92px ' + (getComputedStyle(document.body).getPropertyValue('--font-display') || 'sans-serif');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), GX + GRID / 2, GY + GRID / 2);
    }

    // ===============================================================
    // render (both modes share the helpers)
    // ===============================================================
    function render() {
        if (!ctx) return;
        clear();
        if (S.mode === 'online') { renderOnline(); return; }
        var p = S.puzzle; if (!p) return;
        drawGrid(p.N);
        if (S.phase === 'memorize') { drawMirrors(p, 1); drawTimerBar(1 - S.t / S.memo, false); caption(t('beamWatch'), BEAM); }
        else if (S.phase === 'answer') { drawPorts(p); drawEntry(p); var left = 1 - S.t / ANSWER_SEC; drawTimerBar(left, left < 0.25); caption(t('beamRecall')); }
        else if (S.phase === 'replay') { drawMirrors(p, AC.math.clamp(S.t / 0.25, 0, 1)); drawEntry(p); if (S.choice) strokeCell(portRect(S.choice.r, S.choice.c, S.choice.side, p.N), '#e2e8f0', 2); drawBeamUpTo(p, S.t / S.replay); caption(t('beamReplay')); }
        else { drawMirrors(p, 1); drawEntry(p); drawBeamUpTo(p, 1); lightExit(p); if (S.choice && !samePort(S.choice, p.exit)) fillCell(portRect(S.choice.r, S.choice.c, S.choice.side, p.N), '#f87171', 0.85); caption(S.lastKind === 'hit' ? t('beamHit') : (S.lastKind === 'timeup' ? t('beamTimeUp') : t('beamMiss')), S.lastKind === 'hit' ? '#34d399' : '#f87171'); }
    }
    function renderOnline() {
        var p = om && om.puzzle; if (!p) return;
        var info = phaseAt(performance.now()), ph = info.phase;
        drawGrid(p.N);
        if (ph === 'countdown') { caption(t('beamGetReady'), BEAM); bigCountdown(Math.ceil(info.remain)); return; }
        if (ph === 'memorize') { drawMirrors(p, 1); drawTimerBar(1 - info.ts / om.memo, false); caption(t('beamWatch'), BEAM); return; }
        if (ph === 'answer') {
            if (om.alive) drawPorts(p); drawEntry(p);
            var left = 1 - info.ts / om.answerSec; drawTimerBar(left, left < 0.25);
            if (om.choice) { var mc = colorForOrder((room.data && room.data.players && room.data.players[om.myUid]) ? room.data.players[om.myUid].order : 0); highlightCell(portRect(om.choice.r, om.choice.c, om.choice.side, p.N), mc); }
            caption(om.alive ? t('beamRecall') : t('beamSpectating'), om.alive ? null : '#94a3b8'); return;
        }
        if (ph === 'reveal') { drawMirrors(p, AC.math.clamp(info.ts / 0.25, 0, 1)); drawEntry(p); drawPicks(p); drawBeamUpTo(p, info.ts / om.replay); caption(t('beamReplay')); return; }
        if (ph === 'result') {
            drawMirrors(p, 1); drawEntry(p); drawBeamUpTo(p, 1); lightExit(p); drawPicks(p);
            if (!om.alive) caption(t('beamSpectating'), '#94a3b8');
            else caption(myCorrect() ? t('beamHit') : (om.choice ? t('beamMiss') : t('beamTimeUp')), myCorrect() ? '#34d399' : '#f87171');
            return;
        }
        // await next round
        drawMirrors(p, 1); drawEntry(p); drawBeamUpTo(p, 1); lightExit(p); drawPicks(p); caption(t('beamWaitNext'), '#94a3b8');
    }
    // Everyone's chosen exit, colour-coded per player. Picks on the same tile are laid
    // out across it (horizontally on top/bottom tiles, vertically on left/right ones),
    // shown only from the reveal on — so you witness who hit and who missed.
    function drawPicks(p) {
        if (!room || !room.data) return;
        var g = room.data.game || {}, answers = g.answers || {}, players = room.data.players || {}, order = room.data.order || Object.keys(players);
        var groups = {};
        order.forEach(function (uid) {
            var a = answers[uid]; if (!a || a.side == null) return;
            if (g.hp && !(uid in g.hp)) return;                 // not in this match roster
            var key = a.r + '|' + a.c + '|' + a.side; (groups[key] = groups[key] || []).push(uid);
        });
        for (var key in groups) {
            var list = groups[key], a0 = answers[list[0]], port = { r: a0.r, c: a0.c, side: a0.side };
            for (var i = 0; i < list.length; i++) drawDotInCell(port, p.N, colorForOrder(players[list[i]] ? players[list[i]].order : 0), i, list.length);
        }
    }

    // ===============================================================
    // HUD + players strip
    // ===============================================================
    function $(id) { return document.getElementById(id); }
    function bump(id) { var el = $(id); if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    function syncHud() {
        if ($('score')) $('score').textContent = AC.format.score(S.score);
        if ($('round')) $('round').textContent = (S.mode === 'online' && om) ? om.round : S.round;
        if ($('lives')) $('lives').textContent = S.lives;
    }
    function applyHudMode() {
        var online = S.mode === 'online';
        ['stat-score', 'stat-lives', 'stat-best'].forEach(function (id) { var e = $(id); if (e) e.style.display = online ? 'none' : ''; });
    }
    function pname(uid, players) { var p = players && players[uid]; return (p && p.name) || t('beamGuest'); }
    function renderPlayersBar(data) {
        var bar = $('players'); if (!bar) return;
        if (S.mode !== 'online' || !om || !data) { bar.hidden = true; return; }
        bar.hidden = false; bar.innerHTML = '';
        var g = data.game || {}, players = data.players || {}, order = data.order || Object.keys(players);
        var ph = phaseAt(performance.now()).phase;
        var showOut = (ph === 'reveal' || ph === 'result' || ph === 'await');   // reveal HP/✓/✗ only from here (no spoiler)
        var hpSrc = showOut ? (g.hp || {}) : (om.hpStart || {});
        var aliveSrc = showOut ? (g.alive || {}) : (om.aliveStart || {});
        var revealed = showOut && g.revealedRound === g.round && g.results;
        order.forEach(function (uid) {
            if (!players[uid]) return;
            if (g.hp && !(uid in g.hp)) return;                 // not part of this match roster
            var dead = aliveSrc[uid] === false, stale = !dead && isStale(uid);
            var chip = document.createElement('div');
            chip.className = 'pchip' + (uid === om.myUid ? ' me' : '') + ((dead || stale) ? ' dead' : '');
            var dot = document.createElement('span'); dot.textContent = '\u25cf'; dot.style.color = colorForOrder(players[uid] ? players[uid].order : 0); chip.appendChild(dot);
            var name = document.createElement('span'); name.textContent = pname(uid, players) + (uid === om.myUid ? ' (' + t('beamYou') + ')' : '');
            chip.appendChild(name);
            if (dead) {
                var rk = document.createElement('span'); rk.className = 'rank'; rk.textContent = (g.rankByUid && g.rankByUid[uid]) ? placeLabel(g.rankByUid[uid]) : '✕'; chip.appendChild(rk);
            } else {
                var hp = (hpSrc[uid] != null) ? hpSrc[uid] : HP_START;
                var hearts = document.createElement('span'); hearts.className = 'hp'; hearts.textContent = '\u2665'.repeat(Math.max(0, hp)); chip.appendChild(hearts);
                if (revealed && g.results[uid] != null) { var res = document.createElement('span'); res.className = 'res ' + (g.results[uid] ? 'ok' : 'no'); res.textContent = g.results[uid] ? '✓' : '✗'; chip.appendChild(res); }
                if (stale) { var off = document.createElement('span'); off.textContent = ' \u26a0'; off.title = t('beamOffline'); chip.appendChild(off); }
            }
            bar.appendChild(chip);
        });
        syncHud();
    }

    // ===============================================================
    // lobby (sign-in + room code; modeled on Rune Stones, N players)
    // ===============================================================
    var net = null, netUser = undefined, room = null, lobbyEl = null, lobbyRefs = null;
    var pres = {}, beatN = 0, beatT = 0, gcT = 0;        // presence: who is still sending heartbeats
    // track each player's beat; `at` is OUR local time it last changed (no cross-client clock needed)
    function updatePres(g) {
        var beats = (g && g.beat) || {}, now = Date.now();
        for (var uid in beats) { var p = pres[uid]; if (!p) pres[uid] = { v: beats[uid], at: now }; else if (p.v !== beats[uid]) { p.v = beats[uid]; p.at = now; } }
    }
    function isStale(uid) { var p = pres[uid]; return !!p && (Date.now() - p.at) > STALL_MS; }
    function elc(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function lbtn(label, cls) { var b = elc('button', cls || 'btn', label); b.type = 'button'; return b; }
    function lrow() { var r = elc('div', 'lobby-row'); for (var i = 0; i < arguments.length; i++) if (arguments[i]) r.appendChild(arguments[i]); return r; }
    function buildLobby() {
        var wrap = document.querySelector('.stage-wrap') || document.body;
        var ov = elc('div', 'overlay'); ov.id = 'lobby'; ov.hidden = true;
        ov.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        var card = elc('div', 'overlay-card');
        var title = elc('h2', 'overlay-title'); var auth = elc('div', 'lobby-auth'); var roomBox = elc('div', 'lobby-room'); var status = elc('p', 'lobby-status');
        var close = lbtn('', 'btn'); close.addEventListener('click', closeLobby);
        card.append(title, auth, roomBox, status, close); ov.appendChild(card); wrap.appendChild(ov);
        lobbyEl = ov; lobbyRefs = { title: title, auth: auth, room: roomBox, status: status, close: close };
    }
    function hideShellOverlay() { var o = $('overlay'); if (o) o.hidden = true; }
    function openLobby() { if (!net || !net.ok) return; if (!lobbyEl) buildLobby(); lobbyEl.hidden = false; hideShellOverlay(); renderLobby(); if (net.mp.cleanup) net.mp.cleanup(GROUP).catch(function () { }); }
    function closeLobby() { if (lobbyEl) lobbyEl.hidden = true; if (S.mode !== 'online' && stagedMode !== 'online') shell.refreshOverlay(); }
    function detachRoom() { if (room && room.unsub) { try { room.unsub(); } catch (e) { } } room = null; pres = {}; }
    function attachRoom(code) { detachRoom(); pres = {}; beatT = 0; room = { code: code, data: null, unsub: null }; room.unsub = net.mp.watch(GROUP, code, onRoom); renderLobby(); }
    function showLobbyError(e) {
        var m = String((e && e.message) || e), msg = t('beamNetErr');
        if (m.indexOf('not found') !== -1) msg = t('beamRoomNotFound');
        else if (m.indexOf('full') !== -1) msg = t('beamRoomFull');
        else if (m.indexOf('already') !== -1) msg = t('beamAlreadyStarted');
        if (lobbyRefs) lobbyRefs.status.textContent = msg;
        console.warn('[beam lobby]', e);
    }
    function doSignIn(kind) { (kind === 'google' ? net.signInGoogle() : net.signInGuest()).catch(showLobbyError); }
    function doCreate() { net.mp.create(GROUP, { maxPlayers: MAX_PLAYERS }).then(attachRoom).catch(showLobbyError); }
    function doJoin(code) { code = String(code || '').trim().toUpperCase(); if (!code) return; net.mp.join(GROUP, code).then(attachRoom).catch(showLobbyError); }
    function doLeave() { var wasMatch = (S.mode === 'online'); if (room) { var c = room.code; detachRoom(); net.mp.leave(GROUP, c).catch(function () { }); } if (wasMatch) exitMatch(); renderLobby(); }
    function doReady() { if (!room || !netUser) return; net.mp.update(GROUP, room.code, { ['ready.' + netUser.uid]: true }).catch(showLobbyError); }
    function hostStart() {
        if (!room || !room.data || !netUser) return;
        var d = room.data; if (effectiveHost(d) !== netUser.uid) return;
        var order = (d.order || Object.keys(d.players || {})).filter(function (u) { return (d.players || {})[u] && !isStale(u); });
        if (order.length < 2) return;
        var ready = d.ready || {}; if (!order.every(function (u) { return ready[u]; })) return;
        var hp = {}, alive = {}; order.forEach(function (u) { hp[u] = HP_START; alive[u] = true; });
        var seed = (Math.random() * 1e9) >>> 0;
        net.mp.update(GROUP, room.code, { status: 'playing', game: { status: 'playing', round: 1, seed: seed, level: START_LEVEL, center: START_LEVEL, hp: hp, alive: alive, answers: {}, results: {}, rankByUid: {} }, ready: {} }).catch(showLobbyError);
    }
    function doRematch() { if (!room || !room.data || !netUser) return; if (effectiveHost(room.data) !== netUser.uid) return; net.mp.update(GROUP, room.code, { status: 'lobby', game: {}, ready: {}, round: 0 }).catch(showLobbyError); }
    function copyCode(code) { try { var p = navigator.clipboard && navigator.clipboard.writeText(code); if (p && p.catch) p.catch(function () { }); } catch (e) { } if (lobbyRefs) lobbyRefs.status.textContent = t('beamCopied'); }

    function renderLobby() {
        if (!lobbyEl) return;
        var d = room && room.data, g = (d && d.game) || {}, u = netUser, over = g.status === 'over';
        lobbyRefs.title.textContent = over ? t('beamResultsTitle') : t('beamLobbyTitle');
        lobbyRefs.close.textContent = t('beamClose');
        // auth
        var auth = lobbyRefs.auth; auth.innerHTML = '';
        if (!u) { var gg = lbtn(t('beamSignInGoogle'), 'btn btn-primary'); gg.onclick = function () { doSignIn('google'); }; var ag = lbtn(t('beamSignInGuest'), 'btn'); ag.onclick = function () { doSignIn('guest'); }; auth.appendChild(lrow(gg, ag)); }
        else { var info = elc('span', null, t('beamSignedIn', u.name || t('beamGuest'))); var out = lbtn(t('beamSignOut'), 'btn'); out.onclick = function () { doLeave(); net.signOut(); }; auth.appendChild(lrow(info, out)); }
        // room
        var rbox = lobbyRefs.room; rbox.innerHTML = '';
        if (u && !d) {
            var create = lbtn(t('beamCreateRoom'), 'btn btn-primary'); create.onclick = doCreate;
            var input = elc('input'); input.placeholder = t('beamRoomCode'); input.maxLength = 4;
            var join = lbtn(t('beamJoinRoom'), 'btn'); join.onclick = function () { doJoin(input.value); };
            input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doJoin(input.value); });
            rbox.appendChild(lrow(create)); rbox.appendChild(lrow(input, join));
        } else if (u && d) {
            rbox.appendChild(elc('div', 'lobby-code', d.code));
            // player list
            var ul = elc('ul', 'lobby-plist');
            var order = d.order || Object.keys(d.players || {}), ready = d.ready || {}, host = effectiveHost(d);
            order.forEach(function (uid) {
                if (!d.players[uid]) return;
                var li = elc('li');
                var left = elc('span'); var dot2 = elc('span', null, '\u25cf '); dot2.style.color = colorForOrder(d.players[uid].order); left.appendChild(dot2); left.appendChild(document.createTextNode(pname(uid, d.players) + (uid === u.uid ? ' (' + t('beamYou') + ')' : '')));
                li.appendChild(left);
                var right = elc('span');
                if (over) { if (g.rankByUid && g.rankByUid[uid]) { var rr = elc('span', 'rank', placeLabel(g.rankByUid[uid])); right.appendChild(rr); } }
                else {
                    if (uid === host) right.appendChild(elc('span', 'tag', t('beamHost')));
                    if (isStale(uid)) { li.style.opacity = '0.5'; right.appendChild(elc('span', null, ' \u26a0')); }
                    else if (ready[uid]) right.appendChild(elc('span', 'ok', ' ✓ ' + t('beamReadyTag')));
                }
                li.appendChild(right); ul.appendChild(li);
            });
            rbox.appendChild(ul);
            // actions
            if (over) {
                if (effectiveHost(d) === u.uid) { var rem = lbtn(t('beamRematch'), 'btn btn-primary'); rem.onclick = doRematch; rbox.appendChild(lrow(rem)); }
                var lv2 = lbtn(t('beamLeaveRoom'), 'btn'); lv2.onclick = doLeave; rbox.appendChild(lrow(lv2));
            } else {
                var copy = lbtn(t('beamCopyCode'), 'btn'); copy.onclick = function () { copyCode(d.code); };
                var row = lrow(copy);
                if (ready[u.uid]) row.appendChild(elc('span', null, t('beamReadyWait')));
                else { var rb = lbtn(t('beamReadyUp'), 'btn btn-primary'); rb.onclick = doReady; row.appendChild(rb); }
                rbox.appendChild(row);
                var present = order.filter(function (x) { return d.players[x] && !isStale(x); });
                if (effectiveHost(d) === u.uid) {
                    var canStart = present.length >= 2 && present.every(function (x) { return ready[x]; });
                    var st = lbtn(t('beamStartMatch'), 'btn btn-primary'); st.disabled = !canStart; st.onclick = hostStart; rbox.appendChild(lrow(st));
                }
                var lv = lbtn(t('beamLeaveRoom'), 'btn'); lv.onclick = doLeave; rbox.appendChild(lrow(lv));
            }
        }
        // status line
        var s = '';
        if (!u) s = t('beamSignInFirst');
        else if (over && g.endReason === 'left' && g.winner === u.uid) s = t('beamEndLeft');
        else if (over && g.winner) s = t('beamWinner', pname(g.winner, d.players));
        else if (d) { var present2 = (d.order || []).filter(function (x) { return d.players[x]; }); s = present2.length < 2 ? t('beamNeedTwo') : t('beamHostStarts'); }
        lobbyRefs.status.textContent = s;
    }

    // ===============================================================
    // mode seg + online button + net boot
    // ===============================================================
    var stagedMode = 'solo';
    function inMatch() { return S.mode === 'online' && om && !om.over; }
    function updateOnlineBtn() { var b = $('online-btn'); if (b) b.hidden = !(stagedMode === 'online' && net && net.ok); }
    function syncModeButtons() {
        var seg = $('mode-seg'); if (!seg) return;
        seg.querySelectorAll('button[data-mode]').forEach(function (b) {
            var m = b.dataset.mode; b.classList.toggle('active', m === stagedMode); b.setAttribute('aria-checked', m === stagedMode ? 'true' : 'false');
            b.disabled = inMatch();
        });
        updateOnlineBtn();
    }
    function setMode(m) {
        if ((m !== 'solo' && m !== 'online') || inMatch()) return;
        stagedMode = m; try { AC.prefs.set('beam', { mode: m }); } catch (e) { }
        syncModeButtons();
        if (m === 'online') { if (net && net.ok) openLobby(); }
        else { if (room) doLeave(); detachRoom(); closeLobby(); if (shell && shell.state === 'idle') shell.refreshOverlay(); }
    }
    function setControlsForMatch(on) { var seg = $('mode-seg'); if (seg) seg.querySelectorAll('button').forEach(function (b) { b.disabled = on; }); var ob = $('online-btn'); if (ob) ob.disabled = on; }
    function setupMode() {
        var seg = $('mode-seg'); if (!seg) return;
        var saved = null; try { saved = (AC.prefs.get('beam') || {}).mode; } catch (e) { }
        stagedMode = saved === 'online' ? 'online' : 'solo';
        seg.addEventListener('click', function (e) { var b = e.target.closest('button[data-mode]'); if (b) { AC.audio.unlock(); setMode(b.dataset.mode); } });
        syncModeButtons(); AC.i18n.subscribe(syncModeButtons);
    }
    function setupOnline() {
        function ready() {
            var N = window.ArcadeNet, btn = $('online-btn');
            if (!N || !N.ok) { if (btn) btn.hidden = true; return; }
            net = N; buildLobby();
            net.onAuth(function (uu) { netUser = uu; renderLobby(); });
            if (net.mp.cleanup) net.mp.cleanup(GROUP).catch(function () { });
            if (btn) btn.addEventListener('click', openLobby);
            updateOnlineBtn();
            if (stagedMode === 'online') openLobby();
        }
        if (window.ArcadeNet) ready(); else window.addEventListener('arcade-net-ready', ready, { once: true });
        setInterval(watchdog, 250);
        window.addEventListener('beforeunload', function () { if (room && room.code && net) { try { net.mp.leave(GROUP, room.code); } catch (e) { } } });
    }

    // ===============================================================
    // boot
    // ===============================================================
    function setupCanvas() {
        canvas = $('stage'); canvas.width = CW * DPR; canvas.height = CH * DPR;
        ctx = canvas.getContext('2d'); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        canvas.addEventListener('pointerdown', onPointer);
    }
    function boot() {
        setupCanvas();
        shell = AC.shell.create({
            gameId: 'beam', step: 1 / 60,
            update: function (dt) { if (S.mode === 'online') updateOnline(); else updateSolo(dt); },
            render: render,
            reset: function () { if (S.mode === 'online') return; soloReset(); },
            canPause: function () { return S.mode !== 'online'; },
            canRestart: function () { return S.mode !== 'online'; },
            overlayContent: function (state, result) {
                if (state === 'idle') return { badge: 'zap', title: t('beamArcName'), message: t('beamReadyMsg'), button: t('start') };
                if (state === 'over') return { badge: 'zap', title: t('beamOverTitle'), message: t('beamRound') + ' ' + ((result && result.meta && result.meta.round) || S.round) + ' · ' + t('score') + ' ' + AC.format.score((result && result.score) || 0), button: t('restart'), hint: t('best') + ' ' + AC.format.score((result && result.best) || 0) + ((result && result.isNewBest) ? ' · ' + t('newBest') : '') };
                return {};
            },
        });
        setupMode();
        setupOnline();
        applyHudMode();
        AC.i18n.subscribe(function () { syncHud(); if (S.mode !== 'online') shell.refreshOverlay(); if (room) renderLobby(); });
        syncHud();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
