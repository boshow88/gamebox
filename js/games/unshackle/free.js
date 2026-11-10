/** Continuous axial translations. Stop coordinates are real distances, not slots. */
(function (global) {
    'use strict';
    const E = global.UnshackleEngine, M = E.math, REMOVED = null, GAP = 0.0001;
    const LAYOUT = { radiusRatio: 1.1, coreSpan: 3.2, totalSpan: 4.4, stableOffset: 0.04, neighborGap: 0.55 };
    const SIZES = [12, 18, 24, 30, 36, 48], SHARE_SIZES = [6, 8, ...SIZES];
    const TIERS = global.PuzzleGenerators.unshackleInternals.SETTINGS;
    const LEGACY_SETTINGS = {
        easy: { sizes: TIERS.easy.sizes, minShifts: 1, maxShifts: 1, minCore: 3 },
        medium: { sizes: TIERS.medium.sizes, minShifts: 1, maxShifts: 3, minCore: 4 },
        hard: { sizes: TIERS.hard.sizes, minShifts: 1, maxShifts: 4, minCore: 4 }
    };
    const SETTINGS = {
        easy: { sizes: TIERS.easy.sizes, minShifts: 4, maxShifts: 6, minCore: 12 },
        medium: { sizes: TIERS.medium.sizes, minShifts: 8, maxShifts: 10, minCore: 24 },
        hard: { sizes: TIERS.hard.sizes, minShifts: 12, maxShifts: 16, minCore: 36 }
    };
    function at(piece, offset) {
        const pose = E.piece(piece.id, piece.color, M.add(piece.center, M.mul(piece.dir, offset)), piece.u, piece.v,
            piece.length, M.dot(piece.u, piece.dir) > 0 ? 1 : -1, piece);
        if (!piece.shoulder) return pose;
        return withShoulder(pose, piece.shoulder, piece.shoulderAxis);
    }
    function withShoulder(piece, halfWidth = 0.52, shoulderAxis = 'v') {
        if (piece.shoulder) piece = E.piece(piece.id, piece.color, piece.center, piece.u, piece.v, piece.length, M.dot(piece.u, piece.dir) > 0 ? 1 : -1, piece);
        const junction = piece.knob, axis = shoulderAxis === 'normal' ? M.cross(piece.u, piece.v) : piece.v;
        const branch = [M.add(junction, M.mul(axis, -halfWidth)), M.add(junction, M.mul(axis, halfWidth))];
        const branchRadius = 0.19;
        const segment = { a: branch[0], b: branch[1], r: branchRadius };
        return { ...piece, shoulder: halfWidth, shoulderAxis, branchRadius, branches: [branch],
            bodySegments: [...piece.segments.slice(0, piece.path.length), segment], segments: [...piece.segments, segment] };
    }
    function compile(pieces) {
        const poseCaches = pieces.map(() => new Map()), ranges = new Map(), rays = new Map();
        function ray(all, positions, i, j) {
            const key = `${i}:${positions[i]}:${j}:${positions[j]}`;
            if (!rays.has(key)) {
                if (rays.size >= 32768) rays.delete(rays.keys().next().value);
                rays.set(key, E.sweptCollision(all[i], all[j]));
            }
            return rays.get(key);
        }
        const poses = positions => pieces.map((p, i) => {
            const offset = positions[i] === REMOVED ? 0 : positions[i], cache = poseCaches[i];
            if (!cache.has(offset)) { if (cache.size >= 256) cache.clear(); cache.set(offset, at(p, offset)); }
            return cache.get(offset);
        });
        function limits(positions, index) {
            const key = `${index}:${positions.join(',')}`;
            if (ranges.has(key)) return ranges.get(key);
            const all = poses(positions), moving = all[index];
            const fixed = all.filter((_, i) => i !== index && positions[i] !== REMOVED);
            function side(sign) {
                const directed = { ...moving, dir: M.mul(moving.dir, sign) };
                const exit = E.exitDistance(directed, [directed, ...fixed]);
                const blocked = travel => fixed.filter(p => E.sweptCollision(moving, p, travel * sign));
                const blockers = blocked(exit);
                if (!blockers.length) return { travel: exit, exit, blockers: [] };
                let lo = 0, hi = exit;
                for (let i = 0; i < 18; i++) {
                    const mid = (lo + hi) / 2;
                    if (fixed.some(p => E.sweptCollision(moving, p, mid * sign))) hi = mid; else lo = mid;
                }
                return { travel: Math.max(0, lo - GAP), exit, blockers: blocked(hi).map(p => p.id) };
            }
            const back = side(-1), forward = side(1);
            const result = { min: back.blockers.length ? -back.travel : -Infinity, max: forward.travel, back, forward };
            if (ranges.size >= 4096) ranges.clear(); ranges.set(key, result);
            return result;
        }
        function blockers(positions, index) {
            const all = poses(positions);
            return all.filter((p, j) => j !== index && positions[j] !== REMOVED && ray(all, positions, index, j)).map(p => p.id);
        }
        function canTravel(positions, index, travel) {
            const all = poses(positions), moving = all[index];
            return all.every((p, i) => i === index || positions[i] === REMOVED || !E.sweptCollision(moving, p, travel));
        }
        return { poses, limits, blockers, canTravel };
    }
    function dragPlan(range, travel, extractAt = range.forward.exit) {
        const offset = Math.max(range.min, Math.min(range.max, travel));
        const direction = travel >= 0 ? range.forward : range.back;
        return { offset, exitDistance: range.forward.exit, extract: travel >= 0 && !direction.blockers.length && travel >= Math.min(direction.exit, Math.max(0.6, extractAt)) - GAP };
    }
    // Contact boundaries and the interiors of their free intervals are candidates
    // for hints. This bounded search verifies a route, never a claim of no route.
    function solve(puzzle, initial = puzzle.initial, budget = 250) {
        // Try a witness suffix with matching remaining pieces, rechecking every
        // motion from the actual continuous coordinates before using it. Other
        // positions and extraction orders use geometric search below.
        if (puzzle.solution) {
            const ps = puzzle.initial.slice();
            let continuation = null;
            for (let step = 0; step <= puzzle.solution.length; step++) {
                if (ps.every((p, i) => (p === REMOVED) === (initial[i] === REMOVED))) {
                    const route = puzzle.solution.slice(step);
                    if (verify(puzzle, route, initial)) continuation = route;
                }
                const move = puzzle.solution[step];
                if (move) ps[move.id - 1] = move.extract ? REMOVED : move.offset;
            }
            if (continuation) return { status: 'solved', solution: continuation, visited: 0 };
        }
        if (puzzle.relays) {
            const continuation = solveRelays(puzzle, initial);
            if (continuation) return { status: 'solved', solution: continuation, visited: 0 };
        }
        const model = puzzle.model || compile(puzzle.pieces), queue = [{ positions: initial.slice(), solution: [] }], seen = new Set();
        for (let head = 0; head < queue.length && head < budget; head++) {
            const node = queue[head], ps = node.positions.slice(), path = node.solution.slice();
            let changed = true;
            while (changed) {
                changed = false;
                for (let i = 0; i < ps.length; i++) {
                    if (ps[i] === REMOVED) continue;
                    const sign = !model.blockers(ps, i).length ? 1 : 0;
                    if (sign) { ps[i] = REMOVED; path.push({ id: i + 1, extract: true, sign }); changed = true; }
                }
            }
            if (ps.every(p => p === REMOVED)) return { status: 'solved', solution: path, visited: head + 1 };
            const key = ps.map(p => p === REMOVED ? 'x' : p.toFixed(4)).join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            for (let i = 0; i < ps.length; i++) {
                if (ps[i] === REMOVED) continue;
                const range = model.limits(ps, i);
                for (const delta of [range.min, range.max, range.min / 2, range.max / 2]) {
                    if (!Number.isFinite(delta) || Math.abs(delta) < 0.005) continue;
                    const next = ps.slice(); next[i] += delta;
                    queue.push({ positions: next, solution: [...path, { id: i + 1, offset: next[i] }] });
                }
            }
        }
        return { status: 'budget', solution: [] };
    }
    function verify(puzzle, solution, initial = puzzle.initial) {
        const ps = initial.slice(), model = puzzle.model || compile(puzzle.pieces);
        for (const move of solution) {
            const i = move.id - 1;
            if (ps[i] === REMOVED) return false;
            if (move.extract) {
                if (model.blockers(ps, i).length) return false;
                ps[i] = REMOVED;
            } else {
                if (!Number.isFinite(move.offset) || !model.canTravel(ps, i, move.offset - ps[i])) return false;
                ps[i] = move.offset;
            }
        }
        return ps.every(p => p === REMOVED);
    }
    // Reject precision-only openings. Under- and overshooting by 0.18 units
    // must both preserve the route; physical contact clamps an overshoot.
    function comfortable(puzzle, solution) {
        const ps = puzzle.initial.slice();
        for (let step = 0; step < solution.length; step++) {
            const move = solution[step], i = move.id - 1;
            if (!move.extract) {
                const travel = move.offset - ps[i];
                if (Math.abs(travel) < 0.38) return false;
                const range = puzzle.model.limits(ps, i);
                for (const side of [-1, 1]) {
                    const desired = move.offset + Math.sign(travel) * side * 0.18;
                    const target = ps[i] + Math.max(range.min, Math.min(range.max, desired - ps[i]));
                    const varied = solution.slice(step).map(m => ({ ...m })); varied[0].offset = target;
                    if (!verify(puzzle, varied, ps)) return false;
                }
                ps[i] = move.offset;
            } else ps[i] = REMOVED;
        }
        return true;
    }
    function extractionCore(puzzle, positions = puzzle.initial) {
        const ps = positions.slice();
        let changed = true;
        while (changed) {
            changed = false;
            for (let i = 0; i < ps.length; i++) if (ps[i] !== REMOVED && !puzzle.model.blockers(ps, i).length) {
                ps[i] = REMOVED; changed = true;
            }
        }
        return ps.filter(p => p !== REMOVED).length;
    }
    // Generation quality only: physics still uses the exact rendered capsules.
    // A stable body-blocking cycle excludes puzzles locked only by end caps or
    // tangencies. Nearby core bodies must also form one spatial cluster.
    function layoutQuality(puzzle) {
        const poses = puzzle.model.poses(puzzle.initial);
        const bodies = poses.map(p => ({ ...p, segments: p.bodySegments || p.segments.slice(0, p.path.length) }));
        const graph = E.blockingGraph(poses), robust = poses.map(() => []);
        let bodyEdges = 0, tipOnlyEdges = 0;
        for (let i = 0; i < poses.length; i++) {
            const p = bodies[i], distance = E.exitDistance(p, bodies);
            const variants = [p];
            for (const axis of [p.v, M.cross(p.u, p.v)]) for (const sign of [-1, 1]) {
                const delta = M.mul(axis, sign * LAYOUT.stableOffset);
                variants.push({ ...p, segments: p.segments.map(s => ({ ...s, a: M.add(s.a, delta), b: M.add(s.b, delta) })) });
            }
            for (const id of graph[i]) {
                const other = bodies[id - 1];
                if (!E.sweptCollision(p, other, distance)) { tipOnlyEdges++; continue; }
                bodyEdges++;
                if (variants.every(v => E.sweptCollision(v, other, distance))) robust[i].push(id);
            }
        }
        const remaining = new Set(poses.map((_, i) => i));
        let changed = true;
        while (changed) {
            changed = false;
            for (const i of remaining) if (graph[i].every(id => !remaining.has(id - 1))) { remaining.delete(i); changed = true; }
        }
        const nearby = bodies.map((a, i) => bodies.map((b, j) => i !== j && E.overlaps(a, b, LAYOUT.neighborGap) ? j : -1).filter(j => j >= 0));
        const reached = new Set(), pending = remaining.size ? [[...remaining][0]] : [];
        while (pending.length) {
            const i = pending.pop(); if (reached.has(i)) continue;
            reached.add(i); nearby[i].filter(j => remaining.has(j) && !reached.has(j)).forEach(j => pending.push(j));
        }
        const radiusRatio = E.bounds(poses).radius / E.bounds(puzzle.pieces).radius;
        const span = indices => Math.max(0, ...indices.flatMap(i => indices.map(j => Math.hypot(...M.sub(poses[i].center, poses[j].center)))));
        const coreSpan = span([...remaining]), totalSpan = span(poses.map((_, i) => i));
        const bodyCycle = !E.analyze(robust).solvable;
        const coreConnected = remaining.size >= 2 && reached.size === remaining.size;
        const robustEdges = robust.reduce((sum, ids) => sum + ids.length, 0);
        const solidRatio = robustEdges / Math.max(1, graph.reduce((sum, ids) => sum + ids.length, 0));
        return { radiusRatio, coreSpan, totalSpan, bodyCycle, coreConnected, bodyEdges, tipOnlyEdges, robustEdges, solidRatio,
            accepted: radiusRatio <= LAYOUT.radiusRatio &&
                coreSpan <= (puzzle.version >= 6 ? 4.5 * Math.sqrt(poses.length / 3) : LAYOUT.coreSpan) &&
                totalSpan <= (puzzle.version >= 6 ? 4.5 * Math.sqrt(poses.length / 3) : LAYOUT.totalSpan * Math.max(1, Math.sqrt(poses.length / 8))) &&
                bodyCycle && coreConnected && tipOnlyEdges === 0 && solidRatio >= 0.8 };
    }
    function planning(puzzle, solution) {
        const actors = new Set(); let coordinated = 0;
        for (const move of solution) {
            if (move.extract) actors.clear();
            else { actors.add(move.id); coordinated = Math.max(coordinated, actors.size); }
        }
        return { coreSize: extractionCore(puzzle), coordinatedPieces: coordinated,
            shifts: solution.filter(m => !m.extract).length };
    }
    function supportedAssembly(puzzle) {
        const graph = E.blockingGraph(puzzle.model.poses(puzzle.initial));
        const core = new Set(graph.map((_, i) => i));
        let changed = true;
        while (changed) {
            changed = false;
            for (const i of core) if (graph[i].every(id => !core.has(id - 1))) { core.delete(i); changed = true; }
        }
        const pieces = puzzle.pieces.map((p, i) => core.has(i) ? p : E.piece(p.id, p.color, p.center, p.u, p.v, p.length, M.dot(p.u, p.dir) > 0 ? 1 : -1, p));
        const model = compile(pieces), poses = model.poses(puzzle.initial);
        if (poses.some((p, i) => poses.slice(i + 1).some(q => E.overlaps(p, q)))) return null;
        const candidate = { ...puzzle, pieces, model }, layout = layoutQuality(candidate);
        return layout.accepted ? { ...candidate, layout } : null;
    }

    function geometryKey(puzzle) {
        const poses = puzzle.model.poses(puzzle.initial);
        const shoulders = poses.filter(p => p.shoulder).map(p => {
            const branch = p.branches[0], axis = M.unit(M.sub(branch[1], branch[0]));
            return { center: M.mul(M.add(branch[0], branch[1]), 0.5), u: axis, v: p.dir, dir: axis, length: p.shoulder * 2 };
        });
        return global.PuzzleGenerators.unshackleInternals.fingerprint([...poses, ...shoulders]);
    }
    // Reverse insertion preserves a verified core and supplies a legal removal
    // witness. Each added frame threads an existing body, without an artificial stop.
    async function grow(size, difficulty, seed, onProgress) {
        const core = await generateLegacy(8, difficulty, seed, onProgress ? f => onProgress(f * 0.65) : undefined);
        let value = (seed ^ 0x7f4a7c15) >>> 0;
        const rng = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
        const palette = global.PuzzleGenerators.unshackleMatch.PALETTE;
        const pieces = core.model.poses(core.initial), solution = core.solution.map(m => m.extract ? m : ({ ...m, offset: m.offset - core.initial[m.id - 1] }));
        let backtracks = 0, progress = 0.65;
        for (let id = 9; id <= size; id++) {
            let accepted = false;
            for (let attempt = 0; attempt < (backtracks ? 800 : 4000); attempt++) {
                if (attempt % 64 === 0 && onProgress) {
                    progress = Math.max(progress, 0.65 + 0.3 * (id - 9) / (size - 8));
                    await onProgress(progress);
                }
                const host = pieces[Math.floor(rng() * pieces.length)];
                const u = M.mul(M.cross(host.u, host.v), rng() < 0.5 ? -1 : 1), v = M.mul(host.u, rng() < 0.5 ? -1 : 1);
                const length = 3.2 + rng() * 1.3;
                const center = M.add(host.center, M.add(M.mul(host.u, (rng() * 2 - 1) * (host.length / 2 - 0.8)),
                    M.add(M.mul(host.v, (rng() * 2 - 1) * 0.16), M.mul(u, (rng() * 2 - 1) * (length / 2 - 0.8)))));
                const p = E.piece(id, palette[(id - 1) % palette.length], center, u, v, length, rng() < 0.5 ? -1 : 1, { width: 1.25 });
                if (pieces.some(q => E.overlaps(p, q, 0.035)) || pieces.some(q => E.sweptCollision(p, q))) continue;
                const body = q => ({ ...q, segments: q.bodySegments || q.segments.slice(0, q.path.length) });
                const blocked = pieces.filter(q => E.sweptCollision(q, p));
                if (!blocked.length || blocked.some(q => !E.sweptCollision(body(q), body(p)))) continue;
                if (!E.overlaps(body(host), body(p), LAYOUT.neighborGap)) continue;
                const stable = blocked.every(q => [q.v, M.cross(q.u, q.v)].every(axis => [-1, 1].every(sign => {
                    const delta = M.mul(axis, sign * LAYOUT.stableOffset), b = body(q);
                    return E.sweptCollision({ ...b, segments: b.segments.map(s => ({ ...s, a: M.add(s.a, delta), b: M.add(s.b, delta) })) }, body(p));
                })));
                if (!stable) continue;
                if (pieces.some(q => Math.hypot(...M.sub(center, q.center)) > LAYOUT.totalSpan * Math.sqrt(size / 8))) continue;
                pieces.push(p); solution.unshift({ id, extract: true, sign: 1 }); accepted = true; break;
            }
            if (!accepted) {
                // A legal insertion can leave no room for the next frame.
                // Backtrack the assembly choice, retaining the verified core.
                if (pieces.length > 8 && backtracks++ < 64) {
                    pieces.pop(); solution.shift(); id -= 2; continue;
                }
                throw new Error('Continuous assembly growth budget exhausted');
            }
        }
        const puzzle = { mode: 'free', version: 5, size, difficulty, seed: seed >>> 0, pieces, initial: pieces.map(() => 0),
            model: compile(pieces), solution, id: `unshackle-free-v5-${size}-${(seed >>> 0).toString(36)}` };
        if (!verify(puzzle, solution)) throw new Error('Continuous growth witness failed');
        puzzle.graph = E.blockingGraph(pieces); puzzle.fingerprint = geometryKey(puzzle);
        puzzle.structure = `free:${size}:${puzzle.graph.map(bs => bs.length).sort().join(',')}`;
        const layout = layoutQuality(puzzle);
        if (!layout.accepted) throw new Error('Continuous grown layout failed quality checks: ' + JSON.stringify(layout));
        puzzle.stats = { ...core.stats, ...layout, ...planning(puzzle, solution), grownPieces: size - 8 };
        if (onProgress) await onProgress(1);
        return puzzle;
    }
    async function generateLegacy(size, difficulty, seed, onProgress) {
        if (size > 8 || difficulty !== 'hard') return generateOne(size, difficulty, seed, onProgress);
        // Prefer a more involved core without an unbounded rare-shape search.
        let best;
        for (let i = 0; i < 2; i++) {
            const candidate = await generateOne(size, difficulty, (seed + Math.imul(i, 0x9e3779b9)) >>> 0,
                onProgress ? f => onProgress((i + f) / 2) : undefined);
            const score = p => p.stats.coreSize + 2 * p.stats.shifts + p.stats.coordinatedPieces;
            if (!best || score(candidate) > score(best)) best = candidate;
        }
        return { ...best, seed: seed >>> 0 };
    }
    async function generateOne(size, difficulty, seed, onProgress) {
        if (!SHARE_SIZES.includes(size) || !LEGACY_SETTINGS[difficulty]) throw new Error('Invalid continuous settings');
        if (size > 8) return grow(size, difficulty, seed, onProgress);
        let value = (seed ^ 0x3b12af47) >>> 0;
        const rng = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
        const geometryBudget = size === 8 ? 384 : 256, scrambleBudget = 144;
        let lastReport = 0;
        async function report(fraction, force = false) {
            if (!onProgress) return;
            const now = Date.now();
            if (force || now - lastReport >= 35) { lastReport = now; await onProgress(fraction); }
        }
        for (let geometry = 0; geometry < geometryBudget; geometry++) {
            const geometrySeed = (seed + Math.imul(geometry, 0x9e3779b9)) >>> 0;
            let base;
            try {
                const profile = { rootLength: [4, 4.8], pieceLength: [3.2, 4.5], maxRadius: 5.2, candidatePool: 1, assemblyBudget: 16,
                    makePiece: (id, color, center, u, v, length, sign, template) => withShoulder(
                        E.piece(id, color, center, u, v, length, sign, { width: 1.25 }), 0.64,
                        template?.shoulderAxis || ((id + geometry) % 2 ? 'v' : 'normal')) };
                base = await global.PuzzleGenerators.unshackle(size, 'medium', geometrySeed, onProgress ? () => report(geometry / geometryBudget) : undefined, profile);
            } catch (_) { continue; }
            const palette = global.PuzzleGenerators.unshackleMatch.PALETTE;
            const pieces = base.pieces.map((p, i) => ({ ...p, color: palette[i] }));
            const model = compile(pieces), initial = pieces.map(() => 0), scramble = [];
            let bestCore = 0, bestPositions = initial.slice(), bestScramble = [];
            for (let step = 0; step < scrambleBudget; step++) {
                if (step % 12 === 0) await report((geometry + step / scrambleBudget) / geometryBudget);
                if (step % 24 === 0 && bestCore >= 2) {
                    initial.splice(0, size, ...bestPositions); scramble.splice(0, scramble.length, ...bestScramble);
                }
                const i = Math.floor(rng() * size);
                let travel = (rng() * 2 - 1) * 1.3;
                // Scramble near the assembly so the board stays compact. These
                // generation bounds never limit player movement.
                travel = Math.max(-1.6 - initial[i], Math.min(1.6 - initial[i], travel));
                if (!model.canTravel(initial, i, travel)) {
                    const range = model.limits(initial, i);
                    travel = Math.max(range.min, Math.min(range.max, travel));
                }
                if (Math.abs(travel) < 0.04) continue;
                scramble.push({ id: i + 1, offset: initial[i] }); initial[i] += travel;
                if (step < 12 || step % 6) continue;
                const coreSize = extractionCore({ model }, initial);
                if (coreSize > bestCore) { bestCore = coreSize; bestPositions = initial.slice(); bestScramble = scramble.slice(); }
                if (coreSize < 3) continue;
                const graph = E.blockingGraph(model.poses(initial));
                const puzzle = { mode: 'free', version: 4, size, difficulty, seed: seed >>> 0, pieces,
                    initial: initial.slice(), model, graph, id: `unshackle-free-v4-${size}-${(seed >>> 0).toString(36)}` };
                // Reversing the legal scramble and then extracting the original
                // assembly is a constructive witness, independently replayed.
                const witness = [...scramble].reverse().map(m => ({ ...m }));
                witness.push(...base.solution.map(id => ({ id, extract: true, sign: 1 })));
                if (!verify(puzzle, witness)) throw new Error('Continuous scramble witness failed');
                // Visible structural shoulders replace tiny end-cap catches.
                // Their exact geometry is used by rendering and all move checks.
                const candidate = supportedAssembly(puzzle);
                if (!candidate) continue;
                const solved = solve(candidate, candidate.initial, size === 8 ? 100 : 60);
                if (solved.status !== 'solved') continue;
                const measured = planning(candidate, solved.solution), shifts = measured.shifts;
                if (measured.coreSize < Math.max(size === 8 ? 4 : 3, LEGACY_SETTINGS[difficulty].minCore) || shifts < LEGACY_SETTINGS[difficulty].minShifts || shifts > LEGACY_SETTINGS[difficulty].maxShifts || !comfortable(candidate, solved.solution)) continue;
                const layout = candidate.layout;
                if (!layout.accepted) continue;
                const fingerprint = geometryKey(candidate);
                const finalGraph = E.blockingGraph(candidate.model.poses(candidate.initial));
                const structure = `free:${size}:${finalGraph.map(bs => bs.length).sort().join(',')}:${shifts}`;
                await report(1, true);
                const { layout: _layout, ...state } = candidate;
                return { ...state, graph: finalGraph, fingerprint, structure, solution: solved.solution,
                    stats: { geometryAttempts: geometry + 1, scrambleMoves: scramble.length, verifiedShifts: shifts, openingTolerance: 0.18, ...measured, ...layout } };
            }
        }
        throw new Error('No verified continuous puzzle within generation budget');
    }
    function solveRelays(puzzle, initial) {
        const model = puzzle.model || compile(puzzle.pieces), ps = initial.slice(), route = [];
        for (let turn = 0; turn <= puzzle.size + puzzle.relays.length; turn++) {
            let changed = false;
            for (let i = 0; i < ps.length; i++) if (ps[i] !== REMOVED && !model.blockers(ps, i).length) {
                ps[i] = REMOVED; route.push({ id: i + 1, extract: true, sign: 1 }); changed = true;
            }
            if (ps.every(p => p === REMOVED)) return verify(puzzle, route, initial) ? route : null;
            if (changed) continue;
            for (const relay of puzzle.relays) {
                const i = relay.a - 1;
                if (ps[i] === REMOVED || ps[relay.b - 1] === REMOVED || Math.abs(relay.offset - ps[i]) < 0.005) continue;
                if (!model.canTravel(ps, i, relay.offset - ps[i])) continue;
                const next = ps.slice(); next[i] = relay.offset;
                if (model.blockers(next, relay.b - 1).length) continue;
                ps[i] = relay.offset; route.push({ id: relay.a, offset: relay.offset }); changed = true; break;
            }
            if (!changed) return null;
        }
        return null;
    }
    // A relay is a physical three-part interlock, with a usable forward window:
    // partly pull A -> remove B -> remove C -> finish A. All three start blocked.
    // These are construction coordinates, not stored levels or logical locks;
    // dimensions, placement and orientation vary and every motion is rechecked.
    const RELAY_PARTS = [
        { center: [0, 0, 0], u: [0, 0, -1], v: [0, 1, 0], length: 3.68, width: 1.25, shoulder: 0.64, axis: 'v', sign: 1 },
        { center: [1.815, 0.16, -1.28], u: [-1, 0, 0], v: [0, 0, 1], length: 3.36, width: 1.25, shoulder: 0.64, axis: 'normal', sign: 1 },
        { center: [0.635, -0.156, -1.38], u: [0, 0, 1], v: [0, 1, 0], length: 4.4, width: 2.24, shoulder: 0.67, axis: 'normal', sign: -1 }
    ];
    const PERMUTATIONS = [[0,1,2], [0,2,1], [1,0,2], [1,2,0], [2,0,1], [2,1,0]];
    const body = p => ({ ...p, segments: p.bodySegments || p.segments.slice(0, p.path.length) });

    function relayRoute(relay) {
        return [{ id: relay.a, offset: relay.offset }, ...[relay.b, relay.c, relay.a].map(id => ({ id, extract: true, sign: 1 }))];
    }
    function relayAudit(puzzle, solution) {
        const model = puzzle.model || compile(puzzle.pieces), ps = puzzle.initial.slice(), records = [];
        for (let step = 0; step < solution.length; step++) {
            const move = solution[step], i = move.id - 1;
            if (move.extract) { ps[i] = REMOVED; continue; }
            const [b, c, a] = solution.slice(step + 1, step + 4);
            if (b?.extract && c?.extract && a?.extract && a.id === move.id) {
                const before = ps.slice(), delta = move.offset - ps[i], after = ps.slice(); after[i] = move.offset;
                const withoutB = after.slice(); withoutB[b.id - 1] = REMOVED;
                const withoutC = withoutB.slice(); withoutC[c.id - 1] = REMOVED;
                if (delta >= 0.38 && delta < puzzle.pieces[i].length * 0.6 &&
                    model.blockers(before, b.id - 1).includes(move.id) &&
                    model.blockers(before, c.id - 1).includes(b.id) &&
                    model.canTravel(before, i, delta) &&
                    model.blockers(after, i).includes(c.id) && !model.blockers(after, b.id - 1).length &&
                    model.blockers(after, c.id - 1).includes(b.id) &&
                    !model.blockers(withoutB, c.id - 1).length && model.blockers(withoutB, i).includes(c.id) &&
                    !model.blockers(withoutC, i).length) {
                    records.push({ step, a: move.id, b: b.id, c: c.id, offset: move.offset, delta });
                }
            }
            ps[i] = move.offset;
        }
        return records;
    }
    // Validate just the new relay against the existing assembly. Its removal
    // leaves every old pose unchanged, so the previous witness remains valid.
    function relayClear(puzzle, relay, variation = 0) {
        const ps = puzzle.initial.slice(), model = puzzle.model;
        let offset = relay.offset + variation;
        if (variation > 0) offset = Math.min(offset, model.limits(ps, relay.a - 1).max);
        if (!model.canTravel(ps, relay.a - 1, offset - ps[relay.a - 1])) return false;
        ps[relay.a - 1] = offset;
        for (const id of [relay.b, relay.c, relay.a]) {
            if (model.blockers(ps, id - 1).length) return false;
            ps[id - 1] = REMOVED;
        }
        return true;
    }
    function bodyRelations(pieces, fresh) {
        const old = pieces.slice(0, -fresh.length), bodies = new Map(pieces.map(p => [p, body(p)]));
        let crossEdges = 0;
        for (const p of pieces) for (const q of pieces) {
            if (p === q || (!fresh.includes(p) && !fresh.includes(q))) continue;
            if (!E.sweptCollision(p, q)) continue;
            const moving = bodies.get(p), fixed = bodies.get(q);
            if (!E.sweptCollision(moving, fixed)) return -1;
            for (const axis of [p.v, M.cross(p.u, p.v)]) for (const sign of [-1, 1]) {
                const offset = M.mul(axis, sign * LAYOUT.stableOffset);
                const shifted = { ...moving, segments: moving.segments.map(s => ({ ...s, a: M.add(s.a, offset), b: M.add(s.b, offset) })) };
                if (!E.sweptCollision(shifted, fixed)) return -1;
            }
            if (old.includes(p) && fresh.includes(q)) crossEdges++;
        }
        return crossEdges;
    }
    function relayCore(vary) {
        for (let attempt = 0; attempt < 2048; attempt++) {
            const scale = vary(1, 0.08), offset = 1.28 * scale;
            const pieces = RELAY_PARTS.map((part, j) => withShoulder(E.piece(j + 1, '#888888',
                part.center.map(x => vary(x, 0.045) * scale), part.u, part.v,
                vary(part.length, 0.1) * scale, part.sign, { width: vary(part.width, 0.06) * scale }),
                vary(part.shoulder, 0.03) * scale, part.axis));
            if (pieces.some((p, i) => pieces.slice(i + 1).some(q => E.overlaps(p, q, 0.02)))) continue;
            const local = { pieces, initial: [0, 0, 0], model: compile(pieces) }, relay = { a: 1, b: 2, c: 3, offset };
            if (!relayClear(local, relay) || !relayClear(local, relay, -0.18) || !relayClear(local, relay, 0.18)) continue;
            if (relayAudit(local, relayRoute(relay)).length !== 1 || !layoutQuality(local).accepted) continue;
            return { pieces, offset };
        }
        throw new Error('Continuous relay core budget exhausted');
    }
    async function generate(size, difficulty, seed, onProgress) {
        if (!SHARE_SIZES.includes(size) || !SETTINGS[difficulty]) throw new Error('Invalid continuous settings');
        if (size <= 8) return generateLegacy(size, difficulty, seed, onProgress);
        if (!SETTINGS[difficulty].sizes.includes(size)) throw new Error('Invalid continuous settings');
        let value = (seed ^ 0x682f4a19) >>> 0;
        const rng = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
        const vary = (x, d) => x + (rng() * 2 - 1) * d;
        const groupCount = size / 3, palette = global.PuzzleGenerators.unshackleMatch.PALETTE;
        let pieces = [], relays = [], attempts = 0, backtracks = 0, progress = 0, lastReport = -Infinity;
        const radiusLimit = 4 + Math.sqrt(groupCount) * 2.5, spanLimit = 4.5 * Math.sqrt(groupCount);
        async function report(fraction, force = false) {
            if (!onProgress) return;
            progress = Math.max(progress, fraction);
            if (force || Date.now() - lastReport >= 35) {
                lastReport = Date.now(); await onProgress(progress);
            }
        }
        for (let group = 0; group < groupCount; group++) {
            let accepted = false;
            const core = relayCore(vary);
            for (let attempt = 0; attempt < 1600; attempt++) {
                attempts++;
                if (attempt % 64 === 0) await report(Math.min(0.94, (group + attempt / 1600) / groupCount));
                const perm = PERMUTATIONS[Math.floor(rng() * PERMUTATIONS.length)];
                const signs = Array.from({ length: 3 }, () => rng() < 0.5 ? -1 : 1);
                const transform = p => perm.map((k, i) => p[k] * signs[i]);
                const host = pieces.length ? pieces[Math.floor(rng() * pieces.length)].center : [0, 0, 0];
                const origin = group ? M.add(host, Array.from({ length: 3 }, () => vary(0, 3.8))) : [0, 0, 0];
                const relay = { a: group * 3 + 1, b: group * 3 + 2, c: group * 3 + 3, offset: core.offset };
                const fresh = core.pieces.map((p, j) => withShoulder(E.piece(group * 3 + j + 1, palette[(group * 3 + j) % palette.length],
                    M.add(origin, transform(p.center)), transform(p.u), transform(p.v), p.length,
                    M.dot(p.u, p.dir) > 0 ? 1 : -1, p), p.shoulder, p.shoulderAxis));
                if (fresh.some(p => pieces.some(q => E.overlaps(p, q, 0.02)))) continue;
                const all = [...pieces, ...fresh];
                if (E.bounds(all).radius > radiusLimit || pieces.some(p => fresh.some(q => Math.hypot(...M.sub(p.center, q.center)) > spanLimit))) continue;
                const puzzle = { pieces: all, initial: all.map(() => 0), model: compile(all) };
                if (!relayClear(puzzle, relay) || !relayClear(puzzle, relay, -0.18) || !relayClear(puzzle, relay, 0.18)) continue;
                const mid = puzzle.initial.slice(); mid[relay.a - 1] = relay.offset;
                if (!puzzle.model.blockers(mid, relay.a - 1).includes(relay.c) ||
                    !puzzle.model.blockers(mid, relay.c - 1).includes(relay.b)) continue;
                if (group && !pieces.some(p => fresh.some(q => E.overlaps(body(p), body(q), LAYOUT.neighborGap)))) continue;
                const crossEdges = bodyRelations(all, fresh);
                if (crossEdges < (group ? 1 : 0)) continue;
                pieces = all; relays.unshift({ ...relay, crossEdges }); accepted = true; break;
            }
            if (!accepted) {
                if (!group || backtracks++ >= 64) throw new Error('Continuous relay assembly budget exhausted');
                pieces.splice(-3); relays.shift(); group -= 2;
            }
        }
        // Hide construction order and helper roles in both labels and colours.
        const order = pieces.slice();
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]];
        }
        const ids = new Map(order.map((p, i) => [p.id, i + 1]));
        pieces = order.map((p, i) => ({ ...p, id: i + 1, color: palette[i % palette.length] }));
        relays = relays.map(r => ({ ...r, a: ids.get(r.a), b: ids.get(r.b), c: ids.get(r.c) }));
        const solution = relays.flatMap(relayRoute);
        const puzzle = { mode: 'free', version: 6, size, difficulty, seed: seed >>> 0, pieces, initial: pieces.map(() => 0),
            model: compile(pieces), solution, relays, id: `unshackle-free-v6-${size}-${difficulty}-${(seed >>> 0).toString(36)}` };
        if (!verify(puzzle, solution) || relayAudit(puzzle, solution).length !== groupCount || !comfortable(puzzle, solution))
            throw new Error('Continuous relay witness failed');
        puzzle.graph = E.blockingGraph(pieces);
        puzzle.fingerprint = `${geometryKey(puzzle)}:widths:${pieces.map(p => p.width.toFixed(4)).sort().join(',')}`;
        puzzle.structure = `relay:${size}:${puzzle.graph.map(bs => bs.length).sort().join(',')}`;
        const layout = layoutQuality(puzzle);
        if (!layout.accepted || extractionCore(puzzle) !== size) throw new Error('Continuous relay layout failed quality checks');
        puzzle.stats = { ...layout, ...planning(puzzle, solution), verifiedShifts: groupCount, openingTolerance: 0.18,
            relayCount: groupCount, assemblyAttempts: attempts, backtracks, crossEdges: relays.reduce((n, r) => n + r.crossEdges, 0) };
        await report(1, true);
        return puzzle;
    }
    function generateAsync(size, difficulty, seed, onProgress, version = 6) {
        if (typeof Worker === 'undefined') return (version >= 6 ? generate : generateLegacy)(size, difficulty, seed, onProgress);
        return new Promise((resolve, reject) => {
            const worker = new Worker('../js/games/unshackle/free-worker.js?v=touch-material-11');
            worker.onerror = event => { worker.terminate(); reject(new Error(event.message || 'Continuous worker failed')); };
            worker.onmessage = ({ data }) => {
                if (data.error) { worker.terminate(); reject(new Error(data.error)); }
                else if (data.result) {
                    worker.terminate();
                    resolve({ ...data.result, model: compile(data.result.pieces) });
                } else if (onProgress) onProgress(data.fraction);
            };
            worker.postMessage({ size, difficulty, seed, version });
        });
    }
    global.UnshackleFree = { generateAsync, at, withShoulder, compile, dragPlan, solve, generate, generateLegacy, relayAudit, verify, extractionCore, layoutQuality, geometryKey, planning, REMOVED, SETTINGS, LEGACY_SETTINGS, SIZES, SHARE_SIZES };
})(typeof window === 'undefined' ? globalThis : window);
