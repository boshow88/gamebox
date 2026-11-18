/** Pure match + actual shared room/RTDB adapter on the controlled native-tree fixture. No live Firebase. */
'use strict';
const assert = require('node:assert/strict');
const Match = require('../js/games/impressions-match.js');
const Color = require('../js/games/impressions-color.js');
const Quantity = require('../js/games/impressions-quantity.js');
const Pitch = require('../js/games/impressions-pitch.js');
const Groups = require('../js/games/impressions-quantity-groups.js');
const Colors = require('../js/games/impressions-color-variants.js');
const Pitches = require('../js/games/impressions-pitch-variations.js');
const Rules = require('../js/games/impressions-rules.js');
const createRoom = require('../js/games/impressions-room.js');
const vm = require('node:vm'), fs = require('node:fs');
const cachedContext = vm.createContext({ ImpressionsColor: { ...Color, supportsScoringVersion: undefined }, ImpressionsRules: Rules });
vm.runInContext(fs.readFileSync(require.resolve('../js/games/impressions-match.js'), 'utf8'), cachedContext);
assert.throws(() => cachedContext.ImpressionsMatch.options(), error => error.code === 'room/client-outdated');
assert.equal(cachedContext.ImpressionsMatch.supported({ protocolVersion: 1, scoringVersion: 2 }), false);
const clone = value => JSON.parse(JSON.stringify(value));
function fixedCreate(participants, seats, input, seed, stamp, id) { return Match.create(participants, seats, { selectionVersion: 2, ...input }, seed, stamp, id); }
function asLegacy(game) {
    const old = clone(game); old.protocolVersion = 1; delete old.categoryId; delete old.question.scoringVersion;
    delete old.config.categoryMode; delete old.config.quantity; return old;
}
const participants = n => Object.fromEntries(Array.from({ length: n }, (_, i) => ['p' + i,
    { id: 'p' + i, name: 'P' + i, type: 'human', controllerId: 'c' + i }]));
const roster = participants(3), ids = Object.keys(roster);
let pure = fixedCreate(roster, ids, { maxRounds: 2 }, 42, 1000, 'match');
const before = clone(pure), token = Match.token(pure);
const request = (game, i, answer = game.question.target, nonce = 'nonce-' + i) => ({ ...Match.token(game), participantId: 'p' + i, answer, nonce });
assert.equal(Match.submit(pure, 'c0', request(pure, 0), pure.timeline.answerAt - 1), null);
assert.equal(Match.submit(pure, 'c1', request(pure, 0), pure.timeline.answerAt), null);
assert.equal(Match.submit(pure, 'c0', request(pure, 0, [256, 0, 0]), pure.timeline.answerAt), null);
assert.equal(Match.submit(pure, 'c0', { ...request(pure, 0), questionId: 'wrong' }, pure.timeline.answerAt), null);
const accepted = Match.submit(pure, 'c0', request(pure, 0), pure.timeline.answerAt);
assert(accepted && !accepted.duplicate); assert.deepEqual(pure, before);
pure = accepted.state;
assert(Match.submit(pure, 'c0', request(pure, 0), pure.timeline.deadline + 1).duplicate);
assert.equal(Match.submit(pure, 'c0', request(pure, 0, [0, 0, 0]), pure.timeline.answerAt), null);
assert.equal(Match.submit(pure, 'c0', request(pure, 0, pure.question.target, 'other'), pure.timeline.answerAt), null);
assert.equal(Match.settle(pure, token, pure.timeline.deadline - 1), null);
let result = Match.settle(pure, token, pure.timeline.deadline);
assert.equal(result.round, 1); assert.equal(result.settledRound, 1); assert.equal(result.lastResult.rows[0].scoreUnits, 100000);
assert(result.lastResult.rows.slice(1).every(row => row.scoreUnits === 0 && row.missing));
assert.deepEqual(result.hpUnits, { p0: 500000, p1: 400000, p2: 400000 });
assert.equal(Match.settle(result, token, pure.timeline.deadline + 1), null);
assert.equal(Match.advance(result, token, 99, result.resultsUntil - 1), null);
pure = Match.advance(result, token, 99, result.resultsUntil);
assert.equal(pure.round, 2); assert.equal(pure.question.seed, 99); assert.equal(pure.config.maxRounds, 2);
assert.equal(Match.submit(pure, 'c0', { ...token, participantId: 'p0', answer: [0, 0, 0], nonce: 'old' }, pure.timeline.answerAt), null);
assert.equal(Match.settle(pure, token, pure.timeline.deadline), null);
const oldScores = clone(pure.hpUnits);
const noAnswers = Match.settle(pure, Match.token(pure), pure.timeline.deadline);
assert.deepEqual(noAnswers.hpUnits, oldScores); assert.equal(noAnswers.status, 'over'); assert.deepEqual(noAnswers.winners, ['p0']);
assert.equal(noAnswers.endReason, 'round-cap');
assert.equal(Match.advance(noAnswers, Match.token(noAnswers), 9, noAnswers.resultsUntil), null);
assert.deepEqual(Array.from({ length: 12 }, (_, i) => Rules.multiplierForRound(i + 1, Match.options().multiplierSchedule)),
    [1, 1, 1.3, 1.3, 1.7, 1.7, 2.2, 2.2, 3, 3, 3, 3]);
const frozen = fixedCreate(roster, ids, {}, 42, 0, 'freeze');
assert.equal(frozen.scoringVersion, 4); assert.equal(frozen.protocolVersion, Match.version);
assert.deepEqual(frozen.config.scoring, Color.defaults.scoring);
const legacy = asLegacy(fixedCreate(participants(2), ['p0', 'p1'], { scoring: { version: 1 } }, 42, 0, 'legacy'));
delete legacy.config.scoring.version; // The actual pre-calibration frozen shape.
assert(Match.supported(legacy));
const legacyAnswer = [120, 120, 160], legacyWithAnswer = Match.submit(legacy, 'c0', request(legacy, 0, legacyAnswer), legacy.timeline.answerAt).state;
const legacySettled = Match.settle(legacyWithAnswer, Match.token(legacy), legacy.timeline.deadline);
assert.equal(legacySettled.lastResult.rows[0].scoreUnits,
    Rules.scoreToUnits(Color.grade(legacy.question.target, legacyAnswer, { version: 1 }).score));
assert.notEqual(legacySettled.lastResult.rows[0].scoreUnits, Rules.scoreToUnits(Color.grade(legacy.question.target, legacyAnswer).score));
const legacyNext = Match.advance(legacySettled, Match.token(legacySettled), 43, legacySettled.resultsUntil);
assert.equal(legacyNext.scoringVersion, 1); assert.deepEqual(legacyNext.config.scoring, legacy.config.scoring);
const previousV2 = asLegacy(fixedCreate(participants(2), ['p0', 'p1'], { maxRounds: 2, scoring: { version: 2 } }, 42, 0, 'previous-v2'));
const previousV2WithAnswer = Match.submit(previousV2, 'c0', request(previousV2, 0, legacyAnswer), previousV2.timeline.answerAt).state;
const previousV2Result = Match.settle(previousV2WithAnswer, Match.token(previousV2), previousV2.timeline.deadline);
assert.equal(previousV2Result.lastResult.rows[0].scoreUnits, Rules.scoreToUnits(Color.grade(previousV2.question.target, legacyAnswer, previousV2.config.scoring).score));
assert.notEqual(previousV2Result.lastResult.rows[0].scoreUnits, Rules.scoreToUnits(Color.grade(previousV2.question.target, legacyAnswer).score));
const previousV2Next = Match.advance(previousV2Result, Match.token(previousV2Result), 43, previousV2Result.resultsUntil);
assert.equal(previousV2Next.scoringVersion, 2); assert.deepEqual(previousV2Next.config.scoring, previousV2.config.scoring);
for (const version of [1, 2, 3]) {
    let old = asLegacy(fixedCreate(participants(2), ['p0', 'p1'], { maxRounds: 2, scoring: { version, tolerance: 0.23 } }, 42, 0, 'protocol-one-' + version));
    const config = clone(old.config), identity = Match.token(old);
    assert(Match.supported(old)); assert.equal(identity.categoryId, undefined);
    assert.equal(Match.submit(old, 'c0', request(old, 0, 15), old.timeline.answerAt), null, 'Old Color never accepts a Quantity scalar');
    for (let i = 0; i < 2; i++) old = Match.submit(old, 'c' + i, request(old, i, legacyAnswer), old.timeline.answerAt).state;
    old = Match.settle(old, identity, old.timeline.deadline);
    assert.equal(old.lastResult.rows[0].scoreUnits, Rules.scoreToUnits(Color.grade(old.question.target, legacyAnswer, config.scoring).score));
    old = Match.advance(old, identity, 43, old.resultsUntil);
    assert.equal(old.protocolVersion, 1); assert.equal(old.scoringVersion, version); assert.equal(old.categoryId, undefined);
    assert.equal(old.question.scoringVersion, undefined); assert.deepEqual(old.config, config); assert(Match.supported(old));
}
for (const scoring of [{ tolerance: 0.2, exponent: 1.4 }, Color.scoringParameters({ version: 1 }), Color.scoringParameters({ version: 2 })])
    assert.deepEqual(Match.upgradeDefaultScoring({ scoring }).scoring, Color.defaults.scoring);
assert.equal(Match.upgradeDefaultScoring({ scoring: Color.defaults.scoring }), null);
assert.equal(Match.upgradeDefaultScoring({ scoring: { version: 2, tolerance: 0.3 } }), null, 'Preserve intentional custom legacy settings');
for (const unsupported of [{ ...frozen, scoringVersion: 99 },
    { ...frozen, scoringVersion: 1 }, { ...frozen, config: { ...frozen.config, scoring: { tolerance: 0.2, exponent: 1.4 } } }]) {
    assert.equal(Match.supported(unsupported), false, 'Unknown/mismatched scoring versions cannot submit or settle');
    assert.equal(Match.submit(unsupported, 'c0', request(unsupported, 0), unsupported.timeline.answerAt), null);
    assert.equal(Match.settle(unsupported, Match.token(unsupported), unsupported.timeline.deadline), null);
}
roster.p0.name = 'Changed'; assert.equal(frozen.roster.p0.name, 'P0');
let empty = Match.withdraw(frozen, 'c0', 1); empty = Match.withdraw(empty, 'c1', 2);
assert.equal(empty.status, 'over'); assert.deepEqual(empty.winners, ['p2']);
// All-participant withdrawal can occur together in a future controller/room cleanup.
const allGone = Match.withdraw({ ...frozen, withdrawn: ['p0', 'p1'] }, 'c2', 3);
assert.equal(allGone.status, 'over'); assert.deepEqual(allGone.winners, []); assert.equal(allGone.endReason, 'empty');
assert.equal(Match.phaseAt(frozen, frozen.timeline.answerAt + 1), 'answer');
assert.equal(Match.phaseAt(frozen, frozen.timeline.deadline + 100000), 'waiting');
let capped = fixedCreate(participants(2), ['p0', 'p1'], {}, 1, 0, 'twelve-rounds');
for (let round = 1; round <= 12; round++) {
    capped = Match.settle(capped, Match.token(capped), capped.timeline.deadline);
    assert.equal(capped.round, round); assert.equal(capped.status, round === 12 ? 'over' : 'playing');
    if (round < 12) capped = Match.advance(capped, Match.token(capped), round + 1, capped.resultsUntil);
}
assert.deepEqual(capped.winners, ['p0', 'p1']);
for (const input of [{ capacity: 9 }, { maxRounds: 0 }, { initialAnswer: null }, { initialAnswer: [0, 256, 0] }, { timing: { prepareMs: 0 } }, { timing: { resultsMs: 0 } }])
    assert.throws(() => Match.options(input));
assert.equal(Match.submit({ ...frozen, protocolVersion: 99 }, 'c0', request(frozen, 0), frozen.timeline.answerAt), null);
let forged = Match.submit(frozen, 'c0', { ...request(frozen, 0, [0, 0, 0]), score: 100 }, frozen.timeline.answerAt).state;
forged = Match.settle(forged, Match.token(forged), forged.timeline.deadline);
assert.equal(forged.lastResult.rows[0].scoreUnits, Rules.scoreToUnits(Color.grade(frozen.question.target, [0, 0, 0]).score), 'Caller-supplied scores are ignored');

(async () => {
    const modules = Object.assign({}, await import('../js/net/rooms.mjs'), await import('../js/net/rtdb-rooms.mjs'), await import('../js/net/rtdb-values.mjs'));
    const { createServerClock, createRealtimeRoomClock } = await import('../js/net/rtdb-clock.mjs');
    let wall = 100000, mono = 0;
    const clock = createServerClock({ wallNow: () => wall, monotonicNow: () => mono });
    clock.sample(-90000); assert.equal(clock.now(), 10000);
    wall += 3600000; mono += 500; assert.equal(clock.now(), 10500, 'Wall-clock edits do not change an anchored frame clock');
    wall = 100500; clock.refresh(); assert.equal(clock.now(), 10500);
    mono += 500; assert.equal(clock.now(), 11000);
    assert.equal(clock.sample(NaN), false);
    const observers = new Map(), stopped = [];
    const serverClock = createRealtimeRoomClock({ ref: (_db, p) => p, onValue: (p, cb) => { observers.set(p, cb); return () => stopped.push(p); } }, {},
        { wallNow: () => 50000, monotonicNow: () => 0 });
    const waiting = serverClock.waitUntilReady();
    observers.get('.info/serverTimeOffset')({ val: () => -40000 }); assert.equal(serverClock.isReady(), false);
    observers.get('.info/connected')({ val: () => true }); await waiting; assert.equal(serverClock.now(), 10000);
    serverClock.dispose(); assert.equal(stopped.length, 2);
    await assert.rejects(serverClock.waitUntilReady(), /disposed/);
    const interrupted = createRealtimeRoomClock({ ref: (_db, p) => p, onValue: () => () => {} }, {});
    const unfinished = interrupted.waitUntilReady(); interrupted.dispose(); await assert.rejects(unfinished, /disposed/);
    const unavailable = createRealtimeRoomClock({ ref: (_db, p) => p, onValue: () => () => {} }, {});
    await assert.rejects(unavailable.waitUntilReady(1), error => error.code === 'room/clock-unavailable'); unavailable.dispose();

    function fixture(options = {}) {
        const db = require('./helpers/rtdb-fixtures.js').realtimeGameBackend(modules);
        let time = 100000, serial = 0, seeds = 41;
        const errors = [], clients = [];
        function make() {
            const sid = 'impressions-tab-' + ++serial, user = { uid: 'same-account', name: 'Player ' + serial, anon: true };
            let hold = null, loseAck = false;
            const client = createRoom({ now: () => time, seedSource: () => ++seeds, onError: e => errors.push(e),
                net: { rooms: { presence: config => modules.createRoomPresence({ ...config, now: () => time }),
                    create: config => {
                        const store = db.createStore(config, () => user, sid, () => time), transact = store.transact;
                        store.transact = async (...args) => {
                            const paused = hold; hold = null; if (paused) await paused;
                            const result = await transact(...args);
                            if (loseAck) { loseAck = false; throw new Error('lost acknowledgement'); }
                            return result;
                        };
                        return modules.createRoomService({ store, getUser: () => user, sessionId: sid, now: () => time, generateCode: () => 'MEM1' }, config);
                    } } } });
            client.hold = () => { let release; hold = new Promise(resolve => { release = resolve; }); return release; };
            client.loseAck = () => { loseAck = true; };
            clients.push(client); return client;
        }
        const get = () => db.get('memory_rooms/R-MEM1'), game = () => get().game;
        async function flush(task) { const result = await task; await db.flush(); return result; }
        async function setup(n) {
            const host = make(); await flush(host.create({ challengeVersion:0,selectionVersion: 2, ...options }, 'Host'));
            const guests = Array.from({ length: n - 1 }, make);
            await flush(Promise.all(guests.map(c => c.join('MEM1'))));
            return clients;
        }
        async function start() {
            const host = clients.find(c => c.service.currentPlayer().uid === get().hostUid);
            for (const client of clients) if (client !== host && client.current() && get().players[client.service.currentPlayer().uid]) await flush(client.ready());
            assert.equal(await flush(host.start()), true);
        }
        return { db, clients, errors, make, get, game, flush, setup, start, setTime: value => { time = value; }, time: () => time };
    }

    {
        const f=fixture({challengeVersion:1,selectionVersion:3,categoryMode:'color',maxRounds:2}),[a,b]=await f.setup(2);await f.start();
        const current=clone(f.game()),options={...current.config,scoring:Color.scoringParameters({version:3})};
        const old=Match.create(f.get().participants,f.get().seatOrder,options,42,current.timeline.startAt,current.matchId);old.protocolVersion=9;
        await f.flush(a.service.updateMatch(a.current().code,{...Match.token(current),status:current.status},()=>({game:old,options,lobbyVersion:9})));
        const frozen=clone(f.game());await f.flush(a.tick());await f.flush(b.tick());assert.deepEqual(f.game(),frozen,'Active v9 is not migrated');
        for(let round=1;round<=2;round++){
            const g=clone(f.game()),token=Match.token(g),answer=[120,120,160];f.setTime(g.timeline.answerAt);
            const accepted=await f.flush(Promise.all([a.submit(g.question.target,token,'a'+round),b.submit(answer,token,'b'+round)]));assert(accepted.every(Boolean));
            f.setTime(g.timeline.deadline);await f.flush(Promise.all([a.settle(token),b.settle(token)]));
            const row=f.game().lastResult.rows.find(row=>row.id===b.playerId());assert.equal(row.scoreUnits,Rules.scoreToUnits(Color.grade(g.question.target,answer,g.config.scoring).score));
            assert.equal(f.game().scoringVersion,3);assert.deepEqual(f.game().config,options);
            if(round<2){f.setTime(f.game().resultsUntil);await f.flush(a.advance(token));assert.equal(f.game().protocolVersion,9);assert.equal(f.game().question.scoringVersion,3);}
        }
        const finished=clone(f.game());await f.flush(a.backToLobby());assert.deepEqual(f.game(),finished);assert.equal(f.get().options.scoring.version,4);assert.equal(f.get().lobbyVersion,Match.version);assert.deepEqual(f.get().ready,{});
        assert.deepEqual(f.get().options,{...options,scoring:Color.defaults.scoring});await f.start();assert.equal(f.game().protocolVersion,Match.version);assert.equal(f.game().scoringVersion,4);
        console.log('PASS: persisted active v9 keeps V3 through submit/settle/advance, then same-room rematch adopts protocol10/V4 without changing other settings.');
    }
    for(const challengeVersion of [0,1]){
        const f=fixture({challengeVersion,selectionVersion:3,categoryMode:'color',maxRounds:1}),[a,b]=await f.setup(2),revision=f.get().revision,uid=b.service.currentPlayer().uid;
        const options={...clone(f.get().options),scoring:Color.scoringParameters({version:3})};
        await f.flush(a.service.updateMatch(a.current().code,{matchId:undefined,round:undefined,status:undefined},()=>({options,lobbyVersion:9,ready:{[uid]:{revision,protocolVersion:9}}})));
        await f.flush(b.tick());assert.equal(f.get().lobbyVersion,9);assert(!a.canStart());await f.flush(a.tick());
        assert.equal(f.get().lobbyVersion,Match.version);assert.equal(f.get().revision,revision+1);assert.deepEqual(f.get().options,{...options,scoring:Color.defaults.scoring});assert.deepEqual(f.get().ready,{});assert.equal(await f.flush(b.ready(true,revision)),false);
        await f.flush(a.tick());assert.equal(f.get().revision,revision+1);await f.start();assert.equal(f.game().scoringVersion,4);
        console.log('PASS: v9 waiting default upgrades once to V4, preserves non-scoring options and invalidates stale revision/protocol Ready.');
    }
    {
        const f = fixture({ selectionVersion: 1, categoryMode: 'mixed', maxRounds: 1 }), [a, b] = await f.setup(2), revision = f.get().revision;
        const options = clone(f.get().options); options.scoring = Color.scoringParameters({ version: 2 }); delete options.categoryWeights; delete options.adaptive; delete options.selectionVersion;
        await f.flush(a.service.updateMatch(a.current().code, { matchId: undefined, round: undefined, status: undefined }, () => ({ lobbyVersion: 3, options, ready: { [b.service.currentPlayer().uid]: { revision, protocolVersion: 3 } } })));
        await f.flush(a.tick()); assert.deepEqual(f.get().options.categoryWeights, { color: 2, quantity: 2, pitch: 0 }); assert.equal(f.get().options.selectionVersion, 3); assert.equal(f.get().options.scoring.version, 4); assert.deepEqual(f.get().ready, {});
        await f.start(); assert.notEqual(f.game().categoryId, 'pitch'); console.log('PASS: legacy two-category lobby migration preserves enabled categories without introducing a Pitch/audio requirement, upgrades scoring once and invalidates Ready.');
    }
    {
        const f = fixture({ maxRounds: 1 }), [a, b] = await f.setup(2);
        const uid = b.service.currentPlayer().uid, previous = f.get().revision;
        await f.flush(a.service.updateMatch(a.current().code, { matchId: undefined, round: undefined, status: undefined }, () => ({
            lobbyVersion: 1, ready: { [uid]: { revision: previous, protocolVersion: 1 } }
        })));
        assert.equal(a.canStart(), false);
        await f.flush(b.tick()); assert.equal(f.get().lobbyVersion, 1);
        await f.flush(a.tick()); assert.equal(f.get().lobbyVersion, Match.version); assert.equal(f.get().revision, previous + 1);
        assert.deepEqual(f.get().ready, {}); assert.equal(f.get().options.categoryMode, 'color');
        await f.flush(a.tick()); assert.equal(f.get().revision, previous + 1);
        await f.flush(a.service.updateMatch(a.current().code, { matchId: undefined, round: undefined, status: undefined }, () => ({
            ready: { [uid]: { revision: f.get().revision, protocolVersion: 1 } }
        })));
        assert.equal(a.canStart(), false, 'Old-protocol Ready cannot authorize a new multi-category match');
        await f.start(); assert.equal(f.game().protocolVersion, Match.version);
        console.log('PASS: protocol-v1 lobby migrates once, clears Ready, rejects old-protocol readiness and requires a new protocol-v7 Start.');
    }
    {
        const f = fixture({ selectionVersion: 3, categoryMode: 'quantity', maxRounds: 1 }), [a, b] = await f.setup(2);
        const options = clone(f.get().options), previous = f.get().revision, uid = b.service.currentPlayer().uid;
        delete options.quantity.variantSelectionVersion; delete options.quantity.multi;
        await f.flush(a.service.updateMatch(a.current().code, { matchId: undefined, round: undefined, status: undefined }, () => ({
            options, lobbyVersion: 4, ready: { [uid]: { revision: previous, protocolVersion: 4 } }
        })));
        assert.equal(a.canStart(), false);
        await f.flush(b.tick()); assert.equal(f.get().lobbyVersion, 4, 'A guest cannot migrate the lobby');
        await f.flush(a.tick());
        assert.equal(f.get().lobbyVersion, Match.version); assert.equal(f.get().revision, previous + 1);
        assert.equal(f.get().options.quantity.variantSelectionVersion, 1);
        assert.equal(f.get().options.quantity.multi.scoring.version, 2); assert.deepEqual(f.get().ready, {});
        assert.equal(await f.flush(b.ready(true, previous)), false, 'Pre-migration Ready is stale');
        await f.flush(a.tick()); assert.equal(f.get().revision, previous + 1, 'Migration runs only once');
        await f.start(); assert.equal(f.game().protocolVersion, Match.version); assert(f.game().variantState.quantity);
        console.log('PASS: protocol-v4 waiting lobbies enable Quantity variants only after host migration, Ready invalidation and a fresh protocol-v7 Start.');
    }
    {
        const f = fixture({ maxRounds: 1 }), [a, b] = await f.setup(2);
        await f.flush(a.configure({ scoring: { version: 2 } })); await f.flush(b.ready());
        const oldRevision = f.get().revision;
        assert.equal(a.canStart(), false, 'A standard old lobby must migrate before starting');
        await f.flush(b.tick()); assert.equal(f.get().options.scoring.version, 2, 'Only the host migrates lobby settings');
        await f.flush(a.tick());
        assert.equal(f.get().options.scoring.version, 4); assert.equal(f.get().revision, oldRevision + 1);
        assert.deepEqual(f.get().ready, {}); assert.equal(await f.flush(b.ready(true, oldRevision)), false);
        await f.flush(a.tick()); assert.equal(f.get().revision, oldRevision + 1, 'Migration is idempotent');
        await f.start(); assert.equal(f.game().scoringVersion, 4);
        console.log('PASS: old standard lobby settings migrate to V4 once, invalidate Ready and reject stale readiness before the next match.');
    }
    {
        const f = fixture({ maxRounds: 1 }), [a, b] = await f.setup(2); await f.start();
        const g = clone(f.game()), oldOptions = { ...g.config, scoring: Color.scoringParameters({ version: 2 }) };
        const runningV2 = asLegacy(fixedCreate(f.get().participants, f.get().seatOrder, oldOptions, g.question.seed, g.timeline.startAt, g.matchId));
        // Seed the actual persisted shape of a room already playing V2 at rollout.
        await f.flush(a.service.updateMatch(a.current().code, { ...Match.token(g), status: g.status }, () => ({ options: oldOptions, game: runningV2 })));
        const beforeTick = clone(f.game()); await f.flush(a.tick());
        assert.deepEqual(f.game(), beforeTick); assert.equal(f.get().options.scoring.version, 2);
        f.setTime(runningV2.timeline.answerAt);
        const answer = [120, 120, 160];
        await f.flush(Promise.all([a.submit(runningV2.question.target, Match.token(runningV2), 'old-perfect'), b.submit(answer, Match.token(runningV2), 'old-answer')]));
        f.setTime(runningV2.timeline.deadline); await f.flush(a.settle());
        const score = f.game().lastResult.rows.find(row => row.id === b.playerId()).scoreUnits;
        assert.equal(score, Rules.scoreToUnits(Color.grade(runningV2.question.target, answer, runningV2.config.scoring).score));
        assert.notEqual(score, Rules.scoreToUnits(Color.grade(runningV2.question.target, answer).score));
        const finishedV2 = clone(f.game()); await f.flush(a.backToLobby());
        assert.deepEqual(f.game(), finishedV2, 'Finished V2 results remain frozen');
        assert.equal(f.get().options.scoring.version, 4); assert.deepEqual(f.get().ready, {});
        await f.start(); assert.equal(f.game().scoringVersion, 4);
        console.log('PASS: a persisted active V2 match keeps its curve/results, then returns to a V4 lobby and starts a V4 rematch.');
    }
    for (const version of [2, 3]) {
        const settings = { version, knee: 0.04, width: 0.08, strength: 0.7, ...(version === 3 ? { penaltyExponent: 1.5 } : {}) };
        const f = fixture({ maxRounds: 2, scoring: settings }), [a, b] = await f.setup(2); await f.start();
        const g = clone(f.game()), frozenScoring = clone(g.config.scoring);
        settings.knee = 0.9; settings.strength = 100;
        if (version === 3) settings.penaltyExponent = 9;
        assert.deepEqual(f.game().config.scoring, frozenScoring);
        assert.equal(await f.flush(a.configure({ scoring: { version: version === 2 ? 3 : 2 } })), false, 'No scoring switch during an active match');
        f.setTime(g.timeline.answerAt);
        const answer = [120, 120, 160];
        await f.flush(Promise.all([a.submit(g.question.target, Match.token(g), 'perfect'), b.submit(answer, Match.token(g), 'calibration')]));
        f.setTime(g.timeline.deadline); await f.flush(Promise.all([a.settle(), b.settle()]));
        const localGrade = Color.grade(g.question.target, answer, frozenScoring);
        const row = f.game().lastResult.rows.find(r => r.id === b.playerId());
        assert.equal(row.scoreUnits, Rules.scoreToUnits(localGrade.score), 'Local and concurrent online grading use the identical frozen curve');
        assert.equal(row.damageUnits, Rules.scoreToUnits(100) - row.scoreUnits);
        assert.equal(f.game().hpUnits[b.playerId()], 500000 - row.damageUnits);
        f.setTime(f.game().resultsUntil); await f.flush(a.advance());
        assert.deepEqual(f.game().config.scoring, frozenScoring); assert.equal(f.game().scoringVersion, version);
        console.log(`PASS: explicit scoring v${version} frozen parameters, local/online score and HP agreement, unchanged next-round configuration; production default is v4 and legacy v1/v2 matches retain their curve.`);
    }
    {
        const f = fixture({ selectionVersion: 3, categoryMode: 'color', maxRounds: 1 }), [a,b] = await f.setup(2), previous = f.get().revision, uid = b.service.currentPlayer().uid;
        const options = clone(f.get().options); delete options.color;
        await f.flush(a.service.updateMatch(a.current().code, {matchId:undefined,round:undefined,status:undefined},()=>({options,lobbyVersion:5,ready:{[uid]:{revision:previous,protocolVersion:5}}})));
        assert(!a.canStart());await f.flush(b.tick());assert.equal(f.get().lobbyVersion,5);await f.flush(a.tick());
        assert.equal(f.get().lobbyVersion,Match.version);assert.equal(f.get().revision,previous+1);assert.equal(f.get().options.color.variantSelectionVersion,2);assert.deepEqual(f.get().ready,{});assert.equal(await f.flush(b.ready(true,previous)),false);
        await f.flush(a.tick());assert.equal(f.get().revision,previous+1);await f.start();assert.equal(f.game().question.version,3);assert.equal(f.game().protocolVersion,Match.version);
        console.log('PASS: v5 waiting lobbies gain single Color/RGB8 only after host migration, revision increment, cleared Ready and fresh v8 Start.');
    }
    {
        const f=fixture({selectionVersion:3,categoryMode:'pitch',maxRounds:1}),[a,b]=await f.setup(2),revision=f.get().revision,uid=b.service.currentPlayer().uid,options=clone(f.get().options);delete options.pitch.variantSelectionVersion;delete options.pitch.variations;
        await f.flush(a.service.updateMatch(a.current().code,{matchId:undefined,round:undefined,status:undefined},()=>({options,lobbyVersion:6,ready:{[uid]:{revision,protocolVersion:6}},audioReady:{[uid]:{revision,protocolVersion:6}}})));
        assert(!a.canStart());await f.flush(b.tick());assert.equal(f.get().lobbyVersion,6);await f.flush(a.tick());assert.equal(f.get().lobbyVersion,Match.version);assert.equal(f.get().revision,revision+1);assert.equal(f.get().options.pitch.variantSelectionVersion,2);assert.deepEqual(f.get().ready,{});assert.equal(await f.flush(b.ready(true,revision)),false);
        for(const c of [a,b])await f.flush(c.acknowledgeAudio(true,f.get().revision));await f.start();assert.equal(f.game().question.type,'pitch');assert.equal(f.game().question.version,2);assert(f.game().variantState.pitch);
        console.log('PASS: v6 Pitch waiting lobbies migrate once to v8, invalidate Ready/audio revision and require fresh sound readiness before varied melodies.');
    }
    for(const n of [2,8])for(const [count,refs] of [[3,1],[4,1],[4,2],[5,1],[5,2]]){
        const lengths={n3:count===3?1:0,n4:count===4?1:0,n5:count===5?1:0},references={one:refs===1?1:0,two:refs===2?1:0};
        const f=fixture({selectionVersion:3,categoryMode:'pitch',maxRounds:3,pitch:{scoring:{tolerance:220,exponent:1.4},variations:{lengths:{easy:lengths,hard:lengths},references:{easy:references,hard:references}}}}),clients=await f.setup(n);
        for(const client of clients)await f.flush(client.acknowledgeAudio(true,f.get().revision));await f.start();const config=clone(f.game().config);
        for(let round=1;round<=3;round++){
            const g=clone(f.game()),token=Match.token(g),q=g.question,variationState=clone(g.variantState);assert.equal(q.tones.length,count);assert.equal(q.fixed.length,refs);f.setTime(g.timeline.answerAt);
            const wrongFixed={...q.target,[q.fixed[0]]:q.target[q.fixed[0]]+1};assert.equal(await f.flush(clients[0].submit(wrongFixed,token,'fixed')),false);assert.equal(await f.flush(clients[0].submit(Object.values(q.target),token,'old-array')),false);assert.equal(await f.flush(clients[0].submit({...q.target,score:100},token,'score')),false);
            const answers=clients.map((_,i)=>{if(round===3)return Pitches.initialAnswer(q,g.config.pitch.initialHz);const a={...q.target};if(round===2&&i===n-1){const id=q.tones.find(id=>!q.fixed.includes(id));a[id]=Pitch.centsToHz(Math.round(Pitch.hzToCents(a[id]))+(a[id]>600?-75:75));}return a;});
            if(round===1)clients[1].loseAck();assert((await f.flush(Promise.all(clients.map((client,i)=>client.submit(answers[i],token,'melody-'+round+'-'+i))))).every(Boolean));f.setTime(g.timeline.deadline);await f.flush(Promise.all(clients.map(client=>client.settle(token))));
            for(const row of f.game().lastResult.rows){const accepted=f.game().submissions[row.id];const grade=Pitches.grade(q,accepted.answer,g.config.pitch.scoring,q.parameters.generation);assert.equal(row.scoreUnits,Rules.scoreToUnits(grade.score));assert.equal(Object.keys(row.pitchErrors).length,count-refs);}
            assert.deepEqual(f.game().config,config);assert.deepEqual(f.game().variantState,variationState);assert.equal(f.game().difficultyState.historyByType.pitch.at(-1).scores.length,n);const hp=clone(f.game().hpUnits);await f.flush(clients[0].settle(token));assert.deepEqual(f.game().hpUnits,hp);if(round<3){f.setTime(f.game().resultsUntil);await f.flush(Promise.all(clients.map(client=>client.advance(token))));assert.equal(f.game().round,round+1);}
        }
        console.log('PASS: '+n+' humans, '+count+' tones/'+refs+' references: keyed frequencies, locked IDs, lost-ack receipts, canonical audio budget/custom scoring, local/online RMS and atomic HP/history/advance.');
    }
    for (const n of [2,8]) for (const variant of Colors.variants) {
        const weights=Object.fromEntries(Colors.variants.map(id=>[id,id===variant?1:0])), f=fixture({selectionVersion:3,categoryMode:'color',maxRounds:3,color:{variantSelectionVersion:1,weights:{easy:weights,hard:weights},multiScoring:{curve:{tolerance:0.24,width:0.1}}}}), clients=await f.setup(n);await f.start();
        const frozen=clone(f.game().config);
        for(let round=1;round<=3;round++) {
            const game=clone(f.game()),token=Match.token(game),perfect=Colors.targetAnswer(game.question),state=clone(game.variantState);assert.equal(game.question.variant,variant);f.setTime(game.timeline.answerAt);
            assert.equal(await f.flush(clients[0].submit([1,2,3],token,'wrong-rgb')),false);assert.equal(await f.flush(clients[0].submit({...perfect,score:100},token,'wrong-score')),false);
            const answers=clients.map((_,i)=>i===n-1&&round===2?{...perfect,[variant==='single'?'h':'a']:Colors.wrap(perfect[variant==='single'?'h':'a']+45)}:perfect);
            if(round===1)clients[1].loseAck();assert((await f.flush(Promise.all(clients.map((client,i)=>client.submit(answers[i],token,'color-'+round+'-'+i))))).every(Boolean));
            f.setTime(game.timeline.deadline);await f.flush(Promise.all(clients.map(client=>client.settle(token))));
            for(let i=0;i<n;i++){const id=f.game().seatOrder[i],row=f.game().lastResult.rows.find(row=>row.id===id);assert.equal(row.scoreUnits,Rules.scoreToUnits(Colors.grade(game.question,answers[i],game.config.color,game.config.scoring).score));}
            assert.deepEqual(f.game().config,frozen);assert.deepEqual(f.game().variantState,state);assert.equal(f.game().difficultyState.historyByType.color.at(-1).scores.length,n);const hp=clone(f.game().hpUnits);await f.flush(clients[0].settle(token));assert.deepEqual(f.game().hpUnits,hp);
            if(round<3){f.setTime(f.game().resultsUntil);await f.flush(Promise.all(clients.map(client=>client.advance(token))));assert.equal(f.game().round,round+1);}
        }
        console.log('PASS: '+n+' '+variant+' humans: versioned decimal/keyed answers, lost-ack receipts, perceptual local/online scoring, frozen parameters and once-only HP/history/advance.');
    }
    for (const n of [2, 8]) for (const variant of ['multi2', 'multi3']) {
        const weights = Object.fromEntries(['single', 'multi2', 'multi3'].map(id => [id, id === variant ? 1 : 0]));
        const f = fixture({ selectionVersion: 3, categoryMode: 'quantity', maxRounds: 3, quantity: { variantSelectionVersion: 1, multi: { weights: { easy: weights, hard: weights }, scoring: { tolerance: 0.4, exponent: 2 } } } }), clients = await f.setup(n), host = clients[0]; await f.start();
        for (let round = 1; round <= 3; round++) {
            const game = clone(f.game()), token = Match.token(game), frozenConfig = clone(game.config); assert.equal(game.question.variant, variant); assert.equal(game.protocolVersion, Match.version);
            f.setTime(game.timeline.answerAt); assert.equal(await f.flush(host.submit([1, 2, 3], token, 'array')), false); assert.equal(await f.flush(host.submit({ ...game.question.target, score: 100 }, token, 'score')), false);
            const accepted = await f.flush(Promise.all(clients.map((c, i) => c.submit(round === 2 && i === n - 1 ? Object.fromEntries(game.question.groups.map(group => [group.id, 0])) : game.question.target, token, 'groups-' + round + '-' + i)))); assert(accepted.every(Boolean));
            f.setTime(game.timeline.deadline); const settled = await f.flush(Promise.all(clients.map(c => c.settle(token)))); assert.equal(settled.filter(Boolean).length, 1);
            for (const row of f.game().lastResult.rows) assert.equal(row.scoreUnits, Rules.scoreToUnits(Groups.grade(game.question, f.game().submissions[row.id].answer, game.config.quantity.multi.scoring, game.question.parameters.generation).score));
            assert(f.game().lastResult.rows.every(row => !row.missing)); assert.equal(f.game().difficultyState.historyByType.quantity.at(-1).scores.length, n); assert.deepEqual(f.game().config, frozenConfig);
            const state = clone(f.game().variantState); assert.equal(await f.flush(host.settle(token)), false); assert.deepEqual(f.game().variantState, state);
            if (round < 3) { f.setTime(f.game().resultsUntil); const advanced = await f.flush(Promise.all(clients.map(c => c.advance(token)))); assert.equal(advanced.filter(Boolean).length, 1); }
        }
        console.log(`PASS: ${n} ${variant} humans: independent keyed receipts, strict answer validation, valid all-zero maps, custom frozen scoring, one Quantity history and atomic settlement/advance.`);
    }
    for (const n of [2, 8]) {
        const f = fixture({ selectionVersion: 3, categoryMode: 'weighted', categoryWeights: { color: 2, quantity: 2, pitch: 2 }, maxRounds: 12 }), clients = await f.setup(n), host = clients[0];
        await f.flush(Promise.all(clients.map(c => c.acknowledgeAudio(true, f.get().revision)))); await f.start();
        const counts = { color: 0, quantity: 0, pitch: 0 };
        for (let round = 1; round <= 12; round++) {
            const g = clone(f.game()), identity = Match.token(g), frozenQuestion = clone(g.question); counts[g.categoryId]++;
            assert.equal(g.protocolVersion, Match.version); assert(g.question.difficulty.effective >= 1 && g.question.difficulty.effective <= 10);
            assert.equal(await f.flush(host.configure({ categoryWeights: { pitch: 0 } })), false);
            f.setTime(g.timeline.answerAt); const accepted = await f.flush(Promise.all(clients.map((c, i) => c.submit((g.question.type === 'color' && g.question.version === 2 ? require('../js/games/impressions-color-variants.js').targetAnswer(g.question) : g.question.target), identity, 'weighted-' + round + '-' + i)))); assert(accepted.every(Boolean));
            f.setTime(g.timeline.deadline); const settled = await f.flush(Promise.all(clients.map(c => c.settle(identity)))); assert.equal(settled.filter(Boolean).length, 1);
            assert.deepEqual(f.game().question, frozenQuestion); assert.deepEqual(f.game().selectionState, g.selectionState); assert.equal(f.game().difficultyState.historyByType[g.categoryId].at(-1).scores.length, n);
            const frozenState = clone(f.game().difficultyState); assert.equal(await f.flush(host.settle(identity)), false); assert.deepEqual(f.game().difficultyState, frozenState);
            if (round < 12) { f.setTime(f.game().resultsUntil); const advanced = await f.flush(Promise.all(clients.map(c => c.advance(identity)))); assert.equal(advanced.filter(Boolean).length, 1); }
        }
        assert.deepEqual(counts, { color: 4, quantity: 4, pitch: 4 }); assert.deepEqual(f.game().difficultyState.difficultyByType, { color: 6, quantity: 6, pitch: 6 });
        await f.flush(host.backToLobby()); await f.flush(host.configure({ categoryWeights: { color: 0, quantity: 0, pitch: 0 } })); assert.equal(host.canStart(), false);
        await f.flush(host.configure({ categoryWeights: { color: 4, quantity: 0, pitch: 0 }, adaptive: { initial: 7 } })); await f.start();
        assert.equal(f.game().categoryId, 'color'); assert.equal(f.game().difficultyState.difficultyByType.color, 7); assert.equal(f.game().selectionState.draw, 1);
        console.log(`PASS: ${n} weighted humans: twelve rounds, all three independent histories, exact bag ratios, concurrent answers, atomic HP/adaptation/advance, frozen question parameters, all-Off gate and Pitch-Off rematch without sound readiness.`);
    }
    {
        const f = fixture({ selectionVersion: 3, categoryMode: 'weighted', categoryWeights: { color: 0, quantity: 4, pitch: 0 }, quantity: { variantSelectionVersion: 0 }, maxRounds: 3, adaptive: { initial: 2, jitter: 0 } }), [a, b] = await f.setup(2); await f.start();
        for (let round = 1; round <= 3; round++) { const g = clone(f.game()); f.setTime(g.timeline.answerAt); assert.equal(Quantity.grade(g.question.target, 220).score, 0); await f.flush(Promise.all([a.submit(g.question.target, Match.token(g), 'perfect-' + round), b.submit(220, Match.token(g), 'zero-' + round)])); f.setTime(g.timeline.deadline); await f.flush(a.settle(Match.token(g))); assert.deepEqual(f.game().difficultyState.historyByType.quantity.at(-1).scores, [100, 0]); if (round < 3) { f.setTime(f.game().resultsUntil); await f.flush(a.advance(Match.token(g))); } }
        assert.equal(f.game().difficultyState.difficultyByType.quantity, 1.5); console.log('PASS: accepted true-zero scores participate in robust adaptation; Pitch-Off needs no audio.');
    }
    for (const n of [2, 8]) {
        const f = fixture({ categoryMode: 'pitch', maxRounds: 2 }), clients = await f.setup(n), host = clients[0];
        assert.equal(host.canStart(), false); assert.equal(await f.flush(clients[1].ready()), false, 'Pitch Ready requires sound acknowledgement');
        const revision = f.get().revision;
        await f.flush(Promise.all(clients.map(c => c.acknowledgeAudio(true, revision))));
        await f.flush(host.configure({ startingHp: 501 })); assert.equal(host.canStart(), false, 'Setting changes invalidate audio acknowledgements');
        await f.flush(Promise.all(clients.map(c => c.acknowledgeAudio(true, f.get().revision)))); await f.start();
        for (let round = 1; round <= 2; round++) {
            const g = clone(f.game()), token = Match.token(g); assert.equal(g.categoryId, 'pitch');
            assert.equal(g.timeline.answerAt - g.timeline.memorizeAt, 8000); assert.equal(g.timeline.deadline - g.timeline.answerAt, 35000);
            assert.equal(await f.flush(host.configure({ pitch: { scoring: { tolerance: 999 } } })), false);
            f.setTime(g.timeline.answerAt);
            const submitted = await f.flush(Promise.all(clients.map((c, i) => i === n - 1 && round === 2 ? false : c.submit(g.question.target, token, 'pitch-' + round + '-' + i))));
            assert.equal(submitted.filter(Boolean).length, round === 2 ? n - 1 : n);
            f.setTime(g.timeline.deadline); const settled = await f.flush(Promise.all(clients.map(c => c.settle(token)))); assert.equal(settled.filter(Boolean).length, 1);
            for (const row of f.game().lastResult.rows) { const accepted = f.game().submissions[row.id]; assert.equal(row.scoreUnits, accepted ? Rules.scoreToUnits(Pitch.grade(g.question.target, accepted.answer, g.config.pitch.scoring, g.config.pitch.generation).score) : 0); }
            assert.equal(await f.flush(host.submit(g.question.target, token, 'late-pitch')), false);
            if (round === 1) { f.setTime(f.game().resultsUntil); await f.flush(Promise.all(clients.map(c => c.advance(token)))); assert.equal(f.game().round, 2); }
        }
        assert.equal(f.game().status, 'over'); await f.flush(host.backToLobby()); assert.equal(host.canStart(), false);
        await f.flush(host.configure({ categoryMode: 'quantity' })); await f.start(); assert.equal(f.game().categoryId, 'quantity');
        console.log(`PASS: ${n} Pitch participants: revision-bound sound readiness, category timing, concurrent arrays, missing/late answers, canonical RMS, once-only HP and replay without an audio gate for Quantity.`);
    }
    {
        const f = fixture({ selectionVersion: 2, categoryMode: 'mixed', maxRounds: 6 }), clients = await f.setup(2);
        await f.flush(Promise.all(clients.map(c => c.acknowledgeAudio(true, f.get().revision)))); await f.start();
        for (let round = 1; round <= 6; round++) {
            const g = clone(f.game()); assert.equal(g.categoryId, ['color', 'quantity', 'pitch'][(round - 1) % 3]);
            assert.equal(g.timeline.answerAt - g.timeline.memorizeAt, g.categoryId === 'pitch' ? 8000 : 4000);
            f.setTime(g.timeline.answerAt); await f.flush(Promise.all(clients.map((c, i) => c.submit(g.question.target, Match.token(g), 'cycle-' + round + '-' + i))));
            f.setTime(g.timeline.deadline); await f.flush(Promise.all(clients.map(c => c.settle(Match.token(g)))));
            assert(f.game().lastResult.rows.every(row => row.scoreUnits === 100000 && row.damageUnits === 0));
            if (round < 6) { f.setTime(f.game().resultsUntil); await f.flush(clients[0].advance(Match.token(g))); }
        }
        assert.equal(f.game().winners.length, 2); console.log('PASS: six-round Color/Quantity/Pitch cycle freezes effective timing and preserves common settlement.');
    }
    for (const n of [2, 4, 8]) {
        const f = fixture({ categoryMode: 'mixed', selectionVersion: 1, maxRounds: 4 }), clients = await f.setup(n), host = clients[0]; await f.start();
        assert.equal(await f.flush(host.configure({ categoryMode: 'quantity' })), false);
        for (let round = 1; round <= 4; round++) {
            const g = clone(f.game()), token = Match.token(g); assert.equal(g.categoryId, round % 2 ? 'color' : 'quantity');
            f.setTime(g.timeline.answerAt);
            assert.equal(await f.flush(clients[1].submit(g.categoryId === 'quantity' ? [0, 0, 0] : 0, token, 'wrong-type')), false);
            const replies = await f.flush(Promise.all(clients.map((client, i) => {
                if (round === 4 && i === n - 1) return Promise.resolve(false);
                const answer = g.categoryId === 'color' ? g.question.target : i === n - 1 && round === 2 ? 0 : g.question.target + i * 5;
                return client.submit(answer, token, 'mixed-' + round + '-' + i);
            })));
            assert.equal(replies.filter(Boolean).length, round === 4 ? n - 1 : n);
            assert.equal(await f.flush(host.settle(token)), round < 4);
            f.setTime(g.timeline.deadline);
            const settled = await f.flush(Promise.all(clients.map(c => c.settle(token)))); assert.equal(settled.filter(Boolean).length, round < 4 ? 0 : 1);
            assert.equal(f.game().lastResult.categoryId, g.categoryId);
            if (g.categoryId === 'quantity') for (const row of f.game().lastResult.rows) {
                const submission = f.game().submissions[row.id];
                assert.equal(row.scoreUnits, submission ? Rules.scoreToUnits(Quantity.grade(g.question.target, submission.answer, g.config.quantity.scoring, g.config.quantity.generation.poolSize).score) : 0);
                assert.equal(row.missing, !submission);
            }
            assert.equal(await f.flush(host.settle(token)), false);
            if (round < 4) {
                f.setTime(f.game().resultsUntil);
                const advanced = await f.flush(Promise.all(clients.map(c => c.advance(token)))); assert.equal(advanced.filter(Boolean).length, 1);
                assert.equal(await f.flush(host.submit(0, token, 'stale')), false);
            }
        }
        assert.equal(f.game().status, 'over'); assert.equal(f.game().round, 4); assert.deepEqual(f.game().winners, [host.playerId()]);
        await f.flush(host.backToLobby()); await f.flush(host.configure({ categoryMode: 'quantity' })); await f.start();
        assert.equal(f.game().categoryId, 'quantity'); assert.equal(f.game().config.categoryMode, 'quantity');
        console.log(`PASS: ${n} mixed participants: four alternating rounds, concurrent scalar/zero answers, type guards, missing answers, atomic settlement, frozen category mode and Quantity-only replay.`);
    }
    for (const n of [2, 4, 8]) {
        const f = fixture({ maxRounds: 2 }); const clients = await f.setup(n), [host, guest] = clients;
        const staleRevision = f.get().revision;
        await f.flush(guest.ready()); await f.flush(host.configure({ startingHp: 501 }));
        assert.deepEqual(f.get().ready, {}); assert.equal(await f.flush(guest.ready(true, staleRevision)), false);
        await f.flush(host.configure({ startingHp: 500 })); await f.start();
        const first = clone(f.game());
        assert(first.matchId); assert.equal(first.config.maxRounds, 2); assert.equal(first.protocolVersion, Match.version);
        assert.equal(new Set(Object.values(first.owners)).size, n, 'Same-account tabs have independent ownership');
        assert.equal(await f.flush(host.configure({ maxRounds: 1 })), false);
        assert.equal(await f.flush(host.rename('Too late')), false);
        await assert.rejects(f.make().join('MEM1'), e => e.code === 'room/started');
        f.clients.pop();
        f.setTime(first.timeline.answerAt);
        const answers = await f.flush(Promise.all(clients.map((c, i) => c.submit(first.question.target, Match.token(first), 'first-' + i))));
        assert(answers.every(Boolean)); assert.equal(Object.keys(f.game().submissions).length, n);
        assert.equal(await f.flush(host.submit(first.question.target, Match.token(first), 'first-0')), true, 'Duplicate request resolves the same receipt');
        assert.equal(await f.flush(host.submit([0, 0, 0], Match.token(first), 'first-0')), false);
        assert.equal(await f.flush(host.submit(first.question.target, Match.token(first), 'replacement')), false);
        assert.equal(await f.flush(guest.submit([0, 0, 256], Match.token(first), 'invalid')), false);
        assert.equal(await f.flush(host.settle()), true, 'v13 settles once every required answer is committed');
        f.setTime(first.timeline.deadline);
        const settlements = await f.flush(Promise.all(clients.map(c => c.settle())));
        assert.equal(settlements.filter(Boolean).length, 0); assert.equal(f.game().settledRound, 1);
        assert(f.game().lastResult.rows.every(r => r.top && r.damageUnits === 0));
        const settled = clone(f.game());
        assert.equal(await f.flush(host.settle(Match.token(first))), false); assert.deepEqual(f.game().hpUnits, settled.hpUnits);
        f.setTime(settled.resultsUntil - 1); assert.equal(await f.flush(host.advance()), false);
        f.setTime(settled.resultsUntil);
        const advanced = await f.flush(Promise.all(clients.map(c => c.advance(Match.token(settled)))));
        assert.equal(advanced.filter(Boolean).length, 1); assert.equal(f.game().round, 2);
        const second = clone(f.game()); f.setTime(second.timeline.answerAt);
        assert.equal(await f.flush(host.submit(first.question.target, Match.token(first), 'old')), false);
        await f.flush(Promise.all(clients.map((c, i) => c.submit(i === 0 ? second.question.target : [0, 0, 0], Match.token(second), 'second-' + i))));
        f.setTime(second.timeline.deadline); await f.flush(Promise.all(clients.map(c => c.settle())));
        assert.equal(f.game().status, 'over'); assert.equal(f.game().round, 2); assert.equal(f.game().endReason, 'round-cap');
        assert.deepEqual(f.game().winners, [host.playerId()]);
        assert.equal(await f.flush(host.advance()), false);
        const previousId = f.game().matchId;
        assert.equal(await f.flush(host.backToLobby()), true); assert.equal(f.get().phase, 'lobby'); assert.deepEqual(f.get().ready, {});
        assert.equal(f.get().participants[host.playerId()].name, 'Host');
        await f.start(); assert.notEqual(f.game().matchId, previousId); assert(Object.values(f.game().hpUnits).every(hp => hp === 500000));
        assert.deepEqual(f.errors, []);
        console.log(`PASS: ${n} concurrent participants, revision readiness, frozen settings, independent receipts, competing settlement/advance, exact round cap and rematch.`);
    }
    {
        const f = fixture({ capacity: 2, maxRounds: 1 }); const [a, b] = await f.setup(2);
        await assert.rejects(f.make().join('MEM1'), e => e.code === 'room/full'); f.clients.pop();
        await f.start(); const g = clone(f.game()); f.setTime(g.timeline.answerAt);
        a.loseAck(); assert.equal(await f.flush(a.submit(g.question.target, Match.token(g), 'lost')), true, 'Lost acknowledgement resolves a committed receipt');
        await f.flush(b.submit(g.question.target, Match.token(g), 'b'));
        f.setTime(g.timeline.deadline); await f.flush(a.settle());
        assert.deepEqual(f.game().winners, [a.playerId(), b.playerId()], 'Exact HP tie shares victory at the cap');
        assert.equal(await f.flush(a.submit(g.question.target, Match.token(g), 'lost')), true, 'Receipt survives final settlement');
    }
    {
        const f = fixture({ startingHp: 1, maxRounds: 3 }); const [a, b, c] = await f.setup(3); await f.start();
        let g = clone(f.game()); f.setTime(g.timeline.answerAt);
        await f.flush(Promise.all([a.submit(g.question.target, Match.token(g), 'a'), b.submit(g.question.target, Match.token(g), 'b')]));
        f.setTime(g.timeline.deadline); await f.flush(c.settle());
        assert.equal(f.game().hpUnits[c.playerId()], 0); assert(f.get().players[c.service.currentPlayer().uid]);
        f.setTime(f.game().resultsUntil); await f.flush(c.advance()); g = clone(f.game()); f.setTime(g.timeline.answerAt);
        assert.equal(await f.flush(c.submit(g.question.target, Match.token(g), 'eliminated')), false);
        await f.flush(a.submit(g.question.target, Match.token(g), 'a2')); f.setTime(g.timeline.deadline); await f.flush(c.settle());
        assert.equal(f.game().status, 'over'); assert.equal(f.game().endReason, 'last-survivor'); assert.deepEqual(f.game().winners, [a.playerId()]);
    }
    {
        const f = fixture(); const [a, b, c, d] = await f.setup(4); await f.start();
        const g = clone(f.game()); f.setTime(g.timeline.answerAt);
        const release = a.hold(), pending = a.submit(g.question.target, Match.token(g), 'queued');
        await new Promise(setImmediate); await f.flush(b.submit(g.question.target, Match.token(g), 'b'));
        f.setTime(g.timeline.deadline + 1); release(); assert.equal(await f.flush(pending), false, 'Queued request rechecks the deadline');
        await f.flush(a.leave()); assert.equal(f.get().hostUid, b.service.currentPlayer().uid);
        assert.equal(f.game().status, 'playing'); assert(f.game().withdrawn.includes(a.playerId()));
        assert.equal(f.game().roster[a.playerId()].name, 'Host');
        await f.flush(Promise.all([b.settle(), c.settle(), d.settle()]));
        assert.equal(f.game().settledRound, 1); assert.equal(f.game().lastResult.rows.length, 3);
        await f.flush(b.leave()); await f.flush(c.leave()); assert.equal(f.game().status, 'over'); assert.deepEqual(f.game().winners, [d.playerId()]);
        await f.flush(d.leave()); assert.equal(f.get(), null);
    }
    for (const stage of ['memorize', 'answer', 'results']) {
        const f = fixture({ maxRounds: 2 }); const [a, b] = await f.setup(2); await f.start(); const g = clone(f.game());
        if (stage === 'results') {
            f.setTime(g.timeline.answerAt); await f.flush(b.submit(g.question.target, Match.token(g), 'kept'));
            f.setTime(g.timeline.deadline); await f.flush(a.settle());
        } else f.setTime(stage === 'memorize' ? g.timeline.memorizeAt + 200 : g.timeline.answerAt + 200);
        const before = clone(f.game()), uid = b.service.currentPlayer().uid;
        f.db.disconnectPlayer(uid); await f.db.flush(); assert.equal(b.canControl(), false);
        f.setTime(f.time() + 500); f.db.reconnectPlayer(uid); await f.db.flush(); await f.flush(b.tick()); await f.db.flush();
        assert.equal(b.canControl(), true); assert.equal(f.game().questionId, before.questionId);
        assert.deepEqual(f.game().timeline, before.timeline); assert.deepEqual(f.game().submissions, before.submissions);
        assert.equal(Match.phaseAt(f.game(), f.time()), stage);
    }
    {
        const f = fixture(); const [a, b] = await f.setup(2); await f.start(); const g = clone(f.game());
        f.setTime(g.timeline.answerAt); f.db.disconnectPlayer(a.service.currentPlayer().uid); await f.db.flush();
        f.setTime(f.time() + 15001); await f.flush(b.tick()); await f.db.flush();
        assert.equal(f.get().hostUid, b.service.currentPlayer().uid); assert.equal(f.game().status, 'over');
        assert.deepEqual(f.game().winners, [b.playerId()]); assert.equal(f.game().settledRound, 0, 'Withdrawal ends a hopeless round without inventing damage');
    }
    {
        const f = fixture(); const [a, b] = await f.setup(2); await f.start(); const g = clone(f.game());
        f.setTime(g.timeline.deadline + 100000); assert.equal(f.game().phase, 'active', 'No browser activity means no background coordinator');
        await f.flush(Promise.all([a.tick(), b.tick()])); assert.equal(f.game().settledRound, 1);
        const hp = clone(f.game().hpUnits); await f.flush(Promise.all([a.tick(), b.tick()])); assert.deepEqual(f.game().hpUnits, hp);
        assert.equal(f.game().phase, 'results'); assert.equal(f.game().resultsUntil, f.time() + Match.defaults.timing.resultsMs);
    }
    console.log('PASS: pure scoring from answers, missing/invalid inputs, fixed-point HP, elimination/spectating, shared winners, owner guards, lost acknowledgements, late queues, host migration, all departures, three-phase reconnect and suspended/resumed coordination.');
})().catch(error => { console.error(error); process.exitCode = 1; });
