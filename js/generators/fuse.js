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
    const SIZES = [3];

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

    // Difficulty tiers, from FuseReasoning.evaluate metrics along the easiest human path. No
    // tier accepts a puzzle whose path ever needs exhaustive search.
    //   maxLevel  hardest technique used (1 direct … 4 reverse value, 5 hypothetical)
    //   span      most merges a player must picture ahead in a single hypothetical step
    //   levelCounts[5]  how many hypothetical steps the path needs
    // Easy never needs a hypothetical. Medium needs one short one. Hard needs a long one
    // (from the opening position on 3×3) or several.
    const DIFFICULTY = {
        easy: (m) => m.maxLevel <= 2,
        medium: (m) => m.maxLevel >= 3 && m.maxLevel <= 5 && m.span <= 6 && m.levelCounts[5] <= 1,
        hard: (m) => m.maxLevel === 5 && (m.span >= 7 || m.levelCounts[5] >= 2),
    };
    const TIERS = ['easy', 'medium', 'hard'];

    function classify(m) {
        if (!m.solvable || m.searchSteps > 0) return null;
        for (const tier of TIERS) if (DIFFICULTY[tier](m)) return tier;
        return null;
    }

    const PLAN = {
        3: { attempts: 120, exponents: [4, 5, 6, 7] },
    };

    function summary(m) {
        return {
            maxLevel: m.maxLevel, span: m.span, hypotheticals: m.levelCounts[5],
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
                if (classify(metrics) === difficulty) {
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
            easy: ['2 2 2/4 4 2/8 4 4', '16 4 4/2 2 1/1 1 1', '4 4 2/16 4 2/16 8 8', '32 32 8/16 16 4/8 8 4'],
            medium: ['4 16 8/4 8 4/8 8 4', '4 4 8/16 16 16/16 16 32', '8 16 32/4 16 16/4 16 16', '64 8 8/16 8 8/8 4 4'],
            hard: ['16 4 4/16 2 2/16 2 2', '1 1 1/1 1 1/2 4 4', '16 16 32/4 4 16/4 4 32', '8 4 8/4 1 1/4 1 1'],
        },
    };

    function fallback(size, difficulty, seed, tried) {
        const list = (CURATED[size] && CURATED[size][difficulty]) || [];
        if (!list.length) throw new Error('No curated Fuse puzzle for ' + size + '/' + difficulty);
        const board = R.parse(list[seed % list.length]);
        const solver = Solver.createSolver(R);
        const metrics = Reasoning.evaluate(R, board, { solver });
        return puzzleFrom(board, size, difficulty, seed, {
            solution: solver.solve(board), metrics: summary(metrics), source: 'curated', attempts: tried,
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

    return { SIZES, TIERS, DIFFICULTY, CURATED, PLAN, REVERSE_OPS, STYLES, makeRng, reverseBuild, classify, summary, generate, generatePuzzle };
});
