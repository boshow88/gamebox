/** node tools/room-traffic-check.js: deterministic SDK-operation budgets, not a Firebase billing meter. */
'use strict';
const assert = require('node:assert/strict');
const { realtimeGameBackend } = require('./helpers/rtdb-fixtures.js');

(async () => {
    const { createRoomService } = await import('../js/net/rooms.mjs');
    const modules = Object.assign({}, await import('../js/net/rtdb-rooms.mjs'), await import('../js/net/rtdb-values.mjs'));
    const memoryRooms = () => realtimeGameBackend(modules);
    async function scenario(optimized, active) {
        const backend = memoryRooms(); let clock = 1000, counter = 0;
        const store = backend.createStore({ collection: 'rooms' }, () => null, '', () => clock);
        backend.put('rooms/R-ABCD', { players: { you: {}, peer: {} }, game: { matchId: 'm', round: 1, status: 'playing' } });
        const service = createRoomService({ store, getUser: () => ({ uid: 'you' }), now: () => clock },
            { presenceField: optimized ? 'presence' : null });
        const stops = [store.watch('R-ABCD', () => {}), store.watch('R-ABCD', () => {})];
        await backend.flush(); const initialEvents = backend.usage.listenerEvents, initialWrites = backend.usage.writes;
        for (let second = 0; second < 60; second++) {
            clock = 1000 + second * 1000;
            if (active && second % 2 === 0) await service.updateMatch('R-ABCD', { matchId: 'm', round: 1, status: 'playing' },
                () => ({ 'game.board.you': [second] }));
            if (optimized) await service.heartbeat('R-ABCD');
            else if (second % 3 === 0) await store.update('R-ABCD', { 'presence.you': ++counter });
            await backend.flush();
        }
        stops.forEach(stop => stop());
        return { writes: backend.usage.writes - initialWrites, notifications: backend.usage.listenerEvents - initialEvents,
            transactionReads: backend.usage.transactionReads, board: backend.get('rooms/R-ABCD').game.board };
    }
    const baseline = await scenario(false, true), optimized = await scenario(true, true);
    assert.equal(baseline.writes, 50); assert.equal(optimized.writes, 30);
    assert.equal(baseline.notifications, 100); assert.equal(optimized.notifications, 60);
    assert.deepEqual(optimized.board, baseline.board, 'Every visible gameplay update is still sent');
    assert.equal(optimized.transactionReads, baseline.transactionReads, 'Guarded gameplay writes still use transactions');
    const idleBaseline = await scenario(false, false), idle = await scenario(true, false);
    assert.equal(idle.writes, idleBaseline.writes, 'Silent players keep the same heartbeat interval');

    const backend = memoryRooms(); let clock = 1000;
    const store = backend.createStore({ collection: 'test' }, () => null, '', () => clock);
    const service = createRoomService({ store, getUser: () => ({ uid: 'you' }), now: () => clock }, { presenceField: 'presence' });
    backend.put('test/R-ABCD', { players: { you: {} }, ready: {}, game: { matchId: 'm', round: 1, status: 'playing', board: [1] } });
    const guard = { matchId: 'm', round: 1, status: 'playing' };
    const seededWrites = backend.usage.writes;
    for (let i = 0; i < 8; i++) await service.updateMatch('R-ABCD', guard, () => ({ 'game.board': [1] }));
    assert.equal(backend.usage.writes, seededWrites, 'Identical board updates do not write a timestamp or presence counter');
    assert.equal(await service.heartbeat('R-ABCD'), true, 'No-op updates must not postpone a needed heartbeat');
    assert.equal(await service.heartbeat('R-ABCD'), false);
    clock += 3000;
    const beforeHeartbeat = backend.usage.writes;
    await Promise.all(Array.from({ length: 8 }, () => service.heartbeat('R-ABCD')));
    assert.equal(backend.usage.writes - beforeHeartbeat, 1, 'Only one heartbeat can be in flight');
    clock += 3000;
    await service.updateMatch('R-ABCD', guard, () => ({ 'game.board': [2] }));
    assert.equal(await service.heartbeat('R-ABCD'), false, 'A committed action replaces an extra heartbeat');
    clock += 3000;
    await service.updateMatch('R-ABCD', { ...guard, round: 999 }, () => ({ 'game.board': [3] }));
    assert.equal(await service.heartbeat('R-ABCD'), true, 'Rejected stale actions do not refresh liveness');
    const withPeer = backend.get('test/R-ABCD'); withPeer.players.peer = {};
    backend.put('test/R-ABCD', withPeer);
    const peer = createRoomService({ store, getUser: () => ({ uid: 'peer' }), now: () => clock }, { presenceField: 'presence' });
    clock += 3000;
    await peer.updateMatch('R-ABCD', guard, () => ({ 'game.peerCard': 'changed' }));
    assert.equal(await service.heartbeat('R-ABCD'), true, 'Another player\'s activity must not suppress our own liveness signal');

    let attempts = 0;
    const failing = createRoomService({ store: { ...store, update: async (...args) => {
        if (++attempts === 1) throw new Error('temporary failure');
        return store.update(...args);
    } }, getUser: () => ({ uid: 'you' }), now: () => clock }, { presenceField: 'presence' });
    await assert.rejects(failing.heartbeat('R-ABCD'), /temporary failure/);
    assert.equal(await failing.heartbeat('R-ABCD'), false, 'An outage must not cause a retry on every watchdog tick');
    clock += 3000;
    assert.equal(await failing.heartbeat('R-ABCD'), true, 'A failed heartbeat retries without extending liveness');

    const acknowledgements = [];
    const delayed = createRoomService({ store: { ...store, update: () => new Promise(resolve => acknowledgements.push(resolve)) },
        getUser: () => ({ uid: 'you' }), now: () => clock }, { presenceField: 'presence' });
    const firstBeat = delayed.heartbeat('R-ABCD');
    const sameInterval = delayed.heartbeat('R-ABCD');
    assert.equal(acknowledgements.length, 1);
    clock += 3000;
    const secondBeat = delayed.heartbeat('R-ABCD');
    assert.equal(acknowledgements.length, 2, 'A delayed acknowledgement cannot block the next scheduled beat');
    acknowledgements[1](); await secondBeat;
    clock += 3000;
    acknowledgements[0](); await Promise.all([firstBeat, sameInterval]);
    const thirdBeat = delayed.heartbeat('R-ABCD');
    assert.equal(acknowledgements.length, 3, 'A late old acknowledgement cannot postpone the next heartbeat');
    acknowledgements[2](); await thirdBeat;

    for (let i = 0; i < 25; i++) backend.put('test/R-' + String(i).padStart(4, '0'), { lastActionAt: 0 });
    clock = 1000000;
    const beforeQueries = backend.usage.queries;
    await Promise.all([store.cleanup(), store.cleanup(), store.cleanup()]);
    assert.equal(backend.usage.queries - beforeQueries, 1, 'Concurrent cleanup calls share the in-flight query');
    assert.equal(backend.usage.deletes, 20, 'Cleanup work is capped per pass');
    await store.cleanup(); assert.equal(backend.usage.queries - beforeQueries, 1);
    clock += 60000;
    await store.cleanup(); assert.equal(backend.usage.queries - beforeQueries, 2);
    assert.equal(backend.usage.deletes, 25);
    console.log('PASS: active minute per player: writes 50 -> 30, two-listener notifications 100 -> 60; idle cadence and guarded transactions unchanged.');
    console.log('PASS: duplicate payloads, heartbeat coalescing/failures and bounded cleanup query budgets.');
})().catch(err => { console.error(err); process.exitCode = 1; });
