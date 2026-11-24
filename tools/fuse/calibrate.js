/* Fuse developer calibration: sample reverse-built boards, profile the human-solver metrics
 * that drive the difficulty tiers, and spot-check reasoning soundness on reachable states.
 * Usage: node tools/fuse/calibrate.js [samples=300] [depth=3] [--size=3] [--exp=4,5,6,7] [--sound] */
'use strict';
const Rules = require('../../js/games/fuse/rules.js');
const Solver = require('../../js/games/fuse/solver.js');
const Reasoning = require('../../js/games/fuse/reasoning.js');
const Gen = require('../../js/generators/fuse.js');

const R = Rules.DEFAULT;
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const samples = Number(args[0] || 300), depth = Number(args[1] || 3), sound = process.argv.includes('--sound');
const flag = (name) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };
const size = Number(flag('size') || 3);
const exponents = flag('exp') ? flag('exp').split(',').map(Number) : (Gen.PLAN[size] || Gen.PLAN[3]).exponents;
const rng = Gen.makeRng(777), styles = Object.keys(Gen.STYLES);
const quantile = (values, p) => { const s = values.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const spread = (rows, fn) => [0.1, 0.5, 0.9].map((p) => quantile(rows.map(fn), p)).join('/');

const rows = [], started = Date.now();
let slowest = 0;
for (let i = 0; i < samples; i++) {
    const exponent = exponents[Math.floor(rng() * exponents.length)];
    const style = styles[Math.floor(rng() * styles.length)];
    const built = Gen.reverseBuild(rng, size, size, exponent, style);
    if (!built) continue;
    const t = Date.now();
    const m = Reasoning.evaluate(R, built.board, { solver: Solver.createSolver(R), depth });
    slowest = Math.max(slowest, Date.now() - t);
    const values = new Set(R.tiles(built.board).map((i) => built.board.cells[i].value)).size;
    rows.push({ exponent, style, m, values, board: R.serialize(built.board), tier: Gen.classify(m, size) || '-' });
}
console.log(`depth ${depth}: ${rows.length} boards in ${Date.now() - started} ms (slowest ${slowest} ms)`);

const groups = {};
for (const r of rows) { const k = r.m.searchSteps ? 'search' : 'L' + r.m.maxLevel; (groups[k] = groups[k] || []).push(r); }
for (const k of Object.keys(groups).sort()) {
    const g = groups[k];
    console.log(k.padEnd(7), 'n', String(g.length).padStart(4),
        '| L2 steps', spread(g, (r) => r.m.levelCounts[2]), '| L3-4', spread(g, (r) => r.m.levelCounts[3] + r.m.levelCounts[4]),
        '| L5', spread(g, (r) => r.m.levelCounts[5]), '| span', spread(g, (r) => r.m.span), '| cost', spread(g, (r) => r.m.cost),
        '| plans', spread(g, (r) => r.m.plans), '| decisions', spread(g, (r) => r.m.decisionPoints),
        '| randomWin%', spread(g, (r) => Math.round(1000 * r.m.randomWin) / 10));
}
const hist = {};
for (const r of rows) {
    for (const p of r.m.path) {
        if (p.level < 5) continue;
        const k = `${p.technique}@${p.tiles} tiles c${p.cost}`;
        hist[k] = (hist[k] || 0) + 1;
    }
}
console.log('L5+ steps', Object.entries(hist).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join(', '));
const tiers = {}, uses = {};
for (const r of rows) {
    tiers[r.tier] = (tiers[r.tier] || 0) + 1;
    for (const k in r.m.uses) uses[k] = (uses[k] || 0) + r.m.uses[k];
}
console.log('tiers', JSON.stringify(tiers));
console.log('technique uses', JSON.stringify(uses));
for (const tier of Gen.TIERS) {
    const g = rows.filter((r) => r.tier === tier);
    if (!g.length) continue;
    console.log(tier.padEnd(7), 'n', String(g.length).padStart(4), '| cost', spread(g, (r) => r.m.cost), '| span', spread(g, (r) => r.m.span),
        '| plans', spread(g, (r) => r.m.plans), '| winning first merges', spread(g, (r) => r.m.winningFirstMoves),
        '| first merges', spread(g, (r) => r.m.firstMoves), '| randomWin%', spread(g, (r) => Math.round(1000 * r.m.randomWin) / 10),
        '| trap%', spread(g, (r) => Math.round(100 * r.m.trapRate)), '| casual%', spread(g, (r) => Math.round(100 * r.m.casualWin)),
        '| values', spread(g, (r) => r.values));
    console.log('  ', g.slice(0, 8).map((r) => `${r.board} (c${r.m.cost} s${r.m.span} p${r.m.plans} w${Math.round(100 * r.m.casualWin)})`).join(' | '));
}
const buckets = size > 3 ? [0, 0.01, 0.02, 0.04, 0.08, 0.15, 0.3, 1.01] : [0, 0.05, 0.15, 0.3, 0.5, 0.75, 1.01];
for (const key of ['exponent', 'style']) {
    const by = {};
    for (const r of rows) if (!r.m.searchSteps) (by[r[key]] = by[r[key]] || []).push(r);
    console.log(`no-search boards by ${key}:`, Object.keys(by).sort().map((k) => `${k} n${by[k].length} casual% ${spread(by[k], (r) => Math.round(100 * r.m.casualWin))} L2 ${by[k].filter((r) => r.m.maxLevel <= 2).length}`).join(' | '));
}
console.log('casual win % by technique level (search = needs search):');
for (let i = 0; i + 1 < buckets.length; i++) {
    const g = rows.filter((r) => r.m.casualWin >= buckets[i] && r.m.casualWin < buckets[i + 1]);
    const by = {};
    for (const r of g) { const k = r.m.searchSteps ? 'search' : 'L' + r.m.maxLevel; by[k] = (by[k] || 0) + 1; }
    console.log(`  ${Math.round(100 * buckets[i])}-${Math.min(100, Math.round(100 * buckets[i + 1]))}%`.padEnd(10), String(g.length).padStart(4), JSON.stringify(by),
        '| plans', g.length ? spread(g, (r) => r.m.plans) : '-', '| values', g.length ? spread(g, (r) => r.values) : '-');
}

if (sound) {
    // Every candidate step must win and every refuted merge must lose, at every state reachable
    // from the first boards.
    let states = 0, bugs = 0;
    for (const r of rows.slice(0, 80)) {
        const solver = Solver.createSolver(R), seen = new Set(), stack = [R.parse(r.board)];
        while (stack.length) {
            const b = stack.pop(), k = R.key(b);
            if (seen.has(k)) continue;
            seen.add(k);
            const a = solver.analyze(b);
            if (a.status !== 'solvable' && a.status !== 'unsolvable') continue;
            states++;
            const outcome = (m) => (a.moves.find((x) => Rules.sameMove(x, m)) || {}).outcome;
            const dead = Reasoning.explainDead(R, b);
            if (dead && a.status === 'solvable') { bugs++; console.log('BUG dead', dead.id, R.serialize(b)); }
            if (a.status !== 'solvable') { for (const m of a.moves) stack.push(R.applyMerge(b, m)); continue; }
            for (const s of Reasoning.candidates(R, b, outcome, { depth })) {
                if (outcome(s.move) !== 'win') { bugs++; console.log('BUG step', s.technique, R.serialize(b), JSON.stringify(s.move)); }
                for (const ref of s.refuted || []) {
                    if (outcome(ref.move) !== 'lose') { bugs++; console.log('BUG refute', ref.reason.id, R.serialize(b), JSON.stringify(ref.move)); }
                }
            }
            for (const m of a.moves) stack.push(R.applyMerge(b, m));
        }
    }
    console.log(`soundness: ${states} states, ${bugs} problems`);
}
