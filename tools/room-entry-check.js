/* Execute Darts' actual async entry functions with delayed Auth and failed cleanup. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/games/darts.js'), 'utf8');
const start = source.indexOf('    async function ensureOnline() {'), end = source.indexOf('    async function leaveRoom() {', start);
assert(start > 0 && end > start);
const entry = source.slice(start, end);
(async () => {
    for (const mode of ['pending', 'throw', 'reject']) {
        let user, restore, signIns = 0, creates = 0, joins = 0, factories = 0, cleanups = 0;
        const callbacks = [];
        const net = { ok: true, rooms: { ok: true }, currentUser: () => user || null,
            onAuth: cb => { callbacks.push(cb); if (user !== undefined) queueMicrotask(() => cb(user)); },
            signInGuest: async () => { signIns++; user = { uid: 'guest' }; callbacks.forEach(cb => cb(user)); },
        };
        const service = Object.freeze({ currentPlayer: () => user, cleanup: () => {
            assert(user, 'Cleanup must wait for restored Auth'); cleanups++;
            if (mode === 'throw') throw Error('cleanup failed');
            if (mode === 'reject') return Promise.reject(Error('cleanup failed'));
            return new Promise(() => {});
        } });
        const context = vm.createContext({ Promise, setTimeout, clearTimeout, URL,
            window: { ArcadeNet: net, createDartsRoom: () => { factories++; return { service,
                create: async () => { creates++; return 'ABCD'; }, join: async () => { joins++; return 'ABCD'; } }; } },
            net: null, netUser: null, online: null, room: null, onlineLoading: null, onlineAuthLoading: null, entryCleanupUid: null,
            localRoom: { phase: 'lobby', options: {}, seatOrder: ['p'], participants: { p: { id: 'p' } } },
            onRoom() {}, showNetError() {}, applyAccountDisplayName() {}, renderLobby() {},
        });
        vm.runInContext(entry + '\nglobalThis.entry=ensureOnline;globalThis.create=inviteFriends;globalThis.join=joinRoom;', context);
        const attempts = [context.entry(), context.entry(), context.entry()];
        await new Promise(setImmediate); assert.equal(cleanups, 0); assert.equal(signIns, 0);
        user = null; callbacks.forEach(cb => cb(user));
        await Promise.all(attempts); await new Promise(setImmediate);
        assert.equal(factories, 1); assert.equal(signIns, 1); assert.equal(cleanups, 1);
        assert.equal(await context.create(), 'ABCD'); assert.equal(await context.join('ABCD'), 'ABCD');
        await context.entry(); await new Promise(setImmediate);
        assert.equal(cleanups, 1); assert.equal(creates, 1); assert.equal(joins, 1);
    }
    console.log('PASS: Darts entry waits for Auth, coalesces initialization/guest sign-in, tries cleanup once, and creates/joins despite hanging, throwing or rejected cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
