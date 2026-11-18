/* HSL and Hue-only presentation; target data is rendered only during memory/results. */
(function () {
    'use strict';
    var AC = window.ArcadeCommon, Colors = window.MemoryColorVariants, Single = window.MemoryColorSingle;
    Object.assign(AC.i18n.STRINGS.en, { memoryHue: 'Hue', memorySaturation: 'Saturation', memoryLightness: 'Lightness', memoryHslHelp: 'One color: adjust Hue, Saturation and Lightness. Hue wraps around the full color circle.', memoryHueHelp: 'Remember each color in its place. Adjust only Hue; saturation and lightness are already correct.', memoryHslControls: 'Drag to adjust · arrows: 1 · Shift + arrows / ±: 0.01 · Page: 15', memoryHueMemorize: 'Remember every color', memoryHueMemorizeMessage: 'Remember which color belongs to each letter.', memoryHueAnswer: 'Recreate every color', memoryHueAnswerMessage: 'Adjust each Hue. For four colors, tap a swatch to select it.', memoryColorError: 'Color error', memoryColorRms: 'Combined color error', memoryHueScore: 'Accuracy uses RMS perceptual color error across matching swatches.', memoryHslScore: 'Accuracy uses the existing perceptual color scoring curve.', memoryColorReady: 'Your colors appear here', memoryChooseColor: 'Select color' });
    Object.assign(AC.i18n.STRINGS.zh, { memoryHue: '色相', memorySaturation: '飽和度', memoryLightness: '亮度', memoryHslHelp: '單色題：調整色相、飽和度與亮度。色相可沿色環連續循環。', memoryHueHelp: '記住每個位置的顏色，只需重現色相；飽和度與亮度已固定。', memoryHslControls: '拖曳調整 · 方向鍵：1 · Shift＋方向鍵／±：0.01 · Page：15', memoryHueMemorize: '記住每一個顏色', memoryHueMemorizeMessage: '記住各字母所對應的顏色。', memoryHueAnswer: '重現每一個顏色', memoryHueAnswerMessage: '分別調整色相。四色題可點選色塊切換控制。', memoryColorError: '顏色誤差', memoryColorRms: '整體顏色誤差', memoryHueScore: '準確度取決於各色塊知覺色差的 RMS。', memoryHslScore: '準確度使用原有的知覺色差計分曲線。', memoryColorReady: '顏色會顯示於此', memoryChooseColor: '選擇顏色' });
    function css(rgb) { return 'rgb(' + rgb.join(',') + ')'; }
    Object.assign(AC.i18n.STRINGS.en, { memoryDualColorHelp: 'One color: switch between HSL and RGB. Switching controls keeps the same displayed and scored RGB color.', memoryColorMode: 'Color adjustment mode' });
    Object.assign(AC.i18n.STRINGS.zh, { memoryDualColorHelp: '單一顏色，可切換 HSL 或 RGB 調整。切換控制方式會保留相同的顯示與計分顏色。', memoryColorMode: '顏色調整模式' });
    window.MemoryColorView = { create: function (options) {
        var root = options.root, doc = root.ownerDocument, t = AC.i18n.t, context = null, wheelKey = null, questionKey = null, selected = 'a', wheels = {}, cards = {}, targetCards = {}, answerCards = {};
        var mode = 'hsl', hslDraft = null, lastRgb = null, modeBar = null, modeButtons = {};
        function get(id) { return root.querySelector('#memory-' + id); }
        function node(tag, cls, text) { var e = doc.createElement(tag); e.className = cls || ''; if (text !== undefined) e.textContent = text; return e; }
        function ids(q) { return q.variant === 'single' ? ['single'] : q.swatches; }
        function swatches(host, q, interactive) {
            host.replaceChildren(); var result = {};
            ids(q).forEach(function (id) { var card = node(interactive ? 'button' : 'div', 'memory-color-card'); card.dataset.swatch = id;
                if (interactive) { card.type = 'button'; card.id = 'memory-color-select-' + id; card.addEventListener('click', function () { if (context && context.phase === 'answer' && q.variant === 'hue4') { selected = id; update(context); wheels.h.focus(); } }); }
                card.append(node('span', 'memory-color-letter', id === 'single' ? '' : id.toUpperCase())); host.append(card); result[id] = card;
            }); return result;
        }
        function dual(q) { return q.version === 3; }
        function answerRgb(q, answer, id) { return dual(q) ? answer : Colors.answerRgb(q, answer, id); }
        function changed(id, value) {
            if (context && dual(context.question)) {
                var rgb;
                if (mode === 'rgb') { rgb = context.draft.slice(); rgb['rgb'.indexOf(id)] = value; hslDraft = Colors.rgbToHsl(rgb); }
                else { hslDraft[id] = value; rgb = Colors.hslToRgb(hslDraft); }
                lastRgb = rgb.join(','); context.draft = rgb; options.onAnswer(rgb.slice());
            } else options.onChange(id, value);
            if (context) paint(context);
        }
        function buildModeBar() {
            if (modeBar) return;
            modeBar = node('div', 'memory-color-mode'); modeBar.id = 'memory-color-mode'; modeBar.setAttribute('role', 'group');
            ['hsl', 'rgb'].forEach(function (id) { var b = node('button', 'btn', id.toUpperCase()); b.type = 'button'; b.id = 'memory-color-mode-' + id; modeBar.append(b); modeButtons[id] = b;
                b.addEventListener('click', function () { if (context && dual(context.question) && context.phase === 'answer' && context.active !== false && options.canChange() && mode !== id) { mode = id; wheelKey = null; update(context); } });
            });
            get('hsl-wheels').parentElement.insertBefore(modeBar, get('hsl-wheels'));
        }
        function buildWheels(q) {
            Object.values(wheels).forEach(function (w) { w.destroy(); }); wheels = {}; get('hsl-wheels').replaceChildren();
            var rgbMode = dual(q) && mode === 'rgb', controls = q.variant === 'single' ? rgbMode ? ['r', 'g', 'b'] : ['h', 's', 'l'] : q.variant === 'hue4' ? ['h'] : q.swatches;
            controls.forEach(function (id) {
                var isHue = q.variant !== 'single' || id === 'h', host = node('div', 'memory-channel'); host.id = 'memory-wheel-' + (rgbMode ? 'dual-' + id : q.variant === 'single' ? 'hsl-' + id : q.variant === 'hue4' ? 'hue' : 'hue-' + id); host.style.setProperty('--channel', isHue ? '#c5abfa' : '#9ecbd8'); host.style.setProperty('--channel-rgb', '197,171,250'); get('hsl-wheels').append(host);
                if (rgbMode) { host.dataset.channel = id; host.style.removeProperty('--channel'); host.style.removeProperty('--channel-rgb'); }
                wheels[id] = window.MemoryWheel.create({ element: host, channel: q.variant === 'single' ? id : q.variant === 'hue4' ? selected : id, label: t(rgbMode ? { r: 'memoryRed', g: 'memoryGreen', b: 'memoryBlue' }[id] : isHue ? 'memoryHue' : id === 's' ? 'memorySaturation' : 'memoryLightness'), value: 0,
                    min: 0, max: rgbMode ? 255 : isHue ? 360 : 100, wrap: isHue, step: rgbMode ? 1 : 0.01, keyStep: 1, pageStep: rgbMode ? 16 : 15, pixelsPerUnit: isHue ? 1.25 : 2, finePixelsPerUnit: 8, wheelPixelsPerUnit: rgbMode ? 12 : 6,
                    format: rgbMode ? function (v) { return String(v); } : function (v) { return v.toFixed(2) + (isHue ? '°' : '%'); }, helpId: 'memory-hsl-help', disabled: true, canChange: options.canChange,
                    onChange: function (v) { changed(q.variant === 'hue4' ? selected : id, v); } });
            });
            get('hsl-wheels').style.setProperty('--color-controls', controls.length);
        }
        function paint(s) {
            var q = s.question, answering = ['answer', 'waiting'].includes(s.phase), visible = s.phase === 'memorize' || answering;
            ids(q).forEach(function (id) {
                var card = cards[id], rgb = visible ? q.variant === 'single' && s.phase === 'memorize' ? q.target : answerRgb(q, s.phase === 'memorize' ? q.target : s.draft, id) : null;
                card.style.backgroundColor = rgb ? css(rgb) : '#24202d'; card.disabled = s.phase !== 'answer' || q.variant !== 'hue4' || s.active === false;
                card.classList.toggle('selected', q.variant === 'hue4' && selected === id && answering);
                card.setAttribute('aria-label', t(q.variant === 'hue4' && answering ? 'memoryChooseColor' : 'memoryColor') + (id === 'single' ? '' : ' ' + id.toUpperCase()));
                if (q.variant === 'hue4') card.setAttribute('aria-pressed', String(selected === id));
            });
        }
        function update(s) {
            context = s;
            if (!s || !s.question || s.question.type !== 'color' || ![2, 3].includes(s.question.version)) {
                Object.values(wheels).forEach(function (w) { w.setDisabled(true); }); get('modern-palette').replaceChildren(); get('color-result-target').replaceChildren(); get('color-result-answer').replaceChildren(); get('color-error-rows').replaceChildren(); get('color-rms').textContent = ''; questionKey = null; return;
            }
            var q = s.question, key = s.key;
            if (questionKey !== key) { questionKey = key; selected = 'a'; lastRgb = null; cards = swatches(get('modern-palette'), q, true); targetCards = swatches(get('color-result-target'), q, false); answerCards = swatches(get('color-result-answer'), q, false); }
            if (dual(q) && lastRgb !== s.draft.join(',')) { lastRgb = s.draft.join(','); hslDraft = Colors.rgbToHsl(s.draft); }
            if (dual(q)) buildModeBar();
            if (modeBar) { modeBar.hidden = !dual(q); modeBar.setAttribute('aria-label', t('memoryColorMode')); Object.keys(modeButtons).forEach(function (id) { modeButtons[id].disabled = s.phase !== 'answer' || s.active === false; modeButtons[id].setAttribute('aria-pressed', String(mode === id)); }); }
            var nextWheelKey = q.version + ':' + q.variant + ':' + (dual(q) ? mode : 'legacy');
            if (wheelKey !== nextWheelKey) { wheelKey = nextWheelKey; buildWheels(q); }
            root.dataset.colorControls = dual(q) ? mode : 'legacy';
            root.dataset.colorVariant = q.variant;
            get('modern-palette').dataset.count = ids(q).length;
            paint(s);
            Object.keys(wheels).forEach(function (id) { var value = dual(q) ? mode === 'rgb' ? s.draft['rgb'.indexOf(id)] : hslDraft[id] : q.variant === 'hue4' ? s.draft[selected] : s.draft[id], w = wheels[id]; if (dual(q) ? Math.abs(w.value() - value) > 0.005 : w.value() !== value) w.setValue(value); w.setDisabled(s.phase !== 'answer' || s.active === false);
                w.setLabel(q.variant === 'single' ? t({ h: 'memoryHue', s: 'memorySaturation', l: 'memoryLightness', r: 'memoryRed', g: 'memoryGreen', b: 'memoryBlue' }[id]) : t('memoryHue') + ' ' + (q.variant === 'hue4' ? selected : id).toUpperCase());
            });
            if (q.variant === 'hue4') get('hsl-wheels').querySelector('.memory-channel-letter').textContent = selected.toUpperCase();
            get('hsl-cover').hidden = ['answer', 'waiting', 'results'].includes(s.phase);
            get('hsl-note').textContent = t(s.phase === 'memorize' ? 'memoryMemorizeCover' : 'memoryPrepareCover');
            get('modern-color-note').hidden = ['memorize', 'answer', 'waiting'].includes(s.phase); get('modern-color-note').textContent = t('memoryColorReady');
            get('hsl-help').textContent = t(dual(q) && mode === 'rgb' ? 'memoryWheelHelp' : 'memoryHslControls');
            if (s.phase === 'results') {
                ids(q).forEach(function (id) { targetCards[id].style.backgroundColor = css(q.variant === 'single' ? q.target : Colors.answerRgb(q, q.target, id)); answerCards[id].style.backgroundColor = s.answer ? css(answerRgb(q, s.answer, id)) : '#24202d'; });
                var grade = s.answer ? dual(q) ? Single.grade(q, s.answer, s.config.scoring) : Colors.grade(q, s.answer, s.config.color, s.config.scoring) : null;
                get('color-error-rows').replaceChildren.apply(get('color-error-rows'), q.variant === 'single' ? [] : q.swatches.map(function (id) { var tr = node('tr'); [id.toUpperCase(), grade && grade.valid ? grade.errors[id].toFixed(4) : '—'].forEach(function (v) { tr.append(node('td', '', v)); }); return tr; }));
                get('color-rms').textContent = t(q.variant === 'single' ? 'memoryColorError' : 'memoryColorRms') + ': ' + (grade && grade.valid ? grade.error.toFixed(4) : '—');
            } else {
                Object.values(targetCards).concat(Object.values(answerCards)).forEach(function (e) { e.style.removeProperty('background-color'); });
                get('color-error-rows').replaceChildren(); get('color-rms').textContent = '';
            }
        }
        return { update: update, focus: function () { var first = Object.values(wheels)[0]; if (first) first.focus(); }, destroy: function () { Object.values(wheels).forEach(function (w) { w.destroy(); }); get('hsl-wheels').replaceChildren(); if (modeBar) modeBar.remove(); } };
    } };
})();
