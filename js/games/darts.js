/* Darts — deterministic throwing physics with separate rules and shared RTDB rooms.
 * Rules live in darts-rules.js; room policy lives in darts-room.js.
 *
 * The gesture is RELATIVE. The press point is the virtual hand origin (0,0,0); only the
 * subsequent motion matters, so an identical flick started anywhere on the screen throws
 * identically (this matters most for touch). While held we record {t, x, y} samples; at
 * release we take a smoothed, recency-weighted velocity over the final ~100 ms (NOT just
 * the last two samples) as the throw's release tangent.
 *
 * 3D game logic, 2D pseudo-perspective render. The virtual hand throws from below board
 * centre toward a board at +Z; TIME during the gesture is the forward (Z) progress, so a
 * faster flick implies a somewhat faster forward throw (compressed, not 1:1). Lateral and
 * vertical release motion become the dart's lateral/vertical velocity; after release the
 * dart is pure ballistics (gravity only). There is NO accuracy RNG — a bad flick misses
 * because the gesture physics say so, and the same gesture always lands in the same place.
 *
 * All feel lives in TUNING. Throw maths (analyseGesture / computeThrow / simulate / scoreAt)
 * are pure and rendering-free, so the physics can be retuned or replaced without touching
 * the draw code. A debug overlay (D) shows the gesture, release window, release vector and
 * trajectory so you can see WHY a dart went where it did.
 */
(function () {
    'use strict';

    var AC = window.ArcadeCommon;
    var t = AC.i18n.t;
    var clamp = AC.math.clamp;
    var PI2 = Math.PI * 2;
    var Rules = window.DartsRules;
    var match = null, viewMatch = null, online = null, net = null, netUser = null;
    var room = null, lobby = null, sending = false, seenThrow = null, onlineMatchId = null;
    var localRoom = null, onlineLoading = null, observedOnlinePhase = null, lastRoomSnapshot = null;
    var localController = 'local-controller', localSeatSerial = 0;
    var hud = null, historyView = null, throwGuide = null;
    var feedback = window.DartsFeedback.create(), feedbackState = feedback.snapshot(Date.now());
    var pendingFeedbackEvent = null, feedbackKey = '', presentationTurnKey = '', handoffPressKey = null;
    var cpuGesture = null, cpuRandom = null, cpuPending = null, lastCpuThrow = null;
    var CPU_THINK_MS = 900;

    // =================================================================
    // i18n (gameplay strings; launcher card strings live in launcher.js)
    // =================================================================

    Object.assign(AC.i18n.STRINGS.en, {
        dartsLast: 'Last',
        dartsTotal: 'Total',
        dartsDarts: 'Darts',
        dartsDebug: 'Debug',
        dartsReady: 'Darts',
        dartsStartHintHtml: 'Start in the board or mode panel.',
        dartsThrowHelp: 'Press in the board or mode panel, flick upward, and release to throw.',
        dartsThrowAim: 'Direction and speed just before release determine the landing point. Flick sideways to steer; a faster upward flick usually lands higher.',
        dartsThrowStart: 'The press point does not affect your aim. Start wherever feels comfortable.',
        dartsGuideSwipe: 'Swipe up to throw',
        dartsGuideDrag: 'Drag upward and release',
        dartsGuideBelow: 'Start in the board area or the score panel below.',
        dartsGuideBeside: 'Start in the board area or the score panel on the right.',
        dartsGuideSwipeBelow: 'Swipe up here or in the panel below.',
        dartsGuideSwipeBeside: 'Swipe up here or in the right panel.',
        dartsGuideDragBelow: 'Drag up here or in the panel below.',
        dartsGuideDragBeside: 'Drag up here or in the right panel.',
        dartsGuideDismiss: 'Dismiss throwing hint',
        dartsGuideReview: 'Show throw-area hint in game',
        dartsMiss: 'Miss',
        dartsBull: 'Bull',
        dartsOuterBull: 'Outer Bull',
        dartsBullseye: 'Bullseye',
        dartsShort: 'Too soft — flick to throw',
        dartsThrowUp: 'Flick upward to throw',
        dartsFlickPrompt: 'Flick upward toward the board to throw',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        dartsLast: '上一鏢',
        dartsTotal: '累計',
        dartsDarts: '鏢數',
        dartsDebug: '除錯',
        dartsReady: '飛鏢',
        dartsStartHintHtml: '可從鏢靶或模式欄開始。',
        dartsThrowHelp: '在鏢靶或模式欄按住，往上甩動，放開投鏢。',
        dartsThrowAim: '放手前的滑動方向與速度決定落點：左右帶動會偏向該側，向上甩得越快，通常落得越高。',
        dartsThrowStart: '起手位置不影響瞄準，從順手的位置開始即可。',
        dartsGuideSwipe: '向上滑動投鏢',
        dartsGuideDrag: '向上拖曳，放開投鏢',
        dartsGuideBelow: '鏢靶區或下方計分區都能起手。',
        dartsGuideBeside: '鏢靶區或右側計分區都能起手。',
        dartsGuideSwipeBelow: '鏢靶或下方計分區皆可向上滑動投鏢。',
        dartsGuideSwipeBeside: '鏢靶或右側計分區皆可向上滑動投鏢。',
        dartsGuideDragBelow: '鏢靶或下方計分區皆可向上拖曳投鏢。',
        dartsGuideDragBeside: '鏢靶或右側計分區皆可向上拖曳投鏢。',
        dartsGuideDismiss: '關閉投鏢提示',
        dartsGuideReview: '在遊戲中顯示投鏢區域提示',
        dartsMiss: '脫靶',
        dartsBull: '紅心',
        dartsOuterBull: '外紅心',
        dartsBullseye: '紅心',
        dartsShort: '太輕——用甩的',
        dartsThrowUp: '要往上甩才會射出',
        dartsFlickPrompt: '朝鏢靶往上輕甩即可擲出',
    });

    Object.assign(AC.i18n.STRINGS.en, {
        dartsMode: 'Mode', dartsPractice: 'Practice', darts501: '501', dartsCricket: 'Cricket', dartsCountup: 'Count-Up',
        dartsMatch: 'Match', dartsBO1: '1 leg', dartsBO3: 'First to 2 legs', dartsTimer: 'Online turn timer',
        darts30s: '30 seconds', darts60s: '60 seconds', darts90s: '90 seconds',
        dartsSolo: 'Solo', dartsLocal: 'Local players', dartsOnline: 'Online', dartsRoom: 'Room', dartsPlayerA: 'Player A', dartsPlayerB: 'Player B',
        dartsPlayerC: 'Player C', dartsPlayerD: 'Player D', dartsLocal2: '2 players', dartsLocal3: '3 players', dartsLocal4: '4 players',
        dartsWithdrawn: 'Left', dartsThisTurn: 'This turn', dartsPreviousTurn: 'Last turn', dartsTarget: 'Target', dartsBullShort: 'Bull',
        dartsReleaseSpeed: 'Release speed', dartsPracticeTip: 'Press, flick upward, release.', dartsStatistics: 'Statistics',
        dartsYou: 'You', dartsGuest: 'Guest', dartsTurn: 'Turn', dartsDart: 'Dart', dartsRound: 'Round', dartsLeg: 'Leg',
        dartsWaiting: 'Waiting for opponent', dartsYourTurn: 'Your turn', dartsBust: 'BUST — turn score cancelled',
        dartsCheckout: 'CHECKOUT', dartsTimeout: 'Time up — turn passed', dartsLegWon: 'LEG WON', dartsMatchWon: 'MATCH WON',
        dartsDraw: 'DRAW — replay this leg', dartsNextLeg: 'Next leg', dartsAgain: 'Play again', dartsResults: 'Results / room',
        dartsTurnScore: 'Turn score', dartsPoints: 'Points', dartsRemaining: 'Remaining', dartsClosed: 'Closed',
        dartsAverage: 'Average / 3 darts', dartsBestRound: 'Best round', dartsBulls: 'Bulls', dartsTriple20s: 'Triple 20s',
        dartsRule501: 'Start at 501. Reach exactly zero with a double or inner Bull. Below zero, one remaining, or a non-double finish busts the whole turn.',
        dartsRuleCricket: 'Close 20–15 and Bull with three marks each. Extra marks score while any opponent has that target open. Close everything and match or beat every opponent’s points to win.',
        dartsRuleCountup: '8 rounds, 3 darts each. Highest total wins. Outer Bull 25, inner Bull 50. A tied online/local leg is replayed with the starter alternating.',
        dartsRulePractice: 'Unlimited throws. D toggles the gesture and trajectory view.',
        dartsLocalHint: 'X01 and Cricket support 2–4 players. Count-Up supports 1–4. Online rooms start with 2–4 players after every guest readies up.',
        dartsClose: 'Close', dartsGoogle: 'Sign in with Google', dartsGuestSignIn: 'Play as guest', dartsSignOut: 'Sign out',
        dartsSignInFirst: 'Sign in to create or join a room.', dartsCreate: 'Create room', dartsCode: 'Code', dartsJoin: 'Join',
        dartsCopy: 'Copy', dartsCopied: 'Copied!', dartsLeave: 'Leave room', dartsReadyUp: 'Ready', dartsReadyWait: 'Ready — waiting for host',
        dartsStartMatch: 'Start match', dartsHost: 'Host', dartsReadyTag: 'Ready', dartsOffline: 'Disconnected',
        dartsHostStarts: '2–4 players. The host starts after every guest is ready.',
        dartsRematch: 'Rematch', dartsRematchWait: 'Waiting for the host to reset the match.',
        dartsLeft: 'Last player remaining — match won by forfeit.', dartsRoomGone: 'Room closed. Return to solo play.',
        dartsNetError: 'Connection failed. Check your connection and try again.', dartsNotFound: 'Room not found',
        dartsFull: 'Room is full', dartsStarted: 'Match already started', dartsUnavailable: 'Online is unavailable',
        dartsSaved: 'Room settings are fixed until you leave.', dartsThrowRejected: 'Throw not accepted. Check the turn and connection, then try again.',
        dartsScoreFinal: 'Final score', dartsOfflineSolo: 'Play locally', dartsLegWins: 'Leg wins',
        dartsMark0: 'Open — no marks', dartsMark1: 'One mark', dartsMark2: 'Two marks', dartsMark3: 'Closed — three marks',
        dartsSettings: 'Settings', dartsHistory: 'History', dartsPlayers: 'Players', dartsAllPlayers: 'All players',
        dartsSettingsHint: 'Restart to change settings during a game. Online room settings are fixed until you leave.',
        dartsHistoryEmpty: 'No throws recorded yet.', dartsThrow: 'Throw', dartsInProgress: 'Turn in progress',
        dartsHistoryClock: 'The online turn timer continues while viewing history.',
        dartsHistoryLimit: 'Older records were trimmed. Showing the latest 500 turns, or 500 throws in Practice.',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        dartsMode: '模式', dartsPractice: '自由練習', darts501: '501', dartsCricket: 'Cricket', dartsCountup: 'Count-Up',
        dartsMatch: '賽制', dartsBO1: '一局決勝', dartsBO3: '先贏兩局', dartsTimer: '線上每回合時間',
        darts30s: '30秒', darts60s: '60秒', darts90s: '90秒',
        dartsSolo: '單人', dartsLocal: '同機遊玩', dartsOnline: '連線', dartsRoom: '房間', dartsPlayerA: '玩家A', dartsPlayerB: '玩家B',
        dartsPlayerC: '玩家C', dartsPlayerD: '玩家D', dartsLocal2: '2人', dartsLocal3: '3人', dartsLocal4: '4人',
        dartsWithdrawn: '已離開', dartsThisTurn: '本回合', dartsPreviousTurn: '上一回合', dartsTarget: '目標', dartsBullShort: '紅心',
        dartsReleaseSpeed: '放手速度', dartsPracticeTip: '按住、往上輕甩，再放開。', dartsStatistics: '詳細統計',
        dartsYou: '你', dartsGuest: '訪客', dartsTurn: '輪到', dartsDart: '第幾鏢', dartsRound: '回合', dartsLeg: '局',
        dartsWaiting: '等待對手投擲', dartsYourTurn: '輪到你投擲', dartsBust: '爆分（BUST）——本回合得分取消',
        dartsCheckout: '成功結鏢', dartsTimeout: '時間到——換人投擲', dartsLegWon: '本局獲勝', dartsMatchWon: '對戰獲勝',
        dartsDraw: '平手——重打本局', dartsNextLeg: '開始下一局', dartsAgain: '再玩一次', dartsResults: '結果／房間',
        dartsTurnScore: '本回合得分', dartsPoints: '分數', dartsRemaining: '剩餘分數', dartsClosed: '已關閉',
        dartsAverage: '每三鏢平均', dartsBestRound: '最佳回合', dartsBulls: '紅心次數', dartsTriple20s: '三倍20次數',
        dartsRule501: '從501分扣到恰好零分，最後一鏢必須是雙倍區或內紅心。低於零分、剩一分，或未以雙倍區結束，整個回合都不計分。',
        dartsRuleCricket: '20到15與紅心各需三個記號關閉。仍有對手尚未關閉時，多出的記號可得分。關閉全部目標且分數不低於所有對手即獲勝。',
        dartsRuleCountup: '共八回合，每回合三鏢，總分最高者獲勝。外紅心25分、內紅心50分。雙人平手時重打，並交換先手。',
        dartsRulePractice: '不限次數投擲。按D可切換手勢與軌跡視圖。',
        dartsLocalHint: 'X01與Cricket支援2–4人，Count-Up支援1–4人。線上房間可由2–4人開始，所有非房主玩家準備好後即可開局。',
        dartsClose: '關閉', dartsGoogle: '用Google登入', dartsGuestSignIn: '以訪客身分遊玩', dartsSignOut: '登出',
        dartsSignInFirst: '登入後即可建立或加入房間。', dartsCreate: '建立房間', dartsCode: '房號', dartsJoin: '加入',
        dartsCopy: '複製', dartsCopied: '已複製！', dartsLeave: '離開房間', dartsReadyUp: '準備好了', dartsReadyWait: '已準備，等待房主開始',
        dartsStartMatch: '開始對戰', dartsHost: '房主', dartsReadyTag: '準備', dartsOffline: '已離線',
        dartsHostStarts: '支援2–4人，所有非房主玩家準備好後，由房主開始。',
        dartsRematch: '再來一場', dartsRematchWait: '等待房主重新開局。',
        dartsLeft: '其他玩家都已離開，由你獲勝。', dartsRoomGone: '房間已關閉，已返回本機遊玩。',
        dartsNetError: '連線失敗，請確認網路後重試。', dartsNotFound: '找不到房間',
        dartsFull: '房間已滿', dartsStarted: '對戰已經開始', dartsUnavailable: '目前無法連線',
        dartsSaved: '離開房間後才能更改設定。', dartsThrowRejected: '這一鏢未被接受，請確認回合與連線後重試。',
        dartsScoreFinal: '最終分數', dartsOfflineSolo: '本機遊玩', dartsLegWins: '勝局',
        dartsMark0: '尚無記號', dartsMark1: '一個記號', dartsMark2: '兩個記號', dartsMark3: '三個記號，已關閉',
        dartsSettings: '設定', dartsHistory: '紀錄', dartsPlayers: '玩家', dartsAllPlayers: '所有玩家',
        dartsSettingsHint: '遊戲中需先重新開始才能修改設定；線上房間需先離開才能更改設定。',
        dartsHistoryEmpty: '尚無投擲紀錄。', dartsThrow: '投擲', dartsInProgress: '本回合進行中',
        dartsHistoryClock: '查看紀錄時，線上回合仍會繼續倒數。',
        dartsHistoryLimit: '較舊紀錄已省略，目前顯示最近500個回合；自由練習則為最近500鏢。',
    });

    Object.assign(AC.i18n.STRINGS.en, {
        dartsInvite: 'Invite / join',
        dartsLabelValue: function (label, value) { return label + ' ' + value; },
        dartsPlayerNumber: function (n) { return 'Player ' + n; },
        dartsCpuNumber: function (n) { return 'CPU ' + n; },
        dartsMinimumPlayers: function (mode, n) { return mode + ' requires at least ' + n + ' players.'; },
        dartsAddPlayer: 'Add local player', dartsRemovePlayer: 'Remove', dartsPlayerName: 'Player name', dartsPlayer: 'Player',
        dartsThisDevice: 'This device', dartsOtherDevice: 'Other device', dartsEnableInvite: 'Get invitation code',
        dartsBackLobby: 'Return to lobby', dartsResults: 'Return to lobby', dartsUnready: 'Cancel ready',
        dartsOff: 'Off', dartsUnlimited: 'Unlimited', dartsFirstTo3: 'First to 3 legs', dartsLegsToWin: 'Legs to win',
        dartsTimer: 'Turn timer', dartsRoundLimit: 'Round limit', dartsOutRule: 'Finish', dartsInRule: 'Start scoring',
        dartsOpenIn: 'Open In', dartsMasterIn: 'Master In', dartsDoubleIn: 'Double In',
        dartsOpenOut: 'Open Out', dartsMasterOut: 'Master Out', dartsDoubleOut: 'Double Out',
        dartsBullScoring: 'Bull scoring', dartsBull2550: 'Bull 25 / 50', dartsBull5050: 'Bull 50 / 50',
        dartsCricketScoring: 'Cricket scoring', dartsStandardCricket: 'Standard', dartsCutThroatCricket: 'Cut-Throat',
        dartsAutoCricket: 'By player count', dartsAdvanced: 'Advanced rules', dartsNotEntered: 'Not opened',
        dartsPenalties: 'Penalties', dartsCork: 'Closest to Bull', dartsCorkRound: 'Tiebreak', dartsDistance: 'Distance',
        dartsLowestWins: 'Lowest score wins', dartsHighestWins: 'Highest score wins', dartsRoundLimitReached: 'Round limit reached',
        dartsPracticeEnded: 'Practice ended', dartsNeedsPlayers: 'requires at least {n} players.',
        dartsMatchEnded: 'Match ended',
        dartsRulesLocked: 'Rules are locked for this match.', dartsWaitReady: 'Waiting for the other devices to get ready.',
        dartsRuleCountup: 'Accumulate points over the configured rounds. Every player receives the same number of turns. Tied leaders throw closest to Bull.',
        dartsRule501: 'Start at 501 and finish on exactly zero under the selected In / Out rules. A bust restores the score and opening state from the start of the turn.',
        dartsRuleCricket: 'Close 20–15 and Bull with three marks each. Extra marks score for you in Standard, or penalize applicable opponents in Cut-Throat.',
        dartsRoomGone: 'Connection to the room ended. Your local room is ready.',
        dartsSettingsHint: 'Choose the next game in the room. Active match rules stay locked.',
        dartsDraw: 'Tie — closest to Bull', dartsHistoryClock: 'The turn timer continues while viewing history.',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        dartsInvite: '邀請／加入',
        dartsLabelValue: function (label, value) { return label + value; },
        dartsPlayerNumber: function (n) { return '玩家' + n; },
        dartsCpuNumber: function (n) { return 'CPU' + n; },
        dartsMinimumPlayers: function (mode, n) { return mode + '至少需要' + n + '位玩家。'; },
        dartsAddPlayer: '新增同機玩家', dartsRemovePlayer: '移除', dartsPlayerName: '玩家名稱', dartsPlayer: '玩家',
        dartsThisDevice: '此裝置控制', dartsOtherDevice: '其他裝置控制', dartsEnableInvite: '取得邀請房號',
        dartsBackLobby: '返回大廳', dartsResults: '返回大廳', dartsUnready: '取消準備',
        dartsOff: '關閉', dartsUnlimited: '不限', dartsFirstTo3: '先贏三局', dartsLegsToWin: '獲勝所需局數',
        dartsTimer: '每回合時間', dartsRoundLimit: '回合上限', dartsOutRule: '結鏢條件', dartsInRule: '開分條件',
        dartsOpenIn: '不限開分', dartsMasterIn: '倍區／紅心開分', dartsDoubleIn: '雙倍開分',
        dartsOpenOut: '不限結鏢', dartsMasterOut: '倍區／紅心結鏢', dartsDoubleOut: '雙倍結鏢',
        dartsBullScoring: '紅心得分', dartsBull2550: '紅心25／50', dartsBull5050: '紅心50／50',
        dartsCricketScoring: 'Cricket計分', dartsStandardCricket: '標準', dartsCutThroatCricket: 'Cut-Throat',
        dartsAutoCricket: '依人數推薦', dartsAdvanced: '進階規則', dartsNotEntered: '尚未開分',
        dartsPenalties: '罰分', dartsCork: '比靶心', dartsCorkRound: '加賽', dartsDistance: '距離',
        dartsLowestWins: '低分獲勝', dartsHighestWins: '高分獲勝', dartsRoundLimitReached: '已達回合上限',
        dartsPracticeEnded: '練習結束', dartsNeedsPlayers: '至少需要{n}位玩家。',
        dartsMatchEnded: '比賽已結束',
        dartsRulesLocked: '本場規則已鎖定。', dartsWaitReady: '等待其他裝置準備。',
        dartsRuleCountup: '在設定的回合內累積得分，每位玩家都有相同回合數。最高分平手時加賽比靶心。',
        dartsRule501: '從501分扣至恰好零分，依所選開分與結鏢條件判定。爆分時，分數與開分狀態回復至本回合開始時。',
        dartsRuleCricket: '20到15與紅心各需三個記號關閉。標準玩法由多餘記號為自己得分；Cut-Throat則為符合條件的對手加罰分。',
        dartsRoomGone: '已結束房間連線，本機房間已準備好。',
        dartsSettingsHint: '在房間設定下一場玩法；進行中的比賽規則維持鎖定。',
        dartsDraw: '平手——加賽比靶心', dartsHistoryClock: '查看紀錄時，回合仍會繼續倒數。',
    });

    Object.assign(AC.i18n.STRINGS.en, {
        dartsX01: 'X01',
        dartsRuleX01: function (score) { return 'Start at ' + score + ' and finish on exactly zero under the selected In / Out rules. A bust restores the score and opening state from the start of the turn.'; },
        dartsOpeningCork: 'Starting-player Cork', dartsLimitCork: 'Round-limit Cork', dartsTieCork: 'Tiebreak Cork',
        dartsCorkAttempt: function (n) { return 'Cork round ' + n; },
        dartsOpeningCorkStatus: 'Opening Cork', dartsTieCorkStatus: 'Tiebreak Cork', dartsLimitCorkStatus: 'Limit Cork',
        dartsCorkStarts: 'Closest to Bull starts.', dartsCorkWins: 'Closest to Bull wins.',
        dartsCorkTurnOf: function (name) { return name + "'s Cork"; }, dartsCorkDart: 'Dart 1',
        dartsCorkWaiting: 'Waiting', dartsCorkAgain: 'Rethrow', dartsCorkExcluded: 'Not in this round', dartsCorkForfeited: 'Forfeited',
        dartsCorkRethrow: function (round) { return 'Tie · Eligible players rethrow · Round ' + round; },
        dartsCorkLimitReached: function (rounds) { return rounds + '-round limit reached'; },
        dartsCorkLimitDecider: 'Cork decider · Closest to Bull wins.',
        dartsCorkTieNotice: 'Tied result · Cork', dartsCorkRethrowTitle: 'Tie · Cork again',
        dartsCorkStarter: function (name) { return name + ' starts the first leg'; },
        dartsResultLimitCork: function (rounds, distance) { return rounds + '-round limit reached · Won by closest to Bull' + (distance ? ' · Distance: ' + distance : '') + '.'; },
        dartsTurnOf: function (name) { return name + "'s turn"; },
        dartsDartProgress: function (n, total) { return 'Dart ' + n + '/' + total; },
        dartsRoundProgress: function (n, total) { return 'Round ' + n + '/' + total; },
        dartsLegNumber: function (n) { return 'Leg ' + n; },
        dartsMatchFormat: function (n) { return n === 1 ? 'One leg' : 'First to ' + n + ' legs'; },
        dartsHandoffTitle: function (name) { return name + "'s Turn"; },
        dartsHandoffMessage: 'Pass the device to the next player.', dartsHandoffReady: 'Ready to Throw',
        dartsBustTitle: 'BUST',
        dartsBustRestored: function (score) { return 'Turn cancelled · Score restored to ' + score; },
        dartsResultCheckout: 'Finished on exactly zero under the selected Out rule.',
        dartsResult501Limit: function (rounds, score) { return rounds + ' rounds completed · Lowest remaining score: ' + score + '.'; },
        dartsResultStandardClosed: function (score) { return 'All targets closed with ' + score + ' points, matching or beating every opponent.'; },
        dartsResultCutthroatClosed: function (score) { return 'All targets closed with ' + score + ' penalty points, no higher than any opponent.'; },
        dartsResultStandardLimit: function (rounds, score) { return rounds + ' rounds completed · Highest score: ' + score + '.'; },
        dartsResultCutthroatLimit: function (rounds, score) { return rounds + ' rounds completed · Lowest penalty score: ' + score + '.'; },
        dartsResultCountup: function (rounds, score) { return rounds + ' rounds completed · Highest total: ' + score + '.'; },
        dartsResultCork: function (distance) { return 'Won the closest-to-Bull tiebreak' + (distance ? ' · Distance: ' + distance : '') + '.'; },
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        dartsX01: 'X01',
        dartsRuleX01: function (score) { return '從' + score + '分扣至恰好零分，依所選開分與結鏢條件判定。爆分時，分數與開分狀態回復至本回合開始時。'; },
        dartsOpeningCork: '先手比靶心', dartsLimitCork: '回合上限比靶心', dartsTieCork: '平手比靶心',
        dartsCorkAttempt: function (n) { return '第' + n + '輪'; },
        dartsOpeningCorkStatus: '開局比靶心', dartsTieCorkStatus: '平手比靶心', dartsLimitCorkStatus: '比靶心決勝',
        dartsCorkStarts: '最接近靶心者取得先手', dartsCorkWins: '最接近靶心者獲勝',
        dartsCorkTurnOf: function (name) { return name + '的比靶心'; }, dartsCorkDart: '第1鏢',
        dartsCorkWaiting: '待投', dartsCorkAgain: '重投', dartsCorkExcluded: '本輪不參與', dartsCorkForfeited: '未完成',
        dartsCorkRethrow: function (round) { return '平手，參與者重投 · 第' + round + '輪'; },
        dartsCorkLimitReached: function (rounds) { return '已達' + rounds + '回合上限'; },
        dartsCorkLimitDecider: '進入比靶心決勝',
        dartsCorkTieNotice: '平手加賽 · 比靶心', dartsCorkRethrowTitle: '平手，重投比靶心',
        dartsCorkStarter: function (name) { return name + '取得先手'; },
        dartsResultLimitCork: function (rounds, distance) { return '已達' + rounds + '回合上限，以比靶心決勝' + (distance ? '，勝者距離' + distance : '') + '。'; },
        dartsTurnOf: function (name) { return name + '的回合'; },
        dartsDartProgress: function (n, total) { return '第' + n + '/' + total + '鏢'; },
        dartsRoundProgress: function (n, total) { return '第' + n + '/' + total + '回合'; },
        dartsLegNumber: function (n) { return '第' + n + '局'; },
        dartsMatchFormat: function (n) { return n === 1 ? '一局決勝' : '先贏' + n + '局'; },
        dartsHandoffTitle: function (name) { return '輪到' + name; },
        dartsHandoffMessage: '請將裝置交給下一位玩家', dartsHandoffReady: '準備投鏢',
        dartsBustTitle: 'BUST · 爆分',
        dartsBustRestored: function (score) { return '本回合得分取消，剩餘分數回復為' + score; },
        dartsResultCheckout: '依本場結鏢條件扣至恰好零分。',
        dartsResult501Limit: function (rounds, score) { return '已完成' + rounds + '回合，以最低剩餘分數' + score + '分獲勝。'; },
        dartsResultStandardClosed: function (score) { return '已關閉所有目標，得分' + score + '分且不低於任何對手。'; },
        dartsResultCutthroatClosed: function (score) { return '已關閉所有目標，罰分' + score + '分且不高於任何對手。'; },
        dartsResultStandardLimit: function (rounds, score) { return '已完成' + rounds + '回合，以最高得分' + score + '分獲勝。'; },
        dartsResultCutthroatLimit: function (rounds, score) { return '已完成' + rounds + '回合，以最低罰分' + score + '分獲勝。'; },
        dartsResultCountup: function (rounds, score) { return '已完成' + rounds + '回合，以最高總分' + score + '分獲勝。'; },
        dartsResultCork: function (distance) { return '加賽比靶心，以最接近靶心獲勝' + (distance ? '，距離' + distance : '') + '。'; },
    });

    // =================================================================
    // TUNING — every feel knob lives here. Nothing below should hide a
    // magic number; tweak these after playtesting.
    // World units are millimetres; the board faces the player at +Z and
    // the hand throws from (0, handYOffset, 0) just below board centre.
    // =================================================================

    var TUNING = {
        // --- gesture sampling / release analysis ---
        smoothing: 0.35,          // EMA factor applied to the raw samples (0 = none, 1 = instant). Tames sensor noise.
        releaseWindowMs: 110,     // the final slice of the gesture used to estimate the release tangent (NOT just the last 2 samples)
        releaseRecencyBias: 2.0,  // >1 weights samples nearer the release moment more heavily within the window
        minGestureMs: 55,         // flicks shorter than this read as a tap → ignored (no throw)
        minReleaseSpeed: 150,     // logical px/s; a release slower than this is "too soft" → ignored
        maxReleaseSpeed: 3200,    // clamp absurd flings so one jerky sample can't launch a rocket
        minUpSpeed: 130,          // logical px/s; the release must be heading UP by at least this. A flat / downward flick is "throwing at the floor" → rejected, so only upward throws exist (and only they set the extremes).

        // --- gesture (logical px) → world velocity (mm/s) ---
        // Samples are normalised to the canvas' logical space (see fieldDelta), so the same
        // physical swipe throws the same on any screen size. These scales turn that gesture
        // velocity into the dart's lateral / vertical launch velocity.
        // EQUAL sensitivity on both axes: the same finger speed sideways or upward tilts the
        // throw by the same angle (aimScaleX === aimScaleY). These are scaled to ~75% of the
        // earlier pass to TIGHTEN the whole reachable area; with the loft weaker against
        // gravity the natural flick also sits a little below the bull, which reads lower
        // overall. Raise both together to widen the spread; use handYOffset to move the
        // centre up/down. Board scoring radius is 170 mm.
        aimScaleX: 1.57,          // world mm/s of launch velocity per logical px/s of release motion — lateral
        aimScaleY: 1.40,          // world mm/s of launch velocity per logical px/s of release motion — vertical (kept equal to X on purpose)
        pitchOffsetDeg: -0.5,        // rotate the final launch direction: + = up, - = down (degrees, clamped to ±30). Preserves gesture mapping/speed; camera and release height stay fixed.

        // --- forward throw / tempo (the compressed "power") ---
        boardDistance: 2370,      // mm from the hand to the board plane along +Z
        baseForward: 12600,       // mm/s forward launch speed at tempo 1.0 (board reached in boardDistance/baseForward ≈ 0.24 s). Higher speed = flatter arc (drop ∝ 1/v²); the aimScales were scaled up by the same factor so the landing mapping is unchanged.
        refReleaseSpeed: 700,     // logical px/s release speed that maps to tempo 1.0
        tempoSensitivity: 0.15,   // how strongly flick speed shifts tempo. Low = compressed, so pace barely changes the flight time → aim stays predictable.
        tempoMin: 0.90,           // tempo floor  (≈ slow throw)
        tempoMax: 1.10,           // tempo ceiling (≈ fast throw)

        // --- ballistics after release (kept deliberately simple) ---
        gravity: 4900,            // mm/s² downward (artistic). The arc now comes mostly from the finite throw SPEED (baseForward): a faster dart drops less (drop ∝ 1/v²), which is the physically honest way to flatten the parabola, so leave gravity constant and flatten via baseForward instead.
        handYOffset: -272,        // mm; release height relative to board centre. Lower = the same flick lands lower. (Lowered to absorb the smaller drop once the throw got faster, so the aim centre stays where it was.)

        // --- determinism escape hatch (future). Keep 0 for a fully repeatable prototype. ---
        releaseNoise: 0,          // optional ± mm/s of white noise added to launch velocity. 0 = identical gesture → identical throw.

        // --- board geometry (standard dartboard, mm radii) ---
        boardRadiusMM: 170,       // outer edge of the scoring (double) ring
        rInnerBull: 6.35,         // 50
        rOuterBull: 15.9,         // 25
        rTripleInner: 99,
        rTripleOuter: 107,
        rDoubleInner: 162,
        rDoubleOuter: 170,

        // --- pseudo-3D camera / projection ---
        // viewFocal is the RELATIVE VIEW SIZE (a focal length, px): bigger = everything looks
        // larger (zoom in). On-screen scale at a world depth d is viewFocal / d, so:
        //   • board / numbers / dart TIP (end) live at the board plane → size ∝ viewFocal/(boardDistance+camBack): BOTH distance and view size shrink/grow them.
        //   • dart START (the hand, at the camera's own distance camBack) → size ∝ viewFocal/camBack: only the view size, never the board distance.
        // So moving the board farther now genuinely makes it look smaller. (~4050 keeps the board near its current on-screen size at the current distance.)
        viewFocal: 3150,          // relative view size / focal length (px)
        camBack: 2500,            // mm the camera sits behind the hand (controls how much near things loom)
        camY: 0,                  // camera height in world Y (0 = level with board centre / the bull)
        camDollyFrac: 0.6,        // FRACTION of the way to the board the camera travels by impact, tracking the dart. Scales with distance (a far board still "walks in" strongly). 0 = static camera. The trajectory behind the camera is clipped, so this can exceed camBack safely.
        camDollyMinDistance: 4200, // only dolly when the board is at least this far; nearer than this it reads fine with a static view. (The default boardDistance is below this → no dolly.)
        dartLoomMax: 2.2,         // how much bigger than the board-plane size the dart may get as it nears the camera (its "loom"). Capped like this, the dart keeps the SAME size relative to the board at any distance — a far board gives a proportionally smaller launch dart, not a giant one. (2.2 ≈ the default look.)
        boardCenterX: 240,        // board centre on the canvas (logical px)
        boardCenterY: 250,

        // --- flight / pacing ---
        flightSpeedScale: 1.0,    // 1 = real time; <1 slows the flight down for inspection
        resultHoldSec: 0.9,       // how long the landed result lingers before a fresh dart is ready
        earlyMissDropMM: 210,     // a dart that is already DESCENDING and has fallen below −this (well under the board) can't recover → end the flight early and show the miss, instead of flying/dollying the whole way. Set huge to disable.
        stuckMaxRadiusMM: 480,    // don't stick a dart in the board farther than this from centre; a clear off-board miss just shows the text (no stray mark)
        maxStuckDarts: 6,         // how many landed darts stay stuck in the board
        trajShowSec: 1.4,         // how long the committed flight path stays drawn after landing

        debug: false,             // D toggles the practice/debug visualisation
    };

    // Standard dartboard sector order, clockwise from the 20 at the top.
    var SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

    var W = 480, H = 600;
    var DART_LEN_MM = 30;   // the dart's PHYSICAL length (world mm). Drawn through the projection, so its on-screen size = DART_LEN_MM × scale-at-its-depth: the tip (at the board) tracks the board's size (distance + view), while the launch size depends only on the view. Flying and stuck are the same object → no jump.

    // =================================================================
    // State
    // =================================================================

    var G = {
        dartState: 'ready',   // 'ready' → 'flying' → 'landed' → 'ready'
        flightT: 0,           // seconds elapsed in the current flight
        throw: null,          // the committed throw { pos, vel, tempo }
        throwAngle: 0,        // screen-space heading of the throw (launch → impact); the dart points this way in flight AND stuck, so the two are one continuous object
        landDolly: 0,         // the camera dolly value at the moment of landing; the pull-back eases from here (so an early-ended flight doesn't snap the view)
        analysis: null,       // the gesture analysis behind G.throw (kept for debug)
        impact: null,         // { x, y } board-plane mm, once computed
        result: null,         // { score, label, mult, region, miss }
        resultT: 0,           // countdown while a result lingers
        traj: null,           // sampled 3D flight points (debug + path draw)
        trajT: 0,             // countdown for drawing the committed path
        stuck: [],            // recent landed darts [{ x, y, result }]
        total: 0,             // session points
        darts: 0,             // session throws
        last: null,           // last result (for the HUD)
        practiceHistory: [],
        practiceHistoryDropped: 0,
        hint: null,           // transient on-canvas message (e.g. "too soft")
        hintT: 0,             // seconds the hint lingers
    };

    var shell = null;
    var gesture = null;       // active recording { t0, sx, sy, scaleX, scaleY, samples }
    var camDolly = 0;         // current forward camera dolly (mm); eased in render() from the dart's progress

    var canvas = document.getElementById('stage');
    var ctx = canvas.getContext('2d');
    var dom = {
        debugBtn: document.getElementById('debug-btn'),
    };
    var fontCache = null;

    function getFont() {
        if (!fontCache) {
            fontCache = (getComputedStyle(document.body).getPropertyValue('--font-display') || '').trim()
                || '"Segoe UI", system-ui, sans-serif';
        }
        return fontCache;
    }

    function fitCanvas() {
        var displayScale = Math.max(1, canvas.getBoundingClientRect().width / W);
        var dpr = Math.min(window.devicePixelRatio || 1, 2) * displayScale;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // =================================================================
    // Pseudo-3D projection
    //
    // The board is a flat disc facing the camera at Z = boardDistance. A world point
    // projects with a fixed focal length (viewFocal), so on-screen scale = viewFocal / depth:
    // a nearer thing (small depth) looms larger. Because the focal length is independent of
    // the board distance, moving the board farther genuinely makes it look smaller, while the
    // hand (always camBack from the camera) keeps its size.
    // =================================================================

    function focal() { return TUNING.viewFocal; }   // the relative view size (focal length, px)

    // Camera depth of a world Z, accounting for the forward dolly (the camera moves +Z by camDolly).
    function depthOf(z) { return z + TUNING.camBack - camDolly; }
    function boardScaleNow() { return focal() / depthOf(TUNING.boardDistance); }   // px per mm at the board, with the current dolly

    function project(x, y, z) {
        var s = focal() / depthOf(z);
        return {
            sx: TUNING.boardCenterX + x * s,
            sy: TUNING.boardCenterY - (y - TUNING.camY) * s,
            scale: s,
        };
    }

    // =================================================================
    // Gesture analysis  (pure — no rendering, no globals beyond TUNING)
    //
    // Input: samples [{ t (s), x, y (logical px, y up-positive, first = {0,0,0}) }].
    // Output: a smoothed path + a recency-weighted release velocity over the final
    // window, plus validity. We deliberately AVOID using only the last sample pair:
    // pointer/touch jitter would make that unstable.
    // =================================================================

    function analyseGesture(samples) {
        var n = samples.length;
        if (n < 2) return { valid: false, reason: 'short', samples: samples, smoothed: samples };

        var dur = samples[n - 1].t - samples[0].t;

        // 1) EMA-smooth the raw path (used for both the release velocity and the debug draw).
        var a = TUNING.smoothing;
        var sm = new Array(n);
        var sx = samples[0].x, sy = samples[0].y;
        for (var i = 0; i < n; i++) {
            if (i === 0) { sx = samples[0].x; sy = samples[0].y; }
            else { sx += a * (samples[i].x - sx); sy += a * (samples[i].y - sy); }
            sm[i] = { t: samples[i].t, x: sx, y: sy };
        }

        // 2) Recency-weighted velocity over the final releaseWindowMs. Each consecutive
        // pair contributes its instantaneous velocity, weighted by how close it sits to
        // the release moment (releaseRecencyBias) and by its own dt.
        var endT = sm[n - 1].t;
        var winStart = endT - TUNING.releaseWindowMs / 1000;
        var span = endT - winStart || 1;
        var vx = 0, vy = 0, wsum = 0, used = 0;
        for (var j = 1; j < n; j++) {
            if (sm[j].t < winStart) continue;
            var dt = sm[j].t - sm[j - 1].t;
            if (dt <= 0) continue;
            var ivx = (sm[j].x - sm[j - 1].x) / dt;
            var ivy = (sm[j].y - sm[j - 1].y) / dt;
            var recency = (sm[j].t - winStart) / span;          // 0 at window start → 1 at release
            var w = Math.pow(clamp(recency, 0, 1), TUNING.releaseRecencyBias) * dt;
            vx += ivx * w; vy += ivy * w; wsum += w; used++;
        }

        // 3) Fallback if the window held too little (a very brief flick on a slow pointer):
        // use the last few samples so we still get a stable tangent, never a lone pair.
        if (wsum <= 0 || used < 1) {
            var k = Math.max(0, n - 4);
            var ddt = sm[n - 1].t - sm[k].t;
            if (ddt <= 0) return { valid: false, reason: 'short', dur: dur, samples: samples, smoothed: sm };
            vx = (sm[n - 1].x - sm[k].x) / ddt;
            vy = (sm[n - 1].y - sm[k].y) / ddt;
            winStart = sm[k].t;
        } else {
            vx /= wsum; vy /= wsum;
        }

        var speed = Math.hypot(vx, vy);
        var reason = null;
        if (dur * 1000 < TUNING.minGestureMs) reason = 'short';
        else if (speed < TUNING.minReleaseSpeed) reason = 'soft';
        else if (vy < TUNING.minUpSpeed) reason = 'down';   // flat / downward release → not a real (upward) throw

        return {
            valid: !reason,
            reason: reason,
            dur: dur,
            releaseVel: { x: vx, y: vy },
            speed: speed,
            winStart: winStart,
            samples: samples,
            smoothed: sm,
        };
    }

    // Map a valid gesture analysis to a world-space throw. Forward (Z) velocity is a
    // COMPRESSED function of flick speed (tempo); lateral/vertical velocity come straight
    // from the release tangent. No randomness unless releaseNoise is set.
    function computeThrow(an) {
        var T = TUNING;
        var tempo = 1 + (an.speed / T.refReleaseSpeed - 1) * T.tempoSensitivity;
        tempo = clamp(tempo, T.tempoMin, T.tempoMax);
        var capped = Math.min(an.speed, T.maxReleaseSpeed) / (an.speed || 1);
        var vx = an.releaseVel.x * capped * T.aimScaleX;
        var vy = an.releaseVel.y * capped * T.aimScaleY;
        var vz = T.baseForward * tempo;
        if (T.releaseNoise > 0) {   // kept off by default → deterministic
            vx += (Math.random() * 2 - 1) * T.releaseNoise;
            vy += (Math.random() * 2 - 1) * T.releaseNoise;
        }
        // Apply a fixed pitch to the complete gesture-derived velocity, like tilting
        // the throwing frame without moving the camera. A rigid rotation preserves
        // speed and angular relationships between gestures; 0 keeps the original throw.
        var pitch = clamp(T.pitchOffsetDeg, -30, 30) * Math.PI / 180;
        if (pitch !== 0) {
            var originalVy = vy, cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
            vy = originalVy * cosPitch + vz * sinPitch;
            vz = vz * cosPitch - originalVy * sinPitch;
        }
        return { pos: { x: 0, y: T.handYOffset, z: 0 }, vel: { x: vx, y: vy, z: vz }, tempo: tempo };
    }

    // =================================================================
    // Ballistics  (pure)
    // =================================================================

    function dartPosAt(th, time) {
        return {
            x: th.pos.x + th.vel.x * time,
            y: th.pos.y + th.vel.y * time - 0.5 * TUNING.gravity * time * time,
            z: th.pos.z + th.vel.z * time,
        };
    }
    // Exact board-plane impact (closed form — z is linear in time since there's no drag).
    function computeImpact(th) {
        var tHit = TUNING.boardDistance / th.vel.z;
        var p = dartPosAt(th, tHit);
        return { x: p.x, y: p.y, t: tHit };
    }
    // Sample the flight into a 3D polyline for drawing + the debug side/top views.
    function sampleTrajectory(th, tHit) {
        var pts = [], steps = 28;
        for (var i = 0; i <= steps; i++) {
            pts.push(dartPosAt(th, tHit * i / steps));
        }
        return pts;
    }

    // =================================================================
    // Scoring (standard board)  (pure)
    // =================================================================

    function scoreAt(bx, by) {
        return Rules.scoreAt(bx, by, TUNING);
    }

    function resultLabel(res) {
        if (!res) return '';
        if (res.region === 'miss') return t('dartsMiss');
        if (res.region === 'bullseye') return t('dartsLabelValue', t('dartsBullseye'), res.score);
        if (res.region === 'bull') return t('dartsLabelValue', t('dartsOuterBull'), res.score);
        var prefix = res.mult === 3 ? 'T' : res.mult === 2 ? 'D' : 'S';
        return prefix + res.base + ' = ' + res.score;
    }

    // =================================================================
    // Input — relative gesture, startable anywhere on the page.
    //
    // Press = virtual hand origin (0,0,0). We record relative motion only, so the
    // physical press point never affects the throw (crucial for touch). Deltas are
    // normalised into the canvas' logical space so the same swipe throws the same at
    // any display size, and y is flipped so flicking UP is positive.
    // =================================================================

    function canThrow() {
        return shell && shell.isPlaying() && !sending && !document.querySelector('.darts-dialog[open]') &&
            !feedback.snapshot(Date.now()).blocking &&
            roomData().phase === 'playing' && match && match.status === 'playing' && controlsPlayer(match.active) &&
            (!usesSharedMatch() || Date.now() >= match.readyAt) && (!match.turnMs || Date.now() < match.turnStartedAt + match.turnMs) &&
            (G.dartState === 'ready' || G.dartState === 'landed');
    }

    function beginGesture(e) {
        var rect = canvas.getBoundingClientRect();
        gesture = {
            pointerId: e.pointerId,
            t0: performance.now(),
            sx: e.clientX, sy: e.clientY,
            scaleX: W / (rect.width || W),      // CSS px → logical px
            scaleY: H / (rect.height || H),
            samples: [{ t: 0, x: 0, y: 0 }],
        };
        // A press while a result lingers skips straight to a fresh dart so throws stay snappy.
        if (G.dartState === 'landed') freshDart();
    }
    function recordGesture(e) {
        if (!gesture) return;
        var ts = (performance.now() - gesture.t0) / 1000;
        var gx = (e.clientX - gesture.sx) * gesture.scaleX;
        var gy = -(e.clientY - gesture.sy) * gesture.scaleY;   // screen-down is +, flip so up is +
        gesture.samples.push({ t: ts, x: gx, y: gy });
    }
    function endGesture() {
        if (!gesture) return;
        var samples = gesture.samples;
        gesture = null;
        if (!canThrow()) return;
        submitGesture(samples, function () { throwGuide.complete(); });
    }
    function submitGesture(samples, onAccepted) {
        var an = analyseGesture(samples);
        G.analysis = an;
        if (!an.valid) {
            // Not a throw (tap / too soft / not upward) — keep the dart, but remember it for debug.
            if (!isCpuPlayer(match && match.active)) flashHint(an.reason === 'down' ? t('dartsThrowUp') : t('dartsShort'));
            return false;
        }
        if (match && match.turnMs > 0 && Date.now() >= match.turnStartedAt + match.turnMs) return false;
        launchThrow(an, onAccepted);
        return true;
    }

    // A tap / too-soft / non-upward gesture is deliberately NOT a throw — but it must still
    // visibly react so it never reads as "nothing happened". Show a brief on-board hint + a cue.
    function flashHint(text) {
        G.hint = text;
        G.hintT = 1.1;
        AC.audio.tone(220, 0.06, { type: 'sine', volume: 0.05, slideTo: 180 });
    }

    function launchThrow(an, onAccepted) {
        var th = computeThrow(an);
        var impact = computeImpact(th);
        G.analysis = an;
        if (usesSharedMatch()) {
            sending = true;
            online.submit(th).then(function (accepted) {
                if (!accepted) flashHint(t('dartsThrowRejected'));
                else if (onAccepted) onAccepted();
            }).catch(showNetError).finally(function () { sending = false; syncGameUi(); });
            return;
        }
        presentThrow(th, impact);
        if (onAccepted) onAccepted();
    }

    function presentThrow(th, impact) {
        gesture = null;
        G.throw = th;
        G.throwPhase = usesSharedMatch() && match.lastDart ? match.lastDart.phase : match ? match.phase : 'play';
        G.impact = impact;
        G.traj = sampleTrajectory(th, impact.t);
        // Fix the dart's on-screen heading from the overall path (launch → impact): it reads
        // as "flying up into the board" and stays consistent when it sticks (no orientation pop).
        var ls = project(th.pos.x, th.pos.y, th.pos.z);
        var is = project(impact.x, impact.y, TUNING.boardDistance);
        G.throwAngle = Math.atan2(is.sy - ls.sy, is.sx - ls.sx);
        G.result = null;
        G.dartState = 'flying';
        G.flightT = 0;
        sndThrow(th.tempo);
    }

    function landDart() {
        var physical = scoreAt(G.impact.x, G.impact.y);
        var res = match ? Rules.scoreResult(match, physical) : physical;
        G.result = res;
        if (lastCpuThrow && lastCpuThrow.launch === G.throw) {
            lastCpuThrow.result = res; lastCpuThrow.error = Math.hypot(G.impact.x - lastCpuThrow.target.x, G.impact.y - lastCpuThrow.target.y);
        }
        G.dartState = 'landed';
        G.resultT = TUNING.resultHoldSec;
        G.trajT = TUNING.trajShowSec;
        if (G.throwPhase !== 'cork') { G.darts += 1; G.total += res.score; }
        G.last = Object.assign({}, res, { label: resultLabel(res) });
        G.landDolly = camDolly;   // freeze the current dolly so the pull-back eases from here (no snap on an early end)
        // Only stick a dart that actually landed on/near the board; a clear off-board miss just shows the text.
        if (Math.hypot(G.impact.x, G.impact.y) <= TUNING.stuckMaxRadiusMM) {
            G.stuck.push({ x: G.impact.x, y: G.impact.y, result: res, angle: G.throwAngle });
            if (G.stuck.length > TUNING.maxStuckDarts) G.stuck.shift();
        }
        sndHit(res);
        if (match && !usesSharedMatch()) {
            var accepted = Rules.throwDart(match, match.active, physical, Date.now(), G.impact);
            queueDartFeedback(accepted);
            acceptLocal(accepted);
        } else if (room) {
            viewMatch = match;
            // A timeout can supersede the accepted flight before it lands. Never
            // reinterpret a previous dart as an effect for that newer turn.
            if (match.lastThrow && match.lastDart && match.lastThrow.seq === match.seq) {
                queueDartFeedback(match, match.matchId + ':' + match.lastThrow.seq);
            }
        } else {
            G.practiceHistory.push({ uid: 'practice', leg: 0, turn: G.darts, round: 0, darts: [res],
                points: res.score, score: G.total, reason: 'complete', finished: true });
            if (G.practiceHistory.length > Rules.HISTORY_LIMIT) { G.practiceHistory.shift(); G.practiceHistoryDropped++; }
        }
        syncHud();
        syncGameUi();
    }

    function freshDart() {
        G.dartState = 'ready';
        G.throw = null;
        G.throwPhase = null;
        G.impact = null;
        G.result = null;
        G.flightT = 0;
    }

    // Pointer handlers. Down starts a recording anywhere in the play zone; move/up live on
    // the window so a gesture that strays off the board still completes (like Bullet Storm).
    function onPointerDown(e) {
        if (!canThrow() || gesture || e.isPrimary === false || e.button > 0) return;
        if (!e.target.closest || !e.target.closest('#throw-surface, #mode-panel')) return;
        if (e.target.closest('button, a, input, select, textarea, summary, [role="button"], .overlay, .leg-result')) return;
        AC.audio.unlock();
        beginGesture(e);
        if (e.cancelable) e.preventDefault();
    }
    function onPointerMove(e) {
        if (!gesture || e.pointerId !== gesture.pointerId) return;
        recordGesture(e);
        if (e.cancelable) e.preventDefault();
    }
    function onPointerUp(e) {
        if (!gesture || e.pointerId !== gesture.pointerId) return;
        endGesture();
    }
    function onPointerCancel() { gesture = null; }

    // =================================================================
    // Sound (built on the shared synth)
    // =================================================================

    function sndThrow(tempo) {
        AC.audio.noise(0.12, { volume: 0.06, filter: { type: 'bandpass', freq: 900 + tempo * 500, to: 300 } });
    }
    function sndHit(res) {
        if (res.miss) { AC.audio.tone(150, 0.1, { type: 'triangle', volume: 0.07, slideTo: 90 }); return; }
        var f = res.region === 'bullseye' ? 1047 : res.region === 'bull' ? 784 : res.mult === 3 ? 988 : res.mult === 2 ? 740 : 523;
        AC.audio.tone(f, 0.09, { type: 'square', volume: 0.09, attack: 0.002 });
        AC.audio.noise(0.04, { volume: 0.04, filter: { type: 'highpass', freq: 1800 } });
    }

    // =================================================================
    // Simulation step
    // =================================================================

    function update(dt) {
        if (G.trajT > 0) G.trajT = Math.max(0, G.trajT - dt);
        if (G.hintT > 0) G.hintT = Math.max(0, G.hintT - dt);
        if (G.dartState === 'flying') {
            G.flightT += dt * TUNING.flightSpeedScale;
            var p = dartPosAt(G.throw, G.flightT);
            // End early if it has clearly fallen short: already descending and well below the
            // board, so it can only drop further — no point flying/dollying the rest.
            var vyNow = G.throw.vel.y - TUNING.gravity * G.flightT;
            if (p.z >= TUNING.boardDistance) landDart();
            else if (vyNow < 0 && p.y < -TUNING.earlyMissDropMM) landDart();
        } else if (G.dartState === 'landed') {
            G.resultT -= dt;
            if (G.resultT <= 0) freshDart();
        }
        tickCpu();
    }
    function tickCpu() {
        var now = Date.now(), effects = feedback.snapshot(now);
        if (!shell || !shell.isPlaying() || room || roomData().phase !== 'playing' || !match || match.status !== 'playing' ||
            !isCpuPlayer(match.active) || G.dartState !== 'ready' || effects.blocking || effects.resultPending ||
            document.querySelector('.darts-dialog[open]') || match.turnMs && now >= match.turnStartedAt + match.turnMs) {
            cpuPending = null; return;
        }
        var key = [match.matchId, match.leg, match.phase, match.round, match.seq, match.active].join(':');
        if (!cpuPending || cpuPending.key !== key) { cpuPending = { key: key, at: now + CPU_THINK_MS }; return; }
        if (now < cpuPending.at) return;
        cpuPending = null;
        var participant = match.participants[match.active];
        var target = window.DartsCpuStrategy.choose(match, match.active, participant.difficulty, cpuRandom);
        if (!target) return;
        var generated = cpuGesture.generate(target, participant.difficulty, cpuRandom);
        // The same entry point analyses human and CPU samples; only physics decides the hit.
        var launched = submitGesture(generated.samples);
        lastCpuThrow = { player: match.active, difficulty: participant.difficulty, target: target, samples: generated.samples,
            diagnostics: generated.diagnostics, accepted: launched, analysis: G.analysis,
            launch: launched ? G.throw : null, impact: launched ? G.impact : null };
    }

    // =================================================================
    // Rendering
    // =================================================================

    // Ease the forward dolly from the dart's own progress: the camera rides in with the
    // throw (board grows), then eases back out while the result lingers.
    function updateCamDolly() {
        // Gate by distance: a near board reads fine with a static view, so only dolly once
        // the board is far enough to warrant "walking in" with the throw. The travel is a
        // FRACTION of the distance, so a far board follows just as strongly as a near one.
        var full = (TUNING.boardDistance >= TUNING.camDollyMinDistance) ? TUNING.camDollyFrac * TUNING.boardDistance : 0;
        if (full <= 0) { camDolly = 0; return; }
        if (G.dartState === 'flying' && G.throw) {
            var pz = dartPosAt(G.throw, G.flightT).z;
            camDolly = full * clamp(pz / TUNING.boardDistance, 0, 1);   // ride in with the dart's progress
        } else if (G.dartState === 'landed') {
            camDolly = G.landDolly * clamp(G.resultT / TUNING.resultHoldSec, 0, 1);   // ease back from wherever the flight ended (no snap)
        } else {
            camDolly = 0;
        }
    }

    function render() {
        syncPresentation();
        updateCamDolly();
        drawBackground();
        drawBoard();
        drawStuckDarts();
        if ((G.dartState === 'flying' || G.dartState === 'landed') && G.throw) {
            if (G.trajT > 0) drawTrajectory();
            if (G.dartState === 'flying') drawFlyingDart();
        }
        syncThrowFeedback();
        if (TUNING.debug && (!match || match.mode === 'practice')) drawDebug();
        syncThrowGuide();
    }

    function syncThrowGuide() {
        if (throwGuide) throwGuide.sync(canThrow(), gesture, !G.hintT && !feedbackState.notice);
    }

    function syncThrowFeedback() {
        var toast = document.getElementById('hit-toast'); if (!toast) return;
        var finalDart = feedbackState.finalHit && feedbackState.finalHit.dart;
        var result = finalDart ? finalDart.result : G.dartState === 'landed' && G.resultT > 0 && G.result;
        var s = viewMatch || match;
        toast.hidden = !!(!finalDart && (feedbackState.blocking || feedbackState.notice) || s && s.status !== 'playing' && !feedbackState.resultPending ||
            roomData().phase === 'lobby') || G.hintT <= 0 && !result;
        toast.textContent = finalDart && finalDart.phase === 'cork' ? t('dartsCork') + ' · ' +
            t('dartsLabelValue', t('dartsDistance'), Number.isFinite(finalDart.distance) ? finalDart.distance.toFixed(1) + ' mm' : '—') :
            finalDart ? resultLabel(result) : G.hintT > 0 ? G.hint : result ? resultLabel(result) : '';
        toast.classList.toggle('danger', !finalDart && G.hintT > 0 || !!(result && result.miss));
    }

    function drawBackground() {
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#15202b');
        g.addColorStop(0.62, '#0f161e');
        g.addColorStop(1, '#0a0f15');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // a faint floor line under the board for a hint of depth (follows the board's drawn size)
        var floorY = TUNING.boardCenterY + boardScaleNow() * TUNING.boardRadiusMM + 70;
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, floorY);
        ctx.lineTo(W, floorY);
        ctx.stroke();
    }

    // Board colours (standard look).
    var COL = {
        wire: '#0b0e12',
        numberRing: '#141414',
        singleDark: '#1c1c1c',
        singleLight: '#e8d7ac',
        ringRed: '#d33a2c',
        ringGreen: '#2e8b57',
        bullOuter: '#2e8b57',
        bullInner: '#d33a2c',
        wireLine: 'rgba(190,190,190,0.28)',
    };

    function wedge(cx, cy, rIn, rOut, a0, a1, fill) {
        ctx.beginPath();
        ctx.arc(cx, cy, rOut, a0, a1);
        ctx.arc(cx, cy, rIn, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
    }

    function drawBoard() {
        var cx = TUNING.boardCenterX, cy = TUNING.boardCenterY;
        var s = boardScaleNow();   // dynamic: the board grows as the camera dollies in
        var rDoubleOut = TUNING.rDoubleOuter * s;
        var rDoubleIn = TUNING.rDoubleInner * s;
        var rTripOut = TUNING.rTripleOuter * s;
        var rTripIn = TUNING.rTripleInner * s;
        var rOutBull = TUNING.rOuterBull * s;
        var rInBull = TUNING.rInnerBull * s;
        var rNumber = rDoubleOut * 1.12;

        // number-ring backing + board shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
        ctx.beginPath(); ctx.arc(cx, cy, rNumber, 0, PI2); ctx.fillStyle = COL.numberRing; ctx.fill();
        ctx.restore();

        var half = (18 / 2) * Math.PI / 180;    // ±9° per sector
        for (var i = 0; i < 20; i++) {
            // sector i is centred at i*18° clockwise from the top; map to canvas angle (up = -90°)
            var centreCanvas = -Math.PI / 2 + i * 18 * Math.PI / 180;
            var a0 = centreCanvas - half, a1 = centreCanvas + half;
            var dark = (i % 2 === 0);                    // 20 (i=0) is a dark single
            var single = dark ? COL.singleDark : COL.singleLight;
            var ring = dark ? COL.ringRed : COL.ringGreen;
            wedge(cx, cy, rOutBull, rTripIn, a0, a1, single);       // inner single
            wedge(cx, cy, rTripIn, rTripOut, a0, a1, ring);         // triple
            wedge(cx, cy, rTripOut, rDoubleIn, a0, a1, single);     // outer single
            wedge(cx, cy, rDoubleIn, rDoubleOut, a0, a1, ring);     // double
        }

        // sector wires
        ctx.strokeStyle = COL.wireLine; ctx.lineWidth = 1;
        for (var k = 0; k < 20; k++) {
            var ang = -Math.PI / 2 + (k + 0.5) * 18 * Math.PI / 180;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(ang) * rOutBull, cy + Math.sin(ang) * rOutBull);
            ctx.lineTo(cx + Math.cos(ang) * rDoubleOut, cy + Math.sin(ang) * rDoubleOut);
            ctx.stroke();
        }
        // ring wires
        [rOutBull, rTripIn, rTripOut, rDoubleIn, rDoubleOut].forEach(function (rr) {
            ctx.beginPath(); ctx.arc(cx, cy, rr, 0, PI2); ctx.stroke();
        });

        // bulls
        ctx.beginPath(); ctx.arc(cx, cy, rOutBull, 0, PI2); ctx.fillStyle = COL.bullOuter; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, rInBull, 0, PI2); ctx.fillStyle = COL.bullInner; ctx.fill(); ctx.stroke();

        // numbers around the ring (scale with the board; small floor so a far board keeps them proportional, not oversized)
        ctx.fillStyle = '#efe7d0';
        ctx.font = '600 ' + Math.max(3, Math.round(rDoubleOut * 0.12)) + 'px ' + getFont();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (var m = 0; m < 20; m++) {
            var na = -Math.PI / 2 + m * 18 * Math.PI / 180;
            ctx.fillText(String(SECTORS[m]), cx + Math.cos(na) * rNumber, cy + Math.sin(na) * rNumber);
        }
    }

    // The ONE dart drawing used for both flight and the stuck mark, so there's no seam when
    // it lands: a needle whose TIP sits exactly at (tipX, tipY) — the impact — pointing along
    // `angle` (the throw's screen heading), with a barrel + fletching trailing behind it.
    // `len` scales with perspective so the flying dart and the stuck dart match in size.
    function drawDart(tipX, tipY, len, angle, opts) {
        opts = opts || {};
        var dx = Math.cos(angle), dy = Math.sin(angle);     // unit vector toward the tip (travel dir)
        var neckX = tipX - dx * len * 0.42, neckY = tipY - dy * len * 0.42;
        var backX = tipX - dx * len, backY = tipY - dy * len;
        var px = -dy, py = dx;                               // perpendicular, for the flights
        // All strokes scale with the drawn LENGTH, so the dart stays a crisp, slender shape
        // whether it looms up close or shrinks to a few px at a far board (no fat blob).
        var barrelW = Math.max(0.5, len * 0.13);
        var thinW = Math.max(0.35, len * 0.055);
        var tipR = Math.max(0.5, len * 0.06);
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
        if (opts.glow) { ctx.shadowColor = 'rgba(253,230,138,0.85)'; ctx.shadowBlur = Math.min(5, len * 0.16); }   // capped so a big (near) dart stays crisp, not a blurry halo
        // barrel (back → neck), thicker
        ctx.strokeStyle = opts.color || '#fde68a';
        ctx.lineWidth = barrelW;
        ctx.beginPath(); ctx.moveTo(backX, backY); ctx.lineTo(neckX, neckY); ctx.stroke();
        // needle (neck → tip), thin, ending exactly on the impact point
        ctx.lineWidth = thinW;
        ctx.beginPath(); ctx.moveTo(neckX, neckY); ctx.lineTo(tipX, tipY); ctx.stroke();
        ctx.shadowBlur = 0;
        // flights (a chevron of fletching) at the rear
        var fw = len * 0.24, ff = len * 0.28;
        ctx.lineWidth = thinW;
        ctx.beginPath();
        ctx.moveTo(backX + px * fw, backY + py * fw);
        ctx.lineTo(backX + dx * ff, backY + dy * ff);
        ctx.lineTo(backX - px * fw, backY - py * fw);
        ctx.stroke();
        // the exact tip (the hole in the board)
        ctx.fillStyle = opts.tipColor || '#fff7dc';
        ctx.beginPath(); ctx.arc(tipX, tipY, tipR, 0, PI2); ctx.fill();
        ctx.restore();
    }

    function drawStuckDarts() {
        for (var i = 0; i < G.stuck.length; i++) {
            var d = G.stuck[i];
            var pr = project(d.x, d.y, TUNING.boardDistance);
            var dscale = Math.min(pr.scale, boardScaleNow() * TUNING.dartLoomMax);
            var latest = (i === G.stuck.length - 1 && G.dartState === 'landed');
            drawDart(pr.sx, pr.sy, DART_LEN_MM * dscale, d.angle != null ? d.angle : -Math.PI / 2, {
                alpha: latest ? 1 : 0.55,
                color: latest ? '#fde68a' : 'rgba(226,226,226,0.85)',
                glow: latest,
            });
        }
    }

    function drawTrajectory() {
        if (!G.traj) return;
        ctx.save();
        ctx.globalAlpha = clamp(G.trajT / TUNING.trajShowSec, 0, 1) * 0.5;
        ctx.strokeStyle = 'rgba(125,211,252,0.9)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        var started = false;
        for (var i = 0; i < G.traj.length; i++) {
            if (depthOf(G.traj[i].z) <= 1) { started = false; continue; }   // behind the camera (deep dolly) → break the line
            var pr = project(G.traj[i].x, G.traj[i].y, G.traj[i].z);
            if (!started) { ctx.moveTo(pr.sx, pr.sy); started = true; } else ctx.lineTo(pr.sx, pr.sy);
        }
        ctx.stroke();
        ctx.restore();
    }

    function drawFlyingDart() {
        var p = dartPosAt(G.throw, G.flightT);
        var pr = project(p.x, p.y, p.z);
        // Size tracks the board (so the dart looks the same at any distance), with a capped loom
        // as it nears the camera — never a giant dart over a far, tiny board.
        var dscale = Math.min(pr.scale, boardScaleNow() * TUNING.dartLoomMax);
        var dlen = DART_LEN_MM * dscale;
        // a faint motion streak behind the barrel
        var pPrev = dartPosAt(G.throw, Math.max(0, G.flightT - 0.03));
        var prPrev = project(pPrev.x, pPrev.y, pPrev.z);
        ctx.save();
        ctx.strokeStyle = 'rgba(253,230,138,0.28)';
        ctx.lineWidth = Math.max(1, dlen * 0.12); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(prPrev.sx, prPrev.sy); ctx.lineTo(pr.sx, pr.sy); ctx.stroke();
        ctx.restore();
        // the SAME dart as the stuck one — tip leading along the throw's heading
        drawDart(pr.sx, pr.sy, dlen, G.throwAngle, { color: '#fde68a', glow: true });
    }

    // -----------------------------------------------------------------
    // Debug / practice visualisation (D)
    //
    // The point is to see WHY a dart went where it did: the recorded gesture, the
    // smoothed path, the release window + release vector, and the trajectory from the
    // top (lateral) and the side (drop). "I missed right because my release pulled right."
    // -----------------------------------------------------------------

    function drawDebug() {
        drawGesturePanel();
        drawTrajPanels();
        drawDebugText();
    }

    function panelBox(x, y, w, h, title) {
        ctx.save();
        ctx.fillStyle = 'rgba(8,12,18,0.82)';
        ctx.strokeStyle = 'rgba(125,211,252,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill(); ctx.stroke();
        if (title) {
            ctx.fillStyle = 'rgba(125,211,252,0.85)';
            ctx.font = '600 10px ' + getFont();
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillText(title, x + 6, y + 5);
        }
        ctx.restore();
    }

    // The raw + smoothed gesture, auto-scaled to fit, with the release window highlighted
    // and the release-vector arrow. Press point is drawn at the panel centre (it's relative).
    function drawGesturePanel() {
        var an = G.analysis;
        var pw = 150, ph = 108, px = 70, py = 320;
        panelBox(px, py, pw, ph, 'gesture');
        if (!an || !an.samples || an.samples.length < 2) return;

        var pts = an.smoothed && an.smoothed.length === an.samples.length ? an.smoothed : an.samples;
        var minX = 0, maxX = 0, minY = 0, maxY = 0;
        for (var i = 0; i < pts.length; i++) {
            if (pts[i].x < minX) minX = pts[i].x; if (pts[i].x > maxX) maxX = pts[i].x;
            if (pts[i].y < minY) minY = pts[i].y; if (pts[i].y > maxY) maxY = pts[i].y;
        }
        var pad = 16;
        var spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
        var sc = Math.min((pw - pad * 2) / spanX, (ph - pad * 2) / spanY);
        var ox = px + pw / 2 - ((minX + maxX) / 2) * sc;
        var oy = py + ph / 2 + ((minY + maxY) / 2) * sc;   // y up-positive → minus below
        function gp(pt) { return { x: ox + pt.x * sc, y: oy - pt.y * sc }; }

        // raw path (faint)
        ctx.save();
        ctx.strokeStyle = 'rgba(148,163,184,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (var r = 0; r < an.samples.length; r++) { var q = gp(an.samples[r]); if (r === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }
        ctx.stroke();
        // smoothed path, release window brighter
        ctx.lineWidth = 1.8;
        for (var k = 1; k < pts.length; k++) {
            var inWin = an.winStart != null && pts[k].t >= an.winStart;
            ctx.strokeStyle = inWin ? 'rgba(253,230,138,0.95)' : 'rgba(125,211,252,0.8)';
            var p0 = gp(pts[k - 1]), p1 = gp(pts[k]);
            ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        }
        // press origin + end point
        var o0 = gp(pts[0]), oe = gp(pts[pts.length - 1]);
        ctx.fillStyle = 'rgba(148,163,184,0.9)'; ctx.beginPath(); ctx.arc(o0.x, o0.y, 2.5, 0, PI2); ctx.fill();
        ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(oe.x, oe.y, 3, 0, PI2); ctx.fill();
        // release vector arrow (from the end, direction of the release tangent)
        if (an.releaseVel) {
            var vlen = Math.hypot(an.releaseVel.x, an.releaseVel.y) || 1;
            var ax = an.releaseVel.x / vlen, ay = an.releaseVel.y / vlen;
            var L = 26;
            var ex = oe.x + ax * L, ey = oe.y - ay * L;
            ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(oe.x, oe.y); ctx.lineTo(ex, ey); ctx.stroke();
            var ah = 5, base = Math.atan2(-(ay), ax);
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - ah * Math.cos(base - 0.4), ey - ah * Math.sin(base - 0.4));
            ctx.lineTo(ex - ah * Math.cos(base + 0.4), ey - ah * Math.sin(base + 0.4));
            ctx.closePath(); ctx.fillStyle = '#f87171'; ctx.fill();
        }
        ctx.restore();
    }

    // Top view (lateral X vs forward Z) and side view (vertical Y vs forward Z) of the flight.
    function drawTrajPanels() {
        if (!G.traj || !G.impact) return;
        var pw = 150, ph = 60, px = 260;
        drawTrajPanel(px, 90, pw, ph, 'top (L/R)', function (p) { return p.x; }, TUNING.boardRadiusMM);
        drawTrajPanel(px, 90 + ph + 8, pw, ph, 'side (drop)', function (p) { return p.y; }, TUNING.boardRadiusMM);
    }
    function drawTrajPanel(px, py, pw, ph, title, axis, range) {
        panelBox(px, py, pw, ph, title);
        var pad = 10;
        var z0 = 0, z1 = TUNING.boardDistance;
        function sx(z) { return px + pad + (z - z0) / (z1 - z0) * (pw - pad * 2); }
        function sy(v) { return py + ph / 2 - clamp(v / range, -1, 1) * (ph / 2 - pad); }
        // centre line (board centre height / line)
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px + pad, py + ph / 2); ctx.lineTo(px + pw - pad, py + ph / 2); ctx.stroke();
        // board edge band
        ctx.strokeStyle = 'rgba(46,139,87,0.5)';
        ctx.beginPath(); ctx.moveTo(sx(z1), py + 4); ctx.lineTo(sx(z1), py + ph - 4); ctx.stroke();
        // flight path
        ctx.strokeStyle = 'rgba(125,211,252,0.9)'; ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (var i = 0; i < G.traj.length; i++) {
            var p = G.traj[i];
            var X = sx(p.z), Y = sy(axis(p));
            if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.stroke();
        // impact dot
        var ix = sx(z1), iy = sy(axis({ x: G.impact.x, y: G.impact.y, z: z1 }));
        ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(ix, iy, 3, 0, PI2); ctx.fill();
        ctx.restore();
    }

    function drawDebugText() {
        var an = G.analysis, th = G.throw;
        var lines = [];
        if (an) {
            lines.push('dur ' + (an.dur != null ? Math.round(an.dur * 1000) : '-') + ' ms');
            lines.push('release ' + (an.speed != null ? Math.round(an.speed) : '-') + ' px/s'
                + (an.valid ? '' : ' (' + (an.reason || 'invalid') + ')'));
        }
        if (th) {
            lines.push('tempo ' + th.tempo.toFixed(2) + '  vz ' + Math.round(th.vel.z));
            lines.push('vx ' + Math.round(th.vel.x) + '  vy ' + Math.round(th.vel.y));
        }
        if (G.impact) lines.push('impact x ' + Math.round(G.impact.x) + '  y ' + Math.round(G.impact.y) + ' mm');
        if (G.result) lines.push('score ' + G.result.score + '  (' + resultLabel(G.result) + ')');
        ctx.save();
        ctx.font = '600 11px ' + getFont();
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        var x = 70, y = 85;
        for (var i = 0; i < lines.length; i++) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(x - 3, y - 2 + i * 15, ctx.measureText(lines[i]).width + 6, 14);
            ctx.fillStyle = 'rgba(226,232,240,0.95)';
            ctx.fillText(lines[i], x, y + i * 15);
        }
        ctx.restore();
    }

    // =================================================================
    // HUD + overlay
    // =================================================================

    function syncHud() {
        syncGameUi();
    }

    function syncDebugBtn() {
        if (!dom.debugBtn) return;
        dom.debugBtn.classList.toggle('active', !!TUNING.debug);
        dom.debugBtn.setAttribute('aria-pressed', TUNING.debug ? 'true' : 'false');
    }
    function toggleDebug() {
        if (match && match.mode !== 'practice') return;
        TUNING.debug = !TUNING.debug;
        syncDebugBtn();
        render();
    }

    function overlayContent(state) {
        if (state === 'idle') {
            return {
                badge: 'target',
                title: t('dartsReady') + ' · ' + modeName(roomData().options.mode, roomData().options),
                message: t('dartsPracticeTip'),
                button: t('dartsRoom'),
                hint: t('dartsStartHintHtml'),
            };
        }
        return {};   // paused uses the shell default
    }

    // =================================================================
    // Reset + boot
    // =================================================================

    function modeName(mode, config) {
        return Rules.isX01(mode) ? String(Rules.options(Object.assign({}, config, { mode: mode })).startingScore) :
            t({ practice: 'dartsPractice', cricket: 'dartsCricket', countup: 'dartsCountup' }[mode]);
    }
    function ruleText(mode, config) {
        return Rules.isX01(mode) ? t('dartsRuleX01', Rules.options(Object.assign({}, config, { mode: mode })).startingScore) :
            t({ practice: 'dartsRulePractice', cricket: 'dartsRuleCricket', countup: 'dartsRuleCountup' }[mode]);
    }
    function controllerId() { return room && online ? (online.service.currentPlayer() || {}).uid : localController; }
    function isRoomLocalMatch() {
        return !!(room && room.data && match && match.execution === 'local' &&
            room.data.game && room.data.game.matchId === match.matchId && match.owners &&
            Object.values(match.owners).every(function (owner) { return owner === controllerId(); }));
    }
    function usesSharedMatch() { return !!room && !isRoomLocalMatch(); }
    function roomData() {
        var data = room && room.data || localRoom;
        // A room code reserves the lobby; a one-device match keeps its live state in memory.
        return isRoomLocalMatch() && data.phase !== 'lobby' ? Object.assign({}, data, {
            game: match, phase: match.status === 'over' ? 'results' : 'playing' }) : data;
    }
    function controlsPlayer(id) {
        return !!match && !isCpuPlayer(id) && (match.owners ? match.owners[id] : id) === controllerId();
    }
    function isCpuPlayer(id) { return !!(match && match.participants && match.participants[id] && match.participants[id].type === 'cpu'); }
    function playerName(uid) {
        var data = roomData(), roster = data.roster || {}, participant = (data.participants || {})[uid];
        return roster[uid] || participant && participant.name || t('dartsGuest');
    }
    function textNode(tag, className, value) {
        var el = document.createElement(tag); if (className) el.className = className;
        if (value != null) el.textContent = value; return el;
    }
    function accountDisplayName() {
        var current = window.ArcadeNet && window.ArcadeNet.ok && window.ArcadeNet.currentUser();
        if (current) return !current.anon && String(current.name || '').trim().slice(0, 32) || '';
        try {
            var hint = JSON.parse(localStorage.getItem('gamebox:account-name'));
            return hint && typeof hint.uid === 'string' && typeof hint.name === 'string' ? hint.name.trim().slice(0, 32) : '';
        } catch (_) { return ''; }
    }
    function applyAccountDisplayName() {
        if (!localRoom || room || localRoom.phase !== 'lobby') return;
        var participant = Object.values(localRoom.participants).find(function (p) { return p.accountDefault; });
        if (!participant) return;
        var focused = document.activeElement;
        if (focused && focused.dataset && focused.dataset.slotId === participant.id) return;
        var name = accountDisplayName() || t('dartsPlayerNumber', 1);
        if (participant.name !== name) { participant.name = name; syncGameUi(); }
    }
    function newLocalRoom() {
        var id = 'local-' + ++localSeatSerial, participant = { id: id, name: accountDisplayName() || t('dartsPlayerNumber', 1),
            accountDefault: true, controllerId: localController, type: 'human' };
        return { phase: 'lobby', hostUid: localController, players: {}, participants: { [id]: participant }, seatOrder: [id],
            options: Rules.options({ mode: 'practice' }), ready: {}, game: {}, roster: {} };
    }
    function defaultPlayerName(data) {
        var names = new Set(Object.values(data.participants || {}).map(function (p) { return p.name; })), n = data.seatOrder.length + 1;
        while (names.has(t('dartsPlayerNumber', n))) n++;
        return t('dartsPlayerNumber', n);
    }
    function localCanStart() {
        return localRoom.phase === 'lobby' && Rules.eligibility(localRoom.options, localRoom.seatOrder.length,
            localRoom.seatOrder.map(function (id) { return localRoom.participants[id]; })).allowed;
    }
    function renderLobby() { if (lobby) lobby.render(); }
    function queueDartFeedback(g, eventId) {
        if (!g || !g.lastDart) return;
        pendingFeedbackEvent = { id: eventId || g.matchId + ':' + g.seq, dart: g.lastDart,
            restoredScore: g.scores[g.lastDart.uid] };
    }
    function syncPresentation() {
        if (!localRoom) return;
        var s = viewMatch || match, now = Date.now(), data = roomData();
        var turnKey = s ? [s.matchId, s.leg, s.phase, s.round, s.active, s.status].join(':') : '';
        if (turnKey !== presentationTurnKey) { gesture = null; presentationTurnKey = turnKey; }
        if (data.phase === 'lobby' || !s) {
            feedback.reset(); pendingFeedbackEvent = null;
        } else {
            feedback.update(s, { controllerId: controllerId(), now: now, throwEvent: pendingFeedbackEvent });
            pendingFeedbackEvent = null;
        }
        feedbackState = feedback.snapshot(now);
        var key = JSON.stringify([feedbackState, AC.i18n.locale]);
        if (key === feedbackKey) return;
        feedbackKey = key;
        if (feedbackState.blocking) gesture = null;
        var handoff = document.getElementById('handoff-overlay'), pending = feedbackState.handoff;
        handoff.hidden = !pending || !pending.visible;
        if (pending) {
            document.getElementById('handoff-title').textContent = t(pending.outcome && pending.outcome.kind === 'starter' ? 'dartsCorkStarter' : 'dartsHandoffTitle', playerName(pending.player));
            document.getElementById('handoff-message').textContent = (pending.outcome && pending.outcome.kind === 'rethrow' ? t('dartsCorkRethrow', pending.outcome.round) + ' · ' : '') + t('dartsHandoffMessage');
            var ready = document.getElementById('handoff-ready-btn');
            ready.textContent = t('dartsHandoffReady'); ready.dataset.handoffKey = pending.key;
        }
        var notice = document.getElementById('turn-notice'), event = feedbackState.notice;
        var corkNotice = event && (event.kind === 'cork' || event.kind === 'cork-rethrow' || event.kind === 'cork-starter');
        notice.hidden = !event;
        notice.classList.toggle('bust', !!event && event.kind === 'bust');
        notice.classList.toggle('cork', !!corkNotice);
        document.getElementById('turn-notice-title').textContent = !event ? '' :
            event.kind === 'bust' ? t('dartsBustTitle') : corkNotice ?
                event.kind === 'cork-starter' ? t('dartsCorkStarter', playerName(event.player)) : event.kind === 'cork-rethrow' ? t('dartsCorkRethrowTitle') : event.purpose === 'opening' ? t('dartsOpeningCorkStatus') :
                    event.purpose === 'limit' ? t('dartsCorkLimitReached', event.roundLimit) : t('dartsCorkTieNotice') :
                t('dartsTurnOf', playerName(event.player));
        document.getElementById('turn-notice-message').textContent = event && event.kind === 'bust' ?
            t('dartsBustRestored', event.restoredScore) : corkNotice ?
                event.kind === 'cork-starter' ? '' : event.kind === 'cork-rethrow' ? t('dartsCorkRethrow', event.round) :
                    t(event.purpose === 'opening' ? 'dartsCorkStarts' : event.purpose === 'limit' ? 'dartsCorkLimitDecider' : 'dartsCorkWins') : '';
        // Expiring effects also update card badges while the accepted state is unchanged.
        renderHud(); syncThrowFeedback();
    }
    function renderHud() {
        if (!hud || !localRoom) return;
        var s = viewMatch || match, data = roomData();
        hud.render(window.DartsHud.model({ state: s, effects: feedbackState, online: usesSharedMatch(), now: Date.now(), name: playerName,
            you: (data.participants[data.seatOrder[0]] || {}).name || t('dartsPlayerNumber', 1),
            practice: { darts: G.darts, result: G.last, speed: G.analysis && G.analysis.speed != null ? G.analysis.speed : null } }));
    }
    function syncGameUi() {
        if (!hud || !localRoom) return;
        var s = viewMatch || match, data = roomData();
        document.getElementById('mode-description').textContent = ruleText(data.options.mode, data.options);
        document.getElementById('debug-btn').hidden = !!s && s.mode !== 'practice';
        syncPresentation(); renderHud();
        document.getElementById('next-leg-btn').disabled = G.dartState === 'flying' || sending || !!(usesSharedMatch() && match && Date.now() < match.readyAt);
        var stats = document.getElementById('stats-details'), summary = document.getElementById('result-summary');
        stats.hidden = !s || s.status === 'playing' || s.mode !== 'countup';
        if (!stats.hidden) {
            var statsKey = JSON.stringify([s.matchId, s.seq, AC.i18n.locale]);
            if (summary.dataset.key !== statsKey) {
                summary.dataset.key = statsKey; summary.replaceChildren();
                s.players.forEach(function (uid) {
                    var p = s.stats[uid];
                    summary.append(textNode('p', '', playerName(uid) + ' · ' + t('dartsLabelValue', t('dartsAverage'),
                        (p.darts ? p.points / p.darts * 3 : 0).toFixed(1)) + ' · ' + t('dartsLabelValue', t('dartsBestRound'), p.bestRound) +
                        ' · ' + t('dartsLabelValue', t('dartsBulls'), p.bulls) + ' · ' + t('dartsLabelValue', t('dartsTriple20s'), p.triple20s)));
                });
            }
        }
        if (historyView) historyView.refresh();
        renderLobby();
        syncThrowGuide();
    }
    function clearBoard() {
        cpuPending = null;
        gesture = null; freshDart(); G.stuck = []; G.last = null; G.traj = null; G.analysis = null; camDolly = 0;
    }
    function hideShellOverlay() { document.getElementById('overlay').hidden = true; }
    function showNetError(error) {
        var key = { 'room/not-found': 'dartsNotFound', 'room/full': 'dartsFull', 'room/started': 'dartsStarted' }[(error || {}).code] || 'dartsNetError';
        if (lobby) lobby.refs.status.textContent = t(key);
        flashHint(t(key)); document.getElementById('network-status').textContent = t(key);
    }
    function openLobby(invite) {
        if (!lobby) return;
        gesture = null; cpuPending = null; lobby.open(invite === true);
    }
    function acceptLocal(g) {
        if (!g) return false;
        match = viewMatch = g;
        if (!room) {
            localRoom.game = g;
            if (g.status === 'over') localRoom.phase = 'results';
        }
        syncGameUi(); return true;
    }
    function configure(patch) {
        if (room) return online.configure(patch);
        if (localRoom.phase !== 'lobby') return false;
        localRoom.options = Rules.configureOptions(localRoom.options, patch); localRoom.ready = {};
        syncGameUi(); return true;
    }
    function addLocalPlayer() {
        if (room) return online.addLocalPlayer(defaultPlayerName(roomData()));
        if (localRoom.phase !== 'lobby' || localRoom.seatOrder.length >= 4) return false;
        var id;
        do { id = 'local-' + ++localSeatSerial; } while (localRoom.participants[id]);
        localRoom.participants[id] = { id: id, name: defaultPlayerName(localRoom), controllerId: localController, type: 'human' };
        localRoom.seatOrder.push(id); localRoom.ready = {}; syncGameUi(); return true;
    }
    function addCpuPlayer() {
        if (room || localRoom.phase !== 'lobby' || localRoom.options.mode === 'practice' || localRoom.seatOrder.length >= 4) return false;
        var id = 'cpu-' + ++localSeatSerial, n = 1, names = new Set(Object.values(localRoom.participants).map(function (p) { return p.name; }));
        while (names.has(t('dartsCpuNumber', n))) n++;
        localRoom.participants[id] = { id: id, name: t('dartsCpuNumber', n), controllerId: localController, type: 'cpu', difficulty: 'normal' };
        localRoom.seatOrder.push(id); localRoom.ready = {}; syncGameUi(); return true;
    }
    function setCpuDifficulty(id, difficulty) {
        var p = localRoom.participants[id];
        if (room || localRoom.phase !== 'lobby' || !p || p.type !== 'cpu' || !['easy', 'normal', 'hard', 'insane'].includes(difficulty)) return false;
        p.difficulty = difficulty; localRoom.ready = {}; syncGameUi(); return true;
    }
    function renamePlayer(id, name) {
        if (room) return online.renamePlayer(id, name);
        if (localRoom.phase !== 'lobby' || !localRoom.participants[id] || !String(name || '').trim()) return false;
        localRoom.participants[id].name = String(name).trim().slice(0, 32);
        localRoom.participants[id].accountDefault = false;
        localRoom.ready = {}; syncGameUi(); return true;
    }
    function removeLocalPlayer(id) {
        if (room) return online.removeLocalPlayer(id);
        if (localRoom.phase !== 'lobby' || localRoom.seatOrder.length < 2 || !localRoom.participants[id]) return false;
        if (localRoom.participants[id].type !== 'cpu' && Object.values(localRoom.participants).filter(function (p) { return p.type !== 'cpu'; }).length < 2) return false;
        delete localRoom.participants[id]; localRoom.seatOrder = localRoom.seatOrder.filter(function (p) { return p !== id; });
        localRoom.ready = {}; syncGameUi(); return true;
    }
    async function startMatch() {
        if (room) {
            if (online.service.host(room.data) === controllerId()) return online.start();
            return online.ready(!(room.data.ready || {})[controllerId()]);
        }
        if (!localCanStart()) return false;
        var ids = localRoom.seatOrder.slice();
        var g = Rules.create(localRoom.options, ids, Date.now(), Math.floor(Math.random() * ids.length));
        g.matchId = crypto.getRandomValues(new Uint32Array(4)).join('-');
        g.participants = JSON.parse(JSON.stringify(localRoom.participants));
        g.owners = Object.fromEntries(ids.map(function (id) { return [id, g.participants[id].type === 'cpu' ? 'local-cpu' : localController]; }));
        g.cpuSeed = crypto.getRandomValues(new Uint32Array(1))[0]; cpuRandom = window.DartsCpuGesture.seeded(g.cpuSeed); lastCpuThrow = null;
        localRoom.roster = Object.fromEntries(ids.map(function (id) { return [id, localRoom.participants[id].name]; }));
        localRoom.phase = 'playing'; localRoom.game = match = viewMatch = g;
        clearBoard(); G.darts = 0; G.total = 0; lobby.close();
        shell.start(); hideShellOverlay(); syncGameUi(); return true;
    }
    async function backToLobby() {
        gesture = null;
        if (room) {
            var accepted;
            if (isRoomLocalMatch()) {
                if (match.status !== 'over' && match.mode !== 'practice') return false;
                var finished = match.mode === 'practice' && match.status === 'playing' ? Rules.endPractice(match) : match;
                acceptLocal(finished); clearBoard();
                accepted = await online.syncLocal(finished, true);
            } else accepted = await online.backToLobby();
            if (accepted) openLobby(); return accepted;
        }
        if (match && match.status !== 'over' && match.mode !== 'practice') return false;
        if (match && match.mode === 'practice' && match.status === 'playing') {
            match = Rules.endPractice(match);
            localRoom.game = viewMatch = match;
        }
        localRoom.phase = 'lobby'; localRoom.ready = {}; applyAccountDisplayName(); shell.goIdle(); openLobby(); syncGameUi(); return true;
    }
    async function restartLocal() {
        if (usesSharedMatch()) return;
        if (roomData().phase === 'lobby') { openLobby(); return; }
        var finished = match;
        if (match && ['playing', 'between'].includes(match.status)) {
            finished = match.mode === 'practice' ? Rules.endPractice(match) :
                Object.assign({}, match, { seq: match.seq + 1, status: 'over', endReason: 'cancelled', winner: null, legWinner: null });
        }
        if (room) { acceptLocal(finished); clearBoard(); if (await online.syncLocal(finished, true)) openLobby(); return; }
        localRoom.game = match = viewMatch = finished;
        localRoom.phase = 'lobby'; applyAccountDisplayName(); shell.goIdle(); openLobby();
    }
    async function ensureOnline() {
        if (!onlineLoading) onlineLoading = (async function () {
            if (!window.ArcadeNet) {
                var cleanupLoad;
                var loaded = new Promise(function (resolve, reject) {
                    var timeout = setTimeout(function () { window.removeEventListener('arcade-net-ready', ready); reject(new Error('Online unavailable')); }, 15000);
                    function ready() { clearTimeout(timeout); resolve(); }
                    window.addEventListener('arcade-net-ready', ready, { once: true });
                    cleanupLoad = function () { clearTimeout(timeout); window.removeEventListener('arcade-net-ready', ready); };
                });
                // Observe both promises immediately so an import failure cannot leave a rejected timer behind.
                try { await Promise.all([import(new URL('../js/net/net.js', location.href).href), loaded]); }
                finally { cleanupLoad(); }
            }
            net = window.ArcadeNet;
            if (!net || !net.ok || net.rooms.ok === false) throw new Error('Online unavailable');
            online = window.createDartsRoom({ net: net, onChange: onRoom, onError: showNetError,
                resolveThrow: function (th) { var impact = computeImpact(th); return { impact: impact, result: scoreAt(impact.x, impact.y) }; } });
            await new Promise(function (resolve) { net.onAuth(function (user) {
                netUser = user ? online.service.currentPlayer() : null;
                if (!user && room) leaveRoom().catch(showNetError);
                applyAccountDisplayName(); resolve(); renderLobby();
            }); });
        })().catch(function (error) { onlineLoading = null; throw error; });
        await onlineLoading;
        if (!net.currentUser()) {
            await net.signInGuest();
            await new Promise(function (resolve) { net.onAuth(function (user) { if (user) { netUser = online.service.currentPlayer(); resolve(); } }); });
        }
        return online;
    }
    async function inviteFriends() {
        if (room || localRoom.phase !== 'lobby') return false;
        if (Object.values(localRoom.participants).some(function (p) { return p.type === 'cpu'; })) { lobby.refs.status.textContent = t('dartsCpuRemoveForOnline'); return false; }
        await ensureOnline();
        return online.create(localRoom.options, localRoom.seatOrder.map(function (id) { return localRoom.participants[id]; }));
    }
    async function joinRoom(code) {
        if (room || localRoom.phase !== 'lobby') return false;
        if (Object.values(localRoom.participants).some(function (p) { return p.type === 'cpu'; })) { lobby.refs.status.textContent = t('dartsCpuRemoveForOnline'); return false; }
        await ensureOnline(); return online.join(code);
    }
    async function leaveRoom() {
        var old = roomData(), owned = old.seatOrder.filter(function (id) { return old.participants[id].controllerId === controllerId(); })
            .map(function (id) { return Object.assign({}, old.participants[id], { controllerId: localController }); });
        var pending = online && online.leave(); room = null;
        localRoom = newLocalRoom();
        if (owned.length) { localRoom.participants = Object.fromEntries(owned.map(function (p) { return [p.id, p]; })); localRoom.seatOrder = owned.map(function (p) { return p.id; }); }
        localRoom.options = Rules.options(old.options); onlineMatchId = null; seenThrow = null; observedOnlinePhase = null; lastRoomSnapshot = null;
        match = viewMatch = null; sending = false; shell.goIdle(); openLobby(); syncGameUi();
        await pending;
    }
    function keepLocalMatchAfterRoomLoss(data) {
        if (!data || !match || match.execution !== 'local' || data.game.matchId !== match.matchId ||
            !Object.values(match.owners).every(function (owner) { return owner === controllerId(); })) return false;
        var g = match;
        var owned = data.seatOrder.map(function (id) { return Object.assign({}, data.participants[id], { controllerId: localController }); });
        feedback.rebindController(controllerId(), localController);
        online.leave().catch(function () {}); room = null;
        localRoom = newLocalRoom(); localRoom.options = Rules.options(data.options);
        localRoom.participants = Object.fromEntries(owned.map(function (p) { return [p.id, p]; }));
        localRoom.seatOrder = owned.map(function (p) { return p.id; }); localRoom.roster = data.roster;
        g = Object.assign({}, g, { owners: Object.fromEntries(g.players.map(function (id) { return [id, localController]; })) });
        localRoom.game = match = viewMatch = g; localRoom.phase = g.status === 'over' ? 'results' : 'playing';
        onlineMatchId = seenThrow = null; observedOnlinePhase = null; lastRoomSnapshot = null;
        syncGameUi(); shell.syncButtons(); return true;
    }
    function onRoom(data, activeRoom) {
        room = activeRoom;
        document.getElementById('network-status').textContent = '';
        if (!data || !online.service.currentPlayer() || !(data.players || {})[online.service.currentPlayer().uid]) {
            if (keepLocalMatchAfterRoomLoss(lastRoomSnapshot)) return;
            online.leave().catch(showNetError); room = null;
            match = viewMatch = null; onlineMatchId = seenThrow = null; observedOnlinePhase = null; lastRoomSnapshot = null;
            shell.goIdle(); openLobby(); document.getElementById('network-status').textContent = t('dartsRoomGone'); return;
        }
        // Normalize legacy view data; the shared transaction policy still checks the stored snapshot.
        data = Object.assign({}, data, { phase: online.phase(data), participants: online.participants(data),
            seatOrder: online.participantIds(data), options: Rules.options(data.options) });
        activeRoom.data = data;
        lastRoomSnapshot = data;
        var enteredLobby = observedOnlinePhase !== 'lobby'; observedOnlinePhase = data.phase;
        var g = data.game || {};
        if (data.phase === 'lobby' || !g.status) {
            match = g.status ? g : null; viewMatch = match;
            if (shell.state !== 'idle') shell.goIdle();
            if (enteredLobby) openLobby();
            syncGameUi(); return;
        }
        // Reservation heartbeats contain the initial state, not each locally thrown dart.
        // Keep the live match and pause state until the host explicitly returns to the lobby.
        if (g.execution === 'local' && match && match.execution === 'local' &&
            match.matchId === g.matchId && match.seq >= g.seq) {
            syncGameUi(); shell.syncButtons(); return;
        }
        var changedMatch = onlineMatchId !== g.matchId, changedLeg = match && match.leg !== g.leg;
        match = g;
        if (changedMatch || changedLeg) {
            onlineMatchId = g.matchId; seenThrow = null; clearBoard(); G.total = 0; G.darts = 0; viewMatch = g;
        }
        if (!shell.isPlaying()) shell.start();
        var event = g.lastThrow;
        if (event && event.seq !== seenThrow) { seenThrow = event.seq; presentThrow(event.flight, event.impact); }
        else if (G.dartState !== 'flying') viewMatch = g;
        if (changedMatch || changedLeg) lobby.close();
        if (g.endReason === 'left') { viewMatch = g; clearBoard(); }
        hideShellOverlay(); syncGameUi(); shell.syncButtons();
    }
    function setupControls() {
        var handoffReady = document.getElementById('handoff-ready-btn');
        handoffReady.addEventListener('pointerdown', function () { handoffPressKey = handoffReady.dataset.handoffKey; });
        handoffReady.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') handoffPressKey = handoffReady.dataset.handoffKey;
        });
        handoffReady.addEventListener('click', function () {
            var expectedKey = handoffPressKey || handoffReady.dataset.handoffKey;
            handoffPressKey = null; gesture = null;
            syncPresentation();
            if (match && match.turnMs && Date.now() >= match.turnStartedAt + match.turnMs) return;
            feedback.confirm(Date.now(), expectedKey); syncPresentation();
        });
        document.getElementById('next-leg-btn').addEventListener('click', function () {
            if (usesSharedMatch()) online.nextLeg().catch(showNetError);
            else { acceptLocal(Rules.nextLeg(match, Date.now())); clearBoard(); }
        });
        document.getElementById('play-again-btn').addEventListener('click', function () { backToLobby().catch(showNetError); });
        document.getElementById('result-room-btn').addEventListener('click', function () { backToLobby().then(function (accepted) { if (!accepted) openLobby(); }).catch(showNetError); });
        document.getElementById('history-btn').addEventListener('click', function () { historyView.open(); });
        document.getElementById('player-scores').addEventListener('click', function (event) {
            var card = event.target.closest('.darts-player'); if (card) historyView.open(card.dataset.playerUid);
        });
        document.getElementById('settings-btn').addEventListener('click', function () { openLobby(); });
        document.getElementById('restart-btn').addEventListener('click', function (event) {
            if (!usesSharedMatch()) { event.stopImmediatePropagation(); restartLocal().catch(showNetError); }
        }, true);
        document.querySelectorAll('.darts-dialog').forEach(function (dialog) { dialog.addEventListener('keydown', function (event) { event.stopPropagation(); }); });
        window.addEventListener('keydown', function (event) {
            if (event.target.closest && event.target.closest('#throw-guide')) return;
            if ((event.key === 'r' || event.key === 'R') && !usesSharedMatch() && !document.querySelector('.darts-dialog[open]')) {
                event.preventDefault(); event.stopImmediatePropagation(); restartLocal().catch(showNetError);
            }
        }, true);
        window.addEventListener('pagehide', function () { if (online && room) online.leave().catch(function () {}); });
        window.addEventListener('storage', function (event) { if (event.key === 'gamebox:account-name' || event.key === null) applyAccountDisplayName(); });
    }
    function resetSession() {
        var data = roomData(); match = data && data.game && data.game.status ? data.game : null; viewMatch = match;
        clearBoard(); G.total = 0; G.darts = 0; G.practiceHistory = []; G.practiceHistoryDropped = 0;
        G.hint = null; G.hintT = 0;
        syncGameUi(); queueMicrotask(function () { fitCanvas(); render(); });
    }

    function init() {
        cpuGesture = window.DartsCpuGesture.create({ analyseGesture: analyseGesture, computeThrow: computeThrow, computeImpact: computeImpact });
        localRoom = newLocalRoom();
        throwGuide = window.createDartsThrowGuide({ document: document, t: t, storage: AC.storage, review: function () {
            if (match && match.status === 'playing' && roomData().phase === 'playing') lobby.close();
            syncThrowGuide();
        } });
        hud = window.DartsHud.create({ document: document, t: t, resultLabel: resultLabel, modeName: modeName,
            locale: function () { return AC.i18n.locale; }, isOnline: usesSharedMatch,
            myUid: controllerId, controlsPlayer: controlsPlayer, isFlying: function () { return G.dartState === 'flying'; } });
        historyView = window.createDartsHistory({ document: document, t: t, resultLabel: resultLabel,
            locale: function () { return AC.i18n.locale; }, modeName: modeName, cancelGesture: function () { gesture = null; },
            data: function () {
                var s = viewMatch || match;
                return { players: (s ? s.players : roomData().seatOrder).map(function (id) { return { id: id, name: playerName(id) }; }),
                    mode: s ? s.mode : 'practice', startingScore: s ? s.startingScore || 501 : 501,
                    online: !!s && s.status === 'playing' && roomData().phase === 'playing',
                    cricketVariant: s ? s.cricketVariant : 'standard', turnMs: s ? s.turnMs : 0, entries: s ? s.history || [] : G.practiceHistory,
                    dropped: s ? s.historyDropped || 0 : G.practiceHistoryDropped };
            } });
        fitCanvas();
        window.addEventListener('resize', function () { gesture = null; fitCanvas(); render(); });

        shell = AC.shell.create({
            gameId: 'darts',
            step: 1 / 60,
            preventKeys: ['Space'],
            update: update,
            render: render,
            reset: resetSession,
            restartToReady: true,
            overlayContent: overlayContent,
            canPause: function () { return !usesSharedMatch() && !!match && !match.turnMs && match.status === 'playing' && roomData().phase === 'playing'; },
            canRestart: function () { return !usesSharedMatch(); },
            onPause: function () { gesture = null; cpuPending = null; syncThrowGuide(); },
            onStart: function () {
                syncGameUi(); fitCanvas();
                if (roomData().phase !== 'playing') queueMicrotask(function () { shell.goIdle(); openLobby(); });
            },
        });
        lobby = window.createDartsLobby({ document: document, t: t, locale: function () { return AC.i18n.locale; }, modeName: modeName,
            cancelGesture: function () { gesture = null; }, onError: showNetError,
            model: function () { return { data: roomData(), uid: controllerId(), online: !!room, code: room && room.code,
                canStart: room ? online.canStart(room.data) : localCanStart() }; },
            addPlayer: addLocalPlayer, addCpu: addCpuPlayer, setCpuDifficulty: setCpuDifficulty,
            renamePlayer: renamePlayer, removePlayer: removeLocalPlayer, configure: configure,
            start: startMatch, backToLobby: backToLobby, invite: inviteFriends, join: joinRoom, leave: leaveRoom });
        // Delegate only board/mode-panel presses; controls and dialogs retain normal input.
        var pad = document.getElementById('match-panel');
        pad.addEventListener('pointerdown', onPointerDown, { passive: false });
        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerCancel);

        if (dom.debugBtn) dom.debugBtn.addEventListener('click', function () { AC.audio.unlock(); toggleDebug(); });
        window.addEventListener('keydown', function (e) {
            if (e.key === 'd' || e.key === 'D') { toggleDebug(); }
        });

        AC.i18n.subscribe(function () { syncGameUi(); if (!shell.isPlaying()) shell.refreshOverlay(); });

        setupControls();
        setInterval(function () {
            if (online && room) online.tick().catch(showNetError);
            if (!usesSharedMatch() && roomData().phase === 'playing' && match && match.status === 'playing' && match.turnMs > 0 &&
                G.dartState !== 'flying' && Date.now() >= match.turnStartedAt + match.turnMs) acceptLocal(Rules.timeout(match, Date.now()));
            syncGameUi();
        }, 1000);

        syncDebugBtn();
        resetSession();
        render();
        openLobby();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
