import { createFeedbackService } from './feedback.mjs';
import { createAnnouncementService } from './announcements.mjs';

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
    if (!window.ArcadeAuth) {
        window.ArcadeAuth = window.ArcadeNet;
        window.dispatchEvent(new CustomEvent('arcade-auth-ready'));
    }
    window.dispatchEvent(new CustomEvent('arcade-net-ready'));
}

(async function boot() {
    try {
        if (!window.FIREBASE_READY || !window.FIREBASE_CONFIG) throw new Error('config not set');

        // Start downloads together, but never make account restoration wait for Firestore.
        // Observe failure immediately even if the Auth download is still pending.
        const firestoreLoad = import(`${BASE}/firebase-firestore.js`).then(
            sdk => ({ sdk }), error => ({ error }));
        const [{ initializeApp }, authMod] = await Promise.all([
            import(`${BASE}/firebase-app.js`), import(`${BASE}/firebase-auth.js`),
        ]);
        const {
            initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence,
            onAuthStateChanged, signInAnonymously, signOut,
            GoogleAuthProvider, signInWithPopup, browserPopupRedirectResolver,
        } = authMod;
        const app = initializeApp(window.FIREBASE_CONFIG);
        // Preserve the usual storage fallbacks. Popup support is supplied only when
        // requested, avoiding an eager cross-origin auth iframe during restoration.
        const auth = initializeAuth(app, {
            persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
        });
        let user; // undefined = restoring, null = confirmed signed out
        let authError = null, authEpoch = 0, adminPromise = null;
        const authCbs = new Set();
        const account = {
            ok: true,
            authState() { return authError ? 'error' : user === undefined ? 'loading' : 'ready'; },
            onAuth(fn) {
                authCbs.add(fn); if (user !== undefined) fn(user);
                return () => authCbs.delete(fn);
            },
            currentUser() { return user || null; },
            signInGoogle() { return signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver); },
            async signInGuest() {
                // A fast online/feedback action must not replace a still-restoring
                // Google session with an anonymous account.
                await auth.authStateReady();
                return auth.currentUser ? { user: auth.currentUser } : signInAnonymously(auth);
            },
            signOut() { return signOut(auth); },
        };
        onAuthStateChanged(auth, (u) => {
            authEpoch++; adminPromise = null; authError = null;
            user = u ? { uid: u.uid, name: u.displayName || null, email: u.email || null, photo: u.photoURL || null, anon: u.isAnonymous } : null;
            // Display hint only; never grants authentication or permissions.
            try {
                if (user && !user.anon && user.name && user.name.trim()) localStorage.setItem('gamebox:account-name', JSON.stringify({ uid: user.uid, name: user.name.trim() }));
                else localStorage.removeItem('gamebox:account-name');
            } catch (_) { /* Storage may be unavailable. */ }
            [...authCbs].forEach(fn => { if (!authCbs.has(fn)) return; try { fn(user); } catch (err) { console.warn('[ArcadeNet] auth subscriber:', err); } });
        }, (error) => {
            authError = error; authEpoch++; adminPromise = null;
            window.dispatchEvent(new CustomEvent('arcade-auth-error'));
        });
        window.ArcadeAuth = account;
        window.dispatchEvent(new CustomEvent('arcade-auth-ready'));

        const loaded = await firestoreLoad;
        if (loaded.error) throw loaded.error;
        const fsMod = loaded.sdk;
        const { getFirestore, doc, getDoc, getDocFromServer, setDoc, updateDoc, serverTimestamp, deleteField } = fsMod;
        const db = getFirestore(app);
        function readAdmins(refresh = false) {
            if (refresh) adminPromise = null;
            if (!adminPromise) {
                const pending = getDocFromServer(doc(db, 'config', 'admins'))
                    .then(s => s.exists() ? (s.data().members || {}) : {})
                    .catch(error => {
                        // A transient error must remain retryable and must not become
                        // a cached empty roster. Ignore invalidation from older requests.
                        if (adminPromise === pending) adminPromise = null;
                        throw error;
                    });
                adminPromise = pending;
            }
            return adminPromise;
        }
        const roomSessionId = crypto.getRandomValues(new Uint32Array(4)).join('-');
        const roomSettings = window.FIREBASE_ROOMS || {};
        let rtdbSdk = null, rtdb = null, roomLoad = null, roomModule, lobbyModule, transportModule;
        const rooms = {
            ok: null, backend: 'rtdb', error: null,
            // Download only for a game that actually uses rooms; account UI never waits.
            ready() {
                if (!roomLoad) roomLoad = (async () => {
                    if (!roomSettings.databaseURL || !/^https:\/\/[a-z0-9.-]+\.(firebaseio\.com|firebasedatabase\.app)\/?$/i.test(roomSettings.databaseURL)) {
                        throw new Error('Copy the Realtime Database URL from Firebase Console into FIREBASE_ROOMS.databaseURL');
                    }
                    [rtdbSdk, roomModule, lobbyModule, transportModule] = await Promise.all([
                        import(`${BASE}/firebase-database.js`), import('./rooms.mjs'),
                        import('./room-lobby.mjs'), import('./rtdb-rooms.mjs'),
                    ]);
                    rtdb = rtdbSdk.getDatabase(app, roomSettings.databaseURL);
                    rooms.ok = true; rooms.error = null;
                })().catch(error => {
                    rooms.ok = false; rooms.error = error; roomLoad = null;
                    throw error;
                });
                return roomLoad;
            },
            create: configureRooms,
            presence(...args) { return roomModule.createRoomPresence(...args); },
            lobby(...args) { return lobbyModule.createRoomLobby(...args); },
        };
        function configureRooms(options) {
            if (!options || !options.collection) throw new Error('Room collection is required');
            if (rooms.ok !== true) throw rooms.error || new Error('Await rooms.ready() before creating a room service');
            const store = transportModule.createRealtimeRoomStore(rtdbSdk, rtdb, options.collection, {
                presenceField: options.presenceField,
                getPlayerId: () => user ? (options.identity === 'tab' ? user.uid + '_' + roomSessionId : user.uid) : null,
            });
            return roomModule.createRoomService({
                store,
                getUser: () => user, sessionId: roomSessionId,
                generateCode: roomModule.generateRoomCode,
            }, Object.assign({}, options, { codeLength: 4 }));
        }

        const feedback = createFeedbackService({ sdk: fsMod, db, getUser: () => user });
        window.ArcadeNet = {
            ok: true,
            sdk: SDK,
            ...account,
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
            feedbackBox: feedback,
            announcements: createAnnouncementService({ sdk: fsMod, db, getUser: () => user }),
            feedback(data) { return feedback.send(data); },
            // Admin roster — a config doc readable/writable only by admins (see
            // firestore.rules). Shape: config/admins = { members: { "<email>": { name } } }.
            // No identifiers live in source; membership is keyed by Google email.
            getAdmins() { return readAdmins(); },
            isAdmin({ refresh = false } = {}) {
                if (authError) return Promise.reject(authError);
                if (!user || user.anon || !user.email) return Promise.resolve(false);
                const em = user.email.toLowerCase(), epoch = authEpoch;
                return readAdmins(refresh).then(m => epoch === authEpoch && !!m[em]).catch(error => {
                    // The roster is intentionally unreadable to non-admins.
                    if (error.code === 'permission-denied') return false;
                    throw error;
                });
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
            rooms,
        };
        window.dispatchEvent(new CustomEvent('arcade-net-ready'));
    } catch (err) {
        fail(err);
    }
})();
