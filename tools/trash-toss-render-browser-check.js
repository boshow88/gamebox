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
 const make=cached=>{
  const parent=document.createElement('div');parent.style.width='351px';
  const canvas=document.createElement('canvas');parent.append(canvas);document.body.append(parent);
  canvas.getContext('2d',{willReadFrequently:true});
  const root={document:cached?document:null,TrashTossRules:R,innerWidth:375,innerHeight:812,devicePixelRatio:2};
  new Function('window',source)(root);
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
   binContents:R.binContents(scene,debris),players:2,active:0,playerLabels:['P1','P2'],countLabel:String,aiming:true,practice:true,qa:false};
  cached.view.follow();direct.view.follow();compare(model,id+' first');compare(model,id+' reused');
  debris[0].rotation+=.3;debris[0].x+=12;compare(model,id+' changed resting trash');
  model.active=1;model.charging=true;compare(model,id+' player/pose');
  for(const item of [cached,direct])item.view.panBy(-10000,item.canvas.getBoundingClientRect().top+20);
  compare(model,id+' panned');
  model.qa=true;compare(model,id+' resized QA');
 }
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function until(test,label){for(let i=0;i<500;i++){if(test())return;await sleep(10);}throw Error(label);}
 localStorage.setItem('arcadeGames:prefs:trash-toss',JSON.stringify({motion:'efficient'}));
 const frame=document.createElement('iframe');frame.style.width='375px';frame.src='/games/trash-toss.html';document.body.append(frame);
 const w=()=>frame.contentWindow,d=()=>frame.contentDocument;
 await until(()=>w().__ttTestState,'real controller');
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
 document.getElementById('result').textContent='PASS: '+checks+' real-canvas comparisons across five scenes, all 50 resting item sprites, cache reuse/invalidation, players/poses, panning and QA resize; max pixel MAE='+maxMae.toFixed(3)+', pixels differing >32='+(maxDifferent*100).toFixed(2)+'%; real charge/flight, retired FPS preference removal and mobile layout';
})().catch(error=>document.getElementById('result').textContent='FAIL: '+error.stack);
</script>`;
require('./birthday-browser-check.js');
