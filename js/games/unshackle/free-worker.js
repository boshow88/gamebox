/* Generation is CPU work; keep input and progress painting on the main thread. */
importScripts('engine.js?v=touch-material-11', '../../generators/unshackle.js?v=touch-material-11', 'free.js?v=touch-material-11');
self.onmessage = async ({ data: { size, difficulty, seed, version = 6 } }) => {
    try {
        const generate = version >= 6 ? UnshackleFree.generate : UnshackleFree.generateLegacy;
        const puzzle = await generate(size, difficulty, seed, fraction => self.postMessage({ fraction }));
        const { model, ...result } = puzzle;
        self.postMessage({ result });
    } catch (error) { self.postMessage({ error: error.message }); }
};
