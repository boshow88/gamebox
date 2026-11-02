/** Run with `node tools/beam-room-check.js`. No packages or Firebase connection required. */
'use strict';
const assert = require('node:assert/strict');
const { gameClient } = require('./helpers/room-fixtures.js');

(async () => {
    const modules = Object.assign({}, await import('../js/net/rooms.mjs'));
    Object.assign(modules, await import('../js/net/rtdb-rooms.mjs'), await import('../js/net/rtdb-values.mjs'));
    const db = require('./helpers/rtdb-fixtures.js').realtimeGameBackend(modules);
    const clients = Array.from({ length: 5 }, () => gameClient('beam', db, modules, 'same-account'));
    const ids = clients.map(client => client.service.currentPlayer().uid);
    const tabs = clients.map(client => client.api), getRoom = () => db.get('beam_rooms/R-ABCD');
    assert.equal(new Set(ids).size, 5, 'Each tab needs a separate player ID for the same account');
    assert(clients.every(client => client.user.uid === 'same-account'));
    tabs[0].create(); await db.flush();
    assert.equal(getRoom().hostUid, ids[0]);
    for (const tab of tabs.slice(1, 4)) tab.join(' r-abcd ');
    await db.flush();
    assert.deepEqual(getRoom().order, ids.slice(0, 4));
    assert.equal(new Set(Object.values(getRoom().players).map(player => player.order)).size, 4);
    await assert.rejects(clients[4].service.join('R-ABCD'), /room full/);
    tabs[4].attach('R-ABCD', true); await db.flush();
    for (let i = 0; i < tabs.length; i++) assert.equal(tabs[i].snapshot().uid, ids[i]);
    tabs[0].start(); await db.flush();
    assert.equal(getRoom().status, 'lobby', 'Guests must ready up independently');
    tabs[1].ready(); await db.flush();
    assert.equal(getRoom().ready[ids[1]], true);
    assert.equal(getRoom().ready[ids[2]], undefined);
    tabs[2].ready(); tabs[3].ready(); await db.flush();
    assert.equal(getRoom().status, 'lobby', 'Beam waits for the host to press Start');
    tabs[0].start(); await db.flush();
    assert.equal(getRoom().game.status, 'playing');
    for (const id of ids.slice(0, 4)) assert.equal(getRoom().game.hp[id], 3);
    assert.equal(tabs[4].snapshot().om.spectator, true);
    for (let i = 0; i < 4; i++) {
        assert.equal(tabs[i].snapshot().om.myUid, ids[i]);
        tabs[i].answer({ r: 0, c: i, side: 0 }); tabs[i].tick();
    }
    await db.flush();
    for (let i = 0; i < 4; i++) {
        assert.equal(getRoom().game.answers[ids[i]].c, i, 'Tabs must not overwrite each other\'s answers');
        assert(getRoom().game.beat[ids[i]] > 0, 'Each tab has independent presence');
    }
    const beforeTally = getRoom();
    await Promise.all([tabs[0].tally(beforeTally, beforeTally.game), tabs[1].tally(beforeTally, beforeTally.game)]);
    await db.flush();
    assert.equal(getRoom().game.settledRound, 1);
    assert.equal(getRoom().game.hp[ids[0]], 3);
    assert.equal(getRoom().game.hp[ids[1]], 2, 'Concurrent tallies deal damage only once');
    assert.equal(db.commits.filter(item => item.data && item.data['game.settledRound'] === 1).length, 1);
    const revealed = getRoom();
    await Promise.all([tabs[0].advance(revealed, revealed.game), tabs[1].advance(revealed, revealed.game)]);
    await db.flush();
    assert.equal(getRoom().game.round, 2, 'Concurrent advances move only one round');
    assert.equal(await tabs[0].tally(beforeTally, beforeTally.game), false, 'A delayed tally cannot overwrite a later round');
    const beforeReconnect = db.commits.length;
    await clients[1].service.join('R-ABCD');
    assert.equal(db.commits.length, beforeReconnect, 'The same tab reconnects without changing the match');
    tabs[4].leave(); await db.flush();
    assert.equal(db.commits.length, beforeReconnect, 'A spectator leaving must not change room membership');

    // An active Beam match keeps running when one player leaves.
    tabs[3].leave(); await db.flush();
    assert.equal(getRoom().game.status, 'playing');
    assert.equal(Object.keys(getRoom().players).length, 3);
    await assert.rejects(clients[4].service.join('R-ABCD'), /already started/);
    await clients[0].service.update('R-ABCD', { status: 'lobby', 'game.status': 'over' }); await db.flush();
    tabs[0].rematch(); await db.flush();
    tabs[1].ready(); tabs[2].ready(); await db.flush(); tabs[0].start(); await db.flush();
    assert.notEqual(getRoom().game.matchId, beforeTally.game.matchId);
    assert.equal(await tabs[0].tally(beforeTally, beforeTally.game), false, 'A delayed tally cannot overwrite a new match');
    await clients[0].service.update('R-ABCD', { status: 'lobby', 'game.status': 'over' }); await db.flush();
    tabs[0].rematch(); await db.flush();
    for (const tab of tabs.slice(0, 3)) {
        assert.equal(tab.snapshot().room.code, 'ABCD', 'Rematches retain room subscriptions');
        assert.equal(tab.snapshot().om, null);
    }
    tabs[1].ready(); tabs[2].ready(); await db.flush();
    tabs[1].leave(); await db.flush();
    assert.equal(getRoom().ready[ids[1]], undefined);
    assert.equal(getRoom().ready[ids[2]], true, 'Leaving only clears that player\'s readiness');
    tabs[1].join('R-ABCD'); await db.flush();
    assert.equal(getRoom().ready[ids[1]], undefined, 'Rejoining requires fresh readiness');
    assert.equal(getRoom().players[ids[1]].order, 1, 'Rejoining reuses the free colour without collisions');

    // Discard stale ready flags when a player rejoins.
    tabs[1].leave(); await db.flush();
    await clients[0].service.update('R-ABCD', { ['ready.' + ids[1]]: true });
    tabs[1].join('R-ABCD'); await db.flush();
    assert.equal(getRoom().ready[ids[1]], undefined);
    clients[0].events.beforeunload(); await db.flush();
    assert(!getRoom().players[ids[0]] && getRoom().players[ids[1]]);
    assert.equal(getRoom().hostUid, ids[2], 'Closing the host tab promotes the next player');
    tabs[1].leave(); tabs[2].leave(); await db.flush();
    assert.equal(getRoom(), null, 'The last player leaving deletes the room');
    const winner = gameClient('beam', db, modules), rival = gameClient('beam', db, modules);
    const W = winner.service.currentPlayer().uid, R = rival.service.currentPlayer().uid;
    winner.api.create(); await db.flush(); rival.api.join('R-ABCD'); await db.flush();
    rival.api.ready(); await db.flush(); winner.api.start(); await db.flush();
    await winner.service.update('R-ABCD', { ['game.hp.' + R]: 1,
        'game.answers': { [W]: { r: 0, c: 0, side: 0 }, [R]: { r: 0, c: 1, side: 0 } } });
    await db.flush();
    const finalRound = getRoom();
    await winner.api.tally(finalRound, finalRound.game); await db.flush();
    assert.equal(getRoom().game.status, 'playing', 'The final reveal finishes before publishing Game Over');
    assert.equal(getRoom().game.pending.winner, W, 'Pending results are stored for a replacement host');
    const readsBeforeReveal = db.usage.transactionReads;
    for (let i = 0; i < 8; i++) { winner.api.tick(); await db.flush(); }
    assert.equal(db.usage.transactionReads, readsBeforeReveal, 'The final reveal must not poll the database with no-op forfeit transactions');
    const pending = getRoom();
    assert.equal(await rival.api.advance(pending, pending.game), false, 'A decided match cannot advance into another round');
    await rival.api.finish(pending, pending.game); await db.flush();
    assert.equal(getRoom().game.status, 'over'); assert.equal(getRoom().game.winner, W);
    assert.equal(await winner.api.finish(pending, pending.game), false, 'A duplicate end commit is ignored');
    winner.api.leave(); rival.api.leave(); await db.flush();
    clients[4].user = null;
    assert.equal(clients[4].service.currentPlayer(), null);
    await assert.rejects(clients[4].service.join('R-ABCD'), /not signed in/);
    assert([...clients, winner, rival].every(client => !client.errors.length));
    console.log('PASS: Beam tabs, host start, answers, presence, spectators, active departures, readiness, rematches and host migration.');
})().catch(err => { console.error(err); process.exitCode = 1; });
