/* Diagnostic candidate only. Production initialization remains in Categories/Pitch. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory(require('../../../js/games/impressions/pitch.js'),require('../../../js/games/impressions/pitch-variations.js'),require('../../../js/games/impressions/categories.js'));else root.ImpressionsPitchInitialization=factory(root.ImpressionsPitch,root.ImpressionsPitchVariations,root.ImpressionsCategories);})(typeof window==='object'?window:globalThis,function(Pitch,Variations,Categories){
    'use strict';
    function compare(q,config){
        if(!q||q.type!=='pitch'||q.version!==2||q.fixed.length!==1)throw new RangeError('Use a current single-reference Pitch question.');
        var settings=Categories.forQuestion(q,config),reference=q.target[q.fixed[0]],current=Categories.initialAnswer(q,settings),candidate=Object.fromEntries(q.tones.map(function(id){return[id,reference];}));
        var adjustable=q.tones.filter(function(id){return !q.fixed.includes(id);});
        function metrics(answer){var distances=adjustable.map(function(id){return Math.abs(Pitch.hzToCents(q.target[id])-Pitch.hzToCents(answer[id]));}),grade=Categories.grade(q,answer,settings);return {answer:answer,valid:Categories.validateAnswer(q,answer,settings),distanceCents:distances,meanDistanceCents:distances.reduce(function(a,b){return a+b;},0)/distances.length,maxDistanceCents:Math.max.apply(null,distances),rmsCents:grade.error,score:grade.score};}
        return {referenceHz:reference,referenceId:q.fixed[0],current:metrics(current),reference:metrics(candidate)};
    }
    return {compare:compare};
});
