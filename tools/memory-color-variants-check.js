/** HSL reachability, perceptual palette scoring, frozen state and v1–v5 compatibility. */
'use strict';
const assert = require('node:assert/strict'), H = require('../js/games/memory-color-variants.js'), Color = require('../js/games/memory-color.js');
const M = require('./helpers/memory-legacy-match.js'), C = require('../js/games/memory-categories.js'), P = require('../js/games/memory-progression.js');
const clone = structuredClone, variants = H.variants, roster = Object.fromEntries(['a','b'].map(id => [id,{id,type:'human',controllerId:id}]));
const forced = variant => { const weights = Object.fromEntries(variants.map(id => [id,id === variant ? 1 : 0])); return { variantSelectionVersion:1, weights:{easy:weights,hard:weights} }; };
for (const [h,s,l,rgb] of [[0,100,50,[255,0,0]],[120,100,50,[0,255,0]],[240,100,50,[0,0,255]],[360,100,50,[255,0,0]],[180,50,50,[64,191,191]],[42,0,0,[0,0,0]],[42,0,100,[255,255,255]]]) assert.deepEqual(H.hslToRgb({h,s,l}),rgb);
assert.equal(H.wrap(-0.01),359.99); assert.equal(H.wrap(720),0); assert.equal(H.circularDistance(359,1),2);
for (let seed=0;seed<2000;seed++) {
    const q=H.generateQuestion(seed,'single'), a=H.targetAnswer(q); assert.deepEqual(q,H.generateQuestion(seed,'single')); assert.deepEqual(H.hslToRgb(a),q.target);
    assert.deepEqual(H.hslToRgb(H.rgbToHsl(q.target)),q.target); assert.equal(H.grade(q,a).score,100);
    const changed={...a,h:H.wrap(a.h+15.37)}; assert.deepEqual(H.grade(q,changed),Color.grade(q.target,H.hslToRgb(changed),{version:q.scoringVersion}));
    assert.deepEqual(H.initialAnswer(q),{h:180,s:50,l:50}); assert(q.targetHsl.s>=35&&q.targetHsl.s<=90&&q.targetHsl.l>=30&&q.targetHsl.l<=70);
}
for (const variant of variants.slice(1)) for (let seed=0;seed<400;seed++) {
    const q=H.generateQuestion(seed,variant), before=clone(q); assert.deepEqual(q,H.generateQuestion(seed,variant)); assert.deepEqual(q.swatches,['a','b','c','d'].slice(0,Number(variant.at(-1))));
    q.swatches.forEach((id,i)=>q.swatches.slice(0,i).forEach(other=>assert(H.circularDistance(q.target[id],q.target[other])>=50)));
    assert.deepEqual(H.initialAnswer(q),Object.fromEntries(q.swatches.map(id=>[id,180]))); assert.equal(H.grade(q,q.target).score,100);
    const a={...q.target,[q.swatches[0]]:H.wrap(q.target.a+80)}, grade=H.grade(q,a), distances=q.swatches.map(id=>Color.calculateColorError(H.answerRgb(q,q.target,id),H.answerRgb(q,a,id)));
    assert(Math.abs(grade.error-Math.hypot(...distances)/Math.sqrt(q.swatches.length))<1e-12); assert.equal(grade.score,Math.round(Color.mapColorErrorToScore(grade.error,{version:3})*1000)/1000); assert.deepEqual(q,before);
    const sorted=Array.from({length:60},(_,i)=>H.grade(q,{...q.target,a:H.wrap(q.target.a+i*3)})).sort((a,b)=>a.errors.a-b.errors.a);
    sorted.forEach((g,i)=>{assert(Number.isFinite(g.score)&&g.score>=0&&g.score<=100);if(i)assert(g.score<=sorted[i-1].score);});
}
const q=H.generateQuestion(42,'hue4');
for(const patch of [{version:99},{multiScoring:{version:99}}]){assert.equal(H.supported(q,patch,Color.defaults.scoring),false);const g=M.create(roster,['a','b'],{categoryMode:'color',color:forced('hue4')},42,0);g.config.color={...g.config.color,...patch};assert.equal(M.supported(g),false);assert.equal(M.submit(g,'a',{...M.token(g),participantId:'a',answer:q.target,nonce:'unknown'},g.timeline.answerAt),null);}
for(const a of [null,[],[1,2,3,4],{}, {...q.target,a:NaN},{...q.target,b:Infinity},{...q.target,c:-1},{...q.target,d:360.01},{...q.target,score:100}])assert(!H.validateAnswer(q,a));
for(const a of [{h:-1,s:50,l:50},{h:180,s:101,l:50},{h:180,s:50,l:null},{h:180,s:50,l:50,score:100},[180,50,50]])assert(!H.validHsl(a));
const boundary={...H.generateQuestion(1,'hue2'),target:{a:359,b:120}}; const boundaryGrade=H.grade(boundary,{a:1,b:120}); assert(boundaryGrade.score>99); assert.deepEqual(H.hslToRgb({h:0,s:65,l:55}),H.hslToRgb({h:360,s:65,l:55}));
for(const input of [{version:2},{variantSelectionVersion:2},{fixed:{s:0}},{initialHsl:{s:0}},{multiScoring:{version:2}},{weights:{easy:{single:0,hue2:0,hue3:0,hue4:0}}},{hue4:{memorizeMs:0}}]) assert.throws(()=>H.configuration(input));
for(let seed=0;seed<200;seed++){const q=H.generateQuestion(seed,'hue4',{separation:{easy:75,hard:75}});q.swatches.forEach((id,i)=>q.swatches.slice(0,i).forEach(other=>assert(H.circularDistance(q.target[id],q.target[other])>=75)));}
for(const level of [1,5,10])for(const variant of variants)for(let seed=0;seed<50;seed++){
    const base=M.options({categoryMode:'color',adaptive:{initial:level},color:forced(variant)}),state=P.difficulty(base.adaptive),before=clone(state),prepared=H.prepare(seed,base,state),q=H.generateQuestion(seed,variant,base.color,prepared.metadata.parameters.color),frozen={...q,...prepared.metadata};
    assert.deepEqual(prepared,H.prepare(seed,base,state));assert.deepEqual(state,before);assert.equal(C.grade(frozen,H.targetAnswer(q),base).score,100);assert.equal(prepared.variant,variant);
    if(variant==='single')assert.deepEqual(prepared.metadata.parameters.timing,P.prepare('color',seed,base,state,base.adaptive).parameters.timing);
    else{assert.equal(prepared.metadata.parameters.timing.answerMs,base.color[variant].answerMs);assert(prepared.metadata.parameters.timing.memorizeMs>=1500);q.swatches.forEach((id,i)=>q.swatches.slice(0,i).forEach(other=>assert(H.circularDistance(q.target[id],q.target[other])>=prepared.metadata.parameters.color.separation)));}
}
for(const level of [1,3,5,8,10]) {let state=H.initialState();const seen=new Set();for(let seed=0;seed<600;seed++){const previous=clone(state),r=H.select(seed,level,{},state);assert.deepEqual(r,H.select(seed,level,{},state));assert.deepEqual(state,previous);assert(r.state.streak<=2);state=r.state;seen.add(r.variant);}assert.deepEqual([...seen].sort(),[...variants].sort());}
for(const variant of variants) {
    let game=M.create(roster,['a','b'],{categoryMode:'color',maxRounds:4,color:{...forced(variant),multiScoring:{curve:{tolerance:0.24,width:0.1}}}},42,1000,variant), config=clone(game.config);
    for(let round=1;round<=4;round++) {assert.equal(game.protocolVersion,M.version);assert.equal(game.question.variant,variant);assert(M.supported(game));const token=M.token(game),answer=H.targetAnswer(game.question),state=clone(game.variantState);
        assert.equal(M.submit(game,'a',{...token,participantId:'a',answer:[1,2,3],nonce:'wrong'},game.timeline.answerAt),null);
        for(const id of ['a','b'])game=M.submit(game,id,{...token,participantId:id,answer,nonce:id+round},game.timeline.answerAt).state;
        assert(M.receipt(game,'a',{...token,participantId:'a',answer,nonce:'a'+round}));game=M.settle(game,token,game.timeline.deadline);assert(game.lastResult.rows.every(r=>r.scoreUnits===100000&&r.damageUnits===0));assert.deepEqual(game.variantState,state);assert.deepEqual(game.config,config);assert.equal(M.settle(game,token,game.timeline.deadline),null);
        if(round<4){const next=M.advance(game,token,42+round,game.resultsUntil);assert.deepEqual(next,M.advance(game,token,42+round,game.resultsUntil));game=next;}
    } assert.equal(game.variantState.color.draw,4);assert.equal(game.difficultyState.historyByType.color.length,4);
}
for(const version of [1,2,3,4,5]) {
    let g=M.create(roster,['a','b'],{categoryMode:version===1?'color':'mixed',selectionVersion:version<=3?version===2?1:2:3,color:{variantSelectionVersion:0},quantity:{variantSelectionVersion:version===5?1:0,renderingVersion:1},maxRounds:6},42,0,'legacy'+version);
    g.protocolVersion=version;delete g.config.color;if(version===1){delete g.categoryId;delete g.config.selectionVersion;delete g.question.scoringVersion;}if(version===2)delete g.config.selectionVersion;
    const config=clone(g.config);for(let r=1;r<=6;r++){assert(M.supported(g));if(g.categoryId==='color'||version===1){assert.equal(g.question.version,1);assert(Array.isArray(g.question.target));}const token=M.token(g);for(const id of ['a','b'])g=M.submit(g,id,{...token,participantId:id,answer:clone(g.question.target),nonce:id+r},g.timeline.answerAt).state;g=M.settle(g,token,g.timeline.deadline);assert(g.lastResult.rows.every(row=>row.scoreUnits===100000));if(r<6)g=M.advance(g,token,r+42,g.resultsUntil);assert.deepEqual(g.config,config);assert.equal(g.variantState&&g.variantState.color,undefined);}
}
console.log('PASS: 2,000 reachable HSL targets/exact V3 agreement, 1,200 deterministic separated palettes, circular boundaries, target-independent starts, perceptual RMS/monotonicity, keyed validation, frozen custom mapping/once-only settlement, all-level variants and full v1–v5 legacy advancement.');
if(process.argv.includes('--diagnostics'))for(const variant of variants.slice(1)){const q=H.generateQuestion(42,variant);console.table([0,5,15,45,120].map(delta=>{const answer={...q.target,a:H.wrap(q.target.a+delta)},g=H.grade(q,answer);return{variant,target:JSON.stringify(q.target),firstHueDelta:delta,rms:g.error.toFixed(5),score:g.score};}));}
