'use strict';
module.exports=async function(h){
    const assert=require('node:assert/strict'),A=require('../../js/games/impressions-analytics.js'),IO=require('../impressions-analytics/io.cjs');
    const online=async p=>{await h.online(p);const mode=p.name.includes('390')?'denied':p.name.includes('320')?'retry':'normal';await p.eval(`ArcadeNet.memoryAnalytics.create=async(id,record)=>{const response=await fetch('/__analytics?mode='+${JSON.stringify(mode)},{method:'POST',body:JSON.stringify({id,record})}),result=await response.json();if(result.status==='failed')throw Error('simulated offline');return result;};`);};
    await require('./impressions-rematch-browser.js')({...h,online});
    if(h.disabled){assert.equal(h.analyticsAttempts.length,0);console.log('PASS: recorder absent; complete native v14 eight-actor gameplay/rematches still work at all widths.');return;}
    await h.until(()=>h.analyticsAttempts.some(a=>a.mode==='retry'&&['created','duplicate'].includes(h.analyticsDocuments.has(a.id)?'created':'waiting')),'best-effort retry commits');
    assert(h.analyticsDocuments.size>=4);assert(h.analyticsAttempts.some(a=>a.mode==='denied'));assert(h.analyticsAttempts.length>h.analyticsDocuments.size,'multiple observers and retries deduplicate');
    const counts=new Map();for(const a of h.analyticsAttempts)counts.set(a.id,(counts.get(a.id)||0)+1);assert(Array.from(counts.values()).some(n=>n>1));
    for(const [id,record]of h.analyticsDocuments){assert(/^[a-f0-9]{64}$/.test(id));IO.validate(record);assert.equal(record.protocolVersion,14);assert.equal(record.participants.length,8);assert.equal(record.rounds.length,1);assert(A.bytes(record)<A.maxBytes);assert(record.participants.some(p=>p.type==='cpu'));assert(!/controllerId|AUTH_PRIVATE|Rematch Host|Rematch Guest|nonce|roomCode/.test(JSON.stringify(record)));}
    console.log('PASS: automatic capture without playtest flag; actual host/guest snapshot hooks, create-once dedup, denied/offline retry isolation, terminal/rematch identities, canonical raw answers and private-field removal.');
};
