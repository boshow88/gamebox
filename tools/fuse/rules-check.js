/** node tools/fuse/rules-check.js — tile model, merge rules, status and solvability invariants. */
'use strict';
const assert = require('node:assert/strict');
const Rules = require('../../js/games/fuse/rules.js');
const Gen = require('../../js/generators/fuse.js');
const R = Rules.DEFAULT;

// Parsing, tokens and canonical keys.
const b0 = R.parse('1 1 2/2 4 ./# 8 8');
assert.equal(b0.rows, 3); assert.equal(b0.cols, 3);
assert.equal(R.serialize(b0), '1 1 2/2 4 ./# 8 8');
assert.equal(R.key(b0), '1,1,2,2,4,.,#,8,8,');
assert.equal(b0.cells[5], R.EMPTY);
assert.equal(b0.cells[6], R.BLOCK);
assert.equal(R.num(4), R.num(4), 'number tiles are interned');
assert.throws(() => R.num(3), RangeError);
assert.throws(() => R.num(0), RangeError);
assert.throws(() => R.parse('1 x/2 2'), SyntaxError);
assert.throws(() => R.parse('1 1/2'), RangeError);
assert.deepEqual(R.fromRows([[2, 0], ['#', null]]).cells, [R.num(2), R.EMPTY, R.BLOCK, R.EMPTY]);
assert.notEqual(R.key(R.parse('2 ./2 #')), R.key(R.parse('2 #/2 .')), 'blocked and empty cells have different keys');

// A merge doubles the destination and permanently empties the source; direction matters.
const pair = R.parse('2 2 4');
const right = R.applyMerge(pair, { from: 0, to: 1 }), left = R.applyMerge(pair, { from: 1, to: 0 });
assert.equal(R.serialize(right), '. 4 4');
assert.equal(R.serialize(left), '4 . 4');
assert.equal(R.serialize(pair), '2 2 4', 'applyMerge does not mutate its input');
assert.equal(R.status(right), 'playing');
assert.equal(R.status(left), 'dead-end');
assert.equal(R.serialize(R.applyMerge(right, { from: 1, to: 2 })), '. . 8');
assert.equal(R.status(R.parse('. . 8')), 'won');

// Illegal merges.
const g = R.parse('2 4 2/2 . 1/# 1 1');
for (const [from, to, why] of [
    [0, 1, 'unequal'], [0, 2, 'not adjacent'], [0, 4, 'diagonal'], [0, 0, 'self'], [3, 4, 'empty destination'],
    [4, 3, 'empty source'], [6, 3, 'blocked source'], [3, 6, 'blocked destination'], [0, 99, 'out of range'], [-1, 0, 'out of range'],
]) {
    assert.equal(R.canMerge(g, from, to), false, why);
    assert.throws(() => R.applyMerge(g, { from, to }), RangeError, why);
}
assert.equal(R.canMerge(g, 0, 3), true);
assert.equal(R.canMerge(g, 7, 8), true);
assert.equal(R.canMerge(g, 5, 8), true);
assert.deepEqual(R.legalMoves(g).map(Rules.moveKey).sort(), ['0>3', '3>0', '5>8', '7>8', '8>5', '8>7']);

// Diagonal adjacency is a rules option, not a different engine.
const K = Rules.createRules({ adjacency: 'king' });
assert.equal(K.canMerge(K.parse('2 ./. 2'), 0, 3), true);
assert.equal(R.canMerge(R.parse('2 ./. 2'), 0, 3), false);
assert.equal(K.neighbors(K.parse('1 1 1/1 1 1/1 1 1'), 4).length, 8);
assert.throws(() => Rules.createRules({ adjacency: 'hex' }), RangeError);

// Status: won / dead-end / playing / invalid. A playing board can still be unsolvable.
assert.equal(R.status(R.parse('. 16/. .')), 'won');
assert.equal(R.status(R.parse('2 4/4 2')), 'dead-end');
assert.equal(R.status(R.parse('. ./. .')), 'invalid');
assert.equal(R.status(R.parse('2 2 1')), 'playing');
assert.ok(R.findContradiction(R.parse('2 2 1')), 'a playing board can already be provably unsolvable');

// Blocked cells are not tiles, not empty, never merge and never count toward the win.
const blocked = R.parse('# 8/. #');
assert.equal(R.tileCount(blocked), 1);
assert.equal(R.status(blocked), 'won');
assert.equal(R.numberTotal(R.parse('# 8/4 4')), 16);
assert.equal(R.tileGroups(R.parse('2 # 2')).length, 2, 'a blocked cell separates groups');
assert.ok(R.contradictions(R.parse('2 # 2')).some((c) => c.id === 'split'));

// Bonus cells: a ×2 cell doubles every merge that lands on it. The layout is fixed for the
// puzzle, shared by its positions and part of every position's key.
const lay = R.parse('2 2 4/4 . .;x2=1,3');
assert.equal(R.serialize(lay), '2 2 4/4 . .;x2=1,3');
assert.equal(R.serialize(R.parse(R.serialize(lay))), R.serialize(lay));
assert.deepEqual(R.parse('2 2 4/4 . .;x2=3;x2=1').layout.bonusCells, [1, 3], 'parts may repeat');
assert.equal(R.serialize(R.parse('2 2;x4=0;x2=1')), '2 2;x2=1;x4=0');
assert.equal(R.serialize(R.applyMerge(lay, { from: 0, to: 1 })), '. 8 4/4 . .;x2=1,3', '2 + 2 on ×2 makes 8');
assert.equal(R.serialize(R.applyMerge(lay, { from: 1, to: 0 })), '4 . 4/4 . .;x2=1,3', 'merging away from it is plain');
assert.equal(R.serialize(R.applyMerge(R.parse('2 2;x4=1'), { from: 0, to: 1 })), '. 16;x4=1');
assert.equal(R.applyMerge(lay, { from: 0, to: 1 }).layout, lay.layout, 'positions share the layout');
assert.equal(R.bonusAt(lay, 1), 2);
assert.equal(R.bonusAt(lay, 0), 1);
assert.notEqual(R.key(R.parse('2 2')), R.key(R.parse('2 2;x2=1')));
assert.notEqual(R.key(R.parse('2 2;x2=0')), R.key(R.parse('2 2;x2=1')));
assert.equal(R.key(R.parse('2 2;x2=')), R.key(R.parse('2 2')), 'an empty layout is no layout');
assert.equal(R.parse('2 2/2 2').layout, undefined);
assert.deepEqual(R.layoutSpec(lay), { bonus: { 1: 2, 3: 2 } });
assert.equal(R.key(R.createBoard(2, 3, lay.cells, R.layoutSpec(lay))), R.key(lay));
assert.equal(R.bonusLive(R.parse('2 2;x2=1')), true);
assert.equal(R.bonusLive(R.parse('2 .;x2=1')), false, 'an emptied bonus cell no longer counts');
assert.ok(R.contradictions(R.parse('4 16 4/. 8 .')).some((c) => c.id === 'half'));
assert.ok(!R.contradictions(R.parse('4 16 4/. 8 .;x2=4')).some((c) => c.id === 'half'), 'no fixed total while a bonus is live');
assert.ok(R.contradictions(R.parse('2 2 8/4 4 .')).some((c) => c.id === 'subtotal'));
assert.ok(!R.contradictions(R.parse('2 2 8/4 4 .;x2=1')).some((c) => c.id === 'subtotal'), 'a group with a bonus can skip a value');
assert.throws(() => R.parse('2 2;x3=0'), RangeError);
assert.throws(() => R.parse('2 2;x2=5'), RangeError);
assert.throws(() => R.parse('2 2;wall=0-1'), SyntaxError);

// Random play: every merge multiplies the destination by 2 × its bonus (so the number total
// only changes on bonus cells), removes exactly one tile, empties its source for good, and
// never touches an empty or blocked cell. Reverse-built solutions replay to one tile.
const rng = Gen.makeRng(99);
for (let n = 0; n < 400; n++) {
    const rows = 2 + Math.floor(rng() * 2), layout = Gen.bonusLayout(rng, rows, 3, n % 3);
    const built = Gen.reverseBuild(rng, rows, 3, 3 + Math.floor(rng() * 4), ['even', 'mixed', 'deep'][n % 3], layout);
    if (!built) continue;
    let replay = built.board;
    for (const m of built.solution) replay = R.applyMerge(replay, m);
    assert.equal(R.status(replay), 'won', 'the construction is a solution');
    let b = built.board, total = R.numberTotal(b);
    const emptied = new Set();
    while (R.status(b) === 'playing') {
        const moves = R.legalMoves(b);
        for (const m of moves) {
            assert.ok(R.isTile(b.cells[m.from]) && R.isTile(b.cells[m.to]));
            assert.ok(!emptied.has(m.from) && !emptied.has(m.to));
        }
        const m = moves[Math.floor(rng() * moves.length)], next = R.applyMerge(b, m), bonus = R.bonusAt(b, m.to);
        assert.equal(next.cells[m.to].value, b.cells[m.to].value * 2 * bonus);
        total += b.cells[m.to].value * 2 * (bonus - 1);
        assert.equal(R.numberTotal(next), total);
        assert.equal(R.tileCount(next), R.tileCount(b) - 1);
        assert.equal(next.cells[m.from], R.EMPTY);
        emptied.add(m.from);
        for (const i of emptied) assert.equal(next.cells[i], R.EMPTY);
        b = next;
    }
}

// Crafted contradictions, each with the evidence the hints explain.
const expect = (text, id, check) => {
    const found = R.contradictions(R.parse(text)).find((c) => c.id === id);
    assert.ok(found, `${id} on ${text}`);
    if (check) check(found);
};
expect('2 4/. 4', 'stuck', (c) => assert.deepEqual(c.cells, [0]));
expect('4 1 4/. 2 .', 'stuck');
expect('2 . 2/. 2 .', 'stuck');
expect('2 2 2/8 4 .', 'odd-group', (c) => assert.equal(c.cells.length, 3));
expect('4 2 4/8 4 8', 'rivals', (c) => assert.equal(c.partner, 1));
expect('2 2 . 4 4', 'split');
expect('2 2 8/4 4 .', 'subtotal', (c) => { assert.equal(c.below, 8); assert.equal(c.sum, 12); });
expect('4 16 4/. 8 .', 'half', (c) => assert.deepEqual(c.cells, [1]));
assert.equal(R.findContradiction(R.parse('4 4/8 16')), null);

// Every contradiction is sound: brute force agrees the board is unsolvable.
function bruteSolvable(b) {
    if (R.tileCount(b) === 1) return true;
    return R.legalMoves(b).some((m) => bruteSolvable(R.applyMerge(b, m)));
}
let checked = 0, checkedLayout = 0;
const values = [1, 1, 1, 2, 2, 2, 4, 4, 8, 16];
for (let n = 0; n < 8000; n++) {
    const rows = 2 + Math.floor(rng() * 2), cols = 2 + Math.floor(rng() * 2);
    const cells = [];
    for (let i = 0; i < rows * cols; i++) cells.push(rng() < 0.2 ? R.EMPTY : R.num(values[Math.floor(rng() * values.length)]));
    if (!cells.some((c) => c !== R.EMPTY)) continue;
    const layout = n % 2 ? Gen.bonusLayout(rng, rows, cols, 1 + Math.floor(rng() * 2)) : null;
    const b = R.createBoard(rows, cols, cells, layout);
    if (R.tileCount(b) > 7) continue;
    for (const c of R.contradictions(b)) {
        assert.equal(bruteSolvable(b), false, `${c.id} claimed on solvable ${R.serialize(b)}`);
        checked++;
        if (b.layout) checkedLayout++;
    }
}
assert.ok(checked > 1000, `contradictions were exercised (${checked})`);
assert.ok(checkedLayout > 500, `contradictions were exercised with bonus cells (${checkedLayout})`);

// Extensibility: a test-only tile type plugs into the same validation. Number-specific
// conditions switch off once other tile types are present; connectivity still applies.
const STAR = Object.freeze({ type: 'star' });
const X = Rules.createRules({
    tileTypes: { star: { tile: true, token: () => '*', parse: (s) => (s === '*' ? STAR : undefined) } },
    merges: { 'num>star': (src) => src, 'star>num': (src, dst) => dst },
});
const xb = X.parse('* 2 4/. . 8');
assert.equal(X.serialize(xb), '* 2 4/. . 8');
assert.equal(X.canMerge(xb, 0, 1), true);
assert.equal(X.canMerge(xb, 1, 2), false);
assert.equal(X.serialize(X.applyMerge(xb, { from: 1, to: 0 })), '2 . 4/. . 8');
assert.equal(X.numbersOnly(xb), false);
assert.equal(X.numberTotal(xb), null);
assert.equal(X.contradictions(xb).some((c) => c.id === 'stuck'), false, 'number-specific rules are skipped');
assert.equal(X.findContradiction(X.parse('* . 2')).id, 'split');
assert.throws(() => R.parse('*'), SyntaxError, 'the default rules do not know test-only tiles');

console.log(`fuse rules: ok (${checked} contradiction claims cross-checked, ${checkedLayout} with bonus cells)`);
