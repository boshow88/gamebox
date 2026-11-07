/* First-leg random starter presentation. Selection remains the accepted game's active slot. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.DartsOpening = factory();
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var TIMING = Object.freeze({ draw: 1000, reveal: 900 });
    function prepare(state) {
        if (state.openingDraw || state.leg !== 1 || state.seq !== 0 || state.mode === 'practice' || state.players.length < 2 || state.startingPlayer !== 'random' || state.phase !== 'play') return state;
        var at = state.turnStartedAt;
        state.openingDraw = { at: at, player: state.active };
        state.readyAt = at + TIMING.draw + TIMING.reveal;
        state.turnStartedAt = state.readyAt;
        return state;
    }
    function model(state, now, reducedMotion) {
        var draw = state && state.openingDraw;
        if (!draw || state.status !== 'playing' || state.leg !== 1 || state.phase !== 'play' || state.seq !== 0 ||
            state.active !== draw.player || !Number.isFinite(draw.at) || !state.players.includes(draw.player)) return null;
        var until = draw.at + TIMING.draw + TIMING.reveal;
        if (now >= until) return null;
        var elapsed = Math.max(0, now - draw.at), drawing = !reducedMotion && elapsed < TIMING.draw;
        var winner = state.players.indexOf(draw.player), steps = state.players.length * 2 + winner;
        var progress = Math.min(1, elapsed / TIMING.draw), step = Math.floor((1 - Math.pow(1 - progress, 2)) * steps);
        return { drawing: drawing, player: drawing ? state.players[step % state.players.length] : draw.player,
            winner: draw.player, until: until };
    }
    return { prepare: prepare, model: model, TIMING: TIMING };
});
