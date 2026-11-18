/* Tab-scoped Impressions location/identity. No game state, credentials or answer drafts. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ImpressionsRecovery = factory();
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var KEY = 'gamebox:memory:recovery:v1';
    function create(options) {
        options = options || {};
        var storage = options.storage, locks = options.locks, random = options.random || function () {
            return globalThis.crypto.getRandomValues(new Uint32Array(4)).join('-');
        };
        var state = null, release = null, stopped = false, persistent = true;
        function read() {
            try {
                var value = JSON.parse(storage.getItem(KEY));
                return value && value.version === 1 && typeof value.uid === 'string' && value.uid.length <= 128
                    && /^\d+(?:-\d+){3}$/.test(value.sessionId) && value.sessionId.length <= 60
                    && (value.room === null || /^[A-Z0-9]{4}$/.test(value.room)) ? value : null;
            } catch (_) { return null; }
        }
        function write() {
            try { storage.setItem(KEY, JSON.stringify(state)); }
            catch (_) { persistent = false; }
        }
        function clearRoom() { if (state) { state.room = null; write(); } }
        async function claim(uid, sessionId) {
            return new Promise(function (resolve) {
                locks.request('gamebox:memory:controller:' + uid + ':' + sessionId, { ifAvailable: true }, function (lock) {
                    if (!lock || stopped) { resolve(false); return; }
                    return new Promise(function (done) { release = done; resolve(true); });
                }).catch(function () { resolve(false); });
            });
        }
        async function initialize(uid) {
            if (!uid || stopped) throw new Error('Impressions recovery needs a restored auth identity');
            var previous = read(), reason = null;
            var saved = previous && previous.uid === uid ? previous : null;
            if (previous && !saved) reason = 'auth-changed';
            var sessionId = saved ? saved.sessionId : random(), room = saved ? saved.room : null;
            // Web Locks are released by the browser when the old document disappears.
            // Storage copied into a duplicate tab grants no right to use its live controller.
            if (locks && typeof locks.request === 'function') {
                var acquired = await claim(uid, sessionId);
                if (!acquired && !stopped) {
                    await new Promise(function (resolve) { setTimeout(resolve, 180); });
                    acquired = await claim(uid, sessionId);
                }
                if (!acquired) {
                    if (stopped) throw new Error('Impressions recovery stopped');
                    reason = room ? 'collision' : reason;
                    sessionId = random(); room = null;
                    if (!await claim(uid, sessionId)) throw new Error('Unable to acquire Impressions controller lock');
                }
            } else {
                // Without reliable arbitration never reuse an ID copied from another page.
                if (room) reason = 'unsupported';
                sessionId = random(); room = null;
            }
            if (stopped) { if (release) release(); throw new Error('Impressions recovery stopped'); }
            state = { version: 1, uid: uid, sessionId: sessionId, room: room }; write();
            return { sessionId: sessionId, room: room, reason: reason, persistent: persistent };
        }
        return {
            initialize: initialize,
            hasRoom: function () { return !!(read() || {}).room; },
            remember: function (room) { if (state && /^[A-Z0-9]{4}$/.test(room)) { state.room = room; write(); } },
            clearRoom: clearRoom,
            stop: function () { stopped = true; if (release) { release(); release = null; } },
        };
    }
    return { key: KEY, create: create };
});
