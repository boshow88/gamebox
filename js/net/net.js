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
            getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
            runTransaction, serverTimestamp, deleteField,
            collection, query, where, getDocs, orderBy, limit,
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

        // --- room helpers ---
        const ROOMS = 'duel_rooms';
        const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no ambiguous 0/O/1/I/L
        function genCode(n) { let s = ''; for (let i = 0; i < (n || 4); i++) s += ALPHABET[(Math.random() * ALPHABET.length) | 0]; return s; }
        const roomRef = (code) => doc(db, ROOMS, code);

        async function createRoom(seed) {
            if (!user) throw new Error('not signed in');
            // try a few codes to dodge a rare collision
            for (let attempt = 0; attempt < 6; attempt++) {
                const code = genCode(4);
                const ref = roomRef(code);
                const ok = await runTransaction(db, async (tx) => {
                    const snap = await tx.get(ref);
                    if (snap.exists()) return false;
                    tx.set(ref, {
                        code,
                        status: 'waiting',
                        hostUid: user.uid,
                        seed: seed || ((Math.random() * 1e9) | 0),
                        slots: [user.uid, null],
                        players: { [user.uid]: { uid: user.uid, name: user.name, photo: user.photo, anon: user.anon, slot: 0 } },
                        round: 0,
                        createdAt: serverTimestamp(),
                        lastActionAt: serverTimestamp(),
                        expireAt: new Date(Date.now() + 6 * 3600 * 1000),   // TTL: auto-purge the room ~6h after creation
                    });
                    return true;
                });
                if (ok) return code;
            }
            throw new Error('could not allocate a room code');
        }

        async function joinRoom(code) {
            if (!user) throw new Error('not signed in');
            code = String(code || '').trim().toUpperCase();
            const ref = roomRef(code);
            return runTransaction(db, async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists()) throw new Error('room not found');
                const d = snap.data();
                if (d.players && d.players[user.uid]) return code;   // rejoin
                const slots = Array.isArray(d.slots) ? d.slots.slice() : [d.hostUid || null, null];
                if (d.status !== 'waiting' || slots[1]) throw new Error('room full');
                slots[1] = user.uid;                                 // write the whole array (no array dot-paths)
                tx.update(ref, {
                    status: 'playing',                               // room is now occupied (not the match state)
                    slots,
                    [`players.${user.uid}`]: { uid: user.uid, name: user.name, photo: user.photo, anon: user.anon, slot: 1 },
                    round: 1,
                    game: {},                                        // reset any stale match state → both must Ready again
                    ready: {},
                    lastActionAt: serverTimestamp(),
                });
                return code;
            });
        }

        // Leave a room. If anyone remains, KEEP the room (so it can be rejoined by code) —
        // free the leaver's seat, reset the match, and if the host left, promote a remaining
        // player to host. Only an empty room is deleted. This lets a player leave and come
        // back to the same code for a rematch, with the other side seeing them return.
        async function leaveRoom(code) {
            if (!user) return;
            const ref = roomRef(code);
            try {
                await runTransaction(db, async (tx) => {
                    const s = await tx.get(ref);
                    if (!s.exists()) return;
                    const d = s.data();
                    const players = Object.assign({}, d.players || {});
                    delete players[user.uid];
                    const remaining = Object.keys(players);
                    if (remaining.length === 0) { tx.delete(ref); return; }   // nobody left → remove the room
                    let hostUid = d.hostUid;
                    if (hostUid === user.uid) hostUid = remaining[0];          // host left → promote whoever stays
                    const guest = remaining.find((u) => u !== hostUid) || null;
                    tx.update(ref, {
                        players,
                        hostUid,
                        slots: [hostUid, guest],
                        status: 'waiting',
                        game: {}, ready: {},
                        lastActionAt: serverTimestamp(),
                    });
                });
            } catch (e) { /* ignore */ }
        }
        function deleteRoom(code) { return deleteDoc(roomRef(code)); }

        // Lazy garbage collection: whenever someone opens the lobby, purge rooms with
        // no activity for a while. Firestore has no onDisconnect, and unload-time
        // writes aren't reliable, so this is how abandoned/F5'd rooms get cleaned —
        // reliably, for free, next time anyone uses the app. Live games refresh
        // lastActionAt every round, so they're never collected mid-match.
        async function cleanupStaleRooms(maxAgeMs) {
            if (!user) return 0;   // not signed in yet — the query would be denied; it'll run later once auth lands
            try {
                const cutoff = new Date(Date.now() - (maxAgeMs || 5 * 60 * 1000));
                const snap = await getDocs(query(collection(db, ROOMS), where('lastActionAt', '<', cutoff)));
                if (snap.size === 0) return 0;
                const results = await Promise.allSettled(snap.docs.map((d) => deleteDoc(d.ref)));
                const failed = results.filter((r) => r.status === 'rejected');
                const ok = results.length - failed.length;
                if (failed.length) console.warn('[ArcadeNet] cleanup: deleted ' + ok + ', FAILED ' + failed.length + ' — check Firestore Rules (allow delete). Reason:', failed[0].reason && (failed[0].reason.message || failed[0].reason));
                else console.info('[ArcadeNet] cleanup: deleted ' + ok + ' stale room(s)');
                return ok;
            } catch (e) { console.warn('[ArcadeNet] cleanup query failed:', e && (e.message || e)); return 0; }
        }

        // --- generic N-player rooms (additive; the 1v1 helpers above are untouched) ---
        // A `group` is just a Firestore collection name, so different games keep
        // separate room spaces (e.g. Beam uses 'beam_rooms'). Up to `maxPlayers`
        // can join a 'lobby' room; `order` preserves join order (host migration,
        // tie-breaks). Rejoin by code works at any status (reconnect-friendly).
        // Generate once per page, rather than in shared browser storage. Even a
        // duplicated tab gets its own seat while keeping the signed-in account.
        const mpSessionId = crypto.getRandomValues(new Uint32Array(4)).join('-');
        function mpCurrentPlayer() {
            return user ? Object.assign({}, user, { uid: user.uid + '_' + mpSessionId }) : null;
        }
        function groupRef(group, code) { return doc(db, group, code); }
        async function mpCreate(group, opts) {
            const player = mpCurrentPlayer();
            if (!player) throw new Error('not signed in');
            opts = opts || {};
            const max = Math.max(2, Math.min(8, opts.maxPlayers || 4));
            for (let attempt = 0; attempt < 6; attempt++) {
                const code = genCode(4), ref = groupRef(group, code);
                const ok = await runTransaction(db, async (tx) => {
                    if ((await tx.get(ref)).exists()) return false;
                    tx.set(ref, {
                        code, status: 'lobby', hostUid: player.uid, maxPlayers: max,
                        players: { [player.uid]: { uid: player.uid, name: player.name, photo: player.photo, anon: player.anon, order: 0 } },
                        order: [player.uid], ready: {}, round: 0, game: {},
                        createdAt: serverTimestamp(), lastActionAt: serverTimestamp(),
                        expireAt: new Date(Date.now() + 6 * 3600 * 1000),
                    });
                    return true;
                });
                if (ok) return code;
            }
            throw new Error('could not allocate a room code');
        }
        async function mpJoin(group, code) {
            const player = mpCurrentPlayer();
            if (!player) throw new Error('not signed in');
            code = String(code || '').trim().toUpperCase();
            const ref = groupRef(group, code);
            return runTransaction(db, async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists()) throw new Error('room not found');
                const d = snap.data();
                if (d.players && d.players[player.uid]) return code;       // same page rejoining / reconnecting at any status
                if (d.status !== 'lobby') throw new Error('already started');
                const order = Array.isArray(d.order) ? d.order.slice() : Object.keys(d.players || {});
                if (order.length >= (d.maxPlayers || 4)) throw new Error('room full');
                order.push(player.uid);
                // colour/slot index = lowest index not currently taken by a present player. This stays
                // unique after leaves (a leaver's slot frees up) — using order.length-1 could collide,
                // because mpLeave filters the order array but doesn't re-index players' stored slots.
                const used = new Set(Object.keys(d.players || {}).map((u) => (d.players[u] || {}).order));
                let slot = 0; while (used.has(slot)) slot++;
                tx.update(ref, {
                    [`players.${player.uid}`]: { uid: player.uid, name: player.name, photo: player.photo, anon: player.anon, order: slot },
                    [`ready.${player.uid}`]: deleteField(),    // a new seat always needs a fresh ready confirmation
                    order, lastActionAt: serverTimestamp(),
                });
                return code;
            });
        }
        async function mpLeave(group, code) {
            const player = mpCurrentPlayer();
            if (!player) return;
            const ref = groupRef(group, code);
            try {
                await runTransaction(db, async (tx) => {
                    const s = await tx.get(ref); if (!s.exists()) return;
                    const d = s.data();
                    const players = Object.assign({}, d.players || {});
                    delete players[player.uid];
                    const order = (Array.isArray(d.order) ? d.order : Object.keys(d.players || {})).filter((u) => u !== player.uid);
                    if (order.length === 0) { tx.delete(ref); return; }    // nobody left → remove the room
                    let hostUid = d.hostUid;
                    if (hostUid === player.uid) hostUid = order[0];         // host left → promote next in join order
                    tx.update(ref, { players, order, hostUid, [`ready.${player.uid}`]: deleteField(), lastActionAt: serverTimestamp() });
                });
            } catch (e) { /* ignore */ }
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
            // rooms (1v1 — used by Rune Stones)
            createRoom, joinRoom, leaveRoom, deleteRoom, cleanupStaleRooms,
            watchRoom(code, cb) { return onSnapshot(roomRef(code), (s) => cb(s.exists() ? s.data() : null), (err) => cb(null, err)); },
            updateRoom(code, data) { return updateDoc(roomRef(code), Object.assign({ lastActionAt: serverTimestamp() }, data)); },
            getRoom(code) { return getDoc(roomRef(code)).then((s) => (s.exists() ? s.data() : null)); },
            field: { delete: deleteField, now: serverTimestamp },
            // generic N-player rooms (used by Beam): all scoped to a `group` collection
            mp: {
                currentPlayer: mpCurrentPlayer,
                create: mpCreate, join: mpJoin, leave: mpLeave,
                watch(group, code, cb) { return onSnapshot(groupRef(group, code), (s) => cb(s.exists() ? s.data() : null), (err) => cb(null, err)); },
                update(group, code, data) { return updateDoc(groupRef(group, code), Object.assign({ lastActionAt: serverTimestamp() }, data)); },
                get(group, code) { return getDoc(groupRef(group, code)).then((s) => (s.exists() ? s.data() : null)); },
                del(group, code) { return deleteDoc(groupRef(group, code)); },
                async cleanup(group, maxAgeMs) {
                    try {
                        const cutoff = new Date(Date.now() - (maxAgeMs || 5 * 60 * 1000));
                        const snap = await getDocs(query(collection(db, group), where('lastActionAt', '<', cutoff)));
                        if (snap.size === 0) return 0;
                        const results = await Promise.allSettled(snap.docs.map((d) => deleteDoc(d.ref)));
                        return results.filter((r) => r.status === 'fulfilled').length;
                    } catch (e) { return 0; }
                },
            },
        };
        window.dispatchEvent(new CustomEvent('arcade-net-ready'));
    } catch (err) {
        fail(err);
    }
})();
