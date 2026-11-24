/** Fuse UI: SVG board, tap / drag / keyboard merging, undo, progressive hints and an
 * optional exact-search analysis view. Rules, search, reasoning and generation live in
 * rules.js, solver.js, reasoning.js and generators/fuse.js. */
(function () {
    'use strict';
    const PC = window.PuzzleCommon, Rules = window.FuseRules, Solver = window.FuseSolver, Reasoning = window.FuseReasoning;
    const generate = window.PuzzleGenerators.fuse;
    const R = Rules.DEFAULT;
    const SIZE = 3, CELL = 100, GAP = 8, DRAG_PX = 10, PLAN_CAP = 50;
    const DIFFICULTIES = ['easy', 'medium', 'hard'];
    // Tile fill and ink by exponent (1, 2, 4, …); the last entry covers anything larger.
    const PALETTE = [
        ['#e9f7f4', '#115e56'], ['#cfeee8', '#115e56'], ['#aae2d8', '#0f4f49'], ['#80d1c3', '#0f4f49'],
        ['#4dbaa9', '#ffffff'], ['#22a090', '#ffffff'], ['#0f8577', '#ffffff'], ['#0d6b61', '#ffffff'],
        ['#0b564f', '#ffffff'], ['#08433d', '#ffffff'],
    ];

    Object.assign(PC.i18n.STRINGS.en, {
        fuseName: 'Fuse',
        fuseBoardAria: 'Fuse board. Arrow keys move, Enter or Space selects and merges, Escape cancels.',
        fuseRestart: 'Restart', fuseRestartTitle: 'Start this puzzle over',
        fuseAnalysis: 'Analysis', fuseAnalysisTitle: 'Show exact-search results for every merge',
        fuseHintTitle: 'Show a hint; press again for more',
        fuseLevel: (diff, rows, cols) => `${diff} · ${rows}×${cols}`, fuseCode: (code) => `#${code}`,
        fuseTiles: (n) => (n === 1 ? '1 tile left' : `${n} tiles left`), fuseDeadPill: 'No merges left',
        fuseReady: 'Merge equal neighbours until one tile remains.',
        fuseSelected: (v) => `Selected ${v}. Tap a highlighted neighbour to merge into it.`,
        fuseNoPartner: (v) => `This ${v} has no equal neighbour right now.`,
        fuseCancelled: 'Selection cleared.', fuseMerged: (v) => `Merged into ${v}.`,
        fuseUndone: 'Last merge undone.', fuseRestarted: 'Back to the start.',
        fuseDeadEnd: 'No two equal tiles touch, so nothing can merge.',
        fuseDeadPanel: 'Undo the last merge or restart this puzzle.',
        fuseWin: 'Fused!', fuseWinSay: 'Fused! One tile left.', fuseWinDetail: (diff, time) => `${diff} · ${time}`, fuseNext: 'Next puzzle',
        fuseGenerateFailed: 'Could not prepare a puzzle. Press New Game to try again.',
        fuseCell: (r, c, what) => `Row ${r}, column ${c}: ${what}`,
        fuseEmpty: 'empty', fuseBlocked: 'blocked', fuseIsSelected: 'selected', fuseIsTarget: 'can merge here',
        fuseHelp1: 'Merge two touching tiles with the same number: the tile you move disappears and the one it joins doubles.',
        fuseHelp2: 'Emptied cells stay empty and nothing slides, so plan which tiles meet. Reduce the board to a single tile to win.',
        fuseHelp3Html: 'Tap a tile, then a highlighted neighbour, or drag one onto the other. Keyboard: arrows move, <strong>Enter</strong> selects and merges, <strong>Esc</strong> cancels, <strong>Ctrl+Z</strong> undoes.',
        fuseHelp4: 'Each press of Hint tells you a little more. Analysis shows exact-search results and is off unless you turn it on.',
        fuseHintBadge: (tier) => `Hint ${tier}/3`, fuseStuckBadge: 'Stuck', fuseSearchBadge: 'Search',
        fuseLevelTag: (n, name) => `Level ${n} · ${name}`,
        fuseLevel1: 'Direct', fuseLevel2: 'Pairing', fuseLevel3: 'Connectivity', fuseLevel4: 'Totals', fuseLevel5: 'Look-ahead', fuseLevel6: 'Search',
        fuseLookFinal: 'Two tiles left.',
        fuseLookLone: 'Look at the highlighted tile. How many tiles does it touch?',
        fuseLookOnlyPair: 'Count the pairs of equal neighbours on the board.',
        fuseLookForcedPair: 'Look at the highlighted tile. Which of its neighbours could it ever merge with?',
        fuseLookEliminate: 'Only one merge here keeps the puzzle solvable. Check what each merge would leave behind.',
        fuseLookFree: 'Some merges here are traps. Check what each merge would leave behind.',
        fuseLookTrial: 'Picture a merge between the highlighted tiles and follow what it forces.',
        fuseLookSearch: 'No step-by-step deduction covers this position.',
        fuseWhyFinal: 'Merging the last two tiles finishes the puzzle, in either direction.',
        fuseWhyLone: (v) => `This ${v} touches only one tile, an equal ${v}, so that is its only partner.`,
        fuseWhyOnlyPair: 'This is the only pair of equal neighbours, so it has to merge now.',
        fuseWhyForcedPair: (v) => `Its other neighbours are empty or larger, and tiles never shrink, so the ${v} beside it is its only possible partner. They must merge before either one changes.`,
        fuseWhyEliminate: (n) => (n === 1 ? 'The other merge fails (red).' : `The other ${n} merges all fail (red).`),
        fuseWhyFree: (n) => (n ? `${n === 1 ? 'One merge fails' : `${n} merges fail`} (red); every other merge still works (checked by search).` : 'Every merge here still works (checked by search).'),
        fuseWhyTrial: (k) => (k === 1 ? 'Merging these two the right way leaves a final pair that finishes the puzzle.' : `Merging these two the right way makes each of the next ${k} merges forced, ending in a single tile.`),
        fuseWhySearch: 'Exact search found that the highlighted merges keep the puzzle solvable.',
        fuseWhySearchPair: 'The highlighted pair must merge, but choosing the direction needs search.',
        fuseDirLone: 'Merge it into its neighbour: the other way, the new tile would touch nothing.',
        fuseDirOnly: 'Only one direction is possible.',
        fuseDirRefuted: (why) => `Not the other way: then ${why}.`,
        fuseDirFree: 'Either direction works (checked by search).',
        fuseExample: (why) => `For the bold one, ${why}.`,
        fuseWhyDead: 'no two equal tiles touch',
        fuseWhyStuck: (v) => `the ${v} touches only empty cells or larger tiles`,
        fuseWhyRivals: (v) => `two ${v}s depend on the same partner`,
        fuseWhyOdd: (v, n) => `the ${v}s, the smallest tiles, form a group of ${n}; they pair only with each other, so one is always left over`,
        fuseWhySplit: 'the tiles are split into groups that can never meet',
        fuseWhySubtotal: (below, sum) => `a group of tiles below ${below} totals ${sum}, but such tiles only leave their group as whole ${below}s`,
        fuseWhyHalf: (v) => `the ${v} is half the total, so it can only merge last, yet without it the other tiles are cut apart`,
        fuseWhyBlocked: (v) => `the ${v}s that must pair up can merge in neither direction`,
        fuseWhyNoSurvivor: 'every possible next merge fails',
        fuseWhyAhead: (k, why) => `it forces ${k === 1 ? 'one more merge' : `${k} more merges`}, and then ${why}`,
        fuseWhyGeneric: 'a rule check shows it cannot finish',
        fuseDoOne: 'Merge along the arrow.', fuseDoAny: (n) => `Any of these ${n} merges works.`,
        fuseDoOthers: 'Other merges work too; this one follows from the reasoning.',
        fuseDoAlso: 'Other merges work too.',
        fuseDoSearch: 'Found by exact search, not by a deduction.',
        fuseDeadHint: 'No merge is possible.',
        fuseUnsolvable: (why) => `This position can no longer be solved: ${why}.`,
        fuseUnsolvableSearch: 'This position can no longer be solved (found by exact search).',
        fuseUndoBack: (n) => (n === 1 ? 'Undo the last merge to get back on track.' : `Undo ${n} merges to get back on track.`),
        fuseRestartBack: 'Restart to get back on track.',
        fuseGoBack: (n) => (n === 1 ? 'Undo 1 merge' : `Undo ${n} merges`),
        fuseUnknown: 'This position is too large to check within the search limit.',
        fuseAnalysisHead: 'Analysis · exact search', fuseAnalysisNote: 'Search results, not human deductions.',
        fuseAnalysisSolvable: (w, n) => `Solvable: ${w} of ${n} merges keep it solvable (green).`,
        fuseAnalysisUnsolvable: 'Unsolvable from here: every merge loses (red).',
        fuseAnalysisDead: 'No merge is possible.', fuseAnalysisWon: 'Solved.',
        fuseAnalysisUnknown: 'Search limit reached; results are incomplete.',
        fuseAnalysisPlans: (n, capped) => `${capped ? `${n}+` : n} distinct solution${n === 1 && !capped ? '' : 's'} from here (merge order ignored).`,
        fuseAnalysisProfile: (diff, level, span) => `Rated ${diff}: the hardest step is level ${level}${span > 1 ? `, picturing ${span} merges ahead` : ''}.`,
    });
    Object.assign(PC.i18n.STRINGS.zh, {
        fuseName: '融合',
        fuseBoardAria: '融合棋盤。方向鍵移動，Enter或空白鍵選取並合併，Esc取消。',
        fuseRestart: '重新開始', fuseRestartTitle: '從頭再玩這一題',
        fuseAnalysis: '分析', fuseAnalysisTitle: '顯示每種合併的精確搜尋結果',
        fuseHintTitle: '顯示提示；再按一次看更多',
        fuseLevel: (diff, rows, cols) => `${diff}・${rows}×${cols}`, fuseCode: (code) => `#${code}`,
        fuseTiles: (n) => `剩${n}塊`, fuseDeadPill: '無法再合併',
        fuseReady: '合併相鄰的相同數字，直到只剩一塊。',
        fuseSelected: (v) => `已選取${v}。點一個標示的鄰居，把它併進去。`,
        fuseNoPartner: (v) => `這個${v}目前沒有相同的鄰居。`,
        fuseCancelled: '已取消選取。', fuseMerged: (v) => `合併成${v}。`,
        fuseUndone: '已復原上一次合併。', fuseRestarted: '回到起點。',
        fuseDeadEnd: '沒有相同的方塊相鄰，無法再合併。',
        fuseDeadPanel: '復原上一步，或重新開始這一題。',
        fuseWin: '融合完成！', fuseWinSay: '融合完成！只剩一塊。', fuseWinDetail: (diff, time) => `${diff}・${time}`, fuseNext: '下一題',
        fuseGenerateFailed: '暫時無法產生題目，請按「新局」再試一次。',
        fuseCell: (r, c, what) => `第${r}列第${c}欄：${what}`,
        fuseEmpty: '空格', fuseBlocked: '障礙', fuseIsSelected: '已選取', fuseIsTarget: '可併入',
        fuseHelp1: '把兩個相鄰且數字相同的方塊合併：移動的那塊消失，被併入的那塊數字加倍。',
        fuseHelp2: '清空的格子會一直空著，方塊也不會滑動，要先想好哪些方塊該碰在一起。最後只剩一塊即過關。',
        fuseHelp3Html: '點一個方塊，再點標示的鄰居；也可以直接拖過去。鍵盤：方向鍵移動，<strong>Enter</strong>選取並合併，<strong>Esc</strong>取消，<strong>Ctrl+Z</strong>復原。',
        fuseHelp4: '提示每按一次就多說一點。分析會顯示精確搜尋結果，預設關閉。',
        fuseHintBadge: (tier) => `提示${tier}/3`, fuseStuckBadge: '卡住了', fuseSearchBadge: '搜尋',
        fuseLevelTag: (n, name) => `第${n}級・${name}`,
        fuseLevel1: '直接', fuseLevel2: '配對', fuseLevel3: '連通', fuseLevel4: '總和', fuseLevel5: '推想', fuseLevel6: '搜尋',
        fuseLookFinal: '只剩兩塊了。',
        fuseLookLone: '看看標示的方塊：它碰到幾個方塊？',
        fuseLookOnlyPair: '數數看盤面上有幾組相鄰的相同數字。',
        fuseLookForcedPair: '看看標示的方塊：它的鄰居中，哪個才可能跟它合併？',
        fuseLookEliminate: '這裡只有一種合併能保持有解。逐一想想每種合併會留下什麼。',
        fuseLookFree: '這裡有些合併是陷阱。逐一想想每種合併會留下什麼。',
        fuseLookTrial: '試想讓標示的兩塊合併，再順著被迫的下一步往下推。',
        fuseLookSearch: '這個局面沒有能逐步推理的提示。',
        fuseWhyFinal: '把最後兩塊合併就完成了，方向不拘。',
        fuseWhyLone: (v) => `這個${v}只碰到一個方塊，也就是相同的${v}，所以只能和它合併。`,
        fuseWhyOnlyPair: '這是盤面上唯一一組相鄰的相同數字，現在就得合併。',
        fuseWhyForcedPair: (v) => `它的其他鄰居都是空格或更大的數字，而數字只會變大，所以旁邊的${v}是它唯一可能的夥伴。兩者必須在任一方改變前合併。`,
        fuseWhyEliminate: (n) => `其他${n}種合併都會失敗（紅色）。`,
        fuseWhyFree: (n) => (n ? `${n}種合併會失敗（紅色），其餘合併都仍有解（經搜尋確認）。` : '這裡每種合併都仍有解（經搜尋確認）。'),
        fuseWhyTrial: (k) => (k === 1 ? '這兩塊朝對的方向合併後，剩下的一對就能完成。' : `這兩塊朝對的方向合併後，接下來${k}次合併都是被迫的，最後只剩一塊。`),
        fuseWhySearch: '精確搜尋確認，標示的合併仍有解。',
        fuseWhySearchPair: '標示的這組必須合併，但方向需要靠搜尋決定。',
        fuseDirLone: '把它併進鄰居：反過來的話，新方塊將碰不到任何方塊。',
        fuseDirOnly: '只有一個方向可以合併。',
        fuseDirRefuted: (why) => `不能反過來：那樣${why}。`,
        fuseDirFree: '兩個方向都可以（經搜尋確認）。',
        fuseExample: (why) => `以粗紅線為例：那樣${why}。`,
        fuseWhyDead: '沒有相同的方塊相鄰',
        fuseWhyStuck: (v) => `${v}只碰到空格或更大的數字`,
        fuseWhyRivals: (v) => `兩個${v}得搶同一個夥伴`,
        fuseWhyOdd: (v, n) => `最小的${v}形成${n}塊一群，只能彼此配對，總會剩下一塊`,
        fuseWhySplit: '方塊被分成永遠碰不到的幾群',
        fuseWhySubtotal: (below, sum) => `一群小於${below}的方塊總和是${sum}，但這種方塊只能湊成完整的${below}才離開這一群`,
        fuseWhyHalf: (v) => `${v}佔總和一半，只能在最後合併，但少了它其他方塊就被隔開`,
        fuseWhyBlocked: (v) => `必須配對的${v}兩個方向都併不了`,
        fuseWhyNoSurvivor: '下一步的每種合併都會失敗',
        fuseWhyAhead: (k, why) => `會被迫再合併${k}次，接著${why}`,
        fuseWhyGeneric: '規則檢查顯示無法完成',
        fuseDoOne: '照箭頭合併。', fuseDoAny: (n) => `這${n}種合併任選一種都可以。`,
        fuseDoOthers: '其他合併也可行；這一步是由上述推理得出。',
        fuseDoAlso: '其他合併也可行。',
        fuseDoSearch: '這是精確搜尋的結果，不是推理。',
        fuseDeadHint: '已無法合併。',
        fuseUnsolvable: (why) => `這個局面已經無解：${why}。`,
        fuseUnsolvableSearch: '這個局面已經無解（經精確搜尋確認）。',
        fuseUndoBack: (n) => `復原${n}次合併就能回到有解的局面。`,
        fuseRestartBack: '重新開始即可回到有解的局面。',
        fuseGoBack: (n) => `復原${n}步`,
        fuseUnknown: '這個局面超出搜尋上限，無法判斷。',
        fuseAnalysisHead: '分析・精確搜尋', fuseAnalysisNote: '以下是搜尋結果，不是推理步驟。',
        fuseAnalysisSolvable: (w, n) => `有解：${n}種合併中有${w}種仍有解（綠色）。`,
        fuseAnalysisUnsolvable: '從這裡已經無解：每種合併都會失敗（紅色）。',
        fuseAnalysisDead: '已無法合併。', fuseAnalysisWon: '已完成。',
        fuseAnalysisUnknown: '已達搜尋上限，結果不完整。',
        fuseAnalysisPlans: (n, capped) => `從這裡有${n}${capped ? '種以上' : '種'}不同解法（不計合併先後）。`,
        fuseAnalysisProfile: (diff, level, span) => `難度${diff}：最難的一步是第${level}級${span > 1 ? `，需要預想${span}次合併` : ''}。`,
    });

    const $ = (id) => document.getElementById(id);
    const t = (...args) => PC.i18n.t(...args);
    const join = (parts) => parts.filter(Boolean).join(PC.i18n.locale === 'zh' ? '' : ' ');
    const svg = $('board');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const BAD = new Set(['fuseDeadEnd', 'fuseNoPartner', 'fuseGenerateFailed']);

    const shared = PC.share.readParams();
    const urlInitial = shared.size === SIZE && DIFFICULTIES.includes(shared.difficulty) && Number.isInteger(shared.seed) ? shared : null;
    let pendingSeed = urlInitial ? urlInitial.seed : null;

    const state = {
        puzzle: null, difficulty: urlInitial ? urlInitial.difficulty : 'easy', trail: [], solver: null,
        selected: null, cursor: 4, keyboard: false, won: false, winTime: '', generating: false,
        drag: null, anim: null, hint: null, feedback: { key: 'fuseReady', args: [] },
    };
    let shell, animTimer = 0, analysisCache = null;
    const current = () => state.trail[state.trail.length - 1];
    const playable = () => !!state.puzzle && !state.won && !state.generating;

    const history = PC.history.create({
        limit: 64,
        snapshot: () => ({ trail: state.trail.slice() }),
        restore: (snap) => {
            cancelDrag(); endAnimation();
            if (state.won) { state.won = false; shell.clearWin(); }
            state.trail = snap.trail; state.selected = null; state.hint = null;
            say('fuseUndone'); sync();
        },
    });

    function say(key, ...args) { state.feedback = { key, args }; }
    function label(cell) { return R.token(cell); }
    function targetsOf(b, i) { return R.neighbors(b, i).filter((j) => R.canMerge(b, i, j)); }

    // ---------- drawing ----------

    function origin(b, i) { return { x: GAP + (i % b.cols) * (CELL + GAP), y: GAP + Math.floor(i / b.cols) * (CELL + GAP) }; }
    function centre(b, i) { const o = origin(b, i); return { x: o.x + CELL / 2, y: o.y + CELL / 2 }; }
    function colours(cell) {
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
        const inner = add(outer, 'g', { class: 'fuse-tile' + (className ? ' ' + className : '') });
        add(inner, 'rect', { x: -CELL / 2, y: -CELL / 2, width: CELL, height: CELL, rx: 16, fill });
        const size = text.length <= 2 ? 44 : text.length === 3 ? 38 : text.length === 4 ? 31 : 25;
        add(inner, 'text', { class: 'fuse-num', x: 0, y: 2, fill: ink, 'font-size': size }).textContent = text;
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
        const s = kind.includes('refuted') && !kind.includes('example') ? 10 : 13;
        const x1 = a.x + ux * (both ? 40 : 30), y1 = a.y + uy * (both ? 40 : 30), x2 = c.x - ux * 40, y2 = c.y - uy * 40;
        add(parent, 'line', { class: 'fuse-arrow ' + kind, x1, y1, x2, y2 });
        add(parent, 'polygon', { class: 'fuse-arrow-head ' + kind, points: triangle(c.x - ux * 34, c.y - uy * 34, ux, uy, s) });
        if (both) add(parent, 'polygon', { class: 'fuse-arrow-head ' + kind, points: triangle(a.x + ux * 34, a.y + uy * 34, -ux, -uy, s) });
    }
    // Analysis marker for one directed merge, on the source side of the shared edge.
    function chevron(parent, b, m) {
        const { a, c, ux, uy } = unit(b, m.from, m.to);
        const x = (a.x + c.x) / 2 - ux * 15, y = (a.y + c.y) / 2 - uy * 15;
        add(parent, 'polygon', { class: 'fuse-chev ' + m.outcome, points: triangle(x, y, ux, uy, 11) });
    }

    function render() {
        const b = current();
        svg.replaceChildren();
        if (!b) return;
        const W = b.cols * CELL + (b.cols + 1) * GAP, H = b.rows * CELL + (b.rows + 1) * GAP;
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.classList.toggle('won', state.won);
        const drag = state.drag && state.drag.moved && !state.drag.inert ? state.drag : null;
        const selected = state.selected, targets = selected != null ? targetsOf(b, selected) : [];
        const marks = hintMarks(), anim = state.anim;
        const slots = add(svg, 'g', { class: 'fuse-slots' }), tiles = add(svg, 'g', { class: 'fuse-tiles' });
        const over = add(svg, 'g', { class: 'fuse-over' });
        for (let i = 0; i < b.cells.length; i++) {
            const o = origin(b, i), cell = b.cells[i];
            const kind = cell === R.EMPTY ? ' empty' : R.isTile(cell) ? '' : ' block';
            add(slots, 'rect', { class: 'fuse-slot' + kind, x: o.x, y: o.y, width: CELL, height: CELL, rx: 16 });
            if (cell === R.EMPTY) add(slots, 'circle', { class: 'fuse-hole', cx: o.x + CELL / 2, cy: o.y + CELL / 2, r: 6 });
            if (!R.isTile(cell) || (drag && drag.from === i)) continue;
            const cls = [];
            if (i === selected) cls.push('selected');
            else if (selected != null && !targets.includes(i)) cls.push('dim');
            if (anim && anim.to === i) cls.push('pop');
            drawTile(tiles, b, i, cell, cls.join(' '));
        }
        if (anim) {
            const from = centre(b, anim.from), to = centre(b, anim.to);
            const ghost = drawTile(tiles, b, anim.from, anim.cell, 'fuse-ghost');
            ghost.style.setProperty('--dx', `${to.x - from.x}px`);
            ghost.style.setProperty('--dy', `${to.y - from.y}px`);
        }
        for (const j of targets) ring(over, b, j, 'fuse-target' + (drag && drag.over === j ? ' over' : ''), -3);
        for (const i of marks.rings) ring(over, b, i, 'fuse-hint-ring', -5);
        const analysis = shell && shell.revealed ? analysisFor(b) : null;
        if (analysis) for (const m of analysis.a.moves) chevron(over, b, m);
        for (const m of marks.arrows) arrow(over, b, m.from, m.to, m.kind, m.both);
        if (drag) drawTile(over, b, drag.from, b.cells[drag.from], 'selected lifted', { x: drag.dx, y: drag.dy });
        if (state.keyboard && document.activeElement === svg) ring(over, b, state.cursor, 'fuse-cursor', -7);
    }

    // ---------- hints ----------

    function requestHint() {
        if (!playable()) return;
        const b = current(), key = R.key(b);
        if (state.hint && state.hint.key === key) {
            if (state.hint.step.move && state.hint.tier < 3) state.hint.tier++;
        } else {
            const step = Reasoning.nextStep(R, b, { solver: state.solver });
            const exact = state.solver.analyze(b);
            state.hint = {
                key, tier: 1, step,
                wins: exact.moves.filter((m) => m.outcome === 'win').length,
                back: step.move ? null : recovery(),
            };
        }
        sync();
    }
    // Merges to undo to reach the latest solvable position (null: restart instead).
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
    function hintMarks() {
        const out = { rings: [], arrows: [] }, h = state.hint, b = current();
        if (!h || !b || h.key !== R.key(b)) return out;
        const s = h.step;
        if (!s.move) {
            if (s.reason && s.reason.cells) out.rings = s.reason.cells.slice();
            return out;
        }
        const pair = s.pair || [s.move.from, s.move.to];
        if (s.technique === 'lone' || s.technique === 'forced-pair') out.rings = h.tier === 1 ? [s.anchor] : pair.slice();
        else if (s.technique === 'final' || s.technique === 'trial') out.rings = pair.slice();
        else if ((s.technique === 'only-pair' || s.technique === 'search') && h.tier > 1 && s.pair) out.rings = pair.slice();
        if (h.tier === 2) {
            const example = exampleOf(s);
            for (const ref of s.refuted || []) {
                out.arrows.push({ from: ref.move.from, to: ref.move.to, kind: 'refuted' + (ref === example ? ' example' : '') });
            }
        }
        if (h.tier === 3 || (h.tier === 2 && s.technique === 'search' && !s.pair)) {
            const moves = shownMoves(s);
            for (const m of moves) {
                if (moves.some((x) => x.from === m.to && x.to === m.from)) {
                    if (m.from < m.to) out.arrows.push({ from: m.from, to: m.to, kind: 'move', both: true });
                } else out.arrows.push({ from: m.from, to: m.to, kind: 'move' });
            }
        }
        return out;
    }
    function why(r) {
        switch (r.id) {
            case 'dead-end': return t('fuseWhyDead');
            case 'stuck': return t('fuseWhyStuck', r.value);
            case 'rivals': return t('fuseWhyRivals', r.value);
            case 'odd-group': return t('fuseWhyOdd', r.value, r.cells.length);
            case 'split': return t('fuseWhySplit');
            case 'subtotal': return t('fuseWhySubtotal', r.below, r.sum);
            case 'half': return t('fuseWhyHalf', r.value);
            case 'pair-blocked': return t('fuseWhyBlocked', r.value);
            case 'no-survivor': return t('fuseWhyNoSurvivor');
            case 'lookahead': return r.chain.length ? t('fuseWhyAhead', r.chain.length, why(r.final)) : why(r.final);
            default: return t('fuseWhyGeneric');
        }
    }
    function directionText(s) {
        if (s.direction === 'lone') return t('fuseDirLone');
        if (s.direction === 'only') return t('fuseDirOnly');
        if (s.direction === 'refuted') return t('fuseDirRefuted', why(s.refuted[0].reason));
        return s.freeDirection ? t('fuseDirFree') : '';
    }
    function lookText(s) {
        return t({
            final: 'fuseLookFinal', lone: 'fuseLookLone', 'only-pair': 'fuseLookOnlyPair', 'forced-pair': 'fuseLookForcedPair',
            eliminate: 'fuseLookEliminate', free: 'fuseLookFree', trial: 'fuseLookTrial', search: 'fuseLookSearch',
        }[s.technique] || 'fuseLookSearch');
    }
    function whyText(s, b) {
        const v = s.anchor != null ? label(b.cells[s.anchor]) : '';
        const example = exampleOf(s);
        switch (s.technique) {
            case 'final': return t('fuseWhyFinal');
            case 'lone': return join([t('fuseWhyLone', v), directionText(s)]);
            case 'only-pair': return join([t('fuseWhyOnlyPair'), directionText(s)]);
            case 'forced-pair': return join([t('fuseWhyForcedPair', v), directionText(s)]);
            case 'eliminate': return join([t('fuseWhyEliminate', s.eliminated.length), example && t('fuseExample', why(example.reason))]);
            case 'free': return join([t('fuseWhyFree', s.eliminated.length), example && t('fuseExample', why(example.reason))]);
            case 'trial': return t('fuseWhyTrial', s.chain.length - 1);
            default: return s.pair ? t('fuseWhySearchPair') : t('fuseWhySearch');
        }
    }
    function doText(s, h) {
        const moves = shownMoves(s), search = s.technique === 'search';
        const main = moves.length > 1 ? t('fuseDoAny', moves.length) : t('fuseDoOne');
        const others = h.wins > moves.length && t(search ? 'fuseDoAlso' : 'fuseDoOthers');
        return join([main, others, search && t('fuseDoSearch')]);
    }
    function renderHint() {
        const banner = $('hint-banner'), h = state.hint, b = current();
        if (!h || !b || h.key !== R.key(b) || state.won) { banner.hidden = true; banner.replaceChildren(); return; }
        const s = h.step, badges = [], body = document.createElement('span');
        let text;
        if (!s.move) {
            badges.push([t('fuseStuckBadge'), 'err']);
            if (s.technique === 'dead-end') text = t('fuseDeadHint');
            else if (s.technique === 'unsolvable') text = s.reason ? t('fuseUnsolvable', why(s.reason)) : t('fuseUnsolvableSearch');
            else text = t('fuseUnknown');
            if (s.technique !== 'unknown') text = join([text, h.back ? t('fuseUndoBack', h.back) : t('fuseRestartBack')]);
        } else {
            badges.push([t('fuseHintBadge', h.tier), '']);
            badges.push(s.level >= Reasoning.SEARCH ? [t('fuseSearchBadge'), 'search'] : [t('fuseLevelTag', s.level, t('fuseLevel' + s.level)), 'level']);
            text = h.tier === 1 ? lookText(s) : h.tier === 2 ? whyText(s, b) : join([whyText(s, b), doText(s, h)]);
        }
        banner.replaceChildren();
        banner.classList.toggle('error', !s.move);
        for (const [textBadge, cls] of badges) {
            const badge = document.createElement('span');
            badge.className = 'hint-tier' + (cls === 'err' ? ' err' : cls ? ' fuse-' + cls : '');
            badge.textContent = textBadge;
            banner.appendChild(badge);
        }
        body.textContent = text;
        banner.appendChild(body);
        if (!s.move && s.technique !== 'unknown') {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'btn fuse-hint-action';
            button.textContent = h.back ? t('fuseGoBack', h.back) : t('fuseRestart');
            button.addEventListener('click', () => {
                if (!h.back) { $('reset-btn').click(); return; }
                for (let k = 0; k < h.back; k++) history.undo();
            });
            banner.appendChild(button);
        }
        banner.hidden = false;
    }

    // ---------- analysis (exact search, opt-in) ----------

    function analysisFor(b) {
        const key = R.key(b);
        if (!analysisCache || analysisCache.key !== key) {
            const a = state.solver.analyze(b);
            analysisCache = { key, a, plans: a.status === 'solvable' ? state.solver.countPlans(b, PLAN_CAP) : null };
        }
        return analysisCache;
    }
    function renderAnalysis() {
        const panel = $('fuse-analysis'), b = current();
        const on = !!(shell && shell.revealed && b && state.puzzle);
        panel.hidden = !on;
        if (!on) { panel.replaceChildren(); return; }
        const { a, plans } = analysisFor(b), lines = [];
        const wins = a.moves.filter((m) => m.outcome === 'win').length;
        lines.push({ solvable: () => t('fuseAnalysisSolvable', wins, a.moves.length), unsolvable: () => t('fuseAnalysisUnsolvable'),
            'dead-end': () => t('fuseAnalysisDead'), won: () => t('fuseAnalysisWon') }[a.status]?.() || t('fuseAnalysisUnknown'));
        if (plans != null) lines.push(t('fuseAnalysisPlans', plans, plans >= PLAN_CAP));
        const m = state.puzzle.metrics;
        if (m) lines.push(t('fuseAnalysisProfile', t(state.difficulty), m.maxLevel, m.span || 0));
        const head = document.createElement('strong');
        head.textContent = t('fuseAnalysisHead');
        const note = document.createElement('span');
        note.className = 'fuse-analysis-note'; note.textContent = t('fuseAnalysisNote');
        const list = document.createElement('ul');
        for (const line of lines) { const li = document.createElement('li'); li.textContent = line; list.appendChild(li); }
        panel.replaceChildren(head, note, list);
    }

    // ---------- state sync ----------

    function sync() {
        const b = current(), status = b ? R.status(b) : null, locked = state.generating || !state.puzzle;
        $('undo-btn').disabled = locked || !history.canUndo();
        $('reset-btn').disabled = locked;
        $('share-btn').disabled = locked;
        if (locked) $('hint-btn').disabled = true;
        else if (!state.won) $('hint-btn').disabled = false;
        $('fuse-level').textContent = state.puzzle ? t('fuseLevel', t(state.difficulty), b.rows, b.cols) : '';
        $('fuse-code').textContent = state.puzzle ? t('fuseCode', state.puzzle.seed.toString(36)) : '';
        $('fuse-tiles').textContent = b && !state.won ? t('fuseTiles', R.tileCount(b)) : '';
        $('fuse-dead-pill').hidden = status !== 'dead-end';
        $('fuse-dead').hidden = status !== 'dead-end' || state.generating;
        $('fuse-win').hidden = !state.won;
        $('fuse-win-detail').textContent = state.won ? t('fuseWinDetail', t(state.difficulty), state.winTime) : '';
        const feedback = $('fuse-feedback');
        feedback.textContent = t(state.feedback.key, ...state.feedback.args);
        feedback.classList.toggle('bad', BAD.has(state.feedback.key));
        renderHint();
        renderAnalysis();
        render();
    }
    function announce(i) {
        const b = current(), cell = b.cells[i];
        const parts = [cell === R.EMPTY ? t('fuseEmpty') : R.isTile(cell) ? label(cell) : t('fuseBlocked')];
        if (i === state.selected) parts.push(t('fuseIsSelected'));
        else if (state.selected != null && R.canMerge(b, state.selected, i)) parts.push(t('fuseIsTarget'));
        $('fuse-live').textContent = t('fuseCell', Math.floor(i / b.cols) + 1, (i % b.cols) + 1, parts.join(', '));
    }

    // ---------- moves ----------

    function select(i) {
        const b = current();
        if (i == null) {
            if (state.selected != null) say('fuseCancelled');
            state.selected = null;
        } else if (!targetsOf(b, i).length) {
            state.selected = null; say('fuseNoPartner', label(b.cells[i]));
        } else {
            state.selected = i; state.cursor = i; say('fuseSelected', label(b.cells[i]));
        }
        sync();
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
        if (status === 'won') { state.won = true; recordWin(); say('fuseWinSay'); }
        else if (status === 'dead-end') say('fuseDeadEnd');
        else say('fuseMerged', label(tile));
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

    function pickDifficulty(value) {
        const button = $('difficulty-seg').querySelector(`[data-value="${value}"]`);
        if (button) button.click();
    }
    // The shell records the solve against its staged selector values, so attribute it to the
    // puzzle that was actually played.
    function recordWin() {
        const staged = shell.difficulty;
        if (staged !== state.difficulty) pickDifficulty(state.difficulty);
        shell.markSolved();
        if (staged !== state.difficulty) pickDifficulty(staged);
        state.winTime = $('timer').textContent;
    }

    function restart() {
        if (!state.puzzle) return;
        cancelDrag(); endAnimation();
        if (state.won) history.clear();
        else if (state.trail.length > 1) history.push();
        state.trail = [state.trail[0]]; state.won = false; state.selected = null; state.hint = null;
        say('fuseRestarted'); sync();
    }

    // ---------- generation ----------

    function randomSeed() {
        return window.crypto && window.crypto.getRandomValues
            ? window.crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296);
    }
    async function loadPuzzle() {
        const difficulty = shell.difficulty;
        const seed = pendingSeed != null ? pendingSeed : randomSeed();
        pendingSeed = null;
        let lastPaint = -Infinity;
        const puzzle = await generate(SIZE, difficulty, seed, async (fraction) => {
            const now = performance.now();
            if (now - lastPaint < 35) return;
            lastPaint = now;
            PC.progress.setFraction(fraction);
            await PC.progress.waitNextPaint();
        });
        const start = R.parse(puzzle.board);
        cancelDrag(); endAnimation();
        state.puzzle = puzzle; state.difficulty = difficulty; state.trail = [start];
        state.solver = Solver.createSolver(R); analysisCache = null;
        state.selected = null; state.cursor = Math.floor(start.cells.length / 2); state.won = false; state.hint = null;
        history.clear();
        PC.share.replaceUrl({ size: SIZE, difficulty, seed: puzzle.seed });
        say('fuseReady');
    }
    async function startPuzzle() {
        if (state.generating) return;
        state.generating = true; cancelDrag(); endAnimation(); sync();
        try { await shell.start(); }
        catch (_) { say('fuseGenerateFailed'); }
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
            if (!d.inert) { state.selected = d.from; say('fuseSelected', label(b.cells[d.from])); sync(); }
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
        if (d.prior == null) say('fuseCancelled'); else say('fuseSelected', label(current().cells[d.prior]));
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
        size: { kind: 'segmented', default: SIZE },
        onNewGame: loadPuzzle,
        onReset: restart,
        onReveal: () => sync(),
        solveSound: () => {
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => PC.audio.tone(f, 0.16, { volume: 0.08 }), i * 90));
        },
    });
    svg.classList.add('drag-board');
    // Catch generation failures locally without changing the shared shell.
    $('new-game-btn').addEventListener('click', (e) => { e.stopImmediatePropagation(); startPuzzle(); }, true);
    $('fuse-next').addEventListener('click', startPuzzle);
    $('undo-btn').addEventListener('click', () => history.undo());
    $('hint-btn').addEventListener('click', requestHint);
    $('fuse-dead-undo').addEventListener('click', () => history.undo());
    $('fuse-dead-restart').addEventListener('click', () => $('reset-btn').click());
    $('share-btn').addEventListener('click', async () => {
        const ok = await PC.share.copyCurrentUrl();
        PC.toast.show(t(ok ? 'shareCopied' : 'shareFailed'));
    });
    PC.i18n.subscribe(sync);
    startPuzzle();
})();
