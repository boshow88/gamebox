/* Execute the real game controller with a deterministic shell clock and minimal DOM. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const R = require('../js/games/trash-toss-rules.js');
function fixture(mobile = false) {
    class Node {
        constructor(id) {
            this.id = id; this.value = ''; this.textContent = ''; this.hidden = false; this.disabled = false;
            this.listeners = {}; this.style = {}; this.attributes = {};
            this.children = [];
            const classes = new Set();
            this.classList = { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) };
        }
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
        fire(type, props) {
            const e = Object.assign({ target: this, button: 0, isPrimary: true, pointerId: 1, preventDefault() {}, stopImmediatePropagation() {} }, props);
            for (const fn of this.listeners[type] || []) fn(e);
        }
        setAttribute(key, value) { this.attributes[key] = value; }
        get value() { return this._value; }
        set value(value) { this._value = String(value); }
        appendChild(node) { this.children.push(node); }
        append(...nodes) { this.children.push(...nodes); }
        replaceChildren(...nodes) { this.children = nodes; }
        reportValidity() { return true; }
        setPointerCapture() {}
        closest() { return ['tt-mode', 'tt-scene', 'tt-item', 'tt-difficulty', 'tt-angle', 'tt-throw'].includes(this.id) ? this : null; }
        matches() { return false; }
    }
    const nodes = new Map(), get = id => {
        if (!nodes.has(id)) { const node = new Node(id); node.parentElement = { classList: node.classList }; nodes.set(id, node); }
        return nodes.get(id);
    };
    const events = {}, prefs = { mode: 'local', scene: 'park', item: 'mixed', difficulty: 'normal', version: 2 };
    let options, shell, model, result, wallMs = 0, renders = 0;
    const i18n = { STRINGS: { en: {}, zh: {} }, subscribe() {}, t(key, ...args) {
        const value = i18n.STRINGS.en[key]; return typeof value === 'function' ? value(...args) : value || key;
    } };
    const window = { innerWidth: mobile ? 375 : 960, performance: { now: () => wallMs }, TrashTossRules: R, TrashTossView: { create: () => ({ fit() {}, follow() {}, beginPan() { return false; }, panBy() {}, canPan: () => false, isPortrait: () => false, render(value) { model = value; renders++; } }) },
        addEventListener(type, fn) { (events[type] ||= []).push(fn); }, ArcadeCommon: {
            i18n, prefs: { get: () => prefs, set: (id, value) => Object.assign(prefs, value) }, audio: { unlock() {}, play() {}, tone() {} },
            shell: { create(opts) {
                options = opts;
                assert.ok(opts.mode().endsWith('-v5'), 'Record mode must be available during shell construction');
                shell = { state: 'idle', keyboard: { isDown: () => false }, isPlaying: () => shell.state === 'playing', refreshBest() {}, refreshOverlay() {},
                    start() { shell.state = 'playing'; opts.onStart(); opts.render(); },
                    pause() { shell.state = 'paused'; opts.onPause(); opts.render(); },
                    resume() { shell.state = 'playing'; opts.onResume(); opts.render(); },
                    goIdle() { opts.reset(); shell.state = 'idle'; opts.render(); },
                    gameOver(value) { result = value; shell.state = 'over'; opts.render(); } };
                return shell;
            } },
        } };
    const document = { getElementById: get, activeElement: new Node('body'), createElement: tag => new Node(tag) };
    class Clock extends Date { static now() { return 42; } }
    const context = vm.createContext({ window, document, Element: Node, Date: Clock });
    vm.runInContext(fs.readFileSync(require.resolve('../js/games/trash-toss-qa.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(require.resolve('../js/games/trash-toss.js'), 'utf8'), context);
    return { get, shell, model: () => model, result: () => result,
        tick(seconds) { for (let i = 0; i < Math.round(seconds * 60); i++) { if (shell.isPlaying()) options.update(1 / 60); wallMs += 1000 / 60; options.render(); } },
        renders: () => renders,
        highRefresh(seconds) { for (let i = 0; i < Math.round(seconds * 120); i++) { if (i % 2 === 0 && shell.isPlaying()) options.update(1 / 60); wallMs += 1000 / 120; options.render(); } },
        pointer(type) { if (type === 'pointerdown') get('tt-throw').fire(type); else for (const fn of events[type] || []) fn({ pointerId: 1 }); },
    };
}
const phone = fixture(true);
phone.get('tt-mode').value = 'practice'; phone.get('tt-apply').fire('click'); phone.shell.start();
const beforePaint = phone.renders(); phone.pointer('pointerdown'); phone.highRefresh(1.3);
assert.ok(phone.renders() - beforePaint <= 40, 'A 120 Hz mobile screen paints at most 30 frames per second');
assert.ok(phone.renders() - beforePaint >= 38, 'Mobile animation still advances regularly');
assert.equal(phone.get('tt-power-value').textContent, 100, 'Charge keeps 60 Hz timing despite reduced painting');
phone.pointer('pointerup'); phone.tick(1 / 30); assert.ok(phone.model().ball, 'Mobile release still launches normally');
const f = fixture();
assert.equal(f.get('tt-scene').value, 'office', 'Each page starts at the office despite old scene preferences');
f.get('tt-scene').value = 'park'; f.get('tt-apply').fire('click'); f.shell.start();
assert.equal(f.model().players, 2);
assert.equal(f.get('tt-previous-wind').hidden, true, 'A first throw has no invented wind reference');
assert.equal(f.get('tt-previous-material').hidden, true);
const first = [f.get('tt-material').textContent, f.get('tt-wind').textContent, f.get('tt-weather-name').textContent];
const angleBefore = Number(f.get('tt-angle').value);
f.get('tt-angle-up').fire('pointerdown'); f.tick(.5); f.get('tt-angle-up').fire('pointerup');
assert.ok(Number(f.get('tt-angle').value) >= angleBefore + 16, 'Holding plus continuously raises angle');
const heldAngle = f.get('tt-angle').value; f.tick(.2); assert.equal(f.get('tt-angle').value, heldAngle, 'Release stops angle repeat');
f.get('tt-angle-down').fire('pointerdown'); f.tick(.2); f.get('tt-angle-down').fire('pointercancel');
const cancelledAngle = f.get('tt-angle').value; f.tick(.2); assert.equal(f.get('tt-angle').value, cancelledAngle, 'Pointer cancellation stops repeat');
f.pointer('pointerdown'); f.tick(1.3); assert.equal(f.get('tt-power-value').textContent, 100);
f.tick(1.3); assert.equal(f.get('tt-power-value').textContent, 0);
f.tick(.5); f.pointer('pointerup');
const releaseTime = f.model().time;
assert.equal(f.get('tt-previous-wind').hidden, true, 'Releasing does not replace the previous reference with the current throw');
for (let i = 0; i < 420 && f.get('tt-ready').hidden; i++) f.tick(1 / 60);
assert.equal(f.get('tt-ready').hidden, false, 'Actual controller reaches handoff');
assert.equal(f.model().active, 1);
assert.equal(f.get('tt-previous-wind').hidden, true, 'Player B must not see player A as their previous throw');
assert.deepEqual([f.get('tt-material').textContent, f.get('tt-wind').textContent, f.get('tt-weather-name').textContent], first, 'Both turns receive the same round conditions');
assert.ok(f.model().time > releaseTime, 'Next turn does not reset world time');
assert.ok(f.model().debris.length > 0, 'The thrown object survives the turn transition');
const before = f.model().time, actorBefore = R.obstacles(f.model().scene, before)[0].x;
f.tick(2);
assert.ok(f.model().time >= before + 1.99, 'Handoff continues world animation');
assert.equal(f.get('tt-clock').textContent, '', 'Handoff does not consume release time');
assert.notEqual(R.obstacles(f.model().scene, f.model().time)[0].x, actorBefore);
f.get('tt-ready').fire('click'); f.tick(12.6);
assert.equal(f.get('tt-round').textContent, '2 / 5');
assert.equal(f.get('tt-previous-wind').textContent, 'Last throw: ' + first[1] + ' · ' + first[2], 'Player A sees their own previous wind and weather across rounds');
assert.notEqual(f.get('tt-weather-name').textContent, first[2], 'New round changes weather');
assert.ok(f.model().visualRain > 0 && f.model().visualRain < f.model().scene.rain, 'Rain particles fade in rather than jumping to the new intensity');
f.tick(1);
assert.ok(Math.abs(f.model().visualRain - f.model().scene.rain) < 1e-8);
assert.ok(f.model().debris.length > 0, 'Debris survives a round transition');
assert.equal(f.model().active, 0, 'Round two returns to player A');
f.get('tt-ready').fire('click');
f.pointer('pointerdown'); f.tick(.4); f.shell.pause(); f.pointer('pointerup');
const paused = f.model().time; f.tick(2); assert.equal(f.model().time, paused);
f.shell.resume(); assert.equal(f.get('tt-power-value').textContent, 0); assert.equal(f.model().ball, null, 'Pause cancellation does not throw');
f.pointer('pointerdown'); f.tick(.3); f.pointer('pointercancel'); assert.equal(f.get('tt-power-value').textContent, 0);
f.get('tt-mode').value = 'practice'; f.get('tt-mode').fire('input');
assert.equal(f.model().players, 2, 'Staged settings do not replace the running session');
f.get('tt-apply').fire('click');
assert.equal(f.model().players, 1); assert.equal(f.model().debris.length, 0); assert.equal(f.model().time, 0, 'Only New game resets the world');
assert.equal(f.get('tt-previous-wind').hidden, true, 'New game clears wind references');
f.shell.start(); const oldItem = f.get('tt-material').textContent;
f.pointer('pointerdown'); f.tick(.5); f.pointer('pointerup'); f.tick(6);
assert.notEqual(f.get('tt-material').textContent, oldItem, 'Mixed practice advances item/weight');
assert.equal(f.result(), undefined, 'Practice never ends or submits a score');
const retained = f.model().debris.length;
for (const y of [20, 44, 68]) f.model().debris.push({ x: f.model().scene.bins[0].x, y, radius: 12, item: 'book', grams: 280, resting: true, result: { kind: 'basket', points: 10 } });
f.tick(1 / 60);
assert.equal(f.get('tt-cleaning').hidden, false, 'The real controller announces a full-bin collection');
const collection = f.model().scene.cleaning.active;
f.tick(collection.clearAt - f.model().time + .1);
assert.ok(f.model().debris.length <= retained, 'The real controller removes collected bodies');
assert.ok(f.model().scene.cleaning.active.cleared);
f.tick(collection.endAt - f.model().time + .1);
assert.equal(f.model().scene.cleaning.active, null, 'Collection ends independently of throws');
f.pointer('pointerdown'); f.tick(.3); f.pointer('pointerup'); f.tick(1 / 60);
const actualBall = f.model().ball;
actualBall.hits.push('cleaner'); f.tick(1 / 60);
assert.equal(f.get('tt-score-a').textContent, -5, 'Collision deduction appears before a later basket');
actualBall.result = { kind: 'basket', points: 5, basketPoints: 10, penalty: -5 }; f.tick(1 / 60);
assert.match(f.get('tt-status').textContent, /Collision −5 · Basket \+10/);
assert.equal(f.get('tt-score-a').textContent, 5, 'The basket adds ten after the separate five-point deduction');
assert.equal(f.model().result.basketPoints, 10, 'Canvas receives the full positive basket event');
f.get('tt-mode').value = 'qa'; f.get('tt-scene').value = 'office'; f.get('tt-apply').fire('click'); f.shell.start();
assert.equal(f.get('tt-qa-panel').hidden, false); assert.equal(f.get('tt-normal-controls').hidden, true);
for (const [id, value] of [['item', 'paper'], ['weight', '8'], ['angle', '45'], ['power', '65'], ['wind', '30'], ['rain', '0']]) f.get('tt-qa-' + id).value = value;
f.get('tt-qa-form').fire('submit');
f.tick(1 / 60);
assert.equal(f.model().scene.qa, true); assert.equal(f.model().scene.wind, 30); assert.equal(f.model().ball.grams, 8);
assert.equal(f.model().scene.freeFlight, false, 'QA defaults to real bucket collisions');
assert.ok(f.model().reference.length > 0, 'QA displays a separate no-wind reference from the real simulator');
f.tick(6);
assert.equal(f.get('tt-qa-fire').disabled, false, 'QA can repeat numeric throws without manual charging');
assert.equal(f.get('tt-qa-history').children.length, 1);
const previousTrail = JSON.stringify(f.model().trail);
f.get('tt-qa-power').value = '70'; f.get('tt-qa-wind').value = '-30'; f.get('tt-qa-form').fire('submit'); f.tick(1 / 60);
assert.match(f.get('tt-previous-material').textContent, /8g/, 'Previous weight stays beside the current weight');
assert.match(f.get('tt-previous-wind').textContent, /→ A\/C airflow 30/, 'QA keeps the previous throw wind while the next throw uses a different wind');
assert.equal(JSON.stringify(f.model().ghost), previousTrail, 'QA preserves the actual previous trajectory on the next throw');
f.tick(6);
assert.equal(f.get('tt-qa-hud-metrics').children.length, 19, 'All diagnostics have in-field HUD values');
f.get('tt-qa-freeflight').checked = true;
f.get('tt-qa-form').fire('submit'); f.tick(1 / 60);
assert.equal(f.model().scene.freeFlight, true, 'Ignoring buckets requires an explicit checkbox');
f.tick(6);
assert.match(f.get('tt-status').textContent, /Bin collisions and scoring are off/, 'Free-flight results explain why buckets do not score');
f.get('tt-qa-sweep').fire('click');
assert.equal(f.get('tt-qa-history').children.length, 8, 'Wind comparison records five controlled experiments');
f.get('tt-qa-freeflight').checked = false; f.get('tt-qa-wind').value = '0'; f.get('tt-qa-power').value = '81.5';
for (let i = 0; i < 2; i++) {
    f.get('tt-qa-form').fire('submit');
    assert.equal(f.get('tt-score-a').textContent, 0, 'Each QA throw starts with its own test score');
    f.tick(6);
    assert.equal(f.get('tt-score-a').textContent, 25, 'QA shows the actual basket judgement without accumulating scores');
    assert.equal(f.get('tt-player-label').textContent, 'Test points');
    assert.match(f.get('tt-status').textContent, /basket, \+25 points/);
}
assert.equal(f.result(), undefined, 'QA never submits a competitive score');
f.get('tt-qa-clear').fire('click');
assert.equal(f.get('tt-previous-wind').hidden, true, 'Clearing QA also clears its throw reference');
for (const [name, layout] of Object.entries(R.SCENES)) {
    f.get('tt-scene').value = name; f.get('tt-apply').fire('click'); f.shell.start();
    assert.deepEqual(f.get('tt-qa-item').children.map(n => n.value), layout.items, 'QA only lists the applied scene’s objects');
    assert.ok(layout.items.includes(f.get('tt-qa-item').value));
    for (const key of layout.items) {
        f.get('tt-qa-item').value = key; f.get('tt-qa-item').fire('input');
        assert.equal(Number(f.get('tt-qa-weight').value), R.ITEMS[key].grams);
        assert.equal(Number(f.get('tt-qa-weight').min), R.ITEMS[key].grams / 4);
    }
}
const cpu = fixture();
cpu.get('tt-mode').value = 'cpu'; cpu.get('tt-scene').value = 'construction'; cpu.get('tt-apply').fire('click'); cpu.shell.start();
assert.equal(cpu.model().scene.width, 2400); assert.equal(cpu.model().players, 2);
cpu.tick(22);
assert.equal(cpu.get('tt-round').textContent, '2 / 5', 'A construction CPU completes its throw after the human timeout');
assert.equal(cpu.model().active, 0);
console.log('PASS: controller clock continuity, collection lifecycle, separate penalty/basket feedback, construction CPU turn, handoff/pause/cancel, fixed AB order, per-player wind references and numeric QA.');
