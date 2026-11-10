/* UI fixtures only. Actual Firestore authorization is tested by feedback-rules-check.mjs. */
'use strict';
const accountStub = `
const query = new URLSearchParams(location.search), callbacks = [], noticeCallbacks = [];
const createHub = window.GameBoxNotifications.create;
window.GameBoxNotifications.create = options => { const hub = createHub(options); window.testNoticeHub = hub; return hub; };
let user = { uid: query.get('testAccount') || 'player-a', name: 'Alex', email: 'alex@example.com', anon: false };
const key = 'feedback-browser-fixture';
function records() { return JSON.parse(localStorage.getItem(key) || '[]'); }
function publish(items) { localStorage.setItem(key, JSON.stringify(items)); emit(); }
function timestamp(value) { return value ? { toDate: () => new Date(value) } : null; }
function hydrate(item) { return { ...item, at: timestamp(item.at), reply: item.reply ? { ...item.reply, at: timestamp(item.reply.at) } : null }; }
function unread(uid) { return records().filter(item => item.uid === uid && item.unread).slice(0, 20).map(hydrate); }
function adminUnread() { return records().filter(item => item.adminUnread === true).sort((a,b) => a.id.localeCompare(b.id)); }
function emit() { noticeCallbacks.slice().forEach(watch => { if (watch.active) watch.next(watch.admin ? adminUnread().slice(0,20).map(hydrate) : unread(watch.uid)); }); }
addEventListener('storage', event => { if (event.key === key) emit(); });
window.calls = []; window.unsubscribes = 0; window.adminUnsubscribes = 0;
window.failNotices = () => noticeCallbacks.filter(watch => watch.active && !watch.admin).forEach(watch => watch.error(Error('Simulated listener failure')));
window.failAdminNotices = () => noticeCallbacks.filter(watch => watch.active && watch.admin).forEach(watch => watch.error(Error('Simulated admin listener failure')));
window.replayAdminNotices = () => noticeCallbacks.filter(watch => watch.admin).forEach(watch => watch.next([{id:'stale-admin-note',adminUnread:true}]));
const BrowserObserver=window.IntersectionObserver;
window.activeReadObservers=0;
window.IntersectionObserver=class extends BrowserObserver {
 observe(target){if(!this.watching){this.watching=true;window.activeReadObservers++;}super.observe(target);}
 disconnect(){if(this.watching){this.watching=false;window.activeReadObservers--;}super.disconnect();}
};
window.setTestUser = next => { user = next; callbacks.forEach(fn => fn(next)); };
function patch(id, build) { const items = records(), item = items.find(row => row.id === id); if (!item) throw Error('not-found'); build(item); publish(items); }
const box = {
 listMine: async cursor => { const uid = user.uid; window.calls.push(['mine', uid]); const items = records().filter(item => item.uid === uid).sort((a,b) => b.at-a.at); const offset = cursor || 0; const page = { items: items.slice(offset, offset+20).map(hydrate), cursor: offset+20, more: items.length > offset+20 }; if (window.deferList) return new Promise(resolve => { window.finishList = () => resolve(page); }); return page; },
 listAdmin: async () => { window.calls.push(['admin', user.uid]); return { items: records().sort((a,b) => b.at-a.at).map(hydrate), cursor: null, more: false }; },
 listUnread: async () => ({ items: unread(user.uid), cursor: null, more: false }),
 watchUnread: (next, error) => { const watch = { uid: user.uid, next, error, active: true }; noticeCallbacks.push(watch); queueMicrotask(emit); return () => { watch.active = false; window.unsubscribes++; }; },
 listAdminUnread: async cursor => { window.calls.push(['adminNew',user.uid]); const items=adminUnread().filter(item=>!cursor||item.id>cursor).slice(0,20); return {items:items.map(hydrate),cursor:items.at(-1)?.id||null,more:items.length===20}; },
 watchAdminUnread: (next,error) => { window.calls.push(['adminWatch',user.uid]); const watch={admin:true,next,error,active:true}; noticeCallbacks.push(watch); queueMicrotask(emit); return ()=>{watch.active=false;window.adminUnsubscribes++;}; },
 markAdminRead: id => { window.calls.push(['adminRead',id,user.uid]); const commit=()=>{if(window.failAdminAck)throw Error('Simulated acknowledgement failure');patch(id,item=>{item.adminUnread=false;});}; if(window.deferAdminAck)return new Promise(resolve=>{window.finishAdminAck=()=>{commit();resolve();};}); return Promise.resolve().then(commit); },
 markRead: async (id, expected) => { window.calls.push(['read', id, expected]); let saved = false; patch(id, item => { if (item.uid === user.uid && item.replyVersion === expected && item.unread) { item.unread = false; saved = true; } }); return saved; },
 reply: async (id, text, expected) => { window.calls.push(['reply', id, expected]); patch(id, item => { if ((item.replyVersion || 0) !== expected) throw Error('feedback/reply-changed'); item.reply = { text: text.trim(), by: user.uid, at: Date.now() }; item.replyVersion = expected+1; item.unread = true; }); return expected+1; },
 setResolved: async (id, value) => patch(id, item => { item.resolved = value; }),
 remove: async id => publish(records().filter(item => item.id !== id)),
};
window.ArcadeNet = { ok: true, currentUser: () => user, onAuth: fn => { callbacks.push(fn); queueMicrotask(() => fn(user)); },
 profile: { get: async () => ({ recordsMigratedAt: Date.now() }), save: async () => {} }, field: { delete: () => null },
 isAdmin: async () => query.has('admin') && !!user && user.uid.startsWith('admin'), signOut: async () => window.setTestUser(null), signInGoogle: async () => {},
 feedbackBox: box, feedback: async input => publish([...records(), { ...input, id: 'new', uid: user.uid, at: Date.now(), replyVersion: 0, unread: false, adminUnread: true }]),
};
window.dispatchEvent(new CustomEvent('arcade-net-ready'));
`;
const runner = `<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre><script>
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), errors = [];
addEventListener('message', event => { if (event.data && event.data.birthdayError) errors.push(event.data.birthdayError); });
async function until(test, label) { for (let i=0;i<1000;i++) { if (errors.length) throw Error(errors.join('; ')); if (test()) return; await sleep(10); } throw Error('Timed out: '+label); }
function frame(uid, admin = false) { const f = document.createElement('iframe'); f.width='390'; f.height='844'; f.src='/index.html?testAccount='+uid+(admin?'&admin=1':''); document.body.append(f); return f; }
function close(doc) { doc.querySelector('.modal-head button').click(); }
function dots(doc, active) {
 for (const id of ['menu-btn', 'drawer-feedback-mine']) {
  const el=doc.getElementById(id);
  if (el.classList.contains('has-unread')!==active) throw Error('Incorrect unread indicator on '+id);
  if (active && !el.getAttribute('aria-label').includes('unread')) throw Error('Unread count missing from accessible label');
 }
}
(async () => {
 const seed = Array.from({length:24}, (_,i) => ({ id:'a-'+i, uid:'player-a', text:i===0?'<img src=x onerror="alert(1)">':'Own note '+i, at:1000+i, replyVersion:0, unread:false }));
 seed.push({ id:'private-b', uid:'player-b', text:'PRIVATE OTHER ACCOUNT', at:9000, replyVersion:0, unread:false });
 localStorage.setItem('feedback-browser-fixture', JSON.stringify(seed));
 const a=frame('player-a'); await until(() => a.contentDocument.getElementById('drawer-feedback-mine') && !a.contentDocument.getElementById('drawer-feedback-mine').hidden, 'signed-in entry');
 const d=a.contentDocument, w=a.contentWindow;
 dots(d,false);
 const menuSize=d.getElementById('menu-btn').getBoundingClientRect();
 d.getElementById('drawer-feedback-mine').click();
 await until(() => d.querySelectorAll('.fb-item').length===20, 'first history page');
 if (d.querySelector('.feedback-inbox').textContent.includes('PRIVATE OTHER ACCOUNT') || d.querySelector('.feedback-reply-form')) throw Error('Player inbox exposed admin controls or another account');
 for (const width of [320,390,768]) { a.style.width=width+'px'; const card=d.querySelector('.modal-card'); if (card.scrollWidth>card.clientWidth+1) throw Error('Inbox overflow at '+width); }
 [...d.querySelectorAll('.feedback-action')].find(b=>b.textContent==='Load more').click();
 await until(() => d.querySelectorAll('.fb-item').length===24, 'older feedback pagination');
 if (d.querySelector('.feedback-inbox img, .feedback-inbox script')) throw Error('Submitted markup executed'); close(d);
 const admin=frame('admin',true); await until(()=>admin.contentDocument.getElementById('drawer-feedback-admin')&&!admin.contentDocument.getElementById('drawer-feedback-admin').hidden,'admin entry');
 const ad=admin.contentDocument; ad.getElementById('drawer-feedback-admin').click();
 await until(()=>ad.querySelector('[data-feedback-id="a-23"] textarea'),'admin reply editor');
 let card=ad.querySelector('[data-feedback-id="a-23"]');
 if([...ad.querySelectorAll('.feedback-admin-reply')].some(el=>el.open)||card.querySelector('textarea').getClientRects().length)throw Error('Admin editors must start collapsed');
 if(!card.querySelector('.fb-author')||!card.querySelector('.fb-tags .fb-state'))throw Error('Admin cards need structured identity and status');
 const compactHeight=card.getBoundingClientRect().height;
 card.querySelector('.feedback-admin-reply summary').click();
 await until(()=>card.querySelector('textarea').getClientRects().length,'expand admin editor');
 if(card.getBoundingClientRect().height<=compactHeight+80)throw Error('Reply editor did not expand');
 card.querySelector('textarea').value='Draft survives folding';
 card.querySelector('.feedback-admin-reply summary').click();
 card.querySelector('.feedback-admin-reply summary').click();
 if(card.querySelector('textarea').value!=='Draft survives folding')throw Error('Folding erased draft');
 card.querySelector('textarea').value='<b>Official reply</b>'; card.querySelector('form').requestSubmit();
 await until(()=>ad.querySelector('[data-feedback-id="a-23"] .feedback-reply'),'saved reply');
 await until(()=>!d.getElementById('feedback-notification').hidden,'realtime reply notification');
 dots(d,true);
 if (Math.abs(d.getElementById('menu-btn').getBoundingClientRect().width-menuSize.width)>.5) throw Error('Showing a notification changed menu button width');
 if (parseFloat(w.getComputedStyle(d.getElementById('menu-btn'),'::after').width)<12) throw Error('Menu notification dot is too small');
 w.failNotices(); dots(d,true);
 if (d.getElementById('feedback-notification-error').hidden) throw Error('Listener failure must retain known indicators with an error message');
 // A second unread reply keeps the outer dots until both are explicitly read.
 let second=ad.querySelector('[data-feedback-id="a-22"]'); second.querySelector('.feedback-admin-reply').open=true; second.querySelector('textarea').value='Second reply'; second.querySelector('form').requestSubmit();
 await until(()=>d.getElementById('feedback-notification').textContent.includes('2 unread'),'two unread replies');
 d.getElementById('menu-btn').click(); dots(d,true);
 if (d.getElementById('drawer').getAttribute('aria-hidden')!=='false') throw Error('Menu did not open');
 for (const width of [320,390,768]) {
  a.style.width=width+'px';
  for (const id of ['menu-btn','drawer-feedback-mine']) {
   const el=d.getElementById(id), rect=el.getBoundingClientRect(), style=w.getComputedStyle(el,'::after');
   if (style.content==='none' || rect.width<20 || rect.right>w.innerWidth+1) throw Error('Unread indicator or button clipped at '+width);
  }
 }
 d.getElementById('drawer-feedback-mine').click();
 await until(()=>d.querySelector('.feedback-unread-tab'),'unread tab');
 if (!d.querySelector('.feedback-unread-tab').classList.contains('has-unread')) throw Error('Unread tab lacks the nested indicator');
 let unreadTab=d.querySelector('.feedback-unread-tab'); const unreadSize=unreadTab.getBoundingClientRect();
 if (w.getComputedStyle(unreadTab).paddingRight!==w.getComputedStyle(unreadTab).paddingLeft) throw Error('Unread tab reserves extra horizontal badge space');
 d.querySelector('.feedback-unread-tab').click();
 unreadTab=d.querySelector('.feedback-unread-tab');
 await until(()=>d.querySelector('[data-feedback-id="a-23"] .feedback-reply'),'unread detail');
 if (w.calls.some(call=>call[0]==='read')) throw Error('Opening the inbox acknowledged an unseen reply');
 const reply=d.querySelector('[data-feedback-id="a-23"] .feedback-reply');
 if (!reply.querySelector('summary').classList.contains('has-unread')) throw Error('Unread reply lacks its indicator');
 reply.open=true;
 await until(()=>w.calls.some(call=>call[0]==='read'&&call[1]==='a-23')&&!reply.querySelector('summary').classList.contains('has-unread'),'first reply acknowledgement');
 dots(d,true);
 if (!d.querySelector('.feedback-unread-tab').classList.contains('has-unread')) throw Error('Reading one reply cleared other unread indicators');
 d.querySelector('[data-feedback-id="a-22"] .feedback-reply').open=true;
 await until(()=>d.getElementById('feedback-notification').hidden,'read acknowledgement');
 dots(d,false);
 if (d.querySelector('.feedback-unread-tab').classList.contains('has-unread')) throw Error('Unread tab indicator remained after all replies were read');
 if (Math.abs(unreadTab.getBoundingClientRect().width-unreadSize.width)>.5) throw Error('Acknowledging replies changed unread tab width');
 // A future announcements feature can use the same tree without controlling the menu.
 const hub=w.testNoticeHub, announcement=hub.source('announcements','menu');
 const announcementButton=d.createElement('button'); announcementButton.textContent='Announcements'; announcementButton.className='drawer-item'; d.getElementById('drawer').append(announcementButton);
 hub.bind(announcementButton,'announcements',state=>'Announcements'+(state.unread?' · '+hub.describe(state):''));
 announcement.publish(1);
 if (!d.getElementById('menu-btn').classList.contains('has-unread') || d.getElementById('drawer-feedback-mine').classList.contains('has-unread') || !announcementButton.classList.contains('has-unread')) throw Error('Announcements must light only their own branch and its ancestors');
 const feedbackSource=hub.source('feedback','menu'); feedbackSource.publish(2);
 announcement.publish(0);
 if (!d.getElementById('menu-btn').classList.contains('has-unread') || !d.getElementById('drawer-feedback-mine').classList.contains('has-unread') || announcementButton.classList.contains('has-unread')) throw Error('Clearing announcements erased unread feedback');
 feedbackSource.publish(0); announcement.publish(1);
 if (!d.getElementById('menu-btn').classList.contains('has-unread')) throw Error('Clearing feedback erased unread announcements');
 announcement.dispose(); announcementButton.remove();
 // Re-register the feature's publisher after the synthetic-source checks above.
 w.setTestUser({uid:'temporary',anon:false}); w.setTestUser({uid:'player-a',anon:false,name:'Alex'});
 await until(()=>!d.querySelector('.feedback-inbox'),'scope reset after synthetic source');
 if (announcement.publish(5)!==false || feedbackSource.publish(5)!==false) throw Error('Old feature publishers survived an account change');
 if (reply.querySelector('b') || !reply.textContent.includes('<b>Official reply</b>')) throw Error('Admin markup must render as plain text');
 if (d.querySelector('.modal-card')) close(d);
 card=ad.querySelector('[data-feedback-id="a-23"]');
 if(card.querySelectorAll('details').length!==1||card.querySelector('.feedback-admin-reply').open||!card.querySelector('summary').textContent.includes('Replied'))throw Error('Saved admin reply should have one collapsed editor and replied status');
 card.querySelector('.feedback-admin-reply').open=true; card.querySelector('textarea').value='Updated official reply'; card.querySelector('form').requestSubmit();
 await until(()=>!d.getElementById('feedback-notification').hidden,'updated reply notifies again');
 dots(d,true);
 card=ad.querySelector('[data-feedback-id="a-23"]'); card.querySelector('.fb-resolved input').click();
 await until(()=>card.classList.contains('is-resolved'),'resolved status');
 if(card.querySelector('.fb-state').textContent!=='Handled')throw Error('Handled badge did not update');
 d.getElementById('drawer-feedback-mine').click(); await until(()=>d.querySelector('[data-feedback-id="a-23"].is-resolved'),'owner sees handled status');
 close(d);
 // A delayed response from the old account must not survive an identity switch.
 w.deferList=true; d.getElementById('drawer-feedback-mine').click();
 await until(()=>w.finishList,'pending old account list');
 w.setTestUser({ uid:'player-b',name:'B',anon:false }); w.finishList(); await sleep(40);
 if (d.querySelector('.feedback-inbox') || !d.getElementById('feedback-notification').hidden || !w.unsubscribes) throw Error('Account change retained old inbox/notifications');
 dots(d,false);
 w.deferList=false; d.getElementById('drawer-feedback-mine').click();
 await until(()=>d.querySelector('.fb-item'),'new account inbox');
 if (d.querySelectorAll('.fb-item').length!==1 || !d.querySelector('.fb-item').textContent.includes('PRIVATE OTHER ACCOUNT')) throw Error('New account received old history');
 close(d); w.setTestUser({uid:'guest',anon:true});
 if (!d.getElementById('drawer-feedback-mine').hidden || !d.getElementById('feedback-notification').hidden) throw Error('Guest received private account UI');
 dots(d,false);
 // Existing submission form still records suggestions and explains account tracking.
 w.setTestUser({uid:'player-a',anon:false,name:'Alex'}); d.getElementById('drawer-feedback').click();
 const form=d.querySelector('.wip-gate-card'); form.querySelector('textarea').value='New account suggestion'; [...form.querySelectorAll('button')].find(b=>b.textContent==='Send').click();
 await until(()=>JSON.parse(localStorage.getItem('feedback-browser-fixture')).some(item=>item.id==='new'&&item.uid==='player-a'),'new submission');
 ad.querySelector('[data-feedback-id="a-23"] .fb-del').click(); ad.querySelector('[data-feedback-id="a-23"] .fb-del').click();
 await until(()=>!ad.querySelector('[data-feedback-id="a-23"]'),'admin deletion');
 close(ad);
 // Admin notifications have their own branch and shared, viewport-based acknowledgements.
 const aw=admin.contentWindow; admin.scrollIntoView();
 const queued=Array.from({length:24},(_,i)=>({id:'queue-'+String(i).padStart(2,'0'),uid:'player-a',text:'New submission '+i,at:20000+i,adminUnread:true,resolved:i===19,unread:false,replyVersion:0}));
 queued.push({id:'legacy',uid:'player-a',text:'Legacy note',at:1});
 queued.push({id:'admin-own',uid:'admin',text:'Admin personal submission',at:2,unread:true,replyVersion:1,reply:{text:'A personal reply',at:3}});
 localStorage.setItem('feedback-browser-fixture',JSON.stringify(queued));
 await until(()=>aw.testNoticeHub.state('feedback-admin').count===20&&aw.testNoticeHub.state('feedback').count===1,'bounded admin queue and personal reply');
 if(!aw.testNoticeHub.state('feedback-admin').atLeast)throw Error('Full admin queue must report a lower-bound count');
 if(w.calls.some(call=>call[0]==='adminWatch'))throw Error('Ordinary player subscribed to admin feedback');
 for(const id of ['drawer-announcements-admin','drawer-admins'])if(ad.getElementById(id).classList.contains('has-unread'))throw Error('Unrelated admin entry inherited a notification');
 const adminAnnouncements=aw.testNoticeHub.source('announcements','menu');adminAnnouncements.publish(1);
 ad.getElementById('menu-btn').click();await sleep(80);
 if(aw.calls.some(call=>call[0]==='adminRead'))throw Error('Opening menu acknowledged unseen submissions');
 ad.getElementById('drawer-feedback-admin').click();
 await until(()=>ad.querySelectorAll('.fb-item').length===20,'new submissions page');
 if(ad.querySelector('.feedback-submissions-tab').getAttribute('aria-pressed')!=='true'||!ad.querySelector('.feedback-submissions-tab').classList.contains('has-unread'))throw Error('Admin new-submission tab missing');
 if(ad.querySelector('[data-feedback-id="legacy"]'))throw Error('Legacy note treated as a new notification');
 await until(()=>aw.calls.some(call=>call[0]==='adminRead'&&call[1]==='queue-00'),'visible text acknowledged after dwell');
 await sleep(650);
 if(aw.calls.some(call=>call[0]==='adminRead'&&call[1]==='queue-19'))throw Error('Offscreen submission was acknowledged');
 let far=ad.querySelector('[data-feedback-id="queue-19"]');
 if(!far.querySelector('.fb-meta').classList.contains('has-unread'))throw Error('Bounded listener eviction cleared an unseen item');
 far.scrollIntoView({block:'start'});
 await until(()=>aw.calls.some(call=>call[0]==='adminRead'&&call[1]==='queue-19')&&!far.querySelector('.fb-meta').classList.contains('has-unread'),'scrolling acknowledges offscreen submission');
 if(!far.classList.contains('is-resolved'))throw Error('Reading changed handled status');
 for(const width of [320,390,768]){admin.style.width=width+'px';const modal=ad.querySelector('.modal-card');if(modal.scrollWidth>modal.clientWidth+1)throw Error('Admin notification overflow at '+width);}
 aw.failAdminNotices();
 if(!ad.getElementById('drawer-feedback-admin').classList.contains('has-unread')||!ad.querySelector('.feedback-status').textContent.includes('unavailable'))throw Error('Admin listener failure erased known notices or lacked an error');
 [...ad.querySelectorAll('.feedback-action')].find(b=>b.textContent==='Refresh').click();
 await until(()=>!ad.querySelector('.feedback-status').textContent.includes('unavailable'),'admin listener retry');
 const acknowledged=JSON.parse(localStorage.getItem('feedback-browser-fixture')).map(item=>({...item,adminUnread:false}));
 localStorage.setItem('feedback-browser-fixture',JSON.stringify(acknowledged));
 await until(()=>!ad.getElementById('drawer-feedback-admin').classList.contains('has-unread'),'shared admin acknowledgements');
 if(!ad.getElementById('menu-btn').classList.contains('has-unread')||!ad.getElementById('drawer-feedback-mine').classList.contains('has-unread'))throw Error('Clearing admin submissions erased other notification branches');
 close(ad);
 // Backgrounding stops only active subscriptions; returning reconnects and finds new notes.
 const stopped=aw.adminUnsubscribes;
 Object.defineProperty(ad,'hidden',{configurable:true,value:true});ad.dispatchEvent(new aw.Event('visibilitychange'));
 if(aw.adminUnsubscribes<=stopped)throw Error('Background admin listener was not stopped');
 const wake={id:'wake-note',uid:'player-a',text:'While backgrounded',at:30000,adminUnread:true,resolved:false,unread:false,replyVersion:0};
 localStorage.setItem('feedback-browser-fixture',JSON.stringify([...acknowledged,wake]));await sleep(50);
 if(aw.testNoticeHub.state('feedback-admin').unread)throw Error('Stopped listener processed background data');
 Object.defineProperty(ad,'hidden',{configurable:true,value:false});ad.dispatchEvent(new aw.Event('visibilitychange'));
 await until(()=>aw.testNoticeHub.state('feedback-admin').count===1,'foreground reconnect');
 ad.querySelector('#lang-toggle [data-lang="zh"]').click();
 if(!ad.getElementById('drawer-feedback-admin').getAttribute('aria-label').includes('新投稿'))throw Error('Admin notification locale did not update');
 ad.querySelector('#lang-toggle [data-lang="en"]').click();
 // Two admins share the queue: viewing one note clears both admin entry dots.
 const peer=frame('admin-peer',true);peer.scrollIntoView();
 await until(()=>peer.contentWindow.testNoticeHub?.state('feedback-admin').count===1,'second admin notification');
 peer.contentDocument.getElementById('drawer-feedback-admin').click();
 await until(()=>!aw.testNoticeHub.state('feedback-admin').unread&&!peer.contentWindow.testNoticeHub.state('feedback-admin').unread,'shared admin view');
 close(peer.contentDocument);peer.remove();admin.scrollIntoView();
 // Closing before dwell expiry must cancel the pending acknowledgement.
 localStorage.setItem('feedback-browser-fixture',JSON.stringify([...acknowledged,{...wake,id:'closed-note'}]));
 await until(()=>aw.testNoticeHub.state('feedback-admin').count===1,'new note before close');
 ad.getElementById('drawer-feedback-admin').click();await until(()=>ad.querySelector('[data-feedback-id="closed-note"]'),'close cancellation card');close(ad);await sleep(650);
 if(aw.calls.some(call=>call[0]==='adminRead'&&call[1]==='closed-note')||aw.activeReadObservers!==0)throw Error('Closed modal retained its observer or acknowledged a note');
 // Failed writes retain the dot and may be retried on another visit.
 aw.failAdminAck=true;ad.getElementById('drawer-feedback-admin').click();
 await until(()=>ad.querySelector('.feedback-status')?.textContent.includes('Could not'),'failed admin acknowledgement');
 if(!aw.testNoticeHub.state('feedback-admin').unread)throw Error('Failed admin write cleared the notification');
 close(ad);aw.failAdminAck=false;aw.deferAdminAck=true;ad.getElementById('drawer-feedback-admin').click();
 await until(()=>aw.finishAdminAck,'deferred admin acknowledgement');
 aw.setTestUser({uid:'player-b',anon:false});aw.finishAdminAck();aw.replayAdminNotices();await sleep(60);
 if(ad.querySelector('.feedback-inbox')||!ad.getElementById('drawer-feedback-admin').hidden||aw.testNoticeHub.state('feedback-admin').unread||aw.testNoticeHub.state('menu').unread)throw Error('Account switch retained admin data or accepted stale callbacks');
 d.querySelector('#lang-toggle [data-lang="zh"]').click();
 if(d.getElementById('drawer-feedback-mine').textContent!=='我的意見') throw Error('Inbox locale did not update');
 a.remove(); admin.remove();
 document.getElementById('result').textContent='PASS: private feedback UI, collapsed admin editors, preserved drafts, structured metadata, admin shared notifications and viewport acknowledgement, bounded queue, listener/write failures, background lifecycle, nested independent dots, replies, account isolation, bilingual labels and mobile layout.';
})().catch(error=>{document.getElementById('result').textContent='FAIL: '+error.stack;});
</script>`;
module.exports = { accountStub, runner };
