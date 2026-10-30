/** Run with `node tools/beam-room-check.js`. No packages or Firebase connection required. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the real room transactions against an in-memory Firestore document.
const source = fs.readFileSync(path.join(__dirname, '../js/net/net.js'), 'utf8');
const start = source.indexOf('        function groupRef(');
const end = source.indexOf('        window.ArcadeNet =', start);
assert(start >= 0 && end > start);
const deleted = Symbol('deleteField');
let room, writes = 0;
const context = vm.createContext({
    user: { uid: 'guest', name: 'Guest', photo: null, anon: true }, db: {},
    doc: (_db, group, code) => { assert.equal(group, 'beam_rooms'); assert.equal(code, 'ABCD'); return code; },
    deleteField: () => deleted, serverTimestamp: () => 'now',
    runTransaction: async (_db, run) => run({
        get: async () => ({ exists: () => room !== null, data: () => structuredClone(room) }),
        update: (_ref, patch) => {
            writes++;
            for (const [key, value] of Object.entries(patch)) {
                const parts = key.split('.');
                let target = room;
                for (const part of parts.slice(0, -1)) target = target[part] ||= {};
                if (value === deleted) delete target[parts.at(-1)];
                else target[parts.at(-1)] = structuredClone(value);
            }
        },
        delete: () => { writes++; room = null; },
    }),
});
vm.runInContext(source.slice(start, end), context);
const fixture = () => ({
    code: 'ABCD', status: 'lobby', hostUid: 'host', maxPlayers: 4,
    players: { host: { order: 0 }, guest: { order: 1 }, other: { order: 2 } },
    order: ['host', 'guest', 'other'], ready: { guest: true, other: true },
});

(async () => {
    room = fixture();
    await context.mpLeave('beam_rooms', 'ABCD');
    assert(!room.players.guest && !room.order.includes('guest'));
    assert.equal(room.ready.guest, undefined, 'Leaving must remove the old ready state');
    assert.equal(room.ready.other, true, 'Other players must stay ready');
    assert.equal(room.hostUid, 'host');
    assert.equal(await context.mpJoin('beam_rooms', ' abcd '), 'ABCD');
    assert(room.players.guest && room.order.includes('guest'));
    assert.equal(room.ready.guest, undefined, 'Rejoining requires a fresh ready click');
    assert.equal(room.ready.other, true);

    // Rooms created before the fix may already contain a departed player's ready flag.
    room = fixture(); delete room.players.guest; room.order = ['host', 'other'];
    await context.mpJoin('beam_rooms', 'ABCD');
    assert.equal(room.ready.guest, undefined, 'Joining must discard legacy ready state');
    assert.equal(room.players.guest.order, 1);
    assert.equal(room.ready.other, true);

    // A reconnect by an already seated player keeps the current match intact.
    room = fixture(); room.status = 'playing';
    const beforeReconnect = writes;
    await context.mpJoin('beam_rooms', 'ABCD');
    assert.equal(writes, beforeReconnect);
    assert.equal(room.ready.guest, true);

    room = fixture(); room.hostUid = 'guest';
    await context.mpLeave('beam_rooms', 'ABCD');
    assert.equal(room.hostUid, 'host', 'Host migration still works');
    assert.equal(room.ready.other, true);

    room = fixture(); delete room.ready;
    await context.mpLeave('beam_rooms', 'ABCD');
    assert(!room.players.guest, 'Leaving also works without a ready map');
    room = fixture(); room.players = { guest: { order: 0 } }; room.order = ['guest'];
    await context.mpLeave('beam_rooms', 'ABCD');
    assert.equal(room, null, 'The last player leaving still deletes the room');
    console.log('PASS: leaving/rejoining clears readiness; other readiness, reconnects, host migration and room deletion remain intact.');
})().catch(error => { console.error(error); process.exitCode = 1; });
