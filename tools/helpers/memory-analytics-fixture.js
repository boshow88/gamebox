'use strict';
const M=require('../../js/games/memory-match.js'),Cpu=require('../../js/games/memory-cpu.js');
module.exports=function fixture({count=2,humans=count,rounds=12,category='mixed',missing=false,seed=1001}={}){
    const clone=structuredClone,ids=Array.from({length:count},(_,i)=>'AUTH_PRIVATE_'+(i<humans?i:0)+'_TAB_'+(i<humans?'human':'cpu'+i)),roster=Object.fromEntries(ids.map((id,i)=>[id,{id,controllerId:'AUTH_PRIVATE_'+(i<humans?i:0)+'_TAB',name:'PRIVATE_NAME_'+i,type:i<humans?'human':'cpu',...(i<humans?{}:{difficulty:1+i%4,cpuVersion:1})}]));
    let game=M.create(roster,ids,{maxRounds:rounds,startingHp:1000000,categoryWeights:Object.fromEntries(['color','quantity','pitch'].map(t=>[t,category==='mixed'||category===t?2:0]))},seed,100000,'canonical-private-match-'+seed),snapshots=[],settled=[],active=[],answered=[];
    for(let r=1;r<=rounds;r++){
        active.push(clone(game));snapshots.push(clone(game));
        for(const id of ids){if(missing&&r===1&&id===ids.at(-1))continue;const cpu=game.roster[id].type==='cpu',answer=cpu?Cpu.answer(game,id):game.question.target,stamp=cpu?Cpu.plan(game,id).dueAt:game.timeline.answerAt+100;const next=M.submit(game,game.owners[id],{...M.token(game),participantId:id,answer,nonce:'receipt'+r+ids.indexOf(id),source:cpu?'cpu':'manual'},stamp);if(!next)throw Error('Fixture submit');game=next.state;}
        answered.push(clone(game));snapshots.push(clone(game));game=M.settle(game,M.token(game),game.timeline.deadline);if(!game)throw Error('Fixture settlement');settled.push(clone(game));snapshots.push(clone(game));if(r<rounds)game=M.advance(game,M.token(game),seed+r,game.resultsUntil);
    }
    return {game,ids,roster,snapshots,settled,active,answered};
};
