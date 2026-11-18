/** CPU model, normal battle reducers, real room adapter and lifecycle regression. */
'use strict';
const assert=require('node:assert/strict'),M=require('../js/games/impressions-match.js'),Cpu=require('../js/games/impressions-cpu.js'),C=require('../js/games/impressions-categories.js'),Rules=require('../js/games/impressions-rules.js'),P=require('../js/games/impressions-pitch.js');
const clone=structuredClone;
function roster(n=4){const r={h:{id:'h',type:'human',controllerId:'owner'}};for(let i=1;i<n;i++)r['c'+i]={id:'c'+i,type:'cpu',controllerId:'owner',difficulty:i%4+1,cpuVersion:1};return r;}
function create(category='color',n=4,seed=42){const r=roster(n);return M.create(r,Object.keys(r),{categoryMode:category,maxRounds:2},seed,1000,'cpu-test');}
assert.equal(M.version,14);assert.equal(Cpu.version,1);
assert.throws(()=>M.create({c:{id:'c',type:'cpu',controllerId:'x',difficulty:2}},['c'],{},42,0));
for(const difficulty of [0,5,'2',NaN])assert.throws(()=>{const r=roster();r.c1.difficulty=difficulty;return M.create(r,Object.keys(r),{},42,0);});
{const r=roster();r.c1.controllerId='other';assert.throws(()=>M.create(r,Object.keys(r),{},42,0));}
const scores={},distinct=new Set(),delays=new Set();
for(const type of ['color','quantity','pitch'])for(let seed=0;seed<300;seed++){
    const game=create(type,5,seed);assert(M.supported(game));const frozen=clone(game);
    for(const id of Object.keys(game.roster).filter(id=>id!=='h')){
        const answer=Cpu.answer(game,id),plan=Cpu.plan(game,id),grade=C.grade(game.question,answer,game.config),key=type+'-'+game.roster[id].difficulty;
        assert.deepEqual(answer,Cpu.answer(clone(game),id));assert.deepEqual(plan,Cpu.plan(clone(game),id));assert(C.validateAnswer(game.question,answer,game.config));assert(plan.dueAt>game.timeline.answerAt&&plan.dueAt<game.timeline.deadline);distinct.add(type+JSON.stringify(answer));delays.add(plan.dueAt-game.timeline.answerAt);
        (scores[key]||= []).push(grade.score);
        if(type==='pitch')for(const ref of game.question.fixed)assert.equal(answer[ref],game.question.target[ref]);
    }assert.deepEqual(game,frozen);
}
assert(distinct.size>2000);assert(delays.size>500);
for(const type of ['color','quantity','pitch']){
    const average=level=>scores[type+'-'+level].reduce((a,b)=>a+b,0)/scores[type+'-'+level].length;
    assert(average(4)>average(3)&&average(3)>average(2)&&average(2)>average(1));
    for(const level of [1,2,3,4])assert(new Set(scores[type+'-'+level]).size>40,'Every difficulty has variance');
}
for(const type of ['quantity','pitch']){const g=create(type),a=Cpu.answer(g,'c1'),next=clone(g);next.config.cpu.color.sigmaLab=[.9,.8,.7,.6];assert.deepEqual(Cpu.answer(next,'c1'),a);next.config.cpu.timing[type].maxFraction=.9;assert.deepEqual(Cpu.answer(next,'c1'),a);}
{const g=create(),next=clone(g);next.humanDraft=[1,2,3];next.submissions.h={answer:[255,0,0]};assert.deepEqual(Cpu.answer(next,'c1'),Cpu.answer(g,'c1'));assert.deepEqual(Cpu.plan(next,'c1'),Cpu.plan(g,'c1'));}
{const g=create(),grade=C.grade;C.grade=()=>{throw Error('CPU must not grade answers');};assert(Cpu.answer(g,'c1'));C.grade=grade;}
for(const n of [2,8])for(const type of ['color','quantity','pitch']){
    let game=create(type,n),original=clone(game);assert.deepEqual(game.roundHumans,['h']);
    for(const id of game.participants){const cpu=id!=='h',answer=cpu?Cpu.answer(game,id):game.question.target,request={...M.token(game),participantId:id,answer,nonce:'n'+id,source:cpu?'cpu':'manual'};
        assert.equal(M.submit(game,'foreign',request,game.timeline.answerAt+1),null);assert.equal(M.submit(game,'owner',{...request,source:cpu?'manual':'cpu'},game.timeline.answerAt+1),null);
        assert.equal(M.submit(game,'owner',request,game.timeline.deadline),null);game=M.submit(game,'owner',request,game.timeline.answerAt+1).state;assert(M.submit(game,'owner',request,game.timeline.deadline+1).duplicate);
    }
    game=M.settle(game,M.token(game),game.timeline.deadline);assert(game);assert.equal(game.quantityProgress.stage,type==='quantity'?1:0);
    for(const row of game.lastResult.rows){const grade=C.grade(game.question,game.submissions[row.id].answer,game.config);assert.equal(row.scoreUnits,Rules.scoreToUnits(grade.score));assert.equal(row.damageUnits,Rules.scoreToUnits(Rules.calculateDamage(grade.score,game.lastResult.highestScoreUnits/1000,game.lastResult.multiplier)));assert.equal(row.hpAfterUnits,original.hpUnits[row.id]-row.damageUnits);}
    assert.equal(M.settle(game,M.token(game),game.timeline.deadline),null);
    const advanced=M.advance(game,M.token(game),43,game.resultsUntil);assert(M.supported(advanced));
    const stale={...M.token(original),participantId:'c1',answer:Cpu.answer(original,'c1'),source:'cpu',nonce:'stale'};assert.equal(M.submit(advanced,'owner',stale,advanced.timeline.answerAt),null);
}
{let g=create('quantity');g.hpUnits.h=0;g.settledRound=1;g.eliminations.h={round:1,rawRemainingHpUnits:0};const f=M.roundFields(2,64,0,g.config,g);g={...g,...f};assert(M.supported(g));assert.deepEqual(g.roundHumans,[]);for(const id of M.activeIds(g))g=M.submit(g,'owner',{...M.token(g),participantId:id,answer:g.question.target,nonce:id,source:'cpu'},g.timeline.answerAt).state;g=M.settle(g,M.token(g),g.timeline.deadline);assert.equal(g.quantityProgress.stage,0);assert(g.lastResult.rows.every(row=>g.roster[row.id].type==='cpu'));}
{const r=roster(2);let g=M.create(r,Object.keys(r),{categoryMode:'quantity',startingHp:1},42,0,'cpu-win');const zero=g.question.version===1?0:Object.fromEntries(g.question.groups.map(group=>[group.id,0]));g=M.submit(g,'owner',{...M.token(g),participantId:'h',answer:zero,nonce:'human-zero',source:'manual'},g.timeline.answerAt).state;g=M.submit(g,'owner',{...M.token(g),participantId:'c1',answer:g.question.target,nonce:'cpu-exact',source:'cpu'},g.timeline.answerAt).state;g=M.settle(g,M.token(g),g.timeline.deadline);assert.deepEqual(g.winners,['c1']);assert.equal(g.hpUnits.h,0);assert.equal(g.quantityProgress.stage,0);}
{let g=create('quantity');g.hpUnits.c1=0;g.settledRound=1;g.eliminations.c1={round:1,rawRemainingHpUnits:0};g={...g,...M.roundFields(2,62,0,g.config,g)};assert.equal(M.submit(g,'owner',{...M.token(g),participantId:'c1',answer:g.question.target,nonce:'eliminated',source:'cpu'},g.timeline.answerAt),null);}
let frozenRounds=0;
for(const fixture of require('./fixtures/impressions-v10-frozen.json')){let g=clone(fixture.initial);assert(M.supported(g));for(const [i,frame]of fixture.rounds.entries()){for(const key of ['question','questionId','timeline','roundTiming','selectionState','variantState','challengeState','quantityProgress','roundHumans'])assert.deepEqual(g[key],frame[key]);for(const id of g.participants)g=M.submit(g,g.owners[id],{...M.token(g),participantId:id,answer:frame.answers[id],nonce:'n'+(i+1)+id,source:'manual'},g.timeline.answerAt+100).state;g=M.settle(g,M.token(g),g.timeline.deadline);for(const key of Object.keys(frame.settled))assert.deepEqual(g[key],frame.settled[key]);frozenRounds++;if(i<11)g=M.advance(g,M.token(g),43+i,g.resultsUntil);}}
(async()=>{
    // Retain the pre-7C deadline cadence for this CPU ownership/timing fixture;
    // impressions-flow-check separately exercises the unmodified v13 room path.
    const fixture=options=>require('./helpers/impressions-cpu-room-fixture.js')(options,{protocolVersion:12});
    const f=await fixture({categoryMode:'quantity',maxRounds:3}),[a,b]=await f.setup(2);assert(!a.canStart());
    await f.flush(a.addCpuPlayer('A CPU',4));await f.flush(b.addCpuPlayer('B CPU',1));let ids=f.get().seatOrder.filter(id=>f.get().participants[id].type==='cpu'),aid=ids.find(id=>f.get().participants[id].controllerId===a.service.currentPlayer().uid),bid=ids.find(id=>id!==aid);
    const revision=f.get().revision;assert.equal(await f.flush(b.renameCpu(aid,'foreign')),false);assert.equal(await f.flush(b.setCpuDifficulty(aid,1)),false);assert.equal(await f.flush(b.removeCpuPlayer(aid)),false);assert.equal(f.get().revision,revision);
    await f.flush(b.ready());await f.flush(a.renameCpu(aid,'Renamed CPU'));assert.deepEqual(f.get().ready,{});await f.flush(a.setCpuDifficulty(aid,3));assert.equal(f.get().participants[aid].difficulty,3);
    for(let i=0;i<4;i++)await f.flush(a.addCpuPlayer('Extra '+i,2));assert.equal(f.get().seatOrder.length,8);assert.equal(await f.flush(a.addCpuPlayer()),false);assert.equal(await f.flush(b.addCpuPlayer()),false);
    for(const id of [...f.get().seatOrder].filter(id=>!['h',aid,bid].includes(id)&&f.get().participants[id].type==='cpu'))await f.flush(a.removeCpuPlayer(id));assert.equal(f.get().seatOrder.length,4);
    await f.flush(a.configure({cpu:{pitch:{sigmaCents:[270,170,100,50]}}}));await f.flush(a.configure({cpu:{color:{sigmaLab:[.11,.07,.04,.02]}}}));assert.deepEqual(f.get().options.cpu.pitch.sigmaCents,[270,170,100,50]);
    await f.start();const g=clone(f.game()),token=M.token(g);assert.equal(await f.flush(a.removeCpuPlayer(aid)),false);assert.equal(await f.flush(a.setCpuDifficulty(aid,1)),false);assert.deepEqual(g.roster[aid],f.get().participants[aid]);
    f.setTime(g.timeline.answerAt-1);await f.flush(Promise.all([a.tick(),b.tick()]));assert.deepEqual(f.game().submissions,{});
    const firstDue=Math.min(...ids.map(id=>Cpu.plan(g,id).dueAt));await f.pulse(firstDue-1);assert.equal(Object.keys(f.game().submissions).length,0);
    await f.flush(a.submit(g.question.target,token,'human-a'));await f.flush(b.submit(g.question.target,token,'human-b'));await f.pulse(g.timeline.deadline-100);
    assert(f.game().submissions[aid]&&f.game().submissions[bid]);assert.equal(f.game().quantityProgress.stage,0);await f.pulse(g.timeline.deadline);assert.equal(f.game().quantityProgress.stage,1);const settled=clone(f.game());await f.flush(Promise.all([a.settle(token),b.settle(token),a.tick(),b.tick()]));assert.deepEqual(f.game().hpUnits,settled.hpUnits);assert.deepEqual(f.game().quantityProgress,settled.quantityProgress);
    await f.pulse(settled.resultsUntil);let next=clone(f.game());assert.equal(next.round,2);
    f.db.disconnectPlayer(a.service.currentPlayer().uid);await f.db.flush();await f.pulse(next.timeline.answerAt+100,[b]);assert.equal(await a.tick(),false);f.db.reconnectPlayer(a.service.currentPlayer().uid);await f.db.flush();await f.flush(a.tick());await f.pulse(next.timeline.deadline-100);assert(f.game().submissions[aid]);
    await f.pulse(next.timeline.deadline);assert.equal(f.game().quantityProgress.stage,1,'Missing humans block progression');await f.pulse(f.game().resultsUntil);next=clone(f.game());
    await f.flush(a.leave());assert(f.game().withdrawn.includes(aid));assert.equal(f.game().owners[bid],b.service.currentPlayer().uid);await f.pulse(next.timeline.deadline-100,[b]);assert(f.game().submissions[bid]);await f.pulse(next.timeline.deadline,[b]);assert.equal(f.game().status,'over');assert.equal(f.game().quantityProgress.stage,1);await f.flush(b.backToLobby());assert.equal(f.get().seatOrder.length,2);await f.start();assert.equal(f.game().quantityProgress.stage,0);
    const solo=await fixture({categoryMode:'color',maxRounds:12,startingHp:50000}),[owner]=await solo.setup(1);assert(!owner.canStart());await solo.flush(owner.addCpuPlayer('CPU 1',1));await solo.flush(owner.addCpuPlayer('CPU 2',4));assert(owner.canStart());await solo.start();for(let round=1;round<=12;round++){const q=clone(solo.game());await solo.pulse(q.timeline.answerAt);await solo.flush(owner.submit(q.question.target,M.token(q),'h'+round));await solo.pulse(q.timeline.deadline);assert.equal(solo.game().lastResult.rows.length,3);if(round<12)await solo.pulse(solo.game().resultsUntil);}assert.equal(solo.game().status,'over');assert(solo.game().winners.includes(owner.playerId()));
    const late=await fixture({categoryMode:'quantity',maxRounds:3,timing:{prepareMs:1000,memorizeMs:1000,answerMs:1000,resultsMs:1000}}),[x,y]=await late.setup(2);await late.flush(x.addCpuPlayer('X CPU',1));await late.flush(y.addCpuPlayer('Y CPU',4));await late.start();let lg=clone(late.game()),xid=lg.participants.find(id=>lg.roster[id].type==='cpu'&&lg.owners[id]===x.service.currentPlayer().uid);
    await late.pulse(lg.timeline.answerAt);await late.flush(Promise.all([x.submit(lg.question.target,M.token(lg),'hx'),y.submit(lg.question.target,M.token(lg),'hy')]));late.db.disconnectPlayer(x.service.currentPlayer().uid);await late.db.flush();await late.pulse(lg.timeline.deadline,[y]);assert.equal(late.game().submissions[xid],undefined);assert.equal(late.game().lastResult.rows.find(r=>r.id===xid).missing,true);assert.equal(late.game().quantityProgress.stage,1,'An absent CPU does not block exact humans');late.db.reconnectPlayer(x.service.currentPlayer().uid);await late.db.flush();await late.flush(x.tick());assert.equal(late.game().submissions[xid],undefined,'No late CPU write after reconnect');
    await late.pulse(late.game().resultsUntil);lg=clone(late.game());const due=Cpu.plan(lg,xid).dueAt;late.setTime(due);await late.flush(x.service.heartbeat(x.current().code,0));const release=x.hold(),pending=x.tick();await new Promise(setImmediate);await late.pulse(lg.timeline.deadline,[y]);await late.pulse(late.game().resultsUntil,[y]);release();await late.flush(pending);assert.equal(late.game().round,3);assert.equal(late.game().submissions[xid],undefined,'A queued previous-round CPU action cannot enter a new round');
    const observer=await fixture({categoryMode:'quantity',maxRounds:2}),[o]=await observer.setup(1);await observer.flush(o.addCpuPlayer('One',2));await observer.flush(o.addCpuPlayer('Two',3));await observer.start();let og=clone(observer.game());await observer.pulse(og.timeline.answerAt);await observer.flush(o.submit(og.question.target,M.token(og),'oh'));await observer.pulse(og.timeline.deadline);const changed=clone(observer.get());changed.game.hpUnits[o.playerId()]=0;observer.db.put('memory_rooms/R-CPU1',changed);await observer.db.flush();await observer.pulse(changed.game.resultsUntil);og=clone(observer.game());assert.deepEqual(og.roundHumans,[]);await observer.pulse(og.timeline.deadline);assert.equal(Object.keys(observer.game().submissions).length,2);assert.equal(observer.game().quantityProgress.stage,1);
    console.log('PASS: CPU ownership/edit/capacity/frozen settings, 2/8 normal settlements, human-only/no-human Quantity, deadlines/stale/duplicate safety, owner reconnect/departure, solo twelve-round competition/rematch; '+frozenRounds+' frozen v10 rounds.');
})().catch(e=>{console.error(e);process.exitCode=1;});
