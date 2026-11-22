/** Quantity, dot-pool and category dispatch checks. No DOM, clock or Firebase. */
'use strict';
const assert = require('node:assert/strict');
const Q = require('../../js/games/impressions/quantity.js'), C = require('../../js/games/impressions/color.js');
const Categories = require('../../js/games/impressions/categories.js'), Match = require('./helpers/legacy-match.js');
const params = Q.generationParameters(), before = JSON.stringify(Q.defaults), counts = new Set();
for (let seed = 0; seed < 2000; seed++) {
    const q = Q.generateQuestion(seed); assert.deepEqual(q, Q.generateQuestion(seed));
    assert(q.target >= 30 && q.target <= 150); counts.add(q.target);
}
assert.equal(counts.size, 121); assert.equal(Q.generateQuestion(42).target, 102);
for (let seed = 0; seed < 200; seed++) {
    const pool = Q.createPool(seed, params), peerPool = Q.createPool(seed);
    assert.equal(pool.length, 220); assert.deepEqual(pool, peerPool, 'Clients generate the same ordered canonical pool');
    const targetCount = Q.generateQuestion(seed).target, memorized = Q.visibleDots(pool, targetCount);
    assert.deepEqual(Q.visibleDots(peerPool, targetCount), memorized, 'Equal target/answer counts reproduce the memorized arrangement');
    assert.deepEqual(Q.visibleDots(pool, targetCount - 1), memorized.slice(0, -1));
    assert.deepEqual(Q.visibleDots(pool, targetCount + 1).slice(0, targetCount), memorized);
    {
        const first80 = Q.visibleDots(pool, 80);
        for (const count of [81, 79, 80, 0, 220, 80]) {
            const visible = Q.visibleDots(pool, count); assert.equal(visible.length, count);
            assert(visible.every((point, index) => point === pool[index]), 'Count changes preserve order and positions');
            if (count === 80) assert.deepEqual(visible, first80);
        }
        assert.deepEqual(Q.visibleDots(pool, 81).slice(0, 80), first80);
        assert.deepEqual(Q.visibleDots(pool, 79), first80.slice(0, -1));
        assert(Object.isFrozen(pool) && Object.isFrozen(pool[0]));
        for (let i = 0; i < pool.length; i++) {
            const p = pool[i], radius = params.dotRadius;
            assert(p.x >= radius && p.x <= 1 - radius && p.y >= radius * Q.aspect && p.y <= 1 - radius * Q.aspect);
            for (let j = 0; j < i; j++) assert(Math.hypot(p.x - pool[j].x, (p.y - pool[j].y) / Q.aspect) > radius * 2, 'Dots never overlap in the shared aspect ratio');
        }
        assert.equal(new Set(pool.slice(0, 15).map(p => `${p.x > 0.5},${p.y > 0.5}`)).size, 4, 'Short prefixes spread across all quadrants');
    }
}
for (const input of [{ minCount: 0 }, { maxCount: 221 }, { poolSize: 0 }, { poolSize: 1001 }, { minCount: 90, maxCount: 50 }, { jitter: 0.4 }, { dotRadius: 0.1 }]) assert.throws(() => Q.generationParameters(input));
for (const seed of [-1, 2 ** 32, 1.2, '42', NaN]) assert.throws(() => Q.generateQuestion(seed));
for (const invalid of [-1, 221, 1.1, null, undefined, NaN, Infinity, '15', [15]]) {
    assert.equal(Q.validateAnswer(invalid), false); assert.deepEqual(Q.grade(100, invalid), { valid: false, error: null, score: 0 });
}
assert(Q.validateAnswer(0) && Q.validateAnswer(220)); assert.equal(Q.grade(100, 100).score, 100);
assert(Q.grade(100, 0).valid); assert.throws(() => Q.grade(0, 0));
assert.deepEqual(Q.grade(100, 80), Q.grade(100, 120)); assert.equal(Q.grade(100, 120).score, 58.023);
for (const scoring of [{}, { tolerance: 0.5, exponent: 2 }]) {
    let previous = 100;
    for (let i = 0; i <= 1000; i++) {
        const score = Q.mapErrorToScore(i / 100, scoring); assert(score >= 0 && score <= previous); previous = score;
    }
}
for (const input of [{ version: 2 }, { tolerance: 0 }, { exponent: NaN }]) assert.throws(() => Q.scoringParameters(input));
assert.notEqual(Q.mapErrorToScore(0.2), C.mapColorErrorToScore(0.2));
assert.equal(JSON.stringify(Q.defaults), before);
const config = Categories.configuration({ categoryMode: 'mixed', selectionVersion: 1 });
for (let round = 1; round <= 12; round++) {
    const question = Categories.generateQuestion(42, round, config); assert.equal(question.type, round % 2 ? 'color' : 'quantity');
    assert(Categories.supported(question, config, round)); assert.equal(Categories.grade(question, question.target, config).score, 100);
    assert.equal(Categories.validateAnswer(question, question.type === 'color' ? 15 : [128, 128, 128], config), false);
}
assert.deepEqual(Categories.generateQuestion(42, 1, config).target, C.generateQuestion(42).target);
assert.throws(() => Categories.configuration({ categoryMode: 'spatial' }));
const quantityConfig = Categories.configuration({ categoryMode: 'quantity', selectionVersion: 2 }), quantityQuestion = Categories.generateQuestion(42, 1, quantityConfig);
assert.equal(Categories.supported(quantityQuestion, { ...quantityConfig, categoryMode: null }, 1), false);
assert.equal(Categories.supported({ ...quantityQuestion, target: 29 }, quantityConfig, 1), false);
assert.equal(Categories.supported({ ...quantityQuestion, target: 151 }, quantityConfig, 1), false);
assert.equal(Categories.supported({ ...quantityQuestion, scoringVersion: 2 }, quantityConfig, 1), false);
const roster = Object.fromEntries(['a', 'b', 'c'].map(id => [id, { id, controllerId: id, type: 'human' }]));
let game = Match.create(roster, ['a', 'b', 'c'], { categoryMode: 'quantity', quantity: { variantSelectionVersion: 0 }, maxRounds: 1 }, 42, 0, 'quantity');
const token = Match.token(game); assert.equal(token.categoryId, 'quantity');
assert.equal(Match.submit(game, 'a', { ...token, participantId: 'a', answer: 15, nonce: 'early' }, game.timeline.answerAt - 1), null);
assert.equal(Match.submit(game, 'a', { ...token, participantId: 'a', answer: 15, nonce: 'late' }, game.timeline.deadline), null);
for (const [id, answer] of [['a', game.question.target], ['b', 0]]) {
    game = Match.submit(game, id, { ...token, participantId: id, answer, nonce: id }, game.timeline.answerAt).state;
}
assert.equal(Match.submit(game, 'b', { ...token, participantId: 'b', answer: 1, nonce: 'replace' }, game.timeline.answerAt), null);
assert.equal(Match.submit(game, 'c', { ...token, categoryId: 'color', participantId: 'c', answer: 10, nonce: 'wrong-category' }, game.timeline.answerAt), null);
game = Match.settle(game, token, game.timeline.deadline);
assert.equal(game.lastResult.rows.find(r => r.id === 'a').scoreUnits, 100000);
assert.equal(game.lastResult.rows.find(r => r.id === 'b').missing, false, 'Accepted scalar zero is not a missing answer');
assert.equal(game.lastResult.rows.find(r => r.id === 'c').missing, true);
assert.equal(Match.settle(game, token, game.timeline.deadline), null);
const customOptions = { categoryMode: 'quantity', maxRounds: 2, quantity: { variantSelectionVersion: 0, scoring: { version: 1, tolerance: 0.5, exponent: 2 } } };
let custom = Match.create(roster, ['a', 'b', 'c'], customOptions, 42, 0, 'custom-quantity');
const frozenConfig = JSON.parse(JSON.stringify(custom.config)), customAnswer = custom.question.target + 20;
customOptions.quantity.scoring.tolerance = 0.1;
custom = Match.submit(custom, 'a', { ...Match.token(custom), participantId: 'a', answer: customAnswer, nonce: 'custom' }, custom.timeline.answerAt).state;
custom = Match.settle(custom, Match.token(custom), custom.timeline.deadline);
assert.equal(custom.lastResult.rows.find(row => row.id === 'a').scoreUnits, Math.round(Q.grade(custom.question.target, customAnswer, frozenConfig.quantity.scoring).score * 1000));
assert.notEqual(Q.grade(custom.question.target, customAnswer, frozenConfig.quantity.scoring).score, Q.grade(custom.question.target, customAnswer).score);
custom = Match.advance(custom, Match.token(custom), 43, custom.resultsUntil);
assert.deepEqual(custom.config, frozenConfig); assert.equal(custom.question.scoringVersion, 1);
console.log('PASS: Quantity targets (2,000 seeds), 200 shared ordered/nonoverlapping pools, exact target/answer arrangements, 79/80/81 and repeated prefixes, boundaries, scalar scoring/zero, alternating dispatch, category guards, missing answers and exactly-once settlement.');
if (process.argv.includes('--diagnostics')) console.table([0, 0.05, 0.10, 0.20, 0.30, 0.50].map(error => ({ relativeError: error, score: Q.mapErrorToScore(error).toFixed(3) })));
