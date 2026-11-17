// Real homepage + temporary test module; fake accounts only, no Firebase traffic.
// node tools/auth-ab-browser-check.js /usr/bin/google-chrome
'use strict';
const fixtures = require('./helpers/birthday-browser-fixtures.js');
fixtures.fixedClock = `<script>Object.defineProperty(navigator, 'standalone', {value:true});</script>`;
fixtures.accountStub = `
import { authABTest } from './auth-ab-test.mjs';
const callbacks = new Set();
let user = JSON.parse(sessionStorage.getItem('auth-ab-fixture-user') || 'null');
const publish = value => { user = value; sessionStorage.setItem('auth-ab-fixture-user', JSON.stringify(user)); callbacks.forEach(fn => fn(user)); };
const account = window.ArcadeAuth = window.ArcadeNet = {
 ok:true, currentUser:() => user, authState:() => 'ready',
 onAuth(fn) { callbacks.add(fn); fn(user); return () => callbacks.delete(fn); },
 isAdmin:async () => false, signOut:async () => publish(null),
 signInGoogle() { return authABTest.signIn(() => {
  const outcome = sessionStorage.getItem('auth-ab-fixture-outcome');
  if (outcome === 'pending') return new Promise(() => {});
  if (outcome === 'error') return Promise.reject(Object.assign(Error('PRIVATE MESSAGE'), {code:'auth/popup-closed-by-user'}));
  publish({uid:'PRIVATE-UID',name:'PRIVATE-NAME',email:'private@example.test',anon:false});
  return Promise.resolve({user});
 }); },
 field:{delete:() => null}, profile:{get:async () => ({recordsMigratedAt:1}),save:async () => {}},
};
authABTest.connect(account);
window.authABMode = authABTest.mode;
window.dispatchEvent(new CustomEvent('arcade-auth-ready'));
window.dispatchEvent(new CustomEvent('arcade-net-ready'));
`;
fixtures.runner = `<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre><script>
const key = 'gamebox:auth-ab-test:v1';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (ok, text) => { if (!ok) throw Error(text); };
async function until(test, label) { for (let i = 0; i < 1800; i++) { if (test()) return; await sleep(10); } throw Error('Timeout: ' + label); }
(async () => {
 localStorage.removeItem(key); localStorage.setItem('auth-ab-unrelated', 'keep');
 const f = document.createElement('iframe'); f.style.width = '320px'; f.style.height = '850px'; f.src = '/index.html'; document.body.append(f);
 const w = () => f.contentWindow, d = () => f.contentDocument;
 const panel = () => d().getElementById('auth-ab-test');
 const output = () => d().getElementById('auth-ab-output').textContent;
 const choose = mode => panel().querySelector('[data-auth-ab-mode="' + mode + '"]').click();
 async function loadPage(action, mode) {
  const previous = d(); action();
  await until(() => d() !== previous && panel() && w().authABMode === mode && d().querySelector('#account button'), 'reloaded mode ' + mode);
 }
 await until(() => panel() && d().querySelector('#account button'), 'homepage test panel');
 check(!localStorage.getItem(key) && output().includes('測試未啟用'), 'Default must be A without writing diagnostic storage');
 check(output().includes('主畫面 Web App'), 'Standalone indicator');
 d().getElementById('menu-btn').click(); panel().open = true;
 check(d().documentElement.scrollWidth <= w().innerWidth + 1, 'Panel must fit 320px');
 await loadPage(() => choose('A'), 'A');
 d().querySelector('#account button').click();
 await until(() => output().includes('google-login-resolved'), 'successful login');
 check(output().includes('Google 已登入'), 'Signed-in status');
 const log = localStorage.getItem(key);
 check(!/PRIVATE|private@example/.test(log), 'Logs must exclude account information');
 await loadPage(() => w().location.reload(), 'A');
 check(output().includes('Google 已登入'), 'session restoration');
 d().querySelector('#account button').click(); await until(() => output().includes('狀態：未登入'), 'explicit sign-out');
 await loadPage(() => choose('B'), 'B');
 sessionStorage.setItem('auth-ab-fixture-outcome', 'error'); d().querySelector('#account button').click();
 await until(() => output().includes('google-login-rejected:auth/popup-closed-by-user'), 'error code');
 check(!d().querySelector('#account button').disabled && !localStorage.getItem(key).includes('PRIVATE MESSAGE'), 'Error remains retryable without storing message');
 sessionStorage.setItem('auth-ab-fixture-outcome', 'pending'); d().querySelector('#account button').click(); await sleep(100);
 check(d().querySelector('#account button').disabled && output().includes('google-login-start'), 'Pending flow must stay observable without masking the bug');
 await loadPage(() => w().location.reload(), 'B');
 check(!d().querySelector('#account button').disabled, 'Reload recovers original disabled button');
 const originalSet = w().Storage.prototype.setItem;
 w().Storage.prototype.setItem = function() { throw Error('storage denied'); };
 choose('A'); await sleep(100);
 check(w().authABMode === 'B' && panel().textContent.includes('尚未切換模式'), 'Storage failure must not claim a mode change');
 w().Storage.prototype.setItem = originalSet;
 await loadPage(() => choose('off'), 'A');
 check(output().includes('測試未啟用'), 'finish and return to A');
 check(w().authABMode === 'A' && !localStorage.getItem(key), 'Finish removes the sole test key');
 check(localStorage.getItem('auth-ab-unrelated') === 'keep', 'Other site data must survive');
 document.getElementById('result').textContent = 'PASS: real homepage, default A, A/B reload and persistence, standalone indicator, 320px panel, account restoration, private diagnostics, rejection/pending/reload, storage failure and clean exit';
})().catch(error => { document.getElementById('result').textContent = 'FAIL: ' + error.stack; });
</script>`;
require('./birthday-browser-check.js');
