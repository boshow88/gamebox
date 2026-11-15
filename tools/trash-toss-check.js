/* Real game rules: deterministic flight, collision, fair turns and bounded ties. */
'use strict';
const assert = require('node:assert/strict');
const R = require('../js/games/trash-toss-rules.js');
const scene = R.scenario({ mode: 'practice', scene: 'office', item: 'paper' }, 1, 42);
const bin = scene.bins[0];
function drop(x, item = 'paper', vy = -60) {
    const s = { ...scene, item, grams: R.ITEMS[item].grams }, ball = R.launch(s, 45, 50, 0);
    Object.assign(ball, { x, y: bin.height + ball.radius + 2, vx: 0, vy });
    R.advance(s, ball, 0.1); return ball;
}
assert.equal(drop(bin.x).result.kind, 'basket');
assert.equal(drop(bin.x).result.points, 10);
assert.equal(drop(bin.x, 'paper', 80).result, null, 'Rising through rim height does not score');
assert.equal(drop(bin.x + 33, 'paper').result.kind, 'basket');
assert.notEqual(drop(bin.x + 33, 'book').result?.kind, 'basket', 'The whole object must fit');
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
const birdScene = { ...R.scenario({ scene: 'park' }, 1, 1), wind: 0, rain: 0 };
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
const rounds = Array.from({ length: 8 }, (_, i) => R.scenario({ mode: 'cpu', scene: 'park' }, i + 1, 42));
const heights = [], sightings = [];
for (let t = 0; t < 72; t += .1) {
    const b = R.obstacles(birdScene, t).find(o => o.id === 'bird'); sightings.push(!!b); if (b) heights.push(b.y);
}
assert.ok(sightings.filter(Boolean).length < sightings.length / 2, 'Bird leaves quiet intervals between passes');
assert.ok(Math.max(...heights) - Math.min(...heights) > 200, 'Bird alternates high and low flight');
assert.equal(new Set(rounds.map(s => s.item)).size, 8, 'All eight items rotate before repetition');
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
assert.deepEqual(R.binContents(scene, [{ x: 620, y: 8, radius: 8 }, { x: 824, y: 12, radius: 12 }, { x: 300, y: 8, radius: 8 }]),
    { large: { count: 1, fill: 16 / 82 }, small: { count: 1, fill: 24 / 110 } });
const score = points => ({ kind: points > 0 ? 'basket' : 'miss', points });
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
console.log('PASS: deterministic physics, ricochet scoring, full-bin bounce-out credit, rim-rest timing, bin floor, occasional high/low birds, QA collision modes, fixed AB order and match rules.');
