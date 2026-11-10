// Read a browser test's #result using real frame time. Dynamic imports and async
// room interactions can stall when Chrome's virtual-time --dump-dom is used.
'use strict';
const fs = require('node:fs'), path = require('node:path');
module.exports = async function chromeResult(profile, targetUrl, timeoutMs = 40000) {
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const deadline = Date.now() + timeoutMs, portFile = path.join(profile, 'DevToolsActivePort');
    let socket;
    try {
        while (!fs.existsSync(portFile) && Date.now() < deadline) await pause(50);
        if (!fs.existsSync(portFile)) throw Error('Chrome did not publish its debugging port');
        const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
        let target;
        while (!target && Date.now() < deadline) {
            const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
            target = targets.find(item => item.type === 'page' && item.url === targetUrl);
            if (!target) await pause(50);
        }
        if (!target) throw Error('Missing local browser test target');
        socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            socket.addEventListener('open', resolve, { once: true });
            socket.addEventListener('error', reject, { once: true });
        });
        let id = 0;
        const pending = new Map();
        socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data)), task = pending.get(message.id);
            if (!task) return;
            pending.delete(message.id);
            if (message.error) task.reject(Error(message.error.message)); else task.resolve(message.result);
        });
        const evaluate = expression => new Promise((resolve, reject) => {
            const request = ++id; pending.set(request, { resolve, reject });
            socket.send(JSON.stringify({ id: request, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
        });
        let result = 'LOADING';
        while (Date.now() < deadline) {
            const value = await evaluate('document.getElementById("result")?.textContent || "LOADING"');
            result = value.result && value.result.value || 'LOADING';
            if (result.startsWith('PASS') || result.startsWith('FAIL')) return result;
            await pause(100);
        }
        throw Error('Browser test timed out: ' + result);
    } finally { if (socket) socket.close(); }
};
