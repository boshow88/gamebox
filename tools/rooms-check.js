/** Run with `node tools/rooms-check.js`. Tests the shared service and actual Firebase adapter offline. */
'use strict';
const assert = require('node:assert/strict');
const { memoryFirestore } = require('./helpers/room-fixtures.js');

(async () => {
    const { createRoomService, createRoomPresence } = await import('../js/net/rooms.mjs');
    const { createFirebaseRoomStore } = await import('../js/net/firebase-rooms.mjs');
    const backend = memoryFirestore();
    const store = group => createFirebaseRoomStore(backend.sdk, backend.db, group);
    const user = uid => ({ uid, name: uid });
    const service = (uid, config = {}, group = 'test_rooms') => createRoomService({
        store: store(group), getUser: () => user(uid), generateCode: () => 'ABCD', sessionId: uid,
    }, { maxPlayers: 3, ...config });
    const host = service('host'), guest = service('guest'), other = service('other'), observer = service('observer');
    await host.create();
    const created = backend.get('test_rooms/ABCD');
    assert.equal(typeof created.createdAt, 'number');
    assert(created.expireAt instanceof Date);

    // Contending joiners cannot exceed capacity or overwrite one another.
    const contenders = Array.from({ length: 12 }, (_, i) => service('contender' + i));
    const results = await Promise.allSettled(contenders.map(client => client.join('abcd')));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
    assert.equal(Object.keys(backend.get('test_rooms/ABCD').players).length, 3);
    for (const client of contenders) await client.leave('ABCD');
    await guest.join('ABCD'); await other.join('ABCD');
    assert.equal(await host.start('ABCD'), false, 'Readiness is checked inside the transaction');
    await assert.rejects(observer.setReady('ABCD'), { code: 'room/spectator' });
    await guest.setReady('ABCD'); await other.setReady('ABCD');
    assert.equal(await guest.start('ABCD'), false, 'Guests cannot start a host-controlled room');
    const starts = await Promise.all([host.start('ABCD'), host.start('ABCD'), host.start('ABCD')]);
    assert.equal(starts.filter(Boolean).length, 1, 'Concurrent start requests cannot replace an already-started match');
    assert.equal(await host.reset('ABCD'), false, 'An active match cannot accidentally be reset');
    assert.equal(await guest.setReady('ABCD'), false, 'Ready clicks during a match do not carry into the rematch');
    await host.update('ABCD', { 'game.status': 'over' });
    assert.equal(await guest.reset('ABCD'), false, 'Only the host resets a room');
    await host.reset('ABCD');
    assert.deepEqual(backend.get('test_rooms/ABCD').ready, {});

    // Once-only settlement uses the latest committed data, not a stale caller snapshot.
    const roundConfig = { startPatch: () => ({ game: { status: 'playing', round: 1, hp: 10 } }) };
    const roundHost = service('round-host', roundConfig, 'round_rooms'), roundGuest = service('round-guest', roundConfig, 'round_rooms');
    await roundHost.create(); await roundGuest.join('ABCD'); await roundGuest.setReady('ABCD'); await roundHost.start('ABCD');
    const version = backend.get('round_rooms/ABCD').game;
    assert(version.matchId);
    await roundHost.update('ABCD', { 'game.hp': 20 });
    const settle = client => client.settleRound('ABCD', { matchId: version.matchId, round: 1 }, data =>
        ({ 'game.hp': data.game.hp - 1, 'game.round': 2 }));
    const settled = await Promise.all([settle(roundHost), settle(roundGuest), settle(roundHost)]);
    assert.equal(settled.filter(Boolean).length, 1);
    assert.equal(backend.get('round_rooms/ABCD').game.hp, 19);
    assert.equal(await roundHost.updateMatch('ABCD', { matchId: version.matchId, round: 1, status: 'playing' },
        () => ({ 'game.hp': 0 })), false, 'A delayed round write cannot damage a later round');
    await roundHost.update('ABCD', { 'game.status': 'over' });
    await roundHost.reset('ABCD'); await roundGuest.setReady('ABCD'); await roundHost.start('ABCD');
    assert.notEqual(backend.get('round_rooms/ABCD').game.matchId, version.matchId);
    assert.equal(await settle(roundHost), false, 'A stale round-one settlement cannot damage a rematch');
    const currentVersion = backend.get('round_rooms/ABCD').game;
    const observerRound = service('observer', roundConfig, 'round_rooms');
    assert.equal(await observerRound.settleRound('ABCD', { matchId: currentVersion.matchId, round: 1 }, () => ({ 'game.hp': 0 })), false);
    assert.equal(await roundHost.settleRound('ABCD', { matchId: currentVersion.matchId, round: 1 }, () => null), false);
    assert.equal(backend.get('round_rooms/ABCD').game.settledRound, 0, 'Missing inputs do not consume a settlement');

    // Even a player who never heartbeats becomes unavailable. A new beat cancels an eviction.
    let clock = 1000;
    const presence = createRoomPresence({ timeoutMs: 15000, now: () => clock });
    const presenceOptions = { isAvailable: uid => presence.isAvailable(uid) };
    const liveHost = service('live', presenceOptions, 'presence_rooms'), missing = service('missing', presenceOptions, 'presence_rooms');
    await liveHost.create(); await missing.join('ABCD');
    presence.observe(backend.get('presence_rooms/ABCD'));
    clock += 16000;
    const disconnected = presence.disconnected(backend.get('presence_rooms/ABCD'));
    assert(disconnected.some(item => item.uid === 'missing'));
    await missing.update('ABCD', { 'presence.missing': 1 });
    assert.equal(await liveHost.releaseDisconnected('ABCD', disconnected), false, 'The authoritative beat changed after the timeout observation');
    presence.observe(backend.get('presence_rooms/ABCD'));
    assert(presence.isAvailable('missing'));
    clock += 16000;
    assert.equal(await liveHost.releaseDisconnected('ABCD', presence.disconnected(backend.get('presence_rooms/ABCD'))), true);
    assert.deepEqual(Object.keys(backend.get('presence_rooms/ABCD').players), ['live']);

    // A ready click racing a departure must not leave a stale ready flag behind.
    await Promise.allSettled([guest.setReady('ABCD'), guest.leave('ABCD')]);
    assert.equal(backend.get('test_rooms/ABCD').ready.guest, undefined);
    await guest.join('ABCD');
    await Promise.allSettled([guest.leave('ABCD'), guest.setReady('ABCD')]);
    assert.equal(backend.get('test_rooms/ABCD').ready.guest, undefined);

    // A different game can use six seats, custom match fields and lifecycle hooks.
    const variant = {
        maxPlayers: 6, minPlayers: 3, allowSpectators: true,
        onCreate: input => ({ match: { phase: 'waiting' }, variant: input.variant }),
        isPlaying: data => data.match.phase === 'running',
        startPatch: (_data, ids) => ({ match: { phase: 'running', teams: ids } }),
        onReset: () => ({ match: { phase: 'waiting' } }),
    };
    const teamHost = service('team-host', variant, 'team_rooms');
    await teamHost.create({ variant: 'teams' });
    const teamGuests = Array.from({ length: 5 }, (_, i) => service('team' + i, variant, 'team_rooms'));
    for (const client of teamGuests) { await client.join('ABCD'); await client.setReady('ABCD'); }
    assert.equal(await teamHost.start('ABCD'), true);
    assert.equal(backend.get('team_rooms/ABCD').match.teams.length, 6);
    assert.equal(backend.get('team_rooms/ABCD').variant, 'teams');
    const observe = service('observer', variant, 'team_rooms');
    const observed = observe.session(); observed.attach('ABCD', { spectate: true }); await backend.flush();
    const beforeLeave = backend.commits.length;
    await observed.leave();
    assert.equal(backend.commits.length, beforeLeave);
    await teamHost.update('ABCD', { 'match.phase': 'over' }); await teamHost.reset('ABCD');
    assert.equal(backend.get('team_rooms/ABCD').match.phase, 'waiting');

    // Availability chooses a live host without forcing game-specific timeouts into the service.
    const live = new Set(['other']);
    const takeover = service('other', { isAvailable: uid => live.has(uid) });
    const current = backend.get('test_rooms/ABCD');
    assert.equal(takeover.host(current), 'other');
    assert.deepEqual(takeover.playerIds(current, true), ['other']);
    assert.equal(takeover.canStart(current), false, 'Minimum player count still applies after filtering unavailable players');

    // Firestore may deliver a callback already queued before unsubscribe.
    const callbacks = [], changes = [], errors = [];
    const lateStore = { ...store('late_rooms'), watch: (code, cb) => { callbacks.push(cb); return () => {}; } };
    const late = createRoomService({ store: lateStore, getUser: () => user('host') }, {});
    const session = late.session({ onChange: data => changes.push(data), onError: err => errors.push(err) });
    session.attach('AAAA'); session.attach('BBBB');
    callbacks[0]({ code: 'AAAA' }); callbacks[0](null, new Error('stale failure'));
    callbacks[1]({ code: 'BBBB' });
    assert.deepEqual(changes, [{ code: 'BBBB' }]); assert.equal(errors.length, 0);
    session.detach(); callbacks[1](null); assert.equal(changes.length, 1);
    let unsubscribed = 0;
    const synchronous = createRoomService({ getUser: () => user('host'), store: {
        watch: (_code, cb) => { cb({}); return () => unsubscribed++; },
    } }, {}).session({ onChange: () => synchronous.detach() });
    synchronous.attach('AAAA'); assert.equal(synchronous.room, null); assert.equal(unsubscribed, 1);

    // Code collisions retry without replacing the previous room.
    let attempt = 0;
    const codes = createRoomService({ store: store('test_rooms'), getUser: () => user('new-host'),
        generateCode: () => ++attempt === 1 ? 'ABCD' : 'EFGH' }, {});
    assert.equal(await codes.create(), 'EFGH');
    assert.equal(backend.get('test_rooms/ABCD').hostUid, 'host');
    const signedOut = createRoomService({ store: store('test_rooms'), getUser: () => null }, {});
    await assert.rejects(signedOut.create(), { code: 'room/auth' });
    assert.equal(await signedOut.cleanup(), 0);
    assert.throws(() => service('invalid', { minPlayers: 4, maxPlayers: 2 }), /capacity/);
    backend.put('test_rooms/OLD', { lastActionAt: 0 });
    backend.put('other_rooms/OLD', { lastActionAt: 0 });
    assert.equal(await host.cleanup(), 1);
    assert(backend.get('test_rooms/ABCD') && backend.get('other_rooms/OLD'), 'Cleanup stays within the game collection');
    console.log('PASS: shared room transactions, contention, policies, lifecycle hooks, capacity, authority, subscription safety and cleanup.');
})().catch(err => { console.error(err); process.exitCode = 1; });
