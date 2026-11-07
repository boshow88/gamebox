/** Independent Chrome contexts + HTTP fake RTDB. Never contacts production Firebase. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..'), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const backend = require('./helpers/network-rtdb-fixture.js')();
const Rules = require('../js/games/darts-rules.js');
const auth = `export const getAuth=()=>({}), onAuthStateChanged=(_auth,cb)=>queueMicrotask(()=>cb({uid:'same-account',displayName:'Player',isAnonymous:true}));
export class GoogleAuthProvider {} export const signInAnonymously=async()=>{},signOut=async()=>{},signInWithPopup=async()=>{};`;
const firestore = `export const getFirestore=()=>({}),doc=(_db,...parts)=>parts.join('/'),getDoc=async()=>({exists:()=>false}),getDocs=async()=>({docs:[]}),setDoc=async()=>{},updateDoc=async()=>{},deleteDoc=async()=>{},serverTimestamp=()=>Date.now(),deleteField=()=>null,collection=()=>'',query=()=>'',orderBy=()=>'',limit=n=>n;`;
function instrument(source) {
    return source.replace('setInterval(function () {', 'window.__dartsMaintenance = function () {').replace('}, 1000);', '};')
        .replace('function tickCpu() {', 'function tickCpu() { if(window.__cpuAutoBlocked) return;')
        .replace(/\}\)\(\);\s*$/, `
        window.__cpuTest = {
            snapshot: () => ({ data:roomData(), match:match, uid:controllerId(), pending:cpuPending, last:lastCpuThrow, sending:sending,
                feedback:feedbackState, state:G.dartState, gesture:!!gesture, choices:window.__cpuChoices||0, now:Date.now(), lobby:document.getElementById('lobby').open }),
            step: (stamp,dt=0,runCpu=true) => { window.__clock=stamp;window.__cpuAutoBlocked=!runCpu;try{if(shell.isPlaying()) update(dt);syncGameUi();render();}finally{window.__cpuAutoBlocked=true;} },
            seed: seed => {cpuRandom=window.DartsCpuGesture.seeded(seed);},
            human: () => {if(!canThrow())return false;var seat=match.players.indexOf(match.active),target=match.phase==='cork'?{x:(seat+1)*6,y:0}:window.DartsCpuStrategy.target(20-seat%3,1),generated=cpuGesture.ideal(target);return submitGesture(generated.samples,()=>throwGuide.complete());},
            replay: samples => {var th=computeThrow(analyseGesture(samples));return computeImpact(th);},
            controller: () => online,
            probe: seed => {var rng=window.DartsCpuGesture.seeded(seed),p=match.participants[match.active],target=window.DartsCpuStrategy.choose(match,match.active,p.difficulty,rng),samples=cpuGesture.generate(target,p.difficulty,rng).samples;return computeImpact(computeThrow(analyseGesture(samples)));}
        };})();`);
}
async function until(check, label, timeout = 15000) {
    const limit = Date.now() + timeout;
    while (Date.now() < limit) { if (await check()) return; await pause(35); }
    throw new Error('Timed out: ' + label);
}
class Protocol {
    constructor(socket) {
        this.socket = socket; this.serial = 0; this.pending = new Map();
        socket.addEventListener('message', event => {
            const message = JSON.parse(event.data), pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
        });
    }
    send(method, params = {}, sessionId) {
        const id = ++this.serial;
        return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params, sessionId })); });
    }
}
(async () => {
    const codec = await import('../js/net/rtdb-values.mjs');
    const server = http.createServer(async (request, response) => {
        try {
            const url = new URL(request.url, 'http://localhost');
            if (url.pathname === '/__fixture') { await backend.handle(request, response, url); return; }
            let body, type = 'text/javascript';
            if (url.pathname === '/__sdk/firebase-app.js') body = 'export const initializeApp=()=>({});';
            else if (url.pathname === '/__sdk/firebase-auth.js') body = auth;
            else if (url.pathname === '/__sdk/firebase-firestore.js') body = firestore;
            else if (url.pathname === '/__sdk/firebase-database.js') body = backend.sdk;
            else {
                const file = path.resolve(root, '.' + url.pathname);
                if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
                body = fs.readFileSync(file, 'utf8');
                if (file.endsWith('firebase-config.js')) body += '\nwindow.FIREBASE_ROOMS={databaseURL:"https://fixture.firebaseio.com"};';
                if (file.endsWith('net.js')) body = body.replace('const BASE = `https://www.gstatic.com/firebasejs/${SDK}`;', "const BASE=location.origin+'/__sdk';");
                if (file.endsWith('darts.js')) body = instrument(body);
                if (file.endsWith('darts-cpu-strategy.js')) body += '\nconst choose=window.DartsCpuStrategy.choose;window.DartsCpuStrategy.choose=(...args)=>{window.__cpuChoices=(window.__cpuChoices||0)+1;return choose(...args);};';
                if (file.endsWith('.html')) {
                    type = 'text/html'; body = body.replace('<head>', '<head><script>window.__cpuAutoBlocked=true;window.__clock=100000;Date.now=()=>window.__clock;window.__pageErrors=[];addEventListener("error",e=>__pageErrors.push(e.message));addEventListener("unhandledrejection",e=>__pageErrors.push(String(e.reason)));</script>');
                } else if (file.endsWith('.css')) type = 'text/css';
                else if (file.endsWith('.svg')) type = 'image/svg+xml';
            }
            response.writeHead(200, { 'Content-Type': type + ';charset=utf-8', 'Cache-Control': 'no-store' }); response.end(body);
        } catch (error) { response.writeHead(500); response.end(String(error)); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebox-online-cpu-'));
    const chrome = process.argv[2] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
        '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    let protocol;
    const deadline = setTimeout(() => { console.error('Browser test exceeded 150 seconds'); browser.kill(); process.exitCode = 1; }, 150000);
    try {
        const portFile = path.join(profile, 'DevToolsActivePort'); await until(() => fs.existsSync(portFile), 'Chrome debugger');
        const [port, endpoint] = fs.readFileSync(portFile, 'utf8').split(/\r?\n/);
        const socket = new WebSocket('ws://127.0.0.1:' + port + endpoint);
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
        protocol = new Protocol(socket);
        async function page(width, height) {
            const { browserContextId } = await protocol.send('Target.createBrowserContext');
            const { targetId } = await protocol.send('Target.createTarget', { url: 'about:blank', browserContextId });
            const { sessionId } = await protocol.send('Target.attachToTarget', { targetId, flatten: true });
            const client = {
                browserContextId, sessionId,
                eval: async expression => {
                    const result = await protocol.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
                    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
                    return result.result.value;
                }
            };
            await protocol.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 761 }, sessionId);
            await protocol.send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/games/darts.html' }, sessionId);
            await until(() => client.eval('!!window.__cpuTest && __cpuTest.snapshot().lobby'), 'independent Darts page');
            await client.eval("ArcadeCommon.i18n.setLocale('en')"); return client;
        }
        const a = await page(390, 844), b = await page(1200, 800), c = await page(320, 568), pages = [a, b];
        const state = p => p.eval('__cpuTest.snapshot()');
        async function click(p, id) {
            await until(() => p.eval(`!!document.getElementById(${JSON.stringify(id)}) && !document.getElementById(${JSON.stringify(id)}).disabled`), 'enabled control ' + id);
            await p.eval(`document.getElementById(${JSON.stringify(id)}).click()`);
        }
        async function setting(p, id, value, field) {
            await p.eval(`(()=>{const el=document.getElementById(${JSON.stringify(id)});el.value=${JSON.stringify(String(value))};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
            await until(async () => String((await state(p)).data.options[field]) === String(value) && await p.eval('!document.getElementById("' + id + '").disabled'), 'setting ' + id);
        }
        async function addCpu(p) {
            await until(() => p.eval('!document.getElementById("add-cpu-btn").disabled'), 'CPU addition available');
            const count = (await state(p)).data.seatOrder.length; await click(p, 'add-cpu-btn');
            await until(async () => (await state(p)).data.seatOrder.length === count + 1, 'new CPU');
            const id = (await state(p)).data.seatOrder.at(-1);
            await until(() => p.eval(`[...document.querySelectorAll('.slot-difficulty')].some(el=>el.dataset.cpuSlot===${JSON.stringify(id)}&&!el.disabled)`), 'editable owned CPU');
            return id;
        }
        await setting(a, 'mode-select', 'countup', 'mode'); await setting(a, 'timer-select', 0, 'turnMs');
        await setting(a, 'rounds-select', 5, 'roundLimit');
        const cpuA = await addCpu(a); await click(a, 'create-room-btn');
        await until(async () => !!(await state(a)).data.code, 'coded CPU room');
        const code = (await state(a)).data.code, roomPath = 'rooms/darts_rooms/R-' + code;
        const read = () => codec.decodeRoomValue(backend.read(roomPath));
        const put = value => backend.write(roomPath, codec.encodeRoomValue(value));
        const uidA = (await state(a)).uid;
        assert.equal(read().participants[cpuA].type, 'cpu'); assert.equal(read().participants[cpuA].controllerId, uidA);
        // One human + three CPUs remains the reservation/local execution path.
        const extras = [await addCpu(a), await addCpu(a)];
        const local = read(); local.seed = 1; put(local); await pause(80); await click(a, 'lobby-start-btn');
        await until(async () => (await state(a)).match?.execution === 'local' && !(await state(a)).lobby, 'coded local CPU start');
        let snap = await state(a); await a.eval(`__cpuTest.step(${snap.now + 2000},0)`); snap = await state(a);
        await a.eval(`__cpuTest.step(${snap.pending.at},0);__cpuTest.step(${snap.pending.at},1)`);
        assert.equal((await state(a)).match.seq, 1); assert.equal(read().game.seq, 0);
        await click(a, 'restart-btn'); await until(async () => (await state(a)).data.phase === 'lobby', 'reserved CPU restart');
        for (const id of extras) {
            assert.equal(await a.eval(`__cpuTest.controller().removeLocalPlayer(${JSON.stringify(id)})`), true);
            await until(async () => !(await state(a)).data.participants[id], 'removed extra CPU');
        }
        await pause(100);
        async function join(p) {
            await p.eval(`document.getElementById('room-code-input').value=${JSON.stringify(code)}`); await click(p, 'join-room-btn');
            await until(async () => (await state(p)).data.code === code, 'joined independent context');
        }
        await join(b); const uidB = (await state(b)).uid;
        let cpuB = await addCpu(b);
        assert.notEqual(uidA, uidB, 'Same account in independent contexts has separate device identities');
        await until(async () => (await state(a)).data.participants[cpuB]?.controllerId === uidB, 'guest CPU propagated');
        await click(b, 'lobby-start-btn');
        await until(() => read().ready[uidB], 'guest Ready');
        await b.eval(`(()=>{const el=[...document.querySelectorAll('.slot-difficulty')].find(el=>el.dataset.cpuSlot===${JSON.stringify(cpuB)});el.value='insane';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await until(() => read().participants[cpuB].difficulty === 'insane' && !Object.keys(read().ready).length, 'difficulty resets authoritative Ready');
        assert.equal(await a.eval(`__cpuTest.controller().setCpuDifficulty(${JSON.stringify(cpuB)},'easy')`), false);
        assert.equal(await a.eval(`[...document.querySelectorAll('.slot-difficulty')].find(el=>el.dataset.cpuSlot===${JSON.stringify(cpuB)}).disabled`), true);
        // Three independent contexts: two mobile viewports and one desktop, one CPU.
        await until(async () => (await state(a)).data.revision === read().revision, 'host sees guest difficulty revision');
        assert.equal(await a.eval(`__cpuTest.controller().removeLocalPlayer(${JSON.stringify(cpuA)})`), true);
        await until(async () => !(await state(a)).data.participants[cpuA], 'host CPU removal published');
        await join(c); pages.push(c);
        await until(async () => (await Promise.all(pages.map(state))).every(s => s.data.revision === read().revision), 'third-device join propagated');
        await click(b, 'lobby-start-btn'); await click(c, 'lobby-start-btn');
        await until(() => Object.keys(read().ready).length === 2, 'two guest devices Ready');
        await b.eval(`__cpuTest.controller().setCpuDifficulty(${JSON.stringify(cpuB)},'hard')`);
        await until(async () => (await Promise.all(pages.map(state))).every(s => !Object.keys(s.data.ready).length && s.data.revision === read().revision), 'Ready reset on all three devices');
        async function start() {
            await until(async () => (await Promise.all(pages.map(state))).every(s => s.data.revision === read().revision), 'current start revision');
            for (const p of pages) if ((await state(p)).uid !== read().hostUid) await click(p, 'lobby-start-btn');
            const host = pages.find(p => p === a) || b;
            await until(() => host.eval('!document.getElementById("lobby-start-btn").disabled'), 'host start enabled'); await click(host, 'lobby-start-btn');
            await until(async () => (await Promise.all(pages.map(state))).every(s => s.match?.matchId === read().game.matchId && !s.lobby), 'synchronized start');
        }
        async function advance(stamp, dt = 0, runCpu = true) { await Promise.all(pages.map(p => p.eval(`__cpuTest.step(${stamp},${dt},${runCpu})`))); }
        async function pulse() {
            await Promise.all(pages.map(p => p.eval(`window.__cpuNetwork.online?__cpuTest.controller().service.heartbeat(${JSON.stringify(code)},0):false`)));
            await pause(60);
        }
        async function settle() {
            const snapshots = await Promise.all(pages.map(state));
            const stamp = Math.max(read().game.readyAt || 0, ...snapshots.map(s => s.now)) + 2001;
            await advance(stamp, 1, false); await advance(stamp + 2001, 1, false); await pulse(); await advance(stamp + 2001, 0); return stamp + 2001;
        }
        async function agree(seq) {
            await until(async () => (await Promise.all(pages.map(state))).every(s => s.match?.seq === seq), 'accepted CPU sequence on all contexts');
            for (const p of pages) assert.deepEqual((await state(p)).match, read().game);
        }
        async function dart() {
            const stamp = await settle(), before = read().game, ownerId = before.owners[before.active];
            const p = (await Promise.all(pages.map(async p => ({ p, s: await state(p) })))).find(entry => entry.s.uid === ownerId).p;
            const own = await state(p), choices = await Promise.all(pages.map(async page => (await state(page)).choices));
            if (before.participants[before.active].type === 'cpu') {
                assert.equal(await p.eval('__cpuTest.human()'), false, 'Human input cannot control an online CPU');
                assert(own.pending, 'Only the CPU owner schedules a dart');
                for (const other of pages.filter(other => other !== p)) assert.equal((await state(other)).pending, null);
                await advance(Math.max(stamp, own.pending.at), 0);
            } else {
                if (own.feedback.handoff) await click(p, 'handoff-ready-btn');
                assert.equal(await p.eval('__cpuTest.human()'), true, JSON.stringify({ mode: before.mode, phase: before.phase, feedback: own.feedback, state: own.state, sending: own.sending }));
            }
            await agree(before.seq + 1);
            if (before.participants[before.active].type === 'cpu') {
                const last = (await state(p)).last, replay = await p.eval('__cpuTest.replay(__cpuTest.snapshot().last.samples)');
                assert.deepEqual(replay, read().game.lastThrow.impact);
                assert.equal(last.player, before.active);
                for (let i = 0; i < pages.length; i++) if (pages[i] !== p) assert.equal((await state(pages[i])).choices, choices[i], 'Observers never run CPU strategy');
            }
            return p;
        }
        await start();
        for (let i = 0; i < 12; i++) await dart();
        console.log('PASS: three isolated contexts agree on owner-only CPU turns and shared Ready revisions.');
        // Return without replacing the room, then restore two devices with one CPU each.
        async function returnLobby() {
            const room = read(); room.game.status = 'over'; room.game.seq++; room.game.endReason = 'cancelled'; room.phase = 'results'; room.status = 'results'; put(room);
            await agree(room.game.seq); await pulse(); assert.equal(await a.eval('__cpuTest.controller().backToLobby()'), true);
            await until(async () => (await Promise.all(pages.map(state))).every(s => s.data.phase === 'lobby'), 'same room lobby');
        }
        await returnLobby(); await click(c, 'leave-room-btn'); pages.pop(); await pause(100);
        const cpuA2 = await addCpu(a);
        await start();
        let delayed = false;
        while (read().game.status === 'playing') {
            const g = read().game;
            if (!delayed && g.participants[g.active].type === 'cpu') {
                const p = g.owners[g.active] === uidA ? a : b;
                await p.eval('window.__cpuNetwork.ackDelay=1600');
                await dart(); await p.eval('window.__cpuNetwork.ackDelay=0');
                const seq = read().game.seq;
                await p.eval('window.__cpuNetwork.ackDelay=80;window.__cpuNetwork.rejectAck=true');
                await dart(); assert.equal(read().game.seq, seq + 1); await p.eval('window.__cpuNetwork.ackDelay=0');
                delayed = true;
            } else await dart();
        }
        await settle();
        assert(read().game.history.some(row => row.uid === cpuB) && read().game.history.some(row => row.uid === cpuA2));
        assert.equal(read().game.history.filter(row => row.phase !== 'cork').reduce((sum, row) => sum + row.darts.length, 0), 60);
        console.log('PASS: three isolated Chrome contexts, mobile/desktop, owner-only CPU scheduling, Ready propagation, coded local execution, physical replay and complete Count-Up with delayed/repeated network delivery.');
        await returnLobby();
        // Both Cricket variants and X01 opening Cork use the same online scheduler.
        for (const [mode, variant] of [['cricket', 'standard'], ['cricket', 'cutthroat'], ['x01', null]]) {
            await setting(a, 'mode-select', mode, 'mode'); await setting(a, 'timer-select', 0, 'turnMs');
            if (variant) await setting(a, 'cricket-select', variant, 'cricketVariant');
            else await setting(a, 'starting-player-select', 'cork', 'startingPlayer');
            await start(); for (let i = 0; i < 12; i++) await dart(); await returnLobby();
        }
        // A host can retain two humans around its CPU without losing handoff identity.
        await setting(a, 'mode-select', 'countup', 'mode'); await setting(a, 'timer-select', 0, 'turnMs');
        await setting(a, 'starting-player-select', 'random', 'startingPlayer');
        await until(async () => (await Promise.all(pages.map(state))).every(s => s.data.revision === read().revision), 'handoff settings on both devices');
        assert.equal(await b.eval(`__cpuTest.controller().removeLocalPlayer(${JSON.stringify(cpuB)})`), true);
        await until(async () => (await Promise.all(pages.map(state))).every(s => s.data.revision === read().revision), 'CPU removal before local human');
        const previousIds = read().seatOrder.slice(); await click(a, 'add-player-btn');
        await until(() => read().seatOrder.length === 4, 'second host human');
        const secondHuman = read().seatOrder.find(id => !previousIds.includes(id));
        let arranged = read();
        const firstHuman = arranged.seatOrder.find(id => arranged.participants[id].controllerId === uidA && arranged.participants[id].type === 'human' && id !== secondHuman);
        const guestHuman = arranged.seatOrder.find(id => arranged.participants[id].controllerId === uidB);
        arranged.seatOrder = [firstHuman, cpuA2, secondHuman, guestHuman]; arranged.seed = 0; arranged.revision++; arranged.ready = {}; put(arranged);
        await start();
        for (let i = 0; i < 6; i++) await dart();
        await settle();
        assert.equal((await state(a)).feedback.handoff.player, secondHuman);
        assert.equal(await a.eval('__cpuTest.human()'), false, 'H1 to CPU to H2 keeps human confirmation');
        await dart(); await returnLobby();
        assert.equal(await a.eval(`__cpuTest.controller().removeLocalPlayer(${JSON.stringify(secondHuman)})`), true);
        await until(async () => (await Promise.all(pages.map(state))).every(s => s.data.revision === read().revision), 'handoff composition restored');
        cpuB = await addCpu(b);

        // Hold the real CPU request past its unchanged deadline; only timeout can advance it.
        await setting(a, 'timer-select', 30000, 'turnMs');
        arranged = read(); arranged.seed = arranged.seatOrder.indexOf(cpuA2); put(arranged); await pause(80); await start();
        await a.eval('window.__cpuNetwork.hold=true'); await settle();
        const pendingTimed = await state(a); assert(pendingTimed.pending);
        await advance(pendingTimed.pending.at, 0);
        await until(() => a.eval('__cpuTest.snapshot().sending'), 'timed CPU request pending');
        const timedState = read().game;
        await advance(timedState.turnStartedAt + timedState.turnMs + 1, 0, false);
        await a.eval('window.__cpuNetwork.hold=false');
        await until(() => a.eval('!__cpuTest.snapshot().sending'), 'late CPU request rejected');
        assert.equal(read().game.seq, timedState.seq);
        const expired = await Promise.all(pages.map(p => p.eval('__cpuTest.controller().expire()')));
        assert.equal(expired.filter(Boolean).length, 1); await agree(timedState.seq + 1);
        assert.equal(read().game.lastTurn.reason, 'timeout');
        await returnLobby();
        console.log('PASS: online H1/CPU/H2 handoff, blocked human CPU input, unchanged timed CPU deadline and queued-request timeout.');
        // A CPU owner's disconnect cancels pending work; host migration never transfers CPU ownership.
        await setting(a, 'mode-select', 'countup', 'mode'); await setting(a, 'timer-select', 0, 'turnMs');
        await setting(a, 'starting-player-select', 'random', 'startingPlayer');
        const room = read(); room.seed = room.seatOrder.indexOf(cpuA2); put(room); await pause(100); await start();
        await a.eval('window.__cpuNetwork.hold=true'); await settle();
        const scheduled = await state(a); await advance(scheduled.pending.at, 0);
        await until(() => a.eval('__cpuTest.snapshot().sending'), 'held CPU submission');
        const seq = read().game.seq;
        await a.eval('window.__cpuNetwork.setOnline(false)');
        assert.equal(await a.eval('__cpuTest.controller().canControl()'), false);
        await pause(100); await settle();
        assert.equal(read().game.seq, seq);
        await a.eval('window.__cpuNetwork.hold=false;window.__cpuNetwork.setOnline(true)');
        await a.eval('__cpuTest.controller().tick()');
        await until(() => a.eval('__cpuTest.controller().canControl()'), 'same-page reconnect retains owner before reaping');
        assert.equal(read().game.owners[cpuA2], uidA);
        await a.eval('window.__cpuNetwork.hold=true'); await settle();
        const retried = await state(a); assert(retried.pending); await advance(retried.pending.at, 0);
        await until(() => a.eval('__cpuTest.snapshot().sending'), 'reconnected CPU request pending');
        await a.eval('window.__cpuNetwork.setOnline(false)'); await pause(80);
        const afterDisconnect = await state(b);
        await b.eval(`__cpuTest.step(${afterDisconnect.now + 16001},0);__cpuTest.controller().tick()`);
        await until(() => !read().players[uidA], 'disconnected host reaped');
        assert.equal(read().hostUid, uidB); assert.equal(read().game.owners[cpuB], uidB);
        assert(read().game.withdrawn.includes(cpuA2));
        pages.splice(0, 1);
        for (let i = 0; i < 6 && read().game.status === 'playing'; i++) await dart();
        for (const p of [a, b, c]) assert.deepEqual(await p.eval('window.__pageErrors'), []);
        console.log('PASS: online Cricket/opening Cork, pending CPU disconnect, host loss, retained owner CPU execution and no page errors. Fixture validation only; no live RTDB or physical devices used.');
    } finally {
        clearTimeout(deadline);
        if (protocol) { try { await protocol.send('Browser.close'); } catch (_) {} protocol.socket.close(); }
        if (browser.exitCode === null) browser.kill();
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        if (path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep + 'gamebox-online-cpu-')) {
            try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) {}
        }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
