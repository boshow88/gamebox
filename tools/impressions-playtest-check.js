/** Playtest observations are descriptive, anonymous and isolated from gameplay. */
'use strict';
const assert = require('node:assert/strict');
const Playtest = require('../js/games/impressions-playtest.js');
const Analysis = require('./helpers/impressions-playtest-analysis.js');
const Match = require('./helpers/impressions-legacy-match.js');
const Categories = require('../js/games/impressions-categories.js');
const Colors = require('../js/games/impressions-color-variants.js');
const Pitch = require('../js/games/impressions-pitch.js');
const ids = ['sensitive-host-uid', 'sensitive-guest-uid'];
const roster = Object.fromEntries(ids.map(id => [id, { id, controllerId: id, name: 'PERSONAL NAME', type: 'human' }]));
function answer(q) { return structuredClone(q.type === 'color' && q.version === 2 ? Colors.targetAnswer(q) : q.target); }
function event(g, extra = {}) {
    return Object.assign({ completed: g.phase === 'results' && g.settledRound === g.round, mode: 'online', matchId: 'anonymous-match', round: g.round, protocolVersion: g.protocolVersion,
        question: g.question, config: g.config, timeline: g.timeline, multiplier: g.lastResult?.multiplier, over: g.status === 'over', difficultyAfter: g.difficultyState?.difficultyByType[g.question.type],
        participants: (g.lastResult?.rows || []).map((r, i) => ({ id: 'p' + (i + 1), self: i === 0, answer: g.submissions[r.id]?.answer ?? null,
            acceptedElapsedMs: g.submissions[r.id] ? g.submissions[r.id].acceptedAt - g.timeline.answerAt : null, score: r.scoreUnits / 1000, error: r.error, missing: r.missing,
            damageTaken: r.damageUnits / 1000, hpBefore: r.hpBeforeUnits / 1000, hpRemaining: r.hpAfterUnits / 1000 })) }, extra);
}
function settle(g, missing = false) {
    const token = Match.token(g);
    for (const [i, id] of ids.entries()) if (!(missing && i === 1)) {
        let a = answer(g.question);
        if (i) {
            if (g.question.type === 'quantity') a = g.question.version === 2 ? Object.fromEntries(Object.entries(a).map(([id, n]) => [id, Math.max(0, n - 2)])) : Math.max(0, a - 2);
            else if (g.question.type === 'pitch') { const key = g.question.version === 2 ? g.question.tones.find(id => !g.question.fixed.includes(id)) : 1; a[key] *= 2 ** ((a[key] > 600 ? -100 : 100) / 1200); }
            else if (g.question.version === 2) { const key = g.question.variant === 'single' ? 'h' : g.question.swatches[0]; a[key] = Colors.wrap(a[key] + 20); }
            else a[0] = (a[0] + 20) % 256;
        }
        g = Match.submit(g, id, { ...token, participantId: id, answer: a, nonce: 'nonce-' + i + '-' + g.round }, g.timeline.answerAt + 1200 + i * 500).state;
    }
    return Match.settle(g, token, g.timeline.deadline);
}
const off = Playtest.create(); assert.equal(off.record(null), false); assert.equal(off.data().rounds.length, 0);
assert.throws(() => Playtest.create({ source: 'assumed-human' }));
let questionCount = 0;
for (const version of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = Playtest.create({ source: 'synthetic' }); r.enable(true);
    let game = Match.create(roster, ids, { maxRounds: 12, startingHp: 5000, categoryMode: version === 1 ? 'color' : 'mixed', selectionVersion: version <= 3 ? version === 2 ? 1 : 2 : 3,
        color: { variantSelectionVersion: version >= 8 ? 2 : version >= 6 ? 1 : 0 }, quantity: { variantSelectionVersion: version >= 5 ? 1 : 0, renderingVersion: version >= 8 ? 2 : 1 }, pitch: { variantSelectionVersion: version >= 7 ? 1 : 0 } }, 42, 0, 'do-not-export-match-id');
    game.protocolVersion = version;
    if (version < 7) { delete game.config.pitch.variantSelectionVersion; delete game.config.pitch.variations; }
    if (version === 1) { delete game.categoryId; delete game.config.selectionVersion; delete game.question.scoringVersion; }
    if (version === 2) delete game.config.selectionVersion;
    for (let n = 1; n <= 12; n++) {
        assert.equal(r.record(event(game)), false, 'No active target is recorded');
        game = settle(game, n === 11); const before = JSON.stringify(game), e = event(game);
        r.attempt({ matchId: e.matchId, round: n, source: n === 12 ? 'auto' : 'manual', elapsedMs: 900 });
        r.attempt({ matchId: e.matchId, round: n, source: 'auto', elapsedMs: 2000 });
        assert(r.record(e)); assert.equal(r.record(e), false, 'Repeated snapshots do not duplicate rounds');
        assert.equal(JSON.stringify(game), before, 'Diagnostics cannot mutate frozen state/receipts/HP/difficulty');
        const row = r.data().rounds.at(-1); assert.equal(row.participants[0].answerElapsedMs, 900); assert.equal(row.participants[0].timeSource, 'local-first-attempt');
        assert.equal(row.scoreSpread, Math.abs(game.lastResult.rows[0].scoreUnits - game.lastResult.rows[1].scoreUnits) / 1000);
        assert.equal(row.participants[1].timedOut, null, 'Do not infer another participant’s submission source');
        assert.equal(row.participants[1].missing, n === 11); if (n === 11) assert.equal(row.participants[1].answerElapsedMs, null);
        for (const [i, p] of row.participants.entries()) { assert.equal(p.score, game.lastResult.rows[i].scoreUnits / 1000); assert.equal(p.damageTaken, game.lastResult.rows[i].damageUnits / 1000); assert.equal(p.metrics.combinedError, p.error); }
        questionCount++; if (n < 12) game = Match.advance(game, Match.token(game), 42 + n, game.resultsUntil);
    }
    const data = r.data(), json = JSON.stringify(data), csv = Playtest.csv(data);
    for (const sensitive of [...ids, 'PERSONAL NAME', 'do-not-export-match-id', 'nonce-', 'controllerId', 'acceptedAt', 'Firebase', 'owners', 'roster']) { assert(!json.includes(sensitive)); assert(!csv.includes(sensitive)); }
    assert.equal(data.rounds.length, 12); assert.equal(data.sessions[0].status, 'complete'); assert.equal(data.sessions[0].configuration.maxRounds, 12);
    const report = Analysis.summarize([data, data], { source: 'synthetic' }); assert.equal(report.rounds, 12); assert.equal(report.observations, 24);
    const partial = structuredClone(data); partial.rounds = partial.rounds.slice(0, 5); partial.sessions[0].completedRounds = 5; partial.sessions[0].status = 'partial';
    for (const exports of [[partial, data], [data, partial]]) { const merged = Analysis.summarize(exports, { source: 'synthetic' }); assert.equal(merged.rounds, 12); assert.equal(merged.sessions[0].completedRounds, 12); assert.equal(merged.sessions[0].status, 'complete'); }
    assert.equal(Analysis.summarize([data]).rounds, 0, 'Synthetic answers are never human evidence by default');
    assert.equal(report.groups.find(g => !g.label.includes(' / ')).knownTimeoutN >= 1, true);
    const conflict = structuredClone(data); conflict.rounds[0].participants[0].score = 99; assert.throws(() => Analysis.summarize([data, conflict], { source: 'all' }));
    data.rounds[0].participants[0].score = -10; assert.equal(r.data().rounds[0].participants[0].score, 100, 'Exports are detached copies'); assert.throws(() => Analysis.validate(data));
    assert(csv.startsWith('\uFEFF')); assert(csv.includes('"metricsJson"')); assert(csv.includes('"parametersJson"')); assert.equal(csv.trim().split('\r\n').length, 25);
}
// A common low score does not imply damage: identical answers have zero spread.
const g0 = Match.create(roster, ids, { categoryMode: 'color', maxRounds: 1 }, 123, 0, 'low-scores');
let g = g0; for (const id of ids) g = Match.submit(g, id, { ...Match.token(g), participantId: id, answer: Categories.initialAnswer(g.question, g.config), nonce: id }, g.timeline.answerAt).state;
g = Match.settle(g, Match.token(g), g.timeline.deadline);
const low = Playtest.create(); low.enable(true); low.record(event(g)); assert.equal(low.data().rounds[0].scoreSpread, 0); assert(low.data().rounds[0].participants.every(p => p.damageTaken === 0));
const report = Analysis.summarize([low.data()]); assert.equal(report.spreads[0].spread.median, 0);
// Every Color/Quantity variant and Pitch structure provides the actual grader metrics.
for (const category of ['color', 'quantity']) for (const variant of category === 'color' ? Colors.variants : ['single', 'multi2', 'multi3']) {
    const weights = Object.fromEntries((category === 'color' ? Colors.variants : ['single', 'multi2', 'multi3']).map(id => [id, id === variant ? 1 : 0]));
    const input = { categoryMode: category, maxRounds: 1, [category]: category === 'color' ? { variantSelectionVersion:1, weights: { easy: weights, hard: weights } } : { multi: { weights: { easy: weights, hard: weights } } } };
    const game = settle(Match.create(roster, ids, input, 123, 0, 'metrics')), r = Playtest.create(); r.enable(true); r.record(event(game));
    const p = r.data().rounds[0].participants[0]; assert.equal(p.error, 0); assert.equal(p.score, 100); if (category === 'color') assert(p.metrics.swatches.every(s => s.error === 0)); else assert(p.metrics.groups.every(s => s.relativeError === 0 && s.targetCount === s.answerCount));
}
for (const n of [3, 4, 5]) for (const refs of n === 3 ? [1] : [1, 2]) {
    const lengths = { n3: +(n === 3), n4: +(n === 4), n5: +(n === 5) }, references = { one: +(refs === 1), two: +(refs === 2) };
    const game = settle(Match.create(roster, ids, { categoryMode: 'pitch', maxRounds: 1, pitch: { variations: { lengths: { easy: lengths, hard: lengths }, references: { easy: references, hard: references } } } }, 123, 0, 'pitch-metrics'));
    const r = Playtest.create(); r.enable(true); r.record(event(game)); const p = r.data().rounds[0].participants[1], errors = p.metrics.tones.filter(t => !t.fixed).map(t => t.centsError);
    assert.equal(p.metrics.toneCount, n); assert.equal(p.metrics.referencePositions.length, refs); assert.equal(errors.length, n - refs); assert(Math.abs(Math.sqrt(errors.reduce((sum, x) => sum + x * x, 0) / errors.length) - p.error) < 1e-8);
}
const local = Playtest.create({ source: 'automated' }); local.enable(true); const e = event(g); e.mode = 'local'; e.reason = 'timeout'; e.elapsedMs = e.timeline.deadline - e.timeline.answerAt + 10000; e.participants = [{ ...e.participants[0], damageTaken: undefined, hpBefore: undefined, hpRemaining: undefined }];
assert(local.record(e)); const p = local.data().rounds[0].participants[0]; assert.equal(p.timedOut, true); assert.equal(p.damageTaken, null); assert.equal(p.hpRemaining, null); assert.equal(p.lateObservationMs, 10000); assert.equal(p.answerElapsedMs, local.data().rounds[0].answerMs);
local.enable(false); assert.equal(local.record({ ...e, round: 2 }), false); local.clear(); assert.equal(local.data().rounds.length, 0); assert.equal(local.data().sessions.length, 0);
assert.deepEqual(Analysis.stats([0, 10, 20, null, NaN]), { n: 3, mean: 10, median: 10, p10: 2, p90: 18, min: 0, max: 20, sd: Math.sqrt(200 / 3) });
assert.throws(() => Analysis.validate({ format: 'other' }));
console.log('PASS: '+questionCount+' legacy/current completed rounds, anonymous detached JSON/CSV, all variant metrics, source isolation, duplicate-safe summaries, timing provenance, unknown versus missing/timeout, score spreads versus damage and unchanged settlement/configuration. Synthetic data is test evidence only.');
