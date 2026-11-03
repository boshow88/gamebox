/** node tools/birthday-check.js: dates and CloudSync integration; never uses Firebase. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function storage() {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key), key: i => [...values.keys()][i], get length() { return values.size; } };
}
const sandbox = { window: {}, Date, Set, String, localStorage: storage(), sessionStorage: storage() };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/birthday.js'), 'utf8'), sandbox);
const birthday = sandbox.window.GameBoxBirthday.isBirthday;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/birthday-cake.js'), 'utf8'), sandbox);
const hits = sandbox.window.GameBoxBirthdayCake.windHits;
assert(hits({ x: 112, y: 170 }, { x: 112, y: 170 }));
assert(hits({ x: 240, y: 123 }, { x: 240, y: 0 }));
assert(!hits({ x: 112, y: 170 }, { x: 240, y: 0 }), 'Aiming at the center must not extinguish a side candle');
assert(!hits({ x: 240, y: 123 }, { x: 240, y: 389 }), 'Wind aimed away from the cake must miss');
assert(!hits({ x: 240, y: 123 }, { x: 240, y: 367 }), 'Zero-length aim must not count as wind');
const step = sandbox.window.GameBoxBirthdayCake.stepCandle;
const onCake = sandbox.window.GameBoxBirthdayCake.footprintOnCake;
assert(!onCake({ x: 60, y: 170 }) && !onCake({ x: 420, y: 170 }), 'Outer candles cannot dodge beyond the elliptical top');
function candle(x = 112, y = 152) {
    return { home: { x, y }, point: { x, y }, life: 1, cooldown: .16, missedFor: 0, destination: null };
}
const fixed = candle();
for (let t = 0; t < 5; t += .01) step(fixed, fixed.home, .01, [fixed]);
assert(fixed.life > .95 && !hits(fixed.point, fixed.home), 'A candle must escape unattended wind and recover');
let chaseTime = 0, chaseAim = fixed.point;
for (; chaseTime < 3 && fixed.life > 0; chaseTime += .01) {
    if (Math.round(chaseTime * 100) % 8 === 0) chaseAim = fixed.point;
    step(fixed, chaseAim, .01, [fixed]);
}
assert.equal(fixed.life, 0, 'Following a candle with human-scale aim updates must beat its evasion');
assert(chaseTime < 3, 'Chasing must remain approachable');
const healing = candle(); healing.life = .3;
const damaged = healing.life;
step(healing, null, .01, [healing]);
assert(healing.life > damaged && healing.life < damaged + .005, 'Recovery begins immediately but gently on the first missed frame');
const early = healing.life;
for (let i = 0; i < 5; i++) step(healing, null, .01, [healing]);
const earlyGain = healing.life - early;
for (let i = 0; i < 30; i++) step(healing, null, .01, [healing]);
const later = healing.life;
for (let i = 0; i < 5; i++) step(healing, null, .01, [healing]);
assert(healing.life - later > earlyGain * 2, 'Recovery accelerates while the flame remains outside the breeze');
assert(healing.life < 1, 'Partial flames must not instantly recover to full strength');
for (let i = 0; i < 600; i++) step(healing, null, .01, [healing]);
assert.equal(healing.life, 1);
const fine = candle(), coarse = candle(); fine.life = coarse.life = .1;
for (let i = 0; i < 40; i++) step(fine, null, .01, [fine]);
for (let i = 0; i < 8; i++) step(coarse, null, .05, [coarse]);
assert(Math.abs(fine.life - coarse.life) < 1e-10, 'Recovery must be independent of frame rate');
for (let i = 0; i < 600; i++) step(fixed, null, .01, [fixed]);
assert.equal(fixed.life, 0, 'Fully extinguished candles must never reignite');
const group = [candle(), candle(176), candle(240), candle(304), candle(368)];
let target = 0;
for (let i = 0; i < 1200 && target < group.length; i++) {
    const aim = group[target].point;
    group.forEach(c => step(c, aim, .01, group));
    group.forEach(c => {
        assert(Math.abs(c.point.x - c.home.x) <= 52.001 && Math.abs(c.point.y - c.home.y) <= 12.001, 'Dodging stays on the cake');
        assert(onCake(c.point), 'Every intermediate foot position must remain inside the safe ellipse');
        for (const edge of [-5, 5]) {
            assert(((c.point.x + edge - 240) / 176) ** 2 + ((c.point.y + 70 - 223) / 47) ** 2 < 1, 'Both edges of the wax base stay on the visible cake top');
        }
    });
    while (target < group.length && group[target].life === 0) target++;
}
assert.equal(target, 5, 'The complete five-candle chase must be winnable');
for (const period of [.25, .5, 1, 2, 4]) {
    const sweep = [candle(), candle(176), candle(240), candle(304), candle(368)];
    for (let i = 0; i < 6000; i++) {
        const angle = Math.sin(i * .01 / period * Math.PI * 2) * .8;
        const aim = { x: 240 + Math.sin(angle) * 310, y: 367 - Math.cos(angle) * 310 };
        sweep.forEach(c => step(c, aim, .01, sweep));
    }
    assert(sweep.some(c => c.life > 0), 'Repeated broad sweeping must not clear the cake at period ' + period);
}
const today = new Date(2026, 10, 3, 12);
const api = sandbox.window.GameBoxBirthday;
assert.equal(api.midnightDelay(new Date(2026, 10, 3, 23, 59, 59, 500)), 550);
assert.equal(api.hasEntered('account-a', today), false);
assert.equal(api.markEntered('account-a', today), true);
assert.equal(api.hasEntered('account-a', today), true);
assert.equal(api.hasEntered('account-b', today), false, 'Daily entry flags are per account');
assert.equal(api.hasEntered('account-a', new Date(2027, 10, 3)), false, 'Next birthday permits a fresh automatic entry');
assert.equal(api.hasCompleted('account-a', today), false, 'Entering alone must not count as completion');
assert.equal(api.markCompleted('account-a', today), true);
assert.equal(api.hasCompleted('account-a', today), true);
assert.equal(api.hasCompleted('account-b', today), false, 'Completion is per account');
assert.equal(api.hasCompleted('account-a', new Date(2026, 10, 4)), false, 'Completion expires with the local day');
assert.equal(api.hasCompleted('account-a', new Date(2027, 10, 3)), false, 'Next birthday starts with first-play wording');
assert(birthday('2000-11-03', today));
assert(!birthday('2000-11-03', new Date(2026, 10, 2, 23, 59)));
assert(!birthday('2000-11-03', new Date(2026, 10, 4, 0, 1)));
for (const value of [undefined, null, 20001103, '', '2000/11/3', '2000-13-03', '2000-02-30', '1900-02-29', '2027-11-03', '<script>']) assert(!birthday(value, today));
assert(birthday('2000-02-29', new Date(2028, 1, 29, 12)));
assert(!birthday('2000-02-29', new Date(2027, 1, 28, 12)));

(async () => {
    let user = { uid: 'birthday-player', anon: false, name: 'Player' }, auth, reads = 0;
    const waiters = [], saves = [];
    const context = { localStorage: storage(), console, Promise, Date, JSON, Object, window: {
        ArcadeNet: { ok: true, onAuth: fn => { auth = fn; }, currentUser: () => user,
            field: { delete: () => null },
            profile: { get: async uid => { reads++; return new Promise(resolve => waiters.push({ uid, resolve })); },
                save: (uid, data) => { saves.push({ uid, data }); return Promise.resolve(); } },
        }, addEventListener() {},
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/cloud-sync.js'), 'utf8'), context);
    const events = [];
    context.window.CloudSync.onProfile((profile, uid) => events.push({ profile, uid }));
    auth(user);
    assert.equal(reads, 1, 'Metadata subscriptions must reuse the existing login profile read');
    waiters.shift().resolve({ birthday: '2000-11-03', name: 'Player' });
    await new Promise(setImmediate);
    assert.equal(events.length, 1);
    assert.equal(events[0].profile.birthday, '2000-11-03');
    assert.equal(events[0].uid, user.uid);
    let replay;
    context.window.CloudSync.onProfile((profile, uid) => { replay = { profile, uid }; });
    assert.equal(replay.profile.birthday, '2000-11-03', 'A late launcher listener receives the loaded profile');
    assert.equal(reads, 1, 'Replaying metadata must not perform another read');
    assert(saves.every(item => !Object.hasOwn(item.data, 'birthday')), 'Record sync must not overwrite birthday metadata');

    const oldRead = context.window.CloudSync.sync();
    const late = waiters.shift();
    user = { uid: 'other-player', name: 'Other', anon: false }; auth(user);
    const next = waiters.shift();
    const before = events.length;
    late.resolve({ birthday: '2000-11-03' }); await oldRead;
    assert.equal(events.length, before, 'A late old-account response must not greet the new account');
    next.resolve({ name: 'Other' }); await new Promise(setImmediate);
    assert.equal(events.at(-1).uid, 'other-player');
    user = null; auth(null);
    let signedOutReplay = false;
    context.window.CloudSync.onProfile(() => { signedOutReplay = true; });
    assert.equal(signedOutReplay, false, 'Sign-out clears cached profile metadata');
    console.log('PASS: birthday dates, directional wind, no extra profile reads, metadata preservation, late subscriptions and account-switch isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
