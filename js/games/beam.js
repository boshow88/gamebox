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
        beamOnlineBtn: 'Online',
        beamWatch: 'Memorise the mirrors!',
        beamRecall: 'Where does it exit?',
        beamReplay: 'Tracing…',
        beamHit: 'Hit!', beamMiss: 'Missed!', beamTimeUp: 'Too slow!',
        beamReadyMsg: 'Memorise the mirrors, then tap where the laser <strong>exits</strong>. Race <strong>3 CPU rivals</strong> — last one standing wins.',
        beamTierLabel: 'Difficulty', beamTierEasy: 'Easy', beamTierNormal: 'Normal', beamTierHard: 'Hard', beamTierInsane: 'Insane',
        beamSoloWin: 'You win — 1st! 🏆', beamYourPlace: function (n) { return 'You finished ' + placeLabel(n); }, beamWins: function (n) { return n + ' wins'; },
        beamArcHelp1Html: 'Mirrors (<span data-icon="mirror-slash" aria-hidden="true"></span> and <span data-icon="mirror-back" aria-hidden="true"></span>) <strong>appear briefly</strong> — memorise where they are.',
        beamArcHelp2Html: 'They vanish, a laser fires in; <strong>tap the edge where it exits</strong> before time runs out.',
        beamArcHelp3Html: 'A replay reveals who hit — when some hit and some miss, those who missed <strong>lose a life</strong>. Last one standing wins.',
        beamArcHelp4Html: '<strong>Solo</strong> faces 3 CPU rivals; <strong>Online</strong> is 2–4 real players. A long match keeps speeding up. <kbd>R</kbd> restart · <kbd>M</kbd> mute.',
        beamOverTitle: 'Game Over',
        beamGetReady: 'Get ready!',
        beamSuddenDeath: 'SUDDEN DEATH!', beamSuddenDeathHint: 'A tie now costs a life',
        beamSpectating: 'You\u2019re out — watching',
        beamWaitNext: 'Waiting for next round…',
        // lobby (wording aligned with Rune Stones)
        beamLobbyTitle: 'Online match',
        beamClose: 'Close',
        beamSignInGoogle: 'Sign in with Google', beamSignInGuest: 'Play as guest',
        beamSignedIn: function (n) { return 'Signed in: ' + n; }, beamSignOut: 'Sign out', beamGuest: 'Guest',
        beamCreateRoom: 'Create room', beamRoomCode: 'Code', beamJoinRoom: 'Join',
        beamCopyCode: 'Copy', beamLeaveRoom: 'Leave room', beamCopied: 'Copied!',
        beamReadyUp: 'I\u2019m ready to start', beamReadyWait: 'Ready — waiting for others…', beamStartMatch: 'Start match',
        beamWaitingPlayers: 'Waiting for players…', beamNeedTwo: 'Need at least 2 players',
        beamHostStarts: 'The host starts once everyone is ready.', beamSignInFirst: 'Sign in to create or join a room.',
        beamRoomNotFound: 'Room not found', beamRoomFull: 'Room is full', beamAlreadyStarted: 'That match already started',
        beamNetErr: 'Network error', beamPlayers: 'Players', beamYou: 'You', beamHost: 'Host', beamReadyTag: 'Ready',
        beamResultsTitle: 'Final standings', beamWinner: function (n) { return n + ' wins!'; },
        beamRematch: 'Rematch', beamRoomGone: 'The room closed.', beamOffline: 'Disconnected',
        beamEndLeft: 'Everyone else left — you win!',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        beamArcName: '追光',
        beamRound: '回合',
        beamOnlineBtn: '線上',
        beamWatch: '記住鏡子的位置！',
        beamRecall: '它從哪裡射出？',
        beamReplay: '回放中…',
        beamHit: '命中！', beamMiss: '沒中！', beamTimeUp: '太慢了！',
        beamReadyMsg: '記住鏡子位置，再點出雷射<strong>射出</strong>的邊界。和 <strong>3 個電腦對手</strong>比賽，撐到最後獲勝。',
        beamTierLabel: '難度', beamTierEasy: '簡單', beamTierNormal: '普通', beamTierHard: '困難', beamTierInsane: '瘋狂',
        beamSoloWin: '你贏了——第 1 名！🏆', beamYourPlace: function (n) { return '你的名次：' + placeLabel(n); }, beamWins: function (n) { return '勝 ' + n + ' 場'; },
        beamArcHelp1Html: '鏡子（<span data-icon="mirror-slash" aria-hidden="true"></span> 與 <span data-icon="mirror-back" aria-hidden="true"></span>）會<strong>短暫出現</strong>——記住它們的位置。',
        beamArcHelp2Html: '鏡子消失後雷射射入，在時間內<strong>點出它射出的邊界格</strong>。',
        beamArcHelp3Html: '回放揭曉誰命中——有人對有人錯時，錯的人<strong>扣一命</strong>，撐到最後者獲勝。',
        beamArcHelp4Html: '<strong>單人</strong>對 3 個電腦對手、<strong>連線</strong>可 2–4 位真人；對戰拖越久會越來越快。<kbd>R</kbd> 重來 · <kbd>M</kbd> 靜音。',
        beamOverTitle: '遊戲結束',
        beamGetReady: '準備好！',
        beamSuddenDeath: '驟死！', beamSuddenDeathHint: '平手也會扣血',
        beamSpectating: '你已出局，觀戰中',
        beamWaitNext: '等待下一回合…',
        beamLobbyTitle: '線上對戰',
        beamClose: '關閉',
        beamSignInGoogle: '用 Google 登入', beamSignInGuest: '以訪客身分遊玩',
        beamSignedIn: function (n) { return '已登入：' + n; }, beamSignOut: '登出', beamGuest: '訪客',
        beamCreateRoom: '建立房間', beamRoomCode: '房號', beamJoinRoom: '加入',
        beamCopyCode: '複製', beamLeaveRoom: '離開房間', beamCopied: '已複製！',
        beamReadyUp: '準備好了', beamReadyWait: '已準備，等待其他玩家…', beamStartMatch: '開始對戰',
        beamWaitingPlayers: '等待玩家加入…', beamNeedTwo: '至少需要 2 位玩家',
        beamHostStarts: '大家準備好後，由房主開始。', beamSignInFirst: '登入後即可建立或加入房間。',
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
    function memoSec(m) { return AC.math.clamp(1.2 + 0.12 * m, 1.2, 3.2); }
    function replaySec(b) { return 0.5 + 0.09 * b; }
    // online
    var GROUP = 'beam_rooms', MAX_PLAYERS = 4, HP_START = 3;
    var SETTLE_MS = 500;        // after the answer window, brief wait for in-flight taps before tallying
    var HOST_BUFFER_MS = 800;   // after a round fully plays locally, extra wait before advancing (covers lag)
    var BEAT_MS = 3000;         // presence heartbeat interval
    var STALL_MS = 8000;        // no beat for this long → treated as disconnected
    // adaptive difficulty: a shared "centre" level that drifts with the group's results, plus
    // per-round jitter. Steps are multiplicative (bigger strides at higher difficulty) and lean
    // slightly lenient (down a touch faster than up). all-right → up, all-wrong → down, mixed → hold.
    var LEVEL_MIN = 1, LEVEL_MAX = 38, START_LEVEL = 5;    // level 1 → 2×2 (floor), level 37 → 20×20 (ceiling)
    function levelUp(c) { return AC.math.clamp(c * 1.05 + 0.5, LEVEL_MIN, LEVEL_MAX); }
    function levelDown(c) { return AC.math.clamp((c - 0.7) / 1.07, LEVEL_MIN, LEVEL_MAX); }
    function jitterFor(c) { return c * 0.1 + 0.5; }       // per-round spread scales with the centre (min ±0.5)
    // Solo = you vs 3 CPU bots. Each bot has a STRENGTH s; its correct-rate on a puzzle of
    // difficulty L is a negative-logistic:  P = 1 / (1 + e^(-BOT_K*(s - L)))  — far below its
    // strength → ~100%, far above → ~0%, equal → 50%. The difficulty slider has 16 notches
    // (4 per tier); each notch sets the bots' {mean,std}. A small BOT_K + modest spread keeps
    // most rounds a genuine contest (no "A always right, B always wrong" split).
    var BOT_K = 0.7;
    var DIFF = [
        { mean: 2.2, std: 0.5 }, { mean: 2.6, std: 0.6 }, { mean: 3.1, std: 0.7 }, { mean: 3.7, std: 0.8 },    // easy
        { mean: 4.6, std: 0.9 }, { mean: 5.3, std: 1.0 }, { mean: 6.0, std: 1.1 }, { mean: 6.8, std: 1.2 },    // normal
        { mean: 8.0, std: 1.3 }, { mean: 9.0, std: 1.4 }, { mean: 10.0, std: 1.5 }, { mean: 11.0, std: 1.6 }, // hard
        { mean: 12.4, std: 1.7 }, { mean: 13.6, std: 1.8 }, { mean: 14.8, std: 1.9 }, { mean: 16.0, std: 2.0 } // insane
    ];
    var NOTCH_MAX = DIFF.length - 1;
    var TIER_NAMES = ['easy', 'normal', 'hard', 'insane'];
    function tierForNotch(n) { return TIER_NAMES[AC.math.clamp(Math.floor(n / 4), 0, 3)]; }
    function gauss(mean, std) { var u = 1 - Math.random(), v = 1 - Math.random(); return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    function pCorrect(strength, level) { return 1 / (1 + Math.exp(-BOT_K * (strength - level))); }
    // per-player colours (distinct from the cyan laser / green "correct" ring)
    var PCOLORS = ['#f59e0b', '#ec4899', '#a855f7', '#3b82f6', '#f97316', '#eab308', '#8b5cf6', '#ef4444'];
    function colorForOrder(i) { i = i || 0; return PCOLORS[((i % PCOLORS.length) + PCOLORS.length) % PCOLORS.length]; }
    function countSec(round) { return round <= 1 ? 3 : 2; }
    // Long online matches gradually speed up so they always resolve: after ACCEL_START
    // rounds, memorize + answer times shrink each round (memorize faster than answer),
    // with NO floor. If a match somehow drags to SUDDEN_DEATH_ROUND, even a tie starts
    // costing a life — a guaranteed end.
    var ACCEL_START = 10, MEMO_DECAY = 0.95, ANSWER_DECAY = 0.96, SUDDEN_DEATH_ROUND = 50;
    function memoAccel(round) { return round <= ACCEL_START ? 1 : Math.pow(MEMO_DECAY, round - ACCEL_START); }
    function answerAccel(round) { return round <= ACCEL_START ? 1 : Math.pow(ANSWER_DECAY, round - ACCEL_START); }

    // ---- state ----
    var om = null;                         // the running match (solo-vs-bots when om.local, else online)
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
    // --- anti-metagame laser pick -------------------------------------------------------------
    // So a player can't guess the exit from the start point, we down-weight lasers whose exit
    // port is near the straight-opposite of the entry (the "straight-through" leak). The
    // suppression is SELF-CALIBRATING: measure this (N,M)'s base "distance-to-opposite" profile
    // and flatten it toward its fair share — strong at sparse boards, gentle at dense ones. The
    // base is measured with a FIXED seed → identical on every client, so online stays in sync.
    function oppPort(p, N) {
        if (p.side === U) return { r: N - 1, c: p.c, side: D };
        if (p.side === D) return { r: 0, c: p.c, side: U };
        if (p.side === L) return { r: p.r, c: N - 1, side: R };
        return { r: p.r, c: 0, side: L };
    }
    function perimIndex(p, N) {                 // clockwise ring: top L→R, right T→B, bottom R→L, left B→T
        if (p.side === U) return p.c;
        if (p.side === R) return N + p.r;
        if (p.side === D) return 2 * N + (N - 1 - p.c);
        return 3 * N + (N - 1 - p.r);
    }
    function ringDist(a, b, N) { var d = Math.abs(perimIndex(a, N) - perimIndex(b, N)); return Math.min(d, 4 * N - d); }
    function fairPort(N, d) { return ((d === 0 || d === 2 * N) ? 1 : 2) / (4 * N); }   // fair share of ports at ring-distance d
    var oppDistCache = {};
    function getOppDist(N, M) {                 // base distance-to-opposite distribution for (N,M), cached, deterministic
        var key = N + 'x' + M; if (oppDistCache[key]) return oppDistCache[key];
        var ports = portList(N), nP = ports.length, cells = N * N, f = new Float64Array(2 * N + 1), tot = 0;
        var r2 = AC.rng.make((N * 131 + M * 911 + 20261) >>> 0), K = 1000;   // fixed seed → same profile everywhere
        for (var t = 0; t < K; t++) {
            var grid = new Int8Array(cells), order = [];
            for (var i = 0; i < cells; i++) order.push(i);
            for (var j = order.length - 1; j > 0; j--) { var k = (r2() * (j + 1)) | 0; var tmp = order[j]; order[j] = order[k]; order[k] = tmp; }
            for (var mi = 0; mi < M; mi++) grid[order[mi]] = r2() < 0.5 ? SLASH : BACK;
            for (var e = 0; e < nP; e++) {
                var res = trace(grid, N, ports[e]);
                if (res.looped || samePort(res.exit, ports[e])) continue;
                f[ringDist(res.exit, oppPort(ports[e], N), N)]++; tot++;
            }
        }
        for (var d = 0; d < f.length; d++) f[d] = tot ? f[d] / tot : 0;
        oppDistCache[key] = f; return f;
    }
    // Difficulty is driven by a continuous `level`. The PRIMARY lever is mirror COMPLEXITY (how
    // many mirrors you must memorise — grid size + count). The bounce count stays varied (not tuned
    // to a target); the valid lasers are only weighted so the EXIT can't be read off the entry.
    function paramsForLevel(level) {
        level = Math.max(1, level);
        var N = AC.math.clamp(2 + Math.floor((level - 1) / 2), 2, 20), cells = N * N;   // 2×2 floor → 20×20 ceiling
        var frac = AC.math.clamp(0.12 + 0.009 * level, 0.12, 0.42);        // mirror density grows gently; size + bots carry the difficulty
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
            // collect every laser that cleanly exits
            var valid = [];
            for (var e = 0; e < ports.length; e++) {
                var res = trace(grid, N, ports[e]);
                if (res.looped || samePort(res.exit, ports[e])) continue;
                valid.push({ entry: ports[e], res: res });
            }
            if (valid.length) {
                // weight so the exit can't be guessed from the entry: suppress near-opposite exits
                var fd = getOppDist(N, M), ws = [], sum = 0;
                for (var vi = 0; vi < valid.length; vi++) {
                    var dOpp = ringDist(valid[vi].res.exit, oppPort(valid[vi].entry, N), N);
                    var w = Math.min(1, fairPort(N, dOpp) / Math.max(fd[dOpp], 1e-6));
                    ws.push(w); sum += w;
                }
                var target = rng() * sum, acc = 0, pick = valid[valid.length - 1];
                for (var wi = 0; wi < ws.length; wi++) { acc += ws[wi]; if (target <= acc) { pick = valid[wi]; break; } }
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
    // Solo = a LOCAL match vs 3 CPU bots (reuses the whole online match loop,
    // but writes apply instantly to a local room — no server).
    // ===============================================================
    function loadSoloStats(notch) { try { return AC.storage.readJSON(AC.storage.storageKey('beam', 'solo', 'n' + notch), { played: 0, wins: 0, best: 0 }); } catch (e) { return { played: 0, wins: 0, best: 0 }; } }
    function saveSoloStats(notch, st) { try { AC.storage.writeJSON(AC.storage.storageKey('beam', 'solo', 'n' + notch), st); } catch (e) { } }
    // (Cloud sync of best finishing places is handled by the shared CloudSync engine —
    // see js/cloud-sync.js. This file just repaints on change and nudges a sync.)
    function botWrongPort(p) { var opts = portList(p.N).filter(function (q) { return !samePort(q, p.entry) && !samePort(q, p.exit); }); return opts.length ? opts[(Math.random() * opts.length) | 0] : p.exit; }
    // match/host writes: instant local apply in solo, real Firestore write online.
    function applyPatch(obj, patch) {
        for (var k in patch) {
            if (k.indexOf('.') >= 0) { var parts = k.split('.'), o = obj; for (var i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; } o[parts[parts.length - 1]] = patch[k]; }
            else obj[k] = patch[k];
        }
    }
    function roomWrite(patch) { if (om && om.local) { applyPatch(room.data, patch); onRoom(room.data); return Promise.resolve(); } return net.mp.update(GROUP, room.code, patch); }

    function startSoloMatch(notch) {
        notch = AC.math.clamp(notch | 0, 0, NOTCH_MAX);
        appliedNotch = notch;   // this is now the committed difficulty (readout stops showing "pending")
        var diff = DIFF[notch];
        var uids = ['you'], players = {}, hp = {}, alive = {}, strengths = [];
        players['you'] = { uid: 'you', name: t('beamYou'), order: 0 };
        for (var i = 1; i <= 3; i++) {
            // clamp each bot's strength to ±2.5σ (never below 1) so a freak Gaussian tail
            // can't spawn an unbeatable / trivial rival.
            var s = AC.math.clamp(gauss(diff.mean, diff.std), Math.max(1, diff.mean - 2.5 * diff.std), diff.mean + 2.5 * diff.std); strengths.push(s);
            players['bot' + i] = { uid: 'bot' + i, name: 'CPU ' + i, order: i, bot: true, strength: s }; uids.push('bot' + i);
        }
        uids.forEach(function (u) { hp[u] = HP_START; alive[u] = true; });
        var med = strengths.slice().sort(function (a, b) { return a - b; })[1];          // median of the 3 bots
        var start = AC.math.clamp(Math.floor(med * 0.85), LEVEL_MIN, LEVEL_MAX);          // opening level trails the field
        var seed = (Math.random() * 1e9) >>> 0;
        room = { code: 'SOLO', unsub: null, data: { code: 'SOLO', status: 'playing', hostUid: 'you', players: players, order: uids, round: 0, game: { status: 'playing', round: 1, seed: seed, level: start, center: start, hp: hp, alive: alive, answers: {}, results: {}, rankByUid: {} } } };
        om = { myUid: 'you', local: true, notch: notch, seed: seed, round: 0, localStart: 0, puzzle: null, choice: null, submitted: false, alive: true, over: false, lastPhase: '', hpStart: {}, aliveStart: {}, host: { tallied: false, over: false, center: start } };
        hideShellOverlay(); setControlsForMatch(); applyHudMode();
        startLocalRound(1, room.data); renderPlayersBar(room.data);
    }
    function soloMatchOver(data) {
        var g = data.game || {}, players = data.players || {}, order = data.order || [];
        var ranks = g.rankByUid || {}, fallback = order.length || 4;
        var rank = ranks[om.myUid] || fallback, notch = om.notch;
        var st = loadSoloStats(notch); st.played++; if (rank === 1) st.wins++; st.best = st.best ? Math.min(st.best, rank) : rank; saveSoloStats(notch, st);
        if (window.CloudSync) window.CloudSync.sync();   // mirror the improved best place to the cloud profile

        var standings = order.filter(function (u) { return players[u]; }).map(function (u) {
            return { rank: ranks[u] || fallback, name: pname(u, players), color: colorForOrder(players[u] ? players[u].order : 0), you: u === om.myUid };
        });
        standings.sort(function (a, b) { return a.rank - b.rank; });
        om.over = true;
        setControlsForMatch();
        shell.gameOver({ score: 0, win: rank === 1, meta: { rank: rank, tier: tierForNotch(notch), best: st.best, wins: st.wins, standings: standings } });
    }
    // Bots "answer" DURING the window (just like real players) so their picks are already
    // there at the reveal. Correct-rate = logistic of their strength vs this round's level.
    var botTimers = [];
    function scheduleBots() {
        if (!om || !om.local || !om.puzzle || om._botRound === om.round) return;
        om._botRound = om.round;
        botTimers.forEach(clearTimeout); botTimers = [];
        var p = om.puzzle, g = room.data.game || {}, players = room.data.players || {}, order = room.data.order || [];
        var base = (countSec(om.round) + om.memo) * 1000, myRound = om.round;
        order.forEach(function (uid) {
            var pl = players[uid];
            if (!pl || !pl.bot || (g.alive && g.alive[uid] === false)) return;
            var port = (Math.random() < pCorrect(pl.strength || 1, om.level)) ? p.exit : botWrongPort(p);
            var delay = base + (0.25 + Math.random() * 0.55) * om.answerSec * 1000;   // "think" 25%–80% of the window (never instant, no back-and-forth)
            botTimers.push(setTimeout(function () {
                if (!om || !om.local || om.round !== myRound) return;
                roomWrite({ ['game.answers.' + uid]: { r: port.r, c: port.c, side: port.side, at: Date.now() } });
            }, delay));
        });
    }

    // ===============================================================
    // match loop (shared by solo-vs-bots and online)
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
        om.memo = memoSec(om.puzzle.bounces + countMirrors(om.puzzle)) * memoAccel(round);   // memorize shrinks faster
        om.answerSec = ANSWER_SEC * answerAccel(round);                                       // answer shrinks slower
        om.replay = replaySec(om.puzzle.bounces);
        om.choice = null; om.submitted = false; om.lastPhase = '';
        om.alive = !(g.alive && g.alive[om.myUid] === false);
        om.hpStart = Object.assign({}, g.hp || {});       // pre-round snapshot — shown until the reveal (no spoiler)
        om.aliveStart = Object.assign({}, g.alive || {});
        if (om.host) { om.host.tallied = false; om.host.over = false; om.host.pending = null; }
        sndClick();
        if (om.local) scheduleBots();
    }
    function myCorrect() { return om && om.choice && om.puzzle && samePort(om.choice, om.puzzle.exit); }

    // ---- sound: Beam's own voice (light + laser), built on the shared synth ----
    function sndClick() { AC.audio.tone(780, 0.05, { type: 'triangle', volume: 0.09, attack: 0.003 }); }
    function sndReveal() {   // the beam fires: a clean descending laser "pew" (pure sine, no noise)
        AC.audio.tone(1700, 0.24, { type: 'sine', slideTo: 420, volume: 0.13, attack: 0.004 });
    }
    function sndHit() {      // correct: a clean crystalline ping + a shimmer above
        AC.audio.tone(1175, 0.18, { type: 'triangle', volume: 0.14, detune: 6, filter: { type: 'lowpass', freq: 3600 } });
        setTimeout(function () { AC.audio.tone(1760, 0.16, { type: 'triangle', volume: 0.08 }); }, 70);
    }
    function sndMiss() {     // missed: a soft but clearly audible downward thud (mid-low, not harsh)
        AC.audio.tone(330, 0.22, { type: 'triangle', slideTo: 150, volume: 0.16, attack: 0.005, filter: { type: 'lowpass', freq: 1400, to: 500 } });
        AC.audio.noise(0.1, { volume: 0.08, filter: { type: 'bandpass', freq: 1000 } });
    }

    function enterMatch(data) {                       // ONLINE only (solo uses startSoloMatch)
        if (om) return;
        var g = data.game || {};
        om = { myUid: netUser.uid, local: false, seed: g.seed || 0, round: 0, localStart: 0, puzzle: null, choice: null, submitted: false, alive: true, over: false, lastPhase: '', hpStart: {}, aliveStart: {}, host: { tallied: false, over: false } };
        closeLobby();
        hideShellOverlay();
        applyHudMode();
        setControlsForMatch();
        if (!shell.isPlaying()) shell.start();      // reset() no-ops online; the loop drives renderOnline
        startLocalRound(g.round || 1, data);
        renderPlayersBar(data);
    }
    function exitMatch() {
        detachRoom();                                // cancel the room listener so a finished online room can't leak into a later solo match
        om = null;
        setControlsForMatch();
        var pb = $('players'); if (pb) pb.hidden = true;
        applyHudMode();
        shell.goIdle();                              // back to the ready screen (lobby overlay may sit on top)
    }
    // shell reset() target — return to the ready screen (drop any solo match). Restart/goIdle
    // call this; the actual solo launch lives in onStart. (Online is driven by enterMatch.)
    function toReady() {
        if (om && !om.local) return;                                           // an online match isn't managed via reset
        if (om && om.local) { om = null; botTimers.forEach(clearTimeout); botTimers = []; }
        if (room && room.code === 'SOLO') room = null;                          // drop the fake local room (you + 3 CPUs)
        var pb = $('players'); if (pb) pb.hidden = true;
        setControlsForMatch(); applyHudMode(); syncHud();
    }
    function onRoom(data, err) {
        if (!room) return;                            // stale listener after we detached → ignore (don't re-render / steal input focus)
        if (err) { showLobbyError(err); return; }
        if (!data) {                                  // room vanished (online)
            if (om && !om.local) { if (AC.toast) AC.toast.show(t('beamRoomGone')); exitMatch(); }
            if (room) room.data = null; renderLobby(); return;
        }
        if (room) room.data = data;
        var g = data.game || {};
        if (!(om && om.local)) updatePres(g);
        if (!om) {                                    // not in a match → sitting in the online lobby
            if (g.status === 'playing') { enterMatch(data); return; }
            renderLobby(); return;
        }
        // in a match (solo-vs-bots or online)
        if (g.status === 'playing') {
            om.over = false;
            if (g.round && g.round !== om.round) startLocalRound(g.round, data);
            else om.alive = !(g.alive && g.alive[om.myUid] === false);
            renderPlayersBar(data);
            if (lobbyEl && !lobbyEl.hidden) renderLobby();
        } else if (g.status === 'over') {
            if (g.round && g.round !== om.round) startLocalRound(g.round, data);
            renderPlayersBar(data);
            if (!om.over) {
                if (om.local) { soloMatchOver(data); }
                else { om.over = true; openLobby(); if (g.endReason === 'left' && AC.toast) AC.toast.show(t('beamEndLeft')); }   // online: show standings once
            }
            if (!om.local) renderLobby();
        } else if (!om.local) {                       // online room reset to lobby (rematch)
            exitMatch(); openLobby(); renderLobby();
        }
    }

    // submit (or CHANGE) my answer — you can re-pick freely until the answer window ends
    // (hidden to others until the host reveals). The latest pick is what counts.
    function submitAnswer(port) {
        if (!om || !om.alive) return;
        om.choice = port; om.submitted = true;
        sndClick();
        roomWrite({ ['game.answers.' + om.myUid]: { r: port.r, c: port.c, side: port.side, at: Date.now() } }).catch(function () { });
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
    // Drives the host each tick. Solo runs purely locally; online also sends presence beats.
    function watchdog() {
        if (om && om.local) { var ld = room.data, lg = ld.game || {}; if (lg.status === 'playing' && !om.host.over) hostDrive(ld, lg); return; }
        if (!net || !room || !room.data || !netUser) return;
        var d = room.data, g = d.game || {}, now = Date.now();
        if (!beatT || now - beatT > BEAT_MS) { beatT = now; beatN++; net.mp.update(GROUP, room.code, { ['game.beat.' + netUser.uid]: beatN }).catch(function () { }); }
        if (effectiveHost(d) === netUser.uid && (!gcT || now - gcT > 15000)) { gcT = now; net.mp.cleanup(GROUP).catch(function () { }); }
        if (om && !om.local && g.status === 'playing' && effectiveHost(d) === om.myUid) { hostCheckForfeit(d, g); if (!om.host.over) hostDrive(d, g); }
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
            if (om.host.pending) hostCommitOver(d, g);          // match decided this round → END only after the reveal has played
            else hostNextRound(d, g);                           // advance only after the whole round (incl. reveal) has played
        }
    }
    function hostCommitOver(d, g) {                             // write the 'over' status AFTER the final round's reveal finished
        var pend = om.host.pending || {};
        om.host.over = true; om.host.pending = null;
        roomWrite({ 'game.status': 'over', 'game.winner': pend.winner || null, 'game.endReason': pend.endReason || 'normal', 'status': 'lobby' }).catch(function () { });
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
        // normally only MIXED rounds deal damage (all-hit or all-miss is harmless) — but in
        // sudden death (a very long match) even a tie drains every survivor, to force an end.
        if (correct.length > 0 && wrong.length > 0) {
            wrong.forEach(function (u) { hp[u] = (hp[u] || 0) - 1; if (hp[u] <= 0) deaths.push(u); });
        } else if (r >= SUDDEN_DEATH_ROUND) {
            present.forEach(function (u) { hp[u] = (hp[u] || 0) - 1; if (hp[u] <= 0 && deaths.indexOf(u) === -1) deaths.push(u); });
        }
        gone.forEach(function (u) { if (deaths.indexOf(u) === -1) deaths.push(u); });   // left → out
        // assign the worst remaining places to those eliminated this round (join order tiebreak)
        var deadSet = {}; deaths.forEach(function (u) { deadSet[u] = true; });
        var remaining = aliveBefore.filter(function (u) { return !deadSet[u]; });
        var sharedRank = remaining.length + 1;                 // everyone eliminated THIS round ties (4 players, two die together → 1,2,2,4)
        deaths.forEach(function (u) { alive[u] = false; ranks[u] = sharedRank; });
        var over = remaining.length <= 1, winner = null;
        if (over && remaining.length === 1) { ranks[remaining[0]] = 1; winner = remaining[0]; }
        // adaptive difficulty: all-right together → harder; all-wrong together → easier; mixed → hold
        if (om.host.center == null) om.host.center = (g.center != null ? g.center : START_LEVEL);
        if (correct.length > 0 && wrong.length === 0) om.host.center = levelUp(om.host.center);
        else if (wrong.length > 0 && correct.length === 0) om.host.center = levelDown(om.host.center);
        var patch = {
            'game.hp': hp, 'game.alive': alive, 'game.results': results, 'game.revealedRound': r, 'game.rankByUid': ranks, 'game.center': om.host.center,
        };
        // If the match is decided, DON'T end it here — let the reveal animation finish first.
        // Stash the result; hostDrive commits 'over' after roundEnd + buffer (hostCommitOver).
        if (over) om.host.pending = { winner: winner, endReason: (gone.length > 0 ? 'left' : 'normal') };
        roomWrite(patch).catch(function () { });
    }
    function hostNextRound(d, g) {
        var nr = (g.round || 1) + 1;
        var center = (om.host.center != null) ? om.host.center : (g.center != null ? g.center : START_LEVEL);
        var level = AC.math.clamp(center + (Math.random() * 2 - 1) * jitterFor(center), LEVEL_MIN, LEVEL_MAX);   // per-round spread around the centre
        roomWrite({ 'game.round': nr, 'game.level': level, 'game.answers': {}, 'game.results': {}, 'game.revealedRound': 0 }).catch(function () { });
        var d2 = { game: Object.assign({}, g, { round: nr, level: level }), players: d.players };
        startLocalRound(nr, d2);   // advance the host locally in lockstep with the write (with the new level)
    }

    function updateOnline() {
        if (!om || !om.puzzle) return;
        var ph = phaseAt(performance.now()).phase;
        if (ph !== om.lastPhase) {
            if (ph === 'reveal') sndReveal();
            if (ph === 'result') { if (om.alive) { if (myCorrect()) sndHit(); else sndMiss(); } }
            // the ✓/✗ + HP only reveal once WE locally reach the reveal (never during the hidden-answer phase)
            if ((ph === 'reveal' || ph === 'result' || ph === 'await') && room && room.data) renderPlayersBar(room.data);
            om.lastPhase = ph;
        }
    }

    // ===============================================================
    // input
    // ===============================================================
    function onPointer(ev) {
        if (!om || !om.alive || !om.puzzle) return;                 // may re-pick until the window ends
        if (phaseAt(performance.now()).phase !== 'answer') return;
        var rect = canvas.getBoundingClientRect();
        var cx = (ev.clientX - rect.left) / rect.width * CW, cy = (ev.clientY - rect.top) / rect.height * CH;
        var p1 = hitPort(cx, cy, om.puzzle.N); if (!p1 || samePort(p1, om.puzzle.entry)) return;
        if (om.choice && samePort(p1, om.choice)) return;           // tapped the same tile → no change
        ev.preventDefault(); submitAnswer(p1);
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
    // Shared stroke width for mirrors AND the laser, so the beam (drawn under the
    // mirrors) never peeks out from behind one on the far side.
    function mirrorLW(N) { return Math.max(3, (GRID / N) * 0.09); }
    function drawMirror(r, c, m, N, alpha) {
        var cs = GRID / N, pad = cs * 0.22, x0 = GX + c * cs, y0 = GY + r * cs;
        ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = mirrorLW(N); ctx.lineCap = 'round';
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
        var dist = p.total * frac, pts = p.points, seg = p.seg, lw = mirrorLW(p.N);
        ctx.save(); ctx.strokeStyle = BEAM; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowColor = BEAM_GLOW; ctx.shadowBlur = Math.min(12, lw * 2.4);
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) {
            if (seg[i] <= dist) ctx.lineTo(pts[i].x, pts[i].y);
            else { var span = seg[i] - seg[i - 1], f = span > 0 ? (dist - seg[i - 1]) / span : 0; ctx.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f); break; }
        }
        ctx.stroke(); ctx.restore();
    }
    // spectator "preview" styling — a faint dashed beam + dashed exit outline, so the answer reads
    // as a quiet pre-view (not the bright reveal that comes later).
    function drawBeamPreview(p) {
        var pts = p.points, lw = mirrorLW(p.N);
        ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([lw * 2.2, lw * 2.2]);
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke(); ctx.restore();
    }
    function previewExit(p) {
        var R = portRect(p.exit.r, p.exit.c, p.exit.side, p.N);
        ctx.save(); ctx.globalAlpha = 0.9; ctx.setLineDash([5, 4]); cellPath(R); ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
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
        if (om) renderOnline();                 // every match (solo-vs-bots or online) renders here
    }
    function sdBanner() { ctx.save(); ctx.fillStyle = '#f87171'; ctx.font = '700 14px ' + (getComputedStyle(document.body).getPropertyValue('--font-display') || 'sans-serif'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t('beamSuddenDeath'), CW / 2, 77); ctx.restore(); }
    function renderOnline() {
        var p = om && om.puzzle; if (!p) return;
        var info = phaseAt(performance.now()), ph = info.phase;
        drawGrid(p.N);
        var sd = om.round >= SUDDEN_DEATH_ROUND;
        if (sd) sdBanner();                                    // persistent short "SUDDEN DEATH!" banner
        if (ph === 'countdown') { caption(sd ? t('beamSuddenDeathHint') : t('beamGetReady'), sd ? '#f87171' : BEAM); bigCountdown(Math.ceil(info.remain)); return; }   // prep screen explains why
        var spec = !!(om && !om.alive);                        // out of the match → spectating
        // flash: everyone (incl. spectators) sees ONLY the mirrors — no laser yet
        if (ph === 'memorize') { drawMirrors(p, 1); drawTimerBar(1 - info.ts / om.memo, false); caption(spec ? t('beamSpectating') : t('beamWatch'), spec ? '#94a3b8' : BEAM); return; }
        if (ph === 'answer') {
            var left = 1 - info.ts / om.answerSec;
            if (spec) {   // spectator: a muted "solution PREVIEW" (dashed path + dashed exit) + everyone's live picks
                drawBeamPreview(p); drawMirrors(p, 1); drawEntry(p); previewExit(p); drawPicks(p);
                drawTimerBar(left, false); caption(t('beamSpectating'), '#94a3b8'); return;
            }
            drawPorts(p); drawEntry(p); drawTimerBar(left, left < 0.25);
            if (om.choice) { var mc = colorForOrder((room.data && room.data.players && room.data.players[om.myUid]) ? room.data.players[om.myUid].order : 0); highlightCell(portRect(om.choice.r, om.choice.c, om.choice.side, p.N), mc); }
            caption(t('beamRecall')); return;
        }
        // reveal onward: spectators share the same animation — they feel the reveal, having only previewed it
        if (ph === 'reveal') { drawBeamUpTo(p, info.ts / om.replay); drawMirrors(p, AC.math.clamp(info.ts / 0.25, 0, 1)); drawEntry(p); drawPicks(p); caption(t('beamReplay')); return; }
        if (ph === 'result') {
            drawBeamUpTo(p, 1); drawMirrors(p, 1); drawEntry(p); lightExit(p); drawPicks(p); outlineExit(p);
            if (!om.alive) caption(t('beamSpectating'), '#94a3b8');
            else caption(myCorrect() ? t('beamHit') : (om.choice ? t('beamMiss') : t('beamTimeUp')), myCorrect() ? '#34d399' : '#f87171');
            return;
        }
        // await next round
        drawBeamUpTo(p, 1); drawMirrors(p, 1); drawEntry(p); lightExit(p); drawPicks(p); outlineExit(p); caption(t('beamWaitNext'), '#94a3b8');
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
            var list = groups[key], a0 = answers[list[0]], R = portRect(a0.r, a0.c, a0.side, p.N), n = list.length;
            var grid2x2 = p.N >= 9;                             // big (near-square) tiles: 3-4 players → 2×2 grid
            var vert = (a0.side === U || a0.side === D);        // orient by SIDE (top/bottom = vertical stripes) — no flip
            ctx.save(); cellPath(R); ctx.clip(); ctx.globalAlpha = 0.92;
            for (var i = 0; i < n; i++) {
                ctx.fillStyle = colorForOrder(players[list[i]] ? players[list[i]].order : 0);
                var sx, sy, sw, sh;
                if (n >= 3 && grid2x2) {                        // 3-4 players on a square-ish tile → 2 × ceil(n/2) grid (2×2 for four)
                    var cols = 2, rows = Math.ceil(n / 2), cc = i % cols, cr = (i / cols) | 0;
                    sx = R.x + R.w * cc / cols; sy = R.y + R.h * cr / rows; sw = R.w / cols; sh = R.h / rows;
                } else if (vert) { sx = R.x + R.w * i / n; sy = R.y; sw = R.w / n; sh = R.h; }
                else { sx = R.x; sy = R.y + R.h * i / n; sw = R.w; sh = R.h / n; }
                ctx.fillRect(sx + 0.4, sy + 0.4, sw - 0.8, sh - 0.8);
            }
            ctx.restore();
        }
    }
    function outlineExit(p) { ctx.save(); ctx.shadowColor = '#34d399'; ctx.shadowBlur = 10; strokeCell(portRect(p.exit.r, p.exit.c, p.exit.side, p.N), '#34d399', 3); ctx.restore(); }

    // ===============================================================
    // HUD + players strip
    // ===============================================================
    function $(id) { return document.getElementById(id); }
    function bump(id) { var el = $(id); if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    function syncHud() {
        if ($('round')) $('round').textContent = om ? om.round : 1;
        var b = $('best'); if (b) { var st = loadSoloStats(stagedNotch); b.textContent = st.best ? placeLabel(st.best) : '—'; }
    }
    function applyHudMode() {
        var e;
        if ((e = $('stat-score'))) e.style.display = 'none';                                  // no numeric score any more
        if ((e = $('stat-lives'))) e.style.display = 'none';                                  // HP is shown in the players strip
        if ((e = $('stat-best'))) e.style.display = (om && !om.local) ? 'none' : '';           // best = your best placement (solo)
    }
    function pname(uid, players) { var p = players && players[uid]; return (p && p.name) || t('beamGuest'); }
    function renderPlayersBar(data) {
        var bar = $('players'); if (!bar) return;
        if (!om || !data) { bar.hidden = true; return; }
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
    function isStale(uid) { if (om && om.local) return false; var p = pres[uid]; return !!p && (Date.now() - p.at) > STALL_MS; }
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
    function openLobby() {
        if (!net || !net.ok) return;
        if (om && om.local) { om = null; botTimers.forEach(clearTimeout); botTimers = []; var pb = $('players'); if (pb) pb.hidden = true; }   // drop a solo match
        if (room && room.code === 'SOLO') room = null;                          // never show the fake local room (you + 3 CPUs) in the online lobby
        if (!lobbyEl) buildLobby(); lobbyEl.hidden = false; hideShellOverlay(); renderLobby(); if (net.mp.cleanup) net.mp.cleanup(GROUP).catch(function () { });
    }
    function closeLobby() {
        if (lobbyEl) lobbyEl.hidden = true;
        if (om && om.over && !om.local) { doLeave(); return; }     // finished online match → leave the room cleanly, back to ready
        if (!om) shell.refreshOverlay();                           // (no match) → solo ready screen, never a frozen stage
    }
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
    function doLeave() { var wasMatch = !!(om && !om.local); if (room) { var c = room.code; detachRoom(); net.mp.leave(GROUP, c).catch(function () { }); } if (wasMatch) exitMatch(); renderLobby(); }
    function doReady() { if (!room || !netUser) return; net.mp.update(GROUP, room.code, { ['ready.' + netUser.uid]: true }).catch(showLobbyError); }
    function hostStart() {
        if (!room || !room.data || !netUser) return;
        var d = room.data; if (effectiveHost(d) !== netUser.uid) return;
        var order = (d.order || Object.keys(d.players || {})).filter(function (u) { return (d.players || {})[u] && !isStale(u); });
        if (order.length < 2) return;
        var hostUid = effectiveHost(d), ready = d.ready || {};
        if (!order.every(function (u) { return u === hostUid || ready[u]; })) return;   // the host's Start counts as ready; guests must ready up
        var hp = {}, alive = {}; order.forEach(function (u) { hp[u] = HP_START; alive[u] = true; });
        var seed = (Math.random() * 1e9) >>> 0;
        net.mp.update(GROUP, room.code, { status: 'playing', game: { status: 'playing', round: 1, seed: seed, level: START_LEVEL, center: START_LEVEL, hp: hp, alive: alive, answers: {}, results: {}, rankByUid: {} }, ready: {} }).catch(showLobbyError);
    }
    function doRematch() { if (!room || !room.data || !netUser) return; if (effectiveHost(room.data) !== netUser.uid) return; net.mp.update(GROUP, room.code, { status: 'lobby', game: {}, ready: {}, round: 0 }).catch(showLobbyError); }
    function copyCode(code) { try { var p = navigator.clipboard && navigator.clipboard.writeText(code); if (p && p.catch) p.catch(function () { }); } catch (e) { } if (lobbyRefs) lobbyRefs.status.textContent = t('beamCopied'); }

    function renderLobby() {
        if (!lobbyEl) return;
        // preserve the room-code field across re-renders so a background update can't steal your cursor
        var _pi = lobbyEl.querySelector('.lobby-room input');
        var _pv = _pi ? _pi.value : null, _pf = !!(_pi && document.activeElement === _pi);
        var _ps = _pf ? _pi.selectionStart : 0, _pe = _pf ? _pi.selectionEnd : 0;
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
            var listOrder = over ? order.slice().sort(function (a, b) { return ((g.rankByUid || {})[a] || 99) - ((g.rankByUid || {})[b] || 99); }) : order;  // results → sort by placing
            listOrder.forEach(function (uid) {
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
            // actions — invite + primary action share a row; Leave sits on its own row below
            if (over) {
                if (effectiveHost(d) === u.uid) { var rem = lbtn(t('beamRematch'), 'btn btn-primary'); rem.onclick = doRematch; rbox.appendChild(lrow(rem)); }
                var lvo = lbtn(t('beamLeaveRoom'), 'btn'); lvo.onclick = doLeave; rbox.appendChild(lrow(lvo));
            } else {
                var iAmHost = host === u.uid;
                var present = order.filter(function (x) { return d.players[x] && !isStale(x); });
                var copy = lbtn(t('beamCopyCode'), 'btn'); copy.onclick = function () { copyCode(d.code); };
                var primary;
                if (iAmHost) {                                             // the host's Start button is their "ready"
                    var guests = present.filter(function (x) { return x !== u.uid; });
                    var canStart = present.length >= 2 && guests.every(function (x) { return ready[x]; });
                    primary = lbtn(t('beamStartMatch'), 'btn btn-primary'); primary.disabled = !canStart; primary.onclick = hostStart;
                } else if (ready[u.uid]) {
                    primary = elc('span', null, t('beamReadyWait'));
                } else {
                    primary = lbtn(t('beamReadyUp'), 'btn btn-primary'); primary.onclick = doReady;
                }
                rbox.appendChild(lrow(copy, primary));                    // 複製 + 開始對戰 / 準備好了 同一列
                var lv = lbtn(t('beamLeaveRoom'), 'btn'); lv.onclick = doLeave;
                rbox.appendChild(lrow(lv));                               // 離開房間 自己一列
            }
        }
        // status line
        var s = '';
        if (!u) s = t('beamSignInFirst');
        else if (over && g.endReason === 'left' && g.winner === u.uid) s = t('beamEndLeft');
        else if (over && g.winner) s = t('beamWinner', pname(g.winner, d.players));
        else if (d) { var present2 = (d.order || []).filter(function (x) { return d.players[x]; }); s = present2.length < 2 ? t('beamNeedTwo') : t('beamHostStarts'); }
        lobbyRefs.status.textContent = s;
        if (_pv != null) {                            // restore the code field (value + focus + caret) after the rebuild
            var _ni = lobbyRefs.room.querySelector('input');
            if (_ni) { _ni.value = _pv; if (_pf) { _ni.focus(); try { _ni.setSelectionRange(_ps, _pe); } catch (e) { } } }
        }
    }

    // ===============================================================
    // mode seg + online button + net boot
    // ===============================================================
    var stagedNotch = 5;
    var appliedNotch = null;   // notch the last/active solo match committed; null until first Start
    function onlineLock() { return !!(om && !om.local && !om.over); }   // only an ONLINE match locks the difficulty picker
    function updateOnlineBtn() { var b = $('online-btn'); if (b) b.hidden = !(net && net.ok); }
    // Difficulty slider — 16 equidistant notches (4 per tier). Dragging only *stages* a
    // notch; it commits on the next Start (deferred, like the puzzle games' size slider).
    // The readout mirrors that convention: while the staged notch differs from the one the
    // last match used it shows a live "current → pending" preview, so the new difficulty is
    // visible before you commit. The Roman numeral is the step WITHIN the tier, so even a
    // same-tier move previews a change. An online match locks the picker.
    var ROMAN = ['I', 'II', 'III', 'IV'];
    function notchLabel(n) { return t('beamTier' + capitalize(tierForNotch(n))) + ' ' + ROMAN[n % 4]; }
    function syncDiffControl() {
        var sl = $('diff-slider'), rd = $('diff-readout'); if (!sl) return;
        sl.value = String(stagedNotch);
        sl.disabled = onlineLock();
        if (!rd) return;
        if (appliedNotch == null || appliedNotch === stagedNotch) {
            rd.textContent = notchLabel(stagedNotch);
            rd.classList.remove('pending');
        } else {
            rd.innerHTML = '';
            var cur = document.createElement('span'); cur.className = 'readout-current'; cur.textContent = notchLabel(appliedNotch);
            var arr = document.createElement('span'); arr.className = 'readout-arrow'; arr.textContent = '→';
            var nxt = document.createElement('span'); nxt.className = 'readout-next'; nxt.textContent = notchLabel(stagedNotch);
            rd.appendChild(cur); rd.appendChild(arr); rd.appendChild(nxt);
            rd.classList.add('pending');
        }
    }
    function setNotch(n) {
        n = AC.math.clamp(n | 0, 0, NOTCH_MAX);
        if (onlineLock() || n === stagedNotch) return;
        stagedNotch = n; try { AC.prefs.set('beam', { notch: n }); } catch (e) { }
        syncDiffControl(); syncHud();                                   // HUD best follows the staged notch
    }
    function setControlsForMatch() {
        var ob = $('online-btn'); if (ob) ob.disabled = !!(om && !om.over);   // can't open the lobby during an active match
        syncDiffControl();                                                    // the slider lock depends only on online state
    }
    function setupControls() {
        var saved = {}; try { saved = AC.prefs.get('beam') || {}; } catch (e) { }
        stagedNotch = (saved.notch != null && saved.notch >= 0 && saved.notch <= NOTCH_MAX) ? (saved.notch | 0) : 5;
        var sl = $('diff-slider'); if (sl) sl.addEventListener('input', function () { AC.audio.unlock(); setNotch(parseInt(sl.value, 10)); });
        syncDiffControl(); AC.i18n.subscribe(syncDiffControl);
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
        }
        if (window.ArcadeNet) ready(); else window.addEventListener('arcade-net-ready', ready, { once: true });
        setInterval(watchdog, 250);
        window.addEventListener('beforeunload', function () { if (room && room.code && net && !(om && om.local)) { try { net.mp.leave(GROUP, room.code); } catch (e) { } } });
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
            update: function () { if (om) updateOnline(); },
            render: render,
            restartToReady: true,                                                                     // Restart returns to the ready screen (like Rune Stones)
            reset: toReady,                                                                           // goIdle/play-again → prepare the ready screen
            onStart: function () { if (om && !om.local) return; startSoloMatch(stagedNotch); },       // Start → launch a solo-vs-bots match (online is set up by enterMatch)
            canPause: function () { return !om; },                                                    // no pausing a timed match
            canRestart: function () { return !(om && !om.local); },                                   // solo can restart; online can't
            onGameOver: function () { syncHud(); },                                                   // re-assert the best-placement HUD (shell just wrote a score-best)
            overlayContent: function (state, result) {
                if (state === 'idle') return { badge: 'zap', title: t('beamArcName'), message: t('beamReadyMsg'), button: t('start') };
                if (state === 'over') {
                    var m = (result && result.meta) || {};
                    var list = (m.standings || []).map(function (s) {       // same layout as the online results list
                        return '<div class="li' + (s.you ? ' me' : '') + '"><span class="nm"><span class="dot" style="color:' + s.color + '">\u25cf</span> '
                            + String(s.name).replace(/[<>&]/g, '') + '</span><span class="rk">' + placeLabel(s.rank) + '</span></div>';
                    }).join('');
                    return {
                        badge: m.rank === 1 ? 'trophy' : 'zap',
                        title: t('beamResultsTitle'),
                        message: '<div class="beam-finrank">' + list + '</div>',
                        button: t('restart'),
                        hint: t('beamTierLabel') + '：' + t('beamTier' + capitalize(m.tier || 'normal')) + ' · ' + t('best') + ' ' + placeLabel(m.best || (m.rank || 4)) + ' · ' + t('beamWins', m.wins || 0),
                    };
                }
                return {};
            },
        });
        setupControls();
        setupOnline();
        if (window.CloudSync) window.CloudSync.onApplied(syncHud);   // repaint best on account swap / cloud merge
        applyHudMode();
        AC.i18n.subscribe(function () { syncHud(); if (!om) shell.refreshOverlay(); if (room && !(om && om.local)) renderLobby(); });
        syncHud();
        render();                                                                                     // paint the backdrop behind the ready overlay
    }
    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
