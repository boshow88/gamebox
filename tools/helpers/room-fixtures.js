/** Game-page harness for the RTDB room transport; no network or packages. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let nextSession = 0;

function gameClient(game, backend, modules, uid = 'account', now = Date.now) {
    const events = {}, errors = [];
    const client = { user: { uid, name: uid, photo: null, anon: true }, service: null };
    const sessionId = 'tab-' + ++nextSession;
    const net = {
        ok: true, onAuth: callback => callback(client.user),
        rooms: { presence: options => modules.createRoomPresence({ ...options, now }), create: config => (client.service = modules.createRoomService({
            store: backend.createStore(config, () => client.user, sessionId, now),
            getUser: () => client.user, sessionId, generateCode: () => 'R-ABCD', now,
        }, config)) },
    };
    const hooks = game === 'beam' ? [
        'buildLobby = function () { lobbyEl = { hidden: true }; };',
        'renderLobby = renderPlayersBar = setControlsForMatch = applyHudMode = syncHud = function () {};',
        'startLocalRound = function (round, data) { om.round = round; om.localStart = performance.now(); om.memo = 3; om.answerSec = 6; om.replay = 1; om.puzzle = { exit: { r: 0, c: 0, side: 0 } }; };',
        'shell = { isPlaying: function () { return false; }, start: function () {}, goIdle: function () { toReady(); }, refreshOverlay: function () {} };',
        'setupOnline();',
        'window.roomTest = { create: doCreate, join: doJoin, attach: attachRoom, ready: doReady, start: hostStart, answer: submitAnswer, tick: watchdog, leave: doLeave, rematch: doRematch, tally: hostTally, advance: hostNextRound, finish: hostCommitOver,',
        'snapshot: function () { return { room: room, om: om, uid: netUser.uid }; } };',
        '})();',
    ] : [
        'buildLobby = function () { lobbyEl = { hidden: true }; };',
        'renderLobby = markDirty = updateHud = setOnlineBtnEnabled = function () {};',
        "resetRun = function () { G.phase = 'defense'; G.round = 1; };",
        "shell = { isPlaying: function () { return true; }, syncButtons: function () {}, goIdle: function () { G.phase = 'idle'; } };",
        'setupOnline();',
        'window.roomTest = { create: doCreate, join: doJoin, attach: attachRoom, ready: doReady, leave: doLeave, gameUpdate: onRoomGame, tick: heartbeatAndGc, resolve: hostResolve,',
        'snapshot: function () { return { room: room, om: G.online, phase: G.phase, uid: netUser.uid }; } };',
        '})();',
    ];
    const sandbox = {
        window: {
            ArcadeCommon: { i18n: { STRINGS: { en: {}, zh: {} }, t: key => key }, audio: { tone() {}, noise() {} }, math: { clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) } },
            ArcadeNet: net, addEventListener: (name, fn) => { events[name] = fn; },
        },
        document: { readyState: 'loading', addEventListener() {},
            getElementById: id => id === 'stage' ? { getContext: () => ({}) } : null },
        Path2D: class { arc() {} },
        setInterval() {}, setTimeout, clearTimeout, performance, Date: class extends Date { static now() { return now(); } },
        console: { ...console, warn: (...args) => errors.push(args) },
    };
    const source = fs.readFileSync(path.join(__dirname, '../../js/games/' + game + '.js'), 'utf8');
    assert(/\}\)\(\);\s*$/.test(source));
    vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, hooks.join('\n')), sandbox);
    return Object.assign(client, { api: sandbox.window.roomTest, events, errors });
}

module.exports = { gameClient };
