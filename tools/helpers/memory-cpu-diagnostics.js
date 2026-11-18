/* Synthetic diagnostics. Questions, CPU answers and scores use production modules. */
(function(root,factory){
    'use strict';
    if(typeof module==='object'&&module.exports)module.exports=factory(require('../../js/games/memory-match.js'),require('../../js/games/memory-cpu.js'),require('../../js/games/memory-categories.js'));
    else root.MemoryCpuDiagnostics=factory(root.MemoryMatch,root.MemoryCpu,root.MemoryCategories);
})(typeof window==='object'?window:globalThis,function(M,Cpu,C){
    'use strict';
    function stats(values){var a=values.slice().sort(function(x,y){return x-y;}),n=a.length,mean=a.reduce(function(s,v){return s+v;},0)/n;function q(p){var x=(n-1)*p,i=Math.floor(x);return a[i]+(a[Math.ceil(x)]-a[i])*(x-i);}return {n:n,mean:mean,median:q(.5),p10:q(.1),p90:q(.9),p95:q(.95),min:a[0],max:a[n-1],sd:Math.sqrt(a.reduce(function(s,v){return s+(v-mean)*(v-mean);},0)/n)};}
    function cases(){var out=[{category:'color',variant:'single',stage:null}];['single','multi2','multi3'].forEach(function(variant){[0,1,2,3].forEach(function(stage){out.push({category:'quantity',variant:variant,stage:stage});});});[3,4].forEach(function(n){out.push({category:'pitch',variant:n+'-tones',stage:null,toneCount:n});});return out;}
    function runCase(testCase,level,count,cpuConfig){
        if(!Number.isInteger(count)||count<1||count>10000||!Cpu.validDifficulty(level))throw new RangeError('Use 1–10000 samples and difficulty 1–4.');
        var input={categoryMode:testCase.category,cpu:cpuConfig};
        if(testCase.category==='quantity')input.quantity={progression:{variantWeights:Object.fromEntries(['single','multi2','multi3'].map(function(id){return[id,id===testCase.variant?1:0];}))}};
        if(testCase.category==='pitch'){var lengths={n3:testCase.toneCount===3?1:0,n4:testCase.toneCount===4?1:0,n5:0};input.pitch={variations:{lengths:{easy:lengths,hard:lengths}}};}
        var config=M.options(input),scores=[],errors=[],delays=[],perfect=0,rounded=0,id='simulation-cpu-'+level;
        for(var i=0;i<count;i++){
            var seed=(Math.imul(i,0x9e3779b9)^0x83ae1f04)>>>0,previous=testCase.stage===null?undefined:{quantityProgress:{version:1,stage:testCase.stage,lastRound:0,advanced:false}},fields=M.roundFields(1,seed,0,config,previous);
            var game=Object.assign({protocolVersion:M.version,matchId:'synthetic-cpu-'+testCase.category+'-'+testCase.variant+'-'+testCase.stage,config:config,roster:{[id]:{id:id,type:'cpu',difficulty:level,cpuVersion:Cpu.version}}},fields),answer=Cpu.answer(game,id),grade=C.grade(game.question,answer,config);
            if(!grade.valid)throw new Error('Invalid CPU diagnostic answer.');scores.push(grade.score);errors.push(grade.error);perfect+=grade.error===0?1:0;rounded+=grade.score===100?1:0;delays.push((Cpu.plan(game,id).dueAt-game.timeline.answerAt)/(game.timeline.deadline-game.timeline.answerAt));
        }
        var row={category:testCase.category,variant:testCase.variant,quantityStage:testCase.stage,difficulty:level,source:'synthetic',scores:stats(scores),error:stats(errors),errorUnit:{color:'Oklab',quantity:'relative RMS',pitch:'cents RMS'}[testCase.category],perfectRate:perfect/count,rounded100Rate:rounded/count,delayFraction:stats(delays)};
        Object.defineProperty(row,'distribution',{value:{scores:scores,errors:errors,delays:delays},enumerable:false});return row;
    }
    function aggregate(rows){var groups={};rows.forEach(function(row){var key=row.category+'-'+row.difficulty;(groups[key]||(groups[key]=[])).push(row);});return Object.keys(groups).map(function(key){var r=groups[key],n=r.reduce(function(s,v){return s+v.scores.n;},0);return {category:r[0].category,difficulty:r[0].difficulty,n:n,mean:r.reduce(function(s,v){return s+v.scores.mean*v.scores.n;},0)/n,perfectRate:r.reduce(function(s,v){return s+v.perfectRate*v.scores.n;},0)/n,scores:stats(r.flatMap(function(v){return v.distribution.scores;})),error:stats(r.flatMap(function(v){return v.distribution.errors;})),errorUnit:r[0].errorUnit,delayFraction:stats(r.flatMap(function(v){return v.distribution.delays;}))};});}
    return {cases:cases,runCase:runCase,aggregate:aggregate};
});
