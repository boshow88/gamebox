/* Real game rules: deterministic flight, collision, fair turns and bounded ties. */
'use strict';
const assert = require('node:assert/strict');
const R = require('../js/games/trash-toss-rules.js');
const { findCleanThrows } = require('./helpers/trash-toss-physics.js');
const scene = R.scenario({ mode: 'practice', scene: 'office', item: 'paper' }, 1, 42);
const bin = scene.bins[0];
function drop(x, item = 'paper', vy = -60) {
    const s = { ...scene, item, grams: R.ITEMS[item].grams }, ball = R.launch(s, 45, 50, 0);
    Object.assign(ball, { x, y: bin.height + ball.radius + 2, vx: 0, vy });
    R.advance(s, ball, 0.25); return ball;
}
assert.equal(drop(bin.x).result.kind, 'basket');
assert.equal(drop(bin.x).result.points, 10);
assert.equal(drop(bin.x, 'paper', 80).result, null, 'Rising through rim height does not score');
assert.equal(drop(bin.x + 33, 'paper').result.kind, 'basket');
const wideBook = R.launch({ ...scene, item: 'book', grams: 280, qa: true }, 45, 50, 0);
Object.assign(wideBook, { x: bin.x + 33, y: bin.height + wideBook.radius + .2, vx: 0, vy: -60 });
R.advance({ ...scene, qa: true }, wideBook, 1 / 240);
assert.equal(wideBook.result, null, 'An oversized entry must clear the rim before it can score');
const clearScene = { ...scene, item: 'paper', grams: 8, wind: 0, rain: 0, qa: true, freeFlight: false };
for (const item of Object.keys(R.ITEMS)) for (const target of clearScene.bins) for (const side of [-1, 1]) for (const overlap of [0, .05, .5, 1, 2]) {
    const environment = { ...clearScene, item, grams: R.ITEMS[item].grams };
    const grazed = R.launch(environment, 45, 60, 0);
    Object.assign(grazed, { x: target.x + side * (target.width / 2 - 6 - grazed.radius + overlap),
        y: target.height + grazed.radius + 4, vx: 0, vy: -60 });
    while (!grazed.result) R.advance(environment, grazed, 1 / 240);
    assert.equal(grazed.result.kind, 'basket', 'A rim graze that subsequently falls inside must score');
    assert.equal(grazed.result.bin, target.id); assert.equal(grazed.result.points, target.points);
}
// A shallow dip followed by an inner-mouth rebound is not a full basket.
const shallow = R.launch(clearScene, 45, 50, 0);
Object.assign(shallow, { x: bin.x, y: bin.height + shallow.radius + 2, vx: 0, vy: -160 });
let shallowLow = shallow.y;
for (let i = 0; i < 100 && shallow.vy < 0; i++) {
    R.advance(clearScene, shallow, 1 / 240, [{ x: bin.x, y: bin.height - 31, radius: 20, resting: true }]);
    shallowLow = Math.min(shallowLow, shallow.y);
}
assert.ok(shallow.vy > 0 && shallowLow < bin.height + shallow.radius && shallowLow + shallow.radius > bin.height);
assert.equal(shallow.result, null, 'Partial entry and an inner-mouth rebound never receive premature points');
const belowRim = R.launch(clearScene, 45, 60, 0);
Object.assign(belowRim, { x: bin.x, y: 50, vx: 0, vy: -60 });
while (!belowRim.result) R.advance(clearScene, belowRim, 1 / 240);
assert.equal(belowRim.result.kind, 'miss', 'Being inside without a top approach must not manufacture a basket');
const ricochetScene = { ...clearScene, bins: [{ id: 'large', x: 620, width: 100, height: 82, points: 10 }, { id: 'small', x: 824, width: 62, height: 110, points: 25 }] };
const crossBin = R.launch(ricochetScene, 45, 60, 0);
Object.assign(crossBin, { x: 667, y: 94, vx: 180, vy: -800 });
while (!crossBin.result) R.advance(ricochetScene, crossBin, 1 / 240);
assert.ok(crossBin.rim); assert.equal(crossBin.result.bin, 'small'); assert.equal(crossBin.result.points, 25, 'Large-rim to small-bin ricochet scores the actual destination');
const rim = R.launch(scene, 45, 50, 0);
Object.assign(rim, { x: bin.x + bin.width / 2 - 3, y: bin.height + rim.radius + 2, vx: 0, vy: -60 });
while (!rim.rim) R.advance(scene, rim, 1 / 240);
assert.ok(rim.vy > 0, 'First rim contact rebounds');
const side = R.launch(scene, 45, 50, 0);
Object.assign(side, { x: bin.x - 65, y: 40, vx: 500, vy: 0 });
R.advance(scene, side, .06); assert.notEqual(side.result?.kind, 'basket'); assert.ok(side.vx < 0, 'Side wall rebounds without scoring');
const target = R.obstacles(scene, 0)[0], hit = R.launch(scene, 45, 50, 0);
Object.assign(hit, { x: target.x, y: 50, vx: 0, vy: 0 }); R.advance(scene, hit, 1 / 60);
assert.equal(hit.result, null, 'Contact does not end the flight');
assert.ok(hit.hits.includes('boss'));
while (!hit.result) R.advance(scene, hit, 1 / 60);
assert.equal(hit.result.points, -5, 'A struck throw that misses keeps one five-point penalty');
const birdScene = { ...R.scenario({ scene: 'park' }, 1, 1), bins: ricochetScene.bins, wind: 0, rain: 0 };
const birdTime = 3 - birdScene.phase * 2, bird = R.obstacles(birdScene, birdTime).find(o => o.id === 'bird');
const ricochet = R.launch(birdScene, 45, 50, birdTime);
Object.assign(ricochet, { x: bird.x, y: bird.y + bird.height + ricochet.radius + 1, vx: 0, vy: -200 });
while (!ricochet.result) R.advance(birdScene, ricochet, 1 / 60);
assert.ok(ricochet.hits.includes('bird')); assert.equal(ricochet.result.kind, 'basket');
assert.equal(ricochet.result.points, 5, 'Bird ricochet followed by a large basket scores 10 minus one penalty');
const perched = R.launch({ ...scene, qa: true }, 45, 50, 0);
Object.assign(perched, { x: bin.x + bin.width / 2 - 3, y: bin.height + perched.radius + .02, vx: 0, vy: 0 });
while (!perched.result && perched.age < 1) R.advance({ ...scene, qa: true }, perched, 1 / 60);
assert.ok(perched.result && perched.age < .5, 'A motionless rim contact settles without waiting five seconds');
const apex = R.launch({ ...scene, qa: true }, 45, 50, 0);
Object.assign(apex, { x: 200, y: 250, vx: 0, vy: 0 }); R.advance({ ...scene, qa: true }, apex, .15);
assert.equal(apex.result, null, 'A slow unsupported apex must keep flying');
const stored = drop(bin.x), savedResult = JSON.stringify(stored.result);
for (let i = 0; i < 180; i++) R.advance(scene, stored, 1 / 60, [], true);
assert.equal(stored.y, R.WORLD.binFloor + stored.radius, 'Bin floor supports trash above the visible bottom frame');
assert.equal(JSON.stringify(stored.result), savedResult, 'Aftermath never revokes or duplicates a basket');
const bounceOut = R.launch({ ...scene, qa: true, wind: 0 }, 45, 65, 0);
Object.assign(bounceOut, { x: bin.x, y: 94, vx: 0, vy: -600 });
while (!bounceOut.result) R.advance({ ...scene, qa: true, wind: 0 }, bounceOut, 1 / 60);
const fixedScore = JSON.stringify(bounceOut.result);
let high = bounceOut.y;
for (let i = 0; i < 100; i++) {
    R.advance({ ...scene, qa: true, wind: 0 }, bounceOut, 1 / 240, [{ x: bin.x, y: 57, radius: 20, resting: true }], true);
    high = Math.max(high, bounceOut.y);
}
assert.ok(high > bin.height + bounceOut.radius, 'A full-bin rebound can leave the opening');
assert.equal(JSON.stringify(bounceOut.result), fixedScore, 'A real full-bin bounce-out retains its first-entry score');
for (const sceneName of ['office', 'park']) for (const item of Object.keys(R.ITEMS)) {
    const s = R.scenario({ mode: 'practice', scene: sceneName, item }, 1, 83);
    const first = R.simulate(s, 48, 72, 1.5), second = R.simulate(s, 48, 72, 1.5);
    assert.deepEqual(first, second, 'Identical controls replay exactly');
    assert.ok(first.result && first.age <= 6.01 && Number.isFinite(first.x));
    const p = R.cpuPlan(s, 'hard', 12), repeated = R.cpuPlan(s, 'hard', 12);
    assert.deepEqual(p, repeated, 'CPU planning and input error are seeded');
    const cpuShot = R.simulate(s, p.angle, p.power, p.releaseAt);
    assert.ok(cpuShot.result, 'CPU uses the same finishing flight');
    assert.ok(p.angle >= 15 && p.angle <= 80 && p.power >= 0 && p.power <= 100);
}
const windy = { ...scene, wind: 30 };
const paper = R.launch(windy, 45, 50, 0), bookScene = { ...windy, item: 'book', grams: 280 }, book = R.launch(bookScene, 45, 50, 0);
Object.assign(paper, { vx: 0 }); Object.assign(book, { vx: 0 });
R.advance(windy, paper, 1 / 60); R.advance(bookScene, book, 1 / 60);
assert.ok(paper.vx > book.vx * 3, 'Wind acceleration follows object properties');
assert.ok(Math.abs(paper.vy - book.vy) > 0, 'Launch speed differs by object');
const longFrame = R.launch(scene, 45, 70, 1), shortFrames = R.launch(scene, 45, 70, 1);
R.advance(scene, longFrame, 1 / 60);
for (let i = 0; i < 4; i++) R.advance(scene, shortFrames, 1 / 240);
assert.deepEqual(longFrame, shortFrames, 'Shell frames use identical physics substeps');
for (const [seconds, expected] of [[0, 0], [.65, 50], [1.3, 100], [1.95, 50], [2.6, 0], [3.25, 50], [5.2, 0]]) {
    assert.ok(Math.abs(R.chargePower(seconds) - expected) < 1e-8, 'Charge bounces at both ends');
}
const rounds = Array.from({ length: 10 }, (_, i) => R.scenario({ mode: 'cpu', scene: 'park' }, i + 1, 42));
const heights = [], sightings = [];
for (let t = 0; t < 72; t += .1) {
    const b = R.obstacles(birdScene, t).find(o => o.id === 'bird'); sightings.push(!!b); if (b) heights.push(b.y);
}
assert.ok(sightings.filter(Boolean).length < sightings.length / 2, 'Bird leaves quiet intervals between passes');
assert.ok(Math.max(...heights) - Math.min(...heights) > 200, 'Bird alternates high and low flight');
assert.equal(new Set(rounds.map(s => s.item)).size, 10, 'All ten scene items rotate before repetition');
assert.equal(new Set(rounds.map(s => s.weather)).size, 6, 'Outdoor cycle visits all weather profiles');
for (let i = 0; i < rounds.length; i++) {
    const a = rounds[i].rain, b = rounds[(i + 1) % rounds.length].rain;
    assert.ok(Math.abs(a - b) <= .91, 'Heavy rain never jumps directly to/from dry weather');
}
assert.equal(new Set(rounds.map(s => s.phase)).size, 1, 'Actor phase never resets on a new throw or round');
for (const s of rounds) {
    assert.equal(s.grams, R.ITEMS[s.item].grams, 'Round trash uses its fixed native weight');
    const bird = R.obstacles(s, 20).find(o => o.id === 'bird');
    assert.deepEqual(bird, R.obstacles(rounds[0], 20).find(o => o.id === 'bird'), 'Bird position depends only on session time');
}
assert.deepEqual([...new Set(Array.from({ length: 8 }, (_, i) => R.scenario({ mode: 'practice', item: 'paper' }, i + 1, 42).grams))], [8], 'Repeated paper practice always uses 8g');
// Captured before removing random weights: reserve that draw without shifting the weather stream.
for (const [scene, round, weather, wind, rain] of [
    ['office', 1, 'calm', 4, 0], ['office', 4, 'breeze', -18, 0],
    ['living', 1, 'calm', 2, 0], ['living', 4, 'breeze', -10, 0],
    ['park', 1, 'strong', 57, 0], ['park', 4, 'storm', -48, 1.6],
    ['arena', 1, 'strong', 40, 0], ['arena', 4, 'storm', -34, 1.6],
    ['construction', 1, 'strong', 57, 0], ['construction', 4, 'storm', -48, 1.6],
]) {
    const s = R.scenario({ scene }, round, 42);
    assert.deepEqual([s.weather, s.wind, s.rain], [weather, wind, rain], 'Fixed weights preserve existing seeded wind and rain in ' + scene);
}
const dry = { ...scene, wind: 0, rain: 0 }, wet = { ...dry, rain: 1.6 };
const dryBall = R.launch(dry, 45, 70, 0), wetBall = R.launch(wet, 45, 70, 0);
R.advance(dry, dryBall, .2); R.advance(wet, wetBall, .2);
assert.ok(wetBall.vx < dryBall.vx && wetBall.x < dryBall.x, 'Rain changes physical drag, not only artwork');
const oldTrash = { x: 300, y: 150, radius: 25, resting: true, item: 'book' };
const blocked = R.launch(dry, 45, 70, 0);
Object.assign(blocked, { x: 270, y: 150, vx: 300, vy: 0 });
R.advance({ ...dry, qa: true }, blocked, .04, [oldTrash]);
assert.ok(blocked.blocked && blocked.vx < 0, 'Previously discarded trash blocks and rebounds a new shot');
assert.equal(oldTrash.x, 300, 'Settled debris is stable');
const leftover = R.launch(dry, 45, 70, 0);
Object.assign(leftover, { x: 250, y: 16, vx: 20, vy: -30 });
while (!leftover.result) R.advance(dry, leftover, 1 / 60);
for (let i = 0; i < 300 && !leftover.resting; i++) R.advance(dry, leftover, 1 / 60, [], true);
assert.ok(leftover.resting); assert.equal(leftover.y, leftover.radius, 'Missed trash settles and remains on the ground');
assert.ok(rounds.filter(s => s.rain).every(s => R.obstacles(s, 0).some(o => o.id === 'umbrella')));
assert.ok(R.obstacles(scene, 0).some(o => o.id === 'files' && o.y + o.height > 150), 'Realistic carried obstacles reach above head height');
const lab = { ...dry, qa: true, freeFlight: true, item: 'paper', grams: 8, wind: 30 };
assert.deepEqual(R.obstacles(lab, 100), [], 'QA removes birds and moving blockers');
const windTrace = R.traceFlight(lab, 45, 65), noWind = R.traceFlight({ ...lab, wind: 0 }, 45, 65);
assert.equal(windTrace.ball.result.kind, 'miss', 'Free-flight traces ignore bin scoring and collisions');
assert.ok(windTrace.ball.x - noWind.ball.x > 70, 'Paper has a measurable wind effect');
assert.equal(windTrace.seconds, noWind.seconds, 'Horizontal wind does not alter vertical flight time');
const heavy = { ...lab, item: 'book', grams: 280 };
assert.ok(R.traceFlight(heavy, 45, 65).ball.x - R.traceFlight({ ...heavy, wind: 0 }, 45, 65).ball.x < 4);
const physical = R.simulate(lab, 45, 65, 0);
assert.deepEqual(physical, windTrace.ball, 'QA traces execute the actual launch and physics');
assert.equal(R.acceleration(lab, windTrace.initial).wind, 81, 'Displayed wind acceleration uses actual mass and wind response');
const beyond = R.traceFlight(lab, 45, 100);
assert.ok(beyond.ball.x > R.WORLD.width, 'QA measures full ground range beyond the visible scene');
const withBins = { ...lab, wind: 0, freeFlight: false };
const direct = R.simulate(withBins, 45, 65, 0), traced = R.traceFlight(withBins, 45, 65, { freeFlight: false });
assert.deepEqual(traced.ball, direct, 'QA reference uses the same bin collision setting as the actual throw');
assert.deepEqual(R.binContents(scene, [{ x: bin.x, y: 8, radius: 8 }, { x: scene.bins[2].x, y: 12, radius: 12 }, { x: 300, y: 8, radius: 8 }]),
    { large: { count: 1, fill: 16 / scene.bins[0].height }, medium: { count: 0, fill: 0 }, small: { count: 1, fill: 24 / scene.bins[2].height } });
const score = points => ({ kind: points > 0 ? 'basket' : 'miss', points });
const cleaningScene = { ...scene, wind: 0, phase: -Math.PI / 2, cleaning: R.createCleaning() };
const pile = [20, 44, 68].map(y => ({ x: bin.x, y, radius: 12, item: 'book', grams: 280, resting: true, result: { kind: 'basket', points: 10 } }));
const otherBin = { x: scene.bins[2].x, y: 16, radius: 8, resting: true }, groundTrash = { x: 300, y: 8, radius: 8, resting: true };
R.advanceCleaning(cleaningScene, cleaningScene.cleaning, pile.map(b => ({ ...b, resting: false })), 0);
assert.equal(cleaningScene.cleaning.active, null, 'Airborne trash never dispatches cleaning');
R.advanceCleaning(cleaningScene, cleaningScene.cleaning, [...pile, otherBin, groundTrash], 0);
const job = cleaningScene.cleaning.active;
assert.ok(job && job.bin === 'large');
assert.equal(R.cleaner(cleaningScene, job.startAt - .01), null, 'A one-second warning precedes arrival');
assert.ok(R.obstacles(cleaningScene, job.arriveAt).some(b => b.id === 'cleaner'));
const cleanerHit = R.launch(cleaningScene, 45, 50, job.arriveAt);
Object.assign(cleanerHit, { x: R.cleaner(cleaningScene, job.arriveAt).x, y: 80, vx: 0, vy: 0 });
R.advance(cleaningScene, cleanerHit, 1 / 240);
assert.ok(cleanerHit.hits.includes('cleaner'), 'Cleaner contact uses the ordinary collision penalty');
Object.assign(cleanerHit, { x: bin.x, y: bin.height + cleanerHit.radius + 2, vx: 0, vy: -60 });
while (!cleanerHit.result) R.advance(cleaningScene, cleanerHit, 1 / 240);
assert.equal(cleanerHit.result.basketPoints, 10); assert.equal(cleanerHit.result.penalty, -5); assert.equal(cleanerHit.result.points, 5);
const storedScores = JSON.stringify(pile.map(b => b.result));
R.advanceCleaning(cleaningScene, cleaningScene.cleaning, [...pile, otherBin, groundTrash], job.clearAt);
assert.ok(pile.every(b => b.removed)); assert.ok(!otherBin.removed && !groundTrash.removed, 'Cleaning only removes the selected bin contents');
assert.equal(JSON.stringify(pile.map(b => b.result)), storedScores, 'Collection never revokes accepted points');
R.advanceCleaning(cleaningScene, cleaningScene.cleaning, pile, job.endAt);
assert.equal(cleaningScene.cleaning.active, null); assert.equal(R.cleaner(cleaningScene, job.endAt), null);
const construction = R.scenario({ scene: 'construction' }, 1, 42);
const allSceneItems = Object.values(R.SCENES).flatMap(s => s.items);
assert.equal(allSceneItems.length, 50); assert.equal(new Set(allSceneItems).size, 50, 'All four ten-item pools are disjoint');
assert.equal(Object.keys(R.ITEMS).length, 50);
for (const [name, layout] of Object.entries(R.SCENES)) {
    assert.equal(layout.launchScale, 1, name + ' uses the shared throwing multiplier');
    const cycle = Array.from({ length: 10 }, (_, i) => R.scenario({ scene: name }, i + 1, 42));
    assert.equal(layout.items.length, 10);
    assert.equal(new Set(cycle.map(s => s.item)).size, 10, name + ' visits all ten items before repeating');
    assert.ok(cycle.every(s => layout.items.includes(s.item)));
    if (!layout.outdoor) assert.ok(cycle.every(s => s.rain === 0), name + ' stays indoors');
    for (const mode of ['practice', 'cpu', 'local', 'online']) for (const seed of [0, 42, 0xffffffff]) for (let round = 1; round <= 10; round++) {
        const s = R.scenario({ scene: name, mode }, round, seed);
        assert.equal(s.grams, R.ITEMS[s.item].grams, name + '/' + mode + ' keeps every item weight stable across seeds and rounds');
    }
    const sameItem = { ...cycle[0], item: 'paper', grams: 8 };
    for (const angle of [15, 45, 80]) for (const power of [20, 60, 100]) {
        const actual = R.launch(sameItem, angle, power), expected = R.launch({ ...sameItem, scene: 'office', launchScale: 1 }, angle, power);
        assert.equal(actual.vx, expected.vx, name + ' has the same horizontal launch speed at the same inputs');
        assert.equal(actual.vy, expected.vy, name + ' has the same vertical launch speed at the same inputs');
    }
}
const living = R.scenario({ scene: 'living' }, 1, 42);
assert.equal(living.width, 720); assert.equal(R.launch(living, 45, 50, 0).y, 76);
for (const name of ['office', 'park', 'arena']) {
    assert.ok(living.width < R.SCENES[name].width && R.SCENES[name].width < construction.width, 'Short, medium and long scenes retain distinct field sizes');
}
for (const item of R.SCENES.living.items) for (const wind of [-10, 0, 10]) {
    const environment = { ...living, qa: true, item, grams: R.ITEMS[item].grams, wind, rain: 0 };
    const shots = findCleanThrows(environment, { maxPower: 75 });
    for (const target of living.bins) assert.ok(shots[target.id], item + ' reaches living-room ' + target.id + ' cleanly within 75 power, including fan airflow');
}
for (const [name, wind, rain] of [['office', -18, 0], ['park', -68, 0], ['park', -48, 1.6]]) for (const item of R.SCENES[name].items) {
    const environment = { ...R.scenario({ scene: name }, 1, 42), qa: true, item, grams: R.ITEMS[item].grams, wind, rain };
    const shots = findCleanThrows(environment);
    for (const target of environment.bins) assert.ok(shots[target.id], name + '/' + item + ' can reach moved ' + target.id + ' cleanly in adverse weather');
}
const leafStorm = { ...R.scenario({ scene: 'park' }, 1, 42), qa: true, item: 'leaf', grams: 6, wind: -48, rain: 1.6 };
const leafShot = R.simulate(leafStorm, 32, 100, 0);
assert.equal(leafShot.result.bin, 'small'); assert.equal(leafShot.rim, false);
assert.ok(findCleanThrows(leafStorm, { targets: ['small'], minPower: 100 }).small,
    'Reachability includes legal entry after the center advances horizontally below the initial approach height');
for (const id of ['baby', 'mother', 'parrot']) {
    const box = R.obstacles(living, 0).find(b => b.id === id), hit = R.launch(living, 45, 50, 0);
    Object.assign(hit, { x: box.x, y: box.y + box.height / 2, vx: 0, vy: 0 }); R.advance(living, hit, 1 / 240);
    assert.ok(hit.hits.includes(id), id + ' is a physical blocker');
}
assert.ok(R.obstacles(living, 1).find(b => b.id === 'parrot').y !== R.obstacles(living, 0).find(b => b.id === 'parrot').y);
for (const seed of [0, 7, 42]) {
    const room = R.scenario({ scene: 'living' }, 1, seed), travel = {};
    for (let time = 0; time <= 120; time += .25) {
        const boxes = R.obstacles(room, time);
        for (const box of boxes) {
            const definition = R.SCENES.living.actors.find(actor => actor.id === box.id);
            if (definition.minX != null) assert.ok(box.x >= definition.minX && box.x <= definition.maxX, 'Living-room actors stay inside their configured patrol range');
            const range = travel[box.id] ||= { min: Infinity, max: -Infinity };
            range.min = Math.min(range.min, box.x); range.max = Math.max(range.max, box.x);
        }
        const mother = boxes.find(b => b.id === 'mother');
        assert.equal(boxes.find(b => b.id === 'laundry').x, mother.x + 38 * mother.direction, 'The basket follows its carrier and facing through the extended route');
    }
    for (const id of ['mother', 'baby', 'parrot']) {
        const definition = R.SCENES.living.actors.find(actor => actor.id === id);
        assert.ok(travel[id].min < definition.minX + 1 && travel[id].max > definition.maxX - 1, id + ' covers its configured patrol range');
    }
}
assert.equal(construction.bins.length, 5);
for (let i = 1; i < construction.bins.length; i++) {
    assert.ok(construction.bins[i].width < construction.bins[i - 1].width);
    assert.ok(construction.bins[i].points > construction.bins[i - 1].points, 'Narrower barrels award more points');
}
assert.equal(R.fieldWidth(construction), 1440);
assert.ok(construction.bins.every(b => b.x - b.width / 2 > 96 && b.x + b.width / 2 < construction.width), 'Every construction barrel fits in the shorter map');
assert.equal(new Set(Array.from({ length: 10 }, (_, i) => R.scenario({ scene: 'construction' }, i + 1, 42).item)).size, 10);
assert.ok(R.obstacles(construction, 0).some(o => o.id === 'worker'));
for (let time = 0; time < 180; time++) for (const box of R.obstacles(construction, time)) {
    assert.ok(box.x - box.width / 2 >= 0 && box.x + box.width / 2 <= construction.width, 'Workers and carried objects remain inside the shorter map');
}
for (const item of R.SCENES.construction.items) {
    const lab = { ...construction, qa: true, item, grams: R.ITEMS[item].grams, wind: -68, rain: 1.6 };
    const shots = findCleanThrows(lab);
    // The two rear barrels are distance challenges; every item keeps three scoring choices.
    for (const target of lab.bins.slice(0, 3)) {
        assert.ok(shots[target.id], item + ' can reach ' + target.id + ' directly without a rim rebound in maximum headwind and heavy rain');
    }
}
for (const [wind, rain] of [[0, 0], [-68, 1.6]]) {
    const lab = { ...construction, qa: true, item: 'screwdriver', grams: R.ITEMS.screwdriver.grams, wind, rain };
    const shots = findCleanThrows(lab);
    for (const target of lab.bins) assert.ok(shots[target.id], 'Every spread-out construction barrel has a clean scoring throw, including the far 30-point barrel');
}
for (const name of ['office', 'park']) assert.equal(R.SCENES[name].bins.length, 3, 'Medium scenes have three targets');
const arena = { ...R.scenario({ scene: 'arena' }, 1, 42), qa: true, wind: 0, rain: 0 };
assert.equal(arena.bins.length, 12);
assert.deepEqual(arena.bins.slice(0, 8), [
    { id: 'large', x: 350, width: 96, height: 66, points: 5, metal: true },
    { id: 'shelf-15', x: 475, y: 100, width: 86, height: 68, points: 15, metal: true },
    { id: 'floor-10', x: 585, width: 90, height: 72, points: 10, metal: true },
    { id: 'high-35', x: 650, y: 220, width: 70, height: 70, points: 35, metal: true },
    { id: 'shelf-25', x: 735, y: 105, width: 74, height: 76, points: 25, metal: true },
    { id: 'floor-20', x: 820, width: 66, height: 84, points: 20, metal: true },
    { id: 'high-50', x: 850, y: 270, width: 60, height: 66, points: 50, metal: true },
    { id: 'small', x: 920, y: 145, width: 56, height: 70, points: 40, metal: true },
], 'The eight existing arena bins keep their positions, sizes and scores');
const newArenaBins = arena.bins.slice(8);
assert.ok(newArenaBins.every(bin => bin.x > 920 && bin.x + bin.width / 2 < arena.width), 'New arena targets extend the back of the field');
assert.ok(newArenaBins.some(bin => (bin.y || 0) + bin.height > 336), 'A rear target is higher than the original highest opening');
for (const item of ['receipt', 'bottlecap']) {
    const shots = findCleanThrows({ ...arena, item, grams: R.ITEMS[item].grams }, { targets: newArenaBins.map(bin => bin.id) });
    for (const target of newArenaBins) assert.ok(shots[target.id], item + ' reaches added ' + target.id + ' using actual charge frames without rim luck');
}
for (let i = 0; i < arena.bins.length; i++) for (let j = i + 1; j < arena.bins.length; j++) {
    const a = arena.bins[i], b = arena.bins[j];
    const overlapX = Math.abs(a.x - b.x) < (a.width + b.width) / 2;
    const overlapY = (a.y || 0) < (b.y || 0) + b.height && (b.y || 0) < (a.y || 0) + a.height;
    assert.ok(!overlapX || !overlapY, 'Arena bin bodies never overlap');
}
assert.ok(new Set(arena.bins.map(b => b.y || 0)).size >= 4, 'Arena has genuinely different physical levels');
for (const target of arena.bins) {
    const isolated = { ...arena, bins: [target], item: 'sneaker', grams: R.ITEMS.sneaker.grams };
    const drop = R.launch(isolated, 45, 50, 0), base = target.y || 0;
    Object.assign(drop, { x: target.x, y: base + target.height + drop.radius + 2, vx: 0, vy: -80 });
    while (!drop.result) R.advance(isolated, drop, 1 / 240);
    assert.equal(drop.result.bin, target.id); assert.ok(drop.y + drop.radius <= base + target.height);
    for (let i = 0; i < 150; i++) R.advance(isolated, drop, 1 / 60, [], true);
    assert.ok(Math.abs(drop.y - (base + R.WORLD.binFloor + drop.radius)) < .03, 'Raised bins support trash on their own floor within collision separation tolerance');
    assert.equal(R.binContents(isolated, [drop])[target.id].count, 1);
    if (base) {
        const under = R.launch(isolated, 45, 50, 0);
        Object.assign(under, { x: target.x, y: base - under.radius - 2, vx: 0, vy: 80 });
        R.advance(isolated, under, .1);
        assert.ok(under.y < base && under.vy < 0, 'Raised bin bottoms block upward entry without teleporting or scoring');
        assert.equal(under.result, null);
        assert.equal(R.binContents(isolated, [under])[target.id].count, 0, 'Trash below a raised bin is not counted inside it');
    }
}
for (const id of ['baby', 'parrot']) {
    const directions = new Set(Array.from({ length: 30 }, (_, i) => R.obstacles(living, i).find(o => o.id === id).direction));
    assert.deepEqual([...directions].sort(), [-1, 1], 'Household animals face both travel directions');
}
let match = R.createMatch({ mode: 'local', scene: 'park' }, 123);
const original = JSON.stringify(match);
const firstTurn = R.settle(match, score(25), { angle: 45, power: 70 });
assert.equal(JSON.stringify(match), original, 'Settlement does not mutate accepted state');
assert.equal(firstTurn.active, 1); assert.equal(firstTurn.round, 1);
match = R.settle(firstTurn, score(10), {});
assert.equal(match.active, 0); assert.equal(match.round, 2, 'Every round starts with A');
assert.deepEqual(R.scenario(match.config, 2, match.seed), R.scenario({ ...match.config, item: 'book' }, 2, match.seed), 'Competitive item choice cannot alter the shared round');
while (!match.over) match = R.settle(match, score(0), {});
assert.equal(match.round, 5); assert.equal(match.history.length, 10); assert.equal(match.winner, 0);
assert.deepEqual(match.history.map(entry => entry.player), [0, 1, 0, 1, 0, 1, 0, 1, 0, 1], 'All rounds keep AB order');
assert.equal(R.settle(match, score(25), {}), match, 'Finished matches cannot settle twice');
let tie = R.createMatch({ mode: 'cpu' }, 1);
for (let i = 0; i < 15; i++) { tie = R.settle(tie, score(0), {}); assert.equal(tie.over, false); }
tie = R.settle(tie, score(0), {});
assert.equal(tie.over, true); assert.equal(tie.winner, null); assert.equal(tie.round, 8);
let practice = R.createMatch({ mode: 'practice' }, 1);
for (let i = 0; i < 30; i++) practice = R.settle(practice, { kind: 'obstacle', points: -5 }, {});
assert.equal(practice.over, false); assert.equal(practice.scores[0], -150);
console.log('PASS: five exclusive ten-item pools, living-room blockers, five construction targets, collection lifecycle, deterministic physics, rim/ricochet scoring, QA collision modes and match rules.');
