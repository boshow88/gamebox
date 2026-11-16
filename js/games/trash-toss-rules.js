/* Trash Toss: deterministic ballistics, scene geometry, CPU intent and match rules. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.TrashTossRules = factory();
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    const WORLD = Object.freeze({ width: 960, height: 540, floor: 466, binFloor: 8, gravity: 700, step: 1 / 240, chargeSeconds: 1.3, turnSeconds: 12, resultSeconds: .45, debrisLimit: 40 });
    const ITEMS = Object.freeze({
        paper: Object.freeze({ grams: 8, drag: .14, wind: 1, speed: 1, radius: 8 }),
        can: Object.freeze({ grams: 16, drag: .07, wind: .85, speed: .96, radius: 9 }),
        bottle: Object.freeze({ grams: 30, drag: .12, wind: 1.3, speed: .94, radius: 11 }),
        cup: Object.freeze({ grams: 12, drag: .18, wind: 1.1, speed: .98, radius: 10 }),
        carton: Object.freeze({ grams: 45, drag: .12, wind: 1.3, speed: .92, radius: 13 }),
        peel: Object.freeze({ grams: 55, drag: .10, wind: .8, speed: .91, radius: 11 }),
        apple: Object.freeze({ grams: 80, drag: .06, wind: .7, speed: .90, radius: 10 }),
        book: Object.freeze({ grams: 280, drag: .05, wind: 1.1, speed: .87, radius: 12 }),
        screwdriver: Object.freeze({ grams: 120, drag: .08, wind: .7, speed: 1, radius: 12 }),
        screw: Object.freeze({ grams: 6, drag: .04, wind: .35, speed: 1.10, radius: 6 }),
        wrench: Object.freeze({ grams: 350, drag: .07, wind: .8, speed: .88, radius: 14 }),
        nut: Object.freeze({ grams: 12, drag: .05, wind: .4, speed: 1.05, radius: 8 }),
        washer: Object.freeze({ grams: 8, drag: .035, wind: .65, speed: 1.07, radius: 7 }),
        bolt: Object.freeze({ grams: 35, drag: .05, wind: .45, speed: 1.02, radius: 9 }),
        offcut: Object.freeze({ grams: 180, drag: .10, wind: .9, speed: .94, radius: 13 }),
        tape: Object.freeze({ grams: 90, drag: .14, wind: 1.1, speed: .96, radius: 11 }),
        laptop: Object.freeze({ grams: 1400, drag: .08, wind: 1.2, speed: .88, radius: 17 }),
        mouse: Object.freeze({ grams: 90, drag: .10, wind: .9, speed: .95, radius: 11 }),
        folder: Object.freeze({ grams: 240, drag: .12, wind: 1.2, speed: .91, radius: 13 }),
        voodoo: Object.freeze({ grams: 66, drag: .11, wind: 1.1, speed: .98, radius: 12 }),
        keyboard: Object.freeze({ grams: 420, drag: .10, wind: 1.1, speed: .89, radius: 15 }),
        badge: Object.freeze({ grams: 8, drag: .07, wind: 1.1, speed: 1.06, radius: 8 }),
        stapler: Object.freeze({ grams: 180, drag: .07, wind: .8, speed: .94, radius: 11 }),
        overtime: Object.freeze({ grams: 300, drag: .08, wind: .9, speed: .91, radius: 13 }),
        sock: Object.freeze({ grams: 25, drag: .13, wind: 1.4, speed: .98, radius: 10 }),
        remote: Object.freeze({ grams: 100, drag: .09, wind: .9, speed: .96, radius: 11 }),
        block: Object.freeze({ grams: 12, drag: .06, wind: .6, speed: 1.04, radius: 8 }),
        duck: Object.freeze({ grams: 55, drag: .13, wind: 1.2, speed: .95, radius: 12 }),
        pacifier: Object.freeze({ grams: 18, drag: .09, wind: 1, speed: 1.02, radius: 8 }),
        plush: Object.freeze({ grams: 180, drag: .14, wind: 1.3, speed: .90, radius: 15 }),
        slipper: Object.freeze({ grams: 160, drag: .10, wind: 1, speed: .94, radius: 13 }),
        robot: Object.freeze({ grams: 360, drag: .07, wind: .9, speed: .92, radius: 14 }),
        leaf: Object.freeze({ grams: 6, drag: .035, wind: 1.4, speed: 1.09, radius: 10 }),
        frisbee: Object.freeze({ grams: 110, drag: .10, wind: 1.2, speed: .98, radius: 13 }),
        shuttlecock: Object.freeze({ grams: 5, drag: .022, wind: 1.1, speed: 1.10, radius: 9 }),
        dogbag: Object.freeze({ grams: 45, drag: .10, wind: .9, speed: .97, radius: 10 }),
        seedbag: Object.freeze({ grams: 70, drag: .13, wind: 1.2, speed: .95, radius: 12 }),
        gnome: Object.freeze({ grams: 650, drag: .07, wind: 1, speed: .90, radius: 15 }),
        helmet: Object.freeze({ grams: 320, drag: .09, wind: 1, speed: .95, radius: 16 }),
        brick: Object.freeze({ grams: 1800, drag: .05, wind: .7, speed: .85, radius: 17 }),
    });
    const STANDARD_BINS = Object.freeze([{ id: 'large', x: 620, width: 100, height: 82, points: 10 }, { id: 'small', x: 824, width: 62, height: 110, points: 25 }]);
    const SCENES = Object.freeze({
        office: Object.freeze({ width: 960, viewWidth: 840, phoneWidth: 720, launchScale: 1, launchY: 102, outdoor: false, windScale: .65, thrower: 'employee', bins: STANDARD_BINS,
            items: Object.freeze(['paper', 'cup', 'laptop', 'mouse', 'folder', 'voodoo', 'keyboard', 'badge', 'stapler', 'overtime']) }),
        living: Object.freeze({ width: 600, viewWidth: 600, phoneWidth: 600, launchScale: .72, launchY: 76, outdoor: false, windScale: .35, thrower: 'child',
            bins: Object.freeze([{ id: 'large', x: 365, width: 100, height: 70, points: 10 }, { id: 'small', x: 500, width: 66, height: 88, points: 25 }]),
            items: Object.freeze(['carton', 'book', 'sock', 'remote', 'block', 'duck', 'pacifier', 'plush', 'slipper', 'robot']) }),
        park: Object.freeze({ width: 960, viewWidth: 840, phoneWidth: 720, launchScale: 1, launchY: 102, outdoor: true, windScale: 1, thrower: 'grandma', bins: STANDARD_BINS,
            items: Object.freeze(['can', 'bottle', 'peel', 'apple', 'leaf', 'frisbee', 'shuttlecock', 'dogbag', 'seedbag', 'gnome']) }),
        construction: Object.freeze({ width: 2400, viewWidth: 960, phoneWidth: 720, launchScale: 1.72, launchY: 102, outdoor: true, windScale: 1, thrower: 'foreman',
            bins: Object.freeze([{ id: 'large', x: 880, width: 190, height: 100, points: 5, metal: true },
                { id: 'drum-10', x: 1220, width: 160, height: 106, points: 10, metal: true },
                { id: 'drum-15', x: 1600, width: 135, height: 112, points: 15, metal: true },
                { id: 'drum-20', x: 1970, width: 110, height: 118, points: 20, metal: true },
                { id: 'small', x: 2240, width: 90, height: 124, points: 30, metal: true }]),
            items: Object.freeze(['screwdriver', 'screw', 'wrench', 'nut', 'washer', 'bolt', 'offcut', 'tape', 'helmet', 'brick']) }),
    });
    function fieldWidth(scene) { return scene.width || SCENES[scene.scene].width; }
    const WEATHER = Object.freeze({ calm: { wind: 8, rain: 0 }, breeze: { wind: 28, rain: 0 },
        strong: { wind: 68, rain: 0 }, drizzle: { wind: 18, rain: .22 }, rain: { wind: 22, rain: .7 }, storm: { wind: 48, rain: 1.6 } });
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function random(seed) {
        let value = seed >>> 0;
        return function () {
            value = (value + 0x6D2B79F5) >>> 0;
            let t = Math.imul(value ^ value >>> 15, 1 | value);
            t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    function config(input) {
        const c = input || {};
        return { mode: ['practice', 'cpu', 'local', 'qa'].includes(c.mode) ? c.mode : 'practice',
            scene: Object.hasOwn(SCENES, c.scene) ? c.scene : 'office',
            difficulty: ['easy', 'normal', 'hard'].includes(c.difficulty) ? c.difficulty : 'normal',
            item: ITEMS[c.item] ? c.item : 'mixed' };
    }
    function chargePower(seconds) {
        const cycle = Math.max(0, seconds) / WORLD.chargeSeconds % 2;
        return (cycle <= 1 ? cycle : 2 - cycle) * 100;
    }
    function scenario(settings, round, seed) {
        const c = config(settings), rng = random((seed + round * 7919) >>> 0);
        const layout = SCENES[c.scene], order = layout.items.slice(), orderRng = random(seed ^ 0x71ab);
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(orderRng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        const item = c.mode === 'practice' && c.item !== 'mixed' ? c.item : order[(round - 1) % order.length];
        const weatherOrder = layout.outdoor ? ['calm', 'breeze', 'strong', 'drizzle', 'rain', 'storm', 'rain', 'drizzle'] : ['calm', 'breeze'];
        const weather = weatherOrder[(round - 1 + (seed >>> 0) % weatherOrder.length) % weatherOrder.length];
        const strength = WEATHER[weather].wind * layout.windScale;
        return { scene: c.scene, width: layout.width, launchScale: layout.launchScale, launchY: layout.launchY, thrower: layout.thrower, item, grams: Math.round(ITEMS[item].grams * (.85 + rng() * .30)), weather,
            rain: WEATHER[weather].rain, wind: Math.round((rng() < .5 ? -1 : 1) * strength * (.75 + rng() * .25)),
            phase: random(seed ^ 0x182f)() * Math.PI * 2,
            bins: layout.bins.map(bin => Object.assign({}, bin)) };
    }
    function properties(scene) {
        const item = ITEMS[scene.item], grams = scene.grams || item.grams;
        return Object.assign({}, item, { grams, mass: grams / 8, speed: item.speed * Math.sqrt(item.grams / grams) });
    }
    // A session clock drives actors independently of rounds, releases and device handoff.
    function obstacles(scene, time) {
        if (scene.qa) return [];
        const janitor = cleaner(scene, time), extra = janitor ? [janitor] : [];
        const phase = scene.phase;
        if (scene.scene === 'living') {
            const mother = { id: 'mother', x: 330 + Math.sin(time * .38 + phase) * 170, y: 0, width: 38, height: 130 };
            return [...extra, mother, { id: 'baby', x: 205 + Math.sin(time * .52 + phase) * 145, y: 0, width: 46, height: 38 },
                { id: 'rat', x: 320 + Math.sin(time * .95 + phase) * 205, y: 195 + Math.sin(time * 1.4 + phase) * 54, width: 37, height: 20 },
                { id: 'laundry', x: mother.x + 38, y: 83, width: 46, height: 44 }];
        }
        if (scene.scene === 'construction') {
            const worker = { id: 'worker', x: 610 + Math.pow((Math.sin(time * .22 + phase) + 1) / 2, 2) * 740, y: 0, width: 36, height: 130 };
            const far = { id: 'worker-far', x: 1620 + Math.sin(time * .18 + phase) * 360, y: 0, width: 36, height: 130 };
            return [...extra, worker, far, { id: 'planks', x: worker.x + 26, y: 128, width: 94, height: 24 },
                { id: 'wheelbarrow', x: far.x + 38, y: 0, width: 64, height: 50 }];
        }
        const human = { id: scene.scene === 'office' ? 'boss' : 'walker',
            x: 280 + Math.pow((Math.sin(time * .28 + phase) + 1) / 2, 2) * 500, y: 0, width: 35, height: 112 };
        const out = [...extra, human];
        if (scene.scene === 'office') out.push({ id: 'files', x: human.x + 26, y: 95, width: 58, height: 66 });
        else {
            out.push({ id: 'cart', x: human.x + 28, y: 0, width: 48, height: 50 });
            if (scene.rain) out.push({ id: 'umbrella', x: human.x, y: 165, width: 118, height: 18 });
            const clock = time + phase * 2, pass = Math.floor(clock / 24), flight = clock % 24;
            if (flight < 8) out.push({ id: 'bird', x: 1040 - flight * 140,
                y: [130, 300, 390][pass % 3] + Math.sin(flight * .85 + phase) * 55, width: 28, height: 16 });
        }
        return out;
    }
    function launch(scene, angle, power, releaseAt) {
        const item = properties(scene), radians = clamp(angle, 15, 80) * Math.PI / 180;
        const speed = (100 + clamp(power, 0, 100) * 4.8) * item.speed * 1.64 * (scene.launchScale || SCENES[scene.scene].launchScale);
        return { x: 96, y: scene.launchY || SCENES[scene.scene].launchY, vx: Math.cos(radians) * speed, vy: Math.sin(radians) * speed,
            time: releaseAt || 0, age: 0, rotation: 0, radius: item.radius, item: scene.item, grams: item.grams,
            rim: false, blocked: false, quiet: 0, supported: false, supportAt: -1e9, hits: [], entries: {}, resting: false, result: null, crossing: null };
    }
    function acceleration(scene, ball) {
        const item = properties(Object.assign({}, scene, { item: ball.item, grams: ball.grams }));
        const drag = item.drag * (1 + (scene.rain || 0) * 1.8) * 1.64 / item.mass;
        const wind = scene.wind * 2.7 * item.wind / item.mass;
        return { x: wind - drag * ball.vx, y: -WORLD.gravity - drag * ball.vy, wind, drag };
    }
    function intersects(ball, box) {
        const x = clamp(ball.x, box.x - box.width / 2, box.x + box.width / 2);
        const y = clamp(ball.y, box.y, box.y + box.height);
        return Math.hypot(ball.x - x, ball.y - y) < ball.radius;
    }
    function wall(ball, box, restitution, rim) {
        if (!intersects(ball, box)) return false;
        const x = clamp(ball.x, box.x - box.width / 2, box.x + box.width / 2);
        const y = clamp(ball.y, box.y, box.y + box.height);
        let nx = ball.x - x, ny = ball.y - y, distance = Math.hypot(nx, ny);
        if (distance < 1e-8) {
            const sides = [
                { d: ball.x - (box.x - box.width / 2), nx: -1, ny: 0 },
                { d: box.x + box.width / 2 - ball.x, nx: 1, ny: 0 },
                { d: ball.y - box.y, nx: 0, ny: -1 },
                { d: box.y + box.height - ball.y, nx: 0, ny: 1 },
            ].sort((a, b) => a.d - b.d);
            nx = sides[0].nx; ny = sides[0].ny; distance = -sides[0].d;
        } else { nx /= distance; ny /= distance; }
        ball.x += nx * (ball.radius - distance + 0.02);
        ball.y += ny * (ball.radius - distance + 0.02);
        const toward = ball.vx * nx + ball.vy * ny;
        const bounce = 1 + (restitution == null ? .42 : restitution);
        if (toward < 0) { ball.vx -= bounce * toward * nx; ball.vy -= bounce * toward * ny; }
        if (ny > .5 && rim !== false) ball.supported = true;
        if (rim !== false) ball.rim = true;
        return true;
    }
    function collideDebris(ball, debris) {
        for (const scrap of debris) {
            if (scrap === ball || scrap.removed) continue;
            let nx = ball.x - scrap.x, ny = ball.y - scrap.y;
            const distance = Math.hypot(nx, ny), overlap = ball.radius + scrap.radius - distance;
            if (overlap <= 0) continue;
            if (distance < .001) { nx = 0; ny = 1; } else { nx /= distance; ny /= distance; }
            ball.x += nx * (overlap + .02); ball.y += ny * (overlap + .02);
            const toward = ball.vx * nx + ball.vy * ny;
            if (toward < 0) { ball.vx -= 1.25 * toward * nx; ball.vy -= 1.25 * toward * ny; }
            if (ny > .5) { ball.vx *= .8; ball.supported = true; }
            ball.blocked = true;
        }
    }
    function tick(scene, ball, dt, debris, aftermath) {
        const previous = { x: ball.x, y: ball.y }, force = acceleration(scene, ball);
        ball.supported = false;
        ball.time += dt; ball.age += dt;
        ball.vx += force.x * dt;
        ball.vy += force.y * dt;
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        ball.rotation += ball.vx * dt / 40;
        const bins = scene.freeFlight ? [] : scene.bins;
        // Remember an approach from above even when the object first touches the rim.
        // Collision correction can move it through the opening on a later step.
        if (!aftermath) for (const bin of bins) {
            const level = bin.height + ball.radius;
            if (ball.vy < 0 && previous.y >= level && ball.y < level) {
                const ratio = (previous.y - level) / (previous.y - ball.y);
                const x = previous.x + (ball.x - previous.x) * ratio;
                ball.crossing = x;
                if (Math.abs(x - bin.x) <= bin.width / 2 + ball.radius) ball.entries[bin.id] = true;
            }
        }
        for (const box of aftermath ? [] : obstacles(scene, ball.time)) {
            if (wall(ball, box, .35, false) && !ball.hits.includes(box.id)) ball.hits.push(box.id);
        }
        collideDebris(ball, debris);
        for (const bin of bins) {
            for (const side of [-1, 1]) wall(ball, { x: bin.x + side * (bin.width / 2 - 3), y: 0, width: 6, height: bin.height });
        }
        if (!aftermath) for (const bin of bins) {
            const level = bin.height + ball.radius;
            if (ball.entries[bin.id]) {
                if (ball.vy < 0 && ball.y <= level && Math.abs(ball.x - bin.x) <= bin.width / 2 - 6 - ball.radius) {
                    const penalty = ball.hits.length ? -5 : 0;
                    ball.result = { kind: 'basket', bin: bin.id, points: bin.points + penalty, basketPoints: bin.points, penalty }; return;
                }
                if (Math.abs(ball.x - bin.x) > bin.width / 2 + ball.radius || ball.y > level) delete ball.entries[bin.id];
            }
        }
        const containingBin = !scene.freeFlight && scene.bins.find(bin => Math.abs(ball.x - bin.x) <= bin.width / 2 - 6 - ball.radius && ball.y < bin.height);
        const floor = (containingBin ? WORLD.binFloor : 0) + ball.radius;
        if (ball.y <= floor) {
            ball.y = floor; ball.supported = true;
            if (ball.vy < 0) { ball.vy = Math.abs(ball.vy) < 45 ? 0 : -ball.vy * .2; ball.vx *= .65; }
            if (!ball.result) ball.result = missResult(ball);
        }
        if ((!scene.freeFlight && (ball.x < -40 || ball.x > fieldWidth(scene) + 40)) || ball.age >= (scene.freeFlight ? 20 : scene.scene === 'construction' ? 6 : 5) && !aftermath) {
            if (!ball.result) ball.result = missResult(ball);
            ball.removed = true;
        }
        if (ball.supported) ball.supportAt = ball.time;
        ball.quiet = ball.time - ball.supportAt < .06 && Math.hypot(ball.vx, ball.vy) < 18 ? ball.quiet + dt : 0;
        if (ball.quiet >= .12) {
            if (!ball.result) ball.result = missResult(ball);
            ball.resting = true; ball.vx = 0; ball.vy = 0;
        }
    }
    function missResult(ball) {
        return { kind: ball.hits.length ? 'obstacle' : 'miss', obstacle: ball.hits[0], points: ball.hits.length ? -5 : 0, rim: ball.rim, blocked: ball.blocked };
    }
    function advance(scene, ball, dt, debris, aftermath) {
        // The shell supplies 1/60 s; four small steps prevent thin-rim tunnelling.
        const steps = Math.max(1, Math.ceil(dt / WORLD.step));
        for (let i = 0; i < steps && !ball.resting && !ball.removed && (!ball.result || aftermath); i++) tick(scene, ball, dt / steps, debris || [], aftermath);
        return ball;
    }
    function simulate(scene, angle, power, releaseAt, debris) {
        const ball = launch(scene, angle, power, releaseAt);
        while (!ball.result) advance(scene, ball, 1 / 60, debris);
        return ball;
    }
    function traceFlight(scene, angle, power, options) {
        const environment = Object.assign({}, scene, { qa: true, freeFlight: options && options.freeFlight === false ? false : true });
        const ball = launch(environment, angle, power, 0), initial = Object.assign({}, ball, { entries: {}, hits: [] });
        const points = [{ x: ball.x, y: ball.y }];
        let peak = ball.y;
        while (!ball.result) {
            advance(environment, ball, 1 / 60);
            points.push({ x: ball.x, y: ball.y }); peak = Math.max(peak, ball.y);
        }
        return { initial, ball, points, peak, range: ball.x - initial.x, seconds: ball.age, force: acceleration(environment, initial) };
    }
    function binContents(scene, debris) {
        return Object.fromEntries(scene.bins.map(bin => {
            const inside = debris.filter(b => !b.removed && Math.abs(b.x - bin.x) <= bin.width / 2 - 6 && b.y <= bin.height);
            return [bin.id, { count: inside.length, fill: Math.min(1, inside.reduce((top, b) => Math.max(top, b.y + b.radius), 0) / bin.height) }];
        }));
    }
    function createCleaning() { return { active: null, readyAt: 0 }; }
    function cleaner(scene, time) {
        const job = scene.cleaning && scene.cleaning.active;
        if (!job || time < job.startAt || time >= job.endAt) return null;
        const progress = time < job.arriveAt ? (time - job.startAt) / job.travel :
            time > job.leaveAt ? 1 - (time - job.leaveAt) / job.travel : 1;
        return { id: 'cleaner', x: job.from + (job.to - job.from) * clamp(progress, 0, 1),
            y: 0, width: 36, height: 130, working: time >= job.arriveAt && time < job.leaveAt, carrying: time >= job.clearAt };
    }
    function advanceCleaning(scene, state, debris, time) {
        if (scene.qa) return;
        const job = state.active;
        if (job) {
            if (!job.cleared && time >= job.clearAt) {
                const bin = scene.bins.find(b => b.id === job.bin);
                for (const scrap of debris) if (Math.abs(scrap.x - bin.x) <= bin.width / 2 - 6 && scrap.y <= bin.height) scrap.removed = true;
                job.cleared = true;
            }
            if (time >= job.endAt) { state.active = null; state.readyAt = time + 3; }
            return;
        }
        if (time < state.readyAt) return;
        const contents = binContents(scene, debris.filter(b => b.resting));
        const full = scene.bins.find(b => contents[b.id].count >= 3 && (contents[b.id].fill >= .72 || contents[b.id].count >= 10));
        if (!full) return;
        const from = full.x < fieldWidth(scene) / 2 ? -50 : fieldWidth(scene) + 50;
        const to = full.x + (from < 0 ? -1 : 1) * (full.width / 2 + 30), travel = Math.abs(to - from) / 220;
        const startAt = time + 1, arriveAt = startAt + travel, clearAt = arriveAt + 1.3, leaveAt = clearAt + .8;
        state.active = { bin: full.id, points: full.points, from, to, travel, startAt, arriveAt, clearAt, leaveAt, endAt: leaveAt + travel, cleared: false };
    }
    function cpuPlan(scene, difficulty, seed, worldTime, debris) {
        const rng = random(seed), target = difficulty === 'easy' ? scene.bins[0] : rng() < .25 ? scene.bins[Math.floor(rng() * scene.bins.length)] : scene.bins[scene.bins.length - 1];
        let best = null;
        function evaluate(angle, power, releaseAt) {
                const shot = simulate(scene, angle, power, (worldTime || 0) + releaseAt, debris);
                const value = shot.result.kind === 'basket' ? (shot.result.bin === target.id ? 1000 : 500) - Math.abs(shot.crossing - scene.bins.find(bin => bin.id === shot.result.bin).x) * 2 :
                    -Math.abs((shot.crossing == null ? shot.x : shot.crossing) - target.x) - (shot.result.kind === 'obstacle' ? 400 : 0);
                if (!best || value > best.value) best = { angle, power, releaseAt, value };
        }
        for (const at of [1.4, 2.2]) for (let angle = 30; angle <= 78; angle += 6) for (let power = 35; power <= 100; power += 5) evaluate(angle, power, at);
        const coarse = Object.assign({}, best);
        for (let a = -4; a <= 4; a += 2) for (let p = -4; p <= 4; p += 2) evaluate(clamp(coarse.angle + a, 15, 80), clamp(coarse.power + p, 0, 100), coarse.releaseAt);
        const error = { easy: [7, 10], normal: [3, 4], hard: [0.8, 1.2] }[difficulty] || [3, 4];
        // One imperfect input, with no post-launch correction or retry.
        return { angle: clamp(best.angle + (rng() * 2 - 1) * error[0], 15, 80),
            power: clamp(best.power + (rng() * 2 - 1) * error[1], 1, 100), releaseAt: best.releaseAt };
    }
    function createMatch(settings, seed) {
        return { config: config(settings), seed: seed >>> 0, round: 1, turn: 0, active: 0,
            scores: [0, 0], history: [], over: false, winner: null };
    }
    function settle(match, result, controls) {
        if (match.over) return match;
        const next = Object.assign({}, match, { scores: match.scores.slice(), history: match.history.slice() });
        next.scores[next.active] += result.points;
        next.history.push({ round: next.round, player: next.active, result: Object.assign({}, result), controls: Object.assign({}, controls) });
        if (next.config.mode === 'practice' || next.config.mode === 'qa') { next.round++; return next; }
        if (next.turn === 0) { next.turn = 1; next.active = 1 - next.active; return next; }
        if (next.round >= 5 && (next.scores[0] !== next.scores[1] || next.round >= 8)) {
            next.over = true; next.winner = next.scores[0] === next.scores[1] ? null : next.scores[0] > next.scores[1] ? 0 : 1;
        } else {
            next.round++; next.turn = 0; next.active = 0;
        }
        return next;
    }
    return { WORLD, ITEMS, SCENES, WEATHER, fieldWidth, createCleaning, advanceCleaning, cleaner, clamp, random, config, chargePower, scenario, properties, obstacles, launch, acceleration, advance, simulate, traceFlight, binContents, cpuPlan, createMatch, settle };
});
