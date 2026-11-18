/** Current production assets, real SDK/deadlines, isolated temporary Auth users. */
'use strict';
module.exports=async function(h){
    const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
    const M=require('../../js/games/memory-match.js'),C=require('../../js/games/memory-categories.js'),Rules=require('../../js/games/memory-rules.js'),Pitch=require('../../js/games/memory-pitch.js');
    const {a,b,clients,state,click,until,report,root,playtestMode}=h;
    let completed=0;
    async function configure(patch){await until(async()=>(await state(a)).data.revision===(await state(b)).data.revision,'live lobby revision');assert(await a.eval(`__liveOnline.controller().configure(${JSON.stringify(patch)})`));await until(async()=>(await state(a)).data.revision===(await state(b)).data.revision,'live changed snapshots');}
    async function start(){
        const d=(await state(a)).data;
        if(d.options.categoryWeights.pitch)for(const p of clients){await click(p,'memory-room-enable-audio');await until(async()=>{const s=await state(p),uid=await p.eval('__liveOnline.controller().service.currentPlayer().uid');return s.view.audio.ready&&s.data.audioReady?.[uid]?.version===2&&s.data.audioReady[uid].protocolVersion===M.version;},'live actual audio readiness');}
        await click(b,'memory-ready-btn');await until(()=>a.eval('__liveOnline.controller().canStart()'),'live v9 Ready');await click(a,'memory-start-btn');await until(async()=>(await state(a)).data.game?.status==='playing'&&(await state(b)).data.game?.status==='playing','live v9 Start');assert.equal((await state(a)).data.game.quantityProgress.stage,0);
    }
    async function set(p,selector,n,step){await p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});for(const key of ['Home',...Array(Math.floor(${n}/${step})).fill('PageUp'),...Array(${n}%${step}).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));})()`);}
    async function round(category,perfect,expectedStage){
        const g=(await state(a)).data.game,token=M.token(g);assert.equal(g.protocolVersion,M.version);assert.equal(g.config.challengeVersion,1);assert.equal(g.difficultyState,undefined);assert.equal(g.config.scoring.version,4);assert.deepEqual((await state(b)).data.game.question,g.question);assert.deepEqual((await state(b)).data.game.timeline,g.timeline);
        if(category==='quantity')assert.equal(g.question.renderingVersion,3);
        else {assert([3,4].includes(g.question.tones.length));assert.equal(g.question.fixed.length,1);assert.equal(g.config.pitch.scoring.tolerance,180);}
        await until(async()=>(await state(a)).view.phase==='memorize'&&(await state(b)).view.phase==='memorize','live canonical memorize',20000);
        if(playtestMode)for(const p of clients)assert.equal(await p.eval('MemoryPlaytestUI.current.data().rounds.length'),completed);
        await until(async()=>(await state(a)).view.phase==='answer'&&(await state(b)).view.phase==='answer','live canonical answer',20000);
        const answers=[structuredClone(g.question.target),structuredClone(g.question.target)];
        if(!perfect){if(category==='quantity')answers[1][g.question.groups[0].id]-=1;else{const id=g.question.tones.find(id=>!g.question.fixed.includes(id));answers[1][id]=Pitch.centsToHz(Math.round(Pitch.hzToCents(answers[1][id]))+(answers[1][id]>600?-100:100));}}
        await Promise.all(clients.map(async(p,i)=>{if(category==='quantity')for(const [id,n]of Object.entries(answers[i]))await set(p,'#memory-wheel-group-'+id+' .memory-wheel',n,25);else{assert.equal(await p.eval('document.querySelectorAll("#memory-pitch-wheels .memory-wheel").length'),g.question.tones.length-1);for(const id of g.question.tones){if(g.question.fixed.includes(id))continue;await set(p,'#memory-wheel-pitch-'+g.question.tones.indexOf(id)+' .memory-wheel',Math.round(Pitch.hzToCents(answers[i][id])),100);}}assert.deepEqual((await state(p)).view.draft,answers[i]);}));
        await Promise.all(clients.map(p=>click(p,'memory-action')));await until(async()=>Object.keys((await state(a)).data.game.submissions).length===2,'live concurrent receipts');assert.equal((await state(a)).data.game.quantityProgress.stage,g.quantityProgress.stage);
        await until(async()=>(await state(a)).data.game.phase==='results'&&(await state(b)).data.game.phase==='results','live real deadline settlement',Math.max(15000,g.timeline.deadline-Date.now()+15000));
        const settled=(await state(a)).data.game;assert.equal(settled.quantityProgress.stage,expectedStage);assert.deepEqual((await state(b)).data.game,settled);assert.deepEqual(settled.config,g.config);
        const expected=answers.map(answer=>C.grade(g.question,answer,g.config)),best=Math.max(...expected.map(r=>r.score));
        settled.seatOrder.forEach((id,i)=>{const row=settled.lastResult.rows.find(row=>row.id===id);assert.equal(row.scoreUnits,Rules.scoreToUnits(expected[i].score));assert.equal(row.damageUnits,Math.round(Rules.calculateDamage(expected[i].score,best,settled.lastResult.multiplier)*1000));assert.equal(row.hpAfterUnits,g.hpUnits[id]-row.damageUnits);});
        await Promise.all(clients.map(p=>p.eval(`__liveOnline.controller().settle(${JSON.stringify(token)})`)));assert.deepEqual((await state(a)).data.game.quantityProgress,settled.quantityProgress);assert.deepEqual((await state(a)).data.game.hpUnits,settled.hpUnits);
        const receipt=settled.submissions[settled.seatOrder[1]];assert(await b.eval(`__liveOnline.controller().submit(${JSON.stringify(receipt.answer)},${JSON.stringify(token)},${JSON.stringify(receipt.nonce)})`));completed++;
        if(playtestMode)for(const p of clients){await until(()=>p.eval(`MemoryPlaytestUI.current.data().rounds.length===${completed}`),'live completed recording');const data=await p.eval('MemoryPlaytestUI.current.data()');require('./memory-playtest-analysis.js').validate(data);const r=data.rounds.at(-1);assert.equal(r.challengePolicy,'seeded-random-v1');assert.equal(r.quantityStageAfter,expectedStage);for(const id of settled.seatOrder)assert(!JSON.stringify(data).includes(id));fs.writeFileSync(path.join(root,'.cache','memory-live-challenge-'+p.name.toLowerCase()+'.json'),JSON.stringify(data,null,2)+'\n');}
        const shot=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(root,'.cache','memory-live-challenge-'+completed+'.png'),Buffer.from(shot.data,'base64'));
        report.variants.push({category,round:g.round,variant:g.question.variant,challenge:g.question.challenge,parameters:g.question.parameters,stageBefore:g.quantityProgress.stage,stageAfter:expectedStage,allHumanPerfect:perfect,scores:expected.map(r=>r.score),sharedTimeline:true,independentReceipts:true,exactlyOnceSettlement:true,toneCount:g.question.tones?.length,references:g.question.fixed?.length});
        console.log('PASS: live v9 '+category+' round '+g.round+': scores '+expected.map(r=>r.score).join('/')+', stage '+g.quantityProgress.stage+' → '+expectedStage+', concurrent receipts and once-only HP/stage.');
        return settled;
    }
    await configure({maxRounds:2,categoryWeights:{color:0,quantity:2,pitch:0},quantity:{progression:{variantWeights:{single:0,multi2:0,multi3:1}}}});await start();const first=await round('quantity',true,1);
    await until(async()=>(await state(a)).data.game.round===2&&(await state(b)).data.game.round===2,'live next Quantity',Math.max(15000,first.resultsUntil-Date.now()+15000));await round('quantity',false,1);
    await click(a,'memory-action');await click(a,'memory-return-btn');await until(async()=>(await state(a)).data.phase==='lobby'&&(await state(b)).data.phase==='lobby','live same-room rematch');
    const lengths={n3:0,n4:1,n5:0};await configure({maxRounds:1,categoryWeights:{color:0,quantity:0,pitch:2},pitch:{variations:{lengths:{easy:lengths,hard:lengths},positions:{first:0,middle:1,last:0,interior:0}}}});await start();report.rematchStageReset=true;await round('pitch',false,0);
    report.playtest={source:'automated',roundsPerObserver:completed,anonymous:true};
};
