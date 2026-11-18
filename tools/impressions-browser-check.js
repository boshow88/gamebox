/** Real Chrome mouse/touch checks. Local files only; no Firebase, packages or production test hooks. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const Color = require('../js/games/impressions-color.js');
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2);
const chrome = args.find(arg => !arg.startsWith('--')) || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const instrument = source => {
    const boot = "create({ root: document.getElementById('impressions-game') });";
    assert(source.includes(boot), 'Missing controller bootstrap for test-only instrumentation');
    return source.replace(boot, "window.__impressionsTest = create({ root: document.getElementById('impressions-game'), config: " + (args.includes('--playtest-only') || args.includes('--focused-only') || args.includes('--challenge-only') || args.includes('--ux-local-only') ? '{}'  : "{ categoryMode: 'color', selectionVersion: 2 }") + ", now: () => window.__impressionsNow, seedSource: () => 42 + window.__impressionsSeeds++ });");
};
class Protocol {
    constructor(socket) {
        this.socket = socket; this.serial = 0; this.pending = new Map(); this.exceptions = [];
        socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data)), task = this.pending.get(message.id);
            if (message.method === 'Runtime.exceptionThrown') this.exceptions.push(message.params.exceptionDetails);
            if (!task) return;
            this.pending.delete(message.id); clearTimeout(task.timer);
            message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
        });
    }
    send(method, params = {}) {
        const id = ++this.serial;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 8000);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
    async evaluate(expression) {
        const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    }
    close() {
        for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(new Error('Browser closed')); }
        this.pending.clear(); this.socket.close();
    }
}
async function until(check, label, timeout = 10000) {
    const limit = Date.now() + timeout;
    while (Date.now() < limit) { if (await check()) return; await pause(40); }
    throw new Error('Timed out: ' + label);
}
(async () => {
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            response.writeHead(404); response.end(); return;
        }
        let body = fs.readFileSync(file, 'utf8');
        if (!args.includes('--challenge-only') && !args.includes('--ux-local-only') && !args.includes('--pitch-init-only') && file.endsWith('impressions-categories.js')) body=body.replace('input = input || {};','input = Object.assign({challengeVersion:0},input);');
        if (file.endsWith('impressions.js')) body = instrument(body);
        if (file.endsWith('impressions-audio.js')) body = require('./helpers/impressions-audio-probe.js').instrument(body);
        if (file.endsWith('impressions.html')) body = body.replace('<head>', '<head><script>window.__impressionsNow=1000;window.__impressionsSeeds=0;window.__pageErrors=[];addEventListener("error",e=>__pageErrors.push(e.message));addEventListener("unhandledrejection",e=>__pageErrors.push(String(e.reason)));</script>');
        const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript';
        response.writeHead(200, { 'Content-Type': type + ';charset=utf-8', 'Cache-Control': 'no-store' }); response.end(body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebox-impressions-browser-'));
    let browser, protocol, diagnostics = '', deadline;
    try {
        browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--disable-background-networking', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
            '--user-data-dir=' + profile, '--explicitly-allowed-ports=' + server.address().port, 'about:blank'], { windowsHide: true });
        browser.stderr.on('data', data => { diagnostics += data; });
        browser.on('error', error => { diagnostics += String(error); });
        deadline = setTimeout(() => browser.kill(), args.includes('--playtest-only') || args.includes('--focused-only') ? 240000 : 90000);
        const portFile = path.join(profile, 'DevToolsActivePort');
        let port;
        await until(() => {
            if (browser.exitCode !== null) throw new Error('Chrome exited before its debugger was ready');
            try {
                const lines = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
                if (/^\d+$/.test(lines[0]) && lines[1]?.startsWith('/devtools/browser/')) { port = lines[0]; return true; }
            } catch (error) {
                // Windows can expose the file before Chrome releases its write handle.
                if (!['ENOENT', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
            }
            return false;
        }, 'Chrome debugger');
        const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
        const target = targets.find(item => item.type === 'page'); assert(target, 'No Chrome page');
        const socket = new WebSocket(target.webSocketDebuggerUrl);
        await Promise.race([
            new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); }),
            pause(8000).then(() => { throw new Error('Chrome WebSocket did not open'); }),
        ]);
        protocol = new Protocol(socket);
        await protocol.send('Runtime.enable');
        const evaluate = expression => protocol.evaluate(expression);
        const snapshot = () => evaluate('__impressionsTest.snapshot()');
        const advance = stamp => evaluate(`window.__impressionsNow=${stamp};__impressionsTest.tick();__impressionsTest.snapshot()`);
        async function box(selector) {
            return evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};})()`);
        }
        async function click(selector) {
            const r = await box(selector);
            await protocol.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.cx, y: r.cy, button: 'left', clickCount: 1 });
            await protocol.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.cx, y: r.cy, button: 'left', clickCount: 1 });
        }
        async function setupAudio(){
            let s=await evaluate('__impressionsTest.audioReadiness()');
            if(s.confirmed&&s.usable)return;
            if(!s.tested){await click('#impressions-enable-audio');await until(()=>evaluate('!__impressionsTest.audioReadiness().busy'),'sound test settled');}
            s=await evaluate('__impressionsTest.audioReadiness()');if(s.tested&&s.usable)await click('#impressions-confirm-audio');
        }
        async function key(name, code = name) {
            await protocol.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code });
            await protocol.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code });
        }
        async function drag(selector, pixels, fine = false) {
            const r = await box(selector), modifiers = fine ? 8 : 0;
            await protocol.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.cx, y: r.cy, modifiers });
            await protocol.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.cx, y: r.cy, button: 'left', clickCount: 1, modifiers });
            await protocol.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.cx, y: r.cy - pixels, button: 'left', buttons: 1, modifiers });
            await protocol.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.cx, y: r.cy - pixels, button: 'left', clickCount: 1, modifiers });
        }
        async function touchDrag(selector, pixels, cancel = false) {
            const r = await box(selector), scroll = await evaluate('scrollY');
            await protocol.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.cx, y: r.cy, id: 1 }] });
            for (let i = 1; i <= 4; i++) {
                await protocol.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.cx, y: r.cy - pixels * i / 4, id: 1 }] });
                await pause(25);
            }
            await protocol.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
            assert.equal(await evaluate('scrollY'), scroll, 'Wheel touch must not scroll the page');
        }
        async function screenshot(name) {
            if (!args.includes('--screenshots')) return;
            const directory = path.join(root, '.cache'); fs.mkdirSync(directory, { recursive: true });
            await evaluate('window.scrollTo(0,0)');
            const shot = await protocol.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
            const file = path.join(directory, 'impressions-' + name + '.png'); fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
            console.log('Screenshot: ' + file);
        }
        async function copyFits() {
            assert(await evaluate(`(()=>{const header=document.querySelector('.impressions-phase-header').getBoundingClientRect();
                const message=document.querySelector('#impressions-phase-message').getBoundingClientRect();return message.bottom<=header.bottom;})()`),
            'Phase instructions must not overlap the stage');
        }
        if(args.includes('--ux-local-only')){await require('./helpers/impressions-ux-local-browser.js')({protocol,evaluate,snapshot,advance,click,key,setupAudio,screenshot,until,origin:'http://127.0.0.1:'+server.address().port});assert.deepEqual(protocol.exceptions,[]);return;}
        if(args.includes('--pitch-init-only')){for(const width of [1200,390,320]){await protocol.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});await protocol.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/tools/impressions-pitch-initialization.html'});await until(()=>evaluate('!!window.ImpressionsPitchInitTool'),'Pitch initialization tool');let s=await evaluate('ImpressionsPitchInitTool.snapshot()');assert(s.comparison.current.valid&&s.comparison.reference.valid);const initial=s.answers;await click('#fine');assert.deepEqual((await evaluate('ImpressionsPitchInitTool.snapshot()')).answers,initial);assert((await evaluate('ImpressionsPitchInitTool.snapshot()')).fine);const selector='#reference-mode .impressions-wheel';if(width<700)await touchDrag(selector,10);else await drag(selector,10);s=await evaluate('ImpressionsPitchInitTool.snapshot()');const id=s.question.tones.find(id=>!s.question.fixed.includes(id));assert(Math.abs(1200*Math.log2(s.answers[1][id]/initial[1][id])-5)<.001);await click('#sound');await until(()=>evaluate('document.getElementById("sound-status").textContent.includes("已啟用")'),'diagnostic audio');await click('#reference');assert.equal(await evaluate('typeof window.ArcadeNet'),'undefined');assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await screenshot('pitch-initialization-'+width);}assert.deepEqual(protocol.exceptions,[]);console.log('PASS: offline 1200/390/320px same-question initialization A/B, actual shared wheels/fine touch, unchanged mode values, Hz/cents and audio; no Firebase.');return;}
        if(args.includes('--cpu-tool-only')){for(const width of [1200,390,320]){await protocol.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});await protocol.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/tools/impressions-cpu.html'});await until(()=>evaluate('!!window.ImpressionsCpuTool'),'CPU diagnostic boot');await evaluate("document.getElementById('samples').value=10;document.getElementById('run').click()");await until(()=>evaluate('document.getElementById("status").textContent.startsWith("Completed")'),'CPU synthetic diagnostics');assert.equal((await evaluate('ImpressionsCpuTool.rows()')).length,60);assert.equal(await evaluate('typeof window.ArcadeNet'),'undefined');assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await screenshot('cpu-diagnostics-'+width);}assert.deepEqual(protocol.exceptions,[]);console.log('PASS: 1200/390/320px offline CPU diagnostics, 60 variant/stage/difficulty groups and export-ready statistics; no Firebase.');return;}
        if (args.includes('--challenge-only')) {await require('./helpers/impressions-challenge-browser.js')({protocol,evaluate,snapshot,advance,click,drag,touchDrag,key,screenshot,until,root,origin:'http://127.0.0.1:'+server.address().port});assert.deepEqual(protocol.exceptions,[]);return;}
        if (args.includes('--focused-only')) { await require('./helpers/impressions-focused-browser.js')({protocol,evaluate,snapshot,advance,click,drag,touchDrag,key,screenshot,until,root,origin:'http://127.0.0.1:'+server.address().port});assert.deepEqual(protocol.exceptions,[]);return; }
        if (args.includes('--playtest-only')) {
            const Analysis = require('./helpers/impressions-playtest-analysis.js'), recordedQuestions = [], baselineQuestions = [];
            const origin = 'http://127.0.0.1:' + server.address().port;
            const data = () => evaluate('ImpressionsPlaytestUI.current.data()');
            async function runRound(i, compare) {
                assert(await evaluate('__impressionsTest.start()')); let s = await snapshot();
                const canonical = { question: s.question, timeline: Object.fromEntries(Object.entries(s.timeline).map(([key, value]) => [key, value - s.timeline.startAt])) };
                if (compare) baselineQuestions.push(canonical); else recordedQuestions.push(canonical);
                if (!compare) assert.equal((await data()).rounds.length, i);
                await advance(s.timeline.memorizeAt); if (!compare) assert.equal((await data()).rounds.length, i, 'No active target can be exported');
                await advance(s.timeline.answerAt + 750);
                if (i % 3 === 2) await advance(s.timeline.deadline + 2000); else assert(await evaluate('__impressionsTest.submit()'));
                s = await snapshot(); assert.equal(s.phase, 'results');
                if (!compare) {
                    await until(async () => (await data()).rounds.length === i + 1, 'deferred completed observation');
                    const r = (await data()).rounds.at(-1), p = r.participants[0];
                    assert.equal(p.score, s.result.score); assert.equal(p.error, s.result.error); assert.equal(p.timedOut, i % 3 === 2); assert.equal(p.hpRemaining, null); assert.equal(p.damageTaken, null);
                    assert.equal(p.answerElapsedMs, i % 3 === 2 ? r.answerMs : 750); assert.equal(p.lateObservationMs, i % 3 === 2 ? 2000 : 0);
                }
                await advance(s.timeline.deadline + 4000);
            }
            let exportFile, exported;
            for (const viewport of [{width:1200,height:900,mobile:false},{width:390,height:844,mobile:true},{width:320,height:568,mobile:true}]) {
                await protocol.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});
                await protocol.send('Page.navigate',{url:origin+'/games/impressions.html?playtest=1'}); await until(()=>evaluate('!!window.__impressionsTest&&!!window.ImpressionsPlaytestUI?.current'),'playtest mount');
                assert.equal((await data()).rounds.length,0); assert.equal(await evaluate('ImpressionsPlaytestUI.current.status().enabled'),false);
                await evaluate("document.getElementById('impressions-playtest-source').value='automated';document.getElementById('impressions-playtest-source').dispatchEvent(new Event('change'))");
                for (const category of ['color','quantity','pitch','mixed']) {
                    await click('#impressions-playtest-'+category); if (category==='pitch') { await setupAudio(); assert(await evaluate('__impressionsTest.audioReady()')); }
                    const count=(await data()).rounds.length;
                    for(let round=0;round<12;round++) await runRound(count+round,false);
                    assert.equal(await evaluate('ImpressionsPlaytestUI.current.status().enabled'),false,'12-question practice preset pauses recording without altering the game');
                }
                const d=await data(); assert.equal(d.rounds.length,48); assert.deepEqual(d.sessions.map(s=>s.kind),['color-only','quantity-only','pitch-only','mixed']); assert(d.sessions.every(s=>s.status==='complete'));
                assert(d.rounds.filter(r=>r.category==='color').every(r=>r.variant==='single'&&r.questionVersion===3)); assert(d.rounds.filter(r=>r.category==='quantity').some(r=>r.variant!=='single')); assert(d.rounds.filter(r=>r.category==='pitch').every(r=>r.questionVersion===2));
                assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Debug controls fit narrow screens');
                Analysis.validate(d); assert.equal(Analysis.summarize([d]).rounds,0); assert.equal(Analysis.summarize([d],{source:'automated'}).rounds,48);
                if (viewport.width===1200) {
                    exported=d; const directory=path.join(root,'.cache','playtest-downloads');fs.mkdirSync(directory,{recursive:true});
                    await protocol.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:directory});
                    await click('#impressions-playtest-json');await click('#impressions-playtest-csv');exportFile=path.join(directory,d.recordingId+'.json');
                    await until(()=>fs.existsSync(exportFile)&&fs.existsSync(path.join(directory,d.recordingId+'.csv')),'JSON/CSV downloads');
                    assert.deepEqual(JSON.parse(fs.readFileSync(exportFile,'utf8')),d);assert.equal(fs.readFileSync(path.join(directory,d.recordingId+'.csv'),'utf8').trim().split('\r\n').length,49);
                }
                await screenshot('playtest-'+viewport.width); console.log('PASS: '+viewport.width+'px: four actual 12-question practice sessions, manual/timeout timing, all category variants, anonymous exports, hidden-target gate and auto-pause.');
                if(viewport.width===1200) {
                    await protocol.send('Page.navigate',{url:origin+'/games/impressions.html'});await until(()=>evaluate('!!window.__impressionsTest'),'normal page'); assert.equal(await evaluate('!!document.getElementById("impressions-playtest")'),false);
                    for(const category of ['color','quantity','pitch','mixed']) {
                        await evaluate(`__impressionsTest.setPracticeConfig({categoryMode:${JSON.stringify(category==='mixed'?'weighted':category)},selectionVersion:3,categoryWeights:ImpressionsProgression.preset(${JSON.stringify(category)})})`);
                        if(category==='pitch') {await setupAudio();assert(await evaluate('__impressionsTest.audioReady()'));}
                        for(let round=0;round<12;round++)await runRound(round,true);
                    }
                    assert.deepEqual(baselineQuestions,recordedQuestions,'Recording does not change randomness, adaptation or canonical durations');
                    await evaluate('__impressionsTest.setPlaytestObserver((type,event)=>{if(type==="round"){event.question.target=null;event.config.scoring.tolerance=999;event.participants[0].score=-1;}throw Error("diagnostic failure")});__impressionsTest.start();__impressionsNow=__impressionsTest.snapshot().timeline.deadline;__impressionsTest.tick();window.__beforeObserver=__impressionsTest.snapshot()');await pause(30);assert.deepEqual(await snapshot(),await evaluate('__beforeObserver'),'Observer mutation/failure cannot alter game state');
                }
            }
            await protocol.send('Page.navigate',{url:'file:///'+path.join(root,'tools','impressions-playtest.html').replace(/\\/g,'/')});await until(()=>evaluate('!!window.ImpressionsPlaytestAnalysis'),'offline report');
            const documentNode=await protocol.send('DOM.getDocument'),inputNode=await protocol.send('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'#files'});
            await protocol.send('DOM.setFileInputFiles',{nodeId:inputNode.nodeId,files:[exportFile]});await until(()=>evaluate('document.getElementById("status").textContent.includes("48 questions excluded")'),'default human filter');
            await evaluate("document.getElementById('source').value='automated';document.getElementById('source').dispatchEvent(new Event('change'))");
            assert(await evaluate('document.getElementById("status").textContent.includes("48 completed questions")'));assert(await evaluate('document.querySelectorAll("#histograms .histogram").length>3'));assert(await evaluate('document.querySelectorAll("#progression circle").length>0'));
            assert.equal(await evaluate('typeof window.ArcadeNet'),'undefined');assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Offline report fits 320px with scrollable tables');await screenshot('playtest-report');assert.deepEqual(protocol.exceptions,[]);
            assert.equal(Analysis.summarize([exported],{source:'automated'}).groups.find(g=>g.label==='color').knownTimeoutN,exported.rounds.filter(r=>r.category==='color').length);
            console.log('PASS: recording-on/off canonical questions and adaptation agree, observer failures cannot interrupt gameplay, native JSON/CSV downloads and file:// descriptive report/source filters work without Firebase.');return;
        }
        if (args.includes('--color-layout-only')) {
            await protocol.send('Emulation.setDeviceMetricsOverride',{width:320,height:568,mobile:true,deviceScaleFactor:1});await protocol.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/games/impressions.html'});await until(()=>evaluate('!!window.__impressionsTest'),'Color layout boot');
            await evaluate(`(()=>{const roster={a:{id:'a',type:'human',controllerId:'a'},b:{id:'b',type:'human',controllerId:'b'}},w={single:0,hue2:0,hue3:0,hue4:1};window.__layoutGame=ImpressionsMatch.create(roster,['a','b'],{categoryMode:'color',color:{variantSelectionVersion:1,weights:{easy:w,hard:w}}},42,1000,'layout');__impressionsTest.setShared({game:__layoutGame,participantId:'a',now:()=>__impressionsNow,connected:true,onSubmit:()=>{}});__impressionsNow=__layoutGame.timeline.answerAt+100;__impressionsTest.tick();__impressionsTest.reveal();})()`);
            console.log(await evaluate(`JSON.stringify(Object.fromEntries(['.impressions-phase-header','#impressions-modern-palette','#impressions-hsl-wheels','#impressions-action','.impressions-display','.impressions-workspace'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return[selector,{top:r.top,bottom:r.bottom,height:r.height}];})))`));
            await evaluate('scrollTo(0,document.documentElement.scrollHeight);__impressionsTest.reveal()');assert(await evaluate('(()=>{const r=document.getElementById("impressions-modern-palette").getBoundingClientRect(),a=document.getElementById("impressions-action").getBoundingClientRect();return r.top>=80&&r.bottom<=innerHeight&&a.top>=0&&a.bottom<=innerHeight})()'),'Revealing after result scrolling restores both palette and submit');
            const shot=await protocol.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(root,'.cache','impressions-color-mobile-layout.png'),Buffer.from(shot.data,'base64'));console.log(await evaluate('JSON.stringify(window.__pageErrors)'));return;
        }
        if (args.includes('--color-variants-only') || args.includes('--color-tool-only')) {
            const H = require('../js/games/impressions-color-variants.js');
            async function setModern(answer, variant) { for (const [id, value] of Object.entries(answer)) {
                if (variant === 'hue4') await click('#impressions-color-select-' + id);
                const selector = variant === 'single' ? '#impressions-wheel-hsl-' + id + ' .impressions-wheel' : variant === 'hue4' ? '#impressions-wheel-hue .impressions-wheel' : '#impressions-wheel-hue-' + id + ' .impressions-wheel';
                await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),u=Math.round(${value}*100);e.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));for(let i=0;i<Math.floor(u/1500);i++)e.dispatchEvent(new KeyboardEvent('keydown',{key:'PageUp',bubbles:true}));for(let i=0;i<Math.floor(u%1500/100);i++)e.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));for(let i=0;i<u%100;i++)e.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',shiftKey:true,bubbles:true}));})()`);
            } }
            for (const viewport of args.includes('--color-tool-only') ? [] : [{width:1200,height:900,mobile:false},{width:390,height:844,mobile:true},{width:320,height:568,mobile:true}]) for (const variant of H.variants) {
                await protocol.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1}); await protocol.send('Emulation.setTouchEmulationEnabled',{enabled:viewport.mobile,maxTouchPoints:1});
                await protocol.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/games/impressions.html'});await until(()=>evaluate('!!window.__impressionsTest'),'Color boot');
                const weights=Object.fromEntries(H.variants.map(id=>[id,id===variant?1:0]));
                await evaluate(`ArcadeCommon.i18n.setLocale('en');__impressionsTest.setPracticeConfig({selectionVersion:3,categoryMode:'color',categoryWeights:{color:2,quantity:0,pitch:0},adaptive:{enabled:true,initial:5,jitter:0},color:{variantSelectionVersion:1,weights:{easy:${JSON.stringify(weights)},hard:${JSON.stringify(weights)}}}})`);
                await click('#impressions-action');let s=await snapshot();assert.equal(s.question.variant,variant);assert.equal(s.question.version,2);
                await advance(s.timeline.memorizeAt);const memory=await evaluate('Array.from(document.querySelectorAll("#impressions-modern-palette .impressions-color-card"),e=>e.style.backgroundColor)');assert.equal(memory.length,variant==='single'?1:Number(variant.at(-1)));
                assert.equal(await evaluate('document.getElementById("impressions-color-rms").textContent'),'');assert.equal(await evaluate('document.getElementById("impressions-color-error-rows").children.length'),0);
                await advance(s.timeline.answerAt);const initial=variant==='single'?{h:180,s:50,l:50}:Object.fromEntries(s.question.swatches.map(id=>[id,180]));assert.deepEqual((await snapshot()).draft,initial);
                const wheel=variant==='single'?'#impressions-wheel-hsl-h .impressions-wheel':variant==='hue4'?'#impressions-wheel-hue .impressions-wheel':'#impressions-wheel-hue-a .impressions-wheel';
                await evaluate(`document.querySelector(${JSON.stringify(wheel)}).focus()`);await key('Home');await key('ArrowDown');assert.equal(Object.values((await snapshot()).draft)[0],359);await key('ArrowUp');assert.equal(Object.values((await snapshot()).draft)[0],0);
                await evaluate(`document.querySelector(${JSON.stringify(wheel)}).dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',shiftKey:true,bubbles:true}))`);assert.equal(Object.values((await snapshot()).draft)[0],359.99);
                if(viewport.mobile)await touchDrag(wheel,15,true);else await drag(wheel,15);assert(Math.abs(Object.values((await snapshot()).draft)[0]-11.99)<0.001);assert.deepEqual(Object.values((await snapshot()).draft).slice(1),Object.values(initial).slice(1));
                if(variant==='hue4'){await click('#impressions-color-select-d');await key('ArrowUp');assert.equal((await snapshot()).draft.d,181);await click('#impressions-color-select-a');assert.equal((await snapshot()).draft.a,11.99);}
                await setModern(H.targetAnswer(s.question),variant);assert.deepEqual((await snapshot()).draft,H.targetAnswer(s.question));assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("#impressions-modern-palette .impressions-color-card"),e=>e.style.backgroundColor)'),memory);
                assert(await evaluate('Array.from(document.querySelectorAll("#impressions-hsl-wheels .impressions-wheel"),e=>e.getBoundingClientRect()).every(r=>r.width>=60&&r.left>=0&&r.right<=innerWidth)'));
                if(variant==='hue4')assert.equal(await evaluate('document.querySelectorAll("#impressions-hsl-wheels .impressions-wheel").length'),1);
                assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await screenshot('color-'+variant+'-'+viewport.width+'-answer');
                await click('#impressions-action');s=await snapshot();assert.equal(s.result.score,100);assert.deepEqual(s.answer,H.targetAnswer(s.question));assert.equal(await evaluate('document.getElementById("impressions-modern-color-comparison").hidden'),false);await screenshot('color-'+variant+'-'+viewport.width+'-results');
                await advance(s.timeline.deadline+1000);await click('#impressions-action');s=await snapshot();await advance(s.timeline.answerAt);await advance(s.timeline.deadline);s=await snapshot();assert.equal(s.reason,'timeout');assert.deepEqual(s.answer,initial);assert.equal(s.result.score,H.grade(s.question,s.answer).score);const result=s.result;await advance(s.timeline.deadline+10000);assert.deepEqual((await snapshot()).result,result);
                await evaluate("ArcadeCommon.i18n.setLocale('zh')");assert.equal(await evaluate('document.getElementById("impressions-action").textContent'),'下一回合');assert.deepEqual(await evaluate('window.__pageErrors'),[]);await evaluate('__impressionsTest.destroy()');
                console.log('PASS: '+variant+' '+viewport.width+'px: circular/decimal native keys and '+(viewport.mobile?'touch':'mouse')+', independent state, selection retention, exact palette/V3, locking, timeout, results, locale and teardown.');
            }
            await protocol.send('Page.navigate',{url:'file:///'+path.join(root,'tools','impressions-color-variants.html').replace(/\\/g,'/')});await until(()=>evaluate('!!window.ImpressionsColorVariantsTool'),'Color diagnostic file boot');
            for(const variant of H.variants){await evaluate(`document.getElementById('variant').value=${JSON.stringify(variant)};document.getElementById('generate').click()`);assert.equal(await evaluate('document.getElementById("error").textContent'),'');await click('[data-case="exact"]');assert.equal((await evaluate('ImpressionsColorVariantsTool.snapshot()')).grade.score,100);await click('[data-case="boundary"]');assert((await evaluate('ImpressionsColorVariantsTool.snapshot()')).grade.score>98);for(const score of ['90','80','70']){await click('[data-case="'+score+'"]');assert(Math.abs((await evaluate('ImpressionsColorVariantsTool.snapshot()')).grade.score-Number(score))<1);}}
            await screenshot('hsl-hue-calibration');assert.deepEqual(protocol.exceptions,[]);console.log('PASS: standalone offline Color diagnostics: all variants, exact/boundary and actual 90/80/70 examples.');return;
        }
        if (args.includes('--groups-only')) {
            const Groups = require('../js/games/impressions-quantity-groups.js');
            const geometry = (host = 'group-preview') => evaluate(`Object.fromEntries(Array.from(document.querySelectorAll('#impressions-${host} g[data-group]')).map(g=>[g.dataset.group,Array.from(g.children).map(e=>[e.tagName,...Array.from(e.attributes).map(a=>a.name+'='+a.value).sort()])]))`);
            async function setCounts(answer) { await evaluate(`(()=>{for(const [id,value] of Object.entries(${JSON.stringify(answer)})){const e=document.querySelector('#impressions-wheel-group-'+id+' .impressions-wheel');for(const key of ['Home',...Array(Math.floor(value/25)).fill('PageUp'),...Array(value%25).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));}})()`); }
            for (const viewport of [{ width: 1200, height: 900, mobile: false }, { width: 390, height: 844, mobile: true }, { width: 320, height: 568, mobile: true }]) for (const variant of ['multi2', 'multi3']) {
                await protocol.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 }); await protocol.send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile, maxTouchPoints: 1 });
                await protocol.send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/games/impressions.html' }); await until(() => evaluate('!!window.__impressionsTest'), 'group practice boot');
                const weights = Object.fromEntries(['single', 'multi2', 'multi3'].map(id => [id, id === variant ? 1 : 0]));
                await evaluate(`ArcadeCommon.i18n.setLocale('en');__impressionsTest.setPracticeConfig({selectionVersion:3,categoryMode:'quantity',categoryWeights:{color:0,quantity:2,pitch:0},adaptive:{enabled:true,initial:${variant === 'multi2' ? 5 : 3},jitter:0},quantity:{variantSelectionVersion:1,multi:{weights:{easy:${JSON.stringify(weights)},hard:${JSON.stringify(weights)}}}}})`);
                await click('#impressions-action'); let state = await snapshot(); assert.equal(state.question.variant, variant); assert.equal(state.question.version, 2);
                assert.equal(await evaluate('document.querySelectorAll("#impressions-group-result-rows tr").length'), 0);
                await advance(state.timeline.memorizeAt); const original = await geometry(), ids = state.question.groups.map(group => group.id);
                ids.forEach(id => assert.equal(original[id].length, state.question.target[id]));
                const board = await evaluate('(()=>{const r=document.getElementById("impressions-group-preview").getBoundingClientRect();return {width:r.width,height:r.height}})()'); assert(Math.abs(board.width / board.height - 4 / 3) < 0.02);
                await advance(state.timeline.answerAt); assert.equal(await evaluate('document.querySelectorAll("#impressions-group-wheels [role=spinbutton]").length'), ids.length);
                const initial = await geometry(); ids.forEach(id => assert.deepEqual(initial[id], original[id].slice(0, initial[id].length)));
                await setCounts(state.question.target); assert.deepEqual(await geometry(), original, 'All exact counts recreate the entire memorized board');
                assert.deepEqual(await evaluate('(()=>{const r=document.getElementById("impressions-group-preview").getBoundingClientRect();return {width:r.width,height:r.height}})()'), board);
                await evaluate('window.__groupNodes=Object.fromEntries(Array.from(document.querySelectorAll("#impressions-group-preview g")).map(g=>[g.dataset.group,Array.from(g.children)]))');
                const first = '#impressions-wheel-group-circle .impressions-wheel'; await evaluate(`document.querySelector(${JSON.stringify(first)}).focus()`); await key('ArrowUp');
                let changed = await geometry(); assert.deepEqual(changed.circle.slice(0, original.circle.length), original.circle); ids.slice(1).forEach(id => assert.deepEqual(changed[id], original[id]));
                assert(await evaluate('Array.from(document.querySelectorAll("#impressions-group-preview g")).every(g=>__groupNodes[g.dataset.group].every((node,i)=>node===g.children[i]))'));
                await key('ArrowDown'); await key('ArrowDown'); changed = await geometry(); assert.deepEqual(changed.circle, original.circle.slice(0, -1)); ids.slice(1).forEach(id => assert.deepEqual(changed[id], original[id])); await key('ArrowUp'); assert.deepEqual(await geometry(), original);
                await key('Home'); if (viewport.mobile) await touchDrag(first, 15, true); else await drag(first, 15); assert.equal((await snapshot()).draft.circle, 20); await key('ArrowUp'); assert.equal((await snapshot()).draft.circle, 21);
                const maximum = state.question.parameters.generation.poolSize; await setCounts(Object.fromEntries(ids.map(id => [id, maximum])));
                assert.equal(Object.values(await geometry()).flat().length, maximum * ids.length);
                assert(await evaluate('(()=>{const boxes=Array.from(document.querySelectorAll("#impressions-group-preview g > *")).map(e=>e.getBBox());return boxes.every((a,i)=>a.x>=0&&a.y>=0&&a.x+a.width<=400&&a.y+a.height<=300&&boxes.slice(0,i).every(b=>a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y));})()'), 'Actual maximum-density SVG bounds are disjoint');
                assert.equal(await evaluate('document.querySelectorAll("#impressions-group-result-rows tr, #impressions-group-preview [data-target], #impressions-group-preview [data-index]").length'), 0);
                await screenshot('groups-' + variant + '-' + viewport.width + '-maximum');
                const answer = { ...state.question.target, circle: Math.round(state.question.target.circle * 1.25) }; await setCounts(answer); await click('#impressions-action'); state = await snapshot();
                assert.equal(state.result.score, Groups.grade(state.question, answer, {}, state.question.parameters.generation).score); assert(state.result.score < 100); assert.deepEqual(await geometry('group-target'), original);
                const submitted = await geometry('group-answer'); ids.slice(1).forEach(id => assert.deepEqual(submitted[id], original[id]));
                assert.equal(await evaluate('document.getElementById("impressions-group-result-rows").children.length'), ids.length); await screenshot('groups-' + variant + '-' + viewport.width + '-results');
                await advance(state.timeline.deadline + 1000); await click('#impressions-action'); state = await snapshot(); assert.equal(await evaluate('document.getElementById("impressions-group-result-rows").children.length'), 0);
                await advance(state.timeline.answerAt); await setCounts(Object.fromEntries(ids.map(id => [id, 0]))); await advance(state.timeline.deadline); const expired = await snapshot(); assert.equal(expired.reason, 'timeout'); assert.deepEqual(expired.answer, Object.fromEntries(ids.map(id => [id, 0]))); await advance(state.timeline.deadline + 1000); assert.deepEqual((await snapshot()).result, expired.result);
                assert(await evaluate('document.documentElement.scrollWidth<=innerWidth')); await evaluate("ArcadeCommon.i18n.setLocale('zh')"); assert.deepEqual(await evaluate('window.__pageErrors'), []); await evaluate('__impressionsTest.destroy()');
                console.log('PASS: ' + variant + ' ' + viewport.width + 'px: exact shared geometry/colors/shapes, independent prefix nodes, native coarse/fine input, maximum-density bounds, hidden counts, keyed locking/timeout and result errors.');
            }
            await protocol.send('Page.navigate', { url: 'file:///' + path.join(root, 'tools', 'impressions-quantity-groups.html').replace(/\\/g, '/') }); await until(() => evaluate('!!window.ImpressionsQuantityGroupsTool'), 'group diagnostics boot');await evaluate("document.getElementById('appearance').value='2';document.getElementById('generate').click()");
            for (const variant of ['single', 'multi2', 'multi3']) {
                await evaluate(`document.getElementById('variant').value='${variant}';document.getElementById('generate').click()`); let state = await evaluate('ImpressionsQuantityGroupsTool.snapshot()'); assert.equal(state.question.variant, variant); assert.equal(state.grade.score, 100);
                await evaluate('document.querySelector("[data-action=plus]").click()'); assert((await evaluate('ImpressionsQuantityGroupsTool.snapshot()')).grade.score < 100);
                await evaluate('document.querySelector("[data-action=exact]").click()'); assert.equal((await evaluate('ImpressionsQuantityGroupsTool.snapshot()')).grade.score, 100);
                await evaluate('document.querySelector("[data-action=max]").click()'); assert(Number.isFinite((await evaluate('ImpressionsQuantityGroupsTool.snapshot()')).grade.score));
            }
            assert.equal(await evaluate('typeof window.ArcadeNet'), 'undefined'); assert(await evaluate('document.documentElement.scrollWidth<=innerWidth')); await screenshot('quantity-group-diagnostics'); assert.deepEqual(protocol.exceptions, []);
            console.log('PASS: standalone visual diagnostics for single/two/three groups, partial error, exact restore and maximum density with the actual game functions.'); return;
        }
        if (args.includes('--weighted-only')) {
            for (const viewport of [{ width: 1200, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
                await protocol.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 700 });
                await protocol.send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/games/impressions.html' }); await until(() => evaluate('!!window.__impressionsTest'), 'weighted practice boot');
                await evaluate("__impressionsTest.setPracticeConfig({selectionVersion:3,categoryMode:'weighted',categoryWeights:{color:2,quantity:2,pitch:2},adaptive:{enabled:true,initial:5}});ArcadeCommon.i18n.setLocale('en');document.getElementById('impressions-practice-settings').open=true");
                async function weight(id, value) { await evaluate(`(()=>{const e=document.getElementById('impressions-local-weight-${id}');e.value=${value};e.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
                await weight('color', 4); await weight('quantity', 2); await weight('pitch', 1);
                assert.deepEqual(await evaluate("['color','quantity','pitch'].map(id=>document.getElementById('impressions-local-probability-'+id).textContent)"), ['57%', '29%', '14%']);
                for (const id of ['color', 'quantity', 'pitch']) await weight(id, 0);
                assert.equal(await evaluate('document.getElementById("impressions-action").disabled'), true); assert(await evaluate('document.getElementById("impressions-local-frequency-note").textContent.includes("at least one")'));
                assert.equal(await evaluate('document.getElementById("impressions-local-audio").hidden'), true);
                for (const id of ['color', 'quantity', 'pitch']) await weight(id, 2);
                await setupAudio(); await until(() => evaluate('__impressionsTest.audioReady()'), 'weighted sound ready');
                const counts = { color: 0, quantity: 0, pitch: 0 };
                for (let round = 1; round <= 12; round++) {
                    await click('#impressions-action'); let state = await snapshot(); counts[state.question.type]++;
                    const frozen = structuredClone(state.question); assert.equal(await evaluate('document.getElementById("impressions-local-weight-color").disabled'), true);
                    await advance(state.timeline.answerAt + 10);
                    const q = state.question, answer = q.target;
                    await evaluate(`(()=>{const type=${JSON.stringify(q.type)},answer=${JSON.stringify(answer)};const set=(selector,value,step)=>{const e=document.querySelector(selector);for(const key of ['Home',...Array(Math.floor(value/step)).fill('PageUp'),...Array(value%step).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));};if(type==='color')answer.forEach((n,i)=>set('#impressions-wheel-'+['r','g','b'][i]+' .impressions-wheel',n,16));else if(type==='quantity'){if(typeof answer==='object')Object.entries(answer).forEach(([id,n])=>set('#impressions-wheel-group-'+id+' .impressions-wheel',n,25));else set('#impressions-wheel-quantity .impressions-wheel',answer,25);}else answer.forEach((hz,i)=>{if(i)set('#impressions-wheel-pitch-'+i+' .impressions-wheel',Math.round(ImpressionsPitch.hzToCents(hz)),100);});})()`);
                    await click('#impressions-action'); state = await snapshot(); assert.equal(state.result.score, 100); assert.deepEqual(state.question, frozen);
                    await advance(state.timeline.deadline + 1000);
                }
                assert.deepEqual(counts, { color: 4, quantity: 4, pitch: 4 }); assert.deepEqual((await snapshot()).progression.difficultyState.difficultyByType, { color: 6, quantity: 6, pitch: 6 });
                assert(await evaluate('document.documentElement.scrollWidth<=innerWidth')); await screenshot('weighted-practice-' + viewport.width);
                await evaluate('__impressionsTest.destroy()'); console.log('PASS: weighted local ' + viewport.width + 'px: probabilities/all-Off/audio gate, twelve real category rounds, frozen parameters and independent gradual difficulty.');
            }
            await protocol.send('Page.navigate', { url: 'file:///' + path.join(root, 'tools', 'impressions-difficulty.html').replace(/\\/g, '/') }); await until(() => evaluate('!!window.ImpressionsDifficultyTool'), 'standalone difficulty tool');
            await evaluate("document.getElementById('policy').value='legacy';document.getElementById('weight-color').value=4;document.getElementById('weight-quantity').value=0;document.getElementById('weight-pitch').value=0;document.getElementById('reset').click();document.getElementById('high').click()");
            const high = await evaluate('ImpressionsDifficultyTool.snapshot()'); assert.equal(high.progression.difficultyState.difficultyByType.color, 10); assert.equal(high.progression.difficultyState.difficultyByType.quantity, 5);
            await evaluate("document.getElementById('reset').click();document.getElementById('high').click()"); assert.deepEqual(await evaluate('ImpressionsDifficultyTool.snapshot()'), high);
            await evaluate("document.getElementById('reset').click();document.getElementById('low').click()"); assert.equal(await evaluate('ImpressionsDifficultyTool.snapshot().progression.difficultyState.difficultyByType.color'), 1);
            await evaluate("document.getElementById('reset').click();document.getElementById('missing').click()"); assert.equal(await evaluate('ImpressionsDifficultyTool.snapshot().progression.difficultyState.historyByType.color.length'), 0);
            await evaluate("document.querySelector('[data-score=\"0\"]').click()"); assert.deepEqual(await evaluate('ImpressionsDifficultyTool.snapshot().progression.difficultyState.historyByType.color[0].scores'), [0]);
            await evaluate("document.getElementById('weight-color').value=0;document.getElementById('reset').click()"); assert.equal(await evaluate('document.getElementById("high").disabled'), true);
            assert.equal(await evaluate('typeof window.ArcadeNet'), 'undefined'); assert(await evaluate('document.documentElement.scrollWidth<=innerWidth')); await screenshot('difficulty-simulator');
            console.log('PASS: standalone difficulty simulator: deterministic reset/sequences, high/low clamps, independent histories, accepted-zero versus missing and all-Off validation; no Firebase.'); return;
        }
        if (args.includes('--pitch-variations-only')) {
            const V=require('../js/games/impressions-pitch-variations.js'),Pitch=require('../js/games/impressions-pitch.js');
            const cases=[[3,1,0],[3,1,1],[4,1,3],[4,2,0],[5,1,2],[5,2,0]];
            function settings(n,refs){const lengths={n3:n===3?1:0,n4:n===4?1:0,n5:n===5?1:0},references={one:refs===1?1:0,two:refs===2?1:0};return{lengths:{easy:lengths,hard:lengths},references:{easy:references,hard:references}};}
            async function select(index){await click('#impressions-pitch-tones button[data-tone="'+index+'"]');}
            async function exact(q){for(let i=0;i<q.tones.length;i++){if(q.fixed.includes(q.tones[i]))continue;if(q.tones.length===5)await select(i);const selector=q.tones.length===5?'#impressions-wheel-pitch-shared .impressions-wheel':'#impressions-wheel-pitch-'+i+' .impressions-wheel',cents=Math.round(Pitch.hzToCents(q.target[q.tones[i]]));await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),n=${cents};for(const key of ['Home',...Array(Math.floor(n/100)).fill('PageUp'),...Array(n%100).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));})()`);}}
            for(const viewport of [{width:1200,height:900,mobile:false},{width:390,height:844,mobile:true},{width:320,height:568,mobile:true}])for(const [n,refs,position] of cases){
                const config=settings(n,refs);let seed=0;while(seed<1000){const v=V.select(seed,5,config).variation;if(v.fixedIndices.length===refs&&(refs===2||v.fixedIndices[0]===position))break;seed++;}assert(seed<1000);
                await protocol.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});await protocol.send('Emulation.setTouchEmulationEnabled',{enabled:viewport.mobile,maxTouchPoints:1});await protocol.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/games/impressions.html'});await until(()=>evaluate('!!window.__impressionsTest'),'varied Pitch boot');
                await evaluate(`ArcadeCommon.i18n.setLocale('en');__impressionsTest.setPracticeConfig({selectionVersion:3,categoryMode:'pitch',categoryWeights:{color:0,quantity:0,pitch:2},adaptive:{initial:5,jitter:0},pitch:{variantSelectionVersion:1,variations:${JSON.stringify(config)}}})`);
                assert(await evaluate('document.getElementById("impressions-action").disabled'));await setupAudio();await until(()=>evaluate('__impressionsTest.audioReady()'),'varied real AudioContext');await evaluate('__impressionsTest.start('+seed+')');let s=await snapshot(),q=s.question;assert.equal(q.version,2);assert.equal(q.tones.length,n);assert.equal(q.fixed.length,refs);q.tones.forEach(id=>assert.equal(s.draft[id],q.fixed.includes(id)?q.target[id]:440));
                const before=await evaluate('__impressionsAudioProbe[0].notes.length');await advance(s.timeline.memorizeAt);assert.equal((await snapshot()).audio.scheduled,n*2);for(let i=0;i<4;i++)await evaluate('__impressionsTest.tick()');assert.equal(await evaluate('__impressionsAudioProbe[0].notes.length'),before+n*2);
                const plan=await evaluate(`__impressionsAudioProbe[0].notes.slice(${before}).map(e=>({start:e.start,stop:e.stop}))`);assert.equal(plan.length,n*2);assert(plan.every(note=>Math.abs(note.stop-note.start-0.55)<0.001));assert(plan.at(-1).stop-plan[0].start+0.55<=(s.timeline.answerAt-s.timeline.memorizeAt)/1000);
                await advance(s.timeline.answerAt);assert.equal((await snapshot()).audio.playing,false);assert.equal(await evaluate('document.getElementById("impressions-pitch-result-rows").children.length'),0);assert(await evaluate('document.getElementById("impressions-pitch-original").hidden'));
                assert.equal(await evaluate('document.querySelectorAll("#impressions-pitch-tones button").length'),n);assert.equal(await evaluate('document.querySelectorAll("#impressions-pitch-tones .locked").length'),refs);assert.equal(await evaluate('document.querySelectorAll("#impressions-pitch-wheels [role=spinbutton]").length'),n===5?1:n-refs);
                const locked=q.variation.fixedIndices[0],adjustable=q.tones.findIndex(id=>!q.fixed.includes(id)),wheel=n===5?'#impressions-wheel-pitch-shared .impressions-wheel':'#impressions-wheel-pitch-'+adjustable+' .impressions-wheel';
                await select(locked);assert.equal((await snapshot()).audio.source,'tone:'+locked);assert.equal(await evaluate('document.getElementById("impressions-wheel-pitch-'+locked+'")'),null);
                await evaluate('document.getElementById("impressions-pitch-original").click()');assert.notEqual((await snapshot()).audio.source,'original');if(n===5)await select(adjustable);
                await evaluate('document.querySelector('+JSON.stringify(wheel)+').focus()');await key('ArrowUp');assert(Math.abs(Pitch.hzToCents((await snapshot()).draft[q.tones[adjustable]])-1201)<1e-5);if(viewport.mobile)await touchDrag(wheel,10,true);else await drag(wheel,10);assert(Math.abs(Pitch.hzToCents((await snapshot()).draft[q.tones[adjustable]])-1301)<1e-5);
                if(!viewport.mobile){await drag(wheel,6,true);assert(Math.abs(Pitch.hzToCents((await snapshot()).draft[q.tones[adjustable]])-1304)<1e-5);}
                const afterWheel=(await snapshot()).draft;q.tones.filter(id=>id!==q.tones[adjustable]).forEach(id=>assert.equal(afterWheel[id],q.fixed.includes(id)?q.target[id]:440));
                if(n===5){const saved=(await snapshot()).draft[q.tones[adjustable]],other=q.tones.findIndex((id,i)=>i!==adjustable&&!q.fixed.includes(id));await select(other);await key('ArrowUp');assert(Math.abs(Pitch.hzToCents((await snapshot()).draft[q.tones[other]])-1201)<1e-5);await select(adjustable);assert.equal((await snapshot()).draft[q.tones[adjustable]],saved);}
                await click('#impressions-pitch-play');assert.equal((await snapshot()).audio.scheduled,n);await click('#impressions-pitch-stop');assert(!(await snapshot()).audio.playing);
                await evaluate('__impressionsAudioProbe[0].context.suspend()');await evaluate('__impressionsTest.tick()');await setupAudio();await until(()=>evaluate('__impressionsTest.audioReady()'),'varied audio resume');assert.equal((await snapshot()).audio.source,null,'Automatic recovery does not replay the target or a new test tone');
                await exact(q);assert.deepEqual((await snapshot()).draft,q.target);assert(await evaluate('Array.from(document.querySelectorAll("#impressions-pitch-wheels .impressions-wheel"),e=>e.getBoundingClientRect()).every(r=>r.width>=60&&r.left>=0&&r.right<=innerWidth)'));assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await screenshot('pitch-varied-'+n+'-'+refs+'-'+position+'-'+viewport.width+'-answer');
                await click('#impressions-action');s=await snapshot();assert.equal(s.result.score,100);assert(!(await snapshot()).audio.playing);assert.equal(await evaluate('document.getElementById("impressions-pitch-result-rows").children.length'),n);
                const errorCells=await evaluate('Array.from(document.querySelectorAll("#impressions-pitch-result-rows tr"),r=>r.lastElementChild.textContent)');q.tones.forEach((id,i)=>assert.equal(errorCells[i],q.fixed.includes(id)?'—':'0.0'));
                await click('#impressions-pitch-original');assert.equal((await snapshot()).audio.source,'original');await click('#impressions-pitch-play');assert.equal((await snapshot()).audio.source,'answer');await evaluate('document.dispatchEvent(new Event("freeze"))');assert(!(await snapshot()).audio.playing);await screenshot('pitch-varied-'+n+'-'+refs+'-'+position+'-'+viewport.width+'-results');
                await advance(s.timeline.deadline+1000);await evaluate('__impressionsTest.start('+seed+')');s=await snapshot();await advance(s.timeline.answerAt-100);assert.equal((await snapshot()).audio.scheduled,0);await advance(s.timeline.answerAt);await click('#impressions-pitch-play');await advance(s.timeline.deadline);s=await snapshot();assert.equal(s.reason,'timeout');assert.equal(s.result.score,V.grade(s.question,s.answer,{},s.question.parameters.generation).score);assert(!s.audio.playing);await evaluate("ArcadeCommon.i18n.setLocale('zh')");assert.equal(await evaluate('document.getElementById("impressions-action").textContent'),'下一回合');assert.deepEqual(await evaluate('window.__pageErrors'),[]);await evaluate('__impressionsTest.destroy()');assert.equal(await evaluate('__impressionsAudioProbe[0].context.state'),'closed');
                console.log('PASS: varied Pitch '+n+' tones/'+refs+' references at '+position+', '+viewport.width+'px: real full audio plan, reference privacy, stable shared selection, native fine/coarse input, exact RMS, lock/timeout, result playback and teardown.');
            }
            const pcm=await evaluate(`(async()=>{const c=new OfflineAudioContext(1,9*48000,48000),audio=ImpressionsAudio.create({contextFactory:()=>({state:'running',currentTime:0,destination:c.destination,resume:()=>Promise.resolve(),close:()=>Promise.resolve(),createOscillator:()=>c.createOscillator(),createGain:()=>c.createGain()})});await audio.enable();audio.play([330,440,550,660,770],{},{});const b=(await c.startRendering()).getChannelData(0);return{peak:b.reduce((m,v)=>Math.max(m,Math.abs(v)),0),rms:Math.sqrt(b.reduce((s,v)=>s+v*v,0)/b.length),lastToneRms:Math.sqrt(b.slice(7*48000,7.4*48000).reduce((s,v)=>s+v*v,0)/(0.4*48000)),tail:b.at(-1)}})()`);assert(pcm.peak<=0.101&&pcm.rms>0.02&&pcm.lastToneRms>0.02&&pcm.tail===0);console.log('PASS: actual five-tone/two-repeat OfflineAudioContext PCM includes the final note with bounded amplitude/silent tail; no human listening claim.');
            await protocol.send('Page.navigate',{url:'file:///'+path.join(root,'tools','impressions-pitch-variations.html').replace(/\\/g,'/')});await until(()=>evaluate('!!window.ImpressionsPitchVariationsTool'),'offline Pitch variation tool');await evaluate("document.getElementById('policy').value='legacy';document.getElementById('policy').dispatchEvent(new Event('change'))");
            for(const [n,refs] of [[3,1],[4,1],[4,2],[5,1],[5,2]]){await evaluate(`document.getElementById('count').value=${n};document.getElementById('refs').value=${refs};document.getElementById('position').value='last';document.getElementById('generate').click()`);assert.equal(await evaluate('document.getElementById("error").textContent'),'');await click('[data-action="exact"]');assert.equal((await evaluate('ImpressionsPitchVariationsTool.snapshot()')).grade.score,100);await click('[data-action="100"]');const sample=await evaluate('ImpressionsPitchVariationsTool.snapshot()');assert(sample.grade.score<100);assert.equal(sample.question.fixed.length,refs);assert.equal(sample.audio.length,n*2);}
            await click('#enable');await click('#original');await click('#stop-all');await screenshot('pitch-variation-calibration');assert.equal(await evaluate('typeof window.ArcadeNet'),'undefined');assert.deepEqual(protocol.exceptions,[]);console.log('PASS: offline Pitch diagnostics cover all lengths/reference counts, actual generation/grading, exact/partial examples and real listening controls without Firebase.');return;
        }
        if (args.includes('--pitch-only')) {
            const Pitch = require('../js/games/impressions-pitch.js');
            for (const viewport of [{ name: 'desktop', width: 1200, height: 900, mobile: false }, { name: 'mobile', width: 390, height: 844, mobile: true }, { name: 'small-mobile', width: 320, height: 568, mobile: true }]) {
                await protocol.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
                await protocol.send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile, maxTouchPoints: 1 });
                await protocol.send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/games/impressions.html' });
                await until(() => evaluate('!!window.__impressionsTest'), 'Pitch boot'); await evaluate("ArcadeCommon.i18n.setLocale('en');document.getElementById('impressions-local-category').value='pitch';document.getElementById('impressions-local-category').dispatchEvent(new Event('change',{bubbles:true}))");
                assert.equal(await evaluate('document.getElementById("impressions-action").disabled'), true);
                await setupAudio(); await until(() => evaluate('__impressionsTest.audioReady()'), 'real AudioContext running');
                await click('#impressions-action'); let state = await snapshot(), target = state.question.target;
                assert.equal(state.question.type, 'pitch'); assert.equal(state.draft[0], target[0]); assert.deepEqual(state.draft.slice(1), [440, 440, 440]);
                assert.equal(state.timeline.answerAt - state.timeline.memorizeAt, 8000); assert.equal(state.timeline.deadline - state.timeline.answerAt, 35000);
                const before = await evaluate('__impressionsAudioProbe[0].notes.length');
                await advance(state.timeline.memorizeAt); assert.equal((await snapshot()).audio.scheduled, 8);
                for (let i = 0; i < 5; i++) await evaluate('__impressionsTest.tick()');
                assert.equal(await evaluate('__impressionsAudioProbe[0].notes.length'), before + 8, 'Snapshots/ticks do not restart the target');
                await pause(350); await evaluate('__impressionsTest.tick()'); assert(await evaluate('!!document.querySelector(".impressions-tone.playing")'));
                await advance(state.timeline.answerAt); assert.equal((await snapshot()).audio.playing, false);
                assert.equal(await evaluate('document.querySelectorAll("#impressions-pitch-wheels [role=spinbutton]").length'), 3);
                assert.equal(await evaluate('document.getElementById("impressions-wheel-pitch-0")'), null);
                assert.equal(await evaluate('document.getElementById("impressions-pitch-result-rows").children.length'), 0);
                assert.equal(await evaluate('document.getElementById("impressions-pitch-original").hidden'), true);
                await evaluate('document.getElementById("impressions-pitch-original").click()'); assert.notEqual((await snapshot()).audio.source, 'original');
                const wheel = '#impressions-wheel-pitch-1 .impressions-wheel'; await evaluate(`document.querySelector(${JSON.stringify(wheel)}).focus()`); await key('ArrowUp');
                assert(Math.abs(Pitch.hzToCents((await snapshot()).draft[1]) - 1201) < 0.00001);
                await key('PageUp'); assert(Math.abs(Pitch.hzToCents((await snapshot()).draft[1]) - 1301) < 0.00001);
                if (viewport.mobile) await touchDrag(wheel, 40); else await drag(wheel, 40);
                assert(Math.abs(Pitch.hzToCents((await snapshot()).draft[1]) - 1701) < 0.00001);
                if (!viewport.mobile) { await drag(wheel, 6, true); assert(Math.abs(Pitch.hzToCents((await snapshot()).draft[1]) - 1704) < 0.00001); }
                await click('#impressions-pitch-tones button'); assert.equal((await snapshot()).audio.source, 'tone:0');
                await click('#impressions-pitch-play'); assert.equal((await snapshot()).audio.scheduled, 4); await click('#impressions-pitch-stop'); assert.equal((await snapshot()).audio.playing, false);
                await evaluate('__impressionsAudioProbe[0].context.suspend()'); await evaluate('__impressionsTest.tick()'); assert.equal((await snapshot()).audio.ready, false);
                await setupAudio(); await until(() => evaluate('__impressionsTest.audioReady()'), 'interrupted audio resumed by gesture'); assert.equal((await snapshot()).audio.source, null, 'Automatic recovery preserves confirmation without replay');
                await evaluate('for(let i=0;i<12;i++)document.getElementById("impressions-pitch-play").click()'); assert.equal((await snapshot()).audio.voices, 4, 'Replacement leaves one scheduled sequence');
                await screenshot('pitch-' + viewport.name + '-answer');
                await evaluate(`(()=>{for(let i=1;i<${target.length};i++){const e=document.querySelector('#impressions-wheel-pitch-'+i+' .impressions-wheel'),n=Math.round(ImpressionsPitch.hzToCents(${JSON.stringify(target)}[i]));for(const key of ['Home',...Array(Math.floor(n/100)).fill('PageUp'),...Array(n%100).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));}})()`);
                await click('#impressions-action'); state = await snapshot(); assert.equal(state.result.score, 100); assert.equal(state.audio.playing, false);
                assert.equal(await evaluate('document.getElementById("impressions-pitch-result-rows").children.length'), 4);
                await click('#impressions-pitch-original'); assert.equal((await snapshot()).audio.source, 'original');
                await click('#impressions-pitch-play'); assert.equal((await snapshot()).audio.source, 'answer');
                await evaluate('document.dispatchEvent(new Event("freeze"))'); assert.equal((await snapshot()).audio.playing, false);
                await screenshot('pitch-' + viewport.name + '-results');
                await advance(state.timeline.deadline + 1000); await click('#impressions-action'); state = await snapshot();
                await advance(state.timeline.answerAt - 100); assert.equal((await snapshot()).audio.scheduled, 0, 'Late clients do not get a fresh target replay');
                await advance(state.timeline.answerAt); await click('#impressions-pitch-play'); await advance(state.timeline.deadline); assert.equal((await snapshot()).audio.playing, false);
                await click('#impressions-pitch-play'); await evaluate('dispatchEvent(new Event("pagehide"))'); assert.equal((await snapshot()).audio.playing, false);
                assert(await evaluate('document.documentElement.scrollWidth<=innerWidth')); assert.deepEqual(await evaluate('window.__pageErrors'), []);
                await evaluate('__impressionsTest.destroy()'); assert.equal(await evaluate('__impressionsAudioProbe[0].context.state'), 'closed');
                console.log('PASS: Pitch ' + viewport.name + ': real Web Audio readiness/scheduling, one-cent/coarse input, reference lock, previews/replacement/stop, exact RMS results, deadline/freeze/navigation cleanup and late-target suppression.');
            }
            await protocol.send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/games/impressions.html' }); await until(() => evaluate('!!window.__impressionsTest'), 'audio failure boot');
            await evaluate("window.AudioContext=class {constructor(){throw new Error('Audio disabled')}};document.getElementById('impressions-local-category').value='pitch';document.getElementById('impressions-local-category').dispatchEvent(new Event('change',{bubbles:true}))");
            await setupAudio(); assert.equal(await evaluate('document.getElementById("impressions-action").disabled'), true); assert(await evaluate('document.getElementById("impressions-local-audio-status").textContent.includes("Audio unavailable")'));
            const rendered = await evaluate(`(async()=>{const offline=new OfflineAudioContext(1,96000,48000),audio=ImpressionsAudio.create({contextFactory:()=>({state:'running',currentTime:0,destination:offline.destination,resume:()=>Promise.resolve(),close:()=>Promise.resolve(),createOscillator:()=>offline.createOscillator(),createGain:()=>offline.createGain()})});await audio.enable();audio.play([440,660],{leadMs:0},{repeats:1});const samples=(await offline.startRendering()).getChannelData(0);return {peak:Math.max(...samples),rms:Math.sqrt(samples.reduce((s,n)=>s+n*n,0)/samples.length),first:samples[0],tail:samples.at(-1)}})()`);
            assert(rendered.peak <= 0.101 && rendered.rms > 0.02); assert.equal(rendered.first, 0); assert.equal(rendered.tail, 0);
            console.log('PASS: clear audio failure gate and real OfflineAudioContext PCM with bounded amplitude, non-silent tones and silent start/tail. No human listening test.');
            await protocol.send('Page.navigate', { url: 'file:///' + path.join(root, 'games', 'impressions.html').replace(/\\/g, '/') });
            await until(() => evaluate('!!window.ImpressionsGame'), 'standalone Pitch boot'); await evaluate("document.getElementById('impressions-local-category').value='pitch';document.getElementById('impressions-local-category').dispatchEvent(new Event('change',{bubbles:true}))");
            await click('#impressions-enable-audio');await until(()=>evaluate('!document.getElementById("impressions-confirm-audio").disabled'),'standalone test playback');await click('#impressions-confirm-audio');await until(() => evaluate('!document.getElementById("impressions-action").disabled'), 'standalone sound ready'); await click('#impressions-action');
            await until(() => evaluate('document.getElementById("impressions-game").dataset.phase==="answer"'), 'real canonical Pitch schedule', 15000);
            const liveToneCount=await evaluate('document.querySelectorAll("#impressions-pitch-tones button").length');await click('#impressions-pitch-play'); await click('#impressions-action'); assert.equal(await evaluate('document.getElementById("impressions-pitch-result-rows").children.length'), liveToneCount);
            assert.equal(await evaluate('typeof window.ArcadeNet'), 'undefined'); assert.deepEqual(protocol.exceptions, []);
            console.log('PASS: uninstrumented file:// Pitch page, actual canonical phase timing, native sound activation/playback, submitted results and no Firebase/runtime errors.'); return;
        }
        if (args.includes('--quantity-only')) {
            const Quantity = require('../js/games/impressions-quantity.js');
            const selector = '#impressions-wheel-quantity .impressions-wheel';
            const dots = () => evaluate('Array.from(document.querySelectorAll("#impressions-dot-preview circle")).map(e=>[e.getAttribute("cx"),e.getAttribute("cy"),e.getAttribute("r")])');
            async function count(value) {
                await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`); await key('Home');
                for (let i = 0; i < Math.floor(value / 25); i++) await key('PageUp');
                for (let i = 0; i < value % 25; i++) await key('ArrowUp');
                assert.equal((await snapshot()).draft, value);
            }
            async function mode(value) {
                await evaluate(`document.getElementById('impressions-local-category').value=${JSON.stringify(value)};document.getElementById('impressions-local-category').dispatchEvent(new Event('change',{bubbles:true}))`);
            }
            for (const viewport of [{ name: 'desktop', width: 1200, height: 900, mobile: false },
                { name: 'mobile', width: 390, height: 844, mobile: true }, { name: 'small-mobile', width: 320, height: 568, mobile: true }]) {
                await protocol.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
                await protocol.send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile, maxTouchPoints: 1 });
                await protocol.send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/games/impressions.html' });
                await until(() => evaluate('!!window.__impressionsTest'), 'Quantity page boot'); await evaluate("ArcadeCommon.i18n.setLocale('en')");
                await mode('quantity'); assert.equal((await snapshot()).categoryMode, 'quantity');
                assert.equal(await evaluate('document.querySelector("#impressions-wheel-quantity [role=spinbutton]").getAttribute("aria-valuemax")'), '220');
                assert(await evaluate('Array.from(document.querySelectorAll("#impressions-wheel-quantity .impressions-wheel-belt span")).every(e=>!e.textContent)'));
                await click('#impressions-action'); let state = await snapshot(); assert.equal(state.question.type, 'quantity'); assert.equal(state.draft, 15);
                assert.equal((await dots()).length, 0); assert.equal(await evaluate('document.getElementById("impressions-target-count").textContent'), '');
                await advance(state.timeline.memorizeAt); const targetDots = await dots(); assert.equal(targetDots.length, state.question.target);
                await evaluate('window.__memorizedDotNodes=Array.from(document.querySelectorAll("#impressions-dot-preview circle"))');
                const board = await evaluate('(()=>{const r=document.getElementById("impressions-dot-preview").getBoundingClientRect();return {width:r.width,height:r.height}})()');
                assert(Math.abs(board.width / board.height - 4 / 3) < 0.02);
                assert.equal(await evaluate('document.getElementById("impressions-target-count").textContent'), '');
                assert.equal(await evaluate('document.getElementById("impressions-local-category").disabled'), true);
                await advance(state.timeline.answerAt); assert.equal((await dots()).length, 15);
                assert.deepEqual(await dots(), targetDots.slice(0, 15), 'The initial answer is the memorized pool prefix');
                assert(await evaluate('Array.from(document.querySelectorAll("#impressions-dot-preview circle")).every((e,i)=>e===__memorizedDotNodes[i])'), 'Changing phase retains prefix nodes');
                assert.deepEqual(await evaluate('(()=>{const r=document.getElementById("impressions-dot-preview").getBoundingClientRect();return {width:r.width,height:r.height}})()'), board, 'Answer scale matches memorization');
                assert.equal(await evaluate('document.querySelectorAll("#impressions-target-dots circle").length'), 0);
                assert.equal(await evaluate('document.getElementById("impressions-target-hex").textContent'), '');
                await count(state.question.target); assert.deepEqual(await dots(), targetDots, 'An exact count recreates memorization');
                await evaluate('window.__exactDotNodes=Array.from(document.querySelectorAll("#impressions-dot-preview circle"))');
                await key('ArrowUp'); assert.deepEqual((await dots()).slice(0, state.question.target), targetDots);
                assert(await evaluate('window.__exactDotNodes.every((e,i)=>e===document.querySelectorAll("#impressions-dot-preview circle")[i])'), 'Increment adds only a tail node');
                await key('ArrowDown'); assert.deepEqual(await dots(), targetDots);
                await key('ArrowDown'); assert.deepEqual(await dots(), targetDots.slice(0, -1));
                assert(await evaluate('Array.from(document.querySelectorAll("#impressions-dot-preview circle")).every((e,i)=>e===__exactDotNodes[i])'), 'Decrement removes only the last node');
                await key('ArrowUp'); assert.deepEqual(await dots(), targetDots);
                assert.equal(await evaluate('document.getElementById("impressions-target-count").textContent'), '');
                assert.equal(await evaluate('document.querySelectorAll("#impressions-dot-preview circle[style], #impressions-dot-preview circle[class], #impressions-dot-preview circle[data-target]").length'), 0, 'No target-dependent dot markers while answering');
                await count(80); const first80 = await dots(); await key('ArrowUp'); assert.equal((await dots()).length, 81);
                assert.deepEqual((await dots()).slice(0, 80), first80); await key('ArrowDown'); assert.deepEqual(await dots(), first80);
                await count(15);
                if (viewport.mobile) await touchDrag(selector, 101.25); else await drag(selector, 101.25);
                assert.equal((await snapshot()).draft, 150, 'One roughly 100px gesture reaches 150 from 15');
                await count(96); await key('ArrowUp'); assert.equal((await snapshot()).draft, 97); await key('ArrowUp'); assert.equal((await snapshot()).draft, 98);
                if (viewport.mobile) {
                    await count(25); await touchDrag(selector, 7.5, true); assert.equal((await snapshot()).draft, 35);
                    await touchDrag(selector, 0.75); assert.equal((await snapshot()).draft, 36);
                } else {
                    const r = await box(selector);
                    await protocol.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.cx, y: r.cy, deltaX: 0, deltaY: -3 });
                    await pause(60); assert.equal((await snapshot()).draft, 99);
                }
                assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
                await screenshot('quantity-' + viewport.name + '-answer');
                await count(0); await click('#impressions-action'); state = await snapshot();
                assert.equal(state.answer, 0); assert.equal(state.result.score, Quantity.grade(state.question.target, 0).score);
                assert.equal(await evaluate('document.getElementById("impressions-answer-count").textContent'), '0');
                assert.equal(await evaluate('document.querySelectorAll("#impressions-target-dots circle").length'), state.question.target);
                assert.equal(await evaluate('document.querySelectorAll("#impressions-answer-dots circle").length'), 0);
                await key('End'); assert.equal((await snapshot()).answer, 0);
                await screenshot('quantity-' + viewport.name + '-results');
                await advance(state.timeline.deadline + 1000); await click('#impressions-action'); state = await snapshot();
                assert.equal(state.draft, 15); assert.equal(await evaluate('document.getElementById("impressions-target-count").textContent'), '');
                await advance(state.timeline.deadline); state = await snapshot(); assert.equal(state.reason, 'timeout'); assert.equal(state.answer, 15);
                const result = state.result; await advance(state.timeline.deadline + 1000); assert.deepEqual((await snapshot()).result, result);
                await mode('mixed'); assert.equal((await snapshot()).phase, 'idle'); await setupAudio(); await until(() => evaluate('__impressionsTest.audioReady()'), 'mixed audio ready'); await click('#impressions-action'); state = await snapshot();
                assert.equal(state.question.type, 'color'); await advance(state.timeline.answerAt); await click('#impressions-action'); state = await snapshot();
                assert.equal(state.result.score, Color.grade(state.question.target, state.answer).score);
                await advance(state.timeline.deadline + 1000); await click('#impressions-action'); state = await snapshot();
                assert.equal(state.question.type, 'quantity'); assert.equal(state.draft, 15); await advance(state.timeline.answerAt);
                await mode('color'); assert.equal((await snapshot()).categoryMode, 'mixed', 'Active category changes are rejected');
                await count(state.question.target); const exactDots = await dots(); await click('#impressions-action'); assert.equal((await snapshot()).result.score, 100);
                const comparison = await evaluate('Array.from(document.querySelectorAll("#impressions-target-dots circle")).map(e=>[e.getAttribute("cx"),e.getAttribute("cy"),e.getAttribute("r")])');
                assert.deepEqual(comparison, exactDots);
                assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("#impressions-answer-dots circle")).map(e=>[e.getAttribute("cx"),e.getAttribute("cy"),e.getAttribute("r")])'), comparison, 'Exact results align dot for dot');
                await evaluate("ArcadeCommon.i18n.setLocale('zh')"); assert.equal(await evaluate('document.getElementById("impressions-title").textContent'), '數量記憶');
                assert.deepEqual(await evaluate('window.__pageErrors'), []); await evaluate('__impressionsTest.destroy()');
                console.log('PASS: Quantity ' + viewport.name + ': shared memorization/answer pool and scale, exact result alignment, stable prefix nodes/restoration, hidden target, native fast/fine input, touch cancellation, zero locking, timeout, repeated/mixed rounds, localization and teardown.');
            }
            await protocol.send('Page.navigate', { url: 'file:///' + path.join(root, 'games', 'impressions.html').replace(/\\/g, '/') });
            await until(() => evaluate('!!window.ImpressionsGame'), 'standalone Quantity boot');
            await mode('quantity'); await click('#impressions-action');
            await until(() => evaluate('document.getElementById("impressions-game").dataset.phase === "answer"'), 'real Quantity 3s/4s phases', 12000);
            const multi = await evaluate('document.getElementById("impressions-game").dataset.quantityVariant!=="single"');
            if (multi) { const ids = await evaluate('Array.from(document.querySelectorAll("#impressions-group-wheels .impressions-wheel")).map(e=>e.parentElement.id)'); for (const id of ids) { await evaluate(`document.querySelector('#${id} .impressions-wheel').focus()`); await key('Home'); } }
            else { await evaluate('document.querySelector("#impressions-wheel-quantity .impressions-wheel").focus()'); await key('Home'); }
            await click('#impressions-action');
            assert(multi ? await evaluate('Array.from(document.querySelectorAll("#impressions-group-result-rows tr")).every(row=>row.children[2].textContent==="0")') : await evaluate('document.getElementById("impressions-answer-count").textContent==="0"'));
            assert.equal(await evaluate('typeof window.ArcadeNet'), 'undefined'); assert.deepEqual(protocol.exceptions, []);
            console.log('PASS: uninstrumented file:// Quantity, actual phase timers, scalar-zero result and no Firebase/runtime errors.'); return;
        }
        if (args.includes('--map-only')) {
            async function revised(operation) {
                const before = await evaluate('document.getElementById("color-map").dataset.revision');
                await operation();
                await pause(80);
                await until(() => evaluate(`document.getElementById('color-map').dataset.revision !== ${JSON.stringify(before)}`), 'map redraw');
            }
            async function setTarget(value) {
                await revised(() => evaluate(`document.getElementById('target-input').value=${JSON.stringify(value)};document.getElementById('target-form').requestSubmit()`));
            }
            async function setSelect(id, value) {
                await revised(() => evaluate(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('change',{bubbles:true}))`));
            }
            async function moveTo(x, y, lock = false) {
                const r = await box('#experimental-map');
                let px = r.x + (300 + x) / 600 * r.width, py = r.y + (300 + y) / 600 * r.height;
                await protocol.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py });
                if (lock) {
                    // Inspection text can reflow above the mobile plots on hover.
                    await pause(120);const current=await box('#experimental-map');px=current.x+(300+x)/600*current.width;py=current.y+(300+y)/600*current.height;
                    if(await evaluate('innerWidth<700')){await protocol.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:px,y:py,id:1,radiusX:2,radiusY:2}]});await protocol.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
                    else{await protocol.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1 });await protocol.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1 });}
                }
                await pause(80);
            }
            for (const width of [1200, 390, 320]) {
                await protocol.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
                await protocol.send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/tools/impressions-color-map.html' });
                await until(() => evaluate('document.getElementById("color-map")?.dataset.ready === "true"'), 'color map boot');
                assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Color map fits narrow screens');
                const defaults = await evaluate('JSON.stringify(ImpressionsColor.defaults)');
                await setSelect('curve-view','all'); // V4's production view hides the legacy V2 canvas.
                await setTarget('128, 128, 128');
                assert.equal(await evaluate('document.getElementById("inspect-experimental").textContent'), '100.000');
                const originalRadius = await evaluate(`Number(document.querySelector('#original-legend [data-score="50"]').dataset.radius)`);
                const experimentalRadius = await evaluate(`Number(document.querySelector('#experimental-legend [data-score="50"]').dataset.radius)`);
                const candidateRadius = await evaluate(`Number(document.querySelector('#candidate-legend [data-score="50"]').dataset.radius)`);
                assert(originalRadius > candidateRadius && candidateRadius > experimentalRadius);
                assert.equal(await evaluate('ImpressionsColor.scoringVersion'), 4);
                for (const id of ['original', 'experimental', 'candidate']) {
                    const scores = await evaluate(`Array.from(document.querySelectorAll('#${id}-legend button')).map(e=>Number(e.dataset.score))`);
                    assert.deepEqual(scores, [95, 90, 80, 70, 50, 30, 10]);
                }
                await moveTo(40, -20, true);
                assert.equal(await evaluate('document.getElementById("color-map").dataset.pinned'), 'true');
                const rgb = (await evaluate('document.getElementById("color-map").dataset.selectedRgb')).split(',').map(Number);
                assert(Color.validateAnswer(rgb) && rgb.join(',') !== '128,128,128');
                assert.equal(await evaluate('document.getElementById("inspect-original").textContent'), Color.grade([128, 128, 128], rgb, { version: 1 }).score.toFixed(3));
                assert.equal(await evaluate('document.getElementById("inspect-experimental").textContent'), Color.grade([128, 128, 128], rgb, { version: 2 }).score.toFixed(3));
                assert.equal(await evaluate('document.getElementById("inspect-candidate").textContent'), Color.grade([128, 128, 128], rgb, { version: 3 }).score.toFixed(3));
                for (const [id, version] of [['original', 1], ['experimental', 2], ['candidate', 3]]) {
                    const samples = await evaluate(`Array.from(document.querySelectorAll('#${id}-samples .score-sample')).map(e=>({level:Number(e.dataset.level),rgb:e.dataset.rgb,score:e.dataset.actualScore}))`);
                    assert.deepEqual(samples.map(s => s.level), [90, 70, 50, 30, 10]);
                    for (const sample of samples) {
                        if (sample.rgb) assert.equal(Number(sample.score), Color.grade([128, 128, 128], sample.rgb.split(',').map(Number), { version }).score);
                        else assert.equal(sample.score, '');
                    }
                }
                await moveTo(-40, 20);
                assert.equal(await evaluate('document.getElementById("color-map").dataset.selectedRgb'), rgb.join(','), 'Pinned colors survive pointer movement');
                await evaluate('document.getElementById("experimental-map").focus()'); await key('Escape'); await pause(80);
                await moveTo(200, 0, true);
                assert.equal(await evaluate('document.getElementById("color-map").dataset.selectedRgb'), '');
                assert.equal(await evaluate('document.getElementById("inspect-experimental").textContent'), '—');
                assert.equal(await evaluate('document.getElementById("inspect-candidate").textContent'), '—');
                assert.equal(await evaluate('document.getElementById("inspect-selected-swatch").dataset.invalid'), 'true');
                await setSelect('slice-plane', 'aL');
                await evaluate('document.getElementById("experimental-map").focus({preventScroll:true})');
                for(let i=0;i<3;i++){await protocol.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',modifiers:8});await protocol.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp',modifiers:8});}await key('Enter');await pause(80);
                const lighter = (await evaluate('document.getElementById("color-map").dataset.selectedRgb')).split(',').map(Number);
                assert(lighter.every(n => n > 128),'Keyboard lightness selection '+JSON.stringify({width,lighter}));
                assert((await evaluate('document.getElementById("slice-summary").textContent')).includes('固定 b'));
                await setSelect('slice-plane', 'bL');
                assert((await evaluate('document.getElementById("slice-summary").textContent')).includes('固定 a'));
                await setSelect('slice-plane', 'ab');
                await revised(() => evaluate('document.getElementById("map-v3-width").value="0.14";document.getElementById("map-v3-width").dispatchEvent(new Event("input",{bubbles:true}))'));
                assert(await evaluate(`Number(document.querySelector('#candidate-legend [data-score="50"]').dataset.radius)>${candidateRadius}`));
                assert.equal(await evaluate(`Number(document.querySelector('#experimental-legend [data-score="50"]').dataset.radius)`), experimentalRadius);
                await revised(() => evaluate('document.getElementById("map-v3-penaltyExponent").value="2.2";document.getElementById("map-v3-penaltyExponent").dispatchEvent(new Event("input",{bubbles:true}))'));
                await evaluate('document.getElementById("map-v3-penaltyExponent").value="0";document.getElementById("map-v3-penaltyExponent").dispatchEvent(new Event("input",{bubbles:true}))');
                assert.equal(await evaluate('document.getElementById("map-status").dataset.invalid'), 'true');
                await revised(() => click('#reset-parameters'));
                await until(() => evaluate('document.getElementById("map-status").dataset.invalid === "false"'), 'reset V3 candidate');
                assert.equal(await evaluate(`Number(document.querySelector('#candidate-legend [data-score="50"]').dataset.radius)`), candidateRadius);
                await revised(() => evaluate('document.getElementById("map-width").value="0.1";document.getElementById("map-width").dispatchEvent(new Event("input",{bubbles:true}))'));
                assert.equal(await evaluate(`Number(document.querySelector('#original-legend [data-score="50"]').dataset.radius)`), originalRadius);
                assert(await evaluate(`Number(document.querySelector('#experimental-legend [data-score="50"]').dataset.radius)>${experimentalRadius}`));
                assert.equal(await evaluate('document.getElementById("target-input").value'), '#808080');
                await evaluate('document.getElementById("map-width").value="0";document.getElementById("map-width").dispatchEvent(new Event("input",{bubbles:true}))');
                assert.equal(await evaluate('document.getElementById("map-status").dataset.invalid'), 'true');
                await revised(() => click('#reset-parameters'));
                await until(() => evaluate('document.getElementById("map-status").dataset.invalid === "false"'), 'restored valid map parameters');
                await setSelect('slice-extent', '0.15');
                assert.equal(await evaluate(`document.querySelector('#original-legend [data-score="10"]').dataset.outside`), 'true');
                assert.equal(await evaluate(`document.querySelector('#experimental-legend [data-score="10"]').dataset.outside`), 'false');
                await setSelect('curve-view', 'experimental');
                assert.equal(await evaluate('document.getElementById("original-panel").hidden'), true);
                assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
                await setSelect('curve-view', 'original'); assert.equal(await evaluate('document.getElementById("experimental-panel").hidden'), true);
                await setSelect('curve-view', 'candidate');
                assert.equal(await evaluate('document.getElementById("candidate-panel").hidden'), false);
                assert.equal(await evaluate('document.getElementById("experimental-panel").hidden'), true);
                await setSelect('curve-view', 'v2-v3');
                assert.equal(await evaluate('document.getElementById("original-panel").hidden'), true);
                assert.equal(await evaluate('document.getElementById("candidate-panel").hidden'), false);
                assert.equal(await evaluate('document.getElementById("experimental-panel").hidden'), false);
                await setSelect('curve-view', 'all'); await setSelect('slice-extent', '0.4');
                await evaluate('document.getElementById("experimental-map").focus()'); await key('ArrowRight'); await key('ArrowUp'); await key('Enter'); await pause(80);
                assert.equal(await evaluate('document.getElementById("color-map").dataset.pinned'), 'true', 'Keyboard can select and pin a valid sample');
                await key('Escape'); await pause(80);
                assert.equal(await evaluate('document.getElementById("inspect-original").textContent'), '100.000');
                await revised(() => click('#random-target'));
                assert.notEqual(await evaluate('document.getElementById("target-input").value'), '#808080');
                assert.equal(await evaluate('document.getElementById("inspect-experimental").textContent'), '100.000');
                await setTarget('#3092C6');
                await evaluate('document.getElementById("target-input").value="rgb(999,0,0)";document.getElementById("target-form").requestSubmit()');
                assert.equal(await evaluate('document.getElementById("map-status").dataset.invalid'), 'true');
                await setTarget('#3092C6');
                await revised(()=>evaluate(`document.querySelector('#experimental-legend [data-score="50"]').click()`));
                assert.equal(await evaluate(`document.querySelector('#experimental-legend [data-score="50"]').getAttribute('aria-pressed')`), 'true');
                assert.equal(await evaluate('typeof window.ArcadeNet'), 'undefined');
                assert.equal(await evaluate('JSON.stringify(ImpressionsColor.defaults)'), defaults);
                await screenshot('color-map-' + width);
                console.log('PASS: V1/V2/V3 map ' + width + 'px: explicit historical versions, actual scores/sample pairs, V3 controls, comparison modes, gamut rejection, slices, keyboard and adopted V4 default.');
            }
            for (const value of ['#FF0000', '#FFFFFF', '#000000']) {
                await setTarget(value); assert.equal(await evaluate('document.getElementById("inspect-experimental").textContent'), '100.000');
                assert.equal(await evaluate('document.getElementById("inspect-candidate").textContent'), '100.000');
            }
            assert(await evaluate('Array.from(document.querySelectorAll(".score-sample")).every(e=>e.dataset.available === "false" && e.dataset.actualScore === "")'));
            await protocol.send('Page.navigate', { url: 'file:///' + path.join(root, 'tools', 'impressions-color-map.html').replace(/\\/g, '/') });
            await until(() => evaluate('document.getElementById("color-map")?.dataset.ready === "true"'), 'standalone score map');
            assert.equal(await evaluate('typeof window.ArcadeNet'), 'undefined'); assert.deepEqual(protocol.exceptions, []);
            console.log('PASS: sRGB boundary targets, standalone file:// color map and no Firebase/runtime exceptions.'); return;
        }
        if (args.includes('--calibration-only')) {
            for (const width of [1200, 390, 320]) {
                await protocol.send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 700 });
                await protocol.send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/tools/impressions-scoring.html' });
                await until(() => evaluate('document.querySelectorAll(".proposed-score").length === 15 && document.querySelector(".proposed-score").textContent === "100.000"'), 'calibration fixtures');
                assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Calibration fits narrow viewports');
                assert.equal(await evaluate('document.querySelector("[data-fixture=high-accuracy] .old-score").textContent'),
                    await evaluate('document.querySelector("[data-fixture=high-accuracy] .proposed-score").textContent'));
                const before = await evaluate('document.querySelector("[data-fixture=hue-blue] .proposed-score").textContent');
                assert.equal(before, '21.633');
                const defaults = await evaluate('JSON.stringify(ImpressionsColor.defaults.scoring)');
                await click('#initial-proposal');
                assert(Number(await evaluate('document.querySelector("[data-fixture=hue-blue] .proposed-score").textContent')) < Number(before));
                assert.equal(await evaluate('JSON.stringify(ImpressionsColor.defaults.scoring)'), defaults, 'Calibration never changes game defaults');
                await evaluate('document.getElementById("width").value="0";document.getElementById("width").dispatchEvent(new Event("input",{bubbles:true}))');
                assert.equal(await evaluate('document.getElementById("curve-status").dataset.invalid'), 'true');
                await click('#game-defaults');
                assert.equal(await evaluate('document.querySelector("[data-fixture=hue-blue] .proposed-score").textContent'), before);
                assert.equal(await evaluate('document.getElementById("curve-status").dataset.invalid'), 'false');
                assert.equal(await evaluate('document.querySelectorAll(".swatch").length'), 30);
                assert(await evaluate('document.getElementById("trial-curve").getAttribute("d").startsWith("M")'));
                await screenshot('scoring-' + width);
            }
            await protocol.send('Page.navigate', { url: 'file:///' + path.join(root, 'tools', 'impressions-scoring.html').replace(/\\/g, '/') });
            await until(() => evaluate('document.querySelectorAll(".proposed-score").length === 15 && document.querySelector(".proposed-score").textContent === "100.000"'), 'standalone calibration');
            assert.deepEqual(protocol.exceptions, []);
            console.log('PASS: visual scoring diagnostics at 1200/390/320px: 15 side-by-side pairs, old/new scores, both presets, invalid input recovery, unchanged game defaults and standalone file:// support.');
            return;
        }
        for (const viewport of [{ name: 'desktop', width: 1200, height: 900, mobile: false },
            { name: 'mobile', width: 390, height: 844, mobile: true }, { name: 'small-mobile', width: 320, height: 568, mobile: true }]) {
            await protocol.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
            await protocol.send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile, maxTouchPoints: 1 });
            await protocol.send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/games/impressions.html' });
            await until(() => evaluate('!!window.__impressionsTest'), 'Impressions boot');
            assert.equal(await evaluate('ImpressionsGame.defaults.scoring.version'), 4, 'Local practice defaults to V4');
            assert.equal((await snapshot()).phase, 'idle');
            assert.equal(await evaluate('innerWidth'), viewport.width, 'The mobile layout must use the requested viewport');
            await copyFits();
            assert.equal(await evaluate('document.querySelectorAll("[role=spinbutton]").length'), 3);
            assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'No horizontal overflow');
            assert.equal(await evaluate('document.querySelector("#impressions-target-hex").textContent'), '');
            assert.equal(await evaluate('document.querySelectorAll("input[type=range]").length'), 0);
            await click('#impressions-action'); let state = await snapshot();
            assert.equal(state.phase, 'prepare'); assert.deepEqual(state.draft, [128, 128, 128]);
            await copyFits();
            const timeline = state.timeline;
            assert.deepEqual(state.question.target, Color.generateQuestion(42).target);
            await evaluate('document.querySelector("#impressions-wheel-r .impressions-wheel").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowUp",bubbles:true,cancelable:true}))');
            assert.deepEqual((await snapshot()).draft, [128, 128, 128], 'Controls are locked during preparation');
            state = await advance(timeline.memorizeAt); assert.equal(state.phase, 'memorize');
            await copyFits();
            assert.equal(await evaluate('document.querySelector("#impressions-preview-cover").hidden'), true);
            assert.equal(await evaluate('document.querySelector("#impressions-target-hex").textContent'), '', 'No target values during memorization');
            const geometry = await evaluate('(()=>{const r=document.querySelector("#impressions-wheel-r").getBoundingClientRect();return [r.top+scrollY,r.height];})()');
            state = await advance(timeline.answerAt); assert.equal(state.phase, 'answer');
            await copyFits();
            assert.deepEqual(state.draft, [128, 128, 128], 'Initial answer is independent of target');
            assert.equal(await evaluate('document.querySelector("#impressions-preview").style.backgroundColor'), 'rgb(128, 128, 128)');
            assert.equal(await evaluate('document.querySelector("#impressions-target-swatch").style.backgroundColor'), '', 'Hidden result node must not retain the target');
            const answerGeometry = await evaluate('(()=>{const r=document.querySelector("#impressions-wheel-r").getBoundingClientRect();return [r.top+scrollY,r.height];})()');
            assert(Math.abs(geometry[0] - answerGeometry[0]) < 1, 'Controls should not jump between phases');
            assert.equal(geometry[1], answerGeometry[1]);
            if (viewport.name === 'mobile') {
                await evaluate('scrollTo(0,0)');
                assert(await evaluate('document.querySelector("#impressions-action").getBoundingClientRect().bottom <= ' + viewport.height), 'Submit is visible without scrolling on a typical phone');
            }
            const beltBefore = await evaluate('document.querySelector("#impressions-wheel-r .impressions-wheel-belt").style.transform');
            if (viewport.mobile) await touchDrag('#impressions-wheel-r .impressions-wheel', 26);
            else await drag('#impressions-wheel-r .impressions-wheel', 26);
            assert.equal((await snapshot()).draft[0], 141);
            assert.notEqual(await evaluate('document.querySelector("#impressions-wheel-r .impressions-wheel-belt").style.transform'), beltBefore, 'Ticks visibly move');
            assert.equal(await evaluate('document.querySelector("#impressions-preview").style.backgroundColor'), 'rgb(141, 128, 128)', 'Preview updates immediately');
            if (!viewport.mobile) {
                await drag('#impressions-wheel-r .impressions-wheel', 16, true);
                assert.equal((await snapshot()).draft[0], 143, 'Shift-drag is finer');
            }
            const beforeStep = (await snapshot()).draft[0];
            await click('#impressions-wheel-r .impressions-step:last-child'); assert.equal((await snapshot()).draft[0], beforeStep + 1);
            await click('#impressions-wheel-r .impressions-step:first-child'); assert.equal((await snapshot()).draft[0], beforeStep);
            await evaluate('document.querySelector("#impressions-wheel-r .impressions-wheel").focus()');
            await key('ArrowUp'); assert.equal((await snapshot()).draft[0], beforeStep + 1);
            await key('Home'); assert.equal((await snapshot()).draft[0], 0);
            await key('ArrowDown'); assert.equal((await snapshot()).draft[0], 0);
            await key('PageUp'); assert.equal((await snapshot()).draft[0], 16);
            await key('End'); await key('ArrowUp'); assert.equal((await snapshot()).draft[0], 255);
            await key('Home'); await key('PageUp');
            const r = await box('#impressions-wheel-r .impressions-wheel'), scroll = await evaluate('scrollY');
            await protocol.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.cx, y: r.cy, deltaY: -120, deltaX: 0 });
            await until(async () => (await snapshot()).draft[0] === 26, 'mouse wheel adjustment');
            assert.equal(await evaluate('scrollY'), scroll, 'Wheel scrolling is scoped to the control');
            if (viewport.mobile) {
                await touchDrag('#impressions-wheel-b .impressions-wheel', 20, true);
                assert.equal((await snapshot()).draft[2], 138, 'Pointer cancellation preserves the last valid value');
                await touchDrag('#impressions-wheel-b .impressions-wheel', -4);
                assert.equal((await snapshot()).draft[2], 136, 'A new touch starts cleanly after cancellation');
                await evaluate('(()=>{const tail=document.createElement("div");tail.id="test-tail";tail.style.height="1000px";document.body.append(tail);scrollTo(0,0);})()');
                await protocol.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 5, y: 400, id: 1 }] });
                for (let i = 1; i <= 4; i++) {
                    await protocol.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 5, y: 400 - i * 40, id: 1 }] }); await pause(30);
                }
                await protocol.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pause(150);
                assert(await evaluate('scrollY > 0'), 'Normal touch scrolling outside the controls remains available');
                await evaluate('document.querySelector("#test-tail").remove();scrollTo(0,0)');
            }
            await screenshot(viewport.name + '-answer');
            const draft = (await snapshot()).draft;
            await click('#impressions-action'); state = await snapshot();
            assert.equal(state.phase, 'results'); assert.equal(state.reason, 'manual'); assert.deepEqual(state.answer, draft);
            await copyFits();
            assert.equal(state.result.score, Color.grade(state.question.target, draft).score);
            assert.equal(await evaluate('document.querySelector("#impressions-action").disabled'), true, 'Brief result dwell prevents accidental restarts');
            await evaluate('document.querySelector("#impressions-wheel-r .impressions-wheel").dispatchEvent(new KeyboardEvent("keydown",{key:"End",bubbles:true,cancelable:true}))');
            assert.deepEqual((await snapshot()).answer, draft, 'Answer remains locked');
            assert.equal(await evaluate('document.querySelector("#impressions-target-hex").textContent.length'), 7);
            assert.equal(await evaluate('__impressionsTest.submit()'), false);
            await screenshot(viewport.name + '-results');
            await advance(timeline.answerAt + 800);
            assert.equal(await evaluate('document.querySelector("#impressions-action").disabled'), false);
            await click('#impressions-action'); state = await snapshot();
            assert.equal(state.round, 2); assert.equal(state.phase, 'prepare');
            assert.equal(await evaluate('document.querySelector("#impressions-target-hex").textContent'), '');
            assert.equal(await evaluate('document.querySelector("#impressions-target-swatch").style.backgroundColor'), '');
            state = await advance(state.timeline.answerAt); const secondTimeline = state.timeline;
            await click('#impressions-wheel-g .impressions-step:last-child');
            assert.deepEqual((await snapshot()).draft, [128, 129, 128]);
            await advance(secondTimeline.deadline - 1);
            await evaluate(`window.__impressionsNow=${secondTimeline.deadline};document.querySelector('#impressions-wheel-g .impressions-wheel').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}))`);
            state = await snapshot();
            assert.equal(state.reason, 'timeout'); assert.deepEqual(state.answer, [128, 129, 128], 'A deadline input cannot alter the expired draft');
            assert.equal(state.result.score, Color.grade(state.question.target, state.answer).score);
            const autoResult = state.result; await advance(secondTimeline.deadline + 10000);
            assert.deepEqual((await snapshot()).result, autoResult, 'Timeout settles once');
            for (let i = 0; i < 4; i++) {
                await click('#impressions-action'); state = await snapshot();
                await advance(state.timeline.answerAt); await click('#impressions-wheel-r .impressions-step:last-child');
                assert.deepEqual((await snapshot()).draft, [129, 128, 128], 'Repeated rounds do not accumulate handlers or retain drafts');
                await click('#impressions-action'); await advance(state.timeline.answerAt + 800);
            }
            await click('[data-lang="zh"]');
            assert.equal(await evaluate('document.querySelector("#impressions-action").textContent'), '下一回合');
            assert.equal(await evaluate('document.querySelector("#impressions-wheel-r .impressions-wheel").getAttribute("aria-label")'), '紅色');
            // Locale changes also fit narrow English labels, not only shorter Chinese strings.
            await click('[data-lang="en"]');
            assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
            assert.deepEqual(await evaluate('window.__pageErrors'), []);
            assert.equal(await evaluate('performance.getEntriesByType("resource").every(r=>new URL(r.name).origin===location.origin)'), true, 'Game loads only local resources');
            const beforeDestroy = await snapshot(); await evaluate('__impressionsTest.destroy()');
            await advance(secondTimeline.deadline + 999999);
            await evaluate('document.querySelector("#impressions-action").click();document.querySelector("#impressions-wheel-r .impressions-step:last-child").click()');
            assert.deepEqual(await snapshot(), beforeDestroy, 'Destroyed controller has no active timers or input handlers');
            // Remount with the real production clock and polling timer. No manual tick drives this round.
            await evaluate(`window.__realMemory=ImpressionsGame.create({root:document.querySelector('#impressions-game'),seedSource:()=>987,
                config:{categoryMode:'color',selectionVersion:2,timing:{prepareMs:100,memorizeMs:200,answerMs:300,resultMinMs:0}}});__realMemory.start()`);
            await until(() => evaluate('__realMemory.snapshot().phase === "results"'), 'real timer automatically submits');
            const timed = await evaluate('__realMemory.snapshot()');
            assert.equal(timed.reason, 'timeout'); assert.deepEqual(timed.answer, [128, 128, 128]);
            assert.equal(timed.result.score, Color.grade(timed.question.target, timed.answer).score);
            await evaluate('__realMemory.start();__realMemory.destroy()');
            await pause(150);
            assert.equal(await evaluate('__realMemory.snapshot().phase'), 'prepare', 'Teardown cancels an active phase timer');
            assert.deepEqual(await evaluate('window.__pageErrors'), []);
            console.log(`PASS: ${viewport.name} ${viewport.width}x${viewport.height}: real ${viewport.mobile ? 'touch, cancellation, page scrolling, ' : 'mouse and Shift dragging, '}wheel/keyboard precision, target cleanup, manual/automatic locking, repeated rounds, localization and teardown.`);
        }
        // The legacy bookmark must reach the single uninstrumented implementation,
        // preserving optional debug/room context. Then exercise its real 3s/4s phases.
        await protocol.send('Page.navigate', { url: 'file:///' + path.join(root, 'games', 'memory.html').replace(/\\/g, '/') + '?rename-check=1#results' });
        await until(() => evaluate('!!window.ImpressionsGame && document.querySelectorAll("[role=spinbutton]").length>=3'), 'standalone file boot');
        assert.equal(await evaluate('location.pathname.endsWith("/games/impressions.html") && location.search === "?rename-check=1" && location.hash === "#results"'), true, 'Legacy URL preserves query/fragment');
        assert.equal(await evaluate('typeof window.__impressionsTest'), 'undefined', 'No test hook ships in the production page');
        assert.equal(await evaluate('document.getElementById("impressions-local-category").value'), 'weighted');
        assert.deepEqual(await evaluate("['color','quantity','pitch'].map(id=>Number(document.getElementById('impressions-local-weight-'+id).value))"), [2, 2, 2]);
        await evaluate("document.getElementById('impressions-local-category').value='color';document.getElementById('impressions-local-category').dispatchEvent(new Event('change',{bubbles:true}))");
        await click('#impressions-action');
        assert.equal(await evaluate('document.querySelector("#impressions-game").dataset.phase'), 'prepare');
        await until(() => evaluate('document.querySelector("#impressions-game").dataset.phase === "memorize"'), 'real preparation countdown');
        assert(await evaluate('Array.from(document.querySelectorAll("#impressions-modern-palette .impressions-color-card")).every(e=>!!e.style.backgroundColor)'));
        await until(() => evaluate('document.querySelector("#impressions-game").dataset.phase === "answer"'), 'real memorization deadline');
        assert(await evaluate('Array.from(document.querySelectorAll("#impressions-modern-palette .impressions-color-card")).every(e=>!!e.style.backgroundColor)'));
        assert.equal(await evaluate('document.querySelector("#impressions-target-hex").textContent'), '');
        await click('#impressions-action');
        assert.equal(await evaluate('document.querySelector("#impressions-game").dataset.phase'), 'results');
        assert(await evaluate('Number.isFinite(Number(document.querySelector("#impressions-score").textContent))'));
        assert.deepEqual(protocol.exceptions, []);
        console.log('PASS: uninstrumented file:// page, real production phases, HSL/Hue initial reconstruction and submitted results; no runtime exceptions.');
    } catch (error) {
        if (diagnostics) console.error(diagnostics.slice(-1800));
        throw error;
    } finally {
        clearTimeout(deadline);
        if (protocol) protocol.close();
        if (browser && browser.exitCode === null) {
            const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await Promise.race([stopped, pause(3000)]);
        }
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        const absoluteProfile = path.resolve(profile), expectedRoot = path.resolve(os.tmpdir()) + path.sep + 'gamebox-impressions-browser-';
        if (absoluteProfile.startsWith(expectedRoot)) {
            try { fs.rmSync(absoluteProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (_) { /* A Chrome child may briefly retain files. */ }
        }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
