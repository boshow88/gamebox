/* End-to-end manual birthday fixtures. All accounts and profile writes are local fakes. */
'use strict';
const accountStub = `
const query = new URLSearchParams(location.search), callbacks = [];
if (query.has('testAccount')) sessionStorage.setItem('birthday-test-user', query.get('testAccount'));
const uid = sessionStorage.getItem('birthday-test-user') || 'settings-browser';
let user = { uid, anon: query.has('anonymous'), name: 'Alex <b>Player</b>', photo: null };
const key = id => 'birthday-settings-fixture:' + id;
function profile(id) { return JSON.parse(localStorage.getItem(key(id)) || JSON.stringify({ birthday: { month: 11, day: 4 }, birthdayEnabled: false, birthdayUpdatedAt: 1234567, recordsMigratedAt: Date.now() })); }
window.profileReads = 0; window.profileWrites = 0; window.signInCalls = 0;
window.getFixtureProfile = () => profile(user ? user.uid : uid);
window.setTestUser = next => { user = next; callbacks.forEach(fn => fn(user)); };
window.ArcadeNet = { ok: true, currentUser: () => user, onAuth: fn => { callbacks.push(fn); queueMicrotask(() => fn(user)); },
 field: { delete: () => null }, profile: {
  get: async id => { window.profileReads++; return profile(id); },
  save: async (_id, data) => { if ('birthday' in data) throw Error('Score sync overwrote birthday'); },
  saveFields: (id, data) => {
   if (Object.keys(data).join(',') !== 'birthday') throw Error('Birthday saves must not write or clean up extra metadata');
   if (window.failSave) return Promise.reject(Error('Simulated write failure'));
   const save = () => { window.profileWrites++; localStorage.setItem(key(id), JSON.stringify(Object.assign(profile(id), data))); };
   if (window.deferSave) return new Promise(resolve => { window.finishSave = () => { save(); resolve(); }; });
   save(); return Promise.resolve();
  },
 },
 signInGoogle: async () => { window.signInCalls++; window.setTestUser({ uid, anon: false, name: 'Alex', photo: null }); }, signOut: async () => window.setTestUser(null),
 isAdmin: async () => false, feedback: async () => { throw Error('Unexpected feedback'); },
};
window.dispatchEvent(new CustomEvent('arcade-net-ready'));
`;
const runner = `<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre><script>
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), errors = [];
addEventListener('message', event => { if (event.data && event.data.birthdayError) errors.push(event.data.birthdayError); });
async function until(check, label) { for (let i = 0; i < 1600; i++) { if (errors.length) throw Error(errors.join('; ')); if (check()) return; await sleep(10); } throw Error('Timed out: ' + label); }
function frame(uid, path = '/index.html') { const f = document.createElement('iframe'); f.width = '390'; f.height = '844'; f.src = path + (path.includes('?') ? '&' : '?') + 'testAccount=' + uid; document.body.append(f); return f; }
function set(input, value, win) { input.value = String(value); input.dispatchEvent(new win.Event('change', { bubbles: true })); }
(async () => {
 const uid = 'settings-a', f = frame(uid); let doc;
 await until(() => f.contentWindow.profileReads === 1, 'initial profile'); doc = f.contentDocument;
 doc.getElementById('drawer-personalization').click();
 await until(() => doc.getElementById('birthday-month'), 'manual settings without extra query');
 const win = f.contentWindow;
 if (win.profileReads !== 1 || win.signInCalls || win.profileWrites) throw Error('Opening settings must not prompt, read again or write');
 if (doc.querySelector('#birthday-google, #birthday-practice, #birthday-enabled') || doc.querySelector('.personalization-settings a') || /candle|吹蠟燭/i.test(doc.querySelector('.personalization-settings').textContent)) throw Error('Settings must not expose candle proceedings, birthday authorization or an extra enable checkbox');
 function luminance(color) { const rgb = color.match(/[0-9.]+/g).map(Number); if (rgb.length > 3 && rgb[3] !== 1) throw Error('Date controls need an opaque background'); return rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0); }
 for (const input of doc.querySelectorAll('.personalization-date select, .personalization-date option')) {
  const style = win.getComputedStyle(input), a = luminance(style.color), b = luminance(style.backgroundColor);
  if ((Math.max(a, b) + .05) / (Math.min(a, b) + .05) < 4.5) throw Error('Date control text lacks readable contrast');
  if (input.tagName === 'SELECT' && !style.colorScheme.includes('dark')) throw Error('Native date popup must use dark controls');
 }
 for (const width of [320, 390, 768]) { f.style.width = width + 'px'; const card = doc.querySelector('.modal-card'); if (card.scrollWidth > card.clientWidth + 1) throw Error('Settings overflow at ' + width); }
 doc.querySelector('#lang-toggle [data-lang="zh"]').click();
 if (!doc.querySelector('.modal-title').textContent.includes('個人化')) throw Error('Settings did not follow Chinese locale');
 doc.querySelector('#lang-toggle [data-lang="en"]').click();
 set(doc.getElementById('birthday-month'), 2, win); set(doc.getElementById('birthday-day'), 29, win);
 doc.getElementById('birthday-manual-form').requestSubmit();
 await until(() => win.profileWrites === 1 && !doc.getElementById('birthday-save').matches(':disabled'), 'manual date');
 if (win.getFixtureProfile().birthday.day !== 29 || 'year' in win.getFixtureProfile().birthday || win.profileReads !== 1) throw Error('Saving month/day must not add fields or reads');
 if (win.getFixtureProfile().birthdayEnabled !== false || win.getFixtureProfile().birthdayUpdatedAt !== 1234567) throw Error('Existing obsolete fields must stay untouched');
 win.failSave = true;
 set(doc.getElementById('birthday-month'), 5, win); set(doc.getElementById('birthday-day'), 6, win); doc.getElementById('birthday-manual-form').requestSubmit();
 await until(() => !doc.getElementById('birthday-save').matches(':disabled'), 'failed save');
 if (win.getFixtureProfile().birthday.month !== 2 || win.profileWrites !== 1) throw Error('Failed save changed the profile');
 win.failSave = false;
 doc.getElementById('birthday-remove').click(); doc.getElementById('birthday-remove').click();
 await until(() => win.profileWrites === 2 && !doc.getElementById('birthday-remove'), 'delete birthday');
 if (win.getFixtureProfile().birthday !== null || win.profileReads !== 1) throw Error('Deletion failed or added reads');
 if (win.getFixtureProfile().birthdayEnabled !== false || win.getFixtureProfile().birthdayUpdatedAt !== 1234567) throw Error('Deleting the birthday must leave unrelated fields untouched');
 set(doc.getElementById('birthday-month'), 1, win); set(doc.getElementById('birthday-day'), 2, win);
 win.deferSave = true; doc.getElementById('birthday-manual-form').requestSubmit();
 win.setTestUser({ uid: 'settings-b', anon: false, name: 'B', photo: null });
 win.finishSave(); await sleep(50);
 if (win.getFixtureProfile().birthday.month !== 11 || Number(doc.getElementById('birthday-month').value) !== 11) throw Error('Late save replaced the new account settings');
 f.remove();

 // Saving today's date waits for the settings dialog to close before navigating.
 const auto = frame('settings-auto'); await until(() => auto.contentWindow.profileReads === 1, 'auto profile');
 auto.contentDocument.getElementById('drawer-personalization').click();
 await until(() => auto.contentDocument.getElementById('birthday-month'), 'auto settings');
 set(auto.contentDocument.getElementById('birthday-month'), 11, auto.contentWindow); set(auto.contentDocument.getElementById('birthday-day'), 3, auto.contentWindow);
 auto.contentDocument.getElementById('birthday-manual-form').requestSubmit();
 await until(() => auto.contentWindow.profileWrites === 1, 'save today'); await sleep(400);
 if (auto.contentWindow.location.pathname !== '/index.html' || auto.contentDocument.getElementById('birthday-entry').hidden) throw Error('Birthday entry missing or navigation interrupted settings');
 auto.contentDocument.querySelector('.modal-head button').click();
 await until(() => auto.contentWindow.location.pathname === '/games/birthday.html', 'automatic navigation after close'); auto.remove();

 // Former practice links cannot bypass missing/invalid dates or sign-in checks.
 for (const [id, data, anonymous] of [
  ['missing-date', { birthday: null }, false], ['invalid-date', { birthday: { month: 11, day: 33 } }, false],
  ['year-string', { birthday: '2000-11-03' }, false], ['year-map', { birthday: { year: 2000, month: 11, day: 3 } }, false],
  ['other-day', { birthday: { month: 11, day: 4 } }, false], ['guest', { birthday: { month: 11, day: 3 } }, true],
 ]) {
  localStorage.setItem('birthday-settings-fixture:' + id, JSON.stringify(Object.assign({ recordsMigratedAt: Date.now() }, data)));
  const page = frame(id, '/games/birthday.html?mode=practice' + (anonymous ? '&anonymous=1' : ''));
  await until(() => page.contentWindow.ArcadeNet && (anonymous || page.contentWindow.profileReads === 1), id + ' profile'); await sleep(60);
  const d = page.contentDocument;
  if (d.getElementById('birthday-gate').hidden || !d.getElementById('birthday-notice').hidden || d.querySelector('.birthday-cake-stage')) throw Error('Birthday-only access was bypassed for ' + id);
  page.remove();
 }
 document.getElementById('result').textContent = 'PASS: optional month/day settings without a checkbox, no exposed ceremony entry, deletion, write failure, no extra reads, account isolation, deferred auto-entry and birthday-only URL eligibility.';
})().catch(error => { document.getElementById('result').textContent = 'FAIL: ' + error.stack; });
</script>`;
module.exports = { accountStub, runner };
