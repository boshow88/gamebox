/* Darts policy on the shared Gamebox RTDB room service. No rendering or input. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./darts-rules.js'));
    else root.createDartsRoom = factory(root.DartsRules);
})(typeof window === 'object' ? window : globalThis, function (Rules) {
    'use strict';
    return function createDartsRoom(config) {
        var net = config.net, now = config.now || Date.now, room = null, reaping = false, gcAt = -Infinity;
        var presence = net.rooms.presence({ timeoutMs: 15000 });
        var onError = config.onError || function () {};
        var service = net.rooms.create({
            collection: 'darts_rooms', identity: 'tab', layout: 'slots', presenceField: 'presence',
            minPlayers: 2, maxPlayers: 4, waitingStatus: 'waiting', occupiedStatus: 'waiting', startMode: 'host',
            isAvailable: function (uid) { return presence.isAvailable(uid); },
            isPlaying: function (data) { return !!(data.game && ['playing', 'between'].includes(data.game.status)); },
            onCreate: function (input) { return { options: Rules.options(input), seed: input.seed }; },
            onJoin: function () { return { game: {}, ready: {} }; },
            onLeave: function (data, player, remaining) {
                var g = data.game || {};
                g = Rules.withdraw(g, player.uid, now()) || g;
                return { status: ['playing', 'between'].includes(g.status) ? 'playing' : 'waiting', ready: {}, game: g };
            },
            startPatch: function (data, players) {
                return { status: 'playing', game: Rules.create(data.options, players, now(), data.seed % players.length),
                    roster: Object.fromEntries(players.map(function (id) { return [id, data.players[id].name || null]; })) };
            },
        });
        var session = service.session({
            onChange: function (data, activeRoom) {
                room = activeRoom; presence.observe(data);
                config.onChange(data, activeRoom);
            }, onError: onError,
        });
        function attach(code) {
            presence.reset(); room = session.attach(code); return room;
        }
        function guarded(expected, build) {
            if (!room || !room.data) return Promise.resolve(false);
            var g = expected || room.data.game || {};
            return service.updateMatch(room.code, { matchId: g.matchId, round: g.round, status: g.status, seq: g.seq }, build);
        }
        function submit(th, expected) {
            // Validate and score from the flight, never from a supplied numeric score.
            if (!th || !th.pos || !th.vel || ![th.pos.x, th.pos.y, th.pos.z, th.vel.x, th.vel.y, th.vel.z, th.tempo].every(Number.isFinite)
                || th.vel.z <= 0 || th.vel.z > 30000) return Promise.resolve(false);
            var presentation = config.resolveThrow(th);
            if (!presentation || !presentation.impact || !Number.isFinite(presentation.impact.t)) return Promise.resolve(false);
            var stamp = now();
            return guarded(expected, function (data, uid) {
                var g = data.game;
                if (g.status !== 'playing' || g.active !== uid || stamp < g.readyAt || stamp >= g.turnStartedAt + g.turnMs) return null;
                var next = Rules.throwDart(g, uid, presentation.result, stamp);
                if (!next) return null;
                next.readyAt = stamp + Math.ceil(presentation.impact.t * 1000) + 1000;
                // The next player's full turn starts after the previous dart's presentation.
                if (next.round !== g.round) next.turnStartedAt = next.readyAt;
                next.lastThrow = { seq: next.seq, uid: uid, flight: th, impact: presentation.impact, result: Rules.normalize(presentation.result) };
                return { game: next };
            });
        }
        function expire(expected) {
            var stamp = now();
            return guarded(expected, function (data) {
                var g = data.game;
                if (g.status !== 'playing' || stamp < g.turnStartedAt + g.turnMs || stamp < g.readyAt) return null;
                return { game: Rules.timeout(g, stamp) };
            });
        }
        function nextLeg(expected) {
            var stamp = now();
            return guarded(expected, function (data) {
                if (stamp < data.game.readyAt) return null;
                var next = Rules.nextLeg(data.game, stamp); return next ? { game: next } : null;
            });
        }
        async function tick() {
            if (!room || !room.data || !service.currentPlayer() || !(room.data.players || {})[service.currentPlayer().uid]) return;
            var data = room.data;
            await service.heartbeat(room.code, 3000);
            var missing = presence.disconnected(data);
            if (missing.length && !reaping) {
                reaping = true;
                try { await service.releaseDisconnected(room.code, missing); } finally { reaping = false; }
            }
            if (room && service.host(room.data) === service.currentPlayer().uid && now() - gcAt >= 30000) {
                gcAt = now(); service.cleanup().catch(onError);
            }
            if (room && room.data && room.data.game && room.data.game.status === 'playing' && now() >= room.data.game.turnStartedAt + room.data.game.turnMs) await expire();
        }
        return { service: service, presence: presence, attach: attach, submit: submit, expire: expire, nextLeg: nextLeg, tick: tick,
            current: function () { return room; },
            create: async function (options) { return attach(await service.create(Object.assign({}, options, { seed: Math.floor(Math.random() * 1e9) }))); },
            join: async function (code) { return attach(await service.join(code)); },
            ready: function () { return room ? service.setReady(room.code) : Promise.resolve(false); },
            start: function () { return room ? service.start(room.code) : Promise.resolve(false); },
            rematch: function () { return room ? service.reset(room.code) : Promise.resolve(false); },
            leave: function () { var leaving = session.leave(); room = null; presence.reset(); return leaving; },
        };
    };
});
