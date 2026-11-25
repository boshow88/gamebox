/** Sumbreak UI: SVG board, tap / drag / keyboard merging, undo, hints and a solution overlay.
 * Rules, search, reasoning and generation live in rules.js, solver.js, reasoning.js and
 * generators/sumbreak.js; worker.js runs the generator off the main thread. */
(function () {
    'use strict';
    const PC = window.PuzzleCommon, Rules = window.SumbreakRules, Solver = window.SumbreakSolver, Reasoning = window.SumbreakReasoning;
    const generate = window.PuzzleGenerators.sumbreak;
    const R = Rules.DEFAULT;
    const CELL = 100, GAP = 8, DRAG_PX = 10;
    const DIFFICULTIES = ['easy', 'medium', 'hard'];
    // Tile fill and ink by exponent (1, 2, 4, …); the last entry covers anything larger.
    const PALETTE = [
        ['#e9f7f4', '#115e56'], ['#cfeee8', '#115e56'], ['#aae2d8', '#0f4f49'], ['#80d1c3', '#0f4f49'],
        ['#4dbaa9', '#ffffff'], ['#22a090', '#ffffff'], ['#0f8577', '#ffffff'], ['#0d6b61', '#ffffff'],
        ['#0b564f', '#ffffff'], ['#08433d', '#ffffff'],
    ];
    const MUL_COLOURS = ['#7c3aed', '#ffffff'];
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    Object.assign(PC.i18n.STRINGS.en, {
        sumbreakName: 'Sumbreak',
        sumbreakBoardAria: 'Sumbreak board. Arrow keys move, Enter or Space selects and merges, Escape cancels.',
        sumbreakResetTitle: 'Start this puzzle over',
        sumbreakHintTitle: 'Explain one merge you can work out',
        sumbreakDeadPill: 'No merges left', sumbreakNoSolution: 'No solution from here',
        sumbreakReady: 'Merge equal neighbours until one tile remains.',
        sumbreakSelected: (v) => `Selected ${v}. Tap a highlighted neighbour to merge into it.`,
        sumbreakNoPartner: (v) => `This ${v} has no equal neighbour right now.`,
        sumbreakNoPartnerMul: 'This ×2 touches no number right now.',
        sumbreakCancelled: 'Selection cleared.', sumbreakMerged: (v) => `Merged into ${v}.`,
        sumbreakUndone: 'Last merge undone.', sumbreakRestarted: 'Back to the start.',
        sumbreakDeadEnd: 'No two equal tiles touch, so nothing can merge.',
        sumbreakDeadEndMul: 'Nothing can merge: no equal numbers touch, and no ×2 touches a number.',
        sumbreakWinSay: 'Solved! One tile left.',
        sumbreakGenerateFailed: 'Could not prepare a puzzle. Press New Game to try again.',
        sumbreakCell: (r, c, what) => `Row ${r}, column ${c}: ${what}`,
        sumbreakEmpty: 'empty', sumbreakBlocked: 'blocked', sumbreakIsSelected: 'selected', sumbreakIsTarget: 'can merge here',
        sumbreakHelp1: 'Merge two touching tiles with the same number: the tile you move disappears and the one it joins doubles.',
        sumbreakHelp2: 'Emptied cells stay empty and nothing slides, so plan which tiles meet. Reduce the board to a single tile to win.',
        sumbreakHelpMul: 'A ×2 tile merges with any touching number and doubles it, in either direction: drag 8 onto ×2, or ×2 onto 8, to make 16. It counts as a tile, so every ×2 must be used.',
        sumbreakHelp3Html: 'Tap a tile, then a highlighted neighbour, or drag one onto the other. Keyboard: arrows move, <strong>Enter</strong> or <strong>Space</strong> selects and merges, <strong>Esc</strong> cancels, <strong>Ctrl+Z</strong> undoes.',
        sumbreakHelp4: 'Hint explains one merge you can work out; once the position can no longer be solved, it says how many merges to undo. Reveal shows a full solution from the current position, or warns that there is none.',
        sumbreakWhyFinal: 'Two tiles left: merging them finishes the puzzle, in either direction.',
        sumbreakWhyLone: (a, b) => `${cap(a)} touches only ${b}, so they must merge.`,
        sumbreakWhyOnlyPair: 'This is the only pair of tiles that can merge, so it has to merge now.',
        sumbreakWhyForcedPair: (a, b, v) => `Apart from ${b}, ${a} touches only empty cells and larger numbers, so these two ${v}s must merge before either one changes.`,
        sumbreakTop: (v) => `the top ${v}`, sumbreakBottom: (v) => `the bottom ${v}`, sumbreakLeft: (v) => `the left ${v}`, sumbreakRight: (v) => `the right ${v}`,
        sumbreakNewTile: (v) => `the new ${v}`, sumbreakRingedTile: (v) => `the ${v} ringed in red`, sumbreakRingedTwo: (v) => `the two ${v}s ringed in red`,
        sumbreakTile: (v) => `the ${v}`, sumbreakTwo: (v) => `two ${v}s`, sumbreakAnd: (a, b) => `${a} and ${b}`,
        sumbreakWhyEliminate: (n) => (n === 1 ? 'Only one merge works here: the other one fails.' : `Only one merge works here: the other ${n} all fail.`),
        sumbreakWhyFree: (n) => (n ? `${n === 1 ? 'One merge here fails' : `${n} merges here fail`}; the rest all work.` : 'Every merge here works.'),
        sumbreakWhyTrial: (k) => (k === 1 ? 'Merging these two the right way leaves a final pair that finishes the puzzle.' : `Merging these two the right way makes each of the next ${k} merges forced, ending in a single tile.`),
        sumbreakWhySearch: 'No simple deduction applies here.',
        sumbreakWhySearchPair: 'The highlighted pair must merge.',
        sumbreakDirLone: 'Not the other way: the new tile would touch nothing.',
        sumbreakDirOnly: 'Only one direction is possible.',
        sumbreakDirRefuted: (why) => `Not the other way: then ${why}.`,
        sumbreakDirFree: 'Either direction works.',
        sumbreakExample: (why) => `For example, the red merge fails: then ${why}.`,
        sumbreakWhyDead: 'nothing can merge any more',
        sumbreakWhyStuck: (tile) => `${tile} touches only empty cells or larger numbers`,
        sumbreakWhyRivals: (tiles) => `${tiles} depend on the same partner`,
        sumbreakWhyOdd: (v, n) => `the ${v}s, the smallest tiles, form a group of ${n}; they pair only with each other, so one is always left over`,
        sumbreakWhySplit: 'the tiles are split into groups that can never meet',
        sumbreakWhySubtotal: (below, sum) => `a group of tiles below ${below} totals ${sum}, but such tiles only leave their group as whole ${below}s`,
        sumbreakWhyHalf: (tile) => `${tile} is half the total, so it can only merge last, yet without it the other tiles are cut apart`,
        sumbreakWhyBlocked: (v) => `the ${v}s that must pair up can merge in neither direction`,
        sumbreakWhyNoSurvivor: 'every possible next merge fails',
        sumbreakWhyAhead: (k, why) => `it forces ${k === 1 ? 'one more merge' : `${k} more merges`}, and then ${why}`,
        sumbreakWhyGeneric: 'a rule check shows it cannot finish',
        sumbreakDoOne: 'Merge along the arrow.', sumbreakDoAny: (n) => `Any of these ${n} merges works.`,
        sumbreakDeadHint: 'No merge is possible.',
        sumbreakUnsolvable: (why) => `This position can no longer be solved: ${why}.`,
        sumbreakUnsolvableSearch: 'This position can no longer be solved.',
        sumbreakUndoBack: (n) => (n === 1 ? 'Undo the last merge to get back on track.' : `Undo ${n} merges to get back on track.`),
        sumbreakResetBack: 'Press Reset to get back on track.',
        sumbreakUnknown: 'This position is too complex to check.',
    });
    Object.assign(PC.i18n.STRINGS.zh, {
        sumbreakName: 'Sumbreak',
        sumbreakBoardAria: 'Sumbreak 棋盤。方向鍵移動，Enter或空白鍵選取並合併，Esc取消。',
        sumbreakResetTitle: '從頭再玩這一題',
        sumbreakHintTitle: '說明一步推得出來的合併',
        sumbreakDeadPill: '無法再合併', sumbreakNoSolution: '此局面已無解',
        sumbreakReady: '合併相鄰的相同數字，直到只剩一塊。',
        sumbreakSelected: (v) => `已選取${v}。點一個標示的鄰居，把它併進去。`,
        sumbreakNoPartner: (v) => `這個${v}目前沒有相同的鄰居。`,
        sumbreakNoPartnerMul: '這個 ×2 目前沒有碰到任何數字。',
        sumbreakCancelled: '已取消選取。', sumbreakMerged: (v) => `合併成${v}。`,
        sumbreakUndone: '已復原上一次合併。', sumbreakRestarted: '回到起點。',
        sumbreakDeadEnd: '沒有相同的方塊相鄰，無法再合併。',
        sumbreakDeadEndMul: '無法再合併：沒有相同的數字相鄰，也沒有 ×2 碰到數字。',
        sumbreakWinSay: '完成！只剩一塊。',
        sumbreakGenerateFailed: '暫時無法產生題目，請按「新局」再試一次。',
        sumbreakCell: (r, c, what) => `第${r}列第${c}欄：${what}`,
        sumbreakEmpty: '空格', sumbreakBlocked: '障礙', sumbreakIsSelected: '已選取', sumbreakIsTarget: '可併入',
        sumbreakHelp1: '把兩個相鄰且數字相同的方塊合併：移動的那塊消失，被併入的那塊數字加倍。',
        sumbreakHelp2: '清空的格子會一直空著，方塊也不會滑動，要先想好哪些方塊該碰在一起。最後只剩一塊即過關。',
        sumbreakHelpMul: '×2 方塊可以和任何相鄰的數字合併，讓那個數字變兩倍，方向不拘：把 8 拖到 ×2 上，或把 ×2 拖到 8 上，都會變成 16。×2 也算一塊，每個 ×2 都要用掉才能過關。',
        sumbreakHelp3Html: '點一個方塊，再點標示的鄰居；也可以直接拖過去。鍵盤：方向鍵移動，<strong>Enter</strong>或<strong>空白鍵</strong>選取並合併，<strong>Esc</strong>取消，<strong>Ctrl+Z</strong>復原。',
        sumbreakHelp4: '「提示」會說明一步推得出來的合併；局面已經無解時，會告訴你要復原幾步。「解答」會顯示從目前局面到完成的一組解法，無解時則會提醒。',
        sumbreakWhyFinal: '只剩兩塊：把它們合併就完成了，方向不拘。',
        sumbreakWhyLone: (a, b) => `${a}只碰到${b}，兩者只能合併。`,
        sumbreakWhyOnlyPair: '這是盤面上唯一能合併的一組方塊，現在就得合併。',
        sumbreakWhyForcedPair: (a, b, v) => `${a}除了${b}以外，其他鄰居都是空格或更大的數字，所以這兩個${v}必須在任一個改變前合併。`,
        sumbreakTop: (v) => `上面的${v}`, sumbreakBottom: (v) => `下面的${v}`, sumbreakLeft: (v) => `左邊的${v}`, sumbreakRight: (v) => `右邊的${v}`,
        sumbreakNewTile: (v) => `合併出的${v}`, sumbreakRingedTile: (v) => `紅框的${v}`, sumbreakRingedTwo: (v) => `紅框的兩個${v}`,
        sumbreakTile: (v) => `${v}`, sumbreakTwo: (v) => `兩個${v}`, sumbreakAnd: (a, b) => `${a}和${b}`,
        sumbreakWhyEliminate: (n) => (n === 1 ? '這裡只有一種合併可行，另一種會失敗。' : `這裡只有一種合併可行，其他${n}種都會失敗。`),
        sumbreakWhyFree: (n) => (n ? `這裡有${n}種合併會失敗，其餘都可行。` : '這裡每種合併都可行。'),
        sumbreakWhyTrial: (k) => (k === 1 ? '這兩塊朝對的方向合併後，剩下的一對就能完成。' : `這兩塊朝對的方向合併後，接下來${k}次合併都是被迫的，最後只剩一塊。`),
        sumbreakWhySearch: '這一步沒有簡單的推理。',
        sumbreakWhySearchPair: '標示的這組必須合併。',
        sumbreakDirLone: '不能反過來：那樣新方塊會碰不到任何方塊。',
        sumbreakDirOnly: '只有一個方向可以合併。',
        sumbreakDirRefuted: (why) => `不能反過來：那樣${why}。`,
        sumbreakDirFree: '兩個方向都可以。',
        sumbreakExample: (why) => `例如紅色的合併會失敗：那樣${why}。`,
        sumbreakWhyDead: '再也沒有能合併的方塊',
        sumbreakWhyStuck: (tile) => `${tile}只碰到空格或更大的數字`,
        sumbreakWhyRivals: (tiles) => `${tiles}得搶同一個夥伴`,
        sumbreakWhyOdd: (v, n) => `最小的${v}形成${n}塊一群，只能彼此配對，總會剩下一塊`,
        sumbreakWhySplit: '方塊被分成永遠碰不到的幾群',
        sumbreakWhySubtotal: (below, sum) => `一群小於${below}的方塊總和是${sum}，但這種方塊只能湊成完整的${below}才離開這一群`,
        sumbreakWhyHalf: (tile) => `${tile}佔總和一半，只能在最後合併，但少了它其他方塊就被隔開`,
        sumbreakWhyBlocked: (v) => `必須配對的${v}兩個方向都併不了`,
        sumbreakWhyNoSurvivor: '下一步的每種合併都會失敗',
        sumbreakWhyAhead: (k, why) => `會被迫再合併${k}次，接著${why}`,
        sumbreakWhyGeneric: '規則檢查顯示無法完成',
        sumbreakDoOne: '照箭頭合併。', sumbreakDoAny: (n) => `這${n}種合併任選一種都可以。`,
        sumbreakDeadHint: '已無法合併。',
        sumbreakUnsolvable: (why) => `這個局面已經無解：${why}。`,
        sumbreakUnsolvableSearch: '這個局面已經無解。',
        sumbreakUndoBack: (n) => `復原${n}次合併就能回到有解的局面。`,
        sumbreakResetBack: '按「重設」即可回到有解的局面。',
        sumbreakUnknown: '這個局面太複雜，無法判斷。',
    });

    const $ = (id) => document.getElementById(id);
    const t = (...args) => PC.i18n.t(...args);
    const join = (parts) => parts.filter(Boolean).join(PC.i18n.locale === 'zh' ? '' : ' ');
    const svg = $('board');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const shared = PC.share.readParams();
    const urlInitial = DIFFICULTIES.includes(shared.difficulty) && Number.isInteger(shared.seed) ? shared : null;
    let pendingSeed = urlInitial ? urlInitial.seed : null;

    const state = {
        puzzle: null, difficulty: urlInitial ? urlInitial.difficulty : 'medium',
        trail: [], solver: null, selected: null, cursor: 4, keyboard: false, won: false, generating: false,
        drag: null, anim: null, nope: null, hint: null,
    };
    let shell, animTimer = 0, nopeTimer = 0, revealCache = null;
    const current = () => state.trail[state.trail.length - 1];
    const playable = () => !!state.puzzle && !state.won && !state.generating;

    const history = PC.history.create({
        limit: 64,
        snapshot: () => ({ trail: state.trail.slice() }),
        restore: (snap) => {
            cancelDrag(); endAnimation();
            if (state.won) { state.won = false; shell.clearWin(); }
            state.trail = snap.trail; state.selected = null; state.hint = null;
            say('sumbreakUndone'); sync();
        },
    });

    function say(key, ...args) { $('sumbreak-live').textContent = t(key, ...args); }
    function label(cell) { return cell.type === 'mul' ? '×' + cell.factor : R.token(cell); }
    function hasMul(b) { return b.cells.some((c) => R.isTile(c) && c.type === 'mul'); }
    function targetsOf(b, i) { return R.neighbors(b, i).filter((j) => R.canMerge(b, i, j)); }

    // ---------- drawing ----------

    function origin(b, i) { return { x: GAP + (i % b.cols) * (CELL + GAP), y: GAP + Math.floor(i / b.cols) * (CELL + GAP) }; }
    function centre(b, i) { const o = origin(b, i); return { x: o.x + CELL / 2, y: o.y + CELL / 2 }; }
    function colours(cell) {
        if (cell.type === 'mul') return MUL_COLOURS;
        const e = cell.type === 'num' ? Math.round(Math.log2(cell.value)) : PALETTE.length - 1;
        return PALETTE[Math.max(0, Math.min(PALETTE.length - 1, e))];
    }
    function add(parent, tag, attrs) { const node = PC.svgEl(tag, attrs); parent.appendChild(node); return node; }

    // A tile centred on its cell; the inner group is the animation target so a CSS scale
    // pivots on the tile centre without transform-box.
    function drawTile(parent, b, i, cell, className, offset) {
        const c = centre(b, i), text = label(cell), [fill, ink] = colours(cell);
        const dx = offset ? offset.x : 0, dy = offset ? offset.y : 0;
        const outer = add(parent, 'g', { transform: `translate(${c.x + dx} ${c.y + dy})` });
        const inner = add(outer, 'g', { class: 'sumbreak-tile' + (className ? ' ' + className : '') });
        add(inner, 'rect', { x: -CELL / 2, y: -CELL / 2, width: CELL, height: CELL, rx: 16, fill });
        const size = text.length <= 2 ? 44 : text.length === 3 ? 38 : text.length === 4 ? 31 : 25;
        add(inner, 'text', { class: 'sumbreak-num', x: 0, y: 2, fill: ink, 'font-size': size }).textContent = text;
        return inner;
    }
    function ring(parent, b, i, className, inset) {
        const o = origin(b, i), d = inset || 0;
        add(parent, 'rect', { class: className, x: o.x + d, y: o.y + d, width: CELL - 2 * d, height: CELL - 2 * d, rx: 16 - d / 2 });
    }
    function unit(b, from, to) {
        const a = centre(b, from), c = centre(b, to), len = Math.hypot(c.x - a.x, c.y - a.y);
        return { a, c, ux: (c.x - a.x) / len, uy: (c.y - a.y) / len };
    }
    function triangle(x, y, ux, uy, s) {
        const px = -uy, py = ux;
        return [[x + ux * s, y + uy * s], [x - ux * s * 0.7 + px * s, y - uy * s * 0.7 + py * s], [x - ux * s * 0.7 - px * s, y - uy * s * 0.7 - py * s]]
            .map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
    }
    function arrow(parent, b, from, to, kind, both) {
        const { a, c, ux, uy } = unit(b, from, to);
        const x1 = a.x + ux * (both ? 40 : 30), y1 = a.y + uy * (both ? 40 : 30), x2 = c.x - ux * 40, y2 = c.y - uy * 40;
        add(parent, 'line', { class: 'sumbreak-arrow ' + kind, x1, y1, x2, y2 });
        add(parent, 'polygon', { class: 'sumbreak-arrow-head ' + kind, points: triangle(c.x - ux * 34, c.y - uy * 34, ux, uy, 13) });
        if (both) add(parent, 'polygon', { class: 'sumbreak-arrow-head ' + kind, points: triangle(a.x + ux * 34, a.y + uy * 34, -ux, -uy, 13) });
    }
    // Reveal: step n of the solution, a numbered badge in the gap between the two tiles with
    // a small head pointing at the destination; both stay clear of three-digit numbers.
    function revealStep(parent, b, m, n) {
        const { a, c, ux, uy } = unit(b, m.from, m.to);
        const mx = (a.x + c.x) / 2 - ux * 4, my = (a.y + c.y) / 2 - uy * 4;
        add(parent, 'polygon', { class: 'sumbreak-reveal-head', points: triangle(mx + ux * 18, my + uy * 18, ux, uy, 7) });
        add(parent, 'circle', { class: 'sumbreak-reveal-badge', cx: mx, cy: my, r: 14 });
        add(parent, 'text', { class: 'sumbreak-reveal-num', x: mx, y: my + 1 }).textContent = String(n);
    }
    function render() {
        const b = current();
        svg.replaceChildren();
        if (!b) return;
        const W = b.cols * CELL + (b.cols + 1) * GAP, H = b.rows * CELL + (b.rows + 1) * GAP;
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.style.setProperty('--sumbreak-aspect', (W / H).toFixed(4));
        svg.classList.toggle('won', state.won);
        const drag = state.drag && state.drag.moved && !state.drag.inert ? state.drag : null;
        const selected = state.selected, targets = selected != null ? targetsOf(b, selected) : [];
        const marks = hintMarks(), anim = state.anim;
        const slots = add(svg, 'g', { class: 'sumbreak-slots' }), tiles = add(svg, 'g', { class: 'sumbreak-tiles' });
        const over = add(svg, 'g', { class: 'sumbreak-over' });
        for (let i = 0; i < b.cells.length; i++) {
            const o = origin(b, i), cell = b.cells[i];
            const kind = cell === R.EMPTY ? ' empty' : R.isTile(cell) ? '' : ' block';
            add(slots, 'rect', { class: 'sumbreak-slot' + kind, x: o.x, y: o.y, width: CELL, height: CELL, rx: 16 });
            if (cell === R.EMPTY) add(slots, 'circle', { class: 'sumbreak-hole', cx: o.x + CELL / 2, cy: o.y + CELL / 2, r: 6 });
            if (!R.isTile(cell) || (drag && drag.from === i)) continue;
            const cls = [];
            if (i === selected) cls.push('selected');
            else if (selected != null && !targets.includes(i)) cls.push('dim');
            if (anim && anim.to === i) cls.push('pop');
            if (state.nope === i) cls.push('nope');
            drawTile(tiles, b, i, cell, cls.join(' '));
        }
        if (anim) {
            const from = centre(b, anim.from), to = centre(b, anim.to);
            const ghost = drawTile(tiles, b, anim.from, anim.cell, 'sumbreak-ghost');
            ghost.style.setProperty('--dx', `${to.x - from.x}px`);
            ghost.style.setProperty('--dy', `${to.y - from.y}px`);
        }
        const reveal = revealMoves(b);
        if (reveal) reveal.forEach((m, k) => revealStep(over, b, m, k + 1));
        for (const j of targets) ring(over, b, j, 'sumbreak-target' + (drag && drag.over === j ? ' over' : ''), -3);
        for (const i of marks.rings) ring(over, b, i, 'sumbreak-hint-ring' + (marks.error ? ' error' : ''), -5);
        for (const i of marks.refs) ring(over, b, i, 'sumbreak-ref-ring', marks.rings.includes(i) ? 5 : -5);
        for (const m of marks.arrows) arrow(over, b, m.from, m.to, m.kind, m.both);
        if (drag) drawTile(over, b, drag.from, b.cells[drag.from], 'selected lifted', { x: drag.dx, y: drag.dy });
        if (state.keyboard && document.activeElement === svg) ring(over, b, state.cursor, 'sumbreak-cursor', -7);
    }

    // ---------- reveal ----------

    // The remaining solution from the current position: an array of merges, null when the
    // position can no longer be solved, undefined when Reveal is off or search gave up.
    function revealMoves(b) {
        if (!shell || !shell.revealed || state.won || !state.solver) return undefined;
        const key = R.key(b);
        if (!revealCache || revealCache.key !== key) {
            revealCache = { key, moves: R.status(b) === 'dead-end' ? null : state.solver.solve(b) };
        }
        return revealCache.moves;
    }

    // ---------- hints ----------

    // Pressing Hint toggles: show one explained step, press again (or play on) to dismiss.
    function toggleHint() {
        if (!playable()) return;
        if (state.hint) { state.hint = null; sync(); return; }
        const b = current();
        const step = Reasoning.nextStep(R, b, { solver: state.solver });
        state.hint = { key: R.key(b), step, back: step.move ? null : recovery() };
        sync();
    }
    // Merges to undo to reach the latest solvable position (null: reset instead).
    function recovery() {
        for (let k = state.trail.length - 2; k >= 0; k--) {
            if (state.solver.isSolvable(state.trail[k]) === true) return state.trail.length - 1 - k;
        }
        return null;
    }
    // Merges a hint points at. A search step that kept a proved pair shows that pair only.
    function shownMoves(s) {
        const moves = s.alternatives || [s.move];
        if (s.technique === 'search' && s.pair) {
            const inPair = moves.filter((m) => s.pair.includes(m.from) && s.pair.includes(m.to));
            if (inPair.length) return inPair;
        }
        return moves;
    }
    function exampleOf(step) {
        const refs = step.eliminated || [];
        return refs.reduce((best, r) => (!best || r.level < best.level ? r : best), null);
    }
    // The refutation a hint's text spells out: the other direction of its pair, else the red merge.
    function explained(s) { return s.direction === 'refuted' ? s.refuted[0] : exampleOf(s); }
    // Tiles a refutation names (see `why`) that are still on the board, ringed in red. The tile
    // its merge would make is called the new one instead.
    const NAMED = ['stuck', 'rivals', 'half'];
    function ringedBy(ref) {
        return ref && NAMED.includes(ref.reason.id) ? ref.reason.cells.filter((c) => c !== ref.move.to) : [];
    }
    function hintMarks() {
        const out = { rings: [], refs: [], arrows: [], error: false }, h = state.hint, b = current();
        if (!h || !b || h.key !== R.key(b)) return out;
        const s = h.step;
        if (!s.move) {
            out.error = true;
            if (s.reason && s.reason.cells) out.rings = s.reason.cells.slice();
            return out;
        }
        out.rings = (s.pair || [s.move.from, s.move.to]).slice();
        out.refs = ringedBy(explained(s));
        const example = exampleOf(s);
        if (example) out.arrows.push({ from: example.move.from, to: example.move.to, kind: 'refuted' });
        const moves = shownMoves(s);
        for (const m of moves) {
            if (moves.some((x) => x.from === m.to && x.to === m.from)) {
                if (m.from < m.to) out.arrows.push({ from: m.from, to: m.to, kind: 'move', both: true });
            } else out.arrows.push({ from: m.from, to: m.to, kind: 'move' });
        }
        return out;
    }
    // `made` is the cell a refuted merge fills. The other tiles a reason names are ringed in red:
    // by ringedBy in a move hint, by the error rings on a lost position. Lookahead reasons
    // describe a later position, so their tiles stay `plain`.
    function why(r, made, plain) {
        const one = (c) => t(plain ? 'sumbreakTile' : c === made ? 'sumbreakNewTile' : 'sumbreakRingedTile', r.value);
        switch (r.id) {
            case 'dead-end': return t('sumbreakWhyDead');
            case 'stuck': return t('sumbreakWhyStuck', one(r.cells[0]));
            case 'rivals': return t('sumbreakWhyRivals', plain ? t('sumbreakTwo', r.value)
                : r.cells.includes(made) ? t('sumbreakAnd', t('sumbreakNewTile', r.value), t('sumbreakRingedTile', r.value)) : t('sumbreakRingedTwo', r.value));
            case 'odd-group': return t('sumbreakWhyOdd', r.value, r.cells.length);
            case 'split': return t('sumbreakWhySplit');
            case 'subtotal': return t('sumbreakWhySubtotal', r.below, r.sum);
            case 'half': return t('sumbreakWhyHalf', one(r.cells[0]));
            case 'pair-blocked': return t('sumbreakWhyBlocked', r.value);
            case 'no-survivor': return t('sumbreakWhyNoSurvivor');
            case 'lookahead': return r.chain.length ? t('sumbreakWhyAhead', r.chain.length, why(r.final, null, true)) : why(r.final, null, true);
            default: return t('sumbreakWhyGeneric');
        }
    }
    function directionText(s) {
        if (s.direction === 'lone') return t('sumbreakDirLone');
        if (s.direction === 'only') return t('sumbreakDirOnly');
        if (s.direction === 'refuted') return t('sumbreakDirRefuted', why(s.refuted[0].reason, s.refuted[0].move.to));
        return s.freeDirection ? t('sumbreakDirFree') : '';
    }
    // Both tiles of a pair look alike inside their rings, so each is named by where it sits
    // relative to the other: the anchor first, then its partner.
    function pairNames(b, s) {
        const a = s.anchor, p = s.pair[0] === a ? s.pair[1] : s.pair[0];
        const side = (i, j) => {
            const ri = Math.floor(i / b.cols), rj = Math.floor(j / b.cols);
            return t(ri < rj ? 'sumbreakTop' : ri > rj ? 'sumbreakBottom' : i < j ? 'sumbreakLeft' : 'sumbreakRight', label(b.cells[i]));
        };
        return [side(a, p), side(p, a)];
    }
    function whyText(s, b) {
        const v = s.anchor != null ? label(b.cells[s.anchor]) : '';
        const example = exampleOf(s);
        switch (s.technique) {
            case 'final': return t('sumbreakWhyFinal');
            case 'lone': return join([t('sumbreakWhyLone', ...pairNames(b, s)), directionText(s)]);
            case 'only-pair': return join([t('sumbreakWhyOnlyPair'), directionText(s)]);
            case 'forced-pair': return join([t('sumbreakWhyForcedPair', ...pairNames(b, s), v), directionText(s)]);
            case 'eliminate': return join([t('sumbreakWhyEliminate', s.eliminated.length), example && t('sumbreakExample', why(example.reason, example.move.to))]);
            case 'free': return join([t('sumbreakWhyFree', s.eliminated.length), example && t('sumbreakExample', why(example.reason, example.move.to))]);
            case 'trial': return t('sumbreakWhyTrial', s.chain.length - 1);
            default: return s.pair ? t('sumbreakWhySearchPair') : t('sumbreakWhySearch');
        }
    }
    function doText(s) {
        if (s.technique === 'final') return '';
        const moves = shownMoves(s);
        return moves.length > 1 ? t('sumbreakDoAny', moves.length) : t('sumbreakDoOne');
    }
    function hintText(h, b) {
        const s = h.step;
        if (s.move) return join([whyText(s, b), doText(s)]);
        if (s.technique === 'unknown') return t('sumbreakUnknown');
        const lost = s.technique === 'dead-end' ? t('sumbreakDeadHint')
            : s.reason ? t('sumbreakUnsolvable', why(s.reason)) : t('sumbreakUnsolvableSearch');
        return join([lost, h.back ? t('sumbreakUndoBack', h.back) : t('sumbreakResetBack')]);
    }
    function renderHint() {
        const banner = $('hint-banner'), h = state.hint, b = current();
        if (!h || !b || h.key !== R.key(b) || state.won) { banner.hidden = true; banner.textContent = ''; banner.classList.remove('error'); return; }
        banner.textContent = hintText(h, b);
        banner.classList.toggle('error', !h.step.move);
        banner.hidden = false;
    }

    // ---------- state sync ----------

    function sync() {
        const b = current(), status = b ? R.status(b) : null, locked = state.generating || !state.puzzle;
        $('undo-btn').disabled = locked || !history.canUndo();
        $('reset-btn').disabled = locked;
        $('share-btn').disabled = locked;
        if (locked) { $('hint-btn').disabled = true; $('reveal-btn').disabled = true; }
        else if (!state.won) { $('hint-btn').disabled = false; $('reveal-btn').disabled = false; }
        const lost = !locked && !state.won && status !== 'dead-end' && b && revealMoves(b) === null;
        $('sumbreak-dead-pill').hidden = !(status === 'dead-end' || lost);
        $('sumbreak-dead-text').textContent = status === 'dead-end' ? t('sumbreakDeadPill') : t('sumbreakNoSolution');
        renderHint();
        render();
    }
    function announce(i) {
        const b = current(), cell = b.cells[i];
        const parts = [cell === R.EMPTY ? t('sumbreakEmpty') : R.isTile(cell) ? label(cell) : t('sumbreakBlocked')];
        if (i === state.selected) parts.push(t('sumbreakIsSelected'));
        else if (state.selected != null && R.canMerge(b, state.selected, i)) parts.push(t('sumbreakIsTarget'));
        $('sumbreak-live').textContent = t('sumbreakCell', Math.floor(i / b.cols) + 1, (i % b.cols) + 1, parts.join(', '));
    }

    // ---------- moves ----------

    function select(i) {
        const b = current();
        if (i == null) {
            if (state.selected != null) say('sumbreakCancelled');
            state.selected = null;
        } else if (!targetsOf(b, i).length) {
            state.selected = null; nudge(i);
            if (b.cells[i].type === 'mul') say('sumbreakNoPartnerMul'); else say('sumbreakNoPartner', label(b.cells[i]));
        } else {
            state.selected = i; state.cursor = i; say('sumbreakSelected', label(b.cells[i]));
        }
        sync();
    }
    // A short shake on a tile that has nothing to merge with.
    function nudge(i) {
        clearTimeout(nopeTimer);
        if (reducedMotion.matches) { state.nope = null; return; }
        state.nope = i;
        nopeTimer = setTimeout(() => { state.nope = null; render(); }, 320);
    }
    function tap(i) {
        if (!playable()) return;
        const b = current();
        if (state.selected != null) {
            if (i === state.selected) { select(null); return; }
            if (R.canMerge(b, state.selected, i)) { merge(state.selected, i); return; }
        }
        select(R.isTile(b.cells[i]) ? i : null);
    }
    function merge(from, to) {
        const b = current();
        if (!playable() || !R.canMerge(b, from, to)) return;
        PC.audio.unlock();
        history.push();
        const next = R.applyMerge(b, { from, to });
        state.trail.push(next);
        state.selected = null; state.cursor = to; state.hint = null;
        startAnimation(b, from, to);
        const tile = next.cells[to], status = R.status(next);
        const step = tile.type === 'num' ? Math.min(12, Math.log2(tile.value)) : 6;
        PC.audio.tone(262 * Math.pow(2, step / 6), 0.09, { volume: 0.05 });
        if (status === 'won') { state.won = true; recordWin(); say('sumbreakWinSay'); }
        else if (status === 'dead-end') say(hasMul(next) ? 'sumbreakDeadEndMul' : 'sumbreakDeadEnd');
        else say('sumbreakMerged', label(tile));
        sync();
    }
    function startAnimation(before, from, to) {
        endAnimation();
        if (reducedMotion.matches) return;
        state.anim = { from, to, cell: before.cells[from] };
        animTimer = setTimeout(() => { animTimer = 0; state.anim = null; render(); }, 300);
    }
    function endAnimation() { clearTimeout(animTimer); animTimer = 0; state.anim = null; }
    // A drag that does not merge leaves the selection as it was before the drag.
    function cancelDrag() {
        const d = state.drag;
        state.drag = null;
        if (d && d.moved && !d.inert) state.selected = d.prior;
    }

    function pick(segId, value) {
        const button = $(segId).querySelector(`[data-value="${value}"]`);
        if (button) button.click();
    }
    // The shell records the solve against its staged selector values, so attribute it to the
    // puzzle that was actually played.
    function recordWin() {
        const staged = shell.difficulty;
        if (staged !== state.difficulty) pick('difficulty-seg', state.difficulty);
        shell.markSolved();
        if (staged !== state.difficulty) pick('difficulty-seg', staged);
    }

    function restart() {
        if (!state.puzzle) return;
        cancelDrag(); endAnimation();
        if (state.won) history.clear();
        else if (state.trail.length > 1) history.push();
        state.trail = [state.trail[0]]; state.won = false; state.selected = null; state.hint = null;
        say('sumbreakRestarted'); sync();
    }

    // ---------- generation ----------

    function randomSeed() {
        return window.crypto && window.crypto.getRandomValues
            ? window.crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296);
    }
    // Puzzles are made in a worker (one per puzzle) when the page allows it, and each
    // difficulty's next puzzle is started in advance: after a puzzle loads, and when a
    // difficulty is picked. Without a worker they are made on the main thread on demand.
    let workers = typeof Worker === 'function';
    const prepared = new Map();
    function inWorker(difficulty, seed) {
        const job = { seed, onProgress: null };
        job.promise = new Promise((resolve, reject) => {
            const worker = new Worker('../js/games/sumbreak/worker.js');
            worker.onmessage = ({ data }) => {
                if (data.puzzle) { worker.terminate(); resolve(data.puzzle); }
                else if (data.error) { worker.terminate(); reject(new Error(data.error)); }
                else if (job.onProgress) job.onProgress(data.fraction);
            };
            worker.onerror = (e) => { e.preventDefault(); worker.terminate(); reject(new Error(e.message || 'Sumbreak worker failed')); };
            worker.postMessage({ difficulty, seed });
        });
        job.promise.catch(() => { workers = false; prepared.delete(difficulty); });
        return job;
    }
    function prepareNext(difficulty) {
        if (!workers || prepared.has(difficulty)) return;
        try { prepared.set(difficulty, inWorker(difficulty, randomSeed())); } catch (_) { workers = false; }
    }
    async function makePuzzle(difficulty, seed) {
        let job = seed == null ? prepared.get(difficulty) : null;
        if (job) prepared.delete(difficulty);
        if (seed == null) seed = job ? job.seed : randomSeed();
        if (!job && workers) { try { job = inWorker(difficulty, seed); } catch (_) { workers = false; } }
        if (job) {
            job.onProgress = (fraction) => PC.progress.setFraction(fraction);
            try { return await job.promise; } catch (_) { /* fall back to the main thread */ }
        }
        let lastPaint = -Infinity;
        return generate(difficulty, seed, async (fraction) => {
            const now = performance.now();
            if (now - lastPaint < 35) return;
            lastPaint = now;
            PC.progress.setFraction(fraction);
            await PC.progress.waitNextPaint();
        });
    }
    async function loadPuzzle() {
        const difficulty = shell.difficulty;
        const seed = pendingSeed;
        pendingSeed = null;
        const puzzle = await makePuzzle(difficulty, seed);
        const start = R.parse(puzzle.board);
        cancelDrag(); endAnimation();
        state.puzzle = puzzle; state.difficulty = difficulty; state.trail = [start];
        state.solver = Solver.createSolver(R); revealCache = null;
        if (puzzle.solution) state.solver.learn(start, puzzle.solution);
        state.selected = null; state.cursor = Math.floor(start.cells.length / 2); state.won = false; state.hint = null;
        history.clear();
        PC.share.replaceUrl({ difficulty, seed: puzzle.seed });
        dropSizeParam();
        say('sumbreakReady');
        prepareNext(difficulty);
    }
    // Links from before the board size followed the difficulty still carry `size`.
    function dropSizeParam() {
        try {
            const url = new URL(location.href);
            if (!url.searchParams.has('size')) return;
            url.searchParams.delete('size');
            window.history.replaceState(null, '', url.toString());
        } catch (_) { /* file:// */ }
    }
    async function startPuzzle() {
        if (state.generating) return;
        state.generating = true; cancelDrag(); endAnimation(); sync();
        try { await shell.start(); }
        catch (_) { PC.toast.show(t('sumbreakGenerateFailed')); }
        finally { state.generating = false; sync(); }
    }

    // ---------- input ----------

    function svgPoint(e) {
        const ctm = svg.getScreenCTM();
        return ctm ? new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()) : null;
    }
    function cellAt(e) {
        const p = svgPoint(e), b = current();
        if (!p || !b) return null;
        const c = Math.floor((p.x - GAP / 2) / (CELL + GAP)), r = Math.floor((p.y - GAP / 2) / (CELL + GAP));
        return r >= 0 && r < b.rows && c >= 0 && c < b.cols ? r * b.cols + c : null;
    }
    svg.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !playable()) return;
        state.keyboard = false;
        const i = cellAt(e);
        if (i == null) return;
        svg.setPointerCapture(e.pointerId);
        state.drag = { id: e.pointerId, from: i, prior: state.selected, x: e.clientX, y: e.clientY, moved: false, inert: false, over: null, dx: 0, dy: 0 };
        PC.audio.unlock();
    });
    svg.addEventListener('pointermove', (e) => {
        const d = state.drag;
        if (!d || d.id !== e.pointerId) return;
        if (!d.moved) {
            if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_PX) return;
            d.moved = true;
            const b = current();
            d.inert = !R.isTile(b.cells[d.from]) || !targetsOf(b, d.from).length;
            if (!d.inert) { state.selected = d.from; say('sumbreakSelected', label(b.cells[d.from])); sync(); }
        }
        if (d.inert) return;
        const b = current(), p = svgPoint(e), o = centre(b, d.from), reach = CELL + GAP;
        if (!p) return;
        // At most one cell away, and never past the board edge.
        const W = b.cols * (CELL + GAP) + GAP, H = b.rows * (CELL + GAP) + GAP;
        d.dx = Math.max(-reach, CELL / 2 - o.x, Math.min(reach, W - CELL / 2 - o.x, p.x - o.x));
        d.dy = Math.max(-reach, CELL / 2 - o.y, Math.min(reach, H - CELL / 2 - o.y, p.y - o.y));
        d.over = cellAt(e);
        render();
    });
    function endPointer(e, cancelled) {
        const d = state.drag;
        if (!d || d.id !== e.pointerId) return;
        if (!d.moved || d.inert) {
            state.drag = null;
            if (cancelled) render(); else tap(d.from);
            return;
        }
        if (!cancelled && d.over != null && R.canMerge(current(), d.from, d.over)) { state.drag = null; merge(d.from, d.over); return; }
        cancelDrag();
        // Released back on its own cell: the same as tapping it.
        if (!cancelled && d.over === d.from) { select(d.prior === d.from ? null : d.from); return; }
        if (d.prior == null) say('sumbreakCancelled'); else say('sumbreakSelected', label(current().cells[d.prior]));
        sync();
    }
    svg.addEventListener('pointerup', (e) => endPointer(e, false));
    svg.addEventListener('pointercancel', (e) => endPointer(e, true));
    svg.addEventListener('lostpointercapture', (e) => endPointer(e, true));
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    svg.addEventListener('focus', render);
    svg.addEventListener('blur', render);
    svg.addEventListener('keydown', (e) => {
        if (!state.puzzle || state.generating || e.ctrlKey || e.metaKey || e.altKey) return;
        const b = current();
        const steps = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        if (steps[e.key]) {
            e.preventDefault();
            state.keyboard = true;
            const r = Math.floor(state.cursor / b.cols) + steps[e.key][0], c = (state.cursor % b.cols) + steps[e.key][1];
            if (r >= 0 && r < b.rows && c >= 0 && c < b.cols) state.cursor = r * b.cols + c;
            announce(state.cursor); render();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            state.keyboard = true;
            tap(state.cursor);
            if (!state.won) announce(state.cursor);
        } else if (e.key === 'Escape' && state.selected != null) {
            e.preventDefault();
            select(null);
        }
    });
    document.addEventListener('keydown', (e) => {
        if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (!state.generating && !state.drag) history.undo();
        }
    });
    window.addEventListener('blur', () => { if (state.drag) { cancelDrag(); sync(); } });

    // ---------- wiring ----------

    shell = PC.shell.create({
        gameId: 'fuse',
        difficulty: { default: state.difficulty },
        // The difficulty picks the board shape; the shell requires a size, inert without #size-seg.
        size: { kind: 'segmented', default: 0 },
        onNewGame: loadPuzzle,
        onReset: restart,
        onReveal: () => { state.hint = null; sync(); },
        solveSound: () => {
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => PC.audio.tone(f, 0.16, { volume: 0.08 }), i * 90));
        },
    });
    svg.classList.add('drag-board');
    // Catch generation failures locally without changing the shared shell.
    $('new-game-btn').addEventListener('click', (e) => { e.stopImmediatePropagation(); startPuzzle(); }, true);
    $('difficulty-seg').addEventListener('click', (e) => {
        const button = e.target.closest('[data-value]');
        if (button && DIFFICULTIES.includes(button.dataset.value)) prepareNext(button.dataset.value);
    });
    $('undo-btn').addEventListener('click', () => history.undo());
    $('hint-btn').addEventListener('click', toggleHint);
    $('share-btn').addEventListener('click', async () => {
        const ok = await PC.share.copyCurrentUrl();
        PC.toast.show(t(ok ? 'shareCopied' : 'shareFailed'));
    });
    PC.i18n.subscribe(sync);
    startPuzzle();
})();
