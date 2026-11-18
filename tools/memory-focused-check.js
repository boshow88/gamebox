/** Phase 6D Step 2: new RGB8 single Color, versioned shape geometry and unchanged Pitch scores. */
'use strict';
const assert=require('node:assert/strict'),M=require('../js/games/memory-match.js'),C=require('../js/games/memory-categories.js'),Color=require('../js/games/memory-color.js'),Single=require('../js/games/memory-color-single.js'),Colors=require('../js/games/memory-color-variants.js'),A=require('../js/games/memory-quantity-appearance.js'),G=require('../js/games/memory-quantity-groups.js'),P=require('../js/games/memory-pitch.js'),Calibration=require('./helpers/memory-pitch-calibration.js'),Playtest=require('../js/games/memory-playtest.js');
const roster={a:{id:'a',type:'human',controllerId:'a'},b:{id:'b',type:'human',controllerId:'b'}};
for(let seed=0;seed<4000;seed++){
    const config=M.options({categoryMode:'color'}),fields=M.roundFields(1,seed,0,config),q=fields.question;
    assert.equal(q.version,3);assert.equal(q.variant,'single');assert.equal(q.answerSchema,'rgb8-v1');assert.deepEqual(fields,M.roundFields(1,seed,0,config));
    assert.equal(C.grade(q,q.target,config).score,100);assert.deepEqual(C.grade(q,q.target,config),Color.grade(q.target,q.target,config.scoring));assert.deepEqual(q.target,Colors.hslToRgb(q.targetHsl));
    assert.deepEqual(Colors.hslToRgb(Colors.rgbToHsl(q.target)),q.target);assert(!C.validateAnswer(q,q.targetHsl,config));assert(!C.validateAnswer(q,[1,2,NaN],config));assert(!C.validateAnswer(q,[1,2,3.5],config));
    assert.deepEqual(C.initialAnswer(q,config),[64,191,191]);assert(Single.supported(q,config.color,config.scoring));
}
for(const level of [1,3,5,8,10]){
    const config=M.options({categoryMode:'color',adaptive:{initial:level},color:{weights:{easy:{single:0,hue2:1,hue3:1,hue4:1},hard:{single:0,hue2:1,hue3:1,hue4:1}}}});
    for(let seed=0;seed<100;seed++)assert.equal(M.roundFields(1,seed,0,config).question.variant,'single','Active pool is single even when migrating old Hue weights');
}
for(const fixture of require('./fixtures/memory-v7-frozen.json')){
    let game=structuredClone(fixture.initial),config=structuredClone(game.config);
    for(let index=0;index<12;index++){
        const expected=fixture.rounds[index];assert(M.supported(game));assert.deepEqual(game.question,expected.question);assert.deepEqual(game.timeline,expected.timeline);assert.deepEqual(game.variantState,expected.variantState);
        const answer=game.question.type==='color'&&game.question.version===2?Colors.targetAnswer(game.question):game.question.target;
        for(const id of ['a','b'])game=M.submit(game,'fixture-'+id,{...M.token(game),participantId:id,answer,nonce:id+(index+1)},game.timeline.answerAt+500).state;
        game=M.settle(game,M.token(game),game.timeline.deadline);assert.deepEqual(game.lastResult,expected.lastResult);assert.deepEqual(game.difficultyState,expected.difficultyState);assert.deepEqual(game.config,config);
        if(index<11)game=M.advance(game,M.token(game),43+index,game.resultsUntil);
    }
}
const areas=Object.values(A.relativeAreas);assert(Math.max(...areas)/Math.min(...areas)<1.007);
let layouts=0;
for(const count of [2,3])for(const jitter of [0,0.22,0.3])for(let seed=0;seed<100;seed++){
    const poolSize=Math.floor(220/count),capacity=poolSize*count,columns=Math.ceil(Math.sqrt(capacity*4/3)),rows=Math.ceil(capacity/columns),limit=Math.min((1-2*jitter)/columns,(1-2*jitter)/rows*3/4)/2;
    const gen={minCount:1,maxCount:poolSize,poolSize,jitter,dotRadius:Math.min(0.0105,limit*0.99)},pools=G.createPools(seed,'multi'+count,gen),points=Object.values(pools).flat(),radius=A.radius(gen,count),bound=radius*400*1.4;
    for(let i=0;i<points.length;i++){const p=points[i],x=p.x*400,y=p.y*300;assert(x>=bound&&x<=400-bound&&y>=bound&&y<=300-bound);for(let j=i+1;j<points.length;j++)assert(Math.hypot((p.x-points[j].x)*400,(p.y-points[j].y)*300)>=bound*2-1e-9);}
    assert.deepEqual(pools,G.createPools(seed,'multi'+count,gen));layouts++;
}
let game=M.create(roster,['a','b'],{categoryMode:'color',maxRounds:12},42,0,'new-color');
for(let round=1;round<=12;round++){assert.equal(game.question.version,3);for(const id of ['a','b'])game=M.submit(game,id,{...M.token(game),participantId:id,answer:game.question.target,nonce:id+round},game.timeline.answerAt+500).state;game=M.settle(game,M.token(game),game.timeline.deadline);assert(game.lastResult.rows.every(r=>r.scoreUnits===100000&&r.damageUnits===0));assert.equal(M.settle(game,M.token(game),game.timeline.deadline),null);if(round<12)game=M.advance(game,M.token(game),42+round,game.resultsUntil);}
const defaults=JSON.stringify(P.defaults);for(const row of Calibration.table()){assert(row.scores[0]<=row.scores[1]&&row.scores[1]<=row.scores[2]);for(let i=0;i<3;i++)assert.equal(row.scores[i],Math.round(P.mapErrorToScore(row.rmsCents,{tolerance:[180,210,240][i],exponent:1.3})*1000)/1000);}assert.equal(JSON.stringify(P.defaults),defaults);assert.equal(P.defaults.scoring.tolerance,180);
const legacyPitch=M.create(roster,['a','b'],{categoryMode:'pitch',selectionVersion:2,pitch:{variantSelectionVersion:0}},42,0,'old-pitch'),answer=legacyPitch.question.target.slice();answer[1]*=2**(50/1200);const metrics=Playtest.metrics(legacyPitch.question,answer,legacyPitch.config);assert(Math.abs(metrics.tones[1].centsError-50)<1e-6);assert(metrics.tones.slice(2).every(t=>t.centsError===0));assert(Math.abs(Math.sqrt(metrics.tones.filter(t=>!t.fixed).reduce((sum,t)=>sum+t.centsError*t.centsError,0)/(metrics.toneCount-1))-metrics.rmsCents)<1e-8);
console.log('PASS: 4,000 RGB8 single targets/unchanged V3, all-level single-only selection, 24 pre-change frozen-v7 rounds, '+layouts+' maximum-density collision/boundary layouts, equal-area shapes, atomic RGB settlement and diagnostic-only Pitch tolerances/legacy metrics.');
