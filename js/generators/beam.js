/**
 * Kin-Kon-Kan (working id: "beam") — MODEL + SOLUTION GENERATOR.
 *
 * Rules:
 *   • Bold lines split the grid into ROOMS. Each room holds EXACTLY ONE mirror
 *     (/ or \). Cells without a mirror are empty (light passes straight).
 *   • Every border opening fires a laser straight inward; it reflects 90° at
 *     mirrors and must exit at its PAIRED opening (same letter). Beams may cross
 *     at empty cells and need not cover every cell.
 *   • Some openings carry a number = how many times that beam reflects.
 *   • No redundant mirror: every placed mirror is hit by at least one beam.
 *
 * This file: the board model (reflection + tracer that also counts reflections),
 * a correct-by-construction solution generator (random room partition → one
 * random mirror per room → trace every opening → keep only clean boards: all
 * openings paired, no loops, no unused mirror), a self-verifier, and an SVG
 * renderer. The uniqueness solver / number-clue minimiser / hint engine come
 * next, tuned via tools/beam-lab.html (we validate in-browser).
 *
 * Exposed: window.BeamModel
 */
(function (global) {
    'use strict';

    const PC = global.PuzzleCommon;

    const EMPTY = 0, SLASH = 1, BACK = 2;            // cell mirror content
    const U = 0, D = 1, L = 2, R = 3;                // travel directions
    const DR = [-1, 1, 0, 0], DC = [0, 0, -1, 1], OPP = [D, U, R, L];
    const SIDE_CH = ['U', 'D', 'L', 'R'];

    // R7 = per-laser path ENUMERATION (machine-ish; hard to narrate as a short,
    // player-checkable chain). Toggle OFF to run a fully "explainable" solver —
    // cheap rules + bounded assume→contradiction only — so every shipped board,
    // and every hint, is justifiable by steps the player can verify. See setUseR7.
    let useR7 = false;   // default OFF: explainable-only (cheap rules + bounded assume→contradiction)

    // '/' reflects R<->U, L<->D ; '\' reflects R<->D, L<->U ; empty = straight.
    function reflect(dir, m) {
        if (m === EMPTY) return dir;
        if (m === SLASH) return dir === R ? U : dir === U ? R : dir === L ? D : L;
        return dir === R ? D : dir === D ? R : dir === L ? U : L;
    }

    const isBorder = (r, c, N) => r === 0 || c === 0 || r === N - 1 || c === N - 1;

    // -----------------------------------------------------------------
    // Trace a laser from a border opening. entry = { r, c, dir(inward) }.
    // Returns { cells:[i...], exit:{r,c,side}|null, reflections, looped }.
    // Every mirror cell the beam enters is one reflection (a mirror never lets a
    // beam pass straight through).
    // -----------------------------------------------------------------
    function trace(mirror, N, entry) {
        const cells = [];
        let r = entry.r, c = entry.c, dir = entry.dir, reflections = 0;
        let guard = 0, cap = 8 * N * N + 10;
        while (true) {
            cells.push(r * N + c);
            const m = mirror[r * N + c];
            if (m !== EMPTY) reflections++;
            const nd = reflect(dir, m);
            const nr = r + DR[nd], nc = c + DC[nd];
            if (nr < 0 || nc < 0 || nr >= N || nc >= N) {
                return { cells, exit: { r, c, side: nd }, reflections, looped: false };
            }
            r = nr; c = nc; dir = nd;
            if (++guard > cap) return { cells, exit: null, reflections, looped: true };
        }
    }

    // -----------------------------------------------------------------
    // Random room partition by accretion: process cells in random order; a cell
    // joins a random already-assigned neighbour (keeping rooms connected) unless
    // it seeds a new room. `roomTarget` tunes the room count (≈ mirror count).
    // Returns { room: Int32Array, count }.
    // -----------------------------------------------------------------
    function partition(N, rng, roomTarget) {
        const total = N * N;
        const room = new Int32Array(total).fill(-1);
        const order = Array.from({ length: total }, (_, i) => i);
        PC.rng.shuffle(order, rng);
        const p = Math.max(0.05, Math.min(0.9, roomTarget / total));
        let next = 0;
        for (const i of order) {
            if (room[i] !== -1) continue;
            const r = (i / N) | 0, c = i % N, anb = [];
            for (let d = 0; d < 4; d++) {
                const nr = r + DR[d], nc = c + DC[d];
                if (nr >= 0 && nc >= 0 && nr < N && nc < N && room[nr * N + nc] !== -1) anb.push(room[nr * N + nc]);
            }
            if (anb.length && rng() > p) room[i] = anb[(rng() * anb.length) | 0];
            else room[i] = next++;
        }
        return { room, count: next };
    }

    function roomsCells(room, count) {
        const cells = Array.from({ length: count }, () => []);
        for (let i = 0; i < room.length; i++) cells[room[i]].push(i);
        return cells;
    }

    // Enumerate every border opening (one per exposed edge; corners give two).
    function openings(N) {
        const list = [];
        for (let c = 0; c < N; c++) list.push({ r: 0, c, side: U });
        for (let c = 0; c < N; c++) list.push({ r: N - 1, c, side: D });
        for (let r = 0; r < N; r++) list.push({ r, c: 0, side: L });
        for (let r = 0; r < N; r++) list.push({ r, c: N - 1, side: R });
        list.forEach((o, i) => { o.idx = i; });
        return list;
    }
    const openKey = (r, c, side, N) => (r * N + c) * 4 + side;

    // -----------------------------------------------------------------
    // Generate ONE full solution.
    //   { N, room, roomCount, mirror, opens, beams:[{a,b,cells,reflections}],
    //     openBeam: Int32Array(openCount) }
    // or null if we couldn't get a clean board in the attempt budget.
    // -----------------------------------------------------------------
    function generateSolution(N, seed, opts) {
        const rng = PC.rng.make(seed);
        const roomTarget = (opts && opts.roomTarget) || Math.round(N * 1.6);
        const partTries = (opts && opts.partTries) || 20;
        const mirrorTries = (opts && opts.mirrorTries) || 40;

        for (let pt = 0; pt < partTries; pt++) {
            const { room, count } = partition(N, rng, roomTarget);
            const cellsOf = roomsCells(room, count);
            const opens = openings(N);
            const okey = {};
            opens.forEach((o) => { okey[openKey(o.r, o.c, o.side, N)] = o.idx; });

            for (let mt = 0; mt < mirrorTries; mt++) {
                const mirror = new Int8Array(N * N).fill(EMPTY);
                for (const cells of cellsOf) {
                    const cell = cells[(rng() * cells.length) | 0];
                    mirror[cell] = rng() < 0.5 ? SLASH : BACK;
                }
                // trace every opening, pair them up
                const openBeam = new Int32Array(opens.length).fill(-1);
                const beams = [];
                const mirrorHit = new Int8Array(N * N);
                let bad = false;
                for (const o of opens) {
                    if (openBeam[o.idx] !== -1) continue;
                    const res = trace(mirror, N, { r: o.r, c: o.c, dir: OPP[o.side] });
                    if (res.looped || !res.exit) { bad = true; break; }
                    const exIdx = okey[openKey(res.exit.r, res.exit.c, res.exit.side, N)];
                    if (exIdx == null || exIdx === o.idx) { bad = true; break; } // off-grid / self
                    const bi = beams.length;
                    openBeam[o.idx] = bi; openBeam[exIdx] = bi;
                    beams.push({ a: o.idx, b: exIdx, cells: res.cells, reflections: res.reflections });
                    for (const ci of res.cells) if (mirror[ci] !== EMPTY) mirrorHit[ci] = 1;
                }
                if (bad) continue;
                // reject redundant (never-hit) mirrors
                let redundant = false;
                for (let i = 0; i < N * N; i++) if (mirror[i] !== EMPTY && !mirrorHit[i]) { redundant = true; break; }
                if (redundant) continue;

                // Choose a subset of beams to be the actual LASERS: the fewest
                // whose paths together touch EVERY mirror (greedy set cover).
                // The rest of the border edges stay blank. (A cover always
                // exists — the full beam set hits every mirror, checked above.)
                const beamMirrors = beams.map((b) => b.cells.filter((ci) => mirror[ci] !== EMPTY));
                let need = 0; for (let i = 0; i < N * N; i++) if (mirror[i] !== EMPTY) need++;
                const covered = new Set();
                const laserSet = new Set();
                const pool = beams.map((_, i) => i);
                while (covered.size < need) {
                    let best = -1, gainBest = 0;
                    for (const bi of pool) {
                        if (laserSet.has(bi)) continue;
                        let g = 0; for (const ci of beamMirrors[bi]) if (!covered.has(ci)) g++;
                        if (g > gainBest) { gainBest = g; best = bi; }
                    }
                    if (best < 0) break;
                    laserSet.add(best);
                    for (const ci of beamMirrors[best]) covered.add(ci);
                }
                const lasers = Array.from(laserSet).sort((a, b) => a - b);

                return { N, room, roomCount: count, mirror, opens, beams, openBeam, lasers, laserSet, seed };
            }
        }
        return null;
    }

    // -----------------------------------------------------------------
    // Self-verifier.
    // -----------------------------------------------------------------
    function verifySolution(sol) {
        const { N, room, roomCount, mirror, opens } = sol;
        const reasons = [];
        // exactly one mirror per room
        const perRoom = new Int32Array(roomCount);
        for (let i = 0; i < N * N; i++) if (mirror[i] !== EMPTY) perRoom[room[i]]++;
        for (let r = 0; r < roomCount; r++) if (perRoom[r] !== 1) reasons.push('room ' + r + ' has ' + perRoom[r] + ' mirrors');
        // re-trace: all openings paired, no loops, no self, no unused mirror
        const okey = {}; opens.forEach((o) => { okey[openKey(o.r, o.c, o.side, N)] = o.idx; });
        const paired = new Int8Array(opens.length);
        const hit = new Int8Array(N * N);
        for (const o of opens) {
            if (paired[o.idx]) continue;
            const res = trace(mirror, N, { r: o.r, c: o.c, dir: OPP[o.side] });
            if (res.looped || !res.exit) { reasons.push('opening ' + o.idx + ' loops'); continue; }
            const ex = okey[openKey(res.exit.r, res.exit.c, res.exit.side, N)];
            if (ex == null) { reasons.push('opening ' + o.idx + ' exits off-grid'); continue; }
            if (ex === o.idx) { reasons.push('opening ' + o.idx + ' returns to itself'); continue; }
            paired[o.idx] = 1; paired[ex] = 1;
            for (const ci of res.cells) if (mirror[ci] !== EMPTY) hit[ci] = 1;
        }
        let unpaired = 0; for (let i = 0; i < opens.length; i++) if (!paired[i]) unpaired++;
        if (unpaired) reasons.push(unpaired + ' opening(s) unpaired');
        let unused = 0; for (let i = 0; i < N * N; i++) if (mirror[i] !== EMPTY && !hit[i]) unused++;
        if (unused) reasons.push(unused + ' unused mirror(s)');
        return { ok: reasons.length === 0, reasons };
    }

    // -----------------------------------------------------------------
    // SVG render. Rooms = bold borders; mirrors = diagonals; openings labelled
    // by beam index (+ reflection count); beams drawn as coloured polylines.
    // opts: { showBeams:true, showMirrors:true, showCounts:true }
    // -----------------------------------------------------------------
    function renderSVG(sol, px, opts) {
        opts = opts || {};
        const showBeams = opts.showBeams !== false;
        const showMirrors = opts.showMirrors !== false;
        const showCounts = opts.showCounts !== false;
        const { N, room, mirror, opens, beams, openBeam, laserSet } = sol;
        const onlyLasers = !opts.showAllBeams && laserSet;   // default: show only the chosen lasers
        const S = px || 38, pad = Math.round(S * 1.1);
        const W = N * S + pad * 2, H = N * S + pad * 2;
        const gx = (c) => pad + c * S, gy = (r) => pad + r * S;
        const cx = (c) => gx(c) + S / 2, cy = (r) => gy(r) + S / 2;
        const COLORS = ['#e5484d', '#0a66c2', '#2e7d32', '#b341d1', '#f5a623', '#4f46e5', '#0891b2', '#db2777', '#65a30d', '#c026d3', '#0d9488', '#ca8a04'];
        let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="system-ui,sans-serif">';
        s += '<rect width="' + W + '" height="' + H + '" fill="#0e1117"/>';
        // thin grid
        for (let i = 0; i <= N; i++) {
            s += '<line x1="' + gx(i) + '" y1="' + gy(0) + '" x2="' + gx(i) + '" y2="' + gy(N) + '" stroke="#27303f"/>';
            s += '<line x1="' + gx(0) + '" y1="' + gy(i) + '" x2="' + gx(N) + '" y2="' + gy(i) + '" stroke="#27303f"/>';
        }
        // bold room borders
        const bold = (x1, y1, x2, y2) => '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#e6edf3" stroke-width="3" stroke-linecap="square"/>';
        s += bold(gx(0), gy(0), gx(N), gy(0)) + bold(gx(0), gy(N), gx(N), gy(N)) + bold(gx(0), gy(0), gx(0), gy(N)) + bold(gx(N), gy(0), gx(N), gy(N));
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
            const id = room[r * N + c];
            if (c + 1 < N && room[r * N + c + 1] !== id) s += bold(gx(c + 1), gy(r), gx(c + 1), gy(r + 1));
            if (r + 1 < N && room[(r + 1) * N + c] !== id) s += bold(gx(c), gy(r + 1), gx(c + 1), gy(r + 1));
        }
        // beams
        if (showBeams) beams.forEach((bm, bi) => {
            if (onlyLasers && !laserSet.has(bi)) return;
            const col = COLORS[bi % COLORS.length];
            const oa = opens[bm.a], ob = opens[bm.b];
            const tip = (o) => (cx(o.c) + DC[o.side] * S * 0.8) + ',' + (cy(o.r) + DR[o.side] * S * 0.8);
            const pts = [tip(oa)].concat(bm.cells.map((i) => cx(i % N) + ',' + cy((i / N) | 0)), [tip(ob)]);
            s += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>';
        });
        // mirrors
        if (showMirrors) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
            const m = mirror[r * N + c]; if (m === EMPTY) continue;
            const a = m === SLASH ? [gx(c) + 5, gy(r + 1) - 5, gx(c + 1) - 5, gy(r) + 5] : [gx(c) + 5, gy(r) + 5, gx(c + 1) - 5, gy(r + 1) - 5];
            s += '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + a[2] + '" y2="' + a[3] + '" stroke="#cbd5e1" stroke-width="3.5" stroke-linecap="round"/>';
        }
        // revealed "given" start-mirrors (locked) — always drawn, accent colour
        if (opts.givens) for (const g of opts.givens) {
            const r = (g.cell / N) | 0, c = g.cell % N;
            const a = g.orient === SLASH ? [gx(c) + 5, gy(r + 1) - 5, gx(c + 1) - 5, gy(r) + 5] : [gx(c) + 5, gy(r) + 5, gx(c + 1) - 5, gy(r + 1) - 5];
            s += '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + a[2] + '" y2="' + a[3] + '" stroke="#6ea8fe" stroke-width="4.5" stroke-linecap="round"/>';
        }
        // opening labels (beam index letter + reflection count)
        opens.forEach((o) => {
            const bi = openBeam[o.idx];
            if (onlyLasers && (bi < 0 || !laserSet.has(bi))) return;   // blank border edge
            const label = bi < 0 ? '?' : String.fromCharCode(65 + (bi % 26));
            const lx = cx(o.c) + DC[o.side] * S * 0.62, ly = cy(o.r) + DR[o.side] * S * 0.62;
            const col = bi < 0 ? '#9aa4b2' : COLORS[bi % COLORS.length];
            let txt = label;
            if (showCounts && bi >= 0) {
                if (opts.countMap) { if (opts.countMap[o.idx] != null) txt += opts.countMap[o.idx]; }
                else txt += beams[bi].reflections;
            }
            s += '<text x="' + lx + '" y="' + ly + '" fill="' + col + '" font-size="' + (S * 0.42) + '" font-weight="700" text-anchor="middle" dominant-baseline="middle">' + txt + '</text>';
        });
        s += '</svg>';
        return s;
    }

    // =================================================================
    // SOLVER — treat each room as a variable: (which cell holds its mirror,
    // and is it / or \). Backtracking over rooms with forward-checking: a laser
    // whose whole path is already determined must exit at its partner with the
    // right reflection count; a mirror left unused by every laser is illegal
    // (no redundant mirrors). Counts up to `limit` full solutions, so the
    // generator can insist on exactly one. Difficulty is read from the search
    // effort (back-tracks), NOT from density — so sparse and dense boards can
    // share a difficulty band, which is what we want.
    // =================================================================

    function roomDomains(cellsOf) {
        return cellsOf.map((cells) => {
            const dom = [];
            for (const c of cells) { dom.push({ cell: c, orient: SLASH }); dom.push({ cell: c, orient: BACK }); }
            return dom;
        });
    }

    function cellMirrorOf(assign, room, cell) {
        const a = assign[room[cell]];
        if (a === undefined) return -1;               // unknown (room not yet assigned)
        return a.cell === cell ? a.orient : EMPTY;
    }

    // Partial trace: stops (undetermined) the moment it needs an unassigned room.
    function traceAssign(assign, room, N, o) {
        let r = o.r, c = o.c, dir = OPP[o.side], refl = 0, guard = 0, cap = 8 * N * N + 10;
        while (true) {
            const m = cellMirrorOf(assign, room, r * N + c);
            if (m === -1) return { status: 'undet' };
            if (m !== EMPTY) refl++;
            const nd = reflect(dir, m);
            const nr = r + DR[nd], nc = c + DC[nd];
            if (nr < 0 || nc < 0 || nr >= N || nc >= N) return { status: 'exit', r, c, side: nd, refl };
            r = nr; c = nc; dir = nd;
            if (++guard > cap) return { status: 'loop' };
        }
    }

    function laserOK(assign, puzzle, L) {
        const { opens, room, N } = puzzle;
        const ends = [[opens[L.a], opens[L.b]], [opens[L.b], opens[L.a]]];
        for (const [start, end] of ends) {
            const t = traceAssign(assign, room, N, start);
            if (t.status === 'loop') return false;
            if (t.status === 'exit') {
                if (!(t.r === end.r && t.c === end.c && t.side === end.side)) return false;
                if (L.count != null && t.refl !== L.count) return false;
            }
        }
        return true;
    }

    // Exhaustive validity at a full assignment (authoritative incl. no-redundant).
    function fullMirror(assign, puzzle) {
        const { N, roomCount, opens, lasers } = puzzle;
        const mirror = new Int8Array(N * N).fill(EMPTY);
        for (let r = 0; r < roomCount; r++) mirror[assign[r].cell] = assign[r].orient;
        const hit = new Int8Array(N * N);
        for (const L of lasers) {
            const oa = opens[L.a], ob = opens[L.b];
            const t = trace(mirror, N, { r: oa.r, c: oa.c, dir: OPP[oa.side] });
            if (t.looped || !t.exit) return null;
            if (!(t.exit.r === ob.r && t.exit.c === ob.c && t.exit.side === ob.side)) return null;
            if (L.count != null && t.reflections !== L.count) return null;
            for (const ci of t.cells) if (mirror[ci] !== EMPTY) hit[ci] = 1;
        }
        for (let i = 0; i < N * N; i++) if (mirror[i] !== EMPTY && !hit[i]) return null;
        return mirror;
    }

    function solve(puzzle, limit) {
        const cellsOf = puzzle.cellsOf;
        const domains = roomDomains(cellsOf);
        const roomCount = puzzle.roomCount;
        const order = Array.from({ length: roomCount }, (_, i) => i)
            .sort((a, b) => domains[a].length - domains[b].length); // single-cell rooms first
        const assign = new Array(roomCount);
        const sols = [];
        let nodes = 0, backtracks = 0, capped = false;
        const CAP = 400000;   // safety valve so a pathological board can't hang the page
        function rec(k) {
            if (sols.length >= limit || capped) return;
            if (nodes > CAP) { capped = true; return; }
            if (k === order.length) { const m = fullMirror(assign, puzzle); if (m) sols.push(m); return; }
            const rid = order[k];
            for (const v of domains[rid]) {
                assign[rid] = v; nodes++;
                let ok = true;
                for (const L of puzzle.lasers) { if (!laserOK(assign, puzzle, L)) { ok = false; break; } }
                if (ok) rec(k + 1); else backtracks++;
                if (sols.length >= limit) { assign[rid] = undefined; return; }
            }
            assign[rid] = undefined;
        }
        rec(0);
        return { sols, nodes, backtracks, capped };
    }

    function analyze(puzzle) {
        const { sols, nodes, backtracks, capped } = solve(puzzle, 2);
        return { count: sols.length, unique: !capped && sols.length === 1, nodes, backtracks, capped, sols };
    }

    // Build a playable puzzle from a solution: lasers = the cover subset, then
    // strip reflection-count clues while the board stays uniquely solvable.
    // Returns { N, room, roomCount, cellsOf, opens, lasers, solution, difficulty,
    //           clueCounts } or null if even the full-clue board isn't unique.
    function makePuzzle(sol, seed, maxDepth, strip) {
        maxDepth = (maxDepth == null) ? 1 : maxDepth;   // allow 0 = pure-forced (no assumption)
        const rng = PC.rng.make((seed || sol.seed || 1) ^ 0x9e3779b9);
        const cellsOf = roomsCells(sol.room, sol.roomCount);
        const lasers = sol.beams.map((b) => ({ a: b.a, b: b.b, count: b.reflections }));
        const puzzle = { N: sol.N, room: sol.room, roomCount: sol.roomCount, cellsOf, opens: sol.opens, lasers };
        // Reveal the fewest true mirrors (greedy) needed to make the board
        // deducible. Random boards are almost never pure-deducible, so these
        // "given" start-mirrors are the anchors that bootstrap the deduction
        // (fewer givens = harder). Revealing all mirrors always solves, so this
        // terminates → a shippable, uniquely + human-deducible puzzle.
        const givens = [];
        let res = deduceSolve(puzzle, maxDepth, givens);
        let guard = 0;
        while (!res.solved) {
            // Collect every still-unpinned true mirror, then reveal a RANDOM one
            // (seeded, so shares reproduce). A top-down scan clustered givens at
            // the top-left; random keeps them spread across the board.
            const cand = [];
            for (let i = 0; i < sol.mirror.length; i++) {
                if (sol.mirror[i] === EMPTY) continue;
                if (givens.some((g) => g.cell === i)) continue;
                if (res.dom[i] !== contentBit(sol.mirror[i])) cand.push(i);  // not yet pinned to its true state
            }
            if (!cand.length) break;
            PC.rng.shuffle(cand, rng);
            const picked = cand[0];
            givens.push({ cell: picked, orient: sol.mirror[picked] });
            res = deduceSolve(puzzle, maxDepth, givens);
            if (++guard > sol.roomCount + 5) break;
        }
        if (!res.solved) return null;
        // optional: strip reflection NUMBERS while still deducible with these givens
        if (strip) {
            const idxs = lasers.map((_, i) => i); PC.rng.shuffle(idxs, rng);
            for (const i of idxs) { const keep = lasers[i].count; lasers[i].count = null; if (!deduceSolve(puzzle, maxDepth, givens).solved) lasers[i].count = keep; }
            res = deduceSolve(puzzle, maxDepth, givens);
        }
        const clueCounts = lasers.filter((L) => L.count != null).length;
        return {
            N: sol.N, room: sol.room, roomCount: sol.roomCount, cellsOf, opens: sol.opens,
            lasers, givens, numGivens: givens.length, solution: sol.mirror, deduced: res.mirror,
            tier: res.tier, difficulty: givens.length, clueCounts,
        };
    }

    // =================================================================
    // DEDUCTION SOLVER (iteration 1). Per-cell domain over {empty, /, \},
    // propagated with SOUND rules; a board "solves" only if forced moves up to
    // `maxDepth` hypothesis levels fully determine it (depth 1 = "if this cell
    // were X we immediately contradict, so it isn't"). Boards that need deeper
    // search — the guess-only ones — are rejected by the generator, so every
    // shipped board is uniquely solvable AND human-deducible.
    // =================================================================
    const EB = 1, SB = 2, BB = 4;                  // domain bits: empty, '/', '\'
    const bitContent = (b) => (b === EB ? EMPTY : b === SB ? SLASH : BACK);
    const contentBit = (m) => (m === SLASH ? SB : m === BACK ? BB : EB);
    function popc(x) { return (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1); }
    function bitsOf(m) { const a = []; if (m & EB) a.push(EB); if (m & SB) a.push(SB); if (m & BB) a.push(BB); return a; }
    function sameOpening(ex, o) { return ex.r === o.r && ex.c === o.c && ex.side === o.side; }

    function initDom(puzzle, givens) {
        const dom = new Uint8Array(puzzle.N * puzzle.N).fill(EB | SB | BB);
        for (const cells of puzzle.cellsOf) if (cells.length === 1) dom[cells[0]] = SB | BB; // single-cell room = a mirror
        if (givens) for (const g of givens) dom[g.cell] = contentBit(g.orient);             // revealed "start" mirrors
        return dom;
    }

    // Trace a laser using only cells whose domain is a single state; stop at the
    // first still-ambiguous cell.
    function traceDom(puzzle, dom, o) {
        const N = puzzle.N;
        let r = o.r, c = o.c, dir = OPP[o.side], refl = 0, guard = 0, cap = 8 * N * N + 10;
        while (true) {
            const mask = dom[r * N + c];
            if (popc(mask) !== 1) return { status: 'undet', refl };
            const m = bitContent(mask);
            if (m !== EMPTY) refl++;
            const nd = reflect(dir, m);
            const nr = r + DR[nd], nc = c + DC[nd];
            if (nr < 0 || nc < 0 || nr >= N || nc >= N) return { status: 'exit', r, c, side: nd, refl };
            r = nr; c = nc; dir = nd;
            if (++guard > cap) return { status: 'loop', refl };
        }
    }

    // Trace over determined cells, returning where it STOPS (first ambiguous
    // cell + the direction entering it) or EXITS, plus the determined prefix
    // cells and reflections so far. Powers the two-sided reach deductions.
    function traceStops(puzzle, dom, o) {
        const N = puzzle.N;
        let r = o.r, c = o.c, dir = OPP[o.side], refl = 0, guard = 0, cap = 8 * N * N + 10;
        const cells = [];
        while (true) {
            const idx = r * N + c, mask = dom[idx];
            if (popc(mask) !== 1) return { kind: 'stop', r, c, dir, refl, cells };
            cells.push(idx);
            const m = bitContent(mask); if (m !== EMPTY) refl++;
            const nd = reflect(dir, m);
            const nr = r + DR[nd], nc = c + DC[nd];
            if (nr < 0 || nc < 0 || nr >= N || nc >= N) return { kind: 'exit', exit: { r, c, side: nd }, refl, cells };
            r = nr; c = nc; dir = nd;
            if (++guard > cap) return { kind: 'loop' };
        }
    }
    // The mirror that turns a beam travelling inDir into outDir (or null).
    function mirrorForDirs(inDir, outDir) {
        if (reflect(inDir, SLASH) === outDir) return SLASH;
        if (reflect(inDir, BACK) === outDir) return BACK;
        return null;
    }

    // Count-0 laser → its straight line is all empty (sound given the clue).
    function applyZeroLines(puzzle, dom) {
        const { N, opens } = puzzle;
        for (const L of puzzle.lasers) {
            if (L.count !== 0) continue;
            const oa = opens[L.a], ob = opens[L.b];
            let r = oa.r, c = oa.c, dir = OPP[oa.side], guard = 0;
            while (true) {
                dom[r * N + c] &= EB;
                if (dom[r * N + c] === 0) return false;
                const nr = r + DR[dir], nc = c + DC[dir];
                if (nr < 0 || nc < 0 || nr >= N || nc >= N) { if (!sameOpening({ r, c, side: dir }, ob)) return false; break; }
                r = nr; c = nc;
                if (++guard > 4 * N * N) return false;
            }
        }
        return true;
    }

    // A beam with NO reflections left must shoot straight out at `other`: from
    // (r,c) going dir every cell is empty and it must exit exactly there. Sound.
    function straightForce(puzzle, dom, r, c, dir, other) {
        const N = puzzle.N; let guard = 0, changed = false;
        while (true) {
            const idx = r * N + c;
            if (dom[idx] & (SB | BB)) { dom[idx] &= EB; if (dom[idx] === 0) return 'contra'; changed = true; }
            const nr = r + DR[dir], nc = c + DC[dir];
            if (nr < 0 || nc < 0 || nr >= N || nc >= N)
                return (r === other.r && c === other.c && dir === other.side) ? (changed ? 'changed' : 'nochange') : 'contra';
            r = nr; c = nc; if (++guard > 4 * N * N) return 'contra';
        }
    }
    // A beam with EXACTLY ONE reflection left makes an L: from (xr,xc) going dir
    // it turns once at the crossing with `other`'s inward ray, then straight out
    // at `other`. Mirror + orientation + both sub-arms forced. Sound.
    function cornerForceAt(puzzle, dom, xr, xc, dir, other) {
        const N = puzzle.N, db = OPP[other.side];
        const dVert = (dir === U || dir === D), bVert = (db === U || db === D);
        if (dVert === bVert) return 'contra';                   // one 90° turn can't join parallel arms
        const cr = dVert ? other.r : xr, cc = dVert ? xc : other.c, corner = cr * N + cc;
        const orient = mirrorForDirs(dir, OPP[db]);             // in = dir, out = toward `other`
        if (orient == null) return 'contra';
        let changed = false;
        const emptyRun = (r, c, d) => {                         // empty (r,c)→corner (exclusive) along d
            let g = 0;
            while (!(r === cr && c === cc)) {
                const i = r * N + c;
                if (dom[i] & (SB | BB)) { dom[i] &= EB; if (dom[i] === 0) return false; changed = true; }
                r += DR[d]; c += DC[d];
                if (r < 0 || c < 0 || r >= N || c >= N || ++g > 4 * N) return false;
            }
            return true;
        };
        if (!emptyRun(xr, xc, dir) || !emptyRun(other.r, other.c, db)) return 'contra';
        const bit = contentBit(orient);
        if (!(dom[corner] & bit)) return 'contra';
        if (dom[corner] !== bit) { dom[corner] = bit; changed = true; }
        return changed ? 'changed' : 'nochange';
    }
    // FORCED REFLECTION (pure-forced): the beam enters X still owing ≥1 bounce,
    // but going straight from X every cell to the border is already KNOWN-EMPTY —
    // so an empty X would exit with reflections unspent. Hence X must be a mirror
    // (orientation left to the room / corner rules). Sound.
    function forcedMirror(puzzle, dom, xr, xc, dir) {
        const N = puzzle.N; let r = xr + DR[dir], c = xc + DC[dir], g = 0;
        while (r >= 0 && c >= 0 && r < N && c < N) {
            if (dom[r * N + c] !== EB) return 'nochange';      // an unknown / mirror ahead → can't conclude
            r += DR[dir]; c += DC[dir]; if (++g > 4 * N * N) return 'nochange';
        }
        const idx = xr * N + xc;
        if (!(dom[idx] & (SB | BB))) return 'contra';          // must be a mirror but can't be → contradiction
        if (dom[idx] & EB) { dom[idx] &= (SB | BB); return 'changed'; }
        return 'nochange';
    }

    // COUNT-COUPLED corner/straight (pure-forced, eye-checkable). Trace from each
    // end over already-placed mirrors; the stop point is a "virtual opening" with
    // the REMAINING count (= clue − reflections used). Remaining 0 ⇒ straight;
    // remaining 1 ⇒ corner; remaining ≥2 ⇒ forced-reflection when the straight
    // run is sealed. As mirrors get placed, count-2+ beams shed bounces and
    // collapse to corners — the coupling that makes pure deduction strong.
    function laserForce(puzzle, dom, L) {
        if (L.count == null) return 'nochange';
        let changed = false;
        for (const pr of [[L.a, L.b], [L.b, L.a]]) {
            const t = traceStops(puzzle, dom, puzzle.opens[pr[0]]);
            if (t.kind !== 'stop') continue;                   // 'exit' → R5 checks it; 'loop' → caller
            const remaining = L.count - t.refl, other = puzzle.opens[pr[1]];
            if (remaining < 0) return 'contra';
            let r = 'nochange';
            if (remaining === 0) r = straightForce(puzzle, dom, t.r, t.c, t.dir, other);
            else if (remaining === 1) r = cornerForceAt(puzzle, dom, t.r, t.c, t.dir, other);
            else r = forcedMirror(puzzle, dom, t.r, t.c, t.dir);
            if (r === 'contra') return 'contra';
            if (r === 'changed') changed = true;
        }
        return changed ? 'changed' : 'nochange';
    }

    // Propagate the sound rules to a fixpoint. Returns false on contradiction.
    function propagate(puzzle, dom) {
        const { N, cellsOf, opens } = puzzle;
        let changed = true, rounds = 0;
        while (changed && rounds++ < N * N * 8) {
            changed = false;
            for (const cells of cellsOf) {
                // R2: a mirror cell (no empty option) forces its roommates empty
                let mirrorCell = -1;
                for (const c of cells) if ((dom[c] & EB) === 0) { mirrorCell = c; break; }
                if (mirrorCell >= 0) for (const c of cells) if (c !== mirrorCell && (dom[c] & (SB | BB))) { dom[c] &= EB; if (dom[c] === 0) return false; changed = true; }
                // R3: how many cells can still hold the room's mirror?
                let det = false; const cand = [];
                for (const c of cells) { if ((dom[c] & EB) === 0) det = true; if (dom[c] & (SB | BB)) cand.push(c); }
                if (cand.length === 0) return false;             // a room must have a mirror
                if (!det && cand.length === 1) { const c = cand[0]; if (dom[c] & EB) { dom[c] &= (SB | BB); changed = true; if (dom[c] === 0) return false; } }
            }
            // R5 + R6: laser pairing/count + TWO-SIDED REACH deductions.
            for (const L of puzzle.lasers) {
                {                                             // count-coupled corner/straight (pure-forced)
                    const lf = laserForce(puzzle, dom, L);
                    if (lf === 'contra') return false;
                    if (lf === 'changed') changed = true;
                }
                const oa = opens[L.a], ob = opens[L.b];
                const fwd = traceStops(puzzle, dom, oa);
                const bwd = traceStops(puzzle, dom, ob);
                for (const pr of [[fwd, ob], [bwd, oa]]) {
                    const t = pr[0], endOpen = pr[1];
                    if (t.kind === 'loop') return false;
                    if (t.kind === 'exit') {
                        if (!sameOpening(t.exit, endOpen)) return false;
                        if (L.count != null && t.refl !== L.count) return false;
                    } else if (L.count != null) {                 // 'stop'
                        if (t.refl > L.count) return false;
                        if (t.refl === L.count) {                 // (6a) count used up → this cell is empty
                            const idx = t.r * N + t.c;
                            if (!(dom[idx] & EB)) return false;
                            if (dom[idx] !== EB) { dom[idx] = EB; changed = true; }
                        }
                    }
                }
                // (6b meet-in-the-middle forcing removed: UNSOUND when a beam
                // self-crosses at an empty cell — the two ends can meet at the
                // beam's SECOND pass through a cell, giving a wrong leave-dir.
                // The depth-bounded forced-move search handles that case soundly.)
            }
        }
        return true;
    }

    function contentsOf(mask) { const a = []; if (mask & EB) a.push(EMPTY); if (mask & SB) a.push(SLASH); if (mask & BB) a.push(BACK); return a; }

    // R7 — per-laser path enumeration. Enumerate ALL completions of this laser's
    // path consistent with the current domain + its reflection count, then force
    // any cell that carries the SAME content in EVERY completion. Enumerating
    // real paths (not a shortcut) handles self-crossing correctly, so it's sound.
    // Domain-only enumeration is a superset of the truly-legal paths, which only
    // makes it force fewer cells (never wrong). Bounded by node/path caps; if it
    // overflows it simply forces nothing.
    function laserEnumForce(puzzle, dom, L) {
        const { N, opens } = puzzle;
        const oa = opens[L.a], ob = opens[L.b];
        const CAP_NODES = 10000, CAP_PATHS = 700, STEP_CAP = 4 * N * N + 10;
        let nodes = 0, aborted = false, validCount = 0;
        const visits = new Map(), content = new Map(), decided = new Map(), roomMirror = new Set();
        function record() {
            if (++validCount > CAP_PATHS) { aborted = true; return; }
            for (const [cell, ct] of decided) {
                visits.set(cell, (visits.get(cell) || 0) + 1);
                if (content.has(cell)) { if (content.get(cell) !== ct) content.set(cell, -2); }
                else content.set(cell, ct);
            }
        }
        function dfs(r, c, dir, refl, steps) {
            if (aborted || ++nodes > CAP_NODES) { aborted = true; return; }
            if (steps > STEP_CAP) return;                 // looping path → discard
            const idx = r * N + c, fixed = decided.has(idx);
            const opts = fixed ? [decided.get(idx)] : contentsOf(dom[idx]);
            for (const ct of opts) {
                if (aborted) return;
                const nrefl = refl + (ct !== EMPTY ? 1 : 0);
                if (L.count != null && nrefl > L.count) continue;
                let addedRoom = -1;
                if (!fixed && ct !== EMPTY) {
                    const rid = puzzle.room[idx];
                    if (roomMirror.has(rid)) continue;     // a 2nd mirror in one room on this path is impossible (sound prune)
                    roomMirror.add(rid); addedRoom = rid;
                }
                if (!fixed) decided.set(idx, ct);
                const nd = reflect(dir, ct), nr = r + DR[nd], nc = c + DC[nd];
                if (nr < 0 || nc < 0 || nr >= N || nc >= N) {
                    if (sameOpening({ r, c, side: nd }, ob) && (L.count == null || nrefl === L.count)) record();
                } else dfs(nr, nc, nd, nrefl, steps + 1);
                if (!fixed) decided.delete(idx);
                if (addedRoom >= 0) roomMirror.delete(addedRoom);
            }
        }
        dfs(oa.r, oa.c, OPP[oa.side], 0, 0);
        if (aborted) return 'nochange';                   // enumeration too big → force nothing (safe)
        if (validCount === 0) return 'contra';            // no consistent path at all
        let changed = false;
        for (const [cell, ct] of content) {
            if (ct === -2 || (visits.get(cell) || 0) !== validCount) continue;  // not on every path / inconsistent
            const bit = contentBit(ct);
            if (!(dom[cell] & bit)) return 'contra';
            if (dom[cell] !== bit) { dom[cell] = bit; changed = true; }
        }
        return changed ? 'changed' : 'nochange';
    }

    // Cheap propagation to a fixpoint, then a pass of R7 forcing; repeat.
    function propagateFull(puzzle, dom) {
        let rounds = 0;
        while (rounds++ < puzzle.N * puzzle.N) {
            if (!propagate(puzzle, dom)) return false;
            if (!useR7) break;                 // explainable-only mode: cheap rules reached their fixpoint
            let changed = false;
            for (const L of puzzle.lasers) {
                const r = laserEnumForce(puzzle, dom, L);
                if (r === 'contra') return false;
                if (r === 'changed') changed = true;
            }
            if (!changed) break;
        }
        return true;
    }

    function allDet(dom) { for (let i = 0; i < dom.length; i++) if (popc(dom[i]) !== 1) return false; return true; }

    // Provably contradictory within `depth` hypothesis levels? (sound; may miss)
    function refute(puzzle, dom, depth) {
        const d = dom.slice();
        if (!propagate(puzzle, d)) return true;
        if (depth <= 0) return false;
        let bc = -1, bs = 9;
        for (let i = 0; i < d.length; i++) { const p = popc(d[i]); if (p > 1 && p < bs) { bs = p; bc = i; } }
        if (bc < 0) return false;
        for (const v of bitsOf(d[bc])) { const d2 = d.slice(); d2[bc] = v; if (!refute(puzzle, d2, depth - 1)) return false; }
        return true;
    }

    function deduceSolve(puzzle, maxDepth, givens) {
        const dom = initDom(puzzle, givens);
        if (!applyZeroLines(puzzle, dom) || !propagateFull(puzzle, dom)) return { solved: false, dom };
        let tier = 0, budget = puzzle.N * puzzle.N * 60;
        while (!allDet(dom)) {
            let progress = false;
            for (let depth = 1; depth <= maxDepth && !progress; depth++) {
                for (let c = 0; c < dom.length && !progress; c++) {
                    if (popc(dom[c]) <= 1) continue;
                    const viable = [];
                    for (const v of bitsOf(dom[c])) { const d2 = dom.slice(); d2[c] = v; if (!refute(puzzle, d2, depth - 1)) viable.push(v); }
                    if (viable.length === 0) return { solved: false, dom };
                    if (viable.length < popc(dom[c])) {
                        dom[c] = viable.reduce((a, b) => a | b, 0);
                        if (!propagateFull(puzzle, dom)) return { solved: false, dom };
                        tier = Math.max(tier, depth); progress = true;
                    }
                }
            }
            if (!progress || --budget < 0) return { solved: false, dom };
        }
        // Fully determined — validate against the clues (incl. no redundant mirror).
        const { N, opens } = puzzle;
        const mirror = new Int8Array(N * N).fill(EMPTY);
        for (let i = 0; i < dom.length; i++) { const m = bitContent(dom[i]); if (m !== EMPTY) mirror[i] = m; }
        const hit = new Int8Array(N * N);
        for (const L of puzzle.lasers) {
            const oa = opens[L.a], ob = opens[L.b];
            const t = trace(mirror, N, { r: oa.r, c: oa.c, dir: OPP[oa.side] });
            if (t.looped || !t.exit || !sameOpening(t.exit, ob)) return { solved: false, dom };
            if (L.count != null && t.reflections !== L.count) return { solved: false, dom };
            for (const ci of t.cells) if (mirror[ci] !== EMPTY) hit[ci] = 1;
        }
        for (let i = 0; i < N * N; i++) if (mirror[i] !== EMPTY && !hit[i]) return { solved: false, dom };
        return { solved: true, tier, mirror };
    }

    // =================================================================
    // HINT ENGINE (iteration 2) — tiered, SIMPLEST-FIRST, and ATTRIBUTED, so the
    // UI can tell the player *which room / laser* forces a cell and *why*,
    // including which cells to rule out (✗). Tiers 1-4 reference only the
    // player's own marks + given mirrors (fully re-derivable by eye); tiers 5-7
    // are the look-ahead ones (trace a laser / assume→contradiction) used when
    // the easy rules stall. `player` values: 0 empty · 1 '/' · 2 '\' · 3 ✗
    // (✗ = the player asserts this cell is empty).
    //
    // Returns one of:
    //   { kind:'wrong', cells }                             a mark clashes w/ the solution
    //   { kind:'exclude', reason, cells, anchor?, laser? }  mark these cells ✗
    //   { kind:'place', reason, cell, content, laser, inDir, outDir }  place / or \
    //   { kind:'assume', cell, hypo, content }              depth-bounded refutation
    //   { kind:'none' }
    // =================================================================
    const MARK = 3;                                              // player ✗ value
    const isKnownMirror = (dom, c) => popc(dom[c]) === 1 && dom[c] !== EB;
    const canMirror = (dom, c) => (dom[c] & (SB | BB)) !== 0;

    // Domain seeded from givens + the player's mirrors AND ✗ marks, plus the list
    // of player marks that contradict the (unique) solution.
    function seedPlayer(puzzle, player) {
        const sol = puzzle.solution, wrong = [];
        for (let c = 0; c < player.length; c++) {
            const p = player[c];
            if (p === SLASH || p === BACK) { if (sol[c] !== p) wrong.push(c); }
            else if (p === MARK) { if (sol[c] !== EMPTY) wrong.push(c); }
        }
        const dom = initDom(puzzle, puzzle.givens);
        for (let c = 0; c < player.length; c++) {
            const p = player[c];
            if (p === SLASH) dom[c] = SB;
            else if (p === BACK) dom[c] = BB;
            else if (p === MARK) dom[c] &= EB;
        }
        return { dom, wrong };
    }

    // Mirror board from the player's PLACED mirrors + givens (✗ and blanks = empty).
    function placedMirrors(puzzle, player) {
        const m = new Int8Array(puzzle.N * puzzle.N).fill(EMPTY);
        for (let i = 0; i < player.length; i++) if (player[i] === SLASH || player[i] === BACK) m[i] = player[i];
        for (const g of puzzle.givens) m[g.cell] = g.orient;
        return m;
    }

    // How a laser reaches `cell` in the SOLUTION — PREFERRING an approach the
    // player can actually trace (every mirror before the cell is already placed,
    // so `grounded` is true). A mirror is never redundant, so some laser always
    // passes through it. Returns { laser, from, inDir, path, refl, grounded }.
    function approachInto(puzzle, pm, cell) {
        const N = puzzle.N, m = puzzle.solution; let fallback = null;
        for (let li = 0; li < puzzle.lasers.length; li++) {
            const L = puzzle.lasers[li];
            for (const from of [L.a, L.b]) {
                const o = puzzle.opens[from];
                let r = o.r, c = o.c, dir = OPP[o.side], refl = 0, guard = 0, grounded = true, reached = false; const path = [];
                while (true) {
                    const idx = r * N + c;
                    if (idx === cell) { reached = true; break; }
                    path.push(idx);
                    const mm = m[idx]; if (mm !== EMPTY) { refl++; if (pm[idx] === EMPTY) grounded = false; }
                    const nd = reflect(dir, mm), nr = r + DR[nd], nc = c + DC[nd];
                    if (nr < 0 || nc < 0 || nr >= N || nc >= N) break;
                    r = nr; c = nc; dir = nd; if (++guard > 4 * N * N) break;
                }
                if (reached) {
                    const s = { laser: li, from, inDir: dir, path, refl, grounded };
                    if (grounded) return s;
                    if (!fallback) fallback = s;
                }
            }
        }
        return fallback || { laser: -1, from: -1, inDir: -1, path: [], refl: 0, grounded: false };
    }

    // The wrong slant traced over what the PLAYER can see: placed mirrors turn it,
    // ✗ cells confirmed-empty pass it straight; it STOPS (inconclusive) at the
    // first unknown blank. Rigorous — verifiable on the board right now.
    function altFailDetermined(puzzle, pm, player, cell, dir0, count, pair, reflSoFar) {
        const N = puzzle.N; let r = (cell / N) | 0, c = cell % N, dir = dir0, refl = reflSoFar + 1, guard = 0;
        while (true) {
            const nr = r + DR[dir], nc = c + DC[dir];
            if (nr < 0 || nc < 0 || nr >= N || nc >= N) {
                const atPair = (r === pair.r && c === pair.c && dir === pair.side);
                if (atPair && (count == null || refl === count)) return null;      // wrong also "works" here → inconclusive
                return { kind: 'wrongExit', exitSide: dir, rigorous: true };
            }
            const ni = nr * N + nc;
            if (pm[ni] !== EMPTY) { refl++; if (count != null && refl > count) return { kind: 'overCount', total: null, rigorous: true }; dir = reflect(dir, pm[ni]); }
            else if (player[ni] !== MARK) return null;                              // unknown blank ahead → inconclusive
            r = nr; c = nc;
            if (++guard > 4 * N * N) return null;
        }
    }
    // The wrong slant, traced over the full SOLUTION (every other cell fixed to
    // its true value). Always conclusive: flipping one mirror on the laser's path
    // must break it. "Trace the beam and watch it miss."
    function altFailSolution(puzzle, cell, from, wrong, L) {
        const N = puzzle.N, m = puzzle.solution.slice(); m[cell] = wrong;
        const o = puzzle.opens[from], pair = puzzle.opens[from === L.a ? L.b : L.a];
        const res = trace(m, N, { r: o.r, c: o.c, dir: OPP[o.side] });
        if (res.looped || !res.exit) return { kind: 'loop', rigorous: false };
        const atPair = (res.exit.r === pair.r && res.exit.c === pair.c && res.exit.side === pair.side);
        if (atPair) return (L.count != null && res.reflections !== L.count) ? { kind: 'overCount', total: res.reflections, rigorous: false } : { kind: 'lookahead', rigorous: false };
        return { kind: 'wrongExit', exitSide: res.exit.side, rigorous: false };
    }
    // WHY the opposite slant fails. `leave` = the direction the wrong slant sends
    // the beam out of THIS cell; `exitSide` = the grid edge it eventually leaves.
    function altFail(puzzle, pm, player, cell, inDir, correct, L, from, reflSoFar) {
        const wrong = correct === SLASH ? BACK : SLASH, leave = reflect(inDir, wrong), count = L.count;
        let a;
        if (count === 1) a = { kind: 'corner', exitSide: leave, rigorous: true };
        else {
            const pair = puzzle.opens[from === L.a ? L.b : L.a];
            a = altFailDetermined(puzzle, pm, player, cell, leave, count, pair, reflSoFar) || altFailSolution(puzzle, cell, from, wrong, L);
        }
        a.leave = leave;
        return a;
    }

    // Package a mirror placement with everything the UI needs to EXPLAIN it. The
    // APPROACH is kept GROUNDED (traceable over the player's own mirrors): if the
    // beam can't reach `cell` over placed mirrors, RE-TARGET to the first not-yet-
    // placed mirror on its path — the natural next step on that laser — so the
    // "comes in going …" never relies on turns the player can't see.
    function makePlace(puzzle, cell, orient, reason, player) {
        const pm = placedMirrors(puzzle, player);
        let a = approachInto(puzzle, pm, cell);
        if (a.laser >= 0 && !a.grounded) {
            const frontier = a.path.find((ci) => puzzle.solution[ci] !== EMPTY && pm[ci] === EMPTY);
            if (frontier != null) { cell = frontier; orient = puzzle.solution[frontier]; a = approachInto(puzzle, pm, cell); }
        }
        if (puzzle.cellsOf[puzzle.room[cell]].length === 1) reason = 'single';
        const L = a.laser >= 0 ? puzzle.lasers[a.laser] : null;
        const alt = (a.inDir >= 0 && L) ? altFail(puzzle, pm, player, cell, a.inDir, orient, L, a.from, a.refl) : { kind: 'lookahead', rigorous: false };
        const rigorousStep = a.grounded && (alt.kind === 'corner' || alt.rigorous === true);
        return {
            kind: 'place', reason, cell, content: orient,
            laser: a.laser, from: a.from, inDir: a.inDir, outDir: a.inDir >= 0 ? reflect(a.inDir, orient) : -1,
            path: a.path, count: L ? L.count : null, alt, rigorous: rigorousStep,
        };
    }

    // ---- Tiers 1-4: productive single steps over the player's own marks. ----
    function scanRoomSat(puzzle, dom, player, givenRooms) {
        for (let rid = 0; rid < puzzle.roomCount; rid++) {
            if (givenRooms.has(rid)) continue;
            let mcell = -1;
            for (const c of puzzle.cellsOf[rid]) if (isKnownMirror(dom, c)) { mcell = c; break; }
            if (mcell < 0) continue;
            const cells = [];
            for (const c of puzzle.cellsOf[rid]) if (c !== mcell && canMirror(dom, c) && player[c] === EMPTY) cells.push(c);
            if (cells.length) return { kind: 'exclude', reason: 'roomSat', cells, anchor: mcell };
        }
        return null;
    }
    function scanZeroLine(puzzle, dom, player) {
        const N = puzzle.N;
        for (let li = 0; li < puzzle.lasers.length; li++) {
            const L = puzzle.lasers[li]; if (L.count !== 0) continue;
            const o = puzzle.opens[L.a]; let r = o.r, c = o.c, dir = OPP[o.side], g = 0; const cells = [], line = [];
            while (true) {
                const idx = r * N + c; line.push(idx); if (canMirror(dom, idx) && player[idx] === EMPTY) cells.push(idx);
                const nr = r + DR[dir], nc = c + DC[dir]; if (nr < 0 || nc < 0 || nr >= N || nc >= N) break;
                r = nr; c = nc; if (++g > 4 * N * N) break;
            }
            if (cells.length) return { kind: 'exclude', reason: 'zeroLine', cells, laser: li, from: L.a, path: line };
        }
        return null;
    }
    function scanCountFull(puzzle, dom, player) {
        const N = puzzle.N;
        for (let li = 0; li < puzzle.lasers.length; li++) {
            const L = puzzle.lasers[li]; if (L.count == null) continue;
            for (const end of [L.a, L.b]) {
                const t = traceStops(puzzle, dom, puzzle.opens[end]);
                if (t.kind === 'stop' && t.refl === L.count) {
                    const idx = t.r * N + t.c;
                    if (canMirror(dom, idx) && player[idx] === EMPTY)
                        return { kind: 'exclude', reason: 'countFull', cells: [idx], laser: li, from: end, path: t.cells, count: L.count };
                }
            }
        }
        return null;
    }
    // Only surfaces placements whose slant is FULLY explainable here (corner /
    // forced exit / over-count). Cells that would need a look-ahead are left for
    // the laser/chain/assume tiers, so the "easy" hints stay airtight.
    function scanLastCell(puzzle, dom, player) {
        for (let rid = 0; rid < puzzle.roomCount; rid++) {
            const cs = puzzle.cellsOf[rid];
            let known = false; const cand = [];
            for (const c of cs) { if (isKnownMirror(dom, c)) known = true; if (canMirror(dom, c)) cand.push(c); }
            if (known || cand.length !== 1) continue;
            const c = cand[0]; if (player[c] !== EMPTY) continue;
            const place = makePlace(puzzle, c, puzzle.solution[c], cs.length === 1 ? 'single' : 'lastCell', player);
            if (place.rigorous) return place;   // only surface fully board-verifiable slants at the simple tier
        }
        return null;
    }
    // ---- Tiers 5-7: look-ahead (named laser trace, then propagation chain,
    //      then a depth-bounded assume→contradiction). ----
    function scanLaser(puzzle, seed, player) {
        if (!useR7) return null;               // explainable-only mode uses the assume→contradiction tier instead
        const w = seed.slice(); if (!propagate(puzzle, w)) return null;
        for (let li = 0; li < puzzle.lasers.length; li++) {
            const w2 = w.slice(); if (laserEnumForce(puzzle, w2, puzzle.lasers[li]) !== 'changed') continue;
            for (let c = 0; c < w2.length; c++) {
                if (popc(w2[c]) !== 1 || popc(w[c]) <= 1) continue;      // forced by THIS laser's enumeration
                const content = bitContent(w2[c]);
                if (content !== EMPTY) {
                    if (player[c] !== EMPTY) continue;
                    return makePlace(puzzle, c, content, 'laser', player);
                } else if (canMirror(seed, c) && player[c] === EMPTY) {
                    return { kind: 'exclude', reason: 'laserEmpty', cells: [c], laser: li };
                }
            }
        }
        return null;
    }
    // First cell the solver has fully determined (vs the ORIGINAL seed) that the
    // player hasn't acted on yet — preferring a mirror placement over a ✗.
    function firstActionable(puzzle, seed, dom, player) {
        for (let pass = 0; pass < 2; pass++) {
            for (let c = 0; c < dom.length; c++) {
                if (popc(dom[c]) !== 1 || popc(seed[c]) <= 1) continue;
                const content = bitContent(dom[c]);
                if (pass === 0 && content !== EMPTY && player[c] === EMPTY) return makePlace(puzzle, c, content, 'chain', player);
                if (pass === 1 && content === EMPTY && canMirror(seed, c) && player[c] === EMPTY) return { kind: 'exclude', reason: 'chain', cells: [c] };
            }
        }
        return null;
    }
    // The deep tier: replicate deduceSolve's engine (propagateFull + refute-based
    // domain NARROWING, re-propagating after each) and surface the first newly
    // determined, still-actionable cell. Crucially it narrows cells 3→2 (not only
    // →1) and re-propagates, so cascades that a single pass misses still progress
    // — guaranteeing a next step whenever the board is solvable from here.
    function scanDeep(puzzle, seed, player, maxDepth) {
        const dom = seed.slice();
        if (!applyZeroLines(puzzle, dom) || !propagateFull(puzzle, dom)) return null;
        let budget = puzzle.N * puzzle.N * 60;
        while (budget-- > 0) {
            const step = firstActionable(puzzle, seed, dom, player);
            if (step) return step;
            let narrowed = false;
            for (let depth = 1; depth <= maxDepth && !narrowed; depth++) {
                for (let c = 0; c < dom.length && !narrowed; c++) {
                    if (popc(dom[c]) <= 1) continue;
                    const viable = [];
                    for (const v of bitsOf(dom[c])) { const d2 = dom.slice(); d2[c] = v; if (!refute(puzzle, d2, depth - 1)) viable.push(v); }
                    if (viable.length === 0) return null;                         // contradiction (shouldn't happen on a correct board)
                    if (viable.length < popc(dom[c])) { dom[c] = viable.reduce((a, b) => a | b, 0); if (!propagateFull(puzzle, dom)) return null; narrowed = true; }
                }
            }
            if (!narrowed) return null;   // genuinely stuck beyond this difficulty's search depth
        }
        return null;
    }

    function hint(puzzle, player, maxDepth) {
        maxDepth = maxDepth || 1;
        const { dom, wrong } = seedPlayer(puzzle, player);
        if (wrong.length) return { kind: 'wrong', cells: wrong };
        const givenRooms = new Set((puzzle.givens || []).map((g) => puzzle.room[g.cell]));
        // Tiers 1-4 read the player's own marks verbatim (fully re-derivable).
        const simple = scanRoomSat(puzzle, dom, player, givenRooms)
            || scanZeroLine(puzzle, dom, player)
            || scanCountFull(puzzle, dom, player)
            || scanLastCell(puzzle, dom, player);
        if (simple) return simple;
        // Look-ahead tiers mirror deduceSolve: fold in the 0-count straight lines
        // first, then trace a laser / propagate / assume→contradiction.
        const look = dom.slice(); applyZeroLines(puzzle, look);
        return scanLaser(puzzle, look, player)
            || scanDeep(puzzle, look, player, maxDepth)
            || { kind: 'none' };
    }

    global.BeamModel = {
        EMPTY, SLASH, BACK, MARK, U, D, L, R, SIDE_CH, reflect, trace,
        partition, roomsCells, openings,
        generateSolution, verifySolution, renderSVG,
        solve, analyze, makePuzzle, deduceSolve, hint,
        setUseR7: (b) => { useR7 = !!b; }, getUseR7: () => useR7,
    };
})(window);
