/** Optional real-DOM check: node tools/rooms-browser-check.js [Chrome executable]. Uses a local fake SDK, never Firebase. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const mode = args.includes('--invalid-rtdb') ? 'invalid' : 'rtdb';
const preview = args.includes('--darts-mobile') ? 'mobile' : args.includes('--darts-desktop') ? 'desktop' : '';
const dartsOnly = args.includes('--darts') || !!preview;
const chrome = args.find(arg => !arg.startsWith('--')) || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const database = require('./helpers/browser-rtdb.js');

// Mock only the remote Firebase SDK. net.js, the room modules and both game pages
// load normally. Browser storage events connect the real pages; Web Locks serialize transactions.
// Firestore remains for profiles/admin/feedback only. Reject room operations.
const firestore = `
const records = new Map();
function accountRef(ref) { if (ref.split('/')[0].endsWith('_rooms')) throw new Error('Unexpected Firestore room access'); return ref; }
export const getFirestore = () => ({}), doc = (_db, ...parts) => accountRef(parts.join('/'));
export const serverTimestamp = () => Date.now(), deleteField = () => null;
export const getDoc = async ref => ({ exists: () => records.has(accountRef(ref)), data: () => records.get(ref) });
export const setDoc = async (ref, data) => records.set(accountRef(ref), data);
export const updateDoc = async (ref, data) => records.set(accountRef(ref), { ...records.get(ref), ...data });
export const deleteDoc = async ref => records.delete(accountRef(ref));
export const collection = (_db, name) => accountRef(name), query = (...args) => args, orderBy = (...args) => args, limit = n => n;
export const getDocs = async () => ({ docs: [], size: 0 });
`;
const auth = `
export const getAuth = () => ({});
export function onAuthStateChanged(_auth, cb) { queueMicrotask(() => cb({ uid: new URLSearchParams(location.search).get('testUser') || 'same-account', displayName: 'Test player', photoURL: null, isAnonymous: true })); }
export class GoogleAuthProvider {}
export const signInAnonymously = async () => {}, signOut = async () => {}, signInWithPopup = async () => {};
`;
const runner = `<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre><script>
const errors = [];
const mode = '${mode}';
const dartsOnly = ${dartsOnly};
const preview = '${preview}';
let encode = value => value, decode = value => value;
addEventListener('message', event => { if (event.data && event.data.roomError) errors.push(event.data.roomError); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) { for (let i = 0; i < 2500; i++) { if (errors.length) throw new Error(errors.join('; ')); if (check()) return; await sleep(10); } throw new Error('Timed out: ' + label); }
function frame(game, uid) { const f = document.createElement('iframe'); f.src = '/games/' + game + '.html?testUser=' + uid; if(game==='darts')f.style.height='900px'; document.body.append(f); return f; }
function button(f, key) { const label = f.contentWindow.ArcadeCommon.i18n.t(key); const b = [...f.contentDocument.querySelectorAll('#lobby button')].find(b => b.textContent === label); if (!b || b.disabled) throw new Error('Missing/enabled button: ' + label); b.click(); }
function enabled(f, key) { const label = f.contentWindow.ArcadeCommon.i18n.t(key); return [...f.contentDocument.querySelectorAll('#lobby button')].some(b => b.textContent === label && !b.disabled); }
function layout(f, entry = false) {
    const root = f.contentDocument.querySelector('#lobby'), card = root.querySelector('.overlay-card');
    if (root.getAttribute('role') !== 'dialog') throw new Error('Missing lobby dialog role');
    const rows = [...root.querySelectorAll('.lobby-room > [data-lobby-row]')];
    const kinds = rows.map(row => row.dataset.lobbyRow).join(',');
    if (kinds !== (entry ? 'create,code,join' : 'main,leave')) throw new Error('Inconsistent lobby actions: ' + kinds);
    if (!entry && rows[0].firstElementChild.dataset.lobbyAction !== 'copy') throw new Error('Copy must precede the primary action');
    if (!entry && rows[1].firstElementChild.dataset.lobbyAction !== 'leave') throw new Error('Leave must have its own row');
    const bounds = card.getBoundingClientRect();
    const code = root.querySelector('.lobby-code');
    if (code) {
        const range = f.contentDocument.createRange(); range.selectNodeContents(code);
        if (range.getClientRects().length !== 1 || code.scrollWidth > code.clientWidth + 1) throw new Error('Room code wraps or overflows');
    }
    for (const row of rows) {
        if (row.scrollWidth > row.clientWidth + 1) throw new Error('Lobby row overflows on a narrow screen');
        for (const child of row.children) {
            const rect = child.getBoundingClientRect();
            if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) throw new Error('Action outside lobby card');
        }
    }
}
async function check(game, group, prefix) {
    const a = frame(game, 'same-account'), b = frame(game, 'same-account');
    for (const f of [a, b]) {
        await until(() => f.contentWindow.ArcadeNet && f.contentWindow.ArcadeNet.ok && f.contentDocument.getElementById('lobby'), game + ' boot');
        if (f.contentWindow.ArcadeNet.rooms.backend !== mode) throw new Error('Unexpected room backend');
        f.contentWindow.ArcadeCommon.i18n.setLocale('en');
        if (game === 'rune-stones') f.contentDocument.querySelector('[data-mode="duel"]').click();
        f.contentDocument.getElementById('online-btn').click();
        layout(f, true);
    }
    if (game === 'beam') {
        button(a, 'beamClose');
        a.contentDocument.getElementById('overlay-btn').click();
        await until(() => Number(a.contentDocument.getElementById('round').textContent) >= 2, 'solo round settlement');
        a.contentDocument.getElementById('restart-btn').click();
        a.contentDocument.getElementById('online-btn').click();
    }
    button(a, prefix + 'CreateRoom');
    await until(() => a.contentDocument.querySelector('.lobby-code'), 'create');
    const code = a.contentDocument.querySelector('.lobby-code').textContent;
    if (!/^[A-Z0-9]{4}$/.test(code)) throw new Error('Incorrect code format');
    const roomKey = 'rooms/' + group + '/R-' + code;
    const read = () => decode(JSON.parse(localStorage.getItem('__rooms-browser-db') || '{}')[roomKey]);
    const input = b.contentDocument.querySelector('#lobby input'); input.focus();
    const clipboard = new b.contentWindow.DataTransfer(); clipboard.setData('text/plain', ' r-' + code.toLowerCase() + ' ');
    input.dispatchEvent(new b.contentWindow.ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
    if (input.maxLength !== 4 || input.value !== code || input.selectionStart !== 4) throw new Error('Old copied code was truncated instead of normalized');
    input.value = code.toLowerCase(); input.setSelectionRange(1, 1);
    input.dispatchEvent(new b.contentWindow.Event('input', { bubbles: true }));
    if (input.value !== code || input.selectionStart !== 1) throw new Error('Typed code normalization moved the caret');
    input.setSelectionRange(1, 3);
    b.contentWindow.ArcadeCommon.i18n.setLocale('zh'); b.contentWindow.ArcadeCommon.i18n.setLocale('en');
    const restored = b.contentDocument.querySelector('#lobby input');
    if (restored.value !== code || b.contentDocument.activeElement !== restored || restored.selectionStart !== 1 || restored.selectionEnd !== 3) throw new Error('Input state lost on lobby redraw');
    button(b, prefix + 'JoinRoom');
    await until(() => read() && Object.keys(read().players).length === 2, 'join');
    await sleep(50);
    layout(a); layout(b);
    for (const f of [a, b]) {
        Object.defineProperty(f.contentWindow.navigator, 'clipboard', { configurable: true, value: {
            writeText: async text => { f.contentWindow.copiedCode = text; },
        } });
        button(f, prefix + 'CopyCode');
        if (f.contentWindow.copiedCode !== code) throw new Error('Copied code must omit storage prefix');
    }
    const wide = a.style.width;
    for (const width of [320, 768]) { a.style.width = width + 'px'; layout(a); }
    a.style.width = wide;
    if (game === 'rune-stones' && (!a.contentDocument.querySelector('.lobby-code') || a.contentDocument.querySelectorAll('.lobby-plist li').length !== 2)) throw new Error('Matched lobby must retain room code and player list');
    if (enabled(a, prefix + 'StartMatch')) throw new Error('Host start must wait for guest readiness');
    button(b, prefix + 'ReadyUp');
    await until(() => Object.values(read().ready).some(Boolean), 'guest ready');
    await until(() => !!b.contentDocument.querySelector('.lobby-waiting'), 'ready waiting display');
    layout(b);
    if (read().game.status === 'playing') throw new Error('Guest readiness must not automatically start the match');
    await until(() => enabled(a, prefix + 'StartMatch'), 'start button enabled'); button(a, prefix + 'StartMatch');
    await until(() => read().game.status === 'playing' && a.contentDocument.getElementById('lobby').hidden && b.contentDocument.getElementById('lobby').hidden, 'start');
    if (game === 'rune-stones') {
        const all = JSON.parse(localStorage.getItem('__rooms-browser-db')), room = decode(all[roomKey]), ids = Object.keys(room.players);
        room.game.atk = Object.fromEntries(ids.map(id => [id, { dmg: 100, heal: 0 }]));
        all[roomKey] = encode(room);
        localStorage.setItem('__rooms-browser-db', JSON.stringify(all));
        await until(() => read().game.round === 2, 'round settlement');
        if (!Object.values(read().game.hp).every(hp => hp === 2900) || read().game.settledRound !== 1) throw new Error('Incorrect round settlement');
    }
    const end = () => { const all = JSON.parse(localStorage.getItem('__rooms-browser-db')); const room = decode(all[roomKey]); room.game.status = 'over'; room.game.winner = room.hostUid; if (game === 'beam') room.status = 'lobby'; all[roomKey] = encode(room); localStorage.setItem('__rooms-browser-db', JSON.stringify(all)); };
    end();
    await until(() => !a.contentDocument.getElementById('lobby').hidden && !b.contentDocument.getElementById('lobby').hidden, 'results');
    layout(a); layout(b);
    await until(() => !!b.contentDocument.querySelector('.lobby-waiting'), 'guest waits for host rematch');
    button(a, prefix + 'Rematch'); await until(() => !read().game.status, 'reset');
    await until(() => enabled(b, prefix + 'ReadyUp'), 'guest can ready after reset');
    if (Object.keys(read().ready).length) throw new Error('Rematch must clear readiness');
    button(b, prefix + 'ReadyUp'); await until(() => Object.values(read().ready).some(Boolean), 'rematch ready');
    await until(() => enabled(a, prefix + 'StartMatch'), 'rematch button enabled'); button(a, prefix + 'StartMatch');
    await until(() => read().game.status === 'playing' && a.contentDocument.getElementById('lobby').hidden, 'rematch start');
    end(); await until(() => !b.contentDocument.getElementById('lobby').hidden, 'second results');
    button(b, prefix + 'LeaveRoom');
    await until(() => Object.keys(read().players).length === 1, 'leave');
    const join = b.contentDocument.querySelector('#lobby input'); join.value = code;
    button(b, prefix + 'JoinRoom');
    await until(() => Object.keys(read().players).length === 2, 'rejoin');
    if (read().code !== 'R-' + code) throw new Error('Stored room code changed');
    if (read().game.status === 'over') {
        button(a, prefix + 'Rematch'); await until(() => !read().game.status, 'reset after rejoin');
    }
    await until(() => enabled(b, prefix + 'ReadyUp'), 'ready after rejoin');
    button(b, prefix + 'ReadyUp'); await until(() => enabled(a, prefix + 'StartMatch'), 'start after rejoin');
    button(a, prefix + 'StartMatch'); await until(() => read().game.status === 'playing', 'third match');
    end(); await until(() => !b.contentDocument.getElementById('lobby').hidden, 'third results');
    button(b, prefix + 'Close');
    await until(() => Object.keys(read().players).length === 1, 'closing results leaves room');
    if (!b.contentDocument.getElementById('lobby').hidden || b.contentDocument.getElementById('overlay').hidden) throw new Error('Closing results must restore the solo ready screen');
    a.remove(); b.remove(); await sleep(50);
}
async function checkDarts() {
    const a = frame('darts', 'same-account'), b = frame('darts', 'same-account');
    const api = f => f.contentWindow.__dartsTest;
    for (const f of [a,b]) {
        await until(() => api(f) && f.contentWindow.ArcadeNet && f.contentDocument.getElementById('lobby'), 'darts boot');
        f.contentWindow.ArcadeCommon.i18n.setLocale('en');
    }
    const setMode = (f, mode) => { const s=f.contentDocument.getElementById('mode-select'); s.value=mode; s.dispatchEvent(new f.contentWindow.Event('change')); };
    // Actual gesture -> physics -> rendering -> local rules. No mocked game handlers.
    a.contentDocument.getElementById('overlay-btn').click();
    const canvas=a.contentDocument.getElementById('stage');
    canvas.dispatchEvent(new a.contentWindow.PointerEvent('pointerdown',{bubbles:true,clientX:200,clientY:400,pointerId:1,isPrimary:true}));
    await sleep(60);a.contentWindow.dispatchEvent(new a.contentWindow.PointerEvent('pointermove',{clientX:200,clientY:330,pointerId:1,isPrimary:true}));
    await sleep(60);a.contentWindow.dispatchEvent(new a.contentWindow.PointerEvent('pointermove',{clientX:200,clientY:230,pointerId:1,isPrimary:true}));
    a.contentWindow.dispatchEvent(new a.contentWindow.PointerEvent('pointerup',{clientX:200,clientY:230,pointerId:1,isPrimary:true}));
    api(a).land();
    if (api(a).snapshot().darts !== 1 || api(a).snapshot().match) throw new Error('Practice gesture failed');
    a.contentDocument.getElementById('restart-btn').click();
    setMode(a, 'countup'); a.contentDocument.getElementById('overlay-btn').click();
    for (let i=0;i<24;i++) { api(a).gesture(); api(a).land(); }
    if (api(a).snapshot().match.status !== 'over' || api(a).snapshot().match.stats['local-a'].darts !== 24) throw new Error('Solo Count-Up did not finish');
    if (a.contentDocument.getElementById('leg-result').hidden || !a.contentDocument.getElementById('turn-status').textContent.includes('MATCH WON')) throw new Error('Missing solo results');
    a.contentDocument.getElementById('play-again-btn').click(); setMode(a, '501');
    a.contentDocument.getElementById('match-select').value='3'; a.contentDocument.getElementById('match-select').dispatchEvent(new a.contentWindow.Event('change'));
    for (const f of [a,b]) { f.contentDocument.getElementById('online-btn').click(); layout(f,true); }
    button(a,'dartsCreate'); await until(()=>a.contentDocument.querySelector('.lobby-code'),'darts create');
    const code=a.contentDocument.querySelector('.lobby-code').textContent;
    b.contentDocument.querySelector('#lobby input').value=code; button(b,'dartsJoin');
    const roomKey='rooms/darts_rooms/R-'+code;
    const read=()=>decode(JSON.parse(localStorage.getItem('__rooms-browser-db')||'{}')[roomKey]);
    const mutate=fn=>{ const tree=JSON.parse(localStorage.getItem('__rooms-browser-db')||'{}');const data=decode(tree[roomKey]);fn(data);tree[roomKey]=encode(data);localStorage.setItem('__rooms-browser-db',JSON.stringify(tree)); };
    await until(()=>enabled(b,'dartsReadyUp'),'darts ready'); button(b,'dartsReadyUp');
    await until(()=>enabled(a,'dartsStartMatch'),'darts start');button(a,'dartsStartMatch');
    await until(()=>api(a).snapshot().match && api(b).snapshot().match,'darts match');
    const owner=read().game.active, active=()=>read().game.active===api(a).snapshot().uid?a:b;
    const flight=(x,y)=>{ const t=2370/12600;return {pos:{x:0,y:-292,z:0},vel:{x:x/t,y:(y+292+2450*t*t)/t,z:12600},tempo:1}; };
    const syncClock=()=>{const stamp=Math.max(a.contentWindow.__dartsNow,b.contentWindow.__dartsNow,read().game.readyAt)+1;for(const f of [a,b])f.contentWindow.__dartsNow=stamp;};
    async function throwAt(x,y) {
        syncClock(); const old=read().game.seq;
        if (!await api(active()).controller().submit(flight(x,y))) throw new Error('Darts throw rejected');
        await until(()=>api(a).snapshot().match.seq>old&&api(b).snapshot().match.seq>old,'darts throw sync');
        for(const f of [a,b])api(f).land();
    }
    const other=active()===a?b:a;
    if(await api(other).controller().submit(flight(0,103)))throw new Error('Opponent scored out of turn');
    await throwAt(0,103);
    if(read().game.scores[owner]!==441)throw new Error('Online T20 score mismatch');
    for(const f of [a,b])if(!f.contentDocument.getElementById('turn-darts').textContent.includes('T20'))throw new Error('Opponent impact was not shown');
    for(const f of [a,b])if(api(f).snapshot().dartState!=='landed')throw new Error('Opponent flight did not land');
    await api(a).controller().tick();await sleep(10);
    if(api(a).snapshot().dartState==='flying')throw new Error('Presence snapshot replayed a flight');
    await throwAt(0,80);await throwAt(0,80);
    if(read().game.active===owner)throw new Error('Third dart did not pass turn');
    // Both clients observe checkout, next-leg reset and a match victory.
    mutate(data=>{data.game.scores[data.game.active]=40;data.game.turnStartScore=40;});
    await until(()=>api(active()).snapshot().match.scores[read().game.active]===40,'checkout fixture');
    const winner=read().game.active;await throwAt(0,165);
    if(read().game.status!=='between')throw new Error('Missing leg result');
    for(const f of [a,b])if(f.contentDocument.getElementById('leg-result').hidden)throw new Error('Leg result hidden');
    syncClock();if(!await api(a).controller().nextLeg())throw new Error('Next leg failed');
    await until(()=>api(a).snapshot().match.leg===2&&api(b).snapshot().match.leg===2,'next leg');
    if(read().game.active===owner||read().game.scores[winner]!==501)throw new Error('Starter/reset failed');
    mutate(data=>{data.game.active=winner;data.game.scores[winner]=50;data.game.turnStartScore=50;});
    await until(()=>api(active()).snapshot().match.scores[winner]===50,'bull fixture');await throwAt(0,0);
    if(read().game.status!=='over'||read().game.winner!==winner)throw new Error('BO3 did not finish');
    for(const f of [a,b]){
        if(!f.contentDocument.getElementById('turn-status').textContent.includes('MATCH WON'))throw new Error('Missing match result');
        f.contentDocument.getElementById('online-btn').click();
    }
    const matchId=read().game.matchId;button(a,'dartsRematch');
    await until(()=>enabled(b,'dartsReadyUp'),'rematch ready');button(b,'dartsReadyUp');
    await until(()=>enabled(a,'dartsStartMatch'),'rematch start');button(a,'dartsStartMatch');
    await until(()=>read().game.matchId!==matchId&&read().game.status==='playing','new match');
    for(const width of [320,768]){
        a.style.width=width+'px';a.contentDocument.getElementById('online-btn').click();await sleep(30);layout(a);
        const doc=a.contentDocument;if(doc.documentElement.scrollWidth>doc.documentElement.clientWidth+1)throw new Error('Darts page overflows '+width+': '+[...doc.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>doc.documentElement.clientWidth+1).map(el=>el.tagName+'.'+el.className).slice(0,12).join(', '));
    }
    // Verify translated Cricket marks and result-close/leave lifecycle.
    button(a,'dartsLeave');await until(()=>Object.keys(read().players).length===1,'darts forfeit');
    await until(()=>api(b).snapshot().match.status==='over','survivor result');
    b.contentDocument.getElementById('online-btn').click();button(b,'dartsClose');
    await until(()=>!localStorage.getItem('__rooms-browser-db')||!JSON.parse(localStorage.getItem('__rooms-browser-db'))[roomKey],'last player leave');
    await until(()=>!api(b).snapshot().room,'solo restored');
    setMode(b,'cricket');b.contentWindow.ArcadeCommon.i18n.setLocale('zh');b.contentDocument.getElementById('overlay-btn').click();
    if(b.contentDocument.querySelectorAll('.cricket-table tbody tr').length!==7)throw new Error('Cricket targets missing');
    if(!b.contentDocument.querySelector('.cricket-table td').getAttribute('aria-label').includes('記號'))throw new Error('Cricket localization missing');
    a.remove();b.remove();
}
async function checkDartsLayouts() {
    const f=frame('darts','layout-player');
    await until(()=>f.contentWindow.__dartsTest&&f.contentWindow.ArcadeNet,'layout boot');
    const doc=f.contentDocument,w=f.contentWindow,api=w.__dartsTest;
    w.ArcadeCommon.i18n.setLocale('en');
    Object.assign(w.ArcadeCommon.i18n.STRINGS.en,{dartsPlayerA:'Alexandria North',dartsPlayerB:'Benedict Longname',dartsPlayerC:'Charlotte East',dartsPlayerD:'Dominique West'});
    function change(id,value){doc.getElementById(id).value=value;doc.getElementById(id).dispatchEvent(new w.Event('change'));}
    function box(selector){const b=doc.querySelector(selector).getBoundingClientRect();return [b.x,b.y,b.width,b.height];}
    function within(inner,outer,label){if(inner[0]<outer[0]-.6||inner[1]<outer[1]-.6||inner[0]+inner[2]>outer[0]+outer[2]+.6||inner[1]+inner[3]>outer[1]+outer[3]+.6)throw new Error(label+' outside viewport: '+JSON.stringify([inner,outer]));}
    const cases=[['cricket','4'],['501','2'],['501','4'],['countup','4'],['practice','1']];
    for(const [width,height] of [[320,568],[390,844],[768,1024],[1200,800]]){
        f.style.width=width+'px';f.style.height=height+'px';await sleep(30);
        let baseline;
        for(const [mode,players] of cases){
            doc.getElementById('restart-btn').click();change('mode-select',mode);change('players-select',players);
            await sleep(20);const ready=box('#match-panel'),readyBoard=box('#throw-surface'),readyHeader=box('.game-topbar');
            doc.getElementById('overlay-btn').click();await sleep(30);
            if(mode==='cricket')api.previewCricket();
            const viewport=box('#match-panel'),board=box('#throw-surface'),panel=box('#mode-panel'),summary=box('.darts-players');
            if([...viewport,...board,...box('.game-topbar')].some((value,i)=>Math.abs(value-[...ready,...readyBoard,...readyHeader][i])>.6))throw new Error('Start changed page geometry at '+width+' '+mode);
            within(viewport,[0,0,w.innerWidth,w.innerHeight],width+' '+mode);
            within(board,viewport,'board');within(panel,viewport,'mode panel');within(summary,viewport,'player summary');
            const dimensions=[...board,...panel,...summary];
            if(!baseline)baseline=dimensions;else if(dimensions.some((value,i)=>Math.abs(value-baseline[i])>.6))throw new Error('Mode switch moved the board/panels at '+width+' '+mode);
            if(doc.documentElement.scrollWidth>w.innerWidth+1||doc.documentElement.scrollHeight>w.innerHeight+1)throw new Error('Live game needs scrolling at '+width+' '+mode);
            const cards=[...doc.querySelectorAll('.darts-player')];
            if(cards.length!==Number(players))throw new Error('Player count in HUD');
            for(const card of cards){const r=card.getBoundingClientRect();within([r.x,r.y,r.width,r.height],summary,'player card');}
            if(mode==='cricket'){
                if(doc.querySelectorAll('.cricket-table tbody tr').length!==7||doc.querySelectorAll('.cricket-table thead th').length!==5)throw new Error('Four-player Cricket matrix');
                within(box('.cricket-table'),panel,'Cricket table');
                if(doc.getElementById('mode-panel').scrollHeight>doc.getElementById('mode-panel').clientHeight+1)throw new Error('Cricket panel overflows');
            }
            if(mode!=='practice'&&!doc.querySelector('.status-dart').textContent.includes('1/3'))throw new Error('Dart count is not visible');
            // The player/header HUD stays outside the expanded throw surface.
            doc.querySelector('.darts-players').dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true,clientX:40,clientY:400,pointerId:1,isPrimary:true}));
            w.dispatchEvent(new w.PointerEvent('pointermove',{clientX:40,clientY:100,pointerId:1,isPrimary:true}));
            w.dispatchEvent(new w.PointerEvent('pointerup',{clientX:40,clientY:100,pointerId:1,isPrimary:true}));
            if(api.snapshot().darts!==0||api.snapshot().dartState==='flying')throw new Error('HUD interaction threw a dart');
        }
    }
    if(preview){
        f.style.cssText='position:fixed;inset:0;width:'+(preview==='mobile'?'390px':'1200px')+';height:'+(preview==='mobile'?'844px':'800px')+';border:0;z-index:10';
        doc.getElementById('restart-btn').click();change('mode-select','cricket');change('players-select','4');
        doc.getElementById('overlay-btn').click();await sleep(100);
        api.previewCricket();await sleep(30);
    }else f.remove();
}
async function checkDartsInteractions() {
    const f=frame('darts','history-player');f.style.width='390px';f.style.height='844px';
    await until(()=>f.contentWindow.__dartsTest&&f.contentDocument.getElementById('lobby'),'interaction boot');
    const w=f.contentWindow,doc=f.contentDocument,api=w.__dartsTest;
    w.focus();
    w.ArcadeCommon.i18n.setLocale('en');
    async function flick(target){
        const r=target.getBoundingClientRect(),x=r.left+r.width/2,y=r.bottom-8;
        target.dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true,clientX:x,clientY:y,pointerId:1,isPrimary:true}));
        await sleep(60);w.dispatchEvent(new w.PointerEvent('pointermove',{clientX:x,clientY:y-60,pointerId:1,isPrimary:true}));
        await sleep(60);w.dispatchEvent(new w.PointerEvent('pointermove',{clientX:x,clientY:y-140,pointerId:1,isPrimary:true}));
        w.dispatchEvent(new w.PointerEvent('pointerup',{clientX:x,clientY:y-140,pointerId:1,isPrimary:true}));api.land();
    }
    doc.getElementById('overlay-btn').click();
    await flick(doc.getElementById('mode-panel'));if(api.snapshot().darts!==1)throw new Error('Bottom mode panel cannot start a throw');
    await flick(doc.getElementById('throw-surface'));if(api.snapshot().darts!==2)throw new Error('Board input regression');
    doc.querySelector('.darts-player').click();
    if(!doc.getElementById('history-dialog').open||doc.getElementById('history-player').value!=='practice'||doc.querySelectorAll('.history-turn').length!==2)throw new Error('Practice/player history');
    if(w.getComputedStyle(doc.getElementById('history-list')).touchAction!=='pan-y')throw new Error('History list must scroll');
    await flick(doc.getElementById('mode-panel'));if(api.snapshot().darts!==2)throw new Error('History modal allowed a background throw');
    doc.getElementById('history-dialog').dispatchEvent(new w.KeyboardEvent('keydown',{key:'r',bubbles:true}));
    if(api.snapshot().darts!==2)throw new Error('History shortcut restarted game');
    doc.getElementById('history-close-btn').click();
    await until(()=>doc.activeElement.classList.contains('darts-player'),'history player focus restored');
    doc.getElementById('restart-btn').click();doc.getElementById('settings-btn').click();
    if(!doc.getElementById('settings-dialog').open)throw new Error('Settings are inaccessible');
    for(const [id,value] of [['mode-select','countup'],['players-select','4']]){doc.getElementById(id).value=value;doc.getElementById(id).dispatchEvent(new w.Event('change'));}
    doc.getElementById('settings-close-btn').click();doc.getElementById('overlay-btn').click();
    for(let i=0;i<72;i++){api.gesture();api.land();}
    if(api.snapshot().match.history.length!==24)throw new Error('History duplicated per-dart records instead of updating turn');
    doc.querySelector('.darts-player').click();
    if(doc.querySelectorAll('.history-turn').length!==6)throw new Error('Player history filter');
    const filter=doc.getElementById('history-player');filter.value='all';filter.dispatchEvent(new w.Event('change'));
    if(doc.querySelectorAll('.history-turn').length!==24)throw new Error('All-player history');
    const list=doc.getElementById('history-list');
    if(list.scrollHeight<=list.clientHeight)throw new Error('History does not have a scrollable body');
    list.scrollTop=200;const anchor=[...list.children].find(el=>el.getBoundingClientRect().bottom>list.getBoundingClientRect().top);
    const key=anchor.dataset.historyKey,offset=anchor.getBoundingClientRect().top;
    // Feed an accepted update while the reader is inspecting an older row.
    api.gesture();api.land();
    const kept=[...list.children].find(el=>el.dataset.historyKey===key);
    if(Math.abs(kept.getBoundingClientRect().top-offset)>1)throw new Error('Live history update jumped the scroll position');
    const before=api.snapshot().darts;await flick(list);if(api.snapshot().darts!==before)throw new Error('History scrolling threw a dart');
    doc.getElementById('history-close-btn').click();doc.getElementById('history-btn').click();
    if(filter.value!=='all')throw new Error('Global History button must show all players');
    doc.getElementById('history-dialog').dispatchEvent(new w.Event('cancel',{cancelable:true}));
    if(doc.getElementById('history-dialog').open||doc.activeElement.id!=='history-btn')throw new Error('Escape/cancel did not close history and restore toolbar focus');
    doc.getElementById('settings-btn').click();if(!doc.getElementById('mode-select').disabled)throw new Error('Active settings changed rules');
    await flick(doc.getElementById('mode-panel'));if(api.snapshot().darts!==before)throw new Error('Settings modal allowed a throw');
    doc.getElementById('settings-close-btn').click();
    doc.getElementById('restart-btn').click();doc.getElementById('history-btn').click();
    if(doc.querySelectorAll('.history-turn').length)throw new Error('Reset retained old history');
    doc.getElementById('history-close-btn').click();f.remove();
}
async function checkDartsFour() {
    const frames=[0,1,2,3].map(i=>frame('darts','four-'+i));
    for(const f of frames){
        await until(()=>f.contentWindow.__dartsTest&&f.contentDocument.getElementById('lobby'),'four-player boot');
        f.contentWindow.ArcadeCommon.i18n.setLocale('en');
        f.contentDocument.getElementById('online-btn').click();
    }
    const api=f=>f.contentWindow.__dartsTest;
    const select=frames[0].contentDocument.getElementById('mode-select');select.value='cricket';select.dispatchEvent(new frames[0].contentWindow.Event('change'));
    button(frames[0],'dartsCreate');await until(()=>frames[0].contentDocument.querySelector('.lobby-code'),'four-player create');
    const code=frames[0].contentDocument.querySelector('.lobby-code').textContent,key='rooms/darts_rooms/R-'+code;
    const read=()=>decode(JSON.parse(localStorage.getItem('__rooms-browser-db')||'{}')[key]);
    for(let i=1;i<4;i++){
        frames[i].contentDocument.querySelector('#lobby input').value=code;button(frames[i],'dartsJoin');
        await until(()=>read()&&Object.keys(read().players).length===i+1,'join player '+i);
    }
    button(frames[1],'dartsReadyUp');button(frames[2],'dartsReadyUp');await sleep(20);
    if(enabled(frames[0],'dartsStartMatch'))throw new Error('Started without fourth player readiness');
    button(frames[3],'dartsReadyUp');await until(()=>enabled(frames[0],'dartsStartMatch'),'four-player start ready');button(frames[0],'dartsStartMatch');
    await until(()=>frames.every(f=>api(f).snapshot().match&&api(f).snapshot().match.players.length===4),'four-player started');
    for(const f of frames)if(f.contentDocument.querySelectorAll('.cricket-table thead th').length!==5||f.contentDocument.querySelectorAll('.darts-player').length!==4)throw new Error('Online four-player HUD missing');
    const seen=[];
    for(let turn=0;turn<4;turn++){
        seen.push(read().game.active);
        for(let dart=0;dart<3;dart++){
            const stamp=read().game.readyAt+1;frames.forEach(f=>f.contentWindow.__dartsNow=stamp);
            const player=frames.find(f=>api(f).snapshot().uid===read().game.active),old=read().game.seq,t=2370/12600;
            await api(player).controller().submit({pos:{x:0,y:-292,z:0},vel:{x:0,y:(80+292+2450*t*t)/t,z:12600},tempo:1});
            await until(()=>frames.every(f=>api(f).snapshot().match.seq>old),'four-player dart');frames.forEach(f=>api(f).land());
        }
    }
    if(new Set(seen).size!==4)throw new Error('Turns did not rotate through four players');
    for(const f of frames){
        f.contentDocument.getElementById('history-btn').click();
        if(f.contentDocument.querySelectorAll('.history-turn').length!==4||f.contentDocument.getElementById('history-clock-note').hidden)throw new Error('Four-player synchronized history');
        f.contentDocument.getElementById('history-close-btn').click();
    }
    const hostId=api(frames[0]).snapshot().uid;
    await api(frames[0]).controller().leave();
    await until(()=>read().hostUid!==hostId&&read().game.withdrawn.includes(hostId),'multi-player host departure');
    for(const f of frames.slice(1))await until(()=>f.contentDocument.querySelectorAll('.darts-player.withdrawn').length===1,'withdrawn HUD');
    if(read().game.status!=='playing')throw new Error('Four-player match ended on first departure');
    await api(frames[1]).controller().leave();await until(()=>Object.keys(read().players).length===2,'two remain');
    if(read().game.status!=='playing')throw new Error('Three-player match ended on second departure');
    await api(frames[2]).controller().leave();await until(()=>api(frames[3]).snapshot().match.status==='over','last player wins');
    if(read().game.winner!==api(frames[3]).snapshot().uid)throw new Error('Wrong forfeit winner');
    await api(frames[3]).controller().leave();frames.forEach(f=>f.remove());
}
(async () => {
    if (mode === 'invalid') {
        for (const game of (dartsOnly ? ['darts'] : ['beam', 'rune-stones'])) {
            const f = frame(game, 'same-account');
            await until(() => f.contentWindow.ArcadeNet && f.contentWindow.ArcadeNet.ok, 'auth boot');
            const net = f.contentWindow.ArcadeNet;
            if (net.rooms.ok !== false || !f.contentDocument.getElementById('online-btn').hidden) throw new Error('Invalid RTDB settings must disable rooms');
            await net.profile.save('same-account', { games: { beam: { bests: { test: 7 } } } });
            if ((await net.profile.get('same-account')).games.beam.bests.test !== 7) throw new Error('Account records unavailable');
            f.remove();
        }
    } else {
        const codec = await import('/js/net/rtdb-values.mjs'); encode = codec.encodeRoomValue; decode = codec.decodeRoomValue;
        if(dartsOnly) { await checkDarts(); await checkDartsFour(); await checkDartsInteractions(); await checkDartsLayouts(); }
        else { await check('beam', 'beam_rooms', 'beam'); await check('rune-stones', 'duel_rooms', 'rd'); }
    }
    document.getElementById('result').textContent = 'PASS (' + mode + '): ' + (mode === 'invalid' ? 'disabled online rooms and working account profiles.' : dartsOnly ? 'Darts board/bottom-panel flicks, stable ready/playing layouts, settings, player/all-player history, live scrolling/focus safety, and 2/4-player room flows.' : 'real browser room flows, backend selection and account isolation.');
})().catch(error => { document.getElementById('result').textContent = 'FAIL: ' + error.stack; });
</script>`;

async function main() {
    if (!fs.existsSync(chrome)) throw new Error('Chrome not found; pass its executable as the first argument');
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        let body, type = 'text/javascript';
        if (url.pathname === '/__check') { body = runner; type = 'text/html'; }
        else if (url.pathname === '/__sdk/firebase-app.js') body = 'export const initializeApp = () => ({});';
        else if (url.pathname === '/__sdk/firebase-auth.js') body = auth;
        else if (url.pathname === '/__sdk/firebase-firestore.js') body = firestore;
        else if (url.pathname === '/__sdk/firebase-database.js') body = database;
        else {
            const file = path.resolve(root, '.' + url.pathname);
            if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
            body = fs.readFileSync(file);
            if (file.endsWith('firebase-config.js')) body = body.toString()
                + '\nwindow.FIREBASE_ROOMS = ' + JSON.stringify({ databaseURL: mode === 'invalid' ? '' : 'https://demo-local-test.firebaseio.com' }) + ';';
            if (file.endsWith('net.js')) body = body.toString().replace('const BASE = `https://www.gstatic.com/firebasejs/${SDK}`;', "const BASE = location.origin + '/__sdk';");
            if (file.endsWith('darts.js') && dartsOnly) body = body.toString().replace(/\}\)\(\);\s*$/, `
                window.__dartsTest = {
                    gesture: function () { if (G.dartState === 'landed') freshDart(); launchThrow(analyseGesture([{t:0,x:0,y:0},{t:.05,x:0,y:50},{t:.1,x:0,y:140},{t:.15,x:0,y:230}])); },
                    land: function () { update(1); }, controller: function () { return online; },
                    previewCricket: function () { match.players.forEach(function (id, i) { match.scores[id]=[120,80,40,95][i]; Rules.TARGETS.forEach(function(n,r){match.marks[id][n]=(r+i)%4;}); }); viewMatch=match; syncGameUi(); },
                    snapshot: function () { return {match:match,room:room,uid:netUser&&netUser.uid,darts:G.darts,dartState:G.dartState}; }
                }; })();`);
            if (file.endsWith('.html')) {
                type = 'text/html';
                body = body.toString().replace('<head>', '<head><script>addEventListener("error",e=>parent.postMessage({roomError:e.message},location.origin));addEventListener("unhandledrejection",e=>parent.postMessage({roomError:String(e.reason)},location.origin));</script>');
                if (file.endsWith('darts.html') && dartsOnly) body = body.toString().replace('<head>', '<head><script>window.__dartsNow=Date.now();Date.now=function(){return window.__dartsNow;};</script>');
            } else if (file.endsWith('.css')) type = 'text/css';
            else if (file.endsWith('.svg')) type = 'image/svg+xml';
        }
        response.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebox-rooms-browser-'));
    let browser;
    try {
        const extra = [];
        if (preview) {
            const target = path.join(root, '.cache'); fs.mkdirSync(target, { recursive: true });
            extra.push('--screenshot=' + path.join(target, 'darts-' + preview + '.png'), '--window-size=' + (preview === 'mobile' ? '390,844' : '1200,800'), '--hide-scrollbars');
        }
        browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', ...extra,
            '--disable-background-networking', '--user-data-dir=' + profile, '--dump-dom', '--virtual-time-budget=45000',
            'http://127.0.0.1:' + server.address().port + '/__check'], { windowsHide: true });
        let output = '', diagnostics = '';
        browser.stdout.on('data', chunk => { output += chunk; }); browser.stderr.on('data', chunk => { diagnostics += chunk; });
        const timeout = setTimeout(() => browser.kill(), 45000);
        try { await new Promise((resolve, reject) => { browser.on('error', reject); browser.on('exit', resolve); }); }
        finally { clearTimeout(timeout); }
        const match = output.match(/<pre id="result">([\s\S]*?)<\/pre>/);
        assert(match && match[1].startsWith('PASS ('), (match && match[1]) || diagnostics.slice(-2000) || 'No browser result');
        console.log(match[1]);
    } finally {
        if (browser && browser.exitCode === null) browser.kill();
        await new Promise(resolve => server.close(resolve));
        // This is the exact temporary profile we created; never remove a user profile.
        if (path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep + 'gamebox-rooms-browser-')) {
            try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* Chrome may still hold a temporary file */ }
        }
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
