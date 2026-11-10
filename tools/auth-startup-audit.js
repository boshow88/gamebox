// Regression checks for account startup isolation and account-scoped permissions.
// No packages, real accounts or Firebase traffic: node tools/auth-startup-audit.js
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/net/net.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/\bimport\(/g, '__import(');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const admin = { uid: 'admin-a', email: 'admin@example.test', displayName: 'Admin', isAnonymous: false };
function fixture({ delayed, initial = admin, failed, holdAuth = false } = {}) {
    const gate = deferred(), started = performance.now(), events = [], downloads = [], times = {};
    let emit, emitError, reads = 0, read = async () => ({ exists: () => true, data: () => ({ members: { [admin.email]: {} } }) });
    let popupArgs, dependencies, anonymousCalls = 0, restoredUser;
    const authReady = deferred();
    const auth = {
        initializeAuth(_app, options) { dependencies = options; times.authInit = Math.round(performance.now() - started); return { authStateReady: () => authReady.promise, get currentUser() { return restoredUser; } }; },
        indexedDBLocalPersistence: {}, browserLocalPersistence: {}, browserSessionPersistence: {}, browserPopupRedirectResolver: {},
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
        'firebase-firestore.js': firestore, 'firebase-database.js': { getDatabase: () => ({}) },
        'rooms.mjs': { createRoomService: () => ({}), createRoomPresence() {}, generateRoomCode() {} },
        'room-lobby.mjs': { createRoomLobby() {} }, 'rtdb-rooms.mjs': { createRealtimeRoomStore: () => ({}) } };
    const window = { FIREBASE_READY: true, FIREBASE_CONFIG: {}, FIREBASE_ROOMS: { databaseURL: 'https://fixture.firebaseio.com/' },
        dispatchEvent(event) {
            events.push(event.type);
            if (event.type === 'arcade-auth-ready' && window.ArcadeAuth.ok) window.ArcadeAuth.onAuth(() => { times.delivered = Math.round(performance.now() - started); });
        },
    };
    const context = { window, console: { warn() {} }, crypto: webcrypto, localStorage: { setItem() {}, removeItem() {} }, queueMicrotask,
        CustomEvent: class { constructor(type) { this.type = type; } },
        createRoomService: () => ({}), createRoomPresence() {}, generateRoomCode() {}, createRoomLobby() {},
        createRealtimeRoomStore: () => ({}), createFeedbackService: () => ({}), createAnnouncementService: () => ({}),
        __import: async url => { const name = url.split('/').pop(); downloads.push(name); if (name === delayed) await gate.promise; if (name === failed) throw Error('SDK unavailable'); return modules[name]; },
    };
    const boot = vm.runInNewContext(source, context);
    return { window, boot, gate, times, events, downloads, auth, emit: next => emit(next), error: e => emitError(e),
        anonymousCalls: () => anonymousCalls, setRead: fn => { read = fn; }, reads: () => reads, popup: () => popupArgs, dependencies: () => dependencies };
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
    assert.equal(slow.dependencies().persistence.length, 3);
    assert.equal('popupRedirectResolver' in slow.dependencies(), false);
    slow.window.ArcadeAuth.signInGoogle();
    assert.equal(slow.popup()[2], slow.auth.browserPopupRedirectResolver, 'Popup still receives its explicit resolver');

    const room = fixture({ delayed: 'firebase-database.js' }); await room.boot;
    const loading = room.window.ArcadeNet.rooms.ready();
    await flush(); await pause(800);
    assert.equal(room.window.ArcadeAuth.currentUser().uid, admin.uid);
    assert.equal(await room.window.ArcadeNet.isAdmin(), true);
    assert(room.times.delivered < 800);
    room.gate.resolve(); await loading;
    assert.equal(room.window.ArcadeNet.rooms.ok, true);
    console.log('PASS: 800 ms RTDB hold does not block Auth or admin lookup:', JSON.stringify(room.times));

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
