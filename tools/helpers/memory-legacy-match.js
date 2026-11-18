/* Explicit pre-v9 policy for retained generation/adaptation regression suites. */
'use strict';
const Match = require('../../js/games/memory-match.js');
module.exports = {
    ...Match,
    options(input) { return Match.options({ challengeVersion: 0, scoring: {version: 3}, ...input }); },
    create(roster, seats, input, seed, stamp, id) {
        return Match.create(roster, seats, { challengeVersion: 0, scoring: {version: 3}, ...input }, seed, stamp, id);
    }
};
