/* Unified room view. Membership, ownership and accepted matches stay in the room policy. */
(function () {
    'use strict';
    window.createDartsLobby = function (options) {
        var doc = options.document, t = options.t, dialog = doc.getElementById('lobby');
        var lastSlots = '', busy = false;
        var fields = { 'mode-select': 'mode', 'match-select': 'legsToWin', 'timer-select': 'turnMs',
            'rounds-select': 'roundLimit', 'out-select': 'outRule', 'in-select': 'inRule',
            'bull-select': 'bullMode', 'cricket-select': 'cricketVariant' };
        function get(id) { return doc.getElementById(id); }
        function node(tag, cls, text) {
            var el = doc.createElement(tag); if (cls) el.className = cls;
            if (text != null) el.textContent = text; return el;
        }
        function run(action) {
            if (busy) return;
            busy = true; get('lobby-status').textContent = ''; render();
            Promise.resolve().then(action).catch(options.onError).finally(function () { busy = false; render(); });
        }
        function close() { dialog.close(); get('settings-btn').focus({ preventScroll: true }); }
        function open(invite) {
            options.cancelGesture();
            if (!dialog.open) dialog.showModal();
            if (invite) get('invite-details').open = true;
            render();
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
                    var row = node('div', 'darts-lobby-slot'); row.dataset.slotId = id;
                    row.append(node('span', 'player-seat', index + 1));
                    var input = node('input', 'slot-name'); input.value = p.name || t('dartsGuest'); input.maxLength = 32;
                    input.dataset.slotId = id; input.disabled = locked || !owned;
                    input.setAttribute('aria-label', t('dartsPlayerName') + ' ' + (index + 1));
                    row.append(input);
                    var meta = [t(owned ? 'dartsThisDevice' : 'dartsOtherDevice')];
                    if (p.controllerId === data.hostUid) meta.push(t('dartsHost'));
                    if (data.ready && data.ready[p.controllerId]) meta.push(t('dartsReadyTag'));
                    row.append(node('span', 'slot-meta', meta.join(' · ')));
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
            var btn = get('lobby-start-btn');
            btn.hidden = !editable; btn.textContent = t(host ? 'dartsStartMatch' : data.ready && data.ready[uid] ? 'dartsUnready' : 'dartsReadyUp');
            btn.disabled = busy || !eligibility.allowed || (host && !model.canStart);
            if (editable && host && eligibility.allowed && !model.canStart && !busy) reason = t('dartsWaitReady');
            get('lobby-start-reason').textContent = reason;
            get('back-lobby-btn').hidden = editable || !host || (data.game.status !== 'over' && data.game.mode !== 'practice');
            get('back-lobby-btn').disabled = busy;
            get('lobby-rule-note').textContent = config.mode === 'cricket' ?
                t(config.cricketVariant === 'auto' ? ids.length >= 3 ? 'dartsAutoCutThroatNote' : 'dartsAutoStandardNote' : config.cricketVariant === 'cutthroat' ? 'dartsCutThroatNote' : 'dartsStandardNote') :
                config.mode === 'practice' ? t('dartsPracticeRoomNote') : t('dartsSettlementNote');
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
        get('lobby-start-btn').addEventListener('click', function () { run(options.start); });
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
