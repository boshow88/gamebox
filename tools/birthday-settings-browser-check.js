/* Reuse the isolated real-time Chrome driver with personalization fixtures. */
'use strict';
Object.assign(require('./helpers/birthday-browser-fixtures.js'), require('./helpers/birthday-settings-browser-fixtures.js'));
require('./birthday-browser-check.js');
