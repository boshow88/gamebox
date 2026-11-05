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

// A winning impact is already final while only its result announcement waits.
for (const legsToWin of [1, 2]) {
    let s = create('x01', ['A', 'B'], { legsToWin }); s.scores.A = s.turnStartScore = 32;
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = throwDart(s, 16, 2);
    const accepted = JSON.stringify(s), v = update(f, s, 100, true);
    assert.equal(s.status, legsToWin === 1 ? 'over' : 'between');
    assert.equal(v.resultPending, true); assert.equal(v.finalHit.dart.result.label, 'D16');
    assert.equal(v.finalHit.dart.result.score, 32); assert.equal(v.blocking, false);
    assert.equal(v.handoff, null); assert.equal(v.notice, null);
    assert.equal(R.throwDart(s, s.active, R.hit(20, 3), 101), null);
    assert.equal(R.timeout(s, 999999), null, 'A visual delay never reopens scoring or a completed turn timer');
    update(f, s, 200, true);
    assert.equal(f.snapshot(100 + F.TIMING.finalHit - 1).resultPending, true);
    assert.equal(f.snapshot(100 + F.TIMING.finalHit).resultPending, false, 'Repeated snapshots cannot prolong the delay');
    update(f, s, 2000, true); assert.equal(f.snapshot(2000).finalHit, null);
    assert.equal(JSON.stringify(s), accepted, 'Presentation does not mutate the accepted final state');
    f.reset(); assert.equal(f.snapshot(2010).resultPending, false);
    // Re-establish a baseline without a landed event: reconnect is not a new winning hit.
    assert.equal(update(f, s, 2020).resultPending, false);
}
{
    let s = create('x01', ['A', 'B'], { legsToWin: 2 }); s.scores.A = s.turnStartScore = 32;
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = throwDart(s, 16, 2); update(f, s, 100, true);
    s = R.nextLeg(s, 200);
    assert.equal(update(f, s, 200).resultPending, false, 'A new Leg cancels the previous announcement delay');
    assert.equal(update(f, null, 250).finalHit, null, 'Leaving clears the pending impact');
}

// Context notices are accepted-phase presentation; handoff stays the only input gate.
for (const purpose of ['opening', 'tie', 'limit']) {
    let s = purpose === 'opening' ? create('x01', ['A', 'B'], { startingPlayer: 'cork' }) : create('x01', ['A', 'B']);
    const f = F.create({ controllerId: 'device1' });
    if (purpose !== 'opening') {
        update(f, s, 0);
        s = { ...s, seq: s.seq + 1, round: s.round + 1, phase: 'cork', corkPurpose: purpose,
            corkRound: 1, corkPlayers: ['A', 'B'], corkDistances: {} };
    }
    let v = update(f, s, 100);
    assert.equal(v.notice.kind, 'cork'); assert.equal(v.notice.purpose, purpose);
    assert.deepEqual(v.notice.players, ['A', 'B']); assert.equal(v.blocking, false);
    const key = v.notice.key;
    update(f, s, 200);
    assert.equal(f.snapshot(100 + F.TIMING.cork).notice, null, 'A repeated snapshot does not extend a phase notice');
    s = { ...s, seq: s.seq + 1, round: s.round + 1, corkRound: 2 };
    v = update(f, s, 1800);
    assert.equal(v.notice.kind, 'cork-rethrow'); assert.equal(v.notice.round, 2); assert.notEqual(v.notice.key, key);
    update(f, s, 1900);
    assert.equal(f.snapshot(1800 + F.TIMING.cork).notice, null);
    s = { ...s, seq: s.seq + 1, phase: 'play', corkPurpose: null, corkPlayers: [] };
    assert.equal(update(f, s, 3500).notice, null, 'Resolved Cork cannot leave a special-phase notice behind');
}
{
    let s = create('x01', ['A', 'B']);
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = { ...s, seq: 1, round: 2, phase: 'cork', corkPurpose: 'limit', corkRound: 1,
        corkPlayers: ['A', 'B'], active: 'B', corkDistances: {} };
    const queued = update(f, s, 100);
    assert.equal(queued.handoff.player, 'B'); assert.equal(queued.notice, null);
    assert.equal(f.confirm(200, queued.handoff.key), true);
    assert.equal(f.snapshot(200).notice.kind, 'cork'); assert.equal(f.snapshot(200).blocking, false);
    assert.equal(update(f, s, 300).notice.key, f.snapshot(200).notice.key);
    s = { ...s, seq: 2, round: 3, active: 'A', corkRound: 2 };
    const next = update(f, s, 400); assert.equal(next.notice, null); assert.equal(next.handoff.player, 'A');
    // Resolving before confirmation must discard the queued rethrow announcement.
    s = { ...s, seq: 3, status: 'over', winner: 'A', legWinner: 'A', endReason: 'cork' };
    assert.equal(update(f, s, 500).notice, null); assert.equal(f.confirm(501), false);
    f.reset(); assert.equal(f.snapshot(502).notice, null);
}

// Every completed Cork round retains its impact/comparison before presenting its outcome.
for (const purpose of ['opening', 'tie', 'limit']) for (const ties of [false, true]) {
    let s = create('x01', ['A', 'B'], { legsToWin: 2 });
    s = { ...s, phase: 'cork', corkPurpose: purpose, corkPlayers: ['A', 'B'], corkRound: 1, corkDistances: {} };
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = R.throwDart(s, 'A', R.hit(25, 1), 10, { x: 5, y: 0 });
    assert.equal(update(f, s, 10, true).resultPending, false, 'An ordinary Cork participant does not add a final-hit pause');
    f.confirm(11);
    s = R.throwDart(s, 'B', R.hit(25, 1), 20, { x: ties ? 5 : 10, y: 0 });
    const accepted = JSON.stringify(s), v = update(f, s, 20, true);
    const kind = ties ? 'rethrow' : purpose === 'opening' ? 'starter' : 'win';
    assert.equal(v.resultPending, true); assert.equal(v.finalHit.corkOutcome.kind, kind);
    assert.equal(v.finalHit.dart.uid, 'B'); assert.equal(v.finalHit.dart.distance, ties ? 5 : 10);
    assert.equal(v.finalHit.corkState.corkRound, 1);
    assert.deepEqual(v.finalHit.corkState.corkDistances, { A: 5, B: ties ? 5 : 10 });
    assert.deepEqual(v.finalHit.corkState.corkPlayers, ['A', 'B']);
    assert.equal(v.notice, null); assert(!v.handoff || !v.handoff.visible);
    assert.equal(f.confirm(21), false, 'A handoff cannot skip the last Cork impact');
    assert.equal(v.blocking, kind !== 'win', 'Still-playing Cork outcomes gate the next local gesture');
    update(f, s, 300, true);
    assert.equal(f.snapshot(20 + F.TIMING.finalHit - 1).resultPending, true);
    const released = update(f, s, 20 + F.TIMING.finalHit);
    assert.equal(released.resultPending, false, 'Heartbeat refreshes do not restart a playing-state Cork hold');
    if (kind === 'win') assert.equal(s.status, 'between');
    else {
        assert.equal(s.status, 'playing'); assert.equal(released.handoff.visible, true);
        assert.equal(released.handoff.outcome.kind, kind);
        assert.equal(f.confirm(1021, released.handoff.key), true);
        if (ties) assert.equal(f.snapshot(1021).notice.kind, 'cork-rethrow');
    }
    assert.equal(JSON.stringify(s), accepted, 'Outcome presentation cannot mutate authoritative Cork resolution');
}
{
    let s = create('x01', ['A', 'B'], { startingPlayer: 'cork' });
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = R.throwDart(s, 'A', R.hit(25, 1), 10, { x: 10, y: 0 }); update(f, s, 10, true); f.confirm(11);
    s = R.throwDart(s, 'B', R.hit(25, 1), 20, { x: 5, y: 0 }); update(f, s, 20, true);
    assert.equal(s.active, 'B'); assert.equal(f.snapshot(20).handoff, null);
    const released = update(f, s, 1020);
    assert.equal(released.blocking, false); assert.equal(released.notice.kind, 'cork-starter');
    assert.equal(released.notice.player, 'B', 'The last thrower can win opening Cork without an unnecessary device handoff');
    assert.equal(update(f, s, 1030, true).resultPending, false);
    s = R.throwDart(s, 'B', R.hit(20, 1), 1035);
    assert.equal(update(f, s, 1035, true).notice, null, 'The first scoring impact replaces the starting-player notice');
    assert.equal(f.snapshot(1020 + F.TIMING.cork).notice, null);
}
{
    let s = create('x01', ['A', 'B'], { startingPlayer: 'cork' });
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = R.throwDart(s, 'A', R.hit(25, 1), 10, { x: 10, y: 0 }); update(f, s, 10, true); f.confirm(11);
    s = R.throwDart(s, 'B', R.hit(25, 1), 20, { x: 5, y: 0 }); update(f, s, 20, true);
    const completed = s;
    s = R.timeout(s, 30021);
    const advanced = update(f, s, 30);
    assert.equal(advanced.finalHit, null); assert.equal(advanced.resultPending, false);
    assert(!advanced.notice || advanced.notice.kind !== 'cork-starter', 'A newer timeout cancels the obsolete starting-player announcement');
    assert.equal(update(f, completed, 40, true).resultPending, false, 'An older accepted event cannot revive the canceled hold');
    f.reset(); assert.equal(f.snapshot(1050).notice, null);
}

function cpuMatch(ids, extra = {}) {
    const s = create('x01', ids, extra);
    s.owners = Object.fromEntries(ids.map(id => [id, id.startsWith('CPU') ? 'local-cpu' : 'device1']));
    s.participants = Object.fromEntries(ids.map(id => [id, id.startsWith('CPU') ?
        { type: 'cpu', difficulty: 'normal' } : { type: 'human' }]));
    return s;
}

// The last human holding a shared device remains relevant across CPU turns.
{
    let s = cpuMatch(['A', 'CPU1', 'B']);
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = finishTurn(s); let v = update(f, s, 100, true);
    assert.equal(s.active, 'CPU1'); assert.equal(v.handoff, null);
    assert.equal(v.notice.kind, 'turn'); assert.equal(v.notice.player, 'CPU1');
    assert.equal(f.confirm(101), false, 'A CPU never needs Ready to Throw');
    s = finishTurn(s); v = update(f, s, 200, true);
    assert.equal(s.active, 'B'); assert.equal(v.handoff.player, 'B'); assert.equal(v.blocking, true);
    assert.equal(f.confirm(201, v.handoff.key), true, 'A different human still receives the shared device after CPU');
}
{
    // B exists on this device but is outside this tied Cork's eligible subset.
    let s = cpuMatch(['A', 'CPU1', 'B']);
    s = { ...s, phase: 'cork', corkPurpose: 'tie', corkPlayers: ['A', 'CPU1'], corkRound: 1, corkDistances: {} };
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = R.throwDart(s, 'A', R.hit(25, 1), 10, { x: 10, y: 0 });
    assert.equal(update(f, s, 10, true).handoff, null);
    s = R.throwDart(s, 'CPU1', R.hit(25, 1), 20, { x: 10, y: 0 });
    let v = update(f, s, 20, true);
    assert.equal(s.active, 'A'); assert.equal(s.corkRound, 2);
    assert.equal(v.handoff, null, 'The same human needs no exchange merely because another human exists');
    assert.equal(v.resultPending, true); assert.equal(v.blocking, true);
    assert.equal(f.confirm(21), false);
    v = update(f, s, 20 + F.TIMING.finalHit);
    assert.equal(v.handoff, null); assert.equal(v.blocking, false); assert.equal(v.notice.kind, 'cork-rethrow');
}
{
    let s = cpuMatch(['A', 'CPU1', 'CPU2', 'CPU3']);
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    for (let turn = 0; turn < 12; turn++) {
        s = finishTurn(s); const v = update(f, s, 100 + turn * 10, true);
        assert.equal(v.handoff, null, 'One human and three CPUs never exchange a shared device');
        assert.equal(v.blocking, false); assert.equal(f.confirm(101 + turn * 10), false);
    }
}
{
    let s = cpuMatch(['CPU1', 'A', 'B']);
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = finishTurn(s); const v = update(f, s, 100, true);
    assert.equal(s.active, 'A'); assert.equal(v.handoff, null, 'An initial CPU has no previous human holder');
    assert.equal(v.notice.player, 'A'); assert.equal(v.blocking, false);
}
{
    let s = cpuMatch(['A', 'B', 'CPU1']);
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = finishTurn(s); const pending = update(f, s, 100, true);
    assert.equal(pending.handoff.player, 'B', 'Direct local human handoff is preserved');
    const stale = s;
    s = R.timeout(s, 31000); let v = update(f, s, 31000);
    assert.equal(s.active, 'CPU1'); assert.equal(v.handoff, null);
    assert.equal(f.confirm(31001, pending.handoff.key), false, 'An obsolete human confirmation cannot target CPU');
    s = finishTurn(s); v = update(f, s, 31100, true);
    assert.equal(s.active, 'A'); assert.equal(v.handoff, null, 'Unconfirmed B did not take the device from A');
    assert.equal(v.blocking, false);
    assert.equal(update(f, stale, 31101, true).handoff, null, 'An old B snapshot cannot restore the obsolete handoff');
}

// Room aliases migrate the retained human holder; a new Match clears that history.
{
    let s = cpuMatch(['A', 'CPU1', 'B']);
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = finishTurn(s); update(f, s, 100, true);
    assert.equal(f.rebindController('device1', 'local-controller'), true);
    s = { ...s, owners: { A: 'local-controller', CPU1: 'local-cpu', B: 'local-controller' } };
    assert.equal(f.update(s, { controllerId: 'local-controller', now: 110 }).handoff, null);
    s = finishTurn(s); const v = update(f, s, 200, true);
    assert.equal(v.handoff.player, 'B', 'Alias rebinding preserves A as the previous human holder across CPU');
    assert.equal(f.confirm(201, v.handoff.key), true);
    let next = cpuMatch(['CPU2', 'A', 'B']); next.matchId = 'different-cpu-match';
    assert.equal(update(f, next, 300).handoff, null);
    next = finishTurn(next); next.owners.A = 'local-controller'; next.owners.B = 'local-controller';
    assert.equal(update(f, next, 400, true).handoff, null, 'The new Match does not carry B over as device holder');
}

// The last Cork impact gates CPU as well as human gestures until presentation finishes.
{
    let s = cpuMatch(['A', 'CPU1'], { startingPlayer: 'cork' });
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = R.throwDart(s, 'A', R.hit(25, 1), 10, { x: 10, y: 0 }); update(f, s, 10, true);
    s = R.throwDart(s, 'CPU1', R.hit(25, 2), 20, { x: 5, y: 0 });
    let v = update(f, s, 20, true);
    assert.equal(s.active, 'CPU1'); assert.equal(s.phase, 'play');
    assert.equal(v.finalHit.corkOutcome.kind, 'starter'); assert.equal(v.finalHit.corkOutcome.player, 'CPU1');
    assert.equal(v.resultPending, true); assert.equal(v.blocking, true); assert.equal(v.handoff, null);
    assert.equal(f.confirm(21), false, 'CPU cannot confirm away Cork presentation');
    assert.equal(f.snapshot(20 + F.TIMING.finalHit - 1).blocking, true, 'CPU cannot launch early during Cork hold');
    v = update(f, s, 20 + F.TIMING.finalHit);
    assert.equal(v.blocking, false); assert.equal(v.handoff, null); assert.equal(v.notice.kind, 'cork-starter');
    assert.equal(v.notice.player, 'CPU1');
}
for (const ties of [false, true]) {
    let s = cpuMatch(['A', 'B', 'CPU1'], { startingPlayer: 'cork' });
    const f = F.create({ controllerId: 'device1' }); update(f, s, 0);
    s = R.throwDart(s, 'A', R.hit(25, 2), 10, { x: 5, y: 0 });
    let v = update(f, s, 10, true); assert.equal(v.handoff.player, 'B');
    assert.equal(f.confirm(11, v.handoff.key), true);
    s = R.throwDart(s, 'B', R.hit(25, ties ? 2 : 1), 20, { x: ties ? 5 : 10, y: 0 });
    assert.equal(update(f, s, 20, true).handoff, null);
    s = R.throwDart(s, 'CPU1', R.hit(25, 1), 30, { x: 15, y: 0 });
    v = update(f, s, 30, true);
    assert.equal(s.active, 'A'); assert.equal(v.resultPending, true); assert.equal(v.blocking, true);
    assert.equal(v.handoff.player, 'A'); assert.equal(v.handoff.visible, false);
    assert.equal(v.finalHit.corkOutcome.kind, ties ? 'rethrow' : 'starter');
    assert.equal(f.confirm(31, v.handoff.key), false, 'Human handoff waits for the final CPU Cork impact');
    v = update(f, s, 30 + F.TIMING.finalHit);
    assert.equal(v.handoff.visible, true); assert.equal(v.handoff.outcome.kind, ties ? 'rethrow' : 'starter');
    assert.equal(v.blocking, true); assert.equal(f.confirm(1031, v.handoff.key), true);
    assert.equal(f.snapshot(1031).blocking, false);
    if (ties) assert.equal(f.snapshot(1031).notice.kind, 'cork-rethrow');
}

console.log('Darts feedback: human/CPU handoff safety, scoring, all Cork outcomes and deduplicated final-hit presentation passed.');
