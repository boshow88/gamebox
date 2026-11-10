/** Real touch regression: node tools/unshackle-input-check.js <Chrome CDP WebSocket URL>.
 * Uses Node 22+ and an existing debugging browser. Serves only this checkout,
 * creates/closes its own browser tab, and never loads a production website. Add --dense for the 48-piece case only.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const endpoint = process.argv[2];
if (!endpoint || !/^wss?:\/\//.test(endpoint)) throw new Error('Pass the browser CDP WebSocket URL as the first argument');
const server = http.createServer((request, response) => {
    let file;
    try { file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://local').pathname)); }
    catch (_) { response.writeHead(400).end(); return; }
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(file, (error, content) => {
        if (error) { response.writeHead(404).end(); return; }
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(content);
    });
});
let socket, page, targetId, base, serial = 0;
const pending = new Map(), errors = [];
function call(method, params = {}, sessionId = page) {
    return new Promise((resolve, reject) => {
        const id = ++serial; pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
}
async function wait(expression, timeout = 20000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await evaluate(expression)) return; await pause(30); }
    throw new Error(`Timed out: ${expression}`);
}
async function open(query) {
    const params = new URLSearchParams(query), mode = params.get('mode') || 'classic', size = Number(params.get('size'));
    await createPage();
    await call('Page.navigate', { url: base + '/games/unshackle.html?' + query });
    await wait(`document.readyState==='complete'&&window.__inputState?.puzzle&&__inputState.mode===${JSON.stringify(mode)}&&__inputState.size===${size}&&!document.querySelector('#new-game-btn').disabled`);
    await call('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    // A navigation may still be restoring the previous document's scroll.
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await evaluate('document.querySelector("#board").scrollIntoView({block:"center"})');
    await evaluate('new Promise(requestAnimationFrame)');
}
async function touch(type, points = []) {
    await call('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({
        id: p.id || i + 1, x: p.x, y: p.y, radiusX: 10, radiusY: 10, force: 1
    })) });
}
async function findPoint(id, fuzzy = true) {
    return evaluate(`(()=>{
        const s=__inputState,v=__inputView,c=document.querySelector('#board');
        for(let turn=0;turn<24;turn++){
            v.render(s);const p=s.pieces[${id}-1],rect=c.getBoundingClientRect();
            const a=v.project(p.knob),b=v.project(UnshackleEngine.math.add(p.knob,p.dir));
            const dx=b.x-a.x,dy=b.y-a.y,spacing=Math.hypot(dx,dy);
            if(spacing<9){v.rotate(.23,.17);continue;}
            const segments=p.segments.slice().sort((a,b)=>Math.hypot(...UnshackleEngine.math.sub(b.b,b.a))-Math.hypot(...UnshackleEngine.math.sub(a.b,a.a))).slice(0,8),points=[];
            for(const segment of segments){const aa=v.project(segment.a),bb=v.project(segment.b),len=Math.hypot(bb.x-aa.x,bb.y-aa.y)||1;
                for(const t of [.2,.5,.8])for(const offset of (${fuzzy}?[12,-12,17,-17]:[0]))points.push({x:aa.x+(bb.x-aa.x)*t-(bb.y-aa.y)/len*offset,y:aa.y+(bb.y-aa.y)*t+(bb.x-aa.x)/len*offset});
            }
            const visible=v.pickMany(points,s);
            for(let k=0;k<points.length;k++){
                const q=points[k];if(${fuzzy}?visible[k]!==null:visible[k]!==${id})continue;
                if(q.x<10||q.x>rect.width-10||q.y<55||q.y>rect.height-20)continue;
                const end={x:rect.x+q.x+dx/spacing*90,y:rect.y+q.y+dy/spacing*90};
                if(end.x<5||end.x>innerWidth-5||end.y<5||end.y>innerHeight-5)continue;
                if(v.pickNear(q.x,q.y,s)===${id})return {x:rect.x+q.x,y:rect.y+q.y,dx,dy,spacing,exact:visible[k]};
            }
            v.rotate(.29,.17);
        }
        throw Error('No visible ${fuzzy ? 'nearby' : 'exact'} point for '+${id});
    })()`);
}
async function begin(id, fuzzy = true) {
    const p = await findPoint(id, fuzzy);
    await touch('touchStart', [p]);
    try { await wait('__inputState.grabbed != null', 3000); } catch(error) {
        console.error('Acquisition details:', await evaluate(`({point:${JSON.stringify(p)},size:__inputState.size,mode:__inputState.mode,events:window.__inputEvents,viewport:{scale:visualViewport.scale,x:visualViewport.offsetLeft,y:visualViewport.offsetTop},target:document.elementFromPoint(${p.x},${p.y})?.outerHTML,visibility:document.visibilityState})`)); throw error;
    }
    assert.equal(await evaluate('__inputState.grabbed'), id);
    const anchor = { x: p.x + p.dx / p.spacing * 10, y: p.y + p.dy / p.spacing * 10 };
    await touch('touchMove', [anchor]);
    await wait(`__inputState.drag?.id===${id}||__inputState.grabbed===null`, 2000);
    assert.equal(await evaluate('__inputState.drag?.id'), id, JSON.stringify(await evaluate('({grabbed:__inputState.grabbed,events:window.__inputEvents})')));
    return { ...anchor, dx: p.dx, dy: p.dy, spacing: p.spacing, id };
}
async function move(g, travel) { await touch('touchMove', [{ x: g.x + g.dx * travel, y: g.y + g.dy * travel }]); }
async function released() { await wait('__inputState.grabbed===null', 1000); }
async function remove(id, fuzzy = true) {
    const g = await begin(id, fuzzy); await move(g, Math.max(0.7, 64 / g.spacing));
    assert(await evaluate('__inputState.drag.extract')); const offset = await evaluate('__inputState.drag.offset');
    await touch('touchEnd'); await released();
    const from = await evaluate('__inputState.animation?.fromOffset');
    if (offset > 0.001) assert(Math.abs(from - offset) < 0.01, 'Extraction continues from the drag preview');
    await wait(`__inputState.removed.has(${id}) && !__inputState.animation`);
}
function hsl(rgb) {
    const hi = Math.max(...rgb), lo = Math.min(...rgb), d = hi - lo, l = (hi + lo) / 2;
    let h = 0;
    if (d) h = hi === rgb[0] ? ((rgb[1] - rgb[2]) / d + 6) % 6 : hi === rgb[1] ? (rgb[2] - rgb[0]) / d + 2 : (rgb[0] - rgb[1]) / d + 4;
    return { h: h * 60, s: d / (1 - Math.abs(2 * l - 1) || 1), l };
}
async function checkMaterials(id) {
    const record = await evaluate(`(()=>{__captureInputColours=true;__inputView.render(__inputState);return {colours:__inputColours,pieces:__inputState.pieces.filter(p=>!__inputState.removed.has(p.id)).map(p=>({id:p.id,rgb:p.color.match(/\\w\\w/g).map(v=>parseInt(v,16)/255)}))}})()`);
    assert.equal(record.colours.length, record.pieces.length * 2);
    for (const [i, piece] of record.pieces.entries()) {
        const actual = record.colours[i * 2];
        if (piece.id === id) {
            const before = hsl(piece.rgb), after = hsl(actual);
            if (before.s >= 0.06) {
                assert(after.s > before.s + 0.05); assert(Math.abs(after.l - before.l) < 0.001);
                const hueDelta = Math.abs(after.h - before.h); assert(Math.min(hueDelta, 360 - hueDelta) < 0.1);
            } else assert(after.l > before.l);
        } else actual.forEach((v, channel) => assert(Math.abs(v - piece.rgb[channel]) < 0.00001, 'Other parts keep their exact material colour'));
    }
}
async function undo() { await evaluate('document.querySelector("#undo-btn").click()'); await released(); }
async function checkButton(id) {
    const p = await evaluate(`(()=>{const b=document.querySelector('#piece-${id}');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await touch('touchStart', [p]);
    try { await wait('__inputState.grabbed != null', 3000); } catch(error) {
        console.error('Acquisition details:', await evaluate(`({point:${JSON.stringify(p)},size:__inputState.size,mode:__inputState.mode,events:window.__inputEvents,viewport:{scale:visualViewport.scale,x:visualViewport.offsetLeft,y:visualViewport.offsetTop},target:document.elementFromPoint(${p.x},${p.y})?.outerHTML,visibility:document.visibilityState})`)); throw error;
    }
    assert.equal(await evaluate('__inputState.grabbed'), id);
    await touch('touchEnd'); await released();
}
async function createPage() {
    // Give each navigation scenario a fresh target so emulated multi-touch
    // state cannot carry across documents.
    if (targetId) await call('Target.closeTarget', { targetId }, null);
    targetId = (await call('Target.createTarget', { url: 'about:blank' }, null)).targetId;
    page = (await call('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId;
    await call('Runtime.enable'); await call('Page.enable'); await call('Page.bringToFront');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    // Observe actual game/controller state and actual WebGL material uniforms.
    // This hook is injected only into our test tab; production exports no state.
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,e=>{(window.__inputEvents||=[]).push({type,x:e.clientX,y:e.clientY,id:e.pointerId,target:e.target.id,grabbed:window.__inputState?.grabbed,drag:window.__inputState?.drag});if(window.__inputEvents.length>8)window.__inputEvents.shift()});let api;Object.defineProperty(window,'UnshackleView',{configurable:true,get(){return api},set(value){api=value;const create=api.create;api.create=(canvas)=>{const view=create(canvas);if(!view)return view;const render=view.render;view.render=s=>{window.__inputState=s;window.__inputView=view;if(!window.__captureInputColours)return render(s);window.__captureInputColours=false;const gl=canvas.getContext('webgl'),draw=gl.drawArrays,colours=[];let location;gl.drawArrays=function(...args){location||=gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM),'uColor');colours.push(Array.from(gl.getUniform(gl.getParameter(gl.CURRENT_PROGRAM),location)));return draw.apply(gl,args)};try{return render(s)}finally{gl.drawArrays=draw;window.__inputColours=colours}};return view}}})})();` });
}
async function run() {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`;
    socket = new WebSocket(endpoint);
    socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.id) {
            const task = pending.get(message.id); pending.delete(message.id);
            if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
        } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    };
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });


    let id, p, g;
    if (!process.argv.includes('--dense')) {
        await open('size=12&diff=easy&seed=0');
        id = await evaluate('__inputState.puzzle.solution[0]');
        p = await findPoint(id);
        assert.equal(p.exact, null); await touch('touchStart', [p]);
        assert.equal(await evaluate('__inputState.grabbed'), id); await checkMaterials(id);
        assert.equal(await evaluate('__inputState.removed.size'), 0);
        await touch('touchEnd'); await released(); await wait(`__inputState.removed.has(${id})&&!__inputState.animation`);
        await undo(); assert.equal(await evaluate('__inputState.removed.size'), 0); await checkMaterials(null);
        await remove(id); await undo(); assert.equal(await evaluate('__inputState.removed.size'), 0);
        await checkButton(id); await wait(`__inputState.removed.has(${id})&&!__inputState.animation`); await undo();
        p = await findPoint(id); await touch('touchStart', [p]);
        await touch('touchMove', [{ x: p.x - p.dy / p.spacing * 15, y: p.y + p.dx / p.spacing * 15 }]); await released();
        await touch('touchMove', [{ x: p.x - p.dy / p.spacing * 35, y: p.y + p.dx / p.spacing * 35 }]); await touch('touchEnd');
        assert.equal(await evaluate('__inputState.removed.size'), 0); await checkMaterials(null);
        console.log('Classic: nearby tap, axial drag, numbered button, original-hue press-only saturation and undo passed.');

        await open('size=12&diff=easy&seed=0&mode=match&mv=3');
        id = await evaluate('__inputState.puzzle.solution[0]'); await remove(id);
        assert.equal(await evaluate('document.querySelectorAll("#match-slots .match-slot[data-return-id]").length'), 1);
        await evaluate(`document.querySelector('#match-slots [data-return-id="${id}"]').click()`);
        await wait(`!__inputState.removed.has(${id})&&!__inputState.animation`);
        await undo(); assert(await evaluate(`__inputState.removed.has(${id})`)); await undo(); assert.equal(await evaluate('__inputState.removed.size'), 0);
        p = await findPoint(id); await touch('touchStart', [p]); await checkMaterials(id); await touch('touchEnd'); await released();
        await wait(`__inputState.removed.has(${id})&&!__inputState.animation`); await undo();
        await checkButton(id); await wait(`__inputState.removed.has(${id})&&!__inputState.animation`); await undo();
        console.log('Match: nearby tap/drag, plate arrival, direct return, button and undo passed.');

        await open('size=12&diff=easy&seed=0&mode=free&fv=6');
        const relay = await evaluate('__inputState.puzzle.relays[0]');
        p = await findPoint(relay.a); await touch('touchStart', [p]); await checkMaterials(relay.a); await touch('touchEnd'); await released();
        assert(await evaluate('__inputState.positions.every(x=>x===0)')); await checkMaterials(null);
        g = await begin(relay.a); await move(g, relay.offset);
        assert.equal(await evaluate('__inputState.drag.extract'), false); await touch('touchEnd'); await released();
        const halfway = await evaluate(`__inputState.positions[${relay.a}-1]`); assert(Math.abs(halfway - relay.offset) < 0.01); await checkMaterials(null);
        await remove(relay.b); assert.equal(await evaluate(`__inputState.positions[${relay.a}-1]`), halfway);
        await remove(relay.c); await remove(relay.a);
        for (let i = 0; i < 4; i++) await undo();
        assert(await evaluate('__inputState.positions.every(x=>x===0)&&__inputState.removed.size===0'));
        console.log('Continuous: real nearby A-half/B/C/A solve, retained coordinates and complete undo passed.');

        for (const cancellation of ['touch', 'capture', 'escape', 'blur', 'reset']) {
            g = await begin(relay.a); await move(g, 0.25);
            if (cancellation === 'touch') await touch('touchCancel');
            else {
                if (cancellation === 'capture') {
                    await evaluate('document.querySelector("#board").releasePointerCapture(__inputEvents.findLast(e=>e.type==="pointerdown").id)');
                    await move(g, 0.35); await released();
                }
                if (cancellation === 'escape') await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
                if (cancellation === 'blur') await evaluate('window.dispatchEvent(new Event("blur"))');
                if (cancellation === 'reset') await evaluate('document.querySelector("#reset-btn").click()');
                await touch('touchCancel');
            }
            await released(); assert(await evaluate('__inputState.positions.every(x=>x===0)')); await checkMaterials(null);
        }
        g = await begin(relay.a); await move(g, 0.25);
        const p1 = { id: 1, x: g.x + g.dx * 0.25, y: g.y + g.dy * 0.25 }, p2 = { id: 2, x: g.x + 50, y: g.y + 30 };
        await touch('touchStart', [p1, p2]); await released(); assert.equal(await evaluate('__inputState.drag'), null);
        await touch('touchMove', [{ ...p1, x: p1.x - 10 }, { ...p2, x: p2.x + 10 }]); await touch('touchEnd');
        assert(await evaluate('__inputState.positions.every(x=>x===0)')); await checkMaterials(null);
        await checkButton(relay.a); assert(await evaluate('__inputState.positions.every(x=>x===0)')); await checkMaterials(null);
        console.log('Tap release, cancellation, Escape, blur, reset, pinch takeover and controls leave no stale highlight or unintended move.');

    }
    await open('size=48&diff=hard&seed=0&mode=free&fv=6');
    id = await evaluate('__inputState.puzzle.relays[0].a'); g = await begin(id); await checkMaterials(id); await touch('touchCancel'); await released();
    await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
    assert(await evaluate('document.documentElement.scrollWidth===innerWidth'));
    assert.equal(await evaluate('!!document.querySelector("#free-guide, #slide-pad")'), false);
    assert.deepEqual(errors, []);
    console.log('48-piece nearby acquisition, unchanged neighbour materials, 320px layout and no experimental controls passed. No browser exceptions.');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    if (targetId && socket?.readyState === WebSocket.OPEN) await call('Target.closeTarget', { targetId }, null).catch(() => {});
    socket?.close(); server.close();
});
