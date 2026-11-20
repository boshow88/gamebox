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
        receipt: Object.freeze({ grams: 4, drag: .025, wind: 1.1, speed: 1.08, radius: 8 }),
        spraycap: Object.freeze({ grams: 10, drag: .08, wind: .7, speed: 1.02, radius: 8 }),
        cassette: Object.freeze({ grams: 65, drag: .09, wind: .9, speed: .97, radius: 12 }),
        bottlecap: Object.freeze({ grams: 3, drag: .02, wind: .6, speed: 1.1, radius: 6 }),
        wristband: Object.freeze({ grams: 20, drag: .11, wind: 1.1, speed: 1, radius: 9 }),
        padlock: Object.freeze({ grams: 220, drag: .06, wind: .6, speed: .92, radius: 11 }),
        skatewheel: Object.freeze({ grams: 70, drag: .07, wind: .6, speed: .98, radius: 11 }),
        noodlebox: Object.freeze({ grams: 40, drag: .12, wind: 1.2, speed: .97, radius: 12 }),
        vinyl: Object.freeze({ grams: 150, drag: .11, wind: 1.3, speed: .94, radius: 14 }),
        sneaker: Object.freeze({ grams: 300, drag: .10, wind: .9, speed: .91, radius: 15 }),
    });
    // 所有地圖共用的清潔員設定；行走路線依滿桶位置自動安排。
    const CLEANER_SETTINGS = Object.freeze({
        speed: 220, entryMargin: 50, standOff: 30,
        warningSeconds: 1, clearSeconds: 1.3, exitDelaySeconds: .8, cooldownSeconds: 3,
        width: 36, height: 130,
    });
    // bins 的 x、actors 的 minX/maxX 都是地圖絕對座標（小地圖刻度 + 96）。
    // actors：speed 越大往返越快；y 是離地高度，minY/maxY 控制上下活動範圍。
    // follow 指定清單中前面的人物；offsetX 是沿人物面向方向的水平距離。
    // easing: 'quadratic' 保留原本在左端較慢的步調，不影響 minX/maxX 的意義。
    const SCENES = Object.freeze({
        office: Object.freeze({ width: 1080, viewWidth: 840, phoneWidth: 720, launchScale: 1, launchY: 102, outdoor: false, windScale: .65, thrower: 'employee',
            bins: Object.freeze([
                { id: 'large', x: 520, width: 100, height: 82, points: 10 },
                { id: 'medium', x: 760, width: 82, height: 96, points: 15 },
                { id: 'small', x: 1000, width: 74, height: 115, points: 25 },
            ]),
            actors: Object.freeze([
                { id: 'boss', // 主管
                    minX: 280, maxX: 780, speed: .28, easing: 'quadratic',
                    y: 0, width: 35, height: 112 },
                { id: 'files', // 主管手中的文件
                    follow: 'boss', offsetX: 26,
                    y: 95, width: 58, height: 66 },
            ]),
            items: Object.freeze(['paper', 'cup', 'laptop', 'mouse', 'folder', 'voodoo', 'keyboard', 'badge', 'stapler', 'overtime']) }),
        living: Object.freeze({ width: 720, viewWidth: 720, phoneWidth: 720, launchScale: 1, launchY: 76, outdoor: false, windScale: .35, thrower: 'child',
            bins: Object.freeze([
                { id: 'large', x: 400, width: 100, height: 70, points: 10 },
                { id: 'small', x: 580, width: 80, height: 88, points: 25 },
            ]),
            actors: Object.freeze([
                { id: 'mother', // 媽媽
                    minX: 256, maxX: 736, speed: .27,
                    y: 0, width: 38, height: 130 },
                { id: 'baby', // 寶寶
                    minX: 130, maxX: 650, speed: .16,
                    y: 0, width: 46, height: 38 },
                { id: 'parrot', // 鸚鵡
                    minX: 150, maxX: 690, speed: .72,
                    minY: 141, maxY: 249, verticalSpeed: 1.4,
                    width: 37, height: 28 },
                { id: 'laundry', // 媽媽手中的洗衣籃
                    follow: 'mother', offsetX: 38,
                    y: 83, width: 46, height: 44 },
            ]),
            items: Object.freeze(['carton', 'book', 'sock', 'remote', 'block', 'duck', 'pacifier', 'plush', 'slipper', 'robot']) }),
        park: Object.freeze({ width: 1080, viewWidth: 840, phoneWidth: 720, launchScale: 1, launchY: 102, outdoor: true, windScale: 1, thrower: 'grandma',
            bins: Object.freeze([
                { id: 'large', x: 520, width: 110, height: 82, points: 10, style: 'park' },
                { id: 'medium', x: 720, width: 90, height: 96, points: 15, style: 'park' },
                { id: 'small', x: 920, width: 72, height: 115, points: 25, style: 'park' },
            ]),
            actors: Object.freeze([
                { id: 'walker', // 散步路人
                    minX: 280, maxX: 780, speed: .28, easing: 'quadratic',
                    y: 0, width: 35, height: 112 },
                { id: 'cart', // 路人推車
                    follow: 'walker', offsetX: 28,
                    y: 0, width: 48, height: 50 },
                { id: 'umbrella', // 下雨時才出現的雨傘
                    follow: 'walker', offsetX: 0, followFacing: false, rainOnly: true,
                    y: 165, width: 118, height: 18 },
                { id: 'bird', // 每隔 interval 秒飛過，飛行 duration 秒
                    motion: 'flyby', fromX: 1040, toX: -80, duration: 8, interval: 24, phaseScale: 2,
                    levels: Object.freeze([130, 300, 390]), verticalAmplitude: 55, verticalSpeed: .85,
                    width: 28, height: 16 },
            ]),
            items: Object.freeze(['can', 'bottle', 'peel', 'apple', 'leaf', 'frisbee', 'shuttlecock', 'dogbag', 'seedbag', 'gnome']) }),
        arena: Object.freeze({ width: 1320, viewWidth: 840, phoneWidth: 720, launchScale: 1, launchY: 102, outdoor: true, windScale: .7, thrower: 'skater',
            bins: Object.freeze([
                { id: 'large', x: 350, width: 96, height: 66, points: 5, metal: true },
                { id: 'shelf-15', x: 475, y: 100, width: 86, height: 68, points: 15, metal: true },
                { id: 'floor-10', x: 585, width: 90, height: 72, points: 10, metal: true },
                { id: 'high-35', x: 650, y: 220, width: 70, height: 70, points: 35, metal: true },
                { id: 'shelf-25', x: 735, y: 105, width: 74, height: 76, points: 25, metal: true },
                { id: 'floor-20', x: 820, width: 66, height: 84, points: 20, metal: true },
                { id: 'high-50', x: 850, y: 270, width: 60, height: 66, points: 50, metal: true },
                { id: 'small', x: 920, y: 145, width: 56, height: 70, points: 40, metal: true },
                { id: 'rear-floor', x: 1005, width: 108, height: 66, points: 30, metal: true },
                { id: 'rear-mid', x: 1090, y: 145, width: 100, height: 60, points: 45, metal: true },
                { id: 'deep-high', x: 1070, y: 300, width: 110, height: 58, points: 70, metal: true },
                { id: 'deep-mid', x: 1220, y: 25, width: 104, height: 68, points: 55, metal: true },
            ]),
            actors: Object.freeze([]), // 競技場只有依滿桶派出的清潔員。
            items: Object.freeze(['receipt', 'spraycap', 'cassette', 'bottlecap', 'wristband', 'padlock', 'skatewheel', 'noodlebox', 'vinyl', 'sneaker']) }),
        construction: Object.freeze({ width: 1440, viewWidth: 960, phoneWidth: 720, launchScale: 1, launchY: 102, outdoor: true, windScale: 1, thrower: 'foreman',
            bins: Object.freeze([
                { id: 'large', x: 520, width: 152, height: 100, points: 5, metal: true },
                { id: 'drum-10', x: 730, width: 144, height: 106, points: 10, metal: true },
                { id: 'drum-15', x: 940, width: 136, height: 112, points: 15, metal: true },
                { id: 'drum-20', x: 1150, width: 128, height: 118, points: 20, metal: true },
                { id: 'small', x: 1360, width: 120, height: 72, points: 30, metal: true },
            ]),
            actors: Object.freeze([
                { id: 'worker', // 搬木板的工人
                    minX: 280, maxX: 680, speed: .22, easing: 'quadratic',
                    y: 0, width: 36, height: 130 },
                { id: 'worker-far', // 後方推車工人
                    minX: 660, maxX: 1020, speed: .18,
                    y: 0, width: 36, height: 130 },
                { id: 'planks', // 工人扛的木板
                    follow: 'worker', offsetX: 26,
                    y: 128, width: 94, height: 24 },
                { id: 'wheelbarrow', // 工地推車
                    follow: 'worker-far', offsetX: 38,
                    y: 0, width: 64, height: 50 },
            ]),
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
        return { mode: ['practice', 'cpu', 'local', 'online', 'qa'].includes(c.mode) ? c.mode : 'practice',
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
        // Reserve the former weight draw so seeded wind keeps its existing values.
        rng();
        return { scene: c.scene, width: layout.width, launchScale: layout.launchScale, launchY: layout.launchY, thrower: layout.thrower, item, grams: ITEMS[item].grams, weather,
            rain: WEATHER[weather].rain, wind: Math.round((rng() < .5 ? -1 : 1) * strength * (.75 + rng() * .25)),
            phase: random(seed ^ 0x182f)() * Math.PI * 2,
            bins: layout.bins.map(bin => Object.assign({}, bin)) };
    }
    function properties(scene) {
        const item = ITEMS[scene.item], grams = scene.grams || item.grams;
        return Object.assign({}, item, { grams, mass: grams / 8, speed: item.speed * Math.sqrt(item.grams / grams) });
    }
    function actorPosition(actor, scene, time, owners) {
        if (actor.rainOnly && !scene.rain) return null;
        let x, y = actor.y || 0, direction;
        if (actor.follow) {
            const owner = owners.get(actor.follow);
            if (!owner) return null;
            x = owner.x + actor.offsetX * owner.direction;
            if (actor.followFacing !== false) direction = owner.direction;
        } else if (actor.motion === 'flyby') {
            const clock = time + scene.phase * actor.phaseScale;
            const pass = Math.floor(clock / actor.interval), flight = clock % actor.interval;
            if (flight >= actor.duration) return null;
            x = actor.fromX + flight * ((actor.toX - actor.fromX) / actor.duration);
            direction = actor.toX >= actor.fromX ? 1 : -1;
            y = actor.levels[pass % actor.levels.length] + Math.sin(flight * actor.verticalSpeed + scene.phase) * actor.verticalAmplitude;
        } else {
            const phase = time * actor.speed + scene.phase, wave = Math.sin(phase);
            x = actor.easing === 'quadratic' ? actor.minX + Math.pow((wave + 1) / 2, 2) * (actor.maxX - actor.minX) :
                (actor.minX + actor.maxX) / 2 + wave * ((actor.maxX - actor.minX) / 2);
            direction = Math.cos(phase) >= 0 ? 1 : -1;
            if (actor.minY != null) y = (actor.minY + actor.maxY) / 2 + Math.sin(time * actor.verticalSpeed + scene.phase) * ((actor.maxY - actor.minY) / 2);
        }
        const box = { id: actor.id, x, y, width: actor.width, height: actor.height };
        if (direction != null) box.direction = direction;
        return box;
    }
    // A session clock drives actors independently of rounds, releases and device handoff.
    function obstacles(scene, time) {
        if (scene.qa) return [];
        const janitor = cleaner(scene, time), out = janitor ? [janitor] : [], owners = new Map();
        for (const actor of SCENES[scene.scene].actors) {
            const box = actorPosition(actor, scene, time, owners);
            if (box) { out.push(box); owners.set(box.id, box); }
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
        if (ny > .5 && (rim !== false || box.support)) ball.supported = true;
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
            const level = (bin.y || 0) + bin.height + ball.radius;
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
            for (const side of [-1, 1]) wall(ball, { x: bin.x + side * (bin.width / 2 - 3), y: bin.y || 0, width: 6, height: bin.height });
            if (bin.y) wall(ball, { x: bin.x, y: bin.y, width: bin.width, height: WORLD.binFloor, support: true }, .2, false);
        }
        if (!aftermath) for (const bin of bins) {
            const level = (bin.y || 0) + bin.height + ball.radius;
            if (ball.entries[bin.id]) {
                if (ball.vy < 0 && ball.y + ball.radius <= (bin.y || 0) + bin.height && Math.abs(ball.x - bin.x) <= bin.width / 2 - 6 - ball.radius) {
                    const penalty = ball.hits.length ? -5 : 0;
                    ball.result = { kind: 'basket', bin: bin.id, points: bin.points + penalty, basketPoints: bin.points, penalty }; return;
                }
                if (Math.abs(ball.x - bin.x) > bin.width / 2 + ball.radius || ball.y > level) delete ball.entries[bin.id];
            }
        }
        const containingBin = !scene.freeFlight && scene.bins.find(bin => Math.abs(ball.x - bin.x) <= bin.width / 2 - 6 - ball.radius && ball.y >= (bin.y || 0) && ball.y < (bin.y || 0) + bin.height);
        const floor = (containingBin ? (containingBin.y || 0) + WORLD.binFloor : 0) + ball.radius;
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
            const inside = debris.filter(b => !b.removed && Math.abs(b.x - bin.x) <= bin.width / 2 - 6 && b.y >= (bin.y || 0) && b.y <= (bin.y || 0) + bin.height);
            return [bin.id, { count: inside.length, fill: Math.min(1, inside.reduce((top, b) => Math.max(top, b.y + b.radius - (bin.y || 0)), 0) / bin.height) }];
        }));
    }
    function createCleaning() { return { active: null, readyAt: 0 }; }
    function cleaner(scene, time) {
        const job = scene.cleaning && scene.cleaning.active;
        if (!job || time < job.startAt || time >= job.endAt) return null;
        const progress = time < job.arriveAt ? (time - job.startAt) / job.travel :
            time > job.leaveAt ? 1 - (time - job.leaveAt) / job.travel : 1;
        return { id: 'cleaner', x: job.from + (job.to - job.from) * clamp(progress, 0, 1),
            direction: (job.to >= job.from ? 1 : -1) * (time < job.leaveAt ? 1 : -1),
            y: 0, width: CLEANER_SETTINGS.width, height: CLEANER_SETTINGS.height, working: time >= job.arriveAt && time < job.leaveAt, reach: job.height || 0, carrying: time >= job.clearAt };
    }
    function advanceCleaning(scene, state, debris, time) {
        if (scene.qa) return;
        const job = state.active;
        if (job) {
            if (!job.cleared && time >= job.clearAt) {
                const bin = scene.bins.find(b => b.id === job.bin);
                for (const scrap of debris) if (Math.abs(scrap.x - bin.x) <= bin.width / 2 - 6 && scrap.y >= (bin.y || 0) && scrap.y <= (bin.y || 0) + bin.height) scrap.removed = true;
                job.cleared = true;
            }
            if (time >= job.endAt) { state.active = null; state.readyAt = time + CLEANER_SETTINGS.cooldownSeconds; }
            return;
        }
        if (time < state.readyAt) return;
        const contents = binContents(scene, debris.filter(b => b.resting));
        const full = scene.bins.find(b => contents[b.id].count >= 3 && (contents[b.id].fill >= .72 || contents[b.id].count >= 10));
        if (!full) return;
        const from = full.x < fieldWidth(scene) / 2 ? -CLEANER_SETTINGS.entryMargin : fieldWidth(scene) + CLEANER_SETTINGS.entryMargin;
        const to = full.x + (from < 0 ? -1 : 1) * (full.width / 2 + CLEANER_SETTINGS.standOff), travel = Math.abs(to - from) / CLEANER_SETTINGS.speed;
        const startAt = time + CLEANER_SETTINGS.warningSeconds, arriveAt = startAt + travel, clearAt = arriveAt + CLEANER_SETTINGS.clearSeconds, leaveAt = clearAt + CLEANER_SETTINGS.exitDelaySeconds;
        state.active = { height: full.y || 0, bin: full.id, points: full.points, from, to, travel, startAt, arriveAt, clearAt, leaveAt, endAt: leaveAt + travel, cleared: false };
    }
    function cpuPlan(scene, difficulty, seed, worldTime, debris) {
        const rng = random(seed), target = difficulty === 'easy' ? scene.bins[0] : rng() < .25 ? scene.bins[Math.floor(rng() * scene.bins.length)] : scene.bins.reduce((best, bin) => bin.points > best.points ? bin : best);
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
    return { WORLD, ITEMS, SCENES, CLEANER_SETTINGS, WEATHER, fieldWidth, createCleaning, advanceCleaning, cleaner, clamp, random, config, chargePower, scenario, properties, obstacles, launch, acceleration, advance, simulate, traceFlight, binContents, cpuPlan, createMatch, settle };
});
