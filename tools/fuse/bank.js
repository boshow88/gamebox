/* Fuse developer tool: build the puzzle bank for a size that is too slow to generate on demand
 * (PLAN[size].bank). Runs the generator's own pipeline — reverse construction, exact solver,
 * human-solver metrics, DIFFICULTY[size] — and prints CURATED entries to paste into
 * js/generators/fuse.js. Every evaluated candidate is saved to an NDJSON file, so the tiers
 * can be re-picked after a threshold change without re-evaluating (--from).
 * Usage: node tools/fuse/bank.js [size=4] [perTier=30] [attempts=1500] [seed=2026] [--out=file] [--from=file] */
'use strict';
const fs = require('fs');
const Rules = require('../../js/games/fuse/rules.js');
const Solver = require('../../js/games/fuse/solver.js');
const Reasoning = require('../../js/games/fuse/reasoning.js');
const Gen = require('../../js/generators/fuse.js');

const R = Rules.DEFAULT;
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };
const size = Number(args[0] || 4), perTier = Number(args[1] || 30), attempts = Number(args[2] || 1500), seed = Number(args[3] || 2026);
const quantile = (values, p) => { const s = values.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const spread = (rows, fn) => (rows.length ? [0.1, 0.5, 0.9].map((p) => quantile(rows.map(fn), p)).join('/') : '-');

let candidates = [];
if (flag('from')) {
    candidates = fs.readFileSync(flag('from'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
} else {
    const out = flag('out') ? fs.openSync(flag('out'), 'w') : null;
    const rng = Gen.makeRng(seed), styles = Object.keys(Gen.STYLES), plan = Gen.PLAN[size], seen = new Set();
    const started = Date.now();
    for (let i = 1; i <= attempts; i++) {
        const exponent = plan.exponents[Math.floor(rng() * plan.exponents.length)];
        const style = styles[Math.floor(rng() * styles.length)];
        const built = Gen.reverseBuild(rng, size, size, exponent, style);
        if (!built) continue;
        const key = Gen.canonicalKey(built.board);
        if (seen.has(key)) continue;
        seen.add(key);
        const m = Reasoning.evaluate(R, built.board, { solver: Solver.createSolver(R) });
        const row = {
            board: R.serialize(built.board), exponent, style, solvable: m.solvable, searchSteps: m.searchSteps,
            maxLevel: m.maxLevel, span: m.span, casualWin: m.casualWin, plans: m.plans, cost: m.cost, levelCounts: m.levelCounts,
        };
        candidates.push(row);
        if (out) fs.writeSync(out, JSON.stringify(row) + '\n');
        if (i % 50 === 0) console.error(`${i} attempts, ${candidates.length} boards, ${Math.round((Date.now() - started) / 1000)} s`);
        const counts = Gen.TIERS.map((tier) => candidates.filter((r) => Gen.classify(r, size) === tier).length);
        if (counts.every((n) => n >= perTier)) break;
    }
    if (out) fs.closeSync(out);
}

const tiers = { easy: [], medium: [], hard: [] };
for (const row of candidates) {
    const tier = Gen.classify(row, size);
    if (tier) tiers[tier].push(row);
}
const usable = candidates.filter((r) => r.solvable && !r.searchSteps);
console.log(`${candidates.length} boards, ${usable.length} without search`);
console.log('casual win % (no search):', spread(usable, (r) => Math.round(1000 * r.casualWin) / 10), '| L<=2:', usable.filter((r) => r.maxLevel <= 2).length);
for (const tier of Gen.TIERS) {
    const g = tiers[tier];
    console.log(tier.padEnd(7), 'n', g.length, '| casual%', spread(g, (r) => Math.round(1000 * r.casualWin) / 10),
        '| level', spread(g, (r) => r.maxLevel), '| span', spread(g, (r) => r.span), '| plans', spread(g, (r) => r.plans));
}
console.log(`        ${size}: {`);
for (const tier of Gen.TIERS) {
    const picked = tiers[tier].slice(0, perTier).map((r) => `'${r.board}'`);
    console.log(`            ${tier}: [\n${picked.map((s) => '                ' + s + ',').join('\n')}\n            ],`);
}
console.log('        },');
