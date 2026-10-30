/** Run with `node tools/beam-room-check.js`. No packages or Firebase connection required. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

// Run the real room transactions against an in-memory Firestore document.
const source = fs.readFileSync(path.join(__dirname, '../js/net/net.js'), 'utf8');
const start = source.indexOf('        const mpSessionId =');
const end = source.indexOf('        window.ArcadeNet =', start);
assert(start >= 0 && end > start);
const deleted = Symbol('deleteField');
let room, writes = 0;
const watchers = new Set();
function broadcast() { for (const cb of watchers) cb(structuredClone(room)); }
function update(patch) {
    writes++;
    for (const [key, value] of Object.entries(patch)) {
        const parts = key.split('.');
        let target = room;
        for (const part of parts.slice(0, -1)) target = target[part] ||= {};
        if (value === deleted) delete target[parts.at(-1)];
        else target[parts.at(-1)] = structuredClone(value);
    }
    broadcast();
}
function createClient(uid = 'guest') {
    const context = vm.createContext({
        user: { uid, name: 'Guest', photo: null, anon: true }, db: {}, crypto: webcrypto,
        doc: (_db, group, code) => { assert.equal(group, 'beam_rooms'); assert.equal(code, 'ABCD'); return code; },
        genCode: () => 'ABCD',
        deleteField: () => deleted, serverTimestamp: () => 'now',
        runTransaction: async (_db, run) => run({
            get: async () => ({ exists: () => room !== null, data: () => structuredClone(room) }),
            set: (_ref, value) => { writes++; room = structuredClone(value); broadcast(); },
            update: (_ref, patch) => update(patch),
            delete: () => { writes++; room = null; broadcast(); },
        }),
    });
    vm.runInContext(source.slice(start, end), context);
    return context;
}
const context = createClient();
const guestId = context.mpCurrentPlayer().uid;
const fixture = () => ({
    code: 'ABCD', status: 'lobby', hostUid: 'host', maxPlayers: 4,
    players: { host: { order: 0 }, [guestId]: { order: 1 }, other: { order: 2 } },
    order: ['host', guestId, 'other'], ready: { [guestId]: true, other: true },
});

// Each VM represents a separate tab, with real Beam auth, readiness, answers,
// heartbeat and leave handlers. DOM, shell and puzzle timing are stubbed.
const beamSource = fs.readFileSync(path.join(__dirname, '../js/games/beam.js'), 'utf8');
function beamTab(client) {
    const events = {};
    const net = {
        ok: true, onAuth: fn => fn(client.user),
        mp: {
            currentPlayer: client.mpCurrentPlayer, create: client.mpCreate,
            join: client.mpJoin, leave: client.mpLeave,
            update: async (_group, _code, patch) => update(patch),
            watch: (_group, _code, cb) => { watchers.add(cb); cb(structuredClone(room)); return () => watchers.delete(cb); },
            cleanup: async () => {},
        },
    };
    const hooks = [
        'buildLobby = function () { lobbyEl = { hidden: true }; };',
        'renderLobby = renderPlayersBar = setControlsForMatch = applyHudMode = syncHud = function () {};',
        'startLocalRound = function (round, data) { om.round = round; om.localStart = performance.now(); om.memo = 3; om.answerSec = 6; om.replay = 1; };',
        'shell = { isPlaying: function () { return false; }, start: function () {}, goIdle: function () { toReady(); }, refreshOverlay: function () {} };',
        'setupOnline();',
        'window.beamTest = { attach: attachRoom, ready: doReady, start: hostStart, answer: submitAnswer, tick: watchdog, leave: doLeave, rematch: doRematch,',
        'snapshot: function () { return { room: room, om: om, uid: netUser.uid }; } };',
        '})();',
    ].join('\n');
    const sandbox = {
        window: {
            ArcadeCommon: { i18n: { STRINGS: { en: {}, zh: {} }, t: key => key }, audio: { tone() {} } },
            ArcadeNet: net, addEventListener: (event, fn) => { events[event] = fn; },
        },
        document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
        setInterval() {}, setTimeout, clearTimeout, performance, console,
    };
    vm.runInNewContext(beamSource.replace(/\}\)\(\);\s*$/, hooks), sandbox);
    return Object.assign(sandbox.window.beamTest, { events });
}

(async () => {
    room = fixture();
    await context.mpLeave('beam_rooms', 'ABCD');
    assert(!room.players[guestId] && !room.order.includes(guestId));
    assert.equal(room.ready[guestId], undefined, 'Leaving must remove the old ready state');
    assert.equal(room.ready.other, true, 'Other players must stay ready');
    assert.equal(room.hostUid, 'host');
    assert.equal(await context.mpJoin('beam_rooms', ' abcd '), 'ABCD');
    assert(room.players[guestId] && room.order.includes(guestId));
    assert.equal(room.ready[guestId], undefined, 'Rejoining requires a fresh ready click');
    assert.equal(room.ready.other, true);

    // Rooms created before the fix may already contain a departed player's ready flag.
    room = fixture(); delete room.players[guestId]; room.order = ['host', 'other'];
    await context.mpJoin('beam_rooms', 'ABCD');
    assert.equal(room.ready[guestId], undefined, 'Joining must discard legacy ready state');
    assert.equal(room.players[guestId].order, 1);
    assert.equal(room.ready.other, true);

    // A reconnect by an already seated player keeps the current match intact.
    room = fixture(); room.status = 'playing';
    const beforeReconnect = writes;
    await context.mpJoin('beam_rooms', 'ABCD');
    assert.equal(writes, beforeReconnect);
    assert.equal(room.ready[guestId], true);

    room = fixture(); room.hostUid = guestId;
    await context.mpLeave('beam_rooms', 'ABCD');
    assert.equal(room.hostUid, 'host', 'Host migration still works');
    assert.equal(room.ready.other, true);

    room = fixture(); delete room.ready;
    await context.mpLeave('beam_rooms', 'ABCD');
    assert(!room.players[guestId], 'Leaving also works without a ready map');
    room = fixture(); room.players = { [guestId]: { order: 0 } }; room.order = [guestId];
    await context.mpLeave('beam_rooms', 'ABCD');
    assert.equal(room, null, 'The last player leaving still deletes the room');

    const clients = Array.from({ length: 5 }, () => createClient('same-account'));
    const ids = clients.map(c => c.mpCurrentPlayer().uid);
    assert(clients.every(c => c.user.uid === 'same-account'), 'Account identity stays unchanged');
    assert.equal(new Set(ids).size, 5, 'Each tab needs a separate player ID for the same account');
    assert.equal(clients[0].mpCurrentPlayer().uid, ids[0], 'Identity is stable in the same tab');
    assert.equal(await clients[0].mpCreate('beam_rooms'), 'ABCD');
    assert.equal(room.hostUid, ids[0]);
    for (const c of clients.slice(1, 4)) await c.mpJoin('beam_rooms', 'ABCD');
    assert.deepEqual(room.order, ids.slice(0, 4));
    assert.equal(new Set(Object.values(room.players).map(p => p.order)).size, 4);
    await assert.rejects(clients[4].mpJoin('beam_rooms', 'ABCD'), /room full/);
    const tabs = clients.map(beamTab);
    tabs.forEach((tab, i) => { tab.attach('ABCD'); assert.equal(tab.snapshot().uid, ids[i]); });
    tabs[0].start();
    assert.equal(room.status, 'lobby', 'The other tabs must ready up independently');
    tabs[1].ready();
    assert.equal(room.ready[ids[1]], true);
    assert.equal(room.ready[ids[2]], undefined);
    tabs[2].ready(); tabs[3].ready(); tabs[0].start();
    assert.equal(room.game.status, 'playing');
    for (const id of ids.slice(0, 4)) assert.equal(room.game.hp[id], 3);
    assert.equal(tabs[4].snapshot().om.spectator, true, 'An extra tab can spectate without taking a seat');
    for (let i = 0; i < 4; i++) {
        assert.equal(tabs[i].snapshot().om.myUid, ids[i]);
        assert.equal(tabs[i].snapshot().om.spectator, false);
        tabs[i].answer({ r: 0, c: i, side: 0 });
        tabs[i].tick();
    }
    for (let i = 0; i < 4; i++) {
        assert.equal(room.game.answers[ids[i]].c, i, 'Tabs must not overwrite each other\'s answers');
        assert.equal(room.game.beat[ids[i]], 1, 'Tabs have independent presence');
    }
    const beforeRejoin = writes;
    await clients[1].mpJoin('beam_rooms', 'ABCD');
    assert.equal(writes, beforeRejoin, 'The same tab rejoining keeps its existing seat');
    await assert.rejects(clients[4].mpJoin('beam_rooms', 'ABCD'), /already started/);

    update({ status: 'lobby', 'game.status': 'over' });
    tabs[0].rematch();
    for (const tab of tabs) {
        assert.equal(tab.snapshot().room.code, 'ABCD', 'All tabs stay in the same room for rematches');
        assert.equal(tab.snapshot().om, null);
    }
    tabs[1].ready(); tabs[2].ready();
    tabs[1].leave();
    await new Promise(setImmediate);
    assert(!room.players[ids[1]]);
    assert.equal(room.ready[ids[1]], undefined);
    assert.equal(room.ready[ids[2]], true, 'Leaving a tab must not clear another tab\'s ready state');
    assert.equal(room.hostUid, ids[0]);
    await clients[1].mpJoin('beam_rooms', 'ABCD'); tabs[1].attach('ABCD');
    assert.equal(room.ready[ids[1]], undefined, 'Rejoining a tab still requires fresh readiness');
    assert(room.players[ids[0]] && room.players[ids[1]]);
    tabs[0].events.beforeunload();
    await new Promise(setImmediate);
    assert(!room.players[ids[0]] && room.players[ids[1]], 'Closing one tab leaves the other tab seated');
    assert.equal(room.hostUid, ids[2], 'Closing the host tab promotes the next player');
    clients[4].user = null;
    assert.equal(clients[4].mpCurrentPlayer(), null);
    await assert.rejects(clients[4].mpJoin('beam_rooms', 'ABCD'), /not signed in/);
    console.log('PASS: readiness resets, independent same-account tabs, capacity, answers, presence, rematches, host migration and tab closure.');
})().catch(error => { console.error(error); process.exitCode = 1; });
