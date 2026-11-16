/* Two real room clients over the native RTDB fixture, with real Trash Toss physics. */
'use strict';
const assert = require('node:assert/strict');
const R = require('../js/games/trash-toss-rules.js');
const Room = require('../js/games/trash-toss-room.js');
(async () => {
    const modules = Object.assign({}, await import('../js/net/rooms.mjs'), await import('../js/net/rtdb-rooms.mjs'), await import('../js/net/rtdb-values.mjs'));
    const db = require('./helpers/rtdb-fixtures.js').realtimeGameBackend(modules);
    let clock = 1000, serial = 0;
    const errors = [];
    function make() {
        const id = 'trash-tab-' + ++serial, user = { uid: 'shared-account', name: id };
        return Room.create({ now: () => clock, onError: e => errors.push(e), net: { rooms: {
            presence: options => modules.createRoomPresence({ ...options, now: () => clock }),
            create: config => modules.createRoomService({ store: db.createStore(config, () => user, id, () => clock),
                getUser: () => user, sessionId: id, generateCode: () => 'ABCD', now: () => clock }, config),
        } } });
    }
    const a = make(), b = make(), c = make();
    const A = a.service.currentPlayer().uid, B = b.service.currentPlayer().uid;
    const data = () => db.get('trash_toss_rooms/R-ABCD'), game = () => data().game;
    async function flush(p) { const result = await p; await db.flush(); return result; }
    async function beatBoth() { await flush(a.service.heartbeat('ABCD')); await flush(b.service.heartbeat('ABCD')); }
    await flush(a.create({ scene: 'arena' })); await flush(b.join(' r-abcd '));
    assert.notEqual(A, B, 'Same-account tabs have independent seats');
    await assert.rejects(c.join('ABCD'), /full/);
    assert.equal(await flush(b.configure('park')), false, 'Only the host changes the map');
    assert.equal(await flush(a.configure('unknown')), false, 'Invalid scene names cannot become room options');
    await flush(b.ready(true));
    const changedWhileReady = await Promise.all([a.configure('office'), b.ready(true)]); await db.flush();
    assert.deepEqual(changedWhileReady, [true, false], 'A delayed Ready for the previous map cannot confirm the new map');
    assert.deepEqual(data().ready, {}, 'Map changes clear readiness for both players');
    assert.equal(data().options.scene, 'office');
    assert.equal(await flush(a.configure('arena')), true);
    assert.equal(await flush(a.start()), false, 'Host waits for guest readiness');
    await flush(b.ready(true)); assert.equal(await flush(b.start()), false, 'Guest cannot start');
    assert.equal(await flush(a.start()), true);
    assert.equal(game().match.config.scene, 'arena');
    assert.equal(await flush(a.configure('park')), false, 'A running match keeps its scene');
    assert.equal(a.canControl(), true); assert.equal(b.canControl(), false);
    assert.equal(await flush(b.submit(45, 65)), false, 'Opponent cannot take the active seat');
    for (const [angle, power] of [[NaN, 50], [14, 50], [81, 50], [45, -1], [45, 101], [45, Infinity]]) assert.equal(await a.submit(angle, power), false);
    const initialGame = structuredClone(game());
    clock += 1000; await beatBoth();
    const dup = await Promise.all([a.submit(80, 30), a.submit(80, 30)]); await db.flush();
    assert.equal(dup.filter(Boolean).length, 1, 'Transaction seq accepts a release once');
    const flight = structuredClone(game());
    assert.equal(flight.status, 'flight');
    assert.ok(flight.shot.at >= clock + 399, 'Accepted throws schedule a shared launch after the transaction calculation');
    const received = Room.project(flight, clock + 250);
    assert.equal(received.ball, null); assert.equal(received.launched, false);
    assert.ok(received.world.tick > flight.world.tick, 'Scenery and cleanup keep moving while waiting for launch');
    const atRelease = Room.project(flight, flight.shot.at, received);
    assert.equal(atRelease.ball.x, 96); assert.equal(atRelease.ball.age, 0);
    assert.equal(atRelease.trail.length, 1, 'A delayed observer still sees the exact launch point');
    const nextFrame = Room.project(flight, flight.shot.at + 1000 / 30, atRelease);
    assert.ok(nextFrame.ball.x > 96 && nextFrame.ball.age < .04, 'Following frames advance normally after the visible release');
    const before = JSON.stringify(flight);
    let cache = null;
    for (let at = flight.shot.at; at <= flight.readyAt; at += 1000 / 60) cache = Room.project(flight, at, cache);
    cache = Room.project(flight, flight.readyAt, cache);
    const skipped = Room.project(flight, flight.readyAt);
    assert.deepEqual(cache.world, skipped.world, 'Foreground playback and background catch-up match');
    assert.deepEqual(skipped.result, flight.outcome.result);
    const impact = Room.project(flight, flight.shot.at + flight.outcome.duration * 1000 + .001);
    assert.deepEqual(JSON.parse(JSON.stringify(impact.world)), flight.outcome.world, 'Rendered field equals accepted physical outcome at impact');
    assert.ok(skipped.world.tick > impact.world.tick, 'Background and debris keep moving through the result pause');
    assert.equal(JSON.stringify(flight), before, 'Projection never mutates the room snapshot');
    assert.equal(await flush(a.submit(45, 60)), false, 'No second throw during replay');
    clock = flight.readyAt + 1; await beatBoth(); await flush(b.poll());
    assert.equal(game().active, 1); assert.equal(game().round, 1);
    assert.equal(game().match.history.length, 1);
    assert.ok(game().world.tick > initialGame.world.tick, 'Continuous shared clock survives a turn');
    assert.equal(game().last[0].grams, R.scenario(game().match.config, 1, game().match.seed).grams);
    assert.equal(game().last[1], null, 'Previous-throw references are per player');
    assert.equal(game().world.debris.length, flight.outcome.world.debris.length, 'Replay bodies survive the handoff and keep settling');
    assert.deepEqual(game().world.debris.map(b => b.result), flight.outcome.world.debris.map(b => b.result));
    await flush(b.submit(55, 70)); clock = game().readyAt + 1; await beatBoth(); await flush(a.poll());
    assert.equal(game().round, 2); assert.equal(game().active, 0);
    assert.deepEqual(game().match.history.map(h => h.player), [0, 1]);
    // A deadline is settled once, even when both clients observe it simultaneously.
    clock = game().turnStartedAt + R.WORLD.turnSeconds * 1000 + 1; await beatBoth();
    await Promise.all([a.poll(), b.poll()]); await db.flush();
    assert.equal(game().outcome.result.kind, 'timeout');
    assert.equal(game().outcome.match.history.length, 3);
    clock = game().readyAt + 1; await beatBoth(); await flush(a.poll());
    assert.equal(game().active, 1); assert.equal(game().round, 2);
    await flush(b.leave());
    assert.equal(game().status, 'over'); assert.equal(game().match.winner, 0); assert.equal(game().endReason, 'left');
    const oldId = game().matchId;
    assert.equal(await flush(a.rematch()), true); assert.equal(game().matchId, undefined);
    assert.equal(await flush(a.configure('park')), true, 'Same room can change map after returning to lobby');
    await flush(b.join('ABCD')); await flush(b.ready(true)); await flush(a.start());
    assert.equal(game().match.config.scene, 'park');
    assert.notEqual(game().matchId, oldId); assert.deepEqual(game().world.debris, []);
    assert.equal(await flush(a.service.updateMatch('ABCD', { matchId: oldId, round: 1, status: 'aim', seq: 0 }, () => ({ game: initialGame }))), false, 'Late previous-match writes are rejected');
    for (let i = 0; i < 16; i++) {
        clock = game().turnStartedAt + R.WORLD.turnSeconds * 1000 + 1; await beatBoth(); await flush(a.poll());
        clock = game().readyAt + 1; await beatBoth(); await flush(b.poll());
    }
    assert.equal(game().status, 'over'); assert.equal(game().match.round, 8);
    assert.equal(game().match.winner, null); assert.equal(game().match.history.length, 16);
    assert.deepEqual(game().match.history.map(h => h.player), Array.from({ length: 16 }, (_, i) => i % 2));
    const retainedSeats = data().slots.slice();
    await flush(a.rematch()); await flush(a.configure('living')); await flush(b.ready(true)); await flush(a.start());
    assert.deepEqual(data().slots, retainedSeats, 'Completed matches retain both players when the map changes');
    assert.equal(data().code, 'R-ABCD'); assert.equal(game().match.config.scene, 'living');
    // Presence uses observed counter grace; another tab can release an abandoned seat.
    clock += 16000; await flush(a.service.heartbeat('ABCD')); await flush(a.poll());
    assert.equal(game().status, 'over'); assert.equal(game().match.winner, 0);
    assert.equal(Object.keys(data().players).length, 1);
    await flush(a.leave()); assert.equal(data(), null, 'Last departure deletes the room');
    assert.equal(a.room, null); assert.equal(b.room, null, 'Deleting a watched room detaches stale membership and unlocks settings');
    assert.deepEqual(errors, []);
    a.destroy(); b.destroy(); c.destroy();
    console.log('PASS: room readiness/start, same-account seats, exactly-once throws, deterministic two-client replay, persistent shared field, AB turns, deadlines, forfeit, rematch guards and disconnect cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
