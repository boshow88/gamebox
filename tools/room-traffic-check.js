/** node tools/room-traffic-check.js: deterministic SDK-operation budgets, not a Firebase billing meter. */
'use strict';
const assert = require('node:assert/strict');
const { memoryFirestore } = require('./helpers/room-fixtures.js');

(async () => {
    const { createRoomService } = await import('../js/net/rooms.mjs');
    const { createFirebaseRoomStore } = await import('../js/net/firebase-rooms.mjs');
    async function scenario(optimized, active) {
        const backend = memoryFirestore(); let clock = 1000, counter = 0;
        const store = createFirebaseRoomStore(backend.sdk, backend.db, 'rooms', { now: () => clock });
        backend.put('rooms/ABCD', { players: { you: {}, peer: {} }, game: { matchId: 'm', round: 1, status: 'playing' } });
        const service = createRoomService({ store, getUser: () => ({ uid: 'you' }), now: () => clock },
            { presenceField: optimized ? 'presence' : null });
        const stops = [store.watch('ABCD', () => {}), store.watch('ABCD', () => {})];
        await backend.flush(); const initialEvents = backend.usage.listenerEvents;
        for (let second = 0; second < 60; second++) {
            clock = 1000 + second * 1000;
            if (active && second % 2 === 0) await service.updateMatch('ABCD', { matchId: 'm', round: 1, status: 'playing' },
                () => ({ 'game.board.you': [second] }));
            if (optimized) await service.heartbeat('ABCD');
            else if (second % 3 === 0) await store.update('ABCD', { 'presence.you': ++counter });
            await backend.flush();
        }
        stops.forEach(stop => stop());
        return { writes: backend.usage.writes, notifications: backend.usage.listenerEvents - initialEvents,
            transactionReads: backend.usage.transactionReads, board: backend.get('rooms/ABCD').game.board };
    }
    const baseline = await scenario(false, true), optimized = await scenario(true, true);
    assert.equal(baseline.writes, 50); assert.equal(optimized.writes, 30);
    assert.equal(baseline.notifications, 100); assert.equal(optimized.notifications, 60);
    assert.deepEqual(optimized.board, baseline.board, 'Every visible gameplay update is still sent');
    assert.equal(optimized.transactionReads, baseline.transactionReads, 'Guarded gameplay writes still use transactions');
    const idleBaseline = await scenario(false, false), idle = await scenario(true, false);
    assert.equal(idle.writes, idleBaseline.writes, 'Silent players keep the same heartbeat interval');

    const backend = memoryFirestore(); let clock = 1000;
    const store = createFirebaseRoomStore(backend.sdk, backend.db, 'test', { now: () => clock });
    const service = createRoomService({ store, getUser: () => ({ uid: 'you' }), now: () => clock }, { presenceField: 'presence' });
    backend.put('test/ABCD', { players: { you: {} }, ready: {}, game: { matchId: 'm', round: 1, status: 'playing', board: [1] } });
    const guard = { matchId: 'm', round: 1, status: 'playing' };
    for (let i = 0; i < 8; i++) await service.updateMatch('ABCD', guard, () => ({ 'game.board': [1] }));
    assert.equal(backend.usage.writes, 0, 'Identical board updates do not write a timestamp or presence counter');
    assert.equal(await service.heartbeat('ABCD'), true, 'No-op updates must not postpone a needed heartbeat');
    assert.equal(await service.heartbeat('ABCD'), false);
    clock += 3000;
    const beforeHeartbeat = backend.usage.writes;
    await Promise.all(Array.from({ length: 8 }, () => service.heartbeat('ABCD')));
    assert.equal(backend.usage.writes - beforeHeartbeat, 1, 'Only one heartbeat can be in flight');
    clock += 3000;
    await service.updateMatch('ABCD', guard, () => ({ 'game.board': [2] }));
    assert.equal(await service.heartbeat('ABCD'), false, 'A committed action replaces an extra heartbeat');
    clock += 3000;
    await service.updateMatch('ABCD', { ...guard, round: 999 }, () => ({ 'game.board': [3] }));
    assert.equal(await service.heartbeat('ABCD'), true, 'Rejected stale actions do not refresh liveness');
    const withPeer = backend.get('test/ABCD'); withPeer.players.peer = {};
    backend.put('test/ABCD', withPeer);
    const peer = createRoomService({ store, getUser: () => ({ uid: 'peer' }), now: () => clock }, { presenceField: 'presence' });
    clock += 3000;
    await peer.updateMatch('ABCD', guard, () => ({ 'game.peerCard': 'changed' }));
    assert.equal(await service.heartbeat('ABCD'), true, 'Another player\'s activity must not suppress our own liveness signal');

    let attempts = 0;
    const failing = createRoomService({ store: { ...store, update: async (...args) => {
        if (++attempts === 1) throw new Error('temporary failure');
        return store.update(...args);
    } }, getUser: () => ({ uid: 'you' }), now: () => clock }, { presenceField: 'presence' });
    await assert.rejects(failing.heartbeat('ABCD'), /temporary failure/);
    assert.equal(await failing.heartbeat('ABCD'), false, 'An outage must not cause a retry on every watchdog tick');
    clock += 3000;
    assert.equal(await failing.heartbeat('ABCD'), true, 'A failed heartbeat retries without extending liveness');

    const acknowledgements = [];
    const delayed = createRoomService({ store: { ...store, update: () => new Promise(resolve => acknowledgements.push(resolve)) },
        getUser: () => ({ uid: 'you' }), now: () => clock }, { presenceField: 'presence' });
    const firstBeat = delayed.heartbeat('ABCD');
    const sameInterval = delayed.heartbeat('ABCD');
    assert.equal(acknowledgements.length, 1);
    clock += 3000;
    const secondBeat = delayed.heartbeat('ABCD');
    assert.equal(acknowledgements.length, 2, 'A delayed acknowledgement cannot block the next scheduled beat');
    acknowledgements[1](); await secondBeat;
    clock += 3000;
    acknowledgements[0](); await Promise.all([firstBeat, sameInterval]);
    const thirdBeat = delayed.heartbeat('ABCD');
    assert.equal(acknowledgements.length, 3, 'A late old acknowledgement cannot postpone the next heartbeat');
    acknowledgements[2](); await thirdBeat;

    for (let i = 0; i < 25; i++) backend.put('test/OLD' + i, { lastActionAt: 0 });
    clock = 1000000;
    const sharedStore = createFirebaseRoomStore(backend.sdk, backend.db, 'test', { now: () => clock });
    const beforeQueries = backend.usage.queries;
    await Promise.all([store.cleanup(), sharedStore.cleanup(), store.cleanup()]);
    assert.equal(backend.usage.queries - beforeQueries, 1, 'Services share the in-flight cleanup query');
    assert.equal(backend.usage.deletes, 20, 'Cleanup work is capped per pass');
    await store.cleanup(); assert.equal(backend.usage.queries - beforeQueries, 1);
    clock += 60000;
    await sharedStore.cleanup(); assert.equal(backend.usage.queries - beforeQueries, 2);
    assert.equal(backend.usage.deletes, 25);
    console.log('PASS: active minute per player: writes 50 -> 30, two-listener notifications 100 -> 60; idle cadence and guarded transactions unchanged.');
    console.log('PASS: duplicate payloads, heartbeat coalescing/failures and bounded cleanup query budgets.');
})().catch(err => { console.error(err); process.exitCode = 1; });
