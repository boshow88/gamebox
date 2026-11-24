/* Fuse developer profiling: time each part of the difficulty evaluation on larger boards.
 * Usage: node tools/fuse/profile.js [samples=20] [size=4] [exponents=5,6,7,8] */
'use strict';
const Rules = require('../../js/games/fuse/rules.js');
const Solver = require('../../js/games/fuse/solver.js');
const Reasoning = require('../../js/games/fuse/reasoning.js');
const Gen = require('../../js/generators/fuse.js');

const R = Rules.DEFAULT;
const [samples = 20, size = 4] = process.argv.slice(2, 4).map(Number);
const exponents = (process.argv[4] || '5,6,7,8').split(',').map(Number);
const rng = Gen.makeRng(4242), styles = Object.keys(Gen.STYLES);
const total = {};
const time = (k, fn) => { const t = Date.now(); const v = fn(); total[k] = (total[k] || 0) + Date.now() - t; return v; };
const byStyle = {};
for (let i = 0; i < samples; i++) {
    const exponent = exponents[Math.floor(rng() * exponents.length)];
    const style = styles[Math.floor(rng() * styles.length)];
    const built = Gen.reverseBuild(rng, size, size, exponent, style);
    if (!built) continue;
    const solver = Solver.createSolver(R);
    time('analyze', () => solver.analyze(built.board));
    const casual = time('casualWin', () => Reasoning.casualWin(R, built.board, solver, 2));
    let b = built.board, maxLevel = 0, search = 0;
    time('path', () => {
        while (R.status(b) === 'playing') {
            const step = Reasoning.nextStep(R, b, { solver });
            if (!step.move) break;
            maxLevel = Math.max(maxLevel, step.level);
            if (step.level >= Reasoning.SEARCH) search++;
            b = R.applyMerge(b, step.move);
        }
    });
    time('countPlans', () => solver.countPlans(built.board, 50));
    time('randomPlayWin', () => solver.randomPlayWin(built.board));
    (byStyle[style] = byStyle[style] || []).push(`${Math.round(100 * casual)}%${search ? 's' : 'L' + maxLevel}`);
}
console.log('ms per part', JSON.stringify(total));
console.log('casual win by style', JSON.stringify(byStyle));
