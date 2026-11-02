'use strict';
const assert = require('node:assert/strict');

/** Native JSON tree + cold transaction caches. This fixture does not evaluate security rules. */
function memoryRealtimeDatabase() {
    let tree = {}, queue = Promise.resolve(), nextClient = 0;
    const listeners = new Set(), clients = new Set(), commits = [];
    const usage = { transactionReads: 0, updates: 0, reads: 0, queries: 0, writes: 0, deletes: 0, listenerEvents: 0 };
    const clone = value => value == null ? value : structuredClone(value);
    const parts = path => path.split('/').filter(Boolean);
    const read = path => parts(path).reduce((node, key) => node && node[key], tree) ?? null;
    function resolve(value) {
        if (value && typeof value === 'object') {
            if (value['.sv'] === 'timestamp') return Date.now();
            const entries = Object.entries(value).map(([key, child]) => [key, resolve(child)]).filter(([, child]) => child !== null);
            return entries.length ? Object.fromEntries(entries) : null;
        }
        return value == null ? null : value;
    }
    function write(path, value) {
        const keys = parts(path); let node = tree;
        for (const key of keys.slice(0, -1)) node = node[key] ||= {};
        if (value === null) delete node[keys.at(-1)]; else node[keys.at(-1)] = value;
        function prune(obj) { for (const [key, child] of Object.entries(obj)) if (child && typeof child === 'object' && !prune(child)) delete obj[key]; return Object.keys(obj).length; }
        prune(tree);
    }
    const overlap = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
    function snapshot(path, value = read(path)) {
        const captured = clone(value);
        return { key: parts(path).at(-1), exists: () => captured !== null, val: () => clone(captured),
            forEach: callback => { for (const [key, child] of Object.entries(captured || {})) if (callback(snapshot(path + '/' + key, child))) return true; return false; } };
    }
    function notify(path) {
        for (const listener of listeners) if (listener.path !== '.info/connected' && overlap(path, listener.path)) {
            const snap = snapshot(listener.path); queueMicrotask(() => { usage.listenerEvents++; listener.next(snap); });
        }
    }
    function commit(path, value) {
        value = resolve(value);
        const before = clone(read(path));
        if (JSON.stringify(before) === JSON.stringify(value)) return;
        if (value === null) usage.deletes++; else usage.writes++;
        write(path, value); commits.push({ path, before, after: clone(value) }); notify(path);
    }
    function job(run) { const result = queue.then(run); queue = result.catch(() => {}); return result; }
    function clientSDK() {
        const client = { id: ++nextClient, connected: true, pending: new Set(), disconnects: new Map() }; clients.add(client);
        const sdk = {
            ref: (_db, path) => ({ path }),
            serverTimestamp: () => ({ '.sv': 'timestamp' }),
            get: async target => {
                usage.reads++;
                if (!target.constraints) return snapshot(target.path);
                usage.queries++;
                const order = target.constraints.find(item => item.order).order;
                const end = target.constraints.find(item => item.end !== undefined).end;
                const limit = target.constraints.find(item => item.limit).limit;
                const children = Object.entries(read(target.path) || {}).filter(([, value]) => value[order] <= end)
                    .sort((a, b) => a[1][order] - b[1][order]).slice(0, limit);
                return snapshot(target.path, Object.fromEntries(children));
            },
            onValue: (target, next, fail) => {
                const entry = { client, path: target.path, next, fail }; listeners.add(entry);
                const snap = snapshot(target.path, target.path === '.info/connected' ? client.connected : read(target.path));
                queueMicrotask(() => { usage.listenerEvents++; next(snap); }); return () => listeners.delete(entry);
            },
            runTransaction: (target, updater, options) => {
                assert.equal(options.applyLocally, false);
                client.pending.add(target.path);
                const task = job(async () => {
                    usage.transactionReads++;
                    const actual = clone(read(target.path));
                    let value = updater(null); // force the SDK's documented cold-cache behavior
                    if (value !== undefined && actual !== null) value = updater(actual);
                    if (value === undefined) return { committed: false, snapshot: snapshot(target.path) };
                    commit(target.path, value); return { committed: true, snapshot: snapshot(target.path) };
                });
                return task.finally(() => client.pending.delete(target.path));
            },
            update: (target, patch) => {
                if ([...client.pending].some(path => overlap(path, target.path))) return Promise.reject(new Error('update would cancel this client\'s transaction'));
                return job(() => {
                    usage.updates++;
                    const next = clone(read(target.path) || {});
                    for (const [path, value] of Object.entries(patch)) {
                        const fields = parts(path); let node = next;
                        for (const field of fields.slice(0, -1)) node = node[field] ||= {};
                        node[fields.at(-1)] = resolve(value);
                    }
                    commit(target.path, next);
                });
            },
            remove: target => job(() => commit(target.path, null)),
            query: (target, ...constraints) => ({ ...target, constraints }),
            orderByChild: order => ({ order }), endAt: end => ({ end }), limitToFirst: limit => ({ limit }),
            onDisconnect: target => ({ set: async value => client.disconnects.set(target.path, value),
                cancel: async () => client.disconnects.delete(target.path) }),
            _client: client,
        };
        return sdk;
    }
    return { db: {}, clientSDK, usage, commits, raw: path => clone(read(path)),
        put: (path, value) => commit(path, value),
        disconnect(sdk) {
            const client = sdk._client; client.connected = false;
            for (const entry of listeners) if (entry.client === client && entry.path === '.info/connected') queueMicrotask(() => entry.next(snapshot('.info/connected', false)));
            for (const [path, value] of client.disconnects) {
                // The real rules deny a disconnect operation that would recreate an empty room.
                const root = path.split('/').slice(0, 3).join('/'); if (read(root)) commit(path, value);
            }
            client.disconnects.clear();
        },
        reconnect(sdk) {
            const client = sdk._client; client.connected = true;
            for (const entry of listeners) if (entry.client === client && entry.path === '.info/connected') queueMicrotask(() => entry.next(snapshot('.info/connected', true)));
        },
        flush: async () => { for (let i = 0; i < 5; i++) { await queue; await new Promise(setImmediate); } },
    };
}

function realtimeGameBackend(modules) {
    const native = memoryRealtimeDatabase();
    const playerSDKs = new Map();
    return { ...native,
        get: path => modules.decodeRoomValue(native.raw('rooms/' + path)),
        put: (path, value) => native.put('rooms/' + path, modules.encodeRoomValue(value)),
        get commits() { return native.commits.map(item => {
            const before = modules.decodeRoomValue(item.before), after = modules.decodeRoomValue(item.after);
            const data = {};
            if (!before) Object.assign(data, after);
            for (const [key, value] of Object.entries((after && after.game) || {})) {
                if (JSON.stringify(before && before.game && before.game[key]) !== JSON.stringify(value)) data['game.' + key] = value;
            }
            return { ref: item.path.replace(/^rooms\//, ''), data };
        }); },
        createStore: (config, getUser, sessionId, now) => {
            const sdk = native.clientSDK();
            const getPlayerId = () => { const user = getUser(); return user && (config.identity === 'tab' ? user.uid + '_' + sessionId : user.uid); };
            playerSDKs.set(getPlayerId(), sdk);
            return modules.createRealtimeRoomStore(sdk, native.db, config.collection, { presenceField: config.presenceField, now, getPlayerId });
        },
        disconnectPlayer: uid => native.disconnect(playerSDKs.get(uid)),
    };
}
module.exports = { memoryRealtimeDatabase, realtimeGameBackend };
