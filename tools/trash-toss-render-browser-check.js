// Compare cached artwork with direct vector rendering in a real Canvas browser.
// node tools/trash-toss-render-browser-check.js /usr/bin/google-chrome
'use strict';
const fixtures = require('./helpers/birthday-browser-fixtures.js');
fixtures.fixedClock = '';
fixtures.accountStub = `window.ArcadeNet={ok:false}; dispatchEvent(new CustomEvent('arcade-net-ready'));`;
fixtures.transformSource = (file, body) => file.endsWith(require('node:path').join('js','games','trash-toss.js'))
    ? body.toString().replace('    reset(); render();', '    window.__ttTestState=()=>({phase,time:worldTime,seed:match.seed,age:ball&&ball.age}); reset(); render();') : body;
fixtures.runner = `<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre>
<script src="/js/games/trash-toss-rules.js"></script><script>
(async()=>{
 const source=await(await fetch('/js/games/trash-toss-view.js')).text(), R=TrashTossRules;
 const make=(cached,code=source)=>{
  const parent=document.createElement('div');parent.style.width='351px';
  const canvas=document.createElement('canvas');parent.append(canvas);document.body.append(parent);
  canvas.getContext('2d',{willReadFrequently:true});
  const root={document:cached?document:null,TrashTossRules:R,innerWidth:375,innerHeight:812,devicePixelRatio:2};
  new Function('window',code)(root);
  return {root,canvas,view:root.TrashTossView.create(canvas)};
 };
 const cached=make(true), direct=make(false);let checks=0,maxMae=0,maxDifferent=0;
 function compare(model,label){
  cached.view.render(model);direct.view.render(model);
  const a=cached.canvas.getContext('2d').getImageData(0,0,cached.canvas.width,cached.canvas.height).data;
  const b=direct.canvas.getContext('2d').getImageData(0,0,direct.canvas.width,direct.canvas.height).data;
  if(a.length!==b.length)throw Error(label+': backing dimensions differ');
  let total=0,different=0;
  for(let i=0;i<a.length;i+=4){let delta=0;for(let j=0;j<4;j++){const d=Math.abs(a[i+j]-b[i+j]);total+=d;delta=Math.max(delta,d);}if(delta>32)different++;}
  const mae=total/a.length,ratio=different/(a.length/4); maxMae=Math.max(maxMae,mae);maxDifferent=Math.max(maxDifferent,ratio);checks++;
  if(mae>1.5||ratio>.03)throw Error(label+': cached artwork differs: MAE='+mae+', changed pixels='+ratio);
 }
 for(const id of Object.keys(R.SCENES)){
  const scene=R.scenario({scene:id},1,42);
  const debris=Object.keys(R.ITEMS).map((item,i)=>({item,radius:R.ITEMS[item].radius,x:130+i%10*52,y:24+Math.floor(i/10)*55,rotation:i*.23,resting:true}));
  const model={scene,time:3,visualRain:scene.rain,angle:45,ball:null,trail:[],ghost:[],debris,
   binContents:R.binContents(scene,debris),players:2,active:0,playerLabels:['P1','P2'],aiming:true,practice:true,qa:false};
  cached.view.follow();direct.view.follow();compare(model,id+' first');compare(model,id+' reused');
  debris[0].rotation+=.3;debris[0].x+=12;compare(model,id+' changed resting trash');
  model.active=1;model.charging=true;compare(model,id+' player/pose');
  for(const item of [cached,direct])item.view.panBy(-10000,item.canvas.getBoundingClientRect().top+20);
  compare(model,id+' panned');
  model.qa=true;compare(model,id+' resized QA');
 }
 // Sample the actual sprite above and below every rim, including raised arena bins.
 let rimChecks=0;
 for(const renderer of [cached,direct]){
  renderer.canvas.parentElement.style.width='962px';renderer.root.innerWidth=1200;renderer.root.innerHeight=900;renderer.view.fit();
  for(const id of Object.keys(R.SCENES))for(const bin of R.SCENES[id].bins){
   const scene={...R.scenario({scene:id},1,42),qa:true,wind:0,rain:0,bins:[]};
   const ball={x:bin.x,y:(bin.y||0)+bin.height,item:'spraycap',radius:8,rotation:0};
   const model={scene,time:0,visualRain:0,angle:45,ball,trail:[],ghost:[],debris:[],binContents:{},players:1,active:0,playerLabels:['P1'],aiming:false,practice:true,qa:true};
   renderer.view.follow();renderer.view.render(model);
   const scale=renderer.canvas.width/scene.width;
   const top=Math.max(540,540*scene.width/960)-540+R.WORLD.floor-ball.y;
   const pixel=offset=>Array.from(renderer.canvas.getContext('2d').getImageData(Math.round(bin.x*scale),Math.round((top+offset)*scale),1,1).data);
   const offsets=[-5,0,5],before=offsets.map(pixel);
   scene.bins=[bin];renderer.view.render(model);
   const after=offsets.map(pixel),delta=i=>Math.max(...before[i].map((v,j)=>Math.abs(v-after[i][j])));
   for(let i=0;i<2;i++)if(delta(i)>3)throw Error(id+'/'+bin.id+': rim obscures trash above the opening');
   if(delta(2)<20)throw Error(id+'/'+bin.id+': near lip must remain in front of entering trash');
   rimChecks++;
  }
 }
 // Exercise the actual obstacle painter in isolation and compare reflected pixels.
 const facing=make(false,source.replace('fit(); return { fit, render','root.__paintObstacle=obstacle; fit(); return { fit, render'));
 facing.canvas.parentElement.style.width='960px';facing.canvas.parentElement.style.padding='1px';
 facing.root.innerWidth=1200;facing.root.innerHeight=900;facing.view.fit();
 if(facing.canvas.width!==1920)throw Error('Facing check needs an integer canvas scale');
 const facingContext=facing.canvas.getContext('2d'),spriteWidth=320,spriteHeight=400;
 let facingChecks=0;
 for(const id of ['mother','boss','walker','worker','worker-far','cleaner','baby','parrot','bird','laundry','files','planks','cart','wheelbarrow','umbrella']){
  const paint=direction=>{
   facingContext.save();facingContext.setTransform(1,0,0,1,0,0);facingContext.fillStyle='#ffffff';facingContext.fillRect(0,0,facing.canvas.width,facing.canvas.height);facingContext.restore();
   facing.root.__paintObstacle({id,x:240,y:0,width:46,height:130,direction,carrying:true,working:id==='cleaner',reach:0},.37);
   return facingContext.getImageData(320,(R.WORLD.floor-180)*2,spriteWidth,spriteHeight).data;
  };
  const right=paint(1),left=paint(-1);let error=0;
  for(let y=0;y<spriteHeight;y++)for(let x=0;x<spriteWidth;x++)for(let c=0;c<4;c++)error+=Math.abs(left[(y*spriteWidth+x)*4+c]-right[(y*spriteWidth+spriteWidth-1-x)*4+c]);
  if(error/left.length>.25)throw Error(id+': left-facing artwork does not mirror right-facing artwork: MAE='+error/left.length);
  facingChecks++;
 }
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function until(test,label){for(let i=0;i<500;i++){if(test())return;await sleep(10);}throw Error(label);}
 localStorage.setItem('arcadeGames:prefs:trash-toss',JSON.stringify({motion:'efficient'}));
 const frame=document.createElement('iframe');frame.style.width='375px';frame.src='/games/trash-toss.html';document.body.append(frame);
 const w=()=>frame.contentWindow,d=()=>frame.contentDocument;
 await until(()=>w().__ttTestState,'real controller');
 // Load the actual classic worker URL through the local static server. A
 // fallback-only test would miss importScripts/path/loading regressions.
 let workerStarts=0,workerMessages=0,workerErrors=0,pulses=0;
 const Worker=w().Worker;
 const planner=w().TrashTossCPU.create({Worker:class extends Worker{
  constructor(url){super(url);workerStarts++;this.addEventListener('message',()=>workerMessages++);this.addEventListener('error',()=>workerErrors++);}
 }});
 const workerArgs=[R.scenario({scene:'construction'},1,42),'hard',42,0,[]],expectedPlan=R.cpuPlan(...workerArgs);
 const heartbeat=setInterval(()=>pulses++,1);
 try{
  const planned=await new Promise(resolve=>planner.plan(...workerArgs,resolve));
  if(JSON.stringify(planned)!==JSON.stringify(expectedPlan))throw Error('Worker strategy differs from rules');
  if(workerStarts!==1||workerMessages!==1||workerErrors||!pulses)throw Error('Real worker did not finish while main-thread timers continued');
 }finally{clearInterval(heartbeat);planner.destroy();}
 w().ArcadeCommon.audio.setMuted(true);d().getElementById('overlay-btn').click();
 w().dispatchEvent(new (w().KeyboardEvent)('keydown',{key:' ',code:'Space'}));
 if(w().__ttTestState().phase!=='charge')throw Error('Real charge input failed');
 const state=w().__ttTestState();
 if(d().getElementById('tt-motion')||w().ArcadeCommon.prefs.get('trash-toss').motion!==undefined)throw Error('Retired 30 FPS option/preference remains');
 await sleep(150);w().dispatchEvent(new (w().KeyboardEvent)('keyup',{key:' ',code:'Space'}));
 if(w().__ttTestState().phase!=='flight')throw Error('Release failed');
 if(w().__ttTestState().phase!=='flight'||w().__ttTestState().seed!==state.seed)throw Error('Live flight reset');
 await sleep(80);if(!(w().__ttTestState().age>0))throw Error('Flight clock stopped');
 const previous=d();w().location.reload();await until(()=>d()!==previous&&w().__ttTestState,'reload');
 if(d().getElementById('tt-motion')||w().ArcadeCommon.prefs.get('trash-toss').motion!==undefined)throw Error('Retired FPS option survived reload');
 if(d().documentElement.scrollWidth>w().innerWidth+1)throw Error('Settings overflow phone width');
 d().getElementById('overlay-btn').click();
 d().getElementById('tt-throw').dispatchEvent(new (w().PointerEvent)('pointerdown',{pointerId:7,pointerType:'touch',button:0,isPrimary:true,bubbles:true}));
 await sleep(150);
 d().getElementById('tt-throw').dispatchEvent(new (w().PointerEvent)('lostpointercapture',{pointerId:7,pointerType:'touch',bubbles:true}));
 if(w().__ttTestState().phase!=='charge')throw Error('Capture loss cancelled an otherwise valid touch');
 w().dispatchEvent(new (w().TouchEvent)('touchend',{touches:[],changedTouches:[],bubbles:true}));
 if(w().__ttTestState().phase!=='flight')throw Error('Touchend did not recover missing pointerup');
 await sleep(80);const age=w().__ttTestState().age;
 w().dispatchEvent(new (w().PointerEvent)('pointerup',{pointerId:7,pointerType:'touch',bubbles:true}));
 if(w().__ttTestState().age<age)throw Error('Duplicate pointerup launched twice');
 for(const width of [375,1200]){
  frame.style.width=width+'px';await until(()=>w().innerWidth===width,'resize frame');
  let expected;
  for(const scene of Object.keys(R.SCENES)){
   const select=d().getElementById('tt-scene');select.value=scene;select.dispatchEvent(new (w().Event)('change',{bubbles:true}));
   d().getElementById('tt-apply').click();await new Promise(resolve=>w().requestAnimationFrame(()=>w().requestAnimationFrame(resolve)));
   const canvas=d().getElementById('stage'),bounds=canvas.parentElement.getBoundingClientRect();
   const size=[bounds.width,bounds.height,canvas.width,canvas.height];
   if(expected&&size.some((v,i)=>Math.abs(v-expected[i])>1))throw Error(scene+': scene switch resizes '+width+'px frame: '+JSON.stringify({expected,size}));
   expected=size;
  }
 }
 document.getElementById('result').textContent='PASS: '+checks+' real-canvas comparisons, '+rimChecks+' rim occlusion checks and '+facingChecks+' actor reflection checks across five scenes, all 50 resting item sprites, cache reuse/invalidation, players/poses, panning and QA resize; max pixel MAE='+maxMae.toFixed(3)+', pixels differing >32='+(maxDifferent*100).toFixed(2)+'%; real CPU worker with responsive main thread, charge/flight, retired FPS preference removal, mobile layout and stable frame dimensions across scene switches at phone/desktop widths';
})().catch(error=>document.getElementById('result').textContent='FAIL: '+error.stack);
</script>`;
require('./birthday-browser-check.js');
