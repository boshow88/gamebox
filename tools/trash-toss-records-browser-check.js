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
 for(const scene of ['living','office','park','construction','arena'])for(const difficulty of ['easy','normal','hard']){
  const modeKey='cpu-'+scene+'-'+difficulty;best[modeKey]=score;expected[modeKey]=score++;
 }
 // Older data is ignored by the list; loading pages must not migrate or delete it.
 best['cpu-living-easy-v5']=500;best['online-office-standard-v5']=999;best['local-living-standard-v5']=800;
 const saved=JSON.stringify({best,recent:[{mode:'online-office-standard-v5',score:999}]});
 localStorage.setItem(key,saved);
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
 if(localStorage.getItem(key)!==saved)throw Error('Loading the launcher automatically modified existing record data');
 const old=frame.contentDocument;frame.src='/games/trash-toss.html';
 await until(()=>frame.contentDocument!==old&&frame.contentWindow.__ttRecordsTest,'game did not load');
 const w=frame.contentWindow;doc=frame.contentDocument;w.ArcadeCommon.audio.setMuted(true);
 if(localStorage.getItem(key)!==saved)throw Error('Loading the game automatically modified existing record data');
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
 document.getElementById('result').textContent='PASS: '+rowsChecked+' localized CPU high-score rows, no automatic record migration/deletion, five-mode save policy, best HUD visibility, cloud sync gating and default score recording for other games.';
})().catch(error=>document.getElementById('result').textContent='FAIL: '+error.stack);
</script>`;
require('./birthday-browser-check.js');
