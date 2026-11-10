// Real launcher UI regression checks with delayed Auth/Firestore/admin fixtures.
// No real accounts or Firebase reads/writes. Pass a Chrome executable as argv[2].
'use strict';
const fixtures = require('./helpers/birthday-browser-fixtures.js');
fixtures.fixedClock = '';
// Keep gate coverage even when every shipped game has been released.
fixtures.transformSource = (file, body) => file.endsWith(require('node:path').join('js', 'launcher.js'))
    ? body.toString().replace("id: 'unshackle',", "id: 'unshackle', wip: true,") : body;
fixtures.accountStub = `
let user;
const callbacks = new Set();
const nativeTimeout = window.setTimeout;
window.setTimeout = (fn, ms, ...args) => {
 if (ms === 12000) window.expireAccess = fn;
 return nativeTimeout(fn, ms, ...args);
};
window.audit = []; window.adminRequests = [];
const record = event => audit.push({ event, ms: Math.round(performance.now()) });
window.setTestUser = next => { user = next; record('auth-restored'); callbacks.forEach(fn => fn(user)); };
const account = window.ArcadeAuth = {
 ok: true, currentUser: () => user || null, authState: () => user === undefined ? 'loading' : 'ready',
 onAuth: fn => { callbacks.add(fn); if (user !== undefined) fn(user); return () => callbacks.delete(fn); },
 signInGoogle: async () => {}, signOut: async () => window.setTestUser(null),
};
window.dispatchEvent(new CustomEvent('arcade-auth-ready'));
setTimeout(() => window.setTestUser({uid: 'admin-a', email: 'admin@example.test', name: 'Test Admin', anon: false}), 2200);
setTimeout(() => {
 window.ArcadeNet = { ...account,
  isAdmin: () => new Promise((resolve, reject) => { record('admin-query'); adminRequests.push({uid:user.uid,resolve,reject}); }),
  profile: { get: async () => ({recordsMigratedAt: Date.now()}), save: async () => {} }, field: {delete: () => null},
 };
 record('net-ready'); window.dispatchEvent(new CustomEvent('arcade-net-ready'));
}, 2800);
`;
fixtures.runner = `<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre><script>
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function check(ok, message) { if (!ok) throw Error(message); }
async function until(test, label) { for (let i = 0; i < 1800; i++) { if (test()) return; await sleep(10); } throw Error('Timeout: ' + label); }
(async () => {
 const f = document.createElement('iframe'); f.src = '/index.html'; document.body.append(f);
 await until(() => f.contentWindow.ArcadeAuth && f.contentDocument.querySelector('.badge-wip'), 'launcher');
 const w = f.contentWindow, d = f.contentDocument;
 const wip = () => d.querySelector('.badge-wip').closest('a');
 const roster = () => !d.getElementById('drawer-admins').hidden;
 const change = uid => w.setTestUser({uid, name:uid, email:uid+'@example.test', anon:false});
 const close = () => d.querySelector('.modal-head button').click();
 d.getElementById('menu-btn').click();
 check(!d.querySelector('#account button'), 'Unknown auth must not offer sign-in');
 check(d.getElementById('account').textContent.includes('Restoring'), 'Unknown auth needs a status');
 d.getElementById('drawer-personalization').click();
 check(!d.querySelector('.personalization-button.primary'), 'Personalization must not offer sign-in while identity is unknown'); close();
 wip().click(); check(d.querySelector('[data-access-check]'), 'Early click should wait instead of denying'); close();
 await until(() => w.ArcadeAuth.currentUser(), 'auth');
 check(!w.ArcadeNet, 'Firestore should still be pending when identity renders');
 check(d.getElementById('account').textContent.includes('Test Admin'), 'Identity must render before Firestore');
 d.getElementById('drawer-personalization').click();
 check(!d.querySelector('.personalization-button.primary'), 'Restored account settings must wait for profile rather than ask to sign in'); close();
 check(!d.querySelector('.wip-gate'), 'Canceled intent must stay closed');
 await until(() => w.adminRequests.length === 1, 'single permission query');
 d.querySelector('[data-lang="zh"]').click();
 d.querySelector('[data-lang="en"]').click();
 check(w.adminRequests.length === 1, 'Locale redraw must not duplicate lookup');
 wip().click(); check(d.querySelector('[data-access-check]'), 'Signed-in pending admin should wait'); close();
 await sleep(1500);
 w.adminRequests[0].resolve(true);
 await until(roster, 'admin verified');
 d.querySelector('[data-lang="zh"]').click();
 check(roster(), 'Verified admin menu must survive locale redraw');
 d.querySelector('[data-lang="en"]').click();
 check(w.adminRequests.length === 1, 'Verified locale redraw must not refetch');
 const click = new w.MouseEvent('click', {bubbles:true,cancelable:true});
 wip().addEventListener('click', e => e.preventDefault(), {once:true}); wip().dispatchEvent(click);
 check(!d.querySelector('.wip-gate'), 'Verified admin must enter without gate');

 // Ignore old results even if the account changes from A to B and back to A.
 change('admin-b'); change('admin-a');
 check(!roster(), 'Changing account must immediately revoke previous UI permissions');
 w.adminRequests[1].resolve(true); await sleep(30);
 check(!roster(), 'Stale B membership must not unlock A');
 w.adminRequests[2].resolve(false); await sleep(30);
 check(!roster(), 'Confirmed non-admin should stay locked');
 wip().click();
 check(d.querySelector('.wip-gate') && !d.querySelector('[data-access-check]'), 'Only confirmed non-admin gets ordinary WIP gate');
 d.querySelector('.wip-gate .stay').click();

 // A transient server failure stays an error, offers retry, and never becomes denial.
 change('admin-retry');
 w.adminRequests[3].reject(Error('offline')); await sleep(30);
 wip().click();
 let modal = d.querySelector('[data-access-check]');
 check(modal && modal.textContent.includes('Unable to verify'), 'Lookup failure must have explicit retry state');
 modal.querySelector('.modal-body button').click();
 check(w.adminRequests.length === 5, 'Retry must start a new lookup');
 close();
 w.adminRequests[4].resolve(true); await until(roster, 'retry recovered');

 // Pending clicks must not continue under a different account.
 change('admin-other'); wip().click(); change('admin-last');
 check(!d.querySelector('[data-access-check]'), 'Identity change must cancel the previous click');
 w.adminRequests[5].resolve(true); await sleep(30);
 check(!roster(), 'Old result must stay ignored');
 w.adminRequests[6].resolve(true); await until(roster, 'latest account');
 await w.ArcadeAuth.signOut();
 check(!roster() && d.querySelector('#account button').textContent === 'Sign in', 'Confirmed logout must render sign-in and clear admin access');

 // Keep the original click and continue automatically exactly once after approval.
 change('admin-enter');
 wip().setAttribute('href', '/favicon.svg?authorized=1'); wip().click();
 check(d.querySelector('[data-access-check]'), 'Queued entry should show checking');
 const measurements = JSON.stringify(w.audit);
 w.expireAccess();
 check(d.querySelector('[data-access-check]').textContent.includes('Unable to verify'), 'Long waits must stop and offer retry');
 w.adminRequests[7].resolve(true); await sleep(30);
 check(f.contentWindow.location.pathname === '/index.html', 'Late approval must not navigate after timeout');
 d.querySelector('[data-access-check] .modal-body button').click();
 await until(() => f.contentWindow.location.pathname === '/favicon.svg', 'automatic authorized continuation');
 check(f.contentWindow.location.search === '?authorized=1', 'Continue the original href');
 document.getElementById('result').textContent = 'PASS: early identity, pending/canceled/automatic entry, single lookup, stable menu, account switches, timeout/retry and logout; ' + measurements;
})().catch(error => { document.getElementById('result').textContent = 'FAIL: ' + error.stack; });
</script>`;
require('./birthday-browser-check.js');
