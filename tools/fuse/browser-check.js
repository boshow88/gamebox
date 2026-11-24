/** node tools/fuse/browser-check.js [chrome-path] — Fuse in real headless Chrome over CDP:
 * mouse, touch and keyboard merging, undo / restart, hints, dead ends, analysis, win and next
 * puzzle, language, responsive layout, the launcher card, and smoke loads of other puzzle
 * pages. Every UI move is mirrored by the Node engine and the rendered board compared.
 * Serves the repo locally and stubs js/net/net.js, so Firebase is never loaded. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Rules = require('../../js/games/fuse/rules.js');
const Solver = require('../../js/games/fuse/solver.js');
const Reasoning = require('../../js/games/fuse/reasoning.js');
const Gen = require('../../js/generators/fuse.js');
const { accountStub } = require('../helpers/birthday-browser-fixtures.js');

const root = path.resolve(__dirname, '..', '..');
const chrome = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const shots = process.argv.includes('--shots') ? [] : null;
const R = Rules.DEFAULT;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const SMOKE = ['guards', 'tango', 'sudoku', 'zip', 'hashi', 'queens', 'nonogram', 'patches', 'unshackle'];

// A start position that exercises every feedback path: a tile with no partner, a losing
// merge that still leaves moves, and a dead end within a few merges.
function pickPuzzle() {
    for (let seed = 1; seed < 400; seed++) {
        const p = Gen.generate({ size: 3, difficulty: 'easy', seed });
        const start = R.parse(p.board), solver = Solver.createSolver(R);
        const lonely = R.tiles(start).find((i) => !R.legalMoves(start).some((m) => m.from === i));
        const a = solver.analyze(start);
        const losing = a.moves.find((m) => m.outcome === 'lose' && R.status(R.applyMerge(start, m)) === 'playing');
        let dead = null;
        const queue = [[start, []]];
        while (queue.length && !dead) {
            const [b, moves] = queue.shift();
            if (moves.length >= 4) continue;
            for (const m of R.legalMoves(b)) {
                const next = R.applyMerge(b, m), path = moves.concat([m]);
                if (R.status(next) === 'dead-end') { dead = path; break; }
                queue.push([next, path]);
            }
        }
        if (lonely !== undefined && losing && dead) return { p, start, solver, lonely, losing, dead, solution: solver.solve(start) };
    }
    throw new Error('No suitable seed');
}

function serve(missing) {
    return http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        let body;
        if (url.pathname === '/js/net/net.js') body = accountStub;
        else {
            const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
            if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
                if (url.pathname !== '/favicon.ico') missing.push(url.pathname);
                response.writeHead(404); response.end(); return;
            }
            body = fs.readFileSync(file);
        }
        const type = TYPES[path.extname(url.pathname)] || 'text/javascript';
        response.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(body);
    });
}

function connect(wsUrl) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(wsUrl), pending = new Map(), listeners = new Map();
        let id = 0;
        socket.addEventListener('message', (event) => {
            const msg = JSON.parse(String(event.data));
            if (msg.id) {
                const task = pending.get(msg.id);
                if (!task) return;
                pending.delete(msg.id);
                if (msg.error) task.reject(new Error(msg.error.message)); else task.resolve(msg.result);
            } else for (const fn of [...(listeners.get(msg.method) || [])]) fn(msg.params);
        });
        socket.addEventListener('error', reject, { once: true });
        socket.addEventListener('open', () => resolve({
            send: (method, params = {}) => new Promise((res, rej) => {
                const n = ++id;
                pending.set(n, { resolve: res, reject: rej });
                socket.send(JSON.stringify({ id: n, method, params }));
            }),
            on: (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); },
            once: (method) => new Promise((res) => {
                const list = listeners.get(method) || [];
                const fn = (params) => { list.splice(list.indexOf(fn), 1); res(params); };
                list.push(fn); listeners.set(method, list);
            }),
            close: () => socket.close(),
        }), { once: true });
    });
}

(async () => {
    const pick = pickPuzzle();
    const missing = [], errors = [];
    const server = serve(missing);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebox-fuse-browser-'));
    let browser, cdp;
    try {
        browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--disable-background-networking', '--user-data-dir=' + profile, '--window-size=1100,1000', '--lang=en-US',
            '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', 'about:blank'], { windowsHide: true });
        let diagnostics = '';
        browser.stderr.on('data', (chunk) => { diagnostics += chunk; });
        const portFile = path.join(profile, 'DevToolsActivePort'), deadline = Date.now() + 30000;
        while (!fs.existsSync(portFile) && Date.now() < deadline) await pause(50);
        assert.ok(fs.existsSync(portFile), 'Chrome debugging port: ' + diagnostics.slice(-1500));
        const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
        let target;
        while (!target && Date.now() < deadline) {
            target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
            if (!target) await pause(50);
        }
        cdp = await connect(target.webSocketDebuggerUrl);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        cdp.on('Runtime.exceptionThrown', (p) => errors.push((p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text));
        cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push('console.error: ' + p.args.map((a) => a.value || a.description).join(' ')); });
        cdp.on('Page.javascriptDialogOpening', (p) => { errors.push('unexpected dialog: ' + p.message); cdp.send('Page.handleJavaScriptDialog', { accept: true }); });

        const evaluate = async (expression) => {
            const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
            if (r.exceptionDetails) throw new Error('evaluate: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
            return r.result.value;
        };
        const waitFor = async (expression, what, ms = 15000) => {
            const end = Date.now() + ms;
            while (Date.now() < end) { if (await evaluate(expression)) return; await pause(40); }
            throw new Error('Timed out waiting for ' + what);
        };
        const open = async (pathname) => {
            const loaded = cdp.once('Page.loadEventFired');
            await cdp.send('Page.navigate', { url: base + pathname });
            await loaded;
        };
        const text = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim() ?? null`);
        const hidden = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)}).hidden`);
        const count = (sel) => evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
        const clickEl = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`);
        // --shots: PNGs of key states in the temp folder, for eyeballing the styling.
        const shot = async (name) => {
            if (!shots) return;
            await pause(380);
            const file = path.join(os.tmpdir(), `gamebox-fuse-${name}.png`);
            fs.writeFileSync(file, Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
            shots.push(file);
        };
        const noErrors = (where) => { assert.deepEqual(errors, [], 'page errors on ' + where); assert.deepEqual(missing, [], 'missing files on ' + where); };

        // Board as rendered: each tile group sits at its cell centre (GAP + CELL/2 + k·(CELL+GAP)).
        const readBoard = () => evaluate(`(() => {
            const out = Array(9).fill('.');
            for (const g of document.querySelectorAll('#board .fuse-tiles > g')) {
                const inner = g.firstElementChild;
                if (inner.classList.contains('fuse-ghost')) continue;
                const m = /translate\\(([-\\d.]+) ([-\\d.]+)\\)/.exec(g.getAttribute('transform'));
                out[Math.round((m[2] - 58) / 108) * 3 + Math.round((m[1] - 58) / 108)] = inner.querySelector('text').textContent;
            }
            return [0, 1, 2].map((r) => out.slice(r * 3, r * 3 + 3).join(' ')).join('/');
        })()`);
        const expectBoard = async (board, what) => assert.equal(await readBoard(), R.serialize(board), what);
        const point = (i) => evaluate(`(() => {
            const svg = document.getElementById('board');
            const p = new DOMPoint(${58 + (i % 3) * 108}, ${58 + Math.floor(i / 3) * 108}).matrixTransform(svg.getScreenCTM());
            return { x: p.x, y: p.y };
        })()`);
        const mouse = (type, p, held) => cdp.send('Input.dispatchMouseEvent', {
            type, x: p.x, y: p.y, button: held || type !== 'mouseMoved' ? 'left' : 'none', buttons: held ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1,
        });
        const click = async (i) => { const p = await point(i); await mouse('mouseMoved', p); await mouse('mousePressed', p, true); await mouse('mouseReleased', p); };
        const drag = async (from, to, during) => {
            const a = await point(from), b = await point(to);
            await mouse('mouseMoved', a); await mouse('mousePressed', a, true);
            for (let k = 1; k <= 6; k++) await mouse('mouseMoved', { x: a.x + ((b.x - a.x) * k) / 6, y: a.y + ((b.y - a.y) * k) / 6 }, true);
            if (during) await during();
            await mouse('mouseReleased', b);
        };
        const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] : [] });
        const tapTouch = async (i) => { const p = await point(i); await touch('touchStart', p); await touch('touchEnd'); await pause(30); };
        const dragTouch = async (from, to) => {
            const a = await point(from), b = await point(to);
            await touch('touchStart', a);
            for (let k = 1; k <= 6; k++) await touch('touchMove', { x: a.x + ((b.x - a.x) * k) / 6, y: a.y + ((b.y - a.y) * k) / 6 });
            await touch('touchEnd');
        };
        const VK = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Escape: 27, z: 90 };
        const key = async (k, modifiers = 0) => {
            const params = { key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, windowsVirtualKeyCode: VK[k], modifiers };
            await cdp.send('Input.dispatchKeyEvent', Object.assign({ type: 'rawKeyDown' }, params));
            await cdp.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, params));
        };
        const cursorTo = async (i) => {
            for (const k of ['ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowLeft']) await key(k);
            for (let r = 0; r < Math.floor(i / 3); r++) await key('ArrowDown');
            for (let c = 0; c < i % 3; c++) await key('ArrowRight');
        };
        const fusePage = (difficulty, seed) => `/games/fuse.html?size=3&diff=${difficulty}&seed=${seed.toString(36)}`;
        const ready = () => waitFor(`document.querySelectorAll('#board .fuse-tile').length > 0 && !document.getElementById('new-game-btn').disabled && !document.getElementById('reset-btn').disabled`, 'puzzle ready');

        // ---------- desktop: mouse ----------
        const { p, start, solver, lonely, losing, dead, solution } = pick;
        await open(fusePage('easy', p.seed));
        await ready();
        await expectBoard(start, 'browser and Node generate the same puzzle for a seed');
        assert.equal(await text('#fuse-level'), 'Easy · 3×3');
        assert.equal(await text('#fuse-code'), '#' + p.seed.toString(36));
        assert.equal(await text('#fuse-tiles'), '9 tiles left');
        assert.equal(await evaluate('document.getElementById("undo-btn").disabled'), true);
        assert.equal(await hidden('#fuse-analysis'), true, 'analysis is off by default');
        assert.equal(await evaluate('document.getElementById("reveal-btn").getAttribute("aria-pressed")'), 'false');
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'no horizontal overflow at 1100px');
        await shot('start');

        await click(lonely);
        assert.match(await text('#fuse-feedback'), /has no equal neighbour/);
        assert.equal(await evaluate('document.getElementById("fuse-feedback").classList.contains("bad")'), true);
        assert.equal(await count('#board .fuse-tile.selected'), 0);

        const m0 = solution[0];
        await click(m0.from);
        assert.equal(await count('#board .fuse-tile.selected'), 1);
        assert.equal(await count('#board .fuse-target'), R.legalMoves(start).filter((m) => m.from === m0.from).length, 'every valid destination is highlighted');
        assert.ok((await count('#board .fuse-tile.dim')) > 0, 'other tiles are dimmed');
        assert.match(await text('#fuse-feedback'), /^Selected \d+\./);
        await shot('selected');
        await click(m0.from);
        assert.equal(await count('#board .fuse-tile.selected'), 0);
        assert.equal(await text('#fuse-feedback'), 'Selection cleared.');

        await click(m0.from); await click(m0.to);
        const ghost = await count('#board .fuse-ghost');
        const after0 = R.applyMerge(start, m0);
        await expectBoard(after0, 'tap-tap merge');
        assert.equal(await text('#fuse-tiles'), '8 tiles left');
        assert.equal(await count('#board .fuse-slot.empty'), 1);
        assert.equal(await count('#board .fuse-hole'), 1);
        assert.match(await text('#fuse-feedback'), /^Merged into \d+\.$/);
        assert.equal(await evaluate('document.getElementById("undo-btn").disabled'), false);

        await clickEl('#undo-btn');
        await expectBoard(start, 'undo button');
        assert.equal(await text('#fuse-feedback'), 'Last merge undone.');

        let lifted = 0;
        await drag(m0.from, m0.to, async () => { lifted = await count('#board .fuse-tile.lifted'); });
        assert.equal(lifted, 1, 'the dragged tile follows the pointer');
        await expectBoard(after0, 'drag merge');
        await key('z', 2);
        await expectBoard(start, 'Ctrl+Z');

        await drag(m0.from, m0.from === 0 ? 8 : 0);
        await expectBoard(start, 'a drag onto a non-neighbour does nothing');
        assert.equal(await count('#board .fuse-tile.selected'), 0, 'a failed drop restores the earlier selection');
        assert.equal(await text('#fuse-feedback'), 'Selection cleared.');
        {
            const a = await point(m0.from), b = await point(m0.to);
            await mouse('mouseMoved', a); await mouse('mousePressed', a, true);
            await mouse('mouseMoved', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, true);
            await mouse('mouseMoved', a, true); await mouse('mouseReleased', a);
            assert.equal(await count('#board .fuse-tile.selected'), 1, 'a drag released on its own cell acts as a tap');
            await click(m0.from);
            assert.equal(await count('#board .fuse-tile.selected'), 0);
        }

        // ---------- keyboard ----------
        await evaluate('document.getElementById("board").focus()');
        await key('ArrowUp');
        assert.equal(await count('#board .fuse-cursor'), 1, 'keyboard cursor appears');
        await cursorTo(m0.from); await key('Enter');
        assert.equal(await count('#board .fuse-tile.selected'), 1);
        assert.match(await text('#fuse-live'), /Row \d, column \d: \d+, selected/);
        await key('Escape');
        assert.equal(await count('#board .fuse-tile.selected'), 0);
        await cursorTo(m0.from); await key('Enter'); await cursorTo(m0.to);
        assert.match(await text('#fuse-live'), /can merge here/);
        await key('Enter');
        await expectBoard(after0, 'keyboard merge');

        // ---------- restart ----------
        const m1 = solution[1], after1 = R.applyMerge(after0, m1);
        await click(m1.from); await click(m1.to);
        await expectBoard(after1, 'second merge');
        await clickEl('#reset-btn');
        await expectBoard(start, 'restart');
        assert.equal(await text('#fuse-feedback'), 'Back to the start.');
        await clickEl('#undo-btn');
        await expectBoard(after1, 'restart can be undone');
        await clickEl('#reset-btn');

        // ---------- hints ----------
        const step = Reasoning.nextStep(R, start, { solver });
        await clickEl('#hint-btn');
        assert.equal(await hidden('#hint-banner'), false);
        assert.equal(await text('#hint-banner .hint-tier'), 'Hint 1/3');
        assert.match(await text('#hint-banner .hint-tier.fuse-level'), new RegExp(`^Level ${step.level} · `));
        if (['lone', 'forced-pair', 'final', 'trial'].includes(step.technique)) assert.ok((await count('#board .fuse-hint-ring')) > 0, 'tier 1 highlights where to look');
        assert.equal(await count('#board .fuse-arrow.move'), 0, 'tier 1 does not give the move away');
        await clickEl('#hint-btn');
        assert.equal(await text('#hint-banner .hint-tier'), 'Hint 2/3');
        assert.equal(await count('#board line.fuse-arrow.refuted'), (step.refuted || []).length);
        await shot('hint2');
        await clickEl('#hint-btn');
        assert.equal(await text('#hint-banner .hint-tier'), 'Hint 3/3');
        assert.ok((await count('#board line.fuse-arrow.move')) > 0, 'tier 3 shows the merge');
        await shot('hint3');
        await clickEl('#hint-btn');
        assert.equal(await text('#hint-banner .hint-tier'), 'Hint 3/3', 'tiers stop at 3');
        await click(step.move.from); await click(step.move.to);
        await expectBoard(R.applyMerge(start, step.move), 'following the hint');
        assert.equal(await hidden('#hint-banner'), true, 'a merge clears the hint');
        await clickEl('#reset-btn');

        // A losing merge: the hint says so, explains why, and offers the way back.
        await click(losing.from); await click(losing.to);
        await clickEl('#hint-btn');
        assert.equal(await evaluate('document.getElementById("hint-banner").classList.contains("error")'), true);
        assert.equal(await text('#hint-banner .hint-tier.err'), 'Stuck');
        assert.match(await text('#hint-banner'), /can no longer be solved/);
        assert.equal(await text('#hint-banner .fuse-hint-action'), 'Undo 1 merge');
        await shot('stuck-hint');
        await clickEl('#hint-banner .fuse-hint-action');
        await expectBoard(start, 'the go-back button undoes to the last solvable position');

        // ---------- dead end ----------
        let b = start;
        for (const m of dead) { await click(m.from); await click(m.to); b = R.applyMerge(b, m); }
        await expectBoard(b, 'dead-end line');
        assert.equal(await hidden('#fuse-dead'), false);
        assert.equal(await hidden('#fuse-dead-pill'), false);
        assert.match(await text('#fuse-feedback'), /nothing can merge/);
        await shot('dead-end');
        await clickEl('#fuse-dead-undo');
        assert.equal(await hidden('#fuse-dead'), true);
        const last = dead[dead.length - 1];
        await click(last.from); await click(last.to);
        await clickEl('#fuse-dead-restart');
        await expectBoard(start, 'restart from the dead-end panel');
        assert.equal(await hidden('#fuse-dead'), true);

        // ---------- analysis ----------
        const exact = solver.analyze(start);
        await clickEl('#reveal-btn');
        await waitFor('!document.getElementById("fuse-analysis").hidden', 'analysis panel');
        assert.match(await text('#fuse-analysis'), /Search results, not human deductions\./);
        assert.equal(await count('#board .fuse-chev'), exact.moves.length, 'one marker per directed merge');
        assert.equal(await count('#board .fuse-chev.win'), exact.moves.filter((m) => m.outcome === 'win').length);
        await shot('analysis');
        await clickEl('#reveal-btn');
        assert.equal(await hidden('#fuse-analysis'), true);
        assert.equal(await count('#board .fuse-chev'), 0);

        // ---------- win, undo out of the win, next puzzle ----------
        b = start;
        for (const m of solution) { await click(m.from); await click(m.to); b = R.applyMerge(b, m); }
        await expectBoard(b, 'solution replay');
        assert.equal(await hidden('#fuse-win'), false);
        assert.equal(await text('#fuse-feedback'), 'Fused! One tile left.');
        assert.match(await text('#fuse-win-detail'), /^Easy · \d\d:\d\d/);
        assert.equal(await evaluate('document.getElementById("board").classList.contains("won")'), true);
        assert.equal(await evaluate('document.getElementById("hint-btn").disabled'), true);
        await shot('win');
        await key('z', 2);
        assert.equal(await hidden('#fuse-win'), true, 'undo leaves the win state');
        assert.equal(await text('#fuse-tiles'), '2 tiles left');
        const fin = solution[solution.length - 1];
        await click(fin.to); await click(fin.from);
        assert.equal(await hidden('#fuse-win'), false, 'the final merge works in either direction');
        await clickEl('#fuse-next');
        await waitFor(`document.getElementById('fuse-win').hidden && document.querySelectorAll('#board .fuse-tile').length === 9 && new URLSearchParams(location.search).get('seed') !== '${p.seed.toString(36)}'`, 'next puzzle');
        const nextSeed = parseInt(await evaluate('new URLSearchParams(location.search).get("seed")'), 36);
        await ready();
        await expectBoard(R.parse(Gen.generate({ size: 3, difficulty: 'easy', seed: nextSeed }).board), 'next puzzle matches its shared seed');

        // ---------- difficulty and language ----------
        await clickEl('#difficulty-seg [data-value="hard"]');
        await clickEl('#new-game-btn');
        await waitFor(`document.getElementById('fuse-level').textContent === 'Hard · 3×3'`, 'hard puzzle');
        await ready();
        const hardSeed = parseInt(await evaluate('new URLSearchParams(location.search).get("seed")'), 36);
        assert.equal(await evaluate('new URLSearchParams(location.search).get("diff")'), 'hard');
        await expectBoard(R.parse(Gen.generate({ size: 3, difficulty: 'hard', seed: hardSeed }).board), 'hard puzzle matches its seed');
        await clickEl('#lang-toggle [data-lang="zh"]');
        assert.equal(await text('#fuse-tiles'), '剩9塊');
        assert.equal(await text('#fuse-level'), (await evaluate('PuzzleCommon.i18n.t("hard")')) + '・3×3');
        assert.equal(await text('#hint-btn'), '提示');
        await clickEl('#hint-btn');
        assert.match(await text('#hint-banner .hint-tier'), /^提示1\/3$/);
        await clickEl('#hint-btn'); await clickEl('#hint-btn');
        await shot('zh-hint3');
        await open(fusePage('hard', hardSeed));
        await ready();
        assert.equal(await text('#reset-btn'), '重新開始', 'game strings apply on a fresh load in Chinese');
        assert.equal(await text('#fuse-dead span'), '復原上一步，或重新開始這一題。');
        assert.equal(await text('#fuse-tiles'), '剩9塊');
        await clickEl('#hint-btn');
        await clickEl('#lang-toggle [data-lang="en"]');
        assert.equal(await text('#hint-banner .hint-tier'), 'Hint 1/3', 'the open hint follows the language');
        noErrors('fuse desktop');

        // Reduced motion: merges apply without the sliding ghost.
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        await open(fusePage('easy', p.seed));
        await ready();
        await click(m0.from); await click(m0.to);
        assert.equal(await count('#board .fuse-ghost'), 0);
        await expectBoard(after0, 'reduced-motion merge');
        await cdp.send('Emulation.setEmulatedMedia', { features: [] });
        noErrors('fuse reduced motion');

        // ---------- mobile: touch, layout ----------
        for (const width of [375, 320]) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 740, deviceScaleFactor: 2, mobile: true });
            await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
            await open(fusePage('easy', p.seed));
            await ready();
            await evaluate('document.getElementById("board").scrollIntoView({ block: "center" })');
            const layout = await evaluate(`(() => {
                const r = document.getElementById('board').getBoundingClientRect();
                return { overflow: document.documentElement.scrollWidth - innerWidth, width: r.width, left: r.left, right: r.right };
            })()`);
            assert.ok(layout.overflow <= 0, `no horizontal overflow at ${width}px (${layout.overflow})`);
            assert.ok(layout.left >= 0 && layout.right <= width, `board fits at ${width}px`);
            assert.ok((layout.width / 332) * 100 >= 44, `cells stay at least 44px wide at ${width}px`);
            await tapTouch(m0.from);
            assert.equal(await count('#board .fuse-tile.selected'), 1, 'touch selects');
            await shot('mobile-' + width);
            await tapTouch(m0.to);
            await expectBoard(after0, `touch tap-tap merge at ${width}px`);
            await dragTouch(m1.from, m1.to);
            await expectBoard(after1, `touch drag merge at ${width}px`);
            await clickEl('#undo-btn');
            await expectBoard(after0, 'undo on mobile');
            noErrors('fuse mobile ' + width);
        }
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
        await cdp.send('Emulation.clearDeviceMetricsOverride');

        // ---------- launcher card ----------
        await open('/index.html');
        await waitFor(`document.querySelector('a.game-card[href="./games/fuse.html"]')`, 'Fuse launcher card');
        const card = await evaluate(`(() => {
            const a = document.querySelector('a.game-card[href="./games/fuse.html"]');
            return { name: a.querySelector('.game-name').textContent, tagline: a.querySelector('.game-tagline').textContent,
                wip: !!a.querySelector('.badge-wip'), icon: !!a.querySelector('.game-icon svg') };
        })()`);
        assert.deepEqual(card, { name: 'Fuse', tagline: 'Pair them up. End with one.', wip: true, icon: true });
        noErrors('launcher');

        // ---------- other puzzle pages still load cleanly ----------
        for (const id of SMOKE) {
            await open(`/games/${id}.html`);
            await waitFor(`(() => { const b = document.querySelector('#board'); return !!b && (b.tagName === 'CANVAS' || b.childElementCount > 0); })()`, id + ' board', 20000);
            await pause(800);
            noErrors(id);
        }
        console.log(`fuse browser: ok (seed ${p.seed.toString(36)}, ${solution.length}-merge solution, ghost frames ${ghost}, smoke ${SMOKE.length} pages)`);
        if (shots) console.log(shots.join('\n'));
    } finally {
        if (cdp) cdp.close();
        if (browser && browser.exitCode === null) { const stopped = new Promise((resolve) => browser.once('exit', resolve)); browser.kill(); await stopped; }
        await new Promise((resolve) => server.close(resolve));
        try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* Chrome can briefly hold files */ }
    }
})().catch((err) => { console.error(err); process.exitCode = 1; });
