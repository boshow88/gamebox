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
        { id: 'vortex',  name: 'Vortex',  shape: 'spiral', turns: 3, Rin: 70, Rout: 214, phase: -0.7854, ox: 4, oy: 16, entryUnder: 40, startBurst: 15, bg: '#130d20', accent: '#8b5cf6' },
        { id: 'box',     name: 'Box',     shape: 'square', turns: 3, Rin: 70, Rout: 184, n: 3.0, ox: 12, oy: 6, phase: 0.2, mirror: true, entryUnder: 90, startBurst: 13, bg: '#0a1020', accent: '#3b82f6' },
        { id: 'serpent', name: 'Serpent', shape: 'snake',  rows: 4, entryUnder: 30, startBurst: 12, bg: '#08140e', accent: '#10b981' },
        { id: 'clover',  name: 'Clover',  shape: 'clover', gx: 70, gy: 70, leafR: 64, deathExt: 44, entryUnder: 30, startBurst: 16, bg: '#0c1407', accent: '#a3e635' },
        { id: 'star',    name: 'Star',    shape: 'star',   Rstar: 292, tipR: 38, phase: -1.5708, oy: 18, deathT: 0.80, entryUnder: 50, startBurst: 16, bg: '#14110a', accent: '#eab308' },
        { id: 'twin',    name: 'Twin',    shape: 'dual',   turns: 2, Rin: 70, Rout: 214, entryUnder: [40, 40], startBurst: 24, bg: '#160a12', accent: '#ec4899', accent2: '#2dd4bf' },
        { id: 'tri',     name: 'Tri',     shape: 'poly',   sides: 3, polyAmp: 0.17, turns: 3, Rin: 70, Rout: 190, ox: -28, oy: 6, canDy: -12, exitAng: 0.52, entryUnder: 110, startBurst: 18, bg: '#160f08', accent: '#f97316' },
        { id: 'eight',   name: 'Eight',   shape: 'infinity', aw: 190, bh: 108, voff: 116, bridgeW: 52, entryUnder: [30, 30], startBurst: 18, bg: '#0c0a16', accents: ['#facc15', '#818cf8'] },
        { id: 'maze',    name: 'Maze',    shape: 'square', turns: 3, Rin: 70, Rout: 188, n: 3.2, phase: -0.7854, oy: 12, buryHorizontal: true, entryUnder: 40, startBurst: 13, bg: '#08161a', accent: '#06b6d4' },
        { id: 'duo',     name: 'Duo',     shape: 'duo',    half: 156, cr: 24, gap: 44, sep: 36, entryUnder: [30, 30], startBurst: 18, bg: '#140a0f', accent: '#fb7185', accent2: '#38bdf8' },
        { id: 'helix',   name: 'Helix',   shape: 'spiral', turns: 3, Rin: 70, Rout: 214, phase: -0.7854, mirror: true, ox: -4, oy: 16, entryUnder: 40, startBurst: 15, bg: '#170a1a', accent: '#d946ef' },
        { id: 'trine',   name: 'Trine',   shape: 'triple', turns: 1.4, Rin: 70, Rout: 214, entryUnder: [40, 40, 40], startBurst: 27, bg: '#0b0e14', accents: ['#f43f5e', '#22c55e', '#3b82f6'] },
    ];
    var X = FIELDS.length;

    // ---- PER-LEVEL tuning table. LEVELS[world-1][fieldIndex] — hand-edit every value freely. ----
    //   field columns 0..11 match the FIELDS order above: vortex, box, serpent, clover, star, twin, tri, eight, maze, duo, helix, trine
    //   per level: primes (available prime balls) · cap (max ball value) · omega (max prime-factor count Ω) ·
    //              feed (queue creep speed, px/s) · bias (<1 favours simple/primes, 1 even, >1 complex) · quota (balls to clear = win)
    var P1 = [2, 3, 5], P2 = [2, 3, 5, 7], P3 = [2, 3, 5, 7, 11], P4 = [2, 3, 5, 7, 11, 13];
    var LEVELS = [
        [ // World 1
            { primes: P1, cap: 18, omega: 3, feed: 11, bias: 0.38, quota: 20 },
            { primes: P1, cap: 20, omega: 3, feed: 11, bias: 0.39, quota: 25 },
            { primes: P1, cap: 22, omega: 3, feed: 11, bias: 0.41, quota: 30 },
            { primes: P1, cap: 24, omega: 3, feed: 12, bias: 0.42, quota: 35 },
            { primes: P1, cap: 25, omega: 3, feed: 12, bias: 0.43, quota: 40 },
            { primes: P1, cap: 27, omega: 3, feed: 12, bias: 0.45, quota: 45 },
            { primes: P1, cap: 29, omega: 3, feed: 12, bias: 0.46, quota: 50 },
            { primes: P1, cap: 31, omega: 3, feed: 12, bias: 0.47, quota: 55 },
            { primes: P1, cap: 33, omega: 3, feed: 12, bias: 0.49, quota: 60 },
            { primes: P1, cap: 35, omega: 3, feed: 13, bias: 0.50, quota: 65 },
            { primes: P1, cap: 36, omega: 3, feed: 13, bias: 0.52, quota: 70 },
            { primes: P1, cap: 38, omega: 3, feed: 13, bias: 0.54, quota: 75 },
        ],
        [ // World 2
            { primes: P2, cap: 36, omega: 3, feed: 13, bias: 0.51, quota: 70 },
            { primes: P2, cap: 38, omega: 3, feed: 13, bias: 0.53, quota: 75 },
            { primes: P2, cap: 40, omega: 3, feed: 13, bias: 0.54, quota: 80 },
            { primes: P2, cap: 42, omega: 3, feed: 13, bias: 0.55, quota: 85 },
            { primes: P2, cap: 44, omega: 3, feed: 14, bias: 0.57, quota: 90 },
            { primes: P2, cap: 46, omega: 3, feed: 14, bias: 0.58, quota: 95 },
            { primes: P2, cap: 48, omega: 3, feed: 14, bias: 0.59, quota: 100 },
            { primes: P2, cap: 49, omega: 3, feed: 14, bias: 0.61, quota: 105 },
            { primes: P2, cap: 51, omega: 3, feed: 14, bias: 0.62, quota: 110 },
            { primes: P2, cap: 53, omega: 3, feed: 14, bias: 0.63, quota: 115 },
            { primes: P2, cap: 54, omega: 3, feed: 14, bias: 0.64, quota: 120 },
            { primes: P2, cap: 56, omega: 3, feed: 14, bias: 0.66, quota: 125 },
        ],
        [ // World 3
            { primes: P2, cap: 55, omega: 4, feed: 15, bias: 0.65, quota: 120 },
            { primes: P2, cap: 57, omega: 4, feed: 15, bias: 0.66, quota: 125 },
            { primes: P2, cap: 59, omega: 4, feed: 15, bias: 0.67, quota: 130 },
            { primes: P2, cap: 60, omega: 4, feed: 15, bias: 0.69, quota: 135 },
            { primes: P2, cap: 62, omega: 4, feed: 15, bias: 0.70, quota: 140 },
            { primes: P2, cap: 64, omega: 4, feed: 16, bias: 0.71, quota: 145 },
            { primes: P2, cap: 66, omega: 4, feed: 16, bias: 0.73, quota: 150 },
            { primes: P2, cap: 68, omega: 4, feed: 16, bias: 0.74, quota: 155 },
            { primes: P2, cap: 70, omega: 4, feed: 16, bias: 0.75, quota: 160 },
            { primes: P2, cap: 72, omega: 4, feed: 16, bias: 0.77, quota: 165 },
            { primes: P2, cap: 73, omega: 4, feed: 16, bias: 0.78, quota: 170 },
            { primes: P2, cap: 74, omega: 4, feed: 16, bias: 0.79, quota: 175 },
        ],
        [ // World 4
            { primes: P3, cap: 73, omega: 4, feed: 16, bias: 0.78, quota: 170 },
            { primes: P3, cap: 75, omega: 4, feed: 17, bias: 0.79, quota: 175 },
            { primes: P3, cap: 77, omega: 4, feed: 17, bias: 0.81, quota: 180 },
            { primes: P3, cap: 79, omega: 4, feed: 17, bias: 0.82, quota: 185 },
            { primes: P3, cap: 81, omega: 4, feed: 17, bias: 0.83, quota: 190 },
            { primes: P3, cap: 83, omega: 4, feed: 17, bias: 0.85, quota: 195 },
            { primes: P3, cap: 84, omega: 4, feed: 17, bias: 0.86, quota: 200 },
            { primes: P3, cap: 86, omega: 4, feed: 18, bias: 0.87, quota: 205 },
            { primes: P3, cap: 88, omega: 4, feed: 18, bias: 0.89, quota: 210 },
            { primes: P3, cap: 90, omega: 4, feed: 18, bias: 0.90, quota: 215 },
            { primes: P3, cap: 91, omega: 4, feed: 18, bias: 0.91, quota: 220 },
            { primes: P3, cap: 92, omega: 4, feed: 18, bias: 0.92, quota: 225 },
        ],
    ];
    function level(world, fieldIdx) {
        var row = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, world - 1))];
        var e = row[fieldIdx] || row[row.length - 1];
        return { field: FIELDS[fieldIdx], primes: e.primes, cap: e.cap, maxOmega: e.omega, feed: e.feed, bias: e.bias, quota: e.quota };
    }

    // ---- ENDLESS, now split by STYLE (not difficulty). Each style = time keyframes (stages); engine interpolates cap/feed/bias and steps primes/omega. ----
    //   `name` shows in the picker. A style may instead give `build()` — called ONCE per run to RETURN its stages, so you can randomise (e.g. pick random primes for that run). Last stage holds forever.
    var ENDLESS = {
        balanced: {
            name: '均衡', stages: [   // a bit of everything, gentle ramp
                { t: 0,   primes: P1, cap: 28, omega: 3, feed: 14, bias: 0.60 },
                { t: 60,  primes: P2, cap: 45, omega: 3, feed: 16, bias: 0.70 },
                { t: 140, primes: P2, cap: 62, omega: 4, feed: 18, bias: 0.80 },
                { t: 220, primes: P2, cap: 78, omega: 4, feed: 20, bias: 0.85 },
            ],
        },
        diverse: {
            name: '多元', stages: [   // large prime pool + bias ~1 → every kind of number shows up
                { t: 0,   primes: P2, cap: 44,  omega: 3, feed: 14, bias: 0.95 },
                { t: 60,  primes: P3, cap: 80,  omega: 4, feed: 16, bias: 1.00 },
                { t: 150, primes: P4, cap: 120, omega: 4, feed: 18, bias: 1.00 },
                { t: 230, primes: P4, cap: 150, omega: 4, feed: 19, bias: 1.00 },
            ],
        },
        gnarly: {
            name: '難消', stages: [   // high Ω + bias >1 → gnarly composites that take many shots to clear
                { t: 0,   primes: P1, cap: 40,  omega: 3, feed: 13, bias: 1.10 },
                { t: 60,  primes: P1, cap: 70,  omega: 4, feed: 15, bias: 1.40 },
                { t: 140, primes: P2, cap: 100, omega: 5, feed: 16, bias: 1.60 },
                { t: 220, primes: P2, cap: 130, omega: 5, feed: 17, bias: 1.70 },
            ],
        },
        blitz: {
            name: '反應', stages: [   // very fast feed, simple numbers → a reaction test
                { t: 0,   primes: P1, cap: 24, omega: 2, feed: 22, bias: 0.40 },
                { t: 50,  primes: P2, cap: 34, omega: 3, feed: 28, bias: 0.50 },
                { t: 120, primes: P2, cap: 46, omega: 3, feed: 34, bias: 0.60 },
                { t: 200, primes: P2, cap: 58, omega: 3, feed: 40, bias: 0.65 },
            ],
        },
        hardPrimes: {
            name: '刁鑽',
            build: function () {   // pick 3 random big/tricky primes each run and focus the whole run on them
                var pool = [13, 17, 19, 23, 29, 31, 37], pick = [], pp = pool.slice(), i;
                for (i = 0; i < 3; i++) pick.push(pp.splice(Math.floor(Math.random() * pp.length), 1)[0]);
                pick.sort(function (a, b) { return a - b; });
                return [
                    { t: 0,   primes: pick, cap: 240, omega: 2, feed: 14, bias: 0.70 },
                    { t: 90,  primes: pick, cap: 420, omega: 2, feed: 16, bias: 0.85 },
                    { t: 190, primes: pick, cap: 600, omega: 2, feed: 18, bias: 0.95 },
                ];
            },
        },
    };

    return { FIELDS: FIELDS, X: X, level: level, ENDLESS: ENDLESS };
})();
