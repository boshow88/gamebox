/* Reusable Memory battle arithmetic and local phase deadlines. No browser APIs. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MemoryRules = factory();
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    var SCALE = 1000;
    var TIMING = Object.freeze({ prepareMs: 3000, memorizeMs: 4000, answerMs: 25000, resultMinMs: 800 });
    // Experimental only. A later match captures its own schedule at Start.
    var MULTIPLIER = Object.freeze({ base: 1, increase: 0.5, every: 3, max: 4 });
    function units(value, max) {
        if (!Number.isFinite(value) || value < 0 || value > max || !Number.isSafeInteger(Math.round(value * SCALE)))
            throw new RangeError('Value is outside the supported fixed-point range.');
        return Math.round(value * SCALE);
    }
    function scoreToUnits(score) { return units(score, 100); }
    function multiplierParameters(input) {
        if (input && Object.hasOwn(input, 'steps')) {
            if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > 100)
                throw new RangeError('Invalid multiplier steps.');
            return { steps: input.steps.map(function (value) { return units(value, 1000) / SCALE; }) };
        }
        var settings = Object.assign({}, MULTIPLIER, input);
        [settings.base, settings.increase, settings.max].forEach(function (value) { units(value, 1000); });
        if (settings.max < settings.base || !Number.isSafeInteger(settings.every) || settings.every < 1)
            throw new RangeError('Invalid multiplier schedule.');
        return settings;
    }
    function multiplierForRound(round, input) {
        if (!Number.isSafeInteger(round) || round < 1) throw new RangeError('Round must be a positive integer.');
        var settings = multiplierParameters(input);
        if (settings.steps) return settings.steps[Math.min(round - 1, settings.steps.length - 1)];
        var value = settings.base + Math.floor((round - 1) / settings.every) * settings.increase;
        return units(Math.min(settings.max, value), 1000) / SCALE;
    }
    function damageUnits(score, best, multiplier) {
        return Math.round(Math.max(0, best - score) * multiplier / SCALE);
    }
    function calculateDamage(score, best, multiplier) {
        return damageUnits(scoreToUnits(score), scoreToUnits(best), units(multiplier, 1000)) / SCALE;
    }
    function applyDamage(hp, damage) {
        return Math.max(0, units(hp, Number.MAX_SAFE_INTEGER / SCALE) - units(damage, Number.MAX_SAFE_INTEGER / SCALE)) / SCALE;
    }
    function createBattle(ids, options) {
        options = options || {};
        if (!Array.isArray(ids) || ids.length < 2 || ids.length > 8 || new Set(ids).size !== ids.length
            || !ids.every(function (id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(id)
                && !['__proto__', 'constructor', 'prototype'].includes(id); }))
            throw new TypeError('A battle needs 2–8 unique participant IDs.');
        var hp = units(options.startingHp === undefined ? 500 : options.startingHp, 1000000);
        if (!hp) throw new RangeError('Starting HP must be positive.');
        return { version: 1, status: 'playing', participants: ids.slice(), round: 1, settledRound: 0,
            hpUnits: Object.fromEntries(ids.map(function (id) { return [id, hp]; })),
            multiplierSchedule: multiplierParameters(options.multiplierSchedule), lastResult: null, winners: [] };
    }
    function settleRound(state, expectedRound, scores) {
        if (!state || state.status !== 'playing' || state.round !== expectedRound || state.settledRound >= expectedRound) return null;
        if (!scores || typeof scores !== 'object' || Array.isArray(scores)) throw new TypeError('Scores must be a participant map.');
        if (Object.keys(scores).some(function (id) { return !state.participants.includes(id); })) throw new TypeError('Unknown participant.');
        var active = state.participants.filter(function (id) { return state.hpUnits[id] > 0; });
        var accepted = Object.fromEntries(active.map(function (id) {
            var value = Object.hasOwn(scores, id) ? scores[id] : null;
            return [id, value == null ? 0 : scoreToUnits(value)];
        }));
        var best = Math.max.apply(null, active.map(function (id) { return accepted[id]; }));
        var multiplier = multiplierForRound(expectedRound, state.multiplierSchedule), nextHp = Object.assign({}, state.hpUnits);
        var rows = active.map(function (id) {
            var damage = damageUnits(accepted[id], best, units(multiplier, 1000)), before = nextHp[id];
            nextHp[id] = Math.max(0, before - damage);
            return { id: id, scoreUnits: accepted[id], damageUnits: damage, hpBeforeUnits: before,
                hpAfterUnits: nextHp[id], top: accepted[id] === best, eliminated: nextHp[id] === 0 };
        });
        var alive = active.filter(function (id) { return nextHp[id] > 0; });
        return Object.assign({}, state, { round: expectedRound + 1, settledRound: expectedRound,
            hpUnits: nextHp, status: alive.length <= 1 ? 'over' : 'playing', winners: alive.length <= 1 ? alive : [],
            lastResult: { round: expectedRound, multiplier: multiplier, highestScoreUnits: best,
                topIds: rows.filter(function (row) { return row.top; }).map(function (row) { return row.id; }), rows: rows } });
    }
    function timingParameters(input) {
        var settings = Object.assign({}, TIMING, input);
        if (!Object.keys(TIMING).every(function (key) { return Number.isFinite(settings[key]) && settings[key] >= 0 && settings[key] <= 3600000; })
            || settings.memorizeMs === 0 || settings.answerMs === 0) throw new RangeError('Invalid round timing.');
        return settings;
    }
    function createTimeline(startAt, input) {
        if (!Number.isFinite(startAt)) throw new RangeError('Start time must be finite.');
        var settings = timingParameters(input), memorizeAt = startAt + settings.prepareMs;
        return { startAt: startAt, memorizeAt: memorizeAt, answerAt: memorizeAt + settings.memorizeMs,
            deadline: memorizeAt + settings.memorizeMs + settings.answerMs };
    }
    function phaseAt(timeline, now) {
        if (!Number.isFinite(now)) throw new RangeError('Current time must be finite.');
        if (now < timeline.memorizeAt) return 'prepare';
        if (now < timeline.answerAt) return 'memorize';
        if (now < timeline.deadline) return 'answer';
        return 'expired';
    }
    return { SCALE: SCALE, defaults: Object.freeze({ startingHp: 500, timing: TIMING, multiplierSchedule: MULTIPLIER }),
        scoreToUnits: scoreToUnits, multiplierParameters: multiplierParameters, multiplierForRound: multiplierForRound,
        calculateDamage: calculateDamage, applyDamage: applyDamage, createBattle: createBattle, settleRound: settleRound,
        timingParameters: timingParameters, createTimeline: createTimeline, phaseAt: phaseAt };
});
