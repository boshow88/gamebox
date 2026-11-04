/* Scrollable match/practice history. Data comes from accepted rule transitions. */
(function () {
    'use strict';
    window.createDartsHistory = function (options) {
        var doc = options.document, t = options.t, dialog = doc.getElementById('history-dialog');
        var filter = doc.getElementById('history-player'), list = doc.getElementById('history-list');
        var lastKey = '', rosterKey = '', returnPlayer = null;
        function node(tag, cls, text) {
            var el = doc.createElement(tag); if (cls) el.className = cls;
            if (text != null) el.textContent = text; return el;
        }
        function distanceLabel(distance) { return Number.isFinite(distance) && distance < 1e9 ? distance.toFixed(1) + ' mm' : '—'; }
        function penaltiesLabel(penalties, names) {
            return Object.keys(penalties || {}).filter(function (id) { return penalties[id] > 0; })
                .map(function (id) { return (names[id] || id) + ' +' + penalties[id]; }).join(', ') || '—';
        }
        function refresh(resetScroll) {
            if (!dialog.open) return;
            var data = options.data(), selected = filter.value || 'all';
            var nextRoster = JSON.stringify([data.players, options.locale()]);
            if (nextRoster !== rosterKey) {
                rosterKey = nextRoster; filter.replaceChildren(node('option', '', t('dartsAllPlayers')));
                filter.firstChild.value = 'all';
                data.players.forEach(function (p) { var opt = node('option', '', p.name); opt.value = p.id; filter.append(opt); });
                filter.value = data.players.some(function (p) { return p.id === selected; }) ? selected : 'all';
            }
            var entries = data.entries.filter(function (entry) { return filter.value === 'all' || entry.uid === filter.value; }).slice().reverse();
            var key = JSON.stringify([entries, filter.value, options.locale(), data.dropped, data.online, data.mode, data.cricketVariant, data.turnMs]);
            if (key === lastKey && !resetScroll) return;
            lastKey = key;
            var atTop = resetScroll || list.scrollTop < 2, bounds = list.getBoundingClientRect();
            var anchor = Array.from(list.children).find(function (row) { return row.getBoundingClientRect().bottom > bounds.top; });
            var anchorKey = anchor && anchor.dataset.historyKey, offset = anchor && anchor.getBoundingClientRect().top;
            doc.getElementById('history-clock-note').hidden = !data.online || data.turnMs === 0;
            doc.getElementById('history-limit-note').textContent = data.dropped ? t('dartsHistoryLimit') : '';
            var names = Object.fromEntries(data.players.map(function (p) { return [p.id, p.name]; }));
            list.replaceChildren();
            if (!entries.length) list.append(node('p', 'history-empty', t('dartsHistoryEmpty')));
            entries.forEach(function (entry) {
                var cork = entry.phase === 'cork', cutthroat = data.mode === 'cricket' &&
                    (data.cricketVariant === 'cutthroat' || Object.keys(entry.penalties || {}).length > 0);
                var row = node('article', 'history-turn'); row.dataset.historyKey = entry.leg + ':' + entry.turn + ':' + entry.uid + ':' + (entry.phase || 'play');
                var heading = cork ? t('dartsLeg') + ' ' + entry.leg + ' · ' + t('dartsCorkRound') + ' ' + entry.corkRound :
                    entry.leg ? t('dartsLeg') + ' ' + entry.leg + ' · ' + t('dartsRound') + ' ' + entry.round : t('dartsThrow') + ' ' + entry.turn;
                row.append(node('h3', '', heading + ' · ' + (names[entry.uid] || entry.uid)));
                var darts = node('div', 'history-darts');
                for (var i = 0; i < (cork || !entry.leg ? 1 : 3); i++) darts.append(node('span', '', entry.darts[i] ? options.resultLabel(entry.darts[i]) : '—'));
                row.append(darts);
                var reasonKey = { bust: 'dartsBust', checkout: 'dartsCheckout', timeout: 'dartsTimeout', left: 'dartsWithdrawn', 'leg-won': 'dartsLegWon',
                    'round-limit': 'dartsRoundLimitReached', 'cork-won': 'dartsLegWon' }[entry.reason];
                var summary = cork ? t('dartsCork') + ' · ' + t('dartsDistance') + ' ' + distanceLabel(entry.distance) :
                    cutthroat ? t('dartsPenalties') + ' · ' + penaltiesLabel(entry.penalties, names) :
                        t('dartsTurnScore') + ' ' + entry.points + (data.mode === 'practice' ? '' : ' · ' +
                            t(data.mode === '501' ? 'dartsRemaining' : 'dartsTotal') + ' ' + entry.score);
                row.append(node('p', 'history-turn-summary', summary));
                if (reasonKey || !entry.finished) row.append(node('strong', entry.reason === 'bust' ? 'bust' : '', t(reasonKey || 'dartsInProgress')));
                list.append(row);
            });
            if (atTop) list.scrollTop = 0;
            else if (anchorKey) {
                var same = Array.from(list.children).find(function (row) { return row.dataset.historyKey === anchorKey; });
                if (same) list.scrollTop += same.getBoundingClientRect().top - offset;
            }
        }
        function open(uid) {
            options.cancelGesture(); returnPlayer = uid || null;
            if (!dialog.open) dialog.showModal();
            refresh(true); filter.value = uid && Array.from(filter.options).some(function (p) { return p.value === uid; }) ? uid : 'all';
            refresh(true);
        }
        function restoreFocus() {
            if (dialog.open || doc.querySelector('.darts-dialog[open]')) return;
            var card = Array.from(doc.querySelectorAll('.darts-player')).find(function (p) { return p.dataset.playerUid === returnPlayer; });
            (card || doc.getElementById('history-btn')).focus({ preventScroll: true });
        }
        function close() { dialog.close(); restoreFocus(); }
        doc.getElementById('history-close-btn').addEventListener('click', close);
        filter.addEventListener('change', function () { refresh(true); });
        dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
        dialog.addEventListener('close', restoreFocus);
        return { open: open, close: close, refresh: refresh, isOpen: function () { return dialog.open; } };
    };
})();
