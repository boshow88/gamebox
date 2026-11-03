import { createRoomService, createRoomPresence, generateRoomCode } from './rooms.mjs';
import { createRoomLobby } from './room-lobby.mjs';
import { createRealtimeRoomStore } from './rtdb-rooms.mjs';

/*
 * ArcadeNet — thin Firebase layer for online play (ES module, no build step).
 *
 * Loads the modular Firebase SDK from the CDN, signs players in (Google primary,
 * anonymous guest fallback), and exposes room CRUD + realtime listening on
 * `window.ArcadeNet`. It is game-agnostic: duel-specific logic stays in the game.
 *
 * Fails gracefully: if the SDK or config can't load, `window.ArcadeNet` is set to
 * a stub with `ok:false`, and a `arcade-net-ready` event still fires so callers
 * can disable online play while the offline/vs-AI experience keeps working.
 */
const SDK = '10.14.1';
const BASE = `https://www.gstatic.com/firebasejs/${SDK}`;

function fail(err) {
    console.warn('[ArcadeNet] disabled:', err && (err.message || err));
    window.ArcadeNet = { ok: false, error: String(err && (err.message || err) || err) };
    window.dispatchEvent(new CustomEvent('arcade-net-ready'));
}

(async function boot() {
    try {
        if (!window.FIREBASE_READY || !window.FIREBASE_CONFIG) throw new Error('config not set');

        const [{ initializeApp }, authMod, fsMod] = await Promise.all([
            import(`${BASE}/firebase-app.js`),
            import(`${BASE}/firebase-auth.js`),
            import(`${BASE}/firebase-firestore.js`),
        ]);
        const {
            getAuth, onAuthStateChanged, signInAnonymously, signOut,
            GoogleAuthProvider, signInWithPopup,
        } = authMod;
        const {
            getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, deleteField,
            collection, query, getDocs, orderBy, limit,
        } = fsMod;

        const app = initializeApp(window.FIREBASE_CONFIG);
        const auth = getAuth(app);
        const db = getFirestore(app);

        let user = undefined;                 // undefined = unknown yet, null = signed out
        let adminPromise = null;              // cached read of config/admins (admin roster)
        function readAdmins() {
            if (!adminPromise) adminPromise = getDoc(doc(db, 'config', 'admins')).then((s) => (s.exists() ? (s.data().members || {}) : {})).catch(() => ({}));
            return adminPromise;
        }
        const authCbs = [];
        onAuthStateChanged(auth, (u) => {
            user = u ? { uid: u.uid, name: u.displayName || null, email: u.email || null, photo: u.photoURL || null, anon: u.isAnonymous } : null;
            authCbs.forEach((fn) => { try { fn(user); } catch (e) { /* ignore */ } });
        });

        const roomSessionId = crypto.getRandomValues(new Uint32Array(4)).join('-');
        const roomSettings = window.FIREBASE_ROOMS || {};
        let rtdbSdk = null, rtdb = null, roomError = null;
        try {
            if (!roomSettings.databaseURL || !/^https:\/\/[a-z0-9.-]+\.(firebaseio\.com|firebasedatabase\.app)\/?$/i.test(roomSettings.databaseURL)) {
                throw new Error('Copy the Realtime Database URL from Firebase Console into FIREBASE_ROOMS.databaseURL');
            }
            rtdbSdk = await import(`${BASE}/firebase-database.js`);
            rtdb = rtdbSdk.getDatabase(app, roomSettings.databaseURL);
        } catch (err) {
            roomError = err;
            console.warn('[rooms] disabled; account sync is still available:', err);
        }
        function configureRooms(options) {
            if (!options || !options.collection) throw new Error('Room collection is required');
            if (roomError) throw roomError;
            const store = createRealtimeRoomStore(rtdbSdk, rtdb, options.collection, {
                presenceField: options.presenceField,
                getPlayerId: () => user ? (options.identity === 'tab' ? user.uid + '_' + roomSessionId : user.uid) : null,
            });
            return createRoomService({
                store,
                getUser: () => user, sessionId: roomSessionId,
                generateCode: generateRoomCode,
            }, Object.assign({}, options, { codeLength: 4 }));
        }

        window.ArcadeNet = {
            ok: true,
            sdk: SDK,
            // auth
            onAuth(fn) { authCbs.push(fn); if (user !== undefined) fn(user); },
            currentUser() { return user || null; },
            // Popup on every platform: a redirect would need the app and Firebase's
            // authDomain to share an origin (they don't on GitHub Pages), which modern
            // browsers' cross-site storage partitioning silently breaks.
            signInGoogle() { return signInWithPopup(auth, new GoogleAuthProvider()); },
            signInGuest() { return signInAnonymously(auth); },
            signOut() { return signOut(auth); },
            // per-user cloud profile — e.g. { bests: { "<gameId>:<mode>": score } } —
            // so a signed-in player's high scores follow them across devices.
            profile: {
                get(uid) { return getDoc(doc(db, 'profiles', uid)).then((s) => (s.exists() ? s.data() : null)); },
                save(uid, data) { return setDoc(doc(db, 'profiles', uid), Object.assign({ updatedAt: serverTimestamp() }, data), { merge: true }); },
                // Replace each named metadata field as a whole, so a birthday map
                // cannot retain a previously stored year through recursive merging.
                saveFields(uid, data) {
                    const patch = Object.assign({ updatedAt: serverTimestamp() }, data);
                    return setDoc(doc(db, 'profiles', uid), patch, { mergeFields: Object.keys(patch) });
                },
            },
            // write-only feedback drop box — anyone signed in may submit; only the owner
            // manages it in the inbox (see firestore.rules). Auto-generated id.
            feedback(data) {
                if (!user) return Promise.reject(new Error('not signed in'));
                return setDoc(doc(collection(db, 'feedback')), Object.assign({ at: serverTimestamp(), uid: user.uid, name: user.name || null, email: user.email || null, anon: !!user.anon }, data || {}));
            },
            // Read recent feedback — only works for allow-listed owner emails (see
            // firestore.rules); everyone else gets a permission error. Newest first.
            feedbackList(max) {
                return getDocs(query(collection(db, 'feedback'), orderBy('at', 'desc'), limit(max || 100)))
                    .then((snap) => snap.docs.map((d) => Object.assign({ id: d.id }, d.data())));
            },
            feedbackSetResolved(id, resolved) { return updateDoc(doc(db, 'feedback', id), { resolved: !!resolved }); },
            feedbackDelete(id) { return deleteDoc(doc(db, 'feedback', id)); },
            // Admin roster — a config doc readable/writable only by admins (see
            // firestore.rules). Shape: config/admins = { members: { "<email>": { name } } }.
            // No identifiers live in source; membership is keyed by Google email.
            getAdmins() { return readAdmins(); },
            isAdmin() {
                if (!user || !user.email) return Promise.resolve(false);
                const em = user.email.toLowerCase();
                return readAdmins().then((m) => !!m[em]);
            },
            adminAdd(email, name) {
                const em = (email || '').trim().toLowerCase();
                if (!em) return Promise.reject(new Error('no email'));
                adminPromise = null;                               // invalidate cache
                const patch = {}; patch[em] = { name: (name || '').trim() || null };
                return setDoc(doc(db, 'config', 'admins'), { members: patch }, { merge: true });
            },
            adminRemove(email) {
                const em = (email || '').trim().toLowerCase();
                adminPromise = null;
                return getDoc(doc(db, 'config', 'admins')).then((s) => {
                    const m = (s.exists() && s.data().members) || {};
                    delete m[em];
                    return updateDoc(doc(db, 'config', 'admins'), { members: m });
                });
            },
            field: { delete: deleteField, now: serverTimestamp },
            // Each game supplies its own matchmaking policy and initial match data.
            rooms: { ok: !roomError, backend: 'rtdb', error: roomError,
                create: configureRooms, presence: createRoomPresence, lobby: createRoomLobby },
        };
        window.dispatchEvent(new CustomEvent('arcade-net-ready'));
    } catch (err) {
        fail(err);
    }
})();
