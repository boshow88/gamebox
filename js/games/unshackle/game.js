/** Unshackle UI. Uses the puzzle shell for language, sound, timer and solves. */
(function () {
    'use strict';
    const PC = window.PuzzleCommon, Engine = window.UnshackleEngine;
    const DIFFICULTIES = ['easy', 'medium', 'hard'];
    const Generator = window.PuzzleGenerators.unshackle;
    const GI = window.PuzzleGenerators.unshackleInternals;
    const Match = window.PuzzleGenerators.unshackleMatch;
    const initialMode = new URL(location.href).searchParams.get('mode') === 'match' ? 'match' : 'classic';
    const initialMatchVersion = new URL(location.href).searchParams.get('mv') === '2' ? 2 : 1;
    const rawInitial = PC.share.readParams();
    const urlInitial = (initialMode === 'match' ? Match.SIZES : GI.SHARE_SIZES).includes(rawInitial.size) && DIFFICULTIES.includes(rawInitial.difficulty)
        && Number.isInteger(rawInitial.seed) ? rawInitial : null;
    let pendingSeed = urlInitial ? urlInitial.seed : null;
    const RECENT_KEY = PC.storage.storageKey('recent:unshackle:v1');
    const SYMBOLS_KEY = PC.storage.storageKey('unshackle:colour-symbols');
    let showSymbols = PC.storage.readJSON(SYMBOLS_KEY, false) === true;
    const storedRecent = PC.storage.readJSON(RECENT_KEY, []);
    let recent = Array.isArray(storedRecent) ? storedRecent.filter(p => p && typeof p.fingerprint === 'string' && typeof p.structure === 'string').slice(-24) : [];
    Object.assign(PC.i18n.STRINGS.en, {
        unlockName: 'Unshackle', unlockCount: 'Pieces',
        unlockMode: 'Mode', unlockClassic: 'Classic', unlockMatch: 'Triple match',
        unlockBuffer: 'Five-place serving plate', unlockUsed: n => `${n} / 5`, unlockShipped: n => `${n} treats eaten`,
        unlockEmptyPlace: n => `Empty plate place ${n}`,
        unlockMonster: 'A little creature waiting for star treats', unlockSymbols: 'Colour symbols',
        unlockMatchReady: 'Match three of one colour. Fuse a star treat for the little creature.',
        unlockMatchRule: 'Three of one colour fuse into one star treat. The plate holds five pieces; a completing third piece goes directly to fusion.',
        unlockMatchHelp: 'Tap a waiting piece to slide it back along its original path. Make room by matching or returning pieces. Optional colour symbols help identify matching groups.',
        unlockReturn: (id, symbol) => `Return piece ${id}${symbol ? `, group ${symbol}` : ''}`,
        unlockReturned: id => `Piece ${id} is back in its original position.`,
        unlockReturnFailed: 'Could not return this piece. You can try again or use Undo.',
        unlockReturnBlocked: (id, blockers) => `Piece ${id} cannot return past ${blockers.join(', ')}. Remove those pieces first.`,
        unlockEffectFailed: 'The move could not finish. You can try again or use Undo.',
        unlockFeeding: 'Three matching loops become one star treat.',
        unlockMatched: 'One star treat eaten. More room on the plate.',
        unlockMatchComplete: 'A happy, well-fed creature.',
        unlockWaiting: id => `Piece ${id} is waiting. Plan the next triple.`,
        unlockTrayFull: 'All five waiting places are full. Complete a triple or return a waiting piece first.',
        unlockMatchHint: id => `Try piece ${id}. A complete solution still exists after this move.`,
        unlockMatchDead: 'This order cannot finish within five slots. Return a waiting piece, undo an earlier move or reset.',
        unlockMatchUnknown: 'No hint found within the search limit. You can keep playing or undo.',
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
        unlockHelp2: 'Drag to rotate the puzzle. Tap a piece or its numbered button to pull it out. A blocked piece stays in place; its blockers briefly flash amber.',
        unlockHelp3: 'Pinch or scroll to zoom. Keyboard: arrows to rotate, 1–9 to pull, Home to reset the view, Ctrl+Z to undo. New Game generates a fresh puzzle; Share copies this exact puzzle.',
    });
    Object.assign(PC.i18n.STRINGS.zh, {
        unlockName: '枷鎖', unlockCount: '零件數',
        unlockMode: '模式', unlockClassic: '經典拆解', unlockMatch: '三消暫存',
        unlockBuffer: '五格餐盤', unlockUsed: n => `${n} / 5`, unlockShipped: n => `已餵食 ${n} 顆`,
        unlockEmptyPlace: n => `餐盤空位 ${n}`,
        unlockMonster: '等待星星糖的小獸', unlockSymbols: '辨色輔助符號',
        unlockMatchReady: '湊齊三根同色，融合成星星糖餵給小獸。',
        unlockMatchRule: '同色三根融合成星星糖。餐盤最多放五根；能湊成三根的零件會直接融合，不占第六格。',
        unlockMatchHelp: '點暫存零件可沿原路插回。空間滿時，先湊三消或放回零件。需要辨色協助時，可開啟輔助符號。',
        unlockReturn: (id, symbol) => `放回零件 ${id}${symbol ? `，${symbol} 組` : ''}`,
        unlockReturned: id => `零件 ${id} 已放回原位。`,
        unlockReturnFailed: '暫時無法放回這個零件，可以再試一次或使用復原。',
        unlockReturnBlocked: (id, blockers) => `零件 ${id} 的返回路徑被 ${blockers.join('、')} 擋住，請先抽出阻擋它的零件。`,
        unlockEffectFailed: '動作暫時無法完成，可以再試一次或使用復原。',
        unlockFeeding: '三根同色，融合成一顆星星糖。',
        unlockMatched: '小獸吃掉星星糖，餐盤又有空間了。',
        unlockMatchComplete: '小獸吃飽了。',
        unlockWaiting: id => `零件 ${id} 已暫存，想想接下來要湊哪一組。`,
        unlockTrayFull: '五根暫存空間已滿，請先湊三消或放回暫存零件。',
        unlockMatchHint: id => `可以考慮零件 ${id}，抽出後仍有不爆槽的完整解法。`,
        unlockMatchDead: '目前順序已無法在五格內完成，請放回暫存零件、復原較早的步驟或重置。',
        unlockMatchUnknown: '搜尋上限內暫時找不到提示，可以繼續嘗試或復原。',
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
        unlockHelp2: '拖曳旋轉整組枷鎖，點擊零件或下方編號即可抽出。被擋住的零件會留在原位，阻擋它的零件會短暫亮成琥珀色。',
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

    const state = { mode: initialMode, difficulty: urlInitial ? urlInitial.difficulty : 'easy', size: urlInitial ? urlInitial.size : initialMode === 'match' ? 24 : 12,
        puzzle: null, pieces: [], graph: [], removed: new Set(), won: false,
        animation: null, blocked: null, blockers: [], highlight: null, hover: null };
    let shell, frame = 0, hintOn = false, contextLost = false, generating = false;
    let blockedFeedbackTimer = 0;
    let feedback = { key: 'unlockReady', args: [] };
    let lastTime = '';
    let stagedMode = initialMode, matchSolveLogged = false;
    const modeSizes = { classic: initialMode === 'classic' ? state.size : 12, match: initialMode === 'match' ? state.size : 24 };
    const history = PC.history.create({
        limit: 64,
        snapshot: () => [...state.removed],
        restore: removed => {
            cancelAnimation();
            if (state.won) { state.won = false; shell.clearWin(); }
            state.removed = new Set(removed);
            clearFeedback(); say('unlockUndo'); syncUI(); invalidate();
        },
    });

    function say(key, ...args) {
        feedback = { key, args };
        $('unlock-feedback').textContent = key === 'unlockTrayFull' ? '' : t(key, ...args);
        $('unlock-feedback').classList.toggle('blocked', ['unlockBlocked', 'unlockReturnBlocked', 'unlockTrayFull', 'unlockMatchDead'].includes(key));
        const trayFull = key === 'unlockTrayFull';
        $('match-panel').classList.toggle('rejected', trayFull);
    }
    function clearFeedback() {
        clearTimeout(blockedFeedbackTimer); blockedFeedbackTimer = 0;
        state.blocked = null; state.blockers = []; state.highlight = null; hintOn = false;
        $('match-panel').classList.remove('rejected', 'shaking');
    }
    function flashBlocked(id, blockers = []) {
        clearTimeout(blockedFeedbackTimer);
        state.blocked = id; state.blockers = blockers;
        // Warning colours must not outlive the feedback and masquerade as a
        // piece's matching group. Leave the hint and message state untouched.
        blockedFeedbackTimer = setTimeout(() => {
            blockedFeedbackTimer = 0;
            state.blocked = null; state.blockers = [];
            invalidate();
        }, 850);
    }
    function blockersFor(p) {
        return state.graph[state.pieces.indexOf(p)].filter(id => !state.removed.has(id));
    }
    function waiting() { return state.mode === 'match' && state.puzzle ? Match.trayAfter(state.puzzle, state.removed) : []; }
    function readyMessage() { return state.mode === 'match' ? 'unlockMatchReady' : 'unlockReady'; }
    function cancelAnimation() {
        if (state.animation && state.animation.flight) state.animation.flight.remove();
        state.animation = null;
        $('match-monster').classList.remove('feeding', 'chewing');
        $('match-panel').classList.remove('shaking');
    }
    function plateToken(p, interactive) {
        const slot = document.createElement(interactive ? 'button' : 'span'); slot.className = 'match-slot';
        slot.style.setProperty('--piece-color', p.color); slot.style.setProperty('--link-length', `${p.length*4+12}px`);
        if (interactive) {
            slot.type = 'button'; slot.dataset.returnId = p.id;
            slot.disabled = !!state.animation || generating || contextLost;
            slot.classList.toggle('returning', !!state.animation && state.animation.returning && state.animation.id === p.id);
            slot.classList.toggle('feeding', !!state.animation && state.animation.feeding && state.animation.matchIds.includes(p.id));
            slot.setAttribute('aria-label', t('unlockReturn', p.id, showSymbols ? p.symbol : '')); slot.title = t('unlockReturn', p.id, showSymbols ? p.symbol : '');
            slot.addEventListener('click', () => returnPiece(p.id));
        } else {
            slot.classList.add('docking-target'); slot.dataset.dockTarget = p.id; slot.setAttribute('aria-hidden', 'true');
        }
        const link = document.createElement('span'); link.className = 'match-link'; link.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span'); label.className = 'match-label';
        if (showSymbols) {
            const symbol = document.createElement('span'); symbol.className = 'match-token'; symbol.textContent = p.symbol; label.appendChild(symbol);
        }
        label.appendChild(document.createTextNode(p.id)); slot.append(link, label); return slot;
    }
    function syncMatchUI() {
        const active = state.mode === 'match', tray = waiting();
        canvas.closest('.unlock-board').classList.toggle('match-mode', active);
        $('match-dock').hidden = !active || state.won;
        $('match-panel').hidden = !active || state.won;
        $('match-help').hidden = !active; $('match-rule').hidden = !active;
        $('match-shipped').hidden = !active;
        $('match-monster').hidden = !active;
        $('match-symbols-control').hidden = !active; $('match-symbols').checked = showSymbols;
        if (!active) return;
        $('match-panel').classList.toggle('full', tray.length === Match.CAPACITY);
        $('match-used').textContent = t('unlockUsed', tray.length);
        $('match-shipped').textContent = t('unlockShipped', (state.removed.size - tray.length) / 3);
        $('match-slots').replaceChildren();
        for (let index = 0; index < Match.CAPACITY; index++) {
            const id = tray[index], item = document.createElement('span');
            item.className = 'match-place'; item.setAttribute('role', 'listitem');
            if (id === undefined) {
                const empty = document.createElement('span'); empty.className = 'match-empty'; empty.textContent = index + 1;
                empty.setAttribute('aria-hidden', 'true'); item.setAttribute('aria-label', t('unlockEmptyPlace', index + 1));
                item.appendChild(empty);
                if (state.animation && state.animation.docking && !state.animation.matchIds && state.animation.plateIndex === index) {
                    item.classList.add('arriving'); item.appendChild(plateToken(state.pieces[state.animation.id-1], false));
                }
                $('match-slots').appendChild(item); continue;
            }
            item.classList.add('occupied');
            item.appendChild(plateToken(state.pieces[id-1], true)); $('match-slots').appendChild(item);
        }
    }
    function syncLevelReadout() {
        const current = `${t(state.mode === 'match' ? 'unlockMatch' : 'unlockClassic')} · ${t('unlockSettings', t(state.difficulty), state.size)}`;
        const pending = `${t(stagedMode === 'match' ? 'unlockMatch' : 'unlockClassic')} · ${t('unlockSettings', t(shell.difficulty), shell.size)}`, readout = $('level-readout');
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
        $('mode-seg').querySelectorAll('button').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === stagedMode);
            b.classList.toggle('committed', b.dataset.mode === state.mode);
            b.setAttribute('aria-checked', String(b.dataset.mode === stagedMode));
        });
        const sizes = stagedMode === 'match' ? Match.SIZES : GI.SIZES;
        $('size-seg').querySelectorAll('button').forEach(b => {
            const size = Number(b.dataset.value);
            b.hidden = !sizes.includes(size) && !(stagedMode === 'classic' && size === modeSizes.classic && GI.SHARE_SIZES.includes(size));
        });
    }
    function syncUI() {
        $('unlock-progress').textContent = t('unlockProgress', state.removed.size, state.pieces.length);
        const locked = generating || contextLost;
        $('undo-btn').disabled = !history.canUndo() || !!state.animation || locked;
        $('hint-btn').disabled = state.won || !!state.animation || locked || !state.puzzle;
        document.querySelectorAll('#new-game-btn, #reset-btn, #share-btn, #next-level-btn, #difficulty-seg button, #size-seg button, #mode-seg button').forEach(b => { b.disabled = locked; });
        $('reset-btn').disabled = locked || !state.puzzle;
        $('share-btn').disabled = locked || !state.puzzle;
        $('puzzle-code').textContent = state.puzzle ? t('unlockCode', state.puzzle.seed.toString(36)) : '';
        $('unlock-win').hidden = !state.won;
        $('unlock-win').querySelector('h2').textContent = t(state.mode === 'match' ? 'unlockMatchComplete' : 'unlockComplete');
        $('unlock-win-detail').textContent = `${t(state.mode === 'match' ? 'unlockMatch' : 'unlockClassic')} · ${t('unlockWinDetail', t(state.difficulty), state.size, lastTime)}`;
        $('next-level-btn').textContent = t('unlockNext');
        for (const p of state.pieces) {
            const button = $(`piece-${p.id}`), removed = state.removed.has(p.id);
            if (!button) continue;
            button.disabled = removed || !!state.animation || locked;
            button.classList.toggle('removed', removed);
            button.classList.toggle('hinted', p.id === state.highlight);
            const symbols = state.mode === 'match' && showSymbols, swatch = button.querySelector('.piece-swatch');
            swatch.classList.toggle('match-token', symbols); swatch.textContent = symbols ? p.symbol : '';
            $(`marker-${p.id}`).textContent = symbols ? `${p.id}${p.symbol}` : p.id;
            const label = t('unlockPiece', p.id, removed) + (symbols ? ` · ${p.symbol}` : '');
            button.setAttribute('aria-label', label);
            button.title = label;
        }
        syncLevelReadout();
        syncMatchUI();
    }

    function finishPull(anim) {
        if (state.mode === 'match') history.push();
        state.removed.add(anim.id);
        if (state.removed.size === state.pieces.length) {
            state.won = true; recordWin(); lastTime = $('timer').textContent;
            say(state.mode === 'match' ? 'unlockMatchComplete' : 'unlockComplete');
        } else if (state.mode === 'match') say(anim.matchIds ? 'unlockMatched' : 'unlockWaiting', anim.id);
        else say('unlockRemoved', anim.id);
    }
    function startDocking(anim, now) {
        anim.docking = true; anim.start = now; anim.progress = 0;
        syncUI();
        try {
            anim.flight = view.createPlateFlight(state.pieces[anim.id-1], anim.distance, () => anim.matchIds
                ? { mouth: $('monster-mouth'), plate: $('match-slots') }
                : { slot: $('match-slots').querySelector(`[data-dock-target="${anim.id}"]`) });
        } catch (_) { cancelAnimation(); say('unlockEffectFailed'); }
    }
    function startFeeding(anim, now) {
        const sources = anim.matchIds.map(id => {
            const slot = $('match-slots').querySelector(`[data-return-id="${id}"]`);
            if (slot) {
                const r = slot.querySelector('.match-link').getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 };
            }
            return anim.arrivalPoint;
        });
        try {
            const flight = view.createFeedingFlight(anim.matchIds.map(id => state.pieces[id - 1]), sources, $('monster-mouth'), $('match-slots'));
            state.animation = { ...anim, feeding: true, start: now, progress: 0, flight };
            $('match-monster').classList.add('feeding'); say('unlockFeeding');
        } catch (_) { cancelAnimation(); say('unlockEffectFailed'); }
    }
    function draw(now) {
        frame = 0;
        if (contextLost) return;
        const anim = state.animation;
        if (anim) {
            const duration = anim.feeding ? 1100 : anim.docking ? 460 : anim.returning ? (anim.phase === 'lift' ? 260 : 680)
                : anim.trayFull ? 420 : anim.blocked ? 340 : anim.shortPull ? Math.max(80, 320*Math.min(1,anim.distance/0.6)) : 680;
            const progress = Math.min(1, (now - anim.start) / duration), ease = progress*progress*(3-2*progress);
            anim.progress = progress;
            if (anim.returning) anim.offset = anim.phase === 'lift' ? anim.distance : anim.distance * (1 - ease);
            else anim.offset = anim.docking ? anim.distance : anim.blocked ? Math.sin(progress * Math.PI)*(anim.reducedMotion ? 0 : anim.trayFull ? 0.12 : 0.025)
                : anim.distance * (anim.shortPull ? 1-(1-progress)**3 : progress*progress);
            if (progress === 1) {
                if (anim.returning && anim.phase === 'lift') {
                    anim.flight.remove(); delete anim.flight;
                    anim.phase = 'insert'; anim.start = now; anim.progress = 0; anim.offset = anim.distance;
                } else if (anim.docking && !anim.feeding && anim.matchIds) {
                    anim.arrivalPoint = anim.flight.arrival(); anim.flight.remove(); delete anim.flight;
                    startFeeding(anim, now);
                } else if (anim.shortPull && !anim.docking) {
                    startDocking(anim, now);
                } else {
                    cancelAnimation();
                    if (anim.returning) {
                        history.push(); state.removed.delete(anim.id); say('unlockReturned', anim.id);
                    } else if (!anim.blocked) finishPull(anim);
                }
                syncUI();
            }
        }
        // Rendering establishes the current projection before overlay animation
        // and the depth-tested label/picking pass, including after a resize.
        if (!state.pieces.length) { view.render(state); return; }
        view.render(state);
        const effect = state.animation;
        if (effect && effect.flight) {
            try {
                if (effect.feeding) {
                    effect.flight.update(effect.progress);
                    if (effect.progress >= 0.5 && !effect.fused) {
                        effect.fused = true; PC.audio.tone(730, 0.07, { volume: 0.035 });
                    }
                    if (effect.progress >= 0.84 && !effect.chewed) {
                        effect.chewed = true;
                        $('match-monster').classList.remove('feeding'); $('match-monster').classList.add('chewing');
                        PC.audio.tone(520, 0.08, { volume: 0.045 });
                    }
                } else if (effect.docking) {
                    effect.flight.update(effect.progress);
                } else if (effect.returning) {
                    const slot = $('match-slots').querySelector(`[data-return-id="${effect.id}"]`);
                    if (slot) effect.flight.update(slot.getBoundingClientRect(), effect.progress);
                }
            } catch (_) {
                cancelAnimation(); say(effect.returning ? 'unlockReturnFailed' : 'unlockEffectFailed'); syncUI();
            }
        }
        const fittedPositions = state.pieces.map(p => {
            const offset = state.animation && state.animation.id === p.id ? state.animation.offset : 0;
            return view.project(Engine.math.add(p.knob, Engine.math.mul(p.dir, offset)));
        });
        const visible = view.pickMany(fittedPositions, state);
        for (const [i, p] of state.pieces.entries()) {
            const marker = $(`marker-${p.id}`), pos = fittedPositions[i];
            const inserting = state.animation && state.animation.id === p.id && state.animation.returning && state.animation.phase === 'insert';
            marker.hidden = (state.removed.has(p.id) && !inserting) || state.won || visible[i] !== p.id;
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
            flashBlocked(id, blockers);
            state.animation = { id, start: performance.now(), offset: 0, blocked: true };
            say('unlockBlocked', id, blockers);
        } else {
            const plan = state.mode === 'match' ? Match.pullPlan(state.puzzle, state.removed, id) : null;
            if (plan && !plan.allowed) {
                flashBlocked(id);
                state.animation = { id, start: performance.now(), offset: 0, blocked: true, trayFull: true,
                    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches };
                say('unlockTrayFull');
                $('match-panel').classList.add('shaking');
                syncUI(); invalidate(); return;
            }
            if (state.mode !== 'match') history.push();
            const travel = Engine.exitDistance(p, state.pieces), rect = canvas.getBoundingClientRect();
            const distance = state.mode === 'match'
                ? view.pullPreviewDistance(p, travel, { left: 8, top: 8,
                    right: rect.width-8, bottom: rect.height-20 }, state)
                : travel + Engine.bounds(state.pieces).radius*2;
            state.animation = { id, start: performance.now(), offset: 0, blocked: false, distance,
                shortPull: state.mode === 'match', plateIndex: waiting().length,
                matchIds: plan && plan.matching ? plan.consumed : null };
        }
        syncUI(); invalidate();
    }

    function returnPiece(id) {
        if (state.mode !== 'match' || state.won || state.animation || contextLost || generating || !waiting().includes(id)) return;
        const p = state.pieces.find(p => p.id === id), blockers = blockersFor(p);
        PC.audio.unlock(); clearFeedback();
        // Returning is the reverse of a full pull. The same swept-path blockers
        // apply, including obstacles reintroduced by earlier returns.
        if (blockers.length) {
            flashBlocked(null, blockers); say('unlockReturnBlocked', id, blockers);
        } else {
            // Creating or drawing a flight must not add an unchanged snapshot or
            // strand the UI. Commit the return and its history only on arrival.
            let flight;
            const distance = Engine.exitDistance(p, state.pieces);
            try { flight = view.createReturnFlight(p, distance, showSymbols); }
            catch (_) { say('unlockReturnFailed'); syncUI(); invalidate(); return; }
            state.animation = { id, start: performance.now(), offset: distance, progress: 0,
                returning: true, phase: 'lift', distance, flight };
        }
        syncUI(); invalidate();
    }

    function selectSettings(difficulty, size) {
        $('difficulty-seg').querySelector(`[data-value="${difficulty}"]`).click();
        $('size-seg').querySelector(`[data-value="${size}"]`).click();
    }
    function recordWin() {
        if (state.mode === 'match') {
            const elapsed = shell.timer.stop();
            if (!matchSolveLogged) { PC.solves.log('unshackle-match', state.size, state.difficulty, elapsed); matchSolveLogged = true; }
            shell.setWin(true); return;
        }
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
        const size = shell.size, difficulty = shell.difficulty, mode = stagedMode;
        const sharedSeed = pendingSeed;
        pendingSeed = null;
        const modeRecent = recent.filter(p => (p.mode || 'classic') === mode);
        const avoid = new Set(modeRecent.map(p => p.fingerprint));
        const recentStructures = new Set(modeRecent.filter(p => p.size === size && p.difficulty === difficulty).slice(-3).map(p => p.structure));
        let puzzle = null, firstFresh = null;
        // History selects a new SEED, never alters a seed's canonical result.
        // Shared links therefore reproduce the exact same board on any device.
        for (let attempt = 0; attempt < (sharedSeed !== null ? 1 : 8); attempt++) {
            const seed = sharedSeed !== null ? sharedSeed : randomSeed();
            let candidate;
            try {
                const generate = mode === 'match' ? (sharedSeed !== null && initialMatchVersion === 1 ? Match.generateLegacy : Match.generate) : Generator;
                candidate = await generate(size, difficulty, seed, async fraction => {
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
        state.puzzle = puzzle; state.difficulty = difficulty; state.size = size; state.mode = mode; matchSolveLogged = false;
        cancelAnimation(); state.won = false; state.removed = new Set();
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
        recent = recent.filter(p => (p.mode || 'classic') !== mode || p.fingerprint !== puzzle.fingerprint);
        recent.push({ fingerprint: puzzle.fingerprint, structure: puzzle.structure, size, difficulty, mode });
        recent = recent.slice(-24); PC.storage.writeJSON(RECENT_KEY, recent);
        PC.share.replaceUrl({ size, difficulty, seed: puzzle.seed });
        const url = new URL(location.href);
        if (mode === 'match') {
            url.searchParams.set('mode', 'match');
            if (puzzle.matchVersion === 2) url.searchParams.set('mv', '2'); else url.searchParams.delete('mv');
        } else { url.searchParams.delete('mode'); url.searchParams.delete('mv'); }
        window.history.replaceState(null, '', url);
        say(readyMessage()); syncUI(); invalidate();
    }
    async function startPuzzle() {
        if (generating || contextLost) return;
        generating = true; cancelAnimation(); shell.timer.stop(); syncUI();
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
            matchSolveLogged = false;
            if (state.won) history.clear();
            else if (state.removed.size) history.push();
            cancelAnimation(); state.won = false; state.removed = new Set();
            clearFeedback(); say(readyMessage()); syncUI(); invalidate();
        },
        solveSound: () => {
            [523.25, 659.25, 783.99].forEach((freq, i) => setTimeout(() => PC.audio.tone(freq, 0.18, { volume: 0.09 }), i * 100));
        },
    });
    // Catch generation failures locally without changing the shared puzzle shell.
    $('new-game-btn').addEventListener('click', e => { e.stopImmediatePropagation(); startPuzzle(); }, true);
    $('difficulty-seg').addEventListener('click', syncLevelReadout);
    $('size-seg').addEventListener('click', syncLevelReadout);
    $('match-symbols').addEventListener('change', () => {
        showSymbols = $('match-symbols').checked;
        PC.storage.writeJSON(SYMBOLS_KEY, showSymbols); syncUI(); invalidate();
    });
    $('mode-seg').addEventListener('click', e => {
        const button = e.target.closest('button[data-mode]');
        if (!button || button.disabled || button.dataset.mode === stagedMode) return;
        modeSizes[stagedMode] = shell.size; stagedMode = button.dataset.mode;
        $('size-seg').querySelector(`[data-value="${modeSizes[stagedMode]}"]`).click();
        syncLevelReadout();
    });
    $('undo-btn').addEventListener('click', () => { if (!state.animation) history.undo(); });
    $('hint-btn').addEventListener('click', () => {
        if (state.animation || state.won || contextLost || generating) return;
        const previous = hintOn; clearFeedback();
        if (!previous) {
            if (state.mode === 'match') {
                const result = Match.solve(state.puzzle, state.removed);
                if (result.status === 'solved' && result.solution.length) {
                    state.highlight = result.solution[0]; hintOn = true; say('unlockMatchHint', state.highlight);
                } else say(result.status === 'budget' ? 'unlockMatchUnknown' : 'unlockMatchDead');
                syncUI(); invalidate(); return;
            }
            const p = state.pieces.find(p => !state.removed.has(p.id) && blockersFor(p).length === 0);
            if (p) { state.highlight = p.id; hintOn = true; say('unlockHint', p.id); }
        } else say(readyMessage());
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
        e.preventDefault(); contextLost = true; cancelAnimation();
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
