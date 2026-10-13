/**
 * Colour Ladder — a real-time "ghost leg" (amidakuji).
 *
 * Colour-coded balls fall down a ladder of vertical lanes. A fixed set of
 * coloured rungs can be picked up and dropped elsewhere (never added or
 * removed); a rung deflects every ball EXCEPT its own colour (which slips
 * straight through), stepping the rest to the neighbouring lane. Land each
 * ball in the basket of its own colour to score; a wrong basket costs a life.
 * Lives at zero ends the run.
 *
 * Difficulty is a named preset (easy / normal / hard). Layout: easy 3×3,
 * normal & hard 4×4 (lanes × colours); hard also mixes in frequent two-ball
 * waves (different colours). Both the wave rate AND the fall speed rise over
 * time on an unbounded, ever-gentler log curve (base + k·ln(1 + t/tau)), and
 * each difficulty sets its own base/k. To trade routing complexity against
 * pace, the simpler layout runs busier: easy has the highest wave rate and
 * fall speed, hard the lowest. A just-moved rung's recharge shortens as the
 * wave rate climbs, so the late game never outruns it.
 *
 * Rungs: a fixed set you MOVE (never add/remove). A rung steps every ball it
 * meets across to the neighbouring lane. On HARD the rungs are colour-coded and
 * a rung lets its OWN colour pass straight through (a "safe gate"); on Easy /
 * Normal the rungs are plain (colour-agnostic — they step every ball). Press/
 * hold a rung to pick it up and drop it elsewhere; placement is free (height)
 * and a held rung auto-dodges to the nearest clear height so rungs sharing a
 * lane never overlap. While held, the original keeps working and a translucent
 * ghost previews the target.
 *
 * Built on window.ArcadeCommon (shell / loop / input / audio / i18n /
 * scores). Rendering is Canvas 2D at a fixed 600×760 portrait space.
 * All balance lives in CONFIG + DIFFICULTIES at the top.
 */
(function () {
    'use strict';

    const AC = window.ArcadeCommon;
    const PI2 = Math.PI * 2;

    // [DEBUG-HOOK] Dev affordances, enabled with ?debug=1 (see docs/DEV.md).
    const PARAMS = new URLSearchParams(location.search);
    const DEBUG = PARAMS.has('debug');
    const START_T = Math.max(0, parseFloat(PARAMS.get('t')) || 0);

    // =================================================================
    // i18n
    // =================================================================

    Object.assign(AC.i18n.STRINGS.en, {
        lcEasy: 'Easy',
        lcNormal: 'Normal',
        lcHard: 'Hard',
        lcReady: 'Ready',
        lcIntro: 'Route each falling ball into its matching-colour basket by moving the rungs. Each rung steps the balls across to the next lane.',
        lcStartHintHtml: 'Hold a rung and drop it elsewhere · <kbd>P</kbd> pause',
        lcOverMsgHtml: (score) => `You scored <strong>${score}</strong>.`,
        lcOverHintHtml: 'Press <kbd>R</kbd> or the button to play again.',
        lcHelp1Html: 'Coloured balls fall down the <strong>lanes</strong>. Land each in the basket of its <strong>own colour</strong>; a wrong basket costs a <strong>life</strong>.',
        lcHelp2Html: 'Press and hold a <strong>rung</strong>, then drop it elsewhere \u2014 each rung <strong>steps a ball across</strong> to the next lane, so you redirect the falls. On <strong>Hard</strong>, a rung lets its <strong>own colour</strong> pass straight through.',
        lcHelp3Html: 'You have a few movable <strong>rungs</strong>. After you move one it <strong>recharges</strong> briefly before it can move again \u2014 so you plan across all of them.',
        lcHelp4Html: 'Faint <strong>grey bars</strong> are fixed walls that block <strong>every</strong> colour and can\u2019t be moved \u2014 route around them.',
        lcHelp5Html: 'A ball marked <strong>+</strong> is a faster <strong>heal</strong> ball \u2014 land it in its colour to <strong>regain a life</strong>; missing it is harmless.',
        lcHelp6Html: 'Over time it gets <strong>busier and a little faster</strong>. <kbd>P</kbd> pause \u00b7 <kbd>R</kbd> restart \u00b7 <kbd>M</kbd> mute.',
    });

    Object.assign(AC.i18n.STRINGS.zh, {
        lcEasy: '簡單',
        lcNormal: '普通',
        lcHard: '困難',
        lcReady: '準備開始',
        lcIntro: '移動橋，把每顆落下的球導進同色的籃子。每座橋會把碰到的球帶往隔壁線。',
        lcStartHintHtml: '按住橋拖到別處放下 · <kbd>P</kbd> 暫停',
        lcOverMsgHtml: (score) => `你得了 <strong>${score}</strong> 分。`,
        lcOverHintHtml: '按 <kbd>R</kbd> 或按鈕再玩一次。',
        lcHelp1Html: '彩色球沿著<strong>直線</strong>往下掉。把每顆導進<strong>同色</strong>的籃子；進錯籃子會扣一條<strong>命</strong>。',
        lcHelp2Html: '按住<strong>橋</strong>、放到別處——每座橋會把球<strong>帶往隔壁線</strong>，用它改變球的落點。<strong>困難</strong>模式的橋會讓<strong>同色</strong>球直接穿過。',
        lcHelp3Html: '你有數座可移動的<strong>橋</strong>。移動後會短暫<strong>充能</strong>，充滿才能再動——所以要分配著用。',
        lcHelp4Html: '幾道淡<strong>灰色橫桿</strong>是固定的牆，會擋下<strong>所有</strong>顏色、且不能移動——請繞過它們。',
        lcHelp5Html: '帶 <strong>+</strong> 的是較快的<strong>回血球</strong>——導進它的同色籃子可<strong>回一滴血</strong>；沒接到也不會扣血。',
        lcHelp6Html: '隨時間會<strong>越來越忙、也略快</strong>。<kbd>P</kbd> 暫停 \u00b7 <kbd>R</kbd> 重新開始 \u00b7 <kbd>M</kbd> 靜音。',
    });

    // =================================================================
    // CONFIG — shared tuning
    // =================================================================

    const CONFIG = {
        ballRadius: 15,
        basketGapRatio: 2.5,     // basket width : gap — kept constant across lane counts
        xEase: 30,               // how fast a ball slides across to its lane (high = hugs the rung)
        waveMinGap: 0.3,         // never spawn two waves closer than this (seconds)
        laneClearY: 36,          // don't spawn into a lane whose top ball is still above this
        rungGrabY: 16,           // vertical pick-up tolerance for a rung (px)
        rungDeadzone: 8,         // min pointer travel in CSS px before a grab counts as a move
                                 // (anti-jitter; measured in screen px so it's resolution-independent)
        rungMinSep: 18,          // min vertical gap between rungs that share a lane (px)
        countdownSec: 3,         // "get ready" countdown before a run starts
        rungCooldown: 4.2,       // sec a just-moved rung stays locked at t=0 (shrinks as the wave rate climbs)
        healEveryWaves: 12,      // ~one EXTRA heal ball per this many waves (its rate tracks waveRate)
        healSpeedMul: 1.5,       // heal balls fall this × the current normal speed (fixed ratio)
        scorePerCorrect: 1,      // one point per ball delivered — keeps the number compact
        scoreCap: 999999,        // hard ceiling so the HUD value never exceeds six digits
    };

    // Difficulty presets — each has ONE fixed layout (lanes = colours, fixed
    // colours in fixed order). A spawn is
    // one ball, or two (with probability `twoBall`) — each ball independently
    // picks a free lane, so a pair may land on the same lane by chance (always
    // different colours, never an unavoidable loss). There is one movable
    // colour-locked rung per colour,
    // plus `fixedRungs` immovable obstacle rungs that block EVERY colour.
    // `freq` (wave rate, waves/sec) and `speed` (fall speed, px/s) are each
    // base + k·ln(1 + t/tau): base = start value · k = steepness · tau = drift.
    // Simpler layouts run busier, so easy has the highest freq & speed.
    const DIFFICULTIES = {
        easy: {
            lanes: 3, colors: 3, lives: 4, fixedRungs: 2,
            twoBall: 0.00,
            colorRungs: false,   // plain rungs: step EVERY ball (no colour pass)
            freq:  { base: 0.20, k: 0.80, tau: 2000 },
            speed: { base: 40, k: 80, tau: 2000 },
        },
        normal: {
            lanes: 4, colors: 4, lives: 4, fixedRungs: 3,
            twoBall: 0.00,
            colorRungs: false,   // plain rungs: step EVERY ball (no colour pass)
            freq:  { base: 0.20, k: 0.70, tau: 2000 },
            speed: { base: 36, k: 54, tau: 2000 },
        },
        hard: {
            lanes: 4, colors: 4, lives: 4, fixedRungs: 3,
            twoBall: 0.33,
            colorRungs: true,    // colour rungs: a rung lets its own colour pass through
            freq:  { base: 0.16, k: 0.50, tau: 2000 },
            speed: { base: 32, k: 48, tau: 2000 },
        },
    };
    // Fixed colours AND order per colour count — baskets always use these exact
    // colours in this exact left-to-right order (no shuffle), so the board is
    // consistent and learnable.
    const COLOR_SETS = {
        2: ['#ff5d6c', '#4aa3ff'],                                   // red, blue
        3: ['#ff5d6c', '#ffd23a', '#4aa3ff'],                        // red, yellow, blue
        4: ['#ff5d6c', '#ffd23a', '#3fcf6b', '#4aa3ff'],             // red, yellow, green, blue
        5: ['#ff5d6c', '#ff8a2e', '#ffd23a', '#3fcf6b', '#4aa3ff'],  // red, orange, yellow, green, blue
        6: ['#ff5d6c', '#ff8a2e', '#ffe23a', '#3fcf6b', '#4aa3ff', '#b57bff'],
        7: ['#ff5d6c', '#ff8a2e', '#ffe23a', '#3fcf6b', '#22c5c9', '#4aa3ff', '#b57bff'],
    };

    // =================================================================
    // Geometry (fixed logical space; lane count varies per run)
    // =================================================================

    const W = 600, H = 760;
    const TOP_SPAWN_Y = -30;        // off-screen: balls slide in from above the top edge
    const POINT_TOP = 140;
    const POINT_BOTTOM = 584;
    const RUNG_TOP = 112;           // placeable-rung band extends a bit above POINT_TOP
    const RUNG_BOTTOM = 584;        // … down to here
    const DELIVER_Y = 648;
    const LANE_TOP = 0;             // lanes run from the very top of the play area
    const BASKET_TOP = 656;
    const BASKET_BOTTOM = 742;

    let LANE_X = [], LANE_SP = 0, BASKET_W = 0;
    // The width splits as gap / basket / gap / basket / … / gap, keeping the
    // basket-width : gap ratio the SAME for every lane count (more lanes just
    // scale everything down). Lanes sit on the basket centres.
    function computeLayout(lanes) {
        const R = CONFIG.basketGapRatio;
        const gap = W / (lanes * R + lanes + 1);         // N baskets (= R·gap) + (N+1) gaps = W
        BASKET_W = R * gap;
        LANE_SP = gap + BASKET_W;
        LANE_X = Array.from({ length: lanes }, (_, i) => gap + BASKET_W / 2 + i * LANE_SP);
    }

    // =================================================================
    // DOM + canvas
    // =================================================================

    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const dom = {
        score: document.getElementById('score'),
        lives: document.getElementById('lives'),
        diffSeg: document.getElementById('difficulty-seg'),
    };
    const livesStat = dom.lives.closest('.hud-stat');

    function fitCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // =================================================================
    // State
    // =================================================================

    const G = {
        difficulty: 'easy',
        diffCfg: null,
        lanes: 3, colors: 3,
        score: 0, lives: 0, maxLives: 5, elapsed: 0,
        balls: [], floaters: [],
        rungs: [],           // fixed set of { gap, y } — moved freely, never added/removed
        basketColor: [],
        spawnAcc: 0,         // wave accumulator
        lastWaveT: 0,        // min-gap guard
        healAcc: 0,          // heal-ball accumulator (independent of waves)
        countdown: 0,        // "get ready" timer at the start of a run
        shake: 0,
        ended: false,
        rng: AC.rng.make(1),
    };

    let shell = null;
    let seedCounter = (Date.now() >>> 0);
    let staged = 'easy';   // difficulty picked in the toolbar; applied on next run (Puzzle-style)

    // =================================================================
    // Difficulty ramp — unbounded, decelerating log curve (never plateaus)
    // =================================================================

    // Wave spawn rate (waves/sec): base + k·ln(1 + t/tau). It rises forever but
    // ever more gently (so late-game stays fair and great players last long);
    // `tau` drifts the start onto the flatter part so the opening isn't steep.
    function waveRate() {
        const f = G.diffCfg.freq;
        return f.base + f.k * Math.log(1 + G.elapsed / f.tau);
    }
    // Fall speed (px/s), same log shape as waveRate; per-difficulty.
    function ballSpeed() {
        const s = G.diffCfg.speed;
        return s.base + s.k * Math.log(1 + G.elapsed / s.tau);
    }
    // How long a just-moved rung stays locked — inversely proportional to the
    // current WAVE RATE, so it's ~rungCooldown at the start and shrinks as the
    // game gets busier (keeps "rung-moves per wave" roughly constant, so the
    // late game never outruns the cooldown).
    function cooldownDuration() {
        return CONFIG.rungCooldown * G.diffCfg.freq.base / waveRate();
    }
    // =================================================================
    // Rungs (fixed set — moved, never added or removed)
    // =================================================================

    // Rungs are placed freely (continuous y). Two rungs that share a lane
    // (same gap, or adjacent gaps) must stay `rungMinSep` apart in height.
    // Given a desired drop, return the nearest free y (dodging conflicts), or
    // null if this gap column has no room. `exceptIdx` is the rung being moved.
    function resolveDropY(gap, desiredY, exceptIdx) {
        const SEP = CONFIG.rungMinSep;
        const yMin = RUNG_TOP, yMax = RUNG_BOTTOM;
        const want = AC.math.clamp(desiredY, yMin, yMax);
        const obs = [];
        for (let i = 0; i < G.rungs.length; i++) {
            if (i === exceptIdx) continue;
            if (Math.abs(G.rungs[i].gap - gap) <= 1) obs.push(G.rungs[i].y);
        }
        const blocked = (yy) => obs.some((o) => Math.abs(yy - o) < SEP - 0.01);
        if (!blocked(want)) return want;
        // The nearest free y is at an obstacle boundary (o ± SEP) or a bound.
        const cands = [yMin, yMax];
        for (const o of obs) { cands.push(o - SEP, o + SEP); }
        let best = null, bestD = Infinity;
        for (let c of cands) {
            c = AC.math.clamp(c, yMin, yMax);
            if (blocked(c)) continue;
            const d = Math.abs(c - want);
            if (d < bestD) { bestD = d; best = c; }
        }
        return best;   // null if the column is too full to fit
    }

    // Lay out the fixed set: ONE colour-locked rung per colour (so every colour
    // is always steerable). Each drops at a random continuous height in the
    // legal band, nudged to a clear spot (resolveDropY) so none conflict.
    function initRungs() {
        G.rungs = [];
        const palette = (COLOR_SETS[G.colors] || COLOR_SETS[4]).slice();
        const anyY = () => AC.rng.float(G.rng, RUNG_TOP, RUNG_BOTTOM);
        const randGap = () => AC.rng.int(G.rng, 0, G.lanes - 1);
        if (G.diffCfg.colorRungs) {
            // Colour rungs (Hard): one per colour — each lets its own colour pass.
            for (const color of palette) placeRungSpread(randGap(), anyY, { color });
        } else {
            // Plain rungs (Easy/Normal): colour-agnostic, they step EVERY ball.
            for (let i = 0; i < G.colors; i++) placeRungSpread(randGap(), anyY, { color: RUNG_PLAIN });
        }
        // Immovable obstacle rungs: block EVERY colour, can't be picked up.
        // Upper-biased centre (~26%), one per gap where possible.
        const nFixed = G.diffCfg.fixedRungs || 0;
        const gaps = AC.rng.shuffle(Array.from({ length: G.lanes - 1 }, (_, i) => i), G.rng);
        const upperY = () => {
            const bell = (G.rng() + G.rng() + G.rng()) / 3;                 // ~bell around 0.5
            const frac = AC.math.clamp(0.30 + (bell - 0.5) * 0.5, 0.02, 0.98);
            return RUNG_TOP + frac * (RUNG_BOTTOM - RUNG_TOP);
        };
        for (let i = 0; i < nFixed; i++) placeRungSpread(gaps[i % gaps.length], upperY, { fixed: true });
    }

    // Place one rung in `gap`, biased by sampleY() but with a soft REPULSION:
    // try several candidates and keep the valid one FARTHEST from any rung that
    // shares a lane, so rungs don't clump (leaves room to slot a rung between
    // them) and the opening layout looks evenly scattered. Falls back to a
    // deterministic scan if the gap has no room.
    function placeRungSpread(gap, sampleY, extra) {
        let best = null, bestScore = -1;
        for (let c = 0; c < 10; c++) {
            const y = resolveDropY(gap, sampleY(), -1);
            if (y == null) continue;
            let near = Infinity;
            for (const rg of G.rungs) if (Math.abs(rg.gap - gap) <= 1) near = Math.min(near, Math.abs(rg.y - y));
            if (near > bestScore) { bestScore = near; best = y; }
        }
        if (best == null) {   // fallback: any free slot in any gap
            for (let g = 0; g < G.lanes - 1 && best == null; g++) {
                for (let yy = RUNG_TOP; yy <= RUNG_BOTTOM && best == null; yy += CONFIG.rungMinSep) {
                    const y = resolveDropY(g, yy, -1);
                    if (y != null) { gap = g; best = y; }
                }
            }
        }
        if (best != null) G.rungs.push(Object.assign({ gap, y: best }, extra));
        return best != null;
    }

    // =================================================================
    // Baskets + colours
    // =================================================================

    function makeBaskets(lanes, colorsCount) {
        // Fixed colours in fixed order (no shuffle) — the layout is always the
        // same, so players can learn where each colour's basket is.
        const set = (COLOR_SETS[colorsCount] || COLOR_SETS[4]);
        return Array.from({ length: lanes }, (_, i) => set[i % set.length]);
    }

    // =================================================================
    // Balls — steady waves of one or two (fall speed rises over time)
    // =================================================================

    // A lane is "blocked" for spawning while it still has a ball near the top,
    // so fresh balls never pop in on top of one another.
    function laneBlockedAtTop(lane) {
        for (const b of G.balls) {
            if (b.lane === lane && b.y < CONFIG.laneClearY) return true;
        }
        return false;
    }

    // Create one ball in `lane` at height `y`. Its colour is both its
    // destination (the same-colour basket) and the colour of rung that can
    // steer it. `used` (colours already placed this wave) biases toward a
    // DIFFERENT colour, so a two-ball wave needs two different rungs at once.
    function createBall(lane, y, used, heal) {
        let pool = G.basketColor.filter((c) => !used || !used.has(c));
        if (!pool.length) pool = G.basketColor.slice();
        const color = AC.rng.one(G.rng, pool);
        if (used) used.add(color);
        G.balls.push({ x: LANE_X[lane], y, lane, color, heal: !!heal, delivered: false });
    }

    // Heal balls spawn on their OWN timeline — an EXTRA ball, not part of a wave
    // and not aligned to wave instants. False if no lane is free.
    function spawnHeal() {
        const free = [];
        for (let i = 0; i < G.lanes; i++) if (!laneBlockedAtTop(i)) free.push(i);
        if (!free.length) return false;
        createBall(AC.rng.one(G.rng, free), TOP_SPAWN_Y, null, true);
        return true;
    }

    // One spawn event: a single ball, or two (on distinct free lanes) with the
    // preset's `twoBall` probability. Returns false if no lane is free.
    function spawnWave(y0) {
        const y = (y0 == null) ? TOP_SPAWN_Y : y0;
        const free = [];
        for (let i = 0; i < G.lanes; i++) if (!laneBlockedAtTop(i)) free.push(i);
        if (!free.length) return false;
        const two = G.diffCfg.twoBall > 0 && G.rng() < G.diffCfg.twoBall;
        const used = new Set();
        // Each ball independently picks a free lane, so a two-ball wave may land
        // both on the same lane by chance (always different colours — a stacked
        // pair is never an unavoidable loss).
        createBall(AC.rng.one(G.rng, free), y, used);
        if (two) createBall(AC.rng.one(G.rng, free), y, used);
        return true;
    }

    // Opening wave at the top of the ladder (visible on the frozen ready
    // screen) — just a normal wave, so it follows the preset's `twoBall` odds.
    function seedOpeningBalls() {
        spawnWave(POINT_TOP - CONFIG.ballRadius * 4);
    }

    function deliver(b) {
        const lane = b.lane;
        const base = G.basketColor[lane];
        const ok = (base === b.color);
        if (ok) {
            G.score = Math.min(G.score + CONFIG.scorePerCorrect, CONFIG.scoreCap);
            flashScore();
            if (b.heal && G.lives < G.maxLives) {       // heal ball → regain a life
                G.lives++;
                spawnFloater(LANE_X[lane], DELIVER_Y - 12, '+1\u2665', '#7fe08a');
                AC.audio.play('levelup');
            } else {
                spawnFloater(LANE_X[lane], DELIVER_Y - 12, '+' + AC.format.score(CONFIG.scorePerCorrect),
                    b.heal ? '#7fe08a' : b.color);
                AC.audio.play('coin');
            }
        } else if (b.heal) {
            // Missed heal ball — harmless, no life lost.
        } else {
            G.lives--;
            G.shake = Math.max(G.shake, 0.45);
            spawnFloater(LANE_X[lane], DELIVER_Y - 12, '\u2715', '#ff5470');
            AC.audio.play('rock');
            if (G.lives <= 0) { endRun(); return; }
        }
    }

    function endRun() {
        if (G.ended) return;
        G.ended = true;
        shell.gameOver({ score: G.score, win: false, meta: { seconds: G.elapsed } });
    }

    // =================================================================
    // Update
    // =================================================================

    function update(dt) {
        if (G.ended) return;
        // Freeze the opening scene during the "get ready" countdown.
        if (G.countdown > 0) { G.countdown = Math.max(0, G.countdown - dt); return; }
        G.elapsed += dt;
        if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);
        updateFloaters(dt);

        // Spawn scheduling: a single, steady wave accumulator — the rate ramps
        // up over time but the rhythm stays even (no jitter).
        G.spawnAcc += dt * waveRate();
        if (G.spawnAcc >= 1 && (G.elapsed - G.lastWaveT) >= CONFIG.waveMinGap) {
            if (spawnWave()) { G.spawnAcc = 0; G.lastWaveT = G.elapsed; }
        }
        if (G.spawnAcc > 1.5) G.spawnAcc = 1.5;   // avoid runaway while lanes stay blocked

        // Heal balls: EXTRA, on their own clock; the rate tracks waveRate so
        // there's ~one per CONFIG.healEveryWaves waves (not tied to wave timing).
        G.healAcc += dt * waveRate() / CONFIG.healEveryWaves;
        if (G.healAcc >= 1) { if (spawnHeal()) G.healAcc -= 1; }
        if (G.healAcc > 1.5) G.healAcc = 1.5;

        const v = ballSpeed();
        for (const b of G.balls) {
            // Advance, crossing any adjacent rungs in height order (rungs can be
            // at staggered heights, so step through them one at a time).
            const yEnd = b.y + v * (b.heal ? CONFIG.healSpeedMul : 1) * dt;
            let guard = 0;
            while (guard++ < 16) {
                let best = -1, bestH = Infinity;
                for (let i = 0; i < G.rungs.length; i++) {
                    const rg = G.rungs[i];
                    if (!rg.fixed && rg.color === b.color) continue;   // own colour passes gate rungs; fixed walls block all
                    if (rg.gap !== b.lane && rg.gap !== b.lane - 1) continue;
                    const h = rg.y;
                    if (h > b.y && h <= yEnd && h < bestH) { bestH = h; best = i; }
                }
                if (best < 0) break;
                b.y = bestH;
                if (G.rungs[best].gap === b.lane) b.lane++; else b.lane--;
            }
            b.y = yEnd;
            b.x += (LANE_X[b.lane] - b.x) * Math.min(1, dt * CONFIG.xEase);
            if (b.y >= DELIVER_Y) { deliver(b); b.delivered = true; }
            if (G.ended) break;
        }
        G.balls = G.balls.filter((b) => !b.delivered);
        updateHud();
    }

    // =================================================================
    // Floaters (+score popups)
    // =================================================================

    function spawnFloater(x, y, text, color) {
        G.floaters.push({ x, y, vy: -46, text, color: color || '#ffe08a', life: 1.0, maxLife: 1.0 });
    }
    function updateFloaters(dt) {
        const fs = G.floaters;
        for (let i = fs.length - 1; i >= 0; i--) {
            const f = fs[i];
            f.life -= dt;
            if (f.life <= 0) { fs.splice(i, 1); continue; }
            f.y += f.vy * dt;
            f.vy += 36 * dt;
        }
    }

    // =================================================================
    // HUD + difficulty selector
    // =================================================================

    function flashScore() {
        dom.score.classList.remove('flash');
        void dom.score.offsetWidth;
        dom.score.classList.add('flash');
    }
    function updateHud() {
        dom.score.textContent = AC.format.score(G.score);
        renderLives();
        livesStat.classList.toggle('danger', G.lives <= 1);
    }
    // Lives as pips (easier to read at a glance than a number).
    function renderLives() {
        const max = G.maxLives || 5, cur = Math.max(0, G.lives);
        let html = '';
        for (let i = 0; i < max; i++) html += '<i class="life-pip' + (i < cur ? '' : ' lost') + '"></i>';
        dom.lives.innerHTML = html;
    }
    function syncDiffButtons() {
        if (!dom.diffSeg) return;
        for (const b of dom.diffSeg.querySelectorAll('button[data-diff]')) {
            const d = b.dataset.diff;
            // active = staged selection; committed = what the current run uses
            // (tinted only when it differs from the staged pick).
            b.classList.toggle('active', d === staged);
            b.classList.toggle('committed', d === G.difficulty && G.difficulty !== staged);
            b.setAttribute('aria-checked', d === staged ? 'true' : 'false');
        }
    }
    // Picking a difficulty only *stages* it; it applies on the next run
    // (Restart, or Start / Play again from the overlay) — like Puzzle Games.
    function setDifficulty(d) {
        if (!DIFFICULTIES[d] || d === staged) return;
        staged = d;
        AC.prefs.set('ladder-connect', { difficulty: d });
        if (shell && shell.state === 'idle') {
            // On the ready screen, apply immediately so the frozen preview
            // (and the scene Start will play) matches the chosen difficulty.
            resetRun();
            render();
        } else {
            syncDiffButtons();   // staged; applied on the next restart
        }
    }

    // =================================================================
    // Rendering
    // =================================================================

    function render() {
        const t = performance.now() / 1000;
        ctx.save();
        if (G.shake > 0) {
            const s = G.shake * 9;
            ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
        }
        drawBackground();
        drawLanes();
        drawRungs();
        drawDragGhost();
        drawBaskets();
        drawBalls();
        drawFloaters();
        ctx.restore();
        if (G.countdown > 0) drawCountdown();
        if (DEBUG) drawDebugOverlay(); // [DEBUG-HOOK]
    }

    function drawBackground() {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#15122a');
        g.addColorStop(1, '#0c0a1a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    // Lanes: a faint full-height rail the balls ride, with a brighter segment
    // marking the band where rungs can be placed (capped top and bottom).
    function drawLanes() {
        for (let i = 0; i < G.lanes; i++) {
            const x = LANE_X[i];
            ctx.strokeStyle = 'rgba(255,255,255,0.07)';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(x, LANE_TOP); ctx.lineTo(x, DELIVER_Y); ctx.stroke();

            ctx.strokeStyle = 'rgba(255,255,255,0.16)';
            ctx.beginPath(); ctx.moveTo(x, RUNG_TOP); ctx.lineTo(x, RUNG_BOTTOM); ctx.stroke();

            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x - 5, RUNG_TOP); ctx.lineTo(x + 5, RUNG_TOP); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x - 5, RUNG_BOTTOM); ctx.lineTo(x + 5, RUNG_BOTTOM); ctx.stroke();
        }
    }

    const RUNG_COLOR = '#aab0bd';   // neutral grey — the bar deflects other colours
    const RUNG_PLAIN = '#cfd6e6';   // plain-rung end-ring (Easy/Normal: no colour passes)
    const HOLE_FILL = '#0d0b1d';    // punched-hole colour (≈ background)
    // A rung is a neutral bar (deflects every other colour) with a coloured
    // "gate" ring at each end — the one colour that slips straight through.
    function drawRung(gap, y, opts) {
        opts = opts || {};
        const x0 = LANE_X[gap], x1 = LANE_X[gap + 1];
        ctx.save();
        ctx.globalAlpha = opts.alpha != null ? opts.alpha : 1;
        ctx.lineCap = 'round';
        if (opts.fixed) {
            // Fixed wall — a thin, muted cross-beam that reads as part of the
            // ladder (route around it); deliberately low-key vs the colour gates.
            ctx.strokeStyle = 'rgba(214,220,232,0.30)';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
            ctx.fillStyle = 'rgba(214,220,232,0.38)';
            for (const gx of [x0, x1]) { ctx.beginPath(); ctx.arc(gx, y, 2.5, 0, PI2); ctx.fill(); }
            ctx.restore();
            return;
        }
        const gate = opts.color || RUNG_COLOR;
        const w = opts.width != null ? opts.width : 7;
        const ringR = opts.dotR != null ? opts.dotR : 7;
        const a = opts.alpha != null ? opts.alpha : 1;
        const cool = opts.cool != null ? opts.cool : 1;
        const cooling = cool < 1;

        // Neutral bar (dimmer while recharging, so it reads as "locked").
        ctx.globalAlpha = a * (cooling ? 0.5 : 1);
        if (opts.dash) ctx.setLineDash(opts.dash);
        ctx.strokeStyle = RUNG_COLOR;
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.setLineDash([]);

        if (ringR > 0) {
            ctx.lineWidth = Math.max(2.5, w * 0.55);
            for (const gx of [x0, x1]) {
                ctx.globalAlpha = a;
                ctx.fillStyle = HOLE_FILL;                       // punch a hole in the bar
                ctx.beginPath(); ctx.arc(gx, y, ringR, 0, PI2); ctx.fill();
                ctx.strokeStyle = gate;                          // ring colour = the colour that passes
                if (!cooling) {
                    ctx.beginPath(); ctx.arc(gx, y, ringR, 0, PI2); ctx.stroke();
                } else {
                    // Keep the COLOUR readable (a full, faint ring in its own
                    // colour) and show charge as a bright arc sweeping to full.
                    ctx.globalAlpha = a * 0.4;
                    ctx.beginPath(); ctx.arc(gx, y, ringR, 0, PI2); ctx.stroke();
                    ctx.globalAlpha = a;
                    ctx.beginPath(); ctx.arc(gx, y, ringR, -Math.PI / 2, -Math.PI / 2 + PI2 * cool); ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

    function drawRungs() {
        for (let i = 0; i < G.rungs.length; i++) {
            const rg = G.rungs[i];
            if (rg.fixed) { drawRung(rg.gap, rg.y, { fixed: true }); continue; }
            // The rung being dragged stays put but dims; its ghost shows the target.
            const held = drag && drag.index === i;
            const cooling = rg.readyAt && G.elapsed < rg.readyAt;
            const cool = cooling ? 1 - (rg.readyAt - G.elapsed) / rg.coolDur : 1;  // 0→1 as it recharges
            drawRung(rg.gap, rg.y, { color: rg.color, cool, alpha: held ? 0.3 : 1 });
        }
    }

    // Faint, thin, finely-dashed preview of where the held rung would land —
    // kept clearly "lighter" than real rungs. It auto-dodges conflicts; if the
    // column has no room it shows red at the clamped desired spot.
    function drawDragGhost() {
        if (!drag || drag.index == null || !drag.moved) return;
        const ok = drag.resolvedY != null;
        const y = ok ? drag.resolvedY : AC.math.clamp(drag.desiredY, RUNG_TOP, RUNG_BOTTOM);
        const held = G.rungs[drag.index];
        const color = ok ? ((held && held.color) || '#dfe8ff') : '#ff6b81';
        drawRung(drag.gap, y, { color, alpha: 0.55, width: 4, dotR: 2.5, dash: [3, 9] });
    }

    function drawBaskets() {
        const w = BASKET_W, h = BASKET_BOTTOM - BASKET_TOP;
        for (let i = 0; i < G.lanes; i++) {
            const x = LANE_X[i], col = G.basketColor[i];
            roundRect(x - w / 2, BASKET_TOP, w, h, 9);
            ctx.fillStyle = col;
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.fillRect(x - w / 2, BASKET_TOP, w, 7);
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth = 2;
            roundRect(x - w / 2, BASKET_TOP, w, h, 9);
            ctx.stroke();
        }
    }

    function drawBall(b, dx) {
        const r = CONFIG.ballRadius;
        const cx = b.x + (dx || 0);
        if (b.heal) {   // motion trail — signals it's a fast ball
            ctx.fillStyle = b.color;
            for (let k = 1; k <= 2; k++) {
                ctx.globalAlpha = 0.28 / k;
                ctx.beginPath(); ctx.arc(cx, b.y - k * r * 0.95, r * (1 - k * 0.12), 0, PI2); ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
        ctx.save();
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(cx, b.y, r, 0, PI2); ctx.fillStyle = b.color; ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(cx - r * 0.32, b.y - r * 0.32, r * 0.3, 0, PI2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, b.y, r, 0, PI2);
        ctx.stroke();
        if (b.heal) {   // white "+" — signals a heal pickup
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.lineWidth = 3; ctx.lineCap = 'round';
            const s = r * 0.5;
            ctx.beginPath();
            ctx.moveTo(cx - s, b.y); ctx.lineTo(cx + s, b.y);
            ctx.moveTo(cx, b.y - s); ctx.lineTo(cx, b.y + s);
            ctx.stroke();
        }
    }
    // Balls that share a lane and overlap vertically are spread side by side so
    // they stay readable (colour-locked rungs let balls pass through and meet).
    function drawBalls() {
        const byLane = new Map();
        for (const b of G.balls) {
            if (!byLane.has(b.lane)) byLane.set(b.lane, []);
            byLane.get(b.lane).push(b);
        }
        for (const list of byLane.values()) {
            list.sort((a, b) => a.y - b.y);
            let i = 0;
            while (i < list.length) {
                let j = i;
                while (j + 1 < list.length && list[j + 1].y - list[j].y < CONFIG.ballRadius * 2) j++;
                const n = j - i + 1;
                for (let k = 0; k < n; k++) list[i + k]._dx = (k - (n - 1) / 2) * (CONFIG.ballRadius * 1.3);
                i = j + 1;
            }
        }
        for (const b of G.balls) drawBall(b, b._dx || 0);
    }

    function drawFloaters() {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `800 22px ${getFont()}`;
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        for (const f of G.floaters) {
            ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
            ctx.strokeStyle = 'rgba(10,8,20,0.85)';
            ctx.strokeText(f.text, f.x, f.y);
            ctx.fillStyle = f.color;
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
    }

    // "Get ready" 3-2-1 overlay shown while the opening scene is frozen.
    function drawCountdown() {
        const n = Math.max(1, Math.ceil(G.countdown));
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#eaf0ff';
        ctx.font = `800 120px ${getFont()}`;
        ctx.fillText(String(n), W / 2, H / 2);
        ctx.restore();
    }

    let fontCache = null;
    function getFont() {
        if (!fontCache) {
            fontCache = getComputedStyle(document.body).getPropertyValue('--font-display')
                || '"Segoe UI", system-ui, sans-serif';
        }
        return fontCache;
    }
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
    // Input — pick up a rung, drop it in a new slot
    // =================================================================

    let drag = null;   // { index, gap, desiredY, resolvedY } while a rung is held

    function toLogical(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width * W,
            y: (e.clientY - rect.top) / rect.height * H,
        };
    }
    // Index of the rung under the pointer (topmost first), or -1.
    function rungIndexAt(x, y) {
        for (let i = G.rungs.length - 1; i >= 0; i--) {
            const rg = G.rungs[i];
            if (rg.fixed) continue;                       // obstacle rungs can't be picked up
            if (rg.readyAt && G.elapsed < rg.readyAt) continue;   // still cooling down
            if (Math.abs(y - rg.y) > CONFIG.rungGrabY) continue;
            if (x >= LANE_X[rg.gap] - 10 && x <= LANE_X[rg.gap + 1] + 10) return i;
        }
        return -1;
    }
    // Gap (pair of lanes) nearest a horizontal position.
    function nearestGap(x) {
        return AC.math.clamp(Math.round((x - LANE_X[0] - LANE_SP / 2) / LANE_SP), 0, G.lanes - 2);
    }

    function onPointerDown(e) {
        if (!shell.isPlaying()) return;
        e.preventDefault();
        const p = toLogical(e);
        const idx = rungIndexAt(p.x, p.y);
        if (idx < 0) { drag = null; return; }   // only rungs are grabbable
        const rg = G.rungs[idx];
        drag = {
            index: idx, gap: rg.gap, desiredY: rg.y, resolvedY: rg.y,
            sx: e.clientX, sy: e.clientY, moved: false,   // grab point in screen px
        };
    }
    function onPointerMove(e) {
        if (!drag) return;
        const p = toLogical(e);
        // Measure travel in screen (CSS) px so the dead-zone is the same real
        // distance at any canvas size / resolution.
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > CONFIG.rungDeadzone) {
            drag.moved = true;        // a real drag began — tiny jitter never gets here
            AC.audio.play('grab');
        }
        drag.gap = nearestGap(p.x);
        drag.desiredY = AC.math.clamp(p.y, RUNG_TOP, RUNG_BOTTOM);
        drag.resolvedY = resolveDropY(drag.gap, drag.desiredY, drag.index);
    }
    function onPointerUp() {
        if (!drag) return;
        // Only a real drag (past the jitter dead-zone) repositions; a tap or
        // tiny wobble leaves the rung — and its cooldown — untouched.
        if (drag.moved && drag.resolvedY != null) {
            const rg = G.rungs[drag.index];
            if (rg.gap !== drag.gap || rg.y !== drag.resolvedY) {
                rg.gap = drag.gap; rg.y = drag.resolvedY;
                rg.coolDur = cooldownDuration();          // lock it briefly (recharge)
                rg.readyAt = G.elapsed + rg.coolDur;
                AC.audio.play('click');
            }
        }
        drag = null;
    }

    // =================================================================
    // Overlay
    // =================================================================

    function overlayContent(state, result) {
        if (state === 'idle') {
            return {
                badge: 'ladder',
                title: AC.i18n.t('lcReady'),
                message: AC.i18n.t('lcIntro'),
                button: AC.i18n.t('play'),
                hint: AC.i18n.t('lcStartHintHtml'),
            };
        }
        if (state === 'over') {
            const score = AC.format.score(result ? result.score : G.score);
            let msg = AC.i18n.t('lcOverMsgHtml', score);
            if (result && result.isNewBest) msg += ` <strong>${AC.i18n.t('newBest')}</strong>`;
            return {
                badge: 'trophy',
                title: AC.i18n.t('gameOver'),
                message: msg,
                button: AC.i18n.t('restart'),
                hint: AC.i18n.t('lcOverHintHtml'),
            };
        }
        return {};
    }

    // =================================================================
    // Reset + init
    // =================================================================

    function resetRun() {
        G.rng = AC.rng.make(seedCounter++);
        G.difficulty = staged;        // commit the staged difficulty for this run
        G.diffCfg = DIFFICULTIES[G.difficulty];
        G.lanes = G.diffCfg.lanes;
        G.colors = G.diffCfg.colors;
        G.lives = G.maxLives = G.diffCfg.lives;

        computeLayout(G.lanes);
        G.basketColor = makeBaskets(G.lanes, G.colors);
        initRungs();
        G.balls = [];
        G.floaters.length = 0;
        G.score = 0;
        G.elapsed = START_T;   // [DEBUG-HOOK] ?t=<sec> jumps the difficulty clock
        G.shake = 0;
        G.ended = false;
        drag = null;
        G.spawnAcc = 0;
        G.healAcc = 0;
        G.lastWaveT = START_T;
        // Opening ball(s) at the top of the ladder, frozen on the ready screen.
        seedOpeningBalls();
        updateHud();
        if (shell) shell.refreshBest();  // Best now reflects the committed difficulty
        syncDiffButtons();               // committed == staged again
    }

    function init() {
        // Difficulty from prefs (default easy).
        const pref = AC.prefs.get('ladder-connect');
        staged = DIFFICULTIES[pref.difficulty] ? pref.difficulty : 'easy';
        G.difficulty = staged;

        fitCanvas();
        window.addEventListener('resize', () => { fitCanvas(); render(); });

        shell = AC.shell.create({
            gameId: 'ladder-connect',
            mode: () => G.difficulty,   // high scores are per-difficulty
            scoreEpoch: 20261009,       // bump this (e.g. to today's date) to reset everyone's bests once
            step: 1 / 60,
            preventKeys: ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
            update,
            render,
            reset: resetRun,
            onStart: () => { G.countdown = CONFIG.countdownSec; },   // brief "get ready" before play
            overlayContent,
            restartToReady: true,   // Restart returns to the ready screen
        });

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', () => { drag = null; });

        if (dom.diffSeg) {
            dom.diffSeg.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-diff]');
                if (btn) { AC.audio.unlock(); setDifficulty(btn.dataset.diff); }
            });
        }

        AC.i18n.subscribe(() => { updateHud(); });

        if (DEBUG) setupDebug(); // [DEBUG-HOOK]

        syncDiffButtons();
        resetRun();
        render();
    }

    // =================================================================
    // [DEBUG-HOOK] window.LC console API + overlay + keys (?debug=1 only)
    // =================================================================

    function drawDebugOverlay() {
        const lines = [
            'DEBUG  [' + G.difficulty + ']',
            't = ' + G.elapsed.toFixed(0) + 's',
            'layout = ' + G.lanes + 'x' + G.colors,
            'rate = ' + (waveRate() * 10).toFixed(1) + ' waves/10s',
            'speed = ' + ballSpeed().toFixed(1) + ' px/s',
            'twoBall = ' + (G.diffCfg.twoBall || 0),
            'balls = ' + G.balls.length,
        ];
        ctx.save();
        ctx.font = `600 13px ${getFont()}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        let w = 0;
        for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
        const bw = w + 14, bh = lines.length * 17 + 10;
        const bx = W - bw - 12, by = 12;
        ctx.fillStyle = 'rgba(10,8,20,0.72)';
        roundRect(bx, by, bw, bh, 8); ctx.fill();
        ctx.fillStyle = '#8fe36b';
        let y = by + 6;
        for (const l of lines) { ctx.fillText(l, bx + 7, y); y += 17; }
        ctx.restore();
    }

    function setupDebug() {
        window.LC = {
            setTime(sec) { G.elapsed = Math.max(0, sec || 0); return G.elapsed; },
            addTime(sec) { G.elapsed = Math.max(0, G.elapsed + (sec == null ? 30 : sec)); return G.elapsed; },
            addLife(n) { G.lives += (n == null ? 1 : n); updateHud(); return G.lives; },
            diff(d) { setDifficulty(d); return G.difficulty; },
            info() {
                return {
                    difficulty: G.difficulty, layout: G.lanes + 'x' + G.colors,
                    t: +G.elapsed.toFixed(1), score: G.score, lives: G.lives,
                    balls: G.balls.length, wavesPer10s: +(waveRate() * 10).toFixed(2),
                    speed: +ballSpeed().toFixed(1), twoBall: G.diffCfg.twoBall || 0,
                };
            },
        };
        shell.keyboard.onPress((k) => {
            if (k === ']') window.LC.addTime(30);
            else if (k === '[') window.LC.addTime(-30);
            else if (k === 'l' || k === 'L') window.LC.addLife(1);
        });
        console.log('%c[Colour Ladder] debug on', 'color:#5ad0e0;font-weight:700');
        console.log('LC.setTime(s) addTime(s) addLife(n) diff("easy"|"normal"|"hard") info()');
        console.log('keys:  ] +30s   [ -30s   L +life');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
