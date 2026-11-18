/* Protocol-v9 Quantity ranges and exact, committed all-human progression. No scores. */
(function(root,factory){
    'use strict';
    if(typeof module==='object'&&module.exports)module.exports=factory();else root.ImpressionsQuantityProgression=factory();
})(typeof window==='object'?window:globalThis,function(){
    'use strict';
    var IDS=['single','multi2','multi3'];
    var RANGES={single:[[20,80,100],[30,110,140],[40,150,190],[50,190,230]],multi2:[[10,35,45],[15,45,60],[20,60,80],[25,75,100]],multi3:[[10,25,35],[12,35,45],[15,45,60],[18,55,70]]};
    function configuration(input){
        input=input||{};var rows={},weights=Object.assign({single:3,multi2:2,multi3:2},input.variantWeights);
        IDS.forEach(function(id){rows[id]=(input.ranges&&input.ranges[id]||RANGES[id]).map(function(row){return Array.isArray(row)?{minCount:row[0],maxCount:row[1],answerMax:row[2]}:Object.assign({},row);});});
        var count=rows.single.length,maxStage=input.maxStage===undefined?count-1:input.maxStage;
        if(input.version!==undefined&&input.version!==1||count<1||count>8||!Number.isInteger(maxStage)||maxStage<0||maxStage>=count||!IDS.every(function(id){return rows[id].length===count&&Number.isFinite(weights[id])&&weights[id]>=0&&weights[id]<=10;})||IDS.reduce(function(sum,id){return sum+weights[id];},0)<=0)throw new RangeError('Invalid Quantity progression configuration.');
        IDS.forEach(function(id){var groups=id==='single'?1:Number(id.slice(-1));rows[id].forEach(function(row,i){var previous=rows[id][i-1];if(![row.minCount,row.maxCount,row.answerMax].every(Number.isInteger)||row.minCount<(groups===1?1:10)||row.minCount>row.maxCount||row.maxCount>row.answerMax||row.answerMax>300||groups>1&&row.answerMax*groups>220||previous&&(row.minCount<previous.minCount||row.maxCount<=previous.maxCount||row.answerMax<=previous.answerMax))throw new RangeError('Quantity stage ranges must increase together within density limits.');});});
        return {version:1,maxStage:maxStage,variantWeights:weights,ranges:rows};
    }
    function initial(){return {version:1,stage:0,lastRound:0,advanced:false};}
    function valid(state,input){var p=configuration(input);return !!state&&state.version===1&&Number.isInteger(state.stage)&&state.stage>=0&&state.stage<=p.maxStage&&Number.isInteger(state.lastRound)&&state.lastRound>=0;}
    function range(stage,variant,input){var p=configuration(input);if(!Number.isInteger(stage)||stage<0||stage>p.maxStage||!IDS.includes(variant))throw new RangeError('Unknown Quantity stage/variant.');return Object.assign({},p.ranges[variant][stage]);}
    function exact(q,answer){if(!q||q.type!=='quantity')return false;if(q.version===1)return Number.isInteger(answer)&&answer===q.target;if(!answer||Array.isArray(answer)||typeof answer!=='object'||Object.keys(answer).length!==q.groups.length)return false;return q.groups.every(function(g){return Object.hasOwn(answer,g.id)&&Number.isInteger(answer[g.id])&&answer[g.id]===q.target[g.id];});}
    function settle(state,q,round,timeline,required,observations,input,committed){
        if(!valid(state,input))throw new RangeError('Invalid Quantity progression state.');
        if(!committed||q.type!=='quantity'||round<=state.lastRound)return state;
        var p=configuration(input),perfect=required.length>0&&required.every(function(id){var o=observations.find(function(value){return value.id===id;});return !!o&&o.human===true&&!o.withdrawn&&o.valid===true&&o.source==='manual'&&Number.isFinite(o.acceptedAt)&&o.acceptedAt>=timeline.answerAt&&o.acceptedAt<timeline.deadline&&exact(q,o.answer);});
        var next=perfect?Math.min(p.maxStage,state.stage+1):state.stage;
        return {version:1,stage:next,lastRound:round,advanced:next>state.stage};
    }
    return {configuration:configuration,initial:initial,valid:valid,range:range,exact:exact,settle:settle};
});
