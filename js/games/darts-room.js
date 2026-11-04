/* Persistent Darts rooms: connections use the shared service; participants own seats. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./darts-rules.js'));
    else root.createDartsRoom = factory(root.DartsRules);
})(typeof window === 'object' ? window : globalThis, function (Rules) {
    'use strict';
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function name(value, fallback) { return String(value || '').trim().slice(0, 32) || fallback || 'Player'; }
    function revision(data) { return Number.isInteger(data.revision) ? data.revision : 0; }
    function phase(data) {
        if (!data) return 'lobby';
        if (['lobby', 'playing', 'results'].includes(data.phase)) return data.phase;
        return data.game && ['playing', 'between'].includes(data.game.status) ? 'playing'
            : data.game && data.game.status === 'over' ? 'results' : 'lobby';
    }
    function participants(data) {
        if (data && data.participants && typeof data.participants === 'object') return data.participants;
        // Existing rooms used the connection UID as the participant UID.
        return Object.fromEntries(Object.entries(data && data.players || {}).map(function (entry) {
            return [entry[0], { id: entry[0], name: name(entry[1].name), controllerId: entry[0], type: 'human' }];
        }));
    }
    function participantIds(data) {
        var slots = participants(data), order = Array.isArray(data && data.seatOrder) ? data.seatOrder : Object.keys(slots);
        return Array.from(new Set(order.concat(Object.keys(slots)))).filter(function (id) { return !!slots[id]; });
    }
    function validId(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id); }
    function roomError(code, message) { return Object.assign(new Error(message), { code: 'room/' + code }); }
    return function createDartsRoom(config) {
        var net = config.net, now = config.now || Date.now, room = null, reaping = false, gcAt = -Infinity, seatSerial = 0;
        var presence = net.rooms.presence({ timeoutMs: 15000 });
        var onError = config.onError || function () {};
        function ownedPlayerIds(data, controllerId) {
            data = data || room && room.data;
            controllerId = controllerId || (service.currentPlayer() || {}).uid;
            var slots = participants(data);
            return participantIds(data).filter(function (id) { return slots[id].controllerId === controllerId; });
        }
        function newId(uid) { return uid + '-p' + (++seatSerial) + '-' + Math.floor(Math.random() * 1e9).toString(36); }
        function startAllowed(data, devices) {
            if (phase(data) !== 'lobby') return false;
            var ids = participantIds(data), slots = participants(data);
            return Rules.eligibility(data.options, ids.length).allowed && ids.every(function (id) {
                return slots[id].type === 'human' && devices.includes(slots[id].controllerId);
            }) && devices.every(function (uid) { return ids.some(function (id) { return slots[id].controllerId === uid; }); });
        }
        var service = net.rooms.create({
            collection: 'darts_rooms', identity: 'tab', layout: 'slots', presenceField: 'presence',
            minPlayers: 1, maxPlayers: 4, waitingStatus: 'waiting', occupiedStatus: 'waiting', startMode: 'host',
            isAvailable: function (uid) { return presence.isAvailable(uid); },
            isPlaying: function (data) { return phase(data) === 'playing'; },
            canStart: startAllowed,
            onCreate: function (input) {
                var player = service.currentPlayer(), imported = input.participants;
                if (!Array.isArray(imported)) imported = imported && typeof imported === 'object' ? Object.values(imported) : [];
                if (!imported.length) imported = [{ name: player.name }];
                if (imported.length > 4) throw roomError('full', 'A Darts room has four player slots.');
                var slots = {}, ids = [];
                imported.forEach(function (slot, index) {
                    slot = typeof slot === 'string' ? { name: slot } : slot || {};
                    var id = validId(slot.id) && !Object.hasOwn(slots, slot.id) ? slot.id : newId(player.uid);
                    slots[id] = { id: id, name: name(slot.name, index ? 'Player ' + (index + 1) : player.name), controllerId: player.uid, type: 'human' };
                    ids.push(id);
                });
                return { options: Rules.options(input), participants: slots, seatOrder: ids, phase: 'lobby', revision: 0, seed: input.seed };
            },
            onJoin: function (data, player) {
                if (phase(data) !== 'lobby') throw roomError('started', 'Return to the lobby before joining.');
                var slots = Object.assign({}, participants(data)), ids = participantIds(data);
                if (ids.length >= 4) throw roomError('full', 'All four player slots are occupied.');
                var id = newId(player.uid);
                slots[id] = { id: id, name: name(player.name), controllerId: player.uid, type: 'human' };
                return { participants: slots, seatOrder: ids.concat(id), ready: {}, revision: revision(data) + 1, phase: 'lobby' };
            },
            onLeave: function (data, player) {
                var slots = Object.assign({}, participants(data)), removed = ownedPlayerIds(data, player.uid);
                removed.forEach(function (id) { delete slots[id]; });
                var g = data.game || {}, active = phase(data) === 'playing';
                if (active) g = Rules.withdrawMany(g, removed, now()) || g;
                var nextPhase = active && g.status === 'over' ? 'results' : phase(data);
                return { status: nextPhase === 'lobby' ? 'waiting' : nextPhase === 'results' ? 'results' : 'playing',
                    participants: slots, seatOrder: participantIds(data).filter(function (id) { return !removed.includes(id); }),
                    ready: {}, revision: revision(data) + 1, phase: nextPhase, game: g };
            },
            startPatch: function (data) {
                var ids = participantIds(data), slots = participants(data);
                var g = Rules.create(data.options, ids, now(), Math.abs(data.seed || 0) % ids.length);
                g.owners = Object.fromEntries(ids.map(function (id) { return [id, slots[id].controllerId]; }));
                return { status: 'playing', phase: 'playing', game: g,
                    seed: Math.floor(Math.random() * 1e9),
                    participants: slots, seatOrder: ids,
                    roster: Object.fromEntries(ids.map(function (id) { return [id, slots[id].name]; })) };
            },
        });
        var session = service.session({
            onChange: function (data, activeRoom) {
                room = activeRoom; presence.observe(data);
                if (config.onChange) config.onChange(data, activeRoom);
            }, onError: onError,
        });
        function attach(code) { presence.reset(); room = session.attach(code); return room; }
        function guarded(expected, build) {
            if (!room || !room.data) return Promise.resolve(false);
            var g = expected || room.data.game || {};
            return service.updateMatch(room.code, { matchId: g.matchId, round: g.round, status: g.status, seq: g.seq }, build);
        }
        function lobbyUpdate(build) {
            if (!room || !room.data || phase(room.data) !== 'lobby') return Promise.resolve(false);
            var expectedRevision = revision(room.data);
            return guarded(null, function (data, uid) {
                if (phase(data) !== 'lobby' || revision(data) !== expectedRevision) return null;
                return build(data, uid);
            });
        }
        function configure(patch) {
            return lobbyUpdate(function (data, uid) {
                if (service.host(data) !== uid || !patch || typeof patch !== 'object') return null;
                var current = Rules.options(data.options);
                if (patch.mode && patch.mode !== current.mode) {
                    current = Object.assign({}, current, { mode: patch.mode, roundLimit: undefined,
                        turnMs: patch.mode === 'practice' ? 0 : 60000 });
                }
                var options = Rules.options(Object.assign({}, current, patch));
                if (JSON.stringify(options) === JSON.stringify(Rules.options(data.options))) return null;
                return { options: options, ready: {}, revision: revision(data) + 1 };
            });
        }
        function addLocalPlayer(displayName) {
            var player = service.currentPlayer();
            if (!player) return Promise.resolve(false);
            var id = newId(player.uid);
            return lobbyUpdate(function (data, uid) {
                var slots = Object.assign({}, participants(data)), ids = participantIds(data);
                if (ids.length >= 4) return null;
                slots[id] = { id: id, name: name(displayName, 'Player ' + (ids.length + 1)), controllerId: uid, type: 'human' };
                return { participants: slots, seatOrder: ids.concat(id), ready: {}, revision: revision(data) + 1 };
            });
        }
        function renamePlayer(id, displayName) {
            return lobbyUpdate(function (data, uid) {
                var slots = Object.assign({}, participants(data));
                if (!slots[id] || slots[id].controllerId !== uid || !String(displayName || '').trim()) return null;
                var nextName = name(displayName);
                if (slots[id].name === nextName) return null;
                slots[id] = Object.assign({}, slots[id], { name: nextName });
                return { participants: slots, ready: {}, revision: revision(data) + 1 };
            });
        }
        function removeLocalPlayer(id) {
            return lobbyUpdate(function (data, uid) {
                var slots = Object.assign({}, participants(data));
                if (!slots[id] || slots[id].controllerId !== uid || ownedPlayerIds(data, uid).length < 2) return null;
                delete slots[id];
                return { participants: slots, seatOrder: participantIds(data).filter(function (slot) { return slot !== id; }),
                    ready: {}, revision: revision(data) + 1 };
            });
        }
        function backToLobby(expected) {
            return guarded(expected, function (data, uid) {
                if (service.host(data) !== uid || phase(data) === 'lobby') return null;
                var g = data.game || {};
                if (g.status !== 'over' && g.mode !== 'practice') return null;
                if (g.status !== 'over') {
                    g = clone(g); g.seq++; g.status = 'over'; g.winner = null; g.legWinner = null; g.endReason = 'practice-ended';
                }
                return { phase: 'lobby', status: 'waiting', game: g, ready: {}, revision: revision(data) + 1 };
            });
        }
        function submit(th, expected) {
            // Scoring derives from a validated physical flight, with no caller-supplied player ID.
            if (!th || !th.pos || !th.vel || ![th.pos.x, th.pos.y, th.pos.z, th.vel.x, th.vel.y, th.vel.z, th.tempo].every(Number.isFinite)
                || th.vel.z <= 0 || th.vel.z > 30000) return Promise.resolve(false);
            var presentation = config.resolveThrow(th);
            if (!presentation || !presentation.impact || ![presentation.impact.x, presentation.impact.y, presentation.impact.t].every(Number.isFinite)
                || presentation.impact.t < 0) return Promise.resolve(false);
            var stamp = now();
            return guarded(expected, function (data, uid) {
                var g = data.game || {}, owner = g.owners ? g.owners[g.active] : g.active;
                if (phase(data) !== 'playing' || g.status !== 'playing' || owner !== uid || stamp < g.readyAt
                    || g.turnMs > 0 && stamp >= g.turnStartedAt + g.turnMs) return null;
                var next = Rules.throwDart(g, g.active, presentation.result, stamp, presentation.impact);
                if (!next) return null;
                next.readyAt = stamp + Math.ceil(presentation.impact.t * 1000) + 1000;
                if (next.round !== g.round) next.turnStartedAt = next.readyAt;
                next.lastThrow = { seq: next.seq, uid: g.active, flight: th, impact: presentation.impact,
                    result: next.lastDart.result };
                if (next.lastDart.penalties) next.lastThrow.penalties = next.lastDart.penalties;
                return { game: next, phase: next.status === 'over' ? 'results' : 'playing', status: next.status === 'over' ? 'results' : 'playing' };
            });
        }
        function expire(expected) {
            var stamp = now();
            return guarded(expected, function (data) {
                var g = data.game || {};
                if (phase(data) !== 'playing' || g.status !== 'playing' || !(g.turnMs > 0)
                    || stamp < g.turnStartedAt + g.turnMs || stamp < g.readyAt) return null;
                var next = Rules.timeout(g, stamp);
                return next ? { game: next, phase: next.status === 'over' ? 'results' : 'playing', status: next.status === 'over' ? 'results' : 'playing' } : null;
            });
        }
        function nextLeg(expected) {
            var stamp = now();
            return guarded(expected, function (data) {
                if (phase(data) !== 'playing' || !data.game || stamp < data.game.readyAt) return null;
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
            if (room && room.data && phase(room.data) === 'playing' && room.data.game && room.data.game.status === 'playing'
                && room.data.game.turnMs > 0 && now() >= room.data.game.turnStartedAt + room.data.game.turnMs) await expire();
        }
        function ready(value) {
            return lobbyUpdate(function (data, uid) { return { ready: Object.assign({}, data.ready, { [uid]: value !== false }) }; });
        }
        return { service: service, presence: presence, attach: attach, submit: submit, expire: expire, nextLeg: nextLeg, tick: tick,
            participantIds: participantIds, participants: participants, ownedPlayerIds: ownedPlayerIds, phase: phase,
            configure: configure, addLocalPlayer: addLocalPlayer, renamePlayer: renamePlayer, removeLocalPlayer: removeLocalPlayer,
            backToLobby: backToLobby, rematch: backToLobby, ready: ready,
            current: function () { return room; },
            canStart: function (data) { return service.canStart(data || room && room.data); },
            create: async function (options, localParticipants) {
                return attach(await service.create(Object.assign({}, options, { participants: localParticipants,
                    seed: Math.floor(Math.random() * 1e9) })));
            },
            join: async function (code) { return attach(await service.join(code)); },
            start: function () { return room ? service.start(room.code) : Promise.resolve(false); },
            leave: function () { var leaving = session.leave(); room = null; presence.reset(); return leaving; },
        };
    };
});
