/** Real launcher/browser checks with a local account stub. Never loads Firebase. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const chrome = args.find(arg => !arg.startsWith('--')) || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const cakeScreenshot = args.includes('--cake-screenshot');
const homeScreenshot = args.includes('--home-screenshot');
const screenshot = args.includes('--screenshot') || cakeScreenshot || homeScreenshot;
const screenshotPath = path.join(os.tmpdir(), cakeScreenshot ? 'gamebox-birthday-cake.png' : homeScreenshot ? 'gamebox-birthday-entry.png' : 'gamebox-birthday-notice.png');
const { accountStub, fixedClock, runner } = require('./helpers/birthday-browser-fixtures.js');

(async () => {
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost'); let body, type = 'text/javascript';
        if (url.pathname === '/__birthday-check') { body = runner; type = 'text/html'; }
        else if (url.pathname === '/js/net/net.js') body = accountStub;
        else {
            const file = path.resolve(root, '.' + url.pathname);
            if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
            body = fs.readFileSync(file);
            if (cakeScreenshot && url.pathname === '/games/birthday.html') body = body.toString().replace('</body>', '<script>setTimeout(() => { document.getElementById("birthday-start").click(); }, 200);</script></body>');
            if (file.endsWith('.html')) { type = 'text/html'; if (['/index.html', '/games/birthday.html'].includes(url.pathname)) body = body.toString().replace('<head>', '<head>' + fixedClock); }
            else if (file.endsWith('.css')) type = 'text/css';
            else if (file.endsWith('.svg')) type = 'image/svg+xml';
        }
        response.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebox-birthday-browser-'));
    let browser, socket;
    try {
        const flags = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
            '--user-data-dir=' + profile, '--window-size=1100,1000',
            '--explicitly-allowed-ports=' + server.address().port];
        if (args.includes('--reduced-motion')) flags.push('--force-prefers-reduced-motion');
        if (screenshot) flags.push('--dump-dom', '--virtual-time-budget=2500', '--screenshot=' + screenshotPath);
        else flags.push('--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1');
        flags.push('http://127.0.0.1:' + server.address().port + (screenshot ? (homeScreenshot ? '/index.html?testAccount=screenshot&suppressAuto=1' : '/games/birthday.html?testAccount=screenshot') + (args.includes('--zh') ? '&locale=zh' : '') : '/__birthday-check'));
        browser = spawn(chrome, flags, { windowsHide: true });
        let output = '', diagnostics = '';
        browser.stdout.on('data', chunk => { output += chunk; }); browser.stderr.on('data', chunk => { diagnostics += chunk; });
        if (screenshot) {
            const timeout = setTimeout(() => browser.kill(), 35000);
            try { await new Promise((resolve, reject) => { browser.on('error', reject); browser.on('exit', resolve); }); }
            finally { clearTimeout(timeout); }
            assert(output.includes(homeScreenshot ? 'birthday-entry' : 'birthday-notice') && fs.existsSync(screenshotPath)); console.log(screenshotPath);
        } else {
            // Real frame time is required for hold-to-blow; virtual-time dumps can
            // starve requestAnimationFrame while advancing polling timers.
            const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
            const deadline = Date.now() + 35000, portFile = path.join(profile, 'DevToolsActivePort');
            while (!fs.existsSync(portFile) && Date.now() < deadline) await pause(50);
            assert(fs.existsSync(portFile), diagnostics.slice(-2000));
            const debugPort = fs.readFileSync(portFile, 'utf8').split('\n')[0];
            let target;
            while (!target && Date.now() < deadline) {
                const targets = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
                target = targets.find(item => item.type === 'page' && item.url.includes('/__birthday-check'));
                if (!target) await pause(50);
            }
            assert(target, 'Missing local browser target');
            socket = new WebSocket(target.webSocketDebuggerUrl);
            await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
            let nextId = 0;
            const pending = new Map();
            socket.addEventListener('message', event => {
                const message = JSON.parse(String(event.data)), task = pending.get(message.id);
                if (!task) return; pending.delete(message.id);
                if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
            });
            function evaluate(expression) {
                return new Promise((resolve, reject) => {
                    const id = ++nextId; pending.set(id, { resolve, reject });
                    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
                });
            }
            let result = '';
            while (Date.now() < deadline) {
                const value = await evaluate('document.getElementById("result")?.textContent || "LOADING"');
                result = value.result && value.result.value || '';
                if (result.startsWith('PASS:') || result.startsWith('FAIL:')) break;
                await pause(100);
            }
            assert(result.startsWith('PASS:'), result || diagnostics.slice(-2000)); console.log(result);
        }
    } finally {
        if (socket) socket.close();
        if (browser && browser.exitCode === null) {
            const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped;
        }
        await new Promise(resolve => server.close(resolve));
        if (path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep + 'gamebox-birthday-browser-')) {
            try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* Chrome can briefly retain a temp file */ }
        }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
