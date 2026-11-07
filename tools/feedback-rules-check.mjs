/* Run against the Firestore emulator only; see docs/DEBUG.md. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createFeedbackService } from '../js/net/feedback.mjs';
const require = createRequire(new URL('../.cache/feedback-tests/package.json', import.meta.url));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const sdk = require('firebase/firestore');
sdk.setLogLevel('silent'); // Expected permission-denied probes are asserted below.
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run with firebase emulators:exec --project demo-gamebox --only firestore');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId: 'demo-gamebox', firestore: {
    host, port: Number(port), rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
} });
const auth = (uid, email = uid + '@example.com', verified = true, provider = 'google.com') =>
    env.authenticatedContext(uid, { email, email_verified: verified, firebase: { sign_in_provider: provider } }).firestore();
const a = auth('player-a'), b = auth('player-b'), admin = auth('admin', 'admin@example.com');
const guest = env.authenticatedContext('guest', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const unauth = env.unauthenticatedContext().firestore();
const ref = (db, id) => sdk.doc(db, 'feedback', id);
const user = uid => ({ uid, name: uid, email: uid + '@example.com', anon: false });
const box = (db, u) => createFeedbackService({ sdk, db, getUser: () => u });
const mine = box(a, user('player-a')), other = box(b, user('player-b')), owner = box(admin, user('admin'));
const create = overrides => Object.assign({ uid: 'player-a', name: 'Player A', email: 'player-a@example.com', anon: false,
    text: 'An idea', lang: 'en', kind: 'idea', game: null, at: sdk.serverTimestamp(), resolved: false, replyVersion: 0, unread: false }, overrides);
try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
        const db = context.firestore();
        await sdk.setDoc(sdk.doc(db, 'config', 'admins'), { members: { 'admin@example.com': { name: 'Admin' } } });
        await sdk.setDoc(ref(db, 'old-a'), { uid: 'player-a', anon: false, text: 'Old submission', at: sdk.Timestamp.fromMillis(1000) });
        await sdk.setDoc(ref(db, 'private-b'), { uid: 'player-b', anon: false, text: 'Private B', at: sdk.Timestamp.fromMillis(2000) });
    });
    await assertSucceeds(sdk.getDoc(ref(a, 'old-a')));
    await assertFails(sdk.getDoc(ref(b, 'old-a')));
    await assertFails(sdk.getDoc(ref(guest, 'old-a')));
    await assertFails(sdk.getDoc(ref(unauth, 'old-a')));
    await assertFails(sdk.getDocs(sdk.query(sdk.collection(a, 'feedback'), sdk.limit(20))));
    await assertFails(sdk.getDocs(sdk.query(sdk.collection(a, 'feedback'), sdk.where('uid', '==', 'player-b'), sdk.limit(20))));
    await assertFails(sdk.getDocs(sdk.query(sdk.collection(a, 'feedback'), sdk.where('uid', '==', 'player-a'))));
    await assertFails(sdk.getDocs(sdk.query(sdk.collection(a, 'feedback'), sdk.where('uid', '==', 'player-a'), sdk.limit(101))));
    assert.equal((await mine.listMine()).items.length, 1);
    assert.equal((await other.listMine()).items[0].text, 'Private B');
    assert.equal((await owner.listAdmin()).items.length, 2);
    // Rules may be published before the website: the old submission/triage payloads still work.
    const oldPayload = create({ text: 'Submission from an already-open old page' });
    delete oldPayload.resolved; delete oldPayload.replyVersion; delete oldPayload.unread;
    await assertSucceeds(sdk.setDoc(ref(a, 'old-client'), oldPayload));
    await assertSucceeds(sdk.getDocs(sdk.query(sdk.collection(admin, 'feedback'), sdk.orderBy('at', 'desc'), sdk.limit(100))));
    await assertSucceeds(sdk.updateDoc(ref(admin, 'old-client'), { resolved: true }));
    assert.equal((await sdk.getDoc(ref(a, 'old-client'))).data().text, oldPayload.text);
    await assertSucceeds(sdk.deleteDoc(ref(admin, 'old-client')));
    await assertFails(sdk.getDocs(sdk.query(sdk.collection(auth('impostor', 'admin@example.com', false), 'feedback'), sdk.limit(20))));
    for (const patch of [
        { uid: 'player-b' }, { email: 'admin@example.com' }, { anon: true }, { at: sdk.Timestamp.fromMillis(0) },
        { resolved: true }, { replyVersion: 1 }, { unread: true }, { reply: { text: 'Forged admin' } },
        { text: '' }, { text: 'x'.repeat(2001) }, { extra: 'unapproved' }, { kind: 'bad-kind' }, { game: 'x'.repeat(81) },
    ]) await assertFails(sdk.setDoc(ref(a, 'forged'), create(patch)));
    await assertFails(sdk.setDoc(ref(unauth, 'forged'), create({})));
    await assertSucceeds(sdk.setDoc(ref(guest, 'guest-note'), create({ uid: 'guest', email: null, anon: true })));
    await assertFails(sdk.getDoc(ref(guest, 'guest-note')));
    const id = await mine.send({ text: '  My suggestion <script>alert(1)</script>  ', kind: 'idea', lang: 'zh', uid: 'player-b' });
    let data = (await sdk.getDoc(ref(a, id))).data();
    assert.equal(data.uid, 'player-a'); assert.equal(data.unread, false); assert.equal(data.replyVersion, 0);
    await assertFails(sdk.updateDoc(ref(a, id), { text: 'Changed original' }));
    await assertFails(sdk.updateDoc(ref(a, id), { uid: 'player-b' }));
    await assertFails(sdk.updateDoc(ref(a, id), { resolved: true }));
    await assertFails(sdk.updateDoc(ref(a, id), { unread: true }));
    await assertFails(sdk.deleteDoc(ref(a, id)));
    await assertFails(other.reply(id, 'Not an admin', 0));
    await assertFails(mine.reply(id, 'Not an admin', 0));
    const malformed = { reply: { text: 'Reply', by: 'admin', at: sdk.serverTimestamp() }, replyVersion: 1, unread: true };
    await assertFails(sdk.updateDoc(ref(admin, id), { ...malformed, replyVersion: 2 }));
    await assertFails(sdk.updateDoc(ref(admin, id), { ...malformed, unread: false }));
    await assertFails(sdk.updateDoc(ref(admin, id), { ...malformed, text: 'Overwrite original' }));
    await assertFails(sdk.updateDoc(ref(admin, id), { ...malformed, reply: { ...malformed.reply, by: 'player-a' } }));
    await assertFails(sdk.updateDoc(ref(admin, id), { ...malformed, reply: { ...malformed.reply, at: sdk.Timestamp.fromMillis(0) } }));
    await assertFails(sdk.updateDoc(ref(admin, id), { ...malformed, reply: { ...malformed.reply, text: 'x'.repeat(2001) } }));
    await owner.reply(id, 'First official reply', 0);
    assert.equal((await mine.listUnread()).items[0].reply.text, 'First official reply');
    await assert.rejects(owner.reply(id, 'Stale editor', 0), /feedback\/reply-changed/);
    await assertFails(sdk.updateDoc(ref(a, id), { reply: { text: 'Forged' } }));
    await assertFails(sdk.updateDoc(ref(b, id), { unread: false }));
    await owner.reply(id, 'Updated reply', 1);
    assert.equal(await mine.markRead(id, 1), false, 'Reading an old reply must not acknowledge a new one');
    assert.equal((await sdk.getDoc(ref(a, id))).data().unread, true);
    assert.equal(await mine.markRead(id, 2), true);
    assert.equal((await mine.listUnread()).items.length, 0);
    assert.equal((await sdk.getDoc(ref(a, id))).data().reply.text, 'Updated reply');
    await owner.setResolved(id, true);
    assert.equal((await sdk.getDoc(ref(a, id))).data().resolved, true);
    await owner.reply('old-a', 'Reply to a legacy submission', 0);
    assert.equal((await sdk.getDoc(ref(a, 'old-a'))).data().replyVersion, 1);
    await assertFails(sdk.updateDoc(ref(admin, id), { uid: 'player-b' }));
    await assertSucceeds(sdk.setDoc(sdk.doc(a, 'profiles', 'player-a'), { birthday: { month: 1, day: 22 } }));
    await assertFails(sdk.getDoc(sdk.doc(b, 'profiles', 'player-a')));
    await assertFails(sdk.setDoc(sdk.doc(a, 'beam_rooms', 'ABCD'), { text: 'retired' }));
    await owner.remove(id);
    assert.equal((await sdk.getDoc(ref(admin, id))).exists(), false);
    console.log('PASS: real Firestore rules isolate accounts, reject forged submissions/admin replies, preserve original notes, guard reply/read races, support legacy notes and retain profile/retired-room restrictions.');
} finally { await env.cleanup(); }
