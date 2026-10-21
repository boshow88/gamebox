/* Bomberman — a DETERMINISTIC grid engine. Same (seed + per-tick inputs) → identical
 * state on every machine. That is the whole point: it makes fair peer-to-peer play
 * possible later via lockstep / rollback (no "host" authority, no host advantage).
 *
 * Determinism rules kept strictly: fixed tick, INTEGER positions (tile = GRID units),
 * a seeded integer RNG, and NO wall-clock / Math.random inside step(). The game layer
 * supplies inputs[] each tick (human or CPU) and never mutates world state directly.
 *
 * Tiles: 0 floor · 1 hard (indestructible) · 2 soft (destructible). Bombs/flames/items
 * are entity lists. Everything here is pure data + pure functions. */
(function () {
    'use strict';
    var GRID = 100;                         // sub-units per tile (integer movement → deterministic)
    var HALF = 50;                          // player half-size in units = full tile (box 100); lane-based collision lets it still corner
    var CENTER_TOL = 20;                    // default lane-snap "forgiveness" in units (0.20 tile); override via cfg.centerTol
    var DIRS = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];   // 0=up 1=right 2=down 3=left
    var ITEMS = ['fire', 'bomb', 'speed', 'kick'];

    // mulberry32 — tiny seeded RNG; integer in, deterministic float [0,1)
    function makeRng(seed) {
        var s = seed >>> 0;
        return function () {
            s = (s + 0x6D2B79F5) | 0;
            var t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function clampi(v, a, b) { return v < a ? a : v > b ? b : v; }

    function create(cfg, seed) {
        cfg = cfg || {};
        var cols = cfg.cols || 13, rows = cfg.rows || 11, np = clampi(cfg.players || 4, 1, 4);
        var rnd = makeRng((seed == null ? 1 : seed) >>> 0);
        var w = {
            cols: cols, rows: rows, GRID: GRID, HALF: HALF, tick: 0,
            fuse: cfg.fuse || 150, flameTicks: cfg.flameTicks || 28,
            hitR: Math.round(HALF * (cfg.hitRatio != null ? cfg.hitRatio : 0.6)),   // flame hit-box half-size (units); bigger than a point
            centerTol: cfg.centerTol != null ? cfg.centerTol : CENTER_TOL,          // lane-snap forgiveness (units)
            softRate: cfg.softRate != null ? cfg.softRate : 0.80, itemRate: cfg.itemRate != null ? cfg.itemRate : 0.42,
            baseSpeed: cfg.speed || 5, maxSpeed: cfg.maxSpeed || 11,
            powerStart: cfg.power || 2, bombStart: cfg.bombs || 1,
            grid: [], items: [], bombs: [], flames: [], players: [],
            over: false, winner: null, seed: (seed == null ? 1 : seed) >>> 0, events: [],
        };
        var corners = [[1, 1], [cols - 2, 1], [1, rows - 2], [cols - 2, rows - 2]];
        function spawnClear(x, y) {   // keep a 2-tile cross at each spawn free of soft blocks
            for (var i = 0; i < corners.length; i++) { var cx = corners[i][0], cy = corners[i][1]; if ((x === cx || y === cy) && Math.abs(x - cx) + Math.abs(y - cy) <= 2) return true; }
            return false;
        }
        var x, y, row;
        for (y = 0; y < rows; y++) {
            row = [];
            for (x = 0; x < cols; x++) {
                if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) row.push(1);           // border
                else if (x % 2 === 0 && y % 2 === 0) row.push(1);                                   // interior pillars
                else if (!spawnClear(x, y) && rnd() < w.softRate) row.push(2);                      // soft block
                else row.push(0);
            }
            w.grid.push(row);
        }
        for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {    // hide items under some soft blocks
            if (w.grid[y][x] === 2 && rnd() < w.itemRate) w.items.push({ x: x, y: y, type: ITEMS[(rnd() * ITEMS.length) | 0], hidden: true });
        }
        var order = np === 2 ? [0, 3] : [0, 1, 2, 3];              // 2 players spawn on a DIAGONAL (TL+BR), not side-by-side
        for (var i = 0; i < np; i++) {
            var c = corners[order[i]];
            w.players.push({ id: i, x: c[0] * GRID + GRID / 2, y: c[1] * GRID + GRID / 2, alive: true, dir: 2, moving: false, speed: w.baseSpeed, power: w.powerStart, bombs: w.bombStart, placed: 0, kick: false });
        }
        return w;
    }

    function tileAt(w, tx, ty) { return (tx < 0 || ty < 0 || tx >= w.cols || ty >= w.rows) ? 1 : w.grid[ty][tx]; }
    function bombAt(w, tx, ty) { for (var i = 0; i < w.bombs.length; i++) if (w.bombs[i].x === tx && w.bombs[i].y === ty) return w.bombs[i]; return null; }
    function itemAt(w, tx, ty) { for (var i = 0; i < w.items.length; i++) { var it = w.items[i]; if (!it.hidden && it.x === tx && it.y === ty) return it; } return null; }
    function flameAt(w, tx, ty) { for (var i = 0; i < w.flames.length; i++) if (w.flames[i].x === tx && w.flames[i].y === ty) return true; return false; }
    function playerHit(w, p) {   // die if any flame tile overlaps the player's hit box (not just the centre tile)
        var hr = w.hitR, tx0 = Math.floor((p.x - hr) / GRID), tx1 = Math.floor((p.x + hr) / GRID), ty0 = Math.floor((p.y - hr) / GRID), ty1 = Math.floor((p.y + hr) / GRID), tx, ty;
        for (ty = ty0; ty <= ty1; ty++) for (tx = tx0; tx <= tx1; tx++) if (flameAt(w, tx, ty)) return true;
        return false;
    }
    function ptile(p) { return { tx: Math.floor(p.x / GRID), ty: Math.floor(p.y / GRID) }; }

    // can the player's box occupy a cell? hard/soft block it; a bomb blocks unless the player is still on it
    function solidFor(w, p, tx, ty) {
        var t = tileAt(w, tx, ty); if (t === 1 || t === 2) return true;
        var b = bombAt(w, tx, ty); if (b) { var pt = ptile(p); if (!(pt.tx === tx && pt.ty === ty)) return true; }
        return false;
    }
    // Lane-based movement with a small "round the corner" forgiveness:
    //  • within CENTER_TOL of a lane AND that lane's forward cell is open → snap onto the lane and pass through
    //    (so a FULL-tile-wide body can still slip past when nearly aligned);
    //  • otherwise collide with the FULL body at the CURRENT y → press the wall and KEEP your y (no yank to centre).
    function movePlayer(w, p, dir) {
        if (dir == null || dir < 0) { p.moving = false; return; }
        p.moving = true; p.dir = dir;
        var d = DIRS[dir], sp = p.speed, half = GRID / 2, SPAN = HALF - 1;
        if (d.dx !== 0) {
            var lane = clampi(Math.round((p.y - half) / GRID), 0, w.rows - 1), cy = lane * GRID + half, off = cy - p.y;
            var nx = p.x + d.dx * sp, col = Math.floor((nx + d.dx * HALF) / GRID);
            if (Math.abs(off) <= w.centerTol && !solidFor(w, p, col, lane)) {
                if (off !== 0) p.y += (off > 0 ? 1 : -1) * Math.min(sp, Math.abs(off));
                p.x = nx;
            } else {
                var r0 = Math.floor((p.y - SPAN) / GRID), r1 = Math.floor((p.y + SPAN) / GRID);
                if (solidFor(w, p, col, r0) || solidFor(w, p, col, r1)) nx = d.dx > 0 ? col * GRID - HALF : (col + 1) * GRID + HALF;
                p.x = nx;
            }
        } else {
            var ln = clampi(Math.round((p.x - half) / GRID), 0, w.cols - 1), cx = ln * GRID + half, ox = cx - p.x;
            var ny = p.y + d.dy * sp, rw = Math.floor((ny + d.dy * HALF) / GRID);
            if (Math.abs(ox) <= w.centerTol && !solidFor(w, p, ln, rw)) {
                if (ox !== 0) p.x += (ox > 0 ? 1 : -1) * Math.min(sp, Math.abs(ox));
                p.y = ny;
            } else {
                var c0 = Math.floor((p.x - SPAN) / GRID), c1 = Math.floor((p.x + SPAN) / GRID);
                if (solidFor(w, p, c0, rw) || solidFor(w, p, c1, rw)) ny = d.dy > 0 ? rw * GRID - HALF : (rw + 1) * GRID + HALF;
                p.y = ny;
            }
        }
    }
    function placeBomb(w, p) {
        if (p.placed >= p.bombs) return;
        var pt = ptile(p); if (bombAt(w, pt.tx, pt.ty)) return;
        w.bombs.push({ x: pt.tx, y: pt.ty, owner: p.id, fuse: w.fuse, power: p.power }); p.placed++;
        w.events.push({ e: 'bomb', x: pt.tx, y: pt.ty });
    }
    function addFlame(w, tx, ty) { for (var i = 0; i < w.flames.length; i++) if (w.flames[i].x === tx && w.flames[i].y === ty) { w.flames[i].until = w.tick + w.flameTicks; return; } w.flames.push({ x: tx, y: ty, until: w.tick + w.flameTicks }); }
    function detonate(w, bomb) {
        var idx = w.bombs.indexOf(bomb); if (idx < 0) return; w.bombs.splice(idx, 1);
        var owner = w.players[bomb.owner]; if (owner && owner.placed > 0) owner.placed--;
        w.events.push({ e: 'explode', x: bomb.x, y: bomb.y });
        addFlame(w, bomb.x, bomb.y);
        for (var di = 0; di < 4; di++) {
            var d = DIRS[di];
            for (var k = 1; k <= bomb.power; k++) {
                var tx = bomb.x + d.dx * k, ty = bomb.y + d.dy * k, t = tileAt(w, tx, ty);
                if (t === 1) break;
                addFlame(w, tx, ty);
                if (t === 2) { w.grid[ty][tx] = 0; revealItem(w, tx, ty); w.events.push({ e: 'break', x: tx, y: ty }); break; }
                var b2 = bombAt(w, tx, ty); if (b2) detonate(w, b2);     // chain reaction
            }
        }
    }
    function revealItem(w, tx, ty) { for (var i = 0; i < w.items.length; i++) { var it = w.items[i]; if (it.x === tx && it.y === ty && it.hidden) { it.hidden = false; return; } } }
    function pickup(w, p) {
        var pt = ptile(p), it = itemAt(w, pt.tx, pt.ty); if (!it) return;
        if (it.type === 'fire') p.power++;
        else if (it.type === 'bomb') p.bombs++;
        else if (it.type === 'speed') p.speed = Math.min(w.maxSpeed, p.speed + 1);
        else if (it.type === 'kick') p.kick = true;
        w.items.splice(w.items.indexOf(it), 1); w.events.push({ e: 'pickup', x: pt.tx, y: pt.ty, type: it.type });
    }

    // advance ONE tick. inputs[i] = { dir:-1|0..3, bomb:0|1 } (missing player = idle). Pure & deterministic.
    function step(w, inputs) {
        w.events.length = 0; if (w.over) return w.events; w.tick++;
        inputs = inputs || [];
        var i, p;
        for (i = 0; i < w.players.length; i++) {
            p = w.players[i]; if (!p.alive) continue;
            var inp = inputs[i] || {};
            movePlayer(w, p, (inp.dir == null ? -1 : inp.dir));
            if (inp.bomb) placeBomb(w, p);
            pickup(w, p);
        }
        for (i = w.bombs.length - 1; i >= 0; i--) { if (w.bombs[i]) { w.bombs[i].fuse--; if (w.bombs[i].fuse <= 0) detonate(w, w.bombs[i]); } }
        for (i = w.flames.length - 1; i >= 0; i--) if (w.flames[i].until <= w.tick) w.flames.splice(i, 1);
        for (i = 0; i < w.players.length; i++) { p = w.players[i]; if (!p.alive) continue; if (playerHit(w, p)) { p.alive = false; w.events.push({ e: 'death', id: p.id }); } }
        var alive = w.players.filter(function (q) { return q.alive; });
        if (alive.length <= 1 && w.players.length > 1) { w.over = true; w.winner = alive.length ? alive[0].id : null; }
        return w.events;
    }

    function aliveCount(w) { var n = 0; for (var i = 0; i < w.players.length; i++) if (w.players[i].alive) n++; return n; }

    window.BombEngine = {
        GRID: GRID, HALF: HALF, DIRS: DIRS, ITEMS: ITEMS,
        create: create, step: step, tileAt: tileAt, bombAt: bombAt, itemAt: itemAt, flameAt: flameAt, ptile: ptile, aliveCount: aliveCount,
    };
})();
