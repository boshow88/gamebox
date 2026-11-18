/** Opt-in server epoch estimate, advancing on a local monotonic clock between samples. */
export function createServerClock({ wallNow = Date.now, monotonicNow = () => performance.now() } = {}) {
    let offset = 0, sampled = false, anchor = wallNow(), mono = monotonicNow(), last = anchor;
    function refresh() { anchor = wallNow() + offset; mono = monotonicNow(); }
    function sample(value) {
        if (!Number.isFinite(value)) return false;
        offset = value; refresh();
        // The initial server sample may correct a large wall-clock skew before the clock is used.
        if (!sampled) last = anchor;
        sampled = true; return true;
    }
    return { sample, refresh, hasSample: () => sampled,
        now() { last = Math.max(last, anchor + Math.max(0, monotonicNow() - mono)); return last; } };
}

export function createRealtimeRoomClock(sdk, db, options = {}) {
    const clock = createServerClock(options), waiting = new Set();
    let connected = false, disposed = false;
    const ready = () => !disposed && connected && clock.hasSample();
    function notify() { if (ready()) for (const finish of [...waiting]) finish(); }
    const onError = options.onError || (() => {});
    const stops = [
        sdk.onValue(sdk.ref(db, '.info/serverTimeOffset'), snapshot => { clock.sample(snapshot.val()); notify(); }, onError),
        sdk.onValue(sdk.ref(db, '.info/connected'), snapshot => {
            connected = snapshot.val() === true;
            if (connected) clock.refresh();
            notify();
        }, onError),
    ];
    return { now: clock.now, refresh: clock.refresh, isReady: ready, isConnected: () => connected && !disposed,
        waitUntilReady(timeoutMs = 10000) {
            if (disposed) return Promise.reject(new Error('Server clock was disposed.'));
            if (ready()) return Promise.resolve();
            return new Promise((resolve, reject) => {
                let timer;
                function done(error) { clearTimeout(timer); waiting.delete(done); if (error) reject(error); else resolve(); }
                waiting.add(done);
                timer = setTimeout(() => { waiting.delete(done); reject(Object.assign(new Error('Server clock is unavailable.'), { code: 'room/clock-unavailable' })); }, timeoutMs);
            });
        },
        dispose() {
            disposed = true; connected = false; stops.forEach(stop => stop());
            for (const finish of [...waiting]) finish(new Error('Server clock was disposed.'));
        },
    };
}

/** Destructive maintenance uses its own conservative clock, never a game's clock.
 * Firebase samples serverTimeOffset before reporting a connected handshake. Anchor
 * that estimate to monotonic time, and reject wall-clock jumps rather than reusing
 * a now-stale offset. A disconnect/error requires a new connected calibration.
 */
export function createRealtimeCleanupClock(sdk, db, {
    wallNow = Date.now, monotonicNow = () => performance.now(),
} = {}) {
    const uncertaintyMs = 1000, waiting = new Set(), stops = [];
    let offset = null, connected = false, anchor = null, epoch = 0, disposed = false, sawDisconnect = false, calibratedConnection = false;
    function invalidate() { anchor = null; epoch++; }
    function read() {
        if (disposed || !connected || !calibratedConnection || !anchor) return null;
        const wall = wallNow(), mono = monotonicNow(), elapsed = mono - anchor.mono;
        if (!Number.isFinite(wall) || !Number.isFinite(elapsed) || elapsed < 0
            || Math.abs(wall - anchor.wall - elapsed) > uncertaintyMs) { invalidate(); return null; }
        // Use the lower end of the estimate; borderline rooms can wait another pass.
        return { time: anchor.server + elapsed - uncertaintyMs, epoch };
    }
    function calibrate() {
        invalidate();
        const wall = wallNow(), mono = monotonicNow(), server = wall + offset;
        if (connected && calibratedConnection && offset !== null && Number.isFinite(wall) && Number.isFinite(mono)
            && Number.isSafeInteger(Math.floor(server)) && server >= 0)
            anchor = { wall, mono, server };
        if (read()) for (const done of [...waiting]) done();
    }
    function failed() { offset = null; calibratedConnection = false; invalidate(); }
    try {
        stops.push(sdk.onValue(sdk.ref(db, '.info/serverTimeOffset'), snapshot => {
            const value = snapshot.val(), next = Number.isFinite(value) ? value : null;
            if (next !== offset) { offset = next; calibrate(); }
        }, failed));
        stops.push(sdk.onValue(sdk.ref(db, '.info/connected'), snapshot => {
            const next = snapshot.val() === true;
            if (!next) { sawDisconnect = true; calibratedConnection = false; }
            if (next !== connected) {
                connected = next;
                // A clock attached to an already-connected SDK may receive a cached
                // offset from before a wall jump. Only a witnessed handshake is safe.
                if (next) calibratedConnection = sawDisconnect;
                calibrate();
            }
        }, failed));
    } catch (_) { failed(); }
    return {
        read,
        waitUntilReady(timeoutMs = 1500) {
            if (read()) return Promise.resolve(true);
            if (disposed) return Promise.resolve(false);
            return new Promise(resolve => {
                let timer;
                function done() { clearTimeout(timer); waiting.delete(done); resolve(!!read()); }
                waiting.add(done); timer = setTimeout(done, timeoutMs);
            });
        },
        dispose() { disposed = true; invalidate(); stops.forEach(stop => stop()); for (const done of [...waiting]) done(); },
    };
}
