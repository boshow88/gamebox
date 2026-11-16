/* Exercise the real renderer with real flights and a recording Canvas context. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const R = require('../js/games/trash-toss-rules.js');
let translations = [], depth = 0;
const ctx = new Proxy({
    save() { depth++; }, restore() { depth--; },
    translate(x, y) { translations.push([x, y]); },
    createLinearGradient() { return { addColorStop() {} }; },
}, { get: (target, key) => key in target ? target[key] : () => {} });
const classes = new Set();
const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ width: 349, height: 295, top: 0, left: 0 }), parentElement: { clientWidth: 351, style: { setProperty() {} }, classList: {
    toggle(key, on) { if (on) classes.add(key); else classes.delete(key); },
} } };
const window = { TrashTossRules: R, innerWidth: 375, innerHeight: 812, devicePixelRatio: 2 };
vm.runInNewContext(fs.readFileSync(require.resolve('../js/games/trash-toss-view.js'), 'utf8'), { window });
const view = window.TrashTossView.create(canvas);
assert.equal(view.isPortrait(), true); assert.ok(classes.has('is-portrait'));
assert.equal(canvas.width, 1440); assert.equal(canvas.height, 1216);
const scene = { ...R.scenario({ scene: 'office' }, 1, 42), qa: true, wind: 0, rain: 0, item: 'paper', grams: 8 };
const model = { scene, time: 0, angle: 45, ball: null, trail: [], ghost: [], debris: [],
    binContents: R.binContents(scene, []), players: 2, active: 0, playerLabels: ['P1', 'P2'],
    countLabel: String, overviewLabel: 'Field overview', aiming: true, practice: true, qa: false };
function render() {
    translations = [];
    const before = JSON.stringify(model);
    view.render(model);
    assert.equal(JSON.stringify(model), before, 'Camera rendering never changes game state');
    assert.equal(depth, 0, 'World and overview transforms remain isolated');
    return -translations[0][0];
}
render(); view.panBy(-5000, 100);
const targetCamera = render();
assert.ok(scene.bins.every(b => b.x - b.width / 2 >= targetCamera && b.x + b.width / 2 <= targetCamera + 720), 'Inspecting targets includes both bins');
for (const item of Object.keys(R.ITEMS)) for (const angle of [15, 45, 80]) {
    model.scene = { ...scene, item, grams: R.ITEMS[item].grams };
    view.follow(); model.ball = R.launch(model.scene, angle, 100, model.time); model.aiming = false;
    assert.equal(render(), 0, 'A new release returns from inspected targets to the thrower');
    while (!model.ball.result) {
        R.advance(model.scene, model.ball, 1 / 60); model.time = model.ball.time;
        const x = render();
        assert.ok(x >= 0 && x <= 240, 'Camera stays inside the physical world');
        if (model.ball.x >= 0 && model.ball.x <= 960) assert.ok(model.ball.x >= x && model.ball.x <= x + 720, 'The moving trash stays in the portrait field');
    }
    model.ball = null; model.aiming = true; render();
}
model.qa = true; render();
assert.equal(view.isPortrait(), false); assert.equal(canvas.width, 1920);
assert.equal(canvas.height, 1080, 'QA retains the whole field for trajectory comparisons');
model.qa = false; render();
assert.equal(view.isPortrait(), true, 'Normal play restores the enlarged portrait field');
window.innerWidth = 960; window.innerHeight = 800; view.fit();
assert.equal(view.isPortrait(), false); assert.equal(classes.has('is-portrait'), false);
assert.equal(canvas.width, 1680); assert.equal(canvas.height, 1216);
assert.ok(view.canPan(), 'Medium desktop maps retain a small inspection range');
view.panBy(-5000, 100); assert.equal(render(), 120); view.follow(); render();
model.scene = { ...R.scenario({ scene: 'living' }, 1, 42) };
model.binContents = R.binContents(model.scene, []); render();
assert.equal(view.canPan(), false, 'Living room is fully visible without dragging');
assert.equal(canvas.width, 1200); assert.equal(canvas.height, 1080);
view.panBy(-5000, 100); assert.equal(render(), 0);
model.scene = { ...R.scenario({ scene: 'construction' }, 1, 42), qa: true, wind: 0, rain: 0 };
model.binContents = R.binContents(model.scene, []); render();
assert.ok(view.canPan(), 'Desktop long maps also allow dragging and show the overview');
view.panBy(-10000, 100); assert.equal(render(), 1440);
const held = render(); model.time += 1; assert.equal(render(), held, 'Manual inspection stays put while the world clock continues');
view.follow(); render();
assert.equal(view.beginPan(20, 280), true); view.panBy(100, 280, 120);
assert.ok(render() > 0, 'Dragging the overview right moves the camera right');
view.beginPan(0, 280); assert.equal(render(), 0, 'Tapping the overview selects that part of the field');
for (const item of R.SCENES.construction.items) {
    model.scene.item = item; model.scene.grams = R.ITEMS[item].grams;
    view.follow(); model.ball = R.launch(model.scene, 70, 100, model.time); model.aiming = false;
    assert.equal(render(), 0, 'Every long-map release snaps back from dragged targets');
    while (!model.ball.result) {
        R.advance(model.scene, model.ball, 1 / 60); model.time = model.ball.time;
        const x = render(), y = -translations[0][1], onScreenY = R.WORLD.floor - model.ball.y - y;
        assert.ok(x >= 0 && x <= 1440);
        if (model.ball.x >= 0 && model.ball.x <= 2400) assert.ok(model.ball.x >= x && model.ball.x <= x + 960);
        assert.ok(onScreenY >= 0 && onScreenY <= 540, 'The vertical camera keeps high construction arcs visible');
    }
    model.ball = null; model.aiming = true; render();
}
console.log('PASS: manual camera inspection, release reset, household/tool tracking, visible high arcs, isolated overview transforms, immutable model and desktop restoration.');
