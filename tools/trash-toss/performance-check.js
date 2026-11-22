// Local real-canvas benchmark. Test-only instrumentation; no Firebase or shipping hooks.
// node tools/trash-toss/performance-check.js [--revision=7f094e8] [--output=/tmp/report.json]
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..'), args = process.argv.slice(2);
const option = (name, fallback) => args.find(arg => arg.startsWith('--' + name + '='))?.split('=').slice(1).join('=') || fallback;
const baseline = option('baseline', ''), output = option('output', '/tmp/trash-toss-performance.json');
const revision = option('revision', '');
const roomRevision = option('room-revision', '');
const chrome = option('chrome', '/usr/bin/google-chrome'), throttle = Number(option('throttle', '4'));
const dpr = Number(option('dpr', '2'));
const desktop = args.includes('--desktop'), cpuMode = args.includes('--cpu');
const boot = `<script>
window.__ttPerf = { stats:{}, events:{}, frames:[], motion:[], longTasks:[], mutations:0,
 wrap(name, fn) { return function(...args) { const start = performance.now(); try { return fn.apply(this,args); } finally { const stat = __ttPerf.stats[name] ||= {calls:0,ms:0,max:0}; const dt=performance.now()-start; stat.calls++; stat.ms+=dt; stat.max=Math.max(stat.max,dt); if(name==='view') __ttPerf.frames.push(performance.now()); } }; },
 clear() { this.stats={}; this.events={}; this.frames=[]; this.motion=[]; this.longTasks=[]; this.mutations=0; },
};
new PerformanceObserver(list=>__ttPerf.longTasks.push(...list.getEntries().map(entry=>entry.duration))).observe({type:'longtask'});
const savedSetItem=Storage.prototype.setItem;
Storage.prototype.setItem=function(...args){__ttPerf.events.storageWrites=(__ttPerf.events.storageWrites||0)+1;return savedSetItem.apply(this,args);};
addEventListener('DOMContentLoaded', () => new MutationObserver(records => __ttPerf.mutations+=records.length).observe(document.querySelector('.tt-hud').parentElement,{subtree:true,attributes:true,childList:true,characterData:true}));
</script>`;
// Revisions and --baseline checkouts before the js/games/trash-toss/ move use these paths.
const legacyPaths = {
    'js/games/trash-toss/game.js': 'js/games/trash-toss.js', 'js/games/trash-toss/rules.js': 'js/games/trash-toss-rules.js',
    'js/games/trash-toss/view.js': 'js/games/trash-toss-view.js', 'js/games/trash-toss/room.js': 'js/games/trash-toss-room.js',
    'js/games/trash-toss/online.js': 'js/games/trash-toss-online.js', 'js/games/trash-toss/cpu.js': 'js/games/trash-toss-cpu.js',
    'js/games/trash-toss/qa.js': 'js/games/trash-toss-qa.js',
};
const currentPath = relative => Object.keys(legacyPaths).find(key => legacyPaths[key] === relative) || relative;
function showAt(revision, relative) {
    try { return execFileSync('git',['show',revision+':'+relative],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}); }
    catch (error) { if (!legacyPaths[relative]) throw error; return execFileSync('git',['show',revision+':'+legacyPaths[relative]],{cwd:root,encoding:'utf8'}); }
}
function instrument(relative, body) {
    const file = currentPath(relative);
    if (file === 'games/trash-toss.html') return body.replace('<head>', '<head>' + boot);
    if (file === 'js/games/trash-toss/rules.js') return body + `\nif(typeof __ttPerf!=='undefined') for(const name of ['obstacles','advance','advanceCleaning','binContents','cpuPlan']) TrashTossRules[name]=__ttPerf.wrap(name,TrashTossRules[name]);`;
    if (file === 'js/games/trash-toss/room.js') return body + `\nTrashTossRoom.project=__ttPerf.wrap('project',TrashTossRoom.project);`;
    if (file === 'js/games/trash-toss/view.js') return body.replace('const width = track(model);', `const width = track(model);
        if(model.ball) __ttPerf.motion.push({at:performance.now(),time:model.time,x:model.ball.x,cameraX,maxCamera:R.fieldWidth(model.scene)-width});`)
        .replace('fit(); return { fit, render',
        ['background','drawBackground','person','obstacle','bin','body','overview'].filter(name => body.includes('function '+name+'(')).map(name => `${name}=__ttPerf.wrap('${name}',${name});`).join('') + `render=__ttPerf.wrap('view',render); fit(); return { fit, render`);
    if (file === 'js/games/trash-toss/game.js') return body.replace('onChange(data) {', `onChange(data) { __ttPerf.events.gameChanges=(__ttPerf.events.gameChanges||0)+1;`)
        .replace('    shell = AC.shell.create', `    sync=__ttPerf.wrap('hud',sync); update=__ttPerf.wrap('update',update); render=__ttPerf.wrap('render',render);\n    shell = AC.shell.create`)
        .replace('    reset(); render();', `
    window.__ttPerf.setup = function(id, mode) {
        fields.scene.value=id; fields.mode.value=mode==='cpu-flight'?'cpu':'practice'; shell.goIdle();
        if(mode==='cpu-flight') { match=R.createMatch(chosen(),42); match.active=1; match.turn=1; beginTurn(false); }
        scene=R.scenario(match.config,1,42); scene.cleaning=cleaning; visualRain=scene.rain;
        if(mode==='debris') for(let i=0;i<40;i++) { const b=R.launch(scene,45,30,0); b.x=120+i*(R.fieldWidth(scene)-200)/40; b.y=b.radius; b.resting=true; debris.push(b); }
        if(mode!=='idle') shell.start();
        if(mode==='charge') beginCharge('benchmark');
        if(mode==='flight') { phase='charge'; power=85; angle=65; release(); }
        sync(); render(true);
    }; window.__ttPerf.state=()=>({phase,active:match.active}); reset(); render();`);
    return body;
}
(async () => {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost'), file = path.resolve(root, '.' + url.pathname);
        const old = baseline && path.join(baseline, url.pathname), isFile = name => fs.existsSync(name) && fs.statSync(name).isFile();
        if (!file.startsWith(root + path.sep) || url.pathname.split('/').some(part => part.startsWith('.')) || !(isFile(file) || old && isFile(old))) { res.writeHead(404).end(); return; }
        let body;
        if (url.pathname === '/js/net/net.js') body = `window.ArcadeNet={ok:false}; dispatchEvent(new CustomEvent('arcade-net-ready'));`;
        else {
            const relative = path.relative(root, file).split(path.sep).join('/');
            const compareFile = ['js/games/trash-toss/game.js', 'js/games/trash-toss/view.js', 'js/games/trash-toss/rules.js', 'css/trash-toss.css'].includes(relative);
            const comparedRoom = roomRevision && ['js/games/trash-toss/room.js','js/games/trash-toss/online.js'].includes(relative);
            const selectedRevision = comparedRoom ? roomRevision : revision && compareFile ? revision : '';
            body = instrument(relative, selectedRevision ? showAt(selectedRevision, relative) : fs.readFileSync(old && isFile(old) ? old : file, 'utf8'));
        }
        res.writeHead(200, {'Content-Type': file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control':'no-store'}); res.end(body);
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const profile = fs.mkdtempSync(path.join(os.tmpdir(),'gamebox-trash-perf-'));
    let browser, socket;
    try {
        browser = spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
        let diagnostics=''; browser.stderr.on('data',chunk=>{diagnostics+=chunk;});
        const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
        const portFile=path.join(profile,'DevToolsActivePort');
        for(let i=0;!fs.existsSync(portFile)&&i<150;i++) await pause(100);
        if(!fs.existsSync(portFile)) throw Error(diagnostics.slice(-2000));
        const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
        const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
        socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
        await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
        let serial=0;const tasks=new Map();
        socket.onmessage=e=>{const data=JSON.parse(e.data),task=tasks.get(data.id);if(task){tasks.delete(data.id);data.error?task.reject(Error(data.error.message)):task.resolve(data.result);}};
        const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;tasks.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
        const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
        if(args.includes('--online')) {
            const child=spawn(process.execPath,[path.join(root,'tools/trash-toss/online-browser-check.js'),port,
                'http://127.0.0.1:'+server.address().port,'--perf','--throttle='+throttle,'--output='+output,
                ...(!roomRevision?['--expect-optimized']:['--legacy-room-flow'])],{stdio:'inherit'});
            const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
            if(code)throw Error('Online browser check failed: '+code);
            const report=JSON.parse(fs.readFileSync(output,'utf8'));
            report.environment.roomRevision=roomRevision||'working tree';
            fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
            return;
        }
        await command('Page.enable');
        await command('Performance.enable');
        await command('Emulation.setDeviceMetricsOverride',{width:desktop?1200:390,height:desktop?900:844,deviceScaleFactor:dpr,mobile:!desktop});
        await command('Emulation.setCPUThrottlingRate',{rate:throttle});
        await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/games/trash-toss.html'});
        for(let i=0;i<150;i++){if(await evaluate('!!window.__ttPerf?.setup')) break;if(i===149)throw Error('Game did not initialize');await pause(100);}
        const rows=[];
        const cases = cpuMode ? [['office','cpu-flight'],['construction','cpu-flight']] : args.includes('--motion') ? [['office','flight'],['construction','flight']] :
            [['office','idle'],['office','aim'],['office','charge'],['office','flight'],['arena','debris'],['construction','debris']];
        for(const [scene,mode] of cases) {
            await evaluate(`__ttPerf.clear(); __ttPerf.setup('${scene}','${mode}')`);
            if (mode === 'cpu-flight') {
                const deadline = Date.now() + 15000;
                while (!await evaluate("__ttPerf.state().phase==='flight'")) {
                    if (Date.now() > deadline) throw Error('CPU did not release its planned throw');
                    await pause(10);
                }
            } else await pause(350);
            const warmupLongTasks = await evaluate('__ttPerf.longTasks.slice()');
            const beforeMetrics = Object.fromEntries((await command('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
            const result=await evaluate(`(async()=>{
                __ttPerf.clear(); const start=performance.now();
                await new Promise(resolve=>setTimeout(resolve,2000));
                const ms=performance.now()-start, stats=structuredClone(__ttPerf.stats), frames=__ttPerf.frames.slice(), mutations=__ttPerf.mutations;
                const canvas=document.getElementById('stage'), moving=__ttPerf.motion.filter(frame=>frame.cameraX>1&&frame.cameraX<frame.maxCamera-1);
                const repeated=moving.slice(1).filter((frame,i)=>Math.abs(frame.cameraX-moving[i].cameraX)<1e-8).length;
                const intervals=frames.slice(1).map((v,i)=>v-frames[i]).sort((a,b)=>a-b);
                return {ms,fps:frames.length/ms*1000,p95FrameMs:intervals[Math.floor(intervals.length*.95)]||0,mutations,stats,pixels:canvas.width*canvas.height,
                    motion:{samples:moving.length,repeatedCameraFrames:repeated,frames:__ttPerf.motion}};
            })()`);
            const afterMetrics = Object.fromEntries((await command('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
            result.browserMs = Object.fromEntries(['ScriptDuration','LayoutDuration','RecalcStyleDuration','TaskDuration'].map(name => [name,(afterMetrics[name]-beforeMetrics[name])*1000]));
            rows.push({scene,mode,warmupLongTasks,...result});
            console.log(scene,mode,JSON.stringify({fps:+result.fps.toFixed(1),viewMs:+(result.stats.view?.ms||0).toFixed(1),updateMs:+(result.stats.update?.ms||0).toFixed(1),hudMs:+(result.stats.hud?.ms||0).toFixed(1),mutations:result.mutations}));
        }
        await evaluate("__ttPerf.setup('office','idle')");
        const cpuPlanning=await evaluate(`['office','construction'].map(id=>{
            const scene=TrashTossRules.scenario({scene:id},1,42),start=performance.now();
            TrashTossRules.cpuPlan(scene,'hard',42,0,[]);
            return {scene:id,ms:performance.now()-start,candidates:277,frequency:'once per CPU turn, not per frame'};
        })`);
        console.log('CPU planning:',JSON.stringify(cpuPlanning));
        const report={baseline:revision||baseline||'working tree',environment:{browser:'headless Chrome',viewport:(desktop?'1200x900':'390x844')+' @'+dpr+'x',targetFPS:60,cpuThrottle:throttle,sampleMs:2000,notes:'Nested timings overlap. Canvas timings measure command submission, not GPU energy or iPhone temperature. Fixed scenario seed 42. Debris cases place 40 resting items across the map. CPU-flight cases wait for a real CPU turn to launch; warmupLongTasks includes planning/startup work before that flight. Historical versions retain their own FPS policy.'},rows,cpuPlanning};
        fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n'); console.log('Report:',output);
    } finally {
        socket?.close();
        if(browser&&browser.exitCode===null){const stopped=new Promise(resolve=>browser.once('exit',resolve));browser.kill();await stopped;}
        await new Promise(resolve=>server.close(resolve));
        fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
