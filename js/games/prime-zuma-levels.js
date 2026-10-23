/* Prime Zuma — level & field DATA (edit THIS file to design content; the engine lives in prime-zuma.js).
 *
 * FIELDS: each is a board = spiral geometry (turns / inner-death radius / outer-source radius) + a visual
 *   theme (background + accent). Rout must fit the 460px canvas (keep <= 214). X = number of fields.
 *
 * level(world, fieldIdx): the per-level difficulty for 一般/Levels mode. Levels are numbered world-field,
 *   world 1..4 × field 1..X = 4·X levels, getting harder with the overall ordinal. Returns the knobs the
 *   engine reads: which primes, the value cap, the max prime-factor count Ω, feed speed, the pick bias, and
 *   `quota` = how many balls the level spawns (clear them ALL to win). Tune freely.
 *
 * ENDLESS: base difficulties for 無盡/Endless; the engine ramps cap/feed/bias/Ω over time on top (speed
 *   growth kept gentle) and unlocks more primes as time passes. Field is chosen separately.
 */
window.PrimeZumaData = (function () {
    // Each field has a `shape` the engine knows how to draw into a path (death end first, source last) plus a
    // cannon position: 'spiral' & 'square' spiral inward to a centre cannon; 'snake' serpentines top→bottom with
    // the cannon at the bottom. (More shapes — double-spiral, underground, star — are a later phase.)
    // Rin is kept large so the inner (death) end clears the centre cannon + its muzzle ball. 'square' is a smooth
    // ROUNDED square (squircle, exponent n) — no hard 90° corners; 'snake' is a smooth sine weave (amp/waves).
    var FIELDS = [
        { id: 'vortex',  name: 'Vortex',  shape: 'spiral', turns: 3, Rin: 70, Rout: 214, phase: -0.7854, ox: 4, oy: 16, bg: '#130d20', accent: '#8b5cf6' },
        { id: 'box',     name: 'Box',     shape: 'square', turns: 3, Rin: 70, Rout: 184, n: 3.0, ox: 12, oy: 6, phase: 0.2, mirror: true, bg: '#0a1020', accent: '#3b82f6' },
        { id: 'serpent', name: 'Serpent', shape: 'snake',  rows: 4,                              bg: '#08140e', accent: '#10b981' },
        { id: 'tri',     name: 'Tri',     shape: 'poly',   sides: 3, polyAmp: 0.17, turns: 3, Rin: 70, Rout: 190, ox: -28, oy: 6, canDy: -12, exitAng: 0.52, bg: '#160f08', accent: '#f97316' },
        { id: 'twin',    name: 'Twin',    shape: 'dual',   turns: 2, Rin: 70, Rout: 214,         bg: '#160a12', accent: '#ec4899', accent2: '#2dd4bf' },
        { id: 'star',    name: 'Star',    shape: 'star',   Rstar: 292, tipR: 38, phase: -1.5708, oy: 18, deathT: 0.72, bg: '#14110a', accent: '#eab308' },
        { id: 'maze',    name: 'Maze',    shape: 'square', turns: 3, Rin: 70, Rout: 188, n: 3.2, phase: -0.7854, oy: 12, buryHorizontal: true, bg: '#08161a', accent: '#06b6d4' },
        { id: 'clover',  name: 'Clover',  shape: 'clover', gx: 70, gy: 70, leafR: 64,            bg: '#0c1407', accent: '#a3e635' },
        { id: 'helix',   name: 'Helix',   shape: 'spiral', turns: 3, Rin: 70, Rout: 214, phase: -0.7854, mirror: true, ox: -4, oy: 16, bg: '#170a1a', accent: '#d946ef' },
    ];
    var X = FIELDS.length;

    function lerp(a, b, t) { return a + (b - a) * t; }
    function level(world, fieldIdx) {
        var ord = (world - 1) * X + fieldIdx;              // 0-based progress across all 4·X levels
        var prog = (4 * X - 1) > 0 ? ord / (4 * X - 1) : 0;
        var primes = world >= 4 ? [2, 3, 5, 7, 11] : world >= 2 ? [2, 3, 5, 7] : [2, 3, 5];
        return {
            field: FIELDS[fieldIdx],
            primes: primes,
            cap: Math.round(lerp(18, 90, prog)),           // value ceiling grows with the level
            maxOmega: world >= 3 ? 4 : 3,                  // allow gnarlier numbers later (still < 5 → no 32/48)
            feed: lerp(11, 18, prog),                      // forward creep — kept gentle
            bias: lerp(0.38, 0.9, prog),                   // simple → complex number mix
            quota: 20 + ord * 5,                           // balls spawned this level; clear them all to win
        };
    }

    var ENDLESS = {
        easy:   { primes: [2, 3, 5],        unlockEvery: Infinity, capA: 20, capB: 40,  feedA: 12, feedB: 17, biasA: 0.40, biasB: 0.80, omegaA: 2, omegaB: 3, ramp: 170 },
        normal: { primes: [2, 3, 5, 7],     unlockEvery: 45,       capA: 28, capB: 70,  feedA: 14, feedB: 21, biasA: 0.45, biasB: 0.92, omegaA: 3, omegaB: 4, ramp: 150 },
        hard:   { primes: [2, 3, 5, 7, 11], unlockEvery: 35,       capA: 40, capB: 120, feedA: 17, feedB: 27, biasA: 0.52, biasB: 1.05, omegaA: 3, omegaB: 4, ramp: 130 },
    };

    return { FIELDS: FIELDS, X: X, level: level, ENDLESS: ENDLESS };
})();
