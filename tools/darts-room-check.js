/** node tools/darts-room-check.js — actual darts controller on the real RTDB adapter, no network. */
'use strict';
const assert = require('node:assert/strict');
const R = require('../js/games/darts-rules.js');
const createRoom = require('../js/games/darts-room.js');
(async () => {
    const modules = Object.assign({}, await import('../js/net/rooms.mjs'), await import('../js/net/rtdb-rooms.mjs'), await import('../js/net/rtdb-values.mjs'));
    const db = require('./helpers/rtdb-fixtures.js').realtimeGameBackend(modules);
    let clock = 1000, session = 0;
    const errors = [];
    function make() {
        const id = 'darts-tab-' + ++session, user = { uid: 'same-account', name: id };
        return createRoom({ now: () => clock,
            net: { rooms: { presence: options => modules.createRoomPresence({ ...options, now: () => clock }),
                create: config => modules.createRoomService({ store: db.createStore(config, () => user, id, () => clock),
                    getUser: () => user, sessionId: id, generateCode: () => 'ABCD', now: () => clock }, config) } },
            onChange() {}, onError: e => errors.push(e),
            resolveThrow: th => ({ impact: { x: th.vel.x, y: 100, t: .2 }, result: R.hit(th.vel.x, th.vel.y) }),
        });
    }
    const a = make(), b = make(), third = make();
    const A = a.service.currentPlayer().uid, B = b.service.currentPlayer().uid;
    const get = () => db.get('darts_rooms/R-ABCD'), game = () => get().game;
    const flight = (base = 20, mult = 3) => ({ pos: { x: 0, y: -292, z: 0 }, vel: { x: base, y: mult, z: 12600 }, tempo: 1 });
    const active = () => game().active === A ? a : b;
    const wait = () => { clock = Math.max(clock + 1, game().readyAt); };
    async function shoot(base, mult) { wait(); assert.equal(await active().submit(flight(base, mult)), true); await db.flush(); }
    await a.create({ mode: '501', bestOf: 3, turnMs: 60000 }); await db.flush();
    await b.join(' r-abcd '); await db.flush();
    assert.notEqual(A, B); assert.deepEqual(get().slots, [A, B, null, null]);
    assert.equal(await a.start(), false); assert.equal(await b.start(), false);
    await b.ready(); await db.flush(); assert.equal(game().status, undefined);
    await a.start(); await db.flush(); assert.equal(game().status, 'playing');
    await assert.rejects(third.join('ABCD'));
    const firstMatch = { ...game() };
    const inactive = active() === a ? b : a;
    assert.equal(await inactive.submit(flight()), false, 'Only active player can score');
    const owner = game().active;
    const concurrency = await Promise.all([active().submit(flight()), active().submit(flight())]); await db.flush();
    assert.equal(concurrency.filter(Boolean).length, 1); assert.equal(game().scores[owner], 441); assert.equal(game().dart, 1);
    assert.equal(game().history.length, 1); assert.equal(game().history[0].darts.length, 1, 'Duplicate submissions cannot duplicate history');
    assert.equal(game().lastThrow.result.label, 'T20'); assert.equal(game().lastThrow.flight.vel.z, 12600);
    assert.equal(await active().submit(flight()), false, 'Presentation cannot be skipped by another write');
    await shoot(20, 3); await shoot(20, 3); assert.notEqual(game().active, owner); assert.equal(game().round, 2);
    assert.equal(game().history[0].darts.length, 3); assert.equal(game().history[0].finished, true);
    assert.equal(await a.submit(flight(), firstMatch), false, 'Delayed throw from old round is rejected');
    assert.equal(await b.rematch(), false); assert.equal(await a.rematch(), false, 'No rematches during play');

    // Configure authoritative checkout/bust fixtures, then execute actual handlers.
    async function setRemaining(score) {
        const uid = game().active;
        await a.service.update('ABCD', { ['game.scores.' + uid]: score, 'game.turnStartScore': score }); await db.flush();
        return uid;
    }
    const busted = await setRemaining(60); await shoot(20, 1); await shoot(20, 1); await shoot(20, 3);
    assert.equal(game().scores[busted], 60); assert.notEqual(game().active, busted); assert.equal(game().lastDart.reason, 'bust');
    const starter = firstMatch.active;
    const win1 = await setRemaining(40); await shoot(20, 2);
    assert.equal(game().status, 'between'); assert.equal(game().wins[win1], 1);
    assert.equal(await a.start(), false); assert.equal(await a.rematch(), false);
    wait(); const leg = { ...game() };
    const next = await Promise.all([a.nextLeg(leg), b.nextLeg(leg)]); await db.flush();
    assert.equal(next.filter(Boolean).length, 1); assert.equal(game().leg, 2); assert.notEqual(game().active, starter);
    assert.equal(game().scores[A], 501); assert.equal(game().scores[B], 501); assert.equal(game().lastThrow, null);
    // Give the same player a second checkout so BO3 ends at two wins.
    if (game().active !== win1) { clock = game().turnStartedAt + game().turnMs; await a.expire(); await db.flush(); }
    await setRemaining(50); await shoot(25, 2);
    assert.equal(game().status, 'over'); assert.equal(game().winner, win1); assert.equal(game().wins[win1], 2);
    assert.equal(await b.rematch(), false); assert.equal(await a.rematch(), true); await db.flush();
    assert.deepEqual(get().ready, {}); assert.equal(game().status, undefined);
    await b.ready(); await a.start(); await db.flush(); assert.notEqual(game().matchId, firstMatch.matchId);
    assert.deepEqual(game().history, [], 'Rematch starts a fresh history in the same room');
    assert.equal(await a.submit(flight(), firstMatch), false);

    // Simultaneous watchdogs advance a timed-out turn once and retain landed darts.
    await shoot(20, 1); const timedOut = game().active, before = game().round;
    clock = game().turnStartedAt + game().turnMs;
    const expires = await Promise.all([a.expire(), b.expire()]); await db.flush();
    assert.equal(expires.filter(Boolean).length, 1); assert.equal(game().round, before + 1);
    assert.equal(game().scores[timedOut], 481); assert.equal(game().lastTurn.reason, 'timeout');

    // Disconnect marker, reconnect before deadline, eviction, migration and replacement.
    await Promise.all([a.service.heartbeat('ABCD'), b.service.heartbeat('ABCD')]); await db.flush();
    await a.tick(); await b.tick(); await db.flush();
    db.disconnectPlayer(A); await db.flush();
    clock += 10000; await b.tick(); await db.flush(); assert(get().players[A]);
    await a.service.update('ABCD', { ['presence.' + A]: 999 }); await db.flush();
    clock += 6000; await b.tick(); await db.flush(); assert(get().players[A], 'Recovered peer keeps its seat');
    clock += 16000; await b.tick(); await db.flush();
    assert.equal(get().players[A], undefined); assert.equal(get().hostUid, B); assert.equal(game().winner, B);
    assert.equal(game().endReason, 'left'); assert.deepEqual(get().ready, {});
    await third.join('ABCD'); await db.flush(); await third.ready(); await b.start(); await db.flush();
    assert.equal(game().status, 'playing'); assert.equal(await a.submit(flight()), false, 'Evicted tab cannot affect a replacement match');
    await third.leave(); await db.flush(); assert.equal(game().winner, B);
    await b.leave(); await db.flush(); assert.equal(get(), null);
    await a.leave();

    // A full online Count-Up match, tie replay and eight rounds with partial-turn timeouts.
    await a.create({ mode: 'countup', bestOf: 1 }); await b.join('ABCD'); await db.flush();
    await b.ready(); await a.start(); await db.flush();
    for (let i = 0; i < 48; i++) await shoot(0, 0);
    assert.equal(game().status, 'between'); assert.equal(game().draw, true);
    const tieStarter = game().players[game().firstStarter];
    wait(); await a.nextLeg(); await db.flush(); assert.notEqual(game().active, tieStarter);
    for (let i = 0; i < 48; i++) await shoot(game().active === A ? 25 : 20, game().active === A ? 1 : 3);
    assert.equal(game().winner, B); assert.equal(game().stats[A].darts, 24); assert.equal(game().scores[A], 600);
    assert.equal(game().scores[B], 1440);
    await a.leave(); await b.leave(); await db.flush();
    await a.create({ mode: 'cricket', bestOf: 1 }); await b.join('ABCD'); await db.flush();
    await b.ready(); await a.start(); await db.flush();
    const cricketWinner = game().active;
    for (const target of [20, 19, 18]) await shoot(target, 3);
    for (let i = 0; i < 3; i++) await shoot(0, 0);
    for (const target of [17, 16, 15]) await shoot(target, 3);
    for (let i = 0; i < 3; i++) await shoot(0, 0);
    await shoot(25, 2); await shoot(25, 1);
    assert.equal(game().winner, cricketWinner); assert.equal(game().status, 'over');
    assert(R.TARGETS.every(target => game().marks[cricketWinner][target] === 3));
    await a.leave(); await b.leave(); await db.flush();
    assert.equal(errors.length, 0, errors.map(String).join('\n'));

    // The same shared service admits four, checks every guest, rotates all seats,
    // continues after departure, and rejects departed/delayed writes.
    const c = make(), d = make(), e = make();
    await a.create({ mode: 'countup', bestOf: 1 }); await b.join('ABCD'); await c.join('ABCD'); await d.join('ABCD'); await db.flush();
    const C = c.service.currentPlayer().uid, D = d.service.currentPlayer().uid;
    assert.equal(Object.keys(get().players).length, 4); assert.equal(get().maxPlayers, 4);
    await assert.rejects(e.join('ABCD'), error => error.code === 'room/full');
    await b.ready(); await c.ready(); assert.equal(await a.start(), false, 'Every guest must be ready');
    await d.ready(); assert.equal(await a.start(), true); await db.flush();
    const clients = { [A]: a, [B]: b, [C]: c, [D]: d };
    const seen = [];
    for (let i = 0; i < 4; i++) {
        seen.push(game().active);
        for (let j = 0; j < 3; j++) { wait(); await clients[game().active].submit(flight(20, 3)); await db.flush(); }
    }
    assert.equal(new Set(seen).size, 4); assert.equal(game().active, seen[0]);
    assert.equal(game().history.length, 4); assert.equal(new Set(game().history.map(row => row.uid)).size, 4);
    assert.deepEqual(a.current().data.game.history, b.current().data.game.history, 'All players receive the same accepted history');
    const departed = game().active, departureClient = clients[departed], delayed = { ...game() };
    await departureClient.leave(); await db.flush();
    assert.equal(game().status, 'playing'); assert.equal(Object.keys(get().players).length, 3); assert.notEqual(game().active, departed);
    assert(game().withdrawn.includes(departed)); assert.equal(await departureClient.submit(flight(), delayed), false);
    const hostNow = clients[get().hostUid];
    const survivors = game().players.filter(uid => uid !== departed);
    // Complete all eight rounds with the current roster, keeping enough peers for a rematch.
    while (game().status === 'playing') {
        wait(); await clients[game().active].submit(flight(game().active === survivors[0] ? 20 : 1, 3)); await db.flush();
    }
    assert.equal(game().winner, survivors[0]); assert(survivors.every(uid => game().stats[uid].darts === 24));
    assert.equal(await hostNow.rematch(), true); await db.flush();
    await e.join('ABCD'); await db.flush(); assert.equal(Object.keys(get().players).length, 4);
    const all = Object.assign({}, clients, { [e.service.currentPlayer().uid]: e });
    for (const uid of Object.keys(get().players)) if (uid !== get().hostUid) await all[uid].ready();
    await hostNow.start(); await db.flush(); assert.equal(game().players.length, 4); assert.deepEqual(game().withdrawn, []);
    const hostId = get().hostUid; await all[hostId].leave(); await db.flush();
    assert.notEqual(get().hostUid, hostId); assert.equal(game().status, 'playing', 'Host departure preserves a multi-player match');
    const nextHost = get().hostUid; await all[nextHost].leave(); await db.flush(); assert.equal(game().status, 'playing');
    const finalTwo = Object.keys(get().players); await all[finalTwo[0]].leave(); await db.flush();
    assert.equal(game().winner, finalTwo[1]); assert.equal(game().endReason, 'left');
    await all[finalTwo[1]].leave(); await db.flush(); assert.equal(get(), null);
    assert.equal(errors.length, 0, errors.map(String).join('\n'));
    console.log('PASS: darts RTDB 2–4 players, capacity/readiness, atomic throws, turns/starters, rematch, timers, recovery/host migration, departures and full Count-Up/Cricket.');
})().catch(error => { console.error(error); process.exitCode = 1; });
