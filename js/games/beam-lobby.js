/**
 * Beam — unified Room dialog (all setup lives here, never on the main screen).
 *
 * Two tabs, chosen with a Solo / Online toggle:
 *   • Solo   — one difficulty (16 notches) sets all 3 CPU rivals; a best finishing
 *              place is recorded per difficulty. "Pick this round's difficulty."
 *   • Online — a roster of real players plus CPUs. Anyone can add CPUs they own,
 *              each with its own 16-notch strength; only the owner can change,
 *              rename or remove its CPUs. You can rename yourself; the host can
 *              remove any other player. Create / join / spectate, ready-up, start.
 *
 * Puzzle difficulty itself is always adaptive (it drifts with everyone's results).
 *
 * Driven by a model from beam.js via `options.model()`; this module only renders
 * it and forwards user actions.
 */
(function () {
    'use strict';
    window.createBeamLobby = function (options) {
        var doc = options.document, t = options.t, notchMax = options.notchMax || 15;
        var dialog = doc.getElementById('beam-lobby');
        var busy = false, lastSlots = '';
        function get(id) { return doc.getElementById(id); }
        function node(tag, cls, text) { var el = doc.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; }
        function setText(id, text) { var el = get(id); if (el && el.textContent !== text) el.textContent = text; }
        function esc(v) { return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/"/g, '\\"'); }

        function run(action) {
            if (busy) return;
            busy = true; get('lobby-status').textContent = ''; render();
            Promise.resolve().then(action).catch(options.onError).finally(function () { busy = false; render(); });
        }
        function close() { if (dialog.open) dialog.close(); }
        function open() { if (!dialog.open) dialog.showModal(); render(); }

        // A 16-notch CPU strength picker (Online: owner-only).
        function strengthSelect(slot, enabled) {
            var sel = node('select', 'slot-strength'); sel.dataset.cpuSlot = slot.id;
            sel.disabled = !enabled;
            sel.setAttribute('aria-label', t('beamCpuDifficulty'));
            for (var n = 0; n <= notchMax; n++) { var opt = node('option', '', options.notchLabel(n)); opt.value = n; sel.append(opt); }
            sel.value = String(slot.notch != null ? slot.notch : 5);
            return sel;
        }

        function buildSlot(slot, index, locked) {
            var cpu = slot.type === 'cpu';
            var row = node('div', 'beam-slot' + (slot.you ? ' me' : '')); row.dataset.slotId = slot.id;
            var seat = node('span', 'slot-seat', String(index + 1)); seat.style.background = slot.color || 'var(--game-color)'; row.append(seat);
            var main = node('div', 'slot-main');
            if (slot.canRename && !locked) {
                var input = node('input', 'slot-name-input'); input.type = 'text'; input.maxLength = 24; input.value = slot.name;
                input.dataset.slotId = slot.id; input.setAttribute('aria-label', t('beamRenameLabel'));
                main.append(input);
                if (slot.you) main.append(node('span', 'slot-tag', t('beamYou')));
            } else {
                main.append(node('span', 'nm', slot.name + (slot.you ? ' (' + t('beamYou') + ')' : '')));
            }
            if (cpu) main.append(node('span', 'slot-tag cpu', t('beamCpuTag')));
            if (slot.host) main.append(node('span', 'slot-tag host', t('beamHost')));
            if (slot.offline) main.append(node('span', 'slot-tag off', t('beamOffline')));
            else if (slot.ready) main.append(node('span', 'slot-tag ready', t('beamReadyTag')));
            if (slot.rank) main.append(node('span', 'slot-tag', slot.rank));
            row.append(main);
            var actions = node('div', 'slot-actions');
            if (slot.canKick) { var k = node('button', 'btn slot-kick', t('beamKick')); k.type = 'button'; k.dataset.kickSlot = slot.id; k.disabled = locked; actions.append(k); }
            if (slot.canRemove) { var rm = node('button', 'btn slot-remove', t('beamRemove')); rm.type = 'button'; rm.dataset.removeSlot = slot.id; rm.disabled = locked; actions.append(rm); }
            if (actions.childNodes.length) row.append(actions);
            if (cpu) {   // strength is always visible: owners get the picker, everyone else a read-only badge
                var sr = node('div', 'slot-strength-row'); sr.append(node('span', '', t('beamStrengthLabel')));
                if (slot.ownedByMe) sr.append(strengthSelect(slot, !locked));
                else sr.append(node('span', 'slot-strength-val', options.notchLabel(slot.notch)));
                row.append(sr);
            }
            return row;
        }

        function renderSolo(model) {
            var sl = get('diff-slider');
            if (doc.activeElement !== sl) sl.value = String(model.notch);
            setText('diff-readout', model.notchLabel || '');
            setText('solo-best', model.best ? (t('best') + '：' + model.best) : '');
        }

        function renderOnline(model) {
            var roster = model.roster || [], editable = model.phase === 'lobby', locked = busy || !editable;
            var key = JSON.stringify([roster, editable, locked, model.online, model.uid, options.locale()]);
            if (key !== lastSlots) {
                lastSlots = key;
                var host = get('lobby-slots');
                var active = doc.activeElement, aId = active && active.dataset && active.dataset.slotId;
                var wasInput = !!(aId && active.tagName === 'INPUT'), aStart, aEnd, aVal;
                if (wasInput) { aStart = active.selectionStart; aEnd = active.selectionEnd; aVal = active.value; }
                host.replaceChildren();
                roster.forEach(function (slot, index) { host.append(buildSlot(slot, index, locked)); });
                if (wasInput) {   // keep the name you're typing (the roster redraws on every heartbeat)
                    var repl = host.querySelector('input.slot-name-input[data-slot-id="' + esc(aId) + '"]');
                    if (repl && !repl.disabled) { repl.value = aVal; repl.focus({ preventScroll: true }); try { repl.setSelectionRange(aStart, aEnd); } catch (e) { } }
                }
            } else {
                roster.forEach(function (slot) {
                    if (slot.type !== 'cpu') return;
                    var sel = get('lobby-slots').querySelector('select[data-cpu-slot="' + esc(slot.id) + '"]');
                    if (sel && doc.activeElement !== sel && sel.value !== String(slot.notch)) sel.value = String(slot.notch);
                });
            }
            setText('lobby-capacity', roster.length + ' / 4');
            get('add-cpu-btn').disabled = locked || !model.canAddCpu;

            var auth = get('lobby-auth'); auth.replaceChildren();
            if (model.signedIn) {
                auth.append(node('span', '', t('beamSignedIn', model.account || t('beamGuest'))));
                var out = node('button', 'btn', t('beamSignOut')); out.type = 'button';
                out.addEventListener('click', function () { run(options.signOut); }, { once: true });
                auth.append(out);
            } else {
                auth.append(node('span', '', t('beamSignInHint')));
            }

            get('lobby-offline').hidden = model.online;
            get('lobby-online').hidden = !model.online;
            if (model.online) setText('room-code', model.code || '');
            get('create-room-btn').disabled = locked;
            get('join-room-btn').disabled = locked;
            var sb = get('spectate-room-btn'); if (sb) sb.disabled = locked;
            get('room-code-input').disabled = locked;
            setText('lobby-online-note', model.online ? (editable ? t('beamOnlineInviteNote') : t('beamOnlinePlayingNote')) : t('beamOfflineInviteNote'));
            setText('lobby-roster-note', roster.length < 2 ? t('beamNeedOpponent') : '');
        }

        function render() {
            var model = options.model(), mode = model.mode;
            get('mode-solo-btn').classList.toggle('active', mode === 'solo');
            get('mode-online-btn').classList.toggle('active', mode === 'online');
            get('mode-solo-btn').setAttribute('aria-checked', mode === 'solo');
            get('mode-online-btn').setAttribute('aria-checked', mode === 'online');
            get('solo-pane').hidden = mode !== 'solo';
            get('online-pane').hidden = mode !== 'online';

            if (mode === 'solo') renderSolo(model); else renderOnline(model);

            var btn = get('lobby-start-btn'), unready = get('lobby-unready-btn'), a = model.action || {};
            btn.hidden = false; unready.hidden = true; btn.disabled = busy;
            if (a.kind === 'start-solo') { btn.textContent = t('beamStartSolo'); }
            else if (a.kind === 'start') { btn.textContent = t('beamStartMatch'); btn.disabled = busy || !!a.disabled; }
            else if (a.kind === 'wait-ready') { btn.textContent = t('beamReadyWait'); btn.disabled = true; unready.hidden = false; unready.disabled = busy; }
            else if (a.kind === 'ready') { btn.textContent = t('beamReadyUp'); }
            else if (a.kind === 'rematch') { btn.textContent = t('beamRematch'); }
            else if (a.kind === 'wait-rematch') { btn.textContent = t('beamRematchWait'); btn.disabled = true; }
            else { btn.hidden = true; }

            setText('lobby-status', model.status || '');
        }

        // --- static wiring ---
        get('mode-solo-btn').addEventListener('click', function () { options.setMode('solo'); });
        get('mode-online-btn').addEventListener('click', function () { options.setMode('online'); });
        get('diff-slider').addEventListener('input', function () { options.setNotch(parseInt(get('diff-slider').value, 10)); });
        get('lobby-close-btn').addEventListener('click', function () { close(); options.onClose && options.onClose(); });
        dialog.addEventListener('cancel', function (e) { e.preventDefault(); close(); options.onClose && options.onClose(); });
        dialog.addEventListener('keydown', function (e) { e.stopPropagation(); });
        get('add-cpu-btn').addEventListener('click', function () { run(options.addCpu); });
        get('lobby-slots').addEventListener('change', function (e) {
            if (e.target.dataset.cpuSlot) { var id = e.target.dataset.cpuSlot, notch = parseInt(e.target.value, 10); run(function () { return options.setCpuStrength(id, notch); }); return; }
            if (e.target.classList && e.target.classList.contains('slot-name-input')) { var sid = e.target.dataset.slotId, nm = e.target.value; run(function () { return options.rename(sid, nm); }); }
        });
        get('lobby-slots').addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('slot-name-input')) { e.preventDefault(); e.target.blur(); }
        });
        get('lobby-slots').addEventListener('click', function (e) {
            var rm = e.target.closest('[data-remove-slot]'); if (rm) { run(function () { return options.removeCpu(rm.dataset.removeSlot); }); return; }
            var k = e.target.closest('[data-kick-slot]'); if (k) { run(function () { return options.kick(k.dataset.kickSlot); }); }
        });
        get('create-room-btn').addEventListener('click', function () { run(options.createRoom); });
        get('join-room-btn').addEventListener('click', function () { var code = get('room-code-input').value; run(function () { return options.join(code); }); });
        var spectateBtn = get('spectate-room-btn');
        if (spectateBtn) spectateBtn.addEventListener('click', function () { var code = get('room-code-input').value; run(function () { return options.spectate(code); }); });
        get('copy-room-btn').addEventListener('click', function () { try { options.copy(); } catch (e) { options.onError(e); } });
        get('leave-room-btn').addEventListener('click', function () { run(options.leave); });
        get('lobby-start-btn').addEventListener('click', function () { run(options.primary); });
        get('lobby-unready-btn').addEventListener('click', function () { run(options.unready); });
        var code = get('room-code-input');
        function normalize(v) { return String(v).trim().toUpperCase().replace(/^R-/, '').replace(/[^A-Z0-9]/g, '').slice(0, 4); }
        code.addEventListener('input', function () { var s = code.selectionStart, e = code.selectionEnd; code.value = normalize(code.value); code.setSelectionRange(s, e); });
        code.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); get('join-room-btn').click(); } });

        return { element: dialog, refs: { status: get('lobby-status') }, open: open, close: close, render: render, isOpen: function () { return dialog.open; } };
    };
})();
