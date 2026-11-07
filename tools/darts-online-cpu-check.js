/** Device-owned CPU policy checks on the real room service/RTDB adapter, using local fixtures. */
'use strict';
const assert = require('node:assert/strict');
const Rules = require('../js/games/darts-rules.js');
const createRoom = require('../js/games/darts-room.js');
const physics = require('./helpers/darts-physics.js')();
const gestures = require('../js/games/darts-cpu-gesture.js').create(physics);
const strategy = require('../js/games/darts-cpu-strategy.js');
const random = require('../js/games/darts-cpu-gesture.js').seeded(92381);

(async () => {
    const modules = Object.assign({}, await import('../js/net/rooms.mjs'), await import('../js/net/rtdb-rooms.mjs'));
    Object.assign(modules, await import('../js/net/rtdb-values.mjs'));
    const db = require('./helpers/rtdb-fixtures.js').realtimeGameBackend(modules);
    let clock = 1000, serial = 0;
    const clients = new Map(), errors = [], holds = new Map();
    function make(sessionId = 'cpu-tab-' + ++serial) {
        const user = { uid: 'account', name: sessionId };
        const client = createRoom({ now: () => clock, net: { rooms: {
            presence: options => modules.createRoomPresence({ ...options, now: () => clock }),
            create: options => {
                const store = db.createStore(options, () => user, sessionId, () => clock);
                const original = store.transact;
                store.transact = async (...args) => {
                    const hold = holds.get(sessionId); holds.delete(sessionId);
                    if (hold) await hold;
                    return original(...args);
                };
                return modules.createRoomService({ store, getUser: () => user, sessionId, generateCode: () => 'CPUS', now: () => clock }, options);
            }
        } }, resolveThrow: th => {
            const impact = physics.computeImpact(th);
            return { impact, result: physics.scoreAt(impact.x, impact.y) };
        }, onError: error => errors.push(error) });
        client.testSession = sessionId;
        clients.set(client.service.currentPlayer().uid, client); return client;
    }
    const a = make(), b = make(), c = make();
    const A = a.service.currentPlayer().uid, B = b.service.currentPlayer().uid;
    const get = () => db.get('darts_rooms/R-CPUS'), game = () => get().game;
    async function flush(task) { const result = await task; await db.flush(); return result; }
    const owner = () => clients.get(game().owners[game().active]);
    async function start() {
        for (const uid of Object.keys(get().players)) if (uid !== get().hostUid) await flush(clients.get(uid).ready());
        assert.equal(await flush(clients.get(get().hostUid).start()), true);
    }
    async function lobby() {
        await flush(clients.get(get().hostUid).service.update('CPUS', { game: { ...game(), seq: game().seq + 1, status: 'over', winner: null, endReason: 'cancelled' }, phase: 'results', status: 'results' }));
        await flush(clients.get(get().hostUid).backToLobby());
    }
    function flight(point) { return physics.computeThrow(physics.analyseGesture(gestures.ideal(point).samples)); }
    async function shoot(target) {
        clock = Math.max(clock + 1, game().readyAt || 0);
        const before = structuredClone(game()), player = before.active, client = owner();
        const participant = before.participants[player];
        const generated = gestures.generate(target || strategy.choose(before, player, participant.difficulty || 'insane', random), participant.difficulty || 'insane', random);
        const analysis = physics.analyseGesture(generated.samples);
        if (!analysis.valid) return shoot(target);
        const th = physics.computeThrow(analysis), impact = physics.computeImpact(th), result = Rules.scoreResult(before, physics.scoreAt(impact.x, impact.y));
        assert.equal(await flush(client.submit(th, before)), true);
        assert.equal(game().seq, before.seq + 1);
        assert.deepEqual(game().lastThrow.impact, JSON.parse(JSON.stringify(impact)));
        assert.equal(game().lastDart.result.score, result.score);
        for (const connected of Object.keys(get().players)) assert.deepEqual(clients.get(connected).current().data.game, game());
        return { before, player, th, impact };
    }

    await flush(a.create({ mode: 'countup', roundLimit: 5, turnMs: 0 }, [
        { id: 'human-A', name: 'Human A' }, { id: 'cpu-A', name: 'CPU A', type: 'cpu', difficulty: 'hard', controllerId: 'forged' }
    ]));
    assert.equal(get().participants['cpu-A'].controllerId, A);
    assert.equal(get().participants['cpu-A'].type, 'cpu');
    assert.equal(await flush(a.removeLocalPlayer('human-A')), false);
    await flush(b.join('CPUS')); const humanB = b.ownedPlayerIds()[0];
    assert.equal(await flush(b.addCpuPlayer('CPU B', 'insane')), true);
    const cpuB = b.ownedPlayerIds().find(id => id !== humanB);
    assert.equal(get().participants[cpuB].controllerId, B);
    await assert.rejects(c.join('CPUS'), error => error.code === 'room/full');
    assert.equal(await flush(b.addCpuPlayer('Overflow')), false);
    assert.equal(await flush(a.setCpuDifficulty(cpuB, 'easy')), false);
    assert.equal(await flush(a.renamePlayer(cpuB, 'Forged')), false);
    assert.equal(await flush(a.removeLocalPlayer(cpuB)), false);
    await flush(b.ready()); await flush(a.ready());
    assert.equal(await flush(b.setCpuDifficulty(cpuB, 'hard')), true);
    assert.deepEqual(get().ready, {});
    assert.equal(a.canStart(), false);
    const race = await Promise.all([b.setCpuDifficulty(cpuB, 'insane'), a.ready()]); await db.flush();
    assert.equal(race[0], true); assert.equal(race[1], false);
    await flush(b.ready());
    assert.equal(a.canStart(), true, 'One guest Ready covers its human and CPU');
    assert.equal(await flush(a.start()), true);
    assert.equal(game().execution, 'shared');
    const locked = structuredClone(game().participants);
    assert.equal(game().owners['cpu-A'], A); assert.equal(game().owners[cpuB], B);
    assert.equal(await flush(b.setCpuDifficulty(cpuB, 'easy')), false);
    assert.equal(await flush(b.removeLocalPlayer(cpuB)), false);
    assert.equal(await flush(b.renamePlayer(cpuB, 'Mid-match')), false);
    assert.equal(await flush(b.addCpuPlayer('Late')), false);
    while (game().status === 'playing') await shoot();
    assert.deepEqual(game().participants, locked);
    assert(game().history.some(row => row.uid === 'cpu-A') && game().history.some(row => row.uid === cpuB));
    assert(!JSON.stringify(game().history).includes('samples'), 'No synthetic diagnostics enter match history');
    await flush(a.backToLobby());

    // Repeated concurrent attempts, including another instance claiming the same controller.
    await flush(a.configure({ mode: 'countup', turnMs: 30000 })); await start();
    const expected = structuredClone(game()), current = owner(), twin = make(current.testSession);
    twin.attach('CPUS'); await db.flush();
    clock = Math.max(clock, game().readyAt || 0);
    const th = flight({ x: 0, y: 0 });
    const attempts = await Promise.all([current.submit(th, expected), twin.submit(th, expected), current.submit(th, expected)]); await db.flush();
    assert.equal(attempts.filter(Boolean).length, 1);
    clients.set(current.service.currentPlayer().uid, current);
    assert.equal(game().seq, expected.seq + 1);
    assert.equal(await flush(current.submit(th, expected)), false);
    const wrongOwner = game().owners[game().active] === A ? b : a;
    clock = game().readyAt;
    assert.equal(await flush(wrongOwner.submit(th, game())), false);
    for (const field of ['leg', 'phase', 'active', 'corkRound', 'turnStartedAt']) {
        assert.equal(await flush(owner().submit(th, { ...game(), [field]: 'stale' })), false, field + ' guard');
    }

    let releaseDetached;
    const detached = owner();
    holds.set(detached.testSession, new Promise(resolve => { releaseDetached = resolve; }));
    const detachedRequest = detached.submit(th, structuredClone(game()));
    detached.attach('CPUS'); await db.flush(); releaseDetached();
    assert.equal(await flush(detachedRequest), false, 'Replacing an attachment invalidates queued work even with the same room membership');

    // Queue a valid request, then cross the deadline before the transaction executes.
    const timedOwner = owner(), timedState = structuredClone(game());
    let release; holds.set(timedOwner.testSession, new Promise(resolve => { release = resolve; }));
    const pending = timedOwner.submit(th, timedState);
    clock = timedState.turnStartedAt + timedState.turnMs + 1; release();
    assert.equal(await flush(pending), false, 'Queued pre-deadline input cannot score after the deadline');
    assert.equal(await flush(a.expire()), true);
    assert.equal(await flush(timedOwner.submit(th, timedState)), false);
    await lobby();

    // Every X01 score and all In/Out combinations use the same owner acceptance path.
    for (const startingScore of [301, 501, 701, 901, 1101, 1501]) for (const inRule of ['open', 'double', 'master']) for (const outRule of ['open', 'double', 'master']) {
        await flush(a.configure({ mode: 'x01', startingScore, inRule, outRule, turnMs: 0, startingPlayer: 'random' }));
        await start();
        for (let i = 0; i < 6; i++) await shoot();
        assert.equal(game().startingScore, startingScore); await lobby();
    }
    for (const cricketVariant of ['standard', 'cutthroat']) {
        await flush(a.configure({ mode: 'cricket', cricketVariant, turnMs: 0 })); await start();
        for (let i = 0; i < 24; i++) await shoot();
        assert.equal(game().cricketVariant, cricketVariant); await lobby();
    }

    // All Cork contexts share exact physical ties and ordinary resolution.
    for (const purpose of ['opening', 'tie', 'limit']) {
        await flush(a.configure({ mode: 'x01', startingPlayer: 'cork', turnMs: 0 })); await start();
        await flush(a.service.update('CPUS', { 'game.corkPurpose': purpose, 'game.legCorkPurpose': purpose }));
        const firstRound = game().corkRound;
        for (let i = 0; i < 4; i++) { clock = Math.max(clock, game().readyAt); assert.equal(await flush(owner().submit(th)), true); }
        assert.equal(game().corkRound, firstRound + 1, 'Exact physical ties repeat');
        for (let i = 0; i < 4; i++) await shoot();
        assert.equal(game().phase === 'play' || game().status !== 'playing', true);
        await lobby();
    }

    // Host loss removes only that device's slots, retaining the other owner's CPU.
    await flush(a.configure({ mode: 'countup', turnMs: 0 })); await start();
    const stale = structuredClone(game());
    db.disconnectPlayer(A); await db.flush();
    assert.equal(a.canControl(), false);
    assert.equal(await flush(a.submit(th, stale)), false);
    clock += 16001; await flush(b.tick());
    assert(!get().players[A]); assert.equal(get().hostUid, B);
    assert(game().withdrawn.includes('human-A') && game().withdrawn.includes('cpu-A'));
    assert.equal(game().owners[cpuB], B);
    clients.set(B, b);
    for (let i = 0; i < 6; i++) await shoot();
    assert.equal(await flush(a.submit(th, stale)), false);
    await lobby();
    await flush(c.join('CPUS'));
    await flush(c.leave());
    assert.equal(await flush(b.setCpuDifficulty(cpuB, 'normal')), true);
    await flush(b.configure({ mode: 'practice' })); assert.equal(b.canStart(), false);
    assert.equal(await flush(b.addCpuPlayer('Practice')), false);
    assert.equal(await flush(b.removeLocalPlayer(humanB)), false);
    await flush(b.removeLocalPlayer(cpuB)); assert.equal(b.canStart(), true);
    await flush(b.leave()); assert.equal(get(), null);
    await flush(b.create({ mode: 'countup', turnMs: 0 }, [{ id: 'solo-human', name: 'Human' },
        { id: 'solo-cpu', name: 'CPU', type: 'cpu', difficulty: 'hard' }]));
    await flush(b.start()); assert.equal(game().execution, 'local');
    const finished = { ...game(), seq: game().seq + 1, status: 'over', winner: null, endReason: 'cancelled' };
    const altered = structuredClone(finished); altered.participants['solo-cpu'].difficulty = 'easy';
    assert.equal(await flush(b.syncLocal(altered, true)), false, 'Local reservation uploads cannot change locked CPU configuration');
    assert.equal(await flush(b.syncLocal(finished, true)), true);
    await flush(b.leave());
    assert.equal(errors.length, 0);
    console.log('PASS: device-owned CPU imports/edits/Ready/locking, actual physical scoring, all X01 In/Out starts, Cricket, Cork ties, concurrent/stale/queued submissions, disconnect and host migration.');
})().catch(error => { console.error(error); process.exitCode = 1; });
