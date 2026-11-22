/* HSL and Hue-only presentation; target data is rendered only during impressions/results. */
(function () {
    'use strict';
    var AC = window.ArcadeCommon, Colors = window.ImpressionsColorVariants, Single = window.ImpressionsColorSingle;
    Object.assign(AC.i18n.STRINGS.en, { impressionsHue: 'Hue', impressionsSaturation: 'Saturation', impressionsLightness: 'Lightness', impressionsHslHelp: 'One color: adjust Hue, Saturation and Lightness. Hue wraps around the full color circle.', impressionsHueHelp: 'Remember each color in its place. Adjust only Hue; saturation and lightness are already correct.', impressionsHslWheelHint: 'Drag to adjust · ± to fine-tune', impressionsHslControls: 'Drag up or down. Arrow keys adjust by 1; ± or Shift with an arrow adjusts by 0.01. Page Up/Down adjusts by 15.', impressionsHueMemorize: 'Remember every color', impressionsHueMemorizeMessage: 'Remember which color belongs to each letter.', impressionsHueAnswer: 'Recreate every color', impressionsHueAnswerMessage: 'Adjust each Hue. For four colors, tap a swatch to select it.', impressionsColorError: 'Color error', impressionsColorRms: 'Combined color error', impressionsHueScore: 'Each swatch matters. Closer colors score higher; a larger mismatch lowers the score more.', impressionsHslScore: 'Closer colors score higher. Speed does not affect the score.', impressionsColorReady: 'Your colors appear here', impressionsChooseColor: 'Select color' });
    Object.assign(AC.i18n.STRINGS.zh, { impressionsHue: '色相', impressionsSaturation: '飽和度', impressionsLightness: '亮度', impressionsHslHelp: '單色題：調整色相、飽和度與亮度。色相可沿色環連續循環。', impressionsHueHelp: '記住每個位置的顏色，只需重現色相；飽和度與亮度已固定。', impressionsHslWheelHint: '拖曳調整 · 用±微調', impressionsHslControls: '上下拖曳調整。方向鍵每次調整1，±或Shift搭配方向鍵微調0.01，Page Up／Down每次調整15。', impressionsHueMemorize: '記住每一個顏色', impressionsHueMemorizeMessage: '記住各字母所對應的顏色。', impressionsHueAnswer: '重現每一個顏色', impressionsHueAnswerMessage: '分別調整色相。四色題可點選色塊切換控制。', impressionsColorError: '顏色誤差', impressionsColorRms: '整體顏色誤差', impressionsHueScore: '每個色塊都會影響分數，差距較大的顏色影響更多。', impressionsHslScore: '顏色越接近，分數越高，作答速度不影響分數。', impressionsColorReady: '顏色會顯示於此', impressionsChooseColor: '選擇顏色' });
    function css(rgb) { return 'rgb(' + rgb.join(',') + ')'; }
    Object.assign(AC.i18n.STRINGS.en, { impressionsDualColorHelp: 'HSL adjusts hue, saturation and lightness; RGB adjusts red, green and blue. Switch between them while keeping the same color.', impressionsColorMode: 'Color adjustment mode' });
    Object.assign(AC.i18n.STRINGS.zh, { impressionsDualColorHelp: 'HSL調整色相、飽和度與亮度，RGB調整紅、綠、藍。可以隨時切換，已調好的顏色會保留。', impressionsColorMode: '顏色調整模式' });
    window.ImpressionsColorView = { create: function (options) {
        var root = options.root, doc = root.ownerDocument, t = AC.i18n.t, context = null, wheelKey = null, questionKey = null, selected = 'a', wheels = {}, cards = {}, targetCards = {}, answerCards = {};
        var mode = 'hsl', hslDraft = null, lastRgb = null, modeBar = null, modeButtons = {};
        function get(id) { return root.querySelector('#impressions-' + id); }
        function node(tag, cls, text) { var e = doc.createElement(tag); e.className = cls || ''; if (text !== undefined) e.textContent = text; return e; }
        function ids(q) { return q.variant === 'single' ? ['single'] : q.swatches; }
        function swatches(host, q, interactive) {
            host.replaceChildren(); var result = {};
            ids(q).forEach(function (id) { var card = node(interactive ? 'button' : 'div', 'impressions-color-card'); card.dataset.swatch = id;
                if (interactive) { card.type = 'button'; card.id = 'impressions-color-select-' + id; card.addEventListener('click', function () { if (context && context.phase === 'answer' && q.variant === 'hue4') { selected = id; update(context); wheels.h.focus(); } }); }
                card.append(node('span', 'impressions-color-letter', id === 'single' ? '' : id.toUpperCase())); host.append(card); result[id] = card;
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
            modeBar = node('div', 'impressions-color-mode'); modeBar.id = 'impressions-color-mode'; modeBar.setAttribute('role', 'group');
            ['hsl', 'rgb'].forEach(function (id) { var b = node('button', 'btn', id.toUpperCase()); b.type = 'button'; b.id = 'impressions-color-mode-' + id; modeBar.append(b); modeButtons[id] = b;
                b.addEventListener('click', function () { if (context && dual(context.question) && context.phase === 'answer' && context.active !== false && options.canChange() && mode !== id) { mode = id; wheelKey = null; update(context); } });
            });
            get('hsl-wheels').parentElement.insertBefore(modeBar, get('hsl-wheels'));
        }
        function buildWheels(q) {
            Object.values(wheels).forEach(function (w) { w.destroy(); }); wheels = {}; get('hsl-wheels').replaceChildren();
            var rgbMode = dual(q) && mode === 'rgb', controls = q.variant === 'single' ? rgbMode ? ['r', 'g', 'b'] : ['h', 's', 'l'] : q.variant === 'hue4' ? ['h'] : q.swatches;
            controls.forEach(function (id) {
                var isHue = q.variant !== 'single' || id === 'h', host = node('div', 'impressions-channel'); host.id = 'impressions-wheel-' + (rgbMode ? 'dual-' + id : q.variant === 'single' ? 'hsl-' + id : q.variant === 'hue4' ? 'hue' : 'hue-' + id); host.style.setProperty('--channel', isHue ? '#c5abfa' : '#9ecbd8'); host.style.setProperty('--channel-rgb', '197,171,250'); get('hsl-wheels').append(host);
                if (rgbMode) { host.dataset.channel = id; host.style.removeProperty('--channel'); host.style.removeProperty('--channel-rgb'); }
                wheels[id] = window.ImpressionsWheel.create({ element: host, channel: q.variant === 'single' ? id : q.variant === 'hue4' ? selected : id, label: t(rgbMode ? { r: 'impressionsRed', g: 'impressionsGreen', b: 'impressionsBlue' }[id] : isHue ? 'impressionsHue' : id === 's' ? 'impressionsSaturation' : 'impressionsLightness'), value: 0,
                    min: 0, max: rgbMode ? 255 : isHue ? 360 : 100, wrap: isHue, step: rgbMode ? 1 : 0.01, keyStep: 1, pageStep: rgbMode ? 16 : 15, pixelsPerUnit: isHue ? 1.25 : 2, finePixelsPerUnit: 8, wheelPixelsPerUnit: rgbMode ? 12 : 6,
                    format: rgbMode ? function (v) { return String(v); } : function (v) { return v.toFixed(2) + (isHue ? '°' : '%'); }, helpId: 'impressions-hsl-help', disabled: true, canChange: options.canChange,
                    onChange: function (v) { changed(q.variant === 'hue4' ? selected : id, v); } });
            });
            get('hsl-wheels').style.setProperty('--color-controls', controls.length);
        }
        function paint(s) {
            var q = s.question, answering = ['answer', 'waiting'].includes(s.phase), visible = s.phase === 'memorize' || answering;
            ids(q).forEach(function (id) {
                var card = cards[id], rgb = visible ? q.variant === 'single' && s.phase === 'memorize' ? q.target : answerRgb(q, s.phase === 'memorize' ? q.target : s.draft, id) : null;
                card.style.backgroundColor = rgb ? css(rgb) : 'var(--impressions-inset)'; card.disabled = s.phase !== 'answer' || q.variant !== 'hue4' || s.active === false;
                card.classList.toggle('selected', q.variant === 'hue4' && selected === id && answering);
                card.setAttribute('aria-label', t(q.variant === 'hue4' && answering ? 'impressionsChooseColor' : 'impressionsColor') + (id === 'single' ? '' : ' ' + id.toUpperCase()));
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
            if (modeBar) { modeBar.hidden = !dual(q); modeBar.setAttribute('aria-label', t('impressionsColorMode')); Object.keys(modeButtons).forEach(function (id) { modeButtons[id].disabled = s.phase !== 'answer' || s.active === false; modeButtons[id].setAttribute('aria-pressed', String(mode === id)); }); }
            var nextWheelKey = q.version + ':' + q.variant + ':' + (dual(q) ? mode : 'legacy');
            if (wheelKey !== nextWheelKey) { wheelKey = nextWheelKey; buildWheels(q); }
            root.dataset.colorControls = dual(q) ? mode : 'legacy';
            root.dataset.colorVariant = q.variant;
            get('modern-palette').dataset.count = ids(q).length;
            paint(s);
            Object.keys(wheels).forEach(function (id) { var value = dual(q) ? mode === 'rgb' ? s.draft['rgb'.indexOf(id)] : hslDraft[id] : q.variant === 'hue4' ? s.draft[selected] : s.draft[id], w = wheels[id]; if (dual(q) ? Math.abs(w.value() - value) > 0.005 : w.value() !== value) w.setValue(value); w.setDisabled(s.phase !== 'answer' || s.active === false);
                w.setLabel(q.variant === 'single' ? t({ h: 'impressionsHue', s: 'impressionsSaturation', l: 'impressionsLightness', r: 'impressionsRed', g: 'impressionsGreen', b: 'impressionsBlue' }[id]) : t('impressionsHue') + ' ' + (q.variant === 'hue4' ? selected : id).toUpperCase());
            });
            if (q.variant === 'hue4') get('hsl-wheels').querySelector('.impressions-channel-letter').textContent = selected.toUpperCase();
            get('hsl-cover').hidden = ['answer', 'waiting', 'results'].includes(s.phase);
            get('hsl-note').textContent = t(s.phase === 'memorize' ? 'impressionsMemorizeCover' : 'impressionsPrepareCover');
            get('modern-color-note').hidden = ['memorize', 'answer', 'waiting'].includes(s.phase); get('modern-color-note').textContent = t('impressionsColorReady');
            get('hsl-help').textContent = t(dual(q) && mode === 'rgb' ? 'impressionsWheelHelp' : 'impressionsHslWheelHint');
            if (s.phase === 'results') {
                ids(q).forEach(function (id) { targetCards[id].style.backgroundColor = css(q.variant === 'single' ? q.target : Colors.answerRgb(q, q.target, id)); answerCards[id].style.backgroundColor = s.answer ? css(answerRgb(q, s.answer, id)) : 'var(--impressions-inset)'; });
                var grade = s.answer ? dual(q) ? Single.grade(q, s.answer, s.config.scoring) : Colors.grade(q, s.answer, s.config.color, s.config.scoring) : null;
                get('color-error-rows').replaceChildren.apply(get('color-error-rows'), q.variant === 'single' ? [] : q.swatches.map(function (id) { var tr = node('tr'); [id.toUpperCase(), grade && grade.valid ? grade.errors[id].toFixed(4) : '—'].forEach(function (v) { tr.append(node('td', '', v)); }); return tr; }));
                get('color-rms').textContent = t(q.variant === 'single' ? 'impressionsColorError' : 'impressionsColorRms') + ': ' + (grade && grade.valid ? grade.error.toFixed(4) : '—');
            } else {
                Object.values(targetCards).concat(Object.values(answerCards)).forEach(function (e) { e.style.removeProperty('background-color'); });
                get('color-error-rows').replaceChildren(); get('color-rms').textContent = '';
            }
        }
        return { update: update, focus: function () { var first = Object.values(wheels)[0]; if (first) first.focus(); }, destroy: function () { Object.values(wheels).forEach(function (w) { w.destroy(); }); get('hsl-wheels').replaceChildren(); if (modeBar) modeBar.remove(); } };
    } };
})();
