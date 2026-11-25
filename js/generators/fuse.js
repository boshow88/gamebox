/**
 * Fuse — puzzle generator.
 *
 * Each difficulty draws a board shape from SHAPES (Easy 3×3 to 4×3, Medium and Hard 4×4; any
 * may carry ×2 tiles), then:
 * 1. Reverse construction: start from one tile holding the target total and repeatedly undo
 *    a forward merge (REVERSE_OPS) until every cell is filled. Each step is checked to be the
 *    exact inverse of a legal forward merge, so the construction is a known solution. The
 *    numbers are then divided by the smallest, so every board starts from 1.
 * 2. Difficulty: Reasoning.trialMerges counts what trial and error costs a player who tries
 *    the smallest tiles first, skips visibly lost merges and undoes when stuck. The merges
 *    made and undone (`waste`) must fall in the tier's range (DIFFICULTY). For Medium and
 *    Hard, Reasoning.firstTryWin (a player who makes the obvious merges and otherwise guesses
 *    among merges that do not look lost) must also fall in range.
 * 3. Fairness: the easiest human path reaches one tile without exhaustive search, so every
 *    hint can explain itself, and no position on it needs more than SEARCH_BUDGET solver
 *    states to classify its merges (what one hint costs in the game).
 * Attempts are counted, never timed, so (difficulty, seed) always yields the same puzzle. When
 * no attempt fits the tier, a verified curated puzzle is returned instead.
 *
 * Exposed:
 *   window.PuzzleGenerators.fuse(difficulty, seed, onProgress) → Promise<puzzle>
 *   window.PuzzleGenerators.fuseInternals — generate (sync), judge, DIFFICULTY, SHAPES, …
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

    // Each way a number tile 2v at d could have been made from two tiles at d and an empty
    // neighbour s by the merge s → d: { prior, move, value: 2v }.
    function splits(board, make) {
        const out = [];
        for (const d of R.tiles(board)) {
            const t = board.cells[d];
            if (t.type !== 'num' || t.value < 2) continue;
            for (const s of R.neighbors(board, d)) {
                if (board.cells[s] !== R.EMPTY) continue;
                for (const [atD, atS] of make(t.value / 2)) {
                    const cells = board.cells.slice();
                    cells[d] = atD;
                    cells[s] = atS;
                    out.push({ prior: R.withCells(board, cells), move: { from: s, to: d }, value: t.value });
                }
            }
        }
        return out;
    }
    // Reverse operations. Each lists { prior, move } where applying the forward `move` to
    // `prior` yields `board`. New tile types extend generation by adding entries here; `mul`
    // marks the ones that add a ×2 tile.
    const REVERSE_OPS = [
        // Undo number + number: v at s merged into v at d.
        { id: 'split-number', mul: false, options: (board) => splits(board, (v) => [[R.num(v), R.num(v)]]) },
        // Undo a ×2 merge, in either direction: v at s into ×2 at d, or ×2 at s into v at d.
        { id: 'split-mul', mul: true, options: (board) => splits(board, (v) => [[R.mul(2), R.num(v)], [R.num(v), R.mul(2)]]) },
    ];

    // Construction styles vary which tile is split next, giving different value profiles.
    const STYLES = {
        even: (o) => o.value,                 // split large tiles: many similar values
        mixed: () => 1,                       // uniform
        deep: (o) => 1 / Math.sqrt(o.value),  // split small tiles: long doubling chains
    };

    // Merges only compare numbers with each other or double them, so dividing every number by
    // the smallest gives the same puzzle. Served boards always start from 1.
    function normalize(board) {
        const unit = Math.min(...R.tiles(board).map((i) => board.cells[i]).filter((c) => c.type === 'num').map((c) => c.value));
        if (!(unit > 1) || !Number.isFinite(unit)) return board;
        return R.withCells(board, board.cells.map((c) => (c && c.type === 'num' ? R.num(c.value / unit) : c)));
    }

    // A full board with exactly `muls` ×2 tiles and the solution that built it, normalized.
    // Each step adds a ×2 tile with probability (×2 tiles left) / (steps left), so they
    // spread evenly over the solution.
    function reverseBuild(rng, rows, cols, exponent, style, muls) {
        let board = R.createBoard(rows, cols, new Array(rows * cols).fill(R.EMPTY));
        board.cells[Math.floor(rng() * board.cells.length)] = R.num(Math.pow(2, exponent));
        const solution = [];
        let left = muls || 0;
        while (board.cells.includes(R.EMPTY)) {
            const steps = board.cells.filter((c) => c === R.EMPTY).length, mul = rng() * steps < left;
            const options = [].concat(...REVERSE_OPS.filter((op) => op.mul === mul).map((op) => op.options(board)));
            if (!options.length) return null;
            const pick = pickWeighted(rng, options, STYLES[style]);
            if (R.key(R.applyMerge(pick.prior, pick.move)) !== R.key(board)) throw new Error('Reverse operation does not invert a legal merge');
            board = pick.prior;
            solution.unshift(pick.move);
            if (mul) left--;
        }
        return { board: normalize(board), solution };
    }

    const TIERS = ['easy', 'medium', 'hard'];
    // Board shapes per difficulty as [rows, cols, weight]. Only 4×4 boards reach the waste
    // Medium and Hard need (tools/fuse/calibrate.js).
    const SHAPES = {
        easy: [[3, 3, 2], [3, 4, 1], [4, 3, 1]],
        medium: [[4, 4, 1]],
        hard: [[4, 4, 1]],
    };
    // Final tile exponents (the last tile is 2^e before normalizing) by cell count, and how
    // many ×2 tiles a board of that size gets, by weight. Each ×2 tile adds one to the
    // exponent, which keeps the other tiles in range and the construction from running out of
    // tiles to split. Two ×2 tiles on 4×4 almost never leave a board solvable by reasoning
    // (tools/fuse/calibrate.js).
    const EXPONENTS = { 9: [4, 5, 6, 7], 12: [6, 7, 8], 16: [7, 8, 9] };
    const MULS = { 9: [[0, 1], [1, 1]], 12: [[0, 2], [1, 1], [2, 1]], 16: [[0, 1], [1, 1]] };
    // Per tier: the waste (merges made and undone by trial and error, Reasoning.trialMerges)
    // and, for 4×4, the first-try win chance in % (Reasoning.firstTryWin). Waste tells Easy
    // from the rest; the first-try chance tells Medium from Hard, since a player who makes the
    // obvious merges skips most of the trial and error. The gaps keep the tiers clearly apart.
    const DIFFICULTY = {
        easy: { min: 0, max: 2 },
        medium: { min: 80, max: Infinity, firstTry: { min: 25, max: 70 } },
        hard: { min: 80, max: Infinity, firstTry: { min: 0, max: 20 } },
    };
    // About 3% of 4×4 attempts qualify for Medium and 1.6% for Hard.
    const ATTEMPTS = { easy: 60, medium: 200, hard: 400 };
    // Boards solvable by reasoning stay under ~2700 states per position (tools/fuse/calibrate.js
    // --cost); boards that need search often run far past it.
    const SEARCH_BUDGET = 5000;

    // Metrics when `board` belongs to `difficulty`, else null. The cheap trial count runs first,
    // then the human path, then the first-try chance for boards still in range. Counting stops
    // just past the range, so for Medium and Hard `waste` reads "at least". A known `solution`
    // only speeds up the search.
    function judge(board, difficulty, solution) {
        const range = DIFFICULTY[difficulty], minimum = R.tileCount(board) - 1;
        const cap = minimum + (range.max === Infinity ? range.min : range.max + 1);
        const waste = Reasoning.trialMerges(R, board, cap) - minimum;
        if (waste < range.min || waste > range.max) return null;
        const solver = Solver.createSolver(R, { maxStates: SEARCH_BUDGET });
        if (solution) solver.learn(board, solution);
        const path = Reasoning.humanPath(R, board, { stopAtSearch: true, solver });
        if (!path.complete || solver.stats().exhausted) return null;
        const metrics = { waste, maxLevel: path.maxLevel, muls: R.tiles(board).filter((i) => board.cells[i].type === 'mul').length };
        if (range.firstTry) {
            const chance = 100 * Reasoning.firstTryWin(R, board, solver);
            if (chance < range.firstTry.min || chance > range.firstTry.max) return null;
            metrics.firstTry = Math.round(chance * 10) / 10;
        }
        return metrics;
    }

    function puzzleFrom(board, difficulty, seed, extra) {
        return Object.assign({
            id: `fuse-${difficulty}-${(seed >>> 0).toString(36)}`,
            game: 'fuse', difficulty, seed: seed >>> 0, rows: board.rows, cols: board.cols,
            board: R.serialize(board),
        }, extra);
    }

    // Generator core: yields after every attempt so the async wrapper can keep the page
    // responsive; `generate` drives it synchronously.
    function* attempts(opts) {
        const difficulty = TIERS.includes(opts.difficulty) ? opts.difficulty : 'medium';
        const seed = opts.seed >>> 0, limit = opts.attempts || ATTEMPTS[difficulty];
        const rng = makeRng(seed ^ 0x9e3779b9), styles = Object.keys(STYLES), seen = new Set();
        for (let attempt = 1; attempt <= limit; attempt++) {
            const [rows, cols] = pickWeighted(rng, SHAPES[difficulty], (s) => s[2]);
            const cells = rows * cols, muls = MULS[cells] ? pickWeighted(rng, MULS[cells], (b) => b[1])[0] : 0;
            const exponent = EXPONENTS[cells][Math.floor(rng() * EXPONENTS[cells].length)] + muls;
            const style = styles[Math.floor(rng() * styles.length)];
            const built = reverseBuild(rng, rows, cols, exponent, style, muls);
            if (built && !seen.has(R.key(built.board))) {
                seen.add(R.key(built.board));
                const metrics = judge(built.board, difficulty, built.solution);
                if (metrics) {
                    return puzzleFrom(built.board, difficulty, seed, { solution: built.solution, metrics, source: 'generated', attempts: attempt });
                }
            }
            yield attempt / limit;
        }
        return fallback(difficulty, seed, limit);
    }

    // Verified puzzles for each tier, drawn from generator output (tools/fuse/calibrate.js
    // lists candidates; tools/fuse/generator-check.js re-verifies them).
    const CURATED = {
        easy: [
            '1 2 4/1 2 2/1 1 2', '1 1 2 2/2 16 8 4/4 8 16 64', '8 4 2/8 4 1/16 4 1/8 4 4',
            '1 1 1/x2 2 1/16 8 1', '1 x2 4/1 2 4/4 4 8',
        ],
        medium: [
            '16 16 16 16/16 8 8 8/1 8 8 1/1 2 2 1', '2 2 4 4/1 2 16 x2/1 16 32 256/8 8 128 512',
            '1 1 4 4/2 2 16 8/1 4 4 4/1 4 4 4', '4 64 64 32/2 4 16 32/1 2 8 x2/1 2 8 8',
            '4 8 32 32/4 8 16 8/2 2 2 x2/1 1 2 2',
        ],
        hard: [
            '16 16 8 8/16 16 8 4/16 4 4 4/4 2 1 1', '1 1 1 2/1 4 4 x2/2 4 4 8/2 2 4 8',
            '4 4 2 1/4 4 2 1/4 16 2 2/4 8 4 2', 'x2 8 8 2/2 4 4 2/2 8 2 2/1 1 1 1',
            '4 x2 4 4/4 8 16 2/2 2 4 1/4 2 2 1',
        ],
    };

    function fallback(difficulty, seed, tried) {
        const list = CURATED[difficulty];
        const board = R.parse(list[seed % list.length]), solution = Solver.createSolver(R).solve(board);
        return puzzleFrom(board, difficulty, seed, {
            solution, metrics: judge(board, difficulty, solution), source: 'curated', attempts: tried,
        });
    }

    function generate(opts) {
        const it = attempts(opts);
        for (;;) { const r = it.next(); if (r.done) return r.value; }
    }

    async function generatePuzzle(difficulty, seed, onProgress) {
        const it = attempts({ difficulty, seed });
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
        TIERS, SHAPES, EXPONENTS, MULS, DIFFICULTY, ATTEMPTS, SEARCH_BUDGET, CURATED, REVERSE_OPS, STYLES,
        makeRng, normalize, reverseBuild, judge, generate, generatePuzzle,
    };
});
