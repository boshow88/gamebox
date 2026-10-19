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

    // default formation for `count` players in the TOP half (y small); mirrored for the bottom team
    function formation(count, W, H) {
        var pts = [{ x: W / 2, y: H * 0.07 }];        // goalie
        var rest = Math.max(0, count - 1);
        var row1 = Math.ceil(rest / 2), row2 = rest - row1;
        var i;
        for (i = 0; i < row1; i++) pts.push({ x: W * (i + 1) / (row1 + 1), y: H * 0.23 });
        for (i = 0; i < row2; i++) pts.push({ x: W * (i + 1) / (row2 + 1), y: H * 0.38 });
        return pts;
    }

    // cfg (all optional): W,H, goalW, players, friction, wallRest,
    //   playerR, ballR, playerMass, ballMass, playerRest, ballRest
    function create(cfg) {
        cfg = cfg || {};
        var W = cfg.W || 552, H = cfg.H || 712;
        var w = {
            W: W, H: H,
            goalW: cfg.goalW || 180,
            friction: cfg.friction != null ? cfg.friction : 0.045,   // fraction of velocity RETAINED per second (lower = more drag)
            rest: cfg.wallRest != null ? cfg.wallRest : 0.72,        // wall restitution
            players: clamp(cfg.players || 5, 2, 7),
            playerR: cfg.playerR || 19, ballR: cfg.ballR || 13,
            playerMass: cfg.playerMass || 1.0, ballMass: cfg.ballMass || 0.55,
            playerRest: cfg.playerRest != null ? cfg.playerRest : 0.55,
            ballRest: cfg.ballRest != null ? cfg.ballRest : 0.72,
            bodies: [],
        };
        w.goalX0 = (W - w.goalW) / 2; w.goalX1 = (W + w.goalW) / 2;
        var slots = formation(w.players, W, H);
        // top team (1): formation as-is; bottom team (0): mirrored across the mid-line
        slots.forEach(function (s) { w.bodies.push({ x: s.x, y: s.y, vx: 0, vy: 0, r: w.playerR, m: w.playerMass, rest: w.playerRest, team: 1, kind: 'player' }); });
        slots.forEach(function (s) { w.bodies.push({ x: s.x, y: H - s.y, vx: 0, vy: 0, r: w.playerR, m: w.playerMass, rest: w.playerRest, team: 0, kind: 'player' }); });
        w.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: w.ballR, m: w.ballMass, rest: w.ballRest, team: -1, kind: 'ball' };
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

    function wall(w, o) {                 // bounce off walls; return a goal side if the ball exits a gap
        var r = o.r, goal = null, inGap = (o.x > w.goalX0 && o.x < w.goalX1);
        if (o.x < r) { o.x = r; o.vx = -o.vx * w.rest; }
        else if (o.x > w.W - r) { o.x = w.W - r; o.vx = -o.vx * w.rest; }
        if (o.kind === 'ball' && inGap && o.y < 0) return 'top';
        if (o.kind === 'ball' && inGap && o.y > w.H) return 'bottom';
        if (o.y < r && !(o.kind === 'ball' && inGap)) { o.y = r; o.vy = -o.vy * w.rest; }
        else if (o.y > w.H - r && !(o.kind === 'ball' && inGap)) { o.y = w.H - r; o.vy = -o.vy * w.rest; }
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
        var b = w.bodies, n = b.length, goal = null, damp = Math.pow(w.friction, dt), i, j, it, o;
        for (i = 0; i < n; i++) {
            o = b[i];
            o.vx *= damp; o.vy *= damp;
            o.x += o.vx * dt; o.y += o.vy * dt;
            var g = wall(w, o); if (g) goal = g;
        }
        for (it = 0; it < 3; it++) for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) collide(b[i], b[j]);
        return goal;
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
        step: step, atRest: atRest, freeze: freeze, settle: settle, snapshot: snapshot,
    };
})();
