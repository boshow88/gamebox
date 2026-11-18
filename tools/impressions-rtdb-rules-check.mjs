/* Actual RTDB rules evaluation against a demo emulator only. Never a production database. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../.cache/feedback-tests/package.json', import.meta.url));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Use emulators:exec --project demo-gamebox --only database');
const [host, port] = process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(':');
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Only a loopback demo emulator is allowed.');
const env = await initializeTestEnvironment({ projectId: 'demo-gamebox', database: {
    host, port: Number(port), rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'),
} });
const signed = env.authenticatedContext('player-a').database();
const guest = env.authenticatedContext('guest', { firebase: { sign_in_provider: 'anonymous' } }).database();
const other = env.authenticatedContext('player-b').database();
const unauth = env.unauthenticatedContext().database();
const room = overrides => ({ code: 'R-ABCD', status: 'waiting', hostUid: 'player-a_tab',
    players: { player_a_tab: { name: 'A' } }, lastActionAt: 1000, ...overrides });
try {
    await env.clearDatabase();
    for (const group of ['beam_rooms', 'duel_rooms', 'darts_rooms', 'trash_toss_rooms', 'memory_rooms']) {
        const path = 'rooms/' + group + '/R-ABCD';
        await assertSucceeds(signed.ref(path).set(room()));
        await assertSucceeds(guest.ref(path).once('value'));
        await assertSucceeds(other.ref(path).update({ lastActionAt: 2000 }));
        await assertFails(unauth.ref(path).once('value'));
        await assertFails(unauth.ref(path).update({ status: 'playing' }));
    }
    const target = signed.ref('rooms/memory_rooms/R-ABCD');
    for (const patch of [{ code: 'R-WRNG' }, { lastActionAt: 'now' }, { hostUid: 1 }, { status: 3 }, { players: null }])
        await assertFails(target.set(room(patch)));
    await assertFails(signed.ref('rooms/memory_rooms/ABCD').set(room({ code: 'ABCD' })));
    await assertFails(signed.ref('rooms/memory_rooms/R-TOOLONG').set(room({ code: 'R-TOOLONG' })));
    await assertSucceeds(guest.ref('rooms/memory_rooms/R-GUES').set(room({ code: 'R-GUES', hostUid: 'guest_tab' })));
    await assertFails(guest.ref('rooms/unknown_rooms/R-ABCD').set(room()));
    await assertFails(signed.ref('rooms/unknown_rooms').once('value'));
    await assertFails(signed.ref('unrelated/private').set({ value: true }));
    await assertFails(signed.ref().once('value'));
    await assertSucceeds(target.remove());
    assert.equal((await signed.ref('rooms/memory_rooms').once('value')).hasChild('R-GUES'), true);
    console.log('PASS: actual demo RTDB rules: five authorized room groups (including anonymous guests), unauthenticated/unknown-root denial, code and metadata validation, unchanged honor-system member writes. No production rules were deployed.');
} finally { await env.cleanup(); }
