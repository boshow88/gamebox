/* Background CPU planning. The same file is a classic worker entry and its client. */
(function (root) {
    'use strict';
    if (typeof importScripts === 'function') {
        importScripts('rules.js');
        root.onmessage = event => {
            const { id, args } = event.data;
            root.postMessage({ id, plan: root.TrashTossRules.cpuPlan(...args) });
        };
        return;
    }
    const workerUrl = root.document && root.document.currentScript && root.document.currentScript.src;
    function create(options = {}) {
        const R = options.rules || root.TrashTossRules;
        const schedule = options.schedule || root.setTimeout.bind(root);
        const clear = options.clear || root.clearTimeout.bind(root);
        const now = options.now || (() => root.performance.now());
        const Worker = options.Worker === undefined ? root.Worker : options.Worker;
        let worker = null, workerFailed = false, task = null, timer = null, serial = 0;
        function stopWorker() { if (worker) worker.terminate(); worker = null; }
        function cancel() {
            if (timer !== null) clear(timer);
            timer = null;
            if (task) stopWorker();
            task = null;
        }
        function finish(current, plan) {
            if (task !== current) return;
            task = null; timer = null; current.done(plan);
        }
        function fallback(current) {
            const steps = R.cpuPlanSteps(...current.args);
            function slice() {
                timer = null;
                if (task !== current) return;
                const start = now();
                // Bound both wall time and work count, including coarse clocks.
                for (let i = 0; i < 8; i++) {
                    const next = steps.next();
                    if (next.done) { finish(current, next.value); return; }
                    if (now() - start >= 4) break;
                }
                timer = schedule(slice, 0);
            }
            timer = schedule(slice, 0);
        }
        function plan(scene, difficulty, seed, worldTime, debris, done) {
            cancel();
            // Fallback must use the same frozen world as structured worker messages.
            const current = task = { id: ++serial, args: JSON.parse(JSON.stringify([scene, difficulty, seed, worldTime, debris])), done };
            if (Worker && (options.workerUrl || workerUrl) && !workerFailed) {
                try {
                    if (!worker) {
                        const activeWorker = worker = new Worker(options.workerUrl || workerUrl);
                        activeWorker.onmessage = event => {
                            if (worker !== activeWorker) return;
                            if (task && event.data.id === task.id) finish(task, event.data.plan);
                        };
                        activeWorker.onerror = event => {
                            if (event.preventDefault) event.preventDefault();
                            if (worker !== activeWorker) return;
                            workerFailed = true; stopWorker();
                            if (task) fallback(task);
                        };
                    }
                    worker.postMessage({ id: current.id, args: current.args });
                    return;
                } catch (_) { workerFailed = true; stopWorker(); }
            }
            fallback(current);
        }
        return { plan, cancel, destroy() { cancel(); stopWorker(); } };
    }
    if (typeof module === 'object' && module.exports) module.exports = { create };
    else root.TrashTossCPU = { create };
})(typeof window === 'object' ? window : globalThis);
