/* Local Canvas diagnostic. No gameplay state, Firebase, storage or score formulas. */
(function () {
    'use strict';
    var Color = window.MemoryColor, Slice = window.MemoryColorSlice;
    var SIZE = 600, CENTER = 300, RADIUS = 216, GRID = 4;
    var main = document.getElementById('color-map'), scoringForm = document.getElementById('scoring-form');
    if (typeof Color.supportsScoringVersion !== 'function' || !Color.supportsScoringVersion(4)) {
        document.getElementById('map-status').textContent = '色彩模組仍是舊版，請略過快取強制重新載入頁面。'; return;
    }
    var names = ['tolerance', 'exponent', 'knee', 'width', 'strength'];
    var candidateNames = ['knee', 'width', 'strength', 'penaltyExponent'];
    var state = { target: [48, 146, 198], plane: 'ab', extent: 0.4, point: { x: 0, y: 0 }, pinned: false,
        original: Color.scoringParameters({ version: 1 }), experimental: Color.scoringParameters({ version: 2 }), candidate: Color.scoringParameters({ version: 3 }), v4: MemoryColorV4.parameters(),
        field: null, dirty: true, scheduled: false, error: '', revision: 0 };
    var panels = ['original', 'experimental', 'candidate', 'v4'].map(function (id) {
        return { id: id, canvas: document.getElementById(id + '-map'), legend: document.getElementById(id + '-legend'),
            preview: document.getElementById(id + '-preview'), highlight: null };
    });
    function get(id) { return document.getElementById(id); }
    function text(e, value) { if (e.textContent !== value) e.textContent = value; }
    function css(rgb) { return 'rgb(' + rgb.join(',') + ')'; }
    function hex(rgb) { return '#' + rgb.map(function (n) { return n.toString(16).padStart(2, '0'); }).join('').toUpperCase(); }
    function rgbLabel(rgb) { return hex(rgb) + ' · RGB ' + rgb.join(', '); }
    function reportError(message) { state.error = message; text(get('map-status'), message); get('map-status').dataset.invalid = 'true'; }
    function schedule() {
        if (state.scheduled) return;
        state.scheduled = true; requestAnimationFrame(function () { state.scheduled = false; render(); });
    }
    function resetPoint() { state.point = { x: 0, y: 0 }; state.pinned = false; }
    function setTarget(rgb) {
        state.target = rgb.slice(); state.dirty = true; resetPoint();
        get('target-input').value = hex(rgb); get('target-chip').style.backgroundColor = css(rgb);
        get('target-chip').setAttribute('aria-label', '目標色 ' + rgbLabel(rgb));
        state.error = scoringForm.checkValidity() ? '' : '參數無效，沿用上一次有效的評分設定。'; schedule();
    }
    function readParameters() {
        if (!scoringForm.checkValidity()) { reportError('請輸入範圍內的有效參數；目前沿用上一次有效的曲線。'); return; }
        var input = {};
        names.forEach(function (name) { input[name] = Number(get('map-' + name).value); });
        try {
            state.experimental = Color.scoringParameters(Object.assign({ version: 2 }, input));
            state.original = Color.scoringParameters({ version: 1, tolerance: input.tolerance, exponent: input.exponent });
            var candidate = { version: 3, tolerance: input.tolerance, exponent: input.exponent };
            candidateNames.forEach(function (name) { candidate[name] = Number(get('map-v3-' + name).value); });
            state.candidate = Color.scoringParameters(candidate);
            var v4 = {tolerance: input.tolerance, exponent: input.exponent}; candidateNames.forEach(function(name){v4[name]=Number(get('map-v4-'+name).value);}); state.v4=MemoryColorV4.parameters(v4);
            state.error = ''; schedule();
        } catch (error) { reportError(error.message); }
    }
    function resetParameters() {
        var v2 = Color.scoringParameters({ version: 2 });
        names.forEach(function (name) { get('map-' + name).value = v2[name]; });
        var candidate = Color.scoringParameters({ version: 3 });
        candidateNames.forEach(function (name) { get('map-v3-' + name).value = candidate[name]; }); candidateNames.forEach(function(name){get('map-v4-'+name).value=MemoryColorV4.defaults[name];}); readParameters();
    }
    function buildField() {
        var context = panels[0].canvas.getContext('2d'), image = context.createImageData(SIZE, SIZE), data = image.data;
        var anchor = Color.srgbToOklab(state.target), valid = 0, total = 0;
        for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
            var offset = (y * SIZE + x) * 4, inside = Math.hypot(x + 0.5 - CENTER, y + 0.5 - CENTER) <= RADIUS;
            var light = (Math.floor(x / 12) + Math.floor(y / 12)) % 2;
            var shade = inside ? (light ? [52, 48, 61] : [34, 31, 42]) : [26, 22, 32];
            data[offset] = shade[0]; data[offset + 1] = shade[1]; data[offset + 2] = shade[2]; data[offset + 3] = 255;
        }
        for (var gy = -RADIUS; gy <= RADIUS; gy += GRID) for (var gx = -RADIUS; gx <= RADIUS; gx += GRID) {
            if (Math.hypot(gx, gy) > RADIUS) continue;
            total++;
            var lab = Slice.planeLab(anchor, state.plane, gx / RADIUS * state.extent, -gy / RADIUS * state.extent);
            var rgb = Slice.labToRgb(lab); if (!rgb) continue; valid++;
            for (var by = -GRID / 2; by < GRID / 2; by++) for (var bx = -GRID / 2; bx < GRID / 2; bx++) {
                var px = CENTER + gx + bx, py = CENTER + gy + by;
                if (Math.hypot(px + 0.5 - CENTER, py + 0.5 - CENTER) > RADIUS) continue;
                var p = (py * SIZE + px) * 4; data[p] = rgb[0]; data[p + 1] = rgb[1]; data[p + 2] = rgb[2];
            }
        }
        state.field = image; state.coverage = valid / total; state.dirty = false;
    }
    function inspection() {
        var point = state.point;
        var selected = Slice.inspect(state.target, state.plane, point.x / RADIUS * state.extent, -point.y / RADIUS * state.extent,
            state.original, state.experimental, state.candidate); selected.v4=selected.rgb?Color.grade(state.target,selected.rgb,state.v4):null; return selected;
    }
    function draw(panel, selected) {
        var context = panel.canvas.getContext('2d'), contours = Slice.contours(state[panel.id]);
        context.putImageData(state.field, 0, 0);
        context.save(); context.strokeStyle = '#ffffff38'; context.lineWidth = 1; context.setLineDash([3, 6]);
        context.beginPath(); context.moveTo(CENTER - RADIUS, CENTER); context.lineTo(CENTER + RADIUS, CENTER);
        context.moveTo(CENTER, CENTER - RADIUS); context.lineTo(CENTER, CENTER + RADIUS); context.stroke(); context.restore();
        context.strokeStyle = '#9b8baa'; context.lineWidth = 1;
        context.beginPath(); context.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2); context.stroke();
        contours.forEach(function (contour, index) {
            var radius = contour.radius / state.extent * RADIUS, button = panel.buttons[index];
            button.dataset.radius = String(contour.radius); button.dataset.outside = String(radius > RADIUS);
            button.setAttribute('aria-pressed', String(panel.highlight === contour.score));
            var distanceLabel = contour.radius > 0 && contour.radius < 0.001 ? contour.radius.toExponential(2) : contour.radius.toFixed(4);
            text(button.querySelector('small'), 'Δ ' + distanceLabel + (radius > RADIUS ? ' · 超出視野' : ''));
            if (radius > RADIUS) return;
            var highlighted = panel.highlight === contour.score;
            context.save(); context.beginPath(); context.arc(CENTER, CENTER, radius, 0, Math.PI * 2);
            context.strokeStyle = '#100c16b3'; context.lineWidth = highlighted ? 5 : 3; context.stroke();
            context.strokeStyle = highlighted ? '#e1c1ff' : '#ffffffc9'; context.lineWidth = highlighted ? 2.5 : 1; context.stroke();
            var angle = (-116 + index * 52) * Math.PI / 180;
            var lx = CENTER + 260 * Math.cos(angle), ly = CENTER + 260 * Math.sin(angle);
            context.setLineDash([2, 4]); context.strokeStyle = highlighted ? '#e1c1ff' : '#ddd0e780'; context.lineWidth = 1;
            context.beginPath(); context.moveTo(CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)); context.lineTo(lx, ly); context.stroke();
            context.setLineDash([]); context.fillStyle = highlighted ? '#604477' : '#17121fec'; context.fillRect(lx - 23, ly - 15, 46, 30);
            context.fillStyle = '#ffffff'; context.font = '600 20px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle';
            context.fillText(contour.score, lx, ly); context.restore();
        });
        var axes = Slice.planes[state.plane].map(function (i) { return ['L', 'a', 'b'][i]; });
        context.save(); context.fillStyle = '#d0c5dc'; context.font = '17px system-ui'; context.textAlign = 'center';
        context.fillText('+' + axes[0], 578, 306); context.fillText('−' + axes[0], 22, 306);
        context.fillText('+' + axes[1], 300, 20); context.fillText('−' + axes[1], 300, 592);
        context.fillStyle = css(state.target); context.strokeStyle = '#ffffff'; context.lineWidth = 2;
        context.beginPath(); context.arc(CENTER, CENTER, 6, 0, Math.PI * 2); context.fill(); context.stroke();
        if (state.point.x || state.point.y) {
            var x = CENTER + state.point.x, y = CENTER + state.point.y;
            context.beginPath(); context.arc(x, y, 7, 0, Math.PI * 2); context.strokeStyle = '#110d17'; context.lineWidth = 4; context.stroke();
            context.strokeStyle = selected.rgb ? '#ffffff' : '#ffb7a0'; context.lineWidth = 2; context.stroke();
        }
        context.restore();
        text(panel.preview, selected.rgb ? hex(selected.rgb) + ' · ' + selected[panel.id].score.toFixed(3) + ' 分' : '超出 sRGB 色域');
        panel.canvas.dataset.score = selected.rgb ? String(selected[panel.id].score) : '';
        panel.canvas.setAttribute('aria-label', ({ original: '原始 V1', experimental: '歷史 V2', candidate: '歷史 V3', v4: '預設 V4' })[panel.id] + '曲線色彩圖，' + panel.preview.textContent);
    }
    function renderSamples() {
        var key = JSON.stringify([state.target, state.plane, state.original, state.experimental, state.candidate, state.v4]);
        if (state.samplesKey === key) return;
        state.samplesKey = key;
        panels.forEach(function (panel) {
            var container = get(panel.id + '-samples'); container.replaceChildren();
            Slice.samplesAtScores(state.target, state.plane, state[panel.id]).forEach(function (sample) {
                var card = document.createElement('article'), label = document.createElement('p'), colors = document.createElement('div');
                card.className = 'score-sample'; card.dataset.level = String(sample.level);
                card.dataset.available = String(!!sample.rgb); card.dataset.actualScore = sample.grade ? String(sample.grade.score) : '';
                card.dataset.rgb = sample.rgb ? sample.rgb.join(',') : '';
                label.className = 'sample-score'; label.textContent = '接近 ' + sample.level + ' 分 · 實際 ' + (sample.grade ? sample.grade.score.toFixed(3) : '—');
                colors.className = 'sample-colors';
                [state.target, sample.rgb].forEach(function (rgb, index) {
                    var figure = document.createElement('figure'), swatch = document.createElement('div'), caption = document.createElement('figcaption');
                    swatch.className = 'sample-color' + (index ? ' sample-answer-color' : '');
                    if (rgb) swatch.style.backgroundColor = css(rgb);
                    caption.textContent = (index ? '答案 ' : '目標 ') + (rgb ? hex(rgb) : '未找到可顯示色彩');
                    figure.append(swatch, caption); colors.append(figure);
                });
                var detail = document.createElement('p'); detail.className = 'hint';
                detail.textContent = sample.rgb ? 'RGB ' + sample.rgb.join(', ') + ' · Δ ' + sample.grade.error.toFixed(6)
                    : '此剖面的取樣圓未找到色域內答案；可嘗試明暗剖面。';
                card.append(label, colors, detail); container.append(card);
            });
        });
    }
    function table(id, headers, rows) {
        var root=get(id);root.replaceChildren();var table=document.createElement('table'),head=document.createElement('tr');headers.forEach(function(v){var th=document.createElement('th');th.textContent=v;head.append(th);});table.append(head);rows.forEach(function(row){var tr=document.createElement('tr');row.forEach(function(v){var td=document.createElement('td');if(v instanceof Node)td.append(v);else td.textContent=v;tr.append(td);});table.append(tr);});root.append(table);
    }
    function renderComparisons(){
        var curves={V1:state.original,V3:state.candidate,V4:state.v4};
        table('distance-table',['Δ','V1','V3','V4'],[0,.04,.06,.08,.10,.12,.16,.20,.25,.30,.40].map(function(d){return [d.toFixed(2)].concat(Object.values(curves).map(function(p){return Color.mapColorErrorToScore(d,p).toFixed(3);}));}));
        try{
            var raw=get('players-answers').value.trim(),answers=raw?raw.split(/\r?\n/).filter(Boolean).map(Slice.parseTarget):Slice.samplesAtScores(state.target,state.plane,state.v4,[90,70,30]).filter(function(s){return s.rgb;}).map(function(s){return s.rgb;});
            if(!raw&&answers.length<2)answers=[state.target,[128,128,128]];
            if(answers.length<2||answers.length>8)throw new Error('請輸入 2–8 個有效 HEX 答案。');
            var comparisons=MemoryColorV4.compare(state.target,answers,Number(get('damage-multiplier').value),curves),rows=[];
            comparisons.forEach(function(c){c.rows.forEach(function(r){var swatch=document.createElement('span');swatch.style.cssText='display:inline-block;width:48px;height:28px;background:'+css(r.rgb);swatch.title=hex(r.rgb);rows.push([c.curve,'P'+r.player,swatch,hex(r.rgb),r.error.toFixed(5),r.score.toFixed(3),r.gap.toFixed(3),r.damage.toFixed(3)]);});});
            table('players-table',['曲線','玩家','答案','RGB','Δ','分數','距最高分','傷害'],rows);text(get('players-error'),'');
        }catch(e){text(get('players-error'),e.message);get('players-table').replaceChildren();}
    }
    function render() {
        if (state.dirty) buildField();
        var selected = inspection(), valid = !!selected.rgb;
        text(get('inspect-target'), rgbLabel(state.target)); get('inspect-target-swatch').style.backgroundColor = css(state.target);
        text(get('inspect-selected'), valid ? rgbLabel(selected.rgb) : '超出 sRGB 色域');
        get('inspect-selected-swatch').style.backgroundColor = valid ? css(selected.rgb) : '';
        get('inspect-selected-swatch').dataset.invalid = String(!valid);
        text(get('inspect-distance'), valid ? selected.original.error.toFixed(6) : '—');
        text(get('inspect-ideal-distance'), selected.idealError.toFixed(6));
        text(get('inspect-original'), valid ? selected.original.score.toFixed(3) : '—');
        text(get('inspect-experimental'), valid ? selected.experimental.score.toFixed(3) : '—');
        text(get('inspect-candidate'), valid ? selected.candidate.score.toFixed(3) : '—'); text(get('inspect-v4'),valid?selected.v4.score.toFixed(3):'—');
        text(get('selection-state'), state.pinned ? '已固定 · 點其他色彩可重新選取' : '預覽中');
        text(get('selection-message'), valid ? '分數與色差依實際顯示的 RGB 計算；所有圖選取的是同一位置。' : '這個剖面位置沒有可顯示的 sRGB 色彩，未顯示替代色或分數。');
        main.dataset.selectedRgb = valid ? selected.rgb.join(',') : ''; main.dataset.pinned = String(state.pinned);
        panels.forEach(function (panel) { draw(panel, selected); });
        renderSamples(); renderComparisons();
        var anchor = Color.srgbToOklab(state.target), fixed = [0, 1, 2].find(function (i) { return !Slice.planes[state.plane].includes(i); });
        text(get('slice-summary'), '目前固定 ' + ['L', 'a', 'b'][fixed] + ' = ' + anchor[fixed].toFixed(4)
            + '；所有圖的半徑皆為 Δ ' + state.extent.toFixed(2) + '。此視野約 ' + (state.coverage * 100).toFixed(1) + '% 的取樣位於 sRGB 色域內。');
        get('map-status').dataset.invalid = String(!!state.error);
        text(get('map-status'), state.error || '已更新 · 正式遊戲評分與設定保持不變。');
        main.dataset.revision = String(++state.revision); main.dataset.ready = 'true';
    }
    function pointFromEvent(canvas, event) {
        var rect = canvas.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width * SIZE - CENTER;
        var y = (event.clientY - rect.top) / rect.height * SIZE - CENTER;
        if (Math.hypot(x, y) > RADIUS) return null;
        if (Math.hypot(x, y) <= 6) return { x: 0, y: 0 };
        var point = { x: Math.floor((x + GRID / 2) / GRID) * GRID, y: Math.floor((y + GRID / 2) / GRID) * GRID };
        return Math.hypot(point.x, point.y) <= RADIUS ? point : null;
    }
    panels.forEach(function (panel) {
        panel.buttons = Slice.scores.map(function (score) {
            var button = document.createElement('button'), small = document.createElement('small');
            button.type = 'button'; button.textContent = score + ' 分'; button.append(small); button.dataset.score = String(score);
            button.addEventListener('click', function () { panel.highlight = panel.highlight === score ? null : score; schedule(); });
            panel.legend.append(button); return button;
        });
        panel.canvas.addEventListener('pointermove', function (event) {
            if (state.pinned) return;
            var point = pointFromEvent(panel.canvas, event); if (point) { state.point = point; schedule(); }
        });
        panel.canvas.addEventListener('pointerleave', function () { if (!state.pinned) { resetPoint(); schedule(); } });
        panel.canvas.addEventListener('click', function (event) {
            var point = pointFromEvent(panel.canvas, event); if (!point) return;
            state.point = point; state.pinned = !!inspection().rgb; schedule();
        });
        panel.canvas.addEventListener('keydown', function (event) {
            var delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
            if (delta) {
                event.preventDefault(); var step = GRID * (event.shiftKey ? 5 : 1);
                var point = { x: state.point.x + delta[0] * step, y: state.point.y + delta[1] * step };
                if (Math.hypot(point.x, point.y) <= RADIUS) { state.point = point; schedule(); }
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault(); state.pinned = !!inspection().rgb && !state.pinned; schedule();
            } else if (event.key === 'Escape') { event.preventDefault(); resetPoint(); schedule(); }
        });
    });
    get('target-form').addEventListener('submit', function (event) {
        event.preventDefault();
        try { setTarget(Slice.parseTarget(get('target-input').value)); }
        catch (_) { reportError('請輸入有效的 HEX 色碼，或三個 0–255 的 RGB 整數。'); }
    });
    get('random-target').addEventListener('click', function () { setTarget(Color.generateQuestion(crypto.getRandomValues(new Uint32Array(1))[0]).target); });
    get('clear-selection').addEventListener('click', function () { resetPoint(); schedule(); });
    get('slice-plane').addEventListener('change', function () { state.plane = this.value; state.dirty = true; resetPoint(); schedule(); });
    get('slice-extent').addEventListener('change', function () { state.extent = Number(this.value); state.dirty = true; resetPoint(); schedule(); });
    get('curve-view').addEventListener('change', function () {
        var view = this.value; get('plots').dataset.view = get('sample-groups').dataset.view = view;
        panels.forEach(function (panel) {
            var visible = view === 'all' || view === 'v1-v3-v4' && panel.id !== 'experimental' || view === panel.id || view === 'v2-v3' && ['experimental','candidate'].includes(panel.id);
            get(panel.id + '-panel').hidden = get(panel.id + '-sample-panel').hidden = !visible;
        }); schedule();
    });
    scoringForm.addEventListener('input', readParameters);
    scoringForm.addEventListener('submit', function (event) { event.preventDefault(); readParameters(); });
    get('reset-parameters').addEventListener('click', resetParameters);
    get('players-answers').addEventListener('input',schedule);get('damage-multiplier').addEventListener('change',schedule);get('curve-view').dispatchEvent(new Event('change'));
    resetParameters(); setTarget(Color.generateQuestion(crypto.getRandomValues(new Uint32Array(1))[0]).target);
})();
