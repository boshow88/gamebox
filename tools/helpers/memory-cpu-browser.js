/** Real UI and automatic device-owned CPU scheduling over the RTDB fixture. */
'use strict';
module.exports=async function(h){
    const assert=require('node:assert/strict'),M=require('../../js/games/memory-match.js'),C=require('../../js/games/memory-categories.js'),Cpu=require('../../js/games/memory-cpu.js'),P=require('../../js/games/memory-pitch.js');
    const {page,state,click,fill,online,advance,agreed,readyAndStart,until,pages,read,setRoomPath,screenshot}=h;
    async function edit(p,selector,value){await until(()=>p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e&&!e.disabled;})()`),'editable CPU field');await p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
    async function press(p,selector){await until(()=>p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e&&!e.disabled&&e.getClientRects().length;})()`),'editable CPU row');const r=await p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await p.send('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',clickCount:1});await p.send('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',clickCount:1});}
    async function configure(p,patch){await until(()=>p.eval(`__memoryOnline.controller().current().data.revision===${read().revision}`),'CPU configure snapshot');assert(await p.eval(`__memoryOnline.controller().configure(${JSON.stringify(patch)})`));await until(()=>p.eval(`__memoryOnline.controller().current().data.revision===${read().revision}`),'CPU changed snapshot');}
    async function enter(p,g,exact=true){
        const q=g.question,answer=structuredClone(q.target);let adjusted=answer;
        if(!exact){if(q.type==='quantity'){if(q.version===1)adjusted=answer-1;else answer[q.groups[0].id]--;}else if(q.type==='color')answer[0]=(answer[0]+60)%256;else{const id=q.tones.find(id=>!q.fixed.includes(id));answer[id]=P.centsToHz(Math.round(P.hzToCents(answer[id]))+(answer[id]>600?-90:90));}}
        await p.eval(`(()=>{const q=${JSON.stringify(q)},answer=${JSON.stringify(adjusted)},set=(selector,n,step)=>{const e=document.querySelector(selector);for(const key of ['Home',...Array(Math.floor(n/step)).fill('PageUp'),...Array(n%step).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));};if(q.type==='quantity'){if(q.version===1)set('#memory-wheel-quantity .memory-wheel',answer,25);else Object.entries(answer).forEach(([id,n])=>set('#memory-wheel-group-'+id+' .memory-wheel',n,25));}else if(q.type==='color'){document.getElementById('memory-color-mode-rgb').click();answer.forEach((n,i)=>set('#memory-wheel-dual-'+'rgb'[i]+' .memory-wheel',n,16));}else q.tones.forEach((id,i)=>{if(!q.fixed.includes(id))set('#memory-wheel-pitch-'+i+' .memory-wheel',Math.round(MemoryPitch.hzToCents(answer[id])),100);});})()`);assert.deepEqual((await state(p)).view.draft,adjusted);
    }
    async function round(expectedStage,{imperfect=false,depart,disconnect}={}){
        const g=structuredClone(read().game);assert.equal(g.protocolVersion,12);await advance(g.timeline.memorizeAt+1);await agreed('CPU canonical memorization');for(const p of pages){assert.deepEqual((await state(p)).data.game.question,g.question);assert.deepEqual((await state(p)).data.game.timeline,g.timeline);}
        const cpuIds=g.participants.filter(id=>g.roster[id].type==='cpu');assert.equal(Object.keys(read().game.submissions).length,0);await advance(g.timeline.answerAt+100);
        assert(await pages[0].eval('document.getElementById("memory-match-results").hidden'));assert.equal(await pages[0].eval('document.querySelectorAll("[data-cpu-answer]").length'),0);
        if(depart){const departedId=g.participants.find(id=>g.roster[id].type==='human'&&g.owners[id]===depart.uid);await click(depart,'memory-online-btn');await click(depart,'memory-leave-btn');pages.splice(pages.indexOf(depart),1);await until(()=>read().game.withdrawn.includes(departedId),'CPU owner withdrawal');}
        for(const p of pages){await enter(p,g,!imperfect);await click(p,'memory-action');}
        if(disconnect){await disconnect.eval('window.__cpuNetwork.setOnline(false)');await advance(g.timeline.answerAt+1000,pages.filter(p=>p!==disconnect));await disconnect.eval('window.__cpuNetwork.setOnline(true);__memoryOnline.tick()');await until(()=>disconnect.eval('__memoryOnline.controller().canControl()'),'CPU owner brief reconnect');}
        await advance(g.timeline.deadline-100);const remaining=cpuIds.filter(id=>!read().game.withdrawn.includes(id));await until(()=>remaining.every(id=>read().game.submissions[id]),'automatic owned CPU submissions');
        for(const id of remaining){const r=read().game.submissions[id];assert.equal(r.source,'cpu');assert(r.acceptedAt>=Cpu.plan(g,id).dueAt&&r.acceptedAt<g.timeline.deadline);assert.deepEqual(r.answer,Cpu.answer(g,id));}
        await advance(g.timeline.deadline+10);await until(()=>read().game.phase==='results','CPU shared settlement');await agreed('CPU results');const settled=structuredClone(read().game);assert.equal(settled.quantityProgress.stage,expectedStage);
        for(const row of settled.lastResult.rows){const grade=C.grade(g.question,settled.submissions[row.id].answer,g.config);assert.equal(row.scoreUnits,Math.round(grade.score*1000));}
        await Promise.all(pages.map(p=>p.eval(`__memoryOnline.controller().settle(${JSON.stringify(M.token(g))})`)));assert.deepEqual(read().game.hpUnits,settled.hpUnits);assert.deepEqual(read().game.quantityProgress,settled.quantityProgress);
        for(const p of pages){assert(await p.eval('document.getElementById("memory-result-rows").textContent.includes("CPU")'));assert.deepEqual(await p.eval('__pageErrors'),[]);assert(await p.eval('document.documentElement.scrollWidth<=innerWidth+1'));}
        await screenshot(pages[0],'cpu-results-'+pages.length+'-'+g.categoryId+'-'+g.round);
        if(settled.status==='playing'){await advance(settled.resultsUntil+1);await until(()=>read().game.round===g.round+1,'CPU next question');}
        return settled;
    }
    async function lobby(host){await click(host,'memory-action');await click(host,'memory-return-btn');await until(()=>read().phase==='lobby','CPU rematch lobby');}
    for(const width of [1200,390,320]){
        const a=await page('Owner '+width,width,width===320?568:900,3600000);await online(a);await a.eval("document.getElementById('memory-weight-color').value=0;document.getElementById('memory-weight-quantity').value=2;document.getElementById('memory-weight-pitch').value=0");await click(a,'memory-create-btn');await until(async()=>!!(await state(a)).data?.code,'CPU solo room');const code=(await state(a)).data.code;setRoomPath('rooms/memory_rooms/R-'+code);a.uid=(await state(a)).uid;assert.equal(await a.eval('__memoryOnline.controller().canStart()'),false);
        for(let i=0;i<7;i++){await click(a,'memory-add-cpu');await until(()=>read().seatOrder.length===i+2,'added CPU '+i);}
        assert.equal(await a.eval('document.getElementById("memory-add-cpu").disabled'),true);assert.equal(await a.eval('__memoryOnline.controller().addCpuPlayer()'),false);let ids=read().seatOrder.filter(id=>read().participants[id].type==='cpu');
        await edit(a,'[data-cpu-name="'+ids[0]+'"]','My CPU');await until(()=>read().participants[ids[0]].name==='My CPU','CPU rename UI');await edit(a,'[data-cpu-difficulty="'+ids[0]+'"]',4);await until(()=>read().participants[ids[0]].difficulty===4,'CPU difficulty UI');
        assert(await a.eval('document.documentElement.scrollWidth<=innerWidth+1'));await screenshot(a,'cpu-lobby-eight-'+width);
        for(const id of ids.slice(3)){await press(a,'[data-cpu-remove="'+id+'"]');await until(()=>!read().participants[id],'CPU removal UI');}ids=ids.slice(0,3);
        await configure(a,{maxRounds:2});await readyAndStart();assert.equal(read().game.quantityProgress.stage,0);await round(1);await round(1,{imperfect:true});await lobby(a);
        await configure(a,{maxRounds:1,categoryWeights:{color:2,quantity:0,pitch:0}});await readyAndStart();await round(0);await lobby(a);
        await configure(a,{categoryWeights:{color:0,quantity:0,pitch:2}});await readyAndStart();await round(0);await lobby(a);
        if(width===320){
            const b=await page('Other owner',390,844,-3600000);await online(b);await fill(b,'memory-code-input',code);await click(b,'memory-join-btn');await until(()=>read().seatOrder.length===5,'second CPU owner');b.uid=(await state(b)).uid;
            assert.equal(await b.eval(`__memoryOnline.controller().renameCpu(${JSON.stringify(ids[0])},'foreign')`),false);assert.equal(await b.eval(`__memoryOnline.controller().setCpuDifficulty(${JSON.stringify(ids[0])},1)`),false);assert.equal(await b.eval('document.querySelectorAll("[data-cpu-name]").length'),0);
            for(let i=0;i<3;i++){await click(b,'memory-add-cpu');await until(()=>read().seatOrder.length===i+6,'other owned CPU');}
            await configure(a,{categoryWeights:{color:0,quantity:2,pitch:0}});await readyAndStart();await round(1,{disconnect:b});await lobby(a);
            await configure(a,{categoryWeights:{color:2,quantity:0,pitch:0}});await readyAndStart();await round(0,{depart:a});await lobby(b);
            // Same-tab recovery retains the original device and its CPUs.
            const oldUid=b.uid,oldRoster=structuredClone(read().participants),boot=await b.eval('__memoryBoot');await b.send('Page.reload');await until(()=>b.eval(`window.__memoryBoot>${boot}&&!!window.__memoryOnline?.controller()?.current()?.data`),'CPU refresh recovery');assert.equal((await state(b)).uid,oldUid);assert.deepEqual((await state(b)).data.participants,oldRoster);await click(b,'memory-leave-btn');
            pages.splice(pages.indexOf(b),1);
        }else{await click(a,'memory-leave-btn');pages.splice(pages.indexOf(a),1);}
        console.log('PASS: '+width+'px CPU lobby ownership/name/difficulty/capacity, one-human automatic three-category competition, independent locks, normal scoring, human-only stages and rematches.');
    }
};
