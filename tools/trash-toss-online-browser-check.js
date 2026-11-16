/* Real pages/lobbies/controller over the shared room service with an in-memory store.
 * Start a static server on 8000 and Chrome with --remote-debugging-port=9377 first.
 * node tools/trash-toss-online-browser-check.js [CDP port] [HTTP origin]
 */
'use strict';
const assert = require('node:assert/strict');
(async () => {
    const port = Number(process.argv[2] || 9377), origin = process.argv[3] || 'http://127.0.0.1:8000';
    const target = await (await fetch('http://127.0.0.1:' + port + '/json/new?' + encodeURIComponent(origin + '/index.html'), { method: 'PUT' })).json();
    const socket = new WebSocket(target.webSocketDebuggerUrl), pending = new Map(); let serial = 0;
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    socket.onmessage = event => { const msg = JSON.parse(event.data); if (!msg.id) return; const task = pending.get(msg.id); if (!task) return; pending.delete(msg.id); msg.error ? task.reject(new Error(msg.error.message)) : task.resolve(msg.result); };
    function command(method, params = {}) {
        const id = ++serial;
        return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
    }
    async function evaluate(fn, ...args) {
        const expression = '(' + fn.toString() + ')(' + args.map(JSON.stringify).join(',') + ')';
        const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception.description);
        return result.result.value;
    }
    try {
        await command('Page.enable');
        await command('Emulation.setDeviceMetricsOverride', { width: 960, height: 900, deviceScaleFactor: 1, mobile: false });
        const report = await evaluate(async () => {
            const { createRoomService, createRoomPresence } = await import('/js/net/rooms.mjs');
            const { applyRoomPatch } = await import('/js/net/rtdb-values.mjs');
            const { createRoomLobby } = await import('/js/net/room-lobby.mjs');
            const clone = value => structuredClone(value), rooms = new Map(), listeners = new Map(); let queue = Promise.resolve();
            const notify = code => { const data = clone(rooms.get(code) || null); for (const fn of listeners.get(code) || []) queueMicrotask(() => fn(clone(data))); };
            const errors = [], frames = [];
            window.addEventListener('error', e => errors.push(e.message));
            window.addEventListener('unhandledrejection', e => errors.push(String(e.reason?.stack || e.reason)));
            function store() {
                return {
                    transact(code, decide) {
                        const task = queue.then(() => {
                            const old = clone(rooms.get(code) || null), change = decide(old);
                            if (change.kind === 'create') rooms.set(code, clone(change.data));
                            if (change.kind === 'update') rooms.set(code, applyRoomPatch(old, change.data));
                            if (change.kind === 'delete') rooms.delete(code);
                            if (change.kind) notify(code);
                            return change.result;
                        }); queue = task.catch(() => {}); return task;
                    },
                    watch(code, fn) { if (!listeners.has(code)) listeners.set(code, new Set()); listeners.get(code).add(fn); queueMicrotask(() => fn(clone(rooms.get(code) || null))); return () => listeners.get(code).delete(fn); },
                    get: async code => clone(rooms.get(code) || null),
                    async update(code, patch) { rooms.set(code, applyRoomPatch(rooms.get(code), patch)); notify(code); },
                    async remove(code) { rooms.delete(code); notify(code); }, cleanup: async () => 0, isConnected: () => true,
                };
            }
            async function waitFor(test, description) {
                const until = Date.now() + 20000;
                while (Date.now() < until) { if (test()) return; await new Promise(r => setTimeout(r, 30)); }
                throw new Error('Timed out: ' + description + ' / ' + JSON.stringify({ errors, game: rooms.get('ABCD')?.game?.status, active: rooms.get('ABCD')?.game?.active, frames: frames.map(f => ({ disabled: f.document.getElementById('tt-throw').disabled, status: f.document.getElementById('tt-status').textContent, clock: f.document.getElementById('tt-clock').textContent, overlay: f.document.getElementById('overlay').hidden, lobby: f.document.getElementById('lobby')?.hidden })) }));
            }
            for (let i = 0; i < 2; i++) {
                const frame = document.createElement('iframe'); frame.width = 460; frame.height = 860; frame.src = '/games/trash-toss.html'; frame.style.cssText = 'position:fixed;top:0;left:' + (i * 470) + 'px;z-index:1000;background:white'; document.body.append(frame);
                await new Promise(resolve => frame.onload = resolve);
                const w = frame.contentWindow, user = { uid: 'browser-account', name: 'Browser P' + (i + 1) }, roomStore = store();
                w.addEventListener('error', e => errors.push(e.message));
                const net = { ok: true, onAuth: fn => { fn(user); return () => {}; }, currentUser: () => user,
                    signInGuest: async () => user, signInGoogle: async () => user, signOut: async () => {}, rooms: {
                        ready: async () => {}, now: Date.now,
                        presence: options => createRoomPresence(options),
                        create: config => createRoomService({ store: roomStore, getUser: () => user, sessionId: 'browser-' + i, generateCode: () => 'ABCD' }, config),
                        lobby: options => createRoomLobby({ ...options, document: w.document, parent: w.document.body }),
                    } };
                // setup is lazy; all game code and UI stay real, only the service transport is supplied here.
                w.ArcadeNet = net;
                const record = { w, document: w.document };
                frames.push(record);
                w.document.querySelector('[data-lang="en"]').click();
                w.document.getElementById('tt-scene').value = 'arena';
                w.document.getElementById('tt-online-room').click();
                w.document.getElementById('tt-online-room').click();
                await waitFor(() => w.document.querySelector('[data-lobby-action="create"]'), 'lobby entry');
                if (w.document.querySelectorAll('#lobby').length !== 1) throw new Error('Duplicate lobby from a double tap');
            }
            const a = frames[0], b = frames[1];
            const click = (f, action) => { const button = f.document.querySelector('[data-lobby-action="' + action + '"]'); if (!button || button.disabled) throw new Error('Unavailable action: ' + action); button.click(); };
            click(a, 'create'); await waitFor(() => rooms.has('ABCD'), 'create');
            b.document.querySelector('.lobby-code-input').value = 'ABCD'; click(b, 'join');
            await waitFor(() => Object.keys(rooms.get('ABCD').players).length === 2, 'join');
            click(b, 'primary'); await waitFor(() => Object.values(rooms.get('ABCD').ready).some(Boolean), 'ready');
            await waitFor(() => !a.document.querySelector('[data-lobby-action="primary"]').disabled, 'host enabled'); click(a, 'primary');
            await waitFor(() => rooms.get('ABCD').game?.status === 'aim' && !a.document.getElementById('tt-throw').disabled, 'host turn UI');
            if (!b.document.getElementById('tt-throw').disabled) throw new Error('Guest controls enabled during host turn');
            if (a.document.getElementById('tt-scene').value !== 'arena' || b.document.getElementById('tt-scene').value !== 'arena') throw new Error('Scene not synchronized');
            a.document.body.dispatchEvent(new a.w.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
            await new Promise(r => setTimeout(r, 400)); a.document.body.dispatchEvent(new a.w.KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
            await waitFor(() => rooms.get('ABCD').game.status === 'flight', 'host submitted throw');
            const shot = clone(rooms.get('ABCD').game.shot);
            await waitFor(() => rooms.get('ABCD').game.active === 1 && !b.document.getElementById('tt-throw').disabled, 'guest turn UI');
            if (!a.document.getElementById('tt-throw').disabled) throw new Error('Host controls enabled during guest turn');
            if (a.document.getElementById('tt-score-a').textContent !== b.document.getElementById('tt-score-a').textContent) throw new Error('Score mismatch');
            a.document.getElementById('tt-online-room').click(); await waitFor(() => !a.document.getElementById('lobby').hidden, 'reopen live lobby'); click(a, 'leave');
            await waitFor(() => rooms.get('ABCD').game.status === 'over' && !b.document.getElementById('overlay').hidden, 'departure results UI');
            if (!b.document.getElementById('overlay-title').textContent.includes('wins')) throw new Error('Forfeit winner missing');
            b.document.getElementById('overlay-btn').click(); await waitFor(() => !b.document.getElementById('lobby').hidden, 'results opens room'); click(b, 'primary');
            await waitFor(() => !rooms.get('ABCD').game.matchId, 'return to lobby');
            const result = { shot, scene: 'arena', errors, guest: b.document.getElementById('tt-scene').value, roomPlayers: Object.keys(rooms.get('ABCD').players).length };
            frames.forEach(f => f.w.frameElement.remove()); return result;
        });
        assert.deepEqual(report.errors, []);
        assert.equal(report.guest, 'arena'); assert.equal(report.roomPlayers, 1);
        assert.ok(report.shot.power > 0 && report.shot.power < 100);
        console.log('PASS: two real game pages, lobby create/join/ready/start, shared scene, active-seat controls, accepted charged throw, turn/score synchronization, departure result and return to lobby.');
    } finally {
        socket.close(); await fetch('http://127.0.0.1:' + port + '/json/close/' + target.id);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
