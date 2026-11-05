/* Accepted-state feedback and local handoff gating. No DOM, game rules or timers. */
(function (root, factory) {
    'use strict';
    var feedback = factory();
    if (typeof module === 'object' && module.exports) module.exports = feedback;
    else root.DartsFeedback = feedback;
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var TIMING = Object.freeze({ turn: 1200, bust: 1200, penalty: 1300, finalHit: 1000, cork: 1600 });
    function timestamp(value) { return Number.isFinite(value) ? value : Date.now(); }
    function owner(state, player) {
        return state.owners && state.owners[player] != null ? state.owners[player] : player;
    }
    function human(state, player) {
        var participant = state.participants && state.participants[player];
        return !participant || !participant.type || participant.type === 'human';
    }
    function identity(state) {
        return JSON.stringify([state.matchId == null ? '' : state.matchId, state.leg,
            state.phase, state.round, state.active]);
    }
    function corkIdentity(state) {
        return state.status === 'playing' && state.phase === 'cork' ? JSON.stringify([
            state.matchId || '', state.leg, state.corkPurpose || 'tie', state.corkRound || 1,
            state.corkPlayers || []]) : '';
    }
    function corkFinish(state, dart) {
        if (dart.phase !== 'cork') return null;
        if (state.status !== 'playing' && state.legEndReason === 'cork') return { kind: 'win', player: state.legWinner };
        if (state.status !== 'playing') return null;
        if (dart.corkPurpose === 'opening' && state.phase === 'play') return { kind: 'starter', player: state.openingWinner };
        if (state.phase === 'cork' && state.corkRound > dart.corkRound) return {
            kind: 'rethrow', round: state.corkRound, players: (state.corkPlayers || []).slice() };
        return null;
    }
    // Retain the just-completed comparison after the authoritative state clears it.
    function completedCork(state, dart) {
        var purpose = dart.corkPurpose || 'tie', history = (state.history || []).filter(function (row) {
            return row.leg === state.leg && row.phase === 'cork' && (row.corkPurpose || 'tie') === purpose && row.corkRound <= dart.corkRound;
        });
        var rows = history.filter(function (row) { return row.corkRound === dart.corkRound; });
        var retained = {}, recent = history.slice().reverse().filter(function (row) {
            retained[row.uid] = (retained[row.uid] || 0) + 1; return retained[row.uid] <= 2;
        }).reverse();
        return { status: 'playing', phase: 'cork', leg: state.leg, players: state.players.slice(),
            withdrawn: (state.withdrawn || []).slice(), active: dart.uid, corkPurpose: purpose,
            corkRound: dart.corkRound, corkPlayers: rows.map(function (row) { return row.uid; }),
            corkDistances: Object.fromEntries(rows.map(function (row) { return [row.uid, Number.isFinite(row.distance) ? row.distance : 1e9]; })),
            history: recent };
    }
    function create(options) {
        var controllerId = options && options.controllerId;
        var previous, handoff, notice, penalties, penaltyUntil, eventKey, seen, finalHit, finalUntil, queuedCork, queuedOutcome, lastHuman;
        function reset() {
            previous = null; handoff = null; notice = null;
            penalties = {}; penaltyUntil = 0; eventKey = ''; seen = new Set();
            finalHit = null; finalUntil = 0;
            queuedCork = null; queuedOutcome = null; lastHuman = null;
        }
        reset();
        function showQueuedCork(now) {
            if (finalHit && now < finalUntil) return;
            if ((queuedOutcome || queuedCork) && !handoff && (!notice || notice.value.kind === 'turn' || now >= notice.until)) {
                notice = { value: queuedOutcome || queuedCork, until: now + TIMING.cork };
                queuedOutcome = null; queuedCork = null;
            }
        }
        function snapshot(at) {
            var now = timestamp(at), currentNotice = notice && now < notice.until ? notice : null;
            var resultPending = !!finalHit && now < finalUntil;
            return {
                handoff: handoff ? { key: handoff.key, player: handoff.player,
                    visible: now >= handoff.visibleAt, outcome: handoff.outcome || null } : null,
                blocking: !!handoff || !!(resultPending && finalHit.corkOutcome && finalHit.corkOutcome.kind !== 'win'),
                notice: currentNotice && !resultPending ? Object.assign({}, currentNotice.value) : null,
                penalties: now < penaltyUntil ? Object.assign({}, penalties) : {},
                eventKey: eventKey,
                resultPending: resultPending,
                finalHit: resultPending ? JSON.parse(JSON.stringify(finalHit)) : null
            };
        }
        function update(state, context) {
            context = context || {};
            var now = timestamp(context.now);
            if (!state || (state.status !== 'playing' && state.status !== 'between' && state.status !== 'over')) {
                reset(); return snapshot(now);
            }
            var controllerChanged = Object.prototype.hasOwnProperty.call(context, 'controllerId') &&
                controllerId !== context.controllerId;
            if (Object.prototype.hasOwnProperty.call(context, 'controllerId')) controllerId = context.controllerId;
            if (controllerChanged) lastHuman = null;
            var matchId = state.matchId == null ? '' : state.matchId;
            if (previous && previous.matchId !== matchId) reset();
            // A delayed older snapshot must not revive a confirmed or obsolete handoff.
            if (previous && Number.isFinite(previous.seq) && Number.isFinite(state.seq) && state.seq < previous.seq) {
                return snapshot(now);
            }
            var key = identity(state), changed = previous && key !== previous.key;
            var corkKey = corkIdentity(state), corkChanged = corkKey && (!previous || previous.corkKey !== corkKey);
            if (!corkKey) {
                queuedCork = null;
                if (notice && ['cork', 'cork-rethrow'].includes(notice.value.kind)) notice = null;
            }
            if ((previous && previous.leg !== state.leg) || (finalHit && finalHit.seq !== state.seq) ||
                ['left', 'cancelled', 'practice-ended'].includes(state.endReason)) {
                finalHit = null; finalUntil = 0; queuedOutcome = null;
            }
            if (changed || controllerChanged) {
                handoff = null; notice = null;
                if (previous && (previous.leg !== state.leg || previous.phase !== state.phase)) {
                    penalties = {}; penaltyUntil = 0;
                }
            }
            if (changed && !controllerChanged && state.status === 'playing' && previous.active !== state.active) {
                var priorHuman = previous.human ? previous.owner === controllerId ? previous.active : null :
                    lastHuman && lastHuman.owner === controllerId ? lastHuman.player : null;
                if (controllerId != null && priorHuman && priorHuman !== state.active && owner(state, state.active) === controllerId && human(state, state.active)) {
                    handoff = { key: key, player: state.active, visibleAt: now };
                } else {
                    notice = { value: { kind: 'turn', player: state.active, key: key }, until: now + TIMING.turn };
                }
            }
            if (corkChanged) {
                queuedCork = { kind: previous && previous.phase === 'cork' && previous.corkPurpose === (state.corkPurpose || 'tie') &&
                    (state.corkRound || 1) > previous.corkRound ? 'cork-rethrow' : 'cork',
                    key: corkKey, purpose: state.corkPurpose || 'tie', round: state.corkRound || 1,
                    roundLimit: state.roundLimit || 0, players: (state.corkPlayers || []).slice() };
            }
            var event = context.throwEvent;
            if (event && event.id != null && !seen.has(String(event.id))) {
                eventKey = String(event.id); seen.add(eventKey);
                var dart = event.dart || {}, actual = dart.penalties || {};
                if (dart.uid && human(state, dart.uid) && owner(state, dart.uid) === controllerId) {
                    lastHuman = { player: dart.uid, owner: controllerId };
                }
                var corkOutcome = corkFinish(state, dart);
                if ((state.status !== 'playing' || corkOutcome) && dart.result &&
                    !['left', 'cancelled', 'practice-ended'].includes(state.endReason)) {
                    finalHit = { key: eventKey, seq: state.seq, dart: JSON.parse(JSON.stringify(dart)),
                        corkOutcome: corkOutcome, corkState: corkOutcome ? completedCork(state, dart) : null };
                    finalUntil = now + TIMING.finalHit;
                    if (handoff) { handoff.visibleAt = Math.max(handoff.visibleAt, finalUntil); handoff.outcome = corkOutcome; }
                    if (corkOutcome && corkOutcome.kind === 'starter' && !handoff) {
                        queuedOutcome = { kind: 'cork-starter', key: eventKey + ':starter', player: corkOutcome.player };
                    }
                }
                penalties = {};
                if (state.mode === 'cricket' && state.cricketVariant === 'cutthroat') {
                    Object.keys(actual).forEach(function (player) {
                        if (Number.isFinite(actual[player]) && actual[player] > 0) penalties[player] = actual[player];
                    });
                }
                penaltyUntil = now + TIMING.penalty;
                if (notice && ['bust', 'cork-starter'].includes(notice.value.kind)) notice = null;
                if (dart.reason === 'bust' && state.status === 'playing') {
                    var restored = Number.isFinite(event.restoredScore) ? event.restoredScore :
                        state.scores && state.scores[dart.uid];
                    var bust = { kind: 'bust', player: dart.uid, key: eventKey };
                    if (Number.isFinite(restored)) bust.restoredScore = restored;
                    notice = { value: bust, until: now + TIMING.bust };
                    // Input is blocked now; the handoff becomes visible after the rollback explanation.
                    if (handoff) handoff.visibleAt = notice.until;
                }
            }
            if (state.status !== 'playing') {
                handoff = null; notice = null; queuedCork = null; queuedOutcome = null;
            } else if (handoff && (!notice || notice.value.kind !== 'bust')) {
                notice = null;
            }
            showQueuedCork(now);
            if (!handoff && human(state, state.active) && owner(state, state.active) === controllerId) {
                lastHuman = { player: state.active, owner: controllerId };
            }
            previous = { key: key, matchId: matchId, seq: state.seq, active: state.active,
                owner: owner(state, state.active), human: human(state, state.active), leg: state.leg, phase: state.phase,
                corkKey: corkKey, corkPurpose: state.corkPurpose || 'tie', corkRound: state.corkRound || 1 };
            return snapshot(now);
        }
        function confirm(at, expectedKey) {
            var current = snapshot(at);
            if (!current.handoff || !current.handoff.visible ||
                (expectedKey != null && current.handoff.key !== expectedKey)) return false;
            handoff = null;
            if (previous.human && previous.owner === controllerId) lastHuman = { player: previous.active, owner: controllerId };
            showQueuedCork(timestamp(at));
            return true;
        }
        // A coded local match may retain the same device after its room reservation is lost.
        function rebindController(from, to) {
            if (controllerId !== from) return false;
            controllerId = to;
            if (previous && previous.owner === from) previous.owner = to;
            if (lastHuman && lastHuman.owner === from) lastHuman.owner = to;
            return true;
        }
        return { update: update, snapshot: snapshot, confirm: confirm, reset: reset,
            rebindController: rebindController };
    }
    return { create: create, TIMING: TIMING };
});
