/** node tools/darts-feedback-check.js — accepted-event feedback and handoff checks. */
'use strict';
const assert = require('node:assert/strict');
const R = require('../js/games/darts-rules.js');
const F = require('../js/games/darts-feedback.js');
const players = ['A', 'B', 'C', 'D'];
const owners = { A: 'device1', B: 'device1', C: 'device2', D: 'device2' };
const create = (mode = '501', ids = players, extra = {}) => Object.assign(R.create({ mode,
    roundLimit: 0, turnMs: 30000, cricketVariant: 'cutthroat', ...extra }, ids, 1000),
{ matchId: 'match1', owners: Object.fromEntries(ids.map(id => [id, owners[id]])) });
const throwDart = (state, base = 0, mult = 0) => R.throwDart(state, state.active, R.hit(base, mult), 2000);
const finishTurn = state => { for (let i = 0; i < 3; i++) state = throwDart(state); return state; };
const event = state => ({ id: state.matchId + ':' + state.seq, dart: state.lastDart,
    restoredScore: state.lastDart && state.scores[state.lastDart.uid] });
const update = (feedback, state, now, landed = false) => feedback.update(state,
    { now, ...(landed ? { throwEvent: event(state) } : {}) });

// Ownership is evaluated per transition, including rooms with two slots on each device.
{
    const first = F.create({ controllerId: 'device1' }), second = F.create({ controllerId: 'device2' });
    let s = create(); update(first, s, 0); update(second, s, 0);
    s = throwDart(s); assert.equal(update(first, s, 10, true).blocking, false);
    s = throwDart(s); assert.equal(update(first, s, 20, true).notice, null);
    s = throwDart(s);
    let v = update(first, s, 30, true);
    assert.equal(v.handoff.player, 'B'); assert.equal(v.handoff.visible, true); assert.equal(v.blocking, true);
    assert.equal(v.notice, null); assert.equal(update(second, s, 30, true).handoff, null);
    assert.equal(first.confirm(31, v.handoff.key), true);
    assert.equal(first.confirm(32), false);
    assert.equal(update(first, s, 40, true).blocking, false, 'A duplicate cannot undo confirmation');
    s = finishTurn(s);
    v = update(first, s, 50, true); update(second, s, 50, true);
    assert.equal(v.handoff, null); assert.equal(v.notice.kind, 'turn'); assert.equal(v.notice.player, 'C');
    assert.equal(first.snapshot(50 + F.TIMING.turn).notice, null);
    s = finishTurn(s);
    assert.equal(update(first, s, 60, true).handoff, null);
    assert.equal(update(second, s, 60, true).handoff.player, 'D');
    s = finishTurn(s);
    assert.equal(update(first, s, 70, true).handoff, null, 'Remote → local needs no device handoff');
    assert.equal(update(second, s, 70, true).handoff, null);
}

// Resume establishes a baseline; solo turns and successive darts never request a handoff.
{
    let s = create('practice', ['A']);
    const f = F.create({ controllerId: 'device1' });
    update(f, s, 0);
    for (let i = 1; i <= 8; i++) {
        s = throwDart(s); const v = update(f, s, i * 10, true);
        assert.equal(v.blocking, false); assert.equal(v.notice, null);
    }
    s = create(); s = finishTurn(s);
    f.reset(); assert.equal(update(f, s, 100).handoff, null, 'A resumed B turn is not an A → B transition');
    delete s.owners;
    const fallback = F.create({ controllerId: 'A' }); update(fallback, s, 0);
    s = finishTurn(s);
    assert.equal(update(fallback, s, 10).handoff, null, 'Absent owners fall back to the slot ID');
}

// A timeout replaces a pending handoff; stale button keys and older states are rejected.
{
    let s = create(); s.owners = { A: 'device1', B: 'device1', C: 'device1', D: 'device1' };
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = R.timeout(s, 31000); const stale = s;
    const oldKey = update(f, s, 31000).handoff.key;
    s = R.timeout(s, 61000); const v = update(f, s, 61000);
    assert.equal(v.handoff.player, 'C'); assert.notEqual(v.handoff.key, oldKey);
    assert.equal(f.confirm(61001, oldKey), false);
    assert.equal(update(f, stale, 61002).handoff.player, 'C', 'Old network snapshots do not revive B');
    assert.equal(f.confirm(61003, v.handoff.key), true);
    assert.equal(update(f, s, 61004).handoff, null);
    s = R.timeout(s, 91000); update(f, s, 91000);
    s = { ...s, round: s.round + 1, seq: s.seq + 1 };
    assert.equal(update(f, s, 92000).handoff, null, 'A revised turn clears an obsolete handoff even with the same active slot');
    assert.equal(f.confirm(92001), false);
}

// Penalty flashes use the rule engine's accepted recipient map, including closing excess marks.
for (const eligible of [1, 2, 3, 0]) {
    let s = create('cricket'); s.marks.A[20] = 2;
    ['B', 'C', 'D'].forEach((id, i) => { s.marks[id][20] = i < eligible ? 0 : 3; });
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = throwDart(s, 20, 3);
    const accepted = JSON.stringify(s), expected = Object.fromEntries(['B', 'C', 'D'].slice(0, eligible).map(id => [id, 40]));
    assert.deepEqual(s.lastDart.penalties, expected);
    assert.deepEqual(update(f, s, 100, true).penalties, expected);
    assert.equal(s.marks.A[20], 3);
    assert.equal(JSON.stringify(s), accepted, 'Feedback never changes accepted game state');
    assert.deepEqual(update(f, s, 100 + F.TIMING.penalty - 1, true).penalties, expected);
    assert.deepEqual(f.snapshot(100 + F.TIMING.penalty).penalties, {});
    assert.deepEqual(update(f, s, 5000, true).penalties, {}, 'The same accepted throw never replays');
    s = throwDart(s, 20, 1);
    assert.deepEqual(update(f, s, 5100, true).penalties,
        Object.fromEntries(['B', 'C', 'D'].slice(0, eligible).map(id => [id, 20])));
    assert.deepEqual(f.snapshot(5100).penalties.A, undefined, 'The scoring player receives no invented penalty');
}
{
    const f = F.create(); let s = create('cricket'); update(f, s, 0);
    s = throwDart(s, 20, 1);
    s.lastDart.penalties = { B: 20 }; s.cricketVariant = 'standard';
    assert.deepEqual(update(f, s, 100, true).penalties, {}, 'Standard Cricket has no penalty effects');
    s.cricketVariant = 'cutthroat'; s.seq++;
    assert.deepEqual(update(f, s, 200).penalties, {}, 'A retained lastDart alone is not a new throw event');
}

// Bust explains the actual rollback first while local handoff input is already blocked.
{
    let s = create('501', ['A', 'B']); s.scores.A = s.turnStartScore = 28;
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = throwDart(s, 20, 1); update(f, s, 100, true);
    s = throwDart(s, 20, 1);
    const v = update(f, s, 200, true);
    assert.equal(v.blocking, true); assert.equal(v.handoff.visible, false);
    assert.deepEqual(v.notice, { kind: 'bust', player: 'A', key: event(s).id, restoredScore: 28 });
    assert.equal(s.turnStartScore, 501, 'The next player’s turn-start score is deliberately different');
    assert.equal(f.confirm(201), false);
    assert.equal(f.snapshot(200 + F.TIMING.bust - 1).handoff.visible, false);
    const ready = f.snapshot(200 + F.TIMING.bust);
    assert.equal(ready.notice, null); assert.equal(ready.handoff.visible, true);
    assert.equal(f.confirm(200 + F.TIMING.bust, ready.handoff.key), true);
    assert.equal(update(f, s, 5000, true).notice, null);
    assert.equal(update(f, s, 5001, true).blocking, false);
    assert.equal(s.history.at(-1).darts.length, 2, 'Bust presentation leaves thrown darts in history');
}

// A timeout during queued bust feedback cancels the obsolete sequence immediately.
{
    let s = create('501', ['A', 'B']); s.scores.A = s.turnStartScore = 20;
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = throwDart(s, 20, 1); const bust = update(f, s, 100, true);
    s = R.timeout(s, 30100); const next = update(f, s, 30100);
    assert.equal(next.notice, null); assert.equal(next.handoff.player, 'A'); assert.equal(next.handoff.visible, true);
    assert.equal(f.confirm(30101, bust.handoff.key), false);
}

// A new accepted dart supersedes a previous remote player's rollback message.
{
    let s = create('501', ['A', 'C']); s.scores.A = s.turnStartScore = 20;
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = throwDart(s, 20, 1); assert.equal(update(f, s, 100, true).notice.kind, 'bust');
    s = throwDart(s, 1, 1); assert.equal(update(f, s, 200, true).notice, null);
}

// Losing a coded room preserves the same physical device's pending handoff and event identity.
{
    let s = create('cricket', ['A', 'B']); s.marks.A[20] = 3;
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = throwDart(s); update(f, s, 10, true);
    s = throwDart(s); update(f, s, 20, true);
    s = throwDart(s, 20, 1); const pending = update(f, s, 100, true);
    assert.equal(pending.handoff.player, 'B'); assert.deepEqual(pending.penalties, { B: 20 });
    assert.equal(f.rebindController('different-device', 'local-controller'), false);
    assert.equal(f.rebindController('device1', 'local-controller'), true);
    s = { ...s, owners: { A: 'local-controller', B: 'local-controller' } };
    const retained = f.update(s, { controllerId: 'local-controller', now: 200, throwEvent: event(s) });
    assert.equal(retained.handoff.key, pending.handoff.key); assert.equal(retained.blocking, true);
    assert.deepEqual(retained.penalties, pending.penalties); assert.equal(retained.eventKey, pending.eventKey);
    assert.deepEqual(f.snapshot(100 + F.TIMING.penalty).penalties, {}, 'Rebinding and a duplicate snapshot do not restart effects');
    assert.equal(f.confirm(1500, pending.handoff.key), true);
    s = R.timeout(s, 31000);
    assert.equal(f.update(s, { controllerId: 'local-controller', now: 31000 }).handoff.player, 'A',
        'Subsequent turns still recognize the rebound previous owner');
}
{
    let s = create('501', ['A', 'B']); s.scores.A = s.turnStartScore = 20;
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = throwDart(s, 20, 1); const pending = update(f, s, 100, true);
    assert.equal(f.rebindController('device1', 'local-controller'), true);
    s = { ...s, owners: { A: 'local-controller', B: 'local-controller' } };
    const retained = f.update(s, { controllerId: 'local-controller', now: 200, throwEvent: event(s) });
    assert.equal(retained.handoff.key, pending.handoff.key); assert.equal(retained.handoff.visible, false);
    assert.deepEqual(retained.notice, pending.notice); assert.equal(retained.blocking, true);
    assert.equal(f.confirm(200, pending.handoff.key), false, 'An alias change cannot bypass queued Bust feedback');
    const ready = f.snapshot(100 + F.TIMING.bust);
    assert.equal(ready.notice, null); assert.equal(ready.handoff.visible, true); assert.equal(ready.blocking, true);
    assert.equal(f.confirm(100 + F.TIMING.bust, pending.handoff.key), true);
    assert.equal(update(f, s, 2000, true).blocking, false, 'The seen throw cannot replay after alias migration');
}

// Results take priority; a new leg/new match/lobby cannot retain old blocking UI.
{
    let s = create('501', ['A', 'B']); const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = finishTurn(s); update(f, s, 100, true);
    s = { ...s, seq: s.seq + 1, status: 'between' };
    let v = update(f, s, 200);
    assert.equal(v.blocking, false); assert.equal(v.notice, null); assert.equal(f.confirm(201), false);
    s = { ...s, seq: s.seq + 1, leg: 2, round: s.round + 1, active: 'A', status: 'playing' };
    assert.equal(update(f, s, 300).handoff.player, 'A', 'A different local leg starter can need a handoff');
    s = { ...s, matchId: 'match2', seq: 0, leg: 1, round: 1 };
    assert.equal(update(f, s, 400).handoff, null, 'A new match starts with a clean baseline');
    s = { ...s, seq: 1, active: 'B', round: 2 };
    update(f, s, 500);
    assert.equal(update(f, null, 600).blocking, false);
    assert.equal(f.snapshot(601).eventKey, '');
}
{
    let s = create('cricket'); const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = { ...s, seq: 1, status: 'over', active: 'B', round: 2,
        lastDart: { uid: 'A', reason: 'leg-won', penalties: { B: 20, C: 20 } } };
    const v = update(f, s, 100, true);
    assert.equal(v.handoff, null); assert.equal(v.notice, null); assert.equal(v.blocking, false);
    assert.deepEqual(v.penalties, { B: 20, C: 20 }, 'The final accepted penalties may still flash beside results');
    f.reset(); assert.deepEqual(f.snapshot(101).penalties, {});
}

console.log('Darts feedback: ownership, handoff safety, accepted penalties, bust sequencing and result priority passed.');
