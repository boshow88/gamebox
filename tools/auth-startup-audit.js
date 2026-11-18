// Regression checks for account startup isolation and account-scoped permissions.
// No packages, real accounts or Firebase traffic: node tools/auth-startup-audit.js
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/net/net.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/\bimport\(/g, '__import(');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const admin = { uid: 'admin-a', email: 'admin@example.test', displayName: 'Admin', isAnonymous: false };
function fixture({ delayed, initial = admin, failed, holdAuth = false, legacyMode } = {}) {
    const gate = deferred(), started = performance.now(), events = [], downloads = [], times = {};
    let emit, emitError, reads = 0, read = async () => ({ exists: () => true, data: () => ({ members: { [admin.email]: {} } }) });
    let popupArgs, anonymousCalls = 0, restoredUser, defaultAuthCalls = 0;
    let storeOptions, serviceOptions, roomClockOptions;
    const cleanupClock = {};
    const authReady = deferred();
    const auth = {
        getAuth() { defaultAuthCalls++; times.authInit = Math.round(performance.now() - started); return { authStateReady: () => authReady.promise, get currentUser() { return restoredUser; } }; },
        onAuthStateChanged(_auth, next, error) { emit = value => { restoredUser = value; next(value); authReady.resolve(); }; emitError = error; if (!holdAuth) queueMicrotask(() => { times.restored = Math.round(performance.now() - started); emit(initial); }); },
        signInAnonymously() { anonymousCalls++; return {}; }, signOut() {}, GoogleAuthProvider: class {}, signInWithPopup(...args) { popupArgs = args; },
    };
    const firestore = {
        getFirestore: () => ({}), doc: (_db, ...parts) => parts.join('/'),
        getDoc: async () => { throw Error('Roster must use a server-verified read'); },
        getDocFromServer: (...args) => { reads++; return read(...args); },
        setDoc: async () => {}, updateDoc: async () => {}, serverTimestamp() {}, deleteField() {},
    };
    const modules = { 'firebase-app.js': { initializeApp: () => ({}) }, 'firebase-auth.js': auth,
        'firebase-firestore.js': firestore, 'firebase-database.js': { getDatabase: () => ({}), ref: (_db, name) => name, onValue: (_ref, next) => next({ val: () => 0 }) },
        'rooms.mjs': { createRoomService: (dependencies, config) => { serviceOptions = {dependencies, config}; return {}; }, createRoomPresence() {}, generateRoomCode() {} },
        'room-lobby.mjs': { createRoomLobby() {} }, 'rtdb-rooms.mjs': { createRealtimeRoomStore: (_sdk, _db, collection, options) => { storeOptions = {collection, options}; return {}; } },
        'rtdb-clock.mjs': { createRealtimeCleanupClock: () => cleanupClock, createRealtimeRoomClock: (_sdk, _db, options) => { roomClockOptions = options; return {}; } } };
    const storage = new Map([['gamebox:score:fixture', '42']]);
    if (legacyMode) storage.set('gamebox:auth-ab-test:v1', JSON.stringify({mode:legacyMode,events:[]}));
    const localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
    const window = { FIREBASE_READY: true, FIREBASE_CONFIG: {}, FIREBASE_ROOMS: { databaseURL: 'https://fixture.firebaseio.com/' },
        dispatchEvent(event) {
            events.push(event.type);
            if (event.type === 'arcade-auth-ready' && window.ArcadeAuth.ok) window.ArcadeAuth.onAuth(() => { times.delivered = Math.round(performance.now() - started); });
        },
    };
    const context = { window, console: { warn() {} }, crypto: webcrypto, localStorage, queueMicrotask,
        CustomEvent: class { constructor(type) { this.type = type; } },
        createRoomService: () => ({}), createRoomPresence() {}, generateRoomCode() {}, createRoomLobby() {},
        createRealtimeRoomStore: () => ({}), createFeedbackService: () => ({}), createAnnouncementService: () => ({}),
        createAnalyticsWriter: () => async () => ({ status: 'unavailable' }),
        __import: async url => { const name = url.split('/').pop(); downloads.push(name); if (name === delayed) await gate.promise; if (name === failed) throw Error('SDK unavailable'); return modules[name]; },
    };
    const boot = vm.runInNewContext(source, context);
    return { window, boot, gate, times, events, downloads, auth, storage, emit: next => emit(next), error: e => emitError(e),
        anonymousCalls: () => anonymousCalls, defaultAuthCalls: () => defaultAuthCalls, setRead: fn => { read = fn; }, reads: () => reads, popup: () => popupArgs,
        roomOptions: () => ({ storeOptions, serviceOptions, roomClockOptions, cleanupClock }) };
}
(async () => {
    const slow = fixture({ delayed: 'firebase-firestore.js' });
    await flush();
    assert.equal(slow.window.ArcadeAuth.currentUser().uid, admin.uid);
    assert.equal(slow.window.ArcadeNet, undefined);
    await pause(800);
    assert(slow.times.delivered < 800, 'Auth must be delivered before the held Firestore download');
    slow.gate.resolve(); await slow.boot;
    console.log('PASS: 800 ms Firestore hold does not block Auth:', JSON.stringify(slow.times));
    assert.equal(slow.downloads.includes('firebase-database.js'), false, 'Homepage must not download RTDB');
    assert.equal(slow.defaultAuthCalls(), 1, 'Always use SDK default initialization for Safari/Home Screen popup support');
    slow.window.ArcadeAuth.signInGoogle();
    assert.equal(slow.popup().length, 2, 'Popup uses the resolver installed by getAuth');

    for (const legacyMode of ['A', 'B', 'invalid']) {
        const sample = fixture({ legacyMode }); await sample.boot;
        assert.equal(sample.defaultAuthCalls(), 1, 'Old diagnostic settings must never select an initialization mode');
        assert.equal(sample.storage.has('gamebox:auth-ab-test:v1'), false);
        assert.equal(sample.storage.get('gamebox:score:fixture'), '42', 'Diagnostic cleanup preserves unrelated data');
    }
    console.log('PASS: SDK defaults for every device; obsolete diagnostic settings removed without clearing scores');

    const room = fixture({ delayed: 'firebase-database.js' }); await room.boot;
    const loading = room.window.ArcadeNet.rooms.ready();
    await flush(); await pause(800);
    assert.equal(room.window.ArcadeAuth.currentUser().uid, admin.uid);
    assert.equal(await room.window.ArcadeNet.isAdmin(), true);
    assert(room.times.delivered < 800);
    room.gate.resolve(); await loading;
    assert.equal(room.window.ArcadeNet.rooms.ok, true);
    const rooms = room.window.ArcadeNet.rooms, now = () => 1234;
    rooms.create({ collection: 'memory_rooms', identity: 'tab', sessionId: 'restored-tab', now, nativeDisconnect: false });
    const memory = room.roomOptions();
    assert.equal(memory.storeOptions.options.getPlayerId(), admin.uid + '_restored-tab');
    assert.equal(memory.serviceOptions.dependencies.sessionId, 'restored-tab');
    assert.equal(memory.storeOptions.options.now, now);
    assert.equal(memory.serviceOptions.dependencies.now, now);
    assert.equal(memory.storeOptions.options.nativeDisconnect, false);
    assert.equal(memory.storeOptions.options.cleanupClock, memory.cleanupClock);
    const clockOptions = { onError() {} }; rooms.clock(clockOptions);
    assert.equal(room.roomOptions().roomClockOptions, clockOptions);
    rooms.create({ collection: 'trash_toss_rooms', identity: 'tab' });
    const firstTab = room.roomOptions().serviceOptions.dependencies.sessionId;
    rooms.create({ collection: 'darts_rooms', identity: 'tab' });
    assert.equal(room.roomOptions().serviceOptions.dependencies.sessionId, firstTab, 'Other games retain the shared page identity');
    assert.notEqual(firstTab, 'restored-tab');
    assert.equal(room.downloads.filter(name => name === 'rtdb-clock.mjs').length, 1);
    console.log('PASS: 800 ms RTDB hold does not block Auth or admin lookup:', JSON.stringify(room.times));
    console.log('PASS: lazy room loading retains Memory recovery/clock options and other games\' page identities');

    const net = slow.window.ArcadeNet;
    const pending = deferred(); slow.setRead(() => pending.promise);
    const first = net.isAdmin(), second = net.getAdmins();
    assert.equal(slow.reads(), 1, 'Concurrent lookups must share a single read');
    pending.reject(Object.assign(Error('offline'), { code: 'unavailable' }));
    await Promise.all([assert.rejects(first, /offline/), assert.rejects(second, /offline/)]);
    slow.setRead(async () => ({ exists: () => true, data: () => ({ members: { [admin.email]: {} } }) }));
    assert.equal(await net.isAdmin(), true, 'Transient failure must be retryable');
    assert.equal(slow.reads(), 2);
    assert.equal(await net.isAdmin(), true); assert.equal(slow.reads(), 2, 'Successful roster is reused');
    await net.isAdmin({refresh:true}); assert.equal(slow.reads(), 3, 'Explicit retry can bypass an in-flight or cached roster');
    slow.emit(null);
    assert.equal(await net.isAdmin(), false);
    slow.emit(admin);
    slow.setRead(async () => { throw Object.assign(Error('not allowed'), { code: 'permission-denied' }); });
    assert.equal(await net.isAdmin(), false, 'Server denial is confirmed non-membership');

    const stale = deferred(); slow.emit(admin); slow.setRead(() => stale.promise);
    const oldAdmin = net.isAdmin();
    slow.emit({ ...admin, uid: 'admin-b' }); slow.emit(admin);
    stale.resolve({ exists: () => true, data: () => ({ members: { [admin.email]: {} } }) });
    assert.equal(await oldAdmin, false, 'A→B→A must invalidate an old permission response');
    let calls = 0; const unsubscribe = net.onAuth(() => calls++); unsubscribe(); slow.emit(null);
    assert.equal(calls, 1, 'Auth subscription can be disposed');

    const restoring = fixture({holdAuth:true}); await restoring.boot;
    const earlyGuest = restoring.window.ArcadeAuth.signInGuest(); await flush();
    assert.equal(restoring.anonymousCalls(), 0, 'Guest fallback must wait for initial session restoration');
    restoring.emit(admin); await earlyGuest;
    assert.equal(restoring.anonymousCalls(), 0, 'Restoring Google session must never be replaced with anonymous Auth');

    const guest = fixture({ initial: null }); await guest.boot;
    await guest.window.ArcadeAuth.signInGuest(); assert.equal(guest.anonymousCalls(), 1);
    guest.emit(admin); await guest.window.ArcadeAuth.signInGuest();
    assert.equal(guest.anonymousCalls(), 1, 'Guest fallback must reuse a restored Google session');

    const failure = fixture({ failed: 'firebase-firestore.js' }); await failure.boot;
    assert.equal(failure.window.ArcadeAuth.currentUser().uid, admin.uid);
    assert.equal(failure.window.ArcadeNet.ok, false);
    const badAuth = fixture({failed:'firebase-auth.js'}); await badAuth.boot;
    assert.equal(badAuth.window.ArcadeAuth.ok, false); assert.equal(badAuth.window.ArcadeNet.ok, false);
    const badRoom = fixture({ failed: 'firebase-database.js' }); await badRoom.boot;
    await assert.rejects(badRoom.window.ArcadeNet.rooms.ready(), /SDK unavailable/);
    await assert.rejects(badRoom.window.ArcadeNet.rooms.ready(), /SDK unavailable/);
    assert.equal(badRoom.downloads.filter(n => n === 'firebase-database.js').length, 2, 'Room failures can retry');
    assert.equal(badRoom.window.ArcadeNet.ok, true);
    failure.error(Error('Auth unavailable'));
    assert.equal(failure.window.ArcadeAuth.authState(), 'error');
    badRoom.error(Error('Auth unavailable'));
    await assert.rejects(badRoom.window.ArcadeNet.isAdmin(), /Auth unavailable/);
    console.log('PASS: single-flight roster, retries, permission denial, stale-account guards, unsubscribe and isolated SDK failures');
})().catch(error => { console.error(error); process.exitCode = 1; });
