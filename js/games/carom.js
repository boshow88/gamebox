/* Carom — flick-soccer on ArcadeCommon + CaromEngine.
 * Hot-seat (two humans, one device) AND online versus (room code, modelled on Rune
 * Stones / Beam). Turn-based + deterministic physics => online sync is cheap: the
 * shooter pre-computes the authoritative outcome head-less (CaromEngine.settle),
 * broadcasts {shot, result} in one write, and both clients animate the shot then SNAP
 * to the identical result — so float drift can never desync. CPU comes next. */
(function () {
    'use strict';
    var AC = window.ArcadeCommon, E = window.CaromEngine;
    var t = AC.i18n.t;

    // ---------------- i18n ----------------
    var STRINGS = {
        en: {
            caromName: 'Carom',
            caromReady: 'Two players, one device. On your turn, drag one of your players back and release to flick it — carom into the ball and score. First to 3 wins.',
            caromScore: 'Score', caromTurn: 'Turn',
            caromTeam0: 'Blue', caromTeam1: 'Red',
            caromAim: function (n) { return n + ' to shoot'; },
            caromWin: function (n) { return n + ' wins!'; },
            caromGoal: 'GOAL!', caromYourTurn: 'Your turn', caromOppTurn: 'Opponent shooting…',
            caromHelp1Html: 'Hot-seat for <strong>two players</strong> — or tap <strong>Online</strong> to play by room code. On your turn, <strong>drag one of your players back</strong> and release to flick it.',
            caromHelp2Html: 'Carom off teammates, rivals and the ball to knock the <strong>ball into the far goal</strong>. Knock it into your own net and the point goes to your rival.',
            caromHelp3Html: '<strong>Right-click</strong> (or the corner ✕) cancels a drag so you can pick another player. First to <strong>3 goals</strong> wins. <kbd>R</kbd> restart · <kbd>M</kbd> mute.',
            // lobby (aligned with Rune Stones / Beam)
            caromOnlineBtn: 'Online', caromLobbyTitle: 'Online match', caromClose: 'Close',
            caromSignInGoogle: 'Sign in with Google', caromSignInGuest: 'Play as guest',
            caromSignedIn: function (n) { return 'Signed in: ' + n; }, caromSignOut: 'Sign out', caromGuest: 'Guest',
            caromCreateRoom: 'Create room', caromRoomCode: 'Code', caromJoinRoom: 'Join',
            caromCopyCode: 'Copy', caromLeaveRoom: 'Leave room', caromCopied: 'Copied!',
            caromReadyUp: 'I\u2019m ready to start', caromReadyWait: 'Ready — waiting for others…', caromStartMatch: 'Start match',
            caromNeedTwo: 'Need 2 players', caromHostStarts: 'The host starts once both are ready.', caromSignInFirst: 'Sign in to create or join a room.',
            caromRoomNotFound: 'Room not found', caromRoomFull: 'Room is full', caromAlreadyStarted: 'That match already started', caromNetErr: 'Network error',
            caromYou: 'You', caromHost: 'Host', caromReadyTag: 'ready',
            caromResultsTitle: 'Final score', caromWinner: function (n) { return n + ' wins!'; }, caromRematch: 'Rematch',
            caromRoomGone: 'Room closed', caromOffline: 'offline', caromEndLeft: 'Your opponent left — you win.',
            // pre-match settings / presets
            caromSettings: 'Settings', caromSettingsTitle: 'Match setup', caromSettingsDone: 'Done', caromSetByHost: 'Set by the host',
            caromFieldLabel: 'Field', caromBallLabel: 'Ball', caromFormationLabel: 'Formation', caromTargetLabel: 'Win at', caromGoalLabel: 'Goal',
            caromField_grass: 'Grass', caromField_ice: 'Ice', caromField_sand: 'Sand',
            caromBall_standard: 'Standard', caromBall_beach: 'Beach ball', caromBall_heavy: 'Heavy',
            caromFm_f4b: 'Balanced', caromFm_f4a: 'Attack', caromFm_f5b: 'Balanced', caromFm_f5d: 'Defensive', caromFm_f5a: 'Attack', caromFm_f6b: 'Balanced', caromFm_f6d: 'Defensive', caromFm_f6a: 'Attack', caromFm_f7b: 'Standard', caromFm_f7d: 'Bunker',
            caromGoalNarrow: 'Narrow', caromGoalStd: 'Standard', caromGoalWide: 'Wide',
        },
        zh: {
            caromName: '彈球場',
            caromReady: '兩人同機對戰，或點「線上」用房號配對。輪到你時，往後拖曳你的一個球員再放開彈射——撞擊球把它送進對方球門。先得 3 分者獲勝。',
            caromScore: '比分', caromTurn: '出手',
            caromTeam0: '藍方', caromTeam1: '紅方',
            caromAim: function (n) { return n + '出手'; },
            caromWin: function (n) { return n + '獲勝！'; },
            caromGoal: '進球！', caromYourTurn: '你的回合', caromOppTurn: '對手出手中…',
            caromHelp1Html: '<strong>兩人</strong>同機輪流，或點 <strong>線上</strong> 用房號配對。輪到你時，<strong>往後拖曳你的一個球員</strong>再放開彈射，像彈弓一樣。',
            caromHelp2Html: '撞擊隊友、對手與球，把<strong>球撞進對方球門</strong>。若撞進自家球門，分數就送給對手。',
            caromHelp3Html: '<strong>按右鍵</strong>（或畫面角落的 ✕）可取消拖曳、改選別的球員。先得 <strong>3 分</strong>者獲勝。<kbd>R</kbd> 重來 · <kbd>M</kbd> 靜音。',
            caromOnlineBtn: '線上', caromLobbyTitle: '線上對戰', caromClose: '關閉',
            caromSignInGoogle: '用 Google 登入', caromSignInGuest: '以訪客身分遊玩',
            caromSignedIn: function (n) { return '已登入：' + n; }, caromSignOut: '登出', caromGuest: '訪客',
            caromCreateRoom: '建立房間', caromRoomCode: '房號', caromJoinRoom: '加入',
            caromCopyCode: '複製', caromLeaveRoom: '離開房間', caromCopied: '已複製！',
            caromReadyUp: '準備好了', caromReadyWait: '已準備，等待對手…', caromStartMatch: '開始對戰',
            caromNeedTwo: '需要 2 位玩家', caromHostStarts: '兩人都準備好後，由房主開始。', caromSignInFirst: '登入後即可建立或加入房間。',
            caromRoomNotFound: '找不到房間', caromRoomFull: '房間已滿', caromAlreadyStarted: '該場對戰已經開始', caromNetErr: '連線錯誤',
            caromYou: '你', caromHost: '房主', caromReadyTag: '已準備',
            caromResultsTitle: '最終比分', caromWinner: function (n) { return n + ' 獲勝！'; }, caromRematch: '再來一場',
            caromRoomGone: '房間已關閉', caromOffline: '離線', caromEndLeft: '對手離開了——你獲勝。',
            // pre-match settings / presets
            caromSettings: '設定', caromSettingsTitle: '開賽設定', caromSettingsDone: '完成', caromSetByHost: '由房主設定',
            caromFieldLabel: '場地', caromBallLabel: '球', caromFormationLabel: '陣形', caromTargetLabel: '獲勝分數', caromGoalLabel: '球門',
            caromField_grass: '草地', caromField_ice: '冰地', caromField_sand: '沙灘',
            caromBall_standard: '標準球', caromBall_beach: '海灘球', caromBall_heavy: '鉛球',
            caromFm_f4b: '平衡', caromFm_f4a: '進攻', caromFm_f5b: '平衡', caromFm_f5d: '防守', caromFm_f5a: '進攻', caromFm_f6b: '平衡', caromFm_f6d: '防守', caromFm_f6a: '進攻', caromFm_f7b: '標準', caromFm_f7d: '鐵桶',
            caromGoalNarrow: '窄', caromGoalStd: '標準', caromGoalWide: '寬',
        },
    };
    Object.assign(AC.i18n.STRINGS.en, STRINGS.en);
    Object.assign(AC.i18n.STRINGS.zh, STRINGS.zh);

    // ---------------- constants ----------------
    var POCKET = 40, KEEPER_ZONE = 60, CORNER = 46;         // goal recess (out) + keeper zone (in) + rounded-corner radius; must match engine cfg
    var CW = 512, CH = 828, FMX = 24, FMT = 50, FMB = 50;   // narrow + long pitch; thin top/bottom margins hold the pocket, with caption + ✕ tucked beside it
    var FW = CW - 2 * FMX, FH = CH - FMT - FMB;
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var TEAM = ['#38bdf8', '#fb7185'];               // team 0 (blue, bottom) / team 1 (red, top)
    var BALL = '#eef2f7';
    var MAXPULL = 120, MAXSPEED = 1200, CANCEL_R = 16, FIRE_MIN = 14;   // pull shorter than FIRE_MIN won't fire (and shows no arrow)
    var EJECT_MS = 360;                                        // slide-out animation for a player ejected from a goal
    var SUB = Math.max(1, Math.round((1 / 60) / E.STEP_DT));   // sub-steps/frame at the engine's canonical dt (matches settle → no snap)
    var GROUP = 'carom_rooms', MAX_PLAYERS = 2, BEAT_MS = 3000, STALL_MS = 8000, SIM_MAX_MS = 6000;

    // ---------------- presets (named bundles of physics params) ----------------
    // Friction = field μ × body fricMul, plus global v² air drag (see carom-engine). Each category owns
    // DISJOINT params so a field + ball + players combo never fights over the same number.
    var KAIR = 7e-6;                                  // global air-drag coefficient (shared across fields)
    var PRESETS = {
        field: {   // μ = Coulomb deceleration (lower = slippery); look = turf/stripe/line colours
            grass: { mu: 1600, wallRest: 0.86, turf: '#123a2a', s0: 'rgba(255,255,255,0.025)', s1: 'rgba(0,0,0,0.04)', line: 'rgba(255,255,255,0.35)' },
            ice: { mu: 900, wallRest: 0.98, turf: '#143247', s0: 'rgba(255,255,255,0.06)', s1: 'rgba(120,180,230,0.05)', line: 'rgba(205,232,255,0.5)' },
            sand: { mu: 2200, wallRest: 0.90, turf: '#5a4a28', s0: 'rgba(255,240,200,0.05)', s1: 'rgba(0,0,0,0.05)', line: 'rgba(255,245,220,0.4)' },
        },
        ball: {    // size / weight / bounce / roll — the air-drag "float" falls out of r & m automatically
            standard: { ballR: 8, ballMass: 0.35, ballRest: 0.80, ballFric: 0.75 },
            beach: { ballR: 14, ballMass: 0.05, ballRest: 0.95, ballFric: 1.20 },
            heavy: { ballR: 6, ballMass: 1.20, ballRest: 0.22, ballFric: 0.55 },
        },
        // formation = count + per-player size/weight/bounce + starting spots (fractions of the team's OWN half,
        // y small = near own goal). The bottom team is mirrored. slots are also the hook for custom placement.
        formation: {
            // 4 players (goalie + 3)
            f4b: { players: 4, playerR: 24, playerMass: 1.0, playerRest: 0.60, playerFric: 1.0, slots: [{ x: 0.50, y: 0.055 }, { x: 0.36, y: 0.17 }, { x: 0.64, y: 0.17 }, { x: 0.50, y: 0.36 }] },
            f4a: { players: 4, playerR: 24, playerMass: 1.0, playerRest: 0.60, playerFric: 1.0, slots: [{ x: 0.50, y: 0.055 }, { x: 0.50, y: 0.17 }, { x: 0.32, y: 0.35 }, { x: 0.68, y: 0.35 }] },
            // 5 players (goalie + 4)
            f5b: { players: 5, playerR: 22, playerMass: 1.0, playerRest: 0.60, playerFric: 1.0, slots: [{ x: 0.50, y: 0.055 }, { x: 0.42, y: 0.16 }, { x: 0.58, y: 0.16 }, { x: 0.27, y: 0.35 }, { x: 0.73, y: 0.35 }] },
            f5d: { players: 5, playerR: 22, playerMass: 1.0, playerRest: 0.60, playerFric: 1.0, slots: [{ x: 0.50, y: 0.055 }, { x: 0.30, y: 0.15 }, { x: 0.50, y: 0.17 }, { x: 0.70, y: 0.15 }, { x: 0.50, y: 0.36 }] },
            f5a: { players: 5, playerR: 22, playerMass: 1.0, playerRest: 0.60, playerFric: 1.0, slots: [{ x: 0.50, y: 0.055 }, { x: 0.50, y: 0.15 }, { x: 0.28, y: 0.33 }, { x: 0.50, y: 0.42 }, { x: 0.72, y: 0.33 }] },
            // 6 players (goalie + 5)
            f6b: { players: 6, playerR: 21, playerMass: 1.0, playerRest: 0.60, playerFric: 1.0, slots: [{ x: 0.50, y: 0.05 }, { x: 0.33, y: 0.15 }, { x: 0.67, y: 0.15 }, { x: 0.50, y: 0.27 }, { x: 0.33, y: 0.38 }, { x: 0.67, y: 0.38 }] },
            f6d: { players: 6, playerR: 21, playerMass: 1.0, playerRest: 0.60, playerFric: 1.0, slots: [{ x: 0.50, y: 0.05 }, { x: 0.28, y: 0.14 }, { x: 0.50, y: 0.16 }, { x: 0.72, y: 0.14 }, { x: 0.38, y: 0.34 }, { x: 0.62, y: 0.34 }] },
            f6a: { players: 6, playerR: 21, playerMass: 1.0, playerRest: 0.60, playerFric: 1.0, slots: [{ x: 0.50, y: 0.05 }, { x: 0.35, y: 0.15 }, { x: 0.65, y: 0.15 }, { x: 0.28, y: 0.34 }, { x: 0.50, y: 0.42 }, { x: 0.72, y: 0.34 }] },
            // 7 players (goalie + 6)
            f7b: { players: 7, playerR: 20, playerMass: 1.0, playerRest: 0.60, playerFric: 1.0, slots: [{ x: 0.50, y: 0.05 }, { x: 0.26, y: 0.15 }, { x: 0.50, y: 0.15 }, { x: 0.74, y: 0.15 }, { x: 0.30, y: 0.33 }, { x: 0.50, y: 0.35 }, { x: 0.70, y: 0.33 }] },
            f7d: { players: 7, playerR: 20, playerMass: 1.0, playerRest: 0.60, playerFric: 1.0, slots: [{ x: 0.50, y: 0.05 }, { x: 0.22, y: 0.14 }, { x: 0.42, y: 0.16 }, { x: 0.58, y: 0.16 }, { x: 0.78, y: 0.14 }, { x: 0.38, y: 0.33 }, { x: 0.62, y: 0.33 }] },
        },
    };
    var FIELD_KEYS = ['grass', 'ice', 'sand'], BALL_KEYS = ['standard', 'beach', 'heavy'];
    var FORMATION_KEYS = ['f4b', 'f4a', 'f5b', 'f5d', 'f5a', 'f6b', 'f6d', 'f6a', 'f7b', 'f7d'], FM_COUNTS = [4, 5, 6, 7];
    var TARGET_OPTS = [3, 5, 7], GOAL_OPTS = [100, 130, 160];
    function loadSettings() {
        var s = {}; try { s = AC.prefs.get('carom') || {}; } catch (e) { }
        return {
            field: PRESETS.field[s.field] ? s.field : 'grass',
            ball: PRESETS.ball[s.ball] ? s.ball : 'standard',
            formation: PRESETS.formation[s.formation] ? s.formation : 'f5b',
            target: TARGET_OPTS.indexOf(s.target) >= 0 ? s.target : TARGET_OPTS[0],
            goalW: GOAL_OPTS.indexOf(s.goalW) >= 0 ? s.goalW : GOAL_OPTS[Math.floor(GOAL_OPTS.length / 2)],
        };
    }
    function saveSettings() { try { AC.prefs.set('carom', SETTINGS); } catch (e) { } }
    function sanitizeSettings(s) {   // coerce a remote (host-broadcast) settings blob to a safe shape
        s = s || {};
        return {
            field: PRESETS.field[s.field] ? s.field : 'grass',
            ball: PRESETS.ball[s.ball] ? s.ball : 'standard',
            formation: PRESETS.formation[s.formation] ? s.formation : 'f5b',
            target: TARGET_OPTS.indexOf(s.target) >= 0 ? s.target : TARGET_OPTS[0],
            goalW: GOAL_OPTS.indexOf(s.goalW) >= 0 ? s.goalW : GOAL_OPTS[Math.floor(GOAL_OPTS.length / 2)],
        };
    }
    var SETTINGS = loadSettings();
    saveSettings();   // heal storage: re-persist the normalised settings so a value that fell out of its option
    //                  list (e.g. an old goalW after GOAL_OPTS changed) is rewritten to a valid one, not silently
    //                  dropped every reload (and resurrected the next time another setting is saved).

    var canvas, ctx, shell, world;
    // unified match state. M.local = hot-seat; else online.
    var M = null;

    function $(id) { return document.getElementById(id); }
    // the single source of engine config — composed from the chosen presets (+ the preset KEYS so the
    // other client can mirror look/target). Everything (hot-seat, preview, and the host's broadcast) flows through here.
    function cfg() {
        var f = PRESETS.field[SETTINGS.field], b = PRESETS.ball[SETTINGS.ball], p = PRESETS.formation[SETTINGS.formation];
        return {
            W: FW, H: FH, goalW: SETTINGS.goalW, target: SETTINGS.target, kAir: KAIR,
            pocket: POCKET, keeperZone: KEEPER_ZONE, corner: CORNER,
            field: SETTINGS.field, ball: SETTINGS.ball, mu: f.mu, wallRest: f.wallRest,
            players: p.players, playerR: p.playerR, playerMass: p.playerMass, playerRest: p.playerRest, playerFric: p.playerFric, slots: p.slots,
            ballR: b.ballR, ballMass: b.ballMass, ballRest: b.ballRest, ballFric: b.ballFric,
        };
    }
    function curFieldKey() { return (M && M.fieldKey) || SETTINGS.field; }
    function curBallKey() { return (M && M.ballKey) || SETTINGS.ball; }

    // ---------------- hot-seat lifecycle ----------------
    function startHotSeat() {
        var c = cfg(); world = E.create(c);
        M = { local: true, phase: 'aim', turn: Math.random() < 0.5 ? 0 : 1, score: [0, 0], drag: null, flash: 0, target: c.target, fieldKey: c.field, ballKey: c.ball };
        hideShellOverlay(); setControlsForMatch(); syncHud();
    }
    function hotEndTurn() { M.turn = 1 - M.turn; M.phase = 'aim'; M.drag = null; syncHud(); }
    function hotGoal(side) {
        var scorer = side === 'top' ? 0 : 1;
        M.score[scorer]++; M.flash = 1; AC.audio.play('gem'); syncHud();
        if (M.score[scorer] >= M.target) { shell.gameOver({ score: 0, win: true, meta: { winner: scorer, score: M.score.slice() } }); return; }
        E.reset(world); M.turn = side === 'top' ? 1 : 0; M.phase = 'aim'; M.drag = null; syncHud();
    }

    // ---------------- online lifecycle ----------------
    function enterMatch(data) {
        if (M && !M.local) return;
        var g = data.game || {};
        var c = g.config || cfg();
        world = E.create(c); E.reset(world);
        var myOrder = (data.players[netUser.uid] || {}).order || 0;
        M = {
            local: false, myUid: netUser.uid, myTeam: myOrder,
            turn: g.turn || 0, score: (g.score || [0, 0]).slice(), seq: g.seq || 0,
            target: c.target || 3, fieldKey: PRESETS.field[c.field] ? c.field : 'grass', ballKey: PRESETS.ball[c.ball] ? c.ball : 'standard',
            phase: null, pending: null, simStart: 0, localGoal: false, over: false, flash: 0, forfeit: false,
        };
        M.phase = (M.turn === M.myTeam) ? 'aim' : 'wait';
        closeLobby(); hideShellOverlay(); setControlsForMatch();
        if (!shell.isPlaying()) shell.start();       // onStart no-ops online (M already set)
        syncHud();
    }
    function exitMatch() {
        detachRoom(); M = null; setControlsForMatch();
        var pb = $('players'); if (pb) pb.hidden = true;
        shell.goIdle();
    }
    function setBodies(w, state) {
        for (var i = 0; i < w.bodies.length && i * 2 + 1 < state.length; i++) { var b = w.bodies[i]; b.x = state[i * 2]; b.y = state[i * 2 + 1]; b.vx = 0; b.vy = 0; }
    }
    function onlineShoot(idx, dx, dy, power) {
        // pre-compute the authoritative outcome head-less, then broadcast shot + result in one write
        var sim = E.snapshot(world); E.applyShot(sim, idx, dx, dy, power);
        var goal = E.settle(sim), score = M.score.slice(), nextTurn, winner = null;
        if (goal) { var scorer = goal === 'top' ? 0 : 1; score[scorer]++; nextTurn = goal === 'top' ? 1 : 0; E.reset(sim); winner = score[0] >= M.target ? 0 : (score[1] >= M.target ? 1 : null); }
        else nextTurn = 1 - M.turn;
        var ejected = goal ? [] : E.ejectDeep(sim);   // mutates sim to final positions; skipped on a goal (board resets)
        var ej = ejected.map(function (m) { return { idx: m.idx, fx: Math.round(m.fromX * 10) / 10, fy: Math.round(m.fromY * 10) / 10 }; });
        var state = []; sim.bodies.forEach(function (b) { state.push(Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10); });   // FLAT [x0,y0,x1,y1,…] — Firestore rejects nested arrays
        var seq = (M.seq || 0) + 1, result = { state: state, goal: goal || null, score: score, turn: nextTurn, winner: winner, eject: ej };
        M.seq = seq; M.pending = result;
        var patch = { 'game.seq': seq, 'game.shot': { idx: idx, dx: dx, dy: dy, power: power }, 'game.result': result };
        if (winner != null) { patch['game.status'] = 'over'; patch['game.winner'] = winner; patch['status'] = 'lobby'; }
        roomWrite(patch);
        E.applyShot(world, idx, dx, dy, power); M.phase = 'sim'; M.simStart = performance.now(); M.localGoal = false; AC.audio.play('laser');
    }
    function applyPending() {
        var r = M.pending; if (!r) return;
        setBodies(world, r.state);
        M.score = r.score.slice(); M.turn = r.turn; M.pending = null; M.localGoal = false;
        if (r.goal) { M.flash = 1; AC.audio.play('gem'); }
        syncHud();
        if (r.winner != null) { onlineOver(r.winner); return; }
        M.phase = (M.turn === M.myTeam) ? 'aim' : 'wait';
    }
    function onlineOver(winner) {
        M.over = true; M.phase = 'wait';
        openLobby();   // results shown in the lobby (winner + rematch/leave), like Beam
    }

    // ---------------- shared loop ----------------
    function update() {
        if (!M) return;
        if (M.flash > 0) M.flash = Math.max(0, M.flash - 1 / 60 / 0.6);
        if (M.phase === 'eject') { stepEject(); return; }
        if (M.phase !== 'sim') return;
        var dt = E.STEP_DT;
        for (var i = 0; i < SUB; i++) { var g = E.step(world, dt); if (g) { if (M.local) { hotGoal(g); return; } M.localGoal = true; break; } }
        if (M.local) {
            if (E.atRest(world)) { E.freeze(world); var moved = E.ejectDeep(world); if (moved.length) startEject(moved); else hotEndTurn(); }
            return;
        }
        // online: when our local animation ends, run the (broadcast) ejects then apply the authoritative result
        if (M.localGoal || E.atRest(world) || performance.now() - M.simStart > SIM_MAX_MS) endOnlineSim();
    }
    function endOnlineSim() {
        var r = M.pending;
        if (r && r.eject && r.eject.length && !M.localGoal) {
            var moved = r.eject.map(function (x) { var i2 = x.idx * 2; return { idx: x.idx, fromX: x.fx, fromY: x.fy, toX: r.state[i2], toY: r.state[i2 + 1] }; });
            startEject(moved);   // stepEject() calls applyPending() when the slide-out finishes
        } else applyPending();
    }
    // animate ejected pieces from their in-net spot out to the keeper zone, then hand off (end turn / apply result)
    function startEject(moved) {
        moved.forEach(function (m) { var b = world.bodies[m.idx]; if (b) { b.x = m.fromX; b.y = m.fromY; b.vx = 0; b.vy = 0; } });
        M.eject = { list: moved, t: 0 }; M.phase = 'eject'; AC.audio.play('click');
    }
    function stepEject() {
        var e = M.eject; e.t += 1 / 60;
        var u = Math.min(1, e.t / (EJECT_MS / 1000)), k = 1 - Math.pow(1 - u, 3);   // ease-out
        e.list.forEach(function (m) { var b = world.bodies[m.idx]; if (b) { b.x = m.fromX + (m.toX - m.fromX) * k; b.y = m.fromY + (m.toY - m.fromY) * k; } });
        if (u >= 1) { e.list.forEach(function (m) { var b = world.bodies[m.idx]; if (b) { b.x = m.toX; b.y = m.toY; } }); M.eject = null; if (M.local) hotEndTurn(); else applyPending(); }
    }

    // ---------------- view (board flips 180° for team 1 so you always attack upward) ----------------
    function flipped() { return !!(M && !M.local && M.myTeam === 1); }
    function fx(x) { return flipped() ? FMX + (FW - x) : FMX + x; }
    function fy(y) { return flipped() ? FMT + (FH - y) : FMT + y; }
    function aimTeam() { if (!M || M.phase !== 'aim') return -1; return M.local ? M.turn : M.myTeam; }
    function canAim() { return aimTeam() >= 0 && (M.local || M.turn === M.myTeam); }

    function clear() { ctx.clearRect(0, 0, CW, CH); ctx.fillStyle = '#0a1628'; ctx.fillRect(0, 0, CW, CH); }
    function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function drawField() {
        var L = PRESETS.field[curFieldKey()] || PRESETS.field.grass;
        ctx.save(); roundRect(FMX, FMT, FW, FH, CORNER); ctx.fillStyle = L.turf; ctx.fill(); ctx.clip();
        for (var i = 0; i < 8; i++) { ctx.fillStyle = (i % 2) ? L.s0 : L.s1; ctx.fillRect(FMX, FMT + FH * i / 8, FW, FH / 8); }
        ctx.restore();
        ctx.strokeStyle = L.line; ctx.lineWidth = 2;
        roundRect(FMX + 4, FMT + 4, FW - 8, FH - 8, CORNER - 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(FMX, FMT + FH / 2); ctx.lineTo(FMX + FW, FMT + FH / 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(FMX + FW / 2, FMT + FH / 2, 58, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(FMX + FW / 2, FMT + FH / 2, 3, 0, Math.PI * 2); ctx.fill();
        var gx0 = world.goalX0, gx1 = world.goalX1;
        drawGoal(gx0, gx1, !flipped());   // world-top net (team 1) — screen top unless flipped
        drawGoal(gx0, gx1, flipped());
    }
    function drawGoal(gx0, gx1, screenTop) {
        var lineY = screenTop ? FMT : (FMT + FH), out = screenTop ? -1 : 1;    // outward = toward the pocket
        var worldTop = flipped() ? !screenTop : screenTop, team = worldTop ? 1 : 0;
        var x0 = flipped() ? FMX + (FW - gx1) : FMX + gx0, x1 = flipped() ? FMX + (FW - gx0) : FMX + gx1;
        var by = lineY + out * POCKET;                                         // back of the net

        // open the mouth: paint turf over the inset field-border line so field ↔ pocket read as connected
        ctx.save(); ctx.fillStyle = (PRESETS.field[curFieldKey()] || PRESETS.field.grass).turf;
        ctx.fillRect(x0, screenTop ? lineY : lineY - 8, x1 - x0, 8); ctx.restore();

        // keeper zone — faint team-tinted band INSIDE the field (where ejected players land)
        ctx.save();
        ctx.globalAlpha = 0.07; ctx.fillStyle = TEAM[team];
        ctx.fillRect(x0, screenTop ? lineY : lineY - KEEPER_ZONE, x1 - x0, KEEPER_ZONE);
        ctx.globalAlpha = 0.45; ctx.strokeStyle = TEAM[team]; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
        var ke = lineY + (-out) * KEEPER_ZONE;
        ctx.beginPath(); ctx.moveTo(x0, ke); ctx.lineTo(x1, ke); ctx.stroke();
        ctx.restore();

        // pocket recess (OUTWARD) — dark cavity + net hatch so it reads as "inside the goal"
        ctx.save();
        ctx.fillStyle = 'rgba(5,11,22,0.9)'; ctx.fillRect(x0, Math.min(lineY, by), x1 - x0, POCKET);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
        for (var nx = x0 + 7; nx < x1; nx += 9) { ctx.beginPath(); ctx.moveTo(nx, lineY); ctx.lineTo(nx, by); ctx.stroke(); }
        for (var n = 1; n < 3; n++) { var yy = lineY + out * POCKET * n / 3; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); }
        ctx.restore();

        // posts + back bar (team colour)
        ctx.save(); ctx.strokeStyle = TEAM[team]; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, lineY); ctx.lineTo(x0, by);
        ctx.moveTo(x1, lineY); ctx.lineTo(x1, by);
        ctx.moveTo(x0, by); ctx.lineTo(x1, by);
        ctx.stroke(); ctx.restore();
    }
    function ringPts(cx, cy, r, n, rot) {   // n evenly-spaced points on a circle
        var p = [], i; for (i = 0; i < n; i++) { var a = rot + i * 2 * Math.PI / n; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
        return p;
    }
    var BEACH_COLS = ['#ff5a5f', '#ffd23f', '#36c5f0', '#ffffff', '#7ee787', '#ff8ad8'];
    function drawBall(cx, cy, r, key) {
        ctx.save();
        if (key === 'beach') {                               // bright radiating panels + white hub
            var n = 6, a0 = -Math.PI / 2, i;
            for (i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0 + i * 2 * Math.PI / n, a0 + (i + 1) * 2 * Math.PI / n); ctx.closePath(); ctx.fillStyle = BEACH_COLS[i % BEACH_COLS.length]; ctx.fill(); }
            ctx.beginPath(); ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(15,23,42,0.45)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        } else if (key === 'heavy') {                        // dark metallic shot with a specular highlight
            var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.15, cx, cy, r * 1.05);
            g.addColorStop(0, '#9aa7b4'); g.addColorStop(0.5, '#5b6775'); g.addColorStop(1, '#262d36');
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
            ctx.beginPath(); ctx.arc(cx - r * 0.34, cy - r * 0.34, r * 0.22, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(8,12,20,0.8)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        } else {                                             // soccer: white panel + central black pentagon + seams
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#f3f5f8'; ctx.fill();
            var pent = ringPts(cx, cy, r * 0.44, 5, -Math.PI / 2), outer = ringPts(cx, cy, r, 5, -Math.PI / 2), j;
            ctx.fillStyle = '#19212c'; ctx.beginPath(); ctx.moveTo(pent[0][0], pent[0][1]); for (j = 1; j < 5; j++) ctx.lineTo(pent[j][0], pent[j][1]); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#19212c'; ctx.lineWidth = Math.max(1, r * 0.13); ctx.lineCap = 'round';
            ctx.beginPath(); for (j = 0; j < 5; j++) { ctx.moveTo(pent[j][0], pent[j][1]); ctx.lineTo(outer[j][0], outer[j][1]); } ctx.stroke();
            ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(15,23,42,0.5)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
    }
    function drawBodies() {
        var b = world.bodies, at = aimTeam(), ballKey = curBallKey();
        for (var i = 0; i < b.length; i++) {
            var o = b[i];
            if (o.kind === 'ball') { drawBall(fx(o.x), fy(o.y), o.r, ballKey); continue; }
            var col = TEAM[o.team], pickable = (o.team === at && (M.local || o.team === M.myTeam));
            ctx.save(); if (pickable) { ctx.shadowColor = col; ctx.shadowBlur = 14; }
            ctx.beginPath(); ctx.arc(fx(o.x), fy(o.y), o.r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.restore();
            ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.65)';
            ctx.beginPath(); ctx.arc(fx(o.x), fy(o.y), o.r, 0, Math.PI * 2); ctx.stroke();
        }
    }
    function drawAim() {
        if (!M || !M.drag) return;
        var o = world.bodies[M.drag.idx], dx = o.x - M.drag.x, dy = o.y - M.drag.y;   // fire dir = opposite the pull
        var raw = Math.hypot(dx, dy);
        if (raw < FIRE_MIN) return;                                 // too weak to fire → draw nothing (matches onUp)
        var dist = Math.min(raw, MAXPULL), u = dist / MAXPULL, nx = dx / raw, ny = dy / raw;
        var ox = fx(o.x), oy = fy(o.y);
        var ex = fx(o.x + nx * (26 + 150 * u)), ey = fy(o.y + ny * (26 + 150 * u));   // endpoint via fx/fy → flip-correct
        var sdx = ex - ox, sdy = ey - oy, sl = Math.hypot(sdx, sdy) || 1, sx = sdx / sl, sy = sdy / sl;
        var col = mix('#5eead4', '#fb7185', u);                     // teal → rose with power

        // slingshot band back to the finger (subtle)
        ctx.save();
        ctx.strokeStyle = 'rgba(226,232,240,0.22)'; ctx.lineWidth = 2; ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(fx(M.drag.x), fy(M.drag.y)); ctx.stroke();
        ctx.restore();

        // power arrow — glowing, tapered, with a clean head; length + width scale with power
        var w = 4 + 6 * u, ah = 12 + 12 * u;
        ctx.save();
        ctx.shadowColor = col; ctx.shadowBlur = 12;
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex - sx * ah * 0.7, ey - sy * ah * 0.7); ctx.stroke();
        var a = Math.atan2(sy, sx);
        ctx.beginPath(); ctx.moveTo(ex, ey);
        ctx.lineTo(ex - ah * Math.cos(a - 0.42), ey - ah * Math.sin(a - 0.42));
        ctx.lineTo(ex - ah * Math.cos(a + 0.42), ey - ah * Math.sin(a + 0.42));
        ctx.closePath(); ctx.fillStyle = col; ctx.fill();
        ctx.restore();

        // aim-origin ring on the chosen piece
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ox, oy, o.r + 3, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();

        drawCancel();
    }
    function cancelXY() {   // sit the ✕ OUT in a top/bottom MARGIN corner (off the pitch), farthest from the piece
        var lx = FMX + CANCEL_R, rx = CW - FMX - CANCEL_R, ty = FMT / 2, by = CH - FMB / 2;
        if (M && M.drag) {  // farthest corner from the dragged piece → never overlaps the slingshot pull path
            var o = world.bodies[M.drag.idx], px = fx(o.x), py = fy(o.y);
            var corners = [{ x: lx, y: ty }, { x: rx, y: ty }, { x: lx, y: by }, { x: rx, y: by }];
            var best = corners[0], bd = -1;
            for (var i = 0; i < corners.length; i++) { var d = Math.hypot(corners[i].x - px, corners[i].y - py); if (d > bd) { bd = d; best = corners[i]; } }
            return best;
        }
        return { x: rx, y: ty };
    }
    function drawCancel() {
        var c = cancelXY(), hot = !!(M && M.drag && M.drag.overCancel);   // lit while the finger/cursor is over it
        var r = CANCEL_R + (hot ? 4 : 0), k = r * 0.42;
        ctx.save();
        if (hot) { ctx.shadowColor = '#f87171'; ctx.shadowBlur = 14; }
        ctx.fillStyle = hot ? 'rgba(244,63,94,0.92)' : 'rgba(15,23,42,0.85)'; ctx.strokeStyle = '#f87171'; ctx.lineWidth = hot ? 3 : 2;
        ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = hot ? '#fff' : '#f87171'; ctx.lineWidth = hot ? 3 : 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(c.x - k, c.y - k); ctx.lineTo(c.x + k, c.y + k); ctx.moveTo(c.x + k, c.y - k); ctx.lineTo(c.x - k, c.y + k); ctx.stroke();
        ctx.restore();
    }
    function capFont(px) { return '800 ' + px + 'px ' + (getComputedStyle(document.body).getPropertyValue('--font-display') || 'sans-serif'); }
    // turn caption: sits in the margin on `team`'s own end, tucked to a side (clear of the centred pocket), and
    // flipped 180° when that end is the screen-top so it reads for a player seated on that side (hot-seat).
    function sideCaption(text, color, team) {
        var isTop = fy(team === 0 ? FH : 0) < FMT + FH / 2;
        var cy = isTop ? FMT / 2 : CH - FMB / 2;            // centred in the margin, level with the pocket
        var cx = isTop ? CW * 0.74 : CW * 0.26;             // tucked to a side, clear of the centred pocket
        ctx.save();
        ctx.fillStyle = color || 'rgba(226,232,240,0.95)'; ctx.font = capFont(18);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.translate(cx, cy); if (isTop) ctx.rotate(Math.PI);
        ctx.fillText(text, 0, 0); ctx.restore();
    }
    function goalCaption(text, color) {
        ctx.save(); ctx.fillStyle = color; ctx.font = capFont(30);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, CW / 2, FMT + FH / 2); ctx.restore();
    }
    function render() {
        if (!ctx || !world) return;
        clear(); drawField(); if (M) { drawBodies(); drawAim(); }
        if (!M) return;
        if (M.flash > 0) { ctx.save(); ctx.globalAlpha = M.flash * 0.5; ctx.fillStyle = '#fde68a'; ctx.fillRect(0, 0, CW, CH); ctx.restore(); goalCaption(t('caromGoal'), '#fde68a'); return; }
        if (M.local) { if (M.phase === 'aim') sideCaption(t('caromAim', t('caromTeam' + M.turn)), TEAM[M.turn], M.turn); }
        else if (M.phase === 'aim') sideCaption(t('caromYourTurn'), TEAM[M.myTeam], M.myTeam);
        else if (M.phase === 'wait') sideCaption(t('caromOppTurn'), '#94a3b8', 1 - M.myTeam);
    }
    function mix(a, b, u) {
        function h(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
        var A = h(a), B = h(b); u = AC.math.clamp(u, 0, 1);
        return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * u) + ',' + Math.round(A[1] + (B[1] - A[1]) * u) + ',' + Math.round(A[2] + (B[2] - A[2]) * u) + ')';
    }

    // ---------------- input ----------------
    function evToField(e) {
        var r = canvas.getBoundingClientRect();
        var x = (e.clientX - r.left) * (CW / r.width) - FMX, y = (e.clientY - r.top) * (CH / r.height) - FMT;
        if (flipped()) { x = FW - x; y = FH - y; }
        return { x: x, y: y };
    }
    function hitPlayer(p) {
        var b = world.bodies, best = -1, bd = 1e9, at = aimTeam();
        for (var i = 0; i < b.length; i++) { var o = b[i]; if (o.kind !== 'player' || o.team !== at) continue; var d = Math.hypot(o.x - p.x, o.y - p.y); if (d < o.r + 10 && d < bd) { bd = d; best = i; } }
        return best;
    }
    function inCancel(e) {
        var r = canvas.getBoundingClientRect(), c = cancelXY();
        return Math.hypot((e.clientX - r.left) * (CW / r.width) - c.x, (e.clientY - r.top) * (CH / r.height) - c.y) <= CANCEL_R + 4;
    }
    function onDown(e) {
        if (!shell.isPlaying() || !canAim()) return;
        var p = evToField(e), idx = hitPlayer(p); if (idx < 0) return;
        AC.audio.unlock(); M.drag = { idx: idx, x: p.x, y: p.y }; e.preventDefault();
    }
    function onMove(e) { if (!M || !M.drag) return; var p = evToField(e); M.drag.x = p.x; M.drag.y = p.y; M.drag.overCancel = inCancel(e); e.preventDefault(); }
    function onUp(e) {
        if (!M || !M.drag) return;
        if (inCancel(e)) { M.drag = null; AC.audio.play('click'); e.preventDefault(); return; }
        var o = world.bodies[M.drag.idx], dx = o.x - M.drag.x, dy = o.y - M.drag.y, dist = Math.hypot(dx, dy), idx = M.drag.idx;
        M.drag = null;
        if (dist < FIRE_MIN) return;
        var power = Math.min(dist, MAXPULL) / MAXPULL * MAXSPEED;
        if (M.local) { E.applyShot(world, idx, dx, dy, power); AC.audio.play('laser'); M.phase = 'sim'; }
        else onlineShoot(idx, dx, dy, power);
        e.preventDefault();
    }
    function cancelDrag() { if (M && M.drag) { M.drag = null; AC.audio.play('click'); } }

    // ---------------- HUD ----------------
    function syncHud() {
        var s = $('score'), tn = $('turn');
        if (!M) { if (s) s.textContent = '0 : 0'; if (tn) { tn.textContent = '—'; tn.style.color = ''; } return; }
        if (M.local) { if (s) s.textContent = M.score[0] + ' : ' + M.score[1]; if (tn) { tn.textContent = t('caromTeam' + M.turn); tn.style.color = TEAM[M.turn]; } }
        else {
            if (s) s.textContent = M.score[M.myTeam] + ' : ' + M.score[1 - M.myTeam];
            if (tn) { var mine = M.turn === M.myTeam; tn.textContent = mine ? t('caromYourTurn') : t('caromOppTurn'); tn.style.color = mine ? TEAM[M.myTeam] : '#94a3b8'; }
        }
    }

    // ===============================================================
    // lobby + net (room code; modelled on Beam, 2 players)
    // ===============================================================
    var net = null, netUser = undefined, room = null, lobbyEl = null, lobbyRefs = null;
    var pres = {}, beatN = 0, beatT = 0, gcT = 0;
    function updatePres(g) { var beats = (g && g.beat) || {}, now = Date.now(); for (var uid in beats) { var p = pres[uid]; if (!p) pres[uid] = { v: beats[uid], at: now }; else if (p.v !== beats[uid]) { p.v = beats[uid]; p.at = now; } } }
    function isStale(uid) { if (!M || M.local) return false; var p = pres[uid]; return !!p && (Date.now() - p.at) > STALL_MS; }
    function elc(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function lbtn(label, cls) { var b = elc('button', cls || 'btn', label); b.type = 'button'; return b; }
    function lrow() { var r = elc('div', 'lobby-row'); for (var i = 0; i < arguments.length; i++) if (arguments[i]) r.appendChild(arguments[i]); return r; }
    function roomWrite(patch) { return net.mp.update(GROUP, room.code, patch).catch(function () { }); }
    function hideShellOverlay() { var o = $('overlay'); if (o) o.hidden = true; }
    function pname(uid, players) { var p = players && players[uid]; return (p && p.name) || t('caromGuest'); }
    function effectiveHost(d) {
        var players = d.players || {}; if (d.hostUid && players[d.hostUid] && !isStale(d.hostUid)) return d.hostUid;
        var order = d.order || Object.keys(players);
        for (var i = 0; i < order.length; i++) if (players[order[i]] && !isStale(order[i])) return order[i];
        for (var j = 0; j < order.length; j++) if (players[order[j]]) return order[j];
        return null;
    }
    function buildLobby() {
        var wrap = document.querySelector('.stage-wrap') || document.body;
        var ov = elc('div', 'overlay'); ov.id = 'lobby'; ov.hidden = true;
        ov.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        var card = elc('div', 'overlay-card'), title = elc('h2', 'overlay-title'), auth = elc('div', 'lobby-auth'), roomBox = elc('div', 'lobby-room'), status = elc('p', 'lobby-status'), close = lbtn('', 'btn');
        close.addEventListener('click', closeLobby);
        card.append(title, auth, roomBox, status, close); ov.appendChild(card); wrap.appendChild(ov);
        lobbyEl = ov; lobbyRefs = { title: title, auth: auth, room: roomBox, status: status, close: close };
    }
    function openLobby() {
        if (!net || !net.ok) return;
        if (setEl) setEl.hidden = true;
        if (!lobbyEl) buildLobby(); lobbyEl.hidden = false; hideShellOverlay(); renderLobby(); if (net.mp.cleanup) net.mp.cleanup(GROUP).catch(function () { });
    }
    function closeLobby() {
        if (lobbyEl) lobbyEl.hidden = true;
        if (M && M.over && !M.local) { doLeave(); return; }
        if (!M) shell.refreshOverlay();
    }
    function detachRoom() { if (room && room.unsub) { try { room.unsub(); } catch (e) { } } room = null; pres = {}; }
    function attachRoom(code) { detachRoom(); pres = {}; beatT = 0; room = { code: code, data: null, unsub: null }; room.unsub = net.mp.watch(GROUP, code, onRoom); renderLobby(); }
    function showLobbyError(e) {
        var m = String((e && e.message) || e), msg = t('caromNetErr');
        if (m.indexOf('not found') !== -1) msg = t('caromRoomNotFound');
        else if (m.indexOf('full') !== -1) msg = t('caromRoomFull');
        else if (m.indexOf('already') !== -1) msg = t('caromAlreadyStarted');
        if (lobbyRefs) lobbyRefs.status.textContent = msg; console.warn('[carom lobby]', e);
    }
    function doSignIn(kind) { (kind === 'google' ? net.signInGoogle() : net.signInGuest()).catch(showLobbyError); }
    function doCreate() { net.mp.create(GROUP, { maxPlayers: MAX_PLAYERS }).then(function (code) { attachRoom(code); roomWrite({ settings: Object.assign({}, SETTINGS) }); }).catch(showLobbyError); }
    function doJoin(code) { code = String(code || '').trim().toUpperCase(); if (!code) return; net.mp.join(GROUP, code).then(attachRoom).catch(showLobbyError); }
    function doLeave() { var wasMatch = !!(M && !M.local); if (room) { var c = room.code; detachRoom(); net.mp.leave(GROUP, c).catch(function () { }); } if (wasMatch) exitMatch(); renderLobby(); }
    function doReady() { if (!room || !netUser) return; net.mp.update(GROUP, room.code, { ['ready.' + netUser.uid]: true }).catch(showLobbyError); }
    function hostStart() {
        if (!room || !room.data || !netUser) return;
        var d = room.data; if (effectiveHost(d) !== netUser.uid) return;
        var order = (d.order || Object.keys(d.players || {})).filter(function (u) { return (d.players || {})[u] && !isStale(u); });
        if (order.length < 2) return;
        var hostUid = effectiveHost(d), ready = d.ready || {};
        if (!order.every(function (u) { return u === hostUid || ready[u]; })) return;
        net.mp.update(GROUP, room.code, { status: 'playing', game: { status: 'playing', config: cfg(), score: [0, 0], turn: Math.random() < 0.5 ? 0 : 1, seq: 0, shot: null, result: null, winner: null, beat: {} }, ready: {} }).catch(showLobbyError);
    }
    function doRematch() { if (!room || !room.data || !netUser) return; if (effectiveHost(room.data) !== netUser.uid) return; net.mp.update(GROUP, room.code, { status: 'lobby', game: {}, ready: {} }).catch(showLobbyError); }
    function copyCode(code) { try { var p = navigator.clipboard && navigator.clipboard.writeText(code); if (p && p.catch) p.catch(function () { }); } catch (e) { } if (lobbyRefs) lobbyRefs.status.textContent = t('caromCopied'); }

    function renderLobby() {
        if (!lobbyEl) return;
        var _pi = lobbyEl.querySelector('.lobby-room input'), _pv = _pi ? _pi.value : null, _pf = !!(_pi && document.activeElement === _pi), _ps = _pf ? _pi.selectionStart : 0, _pe = _pf ? _pi.selectionEnd : 0;
        var d = room && room.data, g = (d && d.game) || {}, u = netUser, over = g.status === 'over';
        lobbyRefs.title.textContent = over ? t('caromResultsTitle') : t('caromLobbyTitle');
        lobbyRefs.close.textContent = t('caromClose');
        var auth = lobbyRefs.auth; auth.innerHTML = '';
        if (!u) { var gg = lbtn(t('caromSignInGoogle'), 'btn btn-primary'); gg.onclick = function () { doSignIn('google'); }; var ag = lbtn(t('caromSignInGuest'), 'btn'); ag.onclick = function () { doSignIn('guest'); }; auth.appendChild(lrow(gg, ag)); }
        else { var info = elc('span', null, t('caromSignedIn', u.name || t('caromGuest'))); var out = lbtn(t('caromSignOut'), 'btn'); out.onclick = function () { doLeave(); net.signOut(); }; auth.appendChild(lrow(info, out)); }
        var rbox = lobbyRefs.room; rbox.innerHTML = '';
        if (u && !d) {
            var create = lbtn(t('caromCreateRoom'), 'btn btn-primary'); create.onclick = doCreate;
            var input = elc('input'); input.placeholder = t('caromRoomCode'); input.maxLength = 4;
            var join = lbtn(t('caromJoinRoom'), 'btn'); join.onclick = function () { doJoin(input.value); };
            input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doJoin(input.value); });
            rbox.appendChild(lrow(create)); rbox.appendChild(lrow(input, join));
        } else if (u && d) {
            rbox.appendChild(elc('div', 'lobby-code', d.code));
            var ul = elc('ul', 'lobby-plist'), order = d.order || Object.keys(d.players || {}), ready = d.ready || {}, host = effectiveHost(d);
            var scoreOf = function (uid) { var o = (d.players[uid] || {}).order || 0; return (g.score || [0, 0])[o]; };
            order.forEach(function (uid) {
                if (!d.players[uid]) return;
                var li = elc('li'), left = elc('span'), dot2 = elc('span', null, '\u25cf '); dot2.style.color = TEAM[(d.players[uid].order || 0) % 2]; left.appendChild(dot2);
                left.appendChild(document.createTextNode(pname(uid, d.players) + (uid === u.uid ? ' (' + t('caromYou') + ')' : ''))); li.appendChild(left);
                var right = elc('span');
                if (over) { right.appendChild(elc('span', 'rank', String(scoreOf(uid)))); }
                else { if (uid === host) right.appendChild(elc('span', 'tag', t('caromHost'))); if (isStale(uid)) { li.style.opacity = '0.5'; right.appendChild(elc('span', null, ' \u26a0')); } else if (ready[uid]) right.appendChild(elc('span', 'ok', ' ✓ ' + t('caromReadyTag'))); }
                li.appendChild(right); ul.appendChild(li);
            });
            rbox.appendChild(ul);
            if (over) {
                if (host === u.uid) { var rem = lbtn(t('caromRematch'), 'btn btn-primary'); rem.onclick = doRematch; rbox.appendChild(lrow(rem)); }
                var lvo = lbtn(t('caromLeaveRoom'), 'btn'); lvo.onclick = doLeave; rbox.appendChild(lrow(lvo));
            } else {
                var iAmHost = host === u.uid, present = order.filter(function (x) { return d.players[x] && !isStale(x); });
                var setBox = elc('div', 'lobby-set'), curS = iAmHost ? SETTINGS : sanitizeSettings(d.settings);
                if (!iAmHost) setBox.appendChild(elc('p', 'lobby-set-note', t('caromSetByHost')));
                renderGroups(setBox, curS, iAmHost ? pickHost : null); rbox.appendChild(setBox);
                var copy = lbtn(t('caromCopyCode'), 'btn'); copy.onclick = function () { copyCode(d.code); };
                var primary;
                if (iAmHost) { var guests = present.filter(function (x) { return x !== u.uid; }); var canStart = present.length >= 2 && guests.every(function (x) { return ready[x]; }); primary = lbtn(t('caromStartMatch'), 'btn btn-primary'); primary.disabled = !canStart; primary.onclick = hostStart; }
                else if (ready[u.uid]) primary = elc('span', null, t('caromReadyWait'));
                else { primary = lbtn(t('caromReadyUp'), 'btn btn-primary'); primary.onclick = doReady; }
                rbox.appendChild(lrow(copy, primary));
                var lv = lbtn(t('caromLeaveRoom'), 'btn'); lv.onclick = doLeave; rbox.appendChild(lrow(lv));
            }
        }
        var s = '';
        if (!u) s = t('caromSignInFirst');
        else if (over && g.endReason === 'left' && g.winner != null && (d.players[u.uid] || {}).order === g.winner) s = t('caromEndLeft');
        else if (over && g.winner != null) s = t('caromWinner', t('caromTeam' + g.winner));
        else if (d) { var present2 = (d.order || []).filter(function (x) { return d.players[x]; }); s = present2.length < 2 ? t('caromNeedTwo') : t('caromHostStarts'); }
        lobbyRefs.status.textContent = s;
        if (_pv != null) { var _ni = lobbyRefs.room.querySelector('input'); if (_ni) { _ni.value = _pv; if (_pf) { _ni.focus(); try { _ni.setSelectionRange(_ps, _pe); } catch (e) { } } } }
    }

    function onRoom(data, err) {
        if (!room) return;                             // stale listener after detach
        if (err) { showLobbyError(err); return; }
        if (!data) { if (M && !M.local) { if (AC.toast) AC.toast.show(t('caromRoomGone')); exitMatch(); } if (room) room.data = null; renderLobby(); return; }
        room.data = data; var g = data.game || {};
        updatePres(g);
        if (!M) { if (g.status === 'playing') enterMatch(data); else renderLobby(); return; }
        // a new shot (shot + authoritative result arrive together) — animate it, even if it ends the match
        if (g.seq > M.seq && g.shot && g.result && !M.over) {
            M.seq = g.seq; M.pending = g.result;
            E.applyShot(world, g.shot.idx, g.shot.dx, g.shot.dy, g.shot.power);
            M.phase = 'sim'; M.simStart = performance.now(); M.localGoal = false;
            return;   // applyPending (at sim end) applies score/turn and, if result.winner, opens the results
        }
        if (g.status === 'over') {                      // forfeit / decided with no new shot to animate
            if (!M.over && !M.pending) { M.over = true; if (g.winner != null) M.score = (g.score || M.score).slice(); openLobby(); if (g.endReason === 'left' && AC.toast) AC.toast.show(t('caromEndLeft')); }
            renderLobby(); return;
        }
        if (g.status !== 'playing') {                   // room reset to the lobby (rematch) — stay in the room
            M = null; var pb = $('players'); if (pb) pb.hidden = true; setControlsForMatch();
            if (shell.isPlaying()) shell.goIdle();
            openLobby(); renderLobby(); return;
        }
        if (lobbyEl && !lobbyEl.hidden) renderLobby();
    }

    // presence beats + opponent-left walkover
    function watchdog() {
        setControlsForMatch();          // keep the Online button's enabled state correct on every screen (avoids the goIdle stale-state race)
        if (!net || !room || !room.data || !netUser || !M || M.local) return;
        var d = room.data, g = d.game || {}, now = Date.now();
        if (!beatT || now - beatT > BEAT_MS) { beatT = now; beatN++; net.mp.update(GROUP, room.code, { ['game.beat.' + netUser.uid]: beatN }).catch(function () { }); }
        if (effectiveHost(d) === netUser.uid && (!gcT || now - gcT > 15000)) { gcT = now; net.mp.cleanup(GROUP).catch(function () { }); }
        if (g.status === 'playing' && !M.over && !M.forfeit) {
            var order = d.order || Object.keys(d.players || {});
            var opp = order.filter(function (u) { return u !== netUser.uid; })[0];
            if (opp && (!d.players[opp] || isStale(opp))) {            // opponent gone → walkover to me
                M.forfeit = true; var myTeam = (d.players[netUser.uid] || {}).order || 0;
                net.mp.update(GROUP, room.code, { 'game.status': 'over', 'game.winner': myTeam, 'game.endReason': 'left', 'status': 'lobby' }).catch(function () { });
            }
        }
    }

    // ===============================================================
    // pre-match settings (named presets) — standalone panel + shared segmented rows
    // ===============================================================
    var setEl = null, setRefs = null;
    function fieldOpts() { return FIELD_KEYS.map(function (k) { return { val: k, label: t('caromField_' + k) }; }); }
    function ballOpts() { return BALL_KEYS.map(function (k) { return { val: k, label: t('caromBall_' + k) }; }); }
    function targetOpts() { return TARGET_OPTS.map(function (n) { return { val: n, label: String(n) }; }); }
    function goalOpts() {   // values come from GOAL_OPTS; a 3-entry list reads narrow/standard/wide, else just the number
        var labels = GOAL_OPTS.length === 3 ? [t('caromGoalNarrow'), t('caromGoalStd'), t('caromGoalWide')] : null;
        return GOAL_OPTS.map(function (n, i) { return { val: n, label: labels ? labels[i] : String(n) }; });
    }
    function segRow(labelKey, opts, cur, onPick) {
        var row = elc('div', 'set-row'); row.appendChild(elc('span', 'set-label', t(labelKey)));
        var seg = elc('div', 'set-seg');
        opts.forEach(function (o) {
            var b = elc('button', 'set-opt' + (o.val === cur ? ' on' : ''), o.label); b.type = 'button';
            if (onPick) b.onclick = function () { onPick(o.val); }; else b.disabled = true;
            seg.appendChild(b);
        });
        row.appendChild(seg); return row;
    }
    // mini-pitch thumbnail from the PLAYER'S OWN view: own goal gap at the BOTTOM, players rising toward midfield
    function drawFormationThumb(cv, key) {
        var c = cv.getContext('2d'), W = cv.width, H = cv.height, f = PRESETS.formation[key]; if (!f) return;
        c.clearRect(0, 0, W, H);
        c.fillStyle = '#123a2a'; c.fillRect(0, 0, W, H);
        var lw = Math.max(2, W * 0.03); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = lw;   // own goal at bottom
        c.beginPath(); c.moveTo(W * 0.37, H - lw / 2); c.lineTo(W * 0.63, H - lw / 2); c.stroke();
        c.fillStyle = '#e2e8f0';
        f.slots.forEach(function (s) {
            var x = (0.08 + s.x * 0.84) * W, y = H - (0.12 + (s.y / 0.5) * 0.8) * H;
            c.beginPath(); c.arc(x, y, W * 0.07, 0, Math.PI * 2); c.fill();
        });
    }
    function fmKeysOfCount(n) { return FORMATION_KEYS.filter(function (k) { return PRESETS.formation[k].players === n; }); }
    function countOfFm(key) { var f = PRESETS.formation[key]; return f ? f.players : 5; }
    function formationPicker(cur, pick) {
        var editable = !!pick, curCount = countOfFm(cur), wrap = elc('div', 'set-row set-formrow');
        wrap.appendChild(elc('span', 'set-label', t('caromFormationLabel')));
        var tabs = elc('div', 'fm-tabs');                 // player-count tabs → keeps each view to 2–3 shapes
        FM_COUNTS.forEach(function (n) {
            var b = elc('button', 'fm-tab' + (n === curCount ? ' on' : ''), String(n)); b.type = 'button';
            if (editable) b.onclick = function () { if (n !== curCount) pick('formation', fmKeysOfCount(n)[0]); }; else b.disabled = true;
            tabs.appendChild(b);
        });
        wrap.appendChild(tabs);
        var grid = elc('div', 'fm-grid');                 // thumbnails for the active count only
        fmKeysOfCount(curCount).forEach(function (k) {
            var cell = elc('button', 'fm-cell' + (k === cur ? ' on' : '')); cell.type = 'button';
            var cv = document.createElement('canvas'); cv.className = 'fm-thumb';
            cv.width = 108; cv.height = 92; cv.style.width = '54px'; cv.style.height = '46px';
            drawFormationThumb(cv, k); cell.appendChild(cv);
            cell.appendChild(elc('span', 'fm-name', t('caromFm_' + k)));
            if (editable) cell.onclick = function () { pick('formation', k); }; else cell.disabled = true;
            grid.appendChild(cell);
        });
        wrap.appendChild(grid); return wrap;
    }
    function renderGroups(box, cur, pick) {   // pick==null → read-only
        box.appendChild(segRow('caromFieldLabel', fieldOpts(), cur.field, pick && function (v) { pick('field', v); }));
        box.appendChild(segRow('caromBallLabel', ballOpts(), cur.ball, pick && function (v) { pick('ball', v); }));
        box.appendChild(formationPicker(cur.formation, pick));
        box.appendChild(segRow('caromTargetLabel', targetOpts(), cur.target, pick && function (v) { pick('target', v); }));
        box.appendChild(segRow('caromGoalLabel', goalOpts(), cur.goalW, pick && function (v) { pick('goalW', v); }));
    }
    function buildSettings() {
        var wrap = document.querySelector('.stage-wrap') || document.body;
        var ov = elc('div', 'overlay'); ov.id = 'carom-set'; ov.hidden = true;
        ov.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        var card = elc('div', 'overlay-card'), title = elc('h2', 'overlay-title'), body = elc('div', 'set-body'), done = lbtn('', 'btn btn-primary');
        done.onclick = closeSettings;
        card.append(title, body, done); ov.appendChild(card); wrap.appendChild(ov);
        setEl = ov; setRefs = { title: title, body: body, done: done };
    }
    function openSettings() {
        if (shell && shell.isPlaying()) return;
        if (room && room.data) { openLobby(); return; }       // online: settings live inside the lobby card
        if (!setEl) buildSettings();
        if (lobbyEl) lobbyEl.hidden = true;
        setEl.hidden = false; hideShellOverlay(); renderSettings();
    }
    function closeSettings() { if (setEl) setEl.hidden = true; if (!M) shell.refreshOverlay(); }
    function pickLocal(key, val) {
        SETTINGS[key] = val; saveSettings();
        if (!M) world = E.create(cfg());    // live preview on the ready screen (panel only opens when idle)
        renderSettings(); render();
    }
    function pickHost(key, val) {           // host editing in the lobby → update + broadcast
        SETTINGS[key] = val; saveSettings();
        roomWrite({ ['settings.' + key]: val }); renderLobby();
    }
    function renderSettings() {
        if (!setEl) return;
        setRefs.title.textContent = t('caromSettingsTitle');
        setRefs.done.textContent = t('caromSettingsDone');
        var b = setRefs.body; b.innerHTML = ''; renderGroups(b, SETTINGS, pickLocal);
    }

    // ===============================================================
    // controls (Online button) + shell + boot
    // ===============================================================
    function setControlsForMatch() {
        var playing = !!(shell && shell.isPlaying());
        var ob = $('online-btn'); if (ob) ob.disabled = playing;       // lobby only reachable when not mid-match
        var sb = $('settings-btn'); if (sb) sb.disabled = playing;      // settings deferred: edit before Start
    }
    function updateOnlineBtn() { var b = $('online-btn'); if (b) b.hidden = !(net && net.ok); }
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
        window.addEventListener('beforeunload', function () { if (room && room.code && net && M && !M.local) { try { net.mp.leave(GROUP, room.code); } catch (e) { } } });
    }
    function toReady() {                 // reset() target: back to the hot-seat ready screen
        if (M && !M.local && !M.over && room && room.data) return;   // protect only a LIVE online match; a stale one may be cleared
        M = null; world = E.create(cfg());
        var pb = $('players'); if (pb) pb.hidden = true;
        setControlsForMatch(); syncHud();
    }
    function boot() {
        canvas = $('stage'); canvas.width = CW * DPR; canvas.height = CH * DPR;
        ctx = canvas.getContext('2d'); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        canvas.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); cancelDrag(); });
        window.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (setEl && !setEl.hidden) { closeSettings(); return; } cancelDrag(); } });
        var sbtn = $('settings-btn'); if (sbtn) sbtn.addEventListener('click', openSettings);

        shell = AC.shell.create({
            gameId: 'carom', step: 1 / 60,
            update: update, render: render,
            restartToReady: true, reset: toReady,
            onStart: function () { if (M && !M.local && !M.over && room && room.data) return; startHotSeat(); },
            canPause: function () { return false; },
            canRestart: function () { return !(M && !M.local); },
            onGameOver: function () { setControlsForMatch(); },
            overlayContent: function (state, result) {
                if (state === 'idle') return { badge: 'soccer', title: t('caromName'), message: t('caromReady'), button: t('start') };
                if (state === 'over') { var m = (result && result.meta) || {}, w = m.winner || 0, sc = m.score || [0, 0]; return { badge: 'trophy', title: t('caromWin', t('caromTeam' + w)), message: t('caromScore') + '  ' + sc[0] + ' : ' + sc[1], button: t('restart') }; }
                return {};
            },
        });
        setupOnline();
        AC.i18n.subscribe(function () { syncHud(); if (!M) shell.refreshOverlay(); if (room && lobbyEl && !lobbyEl.hidden) renderLobby(); if (setEl && !setEl.hidden) renderSettings(); });
        world = E.create(cfg()); syncHud(); render();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
