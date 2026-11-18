/** Focused real Firebase tests. Uses the existing live harness and unchanged served assets. */
'use strict';
module.exports=async function(h){
    const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),M=require('../../js/games/impressions-match.js'),C=require('../../js/games/impressions-categories.js'),Color=require('../../js/games/impressions-color-variants.js'),Pitch=require('../../js/games/impressions-pitch.js'),Rules=require('../../js/games/impressions-rules.js');
    const {a,b,clients,state,click,until,report,root,playtestMode}=h;const prefix=h.artifactPrefix||'impressions-live-focused';
    async function keys(p,selector,n,step,fine){await p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),press=(key,shiftKey=false)=>e.dispatchEvent(new KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true}));press('Home');for(let i=0;i<Math.floor(${n}/${step});i++)press('PageUp');for(let i=0;i<Math.floor(${n}%${step}/${fine});i++)press('ArrowUp');${fine===1?'':`for(let i=0;i<${n}%${fine};i++)press('ArrowUp',true);`}})()`);}
    async function enter(p,g,answer,hsl){
        if(g.question.type==='color'){
            if(hsl){await click(p,'impressions-color-mode-hsl');for(const id of ['h','s','l'])await keys(p,'#impressions-wheel-hsl-'+id+' .impressions-wheel',Math.round(hsl[id]*100),1500,100);}
            else{await click(p,'impressions-color-mode-rgb');for(let i=0;i<3;i++)await keys(p,'#impressions-wheel-dual-'+'rgb'[i]+' .impressions-wheel',answer[i],16,1);}
            assert.deepEqual((await state(p)).view.draft,answer);const before=(await state(p)).view.draft;await click(p,hsl?'impressions-color-mode-rgb':'impressions-color-mode-hsl');assert.deepEqual((await state(p)).view.draft,before);return;
        }
        if(g.question.type==='quantity'){for(const [id,n]of Object.entries(answer))await keys(p,'#impressions-wheel-group-'+id+' .impressions-wheel',n,25,1);return;}
        for(const id of g.question.tones){if(g.question.fixed.includes(id))continue;const index=g.question.tones.indexOf(id),selector='#impressions-wheel-pitch-'+index+' .impressions-wheel';await keys(p,selector,Math.round(Pitch.hzToCents(answer[id])),100,1);}
    }
    for(const [index,category]of (h.categories||['color','quantity','pitch']).entries()){
        await until(async()=>(await state(a)).data.revision===(await state(b)).data.revision,'focused lobby revision');
        const patch={maxRounds:1,categoryWeights:{color:+(category==='color')*2,quantity:+(category==='quantity')*2,pitch:+(category==='pitch')*2},adaptive:{enabled:false}};
        if(category==='color')patch.color={variantSelectionVersion:2};
        if(category==='quantity')patch.quantity={progression:{variantWeights:{single:0,multi2:0,multi3:1}}};
        if(category==='pitch')patch.pitch={variations:{lengths:{easy:{n3:0,n4:1,n5:0},hard:{n3:0,n4:1,n5:0}},references:{easy:{one:1,two:0},hard:{one:1,two:0}},positions:{first:0,middle:0,last:1,interior:0}}};
        assert(await a.eval(`__liveOnline.controller().configure(${JSON.stringify(patch)})`));await until(async()=>(await state(a)).data.revision===(await state(b)).data.revision,'focused settings snapshots');
        if(category==='pitch')for(const p of clients){await click(p,'impressions-room-enable-audio');await until(async()=>{const s=await state(p),uid=await p.eval('__liveOnline.controller().service.currentPlayer().uid');return s.view.audio.ready&&s.data.audioReady?.[uid]?.version===2&&s.data.audioReady[uid].protocolVersion===M.version;},'actual ready state and committed lobby audio acknowledgement');}
        await click(b,'impressions-ready-btn');await until(()=>a.eval('__liveOnline.controller().canStart()'),'focused Ready');await click(a,'impressions-start-btn');await until(async()=>(await state(a)).data.game?.status==='playing'&&(await state(b)).data.game?.status==='playing','focused Start');
        const g=(await state(a)).data.game,token=M.token(g);assert.equal(g.protocolVersion,M.version);assert.deepEqual((await state(b)).data.game.question,g.question);assert.deepEqual((await state(b)).data.game.timeline,g.timeline);
        if(category==='color'){assert.equal(g.scoringVersion,4);assert.deepEqual(g.config.scoring,require('../../js/games/impressions-color.js').defaults.scoring);assert.equal(g.question.version,3);assert.equal(g.question.variant,'single');assert.equal(g.question.answerSchema,'rgb8-v1');}
        if(category==='quantity')assert.equal(g.question.renderingVersion,3);
        if(category==='pitch'){assert.deepEqual(g.question.fixed,['n4']);assert.equal(g.config.pitch.scoring.tolerance,180);}
        await until(async()=>(await state(a)).view.phase==='memorize'&&(await state(b)).view.phase==='memorize','focused memorization',20000);
        let arrangement;if(category==='quantity'){arrangement=await a.eval('document.querySelector("#impressions-group-preview svg").innerHTML');assert.equal(await b.eval('document.querySelector("#impressions-group-preview svg").innerHTML'),arrangement);}
        if(playtestMode)for(const p of clients)assert.equal(await p.eval('ImpressionsPlaytestUI.current.data().rounds.length'),index);
        await until(async()=>(await state(a)).view.phase==='answer'&&(await state(b)).view.phase==='answer','focused answer',20000);
        const perfect=structuredClone(g.question.target),partial=structuredClone(perfect);let partialHsl;
        if(category==='color'){partialHsl=Color.rgbToHsl(partial);partialHsl.h=Color.wrap(partialHsl.h+45);Object.keys(partialHsl).forEach(id=>partialHsl[id]=Math.round(partialHsl[id]*100)/100);partial.splice(0,3,...Color.hslToRgb(partialHsl));}
        if(category==='quantity')partial.circle+=5;
        if(category==='pitch'){const id=g.question.tones.find(id=>!g.question.fixed.includes(id));partial[id]=Pitch.centsToHz(Math.round(Pitch.hzToCents(partial[id]))+(partial[id]>600?-100:100));}
        await Promise.all([enter(a,g,perfect),enter(b,g,partial,partialHsl)]);assert.deepEqual((await state(a)).view.draft,perfect);assert.deepEqual((await state(b)).view.draft,partial);
        if(category==='quantity')assert.equal(await a.eval('document.querySelector("#impressions-group-preview svg").innerHTML'),arrangement);
        await click(a,'impressions-action');await until(async()=>Object.keys((await state(b)).data.game.submissions).length===1,'focused independent first receipt');assert.equal((await state(b)).view.phase,'answer');assert.deepEqual((await state(b)).data.game.timeline,g.timeline);await click(b,'impressions-action');
        await until(async()=>Object.keys((await state(a)).data.game.submissions).length===2,'focused second receipt');const receipt=(await state(a)).data.game.submissions[g.seatOrder[0]];
        await until(async()=>(await state(a)).data.game?.phase==='results'&&(await state(b)).data.game?.phase==='results','focused real deadline settlement',Math.max(15000,g.timeline.deadline-Date.now()+15000));
        const settled=(await state(a)).data.game,expected=[C.grade(g.question,perfect,g.config),C.grade(g.question,partial,g.config)];assert.equal(expected[0].score,100);assert(expected[1].score<100);assert.deepEqual((await state(b)).data.game,settled);assert.deepEqual(settled.config,g.config);
        for(let i=0;i<2;i++){const row=settled.lastResult.rows.find(r=>r.id===g.seatOrder[i]);assert.equal(row.scoreUnits,Math.round(expected[i].score*1000));assert.equal(row.damageUnits,Math.round(Rules.calculateDamage(expected[i].score,100,settled.lastResult.multiplier)*1000));assert.equal(row.hpAfterUnits,g.hpUnits[row.id]-row.damageUnits);}
        assert(await a.eval(`__liveOnline.controller().submit(${JSON.stringify(receipt.answer)},${JSON.stringify(token)},${JSON.stringify(receipt.nonce)})`));await Promise.all(clients.map(p=>p.eval(`__liveOnline.controller().settle(${JSON.stringify(token)})`)));assert.deepEqual((await state(a)).data.game.hpUnits,settled.hpUnits);
        if(playtestMode)for(const p of clients){await until(()=>p.eval(`ImpressionsPlaytestUI.current.data().rounds.length===${index+1}`),'focused completed recording');const data=await p.eval('ImpressionsPlaytestUI.current.data()');require('./impressions-playtest-analysis.js').validate(data);for(const pid of settled.seatOrder)assert(!JSON.stringify(data).includes(pid));fs.writeFileSync(path.join(root,'.cache',prefix+'-'+p.name.toLowerCase()+'.json'),JSON.stringify(data,null,2)+'\n');}
        const shot=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(root,'.cache',prefix+'-'+category+'.png'),Buffer.from(shot.data,'base64'));
        report.variants.push({category,protocolVersion:g.protocolVersion,scoringVersion:g.scoringVersion,scoring:g.config.scoring,rgbAndHsl:category==='color',questionVersion:g.question.version,renderingVersion:g.question.renderingVersion,scores:expected.map(r=>r.score),sharedTimeline:true,independentReceipts:true,exactlyOnceSettlement:true,audioReady:category==='pitch'?true:undefined});console.log('PASS: live focused '+category+': current protocol, actual controls/readiness, independent answers, scores '+expected.map(r=>r.score).join('/')+', canonical deadlines and once-only HP.');
        await click(a,'impressions-action');await click(a,'impressions-return-btn');await until(async()=>(await state(a)).data.phase==='lobby'&&(await state(b)).data.phase==='lobby','focused same-room rematch');
    }
    if(h.verifyV4Rematch){
        await click(b,'impressions-ready-btn');await until(()=>a.eval('__liveOnline.controller().canStart()'),'V4 rematch Ready');await click(a,'impressions-start-btn');
        await until(async()=>(await state(a)).data.game.status==='playing'&&(await state(b)).data.game.status==='playing','V4 rematch start');
        const game=(await state(a)).data.game;assert.equal(game.protocolVersion,M.version);assert.equal(game.scoringVersion,4);assert.deepEqual(game.config.scoring,require('../../js/games/impressions-color.js').defaults.scoring);
        report.rematchDefaultVerified=true;
    }
};
