/** Pure Pitch generation, continuous frequencies, grading and frozen category/timing checks. */
'use strict';
const assert = require('node:assert/strict'), P = require('../js/games/impressions-pitch.js'), C = require('../js/games/impressions-categories.js');
const Match = require('./helpers/impressions-legacy-match.js'), Color = require('../js/games/impressions-color.js'), Quantity = require('../js/games/impressions-quantity.js');
const before = JSON.stringify(P.defaults);
for (const toneCount of [3, 4]) for (let seed = 0; seed < 2000; seed++) {
    const q = P.generateQuestion(seed, { toneCount }); assert.deepEqual(q, P.generateQuestion(seed, { toneCount })); assert.equal(q.target.length, toneCount);
    assert(q.target.every(hz => hz >= 220 && hz <= 880)); assert.equal(P.grade(q.target, q.target, {}, { toneCount }).score, 100);
    for (let i = 1; i < toneCount; i++) { const interval = Math.abs(1200 * Math.log2(q.target[i] / q.target[i - 1])); assert(interval >= 149.999 && interval <= 720.001); }
    assert(Object.isFrozen(q) && Object.isFrozen(q.target));
}
assert.equal(P.hzToCents(440), 1200); assert.equal(P.centsToHz(2400), 880);
assert(Math.abs(P.hzToCents(P.centsToHz(1201)) - 1201) < 0.00001);
assert(P.generateQuestion(42).target.some(hz => Math.abs(P.hzToCents(hz) / 100 - Math.round(P.hzToCents(hz) / 100)) > 0.01));
const target = [330, 440, 440, 440], shifted = [330, ...Array(3).fill(P.centsToHz(1320))];
assert(Math.abs(P.calculateError(target, shifted).rms - 120) < 0.00001);
const oneBad = [330, P.centsToHz(1800), 440, 440]; assert(Math.abs(P.calculateError(target, oneBad).rms - 600 / Math.sqrt(3)) < 0.00001);
assert(P.grade(target, oneBad).score < P.grade(target, shifted).score);
assert.equal(P.calculateError([220, 440, 440], [880, 440, 440]).rms, 0, 'Locked first tone is excluded from RMS');
assert.equal(P.grade(target, [331, 440, 440, 440]).valid, false, 'Submission cannot change the reference');
for (const invalid of [null, [], [330, 0, 440, 440], [330, NaN, 440, 440], [330, Infinity, 440, 440], [330, 100, 440, 440], [330, '440', 440, 440]]) assert.equal(P.grade(target, invalid).score, 0);
for (const scoring of [{}, { tolerance: 250, exponent: 2 }]) { let previous = 100; for (let error = 0; error < 5000; error++) { const score = P.mapErrorToScore(error, scoring); assert(score >= 0 && score <= previous); assert.equal(score, P.mapErrorToScore(error, scoring)); previous = score; } }
for (const config of [{ scoring: { version: 2 } }, { scoring: { tolerance: 0 } }, { generation: { toneCount: 5 } }, { audio: { volume: 1 } }, { timing: { memorizeMs: 1000 } }, { generation: { minHz: 0 } }]) assert.throws(() => P.configuration(config));
assert.equal(JSON.stringify(P.defaults), before);
const config = C.configuration({challengeVersion:0, categoryMode: 'mixed', selectionVersion: 2 });
for (let round = 1; round <= 12; round++) { const q = C.generateQuestion(42, round, config); assert.equal(q.type, ['color', 'quantity', 'pitch'][(round - 1) % 3]); assert(C.supported(q, config, round)); assert.equal(C.grade(q, q.target, config).score, 100); }
assert.deepEqual(C.generateQuestion(42, 1, config).target, Color.generateQuestion(42).target);
assert.equal(C.generateQuestion(42, 2, config).target, Quantity.generateQuestion(42).target);
const roster = Object.fromEntries(['a', 'b'].map(id => [id, { id, type: 'human', controllerId: id }]));
let game = Match.create(roster, ['a', 'b'], { categoryMode: 'pitch', maxRounds: 2, pitch: { variantSelectionVersion: 0, scoring: { tolerance: 250, exponent: 2 } } }, 42, 0, 'pitch');
const frozen = structuredClone(game.config), identity = Match.token(game); assert.equal(game.protocolVersion, Match.version);
assert.equal(game.timeline.answerAt - game.timeline.memorizeAt, 8000); assert.equal(game.timeline.deadline - game.timeline.answerAt, 35000);
assert.equal(game.roundTiming.answerMs, 35000); assert.equal(game.config.timing.answerMs, 25000);
assert.equal(Match.submit(game, 'a', { ...identity, participantId: 'a', nonce: 'early', answer: game.question.target }, game.timeline.answerAt - 1), null);
assert.equal(Match.submit(game, 'a', { ...identity, participantId: 'a', nonce: 'late', answer: game.question.target }, game.timeline.deadline), null);
game = Match.submit(game, 'a', { ...identity, participantId: 'a', nonce: 'pitch', answer: game.question.target }, game.timeline.answerAt).state;
game = Match.settle(game, identity, game.timeline.deadline); assert.equal(game.lastResult.rows[0].scoreUnits, 100000); assert.deepEqual(game.lastResult.rows[0].pitchErrors, [0, 0, 0]);
game = Match.advance(game, identity, 43, game.resultsUntil); assert.deepEqual(game.config, frozen);
let old = Match.create(roster, ['a', 'b'], { categoryMode: 'mixed', selectionVersion: 1, maxRounds: 4 }, 42, 0, 'old-two');
old.protocolVersion = 2; delete old.config.selectionVersion; delete old.config.pitch; delete old.roundTiming; const oldConfig = structuredClone(old.config);
for (let round = 1; round <= 4; round++) { assert(Match.supported(old)); assert.equal(old.categoryId, round % 2 ? 'color' : 'quantity'); old = Match.settle(old, Match.token(old), old.timeline.deadline); if (round < 4) old = Match.advance(old, Match.token(old), 42 + round, old.resultsUntil); assert.deepEqual(old.config, oldConfig); assert.equal(old.protocolVersion, 2); }
console.log('PASS: 4,000 Pitch seeds (3/4 tones), bounded continuous pitches/intervals, cents/RMS/reference exclusion, invalid inputs, monotonic versioned grading, three-category dispatch, canonical Pitch timing, atomic settlement and frozen two-category protocol-v2 compatibility.');
