/* Verify facing against actual movement, carried collision boxes and cleaner round trips. */
'use strict';
const assert = require('node:assert/strict');
const R = require('../js/games/trash-toss-rules.js');
const actors = new Set(['mother', 'baby', 'parrot', 'boss', 'walker', 'worker', 'worker-far', 'bird']);
const seen = new Map();
const carried = { laundry: ['mother', 38], files: ['boss', 26], cart: ['walker', 28], planks: ['worker', 26], wheelbarrow: ['worker-far', 38] };
let maximumBabySpeed = 0;
for (const name of Object.keys(R.SCENES)) for (const seed of [0, 7, 42]) {
    const scene = R.scenario({ scene: name }, 1, seed);
    for (let time = 0; time <= 120; time += .25) {
        const boxes = R.obstacles(scene, time);
        const previous = R.obstacles(scene, time - .001), next = R.obstacles(scene, time + .001);
        for (const box of boxes) {
            if (carried[box.id]) {
                const [ownerId, offset] = carried[box.id], owner = boxes.find(b => b.id === ownerId);
                assert.equal(box.direction, owner.direction, box.id + ' faces with its carrier');
                assert.equal(box.x, owner.x + offset * owner.direction, box.id + ' collision box stays on the carried side');
            }
            if (!actors.has(box.id)) continue;
            const definition = R.SCENES[name].actors.find(actor => actor.id === box.id);
            if (definition.minX != null) assert.ok(box.x >= definition.minX - 1e-9 && box.x <= definition.maxX + 1e-9, box.id + ' stays inside its configured patrol range');
            assert.ok(box.direction === -1 || box.direction === 1, box.id + ' has a facing');
            const before = previous.find(b => b.id === box.id), after = next.find(b => b.id === box.id);
            if (!before || !after) continue;
            const speed = (after.x - before.x) / .002;
            // Ignore turnaround instants and the bird's off-screen restart.
            if (Math.abs(speed) > .01 && Math.abs(speed) < 1000) {
                assert.equal(box.direction, Math.sign(speed), name + '/' + box.id + ' faces its actual travel direction');
                if (!seen.has(box.id)) seen.set(box.id, new Set());
                seen.get(box.id).add(box.direction);
            }
            if (box.id === 'baby') {
                maximumBabySpeed = Math.max(maximumBabySpeed, Math.abs(speed));
            }
        }
    }
}
for (const id of actors) assert.deepEqual([...seen.get(id)].sort(), id === 'bird' ? [-1] : [-1, 1], id + ' faces every direction used on its route');
const baby = R.SCENES.living.actors.find(actor => actor.id === 'baby');
assert.ok(Math.abs(maximumBabySpeed - (baby.maxX - baby.minX) / 2 * baby.speed) < .01, 'Observed baby speed matches its editable patrol settings');

// Editing the scene settings must update movement, facing, geometry and carried objects together.
const mother = R.SCENES.living.actors.find(actor => actor.id === 'mother'), original = { ...mother };
try {
    Object.assign(mother, { minX: 200, maxX: 500, speed: .4, y: 20, width: 44, height: 120 });
    const scene = { ...R.scenario({ scene: 'living' }, 1, 42), phase: 0 };
    for (const [time, expectedX] of [[0, 350], [Math.PI / .8, 500], [3 * Math.PI / .8, 200]]) {
        const box = R.obstacles(scene, time).find(actor => actor.id === 'mother');
        assert.ok(Math.abs(box.x - expectedX) < 1e-9, 'Patrol endpoints and speed come from the scene configuration');
        assert.deepEqual([box.y, box.width, box.height], [20, 44, 120]);
    }
    const turnaround = Math.PI / .8;
    for (const [time, direction] of [[turnaround - .01, 1], [turnaround + .01, -1]]) {
        const boxes = R.obstacles(scene, time), carrier = boxes.find(actor => actor.id === 'mother');
        assert.equal(carrier.direction, direction, 'Changing speed also updates the turnaround time');
        assert.equal(boxes.find(actor => actor.id === 'laundry').x, carrier.x + 38 * direction);
    }
} finally { Object.assign(mother, original); }

let cleanerTrips = 0;
for (const name of Object.keys(R.SCENES)) {
    const scene = { ...R.scenario({ scene: name }, 1, 42), cleaning: R.createCleaning() };
    for (const bin of [scene.bins[0], scene.bins[scene.bins.length - 1]]) {
        scene.cleaning = R.createCleaning();
        const pile = Array.from({ length: 10 }, (_, i) => ({ x: bin.x, y: (bin.y || 0) + 12, radius: 8, item: 'paper', resting: true }));
        R.advanceCleaning(scene, scene.cleaning, pile, 0);
        const job = scene.cleaning.active;
        assert.ok(job, 'A full bin dispatches a cleaner');
        const inbound = R.cleaner(scene, job.startAt + job.travel / 2);
        const working = R.cleaner(scene, (job.arriveAt + job.clearAt) / 2);
        const outbound = R.cleaner(scene, job.leaveAt + job.travel / 2);
        assert.equal(inbound.direction, Math.sign(job.to - job.from), 'Cleaner faces along the approach');
        assert.equal(working.direction, Math.sign(bin.x - working.x), 'Cleaner faces the bin while working');
        assert.equal(outbound.direction, -inbound.direction, 'Cleaner turns around for the return trip');
        assert.ok(working.working && outbound.carrying);
        cleanerTrips++;
    }
}
console.log('PASS: all scenes, three seeds, 120-second actor facing traces, carried collision boxes, ' + cleanerTrips + ' cleaner round trips and slower baby speed/range.');
