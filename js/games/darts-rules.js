/* Pure dartboard scoring and Dart -> Turn -> Leg -> Match rules. No DOM or input. */
(function (root, factory) {
    'use strict';
    var rules = factory();
    if (typeof module === 'object' && module.exports) module.exports = rules;
    else root.DartsRules = rules;
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
    var TARGETS = [20, 19, 18, 17, 16, 15, 25];
    var HISTORY_LIMIT = 500;
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function recordTurn(s, uid, reason, finished) {
        var history = s.history || [], entry = { uid: uid, leg: s.leg, turn: s.round,
            round: s.turns[uid] + 1, darts: (s.turnDarts || []).slice(), points: s.turnPoints,
            score: s.scores[uid], reason: reason, finished: finished };
        var last = history[history.length - 1];
        if (last && last.leg === entry.leg && last.turn === entry.turn && last.uid === uid) history[history.length - 1] = entry;
        else history.push(entry);
        if (history.length > HISTORY_LIMIT) {
            s.historyDropped = (s.historyDropped || 0) + history.length - HISTORY_LIMIT;
            history = history.slice(-HISTORY_LIMIT);
        }
        s.history = history;
    }
    function contenders(s) { return s.players.filter(function (id) { return !(s.withdrawn || []).includes(id); }); }
    function nextPlayer(s, after) {
        var ids = contenders(s), start = s.players.indexOf(after);
        for (var i = 1; i <= s.players.length; i++) {
            var uid = s.players[(start + i) % s.players.length];
            if (ids.includes(uid) && (s.mode !== 'countup' || s.turns[uid] < 8)) return uid;
        }
        return ids[0];
    }
    function hit(base, mult) {
        if (base === 25 && (mult === 1 || mult === 2)) return { base: 25, mult: mult, score: 25 * mult,
            region: mult === 2 ? 'bullseye' : 'bull', miss: false, label: mult === 2 ? 'BULL' : 'OUTER BULL' };
        if (Number.isInteger(base) && base >= 1 && base <= 20 && [1, 2, 3].includes(mult)) {
            return { base: base, mult: mult, score: base * mult, region: ['single', 'double', 'triple'][mult - 1],
                miss: false, label: ['S', 'D', 'T'][mult - 1] + base };
        }
        return { base: 0, mult: 0, score: 0, region: 'miss', miss: true, label: 'MISS' };
    }
    function normalize(result) {
        if (!result || result.miss) return hit(0, 0);
        if (result.region === 'bullseye') return hit(25, 2);
        if (result.region === 'bull') return hit(25, 1);
        return hit(result.base, result.mult);
    }
    function scoreAt(x, y, geometry) {
        var g = Object.assign({ rInnerBull: 6.35, rOuterBull: 15.9, rTripleInner: 99,
            rTripleOuter: 107, rDoubleInner: 162, rDoubleOuter: 170 }, geometry);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return hit(0, 0);
        var r = Math.hypot(x, y);
        if (r <= g.rInnerBull) return hit(25, 2);
        if (r <= g.rOuterBull) return hit(25, 1);
        if (r > g.rDoubleOuter) return hit(0, 0);
        var degrees = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
        var mult = r >= g.rDoubleInner ? 2 : r >= g.rTripleInner && r <= g.rTripleOuter ? 3 : 1;
        return hit(SECTORS[Math.round(degrees / 18) % 20], mult);
    }
    function options(input) {
        input = input || {};
        return { mode: ['501', 'cricket', 'countup'].includes(input.mode) ? input.mode : '501',
            bestOf: input.bestOf === 3 ? 3 : 1,
            turnMs: [30000, 60000, 90000].includes(input.turnMs) ? input.turnMs : 60000 };
    }
    function resetLeg(s, at) {
        s.scores = {}; s.marks = {}; s.turns = {}; s.stats = {};
        s.players.forEach(function (uid) {
            s.scores[uid] = s.mode === '501' ? 501 : 0;
            s.marks[uid] = Object.fromEntries(TARGETS.map(function (n) { return [n, 0]; }));
            s.turns[uid] = 0;
            s.stats[uid] = { darts: 0, points: 0, bestRound: 0, bulls: 0, triple20s: 0 };
        });
        var index = (s.firstStarter + s.leg - 1) % s.players.length;
        s.active = nextPlayer(s, s.leg > 1 && s.legStarter ? s.legStarter : s.players[(index + s.players.length - 1) % s.players.length]);
        s.legStarter = s.active;
        s.dart = 0; s.turnPoints = 0; s.turnStartScore = s.scores[s.active];
        s.turnStartedAt = at; s.readyAt = at; s.status = 'playing'; s.legWinner = null; s.draw = false;
        s.lastTurn = null; s.lastThrow = null; s.turnDarts = [];
    }
    function create(input, players, at, firstStarter) {
        if (!Array.isArray(players) || players.length < 1 || players.length > 4 || new Set(players).size !== players.length) throw new Error('Darts needs one to four players');
        var s = Object.assign(options(input), { players: players.slice(), leg: 1, round: 1, seq: 0,
            firstStarter: Number.isInteger(firstStarter) && firstStarter >= 0 && firstStarter < players.length ? firstStarter : 0,
            withdrawn: [],
            history: [], historyDropped: 0,
            wins: Object.fromEntries(players.map(function (id) { return [id, 0]; })), winner: null });
        resetLeg(s, at || 0); return s;
    }
    function finishLeg(s, winner) {
        s.stats[s.active].bestRound = Math.max(s.stats[s.active].bestRound, s.turnPoints);
        s.legWinner = winner; s.draw = winner === null;
        if (winner) s.wins[winner]++;
        if (winner && (s.players.length === 1 || s.wins[winner] >= (s.bestOf === 3 ? 2 : 1))) {
            s.winner = winner; s.status = 'over';
        } else s.status = 'between';
    }
    function endTurn(s, at, reason) {
        var uid = s.active;
        recordTurn(s, uid, reason, true);
        s.turns[uid]++;
        s.stats[uid].bestRound = Math.max(s.stats[uid].bestRound, s.turnPoints);
        s.lastTurn = { uid: uid, points: s.turnPoints, reason: reason, darts: (s.turnDarts || []).slice() };
        var ids = contenders(s);
        if (s.mode === 'countup' && ids.every(function (id) { return s.turns[id] >= 8; })) {
            var highest = Math.max.apply(null, ids.map(function (id) { return s.scores[id]; }));
            var leaders = ids.filter(function (id) { return s.scores[id] === highest; });
            finishLeg(s, leaders.length === 1 ? leaders[0] : null); return;
        }
        s.active = nextPlayer(s, uid);
        s.round++; s.dart = 0; s.turnPoints = 0; s.turnDarts = [];
        s.turnStartScore = s.scores[s.active]; s.turnStartedAt = at;
    }
    function throwDart(state, uid, result, at) {
        if (state.status !== 'playing' || state.active !== uid || !contenders(state).includes(uid)) return null;
        var s = copy(state), r = normalize(result), stats = s.stats[uid];
        s.seq++; s.dart++; stats.darts++; stats.points += r.score;
        s.turnDarts = (s.turnDarts || []).concat([r]);
        if (r.base === 25) stats.bulls++;
        if (r.base === 20 && r.mult === 3) stats.triple20s++;
        s.turnPoints += r.score;
        var reason = 'complete';
        if (s.mode === '501') {
            var remaining = s.scores[uid] - r.score;
            if (remaining < 0 || remaining === 1 || (remaining === 0 && r.mult !== 2)) {
                s.scores[uid] = s.turnStartScore; s.turnPoints = 0; reason = 'bust';
            } else {
                s.scores[uid] = remaining;
                if (remaining === 0) { finishLeg(s, uid); reason = 'checkout'; }
            }
        } else if (s.mode === 'cricket') {
            s.turnPoints -= r.score;
            if (TARGETS.includes(r.base)) {
                var previous = s.marks[uid][r.base], extra = Math.max(0, previous + r.mult - 3);
                s.marks[uid][r.base] = Math.min(3, previous + r.mult);
                if (contenders(s).some(function (id) { return id !== uid && s.marks[id][r.base] < 3; })) {
                    s.scores[uid] += extra * r.base; s.turnPoints += extra * r.base;
                }
            }
            if (TARGETS.every(function (n) { return s.marks[uid][n] === 3; }) &&
                contenders(s).every(function (id) { return s.scores[uid] >= s.scores[id]; })) finishLeg(s, uid);
        } else s.scores[uid] += r.score;
        s.lastDart = { uid: uid, result: r, reason: reason, dart: s.dart, turnPoints: s.turnPoints };
        recordTurn(s, uid, reason === 'complete' && s.status !== 'playing' ? 'leg-won' : reason,
            s.status !== 'playing' || reason === 'bust' || s.dart === 3);
        if (s.status === 'playing' && (reason === 'bust' || s.dart === 3)) endTurn(s, at || 0, reason);
        return s;
    }
    function timeout(state, at) {
        if (state.status !== 'playing') return null;
        var s = copy(state); s.seq++; endTurn(s, at || 0, 'timeout'); return s;
    }
    function nextLeg(state, at) {
        if (state.status !== 'between') return null;
        var s = copy(state); s.seq++; s.leg++; s.round++; resetLeg(s, at || 0); s.lastDart = null; return s;
    }
    function withdraw(state, uid, at) {
        if (!['playing', 'between'].includes(state.status) || !contenders(state).includes(uid)) return null;
        var s = copy(state); s.seq++; s.withdrawn = (s.withdrawn || []).concat([uid]);
        var ids = contenders(s);
        if (ids.length < 2) {
            s.status = 'over'; s.winner = ids[0] || null; s.legWinner = s.winner; s.draw = false; s.endReason = 'left'; return s;
        }
        if (s.status === 'playing') {
            if (s.active === uid) {
                endTurn(s, at || 0, 'left');
                s.turnStartedAt = Math.max(s.turnStartedAt, s.readyAt || 0);
            }
            // Closing/point eligibility can change when an opponent leaves.
            if (s.status === 'playing' && s.mode === 'countup' && ids.every(function (id) { return s.turns[id] >= 8; })) {
                var high = Math.max.apply(null, ids.map(function (id) { return s.scores[id]; }));
                var leaders = ids.filter(function (id) { return s.scores[id] === high; });
                finishLeg(s, leaders.length === 1 ? leaders[0] : null);
            } else if (s.status === 'playing' && s.mode === 'cricket') {
                var winner = ids.find(function (id) { return TARGETS.every(function (n) { return s.marks[id][n] === 3; }) &&
                    ids.every(function (other) { return s.scores[id] >= s.scores[other]; }); });
                if (winner) finishLeg(s, winner);
            }
        }
        return s;
    }
    return { TARGETS: TARGETS, HISTORY_LIMIT: HISTORY_LIMIT, hit: hit, normalize: normalize, scoreAt: scoreAt, options: options,
        create: create, throwDart: throwDart, timeout: timeout, nextLeg: nextLeg, contenders: contenders, withdraw: withdraw };
});
