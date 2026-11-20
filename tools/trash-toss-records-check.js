/* Real CloudSync migrations: CPU highs, cloud deletions, guest restore and account isolation. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/cloud-sync.js'), 'utf8');
const key = 'arcadeGames:scores:trash-toss', mark = 1795219200000;
function storage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return { get length() { return values.size; }, key: i => [...values.keys()][i],
        getItem: k => values.has(k) ? values.get(k) : null,
        setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
}
const previous = {
    best: { 'cpu-office-normal-v5': 120, 'cpu-office-normal-v8': 80, 'cpu-office-normal': 95,
        'cpu-park-hard-v5': 90, 'cpu-park-hard-v8': 130, 'online-office-standard-v8': 999,
        'local-living-standard-v5': 800, 'practice-office-standard-v8': 700 },
    recent: [{ mode: 'online-office-standard-v8', score: 999 }, { mode: 'cpu-office-normal-v5', score: 120, t: 42 }],
};
const expected = { 'cpu-office-normal': 120, 'cpu-park-hard': 130 };
const other = JSON.stringify({ best: { default: 55 }, recent: [{ mode: 'default', score: 55 }] });
function load(localStorage, net = { ok: false }) {
    const context = { localStorage, console, Promise, Date, JSON, Object, window: { ArcadeNet: net, addEventListener() {} } };
    vm.runInNewContext(source, context);
    return context.window.CloudSync;
}
const offline = storage({ [key]: JSON.stringify(previous), 'arcadeGames:scores:snake': other, 'arcadeGames:migratedAt': '1793577600000' });
load(offline);
assert.deepEqual(JSON.parse(offline.getItem(key)), { best: expected, recent: [{ mode: 'cpu-office-normal', score: 120, t: 42 }] });
assert.equal(offline.getItem('arcadeGames:scores:snake'), other, 'Other games retain their scores and recent runs');
assert.equal(Number(offline.getItem('arcadeGames:migratedAt')), mark);
const migrated = offline.getItem(key); load(offline);
assert.equal(offline.getItem(key), migrated, 'Repeated page loads leave migrated scores unchanged');
offline.setItem(key, JSON.stringify(previous));
load(offline);
assert.deepEqual(JSON.parse(offline.getItem(key)), { best: expected, recent: [{ mode: 'cpu-office-normal', score: 120, t: 42 }] }, 'A cached client cannot leave retired local records behind after the migration watermark has advanced');

(async () => {
    const deleted = Object.freeze({ deleted: true }), saves = [];
    const profiles = {
        a: { recordsMigratedAt: 1793577600000, birthday: { month: 5, day: 6 }, games: {
            'trash-toss': { bests: { 'cpu-office-normal-v8': 150, 'cpu-park-hard-v5': 110, 'online-park-standard-v8': 1000 } },
            snake: { bests: { default: 65 } },
        } },
        b: { recordsMigratedAt: 1793577600000, games: {
            'trash-toss': { bests: { 'cpu-living-easy-v5': 70, 'local-living-standard-v8': 900 } },
        } },
    };
    function merge(target, patch) {
        for (const [name, value] of Object.entries(patch)) {
            if (value === deleted) delete target[name];
            else if (value && typeof value === 'object' && !Array.isArray(value)) merge(target[name] ||= {}, value);
            else target[name] = value;
        }
    }
    let user = { uid: 'a', name: 'A', anon: false }, auth;
    const local = storage({ [key]: JSON.stringify(previous), 'arcadeGames:activeScope': 'a', 'arcadeGames:migratedAt': '1793577600000',
        'arcadeGames:bucket:guest': JSON.stringify([{ 'trash-toss': { 'cpu-arena-hard-v5': 77, 'online-arena-standard-v8': 999 } }, {}, {}]),
    });
    const api = load(local, { ok: true, currentUser: () => user, onAuth: fn => { auth = fn; }, field: { delete: () => deleted },
        profile: { get: async uid => JSON.parse(JSON.stringify(profiles[uid])), save: async (uid, patch) => { saves.push(patch); merge(profiles[uid], patch); } },
    });
    auth(user); await new Promise(setImmediate);
    assert.deepEqual(JSON.parse(local.getItem(key)).best, { 'cpu-office-normal': 150, 'cpu-park-hard': 130 });
    assert.deepEqual(profiles.a.games['trash-toss'].bests, { 'cpu-office-normal': 150, 'cpu-park-hard': 130 }, 'Cloud migration removes old fields with delete sentinels and keeps the highest CPU values');
    assert.deepEqual(profiles.a.birthday, { month: 5, day: 6 }, 'Score migration preserves account metadata');
    assert.deepEqual(profiles.a.games.snake.bests, { default: 65 }, 'Other cloud games are untouched');
    assert.deepEqual(profiles.b.games['trash-toss'].bests, { 'cpu-living-easy-v5': 70, 'local-living-standard-v8': 900 }, 'An account is not migrated until its own authenticated session syncs');
    assert.equal(profiles.a.recordsMigratedAt, mark);
    assert.ok(saves[0].games['trash-toss'].bests['online-park-standard-v8'] === deleted, 'Retired cloud records are actually deleted');
    await api.sync();
    assert.deepEqual(profiles.a.games['trash-toss'].bests, { 'cpu-office-normal': 150, 'cpu-park-hard': 130 }, 'Repeated sync cannot restore retired records');
    // Another device may still run cached code and write obsolete keys after migration.
    profiles.a.games['trash-toss'].bests['online-office-standard-v8'] = 2000;
    profiles.a.games['trash-toss'].bests['cpu-office-normal-v5'] = 170;
    await api.sync();
    assert.deepEqual(profiles.a.games['trash-toss'].bests, { 'cpu-office-normal': 170, 'cpu-park-hard': 130 }, 'Every sync cleans reintroduced legacy fields while preserving the higher CPU score, even for an already-migrated account');
    user = { uid: 'b', name: 'B', anon: false }; auth(user); await new Promise(setImmediate);
    assert.deepEqual(JSON.parse(local.getItem(key)).best, { 'cpu-living-easy': 70 }, 'Accounts keep separate CPU highs');
    assert.deepEqual(profiles.b.games['trash-toss'].bests, { 'cpu-living-easy': 70 });
    user = null; auth(null);
    assert.deepEqual(JSON.parse(local.getItem(key)).best, { 'cpu-arena-hard': 77 }, 'Restoring an older guest bucket also removes non-CPU modes and version suffixes');
    console.log('PASS: CPU-only record migration, highest-score preservation, stale-client repair after the watermark, cloud field deletion, guest restore, metadata and per-account isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
