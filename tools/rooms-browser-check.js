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
let encode = value => value, decode = value => value;
addEventListener('message', event => { if (event.data && event.data.roomError) errors.push(event.data.roomError); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) { for (let i = 0; i < 2500; i++) { if (errors.length) throw new Error(errors.join('; ')); if (check()) return; await sleep(10); } throw new Error('Timed out: ' + label); }
function frame(game, uid) { const f = document.createElement('iframe'); f.src = '/games/' + game + '.html?testUser=' + uid; document.body.append(f); return f; }
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
    button(b, prefix + 'ReadyUp');
    await until(() => Object.values(read().ready).some(Boolean), 'guest ready');
    await until(() => !!b.contentDocument.querySelector('.lobby-waiting'), 'ready waiting display');
    layout(b);
    if (game === 'beam') { await until(() => enabled(a, 'beamStartMatch'), 'start button enabled'); button(a, 'beamStartMatch'); } else button(a, 'rdReadyUp');
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
    if (game === 'beam') { button(a, 'beamRematch'); await until(() => !read().game.status, 'reset'); await sleep(50); }
    button(b, prefix + 'ReadyUp'); await until(() => Object.values(read().ready).some(Boolean), 'rematch ready');
    if (game === 'beam') { await until(() => enabled(a, 'beamStartMatch'), 'rematch button enabled'); button(a, 'beamStartMatch'); } else button(a, 'rdReadyUp');
    await until(() => read().game.status === 'playing' && a.contentDocument.getElementById('lobby').hidden, 'rematch start');
    end(); await until(() => !b.contentDocument.getElementById('lobby').hidden, 'second results');
    button(b, prefix + 'LeaveRoom');
    await until(() => Object.keys(read().players).length === 1, 'leave');
    const join = b.contentDocument.querySelector('#lobby input'); join.value = code;
    button(b, prefix + 'JoinRoom');
    await until(() => Object.keys(read().players).length === 2, 'rejoin');
    if (read().code !== 'R-' + code) throw new Error('Stored room code changed');
    a.remove(); b.remove(); await sleep(50);
}
(async () => {
    if (mode === 'invalid') {
        for (const game of ['beam', 'rune-stones']) {
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
        await check('beam', 'beam_rooms', 'beam'); await check('rune-stones', 'duel_rooms', 'rd');
    }
    document.getElementById('result').textContent = 'PASS (' + mode + '): real browser room flows, backend selection and account isolation.';
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
            if (file.endsWith('.html')) {
                type = 'text/html';
                body = body.toString().replace('<head>', '<head><script>addEventListener("error",e=>parent.postMessage({roomError:e.message},location.origin));addEventListener("unhandledrejection",e=>parent.postMessage({roomError:String(e.reason)},location.origin));</script>');
            } else if (file.endsWith('.css')) type = 'text/css';
            else if (file.endsWith('.svg')) type = 'image/svg+xml';
        }
        response.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebox-rooms-browser-'));
    let browser;
    try {
        browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
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
