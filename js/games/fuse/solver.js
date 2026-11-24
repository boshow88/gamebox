/* Fuse: exact solver over the shared rules — solvability, move classification, solution
 * reconstruction and solution counts, with memoized canonical states and a state budget.
 * Independent of tile types: it only calls the rules' moves, merges and invariants. No DOM. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
    else root.FuseSolver = factory(root.FuseRules);
})(typeof window === 'object' ? window : globalThis, function (Rules) {
    'use strict';

    const LOST = 0, WON = 1;
    class BudgetExceeded extends Error {}

    // Two merges commute exactly when they touch disjoint cells: legality and results depend
    // only on the two cells involved. Used to count solutions up to the order of independent merges.
    function independent(a, b) {
        return a.from !== b.from && a.from !== b.to && a.to !== b.from && a.to !== b.to;
    }

    function createSolver(rules, options) {
        const R = rules || Rules.DEFAULT;
        const opts = Object.assign({ maxStates: 300000, prune: true, maxMemo: 2000000 }, options);
        // key -> LOST | WON | the winning move found from that state.
        const memo = new Map();
        let explored = 0, budget = Infinity, pruned = 0, exhausted = 0;

        function guard(fn) {
            if (memo.size > opts.maxMemo) memo.clear();
            budget = explored + opts.maxStates;
            try { return fn(); } catch (err) { if (err instanceof BudgetExceeded) { exhausted++; return undefined; } throw err; } finally { budget = Infinity; }
        }
        function spend() { if (++explored > budget) throw new BudgetExceeded(); }

        function winnable(board) {
            const k = R.key(board);
            const hit = memo.get(k);
            if (hit !== undefined) return hit !== LOST;
            const n = R.tileCount(board);
            if (n <= 1) { memo.set(k, n === 1 ? WON : LOST); return n === 1; }
            if (opts.prune && R.findContradiction(board)) { pruned++; memo.set(k, LOST); return false; }
            spend();
            for (const m of R.legalMoves(board)) {
                if (winnable(R.applyMerge(board, m))) { memo.set(k, m); return true; }
            }
            memo.set(k, LOST);
            return false;
        }

        // true / false, or undefined when the state budget ran out.
        function isSolvable(board) { return guard(() => winnable(board)); }

        // Records a known winning sequence from `board` (replayed first; false if it does not
        // win), so later searches start from what it proves.
        function learn(board, moves) {
            const line = [];
            let b = board;
            for (const m of moves) {
                if (!R.canMerge(b, m.from, m.to)) return false;
                line.push([R.key(b), { from: m.from, to: m.to }]);
                b = R.applyMerge(b, m);
            }
            if (R.tileCount(b) !== 1) return false;
            for (const [k, m] of line) memo.set(k, m);
            memo.set(R.key(b), WON);
            return true;
        }

        // Outcome of every legal merge. status: 'won' | 'dead-end' | 'solvable' |
        // 'unsolvable' (legal merges exist but all lose) | 'unknown' (budget exhausted).
        function analyze(board) {
            const s = R.status(board);
            if (s === 'won') return { status: 'won', moves: [], solution: [] };
            if (s === 'invalid') return { status: 'invalid', moves: [], solution: null };
            const moves = R.legalMoves(board).map((m) => ({ from: m.from, to: m.to, outcome: 'unknown' }));
            if (!moves.length) return { status: 'dead-end', moves, solution: null };
            guard(() => { for (const m of moves) m.outcome = winnable(R.applyMerge(board, m)) ? 'win' : 'lose'; });
            const win = moves.find((m) => m.outcome === 'win');
            let status = 'unknown';
            if (win) status = 'solvable';
            else if (moves.every((m) => m.outcome === 'lose')) status = 'unsolvable';
            if (win) memo.set(R.key(board), { from: win.from, to: win.to });
            return { status, moves, solution: win ? reconstruct(board) : null };
        }

        function reconstruct(board) {
            const out = [];
            let b = board;
            while (R.tileCount(b) > 1) {
                const m = memo.get(R.key(b));
                if (!m || m === LOST || m === WON) {
                    if (!guard(() => winnable(b))) return null;
                    continue;
                }
                out.push({ from: m.from, to: m.to });
                b = R.applyMerge(b, m);
            }
            return out;
        }
        function solve(board) {
            const ok = isSolvable(board);
            return ok ? reconstruct(board) : (ok === false ? null : undefined);
        }

        // 'win' | 'lose' | 'unknown' for one merge (assumed legal).
        function classify(board, move) {
            const ok = isSolvable(R.applyMerge(board, move));
            return ok === undefined ? 'unknown' : (ok ? 'win' : 'lose');
        }

        // Number of winning move sequences (every order counts), capped.
        function countSequences(board, cap) {
            const limit = cap || Infinity, seq = new Map();
            function count(b) {
                if (R.tileCount(b) === 1) return 1;
                if (!winnable(b)) return 0;
                const k = R.key(b);
                if (seq.has(k)) return seq.get(k);
                spend();
                let total = 0;
                for (const m of R.legalMoves(b)) {
                    total += count(R.applyMerge(b, m));
                    if (total >= limit) { total = limit; break; }
                }
                seq.set(k, total);
                return total;
            }
            return guard(() => count(board));
        }

        // Number of distinct solutions, where two solutions are the same when they use the same
        // set of merges (source → destination), differing only in the order of independent
        // merges, and ignoring the direction of the final merge (always free). Counted with
        // sleep sets so each equivalence class is explored once; capped.
        function countPlans(board, cap) {
            const limit = cap || Infinity, plans = new Map();
            function count(b, sleep) {
                const n = R.tileCount(b);
                if (n <= 1) return n;
                if (!winnable(b)) return 0;
                if (n === 2) return 1;
                const k = R.key(b) + '|' + sleep.map(Rules.moveKey).sort().join(' ');
                if (plans.has(k)) return plans.get(k);
                spend();
                let total = 0;
                const done = [];
                for (const m of R.legalMoves(b)) {
                    if (sleep.some((x) => Rules.sameMove(x, m))) continue;
                    const childSleep = sleep.concat(done).filter((x) => independent(x, m));
                    total += count(R.applyMerge(b, m), childSleep);
                    done.push(m);
                    if (total >= limit) { total = limit; break; }
                }
                plans.set(k, total);
                return total;
            }
            return guard(() => count(board, []));
        }

        // Probability that a player choosing uniformly among legal merges reaches a win.
        function randomPlayWin(board) {
            const prob = new Map();
            function p(b) {
                const n = R.tileCount(b);
                if (n <= 1) return n;
                if (!winnable(b)) return 0;
                const k = R.key(b);
                if (prob.has(k)) return prob.get(k);
                spend();
                const moves = R.legalMoves(b);
                let total = 0;
                for (const m of moves) total += p(R.applyMerge(b, m));
                const v = total / moves.length;
                prob.set(k, v);
                return v;
            }
            return guard(() => p(board));
        }

        return {
            rules: R, isSolvable, learn, analyze, solve, classify, countSequences, countPlans, randomPlayWin,
            reset() { memo.clear(); },
            stats: () => ({ explored, pruned, exhausted, memo: memo.size }),
        };
    }

    return { createSolver, independent };
});
