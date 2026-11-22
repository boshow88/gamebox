'use strict';
const assert = require('node:assert/strict');
const Recovery = require('../../js/games/impressions/recovery.js');
const createRoom = require('../../js/games/impressions/room.js');
const Match = require('../../js/games/impressions/match.js');
const clone = value => structuredClone(value);
function storage() { const values = new Map(); return { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), values }; }
function locks() {
    const held = new Set();
    return { request: async (name, options, callback) => {
        if (held.has(name)) return callback(null);
        held.add(name); try { return await callback({ name }); } finally { held.delete(name); }
    } };
}
(async () => {
    let serial = 0; const random = () => (++serial) + '-2-3-4', lock = locks(), saved = storage();
    const make = (s = saved, l = lock) => Recovery.create({ storage: s, locks: l, random });
    let a = make(), first = await a.initialize('uid'); a.remember('ABCD');
    const copy = storage(); copy.setItem(Recovery.key, saved.getItem(Recovery.key));
    const duplicate = make(copy); const dup = await duplicate.initialize('uid');
    assert.notEqual(dup.sessionId, first.sessionId); assert.equal(dup.room, null); assert.equal(dup.reason, 'collision');
    a.stop(); await Promise.resolve(); a = make(); const reloaded = await a.initialize('uid');
    assert.equal(reloaded.sessionId, first.sessionId); assert.equal(reloaded.room, 'ABCD');
    const independent = make(storage()); assert.notEqual((await independent.initialize('uid')).sessionId, first.sessionId);
    a.clearRoom(); assert.equal(JSON.parse(saved.getItem(Recovery.key)).room, null); a.stop();
    const changed = make(); const changedId = await changed.initialize('other');
    assert.notEqual(changedId.sessionId, first.sessionId); assert.equal(changedId.reason, 'auth-changed');
    const noLocks = make(copy, null); const fallback = await noLocks.initialize('uid');
    assert.notEqual(fallback.sessionId, dup.sessionId); assert.equal(fallback.room, null);
    const unsupportedSaved = storage(); unsupportedSaved.setItem(Recovery.key, JSON.stringify({ version: 1, uid: 'uid', sessionId: first.sessionId, room: 'ABCD' }));
    const unsupported = make(unsupportedSaved, null); assert.equal((await unsupported.initialize('uid')).reason, 'unsupported'); unsupported.stop();
    const rejectedLocks = make(storage(), { request: () => Promise.reject(Error('locks unavailable')) });
    await assert.rejects(rejectedLocks.initialize('uid'), /controller lock/); rejectedLocks.stop();
    const blocked = Recovery.create({ locks: lock, random, storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
    assert.equal((await blocked.initialize('blocked')).persistent, false);
    for (const client of [duplicate, independent, changed, noLocks, blocked]) client.stop();
    assert.deepEqual(Object.keys(JSON.parse(saved.getItem(Recovery.key))).sort(), ['room', 'sessionId', 'uid', 'version']);
    console.log('PASS: reload identity, independent/duplicate tabs, UID binding, explicit leave metadata, unavailable storage/locks and minimal storage.');

    const modules = { ...await import('../../js/net/rooms.mjs'), ...await import('../../js/net/rtdb-rooms.mjs'), ...await import('../../js/net/rtdb-values.mjs') };
    const native = require('../helpers/rtdb-fixtures.js').impressionsRealtimeDatabase();
    let time = 100000, seed = 19;
    const makeClient = sid => {
        const sdk = native.clientSDK(), user = { uid: 'account', name: sid }, audio = { token: sid + '-new-audio-' + (++seed), confirmed: true, usable: true };
        const api = createRoom({ sessionId: sid, now: () => time, seedSource: () => ++seed, audioStatus: () => audio, net: { rooms: {
            presence: options => modules.createRoomPresence(options),
            create: options => {
                const store = modules.createRealtimeRoomStore(sdk, native.db, options.collection, { now: () => time, presenceField: options.presenceField, nativeDisconnect: options.nativeDisconnect, getPlayerId: () => user.uid + '_' + sid });
                return modules.createRoomService({ store, getUser: () => user, sessionId: sid, now: () => time, generateCode: () => 'ABCD' }, options);
            },
        } } });
        return { api, sdk, audio };
    };
    const flush = async task => { const result = await task; await native.flush(); return result; };
    let host = makeClient('host'), guest = makeClient('guest');
    await flush(host.api.create({ categoryWeights: { color: 0, quantity: 0, pitch: 2 }, maxRounds: 2 }, 'Host'));
    await flush(guest.api.join('ABCD')); await flush(host.api.addCpuPlayer()); await flush(guest.api.addCpuPlayer());
    for (const c of [host, guest]) await flush(c.api.acknowledgeAudio(true));
    await flush(guest.api.ready(true));
    const uid = guest.api.service.currentPlayer().uid, before = clone(host.api.current().data);
    const oldGuest = guest; guest.api.detach(); guest = makeClient('guest'); guest.audio.confirmed = false;
    await flush(guest.api.recover('ABCD'));
    const recovered = host.api.current().data;
    assert.deepEqual(recovered.participants, before.participants); assert.deepEqual(recovered.ready, before.ready);
    assert.equal(recovered.revision, before.revision); assert.equal(recovered.audioReady[uid], undefined);
    assert.equal(host.api.canStart(), false); assert.equal(guest.api.audioReadyFor(recovered, uid), false);
    assert.equal(oldGuest.sdk._client.disconnects.size, 0, 'Impressions never arms the racy shared -1 disconnect handler');
    const beat = recovered.presence[uid]; native.disconnect(oldGuest.sdk); await native.flush();
    assert.equal(host.api.current().data.presence[uid], beat, 'Late old disconnect cannot erase the new beat');
    guest.audio.confirmed = true; await flush(guest.api.acknowledgeAudio(true)); assert.equal(host.api.canStart(), true);
    await flush(host.api.start());
    let frozen = clone(host.api.current().data.game);
    const refresh = async c => { c.api.detach(); const next = makeClient(c === host ? 'host' : 'guest'); await flush(next.api.recover('ABCD')); return next; };
    host = await refresh(host); assert.deepEqual(host.api.current().data.game, frozen);
    time = frozen.timeline.answerAt; await flush(host.api.tick());
    const token = Match.token(frozen); await flush(guest.api.submit(frozen.question.target, token, 'accepted'));
    const receipt = clone(guest.api.current().data.game.submissions[guest.api.playerId()]); guest = await refresh(guest);
    assert.deepEqual(guest.api.current().data.game.submissions[guest.api.playerId()], receipt);
    for (let n = 0; n < 6; n++) { time += 2000; await flush(Promise.all([host.api.tick(), guest.api.tick()])); }
    const cpuReceipts = clone(guest.api.current().data.game.submissions); guest = await refresh(guest); await flush(guest.api.tick());
    for (const [id, value] of Object.entries(cpuReceipts)) assert.deepEqual(guest.api.current().data.game.submissions[id], value);
    time = frozen.timeline.deadline; await flush(Promise.all([host.api.tick(), guest.api.tick()]));
    const settled = clone(host.api.current().data.game); assert.equal(settled.settledRound, 1);
    host = await refresh(host); await flush(host.api.tick()); assert.deepEqual(host.api.current().data.game, settled);
    const endedUid = guest.api.service.currentPlayer().uid;
    await flush(guest.api.leave()); assert(!host.api.current().data.players[endedUid]);
    host = await refresh(host); assert.equal(Object.keys(host.api.current().data.players).length, 1);
    assert.equal(host.api.current().data.seatOrder.length, 2, 'A lone human recovers its remaining CPU');
    await assert.rejects(guest.api.recover('ABCD'), { code: 'room/membership-ended' });
    await flush(host.api.leave()); await assert.rejects(host.api.recover('ABCD'), { code: 'room/not-found' });
    console.log('PASS: transactional membership-only recovery, Ready/revision persistence, fresh audio, stale onDisconnect race, frozen timeline/receipts, CPU resumption and once-only settlement; removed seats/rooms stay removed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
