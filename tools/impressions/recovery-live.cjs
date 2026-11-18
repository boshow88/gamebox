/* Only temporary test-room writes; unchanged localhost assets, real Auth/RTDB. */
'use strict';
const assert = require('node:assert/strict');
module.exports = async function (ctx) {
    const { a, b, state, click, until, report, roomCode, protocol, origin, observe } = ctx;
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const uid = p => p.eval('__liveOnline.controller().service.currentPlayer().uid');
    const hostUid = await uid(a), guestUid = await uid(b);
    async function synced() {
        await until(async () => { const x = await state(a), y = await state(b); return x.data?.revision === y.data?.revision && JSON.stringify(x.data?.game) === JSON.stringify(y.data?.game); }, 'live snapshots agree');
    }
    async function reload(p) {
        const old = await state(p), marker = await p.eval('performance.timeOrigin');
        await p.send('Page.reload', { ignoreCache: true });
        await until(() => p.eval(`performance.timeOrigin!==${marker}&&!!window.__liveOnline?.controller()?.current()?.data&&__liveOnline.clock()?.isReady()`), 'live automatic recovery ' + p.name, 45000);
        const restored = await state(p);
        assert.equal(restored.id, old.id); assert.deepEqual(restored.data.participants, old.data.participants);
        if (old.data.game?.matchId) assert.equal(restored.data.game.matchId, old.data.game.matchId);
        if (old.data.game?.round === restored.data.game?.round && old.data.game?.timeline) assert.deepEqual(restored.data.game.timeline, old.data.game.timeline);
        assert.deepEqual(await p.eval('__liveErrors'), []); return restored;
    }
    async function add(p) {
        await synced(); const count = (await state(p)).data.seatOrder.length;
        assert.equal(await p.eval('__liveOnline.controller().addCpuPlayer()'), true);
        await until(async () => (await state(p)).data.seatOrder.length === count + 1, 'live owned CPU');
    }
    await a.eval('__liveOnline.controller().configure({maxRounds:2,startingHp:1000000,timing:{prepareMs:5e3,memorizeMs:6e3,answerMs:25e3,resultsMs:8e3}})');
    for (const p of [a, b]) for (let i = 0; i < 3; i++) await add(p);
    await synced(); await click(b, 'impressions-ready-btn');
    await until(() => a.eval('__liveOnline.controller().canStart()'), 'live Ready');
    const lobby = (await state(a)).data;
    await reload(a); await reload(b); await synced();
    assert.deepEqual((await state(a)).data.ready, lobby.ready); assert.equal((await state(a)).data.revision, lobby.revision);
    // Model a duplicated tab in the same browser context with a copied session key.
    // Native opener sessionStorage copying is additionally covered by the local browser suite.
    const saved = await a.eval('sessionStorage.getItem(ImpressionsRecovery.key)');
    const { targetId } = await protocol.send('Target.createTarget', { url: 'about:blank', browserContextId: a.browserContextId });
    try {
        const { sessionId } = await protocol.send('Target.attachToTarget', { targetId, flatten: true });
        const send = (method, params) => protocol.send(method, params, sessionId);
        const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.text); return r.result.value; };
        await send('Page.addScriptToEvaluateOnNewDocument', { source: observe + '\nsessionStorage.setItem("gamebox:memory:recovery:v1",' + JSON.stringify(saved) + ');' });
        await send('Page.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await send('Page.navigate', { url: origin + '/games/impressions.html' });
        try { await until(() => evaluate('!!window.__liveOnline?.controller()'), 'live duplicate collision', 45000); }
        catch (error) { console.log('Duplicate diagnostics:', await evaluate('({boot:!!window.__liveOnline,net:!!window.ArcadeNet?.ok,auth:!!window.ArcadeNet?.currentUser(),error:document.getElementById("impressions-lobby-error")?.textContent,errors:window.__liveErrors})')); throw error; }
        assert.notEqual(await evaluate('__liveOnline.controller().service.currentPlayer().uid'), hostUid);
        assert.equal(await evaluate('!!__liveOnline.controller().current()'), false);
        assert.equal((await state(a)).data.seatOrder.length, 8);
    } finally { await protocol.send('Target.closeTarget', { targetId }); }
    await a.send('Page.bringToFront');
    await click(a, 'impressions-start-btn'); await until(async () => (await state(a)).data.game.status === 'playing', 'live recovered Start');
    let first = (await state(a)).data.game;
    await reload(a); // preparation
    await until(async () => (await state(b)).view.phase === 'memorize', 'live memorize');
    await reload(b);
    await until(async () => (await state(a)).view.phase === 'answer', 'live answer');
    // Both owners refresh while seeded CPU submissions are pending.
    await reload(a); await reload(b);
    await synced(); let game = (await state(a)).data.game;
    assert.equal(game.matchId, first.matchId); assert.deepEqual(game.timeline, first.timeline);
    const token = { matchId: game.matchId, round: game.round, questionId: game.questionId, categoryId: game.categoryId };
    assert.equal(await b.eval(`__liveOnline.controller().submit(${JSON.stringify(game.question.target)},${JSON.stringify(token)},'live-guest-locked')`), true);
    await until(async () => !!(await state(b)).data.game.submissions[(await state(b)).id], 'live accepted human receipt');
    const accepted = (await state(b)).data.game.submissions[(await state(b)).id]; await reload(b);
    assert.deepEqual((await state(b)).view.answer, accepted.answer);
    await until(async () => Object.keys((await state(a)).data.game.submissions).length === 7, 'live six CPU receipts plus guest', 30000);
    const cpuBefore = (await state(a)).data.game.submissions;
    await reload(a);
    for (const [id, receipt] of Object.entries(cpuBefore)) assert.deepEqual((await state(a)).data.game.submissions[id], receipt);
    assert.equal(await a.eval(`__liveOnline.controller().submit(${JSON.stringify(game.question.target)},${JSON.stringify(token)},'live-host-locked')`), true);
    await until(async () => (await state(a)).data.game.settledRound === 1, 'live settlement after recovery'); await synced();
    const settled = (await state(a)).data.game;
    await reload(a); await reload(b);
    assert.deepEqual((await state(a)).data.game.hpUnits, settled.hpUnits);
    assert.deepEqual((await state(a)).data.game.lastResult, settled.lastResult);
    await until(async () => (await state(a)).data.game.round === 2, 'live second round');
    game = (await state(a)).data.game;
    await until(async () => (await state(a)).view.phase === 'answer', 'live second answer');
    // Let normal auto-submission/deadline settlement finish the second round.
    await until(async () => (await state(a)).data.game.status === 'over', 'live final match', 50000); await synced();
    const final = (await state(a)).data.game;
    await until(() => a.eval('!document.getElementById("impressions-match-finished").hidden'), 'live final standings', 15000);
    await reload(a); await reload(b);
    assert.equal(await b.eval('document.getElementById("impressions-match-finished").hidden'), false);
    assert.deepEqual((await state(a)).data.game, final);
    await a.eval('__liveOnline.controller().backToLobby()'); await until(async () => (await state(b)).data.phase === 'lobby', 'live rematch lobby');
    await reload(a); await reload(b); await synced();
    assert.deepEqual((await state(a)).data.ready, {}); assert.deepEqual((await state(a)).data.game, final);
    // Guest permanent disconnect: remaining host eventually removes its four actors.
    await b.eval(`(async()=>{const m=await import('https://www.gstatic.com/firebasejs/'+ArcadeNet.sdk+'/firebase-database.js');m.goOffline(m.getDatabase(undefined,FIREBASE_ROOMS.databaseURL));})()`);
    await b.send('Page.setWebLifecycleState', { state: 'frozen' });
    await until(async () => !(await state(a)).data.players[guestUid], 'live permanent presence expiry', 25000);
    assert.equal((await state(a)).data.seatOrder.length, 4); assert.equal((await state(a)).data.hostUid, hostUid);
    await b.send('Page.setWebLifecycleState', { state: 'active' });
    await b.eval(`(async()=>{const m=await import('https://www.gstatic.com/firebasejs/'+ArcadeNet.sdk+'/firebase-database.js');m.goOnline(m.getDatabase(undefined,FIREBASE_ROOMS.databaseURL));})()`);
    await until(() => b.eval('!__liveOnline.controller().current()'), 'removed guest cannot recreate membership');
    await reload(a);
    // One human + three CPUs survives a same-tab refresh with its original IDs.
    assert.equal((await state(a)).data.seatOrder.length, 4);
    await click(a, 'impressions-leave-btn');
    await until(() => a.eval('__liveOnline.controller().service.get(' + JSON.stringify(roomCode) + ').then(d=>!d)'), 'live explicit Leave deletes last-controller room');
    const marker = await a.eval('performance.timeOrigin'); await a.send('Page.reload');
    await until(() => a.eval(`performance.timeOrigin!==${marker}&&!!window.__liveOnline`), 'left page reopened');
    assert.equal(await a.eval('!!__liveOnline.controller()'), false);
    // Reinitialize Auth for the runner's temporary-account cleanup, without joining.
    await a.eval('__liveOnline.ensureOnline()');
    Object.assign(report, { recoveryVerified: true, eightActors: true, independentAuthContexts: true, sameIdsAndOwners: true, duplicateTabFenced: true, pendingCpuResumed: true, immutableReceipts: true, deadlinesPreserved: true, onceOnlyDamage: true, readyPreserved: true, permanentDisconnectCleaned: true, explicitLeaveNotRecovered: true, phases: ['lobby','prepare','memorize','answer','locked','results','finished','rematch-lobby'] });
    report.variants.push({ protocol: 14, actors: 8, rounds: 2, cpuOwners: 2, localhostReloads: true, canonicalMatchId: first.matchId ? 'unchanged' : 'missing' });
    console.log('PASS: real Firebase host/guest reloads across all phases, eight actors, pending and accepted CPU receipts, one settlement per round, Ready/rematch, duplicate fencing, grace-period cleanup and explicit Leave.');
};
