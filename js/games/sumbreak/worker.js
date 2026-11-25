/* Sumbreak generation off the main thread, so the page can make the next puzzle while one is
 * played. Same generator as the page and Node: a (difficulty, seed) pair gives one puzzle. */
importScripts('rules.js', 'solver.js', 'reasoning.js', '../../generators/sumbreak.js');
self.onmessage = async ({ data: { difficulty, seed } }) => {
    try {
        const puzzle = await self.PuzzleGenerators.sumbreak(difficulty, seed, (fraction) => { self.postMessage({ fraction }); });
        self.postMessage({ puzzle });
    } catch (error) { self.postMessage({ error: error.message }); }
};
