/* Unified room view. Membership, ownership and accepted matches stay in the room policy. */
(function () {
    'use strict';
    Object.assign(window.ArcadeCommon.i18n.STRINGS.en, {
        dartsLobbyGestureHelp: 'Throwing controls',
        dartsLobbyRulesExplained: 'Rules explained',
        dartsLobbyStartPractice: 'Start Practice', dartsLobbyStartGame: 'Start Game',
        dartsLobbyStarting: 'Starting…', dartsLobbyWaitingHost: 'Waiting for Host',
        dartsLobbyReadyToStart: 'Ready to start', dartsLobbyOnlyHost: 'Only the host can start.',
        dartsLobbyWaitingDevice: 'Waiting for 1 device to be ready.', dartsLobbyWaitingDevices: 'Waiting for {n} devices to be ready.',
        dartsLobbyRoundsShort: '{n} rounds', dartsLobbyUnlimitedRounds: 'Unlimited rounds',
        dartsLobbyThreeDarts: '3 darts per turn', dartsLobbyFreeThrow: 'Free throws',
        dartsLobbyPersonalTotal: 'Personal total', dartsLobbySecondsShort: '{seconds}s per turn',
        dartsLobbyPracticeSolo: 'Unlimited free throws, recorded one dart at a time.',
        dartsLobbyPracticeShared: '{n} players take turns in seat order, three darts each. Unlimited rounds, no winner.',
        dartsLobbyCountupSolo: '{rounds} rounds of three darts. Build your personal total.',
        dartsLobbyCountupShared: 'Each player gets {rounds} rounds of three darts. Highest total wins.',
        dartsLobby501OpenOut: 'Start at 501 and reach exactly zero. Any scoring region can finish.',
        dartsLobby501MasterOut: 'Start at 501 and reach exactly zero. Finish on a double, triple or Bull.',
        dartsLobby501DoubleOut: 'Start at 501 and reach exactly zero. Finish on a double or inner Bull.',
        dartsLobbyMasterIn: 'A double, triple or Bull opens scoring; the opening dart counts.',
        dartsLobbyDoubleIn: 'A double or inner Bull opens scoring; the opening dart counts.',
        dartsLobbyBust: 'A bust cancels the entire turn.',
        dartsLobbyBustEntry: 'A bust restores the score and opening state from the start of the turn.',
        dartsLobbyBull2550: 'Outer Bull scores 25, inner Bull 50.',
        dartsLobbyBull5050: 'Both Bulls score 50.',
        dartsLobbyOuterNotDouble: 'Outer Bull still does not count as a double.',
        dartsLobbyCricketAuto: '{n} players: {variant} Cricket.',
        dartsLobbyCricketStandard: 'Close 20–15 and Bull with three marks each. Extra marks score for you. Close all targets and have at least as many points as every opponent to win.',
        dartsLobbyCricketCutThroat: 'Close 20–15 and Bull with three marks each. Extra marks penalize every opponent who still has that target open. Close all targets and have no more points than every opponent to win.',
        dartsLobby501Limit: 'After {rounds} turns per player, lowest remaining score wins the leg.',
        dartsLobbyCricketHighLimit: 'After {rounds} turns per player, highest score wins the leg.',
        dartsLobbyCricketLowLimit: 'After {rounds} turns per player, lowest score wins the leg.',
        dartsLobbyUnlimited501: 'No round limit; play until a legal checkout.',
        dartsLobbyUnlimitedCricket: 'No round limit; play until the closure and score conditions are met.',
        dartsLobbyCorkTie: 'Tied players throw closest to Bull.',
        dartsLobbyPracticeTimer: 'Each turn allows {seconds} seconds.',
        dartsLobbyInviteLocal: 'Enter a friend’s code, or get a code to invite them.',
        dartsLobbyInviteShared: 'Share this code with your friends.',
        dartsLobbyInvitePlaying: 'Friends can join after the host returns to the lobby.',
    });
    Object.assign(window.ArcadeCommon.i18n.STRINGS.zh, {
        dartsLobbyGestureHelp: '投擲操作',
        dartsLobbyRulesExplained: '詳細規則',
        dartsLobbyStartPractice: '開始練習', dartsLobbyStartGame: '開始遊戲',
        dartsLobbyStarting: '開始中…', dartsLobbyWaitingHost: '等待房主開始',
        dartsLobbyReadyToStart: '可以開始', dartsLobbyOnlyHost: '由房主開始遊戲。',
        dartsLobbyWaitingDevice: '等待 1 台裝置準備。', dartsLobbyWaitingDevices: '等待 {n} 台裝置準備。',
        dartsLobbyRoundsShort: '{n} 回合', dartsLobbyUnlimitedRounds: '不限回合',
        dartsLobbyThreeDarts: '每回合 3 鏢', dartsLobbyFreeThrow: '自由投擲',
        dartsLobbyPersonalTotal: '累積個人成績', dartsLobbySecondsShort: '每回合 {seconds} 秒',
        dartsLobbyPracticeSolo: '自由投擲，不限回合，逐鏢記錄。',
        dartsLobbyPracticeShared: '{n} 人依席位輪流，每人三鏢後換人，不限回合、不計勝負。',
        dartsLobbyCountupSolo: '每回合三鏢，共 {rounds} 回合，累積個人成績。',
        dartsLobbyCountupShared: '每人 {rounds} 回合、每回合三鏢，累積總分最高者勝。',
        dartsLobby501OpenOut: '從 501 分扣至恰好零分，任意得分區均可結鏢。',
        dartsLobby501MasterOut: '從 501 分扣至恰好零分，最後一鏢須為雙倍區、三倍區或紅心。',
        dartsLobby501DoubleOut: '從 501 分扣至恰好零分，最後一鏢須為雙倍區或內紅心。',
        dartsLobbyMasterIn: '須命中雙倍區、三倍區或紅心才能開分，開分鏢本身計分。',
        dartsLobbyDoubleIn: '須命中雙倍區或內紅心才能開分，開分鏢本身計分。',
        dartsLobbyBust: '爆鏢時取消整回合得分。',
        dartsLobbyBustEntry: '爆鏢時，分數與開分狀態回復至本回合開始時。',
        dartsLobbyBull2550: '外紅心 25 分、內紅心 50 分。',
        dartsLobbyBull5050: '內外紅心均為 50 分。',
        dartsLobbyOuterNotDouble: '外紅心仍不算雙倍區。',
        dartsLobbyCricketAuto: '目前 {n} 人，採用{variant} Cricket。',
        dartsLobbyCricketStandard: '20–15 與紅心各需三個記號關閉，多餘記號為自己得分。全部關閉且分數不低於任何對手即勝。',
        dartsLobbyCricketCutThroat: '20–15 與紅心各需三個記號關閉，多餘記號為尚未關閉該目標的每位對手加罰分。全部關閉且分數不高於任何對手即勝。',
        dartsLobby501Limit: '每人 {rounds} 回合後仍未結鏢，以剩餘分數最低決勝。',
        dartsLobbyCricketHighLimit: '每人 {rounds} 回合後仍未分勝負，以最高分決勝。',
        dartsLobbyCricketLowLimit: '每人 {rounds} 回合後仍未分勝負，以最低分決勝。',
        dartsLobbyUnlimited501: '不限回合，直到有人成功結鏢。',
        dartsLobbyUnlimitedCricket: '不限回合，依關閉目標與分數條件分勝負。',
        dartsLobbyCorkTie: '平手者加賽比靶心。',
        dartsLobbyPracticeTimer: '每回合限時 {seconds} 秒。',
        dartsLobbyInviteLocal: '輸入朋友的房號，或取得房號邀請朋友。',
        dartsLobbyInviteShared: '將此房號傳給朋友即可邀請。',
        dartsLobbyInvitePlaying: '本場開始後，朋友須等房主返回大廳才能加入。',
    });
    window.createDartsLobby = function (options) {
        var doc = options.document, t = options.t, dialog = doc.getElementById('lobby');
        var lastSlots = '', busy = false, starting = false;
        var content = doc.getElementById('lobby-content'), viewport = window.visualViewport, viewportFrame = 0;
        var fields = { 'mode-select': 'mode', 'match-select': 'legsToWin', 'timer-select': 'turnMs',
            'rounds-select': 'roundLimit', 'out-select': 'outRule', 'in-select': 'inRule',
            'bull-select': 'bullMode', 'cricket-select': 'cricketVariant' };
        function get(id) { return doc.getElementById(id); }
        function node(tag, cls, text) {
            var el = doc.createElement(tag); if (cls) el.className = cls;
            if (text != null) el.textContent = text; return el;
        }
        function format(key, values) {
            return t(key).replace(/\{(\w+)\}/g, function (_, name) { return values[name]; });
        }
        function setText(id, text) { var el = get(id); if (el.textContent !== text) el.textContent = text; }
        function ruleSummary(config, count) {
            var eligibility = window.DartsRules.eligibility(config, count), parts = [];
            if (!eligibility.allowed) return options.modeName(config.mode) + ' ' + t('dartsNeedsPlayers').replace('{n}', eligibility.minPlayers);
            if (config.mode === '501') {
                parts.push(t('darts' + ({ open: 'Open', master: 'Master', double: 'Double' }[config.inRule]) + 'In'),
                    t('darts' + ({ open: 'Open', master: 'Master', double: 'Double' }[config.outRule]) + 'Out'));
            } else if (config.mode === 'cricket') {
                var cutthroat = config.cricketVariant === 'cutthroat' || config.cricketVariant === 'auto' && count >= 3;
                parts.push(t(cutthroat ? 'dartsCutThroatCricket' : 'dartsStandardCricket'));
            }
            parts.push(config.roundLimit ? format('dartsLobbyRoundsShort', { n: config.roundLimit }) : t('dartsLobbyUnlimitedRounds'));
            if (config.mode === 'practice') parts.push(t(count === 1 ? 'dartsLobbyFreeThrow' : 'dartsLobbyThreeDarts'));
            if (config.mode === 'countup') parts.push(t('dartsLobbyThreeDarts'), t(count === 1 ? 'dartsLobbyPersonalTotal' : 'dartsHighestWins'));
            if (config.mode === 'cricket') parts.push(t(cutthroat ? 'dartsLowestWins' : 'dartsHighestWins'));
            if (config.mode === '501' || config.mode === 'countup') parts.push(t(config.bullMode === '50-50' ? 'dartsBull5050' : 'dartsBull2550'));
            if (config.mode === 'practice' && config.turnMs) parts.push(format('dartsLobbySecondsShort', { seconds: config.turnMs / 1000 }));
            return parts.join(' · ');
        }
        function description(config, count) {
            var eligibility = window.DartsRules.eligibility(config, count), parts = [], variant;
            if (!eligibility.allowed) return options.modeName(config.mode) + ' ' + t('dartsNeedsPlayers').replace('{n}', eligibility.minPlayers);
            if (config.mode === 'practice') {
                parts.push(count === 1 ? t('dartsLobbyPracticeSolo') : format('dartsLobbyPracticeShared', { n: count }));
                if (config.turnMs) parts.push(format('dartsLobbyPracticeTimer', { seconds: config.turnMs / 1000 }));
                return parts.join(' ');
            }
            if (config.mode === 'countup') {
                parts.push(format(count === 1 ? 'dartsLobbyCountupSolo' : 'dartsLobbyCountupShared', { rounds: config.roundLimit }));
            } else if (config.mode === '501') {
                parts.push(t('dartsLobby501' + ({ open: 'Open', master: 'Master', double: 'Double' }[config.outRule] || 'Double') + 'Out'));
                if (config.inRule !== 'open') parts.push(t(config.inRule === 'master' ? 'dartsLobbyMasterIn' : 'dartsLobbyDoubleIn'));
                parts.push(t(config.inRule === 'open' ? 'dartsLobbyBust' : 'dartsLobbyBustEntry'));
            } else if (config.mode === 'cricket') {
                variant = config.cricketVariant === 'auto' ? count >= 3 ? 'cutthroat' : 'standard' : config.cricketVariant;
                if (config.cricketVariant === 'auto') parts.push(format('dartsLobbyCricketAuto', {
                    n: count, variant: t(variant === 'cutthroat' ? 'dartsCutThroatCricket' : 'dartsStandardCricket') }));
                parts.push(t(variant === 'cutthroat' ? 'dartsLobbyCricketCutThroat' : 'dartsLobbyCricketStandard'));
            }
            if (config.mode === '501' || config.mode === 'countup') {
                parts.push(t(config.bullMode === '50-50' ? 'dartsLobbyBull5050' : 'dartsLobbyBull2550'));
                if (config.mode === '501' && config.bullMode === '50-50' && (config.inRule === 'double' || config.outRule === 'double')) parts.push(t('dartsLobbyOuterNotDouble'));
            }
            if (config.mode === '501' || config.mode === 'cricket') {
                if (config.roundLimit) parts.push(format(config.mode === '501' ? 'dartsLobby501Limit' :
                    variant === 'cutthroat' ? 'dartsLobbyCricketLowLimit' : 'dartsLobbyCricketHighLimit', { rounds: config.roundLimit }));
                else parts.push(t(config.mode === '501' ? 'dartsLobbyUnlimited501' : 'dartsLobbyUnlimitedCricket'));
            }
            if (count > 1 && config.roundLimit) parts.push(t('dartsLobbyCorkTie'));
            return parts.join(' ');
        }
        function iconBadge(text, title, cls) {
            var badge = node('span', cls, text); badge.title = title; badge.setAttribute('role', 'img'); badge.setAttribute('aria-label', title); return badge;
        }
        function deviceBadge(owned) {
            var badge = iconBadge('', t(owned ? 'dartsThisDevice' : 'dartsOtherDevice'), 'slot-device' + (owned ? ' owned' : ''));
            var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'), path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
            svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
            path.setAttribute('d', owned ? 'M3 4h18v12H3zM12 16v4m-4 0h8' : 'M3 4h18v12H3zM12 16v4m-4 0h8M7 8h4m-2-2 2 2-2 2');
            svg.append(path); badge.append(svg); return badge;
        }
        function run(action, isStarting) {
            if (busy) return;
            busy = true; starting = !!isStarting; get('lobby-status').textContent = ''; render();
            Promise.resolve().then(action).catch(options.onError).finally(function () { busy = false; starting = false; render(); });
        }
        function close() { dialog.close(); get('settings-btn').focus({ preventScroll: true }); }
        function keepFieldVisible() {
            var field = doc.activeElement;
            if (!dialog.open || !field || !content.contains(field) || !field.matches('input, select, textarea')) return;
            var bounds = content.getBoundingClientRect(), rect = field.getBoundingClientRect();
            if (rect.top < bounds.top + 8) content.scrollTop -= bounds.top + 8 - rect.top;
            else if (rect.bottom > bounds.bottom - 8) content.scrollTop += rect.bottom - bounds.bottom + 8;
        }
        function fitViewport() {
            if (!dialog.open) return;
            dialog.style.setProperty('--lobby-viewport-height', (viewport ? viewport.height : window.innerHeight) + 'px');
            dialog.style.setProperty('--lobby-viewport-top', (viewport ? viewport.offsetTop : 0) + 'px');
            cancelAnimationFrame(viewportFrame); viewportFrame = requestAnimationFrame(keepFieldVisible);
        }
        function open(invite) {
            options.cancelGesture();
            if (!dialog.open) dialog.showModal();
            if (invite) get('invite-details').open = true;
            fitViewport(); render();
        }
        function render() {
            var model = options.model(), data = model.data, uid = model.uid, ids = data.seatOrder || [];
            var config = data.options, editable = data.phase === 'lobby', host = data.hostUid === uid;
            var locked = busy || !editable, localIds = ids.filter(function (id) { return data.participants[id].controllerId === uid; });
            var slotsKey = JSON.stringify([ids.map(function (id) { return data.participants[id]; }), data.ready, data.hostUid, locked, uid, options.locale()]);
            if (slotsKey !== lastSlots) {
                lastSlots = slotsKey;
                var focused = doc.activeElement, selectedId = focused && focused.dataset.slotId;
                var selection = selectedId ? [focused.selectionStart, focused.selectionEnd, focused.value] : null;
                get('lobby-slots').replaceChildren();
                ids.forEach(function (id, index) {
                    var p = data.participants[id], owned = p.controllerId === uid;
                    var row = node('div', 'darts-lobby-slot' + (owned ? ' owned' : '')); row.dataset.slotId = id;
                    var seat = node('div', 'slot-seat'); seat.append(node('span', 'player-seat', index + 1), deviceBadge(owned)); row.append(seat);
                    var input = node('input', 'slot-name'); input.value = p.name || t('dartsGuest'); input.maxLength = 32;
                    input.dataset.slotId = id; input.disabled = locked || !owned;
                    input.setAttribute('aria-label', t('dartsPlayerName') + ' ' + (index + 1));
                    var nameWrap = node('div', 'slot-name-wrap'); nameWrap.append(input);
                    if (p.controllerId === data.hostUid && ids.find(function (slot) { return data.participants[slot].controllerId === data.hostUid; }) === id)
                        nameWrap.append(iconBadge('★', t('dartsHost'), 'slot-badge'));
                    if (data.ready && data.ready[p.controllerId]) nameWrap.append(iconBadge('✓', t('dartsReadyTag'), 'slot-badge ready'));
                    row.append(nameWrap);
                    if (owned && localIds.length > 1) {
                        var remove = node('button', 'btn slot-remove', t('dartsRemovePlayer')); remove.type = 'button';
                        remove.disabled = locked; remove.dataset.removeSlot = id; row.append(remove);
                    }
                    get('lobby-slots').append(row);
                });
                if (selectedId && selection) {
                    var replacement = Array.from(get('lobby-slots').querySelectorAll('input')).find(function (input) { return input.dataset.slotId === selectedId; });
                    if (replacement && !replacement.disabled) { replacement.value = selection[2]; replacement.focus({ preventScroll: true }); replacement.setSelectionRange(selection[0], selection[1]); }
                }
            }
            get('lobby-capacity').textContent = ids.length + ' / 4';
            get('add-player-btn').disabled = locked || ids.length >= 4;
            Object.keys(fields).forEach(function (id) {
                var field = get(id); field.disabled = locked || !host;
                if (doc.activeElement !== field) field.value = String(config[fields[id]]);
            });
            get('match-setting').hidden = config.mode === 'practice';
            get('rounds-setting').hidden = config.mode === 'practice';
            get('out-setting').hidden = config.mode !== '501';
            get('advanced-rules').hidden = config.mode !== '501';
            get('cricket-setting').hidden = config.mode !== 'cricket';
            get('bull-setting').hidden = !['501', 'countup'].includes(config.mode);
            var rounds = config.mode === 'countup' ? [5, 8, 10, 15] : [10, 15, 0];
            var roundsKey = JSON.stringify([rounds, options.locale()]), roundField = get('rounds-select');
            if (roundField.dataset.optionsKey !== roundsKey) {
                roundField.dataset.optionsKey = roundsKey; roundField.replaceChildren();
                rounds.forEach(function (n) { var opt = node('option', '', n ? n : t('dartsUnlimited')); opt.value = n; roundField.append(opt); });
            }
            roundField.value = String(config.roundLimit);
            var eligibility = window.DartsRules.eligibility(config, ids.length);
            var reason = !editable ? t('dartsRulesLocked') : !eligibility.allowed ? options.modeName(config.mode) + ' ' + t('dartsNeedsPlayers').replace('{n}', eligibility.minPlayers) : '';
            var ready = !!(data.ready && data.ready[uid]), btn = get('lobby-start-btn');
            btn.hidden = !editable;
            btn.textContent = t(starting ? 'dartsLobbyStarting' : host ? config.mode === 'practice' ? 'dartsLobbyStartPractice' : 'dartsLobbyStartGame' : ready ? 'dartsLobbyWaitingHost' : 'dartsReadyUp');
            btn.disabled = busy || !eligibility.allowed || (host ? !model.canStart : ready);
            if (editable && eligibility.allowed) {
                if (starting) reason = t('dartsLobbyStarting');
                else if (!host) reason = t('dartsLobbyOnlyHost');
                else if (model.canStart) reason = t('dartsLobbyReadyToStart');
                else {
                    var waiting = new Set(ids.map(function (id) { return data.participants[id].controllerId; }).filter(function (id) { return id !== data.hostUid && !(data.ready || {})[id]; })).size;
                    reason = waiting ? format(waiting === 1 ? 'dartsLobbyWaitingDevice' : 'dartsLobbyWaitingDevices', { n: waiting }) : t('dartsWaitReady');
                }
            }
            setText('lobby-start-reason', reason);
            get('lobby-unready-btn').hidden = !editable || host || !ready;
            get('lobby-unready-btn').disabled = busy;
            get('back-lobby-btn').hidden = editable || !host || (data.game.status !== 'over' && data.game.mode !== 'practice');
            get('back-lobby-btn').disabled = busy;
            setText('lobby-rule-title', options.modeName(config.mode));
            setText('lobby-rule-summary', ruleSummary(config, ids.length));
            setText('lobby-rule-note', description(config, ids.length));
            get('invite-note').textContent = t(model.online ? editable ? 'dartsLobbyInviteShared' : 'dartsLobbyInvitePlaying' : 'dartsLobbyInviteLocal');
            get('room-code').hidden = !model.online; get('room-code').textContent = model.code || '';
            get('copy-room-btn').hidden = !model.online;
            get('leave-room-btn').hidden = !model.online;
            get('create-room-btn').hidden = model.online; get('create-room-btn').disabled = locked;
            get('join-row').hidden = model.online;
            get('join-room-btn').disabled = locked;
            get('room-code-input').disabled = locked;
        }
        get('lobby-close-btn').addEventListener('click', close);
        dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
        dialog.addEventListener('keydown', function (event) { event.stopPropagation(); });
        content.addEventListener('focusin', function () { requestAnimationFrame(keepFieldVisible); });
        window.addEventListener('resize', fitViewport);
        if (viewport) { viewport.addEventListener('resize', fitViewport); viewport.addEventListener('scroll', fitViewport); }
        get('add-player-btn').addEventListener('click', function () { run(options.addPlayer); });
        get('lobby-slots').addEventListener('change', function (event) {
            if (event.target.dataset.slotId) { var id = event.target.dataset.slotId, name = event.target.value; run(function () { return options.renamePlayer(id, name); }); }
        });
        get('lobby-slots').addEventListener('click', function (event) {
            var button = event.target.closest('[data-remove-slot]'); if (button) run(function () { return options.removePlayer(button.dataset.removeSlot); });
        });
        Object.keys(fields).forEach(function (id) {
            get(id).addEventListener('change', function () { var value = get(id).value, patch = {};
                patch[fields[id]] = ['legsToWin', 'turnMs', 'roundLimit'].includes(fields[id]) ? Number(value) : value;
                run(function () { return options.configure(patch); }); });
        });
        get('lobby-start-btn').addEventListener('click', function () { var model = options.model(); run(options.start, model.uid === model.data.hostUid); });
        get('lobby-unready-btn').addEventListener('click', function () { run(options.start); });
        get('back-lobby-btn').addEventListener('click', function () { run(options.backToLobby); });
        get('create-room-btn').addEventListener('click', function () { run(options.invite); });
        get('join-room-btn').addEventListener('click', function () { var code = get('room-code-input').value; run(function () { return options.join(code); }); });
        get('copy-room-btn').addEventListener('click', function () { run(async function () { await navigator.clipboard.writeText(options.model().code); get('lobby-status').textContent = t('dartsCopied'); }); });
        get('leave-room-btn').addEventListener('click', function () { run(options.leave); });
        var code = get('room-code-input');
        function normalize(value) { return String(value).trim().toUpperCase().replace(/^R-/, '').replace(/[^A-Z0-9]/g, '').slice(0, 4); }
        code.addEventListener('input', function () { var start = code.selectionStart, end = code.selectionEnd; code.value = normalize(code.value); code.setSelectionRange(start, end); });
        code.addEventListener('paste', function (event) {
            var pasted = event.clipboardData && event.clipboardData.getData('text/plain');
            if (!pasted) return; event.preventDefault(); code.value = normalize(pasted); code.setSelectionRange(code.value.length, code.value.length);
        });
        code.addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); get('join-room-btn').click(); } });
        return { element: dialog, refs: { status: get('lobby-status') }, open: open, close: close, render: render, isOpen: function () { return dialog.open; } };
    };
})();
