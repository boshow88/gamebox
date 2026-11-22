/** Pure group selection, disjoint pools, RMS, frozen match state and legacy checks. */
'use strict';
const assert = require('node:assert/strict'), Groups = require('../../js/games/impressions/quantity-groups.js'), Q = require('../../js/games/impressions/quantity.js');
const M = require('./helpers/legacy-match.js'), C = require('../../js/games/impressions/categories.js'), P = require('../../js/games/impressions/progression.js');
const variants = ['multi2', 'multi3'];
for (const variant of variants) for (let seed = 0; seed < 200; seed++) {
    const generation = Groups.generationParameters(variant), question = Groups.generateQuestion(seed, variant, generation), pools = Groups.createPools(seed, variant, generation);
    assert.deepEqual(question, Groups.generateQuestion(seed, variant, generation)); assert.deepEqual(pools, Groups.createPools(seed, variant, generation));
    assert.equal(Groups.grade(question, question.target, {}, generation).score, 100); assert(Groups.supported(question, generation, Groups.scoringParameters()));
    const points = Object.values(pools).flat(); assert.equal(points.length, variant === 'multi2' ? 180 : 180);
    for (let i = 0; i < points.length; i++) {
        const point = points[i], radius = generation.dotRadius;
        assert(point.x >= radius && point.x <= 1 - radius && point.y >= radius * Q.aspect && point.y <= 1 - radius * Q.aspect);
        for (let j = 0; j < i; j++) assert(Math.hypot(point.x - points[j].x, (point.y - points[j].y) / Q.aspect) > radius * 2, 'Even maximum combined pools cannot overlap across groups');
    }
    for (const group of question.groups) {
        const pool = pools[group.id], target = question.target[group.id], original = Q.visibleDots(pool, target);
        assert.deepEqual(Q.visibleDots(pool, target), original); assert.deepEqual(Q.visibleDots(pool, target + 1).slice(0, target), original);
        assert.deepEqual(Q.visibleDots(pool, target - 1), original.slice(0, -1)); assert.deepEqual(Q.visibleDots(pool, target), original);
        const differentTargetRange = { ...generation, minCount: 10, maxCount: generation.poolSize };
        assert.deepEqual(Groups.createPools(seed, variant, differentTargetRange), pools, 'Pool positions are independent of hidden target ranges/counts');
    }
    assert(Object.isFrozen(pools) && Object.isFrozen(Object.values(pools)[0]) && Object.isFrozen(question.groups));
}
const question = Groups.generateQuestion(42, 'multi3'), gen = Groups.generationParameters('multi3');
for (const answer of [null, {}, [], [1, 2, 3], { ...question.target, circle: -1 }, { ...question.target, square: 1.5 }, { ...question.target, triangle: NaN }, { ...question.target, circle: 61 }, { ...question.target, score: 100 }]) assert.equal(Groups.validateAnswer(question, answer, gen), false);
assert(Groups.validateAnswer(question, { circle: 0, square: 0, triangle: 0 }, gen));
assert(Groups.supported({ ...question, groups: question.groups.map(group => ({ color: group.color, id: group.id, shape: group.shape })) }, gen, Groups.scoringParameters()), 'RTDB object-key ordering does not change canonical identities');
const t = { ...question, target: { circle: 20, square: 20, triangle: 20 } }; let previous = 100;
for (let error = 0; error <= 40; error++) { const answer = { circle: 20 + error, square: 20, triangle: 20 }, grade = Groups.grade(t, answer, {}, gen); assert(grade.score >= 0 && grade.score <= previous); previous = grade.score; assert(Math.abs(grade.error - error / 20 / Math.sqrt(3)) < 1e-12); assert.deepEqual(grade, Groups.grade(t, answer, {}, gen)); }
assert(Groups.grade(t, { circle: 60, square: 20, triangle: 20 }, {}, gen).score < 1);
for (const input of [{ version: 2 }, { multi3: { answerMax: 80 } }, { multi2: { minCount: 1 } }, { dotRadius: 0.1 }, { scoring: { version: 1 } }, { weights: { easy: { single: 0, multi2: 0, multi3: 0 } } }]) assert.throws(() => Groups.configuration(input));
for (const seed of [-1, 2 ** 32, 1.5, '42', NaN]) assert.throws(() => Groups.generateQuestion(seed, 'multi2'));
for (const level of [1, 3, 5, 8, 10]) {
    const seen = new Set(); let state = Groups.initialState(), last = null, streak = 0;
    for (let seed = 0; seed < 500; seed++) { const before = structuredClone(state), selected = Groups.select(seed, level, {}, state); assert.deepEqual(selected, Groups.select(seed, level, {}, state)); assert.deepEqual(state, before); state = selected.state; seen.add(selected.variant); streak = last === selected.variant ? streak + 1 : 1; last = selected.variant; assert(streak <= 2); }
    assert.deepEqual([...seen].sort(), ['multi2', 'multi3', 'single']);
}
const roster = Object.fromEntries(['a', 'b'].map(id => [id, { id, type: 'human', controllerId: id }]));
for (const variant of ['single', ...variants]) {
    const weights = Object.fromEntries(['single', ...variants].map(id => [id, id === variant ? 1 : 0]));
    const settings = { categoryMode: 'quantity', maxRounds: 4, quantity: { multi: { weights: { easy: weights, hard: weights }, scoring: { tolerance: 0.4, exponent: 2 } } } };
    let game = M.create(roster, ['a', 'b'], settings, 42, 1000, variant); const config = structuredClone(game.config); assert.equal(game.protocolVersion, M.version);
    for (let round = 1; round <= 4; round++) {
        assert.equal(game.question.variant, variant); assert(M.supported(game)); const identity = M.token(game), frozen = structuredClone(game.question), oldState = structuredClone(game.variantState);
        for (const id of ['a', 'b']) game = M.submit(game, id, { ...identity, participantId: id, answer: game.question.target, nonce: id + round }, game.timeline.answerAt).state;
        assert(M.receipt(game, 'a', { ...identity, participantId: 'a', answer: C.copyAnswer(game.question.target), nonce: 'a' + round }));
        game = M.settle(game, identity, game.timeline.deadline); assert(game.lastResult.rows.every(row => row.scoreUnits === 100000 && row.damageUnits === 0)); assert.deepEqual(game.question, frozen); assert.deepEqual(game.variantState, oldState); assert.deepEqual(game.config, config);
        if (round < 4) { const next = M.advance(game, identity, round + 42, game.resultsUntil); assert.deepEqual(next, M.advance(game, identity, round + 42, game.resultsUntil)); game = next; }
    }
    assert.equal(game.variantState.quantity.draw, 4); assert.equal(game.difficultyState.historyByType.quantity.length, 4);
}
let legacy = M.create(roster, ['a', 'b'], { categoryMode: 'quantity', quantity: { variantSelectionVersion: 0 }, maxRounds: 4 }, 42, 0, 'legacy4');
legacy.protocolVersion = 4; delete legacy.config.color; delete legacy.variantState; delete legacy.config.quantity.multi; delete legacy.config.quantity.variantSelectionVersion; const frozenLegacy = structuredClone(legacy.config);
for (let round = 1; round <= 4; round++) { assert(M.supported(legacy)); assert.equal(typeof legacy.question.target, 'number'); assert.equal(legacy.question.variant, undefined); assert.equal(legacy.question.scoringVersion, 1); legacy = M.settle(legacy, M.token(legacy), legacy.timeline.deadline); if (round < 4) legacy = M.advance(legacy, M.token(legacy), round + 42, legacy.resultsUntil); assert.deepEqual(legacy.config, frozenLegacy); assert.equal(legacy.variantState, undefined); }
const base = M.options({ categoryMode: 'quantity' });
for (const level of [1, 5, 10]) for (let seed = 0; seed < 100; seed++) { const difficulty = P.difficulty({ initial: level }), result = Groups.prepare(seed, { ...base, adaptive: P.parameters({ initial: level }) }, difficulty); if (result.variant !== 'single') { const q = Groups.generateQuestion(seed, result.variant, result.metadata.parameters.generation); assert(q.groups.every(g => q.target[g.id] >= 10)); assert(result.metadata.parameters.timing.memorizeMs >= P.prepare('quantity', seed, base, difficulty, { initial: level }).parameters.timing.memorizeMs); } }
console.log('PASS: 400 deterministic grouped questions/full disjoint pools, hidden-count-independent positions, exact prefixes/restoration, strict keyed answers, monotonic RMS, all variants at every level, retry-safe frozen state/scoring and legacy-v4 scalar behavior.');
if (process.argv.includes('--diagnostics')) for (const variant of variants) { const q = Groups.generateQuestion(42, variant), p = Groups.generationParameters(variant); console.table([0, 0.1, 0.25, 0.5].map(fraction => { const answer = { ...q.target }; answer.circle = Math.min(p.poolSize, Math.round(answer.circle * (1 + fraction))); const grade = Groups.grade(q, answer, {}, p); return { variant, target: JSON.stringify(q.target), answer: JSON.stringify(answer), rms: grade.error.toFixed(4), score: grade.score }; })); }
