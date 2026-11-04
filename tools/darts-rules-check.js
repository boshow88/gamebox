/** node tools/darts-rules-check.js — pure rules and unmodified throw-physics regression checks. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const R = require('../js/games/darts-rules.js');
const hit = R.hit, miss = hit(0, 0);
// Existing unlimited Standard fixtures remain explicit while V2 defaults are checked below.
const create = (mode = '501', bestOf = 1, players = ['A', 'B']) => R.create({ mode, bestOf,
    cricketVariant: 'standard', ...(mode === '501' || mode === 'cricket' ? { roundLimit: 0 } : {}) }, players, 1000);
const dart = (state, base, mult = 1) => R.throwDart(state, state.active, hit(base, mult), 2000);
function remaining(value, bestOf = 1) { const s = create('501', bestOf); s.scores.A = s.turnStartScore = value; return s; }

// Canonical board identity, ring geometry and bull values.
assert.equal(R.scoreAt(0, 103).label, 'T20');
assert.equal(R.scoreAt(0, 165).label, 'D20');
assert.equal(R.scoreAt(0, 80).label, 'S20');
assert.equal(R.scoreAt(0, -80).label, 'S3');
assert.equal(R.scoreAt(0, 10).score, 25);
assert.equal(R.scoreAt(0, 0).score, 50);
assert.equal(R.scoreAt(0, 171).miss, true);
assert.equal(R.scoreAt(NaN, 0).miss, true);
let s = create(); const original = JSON.stringify(s);
assert.equal(dart(s, 20, 3).scores.A, 441);
assert.equal(JSON.stringify(s), original, 'Rules do not mutate the input');
assert.equal(R.throwDart(s, 'B', hit(20, 3), 0), null);
for (const [score, base, mult, reason] of [[40, 20, 2, 'checkout'], [50, 25, 2, 'checkout'],
    [20, 20, 1, 'bust'], [60, 20, 3, 'bust'], [40, 13, 3, 'bust'], [20, 20, 3, 'bust']]) {
    const result = dart(remaining(score), base, mult);
    assert.equal(result.lastDart.reason, reason);
    if (reason === 'bust') { assert.equal(result.scores.A, score); assert.equal(result.active, 'B'); assert.equal(result.dart, 0); }
    else { assert.equal(result.status, 'over'); assert.equal(result.winner, 'A'); assert.equal(result.stats.A.darts, 1); }
}
s = remaining(60); s = dart(s, 20); s = dart(s, 20); s = dart(s, 20, 3);
assert.equal(s.scores.A, 60, 'Third-dart bust restores the turn start');
s = remaining(60); s = dart(s, 20); s = dart(s, 20, 2);
assert.equal(s.status, 'over'); assert.equal(s.dart, 2);
s = create(); for (let i = 0; i < 3; i++) s = dart(s, 0, 0);
assert.equal(s.active, 'B'); assert.equal(s.dart, 0); assert.equal(s.round, 2);

// Cricket closing, excess marks, closed targets and point-dependent wins.
for (let mult = 1; mult <= 3; mult++) assert.equal(dart(create('cricket'), 20, mult).marks.A[20], mult);
s = create('cricket'); s.marks.A[20] = 2; s.marks.B[20] = 1; s = dart(s, 20, 3);
assert.equal(s.marks.A[20], 3); assert.equal(s.scores.A, 40);
s.marks.B[20] = 3; s = dart(s, 20, 3); assert.equal(s.scores.A, 40);
s = create('cricket'); s = dart(s, 25); s = dart(s, 25, 2); assert.equal(s.marks.A[25], 3);
s = create('cricket'); s = dart(s, 14, 3); assert.equal(s.scores.A, 0);
R.TARGETS.forEach(n => { s.marks.A[n] = 3; }); s.scores.B = 40;
s = dart(s, 20); assert.equal(s.status, 'playing'); assert.equal(s.scores.A, 20);
s = dart(s, 20); assert.equal(s.winner, 'A'); assert.equal(s.scores.A, 40);
s = create('cricket'); R.TARGETS.forEach(n => { s.marks.A[n] = 3; }); s.marks.A[25] = 2;
s = dart(s, 25, 2); assert.equal(s.winner, 'A'); assert.equal(s.scores.A, 25);

// Exactly 24 darts each; equal turns even if the first player leads.
s = create('countup', 1, ['A']);
for (let i = 0; i < 24; i++) { assert.equal(s.status, 'playing'); s = dart(s, 20, 3); }
assert.equal(s.status, 'over'); assert.equal(s.scores.A, 1440); assert.equal(s.stats.A.darts, 24);
assert.equal(s.stats.A.bestRound, 180); assert.equal(s.turns.A, 8);
assert.equal(R.throwDart(s, 'A', hit(20, 3)), null);
s = create('countup');
for (let i = 0; i < 48; i++) s = dart(s, s.active === 'A' ? 25 : 20, s.active === 'A' ? 2 : 3);
assert.equal(s.winner, 'B'); assert.equal(s.scores.A, 1200); assert.equal(s.scores.B, 1440);
s = create('countup'); for (let i = 0; i < 48; i++) s = dart(s, 0, 0);
assert.equal(s.status, 'playing'); assert.equal(s.phase, 'cork'); assert.deepEqual(s.wins, { A: 0, B: 0 });
assert.deepEqual(s.corkPlayers, ['A', 'B']); assert.equal(s.corkRound, 1);
const corkFirst = s.active;
s = R.throwDart(s, s.active, hit(25, 1), 4000, { x: 10, y: 0 });
s = R.throwDart(s, s.active, hit(25, 2), 5000, { x: 2, y: 0 });
assert.equal(s.status, 'over'); assert.notEqual(s.winner, corkFirst); assert.equal(s.leg, 1);

// A timeout retains valid darts and counts unused darts as forfeited.
s = create('countup'); s = dart(s, 20, 3); s = R.timeout(s, 62000);
assert.equal(s.scores.A, 60); assert.equal(s.turns.A, 1); assert.equal(s.active, 'B');
for (let i = 0; i < 15; i++) s = R.timeout(s, 70000 + i * 60000);
assert.equal(s.winner, 'A'); assert.equal(s.stats.A.darts, 1);

// BO3 alternates starters and ends immediately on a second win.
s = dart(remaining(40, 3), 20, 2);
assert.equal(s.status, 'between'); assert.equal(s.wins.A, 1);
s = R.nextLeg(s, 5000); assert.equal(s.active, 'B'); assert.equal(s.scores.A, 501); assert.equal(s.scores.B, 501);
s.scores.B = s.turnStartScore = 40; s = dart(s, 20, 2);
assert.equal(s.status, 'between'); assert.deepEqual(s.wins, { A: 1, B: 1 });
s = R.nextLeg(s, 6000); assert.equal(s.active, 'A'); s.scores.A = s.turnStartScore = 50;
s = dart(s, 25, 2); assert.equal(s.status, 'over'); assert.equal(s.winner, 'A'); assert.equal(s.wins.A, 2);
assert.equal(R.nextLeg(s), null);

// Four players rotate turns/starters, preserve per-turn darts and all finish Count-Up.
const four = ['A', 'B', 'C', 'D'];
s = create('501', 3, four);
for (const uid of four) {
    assert.equal(s.active, uid);
    for (let i = 0; i < 3; i++) s = dart(s, 20);
    assert.equal(s.lastTurn.darts.length, 3); assert.equal(s.lastTurn.points, 60);
}
assert.equal(s.active, 'A');
s = create('countup', 1, four);
for (let i = 0; i < 96; i++) s = dart(s, s.active === 'D' ? 20 : 1, 3);
assert.equal(s.winner, 'D'); assert(four.every(uid => s.stats[uid].darts === 24 && s.turns[uid] === 8));
s = create('501', 3, four);
for (let leg = 0; leg < 4; leg++) {
    assert.equal(s.active, four[leg]); s.scores[s.active] = s.turnStartScore = 40;
    s = dart(s, 20, 2); assert.equal(s.status, 'between'); s = R.nextLeg(s, 3000 + leg);
}
assert.equal(s.active, 'A');
s = create('cricket', 1, four); s.marks.A[20] = 2; s.marks.B[20] = s.marks.C[20] = 3;
s = dart(s, 20, 3); assert.equal(s.scores.A, 40, 'One open opponent is sufficient; points are awarded once');
s.marks.D[20] = 3; s = dart(s, 20, 3); assert.equal(s.scores.A, 40, 'All opponents closed prevents scoring');
R.TARGETS.forEach(n => { s.marks.A[n] = 3; }); s.scores.D = 100;
s = dart(s, 19, 3); assert.equal(s.status, 'playing', 'Must catch every opponent');
s = R.withdraw(s, 'D', 5000); assert.equal(s.winner, 'A', 'Departed high score no longer blocks a Cricket winner');
s = create('501', 3, four); s = dart(s, 20); s = R.withdraw(s, 'A', 4000);
assert.equal(s.status, 'playing'); assert.equal(s.active, 'B'); assert.deepEqual(s.withdrawn, ['A']);
assert.equal(R.throwDart(s, 'A', hit(20, 3)), null);
s = R.withdraw(s, 'C', 5000); assert.equal(s.active, 'B');
s.scores.B = s.turnStartScore = 40; s = dart(s, 20, 2); s = R.nextLeg(s, 6000);
assert.equal(s.active, 'B', 'A departed starter is skipped');
s = R.withdraw(s, 'B', 7000); assert.equal(s.winner, 'D'); assert.equal(s.endReason, 'left');
s = create('countup', 1, four);
for (let i = 0; i < 8; i++) for (const uid of four) {
    if (i === 7 && uid === 'D') break;
    assert.equal(s.active, uid); s = R.timeout(s, 6000 + i);
}
s = R.withdraw(s, 'D', 8000); assert.equal(s.status, 'playing'); assert.equal(s.phase, 'cork');
assert.deepEqual(s.corkPlayers, ['A', 'B', 'C']);
assert.equal(R.create({}, four, 0, 3).active, 'D');
assert.throws(() => create('501', 1, ['A', 'B', 'C', 'D', 'E']));

// History is updated once per turn, retains prior legs and records effective scoring.
s = remaining(60, 3); s = dart(s, 20); s = dart(s, 20);
assert.equal(s.history.length, 1); assert.equal(s.history[0].darts.length, 2); assert.equal(s.history[0].finished, false);
s = dart(s, 20, 3);
assert.equal(s.history.length, 1); assert.equal(s.history[0].reason, 'bust'); assert.equal(s.history[0].points, 0);
assert.equal(s.history[0].score, 60); assert.equal(s.history[0].darts.length, 3); assert.equal(s.history[0].finished, true);
s.scores.B = s.turnStartScore = 40; s = dart(s, 20, 2);
assert.equal(s.history[1].reason, 'checkout'); assert.equal(s.history[1].score, 0);
s = R.nextLeg(s, 9000); assert.equal(s.history.length, 2); s = dart(s, 1);
assert.equal(s.history[2].leg, 2); assert.equal(s.history[2].round, 1);
s = create('cricket', 1, four); s = dart(s, 20, 3);
assert.equal(s.history[0].points, 0, 'Cricket closing marks do not duplicate raw board points');
s = dart(s, 20, 3); assert.equal(s.history[0].points, 60); assert.equal(s.history[0].score, 60);
s = R.timeout(s, 9000); assert.equal(s.history[0].reason, 'timeout'); assert.equal(s.history[0].points, 60);
s = R.withdraw(s, s.active, 10000); assert.equal(s.history[1].reason, 'left'); assert.equal(s.history[1].darts.length, 0);
s = create('501');
for (let i = 0; i < R.HISTORY_LIMIT + 2; i++) s = R.timeout(s, i * 60000);
assert.equal(s.history.length, R.HISTORY_LIMIT); assert.equal(s.historyDropped, 2);
assert.equal(s.history[0].turn, 3);
assert.equal(create().history.length, 0, 'A fresh match clears history');

// V2 configuration is explicit, defensive, and frozen into every match.
assert.equal(R.options({}).mode, 'practice'); assert.equal(R.options({}).turnMs, 0);
assert.equal(R.options({ mode: '501' }).outRule, 'double');
assert.equal(R.options({ mode: '501' }).roundLimit, 15);
assert.equal(R.options({ mode: 'cricket' }).roundLimit, 15);
assert.equal(R.options({ mode: 'countup' }).roundLimit, 8);
assert.equal(R.options({ mode: 'practice', roundLimit: 10 }).roundLimit, 0);
assert.equal(R.options({ mode: 'countup', roundLimit: 0 }).roundLimit, 8);
assert.equal(R.options({ mode: '501', bestOf: 3 }).legsToWin, 2);
assert.equal(R.options({ mode: '501', legsToWin: 3 }).legsToWin, 3);
assert.equal(R.options({ mode: '501', turnMs: 0 }).turnMs, 0);
assert.equal(R.options({ mode: '501', inRule: 'bad', outRule: 'bad', bullMode: 'bad', turnMs: -1 }).turnMs, 60000);
assert.equal(R.options({ mode: 'cricket' }, 2).cricketVariant, 'standard');
assert.equal(R.options({ mode: 'cricket' }, 4).cricketVariant, 'cutthroat');
assert.equal(R.options({ mode: 'cricket', cricketVariant: 'standard' }, 4).cricketVariant, 'standard');
for (const mode of ['practice', 'countup', '501', 'cricket']) {
    const min = ['501', 'cricket'].includes(mode) ? 2 : 1;
    for (let n = 0; n <= 5; n++) assert.equal(R.eligibility({ mode }, n).allowed, n >= min && n <= 4);
}
let configuration = { mode: '501', outRule: 'open', roundLimit: 10, legsToWin: 3 };
s = R.create(configuration, four, 1000); configuration.outRule = 'double';
assert.equal(dart(s, 20).outRule, 'open', 'Lobby object changes cannot alter active rules');

function configured501(input = {}, score = 501) {
    const state = R.create({ mode: '501', ...input }, ['A', 'B'], 1000);
    state.scores.A = state.turnStartScore = score; return state;
}
for (const [outRule, score, base, mult, reason] of [
    ['open', 20, 20, 1, 'checkout'], ['open', 1, 1, 1, 'checkout'],
    ['double', 20, 20, 1, 'bust'], ['double', 20, 10, 2, 'checkout'],
    ['double', 50, 25, 2, 'checkout'], ['master', 60, 20, 3, 'checkout'],
    ['master', 40, 20, 2, 'checkout'], ['master', 20, 20, 1, 'bust'],
    ['master', 25, 25, 1, 'checkout'],
]) assert.equal(dart(configured501({ outRule }, score), base, mult).lastDart.reason, reason);
s = dart(configured501({ outRule: 'open' }, 2), 1);
assert.equal(s.scores.A, 1); assert.equal(s.active, 'A');
for (const outRule of ['double', 'master']) {
    s = dart(configured501({ outRule }, 2), 1);
    assert.equal(s.scores.A, 2); assert.equal(s.active, 'B'); assert.equal(s.lastDart.reason, 'bust');
}
s = configured501({ inRule: 'double' }); s = dart(s, 20);
assert.equal(s.scores.A, 501); assert.equal(s.entered.A, false); assert.equal(s.dart, 1); assert.equal(s.turnPoints, 0);
s = dart(s, 20, 2); assert.equal(s.scores.A, 461); assert.equal(s.entered.A, true); assert.equal(s.turnPoints, 40);
s = dart(s, 20); assert.equal(s.scores.A, 441); assert.equal(s.active, 'B');
s = R.timeout(s, 3000); s = dart(s, 20); assert.equal(s.scores.A, 421, 'Once opened, singles score on later turns');
s = configured501({ inRule: 'double', outRule: 'double' }, 100);
s = dart(s, 20, 2); s = dart(s, 20, 3);
assert.equal(s.scores.A, 100); assert.equal(s.entered.A, false, 'Bust restores a newly opened entry state');
assert.equal(s.history[0].points, 0); assert.equal(s.history[0].darts.length, 2);
s = configured501({ inRule: 'double' }, 100); s.entered.A = s.turnStartEntered = true;
s = dart(s, 20, 2); s = dart(s, 20, 3);
assert.equal(s.entered.A, true, 'Bust preserves entry completed before this turn');
for (const [base, mult] of [[20, 2], [20, 3], [25, 1], [25, 2]]) {
    s = dart(configured501({ inRule: 'master' }), base, mult); assert.equal(s.entered.A, true);
}
s = dart(configured501({ inRule: 'master' }), 20); assert.equal(s.entered.A, false);

// Bull points are separate from physical In/Out qualification and Cricket marks.
assert.equal(R.scoreResult({ mode: '501', bullMode: '50-50' }, hit(25, 1)).score, 50);
assert.equal(R.scoreResult({ mode: '501', bullMode: '50-50' }, hit(25, 1)).region, 'bull');
assert.equal(R.scoreResult({ mode: '501', bullMode: '50-50' }, hit(25, 1)).mult, 1);
s = dart(configured501({ bullMode: '50-50', outRule: 'open' }, 50), 25);
assert.equal(s.winner, 'A'); assert.equal(s.lastDart.result.score, 50); assert.equal(s.history[0].darts[0].region, 'bull');
s = dart(configured501({ bullMode: '50-50', outRule: 'master' }, 50), 25); assert.equal(s.winner, 'A');
s = dart(configured501({ bullMode: '50-50', outRule: 'double' }, 50), 25);
assert.equal(s.lastDart.reason, 'bust'); assert.equal(s.scores.A, 50);
s = dart(configured501({ bullMode: '50-50', outRule: 'double' }, 50), 25, 2); assert.equal(s.winner, 'A');
s = dart(configured501({ bullMode: '50-50', inRule: 'double' }), 25);
assert.equal(s.scores.A, 501); assert.equal(s.entered.A, false);
s = dart(s, 25, 2); assert.equal(s.scores.A, 451); assert.equal(s.entered.A, true);
s = configured501({ outRule: 'open' });
s = R.throwDart(s, s.active, { ...hit(20, 1), score: 99999 }, 2000);
assert.equal(s.scores.A, 481, 'Client-supplied numeric points never override canonical physical hits');
s = R.create({ mode: 'countup', bullMode: '50-50' }, ['A'], 1000); s = dart(s, 25);
assert.equal(s.scores.A, 50); assert.equal(s.stats.A.points, 50);

// Cut-Throat penalizes each eligible opponent and keeps the thrower's total unchanged.
s = R.create({ mode: 'cricket', cricketVariant: 'cutthroat' }, four, 1000);
s.marks.A[20] = 2; s.marks.C[20] = 3;
s = dart(s, 20, 3);
assert.deepEqual(s.scores, { A: 0, B: 40, C: 0, D: 40 });
assert.equal(s.turnPoints, 40); assert.deepEqual(s.lastDart.penalties, { B: 40, D: 40 });
assert.deepEqual(s.history[0].penalties, { B: 40, D: 40 }); assert.equal(s.history[0].score, 0);
s = dart(s, 20, 3); assert.deepEqual(s.turnPenalties, { B: 100, D: 100 });
s = R.withdraw(s, 'D', 3000); s = dart(s, 20, 3);
assert.equal(s.scores.D, 100, 'Withdrawn opponents receive no further penalties');
assert.equal(s.scores.B, 160); assert.deepEqual(s.lastTurn.penalties, { B: 160, D: 100 });
s = R.create({ mode: 'cricket', cricketVariant: 'cutthroat' }, four, 1000);
R.TARGETS.forEach(n => { s.marks.A[n] = 3; }); s.scores.A = 60; s.scores.C = s.scores.D = 100;
s = dart(s, 20, 3); assert.equal(s.winner, 'A'); assert.equal(s.scores.B, 60);
s = R.create({ mode: 'cricket', cricketVariant: 'cutthroat' }, four, 1000);
R.TARGETS.forEach(n => { s.marks.A[n] = 3; }); s.scores.A = 10; s.scores.C = s.scores.D = 50;
s = dart(s, 0, 0); assert.equal(s.status, 'playing', 'Lowest score must compare every opponent');
s = R.withdraw(s, 'B', 3000); assert.equal(s.winner, 'A', 'Departed lowest opponent no longer blocks a winner');
s = R.create({ mode: 'cricket', cricketVariant: 'cutthroat' }, four, 1000, 3);
R.TARGETS.forEach(n => { s.marks.A[n] = 3; }); s.marks.D[20] = 3;
Object.assign(s.scores, { A: 50, B: 0, C: 100, D: 100 }); s.turnStartScore = 100;
s = dart(s, 20, 3);
assert.equal(s.winner, 'A', 'Penalties can make a closed non-throwing player the unique lowest-score winner');
assert.equal(s.history[0].uid, 'D'); assert.deepEqual(s.lastDart.penalties, { B: 60, C: 60 });
s = R.create({ mode: 'cricket', cricketVariant: 'cutthroat' }, four, 1000, 3);
R.TARGETS.forEach(n => { s.marks.A[n] = s.marks.B[n] = 3; }); s.marks.D[20] = 3;
Object.assign(s.scores, { A: 50, B: 50, C: 0, D: 100 }); s.turnStartScore = 100;
s = dart(s, 20, 3);
assert.equal(s.phase, 'cork'); assert.deepEqual(s.corkPlayers, ['A', 'B']);
assert.equal(s.history[0].phase, 'play'); assert.equal(s.history[0].finished, true);
assert.equal(s.turnDarts.length, 0, 'The normal scoring dart cannot leak into the first Cork turn');
s = R.create({ mode: 'cricket', bullMode: '50-50' }, ['A', 'B'], 1000);
s = dart(s, 25); s = dart(s, 25, 2); assert.equal(s.marks.A[25], 3); assert.equal(s.scores.A, 0);
s = dart(s, 25); assert.equal(s.scores.A, 25, 'Cricket bull marks retain25-point units');
s = R.create({ mode: 'cricket' }, four, 1000); assert.equal(s.cricketVariant, 'cutthroat');
s = R.withdrawMany(s, ['C', 'D'], 3000); assert.equal(s.cricketVariant, 'cutthroat', 'Active variant never changes with population');

// Every contender receives the complete configured number of turns before settlement.
function cappedMatch(config, scores) {
    let state = R.create({ ...config, turnMs: 30000 }, four, 1000);
    Object.assign(state.scores, scores); state.turnStartScore = state.scores[state.active];
    const limit = state.roundLimit;
    for (let turn = 0; turn < four.length * limit; turn++) {
        assert.equal(state.status, 'playing'); assert.equal(state.phase, 'play');
        assert.equal(state.active, four[turn % four.length]);
        state = R.timeout(state, 40000 + turn * 30000);
        if (turn < four.length * limit - 1) assert.equal(state.status, 'playing');
    }
    assert(four.every(id => state.turns[id] === limit)); return state;
}
s = cappedMatch({ mode: '501', roundLimit: 10 }, { A: 100, B: 150, C: 200, D: 250 });
assert.equal(s.winner, 'A'); assert.equal(s.endReason, 'round-limit');
s = cappedMatch({ mode: 'cricket', cricketVariant: 'standard', roundLimit: 15 }, { A: 100, B: 0, C: 0, D: 0 });
assert.equal(s.winner, 'A');
s = cappedMatch({ mode: 'cricket', cricketVariant: 'cutthroat', roundLimit: 10 }, { A: 0, B: 100, C: 200, D: 300 });
assert.equal(s.winner, 'A');
for (const roundLimit of [5, 8, 10, 15]) {
    s = R.create({ mode: 'countup', roundLimit }, ['A', 'B'], 1000);
    for (let i = 0; i < roundLimit * 6; i++) s = dart(s, s.active === 'A' ? 20 : 1);
    assert.equal(s.winner, 'A'); assert.equal(s.stats.A.darts, roundLimit * 3); assert.equal(s.stats.B.darts, roundLimit * 3);
}
s = configured501({ turnMs: 0 }); assert.equal(R.timeout(s, 999999), null, 'Timer Off cannot expire a turn');

// Cork uses physical distances among tied leaders only; equal distances repeat fairly.
s = cappedMatch({ mode: 'countup', roundLimit: 5 }, { A: 100, B: 100, C: 100, D: 0 });
assert.equal(s.phase, 'cork'); assert.deepEqual(s.corkPlayers, ['A', 'B', 'C']);
const cappedScores = { ...s.scores }, cappedTurns = { ...s.turns };
for (const [uid, distance] of [['A', 10], ['B', 10], ['C', 20]]) {
    assert.equal(s.active, uid);
    s = R.throwDart(s, uid, hit(25, distance > 15 ? 1 : 2), 100000, { x: distance, y: 0 });
}
assert.equal(s.phase, 'cork'); assert.equal(s.corkRound, 2); assert.deepEqual(s.corkPlayers, ['A', 'B']);
assert.deepEqual(s.scores, cappedScores); assert.deepEqual(s.turns, cappedTurns);
assert.equal(s.history.at(-1).phase, 'cork'); assert.equal(s.history.at(-1).darts.length, 1);
assert.equal(s.history.at(-1).distance, 20); assert.equal(s.history.at(-1).corkRound, 1);
s = R.throwDart(s, 'A', hit(25, 2), 100001, { x: 3, y: 4 });
assert.equal(s.lastDart.distance, 5); assert.equal(s.lastDart.phase, 'cork');
s = R.throwDart(s, 'B', hit(25, 2), 100002, { x: 6, y: 0 });
assert.equal(s.winner, 'A'); assert.equal(s.endReason, 'cork'); assert.equal(s.leg, 1);
s = cappedMatch({ mode: '501', roundLimit: 10 }, { A: 100, B: 100, C: 200, D: 300 });
s = R.timeout(s, 999999); assert.equal(s.history.at(-1).reason, 'timeout'); assert.equal(s.history.at(-1).distance, null);
s = R.throwDart(s, s.active, miss, 1000000, { x: 200, y: 0 });
assert.equal(s.winner, 'B', 'An actual throw beats a forfeited Cork opportunity, including off-board impacts');
s = cappedMatch({ mode: '501', roundLimit: 10 }, { A: 100, B: 100, C: 200, D: 300 });
s = R.withdraw(s, 'A', 999999); assert.equal(s.winner, 'B', 'Leaving a Cork cannot block remaining tied participants');
s = cappedMatch({ mode: '501', roundLimit: 10 }, { A: 100, B: 100, C: 300, D: 200 });
s = R.withdrawMany(s, ['A', 'B'], 999999);
assert.equal(s.winner, 'D', 'A controller owning all tied slots may leave; the surviving field settles consistently');

// First to two can take five Legs with four independent players; solo can target3 Legs.
s = R.create({ mode: '501', legsToWin: 2 }, four, 1000);
for (let i = 0; i < 5; i++) {
    assert.equal(s.active, four[i % 4]); s.scores[s.active] = s.turnStartScore = 40; s = dart(s, 20, 2);
    if (i < 4) { assert.equal(s.status, 'between'); s = R.nextLeg(s, 3000 + i); }
}
assert.equal(s.winner, 'A'); assert.equal(s.leg, 5); assert.equal(s.history.length, 5);
s = R.create({ mode: 'countup', roundLimit: 5, legsToWin: 3 }, ['A'], 1000);
for (let leg = 1; leg <= 3; leg++) {
    for (let i = 0; i < 15; i++) s = dart(s, 20);
    assert.equal(s.wins.A, leg);
    if (leg < 3) { assert.equal(s.status, 'between'); s = R.nextLeg(s, 5000 + leg); }
}
assert.equal(s.status, 'over'); assert.equal(s.winner, 'A');
s = configured501({ inRule: 'double', legsToWin: 2 }, 40); s = dart(s, 20, 2);
assert.equal(s.entered.A, true); s = R.nextLeg(s, 5000);
assert.equal(s.entered.A, false); assert.equal(s.inRule, 'double'); assert.equal(s.history[0].reason, 'checkout');

// Unified Practice preserves unlimited solo throws and rotates3 darts per shared slot.
s = R.create({ mode: 'practice' }, ['A'], 1000);
for (let i = 0; i < 12; i++) s = dart(s, 20);
assert.equal(s.status, 'playing'); assert.equal(s.winner, null); assert.equal(s.history.length, 12);
assert(s.history.every(row => row.leg === 0 && row.darts.length === 1)); assert.equal(s.stats.A.darts, 12);
s = R.create({ mode: 'practice' }, four, 1000);
for (const uid of four) for (let i = 0; i < 3; i++) { assert.equal(s.active, uid); s = dart(s, 20); }
assert.equal(s.active, 'A'); assert.equal(s.history.length, 4); assert.equal(s.status, 'playing');
s = R.withdrawMany(s, ['A', 'B', 'C'], 5000); assert.equal(s.status, 'playing'); assert.equal(s.active, 'D');
s = dart(s, 25, 2); assert.equal(s.stats.D.darts, 4);
s = R.withdraw(s, 'D', 6000); assert.equal(s.status, 'over'); assert.equal(s.winner, null);
s = R.create({ mode: '501' }, ['A', 'B'], 1000);
s = R.withdrawMany(s, ['A', 'B'], 5000); assert.equal(s.winner, null, 'Bulk controller departure cannot crown its other departing slot');
s = R.create({ mode: '501' }, four, 1000); s = R.withdrawMany(s, ['A', 'C'], 5000);
assert.equal(s.status, 'playing'); assert.equal(s.active, 'B'); assert.deepEqual(s.withdrawn, ['A', 'C']);

// Existing live snapshots retain their old caps while newly created matches get V2 defaults.
for (const mode of ['501', 'cricket', 'countup']) {
    s = create(mode); delete s.roundLimit;
    s = dart(s, 0, 0);
    assert.equal(s.roundLimit, mode === 'countup' ? 8 : 0);
}
assert.equal(R.create({ mode: '501' }, ['A', 'B'], 0).roundLimit, 15);
assert.equal(R.create({ mode: 'cricket' }, ['A', 'B'], 0).roundLimit, 15);

// Execute the real physics independently of DOM/rendering and compare with the original
// implementation's expected trajectory. This catches accidental changes to the skill mechanic.
const sandbox = { window: { DartsRules: R, ArcadeCommon: { i18n: { STRINGS: { en: {}, zh: {} }, t: k => k },
    math: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } } },
    document: { readyState: 'loading', addEventListener() {}, getElementById: id => id === 'stage' ? { getContext: () => ({}) } : null } };
let source = fs.readFileSync(require('node:path').join(__dirname, '../js/games/darts.js'), 'utf8');
source = source.replace(/\}\)\(\);\s*$/, 'window.physics = { analyseGesture, computeThrow, computeImpact, scoreAt, TUNING }; })();');
vm.runInNewContext(source, sandbox);
const physics = sandbox.window.physics;
const referenceThrow = physics.computeThrow({ speed: 700, releaseVel: { x: 300, y: 600 } });
assert.equal(referenceThrow.vel.x, 471); assert.equal(referenceThrow.vel.y, 840);
assert.equal(referenceThrow.vel.z, 12600); assert.equal(referenceThrow.tempo, 1);
assert.equal(physics.TUNING.releaseNoise, 0);
const analysis = physics.analyseGesture([{ t: 0, x: 0, y: 0 }, { t: .05, x: 0, y: 50 }, { t: .1, x: 0, y: 140 }, { t: .15, x: 0, y: 230 }]);
assert(analysis.valid);
const flight = physics.computeThrow(analysis), impact = physics.computeImpact(flight);
assert.equal(flight.pos.y, -292); assert.equal(flight.pos.z, 0); assert.equal(flight.vel.x, 0);
assert(Math.abs(impact.t - 2370 / flight.vel.z) < 1e-12);
assert(Math.abs(impact.y - (-292 + flight.vel.y * impact.t - 2450 * impact.t ** 2)) < 1e-10);
assert.equal(physics.analyseGesture([{ t: 0, x: 0, y: 0 }, { t: .1, x: 0, y: -100 }]).valid, false);
assert.equal(physics.scoreAt(0, 0).mult, 2);

// Pitch trim rotates the entire gesture mapping rather than changing sensitivity,
// speed, release position or the camera. The zero setting retains exact parity.
const neutralAnalysis = { speed: 700, releaseVel: { x: 300, y: 600 } };
const otherAnalysis = { speed: 900, releaseVel: { x: -400, y: 800 } };
const speedOf = v => Math.hypot(v.x, v.y, v.z);
const dotOf = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const neutral = physics.computeThrow(neutralAnalysis), other = physics.computeThrow(otherAnalysis);
const fixedView = [physics.TUNING.camY, physics.TUNING.boardCenterY, physics.TUNING.viewFocal];
try {
    for (const degrees of [-5, 5]) {
        physics.TUNING.pitchOffsetDeg = degrees;
        const tilted = physics.computeThrow(neutralAnalysis), tiltedOther = physics.computeThrow(otherAnalysis);
        assert.equal(tilted.vel.x, neutral.vel.x);
        assert.deepEqual(tilted.pos, neutral.pos); assert.equal(tilted.tempo, neutral.tempo);
        assert(Math.abs(speedOf(tilted.vel) - speedOf(neutral.vel)) < 1e-9);
        assert(Math.abs(dotOf(tilted.vel, tiltedOther.vel) - dotOf(neutral.vel, other.vel)) < 1e-7,
            'Relative angles between gesture-derived directions are preserved');
        const angleDelta = Math.atan2(tilted.vel.y, tilted.vel.z) - Math.atan2(neutral.vel.y, neutral.vel.z);
        assert(Math.abs(angleDelta - degrees * Math.PI / 180) < 1e-12);
        assert.equal(Math.sign(physics.computeImpact(tilted).y - physics.computeImpact(neutral).y), Math.sign(degrees));
        assert.deepEqual([physics.TUNING.camY, physics.TUNING.boardCenterY, physics.TUNING.viewFocal], fixedView);
        assert.deepEqual(physics.computeThrow(neutralAnalysis), tilted, 'Pitch trim remains deterministic');
    }
    physics.TUNING.pitchOffsetDeg = 90;
    const cappedPitch = physics.computeThrow(neutralAnalysis);
    physics.TUNING.pitchOffsetDeg = 30;
    assert.deepEqual(cappedPitch, physics.computeThrow(neutralAnalysis));
    const extreme = physics.computeThrow({ speed: 3200, releaseVel: { x: 0, y: 3200 } });
    assert(extreme.vel.z > 0 && Number.isFinite(physics.computeImpact(extreme).t));
} finally { physics.TUNING.pitchOffsetDeg = 0; }
assert.deepEqual(physics.computeThrow(neutralAnalysis), neutral);
console.log('PASS: darts V2 configuration, In/Out/bull rules and rollback, Standard/Cut-Throat, fair caps/Cork, practice/1–4 slots, Legs/history/departures and unchanged throwing physics.');
