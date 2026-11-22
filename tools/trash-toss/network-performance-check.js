// Differential replay check and operation counts against the pre-optimization policy.
// node tools/trash-toss/network-performance-check.js [--output=/tmp/trash-network.json]
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..'), R = require('../../js/games/trash-toss/rules.js');
const source = fs.readFileSync(path.join(root,'js/games/trash-toss/room.js'),'utf8');
const reference = execFileSync('git',['show','7f094e8:js/games/trash-toss-room.js'],{cwd:root,encoding:'utf8'});
function load(text) {
    const context={module:{exports:{}},require:()=>R}; vm.runInNewContext(text,context); return context.module.exports;
}
const before=load(reference),after=load(source), clone=value=>JSON.parse(JSON.stringify(value));
let cleaningCalls=0,physicsCalls=0;
const clean=R.advanceCleaning,advance=R.advance;
R.advanceCleaning=(...args)=>{cleaningCalls++;return clean(...args);};
R.advance=(...args)=>{physicsCalls++;return advance(...args);};
function game(sceneId,kind) {
    const match=R.createMatch({mode:'online',scene:sceneId},42), scene=R.scenario(match.config,1,42),debris=[];
    const full=kind==='full'||kind==='boundary';
    if(kind!=='empty')for(let i=0;i<(full?20:40);i++) {
        const b=R.launch(scene,45,30,0),bin=scene.bins[i%2];
        Object.assign(b,{x:full?bin.x:130+i*(scene.width-200)/40,y:full?bin.height*.8:b.radius,resting:true,vx:0,vy:0});debris.push(b);
    }
    if(kind==='moving')Object.assign(debris[0],{resting:false,x:180,y:220,vx:40,vy:10});
    const cleaning=R.createCleaning();
    if(kind==='boundary')cleaning.readyAt=30.1;
    return {matchId:'performance',seq:0,status:'aim',originAt:1000,turnStartedAt:1000,round:1,active:0,match,world:{tick:0,debris,cleaning}};
}
function run(policy,g,times) {
    cleaningCalls=0;physicsCalls=0; const start=performance.now();let cache;
    for(const milliseconds of times)cache=policy.project(g,g.originAt+milliseconds,cache);
    return {cache,ms:performance.now()-start,cleaningCalls,physicsCalls};
}
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||'/tmp/trash-toss-network-performance.json';
try {
    let comparisons=0;const rows=[];
    for(const sceneId of Object.keys(R.SCENES))for(const kind of ['empty','resting','full','moving','boundary']) {
        const g=game(sceneId,kind),original=JSON.stringify(g);
        const times=[0,1000/60,400,1234,8000,30000,30100,30100+1000/60,60000];
        let a,b;
        for(const at of times) {
            a=before.project(g,g.originAt+at,a); b=after.project(g,g.originAt+at,b);
            assert.deepEqual(clone(b),clone(a),sceneId+'/'+kind+' at '+at);comparisons++;
        }
        assert.equal(JSON.stringify(g),original,'Projection must never mutate authoritative room data');
        const old=run(before,g,[60000]),next=run(after,g,[60000]);
        rows.push({scene:sceneId,kind,before:{ms:old.ms,cleaningCalls:old.cleaningCalls,physicsCalls:old.physicsCalls},after:{ms:next.ms,cleaningCalls:next.cleaningCalls,physicsCalls:next.physicsCalls}});
        assert.equal(next.physicsCalls,old.physicsCalls,'Moving-body collision steps must be preserved');
        if(kind==='empty'||kind==='resting')assert(next.cleaningCalls<old.cleaningCalls/100,'Stable fields must not replay every empty tick');
    }
    // After a ball is launched, collision stepping and trail samples stay exact.
    for(const sceneId of Object.keys(R.SCENES)) {
        const g=game(sceneId,'empty'),scene=R.scenario(g.match.config,1,42);
        const ball=R.simulate(scene,65,85,.4,[]);
        Object.assign(g,{status:'flight',shot:{angle:65,power:85,at:g.originAt+400,timeout:false},outcome:{result:ball.result,duration:ball.age}});
        let a,b;
        for(const at of [0,100,399.9,400,400+1000/60,1000,2000,4000,10000,60000]) {
            a=before.project(g,g.originAt+at,a);b=after.project(g,g.originAt+at,b);
            assert.deepEqual(clone(b),clone(a),'Flight replay '+sceneId+' at '+at);comparisons++;
        }
        const old=run(before,g,[60000]),next=run(after,g,[60000]);
        assert.equal(next.physicsCalls,old.physicsCalls,'Flight and aftermath keep every collision step');
    }
    fs.writeFileSync(output,JSON.stringify({reference:'7f094e8',environment:'Node.js, same-process VM policies; timings are diagnostic, not phone power',comparisons,rows},null,2)+'\n');
    console.log('PASS:',comparisons,'reference comparisons across all five scenes, empty/resting/full/moving bodies and exact cleaning boundaries');
    console.log('Office idle catch-up:',JSON.stringify(rows.find(row=>row.scene==='office'&&row.kind==='empty')));
    console.log('Report:',output);
} finally { R.advanceCleaning=clean;R.advance=advance; }
