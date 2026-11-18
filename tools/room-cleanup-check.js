/* Shared cleanup clock and transaction races, using the actual RTDB adapter. */
'use strict';
const assert = require('node:assert/strict');
const { memoryRealtimeDatabase } = require('./helpers/rtdb-fixtures.js');
(async () => {
    const { createRealtimeCleanupClock } = await import('../js/net/rtdb-clock.mjs');
    const { createRealtimeRoomStore } = await import('../js/net/rtdb-rooms.mjs');
    const { encodeRoomValue } = await import('../js/net/rtdb-values.mjs');
    function fixture(skew = 0) {
        const base = Date.now(), native = memoryRealtimeDatabase(), sdk = native.clientSDK(), callbacks = new Map();
        let elapsed = 0, wallJump = 0, throttle = 0, afterQuery = () => {}, beforeTransaction = () => {};
        const clock = createRealtimeCleanupClock({ ...sdk, onValue: (target, cb) => {
            callbacks.set(target.path, cb); return () => callbacks.delete(target.path);
        } }, native.db, { wallNow: () => base + skew + elapsed + wallJump, monotonicNow: () => elapsed });
        const emit = (path, value) => callbacks.get('.info/' + path)({ val: () => value });
        function calibrate() { emit('connected', false); emit('serverTimeOffset', -skew - wallJump); emit('connected', true); }
        const adapterSDK = { ...sdk, get: async target => {
            const result = await sdk.get(target); if (target.constraints) await afterQuery(); return result;
        }, runTransaction: async (...args) => { await beforeTransaction(); return sdk.runTransaction(...args); } };
        const store = createRealtimeRoomStore(adapterSDK, native.db, 'memory_rooms', {
            now: () => base + skew + elapsed + wallJump,
            monotonicNow: () => throttle,
            cleanupClock: { read: clock.read, waitUntilReady: () => clock.waitUntilReady(1) },
        });
        function put(code, lastActionAt, group = 'memory_rooms') {
            native.put('rooms/' + group + '/R-' + code, encodeRoomValue({ code: 'R-' + code, status: 'waiting',
                hostUid: 'host', players: { host: { uid: 'host' } }, presence: { host: 9 }, lastActionAt }));
        }
        return { base, native, store, clock, emit, calibrate, put,
            has: (code, group = 'memory_rooms') => !!native.raw('rooms/' + group + '/R-' + code),
            advance: ms => { elapsed += ms; throttle += ms; },
            jump: ms => { wallJump += ms; },
            onQuery: fn => { afterQuery = fn; }, onTransaction: fn => { beforeTransaction = fn; },
        };
    }
    for (const skew of [0, 360000, -360000, 86400000, -86400000]) {
        const f = fixture(skew); f.calibrate();
        f.put('LIVE', f.base - 2000); f.put('OLD1', f.base - 302000); f.put('EDGE', f.base - 300000);
        f.put('FUTR', f.base + 1000); f.put('OLD1', f.base - 302000, 'darts_rooms');
        assert.equal(await f.store.cleanup(), 1);
        assert(f.has('LIVE') && f.has('EDGE') && f.has('FUTR') && f.has('OLD1', 'darts_rooms'));
        assert(!f.has('OLD1')); f.clock.dispose();
    }
    console.log('PASS: ±6-minute/±24-hour skew, calibrated time, conservative five-minute boundary, fresh/future timestamps and collection isolation.');
    const cached = fixture(360000); cached.put('LIVE', cached.base);
    cached.emit('serverTimeOffset', 0); cached.emit('connected', true);
    assert.equal(await cached.store.cleanup(), 0); assert.equal(cached.native.usage.queries, 0); assert(cached.has('LIVE')); cached.clock.dispose();
    for (const mode of ['unknown','null','nonfinite','huge','offline','jump-forward','jump-backward']) {
        const f = fixture(); f.put('OLD1', f.base - 302000);
        if (mode !== 'unknown') f.calibrate();
        if (mode === 'null') f.emit('serverTimeOffset', null);
        if (mode === 'nonfinite') f.emit('serverTimeOffset', NaN);
        if (mode === 'huge') f.emit('serverTimeOffset', 1e300);
        if (mode === 'offline') f.emit('connected', false);
        if (mode.startsWith('jump-')) {
            f.jump(mode === 'jump-forward' ? 360000 : -360000); assert.equal(f.clock.read(), null);
            f.emit('connected', true); f.emit('serverTimeOffset', 0); // duplicate cached info must not revalidate
        }
        assert.equal(await f.store.cleanup(), 0, mode); assert.equal(f.native.usage.queries, 0, mode); assert(f.has('OLD1'));
        f.clock.dispose();
    }
    const pending = fixture(); pending.put('OLD1', pending.base - 302000);
    const waiting = pending.store.cleanup(); pending.calibrate(); assert.equal(await waiting, 1); pending.clock.dispose();
    const reconnect = fixture(); reconnect.calibrate(); reconnect.jump(360000); assert.equal(reconnect.clock.read(), null);
    reconnect.emit('connected', false); reconnect.calibrate(); reconnect.put('LIVE', reconnect.base); reconnect.put('OLD1', reconnect.base - 302000);
    assert.equal(await reconnect.store.cleanup(), 1); assert(reconnect.has('LIVE')); reconnect.clock.dispose();
    console.log('PASS: pending/invalid calibration, disconnects and wall jumps fail closed; duplicate cached info cannot rearm a stale clock; fresh handshake recovers.');
    for (const boundary of ['query', 'transaction']) {
        const f = fixture(); f.calibrate(); f.put('RACE', f.base - 302000);
        let changed = false;
        const beat = () => { if (!changed) { changed = true; f.put('RACE', f.base); } };
        boundary === 'query' ? f.onQuery(beat) : f.onTransaction(beat);
        assert.equal(await f.store.cleanup(), 0); assert(f.has('RACE')); f.clock.dispose();
    }
    for (const mode of ['disconnect', 'recalibrate', 'jump']) {
        const f = fixture(); f.calibrate(); f.put('RACE', f.base - 302000);
        f.onQuery(() => {
            if (mode === 'disconnect') f.emit('connected', false);
            else if (mode === 'recalibrate') f.emit('serverTimeOffset', 1);
            else f.jump(360000);
        });
        assert.equal(await f.store.cleanup(), 0); assert(f.has('RACE')); f.clock.dispose();
    }
    const malformed = fixture(); malformed.calibrate();
    malformed.put('STRG', '0'); malformed.put('NEGA', -1);
    assert.equal(await malformed.store.cleanup(), 0); assert(malformed.has('STRG') && malformed.has('NEGA')); malformed.clock.dispose();
    const budget = fixture(); budget.calibrate();
    for (let i = 0; i < 25; i++) budget.put(String(i).padStart(4, '0'), budget.base - 302000);
    const tasks = [budget.store.cleanup(), budget.store.cleanup(), budget.store.cleanup()];
    assert.equal(tasks[0], tasks[1]); assert.equal(tasks[1], tasks[2]); await Promise.all(tasks);
    assert.equal(budget.native.usage.deletes, 20); assert.equal(budget.native.usage.queries, 1);
    budget.advance(59999); await budget.store.cleanup(); assert.equal(budget.native.usage.queries, 1);
    budget.advance(1); await budget.store.cleanup(); assert.equal(budget.native.usage.deletes, 25); assert.equal(budget.native.usage.queries, 2);
    budget.clock.dispose();
    console.log('PASS: new heartbeats/clock changes cancel deletion; malformed timestamps survive; 60-second monotonic cooldown, coalescing and 20-room batches retained.');
})().catch(error => { console.error(error); process.exitCode = 1; });
