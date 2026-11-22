// Find real, clean baskets using the angle steps and 60 Hz charge values available to players.
'use strict';
const R = require('../../../js/games/trash-toss/rules.js');
function findCleanThrows(scene, options = {}) {
    const targets = scene.bins.filter(bin => !options.targets || options.targets.includes(bin.id));
    const missing = new Set(targets.map(bin => bin.id)), found = {};
    const angles = Array.from({ length: 66 }, (_, i) => i + 15).sort((a, b) => Math.abs(a - 45) - Math.abs(b - 45));
    const powers = Array.from({ length: 78 }, (_, i) => ({ frames: i + 1, power: R.chargePower((i + 1) / 60) }))
        .filter(input => input.power >= (options.minPower || 0) && input.power <= (options.maxPower || 100) + 1e-8);
    for (const angle of angles) for (const input of powers) {
        if (!missing.size) return found;
        // Judge the full scene once. A center can still move into the aperture
        // between first approaching the rim and the whole object entering it.
        const shot = R.simulate(scene, angle, input.power, 0);
        if (!missing.has(shot.result.bin) || shot.rim || shot.hits.length) continue;
        found[shot.result.bin] = { angle, power: input.power, frames: input.frames };
        missing.delete(shot.result.bin);
    }
    return found;
}
module.exports = { findCleanThrows };
