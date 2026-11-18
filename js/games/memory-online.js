/* Online-room UI and coordination. Firebase loads on room entry or saved-room recovery. */
(function () {
    'use strict';
    var AC = window.ArcadeCommon, Match = window.MemoryMatch, SCALE = window.MemoryRules.SCALE;
    Object.assign(AC.i18n.STRINGS.en, {
        memoryOnlineRoom: 'Online room', memoryOnlineColor: 'Color / Quantity / Pitch · 2–8 players', memoryCloseRoom: 'Close', memoryGoogle: 'Google sign-in',
        memoryGuest: 'Guest', memoryYourName: 'Your name', memoryCreate: 'Create room', memoryRoomCode: 'Room code', memoryJoin: 'Join',
        memoryCopy: 'Copy', memoryCopied: 'Room code copied', memoryMatchRules: 'Match rules', memoryCapacity: 'Capacity',
        memoryMaxRounds: 'Round limit', memoryStartingHp: 'Starting HP', memoryTiming: 'Phase times (seconds)',
        memoryLeave: 'Leave room', memoryReady: 'Ready', memoryUnready: 'Cancel ready', memoryStartMatch: 'Start match',
        memoryReturnLobby: 'Return to lobby', memoryHost: 'Host', memoryNotReady: 'Not ready', memoryReconnecting: 'Reconnecting',
        memoryReadyNote: '2–8 players, including at least one human. Each device controls the CPUs it adds. Guests get ready, then the host starts. Changing settings clears Ready.',
        memoryLockedNote: 'Match settings are locked. The round clock keeps running while this panel is open.',
        memoryFinishedNote: 'The host brings everyone back to this lobby for the next match. Guests get ready again, then the host starts.',
        memoryConnecting: 'Connecting…', memoryConnected: 'Connected', memoryOffline: 'Reconnecting — the shared deadline still applies.',
        memoryRoomGone: 'Your room membership ended. You can join again from the lobby.', memoryNeedServer: 'Online play needs an HTTP server. Open this page through localhost or GameBox.',
        memoryNetworkError: 'Unable to connect to online rooms. Please retry.', memoryFull: 'This room is full.',
        memoryPermissionError: 'Room access was denied. Please sign in again and retry.',
        memoryGuestDisabled: 'Guest sign-in is unavailable. Try Google sign-in.',
        memoryDomainError: 'This website is not authorized for sign-in. Check the Firebase authorized domains.',
        memoryClockError: 'Unable to connect to the room server to synchronize time. Check the connection and retry.',
        memoryModuleError: 'Unable to load online play. Reload the page and check for blocked requests.',
        memoryClientOutdated: 'Online modules have different versions. Reload the page without using the browser cache.',
        memoryVersionError: 'This match needs a newer game version. Reload the page.',
        memoryAlreadyStarted: 'This match has started. Join after it returns to the lobby.', memoryNotFound: 'Room not found.',
        memoryMatchStatus: 'Match status', memoryYourHp: 'Your HP', memoryPlayer: 'Player', memoryDamage: 'Damage', memoryStatus: 'Status',
        memoryYou: 'You', memoryPlaying: 'Playing', memoryAlive: 'Alive', memorySubmitted: 'Locked', memoryOut: 'Eliminated', memoryLeft: 'Withdrawn', memoryTop: 'Top',
        memoryRoundResult: 'Round results', memoryFinalResult: 'Match finished', memoryWinners: 'Winner: ', memorySharedWinners: 'Shared winners: ',
        memoryNoWinner: 'No winner this match', memoryCapEnd: 'Round limit reached.',
        memorySurvivorEnd: 'Last player standing.', memoryWithdrawalEnd: 'The other participants left.', memoryObserved: 'Spectating',
        memorySubmittingError: 'Answer not confirmed yet. Retry before the deadline.', memoryInvalidSetting: 'Choose a valid setting. Capacity cannot be smaller than the current roster.',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        memoryOnlineRoom: '線上房間', memoryOnlineColor: '色彩、數量、音高 · 2–8位玩家', memoryCloseRoom: '關閉', memoryGoogle: 'Google 登入',
        memoryGuest: '訪客', memoryYourName: '你的名字', memoryCreate: '建立房間', memoryRoomCode: '房間代碼', memoryJoin: '加入',
        memoryCopy: '複製', memoryCopied: '已複製房間代碼', memoryMatchRules: '對戰規則', memoryCapacity: '房間人數上限',
        memoryMaxRounds: '回合上限', memoryStartingHp: '起始 HP', memoryTiming: '各階段時間（秒）',
        memoryLeave: '離開房間', memoryReady: '準備好了', memoryUnready: '取消準備', memoryStartMatch: '開始對戰',
        memoryReturnLobby: '返回大廳', memoryHost: '房主', memoryNotReady: '尚未準備', memoryReconnecting: '重新連線中',
        memoryReadyNote: '2–8位玩家，至少一位真人；CPU由加入它的裝置控制。其他玩家準備後由房主開始，更改設定需重新準備。',
        memoryLockedNote: '對戰設定已鎖定。打開這個面板不會暫停回合時間。',
        memoryFinishedNote: '房主準備下一場後，大家會回到這個大廳。其他玩家重新準備，再由房主開始。',
        memoryConnecting: '連線中…', memoryConnected: '已連線', memoryOffline: '重新連線中，共同作答期限仍會繼續。',
        memoryRoomGone: '你已不在原房間中，可從大廳重新加入。', memoryNeedServer: '線上遊戲須透過 HTTP 伺服器開啟。請使用 localhost 或 GameBox 網站。',
        memoryNetworkError: '無法連上線上房間，請稍後重試。', memoryFull: '這個房間已滿。',
        memoryPermissionError: '目前無法存取房間，請重新登入後再試。',
        memoryGuestDisabled: '目前無法以訪客身分登入，請改用Google登入。',
        memoryDomainError: '這個網站尚未獲准登入，請確認 Firebase 的授權網域設定。',
        memoryClockError: '無法連上房間伺服器以同步時間，請確認連線後再試。',
        memoryModuleError: '線上模組載入失敗，請重新載入頁面，並確認網路請求未被封鎖。',
        memoryClientOutdated: '線上模組版本不一致，請略過瀏覽器快取重新載入頁面。',
        memoryVersionError: '這場對戰需要較新的遊戲版本，請重新載入頁面。',
        memoryAlreadyStarted: '這場對戰已開始，請等返回大廳後再加入。', memoryNotFound: '找不到這個房間。',
        memoryMatchStatus: '對戰狀態', memoryYourHp: '你的 HP', memoryPlayer: '玩家', memoryDamage: '傷害', memoryStatus: '狀態',
        memoryYou: '你', memoryPlaying: '作答中', memoryAlive: '存活', memorySubmitted: '已鎖定', memoryOut: '已淘汰', memoryLeft: '已離開', memoryTop: '最高分',
        memoryRoundResult: '回合結果', memoryFinalResult: '對戰結束', memoryWinners: '勝出者：', memorySharedWinners: '共同勝出：',
        memoryNoWinner: '本場沒有勝出者', memoryCapEnd: '已達回合上限。',
        memorySurvivorEnd: '最後一位存活玩家勝出。', memoryWithdrawalEnd: '其他參賽者已離開。', memoryObserved: '觀戰中',
        memorySubmittingError: '答案尚未確認，請在截止前重試送出。', memoryInvalidSetting: '請選擇有效設定，人數上限不可少於目前成員。',
    });
    function points(units) { return (units / SCALE).toFixed(1).replace(/\.0$/, ''); }
    function normalizeCode(value) { return String(value || '').trim().toUpperCase().replace(/^R-/, '').replace(/[^A-Z0-9]/g, '').slice(0, 4); }
    Object.assign(AC.i18n.STRINGS.en,{memoryAddCpu:'Add CPU',memoryCpu:'CPU',memoryCpuEasy:'Easy',memoryCpuNormal:'Normal',memoryCpuHard:'Hard',memoryCpuExpert:'Expert',memoryCpuOwner:'Owner',memoryCpuRemove:'Remove',memoryCpuName:'CPU name',memoryCpuDifficulty:'CPU difficulty'});
    Object.assign(AC.i18n.STRINGS.zh,{memoryAddCpu:'加入 CPU',memoryCpu:'CPU',memoryCpuEasy:'簡單',memoryCpuNormal:'普通',memoryCpuHard:'困難',memoryCpuExpert:'專家',memoryCpuOwner:'擁有者',memoryCpuRemove:'移除',memoryCpuName:'CPU 名稱',memoryCpuDifficulty:'CPU 難度'});
    Object.assign(AC.i18n.STRINGS.en,{memoryAdvanced:'Advanced room settings',memoryHostAutoReady:'Host · no Ready needed',memoryNeedParticipants:'Add a CPU or invite another player to start.',memoryWaitingAudio:'Waiting for sound confirmation: ',memoryWaitingReady:'Waiting for Ready: ',memoryWaitingConnection:'Waiting for reconnection: ',memoryWaitingSettings:'Waiting for room settings to synchronize…',memoryReadyToPlay:'Ready to play'});
    Object.assign(AC.i18n.STRINGS.zh,{memoryAdvanced:'進階房間設定',memoryHostAutoReady:'房主免按準備',memoryNeedParticipants:'請加入 CPU 或邀請另一位玩家，才能開始。',memoryWaitingAudio:'等待聲音確認：',memoryWaitingReady:'等待準備：',memoryWaitingConnection:'等待恢復連線：',memoryWaitingSettings:'等待房間設定同步…',memoryReadyToPlay:'可以開始對戰'});
    Object.assign(AC.i18n.STRINGS.en,{memoryAnalyticsDisclosure:'To improve game balance, we may retain match questions, answers, and results without account IDs or player names for internal analysis.'});
    Object.assign(AC.i18n.STRINGS.zh,{memoryAnalyticsDisclosure:'為改善遊戲平衡，我們可能保存不包含帳號與玩家名稱的對戰題目、作答及結果，僅供內部分析。'});
    Object.assign(AC.i18n.STRINGS.en,{memoryRecovering:'Reconnecting to your room…',memoryRecoveryCollision:'Another active tab controls your previous seat. Use that tab, or join normally as a new participant.',memoryRecoveryAuth:'Your sign-in identity changed. The previous seat cannot be restored.',memoryRecoveryUnsupported:'This browser cannot safely restore a tab session. You can join normally again.',memoryRecoveryMissing:'The previous room no longer exists. You can create or join a room.',memoryRecoveryMember:'Your original membership has ended. You can join normally again.',memoryRecoveryOffline:'The connection is temporarily unavailable. Open Room to retry recovery.'});
    Object.assign(AC.i18n.STRINGS.zh,{memoryRecovering:'正在重新連線至原房間…',memoryRecoveryCollision:'另一個分頁正在控制原席位。請使用該分頁，或以新玩家身分正常加入。',memoryRecoveryAuth:'登入身分已改變，無法恢復原席位。',memoryRecoveryUnsupported:'此瀏覽器無法安全恢復分頁身分，可以重新加入房間。',memoryRecoveryMissing:'原房間已不存在，可以建立或加入房間。',memoryRecoveryMember:'原本的房間成員資格已結束，可以重新加入。',memoryRecoveryOffline:'暫時無法連線，請開啟「房間」重試恢復。'});
    window.MemoryOnline = { create: function (options) {
        var root = options.root, doc = root.ownerDocument, view = options.view, t = AC.i18n.t;
        var controller = null, clock = null, net = null, loading = null, user = null, membershipUid = null;
        var busy = false, destroyed = false, pending = null, observedMatch = null, observedPhase = null, rosterKey = '', awaitingRevision = 0;
        var listeners = new AbortController(), interval, errorText = '', onlineStage = 'module';
        var suspended = false, restoring = false, identityInfo = null, authGeneration = 0, entryCleanupUid = null;
        var tabStorage; try { tabStorage = window.sessionStorage; } catch (_) {}
        var recovery = window.MemoryRecovery.create({ storage: tabStorage, locks: navigator.locks });
        var analytics=null;
        try{if(window.MemoryAnalytics)analytics=window.MemoryAnalytics.create({upload:function(id,record){return net&&net.memoryAnalytics?net.memoryAnalytics.create(id,record):Promise.resolve({status:'unavailable'});}});}catch(_){}
        function get(id) { return root.querySelector('#memory-' + id); }
        var dialog = get('lobby'), nameInput = get('name'), codeInput = get('code-input');
        var settingFields = { capacity: get('capacity'), maxRounds: get('max-rounds'), startingHp: get('start-hp') };
        var Progression = window.MemoryProgression, weightFields = Object.fromEntries(Progression.types.map(function (id) { return [id, get('weight-' + id)]; }));
        var timingFields = { prepareMs: get('prepare-seconds'), memorizeMs: get('memorize-seconds'), answerMs: get('answer-seconds'), resultsMs: get('results-seconds') };
        var pitchTimingFields = { memorizeMs: get('pitch-memorize-seconds'), answerMs: get('pitch-answer-seconds') };
        function text(element, value) { if (element.textContent !== value) element.textContent = value; }
        function element(tag, cls, value) { var e = doc.createElement(tag); e.className = cls || ''; if (value !== undefined) e.textContent = value; return e; }
        function current() { return controller && controller.current(); }
        function data() { var room = current(); return room && room.data; }
        function connected() { return !!clock && clock.isReady() && !!controller && controller.canControl(); }
        function readyFor(d, uid) { var record = d.ready[uid]; return !!record && record.revision === d.revision && record.protocolVersion === Match.version; }
        function audioReadyFor(d, uid) { return controller&&controller.audioReadyFor(d,uid); }
        function onlineError(code, message) { return Object.assign(new Error(message), { code: code }); }
        function showError(error) {
            var code = String(error && error.code || '');
            var key = error instanceof RangeError ? 'memoryInvalidSetting' : error && error.code === 'room/full' ? 'memoryFull' : error && error.code === 'room/started' ? 'memoryAlreadyStarted'
                : code === 'room/not-found' ? 'memoryNotFound' : error && error.message === 'file-protocol' ? 'memoryNeedServer'
                : /^(?:database\/)?permission[_-]denied$/i.test(code) ? 'memoryPermissionError'
                : code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation' ? 'memoryGuestDisabled'
                : code === 'auth/unauthorized-domain' ? 'memoryDomainError'
                : code === 'room/clock-unavailable' ? 'memoryClockError'
                : code === 'room/client-outdated' ? 'memoryClientOutdated'
                : code === 'room/module-unavailable' || code === 'room/init-timeout' ? 'memoryModuleError' : 'memoryNetworkError';
            errorText = t(key) + (code ? ' [' + code + ']' : ''); text(get('lobby-error'), errorText);
            console.error('[Memory online]', { stage: onlineStage, code: code, message: error && error.message || String(error) }, error);
        }
        function listen(e, event, fn, extra) { e.addEventListener(event, fn, Object.assign({ signal: listeners.signal }, extra)); }
        var resultView=window.MemoryResultsView.create({root:root,now:function(){return clock?clock.now():Date.now();},audioReady:function(){var s=view.audioReadiness();return s.confirmed&&s.usable;},canReviewAudio:view.canReviewAudio,stopCurrentAudio:view.stopAudio,onAutoClose:view.reveal,onAudioSetup:function(){resultView.dismissHistory();view.showAudioSetup();},canReturn:function(){var d=data();return !!d&&d.phase==='results'&&controller.service.host(d)===membershipUid&&connected();},isHost:function(){var d=data();return !!d&&(controller.service.host(d)===membershipUid||!connected()&&d.hostUid===membershipUid);},isConnected:connected,isBusy:function(){return busy;},inLobby:function(){var d=data();return !!d&&d.phase==='lobby';},onReturn:function(){run(function(){return controller.backToLobby();});},onLobby:open,onLeaveRoom:function(){leave();close();}});
        var unsubscribePractice=view.onPracticeResult(resultView.observePractice);
        var chromeObserver=null;
        function measureHeaders(){var globalHeight=root.querySelector('.game-topbar').getBoundingClientRect().height,panelHeight=root.querySelector('.memory-panel-header').getBoundingClientRect().height,changed=root.style.getPropertyValue('--memory-global-height')!==globalHeight+'px'||root.style.getPropertyValue('--memory-room-header-height')!==panelHeight+'px';if(!changed)return;root.style.setProperty('--memory-global-height',globalHeight+'px');root.style.setProperty('--memory-room-header-height',panelHeight+'px');if(root.dataset.mode==='online'&&!dialog.open){var screen=get('results-screen');if(!screen.hidden)screen.scrollIntoView({block:'start',behavior:'instant'});else view.reveal();}}
        if(typeof ResizeObserver==='function'){chromeObserver=new ResizeObserver(measureHeaders);chromeObserver.observe(root.querySelector('.game-topbar'));chromeObserver.observe(root.querySelector('.memory-panel-header'));}else window.addEventListener('resize',measureHeaders,{signal:listeners.signal});
        measureHeaders();
        function open() {
            resultView.dismissHistory();
            if (!dialog.open) dialog.showModal();view.audioPanel('room');renderLobby();
            ensureOnline().then(renderLobby).catch(showError);
        }
        function close() { dialog.close();view.audioPanel('local');get('online-btn').focus({ preventScroll: true }); if (current()) view.reveal(); }
        async function run(operation) {
            if (busy || destroyed || suspended) return;
            busy = true; errorText = ''; renderLobby();
            try { await ensureOnline(); if (controller && !destroyed && !suspended) await operation(); }
            catch (error) { showError(error); }
            finally { busy = false; renderLobby(); }
        }
        async function editLobby(operation) {
            var entry = current(), nextRevision = data().revision + 1;
            var changed = await operation();
            // A transaction acknowledgement can precede its subscription snapshot.
            // Keep revision-sensitive controls locked until the accepted edit is visible.
            if (changed && current() === entry) awaitingRevision = Math.max(awaitingRevision, nextRevision);
            return changed;
        }
        async function ensureOnline() {
            if (destroyed || suspended) return;
            if (loading) return loading;
            if (controller && user) return;
            var attemptGeneration = ++authGeneration;
            if (!loading) loading = (async function () {
                onlineStage = 'module';
                if (location.protocol === 'file:') throw new Error('file-protocol');
                if (!window.ArcadeNet) {
                    var cleanup;
                    var ready = new Promise(function (resolve, reject) {
                        var timeout = setTimeout(function () { cleanup(); reject(onlineError('room/init-timeout', 'Online initialization timed out')); }, 15000);
                        function loaded() { cleanup(); resolve(); }
                        cleanup = function () { clearTimeout(timeout); window.removeEventListener('arcade-net-ready', loaded); };
                        window.addEventListener('arcade-net-ready', loaded, { once: true });
                    });
                    try { await Promise.all([import(new URL('../js/net/net.js', location.href).href), ready]); } finally { cleanup(); }
                }
                net = window.ArcadeNet;
                if (net && net.ok && net.rooms && net.rooms.ready) await net.rooms.ready();
                if (!net || !net.ok || !net.rooms || !net.rooms.ok) {
                    var reason = net && (net.rooms && net.rooms.error || net.error);
                    throw reason instanceof Error ? reason : onlineError('room/module-unavailable', String(reason || 'Online unavailable'));
                }
                if (typeof net.rooms.clock !== 'function') throw onlineError('room/client-outdated', 'ArcadeNet.rooms.clock is unavailable');
                onlineStage = 'clock';
                clock = net.rooms.clock({ onError: showError });
                await clock.waitUntilReady();
                onlineStage = 'auth';
                var signedIn, generation = attemptGeneration;
                await new Promise(function (resolve) {
                    var first = true;
                    net.onAuth(function (next) {
                        if (generation !== authGeneration || destroyed || suspended) return;
                        var changed = user && (!next || user.uid !== next.uid);
                        user = next;
                        if (next && signedIn) signedIn();
                        if (changed) {
                            if (!first) ++authGeneration;
                            detach(); recovery.clearRoom(); recovery.stop();
                            if (!first && clock) clock.dispose();
                            recovery = window.MemoryRecovery.create({ storage: tabStorage, locks: navigator.locks });
                            identityInfo = null; controller = null; if (!first) loading = null;
                            errorText = t('memoryRecoveryAuth');
                        }
                        if (first) { first = false; resolve(); }
                        renderLobby();
                    });
                });
                if (!user) {
                    var authTimer;
                    var authenticated = new Promise(function (resolve, reject) {
                        signedIn = resolve; authTimer = setTimeout(function () { reject(new Error('Guest sign-in timed out')); }, 10000);
                    });
                    try { await Promise.all([net.signInGuest(), authenticated]); } finally { clearTimeout(authTimer); signedIn = null; }
                }
                user = net.currentUser();
                if (!user) throw new Error('Guest sign-in unavailable');
                var restoredUid = user.uid, sessionRecovery = recovery;
                var restoredIdentity = identityInfo || await sessionRecovery.initialize(restoredUid);
                if (destroyed || suspended || sessionRecovery !== recovery || generation !== authGeneration) return;
                identityInfo = restoredIdentity;
                if (!net.currentUser() || net.currentUser().uid !== restoredUid) throw onlineError('room/auth-changed', 'Sign-in changed during recovery');
                controller = window.createMemoryRoom({ net: net, sessionId: identityInfo.sessionId, now: clock.now, audioStatus:view.audioReadiness, onChange: onRoom, onError: function (error) {
                    if (clock.isConnected()) showError(error);
                } });
                if (!nameInput.value.trim() && user.name) nameInput.value = user.name;
                var reasons = { collision: 'memoryRecoveryCollision', 'auth-changed': 'memoryRecoveryAuth', unsupported: 'memoryRecoveryUnsupported' };
                if (identityInfo.reason) errorText = t(reasons[identityInfo.reason]);
                if (identityInfo.room) {
                    onlineStage = 'recovery'; restoring = true; renderLobby();
                    try { await controller.recover(identityInfo.room); }
                    catch (error) {
                        if (error.code === 'room/not-found' || error.code === 'room/membership-ended') {
                            recovery.clearRoom(); identityInfo.room = null;
                            errorText = t(error.code === 'room/not-found' ? 'memoryRecoveryMissing' : 'memoryRecoveryMember');
                        } else throw error;
                    } finally { restoring = false; }
                }
                onlineStage = 'room';
                if (entryCleanupUid !== user.uid) {
                    entryCleanupUid = user.uid;
                    var cleanupController = controller;
                    // Recovery has already pulsed the original room. Maintenance is
                    // optional and must never hold up create/join or resume.
                    Promise.resolve().then(function () {
                        if (!destroyed && !suspended && controller === cleanupController) return cleanupController.service.cleanup();
                    }).catch(function () {});
                }
            })().catch(function (error) {
                if (attemptGeneration !== authGeneration || destroyed || suspended) return;
                if (!current() && clock) clock.dispose();
                if (controller) controller.detach();
                controller = null; loading = null; throw error;
            });
            await loading;
        }
        function configFromFields() {
            var result = {};
            Object.keys(settingFields).forEach(function (key) { result[key] = Number(settingFields[key].value); });
            result.selectionVersion = 3; result.categoryMode = 'weighted'; result.categoryWeights = readWeights();
            result.adaptive = { enabled: get('adaptive').checked, initial: Number(get('initial-difficulty').value) };
            result.timing = {};
            Object.keys(timingFields).forEach(function (key) { result.timing[key] = Number(timingFields[key].value) * 1000; });
            result.pitch = { timing: {} }; Object.keys(pitchTimingFields).forEach(function (key) { result.pitch.timing[key] = Number(pitchTimingFields[key].value) * 1000; });
            return Match.options(result);
        }
        function readWeights() { return Object.fromEntries(Progression.types.map(function (id) { return [id, Number(weightFields[id].value)]; })); }
        function leave() {
            var leaving = controller && controller.leave();
            recovery.clearRoom(); if (identityInfo) identityInfo.room = null;
            membershipUid = null; pending = null; observedMatch = observedPhase = null; awaitingRevision = 0;
            view.setShared(null); renderMatch(); renderLobby();
            if (leaving) leaving.catch(showError);
        }
        function detach() {
            if (controller) controller.detach();
            membershipUid = null; pending = null; observedMatch = observedPhase = null; awaitingRevision = 0;
            view.setShared(null); renderMatch(); renderLobby();
        }
        function difficulty(level){return t(['','memoryCpuEasy','memoryCpuNormal','memoryCpuHard','memoryCpuExpert'][level]||'memoryCpuNormal');}
        function participantLabel(game,id){var p=game.roster[id];return p.name+(p.type==='cpu'?' · CPU · '+difficulty(p.difficulty):'');}
        function renderLobby() {
            if (destroyed) return;
            var d = data(), player = controller && controller.service.currentPlayer(), uid = player && player.uid;
            var inRoom = !!d && !!(d.players || {})[uid], host = inRoom && controller.service.host(d) === uid;
            var lobby = inRoom && d.phase === 'lobby', finished = inRoom && d.phase === 'results';
            if (!lobby || d.revision >= awaitingRevision) awaitingRevision = 0;
            var editing = busy || restoring || awaitingRevision > 0;
            var displayedWeights = inRoom ? d.options.categoryWeights || Progression.preset(d.options.categoryMode) : readWeights();
            var sum = Progression.total(displayedWeights), needsAudio = Match.requiresAudio(inRoom ? d.options : { selectionVersion: 3, categoryWeights: displayedWeights });
            Progression.types.forEach(function (id) { if (inRoom && doc.activeElement !== weightFields[id]) weightFields[id].value = displayedWeights[id]; text(get('probability-' + id), sum ? Math.round(displayedWeights[id] / sum * 100) + '%' : '—'); });
            if (inRoom) { var adaptive = d.options.adaptive || Progression.parameters(); get('adaptive').checked = adaptive.enabled; if (doc.activeElement !== get('initial-difficulty')) get('initial-difficulty').value = adaptive.initial; }
            var randomChallenge=!inRoom||d.options.challengeVersion===1;get('adaptive').closest('label').hidden=randomChallenge;get('initial-difficulty').closest('label').hidden=randomChallenge;
            get('initial-difficulty').disabled = !get('adaptive').checked;
            text(get('frequency-note'), t(sum ? randomChallenge?'memoryRandomNote':'memoryFrequencyNote' : 'memoryNoCategories'));
            get('room-audio').hidden = !needsAudio&&!view.audioSetupRequested();
            if(dialog.open)view.audioPanel('room',needsAudio);
            text(get('account'), user ? user.anon ? t('memoryGuest') : user.name || t('memoryGuest') : t('memoryConnecting'));
            get('google-btn').hidden = !!user && !user.anon; get('google-btn').disabled = busy || inRoom;
            get('room-entry').hidden = inRoom; get('room-membership').hidden = !inRoom;
            get('create-btn').disabled = get('join-btn').disabled = busy || restoring || !controller;
            get('room-settings').disabled = editing || inRoom && (!host || !lobby);
            nameInput.disabled = editing || inRoom && !lobby;
            get('leave-btn').hidden = !inRoom;
            get('ready-btn').hidden = !lobby || host; get('start-btn').hidden = !lobby || !host;
            get('return-btn').hidden = !finished || !host;
            get('start-btn').disabled = editing || !controller || !controller.canStart() || needsAudio && !view.audioReady();
            get('ready-btn').disabled = editing || !connected() || !sum || needsAudio && (!view.audioReady() || !inRoom || !audioReadyFor(d, uid));
            get('return-btn').disabled = busy || !connected();
            get('previous-match').hidden=!lobby||!Match.supported(d&&d.game)||d.game.status!=='over';
            get('copy-btn').disabled = busy;get('add-cpu').hidden=!inRoom;get('add-cpu').disabled=editing||!lobby||!connected()||d.lobbyVersion!==Match.version||d.seatOrder.length>=d.options.capacity;
            if (inRoom) {
                Object.keys(pitchTimingFields).forEach(function (key) { var settings = d.options.pitch || window.MemoryPitch.defaults; if (doc.activeElement !== pitchTimingFields[key]) pitchTimingFields[key].value = settings.timing[key] / 1000; });
                text(get('room-code'), current().code);
                var ready = readyFor(d, uid);
                text(get('ready-btn'), t(ready ? 'memoryUnready' : 'memoryReady'));
                var p = d.participants[controller.playerId()];
                if (p && doc.activeElement !== nameInput && !editing) nameInput.value = p.name;
                Object.keys(settingFields).forEach(function (key) {
                    var field = settingFields[key]; if (!editing && doc.activeElement !== field) field.value = String(key === 'categoryMode' ? d.options.categoryMode || 'color' : d.options[key]);
                });
                Object.keys(timingFields).forEach(function (key) {
                    var field = timingFields[key]; if (!editing && doc.activeElement !== field) field.value = String(d.options.timing[key] / 1000);
                });
                Array.from(settingFields.capacity.options).forEach(function (option) { option.disabled = Number(option.value) < d.seatOrder.length; });
                var key = JSON.stringify([d.seatOrder, d.participants, d.ready,d.audioReady,view.audioReadiness(),d.hostUid, AC.i18n.locale, editing,lobby,connected(),
                    d.seatOrder.map(function (id) { return d.presence[d.participants[id].controllerId] === -1; })]);
                if (key !== rosterKey) {
                    rosterKey = key;
                    get('lobby-players').replaceChildren.apply(get('lobby-players'), d.seatOrder.map(function (id, index) {
                        var p = d.participants[id], li = element('li', 'memory-lobby-player');
                        var name = element('span', 'memory-roster-name', (index + 1) + '. ' + p.name);
                        var badges = element('span', 'memory-roster-badges');
                        if(p.type==='cpu'){
                            li.dataset.cpuId=id;var owned=p.controllerId===uid,ownerId=d.seatOrder.find(function(pid){return d.participants[pid].type==='human'&&d.participants[pid].controllerId===p.controllerId;}),ownerName=ownerId?d.participants[ownerId].name:'';badges.append(element('span','memory-badge','CPU'),element('span','memory-badge',difficulty(p.difficulty)),element('span','memory-badge',t('memoryCpuOwner')+': '+ownerName));
                            if(owned&&lobby){var controls=element('div','memory-cpu-controls'),input=element('input');input.type='text';input.maxLength=32;input.value=p.name;input.dataset.cpuName=id;input.disabled=editing;input.setAttribute('aria-label',t('memoryCpuName'));var select=element('select');select.dataset.cpuDifficulty=id;select.setAttribute('aria-label',t('memoryCpuDifficulty'));select.disabled=editing;[1,2,3,4].forEach(function(level){var option=element('option','',difficulty(level));option.value=level;select.append(option);});select.value=p.difficulty;var remove=element('button','btn',t('memoryCpuRemove'));remove.type='button';remove.dataset.cpuRemove=id;remove.disabled=editing;controls.append(input,select,remove);li.append(name,badges,controls);}else li.append(name,badges);return li;
                        }
                        if (p.controllerId === uid) badges.append(element('span', 'memory-badge', t('memoryYou')));
                        if (p.controllerId === d.hostUid) badges.append(element('span', 'memory-badge', t('memoryHost')));
                        var ready = readyFor(d, p.controllerId);
                        badges.append(element('span', 'memory-badge', t(d.presence[p.controllerId] === -1 ? 'memoryReconnecting' : p.controllerId===d.hostUid?'memoryHostAutoReady':ready ? 'memoryReady' : 'memoryNotReady')));
                        if(needsAudio)badges.append(element('span','memory-badge',t(audioReadyFor(d,p.controllerId)?'memoryAudioConfirmed':'memoryAudioNeeded')));
                        li.append(name, badges); return li;
                    }));
                }
            } else rosterKey = '';
            text(get('room-note'), t(!inRoom || lobby ? 'memoryReadyNote' : finished ? 'memoryFinishedNote' : 'memoryLockedNote'));
            var reason='';
            if(lobby){
                if(!connected())reason=t('memoryConnecting');
                else if(editing||d.lobbyVersion!==Match.version)reason=t('memoryWaitingSettings');
                else if(!sum)reason=t('memoryNoCategories');
                else if(d.seatOrder.length<2)reason=t('memoryNeedParticipants');
                else if(d.seatOrder.some(function(id){return d.presence[d.participants[id].controllerId]===-1;}))reason=t('memoryWaitingConnection')+d.seatOrder.filter(function(id){var p=d.participants[id];return p.type==='human'&&d.presence[p.controllerId]===-1;}).map(function(id){return d.participants[id].name;}).join(', ');
                else if(needsAudio){var missing=d.seatOrder.filter(function(id){return d.participants[id].type==='human'&&!audioReadyFor(d,d.participants[id].controllerId);});if(missing.length)reason=t('memoryWaitingAudio')+missing.map(function(id){return d.participants[id].name;}).join(', ');}
                if(!reason){var waiting=d.seatOrder.filter(function(id){var p=d.participants[id];return p.type==='human'&&p.controllerId!==d.hostUid&&!readyFor(d,p.controllerId);});reason=waiting.length?t('memoryWaitingReady')+waiting.map(function(id){return d.participants[id].name;}).join(', '):t('memoryReadyToPlay');}
            }
            text(get('start-reason'),reason);
            text(get('lobby-error'), errorText);
        }
        function renderMatch() {
            var d = data(), game = d && d.game, inRoom = !!d;
            var playing = inRoom && d.phase !== 'lobby' && Match.supported(game), id = controller && controller.playerId();
            resultView.update(playing?game:null,id,inRoom&&d.phase==='lobby'?d.game:null);
            get('match-status').hidden = !playing; get('match-results').hidden = true;
            text(get('mode-label'), inRoom ? t('memoryRoom') + ' ' + current().code : t('memoryLocal'));
            text(get('online-btn'), inRoom ? t('memoryRoom') + ' · ' + current().code : t('memoryOnlineRoom'));
            get('online-btn').setAttribute('aria-label',inRoom?t('memoryViewRoom')+' '+current().code:t('memoryOnlineRoom'));
            text(get('connection'), inRoom ? t(connected() ? 'memoryConnected' : 'memoryOffline') : '');
            if (!playing) return;
            text(get('hp'), points(game.hpUnits[id] || 0));
            get('hp-fill').style.width = Math.max(0, Math.min(100, (game.hpUnits[id] || 0) / (game.config.startingHp * SCALE) * 100)) + '%';
            text(get('match-round'), game.round + ' / ' + game.config.maxRounds);
            var rows = game.lastResult && game.lastResult.round === game.round ? game.lastResult.rows : [];
            var own = rows.find(function (row) { return row.id === id; });
            text(get('personal-damage'), game.phase === 'results' && own ? (own.damageUnits ? '−' : '') + points(own.damageUnits) : !Match.eligible(game, id) ? t('memoryObserved') : '');
            get('participant-strip').replaceChildren.apply(get('participant-strip'), game.seatOrder.map(function (pid) {
                var status = game.withdrawn.includes(pid) ? 'memoryLeft' : game.hpUnits[pid] <= 0 ? 'memoryOut'
                    : game.submissions[pid] ? 'memorySubmitted' : 'memoryPlaying';
                var item = element('span', 'memory-participant' + (pid === id ? ' mine' : ''));
                item.append(element('span', 'memory-participant-name', participantLabel(game,pid)), element('span', 'memory-participant-state', t(status)));
                item.title = participantLabel(game,pid); return item;
            }));
            if (game.phase !== 'results') return;
            text(get('match-heading'), t(game.status === 'over' ? 'memoryFinalResult' : 'memoryRoundResult'));
            var winners = game.winners.map(function (pid) { return participantLabel(game,pid); }).join(AC.i18n.locale === 'zh' ? '、' : ', ');
            text(get('outcome'), game.status !== 'over' ? '' : !winners ? t('memoryNoWinner')
                : t(game.winners.length > 1 ? 'memorySharedWinners' : 'memoryWinners') + winners + ' · '
                    + t(game.endReason === 'round-cap' ? 'memoryCapEnd' : game.endReason === 'withdrawal' ? 'memoryWithdrawalEnd' : 'memorySurvivorEnd'));
            get('result-rows').replaceChildren.apply(get('result-rows'), game.seatOrder.map(function (pid) {
                var row = rows.find(function (value) { return value.id === pid; }), tr = element('tr', pid === id ? 'mine' : '');
                if (row && row.top) tr.classList.add('memory-top');
                var status = game.withdrawn.includes(pid) ? 'memoryLeft' : game.hpUnits[pid] <= 0 ? 'memoryOut' : row && row.top ? 'memoryTop' : 'memoryAlive';
                [participantLabel(game,pid) + (pid === id ? ' · ' + t('memoryYou') : ''), row ? (row.scoreUnits / SCALE).toFixed(1) : '—',
                    row ? (row.damageUnits ? '−' : '') + points(row.damageUnits) : '—', points(game.hpUnits[pid]), t(status)]
                    .forEach(function (value) { tr.append(element('td', '', value)); });
                return tr;
            }));
        }
        function renderView() {
            var d = data(); if (!d) return;
            var game = d.phase === 'lobby' || !Match.supported(d.game) ? null : d.game;
            if (d.phase !== 'lobby' && !Match.supported(d.game)) errorText = t('memoryVersionError');
            var key = game && game.matchId + ':' + game.round + ':' + game.questionId;
            if (pending && pending.key !== key) pending = null;
            resultView.prepare(game);
            view.setShared({ game: game, participantId: controller.playerId(), now: clock.now, connected: connected(),
                submitting: !!pending, retry: !!pending && pending.failed,
                onSubmit: submit, onLobby: open });
        }
        function onRoom(d) {
            if (!d || !controller.service.currentPlayer() || !d.players[controller.service.currentPlayer().uid]) {
                detach(); recovery.clearRoom(); if (identityInfo) identityInfo.room = null;
                errorText = t('memoryRoomGone'); open(); return;
            }
            membershipUid = controller.service.currentPlayer().uid;
            recovery.remember(current().code); if (identityInfo) identityInfo.room = current().code;
            try{if(analytics&&d.game&&Object.values(d.game.owners||{}).includes(membershipUid))analytics.observe(d.game);}catch(_){}
            var game = d.game || {}, changed = observedMatch !== game.matchId;
            var enteredLobby = observedPhase !== 'lobby' && d.phase === 'lobby';
            observedMatch = game.matchId; observedPhase = d.phase;
            if ((d.phase === 'playing' && changed || restoring && d.phase !== 'lobby') && dialog.open){dialog.close();view.audioPanel('local');}
            renderView(); renderMatch(); renderLobby();
            if (enteredLobby && !dialog.open){dialog.showModal();view.audioPanel('room');renderLobby();}
            syncAudio();
        }
        function submit(answer, source) {
            var d = data(), game = d && d.game;
            if (!game || !connected() || !Match.eligible(game, controller.playerId()) || game.phase !== 'active'
                || clock.now() >= game.timeline.deadline) return false;
            var key = game.matchId + ':' + game.round + ':' + game.questionId;
            if (pending && pending.key === key && pending.inflight) return true;
            if (!pending || pending.key !== key) pending = { key: key, answer: Match.copyAnswer(answer), token: Match.token(game),
                nonce: crypto.getRandomValues(new Uint32Array(4)).join('-'), source:source==='auto'?'auto':'manual', attempts: 0 };
            var attempt = pending; attempt.inflight = true; attempt.failed = false; attempt.attempts++;
            renderView();
            controller.submit(attempt.answer, attempt.token, attempt.nonce,attempt.source).then(function (accepted) {
                if (pending !== attempt) return;
                attempt.accepted = accepted; attempt.failed = !accepted;
            }).catch(function () {
                if (pending === attempt) attempt.failed = true;
            }).finally(function () {
                if (pending !== attempt) return;
                attempt.inflight = false; attempt.retryAt = clock.now() + 1000;
                if (attempt.failed && source === 'manual' && clock.now() < game.timeline.deadline) errorText = t('memorySubmittingError');
                renderView(); renderMatch();
            });
            return true;
        }
        function tick() {
            if (destroyed || suspended || !controller || !current()) return Promise.resolve(false);
            if (pending && pending.failed && !pending.inflight && pending.attempts < 3 && connected() && clock.now() >= pending.retryAt)
                submit(pending.answer, 'retry');
            var d = data(), uid = membershipUid;
            syncAudio();
            renderView(); renderMatch(); if (dialog.open) renderLobby();
            return controller.tick().catch(function (error) { if (clock.isConnected()) showError(error); });
        }
        listen(get('add-cpu'),'click',function(){run(function(){return editLobby(function(){return controller.addCpuPlayer();});});});
        listen(get('lobby-players'),'change',function(e){var id=e.target.dataset.cpuName||e.target.dataset.cpuDifficulty;if(!id)return;var name=e.target.dataset.cpuName,value=e.target.value;run(function(){return editLobby(function(){return name?controller.renameCpu(id,value):controller.setCpuDifficulty(id,Number(value));});});});
        listen(get('lobby-players'),'click',function(e){var button=e.target.closest('[data-cpu-remove]');if(!button)return;var id=button.dataset.cpuRemove;run(function(){return editLobby(function(){return controller.removeCpuPlayer(id);});});});
        listen(get('online-btn'), 'click', open); listen(get('lobby-close'), 'click', close);
        listen(dialog, 'cancel', function (event) { event.preventDefault(); close(); });
        listen(dialog, 'keydown', function (event) { event.stopPropagation(); });
        listen(get('google-btn'), 'click', function () { run(function () { return net.signInGoogle(); }); });
        listen(get('create-btn'), 'click', function () { run(function () { return controller.create(configFromFields(), nameInput.value); }); });
        listen(get('join-btn'), 'click', function () { run(async function () {
            var name = nameInput.value.trim(); await controller.join(codeInput.value);
            if (name) await controller.rename(name);
        }); });
        listen(get('copy-btn'), 'click', function () { run(async function () { await navigator.clipboard.writeText(current().code); AC.toast.show(t('memoryCopied')); }); });
        listen(get('leave-btn'), 'click', function () { leave(); close(); });
        listen(get('ready-btn'), 'click', function () { var d = data(); run(function () { return controller.ready(!readyFor(d, membershipUid), d.revision); }); });
        var audioSync=null;
        function syncAudio(){
            var d=data(),uid=(controller&&controller.service.currentPlayer()||{}).uid,s=view.audioReadiness();
            if(!d||d.phase!=='lobby'||!connected()||audioSync)return;
            var wanted=s.confirmed&&s.usable,record=(d.audioReady||{})[uid];
            if(wanted&&audioReadyFor(d,uid)||!wanted&&!record)return;
            audioSync=controller.acknowledgeAudio(wanted,d.revision).catch(showError).finally(function(){audioSync=null;if(dialog.open)renderLobby();});
        }
        var unsubscribeAudio=view.onAudioChange(function(){syncAudio();if(dialog.open)renderLobby();});view.setAudioSetupHandler(open);
        listen(get('start-btn'), 'click', function () { run(function () { return controller.start(); }); });
        listen(get('return-btn'), 'click', function () { run(function () { return controller.backToLobby(); }); });
        listen(get('previous-match'),'click',function(){var d=data();if(!d||d.phase!=='lobby'||!Match.supported(d.game)||d.game.status!=='over')return;close();resultView.showPrevious();});
        listen(nameInput, 'change', function () {
            var name = nameInput.value;
            if (current()) run(function () { return editLobby(function () { return controller.rename(name); }); });
        });
        Object.keys(settingFields).forEach(function (key) {
            listen(settingFields[key], 'change', function () {
                var value = key === 'categoryMode' ? settingFields[key].value : Number(settingFields[key].value), valid = settingFields[key].checkValidity();
                if (current()) run(async function () {
                    if (!valid || !await editLobby(function () { return controller.configure({ [key]: value }); })) errorText = t('memoryInvalidSetting');
                });
                else renderLobby();
            });
        });
        Object.keys(timingFields).forEach(function (key) {
            listen(timingFields[key], 'change', function () {
                var value = Number(timingFields[key].value) * 1000, valid = timingFields[key].checkValidity();
                if (current()) run(async function () {
                    if (!valid || !await editLobby(function () { return controller.configure({ timing: { [key]: value } }); })) errorText = t('memoryInvalidSetting');
                });
            });
        });
        Progression.types.forEach(function (id) {
            listen(weightFields[id], 'change', function () {
                var weights = readWeights();
                if (current()) run(async function () { if (!await editLobby(function () { return controller.configure({ selectionVersion: 3, categoryMode: 'weighted', categoryWeights: weights }); })) errorText = t('memoryInvalidSetting'); });
                else renderLobby();
            });
        });
        listen(get('adaptive'), 'change', function () { var enabled = get('adaptive').checked; if (current()) run(async function () { await editLobby(function () { return controller.configure({ adaptive: { enabled: enabled } }); }); }); });
        listen(get('initial-difficulty'), 'change', function () { var value = Number(get('initial-difficulty').value); if (current()) run(async function () { if (get('initial-difficulty').checkValidity()) await editLobby(function () { return controller.configure({ adaptive: { initial: value } }); }); }); });
        Object.keys(pitchTimingFields).forEach(function (key) {
            listen(pitchTimingFields[key], 'change', function () {
                var value = Number(pitchTimingFields[key].value) * 1000, valid = pitchTimingFields[key].checkValidity();
                if (current()) run(async function () { if (!valid || !await editLobby(function () { return controller.configure({ pitch: { timing: { [key]: value } } }); })) errorText = t('memoryInvalidSetting'); });
            });
        });
        listen(codeInput, 'input', function () { codeInput.value = normalizeCode(codeInput.value); });
        listen(codeInput, 'paste', function (event) { event.preventDefault(); codeInput.value = normalizeCode(event.clipboardData.getData('text')); });
        listen(codeInput, 'keydown', function (event) { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); get('join-btn').click(); } });
        listen(doc, 'visibilitychange', function () { if (clock) clock.refresh(); tick(); });
        listen(window, 'pageshow', function (event) { if (event.persisted) { location.reload(); return; } if (clock) clock.refresh(); tick(); });
        listen(window, 'pagehide', function () { suspended = true; if (controller) controller.detach(); recovery.stop(); if (clock) clock.dispose(); view.stopAudio(); });
        var unsubscribe = AC.i18n.subscribe(function () { renderLobby(); renderMatch(); });
        interval = setInterval(tick, 1000); renderMatch();
        if (recovery.hasRoom()) {
            restoring = true; errorText = t('memoryRecovering'); dialog.showModal(); view.audioPanel('room'); renderLobby();
            ensureOnline().then(function () { if (errorText === t('memoryRecovering')) errorText = ''; renderLobby(); }).catch(function (error) {
                if (onlineStage === 'recovery') { errorText = t('memoryRecoveryOffline'); renderLobby(); } else showError(error);
            }).finally(function () { restoring = false; renderLobby(); });
        }
        return { open: open, ensureOnline: ensureOnline, tick: tick, controller: function () { return controller; },
            clock: function () { return clock; }, pending: function () { return pending && { key: pending.key, nonce: pending.nonce, inflight: pending.inflight }; },
            destroy: function () { destroyed = true; clearInterval(interval); recovery.stop(); if(controller)controller.detach();try{if(analytics)analytics.destroy();}catch(_){}if(chromeObserver)chromeObserver.disconnect();listeners.abort(); unsubscribe();unsubscribeAudio();unsubscribePractice();resultView.destroy();view.setAudioSetupHandler(null);if (clock) clock.dispose(); } };
    } };
})();
