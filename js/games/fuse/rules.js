/* Fuse: tile types, board model, merge rules and solvability invariants shared by play,
 * the exact solver, hints and generation. No DOM. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.FuseRules = factory();
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';

    // A cell is EMPTY (permanently vacated), a non-tile occupant such as BLOCK, or a tile.
    // Tiles are immutable objects; number tiles are interned so equal tiles share identity.
    const EMPTY = null;
    const BLOCK = Object.freeze({ type: 'block' });

    function isPowerOfTwo(n) {
        if (!Number.isInteger(n) || n < 1) return false;
        while (n % 2 === 0) n /= 2;
        return n === 1;
    }

    const NUMBERS = new Map();
    function num(value) {
        if (!isPowerOfTwo(value)) throw new RangeError('Number tiles hold a positive power of two: ' + value);
        let tile = NUMBERS.get(value);
        if (!tile) { tile = Object.freeze({ type: 'num', value }); NUMBERS.set(value, tile); }
        return tile;
    }
    // Multiplier tiles (×2) merge with any touching number and multiply it.
    const MULTIPLIERS = new Map();
    function mul(factor) {
        if (!isPowerOfTwo(factor) || factor < 2) throw new RangeError('A multiplier tile multiplies by a power of two above 1: ' + factor);
        let tile = MULTIPLIERS.get(factor);
        if (!tile) { tile = Object.freeze({ type: 'mul', factor }); MULTIPLIERS.set(factor, tile); }
        return tile;
    }

    // Each tile type owns its token (used for canonical keys and serialization) and parser.
    // `tile: false` marks occupants that are neither empty nor mergeable and never count
    // toward the win (blocked cells).
    const TILE_TYPES = {
        num: { tile: true, token: (t) => String(t.value), parse: (s) => (/^\d+$/.test(s) ? num(Number(s)) : undefined) },
        mul: { tile: true, token: (t) => 'x' + t.factor, parse: (s) => { const m = /^[x×](\d+)$/i.exec(s); return m ? mul(Number(m[1])) : undefined; } },
        block: { tile: false, token: () => '#', parse: (s) => (s === '#' ? BLOCK : undefined) },
    };

    // Merge handlers keyed `<source type>><destination type>`; each returns the tile left at
    // the destination, or null when the pair cannot merge. Every caller goes through
    // `mergeResult`, so play, search, hints and generation share one definition. A multiplier
    // and a number merge in either direction; two multipliers never merge.
    const MERGES = {
        'num>num': (src, dst) => (src.value === dst.value ? num(dst.value * 2) : null),
        'num>mul': (src, dst) => num(src.value * dst.factor),
        'mul>num': (src, dst) => num(dst.value * src.factor),
    };

    const ADJACENCY = {
        orthogonal: [[-1, 0], [1, 0], [0, -1], [0, 1]],
        king: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]],
    };

    function createRules(config) {
        const cfg = Object.assign({ adjacency: 'orthogonal' }, config);
        if (!ADJACENCY[cfg.adjacency]) throw new RangeError('Unknown adjacency: ' + cfg.adjacency);
        const types = Object.assign({}, TILE_TYPES, cfg.tileTypes);
        const merges = Object.assign({}, MERGES, cfg.merges);
        const offsets = ADJACENCY[cfg.adjacency];
        const neighborCache = new Map();

        function typeOf(cell) {
            const type = cell && types[cell.type];
            if (cell && !type) throw new TypeError('Unknown tile type: ' + cell.type);
            return type;
        }
        function isTile(cell) { return !!cell && typeOf(cell).tile; }
        function token(cell) { return cell === EMPTY ? '.' : typeOf(cell).token(cell); }
        function parseToken(text) {
            const s = String(text).trim();
            if (s === '.' || s === '' || s === '0') return EMPTY;
            for (const name in types) {
                const tile = types[name].parse && types[name].parse(s);
                if (tile !== undefined) return tile;
            }
            throw new SyntaxError('Unknown cell token: ' + s);
        }

        // Neighbour lists of a rows × cols grid, cached per shape.
        function gridNeighbors(rows, cols) {
            const id = rows + 'x' + cols;
            let table = neighborCache.get(id);
            if (!table) {
                table = [];
                for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
                    const list = [];
                    for (const [dr, dc] of offsets) {
                        const rr = r + dr, cc = c + dc;
                        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) list.push(rr * cols + cc);
                    }
                    table.push(list);
                }
                neighborCache.set(id, table);
            }
            return table;
        }

        // A board with `board`'s grid and new cells.
        function withCells(board, cells) { return { rows: board.rows, cols: board.cols, cells }; }

        function createBoard(rows, cols, cells) {
            if (!(rows >= 1 && cols >= 1) || cells.length !== rows * cols) throw new RangeError('Board dimensions do not match its cells');
            for (const cell of cells) if (cell !== EMPTY) typeOf(cell);
            return { rows, cols, cells: cells.slice() };
        }
        // Rows of numbers (0/null/'.' = empty, '#' = blocked, 'x2' = multiplier) or tile objects.
        function fromRows(grid) {
            const rows = grid.length, cols = grid[0].length, cells = [];
            for (const row of grid) {
                if (row.length !== cols) throw new RangeError('Ragged board');
                for (const v of row) cells.push(v && typeof v === 'object' ? v : parseToken(v == null ? '.' : v));
            }
            return createBoard(rows, cols, cells);
        }
        // `1 1 2/2 x2 ./# 8 8` — rows separated by '/', cells by spaces or commas.
        function parse(text) { return fromRows(String(text).trim().split('/').map((row) => row.trim().split(/[\s,]+/))); }
        function serialize(board) {
            const out = [];
            for (let r = 0; r < board.rows; r++) out.push(board.cells.slice(r * board.cols, (r + 1) * board.cols).map(token).join(' '));
            return out.join('/');
        }
        function key(board) {
            let k = '';
            for (const cell of board.cells) k += token(cell) + ',';
            return k;
        }

        function neighbors(board, i) { return gridNeighbors(board.rows, board.cols)[i]; }
        function adjacent(board, a, b) { return neighbors(board, a).includes(b); }

        function mergeResult(src, dst) {
            if (!isTile(src) || !isTile(dst)) return null;
            const handler = merges[src.type + '>' + dst.type];
            return handler ? handler(src, dst) || null : null;
        }
        function canMerge(board, from, to) {
            return Number.isInteger(from) && Number.isInteger(to) && from !== to
                && from >= 0 && to >= 0 && from < board.cells.length && to < board.cells.length
                && adjacent(board, from, to) && mergeResult(board.cells[from], board.cells[to]) !== null;
        }
        function applyMerge(board, move) {
            if (!move || !canMerge(board, move.from, move.to)) throw new RangeError('Illegal merge ' + JSON.stringify(move));
            const cells = board.cells.slice();
            cells[move.to] = mergeResult(board.cells[move.from], board.cells[move.to]);
            cells[move.from] = EMPTY;
            return withCells(board, cells);
        }
        function legalMoves(board) {
            const moves = [];
            for (let from = 0; from < board.cells.length; from++) {
                if (!isTile(board.cells[from])) continue;
                for (const to of neighbors(board, from)) if (mergeResult(board.cells[from], board.cells[to])) moves.push({ from, to });
            }
            return moves;
        }
        function tiles(board) {
            const out = [];
            for (let i = 0; i < board.cells.length; i++) if (isTile(board.cells[i])) out.push(i);
            return out;
        }
        function tileCount(board) {
            let n = 0;
            for (const cell of board.cells) if (isTile(cell)) n++;
            return n;
        }
        // 'won' = exactly one tile; 'dead-end' = several tiles and no legal merge. A
        // 'playing' board may still be unsolvable — only the solver can tell.
        function status(board) {
            const n = tileCount(board);
            if (n === 0) return 'invalid';
            if (n === 1) return 'won';
            return legalMoves(board).length ? 'playing' : 'dead-end';
        }
        function numbersOnly(board) {
            for (const cell of board.cells) if (isTile(cell) && cell.type !== 'num') return false;
            return true;
        }
        // Only numbers and multipliers: the tiles the number invariants understand.
        function numeric(board) {
            for (const cell of board.cells) if (isTile(cell) && cell.type !== 'num' && cell.type !== 'mul') return false;
            return true;
        }
        // Sum of number tiles; null when other tile types are present (no sum invariant).
        function numberTotal(board) {
            if (!numbersOnly(board)) return null;
            let total = 0;
            for (const cell of board.cells) if (isTile(cell)) total += cell.value;
            return total;
        }
        // Neighbours of the number tile at `i` that it could ever merge with: numbers no larger
        // (larger ones never shrink) and multipliers. Empty cells stay empty, a number cell only
        // grows or empties, and only a multiplier's cell can take a new value, so no other
        // neighbour can ever become a partner.
        function partners(board, i) {
            const v = board.cells[i].value;
            return neighbors(board, i).filter((j) => {
                const c = board.cells[j];
                return isTile(c) && (c.type === 'mul' || (c.type === 'num' && c.value <= v));
            });
        }
        // Connected groups of tile cells, optionally treating `without` as removed.
        function tileGroups(board, without) {
            const seen = new Uint8Array(board.cells.length), groups = [];
            for (const start of tiles(board)) {
                if (seen[start] || start === without) continue;
                const group = [start];
                seen[start] = 1;
                for (let k = 0; k < group.length; k++) {
                    for (const j of neighbors(board, group[k])) {
                        if (!seen[j] && j !== without && isTile(board.cells[j])) { seen[j] = 1; group.push(j); }
                    }
                }
                groups.push(group);
            }
            return groups;
        }

        // A connected group of number tiles matching `inGroup`, grown from `start`, and whether
        // a multiplier touches it.
        function numberGroup(board, start, inGroup, seen) {
            const group = [start];
            let touched = false;
            seen.add(start);
            for (let k = 0; k < group.length; k++) {
                for (const j of neighbors(board, group[k])) {
                    const c = board.cells[j];
                    if (!isTile(c)) continue;
                    if (c.type === 'mul') touched = true;
                    else if (!seen.has(j) && c.type === 'num' && inGroup(c.value)) { seen.add(j); group.push(j); }
                }
            }
            return { group, touched };
        }

        // Necessary conditions for solvability. Each returns evidence when a board with at
        // least two tiles can provably never reach a single tile, else null. They are used to
        // prune exact search and to explain hints, so each must be sound under these rules.
        // `numeric` conditions rely on number tiles only growing and only merging with an
        // equal tile or a multiplier; they are skipped when other tile types are present.
        const CONDITIONS = [
            {
                // A number with no possible partner (see `partners`) can never merge.
                id: 'stuck', numeric: true,
                check(board, ts) {
                    for (const i of ts) {
                        if (board.cells[i].type === 'num' && !partners(board, i).length) return { cells: [i], value: board.cells[i].value };
                    }
                    return null;
                },
            },
            {
                // Two equal numbers whose only possible partner is the same tile: whichever merges
                // with it first leaves that cell empty or larger, leaving the other with nothing.
                id: 'rivals', numeric: true,
                check(board, ts) {
                    const claims = new Map();
                    for (const i of ts) {
                        if (board.cells[i].type !== 'num') continue;
                        const v = board.cells[i].value, p = partners(board, i);
                        if (p.length !== 1) continue;
                        const claim = p[0] + ':' + v, prior = claims.get(claim);
                        if (prior !== undefined) return { cells: [prior, i], partner: p[0], value: v };
                        claims.set(claim, i);
                    }
                    return null;
                },
            },
            {
                // The smallest numbers can only merge with each other or a multiplier, and no new
                // ones appear, so a connected group of them that no multiplier touches must pair
                // off within itself: it needs an even count.
                id: 'odd-group', numeric: true,
                check(board, ts) {
                    let min = Infinity;
                    for (const i of ts) if (board.cells[i].type === 'num') min = Math.min(min, board.cells[i].value);
                    const seen = new Set();
                    for (const start of ts) {
                        const c = board.cells[start];
                        if (c.type !== 'num' || c.value !== min || seen.has(start)) continue;
                        const { group, touched } = numberGroup(board, start, (v) => v === min, seen);
                        if (group.length % 2 && !touched) return { cells: group, value: min };
                    }
                    return null;
                },
            },
            {
                // Empty cells are permanent and tiles never move except into a neighbour, so
                // separated groups of tiles can never meet. Holds for every tile type.
                id: 'split', numeric: false,
                check(board) {
                    const groups = tileGroups(board);
                    return groups.length > 1 ? { cells: [].concat(...groups), groups } : null;
                },
            },
            {
                // Numbers below v only merge with equal (hence also below-v) neighbours until they
                // reach exactly v, so each connected group of below-v numbers must add up to a
                // multiple of v. (v = 2 × smallest is the odd-group rule.) A multiplier touching
                // the group could double one of them, so such groups are not checked; no new
                // multiplier can come to touch it.
                id: 'subtotal', numeric: true,
                check(board, ts) {
                    let min = Infinity, total = 0, boost = 1;
                    for (const i of ts) {
                        const c = board.cells[i];
                        if (c.type === 'num') { min = Math.min(min, c.value); total += c.value; } else boost *= c.factor;
                    }
                    for (let v = min * 4; v <= total * boost; v *= 2) {
                        const seen = new Set();
                        for (const start of ts) {
                            const c = board.cells[start];
                            if (c.type !== 'num' || c.value >= v || seen.has(start)) continue;
                            const { group, touched } = numberGroup(board, start, (x) => x < v, seen);
                            const sum = group.reduce((s, j) => s + board.cells[j].value, 0);
                            if (sum % v && !touched) return { cells: group, sum, below: v };
                        }
                    }
                    return null;
                },
            },
            {
                // A tile worth half the total can only take part in the final merge, so every
                // other tile must combine without passing through its cell. Needs a fixed
                // total: skipped while a multiplier is on the board.
                id: 'half', numeric: true,
                check(board, ts) {
                    const total = numberTotal(board);
                    if (ts.length < 3 || total === null) return null;
                    for (const i of ts) {
                        if (board.cells[i].value * 2 !== total) continue;
                        const groups = tileGroups(board, i);
                        if (groups.length > 1) return { cells: [i], groups, value: board.cells[i].value, total };
                    }
                    return null;
                },
            },
        ].concat(cfg.conditions || []);

        // All failing conditions (`all`) or the first one, in CONDITIONS order.
        function contradictions(board, all) {
            const ts = tiles(board), found = [];
            if (ts.length < 2) return found;
            const plain = numeric(board);
            for (const cond of CONDITIONS) {
                if (cond.numeric && !plain) continue;
                const evidence = cond.check(board, ts);
                if (evidence) {
                    found.push(Object.assign({ id: cond.id }, evidence));
                    if (!all) break;
                }
            }
            return found;
        }
        function findContradiction(board) { return contradictions(board, false)[0] || null; }

        return {
            adjacency: cfg.adjacency, EMPTY, BLOCK, num, mul,
            isTile, token, parseToken, createBoard, withCells, fromRows, parse, serialize, key,
            neighbors, adjacent, mergeResult, canMerge, applyMerge, legalMoves,
            tiles, tileCount, status, numbersOnly, numeric, numberTotal, partners, tileGroups,
            contradictions: (board) => contradictions(board, true), findContradiction,
            conditionIds: CONDITIONS.map((c) => c.id),
        };
    }

    function sameMove(a, b) { return !!a && !!b && a.from === b.from && a.to === b.to; }
    function moveKey(m) { return m.from + '>' + m.to; }

    return { EMPTY, BLOCK, num, mul, isPowerOfTwo, TILE_TYPES, MERGES, ADJACENCY, createRules, DEFAULT: createRules(), sameMove, moveKey };
});
