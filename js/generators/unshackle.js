/**
 * Unshackle: seeded reverse assembly, exact geometric validation and DAG grading.
 * New pieces must have a clear exit and block at least one older piece. Reversing
 * insertion is therefore a witness solution, independently rechecked before use.
 * Candidate budgets, rather than wall-clock deadlines, preserve seed replay.
 */
(function (global) {
    'use strict';
    const E = global.UnshackleEngine, M = E.math;
    const VERSION = 1;
    const SIZES = [6, 12, 18, 24, 30];
    const SHARE_SIZES = [...SIZES, 8, 10, 16, 20];
    const GENERATION_SIZES = [...SHARE_SIZES, 36, 48];
    const COLORS = ['#43b9de', '#f4a34f', '#d86db1', '#69b77d', '#dbba46', '#a58adb', '#dd7e70', '#619bc4', '#a6ad58', '#b681a3', '#60aaa3', '#cc955c'];
    const LARGE_COLORS = [...COLORS, '#5e85cc', '#cf6991', '#7bac56', '#ba8250', '#55aeba', '#aa75c4', '#dcaa3b', '#cf7659', '#728bc1', '#78a49b', '#bda052', '#b56a83'];
    const EXTENDED_COLORS = [...LARGE_COLORS, '#b35f45', '#4c9f88', '#7d71c5', '#d48c3e', '#bd619a', '#669a47',
        '#4e81aa', '#bd5960', '#9a8c43', '#846aad', '#47a3b1', '#a87955', '#c58e9b', '#65816a', '#a76fca',
        '#d3916d', '#599ecb', '#a4b96b', '#bb7786', '#7998ad', '#c8a667', '#6eac94', '#9679a0', '#a56a5b'];
    const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    function makeRng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ a >>> 15, a | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    const one = (rng, a) => a[Math.floor(rng() * a.length)];
    const grid = (rng, lo, hi) => Math.round((lo + rng() * (hi - lo)) / 0.16) * 0.16;
    function shuffle(a, rng) {
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
    }
    function band(size, difficulty) {
        if (size > 12) {
            const easyMax = Math.max(4, Math.ceil(size / 8));
            const mediumMax = Math.floor(6 + (size - 16) / 4);
            if (difficulty === 'easy') return { min: 2, max: easyMax, minFree: 3, maxFree: size - 2 };
            if (difficulty === 'medium') return { min: easyMax + 1, max: mediumMax, minFree: 1, maxFree: Math.ceil(size * 0.45) };
            return { min: mediumMax + 1, max: size - 1, minFree: 1, maxFree: Math.floor(size * 0.25) };
        }
        const mediumMin = 4, mediumMax = Math.max(mediumMin, Math.floor(size / 2));
        if (difficulty === 'easy') return { min: 2, max: 3, minFree: 2, maxFree: size - 2 };
        if (difficulty === 'medium') return { min: mediumMin, max: mediumMax, minFree: 1, maxFree: Math.ceil(size * 0.45) };
        return { min: Math.min(size - 1, mediumMax + 1), max: size - 1, minFree: 1, maxFree: Math.max(2, Math.floor(size * 0.25)) };
    }
    function qualifies(stats, size, difficulty) {
        const b = band(size, difficulty);
        return stats.solvable && stats.depth >= b.min && stats.depth <= b.max && stats.free >= b.minFree && stats.free <= b.maxFree
            && (difficulty === 'easy' || stats.joins >= 1);
    }

    // Translation-, rotation-, label- and colour-independent geometry identity.
    // Include reflections too, so mirroring an old puzzle does not count as new.
    function fingerprint(pieces) {
        const center = M.mul(pieces.reduce((s, p) => M.add(s, p.center), [0, 0, 0]), 1 / pieces.length);
        const permutations = [[0,1,2], [0,2,1], [1,0,2], [1,2,0], [2,0,1], [2,1,0]];
        const q = n => Math.round(n * 1000);
        let best = null;
        for (const perm of permutations) for (let bits = 0; bits < 8; bits++) {
            const transform = v => perm.map((k, i) => v[k] * (bits & (1 << i) ? -1 : 1));
            const key = pieces.map(p => {
                const normal = transform(M.cross(p.u, p.v)).map(Math.abs);
                return [...transform(M.sub(p.center, center)), ...transform(p.dir), ...normal, p.length].map(q).join(',');
            }).sort().join(';');
            if (best === null || key < best) best = key;
        }
        return best;
    }
    function structureKey(graph) {
        const s = E.analyze(graph), out = graph.map((_, i) => graph.filter(bs => bs.includes(i + 1)).length);
        return graph.map((bs, i) => `${s.depths[i]},${bs.length},${out[i]}`).sort().join(';');
    }

    async function assemble(size, difficulty, rng, yieldWork) {
        const b = band(size, difficulty), target = difficulty === 'easy' ? b.max : b.min;
        const rootCount = Math.min(size, size > 24 ? 24 : 12);
        const rootLength = grid(rng, 3.0 + rootCount * 0.42, 4.6 + rootCount * 0.42);
        const pieces = [E.piece(1, COLORS[0], [0, 0, 0], AXES[0], AXES[2], rootLength, rng() < 0.5 ? -1 : 1)];
        let graph = [[]];
        for (let id = 2; id <= size; id++) {
            let accepted = false;
            const stats = E.analyze(graph), downstreamCache = new Map();
            const downstream = id => {
                if (!downstreamCache.has(id)) downstreamCache.set(id, 1 + Math.max(0,
                    ...pieces.filter((p, i) => graph[i].includes(id)).map(p => downstream(p.id))));
                return downstreamCache.get(id);
            };
            for (let attempt = 0; attempt < 180; attempt++) {
                if ((attempt & 31) === 31) await yieldWork();
                const extend = stats.depth < target || stats.free >= b.maxFree || rng() < 0.3;
                const hosts = pieces.filter((p, i) => extend ? graph[i].length === 0 && downstream(p.id) < b.max : graph[i].length > 0);
                const ranked = hosts.slice().sort((a, b) => stats.depth < target ? downstream(b.id) - downstream(a.id) : downstream(a.id) - downstream(b.id));
                const host = extend && ranked.length && rng() < 0.9 ? ranked[0] : one(rng, hosts.length ? hosts : pieces);
                const u = M.mul(M.cross(host.u, host.v), rng() < 0.5 ? -1 : 1), v = M.mul(host.u, rng() < 0.5 ? -1 : 1);
                const length = grid(rng, 3.2, 5.6);
                const center = M.add(host.center, M.add(M.mul(host.u, grid(rng, -host.length / 2 + 0.8, host.length / 2 - 0.8)),
                    M.add(M.mul(host.v, grid(rng, -0.16, 0.16)), M.mul(u, grid(rng, -length / 2 + 0.8, length / 2 - 0.8)))));
                const p = E.piece(id, COLORS[(id - 1) % COLORS.length], center, u, v, length, rng() < 0.5 ? -1 : 1);
                if (pieces.some(q => E.overlaps(p, q, 0.035))) continue;
                if (pieces.some(q => E.sweptCollision(p, q))) continue;
                const blocked = pieces.map(q => E.sweptCollision(q, p));
                if (!blocked.some(Boolean)) continue;
                const next = graph.map((bs, i) => blocked[i] ? [...bs, id] : bs.slice()); next.push([]);
                const nextStats = E.analyze(next);
                if (nextStats.depth > b.max) continue;
                // Bound the cluster diameter so increasing count does not just
                // produce a very long, sparse chain outside the playable view.
                if (E.bounds([...pieces, p]).radius > 7.5 + Math.max(0, size - 12) * 0.15) continue;
                pieces.push(p); graph = next; accepted = true; break;
            }
            if (!accepted) return null;
            await yieldWork();
        }
        const stats = E.analyze(graph);
        if (!qualifies(stats, size, difficulty)) return null;
        return { pieces, graph, stats };
    }

    async function generate(size, difficulty, seed, onProgress) {
        if (!GENERATION_SIZES.includes(size) || !['easy', 'medium', 'hard'].includes(difficulty)) throw new Error('Invalid Unshackle settings');
        const rng = makeRng(seed), pool = [];
        const poolTarget = difficulty === 'easy' ? 2 : 4, budget = 48;
        let lastYield = Date.now(), attempts = 0;
        const yieldWork = async () => {
            if (onProgress && Date.now() - lastYield > 35) {
                await onProgress(Math.min(0.94, (attempts + 0.5) / budget)); lastYield = Date.now();
            }
        };
        for (; attempts < budget && pool.length < poolTarget; attempts++) {
            const candidate = await assemble(size, difficulty, rng, yieldWork);
            if (candidate) {
                candidate.fingerprint = fingerprint(candidate.pieces);
                candidate.structure = structureKey(candidate.graph);
                pool.push(candidate);
            }
            await yieldWork();
        }
        if (!pool.length) throw new Error('No Unshackle candidate met the requested difficulty');
        pool.sort((a, b) => difficulty === 'easy' ? a.stats.score - b.stats.score : b.stats.score - a.stats.score);
        const chosen = pool[0];
        // IDs and colours are independently shuffled, hiding insertion order.
        // Preserve version-1 outputs for the original sizes and shared seeds.
        const order = shuffle(chosen.pieces.slice(), rng), colors = shuffle((size <= 12 ? COLORS : size <= 24 ? LARGE_COLORS : EXTENDED_COLORS).slice(), rng);
        const pieces = order.map((p, i) => E.piece(i + 1, colors[i], p.center, p.u, p.v, p.length, M.dot(p.u, p.dir) > 0 ? 1 : -1));
        const graph = E.blockingGraph(pieces), stats = E.analyze(graph);
        if (!qualifies(stats, size, difficulty)) throw new Error('Unshackle final verification failed');
        // A successful constructive witness must agree with the independent
        // final graph after relabelling; no inserted piece may block a newer one.
        const witness = chosen.pieces.slice().reverse().map(p => order.indexOf(p) + 1), removed = new Set();
        for (const id of witness) {
            if (!graph[id - 1].every(b => removed.has(b))) throw new Error('Unshackle witness failed');
            removed.add(id);
        }
        if (onProgress) await onProgress(1);
        return { id: `unshackle-v${VERSION}-${size}-${difficulty}-${(seed >>> 0).toString(36)}`,
            game: 'unshackle', version: VERSION, seed: seed >>> 0, size, difficulty, pieces, graph, solution: stats.order,
            fingerprint: chosen.fingerprint, structure: structureKey(graph), stats: { ...stats, attempts, poolSize: pool.length } };
    }
    global.PuzzleGenerators = global.PuzzleGenerators || {};
    global.PuzzleGenerators.unshackle = generate;
    global.PuzzleGenerators.unshackleInternals = { band, qualifies, fingerprint, structureKey, SIZES, SHARE_SIZES, VERSION };
})(typeof window === 'undefined' ? globalThis : window);

/** Optional match-three mode, using the same physical geometry as Classic. */
(function (global) {
    'use strict';
    const SIZES = [12, 24, 36, 48], CAPACITY = 5;
    const GROUPS = [
        // Keep the first six entries stable for legacy shared puzzles.
        { color: '#dd7e70', symbol: '●' }, { color: '#619bc4', symbol: '▲' },
        { color: '#dbba46', symbol: '■' }, { color: '#69b77d', symbol: '◆' },
        { color: '#a58adb', symbol: '✚' }, { color: '#f4a34f', symbol: '✦' },
        { color: '#cf6d9e', symbol: '★' }, { color: '#4a9e9b', symbol: '⬟' },
    ];
    // Append-only group IDs preserve both legacy replay and solver count indices.
    const PALETTE = ['#d64235', '#2468cf', '#e8bc20', '#328443', '#8346bb', '#ef8422',
        '#d94a91', '#49342b', '#8ca82d', '#25344d', '#a8cce8', '#858585'];
    while (GROUPS.length < PALETTE.length) GROUPS.push({ color: PALETTE[GROUPS.length], symbol: ['○', '△', '□', '◇'][GROUPS.length - 8] });
    const SETTINGS = {
        easy: { sizes: [12, 24], slots: 3, greedyMin: 3, greedyMax: 4, tripleFraction: 1 },
        medium: { sizes: [24, 36], slots: 4, greedyMin: 0, greedyMax: 1, tripleFraction: 0.5 },
        hard: { sizes: [36, 48], slots: 5, greedyMin: 0, greedyMax: 0, tripleFraction: 0.25 },
    };
    function rngFor(seed) {
        let a = (seed ^ 0x47ad31b9) >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ a >>> 15, a | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    function shuffle(a, rng) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
    // Preserve arrival order for display; a completed triple leaves immediately.
    function trayAfter(puzzle, removed) {
        let tray = [];
        for (const id of removed) {
            const group = puzzle.pieces[id - 1].group;
            tray.push(id);
            if (tray.filter(n => puzzle.pieces[n - 1].group === group).length === 3)
                tray = tray.filter(n => puzzle.pieces[n - 1].group !== group);
        }
        return tray;
    }
    function pullPlan(puzzle, removed, id) {
        const tray = trayAfter(puzzle, removed), piece = puzzle.pieces[id - 1];
        if (!piece || [...removed].includes(id)) return { allowed: false, matching: false, consumed: [], tray };
        const same = tray.filter(n => puzzle.pieces[n - 1].group === piece.group);
        const matching = same.length === 2;
        const allowed = matching || tray.length < CAPACITY;
        return { allowed, matching,
            consumed: matching ? [...same, id] : [],
            tray: !allowed ? tray : matching ? tray.filter(n => !same.includes(n)) : [...tray, id] };
    }
    // With immediate triples, residual colour counts depend only on the removed
    // subset. A memoized subset search is exact; exhausting its budget is unknown,
    // never evidence that a position is unsolvable.
    function solve(puzzle, removed = [], capacity = CAPACITY, budget = 60000) {
        const n = puzzle.pieces.length, bits = Array.from({ length: n }, (_, i) => 1n << BigInt(i));
        const full = (1n << BigInt(n)) - 1n;
        const needs = puzzle.graph.map(bs => bs.reduce((m, id) => m | bits[id - 1], 0n));
        const dependents = n > 24 ? bits.map(bit => needs.reduce((m, blockers, i) => blockers & bit ? m | bits[i] : m, 0n)) : null;
        const groups = puzzle.pieces.map(p => p.group), counts = GROUPS.map(() => 0);
        let initial = 0n;
        for (const id of removed) initial |= bits[id - 1];
        for (let i = 0; i < n; i++) if (initial & bits[i]) counts[groups[i]]++;
        for (let i = 0; i < counts.length; i++) counts[i] %= 3;
        const occupied = counts.reduce((a, b) => a + b, 0), dead = new Set(), path = [];
        let visited = 0, exhausted = false;
        function visit(mask, used) {
            if (used > capacity) return false;
            if (mask === full) return used === 0;
            if (dead.has(mask)) return false;
            if (++visited > budget) { exhausted = true; return false; }
            const legal = [];
            for (let i = 0; i < n; i++) {
                if ((mask & bits[i]) || (mask & needs[i]) !== needs[i]) continue;
                const next = used + (counts[groups[i]] === 2 ? -2 : 1);
                if (next <= capacity) legal.push({ i, next });
            }
            legal.sort((a, b) => a.next - b.next || a.i - b.i);
            for (const { i, next } of legal) {
                // Available pieces of one colour are interchangeable when one
                // blocks every remaining dependent of the other (and more).
                // Prefer that piece; break exact ties by ID. This is an exact
                // dominance reduction, not a heuristic claim of unsolvability.
                if (dependents) {
                    const blocked = dependents[i] & (full ^ mask);
                    if (legal.some(({ i: j }) => j !== i && groups[j] === groups[i]
                        && (blocked & dependents[j]) === blocked
                        && ((dependents[j] & (full ^ mask)) !== blocked || j < i))) continue;
                }
                const g = groups[i], before = counts[g];
                counts[g] = (before + 1) % 3; path.push(i + 1);
                if (visit(mask | bits[i], next)) return true;
                path.pop(); counts[g] = before;
                if (exhausted) return false;
            }
            dead.add(mask); return false;
        }
        const solved = visit(initial, occupied);
        return { status: solved ? 'solved' : exhausted ? 'budget' : 'unsolvable',
            solution: solved ? path.slice() : [], visited };
    }
    function findTrap(puzzle, rng) {
        for (let trial = 0; trial < 24; trial++) {
            const removed = new Set(), path = [];
            while (removed.size < puzzle.size) {
                const legal = puzzle.pieces.filter(p => !removed.has(p.id) && puzzle.graph[p.id - 1].every(id => removed.has(id)));
                const p = legal[Math.floor(rng() * legal.length)];
                removed.add(p.id); path.push(p.id);
                if (trayAfter(puzzle, removed).length > CAPACITY) return path;
            }
        }
        return null;
    }
    async function generateLegacy(size, difficulty, seed, onProgress) {
        if (!SIZES.includes(size) || !['easy', 'medium', 'hard'].includes(difficulty)) throw new Error('Invalid match settings');
        // Larger colour pools need deeper blockers to retain capacity pressure.
        // Keep the original 12/24-piece geometry and seed replay unchanged.
        const geometryDifficulty = size > 24 ? difficulty : difficulty === 'hard' ? 'medium' : 'easy';
        const geometryBudget = size > 24 ? 4 : 1, assignmentBudget = size > 24 ? 32 : 128;
        const target = { easy: 3, medium: 4, hard: 5 }[difficulty];
        for (let geometry = 0; geometry < geometryBudget; geometry++) {
            const geometrySeed = (seed + Math.imul(geometry, 0x9e3779b9)) >>> 0;
            const report = onProgress ? fraction => onProgress((geometry + fraction) / geometryBudget) : undefined;
            const tier = size > 24 && difficulty === 'medium' && geometry % 2 ? 'hard' : geometryDifficulty;
            let base;
            try {
                base = await global.PuzzleGenerators.unshackle(size, tier, geometrySeed,
                    report ? fraction => report(fraction * 0.55) : undefined);
            } catch (error) {
                if (geometryBudget === 1) throw error;
                continue;
            }
            const rng = rngFor(geometrySeed);
            let proofVisits = 0;
            for (let attempt = 0; attempt < assignmentBudget; attempt++) {
                const palette = shuffle(GROUPS.slice(0, 6).map((_, i) => i), rng).slice(0, Math.min(size / 3, 6));
                const labels = shuffle(Array.from({ length: size / 3 }, (_, i) => Array(3).fill(palette[i % palette.length])).flat(), rng);
                const pieces = base.pieces.map((p, i) => ({ ...p, group: labels[i], ...GROUPS[labels[i]] }));
                const puzzle = { ...base, id: `unshackle-match-v1-${size}-${difficulty}-${(seed >>> 0).toString(36)}`,
                    mode: 'match', seed: seed >>> 0, difficulty, pieces, capacity: CAPACITY };
                const upper = solve(puzzle, [], target);
                if (upper.status === 'solved') {
                    // Proving that a large board needs the extra place can visit
                    // far more states than finding one valid route. Hint searches
                    // keep their smaller default budget; exhausted proofs reject.
                    const lower = solve(puzzle, [], target - 1, size > 24 ? 1000000 : 60000);
                    proofVisits += lower.visited;
                    if (lower.status === 'unsolvable' || (difficulty === 'easy' && lower.status === 'solved')) {
                        const trap = findTrap(puzzle, rng);
                        if (trap) return { ...puzzle, solution: upper.solution, trap,
                            matchStats: { requiredSlots: lower.status === 'solved' ? 2 : target, assignments: attempt + 1,
                                ...(size > 24 ? { geometryAttempts: geometry + 1 } : {}) } };
                    }
                }
                if (report) await report(0.55 + 0.44 * (attempt + 1) / assignmentBudget);
                // A broad graph can make an exact lower-bound proof too expensive.
                // Try another seeded geometry instead of exhausting colour variants.
                if (size > 24 && proofVisits >= 3000000) break;
            }
        }
        throw new Error('No verified match puzzle met the requested difficulty');
    }
    function available(puzzle, removed) {
        return puzzle.pieces.filter(p => !removed.has(p.id) && puzzle.graph[p.id - 1].every(id => removed.has(id)));
    }
    function strategy(puzzle) {
        const removed = new Set();
        let openingTriples = 0;
        while (removed.size < puzzle.size) {
            const free = available(puzzle, removed);
            const triple = GROUPS.map((_, g) => free.filter(p => p.group === g)).find(ps => ps.length >= 3);
            if (!triple) break;
            if (!removed.size) openingTriples = GROUPS.reduce((n, _, g) => n + Math.floor(free.filter(p => p.group === g).length / 3), 0);
            triple.slice(0, 3).forEach(p => removed.add(p.id));
        }
        const tripleOnlyRemoved = removed.size, greedyCleared = [];
        for (let trial = 0; trial < 4; trial++) {
            const taken = new Set();
            while (taken.size < puzzle.size) {
                const tray = trayAfter(puzzle, taken), free = available(puzzle, taken);
                const counts = GROUPS.map((_, g) => tray.filter(id => puzzle.pieces[id - 1].group === g).length);
                const score = p => (counts[p.group] === 2 ? 1000 : counts[p.group] * 100)
                    + free.filter(q => q.group === p.group).length * 10
                    + (trial < 2 ? 0 : puzzle.graph.filter(bs => bs.includes(p.id)).length);
                const legal = free.filter(p => counts[p.group] === 2 || tray.length < CAPACITY);
                legal.sort((a, b) => score(b) - score(a) || (trial % 2 ? b.id - a.id : a.id - b.id));
                if (!legal.length) break;
                taken.add(legal[0].id);
            }
            greedyCleared.push(taken.size);
        }
        return { openingTriples, tripleOnlyRemoved, greedyWins: greedyCleared.filter(n => n === puzzle.size).length,
            greedyTrials: greedyCleared.length, greedyCleared };
    }
    function auditDecisions(puzzle, solution, wanted, capacity = CAPACITY) {
        const removed = new Set(), decisions = [];
        for (let step = 0; step < solution.length - 3 && decisions.length < wanted; step++) {
            if (step % 3 === 0) {
                for (const p of available(puzzle, removed)) {
                    if (p.id === solution[step] || decisions.some(d => d.bad === p.id)) continue;
                    const plan = pullPlan(puzzle, removed, p.id);
                    if (!plan.allowed || plan.tray.length > capacity) continue;
                    const result = solve(puzzle, [...removed, p.id], capacity, 10000);
                    if (result.status === 'unsolvable') {
                        decisions.push({ removed: [...removed], good: solution[step], bad: p.id, capacity });
                        break;
                    }
                }
            }
            removed.add(solution[step]);
        }
        return decisions;
    }
    // Check every empty-plate state reachable by clearing accessible triples.
    // Unique triples in Easy make each state a subset of colours, at most 256.
    function safeTripleClears(puzzle) {
        const seen = new Set();
        function visit(removed) {
            const key = [...removed].sort((a, b) => a - b).join(',');
            if (seen.has(key)) return true;
            seen.add(key);
            if (solve(puzzle, removed).status !== 'solved') return false;
            const free = available(puzzle, removed);
            for (let g = 0; g < GROUPS.length; g++) {
                const triple = free.filter(p => p.group === g);
                if (triple.length === 3 && !visit(new Set([...removed, ...triple.map(p => p.id)]))) return false;
            }
            return true;
        }
        return visit(new Set());
    }
    async function generateStrategic(size, difficulty, seed, onProgress, version) {
        if (!(version === 3 ? SETTINGS[difficulty]?.sizes.includes(size) : SIZES.includes(size) && SETTINGS[difficulty])) throw new Error('Invalid match settings');
        const target = SETTINGS[difficulty].slots;
        const geometryBudget = 6, assignmentBudget = 64;
        const wantedDecisions = difficulty === 'hard' ? (size === 12 ? 1 : 2) : difficulty === 'medium' ? 1 : 0;
        for (let geometry = 0; geometry < geometryBudget; geometry++) {
            const geometrySeed = (seed + Math.imul(geometry, 0x9e3779b9)) >>> 0;
            const report = onProgress ? fraction => onProgress((geometry + fraction) / geometryBudget) : undefined;
            const tier = difficulty === 'easy' ? 'easy' : 'medium';
            let base;
            try {
                base = await global.PuzzleGenerators.unshackle(size, tier, geometrySeed,
                    report ? fraction => report(fraction * 0.5) : undefined);
            } catch (_) { continue; }
            const rng = rngFor(geometrySeed ^ 0x8243a719);
            for (let attempt = 0; attempt < assignmentBudget; attempt++) {
                if (report) await report(0.5 + 0.49 * attempt / assignmentBudget);
                const colourCount = version === 2 ? Math.min(size / 3, 8) : difficulty === 'hard' ? 8 : size / 3;
                const palette = shuffle(GROUPS.slice(0, version === 2 ? 8 : colourCount).map((_, i) => i), rng).slice(0, colourCount);
                const labels = shuffle(Array.from({ length: size / 3 }, (_, i) => Array(3).fill(palette[i % palette.length])).flat(), rng);
                const pieces = base.pieces.map((p, i) => ({ ...p, group: labels[i], ...GROUPS[labels[i]], color: version === 3 ? PALETTE[labels[i]] : GROUPS[labels[i]].color }));
                const puzzle = { ...base, id: `unshackle-match-v${version}-${size}-${difficulty}-${(seed >>> 0).toString(36)}`,
                    mode: 'match', matchVersion: version, seed: seed >>> 0, difficulty, pieces, capacity: CAPACITY };
                const measured = strategy(puzzle);
                const allowedGreedyWins = version === 3 ? SETTINGS[difficulty].greedyMax : difficulty === 'hard' ? 0 : 4;
                const allowedTriples = SETTINGS[difficulty].tripleFraction;
                if (measured.greedyWins > allowedGreedyWins || measured.tripleOnlyRemoved > size * allowedTriples) continue;
                if (measured.greedyWins < (version === 3 ? SETTINGS[difficulty].greedyMin : difficulty === 'easy' ? 2 : 0)) continue;
                if (difficulty === 'hard' && measured.openingTriples > 1) continue;
                const upper = solve(puzzle, [], target);
                if (upper.status === 'solved') {
                    const lower = solve(puzzle, [], target - 1, 250000);
                    if (lower.status === 'unsolvable' || (difficulty === 'easy' && lower.status === 'solved')) {
                        const decisions = auditDecisions(puzzle, upper.solution, wantedDecisions, target);
                        if (decisions.length >= wantedDecisions && (version === 2 || difficulty !== 'easy' || safeTripleClears(puzzle))) {
                            const trap = findTrap(puzzle, rng);
                            if (trap) return { ...puzzle, solution: lower.status === 'solved' ? lower.solution : upper.solution, trap,
                                matchStats: { requiredSlots: lower.status === 'solved' ? 2 : target, assignments: attempt + 1,
                                    geometryAttempts: geometry + 1, colours: palette.length, ...measured, decisions } };
                        }
                    }
                }
            }
        }
        throw new Error('No verified strategic match puzzle met the requested difficulty');
    }
    function generate(size, difficulty, seed, onProgress) {
        return generateStrategic(size, difficulty, seed, onProgress, 3);
    }
    function generateV2(size, difficulty, seed, onProgress) {
        return generateStrategic(size, difficulty, seed, onProgress, 2);
    }
    global.PuzzleGenerators.unshackleMatch = { generate, generateV2, generateLegacy, SETTINGS, PALETTE, safeTripleClears, solve, trayAfter, pullPlan, strategy, auditDecisions, SIZES, CAPACITY, GROUPS };
})(typeof window === 'undefined' ? globalThis : window);
