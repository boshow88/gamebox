/*
 * CloudSync — one shared engine for per-account high-score sync (no build step).
 *
 * The problem it solves: local records live in localStorage keyed by DEVICE, so
 * without care they'd bridge accounts (play 10000 as guest → sign in A → A gets
 * 10000 → sign in B → B also gets 10000). CloudSync gives each identity its own
 * "drawer": guest, account A, account B each keep a separate copy of the device's
 * records; only the signed-in identity's drawer is "live" (what the games read),
 * and it mirrors to Firestore `profiles/{uid}` so it follows the player across
 * devices.
 *
 * Design — "swap the live drawer on auth change" (games keep reading the SAME
 * keys; this module swaps their contents):
 *   1. On auth change, snapshot the current live records under the identity that
 *      was active, load the incoming identity's snapshot into the live keys, then
 *      (for a real account) merge with the cloud and push anything local holds
 *      higher.
 *   2. Games register `CloudSync.onApplied(refresh)` to repaint, and call
 *      `CloudSync.sync()` after setting a new best so it reaches the cloud.
 *   3. Because this module also loads on the launcher, signing in there runs every
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
    var ACTIVE_KEY = PREFIX + ':activeScope';     // which identity the live keys currently hold
    var BUCKET = PREFIX + ':bucket:';             // per-identity snapshot of records

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
    // key. Cloud field: bests["<game>:<mode>"] (max).
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
            scoreGames().forEach(function (g) { var d = rd(PREFIX + ':scores:' + g, null); if (d && d.best && !isEmpty(d.best)) o[g] = d.best; });
            return o;
        },
        write: function (obj) {
            // union of games currently present and those in obj, so a restore can
            // both set and clear.
            var games = {}; scoreGames().forEach(function (g) { games[g] = 1; }); Object.keys(obj || {}).forEach(function (g) { games[g] = 1; });
            Object.keys(games).forEach(function (g) {
                var key = PREFIX + ':scores:' + g, d = rd(key, { best: {}, recent: [] }) || { best: {}, recent: [] };
                d.best = (obj && obj[g]) || {};
                wr(key, d);
            });
        },
        clear: function () { scoreGames().forEach(function (g) { var key = PREFIX + ':scores:' + g, d = rd(key, null); if (d) { d.best = {}; wr(key, d); } }); },
        merge: function (a, b) { var out = {}, g; for (g in (a || {})) out[g] = a[g]; for (g in (b || {})) out[g] = mergeMap(out[g], b[g], Math.max); return out; },
        toProfile: function (obj) { var bests = {}; Object.keys(obj || {}).forEach(function (g) { var m = obj[g]; Object.keys(m).forEach(function (mode) { bests[g + ':' + mode] = m[mode]; }); }); return { bests: bests }; },
        fromProfile: function (prof) { var o = {}, bests = (prof && prof.bests) || {}; Object.keys(bests).forEach(function (key) { var i = key.lastIndexOf(':'); if (i < 0) return; var g = key.slice(0, i), mode = key.slice(i + 1); (o[g] = o[g] || {})[mode] = bests[key]; }); return o; },
    });

    // (2) Beam — best finishing place per difficulty notch (lower is better).
    // Local: arcadeGames:beam:solo:n<notch> = { played, wins, best }. Cloud: beam["<notch>"] = best (min).
    function beamKey(n) { return PREFIX + ':beam:solo:n' + n; }
    DESCRIPTORS.push({
        read: function () { var o = {}; for (var n = 0; n < 32; n++) { var st = rd(beamKey(n), null); if (st && st.best) o[n] = st; } return o; },
        write: function (obj) { for (var n = 0; n < 32; n++) { var k = beamKey(n); if (obj && obj[n]) wr(k, obj[n]); } },
        clear: function () { for (var n = 0; n < 32; n++) del(beamKey(n)); },
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
        toProfile: function (obj) { var beam = {}; Object.keys(obj || {}).forEach(function (n) { if (obj[n].best) beam[n] = obj[n].best; }); return { beam: beam }; },
        fromProfile: function (prof) { var o = {}, beam = (prof && prof.beam) || {}; Object.keys(beam).forEach(function (n) { o[n] = { best: beam[n] }; }); return o; },
    });

    // (3) Rune Stones — Sandbag bests (max) live in the prefs blob alongside device
    // settings, so we touch only the record fields. Cloud: runeStones["<level>"] = {total,spin}.
    var RK = PREFIX + ':prefs:rune-clash';
    DESCRIPTORS.push({
        read: function () { var p = rd(RK, {}) || {}; var o = {}; if (p.sandbox) o.sandbox = p.sandbox; if (p.bestRounds) o.bestRounds = p.bestRounds; if (p.bestSpin) o.bestSpin = p.bestSpin; return o; },
        write: function (obj) { var p = rd(RK, {}) || {}; p.sandbox = (obj && obj.sandbox) || {}; p.bestRounds = (obj && obj.bestRounds) || {}; p.bestSpin = (obj && obj.bestSpin) || {}; wr(RK, p); },
        clear: function () { var p = rd(RK, null); if (!p) return; delete p.sandbox; delete p.bestRounds; delete p.bestSpin; wr(RK, p); },
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
        toProfile: function (obj) { var rs = {}, sb = (obj && obj.sandbox) || {}; Object.keys(sb).forEach(function (lv) { var e = sb[lv], p = {}; if (e.bestTotal != null) p.total = e.bestTotal; if (e.bestSpin != null) p.spin = e.bestSpin; if (Object.keys(p).length) rs[lv] = p; }); return { runeStones: rs }; },
        fromProfile: function (prof) { var o = { sandbox: {} }, rs = (prof && prof.runeStones) || {}; Object.keys(rs).forEach(function (lv) { o.sandbox[lv] = { bestTotal: rs[lv].total, bestSpin: rs[lv].spin }; }); return o; },
    });

    // --- bucket (drawer) management -------------------------------------------
    function snapshot() { var o = []; DESCRIPTORS.forEach(function (d) { o.push(d.read()); }); return o; }
    function restore(arr) { DESCRIPTORS.forEach(function (d, i) { var rec = arr && arr[i]; if (rec && !isEmpty(rec)) d.write(rec); else d.clear(); }); }
    function bucketGet(scope) { return rd(BUCKET + scope, null); }
    function bucketSet(scope, arr) { wr(BUCKET + scope, arr); }
    function bucketHasRecords(scope) { var a = bucketGet(scope); return !!(a && a.some(function (r) { return !isEmpty(r); })); }

    // --- state + callbacks -----------------------------------------------------
    var appliedCbs = [], claimCbs = [];
    function fireApplied() { appliedCbs.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } }); }
    function net() { var N = window.ArcadeNet; return (N && N.ok && N.profile) ? N : null; }
    function account() { var N = net(); if (!N) return null; var u = N.currentUser(); return (u && !u.anon) ? u : null; }

    // Pull the signed-in profile, merge both ways into the live keys, push anything
    // local holds better. No-op for guests/offline.
    function sync() {
        var acct = account(); if (!acct) return Promise.resolve(false);
        var N = net();
        return N.profile.get(acct.uid).then(function (prof) {
            var pushFrag = {}, changed = false;
            DESCRIPTORS.forEach(function (d) {
                var local = d.read(), cloud = d.fromProfile(prof || {});
                var merged = d.merge(local, cloud);
                d.write(merged);
                if (JSON.stringify(merged) !== JSON.stringify(local)) changed = true;
                Object.assign(pushFrag, d.toProfile(merged));
            });
            if (Object.keys(pushFrag).length) { try { N.profile.save(acct.uid, Object.assign(pushFrag, { name: acct.name || null })); } catch (e) { /* ignore */ } }
            if (changed) fireApplied();
            return changed;
        }).catch(function () { return false; });
    }

    // Move the guest drawer's records into the current account (claim), then empty
    // the guest drawer so it can't seed another account later.
    function claim() {
        var acct = account(); if (!acct) return;
        var guest = bucketGet('guest'); if (!guest) return;
        DESCRIPTORS.forEach(function (d, i) { var g = guest[i]; if (g && !isEmpty(g)) d.write(d.merge(d.read(), g)); });
        del(BUCKET + 'guest');
        fireApplied();
        sync();
    }

    function onAuth(u) {
        var newScope = (u && !u.anon) ? u.uid : 'guest';
        var active = localStorage.getItem(ACTIVE_KEY) || 'guest';
        if (newScope !== active) {
            bucketSet(active, snapshot());           // stash the outgoing identity's records
            restore(bucketGet(newScope));            // swap in the incoming identity's records (or clear)
            try { localStorage.setItem(ACTIVE_KEY, newScope); } catch (e) { /* ignore */ }
            fireApplied();
        }
        if (newScope !== 'guest') {
            sync();
            if (bucketHasRecords('guest')) claimCbs.forEach(function (fn) { try { fn(claim); } catch (e) { /* ignore */ } });
        }
    }

    function start() {
        var N = window.ArcadeNet;
        if (N && N.ok && N.onAuth) N.onAuth(onAuth);
    }
    if (window.ArcadeNet) start();
    else window.addEventListener('arcade-net-ready', start, { once: true });

    window.CloudSync = {
        // games: repaint when the live records change
        onApplied: function (fn) { if (typeof fn === 'function') appliedCbs.push(fn); },
        // games: call after writing a new local best so it reaches the cloud
        sync: sync,
        // launcher: be offered the one-time "claim this device's guest scores" action
        onClaimOffer: function (fn) { if (typeof fn === 'function') claimCbs.push(fn); },
        hasGuestRecords: function () { return bucketHasRecords('guest'); },
        claim: claim,
    };
})();
