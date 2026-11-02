/** node tools/rtdb-room-check.js: RTDB store/codec/routing contracts with no network. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { memoryRealtimeDatabase } = require('./helpers/rtdb-fixtures.js');
const { memoryFirestore, gameClient } = require('./helpers/room-fixtures.js');

(async () => {
    const { createRoomService, createRoomPresence } = await import('../js/net/rooms.mjs');
    const { createRealtimeRoomStore } = await import('../js/net/rtdb-rooms.mjs');
    const { encodeRoomValue, decodeRoomValue } = await import('../js/net/rtdb-values.mjs');
    const { createFirebaseRoomStore } = await import('../js/net/firebase-rooms.mjs');
    const { createRoomRoutingStore } = await import('../js/net/room-routing.mjs');
    const value = { ready: {}, cards: [], board: [null, { e: 'fire', h: 1 }, null], slots: ['host', null],
        game: { winner: null, answers: {}, hp: { host: 3 } } };
    assert.deepEqual(decodeRoomValue(encodeRoomValue(value)), value);
    for (const key of ['bad.key', 'bad/key', 'bad#key', 'bad$key', 'bad[key]', '__room_type']) {
        assert.throws(() => encodeRoomValue({ [key]: true }), /Invalid/);
    }
    assert.throws(() => encodeRoomValue({ missing: undefined }), /finite JSON/);
    const native = memoryRealtimeDatabase(); let clock = 1000;
    const hostSDK = native.clientSDK(), peerSDK = native.clientSDK();
    const hostStore = createRealtimeRoomStore(hostSDK, native.db, 'beam_rooms', { now: () => clock, presenceField: 'presence', getPlayerId: () => 'host' });
    const peerStore = createRealtimeRoomStore(peerSDK, native.db, 'beam_rooms', { now: () => clock, presenceField: 'presence', getPlayerId: () => 'peer' });
    const config = { presenceField: 'presence', startPatch: () => ({ game: { matchId: 'ignored', status: 'playing', round: 1, hp: 3, answers: {}, cards: [] } }) };
    const host = createRoomService({ store: hostStore, getUser: () => ({ uid: 'host' }), generateCode: () => 'ABCD', now: () => clock }, config);
    const peer = createRoomService({ store: peerStore, getUser: () => ({ uid: 'peer' }), now: () => clock }, config);
    await host.create(); await peer.join('ABCD'); await peer.setReady('ABCD'); await host.start('ABCD'); await native.flush();
    const first = await hostStore.get('ABCD');
    assert(first.game.matchId && first.game.matchId !== 'ignored');
    assert.deepEqual(first.game.answers, {}); assert.deepEqual(first.game.cards, []);
    await hostStore.update('ABCD', { 'game.answers.host': { r: 0, c: 1, side: 0 } });
    assert.deepEqual((await peerStore.get('ABCD')).game.answers, { host: { r: 0, c: 1, side: 0 } }, 'Adding a child to an encoded empty map remains visible');
    const guard = { matchId: first.game.matchId, round: 1, status: 'playing' };
    const resolved = await Promise.all([host.settleRound('ABCD', guard, data => ({ 'game.hp': data.game.hp - 1, 'game.round': 2 })),
        peer.settleRound('ABCD', guard, data => ({ 'game.hp': data.game.hp - 1, 'game.round': 2 }))]);
    assert.equal(resolved.filter(Boolean).length, 1); assert.equal((await hostStore.get('ABCD')).game.hp, 2);
    clock += 3000;
    await Promise.all([host.updateMatch('ABCD', { ...guard, round: 2 }, () => ({ 'game.cards': ['card'] })), host.heartbeat('ABCD')]);
    assert.deepEqual((await peerStore.get('ABCD')).game.cards, ['card'], 'Child updates must not cancel a local transaction');
    await assert.rejects(peer.join('MISSING'), /not found/, 'A true missing room is distinct from a cold transaction cache');

    const presence = createRoomPresence({ timeoutMs: 15000, now: () => clock });
    presence.observe(await hostStore.get('ABCD'));
    const seenAt = clock;
    clock += 5000; native.disconnect(peerSDK); await native.flush();
    assert.equal((await hostStore.get('ABCD')).presence.peer, -1, 'onDisconnect records transport loss on the server');
    presence.observe(await hostStore.get('ABCD'));
    clock = seenAt + 14999; assert(presence.isAvailable('peer'));
    clock++; assert(!presence.isAvailable('peer'), 'The disconnect marker does not restart or shorten the existing deadline');
    native.reconnect(peerSDK); await native.flush();
    assert(peerSDK._client.disconnects.size > 0, 'Disconnect operations are rearmed after reconnect');
    await peer.heartbeat('ABCD'); presence.observe(await hostStore.get('ABCD'));
    assert(presence.isAvailable('peer'));
    await peer.leave('ABCD'); await host.leave('ABCD'); await native.flush();
    native.disconnect(hostSDK); await native.flush();
    assert.equal(await hostStore.get('ABCD'), null, 'Leaving cancels the old disconnect hook');
    const lateSDK = native.clientSDK();
    native.put('rooms/beam_rooms/R-LATE', encodeRoomValue({ code: 'R-LATE', players: { late: {} } }));
    const lateStore = createRealtimeRoomStore(lateSDK, native.db, 'beam_rooms', { presenceField: 'presence', getPlayerId: () => 'late' });
    const stopLate = lateStore.watch('R-LATE', () => { throw new Error('detached callback'); });
    stopLate(); await native.flush();
    assert.equal(lateSDK._client.disconnects.size, 0, 'A detached snapshot must not register stale disconnect operations');

    // Cleanup rechecks lastActionAt inside a transaction, protecting a room revived after the query.
    const raceSDK = native.clientSDK(), originalGet = raceSDK.get;
    native.put('rooms/duel_rooms/RACE', encodeRoomValue({ code: 'RACE', lastActionAt: 0, players: { host: {} } }));
    clock = 1000000;
    raceSDK.get = async target => {
        const snap = await originalGet(target);
        if (target.constraints) native.put('rooms/duel_rooms/RACE', encodeRoomValue({ code: 'RACE', lastActionAt: clock, players: { host: {} } }));
        return snap;
    };
    const raceStore = createRealtimeRoomStore(raceSDK, native.db, 'duel_rooms', { now: () => clock });
    assert.equal(await raceStore.cleanup(), 0);
    assert(await raceStore.get('RACE'));

    const firestore = memoryFirestore();
    const legacy = createFirebaseRoomStore(firestore.sdk, firestore.db, 'beam_rooms');
    const oldHost = createRoomService({ store: legacy, getUser: () => ({ uid: 'old-host' }), generateCode: () => 'OLD1' }, {});
    await oldHost.create();
    const routes = createRoomRoutingStore(hostStore, legacy);
    const readsBeforeCreate = firestore.usage.documentReads;
    const modern = createRoomService({ store: routes, getUser: () => ({ uid: 'host' }), generateCode: () => 'R-NEW1' }, {});
    assert.equal(await modern.create(), 'R-NEW1', 'New codes use a separate namespace from Firestore rooms');
    assert.equal(firestore.usage.documentReads, readsBeforeCreate, 'New RTDB rooms do not probe Firestore');
    assert(await hostStore.get('R-NEW1')); assert.equal(await hostStore.get('OLD1'), null);
    assert.equal(await modern.join('OLD1'), 'OLD1');
    await modern.setReady('OLD1');
    assert.equal(firestore.get('beam_rooms/OLD1').ready.host, true, 'Legacy joins and readiness stay in Firestore');
    const fsReads = firestore.usage.documentReads;
    const onlyRTDB = createRoomService({ store: createRoomRoutingStore(hostStore), getUser: () => ({ uid: 'host' }), generateCode: () => 'R-NEW2' }, {});
    await onlyRTDB.create();
    assert.equal(firestore.usage.documentReads, fsReads, 'RTDB-only mode never probes Firestore rooms');
    let fallbackReads = 0;
    const denied = createRoomRoutingStore({ transact: async () => { throw new Error('PERMISSION_DENIED'); } }, { transact: async () => { fallbackReads++; return {}; } });
    await assert.rejects(denied.transact('R-ABCD', () => ({}), { intent: 'join' }), /PERMISSION_DENIED/);
    assert.equal(fallbackReads, 0, 'A denied RTDB operation must not silently create a second room');
    let callback, changes = 0;
    const delayed = createRoomRoutingStore({ watch: (_code, cb) => { callback = cb; return () => {}; } });
    const detach = delayed.watch('R-ABCD', () => changes++); detach(); callback({ code: 'R-ABCD' });
    await native.flush(); assert.equal(changes, 0);
    const rules = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../database.rules.json'), 'utf8'));
    assert.equal(rules.rules['.read'], false); assert.equal(rules.rules['.write'], false);
    assert(rules.rules.rooms.$game['.read'].includes('auth != null'));
    const modules = { createRoomService, createRoomPresence, createRealtimeRoomStore, encodeRoomValue, decodeRoomValue };
    const beamDB = require('./helpers/rtdb-fixtures.js').realtimeGameBackend(modules);
    let beamClock = 1000;
    const beamHost = gameClient('beam', beamDB, modules, 'host', () => beamClock);
    const beamPeer = gameClient('beam', beamDB, modules, 'peer', () => beamClock);
    beamHost.api.create(); await beamDB.flush(); beamPeer.api.join('ABCD'); await beamDB.flush();
    beamPeer.api.ready(); await beamDB.flush(); beamHost.api.start(); await beamDB.flush();
    beamDB.disconnectPlayer(beamPeer.service.currentPlayer().uid); await beamDB.flush();
    beamClock = 8999; beamHost.api.tick(); await beamDB.flush();
    assert.equal(beamDB.get('beam_rooms/ABCD').game.status, 'playing', 'The native marker keeps Beam\'s existing 8-second grace');
    beamClock = 9001; beamHost.api.tick(); await beamDB.flush();
    assert.equal(beamDB.get('beam_rooms/ABCD').game.status, 'over');
    assert.equal(beamDB.get('beam_rooms/ABCD').game.winner, beamHost.service.currentPlayer().uid);
    console.log('PASS: RTDB lossless values, cold caches, concurrent settlement, local write ordering, reconnect presence, safe cleanup and legacy routing.');
    console.log('Rules JSON checked; publish in Firebase Console or run the official emulator to validate server rule behavior.');
})().catch(err => { console.error(err); process.exitCode = 1; });
