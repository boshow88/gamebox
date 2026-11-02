/** In-memory Firestore for the real room transport; no network or packages. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let nextSession = 0;

function memoryFirestore() {
    const documents = new Map(), listeners = new Map(), commits = [];
    const usage = { transactionReads: 0, documentReads: 0, queries: 0, queryReads: 0, listenerEvents: 0, writes: 0, deletes: 0 };
    let queue = Promise.resolve();
    const clone = value => value == null ? value : structuredClone(value);
    const snapshot = ref => ({ ref, exists: () => documents.has(ref), data: () => clone(documents.get(ref)) });
    function notify(ref) {
        const snap = snapshot(ref);
        for (const listener of listeners.get(ref) || []) queueMicrotask(() => { usage.listenerEvents++; listener.next(snap); });
    }
    function patch(ref, data) {
        const current = clone(documents.get(ref));
        if (!current) throw new Error('room not found');
        for (const [key, value] of Object.entries(data)) {
            const parts = key.split('.'); let target = current;
            for (const part of parts.slice(0, -1)) target = target[part] ||= {};
            target[parts.at(-1)] = clone(value);
        }
        documents.set(ref, current);
        usage.writes++;
        commits.push({ ref, kind: 'update', data: clone(data) }); notify(ref);
    }
    function remove(ref) { documents.delete(ref); usage.deletes++; commits.push({ ref, kind: 'delete' }); notify(ref); }
    const sdk = {
        doc: (_db, group, code) => group + '/' + code,
        serverTimestamp: () => Date.now(),
        runTransaction: (_db, run) => {
            const next = queue.then(() => run({
                get: async ref => { usage.transactionReads++; return snapshot(ref); },
                set: (ref, data) => { documents.set(ref, clone(data)); usage.writes++; commits.push({ ref, kind: 'create', data: clone(data) }); notify(ref); },
                update: patch, delete: remove,
            }));
            queue = next.catch(() => {});
            return next;
        },
        getDoc: async ref => { usage.documentReads++; return snapshot(ref); },
        updateDoc: async (ref, data) => patch(ref, data),
        deleteDoc: async ref => remove(ref),
        onSnapshot: (ref, next, fail) => {
            const item = { next, fail };
            if (!listeners.has(ref)) listeners.set(ref, new Set());
            listeners.get(ref).add(item);
            const snap = snapshot(ref); queueMicrotask(() => { usage.listenerEvents++; next(snap); });
            return () => listeners.get(ref).delete(item);
        },
        collection: (_db, group) => group,
        where: (field, op, value) => ({ field, op, value }),
        limit: count => ({ count }),
        query: (group, ...constraints) => ({ group, constraints }),
        getDocs: async ({ group, constraints }) => {
            usage.queries++;
            const filter = constraints.find(item => item.field), cap = constraints.find(item => item.count);
            const docs = [...documents.keys()].filter(ref => ref.startsWith(group + '/') && documents.get(ref)[filter.field] < filter.value)
                .slice(0, cap ? cap.count : Infinity).map(ref => snapshot(ref));
            usage.queryReads += Math.max(1, docs.length);
            return { docs };
        },
    };
    return { sdk, db: {}, documents, listeners, commits, usage, get: ref => clone(documents.get(ref)) || null,
        put: (ref, data) => { documents.set(ref, clone(data)); notify(ref); },
        flush: async () => { await queue; await new Promise(setImmediate); await queue; } };
}

function gameClient(game, backend, modules, uid = 'account', now = Date.now) {
    const events = {}, errors = [];
    const client = { user: { uid, name: uid, photo: null, anon: true }, service: null };
    const sessionId = 'tab-' + ++nextSession;
    const net = {
        ok: true, onAuth: callback => callback(client.user),
        rooms: { presence: options => modules.createRoomPresence({ ...options, now }), create: config => (client.service = modules.createRoomService({
            store: backend.createStore ? backend.createStore(config, () => client.user, sessionId, now)
                : modules.createFirebaseRoomStore(backend.sdk, backend.db, config.collection),
            getUser: () => client.user, sessionId, generateCode: () => 'ABCD', now,
        }, config)) },
    };
    const hooks = game === 'beam' ? [
        'buildLobby = function () { lobbyEl = { hidden: true }; };',
        'renderLobby = renderPlayersBar = setControlsForMatch = applyHudMode = syncHud = function () {};',
        'startLocalRound = function (round, data) { om.round = round; om.localStart = performance.now(); om.memo = 3; om.answerSec = 6; om.replay = 1; om.puzzle = { exit: { r: 0, c: 0, side: 0 } }; };',
        'shell = { isPlaying: function () { return false; }, start: function () {}, goIdle: function () { toReady(); }, refreshOverlay: function () {} };',
        'setupOnline();',
        'window.roomTest = { create: doCreate, join: doJoin, attach: attachRoom, ready: doReady, start: hostStart, answer: submitAnswer, tick: watchdog, leave: doLeave, rematch: doRematch, tally: hostTally, advance: hostNextRound, finish: hostCommitOver,',
        'snapshot: function () { return { room: room, om: om, uid: netUser.uid }; } };',
        '})();',
    ] : [
        'buildLobby = function () { lobbyEl = { hidden: true }; };',
        'renderLobby = markDirty = updateHud = setOnlineBtnEnabled = function () {};',
        "resetRun = function () { G.phase = 'defense'; G.round = 1; };",
        "shell = { isPlaying: function () { return true; }, syncButtons: function () {}, goIdle: function () { G.phase = 'idle'; } };",
        'setupOnline();',
        'window.roomTest = { create: doCreate, join: doJoin, attach: attachRoom, ready: doReady, leave: doLeave, gameUpdate: onRoomGame, tick: heartbeatAndGc, resolve: hostResolve,',
        'snapshot: function () { return { room: room, om: G.online, phase: G.phase, uid: netUser.uid }; } };',
        '})();',
    ];
    const sandbox = {
        window: {
            ArcadeCommon: { i18n: { STRINGS: { en: {}, zh: {} }, t: key => key }, audio: { tone() {}, noise() {} }, math: { clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) } },
            ArcadeNet: net, addEventListener: (name, fn) => { events[name] = fn; },
        },
        document: { readyState: 'loading', addEventListener() {},
            getElementById: id => id === 'stage' ? { getContext: () => ({}) } : null },
        Path2D: class { arc() {} },
        setInterval() {}, setTimeout, clearTimeout, performance, Date: class extends Date { static now() { return now(); } },
        console: { ...console, warn: (...args) => errors.push(args) },
    };
    const source = fs.readFileSync(path.join(__dirname, '../../js/games/' + game + '.js'), 'utf8');
    assert(/\}\)\(\);\s*$/.test(source));
    vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, hooks.join('\n')), sandbox);
    return Object.assign(client, { api: sandbox.window.roomTest, events, errors });
}

module.exports = { memoryFirestore, gameClient };
