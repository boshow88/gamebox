/* Read-only presentation of committed rounds. Never grades, settles or writes rooms. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.ImpressionsResults=factory();})(typeof window==='object'?window:globalThis,function(){
    'use strict';
    function copy(v){return JSON.parse(JSON.stringify(v));}
    function capture(game,localId){
        if(!game||game.phase!=='results'||game.settledRound!==game.round||!game.lastResult||game.lastResult.round!==game.round||!game.question)return null;
        return copy({key:game.matchId+':'+game.round,matchId:game.matchId,round:game.round,protocolVersion:game.protocolVersion,question:game.question,config:game.config,roster:game.roster,seatOrder:game.seatOrder,submissions:game.submissions,lastResult:game.lastResult,resultsAt:game.resultsAt,resultsUntil:game.resultsUntil,status:game.status,winners:game.winners,endReason:game.endReason,localId:localId});
    }
    function timeline(result,now,reducedMotion){
        var age=Math.max(0,now-result.resultsAt),duration=result.resultsUntil-result.resultsAt,remaining=Math.max(0,result.resultsUntil-now);
        var instant=!!reducedMotion||result.protocolVersion<12||duration<6000||remaining<2000;
        return {stage:instant||age>=3000?'complete':age<1000?'scores':age<2000?'damage':'hp',hpProgress:instant?1:Math.max(0,Math.min(1,(age-2000)/1000)),remainingMs:remaining,elapsedMs:age};
    }
    function rows(result){
        return result.lastResult.rows.map(function(row){return Object.assign({},row,{participant:result.roster[row.id],self:row.id===result.localId,scoreGapUnits:Math.max(0,result.lastResult.highestScoreUnits-row.scoreUnits),actualLossUnits:row.hpBeforeUnits-row.hpAfterUnits});}).sort(function(a,b){return b.scoreUnits-a.scoreUnits||result.seatOrder.indexOf(a.id)-result.seatOrder.indexOf(b.id);});
    }
    function reviewAudioAllowed(game,hidden){return !hidden&&(!game||game.phase==='results'||game.status==='over');}
    function conclusion(game,localId){
        if(!game||game.status!=='over')return null;
        var standings=game.seatOrder.map(function(id){return {id:id,participant:copy(game.roster[id]),hpUnits:game.hpUnits[id],withdrawn:game.withdrawn.includes(id),winner:game.winners.includes(id),self:id===localId};});
        if(game.protocolVersion>=14){
            standings.forEach(function(row){var e=game.eliminations&&game.eliminations[row.id];row.elimination=e?copy(e):null;});
            function unranked(row){return row.withdrawn&&!row.winner&&!row.elimination;}
            function compare(a,b){
                if(unranked(a)!==unranked(b))return Number(unranked(a))-Number(unranked(b));
                var aliveA=a.hpUnits>0,aliveB=b.hpUnits>0;if(aliveA!==aliveB)return Number(aliveB)-Number(aliveA);
                if(aliveA)return b.hpUnits-a.hpUnits;
                if(!a.elimination||!b.elimination)return 0;
                return b.elimination.round-a.elimination.round||b.elimination.rawRemainingHpUnits-a.elimination.rawRemainingHpUnits;
            }
            standings.sort(function(a,b){return compare(a,b)||game.seatOrder.indexOf(a.id)-game.seatOrder.indexOf(b.id);});
            var previous=null,index=0;standings.forEach(function(row){if(unranked(row)||row.hpUnits===0&&!row.elimination){row.rank=null;return;}index++;row.rank=previous&&compare(previous,row)===0?previous.rank:index;previous=row;});
            standings.forEach(function(row){row.tied=row.rank!==null&&standings.filter(function(other){return other.rank===row.rank;}).length>1;});
            return {matchId:game.matchId,round:game.round,winners:game.winners.slice(),standings:standings,rankingVersion:1,winnerConflict:standings.some(function(row){return row.rank!==null&&(row.rank===1)!==row.winner;}),outcome:!game.winners.length?'none':game.winners.includes(localId)?game.winners.length>1?'tie':'win':'loss',endReason:game.endReason};
        }
        standings.sort(function(a,b){return Number(b.winner)-Number(a.winner)||Number(a.withdrawn)-Number(b.withdrawn)||b.hpUnits-a.hpUnits||game.seatOrder.indexOf(a.id)-game.seatOrder.indexOf(b.id);});
        var previous=null,rank=0,index=0;standings.forEach(function(row){if(row.withdrawn&&!row.winner){row.rank=null;return;}index++;if(row.winner){rank=1;previous=null;}else if(previous!==row.hpUnits){rank=index;previous=row.hpUnits;}row.rank=rank;});
        return {matchId:game.matchId,round:game.round,winners:game.winners.slice(),standings:standings,outcome:!game.winners.length?'none':game.winners.includes(localId)?game.winners.length>1?'tie':'win':'loss',endReason:game.endReason};
    }
    function practice(context){
        if(!context||context.phase!=='results'||!context.question||!context.result||!Number.isFinite(context.result.score))return null;
        var score=Math.round(context.result.score*1000),row={id:'local',scoreUnits:score,error:context.result.error,damageUnits:0,hpBeforeUnits:0,hpAfterUnits:0,top:true,eliminated:false};
        if(context.question.type==='pitch')row.pitchErrors=context.result.errors||null;
        if(context.question.type==='quantity')row.quantityErrors=context.result.errors||null;
        if(context.question.type==='color')row.colorErrors=context.result.errors||null;
        return copy({key:'practice:'+context.serial,kind:'practice',matchId:'practice',round:context.round,question:context.question,config:context.config,roster:{local:{id:'local',type:'human',name:context.name}},seatOrder:['local'],submissions:{local:{answer:context.answer}},lastResult:{rows:[row],highestScoreUnits:score,topIds:['local'],multiplier:null},status:'practice',winners:[],localId:'local'});
    }
    function presentation(summary){
        if(!summary)return null;
        var own=summary.standings.find(function(row){return row.self;}),rank=own&&own.rank;
        return {headline:summary.outcome==='win'?'win':summary.outcome==='tie'?'tie':'finished',hasWinner:summary.winners.length>0,
            placement:!own?null:{rank:rank,tied:rank!==null&&summary.standings.filter(function(row){return row.rank===rank;}).length>1}};
    }
    function history(){var recent=null;return {observe:function(game,id){var next=capture(game,id);if(next&&(!recent||recent.key!==next.key))recent=next;return recent&&copy(recent);},remember:function(snapshot){if(snapshot)recent=copy(snapshot);return recent&&copy(recent);},latest:function(){return recent&&copy(recent);},clear:function(){recent=null;}};}
    return {capture:capture,practice:practice,timeline:timeline,rows:rows,conclusion:conclusion,presentation:presentation,reviewAudioAllowed:reviewAudioAllowed,history:history};
});
