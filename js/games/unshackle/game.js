/** Unshackle UI. Uses the puzzle shell for language, sound, timer and solves. */
(function () {
    'use strict';
    const PC = window.PuzzleCommon, Engine = window.UnshackleEngine;
    const DIFFICULTIES = ['easy', 'medium', 'hard'];
    const Generator = window.PuzzleGenerators.unshackle;
    const GI = window.PuzzleGenerators.unshackleInternals;
    const Match = window.PuzzleGenerators.unshackleMatch;
    const Free = window.UnshackleFree;
    const modeName = mode => ({ classic: 'unlockClassic', match: 'unlockMatch', free: 'unlockFree' }[mode]);
    const requestedMode = new URL(location.href).searchParams.get('mode');
    const initialMode = ['match', 'free'].includes(requestedMode) ? requestedMode : 'classic';
    const initialMatchVersion = Number(new URL(location.href).searchParams.get('mv') || 1);
    const initialFreeVersion = Number(new URL(location.href).searchParams.get('fv') || 5);
    const rawInitial = PC.share.readParams();
    const urlInitial = (initialMode === 'match' ? Match.SIZES : initialMode === 'free' ? Free.SHARE_SIZES : GI.SHARE_SIZES).includes(rawInitial.size) && DIFFICULTIES.includes(rawInitial.difficulty)
        && Number.isInteger(rawInitial.seed) ? rawInitial : null;
    let pendingSeed = urlInitial ? urlInitial.seed : null;
    const RECENT_KEY = PC.storage.storageKey('recent:unshackle:v1');
    const SYMBOLS_KEY = PC.storage.storageKey('unshackle:colour-symbols');
    let showSymbols = PC.storage.readJSON(SYMBOLS_KEY, false) === true;
    const storedRecent = PC.storage.readJSON(RECENT_KEY, []);
    let recent = Array.isArray(storedRecent) ? storedRecent.filter(p => p && typeof p.fingerprint === 'string' && typeof p.structure === 'string').slice(-24) : [];
    Object.assign(PC.i18n.STRINGS.en, {
        unlockName: 'Unshackle', unlockCount: 'Pieces',
        unlockFreeBoard: 'Drag a piece freely along its axis. Release anywhere. Drag empty space to rotate.',
        unlockFree: 'Continuous slide', unlockFreeReady: 'Pull a piece partway to let others pass, then come back for it.',
        unlockFreeHelp: 'Grab near a piece and drag along its axis; release to stop. Pull toward the white cap to remove.',
        unlockFreeRelease: 'Release to remove', unlockFreeLevel: (n, difficulty) => `Continuous slide · ${difficulty} · ${n} pieces`,
        unlockFreeCaption: 'Drag a piece to move · Drag empty space to rotate', unlockFreeViewAxis: 'Rotate the view to see this piece from the side, then drag along its axis.',
        unlockFreePiece: id => `Select piece ${id}`, unlockFreePieces: 'Select a piece',
        unlockFreeMoved: id => `Piece ${id} shifted. Check what can now move.`, unlockFreeBlocked: (id, blockers) => `Piece ${id} cannot slide past ${blockers.join(', ')}.`,
        unlockFreeHint: (id, action) => `Piece ${id}: ${action}. A complete solution is verified.`,
        unlockFreeBack: 'Away from cap', unlockFreeForward: 'Toward cap', unlockFreeExtract: 'Pull out',
        unlockFreeRule: 'Pull pieces partway to open a path for others. Untangle every piece to win.',
        unlockMode: 'Mode', unlockClassic: 'Classic', unlockMatch: 'Triple match',
        unlockBuffer: 'Five-place serving plate', unlockUsed: n => `${n} / 5`, unlockShipped: n => `${n} treats eaten`,
        unlockEmptyPlace: n => `Empty plate place ${n}`,
        unlockMonster: 'A little creature waiting for star treats', unlockSymbols: 'Colour symbols',
        unlockMatchReady: 'Match three of one colour. Fuse a star treat for the little creature.',
        unlockMatchRule: 'Pull out pieces to match three of one colour. Clear every piece to win.',
        unlockMatchHelp: 'The plate holds five pieces. A full plate can still complete a triple; tap a waiting piece to return it along its path.',
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
        unlockBoard: 'Tap near a piece or drag toward its white cap to pull. Drag empty space to rotate.',
        unlockCaption: 'Drag to pull · Drag empty space to rotate', unlockViewReset: 'Reset view',
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
        unlockHelp1: 'Remove every piece. Each pulls straight toward its white cap.',
        unlockHelp2: 'Tap near a piece or drag it toward its white cap to pull it out. Free its blockers first.',
        unlockHelp3: 'Drag empty space to rotate; pinch or scroll to zoom.',
    });
    Object.assign(PC.i18n.STRINGS.zh, {
        unlockName: '枷鎖', unlockCount: '零件數',
        unlockFreeBoard: '沿軸線自由拖曳零件，放開即停。拖空白處旋轉。',
        unlockFree: '連續滑動', unlockFreeReady: '先把零件抽出一部分讓路，再回頭解開它。',
        unlockFreeHelp: '按住零件附近沿軸拖曳，放開即停；通道暢通後朝白端抽出。',
        unlockFreeRelease: '放開即可取下', unlockFreeLevel: (n, difficulty) => `連續滑動・${difficulty}・${n} 個零件`,
        unlockFreeCaption: '拖零件移動 · 拖空白旋轉', unlockFreeViewAxis: '這個方向看不清移動軸線，先轉個角度再沿軸拖曳。',
        unlockFreePiece: id => `選取零件 ${id}`, unlockFreePieces: '選取零件',
        unlockFreeMoved: id => `零件 ${id} 已移動，看看哪些通道打開了。`, unlockFreeBlocked: (id, blockers) => `零件 ${id} 的滑動路徑被 ${blockers.join('、')} 擋住。`,
        unlockFreeHint: (id, action) => `零件 ${id}：${action}，此步驟後仍有完整解法。`,
        unlockFreeBack: '背離白端移動', unlockFreeForward: '朝白端移動', unlockFreeExtract: '抽出零件',
        unlockFreeRule: '先半抽讓路，再解開互相卡住的零件；清空即過關。',
        unlockMode: '模式', unlockClassic: '經典拆解', unlockMatch: '三消暫存',
        unlockBuffer: '五格餐盤', unlockUsed: n => `${n} / 5`, unlockShipped: n => `已餵食 ${n} 顆`,
        unlockEmptyPlace: n => `餐盤空位 ${n}`,
        unlockMonster: '等待星星糖的小獸', unlockSymbols: '辨色輔助符號',
        unlockMatchReady: '湊齊三根同色，融合成星星糖餵給小獸。',
        unlockMatchRule: '抽出零件湊齊同色三消，清空所有零件即過關。',
        unlockMatchHelp: '餐盤限放五根，滿盤仍可湊三消；點暫存零件可沿原路放回。',
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
        unlockBoard: '點零件附近或朝白端拖曳可抽出；拖空白處旋轉。',
        unlockCaption: '拖零件抽出 · 拖空白旋轉', unlockViewReset: '視角歸位',
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
        unlockHelp1: '依序抽出所有零件；每件只能朝白色端點移動。',
        unlockHelp2: '點零件附近或朝白端拖動即可抽出；被擋住時，先移開阻擋的零件。',
        unlockHelp3: '拖曳空白處旋轉，雙指或滾輪縮放。',
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

    const state = { mode: initialMode, difficulty: urlInitial ? urlInitial.difficulty : 'easy', size: urlInitial ? urlInitial.size : initialMode === 'free' ? 12 : initialMode === 'match' ? 24 : 12,
        puzzle: null, pieces: [], graph: [], removed: new Set(), won: false,
        drag: null, grabbed: null, positions: [], selected: null, moveCount: 0, animation: null, blocked: null, blockers: [], highlight: null, hover: null };
    const pointers = new Map();
    let gesture = null, pinchDistance = 0, controlPress = null, pullModel = null;
    let shell, frame = 0, hintOn = false, contextLost = false, generating = false;
    let blockedFeedbackTimer = 0;
    let monsterReactionTimer = 0;
    let feedback = { key: 'unlockReady', args: [] };
    let lastTime = '';
    let stagedMode = initialMode, modeSolveLogged = false;
    const modeSizes = { classic: initialMode === 'classic' ? state.size : 12, match: initialMode === 'match' ? state.size : 24, free: initialMode === 'free' ? state.size : 12 };
    const history = PC.history.create({
        limit: 64,
        snapshot: () => ({ removed: [...state.removed], positions: state.positions.slice(), moveCount: state.moveCount }),
        restore: snapshot => {
            cancelAnimation();
            if (state.won) { state.won = false; shell.clearWin(); }
            state.removed = new Set(snapshot.removed);
            state.positions = snapshot.positions; state.selected = null; state.moveCount = snapshot.moveCount;
            if (state.mode === 'free') rebuildFreePieces();
            clearFeedback(); say('unlockUndo'); syncUI(); invalidate();
        },
    });

    function say(key, ...args) {
        feedback = { key, args };
        $('unlock-feedback').textContent = key === 'unlockTrayFull' ? '' : t(key, ...args);
        $('unlock-feedback').classList.toggle('blocked', ['unlockBlocked', 'unlockReturnBlocked', 'unlockTrayFull', 'unlockMatchDead', 'unlockFreeBlocked'].includes(key));
        const trayFull = key === 'unlockTrayFull';
        $('match-panel').classList.toggle('rejected', trayFull);
    }
    function clearFeedback() {
        clearTimeout(blockedFeedbackTimer); blockedFeedbackTimer = 0;
        clearMonsterReaction();
        state.blocked = null; state.blockers = []; state.highlight = null; hintOn = false;
        $('match-panel').classList.remove('rejected', 'shaking');
    }
    function clearMonsterReaction() {
        clearTimeout(monsterReactionTimer); monsterReactionTimer = 0;
        $('match-monster').classList.remove('puzzled', 'plate-full');
    }
    function reactMonster(reaction) {
        if (state.mode !== 'match' || state.won || generating || contextLost) return;
        clearMonsterReaction();
        const monster = $('match-monster');
        // Restart the expression on another rejected attempt, even at the same piece.
        void monster.offsetWidth;
        monster.classList.add(reaction);
        monsterReactionTimer = setTimeout(clearMonsterReaction, 900);
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
        if (state.mode === 'free') return state.puzzle.model.blockers(state.positions, p.id - 1, Free.REMOVED);
        return state.graph[state.pieces.indexOf(p)].filter(id => !state.removed.has(id));
    }
    function waiting() { return state.mode === 'match' && state.puzzle ? Match.trayAfter(state.puzzle, state.removed) : []; }
    function readyMessage() { return state.mode === 'free' ? 'unlockFreeReady' : state.mode === 'match' ? 'unlockMatchReady' : 'unlockReady'; }
    function cancelAnimation() {
        cancelPointerInput();
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
        const current = state.mode === 'free' ? t('unlockFreeLevel', state.size, t(state.difficulty)) : `${t(modeName(state.mode))} · ${t('unlockSettings', t(state.difficulty), state.size)}`;
        const pending = stagedMode === 'free' ? t('unlockFreeLevel', shell.size, t(shell.difficulty)) : `${t(modeName(stagedMode))} · ${t('unlockSettings', t(shell.difficulty), shell.size)}`, readout = $('level-readout');
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
        $('difficulty-seg').closest('.toolbar-group').hidden = false;
        const sizes = GI.SETTINGS[shell.difficulty].sizes;
        $('size-seg').querySelectorAll('button').forEach(b => {
            const size = Number(b.dataset.value), tiers = DIFFICULTIES.filter(d => GI.SETTINGS[d].sizes.includes(size));
            b.textContent = String(size);
            b.hidden = !GI.SIZES.includes(size);
            b.disabled = generating || contextLost || !sizes.includes(size);
            b.title = `${size} · ${tiers.map(d => t(d)).join(' / ')}`;
            b.setAttribute('aria-label', b.title);
        });

    }
    function syncUI() {
        syncFreeUI();
        const sliding = state.mode === 'free';

        canvas.dataset.i18nAriaLabel = sliding ? 'unlockFreeBoard' : 'unlockBoard';
        canvas.setAttribute('aria-label', t(canvas.dataset.i18nAriaLabel));
        $('piece-tray').dataset.i18nAriaLabel = sliding ? 'unlockFreePieces' : 'unlockPieces';
        $('piece-tray').setAttribute('aria-label', t($('piece-tray').dataset.i18nAriaLabel));
        const helpKeys = sliding ? ['unlockFreeRule', 'unlockFreeHelp', 'unlockHelp3']
            : state.mode === 'match' ? ['unlockMatchRule', 'unlockMatchHelp', 'unlockHelp3']
            : ['unlockHelp1', 'unlockHelp2', 'unlockHelp3'];
        document.querySelectorAll('#unlock-help li').forEach((item, i) => {
            item.dataset.i18n = helpKeys[i]; item.textContent = t(helpKeys[i]);
        });
        document.querySelector('.board-caption').dataset.i18n = sliding ? 'unlockFreeCaption' : 'unlockCaption';
        document.querySelector('.board-caption').textContent = t(state.mode === 'free' ? 'unlockFreeCaption' : 'unlockCaption');
        $('unlock-progress').textContent = t('unlockProgress', state.removed.size, state.pieces.length);
        const locked = generating || contextLost;
        $('undo-btn').disabled = !history.canUndo() || !!state.animation || state.grabbed != null || !!state.drag || locked;
        $('hint-btn').disabled = state.won || !!state.animation || state.grabbed != null || !!state.drag || locked || !state.puzzle;
        document.querySelectorAll('#new-game-btn, #reset-btn, #share-btn, #next-level-btn, #difficulty-seg button, #size-seg button, #mode-seg button').forEach(b => { b.disabled = locked; });
        $('reset-btn').disabled = locked || !state.puzzle;
        $('share-btn').disabled = locked || !state.puzzle;
        $('puzzle-code').textContent = state.puzzle ? t('unlockCode', state.puzzle.seed.toString(36)) : '';
        $('unlock-win').hidden = !state.won;
        $('unlock-win').querySelector('h2').textContent = t(state.mode === 'match' ? 'unlockMatchComplete' : 'unlockComplete');
        $('unlock-win-detail').textContent = `${t(modeName(state.mode))} · ${t('unlockWinDetail', t(state.difficulty), state.size, lastTime)}`;
        $('next-level-btn').textContent = t('unlockNext');
        for (const p of state.pieces) {
            const button = $(`piece-${p.id}`), removed = state.removed.has(p.id);
            if (!button) continue;
            button.disabled = removed || !!state.animation || !!state.drag || (state.grabbed != null && !controlPress) || locked;
            button.classList.toggle('removed', removed);
            button.classList.toggle('selected', state.grabbed === p.id);
            if (state.mode === 'free') button.setAttribute('aria-pressed', String(state.grabbed === p.id));
            else button.removeAttribute('aria-pressed');
            button.classList.toggle('hinted', p.id === state.highlight);
            const symbols = state.mode === 'match' && showSymbols, swatch = button.querySelector('.piece-swatch');
            swatch.classList.toggle('match-token', symbols); swatch.textContent = symbols ? p.symbol : '';
            $(`marker-${p.id}`).textContent = symbols ? `${p.id}${p.symbol}` : p.id;
            const label = t(state.mode === 'free' ? 'unlockFreePiece' : 'unlockPiece', p.id, removed) + (symbols ? ` · ${p.symbol}` : '');
            button.setAttribute('aria-label', label);
            button.title = label;
        }
        syncLevelReadout();
        syncMatchUI();
    }

    function finishPull(anim) {
        if (state.mode === 'match') history.push();
        state.removed.add(anim.id);
        if (state.mode === 'free') {
            state.positions[anim.id - 1] = Free.REMOVED;
            state.selected = null;
        }
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
            const duration = anim.fromOffset !== undefined ? 420 : anim.feeding ? 1100 : anim.docking ? 460 : anim.returning ? (anim.phase === 'lift' ? 260 : 680)
                : anim.trayFull ? 420 : anim.blocked ? 340 : anim.shortPull ? Math.max(80, 320*Math.min(1,anim.distance/0.6)) : 680;
            const progress = Math.min(1, (now - anim.start) / duration), ease = progress*progress*(3-2*progress);
            anim.progress = progress;
            if (anim.returning) anim.offset = anim.phase === 'lift' ? anim.distance : anim.distance * (1 - ease);
            else anim.offset = anim.docking ? anim.distance : anim.blocked ? Math.sin(progress * Math.PI)*(anim.reducedMotion ? 0 : anim.trayFull ? 0.12 : 0.025)
                : anim.distance * (anim.shortPull ? 1-(1-progress)**3 : progress*progress);
            if (anim.fromOffset !== undefined && !anim.blocked) anim.offset = anim.fromOffset + (anim.distance - anim.fromOffset) * ease;
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
            const offset = state.animation && state.animation.id === p.id ? state.animation.offset : state.drag?.id === p.id ? state.drag.offset : 0;
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

    function pull(id, extract = false, fromOffset = 0) {
        if (state.won || state.animation || contextLost || generating) return;
        const p = state.pieces.find(p => p.id === id);
        if (!p || state.removed.has(id)) return;
        cancelPointerInput();
        if (state.mode === 'free' && !extract) {
            state.selected = id; clearFeedback(); say(readyMessage()); syncUI(); invalidate(); return;
        }
        PC.audio.unlock(); clearFeedback();
        const blockers = blockersFor(p);
        if (blockers.length) {
            flashBlocked(id, blockers);
            state.animation = { id, start: performance.now(), offset: 0, blocked: true };
            say('unlockBlocked', id, blockers);
            reactMonster('puzzled');
        } else {
            const plan = state.mode === 'match' ? Match.pullPlan(state.puzzle, state.removed, id) : null;
            if (plan && !plan.allowed) {
                flashBlocked(id);
                state.animation = { id, start: performance.now(), offset: 0, blocked: true, trayFull: true,
                    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches };
                say('unlockTrayFull');
                reactMonster('plate-full');
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
            if (fromOffset > 0) {
                state.animation.fromOffset = Math.min(fromOffset, distance);
                state.animation.offset = state.animation.fromOffset;
            }
        }
        syncUI(); invalidate();
    }

    function commitFreeDrag(drag) {
        if (Math.abs(drag.plan.offset) < 0.00001) return;
        history.push();
        if (drag.plan.extract) {
            state.animation = { id: drag.id, start: performance.now(), offset: drag.plan.offset,
                fromOffset: drag.plan.offset, distance: Math.max(drag.plan.offset + 1.5, drag.plan.exitDistance) };
        } else {
            state.positions[drag.id - 1] += drag.plan.offset; state.moveCount++;
            rebuildFreePieces(); say('unlockFreeMoved', drag.id);
        }
    }
    function rebuildFreePieces() {
        state.pieces = state.puzzle.pieces.map((p, i) => Free.at(p, state.positions[i] === Free.REMOVED ? 0 : state.positions[i]));
        view.setPieces(state.pieces, true);
    }
    function syncFreeUI() {
        const active = state.mode === 'free';
        const ready = !!state.drag?.extract;
        $('free-panel').hidden = !active || state.won || !ready;
        $('free-panel').classList.toggle('extract-ready', ready);
        $('free-selection').textContent = ready ? t('unlockFreeRelease') : '';
    }

    function returnPiece(id) {
        if (state.mode !== 'match' || state.won || state.animation || contextLost || generating || !waiting().includes(id)) return;
        const p = state.pieces.find(p => p.id === id), blockers = blockersFor(p);
        PC.audio.unlock(); clearFeedback();
        // Returning is the reverse of a full pull. The same swept-path blockers
        // apply, including obstacles reintroduced by earlier returns.
        if (blockers.length) {
            flashBlocked(null, blockers); say('unlockReturnBlocked', id, blockers);
            reactMonster('puzzled');
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
        if (state.mode === 'match' || state.mode === 'free') {
            const elapsed = shell.timer.stop();
            if (!modeSolveLogged) { PC.solves.log(state.mode === 'free' ? 'unshackle-free' : 'unshackle-match', state.size, state.difficulty, elapsed); modeSolveLogged = true; }
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
                const matchGenerator = sharedSeed !== null
                    ? ({ 1: Match.generateLegacy, 2: Match.generateV2, 3: Match.generate }[initialMatchVersion] || Match.generate) : Match.generate;
                const generate = { classic: Generator, match: matchGenerator, free: (size, difficulty, seed, onProgress) => Free.generateAsync(size, difficulty, seed, onProgress,
                    sharedSeed !== null ? initialFreeVersion : 6) }[mode];
                let lastProgressPaint = -Infinity;
                candidate = await generate(size, difficulty, seed, async fraction => {
                    // Fast colour assignments and worker messages can arrive
                    // faster than a frame. Yield for painting at most every 35 ms.
                    const now = performance.now();
                    if (fraction < 1 && now - lastProgressPaint < 35) return;
                    lastProgressPaint = now;
                    PC.progress.setFraction(fraction); await PC.progress.waitNextPaint();
                });
            } catch (error) {
                if (sharedSeed !== null) throw error;
                continue;
            }
            if (sharedSeed !== null) { puzzle = candidate; break; }
            if (avoid.has(candidate.fingerprint)) continue;
            if (!firstFresh) firstFresh = candidate;
            if (mode !== 'free' && recentStructures.has(candidate.structure) && attempt < 2) continue;
            puzzle = candidate; break;
        }
        puzzle = puzzle || firstFresh;
        if (!puzzle) throw new Error('No fresh Unshackle puzzle');
        state.puzzle = puzzle; state.difficulty = difficulty; state.size = size; state.mode = mode; modeSolveLogged = false;
        cancelAnimation(); state.won = false; state.removed = new Set();
        state.positions = mode === 'free' ? puzzle.initial.slice() : []; state.moveCount = 0; state.selected = null;
        state.pieces = mode === 'free' ? puzzle.pieces.map((p, i) => Free.at(p, state.positions[i])) : puzzle.pieces; state.graph = puzzle.graph; state.hover = null;
        pullModel = mode === 'free' ? null : Free.compile(puzzle.pieces);
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
        if (mode === 'free') {
            url.searchParams.set('mode', mode); url.searchParams.delete('mv');
            if (puzzle.version >= 6) url.searchParams.set('fv', String(puzzle.version)); else url.searchParams.delete('fv');
        } else if (mode === 'match') {
            url.searchParams.set('mode', 'match'); url.searchParams.delete('fv');
            if (puzzle.matchVersion) url.searchParams.set('mv', String(puzzle.matchVersion)); else url.searchParams.delete('mv');
        } else { url.searchParams.delete('mode'); url.searchParams.delete('mv'); url.searchParams.delete('fv'); }
        window.history.replaceState(null, '', url);
        say(readyMessage()); syncUI(); invalidate();
    }
    async function startPuzzle() {
        if (generating || contextLost) return;
        if (pendingSeed === null) syncModeSettings();
        generating = true; clearMonsterReaction(); cancelAnimation(); shell.timer.stop(); syncUI();
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
            modeSolveLogged = false;
            if (state.won) history.clear();
            else if (state.removed.size || state.moveCount) history.push();
            cancelAnimation(); state.won = false; state.removed = new Set();
            state.selected = null;
            if (state.mode === 'free') { state.positions = state.puzzle.initial.slice(); state.moveCount = 0; rebuildFreePieces(); }
            clearFeedback(); say(readyMessage()); syncUI(); invalidate();
        },
        solveSound: () => {
            [523.25, 659.25, 783.99].forEach((freq, i) => setTimeout(() => PC.audio.tone(freq, 0.18, { volume: 0.09 }), i * 100));
        },
    });
    // Catch generation failures locally without changing the shared puzzle shell.
    $('new-game-btn').addEventListener('click', e => { e.stopImmediatePropagation(); startPuzzle(); }, true);
    function syncModeSettings() {
        syncLevelReadout();
        {
            const sizes = GI.SETTINGS[shell.difficulty].sizes;
            if (!sizes.includes(shell.size)) {
                const nearest = sizes.reduce((a, b) => Math.abs(b - shell.size) < Math.abs(a - shell.size) ? b : a);
                $('size-seg').querySelector(`[data-value="${nearest}"]`).click();
            }
        }
        syncLevelReadout();
    }
    $('difficulty-seg').addEventListener('click', syncModeSettings);
    $('size-seg').addEventListener('click', syncLevelReadout);
    $('match-symbols').addEventListener('change', () => {
        showSymbols = $('match-symbols').checked;
        PC.storage.writeJSON(SYMBOLS_KEY, showSymbols); syncUI(); invalidate();
    });
    $('mode-seg').addEventListener('click', e => {
        const button = e.target.closest('button[data-mode]');
        if (!button || button.disabled || button.dataset.mode === stagedMode) return;
        modeSizes[stagedMode] = shell.size; stagedMode = button.dataset.mode;
        syncLevelReadout();
        const sizes = GI.SETTINGS[shell.difficulty].sizes;
        const remembered = sizes.includes(modeSizes[stagedMode]) ? modeSizes[stagedMode] : sizes[0];
        $('size-seg').querySelector(`[data-value="${remembered}"]`).click();
        syncModeSettings();
    });
    $('undo-btn').addEventListener('click', () => { if (!state.animation) history.undo(); });
    $('hint-btn').addEventListener('click', () => {
        if (state.animation || state.won || contextLost || generating) return;
        const previous = hintOn; clearFeedback();
        if (!previous) {
            if (state.mode === 'free') {
                const result = Free.solve(state.puzzle, state.positions);
                if (result.status === 'solved' && result.solution.length) {
                    const move = result.solution[0]; state.selected = move.id; state.highlight = move.id; hintOn = true;
                    const action = move.extract ? 'unlockFreeExtract' : move.offset > state.positions[move.id - 1] ? 'unlockFreeForward' : 'unlockFreeBack';
                    say('unlockFreeHint', move.id, t(action));
                } else say('unlockMatchUnknown');
                syncUI(); invalidate(); return;
            }
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
    $('view-reset-btn').addEventListener('click', () => { cancelPointerInput(); if (state.mode === 'free') view.setPieces(state.pieces); view.reset(); syncUI(); invalidate(); });
    $('next-level-btn').addEventListener('click', startPuzzle);
    $('share-btn').addEventListener('click', async () => {
        const ok = await PC.share.copyCurrentUrl(); PC.toast.show(t(ok ? 'shareCopied' : 'shareFailed'));
    });

    // Keep independent tap state for numeric buttons and the serving plate.
    // Delegation survives replacement of the plate contents after every move.
    function guardControlTaps(root, buttonSelector) {
        let controlTouch = null, lastControlTap = null;
        function cancelControlTap() { controlTouch = null; lastControlTap = null; }
        root.addEventListener('touchstart', e => {
            if (e.touches.length !== 1) { cancelControlTap(); return; }
            const t = e.touches[0];
            controlTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
        }, { passive: true });
        root.addEventListener('touchmove', e => {
            if (!controlTouch) return;
            const t = e.touches[0];
            if (e.touches.length !== 1 || t.identifier !== controlTouch.id
                || Math.hypot(t.clientX - controlTouch.x, t.clientY - controlTouch.y) > 10) cancelControlTap();
        }, { passive: true });
        root.addEventListener('touchcancel', cancelControlTap, { passive: true });
        root.addEventListener('touchend', e => {
            const start = controlTouch;
            controlTouch = null;
            if (!start || e.touches.length || e.changedTouches.length !== 1) { lastControlTap = null; return; }
            const t = e.changedTouches[0], now = performance.now();
            if (t.identifier !== start.id || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) { lastControlTap = null; return; }
            if (lastControlTap && now - lastControlTap.at <= 350
                && Math.abs(t.clientX - lastControlTap.x) < 40 && Math.abs(t.clientY - lastControlTap.y) < 40) {
                e.preventDefault();
                if (e.defaultPrevented) {
                    const target = document.elementFromPoint(t.clientX, t.clientY);
                    const button = target && target.closest(buttonSelector);
                    if (button && root.contains(button)) button.click();
                }
            }
            lastControlTap = { at: now, x: t.clientX, y: t.clientY };
        }, { passive: false });
    }
    guardControlTaps($('piece-tray'), '.piece-btn');
    guardControlTaps($('match-slots'), '.match-slot[data-return-id]');

    function turn(direction) {
        const turns = { left: [-0.25, 0], right: [0.25, 0], up: [0, -0.2], down: [0, 0.2] };
        cancelPointerInput(); view.rotate(...turns[direction]); syncUI(); invalidate();
    }
    document.querySelectorAll('[data-turn]').forEach(b => b.addEventListener('click', () => turn(b.dataset.turn)));

    // Each press owns one part until release. Picking is generous, while
    // movement, collision and per-mode completion remain exact.
    const distance = () => { const p = [...pointers.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
    function cancelPointerInput() {
        state.drag = null; state.grabbed = null; state.hover = null;
        pointers.clear(); gesture = null; pinchDistance = 0; controlPress = null;
        canvas.classList.remove('over-piece');
    }
    function beginPieceDrag(e) {
        const rect = canvas.getBoundingClientRect();
        const id = view.pickNear(e.clientX - rect.left, e.clientY - rect.top, state);
        if (!id) return null;
        state.grabbed = id; state.selected = id; clearFeedback(); say(readyMessage());
        const p = state.pieces[id - 1], a = view.project(p.knob), b = view.project(Engine.math.add(p.knob, p.dir));
        return { id, dx: b.x - a.x, dy: b.y - a.y, spacing: Math.hypot(b.x - a.x, b.y - a.y) };
    }
    function updatePieceDrag(e) {
        const drag = gesture.piece;
        if (drag.endOn) return;
        let travel = ((e.clientX - drag.x) * drag.dx + (e.clientY - drag.y) * drag.dy) / drag.spacing ** 2;
        if (state.mode !== 'free') travel = Math.max(0, travel);
        drag.plan = Free.dragPlan(drag.range, travel, 56 / drag.spacing);
        state.drag = { id: drag.id, offset: Math.min(drag.plan.offset, drag.visualLimit ?? Infinity), extract: drag.plan.extract };
        syncFreeUI();
        const sign = travel >= 0 ? 1 : -1, contact = sign > 0 ? drag.range.forward : drag.range.back;
        if (contact.blockers.length && Math.abs(travel - drag.plan.offset) > 0.02 && drag.warned !== sign) {
            drag.warned = sign; say('unlockFreeBlocked', drag.id, contact.blockers);
        }
    }
    canvas.addEventListener('pointerdown', e => {
        if (e.button !== 0 || state.animation || state.won || contextLost || generating || !state.puzzle) return;
        canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) {
            gesture = { x: e.clientX, y: e.clientY, moved: false, multi: false, piece: beginPieceDrag(e) };
            state.hover = null;
        } else {
            state.drag = null; state.grabbed = null; state.selected = null;
            if (gesture) gesture.multi = true;
            pinchDistance = distance();
        }
        syncUI(); invalidate();
    });
    canvas.addEventListener('pointermove', e => {
        const previous = pointers.get(e.pointerId);
        if (!previous) {
            if (e.pointerType !== 'mouse' || state.animation || state.won || contextLost || generating || !state.puzzle) return;
            const rect = canvas.getBoundingClientRect();
            state.hover = view.pick(e.clientX - rect.left, e.clientY - rect.top, state);
            canvas.classList.toggle('over-piece', !!state.hover); return;
        }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size > 1) {
            const d = distance(); if (pinchDistance > 0) view.zoom(d / pinchDistance); pinchDistance = d;
        } else if (gesture && !gesture.multi) {
            const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
            if (!gesture.moved && Math.hypot(dx, dy) >= 8) {
                gesture.moved = true;
                const drag = gesture.piece;
                if (drag) {
                    const alignment = drag.spacing ? Math.abs(dx * drag.dx + dy * drag.dy) / (Math.hypot(dx, dy) * drag.spacing) : 0;
                    // Classic/Match retain their existing drag-to-rotate gesture
                    // across a part; dragging along its axis pulls it instead.
                    if (state.mode !== 'free' && (drag.spacing < 8 || alignment < 0.65)) {
                        gesture.piece = null; state.grabbed = null; state.selected = null;
                    } else if (drag.spacing < 8) {
                        drag.endOn = true; say('unlockFreeViewAxis');
                    } else {
                        drag.x = e.clientX; drag.y = e.clientY;
                        const ps = state.mode === 'free' ? state.positions : state.pieces.map(p => state.removed.has(p.id) ? Free.REMOVED : 0);
                        const model = state.mode === 'free' ? state.puzzle.model : pullModel;
                        drag.range = model.limits(ps, drag.id - 1);
                        if (state.mode === 'match') {
                            const rect = canvas.getBoundingClientRect();
                            drag.visualLimit = view.pullPreviewDistance(state.pieces[drag.id - 1], drag.range.forward.exit,
                                { left: 8, top: 8, right: rect.width - 8, bottom: rect.height - 20 }, state);
                        }
                        state.drag = { id: drag.id, offset: 0 };
                    }
                    syncUI();
                }
            } else if (gesture.moved) {
                if (gesture.piece) updatePieceDrag(e);
                else view.rotate((e.clientX - previous.x) * 0.009, (e.clientY - previous.y) * 0.009);
            }
        }
        state.hover = null; invalidate();
    });
    function release(e, cancelled) {
        if (!pointers.has(e.pointerId)) return;
        const completed = gesture;
        pointers.delete(e.pointerId); state.drag = null; state.grabbed = null; state.selected = null;
        if (!pointers.size) gesture = null;
        else if (gesture) gesture.multi = true;
        if (!cancelled && completed && !completed.multi) {
            if (completed.piece && completed.moved) {
                const drag = completed.piece;
                if (drag.plan) {
                    if (state.mode === 'free') commitFreeDrag(drag);
                    else if (drag.plan.extract || (drag.warned === 1 && blockersFor(state.pieces[drag.id - 1]).length))
                        pull(drag.id, false, Math.min(drag.plan.offset, drag.visualLimit ?? Infinity));
                }
            } else if (!completed.moved && completed.piece) {
                if (state.mode !== 'free') pull(completed.piece.id);
            }
        }
        syncUI(); invalidate();
    }
    canvas.addEventListener('pointerup', e => release(e, false));
    canvas.addEventListener('pointercancel', e => release(e, true));
    canvas.addEventListener('lostpointercapture', e => release(e, true));
    canvas.addEventListener('pointerleave', () => { state.hover = null; canvas.classList.remove('over-piece'); });
    canvas.addEventListener('wheel', e => {
        if (contextLost || state.grabbed != null || state.drag) return;
        e.preventDefault(); view.zoom(Math.exp(-e.deltaY * 0.001)); invalidate();
    }, { passive: false });
    // The existing numbered controls also show press-only material feedback.
    $('piece-tray').addEventListener('pointerdown', e => {
        const button = e.target.closest('.piece-btn');
        if (!button || button.disabled || controlPress || pointers.size || state.animation || generating || contextLost) return;
        controlPress = { pointerId: e.pointerId }; state.grabbed = Number(button.id.slice(6));
        clearFeedback(); syncUI(); invalidate();
    });
    function releaseControl(e) {
        if (controlPress?.pointerId !== e.pointerId) return;
        controlPress = null; state.grabbed = null; syncUI(); invalidate();
    }
    document.addEventListener('pointerup', releaseControl);
    document.addEventListener('pointercancel', releaseControl);
    window.addEventListener('blur', () => { cancelPointerInput(); syncUI(); invalidate(); });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { cancelPointerInput(); syncUI(); invalidate(); }
    });
    document.addEventListener('keydown', e => {
        if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if ((state.drag || state.grabbed != null) && e.key === 'Escape') { cancelPointerInput(); syncUI(); invalidate(); e.preventDefault(); return; }
        if (state.drag || state.grabbed != null) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault(); if (!state.animation && !generating && !contextLost) history.undo(); return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey || generating || contextLost) return;
        if (/^[1-9]$/.test(e.key)) { e.preventDefault(); pull(Number(e.key)); if (state.mode === 'free') canvas.focus({ preventScroll: true }); }
        if (e.target !== canvas) return;
        const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
        if (keys[e.key]) { e.preventDefault(); turn(keys[e.key]); }
        if (e.key === 'Home') { e.preventDefault(); view.reset(); invalidate(); }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); view.zoom(1.1); invalidate(); }
        if (e.key === '-') { e.preventDefault(); view.zoom(1/1.1); invalidate(); }
    });
    canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault(); contextLost = true; clearMonsterReaction(); cancelAnimation();
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
