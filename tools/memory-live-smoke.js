/** Explicit live Auth/RTDB smoke test. Serves unchanged local assets; no SDK/time/seed mocks. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { spawn } = require('node:child_process');
const Categories = require('../js/games/memory-categories.js'), Colors = require('../js/games/memory-color-variants.js'), Match = require('../js/games/memory-match.js');
const Pitch = require('../js/games/memory-pitch.js'), Pitches = require('../js/games/memory-pitch-variations.js'), Rules = require('../js/games/memory-rules.js');
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2);
if (!args.includes('--live')) { console.error('Use --live to explicitly run against the configured real Firebase project.'); process.exitCode = 2; return; }
const chrome = args.find(arg => !arg.startsWith('--')) || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const pitchMode = args.includes('--pitch'), playtestMode = args.includes('--playtest'), focusedMode = args.includes('--focused'), challengeMode=args.includes('--challenge'),v4Mode=args.includes('--v4'),cpuMode=args.includes('--cpu'),uxMode=args.includes('--ux'),flowMode=args.includes('--flow'),rankingMode=args.includes('--ranking'),rematchMode=args.includes('--rematch'),recoveryMode=args.includes('--recovery');
const variants = args.includes('--connect-only') || focusedMode || challengeMode || v4Mode || cpuMode || uxMode || flowMode || rankingMode || rematchMode || recoveryMode ? [] : pitchMode ? ['three-tone', 'four-tone'] : ['single'];
const report = { mode: 'localhost website + real Firebase Auth/RTDB', category: cpuMode?'device-owned-cpus':v4Mode?'color-v4-rgb-hsl':challengeMode?'v9-random-quantity-pitch':focusedMode ? 'focused-color-quantity-pitch' : pitchMode ? 'pitch' : 'color', rulesDeployed: false, websitePublished: false, simulatedClock: false, analyticsDisabled: true, variants: [], cleanup: [] };
async function until(check, label, timeout = 30000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const value = await check(); if (value) return value; await pause(150); }
    throw new Error('Timed out: ' + label);
}
class Protocol {
    constructor(socket) {
        this.socket = socket; this.serial = 0; this.pending = new Map(); this.hosts = new Set();
        socket.addEventListener('message', event => {
            const msg = JSON.parse(String(event.data));
            if (['Network.requestWillBeSent', 'Network.webSocketCreated'].includes(msg.method)) {
                try { this.hosts.add(new URL(msg.params.request?.url || msg.params.url).hostname); } catch (_) {}
            }
            const task = this.pending.get(msg.id); if (!task) return;
            this.pending.delete(msg.id); clearTimeout(task.timer); msg.error ? task.reject(new Error(msg.error.message)) : task.resolve(msg.result);
        });
    }
    send(method, params = {}, sessionId) {
        const id = ++this.serial;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000);
            this.pending.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params, sessionId }));
        });
    }
    close() { for (const t of this.pending.values()) { clearTimeout(t.timer); t.reject(new Error('Browser closed')); } this.pending.clear(); this.socket.close(); }
}
// Observe the existing public bootstrap API without rewriting any served assets.
// Keep production maintenance from querying/deleting unrelated stale rooms.
const observe = `window.__liveErrors=[];window.__liveCleanupErrors=[];
// Synthetic live room tests must not populate production analytics.
Object.defineProperty(window,'MemoryAnalytics',{configurable:true,get:()=>undefined,set:()=>{}});
addEventListener('error',e=>__liveErrors.push(e.message));addEventListener('unhandledrejection',e=>__liveErrors.push(String(e.reason)));
let onlineApi;Object.defineProperty(window,'MemoryOnline',{configurable:true,get:()=>onlineApi,set:api=>{const create=api.create;api.create=function(options){window.__liveView=options.view;return window.__liveOnline=create(options);};onlineApi=api;}});
addEventListener('arcade-net-ready',()=>{const net=window.ArcadeNet;if(!net?.ok)return;net.onAuth(user=>{if(user?.anon&&!window.__liveAuthUid)window.__liveAuthUid=user.uid;});const create=net.rooms.create;net.rooms.create=function(options){const service=create(options);return {...service,cleanup:()=>Promise.resolve(0)};};});`;
(async () => {
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost'), file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
        const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript';
        response.writeHead(200, { 'Content-Type': type + ';charset=utf-8', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(response);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://localhost:' + server.address().port;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebox-memory-live-')), clients = [];
    let browser, protocol, watchdog, roomCode, failure;
    fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
    const reportFile = path.join(root, '.cache', recoveryMode?'memory-live-recovery-smoke.json':rematchMode?'memory-live-rematch-smoke.json':rankingMode?'memory-live-ranking-smoke.json':flowMode?'memory-live-flow-smoke.json':uxMode?'memory-live-ux-smoke.json':cpuMode?'memory-live-cpu-smoke.json':v4Mode?'memory-live-v4-smoke.json':challengeMode?'memory-live-challenge-smoke.json':focusedMode ? 'memory-live-focused-smoke.json' : playtestMode ? 'memory-live-playtest-smoke.json' : pitchMode ? 'memory-live-pitch-smoke.json' : 'memory-live-smoke.json');
    report.origin = origin; report.startedAt = new Date().toISOString();
    try {
        browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true });
        browser.on('error', error => { failure = error; }); browser.stderr.on('data', () => {});
        watchdog = setTimeout(() => browser.kill(), 480000);
        const debug = await until(() => { try { const lines = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split(/\r?\n/); if (lines.length > 1) return lines; } catch (_) {} if (failure) throw failure; }, 'Chrome ready');
        const socket = new WebSocket('ws://127.0.0.1:' + debug[0] + debug[1]); await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); }); protocol = new Protocol(socket);
        async function page(name, width) {
            const { browserContextId } = await protocol.send('Target.createBrowserContext');
            const { targetId } = await protocol.send('Target.createTarget', { url: 'about:blank', browserContextId });
            const { sessionId } = await protocol.send('Target.attachToTarget', { targetId, flatten: true });
            const p = { name, browserContextId, targetId, send: (m, v) => protocol.send(m, v, sessionId), eval: async expression => {
                const r = await protocol.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
                if (r.exceptionDetails) throw new Error(name + ': ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value;
            } }; clients.push(p);
            await p.send('Network.enable'); await p.send('Network.setCacheDisabled', { cacheDisabled: true }); await p.send('Page.enable');
            await p.send('Page.addScriptToEvaluateOnNewDocument', { source: observe });
            await p.send('Emulation.setDeviceMetricsOverride', { width, height: width === 320 ? 568 : 900, deviceScaleFactor: 1, mobile: width < 700 });
            await p.send('Emulation.setFocusEmulationEnabled', { enabled: true });
            await p.send('Page.navigate', { url: origin + '/games/memory.html' + (playtestMode ? '?playtest=1' : '') });
            await until(() => p.eval('!!window.__liveOnline && !!window.__liveView'), name + ' Memory bootstrap');
            if (playtestMode) await p.eval("document.getElementById('memory-playtest-source').value='automated';document.getElementById('memory-playtest-source').dispatchEvent(new Event('change'));document.getElementById('memory-playtest-record').click()");
            assert.equal(await p.eval('MemoryMatch.version'), Match.version);
            assert.equal(await p.eval('FIREBASE_CONFIG.projectId'), 'games-7e19b');
            assert.equal(await p.eval('FIREBASE_ROOMS.databaseURL'), 'https://games-7e19b-default-rtdb.asia-southeast1.firebasedatabase.app/');
            await p.eval("ArcadeCommon.i18n.setLocale('en')"); return p;
        }
        async function click(p, id) {
            if(id==='memory-room-enable-audio'){
                const api="__liveView";
                let s=await p.eval(api+'.audioReadiness()');if(s.confirmed&&s.usable)return;
                if(!s.tested){await click(p,'memory-enable-audio');await until(()=>p.eval('!'+api+'.audioReadiness().busy'),'test playback finished');}
                await click(p,'memory-confirm-audio');return;
            }
            if(id==='memory-action'&&await p.eval('!!document.getElementById("memory-game").dataset.resultView'))id='memory-online-btn';
            await until(() => p.eval(`(()=>{const e=document.getElementById(${JSON.stringify(id)});return !!e&&!e.hidden&&e.getClientRects().length&&!e.matches(':disabled');})()`), p.name + ' enabled ' + id);
            const b = await p.eval(`(async()=>{const e=document.getElementById(${JSON.stringify(id)});e.scrollIntoView({block:'center',behavior:'instant'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
            await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...b, button: 'left', clickCount: 1 }); await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...b, button: 'left', clickCount: 1 });
        }
        const state = p => p.eval('(()=>{const c=__liveOnline.controller();return{data:c?.current()?.data,id:c?.playerId(),view:__liveView.snapshot(),ready:__liveOnline.clock()?.isReady(),connected:c?.canControl()};})()');
        async function fill(p, id, value) { await p.eval(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
        async function online(p) {
            await click(p, 'memory-online-btn');
            await until(async () => { const ready = await p.eval('!!__liveOnline.controller()&&!!ArcadeNet.currentUser()&&__liveOnline.clock()?.isReady()'); const error = await p.eval('document.getElementById("memory-lobby-error").textContent'); if (error) throw new Error(p.name + ': ' + error); return ready; }, p.name + ' real Firebase initialization', 45000);
            assert(await p.eval('ArcadeNet.currentUser().anon && !!window.__liveAuthUid'));
        }
        const a = await page('Host', 1200), b = await page('Guest', 320);
        await online(a); await online(b);
        assert(await b.eval('!!__liveAuthUid')); assert.notEqual(await a.eval('__liveAuthUid'), await b.eval('__liveAuthUid'));
        report.project = await a.eval('FIREBASE_CONFIG.projectId'); report.databaseURL = await a.eval('FIREBASE_ROOMS.databaseURL'); report.protocol = Match.version;
        console.log('PASS: two isolated localhost clients use real anonymous Firebase Auth and the live RTDB server clock.');
        if (args.includes('--connect-only')) return;
        await fill(a, 'memory-name', 'Live smoke host'); await fill(a, 'memory-max-rounds', 1); await fill(a, 'memory-weight-color', pitchMode ? 0 : 2); await fill(a, 'memory-weight-quantity', 0); await fill(a, 'memory-weight-pitch', pitchMode ? 2 : 0);
        await click(a, 'memory-create-btn');
        await until(async () => { const s = await state(a); const error = await a.eval('document.getElementById("memory-lobby-error").textContent'); if (error) throw new Error(error); return s.data?.code; }, 'live room creation');
        roomCode = (await state(a)).data.code; report.roomCreated = true;
        if(!cpuMode){await fill(b, 'memory-name', 'Live smoke guest'); await fill(b, 'memory-code-input', roomCode); await click(b, 'memory-join-btn');
        await until(async () => (await state(a)).data?.seatOrder.length === 2 && (await state(b)).data?.seatOrder.length === 2, 'independent live participants');}
        console.log('PASS: real RTDB create/join accepted for this test room.');
        async function enter(p, answer, variant, question) {
            if(question.type==='color'&&question.version===3){await click(p,'memory-color-mode-rgb');for(let i=0;i<3;i++)await p.eval(`(()=>{const e=document.querySelector('#memory-wheel-dual-${'rgb'[i]} .memory-wheel'),n=${answer[i]};for(const key of ['Home',...Array(Math.floor(n/16)).fill('PageUp'),...Array(n%16).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));})()`);return;}
            if (pitchMode) {
                for (const id of question.tones) { if (question.fixed.includes(id)) continue; const i = question.tones.indexOf(id), n = Math.round(Pitch.hzToCents(answer[id])); if (question.tones.length === 5) await click(p, 'memory-pitch-tone-' + i);
                    const selector = question.tones.length === 5 ? '#memory-wheel-pitch-shared .memory-wheel' : '#memory-wheel-pitch-' + i + ' .memory-wheel';
                    await p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),n=${n};for(const key of ['Home',...Array(Math.floor(n/100)).fill('PageUp'),...Array(n%100).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));})()`);
                }
                assert.deepEqual((await state(p)).view.draft, answer); return;
            }
            for (const [id, value] of Object.entries(answer)) {
                if (variant === 'hue4') await click(p, 'memory-color-select-' + id);
                const selector = variant === 'single' ? '#memory-wheel-hsl-' + id + ' .memory-wheel' : variant === 'hue4' ? '#memory-wheel-hue .memory-wheel' : '#memory-wheel-hue-' + id + ' .memory-wheel';
                await p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),units=Math.round(${value}*100),press=(key,shiftKey=false)=>e.dispatchEvent(new KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true}));press('Home');for(let i=0;i<Math.floor(units/1500);i++)press('PageUp');for(let i=0;i<Math.floor(units%1500/100);i++)press('ArrowUp');for(let i=0;i<units%100;i++)press('ArrowUp',true);})()`);
            }
            const actual = (await state(p)).view.draft; for (const id of Object.keys(answer)) assert(Math.abs(actual[id] - answer[id]) < 1e-7);
        }
        if(recoveryMode)await require('./memory/recovery-live.cjs')({a,b,clients,state,click,fill,until,report,root,roomCode,online,protocol,origin,observe});
        if(rematchMode)await require('./helpers/memory-rematch-live.js')({a,b,clients,state,click,fill,until,report,root,roomCode,online});
        if(rankingMode)await require('./helpers/memory-ranking-live.js')({a,b,clients,state,click,fill,until,report,root,roomCode,online});
        if(flowMode)await require('./helpers/memory-flow-live.js')({a,b,clients,state,click,fill,until,report,root,roomCode});
        if(uxMode)await require('./helpers/memory-ux-live.js')({a,b,clients,state,click,fill,until,report,root,roomCode});
        if(challengeMode)await require('./helpers/memory-challenge-live.js')({a,b,clients,state,click,fill,enter,until,report,root,playtestMode});
        if(cpuMode)await require('./helpers/memory-cpu-live.js')({a,b,clients,state,click,fill,until,report,root,playtestMode,roomCode});
        if(v4Mode)await require('./helpers/memory-focused-live.js')({a,b,clients,state,click,fill,until,report,root,playtestMode,categories:['color'],artifactPrefix:'memory-live-v4',verifyV4Rematch:true});
        if(focusedMode)await require('./helpers/memory-focused-live.js')({a,b,clients,state,click,fill,until,report,root,playtestMode});
        for (const variant of variants) {
            const weights = Object.fromEntries(Colors.variants.map(id => [id, id === variant ? 1 : 0]));
            const lengths = { n3: +(variant === 'three-tone'), n4: +(variant === 'four-tone'), n5: 0 }, references = { one: 1, two: 0 };
            const patch = pitchMode ? { maxRounds: 1, categoryWeights: { color: 0, quantity: 0, pitch: 2 }, adaptive: { enabled: false }, pitch: { variantSelectionVersion: 1, variations: { lengths: { easy: lengths, hard: lengths }, references: { easy: references, hard: references }, positions: { first: 0, middle: 0, last: 1, interior: 0 } } } } : { maxRounds: 1, categoryWeights: { color: 2, quantity: 0, pitch: 0 }, adaptive: { enabled: false }, color: { weights: { easy: weights, hard: weights } } };
            assert(await a.eval(`__liveOnline.controller().configure(${JSON.stringify(patch)})`));
            await until(async () => (await state(a)).data.revision === (await state(b)).data.revision, 'frozen lobby configuration');
            if (pitchMode) for (const p of clients) { await click(p, 'memory-room-enable-audio'); await until(async () => { const s = await state(p), c = await p.eval('__liveOnline.controller().service.currentPlayer().uid'); return s.data.audioReady?.[c]?.version === 2 && s.view.audio.ready; }, 'real Pitch audio readiness'); }
            await click(b, 'memory-ready-btn'); await until(() => a.eval('__liveOnline.controller().canStart()'), 'live Ready'); await click(a, 'memory-start-btn');
            await until(async () => (await state(a)).data.game?.status === 'playing' && (await state(b)).data.game?.status === 'playing', 'live Start');
            const game = (await state(a)).data.game, identity = Match.token(game), config = structuredClone(game.config), count = pitchMode ? variant === 'three-tone' ? 3 : 4 : variant === 'single' ? 1 : Number(variant.at(-1));
            if (playtestMode) for (const p of clients) assert.equal(await p.eval('MemoryPlaytestUI.current.data().rounds.length'), variants.indexOf(variant), 'No active target is recorded');
            if (pitchMode) { assert.equal(game.question.type, 'pitch'); assert.equal(game.question.version, 2); assert.equal(game.question.tones.length, count); assert.equal(game.question.fixed.length, 1); assert.notEqual(game.question.fixed[0], 'n1'); } else {assert.equal(game.question.variant, variant);assert.equal(game.question.version,3);}
            assert.equal(game.protocolVersion, Match.version); assert.deepEqual((await state(b)).data.game.question, game.question); assert.deepEqual((await state(b)).data.game.timeline, game.timeline);
            await until(async () => (await state(a)).view.phase === 'memorize' && (await state(b)).view.phase === 'memorize', 'real memorize window');
            if (pitchMode) { assert.equal((await state(b)).view.audio.scheduled, count * game.config.pitch.audio.repeats); assert(game.question.parameters.pitch.requiredMemorizeMs <= game.roundTiming.memorizeMs); } else assert.equal(await b.eval('document.querySelectorAll("#memory-modern-palette .memory-color-card").length'), count);
            await until(async () => (await state(a)).view.phase === 'answer' && (await state(b)).view.phase === 'answer', 'real answer window', 20000);
            assert.equal(await b.eval(pitchMode ? 'document.getElementById("memory-pitch-result-rows").children.length' : 'document.getElementById("memory-color-rms").textContent'), pitchMode ? 0 : '');
            const perfect = structuredClone(game.question.target), partial = structuredClone(perfect), first = pitchMode ? game.question.tones.find(id => !game.question.fixed.includes(id)) : 0;
            partial[first] = pitchMode ? Pitch.centsToHz(Math.round(Pitch.hzToCents(partial[first])) + (partial[first] > 600 ? -100 : 100)) : (partial[first]+45)%256;
            await Promise.all([enter(a, perfect, variant, game.question), enter(b, partial, variant, game.question)]);
            await click(a, 'memory-action'); await until(async () => Object.keys((await state(b)).data.game.submissions).length === 1, 'early independent accepted receipt');
            assert.equal((await state(b)).view.phase, 'answer'); assert.deepEqual((await state(b)).data.game.timeline, game.timeline);
            await click(b, 'memory-action'); await until(async () => Object.keys((await state(a)).data.game.submissions).length === 2, 'two concurrent live receipts');
            const receipt = structuredClone((await state(a)).data.game.submissions[(await state(a)).id]);
            await until(async () => (await state(a)).data.game?.phase === 'results' && (await state(b)).data.game?.phase === 'results', 'real deadline settlement', Math.max(15000, game.timeline.deadline - Date.now() + 15000));
            const settled = (await state(a)).data.game; assert.deepEqual((await state(b)).data.game, settled); assert.deepEqual(settled.config, config);
            const expected = [Categories.grade(game.question, perfect, config), Categories.grade(game.question, partial, config)];
            for (let i = 0; i < clients.length; i++) { const row = settled.lastResult.rows.find(row => row.id === (i ? settled.seatOrder[1] : settled.seatOrder[0])), damage = Rules.calculateDamage(expected[i].score, 100, Rules.multiplierForRound(1, config.multiplierSchedule)); assert.equal(row.scoreUnits, Math.round(expected[i].score * 1000)); assert.equal(row.missing, false); assert.equal(row.damageUnits, Math.round(damage * Rules.SCALE)); assert.equal(settled.hpUnits[row.id], game.hpUnits[row.id] - row.damageUnits); }
            assert.equal(expected[0].score, 100); assert(expected[1].score < 100); assert.equal(settled.settledRound, 1); assert.equal(settled.status, 'over');
            assert(await a.eval(`__liveOnline.controller().submit(${JSON.stringify(receipt.answer)},${JSON.stringify(identity)},${JSON.stringify(receipt.nonce)})`));
            await Promise.all(clients.map(p => p.eval(`__liveOnline.controller().settle(${JSON.stringify(identity)})`))); await pause(500);
            assert.deepEqual((await state(a)).data.game.hpUnits, settled.hpUnits); assert.deepEqual((await state(b)).data.game.hpUnits, settled.hpUnits);
            if (playtestMode) {
                for (const p of clients) {
                    await until(() => p.eval(`MemoryPlaytestUI.current.data().rounds.length===${variants.indexOf(variant)+1}`), 'completed live playtest record');
                    const exported = await p.eval('MemoryPlaytestUI.current.data()'), last = exported.rounds.at(-1), json = JSON.stringify(exported);
                    require('./helpers/memory-playtest-analysis.js').validate(exported);
                    for (const sensitive of [await p.eval('__liveAuthUid'), ...settled.seatOrder, ...settled.seatOrder.map(id=>settled.roster[id].name), receipt.nonce]) assert(!json.includes(sensitive));
                    assert.equal(last.seed, game.question.seed); assert.equal(last.roundMultiplier, settled.lastResult.multiplier);
                    for (const row of settled.lastResult.rows) { const observation = last.participants.find(o=>o.id==='p'+(settled.seatOrder.indexOf(row.id)+1)); assert.equal(observation.score,row.scoreUnits/1000); assert.equal(observation.damageTaken,row.damageUnits/1000); assert.equal(observation.hpRemaining,row.hpAfterUnits/1000); }
                    assert.equal(last.participants.filter(o=>o.self&&o.timeSource==='local-first-attempt').length,1);
                    fs.writeFileSync(path.join(root,'.cache','memory-live-playtest-'+p.name.toLowerCase()+'.json'),JSON.stringify(exported,null,2)+'\n');
                }
                report.playtest = { enabled: true, source: 'automated', roundsPerObserver: variants.indexOf(variant)+1, anonymous: true, scoresAndDamageMatchSettlement: true, noActiveTargets: true };
            }
            const shot = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(root, '.cache', 'memory-live-' + (pitchMode ? 'pitch-' : '') + variant + '-results.png'), Buffer.from(shot.data, 'base64'));
            report.variants.push({ variant, scores: expected.map(g => g.score), fixed: pitchMode ? game.question.fixed : undefined, toneCount: pitchMode ? count : undefined, audioReady: pitchMode ? true : undefined, sharedTimeline: true, independentReceipts: true, exactlyOnceSettlement: true });
            console.log('PASS: live ' + variant + ': real deadlines, '+(pitchMode?'keyed Pitch':'HSL/Hue')+' answers, scores ' + expected.map(g => g.score).join('/') + ', HP, duplicate receipt and once-only settlement.');
            await click(a, 'memory-action'); await click(a, 'memory-return-btn'); await until(async () => (await state(a)).data.phase === 'lobby' && (await state(b)).data.phase === 'lobby', 'same-room live rematch');
            assert.equal((await state(a)).data.code, roomCode);
        }
        for (const p of clients) assert.deepEqual(await p.eval('__liveErrors'), []);
        report.status = 'passed'; console.log('PASS: live '+(recoveryMode?'same-tab refresh recovery':rematchMode?'Phase 7D rematch UX':rankingMode?'v14 survival ranking/global room':flowMode?'Phase 7C integrated results/conclusion/early settlement':uxMode?'Phase 7B audio/results/Pitch':cpuMode?'device-owned CPUs':v4Mode?'V4 Color RGB/HSL':challengeMode?'v9 Quantity/Pitch':focusedMode?'Color/Quantity/Pitch':pitchMode?'Pitch':'Color')+' smoke and same-room rematches completed without fixture SDKs or simulated clocks.');
    } catch (error) { failure = error; report.status = 'failed'; report.error = error.message; console.error(error.message); }
    finally {
        if (protocol) {
            for (const p of [...clients].reverse()) {
                try { await p.eval('(()=>{const c=window.__liveOnline?.controller();return c?.current()?c.leave():null;})()'); report.cleanup.push({ client: p.name, roomLeft: true }); }
                catch (error) { report.cleanup.push({ client: p.name, error: error.message }); }
            }
            if (roomCode && clients[0]) try { const absent = await clients[0].eval(`__liveOnline.controller().service.get(${JSON.stringify(roomCode)}).then(room=>!room)`); report.roomRemoved = absent; if (!absent) throw new Error('Test room still exists after both leaves.'); } catch (error) { report.cleanup.push({ error: error.message }); failure = failure || error; }
            for (const p of clients) try {
                const removed = await p.eval(`(async()=>{const net=window.ArcadeNet;if(!net?.ok||!window.__liveAuthUid)return false;const m=await import('https://www.gstatic.com/firebasejs/'+net.sdk+'/firebase-auth.js'),auth=m.getAuth(),user=auth.currentUser;if(!user)return true;if(!user.isAnonymous||user.uid!==window.__liveAuthUid)throw new Error('Refusing to delete an unrelated Auth user');window.__liveOnline?.destroy();await m.deleteUser(user);return true;})()`);
                report.cleanup.push({ client: p.name, temporaryAnonymousAccountRemoved: removed });
            } catch (error) { report.cleanup.push({ client: p.name, authCleanupError: error.message }); failure = failure || error; }
            report.networkHosts = [...protocol.hosts].filter(host => host !== 'localhost').sort(); protocol.close();
        }
        clearTimeout(watchdog);
        if (browser && browser.exitCode === null) { const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await Promise.race([stopped, pause(3000)]); }
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        const resolved = path.resolve(profile), expectedRoot = path.resolve(os.tmpdir()) + path.sep + 'gamebox-memory-live-';
        if (resolved.startsWith(expectedRoot)) try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (_) {}
        report.finishedAt = new Date().toISOString(); if (failure) report.status = 'failed'; if (!report.status) report.status = 'connected'; fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
        console.log('Report: ' + reportFile); if (failure) process.exitCode = 1;
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
