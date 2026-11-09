/** Run with `node tools/unshackle-benchmark.js [source-root] [samples]`.
 * Compare JSONL timings and hashes from the same machine and Node version.
 * The optional source root lets a saved checkout serve as the baseline.
 */
'use strict';
const path = require('node:path'), { createHash } = require('node:crypto');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const samples = Number(process.argv[3] || 2);
if (!Number.isInteger(samples) || samples < 1) throw new Error('Samples must be a positive integer');
require(path.join(root, 'js/games/unshackle/engine.js'));
require(path.join(root, 'js/generators/unshackle.js'));
require(path.join(root, 'js/games/unshackle/free.js'));
(async () => {
    for (const mode of ['match', 'free']) for (const size of [36, 48]) for (let seed = 0; seed < samples; seed++) {
        const started = performance.now();
        const generator = mode === 'match' ? globalThis.PuzzleGenerators.unshackleMatch : globalThis.UnshackleFree;
        const { model, ...puzzle } = await generator.generate(size, 'hard', seed);
        console.log(JSON.stringify({ mode, size, seed, ms: Math.round(performance.now() - started),
            hash: createHash('sha256').update(JSON.stringify(puzzle)).digest('hex'),
            stats: puzzle.matchStats || puzzle.stats }));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
