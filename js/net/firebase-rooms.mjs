/** Firebase transport for rooms.mjs; every membership decision runs in a transaction. */
export function createFirebaseRoomStore(sdk, db, group) {
    const { doc, runTransaction, serverTimestamp, getDoc, updateDoc, deleteDoc, onSnapshot,
        collection, query, where, getDocs } = sdk;
    const ref = code => doc(db, group, code);
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
        async cleanup(maxAgeMs = 5 * 60 * 1000) {
            try {
                const cutoff = new Date(Date.now() - maxAgeMs);
                const snap = await getDocs(query(collection(db, group), where('lastActionAt', '<', cutoff)));
                const results = await Promise.allSettled(snap.docs.map(item => deleteDoc(item.ref)));
                const failed = results.filter(result => result.status === 'rejected');
                if (failed.length) console.warn('[rooms] cleanup failed:', failed[0].reason);
                return results.length - failed.length;
            } catch (err) { console.warn('[rooms] cleanup failed:', err); return 0; }
        },
    };
}
