/* Diagnostic UI over the actual game reducers. No separate selection/adaptation formulas. */
(function () {
    'use strict';
    var P = window.ImpressionsProgression, M = window.ImpressionsMatch, config, seed, round = 0, progression = null, last = null, sequence = [], stamp = 1000, game = null, log = [];
    function get(id) { return document.getElementById(id); }
    function reset() {
        try {
            if (!['seed', 'initial'].every(function (id) { return get(id).checkValidity(); })) throw new RangeError('Enter a valid seed and initial difficulty.');
            seed = Number(get('seed').value); config = M.options({ categoryWeights: Object.fromEntries(P.types.map(function (id) { return [id, Number(get('weight-' + id).value)]; })), challengeVersion:get('policy').value==='legacy'?0:1,challenge:{weights:Object.fromEntries(['easy','normal','hard'].map(function(id,i){return[id,Number(get('bands').value.split(',')[i])];}))}, adaptive: { initial: Number(get('initial').value), enabled: get('enabled').value === 'true' } });
            round = 0; progression = null; last = null; sequence = []; stamp = 1000; game=null;log=[]; get('error').textContent = ''; render();
        } catch (error) { get('error').textContent = error.message; }
    }
    function next(score, accepted) {
        if (!config || !M.enabled(config)) return;
        if(config.challengeVersion===1)return randomNext(accepted?(score===100?'perfect':score===70?'one':score===0?'zero':'imperfect'):'missing');
        var questionSeed = round === 0 ? seed : (seed + Math.imul(round, 0x9e3779b9)) >>> 0;
        var fields = M.roundFields(round + 1, questionSeed, stamp, config, progression); round++; last = fields.question; sequence.push(last.type); sequence = sequence.slice(-40); stamp = fields.timeline.deadline + config.timing.resultsMs;
        progression = { selectionState: fields.selectionState, variantState: fields.variantState, difficultyState: P.observe(fields.difficultyState, last.type, round, [{ human: true, accepted: accepted, valid: accepted, score: score }], config.adaptive) }; render();
    }
    function randomNext(scenario){
        if(!config||config.challengeVersion!==1||!M.enabled(config))return;
        var questionSeed=(seed+Math.imul(round,0x9e3779b9))>>>0;
        if(!game||game.status==='over'){var roster={};['a','b','c'].forEach(function(id){roster[id]={id:id,type:'human',controllerId:id};});game=M.create(roster,['a','b','c'],Object.assign({},config,{maxRounds:100,startingHp:1000000}),questionSeed,stamp,'simulation');}
        else game=M.advance(game,M.token(game),questionSeed,game.resultsUntil);
        last=game.question;var before=game.quantityProgress.stage;
        if(scenario==='withdraw'){var leaving=M.activeIds(game).slice(-1)[0];game=M.withdraw(game,game.owners[leaving],game.timeline.answerAt);}
        (game.status==='playing'?M.activeIds(game):[]).forEach(function(id,i){if(scenario==='missing'&&i===1)return;var answer=window.ImpressionsCategories.copyAnswer(last.target);
            if(scenario==='imperfect'||scenario==='one'&&i===1){if(last.type==='quantity'){if(last.version===1)answer=Math.max(0,answer-1);else answer[last.groups[0].id]-=1;}else answer=window.ImpressionsCategories.initialAnswer(last,config);}
            if(scenario==='zero')answer=last.type==='quantity'?(last.version===1?0:Object.fromEntries(last.groups.map(function(g){return[g.id,0];}))):window.ImpressionsCategories.initialAnswer(last,config);
            var request=Object.assign({},M.token(game),{participantId:id,answer:answer,nonce:'s'+game.round+id,source:scenario==='timeout'&&i===1?'auto':'manual'}),result=M.submit(game,id,request,game.timeline.answerAt+100);if(result)game=result.state;
        });
        if(game.status==='playing')game=M.settle(game,M.token(game),game.timeline.deadline);round++;stamp=game.resultsUntil;sequence.push(last.type);sequence=sequence.slice(-40);
        progression={selectionState:game.selectionState,variantState:game.variantState,challengeState:game.challengeState,quantityProgress:game.quantityProgress};log.push({round:round,scenario:scenario,status:game.status,settledRound:game.settledRound,variant:last.variant,band:last.challenge.band,level:last.challenge.level,stageBefore:before,stageAfter:game.quantityProgress.stage,result:game.settledRound===game.round?game.lastResult:null,parameters:last.parameters});render();
    }
    function render() {
        var sum = P.total(config.categoryWeights), random=config.challengeVersion===1, difficulty = !random&&progression ? progression.difficultyState : P.difficulty(config.adaptive); get('initial').closest('label').hidden=get('enabled').closest('label').hidden=random;get('bands').closest('label').hidden=!random;get('timeout').hidden=get('withdraw').hidden=!random;
        get('probabilities').textContent = P.types.map(function (id) { return id + ': ' + (sum ? Math.round(config.categoryWeights[id] / sum * 100) + '%' : 'Off'); }).join(' · ') + ' (approximate, not guaranteed match totals)';
        get('error').textContent = sum ? '' : 'Enable at least one category.';
        document.querySelectorAll('[data-score],#missing,#high,#low').forEach(function (button) { button.disabled = !sum; });
        get('sequence').textContent = 'Completed simulated rounds: ' + round + (sequence.length ? ' · ' + sequence.join(' → ') : '');
        get('states').replaceChildren.apply(get('states'), P.types.map(function (id) { var tr = document.createElement('tr'); [id, config.categoryWeights[id] + ' / ' + (sum ? Math.round(config.categoryWeights[id] / sum * 100) + '%' : '—'), random?(last&&last.type===id?last.challenge.band+' / '+last.challenge.level:'Seeded'):difficulty.difficultyByType[id], random?(id==='quantity'?'Stage '+(progression?progression.quantityProgress.stage:0):'No score history'):difficulty.historyByType[id].map(function (entry) { return '#' + entry.round + ': ' + entry.scores.join(','); }).join(' | ') || 'None'].forEach(function (value) { var td = document.createElement('td'); td.textContent = value; tr.append(td); }); return tr; }));
        get('question').textContent = last ? JSON.stringify({ category: last.type, variant: last.variant, challenge:last.challenge, difficulty: last.difficulty, parameters: last.parameters, target: last.target }, null, 2) : 'No question yet.';
        get('state').textContent = JSON.stringify(random?{progression:progression,committed:log}:progression || { difficultyState: difficulty }, null, 2);
    }
    get('reset').addEventListener('click', reset); document.querySelectorAll('[data-score]').forEach(function (button) { button.addEventListener('click', function () { next(Number(button.dataset.score), true); }); });
    get('missing').addEventListener('click', function () { next(0, false); });
    ['high', 'low'].forEach(function (id) { get(id).addEventListener('click', function () { for (var i = 0; i < 12; i++) next(id === 'high' ? 100 : 20, true); }); });
    get('timeout').addEventListener('click',function(){randomNext('timeout');});get('withdraw').addEventListener('click',function(){randomNext('withdraw');});
    get('distribution').addEventListener('click',function(){try{var p=window.ImpressionsChallenge.configuration({weights:Object.fromEntries(['easy','normal','hard'].map(function(id,i){return[id,Number(get('bands').value.split(',')[i])];}))}),out={};P.types.forEach(function(type){var n={easy:0,normal:0,hard:0},examples=[];for(var i=0;i<10000;i++){var sample=window.ImpressionsChallenge.sample((Number(get('seed').value)+i)>>>0,type,p);n[sample.band]++;if(i<3)examples.push(sample);}out[type]={samples:10000,counts:n,examples:examples};});get('distribution-output').textContent=JSON.stringify(out,null,2);}catch(e){get('error').textContent=e.message;}});
    window.ImpressionsDifficultyTool = { snapshot: function () { return JSON.parse(JSON.stringify({ config: config, round: round, progression: progression, question: last, sequence: sequence, rounds:log, gameStatus:game&&game.status })); } }; reset();
})();
