/** Run with node tools/unshackle-free-check.js [samples per size]. */
'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
require('../js/games/unshackle/engine.js');
require('../js/generators/unshackle.js');
require('../js/games/unshackle/free.js');
const F = globalThis.UnshackleFree, E = globalThis.UnshackleEngine;
const samples = Number(process.argv[2] || 3);
assert(Number.isInteger(samples) && samples > 0);
function checkRoute(puzzle, route, initial = puzzle.initial) {
    const ps = initial.slice();
    for (const move of route) {
        const i = move.id - 1, poses = puzzle.model.poses(ps), moving = poses[i];
        assert.notEqual(ps[i], null);
        const delta = move.extract ? E.exitDistance(moving, poses.filter((_, j) => ps[j] !== null)) : move.offset - ps[i];
        for (let j = 0; j < ps.length; j++) if (j !== i && ps[j] !== null)
            assert(!E.sweptCollision(moving, poses[j], delta), 'Witness motion cannot tunnel through a piece');
        ps[i] = move.extract ? null : move.offset;
    }
    assert(ps.every(x => x === null));
}
(async () => {
    let puzzles = 0, moves = 0;
    const clearRay = { min: -Infinity, max: 20, forward: { exit: 20, blockers: [] }, back: { exit: 20, blockers: [] } };
    assert(!F.dragPlan(clearRay, 2).extract, 'Physical-only model uses the full exit by default');
    const assisted = F.dragPlan(clearRay, 2, 1.5);
    assert(assisted.extract && assisted.exitDistance === 20, 'Clear-path intent hands the rest to the extraction animation');
    const blockedRay = { ...clearRay, max: 1, forward: { exit: 20, blockers: [2] } };
    assert(!F.dragPlan(blockedRay, 50, 0.7).extract, 'An intent threshold must never bypass a later obstacle');
    // This pair only catches the projecting white end cap; the frame bodies
    // miss one another. It must never qualify as a structural interlock.
    const grazingPieces = [E.piece(1, '#888888', [0,0,0], [1,0,0], [0,1,0]),
        E.piece(2, '#aaaaaa', [3,0,0.75], [0,1,0], [0,0,1])];
    const grazing = { pieces: grazingPieces, initial: [0,0], model: F.compile(grazingPieces) };
    assert(F.layoutQuality(grazing).tipOnlyEdges > 0);
    assert(!F.layoutQuality(grazing).accepted);
    for (const size of [6, 8]) {
        const fingerprints = new Set();
        for (let seed = 0; seed < samples; seed++) {
            const start = Date.now(), p = await F.generate(size, 'easy', seed); puzzles++;
            assert.equal(E.analyze(p.graph).solvable, false, 'Extraction alone must not clear a generated puzzle');
            assert(p.solution.some(m => !m.extract), 'A generated level requires repositioning');
            assert(p.stats.verifiedShifts >= 1 && p.stats.verifiedShifts <= 4);
            assert(F.extractionCore(p) >= (size === 8 ? 4 : 3));
            const quality = F.layoutQuality(p);
            assert(quality.accepted && quality.bodyCycle && quality.coreConnected);
            assert.equal(quality.tipOnlyEdges, 0, 'End-cap-only catches must not carry a level');
            assert(quality.radiusRatio <= 1.1 && quality.coreSpan <= 3.2 && quality.totalSpan <= 4.4);
            assert(quality.solidRatio >= 0.8, 'Most blocking relations must survive a lateral perturbation');
            assert(p.pieces.some(piece => piece.shoulder), 'A visible structural shoulder supports the locked core');
            for (const piece of p.pieces) assert.equal(piece.width, 1.25);
            assert(!fingerprints.has(p.fingerprint), 'Seeds produce different geometry, not just labels');
            fingerprints.add(p.fingerprint);
            checkRoute(p, p.solution); moves += p.solution.length;
            const ps = p.initial.slice();
            for (let step = 0; step < p.solution.length; step++) {
                const move = p.solution[step], i = move.id - 1;
                if (!move.extract) {
                    const range = p.model.limits(ps, i), direction = Math.sign(move.offset - ps[i]);
                    for (const side of [-1, 1]) {
                        const desired = move.offset + direction * side * p.stats.openingTolerance;
                        const varied = p.solution.slice(step).map(m => ({ ...m }));
                        varied[0].offset = ps[i] + Math.max(range.min, Math.min(range.max, desired - ps[i]));
                        checkRoute(p, varied, ps);
                    }
                }
                ps[i] = move.extract ? null : move.offset;
                const hint = F.solve(p, ps);
                assert.equal(hint.status, 'solved', 'Solution prefixes retain verified hints');
                if (hint.solution[0] && !hint.solution[0].extract)
                    assert(Math.abs(hint.solution[0].offset - ps[hint.solution[0].id - 1]) > 0.005, 'Hints must advance rather than repeat a finished slide');
            }
            for (let i = 0; i < size; i++) {
                for (let j = i + 1; j < size; j++) assert(!E.overlaps(F.at(p.pieces[i], p.initial[i]), F.at(p.pieces[j], p.initial[j])));
                const range = p.model.limits(p.initial, i), delta = range.max * 0.371;
                assert(Math.abs(F.dragPlan(range, delta).offset - delta) < 1e-9, 'Fractional drags stay fractional');
                if (!range.back.blockers.length) assert.equal(F.dragPlan(range, -100).offset, -100, 'Open directions have no hidden stops');
                if (range.back.blockers.length) assert.equal(F.dragPlan(range, -range.back.exit * 10).offset, range.min);
                if (range.forward.blockers.length) {
                    const blocked = F.dragPlan(range, range.forward.exit * 10);
                    assert.equal(blocked.offset, range.max); assert(!blocked.extract);
                }
            }
            if (seed === (size === 8 ? 1 : 0)) {
                let previous = 0;
                const repeat = await F.generate(size, 'easy', seed, async fraction => { assert(fraction >= previous && fraction <= 1); previous = fraction; });
                const plain = ({ model, ...rest }) => JSON.stringify(rest);
                assert.equal(plain(p), plain(repeat), 'Seeds replay exactly with progress callbacks');
                assert.equal(previous, 1);
            }
            console.log(`${size} pieces seed ${seed}: ${p.stats.verifiedShifts} verified shifts, ${Date.now() - start} ms`);
        }
    }
    await assert.rejects(F.generate(7, 'easy', 0), /Invalid continuous settings/);
    for (const size of F.SIZES) {
        const difficulty = Object.keys(F.SETTINGS).find(tier => F.SETTINGS[tier].sizes.includes(size));
        const fingerprints = new Set();
        for (let seed = 0; seed < samples; seed++) {
            const start = Date.now(), p = await F.generate(size, difficulty, seed); puzzles++;
            assert.equal(p.version, 6);
            assert.equal(p.pieces.length, size);
            assert.equal(F.extractionCore(p), size, 'Every starting piece participates in an interlock');
            assert(p.graph.every(blockers => blockers.length), 'There is no extraction-only opening');
            assert(F.layoutQuality(p).accepted);
            assert.equal(p.stats.tipOnlyEdges, 0);
            assert(p.stats.solidRatio >= 0.8);
            assert.equal(p.relays.length, size / 3);
            assert.equal(p.stats.shifts, size / 3);
            assert(p.stats.shifts >= F.SETTINGS[difficulty].minShifts && p.stats.shifts <= F.SETTINGS[difficulty].maxShifts);
            assert.equal(F.relayAudit(p, p.solution).length, size / 3);
            assert(p.relays.every((r, i) => i === p.relays.length - 1 || r.crossEdges >= 1), 'Relays physically gate earlier groups');
            assert(!fingerprints.has(p.fingerprint)); fingerprints.add(p.fingerprint);
            checkRoute(p, p.solution); moves += p.solution.length;
            const ps = p.initial.slice();
            // Use direct physical sweeps, independently of relay metadata/audits.
            const blockers = (positions, id) => {
                const moving = F.at(p.pieces[id - 1], positions[id - 1]);
                return p.pieces.filter(q => q.id !== id && positions[q.id - 1] !== null &&
                    E.sweptCollision(moving, F.at(q, positions[q.id - 1]))).map(q => q.id);
            };
            for (let step = 0; step < p.solution.length; step++) {
                const move = p.solution[step], i = move.id - 1;
                if (!move.extract) {
                    const [b, c, a] = p.solution.slice(step + 1, step + 4);
                    assert.equal(a.id, move.id);
                    assert(blockers(ps, b.id).includes(move.id), 'Unmoved A physically blocks B');
                    assert(blockers(ps, c.id).includes(b.id), 'B physically blocks C');
                    const range = p.model.limits(ps, i), travel = move.offset - ps[i];
                    assert(travel >= 0.38 && travel < p.pieces[i].length * 0.6);
                    const fractional = F.dragPlan(range, travel * 0.371, 0.6);
                    assert(!fractional.extract && Math.abs(fractional.offset - travel * 0.371) < 1e-9);
                    assert(!F.dragPlan(range, travel, 0.6).extract, 'A cannot be auto-removed while C still blocks it');
                    for (const side of [-1, 1]) {
                        const varied = p.solution.slice(step).map(m => ({ ...m }));
                        varied[0].offset = ps[i] + Math.max(range.min, Math.min(range.max, travel + side * 0.18));
                        checkRoute(p, varied, ps);
                        const intermediate = ps.slice(); intermediate[i] = varied[0].offset;
                        const hint = F.solve(p, intermediate);
                        assert.equal(hint.status, 'solved', 'Non-canonical partial positions retain a verified hint');
                        checkRoute(p, hint.solution, intermediate);
                    }
                    const midway = ps.slice(); midway[i] = move.offset;
                    assert.equal(blockers(midway, b.id).length, 0, 'Moving A partway releases B');
                    assert(blockers(midway, move.id).includes(c.id), 'C still prevents finishing A');
                    midway[b.id - 1] = null;
                    assert.equal(blockers(midway, c.id).length, 0, 'Removing B releases C');
                    assert(blockers(midway, move.id).includes(c.id), 'A remains blocked until C leaves');
                    midway[c.id - 1] = null;
                    assert.equal(blockers(midway, move.id).length, 0, 'Removing C finally releases A');
                    assert.equal(midway[i], move.offset, 'A stays partway out while other pieces leave');
                }
                ps[i] = move.extract ? null : move.offset;
                const hint = F.solve(p, ps);
                assert.equal(hint.status, 'solved');
                assert(F.verify(p, hint.solution, ps));
                if (hint.solution[0] && !hint.solution[0].extract)
                    assert(Math.abs(hint.solution[0].offset - ps[hint.solution[0].id - 1]) > 0.005);
            }
            for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) assert(!E.overlaps(p.pieces[i], p.pieces[j], 0.019));
            if (seed === 0) {
                let previous = 0;
                const replay = await F.generateAsync(size, difficulty, seed, fraction => {
                    assert(fraction >= previous && fraction <= 1); previous = fraction;
                }, 6);
                const plain = ({ model, ...rest }) => JSON.stringify(rest);
                assert.equal(plain(replay), plain(p)); assert.equal(previous, 1);
            }
            console.log(`${size} ${difficulty} seed ${seed}: ${p.relays.length} physical A→B→C→A relays, route/tolerance/hints passed, ${Date.now() - start} ms`);
        }
    }
    // Existing unversioned shared links use the unchanged v5 generator.
    for (const [size, seed, hash] of [[36, 0, '4234f5314b7616cf3dc3c3c75687e64f50c48064fa3c028fb627002559ddbff2'],
        [48, 1, '9deadf5a4404f7744bd91802e7a3dab1ab245b58ebb4a62fdacb21236d920041']]) {
        const { model, ...legacy } = await F.generateAsync(size, 'hard', seed, undefined, 5);
        assert.equal(createHash('sha256').update(JSON.stringify(legacy)).digest('hex'), hash, 'Legacy shared puzzle is byte-for-byte unchanged');
    }
    console.log('Legacy shared links replay byte-for-byte.');
    console.log(`${puzzles} generated puzzles, ${moves} physical moves; geometry diversity, opening tolerance, replay, hints and continuous contact checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
