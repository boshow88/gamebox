/* Opt-in, local-only observations of completed Memory rounds. Never used by reducers. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./memory-categories.js'), require('./memory-color.js'), require('./memory-color-variants.js'));
    else root.MemoryPlaytest = factory(root.MemoryCategories, root.MemoryColor, root.MemoryColorVariants);
})(typeof window === 'object' ? window : globalThis, function (Categories, Color, Colors) {
    'use strict';
    var FORMAT = 'gamebox-memory-playtest', VERSION = 1, MAX_ROUNDS = 2000, serial = 0;
    var SOURCES = ['human', 'synthetic', 'automated'], TYPES = ['color', 'quantity', 'pitch'];
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function number(value) { return Number.isFinite(value) ? value : null; }
    function scoreDifference(a, b) { return Math.round((a - b) * 1000) / 1000; }
    // Configurations contain numbers/booleans. Do not copy arbitrary string fields,
    // participant objects, room codes, Firebase IDs, nonces or timestamps into exports.
    function settings(value, depth) {
        depth = depth || 0;
        if (depth > 10) return undefined;
        if (typeof value === 'boolean' || Number.isFinite(value)) return value;
        if (!value || typeof value !== 'object') return undefined;
        if (Array.isArray(value)) return value.slice(0, 100).map(function (v) { return settings(v, depth + 1); }).filter(function (v) { return v !== undefined; });
        var result = {};
        Object.keys(value).slice(0, 100).forEach(function (key) {
            if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(key) || /name|uid|token|nonce|email|auth|controller|password/i.test(key)) return;
            var clean = settings(value[key], depth + 1);
            if (clean !== undefined) result[key] = clean;
        });
        return result;
    }
    function configuration(config) {
        var result = {};
        ['selectionVersion', 'categoryWeights', 'adaptive', 'generation', 'scoring', 'color', 'quantity', 'pitch', 'cpu', 'timing', 'multiplierSchedule', 'startingHp', 'maxRounds', 'autoSubmitLeadMs', 'initialAnswer'].forEach(function (key) {
            if (config[key] !== undefined) result[key] = settings(config[key]);
        });
        return result;
    }
    function sessionKind(config) {
        var enabled = config.selectionVersion === 3 ? TYPES.filter(function (id) { return config.categoryWeights[id] > 0; })
            : config.categoryMode === 'mixed' ? TYPES : [config.categoryMode || 'color'];
        return enabled.length === 1 ? enabled[0] + '-only' : 'mixed';
    }
    function metrics(q, answer, config) {
        var grade = Categories.grade(q, answer, config), valid = grade.valid;
        if (q.type === 'color') {
            var swatches = q.version === 2 && q.variant !== 'single' ? q.swatches : ['single'];
            return { unit: 'oklab', combinedError: number(grade.error), swatches: swatches.map(function (id) {
                var target = swatches[0] === 'single' ? q.target : Colors.answerRgb(q, q.target, id);
                var rgb = valid ? q.version === 2 ? Colors.answerRgb(q, answer, id) : answer : null;
                return { id: id, targetRgb: target.slice(), answerRgb: rgb, error: valid ? Color.calculateColorError(target, rgb) : null };
            }) };
        }
        if (q.type === 'quantity') {
            var ids = q.version === 2 ? q.groups.map(function (group) { return group.id; }) : ['single'];
            return { unit: 'relative-count', combinedError: number(grade.error), groups: ids.map(function (id) {
                var target = q.version === 2 ? q.target[id] : q.target, value = valid ? q.version === 2 ? answer[id] : answer : null;
                return { id: id, targetCount: target, answerCount: value, signedRelativeError: valid ? (value - target) / target : null,
                    relativeError: valid ? Math.abs(value - target) / target : null };
            }) };
        }
        var tones = q.version === 2 ? q.tones : q.target.map(function (_, i) { return 'n' + (i + 1); });
        var fixed = q.version === 2 ? q.fixed : ['n1'];
        return { unit: 'cents', toneCount: tones.length, referencePositions: fixed.map(function (id) { return tones.indexOf(id) + 1; }),
            contour: q.variation ? q.variation.contour : 'legacy', combinedError: number(grade.error), rmsCents: number(grade.error),
            tones: tones.map(function (id, i) { var locked = fixed.includes(id); return { id: id, fixed: locked,
                targetHz: q.version === 2 ? q.target[id] : q.target[i], answerHz: valid ? q.version === 2 ? answer[id] : answer[i] : null,
                centsError: valid && !locked ? q.version === 2 ? grade.errors[id] : grade.errors[i - 1] : null }; }) };
    }
    function variant(q) {
        if (q.type === 'pitch') return q.version === 2 ? 'melody-' + q.tones.length + '-ref' + q.fixed.length : 'legacy-' + q.target.length + '-ref1';
        return q.variant || (q.type === 'color' ? 'legacy-rgb' : 'single');
    }
    function create(options) {
        options = options || {};
        var source = options.source || 'human';
        if (!SOURCES.includes(source)) throw new RangeError('Unknown playtest data source.');
        var enabled = false, sessions = [], rounds = [], matches = new Map(), attempts = new Map(), seen = new Set(), pendingLocal = null, warning = '';
        var recordingId = 'recording-' + Date.now().toString(36) + '-' + (++serial);
        function attempt(event) {
            if (!enabled || !['manual', 'auto'].includes(event.source)) return;
            var key = event.matchId + ':' + event.round;
            if (!attempts.has(key)) attempts.set(key, { source: event.source, elapsedMs: number(event.elapsedMs) });
        }
        function record(event) {
            if (!enabled || !event || !event.completed || !TYPES.includes(event.question && event.question.type)) return false;
            var key = event.mode + ':' + event.matchId, roundKey = key + ':' + event.round;
            if (seen.has(roundKey)) return false;
            if (rounds.length >= MAX_ROUNDS) { enabled = false; warning = 'Record limit reached (2000 rounds). Export, then clear to continue.'; return false; }
            var q = event.question, config = event.config, t = event.timeline, session = matches.get(key);
            if (!session) {
                session = { id: 's' + (sessions.length + 1), matchId: 'm' + (sessions.length + 1), mode: event.mode,
                    kind: sessionKind(config), plannedRounds: event.mode === 'local' ? pendingLocal || 12 : config.maxRounds,
                    firstObservedRound: event.round, completedRounds: 0, status: 'partial', configuration: configuration(config) };
                if (event.mode === 'local') pendingLocal = null;
                sessions.push(session); matches.set(key, session);
            }
            var answerMs = t.deadline - t.answerAt, attemptInfo = attempts.get(event.matchId + ':' + event.round);
            var participants = event.participants.map(function (p) {
                var local = event.mode === 'local', ownAttempt = p.self && attemptInfo;
                var submitted = p.answer !== null && !p.missing;
                var sourceName = local ? event.reason === 'timeout' ? 'timeout' : 'manual' : ownAttempt ? ownAttempt.source : ['manual','auto','cpu'].includes(p.submissionSource) ? p.submissionSource : 'unknown';
                var elapsed = local ? event.elapsedMs : ownAttempt ? ownAttempt.elapsedMs : submitted ? p.acceptedElapsedMs : null;
                return { id: p.id, self: !!p.self,participantType:p.participantType==='cpu'?'cpu':'human',cpuDifficulty:p.participantType==='cpu'?number(p.cpuDifficulty):null,cpuVersion:p.participantType==='cpu'?number(p.cpuVersion):null, submitted: submitted, missing: !!p.missing,
                    status: !submitted ? 'missing' : sourceName === 'timeout' || sourceName === 'auto' ? 'auto-submitted' : 'submitted',
                    submissionSource: sourceName, timedOut: sourceName === 'timeout' || sourceName === 'auto' ? true : submitted && ['manual','cpu'].includes(sourceName) ? false : null,
                    answerElapsedMs: elapsed === null || elapsed === undefined ? null : Math.max(0, Math.min(answerMs, elapsed)),
                    lateObservationMs: elapsed === null || elapsed === undefined ? null : Math.max(0, elapsed - answerMs),
                    timeSource: local ? 'local-lock' : ownAttempt ? 'local-first-attempt' : submitted ? 'accepted-receipt' : 'unavailable',
                    score: number(p.score), error: number(p.error), scoreGapToBest: null,
                    damageTaken: number(p.damageTaken), hpBefore: number(p.hpBefore), hpRemaining: number(p.hpRemaining),
                    metrics: metrics(q, submitted ? p.answer : null, config) };
            });
            var scores = participants.map(function (p) { return p.score; }).filter(Number.isFinite), best = Math.max.apply(null, scores), pairs = [];
            participants.forEach(function (p, i) {
                p.scoreGapToBest = Number.isFinite(p.score) && scores.length > 1 ? scoreDifference(best, p.score) : null;
                participants.slice(i + 1).forEach(function (other) { if (Number.isFinite(p.score) && Number.isFinite(other.score)) pairs.push({ a: p.id, b: other.id, difference: scoreDifference(p.score, other.score) }); });
            });
            rounds.push({ sessionId: session.id, matchId: session.matchId, round: event.round, questionId: 'r' + event.round,
                protocolVersion: event.protocolVersion, questionVersion: q.version, category: q.type, variant: variant(q), seed: q.seed,
                challengePolicy:q.challenge?'seeded-random-v1':q.difficulty?'legacy-adaptive':'legacy-fixed', challengeBand:q.challenge?q.challenge.band:null, sampledChallengeLevel:q.challenge?q.challenge.level:null, quantityStage:q.challenge&&q.type==='quantity'?q.challenge.quantityStage:null, quantityStageAfter:number(event.quantityStageAfter),
                effectiveDifficulty: q.challenge?q.challenge.level:q.difficulty ? q.difficulty.effective : null, baseDifficulty: q.difficulty ? q.difficulty.base : null,
                difficultyAfter: number(event.difficultyAfter), parameters: settings(q.parameters || {}), scoringVersion: q.scoringVersion || config.scoring.version,
                memorizeMs: t.answerAt - t.memorizeAt, answerMs: answerMs, roundMultiplier: number(event.multiplier),
                scoreSpread: scores.length > 1 ? scoreDifference(best, Math.min.apply(null, scores)) : null, scoreDifferences: pairs, participants: participants });
            seen.add(roundKey); attempts.delete(event.matchId + ':' + event.round);
            session.completedRounds++;
            session.status = session.completedRounds >= session.plannedRounds ? 'complete' : event.over ? 'ended-partial' : 'partial';
            session.endedEarly = !!event.over && event.round < session.plannedRounds;
            return true;
        }
        return { enable: function (value) { enabled = !!value; }, enabled: function () { return enabled; }, attempt: attempt, record: record,
            planLocal: function () { pendingLocal = 12; },
            data: function () { return copy({ format: FORMAT, version: VERSION, recordingId: recordingId, source: source, sessions: sessions, rounds: rounds }); },
            status: function () { var last = sessions[sessions.length - 1]; return { enabled: enabled, rounds: rounds.length, sessions: sessions.length, warning: warning,
                latest: last ? { kind: last.kind, completedRounds: last.completedRounds, plannedRounds: last.plannedRounds, status: last.status } : null }; },
            clear: function () { sessions = []; rounds = []; matches.clear(); attempts.clear(); seen.clear(); warning = ''; pendingLocal = null; recordingId = 'recording-' + Date.now().toString(36) + '-' + (++serial); } };
    }
    var COLUMNS = ['recordingId', 'source', 'sessionId', 'matchId', 'sessionKind', 'mode', 'round', 'questionId', 'protocolVersion', 'questionVersion', 'category', 'variant', 'seed', 'challengePolicy','challengeBand','sampledChallengeLevel','quantityStage','quantityStageAfter','effectiveDifficulty', 'baseDifficulty', 'difficultyAfter', 'memorizeMs', 'answerMs', 'participantId','participantType','cpuDifficulty','cpuVersion', 'self', 'status', 'submitted', 'missing', 'timedOut', 'submissionSource', 'answerElapsedMs', 'timeSource', 'lateObservationMs', 'score', 'error', 'roundMultiplier', 'scoreGapToBest', 'scoreSpread', 'damageTaken', 'hpBefore', 'hpRemaining', 'scoringVersion', 'metricsJson', 'parametersJson', 'configurationJson'];
    function csv(data) {
        function cell(v) { if (v === null || v === undefined) return ''; var s = String(v); if (/^[=+@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
        var lines = [COLUMNS.map(cell).join(',')];
        data.rounds.forEach(function (r) { var session = data.sessions.find(function (s) { return s.id === r.sessionId; });
            r.participants.forEach(function (p) {
                var row = Object.assign({}, r, p, { recordingId: data.recordingId, source: data.source, sessionKind: session.kind, mode: session.mode, participantId: p.id,
                    roundMultiplier: r.roundMultiplier, metricsJson: JSON.stringify(p.metrics), parametersJson: JSON.stringify(r.parameters), configurationJson: JSON.stringify(session.configuration) });
                lines.push(COLUMNS.map(function (key) { return cell(row[key]); }).join(','));
            });
        });
        return '\uFEFF' + lines.join('\r\n') + '\r\n';
    }
    return { format: FORMAT, version: VERSION, maxRounds: MAX_ROUNDS, sources: SOURCES, create: create, csv: csv, metrics: metrics };
});
