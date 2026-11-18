/* Development controls, mounted only by games/impressions.html?playtest=1. No network/storage. */
(function () {
    'use strict';
    function mount(view) {
        if (new URLSearchParams(location.search).get('playtest') !== '1') return null;
        var API = window.ImpressionsPlaytest, recorder = API.create(), panel = document.createElement('details');
        panel.id = 'impressions-playtest'; panel.className = 'impressions-instructions'; panel.lang = 'en'; panel.open = true;
        var summary = document.createElement('summary'); summary.textContent = 'Development · Playtest recording'; panel.append(summary);
        function node(tag, value, parent) { var e = document.createElement(tag); if (value) e.textContent = value; (parent || panel).append(e); return e; }
        node('p', 'Opt-in, this page only. Completed rounds are kept in memory; export before reloading. Nothing is uploaded. Normal gameplay and Firebase rules are unchanged.');
        var sourceLabel = node('label', 'Data source '), source = node('select', '', sourceLabel); source.id = 'impressions-playtest-source';
        API.sources.forEach(function (id) { var option = node('option', id, source); option.value = id; });
        var label = node('label', ''), toggle = node('input', '', label); toggle.type = 'checkbox'; toggle.id = 'impressions-playtest-record'; label.append(document.createTextNode(' Record completed rounds'));
        var status = node('p', ''), message = node('p', ''); status.id = 'impressions-playtest-status'; status.setAttribute('role', 'status'); message.setAttribute('role', 'status');
        node('p', 'Local: choose a 12-question preset, then use the existing Start / Next buttons. Enable sound for Pitch. The recorder pauses after 12 completed local rounds. Practice has no HP or damage.');
        var presets = node('div', ''); presets.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
        function button(text, id, parent, action) { var b = node('button', text, parent); b.type = 'button'; b.className = 'btn'; b.id = id; b.addEventListener('click', action); return b; }
        ['color', 'quantity', 'pitch', 'mixed'].forEach(function (kind) { button(kind + ' · 12', 'impressions-playtest-' + kind, presets, function () {
            var weights = window.ImpressionsProgression.preset(kind);
            if (!view.setPracticeConfig({ categoryMode: kind === 'mixed' ? 'weighted' : kind, selectionVersion: 3, categoryWeights: weights })) {
                message.textContent = 'Finish the current round first. For online play, use the existing room settings below.'; return;
            }
            recorder.planLocal(); setEnabled(true); message.textContent = 'Preset ready. Start the round using the normal game controls.';
        }); });
        node('p', 'Online: record on one observer page per match. Set the room round limit to 12 and enable only the desired category, or all three for Mixed. All normal variants remain enabled; HP elimination may end a match before round 12. Other players do not need recording enabled.');
        var exports = node('div', ''); exports.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
        function download(extension) {
            var data = recorder.data(), text = extension === 'json' ? JSON.stringify(data, null, 2) : API.csv(data);
            var url = URL.createObjectURL(new Blob([text], { type: extension === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8' }));
            var anchor = document.createElement('a'); anchor.href = url; anchor.download = data.recordingId + '.' + extension; anchor.click();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        }
        var json = button('Export JSON', 'impressions-playtest-json', exports, function () { download('json'); });
        var csv = button('Export CSV', 'impressions-playtest-csv', exports, function () { download('csv'); });
        button('Clear local records', 'impressions-playtest-clear', exports, function () { recorder.clear(); message.textContent = 'Local records cleared.'; update(); });
        var link = node('a', 'Open balance report'); link.href = '../tools/impressions-playtest.html'; link.target = '_blank'; link.rel = 'noopener';
        node('p', 'Exports contain targets only from completed rounds. Participant IDs are match-local p1–p8, never names or Auth IDs. Current matches include receipt submission modes; legacy remote modes may be unknown. A missing answer is separate from a confirmed timeout. Synthetic/automated data is excluded from the report by default.');
        function update() {
            var state = recorder.status(), last = state.latest;
            toggle.checked = state.enabled; source.disabled = state.enabled || state.rounds > 0;
            json.disabled = csv.disabled = !state.rounds;
            status.textContent = (state.enabled ? 'Recording' : 'Paused') + ' · ' + state.rounds + ' completed questions · ' + state.sessions + ' sessions'
                + (last ? ' · latest ' + last.kind + ': ' + last.completedRounds + '/' + last.plannedRounds + (last.status === 'complete' ? ' complete' : ' partial') : '') + (state.warning ? ' · ' + state.warning : '');
        }
        function observe(type, event) {
            if (type === 'attempt') recorder.attempt(event);
            if (type === 'round' && recorder.record(event)) {
                var last = recorder.status().latest;
                if (event.mode === 'local' && last.status === 'complete') setEnabled(false);
            }
            if (!recorder.enabled()) view.setPlaytestObserver(null);
            update();
        }
        function setEnabled(value) { recorder.enable(value); view.setPlaytestObserver(value ? observe : null); update(); }
        toggle.addEventListener('change', function () { setEnabled(toggle.checked); });
        source.addEventListener('change', function () { recorder = API.create({ source: source.value }); update(); });
        document.getElementById('impressions-game').append(panel); update();
        var current = { data: function () { return recorder.data(); }, status: function () { return recorder.status(); } };
        window.ImpressionsPlaytestUI.current = current; return current;
    }
    window.ImpressionsPlaytestUI = { mount: mount };
})();
