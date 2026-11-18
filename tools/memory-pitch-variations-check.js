/** Varied melody generation, reference identities, audio budgets and legacy compatibility. */
'use strict';
const assert=require('node:assert/strict'),V=require('../js/games/memory-pitch-variations.js'),P=require('../js/games/memory-pitch.js'),M=require('./helpers/memory-legacy-match.js'),C=require('../js/games/memory-categories.js'),Progression=require('../js/games/memory-progression.js'),Audio=require('../js/games/memory-audio.js');
const clone=structuredClone, roster=Object.fromEntries(['a','b'].map(id=>[id,{id,type:'human',controllerId:id}]));
const forced=(n,refs=1)=>({lengths:{easy:{n3:n===3?1:0,n4:n===4?1:0,n5:n===5?1:0},hard:{n3:n===3?1:0,n4:n===4?1:0,n5:n===5?1:0}},references:{easy:{one:refs===1?1:0,two:refs===2?1:0},hard:{one:refs===1?1:0,two:refs===2?1:0}}});
let questions=0;
for(const n of [3,4,5])for(const contour of V.contours)for(let seed=0;seed<100;seed++){
    const variation={version:1,toneCount:n,fixedIndices:[seed%n],contour},generation=V.generationParameters({toneCount:n}),q=V.generateQuestion(seed,variation,generation);questions++;
    assert.deepEqual(q,V.generateQuestion(seed,variation,generation));assert(Object.isFrozen(q)&&Object.isFrozen(q.target));assert.equal(V.grade(q,q.target,{},generation).score,100);
    const hz=V.sequence(q,q.target),cents=hz.map(h=>Math.round(P.hzToCents(h))),steps=cents.slice(1).map((c,i)=>c-cents[i]);
    assert(hz.every(h=>h>=generation.minHz&&h<=generation.maxHz));assert(hz.every(h=>P.centsToHz(Math.round(P.hzToCents(h)))===h));assert(steps.every(d=>Math.abs(d)>=generation.minInterval&&Math.abs(d)<=generation.maxInterval));
    if(contour==='ascending')assert(steps.every(d=>d>0));if(contour==='descending')assert(steps.every(d=>d<0));if(contour==='arch')assert(steps[0]>0&&steps.at(-1)<0);if(contour==='valley')assert(steps[0]<0&&steps.at(-1)>0);
    const initial=V.initialAnswer(q);q.tones.forEach(id=>assert.equal(initial[id],q.fixed.includes(id)?q.target[id]:440));assert.deepEqual(q.tones,['n1','n2','n3','n4','n5'].slice(0,n));
}
for(const n of [4,5])for(let seed=0;seed<100;seed++){
    const q=V.generateQuestion(seed,{version:1,toneCount:n,fixedIndices:[0,n-1],contour:'mixed'}),g=V.generationParameters({toneCount:n});assert.equal(q.tones.length-q.fixed.length,n-2);assert(V.validateAnswer(q,q.target,g));
    const adjustable=q.tones.filter(id=>!q.fixed.includes(id)),one=adjustable[0],target={...q.target};
    let previous=100;for(let error=0;error<=300;error+=5){const answer={...target,[one]:target[one]*2**((target[one]>600?-error:error)/1200)},grade=V.grade(q,answer,{},g);if(!grade.valid)continue;assert(grade.score<=previous&&grade.score>=0);previous=grade.score;assert(Math.abs(grade.error-error/Math.sqrt(n-2))<1e-8);assert.deepEqual(grade,V.grade(q,answer,{},g));assert.equal(Object.keys(grade.errors).length,n-2);}
    for(const bad of [null,[],Object.values(q.target),{}, {...target,n1:target.n1+1},{...target,extra:100},{...target,[one]:NaN},{...target,[one]:0},{...target,[one]:2001}])assert(!V.validateAnswer(q,bad,g));
    assert(!V.supported({...q,fixed:['n2','n3']},g,P.defaults.scoring));assert(!V.supported(q,{...g,toneCount:3},P.defaults.scoring));
}
for(const level of [1,3,5,8,10]){
    const lengths=new Set(),references=new Set(),contours=new Set();let state=V.initialState();
    for(let seed=0;seed<1000;seed++){const before=clone(state),selected=V.select(seed,level,{},state);assert.deepEqual(selected,V.select(seed,level,{},state));assert.deepEqual(state,before);state=selected.state;assert(state.streak<=2&&state.contourStreak<=2);const v=selected.variation;lengths.add(v.toneCount);references.add(v.fixedIndices.join(','));contours.add(v.contour);assert(v.toneCount-v.fixedIndices.length>=2);}
    assert.deepEqual([...lengths].sort(),[3,4,5]);assert(references.has('0')&&references.has('1')&&references.has('2')&&references.has('4')&&references.has('0,4'));assert.equal(contours.size,6);
}
for(const n of [3,4,5])for(const position of ['first','middle','last']){const p={...forced(n,1),positions:{first:0,middle:0,last:0,interior:0,[position]:1}},v=V.select(42,5,p).variation;assert.deepEqual(v.fixedIndices,[position==='first'?0:position==='last'?n-1:Math.floor(n/2)]);}
assert.throws(()=>V.generationParameters({minInterval:150.2,maxInterval:150.8}));
for(const n of [3,4,5])for(const refs of n===3?[1]:[1,2])for(const level of [1,5,10])for(let seed=0;seed<25;seed++){
    const config=M.options({categoryMode:'pitch',adaptive:{initial:level},pitch:{variations:forced(n,refs)}}),d=Progression.difficulty(config.adaptive),before=clone(d),prepared=V.prepare(seed,config,d),q={...V.generateQuestion(seed,prepared.variation,prepared.metadata.parameters.generation),...prepared.metadata};
    assert.deepEqual(prepared,V.prepare(seed,config,d));assert.deepEqual(d,before);assert.equal(q.tones.length,n);assert.equal(q.fixed.length,refs);assert.equal(C.grade(q,q.target,config).score,100);
    const plan=Audio.plan(V.sequence(q,q.target),config.pitch.audio),duration=q.parameters.timing.memorizeMs;assert.equal(plan.length,n*config.pitch.audio.repeats);assert(plan.at(-1).endMs+q.parameters.pitch.safetyMs<=duration);assert.equal(q.parameters.generation.minHz,config.pitch.generation.minHz);assert.equal(q.parameters.generation.maxHz,config.pitch.generation.maxHz);
}
for(const repeats of [1,2,3]){
    const config=M.options({categoryMode:'pitch',adaptive:{initial:10},pitch:{timing:{memorizeMs:1000},audio:{repeats,toneMs:1000,gapMs:400,repeatGapMs:1000},variations:forced(5,2)}}),fields=M.roundFields(1,42,0,config),notes=Audio.plan(V.sequence(fields.question,fields.question.target),config.pitch.audio);
    assert(fields.timeline.answerAt-fields.timeline.memorizeAt>=notes.at(-1).endMs+300);assert.equal(fields.question.parameters.pitch.requiredMemorizeMs,notes.at(-1).endMs+300);
}
for(const input of [{version:2},{lengths:{easy:{n3:0,n4:0,n5:0}}},{references:{hard:{one:0,two:0}}},{timing:{safetyMs:0}},{contours:Object.fromEntries(V.contours.map(id=>[id,0]))}])assert.throws(()=>V.configuration(input));
for(const bad of [-1,2**32,1.1,'42',NaN])assert.throws(()=>V.select(bad,5));
for(const n of [3,4,5])for(const refs of n===3?[1]:[1,2]){
    let g=M.create(roster,['a','b'],{categoryMode:'pitch',maxRounds:4,pitch:{scoring:{tolerance:200,exponent:1.5},variations:forced(n,refs)}},42,1000,'varied'),config=clone(g.config);
    for(let round=1;round<=4;round++){assert.equal(g.protocolVersion,M.version);assert(M.supported(g));const token=M.token(g),question=clone(g.question),state=clone(g.variantState);assert.equal(g.question.tones.length,n);assert.equal(g.question.fixed.length,refs);
        for(const id of ['a','b'])g=M.submit(g,id,{...token,participantId:id,answer:clone(g.question.target),nonce:id+round},g.timeline.answerAt).state;
        g=M.settle(g,token,g.timeline.deadline);assert(g.lastResult.rows.every(row=>row.scoreUnits===100000&&row.damageUnits===0));assert.deepEqual(g.config,config);assert.deepEqual(g.question,question);assert.deepEqual(g.variantState,state);assert.equal(M.settle(g,token,g.timeline.deadline),null);if(round<4){const next=M.advance(g,token,42+round,g.resultsUntil);assert.deepEqual(next,M.advance(g,token,42+round,g.resultsUntil));g=next;}}
    assert.equal(g.variantState.pitch.draw,4);assert.equal(g.difficultyState.historyByType.pitch.length,4);
}
for(const version of [1,2,3,4,5,6]){
    let g=M.create(roster,['a','b'],{categoryMode:version===1?'color':'mixed',selectionVersion:version<=3?version===2?1:2:3,color:{variantSelectionVersion:version>=6?1:0},quantity:{variantSelectionVersion:version>=5?1:0,renderingVersion:1},pitch:{variantSelectionVersion:0},maxRounds:12},42,0,'legacy'+version);g.protocolVersion=version;delete g.config.pitch.variantSelectionVersion;delete g.config.pitch.variations;if(version===1){delete g.categoryId;delete g.config.selectionVersion;delete g.question.scoringVersion;}if(version===2)delete g.config.selectionVersion;const config=clone(g.config);
    for(let r=1;r<=12;r++){assert(M.supported(g));if(g.question.type==='pitch'){assert.equal(g.question.version,1);assert(Array.isArray(g.question.target));assert.equal(g.question.fixed,undefined);}const token=M.token(g),answer=g.question.type==='color'&&g.question.version===2?require('../js/games/memory-color-variants.js').targetAnswer(g.question):g.question.target;for(const id of ['a','b'])g=M.submit(g,id,{...token,participantId:id,answer,nonce:id+r},g.timeline.answerAt).state;g=M.settle(g,token,g.timeline.deadline);assert(g.lastResult.rows.every(row=>row.scoreUnits===100000));if(r<12)g=M.advance(g,token,r+42,g.resultsUntil);assert.deepEqual(g.config,config);assert.equal(g.variantState&&g.variantState.pitch,undefined);}
}
console.log('PASS: '+questions+' deterministic reachable contour melodies, 200 two-reference cases, adjustable-only RMS/monotonicity, strict ID maps, all-level lengths/references/contours, 375 frozen adaptive plans and full audio budgets, custom scoring/once-only settlement and complete protocol-v1–v6 advancement.');
if(process.argv.includes('--diagnostics'))for(const n of [3,4,5])for(const refs of n===3?[1]:[1,2]){const q=V.generateQuestion(42,{version:1,toneCount:n,fixedIndices:refs===1?[n-1]:[0,n-1],contour:'arch'}),id=q.tones.find(id=>!q.fixed.includes(id));console.table([0,25,100,180,300].map(cents=>{const answer={...q.target,[id]:q.target[id]*2**(cents/1200)},g=V.grade(q,answer,{},V.generationParameters({toneCount:n}));return{tones:n,references:refs,oneToneError:cents,rms:g.error,score:g.score};}));}
