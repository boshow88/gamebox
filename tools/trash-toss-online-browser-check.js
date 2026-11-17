/* Real pages/lobbies/controller over the shared room service with an in-memory store.
 * Start a static server on 8000 and Chrome with --remote-debugging-port=9377 first.
 * node tools/trash-toss-online-browser-check.js [CDP port] [HTTP origin]
 */
'use strict';
const assert = require('node:assert/strict');
(async () => {
    const port = Number(process.argv[2] || 9377), origin = process.argv[3] || 'http://127.0.0.1:8000', preview = process.argv.includes('--lobby-preview');
    const perf = process.argv.includes('--perf');
    const legacy = process.argv.includes('--legacy-room-flow');
    const throttle = Number(process.argv.find(arg=>arg.startsWith('--throttle='))?.slice(11)||'1');
    const output = process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||'/tmp/trash-toss-online-performance.json';
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
        await command('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
            if (${legacy}) {
                let create;
                Object.defineProperty(window, 'createTrashTossOnline', { configurable: true, get: () => create, set(value) {
                    create = options => { const api = value(options); api.playAgain ||= api.open; return api; };
                } });
            }
            let api; window.__throwStarts = []; window.__emptyHandFrames = 0;
            Object.defineProperty(window, 'TrashTossView', { configurable: true, get: () => api, set(value) {
                api = value; const create = value.create;
                value.create = function (canvas) {
                    const view = create(canvas), render = view.render; let flying = false;
                    view.render = function (model) {
                        window.__throwModel = { held: model.aiming, charging: model.charging, ball: !!model.ball };
                        if (window.__trackRelease) {
                            if (model.ball) window.__trackRelease = false;
                            else if (!model.aiming) window.__emptyHandFrames++;
                        }
                        if (model.ball && !flying) window.__throwStarts.push({ x: model.ball.x, age: model.ball.age });
                        flying = !!model.ball; return render(model);
                    }; return view;
                };
            } });
        })();` });
        await command('Emulation.setDeviceMetricsOverride', { width: preview ? 375 : perf ? 780 : 960, height: preview ? 812 : 900, deviceScaleFactor: perf ? 2 : 1, mobile: false });
        if(perf)await command('Emulation.setCPUThrottlingRate',{rate:throttle});
        const report = await evaluate(async (preview,perf,legacy) => {
            const { createRoomService, createRoomPresence } = await import('/js/net/rooms.mjs');
            const { applyRoomPatch } = await import('/js/net/rtdb-values.mjs');
            const { createRoomLobby } = await import('/js/net/room-lobby.mjs');
            const clone = value => structuredClone(value), rooms = new Map(), listeners = new Map(); let queue = Promise.resolve();
            let latency = 0;
            const samples=[];
            const notify = code => { const data = clone(rooms.get(code) || null); for (const fn of listeners.get(code) || []) setTimeout(() => fn(clone(data)), latency); };
            const errors = [], frames = [];
            window.addEventListener('error', e => errors.push(e.message));
            window.addEventListener('unhandledrejection', e => errors.push(String(e.reason?.stack || e.reason)));
            function store(control) {
                return {
                    transact(code, decide) {
                        if(control.failNext) { control.failNext=false;return Promise.reject(Object.assign(new Error('Simulated network failure'),{code:'database/network-error'})); }
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
                    async remove(code) { rooms.delete(code); notify(code); }, cleanup: async () => 0, isConnected: () => control.online,
                };
            }
            async function waitFor(test, description) {
                const until = Date.now() + 20000;
                while (Date.now() < until) { if (test()) return; await new Promise(r => setTimeout(r, 30)); }
                throw new Error('Timed out: ' + description + ' / ' + JSON.stringify({ errors, game: rooms.get('ABCD')?.game?.status, active: rooms.get('ABCD')?.game?.active, frames: frames.map(f => ({ disabled: f.document.getElementById('tt-throw').disabled, status: f.document.getElementById('tt-status').textContent, clock: f.document.getElementById('tt-clock').textContent, overlay: f.document.getElementById('overlay').hidden, lobby: f.document.getElementById('lobby')?.hidden })) }));
            }
            for (let i = 0; i < 2; i++) {
                const frame = document.createElement('iframe'); frame.width = perf?375:460; frame.height = perf?812:860; frame.src = '/games/trash-toss.html'; frame.style.cssText = 'position:fixed;top:0;left:' + (i * (perf?385:470)) + 'px;z-index:1000;background:white'; document.body.append(frame);
                await new Promise(resolve => frame.onload = resolve);
                const w = frame.contentWindow, user = { uid: 'browser-account', name: 'Browser P' + (i + 1) }, control={online:true,failNext:false}, roomStore = store(control);
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
                const record = { w, document: w.document, control };
                frames.push(record);
                w.document.querySelector('[data-lang="en"]').click();
                w.document.getElementById('tt-scene').value = 'arena';
                w.document.getElementById('tt-online-room').click();
                w.document.getElementById('tt-online-room').click();
                await waitFor(() => w.document.querySelector('[data-lobby-action="create"]'), 'lobby entry');
                if (w.document.querySelectorAll('#lobby').length !== 1) throw new Error('Duplicate lobby from a double tap');
            }
            const a = frames[0], b = frames[1];
            async function sample(label,action) {
                frames.forEach(f=>f.w.__ttPerf.clear());const at=performance.now();
                if(action)await action();
                await new Promise(resolve=>setTimeout(resolve,1000));
                const ms=performance.now()-at;
                samples.push({label,ms,clients:frames.map(f=>({fps:f.w.__ttPerf.frames.length/ms*1000,stats:clone(f.w.__ttPerf.stats),events:clone(f.w.__ttPerf.events),mutations:f.w.__ttPerf.mutations}))});
            }
            const click = (f, action) => { const button = f.document.querySelector('[data-lobby-action="' + action + '"]'); if (!button || button.disabled) throw new Error('Unavailable action: ' + action); button.click(); };
            click(a, 'create'); await waitFor(() => rooms.has('ABCD'), 'create');
            b.document.querySelector('.lobby-code-input').value = 'ABCD'; click(b, 'join');
            await waitFor(() => Object.keys(rooms.get('ABCD').players).length === 2, 'join');
            await waitFor(() => a.document.getElementById('tt-room-scene'), 'room scene control');
            if (!b.document.getElementById('tt-room-scene').disabled) throw new Error('Guest may change host settings');
            const changeScene = (f, scene) => {
                const select = f.document.getElementById('tt-room-scene'); select.value = scene;
                select.dispatchEvent(new f.w.Event('change', { bubbles: true }));
            };
            changeScene(a, 'park'); await waitFor(() => rooms.get('ABCD').options.scene === 'park' && b.document.getElementById('tt-room-scene').value === 'park', 'room map synchronization');
            changeScene(a, 'arena'); await waitFor(() => rooms.get('ABCD').options.scene === 'arena' && b.document.getElementById('tt-room-scene').value === 'arena', 'second map selection');
            if (preview) {
                a.w.frameElement.remove(); b.w.frameElement.width = 375; b.w.frameElement.height = 812;
                b.w.frameElement.style.left = '0';
                await new Promise(r => setTimeout(r, 150));
                return { preview: true };
            }
            const ready = b.document.querySelector('[data-lobby-action="primary"]');
            const leave = b.document.querySelector('[data-lobby-action="leave"]');
            const primaryBox = ready.getBoundingClientRect(), leaveBox = leave.getBoundingClientRect();
            if (primaryBox.height < 56 || leaveBox.height < 44 || primaryBox.width <= leaveBox.width * 1.4 || primaryBox.y >= leaveBox.y) throw new Error('Ready action does not dominate the leave action');
            click(b, 'primary'); await waitFor(() => Object.values(rooms.get('ABCD').ready).some(Boolean), 'ready');
            await waitFor(() => !a.document.querySelector('[data-lobby-action="primary"]').disabled, 'host enabled'); click(a, 'primary');
            await waitFor(() => rooms.get('ABCD').game?.status === 'aim' && !a.document.getElementById('tt-throw').disabled, 'host turn UI');
            if (!b.document.getElementById('tt-throw').disabled) throw new Error('Guest controls enabled during host turn');
            if (a.document.getElementById('tt-scene').value !== 'arena' || b.document.getElementById('tt-scene').value !== 'arena') throw new Error('Scene not synchronized');
            if(perf) {
                await sample('aim');
                await sample('unchanged snapshots',async()=>{for(let i=0;i<20;i++)notify('ABCD');await new Promise(resolve=>setTimeout(resolve,100));});
                a.document.getElementById('tt-online-room').click();
                await waitFor(()=>!a.document.getElementById('lobby').hidden,'covered field');
                await sample('room dialog covers host field');
                a.document.querySelector('#lobby .lobby-close').click();
                await waitFor(()=>a.document.getElementById('lobby').hidden,'close live lobby');
            }
            latency = 200;
            if (!legacy) {
            // Losing connection while charging is visible and recoverable, not a
            // surprise room dialog or an accidental throw after finger release.
            a.document.body.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
            await new Promise(resolve=>setTimeout(resolve,150));a.control.online=false;
            await waitFor(()=>a.document.getElementById('tt-status').textContent.includes('Reconnecting'),'reconnection feedback');
            a.document.body.dispatchEvent(new a.w.KeyboardEvent('keyup',{key:' ',code:'Space',bubbles:true}));
            if(!a.document.getElementById('lobby').hidden||rooms.get('ABCD').game.status!=='aim')throw Error('Temporary disconnect unexpectedly left the game');
            a.control.online=true;await waitFor(()=>!a.document.getElementById('tt-throw').disabled&&!a.document.getElementById('tt-status').textContent.includes('Reconnecting'),'controls recover after reconnect');
            a.control.failNext=true;
            a.document.body.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
            await new Promise(resolve=>setTimeout(resolve,150));a.document.body.dispatchEvent(new a.w.KeyboardEvent('keyup',{key:' ',code:'Space',bubbles:true}));
            await waitFor(()=>!a.document.getElementById('tt-throw').disabled&&a.document.getElementById('tt-status').textContent.includes('synchronization'),'failed submission is explained and retryable');
            if(!a.document.getElementById('lobby').hidden||rooms.get('ABCD').game.status!=='aim')throw Error('Transient submit failure opened the room or committed a throw');
            }
            for(const f of frames){f.w.__trackRelease=true;f.w.__emptyHandFrames=0;}
            a.document.body.dispatchEvent(new a.w.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
            await new Promise(r => setTimeout(r, 400)); a.document.body.dispatchEvent(new a.w.KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
            await waitFor(() => rooms.get('ABCD').game.status === 'flight', 'host submitted throw');
            await new Promise(resolve=>setTimeout(resolve,30));
            if(!a.document.getElementById('tt-throw').disabled||!a.w.__throwModel.held)throw Error('Commit ack unlocked the input or hid the held object before the delayed snapshot');
            const shot = clone(rooms.get('ABCD').game.shot);
            await waitFor(() => b.w.__throwStarts.length > 0, 'opponent launch rendered with delayed snapshots');
            if (b.w.__throwStarts[0].age > .06) throw new Error('Opponent first visible frame skipped the launch: ' + JSON.stringify(b.w.__throwStarts));
            if(frames.some(f=>f.w.__emptyHandFrames))throw Error('Held object blinked before the shared launch');
            if(perf)await sample('flight');
            await waitFor(() => rooms.get('ABCD').game.active === 1 && !b.document.getElementById('tt-throw').disabled, 'guest turn UI');
            if (!a.document.getElementById('tt-throw').disabled) throw new Error('Host controls enabled during guest turn');
            if (a.document.getElementById('tt-score-a').textContent !== b.document.getElementById('tt-score-a').textContent) throw new Error('Score mismatch');
            a.document.getElementById('tt-online-room').click(); await waitFor(() => !a.document.getElementById('lobby').hidden, 'reopen live lobby'); click(a, 'leave');
            await waitFor(() => rooms.get('ABCD').game.status === 'over' && !b.document.getElementById('overlay').hidden, 'departure results UI');
            if (!b.document.getElementById('overlay-title').textContent.includes('wins')) throw new Error('Forfeit winner missing');
            const finishedMatch = rooms.get('ABCD').game.matchId;
            b.document.getElementById('overlay-btn').click();
            if (legacy) { await waitFor(() => !b.document.getElementById('lobby').hidden, 'legacy results room'); click(b, 'primary'); }
            await waitFor(() => !rooms.get('ABCD').game.matchId && !b.document.getElementById('lobby').hidden && !b.document.getElementById('tt-room-scene').disabled, 'one-click play again opens scene selection');
            changeScene(b, 'park');
            await waitFor(() => rooms.get('ABCD').options.scene === 'park' && b.document.getElementById('tt-scene').value === 'park', 'host switches map after the match in the same room');
            await waitFor(() => a.document.querySelector('.lobby-code-input'), 'departed player can rejoin');
            a.document.querySelector('.lobby-code-input').value = 'ABCD'; click(a,'join');
            await waitFor(() => Object.keys(rooms.get('ABCD').players).length === 2,'same room rejoined');
            await waitFor(()=>a.document.querySelector('[data-lobby-action="primary"]')&&!a.document.querySelector('[data-lobby-action="primary"]').disabled,'rejoined player can ready');
            click(a,'primary');
            await waitFor(() => !b.document.querySelector('[data-lobby-action="primary"]').disabled,'rematch ready');click(b,'primary');
            await waitFor(() => rooms.get('ABCD').game.status === 'aim' && rooms.get('ABCD').game.matchId !== finishedMatch && !b.document.getElementById('tt-throw').disabled,'selected scene starts without an extra return action');
            const retainedPlayers=Object.keys(rooms.get('ABCD').players).length;
            if (!legacy) {
            rooms.delete('ABCD');notify('ABCD');
            await waitFor(()=>frames.every(f=>!f.document.getElementById('lobby').hidden&&f.document.querySelector('.lobby-code-input')),'removed room gives a clear create/join recovery');
            if(frames.some(f=>!f.document.querySelector('.lobby-status').textContent.includes('no longer exists')))throw Error('Missing room was reported as a generic connection failure');
            }
            const result = { firstVisible: b.w.__throwStarts[0], readySize: { width: primaryBox.width, height: primaryBox.height }, leaveSize: { width: leaveBox.width, height: leaveBox.height }, shot, scene: 'park', errors, guest: b.document.getElementById('tt-scene').value, roomPlayers: retainedPlayers,samples };
            frames.forEach(f => f.w.frameElement.remove()); return result;
        }, preview,perf,legacy);
        if (report.preview) {
            const shot = await command('Page.captureScreenshot', { format: 'png' });
            require('node:fs').writeFileSync('/tmp/trash-toss-lobby-preview.png', Buffer.from(shot.data, 'base64'));
            console.log('Lobby preview: /tmp/trash-toss-lobby-preview.png'); return;
        }
        assert.deepEqual(report.errors, []);
        assert.equal(report.guest, 'park'); assert.equal(report.roomPlayers, 2);
        if(process.argv.includes('--expect-optimized')) {
            const unchanged=report.samples.find(sample=>sample.label==='unchanged snapshots');
            assert(unchanged.clients.every(client=>!client.events.gameChanges&&!client.events.storageWrites),'Presence-only snapshots must not refresh game state or write preferences');
            const covered=report.samples.find(sample=>sample.label==='room dialog covers host field');
            assert.equal(covered.clients[0].stats.project?.calls||0,0,'A covered field must not run local physics replay');
        }
        assert.ok(report.shot.power > 0 && report.shot.power < 100);
        console.log('Observed first frame:', report.firstVisible, 'Ready/Leave:', report.readySize, report.leaveSize);
        console.log(legacy ? 'PASS: legacy room comparison, shared launch, score synchronization and room scene change.' : 'PASS: two real game pages, room create/join/ready/start, reconnect/retry without modal interruption, continuous held object, ack-before-snapshot lock, shared launch, score synchronization, one-click rematch scene selection and removed-room recovery.');
        if(perf) {
            require('node:fs').writeFileSync(output,JSON.stringify({environment:{browser:'headless Chrome, two same-process 375x812 frames @2x',cpuThrottle:throttle,network:'local fake RTDB, 200ms snapshot delay'},...report},null,2)+'\n');
            console.log('Online samples:',JSON.stringify(report.samples.map(s=>({label:s.label,clients:s.clients.map(c=>({fps:+c.fps.toFixed(1),gameChanges:c.events.gameChanges||0,storageWrites:c.events.storageWrites||0,project:c.stats.project?.calls||0}))}))));
            console.log('Report:',output);
        }
    } finally {
        socket.close(); await fetch('http://127.0.0.1:' + port + '/json/close/' + target.id);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
