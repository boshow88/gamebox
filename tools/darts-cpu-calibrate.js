/* Seeded developer simulations: chosen target -> samples -> real human physics -> real Match rules. */
'use strict';
const assert = require('node:assert/strict');
const Rules = require('../js/games/darts-rules.js');
const Gesture = require('../js/games/darts-cpu-gesture.js');
const Strategy = require('../js/games/darts-cpu-strategy.js');
const physics = require('./helpers/darts-physics.js')();
const Difficulty = require('../js/games/darts-cpu-difficulty.js');
const cpu = Gesture.create(physics), levels = process.argv.includes('--all-levels') ? Difficulty.values : Object.keys(Difficulty.legacy);
const samples = 6000, games = 20, started = Date.now();
const pct = (n, total) => +(100 * n / Math.max(1, total)).toFixed(2);
const round = n => +n.toFixed(2);
const mean = values => values.reduce((sum, n) => sum + n, 0) / Math.max(1, values.length);
function quantile(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0; }
function actual(target, difficulty, rng) {
    const generated = cpu.generate(target, difficulty, rng), analysis = physics.analyseGesture(generated.samples);
    // Invalid input remains invalid. Nothing retries, changes the impact or rescales the score.
    if (!analysis.valid) return { result: Rules.hit(0, 0), impact: { x: 1e9, y: 1e9 }, invalid: true };
    const launch = physics.computeThrow(analysis), impact = physics.computeImpact(launch);
    return { result: Rules.scoreAt(impact.x, impact.y, physics.TUNING), impact, invalid: false };
}
function create(mode, ids = ['A', 'B'], extra = {}) {
    return Rules.create({ mode, startingScore: 301, turnMs: 0, roundLimit: 30,
        inRule: 'open', outRule: 'double', ...extra }, ids, 1000);
}
function ordinary() {
    return levels.map(difficulty => {
        const rng = Gesture.seeded('strategy-ordinary-' + difficulty), state = create('x01');
        state.scores.A = state.turnStartScore = 1000;
        const distribution = {}, targets = {}, turns = [];
        let total = 0, misses = 0, invalid = 0, accurate = 0, turn = 0, attempts = 0;
        for (let i = 0; i < samples;) {
            const target = Strategy.choose(state, 'A', difficulty, rng), dart = actual(target, difficulty, rng);
            attempts++;
            if (dart.invalid) { invalid++; continue; }
            total += dart.result.score; turn += dart.result.score;
            misses += Number(dart.result.miss);
            accurate += Number(dart.result.base === target.base && dart.result.mult === target.mult);
            distribution[dart.result.region] = (distribution[dart.result.region] || 0) + 1;
            targets[target.label] = (targets[target.label] || 0) + 1;
            if (++i % 3 === 0) { turns.push(turn); turn = 0; }
        }
        const ppr = total / samples * 3, turnSD = Math.sqrt(mean(turns.map(n => (n - ppr) ** 2)));
        turns.sort((a, b) => a - b);
        const margin = 1.96 * turnSD / Math.sqrt(turns.length);
        return { difficulty, darts: samples, PPR: round(ppr), PPR95CI: [round(ppr - margin), round(ppr + margin)],
            missPct: pct(misses, samples), invalidGesturePct: pct(invalid, attempts),
            intendedRegionPct: pct(accurate, samples), turnSD: round(turnSD), turnP10: quantile(turns, 0.1),
            turnMedian: quantile(turns, 0.5), turnP90: quantile(turns, 0.9),
            regionsPct: Object.fromEntries(Object.entries(distribution).map(([k, n]) => [k, pct(n, samples)])), targets };
    });
}
function simulate(mode, difficulties, seed, onDart, extra) {
    const ids = difficulties.map((_, i) => 'P' + i), rng = Gesture.seeded(seed);
    let state = create(mode, ids, extra), attempts = 0;
    while (state.status === 'playing' && attempts < 3000) {
        const id = state.active, index = ids.indexOf(id), target = Strategy.choose(state, id, difficulties[index], rng);
        assert(target, 'An eligible CPU must always find a target');
        const thrown = actual(target, difficulties[index], rng);
        attempts++;
        // Rejected input spends another thinking interval, as in the UI, and never becomes a scored dart.
        if (thrown.invalid) continue;
        const next = Rules.throwDart(state, id, thrown.result, 1000 + attempts * 1000, thrown.impact);
        assert(next, 'Real rules accept the active CPU only');
        if (onDart) onDart(state, next, id, thrown, target);
        state = next;
    }
    assert.notEqual(state.status, 'playing', 'Round limit/Cork must settle the simulated match');
    return state;
}
function x01() {
    return levels.map(difficulty => {
        let darts = 0, bust = 0, net = 0, attempts = 0, checkout = 0, normalEnd = 0, corkEnd = 0;
        for (let i = 0; i < games; i++) {
            const final = simulate('x01', [difficulty, difficulty], 'x01-' + difficulty + '-' + i, (s, next, id) => {
                if (s.phase === 'cork') return;
                darts++; net += s.scores[id] - next.scores[id];
                bust += Number(next.lastDart.reason === 'bust');
                const left = s.scores[id];
                attempts += Number(left === 50 || (left >= 2 && left <= 40 && left % 2 === 0));
                checkout += Number(next.lastDart.reason === 'checkout');
            });
            normalEnd += Number(final.endReason === 'checkout'); corkEnd += Number(final.endReason === 'cork');
        }
        return { difficulty, matches: games, darts, netGamePPR: round(net / darts * 3), bustPctPerDart: pct(bust, darts),
            doubleOpportunityConversionPct: pct(checkout, attempts), checkoutFinishes: normalEnd, corkFinishes: corkEnd,
            roundLimitFinishes: games - normalEnd - corkEnd };
    });
}
function checkoutAccuracy() {
    return levels.map(difficulty => {
        const rng = Gesture.seeded('fixed-d16-' + difficulty), targets = ['S20', 'T20', 'D16', 'BULL', 'OUTER BULL'];
        const rows = targets.map(label => {
            const target = label === 'S20' ? Strategy.target(20, 1) : label === 'T20' ? Strategy.target(20, 3) :
                label === 'D16' ? Strategy.target(16, 2) : Strategy.target(25, label === 'BULL' ? 2 : 1);
            let hits = 0, bust = 0, misses = 0;
            for (let i = 0; i < 1000;) {
                const dart = actual(target, difficulty, rng);
                if (dart.invalid) continue;
                i++;
                hits += Number(dart.result.base === target.base && dart.result.mult === target.mult);
                misses += Number(dart.result.miss);
                if (label === 'D16') {
                    const s = create('x01'); s.scores.A = s.turnStartScore = 32;
                    const next = Rules.throwDart(s, 'A', dart.result, 2000, dart.impact);
                    bust += Number(next.lastDart.reason === 'bust');
                }
            }
            return { target: label, intendedRegionPct: pct(hits, 1000), missPct: pct(misses, 1000),
                ...(label === 'D16' ? { oneDartCheckoutPct: pct(hits, 1000), bustPct: pct(bust, 1000) } : {}) };
        });
        return { difficulty, dartsPerTarget: 1000, targets: rows };
    });
}
function cricket() {
    const rows = [];
    for (const variant of ['standard', 'cutthroat']) for (const difficulty of levels) {
        let darts = 0, targetMarks = 0, closureMarks = 0, points = 0, penalties = 0, closures = 0;
        const closureDarts = [];
        for (let i = 0; i < 8; i++) {
            const ids = variant === 'cutthroat' ? [difficulty, difficulty, difficulty, difficulty] : [difficulty, difficulty];
            const counts = {}, recorded = new Set();
            simulate('cricket', ids, 'cricket-' + variant + '-' + difficulty + '-' + i, (s, next, id, thrown) => {
                if (s.phase === 'cork') return;
                darts++; counts[id] = (counts[id] || 0) + 1;
                if (Rules.TARGETS.includes(thrown.result.base)) targetMarks += thrown.result.mult;
                closureMarks += Rules.TARGETS.reduce((sum, n) => sum + next.marks[id][n] - s.marks[id][n], 0);
                if (variant === 'standard') points += next.scores[id] - s.scores[id];
                else penalties += s.players.reduce((sum, other) => sum + next.scores[other] - s.scores[other], 0);
                if (!recorded.has(id) && Rules.TARGETS.every(n => next.marks[id][n] === 3)) {
                    recorded.add(id); closureDarts.push(counts[id]); closures++;
                }
            }, { cricketVariant: variant });
        }
        rows.push({ variant, difficulty, matches: 8, playersPerMatch: variant === 'cutthroat' ? 4 : 2, darts,
            targetMPR: round(targetMarks / darts * 3), closureMPR: round(closureMarks / darts * 3),
            allTargetsClosed: closures, meanDartsToAllClosed: closureDarts.length ? round(mean(closureDarts)) : null,
            ownScoringPoints: points, opponentPenaltyPoints: penalties });
    }
    return rows;
}
function outcomes() {
    const rows = [];
    for (const variant of ['standard', 'cutthroat']) {
        for (let level = 1; level < levels.length; level++) {
            const lower = levels[level - 1], higher = levels[level];
            let strongerWins = 0;
            for (let i = 0; i < 12; i++) {
                const order = i % 2 ? [higher, lower] : [lower, higher];
                const final = simulate('cricket', order, 'matchup-' + variant + '-' + level + '-' + i, null, { cricketVariant: variant });
                strongerWins += Number(order[final.players.indexOf(final.winner)] === higher);
            }
            rows.push({ variant, lower, higher, matches: 12, higherWins: strongerWins, lowerWins: 12 - strongerWins });
        }
    }
    const field = levels.length === 16 ? Object.values(Difficulty.legacy) : levels;
    const wins = Object.fromEntries(field.map(d => [d, 0]));
    for (let i = 0; i < 12; i++) {
        const order = field.slice(i % 4).concat(field.slice(0, i % 4));
        const final = simulate('cricket', order, 'four-way-' + i, null, { cricketVariant: 'cutthroat' });
        wins[order[final.players.indexOf(final.winner)]]++;
    }
    return { pairs: rows, fourPlayerCutThroat: { matches: 12, wins } };
}
function cork() {
    const distances = {}, rows = levels.map(difficulty => {
        const rng = Gesture.seeded('strategy-cork-' + difficulty), values = [];
        let invalid = 0;
        for (let i = 0; i < samples; i++) {
            const dart = actual(Strategy.target(25, 2), difficulty, rng);
            if (dart.invalid) { invalid++; values.push(Infinity); }
            else values.push(Math.hypot(dart.impact.x, dart.impact.y));
        }
        distances[difficulty] = values.slice();
        const physical = values.filter(Number.isFinite).sort((a, b) => a - b);
        return { difficulty, gestureAttempts: samples, physicalDarts: physical.length, invalidGesturePct: pct(invalid, samples),
            meanMM: round(mean(physical)), medianMM: round(quantile(physical, 0.5)),
            p90MM: round(quantile(physical, 0.9)), nearBullPct: pct(physical.filter(n => n <= 15.9).length, physical.length),
            innerBullPct: pct(physical.filter(n => n <= 6.35).length, physical.length),
            boardMissPct: pct(physical.filter(n => n > 170).length, physical.length) };
    });
    const pairs = levels.slice(1).map((higher, i) => ({ lower: levels[i], higher, pairs: samples,
        higherNearerPct: pct(distances[higher].filter((n, j) => n < distances[levels[i]][j]).length, samples) }));
    return { physicalDistances: rows, adjacentSkillContests: pairs };
}
const report = {
    definition: { seedVersion: 1, difficultyCurvePower: Difficulty.curvePower, ordinaryErrorScale: Difficulty.ordinaryErrorScale, lapseSpreadMultiplier: Difficulty.lapseSpreadMultiplier, ordinaryPPR: 'Physical 25/50 points per accepted dart times three, 1000 remaining, Open In, no state updates or checkout pressure. Rejected gestures are reported separately; physical misses always count.',
        gamePPR: 'Net score reduction per actual ordinary dart times three, including negative Bust rollbacks; 301 Open In / Double Out, 30 rounds.',
        cricket: 'Target MPR includes physical Cricket marks; closure MPR counts only newly closed marks. Closure average excludes players who did not close all targets.',
        matchmaking: 'Developer-only seeded CPU simulations; no player-facing CPU-only mode; small matchup samples are descriptive.' },
    ordinary: ordinary(), x01Games: x01(), targetAccuracy: checkoutAccuracy(), cricket: cricket(),
    cricketOutcomes: outcomes(), cork: cork()
};
report.elapsedMs = Date.now() - started; report.calibrationCache = cpu.stats();
// Different seeds can reverse nearly equal low-level sample means. Treat a
// reversal as a failure only when their 95% intervals no longer overlap.
// Ordered profiles and common-seed progression are checked separately.
assert(report.ordinary.every((r, i, a) => !i || r.PPR95CI[1] >= a[i - 1].PPR95CI[0]), 'Adjacent ordinary PPR must not show a reversal beyond sampling uncertainty');
console.log(JSON.stringify(report, null, 2));
