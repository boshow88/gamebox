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
        beamReadyMsg: 'Memorise the mirrors, then tap where the laser <strong>exits</strong>. Open the <strong>Room</strong> to pick a difficulty or play online — last one standing wins.',
        beamTierLabel: 'Difficulty', beamTierEasy: 'Easy', beamTierNormal: 'Normal', beamTierHard: 'Hard', beamTierInsane: 'Insane',
        beamSoloWin: 'You win — 1st! 🏆', beamYourPlace: function (n) { return 'You finished ' + placeLabel(n); }, beamWins: function (n) { return n + ' wins'; },
        beamArcHelp1Html: 'Mirrors (<span data-icon="mirror-slash" aria-hidden="true"></span> and <span data-icon="mirror-back" aria-hidden="true"></span>) <strong>appear briefly</strong> — memorise where they are.',
        beamArcHelp2Html: 'They vanish, a laser fires in; <strong>tap the edge where it exits</strong> before time runs out.',
        beamArcHelp3Html: 'A replay reveals who hit — when some hit and some miss, those who missed <strong>lose a life</strong>. Last one standing wins.',
        beamArcHelp4Html: 'Open the <strong>Room</strong>: <strong>Solo</strong> sets one difficulty vs 3 CPUs; <strong>Online</strong> is 2–8 players and can add CPUs too. A long match keeps speeding up. <kbd>R</kbd> restart · <kbd>M</kbd> mute.',
        beamOverTitle: 'Game Over',
        beamGetReady: 'Get ready!',
        beamSuddenDeath: 'SUDDEN DEATH!', beamSuddenDeathHint: 'A tie now costs a life',
        beamSpectating: 'Out — watching',
        beamWatching: 'Watching',
        beamSpectate: 'Spectate',
        beamSpectatingRoom: 'Spectating — watching this match.',
        beamStopSpectating: 'Stop watching',
        beamWatchers: function (n) { return n + ' watching'; },
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
        beamRematch: 'Rematch', beamRematchWait: 'Waiting for the host to start a rematch…', beamRoomGone: 'The room closed.', beamOffline: 'Disconnected',
        beamEndLeft: 'Everyone else left — you win!',
        // unified Room dialog
        beamRoomBtn: 'Room', beamRoomTitle: 'Room', beamPlayers: 'Players',
        beamAddCpu: 'Add CPU', beamCpuTag: 'CPU', beamCpuDifficulty: 'CPU strength', beamRemove: 'Remove',
        beamKick: 'Remove', beamKicked: 'You were removed from the room.', beamRenameLabel: 'Name', beamStrengthLabel: 'Strength',
        beamLives: 'Lives', beamConnecting: 'Connecting…', beamOnlineUnavailable: 'Online is unavailable right now.',
        beamCpuName: function (n) { return 'CPU ' + n; },
        beamModeSolo: 'Solo', beamModeOnline: 'Online',
        beamSoloHint: 'Pick a difficulty and race 3 CPU rivals — your best finishing place is saved per difficulty.',
        beamOnlineSection: 'Online', beamSignInHint: 'Creating or joining a room signs you in automatically.',
        beamOfflineInviteNote: 'Enter a code to join, or create one to invite other players. CPUs can play online too.',
        beamOnlineInviteNote: 'Share this code to invite other players. Anyone can add CPUs they own to fill the room.',
        beamOnlinePlayingNote: 'This match is running — new players can join after the host returns to the lobby.',
        beamNeedOpponent: 'Add at least one rival (a CPU or another player).',
        beamTooMany: 'A match holds up to 8 players — remove some to start.',
        beamStartSolo: 'Start game', beamUnready: 'Cancel ready',
        beamLobbyDiffNote: 'Online difficulty adapts to how everyone plays; CPU rivals keep the strength you pick.',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        beamArcName: '追光',
        beamRound: '回合',
        beamOnlineBtn: '線上',
        beamWatch: '記住鏡子的位置！',
        beamRecall: '它從哪裡射出？',
        beamReplay: '回放中…',
        beamHit: '命中！', beamMiss: '沒中！', beamTimeUp: '太慢了！',
        beamReadyMsg: '記住鏡子位置，再點出雷射<strong>射出</strong>的邊界。開啟<strong>房間</strong>選難度單挑 CPU，或連線對戰，撐到最後獲勝。',
        beamTierLabel: '難度', beamTierEasy: '簡單', beamTierNormal: '普通', beamTierHard: '困難', beamTierInsane: '瘋狂',
        beamSoloWin: '你贏了——第 1 名！🏆', beamYourPlace: function (n) { return '你的名次：' + placeLabel(n); }, beamWins: function (n) { return '勝 ' + n + ' 場'; },
        beamArcHelp1Html: '鏡子（<span data-icon="mirror-slash" aria-hidden="true"></span> 與 <span data-icon="mirror-back" aria-hidden="true"></span>）會<strong>短暫出現</strong>——記住它們的位置。',
        beamArcHelp2Html: '鏡子消失後雷射射入，在時間內<strong>點出它射出的邊界格</strong>。',
        beamArcHelp3Html: '回放揭曉誰命中——有人對有人錯時，錯的人<strong>扣一命</strong>，撐到最後者獲勝。',
        beamArcHelp4Html: '開啟<strong>房間</strong>：<strong>單人</strong>設定一個難度對 3 個 CPU；<strong>線上</strong>為 2～8 人，也能加入 CPU 混戰。對戰拖越久會越來越快。<kbd>R</kbd> 重來 · <kbd>M</kbd> 靜音。',
        beamOverTitle: '遊戲結束',
        beamGetReady: '準備好！',
        beamSuddenDeath: '驟死！', beamSuddenDeathHint: '平手也會扣血',
        beamSpectating: '已出局，觀戰中',
        beamWatching: '觀戰中',
        beamSpectate: '觀戰',
        beamSpectatingRoom: '觀戰中——正在看這場對戰。',
        beamStopSpectating: '停止觀戰',
        beamWatchers: function (n) { return n + ' 人觀戰'; },
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
        beamRematch: '再來一場', beamRematchWait: '等待房主再開一場…', beamRoomGone: '房間已關閉。', beamOffline: '已離線',
        beamEndLeft: '其他玩家都離開了，你獲勝！',
        // 統一房間對話框
        beamRoomBtn: '房間', beamRoomTitle: '房間', beamPlayers: '玩家',
        beamAddCpu: '加入 CPU', beamCpuTag: 'CPU', beamCpuDifficulty: 'CPU 強度', beamRemove: '移除',
        beamKick: '踢出', beamKicked: '你已被移出房間。', beamRenameLabel: '名稱', beamStrengthLabel: '強度',
        beamLives: '血量', beamConnecting: '連線中…', beamOnlineUnavailable: '目前無法連線。',
        beamCpuName: function (n) { return 'CPU ' + n; },
        beamModeSolo: '單人', beamModeOnline: '線上',
        beamSoloHint: '選個難度和 3 個 CPU 對手較量——每種難度的最佳名次都會記錄。',
        beamOnlineSection: '線上', beamSignInHint: '建立或加入房間時會自動為你登入。',
        beamOfflineInviteNote: '輸入房號加入，或建立房號邀請其他玩家。CPU 也能一起連線對戰。',
        beamOnlineInviteNote: '分享此房號邀請其他玩家；任何人都能加入自己的 CPU 補滿房間。',
        beamOnlinePlayingNote: '本場進行中——房主返回大廳後，新玩家才能加入。',
        beamNeedOpponent: '至少加入一名對手（CPU 或其他玩家）。',
        beamTooMany: '一場最多 8 名玩家——請移除部分後再開始。',
        beamStartSolo: '開始遊戲', beamUnready: '取消準備',
        beamLobbyDiffNote: '線上難度會依大家的表現自動調整；CPU 對手則維持你選的強度。',
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
    var GROUP = 'beam_rooms', MAX_PLAYERS = 8, HP_START = 3, HP_MIN = 3, HP_MAX = 8;
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
    // Difficulty is a 16-notch scale (4 tiers × 4 steps). Solo sets ONE notch for all 3 CPU rivals
    // (and records a best placement per notch); online sets a notch PER CPU. A notch samples a bot
    // STRENGTH from its tuned mean/spread. Puzzle difficulty itself stays adaptive for everyone.
    var DEFAULT_NOTCH = 5;
    var ROMAN = ['I', 'II', 'III', 'IV'];
    function notchLabel(n) { n = AC.math.clamp(n | 0, 0, NOTCH_MAX); return t('beamTier' + capitalize(tierForNotch(n))) + ' ' + ROMAN[n % 4]; }
    function strengthForNotch(n) { var d = DIFF[AC.math.clamp(n | 0, 0, NOTCH_MAX)]; return AC.math.clamp(gauss(d.mean, d.std), Math.max(1, d.mean - 2.5 * d.std), d.mean + 2.5 * d.std); }
    // Standard median: the middle value, or the AVERAGE of the two middle values for an even count
    // (e.g. two CPUs → the mean of both strengths, not just one of them).
    function median(values) {
        var a = values.slice().sort(function (x, y) { return x - y; }), n = a.length, m = n >> 1;
        if (!n) return 0;
        return n % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }
    // Opening difficulty trails the field: the CPU strengths' median, nudged down a little, so the
    // first rounds aren't brutal (then the shared adaptive level drifts from there). No CPUs → START_LEVEL.
    function openingLevel(strengths) {
        if (!strengths || !strengths.length) return START_LEVEL;
        return AC.math.clamp(Math.floor(median(strengths) * 0.85), LEVEL_MIN, LEVEL_MAX);
    }
    function gauss(mean, std) { var u = 1 - Math.random(), v = 1 - Math.random(); return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    function pCorrect(strength, level) { return 1 / (1 + Math.exp(-BOT_K * (strength - level))); }
    // per-player colours (distinct from the cyan laser / green "correct" ring)
    var PCOLORS = ['#f59e0b', '#ec4899', '#a855f7', '#3b82f6', '#f97316', '#eab308', '#8b5cf6', '#ef4444'];
    function colorForOrder(i) { i = i || 0; return PCOLORS[((i % PCOLORS.length) + PCOLORS.length) % PCOLORS.length]; }
    // A roster entry's colour index: CPUs get a frozen `color` slot (assigned at start to a hue no
    // human seat uses), humans use their stable seat order. Keeps all 8 participants distinct.
    function playerColor(p) { return colorForOrder(p && p.color != null ? p.color : (p ? p.order : 0)); }
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

    // ---- roster: humans (service `players`) + CPUs (top-level `bots`) share one match loop ----
    // Humans are real connections; CPUs live in `data.bots` (id → { name, order, level, strength })
    // and are driven by the host. These helpers present a unified roster so tally, rendering and
    // forfeit logic treat both the same, while the room service only ever manages human seats.
    function botMap(data) { var raw = (data && data.bots) || {}, out = {}; for (var id in raw) if (raw[id]) out[id] = raw[id]; return out; }   // skip explicit-null tombstones
    function isBot(data, uid) { return !!botMap(data)[uid]; }
    function rosterIds(data) {
        var ids = (data && data.order) || Object.keys((data && data.players) || {});
        return ids.concat(Object.keys(botMap(data)));
    }
    function rosterPlayers(data) {
        var out = Object.assign({}, (data && data.players) || {}), b = botMap(data);
        for (var id in b) out[id] = { uid: id, bot: true, name: b[id].name, order: b[id].order, strength: b[id].strength, notch: b[id].notch, color: b[id].color };
        return out;
    }

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
    // Solo tracks the best finishing place per difficulty notch (we deliberately don't keep
    // games-played / wins; add them back if we ever do proper per-game stats).
    function loadSoloStats(notch) { try { return AC.storage.readJSON(AC.storage.storageKey('beam', 'solo', 'n' + (notch | 0)), { best: 0 }); } catch (e) { return { best: 0 }; } }
    function saveSoloStats(notch, st) { try { AC.storage.writeJSON(AC.storage.storageKey('beam', 'solo', 'n' + (notch | 0)), st); } catch (e) { } }
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
    function roomWrite(patch) {
        if (om && om.local) { applyPatch(room.data, patch); onRoom(room.data); return Promise.resolve(true); }
        if (!room || !room.data) return Promise.resolve(false);
        var g = room.data.game || {};
        return matchmaking.updateMatch(room.code, { matchId: g.matchId, round: g.round, status: 'playing', settledRound: g.settledRound }, function (data) {
            return (data.game.settledRound || 0) >= data.game.round ? null : patch;
        });
    }

    // Solo = a LOCAL match: you vs 3 CPU rivals set by ONE difficulty notch (records a best place
    // per notch). This is the classic "pick this round's difficulty" mode.
    function beginSolo() {
        var notch = stagedNotch, lives = AC.math.clamp(stagedHp | 0, HP_MIN, HP_MAX) || HP_START;
        lastSolo = null;                                                                  // clear the previous match's standings
        var players = { you: { uid: 'you', name: myName(), order: 0 } };
        var bots = {}, hp = { you: lives }, alive = { you: true }, strengths = [];
        for (var i = 1; i <= 3; i++) {
            var s = strengthForNotch(notch); strengths.push(s);
            var id = 'bot' + i; bots[id] = { name: t('beamCpuName', i), order: i, notch: notch, strength: s };
            hp[id] = lives; alive[id] = true;
        }
        var start = openingLevel(strengths);                                               // opening level trails the field
        var seed = (Math.random() * 1e9) >>> 0;
        room = { code: 'SOLO', unsub: null, data: { code: 'SOLO', status: 'playing', hostUid: 'you', players: players, order: ['you'], bots: bots, round: 0, game: { status: 'playing', round: 1, seed: seed, level: start, center: start, hp: hp, alive: alive, answers: {}, results: {}, rankByUid: {} } } };
        om = { myUid: 'you', local: true, notch: notch, seed: seed, round: 0, localStart: 0, puzzle: null, choice: null, submitted: false, alive: true, over: false, lastPhase: '', hpStart: {}, aliveStart: {}, host: {} };
        closeLobby(); hideShellOverlay(); applyHudMode();
        if (!shell.isPlaying()) shell.start();                                            // enter the loop (onStart no-ops: om is set)
        setControlsForMatch();
        startLocalRound(1, room.data); renderPlayersBar(room.data);
    }
    function soloMatchOver(data) {
        var g = data.game || {}, players = rosterPlayers(data), order = rosterIds(data);
        var ranks = g.rankByUid || {}, fallback = order.length || 4;
        var rank = ranks[om.myUid] || fallback, notch = om.notch;
        var best = loadSoloStats(notch).best; best = best ? Math.min(best, rank) : rank; saveSoloStats(notch, { best: best });
        if (window.CloudSync) window.CloudSync.sync();   // mirror the improved best place to the cloud profile

        var standings = order.filter(function (u) { return players[u]; }).map(function (u) {
            var rk = ranks[u] || fallback;
            return { rank: rk, place: placeLabel(rk), name: pname(u, players), color: playerColor(players[u]), you: u === om.myUid };
        });
        standings.sort(function (a, b) { return a.rank - b.rank; });
        lastSolo = { standings: standings, rank: rank, notch: notch, best: best, win: rank === 1 };
        om = null; botTimers.forEach(clearTimeout); botTimers = [];
        // Finish like an online match: leave the loop and show the standings in the Room (so they persist).
        shell.goIdle(); openLobby();
    }
    // Bots "answer" DURING the window (just like real players) so their picks are already
    // there at the reveal. Correct-rate = logistic of their strength vs this round's level.
    // The host drives every CPU — locally for solo, and over the network when online — so a
    // room can mix real players with CPUs. Other clients just read the committed answers.
    var botTimers = [];
    function iDriveBots() { return !!om && (om.local || (!om.spectator && effectiveHost(room.data) === om.myUid)); }
    function scheduleBots() {
        if (!om || !om.puzzle || om._botRound === om.round || !iDriveBots()) return;
        om._botRound = om.round;
        botTimers.forEach(clearTimeout); botTimers = [];
        var p = om.puzzle, g = room.data.game || {}, bots = botMap(room.data);
        var base = (countSec(om.round) + om.memo) * 1000, myRound = om.round;
        Object.keys(bots).forEach(function (uid) {
            if (g.alive && g.alive[uid] === false) return;
            if (g.answers && g.answers[uid]) return;                                   // already answered (e.g. after host migration)
            var port = (Math.random() < pCorrect(bots[uid].strength || 1, om.level)) ? p.exit : botWrongPort(p);
            var delay = base + (0.25 + Math.random() * 0.55) * om.answerSec * 1000;   // "think" 25%–80% of the window (never instant, no back-and-forth)
            botTimers.push(setTimeout(function () {
                if (!om || om.round !== myRound || !iDriveBots()) return;
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
        om.alive = !om.spectator && !(g.alive && g.alive[om.myUid] === false);
        om.hpStart = Object.assign({}, g.hp || {});       // pre-round snapshot — shown until the reveal (no spoiler)
        om.aliveStart = Object.assign({}, g.alive || {});
        om.host = {};
        sndClick();
        scheduleBots();                                   // self-gates: only the driving host actually schedules
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

    function enterMatch(data) {                       // ONLINE only (solo uses beginSolo)
        if (om) return;
        var g = data.game || {};
        var spectator = !(data.players && data.players[netUser.uid]);   // not seated in the room → watching only
        om = { myUid: netUser.uid, local: false, spectator: spectator, seed: g.seed || 0, round: 0, localStart: 0, puzzle: null, choice: null, submitted: false, alive: !spectator, over: false, lastPhase: '', hpStart: {}, aliveStart: {}, host: {} };
        closeLobby();
        hideShellOverlay();
        applyHudMode();
        setControlsForMatch();
        if (!shell.isPlaying()) shell.start();      // reset() no-ops online; the loop drives renderOnline
        startLocalRound(g.round || 1, data);
        renderPlayersBar(data);
    }
    function exitMatch(keepRoom) {
        if (!keepRoom) detachRoom();                 // rematches keep the room listener; leaving must detach before solo play
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
        // Track our membership; if the host removes us after we were seated, bow out cleanly.
        if (room && room.code !== 'SOLO' && netUser && !room.spectate) {
            if (data.players && data.players[netUser.uid]) memberSeen = true;
            else if (memberSeen) {
                if (AC.toast) AC.toast.show(t('beamKicked'));
                if (om && !om.local) exitMatch(); else detachRoom();
                renderLobby(); return;
            }
        }
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
            else om.alive = !om.spectator && !(g.alive && g.alive[om.myUid] === false);
            renderPlayersBar(data);
            if (lobby && lobby.isOpen()) renderLobby();
        } else if (g.status === 'over') {
            if (g.round && g.round !== om.round) startLocalRound(g.round, data);
            renderPlayersBar(data);
            if (!om.over) {
                if (om.local) { soloMatchOver(data); }
                else { om.over = true; openLobby(); if (g.endReason === 'left' && AC.toast) AC.toast.show(t('beamEndLeft')); }   // online: show standings once
            }
            if (!om.local) renderLobby();
        } else if (!om.local) {                       // online room reset to lobby (rematch)
            exitMatch(true); openLobby(); renderLobby();
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
    function effectiveHost(d) { return matchmaking ? matchmaking.host(d) : null; }
    // Drives the host each tick. Solo runs purely locally; online also sends presence beats.
    function watchdog() {
        if (om && om.local) { var ld = room.data, lg = ld.game || {}; if (lg.status === 'playing') hostDrive(ld, lg); return; }
        if (!net || !room || !room.data || !netUser) return;
        var d = room.data, g = d.game || {}, now = Date.now();
        var watching = !(d.players && d.players[netUser.uid]);   // spectator: observe only, never write to the room
        if (!watching) matchmaking.heartbeat(room.code, BEAT_MS).catch(function () { });
        if (watching && (!specBeatT || now - specBeatT > BEAT_MS)) { specBeatT = now; matchmaking.update(room.code, { ['spectators.' + netUser.uid]: now }).catch(function () { }); }   // watcher presence (top-level, so a game reset doesn't wipe it)
        if (effectiveHost(d) === netUser.uid && (!gcT || now - gcT > 15000)) { gcT = now; matchmaking.cleanup().catch(function () { }); }
        // Host housekeeping in the lobby: keep the roster within four, and free slots held by
        // players who have gone (so a disconnection doesn't occupy a seat forever).
        if (!watching && effectiveHost(d) === netUser.uid && g.status !== 'playing') {
            var bots = botMap(d), botIds = Object.keys(bots), humans = matchmaking.playerIds(d).length;
            if (humans + botIds.length > MAX_PLAYERS) {
                var keep = Math.max(0, MAX_PLAYERS - humans), next = {};
                botIds.slice(0, keep).forEach(function (id) { next[id] = bots[id]; });
                matchmaking.update(room.code, { bots: next, ready: {} }).catch(function () { });
            }
            if (!kickT || now - kickT > 2000) {
                kickT = now;
                matchmaking.playerIds(d).forEach(function (uid) { if (uid !== netUser.uid && isStale(uid)) matchmaking.kick(room.code, uid).catch(function () { }); });
            }
        }
        if (om && !om.local && g.status === 'playing' && effectiveHost(d) === om.myUid) { hostCheckForfeit(d, g); hostDrive(d, g); }
    }
    // If everyone but (at most) one has left/disconnected, end the match NOW by walkover
    // (don't make the survivor wait out a round) and flag it so they're told WHY they won.
    function hostCheckForfeit(d, g) {
        if (g.status !== 'playing' || om.host.forfeiting) return;
        var players = rosterPlayers(d), order = rosterIds(d);
        var aliveNow = order.filter(function (uid) { return (g.alive || {})[uid] !== false; });
        if (aliveNow.length < 2) return; // no-op forfeit checks must not read Firestore every 250ms
        // CPUs never leave, so they count as present — a lone human still playing CPUs is not a walkover.
        var live = aliveNow.filter(function (uid) { return players[uid] && !isStale(uid); });
        if (live.length > 1) return;
        var state = om.host; state.forfeiting = true;
        matchmaking.updateMatch(room.code, { matchId: g.matchId, round: g.round, status: 'playing' }, function (data) {
            var current = data.game, players2 = rosterPlayers(data), ids = rosterIds(data);
            var aliveNow = ids.filter(function (uid) { return (current.alive || {})[uid] !== false; });
            var present = aliveNow.filter(function (uid) { return players2[uid] && !isStale(uid); });
            if (present.length > 1 || aliveNow.length < 2) return null;
            var winner = present[0] || null, ranks = Object.assign({}, current.rankByUid), alive = Object.assign({}, current.alive);
            var count = aliveNow.length;
            aliveNow.filter(function (uid) { return uid !== winner; }).forEach(function (uid) { alive[uid] = false; ranks[uid] = count--; });
            if (winner) ranks[winner] = 1;
            return { 'game.alive': alive, 'game.rankByUid': ranks, 'game.status': 'over', 'game.winner': winner, 'game.endReason': 'left', status: 'lobby' };
        }).catch(function () {}).finally(function () { state.forfeiting = false; });
    }
    function hostDrive(d, g) {
        if (g.round !== om.round) return;
        var r = g.round, nowp = performance.now(), full = countSec(r) + om.memo + om.answerSec;
        var answerEnd = om.localStart + full * 1000;
        var roundEnd = om.localStart + (full + om.replay + RESULT_SEC) * 1000;
        var state = om.host;
        if ((g.settledRound || 0) < r) {
            if (!state.tallying && nowp >= answerEnd + SETTLE_MS) {
                state.tallying = true;
                hostTally(d, g).catch(function () {}).finally(function () { state.tallying = false; });
            }
        } else if (!state.advancing && g.status === 'playing' && nowp >= roundEnd + HOST_BUFFER_MS) {
            state.advancing = true;
            (g.pending ? hostCommitOver(d, g) : hostNextRound(d, g)).catch(function () {}).finally(function () { state.advancing = false; });
        }
    }
    function hostCommitOver(d, g) {
        if (om.local) {
            var pending = g.pending || {};
            return roomWrite({ 'game.status': 'over', 'game.winner': pending.winner || null, 'game.endReason': pending.endReason || 'normal', status: 'lobby' });
        }
        return matchmaking.updateMatch(room.code, { matchId: g.matchId, round: g.round, status: 'playing', settledRound: g.round }, function (data) {
            var pending = data.game.pending;
            return pending ? { 'game.status': 'over', 'game.winner': pending.winner || null, 'game.endReason': pending.endReason || 'normal', status: 'lobby' } : null;
        });
    }
    function hostTally(d, g) {
        var exit = om.puzzle.exit;
        if (om.local) return roomWrite(tallyPatch(d, g, exit));
        return matchmaking.settleRound(room.code, { matchId: g.matchId, round: g.round }, function (data) {
            return tallyPatch(data, data.game, exit);
        });
    }
    function tallyPatch(d, g, exit) {
        var r = g.round, players = rosterPlayers(d), order = rosterIds(d);
        var answers = g.answers || {};
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
        // Adaptive difficulty, scaled to the live field: aim for a modest minority to miss.
        // Signal = misses (m) among present players (N). Too many missed → easier; too few → harder.
        //   easier if m >= ceil(N/2)   (e.g. N=8 → 4+)
        //   harder if m <= floor(N/5)  (e.g. N=8 → 0–1)
        //   else hold                  (e.g. N=8 → 2–3, the sweet spot)
        // Using misses (not HP losses) makes an all-wrong round correctly read as "too hard".
        var center = g.center != null ? g.center : START_LEVEL;
        var fieldN = present.length, misses = wrong.length;
        if (fieldN >= 2) {
            if (misses >= Math.ceil(fieldN / 2)) center = levelDown(center);
            else if (misses <= Math.floor(fieldN / 5)) center = levelUp(center);
        }
        var patch = {
            'game.hp': hp, 'game.alive': alive, 'game.results': results, 'game.revealedRound': r, 'game.rankByUid': ranks, 'game.center': center, 'game.settledRound': r,
        };
        // Publish the pending result so a replacement host can finish the reveal.
        patch['game.pending'] = over ? { winner: winner, endReason: gone.length ? 'left' : 'normal' } : null;
        return patch;
    }
    function hostNextRound(d, g) {
        var center = g.center != null ? g.center : START_LEVEL;
        var level = AC.math.clamp(center + (Math.random() * 2 - 1) * jitterFor(center), LEVEL_MIN, LEVEL_MAX);
        var patch = { 'game.round': g.round + 1, 'game.level': level, 'game.answers': {}, 'game.results': {}, 'game.revealedRound': 0, 'game.pending': null };
        if (om.local) return roomWrite(patch);
        return matchmaking.updateMatch(room.code, { matchId: g.matchId, round: g.round, status: 'playing', settledRound: g.round }, function (data) {
            return data.game.pending ? null : patch;
        });
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
        if (ph === 'memorize') { drawMirrors(p, 1); drawTimerBar(1 - info.ts / om.memo, false); caption(spec ? watchCaption() : t('beamWatch'), spec ? '#94a3b8' : BEAM); return; }
        if (ph === 'answer') {
            var left = 1 - info.ts / om.answerSec;
            if (spec) {   // spectator: a muted "solution PREVIEW" (dashed path + dashed exit) + everyone's live picks
                drawBeamPreview(p); drawMirrors(p, 1); drawEntry(p); previewExit(p); drawPicks(p);
                drawTimerBar(left, false); caption(watchCaption(), '#94a3b8'); return;
            }
            drawPorts(p); drawEntry(p); drawTimerBar(left, left < 0.25);
            if (om.choice) { var mc = colorForOrder((room.data && room.data.players && room.data.players[om.myUid]) ? room.data.players[om.myUid].order : 0); highlightCell(portRect(om.choice.r, om.choice.c, om.choice.side, p.N), mc); }
            caption(t('beamRecall')); return;
        }
        // reveal onward: spectators share the same animation — they feel the reveal, having only previewed it
        if (ph === 'reveal') { drawBeamUpTo(p, info.ts / om.replay); drawMirrors(p, AC.math.clamp(info.ts / 0.25, 0, 1)); drawEntry(p); drawPicks(p); caption(t('beamReplay')); return; }
        if (ph === 'result') {
            drawBeamUpTo(p, 1); drawMirrors(p, 1); drawEntry(p); lightExit(p); drawPicks(p); outlineExit(p);
            if (!om.alive) caption(watchCaption(), '#94a3b8');
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
        var g = room.data.game || {}, answers = g.answers || {}, players = rosterPlayers(room.data), order = rosterIds(room.data);
        var groups = {};
        order.forEach(function (uid) {
            var a = answers[uid]; if (!a || a.side == null) return;
            if (g.hp && !(uid in g.hp)) return;                 // not in this match roster
            var key = a.r + '|' + a.c + '|' + a.side; (groups[key] = groups[key] || []).push(uid);
        });
        for (var key in groups) {
            var list = groups[key], a0 = answers[list[0]], R = portRect(a0.r, a0.c, a0.side, p.N), n = list.length;
            // Tile the picks in a grid that follows the port's aspect, so up to 8 stay readable
            // (a wide top/bottom tile gets more columns; a tall side tile gets more rows).
            var cols, rows;
            if (n <= 2) { var wide = (a0.side === U || a0.side === D); cols = wide ? n : 1; rows = wide ? 1 : n; }
            else { cols = AC.math.clamp(Math.round(Math.sqrt(n * (R.w / R.h))), 1, n); rows = Math.ceil(n / cols); }
            ctx.save(); cellPath(R); ctx.clip(); ctx.globalAlpha = 0.92;
            for (var i = 0; i < n; i++) {
                ctx.fillStyle = playerColor(players[list[i]]);
                var cc = i % cols, cr = (i / cols) | 0;
                var sx = R.x + R.w * cc / cols, sy = R.y + R.h * cr / rows, sw = R.w / cols, sh = R.h / rows;
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
        var b = $('best'); if (b) { var st = loadSoloStats(om && om.notch != null ? om.notch : stagedNotch); b.textContent = st.best ? placeLabel(st.best) : '—'; }
    }
    function applyHudMode() {
        var e;
        if ((e = $('stat-score'))) e.style.display = 'none';                                  // no numeric score any more
        if ((e = $('stat-lives'))) e.style.display = 'none';                                  // HP is shown in the players strip
        if ((e = $('stat-best'))) e.style.display = (om && !om.local) ? 'none' : '';           // best = your best placement (solo)
    }
    function pname(uid, players) { var p = players && players[uid]; return (p && p.name) || t('beamGuest'); }
    function watcherCount() { var s = room && room.data && room.data.spectators, now = Date.now(), n = 0; if (s) for (var k in s) if (now - (s[k] || 0) < STALL_MS) n++; return n; }   // live watchers = fresh heartbeats (leavers drop off automatically)
    function watchCaption() { return (om && om.spectator) ? t('beamWatching') : t('beamSpectating'); }   // pure spectator vs eliminated player
    function renderPlayersBar(data) {
        var bar = $('players'); if (!bar) return;
        if (!om || !data) { bar.hidden = true; return; }
        bar.hidden = false; bar.innerHTML = '';
        var g = data.game || {}, players = rosterPlayers(data), order = rosterIds(data);
        bar.classList.toggle('compact', order.length > 4);   // tighter chips when the field is large (up to 8)
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
            var pr = players[uid], isCpu = !!(pr && pr.bot), pn = pname(uid, players);
            chip.title = pn + (isCpu && pr.notch != null ? ' \u00b7 ' + t('beamCpuTag') + ' ' + notchLabel(pr.notch) : '');   // strength on hover; the name stays visible
            var dot = document.createElement('span'); dot.className = 'dot'; dot.textContent = '\u25cf'; dot.style.color = playerColor(pr); chip.appendChild(dot);
            var name = document.createElement('span'); name.className = 'nm'; name.textContent = pn + (uid === om.myUid ? ' (' + t('beamYou') + ')' : ''); chip.appendChild(name);
            var meta = document.createElement('span'); meta.className = 'meta';
            if (dead) {
                var rk = document.createElement('span'); rk.className = 'rank'; rk.textContent = (g.rankByUid && g.rankByUid[uid]) ? placeLabel(g.rankByUid[uid]) : '\u2715'; meta.appendChild(rk);
            } else {
                var hp = (hpSrc[uid] != null) ? hpSrc[uid] : HP_START;
                var hearts = document.createElement('span'); hearts.className = 'hp'; hearts.textContent = hp > 3 ? (hp + '\u2665') : '\u2665'.repeat(Math.max(0, hp)); meta.appendChild(hearts);
                if (stale) { var off = document.createElement('span'); off.className = 'off'; off.textContent = '\u26a0'; off.title = t('beamOffline'); meta.appendChild(off); }
            }
            // Reserved result slot (always present) so a ✓/✗ appearing at the reveal never resizes the chip.
            var res = document.createElement('span'); res.className = 'res' + (!dead && revealed && g.results[uid] != null ? (g.results[uid] ? ' ok' : ' no') : '');
            res.textContent = (!dead && revealed && g.results[uid] != null) ? (g.results[uid] ? '\u2713' : '\u2717') : '';
            meta.appendChild(res);
            chip.appendChild(meta);
            bar.appendChild(chip);
        });
        var wc = watcherCount();
        if (wc > 0) { var wch = document.createElement('div'); wch.className = 'pchip watchers'; var we = document.createElement('span'); we.textContent = t('beamWatchers', wc); wch.appendChild(we); bar.appendChild(wch); }
        syncHud();
    }

    // ===============================================================
    // lobby (sign-in + room code; modeled on Rune Stones, N players)
    // ===============================================================
    var net = null, netUser = undefined, room = null, lobby = null, lobbyEl = null;
    var matchmaking = null, roomSession = null;
    var local = { bots: {}, seatOrder: [] }, botSerial = 0;   // staged Online line-up (CPUs you own) before a room
    var stagedNotch = DEFAULT_NOTCH, lobbyMode = 'solo', stagedHp = HP_START;   // Solo difficulty notch; settings tab; starting lives
    var lastSolo = null;   // the finished solo match's standings, shown in the Room until the next match
    var pres = {}, gcT = 0, specBeatT = 0, kickT = 0, memberSeen = false;   // presence; memberSeen = we've been seated in the current room
    // track each player's beat; `at` is OUR local time it last changed (no cross-client clock needed)
    function updatePres(g) {
        var beats = (g && g.beat) || {}, now = Date.now();
        for (var uid in beats) {
            var p = pres[uid];
            if (!p) pres[uid] = { v: beats[uid], at: beats[uid] === -1 ? now - STALL_MS - 1 : now };
            else if (p.v !== beats[uid]) { p.v = beats[uid]; if (beats[uid] !== -1) p.at = now; }
        }
    }
    function isStale(uid) { if (om && om.local) return false; var p = pres[uid]; return !!p && (Date.now() - p.at) > STALL_MS; }
    function hideShellOverlay() { var o = $('overlay'); if (o) o.hidden = true; }
    function myName() { return (netUser && netUser.name) || t('beamYou'); }

    // ---- unified Room: local line-up (you + CPUs) and online membership share one dialog ----
    function buildLobby() {
        lobby = window.createBeamLobby({
            document: document, t: t, locale: function () { return AC.i18n.locale; },
            notchLabel: notchLabel, notchMax: NOTCH_MAX, maxPlayers: MAX_PLAYERS,
            onClose: onLobbyClose, onError: showLobbyError,
            model: lobbyModel, setMode: setMode, setNotch: setNotch, setHp: setHp,
            addCpu: addCpu, setCpuStrength: setCpuStrength, removeCpu: removeCpu, rename: renamePlayer, kick: doKick,
            createRoom: createRoom, join: joinRoom, spectate: doSpectate, leave: doLeave, copy: copyCode,
            primary: primaryAction, unready: doUnready, signOut: doSignOut,
        });
        lobbyEl = lobby.element;
    }
    function openLobby() {
        if (om && om.local) { om = null; botTimers.forEach(clearTimeout); botTimers = []; var pb = $('players'); if (pb) pb.hidden = true; }   // leaving a solo match → back to the Room
        if (room && room.code === 'SOLO') room = null;                          // never show the fake local room in the Room dialog
        if (lobby) lobby.open();
        hideShellOverlay(); renderLobby();
        if (matchmaking) matchmaking.cleanup().catch(function () { });
    }
    function closeLobby() { if (lobby) lobby.close(); }
    function onLobbyClose() {
        if (om && om.over && !om.local) { doLeave(); return; }     // finished online match → leave the room cleanly
        if (!om) shell.refreshOverlay();                           // no match → show the idle ready screen behind
    }
    function detachRoom() { if (roomSession) roomSession.detach(); room = null; pres = {}; memberSeen = false; }
    function attachRoom(code, spectate) { detachRoom(); room = roomSession.attach(code, { spectate: !!spectate }); renderLobby(); }
    function renderLobby() { if (lobby) lobby.render(); }
    function showLobbyError(e) {
        var m = String((e && e.message) || e), msg = t('beamNetErr');
        if (m.indexOf('not found') !== -1) msg = t('beamRoomNotFound');
        else if (m.indexOf('full') !== -1) msg = t('beamRoomFull');
        else if (m.indexOf('already') !== -1) msg = t('beamAlreadyStarted');
        else if (m.indexOf('online unavailable') !== -1) msg = t('beamOnlineUnavailable');
        if (lobby) lobby.refs.status.textContent = msg;
        console.warn('[beam lobby]', e);
    }

    // ---- mode (Solo vs Online), selected in the settings dialog ----
    function currentMode() { return onlineRoom() ? 'online' : lobbyMode; }
    function setMode(m) {
        if (m !== 'solo' && m !== 'online') return;
        if (m === 'solo' && onlineRoom()) doLeave();                // can't stay in a room while in Solo
        lobbyMode = m; savePrefs(); renderLobby(); syncHud();
    }
    function setNotch(n) {   // Solo: one difficulty for all 3 CPU rivals
        n = AC.math.clamp(n | 0, 0, NOTCH_MAX); if (n === stagedNotch) return;
        stagedNotch = n; savePrefs(); renderLobby(); syncHud();
    }
    function setHp(n) {   // starting lives for everyone this match
        n = AC.math.clamp(n | 0, HP_MIN, HP_MAX);
        if (onlineRoom()) { if (!isHost()) return; return matchmaking.update(room.code, { startHp: n, ready: {} }).catch(showLobbyError); }
        if (n === stagedHp) return;
        stagedHp = n; savePrefs(); renderLobby();
    }
    function savePrefs() { try { AC.prefs.set('beam', { notch: stagedNotch, mode: lobbyMode, hp: stagedHp }); } catch (e) { } }

    // ---- roster / room helpers ----
    function onlineRoom() { return !!(room && room.data && room.code !== 'SOLO'); }
    function isHost() { return onlineRoom() && !!netUser && effectiveHost(room.data) === netUser.uid; }
    function myUid() { return netUser ? netUser.uid : 'you'; }
    function onlineRosterCount(d) { d = d || (room && room.data); return matchmaking.playerIds(d).length + Object.keys(botMap(d)).length; }
    function localRosterCount() { return 1 + local.seatOrder.length; }
    function rosterCount() { return onlineRoom() ? onlineRosterCount() : localRosterCount(); }
    function nextBotNumber(bots) { var n = 1, names = Object.keys(bots).map(function (id) { return bots[id].name; }); while (names.indexOf(t('beamCpuName', n)) !== -1) n++; return n; }
    function newBotId() { return 'cpu-' + (++botSerial) + '-' + Math.floor(Math.random() * 1e6).toString(36); }
    function onlineBotsFromLocal() { var out = {}; local.seatOrder.forEach(function (id, i) { var b = local.bots[id]; if (b) out[id] = { name: b.name, order: i + 1, notch: b.notch }; }); return out; }

    // ---- CPU staging (Online mode): anyone can add CPUs they own; only the owner configures them ----
    // The RTDB adapter preserves explicit null, so we never write `bots.<id>: null` to delete —
    // we replace the whole (cleaned) `bots` map, mirroring the Darts participant updates.
    function addCpu() {
        if (rosterCount() >= MAX_PLAYERS) return;
        if (onlineRoom()) {
            var bots = botMap(room.data), id = newBotId(), next = Object.assign({}, bots);
            next[id] = { name: t('beamCpuName', nextBotNumber(bots)), order: Object.keys(bots).length + 1, notch: DEFAULT_NOTCH, owner: myUid() };
            return matchmaking.update(room.code, { bots: next, ready: {} }).catch(showLobbyError);
        }
        var lid = newBotId();
        local.bots[lid] = { name: t('beamCpuName', nextBotNumber(local.bots)), notch: DEFAULT_NOTCH };
        local.seatOrder.push(lid); renderLobby();
    }
    function setCpuStrength(id, notch) {   // value is a 0–15 difficulty notch
        notch = AC.math.clamp(notch | 0, 0, NOTCH_MAX);
        if (onlineRoom()) {
            var bots = botMap(room.data), b = bots[id]; if (!b || b.owner !== myUid()) return;   // only the CPU's owner may change it
            var next = Object.assign({}, bots); next[id] = Object.assign({}, b, { notch: notch });
            return matchmaking.update(room.code, { bots: next, ready: {} }).catch(showLobbyError);
        }
        if (local.bots[id]) { local.bots[id].notch = notch; renderLobby(); }
    }
    function removeCpu(id) {
        if (onlineRoom()) {
            var bots = botMap(room.data); if (!bots[id] || bots[id].owner !== myUid()) return;
            var next = {}; Object.keys(bots).forEach(function (k) { if (k !== id) next[k] = bots[k]; });
            return matchmaking.update(room.code, { bots: next, ready: {} }).catch(showLobbyError);
        }
        if (local.bots[id]) { delete local.bots[id]; local.seatOrder = local.seatOrder.filter(function (x) { return x !== id; }); renderLobby(); }
    }
    // Rename (darts-style: only your own slots). Online: your own name, or a CPU you own. Staging: your CPUs.
    function renamePlayer(id, name) {
        name = String(name || '').trim().slice(0, 24); if (!name) return;
        if (onlineRoom()) {
            if (id === myUid()) return matchmaking.update(room.code, { ['players.' + id + '.name']: name, ready: {} }).catch(showLobbyError);
            var bots = botMap(room.data), b = bots[id]; if (b && b.owner === myUid()) { var next = Object.assign({}, bots); next[id] = Object.assign({}, b, { name: name }); return matchmaking.update(room.code, { bots: next, ready: {} }).catch(showLobbyError); }
            return;
        }
        if (local.bots[id]) { local.bots[id].name = name; renderLobby(); }
    }
    // Host removes a member (frees a slot held by someone who disconnected or left it idle).
    function doKick(uid) { if (onlineRoom() && isHost() && uid !== myUid()) return matchmaking.kick(room.code, uid).catch(showLobbyError); }
    function ensureSignedIn() {
        return ensureOnline().then(function () {   // wait for Firebase, then sign in a guest if needed
            if (netUser) return;
            return net.signInGuest().then(function () {
                return new Promise(function (resolve) { net.onAuth(function (u) { if (u) { netUser = matchmaking.currentPlayer(); resolve(); } }); });
            });
        });
    }
    // Synchronous room primitives (also the room-test surface): queue the transaction immediately.
    function doCreate() { return matchmaking.create({ bots: onlineBotsFromLocal(), startHp: stagedHp }).then(attachRoom).catch(showLobbyError); }
    function doJoin(code) { code = String(code || '').trim().toUpperCase(); if (!code) return; return matchmaking.join(code).then(attachRoom).catch(showLobbyError); }
    function doReady() { if (room) return matchmaking.setReady(room.code).catch(showLobbyError); }
    function hostStart() { if (room) return matchmaking.start(room.code).catch(showLobbyError); }
    function doRematch() { if (room) return matchmaking.reset(room.code).catch(showLobbyError); }
    // Lobby wrappers: wait for the service + a (guest) sign-in, then create/join/spectate.
    function connecting() { if (lobby) lobby.refs.status.textContent = t('beamConnecting'); }
    function createRoom() {
        connecting();
        return ensureSignedIn().then(doCreate).catch(showLobbyError);
    }
    function joinRoom(code) {
        code = String(code || '').trim().toUpperCase(); if (!code) return;
        connecting();
        return ensureSignedIn().then(function () { return doJoin(code); }).catch(showLobbyError);
    }
    function doSpectate(code) {   // watch without taking a seat, even during a match
        code = String(code || '').trim().toUpperCase(); if (!code) return;
        connecting();
        return ensureSignedIn().then(function () { attachRoom(code, true); }).catch(showLobbyError);
    }
    function doLeave() {
        var wasMatch = !!(om && !om.local);
        if (roomSession) roomSession.leave().catch(showLobbyError);
        room = null; pres = {}; memberSeen = false;
        if (wasMatch) exitMatch();
        renderLobby();
    }
    function doUnready() { if (onlineRoom()) return matchmaking.setReady(room.code, false).catch(showLobbyError); }
    function doSignOut() { doLeave(); return net ? net.signOut() : Promise.resolve(); }
    function copyCode() {
        var code = room && room.data && room.data.code; if (!code) return;
        try { var p = navigator.clipboard && navigator.clipboard.writeText(code); if (p && p.catch) p.catch(function () { }); } catch (e) { }
        if (lobby) lobby.refs.status.textContent = t('beamCopied');
    }
    // The single primary button: Solo → start the match; Online (in a room) → host-start / ready / rematch.
    function primaryAction() {
        if (currentMode() === 'solo') { beginSolo(); return; }
        if (!onlineRoom()) return;                      // Online pre-room: Create / Join handle it
        var a = matchmaking.primaryAction(room.data) || { kind: 'none' };
        if (a.kind === 'start') return hostStart();
        if (a.kind === 'ready') return doReady();
        if (a.kind === 'rematch') return doRematch();
    }
    function lobbyStatus(d, finished) {
        if (!onlineRoom()) return '';
        var g = d.game || {};
        if (finished) {
            if (g.endReason === 'left' && g.winner === (netUser && netUser.uid)) return t('beamEndLeft');
            if (g.winner) return t('beamWinner', pname(g.winner, rosterPlayers(d)));
        }
        return '';
    }
    function roster() {
        if (onlineRoom()) return onlineRoster(room.data, (room.data.game || {}).status === 'over');
        // Online-mode staging (pre-room): you + the CPUs you've added (all owned by you).
        var r = [{ id: 'you', name: myName(), type: 'human', you: true, host: true, color: colorForOrder(0) }];
        local.seatOrder.forEach(function (id, i) { var b = local.bots[id]; if (!b) return;
            r.push({ id: id, name: b.name, type: 'cpu', notch: b.notch, ownedByMe: true, canRemove: true, canRename: true, order: i + 1, color: colorForOrder(i + 1) });
        });
        return r;
    }
    function onlineRoster(d, finished) {
        var g = d.game || {}, ready = d.ready || {}, host = effectiveHost(d), me = myUid(), editable = g.status !== 'playing', iHost = isHost();
        var ids = matchmaking.playerIds(d);
        if (finished) ids = ids.slice().sort(function (a, b) { return ((g.rankByUid || {})[a] || 99) - ((g.rankByUid || {})[b] || 99); });
        // Preview the same colour assignment the match will freeze: humans use their seat hue, CPUs fill the gaps.
        var used = {}; ids.forEach(function (uid) { var o = (d.players[uid] || {}).order; if (o != null) used[o] = true; });
        var free = []; for (var c = 0; c < MAX_PLAYERS; c++) if (!used[c]) free.push(c);
        var r = ids.map(function (uid, i) {
            var p = d.players[uid] || {};
            return { id: uid, name: pname(uid, d.players), type: 'human', you: uid === me, host: uid === host,
                ready: !finished && !!ready[uid], offline: isStale(uid),
                canRename: uid === me, canKick: iHost && uid !== me,
                rank: finished && (g.rankByUid || {})[uid] ? placeLabel(g.rankByUid[uid]) : '',
                color: colorForOrder(p.order != null ? p.order : i) };
        });
        var bots = botMap(d);
        Object.keys(bots).forEach(function (id, j) { var b = bots[id], mine = b.owner === me;
            var ci = b.color != null ? b.color : (free.length ? free[j % free.length] : j);
            r.push({ id: id, name: b.name, type: 'cpu', notch: b.notch, order: b.order, color: colorForOrder(ci),
                ownedByMe: mine, canRemove: mine && editable, canRename: mine && editable,
                rank: finished && (g.rankByUid || {})[id] ? placeLabel(g.rankByUid[id]) : '' });
        });
        return r;
    }
    function lobbyModel() {
        var mode = currentMode();
        if (mode === 'solo') {
            var st = loadSoloStats(stagedNotch);
            return { mode: 'solo', notch: stagedNotch, notchLabel: notchLabel(stagedNotch),
                best: st.best ? placeLabel(st.best) : null, hp: stagedHp, hpEditable: true,
                results: lastSolo, signedIn: !!netUser, account: netUser ? (netUser.name || t('beamGuest')) : '',
                action: { kind: 'start-solo' }, status: '' };
        }
        var online = onlineRoom(), d = online ? room.data : null, g = (d && d.game) || {};
        var finished = online && g.status === 'over', playing = online && g.status === 'playing';
        return {
            mode: 'online', online: online, code: online ? d.code : null,
            signedIn: !!netUser, account: netUser ? (netUser.name || t('beamGuest')) : '',
            phase: playing ? 'playing' : 'lobby',
            canAddCpu: !playing && rosterCount() < MAX_PLAYERS,
            hp: online ? (AC.math.clamp((d.startHp | 0) || HP_START, HP_MIN, HP_MAX)) : stagedHp,
            hpEditable: online ? (isHost() && !playing) : true,
            uid: myUid(), host: online ? effectiveHost(d) : 'you',
            roster: roster(),
            action: online ? (matchmaking.primaryAction(d) || { kind: 'none' }) : { kind: 'none' },
            status: lobbyStatus(d, finished),
        };
    }

    // ===============================================================
    // net boot
    // ===============================================================
    function setControlsForMatch() { var rb = $('room-btn'); if (rb) rb.disabled = !!(om && !om.over && !om.spectator); }   // no opening the Room while actively playing (spectators may still leave)
    // Wire the room service once ArcadeNet has finished its async Firebase init. Idempotent, so it is
    // safe to call from boot, from the arcade-net-ready event, and from ensureOnline().
    function initNet() {
        if (matchmaking) return true;
        var N = window.ArcadeNet;
        if (!N || !N.ok || (N.rooms && N.rooms.ok === false)) return false;
        net = N;
        matchmaking = net.rooms.create({
            collection: GROUP, identity: 'tab', minPlayers: 1, maxPlayers: MAX_PLAYERS,
            presenceField: 'game.beat',
            allowSpectators: true, isAvailable: function (uid) { return !isStale(uid); },
            onCreate: function (input) {   // promote the staged CPUs; each is owned by the creator
                var uid = (matchmaking.currentPlayer() || {}).uid, src = (input && input.bots) || {}, bots = {};
                Object.keys(src).forEach(function (id) { if (src[id]) bots[id] = { name: src[id].name, order: src[id].order, notch: src[id].notch, owner: uid }; });
                return { bots: bots, startHp: AC.math.clamp((input && input.startHp | 0) || HP_START, HP_MIN, HP_MAX) };
            },
            onLeave: function (data, player) {   // a departing connection takes its own CPUs with it
                var bots = botMap(data), out = {}, changed = false;
                Object.keys(bots).forEach(function (id) { if (bots[id].owner === player.uid) changed = true; else out[id] = bots[id]; });
                return changed ? { bots: out } : {};
            },
            canStart: function (data, ids) { var n = ids.length + Object.keys(botMap(data)).length; return n >= 2 && n <= MAX_PLAYERS; },
            startPatch: function (data, order) {
                var bots = botMap(data), hp = {}, alive = {}, resolved = {}, strengths = [], used = {};
                var lives = AC.math.clamp((data && data.startHp | 0) || HP_START, HP_MIN, HP_MAX);
                order.forEach(function (uid) { hp[uid] = lives; alive[uid] = true; var o = (data.players[uid] || {}).order; if (o != null) used[o] = true; });
                var free = []; for (var c = 0; c < MAX_PLAYERS; c++) if (!used[c]) free.push(c);
                var bi = 0;
                Object.keys(bots).forEach(function (id) { var s = strengthForNotch(bots[id].notch); strengths.push(s);
                    hp[id] = lives; alive[id] = true; resolved[id] = { name: bots[id].name, order: bots[id].order, notch: bots[id].notch, owner: bots[id].owner, strength: s, color: free[bi++ % free.length] }; });
                var start = openingLevel(strengths);                                    // trail the CPU field (humans-only → START_LEVEL)
                return { status: 'playing', bots: resolved, game: { status: 'playing', round: 1,
                    seed: (Math.random() * 1e9) >>> 0, level: start, center: start,
                    hp: hp, alive: alive, answers: {}, results: {}, rankByUid: {} } };
            },
        });
        roomSession = matchmaking.session({
            onChange: function (data, activeRoom) { room = activeRoom; onRoom(data); },
            onError: showLobbyError,
        });
        net.onAuth(function (uu) { netUser = uu ? matchmaking.currentPlayer() : uu; renderLobby(); });
        return true;
    }
    // Mirrors Darts: every online action awaits this, so it WAITS for ArcadeNet's async Firebase init
    // (cached in onlineLoading, reset on failure for retry) instead of reading `net` synchronously —
    // which is why a quick Create/Join right after load no longer fails with "online unavailable".
    var onlineLoading = null;
    function onNetReady() {   // resolve once ArcadeNet has finished loading (or is already present)
        if (window.ArcadeNet) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () { window.removeEventListener('arcade-net-ready', ok); reject(new Error('online unavailable')); }, 15000);
            function ok() { clearTimeout(timer); window.removeEventListener('arcade-net-ready', ok); resolve(); }
            window.addEventListener('arcade-net-ready', ok, { once: true });
        });
    }
    function ensureOnline() {
        if (initNet()) return Promise.resolve();
        if (!onlineLoading) onlineLoading = onNetReady().then(function () {
            if (!initNet()) throw new Error('online unavailable');   // loaded but Firebase/rooms are unavailable
        }).catch(function (e) { onlineLoading = null; throw e; });    // reset so a later attempt can retry
        return onlineLoading;
    }
    function setupOnline() {
        if (!initNet()) window.addEventListener('arcade-net-ready', function () { if (initNet()) renderLobby(); }, { once: true });
        setInterval(watchdog, 250);
        window.addEventListener('beforeunload', function () { if (room && room.code && net && !(om && om.local) && room.data && netUser && room.data.players && room.data.players[netUser.uid]) { roomSession.leave().catch(function () { }); } });
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
        var saved = {}; try { saved = AC.prefs.get('beam') || {}; } catch (e) { }
        if (saved.notch != null && saved.notch >= 0 && saved.notch <= NOTCH_MAX) stagedNotch = saved.notch | 0;
        if (saved.mode === 'solo' || saved.mode === 'online') lobbyMode = saved.mode;
        if (saved.hp >= HP_MIN && saved.hp <= HP_MAX) stagedHp = saved.hp | 0;
        shell = AC.shell.create({
            gameId: 'beam', step: 1 / 60,
            update: function () { if (om) updateOnline(); },
            render: render,
            restartToReady: true,                                                                     // Restart returns to the ready screen
            reset: toReady,                                                                           // goIdle/play-again → prepare the ready screen
            onStart: function () { if (om) return; queueMicrotask(function () { shell.goIdle(); openLobby(); }); },   // the ready/over button opens the Room; matches start from there
            canPause: function () { return !om; },                                                    // no pausing a timed match
            canRestart: function () { return !(om && !om.local); },                                   // solo can restart; online can't
            onGameOver: function () { syncHud(); },                                                   // re-assert the best-placement HUD (shell just wrote a score-best)
            overlayContent: function (state, result) {
                if (state === 'idle') return { badge: 'zap', title: t('beamArcName'), message: t('beamReadyMsg'), button: t('beamRoomBtn') };
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
                        button: t('beamRoomBtn'),
                        hint: t('beamTierLabel') + '：' + notchLabel(m.notch || 0) + ' · ' + t('best') + ' ' + placeLabel(m.best || (m.rank || 4)),
                    };
                }
                return {};
            },
        });
        buildLobby();
        var rb = $('room-btn'); if (rb) rb.addEventListener('click', function () { AC.audio.unlock(); openLobby(); });
        setupOnline();
        if (window.CloudSync) window.CloudSync.onApplied(syncHud);   // repaint best on account swap / cloud merge
        applyHudMode();
        AC.i18n.subscribe(function () { syncHud(); if (!om) shell.refreshOverlay(); if (lobby && lobby.isOpen()) renderLobby(); });
        syncHud();
        render();                                                                                     // paint the backdrop behind the ready overlay
        openLobby();                                                                                  // the Room is the start screen (open on load)
    }
    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
