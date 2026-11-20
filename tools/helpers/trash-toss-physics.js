// Find real, clean baskets using the angle steps and 60 Hz charge values available to players.
'use strict';
const R = require('../../js/games/trash-toss-rules.js');
function findCleanThrows(scene, options = {}) {
    const targets = scene.bins.filter(bin => !options.targets || options.targets.includes(bin.id));
    const missing = new Set(targets.map(bin => bin.id)), found = {};
    const angles = Array.from({ length: 66 }, (_, i) => i + 15).sort((a, b) => Math.abs(a - 45) - Math.abs(b - 45));
    const powers = Array.from({ length: 78 }, (_, i) => ({ frames: i + 1, power: R.chargePower((i + 1) / 60) }))
        .filter(input => input.power >= (options.minPower || 0) && input.power <= (options.maxPower || 100) + 1e-8);
    const radius = R.ITEMS[scene.item].radius;
    for (const angle of angles) for (const input of powers) {
        if (!missing.size) return found;
        // Use the actual free-flight simulator to reject obvious misses before testing all bin collisions.
        const points = R.traceFlight(scene, angle, input.power).points;
        for (const bin of targets) {
            if (!missing.has(bin.id)) continue;
            const level = (bin.y || 0) + bin.height + radius;
            const i = points.findIndex((p, i) => i && points[i - 1].y >= level && p.y < level);
            if (i < 0) continue;
            const p = points[i - 1], q = points[i];
            const x = p.x + (q.x - p.x) * (p.y - level) / (p.y - q.y);
            if (Math.abs(x - bin.x) > bin.width / 2 - 6 - radius + .5) continue;
            const shot = R.simulate(scene, angle, input.power, 0);
            if (shot.result.bin !== bin.id || shot.rim || shot.hits.length) continue;
            found[bin.id] = { angle, power: input.power, frames: input.frames };
            missing.delete(bin.id);
        }
    }
    return found;
}
module.exports = { findCleanThrows };
