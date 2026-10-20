/* Carom — pure 2-D flick-physics soccer. NO DOM, NO rendering, deterministic given
 * the same inputs. This is the shared forward model: the live game steps it for
 * animation, online will replay shots through it, and a future CPU / self-play
 * trainer can run it head-less at speed (see `settle`). Keep it free of globals.
 *
 * Coordinate space is FIELD-LOCAL: x in [0, W], y in [0, H]. Goals are centred
 * gaps in the top (y=0) and bottom (y=H) edges. Only the BALL may pass a gap.
 *   - ball crosses y<0 through the gap  -> 'top'    (the top net is breached)
 *   - ball crosses y>H through the gap  -> 'bottom' (the bottom net is breached)
 * Teams: 0 = bottom, 1 = top, ball = -1.
 */
(function () {
    'use strict';

    var REST_EPS = 6;           // below this speed (px/s) a body is considered stopped
    var STEP_DT = 1 / 240;      // canonical physics tick — the live game sub-steps at THIS same dt, so its
                                // animation lands exactly where settle() computes (no end-of-shot snap / desync)

    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

    // formation for `count` players in the TOP half (y small, own goal at y=0); mirrored for the bottom team.
    // Bespoke layouts (as fractions of W,H) are tuned to deny an easy KICK-OFF goal; others fall back to the
    // generic goalie + two rows. The 5-man wall: goalie + two backs together seal the goal-mouth width (blocks
    // the straight shot AND the shot threaded through a gap edge), with two forwards pushed up to also sit in
    // the diagonal lanes a one-wall-bounce would travel.
    var FORMATIONS = {
        5: [
            { x: 0.50, y: 0.055 },   // goalie — dead centre in the mouth
            { x: 0.42, y: 0.16 },    // left back  ┐ overlap the goalie to cover the whole gap width
            { x: 0.58, y: 0.16 },    // right back ┘
            { x: 0.27, y: 0.35 },    // left forward  ┐ wide + pushed up: attack, and screen the bounce lanes
            { x: 0.73, y: 0.35 },    // right forward ┘
        ],
    };
    function formation(count, W, H) {
        var spec = FORMATIONS[count];
        if (spec) return spec.map(function (p) { return { x: W * p.x, y: H * p.y }; });
        var pts = [{ x: W / 2, y: H * 0.07 }];        // generic: goalie
        var rest = Math.max(0, count - 1);
        var row1 = Math.ceil(rest / 2), row2 = rest - row1;
        var i;
        for (i = 0; i < row1; i++) pts.push({ x: W * (i + 1) / (row1 + 1), y: H * 0.23 });
        for (i = 0; i < row2; i++) pts.push({ x: W * (i + 1) / (row2 + 1), y: H * 0.38 });
        return pts;
    }

    // cfg (all optional): W,H, goalW, players, wallRest,
    //   mu, kAir, playerFric, ballFric,
    //   playerR, ballR, playerMass, ballMass, playerRest, ballRest
    //
    // Friction model (see step): each body decelerates by
    //     a = mu * fricMul            (Coulomb — constant, field-set, brings it to a TRUE stop)
    //       + kAir * (r / m) * v^2    (air drag — grows with size/mass, so big+light "floats" to a stop)
    // mu is the field's drag (ice<grass<sand); fricMul is per-body (ball rolls → <1; players grip → 1).
    function create(cfg) {
        cfg = cfg || {};
        var W = cfg.W || 552, H = cfg.H || 712;
        var w = {
            W: W, H: H,
            goalW: cfg.goalW || 180,
            mu: cfg.mu != null ? cfg.mu : 2600,          // field Coulomb deceleration (px/s^2); lower = more slippery
            kAir: cfg.kAir != null ? cfg.kAir : 7e-6,    // global air-drag coefficient (applied as kAir*(r/m)*v^2)
            rest: cfg.wallRest != null ? cfg.wallRest : 0.72,        // wall restitution
            players: clamp(cfg.players || 5, 2, 7),
            playerR: cfg.playerR || 19, ballR: cfg.ballR || 13,
            playerMass: cfg.playerMass || 1.0, ballMass: cfg.ballMass || 0.55,
            playerRest: cfg.playerRest != null ? cfg.playerRest : 0.55,
            ballRest: cfg.ballRest != null ? cfg.ballRest : 0.72,
            playerFric: cfg.playerFric != null ? cfg.playerFric : 1.0,   // players grip the floor
            ballFric: cfg.ballFric != null ? cfg.ballFric : 0.37,        // the ball rolls → far less floor friction
            pocket: cfg.pocket != null ? cfg.pocket : 26,                // depth the goal recesses OUTWARD past the line (a ball must reach the BACK to score)
            keeperZone: cfg.keeperZone != null ? cfg.keeperZone : 60,    // depth of the zone IN FRONT of the goal that a too-deep player is ejected to
            bodies: [],
        };
        w.goalX0 = (W - w.goalW) / 2; w.goalX1 = (W + w.goalW) / 2;
        var slots = formation(w.players, W, H);
        // top team (1): formation as-is; bottom team (0): mirrored across the mid-line
        slots.forEach(function (s) { w.bodies.push({ x: s.x, y: s.y, vx: 0, vy: 0, r: w.playerR, m: w.playerMass, rest: w.playerRest, fricMul: w.playerFric, team: 1, kind: 'player' }); });
        slots.forEach(function (s) { w.bodies.push({ x: s.x, y: H - s.y, vx: 0, vy: 0, r: w.playerR, m: w.playerMass, rest: w.playerRest, fricMul: w.playerFric, team: 0, kind: 'player' }); });
        w.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: w.ballR, m: w.ballMass, rest: w.ballRest, fricMul: w.ballFric, team: -1, kind: 'ball' };
        w.bodies.push(w.ball);
        return w;
    }

    // put every body back to its formation slot and the ball to the centre spot
    function reset(w) {
        var slots = formation(w.players, w.W, w.H), bi = 0, i;
        for (i = 0; i < slots.length; i++) place(w.bodies[bi++], slots[i].x, slots[i].y);
        for (i = 0; i < slots.length; i++) place(w.bodies[bi++], slots[i].x, w.H - slots[i].y);
        place(w.ball, w.W / 2, w.H / 2);
    }
    function place(o, x, y) { o.x = x; o.y = y; o.vx = 0; o.vy = 0; }

    function applyShot(w, idx, dx, dy, power) {
        var o = w.bodies[idx]; if (!o) return;
        var d = Math.hypot(dx, dy) || 1;
        o.vx = dx / d * power; o.vy = dy / d * power;
    }

    // Bounce off walls. Each goal is a RECESSED POCKET of depth `pocket` behind the line: within the mouth the
    // body passes the line into the pocket, bounces off the two posts (extended inward) and the back wall, and a
    // BALL only scores when it reaches the back. So a ball sitting in the mouth can still be dug back out.
    function wall(w, o) {
        var r = o.r, goal = null, DP = w.pocket || 0, inGap = (o.x > w.goalX0 && o.x < w.goalX1);
        // left/right field walls — only while the body is in the main field (not up/down inside a pocket)
        if (o.y >= 0 && o.y <= w.H) {
            if (o.x < r) { o.x = r; o.vx = -o.vx * w.rest; }
            else if (o.x > w.W - r) { o.x = w.W - r; o.vx = -o.vx * w.rest; }
        }
        // TOP edge / pocket — mouth is OPEN (0<=y<r & inGap passes straight through); posts + back only bite once past the line
        if (DP > 0 && inGap && o.y < r) {         // mouth column (lip + pocket): posts bite the whole way so nothing slips out sideways
            if (o.x < w.goalX0 + r) { o.x = w.goalX0 + r; o.vx = -o.vx * w.rest; }     // left post
            else if (o.x > w.goalX1 - r) { o.x = w.goalX1 - r; o.vx = -o.vx * w.rest; } // right post
            if (o.kind === 'ball') { if (o.y < -r) goal = 'top'; }                      // whole ball past the line = score (partly-in can still be dug out)
            else if (o.y < -DP + r) { o.y = -DP + r; o.vy = -o.vy * w.rest; }            // players ride the back wall (ejected at settle)
        } else if (o.y < r) { o.y = r; o.vy = -o.vy * w.rest; }  // closed top wall (outside the gap)
        // BOTTOM edge / pocket (mirror)
        if (DP > 0 && inGap && o.y > w.H - r) {
            if (o.x < w.goalX0 + r) { o.x = w.goalX0 + r; o.vx = -o.vx * w.rest; }
            else if (o.x > w.goalX1 - r) { o.x = w.goalX1 - r; o.vx = -o.vx * w.rest; }
            if (o.kind === 'ball') { if (o.y > w.H + r) goal = 'bottom'; }
            else if (o.y > w.H + DP - r) { o.y = w.H + DP - r; o.vy = -o.vy * w.rest; }
        } else if (o.y > w.H - r) { o.y = w.H - r; o.vy = -o.vy * w.rest; }
        return goal;
    }

    function collide(a, b) {
        var dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) return;
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        var ima = 1 / a.m, imb = 1 / b.m, tim = ima + imb, overlap = rr - d;
        a.x -= nx * overlap * (ima / tim); a.y -= ny * overlap * (ima / tim);
        b.x += nx * overlap * (imb / tim); b.y += ny * overlap * (imb / tim);
        var vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn > 0) return;                              // already separating
        var e = (a.rest + b.rest) / 2, j = -(1 + e) * vn / tim, ix = j * nx, iy = j * ny;
        a.vx -= ix * ima; a.vy -= iy * ima;
        b.vx += ix * imb; b.vy += iy * imb;
    }

    function step(w, dt) {                // advance one tick; returns 'top'|'bottom'|null
        var b = w.bodies, n = b.length, goal = null, i, j, it, o;
        for (i = 0; i < n; i++) {
            o = b[i];
            var sp = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
            if (sp > 0) {
                // Coulomb (field μ × this body's fric) + quadratic air drag (grows with r/m and v²)
                var dec = (w.mu * o.fricMul + w.kAir * (o.r / o.m) * sp * sp) * dt;
                var ns = sp - dec; if (ns < 0) ns = 0;               // clamp → true stop, never reverses
                var k = ns / sp; o.vx *= k; o.vy *= k;
            }
            o.x += o.vx * dt; o.y += o.vy * dt;
            var g = wall(w, o); if (g) goal = g;
        }
        for (it = 0; it < 3; it++) for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) collide(b[i], b[j]);
        return goal;
    }

    // After a shot settles: any PLAYER shoved more than half-way into a pocket is ejected to the front edge of
    // its goal's keeper zone (nudged sideways to a free spot if the base point is occupied). Deterministic (no
    // RNG), MUTATES the world to the final positions, and returns [{idx, fromX, fromY, toX, toY}] for animation.
    function ejectDeep(w) {
        var DP = w.pocket || 0, KZ = w.keeperZone || 0, moved = [], i;
        if (DP <= 0) return moved;
        for (i = 0; i < w.bodies.length; i++) {
            var o = w.bodies[i]; if (o.kind !== 'player') continue;
            var topDeep = o.y < 0, botDeep = o.y > w.H;        // centre past the goal line = "in" → eject it back out
            if (!topDeep && !botDeep) continue;
            var fromX = o.x, fromY = o.y;
            var ty = topDeep ? KZ : (w.H - KZ);
            var tx = clamp(o.x, w.goalX0 + o.r, w.goalX1 - o.r);
            var spot = freeSpot(w, i, tx, ty, o.r);
            o.x = spot.x; o.y = spot.y; o.vx = 0; o.vy = 0;
            moved.push({ idx: i, fromX: fromX, fromY: fromY, toX: o.x, toY: o.y });
        }
        return moved;
    }
    // nearest x (base, then alternating ±steps) with no overlap against the other bodies / already-placed ejects
    function freeSpot(w, idx, bx, by, r) {
        var k, j, i, o, offs = [0], step = r * 1.3;
        for (k = 1; k <= 16; k++) { offs.push(k * step); offs.push(-k * step); }
        for (j = 0; j < offs.length; j++) {
            var x = clamp(bx + offs[j], r + 2, w.W - r - 2), ok = true;
            for (i = 0; i < w.bodies.length; i++) {
                if (i === idx) continue; o = w.bodies[i];
                var rr = r + o.r + 1, ddx = o.x - x, ddy = o.y - by;
                if (ddx * ddx + ddy * ddy < rr * rr) { ok = false; break; }
            }
            if (ok) return { x: x, y: by };
        }
        return { x: bx, y: by };
    }

    function atRest(w) {
        var b = w.bodies, e2 = REST_EPS * REST_EPS, i;
        for (i = 0; i < b.length; i++) if (b[i].vx * b[i].vx + b[i].vy * b[i].vy > e2) return false;
        return true;
    }
    function freeze(w) { var b = w.bodies, i; for (i = 0; i < b.length; i++) { b[i].vx = 0; b[i].vy = 0; } }

    // head-less: run to rest (or a goal, or maxSteps). Used by CPU rollouts / training.
    function settle(w, maxSteps) {
        var dt = STEP_DT, i;
        for (i = 0; i < (maxSteps || 4000); i++) {
            var g = step(w, dt);
            if (g) return g;
            if (atRest(w)) { freeze(w); return null; }
        }
        freeze(w); return null;
    }

    // a cheap structural clone (for CPU rollouts): copies the mutable body state
    function snapshot(w) {
        var c = Object.assign({}, w);
        c.bodies = w.bodies.map(function (o) { return Object.assign({}, o); });
        c.ball = c.bodies[c.bodies.length - 1];
        return c;
    }

    window.CaromEngine = {
        REST_EPS: REST_EPS, STEP_DT: STEP_DT,
        create: create, reset: reset, place: place, applyShot: applyShot,
        step: step, atRest: atRest, freeze: freeze, settle: settle, snapshot: snapshot, ejectDeep: ejectDeep,
    };
})();
