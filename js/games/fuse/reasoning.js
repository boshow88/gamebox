/* Fuse: human-oriented reasoning on top of the shared rules — explainable deductions, hint
 * steps and difficulty metrics. Exact search validates every recommendation and is labelled
 * as search whenever no technique explains a move. No DOM, no copy (the view words steps).
 *
 * Techniques (level = how hard the idea is for a person; 6 = exhaustive search):
 *   1 final       Two tiles left: merging them either way finishes.
 *   1 lone        A tile with a single neighbour holding the same value merges into it.
 *   1 only-pair   Only one pair on the board can merge, so it must merge now.
 *   2 forced-pair A tile whose other neighbours are all larger (they never shrink) can only
 *                 ever pair with its one equal neighbour, and must do so before either changes.
 *   2 stuck / rivals / odd-group   Pairing contradictions (see rules.js CONDITIONS).
 *   3 split       Emptying a cell that links two groups of tiles loses.
 *   4 subtotal    A connected group of tiles below v must add up to a multiple of v.
 *   4 half        A tile worth half the total only merges last; the rest must stay connected.
 *   5 lookahead   Assume a merge, follow up to `depth` forced merges, reach a contradiction.
 *   5 trial       Make a merge and every later merge is forced through to a single tile.
 * A step is a forced merge (a pair plus the direction argument), an elimination (every other
 * merge is refuted), a free choice (refuted merges are traps; every remaining merge was
 * verified by search), or a trial (one merge shown to work; others may work too). */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'), require('./solver.js'));
    else root.FuseReasoning = factory(root.FuseRules, root.FuseSolver);
})(typeof window === 'object' ? window : globalThis, function (Rules, Solver) {
    'use strict';

    const SEARCH = 6;
    const LEVELS = {
        final: 1, lone: 1, 'only-pair': 1, 'dead-end': 1, 'forced-pair': 2, stuck: 2, rivals: 2, 'odd-group': 2,
        split: 3, subtotal: 4, half: 4, lookahead: 5, 'pair-blocked': 5, 'no-survivor': 5, trial: 5, search: SEARCH,
    };
    const COSTS = {
        lone: 1, 'only-pair': 1, 'forced-pair': 2, 'dead-end': 1, stuck: 1, rivals: 2, 'odd-group': 2,
        split: 2, subtotal: 3, half: 3, lookahead: 3, 'pair-blocked': 3, 'no-survivor': 3, trial: 3,
    };
    // depth: forced merges a lookahead follows; trialDepth: longest chain a trial may picture.
    const DEFAULTS = { maxLevel: 5, depth: 3, trialDepth: 8 };

    // The easiest contradiction that shows a board can no longer be solved, or null.
    function explainDead(R, board) {
        if (R.tileCount(board) < 2) return null;
        const found = R.contradictions(board).map((c) => Object.assign({ level: c.level || LEVELS[c.id] || 4 }, c));
        if (!R.legalMoves(board).length) found.push({ id: 'dead-end', level: 1, cells: R.tiles(board) });
        found.sort((a, b) => a.level - b.level);
        return found[0] || null;
    }

    function pairsOf(moves) {
        const pairs = new Map();
        for (const m of moves) {
            const a = Math.min(m.from, m.to), b = Math.max(m.from, m.to);
            if (!pairs.has(a + ':' + b)) pairs.set(a + ':' + b, { a, b });
        }
        return [...pairs.values()];
    }

    // Pairs that provably must merge now (in some direction) whenever the board is solvable.
    function forcedPairs(R, board) {
        const out = [];
        const pairs = pairsOf(R.legalMoves(board));
        if (pairs.length === 1) out.push({ technique: 'only-pair', anchor: pairs[0].a, a: pairs[0].a, b: pairs[0].b });
        if (!R.numbersOnly(board)) return out;
        for (const x of R.tiles(board)) {
            const v = board.cells[x].value;
            const occupied = R.neighbors(board, x).filter((j) => R.isTile(board.cells[j]));
            const partners = occupied.filter((j) => board.cells[j].value <= v);
            if (partners.length !== 1 || board.cells[partners[0]].value !== v) continue;
            out.push({ technique: occupied.length === 1 ? 'lone' : 'forced-pair', anchor: x, a: x, b: partners[0] });
        }
        return out;
    }

    // Evidence that `move` loses, using contradictions up to `limit` (lookahead at 5). `span`
    // counts the merges a player has to picture to see it.
    function refute(ctx, board, move, limit) {
        const next = ctx.R.applyMerge(board, move);
        const dead = explainDead(ctx.R, next);
        if (dead && dead.level <= limit) return { move, reason: dead, level: dead.level, cost: COSTS[dead.id] || 3, span: 1 };
        if (limit >= 5 && !dead) {
            const chain = lookahead(ctx, next);
            if (chain) {
                return {
                    move, level: 5, cost: COSTS.lookahead + chain.moves.length, span: 1 + chain.moves.length,
                    reason: { id: 'lookahead', level: 5, chain: chain.moves, final: chain.final, cells: chain.final.cells },
                };
            }
        }
        return null;
    }

    // Under the assumption that `board` is solvable, follow merges forced at level ≤ 4.
    // Returns the chain and the contradiction it ends in, or null.
    function lookahead(ctx, board) {
        const moves = [];
        let b = board;
        for (let k = 0; k < ctx.depth; k++) {
            const f = forcedFollowUp(ctx, b);
            if (!f) return null;
            if (f.dead) return { moves, final: f.dead };
            moves.push(f.move);
            b = ctx.R.applyMerge(b, f.move);
            const dead = explainDead(ctx.R, b);
            if (dead) return { moves, final: dead };
        }
        return null;
    }
    // The next merge forced at level ≤ 4: a forced pair with one surviving direction, or the
    // only merge that survives refutation. `dead` when the assumption already fails.
    function forcedFollowUp(ctx, b) {
        if (ctx.R.tileCount(b) <= 2) return null;
        for (const pair of forcedPairs(ctx.R, b)) {
            if (pair.technique === 'lone') return { move: { from: pair.a, to: pair.b } };
            const dirs = directions(ctx.R, b, pair);
            const alive = dirs.filter((m) => !refute(ctx, b, m, 4));
            if (!alive.length) {
                return { dead: { id: 'pair-blocked', level: LEVELS['pair-blocked'], cells: [pair.a, pair.b], value: valueAt(b, pair.a) } };
            }
            if (alive.length === 1) return { move: alive[0] };
        }
        const alive = ctx.R.legalMoves(b).filter((m) => !refute(ctx, b, m, 4));
        if (!alive.length) return { dead: { id: 'no-survivor', level: LEVELS['no-survivor'], cells: ctx.R.tiles(b) } };
        return alive.length === 1 ? { move: alive[0] } : null;
    }

    // Constructive check: after `move`, merges forced at level ≤ 4 run all the way to a single
    // tile within `trialDepth` merges. The chain itself is a winning sequence, so this never
    // needs the solvability assumption to be trusted.
    function confirm(ctx, board, move) {
        const chain = [move];
        let b = ctx.R.applyMerge(board, move);
        while (ctx.R.tileCount(b) > 2) {
            if (chain.length >= ctx.trialDepth) return null;
            const f = forcedFollowUp(ctx, b);
            if (!f || f.dead) return null;
            chain.push(f.move);
            b = ctx.R.applyMerge(b, f.move);
        }
        if (ctx.R.tileCount(b) === 2) {
            const last = ctx.R.legalMoves(b)[0];
            if (!last || chain.length >= ctx.trialDepth) return null;
            chain.push(last);
        }
        return chain;
    }

    function directions(R, board, pair) {
        return [{ from: pair.a, to: pair.b }, { from: pair.b, to: pair.a }].filter((m) => R.canMerge(board, m.from, m.to));
    }
    function valueAt(board, i) { const c = board.cells[i]; return c && c.type === 'num' ? c.value : null; }

    // A forced pair plus the argument for its direction; `undecided` when no technique up
    // to `maxLevel` separates the two directions.
    function resolvePair(ctx, board, pair) {
        const base = {
            technique: pair.technique, level: LEVELS[pair.technique], cost: COSTS[pair.technique],
            pair: [pair.a, pair.b], anchor: pair.anchor, value: valueAt(board, pair.a), refuted: [],
        };
        const dirs = directions(ctx.R, board, pair);
        // A lone tile merging the other way leaves the result with no neighbours at all.
        if (pair.technique === 'lone' || dirs.length === 1) {
            const move = pair.technique === 'lone' ? { from: pair.a, to: pair.b } : dirs[0];
            return Object.assign(base, { move, direction: pair.technique === 'lone' ? 'lone' : 'only', span: 0 });
        }
        for (const limit of [Math.min(4, ctx.maxLevel), ctx.maxLevel]) {
            const refs = dirs.map((m) => refute(ctx, board, m, limit));
            const alive = dirs.filter((m, i) => !refs[i]);
            if (alive.length === 1) {
                const ref = refs.find(Boolean);
                return Object.assign(base, {
                    move: alive[0], direction: 'refuted', refuted: [ref],
                    level: Math.max(base.level, ref.level), cost: base.cost + ref.cost, span: ref.span,
                });
            }
            if (!alive.length) return null;
        }
        return Object.assign(base, { move: null, undecided: dirs });
    }

    // Every step a person could take from `board`, before validation against exact search.
    // `outcome(move)` reports exact results ('win' | 'lose' | 'unknown').
    function candidates(R, board, outcome, options) {
        const ctx = Object.assign({ R }, DEFAULTS, options);
        const out = [];
        for (const pair of forcedPairs(R, board)) {
            const step = resolvePair(ctx, board, pair);
            if (!step) continue;
            if (step.move) out.push(step);
            else if (step.undecided.every((m) => outcome(m) === 'win')) {
                out.push(Object.assign(step, { move: step.undecided[0], alternatives: step.undecided, freeDirection: true, verifiedBySearch: true, span: 0 }));
            }
        }
        const legal = R.legalMoves(board);
        const refs = legal.map((m) => refute(ctx, board, m, ctx.maxLevel));
        const alive = legal.filter((m, i) => !refs[i]);
        const eliminated = refs.filter(Boolean);
        if (alive.length && alive.every((m) => outcome(m) === 'win')) {
            const level = eliminated.reduce((lv, r) => Math.max(lv, r.level), 1);
            const cost = eliminated.reduce((sum, r) => sum + r.cost, 1);
            const span = eliminated.reduce((n, r) => Math.max(n, r.span), 0);
            if (alive.length === 1) out.push({ technique: 'eliminate', level, cost, span, move: alive[0], eliminated, refuted: eliminated });
            else out.push({ technique: 'free', level, cost, span, move: alive[0], alternatives: alive, eliminated, refuted: eliminated, verifiedBySearch: true });
        }
        if (ctx.maxLevel >= 5 && !out.some((s) => s.level < 5)) {
            for (const move of alive) {
                const chain = confirm(ctx, board, move);
                if (chain) out.push({ technique: 'trial', level: LEVELS.trial, cost: COSTS.trial + chain.length, span: chain.length, move, chain, refuted: [] });
            }
        }
        return out;
    }

    function rank(step) { return step.level * 1000 + (step.verifiedBySearch ? 100 : 0) + step.cost; }

    // The easiest valid step from `board`. Recommendations are always winning merges according
    // to exact search; when no technique applies the step is labelled `search`.
    function nextStep(R, board, options) {
        const o = Object.assign({}, DEFAULTS, options);
        const solver = o.solver || Solver.createSolver(R);
        const status = R.status(board);
        if (status === 'won') return { technique: 'won', level: 0, cost: 0, cells: [] };
        if (status === 'dead-end') return { technique: 'dead-end', level: 1, cost: 0, reason: explainDead(R, board) };
        if (R.tileCount(board) === 2) {
            const moves = R.legalMoves(board);
            return { technique: 'final', level: 1, cost: 1, span: 0, move: moves[0], alternatives: moves, pair: [moves[0].from, moves[0].to], validated: true };
        }
        const exact = solver.analyze(board);
        if (exact.status === 'unsolvable') {
            const reason = explainDead(R, board);
            return { technique: 'unsolvable', level: reason ? reason.level : SEARCH, cost: 0, reason, verifiedBySearch: !reason };
        }
        const outcome = (m) => { const hit = exact.moves.find((x) => Rules.sameMove(x, m)); return hit ? hit.outcome : 'lose'; };
        const validated = exact.status === 'solvable';
        const steps = candidates(R, board, outcome, o)
            .filter((s) => outcome(s.move) === 'win' || (!validated && outcome(s.move) === 'unknown'))
            .sort((a, b) => rank(a) - rank(b));
        if (steps.length) return Object.assign(steps[0], { validated });
        const wins = exact.moves.filter((m) => m.outcome === 'win').map((m) => ({ from: m.from, to: m.to }));
        if (!wins.length) return { technique: 'unknown', level: SEARCH, cost: 0, verifiedBySearch: false, validated: false };
        // Keep any pair a technique proved, so a hint can still explain that much.
        const pair = forcedPairs(R, board).find((p) => wins.some((m) => (m.from === p.a && m.to === p.b) || (m.from === p.b && m.to === p.a)));
        return {
            technique: 'search', level: SEARCH, cost: 0, move: wins[0], alternatives: wins, verifiedBySearch: true, validated: true,
            pair: pair ? [pair.a, pair.b] : null, pairTechnique: pair ? pair.technique : null, anchor: pair ? pair.anchor : null,
        };
    }

    // Chance that a casual player wins: merges are picked at random, but never one whose result
    // is visibly lost (a contradiction of level <= `sees`, or a dead end).
    function casualWin(R, board, solver, sees) {
        const limit = sees || 2, memo = new Map();
        function p(b) {
            const n = R.tileCount(b);
            if (n <= 1) return n;
            const k = R.key(b);
            if (memo.has(k)) return memo.get(k);
            let v = 0;
            if (solver.isSolvable(b)) {
                const kids = R.legalMoves(b).map((m) => R.applyMerge(b, m));
                const fine = kids.filter((c) => { const d = explainDead(R, c); return !d || d.level > limit; });
                const pool = fine.length ? fine : kids;
                for (const c of pool) v += p(c);
                v /= pool.length;
            }
            memo.set(k, v);
            return v;
        }
        return p(board);
    }

    // Difficulty metrics: follow the easiest human step from the start and record what it
    // needed, plus exact-search measures of how many merges are traps.
    function evaluate(R, board, options) {
        const o = Object.assign({ planCap: 50 }, DEFAULTS, options);
        const solver = o.solver || Solver.createSolver(R, { maxStates: o.maxStates || 300000 });
        const start = solver.analyze(board);
        const levelCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        const metrics = {
            status: start.status, solvable: start.status === 'solvable' || start.status === 'won',
            tiles: R.tileCount(board), firstMoves: start.moves.length,
            winningFirstMoves: start.moves.filter((m) => m.outcome === 'win').length,
            maxLevel: 0, levelCounts, cost: 0, span: 0, searchSteps: 0, decisionPoints: 0, trapRate: 0,
            uses: {}, path: [], randomWin: null, casualWin: null, plans: null,
        };
        if (start.status !== 'solvable') return metrics;
        let b = board, trapSum = 0;
        while (R.status(b) === 'playing') {
            const a = solver.analyze(b);
            const losing = a.moves.filter((m) => m.outcome === 'lose').length;
            trapSum += losing / a.moves.length;
            if (losing) metrics.decisionPoints++;
            const step = nextStep(R, b, Object.assign({}, o, { solver }));
            if (!step.move) break;
            const lv = step.level;
            levelCounts[lv]++;
            metrics.maxLevel = Math.max(metrics.maxLevel, lv);
            metrics.cost += step.cost;
            metrics.span = Math.max(metrics.span, step.span || 0);
            if (lv >= SEARCH) metrics.searchSteps++;
            for (const id of [step.technique].concat((step.refuted || []).map((r) => r.reason.id))) metrics.uses[id] = (metrics.uses[id] || 0) + 1;
            metrics.path.push({
                technique: step.technique, level: lv, cost: step.cost, span: step.span || 0, tiles: R.tileCount(b),
                move: step.move, traps: losing, options: a.moves.length,
            });
            b = R.applyMerge(b, step.move);
        }
        metrics.trapRate = metrics.path.length ? trapSum / metrics.path.length : 0;
        metrics.randomWin = solver.randomPlayWin(board);
        metrics.casualWin = casualWin(R, board, solver, 2);
        metrics.plans = solver.countPlans(board, o.planCap);
        return metrics;
    }

    return { SEARCH, LEVELS, COSTS, explainDead, forcedPairs, refute, candidates, nextStep, casualWin, evaluate };
});
