import { encodeRoomValue, decodeRoomValue, applyRoomPatch, encodeRoomPatch } from './rtdb-values.mjs';

const validCode = code => /^R-[A-Z0-9]{4}$/.test(code);
const invalidCode = () => Object.assign(new Error('room not found'), { code: 'room/not-found' });

/** RTDB implementation of the same room store contract. Never writes to Firestore. */
export function createRealtimeRoomStore(sdk, db, group, {
    now = Date.now, presenceField = null, getPlayerId = () => null,
} = {}) {
    const { ref, get, onValue, runTransaction, update, remove, serverTimestamp,
        query, orderByChild, endAt, limitToFirst, onDisconnect } = sdk;
    const roomRef = code => ref(db, 'rooms/' + group + '/' + code);
    const queues = new Map(), memberships = new Map(), nativeTasks = new Map();
    let cleanupAt = -Infinity, cleanupPending = null;
    let connectionWatch = null, connectedOnce = false, connected = false;
    function monitorConnection() {
        if (connectionWatch || !presenceField || !onDisconnect) return;
        connectionWatch = onValue(ref(db, '.info/connected'), snap => {
            if (snap.val() === true) {
                if (connectedOnce && !connected) for (const { code, uid } of memberships.values()) nativePresence(code, uid, true, true);
                connectedOnce = true; connected = true;
            } else connected = false;
        }, err => console.warn('[rooms] connection monitoring failed:', err));
    }
    function enqueue(code, job) {
        const next = (queues.get(code) || Promise.resolve()).catch(() => {}).then(job);
        queues.set(code, next);
        const done = () => { if (queues.get(code) === next) queues.delete(code); };
        next.then(done, done); return next;
    }
    function nativePresence(code, uid, present, reconnect = false) {
        if (!presenceField || !uid || !onDisconnect) return;
        const path = 'rooms/' + group + '/' + code + '/' + presenceField.replaceAll('.', '/') + '/' + uid;
        if (!reconnect && memberships.has(path) === present) return;
        if (present) monitorConnection();
        if (present) memberships.set(path, { code, uid }); else memberships.delete(path);
        const task = (nativeTasks.get(path) || Promise.resolve()).catch(() => {}).then(async () => {
            const handle = onDisconnect(ref(db, path));
            if (memberships.has(path)) await handle.set(-1);
            else await handle.cancel();
        });
        nativeTasks.set(path, task);
        task.catch(err => console.warn('[rooms] disconnect registration failed:', err));
    }
    async function transactInternal(code, decide, uid) {
        let confirmedMissing = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            let evaluated = false, writeRequested = false, result;
            const transaction = await runTransaction(roomRef(code), raw => {
                evaluated = false; writeRequested = false; result = undefined;
                // A cold client can initially receive null for an existing room. A null
                // compare-and-set forces a server retry before evaluating join/start rules.
                if (raw === null && !confirmedMissing) return null;
                const data = decodeRoomValue(raw), change = decide(data);
                evaluated = true; result = change.result; writeRequested = !!change.kind;
                if (!change.kind) return undefined;
                if (change.kind === 'delete') return null;
                const next = change.kind === 'create'
                    ? Object.assign({}, change.data, { createdAt: now(), expireAt: now() + 6 * 3600 * 1000 })
                    : applyRoomPatch(data, change.data);
                const encoded = encodeRoomValue(next);
                encoded.lastActionAt = serverTimestamp();
                if (change.kind === 'create') encoded.createdAt = serverTimestamp();
                return encoded;
            }, { applyLocally: false });
            if (!evaluated) {
                // The server accepted null: this path really is missing. Creation may
                // now attempt a second transaction; joining must report not-found.
                const missing = decide(null);
                if (!missing.kind) return missing.result;
                confirmedMissing = true; continue;
            }
            if (writeRequested && !transaction.committed) throw new Error('room transaction aborted');
            if (writeRequested) {
                const current = decodeRoomValue(transaction.snapshot.val());
                nativePresence(code, uid, !!(current && current.players && current.players[uid]));
            }
            return result;
        }
        throw new Error('room transaction could not initialize');
    }
    const store = {
        backend: 'rtdb',
        transact(code, decide) {
            if (!validCode(code)) return Promise.reject(invalidCode());
            const uid = getPlayerId(); return enqueue(code, () => transactInternal(code, decide, uid));
        },
        watch(code, cb) {
            if (!validCode(code)) {
                let active = true;
                queueMicrotask(() => { if (active) cb(null); });
                return () => { active = false; };
            }
            const uid = getPlayerId();
            let active = true;
            const unsubscribe = onValue(roomRef(code), snap => {
                if (!active) return;
                const data = decodeRoomValue(snap.val());
                // Avoid re-registering on every heartbeat; only membership transitions matter.
                if (presenceField && uid) {
                    const path = 'rooms/' + group + '/' + code + '/' + presenceField.replaceAll('.', '/') + '/' + uid;
                    const seated = !!(data && data.players && data.players[uid]);
                    if (memberships.has(path) !== seated) nativePresence(code, uid, seated);
                }
                cb(data);
            }, err => { if (active) cb(null, err); });
            return () => { active = false; unsubscribe(); };
        },
        get: code => validCode(code) ? get(roomRef(code)).then(snap => decodeRoomValue(snap.val())) : Promise.resolve(null),
        update(code, patch) {
            if (!validCode(code)) return Promise.reject(invalidCode());
            // Serialize this client's writes so update() cannot cancel its own pending
            // whole-room transaction. Writes by other clients cause normal retries.
            return enqueue(code, () => update(roomRef(code), Object.assign(encodeRoomPatch(patch), { lastActionAt: serverTimestamp() })));
        },
        remove(code) {
            if (!validCode(code)) return Promise.reject(invalidCode());
            const uid = getPlayerId();
            return enqueue(code, async () => { await remove(roomRef(code)); nativePresence(code, uid, false); });
        },
        cleanup(maxAgeMs = 5 * 60 * 1000) {
            if (cleanupPending) return cleanupPending;
            if (now() - cleanupAt < 60000) return Promise.resolve(0);
            cleanupAt = now();
            cleanupPending = (async () => {
                const cutoff = now() - maxAgeMs;
                const snapshot = await get(query(ref(db, 'rooms/' + group), orderByChild('lastActionAt'), endAt(cutoff), limitToFirst(20)));
                const jobs = [];
                snapshot.forEach(child => {
                    jobs.push(store.transact(child.key, data => data && data.lastActionAt < cutoff
                        ? { kind: 'delete', result: true } : { result: false }));
                });
                const results = await Promise.allSettled(jobs);
                return results.filter(item => item.status === 'fulfilled' && item.value).length;
            })().catch(err => { console.warn('[rooms] cleanup failed:', err); return 0; }).finally(() => { cleanupPending = null; });
            return cleanupPending;
        },
    };
    return store;
}
