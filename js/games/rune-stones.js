/**
 * Rune Stones — an orb-spinning game with two modes: a solo "Sandbag" damage run,
 * or a two-phase versus match (vs a real-spinning AI, or online PvP by room code).
 *
 * A bounded clash: you and a rival each hold an HP pool; it's a turn-based race to
 * zero. Each ROUND has a DEFENSE phase (play shield cards the rival's spin must
 * satisfy) and an ATTACK phase (play cards, then drag a rune on your 6×5 board to
 * clear 3+ of a colour, chain COMBOS and damage the rival). Meet every shield the
 * rival raised or your hit is blocked. HEART runes heal; clearing 5+ of a colour
 * drops an ENHANCED rune (×1.5) in the next batch. Both sides act each round.
 *
 * Built on window.ArcadeCommon. Canvas 2D at 600×760. Online sync via Firestore.
 */
(function () {
    'use strict';

    const AC = window.ArcadeCommon;
    const PI2 = Math.PI * 2;
    const t = (k, ...a) => AC.i18n.t(k, ...a);

    // =================================================================
    // i18n
    // =================================================================

    Object.assign(AC.i18n.STRINGS.en, {
        rdRound: 'Round', rdHp: 'HP', rdReady: 'Ready', rdRival: 'Rival',
        rdPlay: 'Play',
        rdIntro: 'A turn-based orb duel. Each round you raise shields in Defense, then play cards and spin in Attack — clear 3+ of a colour to hit the rival while meeting their shields. First to 0 HP loses.',
        rdStartHintHtml: 'Draw & play cards, then drag a rune to spin · <kbd>P</kbd> pause',
        rdHelp1Html: 'Each round has two phases, and <strong>each refills your energy</strong>. In <strong>Defense</strong>, <strong>draw</strong> and play <strong>shield</strong> cards the rival\u2019s spin must satisfy to hit you; press <strong>To attack</strong> when done.',
        rdHelp2Html: 'In <strong>Attack</strong> you can <strong>draw and play cards too</strong> (recolour, enhance, <strong>break shields</strong>, time), then <strong>drag a rune</strong> to line up <strong>3+ of a colour</strong>. Meet all the rival\u2019s shields or your hit is <strong>blocked</strong>. <strong>Heart</strong> heals; clearing <strong>5+</strong> of a colour drops an <strong>enhanced</strong> rune next.',
        rdHelp3Html: '<strong>Draw</strong> pulls one more card for 1 energy <strong>from the current phase\u2019s pool</strong> (shields in Defense, attack cards in Attack). Reduce the rival to <strong>0 HP</strong> to win; at the round cap, higher HP wins. <kbd>P</kbd> pause · <kbd>R</kbd> restart · <kbd>M</kbd> mute.',
        rdWin: 'Victory!', rdLose: 'Defeated',
        rdOverWinHtml: (round) => `Won in <strong>${round}</strong> round(s).`,
        rdOverLoseHtml: (round) => `Fell on round <strong>${round}</strong>.`,
        rdOverHint: 'Press R or the button to duel again.',
        rdDefense: 'Defense — play shields', rdAttack: 'Attack — cards & spin', rdDone: 'To attack \u2192', rdDraw: 'Draw', rdTimeUp: 'Time up!', rdSpinNow: 'Time\u2019s up — spin now!',
        rdPhaseDef: 'DEFENSE', rdPhaseAtk: 'ATTACK',
        rdOppSpin: 'spinning\u2026', rdOppDone: 'attacked', rdCopyCode: 'Copy', rdCopied: 'Copied!',
        rdDrawGame: 'Draw!', rtShBanPick: 'Pick a colour to forbid', rtPickShield: 'Pick a shield to break',
        cwBan: (e) => `Clearing ${e} blocks the attack`, cwNeed: (e) => `Must clear ${e} to deal damage`, cwNeedEnh: (e) => `Must clear an enhanced ${e}`,
        cwBanRand: 'A random colour — clearing it blocks you', cwBanPick: 'A chosen colour — clearing it blocks you', cwNeedRand: 'A random colour you must clear', cwNeedPick: 'A chosen colour you must clear',
        cwNeedEnhAny: 'Must clear an enhanced rune', cwNeedEnhRand: 'A random colour — must clear its enhanced', cwNeedEnhPick: 'A chosen colour — must clear its enhanced',
        cwComboMin: (n) => `Needs ${n}+ combos to deal damage`, cwComboMax: (n) => `Combos must stay \u2264 ${n}`, cwFirstMin: (n) => `First wave \u2265 ${n} combos`, cwFirstMax: (n) => `First wave \u2264 ${n} combos`,
        cwSlow: 'Shorten the rival\u2019s spin time (stacks)', cwFast: 'Extend your own spin time (stacks)',
        cwTrans: (a, b) => `Turn every ${a} rune into ${b}`, cwTransToPick: (a) => `Turn every ${a} rune into a chosen colour`, cwTransFromPick: (b) => `Turn a chosen colour into ${b}`, cwTransBoth: 'Turn one colour into another',
        cwEnchEl: (e) => `Enhance 3 ${e} runes`, cwEnchRand: 'Enhance 3 random runes', cwEnchPick: 'Enhance 3 runes of a chosen colour',
        cwBreakRand: 'Break a random rival shield / shorten', cwBreakPick: 'Break a chosen rival shield / shorten',
        rdOnline: 'Online duel', rdOnlineBtn: 'Online', rdClose: 'Close',
        rdSignInGoogle: 'Sign in with Google', rdSignInGuest: 'Play as guest', rdSignOut: 'Sign out', rdGuest: 'Guest',
        rdSignedIn: (name) => `Signed in: ${name}`, rdSignInFirst: 'Sign in to create or join a room.',
        rdCreateRoom: 'Create room', rdJoinRoom: 'Join', rdRoomCode: 'Code', rdLeaveRoom: 'Leave room',
        rdRoomCreated: (code) => `Room ${code} — waiting for opponent\u2026`, rdWaitingOpp: 'Waiting for opponent\u2026',
        rdMatched: (name) => `Matched with ${name}!`,
        rdReadyUp: 'I\u2019m ready to start', rdReadyWait: 'Ready \u2014 waiting for opponent\u2026', rdOppReady: 'opponent ready',
        rdLvEasy: 'Easy', rdLvNormal: 'Normal', rdLvHard: 'Hard', rdTimeShort: 'Time shorten',
        rdReasonForfeit: 'Opponent left or timed out \u2014 you win.',
        rdReasonKoWin: 'Rival HP hit 0 \u2014 you win.', rdReasonKoLose: 'Your HP hit 0 \u2014 you lose.', rdReasonDoubleKo: 'Both HP hit 0 \u2014 draw.',
        rdReasonHpWin: 'Round limit reached \u2014 more HP, you win.', rdReasonHpLose: 'Round limit reached \u2014 less HP, you lose.', rdReasonTimeDraw: 'Round limit reached, equal HP \u2014 draw.',
        rdRoomNotFound: 'Room not found', rdRoomFull: 'Room is full', rdNetErr: 'Network error',
        rdDiscard: 'Discard', rdOppBoard: 'Rival\u2019s board', rdYouWin: 'You win!', rdYouLose: 'You lose',
        rdTapPlay: 'tap to play',
        rtBlocked: 'Blocked!', rtCombo: (n) => `${n} Combo`,
        rtPopupHint: 'Tap outside to cancel',
        rtTransmuteFrom: 'Tap a colour to change', rtTransmuteTo: 'Tap the target colour',
        el_fire: 'Fire', el_water: 'Water', el_wood: 'Wood', el_light: 'Light', el_dark: 'Dark', el_heart: 'Heart',
        el_yao: 'Spirit', el_steel: 'Steel',
        rdModeDuel: 'Versus', rdModeSandbox: 'Sandbag',
        rdColBestRounds: 'Fewest', rdColBestSpin: 'Best hit', rdColDamage: 'Damage', rdColBestTotal: 'Best total',
        rdSandDone: 'Run complete!',
        rdSandIntro: 'Spin for 30 rounds against 3 elemental enemies and chase the highest total (and single-spin) damage. Draft 3 power-ups at the start, then one every 5 rounds.',
        rdSandStartHint: 'Drag a rune to spin · P pause',
        rdSandRunBest: 'Run best',
        rdSandVs: 'Your damage ×',
        rdSandResultHtml: (total, spin) => `Dealt <strong>${total}</strong> over ${SAND.rounds} rounds · best hit <strong>${spin}</strong>.`,
        rdSandHint: 'Press R or the button to go again.',
        rdSandHelp1Html: '<strong>Drag a rune</strong> to line up <strong>3+ of a colour</strong> and chain <strong>combos</strong> \u2014 the colours you clear are your <strong>damage</strong>.',
        rdSandHelp2Html: 'Three elemental <strong>enemies</strong> stand as targets. Each colour you clear hits one, scaled by its <strong>elemental multiplier</strong> (<strong>×1.5</strong> strong / <strong>×0.5</strong> weak); clear <strong>5+</strong> to hit <strong>all three</strong>.',
        rdSandHelp3Html: 'Beat an enemy and a <strong>fresh</strong> one takes its place. <strong>Draft 3 power-ups</strong> at the start, then one every 5 rounds. Over <strong>30 spins</strong>, chase your best <strong>total</strong> and <strong>single-spin</strong> damage. <kbd>P</kbd> pause · <kbd>R</kbd> restart · <kbd>M</kbd> mute.',
        // --- Sandbag draft (pick 1 of 3 every few rounds) ---
        rdDraftTitle: 'Choose a power', rdDraftAny: 'Any', rdDraftOnce: 'One-time', rdSandPick: 'Choose an element',
        rdPowers: 'Powers', rdPowersTitle: 'Your powers', rdPowersNone: 'No powers yet.',
        sdAtk_name: 'Attack up', sdAtk_desc: 'All your damage rises.',
        sdDmg_name: 'Element power', sdDmg_desc: 'That element\u2019s damage climbs sharply.',
        sdAoe4_name: 'AoE at 4', sdAoe4_desc: 'Every colour hits all three at 4.',
        sdFocus_name: 'Flood', sdFocus_desc: 'Chosen element drops far more often.',
        sdTime_name: 'Spin +1s', sdTime_desc: 'More time on every spin.',
        sdQuick_name: 'Match 2', sdQuick_desc: 'Chosen element clears with just 2 in a row.',
        sdCombo_name: 'Combo boost', sdCombo_desc: 'Each combo adds more damage.',
        sdFirst_name: 'First-wave boost', sdFirst_desc: 'First-wave clears hit harder.',
        sdLater_name: 'Cascade boost', sdLater_desc: 'Cascade (non-first-wave) clears hit harder.',
        sdAllAoe_name: 'Extra target', sdAllAoe_desc: 'That element\u2019s attacks hit one more enemy.',
        sdFree_name: 'Free spin', sdFree_desc: 'Keep rearranging runes until the timer runs out.',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        rdRound: '回合', rdHp: '生命', rdReady: '準備開始', rdRival: '對手',
        rdPlay: '出牌',
        rdIntro: '回合制轉珠對決。每回合先在防禦階段佈盾，再於攻擊階段出牌並轉珠——消除同色 3 顆以上攻擊對手，同時滿足對手的盾。先把對方血量打到 0 者獲勝。',
        rdStartHintHtml: '抽牌出牌，再拖動符石轉珠 · <kbd>P</kbd> 暫停',
        rdHelp1Html: '每回合分兩階段，<strong>每階段能量都會補滿</strong>。<strong>防禦</strong>階段可<strong>抽牌</strong>並出<strong>盾牌</strong>，對手的轉珠必須滿足這些盾才打得到你；完成後按「<strong>進入攻擊</strong>」。',
        rdHelp2Html: '<strong>攻擊</strong>階段<strong>同樣能抽牌、出牌</strong>（轉色、附魔、<strong>破盾</strong>、時間），再<strong>拖動符石</strong>連成<strong>同色 3 顆以上</strong>消除。須滿足對手所有的盾，否則攻擊被<strong>擋下</strong>。<strong>心</strong>珠回血；單色消 <strong>5 顆以上</strong>，下一批掉落會帶一顆<strong>強化符石</strong>。',
        rdHelp3Html: '<strong>抽牌</strong>花 1 點能量，抽一張<strong>當前階段</strong>的牌（防禦抽盾、攻擊抽攻擊牌）。把對手血量打到 <strong>0</strong> 獲勝；回合用盡則血量較高者勝。<kbd>P</kbd> 暫停 · <kbd>R</kbd> 重新開始 · <kbd>M</kbd> 靜音。',
        rdWin: '勝利！', rdLose: '落敗',
        rdOverWinHtml: (round) => `在第 <strong>${round}</strong> 回合獲勝。`,
        rdOverLoseHtml: (round) => `在第 <strong>${round}</strong> 回合倒下。`,
        rdOverHint: '按 R 或按鈕再對決一次。',
        rdDefense: '防禦階段——出防禦牌', rdAttack: '攻擊階段——出牌並轉珠', rdDone: '進入攻擊 \u2192', rdDraw: '抽牌', rdTimeUp: '時間到！', rdSpinNow: '時間到——快轉珠！',
        rdPhaseDef: '防禦', rdPhaseAtk: '攻擊',
        rdOppSpin: '轉珠中\u2026', rdOppDone: '已出手', rdCopyCode: '複製', rdCopied: '已複製！',
        rdDrawGame: '平手！', rtShBanPick: '點選要禁消的顏色', rtPickShield: '點選要破除的盾',
        cwBan: (e) => `消到${e}就擋下攻擊`, cwNeed: (e) => `須消除${e}才能造成傷害`, cwNeedEnh: (e) => `須消除${e}強化珠才能造成傷害`,
        cwBanRand: '隨機一色，消到就擋下攻擊', cwBanPick: '指定一色，消到就擋下攻擊', cwNeedRand: '隨機一色，須消除才能造成傷害', cwNeedPick: '指定一色，須消除才能造成傷害',
        cwNeedEnhAny: '須消除任一強化珠才能造成傷害', cwNeedEnhRand: '隨機一色，須消除其強化珠', cwNeedEnhPick: '指定一色，須消除其強化珠',
        cwComboMin: (n) => `須達 ${n} 連擊才能造成傷害`, cwComboMax: (n) => `連擊須在 ${n} 以內`, cwFirstMin: (n) => `首批須達 ${n} 連擊`, cwFirstMax: (n) => `首批連擊須在 ${n} 以內`,
        cwSlow: '縮短對手的轉珠時間（可疊加）', cwFast: '延長自己的轉珠時間（可疊加）',
        cwTrans: (a, b) => `盤上所有${a}符石轉為${b}`, cwTransToPick: (a) => `盤上所有${a}符石轉為指定色`, cwTransFromPick: (b) => `盤上指定一色全轉為${b}`, cwTransBoth: '盤上指定一色轉為另一指定色',
        cwEnchEl: (e) => `將 3 顆${e}符石轉為強化珠`, cwEnchRand: '隨機將 3 顆符石轉為強化珠', cwEnchPick: '指定一色，將其 3 顆轉為強化珠',
        cwBreakRand: '隨機破除對手一個盾或一層縮時', cwBreakPick: '指定破除對手一個盾或一層縮時',
        rdOnline: '線上對戰', rdOnlineBtn: '線上', rdClose: '關閉',
        rdSignInGoogle: '用 Google 登入', rdSignInGuest: '以訪客身分遊玩', rdSignOut: '登出', rdGuest: '訪客',
        rdSignedIn: (name) => `已登入：${name}`, rdSignInFirst: '登入後即可建立或加入房間。',
        rdCreateRoom: '建立房間', rdJoinRoom: '加入', rdRoomCode: '房號', rdLeaveRoom: '離開房間',
        rdRoomCreated: (code) => `房號 ${code}——等待對手加入\u2026`, rdWaitingOpp: '等待對手\u2026',
        rdMatched: (name) => `已配對：${name}！`,
        rdReadyUp: '準備好了', rdReadyWait: '已準備，等待對手\u2026', rdOppReady: '對手已準備',
        rdLvEasy: '簡單', rdLvNormal: '普通', rdLvHard: '困難', rdTimeShort: '時間縮短',
        rdReasonForfeit: '對手離開或逾時未行動，你獲勝。',
        rdReasonKoWin: '對手血量歸零，你獲勝。', rdReasonKoLose: '你的血量歸零，你落敗。', rdReasonDoubleKo: '雙方同時血量歸零，平手。',
        rdReasonHpWin: '回合數耗盡，你的血量較高，你獲勝。', rdReasonHpLose: '回合數耗盡，你的血量較低，你落敗。', rdReasonTimeDraw: '回合數耗盡且血量相同，平手。',
        rdRoomNotFound: '找不到房間', rdRoomFull: '房間已滿', rdNetErr: '連線錯誤',
        rdDiscard: '丟棄', rdOppBoard: '對手盤面', rdYouWin: '你贏了！', rdYouLose: '你輸了',
        rdTapPlay: '再點一下出牌',
        rtBlocked: '擋下！', rtCombo: (n) => `${n} 連擊`,
        rtPopupHint: '點擊外面取消',
        rtTransmuteFrom: '點選要轉換的顏色', rtTransmuteTo: '點選目標顏色',
        el_fire: '火', el_water: '水', el_wood: '木', el_light: '光', el_dark: '暗', el_heart: '心',
        el_yao: '妖', el_steel: '鋼',
        rdModeDuel: '對戰', rdModeSandbox: '沙包',
        rdColBestRounds: '最短回合', rdColBestSpin: '最高單波', rdColDamage: '傷害', rdColBestTotal: '最高傷害',
        rdSandDone: '挑戰結束！',
        rdSandIntro: '對三隻屬性敵人連轉 30 回合，拚最高總傷害與單次轉珠傷害。開場連選 3 次，之後每 5 回合可三選一強化。',
        rdSandStartHint: '拖動符石轉珠 · P 暫停',
        rdSandRunBest: '本場最高',
        rdSandVs: '你的攻擊倍率',
        rdSandResultHtml: (total, spin) => `${SAND.rounds} 回合共造成 <strong>${total}</strong> 傷害 · 最高單波 <strong>${spin}</strong>。`,
        rdSandHint: '按 R 或按鈕再打一輪。',
        rdSandHelp1Html: '<strong>拖動符石</strong>連成<strong>同色 3 顆以上</strong>消除、串接<strong>連擊</strong>——你消掉的顏色就是<strong>傷害</strong>。',
        rdSandHelp2Html: '場上有三隻屬性<strong>敵人</strong>。你消的每種顏色會攻擊其中一隻，並依<strong>屬性倍率</strong>計算（剋 <strong>×1.5</strong>／被剋 <strong>×0.5</strong>）；單色消 <strong>5 顆以上</strong>則<strong>三隻全打</strong>。',
        rdSandHelp3Html: '打倒一隻，就有<strong>新敵人</strong>遞補。開場<strong>連選 3 次</strong>，之後每 5 回合三選一。在 <strong>30 次轉珠</strong>內，拚最高<strong>總傷害</strong>與<strong>單次轉珠傷害</strong>。<kbd>P</kbd> 暫停 · <kbd>R</kbd> 重新開始 · <kbd>M</kbd> 靜音。',
        // --- 沙包強化抽卡（每幾回合三選一） ---
        rdDraftTitle: '選一項強化', rdDraftAny: '任選', rdDraftOnce: '限一次', rdSandPick: '選一個屬性',
        rdPowers: '能力', rdPowersTitle: '目前能力', rdPowersNone: '尚無能力。',
        sdAtk_name: '攻擊力增強', sdAtk_desc: '所有傷害提升。',
        sdDmg_name: '屬性強攻', sdDmg_desc: '該屬性傷害大幅提升。',
        sdAoe4_name: '4 顆即 AoE', sdAoe4_desc: '所有屬性消 4 顆就攻擊全體。',
        sdFocus_name: '大量掉落', sdFocus_desc: '指定屬性掉落機率大增。',
        sdTime_name: '轉珠 +1 秒', sdTime_desc: '每次轉珠時間 +1 秒。',
        sdQuick_name: '2 顆即消', sdQuick_desc: '指定屬性只要相連 2 顆就能消除。',
        sdCombo_name: 'Combo 加成', sdCombo_desc: '每個 combo 的傷害加成提升。',
        sdFirst_name: '首消強化', sdFirst_desc: '首批消除的傷害提升。',
        sdLater_name: '連鎖強化', sdLater_desc: '非首批（連鎖）消除的傷害提升。',
        sdAllAoe_name: '增加攻擊目標', sdAllAoe_desc: '該屬性攻擊多打一隻敵人。',
        sdFree_name: '自由轉珠', sdFree_desc: '可持續重排符石，直到時間用盡。',
    });

    // =================================================================
    // Board geometry + element data
    // =================================================================

    const W = 600, H = 760;
    const COLS = 6;
    const CELL = 100;
    // Rows (and the board's top edge) depend on the mode: duel/online is 6×5, Sandbag is
    // 6×6 (taller board, slimmer enemy band above). applyBoardGeometry() sets these per run.
    const DUEL_ROWS = 5;
    let ROWS = DUEL_ROWS;
    let BOARD_TOP = H - ROWS * CELL; // duel = 260, sandbox = 160
    function applyBoardGeometry() {
        ROWS = (G.mode === 'sandbox') ? SAND.rows : DUEL_ROWS;
        BOARD_TOP = H - ROWS * CELL;
    }
    // layout anchors for the top HUD (above the board) — tweak here to re-space
    const LAY = { handY: 90, handH: 70, energyY: 168, actY: 178, actH: 32, youHpY: 238, youHpH: 12 };

    const ELEMENTS = ['fire', 'water', 'wood', 'light', 'dark', 'heart'];
    const ATTACK_ELEMENTS = ['fire', 'water', 'wood', 'light', 'dark'];
    const ELEMENT_COLORS = {
        fire: '#c35540', water: '#4f7ba4', wood: '#5f8a52',
        light: '#c3a24a', dark: '#7b6a99', heart: '#c1738a',
        yao: '#c1738a', steel: '#8b8f97',   // sandbox attack runes (Spirit shares Heart's colour, flower icon)
    };
    // Board rune glyphs. An op is a Lucide 24×24 path string fed to Path2D, or
    // { c:[cx,cy,r] } for a stroked circle (Lucide <circle> has no path `d`). Each
    // entry records its SOURCE so it never gets lost: `lucide: <kebab-name>` is that
    // Lucide icon verbatim (re-fetch/verify at lucide.dev/icons/<name>), `lucide:
    // <name> (modified)` is that icon hand-edited, and `custom:` has no Lucide
    // equivalent. Keep this annotation in sync whenever an icon changes.
    const ICON_OPS = {
        water: [{ p: 'M7.001 15.085A1.5 1.5 0 0 1 9 16.5' }, { c: [18.5, 8.5, 3.5] }, { c: [7.5, 16.5, 5.5] }, { c: [7.5, 4.5, 2.5] }],   // lucide: bubbles
        fire:  [{ p: 'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4' }],   // lucide: flame
        wood:  [{ p: 'M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20' }, { p: 'M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13' }],   // lucide: leaf
        light: [{ p: 'M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203' }],   // lucide: astroid
        dark:  [{ c: [12, 12, 10] }, { p: 'M12 2a7 7 0 1 0 10 10' }],   // lucide: eclipse
        heart: [{ p: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5' }],   // lucide: heart
        yao: [{ p: 'M12 7.5a4.5 4.5 0 1 1 4.5 4.5M12 7.5A4.5 4.5 0 1 0 7.5 12M12 7.5V9m-4.5 3a4.5 4.5 0 1 0 4.5 4.5M7.5 12H9m7.5 0a4.5 4.5 0 1 1-4.5 4.5m4.5-4.5H15m-3 4.5V15' }, { c: [12, 12, 3] }],   // lucide: flower (modified — petals + centre only, 8 accent strokes removed)
        steel: [{ p: 'M12 2 4 7v10l8 5 8-5V7z' }, { p: 'M12 7v10M8 9.5v5M16 9.5v5' }],   // custom: faceted ingot (hand-drawn, no Lucide match)
    };
    const ICON_PATHS = {};
    for (const _el in ICON_OPS) {
        ICON_PATHS[_el] = ICON_OPS[_el].map((op) => {
            if (op.p) return new Path2D(op.p);
            const pp = new Path2D(); pp.arc(op.c[0], op.c[1], op.c[2], 0, PI2); return pp;
        });
    }
    // HUD pills and card tiles. Same op format and `lucide:` / `custom:` source
    // convention as ICON_OPS above. Element glyphs reuse the board rune icons
    // (ICON_PATHS), so cards match the orbs. Many are the Lucide icon scaled/trimmed
    // to fit a pill — still the same glyph, re-fetchable by name.
    const UI_ICON_OPS = {
        up: ['M12 19V5', 'M5 12l7-7 7 7'],                                  // lucide: arrow-up (time pill ↑)
        down: ['M12 5v14', 'M19 12l-7 7-7-7'],                              // lucide: arrow-down (time pill ↓)
        clockUp: [{ c: [9, 9, 7] }, 'M9 5.5V9l2.3 1.3', 'M18 20.5v-7', 'm15 16.5 3-3 3 3'],   // custom: clock + up arrow (extend own time)
        clockDown: [{ c: [9, 9, 7] }, 'M9 5.5V9l2.3 1.3', 'M18 13.5v7', 'm15 17.5 3 3 3-3'],  // custom: clock + down arrow (shorten rival time)
        ban: [{ c: [12, 12, 9] }, 'm5.6 5.6 12.8 12.8'],                    // lucide: ban (forbid a colour)
        check: [{ c: [12, 12, 9] }, 'm8.3 12 2.5 2.5 4.8-4.8'],            // lucide: circle-check (require a colour)
        qmark: [{ c: [12, 12, 9] }, 'M9.3 9a2.7 2.7 0 0 1 5.2 1c0 1.8-2.7 2.5-2.7 2.7', 'M12 16.1v.01'],   // lucide: circle-help (random)
        crosshair: [{ c: [12, 12, 7] }, 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3'],   // lucide: crosshair (chosen / any)
        diamond: ['M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0z'],   // lucide: diamond (enhanced rune)
        ellipsis: [{ c: [12, 12, 9] }, 'M7 12h.01', 'M12 12h.01', 'M17 12h.01'],   // lucide: circle-ellipsis (combo count)
        arrowRight: ['M5 12h14', 'm12 5 7 7-7 7'],                          // lucide: arrow-right (transmute connector)
        shieldBan: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z', 'm5.5 5.5 13 13'],   // lucide: shield-ban (break a shield)
        // Sandbag draft card glyphs (Lucide 24×24; <rect> expanded to path data).
        handFist: ['M12.035 17.012a3 3 0 0 0-3-3l-.311-.002a.72.72 0 0 1-.505-1.229l1.195-1.195A2 2 0 0 1 10.828 11H12a2 2 0 0 0 0-4H9.243a3 3 0 0 0-2.122.879l-2.707 2.707A4.83 4.83 0 0 0 3 14a8 8 0 0 0 8 8h2a8 8 0 0 0 8-8V7a2 2 0 1 0-4 0v2a2 2 0 1 0 4 0', 'M13.888 9.662A2 2 0 0 0 17 8V5A2 2 0 1 0 13 5', 'M9 5A2 2 0 1 0 5 5V10', 'M9 7V4A2 2 0 1 1 13 4V7.268'],   // lucide: hand-fist
        split: ['M16 3h5v5', 'M8 3H3v5', 'M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3', 'm15 9 6-6'],   // lucide: split
        squareStack: ['M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2', 'M10 16c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2', 'M16 14h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z'],   // lucide: square-stack
        clockArrowUp: ['M12 6v6l1.56.78', 'M13.227 21.925a10 10 0 1 1 8.767-9.588', 'm14 18 4-4 4 4', 'M18 22v-8'],   // lucide: clock-arrow-up
        circlePlus: [{ c: [12, 12, 10] }, 'M8 12h8', 'M12 8v8'],   // lucide: circle-plus
        box: ['M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z', 'm3.3 7 8.7 5 8.7-5', 'M12 22V12'],   // lucide: box
        link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],   // lucide: link
        grid2x2: ['M12 3v18', 'M3 12h18', 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z'],   // lucide: grid-2x2
        wand: ['M15 4V2', 'M15 16v-2', 'M8 9h2', 'M20 9h2', 'M17.8 11.8 19 13', 'M15 9h.01', 'M17.8 6.2 19 5', 'm3 21 9-9', 'M12.2 6.2 11 5'],   // lucide: wand-sparkles (older variant)
        columns2: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M12 3v18'],   // lucide: columns-2
        hourglass: ['M5 22h14', 'M5 2h14', 'M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22', 'M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2'],   // lucide: hourglass
        layoutGrid: ['M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z', 'M15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z', 'M15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z', 'M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z'],   // lucide: layout-grid
    };
    const UI_PATHS = {};
    for (const _k in UI_ICON_OPS) UI_PATHS[_k] = UI_ICON_OPS[_k].map((op) => {
        if (typeof op === 'string') return new Path2D(op);
        const p = new Path2D(); p.arc(op.c[0], op.c[1], op.c[2], 0, PI2); return p;
    });

    const WEIGHTS = { fire: 1, water: 1, wood: 1, light: 1, dark: 1, heart: 0.75 };
    const WEIGHT_TOTAL = ELEMENTS.reduce((s, e) => s + WEIGHTS[e], 0);

    // =================================================================
    // Config + balance + cards
    // =================================================================

    const CONFIG = {
        orbRadius: 40, iconScale: 0.8, iconStroke: 0.12, iconTint: -0.15,
        enhTint: 0.70,   // enhanced runes: brightened element colour for the rim + icon (vs the old near-white)
        popTime: 0.12, popGap: 0.12, fallAnim: 0.2, fallGap: 0.06,   // short anims + deliberate gaps between steps
        bigThreshold: 5, scoreCap: 999999,
    };
    const BALANCE = {
        spinTime: 6, baseDamage: 12, heartHeal: 30, comboStep: 0.25, enhancedMult: 1.5,
    };
    const DUEL = {
        hp: 3000, maxRounds: 30,
        energy: 10, maxHand: 10, drawCost: 1,   // one mixed hand; draw pulls from the current phase's pool
        phaseTimeDef: 30,               // seconds to decide in the defense phase
        phaseTimeAtk: 40,               // seconds to decide in the attack phase
        resolvePause: 1.6,              // hold at round end so the mutual attack is readable
        strikeDelay: 0.5,               // online: beat between the heal and the incoming hit (layering)
        aiThink: 1.5,
        aiBase: 40, aiPerCombo: 28,     // rival damage ≈ aiBase + combos·aiPerCombo
        aiComboMin: 3, aiComboMax: 7,   // its simulated combos (before meeting your shields)
        aiSkill: 0.7,                   // chance it meets each of your shields
        aiHasten: 0.3,                  // chance it hastens your spin (from round 3)
        stallSec: 45,                   // online: opponent idle this long → they forfeit
        takeoverSec: 6,                 // online: both attacked but host didn't tally → take over
    };
    // Sandbox ("Sandbag") mode: a no-brainer damage run — no cards, no defence, 3 elemental
    // enemies you pound for a fixed number of spins. Spirit replaces Heart (attack, flower icon).
    const SAND = {
        rounds: 30,
        rows: 6,                        // Sandbag board is always 6×6, regardless of difficulty
        spinTime: 6,                    // Sandbag spin window (seconds), regardless of difficulty
        // Attack-rune / enemy element pool, scaled by difficulty — the only thing difficulty
        // changes here: Easy drops Spirit and Steel, Normal drops Steel, Hard has every attribute.
        elements: {
            easy:   ['fire', 'water', 'wood', 'light', 'dark'],
            normal: ['fire', 'water', 'wood', 'light', 'dark', 'yao'],
            hard:   ['fire', 'water', 'wood', 'light', 'dark', 'yao', 'steel'],
        },
        stageRounds: 10,                // rounds per HP stage
        hpTiersByStage: [               // enemy HP by 10-round stage; each spawn rolls a random tier within its stage
            [200, 400, 800, 1600],      // rounds 1-10
            [400, 800, 1600, 3200],     // rounds 11-20
            [800, 1600, 3200, 6400],    // rounds 21-30
        ],
        sizeByTier: [0.74, 0.81, 0.88, 0.94],   // size per tier index 0-3 (tougher tiers read a touch bigger); all kept clear of the score row
        strikeGap: 0.26,                // delay between each element's strike in the attack anim
        hold: 0.9,                      // beat after all strikes before the next spin
    };
    // Sandbag draft (roguelite picks): every DRAFT.every rounds, pick 1 of DRAFT.offer cards.
    // ALL ability tunables live here so balance is one-stop. See DRAFT_CARDS for the catalogue.
    const DRAFT = {
        every: 5, offer: 3, openPicks: 3,   // drafts after rounds 5/10/15/20/25; the opening offers 3 picks
        atkPerStack: 0.2,              // sd_atk:   +0.2× to ALL damage per stack
        dmgPerStack: 1.0,              // sd_dmg:   +100% damage to one element (stacks)
        aoeThreshold: 4,               // sd_aoe4:  EVERY colour AoEs at 4
        focusDropMult: 5,              // sd_focus: chosen element drops this many× as often as each other
        spinBonusSec: 1,               // sd_time:  +1s spin window per stack
        quickMatchLen: 2,              // sd_quick: chosen element matches at 2 in a row
        comboStepPerStack: 0.08,       // sd_combo: comboStep 0.25 -> 0.33 -> 0.41 ... per stack
        firstWavePerStack: 0.3,        // sd_first: +0.3× first-wave damage per stack
        laterWavePerStack: 0.4,        // sd_later: +0.4× cascade (non-first-wave) damage per stack
        extraTargetMax: 2,             // sd_allaoe: +1 attack target per stack, up to this many per element
    };
    // key   = i18n prefix (key_name / key_desc).
    // mode  = how the element is chosen: 'global' (none) | 'elem' (a rolled element) | 'anyElem' (always player-chosen).
    // limit = 'stack' (unlimited) | 'perElement' (once per element, up to `cap`) | 'once' (once per run).
    // weight = draft rarity; tier = frame colour only (never shown as text).
    const DRAFT_CARDS = {
        sd_atk:    { key: 'sdAtk',    mode: 'global',  limit: 'stack',      weight: 8, tier: 'blue',   icon: 'handFist' },
        sd_allaoe: { key: 'sdAllAoe', mode: 'elem',    limit: 'perElement', weight: 6, tier: 'blue',   icon: 'split', cap: 2 },
        sd_combo:  { key: 'sdCombo',  mode: 'global',  limit: 'stack',      weight: 6, tier: 'blue',   icon: 'squareStack' },
        sd_time:   { key: 'sdTime',   mode: 'global',  limit: 'stack',      weight: 7, tier: 'blue',   icon: 'clockArrowUp' },
        sd_dmg:    { key: 'sdDmg',    mode: 'elem',    limit: 'stack',      weight: 6, tier: 'purple', icon: 'circlePlus' },
        sd_first:  { key: 'sdFirst',  mode: 'global',  limit: 'stack',      weight: 4, tier: 'purple', icon: 'box' },
        sd_later:  { key: 'sdLater',  mode: 'global',  limit: 'stack',      weight: 4, tier: 'purple', icon: 'link' },
        sd_aoe4:   { key: 'sdAoe4',   mode: 'global',  limit: 'once',       weight: 2, tier: 'gold',   icon: 'layoutGrid' },
        sd_focus:  { key: 'sdFocus',  mode: 'anyElem', limit: 'once',       weight: 2, tier: 'gold',   icon: 'wand' },
        sd_quick:  { key: 'sdQuick',  mode: 'anyElem', limit: 'once',       weight: 1, tier: 'red',    icon: 'columns2' },
        sd_free:   { key: 'sdFree',   mode: 'global',  limit: 'once',       weight: 1, tier: 'red',    icon: 'hourglass' },
    };
    const DRAFT_ORDER = ['sd_atk', 'sd_allaoe', 'sd_combo', 'sd_time', 'sd_dmg', 'sd_first', 'sd_later', 'sd_aoe4', 'sd_focus', 'sd_quick', 'sd_free'];
    const DRAFT_TIER = { blue: '#5aa0e0', purple: '#a86fe0', gold: '#e3b63a', red: '#e0554f' };   // draft frame colour per rarity
    // The active Sandbag element pool for the committed difficulty (G.aiLevel).
    function sandElements() { return SAND.elements[G.aiLevel] || SAND.elements.normal; }
    // Elemental multiplier grid: RESTRAINT[attacker][defender]. Not a simple triangle, so a
    // grid is clearer to tune. (Water>Fire>Wood>Water, Light<->Dark, Spirit/Steel; Spirit/Steel resist light/dark.)
    const RESTRAINT = {
        water: { water: 1.0, fire: 1.5, wood: 0.5, light: 1.0, dark: 1.0, yao: 1.0, steel: 1.0 },
        fire:  { water: 0.5, fire: 1.0, wood: 1.5, light: 1.0, dark: 1.0, yao: 1.0, steel: 1.0 },
        wood:  { water: 1.5, fire: 0.5, wood: 1.0, light: 1.0, dark: 1.0, yao: 1.0, steel: 1.0 },
        light: { water: 1.0, fire: 1.0, wood: 1.0, light: 1.0, dark: 1.5, yao: 0.5, steel: 1.0 },
        dark:  { water: 1.0, fire: 1.0, wood: 1.0, light: 1.5, dark: 1.0, yao: 0.5, steel: 1.0 },
        yao:   { water: 1.0, fire: 1.0, wood: 1.0, light: 1.0, dark: 1.0, yao: 1.5, steel: 0.5 },
        steel: { water: 1.0, fire: 1.0, wood: 1.0, light: 0.5, dark: 0.5, yao: 1.5, steel: 0.5 },
    };
    function restraint(atk, def) { return (RESTRAINT[atk] && RESTRAINT[atk][def]) || 1; }
    // Card pools (data-driven). type = phase it's played in; cat = behaviour;
    // cost = energy; weight = draw weight within its pool. Cards are generated so the
    // pool can grow freely. Display names come from cardName() (parameterised i18n).
    const CARDS = {};
    (function buildCards() {
        let ord = 0;
        const D = (id, o) => { o.order = ord++; CARDS[id] = o; };
        // ---- DEFENSE POOL (shields the rival's spin must satisfy, + slow) ----
        for (const el of ELEMENTS) {
            D('ban_' + el, { type: 'defense', cost: 2, weight: 2, cat: 'ban', el });
            D('need_' + el, { type: 'defense', cost: 2, weight: 2, cat: 'need', el });
            D('nEnh_' + el, { type: 'defense', cost: 6, weight: 1, cat: 'needEnhEl', el });
        }
        D('ban_rand', { type: 'defense', cost: 2, weight: 4, cat: 'banRand' });
        D('ban_pick', { type: 'defense', cost: 4, weight: 4, cat: 'banPick' });
        D('need_rand', { type: 'defense', cost: 2, weight: 4, cat: 'needRand' });
        D('need_pick', { type: 'defense', cost: 4, weight: 4, cat: 'needPick' });
        D('nEnh_any', { type: 'defense', cost: 4, weight: 6, cat: 'needEnhAny' });
        D('nEnh_rand', { type: 'defense', cost: 6, weight: 2, cat: 'needEnhRand' });
        D('nEnh_pick', { type: 'defense', cost: 8, weight: 2, cat: 'needEnhPick' });
        [[8, 7, 4], [7, 5, 8], [6, 3, 8], [5, 2, 6]].forEach(([n, cost, weight]) => D('cmin' + n, { type: 'defense', cost, weight, cat: 'comboMin', n }));
        [[4, 2, 6], [3, 4, 8], [2, 6, 8], [1, 8, 4]].forEach(([n, cost, weight]) => D('fmax' + n, { type: 'defense', cost, weight, cat: 'firstMax', n }));
        D('slow', { type: 'defense', cost: 3, weight: 15, cat: 'slow' });
        // ---- ATTACK POOL (reshape your board / break shields / more time) ----
        for (const from of ELEMENTS) for (const to of ELEMENTS) if (from !== to) D('tr_' + from + '_' + to, { type: 'enhance', cost: 3, weight: 1, cat: 'transmute', from, to });
        for (const el of ELEMENTS) {
            D('trTo_' + el, { type: 'enhance', cost: 5, weight: 2, cat: 'transToPick', from: el });
            D('trFr_' + el, { type: 'enhance', cost: 5, weight: 2, cat: 'transFromPick', to: el });
            D('ench_' + el, { type: 'enhance', cost: 5, weight: 3, cat: 'enchEl', el });
        }
        D('tr_both', { type: 'enhance', cost: 7, weight: 4, cat: 'transBoth' });
        D('ench_rand', { type: 'enhance', cost: 6, weight: 6, cat: 'enchRand' });
        D('ench_pick', { type: 'enhance', cost: 7, weight: 4, cat: 'enchPick' });
        D('fast', { type: 'enhance', cost: 4, weight: 15, cat: 'fast' });
        D('brk_rand', { type: 'enhance', cost: 5, weight: 10, cat: 'breakRand' });
        D('brk_pick', { type: 'enhance', cost: 8, weight: 5, cat: 'breakPick' });
    })();
    const DEF_IDS = Object.keys(CARDS).filter((id) => CARDS[id].type === 'defense');
    const ENH_IDS = Object.keys(CARDS).filter((id) => CARDS[id].type === 'enhance');
    function elName(el) { return t('el_' + el); }
    function cardName(id) {
        const c = CARDS[id]; if (!c) return id;
        switch (c.cat) {
            case 'ban': return t('cwBan', elName(c.el)); case 'need': return t('cwNeed', elName(c.el)); case 'needEnhEl': return t('cwNeedEnh', elName(c.el));
            case 'banRand': return t('cwBanRand'); case 'banPick': return t('cwBanPick'); case 'needRand': return t('cwNeedRand'); case 'needPick': return t('cwNeedPick');
            case 'needEnhAny': return t('cwNeedEnhAny'); case 'needEnhRand': return t('cwNeedEnhRand'); case 'needEnhPick': return t('cwNeedEnhPick');
            case 'comboMin': return t('cwComboMin', c.n); case 'comboMax': return t('cwComboMax', c.n); case 'firstMin': return t('cwFirstMin', c.n); case 'firstMax': return t('cwFirstMax', c.n);
            case 'slow': return t('cwSlow'); case 'fast': return t('cwFast');
            case 'transmute': return t('cwTrans', elName(c.from), elName(c.to)); case 'transToPick': return t('cwTransToPick', elName(c.from)); case 'transFromPick': return t('cwTransFromPick', elName(c.to)); case 'transBoth': return t('cwTransBoth');
            case 'enchEl': return t('cwEnchEl', elName(c.el)); case 'enchRand': return t('cwEnchRand'); case 'enchPick': return t('cwEnchPick');
            case 'breakRand': return t('cwBreakRand'); case 'breakPick': return t('cwBreakPick');
            default: return id;
        }
    }

    // =================================================================
    // State
    // =================================================================

    const G = {
        rng: null,
        board: [],
        clearing: [],
        youHp: 0, youMaxHp: 0,
        aiHp: 0, aiMaxHp: 0,
        aiShields: [],          // rival shields you must satisfy (all)
        mode: 'duel',           // 'duel' (vs computer / online) | 'sandbox' (Sandbag damage run)
        enemies: [],            // sandbox: the three target enemies [{el,hp,maxHp,flash}]
        sandTotal: 0,           // sandbox: damage dealt so far this run
        sandSpinRun: 0,         // sandbox: best single-spin this run
        sandAtk: null,          // sandbox: the post-spin strike animation state
        sandInspect: null,      // sandbox: index of the enemy whose restraint tooltip is showing (hover / long-press)
        sandDraft: null,        // sandbox: the current {cards:[{id,element}]} draft offer (phase 'sanddraft'), or null
        sandAbil: null,         // sandbox: accumulated draft powers (see freshSandAbil for the shape)
        sandOpenLeft: 0,        // sandbox: opening drafts still to offer before round 1
        sandPowers: false,      // sandbox: is the "your powers" panel open?
        sandPowerSel: null,     // sandbox: index of the expanded Powers row (shows its description), or null
        aiBoard: null,          // vs-AI: the rival's own board (cells {el,enhanced})
        aiHand: [],             // vs-AI: the rival's own card hand (mixed, like yours — hidden from you)
        aiEnergy: 0,            // vs-AI: the rival's energy this phase
        aiTimeMult: 1,          // vs-AI: the rival's spin-time multiplier (Fast ×1/0.7, your Shorten ×0.7) → beam size
        aiPlayed: [],           // vs-AI: cards the rival played this round (revealed in its panel)
        aiStatus: '',           // vs-AI: '' | 'spin' | 'done'
        aiPlan: null,           // vs-AI: this round's defense decision, revealed at the attack phase
        aiLevel: 'normal',      // vs-AI difficulty (easy | normal | hard)
        round: 1,
        phase: 'defense',       // 'defense' | 'attack' | 'ai' | 'over'
        phaseTimer: 0,          // seconds left to decide in defense / attack
        phaseMax: 0,            // this phase's total decide time (for the timer bar)
        countdown: 0,           // 3-2-1 pre-game preview: >0 freezes the clock & input
        aiTimer: 0,
        resolveHold: 0,         // seconds left in the round-end 'resolved' display pause
        score: 0,
        energy: 0,
        hand: [],               // card ids (of the current phase's type)
        youShields: [],         // shields you played (the rival must satisfy to hit you)
        spinMultSelf: 1,        // your spin-time multiplier this round (Fast cards, ×1/0.7 each)
        spinMultOpp: 1,         // the rival's spin-time multiplier on you (their Slow, ×0.7 each)
        mySlow: 0,              // Shorten (time↓) cards you played this round — shown in your defense area
        cardSel: null,          // index of the currently selected hand card (tap again to play)
        playedThisRound: [],    // enhance cards you've played this attack phase (revealed to rival at resolve)
        lastDrawn: null,        // hand index of the most-recently drawn card this phase (highlight)
        spinOpen: false,        // attack clock ran out → spin window is open (spin timer is counting)
        preSpinBoard: null,     // board snapshot (post-cards, pre-spin) sent to the rival's preview
        palette: null,          // active colour picker: { title, els, exclude, onPick }
        shieldPick: null,       // active "break which shield" picker: { i, id }
        empowerNext: 1,
        held: null,
        spinTimer: 0,
        resolving: false,
        resolve: null,
        floats: [],
        projectiles: [],        // attack dots in flight (both modes): { x,y,x0,y0,x1,y1,el,color,t,dur,onHit }
        particles: [],          // clear-burst sparks (both modes): cosmetic, uses Math.random not G.rng
        shake: 0,
    };

    let board = G.board;
    let seedCounter = 1;
    let shell = null;
    let staged = 'normal';     // selected difficulty (seg); committed to G.aiLevel on each run
    let stagedMode = 'duel';   // selected mode (seg); committed to G.mode on each run
    let fontCache = null;
    let accentCache = null;
    let defaultShape = null;
    let needsRender = true;     // render-on-demand: only repaint when something changed/animates
    let lastSecShown = -1;
    function markDirty() { needsRender = true; }

    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const dom = {
        round: document.getElementById('round'),
        hp: document.getElementById('hp'),
    };
    const hpStat = dom.hp ? dom.hp.closest('.hud-stat') : null;

    function fitCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = W * dpr; canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function getFont() {
        if (!fontCache) fontCache = getComputedStyle(document.body).getPropertyValue('--font-display') || '"Segoe UI", system-ui, sans-serif';
        return fontCache;
    }
    function accent() {
        if (!accentCache) accentCache = (getComputedStyle(document.body).getPropertyValue('--game-color') || '').trim() || '#86cfc6';
        return accentCache;
    }
    // Card palette: defense = blue family, attack = red family. `hi` is the brighter
    // "just drawn" accent; `bgNew` tints the newest card so it reads at a glance.
    function typeColors(isDef) {
        return isDef
            ? { base: '#5b8fc4', bg: 'rgba(79,123,164,0.16)', bgSel: 'rgba(79,123,164,0.36)', bgNew: 'rgba(120,180,240,0.17)', hi: '#9cccf5' }
            : { base: '#d16a4e', bg: 'rgba(195,85,64,0.16)', bgSel: 'rgba(195,85,64,0.36)', bgNew: 'rgba(240,140,90,0.17)', hi: '#ff9a63' };
    }
    function cardColors(id) { return typeColors(CARDS[id] && CARDS[id].type === 'defense'); }
    // The 1–3 glyphs a card shows, left to right. Each item is { g, c } (a glyph key +
    // colour) or { t, c } (a short text token + colour). Element glyphs use the element
    // colour; structural glyphs use the card's type accent; time cards are amber.
    const AMBER = '#ffcf8f';
    function elColor(el) { return shade(ELEMENT_COLORS[el], 0.32); }
    function cardGlyphs(c) {
        const a = typeColors(c.type === 'defense').hi;   // accent: blue (def) / red (atk)
        const g = (key, col) => ({ g: key, c: col || a });
        const el = (e) => ({ g: e, c: elColor(e) });
        const tx = (text) => ({ t: text, c: a });
        switch (c.cat) {
            case 'slow': return [g('clockDown', AMBER)];
            case 'fast': return [g('clockUp', AMBER)];
            case 'ban': return [g('ban'), el(c.el)];
            case 'banRand': return [g('ban'), g('qmark')];
            case 'banPick': return [g('ban'), g('crosshair')];
            case 'need': return [g('check'), el(c.el)];
            case 'needRand': return [g('check'), g('qmark')];
            case 'needPick': return [g('check'), g('crosshair')];
            case 'needEnhAny': return [g('check'), g('diamond')];
            case 'needEnhEl': return [g('check'), el(c.el), g('diamond')];
            case 'needEnhRand': return [g('check'), g('qmark'), g('diamond')];
            case 'needEnhPick': return [g('check'), g('crosshair'), g('diamond')];
            case 'comboMin': return [g('ellipsis'), tx('\u2265' + c.n)];
            case 'comboMax': return [g('ellipsis'), tx('\u2264' + c.n)];
            case 'firstMin': return [tx('\u2460\u2265' + c.n)];
            case 'firstMax': return [tx('\u2460\u2264' + c.n)];
            case 'transmute': return [el(c.from), g('arrowRight'), el(c.to)];
            case 'transToPick': return [el(c.from), g('arrowRight'), g('crosshair')];
            case 'transFromPick': return [g('crosshair'), g('arrowRight'), el(c.to)];
            case 'transBoth': return [g('crosshair'), g('arrowRight'), g('crosshair')];
            case 'enchEl': return [el(c.el), g('arrowRight'), g('diamond')];
            case 'enchPick': return [g('crosshair'), g('arrowRight'), g('diamond')];
            case 'enchRand': return [g('qmark'), g('arrowRight'), g('diamond')];
            case 'breakRand': return [g('qmark'), g('shieldBan')];
            case 'breakPick': return [g('crosshair'), g('shieldBan')];
            default: return [g('check')];
        }
    }
    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    // A cut-corner (chamfered) slab — a carved-stone tile. Path-only, like roundRect, so callers
    // fill()/stroke() after. `c` is the corner cut length.
    function slab(x, y, w, h, c) {
        c = Math.max(0, Math.min(c, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + c, y);
        ctx.lineTo(x + w - c, y);
        ctx.lineTo(x + w, y + c);
        ctx.lineTo(x + w, y + h - c);
        ctx.lineTo(x + w - c, y + h);
        ctx.lineTo(x + c, y + h);
        ctx.lineTo(x, y + h - c);
        ctx.lineTo(x, y + c);
        ctx.closePath();
    }
    function hexToRgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
    function shade(hex, amt) {
        const [r, g, b] = hexToRgb(hex);
        const f = (x) => Math.round(amt > 0 ? x + (255 - x) * amt : x * (1 + amt));
        return `rgb(${f(r)},${f(g)},${f(b)})`;
    }

    // =================================================================
    // Rune model
    // =================================================================

    function cellCol(idx) { return idx % COLS; }
    function cellRow(idx) { return (idx / COLS) | 0; }
    function cellCX(idx) { return cellCol(idx) * CELL + CELL / 2; }
    function cellCY(idx) { return BOARD_TOP + cellRow(idx) * CELL + CELL / 2; }
    function cellAtPixel(px, py) {
        let c = Math.floor(px / CELL), r = Math.floor((py - BOARD_TOP) / CELL);
        c = AC.math.clamp(c, 0, COLS - 1); r = AC.math.clamp(r, 0, ROWS - 1);
        return r * COLS + c;
    }
    function randomEl() {
        if (G.mode === 'sandbox') {
            const els = sandElements();
            const fav = G.sandAbil && G.sandAbil.dropWeightEl;   // sd_focus: one element drops ×focusDropMult
            if (fav && els.indexOf(fav) !== -1) {
                const total = DRAFT.focusDropMult + (els.length - 1);
                let x = AC.rng.float(G.rng, 0, total);
                for (const el of els) { x -= (el === fav ? DRAFT.focusDropMult : 1); if (x <= 0) return el; }
                return els[0];
            }
            return els[AC.rng.int(G.rng, 0, els.length)];   // difficulty-scaled pool, equal weight
        }
        let x = AC.rng.float(G.rng, 0, WEIGHT_TOTAL);
        for (const el of ELEMENTS) { x -= WEIGHTS[el]; if (x <= 0) return el; }
        return 'fire';
    }
    function makeShape(rng) {
        const jit = [];
        for (let i = 0; i < 8; i++) jit.push([AC.rng.float(rng, -0.05, 0.05), AC.rng.float(rng, -0.05, 0.05)]);
        const speckles = [];
        const k = 4 + AC.rng.int(rng, 0, 3);
        for (let i = 0; i < k; i++) speckles.push({ dx: AC.rng.float(rng, -0.55, 0.55), dy: AC.rng.float(rng, -0.55, 0.55), r: AC.rng.float(rng, 0.06, 0.15), light: AC.rng.float(rng, 0, 1) < 0.4 });
        return { rot: AC.rng.float(rng, -0.06, 0.06), jit, speckles, toneShift: AC.rng.float(rng, -0.07, 0.07) };
    }
    function newOrb(el, x, y, enhanced) { return { el, x, y, scale: 1, shape: makeShape(G.rng), enhanced: !!enhanced }; }
    function elAt(r, c) { const o = board[r * COLS + c]; return o ? o.el : null; }

    function fillBoardNoMatches() {
        for (let idx = 0; idx < COLS * ROWS; idx++) board[idx] = newOrb(randomEl(), cellCX(idx), cellCY(idx));
        let guard = 0, groups = findMatches();
        while (groups.length > 0 && guard++ < 200) {
            for (const g of groups) for (const idx of g.cells) board[idx].el = randomEl();
            groups = findMatches();
        }
    }
    // Minimum run length to clear a colour. Default 3; the Sandbag draft's sd_quick drops one
    // chosen element to 2 (sandbox only — never affects the duel / AI match logic).
    function matchMinLen(el) {
        if (G.mode === 'sandbox' && G.sandAbil && G.sandAbil.quickMatchEl === el) return DRAFT.quickMatchLen;
        return 3;
    }
    function findMatches() {
        const n = COLS * ROWS;
        const matched = new Array(n).fill(false);
        for (let r = 0; r < ROWS; r++) {
            let c = 0;
            while (c < COLS) {
                const el = elAt(r, c);
                let c2 = c; while (c2 < COLS && elAt(r, c2) === el && el != null) c2++;
                if (el != null && c2 - c >= matchMinLen(el)) for (let k = c; k < c2; k++) matched[r * COLS + k] = true;
                c = Math.max(c2, c + 1);
            }
        }
        for (let c = 0; c < COLS; c++) {
            let r = 0;
            while (r < ROWS) {
                const el = elAt(r, c);
                let r2 = r; while (r2 < ROWS && elAt(r2, c) === el && el != null) r2++;
                if (el != null && r2 - r >= matchMinLen(el)) for (let k = r; k < r2; k++) matched[k * COLS + c] = true;
                r = Math.max(r2, r + 1);
            }
        }
        const groups = [];
        const seen = new Array(n).fill(false);
        for (let idx = 0; idx < n; idx++) {
            if (!matched[idx] || seen[idx] || !board[idx]) continue;
            const el = board[idx].el;
            const stack = [idx], cells = [];
            seen[idx] = true;
            while (stack.length) {
                const cur = stack.pop();
                cells.push(cur);
                const r = cellRow(cur), c = cellCol(cur);
                const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
                for (const [nr, nc] of nb) {
                    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
                    const ni = nr * COLS + nc;
                    if (matched[ni] && !seen[ni] && board[ni] && board[ni].el === el) { seen[ni] = true; stack.push(ni); }
                }
            }
            groups.push({ el, cells });
        }
        return groups;
    }
    function applyGravity(enhanceEls) {
        const refilled = [];
        for (let c = 0; c < COLS; c++) {
            let write = ROWS - 1;
            for (let r = ROWS - 1; r >= 0; r--) {
                const idx = r * COLS + c;
                if (board[idx] != null) {
                    const w = write * COLS + c;
                    if (w !== idx) { board[w] = board[idx]; board[idx] = null; }
                    write--;
                }
            }
            let above = 1;
            for (let r = write; r >= 0; r--) { const idx = r * COLS + c; board[idx] = newOrb(randomEl(), cellCX(idx), BOARD_TOP - above * CELL + CELL / 2); above++; refilled.push(idx); }
        }
        // forge enhanced runes among the freshly-dropped runes — one per colour that just
        // cleared 5+ (so a big wood clear guarantees an enhanced wood in the next drop).
        if (enhanceEls && enhanceEls.length && refilled.length) {
            const pool = refilled.slice();
            for (const el of enhanceEls) {
                if (!pool.length) break;
                const idx = pool.splice(AC.rng.int(G.rng, 0, pool.length), 1)[0];
                const o = board[idx]; o.el = el; o.enhanced = true; o.gfx = null;
            }
        }
    }
    function enchantRandom(n) {
        const c = []; for (let i = 0; i < COLS * ROWS; i++) { const o = board[i]; if (o && !o.enhanced) c.push(i); }
        for (let k = 0; k < n && c.length; k++) { const j = AC.rng.int(G.rng, 0, c.length); board[c[j]].enhanced = true; c.splice(j, 1); }
    }

    // =================================================================
    // Input
    // =================================================================

    function boardPos(e) {
        const rect = canvas.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H };
    }
    function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
    function swapCells(a, b) { const tmp = board[a]; board[a] = board[b]; board[b] = tmp; }
    // A light, crisp "tick" per swap — a clean triangle blip, high-ish and very
    // short so it reads as a gentle tap, not a buzzy/noisy clack. Lightly pitched
    // by cell so a sweep still strums. `k` staggers multiple swaps in one frame.
    function swapTick(idx, k) {
        const f = 720 + cellCol(idx) * 24 + cellRow(idx) * 10;
        const fire = () => AC.audio.tone(f, 0.015, { type: 'triangle', volume: 0.04 });
        if (k) setTimeout(fire, k * 14); else fire();
    }
    function stepToward(from, to) {
        const nr = cellRow(from) + Math.sign(cellRow(to) - cellRow(from));
        const nc = cellCol(from) + Math.sign(cellCol(to) - cellCol(from));
        return nr * COLS + nc;
    }
    function dragTo(px, py) {
        if (!G.held) return;
        G.held.px = px; G.held.py = py;
        const target = cellAtPixel(px, py);
        let guard = 0, k = 0;
        while (G.held.cell !== target && guard++ < 12) {
            const next = stepToward(G.held.cell, target);
            swapCells(G.held.cell, next);
            swapTick(next, k++);
            G.held.cell = next;
            if (!G.held.moved) { G.held.moved = true; if (!G.spinOpen) G.spinTimer = effectiveSpinTime(); }
        }
        const o = board[G.held.cell];
        if (o) { o.x = px; o.y = py; o.scale = 1; }
    }
    function onPointerDown(e) {
        if (!shell.isPlaying()) return;
        markDirty();
        if (e.target.closest('button, a')) return;
        if (!e.target.closest('.stage-pad')) return;
        const p = boardPos(e);
        if (G.palette) {
            for (const r of paletteRects()) {
                if (!inRect(p, r)) continue;
                if (G.palette.exclude && r.el === G.palette.exclude) { if (e.cancelable) e.preventDefault(); return; }
                AC.audio.play('grab');
                G.palette.onPick(r.el);
                if (e.cancelable) e.preventDefault();
                return;
            }
            if (!inRect(p, palettePanelRect())) G.palette = null;   // tap outside cancels (card not consumed)
            if (e.cancelable) e.preventDefault();
            return;
        }
        if (G.shieldPick) {
            for (const r of shieldPickRects()) {
                if (!inRect(p, r)) continue;
                const sp = G.shieldPick; G.shieldPick = null;
                if (r.t.kind === 'shield') G.aiShields.splice(r.t.i, 1); else removeSlowStack();
                AC.audio.play('coin'); consumeCard(sp.i, sp.id);
                if (e.cancelable) e.preventDefault();
                return;
            }
            if (!inRect(p, shieldPickPanel())) G.shieldPick = null;   // cancel (card not consumed)
            if (e.cancelable) e.preventDefault();
            return;
        }
        // Sandbag "your powers": the top-left button toggles it (works during the draft too)
        if (G.mode === 'sandbox' && (G.phase === 'sanddraft' || G.phase === 'attack' || G.phase === 'sandatk')) {
            if (inRect(p, powersBtnRect())) { G.sandPowers = !G.sandPowers; G.sandPowerSel = null; markDirty(); if (e.cancelable) e.preventDefault(); return; }
            if (G.sandPowers) {
                for (const r of sandPowerRows()) {   // tap a row to expand / collapse its description
                    if (inRect(p, r)) { G.sandPowerSel = (G.sandPowerSel === r.i ? null : r.i); markDirty(); if (e.cancelable) e.preventDefault(); return; }
                }
                G.sandPowers = false; G.sandPowerSel = null; markDirty(); if (e.cancelable) e.preventDefault(); return;   // tap outside a row closes the panel
            }
        }
        // Sandbag draft: tap one of the three offered cards (board is locked until you choose)
        if (G.mode === 'sandbox' && G.phase === 'sanddraft' && G.sandDraft) {
            for (const r of sandDraftRects()) {
                if (inRect(p, r)) { AC.audio.unlock(); chooseSandCard(r.i); if (e.cancelable) e.preventDefault(); return; }
            }
            if (e.cancelable) e.preventDefault();
            return;
        }
        // tap a shield / played-card chip to read its full effect
        for (const ch of (G._rivalChips || []).concat(G._rivalUsed || [], G._youChips || [])) {
            if (inRect(p, ch)) { addFloat(ch.x + ch.w / 2, ch.y + 34, ch.label, '#cfe8ff', 15); AC.audio.unlock(); if (e.cancelable) e.preventDefault(); return; }
        }
        // Sandbag: press / long-press an enemy to inspect your restraint multipliers against it.
        if (G.mode === 'sandbox' && !G.held) {
            const ei = enemyAtPixel(p);
            if (ei >= 0) { setInspect(ei); if (e.cancelable) e.preventDefault(); return; }
        }
        if (G.resolving || G.held || G.countdown > 0 || (G.phase !== 'defense' && G.phase !== 'attack')) return;
        // Done your turn and waiting for the opponent? You can still browse your hand and
        // discard — just not play, draw or spin (that's next round).
        const waiting = onlineWaiting();
        if (p.y < BOARD_TOP) {
            if (G.spinOpen) { if (e.cancelable) e.preventDefault(); return; }   // spin window is open → cards locked, only the board is interactive
            // action row: when a card is selected it shows big Play / Discard buttons
            if (G.cardSel != null) {
                if (!waiting && inRect(p, playBtnRect())) { const i = G.cardSel; G.cardSel = null; AC.audio.unlock(); playCard(i); if (e.cancelable) e.preventDefault(); return; }
                if (inRect(p, discardBtnRect())) { const i = G.cardSel; G.cardSel = null; AC.audio.unlock(); discardCard(i); if (e.cancelable) e.preventDefault(); return; }
            } else if (!waiting) {
                if (G.phase === 'defense' && inRect(p, doneButtonRect())) { AC.audio.unlock(); if (G.online) submitDefense(); else startAttackPhase(); if (e.cancelable) e.preventDefault(); return; }
                if (canDrawMore() && inRect(p, drawMoreRect())) { AC.audio.unlock(); drawOneCard(); if (e.cancelable) e.preventDefault(); return; }
            }
            for (const base of handTileRects()) {
                if (inRect(p, base)) { AC.audio.unlock(); G.cardSel = (G.cardSel === base.i ? null : base.i); if (e.cancelable) e.preventDefault(); return; }
            }
            G.cardSel = null;   // tapped empty area → deselect
            return;
        }
        if (waiting) { if (e.cancelable) e.preventDefault(); return; }   // no spinning while waiting for the opponent
        if (G.phase !== 'attack') return;   // can only spin in the attack phase
        AC.audio.unlock();
        G.cardSel = null;   // starting a spin deselects any card (cards lock during the spin)
        const cell = cellAtPixel(p.x, p.y);
        G.held = { cell, px: p.x, py: p.y, moved: false };
        setInspect(null);   // grabbing a rune dismisses any restraint tooltip
        if (!G.spinOpen) G.spinTimer = effectiveSpinTime();   // spin window already counting → keep its clock
        const o = board[cell]; if (o) { o.x = p.x; o.y = p.y; }
        AC.audio.play('grab');
        if (e.cancelable) e.preventDefault();
    }
    function onPointerMove(e) {
        if (G.held) { markDirty(); dragTo(boardPos(e).x, boardPos(e).y); if (e.cancelable) e.preventDefault(); return; }
        if (G.mode === 'sandbox' && shell.isPlaying()) setInspect(enemyAtPixel(boardPos(e)));   // mouse hover (and touch drag) over enemies
    }
    function onPointerUp(e) {
        if (G.sandInspect != null && !(e && e.pointerType === 'mouse')) setInspect(null);   // touch/pen lift hides it; mouse keeps hovering
        if (!G.held) return;
        if (G.held.moved) {
            if (G.mode === 'sandbox' && G.sandAbil && G.sandAbil.freeArrange) { G.held = null; G.spinOpen = true; markDirty(); }   // sd_free: keep the window open, rearrange until the timer ends
            else startResolve();
        } else G.held = null;
    }

    // =================================================================
    // Cards
    // =================================================================

    function effectiveSpinTime() {
        if (G.mode === 'sandbox') {
            const ab = G.sandAbil || {};
            return Math.max(0.5, SAND.spinTime + (ab.spinBonusSec || 0));             // sd_time: +1s per stack
        }
        return Math.max(0.5, BALANCE.spinTime * (G.spinMultSelf || 1) * (G.spinMultOpp || 1));
    }
    // One persistent hand: deal once at the start, then draw a single new card each
    // round. Unplayed cards carry over (they no longer re-roll every phase).
    function curType() { return G.phase === 'defense' ? 'defense' : 'enhance'; }
    function pickWeighted(ids) {
        let total = 0; for (const id of ids) total += (CARDS[id].weight || 1);
        let x = AC.rng.float(G.rng, 0, total);
        for (const id of ids) { x -= (CARDS[id].weight || 1); if (x <= 0) return id; }
        return ids[ids.length - 1];
    }
    function drawFromPool(type) {
        if (G.hand.length >= DUEL.maxHand) return false;
        const id = pickWeighted(type === 'defense' ? DEF_IDS : ENH_IDS);
        G.hand.push(id);
        return true;
    }
    // Keep the "newest drawn" highlight pointing at the right card after the hand shifts.
    function adjustLastDrawn(removedIdx) {
        if (G.lastDrawn == null) return;
        if (removedIdx === G.lastDrawn) G.lastDrawn = null;
        else if (removedIdx < G.lastDrawn) G.lastDrawn--;
    }
    function dealStartingHand() { G.hand = []; drawFromPool('defense'); drawFromPool('defense'); drawFromPool('enhance'); drawFromPool('enhance'); G.lastDrawn = null; }
    function canDrawMore() {
        return (G.phase === 'defense' || G.phase === 'attack') && !G.resolving && !G.held && !G.palette && !G.shieldPick && !onlineWaiting() && !G.spinOpen && !(G.countdown > 0)
            && G.hand.length < DUEL.maxHand && G.energy >= DUEL.drawCost;
    }
    function drawOneCard() {
        if (!canDrawMore()) return;
        if (!drawFromPool(curType())) return;
        G.lastDrawn = G.hand.length - 1;   // only the single newest card is highlighted
        G.energy -= DUEL.drawCost;
        AC.audio.play('click');
        updateHud();
    }
    function discardCard(i) {
        if (i == null || i < 0 || i >= G.hand.length) return;
        G.hand.splice(i, 1);
        adjustLastDrawn(i);
        AC.audio.play('click');
        updateHud();
    }
    function playable(id) {   // some cards need a legal target
        const c = CARDS[id];
        if (c && (c.cat === 'breakRand' || c.cat === 'breakPick')) return G.aiShields.length > 0 || (G.spinMultOpp || 1) < 1;
        return true;
    }
    function cardPhaseOk(id) { return (CARDS[id].type === 'defense') === (G.phase === 'defense'); }
    function addShield(s) { G.youShields.push(s); }
    function applySlow() { G.mySlow = (G.mySlow || 0) + 1; if (G.online) G.online.slowOpp = (G.online.slowOpp || 0) + 1; else G.aiTimeMult = (G.aiTimeMult || 1) * 0.7; }   // offline: cramp the AI's spin time → smaller beam
    // Random-colour shields pick a non-heart colour you haven't already demanded / banned this
    // round, so stacking two "random colour" cards gives two distinct, useful constraints
    // (only falling back to a repeat once every attack colour is already covered).
    function randShieldEl(kind) {
        const used = new Set();
        for (const s of G.youShields) {
            if (!s) continue;
            if (kind === 'ban') { if (s.type === 'element' && s.mode === 'ban') (s.elements || []).forEach((e) => used.add(e)); }
            else if (s.type === 'enhancedEl' || (s.type === 'element' && s.mode === 'contains')) (s.elements || []).forEach((e) => used.add(e));
        }
        const pool = ATTACK_ELEMENTS.filter((e) => !used.has(e));
        const src = pool.length ? pool : ATTACK_ELEMENTS;
        return src[AC.rng.int(G.rng, 0, src.length)];
    }
    function playCard(i) {
        const id = G.hand[i];
        const c = id && CARDS[id];
        if (!c || G.resolving || G.held || G.spinOpen || G.energy < c.cost || !playable(id) || !cardPhaseOk(id)) return;
        switch (c.cat) {
            // --- defense shields ---
            case 'ban': addShield({ type: 'element', mode: 'ban', elements: [c.el] }); break;
            case 'need': addShield({ type: 'element', mode: 'contains', elements: [c.el] }); break;
            case 'banRand': addShield({ type: 'element', mode: 'ban', elements: [randShieldEl('ban')] }); break;
            case 'needRand': addShield({ type: 'element', mode: 'contains', elements: [randShieldEl('need')] }); break;
            case 'banPick': return openPick(i, id, 'rtShBanPick', (e) => addShield({ type: 'element', mode: 'ban', elements: [e] }));
            case 'needPick': return openPick(i, id, 'rtShBanPick', (e) => addShield({ type: 'element', mode: 'contains', elements: [e] }));
            case 'needEnhAny': addShield({ type: 'enhanced' }); break;
            case 'needEnhEl': addShield({ type: 'enhancedEl', elements: [c.el] }); break;
            case 'needEnhRand': addShield({ type: 'enhancedEl', elements: [randShieldEl('need')] }); break;
            case 'needEnhPick': return openPick(i, id, 'rtShBanPick', (e) => addShield({ type: 'enhancedEl', elements: [e] }));
            case 'comboMin': addShield({ type: 'combo', mode: 'min', n: c.n }); break;
            case 'comboMax': addShield({ type: 'combo', mode: 'max', n: c.n }); break;
            case 'firstMin': addShield({ type: 'firstWave', mode: 'min', n: c.n }); break;
            case 'firstMax': addShield({ type: 'firstWave', mode: 'max', n: c.n }); break;
            case 'slow': applySlow(); break;
            // --- attack ---
            case 'fast': G.spinMultSelf *= (1 / 0.7); break;
            case 'enchEl': enchantElement(c.el, 3); break;
            case 'enchRand': enchantRandom(3); break;
            case 'enchPick': return openPick(i, id, 'rtTransmuteFrom', (e) => enchantElement(e, 3));
            case 'transmute': applyTransmute(c.from, c.to); break;
            case 'transToPick': return openPick(i, id, 'rtTransmuteTo', (to) => applyTransmute(c.from, to), c.from);
            case 'transFromPick': return openPick(i, id, 'rtTransmuteFrom', (from) => applyTransmute(from, c.to), c.to);
            case 'transBoth': return openTransmute(i);
            case 'breakRand': { const tg = breakTargets(); if (tg.length) { const p = tg[AC.rng.int(G.rng, 0, tg.length)]; if (p.kind === 'shield') G.aiShields.splice(p.i, 1); else removeSlowStack(); } break; }
            case 'breakPick': return openShieldPick(i);
            default: break;
        }
        consumeCard(i, id);
    }
    function consumeCard(i, id) {
        G.energy -= CARDS[id].cost;
        if (i >= 0 && i < G.hand.length && G.hand[i] === id) { G.hand.splice(i, 1); adjustLastDrawn(i); }
        else { const k = G.hand.indexOf(id); if (k >= 0) { G.hand.splice(k, 1); adjustLastDrawn(k); } }
        if (CARDS[id].type === 'enhance') G.playedThisRound.push(id);   // your attack skills this round (also revealed to the rival online)
        AC.audio.play('gem');
        addFloat(W / 2, 150, cardName(id), accent(), 18);
        if (G.online) pushLive();   // reveal this card + the reshaped board to the opponent now
        updateHud();
    }
    function openPalette(opts) { G.palette = opts; markDirty(); }
    function openPick(i, id, title, effect, exclude) {
        openPalette({ title, els: ELEMENTS, exclude, onPick: (e) => { G.palette = null; effect(e); consumeCard(i, id); } });
    }
    function openTransmute(i) {
        const id = G.hand[i];
        openPalette({ title: 'rtTransmuteFrom', els: ELEMENTS, onPick: (from) => {
            openPalette({ title: 'rtTransmuteTo', els: ELEMENTS, exclude: from, onPick: (to) => { applyTransmute(from, to); consumeCard(i, id); } });
        } });
    }
    function openShieldPick(i) { if (breakTargets().length) { G.shieldPick = { i, id: G.hand[i] }; markDirty(); } }
    function slowStacks(mult) { mult = mult || 1; return mult >= 1 ? 0 : Math.max(1, Math.round(Math.log(mult) / Math.log(0.7))); }
    function removeSlowStack() { G.spinMultOpp = Math.min(1, (G.spinMultOpp || 1) / 0.7); }
    // things a Break card can remove: the rival's shields + each stack of its Shorten on you
    function breakTargets() {
        const out = G.aiShields.map((s, i) => ({ kind: 'shield', i, s, label: shieldLabel(s) }));
        const n = slowStacks(G.spinMultOpp);
        for (let k = 0; k < n; k++) out.push({ kind: 'time', label: t('rdTimeShort') });
        return out;
    }
    function enchantElement(el, n) {
        const c = []; for (let k = 0; k < COLS * ROWS; k++) { const o = board[k]; if (o && o.el === el && !o.enhanced) c.push(k); }
        for (let j = 0; j < n && c.length; j++) { const r = AC.rng.int(G.rng, 0, c.length); board[c[r]].enhanced = true; board[c[r]].gfx = null; c.splice(r, 1); }
    }
    function applyTransmute(fromEl, toEl) {
        for (let i = 0; i < COLS * ROWS; i++) { const o = board[i]; if (o && o.el === fromEl) { o.el = toEl; o.gfx = null; } }
        G.palette = null;
    }

    // =================================================================
    // Turn resolution
    // =================================================================

    function startResolve() {
        G.held = null;
        G.spinOpen = false;
        if (G.online) { G.preSpinBoard = serializeBoard(); net.updateRoom(room.code, { ['game.spin.' + G.online.myUid]: G.round }).catch(() => {}); }   // snapshot + "I'm spinning"
        G.resolving = true;
        G.resolve = { stage: 'pop', t: 0, combos: [], pending: [], popIndex: 0, wave: -1, enhNext: [] };
        beginCascade();
    }
    function beginCascade() {
        G.resolve.wave++;
        G.resolve.pending = findMatches();
        G.resolve.popIndex = 0;
        if (G.resolve.pending.length === 0) { finishResolve(); return; }
        popGroup();
    }
    function popGroup() {
        G.clearing.length = 0;
        if (G.resolve.popIndex >= G.resolve.pending.length) { applyGravity(G.resolve.enhNext); G.resolve.enhNext = []; G.resolve.stage = 'fall'; G.resolve.t = 0; return; }
        const g = G.resolve.pending[G.resolve.popIndex++];
        g.wave = G.resolve.wave;
        const big = g.cells.length >= CONFIG.bigThreshold;   // 5+ clear: forge an enhanced rune + fiercer sound/animation (both modes)
        let enh = 0;
        for (const idx of g.cells) { const o = board[idx]; if (o.enhanced) enh++; o.scale = 1; G.clearing.push(o); spawnClearBurst(o.x, o.y, g.el, big); board[idx] = null; }
        g.enhanced = enh;
        if (big) G.resolve.enhNext.push(g.el);   // forge an enhanced of this colour in the next drop
        G.resolve.combos.push(g);
        G.resolve.stage = 'pop'; G.resolve.t = 0;
        if (big) bigClearSound(); else comboSound(G.resolve.combos.length);   // 5+ gets a fiercer, electronic sting
    }
    function comboSound(n) { AC.audio.tone(430 + Math.min(n, 12) * 60, 0.09, { type: 'triangle', volume: 0.14 }); }
    function stepResolve(dt) {
        const R = G.resolve;
        R.t += dt;
        if (R.stage === 'pop') {
            const p = Math.min(1, R.t / CONFIG.popTime);
            for (const o of G.clearing) o.scale = 1 - p;
            if (R.t >= CONFIG.popTime) { R.stage = 'popGap'; R.t = 0; G.clearing.length = 0; }   // combo cleared; hold a beat
        } else if (R.stage === 'popGap') {
            if (R.t >= CONFIG.popGap) popGroup();   // next combo, or (when done) gravity → fall
        } else if (R.stage === 'fall') {
            if (R.t >= CONFIG.fallAnim) { R.stage = 'fallGap'; R.t = 0; }
        } else if (R.stage === 'fallGap') {
            if (R.t >= CONFIG.fallGap) beginCascade();   // pause after the drop before the next wave
        }
    }

    // --- Shields ---

    function shieldUnmet(shield, stats) {
        if (!shield) return false;
        switch (shield.type) {
            case 'enhanced': return stats.enhancedCleared <= 0;
            case 'enhancedEl': return !shield.elements.some((el) => (stats.enhancedEls && stats.enhancedEls.has(el)));
            case 'combo':
                if (shield.mode === 'min') return stats.combos < shield.n;
                if (shield.mode === 'max') return stats.combos > shield.n;
                if (shield.mode === 'exact') return stats.combos !== shield.n;
                return false;
            case 'firstWave':
                if (shield.mode === 'min') return stats.firstWave < shield.n;
                if (shield.mode === 'max') return stats.firstWave > shield.n;
                return false;
            case 'firstWaveMax': return stats.firstWave > shield.n;
            case 'element':
                if (shield.mode === 'ban') return shield.elements.some((el) => stats.elements.has(el));
                return !shield.elements.every((el) => stats.elements.has(el));
            default: return false;
        }
    }
    function shieldsBlock(shields, stats) { return shields.some((s) => shieldUnmet(s, stats)); }
    function sameShield(a, b) { return !!a && !!b && a.type === b.type && a.mode === b.mode && a.n === b.n && (a.elements || []).join(',') === (b.elements || []).join(','); }
    function shieldLabel(s) {
        if (!s) return '';
        const names = (s.elements || []).map((el) => t('el_' + el)).join('·');
        if (s.type === 'enhanced') return t('cwNeedEnhAny');
        if (s.type === 'enhancedEl') return t('cwNeedEnh', names);
        if (s.type === 'combo') return s.mode === 'max' ? t('cwComboMax', s.n) : t('cwComboMin', s.n);
        if (s.type === 'firstWave') return s.mode === 'max' ? t('cwFirstMax', s.n) : t('cwFirstMin', s.n);
        if (s.type === 'firstWaveMax') return t('cwFirstMax', s.n);
        if (s.type === 'element') return s.mode === 'ban' ? t('cwBan', names) : t('cwNeed', names);
        return '';
    }
    function oneShield(round) {
        const el = () => ATTACK_ELEMENTS[AC.rng.int(G.rng, 0, ATTACK_ELEMENTS.length)];
        switch (AC.rng.int(G.rng, 0, 6)) {
            case 0: return { type: 'enhanced' };
            case 1: return { type: 'combo', mode: 'min', n: 5 + Math.min(3, (round / 3) | 0) };
            case 2: return { type: 'combo', mode: 'max', n: 3 };
            case 3: return { type: 'firstWave', mode: 'min', n: 4 };
            case 4: return { type: 'element', mode: 'contains', elements: [el()] };
            default: return { type: 'element', mode: 'ban', elements: [el()] };
        }
    }
    function rollRivalShields(round) {
        if (round < 2) return [];                 // round 1 is free
        const count = round >= 6 ? 2 : 1;         // the rival stacks a 2nd shield later
        const out = [];
        for (let i = 0; i < count; i++) out.push(oneShield(round));
        return out;
    }
    // =================================================================
    // AI opponent (vs-AI): the rival has its own board + cards and really spins.
    // Difficulty scales the solver's search (how good its spins are), how skilfully it
    // reacts to your shields, and how often it mends / stacks shields.
    // =================================================================
    // ------------------------------------------------------------------------------------
    // AI difficulty parameters — the ONLY place to tune the rival. The rival plays from its
    // own hand/energy (dealt + drawn like yours), and reasons about card EFFECTS, so changing
    // card costs / counts / weights (the CARDS table) only changes the odds of what it draws,
    // never this logic. There is no artificial cap on how many cards / shields it plays — a
    // weaker level just chooses worse, not fewer.
    //   beamW / beamD   beam-search width × depth for the real spin at baseline spin time.
    //                   Tuned so with NO cards played, average combos land at ~2 (easy) /
    //                   ~4 (normal) / ~7 (hard). Fast cards grow it, your Shorten shrinks it.
    //   evalW / evalD   beam used only to JUDGE card plays. Bigger = it foresees more
    //                   accurately which shields it can out-spin vs. must break.
    //   skill           quality of its choices (card + target). 1 = always the best option;
    //                   lower = more often takes a weaker (but still helpful) play / target.
    // ------------------------------------------------------------------------------------
    const AI_LEVELS = {
        easy:   { beamW: 1,  beamD: 2,  evalW: 2, evalD: 4, skill: 0.2  },
        normal: { beamW: 3,  beamD: 5,  evalW: 3, evalD: 5, skill: 0.6  },
        hard:   { beamW: 10, beamD: 11, evalW: 6, evalD: 8, skill: 0.97 },
    };
    function aiCfg() { return AI_LEVELS[G.aiLevel] || AI_LEVELS.normal; }
    // lightweight board = array of { el, enhanced } | null (no gfx/shape — sim only)
    function simClone(a) { return a.map((o) => (o ? { el: o.el, enhanced: o.enhanced } : null)); }
    function simFromBoard(bd) { return bd.map((o) => (o ? { el: o.el, enhanced: !!o.enhanced } : null)); }
    function simMatchesOn(a) {
        const n = COLS * ROWS, matched = new Array(n).fill(false);
        const el = (r, c) => { const o = a[r * COLS + c]; return o ? o.el : null; };
        for (let r = 0; r < ROWS; r++) { let c = 0; while (c < COLS) { const e = el(r, c); let c2 = c; while (c2 < COLS && el(r, c2) === e && e != null) c2++; if (e != null && c2 - c >= 3) for (let k = c; k < c2; k++) matched[r * COLS + k] = true; c = Math.max(c2, c + 1); } }
        for (let c = 0; c < COLS; c++) { let r = 0; while (r < ROWS) { const e = el(r, c); let r2 = r; while (r2 < ROWS && el(r2, c) === e && e != null) r2++; if (e != null && r2 - r >= 3) for (let k = r; k < r2; k++) matched[k * COLS + c] = true; r = Math.max(r2, r + 1); } }
        const groups = [], seen = new Array(n).fill(false);
        for (let idx = 0; idx < n; idx++) {
            if (!matched[idx] || seen[idx] || !a[idx]) continue;
            const e = a[idx].el, stack = [idx], cells = []; seen[idx] = true;
            while (stack.length) { const cur = stack.pop(); cells.push(cur); const r = cellRow(cur), c = cellCol(cur);
                for (const nb of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) { if (nb[0] < 0 || nb[0] >= ROWS || nb[1] < 0 || nb[1] >= COLS) continue; const ni = nb[0] * COLS + nb[1]; if (matched[ni] && !seen[ni] && a[ni] && a[ni].el === e) { seen[ni] = true; stack.push(ni); } } }
            groups.push({ el: e, cells });
        }
        return groups;
    }
    function simGravityOn(a, enhanceEls) {
        const refilled = [];
        for (let c = 0; c < COLS; c++) {
            let write = ROWS - 1;
            for (let r = ROWS - 1; r >= 0; r--) { const idx = r * COLS + c; if (a[idx] != null) { const w = write * COLS + c; if (w !== idx) { a[w] = a[idx]; a[idx] = null; } write--; } }
            for (let r = write; r >= 0; r--) { a[r * COLS + c] = { el: randomEl(), enhanced: false }; refilled.push(r * COLS + c); }
        }
        if (enhanceEls && enhanceEls.length) {
            const pool = refilled.slice();
            for (const el of enhanceEls) { if (!pool.length) break; const idx = pool.splice(AC.rng.int(G.rng, 0, pool.length), 1)[0]; a[idx].el = el; a[idx].enhanced = true; }
        }
    }
    // Resolve a spin on a sim board (mutates it); returns stats + damage/heal like computeSpinResult.
    function simResolve(a) {
        let n = 0, firstWave = 0, enhanced = 0, dmg = 0, heal = 0, wave = 0;
        const elements = new Set(), enhancedEls = new Set();
        for (let guard = 0; guard < 40; guard++) {
            const groups = simMatchesOn(a); if (!groups.length) break;
            const enhNext = [];
            for (const g of groups) {
                let e = 0; for (const i of g.cells) if (a[i] && a[i].enhanced) e++;
                n++; if (wave === 0) firstWave++; enhanced += e; elements.add(g.el); if (e > 0) enhancedEls.add(g.el);
                const count = g.cells.length + e * (BALANCE.enhancedMult - 1);
                if (g.el === 'heart') heal += count * BALANCE.heartHeal; else dmg += count * BALANCE.baseDamage;
                if (g.cells.length >= CONFIG.bigThreshold) enhNext.push(g.el);
                for (const i of g.cells) a[i] = null;
            }
            simGravityOn(a, enhNext); wave++;
        }
        const comboMult = n > 0 ? 1 + BALANCE.comboStep * (n - 1) : 0;
        return { stats: { combos: n, firstWave, enhancedCleared: enhanced, elements, enhancedEls }, dmg: Math.round(dmg * comboMult), heal: Math.round(heal * comboMult) };
    }
    function aiFillBoard() {
        const a = new Array(COLS * ROWS);
        for (let i = 0; i < a.length; i++) a[i] = { el: randomEl(), enhanced: false };
        let guard = 0, g = simMatchesOn(a);
        while (g.length && guard++ < 200) { for (const grp of g) for (const i of grp.cells) a[i].el = randomEl(); g = simMatchesOn(a); }
        return a;
    }
    function neighborsOf(idx) { const r = cellRow(idx), c = cellCol(idx), out = []; if (r > 0) out.push(idx - COLS); if (r < ROWS - 1) out.push(idx + COLS); if (c > 0) out.push(idx - 1); if (c < COLS - 1) out.push(idx + 1); return out; }
    function simEnchant(a, n) { const c = []; for (let i = 0; i < a.length; i++) if (a[i] && !a[i].enhanced) c.push(i); for (let k = 0; k < n && c.length; k++) { const j = AC.rng.int(G.rng, 0, c.length); a[c[j]].enhanced = true; c.splice(j, 1); } }
    function simTransmuteTo(a, to, n) { const c = []; for (let i = 0; i < a.length; i++) if (a[i] && a[i].el !== to) c.push(i); for (let k = 0; k < n && c.length; k++) { const j = AC.rng.int(G.rng, 0, c.length); a[c[j]].el = to; c.splice(j, 1); } }
    function simTransmuteAll(a, from, to) { for (let i = 0; i < a.length; i++) if (a[i] && a[i].el === from) a[i].el = to; }   // mirror playCard's "all of a colour → another"
    function simEnchantEl(a, el, n) { for (let i = 0; i < a.length && n > 0; i++) if (a[i] && a[i].el === el && !a[i].enhanced) { a[i].enhanced = true; n--; } }
    // Beam-search core: keep the `width` best drag-path prefixes at each of `depth` steps,
    // scoring each prefix by the spin it would produce (combos first, then damage, never a
    // shield-blocked one). Returns the best spin result + its settled board (board untouched).
    function beamSpin(a, youShields, width, depth) {
        const N = COLS * ROWS;
        let cur = [];
        for (let s = 0; s < N; s++) cur.push({ board: simClone(a), pos: s });
        let bestKey = -Infinity, bestRes = null, bestSettled = null;
        for (let d = 0; d < depth; d++) {
            const scored = [];
            for (const node of cur) {
                for (const nx of neighborsOf(node.pos)) {
                    const placed = simClone(node.board);
                    const tmp = placed[node.pos]; placed[node.pos] = placed[nx]; placed[nx] = tmp;
                    const settled = simClone(placed);
                    const res = simResolve(settled);   // settled now holds the post-spin board
                    const blocked = shieldsBlock(youShields, res.stats);
                    const key = (blocked ? -1e9 : 0) + res.stats.combos * 1000 + res.dmg;
                    if (key > bestKey) { bestKey = key; bestRes = res; bestSettled = settled; }
                    scored.push({ key, board: placed, pos: nx });
                }
            }
            if (!scored.length) break;
            scored.sort((x, y) => y.key - x.key);
            cur = scored.slice(0, width).map((e) => ({ board: e.board, pos: e.pos }));
        }
        return { res: bestRes, settled: bestSettled };
    }
    // Beam size tracks the AI's effective spin time: timeMult = 1 is the calibrated baseline
    // (no cards / no Shorten → ~2/4/7 combos); your Shorten ×0.7 each shrinks it, the AI's
    // Fast ×1/0.7 each grows it. Clamped so stacks can't explode the search (depth floor 2
    // lets the easy level's short spin actually land fewer combos).
    function beamDims(wBase, dBase, timeMult) {
        const m = Math.max(0.3, Math.min(2.2, timeMult || 1));
        return { width: Math.max(1, Math.round(wBase * m)), depth: Math.max(2, Math.round(dBase * (0.7 + 0.3 * m))) };
    }
    // The real spin: run the difficulty beam at the AI's current spin time, write the settled
    // board back to `a` (so the mini-board shows exactly the result), return that same rollout.
    function aiSolve(a, youShields) {
        const cfg = aiCfg();
        const { width, depth } = beamDims(cfg.beamW || 4, cfg.beamD || 6, G.aiTimeMult || 1);
        const r = beamSpin(a, youShields, width, depth);
        if (r.settled) for (let i = 0; i < a.length; i++) a[i] = r.settled[i];
        return r.res || simResolve(a);
    }
    // Judge a hypothetical spin from board `a` against `shields` at spin-time `timeMult`.
    // Returns an expected-value scalar (a blocked spin is awful). Used to rank card plays.
    function aiEval(a, shields, timeMult) {
        const cfg = aiCfg();
        const { width, depth } = beamDims(cfg.evalW || 4, cfg.evalD || 6, timeMult);
        const r = beamSpin(simClone(a), shields, Math.max(2, width), Math.max(4, depth));
        if (!r.res) return 0;
        const blocked = shieldsBlock(shields, r.res.stats);
        return blocked ? -1e6 + r.res.stats.combos : r.res.dmg + r.res.heal * 0.3;
    }
    // Concrete ways the AI could play one attack card `id` from the state (board a, your
    // shields, spin-time timeMult). For cards with a target choice it enumerates options so
    // the greedy picks the best. Each option = { board, shields, timeMult }.
    function aiCardOptions(id, a, shields, timeMult) {
        const c = CARDS[id]; if (!c) return [];
        const opts = [];
        const boardOpt = (mut) => { const b = simClone(a); mut(b); return { board: b, shields, timeMult }; };
        switch (c.cat) {
            case 'fast': opts.push({ board: a, shields, timeMult: timeMult / 0.7 }); break;
            case 'breakRand': case 'breakPick':
                for (let i = 0; i < shields.length; i++) opts.push({ board: a, shields: shields.slice(0, i).concat(shields.slice(i + 1)), timeMult });
                if (timeMult < 1) opts.push({ board: a, shields, timeMult: timeMult / 0.7 });   // break can also undo a Shorten
                break;
            case 'enchRand': opts.push(boardOpt((b) => simEnchant(b, 3))); break;
            case 'enchEl': opts.push(boardOpt((b) => simEnchantEl(b, c.el, 3))); break;
            case 'enchPick': for (const el of ELEMENTS) opts.push(boardOpt((b) => simEnchantEl(b, el, 3))); break;
            case 'transmute': opts.push(boardOpt((b) => simTransmuteAll(b, c.from, c.to))); break;
            case 'transToPick': for (const to of ELEMENTS) if (to !== c.from) opts.push(boardOpt((b) => simTransmuteAll(b, c.from, to))); break;
            case 'transFromPick': for (const from of ELEMENTS) if (from !== c.to) opts.push(boardOpt((b) => simTransmuteAll(b, from, c.to))); break;
            case 'transBoth': {   // pick the AI's most-abundant colour as source, try each target
                const cnt = {}; for (const o of a) if (o) cnt[o.el] = (cnt[o.el] || 0) + 1;
                const from = ELEMENTS.slice().sort((x, y) => (cnt[y] || 0) - (cnt[x] || 0))[0];
                for (const to of ELEMENTS) if (to !== from) opts.push(boardOpt((b) => simTransmuteAll(b, from, to)));
                break;
            }
            default: break;
        }
        return opts;
    }
    // --- the rival's own deck / hand (mirrors yours; hidden from you) ---
    function aiDealStartingHand() { G.aiHand = []; for (let i = 0; i < 2; i++) G.aiHand.push(pickWeighted(DEF_IDS)); for (let i = 0; i < 2; i++) G.aiHand.push(pickWeighted(ENH_IDS)); }
    function aiDrawOne(type) {
        if (G.aiHand.length >= DUEL.maxHand || G.aiEnergy < DUEL.drawCost) return false;
        G.aiHand.push(pickWeighted(type === 'defense' ? DEF_IDS : ENH_IDS)); G.aiEnergy -= DUEL.drawCost; return true;
    }
    function aiMakeRoom(type) {   // drop one card to cycle: prefer the other phase's, else the priciest
        if (G.aiHand.length < DUEL.maxHand) return;
        let drop = G.aiHand.findIndex((id) => CARDS[id].type !== type);
        if (drop < 0) drop = G.aiHand.reduce((m, id, i) => (CARDS[id].cost > CARDS[G.aiHand[m]].cost ? i : m), 0);
        G.aiHand.splice(drop, 1);
    }
    // Draw a little to vary its options: keep drawing while it has no affordable card of this
    // phase, plus a small tendency for extra variety — but always leave energy to actually play.
    function aiDraw(type) {
        let guard = 0;
        while (guard++ < 6 && G.aiEnergy > DUEL.drawCost + 2) {
            const canAct = G.aiHand.some((id) => CARDS[id].type === type && CARDS[id].cost <= G.aiEnergy);
            if (canAct && AC.rng.float(G.rng, 0, 1) > 0.35) break;
            aiMakeRoom(type);
            if (!aiDrawOne(type)) break;
        }
    }
    // Defense-card value given your board: demand the colour you're short on, forbid the one
    // you're flooded with, prize hard combo / first-wave / enhanced gates. ~0 means "useless".
    function aiDefenseValue(id, cnt, round) {
        const c = CARDS[id]; if (!c || c.type !== 'defense') return { v: 0 };
        const scarce = ATTACK_ELEMENTS.slice().sort((x, y) => cnt[x] - cnt[y]);
        const low = scarce[0], high = scarce[scarce.length - 1], tot = ROWS * COLS;
        switch (c.cat) {
            case 'need': return { v: 40 + (tot / 6 - cnt[c.el]) * 6, el: c.el };
            case 'ban': return { v: 40 + (cnt[c.el] - tot / 6) * 6, el: c.el };
            case 'needRand': case 'needPick': return { v: 55, el: low };
            case 'banRand': case 'banPick': return { v: 55, el: high };
            case 'needEnhAny': return { v: 60 };
            case 'needEnhEl': return { v: 58, el: c.el };
            case 'needEnhRand': case 'needEnhPick': return { v: 62, el: low };
            case 'comboMin': return { v: 35 + c.n * 9 };
            case 'firstMax': return { v: 80 - c.n * 10 };
            case 'slow': return { v: 48 + Math.min(12, round * 2) };
            default: return { v: 0 };
        }
    }
    function defenseShield(id, el) {   // the shield a defense card lays on you (el resolved for pick/rand)
        const c = CARDS[id];
        switch (c.cat) {
            case 'need': case 'needRand': case 'needPick': return { type: 'element', mode: 'contains', elements: [el || c.el] };
            case 'ban': case 'banRand': case 'banPick': return { type: 'element', mode: 'ban', elements: [el || c.el] };
            case 'needEnhAny': return { type: 'enhanced' };
            case 'needEnhEl': case 'needEnhRand': case 'needEnhPick': return { type: 'enhancedEl', elements: [el || c.el] };
            case 'comboMin': return { type: 'combo', mode: 'min', n: c.n };
            case 'firstMax': return { type: 'firstWave', mode: 'max', n: c.n };
            default: return null;
        }
    }

    // Defense: refill energy, draw a little, then play defense cards FROM ITS HAND onto you —
    // shields that read off your board (demand a scarce colour, forbid a flooded one, gate
    // combos / first-wave / enhanced) plus Shorten. No cap: it keeps laying worthwhile shields
    // while energy lasts; a weaker level just picks worse cards / targets. Decided now, hidden,
    // revealed when you reach the attack phase. Returns { shields, hastenStacks }.
    function aiPlanDefense(round) {
        const cfg = aiCfg();
        G.aiEnergy = DUEL.energy;
        aiDraw('defense');
        const shields = []; let hastenStacks = 0;
        for (let guard = 0; guard < 8; guard++) {
            const cnt = {}; for (const e of ELEMENTS) cnt[e] = 0;
            for (let i = 0; i < COLS * ROWS; i++) { const o = board[i]; if (o) cnt[o.el]++; }
            const cands = [];
            for (let h = 0; h < G.aiHand.length; h++) {
                const id = G.aiHand[h], c = CARDS[id];
                if (!c || c.type !== 'defense' || c.cost > G.aiEnergy) continue;
                const val = aiDefenseValue(id, cnt, round);
                if (val.v > 0) cands.push({ h, id, v: val.v, el: val.el });
            }
            if (!cands.length) break;
            cands.sort((x, y) => y.v - x.v);
            const pick = (AC.rng.float(G.rng, 0, 1) < cfg.skill) ? cands[0] : cands[AC.rng.int(G.rng, 0, cands.length)];
            const id = pick.id, c = CARDS[id];
            if (c.cat === 'slow') { hastenStacks++; }
            else {
                let el = pick.el;
                if (el && AC.rng.float(G.rng, 0, 1) > cfg.skill) el = ATTACK_ELEMENTS[AC.rng.int(G.rng, 0, ATTACK_ELEMENTS.length)];   // weak: wrong target
                let s = defenseShield(id, el);
                if (s && el && shields.some((o) => sameShield(o, s))) {   // colour already covered → shift to a free one, else drop
                    const free = ATTACK_ELEMENTS.map((e) => defenseShield(id, e)).filter((x) => x && !shields.some((o) => sameShield(o, x)));
                    s = free.length ? free[AC.rng.int(G.rng, 0, free.length)] : null;
                }
                if (s && !shields.some((o) => sameShield(o, s))) shields.push(s);
            }
            G.aiEnergy -= c.cost; G.aiHand.splice(pick.h, 1);
            // stop once we've spent most of our energy on defense (leave a little slack)
            if (G.aiEnergy < 2) break;
        }
        return { shields, hastenStacks };
    }

    // --- Damage / duel flow ---

    function computeSpinResult(combos) {
        const n = combos.length;
        const stats = { combos: n, firstWave: 0, enhancedCleared: 0, elements: new Set(), enhancedEls: new Set() };
        if (n === 0) return { dmg: 0, heal: 0, n: 0, blocked: false };
        const comboMult = 1 + BALANCE.comboStep * (n - 1);
        let dmg = 0, heal = 0;
        for (const g of combos) {
            if (g.wave === 0) stats.firstWave++;
            stats.enhancedCleared += (g.enhanced || 0);
            if (g.enhanced > 0) stats.enhancedEls.add(g.el);
            stats.elements.add(g.el);
            const count = g.cells.length + (g.enhanced || 0) * (BALANCE.enhancedMult - 1);
            if (g.el === 'heart') { heal += count * BALANCE.heartHeal; continue; }
            dmg += count * BALANCE.baseDamage;
        }
        const blocked = shieldsBlock(G.aiShields, stats);
        const total = blocked ? 0 : dmg * comboMult * (G.empowerNext || 1);
        return { dmg: Math.round(total), heal: Math.round(heal * comboMult), n, blocked };
    }
    function finishResolve() {
        if (G.mode === 'sandbox') { finishResolveSandbox(); return; }
        const { dmg, heal, n, blocked } = computeSpinResult(G.resolve.combos);
        if (G.online) {
            if (n > 0) {
                if (heal > 0) addFloat(W / 2, BOARD_TOP - 40, '+' + heal, ELEMENT_COLORS.heart, 20);
                if (blocked) { addFloat(W / 2, 96, t('rtBlocked'), '#9fe0ff', 22); AC.audio.play('empty'); }
                else if (dmg > 0) { addFloat(W / 2, 92, '-' + dmg, '#ff8a8a', 32); spawnDuelProjectiles(G.resolve.combos); }
                addFloat(W / 2, 132, t('rtCombo', n), accent(), 18);
            }
            G.empowerNext = 1;
            G.cardSel = null; G.palette = null;
            G.resolving = false; G.resolve = null;
            G.online.sub = 'waitAtk';
            if (!blocked && dmg > 0) G.aiHp = Math.max(0, G.aiHp - dmg);   // optimistic: you see your hit land now
            if (heal > 0) G.youHp = Math.min(G.youMaxHp, G.youHp + heal);
            submitAttack(dmg, heal);
            updateHud();
            return;
        }
        if (n > 0) {
            if (heal > 0) { G.youHp = Math.min(G.youMaxHp, G.youHp + heal); addFloat(W / 2, BOARD_TOP - 40, '+' + heal, ELEMENT_COLORS.heart, 20); }
            if (blocked) { addFloat(W / 2, 96, t('rtBlocked'), '#9fe0ff', 22); AC.audio.play('empty'); }
            else if (dmg > 0) { G.aiHp -= dmg; G.score = Math.min(CONFIG.scoreCap, G.score + dmg); addFloat(W / 2, 92, '-' + dmg, '#ff8a8a', 32); spawnDuelProjectiles(G.resolve.combos); }
            addFloat(W / 2, 132, t('rtCombo', n), accent(), 18);
        }
        if (!blocked && dmg > 0) recordDuelSpin(dmg);   // best single-hit (vs-computer)
        G.empowerNext = 1;
        G.cardSel = null; G.palette = null;
        G.resolving = false; G.resolve = null;
        if (G.aiHp <= 0) { G.aiHp = 0; updateHud(); duelOver(true); return; }
        G.phase = 'ai';
        G.aiStatus = 'spin';   // the rival is now thinking / spinning
        aiPlayCards();          // reveal its cards + reshaped board immediately; it spins after aiThink
        G.aiTimer = DUEL.aiThink;
        updateHud();
    }
    // Step 1 (runs the moment the rival's turn begins): it refills energy, draws, then plays
    // attack cards FROM ITS HAND. Each step it simulates every way it could play each affordable
    // card — break one of your shields, transmute / enchant its own board, or Fast to spin
    // longer (bigger beam) — and plays the one that most raises its expected damage. No cap:
    // it keeps spending while plays help; a weaker level more often takes a weaker helpful
    // play / target. Revealed immediately so you see the cards + reshaped board before it spins.
    function aiPlayCards() {
        const cfg = aiCfg();
        G.aiPlayed = [];
        if (!G.aiBoard) G.aiBoard = aiFillBoard();
        G.aiEnergy = DUEL.energy;
        aiDraw('enhance');
        let a = simFromBoard(G.aiBoard);
        let shields = G.youShields.slice();
        let timeMult = G.aiTimeMult || 1;          // includes your Shorten, applied in defense
        for (let guard = 0; guard < 12; guard++) {
            const base = aiEval(a, shields, timeMult);
            const cands = [];
            for (let h = 0; h < G.aiHand.length; h++) {
                const id = G.aiHand[h], c = CARDS[id];
                if (!c || c.type !== 'enhance' || c.cost > G.aiEnergy) continue;
                let bestOpt = null, bestG = -Infinity;
                for (const opt of aiCardOptions(id, a, shields, timeMult)) {
                    const g = aiEval(opt.board, opt.shields, opt.timeMult) - base;
                    if (g > bestG) { bestG = g; bestOpt = opt; }
                }
                if (bestOpt) cands.push({ h, id, opt: bestOpt, g: bestG });
            }
            const minGain = base > 0 ? base * 0.12 + 10 : 1;
            const worth = cands.filter((x) => x.g >= minGain);
            if (!worth.length) break;
            worth.sort((x, y) => y.g - x.g);
            const pick = (AC.rng.float(G.rng, 0, 1) < cfg.skill) ? worth[0] : worth[AC.rng.int(G.rng, 0, worth.length)];
            a = pick.opt.board; shields = pick.opt.shields; timeMult = pick.opt.timeMult;
            G.aiEnergy -= CARDS[pick.id].cost; G.aiPlayed.push(pick.id); G.aiHand.splice(pick.h, 1);
        }
        G.aiBoard = a;              // reshaped board shown now (card effects visible before the spin)
        G.youShields = shields;     // shields it broke are gone for the imminent spin + block check
        G.aiTimeMult = timeMult;    // Fast cards it played grow its spin; broken Shorten restored it
        updateHud(); markDirty();
    }
    // Step 2 (after a short think): it actually spins, settling its board, then strikes.
    function aiSpin() {
        if (!G.aiBoard) G.aiBoard = aiFillBoard();
        const res = aiSolve(G.aiBoard, G.youShields);   // mutates G.aiBoard to the settled result
        G.aiStatus = 'done';
        const blocked = shieldsBlock(G.youShields, res.stats);
        if (res.heal > 0) { G.aiHp = Math.min(G.aiMaxHp, G.aiHp + res.heal); addFloat(W / 2, 48, '+' + res.heal, ELEMENT_COLORS.heart, 18); }
        if (blocked) {
            addFloat(W / 2, BOARD_TOP - 70, t('rtBlocked'), '#9fe0ff', 22);
            AC.audio.play('empty');
        } else if (res.dmg > 0) {
            G.youHp -= res.dmg; G.shake = 0.4;
            addFloat(W / 2, BOARD_TOP - 70, '-' + res.dmg, '#ff6b6b', 24);
            if (res.stats.combos) addFloat(W / 2, BOARD_TOP - 44, t('rtCombo', res.stats.combos), accent(), 16);
            AC.audio.play('rock');
        }
        updateHud();
        if (G.youHp <= 0) { G.youHp = 0; updateHud(); duelOver(false); return; }
        G.phase = 'resolved'; G.resolveHold = DUEL.resolvePause;   // hold so the exchange is readable
    }
    // Defense phase: play shields on yourself; the rival "plays its defense" (the
    // shields your spin must break). Then "To attack" → the attack phase.
    function startDefensePhase() {
        G.phase = 'defense';
        G.energy = DUEL.energy;
        G.youShields = [];
        G.cardSel = null;
        G.aiTimeMult = 1;
        G.mySlow = 0;
        G.spinMultSelf = 1;
        G.spinMultOpp = 1;
        G.empowerNext = 1;
        G.phaseTimer = G.phaseMax = DUEL.phaseTimeDef;
        G.lastDrawn = null;
        G.spinOpen = false;
        G.playedThisRound = [];   // last round's attack-card chips clear now (both sides)
        G.aiPlayed = [];
        if (G.online) { G.online.sub = 'def'; G.online.strike = null; G.online.slowOpp = 0; G.online.phaseDeadline = Date.now() + DUEL.phaseTimeDef * 1000; G.aiShields = []; G.online.oppLastCards = []; net.updateRoom(room.code, { ['game.played.' + G.online.myUid]: [] }).catch(() => {}); pushMyBoard(); updateHud(); return; }
        if (!G.aiBoard) G.aiBoard = aiFillBoard();
        G.aiStatus = '';
        G.aiPlan = aiPlanDefense(G.round);   // decided now but hidden; revealed when you reach the attack phase (like online)
        G.aiShields = [];
        G.spinMultOpp = 1;
        updateHud();
    }
    function startAttackPhase() {
        G.phase = 'attack';
        G.energy = DUEL.energy;
        G.cardSel = null;
        G.spinMultSelf = 1;
        G.phaseTimer = G.phaseMax = DUEL.phaseTimeAtk;
        G.playedThisRound = [];
        G.preSpinBoard = null;
        G.lastDrawn = null;
        G.spinOpen = false;
        if (G.online) { G.online.sub = 'atk'; G.online.phaseDeadline = Date.now() + DUEL.phaseTimeAtk * 1000; pushLive(); updateHud(); return; }
        if (G.aiPlan) { G.aiShields = G.aiPlan.shields; G.spinMultOpp = Math.pow(0.7, G.aiPlan.hastenStacks || 0); G.aiPlan = null; }   // reveal the rival's defense now
        updateHud();
    }
    // Phase clock ran out: defense → go attack; attack (not yet spinning) → open the
    // spin window (the player can still spin within the spin time; doing nothing = 0 dmg).
    function onPhaseTimeout() {
        if (G.online) {
            if (G.phase === 'defense') { submitDefense(); return; }
            if (G.phase === 'attack') openSpinWindow();
            return;
        }
        if (G.phase === 'defense') { startAttackPhase(); return; }
        if (G.phase === 'attack') openSpinWindow();
    }
    // Attack clock ran out without a spin: don't forfeit — start the spin clock so the
    // player can still spin within the spin window. Doing nothing resolves to 0 damage.
    function openSpinWindow() {
        if (G.spinOpen || G.held || G.resolving) return;
        G.cardSel = null; G.palette = null; G.shieldPick = null;
        G.spinOpen = true;
        G.spinTimer = effectiveSpinTime();
        if (G.online) G.online.spinOpenAt = Date.now();   // wall clock, for the backgrounded-tab safety net
        addFloat(W / 2, 150, t('rdSpinNow'), '#ffcf5a', 20);
        AC.audio.play('grab');
        updateHud();
    }
    // Spell out why the match ended (KO / HP at round limit / forfeit / draw).
    function reasonText(win, draw, reasonKey) {
        if (reasonKey === 'forfeit') return t('rdReasonForfeit');
        const youKo = G.youHp <= 0, aiKo = G.aiHp <= 0;
        if (draw) return (youKo && aiKo) ? t('rdReasonDoubleKo') : t('rdReasonTimeDraw');
        if (youKo || aiKo) return win ? t('rdReasonKoWin') : t('rdReasonKoLose');
        return win ? t('rdReasonHpWin') : t('rdReasonHpLose');   // nobody at 0 → decided by HP at the round cap
    }
    function duelOver(win, draw, reasonKey) {
        if (G.phase === 'over') return;
        G.phase = 'over';
        const wasOnline = !!G.online;
        G.online = null;
        setOnlineBtnEnabled(true);   // match ended → the Online button works again
        if (shell.syncButtons) shell.syncButtons();   // re-enable pause/restart after an online match
        const reason = reasonText(win, draw, reasonKey);
        if (wasOnline) {
            // Online: show the result and drop back to the in-room pairing screen so the
            // host can start a rematch in the same room (room stays; cleaned on leave/GC).
            lobbyResult = draw ? t('rdDrawGame') : (win ? t('rdYouWin') : t('rdYouLose'));
            lobbyReason = reason;
            AC.audio.play(win && !draw ? 'levelup' : 'gameover');
            openLobby();
        } else {
            if (win && !draw) recordAiWin(G.round);   // fewest-rounds best (vs-AI only)
            shell.gameOver({ score: 0, win: win, meta: { round: G.round, win, draw: !!draw, reason } });
            updateHud();
        }
    }

    function addFloat(x, y, text, color, size) { G.floats.push({ x, y, text, color, size: size || 18, t: 0, life: 1.4 }); }

    // --- attack projectiles + per-element audio (shared by both modes) ---
    // Each element has its own launch/impact pitch so a multi-colour spin sounds layered.
    const ELEMENT_TONE = { fire: 300, water: 430, wood: 360, light: 560, dark: 250, yao: 490, steel: 200, heart: 470 };
    function playLaunchSound(el) {
        const f = ELEMENT_TONE[el] || 360;
        AC.audio.tone(f, 0.08, { type: 'square', slideTo: f * 1.7, volume: 0.08 });
    }
    function playHitSound(el) {
        const f = ELEMENT_TONE[el] || 360;
        AC.audio.tone(f * 0.9, 0.11, { type: 'sawtooth', slideTo: f * 0.5, volume: 0.13 });
    }
    // A fierce, electronic sting for a big (5+) clear — distinct from the per-combo blip.
    function bigClearSound() {
        AC.audio.tone(360, 0.18, { type: 'sawtooth', slideTo: 1300, volume: 0.18 });
        setTimeout(() => AC.audio.tone(820, 0.12, { type: 'square', volume: 0.1 }), 40);
    }
    function launchProjectile(x0, y0, x1, y1, el, onHit) {
        G.projectiles.push({ x: x0, y: y0, x0, y0, x1, y1, el, color: shade(ELEMENT_COLORS[el] || '#ccc', 0.4), t: 0, dur: 0.17, onHit });
        playLaunchSound(el);
        markDirty();
    }
    function tickProjectiles(dt) {
        for (let i = G.projectiles.length - 1; i >= 0; i--) {
            const p = G.projectiles[i];
            p.t += dt;
            const k = Math.min(1, p.t / p.dur);
            p.x = p.x0 + (p.x1 - p.x0) * k; p.y = p.y0 + (p.y1 - p.y0) * k;
            if (k >= 1) { const cb = p.onHit; G.projectiles.splice(i, 1); if (cb) cb(); }
        }
        if (G.projectiles.length) markDirty();
    }
    // --- clear burst: a small "magic pop" of sparks at each cleared rune (both modes) ---
    // Cosmetic only (uses Math.random, never G.rng), so it can't shift gameplay determinism, and
    // it lives outside the resolve state machine, so it never changes the clear rhythm. A 5+ clear
    // adds a quick expanding ring so the special clear reads differently from a plain one.
    function spawnClearBurst(x, y, el, big) {
        const col = shade(ELEMENT_COLORS[el] || '#ccc', 0.4);
        const n = big ? 11 : 6;
        for (let i = 0; i < n; i++) {
            const ang = Math.random() * PI2, sp = (big ? 80 : 55) * (0.5 + Math.random());
            G.particles.push({
                x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t: 0,
                life: (big ? 0.42 : 0.32) * (0.8 + Math.random() * 0.4),
                r: (big ? 3 : 2.2) * (0.7 + Math.random() * 0.6), color: col, glow: big ? 10 : 6,
            });
        }
        if (big) G.particles.push({ ring: true, x, y, t: 0, life: 0.34, r0: CONFIG.orbRadius * 0.3, r1: CONFIG.orbRadius * 1.15, color: shade(ELEMENT_COLORS[el] || '#ccc', 0.55), glow: 12 });
    }
    function tickParticles(dt) {
        for (let i = G.particles.length - 1; i >= 0; i--) {
            const p = G.particles[i];
            p.t += dt;
            if (!p.ring) { p.x += p.vx * dt; p.y += p.vy * dt; const f = Math.max(0, 1 - 2.6 * dt); p.vx *= f; p.vy *= f; }
            if (p.t >= p.life) G.particles.splice(i, 1);
        }
        if (G.particles.length) markDirty();
    }
    function drawParticles() {
        if (!G.particles.length) return;
        ctx.save();
        for (const p of G.particles) {
            const k = p.t / p.life, a = Math.max(0, 1 - k);
            if (p.ring) {
                ctx.globalAlpha = a * 0.6; ctx.strokeStyle = p.color; ctx.lineWidth = 2;
                ctx.shadowColor = p.color; ctx.shadowBlur = p.glow;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * k, 0, PI2); ctx.stroke();
            } else {
                const tw = 0.7 + 0.3 * Math.sin(p.t * 40 + p.x);   // subtle magic twinkle
                ctx.globalAlpha = a * tw; ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = p.glow;
                ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.r * (1 - k * 0.5)), 0, PI2); ctx.fill();
            }
        }
        ctx.restore();
    }
    function drawProjectiles() {
        for (const p of G.projectiles) {
            ctx.save();
            ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 12;
            ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, PI2); ctx.fill();
            ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, PI2); ctx.fill();
            ctx.restore();
        }
    }
    // Duel: cosmetic dots per cleared colour flying at the rival panel (damage itself is
    // applied in finishResolve); each lands with its element's impact sound.
    function spawnDuelProjectiles(combos) {
        const seen = new Set();
        for (const g of (combos || [])) {
            if (g.el === 'heart' || seen.has(g.el)) continue;
            seen.add(g.el);
            launchProjectile(W / 2, BOARD_TOP + 14, W * 0.3, 32, g.el, () => { playHitSound(g.el); G.shake = Math.max(G.shake, 0.14); markDirty(); });
        }
    }

    // =================================================================
    // Sandbox ("Sandbag") mode — a no-brainer damage run: no cards, no defence, no HP bar.
    // Pure spinning against 3 elemental enemies for SAND.rounds spins; chase total + best hit.
    // =================================================================
    function sandStage(round) {
        const n = SAND.hpTiersByStage.length;
        return Math.max(0, Math.min(n - 1, Math.floor(((round || 1) - 1) / SAND.stageRounds)));
    }
    function sandNewEnemy(round) {
        const els = sandElements();
        const el = els[AC.rng.int(G.rng, 0, els.length)];
        const tiers = SAND.hpTiersByStage[sandStage(round || G.round)];
        const ti = AC.rng.int(G.rng, 0, tiers.length);   // random tier within the current stage
        return { el, hp: tiers[ti], maxHp: tiers[ti], tier: ti, flash: 0 };
    }
    function spawnEnemies() { G.enemies = [sandNewEnemy(1), sandNewEnemy(1), sandNewEnemy(1)]; }
    function freshSandAbil() {
        return {
            atkMult: 1, dmgMult: {}, comboStepBonus: 0, firstWaveMult: 1, laterWaveMult: 1,
            spinBonusSec: 0, extraTargets: {}, aoe4All: false, quickMatchEl: null, dropWeightEl: null,
            freeArrange: false, once: {}, takenEl: {},
            picks: [],   // every pick in acquisition order ({id, el}); the Powers panel lists these as-is (no merging)
        };
    }
    function resetSandbox() {
        G.sandTotal = 0; G.sandSpinRun = 0; G.sandAtk = null; G.sandInspect = null;
        G.sandDraft = null;
        G.sandPowers = false;
        G.sandPowerSel = null;
        G.sandAbil = freshSandAbil();
        G.hand = []; G.energy = 0;
        G._rivalChips = []; G._rivalUsed = []; G._youChips = [];   // no duel chips in sandbox
        spawnEnemies();
        fillBoardNoMatches();
        G.round = 0;                        // the opening drafts are "round 0"; advanceSandRound starts round 1
        G.sandOpenLeft = DRAFT.openPicks;   // the opening offers this many drafts back-to-back
        G.phaseTimer = G.phaseMax = 9999;   // no decision clock — take your time to plan the spin
        G.countdown = 0;                    // no 3-2-1 preview in Sandbag
        updateHud();
        openSandDraft();                    // opening drafts before the first round
    }
    // Sandbag draft helper: sd_aoe4 (global) makes EVERY colour AoE at DRAFT.aoeThreshold (4);
    // otherwise AoE needs a 5+ group (CONFIG.bigThreshold).
    function sandAoe4() { return !!(G.sandAbil && G.sandAbil.aoe4All); }
    function sandIsAoe(cells) { return cells >= (sandAoe4() ? DRAFT.aoeThreshold : CONFIG.bigThreshold); }
    // After a sandbox spin resolves: turn the cleared groups into one strike per element (in the
    // order each element was first cleared). AoE (5+, or 4+ with sd_aoe4) hits all three; otherwise
    // the strike hits 1 enemy plus sd_allaoe's extra targets for that element.
    function finishResolveSandbox() {
        const combos = G.resolve ? G.resolve.combos : [];
        const n = combos.length;
        const ab = G.sandAbil || {};
        const comboStep = BALANCE.comboStep + (ab.comboStepBonus || 0);                  // sd_combo
        const comboMult = n > 0 ? 1 + comboStep * (n - 1) : 0;
        const atk = ab.atkMult || 1;                                                     // sd_atk (all damage)
        const raw = {}, aoe = {}, order = [];
        for (const g of combos) {
            let d = (g.cells.length + (g.enhanced || 0) * (BALANCE.enhancedMult - 1)) * BALANCE.baseDamage;
            d *= (g.wave === 0) ? (ab.firstWaveMult || 1) : (ab.laterWaveMult || 1);     // sd_first / sd_later
            d *= 1 + ((ab.dmgMult && ab.dmgMult[g.el]) || 0);                            // sd_dmg
            if (!(g.el in raw)) { raw[g.el] = 0; order.push(g.el); }
            raw[g.el] += d;
            if (sandIsAoe(g.cells.length)) aoe[g.el] = true;                             // sd_aoe4
        }
        const strikes = order.map((el) => {
            const full = !!aoe[el];
            const targets = full ? 3 : Math.min(3, 1 + ((ab.extraTargets && ab.extraTargets[el]) || 0));   // sd_allaoe
            return { el, dmg: Math.round(raw[el] * comboMult * atk), aoe: full, targets };
        });
        G.resolving = false; G.resolve = null; G.clearing.length = 0;
        G.sandAtk = { strikes, i: 0, t: SAND.strikeGap, spinTotal: 0, hold: 0 };
        G.phase = 'sandatk';
        markDirty();
    }
    function tickSandAttack(dt) {
        const A = G.sandAtk; if (!A) return;
        for (const e of G.enemies) if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
        if (A.i < A.strikes.length) {
            A.t += dt;
            if (A.t >= SAND.strikeGap) { A.t = 0; fireStrike(A.strikes[A.i], A); A.i++; }
            return;
        }
        if (G.projectiles.length) return;                                   // wait for the last shots to land
        if (!A.shown) { A.shown = true; if (A.spinTotal > 0) bigSpinFloat(A.spinTotal); }   // emphasise this spin's total
        A.hold += dt;
        if (A.hold >= SAND.hold) finalizeSandRound(A.spinTotal);
    }
    function bigSpinFloat(total) { G.floats.push({ x: W / 2, y: BOARD_TOP - 22, text: String(total), color: '#ffe08a', size: 46, t: 0, life: 1.6 }); }
    // Pick up to n targets for an element: living enemies first (then prefer a bonus matchup, then
    // lowest HP, then leftmost), corpses last — so a multi-target hit can still spill onto the dead.
    function sandPickTargets(el, n) {
        const pool = G.enemies.slice();
        const idx = (e) => G.enemies.indexOf(e);
        pool.sort((a, b) => {
            const da = a.hp > 0 ? 0 : 1, db = b.hp > 0 ? 0 : 1;
            if (da !== db) return da - db;
            const ba = restraint(el, a.el) > 1 ? 0 : 1, bb = restraint(el, b.el) > 1 ? 0 : 1;
            if (ba !== bb) return ba - bb;
            if (a.hp !== b.hp) return a.hp - b.hp;
            return idx(a) - idx(b);
        });
        return pool.slice(0, Math.max(1, n || 1));
    }
    function fireStrike(s, A) {
        const targets = s.aoe ? G.enemies.slice() : sandPickTargets(s.el, s.targets || 1);
        const x0 = W / 2, y0 = BOARD_TOP + 14;
        for (const e of targets) {
            if (!e) continue;
            const R = enemyRect(G.enemies.indexOf(e));
            launchProjectile(x0, y0, R.x + R.w / 2, R.y + R.h / 2, s.el, () => sandApplyHit(s, e, A));   // damage lands when the dot arrives
        }
    }
    function sandApplyHit(s, e, A) {
        const mult = restraint(s.el, e.el);
        const d = Math.round(s.dmg * mult);
        e.hp -= d; e.flash = 0.5;
        G.sandTotal += d; A.spinTotal += d;   // raw damage, overkill counts
        const R = enemyRect(G.enemies.indexOf(e));
        const col = mult > 1 ? '#ffd36b' : (mult < 1 ? '#9fcff0' : '#ff8a6b');
        addFloat(R.x + R.w / 2, R.y + 30, '-' + d, col, mult > 1 ? 22 : 17);
        playHitSound(s.el);
        G.shake = Math.max(G.shake, s.aoe ? 0.3 : 0.16);
        updateHud(); markDirty();
    }
    function finalizeSandRound(spinTotal) {
        G.sandAtk = null;
        recordSandSpin(spinTotal);
        for (let i = 0; i < G.enemies.length; i++) if (G.enemies[i].hp <= 0) G.enemies[i] = sandNewEnemy(G.round + 1);   // refill to 3 (next round's stage)
        if (G.round >= SAND.rounds) { sandboxOver(); return; }
        if (G.round % DRAFT.every === 0) { openSandDraft(); return; }   // draft phase handles the round bump when it closes
        advanceSandRound();
    }
    function advanceSandRound() {
        G.round++;
        G.phase = 'attack';
        G.spinOpen = false;
        updateHud(); markDirty();
    }

    // --- Sandbag draft (pick 1 of 3) ---
    function draftFreeEls(id) {   // elements still available for a perElement card (respecting its cap)
        const taken = G.sandAbil.takenEl[id] || [], cap = DRAFT_CARDS[id].cap || 1;
        return sandElements().filter((el) => taken.filter((x) => x === el).length < cap);
    }
    function draftEligible(id) {
        const def = DRAFT_CARDS[id];
        if (def.limit === 'once') return !G.sandAbil.once[id];
        if (def.limit === 'perElement') return draftFreeEls(id).length > 0;
        return true;   // stack
    }
    function rollDraftElement(id) {
        const def = DRAFT_CARDS[id], pool = sandElements();
        if (def.mode === 'global') return null;
        if (def.mode === 'anyElem') return 'any';
        const set = def.limit === 'perElement' ? draftFreeEls(id) : pool;   // 'elem': a concrete random element
        return set[AC.rng.int(G.rng, 0, set.length)];
    }
    function buildSandOffer() {
        const pool = DRAFT_ORDER.filter(draftEligible), out = [];
        for (let k = 0; k < DRAFT.offer && pool.length; k++) {
            let total = 0; for (const id of pool) total += DRAFT_CARDS[id].weight || 1;
            let x = AC.rng.float(G.rng, 0, total), pick = pool[pool.length - 1];
            for (const id of pool) { x -= DRAFT_CARDS[id].weight || 1; if (x <= 0) { pick = id; break; } }
            pool.splice(pool.indexOf(pick), 1);
            out.push({ id: pick, element: rollDraftElement(pick) });
        }
        return out;
    }
    function openSandDraft() {
        const cards = buildSandOffer();
        if (!cards.length) { advanceSandRound(); return; }   // nothing left to offer → just continue
        G.sandDraft = { cards };
        G.sandPowers = false;
        G.phase = 'sanddraft';
        AC.audio.tone(540, 0.09, { type: 'triangle', volume: 0.14 });                 // a little "draft!" chime
        setTimeout(() => AC.audio.tone(810, 0.11, { type: 'triangle', volume: 0.12 }), 80);
        updateHud(); markDirty();
    }
    function chooseSandCard(i) {
        const c = G.sandDraft && G.sandDraft.cards[i]; if (!c) return;
        if (c.element === 'any') {   // let the player pick the element (sd_focus / sd_quick / an "Any" roll)
            const els = DRAFT_CARDS[c.id].limit === 'perElement' ? draftFreeEls(c.id) : sandElements();
            openPalette({ title: 'rdSandPick', els, onPick: (el) => { G.palette = null; commitSandCard(c.id, el); } });
            return;
        }
        commitSandCard(c.id, c.element);
    }
    function commitSandCard(id, el) {
        applySandAbility(id, el);
        G.sandDraft = null;
        AC.audio.play('coin');
        const label = t(DRAFT_CARDS[id].key + '_name') + (el ? ' \u00b7 ' + t('el_' + el) : '');
        addFloat(W / 2, BOARD_TOP + 70, label, accent(), 20);
        if (G.round === 0 && (--G.sandOpenLeft) > 0) { openSandDraft(); return; }   // opening: offer DRAFT.openPicks drafts in a row
        advanceSandRound();
    }
    function applySandAbility(id, el) {
        const ab = G.sandAbil, def = DRAFT_CARDS[id];
        switch (id) {
            case 'sd_atk': ab.atkMult += DRAFT.atkPerStack; break;
            case 'sd_dmg': ab.dmgMult[el] = (ab.dmgMult[el] || 0) + DRAFT.dmgPerStack; break;
            case 'sd_aoe4': ab.aoe4All = true; break;
            case 'sd_focus': ab.dropWeightEl = el; break;
            case 'sd_time': ab.spinBonusSec += DRAFT.spinBonusSec; break;
            case 'sd_quick': ab.quickMatchEl = el; break;
            case 'sd_combo': ab.comboStepBonus += DRAFT.comboStepPerStack; break;
            case 'sd_first': ab.firstWaveMult += DRAFT.firstWavePerStack; break;
            case 'sd_later': ab.laterWaveMult += DRAFT.laterWavePerStack; break;
            case 'sd_allaoe': ab.extraTargets[el] = Math.min(DRAFT.extraTargetMax, (ab.extraTargets[el] || 0) + 1); break;
            case 'sd_free': ab.freeArrange = true; break;
        }
        if (def.limit === 'once') ab.once[id] = true;
        else if (def.limit === 'perElement') (ab.takenEl[id] = ab.takenEl[id] || []).push(el);
        ab.picks.push({ id, el: el || null });   // record acquisition order for the Powers panel
    }
    function sandboxOver() {
        recordSandTotal(G.sandTotal);
        G.phase = 'over';
        updateHud();
        shell.gameOver({ score: G.sandTotal, win: true, meta: { sandbox: true, total: G.sandTotal, spin: G.sandSpinRun } });
    }
    // --- sandbox records (separate from the duel's fewest-rounds / best-hit) ---
    // Sandbag bests are kept PER DIFFICULTY (easy/normal/hard), like the duel bests.
    // Reads default to the selected (staged) difficulty so the HUD updates the
    // moment you switch the difficulty seg; writes use the run's committed level.
    function sandPrefs(level) { try { const sb = (AC.prefs.get('rune-stones') || {}).sandbox || {}; return sb[level || staged] || {}; } catch (e) { return {}; } }
    function setSandBest(level, patch) { try { const p = AC.prefs.get('rune-stones') || {}; const sb = Object.assign({}, p.sandbox); sb[level] = Object.assign({}, sb[level], patch); AC.prefs.set('rune-stones', { sandbox: sb }); } catch (e) { /* ignore */ } }
    function recordSandSpin(v) { G.sandSpinRun = Math.max(G.sandSpinRun || 0, v); const sb = sandPrefs(G.aiLevel); if (sb.bestSpin == null || v > sb.bestSpin) { setSandBest(G.aiLevel, { bestSpin: v }); if (window.CloudSync) window.CloudSync.sync(); } }
    function recordSandTotal(v) { const sb = sandPrefs(G.aiLevel); if (sb.bestTotal == null || v > sb.bestTotal) { setSandBest(G.aiLevel, { bestTotal: v }); if (window.CloudSync) window.CloudSync.sync(); } }
    function recordDuelSpin(v) { if (!v) return; try { const p = AC.prefs.get('rune-stones') || {}; const bs = Object.assign({}, p.bestSpin); if (bs[G.aiLevel] == null || v > bs[G.aiLevel]) { bs[G.aiLevel] = v; AC.prefs.set('rune-stones', { bestSpin: bs }); } } catch (e) { /* ignore */ } }
    function duelBestRounds() { try { const v = (AC.prefs.get('rune-stones') || {}).bestRounds; return v && typeof v[staged] === 'number' ? v[staged] : null; } catch (e) { return null; } }
    function duelBestSpin() { try { const v = (AC.prefs.get('rune-stones') || {}).bestSpin; return v && typeof v[staged] === 'number' ? v[staged] : null; } catch (e) { return null; } }

    // (Cloud sync of the Sandbag bests is handled by the shared CloudSync engine —
    // see js/cloud-sync.js. This file just nudges a sync on a new record and repaints.)

    // --- sandbox rendering ---
    // Each enemy gets a fixed slot; the drawn card fills the band between the info row and the
    // (taller, 6×6) board. The card is scaled by HP tier so tougher enemies read a touch bigger.
    function enemyRect(i) {
        const pad = 12, gap = 10, n = 3;
        const w = (W - pad * 2 - gap * (n - 1)) / n;
        const top = 50, h = Math.max(72, BOARD_TOP - top - 12);
        return { x: pad + i * (w + gap), y: top, w, h };
    }
    function drawEnemies() {
        const f = getFont();
        for (let i = 0; i < G.enemies.length; i++) {
            const e = G.enemies[i], slot = enemyRect(i), col = ELEMENT_COLORS[e.el] || '#888', dead = e.hp <= 0;
            const ti = e.tier != null ? e.tier : 0;
            const sc = (SAND.sizeByTier[ti] != null) ? SAND.sizeByTier[ti] : 1;
            const w = slot.w * sc, h = slot.h * sc;
            const R = { x: slot.x + (slot.w - w) / 2, y: slot.y + (slot.h - h), w, h };   // bottom-anchored so HP bars line up
            const cut = Math.min(14, Math.min(R.w, R.h) * 0.2);   // chamfered "carved stone" corners
            ctx.save();
            ctx.globalAlpha = dead ? 0.38 : 1;
            ctx.fillStyle = shade(col, -0.18); slab(R.x, R.y, R.w, R.h, cut); ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = shade(col, 0.22); slab(R.x, R.y, R.w, R.h, cut); ctx.stroke();
            if (G.sandInspect === i) { ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; slab(R.x + 1.5, R.y + 1.5, R.w - 3, R.h - 3, cut); ctx.stroke(); }
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            // HP bar sits at the bottom; the rune icon (no text label) centres in the space above it.
            const bh = Math.max(10, h * 0.13), bx = R.x + 12, bw = R.w - 24, by = R.y + R.h - bh - 7;
            const iconSz = Math.min(R.w * 0.52, (by - R.y) * 0.74);
            drawRuneIcon(e.el, R.x + R.w / 2, R.y + (by - R.y) * 0.5, iconSz, 'rgba(255,255,255,0.95)', Math.max(2.4, iconSz * 0.07));
            ctx.fillStyle = 'rgba(0,0,0,0.42)'; roundRect(bx, by, bw, bh, 6); ctx.fill();
            ctx.fillStyle = shade(col, 0.2); roundRect(bx, by, bw * Math.max(0, Math.min(1, e.hp / e.maxHp)), bh, 6); ctx.fill();   // HP fill in the enemy's own element colour (a shade brighter than the card)
            ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.max(10, Math.round(h * 0.11))}px ${f}`;
            ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 2;
            ctx.fillText(Math.max(0, Math.ceil(e.hp)) + ' / ' + e.maxHp, R.x + R.w / 2, by + bh / 2 + 0.5);
            ctx.shadowBlur = 0;
            if (e.flash > 0) { ctx.globalAlpha = Math.min(0.55, e.flash); ctx.fillStyle = '#fff'; slab(R.x, R.y, R.w, R.h, cut); ctx.fill(); }
            ctx.restore();
        }
    }
    function drawSandInfo() {
        const f = getFont();
        const groups = [
            { label: t('rdRound'), value: G.round + '/' + SAND.rounds },
            { label: t('rdColDamage'), value: fmtNum(G.sandTotal || 0) },
            { label: t('rdSandRunBest'), value: fmtNum(G.sandSpinRun || 0) },
        ];
        const lf = `600 11px ${f}`, vf = `800 17px ${f}`, gap = 28;
        const widths = groups.map((g) => { ctx.font = lf; const lw = ctx.measureText(g.label).width; ctx.font = vf; return Math.max(lw, ctx.measureText(g.value).width); });
        const total = widths.reduce((a, b) => a + b, 0) + gap * (groups.length - 1);
        ctx.save();
        ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
        let x = (W - total) / 2;
        for (let i = 0; i < groups.length; i++) {
            const g = groups[i], cx = x + widths[i] / 2;
            ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = lf; ctx.fillText(g.label, cx, 15);
            ctx.fillStyle = '#fff'; ctx.font = vf; ctx.fillText(g.value, cx, 35);
            x += widths[i] + gap;
        }
        ctx.restore();
    }
    function enemyAtPixel(p) {
        for (let i = 0; i < G.enemies.length; i++) if (inRect(p, enemyRect(i))) return i;
        return -1;
    }
    function setInspect(i) {
        const v = (i != null && i >= 0) ? i : null;
        if (G.sandInspect !== v) { G.sandInspect = v; markDirty(); }
    }
    // Restraint tooltip: for the inspected enemy (defender), show how hard each of your attack
    // runes hits it — a row of rune chips with ↑ (strong ×1.5) / ↓ (weak ×0.5) and the number.
    function drawInspect(i) {
        const e = G.enemies[i]; if (!e) return;
        const f = getFont();
        const pool = sandElements();
        const n = pool.length;
        const chipW = 42, chipGap = 4, padX = 12, padTop = 8, padBot = 10, headH = 22;
        const rowW = n * chipW + (n - 1) * chipGap;
        const panelW = Math.max(rowW + padX * 2, 150);
        const panelH = padTop + headH + 48 + padBot;
        const slot = enemyRect(i);
        let px = Math.round(slot.x + slot.w / 2 - panelW / 2);
        px = Math.max(8, Math.min(W - panelW - 8, px));
        const py = BOARD_TOP + 8;   // floats over the top of the board, just under the enemy row
        ctx.save();
        const caretX = Math.max(px + 16, Math.min(px + panelW - 16, slot.x + slot.w / 2));
        ctx.fillStyle = 'rgba(12,10,24,0.96)';
        roundRect(px, py, panelW, panelH, 12); ctx.fill();
        ctx.beginPath(); ctx.moveTo(caretX - 8, py + 1); ctx.lineTo(caretX + 8, py + 1); ctx.lineTo(caretX, py - 8); ctx.closePath(); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.2)'; roundRect(px, py, panelW, panelH, 12); ctx.stroke();
        // header — enemy rune + label
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const hcY = py + padTop + headH / 2;
        drawRuneIcon(e.el, px + padX + 9, hcY, 20, ELEMENT_COLORS[e.el] || '#fff', 2.4);
        ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = `700 12px ${f}`;
        ctx.fillText(t('rdSandVs'), px + padX + 24, hcY);
        // chips — one per attacker element
        let cx = px + (panelW - rowW) / 2;
        const iconCy = py + padTop + headH + 15;
        for (const a of pool) {
            const m = restraint(a, e.el), c = cx + chipW / 2;
            const strong = m > 1, weak = m < 1;
            const col = strong ? '#6ee07f' : (weak ? '#ff6b6b' : 'rgba(255,255,255,0.5)');
            drawRuneIcon(a, c, iconCy, 22, ELEMENT_COLORS[a] || '#fff', 2.4);
            if (strong || weak) drawUiIcon(strong ? 'up' : 'down', c + 11, iconCy - 9, 13, col, 2.4);
            ctx.fillStyle = col; ctx.font = `800 12px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('\u00d7' + m, c, iconCy + 20);
            cx += chipW + chipGap;
        }
        ctx.restore();
    }
    function renderSandbox() {
        drawSandInfo();
        drawEnemies();
        drawBoard();
        if (G.held) { const o = board[G.held.cell]; drawStone(o.el, o.x, o.y, CONFIG.orbRadius * 1.06, o.shape, true, o.enhanced); }
        drawProjectiles();
        drawFloats();
        if (G.sandInspect != null) drawInspect(G.sandInspect);
    }

    // --- mode-aware HUD (columns differ per mode) ---
    function hudStatHtml(labelKey, valueId, accent) {
        return '<div class="hud-stat' + (accent ? ' accent' : '') + '">'
            + '<span class="hud-label"><span data-icon="' + (accent ? 'stone' : 'trophy') + '" aria-hidden="true"></span>'
            + '<span data-i18n="' + labelKey + '">' + t(labelKey) + '</span></span>'
            + '<span class="hud-value" id="' + valueId + '">\u2014</span></div>';
    }
    function rebuildHud() {
        const hud = document.querySelector('.hud'); if (!hud) return;
        hud.innerHTML = (G.mode === 'sandbox')
            ? hudStatHtml('rdRound', 'round', true) + hudStatHtml('rdColDamage', 'hud-dmg') + hudStatHtml('rdColBestTotal', 'hud-total') + hudStatHtml('rdColBestSpin', 'hud-spin')
            : hudStatHtml('rdRound', 'round', true) + hudStatHtml('rdColBestRounds', 'hud-rounds') + hudStatHtml('rdColBestSpin', 'hud-spin');
        try { AC.icons.render(hud); } catch (e) { /* ignore */ }
        dom.round = document.getElementById('round');
    }
    function fmtNum(v) { return v == null ? '\u2014' : (AC.format && AC.format.score ? AC.format.score(v) : String(v)); }
    function rebuildHelp() {
        const ul = document.getElementById('help-list'); if (!ul) return;
        const keys = (stagedMode === 'sandbox') ? ['rdSandHelp1Html', 'rdSandHelp2Html', 'rdSandHelp3Html'] : ['rdHelp1Html', 'rdHelp2Html', 'rdHelp3Html'];
        ul.innerHTML = keys.map((k) => '<li data-i18n="' + k + '"></li>').join('');
        try { AC.i18n.translateNode(ul); } catch (e) { /* ignore */ }
    }

    // =================================================================
    // Online duel sync (stage 2)
    // Defense: both pick shields → submit → reveal each other's shields.
    // Attack: both spin (damage already gated by the opponent's shields) →
    // submit {dmg,heal}. When both are in, the host writes resolved HP + round.
    // =================================================================

    function onlineWaiting() { return !!(G.online && (G.online.sub === 'waitDef' || G.online.sub === 'waitAtk')); }
    function onlineRemain() { return G.online ? Math.max(0, (G.online.phaseDeadline - Date.now()) / 1000) : 0; }

    function serializeShields(list) {
        return (list || []).map((s) => {
            const o = { type: s.type };
            if (s.mode) o.mode = s.mode;
            if (s.n != null) o.n = s.n;
            if (s.elements) o.elements = s.elements.slice();
            return o;
        });
    }
    function serializeBoard() {
        const out = [];
        for (let i = 0; i < COLS * ROWS; i++) { const o = board[i]; out.push(o ? { e: o.el, h: o.enhanced ? 1 : 0 } : null); }
        return out;
    }
    function pushMyBoard() {
        if (G.online && room && room.code) net.updateRoom(room.code, { ['game.board.' + G.online.myUid]: serializeBoard() }).catch(() => {});
    }
    // live reveal: push your current board + played attack cards the instant you act, so the
    // opponent sees your cards/transmutes right away (not only when you finish spinning).
    function pushLive() {
        if (!(G.online && room && room.code)) return;
        const u = G.online.myUid;
        net.updateRoom(room.code, { ['game.board.' + u]: serializeBoard(), ['game.played.' + u]: (G.playedThisRound || []).slice() }).catch(() => {});
    }
    function enterOnline(data) {
        if (!netUser) return;
        const myUid = netUser.uid;
        const oppUid = Object.keys(data.players || {}).find((u) => u !== myUid) || null;
        if (!oppUid) return;
        G.online = {
            myUid, oppUid,
            host: data.hostUid === myUid,
            oppName: (data.players[oppUid] && data.players[oppUid].name) || t('rdGuest'),
            sub: null, lastResolvedRound: 0, waitSince: 0, bothAtkSince: 0, phaseDeadline: 0, oppLastCards: [],
        };
        lobbyResult = ''; lobbyReason = '';
        closeLobby();
        setOnlineBtnEnabled(false);   // can't reopen the lobby mid-match (prevents ready/start conflicts)
        resetRun();
        if (!shell.isPlaying()) shell.start();
        if (shell.syncButtons) shell.syncButtons();   // disable pause/restart now that we're online
    }
    function submitDefense() {
        if (!G.online || G.online.sub !== 'def') return;
        G.online.sub = 'waitDef';
        G.online.waitSince = Date.now();
        net.updateRoom(room.code, {
            ['game.def.' + G.online.myUid]: serializeShields(G.youShields),
            ['game.hasten.' + G.online.myUid]: G.online.slowOpp || 0,
        }).catch((e) => console.warn('[duel]', e));
        updateHud();
    }
    function submitAttack(dmg, heal) {
        if (!G.online) return;
        G.online.waitSince = Date.now();
        const u = G.online.myUid, post = serializeBoard();   // post-spin settled board
        // write atk AND the live board, so after the host clears atk the opponent's mini-board
        // keeps showing this settled result (not the stale pre-spin board from pushLive).
        net.updateRoom(room.code, { ['game.atk.' + u]: { dmg: dmg | 0, heal: heal | 0, cards: G.playedThisRound.slice(), board: post }, ['game.board.' + u]: post }).catch((e) => console.warn('[duel]', e));
    }
    // Heartbeat: keep our own room's lastActionAt fresh (so it's never GC'd while we're
    // present), and periodically purge rooms others abandoned. Firestore has no
    // onDisconnect, so this is how F5'd/closed rooms get cleaned — reliably & for free,
    // within ~90s, without anyone needing to reopen the lobby.
    function heartbeatAndGc() {
        if (!net) return;
        if (room && room.code && netUser && room.data && room.data.players && room.data.players[netUser.uid]) {
            net.updateRoom(room.code, {}).catch(() => {});
        }
        net.cleanupStaleRooms().catch(() => {});
    }
    function forfeitOpponent() {
        if (!G.online) return;
        net.updateRoom(room.code, { 'game.status': 'over', 'game.winner': G.online.myUid }).catch(() => {});
        duelOver(true, false, 'forfeit');
    }
    function onlineWatchdog() {
        if (!G.online || !room || !room.data || !room.data.game) return;
        markDirty();   // safety net: online repaints at least once per second
        const g = room.data.game;
        if (g.status === 'over') return;
        const now = Date.now(), my = G.online.myUid, opp = G.online.oppUid;
        // (0) phase auto-advance on REAL time — fires even when this tab is backgrounded
        // (rAF/update freezes in background, but setInterval keeps ticking), so switching
        // tabs can no longer pause/stall the match: your move auto-submits at the deadline.
        if (!onlineWaiting() && now > (G.online.phaseDeadline || Infinity)) {
            if (G.phase === 'defense' && G.online.sub === 'def') { onPhaseTimeout(); return; }
            // never cut in while a spin is dragging OR its cascade is resolving — once a
            // spin starts it finishes on its own timer and submits via finishResolve,
            // even past the deadline. (This was the mid-cascade "freeze" cause.)
            if (G.phase === 'attack' && G.online.sub === 'atk' && !G.held && !G.resolving && !G.spinOpen) { onPhaseTimeout(); return; }
        }
        // (0b) spin window opened but this tab was backgrounded (update()/rAF frozen → the
        // spin clock can't tick): submit an empty strike once its wall-clock time elapses, so
        // the match never stalls. In the foreground update() resolves well before this margin.
        if (G.spinOpen && G.online.sub === 'atk' && !G.held && !G.resolving
            && G.online.spinOpenAt && now - G.online.spinOpenAt > (effectiveSpinTime() + 2) * 1000) {
            G.spinOpen = false; G.cardSel = null; G.palette = null;
            G.online.sub = 'waitAtk';
            submitAttack(0, 0);
            updateHud();
            return;
        }
        // (1) opponent idle too long → they forfeit, you win
        if (onlineWaiting()) {
            const oppIn = G.online.sub === 'waitDef' ? !!(g.def && g.def[opp]) : !!(g.atk && g.atk[opp]);
            if (!oppIn && now - (G.online.waitSince || now) > DUEL.stallSec * 1000) { forfeitOpponent(); return; }
        }
        // (2) both attacked but no one tallied (host gone) → take over the resolve
        if (g.atk && g.atk[my] && g.atk[opp] && G.online.lastResolvedRound >= (g.round || 1)
            && G.online.bothAtkSince && now - G.online.bothAtkSince > DUEL.takeoverSec * 1000) {
            G.online.bothAtkSince = 0;
            hostResolve(g);
        }
    }
    function hostResolve(g) {
        const A = G.online.myUid, B = G.online.oppUid, a = g.atk || {};
        const clamp = (v) => Math.max(0, Math.min(DUEL.hp, Math.round(v)));
        const dA = (a[A] && a[A].dmg) || 0, hA = (a[A] && a[A].heal) || 0;
        const dB = (a[B] && a[B].dmg) || 0, hB = (a[B] && a[B].heal) || 0;
        const hp = Object.assign({}, g.hp);
        hp[A] = clamp(Math.min(DUEL.hp, (hp[A] || 0) - dB + hA));   // take damage first, then heal (capped at max)
        hp[B] = clamp(Math.min(DUEL.hp, (hp[B] || 0) - dA + hB));
        const round = g.round || 1;
        let status = 'playing', winner = null;
        if (hp[A] <= 0 || hp[B] <= 0 || round >= DUEL.maxRounds) {
            status = 'over';
            winner = hp[A] === hp[B] ? null : (hp[A] > hp[B] ? A : B);
        }
        net.updateRoom(room.code, {
            'game.hp': hp, 'game.round': round + 1, 'game.def': {}, 'game.atk': {}, 'game.spin': {},
            'game.status': status, 'game.winner': winner,
        }).catch((e) => console.warn('[duel]', e));
    }
    // Online layering: after the heal beat, land the incoming hit a short moment later, then
    // settle to the authoritative HP (if it has arrived) and start the round-end hold.
    function tickStrike(dt) {
        const s = G.online && G.online.strike;
        if (!s || s.done) return;
        s.t -= dt;
        if (s.t > 0) return;
        s.done = true;
        if (s.dmg > 0) { G.youHp = Math.max(0, G.youHp - s.dmg); G.shake = 0.4; addFloat(W / 2, BOARD_TOP - 70, '-' + s.dmg, '#ff6b6b', 24); AC.audio.play('rock'); }
        if (s.ready) {   // authoritative HP already synced → reconcile + begin the hold
            if (s.youFinal != null) G.youHp = s.youFinal;
            if (s.aiFinal != null) G.aiHp = s.aiFinal;
            G.online.strike = null;
            G.phase = 'resolved'; G.resolveHold = DUEL.resolvePause;
        }
        updateHud();
    }
    function onRoomGame(data) {
        markDirty();
        if (G.online && !data && G.phase !== 'over') { duelOver(true, false, 'forfeit'); return; }   // room vanished → opponent left, you win
        const g = data && data.game;
        if (!g) return;
        if (g.status === 'playing' && !G.online) { enterOnline(data); return; }
        if (!G.online) return;
        const my = G.online.myUid, opp = G.online.oppUid;
        // mirror the rival's board: prefer their reshaped attack board (shows transmute/enchant) this round
        G.online.oppBoard = (g.atk && g.atk[opp] && g.atk[opp].board) || (g.board && g.board[opp]) || G.online.oppBoard;
        // reveal what the rival played / whether they're spinning — as soon as they act (never their damage)
        if (g.atk && g.atk[opp] && g.atk[opp].cards) G.online.oppLastCards = g.atk[opp].cards;
        else if (g.played && g.played[opp]) G.online.oppLastCards = g.played[opp];   // live reveal as they play
        G.online.oppStatus = (g.atk && g.atk[opp]) ? 'done' : ((g.spin && g.spin[opp] === (g.round || 1)) ? 'spin' : ((g.played && g.played[opp] && g.played[opp].length) ? 'spin' : ''));
        // reveal: both defense submitted → attack phase, see the opponent's shields
        if (G.online.sub === 'waitDef' && g.def && g.def[my] && g.def[opp]) {
            G.aiShields = (g.def[opp] || []).slice();
            const slows = (g.hasten && g.hasten[opp]) || 0;   // opponent's Shorten shrinks YOUR spin time (×0.7 each)
            startAttackPhase();
            G.spinMultOpp = Math.pow(0.7, slows);   // shown as the rival's time-down pill, no extra toast needed
            return;
        }
        // resolve: both attacks in — play it in two beats (heal, then the incoming hit) so the
        // exchange reads instead of landing all at once.
        if (g.atk && g.atk[my] && g.atk[opp] && G.online.lastResolvedRound < (g.round || 1)) {
            G.online.lastResolvedRound = g.round || 1;
            G.online.bothAtkSince = Date.now();
            G.online.oppLastCards = (g.atk[opp] && g.atk[opp].cards) || [];   // reveal what the rival played
            const oppDmg = (g.atk[opp] && g.atk[opp].dmg) || 0, oppHeal = (g.atk[opp] && g.atk[opp].heal) || 0;
            if (oppHeal > 0) { G.aiHp = Math.min(G.aiMaxHp, G.aiHp + oppHeal); addFloat(W / 2, 48, '+' + oppHeal, ELEMENT_COLORS.heart, 18); }   // beat 1: heal
            G.online.strike = { t: DUEL.strikeDelay, dmg: oppDmg, done: false, ready: false };                                                  // beat 2: queued hit
            if (G.online.host) hostResolve(g);
            return;
        }
        // next round — but let the strike beat finish first if one is mid-flight
        if (g.status === 'playing' && (g.round || 1) > G.round) {
            G.round = g.round;
            G.online.bothAtkSince = 0;
            const s = G.online.strike;
            if (s && !s.done) { s.youFinal = g.hp && g.hp[my]; s.aiFinal = g.hp && g.hp[opp]; s.ready = true; return; }   // strike will apply the final HP + hold
            G.online.strike = null;
            if (g.hp) { G.youHp = g.hp[my]; G.aiHp = g.hp[opp]; }
            updateHud();
            G.phase = 'resolved'; G.resolveHold = DUEL.resolvePause;   // hold so the exchange is readable
            return;
        }
        // over
        if (g.status === 'over' && G.phase !== 'over') {
            const s = G.online.strike;
            if (s && !s.done && s.dmg > 0) { G.shake = 0.4; addFloat(W / 2, BOARD_TOP - 70, '-' + s.dmg, '#ff6b6b', 24); AC.audio.play('rock'); }   // show the finishing blow
            G.online.strike = null;
            if (g.hp) { G.youHp = g.hp[my]; G.aiHp = g.hp[opp]; updateHud(); }
            duelOver(g.winner === my, !g.winner);   // no winner recorded → draw (e.g. simultaneous KO)
        }
    }
    function hostStartGame() {
        if (!room || !room.data) return;
        const h = room.data.hostUid;
        const guest = Object.keys(room.data.players || {}).find((u) => u !== h);
        if (!guest) return;
        const hp = {}; hp[h] = DUEL.hp; hp[guest] = DUEL.hp;
        net.updateRoom(room.code, { 'game.status': 'playing', 'game.round': 1, 'game.hp': hp, 'game.def': {}, 'game.atk': {}, 'game.winner': null, 'ready': {} }).catch((e) => showLobbyError(e));
    }

    // =================================================================
    // Simulation
    // =================================================================

    function settleOrbs(dt) {
        const f = Math.min(1, dt * 13);   // gentler fall/settle so drops are visible
        for (let idx = 0; idx < COLS * ROWS; idx++) {
            const o = board[idx];
            if (!o) continue;
            if (G.held && idx === G.held.cell) continue;
            o.x += (cellCX(idx) - o.x) * f;
            o.y += (cellCY(idx) - o.y) * f;
            o.scale += (1 - o.scale) * f;
        }
    }
    function update(dt) {
        if (G.phase === 'over') return;
        // Pre-game 3-2-1: let players read the starting board & hand before the clock runs.
        if (G.countdown > 0) {
            const before = Math.ceil(G.countdown);
            G.countdown = Math.max(0, G.countdown - dt);
            if (G.countdown <= 0) {
                G.phaseTimer = G.phaseMax;   // start the decide clock fresh now
                if (G.online && !onlineWaiting()) G.online.phaseDeadline = Date.now() + (G.phase === 'attack' ? DUEL.phaseTimeAtk : DUEL.phaseTimeDef) * 1000;
                AC.audio.tone(1040, 0.12, { type: 'square', volume: 0.12 });
            } else if (Math.ceil(G.countdown) !== before) {
                AC.audio.tone(700, 0.08, { type: 'square', volume: 0.12 });
            }
            markDirty();
            settleOrbs(dt);   // keep the board visually settling, but freeze all phase logic
            return;
        }
        if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);
        for (let i = G.floats.length - 1; i >= 0; i--) {
            const fl = G.floats[i];
            fl.t += dt; fl.y -= 22 * dt;
            if (fl.t >= fl.life) G.floats.splice(i, 1);
        }
        if (G.online && G.online.strike) tickStrike(dt);   // online: the delayed "incoming hit" beat
        tickProjectiles(dt);                               // attack dots in flight (both modes)
        tickParticles(dt);                                 // clear-burst sparks (both modes)
        if (G.mode === 'sandbox') {
            if (G.phase === 'attack') {
                if ((G.held && G.held.moved) || G.spinOpen) { G.spinTimer -= dt; if (G.spinTimer <= 0) startResolve(); }   // sd_free keeps the clock running while spinOpen
                if (G.resolving) stepResolve(dt);
            } else if (G.phase === 'sandatk') tickSandAttack(dt);
        } else {
        if (G.phase === 'defense') {
            if (G.online) { if (!onlineWaiting()) G.phaseTimer = onlineRemain(); }
            else { G.phaseTimer -= dt; if (G.phaseTimer <= 0) onPhaseTimeout(); }
        } else if (G.phase === 'attack') {
            if (G.spinOpen || (G.held && G.held.moved)) { G.spinTimer -= dt; if (G.spinTimer <= 0) startResolve(); }
            else if (!G.resolving) {
                if (G.online) { if (!onlineWaiting()) G.phaseTimer = onlineRemain(); }
                else { G.phaseTimer -= dt; if (G.phaseTimer <= 0) onPhaseTimeout(); }
            }
            if (G.resolving) stepResolve(dt);
        } else if (G.phase === 'ai') {
            G.aiTimer -= dt;
            if (G.aiTimer <= 0) aiSpin();
        } else if (G.phase === 'resolved') {
            G.resolveHold -= dt;
            if (G.resolveHold <= 0) {
                if (G.online) { startDefensePhase(); }
                else {
                    G.round++;
                    if (G.round > DUEL.maxRounds) { duelOver(G.youHp > G.aiHp, G.youHp === G.aiHp); return; }
                    startDefensePhase();
                }
            }
        }
        // repaint once per second while a phase clock is visibly counting down
        if ((G.phase === 'defense' || G.phase === 'attack') && !onlineWaiting() && !(G.held && G.held.moved) && !G.resolving && !G.spinOpen) {
            const sec = Math.ceil(G.phaseTimer);
            if (sec !== lastSecShown) {
                lastSecShown = sec; markDirty();
                if (sec <= 5 && sec > 0) AC.audio.tone(900, 0.07, { type: 'square', volume: 0.1 });   // urgency tick
            }
        }
        }   // end duel/online dispatch
        settleOrbs(dt);   // shared tail: always lerp orbs to their cells, both modes
    }

    // =================================================================
    // Rendering
    // =================================================================

    function animating() {
        if (G.held || G.resolving || G.spinOpen || G.shake > 0 || G.floats.length || G.projectiles.length || G.particles.length) return true;
        for (let i = 0; i < COLS * ROWS; i++) {
            const o = board[i];
            if (!o) continue;
            if (Math.abs(o.x - cellCX(i)) > 0.4 || Math.abs(o.y - cellCY(i)) > 0.4) return true;
            if (Math.abs((o.scale == null ? 1 : o.scale) - 1) > 0.01) return true;
        }
        return false;
    }
    function render() {
        // Repaint only when something changed or is animating (saves CPU/GPU). During
        // active play & animations we always repaint; while idle (waiting for opponent /
        // AI thinking / over / ready) we skip. The online watchdog marks the frame dirty
        // once per second as a safety net, so online can never stay stale for > ~1s.
        const idle = onlineWaiting() || G.phase === 'ai' || G.phase === 'over' || G.phase === 'idle';
        if (idle && !needsRender && !animating()) return;
        needsRender = false;
        ctx.fillStyle = '#0d0b16';
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        if (G.shake > 0) { const s = G.shake * 9; ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s); }
        if (G.mode === 'sandbox') {
            renderSandbox();
            ctx.restore();
            if (G.phase === 'sanddraft') drawSandDraft();
            if (G.phase === 'sanddraft' || G.phase === 'attack' || G.phase === 'sandatk') drawPowersButton();
            if (G.sandPowers) drawPowersPanel();
            if (G.palette) drawPalette();
            if (G.phase !== 'sanddraft' && !G.sandPowers) drawSpinTimer();
            if (G.countdown > 0) drawCountdown();
            return;
        }
        drawRivalPanel();
        drawYouBar();
        drawBoard();
        if (G.held) { const o = board[G.held.cell]; drawStone(o.el, o.x, o.y, CONFIG.orbRadius * 1.06, o.shape, true, o.enhanced); }
        drawOppBoard();
        drawProjectiles();
        drawFloats();
        ctx.restore();
        drawHand();
        drawEnergyPips();
        if (G.cardSel != null) drawCardActions();
        else if (!G.countdown) { if (G.phase === 'defense') drawDoneButton(); drawDrawButton(); }
        drawPhaseTimer();
        drawSpinTimer();
        if (G.countdown > 0) drawCountdown();
        if (G.palette) drawPalette();
        if (G.shieldPick) drawShieldPick();
    }

    // Rival board preview — shown over the (non-interactive) board during the online
    // defense phase, so you can pick shields based on what the opponent is holding.
    // Persistent compact preview of the rival's board (top-right), shown every phase
    // online so you can read what they're holding whenever you plan.
    const MINI = { cell: 14, get gw() { return COLS * this.cell; }, get gh() { return ROWS * this.cell; }, get ox() { return W - 16 - this.gw; }, oy: 10 };
    function oppBoardCells() {
        if (G.online) return G.online.oppBoard || null;
        return G.aiBoard ? G.aiBoard.map((c) => (c ? { e: c.el, h: c.enhanced ? 1 : 0 } : null)) : null;
    }
    function drawOppBoard() {
        const ob = oppBoardCells(); if (!ob) return;
        const cell = MINI.cell, ox = MINI.ox, oy = MINI.oy;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        roundRect(ox - 4, oy - 4, MINI.gw + 8, MINI.gh + 8, 6); ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        roundRect(ox - 4, oy - 4, MINI.gw + 8, MINI.gh + 8, 6); ctx.stroke();
        for (let i = 0; i < COLS * ROWS; i++) {
            const c = ob[i]; if (!c) continue;
            const x = ox + cellCol(i) * cell, y = oy + cellRow(i) * cell;
            ctx.fillStyle = ELEMENT_COLORS[c.e] || '#666';
            roundRect(x + 1, y + 1, cell - 2, cell - 2, 3); ctx.fill();
            if (c.h) { ctx.lineWidth = 1.5; ctx.strokeStyle = shade(ELEMENT_COLORS[c.e] || '#666', CONFIG.enhTint); roundRect(x + 1, y + 1, cell - 2, cell - 2, 3); ctx.stroke(); }   // enhanced edge = brightened element colour
        }
        ctx.restore();
    }
    function defShape() { if (!defaultShape) defaultShape = makeShape(AC.rng.make(7)); return defaultShape; }
    function buildRoundedPoly(pts, rad) {
        const n = pts.length, prev = pts[n - 1];
        const p = new Path2D();
        p.moveTo((prev[0] + pts[0][0]) / 2, (prev[1] + pts[0][1]) / 2);
        for (let i = 0; i < n; i++) { const cur = pts[i], nxt = pts[(i + 1) % n]; p.arcTo(cur[0], cur[1], (cur[0] + nxt[0]) / 2, (cur[1] + nxt[1]) / 2, rad); }
        p.closePath();
        return p;
    }
    function ensureGfx(sh, el) {
        if (sh.gfx && sh.gfxEl === el) return sh.gfx;
        const R = CONFIG.orbRadius, c = R * 0.42;
        const base = [[-R + c, -R], [R - c, -R], [R, -R + c], [R, R - c], [R - c, R], [-R + c, R], [-R, R - c], [-R, -R + c]];
        const pts = base.map((p, i) => [p[0] + sh.jit[i][0] * R, p[1] + sh.jit[i][1] * R]);
        const path = buildRoundedPoly(pts, R * 0.16);
        const darkS = new Path2D(), lightS = new Path2D();
        for (const sp of sh.speckles) { const p = sp.light ? lightS : darkS; p.moveTo(sp.dx * R + sp.r * R, sp.dy * R); p.arc(sp.dx * R, sp.dy * R, sp.r * R, 0, PI2); }
        const sheen = new Path2D();
        sheen.ellipse(-R * 0.25, -R * 0.42, R * 0.55, R * 0.3, -0.5, 0, PI2);
        const col = ELEMENT_COLORS[el];
        const grad = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R * 1.15);
        grad.addColorStop(0, shade(col, 0.26 + sh.toneShift));
        grad.addColorStop(0.6, shade(col, sh.toneShift));
        grad.addColorStop(1, shade(col, -0.34 + sh.toneShift));
        sh.gfx = { path, darkS, lightS, sheen, grad };
        sh.gfxEl = el;
        return sh.gfx;
    }
    function drawStone(el, x, y, r, shape, highlight, enhanced) {
        if (r <= 0.5) return;
        const col = ELEMENT_COLORS[el];
        const sh = shape || defShape();
        const gfx = ensureGfx(sh, el);
        const R = CONFIG.orbRadius, k = r / R;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(sh.rot);
        ctx.save();
        ctx.scale(k, k);
        if (highlight) { ctx.shadowColor = col; ctx.shadowBlur = 20; }
        ctx.fillStyle = gfx.grad;
        ctx.fill(gfx.path);
        ctx.shadowBlur = 0;
        ctx.save();
        ctx.clip(gfx.path);
        ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fill(gfx.darkS);
        ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill(gfx.lightS);
        ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill(gfx.sheen);
        ctx.restore();
        ctx.lineWidth = R * 0.07;
        ctx.strokeStyle = 'rgba(0,0,0,0.33)';
        ctx.stroke(gfx.path);
        if (enhanced) {
            const eCol = shade(col, CONFIG.enhTint);   // brightened element colour, not stark white
            ctx.lineWidth = R * 0.09;
            ctx.strokeStyle = eCol;
            ctx.shadowColor = eCol; ctx.shadowBlur = 7;
            ctx.stroke(gfx.path);
            ctx.shadowBlur = 0;
        }
        if (highlight) { ctx.scale(1.08, 1.08); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke(gfx.path); }
        ctx.restore();
        const iconColor = enhanced ? shade(col, CONFIG.enhTint) : shade(col, CONFIG.iconTint);
        drawRuneIcon(el, 0, 0, r * CONFIG.iconScale, iconColor, Math.max(2.4, r * CONFIG.iconStroke));
        ctx.restore();
    }
    function drawRuneIcon(el, cx, cy, size, color, lw) {
        const paths = ICON_PATHS[el];
        if (!paths) return;
        const s = size / 24;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.translate(-12, -12);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw / s;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const p of paths) ctx.stroke(p);
        ctx.restore();
    }
    // A HUD glyph from UI_PATHS (stroked, 24×24 viewBox), centred at (cx,cy).
    function drawUiIcon(key, cx, cy, size, color, lw) {
        const paths = UI_PATHS[key] || ICON_PATHS[key]; if (!paths) return;   // UI glyph or element rune
        const s = size / 24;
        ctx.save();
        ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-12, -12);
        ctx.strokeStyle = color; ctx.lineWidth = (lw || 2) / s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const p of paths) ctx.stroke(p);
        ctx.restore();
    }
    // Layout anchors for the HUD status chips (rival shields at the top, your chips on
    // the action row). Chip drawing lives in drawChip().
    const PILL = { h: 19, gap: 5, groupGap: 13, y: 37 };
    function drawBoard() {
        ctx.save();
        for (let idx = 0; idx < COLS * ROWS; idx++) {
            const r = cellRow(idx), c = cellCol(idx);
            ctx.fillStyle = ((r + c) & 1) ? 'rgba(255,255,255,0.028)' : 'rgba(255,255,255,0.055)';
            ctx.fillRect(c * CELL, BOARD_TOP + r * CELL, CELL, CELL);
        }
        ctx.restore();
        if (G.held) {
            const idx = G.held.cell, r = cellRow(idx), c = cellCol(idx);
            ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3;
            roundRect(c * CELL + 3, BOARD_TOP + r * CELL + 3, CELL - 6, CELL - 6, 10); ctx.stroke(); ctx.restore();
        }
        for (let idx = 0; idx < COLS * ROWS; idx++) {
            const o = board[idx];
            if (!o || (G.held && idx === G.held.cell)) continue;
            drawStone(o.el, o.x, o.y, CONFIG.orbRadius * (o.scale == null ? 1 : o.scale), o.shape, false, o.enhanced);
        }
        for (const o of G.clearing) drawStone(o.el, o.x, o.y, CONFIG.orbRadius * o.scale, o.shape, false, o.enhanced);
        drawParticles();   // magic clear-burst sparks over the board (both modes)
    }
    function drawBar(x, y, w, h, ratio, color, label) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        roundRect(x, y, w, h, h / 2); ctx.fill();
        ratio = AC.math.clamp(ratio, 0, 1);
        if (ratio > 0) { ctx.fillStyle = color; roundRect(x, y, Math.max(h, w * ratio), h, h / 2); ctx.fill(); }
        if (label) {
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.font = `700 12px ${getFont()}`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
        }
        ctx.restore();
    }
    // Collapse a shield list into compact display items (icon glyphs + a full label),
    // merging redundant shields (a stronger requirement subsumes a weaker one) and
    // stacking Time-shorten into a single ×n chip.
    function collapseShields(shields, slowN) {
        const A = '#9cccf5';
        const g = (key, col) => ({ g: key, c: col || A });
        const elg = (e) => ({ g: e, c: elColor(e) });
        const tx = (text) => ({ t: text, c: A });
        let cmin = -Infinity, cmax = Infinity, fmin = -Infinity, fmax = Infinity, anyEnh = false;
        const needEl = new Set(), needElEnh = new Set(), banEl = new Set();
        for (const s of (shields || [])) {
            if (!s) continue;
            if (s.type === 'combo') { if (s.mode === 'max') cmax = Math.min(cmax, s.n); else cmin = Math.max(cmin, s.n); }
            else if (s.type === 'firstWave') { if (s.mode === 'min') fmin = Math.max(fmin, s.n); else fmax = Math.min(fmax, s.n); }
            else if (s.type === 'firstWaveMax') fmax = Math.min(fmax, s.n);
            else if (s.type === 'enhanced') anyEnh = true;
            else if (s.type === 'enhancedEl') (s.elements || []).forEach((e) => needElEnh.add(e));
            else if (s.type === 'element') { if (s.mode === 'ban') (s.elements || []).forEach((e) => banEl.add(e)); else (s.elements || []).forEach((e) => needEl.add(e)); }
        }
        for (const e of needElEnh) needEl.delete(e);   // "need X enhanced" subsumes "need X"
        if (needElEnh.size > 0) anyEnh = false;         // ...and subsumes "need enhanced (any)"
        const items = [];
        if (cmin > -Infinity) items.push({ glyphs: [g('ellipsis'), tx('\u2265' + cmin)], label: t('cwComboMin', cmin) });
        if (cmax < Infinity) items.push({ glyphs: [g('ellipsis'), tx('\u2264' + cmax)], label: t('cwComboMax', cmax) });
        if (fmin > -Infinity) items.push({ glyphs: [tx('\u2460\u2265' + fmin)], label: t('cwFirstMin', fmin) });
        if (fmax < Infinity) items.push({ glyphs: [tx('\u2460\u2264' + fmax)], label: t('cwFirstMax', fmax) });
        for (const e of needElEnh) items.push({ glyphs: [g('check'), elg(e), g('diamond')], label: t('cwNeedEnh', t('el_' + e)) });
        if (anyEnh) items.push({ glyphs: [g('check'), g('diamond')], label: t('cwNeedEnhAny') });
        for (const e of needEl) items.push({ glyphs: [g('check'), elg(e)], label: t('cwNeed', t('el_' + e)) });
        for (const e of banEl) items.push({ glyphs: [g('ban'), elg(e)], label: t('cwBan', t('el_' + e)) });
        if (slowN > 0) items.push({ glyphs: [g('clockDown', AMBER)], label: t('rdTimeShort'), count: slowN });
        return items;
    }
    function chipWidth(item, size, f) {
        let w = 12 + clusterWidth(item.glyphs, size, f);
        if (item.count && item.count > 1) { ctx.font = `800 ${Math.round(size * 0.72)}px ${f}`; w += 3 + ctx.measureText('\u00d7' + item.count).width; }
        return w;
    }
    function drawChip(x, y, h, item, size, f, tone) {
        const atk = tone === 'atk';
        const bg = atk ? 'rgba(217,106,78,0.14)' : 'rgba(127,212,255,0.14)';
        const stroke = atk ? 'rgba(217,106,78,0.55)' : 'rgba(127,212,255,0.5)';
        const cntCol = atk ? '#ffcdb5' : '#cfe8ff';
        const w = chipWidth(item, size, f), cy = y + h / 2;
        ctx.fillStyle = bg; roundRect(x, y, w, h, 9); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = stroke; roundRect(x, y, w, h, 9); ctx.stroke();
        drawGlyphCluster(item.glyphs, x + 6, cy, size, f);
        if (item.count && item.count > 1) {
            const gw = clusterWidth(item.glyphs, size, f);
            ctx.fillStyle = cntCol; ctx.font = `800 ${Math.round(size * 0.72)}px ${f}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText('\u00d7' + item.count, x + 6 + gw + 3, cy);
        }
        return w;
    }
    // collapse played attack-card ids into chips: Extend-time (fast) stacks into one ×N
    // chip; every other card groups by id with a ×count. (Symmetric for both players.)
    function collapseAttackCards(ids) {
        const items = []; let fast = 0; const counts = {}, order = [];
        for (const id of (ids || [])) {
            if (id === 'fast') { fast++; continue; }
            if (counts[id] == null) order.push(id);
            counts[id] = (counts[id] || 0) + 1;
        }
        if (fast > 0) items.push({ glyphs: [{ g: 'clockUp', c: AMBER }], label: t('cwFast'), count: fast });
        for (const id of order) { const c = CARDS[id]; if (!c) continue; items.push({ glyphs: cardGlyphs(c), label: cardName(id), count: counts[id] }); }
        return items;
    }
    function drawRivalPanel() {
        const f = getFont();
        const name = G.online ? G.online.oppName : t('rdRival');
        const oppStatus = G.online ? G.online.oppStatus : G.aiStatus;
        const oppCards = G.online ? G.online.oppLastCards : G.aiPlayed;
        const hasMini = !!oppBoardCells();
        const rightEdge = hasMini ? MINI.ox - 12 : W - 22;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `700 12px ${f}`; ctx.textAlign = 'left';
        ctx.fillText(name, 22, 15);
        if (oppStatus) {
            const nw = ctx.measureText(name).width;
            ctx.fillStyle = oppStatus === 'spin' ? '#ffcf5a' : '#8fe36b';
            ctx.font = `700 11px ${f}`;
            ctx.fillText(t(oppStatus === 'spin' ? 'rdOppSpin' : 'rdOppDone'), 22 + nw + 10, 15);
        }
        drawBar(22, 20, (hasMini ? MINI.ox - 34 : W - 44), 12, G.aiHp / G.aiMaxHp, '#ff5566', Math.max(0, Math.ceil(G.aiHp)) + ' / ' + G.aiMaxHp);

        ctx.textBaseline = 'middle';
        // the rival's defences against YOUR attack, as collapsed icon chips (+ stacked time↓)
        const shieldItems = collapseShields(G.aiShields, slowStacks(G.spinMultOpp));
        const chipH = 19, chipSize = 15;
        G._rivalChips = [];
        let px = rightEdge;
        for (let i = shieldItems.length - 1; i >= 0; i--) {
            const wItem = chipWidth(shieldItems[i], chipSize, f);
            px -= wItem;
            drawChip(px, PILL.y, chipH, shieldItems[i], chipSize, f, 'def');
            G._rivalChips.push({ x: px, y: PILL.y, w: wItem, h: chipH, label: shieldItems[i].label + (shieldItems[i].count > 1 ? ' \u00d7' + shieldItems[i].count : '') });
            px -= PILL.gap;
        }
        // the attack cards the rival has played this round, as icon chips (tap to read)
        G._rivalUsed = [];
        const used = collapseAttackCards(oppCards);
        if (used.length) {
            let cx = 22; const uy = 60, uh = 22, us = 17;
            for (const item of used) {
                const w = chipWidth(item, us, f);
                if (cx + w > rightEdge) break;
                drawChip(cx, uy, uh, item, us, f, 'atk');
                G._rivalUsed.push({ x: cx, y: uy, w, h: uh, label: item.label + (item.count > 1 ? ' \u00d7' + item.count : '') });
                cx += w + 5;
            }
        }
        ctx.textBaseline = 'alphabetic';
    }
    function drawYouBar() {
        const f = getFont();
        G._youChips = [];
        // Status chips ride the action row, to the right of the Draw / To-attack buttons:
        //   defence group = your shields (collapsed icon chips), then — kept separate — your
        //   attack group = time↑ (amber) + the attack cards you played this round.
        // Hidden while a card is selected (Play / Discard own the row then).
        if (G.cardSel == null && (G.phase === 'defense' || G.phase === 'attack')) {
            const ph = 23, py = LAY.actY + (LAY.actH - ph) / 2, size = 17;
            const draw = drawMoreRect();
            let x = draw.x + draw.w + 12;   // chips fill the middle, between Draw (left) and To-attack (right)
            // defense group (your shields + your Shorten), then — separated — your attack group
            const defItems = collapseShields(G.youShields, G.mySlow || 0);
            for (const it of defItems) { const w = chipWidth(it, size, f); drawChip(x, py, ph, it, size, f, 'def'); G._youChips.push({ x, y: py, w, h: ph, label: it.label + (it.count > 1 ? ' \u00d7' + it.count : '') }); x += w + PILL.gap; }
            const atkItems = collapseAttackCards(G.playedThisRound);
            if (atkItems.length) {
                if (defItems.length) x += PILL.groupGap - PILL.gap;
                for (const it of atkItems) { const w = chipWidth(it, size, f); drawChip(x, py, ph, it, size, f, 'atk'); G._youChips.push({ x, y: py, w, h: ph, label: it.label + (it.count > 1 ? ' \u00d7' + it.count : '') }); x += w + PILL.gap; }
            }
        }
        // HP bar hugging the board (right above the timer bar)
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = `600 12px ${f}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(t('rdHp'), 22, LAY.youHpY + 10);
        const ratio = G.youHp / G.youMaxHp, col = ratio <= 0.3 ? '#ff6b6b' : '#6bd98a';
        drawBar(54, LAY.youHpY, W - 76, LAY.youHpH, ratio, col, Math.max(0, Math.ceil(G.youHp)) + ' / ' + G.youMaxHp);
    }

    // card hand — short, wide tiles in two staggered rows (ABAB by x). Odd slots sit a
    // little lower; the small overlap keeps the footprint compact while leaving every
    // tile's lower-left corner visible for its 1–3 glyphs. Tap to select (pops up to
    // reveal the full name), tap again to play.
    // Two clean, non-overlapping rows of up to 5. Cards are wide and short; the icon
    // cluster sits centre-left, the cost in the top-right corner. Selecting a card just
    // makes it glow (no pop) — its full name shows in the action row instead.
    const HAND = { cols: 5, gap: 8, margin: 14, h: 34, rowGap: 8, topY: 84 };
    function handTileRects() {
        const order = G.hand.map((id, i) => ({ id, i })).sort((a, b) => {
            const ta = CARDS[a.id].type === 'defense' ? 0 : 1;
            const tb = CARDS[b.id].type === 'defense' ? 0 : 1;
            return (ta - tb) || (a.i - b.i);
        });
        const n = order.length;
        if (n === 0) return [];
        const { cols, gap, margin, h, rowGap, topY } = HAND;
        const w = (W - 2 * margin - (cols - 1) * gap) / cols;
        const res = [];
        for (let k = 0; k < n; k++) {
            const row = Math.floor(k / cols);
            const inRow = row === 0 ? Math.min(cols, n) : n - cols;
            const rowW = inRow * w + (inRow - 1) * gap;
            const x0 = (W - rowW) / 2;
            res.push({ i: order[k].i, id: order[k].id, row, x: x0 + (k - row * cols) * (w + gap), y: topY + row * (h + rowGap), w, h });
        }
        return res;
    }
    function tileRect(b) { return b; }   // selection no longer pops the tile (it glows instead)
    function drawMoreRect() { return { x: 16, y: LAY.actY, w: 92, h: LAY.actH }; }
    function doneButtonRect() { return { x: W - 16 - 128, y: LAY.actY, w: 128, h: LAY.actH }; }   // the "To attack" button hugs the right edge
    function playBtnRect() { return { x: W - 16 - 98 - 8 - 98, y: LAY.actY, w: 98, h: LAY.actH }; }
    function discardBtnRect() { return { x: W - 16 - 98, y: LAY.actY, w: 98, h: LAY.actH }; }
    function drawDrawButton() {
        if (!shell || !shell.isPlaying()) return;
        if (G.phase !== 'defense' && G.phase !== 'attack') return;
        if (G.palette || G.held || G.resolving) return;
        const b = drawMoreRect(), f = getFont(), ok = canDrawMore();
        const col = typeColors(curType() === 'defense');   // defense phase = blue, attack phase = red (matches the card you'll draw)
        ctx.save();
        ctx.fillStyle = ok ? col.bg : 'rgba(255,255,255,0.05)';
        roundRect(b.x, b.y, b.w, b.h, 9); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = ok ? col.base : 'rgba(255,255,255,0.15)';
        roundRect(b.x, b.y, b.w, b.h, 9); ctx.stroke();
        ctx.fillStyle = ok ? '#fff' : 'rgba(255,255,255,0.4)';
        ctx.font = `700 13px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t('rdDraw') + ' ' + DUEL.drawCost, b.x + b.w / 2, b.y + b.h / 2);
        ctx.restore();
    }
    function drawDoneButton() {
        if (!shell || !shell.isPlaying()) return;
        if (onlineWaiting()) return;
        const b = doneButtonRect(), f = getFont();
        ctx.save();
        ctx.fillStyle = accent();
        roundRect(b.x, b.y, b.w, b.h, 9); ctx.fill();
        ctx.fillStyle = '#1a1526'; ctx.font = `800 15px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t('rdDone'), b.x + b.w / 2, b.y + b.h / 2);
        ctx.restore();
    }
    function drawHand() {
        if (!shell || !shell.isPlaying()) return;
        const f = getFont();
        const tiles = handTileRects();
        for (const b of tiles) if (b.i !== G.cardSel) drawCardTile(b, f);
        const sel = tiles.find((b) => b.i === G.cardSel);
        if (sel) drawCardTile(sel, f);   // selected last so its glow sits on top
    }
    function glyphSize(n) { return n >= 3 ? 22 : (n === 2 ? 25 : 28); }
    function clusterWidth(items, size, f) {
        let w = 0;
        for (const it of items) { if (it.g) w += size; else { ctx.font = `800 ${Math.round(size * 0.72)}px ${f}`; w += ctx.measureText(it.t).width; } w += 4; }
        return Math.max(0, w - 4);
    }
    // Draw 1–3 glyphs (and short text tokens) left-to-right at a fixed size, centred on `cy`.
    function drawGlyphCluster(items, x, cy, size, f) {
        let gx = x;
        for (const it of items) {
            if (it.g) { drawUiIcon(it.g, gx + size / 2, cy, size, it.c, 2.2); gx += size + 4; }
            else { ctx.fillStyle = it.c; ctx.font = `800 ${Math.round(size * 0.72)}px ${f}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(it.t, gx, cy); gx += ctx.measureText(it.t).width + 4; }
        }
    }
    function drawCardTile(base, f) {
        const b = base, c = CARDS[b.id], sel = base.i === G.cardSel;
        // cards are only usable while deciding — dim them all once a spin starts/resolves
        const usable = !G.spinOpen && !(G.held && G.held.moved) && !G.resolving;
        const active = cardPhaseOk(b.id) && usable;   // this phase's type is bright; other type / spinning = dimmed
        const ok = active && G.energy >= c.cost && playable(b.id);
        const isNew = base.i === G.lastDrawn && ok;   // newest-drawn, but only while it's actually playable
        const col = cardColors(b.id);           // defense = blue, attack = red
        const glyphs = cardGlyphs(c);
        const items = ok ? glyphs : glyphs.map((it) => ({ g: it.g, t: it.t, c: 'rgba(255,255,255,0.4)' }));
        ctx.save();
        ctx.globalAlpha = active ? 1 : 0.5;
        ctx.fillStyle = sel ? col.bgSel : (isNew ? col.bgNew : (ok ? col.bg : 'rgba(255,255,255,0.06)'));
        roundRect(b.x, b.y, b.w, b.h, 8); ctx.fill();
        if (sel) { ctx.shadowColor = col.base; ctx.shadowBlur = 12; }   // selection = glow
        ctx.lineWidth = sel ? 2.5 : 1.5; ctx.strokeStyle = sel ? '#fff' : ((ok || isNew) ? col.base : 'rgba(255,255,255,0.18)');
        roundRect(b.x, b.y, b.w, b.h, 8); ctx.stroke();
        ctx.shadowBlur = 0;
        // cost — top-right corner
        ctx.fillStyle = ok ? col.base : 'rgba(255,255,255,0.45)';
        ctx.font = `800 12px ${f}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText(String(c.cost), b.x + b.w - 7, b.y + 5);
        // icon cluster — centre-left, vertically centred
        const size = glyphSize(glyphs.length);
        const cw = clusterWidth(glyphs, size, f);
        const sx = Math.max(b.x + 8, b.x + (b.w - cw) / 2 - 10);
        drawGlyphCluster(items, sx, b.y + b.h / 2, size, f);
        ctx.restore();
    }
    function drawEnergyPips() {
        if (!shell || !shell.isPlaying()) return;
        if (G.phase !== 'defense' && G.phase !== 'attack') return;
        const r = 5, gap = 5, x0 = 22, y = LAY.energyY, max = DUEL.energy;
        for (let i = 0; i < max; i++) {
            ctx.beginPath(); ctx.arc(x0 + r + i * (r * 2 + gap), y, r, 0, PI2);
            ctx.fillStyle = i < G.energy ? accent() : 'rgba(255,255,255,0.16)'; ctx.fill();
        }
        const f = getFont();
        ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = `700 13px ${f}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(onlineWaiting() ? t('rdWaitingOpp') : t(G.phase === 'defense' ? 'rdPhaseDef' : 'rdPhaseAtk'), W - 22, y);
    }
    function drawCardActions() {
        if (!shell || !shell.isPlaying() || G.cardSel == null) return;
        const id = G.hand[G.cardSel]; if (!id) { G.cardSel = null; return; }
        const c = CARDS[id], f = getFont();
        const ok = (G.phase === 'defense' || G.phase === 'attack') && !onlineWaiting() && cardPhaseOk(id) && G.energy >= c.cost && playable(id);
        const pb = playBtnRect(), db = discardBtnRect();
        const cy = LAY.actY + LAY.actH / 2;
        ctx.save();
        // selected card's cost + name/effect on the left (this replaces the old pop-up)
        ctx.fillStyle = cardColors(id).base; ctx.font = `800 13px ${f}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(String(c.cost), 18, cy);
        const cw = ctx.measureText(String(c.cost)).width;
        ctx.fillStyle = ok ? '#fff' : 'rgba(255,255,255,0.6)'; ctx.font = `700 14px ${f}`;
        ctx.fillText(cardName(id), 18 + cw + 8, cy);
        // Play / Discard on the right
        ctx.fillStyle = ok ? accent() : 'rgba(255,255,255,0.1)';
        roundRect(pb.x, pb.y, pb.w, pb.h, 9); ctx.fill();
        ctx.fillStyle = ok ? '#1a1526' : 'rgba(255,255,255,0.4)'; ctx.font = `800 14px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t('rdPlay'), pb.x + pb.w / 2, pb.y + pb.h / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; roundRect(db.x, db.y, db.w, db.h, 9); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.28)'; roundRect(db.x, db.y, db.w, db.h, 9); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fillText(t('rdDiscard'), db.x + db.w / 2, db.y + db.h / 2);
        ctx.restore();
    }
    // Colour picker — used by Transmute (source/target) and Taboo Shield (choose a colour).
    // --- Sandbag draft UI (3 full-width cards stacked over the board area) ---
    function sandDraftRects() {
        const cards = (G.sandDraft && G.sandDraft.cards) || [];
        const n = cards.length || 1;
        const x = 22, w = W - 44, gap = 14, top = BOARD_TOP + 50;
        const h = Math.min(132, (H - top - 22 - gap * (n - 1)) / n);
        return cards.map((c, i) => ({ i, card: c, x, y: top + i * (h + gap), w, h }));
    }
    function drawSandDraft() {
        const f = getFont();
        ctx.save();
        ctx.fillStyle = 'rgba(8,6,16,0.9)';
        ctx.fillRect(0, BOARD_TOP - 4, W, H - (BOARD_TOP - 4));
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = `800 20px ${f}`;
        ctx.fillText(t('rdDraftTitle'), W / 2, BOARD_TOP + 32);
        for (const r of sandDraftRects()) {
            const def = DRAFT_CARDS[r.card.id];
            const el = r.card.element;
            const col = DRAFT_TIER[def.tier] || accent();   // frame colour = rarity tier (element shown by the badge)
            ctx.fillStyle = 'rgba(22,19,32,0.98)'; roundRect(r.x, r.y, r.w, r.h, 14); ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = col; roundRect(r.x, r.y, r.w, r.h, 14); ctx.stroke();
            const known = !!(el && el !== 'any');   // this card already shows a concrete element
            // left badge: the card's own Lucide glyph, tinted by rarity
            const bcx = r.x + 58, bcy = r.y + r.h / 2;
            ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.arc(bcx, bcy, 30, 0, PI2); ctx.fill();
            drawUiIcon(def.icon, bcx, bcy, 34, col, 2.4);
            // name (with the element named for element-specific cards) + description
            const tx = r.x + 102;
            ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `800 18px ${f}`; ctx.textBaseline = 'alphabetic';
            ctx.fillText((known ? t('el_' + el) + ' \u00b7 ' : '') + t(def.key + '_name'), tx, r.y + 42);
            ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = `500 13px ${f}`;
            ctx.fillText(t(def.key + '_desc'), tx, r.y + 66);
            // right: the element's own rune icon (not the whole stone) for element-specific cards
            if (known) drawRuneIcon(el, r.x + r.w - 48, bcy, 30, ELEMENT_COLORS[el] || '#fff', 2.4);
            // "One-time" badge for once-per-run cards
            if (def.limit === 'once') {
                const bw = 70, bh = 22, bx = r.x + r.w - bw - 20, by = r.y + 12;
                ctx.fillStyle = 'rgba(245,166,35,0.22)'; roundRect(bx, by, bw, bh, 11); ctx.fill();
                ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(245,166,35,0.85)'; roundRect(bx, by, bw, bh, 11); ctx.stroke();
                ctx.fillStyle = '#f5c56b'; ctx.font = `700 12px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(t('rdDraftOnce'), bx + bw / 2, by + bh / 2 + 0.5);
            }
        }
        ctx.restore();
    }
    // --- "Your powers" view (what the player currently owns) ---
    // One entry per active ability; stackables carry n = how many times taken (not the raw multiplier).
    // Every pick in acquisition order, one entry each (stacks are NOT merged).
    function sandOwned() { const ab = G.sandAbil; return (ab && ab.picks) ? ab.picks : []; }
    function powersBtnRect() { return { x: 10, y: 6, w: 60, h: 26 }; }
    function drawPowersButton() {
        const r = powersBtnRect(), f = getFont(), n = sandOwned().length;
        ctx.save();
        ctx.fillStyle = G.sandPowers ? 'rgba(127,212,255,0.28)' : 'rgba(22,19,32,0.9)';
        roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(159,226,255,0.55)'; roundRect(r.x, r.y, r.w, r.h, 8); ctx.stroke();
        ctx.fillStyle = '#cfe8ff'; ctx.font = `700 12px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t('rdPowers') + ' ' + n, r.x + r.w / 2, r.y + r.h / 2 + 0.5);
        ctx.restore();
    }
    // Powers panel layout: one row per pick (earliest -> latest); the selected row grows to show its desc.
    function sandPowerRows() {
        const owned = sandOwned(), n = owned.length;
        if (!n) return [];
        const x = 22, w = W - 44, top = BOARD_TOP + 48, gap = 7, expandExtra = 24;
        const sel = (G.sandPowerSel != null && G.sandPowerSel < n) ? G.sandPowerSel : -1;
        const baseH = Math.max(26, Math.min(42, (H - top - 16 - (sel >= 0 ? expandExtra : 0) - gap * (n - 1)) / n));
        const rows = []; let y = top;
        for (let i = 0; i < n; i++) {
            const h = baseH + (i === sel ? expandExtra : 0);
            rows.push({ i, pick: owned[i], x, y, w, h, expanded: i === sel });
            y += h + gap;
        }
        return rows;
    }
    function drawPowersPanel() {
        const f = getFont(), rows = sandPowerRows();
        ctx.save();
        ctx.fillStyle = 'rgba(8,6,16,0.93)'; ctx.fillRect(0, BOARD_TOP - 4, W, H - (BOARD_TOP - 4));
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = `800 20px ${f}`;
        ctx.fillText(t('rdPowersTitle'), W / 2, BOARD_TOP + 32);
        if (!rows.length) {
            ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = `500 14px ${f}`;
            ctx.fillText(t('rdPowersNone'), W / 2, BOARD_TOP + 72);
            ctx.restore(); return;
        }
        for (const r of rows) {
            const o = r.pick, def = DRAFT_CARDS[o.id], col = DRAFT_TIER[def.tier] || accent();
            const ny = r.expanded ? r.y + 20 : r.y + r.h / 2;   // name hugs the top when the row is expanded
            ctx.fillStyle = 'rgba(22,19,32,0.96)'; roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = col; roundRect(r.x, r.y, r.w, r.h, 10); ctx.stroke();
            drawUiIcon(def.icon, r.x + 26, ny, 24, col, 2.2);
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.font = `700 15px ${f}`;
            ctx.fillText((o.el ? t('el_' + o.el) + ' \u00b7 ' : '') + t(def.key + '_name'), r.x + 50, ny);
            if (o.el) drawRuneIcon(o.el, r.x + r.w - 24, ny, 22, ELEMENT_COLORS[o.el] || '#fff', 2.2);
            if (r.expanded) {
                ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = `500 13px ${f}`;
                ctx.fillText(t(def.key + '_desc'), r.x + 50, r.y + r.h - 12);
            }
        }
        ctx.restore();
    }
    function paletteRects() {
        const els = (G.palette && G.palette.els) || ELEMENTS;
        const sw = 74, gap = 12, n = els.length;
        const totalW = n * sw + (n - 1) * gap;
        const x0 = (W - totalW) / 2, y = BOARD_TOP + 150;
        return els.map((el, i) => ({ el, x: x0 + i * (sw + gap), y, w: sw, h: sw }));
    }
    function palettePanelRect() {
        const r = paletteRects();
        const first = r[0], last = r[r.length - 1], pad = 18;
        return { x: first.x - pad, y: first.y - pad - 30, w: (last.x + last.w) - first.x + pad * 2, h: first.h + pad * 2 + 30 };
    }
    function drawPalette() {
        const f = getFont();
        const rects = paletteRects(), panel = palettePanelRect();
        ctx.save();
        ctx.fillStyle = 'rgba(8,6,16,0.82)';
        ctx.fillRect(0, BOARD_TOP - 4, W, H - (BOARD_TOP - 4));
        ctx.fillStyle = 'rgba(22,19,32,0.98)';
        roundRect(panel.x, panel.y, panel.w, panel.h, 16); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = accent();
        roundRect(panel.x, panel.y, panel.w, panel.h, 16); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = `800 17px ${f}`;
        ctx.fillText(t(G.palette.title), W / 2, panel.y + 26);
        for (const r of rects) {
            const dim = G.palette.exclude && r.el === G.palette.exclude;   // can't pick the excluded colour
            ctx.save();
            if (dim) ctx.globalAlpha = 0.25;
            drawStone(r.el, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.44, defShape(), false, false);
            ctx.restore();
        }
        ctx.restore();
    }
    // "Break which shield" picker (lists the rival's shields as big buttons)
    function shieldPickRects() {
        const bw = 360, bh = 46, gap = 10, x = (W - bw) / 2, y0 = BOARD_TOP + 70;
        return breakTargets().map((tt, i) => ({ t: tt, x, y: y0 + i * (bh + gap), w: bw, h: bh }));
    }
    function shieldPickPanel() {
        const r = shieldPickRects(); if (!r.length) return { x: 0, y: 0, w: 0, h: 0 };
        const first = r[0], last = r[r.length - 1], pad = 18;
        return { x: first.x - pad, y: first.y - pad - 30, w: first.w + pad * 2, h: (last.y + last.h) - first.y + pad * 2 + 30 };
    }
    function drawShieldPick() {
        const f = getFont(), rects = shieldPickRects(), panel = shieldPickPanel();
        ctx.save();
        ctx.fillStyle = 'rgba(8,6,16,0.82)'; ctx.fillRect(0, BOARD_TOP - 4, W, H - (BOARD_TOP - 4));
        ctx.fillStyle = 'rgba(22,19,32,0.98)'; roundRect(panel.x, panel.y, panel.w, panel.h, 16); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = accent(); roundRect(panel.x, panel.y, panel.w, panel.h, 16); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = `800 17px ${f}`;
        ctx.fillText(t('rtPickShield'), W / 2, panel.y + 26);
        for (const r of rects) {
            ctx.fillStyle = 'rgba(127,212,255,0.16)'; roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(127,212,255,0.6)'; roundRect(r.x, r.y, r.w, r.h, 10); ctx.stroke();
            ctx.fillStyle = '#a9e3ff'; ctx.font = `700 15px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(r.t.label, r.x + r.w / 2, r.y + r.h / 2);
        }
        ctx.restore();
    }
    function drawPhaseTimer() {
        if (G.phase !== 'defense' && G.phase !== 'attack') return;
        if (onlineWaiting() || G.spinOpen || G.countdown > 0 || (G.held && G.held.moved) || G.resolving) return;   // spin timer / waiting / countdown own this slot
        const ratio = AC.math.clamp(G.phaseTimer / (G.phaseMax || DUEL.phaseTimeDef), 0, 1);
        const urgent = G.phaseTimer <= 5;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(0, BOARD_TOP - 8, W, 6);
        ctx.fillStyle = urgent ? '#ff5a5a' : '#6ad1ff';
        ctx.fillRect(0, BOARD_TOP - 8, W * ratio, 6);
        if (urgent) {
            const a = 0.28 + 0.2 * Math.sin(Date.now() / 110);
            ctx.strokeStyle = `rgba(255,70,70,${a})`;
            ctx.lineWidth = 6;
            ctx.strokeRect(3, BOARD_TOP + 3, W - 6, ROWS * CELL - 6);
        }
        ctx.restore();
    }
    // Pre-game 3-2-1. Caption sits in the empty strip above the board; the big digit is
    // drawn as an outline (with only a faint fill) so the starting orbs stay readable.
    function drawCountdown() {
        const n = Math.ceil(G.countdown);
        const frac = G.countdown - (n - 1);   // 1 → 0 within each second
        const f = getFont();
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const cx = W / 2, cy = BOARD_TOP + ROWS * CELL / 2;
        const scale = 1 + (1 - frac) * 0.3;   // pops in large, settles
        ctx.translate(cx, cy); ctx.scale(scale, scale);
        ctx.font = `800 170px ${f}`;
        ctx.fillStyle = `rgba(255,255,255,${0.05 + 0.06 * frac})`;
        ctx.fillText(String(n), 0, 0);
        ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255,255,255,${0.3 + 0.35 * frac})`;
        ctx.strokeText(String(n), 0, 0);
        ctx.restore();
    }
    function drawSpinTimer() {
        if (!G.spinOpen && !(G.held && G.held.moved)) return;
        const ratio = AC.math.clamp(G.spinTimer / effectiveSpinTime(), 0, 1);
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(0, BOARD_TOP - 8, W, 6);
        ctx.fillStyle = ratio > 0.3 ? '#8fe36b' : '#ff6b6b';
        ctx.fillRect(0, BOARD_TOP - 8, W * ratio, 6);
        ctx.restore();
    }
    function drawFloats() {
        const f = getFont();
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const fl of G.floats) {
            ctx.globalAlpha = Math.max(0, 1 - fl.t / fl.life);
            ctx.fillStyle = fl.color;
            ctx.font = `800 ${fl.size}px ${f}`;
            ctx.fillText(fl.text, fl.x, fl.y);
        }
        ctx.restore();
    }
    function wrapLines(text, maxWidth) {
        const lines = []; let cur = '';
        for (const ch of String(text)) {
            const test = cur + ch;
            if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = ch; }
            else cur = test;
        }
        if (cur) lines.push(cur);
        return lines;
    }

    // =================================================================
    // HUD + overlay
    // =================================================================

    // Records (per difficulty for duel, separate bucket for sandbox). Online is honor-system
    // and records nothing. The HUD columns are rebuilt per mode (see rebuildHud / updateHud).
    function recordAiWin(rounds) {
        try {
            const p = AC.prefs.get('rune-stones') || {}, br = Object.assign({}, p.bestRounds);
            if (br[G.aiLevel] == null || rounds < br[G.aiLevel]) { br[G.aiLevel] = rounds; AC.prefs.set('rune-stones', { bestRounds: br }); }
        } catch (e) { /* ignore */ }
    }
    function updateHud() {
        markDirty();
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        if (G.mode === 'sandbox') {
            set('round', G.round + ' / ' + SAND.rounds);
            set('hud-dmg', fmtNum(G.sandTotal || 0));
            set('hud-total', fmtNum(sandPrefs().bestTotal));
            set('hud-spin', fmtNum(sandPrefs().bestSpin));
        } else {
            set('round', String(G.round));
            set('hud-rounds', fmtNum(duelBestRounds()));
            set('hud-spin', fmtNum(duelBestSpin()));
        }
    }
    function overlayContent(state, result) {
        if (state === 'idle') {
            if (stagedMode === 'sandbox') return { badge: 'stone', title: t('rdReady'), message: t('rdSandIntro'), button: t('play'), hint: t('rdSandStartHint') };
            return { badge: 'stone', title: t('rdReady'), message: t('rdIntro'), button: t('play'), hint: t('rdStartHintHtml') };
        }
        if (state === 'over') {
            const meta = (result && result.meta) || {};
            if (meta.sandbox) {
                return { badge: 'trophy', title: t('rdSandDone'), message: t('rdSandResultHtml', meta.total || 0, meta.spin || 0), button: t('restart'), hint: t('rdSandHint') };
            }
            const win = !!meta.win, draw = !!meta.draw;
            const round = meta.round != null ? meta.round : G.round;
            const reason = meta.reason ? `<strong>${meta.reason}</strong><br>` : '';
            const msg = reason + (win ? t('rdOverWinHtml', round) : t('rdOverLoseHtml', round));
            const title = draw ? t('rdDrawGame') : (win ? t('rdWin') : t('rdLose'));
            const badge = draw ? 'swords' : (win ? 'trophy' : 'skull');
            return { badge, title, message: msg, button: t('restart'), hint: t('rdOverHint') };
        }
        return {};
    }

    // =================================================================
    // Reset + init
    // =================================================================

    function resetRun() {
        if (!G.online) { G.mode = stagedMode; G.aiLevel = staged; } else { G.mode = 'duel'; }   // online is always duel
        applyBoardGeometry();   // sets ROWS / BOARD_TOP for this mode (sandbox = 6×6) before the board is built
        G.rng = AC.rng.make((((Math.random() * 0x7fffffff) | 0) ^ (Date.now() & 0xffffff)) >>> 0);   // random board each run
        G.round = 1;
        G.aiTimer = 0;
        G.phaseTimer = 0;
        G.phaseMax = 0;
        G.score = 0;
        G.cardSel = null;
        G.palette = null;
        G.shieldPick = null;
        G.playedThisRound = [];
        G.lastDrawn = null;
        G.spinOpen = false;
        G.empowerNext = 1;
        G.held = null;
        G.spinTimer = 0;
        G.resolving = false;
        G.resolve = null;
        G.clearing = [];
        G.floats = [];
        G.projectiles = [];
        G.particles = [];
        G.shake = 0;
        G.youShields = [];
        G.spinMultSelf = 1;
        G.spinMultOpp = 1;
        G.aiTimeMult = 1;
        G.mySlow = 0;
        board = G.board = new Array(COLS * ROWS).fill(null);
        rebuildHud();          // columns depend on the mode
        rebuildHelp();
        syncModeButtons();
        syncDiffButtons();
        if (G.mode === 'sandbox') { resetSandbox(); return; }
        // --- duel / online ---
        G.youHp = G.youMaxHp = DUEL.hp;
        G.aiHp = G.aiMaxHp = DUEL.hp;
        G.aiBoard = aiFillBoard();
        G.aiPlayed = [];
        G.aiStatus = '';
        G.aiPlan = null;
        fillBoardNoMatches();
        dealStartingHand();
        aiDealStartingHand();
        startDefensePhase();
        G.countdown = 3;   // 3-2-1 preview of the opening board & hand before the clock starts
        updateHud();
    }
    // =================================================================
    // Online lobby (Google / guest sign-in + room-code matchmaking)
    // Stage 1: auth + pairing. Per-round sync arrives next.
    // =================================================================

    let net = null;             // window.ArcadeNet once it's ready & ok
    let netUser = undefined;    // undefined = unknown, null = signed out, else {uid,name,...}
    let room = null;            // { code, data, unsub }
    let lobbyEl = null, lobbyRefs = null;
    let lobbyResult = '';       // "You win/lose" banner shown in the lobby after an online match
    let lobbyReason = '';       // why the last online match ended (shown under the result)

    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function lbtn(label, cls) { const b = el('button', cls || 'btn', label); b.type = 'button'; return b; }
    function lrow() { const r = el('div', 'lobby-row'); for (const a of arguments) if (a) r.appendChild(a); return r; }

    function buildLobby() {
        const wrap = document.querySelector('.stage-wrap') || document.body;
        const ov = el('div', 'overlay');
        ov.id = 'lobby';
        ov.hidden = true;
        ov.addEventListener('pointerdown', (e) => e.stopPropagation());   // never fall through to the board
        const card = el('div', 'overlay-card');
        const title = el('h2', 'overlay-title');
        const auth = el('div', 'lobby-auth');
        const roomBox = el('div', 'lobby-room');
        const status = el('p', 'lobby-status');
        const close = lbtn('', 'btn');
        close.addEventListener('click', closeLobby);
        card.append(title, auth, roomBox, status, close);
        ov.appendChild(card);
        wrap.appendChild(ov);
        lobbyEl = ov;
        lobbyRefs = { title, auth, room: roomBox, status, close };
    }

    function opponentName(data) {
        if (!data || !data.players || !netUser) return null;
        for (const uid in data.players) if (uid !== netUser.uid) return data.players[uid].name || t('rdGuest');
        return null;
    }
    function detachRoom() { if (room && room.unsub) { try { room.unsub(); } catch (e) { /* ignore */ } } room = null; }
    function attachRoom(code) {
        detachRoom();
        lobbyResult = ''; lobbyReason = '';
        room = { code, data: null, unsub: null };
        room.unsub = net.watchRoom(code, (data, err) => {
            if (err) { showLobbyError(err); return; }
            if (room) room.data = data;
            renderLobby();
            onRoomGame(data);
            maybeStartIfReady(data);
        });
        renderLobby();
    }
    function showLobbyError(e) {
        const m = String((e && e.message) || e);
        let msg = t('rdNetErr');
        if (m.indexOf('not found') !== -1) msg = t('rdRoomNotFound');
        else if (m.indexOf('full') !== -1) msg = t('rdRoomFull');
        if (lobbyRefs) lobbyRefs.status.textContent = msg;
        console.warn('[lobby]', e);
    }
    async function doSignIn(kind) {
        try { if (kind === 'google') await net.signInGoogle(); else await net.signInGuest(); }
        catch (e) { showLobbyError(e); }
    }
    async function doCreate() { try { const code = await net.createRoom(seedCounter + 1000); attachRoom(code); } catch (e) { showLobbyError(e); } }
    async function doJoin(code) {
        code = String(code || '').trim().toUpperCase();
        if (!code) return;
        try { const c = await net.joinRoom(code); attachRoom(c); } catch (e) { showLobbyError(e); }
    }
    async function doLeave() { lobbyResult = ''; lobbyReason = ''; if (room) { const c = room.code; detachRoom(); try { await net.leaveRoom(c); } catch (e) { /* ignore */ } } renderLobby(); }
    async function doReady() { if (!room || !netUser) return; try { await net.updateRoom(room.code, { ['ready.' + netUser.uid]: true }); } catch (e) { showLobbyError(e); } }
    // Once both seats have pressed Ready, the host (and only the host) writes the start.
    function maybeStartIfReady(data) {
        if (!data || !netUser || data.hostUid !== netUser.uid) return;
        if (data.game && data.game.status === 'playing') return;
        const players = Object.keys(data.players || {});
        const ready = data.ready || {};
        if (players.length >= 2 && players.every((uid) => ready[uid])) hostStartGame();
    }
    function copyCode(code) { try { const p = navigator.clipboard && navigator.clipboard.writeText(code); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } if (lobbyRefs) lobbyRefs.status.textContent = t('rdCopied'); }

    function renderLobby() {
        if (!lobbyEl) return;
        lobbyRefs.title.textContent = lobbyResult || t('rdOnline');
        lobbyRefs.close.textContent = t('rdClose');
        const u = netUser;
        // auth
        const auth = lobbyRefs.auth; auth.innerHTML = '';
        if (!u) {
            const g = lbtn(t('rdSignInGoogle'), 'btn btn-primary'); g.onclick = () => doSignIn('google');
            const a = lbtn(t('rdSignInGuest'), 'btn'); a.onclick = () => doSignIn('guest');
            auth.appendChild(lrow(g, a));
        } else {
            const info = el('span', null, t('rdSignedIn', u.name || t('rdGuest')));
            const out = lbtn(t('rdSignOut'), 'btn'); out.onclick = () => { doLeave(); net.signOut(); };
            auth.appendChild(lrow(info, out));
        }
        // room
        const r = lobbyRefs.room; r.innerHTML = '';
        if (u && !(room && room.data)) {
            const create = lbtn(t('rdCreateRoom'), 'btn btn-primary'); create.onclick = doCreate;
            const input = el('input'); input.placeholder = t('rdRoomCode'); input.maxLength = 4;
            const join = lbtn(t('rdJoinRoom'), 'btn'); join.onclick = () => doJoin(input.value);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(input.value); });
            r.appendChild(lrow(create));
            r.appendChild(lrow(input, join));
        } else if (u && room && room.data && !opponentName(room.data)) {
            r.appendChild(el('div', 'lobby-code', room.code));
            const copy = lbtn(t('rdCopyCode'), 'btn btn-primary'); copy.onclick = () => copyCode(room.code);
            const leave = lbtn(t('rdLeaveRoom'), 'btn'); leave.onclick = doLeave;
            r.appendChild(lrow(copy, leave));
        } else if (u && room && room.data && opponentName(room.data)) {
            // both players must press Ready; the host starts the match once both are ready
            const ready = room.data.ready || {};
            if (ready[u.uid]) { r.appendChild(lrow(el('span', null, t('rdReadyWait')))); }
            else { const rb = lbtn(t('rdReadyUp'), 'btn btn-primary'); rb.onclick = doReady; r.appendChild(lrow(rb)); }
            const leave = lbtn(t('rdLeaveRoom'), 'btn'); leave.onclick = doLeave;
            r.appendChild(lrow(leave));
        }
        // status
        let s = '';
        if (!u) s = t('rdSignInFirst');
        else if (room && room.data) {
            const opp = opponentName(room.data);
            if (opp) {
                const ready = room.data.ready || {};
                const oppUid = Object.keys(room.data.players || {}).find((x) => x !== u.uid);
                s = t('rdMatched', opp) + (oppUid && ready[oppUid] ? ' \u00b7 ' + t('rdOppReady') : '');
            } else s = t('rdWaitingOpp');
        }
        if (lobbyReason) s = s ? (lobbyReason + ' \u00b7 ' + s) : lobbyReason;
        lobbyRefs.status.textContent = s;
    }
    function openLobby() { if (!net || !net.ok || G.online) return; if (!lobbyEl) buildLobby(); lobbyEl.hidden = false; renderLobby(); markDirty(); if (net.cleanupStaleRooms) net.cleanupStaleRooms().catch(() => {}); }
    function setOnlineBtnEnabled(on) { const b = document.getElementById('online-btn'); if (b) b.disabled = !on; }
    function closeLobby() { if (lobbyEl) lobbyEl.hidden = true; markDirty(); }

    function setupOnline() {
        if (window.CloudSync) window.CloudSync.onApplied(updateHud);   // repaint records on account swap / cloud merge
        const onReady = () => {
            const N = window.ArcadeNet;
            const btn = document.getElementById('online-btn');
            if (!N || !N.ok) { if (btn) btn.hidden = true; return; }
            net = N;
            buildLobby();
            net.onAuth((u) => { netUser = u; renderLobby(); });
            if (net.cleanupStaleRooms) net.cleanupStaleRooms().catch(() => {});   // purge abandoned rooms on load
            if (btn) { btn.hidden = (stagedMode === 'sandbox'); btn.addEventListener('click', openLobby); }
        };
        if (window.ArcadeNet) onReady();
        else window.addEventListener('arcade-net-ready', onReady, { once: true });
    }

    // Difficulty picker — a segmented button group, same pattern as the other games:
    // picking only *stages* a level; it's committed to G.aiLevel on the next run (Restart
    // or Play again). On the ready screen it applies at once. Best is kept per difficulty.
    function syncDiffButtons() {
        const seg = document.getElementById('difficulty-seg'); if (!seg) return;
        for (const b of seg.querySelectorAll('button[data-diff]')) {
            const d = b.dataset.diff;
            b.classList.toggle('active', d === staged);                               // staged pick
            b.classList.toggle('committed', d === G.aiLevel && G.aiLevel !== staged);  // what this run uses
            b.setAttribute('aria-checked', d === staged ? 'true' : 'false');
        }
    }
    function setDifficulty(d) {
        if (!AI_LEVELS[d] || d === staged) return;
        staged = d;
        try { AC.prefs.set('rune-stones', { difficulty: d }); } catch (e) { /* ignore */ }
        if (shell && shell.state === 'idle') { resetRun(); render(); shell.refreshOverlay(); }   // ready screen → apply now (incl. the ready message)
        else { syncDiffButtons(); updateHud(); }                         // mid-run → stage for next run
    }
    function setupDifficulty() {
        const seg = document.getElementById('difficulty-seg'); if (!seg) return;
        let saved = null; try { saved = (AC.prefs.get('rune-stones') || {}).difficulty; } catch (e) { /* ignore */ }
        staged = AI_LEVELS[saved] ? saved : 'normal';
        G.aiLevel = staged;
        seg.addEventListener('click', (e) => { const btn = e.target.closest('button[data-diff]'); if (btn) { AC.audio.unlock(); setDifficulty(btn.dataset.diff); } });
        syncDiffButtons();
        AC.i18n.subscribe(syncDiffButtons);
    }
    // Mode seg (Versus / Sandbag). Sandbox hides difficulty + online. Staged like difficulty:
    // changing it on the ready screen restarts into the new mode; mid-run it stages for next.
    function syncModeButtons() {
        const seg = document.getElementById('mode-seg');
        if (seg) for (const b of seg.querySelectorAll('button[data-mode]')) {
            const m = b.dataset.mode;
            b.classList.toggle('active', m === stagedMode);
            b.classList.toggle('committed', m === G.mode && G.mode !== stagedMode);
            b.setAttribute('aria-checked', m === stagedMode ? 'true' : 'false');
        }
        const diff = document.getElementById('difficulty-seg');
        if (diff) diff.style.display = '';   // difficulty now applies to both modes (sandbox scales attribute count)
        const online = document.getElementById('online-btn');
        if (online && !G.online) online.hidden = (stagedMode === 'sandbox') || !(net && net.ok);   // sandbox is solo; else show once net is ready
    }
    function setMode(m) {
        if ((m !== 'duel' && m !== 'sandbox') || m === stagedMode) return;
        stagedMode = m;
        try { AC.prefs.set('rune-stones', { mode: m }); } catch (e) { /* ignore */ }
        if (shell && shell.state === 'idle') { resetRun(); render(); shell.refreshOverlay(); }   // ready screen → apply now (incl. the ready message)
        else { syncModeButtons(); rebuildHelp(); }                       // mid-run → stage for next run
    }
    function setupMode() {
        const seg = document.getElementById('mode-seg'); if (!seg) return;
        let saved = null; try { saved = (AC.prefs.get('rune-stones') || {}).mode; } catch (e) { /* ignore */ }
        stagedMode = (saved === 'duel') ? 'duel' : 'sandbox';   // first visit defaults to Sandbag; a saved choice wins
        G.mode = stagedMode;
        seg.addEventListener('click', (e) => { const btn = e.target.closest('button[data-mode]'); if (btn) { AC.audio.unlock(); setMode(btn.dataset.mode); } });
        syncModeButtons();
        AC.i18n.subscribe(syncModeButtons);
    }
    function init() {
        fitCanvas();
        setupMode();
        setupDifficulty();
        window.addEventListener('resize', () => { fitCanvas(); markDirty(); render(); });
        shell = AC.shell.create({
            gameId: 'rune-stones',
            mode: () => 'clash',
            step: 1 / 60,
            preventKeys: ['Space'],
            update,
            render,
            reset: resetRun,
            overlayContent,
            restartToReady: true,
            canPause: () => !G.online,     // no pausing during online PvP
            canRestart: () => !G.online,   // no restart during online PvP
        });
        document.addEventListener('pointerdown', onPointerDown, { passive: false });
        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', () => { setInspect(null); if (G.held && !G.held.moved) G.held = null; else if (G.held) startResolve(); });
        AC.i18n.subscribe(() => { markDirty(); updateHud(); if (lobbyEl && !lobbyEl.hidden) renderLobby(); });
        setupOnline();
        setInterval(onlineWatchdog, 1000);
        setInterval(heartbeatAndGc, 30000);
        window.addEventListener('pagehide', () => {
            if (!(G.online && room && room.code)) return;
            try {
                if (G.online.host) net.deleteRoom(room.code);                                                   // host leaves → room gone
                else net.updateRoom(room.code, { 'game.status': 'over', 'game.winner': G.online.oppUid });        // guest leaves → host wins
            } catch (e) { /* ignore */ }
        });
        resetRun();
        render();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
