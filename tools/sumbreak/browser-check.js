/** node tools/sumbreak/browser-check.js [chrome-path] [--shots] — Sumbreak in real headless Chrome
 * over CDP: the shared puzzle layout (compared with Tango), mouse, touch and keyboard merging,
 * undo / reset, hints, dead ends, the solution overlay, win and new game, rectangular boards,
 * ×2 tiles, difficulty-chosen shapes and old links, puzzles made ahead in a worker (and
 * without one), language, responsive layout, the launcher card, and smoke loads of other
 * puzzle pages.
 * Every UI move is mirrored by the Node engine and the rendered board compared.
 * Serves the repo locally and stubs js/net/net.js, so Firebase is never loaded. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Rules = require('../../js/games/sumbreak/rules.js');
const Solver = require('../../js/games/sumbreak/solver.js');
const Reasoning = require('../../js/games/sumbreak/reasoning.js');
const Gen = require('../../js/generators/sumbreak.js');
const { accountStub } = require('../helpers/birthday-browser-fixtures.js');

const root = path.resolve(__dirname, '..', '..');
const chrome = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const shots = process.argv.includes('--shots') ? [] : null;
const R = Rules.DEFAULT;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const SMOKE = ['guards', 'tango', 'sudoku', 'zip', 'hashi', 'queens', 'nonogram', 'patches', 'unshackle'];

// A rectangular start position of numbers only that exercises every feedback path: a tile
// with no partner, a losing merge that still leaves moves, and a dead end within a few merges.
function pickPuzzle() {
    for (let seed = 1; seed <= 400; seed++) {
        const p = Gen.generate({ difficulty: 'easy', seed });
        if (p.rows === p.cols) continue;
        const start = R.parse(p.board), solver = Solver.createSolver(R);
        if (!R.numbersOnly(start)) continue;
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
        if (lonely === undefined || !losing || !dead) continue;
        const solution = solver.solve(start), m0 = solution[0];
        const far = R.tiles(start).find((i) => i !== m0.from && !R.neighbors(start, m0.from).includes(i));
        return { p, start, solver, lonely, losing, dead, solution, far };
    }
    throw new Error('No suitable seed');
}
// A hard 4×4 with a ×2 tile, a number merging onto it and the ×2 merging onto a number.
function pickMul() {
    for (let seed = 1; seed < 100; seed++) {
        const t0 = Date.now(), p = Gen.generate({ difficulty: 'hard', seed }), ms = Date.now() - t0;
        const start = R.parse(p.board), moves = R.legalMoves(start), isMul = (i) => start.cells[i].type === 'mul';
        const into = moves.find((m) => isMul(m.to) && R.status(R.applyMerge(start, m)) === 'playing');
        const onto = moves.find((m) => isMul(m.from) && R.status(R.applyMerge(start, m)) === 'playing');
        if (into && onto) return { p, start, into, onto, ms };
    }
    throw new Error('No hard puzzle with a ×2 tile');
}

// `hits` counts requests per path; paths in `blocked` answer 404 without counting as missing.
function serve(missing, hits, blocked) {
    return http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        hits[url.pathname] = (hits[url.pathname] || 0) + 1;
        if (blocked.has(url.pathname)) { response.writeHead(404); response.end(); return; }
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
    const pick = pickPuzzle(), mulPick = pickMul();
    const missing = [], errors = [], hits = {}, blocked = new Set();
    const server = serve(missing, hits, blocked);
    const WORKER = '/js/games/sumbreak/worker.js', workers = () => hits[WORKER] || 0;
    const until = async (fn, what, ms = 10000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) { if (fn()) return; await pause(40); }
        throw new Error('Timed out waiting for ' + what);
    };
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebox-sumbreak-browser-'));
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
            const file = path.join(os.tmpdir(), `gamebox-sumbreak-${name}.png`);
            fs.writeFileSync(file, Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
            shots.push(file);
        };
        const noErrors = (where) => { assert.deepEqual(errors, [], 'page errors on ' + where); assert.deepEqual(missing, [], 'missing files on ' + where); };

        // Board as rendered: each tile group sits at its cell centre (GAP + CELL/2 + k·(CELL+GAP));
        // a ×2 tile reads "×2" and is filled violet.
        let shape = { rows: 3, cols: 3 };
        const readBoard = () => evaluate(`(() => {
            const rows = ${shape.rows}, cols = ${shape.cols}, out = Array(rows * cols).fill('.'), violet = [];
            const at = (g) => /translate\\(([-\\d.]+) ([-\\d.]+)\\)/.exec(g.getAttribute('transform')).slice(1).map(Number);
            for (const g of document.querySelectorAll('#board .sumbreak-tiles > g')) {
                const inner = g.firstElementChild;
                if (inner.classList.contains('sumbreak-ghost')) continue;
                const [x, y] = at(g), i = Math.round((y - 58) / 108) * cols + Math.round((x - 58) / 108);
                out[i] = inner.querySelector('text').textContent;
                if (inner.querySelector('rect').getAttribute('fill') === '#7c3aed') violet.push(i);
            }
            return { cells: Array.from({ length: rows }, (_, r) => out.slice(r * cols, r * cols + cols).join(' ')).join('/'), violet };
        })()`);
        const expectBoard = async (board, what) => {
            shape = board;
            const seen = await readBoard();
            assert.equal(seen.cells, R.serialize(board).replace(/x(\d+)/g, '×$1'), what);
            assert.deepEqual(seen.violet, R.tiles(board).filter((i) => board.cells[i].type === 'mul'), what + ': ×2 tiles are violet');
        };
        const point = (i) => evaluate(`(() => {
            const svg = document.getElementById('board');
            const p = new DOMPoint(${58 + (i % shape.cols) * 108}, ${58 + Math.floor(i / shape.cols) * 108}).matrixTransform(svg.getScreenCTM());
            return { x: p.x, y: p.y };
        })()`);
        const viewBox = () => evaluate(`document.getElementById('board').getAttribute('viewBox')`);
        const viewBoxOf = (b) => `0 0 ${b.cols * 108 + 8} ${b.rows * 108 + 8}`;
        // The board keeps its own proportions instead of being letterboxed in a square.
        const proportions = () => evaluate(`(() => { const r = document.getElementById('board').getBoundingClientRect(); return r.width / r.height; })()`);
        const live = () => text('#sumbreak-live');
        const disabled = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)}).disabled`);
        const pressed = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)}).getAttribute('aria-pressed')`);
        const hasClass = (sel, cls) => evaluate(`document.querySelector(${JSON.stringify(sel)}).classList.contains(${JSON.stringify(cls)})`);
        const urlParam = (name) => evaluate(`new URLSearchParams(location.search).get(${JSON.stringify(name)})`);
        const revealNumbers = () => evaluate(`[...document.querySelectorAll('#board .sumbreak-reveal-num')].map((t) => Number(t.textContent))`);
        // A tile the open hint calls "ringed in red" has a red ring, and only then.
        const refRingsMatch = async () => {
            const says = await text('#hint-banner'), rings = await count('#board .sumbreak-ref-ring');
            assert.equal(rings > 0, /ringed in red/.test(says), `red rings ${rings} for: ${says}`);
            if (/the two \d+s ringed in red/.test(says)) assert.equal(rings, 2, 'two tiles ringed in red');
        };
        // The page chrome a player sees, to compare with the other LinkedIn-style puzzles.
        const layoutOf = () => evaluate(`(() => {
            const label = (el) => { const l = el.querySelector('[data-i18n]'); return l ? l.dataset.i18n : el.textContent.trim(); };
            return {
                toolbar: [...document.querySelectorAll('.game-toolbar .toolbar-group')].map((g) => g.querySelector('.toolbar-label').dataset.i18n),
                actions: [...document.querySelectorAll('.game-toolbar .toolbar-action .btn')].map((b) => b.id + ':' + label(b)),
                row: [...document.querySelectorAll('.action-row .btn')].map((b) => b.id + ':' + label(b) + ':' + b.dataset.i18nTitle),
                status: [...document.querySelectorAll('.status-row > .status-item')].map((s) => (s.querySelector('.timer') ? 'timer' : [...s.classList].filter((c) => c !== 'status-item' && c !== 'active').join('.'))),
                below: [...document.querySelectorAll('.board-wrap ~ *')].filter((el) => !el.classList.contains('sumbreak-sr')).map((el) => el.className.split(' ')[0]),
            };
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
            for (let k = 0; k < Math.max(shape.rows, shape.cols); k++) { await key('ArrowUp'); await key('ArrowLeft'); }
            for (let r = 0; r < Math.floor(i / shape.cols); r++) await key('ArrowDown');
            for (let c = 0; c < i % shape.cols; c++) await key('ArrowRight');
        };
        const sumbreakPage = (difficulty, seed) => `/games/sumbreak.html?diff=${difficulty}&seed=${seed.toString(36)}`;
        const ready = () => waitFor(`document.querySelectorAll('#board .sumbreak-tile').length > 0 && !document.getElementById('new-game-btn').disabled && !document.getElementById('reset-btn').disabled`, 'puzzle ready');
        const play = async (moves, board) => { let b = board; for (const m of moves) { await click(m.from); await click(m.to); b = R.applyMerge(b, m); } return b; };

        // ---------- layout: the same page chrome as the other LinkedIn-style puzzles ----------
        await open('/games/tango.html');
        await waitFor(`document.querySelector('#board').childElementCount > 0`, 'tango board', 20000);
        const tango = await layoutOf();
        const { p, start, solver, lonely, losing, dead, solution, far } = pick;
        await open(sumbreakPage(p.difficulty, p.seed));
        await ready();
        await until(() => workers() === 2, 'the puzzle and the next one are made in workers');
        const page = await layoutOf();
        const firstTwo = (rows) => rows.map((s) => s.split(':').slice(0, 2).join(':'));
        assert.deepEqual(page.toolbar, tango.toolbar.filter((g) => g !== 'boardSize'), 'toolbar: difficulty only, which picks the board shape');
        assert.deepEqual(page.actions, tango.actions, 'toolbar actions: new game and share');
        assert.deepEqual(firstTwo(page.row), firstTwo(tango.row), 'action row: undo, reset, hint, reveal');
        assert.equal(page.row[3], tango.row[3], 'reveal uses the shared solution-overlay wording');
        assert.deepEqual(page.status, tango.status, 'status row: timer, warning, win');
        assert.deepEqual(page.below, tango.below, 'below the board: hint banner, then how to play');
        assert.equal(await evaluate(`!!document.getElementById('size-seg')`), false, 'no board size selector');
        assert.equal(await evaluate(`!!document.querySelector('.game-footer [data-i18n="sumbreakHelpMul"]')`), true, 'how to play explains ×2 tiles');
        assert.equal(await evaluate(`document.querySelector('#difficulty-seg .active').dataset.value`), p.difficulty);
        assert.equal(await urlParam('size'), null);
        for (const gone of ['sumbreak-analysis', 'sumbreak-feedback', 'sumbreak-win', 'sumbreak-dead', 'sumbreak-next', 'sumbreak-level', 'sumbreak-code', 'sumbreak-tiles']) {
            assert.equal(await evaluate(`!!document.getElementById('${gone}')`), false, `#${gone} is gone`);
        }
        await expectBoard(start, 'browser and Node generate the same puzzle for a seed');
        assert.equal(await viewBox(), viewBoxOf(start), `${start.rows}×${start.cols} viewBox`);
        assert.ok(Math.abs(await proportions() - (start.cols * 108 + 8) / (start.rows * 108 + 8)) < 0.02, 'a rectangular board keeps its proportions');
        assert.equal(await disabled('#undo-btn'), true);
        assert.equal(await pressed('#reveal-btn'), 'false');
        assert.equal(await hidden('#sumbreak-dead-pill'), true);
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'no horizontal overflow at 1100px');
        await shot('start');

        // ---------- desktop: mouse ----------
        await click(lonely);
        assert.match(await live(), /has no equal neighbour/);
        assert.equal(await count('#board .sumbreak-tile.selected'), 0);
        assert.equal(await count('#board .sumbreak-tile.nope'), 1, 'a tile with no partner shakes');

        const m0 = solution[0];
        await click(m0.from);
        assert.equal(await count('#board .sumbreak-tile.selected'), 1);
        assert.equal(await count('#board .sumbreak-target'), R.legalMoves(start).filter((m) => m.from === m0.from).length, 'every valid destination is highlighted');
        assert.ok((await count('#board .sumbreak-tile.dim')) > 0, 'other tiles are dimmed');
        assert.match(await live(), /^Selected \d+\./);
        await shot('selected');
        await click(m0.from);
        assert.equal(await count('#board .sumbreak-tile.selected'), 0);
        assert.equal(await live(), 'Selection cleared.');

        await click(m0.from); await click(m0.to);
        const ghost = await count('#board .sumbreak-ghost');
        const after0 = R.applyMerge(start, m0);
        await expectBoard(after0, 'tap-tap merge');
        assert.equal(await count('#board .sumbreak-slot.empty'), 1);
        assert.equal(await count('#board .sumbreak-hole'), 1);
        assert.match(await live(), /^Merged into \d+\.$/);
        assert.equal(await disabled('#undo-btn'), false);

        await clickEl('#undo-btn');
        await expectBoard(start, 'undo button');
        assert.equal(await live(), 'Last merge undone.');

        let lifted = 0;
        await drag(m0.from, m0.to, async () => { lifted = await count('#board .sumbreak-tile.lifted'); });
        assert.equal(lifted, 1, 'the dragged tile follows the pointer');
        await expectBoard(after0, 'drag merge');
        await key('z', 2);
        await expectBoard(start, 'Ctrl+Z');

        await drag(m0.from, far);
        await expectBoard(start, 'a drag onto a non-neighbour does nothing');
        assert.equal(await count('#board .sumbreak-tile.selected'), 0, 'a failed drop restores the earlier selection');
        assert.equal(await live(), 'Selection cleared.');
        {
            const a = await point(m0.from), b = await point(m0.to);
            await mouse('mouseMoved', a); await mouse('mousePressed', a, true);
            await mouse('mouseMoved', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, true);
            await mouse('mouseMoved', a, true); await mouse('mouseReleased', a);
            assert.equal(await count('#board .sumbreak-tile.selected'), 1, 'a drag released on its own cell acts as a tap');
            await click(m0.from);
            assert.equal(await count('#board .sumbreak-tile.selected'), 0);
        }

        // ---------- keyboard ----------
        await evaluate('document.getElementById("board").focus()');
        await key('ArrowUp');
        assert.equal(await count('#board .sumbreak-cursor'), 1, 'keyboard cursor appears');
        await cursorTo(m0.from); await key('Enter');
        assert.equal(await count('#board .sumbreak-tile.selected'), 1);
        assert.match(await text('#sumbreak-live'), /Row \d, column \d: \d+, selected/);
        await key('Escape');
        assert.equal(await count('#board .sumbreak-tile.selected'), 0);
        await cursorTo(m0.from); await key('Enter'); await cursorTo(m0.to);
        assert.match(await text('#sumbreak-live'), /can merge here/);
        await key('Enter');
        await expectBoard(after0, 'keyboard merge');

        // ---------- reset ----------
        const m1 = solution[1], after1 = R.applyMerge(after0, m1);
        await click(m1.from); await click(m1.to);
        await expectBoard(after1, 'second merge');
        await clickEl('#reset-btn');
        await expectBoard(start, 'reset');
        assert.equal(await live(), 'Back to the start.');
        await clickEl('#undo-btn');
        await expectBoard(after1, 'reset can be undone');
        await clickEl('#reset-btn');

        // ---------- hints: press to show one explained merge, press again to hide ----------
        const step = Reasoning.nextStep(R, start, { solver });
        await clickEl('#hint-btn');
        assert.equal(await hidden('#hint-banner'), false);
        assert.equal(await count('#hint-banner .hint-tier'), 0, 'no badges, as in the other puzzles');
        assert.equal(await hasClass('#hint-banner', 'error'), false);
        const hintSays = await text('#hint-banner');
        assert.ok(hintSays.length > 20, 'the hint explains itself');
        assert.ok((await count('#board .sumbreak-hint-ring')) > 0, 'the hint highlights the pair');
        if (['lone', 'forced-pair'].includes(step.technique)) assert.match(hintSays, /\b(top|bottom|left|right) \d/, 'the two tiles of a pair are named by position');
        await refRingsMatch();
        assert.ok((await count('#board line.sumbreak-arrow.move')) > 0, 'the hint shows the merge');
        assert.equal(await count('#board line.sumbreak-arrow.refuted'), (step.eliminated || []).length ? 1 : 0, 'at most one failing merge is drawn');
        await shot('hint');
        await clickEl('#hint-btn');
        assert.equal(await hidden('#hint-banner'), true, 'pressing Hint again hides it');
        assert.equal(await count('#board .sumbreak-hint-ring'), 0);
        await clickEl('#hint-btn');
        await click(step.move.from); await click(step.move.to);
        await expectBoard(R.applyMerge(start, step.move), 'following the hint');
        assert.equal(await hidden('#hint-banner'), true, 'a merge clears the hint');
        await clickEl('#reset-btn');

        // A losing merge: nothing tells on it until the player asks; the hint explains why
        // and how far to go back.
        await click(losing.from); await click(losing.to);
        assert.equal(await hidden('#sumbreak-dead-pill'), true, 'a lost position with moves left is not announced');
        await clickEl('#hint-btn');
        assert.equal(await hasClass('#hint-banner', 'error'), true);
        assert.match(await text('#hint-banner'), /can no longer be solved/);
        assert.match(await text('#hint-banner'), /Undo the last merge to get back on track\./);
        await shot('lost-hint');
        await clickEl('#undo-btn');
        await expectBoard(start, 'undo back to the solvable start');
        assert.equal(await hidden('#hint-banner'), true);

        // ---------- dead end ----------
        let b = await play(dead, start);
        await expectBoard(b, 'dead-end line');
        assert.equal(await hidden('#sumbreak-dead-pill'), false);
        assert.equal(await text('#sumbreak-dead-pill'), 'No merges left');
        assert.match(await live(), /nothing can merge/);
        await shot('dead-end');
        await clickEl('#undo-btn');
        assert.equal(await hidden('#sumbreak-dead-pill'), true);
        await clickEl('#reset-btn');
        await expectBoard(start, 'reset after a dead end');

        // ---------- reveal: the remaining solution as numbered merges ----------
        await clickEl('#reveal-btn');
        assert.equal(await pressed('#reveal-btn'), 'true');
        assert.deepEqual(await revealNumbers(), solution.map((_, k) => k + 1), 'every remaining merge is numbered');
        await shot('reveal');
        await click(m0.from); await click(m0.to);
        assert.deepEqual(await revealNumbers(), solution.slice(1).map((_, k) => k + 1), 'the overlay follows the position');
        await clickEl('#undo-btn');
        await click(losing.from); await click(losing.to);
        assert.deepEqual(await revealNumbers(), [], 'nothing to draw once the position is lost');
        assert.equal(await text('#sumbreak-dead-pill'), 'No solution from here');
        await clickEl('#hint-btn');
        await clickEl('#reveal-btn');
        assert.equal(await pressed('#reveal-btn'), 'false');
        assert.equal(await hidden('#sumbreak-dead-pill'), true, 'the lost warning belongs to Reveal');
        assert.equal(await hidden('#hint-banner'), true, 'toggling Reveal hides the hint');
        assert.equal(await count('#board .sumbreak-reveal-badge'), 0);
        await clickEl('#reset-btn');

        // ---------- win, undo out of the win, new game ----------
        b = await play(solution, start);
        await expectBoard(b, 'solution replay');
        assert.equal(await hidden('#win-message'), false, 'You Win! in the status row');
        assert.equal(await live(), 'Solved! One tile left.');
        assert.equal(await hasClass('#board', 'won'), true);
        assert.equal(await disabled('#hint-btn'), true);
        assert.equal(await disabled('#reveal-btn'), true);
        await shot('win');
        await key('z', 2);
        assert.equal(await hidden('#win-message'), true, 'undo leaves the win state');
        assert.equal(await disabled('#hint-btn'), false);
        const fin = solution[solution.length - 1];
        await click(fin.to); await click(fin.from);
        assert.equal(await hidden('#win-message'), false, 'the final merge works in either direction');
        const beforeNew = workers();
        await clickEl('#new-game-btn');
        await waitFor(`document.getElementById('win-message').hidden && new URLSearchParams(location.search).get('seed') !== '${p.seed.toString(36)}'`, 'new game');
        await ready();
        const nextSeed = parseInt(await urlParam('seed'), 36);
        await expectBoard(R.parse(Gen.generate({ difficulty: p.difficulty, seed: nextSeed }).board), 'the new puzzle matches its shared seed');
        await until(() => workers() === beforeNew + 1, 'the following puzzle is prepared');
        await pause(300);
        assert.equal(workers(), beforeNew + 1, 'New Game takes the prepared puzzle instead of making one');

        // ---------- difficulty picks the board: hard is 4×4, started as soon as it is picked ----------
        const beforeHard = workers();
        await clickEl('#difficulty-seg [data-value="hard"]');
        await until(() => workers() === beforeHard + 1, 'picking Hard starts making a hard puzzle');
        await clickEl('#new-game-btn');
        await waitFor(`new URLSearchParams(location.search).get('diff') === 'hard'`, 'hard puzzle', 60000);
        await ready();
        const hardSeed = parseInt(await urlParam('seed'), 36);
        const hard = R.parse(Gen.generate({ difficulty: 'hard', seed: hardSeed }).board);
        await expectBoard(hard, 'hard puzzle matches its seed');
        assert.equal(await viewBox(), '0 0 440 440');
        assert.equal(await urlParam('size'), null, 'links carry difficulty and seed only');
        await until(() => workers() === beforeHard + 2, 'the next hard puzzle is prepared');
        await pause(300);
        assert.equal(workers(), beforeHard + 2, 'New Game waits for the hard puzzle already being made');

        // ---------- ×2 tiles: merge with any touching number, either way, and must be used ----------
        const { start: mulStart, into, onto } = mulPick, mulCell = into.to;
        let t0 = Date.now();
        await open(sumbreakPage('hard', mulPick.p.seed));
        await ready();
        const loadMs = Date.now() - t0;
        await expectBoard(mulStart, 'a hard puzzle with a ×2 tile matches its seed');
        assert.ok(loadMs < 3 * mulPick.ms + 3000, `a hard puzzle loads in time (${loadMs} ms, Node ${mulPick.ms} ms)`);
        await shot('mul');
        await evaluate('document.getElementById("board").focus()');
        await key('ArrowUp'); await cursorTo(mulCell);
        assert.match(await live(), /: ×2$/, 'the keyboard cursor reads out a ×2 tile');
        await click(into.from);
        assert.equal(await count('#board .sumbreak-target'), R.legalMoves(mulStart).filter((m) => m.from === into.from).length);
        await click(into.to);
        const source = mulStart.cells[into.from].value, intoBoard = R.applyMerge(mulStart, into);
        await expectBoard(intoBoard, 'a number dragged onto a ×2');
        assert.equal(intoBoard.cells[into.to].value, 2 * source, `${source} onto ×2 makes ${2 * source} in the ×2 cell`);
        assert.equal(await live(), `Merged into ${2 * source}.`);
        await clickEl('#undo-btn');
        await expectBoard(mulStart, 'undo a ×2 merge');
        await click(onto.from);
        assert.equal(await live(), 'Selected ×2. Tap a highlighted neighbour to merge into it.');
        const numberNeighbours = R.neighbors(mulStart, onto.from).filter((j) => mulStart.cells[j].type === 'num');
        assert.equal(await count('#board .sumbreak-target'), numberNeighbours.length, 'a ×2 can merge onto every touching number');
        await shot('mul-selected');
        await click(onto.to);
        const dest = mulStart.cells[onto.to].value, ontoBoard = R.applyMerge(mulStart, onto);
        await expectBoard(ontoBoard, 'a ×2 merged onto a number');
        assert.equal(ontoBoard.cells[onto.to].value, 2 * dest, `×2 onto ${dest} doubles it in place`);
        await clickEl('#reset-btn');
        t0 = Date.now();
        await clickEl('#hint-btn');
        const hintMs = Date.now() - t0;
        assert.equal(await hidden('#hint-banner'), false);
        assert.ok(hintMs < 3000, `a hard hint answers quickly (${hintMs} ms)`);
        await refRingsMatch();
        await shot('hint-mul');
        await clickEl('#hint-btn');
        t0 = Date.now();
        await clickEl('#reveal-btn');
        const revealMs = Date.now() - t0;
        assert.deepEqual(await revealNumbers(), Array.from({ length: 15 }, (_, k) => k + 1), 'a hard reveal numbers all 15 merges, ×2 tiles included');
        assert.ok(revealMs < 3000, `a hard reveal answers quickly (${revealMs} ms)`);
        await shot('reveal-mul');
        await clickEl('#reveal-btn');
        const mulWin = await play(mulPick.p.solution, mulStart);
        await expectBoard(mulWin, 'a solution using every ×2');
        assert.equal(await hidden('#win-message'), false, 'solved once the ×2 tiles are used up');
        noErrors('sumbreak ×2 tiles');

        // An old link with a board size opens the puzzle for its difficulty and seed, and the
        // size drops out of the address.
        await open(`/games/sumbreak.html?size=4&diff=easy&seed=${(12345).toString(36)}`);
        await ready();
        await expectBoard(R.parse(Gen.generate({ difficulty: 'easy', seed: 12345 }).board), 'an old link ignores its size');
        assert.equal(await urlParam('size'), null, 'the stale size is dropped from the address');
        assert.equal(await urlParam('seed'), (12345).toString(36));

        // The page was first games/fuse.html; that address forwards with its query and fragment.
        await cdp.send('Page.navigate', { url: base + `/games/fuse.html?diff=easy&seed=${(4321).toString(36)}#again` });
        const end = Date.now() + 15000;
        for (let at = null; at !== '/games/sumbreak.html#again'; await pause(40)) {
            if (Date.now() > end) throw new Error('Timed out waiting for the fuse.html redirect');
            try { at = await evaluate('location.pathname + location.hash'); } catch (_) { /* mid-navigation */ }
        }
        await ready();
        await expectBoard(R.parse(Gen.generate({ difficulty: 'easy', seed: 4321 }).board), 'the old address opens the same puzzle');
        assert.equal(await urlParam('seed'), (4321).toString(36));
        noErrors('the fuse.html redirect');

        // Without a worker (blocked here) puzzles are made on the main thread.
        blocked.add(WORKER);
        await open(sumbreakPage('easy', 777));
        await ready();
        await expectBoard(R.parse(Gen.generate({ difficulty: 'easy', seed: 777 }).board), 'a puzzle made without a worker');
        blocked.delete(WORKER);
        noErrors('sumbreak without a worker');
        await open(sumbreakPage(p.difficulty, p.seed));
        await ready();

        // ---------- language ----------
        assert.equal(await evaluate('document.title'), 'Sumbreak · GameBox');
        await clickEl('#lang-toggle [data-lang="zh"]');
        assert.equal(await text('.game-title'), 'Sumbreak', 'the name has no Chinese translation');
        assert.equal(await text('#reset-btn'), '重設');
        assert.equal(await text('#hint-btn'), '提示');
        assert.equal(await text('#reveal-btn'), '解答');
        await clickEl('#hint-btn');
        assert.match(await text('#hint-banner'), /[\u4e00-\u9fff]/);
        await shot('zh-hint');
        await clickEl('#lang-toggle [data-lang="en"]');
        assert.match(await text('#hint-banner'), /^[\x20-\x7e]+$/, 'the open hint follows the language');
        await clickEl('#lang-toggle [data-lang="zh"]');
        await open(sumbreakPage(p.difficulty, p.seed));
        await ready();
        await expectBoard(start, 'reload in Chinese');
        assert.equal(await text('#reset-btn'), '重設', 'game strings apply on a fresh load in Chinese');
        await play(dead, start);
        assert.equal(await text('#sumbreak-dead-pill'), '無法再合併');
        await clickEl('#lang-toggle [data-lang="en"]');
        assert.equal(await text('#sumbreak-dead-pill'), 'No merges left', 'the warning follows the language');
        noErrors('sumbreak desktop');

        // Reduced motion: merges apply without the sliding ghost, and nothing shakes.
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        await open(sumbreakPage(p.difficulty, p.seed));
        await ready();
        await expectBoard(start, 'reduced-motion start');
        await click(lonely);
        assert.equal(await count('#board .sumbreak-tile.nope'), 0);
        await click(m0.from); await click(m0.to);
        assert.equal(await count('#board .sumbreak-ghost'), 0);
        await expectBoard(after0, 'reduced-motion merge');
        await cdp.send('Emulation.setEmulatedMedia', { features: [] });
        noErrors('sumbreak reduced motion');

        // A plain visit starts at the shared default difficulty, medium.
        await open('/games/sumbreak.html');
        await ready();
        assert.equal(await urlParam('diff'), 'medium');
        assert.equal(await urlParam('size'), null);
        noErrors('sumbreak defaults');

        // ---------- mobile: touch, layout ----------
        for (const width of [375, 320]) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 740, deviceScaleFactor: 2, mobile: true });
            await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
            const fits = async (board, what) => {
                await evaluate('document.getElementById("board").scrollIntoView({ block: "center" })');
                const layout = await evaluate(`(() => {
                    const r = document.getElementById('board').getBoundingClientRect();
                    const bar = Math.max(...[...document.querySelectorAll('.game-topbar *')].map((e) => e.getBoundingClientRect().right));
                    return { overflow: document.documentElement.scrollWidth - innerWidth, inner: innerWidth, bar, width: r.width, left: r.left, right: r.right };
                })()`);
                assert.ok(layout.overflow <= 0, `no horizontal overflow at ${width}px, ${what} (${layout.overflow})`);
                assert.equal(layout.inner, width, `nothing widens the page past ${width}px, ${what}`);
                assert.ok(layout.bar <= width - 8, `the top bar fits at ${width}px (right edge ${Math.round(layout.bar)})`);
                assert.ok(layout.left >= 0 && layout.right <= width, `board fits at ${width}px, ${what}`);
                assert.ok((layout.width / (board.cols * 108 + 8)) * 100 >= 44, `cells stay at least 44px wide at ${width}px, ${what}`);
            };
            await open(sumbreakPage('hard', mulPick.p.seed));
            await ready();
            await fits(mulStart, '4×4');
            await shot('mobile-4x4-' + width);
            await open(sumbreakPage(p.difficulty, p.seed));
            await ready();
            await expectBoard(start, `mobile start at ${width}px`);
            await fits(start, `${start.rows}×${start.cols}`);
            await tapTouch(m0.from);
            assert.equal(await count('#board .sumbreak-tile.selected'), 1, 'touch selects');
            await shot('mobile-' + width);
            await tapTouch(m0.to);
            await expectBoard(after0, `touch tap-tap merge at ${width}px`);
            await dragTouch(m1.from, m1.to);
            await expectBoard(after1, `touch drag merge at ${width}px`);
            await clickEl('#undo-btn');
            await expectBoard(after0, 'undo on mobile');
            noErrors('sumbreak mobile ' + width);
        }
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
        await cdp.send('Emulation.clearDeviceMetricsOverride');

        // ---------- launcher card ----------
        await open('/index.html');
        await waitFor(`document.querySelector('a.game-card[href="./games/sumbreak.html"]')`, 'Sumbreak launcher card');
        const card = await evaluate(`(() => {
            const a = document.querySelector('a.game-card[href="./games/sumbreak.html"]');
            return { name: a.querySelector('.game-name').textContent, tagline: a.querySelector('.game-tagline').textContent,
                wip: !!a.querySelector('.badge-wip'), icon: !!a.querySelector('.game-icon svg') };
        })()`);
        assert.deepEqual(card, { name: 'Sumbreak', tagline: 'Pair them up. End with one.', wip: true, icon: true });
        noErrors('launcher');

        // ---------- other puzzle pages still load cleanly ----------
        for (const id of SMOKE) {
            await open(`/games/${id}.html`);
            await waitFor(`(() => { const b = document.querySelector('#board'); return !!b && (b.tagName === 'CANVAS' || b.childElementCount > 0); })()`, id + ' board', 20000);
            await pause(800);
            noErrors(id);
        }
        console.log(`sumbreak browser: ok (${p.difficulty} ${start.rows}×${start.cols} seed ${p.seed.toString(36)}, ${solution.length}-merge solution, ghost frames ${ghost}; ` +
            `hard ×2 seed ${mulPick.p.seed} load ${loadMs} ms (Node ${mulPick.ms} ms), hint ${hintMs} ms, reveal ${revealMs} ms; smoke ${SMOKE.length} pages)`);
        if (shots) console.log(shots.join('\n'));
    } finally {
        if (cdp) cdp.close();
        if (browser && browser.exitCode === null) { const stopped = new Promise((resolve) => browser.once('exit', resolve)); browser.kill(); await stopped; }
        await new Promise((resolve) => server.close(resolve));
        try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (_) { /* Chrome can briefly hold files */ }
    }
})().catch((err) => { console.error(err); process.exitCode = 1; });
