/**
 * Bullet Storm — an omnidirectional bullet-dodge survival.
 *
 * Dots stream in from every edge of the field at a mix of speeds. Most fly
 * straight; RED ones are HOMING — they track you for a while, the red fading as
 * they give up, then fly straight on. You have a few lives; your score is how
 * long you last.
 *
 * Control depends on device: a MOUSE moves the dot directly (the dot is the
 * cursor, which is hidden over the board); TOUCH uses a RELATIVE drag you can
 * start anywhere on the page (the dot moves by your finger's *motion*), so your
 * hand never hides the board and an off-board start never whiffs. There is no
 * speed cap — the dot tracks your input 1:1, so dodging is pure skill.
 *
 * Difficulty (easy / normal / hard) changes lives, the spawn rate, bullet speed,
 * how many home, and bullet size. Both the spawn rate and bullet speed rise
 * over time on a softplus curve (a + ln(B + e^(c·t))): flat-ish early, then
 * roughly linear with slope c, so a run escalates without end.
 *
 * Bullets are TYPE-DRIVEN: each has a `kind` with its own motion + look, so new
 * kinds (curving shots, lasers, …) can be added for late game / hard mode by
 * extending spawnBullet / updateBulletKind / drawBullet — see those functions.
 *
 * Built on window.ArcadeCommon (shell / loop / input / audio / i18n / scores /
 * rng / math / format). Rendering is Canvas 2D at a fixed 600×760 portrait space.
 * All balance lives in CONFIG + DIFFICULTIES at the top.
 */
(function () {
    'use strict';

    const AC = window.ArcadeCommon;
    const PI2 = Math.PI * 2;

    // =================================================================
    // i18n (gameplay strings; launcher card strings live in common.js)
    // =================================================================

    Object.assign(AC.i18n.STRINGS.en, {
        ddEasy: 'Easy',
        ddNormal: 'Normal',
        ddHard: 'Hard',
        ddReady: 'Ready',
        ddIntro: 'Bullets stream in from every edge; a warned beam cuts across, and red ones track you. Weave your dot through the gaps and last as long as you can.',
        ddStartHintHtml: 'Mouse moves the dot · touch drags anywhere · <kbd>P</kbd> pause',
        ddOverMsgHtml: (s) => `You survived <strong>${s}</strong> s.`,
        ddOverHintHtml: 'Press <kbd>R</kbd> or the button to try again.',
        ddHelp1Html: 'Bullets stream in from <strong>every edge</strong>. Weave your dot through the gaps \u2014 your <strong>score is how long you survive</strong>.',
        ddHelp2Html: 'On a <strong>mouse</strong>, the dot follows your <strong>cursor</strong>. On <strong>touch</strong>, drag <strong>anywhere</strong> \u2014 lift and re-press to <strong>re-anchor</strong>.',
        ddHelp3Html: 'A hit costs a <strong>life</strong>; at zero lives the run ends. <kbd>P</kbd> pause \u00b7 <kbd>R</kbd> restart \u00b7 <kbd>M</kbd> mute.',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        ddEasy: '簡單',
        ddNormal: '普通',
        ddHard: '困難',
        ddReady: '準備好了',
        ddIntro: '子彈從四面八方湧入；雷射會先預警再貫穿，紅色的則會追蹤你。在縫隙間穿梭閃避，盡量撐久一點。',
        ddStartHintHtml: '滑鼠移動、觸控任意處拖曳 · <kbd>P</kbd> 暫停',
        ddOverMsgHtml: (s) => `你撐了 <strong>${s}</strong> 秒。`,
        ddOverHintHtml: '按 <kbd>R</kbd> 或按鈕再玩一次。',
        ddHelp1Html: '子彈從<strong>四面八方</strong>湧入。在縫隙間穿梭閃避——<strong>分數就是你的存活時間</strong>。',
        ddHelp2Html: '用<strong>滑鼠</strong>時直接<strong>跟著游標</strong>；用<strong>觸控</strong>時在<strong>任意處</strong>拖曳，放開再按可<strong>重新定錨</strong>。',
        ddHelp3Html: '被擊中扣一條<strong>命</strong>；命歸零即結束。<kbd>P</kbd> 暫停 \u00b7 <kbd>R</kbd> 重新開始 \u00b7 <kbd>M</kbd> 靜音。',
    });

    // =================================================================
    // Config + difficulty
    // =================================================================

    const W = 600, H = 760;

    const CONFIG = {
        playerRadius: 8,
        playerMaxSpeed: 0,      // px/s cap on the dot's speed; 0 = unlimited (pure 1:1 control)
        invulnSec: 1.6,         // brief invulnerability after a hit (one cluster ≠ instant wipe)
        spawnMargin: 26,        // bullets appear this far outside the field edge
        spawnOverscan: 0.4,     // spawn point runs this × past each corner, so shots can
                                // enter diagonally and coverage stays even (no calm corners)
        straightSpread: 0.62,   // max angle (rad) a straight shot deviates from straight-in
        homingTurnRate: 1.2,    // rad/s — max steering of a homing bullet (lower = easier to shake)
        homingTime: 10.0,       // sec it tracks before committing to a straight line (so it always leaves)
        homingSpeedMul: 1.0,    // homing bullets fly this × normal speed (a touch slower = fairer)
        homingFadeFrac: 0.2,    // red stays solid while tracking, then fades to white over this final fraction
        speedVariance: 0.4,     // ± fraction on each bullet's speed, so shots come fast and slow
        bulletSizeBias: 1.8,    // radius = min + (max-min)·u^this; >1 biases toward smaller bullets
        laserWarn: 1.8,         // telegraph (warning line) seconds before a laser fires
        laserActive: 0.7,       // seconds the beam is live and lethal
        laserWidth: 6,          // beam half-width (px); collision = this + playerRadius
        specialRampTau: 60,     // homing/laser share ramps in; half their final ratio by this many sec
        curveB: 100,            // softplus knee for the rate/speed curves: a + ln(curveB + e^(c·t))
        countdownSec: 3,        // "get ready" countdown before a run starts
    };

    // Per-difficulty balance. lives = hits you can take (each grants brief
    // invulnerability). rate = bullets/sec, speed = px/sec, each a softplus curve
    // a + ln(curveB + e^(c·t)): flat-ish early, then roughly linear with slope c.
    // homing = late-game fraction of bullets that track you (Hard only).
    // laser  = late-game ratio of lasers to bullets (Easy/Normal only).
    // Both phase in over time (specialRampTau). bulletR = [min, max] radius.
    const DIFFICULTIES = {
        easy:   { lives: 3, rate: { a:  5.0, c: 0.040 }, speed: { a: 50, c: 0.40 }, homing: 0.02, laser: 0.02, bulletR: [6, 12] },
        normal: { lives: 3, rate: { a:  5.5, c: 0.044 }, speed: { a: 55, c: 0.44 }, homing: 0.04, laser: 0.06, bulletR: [5, 10] },
        hard:   { lives: 3, rate: { a:  6.0, c: 0.048 }, speed: { a: 60, c: 0.48 }, homing: 0.12, laser: 0.12, bulletR: [4,  8] },
    };

    // =================================================================
    // State
    // =================================================================

    const G = {
        rng: null,
        difficulty: 'normal',
        diffCfg: null,
        px: W / 2, py: H / 2,   // player position
        tx: W / 2, ty: H / 2,   // player target (driven by the relative drag)
        bullets: [],
        lasers: [],
        elapsed: 0,
        score: 0,
        spawnAcc: 0,
        laserAcc: 0,
        countdown: 0,
        lives: 3, maxLives: 3,
        invuln: 0,              // seconds of post-hit invulnerability remaining
        shake: 0,
        ended: false,
        deadBullet: null,
    };

    let seedCounter = 1;
    let shell = null;
    let staged = 'normal';      // difficulty chosen for the NEXT run
    let drag = null;            // { ax, ay, sx, sy } relative-control anchor
    let accentCache = null;
    let fontCache = null;

    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const dom = {
        time: document.getElementById('time'),
        lives: document.getElementById('lives'),
        diffSeg: document.getElementById('difficulty-seg'),
    };
    const livesStat = dom.lives ? dom.lives.closest('.hud-stat') : null;

    function fitCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function getFont() {
        if (!fontCache) {
            fontCache = getComputedStyle(document.body).getPropertyValue('--font-display')
                || '"Segoe UI", system-ui, sans-serif';
        }
        return fontCache;
    }
    function accent() {
        if (!accentCache) {
            accentCache = (getComputedStyle(document.body).getPropertyValue('--game-color') || '').trim()
                || '#a78bfa';
        }
        return accentCache;
    }
    function mix(a, b, t) { return Math.round(a + (b - a) * t); }
    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // =================================================================
    // Difficulty-over-time curves (softplus: flat early, then ~linear)
    // =================================================================

    // a + ln(curveB + e^(c·t)); for large x = c·t this tends to a + x (a straight
    // line of slope c), guarded so e^x never overflows to Infinity.
    function softCurve(a, c) {
        const x = c * G.elapsed;
        return a + (x > 60 ? x : Math.log(CONFIG.curveB + Math.exp(x)));
    }
    function spawnRate() {
        const r = G.diffCfg.rate;
        return softCurve(r.a, r.c);
    }
    function bulletSpeed() {
        const s = G.diffCfg.speed;
        return softCurve(s.a, s.c);
    }
    // Special attacks (homing, lasers) phase in: ramps 0 → 1 over time, so their
    // share of the bullets starts near zero and approaches a fixed ratio.
    function specialRamp() {
        return G.elapsed / (G.elapsed + CONFIG.specialRampTau);
    }

    // =================================================================
    // Input — relative drag control (press anchors, motion steers)
    // =================================================================

    function fieldPos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width * W,
            y: (e.clientY - rect.top) / rect.height * H,
            rect,
        };
    }
    function clampField(x, y) {
        return {
            x: AC.math.clamp(x, CONFIG.playerRadius, W - CONFIG.playerRadius),
            y: AC.math.clamp(y, CONFIG.playerRadius, H - CONFIG.playerRadius),
        };
    }

    // Two control schemes, chosen by pointer type:
    //  · MOUSE (desktop): the dot simply IS the cursor — it tracks the mouse
    //    whenever it's over (or near) the board, and the OS cursor is hidden. No
    //    press needed, so you can never "whiff" a tap.
    //  · TOUCH/PEN: RELATIVE drag you can start ANYWHERE on the page (not just
    //    the board). The dot moves by your finger's motion, so you can steer from
    //    off the board (your hand never hides it) and an off-board start never
    //    whiffs. Lift and press again to re-anchor.

    function onPointerDown(e) {
        if (!shell.isPlaying()) return;
        if (e.target.closest('button, a')) return;     // let the on-screen controls work
        if (e.pointerType === 'mouse') return;         // mouse is handled by move-tracking
        if (!e.target.closest('.stage-pad')) return;   // touch starts a drag only in the play zone
        AC.audio.unlock();
        const p = fieldPos(e);
        drag = { ax: p.x, ay: p.y, sx: G.px, sy: G.py };
        G.tx = G.px; G.ty = G.py;
        if (e.cancelable) e.preventDefault();
    }
    function onPointerMove(e) {
        if (!shell.isPlaying()) return;
        const p = fieldPos(e);
        if (e.pointerType === 'mouse') {
            // Track only while the cursor is over the board (+ a small margin),
            // so reaching up for Pause doesn't drag the dot away.
            const r = p.rect, pad = 60;
            if (e.clientX >= r.left - pad && e.clientX <= r.right + pad &&
                e.clientY >= r.top - pad && e.clientY <= r.bottom + pad) {
                const c = clampField(p.x, p.y);
                G.tx = c.x; G.ty = c.y;
            }
        } else if (drag) {
            const c = clampField(drag.sx + (p.x - drag.ax), drag.sy + (p.y - drag.ay));
            G.tx = c.x; G.ty = c.y;
            if (e.cancelable) e.preventDefault();
        }
    }
    function onPointerUp(e) {
        if (e.pointerType !== 'mouse') drag = null;    // release re-anchors next press
    }

    // While a run is live: hide the OS cursor over the board (the dot is the
    // cursor) and lock page scrolling so an off-board touch-drag never scrolls.
    function setPlayingInput(on) {
        canvas.style.cursor = on ? 'none' : '';   // desktop: hide the OS cursor; the dot is the pointer
        if (!on) drag = null;
    }

    // Ease the dot toward its target, but never faster than the speed cap.
    function stepPlayer(dt) {
        // 0 = unlimited: the dot tracks the pointer 1:1. The swept collision
        // test still checks the whole old→new segment, so fast moves can't
        // tunnel through a bullet — speed is pure skill expression.
        const maxD = CONFIG.playerMaxSpeed > 0 ? CONFIG.playerMaxSpeed * dt : Infinity;
        const dx = G.tx - G.px, dy = G.ty - G.py;
        const d = Math.hypot(dx, dy);
        if (d <= maxD || d === 0) { G.px = G.tx; G.py = G.ty; }
        else { G.px += dx / d * maxD; G.py += dy / d * maxD; }
    }

    // =================================================================
    // Bullets (type-driven)
    // =================================================================

    function spawnBullet() {
        const br = G.diffCfg.bulletR;   // size skews toward the small end (bulletSizeBias)
        const r = br[0] + (br[1] - br[0]) * Math.pow(AC.rng.float(G.rng, 0, 1), CONFIG.bulletSizeBias);
        const m = CONFIG.spawnMargin + r;
        const ox = W * CONFIG.spawnOverscan, oy = H * CONFIG.spawnOverscan;
        const edge = AC.rng.int(G.rng, 0, 4);   // 0 top · 1 right · 2 bottom · 3 left
        let x, y, inAng;                          // spawn point + inward direction
        if (edge === 0)      { x = AC.rng.float(G.rng, -ox, W + ox); y = -m;      inAng = Math.PI / 2; }
        else if (edge === 1) { x = W + m; y = AC.rng.float(G.rng, -oy, H + oy);   inAng = Math.PI; }
        else if (edge === 2) { x = AC.rng.float(G.rng, -ox, W + ox); y = H + m;   inAng = -Math.PI / 2; }
        else                 { x = -m; y = AC.rng.float(G.rng, -oy, H + oy);      inAng = 0; }

        let speed = bulletSpeed() * (1 + AC.rng.float(G.rng, -CONFIG.speedVariance, CONFIG.speedVariance));
        const homing = AC.rng.float(G.rng, 0, 1) < G.diffCfg.homing * specialRamp();

        let ang;
        if (homing) {
            speed *= CONFIG.homingSpeedMul;
            ang = Math.atan2(G.py - y, G.px - x);   // start heading at you, then keep tracking
        } else {
            ang = inAng + AC.rng.float(G.rng, -CONFIG.straightSpread, CONFIG.straightSpread);
        }

        G.bullets.push({
            x, y, r,
            vx: Math.cos(ang) * speed,
            vy: Math.sin(ang) * speed,
            kind: homing ? 'homing' : 'straight',
            homing: homing,    // true while still tracking; cleared after homingTime
            age: 0,
        });
    }

    // Per-kind steering, applied BEFORE integration each step. 'straight' shots
    // fly in a line; 'homing' shots track the player (capped turn rate) for a
    // while, then straighten so they always leave. New kinds (e.g. a charging
    // laser) hook in here by nudging b.vx / b.vy — keep them leaving eventually.
    function updateBulletKind(b, dt) {
        b.age += dt;
        if (b.kind === 'homing' && b.homing) {
            if (b.age >= CONFIG.homingTime) {
                b.homing = false;   // commit to a straight line so it always leaves the field
            } else {
                // Steer toward the player, capped by the turn rate — a sharp juke
                // can make it overshoot, so it's dodgeable, not a guaranteed hit.
                const speed = Math.hypot(b.vx, b.vy);
                const cur = Math.atan2(b.vy, b.vx);
                let diff = Math.atan2(G.py - b.y, G.px - b.x) - cur;
                diff = Math.atan2(Math.sin(diff), Math.cos(diff));   // wrap to [-PI, PI]
                const maxTurn = CONFIG.homingTurnRate * dt;
                if (diff > maxTurn) diff = maxTurn;
                else if (diff < -maxTurn) diff = -maxTurn;
                const ang = cur + diff;
                b.vx = Math.cos(ang) * speed;
                b.vy = Math.sin(ang) * speed;
            }
        }
    }

    function offField(b) {
        const m = CONFIG.spawnMargin + b.r + 48;
        return b.x < -m || b.x > W + m || b.y < -m || b.y > H + m;
    }

    // Swept circle-vs-circle test over one step (continuous, so fast shots
    // can't tunnel through the dot). Returns true if they overlap at any point
    // along both bodies' linear motion this frame. Uses squared distance.
    function collideSwept(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1, R) {
        const ox = ax0 - bx0, oy = ay0 - by0;                         // relative start offset
        const dx = (ax1 - ax0) - (bx1 - bx0), dy = (ay1 - ay0) - (by1 - by0); // relative motion
        const a = dx * dx + dy * dy;
        const b = 2 * (ox * dx + oy * dy);
        const c = ox * ox + oy * oy;
        const t = a > 0 ? AC.math.clamp(-b / (2 * a), 0, 1) : 0;
        const minDist2 = a * t * t + b * t + c;
        return minDist2 <= R * R;
    }

    // =================================================================
    // Lasers (telegraphed beams — a warned line, then a lethal beam)
    // =================================================================

    function spawnLaser() {
        G.lasers.push({
            x: AC.rng.float(G.rng, 0, W),
            y: AC.rng.float(G.rng, 0, H),
            ang: AC.rng.float(G.rng, 0, Math.PI),   // orientation of the beam line
            phase: 'warn',
            t: CONFIG.laserWarn,
        });
        AC.audio.play('grab');   // a "charging" cue when the warning appears
    }
    // Signed perpendicular distance from a point to the beam's (infinite) line.
    function laserDist(L, px, py) {
        return (px - L.x) * Math.sin(L.ang) - (py - L.y) * Math.cos(L.ang);
    }
    // Advance all lasers; during the lethal phase, sweep the dot's motion against
    // the beam line so a fast dash can't tunnel across it. Returns true if a hit
    // ended the run.
    function updateLasers(dt, px0, py0, px1, py1) {
        const R = CONFIG.laserWidth + CONFIG.playerRadius;
        for (let i = G.lasers.length - 1; i >= 0; i--) {
            const L = G.lasers[i];
            L.t -= dt;
            if (L.phase === 'warn') {
                if (L.t <= 0) { L.phase = 'fire'; L.t = CONFIG.laserActive; AC.audio.play('laser'); }
                continue;
            }
            if (L.t <= 0) { G.lasers.splice(i, 1); continue; }
            if (G.invuln <= 0) {
                const d0 = laserDist(L, px0, py0), d1 = laserDist(L, px1, py1);
                const crossed = (d0 <= 0) !== (d1 <= 0);   // the dot swept across the line
                if (crossed || Math.min(Math.abs(d0), Math.abs(d1)) <= R) {
                    if (onHit(null)) return true;
                }
            }
        }
        return false;
    }

    // A hit costs a life + grants brief invulnerability. Returns true if that
    // was the last life (the run is over).
    function onHit(b) {
        G.lives--;
        G.shake = 0.4;
        updateHud();
        if (G.lives <= 0) { die(b); return true; }
        G.invuln = CONFIG.invulnSec;
        AC.audio.play('rock');
        return false;
    }

    function die(b) {
        if (G.ended) return;
        G.ended = true;
        G.deadBullet = b;
        AC.audio.play('rock');
        shell.gameOver({ score: Math.floor(G.elapsed), win: false, meta: { seconds: +G.elapsed.toFixed(1) } });
    }

    // =================================================================
    // Simulation
    // =================================================================

    function update(dt) {
        if (G.ended) return;

        // Brief "get ready" countdown: let the player pre-position, no bullets yet.
        if (G.countdown > 0) {
            G.countdown -= dt;
            stepPlayer(dt);
            return;
        }

        G.elapsed += dt;
        G.score = G.elapsed;
        if (G.invuln > 0) G.invuln = Math.max(0, G.invuln - dt);
        if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);

        // Spawn on a smooth accumulator (fixed-timestep loop keeps the cadence
        // even without any per-frame probability smoothing).
        G.spawnAcc += dt * spawnRate();
        let guard = 0;
        while (G.spawnAcc >= 1 && guard++ < 40) { spawnBullet(); G.spawnAcc -= 1; }

        // Laser rate tracks the bullet rate and ramps in, so lasers approach a
        // fixed share of the bullets (G.diffCfg.laser) in the late game.
        G.laserAcc += dt * (G.diffCfg.laser || 0) * spawnRate() * specialRamp();
        while (G.laserAcc >= 1) { spawnLaser(); G.laserAcc -= 1; }

        // Move the dot, then sweep every bullet against the dot's motion.
        const px0 = G.px, py0 = G.py;
        stepPlayer(dt);
        const px1 = G.px, py1 = G.py;

        for (let i = G.bullets.length - 1; i >= 0; i--) {
            const b = G.bullets[i];
            updateBulletKind(b, dt);
            const bx0 = b.x, by0 = b.y;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (G.invuln <= 0 &&
                collideSwept(px0, py0, px1, py1, bx0, by0, b.x, b.y, CONFIG.playerRadius + b.r)) {
                if (onHit(b)) return;   // out of lives → run over
            }
            if (offField(b)) G.bullets.splice(i, 1);
        }

        if (updateLasers(dt, px0, py0, px1, py1)) return;   // laser hit may end the run

        updateHud();
    }

    // =================================================================
    // Rendering
    // =================================================================

    function render() {
        ctx.fillStyle = '#0c0a18';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        if (G.shake > 0) {
            const s = G.shake * 10;
            ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
        }
        drawLasers();
        for (const b of G.bullets) drawBullet(b);
        drawPlayer();
        if (G.ended) drawDeath();
        ctx.restore();

        if (G.countdown > 0) drawCountdown();
    }

    function drawBullet(b) {
        // The circle IS the hitbox (radius b.r). A homing bullet is RED and
        // fades toward plain white as its tracking time runs out — once white it
        // has given up and is just a normal bullet. All other shots are white.
        ctx.save();
        if (b.kind === 'homing' && b.homing) {
            // Stay solid red while tracking, then fade red→white only over the
            // final homingFadeFrac (a field of half-faded dots looked messy).
            const prog = AC.math.clamp(b.age / CONFIG.homingTime, 0, 1);
            const f = AC.math.clamp((prog - (1 - CONFIG.homingFadeFrac)) / CONFIG.homingFadeFrac, 0, 1);
            ctx.fillStyle = 'rgb(' + mix(255, 226, f) + ',' + mix(77, 232, f) + ',' + mix(87, 240, f) + ')';
            ctx.shadowColor = 'rgba(255, 77, 87, ' + (0.6 * (1 - f)).toFixed(3) + ')';
            ctx.shadowBlur = 10;
        } else {
            ctx.fillStyle = '#e2e8f0';
            ctx.shadowColor = 'rgba(226, 232, 240, 0.5)';
            ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, PI2);
        ctx.fill();
        ctx.restore();
    }

    function drawLasers() {
        for (const L of G.lasers) {
            const dx = Math.cos(L.ang) * 1000, dy = Math.sin(L.ang) * 1000;
            ctx.save();
            if (L.phase === 'warn') {
                const k = 1 - L.t / CONFIG.laserWarn;   // 0 (just appeared) → 1 (about to fire)
                // A charging countdown: the line thickens, brightens, shifts
                // cyan → hot-white and turns from dashed to solid as it nears
                // firing — so the remaining time reads at a glance.
                ctx.strokeStyle = 'rgba(' + mix(94, 255, k) + ', ' + mix(224, 255, k) + ', 255, ' + (0.25 + 0.6 * k).toFixed(3) + ')';
                ctx.lineWidth = 2 + (CONFIG.laserWidth - 2) * k;
                ctx.setLineDash(k < 0.7 ? [10, 8] : []);
                if (k > 0.7) { ctx.shadowColor = 'rgba(180, 240, 255, 0.9)'; ctx.shadowBlur = 10; }
            } else {
                ctx.strokeStyle = 'rgba(94, 224, 255, 0.95)';
                ctx.shadowColor = 'rgba(94, 224, 255, 0.9)';
                ctx.shadowBlur = 16;
                ctx.lineWidth = CONFIG.laserWidth * 2;
            }
            ctx.beginPath();
            ctx.moveTo(L.x - dx, L.y - dy);
            ctx.lineTo(L.x + dx, L.y + dy);
            ctx.stroke();
            ctx.restore();
        }
    }

    function drawPlayer() {
        const c = accent();
        ctx.save();
        // Blink while invulnerable after a hit.
        if (G.invuln > 0) ctx.globalAlpha = (Math.floor(G.invuln * 12) % 2 === 0) ? 0.35 : 0.95;
        ctx.shadowColor = c;
        ctx.shadowBlur = 18;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(G.px, G.py, CONFIG.playerRadius, 0, PI2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.beginPath();
        ctx.arc(G.px, G.py, CONFIG.playerRadius * 0.45, 0, PI2);
        ctx.fill();
        ctx.restore();
    }

    function drawDeath() {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 90, 112, 0.9)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(G.px, G.py, CONFIG.playerRadius * 2.4, 0, PI2);
        ctx.stroke();
        ctx.restore();
    }

    function drawCountdown() {
        const n = Math.ceil(G.countdown);
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.font = `800 120px ${getFont()}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n > 0 ? n : '', W / 2, H / 2);
        ctx.restore();
    }

    // =================================================================
    // HUD + difficulty selector
    // =================================================================

    function updateHud() {
        if (dom.time) dom.time.textContent = AC.format.score(Math.floor(G.elapsed));
        renderLives();
        if (livesStat) livesStat.classList.toggle('danger', G.lives <= 1);
    }
    // Lives as pips (easier to read at a glance than a number).
    function renderLives() {
        if (!dom.lives) return;
        const max = G.maxLives || 1, cur = Math.max(0, G.lives);
        let html = '';
        for (let i = 0; i < max; i++) html += '<i class="life-pip' + (i < cur ? '' : ' lost') + '"></i>';
        dom.lives.innerHTML = html;
    }

    function syncDiffButtons() {
        if (!dom.diffSeg) return;
        for (const b of dom.diffSeg.querySelectorAll('button[data-diff]')) {
            const d = b.dataset.diff;
            b.classList.toggle('active', d === staged);
            b.classList.toggle('committed', d === G.difficulty && G.difficulty !== staged);
            b.setAttribute('aria-checked', d === staged ? 'true' : 'false');
        }
    }
    // Picking a difficulty stages it; it applies on the next run (or right away
    // on the ready screen, so the preview + Start match the choice).
    function setDifficulty(d) {
        if (!DIFFICULTIES[d] || d === staged) return;
        staged = d;
        AC.prefs.set('bullet-storm', { difficulty: d });
        if (shell && shell.state === 'idle') {
            resetRun();
            render();
        } else {
            syncDiffButtons();
        }
    }

    // =================================================================
    // Overlay content
    // =================================================================

    function overlayContent(state, result) {
        if (state === 'idle') {
            return {
                badge: 'target',
                title: AC.i18n.t('ddReady'),
                message: AC.i18n.t('ddIntro'),
                button: AC.i18n.t('play'),
                hint: AC.i18n.t('ddStartHintHtml'),
            };
        }
        if (state === 'over') {
            const score = AC.format.score(result ? result.score : Math.floor(G.elapsed));
            let msg = AC.i18n.t('ddOverMsgHtml', score);
            if (result && result.isNewBest) msg += ` <strong>${AC.i18n.t('newBest')}</strong>`;
            return {
                badge: 'skull',
                title: AC.i18n.t('gameOver'),
                message: msg,
                button: AC.i18n.t('restart'),
                hint: AC.i18n.t('ddOverHintHtml'),
            };
        }
        return {};   // paused uses the shell default
    }

    // =================================================================
    // Reset + init
    // =================================================================

    function resetRun() {
        G.rng = AC.rng.make(seedCounter++);
        G.difficulty = staged;
        G.diffCfg = DIFFICULTIES[G.difficulty];
        G.lives = G.maxLives = G.diffCfg.lives;
        G.px = G.tx = W / 2;
        G.py = G.ty = H / 2;
        G.bullets = [];
        G.lasers = [];
        G.elapsed = 0;
        G.score = 0;
        G.spawnAcc = 0;
        G.laserAcc = 0;
        G.countdown = 0;
        G.invuln = 0;
        G.shake = 0;
        G.ended = false;
        G.deadBullet = null;
        drag = null;
        setPlayingInput(false);           // ready/idle: show cursor, allow page scroll
        updateHud();
        if (shell) shell.refreshBest();   // Best reflects the committed difficulty
        syncDiffButtons();
    }

    function init() {
        const pref = AC.prefs.get('bullet-storm');
        staged = DIFFICULTIES[pref.difficulty] ? pref.difficulty : 'normal';
        G.difficulty = staged;

        fitCanvas();
        window.addEventListener('resize', () => { fitCanvas(); render(); });

        shell = AC.shell.create({
            gameId: 'bullet-storm',
            mode: () => G.difficulty,   // high scores are per-difficulty
            scoreEpoch: 20261009,       // bump this (e.g. to today's date) to reset everyone's bests once
            step: 1 / 60,
            preventKeys: ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
            update,
            render,
            reset: resetRun,
            onStart: () => { G.countdown = CONFIG.countdownSec; setPlayingInput(true); },
            onPause: () => { setPlayingInput(false); },
            onResume: () => { setPlayingInput(true); },
            onGameOver: () => { setPlayingInput(false); },
            overlayContent,
            restartToReady: true,
        });

        // Touch/pen can start a drag ANYWHERE on the page (relative control), so
        // listen on the document; mouse is tracked by movement over the board.
        // Move/up/cancel live on window so a drag that strays off-board still works.
        document.addEventListener('pointerdown', onPointerDown, { passive: false });
        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', () => { drag = null; });

        if (dom.diffSeg) {
            dom.diffSeg.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-diff]');
                if (btn) { AC.audio.unlock(); setDifficulty(btn.dataset.diff); }
            });
        }

        AC.i18n.subscribe(() => { updateHud(); });

        syncDiffButtons();
        resetRun();
        render();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
