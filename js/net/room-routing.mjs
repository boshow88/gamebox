/** Explicit code namespaces avoid cross-database collisions and Firestore discovery reads. */
export function createRoomRoutingStore(primary, legacy = null) {
    function select(code) {
        if (/^R-[A-Z0-9]{4}$/.test(code)) return primary;
        if (/^[A-Z0-9]{4}$/.test(code)) return legacy;
        return null;
    }
    function missing(decide) {
        const change = decide(null);
        if (change.kind) throw new Error('Unsupported or retired room code');
        return change.result;
    }
    return {
        backend: 'rtdb',
        async transact(code, decide, { intent } = {}) {
            if (intent === 'create' && !/^R-[A-Z0-9]{4}$/.test(code)) throw new Error('New RTDB room codes must use R-XXXX');
            const store = select(code);
            return store ? store.transact(code, decide) : missing(decide);
        },
        watch(code, cb) {
            const store = select(code); let active = true, unsubscribe = null;
            if (store) unsubscribe = store.watch(code, (data, err) => { if (active) cb(data, err); });
            else queueMicrotask(() => { if (active) cb(null); });
            return () => { active = false; if (unsubscribe) unsubscribe(); };
        },
        get: code => select(code) ? select(code).get(code) : Promise.resolve(null),
        update: (code, patch) => select(code) ? select(code).update(code, patch) : Promise.reject(new Error('Unsupported or retired room code')),
        remove: code => select(code) ? select(code).remove(code) : Promise.reject(new Error('Unsupported or retired room code')),
        cleanup: age => primary.cleanup(age),
    };
}
