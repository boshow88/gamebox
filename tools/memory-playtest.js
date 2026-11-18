(function () {
    'use strict';
    var Analysis = window.MemoryPlaytestAnalysis, inputs = [], report = null, colors = { color: '#c59dff', quantity: '#71c8c3', pitch: '#ffc086' };
    function get(id) { return document.getElementById(id); }
    function el(tag, text) { var node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; }
    function fmt(n) { return Number.isFinite(n) ? n.toFixed(2) : '—'; }
    function seconds(n) { return Number.isFinite(n) ? (n / 1000).toFixed(2) : '—'; }
    function table(id, columns, rows) { var t = el('table'), head = el('tr'); columns.forEach(function (c) { head.append(el('th', c)); }); var thead = el('thead'); thead.append(head); t.append(thead); var body = el('tbody'); rows.forEach(function (row) { var tr = el('tr'); row.forEach(function (value) { tr.append(el('td', value)); }); body.append(tr); }); t.append(body); get(id).replaceChildren(t); }
    function groupTable(id, groups) { table(id, ['Group', 'N', 'Mean', 'P10', 'Median', 'P90', 'SD', 'Time N', 'Time median s', 'Time P90 s', 'Receipt times N', 'Timeouts / known', 'Timeout %', 'Missing / N', 'Error N', 'Error unit', 'Error median', 'Error P90', 'Damage N', 'Damage mean', 'Damage P90', 'Scoring versions'], groups.map(function (g) {
        return [g.label, g.n, fmt(g.scores.mean), fmt(g.scores.p10), fmt(g.scores.median), fmt(g.scores.p90), fmt(g.scores.sd), g.answerTime.n, seconds(g.answerTime.median), seconds(g.answerTime.p90), g.receiptTimeN,
            g.timeoutN + '/' + g.knownTimeoutN, fmt(g.timeoutRate === null ? null : g.timeoutRate * 100), g.missingN + '/' + g.n, g.error.n, g.unit, fmt(g.error.median), fmt(g.error.p90), g.damage.n, fmt(g.damage.mean), fmt(g.damage.p90), g.scoringVersions]; })); }
    function svgNode(parent, tag, attrs, title) { var n = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); if (title) { var tip = document.createElementNS(n.namespaceURI, 'title'); tip.textContent = title; n.append(tip); } parent.append(n); return n; }
    function text(svg, x, y, value, color) { var n = svgNode(svg, 'text', { x: x, y: y, fill: color || '#eee' }); n.textContent = value; }
    function axes(svg, xLabel, maximum) { svg.replaceChildren(); svgNode(svg, 'path', { d: 'M45 15V215H880', stroke: '#9b87aa', fill: 'none' }); text(svg, 8, 24, maximum); text(svg, 18, 216, '0'); text(svg, 350, 244, xLabel); Object.keys(colors).forEach(function (c, i) { text(svg, 520 + i * 110, 18, c); svg.lastChild.style.fill = colors[c]; }); }
    function progression() {
        if (!report) return;
        var values = report.progression.filter(function (p) { return p.session === get('session').value; }).sort(function (a, b) { return a.round - b.round; }), svg = get('progression');
        axes(svg, 'Round · base paths / effective points', 10); var maxRound = Math.max(12, ...values.map(function (p) { return p.round; }));
        Object.keys(colors).forEach(function (category) { var points = values.filter(function (p) { return p.category === category && Number.isFinite(p.base); });
            svgNode(svg, 'polyline', { points: points.map(function (p) { return (45 + p.round / maxRound * 810) + ',' + (215 - p.base / 10 * 190); }).join(' '), fill: 'none', stroke: colors[category], 'stroke-width': 2 });
            points.forEach(function (p) { svgNode(svg, 'circle', { cx: 45 + p.round / maxRound * 810, cy: 215 - p.effective / 10 * 190, r: 4, fill: colors[category] }, category + ' round ' + p.round + ': base ' + fmt(p.base) + ', effective ' + fmt(p.effective) + ', after ' + fmt(p.after)); });
        });
        table('progression-table', ['Round','Category','Policy / band','Sampled / legacy level','Quantity stage → after','Legacy after'], values.map(function (p) { return [p.round,p.category,p.policy+' / '+(p.band||'—'),fmt(p.effective),p.stage==null?'—':p.stage+' → '+p.stageAfter,fmt(p.after)]; }));
    }
    function render() {
        try {
            report = Analysis.summarize(inputs, { source: get('source').value, selfOnly: get('self-only').checked });
            get('status').textContent = report.rounds + ' completed questions · ' + report.observations + ' participant observations · ' + report.sessions.length + ' sessions · ' + report.excludedRounds + ' questions excluded by source filter. ' + (report.rounds ? '' : 'No data for this source.');
            groupTable('groups', report.groups); groupTable('difficulty', report.difficulty);
            get('histograms').replaceChildren(); report.groups.forEach(function (g) { var row = el('div'); row.className = 'histogram'; row.append(el('span', g.label)); g.histogram.forEach(function (n, i) { var bin = el('div'); bin.className = 'bin'; bin.title = (i * 20) + '–' + (i * 20 + 20) + ': ' + n + '/' + g.n; var bar = el('div'); bar.className = 'bar'; bar.style.width = n / g.n * 100 + '%'; bin.append(bar, el('span', n)); row.append(bin); }); get('histograms').append(row); });
            table('spreads', ['Group', 'Rounds', 'Multiplayer rounds', 'Spread median', 'Spread P90', 'Absolute pair difference median', 'Absolute pair difference P90'], report.spreads.map(function (s) { return [s.label, s.rounds, s.spread.n, fmt(s.spread.median), fmt(s.spread.p90), fmt(s.absolutePairDifferences.median), fmt(s.absolutePairDifferences.p90)]; }));
            table('pitch-calibration', ['Source / variant', 'N', 'Valid errors N', 'RMS median', 'Mean at 180', 'Mean at 210', 'Mean at 240', 'Elapsed / window median', 'Timeouts / known', 'Missing', 'Initial RMS median', 'Unreachable targets'], report.pitchCalibration.map(function (g) { return [g.label, g.observations, g.error.n, fmt(g.error.median), fmt(g.scoreComparisons[0].mean), fmt(g.scoreComparisons[1].mean), fmt(g.scoreComparisons[2].mean), fmt(g.elapsedFraction.median), g.timeouts + '/' + g.timeoutKnown, g.missing, fmt(g.initialRms.median), g.unreachableTargets]; }));
            table('sessions', ['Recording / session', 'Source', 'Mode', 'Kind', 'Observed / planned', 'First round', 'Status', 'Early end'], report.sessions.map(function (s) { return [s.recordingId + '/' + s.id, s.source, s.mode, s.kind, s.completedRounds + '/' + s.plannedRounds, s.firstObservedRound, s.status, s.endedEarly ? 'yes' : 'no']; }));
            var selected = get('session').value; get('session').replaceChildren(); report.sessions.forEach(function (s) { var o = el('option', s.recordingId + ' / ' + s.id + ' · ' + s.kind); o.value = s.recordingId + ':' + s.id; get('session').append(o); }); if (Array.from(get('session').options).some(function (o) { return o.value === selected; })) get('session').value = selected;
            var svg = get('scatter'); axes(svg, 'Sampled random / legacy level 1–10', 100);
            [1, 5, 10].forEach(function (level) { text(svg, 42 + level / 10 * 810, 230, level); });
            report.difficulty.forEach(function (g) { var parts = g.label.split(' / L'), level = Number(parts[1]); svgNode(svg, 'circle', { cx: 45 + level / 10 * 810, cy: 215 - g.scores.mean / 100 * 190, r: 5, fill: colors[parts[0].replace(' random','')] }, g.label + ': mean ' + fmt(g.scores.mean) + ' (N=' + g.n + ')'); }); progression();
        } catch (error) { report = null; get('status').textContent = error.message; ['histograms', 'groups', 'difficulty', 'spreads', 'sessions', 'session', 'progression-table', 'scatter', 'progression', 'pitch-calibration'].forEach(function (id) { get(id).replaceChildren(); }); }
    }
    get('files').addEventListener('change', async function () {
        try { inputs = []; for (var file of get('files').files) { if (file.size > 30 * 1024 * 1024) throw new RangeError('Each export must be below 30MB.'); inputs.push(Analysis.validate(JSON.parse(await file.text()))); } render(); }
        catch (error) { inputs = []; render(); get('status').textContent = error.message; }
    });
    get('source').addEventListener('change', render); get('self-only').addEventListener('change', render); get('session').addEventListener('change', progression);
})();
