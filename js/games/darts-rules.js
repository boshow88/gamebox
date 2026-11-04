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
    var FORFEIT_DISTANCE = 1000000000, CORK_TOLERANCE_MM = 0.001;
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function recordTurn(s, uid, reason, finished) {
        var soloPractice = s.mode === 'practice' && s.players.length === 1;
        if (soloPractice && !s.turnDarts.length) return;
        var history = s.history || [], entry = { uid: uid, leg: soloPractice ? 0 : s.leg, turn: soloPractice ? s.seq : s.round,
            round: s.phase === 'cork' ? s.corkRound : s.turns[uid] + 1,
            darts: soloPractice ? s.turnDarts.slice(-1) : (s.turnDarts || []).slice(),
            points: soloPractice ? s.turnDarts[s.turnDarts.length - 1].score : s.turnPoints,
            score: s.scores[uid], reason: reason, finished: soloPractice || finished, phase: s.phase,
            penalties: Object.assign({}, s.turnPenalties) };
        if (s.phase === 'cork') {
            entry.corkRound = s.corkRound;
            entry.distance = s.corkDistances[uid] < FORFEIT_DISTANCE ? s.corkDistances[uid] : null;
        }
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
    function nextPlayer(s, after, eligible) {
        var ids = contenders(s), start = s.players.indexOf(after);
        for (var i = 1; i <= s.players.length; i++) {
            var uid = s.players[(start + i) % s.players.length];
            if (ids.includes(uid) && (!eligible || eligible.includes(uid)) &&
                (s.phase === 'cork' || !s.roundLimit || s.turns[uid] < s.roundLimit)) return uid;
        }
        return null;
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
    function options(input, playerCount) {
        input = input || {};
        var mode = ['practice', '501', 'cricket', 'countup'].includes(input.mode) ? input.mode : 'practice';
        var legs = [1, 2, 3].includes(input.legsToWin) ? input.legsToWin : input.bestOf === 3 ? 2 : 1;
        var limits = mode === 'countup' ? [5, 8, 10, 15] : [0, 10, 15];
        var variant = ['standard', 'cutthroat'].includes(input.cricketVariant) ? input.cricketVariant : 'auto';
        if (variant === 'auto' && playerCount) variant = playerCount >= 3 ? 'cutthroat' : 'standard';
        return { mode: mode, legsToWin: mode === 'practice' ? 1 : legs, bestOf: mode === 'practice' ? 1 : legs * 2 - 1,
            turnMs: [0, 30000, 60000, 90000].includes(input.turnMs) ? input.turnMs : mode === 'practice' ? 0 : 60000,
            roundLimit: mode === 'practice' ? 0 : limits.includes(input.roundLimit) ? input.roundLimit : mode === 'countup' ? 8 : 15,
            inRule: ['open', 'master', 'double'].includes(input.inRule) ? input.inRule : 'open',
            outRule: ['open', 'master', 'double'].includes(input.outRule) ? input.outRule : 'double',
            bullMode: input.bullMode === '50-50' ? '50-50' : '25-50', cricketVariant: variant,
            settlement: 'score-then-cork', startingPlayer: 'random' };
    }
    function eligibility(input, count) {
        var mode = options(input).mode, min = mode === '501' || mode === 'cricket' ? 2 : 1;
        return { allowed: Number.isInteger(count) && count >= min && count <= 4,
            minPlayers: min, maxPlayers: 4, reason: count < min ? 'min-players' : count > 4 ? 'max-players' : null };
    }
    // Numeric scoring is configuration-dependent; the physical region/multiplier never changes.
    function scoreResult(config, result) {
        var r = normalize(result);
        if (['501', 'countup'].includes(config.mode) && config.bullMode === '50-50' && r.base === 25) r.score = 50;
        return r;
    }
    function qualifies(rule, r) {
        if (r.miss) return false;
        if (rule === 'open') return true;
        if (rule === 'master') return ['double', 'triple', 'bull', 'bullseye'].includes(r.region);
        return r.region === 'double' || r.region === 'bullseye';
    }
    function beginTurn(s, uid, at) {
        s.active = uid; s.dart = 0; s.turnPoints = 0; s.turnDarts = []; s.turnPenalties = {};
        s.turnStartScore = s.scores[uid]; s.turnStartEntered = !!s.entered[uid]; s.turnStartedAt = at;
    }
    function resetLeg(s, at) {
        s.scores = {}; s.marks = {}; s.turns = {}; s.stats = {}; s.entered = {};
        s.phase = 'play'; s.corkPlayers = []; s.corkDistances = {}; s.corkRound = 0;
        s.players.forEach(function (uid) {
            s.scores[uid] = s.mode === '501' ? 501 : 0;
            s.marks[uid] = Object.fromEntries(TARGETS.map(function (n) { return [n, 0]; }));
            s.turns[uid] = 0; s.entered[uid] = s.mode !== '501' || s.inRule === 'open';
            s.stats[uid] = { darts: 0, points: 0, bestRound: 0, bulls: 0, triple20s: 0 };
        });
        var index = (s.firstStarter + s.leg - 1) % s.players.length;
        var starter = nextPlayer(s, s.leg > 1 && s.legStarter ? s.legStarter : s.players[(index + s.players.length - 1) % s.players.length]);
        beginTurn(s, starter, at); s.legStarter = starter;
        s.readyAt = at; s.status = 'playing'; s.legWinner = null; s.draw = false; s.endReason = null; s.legEndReason = null;
        s.lastTurn = null; s.lastThrow = null; s.lastDart = null;
    }
    // Sanitise older/incomplete snapshots without consulting any mutable lobby settings.
    function snapshot(state) {
        var s = copy(state), config = options(s, s.players.length);
        // Older live 501/Cricket games had no cap. New matches still default to15.
        if (state.roundLimit == null && ['501', 'cricket'].includes(state.mode)) config.roundLimit = 0;
        Object.assign(s, config); s.phase = s.phase || 'play';
        s.entered = s.entered || Object.fromEntries(s.players.map(function (id) { return [id, s.inRule === 'open']; }));
        if (typeof s.turnStartEntered !== 'boolean') s.turnStartEntered = !!s.entered[s.active];
        s.turnPenalties = s.turnPenalties || {}; s.turnDarts = s.turnDarts || [];
        return s;
    }
    function create(input, players, at, firstStarter) {
        if (!Array.isArray(players) || players.length < 1 || players.length > 4 || new Set(players).size !== players.length ||
            players.some(function (uid) { return typeof uid !== 'string' || !uid; })) throw new Error('Darts needs one to four unique player slots');
        var s = Object.assign(options(input, players.length), { players: players.slice(), leg: 1, round: 1, seq: 0,
            firstStarter: Number.isInteger(firstStarter) && firstStarter >= 0 && firstStarter < players.length ? firstStarter : 0,
            withdrawn: [], history: [], historyDropped: 0,
            wins: Object.fromEntries(players.map(function (id) { return [id, 0]; })), winner: null });
        resetLeg(s, at || 0); return s;
    }
    function finishLeg(s, winner, reason) {
        if (s.stats[s.active]) s.stats[s.active].bestRound = Math.max(s.stats[s.active].bestRound, s.turnPoints);
        s.legWinner = winner; s.draw = winner === null; s.legEndReason = reason;
        if (winner) s.wins[winner]++;
        if (winner && s.wins[winner] >= s.legsToWin) { s.winner = winner; s.status = 'over'; s.endReason = reason; }
        else s.status = 'between';
    }
    function turnSummary(s, uid, reason) {
        var turn = { uid: uid, points: s.turnPoints, reason: reason, darts: s.turnDarts.slice(),
            phase: s.phase, penalties: Object.assign({}, s.turnPenalties) };
        if (s.phase === 'cork') {
            turn.corkRound = s.corkRound; turn.distance = s.corkDistances[uid] < FORFEIT_DISTANCE ? s.corkDistances[uid] : null;
        }
        return turn;
    }
    function startCork(s, tied, at) {
        s.phase = 'cork'; s.corkPlayers = tied.slice(); s.corkDistances = {}; s.corkRound = 1;
        var active = nextPlayer(s, s.active, tied);
        s.round++; beginTurn(s, active, at);
    }
    function lowerScoreWins(s) { return s.mode === '501' || (s.mode === 'cricket' && s.cricketVariant === 'cutthroat'); }
    function settleLimit(s, at) {
        var ids = contenders(s);
        if (!s.roundLimit || !ids.length || !ids.every(function (id) { return s.turns[id] >= s.roundLimit; })) return false;
        var scores = ids.map(function (id) { return s.scores[id]; });
        var best = (lowerScoreWins(s) ? Math.min : Math.max).apply(null, scores);
        var leaders = ids.filter(function (id) { return s.scores[id] === best; });
        if (leaders.length === 1) finishLeg(s, leaders[0], 'round-limit');
        else startCork(s, leaders, at);
        return true;
    }
    function endTurn(s, at, reason) {
        var uid = s.active;
        recordTurn(s, uid, reason, true); s.turns[uid]++;
        s.stats[uid].bestRound = Math.max(s.stats[uid].bestRound, s.turnPoints);
        s.lastTurn = turnSummary(s, uid, reason);
        if (settleLimit(s, at)) return;
        s.round++; beginTurn(s, nextPlayer(s, uid), at);
    }
    function endCorkTurn(s, at, reason) {
        var uid = s.active;
        if (!Number.isFinite(s.corkDistances[uid])) s.corkDistances[uid] = FORFEIT_DISTANCE;
        recordTurn(s, uid, reason, true); s.lastTurn = turnSummary(s, uid, reason);
        var ids = s.corkPlayers.filter(function (id) { return contenders(s).includes(id); });
        var pending = ids.filter(function (id) { return !Object.prototype.hasOwnProperty.call(s.corkDistances, id); });
        if (!pending.length) {
            var best = Math.min.apply(null, ids.map(function (id) { return s.corkDistances[id]; }));
            ids = ids.filter(function (id) { return Math.abs(s.corkDistances[id] - best) <= CORK_TOLERANCE_MM; });
            if (ids.length === 1) { finishLeg(s, ids[0], 'cork'); return; }
            s.corkRound++; s.corkPlayers = ids; s.corkDistances = {}; pending = ids;
        }
        s.round++; beginTurn(s, nextPlayer(s, uid, pending), at);
    }
    function cricketWins(s, uid) {
        return TARGETS.every(function (n) { return s.marks[uid][n] === 3; }) &&
            contenders(s).every(function (id) { return s.cricketVariant === 'cutthroat' ? s.scores[uid] <= s.scores[id] : s.scores[uid] >= s.scores[id]; });
    }
    function throwDart(state, uid, result, at, impact) {
        if (state.status !== 'playing' || state.active !== uid || !contenders(state).includes(uid)) return null;
        var s = snapshot(state), r = scoreResult(s, result), stats = s.stats[uid], reason = 'complete', penalties = {}, corkTie = null;
        at = at || 0; s.seq++; s.dart++; stats.darts++; s.turnDarts.push(r);
        if (r.base === 25) stats.bulls++;
        if (r.base === 20 && r.mult === 3) stats.triple20s++;
        if (s.phase === 'cork') {
            var distance = impact && Number.isFinite(impact.x) && Number.isFinite(impact.y) ? Math.hypot(impact.x, impact.y) : FORFEIT_DISTANCE;
            s.corkDistances[uid] = Math.min(distance, FORFEIT_DISTANCE);
            s.lastDart = { uid: uid, result: r, reason: 'cork', dart: 1, turnPoints: 0, phase: 'cork',
                corkRound: s.corkRound, distance: distance < FORFEIT_DISTANCE ? distance : null, penalties: {} };
            endCorkTurn(s, at, 'cork'); return s;
        }
        stats.points += r.score;
        if (s.mode === '501') {
            if (!s.entered[uid] && qualifies(s.inRule, r)) s.entered[uid] = true;
            if (s.entered[uid]) {
                var remaining = s.scores[uid] - r.score;
                if (remaining < 0 || (s.outRule !== 'open' && remaining === 1) || (remaining === 0 && !qualifies(s.outRule, r))) {
                    s.scores[uid] = s.turnStartScore; s.entered[uid] = s.turnStartEntered; s.turnPoints = 0; reason = 'bust';
                } else {
                    s.scores[uid] = remaining; s.turnPoints += r.score;
                    if (remaining === 0) { finishLeg(s, uid, 'checkout'); reason = 'checkout'; }
                }
            }
        } else if (s.mode === 'cricket') {
            if (TARGETS.includes(r.base)) {
                var previous = s.marks[uid][r.base], extra = Math.max(0, previous + r.mult - 3);
                s.marks[uid][r.base] = Math.min(3, previous + r.mult);
                var open = contenders(s).filter(function (id) { return id !== uid && s.marks[id][r.base] < 3; });
                if (open.length && extra) {
                    var points = extra * r.base; s.turnPoints += points;
                    if (s.cricketVariant === 'cutthroat') open.forEach(function (id) {
                        s.scores[id] += points; penalties[id] = points; s.turnPenalties[id] = (s.turnPenalties[id] || 0) + points;
                    });
                    else s.scores[uid] += points;
                }
            }
            // Cut-Throat penalties can lift an already-closed opponent into the lead.
            // Every eligible player participates in victory detection, including non-throwers.
            var winners = s.cricketVariant === 'cutthroat' ? contenders(s).filter(function (id) { return cricketWins(s, id); }) :
                cricketWins(s, uid) ? [uid] : [];
            if (winners.length === 1) {
                finishLeg(s, winners[0], 'closed');
                if (winners[0] === uid) reason = 'leg-won';
            } else if (winners.length > 1) corkTie = winners;
        } else { s.scores[uid] += r.score; s.turnPoints += r.score; }
        s.lastDart = { uid: uid, result: r, reason: reason, dart: s.dart, turnPoints: s.turnPoints, phase: 'play', penalties: penalties };
        recordTurn(s, uid, reason, !!corkTie || s.status !== 'playing' || reason === 'bust' || s.dart === 3);
        if (corkTie) {
            s.lastTurn = turnSummary(s, uid, reason); s.turns[uid]++;
            stats.bestRound = Math.max(stats.bestRound, s.turnPoints); startCork(s, corkTie, at); return s;
        }
        if (s.status === 'playing' && (reason === 'bust' || s.dart === 3)) endTurn(s, at, reason);
        return s;
    }
    function timeout(state, at) {
        if (state.status !== 'playing' || state.turnMs === 0) return null;
        var s = snapshot(state); s.seq++;
        if (s.phase === 'cork') endCorkTurn(s, at || 0, 'timeout'); else endTurn(s, at || 0, 'timeout');
        return s;
    }
    function nextLeg(state, at) {
        if (state.status !== 'between') return null;
        var s = snapshot(state); s.seq++; s.leg++; s.round++; resetLeg(s, at || 0); return s;
    }
    function withdrawMany(state, leaving, at) {
        if (!state || !['playing', 'between'].includes(state.status)) return null;
        var removed = contenders(state).filter(function (id) { return leaving.includes(id); });
        if (!removed.length) return null;
        var s = snapshot(state); s.seq++; s.withdrawn = (s.withdrawn || []).concat(removed);
        var ids = contenders(s), stamp = at || 0;
        if (!ids.length || (ids.length < 2 && s.mode !== 'practice')) {
            if (s.status === 'playing' && removed.includes(s.active)) recordTurn(s, s.active, 'left', true);
            s.status = 'over'; s.winner = s.mode === 'practice' ? null : ids[0] || null;
            s.legWinner = s.winner; s.draw = false; s.endReason = 'left'; s.legEndReason = 'left'; return s;
        }
        if (s.status !== 'playing') return s;
        if (s.phase === 'cork') {
            s.corkPlayers = s.corkPlayers.filter(function (id) { return ids.includes(id); });
            if (!s.corkPlayers.length) {
                // A device can own every tied slot. Reconsider the remaining field atomically.
                if (removed.includes(s.active)) recordTurn(s, s.active, 'left', true);
                s.phase = 'play'; s.corkDistances = {};
                if (!settleLimit(s, stamp)) { s.round++; beginTurn(s, nextPlayer(s, s.active), stamp); }
                return s;
            }
            if (s.corkPlayers.length === 1) {
                if (removed.includes(s.active)) recordTurn(s, s.active, 'left', true);
                finishLeg(s, s.corkPlayers[0], 'cork'); return s;
            }
            if (removed.includes(s.active)) endCorkTurn(s, stamp, 'left');
        } else {
            if (removed.includes(s.active)) endTurn(s, stamp, 'left');
            if (s.status === 'playing' && s.phase !== 'cork' && s.mode === 'cricket') {
                var winners = ids.filter(function (id) { return cricketWins(s, id); });
                if (winners.length === 1) finishLeg(s, winners[0], 'closed');
                else if (winners.length > 1) startCork(s, winners, stamp);
            }
            if (s.status === 'playing' && s.phase !== 'cork') settleLimit(s, stamp);
        }
        s.turnStartedAt = Math.max(s.turnStartedAt, s.readyAt || 0);
        return s;
    }
    function withdraw(state, uid, at) { return withdrawMany(state, [uid], at); }
    return { TARGETS: TARGETS, HISTORY_LIMIT: HISTORY_LIMIT, hit: hit, normalize: normalize, scoreAt: scoreAt,
        scoreResult: scoreResult, options: options, eligibility: eligibility, create: create, throwDart: throwDart,
        timeout: timeout, nextLeg: nextLeg, contenders: contenders, withdraw: withdraw, withdrawMany: withdrawMany };
});
