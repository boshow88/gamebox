/**
 * Beam (Kin-Kon-Kan) — game UI (WIP).
 *
 * Self-contained: uses window.BeamModel (generator/solver) + a few PuzzleCommon
 * utilities (rng/share/toast/progress/history). Deliberately does NOT use the
 * PuzzleCommon shell, so the whole game is three isolated files and can be
 * reverted by deleting them + the launcher entry.
 */
(function () {
    'use strict';

    const PC = window.PuzzleCommon;
    const BM = window.BeamModel;
    const EMPTY = BM.EMPTY, SLASH = BM.SLASH, BACK = BM.BACK, XMARK = BM.MARK;
    const U = BM.U, D = BM.D, L = BM.L, R = BM.R;
    const EB = 1, SB = 2, BB = 4;          // domain bits (used only to narrate 'assume' hints)
    const OPP = [BM.D, BM.U, BM.R, BM.L];  // inward dir per opening side (U,D,L,R)
    const t = (k) => (PC.i18n ? PC.i18n.t(k) : k);

    // Register this game's strings at load time (before the DOM-ready translate),
    // so the whole page localises like the other games. All keys are 'beam…',
    // reusing the shared control keys (menu/difficulty/newGame/…) for the rest.
    (function registerStrings() {
        if (!PC.i18n || !PC.i18n.STRINGS) return;
        Object.assign(PC.i18n.STRINGS.en, {
            beamName: 'Beam', beamBoardAria: 'Beam puzzle board',
            beamLasers: 'Lasers', beamRooms: 'rooms',
            beamGenFail: 'Could not generate — try again.',
            beamRoomGiven: 'This room\u2019s mirror is given.',
            beamHelp1Html: 'Bold lines split the grid into <strong>rooms</strong>; each holds <strong>exactly one</strong> mirror (/ or \\).',
            beamHelp2Html: 'A laser enters at a letter, reflects 90° off mirrors, and must leave at the <strong>same letter</strong>. A number is how many times that beam reflects.',
            beamHelp3Html: 'Click a cell to cycle <strong>empty → / → \\ → ✗ → empty</strong>. Use <strong>✗</strong> to mark a cell you\u2019ve ruled out. Placing a mirror clears your other mirror in that room; blue mirrors are given.',
            beamHelp4Html: 'Beams may cross on empty cells. Solve when every laser reaches its pair with the right reflection count.',
        });
        Object.assign(PC.i18n.STRINGS.zh, {
            beamName: 'Beam', beamBoardAria: 'Beam 盤面',
            beamLasers: '雷射', beamRooms: '房間',
            beamGenFail: '產生失敗，請再試一次。',
            beamRoomGiven: '這個房間的鏡子是題目給定的。',
            beamHelp1Html: '粗線把盤面分成數個<strong>房間</strong>，每個房間<strong>恰好一面</strong>鏡子（/ 或 \\）。',
            beamHelp2Html: '雷射從字母射入、碰鏡子轉 90°，必須從<strong>相同字母</strong>射出；字母旁的數字＝該道光的折射次數。',
            beamHelp3Html: '點格子循環 <strong>空 → / → \\ → ✗ → 空</strong>。用 <strong>✗</strong> 標記你已排除的格子；放新鏡子會清掉你在同房放的舊鏡子，藍色是題目給定的鏡子。',
            beamHelp4Html: '光可在空格交叉。當每道雷射都連到它的配對、且折射次數正確時即過關。',
        });
    })();

    // Hint text is PARAMETERISED (laser letters, direction arrows, slants), so it
    // lives here as a locale pack rather than in the flat STRINGS table. Each
    // entry returns an HTML string; the UI picks the pack by PC.i18n.locale.
    const AR = { [U]: '\u2191', [D]: '\u2193', [L]: '\u2190', [R]: '\u2192' };  // ↑ ↓ ← →
    const glyph = (content) => content === SLASH ? '/' : content === BACK ? '\\' : '\u2717';
    const other = (content) => content === SLASH ? '\\' : '/';
    const letterOf = (li) => String.fromCharCode(65 + (li % 26));
    const bq = (s) => '<strong>' + s + '</strong>';
    const SIDEW = { en: { [U]: 'top', [D]: 'bottom', [L]: 'left', [R]: 'right' }, zh: { [U]: '上', [D]: '下', [L]: '左', [R]: '右' } };
    // Describe the START opening (side + letter) so the words match the SOLID ring
    // the overlay draws on that end — this is what disambiguates "which A".
    function fromDesc(locale, h) {
        if (h.from == null || h.from < 0 || !S.puzzle) return bq(letterOf(h.laser));
        const side = S.puzzle.opens[h.from].side, w = (SIDEW[locale] || SIDEW.en)[side];
        return locale === 'zh' ? (w + '方的 ' + bq(letterOf(h.laser))) : ('the ' + w + ' ' + bq(letterOf(h.laser)));
    }
    function cellPartEN(h) {
        return h.reason === 'single' ? 'This room is a single cell, so its mirror sits here. '
            : h.reason === 'lastCell' ? 'Every other cell in this room is ✗, so the mirror belongs here. ' : '';
    }
    function cellPartZH(h) {
        return h.reason === 'single' ? '這個房間只有一格，鏡子就在這一格。'
            : h.reason === 'lastCell' ? '這個房間其他格都已標 ✗，鏡子只能放在這一格。' : '';
    }
    const HINT = {
        en: {
            wrong: () => 'Highlighted cell(s) clash with the unique solution — remove a wrong mirror, or clear an ✗ where a mirror belongs.',
            none: () => 'No further forced step from here right now.',
            roomSat: (h) => 'This room already holds its one mirror, so its other ' + (h.cells.length > 1 ? h.cells.length + ' cells' : 'cell') + ' must be empty — mark ✗.',
            zeroLine: (h) => 'Laser ' + fromDesc('en', h) + ' reflects 0 times, so it runs dead straight along the highlighted line — every cell on it is empty (✗).',
            countFull: (h) => 'Laser ' + fromDesc('en', h) + ' must reflect exactly ' + h.count + (h.count === 1 ? ' time' : ' times') + '; following the highlighted path it already has by this cell, so it can’t turn here — mark ✗.',
            laserEmpty: (h) => 'Tracing laser ' + bq(letterOf(h.laser)) + ', no mirror here lets it reach its pair — this cell is empty (✗).',
            chainX: () => 'Combining the rules so far, this cell can’t hold a mirror — mark ✗.',
            place: (h) => {
                const g = bq(glyph(h.content)), w = bq(other(h.content)), part = cellPartEN(h), L = fromDesc('en', h), a = h.alt || { kind: 'lookahead' };
                if (h.inDir >= 0 && a.kind === 'corner')
                    return part + 'Laser ' + L + ' reflects just once, so it goes straight in, turns here, then straight out to its pair. It comes in ' + AR[h.inDir]
                        + ' and the pair lies ' + AR[h.outDir] + '; a ' + w + ' would instead shoot it ' + AR[a.exitSide] + ' off the ' + SIDEW.en[a.exitSide] + ' edge (no pair there), so place ' + g + '.';
                if (h.inDir >= 0 && a.kind === 'wrongExit')
                    return part + 'Laser ' + L + ' comes in ' + AR[h.inDir] + '. Following the mirrors already placed, a ' + w + ' would send it ' + AR[a.exitSide] + ' straight off the ' + SIDEW.en[a.exitSide] + ' edge — not back to its pair. So place ' + g + '.';
                if (h.inDir >= 0 && a.kind === 'overCount')
                    return part + 'Laser ' + L + ' comes in ' + AR[h.inDir] + '. A ' + w + ' here would make it reflect more than its ' + h.count + ' times. So place ' + g + '.';
                const cnt = (h.count != null) ? (' exactly ' + h.count + (h.count === 1 ? ' time' : ' times')) : '', inc = h.inDir >= 0 ? ('It comes in ' + AR[h.inDir] + '. ') : '';
                return part + inc + 'This needs a look-ahead: follow laser ' + L + ' along the highlighted path — it must reflect' + cnt + ' and return to its pair, and only ' + g + ' here allows that (try ' + w + ' and the beam can’t get back).';
            },
            assume: (h) => {
                const hypo = h.hypo === EB ? 'empty (✗)' : h.hypo === SB ? 'a /' : 'a \\';
                return 'Suppose this cell were ' + hypo + ': following the forced moves hits a dead end (a laser can’t reach its pair). So it must be ' + bq(glyph(h.content)) + '.';
            },
        },
        zh: {
            wrong: () => '醒目的格子與唯一解不符——請移除放錯的鏡子，或清掉標在該放鏡子處的 ✗。',
            none: () => '目前從這個盤面推不出下一個強制步驟了。',
            roomSat: (h) => '這個房間已經有一面鏡子了，同一房間只能有一面，所以其餘 ' + h.cells.length + ' 格都必須是空的——標上 ✗。',
            zeroLine: (h) => '雷射 ' + fromDesc('zh', h) + ' 折射 0 次，沿著高亮直線一路直穿不轉彎，所以線上每一格都是空的（✗）。',
            countFull: (h) => '雷射 ' + fromDesc('zh', h) + ' 必須剛好折射 ' + h.count + ' 次；沿著高亮光路追過來，到這格時已折滿，不能再轉彎，所以這格標 ✗。',
            laserEmpty: (h) => '追蹤雷射 ' + bq(letterOf(h.laser)) + '，這一格放任何鏡子都無法讓它抵達配對——所以這格是空的（✗）。',
            chainX: () => '綜合目前的線索，這一格不可能放鏡子——標上 ✗。',
            place: (h) => {
                const g = bq(glyph(h.content)), w = bq(other(h.content)), part = cellPartZH(h), L = fromDesc('zh', h), a = h.alt || { kind: 'lookahead' }, letter = bq(letterOf(h.laser));
                if (h.inDir >= 0 && a.kind === 'corner')
                    return part + '雷射 ' + L + ' 只折射一次，所以是個轉角：直線進來、在這格轉一次、再直線射到另一個 ' + letter + '。它從 ' + AR[h.inDir] + ' 進來、配對在 ' + AR[h.outDir]
                        + ' 方；放 ' + w + ' 會改往 ' + AR[a.exitSide] + ' 射出' + SIDEW.zh[a.exitSide] + '側邊界（那裡沒有配對），所以這格放 ' + g + '。';
                if (h.inDir >= 0 && a.kind === 'wrongExit')
                    return part + '雷射 ' + L + ' 從 ' + AR[h.inDir] + ' 進來。沿著已放的鏡子推，放 ' + w + ' 會讓它往 ' + AR[a.exitSide] + ' 一路射出' + SIDEW.zh[a.exitSide] + '側邊界，回不到配對；所以放 ' + g + '。';
                if (h.inDir >= 0 && a.kind === 'overCount')
                    return part + '雷射 ' + L + ' 從 ' + AR[h.inDir] + ' 進來。這格放 ' + w + ' 會讓它折射超過 ' + h.count + ' 次；所以放 ' + g + '。';
                const cnt = (h.count != null) ? ('剛好折射 ' + h.count + ' 次並') : '', inc = h.inDir >= 0 ? ('它從 ' + AR[h.inDir] + ' 進來。') : '';
                return part + inc + '這一步要追光：沿著高亮光路追雷射 ' + L + '——它必須' + cnt + '回到另一個 ' + letter + '，只有這格放 ' + g + ' 才存在這種走法（試放 ' + w + '，光就回不去）。';
            },
            assume: (h) => {
                const hypo = h.hypo === EB ? '空的（✗）' : h.hypo === SB ? '/' : '\\';
                return '假設這一格是 ' + hypo + '：順著被強制的後續推下去會走進死路（某道雷射無法抵達配對）。所以它必須是 ' + bq(glyph(h.content)) + '。';
            },
        },
    };
    function composeHint(h) {
        const p = HINT[(PC.i18n && PC.i18n.locale) || 'en'] || HINT.en;
        if (h.kind === 'wrong') return { html: p.wrong(h), error: true };
        if (h.kind === 'exclude') return { html: (p[h.reason === 'chain' ? 'chainX' : h.reason] || p.none)(h), error: false };
        if (h.kind === 'place') return { html: p.place(h), error: false };
        if (h.kind === 'assume') return { html: p.assume(h), error: false };
        return { html: p.none(h), error: false };
    }

    // Difficulty → generation knobs. Big rooms (low room target) = few givens =
    // more deduction; strip = fewer reflection numbers; depth = assume→contra.
    const SIZES = [6, 7, 8, 9];
    const DIFF = {
        easy:   { room: (N) => Math.round(N * 1.2), strip: false, depth: 1 },
        medium: { room: (N) => Math.round(N * 0.9), strip: true,  depth: 1 },
        hard:   { room: (N) => Math.round(N * 0.7), strip: true,  depth: 2 },
    };
    const VALID_DIFF = { easy: 1, medium: 1, hard: 1 };

    const S = {
        N: 7, diff: 'medium',
        puzzle: null,
        player: null,          // Int8Array player-placed mirrors (EMPTY/SLASH/BACK)
        givenRoom: null,       // Set of room ids that carry a given mirror
        givenAt: null,         // Map cell -> orient (given)
        revealed: false,
        hint: null,
        history: null,
        pxSeed: null,          // last used seed (for share)
    };

    const $ = (id) => document.getElementById(id);
    const board = () => $('board');
    function clearHint() { S.hint = null; const b = $('hint-banner'); if (b) { b.hidden = true; b.classList.remove('error'); } }

    // ---- generation ----
    function gen(N, diff, seed) {
        const cfg = DIFF[diff] || DIFF.medium;
        for (let tries = 0; tries < 60; tries++) {
            const sd = (seed != null && tries === 0) ? seed : ((Math.random() * 0x7fffffff) | 0);
            const sol = BM.generateSolution(N, sd, { roomTarget: cfg.room(N) });
            if (!sol) continue;
            const puzzle = BM.makePuzzle(sol, sd, cfg.depth, cfg.strip);
            if (puzzle) { puzzle._seed = sd; return puzzle; }
        }
        return null;
    }

    async function newGame(seed) {
        const cfg = DIFF[S.diff] || DIFF.medium;
        if (PC.progress) { PC.progress.start(t('generatingPuzzle')); await PC.progress.waitNextPaint(); }
        let puzzle = null;
        try { puzzle = gen(S.N, S.diff, seed); } finally { if (PC.progress) PC.progress.finish(); }
        if (!puzzle) { if (PC.toast) PC.toast.show(t('beamGenFail')); return; }
        S.puzzle = puzzle;
        S.pxSeed = puzzle._seed;
        S.player = new Int8Array(S.N * S.N).fill(EMPTY);
        S.givenRoom = new Set();
        S.givenAt = new Map();
        for (const g of puzzle.givens) { S.givenAt.set(g.cell, g.orient); S.givenRoom.add(puzzle.room[g.cell]); }
        S.revealed = false;
        $('reveal-btn').classList.remove('active');
        $('reveal-btn').setAttribute('aria-pressed', 'false');
        S.history = PC.history.create({ snapshot: () => S.player.slice(), restore: (snap) => { S.player = snap.slice(); } });
        if (PC.share) { try { PC.share.replaceUrl({ size: S.N, difficulty: S.diff, seed: S.pxSeed }); } catch (e) {} }
        clearHint();
        render();
    }

    // ---- model helpers ----
    function fullMirror() {
        const N = S.N, m = new Int8Array(N * N).fill(EMPTY);
        for (let i = 0; i < N * N; i++) { const p = S.player[i]; m[i] = (p === SLASH || p === BACK) ? p : EMPTY; } // ✗ counts as empty
        for (const [cell, orient] of S.givenAt) m[cell] = orient;
        return m;
    }
    function roomMirrorCount(m) {
        const cnt = new Int32Array(S.puzzle.roomCount);
        for (let i = 0; i < m.length; i++) if (m[i] !== EMPTY) cnt[S.puzzle.room[i]]++;
        return cnt;
    }
    function evaluate() {
        const N = S.N, P = S.puzzle, m = fullMirror();
        const cnt = roomMirrorCount(m);
        let roomsFilled = 0, roomsExactly = 0;
        for (let r = 0; r < P.roomCount; r++) { if (cnt[r] >= 1) roomsFilled++; if (cnt[r] === 1) roomsExactly++; }
        let lasersOk = 0;
        const hit = new Int8Array(N * N);
        for (const L of P.lasers) {
            const oa = P.opens[L.a], ob = P.opens[L.b];
            const t = BM.trace(m, N, { r: oa.r, c: oa.c, dir: OPP[oa.side] });
            const ok = !t.looped && t.exit && t.exit.r === ob.r && t.exit.c === ob.c && t.exit.side === ob.side
                && (L.count == null || t.reflections === L.count);
            if (ok) { lasersOk++; for (const ci of t.cells) if (m[ci] !== EMPTY) hit[ci] = 1; }
        }
        let redundant = false;
        for (let i = 0; i < N * N; i++) if (m[i] !== EMPTY && !hit[i]) redundant = true;
        const win = roomsExactly === P.roomCount && lasersOk === P.lasers.length && !redundant;
        return { roomsFilled, roomsExactly, lasersOk, lasersTotal: P.lasers.length, win };
    }

    // ---- input ----
    function clickCell(c) {
        const P = S.puzzle; if (!P) return;
        clearHint();
        if (S.givenRoom.has(P.room[c])) { if (PC.toast) PC.toast.show(t('beamRoomGiven')); return; }
        S.history.push();
        const cur = S.player[c];
        // cycle: empty → / → \ → ✗ → empty
        const next = cur === EMPTY ? SLASH : cur === SLASH ? BACK : cur === BACK ? XMARK : EMPTY;
        if (next === SLASH || next === BACK) {   // one mirror per room: clear this room's other mirrors (keep ✗ marks)
            for (const i of P.cellsOf[P.room[c]]) if (i !== c && (S.player[i] === SLASH || S.player[i] === BACK)) S.player[i] = EMPTY;
        }
        S.player[c] = next;
        render();
    }

    // ---- render ----
    function render() {
        const P = S.puzzle; if (!P) return;
        const N = S.N, size = 480, cs = size / N, pad = cs * 0.2;
        const gx = (c) => c * cs, gy = (r) => r * cs, cx = (c) => c * cs + cs / 2, cy = (r) => r * cs + cs / 2;
        const letters = {};  // opening idx -> {letter, num}
        P.lasers.forEach((L, i) => {
            const ch = String.fromCharCode(65 + (i % 26));
            letters[L.a] = { letter: ch, num: L.count };
            letters[L.b] = { letter: ch, num: L.count };
        });
        const ev = evaluate();
        const satCnt = roomMirrorCount(fullMirror());

        let s = '';
        // thin grid
        for (let i = 0; i <= N; i++) {
            s += '<line class="beam-grid" x1="' + gx(i) + '" y1="0" x2="' + gx(i) + '" y2="' + size + '"/>';
            s += '<line class="beam-grid" x1="0" y1="' + gy(i) + '" x2="' + size + '" y2="' + gy(i) + '"/>';
        }
        // satisfied-room soft tint (exactly one mirror)
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
            if (satCnt[P.room[r * N + c]] === 1) s += '<rect class="beam-room-sat" x="' + gx(c) + '" y="' + gy(r) + '" width="' + cs + '" height="' + cs + '"/>';
        }
        // hint highlight (tint, under the mirrors)
        const H = S.hint;
        const hintCells = !H ? []
            : (H.kind === 'wrong' || H.kind === 'exclude') ? (H.cells || [])
            : (H.kind === 'place' || H.kind === 'assume') ? [H.cell] : [];
        for (const hc of hintCells) {
            const hr = (hc / N) | 0, hcc = hc % N;
            s += '<rect class="' + (H.kind === 'wrong' ? 'beam-hint-bad' : 'beam-hint-target') + '" x="' + gx(hcc) + '" y="' + gy(hr) + '" width="' + cs + '" height="' + cs + '"/>';
        }
        // bold room borders + outer frame
        const bl = (x1, y1, x2, y2) => '<line class="beam-room" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>';
        s += bl(0, 0, size, 0) + bl(0, size, size, size) + bl(0, 0, 0, size) + bl(size, 0, size, size);
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
            const id = P.room[r * N + c];
            if (c + 1 < N && P.room[r * N + c + 1] !== id) s += bl(gx(c + 1), gy(r), gx(c + 1), gy(r + 1));
            if (r + 1 < N && P.room[(r + 1) * N + c] !== id) s += bl(gx(c), gy(r + 1), gx(c + 1), gy(r + 1));
        }
        // reveal overlay (solution mirrors, faint) where nothing placed
        const drawMirror = (cls, cell, orient) => {
            const r = (cell / N) | 0, c = cell % N;
            const a = orient === SLASH ? [gx(c) + pad, gy(r + 1) - pad, gx(c + 1) - pad, gy(r) + pad]
                                       : [gx(c) + pad, gy(r) + pad, gx(c + 1) - pad, gy(r + 1) - pad];
            return '<line class="beam-mirror ' + cls + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + a[2] + '" y2="' + a[3] + '"/>';
        };
        const drawX = (cls, cell) => {
            const r = (cell / N) | 0, c = cell % N, m = cs * 0.28;
            return '<line class="beam-x ' + cls + '" x1="' + (gx(c) + m) + '" y1="' + (gy(r) + m) + '" x2="' + (gx(c + 1) - m) + '" y2="' + (gy(r + 1) - m) + '"/>'
                 + '<line class="beam-x ' + cls + '" x1="' + (gx(c + 1) - m) + '" y1="' + (gy(r) + m) + '" x2="' + (gx(c) + m) + '" y2="' + (gy(r + 1) - m) + '"/>';
        };
        if (S.revealed) for (let i = 0; i < N * N; i++) {
            const sm = P.solution[i];   // show the true mirror even under a ✗ (so reveal exposes mistakes)
            if (sm !== EMPTY && !S.givenAt.has(i) && S.player[i] !== SLASH && S.player[i] !== BACK) s += drawMirror('reveal', i, sm);
        }
        // given mirrors (locked)
        for (const [cell, orient] of S.givenAt) s += drawMirror('given', cell, orient);
        // player mirrors + ✗ marks
        for (let i = 0; i < N * N; i++) {
            if (S.player[i] === SLASH || S.player[i] === BACK) s += drawMirror('player', i, S.player[i]);
            else if (S.player[i] === XMARK) s += drawX('player', i);
        }
        // hint ghost: the forced mirror / ✗ the hint suggests
        if (H) {
            if (H.kind === 'place') s += drawMirror('hint', H.cell, H.content);
            else if (H.kind === 'assume') s += (H.content === EMPTY ? drawX('hint', H.cell) : drawMirror('hint', H.cell, H.content));
            else if (H.kind === 'exclude') for (const hc of H.cells) s += drawX('hint', hc);
        }
        // opening labels
        P.opens.forEach((o) => {
            const info = letters[o.idx]; if (!info) return;
            let lx = cx(o.c), ly = cy(o.r);
            if (o.side === BM.U) ly = -28; else if (o.side === BM.D) ly = size + 28;
            else if (o.side === BM.L) lx = -28; else lx = size + 28;
            const fs = Math.min(cs * 0.42, 26);
            s += '<text class="beam-open-label beam-letter" x="' + lx + '" y="' + ly + '" font-size="' + fs + '" text-anchor="middle" dominant-baseline="middle">'
                + info.letter + (info.num != null ? '<tspan class="beam-num">' + info.num + '</tspan>' : '') + '</text>';
        });
        // hint anchors: outline the room's existing mirror and/or ring the laser's openings
        if (H) {
            if (H.kind === 'exclude' && H.reason === 'roomSat' && H.anchor != null) {
                const ar = (H.anchor / N) | 0, ac = H.anchor % N;
                s += '<rect class="beam-hint-anchor" x="' + (gx(ac) + 2) + '" y="' + (gy(ar) + 2) + '" width="' + (cs - 4) + '" height="' + (cs - 4) + '"/>';
            }
            const li = (H.laser != null && H.laser >= 0) ? H.laser : -1;
            if (li >= 0) {
                const openHi = (oidx, filled) => {
                    const o = P.opens[oidx]; let lx = cx(o.c), ly = cy(o.r);
                    if (o.side === U) ly = -28; else if (o.side === D) ly = size + 28; else if (o.side === L) lx = -28; else lx = size + 28;
                    return '<circle class="beam-hint-open' + (filled ? ' start' : '') + '" cx="' + lx + '" cy="' + ly + '" r="' + Math.min(cs * 0.44, 24) + '"/>';
                };
                const from = (H.from != null && H.from >= 0) ? H.from : -1;
                // beam path we traced (from the SOLID-ring end) through to the hinted cell
                if (H.path && H.path.length && from >= 0) {
                    const o = P.opens[from]; let sx = cx(o.c), sy = cy(o.r);
                    if (o.side === U) sy = -20; else if (o.side === D) sy = size + 20; else if (o.side === L) sx = -20; else sx = size + 20;
                    const pts = [sx + ',' + sy];
                    for (const ci of H.path) pts.push(cx(ci % N) + ',' + cy((ci / N) | 0));
                    const tgt = H.kind === 'place' ? H.cell : (H.reason === 'countFull' && H.cells && H.cells.length) ? H.cells[0] : -1;
                    if (tgt >= 0) pts.push(cx(tgt % N) + ',' + cy((tgt / N) | 0));
                    s += '<polyline class="beam-hint-ray" points="' + pts.join(' ') + '" fill="none"/>';
                }
                s += openHi(P.lasers[li].a, from === P.lasers[li].a) + openHi(P.lasers[li].b, from === P.lasers[li].b);
            }
        }
        // transparent hit cells on top
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
            const locked = S.givenRoom.has(P.room[r * N + c]);
            s += '<rect class="beam-cell' + (locked ? ' locked' : '') + '" data-cell="' + (r * N + c) + '" x="' + gx(c) + '" y="' + gy(r) + '" width="' + cs + '" height="' + cs + '"/>';
        }
        board().innerHTML = s;

        // status + win
        $('beam-status').textContent = t('beamLasers') + ' ' + ev.lasersOk + '/' + ev.lasersTotal + ' \u00b7 ' + t('beamRooms') + ' ' + ev.roomsExactly + '/' + P.roomCount;
        $('win-message').hidden = !ev.win;
        $('undo-btn').disabled = !(S.history && S.history.canUndo());
        if (PC.icons) PC.icons.render(document);
    }

    // ---- buttons ----
    function setDifficulty(d) { if (!VALID_DIFF[d] || d === S.diff) return; S.diff = d; syncSeg('difficulty-seg', d); newGame(); }
    function setSize(n) { n = +n; if (SIZES.indexOf(n) === -1 || n === S.N) return; S.N = n; syncSeg('size-seg', String(n)); newGame(); }
    function syncSeg(id, val) { const seg = $(id); if (!seg) return; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === val)); }

    function toggleReveal() {
        S.revealed = !S.revealed;
        $('reveal-btn').classList.toggle('active', S.revealed);
        $('reveal-btn').setAttribute('aria-pressed', S.revealed ? 'true' : 'false');
        render();
    }
    function undo() { if (S.history && S.history.undo()) render(); }
    function reset() { if (!S.puzzle) return; S.player.fill(EMPTY); S.history.clear(); clearHint(); render(); }
    function applyHintBanner(h) {
        const b = $('hint-banner'); if (!b || !h) return;
        const { html, error } = composeHint(h);
        b.hidden = false; b.classList.toggle('error', !!error); b.innerHTML = html;
        if (PC.icons) PC.icons.render(b);
    }
    function hint() {
        const P = S.puzzle; if (!P) return;
        S.hint = BM.hint(P, S.player, (DIFF[S.diff] || DIFF.medium).depth);
        applyHintBanner(S.hint);
        render();
    }
    async function share() {
        if (!PC.share) return;
        const ok = await PC.share.copyCurrentUrl();
        if (PC.toast) PC.toast.show(t(ok ? 'shareCopied' : 'shareFailed'));
    }

    // ---- boot ----
    function boot() {
        $('difficulty-seg').addEventListener('click', (e) => { const b = e.target.closest('button[data-value]'); if (b) setDifficulty(b.dataset.value); });
        $('size-seg').addEventListener('click', (e) => { const b = e.target.closest('button[data-value]'); if (b) setSize(b.dataset.value); });
        $('new-game-btn').addEventListener('click', () => newGame());
        $('reset-btn').addEventListener('click', reset);
        $('undo-btn').addEventListener('click', undo);
        $('hint-btn').addEventListener('click', hint);
        $('reveal-btn').addEventListener('click', toggleReveal);
        $('share-btn').addEventListener('click', share);
        board().addEventListener('pointerdown', (e) => {
            const cell = e.target.closest ? e.target.closest('rect[data-cell]') : null;
            if (cell) clickCell(+cell.getAttribute('data-cell'));
        });
        document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); } });
        if (PC.i18n && PC.i18n.subscribe) PC.i18n.subscribe(function () { if (S.puzzle) { render(); if (S.hint) applyHintBanner(S.hint); } });

        // restore from a shared URL if present
        let init = null;
        if (PC.share) {
            const p = PC.share.readParams();
            if (p && SIZES.indexOf(p.size) !== -1 && VALID_DIFF[p.difficulty] && Number.isInteger(p.seed)) init = p;
        }
        if (init) { S.N = init.size; S.diff = init.difficulty; }
        syncSeg('size-seg', String(S.N)); syncSeg('difficulty-seg', S.diff);
        newGame(init ? init.seed : undefined);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
