/**
 * Fuse — puzzle generator.
 *
 * 1. Reverse construction: start from one tile holding the target total and repeatedly undo
 *    a forward merge (REVERSE_OPS) until every cell is filled. Each step is checked to be the
 *    exact inverse of a legal forward merge, so the construction is a known solution.
 * 2. Exact verification with the shared solver.
 * 3. Human-solver metrics (FuseReasoning.evaluate) decide the difficulty tier (DIFFICULTY).
 * Attempts are counted, never timed, so (size, difficulty, seed) always yields the same
 * puzzle. When no attempt fits the tier, a verified curated puzzle is returned instead.
 * Evaluating a 4×4 board takes too long to search for one on demand, so 4×4 puzzles come
 * from a bank built offline by the same pipeline (tools/fuse/bank.js), shown in one of the
 * eight rotations / reflections of the square, which keep every metric.
 *
 * Exposed:
 *   window.PuzzleGenerators.fuse(size, difficulty, seed, onProgress) → Promise<puzzle>
 *   window.PuzzleGenerators.fuseInternals — generate (sync), classify, DIFFICULTY, CURATED, …
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('../games/fuse/rules.js'), require('../games/fuse/solver.js'), require('../games/fuse/reasoning.js'));
    } else {
        const api = factory(root.FuseRules, root.FuseSolver, root.FuseReasoning);
        root.PuzzleGenerators = root.PuzzleGenerators || {};
        root.PuzzleGenerators.fuse = api.generatePuzzle;
        root.PuzzleGenerators.fuseInternals = api;
    }
})(typeof window === 'object' ? window : globalThis, function (Rules, Solver, Reasoning) {
    'use strict';

    const R = Rules.DEFAULT;
    const SIZES = [3, 4];

    // mulberry32. The generator owns its PRNG so seeds reproduce identically in the browser
    // and in Node checks (PuzzleCommon needs a DOM).
    function makeRng(seed) {
        let a = (seed >>> 0) || 1;
        return function () {
            a |= 0; a = (a + 0x6d2b79f5) | 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function pickWeighted(rng, items, weight) {
        let total = 0;
        const ws = items.map((x) => { const w = Math.max(0, weight(x)); total += w; return w; });
        let r = rng() * total;
        for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r < 0) return items[i]; }
        return items[items.length - 1];
    }

    // Reverse operations. Each lists { prior, move } where applying the forward `move` to
    // `prior` yields `board`. New tile types extend generation by adding entries here.
    const REVERSE_OPS = [
        {
            // Undo number + number: a tile 2v at d came from v at d and v at an empty neighbour s.
            id: 'split-number',
            options(board) {
                const out = [];
                for (const d of R.tiles(board)) {
                    const t = board.cells[d];
                    if (t.type !== 'num' || t.value < 2) continue;
                    for (const s of R.neighbors(board, d)) {
                        if (board.cells[s] !== R.EMPTY) continue;
                        const cells = board.cells.slice();
                        cells[d] = R.num(t.value / 2);
                        cells[s] = R.num(t.value / 2);
                        out.push({ prior: { rows: board.rows, cols: board.cols, cells }, move: { from: s, to: d }, value: t.value });
                    }
                }
                return out;
            },
        },
    ];

    // Construction styles vary which tile is split next, giving different value profiles.
    const STYLES = {
        even: (o) => o.value,                 // split large tiles: many similar values
        mixed: () => 1,                       // uniform
        deep: (o) => 1 / Math.sqrt(o.value),  // split small tiles: long doubling chains
    };

    function reverseBuild(rng, rows, cols, exponent, style) {
        let board = { rows, cols, cells: new Array(rows * cols).fill(R.EMPTY) };
        board.cells[Math.floor(rng() * board.cells.length)] = R.num(Math.pow(2, exponent));
        const solution = [];
        while (board.cells.includes(R.EMPTY)) {
            const options = [].concat(...REVERSE_OPS.map((op) => op.options(board)));
            if (!options.length) return null;
            const pick = pickWeighted(rng, options, STYLES[style]);
            if (R.key(R.applyMerge(pick.prior, pick.move)) !== R.key(board)) throw new Error('Reverse operation does not invert a legal merge');
            board = pick.prior;
            solution.unshift(pick.move);
        }
        return { board, solution };
    }

    // Difficulty tiers, from FuseReasoning.evaluate metrics. No tier accepts a puzzle whose
    // easiest human path ever needs exhaustive search.
    //   maxLevel   hardest technique on the easiest human path (1 direct … 5 hypothetical)
    //   casualWin  chance that a player who merges at random, avoiding only merges that are
    //              visibly lost (dead end or a level-2 contradiction), still wins
    // Easy: direct reasoning suffices and most sensible merges work. Hard: a hypothetical is
    // needed and most sensible-looking merges are traps. The gaps between tiers keep them
    // clearly apart. A 4×4 board has twice the merges, so every casual win rate is lower and
    // its tiers are set relative to that size.
    const DIFFICULTY = {
        3: {
            easy: (m) => m.maxLevel <= 2 && m.casualWin >= 0.6,
            medium: (m) => m.casualWin >= 0.3 && m.casualWin <= 0.5,
            hard: (m) => m.maxLevel === 5 && m.casualWin <= 0.22,
        },
        4: {
            easy: (m) => m.casualWin >= 0.2,
            medium: (m) => m.casualWin >= 0.06 && m.casualWin <= 0.12,
            hard: (m) => m.maxLevel === 5 && m.casualWin <= 0.03,
        },
    };
    const TIERS = ['easy', 'medium', 'hard'];

    function classify(m, size) {
        if (!m.solvable || m.searchSteps > 0) return null;
        const rules = DIFFICULTY[size || 3];
        for (const tier of TIERS) if (rules[tier](m)) return tier;
        return null;
    }

    // bank: puzzles come from CURATED (built offline) instead of a search on demand.
    const PLAN = {
        3: { attempts: 120, exponents: [4, 5, 6, 7] },
        4: { attempts: 0, exponents: [7, 8, 9], bank: true },
    };

    // The eight symmetries of a square board: k & 3 quarter turns, then a mirror if k & 4.
    function transform(board, k) {
        const n = board.rows;
        if (board.cols !== n || !(k & 7)) return board;
        const cells = new Array(n * n);
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                let rr = r, cc = c;
                for (let q = 0; q < (k & 3); q++) [rr, cc] = [cc, n - 1 - rr];
                if (k & 4) cc = n - 1 - cc;
                cells[rr * n + cc] = board.cells[r * n + c];
            }
        }
        return { rows: n, cols: n, cells };
    }
    // One key per symmetry class, so the bank holds no two boards that are the same puzzle.
    function canonicalKey(board) {
        let best = null;
        for (let k = 0; k < 8; k++) { const key = R.key(transform(board, k)); if (best === null || key < best) best = key; }
        return best;
    }

    function summary(m) {
        if (!m) return null;
        return {
            maxLevel: m.maxLevel, span: m.span, hypotheticals: m.levelCounts[5],
            casualWin: Math.round(m.casualWin * 1e4) / 1e4,
            randomWin: Math.round(m.randomWin * 1e4) / 1e4, decisionPoints: m.decisionPoints,
            trapRate: Math.round(m.trapRate * 1e4) / 1e4, firstMoves: m.firstMoves, winningFirstMoves: m.winningFirstMoves,
            plans: m.plans, cost: m.cost, uses: m.uses,
        };
    }

    function puzzleFrom(board, size, difficulty, seed, extra) {
        return Object.assign({
            id: `fuse-${size}x${size}-${difficulty}-${(seed >>> 0).toString(36)}`,
            game: 'fuse', size, rows: board.rows, cols: board.cols, difficulty, seed: seed >>> 0,
            board: R.serialize(board),
        }, extra);
    }

    // Generator core: yields after every attempt so the async wrapper can keep the page
    // responsive; `generate` drives it synchronously.
    function* attempts(opts) {
        const size = SIZES.includes(opts.size) ? opts.size : 3;
        const difficulty = TIERS.includes(opts.difficulty) ? opts.difficulty : 'medium';
        const seed = opts.seed >>> 0;
        const plan = PLAN[size];
        if (plan.bank) return fromBank(size, difficulty, seed);
        const limit = opts.attempts || plan.attempts;
        const rng = makeRng(seed ^ 0x9e3779b9);
        const seen = new Set();
        const styles = Object.keys(STYLES);
        for (let attempt = 1; attempt <= limit; attempt++) {
            const exponent = plan.exponents[Math.floor(rng() * plan.exponents.length)];
            const style = styles[Math.floor(rng() * styles.length)];
            const built = reverseBuild(rng, size, size, exponent, style);
            if (built && !seen.has(R.key(built.board))) {
                seen.add(R.key(built.board));
                const metrics = Reasoning.evaluate(R, built.board, { solver: Solver.createSolver(R) });
                if (classify(metrics, size) === difficulty) {
                    return puzzleFrom(built.board, size, difficulty, seed, {
                        solution: built.solution, metrics: summary(metrics), source: 'generated', attempts: attempt,
                    });
                }
            }
            yield attempt / limit;
        }
        return fallback(size, difficulty, seed, limit);
    }

    // Verified puzzles for each tier (tools/fuse/generator-check.js re-verifies them).
    const CURATED = {
        3: {
            easy: ['4 4 4/4 8 4/4 32 64', '32 2 2/16 4 2/2 2 2', '2 1 1/4 2 1/16 4 1', '8 16 32/4 32 16/2 2 16'],
            medium: ['4 4 8/16 16 16/16 16 32', '8 16 32/4 16 16/4 16 16', '8 4 2/8 8 2/16 8 8', '64 8 8/16 8 8/8 4 4'],
            hard: ['16 4 4/16 2 2/16 2 2', '16 8 8/16 2 2/8 2 2', '2 2 8/1 1 8/1 1 8', '16 16 32/16 16 16/8 4 4'],
        },
        4: {
            easy: [
                '64 8 8 16/32 64 8 16/16 2 2 1/16 1 1 1', '128 32 16 4/32 16 4 4/8 4 1 1/2 2 1 1',
                '8 1 1 2/8 8 4 8/16 8 16 32/8 8 128 256', '1 1 2 4/8 8 16 8/16 128 64 32/32 64 64 64',
                '64 16 8 8/128 32 4 1/64 16 4 1/128 32 4 2', '1 2 16 16/1 2 8 32/1 8 4 16/1 2 2 16',
                '8 4 4 2/16 16 4 2/16 32 16 8/32 64 16 16', '16 4 4 8/8 16 32 16/4 8 4 1/4 1 1 1',
                '4 8 32 64/4 16 32 32/2 4 16 16/2 8 8 8', '4 4 2 2/32 8 8 4/64 128 16 8/128 64 32 8',
                '32 4 2 2/16 2 1 1/32 4 2 1/16 8 4 1', '4 8 16 32/4 8 16 16/4 2 4 8/1 1 2 2',
                '8 2 1 1/8 16 4 8/16 32 64 16/32 256 32 16', '2 16 16 32/2 16 32 64/2 8 16 16/1 1 16 16',
                '8 8 8 4/8 16 8 4/64 32 16 8/64 2 2 4', '4 4 16 64/2 2 8 16/1 1 4 2/1 1 1 1',
                '1 4 8 8/1 2 8 32/4 8 16 32/4 32 32 64', '1 4 4 16/1 2 16 8/1 1 64 4/1 1 2 2',
                '4 1 1 4/4 8 2 8/8 8 32 8/16 16 128 8', '128 64 16 16/64 128 16 8/16 8 8 4/16 8 8 4',
                '32 64 8 4/32 32 16 4/32 8 4 2/8 4 4 2', '128 64 32 16/64 128 1 8/16 32 1 8/8 4 1 1',
                '256 128 4 2/64 32 8 2/2 2 4 2/1 1 2 2', '1 1 1 2/1 4 4 4/2 4 32 16/4 4 16 32',
            ],
            medium: [
                '128 16 8 8/64 8 8 4/128 4 1 2/128 2 1 2', '8 8 2 2/32 8 4 2/32 32 4 2/64 32 16 8',
                '8 8 4 4/8 16 2 2/4 64 1 1/2 2 1 1', '4 4 8 16/8 32 32 128/8 32 64 64/16 32 32 32',
                '2 8 2 2/2 4 4 8/8 8 16 128/16 16 32 256', '128 64 32 8/128 4 4 8/64 1 2 1/64 1 2 1',
                '256 128 32 32/1 2 8 16/1 2 16 8/1 1 4 4', '8 16 32 64/4 8 16 64/2 8 8 8/2 4 4 8',
                '4 4 64 64/16 8 32 64/32 16 64 64/8 8 32 32', '8 8 8 16/8 16 16 16/32 32 64 32/64 64 64 64',
                '4 4 16 16/16 8 32 32/4 8 16 64/4 8 8 16', '16 8 4 4/16 16 8 8/128 32 16 16/128 64 32 16',
                '32 16 8 4/16 8 8 4/8 8 4 4/4 2 1 1', '16 16 32 64/4 8 32 32/4 8 8 8/4 4 8 8',
                '16 16 32 128/8 8 32 128/4 2 2 128/2 2 2 2', '8 8 4 4/16 16 8 8/16 16 16 8/16 64 32 16',
                '1 2 2 4/1 1 1 8/4 2 16 8/4 2 64 8', '8 16 64 128/8 16 64 64/4 8 64 32/2 2 16 16',
                '8 2 1 1/8 4 4 4/32 16 1 1/32 8 2 4', '8 8 128 256/4 8 16 32/4 4 4 32/1 1 2 4',
                '32 64 128 16/32 64 64 16/16 16 8 16/8 8 8 16', '1 2 2 8/1 2 4 8/8 4 8 16/8 8 16 32',
                '2 16 2 2/2 4 2 1/8 8 64 1/4 4 4 4', '8 8 16 16/8 16 16 16/8 16 64 64/32 32 64 128',
            ],
            hard: [
                '8 8 8 8/8 16 16 8/16 32 32 8/16 32 32 8', '16 32 16 8/4 4 16 4/2 4 8 2/2 4 4 2',
                '4 4 4 2/32 32 16 2/16 64 32 32/16 64 64 128', '16 16 64 2/32 32 64 2/32 32 128 4/32 32 16 8',
                '16 16 4 4/8 64 8 8/4 32 32 8/4 16 16 16', '16 16 64 64/8 16 1 32/2 1 1 16/2 1 8 8',
                '128 128 32 8/64 64 8 4/16 16 8 4/16 8 4 4', '8 16 16 64/8 4 8 64/2 2 16 32/4 4 4 4',
                '32 16 8 4/32 4 4 4/8 4 2 1/4 2 2 1', '8 8 4 8/16 8 4 8/32 32 32 32/64 128 64 64',
                '256 32 16 8/64 32 16 4/16 16 8 4/32 4 2 2', '1 1 2 1/2 8 2 1/4 4 4 1/64 16 16 1',
                '128 8 4 2/64 8 4 1/8 8 4 1/4 4 4 4', '1 2 4 16/1 2 4 32/1 1 16 32/2 2 4 8',
                '128 16 4 4/32 16 4 2/32 8 2 2/2 2 1 1', '16 16 8 8/16 32 32 16/32 32 32 16/64 64 64 64',
                '4 8 32 32/2 8 8 8/1 4 8 8/1 2 1 1', '64 1 2 2/64 1 4 4/128 2 8 4/128 64 32 4',
                '2 1 4 4/2 1 1 4/4 8 1 16/8 8 32 32', '32 32 16 16/64 64 16 32/64 32 16 32/64 16 8 8',
                '1 1 1 1/1 1 2 1/8 4 4 1/64 32 4 2', '16 16 4 4/32 32 8 16/64 64 64 16/64 64 32 16',
                '2 8 4 4/1 2 8 32/1 1 1 32/4 4 8 16', '16 4 2 2/16 4 8 4/32 8 8 2/128 16 4 2',
            ],
        },
    };

    function curatedList(size, difficulty) {
        const list = (CURATED[size] && CURATED[size][difficulty]) || [];
        if (!list.length) throw new Error('No curated Fuse puzzle for ' + size + '/' + difficulty);
        return list;
    }
    function fallback(size, difficulty, seed, tried) {
        const list = curatedList(size, difficulty);
        const board = R.parse(list[seed % list.length]);
        const solver = Solver.createSolver(R);
        const metrics = Reasoning.evaluate(R, board, { solver });
        return puzzleFrom(board, size, difficulty, seed, {
            solution: solver.solve(board), metrics: summary(metrics), source: 'curated', attempts: tried,
        });
    }
    // Bank puzzles were evaluated when the bank was built (generator-check re-verifies them),
    // so only the solution is recomputed here.
    function fromBank(size, difficulty, seed) {
        const list = curatedList(size, difficulty);
        const board = transform(R.parse(list[seed % list.length]), Math.floor(seed / list.length) % 8);
        return puzzleFrom(board, size, difficulty, seed, {
            solution: Solver.createSolver(R).solve(board), metrics: null, source: 'bank', attempts: 0,
        });
    }

    function generate(opts) {
        const it = attempts(opts);
        for (;;) { const r = it.next(); if (r.done) return r.value; }
    }

    async function generatePuzzle(size, difficulty, seed, onProgress) {
        const it = attempts({ size, difficulty, seed });
        let last = Date.now();
        for (;;) {
            const r = it.next();
            if (r.done) return r.value;
            if (Date.now() - last > 40) {
                if (onProgress) await onProgress(r.value);
                await new Promise((resolve) => setTimeout(resolve, 0));
                last = Date.now();
            }
        }
    }

    return {
        SIZES, TIERS, DIFFICULTY, CURATED, PLAN, REVERSE_OPS, STYLES,
        makeRng, reverseBuild, transform, canonicalKey, classify, summary, generate, generatePuzzle,
    };
});
