/* Actual launcher/arcade/controller checks; never contacts production Firebase. */
// node tools/trash-toss-records-browser-check.js /usr/bin/google-chrome
'use strict';
const fixtures = require('./helpers/birthday-browser-fixtures.js');
fixtures.fixedClock = '';
fixtures.accountStub = "window.ArcadeNet={ok:false};dispatchEvent(new CustomEvent('arcade-net-ready'));";
fixtures.transformSource = (file, body) => file.endsWith(require('node:path').join('js', 'games', 'trash-toss.js'))
    ? body.toString().replace('    reset(); render();', '    window.__ttRecordsTest={shell}; reset(); render();') : body;
fixtures.runner = `<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre><script>
(async()=>{
 const key='arcadeGames:scores:trash-toss',best={},expected={};let score=10;
 for(const mode of ['cpu','local','online'])for(const scene of ['living','office','park','construction','arena'])for(const difficulty of ['easy','normal','hard'])for(const version of ['v5','v7','v8']){
  const modeKey=[mode,scene,mode==='cpu'?difficulty:'standard',version].join('-');best[modeKey]=score;
  if(mode==='cpu')expected['cpu-'+scene+'-'+difficulty]=Math.max(expected['cpu-'+scene+'-'+difficulty]||0,score);
  score++;
 }
 // The highest score may be from an older version; it must survive consolidation.
 best['cpu-living-easy-v5']=500;expected['cpu-living-easy']=500;
 localStorage.setItem(key,JSON.stringify({best,recent:[{mode:'online-office-standard-v8',score:999},{mode:'cpu-living-easy-v5',score:500}]}));
 localStorage.setItem('arcadeGames:migratedAt','1793577600000');localStorage.setItem('gamebox:lang',JSON.stringify('en'));
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function until(test,label){for(let i=0;i<1000;i++){if(test())return;await sleep(10);}throw Error(label);}
 const frame=document.createElement('iframe');frame.width='1100';frame.height='900';frame.src='/index.html';document.body.append(frame);
 await until(()=>frame.contentDocument?.querySelector('.game-card'),'launcher did not load');
 let doc=frame.contentDocument,rowsChecked=0;
 for(const lang of ['en','zh']){
  doc.querySelector('[data-lang="'+lang+'"]').click();doc.getElementById('drawer-records').click();
  const game=[...doc.querySelectorAll('.rec-game')].find(node=>node.querySelector('.rec-game-name').textContent===(lang==='zh'?'丟垃圾':'Trash Toss'));
  if(!game)throw Error('CPU records disappeared');
  const rows=[...game.querySelectorAll('.rec-line')],values=rows.map(row=>Number(row.querySelector('.v').textContent)).sort((a,b)=>a-b);
  if(rows.length!==15||JSON.stringify(values)!==JSON.stringify(Object.values(expected).sort((a,b)=>a-b)))throw Error('Per-scene/per-difficulty CPU highs were lost or duplicated');
  if(new Set(rows.map(row=>row.querySelector('.k').textContent)).size!==15)throw Error('Duplicate record labels');
  if(game.querySelectorAll('.rec-group').length!==1||game.textContent.includes('舊版規則')||game.textContent.includes('Earlier rules')||game.textContent.includes('v8'))throw Error('Retired groups or version labels remain');
  rowsChecked+=rows.length;doc.querySelector('.modal-card .drawer-close').click();
 }
 const migrated=JSON.parse(localStorage.getItem(key));
 if(JSON.stringify(migrated.best)!==JSON.stringify(expected)||migrated.recent.some(run=>!run.mode.startsWith('cpu-')||/-v[0-9]+$/.test(run.mode)))throw Error('Stored records were not migrated');
 const old=frame.contentDocument;frame.src='/games/trash-toss.html';
 await until(()=>frame.contentDocument!==old&&frame.contentWindow.__ttRecordsTest,'game did not load');
 const w=frame.contentWindow;doc=frame.contentDocument;w.ArcadeCommon.audio.setMuted(true);
 let syncs=0;w.CloudSync.sync=()=>{syncs++;return Promise.resolve(false);};
 const shell=w.__ttRecordsTest.shell;
 for(const mode of ['local','online','practice','qa','cpu']){
  doc.getElementById('tt-mode').value=mode;doc.getElementById('tt-scene').value='office';doc.getElementById('tt-difficulty').value='normal';
  shell.goIdle();shell.start();
  if(doc.getElementById('tt-best-stat').hidden!==(mode!=='cpu'))throw Error(mode+' has the wrong best-score visibility');
  const before=localStorage.getItem(key),previousSyncs=syncs;
  shell.gameOver({score:mode==='cpu'?777:99999,win:true});
  if(shell.state!=='over')throw Error(mode+' failed to finish');
  const after=localStorage.getItem(key);
  if(mode!=='cpu'&&(after!==before||syncs!==previousSyncs))throw Error(mode+' still saves or syncs a record');
  if(mode==='cpu'&&(JSON.parse(after).best['cpu-office-normal']!==777||syncs!==previousSyncs+1))throw Error('CPU high was not recorded and synced');
 }
 shell.goIdle();shell.start();shell.gameOver({score:700,win:false});
 if(JSON.parse(localStorage.getItem(key)).best['cpu-office-normal']!==777||syncs!==1)throw Error('A lower CPU score replaced the best');
 const other=w.ArcadeCommon.shell.create({gameId:'record-default-check'});other.start();other.gameOver({score:33});
 if(JSON.parse(localStorage.getItem('arcadeGames:scores:record-default-check')).best.default!==33)throw Error('Other games lost their default record behavior');
 document.getElementById('result').textContent='PASS: '+rowsChecked+' localized CPU high-score rows, legacy consolidation, non-CPU cleanup, five-mode save policy, best HUD visibility, cloud sync gating and default score recording for other games.';
})().catch(error=>document.getElementById('result').textContent='FAIL: '+error.stack);
</script>`;
require('./birthday-browser-check.js');
