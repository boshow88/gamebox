'use strict';
const assert = require('node:assert/strict');
module.exports = async function (ctx) {
    const { page, state, click, fill, online, advance, agreed, until, pages, read, setRoomPath, backend, protocol, screenshot } = ctx;
    async function reload(p, phase) {
        const boot = await p.eval('__memoryBoot'), previous = await state(p);
        await p.send('Page.reload', { ignoreCache: true });
        await until(() => p.eval(`window.__memoryBoot>${boot}&&!!window.__memoryOnline?.controller()?.current()?.data`), 'automatic recovery ' + p.name);
        const current = await state(p);
        assert.equal(current.uid, previous.uid); assert.equal(current.id, previous.id);
        assert.deepEqual(current.data.participants, previous.data.participants);
        assert.equal(current.data.game?.matchId, previous.data.game?.matchId);
        if (previous.data.game?.timeline) assert.deepEqual(current.data.game.timeline, previous.data.game.timeline);
        if (phase) assert.equal(current.view.phase, phase);
        assert.equal(await p.eval('window.__fixtureSignIns||0'), 0, 'Auth restored before deciding whether to sign in');
        assert.deepEqual(await p.eval('__pageErrors'), []);
        const trace = await p.eval('window.__cleanupTrace||[]');
        if (trace.includes('resume-done')) assert(trace.indexOf('resume-done') < trace.indexOf('cleanup'), 'Recovery commits before entry cleanup');
        return current;
    }
    const a = await page('Host', 1200, 900, 0), b = await page('Guest', 320, 568, 0);
    for (const p of [a, b]) {
        const source = `window.__cleanupTrace=[];addEventListener('arcade-net-ready',()=>{const net=ArcadeNet,create=net.rooms.create;net.rooms.create=function(config){const service=create(config);let count=0;return {...service,resume:async(...args)=>{const result=await service.resume(...args);__cleanupTrace.push('resume-done');return result;},cleanup:()=>{__cleanupTrace.push('cleanup');if(!net.currentUser())throw Error('Cleanup before Auth');if(++count===1){${p===a?'return new Promise(()=>{});':'throw Error("fixture cleanup failure");'}}return Promise.resolve(0);}};};});`;
        await p.send('Page.addScriptToEvaluateOnNewDocument', { source }); await p.eval(source);
    }
    await online(a); await online(b);
    for (const p of [a, b]) {
        await until(() => p.eval('__cleanupTrace.includes("cleanup")'), 'authenticated entry cleanup attempted');
        await p.eval('Promise.all([__memoryOnline.ensureOnline(),__memoryOnline.ensureOnline()])');
        assert.equal(await p.eval('__cleanupTrace.filter(x=>x==="cleanup").length'), 1, 'Repeated initialization does not duplicate cleanup');
    }
    await fill(a, 'memory-max-rounds', 2); await click(a, 'memory-create-btn');
    await until(async () => !!(await state(a)).data?.code, 'recovery room');
    const code = (await state(a)).data.code; setRoomPath('rooms/memory_rooms/R-' + code); a.uid = (await state(a)).uid;
    await fill(b, 'memory-code-input', code); await click(b, 'memory-join-btn');
    await until(async () => Object.keys((await state(b)).data?.players || {}).length === 2, 'guest membership'); b.uid = (await state(b)).uid;
    for (const p of [a, b]) for (let i = 0; i < 3; i++) {
        await until(() => p.eval(`__memoryOnline.controller().current().data.revision===${read().revision}`), 'CPU edit revision');
        const count = read().seatOrder.length; assert.equal(await p.eval('__memoryOnline.controller().addCpuPlayer()'), true);
        await until(() => read().seatOrder.length === count + 1, 'CPU edit committed');
    }
    await until(() => read().seatOrder.length === 8, 'eight actors');
    await until(() => b.eval(`__memoryOnline.controller().current().data.revision===${read().revision}`), 'lobby revision');
    await click(b, 'memory-ready-btn'); await until(() => !!read().ready[b.uid], 'Ready accepted');
    const lobby = structuredClone(read());
    await reload(a); await reload(b);
    assert.deepEqual(read().ready, lobby.ready); assert.equal(read().revision, lobby.revision);
    assert.deepEqual(read().seatOrder, lobby.seatOrder);
    // A real window.open copies the opener's sessionStorage in Chrome.
    const before = (await protocol.send('Target.getTargets')).targetInfos.map(t => t.targetId);
    await a.send('Runtime.evaluate', { expression: 'void window.open(location.href)', userGesture: true });
    let target;
    await until(async () => { target = (await protocol.send('Target.getTargets')).targetInfos.find(t => !before.includes(t.targetId) && t.type === 'page'); return !!target; }, 'duplicated tab');
    const { sessionId } = await protocol.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const dup = { eval: async expression => { const r = await protocol.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw Error(r.exceptionDetails.text); return r.result.value; } };
    await until(() => dup.eval('!!window.__memoryOnline?.controller()'), 'duplicate identity collision resolved');
    assert.notEqual(await dup.eval('__memoryOnline.controller().service.currentPlayer().uid'), a.uid);
    assert.equal(await dup.eval('!!__memoryOnline.controller().current()'), false);
    assert(await dup.eval('document.getElementById("memory-lobby-error").textContent.includes("Another active tab")||document.getElementById("memory-lobby-error").textContent.includes("另一個分頁")'));
    assert.deepEqual(read().participants, lobby.participants);
    await protocol.send('Target.closeTarget', { targetId: target.targetId });
    const independent = await page('Independent', 390, 844, 0, a.browserContextId); await online(independent);
    assert.notEqual((await state(independent)).uid, a.uid); assert.equal((await state(independent)).data, undefined);
    pages.splice(pages.indexOf(independent), 1); await protocol.send('Target.closeTarget', { targetId: independent.targetId });
    console.log('PASS: desktop/mobile automatic lobby recovery, delayed Auth restoration, Ready/revision persistence, real opener storage-copy collision and independent tab identity.');

    await until(() => a.eval('__memoryOnline.controller().canStart()'), 'preserved Ready permits Start');
    await click(a, 'memory-start-btn'); await until(() => read().phase === 'playing', 'recovered room starts'); await agreed('started');
    let game = structuredClone(read().game);
    await reload(a, 'prepare');
    await advance(game.timeline.memorizeAt + 50); await reload(b, 'memorize');
    await advance(game.timeline.answerAt + 50); await reload(a, 'answer');
    const token = { matchId: game.matchId, round: game.round, questionId: game.questionId, categoryId: game.categoryId };
    await b.eval(`__memoryOnline.controller().submit(${JSON.stringify(game.question.target)},${JSON.stringify(token)},'locked-before-reload')`);
    await until(() => !!read().game.submissions[(lobby.seatOrder.find(id => lobby.participants[id].type === 'human' && lobby.participants[id].controllerId === b.uid))], 'immutable receipt');
    const receipt = structuredClone(read().game.submissions[(await state(b)).id]);
    await reload(b, 'waiting'); assert.deepEqual((await state(b)).view.answer, receipt.answer);
    await advance(game.timeline.deadline - 1000);
    const accepted = structuredClone(read().game.submissions); await reload(a, 'answer');
    for (const [id, value] of Object.entries(accepted)) assert.deepEqual(read().game.submissions[id], value);
    assert.equal(Object.keys(read().game.submissions).length, 7, 'Six CPU receipts plus guest; no duplicate action');
    await a.eval(`__memoryOnline.controller().submit(${JSON.stringify(game.question.target)},${JSON.stringify(token)},'host-answer')`);
    await until(() => read().game.settledRound === 1, 'early settlement after recovery'); await agreed('results snapshots');
    const settled = structuredClone(read().game); await reload(a); await reload(b);
    assert.deepEqual(read().game, settled); await screenshot(b, 'recovery-results-mobile');
    await advance(settled.resultsUntil + 1); await agreed('round two'); game = structuredClone(read().game);
    // Guest is suspended across the deadline; it gets no replacement answer period.
    await advance(game.timeline.deadline - 2000); await b.send('Page.setWebLifecycleState', { state: 'frozen' });
    await advance(game.timeline.deadline + 10, [a]); await b.send('Page.setWebLifecycleState', { state: 'active' });
    // The grace-period cleanup may legitimately remove a very long absence. Keep
    // phase restoration itself isolated from that separate removal scenario below.
    if (!read().players[b.uid]) throw Error('Guest unexpectedly removed before phase test');
    await reload(b); await until(() => read().game.status === 'over', 'final state'); await advance(read().game.resultsUntil + 1); await agreed('final summary');
    await reload(a); await reload(b);
    assert.equal(await b.eval('document.getElementById("memory-match-finished").hidden'), false);
    assert.equal(read().game.matchId, game.matchId);
    const final = structuredClone(read().game); await a.eval('__memoryOnline.controller().backToLobby()');
    await until(() => read().phase === 'lobby', 'rematch lobby'); await reload(a); await reload(b);
    assert.deepEqual(read().game, final); assert.deepEqual(read().ready, {});
    console.log('PASS: eight actors / two CPU owners recover preparation, memory, answer, immutable submitted receipt, CPU resumption, results, final summary and rematch lobby without restarting clocks or changing HP.');

    // Pitch audio is a fresh document capability, independent of general Ready.
    await a.eval('__memoryOnline.controller().configure({categoryWeights:{color:0,quantity:0,pitch:2}})');
    await until(() => b.eval(`__memoryOnline.controller().current().data.revision===${read().revision}`), 'Pitch revision');
    for (const p of [a, b]) await click(p, 'memory-room-enable-audio');
    await until(() => Object.keys(read().audioReady || {}).length === 2, 'Pitch confirmations');
    await click(b, 'memory-ready-btn'); await until(() => !!read().ready[b.uid], 'Pitch Ready');
    const ready = structuredClone(read().ready), rev = read().revision;
    await reload(b); assert.deepEqual(read().ready, ready); assert.equal(read().revision, rev);
    assert.equal(await b.eval('__memoryView.audioReadiness().confirmed'), false);
    await until(() => a.eval('!__memoryOnline.controller().canStart()'), 'host observes refreshed audio acknowledgement removal');
    await click(b, 'memory-room-enable-audio'); await until(() => a.eval('__memoryOnline.controller().canStart()'), 'reconfirmed audio permits Start');
    await a.eval('__memoryOnline.controller().configure({maxRounds:1})');
    await until(() => b.eval(`__memoryOnline.controller().current().data.revision===${read().revision}`), 'one-round Pitch revision');
    await click(b, 'memory-ready-btn'); await until(() => a.eval('__memoryOnline.controller().canStart()'), 'Pitch restart ready');
    await click(a, 'memory-start-btn'); await until(() => read().phase === 'playing', 'Pitch started');
    const pitch = structuredClone(read().game); await advance(pitch.timeline.memorizeAt + 100); await reload(b, 'memorize');
    assert.equal(await b.eval('__memoryView.audioReadiness().confirmed'), false);
    await click(b, 'memory-online-btn');
    assert.equal(await b.eval('document.getElementById("memory-enable-audio").disabled'), true, 'Existing memorization sound-test guard remains');
    await advance(pitch.timeline.answerAt + 100);
    assert(await b.eval('document.getElementById("memory-audio-instruction").textContent.includes("already running")'));
    await click(b, 'memory-room-enable-audio'); await click(b, 'memory-lobby-close');
    assert.deepEqual(read().game.timeline, pitch.timeline); assert.equal(read().game.matchId, pitch.matchId);
    await advance(pitch.timeline.deadline + 10); await until(() => read().game.status === 'over', 'recovered Pitch ends normally');
    await advance(read().game.resultsUntil + 1); await a.eval('__memoryOnline.controller().backToLobby()');
    await until(() => read().phase === 'lobby', 'Pitch returns to lobby');
    const oldGuestLocation = await b.eval('sessionStorage.getItem(MemoryRecovery.key)');
    // Guest Leave removes only its human and CPUs; refreshing cannot rejoin it.
    await click(b, 'memory-leave-btn'); await until(() => read().seatOrder.length === 4, 'explicit guest departure');
    const boot = await b.eval('__memoryBoot'); await b.send('Page.reload');
    await until(() => b.eval(`window.__memoryBoot>${boot}&&!!window.__memoryOnline`), 'left page reload');
    assert.equal(await b.eval('!!__memoryOnline.controller()'), false);
    // A stale stored location cannot silently recreate a deliberately removed seat.
    await b.eval(`sessionStorage.setItem(MemoryRecovery.key,${JSON.stringify(oldGuestLocation)})`);
    const endedBoot = await b.eval('__memoryBoot'); await b.send('Page.reload');
    await until(() => b.eval(`window.__memoryBoot>${endedBoot}&&!!window.__memoryOnline?.controller()`), 'stale membership recovery rejected');
    assert.equal(await b.eval('!!__memoryOnline.controller().current()'), false);
    assert(await b.eval('document.getElementById("memory-lobby-error").textContent.includes("membership has ended")'));
    // Closing a host document is a disconnect, not a voluntary departure.
    const closeUid = a.uid; await a.send('Page.navigate', { url: 'about:blank' }); pages.splice(pages.indexOf(a), 1);
    const c = await page('Remaining', 390, 844, 0); await online(c); await fill(c, 'memory-code-input', code); await click(c, 'memory-join-btn');
    await until(async () => !!(await state(c)).data, 'new lobby member'); c.uid = (await state(c)).uid;
    await advance((await state(c)).now + 17000, [c]);
    await until(() => !read().players[closeUid], 'permanent disconnect removal');
    assert.equal(read().hostUid, c.uid); assert.equal(read().seatOrder.length, 1);
    await c.eval('__memoryOnline.controller().leave()');
    await until(() => backend.read('rooms/memory_rooms/R-' + code) === null, 'test room removed');
    const missingBoot = await c.eval('__memoryBoot'); await c.send('Page.reload');
    await until(() => c.eval(`window.__memoryBoot>${missingBoot}&&!!window.__memoryOnline?.controller()`), 'deleted room recovery rejected');
    assert.equal(await c.eval('!!__memoryOnline.controller().current()'), false);
    assert(await c.eval('document.getElementById("memory-lobby-error").textContent.includes("no longer exists")'));
    await c.eval(`(()=>{const v=JSON.parse(sessionStorage.getItem(MemoryRecovery.key));v.uid='different-auth';v.room=${JSON.stringify(code)};sessionStorage.setItem(MemoryRecovery.key,JSON.stringify(v));})()`);
    const authBoot = await c.eval('__memoryBoot'); await c.send('Page.reload');
    await until(() => c.eval(`window.__memoryBoot>${authBoot}&&!!window.__memoryOnline?.controller()`), 'different UID metadata rejected');
    assert.equal(await c.eval('!!__memoryOnline.controller().current()'), false);
    assert(await c.eval('document.getElementById("memory-lobby-error").textContent.includes("identity changed")'));
    await c.eval('ArcadeNet.signOut()');
    await until(() => c.eval('!__memoryOnline.controller()&&!__memoryOnline.clock().isReady()'), 'live-page auth change detaches and disposes clock');
    await c.eval('__memoryOnline.ensureOnline()'); assert(await c.eval('!!__memoryOnline.controller()'));
    await c.eval('__fixtureChangeAuth({uid:"changed-a",isAnonymous:true});__fixtureChangeAuth({uid:"changed-b",isAnonymous:true})');
    await c.eval('__memoryOnline.ensureOnline()');
    assert(await c.eval('__memoryOnline.controller().service.currentPlayer().uid.startsWith("changed-b_")'));
    assert.equal(await c.eval('!!__memoryOnline.controller().current()'), false);
    for (const p of [b, c]) assert.deepEqual(await p.eval('__pageErrors'), []);
    console.log('PASS: Pitch reconfirmation with preserved Ready; explicit Leave, stale/missing room and changed-UID rejection; permanent closure expires after grace, removes owned CPUs and migrates host.');
};
