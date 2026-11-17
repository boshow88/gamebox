// Real homepage login controls with fake Auth; no Google/Firebase traffic.
// node tools/auth-login-browser-check.js /usr/bin/google-chrome
'use strict';
const fixtures = require('./helpers/birthday-browser-fixtures.js');
fixtures.fixedClock = '';
fixtures.accountStub = `
const callbacks = new Set(), timers = window.loginTimers = new Map();
const nativeTimeout = window.setTimeout, nativeClear = window.clearTimeout;
window.setTimeout = (fn, ms, ...args) => {
 const id = nativeTimeout(() => { timers.delete(id); fn(...args); }, ms);
 if (ms === 60000) timers.set(id, fn);
 return id;
};
window.clearTimeout = id => { timers.delete(id); nativeClear(id); };
window.expireLogin = () => { const [id, fn] = timers.entries().next().value; window.clearTimeout(id); fn(); };
window.loginVisibility = 'visible';
Object.defineProperty(document, 'visibilityState', {get:() => window.loginVisibility});
window.loginRequests = [];
let user = null;
window.setLoginUser = next => { user = next; callbacks.forEach(fn => fn(user)); };
const account = window.ArcadeAuth = window.ArcadeNet = {
 ok:true, currentUser:() => user, authState:() => 'ready',
 onAuth(fn) { callbacks.add(fn); fn(user); return () => callbacks.delete(fn); },
 signOut:async () => window.setLoginUser(null), isAdmin:async () => false,
 signInGoogle() {
  if (window.throwLogin) throw Error('SDK synchronous failure');
  return new Promise((resolve, reject) => window.loginRequests.push({resolve,reject}));
 },
 field:{delete:() => null}, profile:{get:async () => ({recordsMigratedAt:1}),save:async () => {}},
};
window.dispatchEvent(new CustomEvent('arcade-auth-ready'));
window.dispatchEvent(new CustomEvent('arcade-net-ready'));
`;
fixtures.runner = `<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre><script>
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (ok, message) => { if (!ok) throw Error(message); };
async function until(test, label) { for (let i = 0; i < 1800; i++) { if (test()) return; await sleep(10); } throw Error('Timeout: ' + label); }
(async () => {
 localStorage.setItem('gamebox:lang', JSON.stringify('en'));
 const f = document.createElement('iframe'); f.style.width = '320px'; f.style.height = '850px'; f.src = '/index.html'; document.body.append(f);
 const w = () => f.contentWindow, d = () => f.contentDocument;
 const button = () => d().querySelector('#account button');
 const message = () => d().querySelector('#account [role="status"]')?.textContent || '';
 await until(() => button(), 'homepage ready');
 check(!d().getElementById('auth-ab-test'), 'Temporary test panel must be removed');
 d().getElementById('menu-btn').click();
 button().click(); check(w().loginRequests.length === 1 && button().disabled, 'SDK must start synchronously on click');
 d().querySelector('[data-lang="zh"]').click();
 check(button().disabled && button().textContent === '登入中…', 'Locale redraw must preserve pending state');
 w().loginRequests[0].reject({code:'auth/popup-blocked'});
 await until(() => !button().disabled, 'blocked popup retry');
 check(message().includes('阻擋') && w().loginTimers.size === 0, 'Explain blocked popup and clear timer');
 button().click(); w().loginRequests[1].reject({code:'auth/popup-closed-by-user'});
 await until(() => message().includes('取消'), 'cancellation feedback');
 check(!button().disabled && w().loginTimers.size === 0, 'Cancellation stays retryable');
 w().throwLogin = true; button().click(); w().throwLogin = false;
 check(!button().disabled && message().includes('未能完成') && w().loginTimers.size === 0, 'Synchronous SDK errors recover');
 button().click(); const older = w().loginRequests.at(-1);
 check(w().loginTimers.size === 1, 'One foreground timer');
 w().loginVisibility = 'hidden'; d().dispatchEvent(new (w().Event)('visibilitychange'));
 check(button().disabled && w().loginTimers.size === 0, 'Account selection/MFA in background must not expire');
 w().loginVisibility = 'visible'; d().dispatchEvent(new (w().Event)('visibilitychange'));
 check(w().loginTimers.size === 1, 'Give the callback a full foreground minute on return');
 w().expireLogin();
 check(!button().disabled && message().includes('尚未收到') && d().querySelectorAll('#account button').length === 2, 'Pending login offers retry and reload without asserting failure');
 check(w().ArcadeAuth.currentUser() === null, 'Timeout must not fabricate authentication');
 check(d().documentElement.scrollWidth <= w().innerWidth + 1, 'Feedback fits a 320px screen');
 button().click(); const latest = w().loginRequests.at(-1);
 older.reject({code:'auth/network-request-failed'}); await sleep(20);
 check(button().disabled && !message() && w().loginTimers.size === 1, 'Old request must not unlock or overwrite the retry');
 w().setLoginUser({uid:'google-a',name:'Player',anon:false});
 check(button().textContent === '登出' && !message() && w().loginTimers.size === 0, 'Auth observer settles UI even before popup promise');
 latest.reject({code:'auth/network-request-failed'}); await sleep(20);
 check(button().textContent === '登出' && !message(), 'Late popup error must not replace authenticated UI');
 button().click(); await until(() => button().textContent === '登入', 'logout');
 button().click(); w().expireLogin();
 w().setLoginUser({uid:'google-late',name:'Late login',anon:false});
 check(button().textContent === '登出' && !message(), 'Late real authentication after timeout still succeeds');
 button().click(); await until(() => button().textContent === '登入', 'second logout');
 button().click(); w().expireLogin();
 const previous = d(); [...d().querySelectorAll('#account button')].find(b => b.textContent === '重新整理頁面').click();
 await until(() => d() !== previous && button(), 'reload action');
 check(!button().disabled && !message(), 'Reload clears stuck UI');
 button().click(); w().loginRequests.at(-1).resolve();
 await until(() => !button().disabled, 'resolved request clears busy state');
 check(w().loginTimers.size === 0, 'Resolved request clears timer');
 document.getElementById('result').textContent = 'PASS: synchronous popup activation, locale redraw, blocked/cancelled/thrown errors, background/MFA wait, foreground timeout, retry/reload, stale results, observer-first and late authentication, 320px layout';
})().catch(error => { document.getElementById('result').textContent = 'FAIL: ' + error.stack; });
</script>`;
require('./birthday-browser-check.js');
