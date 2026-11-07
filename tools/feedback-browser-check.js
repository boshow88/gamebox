/* Reuse the isolated Chrome driver with feedback-only fake accounts. */
'use strict';
Object.assign(require('./helpers/birthday-browser-fixtures.js'), require('./helpers/feedback-browser-fixtures.js'));
require('./birthday-browser-check.js');
