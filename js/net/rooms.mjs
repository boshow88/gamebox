/** Shared room membership and matchmaking. No Firebase, DOM or game rules. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function normalizeCode(value) { return String(value || '').trim().toUpperCase(); }
function randomCode() {
    let code = '';
    for (let i = 0; i < 4; i++) code += ALPHABET[(Math.random() * ALPHABET.length) | 0];
    return code;
}
function error(code, message) { return Object.assign(new Error(message), { code: 'room/' + code }); }
function matchFields(patch, fields) {
    const result = Object.assign({}, patch);
    if (patch.game) result.game = Object.assign({}, patch.game, fields);
    else for (const [key, value] of Object.entries(fields)) result['game.' + key] = value;
    return result;
}

/** Observe changing counters on our own clock, including players who never sent a beat. */
export function createRoomPresence({ timeoutMs = 15000, now = Date.now } = {}) {
    const records = new Map();
    function observe(data) {
        const players = (data && data.players) || {}, beats = (data && data.presence) || {};
        for (const uid of records.keys()) if (!players[uid]) records.delete(uid);
        for (const uid of Object.keys(players)) {
            const record = records.get(uid);
            if (!record || record.beat !== beats[uid]) records.set(uid, { beat: beats[uid], at: now() });
        }
    }
    const isAvailable = uid => !records.has(uid) || now() - records.get(uid).at < timeoutMs;
    return { observe, isAvailable, reset: () => records.clear(),
        disconnected: data => Object.keys((data && data.players) || {}).filter(uid => !isAvailable(uid))
            .map(uid => ({ uid, beat: records.get(uid).beat })) };
}

export function createRoomService({ store, getUser, sessionId, generateCode = randomCode }, options) {
    const config = Object.assign({
        minPlayers: 2, maxPlayers: 2, identity: 'account', layout: 'order',
        waitingStatus: 'lobby', startMode: 'host', allowSpectators: false,
        isAvailable: () => true,
        isPlaying: data => !!(data.game && data.game.status === 'playing'),
        onCreate: () => ({}), onJoin: () => ({}), onLeave: () => ({}), onReset: () => ({}),
        startPatch: () => ({ game: { status: 'playing' } }),
    }, options);
    if (!Number.isInteger(config.minPlayers) || !Number.isInteger(config.maxPlayers)
        || config.minPlayers < 1 || config.maxPlayers < config.minPlayers) throw new Error('Invalid room capacity');
    if (!['account', 'tab'].includes(config.identity) || !['order', 'slots'].includes(config.layout)
        || !['host', 'all-ready'].includes(config.startMode)) throw new Error('Invalid room policy');
    if (config.identity === 'tab' && !sessionId) throw new Error('Tab identity requires a session ID');
    config.occupiedStatus = config.occupiedStatus || config.waitingStatus;
    Object.freeze(config);

    function currentPlayer() {
        const user = getUser();
        if (!user) return null;
        return Object.assign({}, user, { uid: config.identity === 'tab' ? user.uid + '_' + sessionId : user.uid });
    }
    function requirePlayer() {
        const player = currentPlayer();
        if (!player) throw error('auth', 'not signed in');
        return player;
    }
    function requireRoom(data) { if (!data) throw error('not-found', 'room not found'); }
    function playerIds(data, availableOnly = false) {
        if (!data) return [];
        const players = data.players || {};
        const order = data[config.layout] || Object.keys(players);
        return [...new Set(order.concat(Object.keys(players)))].filter(uid =>
            players[uid] && (!availableOnly || config.isAvailable(uid, data)));
    }
    function host(data) {
        const ids = playerIds(data), available = playerIds(data, true);
        if (available.includes(data && data.hostUid)) return data.hostUid;
        return available[0] || ids[0] || null;
    }
    function member(player, seat) {
        return { uid: player.uid, name: player.name || null, photo: player.photo || null,
            anon: !!player.anon, [config.layout === 'slots' ? 'slot' : 'order']: seat };
    }
    function seating(ids) {
        return { [config.layout]: config.layout === 'slots'
            ? Array.from({ length: config.maxPlayers }, (_, i) => ids[i] || null) : ids };
    }
    function departure(data, uid) {
        const players = Object.assign({}, data.players), player = players[uid]; delete players[uid];
        const ids = playerIds(data).filter(id => id !== uid);
        if (!ids.length) return { kind: 'delete' };
        const ready = Object.assign({}, data.ready); delete ready[uid];
        const presence = Object.assign({}, data.presence); delete presence[uid];
        const hostUid = players[data.hostUid] ? data.hostUid : ids[0];
        if (config.layout === 'slots') ids.forEach((id, slot) => { players[id] = Object.assign({}, players[id], { slot }); });
        return { kind: 'update', data: Object.assign({ players, ready, presence, hostUid }, seating(ids),
            config.onLeave(data, player, ids)) };
    }
    function canStart(data, uid = (currentPlayer() || {}).uid) {
        if (!data || config.isPlaying(data) || !uid || host(data) !== uid) return false;
        const ids = playerIds(data, true), ready = data.ready || {};
        return ids.length >= config.minPlayers && ids.every(id =>
            (config.startMode === 'host' && id === uid) || ready[id]);
    }
    async function create(input = {}) {
        const player = requirePlayer();
        for (let attempt = 0; attempt < 6; attempt++) {
            const code = generateCode();
            const created = await store.transact(code, data => {
                if (data) return { result: false };
                return { kind: 'create', data: Object.assign({ round: 0, game: {} }, config.onCreate(input), {
                    code, status: config.waitingStatus, hostUid: player.uid, maxPlayers: config.maxPlayers,
                    players: { [player.uid]: member(player, 0) }, ready: {},
                }, seating([player.uid])), result: true };
            });
            if (created) return code;
        }
        throw error('code', 'could not allocate a room code');
    }
    async function join(value) {
        const player = requirePlayer(), code = normalizeCode(value);
        return store.transact(code, data => {
            requireRoom(data);
            if ((data.players || {})[player.uid]) return { result: code };
            if (data.status !== config.waitingStatus || config.isPlaying(data)) throw error('started', 'already started');
            const ids = playerIds(data);
            if (ids.length >= config.maxPlayers) throw error('full', 'room full');
            const field = config.layout === 'slots' ? 'slot' : 'order';
            const used = new Set(ids.map(uid => data.players[uid][field]));
            let seat = 0; while (used.has(seat)) seat++;
            ids.push(player.uid);
            const ready = Object.assign({}, data.ready); delete ready[player.uid];
            return { kind: 'update', data: Object.assign({
                status: ids.length >= config.minPlayers ? config.occupiedStatus : config.waitingStatus,
                players: Object.assign({}, data.players, { [player.uid]: member(player, seat) }), ready,
            }, seating(ids), config.onJoin(data, player, ids)), result: code };
        });
    }
    async function leave(value) {
        const player = currentPlayer(), code = normalizeCode(value);
        if (!player) return;
        return store.transact(code, data => {
            if (!data || !(data.players || {})[player.uid]) return {}; // observers never change membership
            return departure(data, player.uid);
        });
    }
    async function releaseDisconnected(value, candidates) {
        const player = requirePlayer(), code = normalizeCode(value);
        return store.transact(code, data => {
            if (!data || !(data.players || {})[player.uid]) return { result: false };
            // Recheck the observed counter inside the transaction: a recovered player stays seated.
            const candidate = candidates.find(item => item.uid !== player.uid && (data.players || {})[item.uid]
                && !config.isAvailable(item.uid, data) && ((data.presence || {})[item.uid] === item.beat));
            if (!candidate) return { result: false };
            return Object.assign(departure(data, candidate.uid), { result: true });
        });
    }
    async function setReady(value, ready = true) {
        const player = requirePlayer(), code = normalizeCode(value);
        return store.transact(code, data => {
            requireRoom(data);
            if (!(data.players || {})[player.uid]) throw error('spectator', 'spectators cannot ready up');
            if (config.isPlaying(data)) return { result: false };
            return { kind: 'update', data: { ready: Object.assign({}, data.ready, { [player.uid]: !!ready }) }, result: true };
        });
    }
    async function start(value) {
        const player = requirePlayer(), code = normalizeCode(value);
        const matchId = globalThis.crypto.getRandomValues(new Uint32Array(4)).join('-');
        return store.transact(code, data => {
            requireRoom(data);
            if (!canStart(data, player.uid)) return { result: false };
            return { kind: 'update', data: Object.assign(matchFields(config.startPatch(data, playerIds(data, true)),
                { matchId, settledRound: 0 }), { ready: {} }), result: true };
        });
    }
    async function updateMatch(value, expected, buildPatch) {
        const player = requirePlayer(), code = normalizeCode(value);
        if (!['matchId', 'round', 'status'].every(key => Object.hasOwn(expected, key))) throw new Error('Incomplete match guard');
        return store.transact(code, data => {
            if (!data || !(data.players || {})[player.uid]) return { result: false };
            const game = data.game || {};
            if (!Object.entries(expected).every(([key, field]) => game[key] === field)) return { result: false };
            const patch = buildPatch(data, player.uid);
            return patch ? { kind: 'update', data: patch, result: true } : { result: false };
        });
    }
    function settleRound(code, expected, buildPatch) {
        return updateMatch(code, Object.assign({}, expected, { status: 'playing' }), (data, uid) => {
            if (!Number.isInteger(expected.round) || (data.game.settledRound || 0) >= expected.round) return null;
            const patch = buildPatch(data, uid);
            return patch ? matchFields(patch, { settledRound: expected.round }) : null;
        });
    }
    async function reset(value) {
        const player = requirePlayer(), code = normalizeCode(value);
        return store.transact(code, data => {
            requireRoom(data);
            if (host(data) !== player.uid || config.isPlaying(data)) return { result: false };
            return { kind: 'update', data: Object.assign({ status: config.waitingStatus, game: {}, round: 0 },
                config.onReset(data), { ready: {} }), result: true };
        });
    }
    const service = {
        config, currentPlayer, playerIds, host, canStart, create, join, leave, releaseDisconnected,
        setReady, start, reset, updateMatch, settleRound,
        watch: (code, cb) => store.watch(normalizeCode(code), cb),
        get: code => store.get(normalizeCode(code)),
        update: (code, patch) => store.update(normalizeCode(code), patch),
        remove: code => store.remove(normalizeCode(code)),
        cleanup: age => currentPlayer() ? store.cleanup(age) : Promise.resolve(0),
        session: callbacks => createRoomSession(service, callbacks),
    };
    return Object.freeze(service);
}

/** One subscription per game instance; detaching also invalidates queued snapshots. */
export function createRoomSession(service, { onChange = () => {}, onError = () => {} } = {}) {
    let room = null;
    function detach() {
        const previous = room; room = null;
        if (previous && previous.unsub) previous.unsub();
    }
    function attach(value, { spectate = false } = {}) {
        if (spectate && !service.config.allowSpectators) throw error('spectator', 'spectating is not supported');
        detach();
        const entry = { code: normalizeCode(value), data: null, unsub: null, spectate, starting: false };
        room = entry;
        const unsub = service.watch(entry.code, (data, err) => {
            if (room !== entry) return;
            if (err) { onError(err); return; }
            entry.data = data;
            onChange(data, entry);
            if (room === entry && !spectate && !entry.starting && service.config.startMode === 'all-ready' && service.canStart(data)) {
                entry.starting = true;
                service.start(entry.code).catch(onError).finally(() => { entry.starting = false; });
            }
        });
        if (room === entry) entry.unsub = unsub;
        else if (unsub) unsub(); // an immediate callback may have already detached
        return room;
    }
    async function leave() {
        const previous = room;
        detach();
        if (previous && !previous.spectate) await service.leave(previous.code);
    }
    return Object.freeze({ get room() { return room; }, attach, detach, leave });
}
