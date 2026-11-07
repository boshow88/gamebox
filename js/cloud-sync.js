/*
 * CloudSync — one shared engine for per-account high-score sync (no build step).
 *
 * The problem it solves: local records live in localStorage keyed by DEVICE, so
 * without care they'd bridge accounts (play 10000 as guest → sign in A → A gets
 * 10000 → sign in B → B also gets 10000). CloudSync keeps the guest's records in
 * their own local "drawer" and CLEARS the live keys on sign-in, so an account only
 * ever holds what came from the cloud (plus an explicit per-game claim). A signed-in
 * account mirrors to Firestore `profiles/{uid}` and follows the player across devices.
 *
 * Design — the live localStorage keys are the WORKING copy; the cloud profile is the
 * source of truth for a signed-in account. Only the guest identity is cached locally
 * (a single "guest drawer"); accounts are never mirrored to a local drawer.
 *   1. Sign in: stash the guest's live records in the guest drawer, CLEAR the live
 *      keys (so guest scores never bleed into the account), then pull the account
 *      from the cloud into the live keys. Sign out: bring the guest drawer back.
 *   2. At sign-in, any games the account doesn't have yet but the device does are
 *      offered as a claim (move, not copy): accepting merges just those games in,
 *      pushes, and drops them from the guest drawer; games the account already has
 *      are left alone. "Already has the game" is the gate, so a game is claimable
 *      into a given account at most once. The prompt appears only at sign-in, so
 *      declining (or ignoring) it won't reappear until the next sign-in.
 *   3. Games register `CloudSync.onApplied(refresh)` to repaint, and call
 *      `CloudSync.sync()` after setting a new best so it reaches the cloud.
 *   4. Because this module also loads on the launcher, signing in there runs every
 *      descriptor at once — a single login syncs all games.
 *
 * Guests and offline are unaffected: everything is guarded and the cloud layer
 * (ArcadeNet) is optional.
 *
 * Record shapes are described by DESCRIPTORS (one per record family). Each reads/
 * writes the records portion of the game's own localStorage, merges two record
 * objects (max/min per field), and maps to/from the Firestore profile document.
 */
(function () {
    'use strict';

    var PREFIX = 'arcadeGames';
    var ACTIVE_KEY = PREFIX + ':activeScope';     // which identity the live keys currently hold ('guest' or a uid)
    var BUCKET = PREFIX + ':bucket:';             // guest drawer only (BUCKET+'guest'); accounts live in the cloud

    function rd(key, fb) { try { var r = localStorage.getItem(key); return r == null ? fb : JSON.parse(r); } catch (e) { return fb; } }
    function wr(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* ignore */ } }
    function del(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
    function isEmpty(o) { return !o || Object.keys(o).length === 0; }

    // --- merge helpers ---------------------------------------------------------
    // Deep-merge nested number maps, keeping the better value per leaf. `pick` is
    // Math.max for scores (higher better) or Math.min for ranks/rounds.
    function mergeMap(a, b, pick) {
        var out = {}; var k;
        for (k in (a || {})) out[k] = a[k];
        for (k in (b || {})) out[k] = (out[k] == null) ? b[k] : pick(out[k], b[k]);
        return out;
    }

    // --- descriptors -----------------------------------------------------------
    // read():            -> canonical records object (from the live localStorage)
    // write(obj):        write a records object back to the live localStorage
    // clear():           wipe this family's records from the live localStorage
    // merge(a, b):       combine two records objects (keeping the better values)
    // toProfile(obj):    -> the Firestore profile fragment for this family
    // fromProfile(prof): -> a records object from a profile document
    var DESCRIPTORS = [];

    // (1) Generic arcade high scores — the `best` map of every arcadeGames:scores:<game>
    // key. Cloud: games.<game>.bests[<mode>] (max). A couple of games keep a scores key
    // for shell bookkeeping but own a bespoke descriptor below (Beam, and Rune Stones'
    // Sandbag) — EXCLUDE stops them being counted or offered twice.
    var EXCLUDE = { 'beam': 1, 'rune-stones': 1 };
    function scoreGames() {
        var out = [], p = PREFIX + ':scores:';
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(p) === 0) out.push(k.slice(p.length));
        }
        return out;
    }
    DESCRIPTORS.push({
        read: function () {
            var o = {};
            scoreGames().forEach(function (g) { if (EXCLUDE[g]) return; var d = rd(PREFIX + ':scores:' + g, null); if (d && d.best && !isEmpty(d.best)) o[g] = d.best; });
            return o;
        },
        write: function (obj) {
            // union of present games (bespoke ones excluded) and those in obj, so a
            // restore can both set and clear.
            var games = {}; scoreGames().forEach(function (g) { if (!EXCLUDE[g]) games[g] = 1; }); Object.keys(obj || {}).forEach(function (g) { games[g] = 1; });
            Object.keys(games).forEach(function (g) {
                var key = PREFIX + ':scores:' + g, d = rd(key, { best: {}, recent: [] }) || { best: {}, recent: [] };
                d.best = (obj && obj[g]) || {};
                wr(key, d);
            });
        },
        // clear() wipes ALL scores keys (incl. the excluded ones) so a sign-in can't
        // leave stale guest bests behind anywhere.
        clear: function () { scoreGames().forEach(function (g) { var key = PREFIX + ':scores:' + g, d = rd(key, null); if (d) { d.best = {}; wr(key, d); } }); },
        merge: function (a, b) { var out = {}, g; for (g in (a || {})) out[g] = a[g]; for (g in (b || {})) out[g] = mergeMap(out[g], b[g], Math.max); return out; },
        listGames: function (recs) { return Object.keys(recs || {}).map(function (g) { return { key: g, display: g }; }); },
        subset: function (recs, keys) { var o = {}; Object.keys(recs || {}).forEach(function (g) { if (keys[g]) o[g] = recs[g]; }); return o; },
        without: function (recs, keys) { var o = {}; Object.keys(recs || {}).forEach(function (g) { if (!keys[g]) o[g] = recs[g]; }); return o; },
        toProfile: function (obj) { var games = {}; Object.keys(obj || {}).forEach(function (g) { if (!isEmpty(obj[g])) games[g] = { bests: obj[g] }; }); return { games: games }; },
        fromProfile: function (prof) { var o = {}, games = (prof && prof.games) || {}; Object.keys(games).forEach(function (g) { if (EXCLUDE[g]) return; var b = games[g] && games[g].bests; if (b && !isEmpty(b)) o[g] = Object.assign({}, b); }); return o; },
    });

    // (2) Beam — best finishing place per difficulty notch (lower is better).
    // Local: arcadeGames:beam:solo:n<notch> = { played, wins, best }. Cloud: games.beam.ranks[<notch>] = best (min).
    function beamKey(n) { return PREFIX + ':beam:solo:n' + n; }
    DESCRIPTORS.push({
        read: function () { var o = {}; for (var n = 0; n < 32; n++) { var st = rd(beamKey(n), null); if (st && st.best) o[n] = st; } return o; },
        write: function (obj) { for (var n = 0; n < 32; n++) { var k = beamKey(n); if (obj && obj[n]) wr(k, obj[n]); } },
        clear: function () { for (var n = 0; n < 32; n++) del(beamKey(n)); },
        listGames: function (recs) { return isEmpty(recs) ? [] : [{ key: 'beam', display: 'beam' }]; },
        subset: function (recs, keys) { return keys['beam'] ? (recs || {}) : {}; },
        without: function (recs, keys) { return keys['beam'] ? {} : (recs || {}); },
        merge: function (a, b) {
            var out = {}, n; for (n in (a || {})) out[n] = Object.assign({}, a[n]);
            for (n in (b || {})) {
                var x = out[n] || {}, y = b[n];
                out[n] = {
                    best: (x.best && y.best) ? Math.min(x.best, y.best) : (x.best || y.best || 0),
                    wins: Math.max(x.wins || 0, y.wins || 0),
                    played: Math.max(x.played || 0, y.played || 0),
                };
            }
            return out;
        },
        toProfile: function (obj) { var ranks = {}; Object.keys(obj || {}).forEach(function (n) { if (obj[n].best) ranks[n] = obj[n].best; }); return isEmpty(ranks) ? { games: {} } : { games: { 'beam': { ranks: ranks } } }; },
        fromProfile: function (prof) { var o = {}, ranks = (prof && prof.games && prof.games.beam && prof.games.beam.ranks) || {}; Object.keys(ranks).forEach(function (n) { o[n] = { best: ranks[n] }; }); return o; },
    });

    // (3) Rune Stones — Sandbag bests (max) live in the prefs blob alongside device
    // settings, so we touch only the record fields. Cloud: games.rune-stones.sandbag[<level>] = {total,spin}.
    var RK = PREFIX + ':prefs:rune-stones';
    DESCRIPTORS.push({
        read: function () { var p = rd(RK, {}) || {}; var o = {}; if (p.sandbox) o.sandbox = p.sandbox; if (p.bestRounds) o.bestRounds = p.bestRounds; if (p.bestSpin) o.bestSpin = p.bestSpin; return o; },
        write: function (obj) { var p = rd(RK, {}) || {}; p.sandbox = (obj && obj.sandbox) || {}; p.bestRounds = (obj && obj.bestRounds) || {}; p.bestSpin = (obj && obj.bestSpin) || {}; wr(RK, p); },
        clear: function () { var p = rd(RK, null); if (!p) return; delete p.sandbox; delete p.bestRounds; delete p.bestSpin; wr(RK, p); },
        listGames: function (recs) { recs = recs || {}; var has = !isEmpty(recs.sandbox || {}) || !isEmpty(recs.bestRounds || {}) || !isEmpty(recs.bestSpin || {}); return has ? [{ key: 'rune-stones', display: 'rune-stones' }] : []; },
        subset: function (recs, keys) { return keys['rune-stones'] ? (recs || {}) : {}; },
        without: function (recs, keys) { return keys['rune-stones'] ? {} : (recs || {}); },
        merge: function (a, b) {
            a = a || {}; b = b || {};
            var sandbox = {}, lv; var la = a.sandbox || {}, lb = b.sandbox || {};
            var levels = {}; Object.keys(la).forEach(function (k) { levels[k] = 1; }); Object.keys(lb).forEach(function (k) { levels[k] = 1; });
            for (lv in levels) {
                var x = la[lv] || {}, y = lb[lv] || {};
                sandbox[lv] = {
                    bestTotal: Math.max(x.bestTotal || 0, y.bestTotal || 0) || undefined,
                    bestSpin: Math.max(x.bestSpin || 0, y.bestSpin || 0) || undefined,
                };
            }
            return { sandbox: sandbox, bestRounds: mergeMap(a.bestRounds, b.bestRounds, Math.min), bestSpin: mergeMap(a.bestSpin, b.bestSpin, Math.max) };
        },
        toProfile: function (obj) { var sandbag = {}, sb = (obj && obj.sandbox) || {}; Object.keys(sb).forEach(function (lv) { var e = sb[lv], p = {}; if (e.bestTotal != null) p.total = e.bestTotal; if (e.bestSpin != null) p.spin = e.bestSpin; if (Object.keys(p).length) sandbag[lv] = p; }); return isEmpty(sandbag) ? { games: {} } : { games: { 'rune-stones': { sandbag: sandbag } } }; },
        fromProfile: function (prof) { var o = { sandbox: {} }, sb = (prof && prof.games && prof.games['rune-stones'] && prof.games['rune-stones'].sandbag) || {}; Object.keys(sb).forEach(function (lv) { o.sandbox[lv] = { bestTotal: sb[lv].total, bestSpin: sb[lv].spin }; }); return o; },
    });

    // --- record migrations -----------------------------------------------------
    // A growing, ORDERED list of one-time transforms, for when a game changes its record
    // STRUCTURE (modes added/removed, keys renamed). To add one: append { at, note, scores }.
    //   at:     a fixed UTC-ms timestamp (its identity; must only ever increase down the list).
    //   scores: fn(map) → map, where map is the generic high-score map { gameId: { modeKey: best } }.
    //           ONLY touch the game(s) you mean to — anything you leave untouched is preserved.
    //           MUST be idempotent (re-running is a no-op): a failed/offline run gets retried.
    // A dedicated watermark records how far each store has migrated — profile.recordsMigratedAt for
    // an account, the arcadeGames:migratedAt key locally — so each migration runs at most once per store.
    // (Firestore setDoc(merge) can't DROP fields, so cloud removals are applied via deleteField below.)
    var MIGRATIONS = [
        {
            at: 1793577600000,   // 2026-11-02, this deploy. prime-zuma: levels became 4×6; endless keys became per (style, field).
            note: 'prime-zuma: drop high-score keys for modes that no longer exist',
            scores: function (map) {
                var pz = map && map['prime-zuma']; if (!pz) return map;     // every OTHER game is left untouched
                var valid = {}, w, l;
                for (w = 1; w <= 4; w++) for (l = 1; l <= 6; l++) valid['L' + w + '-' + l] = 1;                       // levels 1-1 … 4-6
                ['balanced', 'gnarly', 'blitz', 'hardPrimes'].forEach(function (d) {                                  // endless: one per (style, field)
                    ['vortex', 'box', 'serpent', 'star', 'twin', 'tri', 'maze', 'duo', 'trine'].forEach(function (f) { valid['E-' + d + '-' + f] = 1; });
                });
                var kept = {}; Object.keys(pz).forEach(function (k) { if (valid[k]) kept[k] = pz[k]; });
                map['prime-zuma'] = kept;
                return map;
            },
        },
    ];
    var MIGR_MARK = PREFIX + ':migratedAt';   // local (live-keys) watermark
    function migrationsLatestAt() { return MIGRATIONS.reduce(function (m, x) { return Math.max(m, x.at || 0); }, 0); }
    function migrateScoresMap(map, from) {   // apply every migration newer than `from`; returns { map, to }
        from = from || 0;
        MIGRATIONS.forEach(function (mg) { if ((mg.at || 0) > from && typeof mg.scores === 'function') map = mg.scores(map) || map; });
        return { map: map, to: Math.max(from, migrationsLatestAt()) };
    }
    // deleteField sentinels for score keys the migration dropped (so a merge-save actually removes them in the cloud)
    function scoreDeletes(before, after) {
        var N = net(), delFn = N && N.field && N.field.delete; if (!delFn) return null;
        var out = {};
        Object.keys(before || {}).forEach(function (g) {
            var b = before[g] || {}, a = (after && after[g]) || {}, gone = {};
            Object.keys(b).forEach(function (k) { if (!(k in a)) gone[k] = delFn(); });
            if (Object.keys(gone).length) out[g] = gone;
        });
        return Object.keys(out).length ? out : null;
    }
    // Run pending migrations on the LIVE localStorage high scores (guest, or an account's working copy). Idempotent + watermarked.
    function migrateLiveScores() {
        var from = 0; try { from = +(localStorage.getItem(MIGR_MARK) || 0) || 0; } catch (e) { from = 0; }
        if (from >= migrationsLatestAt()) return;
        var d = DESCRIPTORS[0], res = migrateScoresMap(d.read(), from);
        d.write(res.map);
        try { localStorage.setItem(MIGR_MARK, String(res.to)); } catch (e) { /* ignore */ }
    }

    // --- bucket (drawer) management -------------------------------------------
    function snapshot() { var o = []; DESCRIPTORS.forEach(function (d) { o.push(d.read()); }); return o; }
    function restore(arr) { DESCRIPTORS.forEach(function (d, i) { var rec = arr && arr[i]; if (rec && !isEmpty(rec)) d.write(rec); else d.clear(); }); }
    function bucketGet(scope) { return rd(BUCKET + scope, null); }
    function bucketSet(scope, arr) { wr(BUCKET + scope, arr); }
    function bucketHasRecords(scope) { var a = bucketGet(scope); return !!(a && a.some(function (r) { return !isEmpty(r); })); }

    // --- state + callbacks -----------------------------------------------------
    var appliedCbs = [], claimCbs = [], claimOffered = false, pendingOffer = null;
    var profileCbs = [], lastProfile = null;
    var profileEpoch = 0, profileRevision = 0, profileEdits = {};
    function fireProfile(uid, profile) {
        var current = account();
        if (!current || current.uid !== uid) return;
        lastProfile = { uid: uid, data: profile };
        profileCbs.forEach(function (fn) { try { fn(profile, uid); } catch (e) { /* ignore */ } });
    }
    function fireApplied() { appliedCbs.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } }); }
    function net() { var N = window.ArcadeNet; return (N && N.ok && N.profile) ? N : null; }
    function account() { var N = net(); if (!N) return null; var u = N.currentUser(); return (u && !u.anon) ? u : null; }
    function liveScope() { return localStorage.getItem(ACTIVE_KEY) || 'guest'; }
    function setLiveScope(s) { try { localStorage.setItem(ACTIVE_KEY, s); } catch (e) { /* ignore */ } }

    // Pull the signed-in profile, merge both ways into the live keys, push anything
    // local holds better. Resolves with the profile doc (or null). No-op for guests.
    function pullMergePush() {
        var acct = account(); if (!acct) return Promise.resolve(null);
        var N = net(), epoch = profileEpoch, revision = profileRevision;
        return N.profile.get(acct.uid).then(function (prof) {
            prof = prof || {};
            var cloudMark = +(prof.recordsMigratedAt || 0) || 0, runMigr = cloudMark < migrationsLatestAt();
            var games = {}, changed = false, dels = null;
            DESCRIPTORS.forEach(function (d, i) {
                var local = d.read(), cloud = d.fromProfile(prof);
                var merged = d.merge(local, cloud);
                if (i === 0 && runMigr) {   // generic high scores: run any pending record migrations on the merged map
                    var before = {}; Object.keys(merged).forEach(function (g) { before[g] = Object.assign({}, merged[g]); });
                    merged = migrateScoresMap(merged, cloudMark).map;
                    dels = scoreDeletes(before, merged);   // keys the migration removed → explicit cloud field deletions
                }
                d.write(merged);
                if (JSON.stringify(merged) !== JSON.stringify(local)) changed = true;
                // Each descriptor contributes a { games: { <id>: {...} } } fragment; the
                // ids are disjoint across descriptors, so a shallow per-id assign is enough.
                var frag = d.toProfile(merged).games || {};
                Object.keys(frag).forEach(function (id) { games[id] = Object.assign(games[id] || {}, frag[id]); });
            });
            if (dels) Object.keys(dels).forEach(function (g) { games[g] = games[g] || {}; games[g].bests = Object.assign(games[g].bests || {}, dels[g]); });   // fold in deleteField() sentinels so the merge-save drops the removed cloud keys
            var save = { games: games, name: acct.name || null };
            if (runMigr) save.recordsMigratedAt = migrationsLatestAt();
            if (Object.keys(games).length || runMigr) { try { N.profile.save(acct.uid, save); } catch (e) { /* ignore */ } }
            if (changed) fireApplied();
            if (epoch === profileEpoch) {
                // A read started before an acknowledged settings save must not
                // replace the newer metadata with its older response.
                var metadata = Object.assign({}, prof);
                Object.keys(profileEdits).forEach(function (key) { if (profileEdits[key].revision > revision) metadata[key] = profileEdits[key].value; });
                fireProfile(acct.uid, metadata);
            }
            return prof;
        }).catch(function () { return null; });
    }
    function sync() { return pullMergePush().then(function (prof) { return !!prof; }); }
    function rememberMetadata(acct, epoch, save) {
        if (epoch !== profileEpoch || !account() || account().uid !== acct.uid) return false;
        profileRevision++;
        Object.keys(save).forEach(function (key) { profileEdits[key] = { revision: profileRevision, value: save[key] }; });
        fireProfile(acct.uid, Object.assign({}, lastProfile && lastProfile.uid === acct.uid ? lastProfile.data : {}, save));
        return true;
    }
    function saveAnnouncementAcknowledgement(expectedUid, operation) {
        var acct = account(), N = net(), epoch = profileEpoch;
        if (!acct || acct.uid !== expectedUid || !N.announcements) return Promise.reject(new Error('profile/account-changed'));
        return Promise.resolve(operation(N.announcements)).then(function (result) {
            if (!result.saved || epoch !== profileEpoch || !account() || account().uid !== acct.uid) return false;
            var reads = Object.assign({}, lastProfile && lastProfile.uid === acct.uid ? lastProfile.data.announcementReads || {} : {});
            Object.keys(result.reads).forEach(function (key) {
                if (Number.isInteger(result.reads[key]) && (!Number.isInteger(reads[key]) || result.reads[key] > reads[key])) reads[key] = result.reads[key];
            });
            return rememberMetadata(acct, epoch, { announcementReads: reads });
        });
    }
    function saveAnnouncementRead(id, revision, expectedUid) {
        return saveAnnouncementAcknowledgement(expectedUid, function (announcements) { return announcements.markRead(id, revision); });
    }
    function saveAllAnnouncementReads(versions, expectedUid) {
        return saveAnnouncementAcknowledgement(expectedUid, function (announcements) { return announcements.markAllRead(versions); });
    }
    function saveProfileFields(patch, expectedUid) {
        var acct = account(), N = net(), epoch = profileEpoch;
        if (!acct || expectedUid && acct.uid !== expectedUid) return Promise.reject(new Error('profile/account-changed'));
        // Keep score payloads under the record engine; this API saves flat metadata.
        var allowed = ['birthday'];
        if (!patch || Object.keys(patch).some(function (key) { return allowed.indexOf(key) === -1; })) return Promise.reject(new Error('profile/invalid-fields'));
        var save = Object.assign({}, patch);
        if (!N.profile.saveFields) return Promise.reject(new Error('profile/unavailable'));
        return Promise.resolve(N.profile.saveFields(acct.uid, save)).then(function () {
            return rememberMetadata(acct, epoch, save);
        });
    }

    // Which of the guest drawer's games does the signed-in account NOT have yet? Those
    // are the only ones worth claiming ("has a game" = any record for it, so a game is
    // claimable into a given account at most once). Returns [{ i, key, display }].
    function computeOffers() {
        var guest = bucketGet('guest'); if (!guest) return [];
        var offers = [];
        DESCRIPTORS.forEach(function (d, i) {
            var acctKeys = {}; d.listGames(d.read()).forEach(function (x) { acctKeys[x.key] = 1; });
            d.listGames(guest[i] || {}).forEach(function (x) { if (!acctKeys[x.key]) offers.push({ i: i, key: x.key, display: x.display }); });
        });
        return offers;
    }

    // Claim = MOVE the offered games from the guest drawer into the account: merge them
    // into the live keys, push, then drop just those games from the drawer. Games the
    // account already had are left in the drawer untouched.
    function doClaim(offers) {
        if (!account() || !offers || !offers.length) return;
        var guest = bucketGet('guest') || [];
        var byDesc = {}; offers.forEach(function (o) { (byDesc[o.i] = byDesc[o.i] || {})[o.key] = 1; });
        DESCRIPTORS.forEach(function (d, i) {
            var keys = byDesc[i]; if (!keys) return;
            var moved = d.subset(guest[i] || {}, keys);
            if (isEmpty(moved)) return;
            d.write(d.merge(d.read(), moved));
            guest[i] = d.without(guest[i] || {}, keys);
        });
        bucketSet('guest', guest);
        pendingOffer = null;
        fireApplied();
        sync();
    }

    // Offer the per-game claim at sign-in, for games the account lacks but the device
    // has. Remembered as `pendingOffer` so a listener that registers slightly later
    // (the launcher) still receives it.
    function maybeOfferClaim(prof) {
        if (claimOffered || !prof) return;          // prof null = offline; try again next sign-in
        var offers = computeOffers(); if (!offers.length) return;
        claimOffered = true;
        pendingOffer = { games: offers.map(function (o) { return o.display; }), claim: function () { doClaim(offers); } };
        claimCbs.forEach(function (fn) { try { fn(pendingOffer); } catch (e) { /* ignore */ } });
    }

    function onAuth(u) {
        var newScope = (u && !u.anon) ? u.uid : 'guest';
        var cur = liveScope();
        if (newScope === cur) {                     // same identity still live (reload / navigation)
            if (newScope !== 'guest') pullMergePush();   // reconcile with the cloud; do NOT re-offer the claim
            return;
        }
        // --- identity transition (an actual sign-in or sign-out) ---
        lastProfile = null;
        profileEpoch++; profileRevision = 0; profileEdits = {};
        claimOffered = false; pendingOffer = null;
        if (cur === 'guest') bucketSet('guest', snapshot());   // keep the guest's records for later / for the claim
        if (newScope === 'guest') {                 // signing out → bring the guest drawer back
            restore(bucketGet('guest'));
            setLiveScope('guest');
            fireApplied();
            return;
        }
        restore(null);                              // signing in → clear live so guest scores can't leak in
        setLiveScope(newScope);
        fireApplied();
        pullMergePush().then(maybeOfferClaim);      // fill from the cloud, then maybe offer the per-game claim
    }

    function start() {
        var N = window.ArcadeNet;
        if (N && N.ok && N.onAuth) N.onAuth(onAuth);
    }
    migrateLiveScores();   // prune the LIVE local high scores to the current record structure on every load (idempotent, watermarked); the cloud copy is handled in pullMergePush
    if (window.ArcadeNet) start();
    else window.addEventListener('arcade-net-ready', start, { once: true });

    window.CloudSync = {
        // games: repaint when the live records change
        onApplied: function (fn) { if (typeof fn === 'function') appliedCbs.push(fn); },
        // Account metadata from the existing profile read; never adds a read/listener.
        onProfile: function (fn) {
            if (typeof fn !== 'function') return;
            profileCbs.push(fn);
            var current = account();
            if (lastProfile && current && current.uid === lastProfile.uid) {
                try { fn(lastProfile.data, lastProfile.uid); } catch (e) { /* ignore */ }
            }
        },
        // games: call after writing a new local best so it reaches the cloud
        sync: sync,
        saveProfileFields: saveProfileFields,
        saveAnnouncementRead: saveAnnouncementRead,
        saveAllAnnouncementReads: saveAllAnnouncementReads,
        // launcher: receive the per-game claim offer, { games: [displayId], claim: fn }
        onClaimOffer: function (fn) { if (typeof fn !== 'function') return; claimCbs.push(fn); if (pendingOffer) { try { fn(pendingOffer); } catch (e) { /* ignore */ } } },
        hasGuestRecords: function () { return bucketHasRecords('guest'); },
    };
})();
