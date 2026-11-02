/* Darts — a throwing-mechanic prototype.
 *
 * The whole point of this first version is NOT a full 501 game: it exists to answer one
 * question — "does the mouse/touch gesture actually feel like throwing a dart?" So it is a
 * free, endless practice board: press, flick, release, watch it fly, throw again.
 *
 * The gesture is RELATIVE. The press point is the virtual hand origin (0,0,0); only the
 * subsequent motion matters, so an identical flick started anywhere on the screen throws
 * identically (this matters most for touch). While held we record {t, x, y} samples; at
 * release we take a smoothed, recency-weighted velocity over the final ~100 ms (NOT just
 * the last two samples) as the throw's release tangent.
 *
 * 3D game logic, 2D pseudo-perspective render. The virtual hand throws from below board
 * centre toward a board at +Z; TIME during the gesture is the forward (Z) progress, so a
 * faster flick implies a somewhat faster forward throw (compressed, not 1:1). Lateral and
 * vertical release motion become the dart's lateral/vertical velocity; after release the
 * dart is pure ballistics (gravity only). There is NO accuracy RNG — a bad flick misses
 * because the gesture physics say so, and the same gesture always lands in the same place.
 *
 * All feel lives in TUNING. Throw maths (analyseGesture / computeThrow / simulate / scoreAt)
 * are pure and rendering-free, so the physics can be retuned or replaced without touching
 * the draw code. A debug overlay (D) shows the gesture, release window, release vector and
 * trajectory so you can see WHY a dart went where it did.
 */
(function () {
    'use strict';

    var AC = window.ArcadeCommon;
    var t = AC.i18n.t;
    var clamp = AC.math.clamp;
    var PI2 = Math.PI * 2;

    // =================================================================
    // i18n (gameplay strings; launcher card strings live in launcher.js)
    // =================================================================

    Object.assign(AC.i18n.STRINGS.en, {
        dartsLast: 'Last',
        dartsTotal: 'Total',
        dartsDarts: 'Darts',
        dartsDebug: 'Debug',
        dartsReady: 'Darts \u00b7 practice',
        dartsIntro: 'Press and flick toward the board, then release to throw. The flick\u2019s direction and pace are the whole throw \u2014 no power meter, no crosshair. Find a flick you can repeat.',
        dartsStartHintHtml: 'Drag <strong>anywhere</strong> \u2014 the press point doesn\u2019t matter \u00b7 <kbd>D</kbd> debug',
        dartsHelp1Html: 'Press, <strong>flick toward the board</strong>, and release. You throw from below the bull, so a gentle flick <strong>up</strong> aims at the centre.',
        dartsHelp2Html: 'The <strong>release</strong> is what counts: pull sideways at the last moment and the dart drifts that way; flick a touch harder and it flies flatter and higher. The same flick always lands the same \u2014 <strong>no random spread</strong>.',
        dartsHelp3Html: 'Drag <strong>anywhere</strong> (the press point is ignored). <kbd>D</kbd> debug view \u00b7 <kbd>R</kbd> reset session \u00b7 <kbd>M</kbd> mute.',
        dartsMiss: 'Miss',
        dartsBull: 'Bull',
        dartsBullseye: 'Bullseye',
        dartsShort: 'Too soft — flick to throw',
        dartsThrowUp: 'Flick upward to throw',
        dartsFlickPrompt: 'Flick upward toward the board to throw',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        dartsLast: '上一鏢',
        dartsTotal: '累計',
        dartsDarts: '鏢數',
        dartsDebug: '除錯',
        dartsReady: '飛鏢 \u00b7 練習',
        dartsIntro: '按住並朝鏢靶輕甩，放開即擲出。甩的方向與快慢就是這一擲的全部——沒有力量條，也沒有準心。找到一個你能重複的甩法。',
        dartsStartHintHtml: '在<strong>任意處</strong>拖曳——起始點不影響結果 \u00b7 <kbd>D</kbd> 除錯',
        dartsHelp1Html: '按住、朝鏢靶<strong>輕甩</strong>、放開。出手點在紅心下方，所以向<strong>上</strong>輕甩就是瞄準中心。',
        dartsHelp2Html: '關鍵在<strong>放手的瞬間</strong>：最後一刻往側邊帶，鏢就往那偏；甩得稍重則飛得更平、落點更高。同樣的甩法永遠落在同一處——<strong>沒有隨機散佈</strong>。',
        dartsHelp3Html: '在<strong>任意處</strong>拖曳（起始點會被忽略）。<kbd>D</kbd> 除錯視圖 \u00b7 <kbd>R</kbd> 重設本局 \u00b7 <kbd>M</kbd> 靜音。',
        dartsMiss: '脫靶',
        dartsBull: '外紅心',
        dartsBullseye: '紅心',
        dartsShort: '太輕——用甩的',
        dartsThrowUp: '要往上甩才會射出',
        dartsFlickPrompt: '朝鏢靶往上輕甩即可擲出',
    });

    // =================================================================
    // TUNING — every feel knob lives here. Nothing below should hide a
    // magic number; tweak these after playtesting.
    // World units are millimetres; the board faces the player at +Z and
    // the hand throws from (0, handYOffset, 0) just below board centre.
    // =================================================================

    var TUNING = {
        // --- gesture sampling / release analysis ---
        smoothing: 0.35,          // EMA factor applied to the raw samples (0 = none, 1 = instant). Tames sensor noise.
        releaseWindowMs: 110,     // the final slice of the gesture used to estimate the release tangent (NOT just the last 2 samples)
        releaseRecencyBias: 2.0,  // >1 weights samples nearer the release moment more heavily within the window
        minGestureMs: 55,         // flicks shorter than this read as a tap → ignored (no throw)
        minReleaseSpeed: 150,     // logical px/s; a release slower than this is "too soft" → ignored
        maxReleaseSpeed: 3200,    // clamp absurd flings so one jerky sample can't launch a rocket
        minUpSpeed: 130,          // logical px/s; the release must be heading UP by at least this. A flat / downward flick is "throwing at the floor" → rejected, so only upward throws exist (and only they set the extremes).

        // --- gesture (logical px) → world velocity (mm/s) ---
        // Samples are normalised to the canvas' logical space (see fieldDelta), so the same
        // physical swipe throws the same on any screen size. These scales turn that gesture
        // velocity into the dart's lateral / vertical launch velocity.
        // EQUAL sensitivity on both axes: the same finger speed sideways or upward tilts the
        // throw by the same angle (aimScaleX === aimScaleY). These are scaled to ~75% of the
        // earlier pass to TIGHTEN the whole reachable area; with the loft weaker against
        // gravity the natural flick also sits a little below the bull, which reads lower
        // overall. Raise both together to widen the spread; use handYOffset to move the
        // centre up/down. Board scoring radius is 170 mm.
        aimScaleX: 1.57,          // world mm/s of launch velocity per logical px/s of release motion — lateral
        aimScaleY: 1.40,          // world mm/s of launch velocity per logical px/s of release motion — vertical (kept equal to X on purpose)

        // --- forward throw / tempo (the compressed "power") ---
        boardDistance: 2370,      // mm from the hand to the board plane along +Z
        baseForward: 12600,       // mm/s forward launch speed at tempo 1.0 (board reached in boardDistance/baseForward ≈ 0.24 s). Higher speed = flatter arc (drop ∝ 1/v²); the aimScales were scaled up by the same factor so the landing mapping is unchanged.
        refReleaseSpeed: 700,     // logical px/s release speed that maps to tempo 1.0
        tempoSensitivity: 0.15,   // how strongly flick speed shifts tempo. Low = compressed, so pace barely changes the flight time → aim stays predictable.
        tempoMin: 0.90,           // tempo floor  (≈ slow throw)
        tempoMax: 1.10,           // tempo ceiling (≈ fast throw)

        // --- ballistics after release (kept deliberately simple) ---
        gravity: 4900,            // mm/s² downward (artistic). The arc now comes mostly from the finite throw SPEED (baseForward): a faster dart drops less (drop ∝ 1/v²), which is the physically honest way to flatten the parabola, so leave gravity constant and flatten via baseForward instead.
        handYOffset: -292,        // mm; release height relative to board centre. Lower = the same flick lands lower. (Lowered to absorb the smaller drop once the throw got faster, so the aim centre stays where it was.)

        // --- determinism escape hatch (future). Keep 0 for a fully repeatable prototype. ---
        releaseNoise: 0,          // optional ± mm/s of white noise added to launch velocity. 0 = identical gesture → identical throw.

        // --- board geometry (standard dartboard, mm radii) ---
        boardRadiusMM: 170,       // outer edge of the scoring (double) ring
        rInnerBull: 6.35,         // 50
        rOuterBull: 15.9,         // 25
        rTripleInner: 99,
        rTripleOuter: 107,
        rDoubleInner: 162,
        rDoubleOuter: 170,

        // --- pseudo-3D camera / projection ---
        // viewFocal is the RELATIVE VIEW SIZE (a focal length, px): bigger = everything looks
        // larger (zoom in). On-screen scale at a world depth d is viewFocal / d, so:
        //   • board / numbers / dart TIP (end) live at the board plane → size ∝ viewFocal/(boardDistance+camBack): BOTH distance and view size shrink/grow them.
        //   • dart START (the hand, at the camera's own distance camBack) → size ∝ viewFocal/camBack: only the view size, never the board distance.
        // So moving the board farther now genuinely makes it look smaller. (~4050 keeps the board near its current on-screen size at the current distance.)
        viewFocal: 3800,          // relative view size / focal length (px)
        camBack: 2500,            // mm the camera sits behind the hand (controls how much near things loom)
        camY: 0,                  // camera height in world Y (0 = level with board centre / the bull)
        camDollyFrac: 0.6,        // FRACTION of the way to the board the camera travels by impact, tracking the dart. Scales with distance (a far board still "walks in" strongly). 0 = static camera. The trajectory behind the camera is clipped, so this can exceed camBack safely.
        camDollyMinDistance: 4200, // only dolly when the board is at least this far; nearer than this it reads fine with a static view. (The default boardDistance is below this → no dolly.)
        dartLoomMax: 2.2,         // how much bigger than the board-plane size the dart may get as it nears the camera (its "loom"). Capped like this, the dart keeps the SAME size relative to the board at any distance — a far board gives a proportionally smaller launch dart, not a giant one. (2.2 ≈ the default look.)
        boardCenterX: 240,        // board centre on the canvas (logical px)
        boardCenterY: 250,

        // --- flight / pacing ---
        flightSpeedScale: 1.0,    // 1 = real time; <1 slows the flight down for inspection
        resultHoldSec: 0.9,       // how long the landed result lingers before a fresh dart is ready
        earlyMissDropMM: 210,     // a dart that is already DESCENDING and has fallen below −this (well under the board) can't recover → end the flight early and show the miss, instead of flying/dollying the whole way. Set huge to disable.
        stuckMaxRadiusMM: 480,    // don't stick a dart in the board farther than this from centre; a clear off-board miss just shows the text (no stray mark)
        maxStuckDarts: 6,         // how many landed darts stay stuck in the board
        trajShowSec: 1.4,         // how long the committed flight path stays drawn after landing

        debug: false,             // D toggles the practice/debug visualisation
    };

    // Standard dartboard sector order, clockwise from the 20 at the top.
    var SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

    var W = 480, H = 600;
    var DART_LEN_MM = 30;   // the dart's PHYSICAL length (world mm). Drawn through the projection, so its on-screen size = DART_LEN_MM × scale-at-its-depth: the tip (at the board) tracks the board's size (distance + view), while the launch size depends only on the view. Flying and stuck are the same object → no jump.

    // =================================================================
    // State
    // =================================================================

    var G = {
        dartState: 'ready',   // 'ready' → 'flying' → 'landed' → 'ready'
        flightT: 0,           // seconds elapsed in the current flight
        throw: null,          // the committed throw { pos, vel, tempo }
        throwAngle: 0,        // screen-space heading of the throw (launch → impact); the dart points this way in flight AND stuck, so the two are one continuous object
        landDolly: 0,         // the camera dolly value at the moment of landing; the pull-back eases from here (so an early-ended flight doesn't snap the view)
        analysis: null,       // the gesture analysis behind G.throw (kept for debug)
        impact: null,         // { x, y } board-plane mm, once computed
        result: null,         // { score, label, mult, region, miss }
        resultT: 0,           // countdown while a result lingers
        traj: null,           // sampled 3D flight points (debug + path draw)
        trajT: 0,             // countdown for drawing the committed path
        stuck: [],            // recent landed darts [{ x, y, result }]
        total: 0,             // session points
        darts: 0,             // session throws
        last: null,           // last result (for the HUD)
        hint: null,           // transient on-canvas message (e.g. "too soft")
        hintT: 0,             // seconds the hint lingers
    };

    var shell = null;
    var gesture = null;       // active recording { t0, sx, sy, scaleX, scaleY, samples }
    var camDolly = 0;         // current forward camera dolly (mm); eased in render() from the dart's progress

    var canvas = document.getElementById('stage');
    var ctx = canvas.getContext('2d');
    var dom = {
        last: document.getElementById('last-score'),
        total: document.getElementById('session-total'),
        darts: document.getElementById('dart-count'),
        debugBtn: document.getElementById('debug-btn'),
    };
    var fontCache = null;

    function getFont() {
        if (!fontCache) {
            fontCache = (getComputedStyle(document.body).getPropertyValue('--font-display') || '').trim()
                || '"Segoe UI", system-ui, sans-serif';
        }
        return fontCache;
    }

    function fitCanvas() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // =================================================================
    // Pseudo-3D projection
    //
    // The board is a flat disc facing the camera at Z = boardDistance. A world point
    // projects with a fixed focal length (viewFocal), so on-screen scale = viewFocal / depth:
    // a nearer thing (small depth) looms larger. Because the focal length is independent of
    // the board distance, moving the board farther genuinely makes it look smaller, while the
    // hand (always camBack from the camera) keeps its size.
    // =================================================================

    function focal() { return TUNING.viewFocal; }   // the relative view size (focal length, px)

    // Camera depth of a world Z, accounting for the forward dolly (the camera moves +Z by camDolly).
    function depthOf(z) { return z + TUNING.camBack - camDolly; }
    function boardScaleNow() { return focal() / depthOf(TUNING.boardDistance); }   // px per mm at the board, with the current dolly

    function project(x, y, z) {
        var s = focal() / depthOf(z);
        return {
            sx: TUNING.boardCenterX + x * s,
            sy: TUNING.boardCenterY - (y - TUNING.camY) * s,
            scale: s,
        };
    }

    // =================================================================
    // Gesture analysis  (pure — no rendering, no globals beyond TUNING)
    //
    // Input: samples [{ t (s), x, y (logical px, y up-positive, first = {0,0,0}) }].
    // Output: a smoothed path + a recency-weighted release velocity over the final
    // window, plus validity. We deliberately AVOID using only the last sample pair:
    // pointer/touch jitter would make that unstable.
    // =================================================================

    function analyseGesture(samples) {
        var n = samples.length;
        if (n < 2) return { valid: false, reason: 'short', samples: samples, smoothed: samples };

        var dur = samples[n - 1].t - samples[0].t;

        // 1) EMA-smooth the raw path (used for both the release velocity and the debug draw).
        var a = TUNING.smoothing;
        var sm = new Array(n);
        var sx = samples[0].x, sy = samples[0].y;
        for (var i = 0; i < n; i++) {
            if (i === 0) { sx = samples[0].x; sy = samples[0].y; }
            else { sx += a * (samples[i].x - sx); sy += a * (samples[i].y - sy); }
            sm[i] = { t: samples[i].t, x: sx, y: sy };
        }

        // 2) Recency-weighted velocity over the final releaseWindowMs. Each consecutive
        // pair contributes its instantaneous velocity, weighted by how close it sits to
        // the release moment (releaseRecencyBias) and by its own dt.
        var endT = sm[n - 1].t;
        var winStart = endT - TUNING.releaseWindowMs / 1000;
        var span = endT - winStart || 1;
        var vx = 0, vy = 0, wsum = 0, used = 0;
        for (var j = 1; j < n; j++) {
            if (sm[j].t < winStart) continue;
            var dt = sm[j].t - sm[j - 1].t;
            if (dt <= 0) continue;
            var ivx = (sm[j].x - sm[j - 1].x) / dt;
            var ivy = (sm[j].y - sm[j - 1].y) / dt;
            var recency = (sm[j].t - winStart) / span;          // 0 at window start → 1 at release
            var w = Math.pow(clamp(recency, 0, 1), TUNING.releaseRecencyBias) * dt;
            vx += ivx * w; vy += ivy * w; wsum += w; used++;
        }

        // 3) Fallback if the window held too little (a very brief flick on a slow pointer):
        // use the last few samples so we still get a stable tangent, never a lone pair.
        if (wsum <= 0 || used < 1) {
            var k = Math.max(0, n - 4);
            var ddt = sm[n - 1].t - sm[k].t;
            if (ddt <= 0) return { valid: false, reason: 'short', dur: dur, samples: samples, smoothed: sm };
            vx = (sm[n - 1].x - sm[k].x) / ddt;
            vy = (sm[n - 1].y - sm[k].y) / ddt;
            winStart = sm[k].t;
        } else {
            vx /= wsum; vy /= wsum;
        }

        var speed = Math.hypot(vx, vy);
        var reason = null;
        if (dur * 1000 < TUNING.minGestureMs) reason = 'short';
        else if (speed < TUNING.minReleaseSpeed) reason = 'soft';
        else if (vy < TUNING.minUpSpeed) reason = 'down';   // flat / downward release → not a real (upward) throw

        return {
            valid: !reason,
            reason: reason,
            dur: dur,
            releaseVel: { x: vx, y: vy },
            speed: speed,
            winStart: winStart,
            samples: samples,
            smoothed: sm,
        };
    }

    // Map a valid gesture analysis to a world-space throw. Forward (Z) velocity is a
    // COMPRESSED function of flick speed (tempo); lateral/vertical velocity come straight
    // from the release tangent. No randomness unless releaseNoise is set.
    function computeThrow(an) {
        var T = TUNING;
        var tempo = 1 + (an.speed / T.refReleaseSpeed - 1) * T.tempoSensitivity;
        tempo = clamp(tempo, T.tempoMin, T.tempoMax);
        var capped = Math.min(an.speed, T.maxReleaseSpeed) / (an.speed || 1);
        var vx = an.releaseVel.x * capped * T.aimScaleX;
        var vy = an.releaseVel.y * capped * T.aimScaleY;
        var vz = T.baseForward * tempo;
        if (T.releaseNoise > 0) {   // kept off by default → deterministic
            vx += (Math.random() * 2 - 1) * T.releaseNoise;
            vy += (Math.random() * 2 - 1) * T.releaseNoise;
        }
        return { pos: { x: 0, y: T.handYOffset, z: 0 }, vel: { x: vx, y: vy, z: vz }, tempo: tempo };
    }

    // =================================================================
    // Ballistics  (pure)
    // =================================================================

    function dartPosAt(th, time) {
        return {
            x: th.pos.x + th.vel.x * time,
            y: th.pos.y + th.vel.y * time - 0.5 * TUNING.gravity * time * time,
            z: th.pos.z + th.vel.z * time,
        };
    }
    // Exact board-plane impact (closed form — z is linear in time since there's no drag).
    function computeImpact(th) {
        var tHit = TUNING.boardDistance / th.vel.z;
        var p = dartPosAt(th, tHit);
        return { x: p.x, y: p.y, t: tHit };
    }
    // Sample the flight into a 3D polyline for drawing + the debug side/top views.
    function sampleTrajectory(th, tHit) {
        var pts = [], steps = 28;
        for (var i = 0; i <= steps; i++) {
            pts.push(dartPosAt(th, tHit * i / steps));
        }
        return pts;
    }

    // =================================================================
    // Scoring (standard board)  (pure)
    // =================================================================

    function scoreAt(bx, by) {
        var T = TUNING;
        var r = Math.hypot(bx, by);
        if (r <= T.rInnerBull) return { score: 50, mult: 1, base: 50, region: 'bullseye', miss: false };
        if (r <= T.rOuterBull) return { score: 25, mult: 1, base: 25, region: 'bull', miss: false };
        if (r > T.rDoubleOuter) return { score: 0, mult: 0, base: 0, region: 'miss', miss: true };
        // sector by angle, clockwise from the 20 at the top
        var deg = Math.atan2(bx, by) * 180 / Math.PI;    // 0 = up, +90 = right, 180 = down
        if (deg < 0) deg += 360;
        var sector = Math.round(deg / 18) % 20;
        var base = SECTORS[sector];
        var mult = 1, region = 'single';
        if (r >= T.rDoubleInner) { mult = 2; region = 'double'; }
        else if (r >= T.rTripleInner && r <= T.rTripleOuter) { mult = 3; region = 'triple'; }
        return { score: base * mult, mult: mult, base: base, region: region, miss: false };
    }

    function resultLabel(res) {
        if (!res) return '';
        if (res.region === 'miss') return t('dartsMiss');
        if (res.region === 'bullseye') return t('dartsBullseye') + ' 50';
        if (res.region === 'bull') return t('dartsBull') + ' 25';
        var prefix = res.mult === 3 ? 'T' : res.mult === 2 ? 'D' : '';
        return prefix + res.base + ' = ' + res.score;
    }

    // =================================================================
    // Input — relative gesture, startable anywhere on the page.
    //
    // Press = virtual hand origin (0,0,0). We record relative motion only, so the
    // physical press point never affects the throw (crucial for touch). Deltas are
    // normalised into the canvas' logical space so the same swipe throws the same at
    // any display size, and y is flipped so flicking UP is positive.
    // =================================================================

    function canThrow() {
        return shell && shell.isPlaying() && (G.dartState === 'ready' || G.dartState === 'landed');
    }

    function beginGesture(e) {
        var rect = canvas.getBoundingClientRect();
        gesture = {
            t0: performance.now(),
            sx: e.clientX, sy: e.clientY,
            scaleX: W / (rect.width || W),      // CSS px → logical px
            scaleY: H / (rect.height || H),
            samples: [{ t: 0, x: 0, y: 0 }],
        };
        // A press while a result lingers skips straight to a fresh dart so throws stay snappy.
        if (G.dartState === 'landed') freshDart();
    }
    function recordGesture(e) {
        if (!gesture) return;
        var ts = (performance.now() - gesture.t0) / 1000;
        var gx = (e.clientX - gesture.sx) * gesture.scaleX;
        var gy = -(e.clientY - gesture.sy) * gesture.scaleY;   // screen-down is +, flip so up is +
        gesture.samples.push({ t: ts, x: gx, y: gy });
    }
    function endGesture() {
        if (!gesture) return;
        var samples = gesture.samples;
        gesture = null;
        var an = analyseGesture(samples);
        if (!an.valid) {
            // Not a throw (tap / too soft / not upward) — keep the dart, but remember it for debug.
            G.analysis = an;
            flashHint(an.reason === 'down' ? t('dartsThrowUp') : t('dartsShort'));
            return;
        }
        launchThrow(an);
    }

    // A tap / too-soft / non-upward gesture is deliberately NOT a throw — but it must still
    // visibly react so it never reads as "nothing happened". Show a brief on-board hint + a cue.
    function flashHint(text) {
        G.hint = text;
        G.hintT = 1.1;
        AC.audio.tone(220, 0.06, { type: 'sine', volume: 0.05, slideTo: 180 });
    }

    function launchThrow(an) {
        var th = computeThrow(an);
        var impact = computeImpact(th);
        G.analysis = an;
        G.throw = th;
        G.impact = impact;
        G.traj = sampleTrajectory(th, impact.t);
        // Fix the dart's on-screen heading from the overall path (launch → impact): it reads
        // as "flying up into the board" and stays consistent when it sticks (no orientation pop).
        var ls = project(th.pos.x, th.pos.y, th.pos.z);
        var is = project(impact.x, impact.y, TUNING.boardDistance);
        G.throwAngle = Math.atan2(is.sy - ls.sy, is.sx - ls.sx);
        G.result = null;
        G.dartState = 'flying';
        G.flightT = 0;
        sndThrow(th.tempo);
    }

    function landDart() {
        var res = scoreAt(G.impact.x, G.impact.y);
        G.result = res;
        G.dartState = 'landed';
        G.resultT = TUNING.resultHoldSec;
        G.trajT = TUNING.trajShowSec;
        G.darts += 1;
        G.total += res.score;
        G.last = { label: resultLabel(res), miss: res.miss, score: res.score };
        G.landDolly = camDolly;   // freeze the current dolly so the pull-back eases from here (no snap on an early end)
        // Only stick a dart that actually landed on/near the board; a clear off-board miss just shows the text.
        if (Math.hypot(G.impact.x, G.impact.y) <= TUNING.stuckMaxRadiusMM) {
            G.stuck.push({ x: G.impact.x, y: G.impact.y, result: res, angle: G.throwAngle });
            if (G.stuck.length > TUNING.maxStuckDarts) G.stuck.shift();
        }
        sndHit(res);
        syncHud();
    }

    function freshDart() {
        G.dartState = 'ready';
        G.throw = null;
        G.impact = null;
        G.result = null;
        G.flightT = 0;
    }

    // Pointer handlers. Down starts a recording anywhere in the play zone; move/up live on
    // the window so a gesture that strays off the board still completes (like Bullet Storm).
    function onPointerDown(e) {
        if (!canThrow()) return;
        if (e.target.closest && e.target.closest('button, a, .overlay')) return;
        AC.audio.unlock();
        beginGesture(e);
        if (e.cancelable) e.preventDefault();
    }
    function onPointerMove(e) {
        if (!gesture) return;
        recordGesture(e);
        if (e.cancelable) e.preventDefault();
    }
    function onPointerUp() {
        if (!gesture) return;
        endGesture();
    }
    function onPointerCancel() { gesture = null; }

    // =================================================================
    // Sound (built on the shared synth)
    // =================================================================

    function sndThrow(tempo) {
        AC.audio.noise(0.12, { volume: 0.06, filter: { type: 'bandpass', freq: 900 + tempo * 500, to: 300 } });
    }
    function sndHit(res) {
        if (res.miss) { AC.audio.tone(150, 0.1, { type: 'triangle', volume: 0.07, slideTo: 90 }); return; }
        var f = res.region === 'bullseye' ? 1047 : res.region === 'bull' ? 784 : res.mult === 3 ? 988 : res.mult === 2 ? 740 : 523;
        AC.audio.tone(f, 0.09, { type: 'square', volume: 0.09, attack: 0.002 });
        AC.audio.noise(0.04, { volume: 0.04, filter: { type: 'highpass', freq: 1800 } });
    }

    // =================================================================
    // Simulation step
    // =================================================================

    function update(dt) {
        if (G.trajT > 0) G.trajT = Math.max(0, G.trajT - dt);
        if (G.hintT > 0) G.hintT = Math.max(0, G.hintT - dt);
        if (G.dartState === 'flying') {
            G.flightT += dt * TUNING.flightSpeedScale;
            var p = dartPosAt(G.throw, G.flightT);
            // End early if it has clearly fallen short: already descending and well below the
            // board, so it can only drop further — no point flying/dollying the rest.
            var vyNow = G.throw.vel.y - TUNING.gravity * G.flightT;
            if (p.z >= TUNING.boardDistance) landDart();
            else if (vyNow < 0 && p.y < -TUNING.earlyMissDropMM) landDart();
        } else if (G.dartState === 'landed') {
            G.resultT -= dt;
            if (G.resultT <= 0) freshDart();
        }
    }

    // =================================================================
    // Rendering
    // =================================================================

    // Ease the forward dolly from the dart's own progress: the camera rides in with the
    // throw (board grows), then eases back out while the result lingers.
    function updateCamDolly() {
        // Gate by distance: a near board reads fine with a static view, so only dolly once
        // the board is far enough to warrant "walking in" with the throw. The travel is a
        // FRACTION of the distance, so a far board follows just as strongly as a near one.
        var full = (TUNING.boardDistance >= TUNING.camDollyMinDistance) ? TUNING.camDollyFrac * TUNING.boardDistance : 0;
        if (full <= 0) { camDolly = 0; return; }
        if (G.dartState === 'flying' && G.throw) {
            var pz = dartPosAt(G.throw, G.flightT).z;
            camDolly = full * clamp(pz / TUNING.boardDistance, 0, 1);   // ride in with the dart's progress
        } else if (G.dartState === 'landed') {
            camDolly = G.landDolly * clamp(G.resultT / TUNING.resultHoldSec, 0, 1);   // ease back from wherever the flight ended (no snap)
        } else {
            camDolly = 0;
        }
    }

    function render() {
        updateCamDolly();
        drawBackground();
        drawBoard();
        drawStuckDarts();
        if ((G.dartState === 'flying' || G.dartState === 'landed') && G.throw) {
            if (G.trajT > 0) drawTrajectory();
            if (G.dartState === 'flying') drawFlyingDart();
        }
        drawResultBanner();
        drawPrompt();
        if (TUNING.debug) drawDebug();
    }

    // A standing nudge before the first throw (so a tap-with-no-flick isn't a mystery),
    // plus the transient "too soft" hint. Both sit where the result banner would.
    function drawPrompt() {
        var showStanding = G.dartState === 'ready' && G.darts === 0 && G.hintT <= 0;
        if (G.hintT > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, G.hintT / 0.6);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = '700 20px ' + getFont();
            ctx.fillStyle = '#fca5a5';
            ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8;
            ctx.fillText(G.hint || '', W / 2, H - 46);
            ctx.restore();
        } else if (showStanding) {
            ctx.save();
            ctx.globalAlpha = 0.65;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = '600 15px ' + getFont();
            ctx.fillStyle = 'rgba(226,232,240,0.9)';
            ctx.fillText(t('dartsFlickPrompt'), W / 2, H - 44);
            ctx.restore();
        }
    }

    function drawBackground() {
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#15202b');
        g.addColorStop(0.62, '#0f161e');
        g.addColorStop(1, '#0a0f15');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // a faint floor line under the board for a hint of depth (follows the board's drawn size)
        var floorY = TUNING.boardCenterY + boardScaleNow() * TUNING.boardRadiusMM + 70;
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, floorY);
        ctx.lineTo(W, floorY);
        ctx.stroke();
    }

    // Board colours (standard look).
    var COL = {
        wire: '#0b0e12',
        numberRing: '#141414',
        singleDark: '#1c1c1c',
        singleLight: '#e8d7ac',
        ringRed: '#d33a2c',
        ringGreen: '#2e8b57',
        bullOuter: '#2e8b57',
        bullInner: '#d33a2c',
        wireLine: 'rgba(190,190,190,0.28)',
    };

    function wedge(cx, cy, rIn, rOut, a0, a1, fill) {
        ctx.beginPath();
        ctx.arc(cx, cy, rOut, a0, a1);
        ctx.arc(cx, cy, rIn, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
    }

    function drawBoard() {
        var cx = TUNING.boardCenterX, cy = TUNING.boardCenterY;
        var s = boardScaleNow();   // dynamic: the board grows as the camera dollies in
        var rDoubleOut = TUNING.rDoubleOuter * s;
        var rDoubleIn = TUNING.rDoubleInner * s;
        var rTripOut = TUNING.rTripleOuter * s;
        var rTripIn = TUNING.rTripleInner * s;
        var rOutBull = TUNING.rOuterBull * s;
        var rInBull = TUNING.rInnerBull * s;
        var rNumber = rDoubleOut * 1.12;

        // number-ring backing + board shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
        ctx.beginPath(); ctx.arc(cx, cy, rNumber, 0, PI2); ctx.fillStyle = COL.numberRing; ctx.fill();
        ctx.restore();

        var half = (18 / 2) * Math.PI / 180;    // ±9° per sector
        for (var i = 0; i < 20; i++) {
            // sector i is centred at i*18° clockwise from the top; map to canvas angle (up = -90°)
            var centreCanvas = -Math.PI / 2 + i * 18 * Math.PI / 180;
            var a0 = centreCanvas - half, a1 = centreCanvas + half;
            var dark = (i % 2 === 0);                    // 20 (i=0) is a dark single
            var single = dark ? COL.singleDark : COL.singleLight;
            var ring = dark ? COL.ringRed : COL.ringGreen;
            wedge(cx, cy, rOutBull, rTripIn, a0, a1, single);       // inner single
            wedge(cx, cy, rTripIn, rTripOut, a0, a1, ring);         // triple
            wedge(cx, cy, rTripOut, rDoubleIn, a0, a1, single);     // outer single
            wedge(cx, cy, rDoubleIn, rDoubleOut, a0, a1, ring);     // double
        }

        // sector wires
        ctx.strokeStyle = COL.wireLine; ctx.lineWidth = 1;
        for (var k = 0; k < 20; k++) {
            var ang = -Math.PI / 2 + (k + 0.5) * 18 * Math.PI / 180;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(ang) * rOutBull, cy + Math.sin(ang) * rOutBull);
            ctx.lineTo(cx + Math.cos(ang) * rDoubleOut, cy + Math.sin(ang) * rDoubleOut);
            ctx.stroke();
        }
        // ring wires
        [rOutBull, rTripIn, rTripOut, rDoubleIn, rDoubleOut].forEach(function (rr) {
            ctx.beginPath(); ctx.arc(cx, cy, rr, 0, PI2); ctx.stroke();
        });

        // bulls
        ctx.beginPath(); ctx.arc(cx, cy, rOutBull, 0, PI2); ctx.fillStyle = COL.bullOuter; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, rInBull, 0, PI2); ctx.fillStyle = COL.bullInner; ctx.fill(); ctx.stroke();

        // numbers around the ring (scale with the board; small floor so a far board keeps them proportional, not oversized)
        ctx.fillStyle = '#efe7d0';
        ctx.font = '600 ' + Math.max(3, Math.round(rDoubleOut * 0.12)) + 'px ' + getFont();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (var m = 0; m < 20; m++) {
            var na = -Math.PI / 2 + m * 18 * Math.PI / 180;
            ctx.fillText(String(SECTORS[m]), cx + Math.cos(na) * rNumber, cy + Math.sin(na) * rNumber);
        }
    }

    // The ONE dart drawing used for both flight and the stuck mark, so there's no seam when
    // it lands: a needle whose TIP sits exactly at (tipX, tipY) — the impact — pointing along
    // `angle` (the throw's screen heading), with a barrel + fletching trailing behind it.
    // `len` scales with perspective so the flying dart and the stuck dart match in size.
    function drawDart(tipX, tipY, len, angle, opts) {
        opts = opts || {};
        var dx = Math.cos(angle), dy = Math.sin(angle);     // unit vector toward the tip (travel dir)
        var neckX = tipX - dx * len * 0.42, neckY = tipY - dy * len * 0.42;
        var backX = tipX - dx * len, backY = tipY - dy * len;
        var px = -dy, py = dx;                               // perpendicular, for the flights
        // All strokes scale with the drawn LENGTH, so the dart stays a crisp, slender shape
        // whether it looms up close or shrinks to a few px at a far board (no fat blob).
        var barrelW = Math.max(0.5, len * 0.13);
        var thinW = Math.max(0.35, len * 0.055);
        var tipR = Math.max(0.5, len * 0.06);
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
        if (opts.glow) { ctx.shadowColor = 'rgba(253,230,138,0.85)'; ctx.shadowBlur = Math.min(5, len * 0.16); }   // capped so a big (near) dart stays crisp, not a blurry halo
        // barrel (back → neck), thicker
        ctx.strokeStyle = opts.color || '#fde68a';
        ctx.lineWidth = barrelW;
        ctx.beginPath(); ctx.moveTo(backX, backY); ctx.lineTo(neckX, neckY); ctx.stroke();
        // needle (neck → tip), thin, ending exactly on the impact point
        ctx.lineWidth = thinW;
        ctx.beginPath(); ctx.moveTo(neckX, neckY); ctx.lineTo(tipX, tipY); ctx.stroke();
        ctx.shadowBlur = 0;
        // flights (a chevron of fletching) at the rear
        var fw = len * 0.24, ff = len * 0.28;
        ctx.lineWidth = thinW;
        ctx.beginPath();
        ctx.moveTo(backX + px * fw, backY + py * fw);
        ctx.lineTo(backX + dx * ff, backY + dy * ff);
        ctx.lineTo(backX - px * fw, backY - py * fw);
        ctx.stroke();
        // the exact tip (the hole in the board)
        ctx.fillStyle = opts.tipColor || '#fff7dc';
        ctx.beginPath(); ctx.arc(tipX, tipY, tipR, 0, PI2); ctx.fill();
        ctx.restore();
    }

    function drawStuckDarts() {
        for (var i = 0; i < G.stuck.length; i++) {
            var d = G.stuck[i];
            var pr = project(d.x, d.y, TUNING.boardDistance);
            var dscale = Math.min(pr.scale, boardScaleNow() * TUNING.dartLoomMax);
            var latest = (i === G.stuck.length - 1 && G.dartState === 'landed');
            drawDart(pr.sx, pr.sy, DART_LEN_MM * dscale, d.angle != null ? d.angle : -Math.PI / 2, {
                alpha: latest ? 1 : 0.55,
                color: latest ? '#fde68a' : 'rgba(226,226,226,0.85)',
                glow: latest,
            });
        }
    }

    function drawTrajectory() {
        if (!G.traj) return;
        ctx.save();
        ctx.globalAlpha = clamp(G.trajT / TUNING.trajShowSec, 0, 1) * 0.5;
        ctx.strokeStyle = 'rgba(125,211,252,0.9)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        var started = false;
        for (var i = 0; i < G.traj.length; i++) {
            if (depthOf(G.traj[i].z) <= 1) { started = false; continue; }   // behind the camera (deep dolly) → break the line
            var pr = project(G.traj[i].x, G.traj[i].y, G.traj[i].z);
            if (!started) { ctx.moveTo(pr.sx, pr.sy); started = true; } else ctx.lineTo(pr.sx, pr.sy);
        }
        ctx.stroke();
        ctx.restore();
    }

    function drawFlyingDart() {
        var p = dartPosAt(G.throw, G.flightT);
        var pr = project(p.x, p.y, p.z);
        // Size tracks the board (so the dart looks the same at any distance), with a capped loom
        // as it nears the camera — never a giant dart over a far, tiny board.
        var dscale = Math.min(pr.scale, boardScaleNow() * TUNING.dartLoomMax);
        var dlen = DART_LEN_MM * dscale;
        // a faint motion streak behind the barrel
        var pPrev = dartPosAt(G.throw, Math.max(0, G.flightT - 0.03));
        var prPrev = project(pPrev.x, pPrev.y, pPrev.z);
        ctx.save();
        ctx.strokeStyle = 'rgba(253,230,138,0.28)';
        ctx.lineWidth = Math.max(1, dlen * 0.12); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(prPrev.sx, prPrev.sy); ctx.lineTo(pr.sx, pr.sy); ctx.stroke();
        ctx.restore();
        // the SAME dart as the stuck one — tip leading along the throw's heading
        drawDart(pr.sx, pr.sy, dlen, G.throwAngle, { color: '#fde68a', glow: true });
    }

    function drawResultBanner() {
        if (G.dartState !== 'landed' || !G.result) return;
        var alpha = clamp(G.resultT / TUNING.resultHoldSec, 0, 1);
        var label = resultLabel(G.result);
        ctx.save();
        ctx.globalAlpha = Math.min(1, alpha * 1.6);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '800 30px ' + getFont();
        ctx.fillStyle = G.result.miss ? '#fca5a5' : G.result.region === 'bullseye' || G.result.mult === 3 ? '#86efac' : '#fde68a';
        ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10;
        ctx.fillText(label, W / 2, H - 46);
        ctx.restore();
    }

    // -----------------------------------------------------------------
    // Debug / practice visualisation (D)
    //
    // The point is to see WHY a dart went where it did: the recorded gesture, the
    // smoothed path, the release window + release vector, and the trajectory from the
    // top (lateral) and the side (drop). "I missed right because my release pulled right."
    // -----------------------------------------------------------------

    function drawDebug() {
        drawGesturePanel();
        drawTrajPanels();
        drawDebugText();
    }

    function panelBox(x, y, w, h, title) {
        ctx.save();
        ctx.fillStyle = 'rgba(8,12,18,0.82)';
        ctx.strokeStyle = 'rgba(125,211,252,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill(); ctx.stroke();
        if (title) {
            ctx.fillStyle = 'rgba(125,211,252,0.85)';
            ctx.font = '600 10px ' + getFont();
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillText(title, x + 6, y + 5);
        }
        ctx.restore();
    }

    // The raw + smoothed gesture, auto-scaled to fit, with the release window highlighted
    // and the release-vector arrow. Press point is drawn at the panel centre (it's relative).
    function drawGesturePanel() {
        var an = G.analysis;
        var pw = 150, ph = 128, px = 10, py = H - ph - 10;
        panelBox(px, py, pw, ph, 'gesture');
        if (!an || !an.samples || an.samples.length < 2) return;

        var pts = an.smoothed && an.smoothed.length === an.samples.length ? an.smoothed : an.samples;
        var minX = 0, maxX = 0, minY = 0, maxY = 0;
        for (var i = 0; i < pts.length; i++) {
            if (pts[i].x < minX) minX = pts[i].x; if (pts[i].x > maxX) maxX = pts[i].x;
            if (pts[i].y < minY) minY = pts[i].y; if (pts[i].y > maxY) maxY = pts[i].y;
        }
        var pad = 16;
        var spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
        var sc = Math.min((pw - pad * 2) / spanX, (ph - pad * 2) / spanY);
        var ox = px + pw / 2 - ((minX + maxX) / 2) * sc;
        var oy = py + ph / 2 + ((minY + maxY) / 2) * sc;   // y up-positive → minus below
        function gp(pt) { return { x: ox + pt.x * sc, y: oy - pt.y * sc }; }

        // raw path (faint)
        ctx.save();
        ctx.strokeStyle = 'rgba(148,163,184,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (var r = 0; r < an.samples.length; r++) { var q = gp(an.samples[r]); if (r === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }
        ctx.stroke();
        // smoothed path, release window brighter
        ctx.lineWidth = 1.8;
        for (var k = 1; k < pts.length; k++) {
            var inWin = an.winStart != null && pts[k].t >= an.winStart;
            ctx.strokeStyle = inWin ? 'rgba(253,230,138,0.95)' : 'rgba(125,211,252,0.8)';
            var p0 = gp(pts[k - 1]), p1 = gp(pts[k]);
            ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        }
        // press origin + end point
        var o0 = gp(pts[0]), oe = gp(pts[pts.length - 1]);
        ctx.fillStyle = 'rgba(148,163,184,0.9)'; ctx.beginPath(); ctx.arc(o0.x, o0.y, 2.5, 0, PI2); ctx.fill();
        ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(oe.x, oe.y, 3, 0, PI2); ctx.fill();
        // release vector arrow (from the end, direction of the release tangent)
        if (an.releaseVel) {
            var vlen = Math.hypot(an.releaseVel.x, an.releaseVel.y) || 1;
            var ax = an.releaseVel.x / vlen, ay = an.releaseVel.y / vlen;
            var L = 26;
            var ex = oe.x + ax * L, ey = oe.y - ay * L;
            ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(oe.x, oe.y); ctx.lineTo(ex, ey); ctx.stroke();
            var ah = 5, base = Math.atan2(-(ay), ax);
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - ah * Math.cos(base - 0.4), ey - ah * Math.sin(base - 0.4));
            ctx.lineTo(ex - ah * Math.cos(base + 0.4), ey - ah * Math.sin(base + 0.4));
            ctx.closePath(); ctx.fillStyle = '#f87171'; ctx.fill();
        }
        ctx.restore();
    }

    // Top view (lateral X vs forward Z) and side view (vertical Y vs forward Z) of the flight.
    function drawTrajPanels() {
        if (!G.traj || !G.impact) return;
        var pw = 150, ph = 60, px = W - pw - 10;
        drawTrajPanel(px, 56, pw, ph, 'top (L/R)', function (p) { return p.x; }, TUNING.boardRadiusMM);
        drawTrajPanel(px, 56 + ph + 8, pw, ph, 'side (drop)', function (p) { return p.y; }, TUNING.boardRadiusMM);
    }
    function drawTrajPanel(px, py, pw, ph, title, axis, range) {
        panelBox(px, py, pw, ph, title);
        var pad = 10;
        var z0 = 0, z1 = TUNING.boardDistance;
        function sx(z) { return px + pad + (z - z0) / (z1 - z0) * (pw - pad * 2); }
        function sy(v) { return py + ph / 2 - clamp(v / range, -1, 1) * (ph / 2 - pad); }
        // centre line (board centre height / line)
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px + pad, py + ph / 2); ctx.lineTo(px + pw - pad, py + ph / 2); ctx.stroke();
        // board edge band
        ctx.strokeStyle = 'rgba(46,139,87,0.5)';
        ctx.beginPath(); ctx.moveTo(sx(z1), py + 4); ctx.lineTo(sx(z1), py + ph - 4); ctx.stroke();
        // flight path
        ctx.strokeStyle = 'rgba(125,211,252,0.9)'; ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (var i = 0; i < G.traj.length; i++) {
            var p = G.traj[i];
            var X = sx(p.z), Y = sy(axis(p));
            if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.stroke();
        // impact dot
        var ix = sx(z1), iy = sy(axis({ x: G.impact.x, y: G.impact.y, z: z1 }));
        ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(ix, iy, 3, 0, PI2); ctx.fill();
        ctx.restore();
    }

    function drawDebugText() {
        var an = G.analysis, th = G.throw;
        var lines = [];
        if (an) {
            lines.push('dur ' + (an.dur != null ? Math.round(an.dur * 1000) : '-') + ' ms');
            lines.push('release ' + (an.speed != null ? Math.round(an.speed) : '-') + ' px/s'
                + (an.valid ? '' : ' (' + (an.reason || 'invalid') + ')'));
        }
        if (th) {
            lines.push('tempo ' + th.tempo.toFixed(2) + '  vz ' + Math.round(th.vel.z));
            lines.push('vx ' + Math.round(th.vel.x) + '  vy ' + Math.round(th.vel.y));
        }
        if (G.impact) lines.push('impact x ' + Math.round(G.impact.x) + '  y ' + Math.round(G.impact.y) + ' mm');
        if (G.result) lines.push('score ' + G.result.score + '  (' + resultLabel(G.result) + ')');
        ctx.save();
        ctx.font = '600 11px ' + getFont();
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        var x = 12, y = 10;
        for (var i = 0; i < lines.length; i++) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(x - 3, y - 2 + i * 15, ctx.measureText(lines[i]).width + 6, 14);
            ctx.fillStyle = 'rgba(226,232,240,0.95)';
            ctx.fillText(lines[i], x, y + i * 15);
        }
        ctx.restore();
    }

    // =================================================================
    // HUD + overlay
    // =================================================================

    function syncHud() {
        if (dom.last) {
            dom.last.textContent = G.last ? G.last.label : '\u2014';
            dom.last.classList.toggle('danger', !!(G.last && G.last.miss));
        }
        if (dom.total) dom.total.textContent = AC.format.score(G.total);
        if (dom.darts) dom.darts.textContent = String(G.darts);
    }

    function syncDebugBtn() {
        if (!dom.debugBtn) return;
        dom.debugBtn.classList.toggle('active', !!TUNING.debug);
        dom.debugBtn.setAttribute('aria-pressed', TUNING.debug ? 'true' : 'false');
    }
    function toggleDebug() {
        TUNING.debug = !TUNING.debug;
        syncDebugBtn();
        render();
    }

    function overlayContent(state) {
        if (state === 'idle') {
            return {
                badge: 'target',
                title: t('dartsReady'),
                message: t('dartsIntro'),
                button: t('play'),
                hint: t('dartsStartHintHtml'),
            };
        }
        return {};   // paused uses the shell default
    }

    // =================================================================
    // Reset + boot
    // =================================================================

    function resetSession() {
        G.dartState = 'ready';
        G.throw = null; G.analysis = null; G.impact = null; G.result = null; G.traj = null;
        G.flightT = 0; G.resultT = 0; G.trajT = 0;
        G.stuck = [];
        G.total = 0; G.darts = 0; G.last = null;
        G.hint = null; G.hintT = 0;
        gesture = null;
        syncHud();
    }

    function init() {
        fitCanvas();
        window.addEventListener('resize', function () { fitCanvas(); render(); });

        shell = AC.shell.create({
            gameId: 'darts',
            step: 1 / 60,
            preventKeys: ['Space'],
            update: update,
            render: render,
            reset: resetSession,
            restartToReady: true,
            overlayContent: overlayContent,
        });

        // Relative gesture: press anywhere in the play zone, move/release on the window so a
        // flick that leaves the board still throws.
        var pad = document.querySelector('.stage-pad') || canvas;
        pad.addEventListener('pointerdown', onPointerDown, { passive: false });
        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerCancel);

        if (dom.debugBtn) dom.debugBtn.addEventListener('click', function () { AC.audio.unlock(); toggleDebug(); });
        window.addEventListener('keydown', function (e) {
            if (e.key === 'd' || e.key === 'D') { toggleDebug(); }
        });

        AC.i18n.subscribe(function () { syncHud(); if (!shell.isPlaying()) shell.refreshOverlay && shell.refreshOverlay(); });

        syncDebugBtn();
        resetSession();
        render();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
