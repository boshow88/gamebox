/** Protocol 9: random generation, transactional exact-count stages and frozen-v8 replay. */
'use strict';
const assert = require('node:assert/strict');
const M = require('../js/games/memory-match.js'), C = require('../js/games/memory-categories.js');
const H = require('../js/games/memory-challenge.js'), S = require('../js/games/memory-quantity-progression.js');
const Q = require('../js/games/memory-quantity.js'), G = require('../js/games/memory-quantity-groups.js');
const Color = require('../js/games/memory-color.js'), Pitch = require('../js/games/memory-pitch.js');
const V4 = require('./helpers/memory-color-v4.js'), Slice = require('./helpers/memory-color-slice.js');
const Appearance = require('../js/games/memory-quantity-appearance.js');
const clone = value => JSON.parse(JSON.stringify(value));
const roster = n => Object.fromEntries(Array.from({length:n},(_,i)=>['p'+i,{id:'p'+i,type:'human',controllerId:'c'+i}]));
function create(input={},n=2,seed=42) { const r=roster(n); return M.create(r,Object.keys(r),{startingHp:10000,...input},seed,1000,'test'); }
function submit(game,id,answer,source='manual') { return M.submit(game,game.owners[id],{...M.token(game),participantId:id,answer,source,nonce:'n'+game.round+id},game.timeline.answerAt+100).state; }
function finish(game,scenario='perfect') {
    M.activeIds(game).forEach((id,i)=>{
        if(scenario==='missing'&&i===1)return;
        let answer=clone(game.question.target);
        if(scenario==='imperfect'&&i===1) { if(game.question.version===1)answer--;else answer[game.question.groups[0].id]--; }
        game=submit(game,id,answer,scenario==='timeout'&&i===1?'auto':'manual');
    });
    return M.settle(game,M.token(game),game.timeline.deadline);
}
assert(M.version>=10); assert.equal(Color.defaults.scoring.version,4);assert.equal(Pitch.defaults.scoring.tolerance,180);
assert.equal(Color.supportsScoringVersion(4),true);
const totals={};
for(const type of ['color','quantity','pitch']) {
    const count={easy:0,normal:0,hard:0},config=M.options({categoryMode:type});
    for(let seed=0;seed<10000;seed++) {
        const sample=H.sample(seed,type,config.challenge);count[sample.band]++;
        assert.deepEqual(H.sample(seed,type,config.challenge),sample);
        if(seed<1000) {
            const fields=M.roundFields(1,seed,1000,config),q=fields.question;
            assert.equal(q.difficulty,undefined);assert.equal(fields.difficultyState,undefined);
            assert.deepEqual(q.challenge,type==='quantity'?{...sample,quantityStage:0}:sample);assert.equal(q.parameters.timing.memorizeMs,fields.roundTiming.memorizeMs);
            const a={difficultyState:{difficultyByType:{color:1,quantity:1,pitch:1}}},b={difficultyState:{difficultyByType:{color:10,quantity:10,pitch:10}}};
            assert.deepEqual(M.roundFields(1,seed,1000,config,a).question,M.roundFields(1,seed,1000,config,b).question);
            assert(C.supported(q,config,1));
            if(type==='pitch'){assert([3,4].includes(q.tones.length));assert.equal(q.fixed.length,1);assert([2,3].includes(q.tones.length-q.fixed.length));assert.equal(config.pitch.scoring.tolerance,180);}
            if(type==='color')assert.equal(q.variant,'single');
        }
    }
    for(const [band,fraction] of [['easy',.2],['normal',.6],['hard',.2]])assert(Math.abs(count[band]/10000-fraction)<.02);
    totals[type]=count;
}
assert.throws(()=>M.options({challenge:{weights:{easy:0,normal:0,hard:0}}}),RangeError);
assert.throws(()=>M.options({quantity:{progression:{ranges:{multi3:[[10,75,80]]}}}}),RangeError);
const seen=new Set(),positions=new Set();
for(let stage=0;stage<=3;stage++)for(let seed=0;seed<180;seed++){
    const config=M.options({categoryMode:'quantity'}),previous={quantityProgress:{version:1,stage,lastRound:0,advanced:false}};
    const fields=M.roundFields(1,seed,0,config,previous),q=fields.question,gen=q.parameters.generation,row=S.range(stage,q.variant,config.quantity.progression);
    assert.equal(q.challenge.quantityStage,stage);assert.equal(gen.poolSize,row.answerMax);assert(gen.minCount>=row.minCount&&gen.maxCount<=row.maxCount);
    const stage0=M.roundFields(1,seed,0,config).question;assert.equal(q.variant,stage0.variant);seen.add(stage+'-'+q.variant);
    const counts=q.version===1?[q.target]:Object.values(q.target);assert(counts.every(n=>n>=gen.minCount&&n<=gen.maxCount));
    const initial=C.initialAnswer(q,config);assert(C.validateAnswer(q,initial,config));assert(C.validateAnswer(q,q.version===1?0:Object.fromEntries(q.groups.map(g=>[g.id,0])),config));
    const pool=q.version===1?{single:Q.createPool(q.seed,gen)}:G.createPools(q.seed,q.variant,gen);
    assert.deepEqual(pool,q.version===1?{single:Q.createPool(q.seed,gen)}:G.createPools(q.seed,q.variant,gen));
    if(q.version===2){assert.equal(q.renderingVersion,3);assert(Object.keys(pool).length*gen.poolSize<=220);const r=Appearance.radius(gen,q.groups.length)*1.4,flat=Object.values(pool).flat();for(let i=0;i<flat.length;i++){const p=flat[i];assert(p.x>=r&&p.x<=1-r&&p.y>=r*Q.aspect&&p.y<=1-r*Q.aspect);for(let j=0;j<i;j++)assert(Math.hypot(p.x-flat[j].x,(p.y-flat[j].y)/Q.aspect)+1e-12>=r*2);}}
}
assert.equal(seen.size,12);
for(const version of [1,2,3]){const g={id:'triangle',shape:'triangle',color:'#c5a0ff'},v=Appearance.group(g,version);assert.equal(v.color,version===3?'#55c477':version===2?'#cc79a7':g.color);}
const future=create({categoryMode:'quantity'},3);future.roster.p2.type='cpu';assert.deepEqual(M.roundFields(2,55,0,future.config,future).roundHumans,['p0','p1']);
const local=create({categoryMode:'quantity'});const localState={quantityProgress:local.quantityProgress};assert.equal(M.settlePractice(localState,local.question,1,local.timeline,local.question.target,'manual',local.timeline.answerAt+1,local.config).quantityProgress.stage,1);assert.equal(M.settlePractice(localState,local.question,1,local.timeline,local.question.target,'timeout',local.timeline.deadline,local.config).quantityProgress.stage,0);
const migrated=M.options({categoryMode:'pitch',pitch:{variations:{lengths:{easy:{n3:0,n4:0,n5:1},hard:{n3:0,n4:0,n5:1}},positions:{first:0,middle:0,last:0,interior:1}}}});assert.equal(M.roundFields(1,42,0,migrated).question.tones.length,4);

for(let seed=0;seed<300;seed++){const q=M.roundFields(1,seed,0,M.options({categoryMode:'pitch'})).question;positions.add(q.tones.indexOf(q.fixed[0]));}
assert(positions.has(0)&&positions.has(1)&&positions.has(2)&&positions.has(3));
for(const n of [2,8])for(const scenario of ['perfect','imperfect','missing','timeout']){
    let game=create({categoryMode:'quantity'},n),original=clone(game);
    game=finish(game,scenario);assert.equal(game.quantityProgress.stage,scenario==='perfect'?1:0);assert.equal(original.quantityProgress.stage,0);
    assert.equal(M.settle(game,M.token(game),game.timeline.deadline),null);
    const next=M.advance(clone(game),M.token(game),67,game.resultsUntil);assert.equal(next.question.challenge.quantityStage,game.quantityProgress.stage);assert(M.supported(next));
    assert.equal(create({categoryMode:'quantity'},n).quantityProgress.stage,0);
}
let game=create({categoryMode:'quantity'},3);game=M.withdraw(game,'c2',game.timeline.answerAt);game=finish(game);assert.equal(game.quantityProgress.stage,0);
game=M.advance(game,M.token(game),77,game.resultsUntil);assert.deepEqual(game.roundHumans,['p0','p1']);game=finish(game);assert.equal(game.quantityProgress.stage,1);
game=create({categoryMode:'quantity'});
for(let round=1;round<=8;round++){game=finish(game);assert.equal(game.quantityProgress.stage,Math.min(3,round));if(round<8)game=M.advance(game,M.token(game),42+round,game.resultsUntil);}
game=create({categoryMode:'quantity'});const before=clone(game);game=submit(game,'p0',game.question.target,'auto');const receipt=game.submissions.p0;
const retry=M.submit(game,'c0',{...M.token(game),participantId:'p0',answer:receipt.answer,nonce:receipt.nonce,source:'manual'},game.timeline.deadline+1000);assert(retry.duplicate);assert.equal(retry.state.submissions.p0.source,'auto');assert.equal(game.quantityProgress.stage,0);
assert.equal(S.settle(before.quantityProgress,before.question,1,before.timeline,[],[],before.config.quantity.progression,true).stage,0);
const observation={id:'p0',human:true,valid:true,withdrawn:false,answer:before.question.target,acceptedAt:before.timeline.answerAt+1,source:'manual'};
assert.equal(S.settle(before.quantityProgress,before.question,1,before.timeline,['p0'],[observation],before.config.quantity.progression,false).stage,0);
for(const change of [{acceptedAt:before.timeline.deadline},{valid:false},{human:false},{withdrawn:true},{source:'auto'}])assert.equal(S.settle(before.quantityProgress,before.question,1,before.timeline,['p0'],[{...observation,...change}],before.config.quantity.progression,true).stage,0);
// A displayed rounded 100 is insufficient: the raw count comparison is authoritative.
const near={type:'quantity',version:1,target:190},answer=189;assert.equal(Math.round(Q.grade(near.target,answer).score),100);assert.equal(S.exact(near,answer),false);
assert.equal(S.settle(S.initial(),near,1,before.timeline,['p0'],[{...observation,answer}],undefined,true).stage,0);
let last=100;for(let i=0;i<=20000;i++){const score=Color.mapColorErrorToScore(i/10000,V4.parameters());assert(score>=0&&score<=100&&score<=last);assert.equal(score,Color.mapColorErrorToScore(i/10000,V4.parameters()));last=score;}
assert.equal(Color.grade([80,120,160],[80,120,160],V4.parameters()).score,100);
assert.equal(Color.mapColorErrorToScore(.08,V4.parameters()),Color.mapColorErrorToScore(.08,{version:1}));
const comparison=V4.compare([48,146,198],[[48,146,198],[198,96,100]],1.7,{V1:{version:1},V3:{version:3},V4:V4.parameters()});assert(comparison[2].rows[1].score>comparison[1].rows[1].score);
const Recorder=require('../js/games/memory-playtest.js'),Analysis=require('./helpers/memory-playtest-analysis.js'),recording=Recorder.create({source:'automated'});recording.enable(true);
const observed=finish(create({categoryMode:'quantity'}),'timeout');
assert(recording.record({completed:true,mode:'online',matchId:'not-exported',round:observed.round,protocolVersion:9,question:observed.question,config:observed.config,timeline:observed.timeline,multiplier:observed.lastResult.multiplier,quantityStageAfter:observed.quantityProgress.stage,participants:observed.lastResult.rows.map((r,i)=>({id:'p'+(i+1),self:false,answer:observed.submissions[r.id].answer,acceptedElapsedMs:100,submissionSource:observed.submissions[r.id].source,score:r.scoreUnits/1000,error:r.error,missing:false,damageTaken:r.damageUnits/1000,hpBefore:r.hpBeforeUnits/1000,hpRemaining:r.hpAfterUnits/1000}))}));
const exportData=recording.data(),recordedRound=exportData.rounds[0];assert.equal(recordedRound.challengePolicy,'seeded-random-v1');assert.equal(recordedRound.quantityStageAfter,0);assert.equal(recordedRound.participants[1].timedOut,true);assert.equal(recordedRound.participants[0].timedOut,false);assert(Recorder.csv(exportData).includes('quantityStageAfter'));assert(Analysis.summarize([exportData],{source:'all'}).difficulty[0].label.includes('random'));
for(const contour of Slice.contours(V4.parameters()))assert(Math.abs(Color.mapColorErrorToScore(contour.radius,V4.parameters())-contour.score)<1e-9);
let frozen=0;
for(const fixture of require('./fixtures/memory-v8-frozen.json')){
    let state=clone(fixture.initial);assert(M.supported(state));
    for(const [i,expected]of fixture.rounds.entries()){
        for(const key of ['question','questionId','timeline','variantState'])assert.deepEqual(state[key],expected[key]);
        state.participants.forEach(id=>{state=M.submit(state,state.owners[id],{...M.token(state),participantId:id,answer:expected.answer,nonce:'r'+state.round+id},state.timeline.answerAt+100).state;});
        state=M.settle(state,M.token(state),state.timeline.deadline);assert.deepEqual(state.difficultyState,expected.difficultyState);assert.deepEqual(state.lastResult,expected.lastResult);frozen++;
        if(i<fixture.rounds.length-1)state=M.advance(state,M.token(state),43+i,state.resultsUntil);
    }
}
console.log('PASS: v9 generation, score independence, 10,000 seeds/category '+JSON.stringify(totals)+', safe stages/independent groups/density, 2/8 humans exact/imperfect/missing/auto, retry/withdrawal/reset/clamp, unchanged scoring, diagnostic V4 and '+frozen+' frozen v8 rounds.');
