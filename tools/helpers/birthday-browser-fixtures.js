/* Local account fixtures and end-to-end birthday game scenarios. Never uses Firebase. */
'use strict';
const accountStub = `
const query = new URLSearchParams(location.search), callbacks = [];
if (query.has('testAccount')) sessionStorage.setItem('birthday-test-user', query.get('testAccount'));
const uid = sessionStorage.getItem('birthday-test-user') || 'birthday-browser';
if (query.has('birthday')) sessionStorage.setItem('birthday-test-dob:' + uid, query.get('birthday'));
if (query.has('anonymous')) sessionStorage.setItem('birthday-test-anon:' + uid, '1');
let user = { uid, name: uid === 'screenshot' ? 'Alex Chen' : 'Alex <b>Player</b>', anon: sessionStorage.getItem('birthday-test-anon:' + uid) === '1', photo: null };
if (query.has('suppressAuto')) localStorage.setItem('gamebox:birthday:entered:' + uid + ':2026-11-03', '1');
if (query.has('locale')) localStorage.setItem('gamebox:lang', JSON.stringify(query.get('locale')));
window.profileReads = 0; window.feedbackWrites = 0;
window.setTestUser = next => { user = next; callbacks.forEach(fn => fn(user)); };
window.ArcadeNet = { ok: true, currentUser: () => user, onAuth: fn => { callbacks.push(fn); queueMicrotask(() => fn(user)); },
    field: { delete: () => null }, profile: {
        get: async id => { window.profileReads++; const saved = sessionStorage.getItem('birthday-test-dob:' + id); return { birthday: saved ? JSON.parse(saved) : { month: 11, day: 3 }, recordsMigratedAt: Date.now() }; },
        save: async (_id, data) => { if ('birthday' in data) throw new Error('Birthday overwritten'); },
    }, isOwner: async () => false, signOut: async () => window.setTestUser(null), signInGoogle: async () => {},
    feedback: async () => { window.feedbackWrites++; throw new Error('Birthday must not submit feedback'); },
};
window.dispatchEvent(new CustomEvent('arcade-net-ready'));
`;
const fixedClock = `<script>
const RealDate = Date;
const requestedLocale = new URLSearchParams(location.search).get('locale');
if (requestedLocale) localStorage.setItem('gamebox:lang', JSON.stringify(requestedLocale));
window.birthdayTestDate = [2026, 10, 3, 12];
const rolloverClock = new URLSearchParams(location.search).has('rollover'), clockStart = performance.now();
function birthdayNow() { return rolloverClock ? new RealDate(2026, 10, 3, 23, 59, 58, 500).getTime() + performance.now() - clockStart : new RealDate(...window.birthdayTestDate).getTime(); }
window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [birthdayNow()])); } static now() { return birthdayNow(); } };
addEventListener('error', e => parent.postMessage({ birthdayError: e.message }, location.origin));
addEventListener('unhandledrejection', e => parent.postMessage({ birthdayError: String(e.reason) }, location.origin));
</script>`;
const runner = `<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre><script>
const errors = [], sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
addEventListener('message', e => { if (e.data && e.data.birthdayError) errors.push(e.data.birthdayError); });
async function until(check, label) { for (let i = 0; i < 1800; i++) { if (errors.length) throw new Error(errors.join('; ')); if (check()) return; await sleep(10); } throw new Error('Timed out: ' + label); }
function frame(uid, path = '/index.html', extra = '') { const f = document.createElement('iframe'); f.width = '768'; f.height = '900'; f.src = path + '?testAccount=' + uid + extra; document.body.append(f); return f; }
function setDate(f, date) { f.contentWindow.birthdayTestDate = date; f.contentDocument.dispatchEvent(new f.contentWindow.Event('visibilitychange')); }
(async () => {
    const a = frame('birthday-a');
    await until(() => a.contentWindow.location.pathname === '/games/birthday.html' && a.contentDocument.getElementById('birthday-notice') && !a.contentDocument.getElementById('birthday-notice').hidden, 'first homepage visit automatically enters ceremony');
    let doc = a.contentDocument;
    if (a.contentWindow.profileReads !== 1) throw new Error('Ceremony must reuse one profile read per page');
    if (doc.getElementById('birthday-recipient').textContent !== 'Addressee: Alex <b>Player</b>' || doc.getElementById('birthday-recipient').querySelector('b')) throw new Error('Unsafe player name rendering');
    if (doc.querySelector('textarea, form, .birthday-wish-input')) throw new Error('Wish collection must be removed');
    for (const width of [320, 390, 768]) {
        a.style.width = width + 'px';
        if (doc.documentElement.scrollWidth > a.contentWindow.innerWidth + 1) throw new Error('Formal notice overflows at ' + width);
    }
    doc.querySelector('[data-lang="zh"]').click();
    if (!doc.querySelector('[data-copy="subject"]').textContent.includes('敬請查照')) throw new Error('Formal Chinese notice missing');
    if (doc.body.textContent.includes('吹燭') || doc.body.textContent.includes('爰依')) throw new Error('Birthday copy was not updated');
    if (!doc.getElementById('birthday-start').textContent.includes('吹蠟燭')) throw new Error('Candle action copy missing');
    doc.getElementById('birthday-start').click();
    await until(() => doc.querySelector('.birthday-cake-stage'), 'cake without wish submission');
    let stage = doc.querySelector('.birthday-cake-stage');
    function checkCakeGeometry() {
        let previousY = -Infinity;
        for (const group of stage.querySelectorAll('.birthday-candles > .birthday-candle')) {
            const body = group.querySelector('.birthday-candle-body'), offset = group.transform.baseVal.consolidate();
            const dx = offset ? offset.matrix.e : 0, dy = offset ? offset.matrix.f : 0;
            const baseY = Number(body.getAttribute('y')) + Number(body.getAttribute('height')) + dy;
            const left = Number(body.getAttribute('x')) + dx, right = left + Number(body.getAttribute('width'));
            for (const x of [left, right]) if (((x - 240) / 176) ** 2 + ((baseY - 223) / 47) ** 2 >= 1) throw new Error('Visible candle base left the cake surface');
            if (baseY < previousY - .001) throw new Error('Candles must draw back to front by their base height');
            previousY = baseY;
        }
    }
    checkCakeGeometry();
    if (a.contentWindow.feedbackWrites) throw new Error('Birthday submitted feedback');
    const isOut = candle => candle.classList.contains('is-out');
    const unlit = () => [...stage.querySelectorAll('.birthday-candle:not(.is-out)')];
    function modelPoint(candle) {
        const circle = candle.querySelector('.birthday-flame circle'), matrix = candle.transform.baseVal.consolidate();
        return { x: Number(circle.getAttribute('cx')) + (matrix ? matrix.matrix.e : 0), y: Number(circle.getAttribute('cy')) + (matrix ? matrix.matrix.f : 0) };
    }
    function pointEvent(type, point, pointerType = 'mouse', target = stage) {
        const svg = stage.querySelector('svg'), local = svg.createSVGPoint();
        local.x = point.x; local.y = point.y;
        const screen = local.matrixTransform(svg.getScreenCTM());
        target.dispatchEvent(new a.contentWindow.PointerEvent(type, { pointerId: 7, pointerType, button: 0, clientX: screen.x, clientY: screen.y, bubbles: true, cancelable: true }));
    }
    function pointer(type, candle, pointerType = 'touch') { pointEvent(type, modelPoint(candle), pointerType); }
    function key(type, value) { stage.dispatchEvent(new a.contentWindow.KeyboardEvent(type, { key: value, bubbles: true, cancelable: true })); }
    function windAngle() {
        const numbers = stage.querySelectorAll('.birthday-wind path')[1].getAttribute('d').match(/[-+]?\\d*\\.?\\d+(?:e[-+]?\\d+)?/g).map(Number);
        return Math.atan2(numbers[numbers.length - 2] - 240, 367 - numbers[numbers.length - 1]);
    }
    const blowing = () => stage.querySelector('.birthday-wind').classList.contains('is-blowing');
    if (stage.querySelector('button') || stage.tabIndex !== 0) throw new Error('Keyboard must focus the whole cake without per-candle targets');
    key('keydown', 'Enter'); await sleep(100); key('keyup', 'Enter');
    if (stage.querySelector('.birthday-wind').classList.contains('is-blowing')) throw new Error('Enter must not blow directly at a candle');
    key('keydown', 'ArrowRight'); await sleep(150); key('keyup', 'ArrowRight');
    if (a.contentWindow.getComputedStyle(stage).outlineStyle !== 'none') throw new Error('Keyboard input must not frame the entire cake');
    if (stage.querySelector('.birthday-wind').classList.contains('is-blowing') || stage.querySelector('.is-out')) throw new Error('Arrow steering alone must not extinguish candles');
    const mouseAim = { x: 310, y: 120 }, reclaimedAim = { x: 160, y: 120 };
    pointEvent('pointermove', mouseAim, 'mouse', a.contentWindow); key('keydown', ' ');
    const cursorAngle = Math.atan2(mouseAim.x - 240, 367 - mouseAim.y);
    if (!blowing() || Math.abs(windAngle() - cursorAngle) > .001) throw new Error('Space must blow toward an unpressed mouse position');
    key('keydown', 'ArrowRight'); await sleep(90);
    if (!blowing() || windAngle() < cursorAngle + .025) throw new Error('Arrow press must take direction while Space remains held');
    pointEvent('pointermove', reclaimedAim);
    const reclaimedAngle = Math.atan2(reclaimedAim.x - 240, 367 - reclaimedAim.y);
    stage.dispatchEvent(new a.contentWindow.KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true, bubbles: true, cancelable: true }));
    await sleep(90);
    if (!blowing() || Math.abs(windAngle() - reclaimedAngle) > .001) throw new Error('Mouse movement must retain control despite a held/repeating arrow');
    key('keyup', ' ');
    if (blowing()) throw new Error('Space release must stop wind after mouse reclaims direction');
    key('keyup', 'ArrowRight'); key('keydown', ' ');
    pointEvent('pointerdown', mouseAim); pointEvent('pointerup', mouseAim);
    if (!blowing()) throw new Error('Mouse release must not interrupt held Space');
    key('keyup', ' ');
    pointEvent('pointerdown', mouseAim); key('keydown', ' '); key('keyup', ' ');
    if (!blowing()) throw new Error('Space release must not interrupt held mouse');
    const pressedAngle = windAngle(); key('keydown', 'ArrowLeft'); await sleep(90);
    if (!blowing() || windAngle() > pressedAngle - .025) throw new Error('Arrow control must also work while the mouse button is held');
    pointEvent('pointermove', reclaimedAim); key('keyup', 'ArrowLeft'); pointEvent('pointerup', reclaimedAim);
    if (blowing()) throw new Error('Releasing both wind inputs must stop wind');
    key('keydown', ' '); a.contentWindow.dispatchEvent(new a.contentWindow.Event('blur'));
    if (blowing()) throw new Error('Focus loss must clear mixed input');
    key('keyup', ' ');
    const first = stage.querySelector('.birthday-candle[data-candle="0"]');
    const firstHome = modelPoint(first).x;
    pointer('pointerdown', first);
    await until(() => Math.abs(modelPoint(first).x - firstHome) > 2, 'candle sidesteps the breeze in every input/motion mode');
    await sleep(1100);
    if (isOut(first)) throw new Error('Unattended wind must not win the chase');
    async function chase(candle, type) {
        const started = performance.now();
        while (!isOut(candle) && performance.now() - started < 3500) { checkCakeGeometry(); pointer('pointermove', candle, type); await sleep(25); }
        if (!isOut(candle)) throw new Error('Following a candle should win within a few seconds');
        pointer('pointerup', candle, type);
    }
    await chase(first, 'touch');
    // Nearby candles can share a wind cone; the far side must remain unaffected.
    if (unlit().length === 5 || isOut(stage.querySelector('.birthday-candle[data-candle="4"]'))) throw new Error('Directional breeze affected the opposite side');
    const remainingAfterTouch = unlit().length;
    doc.querySelector('[data-lang="en"]').click();
    if (unlit().length !== remainingAfterTouch || !doc.querySelector('.birthday-candle-status').textContent.includes(String(remainingAfterTouch))) throw new Error('Language switching reset candle progress');
    const second = unlit()[0];
    pointer('pointerdown', second, 'mouse'); pointer('pointermove', second, 'mouse');
    await chase(second, 'mouse');
    const partial = unlit()[0]; pointer('pointerdown', partial, 'mouse');
    for (let i = 0; i < 10; i++) { pointer('pointermove', partial, 'mouse'); await sleep(25); }
    pointer('pointerup', partial, 'mouse');
    const partialFlame = partial.querySelector('.birthday-flame');
    const lowOpacity = parseFloat(partialFlame.style.opacity);
    if (!(lowOpacity < .9 && lowOpacity > 0)) throw new Error('Partial blowing must weaken the flame');
    await sleep(70);
    const earlyOpacity = parseFloat(partialFlame.style.opacity);
    if (!(earlyOpacity > lowOpacity && earlyOpacity < lowOpacity + .05)) throw new Error('Flame must recover immediately but slowly after a miss');
    await until(() => parseFloat(partialFlame.style.opacity) > earlyOpacity + .06, 'recovery accelerates without wind');
    if (a.contentWindow.GameBoxBirthday.hasCompleted('birthday-a')) throw new Error('Partial play must not mark completion');
    stage.focus(); key('keydown', ' ');
    let heldArrow = null;
    for (const candle of unlit()) {
        const started = performance.now();
        while (!isOut(candle) && performance.now() - started < 6000) {
            checkCakeGeometry();
            const point = modelPoint(candle), current = windAngle();
            const delta = Math.atan2(point.x - 240, 367 - point.y) - current;
            const next = delta > .025 ? 'ArrowRight' : delta < -.025 ? 'ArrowLeft' : null;
            if (next !== heldArrow) { if (heldArrow) key('keyup', heldArrow); if (next) key('keydown', next); heldArrow = next; }
            await sleep(25);
        }
        if (!isOut(candle)) throw new Error('Keyboard steering must be able to pursue moving candles');
    }
    if (heldArrow) key('keyup', heldArrow); key('keyup', ' ');
    const finishedAt = performance.now();
    if (doc.querySelector('.birthday-finale[open]')) throw new Error('Finished cake must remain visible before the dialog');
    const heldSpace = new a.contentWindow.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    stage.dispatchEvent(heldSpace);
    if (!heldSpace.defaultPrevented) throw new Error('Held blowing key must not scroll the finished cake away');
    await sleep(300);
    if (doc.querySelector('.birthday-finale[open]') || unlit().length) throw new Error('All extinguished candles must be visible during the completion pause');
    await until(() => doc.querySelector('.birthday-finale[open]'), 'completion notice');
    const completionDelay = performance.now() - finishedAt;
    if (completionDelay < 700 || completionDelay > 1100) throw new Error('Completion pause must be approximately 0.8 seconds: ' + completionDelay);
    if (doc.activeElement.id !== 'birthday-complete-title') throw new Error('Dialog must focus its heading rather than an action button');
    const finale = doc.querySelector('.birthday-finale');
    for (const [width, height] of [[768, 900], [320, 480]]) {
        a.style.width = width + 'px'; a.style.height = height + 'px';
        const rect = finale.getBoundingClientRect();
        if (Math.abs(rect.left + rect.width / 2 - doc.documentElement.clientWidth / 2) > 1 || Math.abs(rect.top + rect.height / 2 - a.contentWindow.innerHeight / 2) > 1) throw new Error('Completion card must be centered in the viewport: ' + JSON.stringify(rect.toJSON()) + '; viewport=' + doc.documentElement.clientWidth + 'x' + a.contentWindow.innerHeight);
        if (rect.top < 19 || rect.bottom > a.contentWindow.innerHeight - 19) throw new Error('Completion card must fit short mobile screens');
    }
    a.style.width = '768px'; a.style.height = '900px';
    if (!a.contentWindow.GameBoxBirthday.hasCompleted('birthday-a')) throw new Error('Finished ceremony was not recorded');
    if (!doc.getElementById('birthday-start').textContent.includes('Repeat')) throw new Error('English replay wording did not update');
    doc.querySelector('.birthday-finale').dispatchEvent(new a.contentWindow.KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }));
    doc.querySelector('.birthday-complete-again').click();
    if (doc.querySelectorAll('.birthday-candle:not(.is-out)').length !== 5 || doc.querySelector('.birthday-finale')) throw new Error('Replay must start with fresh candles');
    stage = doc.querySelector('.birthday-cake-stage');
    for (const candle of unlit()) {
        if (isOut(candle)) continue;
        pointer('pointerdown', candle, 'mouse'); await chase(candle, 'mouse');
    }
    doc.getElementById('birthday-read-again').click(); await sleep(1300);
    if (doc.querySelector('.birthday-finale') || doc.getElementById('birthday-notice').hidden) throw new Error('Leaving a finished cake must cancel the pending completion dialog');
    doc.querySelector('.birthday-home-link').click();
    await until(() => a.contentWindow.location.pathname === '/index.html' && a.contentDocument.getElementById('birthday-entry') && !a.contentDocument.getElementById('birthday-entry').hidden, 'return to homepage retains birthday entry');
    await sleep(500);
    if (a.contentWindow.location.pathname !== '/index.html') throw new Error('Returning home caused an auto-entry loop');
    doc = a.contentDocument;
    const entry = doc.getElementById('birthday-entry');
    for (const width of [320, 768]) { a.style.width = width + 'px'; if (entry.scrollWidth > entry.clientWidth + 1) throw new Error('Birthday entry overflows at ' + width + ': ' + entry.scrollWidth + '/' + entry.clientWidth + '; ' + [...entry.querySelectorAll('*')].map(n => n.className + '=' + n.getBoundingClientRect().width).join(', ')); }
    doc.querySelector('#lang-toggle [data-lang="zh"]').click();
    if (!entry.textContent.includes('業已完成') || !entry.textContent.includes('重返')) throw new Error('Completed homepage entry language did not update: ' + entry.textContent);
    doc.querySelector('#lang-toggle [data-lang="en"]').click();
    if (!entry.textContent.includes('completed') || !entry.textContent.includes('Revisit')) throw new Error('English completed homepage wording missing');
    doc.querySelector('#lang-toggle [data-lang="zh"]').click();
    entry.querySelector('a').click();
    await until(() => a.contentWindow.location.pathname === '/games/birthday.html' && a.contentDocument.getElementById('birthday-start'), 'manual birthday re-entry');
    doc = a.contentDocument;
    await until(() => !doc.getElementById('birthday-notice').hidden, 'manual entry eligibility');
    if (!doc.getElementById('birthday-start').textContent.includes('再次') || !doc.querySelector('[data-copy="clause1"]').textContent.includes('已於今日完成')) throw new Error('Reloaded ceremony forgot completed wording');
    doc.getElementById('birthday-start').click();
    setDate(a, [2026, 10, 4, 0, 0, 1]); await sleep(30);
    if (!doc.getElementById('birthday-cake-screen').hidden || doc.getElementById('birthday-gate').hidden || doc.querySelector('.birthday-cake-stage')) throw new Error('Birthday game did not expire at midnight');
    a.remove();
    const reload = frame('birthday-a');
    await until(() => reload.contentWindow.profileReads === 1, 'returning homepage profile'); await sleep(500);
    if (reload.contentWindow.location.pathname !== '/index.html' || reload.contentDocument.getElementById('birthday-entry').hidden) throw new Error('Second visit must remain home with repeat-play entry');
    setDate(reload, [2026, 10, 4, 0, 0, 1]);
    if (!reload.contentDocument.getElementById('birthday-entry').hidden) throw new Error('Homepage entry did not expire');
    reload.remove();
    for (const [uid, extra] of [['not-today', '&birthday=' + encodeURIComponent(JSON.stringify({ month: 11, day: 4 }))], ['invalid', '&birthday=' + encodeURIComponent(JSON.stringify({ month: 2, day: 30 }))], ['guest', '&anonymous=1']]) {
        const f = frame(uid, '/index.html', extra);
        await until(() => f.contentWindow.GameBoxBirthday && f.contentWindow.ArcadeNet, uid + ' boot'); await sleep(500);
        if (!f.contentDocument.getElementById('birthday-entry').hidden || f.contentWindow.location.pathname !== '/index.html') throw new Error('Ineligible homepage exposed birthday entry');
        if (uid === 'guest' && f.contentWindow.profileReads !== 0) throw new Error('Guests fetched birthdays');
        f.remove();
    }
    const gate = frame('not-today', '/games/birthday.html');
    await until(() => gate.contentWindow.profileReads === 1 && gate.contentDocument.getElementById('birthday-gate'), 'direct game eligibility'); await sleep(50);
    if (gate.contentDocument.getElementById('birthday-gate').hidden || !gate.contentDocument.getElementById('birthday-notice').hidden || gate.contentDocument.querySelector('.birthday-cake-stage')) throw new Error('Direct link bypassed birthday eligibility');
    gate.remove();
    const changed = frame('birthday-switch', '/games/birthday.html');
    await until(() => changed.contentDocument.getElementById('birthday-notice') && !changed.contentDocument.getElementById('birthday-notice').hidden, 'account-switch game');
    changed.contentDocument.getElementById('birthday-start').click(); changed.contentWindow.setTestUser(null); await sleep(20);
    if (changed.contentDocument.getElementById('birthday-gate').hidden || changed.contentDocument.querySelector('.birthday-cake-stage')) throw new Error('Sign-out retained birthday game');
    changed.remove();
    localStorage.setItem('gamebox:birthday:entered:midnight-home:2026-11-03', '1');
    const midnightHome = frame('midnight-home', '/index.html', '&rollover=1');
    await until(() => midnightHome.contentDocument.getElementById('birthday-entry') && !midnightHome.contentDocument.getElementById('birthday-entry').hidden, 'entry before real timer midnight');
    await until(() => midnightHome.contentDocument.getElementById('birthday-entry').hidden, 'homepage midnight timer');
    midnightHome.remove();
    const midnightGame = frame('midnight-game', '/games/birthday.html', '&rollover=1');
    await until(() => midnightGame.contentDocument.getElementById('birthday-notice') && !midnightGame.contentDocument.getElementById('birthday-notice').hidden, 'game before real timer midnight');
    midnightGame.contentDocument.getElementById('birthday-start').click();
    await until(() => midnightGame.contentDocument.getElementById('birthday-cake-screen').hidden, 'game midnight timer');
    if (midnightGame.contentDocument.querySelector('.birthday-cake-stage')) throw new Error('Midnight timer did not clean up cake');
    midnightGame.remove();
    document.getElementById('result').textContent = 'PASS: birthday first-entry navigation, repeat entry, formal bilingual game, mouse/touch/keyboard candles, replay, midnight expiry and account eligibility; no feedback writes.';
})().catch(e => { document.getElementById('result').textContent = 'FAIL: ' + e.stack; });
</script>`;
module.exports = { accountStub, fixedClock, runner };
