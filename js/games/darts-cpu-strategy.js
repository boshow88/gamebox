/* CPU tactics select physical targets only. Throwing errors and results belong to the shared physics/rules. */
(function (root, factory) {
    'use strict';
    var strategy = factory();
    if (typeof module === 'object' && module.exports) module.exports = strategy;
    else root.DartsCpuStrategy = strategy;
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
    var CRICKET = [20, 19, 18, 17, 16, 15, 25];
    var DIFFICULTIES = ['easy', 'normal', 'hard', 'insane'];
    // These are tactical limits, independent of the gesture execution profiles.
    var LOOKAHEAD = { easy: 1, normal: 2, hard: 3, insane: 3 };
    var DOUBLES = [16, 20, 8, 12, 18, 10, 4, 6, 14, 2];
    function target(base, mult) {
        if (base === 25 && (mult === 1 || mult === 2)) {
            return { x: 0, y: mult === 2 ? 0 : 11, label: mult === 2 ? 'BULL' : 'OUTER BULL', base: base, mult: mult };
        }
        var index = SECTORS.indexOf(base);
        if (index < 0 || ![1, 2, 3].includes(mult)) return null;
        var angle = index * Math.PI / 10, radius = mult === 3 ? 103 : mult === 2 ? 166 : 132;
        return { x: Math.sin(angle) * radius, y: Math.cos(angle) * radius,
            label: ['S', 'D', 'T'][mult - 1] + base, base: base, mult: mult };
    }
    var ALL = [];
    [1, 2, 3].forEach(function (mult) {
        for (var n = 1; n <= 20; n++) ALL.push(target(n, mult));
    });
    ALL.push(target(25, 1), target(25, 2));
    function points(t, state) { return t.base === 25 && state.bullMode === '50-50' ? 50 : t.base * t.mult; }
    function qualifies(rule, t) {
        if (rule === 'open') return true;
        if (rule === 'master') return t.mult > 1 || t.base === 25;
        return t.mult === 2;
    }
    function random(rng) {
        var value = rng();
        return Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0.5;
    }
    function ordinary(state, difficulty, rng) {
        if (difficulty === 'easy') {
            var roll = random(rng);
            return target(roll < 0.65 ? 20 : roll < 0.86 ? 18 : roll < 0.94 ? 14 : 11, 1);
        }
        // A 50/50 Bull creates a broad 50-point bed: measured gesture EV beats T20 for the stronger tiers.
        var bull = difficulty === 'normal' || state.bullMode === '50-50';
        return target(bull ? 25 : 20, bull ? 2 : 3);
    }
    function doublePreference(t) {
        var index = DOUBLES.indexOf(t.base);
        return t.base === 25 ? 0.3 : index < 0 ? 0.18 : index * 0.012;
    }
    function effort(t, finishing, difficulty) {
        // Wide single beds are easier to set up than narrow rings; preferred doubles leave useful splits after a miss.
        var cost = t.base === 25 ? (t.mult === 2 ? 1.55 : 1.10) : t.mult === 1 ? 0.45 : t.mult === 2 ? 1.25 : 1.35;
        if (difficulty === 'easy' && t.mult > 1) cost += 0.25;
        if (finishing && t.mult === 2) cost += doublePreference(t);
        if (finishing && t.base === 25 && t.mult === 1) cost -= 0.05;
        return cost;
    }
    function step(state, remaining, entered, t) {
        if (!entered && !qualifies(state.inRule || 'open', t)) return null;
        var left = remaining - points(t, state), out = state.outRule || 'double';
        if (left < 0 || (out !== 'open' && left === 1) || (left === 0 && !qualifies(out, t))) return null;
        return left;
    }
    function checkout(state, remaining, darts, entered, difficulty) {
        var memo = Object.create(null);
        function find(left, count, isEntered) {
            if (left > count * 60 || count < 1) return null;
            var key = left + ':' + count + ':' + isEntered;
            if (Object.prototype.hasOwnProperty.call(memo, key)) return memo[key];
            var best = null;
            ALL.forEach(function (t) {
                var rest = step(state, left, isEntered, t);
                if (rest === null) return;
                var tail = rest === 0 ? { cost: 0, length: 0 } : count > 1 ? find(rest, count - 1, true) : null;
                if (!tail) return;
                var candidate = { target: t, length: tail.length + 1,
                    cost: effort(t, rest === 0, difficulty) + tail.cost };
                // Finish promptly, then choose a simple route rather than chasing maximum dart scores.
                if (!best || candidate.length < best.length || (candidate.length === best.length && candidate.cost < best.cost)) best = candidate;
            });
            memo[key] = best;
            return best;
        }
        return find(remaining, darts, entered);
    }
    function x01(state, uid, difficulty, rng) {
        var remaining = Number(state.scores[uid]), darts = Math.max(1, 3 - (state.dart || 0));
        if (!Number.isFinite(remaining) || remaining <= 0) return null;
        var entered = !state.entered || !!state.entered[uid] || state.inRule === 'open';
        var route = checkout(state, remaining, Math.min(darts, LOOKAHEAD[difficulty]), entered, difficulty);
        if (route) return Object.assign({}, route.target);
        var preferred = ordinary(state, difficulty, rng), safe = step(state, remaining, entered, preferred);
        // Until entry, aim at an actual qualifying physical region, regardless of numeric Bull configuration.
        if (!entered) {
            var gate = (state.inRule || 'open') === 'double' ? target(difficulty === 'easy' ? 16 : 20, 2) :
                target(difficulty === 'easy' ? 20 : difficulty === 'normal' ? 25 : 20, difficulty === 'normal' ? 2 : 3);
            if (step(state, remaining, false, gate) !== null) return gate;
        }
        if (safe !== null && remaining > (difficulty === 'easy' ? 60 : 170)) return preferred;
        var best = null, out = state.outRule || 'double';
        ALL.forEach(function (t) {
            var left = step(state, remaining, entered, t);
            if (left === null) return;
            // Prefer a reachable next-dart finish and a conventional double for the following turn.
            var finish = checkout(state, left, Math.min(Math.max(1, darts - 1), LOOKAHEAD[difficulty]), true, difficulty);
            var direct = checkout(state, left, 1, true, difficulty);
            var utility = points(t, state) * 0.045 - effort(t, false, difficulty);
            if (out !== 'open' && direct) utility += 8 - effort(direct.target, true, difficulty);
            if (finish) utility += 3.5 - finish.cost * 0.2;
            if (left > 0 && left <= 40 && left % 2 === 0 && out === 'double') utility += 0.8;
            if (t.label === preferred.label) utility += 0.4;
            if (!best || utility > best.utility) best = { target: t, utility: utility };
        });
        // An impossible inherited remainder of one deliberately busts, allowing the normal turn rollback.
        return best ? Object.assign({}, best.target) : target(1, 1);
    }
    function marks(state, uid, n) { return Math.max(0, Math.min(3, Number((state.marks[uid] || {})[n]) || 0)); }
    function closed(state, uid) { return CRICKET.every(function (n) { return marks(state, uid, n) === 3; }); }
    function cricket(state, uid, difficulty, rng) {
        var opponents = state.players.filter(function (id) { return id !== uid && !(state.withdrawn || []).includes(id); });
        if (!opponents.length) return null;
        var cut = state.cricketVariant === 'cutthroat', own = Number(state.scores[uid]) || 0;
        var leading = cut ? Math.min.apply(null, opponents.map(function (id) { return Number(state.scores[id]) || 0; })) >= own :
            Math.max.apply(null, opponents.map(function (id) { return Number(state.scores[id]) || 0; })) <= own;
        var useful = [], otherOpen = CRICKET.filter(function (n) { return marks(state, uid, n) < 3; });
        CRICKET.forEach(function (n) {
            var previous = marks(state, uid, n), needed = 3 - previous;
            var open = opponents.filter(function (id) { return marks(state, id, n) < 3; });
            if (!needed && !open.length) return;
            var multipliers = n === 25 ? [1, 2] : difficulty === 'easy' ? [1] : [1, 3];
            multipliers.forEach(function (mult) {
                var t = target(n, mult), gain = Math.min(needed, mult), extra = Math.max(0, previous + mult - 3);
                var closes = needed > 0 && gain === needed;
                var score = gain * (difficulty === 'insane' ? 7 : 6) + (closes ? 9 : 0);
                // Closing a number on which an opponent can already score also protects against future darts.
                if (needed) score += opponents.filter(function (id) { return marks(state, id, n) === 3; }).length * (cut ? 5 : 3);
                if (open.length && extra) {
                    if (cut) {
                        var threatened = open.filter(function (id) { return (Number(state.scores[id]) || 0) <= own; });
                        score += extra * n * (leading ? 0.08 * open.length : 0.55 * threatened.length + 0.04 * open.length);
                    } else score += extra * n * (leading ? 0.07 : 0.9);
                }
                if (closes && otherOpen.length === 1 && leading) score += 1000;
                // Never knowingly award an already-closed Cut-Throat opponent the game.
                if (cut && open.length && extra) {
                    var nextScores = {};
                    state.players.forEach(function (id) { nextScores[id] = (Number(state.scores[id]) || 0) + (open.includes(id) ? extra * n : 0); });
                    if (opponents.some(function (id) { return closed(state, id) && state.players.every(function (other) {
                        return (state.withdrawn || []).includes(other) || nextScores[id] <= nextScores[other];
                    }); })) score -= 10000;
                }
                useful.push({ target: t, utility: score + n * 0.002 - effort(t, false, difficulty) * 0.1,
                    needed: needed, attack: !needed && open.length > 0 });
            });
        });
        if (!useful.length) return null;
        if (difficulty === 'easy') {
            var unfinished = useful.filter(function (item) { return item.needed; });
            var attacking = useful.filter(function (item) { return item.attack; });
            var choices = !leading && attacking.length && random(rng) < 0.4 ? attacking : unfinished.length ? unfinished : useful;
            return Object.assign({}, choices[random(rng) < 0.18 ? Math.floor(random(rng) * choices.length) : 0].target);
        }
        useful.sort(function (a, b) { return b.utility - a.utility; });
        var index = difficulty === 'normal' && useful.length > 1 && random(rng) < 0.08 ? 1 : 0;
        return Object.assign({}, useful[index].target);
    }
    function choose(state, uid, difficulty, rng) {
        if (!state || state.status !== 'playing' || state.active !== uid || !Array.isArray(state.players) ||
            !state.players.includes(uid) || (state.withdrawn || []).includes(uid)) return null;
        difficulty = DIFFICULTIES.includes(difficulty) ? difficulty : 'normal';
        rng = typeof rng === 'function' ? rng : Math.random;
        if (state.phase === 'cork') return (state.corkPlayers || []).includes(uid) ? target(25, 2) : null;
        if (state.mode === 'x01' || state.mode === '501') return x01(state, uid, difficulty, rng);
        if (state.mode === 'countup') return ordinary(state, difficulty, rng);
        if (state.mode === 'cricket') return cricket(state, uid, difficulty, rng);
        return null;
    }
    return { choose: choose, target: target, DIFFICULTIES: DIFFICULTIES.slice() };
});
