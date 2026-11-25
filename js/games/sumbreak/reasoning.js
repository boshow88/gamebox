/* Sumbreak: human-oriented reasoning on top of the shared rules — explainable deductions, hint
 * steps and difficulty metrics. Exact search validates every recommendation and is labelled
 * as search whenever no technique explains a move. No DOM, no copy (the view words steps).
 *
 * Techniques (level = how hard the idea is for a person; 6 = exhaustive search):
 *   1 final       Two tiles left: merging them either way finishes.
 *   1 lone        A tile with a single neighbour holding the same value merges into it.
 *   1 only-pair   Only one pair on the board can merge, so it must merge now.
 *   2 forced-pair A tile whose other neighbours are all larger (they never shrink) and none a
 *                 ×2 can only ever pair with its one equal neighbour, and must do so before
 *                 either changes.
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
    else root.SumbreakReasoning = factory(root.SumbreakRules, root.SumbreakSolver);
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
    // A multiplier as the only partner is not forced: another number may use it first and
    // leave an equal number in its cell.
    function forcedPairs(R, board) {
        const out = [];
        const pairs = pairsOf(R.legalMoves(board));
        if (pairs.length === 1) out.push({ technique: 'only-pair', anchor: pairs[0].a, a: pairs[0].a, b: pairs[0].b });
        if (!R.numeric(board)) return out;
        for (const x of R.tiles(board)) {
            const cell = board.cells[x];
            if (cell.type !== 'num') continue;
            const partners = R.partners(board, x), y = board.cells[partners[0]];
            if (partners.length !== 1 || y.type !== 'num' || y.value !== cell.value) continue;
            const occupied = R.neighbors(board, x).filter((j) => R.isTile(board.cells[j]));
            out.push({ technique: occupied.length === 1 ? 'lone' : 'forced-pair', anchor: x, a: x, b: partners[0] });
        }
        return out;
    }

    // Reasoning state: the rules, options and per-position caches. Results cached here
    // depend only on the position, so one context can serve a whole path.
    function context(R, options) {
        const ctx = Object.assign({ R }, DEFAULTS, options);
        ctx.memo = ctx.memo || { dead: new Map(), follow: new Map() };
        return ctx;
    }
    function remember(map, k, make) {
        if (!map.has(k)) map.set(k, make());
        return map.get(k);
    }
    function deadOf(ctx, b) { return remember(ctx.memo.dead, ctx.R.key(b), () => explainDead(ctx.R, b)); }

    // Evidence that `move` loses, using contradictions up to `limit` (lookahead at 5). `span`
    // counts the merges a player has to picture to see it.
    function refute(ctx, board, move, limit) {
        const next = ctx.R.applyMerge(board, move);
        const dead = deadOf(ctx, next);
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
            const dead = deadOf(ctx, b);
            if (dead) return { moves, final: dead };
        }
        return null;
    }
    // The next merge forced at level ≤ 4: a forced pair with one surviving direction, or the
    // only merge that survives refutation. `dead` when the assumption already fails.
    function forcedFollowUp(ctx, b) { return remember(ctx.memo.follow, ctx.R.key(b), () => followUp(ctx, b)); }
    function followUp(ctx, b) {
        if (ctx.R.tileCount(b) <= 2) return null;
        for (const pair of forcedPairs(ctx.R, b)) {
            if (pair.technique === 'lone') return { move: { from: pair.a, to: pair.b } };
            const dirs = directions(ctx.R, b, pair);
            const alive = dirs.filter((m) => !refute(ctx, b, m, 4));
            if (!alive.length) {
                const v = valueAt(b, pair.a);
                if (v === null || v !== valueAt(b, pair.b)) return { dead: { id: 'no-survivor', level: LEVELS['no-survivor'], cells: ctx.R.tiles(b) } };
                return { dead: { id: 'pair-blocked', level: LEVELS['pair-blocked'], cells: [pair.a, pair.b], value: v } };
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

    // Steps a person could take from `board` other than trials, before validation against
    // exact search, and the merges no technique refutes. A step marked `verifiedBySearch`
    // claims every one of its alternatives wins, which only search can confirm.
    function deductions(ctx, board) {
        const out = [];
        for (const pair of forcedPairs(ctx.R, board)) {
            const step = resolvePair(ctx, board, pair);
            if (!step) continue;
            if (step.move) out.push(step);
            else out.push(Object.assign(step, { move: step.undecided[0], alternatives: step.undecided, freeDirection: true, verifiedBySearch: true, span: 0 }));
        }
        const legal = ctx.R.legalMoves(board);
        const refs = legal.map((m) => refute(ctx, board, m, ctx.maxLevel));
        const alive = legal.filter((m, i) => !refs[i]);
        const eliminated = refs.filter(Boolean);
        if (alive.length) {
            const level = eliminated.reduce((lv, r) => Math.max(lv, r.level), 1);
            const cost = eliminated.reduce((sum, r) => sum + r.cost, 1);
            const span = eliminated.reduce((n, r) => Math.max(n, r.span), 0);
            if (alive.length === 1) out.push({ technique: 'eliminate', level, cost, span, move: alive[0], eliminated, refuted: eliminated });
            else out.push({ technique: 'free', level, cost, span, move: alive[0], alternatives: alive, eliminated, refuted: eliminated, verifiedBySearch: true });
        }
        return { steps: out, alive };
    }
    function trials(ctx, board, alive) {
        const out = [];
        if (ctx.maxLevel < 5) return out;
        for (const move of alive) {
            const chain = confirm(ctx, board, move);
            if (chain) out.push({ technique: 'trial', level: LEVELS.trial, cost: COSTS.trial + chain.length, span: chain.length, move, chain, refuted: [] });
        }
        return out;
    }
    // Every step a person could take from `board`, unvalidated (see deductions).
    function candidates(R, board, options) {
        const ctx = context(R, options);
        const found = deductions(ctx, board);
        return found.steps.concat(trials(ctx, board, found.alive));
    }

    function rank(step) { return step.level * 1000 + (step.verifiedBySearch ? 100 : 0) + step.cost; }

    // The easiest valid step from `board`. Recommendations are always winning merges according
    // to exact search; when no technique applies the step is labelled `search` (listing every
    // winning merge unless `searchMoves` is false). Search only classifies the merges a
    // candidate depends on, easiest candidate first, and trials (level 5) are only looked for
    // when no easier step holds.
    function nextStep(R, board, options) {
        const o = Object.assign({ searchMoves: true }, DEFAULTS, options);
        const solver = o.solver || Solver.createSolver(R);
        const status = R.status(board);
        if (status === 'won') return { technique: 'won', level: 0, cost: 0, cells: [] };
        if (status === 'dead-end') return { technique: 'dead-end', level: 1, cost: 0, reason: explainDead(R, board) };
        if (R.tileCount(board) === 2) {
            const moves = R.legalMoves(board);
            return { technique: 'final', level: 1, cost: 1, span: 0, move: moves[0], alternatives: moves, pair: [moves[0].from, moves[0].to], validated: true };
        }
        const solvable = solver.isSolvable(board);
        if (solvable === false) {
            const reason = explainDead(R, board);
            return { technique: 'unsolvable', level: reason ? reason.level : SEARCH, cost: 0, reason, verifiedBySearch: !reason };
        }
        const validated = solvable === true, known = new Map();
        const outcome = (m) => {
            const k = Rules.moveKey(m);
            if (!known.has(k)) known.set(k, solver.classify(board, m));
            return known.get(k);
        };
        const holds = (s) => (s.verifiedBySearch
            ? s.alternatives.every((m) => outcome(m) === 'win')
            : outcome(s.move) === 'win' || (!validated && outcome(s.move) === 'unknown'));
        const best = (steps) => steps.sort((a, b) => rank(a) - rank(b)).find(holds);
        const ctx = context(R, o), found = deductions(ctx, board);
        const step = best(found.steps.filter((s) => s.level < 5))
            || best(found.steps.filter((s) => s.level >= 5).concat(trials(ctx, board, found.alive)));
        if (step) return Object.assign(step, { validated });
        if (!o.searchMoves) return { technique: 'search', level: SEARCH, cost: 0, move: null, verifiedBySearch: false, validated };
        const exact = solver.analyze(board);
        const wins = exact.moves.filter((m) => m.outcome === 'win').map((m) => ({ from: m.from, to: m.to }));
        if (!wins.length) return { technique: 'unknown', level: SEARCH, cost: 0, verifiedBySearch: false, validated: false };
        // Keep any pair a technique proved, so a hint can still explain that much.
        const pair = forcedPairs(R, board).find((p) => wins.some((m) => (m.from === p.a && m.to === p.b) || (m.from === p.b && m.to === p.a)));
        return {
            technique: 'search', level: SEARCH, cost: 0, move: wins[0], alternatives: wins, verifiedBySearch: true, validated: true,
            pair: pair ? [pair.a, pair.b] : null, pairTechnique: pair ? pair.technique : null, anchor: pair ? pair.anchor : null,
        };
    }

    // The easiest step from each position in turn. `complete` once a single tile is reached;
    // with `stopAtSearch` the walk ends at the first position no technique explains.
    function humanPath(R, board, options) {
        const o = Object.assign({}, DEFAULTS, options);
        o.solver = o.solver || Solver.createSolver(R);
        o.memo = o.memo || context(R, o).memo;
        if (o.stopAtSearch) o.searchMoves = false;
        const out = { steps: [], maxLevel: 0, searchSteps: 0, complete: false };
        let b = board;
        while (R.status(b) === 'playing') {
            const step = nextStep(R, b, o);
            if (step.technique === 'search') {
                out.searchSteps++;
                out.maxLevel = SEARCH;
                if (o.stopAtSearch) break;
            }
            if (!step.move) break;
            out.steps.push(step);
            out.maxLevel = Math.max(out.maxLevel, step.level);
            b = R.applyMerge(b, step.move);
        }
        out.complete = R.status(b) === 'won';
        return out;
    }

    // A position a player sees is lost at a glance: nothing can merge, or a contradiction of
    // level <= 2 (a stuck tile, rivals, an odd group).
    function visiblyLost(R, board) {
        if (R.tileCount(board) < 2) return false;
        if (!R.legalMoves(board).length) return true;
        const c = R.findContradiction(board);
        return !!c && (c.level || LEVELS[c.id] || 4) <= 2;
    }

    // Trial-and-error cost, the difficulty measure: the merges a player makes before solving
    // when trying the smallest tiles first, never making a merge whose result is visibly lost,
    // undoing when stuck and remembering positions already seen to fail. A merge's size is the
    // number it involves (a multiplier counts as the number it doubles); merges of equal size
    // are tried in board order, so the count is reproducible. Counting stops at `cap`. The
    // excess over the minimum (tiles − 1) is the number of merges made and undone.
    function mergeSize(b, m) {
        const src = b.cells[m.from];
        return (src.type === 'num' ? src.value : b.cells[m.to].value) || 0;
    }
    function trialMerges(R, board, cap) {
        const failed = new Set(), limit = cap || Infinity;
        let merges = 0;
        function dfs(b) {
            if (R.tileCount(b) <= 1) return true;
            const k = R.key(b);
            if (failed.has(k)) return false;
            const kids = [];
            for (const m of R.legalMoves(b)) {
                const next = R.applyMerge(b, m);
                if (!visiblyLost(R, next)) kids.push({ next, value: mergeSize(b, m) });
            }
            kids.sort((x, y) => x.value - y.value);
            for (const kid of kids) {
                if (merges >= limit) return false;
                merges++;
                if (dfs(kid.next)) return true;
            }
            failed.add(k);
            return false;
        }
        dfs(board);
        return Math.min(merges, limit);
    }

    // First-try win chance, the measure that separates Medium from Hard: a player who makes an
    // obvious merge whenever there is one (the first forced pair; a lone tile merges into its
    // partner, otherwise either direction whose result is not visibly lost) and otherwise picks
    // uniformly among merges whose result is not visibly lost, never undoing. Exact and
    // memoized by position. `solver` only skips positions it proves lost, so the value does not
    // depend on its budget.
    function firstTryWin(R, board, solver) {
        const memo = new Map();
        const fine = (b, moves) => { const ok = moves.filter((m) => !visiblyLost(R, R.applyMerge(b, m))); return ok.length ? ok : moves; };
        function choices(b) {
            const pair = forcedPairs(R, b)[0];
            if (!pair) return fine(b, R.legalMoves(b));
            return pair.technique === 'lone' ? [{ from: pair.a, to: pair.b }] : fine(b, directions(R, b, pair));
        }
        function chance(b) {
            const n = R.tileCount(b);
            if (n <= 1) return 1;
            if (n === 2) return R.legalMoves(b).length ? 1 : 0;
            const k = R.key(b);
            if (memo.has(k)) return memo.get(k);
            let p = 0;
            if (!solver || solver.isSolvable(b) !== false) {
                const moves = choices(b);
                for (const m of moves) p += chance(R.applyMerge(b, m));
                p = moves.length ? p / moves.length : 0;
            }
            memo.set(k, p);
            return p;
        }
        return chance(board);
    }

    return { SEARCH, LEVELS, COSTS, context, explainDead, visiblyLost, forcedPairs, refute, candidates, nextStep, humanPath, mergeSize, trialMerges, firstTryWin };
});
