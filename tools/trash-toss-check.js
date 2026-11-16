/* Real game rules: deterministic flight, collision, fair turns and bounded ties. */
'use strict';
const assert = require('node:assert/strict');
const R = require('../js/games/trash-toss-rules.js');
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
    assert.ok(s.grams >= R.ITEMS[s.item].grams * .8 && s.grams <= R.ITEMS[s.item].grams * 1.2);
    const bird = R.obstacles(s, 20).find(o => o.id === 'bird');
    assert.deepEqual(bird, R.obstacles(rounds[0], 20).find(o => o.id === 'bird'), 'Bird position depends only on session time');
}
assert.ok(new Set(Array.from({ length: 8 }, (_, i) => R.scenario({ mode: 'practice', item: 'paper' }, i + 1, 42).grams)).size > 1, 'Even a fixed practice type varies in weight');
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
    { large: { count: 1, fill: 16 / 82 }, medium: { count: 0, fill: 0 }, small: { count: 1, fill: 24 / 110 } });
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
    const cycle = Array.from({ length: 10 }, (_, i) => R.scenario({ scene: name }, i + 1, 42));
    assert.equal(layout.items.length, 10);
    assert.equal(new Set(cycle.map(s => s.item)).size, 10, name + ' visits all ten items before repeating');
    assert.ok(cycle.every(s => layout.items.includes(s.item)));
    if (!layout.outdoor) assert.ok(cycle.every(s => s.rain === 0), name + ' stays indoors');
}
const living = R.scenario({ scene: 'living' }, 1, 42);
assert.equal(living.width, 600); assert.equal(R.launch(living, 45, 50, 0).y, 76);
for (const id of ['baby', 'mother', 'parrot']) {
    const box = R.obstacles(living, 0).find(b => b.id === id), hit = R.launch(living, 45, 50, 0);
    Object.assign(hit, { x: box.x, y: box.y + box.height / 2, vx: 0, vy: 0 }); R.advance(living, hit, 1 / 240);
    assert.ok(hit.hits.includes(id), id + ' is a physical blocker');
}
assert.ok(R.obstacles(living, 1).find(b => b.id === 'parrot').y !== R.obstacles(living, 0).find(b => b.id === 'parrot').y);
assert.equal(construction.bins.length, 5);
for (let i = 1; i < construction.bins.length; i++) {
    assert.ok(construction.bins[i].width < construction.bins[i - 1].width);
    assert.ok(construction.bins[i].points > construction.bins[i - 1].points, 'Narrower barrels award more points');
}
assert.equal(R.fieldWidth(construction), 2400);
assert.equal(new Set(Array.from({ length: 10 }, (_, i) => R.scenario({ scene: 'construction' }, i + 1, 42).item)).size, 10);
assert.ok(R.obstacles(construction, 0).some(o => o.id === 'worker'));
for (const item of R.SCENES.construction.items) {
    const lab = { ...construction, qa: true, item, grams: R.ITEMS[item].grams * 1.15, wind: -60, rain: 1.6 };
    for (const target of lab.bins) {
        let reachable = false;
        for (let angle = 24; angle <= 66 && !reachable; angle += 2) for (let power = 50; power <= 100; power++) {
            if (R.simulate(lab, angle, power, 0).result.bin === target.id) { reachable = true; break; }
        }
        assert.ok(reachable, item + ' can reach ' + target.id + ' even at maximum round weight in strong headwind and rain');
    }
}
for (const name of ['office', 'park']) assert.equal(R.SCENES[name].bins.length, 3, 'Medium scenes have three targets');
const arena = { ...R.scenario({ scene: 'arena' }, 1, 42), qa: true, wind: 0, rain: 0 };
assert.equal(arena.bins.length, 8);
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
