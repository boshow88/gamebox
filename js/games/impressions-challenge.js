/* Seeded challenge conditions. Never reads scores or legacy performance histories. */
(function(root,factory){
    'use strict';
    if(typeof module==='object'&&module.exports)module.exports=factory(require('./impressions-progression.js'),require('./impressions-quantity.js'),require('./impressions-quantity-groups.js'),require('./impressions-pitch-variations.js'),require('./impressions-color-single.js'),require('./impressions-quantity-progression.js'));
    else root.ImpressionsChallenge=factory(root.ImpressionsProgression,root.ImpressionsQuantity,root.ImpressionsQuantityGroups,root.ImpressionsPitchVariations,root.ImpressionsColorSingle,root.ImpressionsQuantityProgression);
})(typeof window==='object'?window:globalThis,function(Legacy,Quantity,Groups,Pitches,Single,Stages){
    'use strict';
    var BANDS=['easy','normal','hard'];
    function copy(v){return JSON.parse(JSON.stringify(v));}
    function unit(seed){var n=seed>>>0;n=Math.imul(n^n>>>16,0x7feb352d);n=Math.imul(n^n>>>15,0x846ca68b);return ((n^n>>>16)>>>0)/4294967296;}
    function configuration(input){input=input||{};var weights=Object.assign({easy:20,normal:60,hard:20},input.weights),levels={};BANDS.forEach(function(id,i){levels[id]=Object.assign([{min:2,max:4},{min:4,max:7},{min:7,max:9}][i],input.levels&&input.levels[id]);});if(input.version!==undefined&&input.version!==1||!BANDS.every(function(id){return Number.isFinite(weights[id])&&weights[id]>=0&&weights[id]<=100&&Number.isFinite(levels[id].min)&&Number.isFinite(levels[id].max)&&levels[id].min>=1&&levels[id].max<=10&&levels[id].min<=levels[id].max;})||BANDS.reduce(function(sum,id){return sum+weights[id];},0)<=0)throw new RangeError('Invalid random challenge distribution.');return {version:1,weights:weights,levels:levels};}
    function sample(seed,type,input){var p=configuration(input);if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Legacy.types.includes(type))throw new RangeError('Challenge seed/category is invalid.');var salt={color:0x3431d4b7,quantity:0x6a39d48f,pitch:0x29cbf713}[type],ticket=unit((seed^salt)>>>0)*BANDS.reduce(function(sum,id){return sum+p.weights[id];},0),band=BANDS[BANDS.length-1];BANDS.some(function(id){ticket-=p.weights[id];if(ticket<0){band=id;return true;}return false;});var level=p.levels[band].min+unit((seed^salt^0xad41e309)>>>0)*(p.levels[band].max-p.levels[band].min);return {version:1,band:band,level:Math.round(level*10000)/10000};}
    function pitchConfiguration(input){var p=Pitches.configuration(input),a=input&&input.lengths;['easy','hard'].forEach(function(end){var supplied=a&&a[end],n3=supplied?supplied.n3:p.lengths[end].n3,n4=supplied?supplied.n4:p.lengths[end].n4;if(!(n3+n4>0)){n3=p.positions.first+p.positions.middle+p.positions.last>0?1:0;n4=1;}p.lengths[end]={n3:n3,n4:n4,n5:0};p.references[end]={one:1,two:0};});return Pitches.configuration(p);}
    function prepare(type,seed,base,previous){
        previous=previous||{};var chosen=sample(seed,type,base.challenge),level=chosen.level,mapping=Object.assign({},base.adaptive,{enabled:true,jitter:0,min:1,max:10}),levels={color:level,quantity:level,pitch:level};
        var mappedBase=Object.assign({},base,{adaptive:mapping}),state={difficultyByType:levels},metadata,variant,variation,variantState=Object.assign({},previous.variantState),quantityState=previous.quantityProgress||Stages.initial();
        if(!Stages.valid(quantityState,base.quantity.progression))throw new RangeError('Invalid committed Quantity stage.');
        if(type==='color'){var c=Single.prepare(seed,mappedBase,state,variantState.color);metadata=c.metadata;variant='single';variantState.color=c.state;}
        else if(type==='pitch'){mappedBase.pitch=Object.assign({},base.pitch,{variantSelectionVersion:1,variations:pitchConfiguration(base.pitch.variations)});var p=Pitches.prepare(seed,mappedBase,state,variantState.pitch);metadata=p.metadata;variation=p.variation;variantState.pitch=p.state;}
        else{
            var settings=Stages.configuration(base.quantity.progression),w=settings.variantWeights,multi=Object.assign({},base.quantity.multi,{weights:{easy:w,hard:w}}),selected=Groups.select(seed,5,multi,variantState.quantity);
            variant=selected.variant;variantState.quantity=selected.state;
            var row=Stages.range(quantityState.stage,variant,settings),span=row.maxCount-row.minCount,fractions={easy:[0,0.6],normal:[0.15,0.85],hard:[0.4,1]}[chosen.band],groups=variant==='single'?1:Number(variant.slice(-1));
            var gen={minCount:row.minCount+Math.round(span*fractions[0]),maxCount:row.minCount+Math.round(span*fractions[1]),poolSize:row.answerMax,jitter:groups===1?base.quantity.generation.jitter:base.quantity.multi.jitter,dotRadius:groups===1?base.quantity.generation.dotRadius:base.quantity.multi.dotRadius};
            gen=Quantity.generationParameters(gen);Quantity.generationParameters({minCount:1,maxCount:gen.poolSize*groups,poolSize:gen.poolSize*groups,jitter:gen.jitter,dotRadius:gen.dotRadius});
            metadata=Legacy.prepare('quantity',seed,mappedBase,state,mapping);metadata.parameters.generation=gen;
            if(groups>1)metadata.parameters.timing.memorizeMs=Math.round(metadata.parameters.timing.memorizeMs*base.quantity.multi[variant].memorizeScale/100)*100;
            metadata.parameters.quantityProgression={version:1,stage:quantityState.stage,stageMin:row.minCount,stageMax:row.maxCount,answerMax:row.answerMax};chosen.quantityStage=quantityState.stage;
        }
        delete metadata.difficulty;metadata.challenge=chosen;metadata.parameters.challenge=copy(chosen);
        return {metadata:metadata,variant:variant,variation:variation,variantState:variantState,quantityProgress:copy(quantityState),challengeState:{version:1,last:copy(chosen)}};
    }
    function supported(q,config){if(!q||!q.challenge||q.challenge.version!==1||!BANDS.includes(q.challenge.band)||!Number.isFinite(q.challenge.level))return false;var levels=config.challenge.levels[q.challenge.band];if(q.challenge.level<levels.min-0.0001||q.challenge.level>levels.max+0.0001)return false;if(q.type==='pitch'&&(!q.tones||![3,4].includes(q.tones.length)||q.fixed.length!==1))return false;if(q.type==='color'&&(q.version!==3||q.variant!=='single'))return false;if(q.type==='quantity'){var p=q.parameters.quantityProgression;if(!p||p.stage!==q.challenge.quantityStage)return false;var row=Stages.range(p.stage,q.variant||'single',config.quantity.progression);if(q.parameters.generation.poolSize!==row.answerMax||q.parameters.generation.minCount<row.minCount||q.parameters.generation.maxCount>row.maxCount)return false;}return true;}
    return {configuration:configuration,sample:sample,pitchConfiguration:pitchConfiguration,prepare:prepare,supported:supported};
});
