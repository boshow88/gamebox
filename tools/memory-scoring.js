/* Standalone calibration UI. Uses the same grader as local and multiplayer play. */
(function () {
    'use strict';
    var Color = window.MemoryColor, fixtures = window.MemoryScoringFixtures;
    var form = document.getElementById('curve-form'), status = document.getElementById('curve-status');
    var fields = ['knee', 'width', 'strength'], cards = new Map(), ns = 'http://www.w3.org/2000/svg';
    function hex(rgb) { return '#' + rgb.map(function (n) { return n.toString(16).padStart(2, '0'); }).join('').toUpperCase(); }
    function make(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
    function svg(tag, attributes, text) {
        var e = document.createElementNS(ns, tag);
        Object.keys(attributes).forEach(function (key) { e.setAttribute(key, attributes[key]); });
        if (text !== undefined) e.textContent = text; return e;
    }
    var grid = document.getElementById('chart-grid');
    for (var score = 0; score <= 100; score += 25) {
        var y = 250 - score * 2.32;
        grid.append(svg('line', { x1: 46, x2: 700, y1: y, y2: y, class: 'grid' }), svg('text', { x: 34, y: y + 4, 'text-anchor': 'end', class: 'axis' }, score));
    }
    for (var step = 0; step <= 6; step++) {
        var x = 46 + step / 6 * 654;
        grid.append(svg('text', { x: x, y: 272, 'text-anchor': 'middle', class: 'axis' }, (step * 0.05).toFixed(2)));
    }
    grid.append(svg('text', { x: 700, y: 290, 'text-anchor': 'end', class: 'axis' }, 'Oklab error'));
    fixtures.pairs.forEach(function (pair) {
        var card = make('article', 'pair'), swatches = make('div', 'swatches'), scores = make('dl');
        card.dataset.fixture = pair.id; card.append(make('h2', '', pair.label));
        [pair.target, pair.answer].forEach(function (rgb, index) {
            var figure = make('figure'), swatch = make('div', 'swatch'), caption = make('figcaption', '', index ? '答案' : '原色');
            swatch.style.backgroundColor = 'rgb(' + rgb.join(',') + ')';
            caption.append(make('code', '', hex(rgb)), make('code', '', 'RGB ' + rgb.join(', ')));
            figure.append(swatch, caption); swatches.append(figure);
        });
        var old = make('dd', 'old-score'), proposed = make('dd', 'proposed-score');
        var oldGroup = make('div'), newGroup = make('div');
        oldGroup.append(make('dt', '', '舊版分數'), old); newGroup.append(make('dt', '', '試算分數'), proposed);
        scores.append(oldGroup, newGroup);
        var error = make('p', 'error'); card.append(swatches, scores, error); document.getElementById('color-pairs').append(card);
        cards.set(pair.id, { old: old, proposed: proposed, error: error });
    });
    function path(parameters) {
        var commands = [];
        for (var i = 0; i <= 600; i++) {
            var error = i / 600 * 0.3, score = Color.mapColorErrorToScore(error, parameters);
            commands.push((i ? 'L' : 'M') + (46 + i / 600 * 654).toFixed(2) + ',' + (250 - score * 2.32).toFixed(2));
        }
        return commands.join(' ');
    }
    document.getElementById('old-curve').setAttribute('d', path({ version: 1 }));
    function render() {
        if (!form.checkValidity()) {
            status.dataset.invalid = 'true'; status.textContent = '請輸入有效參數：knee ≥ 0、width > 0、strength ≥ 0；保留上一次有效的曲線。'; return;
        }
        var input = { version: 2 };
        fields.forEach(function (key) { input[key] = Number(document.getElementById(key).value); });
        var settings = Color.scoringParameters(input);
        fixtures.compare(settings).forEach(function (row) {
            var card = cards.get(row.pair.id);
            card.old.textContent = row.old.score.toFixed(3); card.proposed.textContent = row.proposed.score.toFixed(3);
            card.error.textContent = 'Oklab error ' + row.old.error.toFixed(6);
        });
        document.getElementById('trial-curve').setAttribute('d', path(settings));
        var knee = document.getElementById('knee-line'), x = 46 + settings.knee / 0.3 * 654;
        knee.setAttribute('visibility', settings.knee > 0.3 ? 'hidden' : 'visible');
        knee.setAttribute('x1', x); knee.setAttribute('x2', x);
        status.dataset.invalid = 'false';
        var v2 = Color.scoringParameters({ version: 2 });
        var preset = fields.every(function (key) { return settings[key] === v2[key]; });
        status.textContent = (preset ? '目前為歷史 V2 設定' : '僅在此頁試算 V2') + ' · knee ' + settings.knee + ' · width ' + settings.width + ' · strength ' + settings.strength;
    }
    function preset(parameters) {
        fields.forEach(function (key) { document.getElementById(key).value = parameters[key]; }); render();
    }
    form.addEventListener('submit', function (event) { event.preventDefault(); render(); });
    form.addEventListener('input', render);
    document.getElementById('game-defaults').addEventListener('click', function () { preset(Color.scoringParameters({ version: 2 })); });
    document.getElementById('initial-proposal').addEventListener('click', function () { preset({ knee: 0.06, width: 0.04, strength: 1.2 }); });
    preset(Color.scoringParameters({ version: 2 }));
})();
