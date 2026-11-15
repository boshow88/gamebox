/* Execute the real game controller with a deterministic shell clock and minimal DOM. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const R = require('../js/games/trash-toss-rules.js');
function fixture() {
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
        replaceChildren() { this.children = []; }
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
    let options, shell, model, result;
    const i18n = { STRINGS: { en: {}, zh: {} }, subscribe() {}, t(key, ...args) {
        const value = i18n.STRINGS.en[key]; return typeof value === 'function' ? value(...args) : value || key;
    } };
    const window = { TrashTossRules: R, TrashTossView: { create: () => ({ fit() {}, render(value) { model = value; } }) },
        addEventListener(type, fn) { (events[type] ||= []).push(fn); }, ArcadeCommon: {
            i18n, prefs: { get: () => prefs, set: (id, value) => Object.assign(prefs, value) }, audio: { unlock() {}, play() {}, tone() {} },
            shell: { create(opts) {
                options = opts;
                assert.ok(opts.mode().endsWith('-v2'), 'Record mode must be available during shell construction');
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
        tick(seconds) { for (let i = 0; i < Math.round(seconds * 60); i++) { if (shell.isPlaying()) options.update(1 / 60); options.render(); } },
        pointer(type) { if (type === 'pointerdown') get('tt-throw').fire(type); else for (const fn of events[type] || []) fn({ pointerId: 1 }); },
    };
}
const f = fixture(); f.shell.start();
assert.equal(f.model().players, 2);
const first = [f.get('tt-material').textContent, f.get('tt-wind').textContent, f.get('tt-weather-name').textContent];
f.pointer('pointerdown'); f.tick(1.3); assert.equal(f.get('tt-power-value').textContent, 100);
f.tick(1.3); assert.equal(f.get('tt-power-value').textContent, 0);
f.tick(.5); f.pointer('pointerup');
const releaseTime = f.model().time;
for (let i = 0; i < 420 && f.get('tt-ready').hidden; i++) f.tick(1 / 60);
assert.equal(f.get('tt-ready').hidden, false, 'Actual controller reaches handoff');
assert.equal(f.model().active, 1);
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
f.shell.start(); const oldItem = f.get('tt-material').textContent;
f.pointer('pointerdown'); f.tick(.5); f.pointer('pointerup'); f.tick(6);
assert.notEqual(f.get('tt-material').textContent, oldItem, 'Mixed practice advances item/weight');
assert.equal(f.result(), undefined, 'Practice never ends or submits a score');
f.get('tt-mode').value = 'qa'; f.get('tt-apply').fire('click'); f.shell.start();
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
f.get('tt-qa-power').value = '70'; f.get('tt-qa-form').fire('submit'); f.tick(1 / 60);
assert.equal(JSON.stringify(f.model().ghost), previousTrail, 'QA preserves the actual previous trajectory on the next throw');
f.tick(6);
assert.equal(f.get('tt-qa-hud-metrics').children.length, 19, 'All diagnostics have in-field HUD values');
f.get('tt-qa-freeflight').checked = true;
f.get('tt-qa-form').fire('submit'); f.tick(1 / 60);
assert.equal(f.model().scene.freeFlight, true, 'Ignoring buckets requires an explicit checkbox');
f.tick(6);
f.get('tt-qa-sweep').fire('click');
assert.equal(f.get('tt-qa-history').children.length, 8, 'Wind comparison records five controlled experiments');
assert.equal(f.result(), undefined, 'QA never submits a competitive score');
console.log('PASS: controller clock continuity, persistent debris, handoff/pause/cancel, fixed AB order, separate previous/reference QA trajectories, 19 HUD metrics and both collision modes.');
