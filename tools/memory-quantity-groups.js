/* Standalone visual diagnostics over actual generation, pools and graders. */
(function () {
    'use strict';
    var M = window.MemoryMatch, C = window.MemoryCategories, Groups = window.MemoryQuantityGroups, question, config, answer, generation, grade, ids;
    function get(id) { return document.getElementById(id); }
    var targetSingle = window.MemoryDots.create(get('target-single')), answerSingle = window.MemoryDots.create(get('answer-single'));
    var targetMulti = window.MemoryGroupDots.create(get('target-multi')), answerMulti = window.MemoryGroupDots.create(get('answer-multi'));
    function values(value) { return question.version === 2 ? value : { single: value }; }
    function update() {
        grade = C.grade(question, answer, config);
        if (question.version === 2) answerMulti.setCounts(answer); else answerSingle.setCount(answer);
        get('score').textContent = grade.score.toFixed(3); get('rms').textContent = grade.error.toFixed(4);
        get('errors').replaceChildren.apply(get('errors'), ids.map(function (id) { var row = document.createElement('tr'); [id, values(question.target)[id], values(answer)[id], ((question.version === 2 ? grade.errors[id] : grade.error) * 100).toFixed(2) + '%'].forEach(function (value) { var cell = document.createElement('td'); cell.textContent = value; row.append(cell); }); return row; }));
        ids.forEach(function (id) { get('count-' + id).value = values(answer)[id]; });
    }
    function generate() {
        try {
            if (!['seed', 'difficulty'].every(function (id) { return get(id).checkValidity(); })) throw new RangeError('Use a uint32 seed and difficulty 1–10.');
            var variant = get('variant').value, weights = Object.fromEntries(['single', 'multi2', 'multi3'].map(function (id) { return [id, id === variant ? 1 : 0]; }));
            var base = M.options({ categoryMode: 'quantity', challengeVersion:Number(get('appearance').value)===3?1:0, adaptive: { initial: Number(get('difficulty').value), jitter: 0 }, quantity: { renderingVersion: Number(get('appearance').value), progression:{variantWeights:weights}, multi: { weights: { easy: weights, hard: weights } } } });
            question = M.roundFields(1, Number(get('seed').value), 1000, base,base.challengeVersion===1?{quantityProgress:{version:1,stage:Number(get('stage').value),lastRound:0,advanced:false}}:undefined).question; config = C.forQuestion(question, base); generation = config.quantity.generation;
            get('ranges').textContent=base.challengeVersion===1?'Stage '+question.challenge.quantityStage+' · '+question.challenge.band+' / level '+question.challenge.level+' · target '+generation.minCount+'–'+generation.maxCount+' · answer 0–'+generation.poolSize:'Legacy adaptive level '+question.difficulty.effective;
            answer = C.copyAnswer(question.target); ids = question.version === 2 ? question.groups.map(function (g) { return g.id; }) : ['single'];
            ['target-single', 'answer-single'].forEach(function (id) { get(id).hidden = question.version === 2; }); ['target-multi', 'answer-multi'].forEach(function (id) { get(id).hidden = question.version !== 2; });
            if (question.version === 2) { var pools = Groups.createPools(question.seed, question.variant, generation), appearance=window.MemoryQuantityAppearance,version=appearance.version(question),groups=question.groups.map(function(g){return appearance.group(g,version);}),radius=version>=2?appearance.radius(generation,groups.length):generation.dotRadius;targetMulti.setPools(pools, groups, radius, 'Original',version); answerMulti.setPools(pools, groups, radius, 'Reconstruction',version); targetMulti.setCounts(question.target); }
            else { var pool = window.MemoryQuantity.createPool(question.seed, generation); targetSingle.setPool(pool, generation.dotRadius, 'Original'); answerSingle.setPool(pool, generation.dotRadius, 'Reconstruction'); targetSingle.setCount(question.target); }
            get('counts').replaceChildren.apply(get('counts'), ids.map(function (id) { var label = document.createElement('label'), field = document.createElement('input'); label.textContent = id; field.id = 'count-' + id; field.type = 'number'; field.min = '0'; field.max = String(generation.poolSize); field.step = '1'; field.addEventListener('input', function () { if (!field.checkValidity()) return; if (question.version === 2) answer[id] = Number(field.value); else answer = Number(field.value); update(); }); label.append(field); return label; }));
            get('parameters').textContent = JSON.stringify({ variant: question.variant, difficulty: question.difficulty, parameters: question.parameters, scoring: question.version === 2 ? config.quantity.multi.scoring : config.quantity.scoring }, null, 2); get('error').textContent = ''; update();
        } catch (error) { get('error').textContent = error.message; }
    }
    get('generate').addEventListener('click', generate);
    get('appearance').addEventListener('change',generate);get('grayscale').addEventListener('change',function(){document.querySelector('.boards').style.filter=this.checked?'grayscale(1)':'none';});
    document.querySelectorAll('[data-action]').forEach(function (button) { button.addEventListener('click', function () {
        if (!question) return; var action = button.dataset.action, target = values(question.target), next = { ...values(answer) };
        ids.forEach(function (id, i) { if (action === 'exact') next[id] = target[id]; else if (action === 'zero') next[id] = 0; else if (action === 'max') next[id] = generation.poolSize; else if (action === 'all' || i === 0) next[id] = Math.max(0, Math.min(generation.poolSize, Math.round(target[id] * (action === 'minus' ? 0.75 : 1.25)))); });
        answer = question.version === 2 ? next : next.single; update();
    }); });
    window.MemoryQuantityGroupsTool = { snapshot: function () { return JSON.parse(JSON.stringify({ question: question, answer: answer, grade: grade, generation: generation })); } }; generate();
})();
