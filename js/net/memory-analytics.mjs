/* One authenticated create-only commit. No reads, gameplay writes or durable queue. */
function value(v) {
    if(v===null)return {nullValue:null};
    if(typeof v==='boolean')return {booleanValue:v};
    if(typeof v==='string')return {stringValue:v};
    if(Number.isFinite(v))return Number.isSafeInteger(v)?{integerValue:String(v)}:{doubleValue:v};
    if(Array.isArray(v))return {arrayValue:{values:v.map(value)}};
    if(v&&typeof v==='object')return {mapValue:{fields:fields(v)}};
    throw new TypeError('Analytics must contain finite JSON values.');
}
function fields(data){return Object.fromEntries(Object.entries(data).map(([k,v])=>[k,value(v)]));}
export function createAnalyticsWriter({auth,projectId,fetch:request=globalThis.fetch,origin='https://firestore.googleapis.com'}) {
    return async function create(id,record){
        if(!/^[a-f0-9]{64}$/.test(id)||!/^[-a-z0-9]+$/.test(projectId))throw new TypeError('Invalid analytics destination.');
        const user=auth.currentUser;if(!user)return {status:'unavailable'};
        const token=await user.getIdToken(),base='projects/'+projectId+'/databases/(default)';
        const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
        try{
            const response=await request(origin+'/v1/'+base+'/documents:commit',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({writes:[{update:{name:base+'/documents/memoryMatchAnalytics/'+id,fields:fields(record)},currentDocument:{exists:false},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]}]})});
            if(response.ok)return {status:'created'};
            const error=await response.json().catch(()=>({})),code=error.error&&error.error.status;
            if(response.status===409||code==='ALREADY_EXISTS')return {status:'duplicate'};
            if(response.status===401||response.status===403)return {status:'denied'};
            throw Object.assign(new Error('Analytics create failed.'),{code:code||String(response.status)});
        }finally{clearTimeout(timer);}
    };
}
