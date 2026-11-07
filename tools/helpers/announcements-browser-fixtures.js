'use strict';
const base = require('./feedback-browser-fixtures.js');
const extension = `
if(query.has('anonymous')) user.anon=true;
const announcementKey='announcement-browser-fixture', announcementObservers=[];
function articles(){return JSON.parse(localStorage.getItem(announcementKey)||'[]');}
function articleView(item){return {...item,publishedAt:timestamp(item.publishedAt),updatedAt:timestamp(item.updatedAt)};}
function versions(){return Object.fromEntries(articles().filter(item=>item.published).map(item=>[item.id,item.revision]));}
function announcementEmit(){announcementObservers.filter(w=>w.active).forEach(w=>w.next(versions()));}
function articleSave(items){localStorage.setItem(announcementKey,JSON.stringify(items));announcementEmit();}
addEventListener('storage',event=>{if(event.key===announcementKey)announcementEmit();});
function accountReads(uid){return JSON.parse(localStorage.getItem('announcement-profile:'+uid)||'{}');}
window.announcementCalls=[];window.announcementProfileReads=0;
window.ArcadeNet.profile.get=async uid=>{window.announcementProfileReads++;return {announcementReads:accountReads(uid),recordsMigratedAt:Date.now()};};
window.ArcadeNet.announcements={
 watchIndex:(next,error)=>{window.announcementCalls.push(['watch']);const observer={next,error,active:true};announcementObservers.push(observer);queueMicrotask(announcementEmit);return ()=>{observer.active=false;};},
 list:async cursor=>{window.announcementCalls.push(['list']);const items=articles().filter(item=>item.published).sort((a,b)=>b.publishedAt-a.publishedAt),offset=cursor||0;return {items:items.slice(offset,offset+20).map(articleView),cursor:offset+20,more:items.length>offset+20};},
 listAdmin:async cursor=>{const items=articles().sort((a,b)=>b.updatedAt-a.updatedAt),offset=cursor||0;return {items:items.slice(offset,offset+20).map(articleView),cursor:offset+20,more:items.length>offset+20};},
 save:async(id,input,expected)=>{const items=articles(),old=items.find(item=>item.id===id);if((old?old.revision:0)!==expected)throw Error('announcements/changed');const result={...input,id:id||'new-announcement',revision:expected+1,updatedAt:Date.now(),publishedAt:input.published&&(!old||!old.published)?Date.now():old?old.publishedAt:null};articleSave([...items.filter(item=>item.id!==id),result]);return {id:result.id,revision:result.revision};},
 remove:async(id,revision)=>{const item=articles().find(item=>item.id===id);if(item.revision!==revision||item.published)throw Error('announcements/changed');articleSave(articles().filter(item=>item.id!==id));},
 markRead:(id,revision)=>{const uid=user.uid;window.announcementCalls.push(['read',uid,id,revision]);const commit=()=>{const item=articles().find(item=>item.id===id);if(!item||!item.published||item.revision!==revision)return {saved:false};const reads=accountReads(uid);reads[id]=Math.max(reads[id]||0,revision);localStorage.setItem('announcement-profile:'+uid,JSON.stringify(reads));return {saved:true,reads};};if(window.deferAnnouncementRead)return new Promise(resolve=>{window.finishAnnouncementRead=()=>resolve(commit());});return Promise.resolve(commit());},
 markAllRead:expected=>{const uid=user.uid;window.announcementCalls.push(['readAll',uid,Object.keys(expected).length]);const commit=()=>{const current=versions(),reads=accountReads(uid);Object.keys(expected).forEach(id=>{if(current[id]===expected[id])reads[id]=Math.max(reads[id]||0,expected[id]);});localStorage.setItem('announcement-profile:'+uid,JSON.stringify(reads));return {saved:true,reads};};if(window.deferAllAnnouncementRead)return new Promise(resolve=>{window.finishAllAnnouncementRead=()=>resolve(commit());});return Promise.resolve(commit());},
};
`;
const accountStub = base.accountStub.replace("window.dispatchEvent(new CustomEvent('arcade-net-ready'));", extension + "\nwindow.dispatchEvent(new CustomEvent('arcade-net-ready'));");
const runner = `<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre><script>
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),errors=[];
addEventListener('message',event=>{if(event.data&&event.data.birthdayError)errors.push(event.data.birthdayError);});
async function until(test,label){for(let i=0;i<1500;i++){if(errors.length)throw Error(errors.join('; '));if(test())return;await sleep(10);}throw Error('Timed out: '+label);}
function frame(uid,extra=''){const f=document.createElement('iframe');f.width='390';f.height='844';f.src='/index.html?testAccount='+uid+extra;document.body.append(f);return f;}
function action(root,label){const b=[...root.querySelectorAll('button')].find(b=>b.textContent===label);if(!b)throw Error('Missing '+label);b.click();}
function close(doc){doc.querySelector('.modal-head button').click();}
(async()=>{
 const seed=Array.from({length:23},(_,i)=>({id:'p-'+i,title:{zh:i===21?'':'公告 '+i,en:'Notice '+i},body:{zh:i===21?'':'內容 '+i,en:i===22?'<img src=x onerror="alert(1)">':'Body '+i},important:i===22,game:i===22?'javascript:alert(1)':i===21?'darts':null,published:true,revision:1,publishedAt:1000+i,updatedAt:1000+i}));
 seed.push({id:'secret',title:{zh:'秘密草稿',en:'SECRET DRAFT'},body:{zh:'草稿',en:'Draft text'},published:false,revision:1,publishedAt:null,updatedAt:9999});
 localStorage.setItem('announcement-browser-fixture',JSON.stringify(seed));
 localStorage.setItem('announcement-profile:player-a',JSON.stringify(Object.fromEntries(seed.filter(item=>item.id!=='p-22'&&item.id!=='p-21'&&item.published).map(item=>[item.id,1]))));
 localStorage.setItem('feedback-browser-fixture','[]');
 const a=frame('player-a');await until(()=>a.contentWindow.testNoticeHub&&a.contentWindow.testNoticeHub.state('announcements').count===2,'account unread markers');
 const d=a.contentDocument,w=a.contentWindow;
 if(!d.getElementById('drawer-announcements-admin').hidden)throw Error('Player saw announcement management');
 if(w.announcementProfileReads!==1||w.announcementCalls.some(c=>c[0]==='list'))throw Error('Startup fetched full articles or reread the profile');
 d.getElementById('drawer-announcements').click();await until(()=>d.querySelectorAll('.announcement-item').length===20,'public page');
 if(d.querySelector('.announcement-board').textContent.includes('SECRET DRAFT')||d.querySelector('.announcement-editor'))throw Error('Draft/editor leaked to public');
 if(w.announcementCalls.some(c=>c[0]==='read'))throw Error('Opening list marked unseen content read');
 for(const width of [320,390,768]){a.style.width=width+'px';const card=d.querySelector('.modal-card');if(card.scrollWidth>card.clientWidth+1)throw Error('Public board overflow at '+width);}
 action(d.querySelector('.announcement-board'),'Load more');await until(()=>d.querySelectorAll('.announcement-item').length===23,'public pagination');
 let first=d.querySelector('[data-announcement-id="p-22"]');first.querySelector('details').open=true;
 await until(()=>w.testNoticeHub.state('announcements').count===1,'first read marker');
 if(first.querySelector('img')||first.querySelector('a')||!first.textContent.includes('<img'))throw Error('Unsafe announcement content/link');
 d.querySelector('[data-announcement-id="p-21"] details').open=true;await until(()=>!d.getElementById('menu-btn').classList.contains('has-unread'),'all announcements read');
 if(!d.querySelector('[data-announcement-id="p-21"] a').href.includes('/games/darts.html'))throw Error('Known game link missing');
 close(d);
 const admin=frame('admin','&admin=1');await until(()=>admin.contentDocument.getElementById('drawer-announcements-admin')&&!admin.contentDocument.getElementById('drawer-announcements-admin').hidden,'admin entry');
 const ad=admin.contentDocument;ad.getElementById('drawer-announcements-admin').click();await until(()=>ad.querySelector('[data-announcement-id="secret"]'),'admin drafts');
 action(ad.querySelector('.announcement-board'),'New announcement');await until(()=>ad.querySelector('.announcement-editor'),'editor');
 let form=ad.querySelector('.announcement-editor');form.elements.titleZh.value='新遊戲';form.elements.bodyZh.value='新遊戲已上線。';form.elements.titleEn.value='New release';form.elements.bodyEn.value='New game <b>release</b>.';form.elements.important.checked=true;form.elements.game.value='darts';
 for(const width of [320,390,768]){admin.style.width=width+'px';const card=ad.querySelector('.modal-card');if(card.scrollWidth>card.clientWidth+1)throw Error('Editor overflow at '+width);}
 action(form,'Save draft');await until(()=>ad.querySelector('[data-announcement-id="new-announcement"]'),'draft saved');
 await sleep(20);if(w.testNoticeHub.state('announcements').unread)throw Error('Draft notified readers');
 action(ad.querySelector('[data-announcement-id="new-announcement"]'),'Edit');form=ad.querySelector('.announcement-editor');form.requestSubmit();
 await until(()=>w.testNoticeHub.state('announcements').count===1,'new publication notification');
 // Feedback and announcements now publish through the real feature controllers.
 localStorage.setItem('feedback-browser-fixture',JSON.stringify([{id:'reply-a',uid:'player-a',text:'Feedback',at:1000,reply:{text:'Admin response',at:2000},replyVersion:1,unread:true}]));
 await until(()=>w.testNoticeHub.state('menu').count===2,'combined unread sources');
 d.getElementById('drawer-announcements').click();await until(()=>d.querySelector('[data-announcement-id="new-announcement"]'),'new public article');
 const published=d.querySelector('[data-announcement-id="new-announcement"]');published.querySelector('details').open=true;
 await until(()=>w.testNoticeHub.state('announcements').count===0,'new article read');
 if(!d.getElementById('menu-btn').classList.contains('has-unread')||!d.getElementById('drawer-feedback-mine').classList.contains('has-unread'))throw Error('Reading announcements cleared feedback dot');
 if(published.querySelector('b')||!published.textContent.includes('<b>release</b>'))throw Error('Published HTML was interpreted');close(d);
 d.getElementById('drawer-feedback-mine').click();await until(()=>d.querySelector('.feedback-reply'),'feedback response');d.querySelector('.feedback-reply').open=true;
 await until(()=>!d.getElementById('menu-btn').classList.contains('has-unread'),'both sources clear');close(d);
 action(ad.querySelector('[data-announcement-id="new-announcement"]'),'Edit');form=ad.querySelector('.announcement-editor');form.elements.bodyEn.value='Updated release';form.requestSubmit();
 await until(()=>w.testNoticeHub.state('announcements').count===1,'updated publication notifies again');
 action(ad.querySelector('[data-announcement-id="new-announcement"]'),'Edit');action(ad.querySelector('.announcement-editor'),'Withdraw to draft');action(ad.querySelector('.announcement-editor'),'Confirm withdrawal');
 await until(()=>w.testNoticeHub.state('announcements').count===0,'withdrawal removes notification');
 const guest=frame('guest','&anonymous=1');await until(()=>guest.contentWindow.testNoticeHub&&guest.contentWindow.testNoticeHub.state('announcements').count===23,'guest notification');
 const gd=guest.contentDocument,gw=guest.contentWindow;gd.getElementById('drawer-announcements').click();await until(()=>gd.querySelector('.announcement-item'),'guest board');gd.querySelector('details').open=true;
 await until(()=>gw.testNoticeHub.state('announcements').count===22,'guest local marker');
 if(gw.announcementCalls.some(c=>c[0]==='read')||gw.announcementProfileReads!==0)throw Error('Guest reading used profile writes/reads');
 action(gd.querySelector('.announcement-board'),'Mark all as read');await until(()=>gw.testNoticeHub.state('announcements').count===0,'guest bulk read beyond loaded page');
 if(gw.announcementCalls.some(c=>c[0]==='readAll'))throw Error('Guest bulk read used a profile write');
 guest.remove();const guestAgain=frame('guest','&anonymous=1');await until(()=>guestAgain.contentWindow.testNoticeHub&&guestAgain.contentWindow.testNoticeHub.state('announcements').count===0,'guest bulk markers persist');guestAgain.remove();
 // A late cloud acknowledgement must never publish into a new account.
 d.getElementById('drawer-announcements').click();await until(()=>d.querySelector('[data-announcement-id="p-22"]'),'account board');
 w.deferAnnouncementRead=true;const articles=JSON.parse(localStorage.getItem('announcement-browser-fixture'));articles.find(item=>item.id==='p-22').revision=2;localStorage.setItem('announcement-browser-fixture',JSON.stringify(articles));
 await until(()=>w.testNoticeHub.state('announcements').count===1,'fresh revision for race');action(d.querySelector('.announcement-board'),'Refresh');
 await until(()=>d.querySelector('[data-announcement-id="p-22"] summary').classList.contains('has-unread'),'refreshed revision');d.querySelector('[data-announcement-id="p-22"] details').open=true;
 await until(()=>w.finishAnnouncementRead,'pending acknowledgement');w.setTestUser({uid:'player-b',name:'B',anon:false});w.finishAnnouncementRead();await sleep(40);
 if(d.querySelector('.announcement-board')||w.testNoticeHub.state('announcements').count!==23)throw Error('Late read crossed account scope');
 close(ad);d.querySelector('#lang-toggle [data-lang="zh"]').click();d.getElementById('drawer-announcements').click();await until(()=>d.querySelector('[data-announcement-id="p-21"]'),'localized board');
 if(d.getElementById('drawer-announcements').textContent!=='公告欄'||!d.querySelector('[data-announcement-id="p-21"]').textContent.includes('Notice 21'))throw Error('Locale/fallback failed');
 w.deferAllAnnouncementRead=true;action(d.querySelector('.announcement-board'),'全部標為已讀');await until(()=>w.finishAllAnnouncementRead,'pending bulk read');
 const arriving=JSON.parse(localStorage.getItem('announcement-browser-fixture'));arriving.find(item=>item.id==='p-21').revision=2;
 arriving.push({id:'after-click',title:{zh:'新公告',en:'Arriving'},body:{zh:'內容',en:'Body'},revision:1,published:true,publishedAt:Date.now(),updatedAt:Date.now()});localStorage.setItem('announcement-browser-fixture',JSON.stringify(arriving));
 await until(()=>w.testNoticeHub.state('announcements').count===24,'publication arrived during bulk acknowledgement');w.finishAllAnnouncementRead();
 await until(()=>w.testNoticeHub.state('announcements').count===2,'new and updated announcements retain unread markers');
 const batch=w.announcementCalls.find(call=>call[0]==='readAll');if(batch[2]!==23)throw Error('Bulk read did not include announcements beyond the loaded page');
 localStorage.setItem('feedback-browser-fixture',JSON.stringify([{id:'reply-b',uid:'player-b',text:'Feedback B',at:1000,reply:{text:'Response',at:2000},replyVersion:1,unread:true}]));
 await until(()=>w.testNoticeHub.state('feedback').count===1,'feedback unread before bulk read');w.deferAllAnnouncementRead=false;
 action(d.querySelector('.announcement-board'),'全部標為已讀');await until(()=>w.testNoticeHub.state('announcements').count===0,'remaining bulk read');
 if(!d.getElementById('menu-btn').classList.contains('has-unread')||!d.getElementById('drawer-feedback-mine').classList.contains('has-unread'))throw Error('Bulk announcement read cleared feedback notifications');
 const next=JSON.parse(localStorage.getItem('announcement-browser-fixture'));next.find(item=>item.id==='p-0').revision=2;localStorage.setItem('announcement-browser-fixture',JSON.stringify(next));
 await until(()=>w.testNoticeHub.state('announcements').count===1,'new revision after bulk read notifies again');
 w.deferAllAnnouncementRead=true;w.finishAllAnnouncementRead=null;action(d.querySelector('.announcement-board'),'全部標為已讀');await until(()=>w.finishAllAnnouncementRead,'pending old account bulk read');
 w.setTestUser({uid:'player-c',name:'C',anon:false});w.finishAllAnnouncementRead();await sleep(40);
 if(d.querySelector('.announcement-board')||w.testNoticeHub.state('announcements').count!==24)throw Error('Late bulk acknowledgement crossed account scope');
 a.remove();admin.remove();document.getElementById('result').textContent='PASS: public/draft boards, bilingual fallback, safe game links/plain text, admin draft/publish/edit/withdraw, profile and guest read markers, revision notifications, account isolation, shared feedback dots and mobile layout.';
})().catch(error=>{document.getElementById('result').textContent='FAIL: '+error.stack;});
</script>`;
module.exports = { accountStub, runner };
