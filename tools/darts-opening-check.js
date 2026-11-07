/** Pure first-starter presentation checks. Selection, scoring and later Leg rotation stay in Rules. */
'use strict';
const assert = require('node:assert/strict');
const Rules = require('../js/games/darts-rules.js');
const Opening = require('../js/games/darts-opening.js');
const Feedback = require('../js/games/darts-feedback.js');
const total = Opening.TIMING.draw + Opening.TIMING.reveal;
for (const count of [2, 3, 4]) for (let index = 0; index < count; index++) {
    const ids = ['A', 'B', 'C', 'D'].slice(0, count);
    const state = Rules.create({ mode: 'countup', turnMs: 30000 }, ids, 1000, index);
    const active = state.active, scores = JSON.stringify(state.scores);
    state.matchId = 'random-' + count + '-' + index;
    Opening.prepare(state);
    assert.equal(state.active, active); assert.equal(state.openingDraw.player, active);
    assert.equal(state.readyAt, 1000 + total); assert.equal(state.turnStartedAt, state.readyAt);
    assert.equal(JSON.stringify(state.scores), scores);
    assert.equal(Opening.prepare(state).readyAt, 1000 + total, 'Repeated preparation cannot restart the animation');
    const visited = new Set();
    for (let elapsed = 0; elapsed < Opening.TIMING.draw; elapsed += 30) visited.add(Opening.model(state, 1000 + elapsed).player);
    assert.equal(visited.size, count, 'Every participant can be seen during the draw');
    assert.equal(Opening.model(state, 1000 + Opening.TIMING.draw).player, active);
    assert.equal(Opening.model(state, state.readyAt - 1).drawing, false);
    assert.equal(Opening.model(state, state.readyAt), null);
    const reduced = Opening.model(state, 1000, true);
    assert.equal(reduced.drawing, false); assert.equal(reduced.player, active);
    const first = Feedback.create(), second = Feedback.create();
    for (const at of [1000, 1200, 1700, 2000, state.readyAt - 1]) {
        assert.deepEqual(first.update(state, { now: at }), second.update(state, { now: at }), 'Clients derive the same presentation from accepted timestamps');
        assert.equal(first.snapshot(at).blocking, true);
    }
    assert.equal(first.snapshot(state.readyAt).blocking, false);
    assert.equal(first.update(state, { now: state.readyAt + 500 }).opening, null, 'Repeated snapshots cannot replay the draw');
    const late = Feedback.create(); assert.equal(late.update(state, { now: state.readyAt + 1 }).opening, null);
    assert.equal(Opening.model({ ...state, seq: 1 }, 1200), null);
    assert.equal(Opening.model({ ...state, active: ids[(index + 1) % count] }, 1200), null);
    assert.equal(Opening.model({ ...state, leg: 2 }, 1200), null);
    assert.equal(Opening.model({ ...state, status: 'over' }, 1200), null);
    const next = { ...state, matchId: state.matchId + '-next', openingDraw: { at: 10000, player: active }, readyAt: 10000 + total };
    assert.equal(first.update(next, { now: 10000 }).blocking, true, 'A fresh Match gets its own introduction');
    assert.equal(first.update(next, { now: 10000, reducedMotion: true }).opening.player, active);
    first.reset(); assert.equal(first.snapshot(10000).opening, null);
}
for (const [mode, count, startingPlayer] of [['practice', 2, 'random'], ['countup', 1, 'random'], ['x01', 2, 'cork']]) {
    const state = Rules.create({ mode, startingPlayer }, ['A', 'B'].slice(0, count), 1000, 0);
    Opening.prepare(state); assert.equal(state.openingDraw, undefined);
    assert.equal(Opening.model(state, 1000), null);
}
console.log('PASS: random opening selection, synchronized draw/reveal, full first-turn deadline, reduced motion, lifecycle cancellation and Practice/solo/Cork exclusions.');
