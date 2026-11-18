/* Real RTDB transactions/rules; loopback demo emulator only, with simulated client clocks. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createRealtimeCleanupClock } from '../js/net/rtdb-clock.mjs';
import { createRealtimeRoomStore } from '../js/net/rtdb-rooms.mjs';
import { createRoomService } from '../js/net/rooms.mjs';
const require = createRequire(new URL('../.cache/feedback-tests/package.json', import.meta.url));
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const sdk = require('firebase/database');
const address = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!address || !/^(?:127\.0\.0\.1|localhost):\d+$/.test(address)) throw Error('Only a loopback RTDB demo emulator is allowed');
const [host, port] = address.split(':');
const env = await initializeTestEnvironment({ projectId: 'demo-gamebox', database: {
    host, port: Number(port), rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'),
} });
const actor = env.authenticatedContext('cleanup-host').database();
const peer = env.authenticatedContext('cleanup-peer').database();
const clocks = []; let serial = 0;
const roomPath = (code, group = 'memory_rooms') => 'rooms/' + group + '/R-' + code;
async function seed(code, age, group = 'memory_rooms') {
    await actor.ref(roomPath(code, group)).set({ code: 'R-' + code, status: 'waiting', hostUid: 'cleanup-host',
        players: { 'cleanup-host': { uid: 'cleanup-host' } }, ready: {}, presence: { 'cleanup-host': 1 }, lastActionAt: Date.now() - age });
}
async function beat(code) { await peer.ref(roomPath(code)).update({ 'presence/cleanup-host': 2, lastActionAt: sdk.serverTimestamp() }); }
async function exists(code, group = 'memory_rooms') { return (await actor.ref(roomPath(code, group)).once('value')).exists(); }
function client(skew = 0, { holdCalibration = false } = {}) {
    const db = env.authenticatedContext('cleanup-client-' + (++serial)).database()._delegate;
    let wallJump = 0, throttle = 0, queries = 0, pendingOffset = null, deliver = null;
    let afterQuery = async () => {}, beforeTransaction = async () => {}, retryCount = 0, freshSeen = false;
    const clockSDK = { ...sdk, onValue: (target, cb, error) => {
        if (target.toString().split('?')[0].endsWith('/.info/serverTimeOffset')) {
            deliver = () => { if (pendingOffset) cb({ val: () => pendingOffset.val() - skew }); };
            return sdk.onValue(target, snap => { pendingOffset = snap; if (!holdCalibration) deliver(); }, error);
        }
        return sdk.onValue(target, cb, error);
    } };
    const clock = createRealtimeCleanupClock(clockSDK, db, { wallNow: () => Date.now() + skew + wallJump }); clocks.push(clock);
    const adapter = { ...sdk, get: async target => { queries++; const snapshot = await sdk.get(target); await afterQuery(); return snapshot; },
        runTransaction: async (target, updater, options) => {
            await beforeTransaction(target, updater);
            return sdk.runTransaction(target, raw => {
                if (raw) { retryCount++; if (raw.lastActionAt > Date.now() - 5000) freshSeen = true; }
                return updater(raw);
            }, options);
        } };
    const store = createRealtimeRoomStore(adapter, db, 'memory_rooms', { now: () => Date.now() + skew + wallJump,
        cleanupClock: { read: clock.read, waitUntilReady: () => clock.waitUntilReady(holdCalibration ? 30 : 2000) },
        monotonicNow: () => throttle, getPlayerId: () => 'cleanup-host', presenceField: 'presence' });
    return { store, clock, ready: () => clock.waitUntilReady(3000), queries: () => queries,
        jump: ms => { wallJump += ms; }, advanceCooldown: () => { throttle += 60000; }, release: () => { holdCalibration = false; deliver(); },
        onQuery: fn => { afterQuery = fn; }, onTransaction: fn => { beforeTransaction = fn; }, stats: () => ({ retryCount, freshSeen }),
    };
}
try {
    await env.clearDatabase();
    await seed('LIVE', 1000);
    const lateClock = createRealtimeCleanupClock(sdk, actor._delegate, { wallNow: () => Date.now() + 360000 }); clocks.push(lateClock);
    let lateQueries = 0;
    const lateStore = createRealtimeRoomStore({ ...sdk, get: async target => { lateQueries++; return sdk.get(target); } }, actor._delegate, 'memory_rooms', {
        cleanupClock: { read: lateClock.read, waitUntilReady: () => lateClock.waitUntilReady(30) },
    });
    assert.equal(await lateStore.cleanup(), 0); assert.equal(lateQueries, 0); assert(await exists('LIVE')); lateClock.dispose();
    console.log('PASS emulator: attaching after an existing connection cannot trust a cached offset after a wall-clock jump.');
    for (const skew of [360000, -360000, 86400000, -86400000]) {
        await seed('LIVE', 360000); await seed('OLD1', 360000);
        const c = client(skew); assert(await c.ready());
        const service = createRoomService({ store: c.store, getUser: () => ({ uid: 'cleanup-host' }) }, { presenceField: 'presence' });
        await service.heartbeat('LIVE', 0);
        assert.equal(await service.cleanup(), 1); assert(await exists('LIVE')); assert(!await exists('OLD1')); c.clock.dispose();
    }
    console.log('PASS emulator: actual serverTimestamp heartbeats survive ±6-minute/±24-hour simulated clocks; expired rooms are deleted.');
    await env.clearDatabase(); await seed('OLD1', 360000);
    const pending = client(0, { holdCalibration: true }); assert.equal(await pending.store.cleanup(), 0); assert.equal(pending.queries(), 0);
    pending.release(); assert(await pending.ready()); pending.advanceCooldown(); assert.equal(await pending.store.cleanup(), 1); pending.clock.dispose();
    await seed('LIVE', 1000); await seed('OLD1', 360000);
    const jumped = client(); assert(await jumped.ready()); jumped.jump(360000);
    assert.equal(await jumped.store.cleanup(), 0); assert.equal(jumped.queries(), 0); assert(await exists('LIVE')); assert(await exists('OLD1')); jumped.clock.dispose();
    console.log('PASS emulator: unavailable calibration and post-calibration wall jumps do not query/delete; later calibration can retry.');
    for (const boundary of ['query', 'proposal']) {
        await env.clearDatabase(); await seed('RACE', 360000);
        const c = client(); assert(await c.ready()); let done = false;
        if (boundary === 'query') c.onQuery(async () => { if (!done) { done = true; await beat('RACE'); } });
        else c.onTransaction(async (target, updater) => {
            if (done) return; done = true;
            // Capture a real stale-room deletion proposal, then commit another
            // client's heartbeat before the actual CAS transaction/retries proceed.
            const old = await sdk.get(target); assert.equal(updater(old.val()), null);
            await beat('RACE');
        });
        assert.equal(await c.store.cleanup(), 0); assert(await exists('RACE')); assert(c.stats().freshSeen);
        console.log('PASS emulator: heartbeat at ' + boundary + ' boundary cancels deletion; real transaction observations=' + c.stats().retryCount);
        c.clock.dispose();
    }
    await env.clearDatabase();
    for (let i = 0; i < 25; i++) await seed(String(i).padStart(4, '0'), 360000);
    await seed('SAFE', 360000, 'darts_rooms');
    const budget = client(); assert(await budget.ready());
    const a = budget.store.cleanup(), b = budget.store.cleanup(); assert.equal(a, b); assert.equal(await a, 20);
    assert.equal(await budget.store.cleanup(), 0); assert.equal(budget.queries(), 1);
    budget.advanceCooldown(); assert.equal(await budget.store.cleanup(), 5); assert.equal(budget.queries(), 2); assert(await exists('SAFE', 'darts_rooms'));
    budget.clock.dispose();
    console.log('PASS emulator: real concurrent cleanup, 60-second cooldown, 20-room batch and collection isolation. No production Firebase access or deployment.');
} finally { clocks.forEach(clock => clock.dispose()); await env.cleanup(); }
