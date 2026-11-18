/* Shared-pool multi-group SVG rendering and Quantity-only controls. No network or scoring authority. */
(function () {
    'use strict';
    window.MemoryGroupDots = { create: function (host) {
        var doc = host.ownerDocument, ns = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(ns, 'svg'), pools = null, groups = [], nodes = {}, signature = null, radius, renderingVersion = 1;
        svg.setAttribute('viewBox', '0 0 400 300'); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); svg.setAttribute('role', 'img'); host.append(svg);
        function clear() { svg.replaceChildren(); pools = null; groups = []; nodes = {}; signature = null; }
        function shape(group, point) {
            var cx = point.x * 400, cy = point.y * 300, r = radius * 400, element;
            if (renderingVersion >= 2) {
                var descriptor = window.MemoryQuantityAppearance.shape(group, point, radius);
                element = doc.createElementNS(ns, descriptor.tag); Object.keys(descriptor.attributes).forEach(function (name) { element.setAttribute(name, descriptor.attributes[name]); }); element.style.fill = group.color; return element;
            }
            if (group.shape === 'circle') { element = doc.createElementNS(ns, 'circle'); element.setAttribute('cx', cx); element.setAttribute('cy', cy); element.setAttribute('r', r); }
            else if (group.shape === 'square') { element = doc.createElementNS(ns, 'rect'); var side = r * Math.SQRT2; element.setAttribute('x', cx - side / 2); element.setAttribute('y', cy - side / 2); element.setAttribute('width', side); element.setAttribute('height', side); }
            else { element = doc.createElementNS(ns, 'polygon'); element.setAttribute('points', cx + ',' + (cy - r) + ' ' + (cx + Math.sqrt(3) * r / 2) + ',' + (cy + r / 2) + ' ' + (cx - Math.sqrt(3) * r / 2) + ',' + (cy + r / 2)); }
            element.style.fill = group.color; return element;
        }
        return { element: svg, clear: clear, setPools: function (next, identities, nextRadius, label, nextRenderingVersion) {
            nextRenderingVersion = nextRenderingVersion || 1;
            var nextSignature = identities.map(function (group) { return group.id + ':' + group.shape + ':' + group.color; }).join('|') + ':' + nextRadius + ':' + nextRenderingVersion;
            if (next !== pools || signature !== nextSignature) {
                clear(); pools = next; groups = identities; radius = nextRadius; renderingVersion = nextRenderingVersion; signature = nextSignature;
                groups.forEach(function (group) { var g = doc.createElementNS(ns, 'g'); g.dataset.group = group.id; nodes[group.id] = g; svg.append(g); });
            }
            svg.setAttribute('aria-label', label);
        }, setCounts: function (counts) {
            groups.forEach(function (group) { var count = counts[group.id], g = nodes[group.id], pool = pools[group.id];
                if (!Number.isInteger(count) || count < 0 || count > pool.length) throw new RangeError('Invalid rendered group count.');
                while (g.children.length > count) g.lastElementChild.remove();
                while (g.children.length < count) g.append(shape(group, pool[g.children.length]));
            });
        }, destroy: function () { clear(); svg.remove(); } };
    } };
    var AC = window.ArcadeCommon; if (!AC) return;
    var Groups = window.MemoryQuantityGroups;
    Object.assign(AC.i18n.STRINGS.en, { memoryGroupCircle: 'Circles', memoryGroupSquare: 'Squares', memoryGroupTriangle: 'Triangles', memoryGroup: 'Group', memoryGroupTarget: 'Original', memoryGroupAnswer: 'Answer', memoryGroupError: 'Error',
        memoryGroupsMemorizeTitle: 'Remember every group', memoryGroupsMemorizeMessage: 'Notice how many of each shape fill the board.', memoryGroupsAnswerTitle: 'Recreate every group', memoryGroupsAnswerMessage: 'Adjust each wheel to bring the full arrangement back.',
        memoryGroupsHelp: 'Remember the quantity of each shape. Every group has its own wheel and fixed positions. Matching all counts recreates the original board.', memoryGroupsControls: 'One wheel per shape · drag to adjust · ± / arrows for one · Page Up / Down for 25', memoryGroupsScore: 'Accuracy uses RMS relative error across groups. The first target and answer positions are shared; only counts change.' });
    Object.assign(AC.i18n.STRINGS.zh, { memoryGroupCircle: '圓形', memoryGroupSquare: '方形', memoryGroupTriangle: '三角形', memoryGroup: '形狀', memoryGroupTarget: '原本', memoryGroupAnswer: '答案', memoryGroupError: '誤差',
        memoryGroupsMemorizeTitle: '記住每組的數量', memoryGroupsMemorizeMessage: '留意每種形狀在圖中的數量。', memoryGroupsAnswerTitle: '重現各組的數量', memoryGroupsAnswerMessage: '調整每個滾輪，把整張圖重現出來。',
        memoryGroupsHelp: '記住每種形狀的數量。每組都有自己的滾輪與固定位置；所有數量都正確時，就會重現原本的整張圖。', memoryGroupsControls: '每種形狀一個滾輪 · 拖曳調整 · ±／方向鍵微調 1 · Page Up／Down 調整 25', memoryGroupsScore: '準確度取決於各組相對誤差的 RMS；記憶與作答共用位置，只改變數量。' });
    function label(id) { return AC.i18n.t('memoryGroup' + id[0].toUpperCase() + id.slice(1)); }
    window.MemoryQuantityGroupsView = { create: function (options) {
        var root = options.root, doc = root.ownerDocument, t = AC.i18n.t, context = null, key = null, pools = null, wheelKey = null, wheels = {}, listeners = new AbortController();
        function get(id) { return root.querySelector('#memory-' + id); }
        var preview = window.MemoryGroupDots.create(get('group-preview')), target = window.MemoryGroupDots.create(get('group-target')), answer = window.MemoryGroupDots.create(get('group-answer'));
        function text(e, value) { if (e.textContent !== value) e.textContent = value; }
        function node(tag, cls, value) { var e = doc.createElement(tag); e.className = cls || ''; if (value !== undefined) e.textContent = value; return e; }
        function mark(group) { var e = node('i', 'memory-group-mark ' + group.shape); e.style.backgroundColor = group.color; e.setAttribute('aria-hidden', 'true'); return e; }
        function update(state) {
            context = state;
            if (!state || !state.question || state.question.type !== 'quantity' || state.question.version !== 2) {
                Object.values(wheels).forEach(function (wheel) { wheel.setDisabled(true); }); preview.clear(); target.clear(); answer.clear(); get('group-result-rows').replaceChildren(); key = null; return;
            }
            var question = state.question, generation = state.config.quantity.generation, nextKey = question.seed + ':' + question.variant + ':' + JSON.stringify(generation);
            var appearance = window.MemoryQuantityAppearance, visualVersion = appearance.version(question), displayGroups = question.groups.map(function (group) { return appearance.group(group, visualVersion); });
            var drawRadius = visualVersion >= 2 ? appearance.radius(generation, question.groups.length) : generation.dotRadius;
            if (key !== nextKey) { pools = Groups.createPools(question.seed, question.variant, generation); key = nextKey; }
            var nextWheelKey = question.variant + ':' + generation.poolSize + ':' + visualVersion;
            if (wheelKey !== nextWheelKey) {
                Object.values(wheels).forEach(function (wheel) { wheel.destroy(); }); wheels = {}; wheelKey = nextWheelKey; get('group-wheels').replaceChildren();
                displayGroups.forEach(function (group) {
                    var host = node('div', 'memory-channel'); host.id = 'memory-wheel-group-' + group.id; host.style.setProperty('--channel', group.color); host.style.setProperty('--channel-rgb', '180,150,230'); get('group-wheels').append(host);
                    wheels[group.id] = window.MemoryWheel.create({ element: host, channel: { circle: '●', square: '■', triangle: '▲' }[group.shape], label: label(group.id), value: state.draft[group.id], min: 0, max: generation.poolSize,
                        pixelsPerUnit: 0.75, wheelPixelsPerUnit: 3, pageStep: 25, disabled: true, helpId: 'memory-group-help', canChange: options.canChange,
                        onChange: function (value) { options.onChange(group.id, value); if (context && context.phase === 'answer') preview.setCounts(context.draft); } });
                });
            }
            get('group-wheels').style.setProperty('--group-count', question.groups.length);
            get('group-legend').replaceChildren.apply(get('group-legend'), displayGroups.map(function (group) { var span = node('span', 'memory-group-label'); span.append(mark(group), node('span', '', label(group.id))); return span; }));
            var zeros = Object.fromEntries(question.groups.map(function (group) { return [group.id, 0]; }));
            preview.setPools(pools, displayGroups, drawRadius, t('memoryQuantity'), visualVersion);
            preview.setCounts(state.phase === 'memorize' ? question.target : ['answer', 'waiting'].includes(state.phase) ? state.draft : zeros);
            get('group-cover').hidden = ['answer', 'waiting', 'results'].includes(state.phase);
            text(get('group-note'), t(state.phase === 'memorize' ? 'memoryMemorizeCover' : 'memoryPrepareCover'));
            question.groups.forEach(function (group) { var wheel = wheels[group.id]; if (wheel.value() !== state.draft[group.id]) wheel.setValue(state.draft[group.id]); wheel.setDisabled(state.phase !== 'answer' || state.active === false); wheel.setLabel(label(group.id)); });
            if (state.phase === 'results') {
                target.setPools(pools, displayGroups, drawRadius, t('memoryOriginalQuantity'), visualVersion); target.setCounts(question.target);
                answer.setPools(pools, displayGroups, drawRadius, t('memoryYourQuantity'), visualVersion); answer.setCounts(state.answer || zeros);
                var grade = state.answer ? Groups.grade(question, state.answer, state.config.quantity.multi.scoring, generation) : null;
                get('group-result-rows').replaceChildren.apply(get('group-result-rows'), displayGroups.map(function (group) {
                    var tr = node('tr'), identity = node('td'); identity.append(mark(group), node('span', '', label(group.id))); tr.append(identity);
                    [question.target[group.id], state.answer ? state.answer[group.id] : '—', grade && grade.valid ? (grade.errors[group.id] * 100).toFixed(1) + '%' : '—'].forEach(function (value) { tr.append(node('td', '', String(value))); }); return tr;
                }));
            } else { target.clear(); answer.clear(); get('group-result-rows').replaceChildren(); }
        }
        return { update: update, focus: function () { var first = Object.values(wheels)[0]; if (first) first.focus(); }, destroy: function () { listeners.abort(); Object.values(wheels).forEach(function (wheel) { wheel.destroy(); }); preview.destroy(); target.destroy(); answer.destroy(); } };
    } };
})();
