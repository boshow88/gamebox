/* Account-owned feedback and admin replies. SDK injection keeps rules tests local. */
export function createFeedbackService({ sdk, db, getUser }) {
    const { collection, doc, getDocs, query, where, orderBy, limit, startAfter,
        setDoc, updateDoc, deleteDoc, onSnapshot, runTransaction, serverTimestamp } = sdk;
    const root = () => collection(db, 'feedback');
    function account() {
        const user = getUser();
        if (!user || user.anon) throw new Error('feedback/sign-in-required');
        return user;
    }
    function text(value) {
        const result = typeof value === 'string' ? value.trim() : '';
        if (!result || result.length > 2000) throw new Error('feedback/invalid-text');
        return result;
    }
    function item(snapshot) { return Object.assign({}, snapshot.data(), { id: snapshot.id }); }
    async function page(filters, cursor, size) {
        const clauses = [...filters, orderBy('at', 'desc')];
        if (cursor) clauses.push(startAfter(cursor));
        const snapshot = await getDocs(query(root(), ...clauses, limit(size)));
        return { items: snapshot.docs.map(item), cursor: snapshot.docs.at(-1) || null, more: snapshot.docs.length === size };
    }
    return {
        async send(input) {
            const user = getUser();
            if (!user) throw new Error('feedback/sign-in-required');
            const ref = doc(root());
            await setDoc(ref, {
                text: text(input.text), lang: input.lang === 'zh' ? 'zh' : 'en',
                kind: ['idea', 'bug', 'other'].includes(input.kind) ? input.kind : null,
                game: typeof input.game === 'string' && input.game.length <= 80 ? input.game : null,
                uid: user.uid, name: user.name ? user.name.slice(0, 200) : null,
                email: user.email || null, anon: !!user.anon, at: serverTimestamp(),
                resolved: false, replyVersion: 0, unread: false,
            });
            return ref.id;
        },
        listMine(cursor = null) { return page([where('uid', '==', account().uid)], cursor, 20); },
        listAdmin(cursor = null) { account(); return page([], cursor, 50); },
        async listUnread() {
            const snapshot = await getDocs(query(root(), where('uid', '==', account().uid), where('unread', '==', true), limit(20)));
            return { items: snapshot.docs.map(item), cursor: null, more: false };
        },
        watchUnread(next, error) {
            const uid = account().uid;
            return onSnapshot(query(root(), where('uid', '==', uid), where('unread', '==', true), limit(20)),
                snapshot => next(snapshot.docs.map(item)), error);
        },
        async reply(id, value, expectedVersion) {
            const user = account(), replyText = text(value), ref = doc(db, 'feedback', id);
            return runTransaction(db, async transaction => {
                const snapshot = await transaction.get(ref);
                if (!snapshot.exists()) throw new Error('feedback/not-found');
                const oldVersion = snapshot.data().replyVersion || 0;
                if (oldVersion !== expectedVersion) throw new Error('feedback/reply-changed');
                transaction.update(ref, { reply: { text: replyText, by: user.uid, at: serverTimestamp() },
                    replyVersion: oldVersion + 1, unread: true });
                return oldVersion + 1;
            });
        },
        async markRead(id, expectedVersion) {
            const user = account(), ref = doc(db, 'feedback', id);
            return runTransaction(db, async transaction => {
                const snapshot = await transaction.get(ref);
                if (!snapshot.exists()) return false;
                const data = snapshot.data();
                if (data.uid !== user.uid || data.replyVersion !== expectedVersion || !data.unread) return false;
                transaction.update(ref, { unread: false });
                return true;
            });
        },
        setResolved(id, resolved) { account(); return updateDoc(doc(db, 'feedback', id), { resolved: !!resolved }); },
        remove(id) { account(); return deleteDoc(doc(db, 'feedback', id)); },
    };
}
