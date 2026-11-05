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
    function create(options) {
        var controllerId = options && options.controllerId;
        var previous, handoff, notice, penalties, penaltyUntil, eventKey, seen, finalHit, finalUntil, queuedCork;
        function reset() {
            previous = null; handoff = null; notice = null;
            penalties = {}; penaltyUntil = 0; eventKey = ''; seen = new Set();
            finalHit = null; finalUntil = 0;
            queuedCork = null;
        }
        reset();
        function showQueuedCork(now) {
            if (queuedCork && !handoff && (!notice || notice.value.kind === 'turn' || now >= notice.until)) {
                notice = { value: queuedCork, until: now + TIMING.cork }; queuedCork = null;
            }
        }
        function snapshot(at) {
            var now = timestamp(at), currentNotice = notice && now < notice.until ? notice : null;
            var resultPending = !!finalHit && now < finalUntil;
            return {
                handoff: handoff ? { key: handoff.key, player: handoff.player,
                    visible: now >= handoff.visibleAt } : null,
                blocking: !!handoff,
                notice: currentNotice ? Object.assign({}, currentNotice.value) : null,
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
            if ((previous && previous.leg !== state.leg) || state.status === 'playing' ||
                ['left', 'cancelled', 'practice-ended'].includes(state.endReason)) {
                finalHit = null; finalUntil = 0;
            }
            if (changed || controllerChanged) {
                handoff = null; notice = null;
                if (previous && (previous.leg !== state.leg || previous.phase !== state.phase)) {
                    penalties = {}; penaltyUntil = 0;
                }
            }
            if (changed && !controllerChanged && state.status === 'playing' && previous.active !== state.active) {
                if (controllerId != null && previous.owner === controllerId && owner(state, state.active) === controllerId &&
                    previous.human && human(state, state.active)) {
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
                if (state.status !== 'playing' && dart.result &&
                    !['left', 'cancelled', 'practice-ended'].includes(state.endReason)) {
                    finalHit = { key: eventKey, dart: JSON.parse(JSON.stringify(dart)) };
                    finalUntil = now + TIMING.finalHit;
                }
                penalties = {};
                if (state.mode === 'cricket' && state.cricketVariant === 'cutthroat') {
                    Object.keys(actual).forEach(function (player) {
                        if (Number.isFinite(actual[player]) && actual[player] > 0) penalties[player] = actual[player];
                    });
                }
                penaltyUntil = now + TIMING.penalty;
                if (notice && notice.value.kind === 'bust') notice = null;
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
                handoff = null; notice = null; queuedCork = null;
            } else if (handoff && (!notice || notice.value.kind !== 'bust')) {
                notice = null;
            }
            showQueuedCork(now);
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
            showQueuedCork(timestamp(at));
            return true;
        }
        // A coded local match may retain the same device after its room reservation is lost.
        function rebindController(from, to) {
            if (controllerId !== from) return false;
            controllerId = to;
            if (previous && previous.owner === from) previous.owner = to;
            return true;
        }
        return { update: update, snapshot: snapshot, confirm: confirm, reset: reset,
            rebindController: rebindController };
    }
    return { create: create, TIMING: TIMING };
});
