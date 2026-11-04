/** node tools/darts-room-check.js — persistent Darts rooms on the real RTDB adapter. */
'use strict';
const assert = require('node:assert/strict');
const R = require('../js/games/darts-rules.js');
const createRoom = require('../js/games/darts-room.js');
(async () => {
    const modules = Object.assign({}, await import('../js/net/rooms.mjs'), await import('../js/net/rtdb-rooms.mjs'), await import('../js/net/rtdb-values.mjs'));
    const db = require('./helpers/rtdb-fixtures.js').realtimeGameBackend(modules);
    let clock = 1000, session = 0;
    const errors = [], clients = {};
    function make() {
        const id = 'darts-tab-' + ++session, user = { uid: 'same-account', name: id };
        const client = createRoom({ now: () => clock,
            net: { rooms: { presence: options => modules.createRoomPresence({ ...options, now: () => clock }),
                create: config => modules.createRoomService({ store: db.createStore(config, () => user, id, () => clock),
                    getUser: () => user, sessionId: id, generateCode: () => 'ABCD', now: () => clock }, config) } },
            onChange() {}, onError: e => errors.push(e),
            resolveThrow: th => ({ impact: { x: th.vel.x, y: th.vel.y, t: .2 }, result: R.hit(th.vel.x, th.vel.y) }),
        });
        clients[client.service.currentPlayer().uid] = client;
        return client;
    }
    const a = make(), b = make(), c = make(), d = make(), e = make();
    const A = a.service.currentPlayer().uid, B = b.service.currentPlayer().uid;
    const C = c.service.currentPlayer().uid, D = d.service.currentPlayer().uid;
    const get = () => db.get('darts_rooms/R-ABCD'), game = () => get().game;
    const flight = (base = 20, mult = 3) => ({ pos: { x: 0, y: -292, z: 0 }, vel: { x: base, y: mult, z: 12600 }, tempo: 1 });
    const active = () => clients[game().owners[game().active]];
    const ids = () => get().seatOrder;
    const wait = () => { clock = Math.max(clock + 1, game().readyAt || 0); };
    async function flush(result) { const value = await result; await db.flush(); return value; }
    async function shoot(base, mult) { wait(); assert.equal(await flush(active().submit(flight(base, mult))), true); }
    async function readyGuests(host) {
        for (const uid of Object.keys(get().players)) if (uid !== host) assert.equal(await flush(clients[uid].ready()), true);
    }
    async function fixture(fields) { await flush(a.service.update('ABCD', fields)); }

    // Solo starts without a second device; a local slot survives promotion unchanged.
    await flush(a.create({ mode: 'practice' }, [{ id: 'local-you', name: 'You' }]));
    assert.equal(get().phase, 'lobby'); assert.deepEqual(ids(), ['local-you']);
    assert.equal(get().participants['local-you'].controllerId, A);
    assert.equal(a.canStart(), true); assert.equal(await flush(a.start()), true);
    assert.equal(game().mode, 'practice'); assert.equal(game().turnMs, 0);
    const firstMatch = { ...game() };
    const dup = await Promise.all([a.submit(flight()), a.submit(flight())]); await db.flush();
    assert.equal(dup.filter(Boolean).length, 1); assert.equal(game().history.length, 1);
    assert.equal(game().history[0].darts.length, 1, 'A duplicate release cannot duplicate history');
    assert.equal(await a.submit({ ...flight(), vel: { x: 20, y: 3, z: NaN } }), false);
    clock += 100000; assert.equal(await flush(a.expire()), false, 'Timer Off never expires');
    assert.equal(await flush(a.backToLobby()), true);
    assert.equal(game().endReason, 'practice-ended'); assert.equal(game().winner, null);
    assert.equal(game().matchId, firstMatch.matchId); assert.equal(game().history.length, 1);
    assert.equal(get().phase, 'lobby');

    await flush(a.configure({ mode: '501' }));
    assert.equal(get().options.turnMs, 60000, 'Changing mode uses the same timer defaults as a local lobby');
    assert.equal(get().options.roundLimit, 15);
    assert.equal(a.canStart(), false); assert.equal(await flush(a.start()), false, '501 needs at least two slots');
    await flush(a.configure({ mode: 'cricket' }));
    assert.equal(a.canStart(), false, 'Cricket needs at least two slots');
    await flush(a.configure({ mode: 'countup' }));
    assert.equal(a.canStart(), true, 'Solo Count-Up can start');
    await flush(a.configure({ mode: 'practice', turnMs: 0 }));
    assert.equal(await flush(a.addLocalPlayer('Alice')), true);
    const aLocal = a.ownedPlayerIds(get()).find(id => id !== 'local-you');
    await flush(b.join(' r-abcd '));
    assert.equal(game().history.length, 1, 'A lobby join preserves finished match results');
    assert.equal(await flush(b.addLocalPlayer('Bob two')), true);
    const bSlots = b.ownedPlayerIds(get());
    assert.equal(bSlots.length, 2); assert.equal(ids().length, 4);
    await assert.rejects(c.join('ABCD'), error => error.code === 'room/full');
    assert.equal(await flush(a.addLocalPlayer('Overflow')), false);
    assert.equal(await flush(a.renamePlayer(bSlots[0], 'Impersonated')), false);
    assert.equal(await flush(a.removeLocalPlayer(bSlots[0])), false);
    assert.equal(await flush(b.removeLocalPlayer(bSlots[0])), true);
    assert.equal(await flush(b.addLocalPlayer('Bob two')), true);
    const bPracticeSlots = b.ownedPlayerIds(get());
    assert.equal(await flush(b.renamePlayer(bPracticeSlots[0], 'Bob')), true);
    assert.equal(await flush(a.renamePlayer(aLocal, 'Alice local')), true);

    // Device readiness covers both owned slots. A recovered connection keeps both.
    await readyGuests(A); assert.equal(await flush(a.start()), true);
    assert.equal(game().owners[aLocal], A);
    await flush(a.tick()); await flush(b.tick());
    db.disconnectPlayer(B); await db.flush();
    clock += 10000; await flush(a.tick());
    assert(bPracticeSlots.every(id => get().participants[id]), 'Grace period retains every slot of a disconnected controller');
    await flush(b.service.update('ABCD', { ['presence.' + B]: 999 }));
    clock += 6000; await flush(a.tick());
    assert(bPracticeSlots.every(id => get().participants[id]), 'Recovered controller keeps every local slot');
    await flush(b.leave());
    assert.equal(ids().length, 2); assert.equal(game().status, 'playing');
    assert(bPracticeSlots.every(id => game().withdrawn.includes(id)));
    assert.equal(game().players.length, 4, 'Departures never mutate the captured match roster');
    await assert.rejects(c.join('ABCD'), error => error.code === 'room/started');
    assert.equal(await flush(a.backToLobby()), true);
    await flush(b.join('ABCD')); await flush(b.addLocalPlayer('Bob two'));
    assert.equal(ids().length, 4);

    // Any material change invalidates all device Ready confirmations, including stale clicks.
    await flush(a.configure({ mode: '501', inRule: 'open', outRule: 'double', legsToWin: 2, roundLimit: 15, turnMs: 60000 }));
    assert.equal(await flush(b.configure({ outRule: 'open' })), false, 'Only host configures the next match');
    const staleReady = await Promise.all([a.configure({ outRule: 'open' }), b.ready()]); await db.flush();
    assert.equal(staleReady[0], true); assert.equal(staleReady[1], false);
    assert.deepEqual(get().ready, {}, 'A confirmation based on old rules is rejected atomically');
    await flush(b.ready()); assert.equal(get().ready[B], true);
    await flush(a.configure({ outRule: 'double' })); assert.deepEqual(get().ready, {});
    assert.equal(await flush(a.start()), false, 'Changed rules need a new confirmation');
    await readyGuests(A); assert.equal(await flush(a.start()), true);
    const capturedOptions = R.options(game(), game().players.length), capturedId = game().matchId;
    assert.equal(game().players.length, 4); assert.equal(Object.keys(game().owners).length, 4);
    assert.equal(await flush(a.configure({ mode: 'cricket' })), false);
    assert.equal(await flush(a.addLocalPlayer('Late')), false);
    assert.equal(await flush(a.removeLocalPlayer(aLocal)), false);
    assert.deepEqual(R.options(game(), 4), capturedOptions);
    const wrong = active() === a ? b : a;
    assert.equal(await flush(wrong.submit({ ...flight(), uid: game().active, controllerId: game().owners[game().active] })), false,
        'Caller-supplied IDs cannot impersonate another controller');
    assert.equal(await a.submit(flight(), firstMatch), false, 'Old match cannot submit into a newer match');
    const seatsSeen = [], devicesSeen = {};
    for (let turn = 0; turn < 4; turn++) {
        const slot = game().active, owner = game().owners[slot];
        seatsSeen.push(slot); devicesSeen[owner] = (devicesSeen[owner] || 0) + 1;
        for (let dart = 0; dart < 3; dart++) await shoot(20, 3);
    }
    assert.equal(new Set(seatsSeen).size, 4); assert.deepEqual(devicesSeen, { [game().owners[seatsSeen[0]]]: 2, [game().owners[seatsSeen.find(id => game().owners[id] !== game().owners[seatsSeen[0]])]]: 2 });
    assert(game().players.every(id => game().scores[id] === 321));
    assert.equal(game().history.length, 4);
    assert.deepEqual(a.current().data.game.history, b.current().data.game.history);

    // Actual 501 checkout, Leg rotation and retained room/history on match completion.
    const win1 = game().active, starter1 = game().legStarter;
    await fixture({ ['game.scores.' + win1]: 40, 'game.turnStartScore': 40 });
    await shoot(20, 2); assert.equal(game().status, 'between'); assert.equal(game().wins[win1], 1);
    wait(); const oldLeg = { ...game() };
    const legs = await Promise.all([a.nextLeg(oldLeg), b.nextLeg(oldLeg)]); await db.flush();
    assert.equal(legs.filter(Boolean).length, 1); assert.equal(game().leg, 2); assert.notEqual(game().legStarter, starter1);
    assert.equal(game().owners[aLocal], A); assert(game().history.length >= 5);
    while (game().active !== win1) { clock = game().turnStartedAt + game().turnMs; assert.equal(await flush(a.expire()), true); }
    await fixture({ ['game.scores.' + win1]: 40, 'game.turnStartScore': 40 });
    await shoot(20, 2); assert.equal(game().winner, win1); assert.equal(get().phase, 'results');
    assert.equal(game().wins[win1], 2); assert.equal(game().matchId, capturedId);
    await assert.rejects(c.join('ABCD'), error => error.code === 'room/started');
    assert.equal(await flush(b.backToLobby()), false); assert.equal(await flush(a.backToLobby()), true);
    const finishedHistory = structuredClone(game().history);
    assert.deepEqual(get().ready, {}); assert.equal(ids().length, 4);
    assert.deepEqual(game().history, finishedHistory, 'Back to Lobby retains finished results for viewing');

    // Switch mode in the same room and settle a full 5-round Count-Up with 50/50 Bulls.
    assert.equal(await flush(a.removeLocalPlayer(aLocal)), true);
    const bExtra = b.ownedPlayerIds(get())[1];
    assert.equal(await flush(b.removeLocalPlayer(bExtra)), true);
    assert.equal(await flush(b.removeLocalPlayer(b.ownedPlayerIds(get())[0])), false, 'Each connection retains one primary player');
    await flush(a.configure({ mode: 'countup', roundLimit: 5, bullMode: '50-50', legsToWin: 1, turnMs: 0 }));
    await readyGuests(A); assert.equal(await flush(a.start()), true);
    assert.notEqual(game().matchId, capturedId); assert.deepEqual(game().history, []);
    assert.equal(game().roundLimit, 5); assert.equal(game().bullMode, '50-50'); assert.equal(game().turnMs, 0);
    for (let dart = 0; dart < 30; dart++) await shoot(game().owners[game().active] === A ? 25 : 20, 1);
    const winner = game().players.find(id => game().owners[id] === A);
    assert.equal(game().winner, winner); assert.equal(game().scores[winner], 750);
    assert(game().players.every(id => game().turns[id] === 5));
    const outer = game().history.flatMap(row => row.darts).find(hit => hit.region === 'bull');
    assert.equal(outer.score, 50); assert.equal(outer.mult, 1, 'Configured Bull points retain the physical category');
    assert.equal(await flush(a.backToLobby()), true);

    // Four independent remote controllers share the same slot cap and Cricket penalty state.
    await flush(c.join('ABCD')); await flush(d.join('ABCD'));
    assert.equal(Object.keys(get().players).length, 4); assert.equal(ids().length, 4);
    await assert.rejects(e.join('ABCD'), error => error.code === 'room/full');
    await flush(a.configure({ mode: 'cricket', cricketVariant: 'cutthroat', roundLimit: 15, turnMs: 60000 }));
    await b.ready(); await c.ready(); await db.flush(); assert.equal(await a.start(), false);
    await flush(d.ready()); assert.equal(await flush(a.start()), true);
    const thrower = game().active, opponents = game().players.filter(id => id !== thrower);
    await fixture({ ['game.marks.' + thrower + '.20']: 2 });
    await shoot(20, 3);
    assert.equal(game().scores[thrower], 0);
    assert(opponents.every(id => game().scores[id] === 40), 'Every applicable opponent receives Cut-Throat penalties');
    assert.deepEqual(game().lastDart.penalties, Object.fromEntries(opponents.map(id => [id, 40])));
    assert.deepEqual(a.current().data.game, d.current().data.game);
    assert.equal(game().history[0].darts[0].label, 'T20');
    const disconnectedSlot = a.ownedPlayerIds(get())[0], stale = { ...game() };
    // All other peers first observe a valid heartbeat, then a silent host is evicted once.
    for (const client of [a, b, c, d]) await flush(client.tick());
    db.disconnectPlayer(A); await db.flush();
    clock += 10000; await flush(b.tick()); assert(get().players[A]);
    clock += 6000; await flush(b.tick());
    assert.equal(get().players[A], undefined); assert.equal(get().hostUid, B);
    assert.equal(get().participants[disconnectedSlot], undefined); assert(game().withdrawn.includes(disconnectedSlot));
    assert.equal(game().status, 'playing'); assert.equal(game().players.length, 4);
    assert.equal(await a.submit(flight(), stale), false);
    await flush(c.leave()); assert.equal(game().status, 'playing');
    await flush(d.leave()); assert.equal(game().status, 'over');
    assert.equal(game().winner, b.ownedPlayerIds(get())[0]); assert.equal(game().endReason, 'left');
    assert.equal(await flush(b.backToLobby()), true);
    await flush(e.join('ABCD')); assert.equal(ids().length, 2, 'Replacement joins the retained lobby');
    await flush(e.leave()); await flush(b.leave()); assert.equal(get(), null);
    await a.leave(); await c.leave(); await d.leave();

    // Legacy incomplete lobby values are migrated at start, without changing connection IDs.
    await flush(a.create({ mode: 'countup' }));
    const legacy = get();
    delete legacy.participants; delete legacy.seatOrder; delete legacy.phase; delete legacy.revision;
    legacy.options = { mode: 'countup', bestOf: 1 };
    db.put('darts_rooms/R-ABCD', legacy); await db.flush();
    assert.equal(await flush(a.start()), true);
    assert.deepEqual(game().players, [A]); assert.equal(game().owners[A], A);
    assert.equal(game().roundLimit, 8); assert.equal(game().legsToWin, 1);
    await flush(a.leave()); assert.equal(get(), null);
    assert.equal(errors.length, 0, errors.map(String).join('\n'));
    console.log('PASS: persistent Darts rooms, solo/mixed/4-device slots, ownership, Ready/configuration guards, rule snapshots, full matches, history, recovery and host migration.');
})().catch(error => { console.error(error); process.exitCode = 1; });
