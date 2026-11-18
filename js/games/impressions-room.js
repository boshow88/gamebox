/* Persistent Impressions room policy. Connections/transactions/presence use ArcadeNet.rooms. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./impressions-match.js'),require('./impressions-cpu.js'));
    else root.createImpressionsRoom = factory(root.ImpressionsMatch,root.ImpressionsCpu);
})(typeof window === 'object' ? window : globalThis, function (Match,Cpu) {
    'use strict';
    function displayName(value, fallback) { return String(value || '').trim().slice(0, 32) || fallback || 'Player'; }
    function participantId(uid) { return uid + '-human'; }
    function phase(data) { return data && data.phase || 'lobby'; }
    function revision(data) { return data && Number.isInteger(data.revision) ? data.revision : 0; }
    function older(data, previous) {
        if (!data || !previous) return false;
        if (revision(data) !== revision(previous)) return revision(data) < revision(previous);
        var a = data.game, b = previous.game;
        if (!a || !b || !a.matchId || a.matchId !== b.matchId) return false;
        if (a.round !== b.round) return a.round < b.round;
        return a.settledRound < b.settledRound || b.status === 'over' && a.status !== 'over'
            || Object.keys(b.submissions || {}).some(function (id) { return !(a.submissions || {})[id]; })
            || (b.withdrawn || []).some(function (id) { return !(a.withdrawn || []).includes(id); });
    }
    function roomError(code, message) { return Object.assign(new Error(message), { code: 'room/' + code }); }
    return function createImpressionsRoom(config) {
        var net = config.net, now = config.now || Date.now;
        var seedSource = config.seedSource || function () { return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]; };
        var room = null, latest = null, startTicket = null, startPending = false, reaping = false;
        var presence = net.rooms.presence({ timeoutMs: 15000, now: now });
        var onError = config.onError || function () {}, work = new Map(), cleanupAt = -Infinity, cpuSerial=0;
        function makeParticipant(player, value, fallback) {
            var id = participantId(player.uid);
            return { id: id, controllerId: player.uid, name: displayName(value, displayName(player.name, fallback || 'Player')), type: 'human' };
        }
        function available(uid) { return presence.isAvailable(uid); }
        function lobbyUpgrade(data) {
            var scoringUpgrade = Match.upgradeDefaultScoring(data.options);
            // Keep intentional generation/timing settings from v9-v13 lobbies;
            // only waiting-room capability/readiness is migrated here.
            if ([9,10,11,12,13].includes(data.lobbyVersion)) return Match.options(scoringUpgrade || data.options);
            if (data.lobbyVersion !== Match.version) {
                var previous = scoringUpgrade || data.options;
                var oldMode = data.options.categoryMode || 'color';
                var weights = data.options.categoryWeights || (oldMode === 'mixed' && data.options.selectionVersion !== 2 ? { color: 2, quantity: 2, pitch: 0 } : undefined);
                return Match.options(Object.assign({}, previous, { selectionVersion: 3, challengeVersion:1, categoryMode: oldMode, categoryWeights: weights,
                    quantity: Object.assign({}, previous.quantity, { variantSelectionVersion: 1, renderingVersion: 3 }), color: Object.assign({}, previous.color, { variantSelectionVersion: 2 }), pitch: Object.assign({}, previous.pitch, { variantSelectionVersion: 2 }) }));
            }
            return scoringUpgrade;
        }
        function startAllowed(data, controllers, uid) {
            var options = Match.options(data.options), ids = data.seatOrder || [], ready = data.ready || {};
            return phase(data) === 'lobby' && !lobbyUpgrade(data) && Match.enabled(options)
                && service.isConnected() && ids.length >= 2 && ids.length <= options.capacity
                && ids.some(function(id){return data.participants[id]&&data.participants[id].type==='human';}) && controllers.length === Object.keys(data.players || {}).length
                && ids.every(function (id) {
                    var p = data.participants[id];
                    return p && (p.type==='human'||p.type==='cpu'&&p.cpuVersion===Cpu.version&&Cpu.validDifficulty(p.difficulty)&&ids.some(function(h){return data.participants[h].type==='human'&&data.participants[h].controllerId===p.controllerId;})) && controllers.includes(p.controllerId) && (data.presence || {})[p.controllerId] !== -1
                        && (p.type==='cpu'||!Match.requiresAudio(options) || audioReadyFor(data, p.controllerId))
                        && (p.type==='cpu'||p.controllerId === uid || ready[p.controllerId] && ready[p.controllerId].revision === revision(data)
                            && ready[p.controllerId].protocolVersion === Match.version);
                });
        }
        var fallbackAudioToken=globalThis.crypto.getRandomValues(new Uint32Array(4)).join('-');
        function audioStatus(){return config.audioStatus?config.audioStatus():{token:fallbackAudioToken,confirmed:true,usable:true};}
        function audioReadyFor(data, uid) {
            var record=(data.audioReady||{})[uid];if(!record)return false;
            if(data.lobbyVersion<12)return record.revision===revision(data)&&record.protocolVersion===data.lobbyVersion;
            if(record.version!==2||record.protocolVersion!==Match.version||typeof record.token!=='string'||!record.token)return false;
            if(uid===(service.currentPlayer()||{}).uid){var state=audioStatus();return state.confirmed&&state.usable&&state.token===record.token;}
            return true;
        }
        var service = net.rooms.create({
            collection: 'memory_rooms', identity: 'tab', layout: 'order', presenceField: 'presence',
            sessionId: config.sessionId, nativeDisconnect: false,
            presenceSeed: globalThis.crypto.getRandomValues(new Uint32Array(1))[0],
            now: now,
            minPlayers: 1, maxPlayers: 8, waitingStatus: 'waiting', occupiedStatus: 'waiting', startMode: 'host',
            isAvailable: available, isPlaying: function (data) { return phase(data) === 'playing'; }, canStart: startAllowed,
            onCreate: function (input) {
                var player = service.currentPlayer(), p = makeParticipant(player, input.name, 'Player 1');
                return { options: Match.options(input.options), participants: { [p.id]: p }, seatOrder: [p.id], phase: 'lobby', revision: 1, lobbyVersion: Match.version };
            },
            onJoin: function (data, player) {
                if (phase(data) !== 'lobby') throw roomError('started', 'Return to the lobby before joining.');
                if (data.seatOrder.length >= data.options.capacity) throw roomError('full', 'Room is full.');
                var p = makeParticipant(player, null, 'Player ' + (data.seatOrder.length + 1));
                return { participants: Object.assign({}, data.participants, { [p.id]: p }), seatOrder: data.seatOrder.concat(p.id),
                    ready: {}, revision: revision(data) + 1 };
            },
            onLeave: function (data, player) {
                var participants = Object.assign({}, data.participants);
                Object.keys(participants).forEach(function (id) { if (participants[id].controllerId === player.uid) delete participants[id]; });
                var game = data.game;
                if (phase(data) === 'playing') game = Match.withdraw(game, player.uid, now());
                var nextPhase = phase(data) === 'playing' && game.status === 'over' ? 'results' : phase(data);
                return { participants: participants, seatOrder: data.seatOrder.filter(function (id) { return !!participants[id]; }),
                    game: game, phase: nextPhase, status: nextPhase === 'lobby' ? 'waiting' : nextPhase === 'results' ? 'results' : 'playing',
                    ready: {}, revision: revision(data) + 1 };
            },
            startPatch: function (data) {
                if (!startTicket) throw new Error('Start requires a captured question seed.');
                return { game: Match.create(data.participants, data.seatOrder, data.options, startTicket.seed, now()),
                    phase: 'playing', status: 'playing', revision: revision(data) + 1 };
            },
        });
        var session = service.session({ onChange: function (data, activeRoom) {
            if (older(data, latest)) { activeRoom.data = latest; return; }
            latest = data; room = activeRoom; presence.observe(data);
            if (config.onChange) config.onChange(data, activeRoom);
        }, onError: onError });
        function attach(code) { latest = null; presence.reset(); room = session.attach(code); return room; }
        function canControl(data, uid) {
            data = data || room && room.data; uid = uid || (service.currentPlayer() || {}).uid;
            return !!(data && uid && (data.players || {})[uid] && (data.presence || {})[uid] !== -1 && service.isConnected());
        }
        function guarded(expected, build, extra) {
            if (!room || !room.data) return Promise.resolve(false);
            var entry = room, game = room.data.game || {}, token = expected || Match.token(game);
            var guard = Object.assign({ matchId: token.matchId, round: token.round, status: game.status }, extra);
            if (token.questionId !== undefined) guard.questionId = token.questionId;
            if (token.categoryId !== undefined) guard.categoryId = token.categoryId;
            return service.updateMatch(entry.code, guard, function (data, uid) {
                if (room !== entry || !canControl(data, uid)) return null;
                return build(data, uid);
            });
        }
        function lobbyUpdate(build, expectedRevision) {
            if (!room || !room.data) return Promise.resolve(false);
            var observed = expectedRevision === undefined ? revision(room.data) : expectedRevision;
            return guarded(null, function (data, uid) {
                if (phase(data) !== 'lobby' || revision(data) !== observed) return null;
                return build(data, uid);
            });
        }
        function ready(value, expectedRevision) {
            return lobbyUpdate(function (data, uid) {
                if (value !== false && Match.requiresAudio(data.options) && !audioReadyFor(data, uid)) return null;
                var ready = Object.assign({}, data.ready);
                if (value === false) delete ready[uid];
                else ready[uid] = { revision: revision(data), protocolVersion: Match.version };
                return { ready: ready };
            }, expectedRevision);
        }
        function acknowledgeAudio(value, expectedRevision) {
            var captured=audioStatus();
            return lobbyUpdate(function (data, uid) {
                var audioReady = Object.assign({}, data.audioReady), ready = Object.assign({}, data.ready);
                if (value === false) { var live=audioStatus();if(config.audioStatus&&data.lobbyVersion>=12&&live.confirmed&&live.usable)return null;delete audioReady[uid];if(data.lobbyVersion<12||Match.requiresAudio(data.options))delete ready[uid]; }
                else if(data.lobbyVersion>=12){var current=audioStatus();if(!captured.confirmed||!captured.usable||!current.confirmed||!current.usable||current.token!==captured.token)return null;audioReady[uid]={version:2,token:captured.token,protocolVersion:Match.version};}
                else audioReady[uid] = { revision: revision(data), protocolVersion: data.lobbyVersion };
                return { audioReady: audioReady, ready: ready };
            }, room&&room.data&&room.data.lobbyVersion>=12?undefined:expectedRevision);
        }
        function configure(patch) {
            return lobbyUpdate(function (data, uid) {
                if (service.host(data) !== uid) return null;
                var input = Object.assign({}, data.options, patch);
                if(patch.cpu){input.cpu=Object.assign({},data.options.cpu,patch.cpu);['color','quantity','pitch'].forEach(function(type){if(patch.cpu[type])input.cpu[type]=Object.assign({},data.options.cpu&&data.options.cpu[type],patch.cpu[type]);});if(patch.cpu.timing){input.cpu.timing=Object.assign({},data.options.cpu&&data.options.cpu.timing);['color','quantity','pitch'].forEach(function(type){if(patch.cpu.timing[type])input.cpu.timing[type]=Object.assign({},input.cpu.timing[type],patch.cpu.timing[type]);});}}
                if (patch.timing) input.timing = Object.assign({}, data.options.timing, patch.timing);
                if (patch.categoryWeights) input.categoryWeights = Object.assign({}, data.options.categoryWeights, patch.categoryWeights);
                if (patch.quantity) { input.quantity = Object.assign({}, data.options.quantity, patch.quantity); if (patch.quantity.multi) input.quantity.multi = Object.assign({}, data.options.quantity && data.options.quantity.multi, patch.quantity.multi); }
                if(patch.challenge)input.challenge=Object.assign({},data.options.challenge,patch.challenge,{weights:Object.assign({},data.options.challenge&&data.options.challenge.weights,patch.challenge.weights),levels:Object.assign({},data.options.challenge&&data.options.challenge.levels,patch.challenge.levels)});
                if(patch.quantity&&patch.quantity.progression){var old=data.options.quantity&&data.options.quantity.progression,p=patch.quantity.progression;input.quantity.progression=Object.assign({},old,p,{variantWeights:Object.assign({},old&&old.variantWeights,p.variantWeights),ranges:Object.assign({},old&&old.ranges,p.ranges)});}
                if (patch.color) input.color = Object.assign({}, data.options.color, patch.color);
                if (patch.adaptive) {
                    input.adaptive = Object.assign({}, data.options.adaptive, patch.adaptive);
                    if (patch.adaptive.initial !== undefined && patch.adaptive.initialByType === undefined) input.adaptive.initialByType = { color: patch.adaptive.initial, quantity: patch.adaptive.initial, pitch: patch.adaptive.initial };
                }
                if (patch.pitch) {
                    input.pitch = Object.assign({}, data.options.pitch, patch.pitch);
                    ['generation', 'scoring', 'audio', 'timing'].forEach(function (key) { if (patch.pitch[key]) input.pitch[key] = Object.assign({}, data.options.pitch && data.options.pitch[key], patch.pitch[key]); });
                }
                var next = Match.options(input);
                if (next.capacity < data.seatOrder.length || JSON.stringify(next) === JSON.stringify(data.options)) return null;
                return { options: next, ready: {}, revision: revision(data) + 1 };
            });
        }
        function upgradeLobbyScoring() {
            return lobbyUpdate(function (data, uid) {
                if (service.host(data) !== uid) return null;
                var next = lobbyUpgrade(data);
                return next ? { options: next, ready: {}, revision: revision(data) + 1, lobbyVersion: Match.version } : null;
            });
        }
        function rename(value) {
            return lobbyUpdate(function (data, uid) {
                var id = participantId(uid), p = data.participants[id];
                if (!p || !String(value || '').trim() || p.name === displayName(value)) return null;
                return { participants: Object.assign({}, data.participants, { [id]: Object.assign({}, p, { name: displayName(value) }) }),
                    ready: {}, revision: revision(data) + 1 };
            });
        }
        function ownedCpu(id,data,uid){data=data||room&&room.data;uid=uid||(service.currentPlayer()||{}).uid;var p=data&&data.participants&&data.participants[id];return !!p&&p.type==='cpu'&&p.controllerId===uid;}
        function addCpuPlayer(value,difficulty){
            difficulty=difficulty===undefined?Cpu.defaultDifficulty:difficulty;if(!Cpu.validDifficulty(difficulty))return Promise.resolve(false);
            var uid=(service.currentPlayer()||{}).uid;if(!uid)return Promise.resolve(false);var id=uid+'-cpu-'+(++cpuSerial)+'-'+globalThis.crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
            return lobbyUpdate(function(data,owner){if(data.lobbyVersion!==Match.version||data.seatOrder.length>=data.options.capacity||!data.participants[participantId(owner)])return null;var p={id:id,name:displayName(value,'CPU '+(data.seatOrder.filter(function(id){return data.participants[id].type==='cpu';}).length+1)),controllerId:owner,type:'cpu',difficulty:difficulty,cpuVersion:Cpu.version};return {participants:Object.assign({},data.participants,{[id]:p}),seatOrder:data.seatOrder.concat(id),ready:{},revision:revision(data)+1};});
        }
        function editCpu(id,patch){return lobbyUpdate(function(data,uid){if(!ownedCpu(id,data,uid))return null;var p=data.participants[id],next=Object.assign({},p,patch);if(JSON.stringify(next)===JSON.stringify(p))return null;return {participants:Object.assign({},data.participants,{[id]:next}),ready:{},revision:revision(data)+1};});}
        function renameCpu(id,value){if(!String(value||'').trim())return Promise.resolve(false);return editCpu(id,{name:displayName(value)});}
        function setCpuDifficulty(id,level){return Cpu.validDifficulty(level)?editCpu(id,{difficulty:level}):Promise.resolve(false);}
        function removeCpuPlayer(id){return lobbyUpdate(function(data,uid){if(!ownedCpu(id,data,uid))return null;var participants=Object.assign({},data.participants);delete participants[id];return {participants:participants,seatOrder:data.seatOrder.filter(function(p){return p!==id;}),ready:{},revision:revision(data)+1};});}
        function submit(answer,expected,nonce,source){var p=service.currentPlayer();return p?submitFor(participantId(p.uid),answer,expected,nonce,source):Promise.resolve(false);}
        async function submitFor(id,answer,expected,nonce,source) {

            if (!room || !room.data || answer === undefined) return false;
            var entry = room, game = room.data.game || {}, player = service.currentPlayer();
            if (!player) return false;
            var request = Object.assign({}, expected || Match.token(game), { participantId: id,
                answer: Match.copyAnswer(answer), nonce: nonce });
            if(game.protocolVersion>=11||game.config.challengeVersion===1)request.source=source||'manual';
            async function acceptedReceipt() {
                if (room !== entry || !canControl()) return false;
                var current = await service.get(entry.code);
                return !!(current && current.players[player.uid] && Match.receipt(current.game, player.uid, request));
            }
            try {
                var accepted = await guarded(request, function (data, uid) {
                    var result = Match.submit(data.game, uid, request, now());
                    return result ? result.duplicate ? {} : { 'game.submissions': result.state.submissions } : null;
                });
                return accepted || await acceptedReceipt();
            } catch (error) {
                // A lost acknowledgement is not proof of a failed write. Check the immutable receipt.
                try { if (await acceptedReceipt()) return true; } catch (_) { /* Preserve the original network error. */ }
                throw error;
            }
        }
        function settle(expected) {
            if (!room || !room.data) return Promise.resolve(false);
            var entry = room, token = expected || Match.token(room.data.game);
            return service.settleRound(entry.code, Object.assign({}, token, { phase: 'active' }), function (data, uid) {
                if (room !== entry || !canControl(data, uid)) return null;
                var game = Match.settle(data.game, token, now());
                return game ? { game: game, phase: game.status === 'over' ? 'results' : 'playing',
                    status: game.status === 'over' ? 'results' : 'playing' } : null;
            });
        }
        function advance(expected) {
            var seed = seedSource(); // One seed per operation, reused by every Firebase retry.
            return guarded(expected, function (data) {
                var game = Match.advance(data.game, expected || Match.token(data.game), seed, now());
                return game ? { game: game } : null;
            }, { status: 'playing', phase: 'results' });
        }
        function backToLobby() {
            return guarded(null, function (data, uid) {
                if (phase(data) !== 'results' || data.game.status !== 'over' || service.host(data) !== uid) return null;
                return { phase: 'lobby', status: 'waiting', ready: {}, revision: revision(data) + 1,
                    options: lobbyUpgrade(data) || data.options, lobbyVersion: Match.version };
            });
        }
        async function runOnce(key, operation) {
            if (work.has(key)) return work.get(key);
            var pending = Promise.resolve().then(operation); work.set(key, pending);
            try { return await pending; } finally { if (work.get(key) === pending) work.delete(key); }
        }
        function tick() {
            if (!room || !room.data || !service.currentPlayer() || !room.data.players[service.currentPlayer().uid]
                || !service.isConnected()) return Promise.resolve(false);
            var entry = room, data = entry.data, game = data.game || {};
            service.heartbeat(entry.code, 3000).catch(onError);
            // A same-page reconnect must pulse even while its old native presence marker is -1.
            if (!canControl()) return Promise.resolve(false);
            var missing = presence.disconnected(data);
            if (missing.length && !reaping) {
                reaping = true;
                service.releaseDisconnected(entry.code, missing).catch(onError).finally(function () { reaping = false; });
            }
            if (service.host(data) === (service.currentPlayer() || {}).uid && now() - cleanupAt >= 60000) {
                cleanupAt = now(); service.cleanup().catch(onError);
            }
            if (phase(data) === 'lobby' && service.host(data) === (service.currentPlayer() || {}).uid && lobbyUpgrade(data))
                return runOnce(entry.code + ':scoring-upgrade', upgradeLobbyScoring);
            if (phase(data) !== 'playing' || !Match.supported(game) || game.status !== 'playing') return Promise.resolve(false);
            var key = entry.code + ':' + game.matchId + ':' + game.round;
            if (Match.canSettleEarly(game, now()))
                return runOnce(key + ':settle', function () { return settle(Match.token(game)); });
            if(game.protocolVersion>=11&&game.phase==='active'&&now()>=game.timeline.answerAt&&now()<game.timeline.deadline){
                var uid=(service.currentPlayer()||{}).uid;
                var due=game.participants.filter(function(id){return game.roster[id].type==='cpu'&&game.owners[id]===uid&&Match.eligible(game,id)&&!game.submissions[id];}).map(function(id){return {id:id,plan:Cpu.plan(game,id)};}).filter(function(item){return now()>=item.plan.dueAt;});
                if(due.length)return Promise.all(due.map(function(item){return runOnce(key+':'+game.questionId+':cpu:'+item.id,function(){return submitFor(item.id,Cpu.answer(game,item.id),Match.token(game),item.plan.nonce,'cpu');});}));
            }
            if (game.phase === 'active' && now() >= game.timeline.deadline)
                return runOnce(key + ':settle', function () { return settle(Match.token(game)); });
            if (game.phase === 'results' && now() >= game.resultsUntil)
                return runOnce(key + ':advance', function () { return advance(Match.token(game)); });
            return Promise.resolve(false);
        }
        return { service: service, presence: presence, current: function () { return room; }, canControl: canControl,
            playerId: function () { var p = service.currentPlayer(); return p && participantId(p.uid); },
            audioReadyFor:audioReadyFor,
            canStart: function () { return !!room && service.canStart(room.data); },
            create: async function (options, name) { return attach(await service.create({ options: options, name: name })); },
            join: async function (code) { return attach(await service.join(code)); },
            recover: async function (code) {
                var restored = await service.resume(code, function (data, player) {
                    var p = (data.participants || {})[participantId(player.uid)];
                    if (!p || p.type !== 'human' || p.controllerId !== player.uid || !data.seatOrder.includes(p.id))
                        throw roomError('membership-ended', 'Original human participant is no longer present');
                    // Audio is document-local. Preserve general Ready and the revision;
                    // the separate audio requirement still prevents an unconfirmed Start.
                    var audioReady = Object.assign({}, data.audioReady); delete audioReady[player.uid];
                    return { audioReady: audioReady };
                });
                return attach(restored);
            },
            start: async function () {
                if (!room || startPending || !canControl()) return false;
                if (phase(room.data) === 'lobby' && lobbyUpgrade(room.data)) { await upgradeLobbyScoring(); return false; }
                startPending = true; startTicket = { seed: seedSource() };
                try { return await service.start(room.code); } finally { startPending = false; startTicket = null; }
            },
            addCpuPlayer:addCpuPlayer,renameCpu:renameCpu,setCpuDifficulty:setCpuDifficulty,removeCpuPlayer:removeCpuPlayer,ownedCpu:ownedCpu,
            ready: ready, acknowledgeAudio: acknowledgeAudio, configure: configure, rename: rename, submit: submit, settle: settle, advance: advance,
            backToLobby: backToLobby, tick: tick,
            detach: function () { session.detach(); room = latest = null; presence.reset(); },
            leave: function () { var pending = session.leave(); room = latest = null; presence.reset(); return pending; },
        };
    };
});
