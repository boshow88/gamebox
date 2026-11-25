/* Fuse developer calibration: how hard each board shape is, and what the generator delivers.
 * Usage: node tools/fuse/calibrate.js [samples=60] [seeds per tier=20] [--skip-shapes] [--skip-generate] [--cost] [--combos]
 *   shapes    random reverse-built boards per shape and ×2 tile count (as the generator draws
 *             them): how many are solvable by reasoning alone, their waste (merges made and
 *             undone by trial and error, Reasoning.trialMerges), the first-try win chance
 *             (Reasoning.firstTryWin) of those wasteful enough for Medium or Hard, and each
 *             tier's hit rate
 *   cost      `samples` hard 4×4 candidates: the most solver states one step along the
 *             reasoning path needs (one hint's cost), to set the generator's SEARCH_BUDGET
 *   combos    `samples` 4×4 boards per exponent, style and ×2 count: how often each yields a
 *             hard puzzle and the generator time per hit
 *   generate  the real generator per tier: time per puzzle, attempts, curated fallbacks, the
 *             shapes served, waste and first-try win chance */
'use strict';
const Rules = require('../../js/games/fuse/rules.js');
const Solver = require('../../js/games/fuse/solver.js');
const Reasoning = require('../../js/games/fuse/reasoning.js');
const Gen = require('../../js/generators/fuse.js');

const R = Rules.DEFAULT;
const [samples = 60, seeds = 20] = process.argv.slice(2).filter((a) => !a.startsWith('--')).map(Number);
const q = (xs, f) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
const spread = (xs) => [0.1, 0.5, 0.75, 0.9].map((f) => Math.round(q(xs, f))).join('/');
const pct = (x) => Math.round(100 * x);
const inWaste = (waste, tier) => waste >= Gen.DIFFICULTY[tier].min && waste <= Gen.DIFFICULTY[tier].max;
const needsFirstTry = (waste) => Gen.TIERS.some((tier) => Gen.DIFFICULTY[tier].firstTry && inWaste(waste, tier));
// Whether a board with this waste and first-try chance (in %) qualifies for `tier`.
function fits({ waste, firstTry }, tier) {
    const range = Gen.DIFFICULTY[tier].firstTry;
    return inWaste(waste, tier) && (!range || (firstTry >= range.min && firstTry <= range.max));
}
const firstTry = (board) => 100 * Reasoning.firstTryWin(R, board, Solver.createSolver(R));
const mulTag = (n) => (n ? ' x2×' + n : '     ');

if (!process.argv.includes('--skip-shapes')) {
    const kinds = [[3, 3, 0], [3, 4, 0], [4, 4, 0], [4, 4, 1], [4, 4, 2]];
    console.log(`waste among boards solvable by reasoning: p10/p50/p75/p90; hit = share of all boards each tier accepts`);
    for (const [rows, cols, muls] of kinds) {
        const rng = Gen.makeRng(rows * 100 + cols * 10 + muls), styles = Object.keys(Gen.STYLES), exps = Gen.EXPONENTS[rows * cols];
        const rowsOut = [], seen = new Set(), ms = { trial: 0, path: 0, first: 0 };
        for (let tries = 0; rowsOut.length < samples && tries < samples * 20; tries++) {
            const built = Gen.reverseBuild(rng, rows, cols, exps[Math.floor(rng() * exps.length)] + muls, styles[Math.floor(rng() * styles.length)], muls);
            if (!built || seen.has(R.key(built.board))) continue;
            seen.add(R.key(built.board));
            let t = Date.now();
            const waste = Reasoning.trialMerges(R, built.board, 20000) - (R.tileCount(built.board) - 1);
            ms.trial += Date.now() - t; t = Date.now();
            const reason = Reasoning.humanPath(R, built.board, { stopAtSearch: true }).complete;
            ms.path += Date.now() - t; t = Date.now();
            const chance = reason && needsFirstTry(waste) ? firstTry(built.board) : null;
            ms.first += Date.now() - t;
            rowsOut.push({ waste, reason, firstTry: chance });
        }
        const ok = rowsOut.filter((r) => r.reason), chances = ok.filter((r) => r.firstTry != null).map((r) => r.firstTry);
        const hits = Gen.TIERS.map((tier) => `${tier} ${pct(ok.filter((r) => fits(r, tier)).length / rowsOut.length)}%`).join(', ');
        const each = (k) => Math.round(ms[k] / rowsOut.length);
        console.log(`${rows}×${cols}${mulTag(muls)} n ${rowsOut.length} | reason ${pct(ok.length / rowsOut.length)}% | waste ${spread(ok.map((r) => r.waste))} | first-try% ${chances.length ? spread(chances) : '-'} (${chances.length}) | hit ${hits} | ms per board: trial ${each('trial')}, path ${each('path')}, first-try ${each('first')}`);
    }
}

// Exact-search cost of hard candidates (`--cost`): the most solver states one step along the
// reasoning path needs, which is also what one hint costs in the game.
if (process.argv.includes('--cost')) {
    const rng = Gen.makeRng(4242), styles = Object.keys(Gen.STYLES), hard = Gen.DIFFICULTY.hard, rowsOut = [];
    for (let tries = 0; rowsOut.length < samples && tries < samples * 200; tries++) {
        const muls = rng() < 0.5 ? 0 : 1 + Math.floor(rng() * 2), exps = Gen.EXPONENTS[16];
        const built = Gen.reverseBuild(rng, 4, 4, exps[Math.floor(rng() * exps.length)] + muls, styles[Math.floor(rng() * styles.length)], muls);
        if (!built) continue;
        const minimum = R.tileCount(built.board) - 1;
        if (Reasoning.trialMerges(R, built.board, minimum + hard.min) - minimum < hard.min) continue;
        const solver = Solver.createSolver(R), t = Date.now();
        let peak = 0, peakMs = 0, b = built.board;
        while (R.status(b) === 'playing') {
            const before = solver.stats().explored, t0 = Date.now();
            const step = Reasoning.nextStep(R, b, { solver, searchMoves: false });
            peak = Math.max(peak, solver.stats().explored - before); peakMs = Math.max(peakMs, Date.now() - t0);
            if (step.technique === 'search' || !step.move) break;
            b = R.applyMerge(b, step.move);
        }
        rowsOut.push({ complete: R.status(b) === 'won', peak, peakMs, ms: Date.now() - t });
    }
    const ok = rowsOut.filter((r) => r.complete), bad = rowsOut.filter((r) => !r.complete);
    console.log(`hard candidates ${rowsOut.length}, reason-solvable ${ok.length}`);
    console.log(`  peak states p10/p50/p75/p90: solvable ${spread(ok.map((r) => r.peak))}, rejected ${spread(bad.map((r) => r.peak))}`);
    console.log(`  peak step ms: solvable ${spread(ok.map((r) => r.peakMs))}, worst ${Math.max(...rowsOut.map((r) => r.peakMs))}; path ms worst ${Math.max(...rowsOut.map((r) => r.ms))}`);
    console.log(`  most states for a solvable board ${Math.max(...ok.map((r) => r.peak))}`);
    for (const budget of [2000, 3000, 5000, 10000]) {
        const kept = ok.filter((r) => r.peak <= budget).length;
        console.log(`  budget ${budget}: keeps ${kept}/${ok.length} solvable (${pct(kept / ok.length)}%), slowest kept step ${Math.max(0, ...ok.filter((r) => r.peak <= budget).map((r) => r.peakMs))} ms`);
    }
}

// Hard-tier yield per construction choice (`--combos`): `samples` 4×4 boards per exponent,
// style and ×2 count, each judged exactly as the generator does.
if (process.argv.includes('--combos')) {
    const rng = Gen.makeRng(777), out = [];
    for (const e of Gen.EXPONENTS[16]) {
        for (const style of Object.keys(Gen.STYLES)) {
            for (const [muls] of Gen.MULS[16]) {
                let ms = 0, hits = 0, n = 0;
                for (let k = 0; k < samples; k++) {
                    const built = Gen.reverseBuild(rng, 4, 4, e + muls, style, muls);
                    if (!built) continue;
                    const t = Date.now();
                    if (Gen.judge(built.board, 'hard', built.solution)) hits++;
                    ms += Date.now() - t; n++;
                }
                out.push({ combo: `e${e} ${style} x2×${muls}`, rate: hits / n, ms: ms / n, perHit: hits ? ms / hits : Infinity });
            }
        }
    }
    out.sort((a, b) => a.perHit - b.perHit);
    for (const r of out) console.log(`${r.combo.padEnd(18)} | hit ${pct(r.rate)}% | ms per try ${Math.round(r.ms)} | ms per hit ${Math.round(r.perHit)}`);
}

if (!process.argv.includes('--skip-generate')) {
    for (const tier of Gen.TIERS) {
        const times = [], tries = [], shapes = {}, wastes = [], chances = [], picks = [];
        let curated = 0;
        for (let seed = 1; seed <= seeds; seed++) {
            const t = Date.now();
            const p = Gen.generate({ difficulty: tier, seed });
            times.push(Date.now() - t);
            tries.push(p.attempts);
            if (p.source === 'curated') { curated++; continue; }
            const board = R.parse(p.board), shape = `${p.rows}×${p.cols}${p.metrics.muls ? ' x2×' + p.metrics.muls : ''}`;
            shapes[shape] = (shapes[shape] || 0) + 1;
            wastes.push(Reasoning.trialMerges(R, board, 20000) - (R.tileCount(board) - 1));
            chances.push(firstTry(board));
            if (picks.filter((x) => x.shape === shape).length < 2 && picks.length < 6) picks.push({ shape, text: p.board });
        }
        console.log(`${tier.padEnd(6)} | ms median ${Math.round(q(times, 0.5))}, p90 ${q(times, 0.9)}, worst ${Math.max(...times)} | attempts median ${q(tries, 0.5)}, worst ${Math.max(...tries)} | curated ${curated}/${seeds}`);
        console.log(`       shapes ${JSON.stringify(shapes)} | waste ${spread(wastes)} | first-try win% ${spread(chances)}`);
        for (const pick of picks) console.log(`       '${pick.text}',  // ${pick.shape}`);
    }
}
