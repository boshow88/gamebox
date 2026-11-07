/* Public announcements, admin publishing and account read acknowledgements. */
export function createAnnouncementService({ sdk, db, getUser }) {
    const { collection, doc, query, where, orderBy, limit, startAfter, getDocs,
        onSnapshot, runTransaction, serverTimestamp } = sdk;
    const root = () => collection(db, 'announcements'), index = () => doc(db, 'announcement_meta', 'index');
    function account() { const user = getUser(); if (!user || user.anon) throw Error('announcements/sign-in-required'); return user; }
    function localized(input, max) {
        const result = {};
        for (const lang of ['zh', 'en']) {
            const value = input && typeof input[lang] === 'string' ? input[lang].trim() : '';
            if (value.length > max) throw Error('announcements/invalid-content');
            result[lang] = value;
        }
        return result;
    }
    async function list(admin, cursor) {
        const filters = admin ? [] : [where('published', '==', true)];
        filters.push(orderBy(admin ? 'updatedAt' : 'publishedAt', 'desc'));
        if (cursor) filters.push(startAfter(cursor));
        const snapshot = await getDocs(query(root(), ...filters, limit(20)));
        return { items: snapshot.docs.map(item => ({ ...item.data(), id: item.id })),
            cursor: snapshot.docs.at(-1) || null, more: snapshot.docs.length === 20 };
    }
    return {
        list(cursor = null) { return list(false, cursor); },
        listAdmin(cursor = null) { account(); return list(true, cursor); },
        watchIndex(next, error) {
            return onSnapshot(index(), snapshot => next(snapshot.exists() ? snapshot.data().versions || {} : {}), error);
        },
        async save(id, input, expectedRevision = 0) {
            const user = account(), ref = id ? doc(db, 'announcements', id) : doc(root());
            const title = localized(input.title, 120), body = localized(input.body, 6000);
            if (!['zh', 'en'].some(lang => title[lang] && body[lang])
                || ['zh', 'en'].some(lang => !!title[lang] !== !!body[lang])) throw Error('announcements/invalid-content');
            const content = { title, body, important: !!input.important, published: !!input.published,
                game: typeof input.game === 'string' && input.game.length <= 80 ? input.game : null };
            const revision = await runTransaction(db, async transaction => {
                const snapshot = await transaction.get(ref), previous = snapshot.exists() ? snapshot.data() : null;
                if ((previous ? previous.revision : 0) !== expectedRevision) throw Error('announcements/changed');
                const changedPublication = content.published || previous && previous.published;
                let versions;
                if (changedPublication) {
                    const metadata = await transaction.get(index()); versions = { ...(metadata.exists() ? metadata.data().versions : {}) };
                    if (content.published) versions[ref.id] = expectedRevision + 1; else delete versions[ref.id];
                    if (Object.keys(versions).length > 1000) throw Error('announcements/limit');
                }
                transaction.set(ref, { ...content, revision: expectedRevision + 1,
                    createdBy: previous ? previous.createdBy : user.uid, createdAt: previous ? previous.createdAt : serverTimestamp(),
                    updatedBy: user.uid, updatedAt: serverTimestamp(),
                    publishedAt: content.published && (!previous || !previous.published) ? serverTimestamp() : previous ? previous.publishedAt : null });
                if (changedPublication) transaction.set(index(), { versions, updatedAt: serverTimestamp() });
                return expectedRevision + 1;
            });
            return { id: ref.id, revision };
        },
        async remove(id, expectedRevision) {
            account(); const ref = doc(db, 'announcements', id);
            return runTransaction(db, async transaction => {
                const snapshot = await transaction.get(ref);
                if (!snapshot.exists()) return;
                if (snapshot.data().revision !== expectedRevision) throw Error('announcements/changed');
                if (snapshot.data().published) throw Error('announcements/unpublish-first');
                transaction.delete(ref);
            });
        },
        async markRead(id, revision) {
            const user = account();
            return runTransaction(db, async transaction => {
                const article = await transaction.get(doc(db, 'announcements', id));
                if (!article.exists() || !article.data().published || article.data().revision !== revision) return { saved: false };
                const profile = doc(db, 'profiles', user.uid), snapshot = await transaction.get(profile);
                const reads = { ...(snapshot.exists() ? snapshot.data().announcementReads || {} : {}) };
                if ((Number.isInteger(reads[id]) ? reads[id] : 0) < revision) {
                    reads[id] = revision;
                    transaction.set(profile, { announcementReads: { [id]: revision } }, { merge: true });
                }
                return { saved: true, reads };
            });
        },
        async markAllRead(expectedVersions) {
            const user = account(), expected = Object.entries(expectedVersions || {});
            if (!expectedVersions || typeof expectedVersions !== 'object' || Array.isArray(expectedVersions)
                || expected.length > 1000 || expected.some(([, revision]) => !Number.isSafeInteger(revision) || revision < 1)) throw Error('announcements/invalid-versions');
            return runTransaction(db, async transaction => {
                const metadata = await transaction.get(index());
                const versions = metadata.exists() ? metadata.data().versions || {} : {};
                const profile = doc(db, 'profiles', user.uid), snapshot = await transaction.get(profile);
                const reads = { ...(snapshot.exists() ? snapshot.data().announcementReads || {} : {}) }, updates = {};
                for (const [id, revision] of expected) {
                    if (versions[id] === revision && (!Number.isInteger(reads[id]) || reads[id] < revision)) {
                        reads[id] = revision; updates[id] = revision;
                    }
                }
                if (Object.keys(updates).length) transaction.set(profile, { announcementReads: updates }, { merge: true });
                return { saved: true, reads };
            });
        },
    };
}
