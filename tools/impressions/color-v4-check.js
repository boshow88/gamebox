/** Approved V4 defaults, unchanged old curves and frozen protocol-v9 replay. */
'use strict';
const assert=require('node:assert/strict');
const Color=require('../../js/games/impressions/color.js'),M=require('../../js/games/impressions/match.js'),C=require('../../js/games/impressions/categories.js');
const HSL=require('../../js/games/impressions/color-variants.js'),Rules=require('../../js/games/impressions/rules.js'),V4=require('./helpers/color-v4.js');
const clone=structuredClone,expected={version:4,tolerance:.20,exponent:1.4,knee:.08,width:.10,strength:.35,penaltyExponent:1.5};
assert(M.version>=10);assert.deepEqual(Color.defaults.scoring,expected);assert.deepEqual(V4.parameters(),expected);
const experimental={...expected,version:3};
let last=100;
for(let i=0;i<=20000;i++){
    const error=i/10000,score=Color.mapColorErrorToScore(error);
    assert.equal(score,Color.mapColorErrorToScore(error,experimental),'Approved V4 equals the reviewed candidate exactly');
    assert.equal(score,Color.mapColorErrorToScore(error,{version:4}));assert(score>=0&&score<=last);last=score;
    if(error<=.08)assert.equal(score,Color.mapColorErrorToScore(error,{version:1}));
}
const historical=[{version:1,tolerance:.2,exponent:1.4},{version:2,tolerance:.2,exponent:1.4,knee:.06,width:.05,strength:1.2},{version:3,tolerance:.2,exponent:1.4,knee:.06,width:.08,strength:.5,penaltyExponent:1.5}];
for(const version of [1,2,3]){
    assert(Color.supportsScoringVersion(version));
    const defaults=Color.scoringParameters({version});assert.deepEqual(defaults,historical[version-1]);
}
// Reconstruct old formulas independently in this test, with their historical operation order.
for(let i=0;i<=10000;i++)for(const version of [1,2,3]){
    const d=i/10000,p=Color.scoringParameters({version});let score=d===0?100:100*Math.exp(-Math.pow(d/p.tolerance,p.exponent));
    if(version>1&&d>p.knee){const excess=(d-p.knee)/p.width;score*=version===2?Math.exp(-p.strength*excess*excess):Math.exp(-p.strength*Math.pow(excess,p.penaltyExponent));}
    assert.equal(Color.mapColorErrorToScore(d,p),Math.max(0,Math.min(100,score)));
}
assert.deepEqual(HSL.scoringParameters().curve,Color.scoringParameters({version:3}),'Legacy multi-Hue keeps its own V3 curve');
let rounds=0;
for(const fixture of require('./fixtures/v9-frozen.json')){
    let game=clone(fixture.initial);assert(M.supported(game));const config=clone(game.config);
    for(const [i,frame]of fixture.rounds.entries()){
        for(const key of ['question','questionId','timeline','roundTiming','selectionState','variantState','challengeState','quantityProgress','roundHumans'])assert.deepEqual(game[key],frame[key],key);
        for(const id of game.participants)game=M.submit(game,game.owners[id],{...M.token(game),participantId:id,answer:frame.answers[id],nonce:'n'+(i+1)+id,source:'manual'},game.timeline.answerAt+100).state;
        game=M.settle(game,M.token(game),game.timeline.deadline);
        for(const key of Object.keys(frame.settled))assert.deepEqual(game[key],frame.settled[key],key);
        assert.deepEqual(game.config,config);assert.equal(game.protocolVersion,9);rounds++;
        if(i<fixture.rounds.length-1)game=M.advance(game,M.token(game),43+i,game.resultsUntil);
    }
    // Changing only the scoring tuple must leave the entire generation policy intact.
    const old=fixture.initial,newGame=M.create(old.roster,old.seatOrder,{...old.config,scoring:expected},old.question.seed,old.timeline.startAt,'new');
    const oldQuestion=clone(old.question),newQuestion=clone(newGame.question);delete oldQuestion.scoringVersion;delete newQuestion.scoringVersion;
    assert.deepEqual(newQuestion,oldQuestion);const currentConfig=clone(newGame.config);delete currentConfig.cpu;assert.deepEqual(currentConfig,{...old.config,scoring:expected});assert.deepEqual(newGame.timeline,old.timeline);
    const incompatible=clone(newGame);incompatible.protocolVersion=9;assert.equal(M.supported(incompatible),false);
}
for(const n of [2,8]){
    const roster=Object.fromEntries(Array.from({length:n},(_,i)=>['p'+i,{id:'p'+i,type:'human',controllerId:'c'+i}]));
    let game=M.create(roster,Object.keys(roster),{categoryMode:'color',maxRounds:2},42,0,'v4');const initial=clone(game);
    for(let i=0;i<n;i++){
        const hsl={...game.question.targetHsl,h:HSL.wrap(game.question.targetHsl.h+i*12)},answer=HSL.hslToRgb(hsl);
        const request={...M.token(game),participantId:'p'+i,answer,nonce:'answer'+i,source:'manual'};
        game=M.submit(game,'c'+i,request,game.timeline.answerAt+100).state;
        assert.equal(C.grade(game.question,answer,game.config).score,Color.grade(game.question.target,answer,expected).score);
        assert.equal(M.submit(game,'c'+i,request,game.timeline.deadline+1).duplicate,true);
    }
    game=M.settle(game,M.token(game),game.timeline.deadline);assert.equal(M.settle(game,M.token(game),game.timeline.deadline),null);
    for(const row of game.lastResult.rows){const grade=Color.grade(game.question.target,game.submissions[row.id].answer,expected);assert.equal(row.scoreUnits,Rules.scoreToUnits(grade.score));assert.equal(row.damageUnits,Rules.scoreToUnits(Rules.calculateDamage(grade.score,100,game.lastResult.multiplier)));assert.equal(row.hpAfterUnits,initial.hpUnits[row.id]-row.damageUnits);}
    const advanced=M.advance(game,M.token(game),43,game.resultsUntil);assert.equal(advanced.scoringVersion,4);assert.deepEqual(advanced.config.scoring,expected);
}
for(const version of [1,2,3])assert.deepEqual(M.upgradeDefaultScoring({scoring:Color.scoringParameters({version})}).scoring,expected);
assert.equal(M.upgradeDefaultScoring({scoring:expected}),null);assert.equal(M.upgradeDefaultScoring({scoring:{version:3,width:.123}}),null);
console.log('PASS: exact reviewed V4/defaults, deterministic bounded monotonic mapping, unchanged V1/V2/V3 and legacy Hue, '+rounds+' frozen v9 rounds, unchanged generation/config/timing, 2/8 RGB8/HSL-derived settlements and explicit version guards.');
