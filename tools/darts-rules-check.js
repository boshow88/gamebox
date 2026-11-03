/** node tools/darts-rules-check.js — pure rules and unmodified throw-physics regression checks. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const R = require('../js/games/darts-rules.js');
const hit = R.hit, miss = hit(0, 0);
const create = (mode = '501', bestOf = 1, players = ['A', 'B']) => R.create({ mode, bestOf }, players, 1000);
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
assert.equal(s.status, 'between'); assert.equal(s.draw, true); assert.deepEqual(s.wins, { A: 0, B: 0 });
s = R.nextLeg(s, 4000); assert.equal(s.active, 'B'); assert.equal(s.leg, 2);

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
s = R.withdraw(s, 'D', 8000); assert.equal(s.status, 'between'); assert.equal(s.draw, true);
assert.equal(R.create({}, four, 0, 3).active, 'D');
assert.throws(() => create('501', 1, ['A', 'B', 'C', 'D', 'E']));

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
console.log('PASS: darts board, 501 bust/double-out, Cricket marks/scoring/wins, Count-Up/timeout/ties, BO3 and throwing physics.');
