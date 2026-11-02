/** node tools/rtdb-room-check.js: RTDB store/codec contracts with no network. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { memoryRealtimeDatabase } = require('./helpers/rtdb-fixtures.js');
const { gameClient } = require('./helpers/room-fixtures.js');

(async () => {
    const { createRoomService, createRoomPresence } = await import('../js/net/rooms.mjs');
    const { createRealtimeRoomStore } = await import('../js/net/rtdb-rooms.mjs');
    const { encodeRoomValue, decodeRoomValue } = await import('../js/net/rtdb-values.mjs');
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
    const host = createRoomService({ store: hostStore, getUser: () => ({ uid: 'host' }), generateCode: () => 'R-ABCD', now: () => clock }, config);
    const peer = createRoomService({ store: peerStore, getUser: () => ({ uid: 'peer' }), now: () => clock }, config);
    await host.create(); await peer.join('R-ABCD'); await peer.setReady('R-ABCD'); await host.start('R-ABCD'); await native.flush();
    const first = await hostStore.get('R-ABCD');
    assert(first.game.matchId && first.game.matchId !== 'ignored');
    assert.deepEqual(first.game.answers, {}); assert.deepEqual(first.game.cards, []);
    await hostStore.update('R-ABCD', { 'game.answers.host': { r: 0, c: 1, side: 0 } });
    assert.deepEqual((await peerStore.get('R-ABCD')).game.answers, { host: { r: 0, c: 1, side: 0 } }, 'Adding a child to an encoded empty map remains visible');
    const guard = { matchId: first.game.matchId, round: 1, status: 'playing' };
    const resolved = await Promise.all([host.settleRound('R-ABCD', guard, data => ({ 'game.hp': data.game.hp - 1, 'game.round': 2 })),
        peer.settleRound('R-ABCD', guard, data => ({ 'game.hp': data.game.hp - 1, 'game.round': 2 }))]);
    assert.equal(resolved.filter(Boolean).length, 1); assert.equal((await hostStore.get('R-ABCD')).game.hp, 2);
    clock += 3000;
    await Promise.all([host.updateMatch('R-ABCD', { ...guard, round: 2 }, () => ({ 'game.cards': ['card'] })), host.heartbeat('R-ABCD')]);
    assert.deepEqual((await peerStore.get('R-ABCD')).game.cards, ['card'], 'Child updates must not cancel a local transaction');
    await assert.rejects(peer.join('R-MISS'), /not found/, 'A true missing room is distinct from a cold transaction cache');

    const presence = createRoomPresence({ timeoutMs: 15000, now: () => clock });
    presence.observe(await hostStore.get('R-ABCD'));
    const seenAt = clock;
    clock += 5000; native.disconnect(peerSDK); await native.flush();
    assert.equal((await hostStore.get('R-ABCD')).presence.peer, -1, 'onDisconnect records transport loss on the server');
    presence.observe(await hostStore.get('R-ABCD'));
    clock = seenAt + 14999; assert(presence.isAvailable('peer'));
    clock++; assert(!presence.isAvailable('peer'), 'The disconnect marker does not restart or shorten the existing deadline');
    native.reconnect(peerSDK); await native.flush();
    assert(peerSDK._client.disconnects.size > 0, 'Disconnect operations are rearmed after reconnect');
    await peer.heartbeat('R-ABCD'); presence.observe(await hostStore.get('R-ABCD'));
    assert(presence.isAvailable('peer'));
    await peer.leave('R-ABCD'); await host.leave('R-ABCD'); await native.flush();
    native.disconnect(hostSDK); await native.flush();
    assert.equal(await hostStore.get('R-ABCD'), null, 'Leaving cancels the old disconnect hook');
    const lateSDK = native.clientSDK();
    native.put('rooms/beam_rooms/R-LATE', encodeRoomValue({ code: 'R-LATE', players: { late: {} } }));
    const lateStore = createRealtimeRoomStore(lateSDK, native.db, 'beam_rooms', { presenceField: 'presence', getPlayerId: () => 'late' });
    const stopLate = lateStore.watch('R-LATE', () => { throw new Error('detached callback'); });
    stopLate(); await native.flush();
    assert.equal(lateSDK._client.disconnects.size, 0, 'A detached snapshot must not register stale disconnect operations');

    // Cleanup rechecks lastActionAt inside a transaction, protecting a room revived after the query.
    const raceSDK = native.clientSDK(), originalGet = raceSDK.get;
    native.put('rooms/duel_rooms/R-RACE', encodeRoomValue({ code: 'R-RACE', lastActionAt: 0, players: { host: {} } }));
    clock = 1000000;
    raceSDK.get = async target => {
        const snap = await originalGet(target);
        if (target.constraints) native.put('rooms/duel_rooms/R-RACE', encodeRoomValue({ code: 'R-RACE', lastActionAt: clock, players: { host: {} } }));
        return snap;
    };
    const raceStore = createRealtimeRoomStore(raceSDK, native.db, 'duel_rooms', { now: () => clock });
    assert.equal(await raceStore.cleanup(), 0);
    assert(await raceStore.get('R-RACE'));

    // Retired/malformed codes never reach RTDB, including traversal-like input.
    const beforeInvalid = { ...native.usage };
    for (const code of ['ABCD', 'R-ABC', 'R-ABCDE', '../rooms', 'R-A/BC']) {
        await assert.rejects(peer.join(code), { code: 'room/not-found' });
        assert.equal(await hostStore.get(code), null);
        await assert.rejects(hostStore.update(code, { status: 'lobby' }), { code: 'room/not-found' });
        await assert.rejects(hostStore.remove(code), { code: 'room/not-found' });
        let delivered = false;
        hostStore.watch(code, data => { assert.equal(data, null); delivered = true; });
        let late = false;
        const detach = hostStore.watch(code, () => { late = true; }); detach();
        await native.flush(); assert(delivered); assert.equal(late, false);
    }
    assert.deepEqual(native.usage, beforeInvalid, 'Invalid codes perform no SDK operations');
    const denied = createRealtimeRoomStore({ ...native.clientSDK(), runTransaction: async () => {
        throw new Error('PERMISSION_DENIED');
    } }, native.db, 'beam_rooms');
    await assert.rejects(denied.transact('R-ABCD', () => ({})), /PERMISSION_DENIED/);
    const rules = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../database.rules.json'), 'utf8'));
    assert.equal(rules.rules['.read'], false); assert.equal(rules.rules['.write'], false);
    assert(rules.rules.rooms.$game['.read'].includes('auth != null'));
    const modules = { createRoomService, createRoomPresence, createRealtimeRoomStore, encodeRoomValue, decodeRoomValue };
    const beamDB = require('./helpers/rtdb-fixtures.js').realtimeGameBackend(modules);
    let beamClock = 1000;
    const beamHost = gameClient('beam', beamDB, modules, 'host', () => beamClock);
    const beamPeer = gameClient('beam', beamDB, modules, 'peer', () => beamClock);
    beamHost.api.create(); await beamDB.flush(); beamPeer.api.join('R-ABCD'); await beamDB.flush();
    beamPeer.api.ready(); await beamDB.flush(); beamHost.api.start(); await beamDB.flush();
    beamDB.disconnectPlayer(beamPeer.service.currentPlayer().uid); await beamDB.flush();
    beamClock = 8999; beamHost.api.tick(); await beamDB.flush();
    assert.equal(beamDB.get('beam_rooms/R-ABCD').game.status, 'playing', 'The native marker keeps Beam\'s existing 8-second grace');
    beamClock = 9001; beamHost.api.tick(); await beamDB.flush();
    assert.equal(beamDB.get('beam_rooms/R-ABCD').game.status, 'over');
    assert.equal(beamDB.get('beam_rooms/R-ABCD').game.winner, beamHost.service.currentPlayer().uid);
    console.log('PASS: RTDB lossless values, cold caches, concurrent settlement, local write ordering, reconnect presence, safe cleanup and retired-code rejection.');
    console.log('Rules JSON checked; publish in Firebase Console or run the official emulator to validate server rule behavior.');
})().catch(err => { console.error(err); process.exitCode = 1; });
