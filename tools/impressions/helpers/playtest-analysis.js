/* Descriptive statistics only. No scoring, generation, tuning or network calls. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./pitch-calibration.js'));
    else root.ImpressionsPlaytestAnalysis = factory(root.ImpressionsPitchCalibration);
})(typeof window === 'object' ? window : globalThis, function (PitchCalibration) {
    'use strict';
    function stats(values) {
        var sorted = values.filter(Number.isFinite).slice().sort(function (a, b) { return a - b; }), n = sorted.length;
        if (!n) return { n: 0, mean: null, median: null, p10: null, p90: null, min: null, max: null, sd: null };
        function q(p) { var index = (n - 1) * p, low = Math.floor(index); return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low); }
        var mean = sorted.reduce(function (sum, v) { return sum + v; }, 0) / n;
        return { n: n, mean: mean, median: q(0.5), p10: q(0.1), p90: q(0.9), min: sorted[0], max: sorted[n - 1],
            sd: Math.sqrt(sorted.reduce(function (sum, v) { return sum + (v - mean) ** 2; }, 0) / n) };
    }
    function validate(data) {
        if (!data || data.format !== 'gamebox-memory-playtest' || data.version !== 1 || !['human', 'synthetic', 'automated'].includes(data.source)
            || typeof data.recordingId !== 'string' || data.recordingId.length > 150 || !Array.isArray(data.sessions) || !Array.isArray(data.rounds)
            || data.rounds.length > 2000 || data.sessions.length > 2000) throw new TypeError('Unsupported playtest JSON format/version or size.');
        var sessions = new Set();
        data.sessions.forEach(function (s) { if (!s || !/^s[1-9]\d*$/.test(s.id) || sessions.has(s.id) || !['local', 'online'].includes(s.mode) || !['color-only', 'quantity-only', 'pitch-only', 'mixed'].includes(s.kind)) throw new TypeError('Invalid session.'); sessions.add(s.id); });
        var seen = new Set();
        data.rounds.forEach(function (r) {
            if (!r || typeof r !== 'object') throw new TypeError('Invalid completed round.');
            var key = r.sessionId + ':' + r.round;
            if (!r || !sessions.has(r.sessionId) || !Number.isInteger(r.round) || r.round < 1 || seen.has(key) || !['color', 'quantity', 'pitch'].includes(r.category)
                || typeof r.variant !== 'string' || r.variant.length > 80 || !Array.isArray(r.participants) || !r.participants.length || r.participants.length > 8
                || !Number.isFinite(r.answerMs) || r.answerMs <= 0 || !Number.isFinite(r.memorizeMs) || r.memorizeMs <= 0) throw new TypeError('Invalid completed round.');
            seen.add(key); var ids = new Set();
            r.participants.forEach(function (p) { if (!p || !/^p[1-8]$/.test(p.id) || ids.has(p.id) || !Number.isFinite(p.score) || p.score < 0 || p.score > 100
                || ![true, false, null].includes(p.timedOut) || !p.metrics || !['oklab', 'relative-count', 'cents'].includes(p.metrics.unit)
                || p.answerElapsedMs !== null && (!Number.isFinite(p.answerElapsedMs) || p.answerElapsedMs < 0 || p.answerElapsedMs > r.answerMs)) throw new TypeError('Invalid participant observation.'); ids.add(p.id); });
        });
        data.rounds.forEach(function(r){r.participants.forEach(function(p){if(p.participantType!==undefined&&!['human','cpu'].includes(p.participantType)||p.participantType==='cpu'&&(!Number.isInteger(p.cpuDifficulty)||p.cpuDifficulty<1||p.cpuDifficulty>4||!Number.isInteger(p.cpuVersion)||p.cpuVersion<1))throw new TypeError('Invalid participant type or CPU metadata.');});});
        return data;
    }
    function summarize(inputs, options) {
        options = options || {}; var source = options.source || 'human', selfOnly = !!options.selfOnly, unique = new Map(), sessions = new Map(), excluded = 0;
        inputs.forEach(function (input) {
            var data = validate(input);
            if (source !== 'all' && data.source !== source) { excluded += data.rounds.length; return; }
            data.sessions.forEach(function (session) {
                var key = data.recordingId + ':' + session.id, previous = sessions.get(key);
                if (!previous || session.completedRounds > previous.completedRounds) sessions.set(key, Object.assign({ recordingId: data.recordingId, source: data.source }, session));
            });
            data.rounds.forEach(function (round) {
                var key = data.recordingId + ':' + round.sessionId + ':' + round.round, previous = unique.get(key);
                if (previous && JSON.stringify(previous.round) !== JSON.stringify(round)) throw new TypeError('Conflicting duplicate round. Import a consistent export.');
                unique.set(key, { round: round, recordingId: data.recordingId, source: data.source, session: sessions.get(data.recordingId + ':' + round.sessionId) });
            });
        });
        var rounds = Array.from(unique.values()), observations = [], groups = new Map(), difficulty = new Map(), spreads = new Map(), progression = [];
        function append(map, key, value) { if (!map.has(key)) map.set(key, []); map.get(key).push(value); }
        rounds.forEach(function (entry) {
            var r = entry.round, label = r.category + ' / ' + r.variant;
            append(spreads, label, r);
            progression.push({ session: entry.recordingId + ':' + r.sessionId, source: entry.source, kind: entry.session.kind, round: r.round,
                category: r.category, policy:r.challengePolicy||'legacy',band:r.challengeBand||null,stage:r.quantityStage,stageAfter:r.quantityStageAfter,base: r.baseDifficulty, effective: r.effectiveDifficulty, after: r.difficultyAfter });
            r.participants.filter(function (p) { return (!selfOnly || p.self)&&(options.includeCpu===true||p.participantType!=='cpu'); }).forEach(function (p) {
                var o = Object.assign({ round: r, session: entry.session, source: entry.source }, p); observations.push(o);
                append(groups, r.category, o); append(groups, label, o);
                if (Number.isFinite(r.effectiveDifficulty)) append(difficulty, r.category + (r.challengePolicy==='seeded-random-v1'?' random':'') + ' / L' + Math.round(r.effectiveDifficulty), o);
            });
        });
        function summarizeGroup(entry) {
            var label = entry[0], values = entry[1], known = values.filter(function (v) { return v.timedOut !== null; });
            return { label: label, n: values.length, scores: stats(values.map(function (v) { return v.score; })),
                histogram: [0, 20, 40, 60, 80].map(function (low) { return values.filter(function (v) { return v.score >= low && (low === 80 ? v.score <= 100 : v.score < low + 20); }).length; }),
                answerTime: stats(values.map(function (v) { return v.answerElapsedMs; })),
                receiptTimeN: values.filter(function (v) { return v.timeSource === 'accepted-receipt' && v.answerElapsedMs !== null; }).length,
                knownTimeoutN: known.length, timeoutN: known.filter(function (v) { return v.timedOut; }).length,
                timeoutRate: known.length ? known.filter(function (v) { return v.timedOut; }).length / known.length : null,
                missingN: values.filter(function (v) { return v.missing; }).length,
                error: stats(values.map(function (v) { return v.error; })), unit: values[0].metrics.unit,
                damage: stats(values.map(function (v) { return v.damageTaken; })),
                scoringVersions: Array.from(new Set(values.map(function (v) { return v.round.scoringVersion; }))).join(',') };
        }
        return { source: source, selfOnly: selfOnly, rounds: rounds.length, observations: observations.length, excludedRounds: excluded,
            sessions: Array.from(sessions.values()), groups: Array.from(groups.entries()).map(summarizeGroup), difficulty: Array.from(difficulty.entries()).map(summarizeGroup),
            pitchCalibration: PitchCalibration.observations(observations).map(function (g) { return { label: g.label, observations: g.observations, error: stats(g.validErrors), scoreComparisons: g.scores.map(stats),
                elapsedFraction: stats(g.fractions), timeouts: g.knownTimeouts.filter(Boolean).length, timeoutKnown: g.knownTimeouts.length, missing: g.missing, initialRms: stats(g.initialRms), unreachableTargets: g.unreachable }; }),
            spreads: Array.from(spreads.entries()).map(function (entry) { return { label: entry[0], rounds: entry[1].length,
                spread: stats(entry[1].map(function (r) { return r.scoreSpread; })),
                absolutePairDifferences: stats(entry[1].flatMap(function (r) { return r.scoreDifferences.map(function (p) { return Math.abs(p.difference); }); })) }; }), progression: progression };
    }
    return { validate: validate, stats: stats, summarize: summarize };
});
