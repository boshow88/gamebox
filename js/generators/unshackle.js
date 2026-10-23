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
    const SIZES = [6, 8, 10, 12];
    const COLORS = ['#43b9de', '#f4a34f', '#d86db1', '#69b77d', '#dbba46', '#a58adb', '#dd7e70', '#619bc4', '#a6ad58', '#b681a3', '#60aaa3', '#cc955c'];
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
        const rootLength = grid(rng, 3.0 + size * 0.42, 4.6 + size * 0.42);
        const pieces = [E.piece(1, COLORS[0], [0, 0, 0], AXES[0], AXES[2], rootLength, rng() < 0.5 ? -1 : 1)];
        let graph = [[]];
        for (let id = 2; id <= size; id++) {
            let accepted = false;
            for (let attempt = 0; attempt < 180; attempt++) {
                if ((attempt & 31) === 31) await yieldWork();
                const stats = E.analyze(graph);
                const downstream = id => 1 + Math.max(0, ...pieces.filter((p, i) => graph[i].includes(id)).map(p => downstream(p.id)));
                const extend = stats.depth < target || stats.free >= b.maxFree || rng() < 0.3;
                const hosts = pieces.filter((p, i) => extend ? graph[i].length === 0 && downstream(p.id) < b.max : graph[i].length > 0);
                const ranked = hosts.slice().sort((a, b) => stats.depth < target ? downstream(b.id) - downstream(a.id) : downstream(a.id) - downstream(b.id));
                const host = extend && ranked.length && rng() < 0.9 ? ranked[0] : one(rng, hosts.length ? hosts : pieces);
                const u = M.mul(M.cross(host.u, host.v), rng() < 0.5 ? -1 : 1), v = M.mul(host.u, rng() < 0.5 ? -1 : 1);
                const length = grid(rng, 3.2, 5.6);
                const center = M.add(host.center, M.add(M.mul(host.u, grid(rng, -host.length / 2 + 0.8, host.length / 2 - 0.8)),
                    M.add(M.mul(host.v, grid(rng, -0.16, 0.16)), M.mul(u, grid(rng, -length / 2 + 0.8, length / 2 - 0.8)))));
                const p = E.piece(id, COLORS[id - 1], center, u, v, length, rng() < 0.5 ? -1 : 1);
                if (pieces.some(q => E.overlaps(p, q, 0.035))) continue;
                if (pieces.some(q => E.sweptCollision(p, q))) continue;
                const blocked = pieces.map(q => E.sweptCollision(q, p));
                if (!blocked.some(Boolean)) continue;
                const next = graph.map((bs, i) => blocked[i] ? [...bs, id] : bs.slice()); next.push([]);
                const nextStats = E.analyze(next);
                if (nextStats.depth > b.max) continue;
                // Bound the cluster diameter so increasing count does not just
                // produce a very long, sparse chain outside the playable view.
                if (E.bounds([...pieces, p]).radius > 7.5) continue;
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
        if (!SIZES.includes(size) || !['easy', 'medium', 'hard'].includes(difficulty)) throw new Error('Invalid Unshackle settings');
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
        const order = shuffle(chosen.pieces.slice(), rng), colors = shuffle(COLORS.slice(), rng);
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
    global.PuzzleGenerators.unshackleInternals = { band, qualifies, fingerprint, structureKey, SIZES, VERSION };
})(typeof window === 'undefined' ? globalThis : window);
