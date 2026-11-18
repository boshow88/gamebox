'use strict';
module.exports = async function (h) {
    const assert=require('node:assert/strict');
    const {protocol,evaluate,snapshot,advance,click,drag,touchDrag,screenshot,until,origin}=h;
    async function set(selector,n,step=25){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});for(const key of ['Home',...Array(Math.floor(${n}/${step})).fill('PageUp'),...Array(${n}%${step}).fill('ArrowUp')])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));})()`);}
    async function counts(q,answer=q.target){if(q.version===1)await set('#memory-wheel-quantity .memory-wheel',answer);else for(const [id,n] of Object.entries(answer))await set('#memory-wheel-group-'+id+' .memory-wheel',n);}
    for(const viewport of [{width:1200,height:900,mobile:false},{width:390,height:844,mobile:true},{width:320,height:568,mobile:true}]){
        await protocol.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});await protocol.send('Emulation.setTouchEmulationEnabled',{enabled:viewport.mobile,maxTouchPoints:1});
        await protocol.send('Page.navigate',{url:origin+'/games/memory.html?playtest=1'});await until(()=>evaluate('!!window.__memoryTest&&!!window.MemoryPlaytestUI?.current'),'current boot');
        await evaluate("document.getElementById('memory-playtest-source').value='automated';document.getElementById('memory-playtest-source').dispatchEvent(new Event('change'));document.getElementById('memory-playtest-record').click();__memoryTest.setPracticeConfig({categoryMode:'quantity',categoryWeights:{color:0,quantity:2,pitch:0},quantity:{progression:{variantWeights:{single:0,multi2:0,multi3:1}}}})");
        assert(await evaluate('document.getElementById("memory-local-adaptive").closest("label").hidden'));
        for(const [i,scenario]of ['perfect','imperfect','timeout'].entries()){
            assert(await evaluate('__memoryTest.start()'));let s=await snapshot();assert.equal(s.question.renderingVersion,3);assert.equal(s.question.challenge.quantityStage,i===0?0:1);
            await advance(s.timeline.memorizeAt);const arrangement=await evaluate('document.querySelector("#memory-group-preview svg").innerHTML');
            assert.equal(await evaluate('document.querySelector("#memory-group-preview g[data-group=triangle]").firstElementChild.style.fill'),'rgb(85, 196, 119)');
            await advance(s.timeline.answerAt+100);assert.equal(await evaluate('document.querySelector("#memory-group-preview").textContent.includes("Target")'),false);
            await counts(s.question);assert.equal(await evaluate('document.querySelector("#memory-group-preview svg").innerHTML'),arrangement);
            if(scenario==='imperfect')await set('#memory-wheel-group-circle .memory-wheel',s.question.target.circle-1);
            if(scenario==='timeout')await advance(s.timeline.deadline+5);else await click('#memory-action');
            s=await snapshot();assert.equal(s.progression.quantityProgress.stage,1);assert.equal(s.result.score===100,scenario!=='imperfect');
            await until(()=>evaluate(`MemoryPlaytestUI.current.data().rounds.length===${i+1}`),'completed diagnostic');
            const row=await evaluate('MemoryPlaytestUI.current.data().rounds.at(-1)');assert.equal(row.challengePolicy,'seeded-random-v1');assert.equal(row.quantityStageAfter,1);assert.equal(row.baseDifficulty,null);await advance(s.timeline.deadline+4000);
        }
        await evaluate("__memoryTest.setPracticeConfig({categoryMode:'pitch',categoryWeights:{color:0,quantity:0,pitch:2}})");await click('#memory-enable-audio');await until(()=>evaluate('!__memoryTest.audioReadiness().busy'),'test playback');await click('#memory-confirm-audio');await until(()=>evaluate('__memoryTest.audioReady()'),'actual audio');
        for(const count of [3,4]){
            const lengths={n3:+(count===3),n4:+(count===4),n5:0};await evaluate(`__memoryTest.setPracticeConfig(${JSON.stringify({pitch:{variations:{lengths:{easy:lengths,hard:lengths}}}})});__memoryTest.start()`);
            let s=await snapshot();assert.equal(s.question.tones.length,count);assert.equal(s.question.fixed.length,1);await advance(s.timeline.answerAt+100);
            assert.equal(await evaluate('document.querySelectorAll("#memory-pitch-wheels .memory-wheel:not([aria-disabled=true])").length'),count-1);
            assert(await evaluate('Array.from(document.querySelectorAll("#memory-pitch-wheels .memory-wheel"),e=>e.getBoundingClientRect()).every(r=>r.width>=65&&r.height>=90&&r.left>=0&&r.right<=innerWidth+1)'));
            assert.equal(await evaluate('!document.querySelector("#memory-wheel-pitch-shared")'),true);
            const id=s.question.tones.find(id=>!s.question.fixed.includes(id)),index=s.question.tones.indexOf(id),selector='#memory-wheel-pitch-'+index+' .memory-wheel';
            const before=await evaluate(`document.querySelector('${selector} .memory-wheel-belt').style.transform`);await drag(selector,6);assert.notEqual(await evaluate(`document.querySelector('${selector} .memory-wheel-belt').style.transform`),before);if(viewport.mobile)await touchDrag(selector,6);
            await screenshot('challenge-pitch-answer-'+count+'-'+viewport.width);
            for(const note of s.question.tones){if(s.question.fixed.includes(note))continue;await set('#memory-wheel-pitch-'+s.question.tones.indexOf(note)+' .memory-wheel',Math.round(require('../../js/games/memory-pitch.js').hzToCents(s.question.target[note])),100);}
            await click('#memory-action');assert.equal((await snapshot()).result.score,100);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await screenshot('challenge-pitch-'+count+'-'+viewport.width);await advance(s.timeline.deadline+4000);
        }
        assert.deepEqual(await evaluate('__pageErrors'),[]);
        console.log('PASS: current '+viewport.width+'px: exact shared geometry/green triangle, committed local stages, no adaptive UI, anonymous challenge exports, 2/3 independent Pitch wheels and moving mouse/touch ticks.');
    }
    await protocol.send('Page.navigate',{url:origin+'/tools/memory-color-map.html'});await until(()=>evaluate('document.getElementById("color-map").dataset.ready==="true"'),'V4 map');
    assert.equal(await evaluate('document.getElementById("curve-view").value'),'v1-v3-v4');assert.equal(await evaluate('Number(document.getElementById("map-v4-width").value)'),.10);
    assert.equal(await evaluate('document.querySelectorAll("#players-table table tr").length'),10);assert.equal(await evaluate('document.querySelectorAll("#v4-samples .score-sample").length'),5);
    await evaluate("document.getElementById('map-v4-strength').value=.2;document.getElementById('map-v4-strength').dispatchEvent(new Event('input',{bubbles:true}))");await until(()=>evaluate('document.getElementById("map-status").dataset.invalid==="false"'),'V4 adjustment');assert.equal(await evaluate('MemoryColor.defaults.scoring.version'),4);await screenshot('challenge-v4-map');
    await protocol.send('Page.navigate',{url:origin+'/tools/memory-difficulty.html'});await until(()=>evaluate('!!window.MemoryDifficultyTool'),'current random simulator');
    await evaluate("document.getElementById('weight-color').value=0;document.getElementById('weight-pitch').value=0;document.getElementById('reset').click();document.querySelector('[data-score=\"100\"]').click();document.getElementById('timeout').click();document.getElementById('missing').click();document.querySelector('[data-score=\"70\"]').click()");assert.equal(await evaluate('MemoryDifficultyTool.snapshot().progression.quantityProgress.stage'),1);await click('#distribution');assert(await evaluate('document.getElementById("distribution-output").textContent.includes("10000")'));
    await click('[data-score="0"]');assert.equal(await evaluate('MemoryDifficultyTool.snapshot().rounds.at(-1).scenario'),'zero');assert.equal(await evaluate('MemoryDifficultyTool.snapshot().progression.quantityProgress.stage'),1);
    await click('#withdraw');assert.equal(await evaluate('MemoryDifficultyTool.snapshot().progression.quantityProgress.stage'),1);await click('#withdraw');assert.equal(await evaluate('MemoryDifficultyTool.snapshot().gameStatus'),'over');
    await protocol.send('Page.navigate',{url:origin+'/tools/memory-pitch-variations.html'});await until(()=>evaluate('!!window.MemoryPitchVariationsTool'),'current pitch diagnostic');assert.equal((await evaluate('MemoryPitchVariationsTool.snapshot()')).question.fixed.length,1);
    await evaluate("document.getElementById('policy').value='legacy';document.getElementById('policy').dispatchEvent(new Event('change'));document.getElementById('count').value='5';document.getElementById('refs').value='2';document.getElementById('generate').click()");const legacy=await evaluate('MemoryPitchVariationsTool.snapshot()');assert.equal(legacy.question.tones.length,5);assert.equal(legacy.question.fixed.length,2);
    console.log('PASS: offline V4 swatches/real-score damage comparisons, random band distribution and committed Quantity simulator, current and retained five-tone/two-reference Pitch diagnostics.');
};
