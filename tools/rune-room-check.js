/** Run with `node tools/rune-room-check.js`. No packages or Firebase connection required. */
'use strict';
const assert = require('node:assert/strict');
const { gameClient } = require('./helpers/room-fixtures.js');

(async () => {
    const modules = Object.assign({}, await import('../js/net/rooms.mjs'));
    Object.assign(modules, await import('../js/net/rtdb-rooms.mjs'), await import('../js/net/rtdb-values.mjs'));
    const db = require('./helpers/rtdb-fixtures.js').realtimeGameBackend(modules);
    let time = 1000;
    const make = () => gameClient('rune-stones', db, modules, 'same-account', () => time);
    const host = make(), guest = make(), other = make();
    const H = host.service.currentPlayer().uid, G = guest.service.currentPlayer().uid, O = other.service.currentPlayer().uid;
    const getRoom = () => db.get('duel_rooms/R-ABCD');
    assert.equal(new Set([H, G, O]).size, 3, 'Each Rune Stones tab is an independent player');
    assert.equal(host.user.uid, guest.user.uid, 'The underlying account stays shared');
    await host.api.create(); await db.flush();
    assert.deepEqual(getRoom().slots, [H, null]);
    await guest.api.join(' r-abcd '); await db.flush();
    assert.deepEqual(getRoom().slots, [H, G]);
    assert.equal(getRoom().status, 'playing');
    assert.notEqual(getRoom().game.status, 'playing', 'Occupied seats are distinct from a running match');
    await assert.rejects(other.service.join('R-ABCD'));
    assert.throws(() => other.service.session().attach('R-ABCD', { spectate: true }), /not supported/);
    host.api.tick(); guest.api.tick(); await db.flush();
    assert.equal(getRoom().presence[H], 1); assert.equal(getRoom().presence[G], 1);
    assert.equal(await host.api.start(), false, 'Host cannot bypass guest readiness');
    assert.equal(await guest.api.start(), false, 'Guest cannot start the match');
    await guest.api.ready(); await db.flush();
    assert.notEqual(getRoom().game.status, 'playing', 'A ready guest does not automatically start the match');
    await host.api.start(); await db.flush();
    assert.equal(getRoom().game.status, 'playing');
    assert.equal(host.api.snapshot().om.myUid, H);
    assert.equal(guest.api.snapshot().om.oppUid, H);
    const first = getRoom().game;
    assert(first.matchId);
    await host.service.update('R-ABCD', { 'game.atk': { [H]: { dmg: 100, heal: 0 }, [G]: { dmg: 200, heal: 0 } } });
    await Promise.all([host.api.resolve(first), guest.api.resolve(first), host.api.resolve(first)]);
    await db.flush();
    assert.equal(getRoom().game.round, 2);
    assert.equal(getRoom().game.hp[H], 2800); assert.equal(getRoom().game.hp[G], 2900);
    assert.equal(db.commits.filter(item => item.data && item.data['game.settledRound'] === 1).length, 1, 'Concurrent resolvers settle only once');
    assert.equal(await host.api.resolve(first), false);
    assert.equal(await guest.service.updateMatch('R-ABCD', { matchId: first.matchId, round: 1, status: 'playing' },
        () => ({ ['game.atk.' + G]: { dmg: 9999 } })), false, 'Late attacks cannot enter the next round');

    await host.service.update('R-ABCD', { 'game.status': 'over', 'game.winner': H }); await db.flush();
    assert(host.api.snapshot().result && guest.api.snapshot().result);
    assert.equal(await guest.api.rematch(), false, 'Only the host can reset the results');
    await host.api.rematch(); await db.flush();
    assert.equal(getRoom().game.status, undefined);
    assert.deepEqual(getRoom().ready, {});
    assert.equal(host.api.snapshot().room.code, 'ABCD');
    assert.equal(guest.api.snapshot().room.code, 'ABCD');
    assert.equal(host.api.snapshot().result, ''); assert.equal(guest.api.snapshot().result, '');
    await guest.api.ready(); await db.flush();
    assert.notEqual(getRoom().game.status, 'playing');
    await host.api.start(); await db.flush();
    assert.equal(getRoom().game.status, 'playing');
    assert.notEqual(getRoom().game.matchId, first.matchId);
    assert.equal(await host.api.resolve(first), false, 'A previous match cannot settle round one of a rematch');
    assert.equal(getRoom().game.hp[H], 3000);

    guest.events.pagehide(); await db.flush();
    assert.equal(getRoom().status, 'waiting');
    assert.equal(getRoom().game.status, 'over');
    assert.equal(getRoom().game.winner, H, 'Closing a guest tab records the survivor as winner');
    assert.deepEqual(getRoom().ready, {});
    assert.equal(host.api.snapshot().om, null);
    await other.api.join('R-ABCD'); await db.flush();
    await other.api.ready(); await host.api.start(); await db.flush();
    host.events.pagehide(); await db.flush();
    assert.equal(getRoom().hostUid, O, 'Closing the host preserves the room and migrates the host');
    assert.deepEqual(getRoom().slots, [O, null]);
    assert.equal(getRoom().players[O].slot, 0);
    assert.equal(getRoom().game.winner, O);
    await other.api.leave(); await db.flush();
    assert.equal(getRoom(), null);

    // A lobby tab can disappear without delivering pagehide. The live peer releases its seat.
    const missing = make(), survivor = make();
    const M = missing.service.currentPlayer().uid, S = survivor.service.currentPlayer().uid;
    await missing.api.create(); await survivor.api.join('R-ABCD'); await db.flush();
    missing.api.tick(); survivor.api.tick(); await db.flush();
    await missing.api.ready(); await db.flush();
    time += 16000;
    survivor.api.tick(); await db.flush();
    assert(!getRoom().players[M], 'An unannounced lobby departure cannot occupy a seat forever');
    assert.equal(getRoom().hostUid, S);
    assert.equal(getRoom().status, 'waiting');
    assert.deepEqual(getRoom().ready, {});
    await missing.api.join('R-ABCD'); await db.flush();
    assert.equal(getRoom().ready[M], undefined, 'A released player can rejoin, but must ready again');
    missing.api.tick(); await db.flush();
    await missing.api.ready(); await survivor.api.start(); await db.flush();
    time += 16000;
    survivor.api.tick(); await db.flush();
    assert.equal(getRoom().game.status, 'over', 'A dropped player during play forfeits without destroying the room');
    assert.equal(getRoom().game.winner, S);
    assert.equal(survivor.api.snapshot().om, null);
    const replacement = make();
    await replacement.api.join('R-ABCD'); await db.flush();
    await replacement.api.ready(); await survivor.api.start(); await db.flush();
    assert.equal(getRoom().game.status, 'playing');
    assert.equal(missing.api.snapshot().om, null, 'A released tab must not enter the replacement match as a third player');
    await survivor.api.leave(); await replacement.api.leave(); await db.flush();
    assert.equal(getRoom(), null);

    // Closing results releases the seat and restores solo-ready state, just like Beam.
    const closeHost = make(), closeGuest = make();
    await closeHost.api.create(); await closeGuest.api.join('ABCD');
    await closeGuest.api.ready(); await closeHost.api.start(); await db.flush();
    await closeHost.service.update('ABCD', { 'game.status': 'over', 'game.winner': closeHost.service.currentPlayer().uid });
    await db.flush();
    closeGuest.api.close(); await db.flush();
    assert.equal(closeGuest.api.snapshot().room, null);
    assert.equal(closeGuest.api.snapshot().phase, 'idle');
    assert.equal(Object.keys(getRoom().players).length, 1);
    await closeHost.api.leave(); await db.flush();

    // A vanished room ends online mode without inventing a victory or retaining stale results.
    const vanishedHost = make(), vanishedGuest = make();
    await vanishedHost.api.create(); await vanishedGuest.api.join('ABCD');
    await vanishedGuest.api.ready(); await vanishedHost.api.start(); await db.flush();
    await vanishedHost.service.remove('ABCD'); await db.flush();
    for (const client of [vanishedHost, vanishedGuest]) {
        assert.equal(client.api.snapshot().room, null);
        assert.equal(client.api.snapshot().om, null);
        assert.equal(client.api.snapshot().result, '');
    }
    assert([host, guest, other, missing, survivor, replacement, closeHost, closeGuest, vanishedHost, vanishedGuest].every(client => !client.errors.length));
    console.log('PASS: Rune host-controlled starts/rematches, result closing, vanished rooms, independent tabs, dropout recovery and single round settlement.');
})().catch(err => { console.error(err); process.exitCode = 1; });
