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
    var FIELDS = [
        { id: 'coil',    name: 'Coil',    shape: 'spiral', turns: 3, Rin: 50, Rout: 210, bg: '#0a1322', accent: '#f59e0b' },
        { id: 'box',     name: 'Box',     shape: 'square', turns: 3, Rin: 40, Rout: 148, bg: '#0b1120', accent: '#38bdf8' },
        { id: 'serpent', name: 'Serpent', shape: 'snake',  rows: 7,                      bg: '#0a1410', accent: '#34d399' },
        { id: 'vortex',  name: 'Vortex',  shape: 'spiral', turns: 4, Rin: 40, Rout: 214, bg: '#140b1e', accent: '#a78bfa' },
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
