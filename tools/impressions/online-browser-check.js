/** Isolated Chrome contexts + HTTP CAS RTDB fixture. Real game/UI/transport; no live Firebase. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const Color = require('../../js/games/impressions/color.js'), Match=require('../../js/games/impressions/match.js');
const Quantity = require('../../js/games/impressions/quantity.js');
const root = path.resolve(__dirname, '../..'), args = process.argv.slice(2);
const chrome = args.find(arg => !arg.startsWith('--')) || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const backend = require('../helpers/network-rtdb-fixture.js')();
const analyticsDocuments=new Map(),analyticsAttempts=[];
const auth = args.includes('--recovery') ? `let user,restored;const authReady=new Promise(resolve=>restored=resolve);export const getAuth=()=>({authStateReady:()=>authReady,get currentUser(){return user;}});const observers=[];
const stored=JSON.parse(sessionStorage.getItem('fixture:auth')||'null');setTimeout(()=>{user=stored;observers.forEach(cb=>cb(user));restored();},200);
window.__fixtureChangeAuth=next=>{user=next;observers.forEach(cb=>cb(next));};
export const onAuthStateChanged=(_a,cb)=>{observers.push(cb);if(user!==undefined)queueMicrotask(()=>cb(user));};export class GoogleAuthProvider{};
export const signInAnonymously=async()=>{window.__fixtureSignIns=(window.__fixtureSignIns||0)+1;user={uid:'same-account',displayName:new URLSearchParams(location.search).get('name'),isAnonymous:true};sessionStorage.setItem('fixture:auth',JSON.stringify(user));observers.forEach(cb=>cb(user));return {user};},signInWithPopup=async()=>({user}),signOut=async()=>{user=null;observers.forEach(cb=>cb(null));};` : `export const getAuth=()=>({authStateReady:async()=>{},get currentUser(){return user;}});let user=null;const observers=[];
export const onAuthStateChanged=(_auth,cb)=>{observers.push(cb);queueMicrotask(()=>cb(user));};export class GoogleAuthProvider{};
export const signInAnonymously=async()=>{user={uid:'same-account',displayName:new URLSearchParams(location.search).get('name'),isAnonymous:true};queueMicrotask(()=>observers.forEach(cb=>cb(user)));return {user};},signInWithPopup=async()=>({user}),signOut=async()=>{};`;
const firestore = `export const getFirestore=()=>({}),doc=(_db,...parts)=>parts.join('/'),getDoc=async()=>({exists:()=>false}),getDocs=async()=>({docs:[]}),setDoc=async()=>{},updateDoc=async()=>{},deleteDoc=async()=>{},serverTimestamp=()=>Date.now(),deleteField=()=>null,collection=()=>'',query=()=>'',orderBy=()=>'',limit=n=>n;`;
class Protocol {
    constructor(socket) {
        this.socket = socket; this.serial = 0; this.pending = new Map();
        socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data)), task = this.pending.get(message.id);
            if (!task) return; this.pending.delete(message.id); clearTimeout(task.timer);
            message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
        });
    }
    send(method, params = {}, sessionId) {
        const id = ++this.serial;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
            this.pending.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params, sessionId }));
        });
    }
    close() { for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(new Error('Browser closed')); } this.pending.clear(); this.socket.close(); }
}
async function until(check, label, timeout = 15000) {
    const limit = Date.now() + timeout;
    while (Date.now() < limit) { if (await check()) return; await pause(35); }
    throw new Error('Timed out: ' + label);
}
(async () => {
    const codec = await import('../../js/net/rtdb-values.mjs');
    let canonicalTime = 100000;
    const server = http.createServer(async (request, response) => {
        try {
            const url = new URL(request.url, 'http://localhost');
            if (url.pathname === '/__analytics') { let raw='';for await(const chunk of request)raw+=chunk;const upload=JSON.parse(raw),mode=url.searchParams.get('mode'),prior=analyticsAttempts.filter(a=>a.id===upload.id&&a.mode===mode).length;analyticsAttempts.push({...upload,mode});let status=mode==='denied'?'denied':mode==='retry'&&prior===0?'failed':analyticsDocuments.has(upload.id)?'duplicate':'created';if(status==='created')analyticsDocuments.set(upload.id,upload.record);response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({status}));return; }
            if (url.pathname === '/__fixture') { await backend.handle(request, response, url); return; }
            let body, type = 'text/javascript';
            if (url.pathname === '/__sdk/firebase-app.js') body = 'export const initializeApp=()=>({});';
            else if (url.pathname === '/__sdk/firebase-auth.js') body = auth;
            else if (url.pathname === '/__sdk/firebase-firestore.js') body = firestore;
            else if (url.pathname === '/__sdk/firebase-database.js') body = backend.sdk
                .replace('serverTimestamp = () => Date.now()', 'serverTimestamp = () => window.__impressionsEpoch')
                .replace('export async function runTransaction(target, updater, options) {',
                    "export async function runTransaction(target, updater, options) {if(window.__impressionsDenyRoom)throw Object.assign(new Error('Permission denied'),{code:'PERMISSION_DENIED'});");
            else {
                const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
                if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
                body = fs.readFileSync(file, 'utf8');
                if (!args.includes('--recovery') && !args.includes('--analytics') && !args.includes('--rematch') && !args.includes('--ranking') && !args.includes('--flow') && !args.includes('--ux') && !args.includes('--cpu') && !args.includes('--challenge') && file.endsWith(path.join('impressions', 'categories.js')))body=body.replace('input = input || {};','input = Object.assign({challengeVersion:0},input);');
                // Historical regression modes deliberately freeze deadline-only v12 matches.
                if(!args.includes('--recovery') && !args.includes('--analytics') && !args.includes('--rematch') && !args.includes('--ranking') && !args.includes('--flow')&&file.endsWith(path.join('impressions', 'match.js')))body=body.replace('protocolVersion: VERSION','protocolVersion: 12');
                if (file.endsWith('firebase-config.js')) body += '\nwindow.FIREBASE_ROOMS={databaseURL:"https://fixture.firebaseio.com"};';
                if(args.includes('--throw-recorder')&&file.endsWith(path.join('impressions', 'analytics.js')))body+='\nImpressionsAnalytics.create=()=>{if(innerWidth>680)throw Error("fixture create failure");return {observe(){throw Error("fixture observe failure");},destroy(){throw Error("fixture destroy failure");}};};';
                if (file.endsWith(path.join('impressions', 'audio.js'))) body = require('./helpers/audio-probe.js').instrument(body);
                // Existing modes keep their RGB compatibility fixtures. The Color
                // variant mode explicitly exercises the retained legacy Hue configuration.
                if (!args.includes('--recovery') && !args.includes('--analytics') && !args.includes('--rematch') && !args.includes('--ranking') && !args.includes('--flow') && !args.includes('--ux') && !args.includes('--cpu') && !args.includes('--challenge') && !args.includes('--pitch-variations') && file.endsWith(path.join('impressions', 'room.js'))) body = body.replace('Match.options(input.options)', args.includes('--color-variants') ? 'Match.options(Object.assign({},input.options,{color:window.ImpressionsColorVariants.configuration({variantSelectionVersion:1}),pitch:Object.assign({},input.options&&input.options.pitch,{variantSelectionVersion:0})}))' : 'Match.options(Object.assign({},input.options,{color:{variantSelectionVersion:0},pitch:Object.assign({},input.options&&input.options.pitch,{variantSelectionVersion:0})}))');
                if (url.pathname === '/js/net/net.js') body = body.replace('const BASE = `https://www.gstatic.com/firebasejs/${SDK}`;', "const BASE=location.origin+'/__sdk';")
                    .replace('createRealtimeRoomClock(rtdbSdk, rtdb, options)', 'createRealtimeRoomClock(rtdbSdk,rtdb,Object.assign({},options,{monotonicNow:()=>window.__impressionsEpoch}))');
                if ((args.includes('--groups') || args.includes('--color-variants') || args.includes('--pitch-variations')) && file.endsWith(path.join('impressions', 'online.js'))) {const marker='now: clock.now, audioStatus:view.audioReadiness, onChange: onRoom';assert(body.includes(marker),'Missing deterministic legacy fixture seed hook');body=body.replace(marker,'now: clock.now, audioStatus:view.audioReadiness, seedSource:()=>window.__impressionsEpoch>>>0, onChange: onRoom');}
                if (file.endsWith(path.join('impressions', 'game.js'))) body = body
                    .replace("var local = create({ root: document.getElementById('impressions-game') });", "var local = window.__impressionsView = create({ root: document.getElementById('impressions-game') });")
                    .replace('if (window.ImpressionsOnline) window.ImpressionsOnline.create(', 'if (window.ImpressionsOnline) window.__impressionsOnline = window.ImpressionsOnline.create(');
                if (file.endsWith('.html')) {
                    type = 'text/html'; if(args.includes('--disable-recorder'))body=body.replace('<script src="../js/games/impressions/analytics.js"></script>',''); body = body.replace('<head>', `<head><script>window.__impressionsBoot=Number(sessionStorage.getItem('fixture:boot')||0)+1;sessionStorage.setItem('fixture:boot',window.__impressionsBoot);window.__impressionsEpoch=${canonicalTime};window.__skew=Number(new URLSearchParams(location.search).get('skew')||0);Date.now=()=>window.__impressionsEpoch+window.__skew;window.__pageErrors=[];addEventListener('error',e=>__pageErrors.push(e.message));addEventListener('unhandledrejection',e=>__pageErrors.push(String(e.reason)));</script>`);
                } else if (file.endsWith('.css')) type = 'text/css';
                else if (file.endsWith('.svg')) type = 'image/svg+xml';
            }
            response.writeHead(200, { 'Content-Type': type + ';charset=utf-8', 'Cache-Control': 'no-store' }); response.end(body);
        } catch (error) { response.writeHead(500); response.end(String(error)); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebox-impressions-online-'));
    let browser, protocol, deadline, diagnostics = '';
    try {
        browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
            '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
            '--remote-debugging-port=0', '--explicitly-allowed-ports=' + server.address().port, '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true });
        browser.stderr.on('data', chunk => { diagnostics += chunk; });
        deadline = setTimeout(() => browser.kill(), args.includes('--ux') ? 600000 : args.includes('--cpu') ? 360000 : args.includes('--pitch-variations') ? 450000 : args.includes('--color-variants') ? 360000 : 180000);
        let debug;
        await until(() => {
            try { const lines = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split(/\r?\n/); if (lines.length >= 2) { debug = lines; return true; } }
            catch (e) { if (!['ENOENT', 'EBUSY', 'EACCES'].includes(e.code)) throw e; }
            return false;
        }, 'Chrome debugger');
        const socket = new WebSocket('ws://127.0.0.1:' + debug[0] + debug[1]);
        await Promise.race([new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); }), pause(10000).then(() => { throw new Error('Debugger connection timed out'); })]);
        protocol = new Protocol(socket);
        const allPages = [], pages = [];
        async function page(name, width, height, skew, existingContext) {
            const { browserContextId } = existingContext ? { browserContextId: existingContext } : await protocol.send('Target.createBrowserContext');
            const { targetId } = await protocol.send('Target.createTarget', { url: 'about:blank', browserContextId });
            const { sessionId } = await protocol.send('Target.attachToTarget', { targetId, flatten: true });
            const p = { name, browserContextId, sessionId, targetId,
                send: (method, params) => protocol.send(method, params, sessionId),
                eval: async expression => {
                    const result = await protocol.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
                    if (result.exceptionDetails) throw new Error(name + ': ' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text));
                    return result.result.value;
                } };
            await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
            // Each context represents an independent foreground device. Chrome
            // otherwise hides older targets when the next test client is created.
            await p.send('Emulation.setFocusEmulationEnabled', { enabled: true });
            await p.send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/games/impressions.html?name=' + encodeURIComponent(name) + '&skew=' + skew + (args.includes('--playtest') ? '&playtest=1' : '') });
            await until(() => p.eval('!!window.__impressionsView && !!window.__impressionsOnline'), 'Impressions boot ' + name);
            if (args.includes('--playtest')) {
                await p.eval("document.getElementById('impressions-playtest-source').value='automated';document.getElementById('impressions-playtest-source').dispatchEvent(new Event('change'));document.getElementById('impressions-playtest-record').click()");
                p.playtestCount = 0;
            }
            await p.eval("ArcadeCommon.i18n.setLocale('en')");if(args.includes('--groups')||args.includes('--color-variants')||args.includes('--pitch-variations'))await p.eval("document.getElementById('impressions-results-seconds').value=6");if(!args.includes('--weighted')&&!args.includes('--groups')&&!args.includes('--color-variants')&&!args.includes('--pitch-variations')) await p.eval("document.getElementById('impressions-weight-color').value=2;document.getElementById('impressions-weight-quantity').value=0;document.getElementById('impressions-weight-pitch').value=0;document.getElementById('impressions-adaptive').checked=false"); allPages.push(p); pages.push(p); return p;
        }
        async function state(p) { return p.eval(`(()=>{const c=__impressionsOnline.controller();return {data:c?.current()?.data,uid:c?.service.currentPlayer()?.uid,id:c?.playerId(),view:__impressionsView.snapshot(),now:__impressionsOnline.clock()?.now(),pending:__impressionsOnline.pending()};})()`); }
        async function click(p, id) {
            if(id==='impressions-room-enable-audio'){
                const api="__impressionsView";
                let s=await p.eval(api+'.audioReadiness()');if(s.confirmed&&s.usable)return;
                if(!s.tested){await click(p,'impressions-enable-audio');await until(()=>p.eval('!'+api+'.audioReadiness().busy'),'test playback finished');}
                await click(p,'impressions-confirm-audio');return;
            }
            if(id==='impressions-action'&&await p.eval('!!document.getElementById("impressions-game").dataset.resultView'))id='impressions-online-btn';
            if(id==='impressions-online-btn'&&await p.eval('document.getElementById("impressions-lobby").open'))return;
            for(let attempt=0;attempt<3;attempt++){
                if(id==='impressions-online-btn'&&await p.eval('document.getElementById("impressions-lobby").open'))return;
                await until(() => p.eval(`(()=>{const e=document.getElementById(${JSON.stringify(id)});return !!e&&!e.matches(':disabled')&&!e.hidden&&e.getClientRects().length>0;})()`), 'enabled ' + id + ' ' + p.name);
                const box = await p.eval(`(async()=>{const e=document.getElementById(${JSON.stringify(id)});e.scrollIntoView({block:'center',behavior:'instant'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));e.scrollIntoView({block:'center',behavior:'instant'});window.__impressionsClickHit=false;window.__impressionsClickWitness=event=>{if(e.contains(event.target))window.__impressionsClickHit=true;};document.addEventListener('click',window.__impressionsClickWitness,{capture:true,once:true});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
                await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
                await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
                if(await p.eval('document.removeEventListener("click",window.__impressionsClickWitness,true);window.__impressionsClickHit'))return;
                // Retry only when the requested element received no click, so an
                // accepted add/submit cannot accidentally be repeated.
            }
            throw new Error('Native click did not reach '+id+' '+p.name);
        }
        async function fill(p, id, value) {
            if (id === 'impressions-categories') {
                const inRoom = await p.eval('!!__impressionsOnline.controller()?.current()');
                if (inRoom) await until(() => p.eval(`__impressionsOnline.controller().current().data.revision===${read().revision}`), 'legacy preset revision');
                await p.eval(`(()=>{const mode=${JSON.stringify(value)},c=__impressionsOnline.controller();if(c?.current())return c.configure({categoryMode:mode,selectionVersion:2,categoryWeights:ImpressionsProgression.preset(mode)});for(const type of ImpressionsProgression.types)document.getElementById('impressions-weight-'+type).value=(mode==='mixed'||mode===type)?2:0;})()`);
                if (inRoom) await until(() => p.eval(`__impressionsOnline.controller().current().data.revision===${read().revision}`), 'legacy preset snapshot'); return;
            }
            await until(() => p.eval(`!document.getElementById(${JSON.stringify(id)}).matches(':disabled')`), 'editable ' + id);
            await p.eval(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.focus();e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));e.blur();})()`);
        }
        async function online(p) {
            await click(p, 'impressions-online-btn'); await until(() => p.eval('!!__impressionsOnline.controller() && __impressionsOnline.clock().isReady()'), 'network ready ' + p.name);
            assert.equal(await p.eval('document.getElementById("impressions-lobby-close").textContent'), 'Close');
        }
        async function advance(stamp, selected = pages) {
            // Keep awake clients' 3s heartbeats realistic while advancing controlled phase clocks.
            // A single 25s jump would instead simulate every peer being suspended past its 15s grace.
            do {
                canonicalTime = Math.min(stamp, canonicalTime + 2500);
                await Promise.all(selected.map(p => p.eval(`window.__impressionsEpoch=${canonicalTime};__impressionsOnline.clock()?.refresh();__impressionsView.tick();__impressionsOnline.tick()`)));
                await pause(90);
            } while (canonicalTime < stamp);
        }
        async function rgb(p, value, native = true) {
            for (let i = 0; i < 3; i++) {
                const selector = '#impressions-wheel-' + ['r', 'g', 'b'][i] + ' .impressions-wheel';
                const keys = ['Home', ...Array(Math.floor(value[i] / 16)).fill('PageUp'), ...Array(value[i] % 16).fill('ArrowUp')];
                if (native) {
                    await p.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
                    for (const key of keys) {
                        await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key });
                        await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key });
                    }
                } else await p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});for(const key of ${JSON.stringify(keys)})e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));})()`);
            }
            assert.deepEqual((await state(p)).view.draft, value);
        }
        let roomPath;
        const read = () => codec.decodeRoomValue(backend.read(roomPath));
        async function agreed(label) {
            try {
                await until(async () => (await Promise.all(pages.map(state))).every(s => s.data?.game.matchId === read().game.matchId
                    && s.data.game.round === read().game.round && s.data.game.phase === read().game.phase), label);
            } catch (error) {
                const snapshots = await Promise.all(pages.map(async p => ({ name: p.name, ...await state(p), errors: await p.eval('window.__pageErrors') })));
                fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
                fs.writeFileSync(path.join(root, '.cache', 'impressions-online-failure.json'), JSON.stringify({ label, canonicalTime, backend: read(), snapshots }, null, 2));
                throw error;
            }
        }
        async function readyAndStart() {
            const d = read(), host = pages.find(p => p.uid === d.hostUid);
            if (d.options.selectionVersion === 3 ? d.options.categoryWeights.pitch > 0 : d.options.categoryMode === 'pitch' || d.options.categoryMode === 'mixed' && d.options.selectionVersion === 2) {
                for (const p of pages) {
                    await until(() => p.eval(`__impressionsOnline.controller()?.current()?.data.revision === ${d.revision}`), 'audio settings revision');
                    await click(p, 'impressions-room-enable-audio');
                    await until(() => read().audioReady?.[p.uid]?.version === 2, 'audio acknowledged ' + p.name);
                }
            }
            for (const p of pages) if (p !== host) {
                // Backend settings/membership acknowledgements may precede this
                // guest's snapshot. Ready intentionally rejects an old revision.
                await until(() => p.eval(`__impressionsOnline.controller()?.current()?.data.revision === ${d.revision}`), 'guest received current lobby revision');
                await click(p, 'impressions-ready-btn');
                await until(() => read().ready[p.uid]?.revision === d.revision, 'accepted guest Ready revision');
            }
            await until(() => host.eval('!document.getElementById("impressions-start-btn").disabled'), 'host can start');
            await click(host, 'impressions-start-btn'); await agreed('shared match start');
            await until(async () => (await Promise.all(pages.map(p => p.eval('document.getElementById("impressions-lobby").open')))).every(open => !open), 'dialogs close on start');
        }
        async function screenshot(p, name) {
            if (!args.includes('--screenshots')) return;
            await p.eval('scrollTo(0,0)'); const shot = await p.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
            fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
            fs.writeFileSync(path.join(root, '.cache', 'impressions-online-' + name + '.png'), Buffer.from(shot.data, 'base64'));
        }
        async function checkPlaytest(game) {
            if (!args.includes('--playtest')) return;
            for (const p of pages) {
                const count = ++p.playtestCount;
                await until(() => p.eval(`ImpressionsPlaytestUI.current.data().rounds.length === ${count}`), 'one anonymous completed record');
                const exported = await p.eval('ImpressionsPlaytestUI.current.data()'), round = exported.rounds.at(-1);
                require('./helpers/playtest-analysis.js').validate(exported);
                assert.equal(round.seed, game.question.seed); assert.equal(round.round, game.round); assert.equal(round.roundMultiplier, game.lastResult.multiplier);
                for (const row of game.lastResult.rows) {
                    const record = round.participants.find(r => r.id === 'p' + (game.seatOrder.indexOf(row.id) + 1));
                    assert.equal(record.score, row.scoreUnits / 1000); assert.equal(record.error, row.error); assert.equal(record.damageTaken, row.damageUnits / 1000); assert.equal(record.hpRemaining, row.hpAfterUnits / 1000);
                }
                const text = JSON.stringify(exported); for (const id of game.seatOrder) { assert(!text.includes(id)); assert(!text.includes(game.roster[id].controllerId)); assert(!text.includes(game.roster[id].name)); }
                const observed = round.participants.filter(r => !r.self);observed.forEach(function(r){const id=game.seatOrder[Number(r.id.slice(1))-1],source=game.submissions[id]?.source;assert.equal(r.timedOut,source==='auto'?true:source==='manual'||source==='cpu'?false:null);});
                await p.eval('__impressionsView.tick();__impressionsOnline.tick()'); assert.equal(await p.eval('ImpressionsPlaytestUI.current.data().rounds.length'), count);
            }
        }

        if(args.includes('--recovery')){await require('./recovery-browser.cjs')({page,state,click,fill,online,advance,agreed,readyAndStart,until,pages,read,setRoomPath:value=>{roomPath=value;},screenshot,root,backend,codec,protocol,allPages});return;}
        if(args.includes('--analytics')){await require('./helpers/analytics-browser.js')({page,state,click,fill,online,advance,agreed,readyAndStart,until,pages,read,setRoomPath:value=>{roomPath=value;},screenshot,root,backend,codec,analyticsDocuments,analyticsAttempts,disabled:args.includes('--disable-recorder')||args.includes('--throw-recorder')});return;}
        if(args.includes('--rematch')){await require('./helpers/rematch-browser.js')({page,state,click,fill,online,advance,agreed,readyAndStart,until,pages,read,setRoomPath:value=>{roomPath=value;},screenshot,root,backend,codec});return;}
        if(args.includes('--ranking')){await require('./helpers/ranking-browser.js')({page,state,click,fill,online,advance,agreed,readyAndStart,until,pages,read,setRoomPath:value=>{roomPath=value;},screenshot,root,backend,codec});return;}
        if(args.includes('--flow')){await require('./helpers/flow-browser.js')({page,state,click,fill,online,advance,agreed,readyAndStart,until,pages,read,setRoomPath:value=>{roomPath=value;},screenshot,root,backend,codec});return;}
        if(args.includes('--ux')){await require('./helpers/ux-browser.js')({page,state,click,fill,online,advance,agreed,readyAndStart,until,pages,read,setRoomPath:value=>{roomPath=value;},screenshot,root,backend,codec});return;}
        if(args.includes('--cpu')){await require('./helpers/cpu-browser.js')({page,state,click,fill,online,advance,agreed,readyAndStart,until,pages,read,setRoomPath:value=>{roomPath=value;},screenshot,root,backend,codec});return;}
        if(args.includes('--challenge')){await require('./helpers/challenge-online.js')({page,state,click,fill,online,advance,agreed,readyAndStart,until,pages,read,setRoomPath:value=>{roomPath=value;},screenshot,root,backend,codec});return;}
        if(args.includes('--pitch-variations')){
            const V=require('../../js/games/impressions/pitch-variations.js'),H=require('../../js/games/impressions/color-variants.js'),C=require('../../js/games/impressions/categories.js');
            async function frequency(host,values){for(const [id,value]of Object.entries(values)){if(roomPath)await until(()=>host.eval(`__impressionsOnline.controller().current().data.revision===${read().revision}`),'Pitch settings revision');await fill(host,'impressions-weight-'+id,value);if(roomPath)await until(()=>read().options.categoryWeights[id]===value,'Pitch weight accepted');}}
            async function enter(p,g){const q=g.question,answer=q.type==='color'&&q.version===2?H.targetAnswer(q):q.target;
                await p.eval(`(()=>{const q=${JSON.stringify(q)},answer=${JSON.stringify(answer)},set=(selector,n,step,decimal=false)=>{const e=document.querySelector(selector),press=(key,shiftKey=false)=>e.dispatchEvent(new KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true}));press('Home');if(decimal){const u=Math.round(n*100);for(let i=0;i<Math.floor(u/1500);i++)press('PageUp');for(let i=0;i<Math.floor(u%1500/100);i++)press('ArrowUp');for(let i=0;i<u%100;i++)press('ArrowUp',true);}else for(const key of [...Array(Math.floor(n/step)).fill('PageUp'),...Array(n%step).fill('ArrowUp')])press(key);};if(q.type==='pitch'){q.tones.forEach((id,i)=>{if(q.fixed.includes(id))return;if(q.tones.length===5)document.querySelector('#impressions-pitch-tones [data-tone="'+i+'"]').click();set(q.tones.length===5?'#impressions-wheel-pitch-shared .impressions-wheel':'#impressions-wheel-pitch-'+i+' .impressions-wheel',Math.round(ImpressionsPitch.hzToCents(answer[id])),100);});}else if(q.type==='color'&&q.version===3){document.getElementById('impressions-color-mode-rgb').click();answer.forEach((n,i)=>set('#impressions-wheel-dual-'+'rgb'[i]+' .impressions-wheel',n,16));}else if(q.type==='color'){Object.entries(answer).forEach(([id,n])=>{if(q.variant==='hue4')document.getElementById('impressions-color-select-'+id).click();set(q.variant==='single'?'#impressions-wheel-hsl-'+id+' .impressions-wheel':q.variant==='hue4'?'#impressions-wheel-hue .impressions-wheel':'#impressions-wheel-hue-'+id+' .impressions-wheel',n,15,true);});}else if(typeof answer==='object')Object.entries(answer).forEach(([id,n])=>set('#impressions-wheel-group-'+id+' .impressions-wheel',n,25));else set('#impressions-wheel-quantity .impressions-wheel',answer,25);})()`);assert.deepEqual((await state(p)).view.draft,answer);}
            let a=await page('Host',390,844,3600000),b=await page('Guest',1200,900,-3600000);await online(a);await frequency(a,{color:0,quantity:0,pitch:2});await fill(a,'impressions-max-rounds',12);await click(a,'impressions-create-btn');await until(async()=>!!(await state(a)).data?.code,'varied Pitch room');let s=await state(a);const code=s.data.code;roomPath='rooms/memory_rooms/R-'+code;a.uid=s.uid;
            await online(b);await fill(b,'impressions-code-input',code);await click(b,'impressions-join-btn');await until(async()=>Object.keys((await state(b)).data?.players||{}).length===2,'varied Pitch guest');b.uid=(await state(b)).uid;assert.equal(await a.eval('document.getElementById("impressions-start-btn").disabled'),true);
            async function play(label,{hostLoss=false,backgroundExpiry=false}={}){
                const counts={color:0,quantity:0,pitch:0},lengths=new Set(),references=new Set(),contours=new Set(),cap=read().game.config.maxRounds;let backgroundDone=false;
                for(let round=1;round<=cap;round++){
                    const g=structuredClone(read().game),token={matchId:g.matchId,round:g.round,questionId:g.questionId,categoryId:g.categoryId};assert.equal(g.protocolVersion,12);counts[g.categoryId]++;await advance(g.timeline.memorizeAt+50);await agreed('varied canonical question');
                    for(const p of pages){assert.deepEqual((await state(p)).data.game.question,g.question);assert.deepEqual((await state(p)).data.game.variantState,g.variantState);assert.deepEqual((await state(p)).data.game.timeline,g.timeline);}
                    if(g.categoryId==='pitch'){lengths.add(g.question.tones.length);references.add(g.question.fixed.join(','));contours.add(g.question.variation.contour);assert(g.question.parameters.pitch.requiredMemorizeMs<=g.roundTiming.memorizeMs);for(const p of pages){assert.equal((await state(p)).view.audio.scheduled,g.question.tones.length*g.config.pitch.audio.repeats);assert.equal(await p.eval('document.getElementById("impressions-pitch-result-rows").children.length'),0);assert.equal(await p.eval('document.getElementById("impressions-pitch-original").hidden'),true);}}
                    if(label==='two Pitch-only'&&round===1)await b.eval('window.__cpuNetwork.setOnline(false)');if(hostLoss&&round===5){await click(a,'impressions-online-btn');await click(a,'impressions-leave-btn');await until(()=>read().hostUid===b.uid,'varied Pitch host departure');pages.shift();a=b;}
                    await advance(g.timeline.answerAt+100);if(label==='two Pitch-only'&&round===1){await b.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()');await until(()=>b.eval('__impressionsOnline.controller().canControl()'),'varied Pitch memorize reconnect');assert.notEqual((await state(b)).view.audio.source,'target');}
                    if(round===3)await b.eval('window.__cpuNetwork.snapshotDelay=250');const background=backgroundExpiry&&g.categoryId==='pitch'&&!backgroundDone?pages.at(-1):null,active=pages.filter(p=>p!==background);
                    if(g.categoryId==='pitch')for(const p of pages)if(await p.eval('innerWidth===320')){await p.eval('__impressionsView.reveal()');const bounds=await p.eval('(()=>{const b=document.getElementById("impressions-pitch-tones").getBoundingClientRect(),a=document.getElementById("impressions-action").getBoundingClientRect();return{tones:[b.top,b.bottom],action:[a.top,a.bottom],height:innerHeight}})()');assert(bounds.tones[0]>=80&&bounds.tones[1]<=bounds.height,'All tone identities visible: '+JSON.stringify(bounds));assert(bounds.action[0]>=0&&bounds.action[1]<=bounds.height,'Pitch submit visible: '+JSON.stringify(bounds));}
                    await Promise.all(active.map(p=>enter(p,g)));if(label==='two Pitch-only'&&round===1)await b.eval('window.__cpuNetwork.rejectAck=true');await Promise.all(active.map(p=>click(p,'impressions-action')));await until(()=>Object.keys(read().game.submissions).length===active.length,'concurrent varied answers');
                    const receipt=structuredClone(read().game.submissions[(await state(b)).id]);if(label==='two Pitch-only'&&round===1){await b.eval('window.__cpuNetwork.setOnline(false)');await advance(g.timeline.answerAt+4500);await b.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()');await until(()=>b.eval('__impressionsOnline.controller().canControl()'),'varied accepted reconnect');assert.deepEqual(read().game.submissions[(await state(b)).id],receipt);}
                    if(background){await advance(g.timeline.deadline-500);await background.send('Page.setWebLifecycleState',{state:'frozen'});}await advance(g.timeline.deadline+10,active);await until(()=>read().game.settledRound===round,'varied atomic settlement');if(background){await background.send('Page.setWebLifecycleState',{state:'active'});await background.eval(`window.__impressionsEpoch=${canonicalTime};__impressionsOnline.clock().refresh();__impressionsView.tick();__impressionsOnline.tick()`);backgroundDone=true;}
                    await agreed('varied result snapshots');assert.deepEqual(read().game.variantState,g.variantState);for(const row of read().game.lastResult.rows){const answer=read().game.submissions[row.id];assert.equal(row.scoreUnits,answer?Math.round(C.grade(g.question,answer.answer,g.config).score*1000):0);if(answer){assert.equal(row.damageUnits,0);if(g.categoryId==='pitch')assert.equal(Object.keys(row.pitchErrors).length,g.question.tones.length-g.question.fixed.length);}}
                    await checkPlaytest(read().game);
                    if(label==='two Pitch-only'&&round===1)assert(await b.eval(`__impressionsOnline.controller().submit(${JSON.stringify(receipt.answer)},${JSON.stringify(token)},${JSON.stringify(receipt.nonce)})`));
                    if(g.categoryId==='pitch'){for(const p of pages){assert(!(await state(p)).view.audio.playing);assert.equal((await state(p)).view.audio.voices,0);}await screenshot(pages[1],'varied-'+label.replaceAll(' ','-')+'-'+g.question.tones.length+'-'+g.question.fixed.length+'-results');}
                    if(round<cap){await advance(read().game.resultsUntil+1);await until(()=>read().game.round===round+1,'varied round advancement');await agreed('varied next round');}
                }
                for(const p of pages){assert.deepEqual(await p.eval('window.__pageErrors'),[]);assert(await p.eval('document.documentElement.scrollWidth<=innerWidth'));}if(backgroundExpiry)assert(backgroundDone);console.log('PASS: '+label+': '+JSON.stringify(counts)+', lengths '+[...lengths].join('/')+', references '+[...references].join('/')+', contours '+[...contours].join('/')+'; real audio plans, keyed concurrent submissions, shared deadlines, atomic RMS/HP/adaptation and mobile layout.');return{lengths,references,contours};
            }
            await readyAndStart();const first=await play('two Pitch-only');assert.deepEqual([...first.lengths].sort(),[3,4,5]);assert([...first.references].some(r=>r.includes(',')));assert([...first.references].some(r=>r!=='n1'&&!r.includes(',')));assert(first.contours.size>=3);
            await click(a,'impressions-action');await click(a,'impressions-return-btn');await until(()=>read().phase==='lobby','varied replay lobby');for(let i=2;i<8;i++){const p=await page('Player '+(i+1),i===2?320:900,i===2?568:900,i%2?3600000:-3600000);await online(p);await fill(p,'impressions-code-input',code);await click(p,'impressions-join-btn');await until(async()=>Object.keys((await state(p)).data?.players||{}).length===i+1,'extra varied client');p.uid=(await state(p)).uid;}
            await readyAndStart();await play('eight Pitch-only',{backgroundExpiry:true});assert.equal(read().game.variantState.pitch.draw,12);await click(a,'impressions-action');await click(a,'impressions-return-btn');await until(()=>read().phase==='lobby','varied two-reference lobby');
            await until(()=>a.eval(`__impressionsOnline.controller().current().data.revision===${read().revision}`),'two-reference lobby snapshot');assert(await a.eval(`__impressionsOnline.controller().configure({maxRounds:1,pitch:{variations:{lengths:{easy:{n3:0,n4:0,n5:1},hard:{n3:0,n4:0,n5:1}},references:{easy:{one:0,two:1},hard:{one:0,two:1}}}}})`));await until(()=>read().options.maxRounds===1,'two-reference settings');await readyAndStart();assert.equal(read().game.question.fixed.length,2);await play('eight two-reference');
            await click(a,'impressions-action');await click(a,'impressions-return-btn');await until(()=>read().phase==='lobby','varied mixed lobby');await until(()=>a.eval(`__impressionsOnline.controller().current().data.revision===${read().revision}`),'mixed lobby snapshot');assert(await a.eval('__impressionsOnline.controller().configure({maxRounds:12,pitch:{variations:ImpressionsPitchVariations.configuration()}})'));await until(()=>read().options.maxRounds===12,'mixed reset settings');await frequency(a,{color:2,quantity:2,pitch:2});await readyAndStart();await play('eight mixed',{hostLoss:true,backgroundExpiry:true});assert.equal(read().game.variantState.pitch.draw,4);assert.equal(read().game.variantState.color.draw,4);assert.equal(read().game.variantState.quantity.draw,4);console.log('PASS: Pitch variation sound readiness, twelve-round variety, lost-ack/late receipts, reconnect, delayed snapshots, suspended expiry, host loss and same-room rematches; Color/Quantity behavior preserved.');return;
        }
        if (args.includes('--color-variants')) {
            const H=require('../../js/games/impressions/color-variants.js'), C=require('../../js/games/impressions/categories.js');
            async function frequencies(host,values){for(const [id,value] of Object.entries(values)){if(roomPath)await until(()=>host.eval(`__impressionsOnline.controller().current().data.revision===${read().revision}`),'Color frequency revision');await fill(host,'impressions-weight-'+id,value);if(roomPath)await until(()=>read().options.categoryWeights[id]===value,'Color frequency accepted');}}
            async function enter(p,game) {
                const answer=game.categoryId==='color'&&game.question.version===2?H.targetAnswer(game.question):game.question.target;
                if(game.categoryId==='color'&&game.question.version===2) {
                    for(const [id,value] of Object.entries(answer)) {
                        if(game.question.variant==='hue4')await p.eval(`document.getElementById('impressions-color-select-${id}').click()`);
                        const selector=game.question.variant==='single'?'#impressions-wheel-hsl-'+id+' .impressions-wheel':game.question.variant==='hue4'?'#impressions-wheel-hue .impressions-wheel':'#impressions-wheel-hue-'+id+' .impressions-wheel';
                        await p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),u=Math.round(${value}*100),press=(key,shiftKey=false)=>e.dispatchEvent(new KeyboardEvent('keydown',{key,shiftKey,bubbles:true}));press('Home');for(let i=0;i<Math.floor(u/1500);i++)press('PageUp');for(let i=0;i<Math.floor(u%1500/100);i++)press('ArrowUp');for(let i=0;i<u%100;i++)press('ArrowUp',true);})()`);
                    }
                }else await p.eval(`(()=>{const type=${JSON.stringify(game.categoryId)},answer=${JSON.stringify(answer)},set=(selector,n,step)=>{const e=document.querySelector(selector);for(const key of ['Home',...Array(Math.floor(n/step)).fill('PageUp'),...Array(n%step).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));};if(type==='pitch')answer.forEach((hz,i)=>{if(i)set('#impressions-wheel-pitch-'+i+' .impressions-wheel',Math.round(ImpressionsPitch.hzToCents(hz)),100);});else if(typeof answer==='object')Object.entries(answer).forEach(([id,n])=>set('#impressions-wheel-group-'+id+' .impressions-wheel',n,25));else set('#impressions-wheel-quantity .impressions-wheel',answer,25);})()`);
                assert.deepEqual((await state(p)).view.draft,answer);
            }
            const palette=p=>p.eval('Array.from(document.querySelectorAll("#impressions-modern-palette .impressions-color-card"),e=>[e.dataset.swatch,e.style.backgroundColor])');
            let a=await page('Host',390,844,3600000),b=await page('Guest',1200,900,-3600000);
            await online(a);await frequencies(a,{color:2,quantity:0,pitch:0});await fill(a,'impressions-max-rounds',12);await click(a,'impressions-create-btn');await until(async()=>!!(await state(a)).data?.code,'Color room');let s=await state(a);const code=s.data.code;roomPath='rooms/memory_rooms/R-'+code;a.uid=s.uid;
            await online(b);await fill(b,'impressions-code-input',code);await click(b,'impressions-join-btn');await until(async()=>Object.keys((await state(b)).data?.players||{}).length===2,'Color guest');b.uid=(await state(b)).uid;
            async function play(label,{hostLoss=false,backgroundExpiry=false}={}){
                const seen=new Set(),counts={color:0,quantity:0,pitch:0};let backgroundDone=false;
                for(let round=1;round<=12;round++) {
                    const g=structuredClone(read().game),token={matchId:g.matchId,round:g.round,questionId:g.questionId,categoryId:g.categoryId};assert.equal(g.protocolVersion,12);counts[g.categoryId]++;await advance(g.timeline.memorizeAt+100);await agreed('Color committed question/timeline');
                    const modern=g.categoryId==='color',original=modern?await palette(pages[0]):null;if(modern){seen.add(g.question.variant);for(const p of pages){assert.deepEqual(await palette(p),original);assert.equal(await p.eval('document.getElementById("impressions-color-error-rows").children.length'),0);assert.equal(await p.eval('document.getElementById("impressions-color-rms").textContent'),'');}}
                    if(label==='two Color-only'&&round===1)await b.eval('window.__cpuNetwork.setOnline(false)');
                    if(hostLoss&&round===5){await click(a,'impressions-online-btn');await click(a,'impressions-leave-btn');await until(()=>read().hostUid===b.uid,'Color host departure');pages.shift();a=b;}
                    await advance(g.timeline.answerAt+100);
                    if(modern)for(const p of pages)if(await p.eval('innerWidth===320')){await p.eval('__impressionsView.reveal()');const layout=await p.eval('(()=>{const bounds=id=>{const r=document.getElementById(id).getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height};};return{palette:bounds("impressions-modern-palette"),action:bounds("impressions-action"),height:innerHeight,phase:document.getElementById("impressions-game").dataset.phase,variant:document.getElementById("impressions-game").dataset.colorVariant,scroll:scrollY}})()');if(layout.palette.top<0||layout.palette.bottom>layout.height){const shot=await p.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(root,'.cache','impressions-color-network-layout-failure.png'),Buffer.from(shot.data,'base64'));}assert(layout.palette.top>=0&&layout.palette.bottom<=layout.height,'The entire Hue answer palette stays visible at 320px: '+JSON.stringify(layout));assert(layout.action.top>=0&&layout.action.bottom<=layout.height,'Submit remains visible with the Hue palette at 320px: '+JSON.stringify(layout));}
                    if(label==='two Color-only'&&round===1){await b.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()');await until(()=>b.eval('__impressionsOnline.controller().canControl()'),'Color memorization reconnect');}
                    if(round===3)await b.eval('window.__cpuNetwork.snapshotDelay=250');
                    const background=backgroundExpiry&&modern&&!backgroundDone?pages.at(-1):null,active=pages.filter(p=>p!==background);
                    await Promise.all(active.map(p=>enter(p,g)));if(modern)for(const p of active)assert.deepEqual(await palette(p),original);
                    if(label==='two Color-only'&&round===1)await b.eval('window.__cpuNetwork.rejectAck=true');
                    await Promise.all(active.map(p=>click(p,'impressions-action')));await until(()=>Object.keys(read().game.submissions).length===active.length,'Color concurrent versioned receipts');
                    const accepted=structuredClone(read().game.submissions[(await state(b)).id]);
                    if(label==='two Color-only'&&round===1){await b.eval('window.__cpuNetwork.setOnline(false)');await advance(g.timeline.answerAt+4500);await b.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()');await until(()=>b.eval('__impressionsOnline.controller().canControl()'),'Color answer reconnect');assert.deepEqual(read().game.submissions[(await state(b)).id],accepted);}
                    if(background){await advance(g.timeline.deadline-500);await background.send('Page.setWebLifecycleState',{state:'frozen'});}
                    await advance(g.timeline.deadline+10,active);await until(()=>read().game.settledRound===round,'Color atomic settlement');
                    if(background){await background.send('Page.setWebLifecycleState',{state:'active'});await background.eval(`window.__impressionsEpoch=${canonicalTime};__impressionsOnline.clock().refresh();__impressionsView.tick();__impressionsOnline.tick()`);backgroundDone=true;}
                    await agreed('Color result agreement');assert.deepEqual(read().game.variantState,g.variantState);
                    for(const row of read().game.lastResult.rows){const accepted=read().game.submissions[row.id];assert.equal(row.scoreUnits,accepted?Math.round(C.grade(g.question,accepted.answer,g.config).score*1000):0);if(accepted)assert.equal(row.damageUnits,0);}
                    if(label==='two Color-only'&&round===1)assert.equal(await b.eval(`__impressionsOnline.controller().submit(${JSON.stringify(accepted.answer)},${JSON.stringify(token)},${JSON.stringify(accepted.nonce)})`),true);
                    if(modern){assert.equal(await pages[1].eval('document.getElementById("impressions-modern-color-comparison").hidden'),false);await screenshot(pages[1],'color-'+label.replaceAll(' ','-')+'-'+g.question.variant+'-results');}
                    if(round<12){await advance(read().game.resultsUntil+1);await until(()=>read().game.round===round+1,'Color next round');await agreed('Color advance snapshot');}
                }
                for(const p of pages){assert.deepEqual(await p.eval('window.__pageErrors'),[]);assert(await p.eval('document.documentElement.scrollWidth<=innerWidth'));}
                if(backgroundExpiry)assert(backgroundDone);console.log('PASS: '+label+': '+JSON.stringify(counts)+', variants '+[...seen].join('/')+'; native decimal controls, matching palettes, concurrent receipts, frozen parameters, result rows and once-only HP/adaptation.');return seen;
            }
            await readyAndStart();const seen=await play('two Color-only');assert.deepEqual([...seen].sort(),[...H.variants].sort());assert.equal(read().game.variantState.color.draw,12);assert.equal(await a.eval('typeof window.__impressionsAudioProbe'),'undefined');
            await click(a,'impressions-action');await click(a,'impressions-return-btn');await until(()=>read().phase==='lobby','Color rematch lobby');
            for(let i=2;i<8;i++){const p=await page('Player '+(i+1),i===2?320:900,i===2?568:900,i%2?3600000:-3600000);await online(p);await fill(p,'impressions-code-input',code);await click(p,'impressions-join-btn');await until(async()=>Object.keys((await state(p)).data?.players||{}).length===i+1,'Color extra client');p.uid=(await state(p)).uid;}
            await readyAndStart();await play('eight Color-only',{backgroundExpiry:true});assert.equal(read().game.variantState.color.draw,12);
            await click(a,'impressions-action');await click(a,'impressions-return-btn');await until(()=>read().phase==='lobby','Color mixed rematch');await frequencies(a,{color:2,quantity:2,pitch:2});await readyAndStart();await play('eight mixed',{hostLoss:true,backgroundExpiry:true});assert.equal(read().game.variantState.color.draw,4);assert.equal(read().game.variantState.quantity.draw,4);
            console.log('PASS: production Color defaults, Color-only sound-free readiness, lost-ack/late duplicate receipts, reconnect, delayed snapshots, host departure, suspended expiry and same-room mixed rematches.');return;
        }
        if (args.includes('--errors-only')) {
            const cases = [
                { name: 'guest sign-in disabled', stage: 'auth', code: 'auth/operation-not-allowed', key: 'impressionsGuestDisabled',
                    inject: "window.__originalGuest=ArcadeNet.signInGuest;ArcadeNet.signInGuest=()=>Promise.reject(Object.assign(new Error('Guest provider disabled'),{code:'auth/operation-not-allowed'}))" },
                { name: 'room access denied', stage: 'room', code: 'PERMISSION_DENIED', key: 'impressionsPermissionError', room: true },
                { name: 'server clock unavailable', stage: 'clock', code: 'room/clock-unavailable', key: 'impressionsClockError',
                    inject: "ArcadeNet.rooms.clock=()=>({dispose(){},isConnected:()=>false,isReady:()=>false,waitUntilReady:()=>Promise.reject(Object.assign(new Error('Clock connection failed'),{code:'room/clock-unavailable'}))})" },
                { name: 'cached networking module', stage: 'module', code: 'room/client-outdated', key: 'impressionsClientOutdated', inject: 'delete ArcadeNet.rooms.clock' },
                { name: 'module initialization failed', stage: 'module', code: 'room/module-unavailable', key: 'impressionsModuleError',
                    inject: "ArcadeNet.ok=false;ArcadeNet.error='Fixture module download blocked'" },
            ];
            for (const test of cases) {
                const p = await page(test.name, 390, 844, 0);
                await p.eval("window.__impressionsErrors=[];const original=console.error;console.error=(tag,details,...rest)=>{if(tag==='[Impressions online]')__impressionsErrors.push(details);original(tag,details,...rest)};import('/js/net/net.js')");
                await until(() => p.eval('!!window.ArcadeNet'), 'network fixture boot');
                if (test.inject) await p.eval(test.inject);
                if (test.room) {
                    await online(p);
                    await p.eval('__impressionsOnline.ensureOnline()');
                    await p.eval('window.__impressionsDenyRoom=true');
                    await click(p, 'impressions-create-btn');
                } else await click(p, 'impressions-online-btn');
                try { await until(() => p.eval('__impressionsErrors.length > 0'), test.name + ' diagnostics'); }
                catch (error) {
                    console.error(await p.eval(`({errorText:document.getElementById('impressions-lobby-error').textContent,
                        room:!!__impressionsOnline.controller()?.current(),auth:!!ArcadeNet.currentUser(),errors:__pageErrors,
                        button:(()=>{const e=document.getElementById('impressions-create-btn'),r=e.getBoundingClientRect();return {disabled:e.disabled,x:r.x,y:r.y,w:r.width,h:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id}})()})`));
                    throw error;
                }
                const diagnostic = await p.eval('__impressionsErrors.at(-1)');
                assert.equal(diagnostic.stage, test.stage); assert.equal(diagnostic.code, test.code);
                assert.equal(await p.eval('document.getElementById("impressions-lobby-error").textContent'),
                    await p.eval(`ArcadeCommon.i18n.t(${JSON.stringify(test.key)})+' ['+${JSON.stringify(test.code)}+']'`));
                if (test.code === 'auth/operation-not-allowed') {
                    await p.eval('ArcadeNet.signInGuest=__originalGuest');
                    await click(p, 'impressions-lobby-close'); await online(p);
                    await click(p, 'impressions-create-btn');
                    await until(() => p.eval('!!__impressionsOnline.controller().current()?.data'), 'retry after repaired authentication');
                    await click(p, 'impressions-leave-btn');
                }
                assert.deepEqual(await p.eval('window.__pageErrors'), []);
                pages.pop(); await protocol.send('Target.disposeBrowserContext', { browserContextId: p.browserContextId });
                console.log('PASS: ' + test.name + ': specific UI message, original code/stage in Console and no unhandled rejection.');
            }
            return;
        }

        if (args.includes('--groups')) {
            const Categories = require('../../js/games/impressions/categories.js');
            async function frequencies(p, values) { for (const [id, value] of Object.entries(values)) { await until(() => p.eval(`__impressionsOnline.controller().current().data.revision===${read().revision}`), 'group settings revision'); await fill(p, 'impressions-weight-' + id, value); await until(() => read().options.categoryWeights[id] === value, 'group frequency accepted'); } }
            async function enter(p, game) {
                await p.eval(`(()=>{const type=${JSON.stringify(game.categoryId)},answer=${JSON.stringify(game.question.target)};const set=(selector,n,step)=>{const e=document.querySelector(selector);for(const key of ['Home',...Array(Math.floor(n/step)).fill('PageUp'),...Array(n%step).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));};if(type==='color')answer.forEach((n,i)=>set('#impressions-wheel-'+['r','g','b'][i]+' .impressions-wheel',n,16));else if(type==='pitch')answer.forEach((hz,i)=>{if(i)set('#impressions-wheel-pitch-'+i+' .impressions-wheel',Math.round(ImpressionsPitch.hzToCents(hz)),100);});else if(typeof answer==='object')Object.entries(answer).forEach(([id,n])=>set('#impressions-wheel-group-'+id+' .impressions-wheel',n,25));else set('#impressions-wheel-quantity .impressions-wheel',answer,25);})()`);
                assert.deepEqual((await state(p)).view.draft, game.question.target);
            }
            const geometry = p => p.eval('Object.fromEntries(Array.from(document.querySelectorAll("#impressions-group-preview g[data-group]")).map(g=>[g.dataset.group,Array.from(g.children).map(e=>e.outerHTML)]))');
            async function aligned(game, memorize) {
                await agreed('group canonical round');
                for (const p of pages) { const s = await state(p); assert.deepEqual(s.data.game.question, read().game.question); assert.deepEqual(s.data.game.variantState, read().game.variantState); assert.deepEqual(s.data.game.timeline, read().game.timeline); }
                if (game.categoryId === 'quantity' && game.question.version === 2) {
                    const drawings = await Promise.all(pages.map(geometry)); drawings.forEach(drawing => assert.deepEqual(drawing, drawings[0]));
                    for (const p of pages) { assert.equal(await p.eval('document.getElementById("impressions-group-result-rows").children.length'), 0); if (memorize) assert(await p.eval('(()=>{const r=document.getElementById("impressions-group-preview").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})()')); }
                    if (memorize) for (const group of game.question.groups) assert.equal(drawings[0][group.id].length, game.question.target[group.id]);
                    return drawings[0];
                }
                return null;
            }
            let a = await page('Host', 390, 844, 3600000), b = await page('Guest', 1200, 900, -3600000);
            await online(a); await fill(a, 'impressions-weight-color', 0); await fill(a, 'impressions-weight-pitch', 0); await fill(a, 'impressions-max-rounds', 12); await click(a, 'impressions-create-btn');
            await until(async () => !!(await state(a)).data?.code, 'Quantity variant room'); let s = await state(a); const code = s.data.code; roomPath = 'rooms/memory_rooms/R-' + code; a.uid = s.uid;
            await online(b); await fill(b, 'impressions-code-input', code); await click(b, 'impressions-join-btn'); await until(async () => Object.keys((await state(b)).data?.players || {}).length === 2, 'group guest'); b.uid = (await state(b)).uid;
            await readyAndStart(); const seen = new Set();
            for (let round = 1; round <= 12; round++) {
                const game = structuredClone(read().game); assert.equal(game.protocolVersion,12); seen.add(game.question.variant); await advance(game.timeline.memorizeAt + 100); const original = await aligned(game, true);
                if (round === 1) await b.eval('window.__cpuNetwork.setOnline(false)'); await advance(game.timeline.answerAt + 100);
                if (round === 1) { await b.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()'); await until(() => b.eval('__impressionsOnline.controller().canControl()'), 'group memorization reconnect'); assert.deepEqual((await state(b)).data.game.variantState, game.variantState); }
                await Promise.all(pages.map(p => enter(p, game))); if (original) assert.deepEqual(await aligned(game, false), original, 'Exact keyed counts restore all memorized groups on both clients');
                if (round === 1) await b.eval('window.__cpuNetwork.rejectAck=true'); await Promise.all(pages.map(p => click(p, 'impressions-action'))); await until(() => Object.keys(read().game.submissions).length === 2, 'concurrent group maps');
                const receipt = structuredClone(read().game.submissions[(await state(b)).id]);
                if (round === 1) { await until(async () => JSON.stringify((await state(b)).view.answer) === JSON.stringify(game.question.target), 'lost-ack keyed answer remains locked'); await b.eval('window.__cpuNetwork.setOnline(false)'); await advance(game.timeline.answerAt + 4500); await b.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()'); await until(() => b.eval('__impressionsOnline.controller().canControl()'), 'accepted group reconnect'); assert.deepEqual(read().game.submissions[(await state(b)).id], receipt); }
                await advance(game.timeline.deadline + 10); await until(() => read().game.settledRound === round, 'group-only settlement'); await agreed('group result snapshots');
                assert(read().game.lastResult.rows.every(row => row.scoreUnits === 100000 && row.damageUnits === 0)); assert.deepEqual(read().game.variantState, game.variantState); assert.equal(read().game.difficultyState.historyByType.quantity.at(-1).scores.length, 2);
                if (round === 1) assert.equal(await b.eval(`__impressionsOnline.controller().submit(${JSON.stringify(receipt.answer)},${JSON.stringify({ matchId: game.matchId, round: game.round, questionId: game.questionId, categoryId: 'quantity' })},${JSON.stringify(receipt.nonce)})`), true);
                if (round < 12) { await advance(read().game.resultsUntil + 1); await until(() => read().game.round === round + 1, 'next Quantity variant'); await agreed('group next round'); }
            }
            assert.deepEqual([...seen].sort(), ['multi2', 'multi3', 'single']); assert.equal(read().game.variantState.quantity.draw, 12); assert.equal(await a.eval('typeof window.__impressionsAudioProbe'), 'undefined');
            console.log('PASS: two Quantity-only clients play all three variants across twelve rounds; exact shared layouts, strict keyed/lost-ack receipts, reconnect, one Quantity history and once-only settlement.');
            await click(a, 'impressions-action'); await click(a, 'impressions-return-btn'); await until(() => read().phase === 'lobby', 'group replay lobby'); await frequencies(a, { color: 2, quantity: 2, pitch: 2 });
            for (let i = 2; i < 8; i++) { const p = await page('Player ' + (i + 1), i === 2 ? 320 : 900, i === 2 ? 568 : 900, i % 2 ? 3600000 : -3600000); await online(p); await fill(p, 'impressions-code-input', code); await click(p, 'impressions-join-btn'); await until(async () => Object.keys((await state(p)).data?.players || {}).length === i + 1, 'additional variant client'); p.uid = (await state(p)).uid; }
            await readyAndStart(); let backgroundDone = false, multiRounds = 0;
            for (let round = 1; round <= 12; round++) {
                const game = structuredClone(read().game); await advance(game.timeline.memorizeAt + 100); const original = await aligned(game, true); if (original) multiRounds++;
                if (round === 5) { await click(a, 'impressions-online-btn'); await click(a, 'impressions-leave-btn'); await until(() => read().hostUid === b.uid, 'group host migration'); pages.shift(); a = b; }
                await advance(game.timeline.answerAt + 100); const background = original && !backgroundDone ? pages.at(-1) : null;
                if (round === 3) await b.eval('window.__cpuNetwork.snapshotDelay=250');
                await Promise.all(pages.filter(p => p !== background).map(p => enter(p, game)));
                if (original) for (const p of pages.filter(p => p !== background)) assert.deepEqual(await geometry(p), original);
                await Promise.all(pages.filter(p => p !== background).map(p => click(p, 'impressions-action'))); await until(() => Object.keys(read().game.submissions).length === pages.length - (background ? 1 : 0), 'mixed concurrent maps/arrays/scalars');
                if (background) { await advance(game.timeline.deadline - 500); await background.send('Page.setWebLifecycleState', { state: 'frozen' }); }
                await advance(game.timeline.deadline + 10, background ? pages.filter(p => p !== background) : pages); await until(() => read().game.settledRound === round, 'mixed variant settlement');
                if (background) { await background.send('Page.setWebLifecycleState', { state: 'active' }); await background.eval(`window.__impressionsEpoch=${canonicalTime};__impressionsOnline.clock().refresh();__impressionsView.tick();__impressionsOnline.tick()`); backgroundDone = true; }
                await agreed('mixed group results');
                for (const row of read().game.lastResult.rows) { const accepted = read().game.submissions[row.id]; assert.equal(row.scoreUnits, accepted ? Math.round(Categories.grade(game.question, accepted.answer, game.config).score * 1000) : 0); }
                if (original) { assert.equal(await pages[1].eval('document.getElementById("impressions-group-result-rows").children.length'), game.question.groups.length); await screenshot(pages[1], 'quantity-groups-mixed-results'); }
                if (round < 12) { await advance(read().game.resultsUntil + 1); await until(() => read().game.round === round + 1, 'mixed group advance'); await agreed('mixed group next snapshot'); }
            }
            assert(multiRounds > 0 && backgroundDone); assert.equal(read().game.variantState.quantity.draw, 4); assert.equal(read().game.status, 'over');
            for (const p of pages) { assert.deepEqual(await p.eval('window.__pageErrors'), []); assert(await p.eval('document.documentElement.scrollWidth<=innerWidth')); }
            console.log('PASS: eight mixed clients preserve Color/Pitch and grouped Quantity: canonical geometry/parameters, 320px visibility/results, delayed snapshots, host loss, background missing-map expiry and atomic HP/adaptation.'); return;
        }
        if (args.includes('--weighted')) {
            const Categories = require('../../js/games/impressions/categories.js'), Pitch = require('../../js/games/impressions/pitch.js');
            async function weight(p, type, value) { if (roomPath) await until(() => p.eval(`__impressionsOnline.controller().current().data.revision===${read().revision}`), 'weight settings revision'); await fill(p, 'impressions-weight-' + type, value); if (roomPath) await until(() => read().options.categoryWeights[type] === value, 'weight accepted'); }
            async function enter(p, game) {
                const answer = game.question.target;
                await p.eval(`(()=>{const type=${JSON.stringify(game.categoryId)},answer=${JSON.stringify(answer)};const set=(selector,value,step)=>{const e=document.querySelector(selector);for(const key of ['Home',...Array(Math.floor(value/step)).fill('PageUp'),...Array(value%step).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));};if(type==='color')answer.forEach((n,i)=>set('#impressions-wheel-'+['r','g','b'][i]+' .impressions-wheel',n,16));else if(type==='quantity'){if(typeof answer==='object')Object.entries(answer).forEach(([id,n])=>set('#impressions-wheel-group-'+id+' .impressions-wheel',n,25));else set('#impressions-wheel-quantity .impressions-wheel',answer,25);}else answer.forEach((hz,i)=>{if(i)set('#impressions-wheel-pitch-'+i+' .impressions-wheel',Math.round(ImpressionsPitch.hzToCents(hz)),100);});})()`);
                assert.deepEqual((await state(p)).view.draft, answer);
            }
            async function sameCanonical() {
                const game = read().game; await agreed('weighted canonical snapshot');
                for (const p of pages) { const s = await state(p); assert.deepEqual(s.data.game.question, game.question); assert.deepEqual(s.data.game.timeline, game.timeline); assert.deepEqual(s.data.game.selectionState, game.selectionState); assert.deepEqual(s.data.game.difficultyState, game.difficultyState); }
            }
            let a = await page('Host', 390, 844, 3600000), b = await page('Guest', 1200, 900, -3600000);
            await online(a); assert.deepEqual(await a.eval("['color','quantity','pitch'].map(id=>Number(document.getElementById('impressions-weight-'+id).value))"), [2, 2, 2]);
            await weight(a, 'color', 4); await weight(a, 'quantity', 2); await weight(a, 'pitch', 1);
            assert.deepEqual(await a.eval("['color','quantity','pitch'].map(id=>document.getElementById('impressions-probability-'+id).textContent)"), ['57%', '29%', '14%']);
            for (const id of ['color', 'quantity', 'pitch']) await weight(a, id, 0);
            await click(a, 'impressions-create-btn'); await until(async () => !!(await state(a)).data?.code, 'all-Off room'); let s = await state(a); const code = s.data.code; roomPath = 'rooms/memory_rooms/R-' + code; a.uid = s.uid;
            await online(b); await fill(b, 'impressions-code-input', code); await click(b, 'impressions-join-btn'); await until(async () => Object.keys((await state(b)).data?.players || {}).length === 2, 'weighted guest'); b.uid = (await state(b)).uid;
            assert.equal(await a.eval('document.getElementById("impressions-start-btn").disabled'), true); assert(await a.eval('document.getElementById("impressions-frequency-note").textContent.includes("at least one")'));
            await weight(a, 'color', 4); await weight(a, 'quantity', 2); await fill(a, 'impressions-max-rounds', 12); await until(() => read().options.maxRounds === 12, 'weighted cap');
            assert.equal(await a.eval('document.getElementById("impressions-room-audio").hidden'), true); assert.equal(await b.eval('typeof window.__impressionsAudioProbe'), 'undefined');
            await readyAndStart(); const firstMatch = read().game.matchId, counts = { color: 0, quantity: 0, pitch: 0 };
            for (let round = 1; round <= 12; round++) {
                const game = structuredClone(read().game); counts[game.categoryId]++; assert.equal(game.protocolVersion,12); assert.equal(game.config.selectionVersion, 3); assert.notEqual(game.categoryId, 'pitch');
                await sameCanonical(); await advance(game.timeline.memorizeAt + 100);
                if (round === 2) { await b.eval('window.__cpuNetwork.setOnline(false)'); }
                await advance(game.timeline.answerAt + 100);
                if (round === 2) { await b.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()'); await until(() => b.eval('__impressionsOnline.controller().canControl()'), 'weighted reconnect'); assert.deepEqual((await state(b)).data.game.selectionState, game.selectionState); }
                await Promise.all(pages.map(p => enter(p, game))); await Promise.all(pages.map(p => click(p, 'impressions-action'))); await until(() => Object.keys(read().game.submissions).length === 2, 'two concurrent weighted answers');
                await advance(game.timeline.deadline + 10); await until(() => read().game.settledRound === round, 'weighted settlement'); await sameCanonical();
                assert(read().game.lastResult.rows.every(row => row.scoreUnits === 100000 && row.damageUnits === 0));
                if (round < 12) { await advance(read().game.resultsUntil + 1); await until(() => read().game.round === round + 1, 'weighted advance'); await agreed('weighted next snapshots'); }
            }
            assert.deepEqual(counts, { color: 8, quantity: 4, pitch: 0 }); assert.equal(read().game.difficultyState.difficultyByType.color, 8); assert.equal(read().game.difficultyState.difficultyByType.quantity, 6); assert.equal(await a.eval('typeof window.__impressionsAudioProbe'), 'undefined');
            console.log('PASS: two weighted clients: 4:2:0 ratios, all-Off explanation, no sound requirement/context with Pitch Off, concurrent answers, independent adaptation, reconnect and frozen canonical parameters.');
            await click(a, 'impressions-action'); await click(a, 'impressions-return-btn'); await until(() => read().phase === 'lobby', 'weighted replay lobby');
            for (const id of ['color', 'quantity', 'pitch']) await weight(a, id, 2);
            await fill(a, 'impressions-initial-difficulty', 3); await until(() => read().options.adaptive.initial === 3, 'initial difficulty revision');
            for (let i = 2; i < 8; i++) { const p = await page('Player ' + (i + 1), i === 2 ? 320 : 900, i === 2 ? 568 : 900, i % 2 ? 3600000 : -3600000); await online(p); await fill(p, 'impressions-code-input', code); await click(p, 'impressions-join-btn'); await until(async () => Object.keys((await state(p)).data?.players || {}).length === i + 1, 'weighted additional player'); p.uid = (await state(p)).uid; }
            await pages[2].eval("document.getElementById('impressions-room-settings').scrollIntoView({block:'start'});");
            assert(await pages[2].eval("['color','quantity','pitch'].every(id=>{const r=document.getElementById('impressions-weight-'+id).getBoundingClientRect();return r.width>=85&&r.left>=0&&r.right<=innerWidth})"));
            await screenshot(pages[2], 'weighted-lobby-mobile');
            assert.equal(await a.eval('document.getElementById("impressions-start-btn").disabled'), true); await readyAndStart(); assert.notEqual(read().game.matchId, firstMatch);
            let backgroundDone = false, reconnectDone = false; const countsEight = { color: 0, quantity: 0, pitch: 0 };
            for (let round = 1; round <= 12; round++) {
                const game = structuredClone(read().game), frozen = structuredClone(game.question); countsEight[game.categoryId]++; await sameCanonical(); await advance(game.timeline.memorizeAt + 100);
                if (round === 5) { await click(a, 'impressions-online-btn'); await click(a, 'impressions-leave-btn'); await until(() => read().hostUid === b.uid, 'weighted host migration'); pages.shift(); a = b; }
                await advance(game.timeline.answerAt + 100);
                const background = !backgroundDone && game.categoryId === 'pitch' ? pages.at(-1) : null;
                if (round === 3) await b.eval('window.__cpuNetwork.snapshotDelay=250');
                await Promise.all(pages.filter(p => p !== background).map(p => enter(p, game))); await Promise.all(pages.filter(p => p !== background).map(p => click(p, 'impressions-action')));
                await until(() => Object.keys(read().game.submissions).length === pages.length - (background ? 1 : 0), 'eight/remaining weighted receipts');
                if (!reconnectDone && !background) { const receipt = structuredClone(read().game.submissions[(await state(b)).id]); await b.eval('window.__cpuNetwork.setOnline(false)'); await advance(game.timeline.answerAt + 4500); await b.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()'); await until(() => b.eval('__impressionsOnline.controller().canControl()'), 'weighted accepted reconnect'); assert.deepEqual(read().game.submissions[(await state(b)).id], receipt); reconnectDone = true; }
                if (background) { await advance(game.timeline.deadline - 500); await background.send('Page.setWebLifecycleState', { state: 'frozen' }); }
                await advance(game.timeline.deadline + 10, background ? pages.filter(p => p !== background) : pages); await until(() => read().game.settledRound === round, 'eight weighted settlement');
                if (background) { await background.send('Page.setWebLifecycleState', { state: 'active' }); await background.eval(`window.__impressionsEpoch=${canonicalTime};__impressionsOnline.clock().refresh();__impressionsView.tick();__impressionsOnline.tick()`); backgroundDone = true; }
                await sameCanonical(); assert.deepEqual(read().game.question, frozen);
                for (const row of read().game.lastResult.rows) { const receipt = read().game.submissions[row.id]; assert.equal(row.scoreUnits, receipt ? Math.round(Categories.grade(game.question, receipt.answer, game.config).score * 1000) : 0); }
                assert(read().game.difficultyState.historyByType[game.categoryId].at(-1).scores.every(score => score === 100));
                if (round < 12) { await advance(read().game.resultsUntil + 1); await until(() => read().game.round === round + 1, 'eight weighted advancement'); await agreed('eight weighted next question'); }
            }
            assert.deepEqual(countsEight, { color: 4, quantity: 4, pitch: 4 }); assert.deepEqual(read().game.difficultyState.difficultyByType, { color: 4, quantity: 4, pitch: 4 }); assert(backgroundDone);
            for (const p of pages) { assert.deepEqual(await p.eval('window.__pageErrors'), []); assert(await p.eval('document.documentElement.scrollWidth<=innerWidth')); }
            await screenshot(pages[1], 'weighted-eight-results');
            console.log('PASS: eight weighted clients: twelve Color/Quantity/Pitch rounds, required sound acknowledgements, three-tone mapping, identical committed parameters/timing, atomic adaptation/HP, delayed snapshots, missing-score exclusion, host loss and reconnect.');
            await click(a, 'impressions-action'); await click(a, 'impressions-return-btn'); await until(() => read().phase === 'lobby', 'new weighted rematch');
            await weight(a, 'pitch', 0); await weight(a, 'color', 0); await weight(a, 'quantity', 4); await fill(a, 'impressions-max-rounds', 1); await until(() => read().options.maxRounds === 1, 'rematch cap'); await fill(a, 'impressions-initial-difficulty', 7); await until(() => read().options.adaptive.initial === 7, 'rematch level'); await readyAndStart();
            const game = structuredClone(read().game); assert.equal(game.categoryId, 'quantity'); assert.deepEqual(game.difficultyState.historyByType, { color: [], quantity: [], pitch: [] }); assert.equal(game.difficultyState.difficultyByType.quantity, 7);
            await advance(game.timeline.answerAt + 100); await Promise.all(pages.map(p => enter(p, game))); await Promise.all(pages.map(p => click(p, 'impressions-action'))); await until(() => Object.keys(read().game.submissions).length === pages.length, 'rematch receipts'); await advance(game.timeline.deadline + 10); await until(() => read().game.status === 'over', 'rematch finished'); await sameCanonical();
            console.log('PASS: same-room weighted rematch resets bag/history/initial levels and drops the sound gate when Pitch is disabled.'); return;
        }
        if (args.includes('--pitch')) {
            const Pitch = require('../../js/games/impressions/pitch.js');
            async function enter(p, game, answer = game.question.target) {
                if (game.categoryId === 'color') return rgb(p, answer, false);
                if (game.categoryId === 'quantity') {
                    await p.eval(`(()=>{const e=document.querySelector('#impressions-wheel-quantity .impressions-wheel');for(const key of ['Home',...Array(Math.floor(${answer}/25)).fill('PageUp'),...Array(${answer}%25).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));})()`);
                } else {
                    for (let i = 1; i < answer.length; i++) { const cents = Math.round(Pitch.hzToCents(answer[i])); await p.eval(`(()=>{const e=document.querySelector('#impressions-wheel-pitch-${i} .impressions-wheel');for(const key of ['Home',...Array(${Math.floor(cents / 100)}).fill('PageUp'),...Array(${cents % 100}).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));})()`); }
                }
                assert.deepEqual((await state(p)).view.draft, answer);
            }
            async function memorizePitch(game) {
                await advance(game.timeline.memorizeAt + 100); await agreed('Pitch memorization');
                for (const p of pages) {
                    const s = await state(p); assert.equal(s.view.phase, 'memorize');
                    if (game.categoryId === 'pitch') {
                        assert.equal(s.view.audio.scheduled, game.question.target.length * game.config.pitch.audio.repeats,
                            JSON.stringify({ client: p.name, audio: s.view.audio, phase: s.view.phase, now: s.now, timeline: game.timeline, hidden: await p.eval('document.hidden'), contexts: await p.eval('__impressionsAudioProbe.map(p=>p.context.state)') }));
                        const count = await p.eval('__impressionsAudioProbe[0].notes.length'); await p.eval('__impressionsOnline.tick();__impressionsView.tick()');
                        assert.equal(await p.eval('__impressionsAudioProbe[0].notes.length'), count, 'Room snapshots do not replay the target');
                    }
                }
            }
            const a = await page('Host', 390, 844, 3600000), b = await page('Guest', 1200, 900, -3600000);
            await online(a); await fill(a, 'impressions-categories', 'pitch'); await fill(a, 'impressions-max-rounds', 2); await click(a, 'impressions-create-btn');
            await until(async () => !!(await state(a)).data?.code, 'Pitch room'); let s = await state(a); const code = s.data.code; roomPath = 'rooms/memory_rooms/R-' + code; a.uid = s.uid;
            await online(b); await fill(b, 'impressions-code-input', code); await click(b, 'impressions-join-btn'); await until(async () => Object.keys((await state(b)).data?.players || {}).length === 2, 'Pitch guest'); b.uid = (await state(b)).uid;
            assert.equal(await a.eval('document.getElementById("impressions-start-btn").disabled'), true); assert.equal(await b.eval('document.getElementById("impressions-ready-btn").disabled'), true);
            await readyAndStart();
            for (let round = 1; round <= 2; round++) {
                const game = structuredClone(read().game); assert.equal(game.protocolVersion,12); await memorizePitch(game);
                assert.equal(game.timeline.answerAt - game.timeline.memorizeAt, 8000); assert.equal(game.timeline.deadline - game.timeline.answerAt, 35000);
                if (round === 1) await b.eval('window.__cpuNetwork.setOnline(false)'); await advance(game.timeline.answerAt + 100);
                if (round === 1) { await b.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()'); await until(() => b.eval('__impressionsOnline.controller().canControl()'), 'Pitch memorization reconnect'); assert.equal((await state(b)).view.audio.source, null); }
                await enter(a, game);
                if (round === 1) {
                    const answer = game.question.target.map((hz, i) => i === 0 ? hz : Pitch.centsToHz(Math.round(Pitch.hzToCents(hz)) + (hz > 440 ? -80 : 80)));
                    await enter(b, game, answer); await Promise.all([click(a, 'impressions-action'), click(b, 'impressions-action')]);
                    await until(() => Object.keys(read().game.submissions).length === 2, 'concurrent Pitch receipts');
                    const receipt = structuredClone(read().game.submissions[(await state(b)).id]);
                    await b.eval('window.__cpuNetwork.setOnline(false)'); await advance(game.timeline.answerAt + 4500);
                    await b.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()'); await until(() => b.eval('__impressionsOnline.controller().canControl()'), 'Pitch answer reconnect'); assert.deepEqual(read().game.submissions[(await state(b)).id], receipt);
                } else { await click(a, 'impressions-action'); await advance(game.timeline.deadline - 500); await b.send('Page.setWebLifecycleState', { state: 'frozen' }); }
                await advance(game.timeline.deadline + 10, round === 2 ? [a] : pages); await until(() => read().game.settledRound === round, 'Pitch settlement');
                if (round === 2) { await b.send('Page.setWebLifecycleState', { state: 'active' }); await b.eval(`window.__impressionsEpoch=${canonicalTime};__impressionsOnline.clock().refresh();__impressionsView.tick();__impressionsOnline.tick()`); }
                await agreed('Pitch result snapshots');
                for (const row of read().game.lastResult.rows) { const accepted = read().game.submissions[row.id]; assert.equal(row.scoreUnits, accepted ? Math.round(Pitch.grade(game.question.target, accepted.answer, game.config.pitch.scoring, game.config.pitch.generation).score * 1000) : 0); }
                assert.equal((await state(a)).view.audio.playing, false);
                if (round === 1) {
                    const hp = structuredClone(read().game.hpUnits); await b.eval('window.__cpuNetwork.setOnline(false)'); await advance(read().game.resultsAt + 4000);
                    await b.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()'); await until(() => b.eval('__impressionsOnline.controller().canControl()'), 'Pitch results reconnect'); assert.deepEqual(read().game.hpUnits, hp);
                    await advance(read().game.resultsUntil + 1); await until(() => read().game.round === 2, 'Pitch second round'); await agreed('Pitch second question');
                }
            }
            assert.deepEqual(read().game.winners, [(await state(a)).id]);
            console.log('PASS: two real Pitch clients: explicit audio readiness, shared 8s/35s timeline, non-replayed audio, concurrent arrays, RMS/damage, three-phase reconnect, frozen-page late rejection and result cleanup.');
            await click(a, 'impressions-action'); await click(a, 'impressions-return-btn'); await until(() => read().phase === 'lobby', 'Pitch replay lobby');
            await fill(a, 'impressions-categories', 'mixed'); await until(() => read().options.categoryMode === 'mixed', 'new Mixed cycle'); await fill(a, 'impressions-max-rounds', 3); await until(() => read().options.maxRounds === 3, 'Mixed cap');
            for (let i = 2; i < 8; i++) { const p = await page('Player ' + (i + 1), i === 2 ? 320 : 900, i === 2 ? 568 : 900, i % 2 ? 3600000 : -3600000); await online(p); await fill(p, 'impressions-code-input', code); await click(p, 'impressions-join-btn'); await until(async () => Object.keys((await state(p)).data?.players || {}).length === i + 1, 'Mixed added player'); p.uid = (await state(p)).uid; }
            await readyAndStart();
            for (let round = 1; round <= 3; round++) {
                const game = structuredClone(read().game); assert.equal(game.categoryId, ['color', 'quantity', 'pitch'][round - 1]); await memorizePitch(game); await advance(game.timeline.answerAt + 100);
                await Promise.all(pages.map(p => enter(p, game))); await Promise.all(pages.map(p => click(p, 'impressions-action'))); await until(() => Object.keys(read().game.submissions).length === 8, 'eight mixed arrays/scalars');
                await advance(game.timeline.deadline + 10); await until(() => read().game.settledRound === round, 'three-category settlement'); await agreed('three-category results');
                assert(read().game.lastResult.rows.every(row => row.scoreUnits === 100000 && row.damageUnits === 0));
                if (round < 3) { await advance(read().game.resultsUntil + 1); await until(() => read().game.round === round + 1, 'next category'); await agreed('next category schedule'); }
            }
            assert.equal(read().game.winners.length, 8); await screenshot(pages[2], 'pitch-mixed-eight-results');
            console.log('PASS: eight isolated audio-enabled clients cycle Color/Quantity/Pitch with category-specific canonical timing, concurrent submissions, unchanged damage and shared winners.');
            await click(a, 'impressions-action'); await click(a, 'impressions-return-btn'); await until(() => read().phase === 'lobby', 'eight Pitch replay');
            await fill(a, 'impressions-categories', 'pitch'); await until(() => read().options.categoryMode === 'pitch', 'Pitch only'); await fill(a, 'impressions-max-rounds', 1); await until(() => read().options.maxRounds === 1, 'one round cap'); await readyAndStart();
            let game = structuredClone(read().game); await memorizePitch(game); await advance(game.timeline.answerAt + 100); await Promise.all(pages.map(p => enter(p, game))); await Promise.all(pages.map(p => click(p, 'impressions-action')));
            await until(() => Object.keys(read().game.submissions).length === 8, 'eight Pitch arrays'); await advance(game.timeline.deadline + 10); await until(() => read().game.status === 'over', 'eight Pitch results'); await agreed('eight Pitch snapshots'); assert.equal(read().game.winners.length, 8);
            console.log('PASS: eight-player Pitch-only match, simultaneous versioned arrays, exactly-once HP and replay with renewed sound acknowledgement.');
            await click(a, 'impressions-action'); await click(a, 'impressions-return-btn'); await until(() => read().phase === 'lobby', 'host departure lobby');
            for (const p of pages.slice(3)) { await click(p, 'impressions-online-btn'); await click(p, 'impressions-leave-btn'); }
            const extra = pages.splice(3); for (const p of extra) await protocol.send('Target.disposeBrowserContext', { browserContextId: p.browserContextId });
            await until(() => read().seatOrder.length === 3, 'three remain'); await a.eval('__impressionsOnline.controller().configure({pitch:{generation:{toneCount:3}}})'); await until(() => read().options.pitch.generation.toneCount === 3, 'three tones frozen'); await readyAndStart(); game = structuredClone(read().game); await memorizePitch(game);
            await click(a, 'impressions-online-btn'); await click(a, 'impressions-leave-btn'); await until(() => read().hostUid === b.uid, 'Pitch host migration'); pages.shift();
            await advance(game.timeline.answerAt + 100); await Promise.all(pages.map(p => enter(p, game))); await Promise.all(pages.map(p => click(p, 'impressions-action'))); await until(() => Object.keys(read().game.submissions).length === 2, 'two remaining Pitch answers');
            await advance(game.timeline.deadline + 10); await until(() => read().game.status === 'over', 'post-host Pitch result'); await agreed('post-host Pitch snapshots'); assert.equal(read().game.winners.length, 2);
            for (const p of pages) { assert.deepEqual(await p.eval('window.__pageErrors'), []); assert.equal((await state(p)).view.audio.playing, false); }
            console.log('PASS: configurable three-tone/two-wheel Pitch round survives host departure with preserved question/schedule and cleanup.'); return;
        }
        if (args.includes('--mixed')) {
            const memorizedPositions = new Map();
            const displayedDots = (p, id = 'impressions-dot-preview') => p.eval(`Array.from(document.querySelectorAll(${JSON.stringify('#' + id + ' circle')})).map(e=>[e.getAttribute('cx'),e.getAttribute('cy'),e.getAttribute('r')])`);
            async function answer(p, game, value, native = true) {
                if (game.categoryId === 'color') return rgb(p, value, native);
                const keys = ['Home', ...Array(Math.floor(value / 25)).fill('PageUp'), ...Array(value % 25).fill('ArrowUp')];
                const selector = '#impressions-wheel-quantity .impressions-wheel';
                if (native) {
                    await p.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
                    for (const key of keys) { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key }); }
                } else await p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});for(const key of ${JSON.stringify(keys)})e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));})()`);
                assert.equal((await state(p)).view.draft, value);
                const actual = await displayedDots(p), generation = game.config.quantity.generation;
                const expected = Quantity.visibleDots(Quantity.createPool(game.question.seed, generation), value)
                    .map(point => [String(point.x * 400), String(point.y * 300), String(generation.dotRadius * 400)]);
                assert.deepEqual(actual, expected, 'Online rendering uses the same canonical pool as local/pure Quantity');
                if (value === game.question.target && memorizedPositions.has(game.questionId))
                    assert.deepEqual(actual, memorizedPositions.get(game.questionId), 'Exact online answers recreate memorization');
                assert.equal(await p.eval('document.getElementById("impressions-target-count").textContent'), '');
                assert.equal((await displayedDots(p, 'impressions-target-dots')).length, 0, 'No hidden target diagram during answering');
            }
            async function memorize(game) {
                await advance(game.timeline.memorizeAt + 1000); await agreed('mixed memorization');
                if (game.categoryId === 'quantity') {
                    const positions = await Promise.all(pages.map(p => displayedDots(p)));
                    positions.forEach(value => assert.deepEqual(value, positions[0])); assert.equal(positions[0].length, game.question.target);
                    memorizedPositions.set(game.questionId, positions[0]);
                    for (const p of pages) {
                        assert.equal(await p.eval('document.getElementById("impressions-target-count").textContent'), '');
                        assert(await p.eval('(()=>{const r=document.getElementById("impressions-dot-preview").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()'), 'The entire target board is visible');
                    }
                }
            }
            const a = await page('Host', 390, 844, 3600000), b = await page('Guest', 1200, 900, -3600000);
            await online(a); await fill(a, 'impressions-categories', 'mixed'); await fill(a, 'impressions-max-rounds', 4); await click(a, 'impressions-create-btn');
            await until(async () => !!(await state(a)).data?.code, 'mixed room created');
            let snapshot = await state(a); const code = snapshot.data.code; roomPath = 'rooms/memory_rooms/R-' + code; a.uid = snapshot.uid;
            await a.eval("__impressionsOnline.controller().configure({selectionVersion:1,categoryMode:'mixed'})"); await until(() => read().options.selectionVersion === 1, 'legacy two-category selection');
            await online(b); await fill(b, 'impressions-code-input', code); await click(b, 'impressions-join-btn');
            await until(async () => Object.keys((await state(b)).data?.players || {}).length === 2, 'mixed guest joined'); b.uid = (await state(b)).uid;
            await readyAndStart(); assert.equal(read().game.config.categoryMode, 'mixed');
            for (let round = 1; round <= 4; round++) {
                const game = structuredClone(read().game); assert.equal(game.categoryId, round % 2 ? 'color' : 'quantity');
                await memorize(game);
                if (round === 2) await b.eval('window.__cpuNetwork.setOnline(false)');
                await advance(game.timeline.answerAt + 100);
                if (round === 2) {
                    await b.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()');
                    await until(() => b.eval('__impressionsOnline.controller().canControl()'), 'Quantity memorization reconnect');
                    assert.equal((await state(b)).view.phase, 'answer'); assert.deepEqual((await state(b)).data.game.timeline, game.timeline);
                }
                await answer(a, game, game.question.target);
                if (round !== 4) {
                    await answer(b, game, round === 2 ? 0 : game.question.target);
                    if (round === 2) await b.eval('window.__cpuNetwork.rejectAck=true');
                    await Promise.all([click(a, 'impressions-action'), click(b, 'impressions-action')]);
                    await until(() => Object.keys(read().game.submissions).length === 2, 'mixed concurrent answers');
                    if (round === 2) {
                        await until(async () => (await state(b)).view.answer === 0 && (await state(b)).view.phase === 'waiting', 'scalar zero locked after lost acknowledgement');
                        const receipt = read().game.submissions[(await state(b)).id]; assert.equal(receipt.answer, 0);
                        assert.equal(await b.eval(`__impressionsOnline.controller().submit(0,${JSON.stringify({ matchId: game.matchId, round: game.round, questionId: game.questionId, categoryId: 'quantity' })},${JSON.stringify(receipt.nonce)})`), true);
                    }
                } else {
                    await click(a, 'impressions-action'); await advance(game.timeline.deadline - 500);
                    await b.send('Page.setWebLifecycleState', { state: 'frozen' });
                }
                await advance(game.timeline.deadline + 10, round === 4 ? [a] : pages);
                await until(() => read().game.settledRound === round, 'mixed atomic settlement');
                if (round === 4) {
                    await b.send('Page.setWebLifecycleState', { state: 'active' });
                    await b.eval(`window.__impressionsEpoch=${canonicalTime};__impressionsOnline.clock().refresh();__impressionsView.tick();__impressionsOnline.tick()`);
                }
                await agreed('mixed result snapshots');
                if (game.categoryId === 'quantity') {
                    const guestRow = read().game.lastResult.rows.find(row => row.id === (read().game.seatOrder.find(id => read().game.owners[id] === b.uid)));
                    assert.equal(guestRow.missing, round === 4);
                    assert.equal(guestRow.scoreUnits, round === 4 ? 0 : Math.round(Quantity.grade(game.question.target, 0).score * 1000));
                    assert.equal(await a.eval('document.getElementById("impressions-target-count").textContent'), String(game.question.target));
                }
                if (round < 4) { await advance(read().game.resultsUntil + 1); await until(() => read().game.round === round + 1, 'mixed next round'); await agreed('mixed next round snapshots'); }
            }
            assert.equal(read().game.status, 'over'); assert.deepEqual(read().game.winners, [(await state(a)).id]);
            for (const p of pages) assert.deepEqual(await p.eval('window.__pageErrors'), []);
            console.log('PASS: two isolated clients complete four alternating Color/Quantity rounds; concurrent scalar-zero/lost-ack answers, Quantity reconnect, hidden counts, late frozen-page zero and versioned grading.');
            await click(a, 'impressions-action'); await click(a, 'impressions-return-btn'); await until(() => read().phase === 'lobby', 'mixed replay lobby');
            await click(b, 'impressions-ready-btn'); await until(() => !!read().ready[b.uid], 'Ready before category change');
            await fill(a, 'impressions-categories', 'quantity'); await until(() => read().options.categoryMode === 'quantity' && !Object.keys(read().ready).length, 'category change resets Ready');
            await fill(a, 'impressions-categories', 'mixed'); await until(() => read().options.categoryMode === 'mixed', 'mixed mode restored');
            await fill(a, 'impressions-max-rounds', 2); await until(() => read().options.maxRounds === 2, 'eight-player mixed cap');
            for (let i = 2; i < 8; i++) {
                const p = await page('Player ' + (i + 1), i === 2 ? 320 : 900, i === 2 ? 568 : 900, i % 2 ? 3600000 : -3600000);
                await online(p); await fill(p, 'impressions-code-input', code); await click(p, 'impressions-join-btn');
                await until(async () => Object.keys((await state(p)).data?.players || {}).length === i + 1, 'additional mixed participant'); p.uid = (await state(p)).uid;
            }
            await readyAndStart();
            for (let round = 1; round <= 2; round++) {
                const game = structuredClone(read().game); await memorize(game); await advance(game.timeline.answerAt + 100);
                if (game.categoryId === 'quantity') await Promise.all(pages.map(p => answer(p, game, game.config.quantity.generation.poolSize, false)));
                await Promise.all(pages.map(p => answer(p, game, game.question.target, false)));
                await Promise.all(pages.map(p => click(p, 'impressions-action')));
                await until(() => Object.keys(read().game.submissions).length === 8, 'eight concurrent mixed answers');
                await advance(game.timeline.deadline + 10); await until(() => read().game.settledRound === round, 'eight mixed settlement'); await agreed('eight result agreement');
                assert(read().game.lastResult.rows.every(row => row.scoreUnits === 100000 && row.damageUnits === 0));
                if (game.categoryId === 'quantity') for (const p of pages) {
                    assert.deepEqual(await displayedDots(p, 'impressions-target-dots'), memorizedPositions.get(game.questionId));
                    assert.deepEqual(await displayedDots(p, 'impressions-answer-dots'), memorizedPositions.get(game.questionId));
                }
                if (round === 1) { await advance(read().game.resultsUntil + 1); await until(() => read().game.round === 2, 'eight Quantity round'); await agreed('eight Quantity schedule'); }
            }
            assert.equal(read().game.winners.length, 8); assert.equal(read().game.categoryId, 'quantity');
            for (const p of pages) assert.deepEqual(await p.eval('window.__pageErrors'), []);
            await pages[2].eval("ArcadeCommon.i18n.setLocale('zh')"); assert(await pages[2].eval('document.documentElement.scrollWidth<=innerWidth'));
            await screenshot(pages[2], 'mixed-eight-quantity-results');
            console.log('PASS: eight isolated contexts share the full ordered dot pool; exact answers/results recreate memorization, with eight simultaneous scalar receipts, exactly-once HP, shared winners and 320px results.');
            await click(a, 'impressions-action'); await click(a, 'impressions-return-btn'); await until(() => read().phase === 'lobby', 'Quantity-only replay');
            for (const p of pages.slice(3)) { await click(p, 'impressions-online-btn'); await click(p, 'impressions-leave-btn'); }
            const extra = pages.splice(3); for (const p of extra) await protocol.send('Target.disposeBrowserContext', { browserContextId: p.browserContextId });
            await until(() => read().seatOrder.length === 3, 'three Quantity players remain');
            await fill(a, 'impressions-categories', 'quantity'); await until(() => read().options.categoryMode === 'quantity', 'Quantity-only frozen mode');
            await readyAndStart(); let game = structuredClone(read().game); await memorize(game);
            await click(a, 'impressions-online-btn'); await click(a, 'impressions-leave-btn'); await until(() => read().hostUid === b.uid, 'Quantity host migration'); pages.shift();
            const c = pages[1]; await c.eval('window.__cpuNetwork.setOnline(false)'); await advance(game.timeline.answerAt + 100);
            await c.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()'); await until(() => c.eval('__impressionsOnline.controller().canControl()'), 'Quantity memo reconnect after host departure');
            assert.equal((await state(c)).view.phase, 'answer'); assert.equal(read().game.questionId, game.questionId);
            await answer(b, game, game.question.target); await answer(c, game, game.question.target);
            await Promise.all([click(b, 'impressions-action'), click(c, 'impressions-action')]); await until(() => Object.keys(read().game.submissions).length === 2, 'post-host scalar receipts');
            const receipt = structuredClone(read().game.submissions[(await state(c)).id]);
            await c.eval('window.__cpuNetwork.setOnline(false)'); await advance(game.timeline.answerAt + 4200);
            await c.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()'); await until(() => c.eval('__impressionsOnline.controller().canControl()'), 'Quantity answer reconnect');
            assert.deepEqual(read().game.submissions[(await state(c)).id], receipt);
            await advance(game.timeline.deadline + 10); await until(() => read().game.phase === 'results', 'Quantity host-loss settlement'); await agreed('Quantity host-loss results');
            const hp = structuredClone(read().game.hpUnits);
            await c.eval('window.__cpuNetwork.setOnline(false)'); await advance(read().game.resultsAt + 4000);
            await c.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()'); await until(() => c.eval('__impressionsOnline.controller().canControl()'), 'Quantity result reconnect');
            assert.deepEqual(read().game.hpUnits, hp);
            await advance(read().game.resultsUntil + 1); await until(() => read().game.round === 2, 'Quantity-only second round'); await agreed('Quantity-only second question'); game = read().game;
            await advance(game.timeline.answerAt + 100); await answer(b, game, game.question.target); await click(b, 'impressions-action');
            await advance(game.timeline.deadline - 500); await c.send('Page.setWebLifecycleState', { state: 'frozen' });
            await advance(game.timeline.deadline + 10, [b]); await until(() => read().game.status === 'over', 'Quantity background settlement');
            await c.send('Page.setWebLifecycleState', { state: 'active' }); await c.eval(`window.__impressionsEpoch=${canonicalTime};__impressionsOnline.clock().refresh();__impressionsView.tick();__impressionsOnline.tick()`);
            await agreed('Quantity resumed final results'); assert.deepEqual(read().game.winners, [(await state(b)).id]);
            for (const p of pages) assert.deepEqual(await p.eval('window.__pageErrors'), []);
            console.log('PASS: Quantity-only replay, host departure, reconnect in memorization/answer/results, preserved scalar receipts and safe background expiry.'); return;
        }
        const a = await page('Host', 390, 844, 3600000), b = await page('Guest', 1200, 900, -3600000);
        await online(a); await fill(a, 'impressions-max-rounds', 2); await click(a, 'impressions-create-btn');
        await until(async () => !!(await state(a)).data?.code, 'created room');
        let s = await state(a); const code = s.data.code; roomPath = 'rooms/memory_rooms/R-' + code; a.uid = s.uid;
        await online(b); await fill(b, 'impressions-code-input', code); await click(b, 'impressions-join-btn');
        await until(async () => Object.keys((await state(b)).data?.players || {}).length === 2, 'joined second context'); b.uid = (await state(b)).uid;
        assert.notEqual(a.uid, b.uid, 'Same account in isolated contexts still owns separate participants');
        assert.equal((await state(a)).now, canonicalTime); assert.equal((await state(b)).now, canonicalTime);
        await click(b, 'impressions-ready-btn'); await until(() => !!read().ready[b.uid], 'guest Ready');
        await a.eval('window.__cpuNetwork.snapshotDelay=250');
        await fill(a, 'impressions-max-rounds', 3); await until(() => read().options.maxRounds === 3 && !Object.keys(read().ready).length, 'configuration invalidates Ready');
        await fill(a, 'impressions-max-rounds', 2); await until(() => read().options.maxRounds === 2, 'round limit restored');
        await until(async () => (await state(a)).data.options.maxRounds === 2, 'accepted settings reach host snapshot');
        assert.equal(await a.eval('document.getElementById("impressions-lobby-error").textContent'), '');
        await a.eval('window.__cpuNetwork.snapshotDelay=15');
        await click(b, 'impressions-ready-btn'); await until(() => !!read().ready[b.uid], 'Ready before legacy lobby upgrade');
        const legacyLobby = structuredClone(read()), legacyRevision = legacyLobby.revision;
        legacyLobby.options.scoring = Color.scoringParameters({ version: 2 });
        backend.write(roomPath, codec.encodeRoomValue(legacyLobby));
        await until(() => read().options.scoring.version === 4 && read().revision > legacyRevision, 'legacy lobby upgraded to V4');
        assert.deepEqual(read().ready, {}); assert.deepEqual(read().options.scoring, Color.defaults.scoring);
        await readyAndStart(); let game = read().game;
        assert.equal(game.scoringVersion, 4, 'New multiplayer matches use the adopted V4 curve');
        assert.equal(game.protocolVersion,12); assert.equal(game.scoringVersion, Color.scoringVersion);
        assert.deepEqual(game.config.scoring, Color.defaults.scoring);
        await advance(game.timeline.memorizeAt + 1000);
        assert.equal((await state(a)).view.phase, 'memorize'); assert.equal((await state(b)).view.phase, 'memorize');
        assert.deepEqual((await state(a)).view.timeline, (await state(b)).view.timeline);
        await advance(game.timeline.answerAt + 10);
        await rgb(a, game.question.target); await rgb(b, [0, 0, 0]);
        await b.eval('window.__cpuNetwork.rejectAck=true');
        await Promise.all([click(a, 'impressions-action'), click(b, 'impressions-action')]);
        await until(() => Object.keys(read().game.submissions).length === 2, 'two concurrent accepted answers');
        await until(async () => (await Promise.all(pages.map(state))).every(s => s.view.phase === 'waiting' && s.view.answer), 'both answers locked');
        assert.equal(read().game.phase, 'active', 'Early submissions do not end the answer phase');
        for (const p of pages) {
            assert.equal(await p.eval('document.getElementById("impressions-target-hex").textContent'), '');
            assert.equal(await p.eval('document.getElementById("impressions-score").textContent'), '—');
        }
        const token = { matchId: game.matchId, round: game.round, questionId: game.questionId, categoryId: game.categoryId };
        const guestReceipt = read().game.submissions[(await state(b)).id];
        assert.equal(await b.eval(`__impressionsOnline.controller().submit(${JSON.stringify(guestReceipt.answer)},${JSON.stringify(token)},${JSON.stringify(guestReceipt.nonce)})`), true);
        assert.equal(await a.eval('__impressionsOnline.controller().settle()'), false);
        await advance(game.timeline.deadline + 10); await until(() => read().game.settledRound === 1, 'first settlement'); await agreed('round one results');
        assert.equal((await state(a)).view.result.score, 100);
        assert.equal((await state(b)).view.result.score, Color.grade(game.question.target, [0, 0, 0], game.config.scoring).score);
        const hp = structuredClone(read().game.hpUnits);
        assert.equal(await b.eval(`__impressionsOnline.controller().settle(${JSON.stringify(token)})`), false); assert.deepEqual(read().game.hpUnits, hp);
        await screenshot(a, 'two-player-results');
        await advance(read().game.resultsUntil + 1); await until(() => read().game.round === 2, 'second round'); await agreed('round two start');
        game = read().game; await advance(game.timeline.answerAt + 10); await rgb(a, game.question.target); await rgb(b, [0, 0, 0]);
        await advance(game.timeline.deadline - game.config.autoSubmitLeadMs);
        await until(() => Object.keys(read().game.submissions).length === 2, 'automatic submission buffer');
        await advance(game.timeline.deadline + 10); await until(() => read().game.status === 'over', 'two-round match completion'); await agreed('finished match agreement');
        assert.equal(read().game.round, 2); assert.deepEqual(read().game.winners, [(await state(a)).id]);
        assert.equal(read().game.endReason, 'round-cap');
        console.log('PASS: two isolated real clients complete a two-round match: skew correction, shared phases, native keyboard wheels, concurrent submissions, lost acknowledgement receipt, privacy, automatic submission and exact round-cap results.');

        await click(a, 'impressions-action'); await click(a, 'impressions-return-btn'); await until(() => read().phase === 'lobby', 'same-room rematch lobby');
        await fill(a, 'impressions-max-rounds', 1); await until(() => read().options.maxRounds === 1, 'one-round eight-player match');
        for (let i = 2; i < 8; i++) {
            const p = await page('Player ' + (i + 1), i === 2 ? 320 : 390, i === 2 ? 568 : 844, i * 5000);
            await online(p); await fill(p, 'impressions-code-input', code); await click(p, 'impressions-join-btn');
            await until(async () => !!(await state(p)).data?.participants, 'joined ' + p.name); p.uid = (await state(p)).uid;
            await until(() => p.eval('!document.getElementById("impressions-name").disabled'), 'join completed ' + p.name);
        }
        await until(() => read().seatOrder.length === 8, 'eight browser participants');
        await screenshot(a, 'eight-player-lobby'); await readyAndStart(); game = read().game;
        await advance(game.timeline.memorizeAt + 200);
        for (const p of pages) assert(await p.eval(`(()=>{const r=document.getElementById('impressions-preview').getBoundingClientRect();
            const h=document.querySelector('.impressions-phase-header').getBoundingClientRect();return r.top>=h.bottom&&r.bottom<=innerHeight;})()`),
        'The complete target is visible during shared memorization: ' + p.name);
        await advance(game.timeline.answerAt + 10);
        assert(await pages[2].eval(`(()=>{const b=document.getElementById('impressions-action').getBoundingClientRect();
            return b.top>=0&&b.bottom<=innerHeight;})()`), 'Submit stays visible at 320x568');
        await Promise.all(pages.map(p => rgb(p, game.question.target, false)));
        await Promise.all(pages.map(p => click(p, 'impressions-action')));
        await until(() => Object.keys(read().game.submissions).length === 8, 'eight concurrent real browser submissions');
        await advance(game.timeline.deadline + 10); await until(() => read().game.status === 'over', 'eight-player settlement'); await agreed('eight-player results');
        assert.equal(read().game.winners.length, 8); assert(read().game.lastResult.rows.every(row => row.top && row.damageUnits === 0));
        for (const p of pages) {
            assert.equal(await p.eval('document.documentElement.scrollWidth <= innerWidth'), true);
            assert.equal(await p.eval('document.querySelectorAll("#impressions-result-rows tr").length'), 8);
        }
        await pages[2].eval("ArcadeCommon.i18n.setLocale('zh')");
        assert.equal(await pages[2].eval('document.getElementById("impressions-lobby-close").textContent'), '關閉');
        assert(await pages[2].eval('document.documentElement.scrollWidth <= innerWidth'));
        await screenshot(pages[2], 'eight-player-small-results');
        await pages[2].eval("ArcadeCommon.i18n.setLocale('en')");
        console.log('PASS: eight isolated browser contexts submit concurrently through real HTTP CAS retries; all answers survive, tied leaders take no damage, all eight share the capped victory, and narrow results stay usable.');

        await click(a, 'impressions-action'); await click(a, 'impressions-return-btn'); await until(() => read().phase === 'lobby', 'third match lobby');
        const departing = pages.slice(3);
        for (const p of departing) { await click(p, 'impressions-online-btn'); await click(p, 'impressions-leave-btn'); }
        await until(() => read().seatOrder.length === 3, 'three controllers remain'); pages.splice(3);
        for (const p of departing) await protocol.send('Target.disposeBrowserContext', { browserContextId: p.browserContextId });
        await fill(a, 'impressions-max-rounds', 2); await until(() => read().options.maxRounds === 2, 'host migration match configured');
        await readyAndStart(); game = read().game;
        await advance(game.timeline.memorizeAt + 100);
        await click(a, 'impressions-online-btn'); await click(a, 'impressions-leave-btn'); await until(() => read().hostUid === b.uid, 'host migrated'); pages.shift();
        assert.equal(read().game.status, 'playing'); assert.equal(read().game.questionId, game.questionId);
        const c = pages[1];
        await c.eval('window.__cpuNetwork.setOnline(false)');
        await advance(game.timeline.answerAt + 100); await c.eval('window.__cpuNetwork.setOnline(true)'); await c.eval('__impressionsOnline.tick()');
        await until(() => c.eval('__impressionsOnline.controller().canControl()'), 'memorization reconnect');
        assert.equal((await state(c)).view.phase, 'answer'); assert.deepEqual((await state(c)).data.game.timeline, game.timeline);
        await rgb(b, game.question.target, false); await rgb(c, game.question.target, false);
        await Promise.all([click(b, 'impressions-action'), click(c, 'impressions-action')]); await until(() => Object.keys(read().game.submissions).length === 2, 'remaining owners submit');
        const receipt = structuredClone(read().game.submissions[(await state(c)).id]);
        // The fixture clock is frozen while polling. Cross the ordinary 3s
        // heartbeat interval instead of waiting in real time at the same stamp.
        await c.eval('window.__cpuNetwork.setOnline(false)'); await advance(game.timeline.answerAt + 4500); await c.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()');
        await until(() => c.eval('__impressionsOnline.controller().canControl()'), 'answer reconnect');
        assert.deepEqual(read().game.submissions[(await state(c)).id], receipt);
        await advance(game.timeline.deadline + 10); await until(() => read().game.phase === 'results', 'post-host-loss results'); await agreed('results after host loss');
        const reconnectHp = structuredClone(read().game.hpUnits);
        await c.eval('window.__cpuNetwork.setOnline(false)'); await advance(read().game.resultsAt + 3500); await c.eval('window.__cpuNetwork.setOnline(true);__impressionsOnline.tick()');
        await until(() => c.eval('__impressionsOnline.controller().canControl()'), 'results reconnect');
        assert.deepEqual(read().game.hpUnits, reconnectHp);
        await advance(read().game.resultsUntil + 1); await until(() => read().game.round === 2, 'resumed round two'); await agreed('resumed second round'); game = read().game;
        await advance(game.timeline.answerAt - 500); await c.send('Page.setWebLifecycleState', { state: 'frozen' });
        await advance(game.timeline.answerAt + 100, [b]); await c.send('Page.setWebLifecycleState', { state: 'active' });
        await c.eval(`window.__impressionsEpoch=${canonicalTime};__impressionsOnline.clock().refresh();__impressionsView.tick();__impressionsOnline.tick()`);
        assert.equal((await state(c)).view.phase, 'answer', 'Thawing never restarts memorization');
        await rgb(b, game.question.target, false); await click(b, 'impressions-action');
        await advance(game.timeline.deadline - 500); await c.send('Page.setWebLifecycleState', { state: 'frozen' });
        await advance(game.timeline.deadline + 10, [b]); await until(() => read().game.status === 'over', 'deadline settlement while peer frozen');
        await c.send('Page.setWebLifecycleState', { state: 'active' });
        await c.eval(`window.__impressionsEpoch=${canonicalTime};__impressionsOnline.clock().refresh();__impressionsView.tick();__impressionsOnline.tick()`);
        await agreed('thawed results');
        const missing = read().game.lastResult.rows.find(row => row.id === (read().game.seatOrder.find(id => read().game.owners[id] === c.uid)));
        assert(missing.missing && missing.scoreUnits === 0); assert.deepEqual(read().game.winners, [(await state(b)).id]);
        for (const p of pages) assert.deepEqual(await p.eval('window.__pageErrors'), []);
        assert.deepEqual(await a.eval('window.__pageErrors'), []);
        console.log('PASS: viable host departure, same-page reconnect in memorization/answer/results, immutable receipts, frozen-page resume without replay, late auto submission rejection, missing-answer zero and safe completion.');
    } catch (error) {
        if (diagnostics) console.error(diagnostics.slice(-1400)); throw error;
    } finally {
        clearTimeout(deadline); if (protocol) protocol.close();
        if (browser && browser.exitCode === null) { const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await Promise.race([stopped, pause(3000)]); }
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        const resolved = path.resolve(profile), expected = path.resolve(os.tmpdir()) + path.sep + 'gamebox-impressions-online-';
        if (resolved.startsWith(expected)) { try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (_) {} }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
