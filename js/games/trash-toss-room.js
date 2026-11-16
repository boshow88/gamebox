/* Trash Toss online policy and deterministic replay; no DOM or Firebase dependency. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./trash-toss-rules.js'));
    else root.TrashTossRoom = factory(root.TrashTossRules);
})(typeof window === 'object' ? window : globalThis, function (R) {
    'use strict';
    const LAUNCH_LEAD_MS = 400;
    const clone = value => JSON.parse(JSON.stringify(value));
    const tickAt = (game, now) => Math.max(game.world.tick, Math.floor((now - game.originAt) * .06 + 1e-7));
    function environment(game, world) {
        const scene = R.scenario(game.match.config, game.match.round, game.match.seed);
        scene.cleaning = world.cleaning; return scene;
    }
    function step(scene, world, ball) {
        world.tick++;
        for (const scrap of world.debris) if (!scrap.resting) R.advance(scene, scrap, 1 / 60, world.debris, true);
        R.advanceCleaning(scene, world.cleaning, world.debris, world.tick / 60);
        world.debris = world.debris.filter(scrap => !scrap.removed);
        if (ball && !ball.result) R.advance(scene, ball, 1 / 60, world.debris);
    }
    function advance(game, world, target) {
        const scene = environment(game, world);
        while (world.tick < target) step(scene, world);
        return world;
    }
    function accept(game, angle, power, now, timeout) {
        const start = advance(game, clone(game.world), tickAt(game, now));
        const launchTick = timeout ? start.tick : Math.max(start.tick, Math.ceil((now + LAUNCH_LEAD_MS - game.originAt) * .06));
        const world = advance(game, clone(start), launchTick), scene = environment(game, world);
        const ball = timeout ? null : R.launch(scene, angle, power, world.tick / 60);
        while (ball && !ball.result) step(scene, world, ball);
        const result = timeout ? { kind: 'timeout', points: 0 } : ball.result;
        const position = ball ? { x: ball.x, y: ball.y } : null;
        if (ball && !ball.removed) world.debris.push(ball);
        world.debris = world.debris.slice(-R.WORLD.debrisLimit);
        const match = R.settle(game.match, result, timeout ? {} : { angle, power, releaseAt: launchTick / 60 });
        const duration = (world.tick - launchTick) / 60;
        return clone(Object.assign({}, game, { status: 'flight', seq: game.seq + 1, world: start,
            shot: { angle, power, at: game.originAt + launchTick / 60 * 1000, timeout: !!timeout },
            outcome: { match, world, result, position, duration }, readyAt: game.originAt + (world.tick / 60 + R.WORLD.resultSeconds) * 1000 }));
    }
    // Keep the world moving during the shared launch lead, then replay identical fixed steps.
    function project(game, now, cache) {
        if (!cache || cache.matchId !== game.matchId || cache.seq !== game.seq) {
            const world = clone(game.world), scene = environment(game, world);
            cache = { matchId: game.matchId, seq: game.seq, world, scene, trail: [], feedback: [], ball: null, result: null, launched: false };
        }
        const flight = game.status === 'flight' && !game.shot.timeout;
        const launchTick = flight ? Math.round((game.shot.at - game.originAt) * .06) : Infinity;
        function launchDue() {
            if (!flight || cache.launched || cache.world.tick < launchTick) return;
            cache.launched = true;
            cache.ball = R.launch(cache.scene, game.shot.angle, game.shot.power, launchTick / 60);
            cache.trail.push({ x: cache.ball.x, y: cache.ball.y });
        }
        launchDue();
        const target = game.status === 'over' ? game.world.tick : tickAt(game, now);
        while (cache.world.tick < target) {
            const ball = cache.ball, hadHit = ball && ball.hits.length;
            step(cache.scene, cache.world, ball);
            if (ball) {
                cache.trail.push({ x: ball.x, y: ball.y });
                if (!hadHit && ball.hits.length) cache.feedback.push({ x: ball.x, y: ball.y, time: cache.world.tick / 60 });
                if (ball.result) {
                    cache.result = clone(game.outcome.result);
                    if (!ball.removed) cache.world.debris.push(ball);
                    cache.world.debris = cache.world.debris.slice(-R.WORLD.debrisLimit); cache.ball = null;
                }
            }
            launchDue();
        }
        if (game.status === 'flight' && (game.shot.timeout || now >= game.shot.at + game.outcome.duration * 1000)) cache.result = game.outcome.result;
        return cache;
    }
    function create(options) {
        const now = options.now || options.net.rooms.now || Date.now, net = options.net;
        const presence = net.rooms.presence({ timeoutMs: 15000 });
        let room = null, busy = false, active = true;
        const service = net.rooms.create({ collection: 'trash_toss_rooms', identity: 'tab', layout: 'slots', presenceField: 'presence',
            minPlayers: 2, maxPlayers: 2, waitingStatus: 'waiting', occupiedStatus: 'waiting', startMode: 'host',
            isAvailable: uid => presence.isAvailable(uid), isPlaying: data => ['aim', 'flight'].includes((data.game || {}).status),
            onCreate: input => ({ options: { scene: R.config(input).scene }, revision: 0 }),
            onJoin: data => {
                if (data.game && data.game.matchId) throw Object.assign(new Error('Return to lobby before joining'), { code: 'room/started' });
                return { ready: {} };
            },
            onLeave: (data, player, remaining) => {
                const game = data.game;
                if (!game || !['aim', 'flight'].includes(game.status)) return { ready: {} };
                const match = Object.assign({}, game.match, { over: true, winner: game.seats.indexOf(remaining[0]) });
                return { status: 'results', ready: {}, game: Object.assign({}, game, { status: 'over', seq: game.seq + 1, match, endReason: 'left' }) };
            },
            startPatch: (data, seats) => {
                const match = R.createMatch({ mode: 'online', scene: data.options.scene }, Math.floor(Math.random() * 0x100000000));
                const at = now();
                return { status: 'playing', game: { match, seats, names: seats.map(uid => data.players[uid].name || 'P' + (seats.indexOf(uid) + 1)),
                    status: 'aim', round: 1, active: 0, seq: 0, originAt: at, turnStartedAt: at,
                    last: [null, null], world: { tick: 0, debris: [], cleaning: R.createCleaning() } } };
            },
        });
        const session = service.session({
            onChange(data, entry) {
                room = data ? entry : null;
                if (!data) { session.detach(); presence.reset(); }
                else presence.observe(data);
                if (options.onChange) options.onChange(data, room);
            }, onError: options.onError,
        });
        function guarded(game, build) {
            if (!room || !game) return Promise.resolve(false);
            const entry = room;
            return service.updateMatch(entry.code, { matchId: game.matchId, round: game.round, status: game.status, seq: game.seq }, (data, uid) => {
                if (!active || room !== entry) return null;
                return build(data, uid);
            });
        }
        function lobbyUpdate(build) {
            if (!room || !room.data || (room.data.game || {}).matchId) return Promise.resolve(false);
            const entry = room, revision = entry.data.revision || 0, game = entry.data.game || {};
            return service.updateMatch(entry.code, { matchId: game.matchId, round: game.round, status: game.status, seq: game.seq }, (data, uid) => {
                if (!active || room !== entry || (data.game || {}).matchId || (data.revision || 0) !== revision) return null;
                return build(data, uid);
            });
        }
        function configure(scene) {
            if (!Object.hasOwn(R.SCENES, scene)) return Promise.resolve(false);
            return lobbyUpdate((data, uid) => service.host(data) !== uid || data.options.scene === scene ? null :
                { options: Object.assign({}, data.options, { scene }), ready: {}, revision: (data.revision || 0) + 1 });
        }
        function ready(value = true) {
            return lobbyUpdate((data, uid) => ({ ready: Object.assign({}, data.ready, { [uid]: !!value }) }));
        }
        function canControl() {
            const data = room && room.data, g = data && data.game, uid = (service.currentPlayer() || {}).uid;
            return !!(g && g.status === 'aim' && g.seats[g.active] === uid && service.isConnected() && now() < g.turnStartedAt + R.WORLD.turnSeconds * 1000);
        }
        function submit(angle, power) {
            if (!canControl() || !Number.isFinite(angle) || !Number.isFinite(power) || angle < 15 || angle > 80 || power < 0 || power > 100) return Promise.resolve(false);
            const game = room.data.game, at = now();
            return guarded(game, (data, uid) => {
                const g = data.game;
                if (g.seats[g.active] !== uid || at >= g.turnStartedAt + R.WORLD.turnSeconds * 1000) return null;
                return { game: accept(g, angle, power, now(), false) };
            });
        }
        async function poll() {
            if (!room || !room.data || busy || !service.currentPlayer() || !service.isConnected()) return;
            busy = true;
            try {
                const entry = room, data = entry.data;
                await service.heartbeat(entry.code);
                if (room !== entry) return;
                const dead = presence.disconnected(data);
                if (dead.length) { await service.releaseDisconnected(entry.code, dead); return; }
                const g = data.game, at = now();
                if (!g || !g.matchId) return;
                if (g.status === 'aim' && at >= g.turnStartedAt + R.WORLD.turnSeconds * 1000) {
                    await guarded(g, current => ({ game: accept(current.game, 45, 0, at, true) }));
                } else if (g.status === 'flight' && at >= g.readyAt) {
                    await guarded(g, current => {
                        const old = current.game, match = old.outcome.match, last = old.last.slice();
                        if (!old.shot.timeout) {
                            const s = environment(old, old.world);
                            last[old.active] = { angle: old.shot.angle, power: old.shot.power, item: s.item, grams: s.grams, scene: s.scene, wind: s.wind, weather: s.weather };
                        }
                        const game = Object.assign({}, old, { match, last, round: match.round, active: match.active, seq: old.seq + 1,
                            status: match.over ? 'over' : 'aim', turnStartedAt: at, world: clone(old.outcome.world) });
                        delete game.shot; delete game.outcome; delete game.readyAt;
                        // Old weather stays active through the previous throw's short result pause.
                        advance(old, game.world, Math.max(game.world.tick, Math.floor((at - old.originAt) * .06 + 1e-7)));
                        return { status: match.over ? 'results' : 'playing', game };
                    });
                }
            } finally { busy = false; }
        }
        return { service, presence, session, now, canControl, configure, submit, poll,
            get room() { return room; },
            async create(input) { const code = await service.create(input); presence.reset(); session.attach(code); room = session.room; return code; },
            async join(code) { code = await service.join(code); presence.reset(); session.attach(code); room = session.room; return code; },
            async leave() { room = null; presence.reset(); await session.leave(); },
            ready,
            start: () => room ? service.start(room.code) : Promise.resolve(false),
            rematch: () => room ? service.reset(room.code) : Promise.resolve(false),
            detach() { session.detach(); room = null; presence.reset(); },
            destroy() { active = false; session.detach(); room = null; },
        };
    }
    return { create, project };
});
