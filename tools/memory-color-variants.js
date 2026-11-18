/* Offline calibration: actual match preparation, HSL wheels, conversion and graders. */
(function () {
    'use strict';
    var H = window.MemoryColorVariants, M = window.MemoryMatch, C = window.MemoryCategories, q, config, answer, revision = 0;
    function get(id) { return document.getElementById(id); }
    var view = window.MemoryColorView.create({ root: document.body, canChange: function () { return true; }, onChange: function (id,v) { answer[id] = v; update(); } });
    function update() {
        if (!q) return;
        var grade = C.grade(q, answer, config); view.update({ question:q, config:config, phase:'answer', draft:answer, key:revision, active:true });
        get('score').textContent = grade.score.toFixed(3) + ' / 100'; get('errors').textContent = JSON.stringify({ answer:answer, perSwatchOklab:grade.errors || { single:grade.error }, combinedError:grade.error },null,2);
        get('target-values').textContent = JSON.stringify(H.targetAnswer(q)); get('frozen').textContent = JSON.stringify({ question:q, scoring:q.variant==='single'?config.scoring:config.color.multiScoring },null,2);
        get('targets').replaceChildren.apply(get('targets'), (q.variant==='single'?['single']:q.swatches).map(function(id){var e=document.createElement('div'),code=document.createElement('code'),rgb=q.variant==='single'?q.target:H.answerRgb(q,q.target,id);e.style.backgroundColor='rgb('+rgb.join(',')+')';code.textContent=id.toUpperCase()+' · '+rgb.join(', ');e.append(code);return e;}));
    }
    function curve() { var p={version:3}; ['tolerance','exponent','knee','width','strength','penaltyExponent'].forEach(function(id){if(!get(id).checkValidity())throw new RangeError('Invalid '+id);p[id]=Number(get(id).value);}); return H.scoringParameters({curve:p}); }
    function generate() {
        try { if(!get('seed').checkValidity()||!get('difficulty').checkValidity())throw new RangeError('Use a uint32 seed and difficulty 1–10.'); var variant=get('variant').value,weights=Object.fromEntries(H.variants.map(function(id){return[id,id===variant?1:0];}));
            var base=M.options({challengeVersion:0,categoryMode:'color',adaptive:{initial:Number(get('difficulty').value),jitter:0},color:{variantSelectionVersion:1,weights:{easy:weights,hard:weights},multiScoring:curve()}}),fields=M.roundFields(1,Number(get('seed').value),1000,base);
            q=fields.question;config=C.forQuestion(q,base);answer=C.initialAnswer(q,config);revision++;get('error').textContent='';update();
        }catch(error){get('error').textContent=error.message;}
    }
    get('generate').addEventListener('click',generate);
    ['tolerance','exponent','knee','width','strength','penaltyExponent'].forEach(function(id){get(id).addEventListener('input',function(){try{config.color.multiScoring=curve();get('error').textContent='';update();}catch(e){get('error').textContent=e.message;}});});
    document.querySelectorAll('[data-case]').forEach(function(button){button.addEventListener('click',function(){if(!q)return;var name=button.dataset.case,ids=q.variant==='single'?['h']:q.swatches,correct=H.targetAnswer(q);answer={...correct};
        if(name==='boundary'){q=JSON.parse(JSON.stringify(q));if(q.variant==='single'){q.targetHsl.h=359;q.target=H.hslToRgb(q.targetHsl);}else q.target.a=359;correct=H.targetAnswer(q);answer={...correct,[ids[0]]:1};revision++;}
        else if(['90','80','70'].includes(name)){var best=Infinity;for(var delta=0;delta<=180;delta+=0.1){var candidate={...correct};ids.forEach(function(id){candidate[id]=H.wrap(correct[id]+delta);});var difference=Math.abs(C.grade(q,candidate,config).score-Number(name));if(difference<best){best=difference;answer=candidate;}}}
        else if(name!=='exact'){ids.forEach(function(id,i){if(name==='moderate'||name==='all'||i===0)answer[id]=H.wrap(correct[id]+(name==='small'?5:name==='moderate'?15:120));});}update();
    });});
    window.MemoryColorVariantsTool={snapshot:function(){return JSON.parse(JSON.stringify({question:q,answer:answer,grade:C.grade(q,answer,config)}));}}; generate();
})();
