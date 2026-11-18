/* Automatic best-effort observations. Never called by game reducers or transactions. */
(function(root,factory){
    'use strict';
    if(typeof module==='object'&&module.exports)module.exports=factory(require('./impressions-match.js'),require('./impressions-results.js'),require('./impressions-playtest.js'),require('./impressions-categories.js'));
    else root.ImpressionsAnalytics=factory(root.ImpressionsMatch,root.ImpressionsResults,root.ImpressionsPlaytest,root.ImpressionsCategories);
})(typeof window==='object'?window:globalThis,function(Match,Results,Playtest,Categories){
    'use strict';
    var MAX_BYTES=700*1024,MAX_MATCHES=8;
    var CONFIG=['capacity','maxRounds','startingHp','timing','initialAnswer','generation','scoring','multiplierSchedule','autoSubmitLeadMs','categoryMode','selectionVersion','categoryWeights','adaptive','challengeVersion','challenge','quantity','pitch','color','cpu'];
    function copy(v){return JSON.parse(JSON.stringify(v));}
    // Only known configuration/question containers enter this filter. Free-form
    // identity fields are excluded, including strings under unexpected keys.
    function clean(v,depth){
        depth=depth||0;if(depth>12)throw new RangeError('Analytics nesting limit.');
        if(v===null||typeof v==='boolean'||Number.isFinite(v))return v;
        if(typeof v==='string'){if(v.length>80||!/^[-a-zA-Z0-9# .]+$/.test(v))throw new TypeError('Unexpected metadata string.');return v;}
        if(Array.isArray(v)){if(v.length>100)throw new RangeError('Metadata array limit.');return v.map(function(x){return clean(x,depth+1);});}
        if(!v||typeof v!=='object')throw new TypeError('Invalid analytics value.');
        var out={};Object.keys(v).forEach(function(k){if(!/^[a-zA-Z][a-zA-Z0-9]{0,45}$/.test(k)||/uid|email|name|avatar|photo|controller|token|nonce|password|roomCode/i.test(k))return;out[k]=clean(v[k],depth+1);});return out;
    }
    function settings(config){var out={};CONFIG.forEach(function(k){if(config[k]!==undefined)out[k]=clean(config[k]);});return out;}
    function question(q){
        var out={};['type','version','variant','variantVersion','variationVersion','answerSchema','scoringVersion','seed','target','targetHsl','parameters','challenge','difficulty','renderingVersion','variation','tones','fixed','groups','swatches','saturation','lightness'].forEach(function(k){if(q[k]!==undefined)out[k]=clean(q[k]);});return out;
    }
    function bytes(record){return new TextEncoder().encode(JSON.stringify(record)).length;}
    async function documentId(matchId){
        if(typeof matchId!=='string'||!matchId||matchId.length>180)throw new TypeError('Invalid match identity.');
        var digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode('gamebox-memory-analytics-v1|'+matchId));
        return Array.from(new Uint8Array(digest),function(n){return n.toString(16).padStart(2,'0');}).join('');
    }
    function create(options){
        options=options||{};var matches=new Map(),destroyed=false,timers=new Set(),lastStatus='idle',lastBytes=0;
        var defer=options.defer||function(fn,ms){return setTimeout(fn,ms);},cancel=options.cancel||clearTimeout;
        function later(fn,ms){var timer=defer(function(){timers.delete(timer);if(!destroyed)fn();},ms);timers.add(timer);}
        function entry(g){
            var e=matches.get(g.matchId);if(e)return e;
            if(matches.size>=MAX_MATCHES){var victim=Array.from(matches.values()).find(function(v){return v.uploadStatus!=='uploading';});if(!victim)return null;matches.delete(victim.id);}
            if(!Array.isArray(g.seatOrder)||g.seatOrder.length<2||g.seatOrder.length>8)return null;
            var ids=g.seatOrder.slice();if(new Set(ids).size!==ids.length)return null;
            e={id:g.matchId,ids:ids,anonymous:Object.fromEntries(ids.map(function(id,i){return[id,'p'+(i+1)];})),config:copy(g.config),protocol:g.protocolVersion,scoringVersion:g.scoringVersion,questions:new Map(),rounds:new Map(),terminal:null,record:null,uploadStatus:'observing',attempts:0};matches.set(g.matchId,e);return e;
        }
        function cacheQuestion(e,g){
            if(!g.question||!Number.isInteger(g.round)||g.round<1||g.round>100||typeof g.questionId!=='string')return;
            var old=e.questions.get(g.round);if(old&&old.id!==g.questionId)return;
            var q=old||{id:g.questionId,question:copy(g.question),timeline:copy(g.timeline),timing:copy(g.roundTiming||g.config.timing),receipts:{}};
            Object.keys(g.submissions||{}).forEach(function(id){var r=g.submissions[id];if(e.anonymous[id]&&r.matchId===e.id&&r.round===g.round&&r.questionId===q.id&&(r.categoryId===undefined||r.categoryId===q.question.type))q.receipts[id]=copy(r);});
            e.questions.set(g.round,q);
        }
        function capture(e,g){
            var result=g.lastResult;if(!result||!Number.isInteger(result.round)||result.round<1||result.round>100||g.settledRound<result.round||e.rounds.has(result.round))return;
            var cached=e.questions.get(result.round);if(!cached||result.questionId!==cached.id||result.categoryId!==undefined&&result.categoryId!==cached.question.type||!Array.isArray(result.rows)||!result.rows.length)return;
            var q=cached.question,cfg=Object.assign({},e.config,{scoring:Object.assign({version:e.scoringVersion},e.config.scoring)}),seen=new Set(),observations=[];
            for(var row of result.rows){
                if(!e.anonymous[row.id]||seen.has(row.id))return;seen.add(row.id);
                var receipt=cached.receipts[row.id];if(!row.missing&&(!receipt||!Categories.validateAnswer(q,receipt.answer,cfg)))return;
                if(row.missing&&receipt)return;
                var accepted=!row.missing,metric=Playtest.metrics(q,accepted?receipt.answer:null,cfg),elapsed=accepted?receipt.acceptedAt-cached.timeline.answerAt:null;
                var errors=metric.unit==='cents'?Object.fromEntries(metric.tones.filter(function(t){return !t.fixed;}).map(function(t){return[t.id,t.centsError];})):metric.unit==='relative-count'?Object.fromEntries(metric.groups.map(function(t){return[t.id,t.relativeError];})):Object.fromEntries(metric.swatches.map(function(t){return[t.id,t.error];}));
                observations.push({id:e.anonymous[row.id],answer:accepted?copy(receipt.answer):null,missing:!!row.missing,submissionSource:accepted&&['manual','auto','cpu'].includes(receipt.source)?receipt.source:accepted?'unknown':'missing',acceptedElapsedMs:Number.isFinite(elapsed)?elapsed:null,timeSource:accepted?'client-clock-estimate':'unavailable',error:row.error===undefined?null:row.error,metrics:{unit:metric.unit,errors:errors},scoreUnits:row.scoreUnits,damageUnits:row.damageUnits,hpBeforeUnits:row.hpBeforeUnits,hpAfterUnits:row.hpAfterUnits,eliminated:!!row.eliminated});
            }
            observations.sort(function(a,b){return Number(a.id.slice(1))-Number(b.id.slice(1));});
            e.rounds.set(result.round,{round:result.round,question:question(q),timing:{prepareMs:cached.timeline.memorizeAt-cached.timeline.startAt,memorizeMs:cached.timeline.answerAt-cached.timeline.memorizeAt,answerMs:cached.timeline.deadline-cached.timeline.answerAt},multiplier:result.multiplier,observations:observations});
        }
        function build(e){
            var g=e.terminal;if(!g||g.status!=='over'||!Number.isInteger(g.settledRound)||g.settledRound<1||g.settledRound>100)return null;
            var rounds=[];for(var r=1;r<=g.settledRound;r++){if(!e.rounds.has(r))return null;rounds.push(e.rounds.get(r));}
            var summary=Results.conclusion(g,null);if(!summary)return null;
            var participants=e.ids.map(function(id){var p=g.roster[id],standing=summary.standings.find(function(row){return row.id===id;}),el=g.eliminations&&g.eliminations[id];return {id:e.anonymous[id],type:p.type,cpuDifficulty:p.type==='cpu'?p.difficulty:null,cpuVersion:p.type==='cpu'?p.cpuVersion||1:null,startingHpUnits:Math.round(e.config.startingHp*1000),finalHpUnits:g.hpUnits[id],eliminationRound:el?el.round:null,placement:standing.rank,winner:g.winners.includes(id),withdrawn:g.withdrawn.includes(id)};});
            var frozen=settings(e.config);frozen.scoring=Object.assign({version:e.scoringVersion},frozen.scoring);
            return {schemaVersion:1,protocolVersion:e.protocol,captureMode:'client-best-effort',captureStatus:'complete',verificationStatus:'unverified-client-state',scoringVersion:e.scoringVersion,settings:frozen,participants:participants,rounds:rounds,finalResult:{status:'over',endReason:g.endReason,settledRounds:g.settledRound,lastRound:g.round,winners:g.winners.map(function(id){return e.anonymous[id];})}};
        }
        async function upload(e){
            if(destroyed||!e.record||e.uploadStatus==='created'||e.uploadStatus==='duplicate'||e.attempts>=3)return;
            e.uploadStatus='uploading';e.attempts++;
            try{var id=await documentId(e.id);if(destroyed)return;var result=await options.upload(id,copy(e.record));e.uploadStatus=result&&result.status||'unavailable';}
            catch(_){e.uploadStatus='failed';}
            lastStatus=e.uploadStatus;
            if(['failed','unavailable'].includes(e.uploadStatus)&&e.attempts<3)later(function(){upload(e);},e.attempts===1?2000:10000);
        }
        function observe(g){
            if(destroyed||options.enabled===false||!g||!g.matchId)return;
            try{
                if(!Match.supported(g))return;var e=entry(g);if(!e)return;
                cacheQuestion(e,g);capture(e,g);if(g.status==='over')e.terminal=copy(g);
                if(!e.terminal||e.record||e.uploadStatus==='too-large')return;
                var record=build(e);if(!record){lastStatus='incomplete';return;}
                lastBytes=bytes(record);if(lastBytes>MAX_BYTES){e.uploadStatus=lastStatus='too-large';return;}
                e.record=record;lastStatus='complete';if(typeof options.upload==='function')later(function(){upload(e);},0);
            }catch(_){lastStatus='unavailable';}
        }
        return {observe:observe,record:function(id){var e=matches.get(id);return e&&e.record?copy(e.record):null;},status:function(){return {status:lastStatus,matches:matches.size,bytes:lastBytes};},destroy:function(){destroyed=true;timers.forEach(cancel);timers.clear();matches.clear();}};
    }
    return {schemaVersion:1,maxBytes:MAX_BYTES,documentId:documentId,bytes:bytes,create:create};
});
