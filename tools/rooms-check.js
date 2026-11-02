/** Run with `node tools/rooms-check.js`. Tests the shared service and actual RTDB adapter offline. */
'use strict';
const assert = require('node:assert/strict');
const { realtimeGameBackend } = require('./helpers/rtdb-fixtures.js');

(async () => {
    const { createRoomService, createRoomPresence } = await import('../js/net/rooms.mjs');
    const modules = Object.assign({}, await import('../js/net/rtdb-rooms.mjs'), await import('../js/net/rtdb-values.mjs'));
    const backend = realtimeGameBackend(modules);
    const store = group => backend.createStore({ collection: group }, () => null, '');
    const user = uid => ({ uid, name: uid });
    const service = (uid, config = {}, group = 'test_rooms') => createRoomService({
        store: store(group), getUser: () => user(uid), generateCode: () => 'R-ABCD', sessionId: uid,
    }, { maxPlayers: 3, ...config });
    const host = service('host'), guest = service('guest'), other = service('other'), observer = service('observer');
    await host.create();
    const created = backend.get('test_rooms/R-ABCD');
    assert.deepEqual(host.primaryAction(created), { kind: 'start', disabled: true });
    assert.deepEqual(observer.primaryAction(created), { kind: 'join' });
    assert.equal(typeof created.createdAt, 'number');
    assert.equal(typeof created.expireAt, 'number');

    // Contending joiners cannot exceed capacity or overwrite one another.
    const contenders = Array.from({ length: 12 }, (_, i) => service('contender' + i));
    const results = await Promise.allSettled(contenders.map(client => client.join('r-abcd')));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
    assert.equal(Object.keys(backend.get('test_rooms/R-ABCD').players).length, 3);
    for (const client of contenders) await client.leave('R-ABCD');
    await guest.join('R-ABCD'); await other.join('R-ABCD');
    assert.equal(await host.start('R-ABCD'), false, 'Readiness is checked inside the transaction');
    await assert.rejects(observer.setReady('R-ABCD'), { code: 'room/spectator' });
    await guest.setReady('R-ABCD'); await other.setReady('R-ABCD');
    assert.deepEqual(host.primaryAction(backend.get('test_rooms/R-ABCD')), { kind: 'start', disabled: false });
    assert.deepEqual(guest.primaryAction(backend.get('test_rooms/R-ABCD')), { kind: 'wait-ready' });
    assert.equal(await guest.start('R-ABCD'), false, 'Guests cannot start a host-controlled room');
    const starts = await Promise.all([host.start('R-ABCD'), host.start('R-ABCD'), host.start('R-ABCD')]);
    assert.equal(starts.filter(Boolean).length, 1, 'Concurrent start requests cannot replace an already-started match');
    assert.equal(await host.reset('R-ABCD'), false, 'An active match cannot accidentally be reset');
    assert.equal(await guest.setReady('R-ABCD'), false, 'Ready clicks during a match do not carry into the rematch');
    await host.update('R-ABCD', { 'game.status': 'over' });
    assert.deepEqual(host.primaryAction(backend.get('test_rooms/R-ABCD')), { kind: 'rematch' });
    assert.deepEqual(guest.primaryAction(backend.get('test_rooms/R-ABCD')), { kind: 'wait-rematch' });
    assert.equal(await guest.reset('R-ABCD'), false, 'Only the host resets a room');
    await host.reset('R-ABCD');
    assert.deepEqual(backend.get('test_rooms/R-ABCD').ready, {});

    // Games may still opt into automatic all-ready starts through the same core.
    const autoHost = service('auto-host', { startMode: 'all-ready' }, 'auto_rooms');
    const autoGuest = service('auto-guest', { startMode: 'all-ready' }, 'auto_rooms');
    await autoHost.create(); await autoGuest.join('ABCD');
    const autoSession = autoHost.session(); autoSession.attach('ABCD'); await backend.flush();
    assert.deepEqual(autoHost.primaryAction(backend.get('auto_rooms/R-ABCD')), { kind: 'ready' });
    await autoGuest.setReady('ABCD'); await backend.flush();
    assert.notEqual(backend.get('auto_rooms/R-ABCD').game.status, 'playing');
    await autoHost.setReady('ABCD'); await backend.flush();
    assert.equal(backend.get('auto_rooms/R-ABCD').game.status, 'playing');
    autoSession.detach();

    // Once-only settlement uses the latest committed data, not a stale caller snapshot.
    const roundConfig = { startPatch: () => ({ game: { status: 'playing', round: 1, hp: 10 } }) };
    const roundHost = service('round-host', roundConfig, 'round_rooms'), roundGuest = service('round-guest', roundConfig, 'round_rooms');
    await roundHost.create(); await roundGuest.join('R-ABCD'); await roundGuest.setReady('R-ABCD'); await roundHost.start('R-ABCD');
    const version = backend.get('round_rooms/R-ABCD').game;
    assert(version.matchId);
    await roundHost.update('R-ABCD', { 'game.hp': 20 });
    const settle = client => client.settleRound('R-ABCD', { matchId: version.matchId, round: 1 }, data =>
        ({ 'game.hp': data.game.hp - 1, 'game.round': 2 }));
    const settled = await Promise.all([settle(roundHost), settle(roundGuest), settle(roundHost)]);
    assert.equal(settled.filter(Boolean).length, 1);
    assert.equal(backend.get('round_rooms/R-ABCD').game.hp, 19);
    assert.equal(await roundHost.updateMatch('R-ABCD', { matchId: version.matchId, round: 1, status: 'playing' },
        () => ({ 'game.hp': 0 })), false, 'A delayed round write cannot damage a later round');
    await roundHost.update('R-ABCD', { 'game.status': 'over' });
    await roundHost.reset('R-ABCD'); await roundGuest.setReady('R-ABCD'); await roundHost.start('R-ABCD');
    assert.notEqual(backend.get('round_rooms/R-ABCD').game.matchId, version.matchId);
    assert.equal(await settle(roundHost), false, 'A stale round-one settlement cannot damage a rematch');
    const currentVersion = backend.get('round_rooms/R-ABCD').game;
    const observerRound = service('observer', roundConfig, 'round_rooms');
    assert.equal(await observerRound.settleRound('R-ABCD', { matchId: currentVersion.matchId, round: 1 }, () => ({ 'game.hp': 0 })), false);
    assert.equal(await roundHost.settleRound('R-ABCD', { matchId: currentVersion.matchId, round: 1 }, () => null), false);
    assert.equal(backend.get('round_rooms/R-ABCD').game.settledRound, 0, 'Missing inputs do not consume a settlement');

    // Even a player who never heartbeats becomes unavailable. A new beat cancels an eviction.
    let clock = 1000;
    const presence = createRoomPresence({ timeoutMs: 15000, now: () => clock });
    const presenceOptions = { isAvailable: uid => presence.isAvailable(uid) };
    const liveHost = service('live', presenceOptions, 'presence_rooms'), missing = service('missing', presenceOptions, 'presence_rooms');
    await liveHost.create(); await missing.join('R-ABCD');
    presence.observe(backend.get('presence_rooms/R-ABCD'));
    clock += 16000;
    const disconnected = presence.disconnected(backend.get('presence_rooms/R-ABCD'));
    assert(disconnected.some(item => item.uid === 'missing'));
    await missing.update('R-ABCD', { 'presence.missing': 1 });
    assert.equal(await liveHost.releaseDisconnected('R-ABCD', disconnected), false, 'The authoritative beat changed after the timeout observation');
    presence.observe(backend.get('presence_rooms/R-ABCD'));
    assert(presence.isAvailable('missing'));
    clock += 16000;
    assert.equal(await liveHost.releaseDisconnected('R-ABCD', presence.disconnected(backend.get('presence_rooms/R-ABCD'))), true);
    assert.deepEqual(Object.keys(backend.get('presence_rooms/R-ABCD').players), ['live']);

    // A ready click racing a departure must not leave a stale ready flag behind.
    await Promise.allSettled([guest.setReady('R-ABCD'), guest.leave('R-ABCD')]);
    assert.equal(backend.get('test_rooms/R-ABCD').ready.guest, undefined);
    await guest.join('R-ABCD');
    await Promise.allSettled([guest.leave('R-ABCD'), guest.setReady('R-ABCD')]);
    assert.equal(backend.get('test_rooms/R-ABCD').ready.guest, undefined);

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
    for (const client of teamGuests) { await client.join('R-ABCD'); await client.setReady('R-ABCD'); }
    assert.equal(await teamHost.start('R-ABCD'), true);
    assert.equal(backend.get('team_rooms/R-ABCD').match.teams.length, 6);
    assert.equal(backend.get('team_rooms/R-ABCD').variant, 'teams');
    const observe = service('observer', variant, 'team_rooms');
    const observed = observe.session(); observed.attach('R-ABCD', { spectate: true }); await backend.flush();
    const beforeLeave = backend.commits.length;
    await observed.leave();
    assert.equal(backend.commits.length, beforeLeave);
    await teamHost.update('R-ABCD', { 'match.phase': 'over' }); await teamHost.reset('R-ABCD');
    assert.equal(backend.get('team_rooms/R-ABCD').match.phase, 'waiting');

    // Availability chooses a live host without forcing game-specific timeouts into the service.
    const live = new Set(['other']);
    const takeover = service('other', { isAvailable: uid => live.has(uid) });
    const current = backend.get('test_rooms/R-ABCD');
    assert.equal(takeover.host(current), 'other');
    assert.deepEqual(takeover.playerIds(current, true), ['other']);
    assert.equal(takeover.canStart(current), false, 'Minimum player count still applies after filtering unavailable players');

    // The SDK may deliver a callback already queued before unsubscribe.
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
        generateCode: () => ++attempt === 1 ? 'R-ABCD' : 'R-EFGH' }, {});
    assert.equal(await codes.create(), 'EFGH');
    assert.equal(backend.get('test_rooms/R-ABCD').hostUid, 'host');
    const signedOut = createRoomService({ store: store('test_rooms'), getUser: () => null }, {});
    await assert.rejects(signedOut.create(), { code: 'room/auth' });
    assert.equal(await signedOut.cleanup(), 0);
    assert.throws(() => service('invalid', { minPlayers: 4, maxPlayers: 2 }), /capacity/);
    backend.put('test_rooms/R-OLD1', { lastActionAt: 0 });
    backend.put('other_rooms/R-OLD1', { lastActionAt: 0 });
    assert.equal(await host.cleanup(), 1);
    assert(backend.get('test_rooms/R-ABCD') && backend.get('other_rooms/R-OLD1'), 'Cleanup stays within the game collection');
    console.log('PASS: shared room transactions, contention, policies, lifecycle hooks, capacity, authority, subscription safety and cleanup.');
})().catch(err => { console.error(err); process.exitCode = 1; });
