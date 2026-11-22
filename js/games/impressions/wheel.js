/* Vertical wheel. Existing integer/bounded defaults; optional decimal precision and circular Hue. */
(function () {
    'use strict';
    window.ImpressionsWheel = {
        create: function (options) {
            var host = options.element, doc = host.ownerDocument, listeners = new AbortController();
            var minimum = options.min === undefined ? 0 : options.min, maximum = options.max === undefined ? 255 : options.max;
            var pixelsPerUnit = options.pixelsPerUnit === undefined ? 2 : options.pixelsPerUnit;
            var finePixelsPerUnit = options.finePixelsPerUnit === undefined ? 8 : options.finePixelsPerUnit;
            var wheelPixelsPerUnit = options.wheelPixelsPerUnit === undefined ? 12 : options.wheelPixelsPerUnit;
            var pageStep = options.pageStep === undefined ? 16 : options.pageStep;
            var step = options.step === undefined ? 1 : options.step, keyStep = options.keyStep === undefined ? step : options.keyStep, wrap = options.wrap === true;
            if (options.visualPixelsPerUnit !== undefined && (!Number.isFinite(options.visualPixelsPerUnit) || options.visualPixelsPerUnit <= 0)) throw new RangeError('Invalid wheel tick display scale.');
            if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum >= maximum
                || ![pixelsPerUnit, finePixelsPerUnit, wheelPixelsPerUnit, pageStep, step, keyStep].every(function (n) { return Number.isFinite(n) && n > 0; }))
                throw new RangeError('Invalid wheel range/sensitivity.');
            var position = 128, value = 128, disabled = false, drag = null, label = options.label;
            function node(tag, cls, text) {
                var element = doc.createElement(tag); element.className = cls;
                if (text !== undefined) element.textContent = text;
                return element;
            }
            var heading = node('div', 'impressions-wheel-heading');
            var letter = node('span', 'impressions-channel-letter', options.channel.toUpperCase());
            var channelName = node('span', 'impressions-channel-name', label);
            heading.append(letter, channelName);
            var readout = node('output', 'impressions-wheel-value', '128');
            readout.setAttribute('aria-hidden', 'true');
            var wheel = node('div', 'impressions-wheel');
            wheel.tabIndex = 0; wheel.setAttribute('role', 'spinbutton');
            wheel.setAttribute('aria-valuemin', String(minimum)); wheel.setAttribute('aria-valuemax', String(maximum));
            if (options.helpId) wheel.setAttribute('aria-describedby', options.helpId);
            var belt = node('div', 'impressions-wheel-belt'); belt.setAttribute('aria-hidden', 'true');
            for (var i = 0; i < 41; i++) belt.append(node('span', i % 5 === 0 ? 'major' : 'minor'));
            var indicator = node('span', 'impressions-wheel-indicator'); indicator.setAttribute('aria-hidden', 'true');
            wheel.append(belt, indicator);
            var steps = node('div', 'impressions-wheel-steps');
            var minus = node('button', 'impressions-step', '−'), plus = node('button', 'impressions-step', '+');
            minus.type = plus.type = 'button'; steps.append(minus, plus);
            host.replaceChildren(heading, readout, wheel, steps);
            function paint() {
                readout.textContent = options.format ? options.format(value) : String(value); wheel.setAttribute('aria-valuenow', String(value));
                if(options.ariaValueText)wheel.setAttribute('aria-valuetext',options.ariaValueText(value));
                // Ticks every two channel units, major marks every ten. The belt repeats seamlessly.
                var travel = options.visualPixelsPerUnit === undefined ? (position % 10) * 4 : position * options.visualPixelsPerUnit % 40;
                belt.style.transform = 'translate3d(0,' + (-travel).toFixed(3) + 'px,0)';
                host.dataset.value = String(value);
            }
            function cancelDrag() {
                if (!drag) return;
                var pointerId = drag.id; drag = null; wheel.classList.remove('dragging');
                if (wheel.hasPointerCapture && wheel.hasPointerCapture(pointerId)) wheel.releasePointerCapture(pointerId);
            }
            function allowed() { return !disabled && (!options.canChange || options.canChange()); }
            function normalize(next) { var rounded = Math.round(next / step) * step, span = maximum - minimum; if (wrap) rounded = minimum + ((rounded - minimum) % span + span) % span; return Number(Math.max(minimum, Math.min(maximum, rounded)).toFixed(10)); }
            function change(next) {
                if (!Number.isFinite(next) || !allowed()) return false;
                position = wrap ? next : Math.max(minimum, Math.min(maximum, next));
                var nextValue = normalize(position), changed = nextValue !== value;
                value = nextValue; paint();
                if (changed && options.onChange) options.onChange(value);
                return changed;
            }
            function listen(element, type, callback, extra) {
                element.addEventListener(type, callback, Object.assign({ signal: listeners.signal }, extra));
            }
            listen(wheel, 'pointerdown', function (event) {
                if (drag || event.isPrimary === false || event.button !== 0 || !allowed()) return;
                event.preventDefault(); wheel.focus({ preventScroll: true });
                drag = { id: event.pointerId, y: event.clientY };
                wheel.setPointerCapture(event.pointerId); wheel.classList.add('dragging');
            });
            listen(wheel, 'pointermove', function (event) {
                if (!drag || drag.id !== event.pointerId) return;
                event.preventDefault();
                var delta = drag.y - event.clientY; drag.y = event.clientY;
                change(position + delta / (event.shiftKey || options.isFine && options.isFine() ? finePixelsPerUnit : pixelsPerUnit));
            });
            ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) {
                listen(wheel, type, function (event) { if (drag && drag.id === event.pointerId) cancelDrag(); });
            });
            listen(window, 'blur', cancelDrag);
            listen(wheel, 'wheel', function (event) {
                // Preserve browser pinch/zoom. Only an enabled control owns ordinary scroll gestures.
                if (event.ctrlKey || event.metaKey || !allowed() || !event.deltaY) return;
                event.preventDefault();
                var pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? wheel.clientHeight : 1);
                change(position - pixels / (event.shiftKey || options.isFine && options.isFine() ? 96 : wheelPixelsPerUnit));
            }, { passive: false });
            listen(wheel, 'keydown', function (event) {
                if (event.ctrlKey || event.metaKey || event.altKey) return;
                var next;
                if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = value + (event.shiftKey ? step : keyStep);
                else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = value - (event.shiftKey ? step : keyStep);
                else if (event.key === 'PageUp') next = value + pageStep;
                else if (event.key === 'PageDown') next = value - pageStep;
                else if (event.key === 'Home') next = minimum;
                else if (event.key === 'End') next = wrap ? maximum - step : maximum;
                else return;
                if (!allowed()) return;
                event.preventDefault(); change(next);
            });
            listen(minus, 'click', function () { change(value - step); });
            listen(plus, 'click', function () { change(value + step); });
            function setLabel(nextLabel) {
                label = nextLabel; channelName.textContent = label; wheel.setAttribute('aria-label', label);
                if(options.ariaValueText)wheel.setAttribute('aria-valuetext',options.ariaValueText(value));
                minus.setAttribute('aria-label', label + ' −' + step); plus.setAttribute('aria-label', label + ' +' + step);
            }
            function setDisabled(next) {
                disabled = !!next; host.dataset.disabled = String(disabled);
                wheel.setAttribute('aria-disabled', String(disabled)); wheel.tabIndex = disabled ? -1 : 0;
                minus.disabled = plus.disabled = disabled;
                if (disabled) cancelDrag();
            }
            function setValue(next) {
                if (!Number.isFinite(next)) throw new TypeError('Wheel value must be finite.');
                position = value = normalize(next); cancelDrag(); paint();
            }
            function setRange(min, max) {
                if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max) throw new RangeError('Invalid wheel range.');
                minimum = min; maximum = max; wheel.setAttribute('aria-valuemin', String(min)); wheel.setAttribute('aria-valuemax', String(max)); setValue(value);
            }
            setLabel(label); setValue(options.value === undefined ? 128 : options.value); setDisabled(options.disabled);
            return { setValue: setValue, setDisabled: setDisabled, setLabel: setLabel, setRange: setRange,
                focus: function () { if (!disabled) wheel.focus({ preventScroll: true }); },
                value: function () { return value; },
                destroy: function () { cancelDrag(); listeners.abort(); } };
        },
    };
})();
