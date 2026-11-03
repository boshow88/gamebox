/* Local pointer/keyboard candle game. No microphone, network or persisted state. */
(function () {
    'use strict';
    var ORIGIN = { x: 240, y: 367 };
    var BASE_OFFSET = 70;
    var POSITIONS = [{ x: 112, y: 152 }, { x: 176, y: 152 }, { x: 240, y: 152 }, { x: 304, y: 152 }, { x: 368, y: 152 }];
    function footprintOnCake(point) {
        // Keep the entire wax base inside an inset of the visible top ellipse.
        return Math.pow((point.x - 240) / 164, 2) + Math.pow((point.y + BASE_OFFSET - 223) / 35, 2) <= 1;
    }
    function windHits(point, aim) {
        var dx = aim.x - ORIGIN.x, dy = aim.y - ORIGIN.y, length = Math.hypot(dx, dy);
        if (length < 10) return false;
        var px = point.x - ORIGIN.x, py = point.y - ORIGIN.y;
        var along = (px * dx + py * dy) / length, across = Math.abs(px * dy - py * dx) / length;
        return along > 0 && across <= 13 + along * 0.075;
    }
    function windDistance(point, aim) {
        var dx = aim.x - ORIGIN.x, dy = aim.y - ORIGIN.y;
        return Math.abs((point.x - ORIGIN.x) * dy - (point.y - ORIGIN.y) * dx) / (Math.hypot(dx, dy) || 1);
    }
    function planDodge(candle, aim, others) {
        var best = candle.point, bestScore = -Infinity;
        [-52, -26, 0, 26, 52].forEach(function (x) {
            [-12, 0, 12].forEach(function (y) {
                var point = { x: candle.home.x + x, y: candle.home.y + y };
                if (!footprintOnCake(point)) return;
                var crowding = 0;
                others.forEach(function (other) {
                    if (other === candle) return;
                    crowding += Math.max(0, 35 - Math.hypot(point.x - other.point.x, point.y - other.point.y)) * 2;
                });
                // Prefer space outside the current wind cone, with room for neighbors.
                var score = (windHits(point, aim) ? 0 : 60) + windDistance(point, aim) - crowding - Math.abs(y) * .12;
                if (score > bestScore) { bestScore = score; best = point; }
            });
        });
        return best;
    }
    function recoveryTotal(time) {
        var ramp = Math.min(time, .65);
        return .18 * time + (1.32 / .65) * ramp * ramp / 2 + 1.32 * Math.max(0, time - .65);
    }
    function stepCandle(candle, aim, dt, others) {
        if (candle.life <= 0) return;
        candle.cooldown = Math.max(0, candle.cooldown - dt);
        if (aim && windHits(candle.point, aim) && candle.cooldown === 0) {
            candle.destination = planDodge(candle, aim, others);
            candle.cooldown = .55;
        }
        if (candle.destination) {
            var dx = candle.destination.x - candle.point.x, dy = candle.destination.y - candle.point.y;
            var distance = Math.hypot(dx, dy), travel = Math.min(distance, 110 * dt);
            if (distance < .1) candle.destination = null;
            else candle.point = { x: candle.point.x + dx / distance * travel, y: candle.point.y + dy / distance * travel };
        }
        if (aim && windHits(candle.point, aim)) {
            candle.life = Math.max(0, candle.life - dt * 1.1); candle.missedFor = 0;
        } else {
            var previous = candle.missedFor;
            candle.missedFor = Math.min(.65, previous + dt);
            candle.life = Math.min(1, candle.life + recoveryTotal(previous + dt) - recoveryTotal(previous));
        }
    }
    function svgNode(tag, attributes) {
        var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.keys(attributes || {}).forEach(function (key) { node.setAttribute(key, attributes[key]); });
        return node;
    }
    function mount(options) {
        var root = options.element, copy = options.copy, reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var alive = true, finished = false, frame = null, aim = null, pointer = null, last = 0, keyboardInput = false;
        var angle = 0, keys = { left: false, right: false, blow: false };
        root.classList.add('birthday-cake-game');
        var stage = document.createElement('div'); stage.className = 'birthday-cake-stage';
        stage.tabIndex = 0; stage.setAttribute('role', 'group'); stage.setAttribute('aria-label', copy.keyboardControls);
        var svg = svgNode('svg', { viewBox: '0 0 480 390', 'aria-hidden': 'true', focusable: 'false' });
        svg.innerHTML = '<defs><linearGradient id="birthday-cake-side" x2="0" y2="1"><stop stop-color="#e6b3a6"/><stop offset="1" stop-color="#a77583"/></linearGradient><linearGradient id="birthday-cake-top" x2="0" y2="1"><stop stop-color="#fff0d0"/><stop offset="1" stop-color="#e1c295"/></linearGradient><radialGradient id="birthday-flame-glow"><stop stop-color="#f9d58b" stop-opacity=".3"/><stop offset="1" stop-color="#f9d58b" stop-opacity="0"/></radialGradient></defs>'
            + '<ellipse cx="240" cy="330" rx="207" ry="34" fill="#080b16" opacity=".45"/><ellipse cx="240" cy="321" rx="195" ry="29" fill="#d1b27e"/><ellipse cx="240" cy="315" rx="195" ry="29" fill="#f0d9a9"/>'
            + '<path d="M64 226v66c0 26 79 47 176 47s176-21 176-47v-66Z" fill="url(#birthday-cake-side)"/><path d="M65 278c0 26 78 47 175 47s175-21 175-47" fill="none" stroke="#f9dcbb" stroke-width="7"/>'
            + '<path d="M64 223v18c0 10 11 14 18 15v18c0 13 18 14 18 0v-9l27 8v19c0 15 19 15 19 0v-14l30 5v20c0 15 20 15 20 0v-18l35 2v17c0 15 20 15 20 0v-17l34-2v15c0 14 19 14 19 0v-19l31-5v12c0 14 18 14 18 0v-17l30-9v8c0 13 17 13 17 0v-18c8-4 16-11 16-19Z" fill="#f7e3bf"/>'
            + '<ellipse cx="240" cy="223" rx="176" ry="47" fill="url(#birthday-cake-top)"/><ellipse cx="240" cy="223" rx="157" ry="36" fill="none" stroke="#fff5db" stroke-width="2" opacity=".65"/>'
            + '<g fill="#b26d80"><ellipse cx="91" cy="222" rx="10" ry="7"/><ellipse cx="146" cy="247" rx="10" ry="7"/><ellipse cx="240" cy="257" rx="10" ry="7"/><ellipse cx="334" cy="247" rx="10" ry="7"/><ellipse cx="389" cy="222" rx="10" ry="7"/></g>'
            + '<g fill="#fff4d8"><circle cx="120" cy="210" r="4"/><circle cx="173" cy="230" r="4"/><circle cx="293" cy="232" r="4"/><circle cx="362" cy="210" r="4"/></g>';
        var candleLayer = svgNode('g', { class: 'birthday-candles' }); svg.append(candleLayer);
        var depthOrder = '';
        var candles = POSITIONS.map(function (position, index) {
            var group = svgNode('g', { class: 'birthday-candle', 'data-candle': index });
            var x = position.x, y = position.y;
            group.innerHTML = '<rect class="birthday-candle-body" x="' + (x - 5) + '" y="' + (y + 19) + '" width="10" height="' + (BASE_OFFSET - 19) + '" rx="3" fill="' + (index % 2 ? '#9dc3c5' : '#e7bdcc') + '"/>'
                + '<path d="M' + (x - 4) + ' ' + (y + 29) + 'l8-5m-8 19 8-5m-8 19 8-5" stroke="#fff2d4" stroke-width="2" opacity=".7"/>'
                + '<path d="M' + x + ' ' + (y + 21) + 'v-10" stroke="#4d3c42" stroke-width="2"/>'
                + '<g class="birthday-flame"><circle cx="' + x + '" cy="' + y + '" r="33" fill="url(#birthday-flame-glow)"/><path d="M' + x + ' ' + (y + 14) + 'c-17-2-12-18 0-31 5 13 17 27 0 31Z" fill="#f4bb66"/><path d="M' + x + ' ' + (y + 12) + 'c-8-1-6-11 0-17 4 8 7 16 0 17Z" fill="#fff0b9"/></g>'
                + '<path class="birthday-smoke" d="M' + x + ' ' + (y + 9) + 'c-16-14 13-19-1-35s10-21 2-32" fill="none" stroke="#d6d3df" stroke-width="2" stroke-linecap="round"/>';
            var flame = group.querySelector('.birthday-flame'); flame.style.transformOrigin = x + 'px ' + (y + 15) + 'px';
            candleLayer.append(group);
            return { home: position, point: { x: x, y: y }, group: group, flame: flame, index: index,
                life: 1, cooldown: .16, missedFor: 0, destination: null };
        });
        var wind = svgNode('g', { class: 'birthday-wind', 'aria-hidden': 'true' });
        var strokes = [-1, 0, 1].map(function () { var line = svgNode('path', { fill: 'none' }); wind.append(line); return line; });
        svg.append(wind);
        var source = svgNode('g', { class: 'birthday-wind-source', transform: 'translate(240 367)' });
        source.innerHTML = '<circle r="17" fill="#1e2638" stroke="#eed5a250"/><path d="M-9-5H4c7 0 7-8 1-8M-9 0H9c8 0 8 9 1 9M-9 5H0" fill="none" stroke="#e8c998" stroke-width="1.6" stroke-linecap="round"/>';
        svg.append(source); stage.prepend(svg);
        var instruction = document.createElement('p'); instruction.className = 'birthday-blow-hint'; instruction.textContent = copy.blowHint;
        var status = document.createElement('p'); status.className = 'birthday-candle-status'; status.setAttribute('role', 'status');
        status.textContent = copy.remaining(candles.length);
        root.append(stage, instruction, status);
        function sortDepth() {
            var sorted = candles.slice().sort(function (a, b) { return (a.point.y + BASE_OFFSET) - (b.point.y + BASE_OFFSET) || a.index - b.index; });
            var order = sorted.map(function (candle) { return candle.index; }).join(',');
            if (order === depthOrder) return;
            depthOrder = order;
            sorted.forEach(function (candle) { candleLayer.append(candle.group); });
        }
        sortDepth();
        function renderCandle(candle, hit) {
            candle.group.setAttribute('transform', 'translate(' + (candle.point.x - candle.home.x) + ' ' + (candle.point.y - candle.home.y) + ')');
            var scale = .55 + candle.life * .45;
            candle.flame.style.transform = 'scale(' + scale + ')' + (!reduced && hit ? ' rotate(' + ((aim.x - ORIGIN.x) / 14) + 'deg) scaleY(.72)' : '');
            candle.flame.style.opacity = candle.life > 0 ? .25 + candle.life * .75 : 0;
        }
        function needsFrame() {
            return alive && !finished && document.visibilityState !== 'hidden'
                && (aim || keys.left || keys.right || candles.some(function (candle) { return candle.life > 0 && (candle.life < 1 || candle.destination); }));
        }
        function wake() {
            if (frame === null && needsFrame()) { last = performance.now(); frame = requestAnimationFrame(tick); }
        }
        function stop() {
            aim = null; pointer = null; keyboardInput = false; keys.left = keys.right = keys.blow = false;
            wind.classList.remove('is-blowing', 'is-aiming');
            if (frame !== null) cancelAnimationFrame(frame); frame = null;
            candles.forEach(function (candle) { renderCandle(candle, false); });
            sortDepth();
            wake();
        }
        function tick(time) {
            frame = null;
            if (!alive || finished || document.visibilityState === 'hidden') { stop(); return; }
            var dt = Math.min(.05, Math.max(0, (time - last) / 1000)); last = time;
            if (keyboardInput) updateKeyboard(dt);
            var changed = false, wasKeyboard = keyboardInput;
            candles.forEach(function (candle) {
                if (candle.life <= 0) return;
                stepCandle(candle, aim, dt, candles);
                renderCandle(candle, aim && windHits(candle.point, aim));
                if (candle.life === 0) {
                    candle.group.classList.add('is-out'); changed = true;
                }
            });
            sortDepth();
            var remaining = candles.filter(function (candle) { return candle.life > 0; }).length;
            if (changed) status.textContent = copy.remaining(remaining);
            if (!remaining && !finished) {
                finished = true; stop(); options.onComplete({ keyboard: wasKeyboard }); return;
            }
            if (needsFrame()) frame = requestAnimationFrame(tick);
        }
        function drawWind(point) {
            var dx = point.x - ORIGIN.x, dy = point.y - ORIGIN.y, length = Math.hypot(dx, dy) || 1;
            var ux = dx / length, uy = dy / length;
            [-1, 0, 1].forEach(function (offset, i) {
                var sx = ORIGIN.x - uy * offset * 9, sy = ORIGIN.y + ux * offset * 9;
                strokes[i].setAttribute('d', 'M' + sx + ' ' + sy + 'Q' + (sx + ux * 110 - uy * offset * 9) + ' ' + (sy + uy * 110 + ux * offset * 9) + ' ' + (sx + ux * 310) + ' ' + (sy + uy * 310));
            });
        }
        function pointAt(point) {
            if (!alive || finished || document.visibilityState === 'hidden') return;
            aim = point; keyboardInput = false; keys.left = keys.right = keys.blow = false;
            angle = Math.max(-.82, Math.min(.82, Math.atan2(point.x - ORIGIN.x, ORIGIN.y - point.y)));
            drawWind(point); wind.classList.remove('is-aiming'); wind.classList.add('is-blowing');
            wake();
        }
        function updateKeyboard(dt) {
            angle = Math.max(-.82, Math.min(.82, angle + (Number(keys.right) - Number(keys.left)) * .95 * dt));
            var point = { x: ORIGIN.x + Math.sin(angle) * 310, y: ORIGIN.y - Math.cos(angle) * 310 };
            aim = keys.blow ? point : null;
            drawWind(point); wind.classList.toggle('is-blowing', keys.blow);
            wind.classList.toggle('is-aiming', !keys.blow && (keys.left || keys.right));
        }
        function fromPointer(event) {
            var bounds = stage.getBoundingClientRect();
            return { x: (event.clientX - bounds.left) / bounds.width * 480, y: (event.clientY - bounds.top) / bounds.height * 390 };
        }
        stage.addEventListener('pointerdown', function (event) {
            if (pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
            event.preventDefault(); pointer = event.pointerId;
            stage.focus({ preventScroll: true });
            try { stage.setPointerCapture(pointer); } catch (e) { /* synthetic test pointers have no capture */ }
            pointAt(fromPointer(event));
        });
        stage.addEventListener('pointermove', function (event) { if (event.pointerId === pointer) pointAt(fromPointer(event)); });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) {
            stage.addEventListener(name, function (event) { if (event.pointerId === pointer) stop(); });
        });
        stage.addEventListener('keydown', function (event) {
            var key = event.key === 'ArrowLeft' ? 'left' : event.key === 'ArrowRight' ? 'right' : event.key === ' ' ? 'blow' : null;
            if (!key || pointer !== null || !alive || finished || document.hidden || event.altKey || event.ctrlKey || event.metaKey) return;
            event.preventDefault(); keyboardInput = true; keys[key] = true; updateKeyboard(0); wake();
        });
        stage.addEventListener('keyup', function (event) {
            var key = event.key === 'ArrowLeft' ? 'left' : event.key === 'ArrowRight' ? 'right' : event.key === ' ' ? 'blow' : null;
            if (!key || !keyboardInput) return;
            event.preventDefault(); keys[key] = false; updateKeyboard(0); wake();
        });
        stage.addEventListener('focusout', stop);
        function onVisibility() { if (document.visibilityState === 'hidden') stop(); else wake(); }
        document.addEventListener('visibilitychange', onVisibility); window.addEventListener('blur', stop);
        return {
            focus: function () { stage.focus({ preventScroll: true }); },
            setCopy: function (next) {
                copy = next; instruction.textContent = copy.blowHint;
                stage.setAttribute('aria-label', copy.keyboardControls);
                status.textContent = copy.remaining(candles.filter(function (candle) { return candle.life > 0; }).length);
            },
            destroy: function () { alive = false; stop(); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('blur', stop); root.replaceChildren(); },
        };
    }
    window.GameBoxBirthdayCake = { mount: mount, windHits: windHits, stepCandle: stepCandle, footprintOnCake: footprintOnCake };
})();
