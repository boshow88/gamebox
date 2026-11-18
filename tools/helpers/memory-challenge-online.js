/** Current-policy UI + real transport over isolated CAS Firebase fixtures. */
'use strict';
module.exports=async function(h){
    const assert=require('node:assert/strict'),M=require('../../js/games/memory-match.js'),C=require('../../js/games/memory-categories.js'),Rules=require('../../js/games/memory-rules.js');
    const {page,state,click,fill,online,advance,agreed,readyAndStart,until,pages,read,setRoomPath,screenshot}=h;
    let a=await page('Host',390,844,3600000),b=await page('Guest',1200,900,-3600000);
    await online(a);await a.eval("document.getElementById('memory-weight-color').value=0;document.getElementById('memory-weight-quantity').value=2;document.getElementById('memory-weight-pitch').value=0");await click(a,'memory-create-btn');await until(async()=>!!(await state(a)).data?.code,'v9 room');let s=await state(a),code=s.data.code;setRoomPath('rooms/memory_rooms/R-'+code);a.uid=s.uid;
    await online(b);await fill(b,'memory-code-input',code);await click(b,'memory-join-btn');await until(()=>read().seatOrder.length===2,'two v10 humans');b.uid=(await state(b)).uid;
    async function configure(patch){await until(()=>a.eval(`__memoryOnline.controller().current().data.revision===${read().revision}`),'host revision');assert(await a.eval(`__memoryOnline.controller().configure(${JSON.stringify(patch)})`));await until(()=>a.eval(`__memoryOnline.controller().current().data.revision===${read().revision}`),'changed snapshot');}
    async function enter(p,g,answer=g.question.target){
        await p.eval(`(()=>{const q=${JSON.stringify(g.question)},answer=${JSON.stringify(answer)},set=(selector,n,step)=>{const e=document.querySelector(selector);if(!e)throw new Error('Missing dedicated wheel '+selector);for(const key of ['Home',...Array(Math.floor(n/step)).fill('PageUp'),...Array(n%step).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));};if(q.type==='quantity'){if(q.version===1)set('#memory-wheel-quantity .memory-wheel',answer,25);else Object.entries(answer).forEach(([id,n])=>set('#memory-wheel-group-'+id+' .memory-wheel',n,25));}else if(q.type==='pitch'){q.tones.forEach((id,i)=>{if(!q.fixed.includes(id))set('#memory-wheel-pitch-'+i+' .memory-wheel',Math.round(MemoryPitch.hzToCents(answer[id])),100);});}else{document.getElementById('memory-color-mode-rgb').click();answer.forEach((n,i)=>set('#memory-wheel-dual-'+'rgb'[i]+' .memory-wheel',n,16));}})()`);
        assert.deepEqual((await state(p)).view.draft,answer);
    }
    async function round(scenario,expectedStage,options={}){
        let g=structuredClone(read().game);assert.equal(g.protocolVersion,12);assert.equal(g.config.challengeVersion,1);assert.equal(g.difficultyState,undefined);const initialStage=g.quantityProgress.stage;
        await advance(g.timeline.memorizeAt+100);await agreed('v9 memorization');for(const p of pages){const current=(await state(p)).data.game;assert.deepEqual(current.question,g.question);assert.deepEqual(current.timeline,g.timeline);}
        if(options.reconnect){await b.eval('window.__cpuNetwork.setOnline(false)');await advance(g.timeline.memorizeAt+500);await b.eval('window.__cpuNetwork.setOnline(true);__memoryOnline.tick()');await until(()=>b.eval('__memoryOnline.controller().canControl()'),'v9 reconnect');assert.equal((await state(b)).data.game.quantityProgress.stage,initialStage);}
        if(options.hostLeave){await click(a,'memory-online-btn');await click(a,'memory-leave-btn');await until(()=>read().hostUid===b.uid,'v9 host departure');pages.splice(pages.indexOf(a),1);a=b;}
        await advance(g.timeline.answerAt+100);const answers=[];
        for(const [i,p]of pages.entries()){let answer=structuredClone(g.question.target);if(scenario==='imperfect'&&i===1){if(g.question.version===1)answer--;else answer[g.question.groups[0].id]--;}answers.push(answer);await enter(p,g,answer);}
        if(options.lostAck)await b.eval('window.__cpuNetwork.rejectAck=true');
        await Promise.all(pages.filter((_,i)=>scenario!=='timeout'||i!==1).map(p=>click(p,'memory-action')));
        if(scenario==='timeout')await advance(g.timeline.deadline-300);
        await until(()=>Object.keys(read().game.submissions).length===pages.length,'all v9 receipts');
        assert.equal(read().game.quantityProgress.stage,initialStage,'No prediction before settlement');
        if(scenario==='timeout'){const id=(await state(pages[1])).id;assert.equal(read().game.submissions[id].source,'auto');}
        await advance(g.timeline.deadline+10);await until(()=>read().game.phase==='results','v9 committed settlement');await agreed('v9 results');const result=structuredClone(read().game);assert.equal(result.quantityProgress.stage,expectedStage);
        for(const row of result.lastResult.rows){const accepted=result.submissions[row.id],grade=C.grade(g.question,accepted.answer,g.config);assert.equal(row.scoreUnits,Rules.scoreToUnits(grade.score));assert.equal(row.damageUnits,Math.round(Rules.calculateDamage(grade.score,result.lastResult.highestScoreUnits/1000,result.lastResult.multiplier)*1000));assert.equal(row.hpAfterUnits,g.hpUnits[row.id]-row.damageUnits);}
        await Promise.all(pages.map(p=>p.eval(`__memoryOnline.controller().settle(${JSON.stringify(M.token(g))})`)));assert.deepEqual(read().game.hpUnits,result.hpUnits);assert.deepEqual(read().game.quantityProgress,result.quantityProgress);
        const receipt=result.submissions[(await state(b)).id];assert(await b.eval(`__memoryOnline.controller().submit(${JSON.stringify(receipt.answer)},${JSON.stringify(M.token(g))},${JSON.stringify(receipt.nonce)},'manual')`));assert.deepEqual(read().game.quantityProgress,result.quantityProgress);
        if(g.question.type==='pitch'){assert([3,4].includes(g.question.tones.length));assert.equal(g.question.fixed.length,1);for(const p of pages)assert.equal(await p.eval('document.querySelectorAll("#memory-pitch-wheels .memory-wheel").length'),g.question.tones.length-1);}
        await screenshot(b,'challenge-'+pages.length+'-'+g.round);
        if(result.status==='playing'){await advance(result.resultsUntil+1);await until(()=>read().game.round===g.round+1,'v9 next question');}
        return result;
    }
    async function rematch(){await click(a,'memory-action');await click(a,'memory-return-btn');await until(()=>read().phase==='lobby','same-room lobby');}
    await configure({maxRounds:3,startingHp:10000});await readyAndStart();await round('perfect',1,{lostAck:true});await round('imperfect',1,{reconnect:true});await round('timeout',1);await rematch();
    console.log('PASS: two v10 clients: all-exact stage commit, imperfect/timeout no increase, lost ack, reconnect persistence and idempotent HP/stage settlement.');
    for(let i=2;i<8;i++){const p=await page('Player '+(i+1),i===2?320:900,i===2?568:900,i%2?3600000:-3600000);await online(p);await fill(p,'memory-code-input',code);await click(p,'memory-join-btn');await until(()=>read().seatOrder.length===i+1,'eight v10 clients');p.uid=(await state(p)).uid;}
    await readyAndStart();assert.equal(read().game.quantityProgress.stage,0);await round('perfect',1);await round('perfect',1,{hostLeave:true});await round('perfect',2);await rematch();
    console.log('PASS: eight v10 humans: simultaneous exact answers, stage reset on rematch, eligible-at-start host departure blocks progression; remaining humans can advance the following round.');
    const replacement=await page('Replacement',320,568,0);await online(replacement);await fill(replacement,'memory-code-input',code);await click(replacement,'memory-join-btn');await until(()=>read().seatOrder.length===8,'replacement restores eight humans');replacement.uid=(await state(replacement)).uid;
    const lengths={n3:0,n4:1,n5:0};await configure({maxRounds:1,categoryWeights:{color:0,quantity:0,pitch:2},pitch:{variations:{lengths:{easy:lengths,hard:lengths}}}});await readyAndStart();assert.equal(read().game.quantityProgress.stage,0);await round('perfect',0);
    await rematch();await configure({categoryWeights:{color:2,quantity:0,pitch:0}});await readyAndStart();assert.equal(read().game.question.version,3);assert.equal(read().game.config.scoring.version,4);await round('perfect',0);
    for(const p of pages){assert(await p.eval('document.documentElement.scrollWidth<=innerWidth+1'));assert.deepEqual(await p.eval('__pageErrors'),[]);}
    console.log('PASS: eight-player same-room v10 Pitch/Color rematches: one reference, three dedicated wheels, audio acknowledgements, RGB8/V3, concurrent scoring and shared HP settlement.');
};
