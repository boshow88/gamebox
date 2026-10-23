/** Unshackle UI. Uses the puzzle shell for language, sound, timer and solves. */
(function () {
    'use strict';
    const PC = window.PuzzleCommon, Engine = window.UnshackleEngine;
    const DIFFICULTIES = ['easy', 'medium', 'hard'];
    const Generator = window.PuzzleGenerators.unshackle;
    const GI = window.PuzzleGenerators.unshackleInternals;
    const rawInitial = PC.share.readParams();
    const urlInitial = GI.SIZES.includes(rawInitial.size) && DIFFICULTIES.includes(rawInitial.difficulty)
        && Number.isInteger(rawInitial.seed) ? rawInitial : null;
    let pendingSeed = urlInitial ? urlInitial.seed : null;
    const RECENT_KEY = PC.storage.storageKey('recent:unshackle:v1');
    const storedRecent = PC.storage.readJSON(RECENT_KEY, []);
    let recent = Array.isArray(storedRecent) ? storedRecent.filter(p => p && typeof p.fingerprint === 'string' && typeof p.structure === 'string').slice(-24) : [];
    Object.assign(PC.i18n.STRINGS.en, {
        unlockName: 'Unshackle', unlockPrototype: 'Prototype', unlockCount: 'Pieces',
        unlockSettings: (diff, count) => `${diff} · ${count} pieces`,
        unlockBoard: '3D interlocking puzzle. Drag or use arrow keys to rotate; press 1 through 9 to pull a piece.',
        unlockCaption: 'Drag to rotate · Tap to pull', unlockViewReset: 'Reset view',
        unlockCamera: 'Rotate the view', unlockLeft: 'Rotate left', unlockRight: 'Rotate right',
        unlockUp: 'Rotate up', unlockDown: 'Rotate down', unlockPieces: 'Pull a piece',
        unlockPiece: (id, removed) => `Piece ${id}${removed ? ' · removed' : ' · pull toward its white cap'}`,
        unlockProgress: (n, total) => `${n} / ${total} removed`,
        unlockReady: 'Follow the white caps. Which piece can leave first?',
        unlockBlocked: (id, blockers) => `Piece ${id} is blocked by ${blockers.join(', ')}. Try another angle.`,
        unlockHint: id => `Piece ${id} has a clear path toward its white cap.`,
        unlockRemoved: id => `Piece ${id} is free.`, unlockUndo: 'Last move restored.',
        unlockComplete: 'All clear.', unlockNext: 'Next puzzle',
        unlockWinDetail: (diff, count, time) => `${diff} · ${count} pieces · ${time}`,
        unlockGenerateFailed: 'Could not prepare this puzzle. Press New Game to try again.',
        unlockCode: seed => `Puzzle ${seed}`,
        unlockWebGL: '3D rendering is unavailable. Enable WebGL or try another browser.',
        unlockContextLost: '3D rendering was interrupted. Waiting for the browser to restore it…',
        unlockHelp1: 'Remove every piece. Each slides straight toward its white end cap.',
        unlockHelp2: 'Drag to rotate the puzzle. Tap a piece or its numbered button to pull it out. A blocked piece stays in place; its blockers turn amber.',
        unlockHelp3: 'Pinch or scroll to zoom. Keyboard: arrows to rotate, 1–9 to pull, Home to reset the view, Ctrl+Z to undo. New Game generates a fresh puzzle; Share copies this exact puzzle.',
    });
    Object.assign(PC.i18n.STRINGS.zh, {
        unlockName: '解開枷鎖', unlockPrototype: '原型', unlockCount: '零件數',
        unlockSettings: (diff, count) => `${diff}・${count} 個零件`,
        unlockBoard: '立體解鎖盤面。拖曳或用方向鍵旋轉；按 1 至 9 抽出零件。',
        unlockCaption: '拖曳旋轉 · 點擊抽出', unlockViewReset: '視角歸位',
        unlockCamera: '旋轉視角', unlockLeft: '向左旋轉', unlockRight: '向右旋轉',
        unlockUp: '向上旋轉', unlockDown: '向下旋轉', unlockPieces: '抽出零件',
        unlockPiece: (id, removed) => `零件 ${id}${removed ? '・已抽出' : '・朝白色端點抽出'}`,
        unlockProgress: (n, total) => `${n} / ${total} 已解開`,
        unlockReady: '沿著白色端點的方向，找出能先抽出的零件。',
        unlockBlocked: (id, blockers) => `零件 ${id} 被 ${blockers.join('、')} 擋住了，轉個角度看看。`,
        unlockHint: id => `零件 ${id} 朝白色端點的路徑已暢通。`,
        unlockRemoved: id => `零件 ${id} 解開了。`, unlockUndo: '已復原上一步。',
        unlockComplete: '全部解開。', unlockNext: '下一題',
        unlockWinDetail: (diff, count, time) => `${diff}・${count} 個零件・${time}`,
        unlockGenerateFailed: '暫時無法產生這道題目，請按「新局」再試一次。',
        unlockCode: seed => `題目 ${seed}`,
        unlockWebGL: '目前無法顯示 3D 畫面，請啟用 WebGL 或換個瀏覽器。',
        unlockContextLost: '3D 畫面暫時中斷，等待瀏覽器恢復中…',
        unlockHelp1: '抽出所有零件即過關。每個零件只能朝白色端點的方向直線移動。',
        unlockHelp2: '拖曳旋轉整組枷鎖，點擊零件或下方編號即可抽出。被擋住的零件會留在原位，阻擋它的零件會亮成琥珀色。',
        unlockHelp3: '雙指縮放或滾輪調整遠近。鍵盤：方向鍵旋轉、1–9 抽出、Home 視角歸位、Ctrl+Z 復原。「新局」產生新題；「分享」複製相同題目的連結。',
    });
    // custom: two rounded links separating along a diagonal.
    const icon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 15-2 2a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m2 8a3.5 3.5 0 0 0 5 0l4-4a3.5 3.5 0 0 0-5-5l-2 2M9 3v2m-6 0 2 2m14 10 2 2m-6 0v2"/></svg>';
    document.querySelector('[data-icon="unlink"]').innerHTML = icon;
    const $ = id => document.getElementById(id), t = (...args) => PC.i18n.t(...args);
    const canvas = $('board');
    let view;
    try { view = window.UnshackleView.create(canvas); } catch (_) { view = null; }
    if (!view) {
        canvas.hidden = true; $('unlock-error').hidden = false;
        document.querySelectorAll('.action-row button, .toolbar-action button, .view-controls button').forEach(b => { b.disabled = true; });
        return;
    }

    const state = { difficulty: urlInitial ? urlInitial.difficulty : 'easy', size: urlInitial ? urlInitial.size : 8,
        puzzle: null, pieces: [], graph: [], removed: new Set(), won: false,
        animation: null, blocked: null, blockers: [], highlight: null, hover: null };
    let shell, frame = 0, hintOn = false, contextLost = false, generating = false;
    let feedback = { key: 'unlockReady', args: [] };
    let lastTime = '';
    const history = PC.history.create({
        snapshot: () => [...state.removed],
        restore: removed => {
            state.animation = null;
            if (state.won) { state.won = false; shell.clearWin(); }
            state.removed = new Set(removed);
            clearFeedback(); say('unlockUndo'); syncUI(); invalidate();
        },
    });

    function say(key, ...args) {
        feedback = { key, args };
        $('unlock-feedback').textContent = t(key, ...args);
        $('unlock-feedback').classList.toggle('blocked', key === 'unlockBlocked');
    }
    function clearFeedback() {
        state.blocked = null; state.blockers = []; state.highlight = null; hintOn = false;
    }
    function blockersFor(p) {
        return state.graph[state.pieces.indexOf(p)].filter(id => !state.removed.has(id));
    }
    function syncLevelReadout() {
        const current = t('unlockSettings', t(state.difficulty), state.size);
        const pending = t('unlockSettings', t(shell.difficulty), shell.size), readout = $('level-readout');
        readout.classList.toggle('pending', pending !== current);
        readout.replaceChildren();
        if (pending === current) readout.textContent = current;
        else {
            [['readout-current', current], ['readout-arrow', ' → '], ['readout-next', pending]].forEach(([className, text]) => {
                const span = document.createElement('span'); span.className = className; span.textContent = text; readout.appendChild(span);
            });
        }
        for (const [id, applied, pendingValue] of [['difficulty-seg', state.difficulty, shell.difficulty], ['size-seg', String(state.size), String(shell.size)]]) {
            $(id).querySelectorAll('button').forEach(b => {
                b.setAttribute('aria-checked', b.dataset.value === pendingValue ? 'true' : 'false');
                b.classList.toggle('committed', b.dataset.value === applied);
            });
        }
    }
    function syncUI() {
        $('unlock-progress').textContent = t('unlockProgress', state.removed.size, state.pieces.length);
        const locked = generating || contextLost;
        $('undo-btn').disabled = !history.canUndo() || !!state.animation || locked;
        $('hint-btn').disabled = state.won || !!state.animation || locked || !state.puzzle;
        document.querySelectorAll('#new-game-btn, #reset-btn, #share-btn, #next-level-btn, #difficulty-seg button, #size-seg button').forEach(b => { b.disabled = locked; });
        $('reset-btn').disabled = locked || !state.puzzle;
        $('share-btn').disabled = locked || !state.puzzle;
        $('puzzle-code').textContent = state.puzzle ? t('unlockCode', state.puzzle.seed.toString(36)) : '';
        $('unlock-win').hidden = !state.won;
        $('unlock-win-detail').textContent = t('unlockWinDetail', t(state.difficulty), state.size, lastTime);
        $('next-level-btn').textContent = t('unlockNext');
        for (const p of state.pieces) {
            const button = $(`piece-${p.id}`), removed = state.removed.has(p.id);
            if (!button) continue;
            button.disabled = removed || !!state.animation || locked;
            button.classList.toggle('removed', removed);
            button.classList.toggle('hinted', p.id === state.highlight);
            button.setAttribute('aria-label', t('unlockPiece', p.id, removed));
            button.title = t('unlockPiece', p.id, removed);
        }
        syncLevelReadout();
    }

    function draw(now) {
        frame = 0;
        if (contextLost) return;
        const anim = state.animation;
        if (anim) {
            const p = Math.min(1, (now - anim.start) / (anim.blocked ? 340 : 680));
            anim.offset = anim.blocked ? Math.sin(p * Math.PI) * 0.025 : anim.distance * p * p;
            if (p === 1) {
                state.animation = null;
                if (!anim.blocked) {
                    state.removed.add(anim.id);
                    if (state.removed.size === state.pieces.length) {
                        state.won = true; recordWin(); lastTime = $('timer').textContent;
                        say('unlockComplete');
                    } else say('unlockRemoved', anim.id);
                }
                syncUI();
            }
        }
        // Sample all cap centres in one depth-tested ID pass. Labels disappear
        // behind other pieces rather than looking attached to the foreground.
        // fit() establishes the current camera before projection after a resize.
        if (!state.pieces.length) { view.render(state); return; }
        view.render(state);
        const fittedPositions = state.pieces.map(p => {
            const a = state.animation && state.animation.id === p.id ? state.animation.offset : 0;
            return view.project(Engine.math.add(p.knob, Engine.math.mul(p.dir, a)));
        });
        const visible = view.pickMany(fittedPositions, state);
        for (const [i, p] of state.pieces.entries()) {
            const marker = $(`marker-${p.id}`), pos = fittedPositions[i];
            marker.hidden = state.removed.has(p.id) || state.won || visible[i] !== p.id;
            marker.style.left = `${pos.x}px`; marker.style.top = `${pos.y}px`;
            marker.style.zIndex = String(Math.round(pos.z * 10) + 100);
            marker.classList.toggle('hinted', p.id === state.highlight);
        }
        if (state.animation) invalidate();
    }
    function invalidate() { if (!frame) frame = requestAnimationFrame(draw); }

    function pull(id) {
        if (state.won || state.animation || contextLost || generating) return;
        const p = state.pieces.find(p => p.id === id);
        if (!p || state.removed.has(id)) return;
        PC.audio.unlock(); clearFeedback();
        const blockers = blockersFor(p);
        if (blockers.length) {
            state.blocked = id; state.blockers = blockers;
            state.animation = { id, start: performance.now(), offset: 0, blocked: true };
            say('unlockBlocked', id, blockers);
        } else {
            history.push();
            const distance = Engine.exitDistance(p, state.pieces) + Engine.bounds(state.pieces).radius * 2;
            state.animation = { id, start: performance.now(), offset: 0, blocked: false, distance };
        }
        syncUI(); invalidate();
    }

    function selectSettings(difficulty, size) {
        $('difficulty-seg').querySelector(`[data-value="${difficulty}"]`).click();
        $('size-seg').querySelector(`[data-value="${size}"]`).click();
    }
    function recordWin() {
        // The shell records its current selector values. Preserve staged choices
        // while attributing this solve to the puzzle that was actually played.
        const staged = [shell.difficulty, shell.size];
        selectSettings(state.difficulty, state.size);
        shell.markSolved();
        selectSettings(...staged);
    }
    function randomSeed() {
        return window.crypto && window.crypto.getRandomValues
            ? window.crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296);
    }
    async function loadLevel() {
        const size = shell.size, difficulty = shell.difficulty;
        const sharedSeed = pendingSeed;
        pendingSeed = null;
        const avoid = new Set(recent.map(p => p.fingerprint));
        const recentStructures = new Set(recent.filter(p => p.size === size && p.difficulty === difficulty).slice(-3).map(p => p.structure));
        let puzzle = null, firstFresh = null;
        // History selects a new SEED, never alters a seed's canonical result.
        // Shared links therefore reproduce the exact same board on any device.
        for (let attempt = 0; attempt < (sharedSeed !== null ? 1 : 8); attempt++) {
            const seed = sharedSeed !== null ? sharedSeed : randomSeed();
            let candidate;
            try {
                candidate = await Generator(size, difficulty, seed, async fraction => {
                    PC.progress.setFraction(fraction); await PC.progress.waitNextPaint();
                });
            } catch (error) {
                if (sharedSeed !== null) throw error;
                continue;
            }
            if (sharedSeed !== null) { puzzle = candidate; break; }
            if (avoid.has(candidate.fingerprint)) continue;
            if (!firstFresh) firstFresh = candidate;
            if (recentStructures.has(candidate.structure) && attempt < 2) continue;
            puzzle = candidate; break;
        }
        puzzle = puzzle || firstFresh;
        if (!puzzle) throw new Error('No fresh Unshackle puzzle');
        state.puzzle = puzzle; state.difficulty = difficulty; state.size = size;
        state.animation = null; state.won = false; state.removed = new Set();
        state.pieces = puzzle.pieces; state.graph = puzzle.graph; state.hover = null;
        history.clear(); clearFeedback(); view.reset(); view.setPieces(state.pieces);
        $('piece-tray').replaceChildren(); $('piece-markers').replaceChildren();
        state.pieces.forEach(p => {
            const button = document.createElement('button');
            button.type = 'button'; button.id = `piece-${p.id}`; button.className = 'btn piece-btn';
            const swatch = document.createElement('span'); swatch.className = 'piece-swatch'; swatch.style.setProperty('--piece-color', p.color);
            button.append(swatch, document.createTextNode(String(p.id)));
            button.addEventListener('click', () => pull(p.id)); $('piece-tray').appendChild(button);
            const marker = document.createElement('span'); marker.id = `marker-${p.id}`; marker.className = 'piece-marker'; marker.textContent = p.id;
            $('piece-markers').appendChild(marker);
        });
        recent = recent.filter(p => p.fingerprint !== puzzle.fingerprint);
        recent.push({ fingerprint: puzzle.fingerprint, structure: puzzle.structure, size, difficulty });
        recent = recent.slice(-24); PC.storage.writeJSON(RECENT_KEY, recent);
        PC.share.replaceUrl({ size, difficulty, seed: puzzle.seed });
        say('unlockReady'); syncUI(); invalidate();
    }
    async function startPuzzle() {
        if (generating || contextLost) return;
        generating = true; state.animation = null; shell.timer.stop(); syncUI();
        try { await shell.start(); }
        catch (_) {
            shell.setWin(state.won);
            say('unlockGenerateFailed');
            if (state.puzzle && !state.won) shell.timer.resume();
        } finally { generating = false; syncUI(); invalidate(); }
    }
    shell = PC.shell.create({ gameId: 'unshackle', difficulty: { default: state.difficulty }, size: { kind: 'segmented', default: state.size },
        onNewGame: loadLevel,
        onReset: () => {
            if (state.won) history.clear();
            else if (state.removed.size) history.push();
            state.animation = null; state.won = false; state.removed = new Set();
            clearFeedback(); say('unlockReady'); syncUI(); invalidate();
        },
        solveSound: () => {
            [523.25, 659.25, 783.99].forEach((freq, i) => setTimeout(() => PC.audio.tone(freq, 0.18, { volume: 0.09 }), i * 100));
        },
    });
    // Catch generation failures locally without changing the shared puzzle shell.
    $('new-game-btn').addEventListener('click', e => { e.stopImmediatePropagation(); startPuzzle(); }, true);
    $('difficulty-seg').addEventListener('click', syncLevelReadout);
    $('size-seg').addEventListener('click', syncLevelReadout);
    $('undo-btn').addEventListener('click', () => { if (!state.animation) history.undo(); });
    $('hint-btn').addEventListener('click', () => {
        if (state.animation || state.won || contextLost || generating) return;
        const previous = hintOn; clearFeedback();
        if (!previous) {
            const p = state.pieces.find(p => !state.removed.has(p.id) && blockersFor(p).length === 0);
            if (p) { state.highlight = p.id; hintOn = true; say('unlockHint', p.id); }
        } else say('unlockReady');
        syncUI(); invalidate();
    });
    $('view-reset-btn').addEventListener('click', () => { view.reset(); invalidate(); });
    $('next-level-btn').addEventListener('click', startPuzzle);
    $('share-btn').addEventListener('click', async () => {
        const ok = await PC.share.copyCurrentUrl(); PC.toast.show(t(ok ? 'shareCopied' : 'shareFailed'));
    });
    function turn(direction) {
        const turns = { left: [-0.25, 0], right: [0.25, 0], up: [0, -0.2], down: [0, 0.2] };
        view.rotate(...turns[direction]); invalidate();
    }
    document.querySelectorAll('[data-turn]').forEach(b => b.addEventListener('click', () => turn(b.dataset.turn)));

    // Pointer gestures distinguish taps, orbit drags and multi-touch zoom.
    const pointers = new Map();
    let gesture = null, pinchDistance = 0;
    const distance = () => { const p = [...pointers.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
    canvas.addEventListener('pointerdown', e => {
        if (e.button !== 0 || contextLost || generating || !state.puzzle) return;
        canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) gesture = { x: e.clientX, y: e.clientY, moved: false, multi: false };
        else { gesture.multi = true; pinchDistance = distance(); }
    });
    canvas.addEventListener('pointermove', e => {
        const previous = pointers.get(e.pointerId);
        if (!previous) {
            if (e.pointerType !== 'mouse' || state.animation || state.won || contextLost || generating || !state.puzzle) return;
            const rect = canvas.getBoundingClientRect();
            state.hover = view.pick(e.clientX - rect.left, e.clientY - rect.top, state);
            canvas.classList.toggle('over-piece', !!state.hover); invalidate(); return;
        }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size > 1) {
            const d = distance(); if (pinchDistance > 0) view.zoom(d / pinchDistance); pinchDistance = d;
        } else if (!gesture.multi) {
            if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 6) gesture.moved = true;
            if (gesture.moved) view.rotate((e.clientX - previous.x) * 0.009, (e.clientY - previous.y) * 0.009);
        }
        state.hover = null; invalidate();
    });
    function release(e, cancelled) {
        if (!pointers.has(e.pointerId)) return;
        pointers.delete(e.pointerId);
        if (!cancelled && gesture && !gesture.moved && !gesture.multi) {
            const rect = canvas.getBoundingClientRect();
            pull(view.pick(e.clientX - rect.left, e.clientY - rect.top, state));
        }
        if (!pointers.size) gesture = null;
        invalidate();
    }
    canvas.addEventListener('pointerup', e => release(e, false));
    canvas.addEventListener('pointercancel', e => release(e, true));
    canvas.addEventListener('lostpointercapture', e => release(e, true));
    canvas.addEventListener('pointerleave', () => { state.hover = null; canvas.classList.remove('over-piece'); invalidate(); });
    canvas.addEventListener('wheel', e => {
        if (contextLost) return;
        e.preventDefault(); view.zoom(Math.exp(-e.deltaY * 0.001)); invalidate();
    }, { passive: false });
    document.addEventListener('keydown', e => {
        if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault(); if (!state.animation && !generating && !contextLost) history.undo(); return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey || generating || contextLost) return;
        if (/^[1-9]$/.test(e.key)) { e.preventDefault(); pull(Number(e.key)); }
        if (e.target !== canvas) return;
        const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
        if (keys[e.key]) { e.preventDefault(); turn(keys[e.key]); }
        if (e.key === 'Home') { e.preventDefault(); view.reset(); invalidate(); }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); view.zoom(1.1); invalidate(); }
        if (e.key === '-') { e.preventDefault(); view.zoom(1/1.1); invalidate(); }
    });
    canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault(); contextLost = true; state.animation = null;
        pointers.clear(); gesture = null;
        shell.timer.stop(); $('unlock-error').hidden = false;
        $('unlock-error').textContent = t('unlockContextLost'); canvas.hidden = true;
        document.querySelectorAll('#view-reset-btn, [data-turn]').forEach(b => { b.disabled = true; });
        syncUI();
    });
    canvas.addEventListener('webglcontextrestored', () => {
        view = window.UnshackleView.create(canvas); if (state.pieces.length) view.setPieces(state.pieces);
        contextLost = false; canvas.hidden = false; $('unlock-error').hidden = true;
        document.querySelectorAll('#view-reset-btn, [data-turn]').forEach(b => { b.disabled = false; });
        if (!state.won) shell.timer.resume();
        syncUI(); invalidate();
    });
    PC.i18n.subscribe(() => { say(feedback.key, ...feedback.args); syncUI(); invalidate(); });
    new ResizeObserver(invalidate).observe(canvas);
    startPuzzle();
})();
