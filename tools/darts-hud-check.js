/** node tools/darts-hud-check.js — accepted match results and presentation model. */
'use strict';
const assert = require('node:assert/strict');
const R = require('../js/games/darts-rules.js');
const H = require('../js/games/darts-hud.js');
const tr = (key, ...args) => [key, ...args];
const miss = R.hit(0, 0);
function model(state, effects) {
    return H.model({ state, effects, name: id => 'Name ' + id, now: 1000, you: 'You' });
}
function dart(s, result, impact) {
    const next = R.throwDart(s, s.active, result, 1000 + s.seq, impact);
    assert.ok(next, 'The fixture must be an accepted throw');
    return next;
}
function play(s, result) {
    let count = 0;
    while (s.status === 'playing' && s.phase === 'play') {
        assert.ok(++count <= 200, 'The fixture must reach a result or Cork');
        s = dart(s, result(s));
    }
    return s;
}
function expected(s, key, ...args) {
    const before = JSON.stringify(s), m = model(s);
    assert.deepEqual(H.resultReason(m, tr), [key, ...args]);
    assert.equal(JSON.stringify(s), before, 'Building and explaining a model cannot mutate accepted state');
    return m;
}

// A real Double-Out checkout, either a Leg result or the final Match result.
for (const legsToWin of [1, 2]) {
    let s = R.create({ mode: '501', legsToWin, outRule: 'double', roundLimit: 10 }, ['A', 'B'], 1000);
    const plan = Array(8).fill(R.hit(20, 3)).concat(R.hit(1, 1), R.hit(10, 2));
    s = play(s, state => state.active === 'A' ? plan.shift() || miss : miss);
    assert.equal(s.status, legsToWin === 1 ? 'over' : 'between');
    assert.equal(s.legWinner, 'A'); assert.equal(s.scores.A, 0);
    const m = expected(s, 'dartsResultCheckout');
    assert.equal(m.winner, 'A'); assert.equal(m.legEndReason, 'checkout');
    assert.equal(m.endReason, legsToWin === 1 ? 'checkout' : null);
    assert.equal(m.legsToWin, legsToWin);
    if (s.status === 'between') {
        s = R.nextLeg(s, 2000);
        assert.equal(s.legEndReason, null); assert.equal(s.legWinner, null);
        assert.deepEqual(H.resultReason(model(s), tr), '', 'A new Leg cannot retain the previous victory explanation');
    }
}

// Each cap is reached through complete accepted turns, with one clear leader.
for (const legsToWin of [1, 2]) {
    for (const [mode, variant, key] of [
        ['501', 'standard', 'dartsResult501Limit'],
        ['cricket', 'standard', 'dartsResultStandardLimit'],
        ['cricket', 'cutthroat', 'dartsResultCutthroatLimit'],
        ['countup', 'standard', 'dartsResultCountup'],
    ]) {
        const roundLimit = mode === 'countup' ? 5 : 10;
        let s = R.create({ mode, legsToWin, cricketVariant: variant, roundLimit }, ['A', 'B'], 1000);
        s = play(s, state => state.active === 'A' && state.stats.A.darts < (mode === 'cricket' ? 4 : 1) ? R.hit(20, 1) : miss);
        assert.equal(s.status, legsToWin === 1 ? 'over' : 'between');
        assert.equal(s.legWinner, 'A'); assert.equal(s.legEndReason, 'round-limit');
        assert.equal(s.turns.A, roundLimit); assert.equal(s.turns.B, roundLimit);
        expected(s, key, roundLimit, s.scores.A);
    }
}

// Closing with a tied score is sufficient in both Cricket variants.
for (const legsToWin of [1, 2]) {
    for (const cricketVariant of ['standard', 'cutthroat']) {
        let s = R.create({ mode: 'cricket', cricketVariant, legsToWin }, ['A', 'B'], 1000);
        const plan = [20, 19, 18, 17, 16, 15].map(base => R.hit(base, 3)).concat(R.hit(25, 2), R.hit(25, 1));
        s = play(s, state => state.active === 'A' ? plan.shift() || miss : miss);
        assert.equal(s.status, legsToWin === 1 ? 'over' : 'between');
        assert.equal(s.scores.A, s.scores.B); assert.equal(s.legWinner, 'A');
        expected(s, cricketVariant === 'standard' ? 'dartsResultStandardClosed' : 'dartsResultCutthroatClosed', 0);
    }
}

// A tied numeric cap is decided by actual impact distance, never by numeric score.
for (const legsToWin of [1, 2]) {
    for (const mode of ['501', 'cricket', 'countup']) {
        let s = R.create({ mode, legsToWin, roundLimit: mode === 'countup' ? 5 : 10 }, ['A', 'B'], 1000);
        s = play(s, () => miss);
        assert.equal(s.phase, 'cork'); assert.equal(s.status, 'playing');
        s = dart(s, miss, { x: 6, y: 8 });
        const closest = s.lastDart.uid;
        s = dart(s, miss, { x: 12, y: 16 });
        assert.equal(s.status, legsToWin === 1 ? 'over' : 'between');
        assert.equal(s.legWinner, closest); assert.equal(s.scores.A, s.scores.B);
        const reasonKey = R.isX01(mode) ? 'dartsResultLimitCork' : 'dartsResultCork';
        const args = R.isX01(mode) ? [10, '10.0 mm'] : ['10.0 mm'];
        const m = expected(s, reasonKey, ...args);
        assert.equal(m.winnerDistance, 10);
        m.winnerDistance = 1e9;
        assert.deepEqual(H.resultReason(m, tr), [reasonKey, ...(R.isX01(mode) ? [10, ''] : [''])], 'A forfeited distance cannot be presented as a physical landing');
    }
}

// Bust retains actual darts and the restored score while the accepted active slot advances.
let s = R.create({ mode: '501', outRule: 'double' }, ['A', 'B'], 1000);
const bustPlan = Array(7).fill(R.hit(20, 3)).concat(R.hit(17, 3), R.hit(2, 1), R.hit(25, 1), R.hit(2, 2));
while (!s.lastDart || s.lastDart.reason !== 'bust') s = dart(s, s.active === 'A' ? bustPlan.shift() || miss : miss);
assert.equal(s.scores.A, 28); assert.equal(s.active, 'B');
const effects = { penalties: {}, notice: { kind: 'bust', player: 'A', restoredScore: s.scores.A, key: 'bust-event' } };
let m = model(s, effects);
assert.equal(m.players.find(p => p.id === 'A').score, 28);
assert.equal(m.turn.owner, 'A'); assert.equal(m.turn.previous, true); assert.equal(m.turn.points, 0);
assert.equal(m.turn.darts.length, 2); assert.equal(m.feedback.reason, 'bust');
assert.equal(m.effects.notice.restoredScore, 28);
assert.deepEqual(H.resultReason(m, tr), '');

// All three Cut-Throat recipients are retained exactly as accepted, separately from the thrower.
s = R.create({ mode: 'cricket', cricketVariant: 'cutthroat' }, ['A', 'B', 'C', 'D'], 1000);
s = dart(s, R.hit(20, 3)); s = dart(s, R.hit(20, 1));
const penaltyEffects = { penalties: Object.assign({}, s.lastDart.penalties), eventKey: 'penalty-event' };
m = model(s, penaltyEffects);
assert.deepEqual(m.effects.penalties, { B: 20, C: 20, D: 20 });
assert.equal(m.players.find(p => p.id === 'A').score, 0);
assert.deepEqual(m.players.slice(1).map(p => p.score), [20, 20, 20]);
assert.deepEqual(m.feedback.penalties, m.effects.penalties);
assert.equal(model(s, { penalties: {} }).players[1].score, 20, 'Effect expiry cannot roll back an accepted score');

// Departures, deliberate Practice end, and cancellation keep their distinct behavior.
s = R.withdraw(R.create({ mode: '501' }, ['A', 'B'], 1000), 'B', 2000);
expected(s, 'dartsLeft');
s = R.endPractice(dart(R.create({ mode: 'practice' }, ['A'], 1000), R.hit(20, 1)));
assert.equal(model(s).endReason, 'practice-ended'); assert.equal(model(s).winner, null);
assert.equal(H.resultReason(model(s), tr), '');
m = model(s); m.endReason = 'cancelled'; m.legEndReason = null;
assert.equal(H.resultReason(m, tr), '');
m.draw = true; m.endReason = null; m.legEndReason = 'round-limit';
assert.equal(H.resultReason(m, tr), '');

// Cork rows identify current-round eligibility and retain meaningful prior distances.
for (const purpose of ['opening', 'tie', 'limit']) {
    const ids = ['A', 'B', 'C', 'D'];
    let state = R.create({ mode: 'x01', startingPlayer: purpose === 'opening' ? 'cork' : 'random',
        settlement: purpose === 'limit' ? 'cork' : 'score-then-cork', roundLimit: 10, legsToWin: 2 }, ids, 1000);
    if (purpose !== 'opening') {
        state.players.forEach(id => { state.turns[id] = 9; });
        for (let i = 0; i < 12; i++) state = dart(state, miss);
    }
    assert.equal(state.corkPurpose, purpose);
    let view = model(state);
    assert.equal(view.round, 0, 'Cork cannot look like another ordinary X01 round');
    assert.deepEqual(view.cork.eligible, ids); assert.equal(view.cork.rethrow, false);
    assert(view.cork.entries.every(entry => entry.status === 'waiting' && entry.distance === null));
    const before = JSON.stringify(state);
    model(state); assert.equal(JSON.stringify(state), before, 'Cork comparison views cannot modify accepted state');
    for (const impact of [{ x: 3, y: 4 }, { x: 5, y: 0 }, { x: 12, y: 5 }, { x: 30, y: 40 }]) state = dart(state, miss, impact);
    view = model(state);
    assert.equal(view.cork.round, 2); assert.equal(view.cork.rethrow, true);
    assert.deepEqual(view.cork.eligible, ['A', 'B']);
    assert.deepEqual(view.cork.entries.map(entry => entry.status), ['rethrow', 'rethrow', 'excluded', 'excluded']);
    assert.deepEqual(view.cork.entries.map(entry => entry.previousDistance), [5, 5, 13, 50]);
    assert.deepEqual(view.cork.entries.map(entry => entry.lastDistance), [5, 5, 13, 50]);
    assert.equal(view.cork.entries.filter(entry => entry.active).length, 1);
    assert.equal(view.cork.entries.find(entry => entry.active).id, state.active);
    state = dart(state, miss, { x: 6, y: 8 });
    view = model(state);
    assert.equal(view.cork.entries[0].status, 'thrown'); assert.equal(view.cork.entries[0].distance, 10);
    assert.equal(view.cork.entries[1].status, 'rethrow'); assert.equal(view.cork.entries[1].previousDistance, 5);
    state = dart(state, miss, { x: 10, y: 0 });
    view = model(state);
    assert.equal(view.cork.round, 3); assert.deepEqual(view.cork.eligible, ['A', 'B']);
    assert.deepEqual(view.cork.entries.map(entry => entry.lastDistance), [10, 10, 13, 50], 'Consecutive ties update only the eligible players’ comparison distances');
    state = dart(state, miss, { x: 1, y: 0 }); state = dart(state, miss, { x: 2, y: 0 });
    view = model(state);
    if (purpose === 'opening') {
        assert.equal(state.phase, 'play'); assert.equal(view.cork, null);
        assert.equal(state.active, 'A'); assert.equal(view.round, 1);
    } else {
        assert.equal(state.status, 'between'); assert.equal(view.cork.entries[0].distance, 1);
        assert.equal(view.cork.entries[1].distance, 2); assert.equal(view.winnerDistance, 1);
        assert.equal(view.cork.entries[2].status, 'excluded');
    }
}
{
    let state = R.create({ mode: 'x01', startingPlayer: 'cork', turnMs: 30000 }, ['A', 'B'], 1000);
    state = R.timeout(state, 31000);
    const view = model(state);
    assert.equal(view.cork.entries[0].status, 'forfeited');
    assert.equal(view.cork.entries[0].distance, null, 'A timed-out sentinel is never a displayed physical distance');
    assert.equal(view.cork.entries[1].status, 'waiting'); assert.equal(view.cork.entries[1].active, true);
    assert.equal(view.round, 0);
}

console.log('PASS: accepted results, scoring history, Cork context/eligibility and repeated-tie distance comparisons.');
