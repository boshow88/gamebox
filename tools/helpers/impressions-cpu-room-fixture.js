'use strict';
module.exports=async function(options={},fixturePolicy={}){
    const assert=require('node:assert/strict'),createRoom=require('../../js/games/impressions-room.js');
    const modules=Object.assign({},await import('../../js/net/rooms.mjs'),await import('../../js/net/rtdb-rooms.mjs'),await import('../../js/net/rtdb-values.mjs'));
    const db=require('./rtdb-fixtures.js').realtimeGameBackend(modules);let time=100000,serial=0,seeds=41;const clients=[],errors=[];
    function make(){
        const sid='impressions-cpu-tab-'+(++serial),user={uid:'same-account',name:'Device '+serial,anon:true},audioState={token:sid+'-audio',confirmed:true,usable:true};let hold=null,loseAck=false;
        const client=createRoom({now:()=>time,seedSource:()=>++seeds,audioStatus:()=>audioState,onError:e=>errors.push(e),net:{rooms:{presence:config=>modules.createRoomPresence({...config,now:()=>time}),create:config=>{
            if(fixturePolicy.protocolVersion){const start=config.startPatch;config={...config,startPatch:data=>{const patch=start(data);patch.game.protocolVersion=fixturePolicy.protocolVersion;if(fixturePolicy.protocolVersion<14)delete patch.game.eliminations;return patch;}};}
            const store=db.createStore(config,()=>user,sid,()=>time),transact=store.transact;
            store.transact=async(...args)=>{const paused=hold;hold=null;if(paused)await paused;const result=await transact(...args);if(loseAck){loseAck=false;throw Error('Lost acknowledgement');}return result;};
            return modules.createRoomService({store,getUser:()=>user,sessionId:sid,now:()=>time,generateCode:()=> 'CPU1'},config);
        }}}});
        client.audioState=audioState;client.hold=()=>{let release;hold=new Promise(resolve=>{release=resolve;});return release;};client.loseAck=()=>{loseAck=true;};clients.push(client);return client;
    }
    const get=()=>db.get('memory_rooms/R-CPU1'),game=()=>get().game;
    async function flush(task){const value=await task;await db.flush();return value;}
    async function setup(n){const host=make();await flush(host.create(options,'Host'));for(let i=1;i<n;i++)await flush(make().join('CPU1'));return clients;}
    async function start(){const host=clients.find(c=>c.current()&&c.service.currentPlayer().uid===get().hostUid);for(const c of clients)if(c.current()&&c!==host)await flush(c.ready(true));assert.equal(await flush(host.start()),true);}
    async function pulse(stamp,selected=clients){while(time<stamp){time=Math.min(stamp,time+2000);await flush(Promise.all(selected.filter(c=>c.current()).map(c=>c.tick())));}}
    return {db,clients,errors,make,get,game,flush,setup,start,pulse,time:()=>time,setTime:n=>{time=n;}};
};
