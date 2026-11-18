/* Device-owned CPU model v1. Generates answers and delays, never scores or HP. */
(function(root,factory){
    'use strict';
    if(typeof module==='object'&&module.exports)module.exports=factory(require('./impressions-color.js'),require('./impressions-color-variants.js'),require('./impressions-pitch.js'),require('./impressions-categories.js'));
    else root.ImpressionsCpu=factory(root.ImpressionsColor,root.ImpressionsColorVariants,root.ImpressionsPitch,root.ImpressionsCategories);
})(typeof window==='object'?window:globalThis,function(Color,Hsl,Pitch,Categories){
    'use strict';
    var VERSION=1,LEVELS=[1,2,3,4],TYPES=['color','quantity','pitch'];
    function copy(v){return JSON.parse(JSON.stringify(v));}
    function validDifficulty(n){return LEVELS.includes(n);}
    function configuration(input){
        input=input||{};if(input.version!==undefined&&input.version!==VERSION)throw new RangeError('Unsupported Impressions CPU version.');
        var p={version:VERSION,color:Object.assign({sigmaLab:[.105,.065,.038,.020],maxError:.5,attempts:48,lapseRate:.12,lapseScale:2.5,luckyRate:.06,luckyScale:.25},input.color),
            quantity:Object.assign({sigmaRelative:[.34,.22,.13,.065],exactRate:[.02,.03,.04,.05],lapseRate:.12,lapseScale:2.5,luckyRate:.06,luckyScale:.25},input.quantity),
            pitch:Object.assign({sigmaCents:[260,160,90,45],commonFraction:.35,lapseRate:.12,lapseScale:2.5,luckyRate:.06,luckyScale:.25},input.pitch),timing:{}};
        TYPES.forEach(function(type,i){var t=Object.assign({minFraction:[.12,.14,.18][i],maxFraction:[.68,.78,.84][i],complexityFraction:.015},input.timing&&input.timing[type]);
            if(![t.minFraction,t.maxFraction,t.complexityFraction].every(Number.isFinite)||t.minFraction<=0||t.maxFraction>=.98||t.minFraction>=t.maxFraction||t.complexityFraction<0||t.complexityFraction>.1)throw new RangeError('Invalid CPU delay distribution.');p.timing[type]=t;
            var q=p[type];if(![q.lapseRate,q.luckyRate].every(function(n){return Number.isFinite(n)&&n>=0&&n<1;})||q.lapseRate+q.luckyRate>=1||![q.lapseScale,q.luckyScale].every(function(n){return Number.isFinite(n)&&n>0&&n<=10;}))throw new RangeError('Invalid CPU variance configuration.');
        });
        [['color','sigmaLab',1],['quantity','sigmaRelative',3],['pitch','sigmaCents',2400]].forEach(function(row){var a=p[row[0]][row[1]];if(!Array.isArray(a)||a.length!==4||!a.every(function(n){return Number.isFinite(n)&&n>0&&n<=row[2];}))throw new RangeError('CPU accuracy needs four positive error scales.');});
        if(!Number.isFinite(p.color.maxError)||p.color.maxError<=0||p.color.maxError>2||!Number.isInteger(p.color.attempts)||p.color.attempts<1||p.color.attempts>128||!Number.isFinite(p.pitch.commonFraction)||p.pitch.commonFraction<0||p.pitch.commonFraction>.9||!Array.isArray(p.quantity.exactRate)||p.quantity.exactRate.length!==4||!p.quantity.exactRate.every(function(n){return Number.isFinite(n)&&n>=0&&n<=.25;}))throw new RangeError('Invalid CPU category configuration.');
        return copy(p);
    }
    function hash(value){var n=2166136261;for(var i=0;i<value.length;i++)n=Math.imul(n^value.charCodeAt(i),16777619);n=Math.imul(n^n>>>16,0x7feb352d);n=Math.imul(n^n>>>15,0x846ca68b);return(n^n>>>16)>>>0;}
    function random(seed){var n=seed>>>0;return function(){n=(n+0x6d2b79f5)|0;var x=Math.imul(n^n>>>15,1|n);x^=x+Math.imul(x^x>>>7,61|x);return((x^x>>>14)>>>0)/4294967296;};}
    function normal(rng){return Math.sqrt(-2*Math.log(Math.max(1e-12,rng())))*Math.cos(2*Math.PI*rng());}
    function identity(game,id){var p=game&&game.roster&&game.roster[id];if(!game||game.protocolVersion<11||!game.config.cpu||game.config.cpu.version!==VERSION||!p||p.type!=='cpu'||!validDifficulty(p.difficulty))throw new RangeError('CPU needs a supported frozen participant.');return [VERSION,game.matchId,game.round,game.questionId,game.question.seed,id].join('|');}
    function spread(p,rng){var ticket=rng();return ticket<p.lapseRate?p.lapseScale:ticket<p.lapseRate+p.luckyRate?p.luckyScale:1;}
    function colorAnswer(target,p,level,rng){
        var lab=Color.srgbToOklab(target),sigma=p.sigmaLab[level]*spread(p,rng),radius=Math.min(p.maxError,Math.hypot(normal(rng),normal(rng),normal(rng))*sigma),direction,best=null,bestRadius=-1;
        for(var i=0;i<p.attempts;i++){
            direction=[normal(rng),normal(rng),normal(rng)];var length=Math.hypot.apply(null,direction)||1;direction=direction.map(function(n){return n/length;});
            var rgb=Color.oklabToSrgb(lab.map(function(n,j){return n+direction[j]*radius;}));if(rgb)return rgb;
            // Retain the furthest displayable point if all sampled directions fail.
            var low=0,high=radius;for(var k=0;k<18;k++){var mid=(low+high)/2;if(Color.oklabToSrgb(lab.map(function(n,j){return n+direction[j]*mid;})))low=mid;else high=mid;}
            if(low>bestRadius){bestRadius=low;best=Color.oklabToSrgb(lab.map(function(n,j){return n+direction[j]*low;}));}
        }
        return best||target.slice();
    }
    function reflect(n,min,max){var width=max-min;if(!width)return min;var value=((n-min)%(width*2)+width*2)%(width*2);return min+(value<=width?value:width*2-value);}
    function answer(game,id){
        var key=identity(game,id),p=configuration(game.config.cpu),level=game.roster[id].difficulty-1,q=game.question,rng=random(hash(key+'|answer|'+q.type)),cfg=Categories.forQuestion(q,game.config),out;
        if(q.type==='color'){
            if(q.version!==2){out=colorAnswer(q.target,p.color,level,rng);}
            else if(q.variant==='single'){out=Hsl.rgbToHsl(colorAnswer(q.target,p.color,level,rng));}
            else{out={};var scale=p.color.sigmaLab[level]*400*spread(p.color,rng);q.swatches.forEach(function(s){out[s]=Hsl.wrap(Math.round(Hsl.wrap(q.target[s]+normal(rng)*scale)*100)/100);});}
        }else if(q.type==='quantity'){
            var quantity=p.quantity,multiplier=spread(quantity,rng),maximum=cfg.quantity.generation.poolSize;
            function count(target){if(rng()<quantity.exactRate[level])return target;return Math.max(0,Math.min(maximum,Math.round(target*(1+normal(rng)*quantity.sigmaRelative[level]*multiplier))));}
            out=q.version===1?count(q.target):Object.fromEntries(q.groups.map(function(g){return[g.id,count(q.target[g.id])];}));
        }else if(q.type==='pitch'){
            var pitch=p.pitch,sigma=pitch.sigmaCents[level]*spread(pitch,rng),common=normal(rng)*sigma*pitch.commonFraction,individual=sigma*Math.sqrt(1-pitch.commonFraction*pitch.commonFraction),lo=Math.ceil(Pitch.hzToCents(cfg.pitch.generation.minHz)),hi=Math.floor(Pitch.hzToCents(cfg.pitch.generation.maxHz));
            out=copy(q.target);var ids=q.version===2?q.tones:q.target.map(function(_,i){return i;});ids.forEach(function(tone,i){if(q.version===2?q.fixed.includes(tone):i===0)return;var cents=Pitch.hzToCents(q.target[tone])+common+normal(rng)*individual;out[tone]=Pitch.centsToHz(Math.round(reflect(cents,lo,hi)));});
        }else throw new RangeError('Unknown CPU category.');
        if(!Categories.validateAnswer(q,out,game.config))throw new RangeError('CPU generated an invalid answer.');return out;
    }
    function plan(game,id){
        var key=identity(game,id),p=configuration(game.config.cpu),q=game.question,t=p.timing[q.type],rng=random(hash(key+'|timing'));
        var count=q.type==='quantity'&&q.version===2?q.groups.length:q.type==='pitch'?(q.tones?q.tones.length-q.fixed.length:q.target.length-1):q.swatches?q.swatches.length:1;
        var fraction=Math.min(t.maxFraction,t.minFraction+(t.maxFraction-t.minFraction)*(rng()+rng())/2+(count-1)*t.complexityFraction),duration=game.timeline.deadline-game.timeline.answerAt;
        return {key:key,dueAt:game.timeline.answerAt+Math.max(1,Math.min(duration-1,Math.round(duration*fraction))),nonce:'cpu-v'+VERSION+'-'+game.round+'-'+hash(key).toString(36)};
    }
    return {version:VERSION,levels:LEVELS.slice(),defaultDifficulty:2,validDifficulty:validDifficulty,configuration:configuration,answer:answer,plan:plan};
});
