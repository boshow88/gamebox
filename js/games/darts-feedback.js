/* Accepted-state feedback and local handoff gating. No DOM, game rules or timers. */
(function (root, factory) {
    'use strict';
    var feedback = factory();
    if (typeof module === 'object' && module.exports) module.exports = feedback;
    else root.DartsFeedback = feedback;
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var TIMING = Object.freeze({ turn: 1200, bust: 1200, penalty: 1300 });
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
    function create(options) {
        var controllerId = options && options.controllerId;
        var previous, handoff, notice, penalties, penaltyUntil, eventKey, seen;
        function reset() {
            previous = null; handoff = null; notice = null;
            penalties = {}; penaltyUntil = 0; eventKey = ''; seen = new Set();
        }
        reset();
        function snapshot(at) {
            var now = timestamp(at), currentNotice = notice && now < notice.until ? notice : null;
            return {
                handoff: handoff ? { key: handoff.key, player: handoff.player,
                    visible: now >= handoff.visibleAt } : null,
                blocking: !!handoff,
                notice: currentNotice ? Object.assign({}, currentNotice.value) : null,
                penalties: now < penaltyUntil ? Object.assign({}, penalties) : {},
                eventKey: eventKey
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
            var event = context.throwEvent;
            if (event && event.id != null && !seen.has(String(event.id))) {
                eventKey = String(event.id); seen.add(eventKey);
                var dart = event.dart || {}, actual = dart.penalties || {};
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
                handoff = null; notice = null;
            } else if (handoff && (!notice || notice.value.kind !== 'bust')) {
                notice = null;
            }
            previous = { key: key, matchId: matchId, seq: state.seq, active: state.active,
                owner: owner(state, state.active), human: human(state, state.active), leg: state.leg, phase: state.phase };
            return snapshot(now);
        }
        function confirm(at, expectedKey) {
            var current = snapshot(at);
            if (!current.handoff || !current.handoff.visible ||
                (expectedKey != null && current.handoff.key !== expectedKey)) return false;
            handoff = null;
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
