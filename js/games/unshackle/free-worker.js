/* Generation is CPU work; keep input and progress painting on the main thread. */
importScripts('engine.js?v=relay-interlocks-10', '../../generators/unshackle.js?v=relay-interlocks-10', 'free.js?v=relay-interlocks-10');
self.onmessage = async ({ data: { size, difficulty, seed, version = 6 } }) => {
    try {
        const generate = version >= 6 ? UnshackleFree.generate : UnshackleFree.generateLegacy;
        const puzzle = await generate(size, difficulty, seed, fraction => self.postMessage({ fraction }));
        const { model, ...result } = puzzle;
        self.postMessage({ result });
    } catch (error) { self.postMessage({ error: error.message }); }
};
