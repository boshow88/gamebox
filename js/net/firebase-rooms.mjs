/** Firebase transport for rooms.mjs; every membership decision runs in a transaction. */
const cleanupByDatabase = new WeakMap();
export function createFirebaseRoomStore(sdk, db, group, { now = Date.now } = {}) {
    const { doc, runTransaction, serverTimestamp, getDoc, updateDoc, deleteDoc, onSnapshot,
        collection, query, where, getDocs, limit } = sdk;
    const ref = code => doc(db, group, code);
    if (!cleanupByDatabase.has(db)) cleanupByDatabase.set(db, new Map());
    const cleanups = cleanupByDatabase.get(db);
    if (!cleanups.has(group)) cleanups.set(group, { at: -Infinity, pending: null });
    const cleanupState = cleanups.get(group);
    return {
        async transact(code, decide) {
            return runTransaction(db, async tx => {
                const target = ref(code), snap = await tx.get(target);
                const change = decide(snap.exists() ? snap.data() : null);
                if (change.kind === 'create') tx.set(target, Object.assign({}, change.data, {
                    createdAt: serverTimestamp(), lastActionAt: serverTimestamp(),
                    expireAt: new Date(Date.now() + 6 * 3600 * 1000),
                }));
                else if (change.kind === 'update') tx.update(target, Object.assign({}, change.data, { lastActionAt: serverTimestamp() }));
                else if (change.kind === 'delete') tx.delete(target);
                return change.result;
            });
        },
        watch(code, cb) { return onSnapshot(ref(code), snap => cb(snap.exists() ? snap.data() : null), err => cb(null, err)); },
        get(code) { return getDoc(ref(code)).then(snap => snap.exists() ? snap.data() : null); },
        update(code, patch) { return updateDoc(ref(code), Object.assign({}, patch, { lastActionAt: serverTimestamp() })); },
        remove(code) { return deleteDoc(ref(code)); },
        cleanup(maxAgeMs = 5 * 60 * 1000) {
            if (cleanupState.pending) return cleanupState.pending;
            if (now() - cleanupState.at < 60000) return Promise.resolve(0);
            cleanupState.at = now(); // throttle failures too, instead of retrying a denied query every tick
            cleanupState.pending = (async () => {
                try {
                    const cutoff = new Date(now() - maxAgeMs);
                    const snap = await getDocs(query(collection(db, group), where('lastActionAt', '<', cutoff), limit(20)));
                    const results = await Promise.allSettled(snap.docs.map(item => deleteDoc(item.ref)));
                    const failed = results.filter(result => result.status === 'rejected');
                    if (failed.length) console.warn('[rooms] cleanup failed:', failed[0].reason);
                    return results.length - failed.length;
                } catch (err) { console.warn('[rooms] cleanup failed:', err); return 0; }
            })().finally(() => { cleanupState.pending = null; });
            return cleanupState.pending;
        },
    };
}
