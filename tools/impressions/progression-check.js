/** Deterministic selection, robust category statistics, frozen question mapping and legacy behavior. */
'use strict';
const assert = require('node:assert/strict'), P = require('../../js/games/impressions/progression.js'), M = require('./helpers/legacy-match.js');
const C = require('../../js/games/impressions/categories.js'), Color = require('../../js/games/impressions/color.js'), Quantity = require('../../js/games/impressions/quantity.js'), Pitch = require('../../js/games/impressions/pitch.js');
const clone = value => structuredClone(value), human = score => ({ human: true, accepted: true, valid: true, score });
for (const color of [0, 1, 2, 4]) for (const quantity of [0, 1, 2, 4]) for (const pitch of [0, 1, 2, 4]) {
    const weights = { color, quantity, pitch }, size = P.total(weights);
    if (!size) { assert.throws(() => P.draw(P.selection(1), weights)); continue; }
    for (let seed = 0; seed < 20; seed++) {
        let state = P.selection(seed), counts = { color: 0, quantity: 0, pitch: 0 }, last = null, streak = 0;
        for (let round = 0; round < size * 5; round++) {
            const before = clone(state), draw = P.draw(state, weights); assert.deepEqual(draw, P.draw(state, weights), 'Transaction retries reuse the same selection'); assert.deepEqual(state, before);
            assert(weights[draw.categoryId] > 0); counts[draw.categoryId]++; state = draw.state;
            streak = draw.categoryId === last ? streak + 1 : 1; last = draw.categoryId;
            if ([color, quantity, pitch].filter(Boolean).length > 1 && new Set([color, quantity, pitch].filter(Boolean)).size === 1) assert(streak <= 2, 'Equal weights avoid excessive runs');
        }
        for (const id of P.types) assert.equal(counts[id], weights[id] * 5, 'Every completed bag preserves exact weight ratios');
    }
}
assert.notDeepEqual(Array.from({ length: 15 }, (_, i) => P.draw(P.selection(i), P.defaults.weights).categoryId), Array(15).fill('color'));
for (const input of [{ color: -1 }, { pitch: 3 }, { quantity: NaN }]) assert.throws(() => P.weights(input));
for (const input of [{ step: 5 }, { window: 2 }, { initial: 11 }, { jitter: 2 }, { low: 90, high: 80 }, { minObservations: 1 }]) assert.throws(() => P.parameters(input));
let state = P.difficulty(), initial = clone(state);
state = P.observe(state, 'color', 1, [human(100)], {}); state = P.observe(state, 'color', 2, [human(100)], {}); assert.equal(state.difficultyByType.color, 5);
state = P.observe(state, 'color', 3, [human(100)], {}); assert.equal(state.difficultyByType.color, 5.5); assert.equal(state.difficultyByType.quantity, 5);
assert.deepEqual(P.observe(state, 'color', 3, [human(0)], {}), state, 'Duplicate settlement cannot adapt twice');
const history = clone(state.historyByType.color);
state = P.observe(state, 'quantity', 4, [human(20)], {}); assert.deepEqual(state.historyByType.color, history);
for (let round = 5; round < 30; round++) state = P.observe(state, 'color', round, [human(100)], {}); assert.equal(state.difficultyByType.color, 10); assert.equal(state.historyByType.color.length, 4);
for (let round = 30; round < 70; round++) state = P.observe(state, 'color', round, [human(0)], {}); assert.equal(state.difficultyByType.color, 1, 'Accepted zero scores lower difficulty');
const excluded = [ { ...human(0), human: false }, { ...human(0), accepted: false }, { ...human(0), valid: false }, { ...human(0), withdrawn: true } ];
const missing = P.observe(initial, 'pitch', 1, excluded, {}); assert.deepEqual(missing.historyByType.pitch, []); assert.equal(missing.difficultyByType.pitch, 5);
let balanced = P.difficulty(); for (let round = 1; round <= 10; round++) balanced = P.observe(balanced, 'pitch', round, [human(0), human(70), human(100)], {}); assert.equal(balanced.difficultyByType.pitch, 5);
let low = P.difficulty(); for (let round = 1; round <= 3; round++) low = P.observe(low, 'quantity', round, [human(20)], {}); assert.equal(low.difficultyByType.quantity, 4.5);
const config = M.options(), roster = Object.fromEntries(['a', 'b'].map(id => [id, { id, type: 'human', controllerId: id }]));
assert.deepEqual(config.categoryWeights, { color: 2, quantity: 2, pitch: 2 }); assert(M.requiresAudio(config));
assert(!M.requiresAudio(M.options({ categoryWeights: { color: 4, quantity: 1, pitch: 0 } })));
assert.throws(() => M.create(roster, ['a', 'b'], { categoryWeights: { color: 0, quantity: 0, pitch: 0 } }, 1, 0));
for (const level of [1, 3, 5, 8, 10]) for (const type of P.types) for (let seed = 0; seed < 100; seed++) {
    const difficulty = P.difficulty({ initial: level }); const info = P.prepare(type, seed, config, difficulty, { initial: level });
    assert.deepEqual(info, P.prepare(type, seed, config, difficulty, { initial: level })); assert(info.difficulty.effective >= 1 && info.difficulty.effective <= 10);
    assert(Math.abs(info.difficulty.effective - level) <= 0.2501); assert.deepEqual(difficulty, P.difficulty({ initial: level }));
    const effectiveConfig = C.forQuestion({ type, parameters: info.parameters }, config), question = C.generateQuestion(seed, 1, effectiveConfig, type);
    assert.equal(C.grade({ ...question, ...info }, question.target, config).score, 100, 'Difficulty never penalizes an exact answer');
    if (type === 'quantity') { assert(question.target >= 30 && question.target <= 150); assert.equal(info.parameters.generation.poolSize, 220); assert.equal(info.parameters.generation.dotRadius, Quantity.defaults.generation.dotRadius); assert.deepEqual(Quantity.visibleDots(Quantity.createPool(seed, info.parameters.generation), question.target), Quantity.visibleDots(Quantity.createPool(seed, info.parameters.generation), question.target)); }
    if (type === 'pitch') { assert(question.target.length === 3 || question.target.length === 4); assert(question.target.every(hz => hz >= 220 && hz <= 880)); assert.equal(effectiveConfig.pitch.audio.volume, config.pitch.audio.volume); }
}
let game = M.create(roster, ['a', 'b'], { categoryWeights: { color: 0, quantity: 4, pitch: 0 }, maxRounds: 5 }, 42, 1000, 'adaptive');
for (let round = 1; round <= 5; round++) {
    assert.equal(game.protocolVersion, M.version); assert.equal(game.categoryId, 'quantity'); const frozen = clone(game.question), identity = M.token(game), before = clone(game.selectionState);
    for (const id of ['a', 'b']) game = M.submit(game, id, { ...identity, participantId: id, answer: game.question.target, nonce: id + round }, game.timeline.answerAt).state;
    game = M.settle(game, identity, game.timeline.deadline); assert.deepEqual(game.question, frozen); assert.deepEqual(game.selectionState, before); assert.equal(M.settle(game, identity, game.timeline.deadline), null);
    if (round >= 3) assert(game.difficultyState.difficultyByType.quantity > 5);
    if (round < 5) { const expected = M.advance(game, identity, 42 + round, game.resultsUntil); assert.deepEqual(expected, M.advance(game, identity, 42 + round, game.resultsUntil)); game = expected; }
}
for (const version of [1, 2, 3]) {
    let legacy = M.create(roster, ['a', 'b'], { selectionVersion: version === 2 ? 1 : 2, categoryMode: version === 1 ? 'color' : 'mixed', maxRounds: 6 }, 42, 0, 'legacy');
    legacy.protocolVersion = version; delete legacy.config.categoryWeights; delete legacy.config.adaptive;
    if (version === 1) { delete legacy.categoryId; delete legacy.question.scoringVersion; delete legacy.config.selectionVersion; }
    if (version === 2) delete legacy.config.selectionVersion;
    const frozen = clone(legacy.config);
    for (let round = 1; round <= 6; round++) { assert(M.supported(legacy)); assert.equal(legacy.question.type, version === 1 ? 'color' : version === 2 ? round % 2 ? 'color' : 'quantity' : ['color', 'quantity', 'pitch'][(round - 1) % 3]); legacy = M.settle(legacy, M.token(legacy), legacy.timeline.deadline); if (round < 6) legacy = M.advance(legacy, M.token(legacy), round + 42, legacy.resultsUntil); assert.deepEqual(legacy.config, frozen); assert.equal(legacy.difficultyState, undefined); }
}
assert.deepEqual(Color.scoringParameters({version:3}), config.scoring); assert.deepEqual(Pitch.defaults.scoring, config.pitch.scoring);
console.log('PASS: all 63 nonzero frequency combinations across seeds/bags, Off/single-category, ratio/retry/streak determinism; independent bounded robust human histories, zero/missing/withdrawn/CPU filtering; 1,500 frozen mapped questions, stable scoring and v1/v2/v3 compatibility.');
