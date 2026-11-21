/* Actual worker entry on a separate thread, plus cooperative fallback lifecycle. */
'use strict';
const assert = require('node:assert/strict');
const { Worker: Thread } = require('node:worker_threads');
const R = require('../js/games/trash-toss-rules.js');
const CPU = require('../js/games/trash-toss-cpu.js');
const entry = require.resolve('../js/games/trash-toss-cpu.js');
class Worker {
    constructor() {
        this.thread = new Thread(`
            const {parentPort}=require('node:worker_threads');
            global.importScripts=()=>{ global.TrashTossRules=require(${JSON.stringify(require.resolve('../js/games/trash-toss-rules.js'))}); };
            global.postMessage=data=>parentPort.postMessage(data);
            require(${JSON.stringify(entry)});
            parentPort.on('message',data=>global.onmessage({data}));
        `, { eval: true });
        this.thread.on('message', data => this.onmessage && this.onmessage({ data }));
        this.thread.on('error', error => this.onerror && this.onerror(error));
    }
    postMessage(data) { this.thread.postMessage(data); }
    terminate() { this.thread.terminate(); }
}
const args = [R.scenario({ scene: 'construction' }, 1, 42), 'hard', 42, 0, []];
const expected = R.cpuPlan(...args);
(async () => {
    const background = CPU.create({ rules: R, Worker, workerUrl: entry });
    try {
        let pulses = 0;
        const heartbeat = setInterval(() => pulses++, 1);
        let result;
        try { result = await new Promise(resolve => background.plan(...args, resolve)); }
        finally { clearInterval(heartbeat); }
        assert.deepEqual(result, expected, 'Worker uses exactly the canonical deterministic strategy');
        assert.ok(pulses > 0, 'Main-thread timers run while the worker plans');
        let stale = false;
        background.plan(...args, () => { stale = true; });
        background.cancel();
        assert.deepEqual(await new Promise(resolve => background.plan(...args, resolve)), expected);
        assert.equal(stale, false, 'Cancelled turns cannot deliver plans into the next turn');
    } finally { background.destroy(); }

    function checkFallback(Worker) {
        let serial = 0, calls = 0;
        const queue = new Map();
        const fallback = CPU.create({ rules: R, Worker, workerUrl: entry, now: () => 0,
            schedule(fn) { queue.set(++serial, fn); return serial; }, clear(id) { queue.delete(id); } });
        try {
            const mutable = structuredClone(args);
            let result;
            fallback.plan(...mutable, value => { result = value; calls++; });
            assert.equal(result, undefined, 'Fallback returns control before doing the search');
            mutable[0].wind = 100; mutable[4].push({ broken: true });
            let slices = 0;
            while (queue.size) {
                const [id, run] = queue.entries().next().value; queue.delete(id); run(); slices++;
                assert.ok(slices < 100, 'Fallback completes within its bounded candidate count');
            }
            assert.ok(slices > 1, 'Fallback divides planning across separate tasks');
            assert.deepEqual(result, expected, 'Fallback searches the captured world without live-state mutation');
            fallback.plan(...args, () => calls++); fallback.cancel();
            assert.equal(queue.size, 0); assert.equal(calls, 1);
        } finally { fallback.destroy(); }
    }
    checkFallback(null);
    checkFallback(class { constructor() { throw Error('Worker unavailable'); } });
    const instances = [];
    class ControlledWorker {
        constructor() { instances.push(this); }
        postMessage(message) { this.message = message; }
        terminate() { this.stopped = true; }
    }
    let staleCalls = 0, currentResult;
    const recover = CPU.create({ rules: R, Worker: ControlledWorker, workerUrl: entry });
    try {
        recover.plan(...args, () => staleCalls++); recover.cancel();
        recover.plan(...args, value => { currentResult = value; });
        instances[0].onerror({ preventDefault() {} });
        instances[0].onmessage({ data: { id: instances[0].message.id, plan: expected } });
        assert.equal(instances[1].stopped, undefined, 'Queued errors from a cancelled worker do not terminate its replacement');
        instances[1].onmessage({ data: { id: instances[1].message.id, plan: expected } });
        assert.deepEqual(currentResult, expected); assert.equal(staleCalls, 0);
        const recovered = new Promise(resolve => recover.plan(...args, resolve));
        instances[1].onerror({ preventDefault() {} });
        assert.deepEqual(await recovered, expected, 'A worker loading/runtime error resumes the same job through cooperative fallback');
    } finally { recover.destroy(); }
    console.log('PASS: deterministic worker planning, responsive main thread, cancellation, stale worker events, creation/loading failure and bounded fallback over an isolated world snapshot.');
})().catch(error => { console.error(error); process.exitCode = 1; });
