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
 * ENDLESS: a set of STYLES for 無盡/Endless (not difficulties). Each style is a full timeline of `stages`
 *   (time keyframes); the engine interpolates cap/feed/bias/mult/Ω between them and steps the prime set at each
 *   stage. A style may give `build()` instead, called once per run to GENERATE its stages (lets it randomise).
 *   Field is chosen separately; `feed` is auto-split across a field's lanes (see below). Scoring: each ball banks
 *   the current `mult` when it spawns, so surviving deeper is worth more.
 */
window.PrimeZumaData = (function () {
    // Each field has a `shape` the engine knows how to draw into a path (death end first, source last) plus a
    // cannon position: 'spiral' & 'square' spiral inward to a centre cannon; 'snake' serpentines top→bottom with
    // the cannon at the bottom. (More shapes — double-spiral, underground, star — are a later phase.)
    // Rin is kept large so the inner (death) end clears the centre cannon + its muzzle ball. 'square' is a smooth
    // ROUNDED square (squircle, exponent n) — no hard 90° corners; 'snake' is a smooth sine weave (amp/waves).
    // feed is auto-split across a field's lanes (so total balls/sec is lane-count-independent); optional `feedFactor`
    // (default 1) scales a single field's pace on top of that — e.g. feedFactor: 1.3 to make one board run brisker.
    var FIELDS = [
        { id: 'vortex',  name: 'Vortex',  shape: 'spiral', turns: 3, Rin: 70, Rout: 214, phase: -0.7854, ox: 4, oy: 16, entryUnder: 40, startBurst: 15, bg: '#130d20', accent: '#8b5cf6' },
        { id: 'box',     name: 'Box',     shape: 'square', turns: 3, Rin: 70, Rout: 184, n: 3.0, ox: 12, oy: 6, phase: 0.2, mirror: true, entryUnder: 90, startBurst: 13, feedFactor: 0.98, bg: '#0a1020', accent: '#3b82f6' },
        { id: 'serpent', name: 'Serpent', shape: 'snake',  rows: 4, entryUnder: 30, startBurst: 12, feedFactor: 0.70, bg: '#08140e', accent: '#10b981' },
        { id: 'clover',  name: 'Clover',  shape: 'clover', gx: 70, gy: 70, leafR: 64, deathExt: 44, entryUnder: 30, startBurst: 16, feedFactor: 0.70, bg: '#0c1407', accent: '#a3e635' },
        { id: 'star',    name: 'Star',    shape: 'star',   Rstar: 292, tipR: 38, phase: -1.5708, oy: 18, deathT: 0.80, entryUnder: 50, startBurst: 16, feedFactor: 0.80, bg: '#14110a', accent: '#eab308' },
        { id: 'twin',    name: 'Twin',    shape: 'dual',   turns: 2, Rin: 70, Rout: 214, entryUnder: [40, 40], startBurst: 24, feedFactor: 1.20, bg: '#160a12', accent: '#ec4899', accent2: '#2dd4bf' },
        { id: 'tri',     name: 'Tri',     shape: 'poly',   sides: 3, polyAmp: 0.17, turns: 3, Rin: 70, Rout: 190, ox: -28, oy: 6, canDy: -12, exitAng: 0.52, entryUnder: 110, startBurst: 18, bg: '#160f08', accent: '#f97316' },
        { id: 'eight',   name: 'Eight',   shape: 'infinity', aw: 190, bh: 108, voff: 116, bridgeW: 52, entryUnder: [30, 30], startBurst: 18, feedFactor: 0.60, bg: '#0c0a16', accents: ['#facc15', '#818cf8'] },
        { id: 'maze',    name: 'Maze',    shape: 'square', turns: 3, Rin: 70, Rout: 188, n: 3.2, phase: -0.7854, oy: 12, buryHorizontal: true, entryUnder: 40, startBurst: 13, feedFactor: 0.95, bg: '#08161a', accent: '#06b6d4' },
        { id: 'duo',     name: 'Duo',     shape: 'duo',    half: 156, cr: 24, gap: 44, sep: 36, entryUnder: [30, 30], startBurst: 18, feedFactor: 0.90, bg: '#140a0f', accent: '#fb7185', accent2: '#38bdf8' },
        { id: 'helix',   name: 'Helix',   shape: 'spiral', turns: 3, Rin: 70, Rout: 214, phase: -0.7854, mirror: true, ox: -4, oy: 16, entryUnder: 40, startBurst: 15, bg: '#170a1a', accent: '#d946ef' },
        { id: 'trine',   name: 'Trine',   shape: 'triple', turns: 1.4, Rin: 70, Rout: 214, entryUnder: [40, 40, 40], startBurst: 27, feedFactor: 1.35, bg: '#0b0e14', accents: ['#f43f5e', '#22c55e', '#3b82f6'] },
    ];
    var X = FIELDS.length;

    // ---- PER-LEVEL tuning table. LEVELS[world-1][fieldIndex] — hand-edit every value freely. ----
    //   field columns 0..11 match the FIELDS order above: vortex, box, serpent, clover, star, twin, tri, eight, maze, duo, helix, trine
    //   per level: primes (available prime balls) · cap (max ball value) · omega (max prime-factor count Ω) ·
    //              feed (queue creep speed, px/s) · bias (<1 favours simple/primes, 1 even, >1 complex) · quota (balls to clear = win)
    // Write `primes: pn(...)` instead of a long literal array. From the master list PR:
    //   pn(n)    = the first n primes            → pn(6)    = [2,3,5,7,11,13]
    //   pn(a, b) = the a-th … b-th prime (1-based, inclusive, need NOT start at 2) → pn(3, 6) = [5,7,11,13]
    // Memoised so identical calls return ONE shared array (keeps the engine's cheap "same stage?" check fast).
    var PR = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113];
    var _pnCache = {};
    function pn(a, b) {
        var key = (b == null) ? ('0_' + a) : (a + '_' + b);
        if (_pnCache[key]) return _pnCache[key];
        var from = (b == null) ? 0 : (a - 1), to = (b == null) ? a : b;   // one-arg = first a; two-arg = a-th..b-th (1-based)
        return (_pnCache[key] = PR.slice(Math.max(0, from), Math.min(PR.length, to)));
    }
    var P1 = pn(3), P2 = pn(4), P3 = pn(5), P4 = pn(6);
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

    // ---- ENDLESS, split by STYLE (not difficulty). Each style = time keyframes (stages); the engine interpolates cap/feed/bias/mult/omega between them and steps the prime set at each stage. ----
    //   The picker label is the `pz<Key>` i18n string (e.g. pzGnarly) if present, else this `name`. A style may instead give `build()` — called ONCE per run to RETURN its stages, so you can randomise (e.g. pick primes for that run). Last stage holds forever (so a style's furthest keyframe must be as far out as you want params to keep changing).
    //   `mult` = the SCORE multiplier at that time; each ball banks the current mult when it spawns, so surviving deeper is worth more. Hand-authored curve (interpolated) = no exponential runaway; raise the last stage (or add a later one) if you want it to keep climbing.
    var ENDLESS = {
        balanced: {
            name: '均衡', stages: [   // a bit of everything, gentle ramp
                { t:      0, primes: pn( 3), cap:   25, omega: 1.3, feed: 12.0, bias: 0.400, mult:    1.000 },
                { t:     60, primes: pn( 3), cap:   30, omega: 2.0, feed: 12.5, bias: 0.450, mult:    1.414 },
                { t:    120, primes: pn( 3), cap:   36, omega: 2.7, feed: 12.8, bias: 0.500, mult:    2.000 },
                { t:    121, primes: pn( 4), cap:   36, omega: 1.5, feed: 12.8, bias: 0.500, mult:    2.000 },
                { t:    180, primes: pn( 4), cap:   42, omega: 2.0, feed: 13.1, bias: 0.533, mult:    2.520 },
                { t:    240, primes: pn( 4), cap:   56, omega: 2.5, feed: 13.5, bias: 0.567, mult:    3.175 },
                { t:    300, primes: pn( 4), cap:   72, omega: 3.0, feed: 13.8, bias: 0.600, mult:    4.000 },
                { t:    301, primes: pn( 5), cap:   72, omega: 1.7, feed: 13.8, bias: 0.600, mult:    4.000 },
                { t:    360, primes: pn( 5), cap:   90, omega: 2.0, feed: 14.1, bias: 0.617, mult:    4.490 },
                { t:    420, primes: pn( 5), cap:  110, omega: 2.3, feed: 14.4, bias: 0.633, mult:    5.040 },
                { t:    480, primes: pn( 5), cap:  132, omega: 2.6, feed: 14.6, bias: 0.650, mult:    5.657 },
                { t:    540, primes: pn( 5), cap:  156, omega: 2.9, feed: 14.9, bias: 0.667, mult:    6.350 },
                { t:    600, primes: pn( 5), cap:  182, omega: 3.2, feed: 15.2, bias: 0.683, mult:    7.127 },
                { t:    720, primes: pn( 5), cap:  210, omega: 3.5, feed: 15.5, bias: 0.700, mult:    8.000 },
                { t:    721, primes: pn( 6), cap:  210, omega: 2.0, feed: 15.5, bias: 0.700, mult:    8.000 },
                { t:    840, primes: pn( 6), cap:  240, omega: 2.3, feed: 15.8, bias: 0.720, mult:    9.190 },
                { t:    960, primes: pn( 6), cap:  272, omega: 2.6, feed: 16.1, bias: 0.740, mult:   10.556 },
                { t:   1080, primes: pn( 6), cap:  306, omega: 2.9, feed: 16.4, bias: 0.760, mult:   12.126 },
                { t:   1200, primes: pn( 6), cap:  342, omega: 3.2, feed: 16.7, bias: 0.780, mult:   13.929 },
                { t:   1440, primes: pn( 6), cap:  380, omega: 3.5, feed: 17.0, bias: 0.800, mult:   16.000 },
                { t:   1441, primes: pn( 7), cap:  380, omega: 2.2, feed: 17.0, bias: 0.800, mult:   16.000 },
                { t:   1680, primes: pn( 7), cap:  420, omega: 2.5, feed: 17.3, bias: 0.820, mult:   18.379 },
                { t:   1920, primes: pn( 7), cap:  462, omega: 2.8, feed: 17.6, bias: 0.840, mult:   21.112 },
                { t:   2160, primes: pn( 7), cap:  506, omega: 3.1, feed: 17.9, bias: 0.860, mult:   24.251 },
                { t:   2400, primes: pn( 7), cap:  552, omega: 3.4, feed: 18.2, bias: 0.880, mult:   27.858 },
                { t:   2880, primes: pn( 7), cap:  600, omega: 3.7, feed: 18.5, bias: 0.900, mult:   32.000 },
                { t:   2881, primes: pn( 8), cap:  600, omega: 2.4, feed: 18.5, bias: 0.900, mult:   32.000 },
                { t:   3360, primes: pn( 8), cap:  650, omega: 2.7, feed: 18.8, bias: 0.910, mult:   36.758 },
                { t:   3840, primes: pn( 8), cap:  702, omega: 3.0, feed: 19.1, bias: 0.920, mult:   42.224 },
                { t:   4320, primes: pn( 8), cap:  756, omega: 3.3, feed: 19.4, bias: 0.930, mult:   48.503 },
                { t:   4800, primes: pn( 8), cap:  812, omega: 3.6, feed: 19.7, bias: 0.940, mult:   55.715 },
                { t:   5760, primes: pn( 8), cap:  870, omega: 3.9, feed: 20.0, bias: 0.950, mult:   64.000 },
                { t:   5761, primes: pn( 9), cap:  870, omega: 2.6, feed: 20.0, bias: 0.950, mult:   64.000 },
                { t:   6720, primes: pn( 9), cap:  930, omega: 2.9, feed: 20.3, bias: 0.955, mult:   73.517 },
                { t:   7680, primes: pn( 9), cap:  992, omega: 3.2, feed: 20.6, bias: 0.960, mult:   84.449 },
                { t:   8640, primes: pn( 9), cap: 1056, omega: 3.5, feed: 20.9, bias: 0.965, mult:   97.006 },
                { t:   9600, primes: pn( 9), cap: 1122, omega: 3.8, feed: 21.2, bias: 0.970, mult:  111.430 },
                { t:  19200, primes: pn( 9), cap: 1980, omega: 4.1, feed: 21.5, bias: 0.975, mult:  128.000 },
                { t:  19201, primes: pn(10), cap: 1980, omega: 3.0, feed: 21.5, bias: 0.975, mult:  128.000 },
                { t:  38400, primes: pn(10), cap: 3080, omega: 4.0, feed: 21.8, bias: 0.980, mult:  256.000 },
                { t:  38401, primes: pn(11), cap: 3080, omega: 3.5, feed: 21.8, bias: 0.980, mult:  256.000 },
                { t:  76800, primes: pn(11), cap: 4422, omega: 4.5, feed: 22.1, bias: 0.985, mult:  512.000 },
                { t:  76801, primes: pn(12), cap: 4422, omega: 4.0, feed: 22.1, bias: 0.985, mult:  512.000 },
                { t: 153600, primes: pn(12), cap: 6006, omega: 5.0, feed: 22.4, bias: 0.990, mult: 1024.000 },
                { t: 153601, primes: pn(13), cap: 6006, omega: 4.5, feed: 22.4, bias: 0.990, mult: 1024.000 },
                { t: 307200, primes: pn(13), cap: 7832, omega: 5.5, feed: 22.7, bias: 0.995, mult: 2048.000 },
                { t: 307201, primes: pn(14), cap: 7832, omega: 5.0, feed: 22.7, bias: 0.995, mult: 2048.000 },
                { t: 614400, primes: pn(14), cap: 9900, omega: 6.0, feed: 23.0, bias: 1.000, mult: 4096.000 },
            ],
        },
        gnarly: {
            name: '稠密', stages: [   // high Ω + bias >1 → dense composites that take many shots to clear
                { t:      0, primes: pn(3), cap:    40, omega:  3.0, feed:  8.0, bias: 1.200, mult:    1.000 },
                { t:     60, primes: pn(3), cap:    80, omega:  3.3, feed:  8.1, bias: 1.250, mult:    1.414 },
                { t:    120, primes: pn(3), cap:   120, omega:  3.6, feed:  8.2, bias: 1.300, mult:    2.000 },
                { t:    180, primes: pn(3), cap:   170, omega:  3.9, feed:  8.3, bias: 1.350, mult:    2.520 },
                { t:    240, primes: pn(3), cap:   220, omega:  4.2, feed:  8.4, bias: 1.400, mult:    3.175 },
                { t:    300, primes: pn(3), cap:   280, omega:  4.5, feed:  8.5, bias: 1.450, mult:    4.000 },
                { t:    360, primes: pn(3), cap:   340, omega:  4.8, feed:  8.6, bias: 1.500, mult:    4.490 },
                { t:    361, primes: pn(4), cap:   340, omega:  4.2, feed:  8.6, bias: 1.500, mult:    4.490 },
                { t:    420, primes: pn(4), cap:   400, omega:  4.5, feed:  8.7, bias: 1.525, mult:    5.040 },
                { t:    480, primes: pn(4), cap:   460, omega:  4.8, feed:  8.8, bias: 1.550, mult:    5.657 },
                { t:    540, primes: pn(4), cap:   530, omega:  5.1, feed:  8.9, bias: 1.575, mult:    6.350 },
                { t:    600, primes: pn(4), cap:   600, omega:  5.4, feed:  9.0, bias: 1.600, mult:    7.127 },
                { t:    720, primes: pn(4), cap:   700, omega:  5.7, feed:  9.2, bias: 1.625, mult:    8.000 },
                { t:    840, primes: pn(4), cap:   810, omega:  6.0, feed:  9.4, bias: 1.650, mult:    9.190 },
                { t:    960, primes: pn(4), cap:   930, omega:  6.3, feed:  9.6, bias: 1.675, mult:   10.556 },
                { t:   1080, primes: pn(4), cap:  1060, omega:  6.6, feed:  9.8, bias: 1.700, mult:   12.126 },
                { t:   1200, primes: pn(4), cap:  1200, omega:  6.9, feed: 10.0, bias: 1.725, mult:   13.929 },
                { t:   1201, primes: pn(5), cap:  1200, omega:  6.0, feed: 10.0, bias: 1.725, mult:   13.929 },
                { t:   1440, primes: pn(5), cap:  1400, omega:  6.5, feed: 10.4, bias: 1.750, mult:   16.000 },
                { t:   1680, primes: pn(5), cap:  1620, omega:  6.9, feed: 10.8, bias: 1.775, mult:   18.379 },
                { t:   1920, primes: pn(5), cap:  1860, omega:  7.3, feed: 11.2, bias: 1.800, mult:   21.112 },
                { t:   2160, primes: pn(5), cap:  2020, omega:  7.7, feed: 11.6, bias: 1.825, mult:   24.251 },
                { t:   2400, primes: pn(5), cap:  2300, omega:  8.0, feed: 12.0, bias: 1.850, mult:   27.858 },
                { t:   2880, primes: pn(5), cap:  2540, omega:  8.5, feed: 12.8, bias: 1.875, mult:   32.000 },
                { t:   3360, primes: pn(5), cap:  2780, omega:  8.9, feed: 13.6, bias: 1.900, mult:   36.758 },
                { t:   3840, primes: pn(5), cap:  3020, omega:  9.3, feed: 14.4, bias: 1.925, mult:   42.224 },
                { t:   4320, primes: pn(5), cap:  3260, omega:  9.7, feed: 15.2, bias: 1.950, mult:   48.503 },
                { t:   4800, primes: pn(5), cap:  3500, omega: 10.0, feed: 16.0, bias: 1.975, mult:   55.715 },
                { t:   4801, primes: pn(6), cap:  3500, omega:  8.5, feed: 16.0, bias: 1.975, mult:   55.715 },
                { t:   5760, primes: pn(6), cap:  3800, omega:  9.0, feed: 17.5, bias: 2.000, mult:   64.000 },
                { t:   6720, primes: pn(6), cap:  4100, omega:  9.5, feed: 19.0, bias: 2.025, mult:   73.517 },
                { t:   7680, primes: pn(6), cap:  4400, omega: 10.0, feed: 20.5, bias: 2.050, mult:   84.449 },
                { t:   8640, primes: pn(6), cap:  4700, omega: 10.5, feed: 22.0, bias: 2.075, mult:   97.006 },
                { t:   9600, primes: pn(6), cap:  5000, omega: 11.0, feed: 23.5, bias: 2.100, mult:  111.430 },
                { t:  19200, primes: pn(7), cap:  5500, omega: 10.0, feed: 26.0, bias: 2.200, mult:  128.000 },
                { t:  38400, primes: pn(7), cap:  6000, omega: 12.0, feed: 29.5, bias: 2.350, mult:  256.000 },
                { t:  76800, primes: pn(8), cap:  6666, omega: 11.0, feed: 34.5, bias: 2.600, mult:  512.000 },
                { t: 153600, primes: pn(8), cap:  8000, omega: 13.0, feed: 41.0, bias: 3.000, mult: 1024.000 },
                { t: 307200, primes: pn(9), cap:  9999, omega: 12.0, feed: 49.0, bias: 4.000, mult: 2048.000 },
                { t: 614400, primes: pn(9), cap: 99999, omega: 14.0, feed: 60.0, bias: 8.000, mult: 4096.000 },
            ],
        },
        blitz: {
            name: '高速', stages: [   // very fast feed, simple numbers → a reaction test
                { t:      0, primes: pn(3), cap:  25, omega: 1.000, feed: 13.0, bias:  0.053, mult:    1.000 },
                { t:     60, primes: pn(3), cap:  25, omega: 1.072, feed: 13.5, bias:  0.081, mult:    1.414 },
                { t:    120, primes: pn(3), cap:  25, omega: 1.149, feed: 14.0, bias:  0.111, mult:    2.000 },
                { t:    180, primes: pn(3), cap:  25, omega: 1.231, feed: 14.5, bias:  0.142, mult:    2.520 },
                { t:    240, primes: pn(3), cap:  25, omega: 1.320, feed: 15.0, bias:  0.176, mult:    3.175 },
                { t:    300, primes: pn(3), cap:  25, omega: 1.414, feed: 15.5, bias:  0.212, mult:    4.000 },
                { t:    360, primes: pn(3), cap:  25, omega: 1.516, feed: 16.0, bias:  0.250, mult:    4.490 },
                { t:    420, primes: pn(3), cap:  25, omega: 1.625, feed: 17.0, bias:  0.290, mult:    5.040 },
                { t:    480, primes: pn(3), cap:  25, omega: 1.741, feed: 18.0, bias:  0.333, mult:    5.657 },
                { t:    540, primes: pn(3), cap:  25, omega: 1.866, feed: 19.0, bias:  0.379, mult:    6.350 },
                { t:    600, primes: pn(3), cap:  25, omega: 2.000, feed: 20.0, bias:  0.429, mult:    7.127 },
                { t:    601, primes: pn(4), cap:  49, omega: 1.000, feed: 21.0, bias:  0.429, mult:    7.127 },
                { t:    720, primes: pn(4), cap:  49, omega: 1.020, feed: 22.0, bias:  0.481, mult:    8.000 },
                { t:    840, primes: pn(4), cap:  49, omega: 1.040, feed: 23.0, bias:  0.538, mult:    9.190 },
                { t:    960, primes: pn(4), cap:  49, omega: 1.061, feed: 24.0, bias:  0.600, mult:   10.556 },
                { t:   1080, primes: pn(4), cap:  49, omega: 1.082, feed: 25.0, bias:  0.667, mult:   12.126 },
                { t:   1200, primes: pn(4), cap:  49, omega: 1.104, feed: 25.0, bias:  0.739, mult:   13.929 },
                { t:   1440, primes: pn(4), cap:  49, omega: 1.149, feed: 26.0, bias:  0.818, mult:   16.000 },
                { t:   1680, primes: pn(4), cap:  49, omega: 1.195, feed: 27.0, bias:  0.904, mult:   18.379 },
                { t:   1920, primes: pn(4), cap:  49, omega: 1.243, feed: 28.0, bias:  1.000, mult:   21.112 },
                { t:   2160, primes: pn(4), cap:  49, omega: 1.294, feed: 29.0, bias:  1.105, mult:   24.251 },
                { t:   2400, primes: pn(4), cap:  49, omega: 1.346, feed: 30.0, bias:  1.222, mult:   27.858 },
                { t:   2880, primes: pn(4), cap:  49, omega: 1.457, feed: 31.0, bias:  1.353, mult:   32.000 },
                { t:   3360, primes: pn(4), cap:  49, omega: 1.577, feed: 32.0, bias:  1.500, mult:   36.758 },
                { t:   3840, primes: pn(4), cap:  49, omega: 1.707, feed: 33.0, bias:  1.667, mult:   42.224 },
                { t:   4320, primes: pn(4), cap:  49, omega: 1.848, feed: 34.0, bias:  1.857, mult:   48.503 },
                { t:   4800, primes: pn(4), cap:  49, omega: 2.000, feed: 35.0, bias:  2.077, mult:   55.715 },
                { t:   4801, primes: pn(5), cap: 121, omega: 1.000, feed: 36.0, bias:  2.077, mult:   55.715 },
                { t:   5760, primes: pn(5), cap: 121, omega: 1.047, feed: 37.0, bias:  2.333, mult:   64.000 },
                { t:   6720, primes: pn(5), cap: 121, omega: 1.097, feed: 38.0, bias:  2.636, mult:   73.517 },
                { t:   7680, primes: pn(5), cap: 121, omega: 1.149, feed: 39.0, bias:  3.000, mult:   84.449 },
                { t:   8640, primes: pn(5), cap: 121, omega: 1.203, feed: 40.0, bias:  3.444, mult:   97.006 },
                { t:   9600, primes: pn(5), cap: 121, omega: 1.260, feed: 40.0, bias:  4.000, mult:  111.430 },
                { t:  19200, primes: pn(5), cap: 121, omega: 2.000, feed: 45.0, bias:  4.714, mult:  128.000 },
                { t:  38400, primes: pn(6), cap: 169, omega: 2.000, feed: 50.0, bias:  5.667, mult:  256.000 },
                { t:  76800, primes: pn(6), cap: 169, omega: 2.000, feed: 55.0, bias:  7.000, mult:  512.000 },
                { t: 153600, primes: pn(7), cap: 289, omega: 2.000, feed: 60.0, bias:  9.000, mult: 1024.000 },
                { t: 307200, primes: pn(7), cap: 289, omega: 2.000, feed: 65.0, bias: 12.333, mult: 2048.000 },
                { t: 614400, primes: pn(8), cap: 361, omega: 2.000, feed: 70.0, bias: 19.000, mult: 4096.000 },
            ],
        },
        hardPrimes: {
            name: '刁鑽',
            // A SLOWLY-DRIFTING prime set (size = cur.length, currently 4). Start = the first 4 of `pool` = [17,19,23,29].
            // Every STEP s we swap ONE member (random victim) for another index, biased toward a TARGET index-sum that
            // grows with t (SUM keyframes). Because only one prime changes per stage, the board's leftovers mostly still
            // match the new set → few orphans, yet the set keeps evolving into fresh combos that force real arithmetic.
            // The target is the SUM OF INDICES (for 4-of-12 it spans 6..38; NOT raw prime values) so every step is one
            // uniform "prime harder". PULL = how hard the swap snaps to the target (smaller = tighter / steeper, larger =
            // looser / more variety). DIFF drifts cap/omega/feed/bias/mult; HORIZON must reach your furthest keyframe.
            // NOTE: with primes this large, cap must be big enough to allow composites (a pair 59·61=3599, bigger for
            // triples/quads) or only lone primes spawn. Keep cap under ~100000 for performance.
            build: function () {
                var pool = pn(7, 18);                       // [17,19,23,29,31,37,41,43,47,53,59,61] — index 0..11 (4-index sum spans 6..38)
                var STEP = 60, HORIZON = 614400, PULL = 1.4;  // re-pick one prime every STEP s out to HORIZON (must reach your furthest DIFF/SUM keyframe or those rows never apply); PULL = pull-to-target spread
                var SUM = [                                 // [t, target SUM of the 4 indices] (4 distinct of 0..11 → sum spans 6..38), drifts up over time
                    [     0,  6.0],
                    [    60,  8.5],
                    [   120,  9.8],
                    [   180, 11.0],
                    [   240, 12.2],
                    [   300, 13.4],
                    [   360, 14.6],
                    [   420, 15.7],
                    [   480, 16.7],
                    [   540, 17.6],
                    [   600, 18.4],
                    [   720, 19.0],
                    [   840, 19.5],
                    [   960, 20.0],
                    [  1080, 20.4],
                    [  1200, 20.8],
                    [  1440, 21.2],
                    [  1680, 21.6],
                    [  1920, 22.0],
                    [  2160, 22.4],
                    [  2400, 22.8],
                    [  2880, 23.2],
                    [  3360, 23.6],
                    [  3840, 24.0],
                    [  4320, 24.5],
                    [  4800, 25.0],
                    [  5760, 25.6],
                    [  6720, 26.4],
                    [  7680, 27.3],
                    [  8640, 28.3],
                    [  9600, 29.4],
                    [ 19200, 30.6],
                    [ 38400, 31.8],
                    [ 76800, 33.0],
                    [153600, 34.2],
                    [307200, 35.5],
                    [614400, 38.0],
                ];
                var DIFF = [                                // [t, cap, omega, feed, bias, mult]
                    [     0, 3721, 2.0, 10.0,  0.026,    1.000],
                    [    60, 3721, 2.0, 10.3,  0.053,    1.414],
                    [   120, 3721, 2.0, 10.6,  0.081,    2.000],
                    [   180, 3721, 2.0, 10.9,  0.111,    2.520],
                    [   240, 3721, 2.0, 11.2,  0.143,    3.175],
                    [   300, 3721, 2.0, 11.6,  0.176,    4.000],
                    [   360, 3721, 2.0, 12.0,  0.212,    4.490],
                    [   420, 3721, 2.0, 12.4,  0.250,    5.040],
                    [   480, 3721, 2.0, 12.8,  0.290,    5.657],
                    [   540, 3721, 2.0, 13.3,  0.333,    6.350],
                    [   600, 3721, 2.0, 13.8,  0.379,    7.127],
                    [   720, 3721, 2.0, 15.0,  0.429,    8.000],
                    [   840, 3721, 2.0, 16.2,  0.481,    9.190],
                    [   960, 3721, 2.0, 17.4,  0.538,   10.556],
                    [  1080, 3721, 2.0, 18.6,  0.600,   12.126],
                    [  1200, 3721, 2.0, 19.8,  0.667,   13.929],
                    [  1440, 3721, 2.0, 21.0,  0.739,   16.000],
                    [  1680, 3721, 2.0, 22.2,  0.818,   18.379],
                    [  1920, 3721, 2.0, 23.4,  0.905,   21.112],
                    [  2160, 3721, 2.0, 24.6,  1.000,   24.251],
                    [  2400, 3721, 2.0, 25.8,  1.105,   27.858],
                    [  2880, 3721, 2.0, 27.0,  1.222,   32.000],
                    [  3360, 3721, 2.0, 28.2,  1.353,   36.758],
                    [  3840, 3721, 2.0, 30.4,  1.500,   42.224],
                    [  4320, 3721, 2.0, 32.6,  1.667,   48.503],
                    [  4800, 3721, 2.0, 34.8,  1.857,   55.715],
                    [  5760, 3721, 2.0, 37.0,  2.077,   64.000],
                    [  6720, 3721, 2.0, 39.2,  2.333,   73.517],
                    [  7680, 3721, 2.0, 41.4,  2.636,   84.449],
                    [  8640, 3721, 2.0, 43.6,  3.000,   97.006],
                    [  9600, 3721, 2.0, 45.8,  3.444,  111.430],
                    [ 19200, 3721, 2.0, 48.0,  4.000,  128.000],
                    [ 38400, 3721, 2.0, 50.2,  4.714,  256.000],
                    [ 76800, 3721, 2.0, 52.4,  5.667,  512.000],
                    [153600, 3721, 2.0, 54.6,  7.000, 1024.000],
                    [307200, 3721, 2.0, 56.8,  9.000, 2048.000],
                    [614400, 3721, 2.0, 59.0, 12.333, 4096.000],
                ];
                function lerp(tbl, t) { var i = 0; while (i < tbl.length - 1 && t >= tbl[i + 1][0]) i++; var a = tbl[i], b = tbl[i + 1] || a, sp = (b[0] - a[0]) || 1, u = (b === a) ? 0 : Math.max(0, Math.min(1, (t - a[0]) / sp)), o = [], c; for (c = 1; c < a.length; c++) o.push(a[c] + (b[c] - a[c]) * u); return o; }
                function gauss() { var u = Math.random() || 1e-9, v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); }
                var cur = [0, 1, 2, 3], stages = [], t, d, idx, m;   // start [17,19,23,29] (4 primes) — change this array's length to use more/fewer
                for (t = 0; t <= HORIZON; t += STEP) {
                    if (t > 0) {                            // swap ONE index (of cur.length), nudged toward the target sum
                        var target = lerp(SUM, t)[0], vic = Math.floor(Math.random() * cur.length), rest = 0, k, tries, dup;
                        for (m = 0; m < cur.length; m++) if (m !== vic) rest += cur[m];
                        var ideal = target - rest;          // index that would hit the target exactly, given the others
                        for (tries = 0; tries < 50; tries++) { k = Math.max(0, Math.min(pool.length - 1, Math.round(ideal + PULL * gauss()))); dup = false; for (m = 0; m < cur.length; m++) if (m !== vic && cur[m] === k) dup = true; if (!dup) { cur[vic] = k; break; } }
                    }
                    d = lerp(DIFF, t); idx = cur.slice().sort(function (a, b) { return a - b; });
                    stages.push({ t: t, primes: idx.map(function (j) { return pool[j]; }), cap: Math.round(d[0]), omega: d[1], feed: d[2], bias: d[3], mult: d[4] });
                }
                return stages;
            },
        },
    };

    return { FIELDS: FIELDS, X: X, level: level, ENDLESS: ENDLESS };
})();
