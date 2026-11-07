/* Real Darts DOM checks, injected by rooms-browser-check.js. No production hooks. */
const dartsApi = f => f.contentWindow.__dartsTest;
const dartsDoc = f => f.contentDocument;
const dartsData = f => dartsApi(f).snapshot().data;
function dartsAssert(value, message) { if (!value) throw new Error(message); }
function dartsConfirmHandoff(f) {
    const overlay = dartsDoc(f).getElementById('handoff-overlay');
    if (dartsApi(f).snapshot().feedback && dartsApi(f).snapshot().feedback.blocking && overlay.hidden) {
        f.contentWindow.__dartsNow += 1500; dartsApi(f).refresh();
    }
    if (!overlay.hidden) dartsClick(f, 'handoff-ready-btn');
}
function dartsThrow(f) {
    dartsConfirmHandoff(f);
    dartsAssert(dartsApi(f).gesture(), 'Intended fixture throw requires an enabled, confirmed turn');
    dartsApi(f).land();
}
const dartsHit = (base, mult = 1) => ({ base, mult, score: base * mult, label: (mult === 3 ? 'T' : mult === 2 ? 'D' : 'S') + base, miss: false });
async function dartsBoot(uid, width = 390, height = 844) {
    const f = frame('darts', uid); f.style.width = width + 'px'; f.style.height = height + 'px';
    await until(() => dartsApi(f) && dartsDoc(f).getElementById('lobby').open, 'unified Darts lobby boot');
    f.contentWindow.ArcadeCommon.i18n.setLocale('en');
    return f;
}
function dartsClick(f, id) {
    const button = dartsDoc(f).getElementById(id);
    dartsAssert(button && !button.disabled, 'Missing/enabled Darts control: ' + id);
    button.click();
}
async function dartsChange(f, id, value) {
    // Keep historical 501 UI scenarios exercising the migrated X01 selector.
    if (id === 'mode-select' && value === '501') value = 'x01';
    const input = dartsDoc(f).getElementById(id);
    dartsAssert(input, 'Darts setting: ' + id);
    await until(() => !input.disabled, 'editable Darts setting ' + id);
    input.value = String(value);
    input.dispatchEvent(new f.contentWindow.Event('change', { bubbles: true }));
    const fields = { 'mode-select': 'mode', 'match-select': 'legsToWin', 'timer-select': 'turnMs', 'rounds-select': 'roundLimit',
        'out-select': 'outRule', 'in-select': 'inRule', 'bull-select': 'bullMode', 'cricket-select': 'cricketVariant',
        'starting-score-select': 'startingScore', 'starting-player-select': 'startingPlayer', 'settlement-select': 'settlement' };
    await until(() => String(dartsData(f).options[fields[id]]) === String(value) && !input.disabled, 'accepted Darts setting ' + id);
}
function dartsFinishPresentation(f) {
    const w = f.contentWindow;
    w.__dartsNow += w.DartsFeedback.TIMING.finalHit + 1;
    dartsApi(f).refresh();
}
async function dartsAdd(f, count) {
    const before = dartsData(f).seatOrder.length;
    for (let i = 0; i < count; i++) {
        await until(() => !dartsDoc(f).getElementById('add-player-btn').disabled, 'Add local player available');
        dartsClick(f, 'add-player-btn');
        await until(() => dartsData(f).seatOrder.length === before + i + 1, 'add local Darts slot');
        await sleep(1);
    }
}
async function dartsStartLocal(f) {
    dartsClick(f, 'lobby-start-btn');
    dartsAssert(dartsDoc(f).getElementById('lobby-start-btn').disabled && dartsDoc(f).getElementById('lobby-start-btn').textContent === f.contentWindow.ArcadeCommon.i18n.t('dartsLobbyStarting'), 'Pending start has a disabled Starting label');
    await until(() => dartsApi(f).snapshot().match && dartsApi(f).snapshot().match.status === 'playing' && !dartsDoc(f).getElementById('lobby').open, 'local match start');
}
async function dartsReturn(f) {
    if (!dartsDoc(f).getElementById('lobby').open) dartsClick(f, 'settings-btn');
    dartsClick(f, 'back-lobby-btn');
    await until(() => dartsData(f).phase === 'lobby' && dartsDoc(f).getElementById('lobby').open, 'return to persistent lobby');
}
async function dartsFlick(f, target) {
    const w = f.contentWindow, bounds = target.getBoundingClientRect(), x = bounds.left + bounds.width / 2, y = bounds.bottom - 8;
    target.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
    await sleep(60); w.dispatchEvent(new w.PointerEvent('pointermove', { clientX: x, clientY: y - 60, pointerId: 1, isPrimary: true }));
    await sleep(60); w.dispatchEvent(new w.PointerEvent('pointermove', { clientX: x, clientY: y - 140, pointerId: 1, isPrimary: true }));
    w.dispatchEvent(new w.PointerEvent('pointerup', { clientX: x, clientY: y - 140, pointerId: 1, isPrimary: true }));
    dartsApi(f).land();
}
function dartsFlight(x, y) {
    const t = 2370 / 12600;
    return { pos: { x: 0, y: -292, z: 0 }, vel: { x: x / t, y: (y + 292 + 2450 * t * t) / t, z: 12600 }, tempo: 1 };
}
function dartsRoomTools(code, frames) {
    const roomKey = 'rooms/darts_rooms/R-' + code;
    const read = () => decode(JSON.parse(localStorage.getItem('__rooms-browser-db') || '{}')[roomKey]);
    const mutate = fn => {
        const tree = JSON.parse(localStorage.getItem('__rooms-browser-db') || '{}'), data = decode(tree[roomKey]);
        fn(data); tree[roomKey] = encode(data); localStorage.setItem('__rooms-browser-db', JSON.stringify(tree));
    };
    const syncClock = () => {
        const stamp = Math.max(read().game.readyAt || 0, ...frames.map(f => f.contentWindow.__dartsNow)) + 1;
        frames.forEach(f => { f.contentWindow.__dartsNow = stamp; });
    };
    const active = () => frames.find(f => dartsApi(f).snapshot().uid === read().game.owners[read().game.active]);
    async function throwAt(x, y, beforeLand) {
        syncClock(); dartsConfirmHandoff(active()); const old = read().game.seq;
        dartsAssert(await dartsApi(active()).controller().submit(dartsFlight(x, y)), 'Controlling device throw rejected');
        await until(() => frames.every(f => dartsApi(f).snapshot().match && dartsApi(f).snapshot().match.seq > old), 'accepted Darts throw sync');
        if (beforeLand) await beforeLand();
        frames.forEach(f => dartsApi(f).land());
    }
    return { read, mutate, syncClock, active, throwAt };
}
async function dartsPromote(f) {
    dartsDoc(f).getElementById('invite-details').open = true;
    dartsClick(f, 'create-room-btn');
    await until(() => dartsApi(f).snapshot().room && /^[A-Z0-9]{4}$/.test(dartsDoc(f).getElementById('room-code').textContent), 'promote local Darts room');
    return dartsDoc(f).getElementById('room-code').textContent;
}
async function dartsJoin(f, code) {
    dartsDoc(f).getElementById('invite-details').open = true;
    const input = dartsDoc(f).getElementById('room-code-input');
    input.value = ' r-' + code.toLowerCase() + ' ';
    input.dispatchEvent(new f.contentWindow.Event('input', { bubbles: true }));
    dartsAssert(input.value === code && input.maxLength === 4, 'Darts code normalization');
    dartsClick(f, 'join-room-btn');
    await until(() => dartsApi(f).snapshot().room && dartsApi(f).snapshot().room.code === code, 'join Darts room');
}
async function dartsStartOnline(host, guests) {
    for (const f of guests) {
        await until(() => !dartsDoc(f).getElementById('lobby-start-btn').disabled, 'guest Ready control');
        dartsClick(f, 'lobby-start-btn');
    }
    await until(() => !dartsDoc(host).getElementById('lobby-start-btn').disabled, 'host start after every device ready');
    dartsClick(host, 'lobby-start-btn');
    await until(() => [host, ...guests].every(f => dartsApi(f).snapshot().match && dartsApi(f).snapshot().match.status === 'playing' && !dartsDoc(f).getElementById('lobby').open), 'online Darts match start');
}
async function checkDartsContextV2() {
    const f = await dartsBoot('context-player'), doc = dartsDoc(f), w = f.contentWindow;
    const note = () => doc.getElementById('lobby-rule-note').textContent;
    const firstName = dartsData(f).participants[dartsData(f).seatOrder[0]].name;
    dartsAssert(firstName === 'Player 1' && firstName !== w.ArcadeCommon.i18n.t('dartsYou'), 'Default display name identifies a player rather than a viewer-relative You');
    dartsAssert(!doc.getElementById('online-btn') && doc.getElementById('settings-btn'), 'Room is the single toolbar entry for room and invitations');
    dartsAssert(doc.querySelector('.darts-lobby-slot.owned .slot-device.owned[aria-label]'), 'Local ownership has a compact accessible device cue');
    dartsAssert(!doc.querySelector('.slot-meta') && !doc.querySelector('.darts-gesture-help').open, 'Repeated ownership prose and expanded gesture instructions do not fill the lobby');
    dartsAssert(note().includes('one dart at a time') && !note().includes('three darts each'), 'Solo Practice describes only free throws');
    await dartsChange(f, 'mode-select', 'cricket');
    dartsAssert(note().includes('at least 2') && !note().includes('Standard') && !note().includes('1–2'), 'One-player Cricket explains its minimum without recommending an invalid one-player game');
    await dartsAdd(f, 1);
    dartsAssert(note().includes('2 players: Standard') && !note().includes('Cut-Throat'), 'Two-player automatic Cricket explains only Standard');
    await dartsAdd(f, 1);
    dartsAssert(note().includes('3 players: Cut-Throat') && note().includes('penalize every opponent') && !note().includes('Extra marks score for you'), 'Three-player automatic Cricket explains Cut-Throat recipients');
    await dartsChange(f, 'cricket-select', 'standard'); await dartsAdd(f, 1);
    dartsAssert(dartsData(f).options.cricketVariant === 'standard' && note().includes('Extra marks score for you') && !note().includes('Cut-Throat'), 'Explicit Standard survives population changes and describes the selected variant');
    await dartsChange(f, 'rounds-select', 0);
    dartsAssert(note().includes('No round limit') && !note().includes('After ') && !note().includes('Tied players'), 'Unlimited Cricket does not explain finite settlement or a nonexistent limit tiebreak');
    await dartsChange(f, 'mode-select', '501'); await dartsChange(f, 'out-select', 'master');
    await dartsChange(f, 'in-select', 'double'); await dartsChange(f, 'bull-select', '50-50');
    dartsAssert(note().includes('Finish on a double, triple or Bull') && note().includes('A double or inner Bull opens scoring') && note().includes('Both Bulls score 50') && note().includes('Outer Bull still does not count as a double'), '501 description reflects selected In, Out and actual Bull category');
    dartsAssert(!note().includes('Count-Up') && !note().includes('Cricket'), '501 explanation excludes other game modes');
    await dartsChange(f, 'rounds-select', 0);
    dartsAssert(note().includes('No round limit') && !note().includes('lowest remaining score wins') && !note().includes('Tied players'), 'Unlimited 501 omits round-limit settlement');
    await dartsChange(f, 'mode-select', 'countup'); await dartsChange(f, 'rounds-select', 5);
    dartsAssert(note().includes('5 rounds') && !note().includes('8 rounds') && !note().includes('501') && !note().includes('checkout'), 'Count-Up explanation uses current round count and scoring rules');
    w.ArcadeCommon.i18n.setLocale('zh');
    dartsAssert(note().includes('5回合') && !note().includes('5 回合') && !/[。；，] +/.test(note()), 'Chinese explanations use natural number spacing and no English sentence gaps');
    const compact = doc.getElementById('lobby-rule-summary').textContent;
    dartsAssert(compact.includes('5回合') && compact.includes('每回合3鏢') && compact.includes('紅心50／50'), 'Chinese rule summaries format numbers without inherited English spacing');
    dartsAssert(w.ArcadeCommon.i18n.t('dartsPlayerNumber', 1) === '玩家1', 'Chinese generated player names do not inherit English number spacing');
    dartsAssert([...doc.querySelectorAll('#lobby-slots .slot-name')].every(input => !['你', 'You'].includes(input.value)), 'Switching locale does not turn player names into You');
    const namedSlot = dartsData(f).seatOrder[0], customName = '陳 大明 Alice Chen';
    const nameField = [...doc.querySelectorAll('#lobby-slots .slot-name')].find(input => input.dataset.slotId === namedSlot);
    nameField.value = customName; nameField.dispatchEvent(new w.Event('change', { bubbles: true }));
    await until(() => dartsData(f).participants[namedSlot].name === customName && !doc.getElementById('lobby-start-btn').disabled, 'manual name including meaningful spaces');
    dartsClick(f, 'lobby-start-btn');
    await until(() => dartsApi(f).snapshot().match && !doc.getElementById('lobby').open, 'Chinese Count-Up start');
    dartsAssert(doc.getElementById('match-meta').textContent.includes('第1局') && doc.querySelector('.status-round').textContent === '第1/5回合', 'Chinese dynamic HUD labels follow the spacing convention');
    dartsThrow(f); dartsClick(f, 'history-btn');
    dartsAssert(doc.querySelector('.history-turn h3').textContent.startsWith('局1 · 回合1 · '), 'Chinese history headings format dynamic numbers correctly');
    dartsAssert(!/\p{Script=Han} +\d/u.test(doc.querySelector('.history-turn-summary').textContent), 'Chinese history totals do not add English label-value spacing');
    dartsAssert(dartsData(f).participants[namedSlot].name === customName && [...doc.querySelectorAll('.darts-player-name')].some(el => el.textContent === customName), 'Copy spacing changes preserve user-entered Chinese and English name spaces');
    dartsClick(f, 'history-close-btn'); w.ArcadeCommon.i18n.setLocale('en');
    dartsAssert(doc.getElementById('match-meta').textContent.includes('Leg 1') && doc.querySelector('#in-select option[value="open"]').textContent === 'Open In', 'English label spacing and internal term spacing remain intact');
    f.remove();
}
async function checkDartsReservedLocalV2() {
    const a = await dartsBoot('reserved-host'), doc = dartsDoc(a), api = dartsApi(a);
    await dartsAdd(a, 1);
    const code = await dartsPromote(a), tools = dartsRoomTools(code, [a]);
    await dartsStartOnline(a, []);
    const matchId = tools.read().game.matchId, firstSlot = api.snapshot().match.active;
    dartsAssert(tools.read().game.execution === 'local' && api.snapshot().match.execution === 'local', 'A room code with only host-owned seats starts a local match');
    const initialStored = JSON.stringify(tools.read().game);
    await dartsFlick(a, doc.getElementById('mode-panel')); dartsThrow(a);
    dartsAssert(api.snapshot().match.seq === 2 && api.snapshot().match.history[0].darts.length === 2 && dartsData(a).game.seq === 2,
        'Reserved room uses live local match state and accepts repeated local throws');
    dartsAssert(JSON.stringify(tools.read().game) === initialStored, 'Local throws do not publish per-dart room state');
    dartsAssert(!doc.getElementById('pause-btn').disabled && doc.querySelectorAll('.darts-player .owned-seat').length === 2,
        'Host-only coded match retains local pause and compact ownership cues');
    dartsClick(a, 'pause-btn');
    const pausedSeq = api.snapshot().match.seq, beat = tools.read().presence[api.snapshot().uid];
    dartsAssert(api.snapshot().shellState === 'paused', 'Timer-Off local match can pause');
    await api.controller().service.heartbeat(code, 0);
    await until(() => tools.read().presence[api.snapshot().uid] !== beat, 'reservation heartbeat committed');
    await sleep(30);
    dartsAssert(api.snapshot().shellState === 'paused' && api.snapshot().match.seq === pausedSeq && api.snapshot().match.history[0].darts.length === 2,
        'Reservation heartbeat cannot resume or overwrite the paused local match');
    dartsAssert(JSON.stringify(tools.read().game) === initialStored, 'Presence writes leave stored scoring unchanged');
    dartsClick(a, 'pause-btn'); await dartsReturn(a);
    dartsAssert(tools.read().phase === 'lobby' && tools.read().game.status === 'over' && tools.read().game.endReason === 'practice-ended',
        'Returning ends local Practice and republishes results to the same room');
    dartsAssert(tools.read().game.matchId === matchId && tools.read().game.history[0].uid === firstSlot && tools.read().game.history[0].darts.length === 2 && tools.read().game.history[0].finished,
        'Ending partial Practice preserves its accepted darts and finalizes the history row');
    const secondSlot = dartsData(a).seatOrder[1];
    const remove = [...doc.querySelectorAll('[data-remove-slot]')].find(button => button.dataset.removeSlot === secondSlot);
    remove.click(); await until(() => dartsData(a).seatOrder.length === 1, 'return to one host-owned participant');
    await dartsChange(a, 'mode-select', 'countup'); await dartsChange(a, 'rounds-select', 5); await dartsChange(a, 'timer-select', 0);
    await dartsStartOnline(a, []);
    const countupStored = JSON.stringify(tools.read().game), slot = api.snapshot().match.players[0];
    for (let i = 0; i < 15; i++) dartsThrow(a);
    dartsAssert(api.snapshot().match.status === 'over' && api.snapshot().match.stats[slot].darts === 15 && dartsData(a).phase === 'results',
        'Reserved local solo Count-Up finishes without waiting for shared room scoring');
    dartsFinishPresentation(a);
    dartsAssert(JSON.stringify(tools.read().game) === countupStored && !doc.getElementById('leg-result').hidden,
        'Reserved local Count-Up keeps results visible and avoids per-dart network writes');
    dartsClick(a, 'result-room-btn');
    await until(() => tools.read().phase === 'lobby' && doc.getElementById('lobby').open, 'publish Count-Up results while retaining invitation');
    dartsAssert(api.snapshot().room.code === code && tools.read().game.history.length === 5 && tools.read().game.stats[slot].darts === 15,
        'Finished Count-Up history publishes when returning, retaining the same invitation code');
    const b = await dartsBoot('reserved-guest');
    await dartsJoin(b, code); await dartsStartOnline(a, [b]);
    dartsAssert(tools.read().game.execution === 'shared' && dartsApi(b).snapshot().match.execution === 'shared',
        'The same room automatically uses shared execution after a remote device joins');
    const shared = dartsRoomTools(code, [a, b]);
    await shared.throwAt(0, 80);
    dartsAssert(shared.read().game.seq === 1 && api.snapshot().match.seq === 1 && dartsApi(b).snapshot().match.seq === 1,
        'Remote participation restores accepted per-dart synchronization');
    await api.controller().leave(); await dartsApi(b).controller().leave(); a.remove(); b.remove();
}
async function checkDartsReservedLossV2() {
    const f = await dartsBoot('lost-reservation'), doc = dartsDoc(f), api = dartsApi(f);
    await dartsAdd(f, 1);
    const code = await dartsPromote(f); await dartsStartOnline(f, []);
    for (let i = 0; i < 3; i++) dartsThrow(f);
    const matchId = api.snapshot().match.matchId, seq = api.snapshot().match.seq;
    dartsAssert(!doc.getElementById('handoff-overlay').hidden && api.snapshot().feedback.blocking, 'Reserved local match has a pending same-device handoff before room removal');
    await api.controller().service.remove(code);
    await until(() => !api.snapshot().room, 'lost reservation falls back to local play');
    dartsAssert(api.snapshot().match && api.snapshot().match.matchId === matchId && api.snapshot().match.seq === seq && !doc.getElementById('lobby').open,
        'Losing a room reservation preserves local match and history without interrupting play');
    dartsAssert(!doc.getElementById('handoff-overlay').hidden && api.snapshot().feedback.blocking && !api.gesture(), 'Controller alias changes on room loss preserve the pending handoff input gate');
    await dartsFlick(f, doc.getElementById('mode-panel'));
    dartsAssert(api.snapshot().match.seq === seq, 'Room loss cannot silently confirm a pending handoff');
    dartsClick(f, 'handoff-ready-btn');
    await dartsFlick(f, doc.getElementById('mode-panel'));
    dartsAssert(api.snapshot().match.seq === seq + 1 && dartsData(f).phase === 'playing', 'Local throwing continues after reservation disappears');
    f.remove();
}
async function checkDartsSupersededFlightV2() {
    for (const mode of ['501', 'cricket']) {
        const a = await dartsBoot('superseded-' + mode + '-host'), b = await dartsBoot('superseded-' + mode + '-guest'), frames = [a, b];
        await dartsAdd(a, 1); await dartsChange(a, 'mode-select', mode); await dartsChange(a, 'timer-select', 30000);
        const code = await dartsPromote(a), tools = dartsRoomTools(code, frames);
        await dartsJoin(b, code); await dartsAdd(b, 1); await dartsStartOnline(a, [b]);
        const before = tools.read().game, previous = before.active;
        tools.mutate(data => {
            if (mode === '501') { data.game.scores[previous] = 10; data.game.turnStartScore = 10; }
            else data.game.marks[previous][20] = 3;
        });
        await until(() => frames.every(f => mode === '501' ? dartsApi(f).snapshot().match.scores[previous] === 10 : dartsApi(f).snapshot().match.marks[previous][20] === 3), 'superseded flight fixture accepted');
        await tools.throwAt(0, 103, async () => {
            const dart = tools.read().game, acceptedSeq = dart.seq;
            dartsAssert(mode === '501' ? dart.lastDart.reason === 'bust' : Object.keys(dart.lastDart.penalties).length === 3, 'Accepted in-flight fixture has the intended Bust or penalty event');
            frames.forEach(f => { f.contentWindow.__dartsNow = dart.turnStartedAt + dart.turnMs + 1; });
            await dartsApi(a).controller().expire();
            await until(() => frames.every(f => dartsApi(f).snapshot().match.seq > acceptedSeq), 'authoritative timeout supersedes the accepted flight before impact');
        });
        const current = tools.read().game;
        for (const f of frames) {
            const presentation = dartsApi(f).snapshot().feedback, uid = dartsApi(f).snapshot().uid;
            const sameDevice = before.owners[previous] === uid && current.owners[current.active] === uid && previous !== current.active;
            dartsAssert(!presentation.notice || presentation.notice.kind !== 'bust', 'Impact cannot replay a Bust superseded by timeout');
            dartsAssert(!dartsDoc(f).querySelector('.player-penalty') && Object.keys(presentation.penalties).length === 0, 'Impact cannot replay penalty effects superseded by timeout');
            dartsAssert(!dartsDoc(f).getElementById('handoff-overlay').hidden === sameDevice, 'Superseded flight announces the latest accepted turn with actual slot ownership');
            if (presentation.handoff) dartsAssert(presentation.handoff.player === current.active, 'Superseded flight cannot leave an old-player handoff pending');
        }
        await dartsApi(a).controller().leave(); await dartsApi(b).controller().leave(); frames.forEach(f => f.remove());
    }
}
async function checkDartsAccountNames() {
    const key = 'gamebox:account-name', account = document.createElement('iframe');
    account.src = '/__account?testUser=google-account'; document.body.append(account);
    await until(() => account.contentWindow.ArcadeNet && account.contentWindow.ArcadeNet.ok && localStorage.getItem(key), 'Google account display hint');
    function switchName(name) {
        account.contentWindow.__setTestAuth({ uid: 'google-account', displayName: name, photoURL: null, isAnonymous: false });
    }
    switchName('Alice Example');
    const f = await dartsBoot('google-darts'), doc = dartsDoc(f), primary = dartsData(f).seatOrder[0];
    dartsAssert(!f.contentWindow.ArcadeNet && dartsData(f).participants[primary].name === 'Alice Example',
        'Known Google name becomes the local default without loading Firebase');
    await dartsAdd(f, 1);
    dartsAssert(dartsData(f).participants[dartsData(f).seatOrder[1]].name === 'Player 2', 'Other local slots retain numbered names');
    await dartsStartLocal(f); dartsThrow(f);
    switchName('Beatrice Example'); await sleep(30);
    dartsAssert(dartsData(f).participants[primary].name === 'Alice Example', 'An active match keeps its captured player name');
    await dartsReturn(f);
    dartsAssert(dartsData(f).participants[primary].name === 'Beatrice Example', 'An untouched default follows the account only back in Lobby');
    const input = [...doc.querySelectorAll('#lobby-slots input')].find(el => el.dataset.slotId === primary);
    input.value = 'My darts name'; input.dispatchEvent(new f.contentWindow.Event('change', { bubbles: true }));
    await until(() => dartsData(f).participants[primary].name === 'My darts name' && !doc.getElementById('add-player-btn').disabled, 'custom player name');
    switchName('Caroline Example'); await sleep(30);
    dartsAssert(dartsData(f).participants[primary].name === 'My darts name', 'Account changes do not overwrite a custom name');
    await dartsPromote(f);
    dartsAssert(dartsData(f).participants[primary].name === 'My darts name', 'Verified sign-in preserves a custom name during invitation creation');
    await dartsApi(f).controller().leave(); f.remove();
    await account.contentWindow.ArcadeNet.signOut();
    dartsAssert(localStorage.getItem(key) === null, 'Signing out clears the account display hint');
    const guest = await dartsBoot('guest-after-signout');
    dartsAssert(dartsData(guest).participants[dartsData(guest).seatOrder[0]].name === 'Player 1' && !guest.contentWindow.ArcadeNet,
        'Signed-out local play starts with a numbered name');
    guest.remove(); account.remove();
}
async function checkDartsLocalV2() {
    const f = await dartsBoot('local-player'), doc = dartsDoc(f), api = dartsApi(f), w = f.contentWindow;
    dartsAssert(!w.ArcadeNet && !api.snapshot().room, 'Local Darts must not initialize multiplayer');
    dartsAssert(dartsData(f).seatOrder.length === 1, 'Initial local player slot');
    await dartsChange(f, 'mode-select', '501');
    dartsAssert(doc.getElementById('lobby-start-btn').disabled && doc.getElementById('lobby-start-reason').textContent.includes('2'), '501 one-player start explanation');
    await dartsChange(f, 'mode-select', 'cricket');
    dartsAssert(doc.getElementById('lobby-start-btn').disabled, 'Cricket must require two participants');
    await dartsChange(f, 'mode-select', 'practice');
    await dartsStartLocal(f);
    await dartsFlick(f, doc.getElementById('mode-panel'));
    await dartsFlick(f, doc.getElementById('throw-surface'));
    dartsAssert(api.snapshot().darts === 2 && api.snapshot().match.history.length === 2, 'Board/bottom-panel practice gestures and per-dart history');
    const slot = api.snapshot().match.players[0];
    doc.querySelector('.darts-player').click();
    dartsAssert(doc.getElementById('history-dialog').open && doc.getElementById('history-player').value === slot && doc.querySelectorAll('.history-turn').length === 2, 'Practice player history');
    dartsAssert(w.getComputedStyle(doc.getElementById('history-list')).touchAction === 'pan-y', 'History has independent touch scrolling');
    await dartsFlick(f, doc.getElementById('mode-panel'));
    doc.getElementById('history-dialog').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    dartsAssert(api.snapshot().darts === 2, 'Modal input and shortcut must not throw/reset');
    dartsClick(f, 'history-close-btn');
    await until(() => doc.activeElement.classList.contains('darts-player'), 'history restores player focus');
    await dartsReturn(f);
    dartsAssert(dartsData(f).seatOrder[0] === slot && api.snapshot().match.history.length === 2, 'Returning keeps slots and finished history');
    await dartsChange(f, 'mode-select', 'countup'); await dartsChange(f, 'rounds-select', 5); await dartsChange(f, 'timer-select', 0);
    await dartsStartLocal(f);
    dartsAssert(api.snapshot().match.history.length === 0, 'New match starts a new history');
    for (let i = 0; i < 15; i++) dartsThrow(f);
    dartsAssert(api.snapshot().match.status === 'over' && api.snapshot().match.stats[slot].darts === 15, 'Configurable solo Count-Up completes');
    dartsFinishPresentation(f);
    dartsAssert(!doc.getElementById('leg-result').hidden && !doc.getElementById('lobby').open, 'Results remain visible before returning');
    dartsClick(f, 'result-room-btn');
    await until(() => dartsData(f).phase === 'lobby' && doc.getElementById('lobby').open, 'result returns to same local lobby');
    await dartsAdd(f, 3);
    await dartsChange(f, 'rounds-select', 15);
    await dartsStartLocal(f);
    for (let i = 0; i < 72; i++) dartsThrow(f);
    dartsAssert(api.snapshot().match.history.length === 24, 'Match history updates one entry per three-dart turn');
    doc.querySelector('.darts-player').click();
    dartsAssert(doc.querySelectorAll('.history-turn').length === 6, 'Four-player personal history filter');
    const filter = doc.getElementById('history-player'); filter.value = 'all'; filter.dispatchEvent(new w.Event('change'));
    dartsAssert(doc.querySelectorAll('.history-turn').length === 24, 'All-player history filter');
    const list = doc.getElementById('history-list');
    dartsAssert(list.scrollHeight > list.clientHeight, 'History body scrolls');
    list.scrollTop = 200;
    const anchor = [...list.children].find(el => el.getBoundingClientRect().bottom > list.getBoundingClientRect().top), key = anchor.dataset.historyKey, offset = anchor.getBoundingClientRect().top;
    // This is an accepted scoring fixture, independent of blocked modal input.
    api.accepted(dartsHit(20));
    const kept = [...list.children].find(el => el.dataset.historyKey === key);
    dartsAssert(kept && Math.abs(kept.getBoundingClientRect().top - offset) <= 1, 'Accepted live history preserves reading position');
    const before = api.snapshot().darts;
    await dartsFlick(f, list); dartsAssert(api.snapshot().darts === before, 'History scrolling must not throw');
    dartsClick(f, 'history-close-btn'); dartsClick(f, 'history-btn');
    dartsAssert(filter.value === 'all', 'Toolbar History opens all players');
    doc.getElementById('history-dialog').dispatchEvent(new w.Event('cancel', { cancelable: true }));
    dartsAssert(!doc.getElementById('history-dialog').open && doc.activeElement.id === 'history-btn', 'Escape restores history toolbar focus');
    dartsClick(f, 'settings-btn');
    dartsAssert(doc.getElementById('mode-select').disabled, 'Active match configuration is locked');
    await dartsFlick(f, doc.getElementById('mode-panel')); dartsAssert(api.snapshot().darts === before, 'Lobby dialog blocks background throws');
    dartsClick(f, 'lobby-close-btn');
    dartsAssert(!w.ArcadeNet, 'Full local flow remains independent of network');
    f.remove();
}
async function checkDartsHandoffV2() {
    const f = await dartsBoot('handoff-player', 320, 568), doc = dartsDoc(f), api = dartsApi(f), w = f.contentWindow;
    await dartsAdd(f, 3); await dartsChange(f, 'mode-select', 'countup'); await dartsChange(f, 'timer-select', 0);
    await dartsStartLocal(f);
    const overlay = doc.getElementById('handoff-overlay'), board = doc.getElementById('throw-surface'), panel = doc.getElementById('mode-panel');
    const bounds = board.getBoundingClientRect(), originalBoard = [bounds.x, bounds.y, bounds.width, bounds.height];
    dartsAssert(overlay.hidden, 'The initial player does not require a device handoff');
    dartsThrow(f); dartsThrow(f);
    dartsAssert(overlay.hidden, 'Consecutive darts by the same player do not require confirmation');
    const previous = api.snapshot().match.active; dartsThrow(f);
    const next = api.snapshot().match.active, seq = api.snapshot().match.seq, count = api.snapshot().darts;
    dartsAssert(next !== previous && !overlay.hidden && api.snapshot().feedback.blocking, 'A change between locally owned player slots requires handoff confirmation');
    dartsAssert(doc.getElementById('handoff-title').textContent.includes(dartsData(f).roster[next]), 'Handoff and accepted active player agree');
    const readyBounds = doc.getElementById('handoff-ready-btn').getBoundingClientRect(), overlayBounds = overlay.getBoundingClientRect();
    dartsAssert(readyBounds.top >= overlayBounds.top && readyBounds.bottom <= overlayBounds.bottom && readyBounds.left >= overlayBounds.left && readyBounds.right <= overlayBounds.right, 'Handoff confirmation fits a small mobile board');
    dartsAssert(!api.gesture(), 'The gesture entry point rejects unconfirmed handoff');
    await dartsFlick(f, panel);
    dartsAssert(api.snapshot().match.seq === seq && api.snapshot().darts === count, 'The bottom mode-panel gesture cannot throw through handoff');
    const p = panel.getBoundingClientRect(), x = p.left + p.width / 2, y = p.bottom - 10;
    panel.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 17, isPrimary: true }));
    const ready = doc.getElementById('handoff-ready-btn');
    ready.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, clientX: readyBounds.x, clientY: readyBounds.y, pointerId: 18, isPrimary: true }));
    ready.click();
    w.dispatchEvent(new w.PointerEvent('pointerup', { clientX: x, clientY: y - 200, pointerId: 17, isPrimary: true })); api.land();
    dartsAssert(overlay.hidden && !api.snapshot().gestureActive && api.snapshot().match.seq === seq, 'Confirmation and stale pointer release cannot become the next throw');
    api.refresh(); api.refresh();
    dartsAssert(overlay.hidden, 'Repeated accepted snapshots preserve handoff confirmation');
    await dartsFlick(f, panel);
    dartsAssert(api.snapshot().match.seq === seq + 1, 'A fresh bottom-panel gesture works after confirmation');
    const after = board.getBoundingClientRect();
    dartsAssert([after.x, after.y, after.width, after.height].every((n, i) => Math.abs(n - originalBoard[i]) <= .6), 'Handoff cannot move or resize the dartboard');
    dartsClick(f, 'restart-btn');
    await until(() => doc.getElementById('lobby').open && dartsData(f).phase === 'lobby', 'handoff test returns to setup');
    await dartsChange(f, 'timer-select', 30000); await dartsStartLocal(f);
    for (let i = 0; i < 3; i++) dartsThrow(f);
    dartsAssert(!overlay.hidden, 'Timed local match also requests a handoff');
    const pendingActive = api.snapshot().match.active, pendingKey = api.snapshot().feedback.handoff.key;
    ready.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, pointerId: 22, isPrimary: true }));
    w.__dartsNow = api.snapshot().match.turnStartedAt + api.snapshot().match.turnMs + 1;
    await until(() => api.snapshot().match.active !== pendingActive, 'an unconfirmed handoff does not freeze the turn timer');
    dartsAssert(api.snapshot().match.lastTurn.reason === 'timeout' && api.snapshot().feedback.handoff.key !== pendingKey, 'Timeout replaces the stale handoff with the accepted current turn');
    ready.click();
    dartsAssert(!overlay.hidden && api.snapshot().feedback.blocking, 'A handoff button pressed before timeout cannot confirm the new player after timeout');
    dartsClick(f, 'handoff-ready-btn');
    panel.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 23, isPrimary: true }));
    dartsAssert(api.snapshot().gestureActive, 'A fresh confirmed player may begin a gesture');
    const draggingPlayer = api.snapshot().match.active;
    w.__dartsNow = api.snapshot().match.turnStartedAt + api.snapshot().match.turnMs + 1;
    await until(() => api.snapshot().match.active !== draggingPlayer, 'timeout advances during an unfinished gesture');
    dartsAssert(!api.snapshot().gestureActive, 'An accepted turn change cancels an unfinished gesture');
    const timeoutSeq = api.snapshot().match.seq;
    dartsClick(f, 'handoff-ready-btn');
    w.dispatchEvent(new w.PointerEvent('pointerup', { clientX: x, clientY: y - 200, pointerId: 23, isPrimary: true })); api.land();
    dartsAssert(api.snapshot().match.seq === timeoutSeq, 'A gesture released after timeout and confirmation cannot throw for the new player');
    dartsClick(f, 'restart-btn');
    await until(() => doc.getElementById('lobby').open, 'clear timed handoff');
    dartsAssert(overlay.hidden && !api.snapshot().feedback.blocking, 'Returning to Lobby clears pending presentation/input state');
    f.remove();
}
async function checkDartsBustV2() {
    const f = await dartsBoot('bust-player'), doc = dartsDoc(f), api = dartsApi(f), w = f.contentWindow;
    await dartsAdd(f, 1); await dartsChange(f, 'mode-select', '501'); await dartsChange(f, 'timer-select', 0);
    await dartsStartLocal(f);
    const state = api.snapshot().match, player = state.active;
    state.scores[player] = 50; state.turnStartScore = 50;
    api.accepted(dartsHit(20)); api.accepted(dartsHit(20, 2));
    const accepted = api.snapshot().match;
    dartsAssert(accepted.lastDart.reason === 'bust' && accepted.scores[player] === 50 && accepted.lastTurn.points === 0 && accepted.history[0].darts.length === 2, 'A second-dart Bust restores turn-start score and preserves both physical darts');
    dartsAssert(api.snapshot().feedback.blocking && doc.getElementById('handoff-overlay').hidden && !doc.getElementById('turn-notice').hidden, 'Bust is explained before showing the queued handoff while input is already blocked');
    dartsAssert(doc.getElementById('turn-notice').textContent.includes('50') && doc.getElementById('turn-notice').textContent.includes('BUST'), 'Bust notice shows the actual restored score');
    w.ArcadeCommon.i18n.setLocale('zh');
    dartsAssert(doc.getElementById('turn-notice').textContent.includes('爆分') && !doc.getElementById('dart-feedback').textContent.includes('爆鏢'), 'Chinese Bust terminology is consistent in gameplay feedback');
    dartsClick(f, 'history-btn');
    dartsAssert(doc.querySelector('.history-turn').textContent.includes('爆分') && !doc.querySelector('.history-turn').textContent.includes('爆鏢'), 'History uses the same Bust terminology');
    dartsClick(f, 'history-close-btn');
    w.__dartsNow += 1500; api.refresh();
    dartsAssert(!doc.getElementById('handoff-overlay').hidden && doc.getElementById('turn-notice').hidden, 'Bust expires into one handoff overlay without stacked notices');
    dartsClick(f, 'handoff-ready-btn'); api.refresh();
    dartsAssert(doc.getElementById('handoff-overlay').hidden && doc.getElementById('turn-notice').hidden, 'Confirmed snapshots do not replay the previous Bust');
    // A first-dart Bust must also restore the accepted turn-start value.
    const current = api.snapshot().match; current.scores[current.active] = 10; current.turnStartScore = 10;
    api.accepted(dartsHit(20));
    dartsAssert(api.snapshot().feedback.notice.restoredScore === 10 && api.snapshot().match.history.at(-1).darts.length === 1, 'First-dart Bust uses its own actual rollback score');
    f.remove();
}
async function checkDartsResultsV2() {
    const f = await dartsBoot('result-copy'), w = f.contentWindow, R = w.DartsRules;
    const make = (mode, extra = {}) => R.create(Object.assign({ mode, turnMs: 0, roundLimit: mode === 'countup' ? 5 : 10 }, extra), ['A', 'B'], w.__dartsNow, 0);
    function cap(mode, variant, tied = false) {
        let s = make(mode, { cricketVariant: variant });
        s.players.forEach(id => { s.turns[id] = s.roundLimit - 1; });
        s.scores.A = mode === '501' ? 80 : 40; s.scores.B = tied ? s.scores.A : mode === '501' ? 120 : 20; s.turnStartScore = s.scores.A;
        for (let i = 0; i < 6; i++) s = R.throwDart(s, s.active, { miss: true }, w.__dartsNow);
        return s;
    }
    function closed(variant) {
        let s = make('cricket', { cricketVariant: variant });
        R.TARGETS.forEach(n => { s.marks.A[n] = n === 25 ? 2 : 3; });
        s.scores.A = 30; s.scores.B = 30;
        return R.throwDart(s, 'A', dartsHit(25), w.__dartsNow);
    }
    let checkout = make('501', { legsToWin: 2 }); checkout.scores.A = 40; checkout.turnStartScore = 40;
    checkout = R.throwDart(checkout, 'A', dartsHit(20, 2), w.__dartsNow);
    let cork = cap('countup', 'standard', true);
    cork = R.throwDart(cork, cork.active, dartsHit(25), w.__dartsNow, { x: 10, y: 0 });
    cork = R.throwDart(cork, cork.active, dartsHit(25), w.__dartsNow, { x: 20, y: 0 });
    const cases = [
        [checkout, 'dartsResultCheckout', []],
        [cap('501'), 'dartsResult501Limit', [10, 80]],
        [closed('standard'), 'dartsResultStandardClosed', [30]],
        [closed('cutthroat'), 'dartsResultCutthroatClosed', [30]],
        [cap('cricket', 'standard'), 'dartsResultStandardLimit', [10, 40]],
        [cap('cricket', 'cutthroat'), 'dartsResultCutthroatLimit', [10, 20]],
        [cap('countup'), 'dartsResultCountup', [5, 40]],
        [cork, 'dartsResultCork', ['10.0 mm']],
    ];
    for (const locale of ['en', 'zh']) {
        w.ArcadeCommon.i18n.setLocale(locale);
        for (const [state, key, args] of cases) {
            dartsAssert(state.status === (state === checkout ? 'between' : 'over'), 'Accepted result fixture finishes in the expected Leg/Match phase');
            const m = w.DartsHud.model({ state, now: w.__dartsNow, name: id => id, you: 'You' });
            const expected = w.ArcadeCommon.i18n.t(key, ...args);
            dartsAssert(expected !== key && w.DartsHud.resultReason(m, w.ArcadeCommon.i18n.t) === expected,
                'Mode-aware result reason uses accepted outcome, configured cap, winner score and Cork distance: ' + locale + ' ' + key);
        }
    }
    f.remove();
}
async function checkDartsMixedV2() {
    const a = await dartsBoot('same-account'), b = await dartsBoot('same-account');
    await dartsAdd(a, 1);
    const originalSlots = dartsData(a).seatOrder.slice();
    const nameInput = dartsDoc(a).querySelector('#lobby-slots input[data-slot-id]');
    nameInput.value = 'Alexandria North'; nameInput.dispatchEvent(new a.contentWindow.Event('change', { bubbles: true }));
    await dartsChange(a, 'mode-select', '501'); await dartsChange(a, 'match-select', 2); await dartsChange(a, 'timer-select', 60000);
    const code = await dartsPromote(a), tools = dartsRoomTools(code, [a, b]);
    dartsAssert(originalSlots.every(id => tools.read().participants[id]), 'Promotion preserves local slots');
    await dartsJoin(b, code); await dartsAdd(b, 1);
    await until(() => tools.read().seatOrder.length === 4, 'mixed two-plus-two seats');
    dartsAssert(Object.keys(tools.read().players).length === 2 && tools.read().seatOrder.length === 4, 'Controllers and participants are separate');
    const bUid = dartsApi(b).snapshot().uid;
    dartsAssert(dartsDoc(b).getElementById('lobby-start-btn').textContent === 'Ready' && dartsDoc(b).getElementById('lobby-start-reason').textContent.includes('host'), 'Guest has an actionable Ready control and host permission explanation');
    dartsAssert(dartsDoc(a).getElementById('lobby-start-reason').textContent.includes('1 device'), 'Readiness counts controlling devices rather than their two player slots');
    dartsClick(b, 'lobby-start-btn'); await until(() => tools.read().ready[bUid], 'one device readies both its players');
    await until(() => dartsDoc(b).getElementById('lobby-start-btn').textContent === 'Waiting for Host', 'Ready guest sees Waiting for Host');
    dartsAssert(dartsDoc(b).getElementById('lobby-start-btn').disabled && !dartsDoc(b).getElementById('lobby-unready-btn').hidden, 'Waiting primary is disabled while Cancel ready remains available');
    dartsClick(b, 'lobby-unready-btn'); await until(() => !tools.read().ready[bUid] && !dartsDoc(b).getElementById('lobby-start-btn').disabled, 'Guest can cancel Ready');
    dartsClick(b, 'lobby-start-btn'); await until(() => tools.read().ready[bUid], 'Guest can reconfirm Ready');
    await dartsChange(a, 'out-select', 'open');
    await until(() => Object.values(tools.read().ready).every(ready => !ready), 'Rule edit clears Ready');
    await until(() => dartsDoc(b).getElementById('out-select').value === 'open', 'Rule edit reaches guest');
    dartsAssert(dartsDoc(b).getElementById('out-select').disabled && dartsDoc(a).getElementById('lobby-start-btn').disabled, 'Guest cannot configure; host waits after edit');
    for (const [id, value, field] of [['starting-score-select', 701, 'startingScore'], ['starting-player-select', 'cork', 'startingPlayer'], ['settlement-select', 'cork', 'settlement']]) {
        dartsClick(b, 'lobby-start-btn'); await until(() => tools.read().ready[bUid], 'Guest readies before a new setting edit');
        await dartsChange(a, id, value);
        await until(() => !tools.read().ready[bUid] && String(dartsData(b).options[field]) === String(value), 'New configuration reaches guest and clears device Ready: ' + field);
    }
    await dartsChange(a, 'rounds-select', 0); await dartsChange(a, 'starting-score-select', 901);
    dartsAssert(tools.read().options.roundLimit === 0 && dartsData(b).options.roundLimit === 0, 'An explicit shared-room Unlimited cap survives a score change');
    await dartsChange(a, 'starting-score-select', 701); await dartsChange(a, 'rounds-select', 20);
    await dartsStartOnline(a, [b]);
    const firstMatch = tools.read().game.matchId;
    dartsAssert(tools.read().game.legsToWin === 2 && tools.read().game.outRule === 'open' && tools.read().game.mode === 'x01' && tools.read().game.startingScore === 701 && tools.read().game.startingPlayer === 'cork' && tools.read().game.settlement === 'cork', 'Every new active rule is captured in the Match snapshot');
    const other = tools.active() === a ? b : a;
    dartsAssert(!await dartsApi(other).controller().submit(dartsFlight(0, 103)), 'Another device cannot impersonate active slot');
    dartsAssert(!await dartsApi(a).controller().configure({ outRule: 'double' }), 'Room cannot mutate active rules');
    dartsAssert(!await dartsApi(a).controller().configure({ startingScore: 301, startingPlayer: 'random', settlement: 'score-then-cork' }), 'Room cannot mutate new X01 or Cork rules after starting');
    const seats = tools.read().game.players.slice();
    dartsAssert(tools.read().game.phase === 'cork' && tools.read().game.corkPurpose === 'opening', 'Mixed local/remote players enter one shared opening Cork');
    for (let i = 0; i < 4; i++) {
        const id = tools.read().game.active;
        await tools.throwAt((seats.indexOf(id) + 1) * 5, 0);
    }
    const opened = tools.read().game, openingRecords = opened.history.length;
    dartsAssert(opened.phase === 'play' && opened.active === seats[0] && JSON.stringify(opened.players) === JSON.stringify(seats) && opened.players.every(id => opened.scores[id] === 701 && opened.turns[id] === 0 && opened.stats[id].darts === 0), 'Shared opening Cork respects ownership, selects physical closest and leaves scoring turns untouched');
    dartsAssert(openingRecords === 4 && opened.history.every(entry => entry.phase === 'cork' && entry.corkPurpose === 'opening'), 'Shared opening Cork history is distinct from normal darts');
    const turns = [];
    for (let turn = 0; turn < 4; turn++) {
        const before = tools.read().game, previous = before.active;
        turns.push(previous);
        for (let dart = 0; dart < 3; dart++) await tools.throwAt(0, 80);
        const accepted = tools.read().game;
        for (const f of [a, b]) {
            const uid = dartsApi(f).snapshot().uid;
            const expected = before.owners[previous] === uid && accepted.owners[accepted.active] === uid;
            dartsAssert(!dartsDoc(f).getElementById('handoff-overlay').hidden === expected,
                'Mixed two-plus-two ownership requests handoff only between slots on this device');
            if (!expected) dartsAssert(dartsApi(f).snapshot().feedback.notice && dartsApi(f).snapshot().feedback.notice.kind === 'turn', 'Cross-device turns use a nonblocking notice');
        }
    }
    dartsAssert(new Set(turns).size === 4 && tools.read().game.history.length === openingRecords + 4, 'Both devices can control each of their two seats');
    for (const f of [a, b]) {
        dartsClick(f, 'history-btn');
        dartsAssert(dartsDoc(f).querySelectorAll('.history-turn').length === openingRecords + 4 && !dartsDoc(f).getElementById('history-clock-note').hidden, 'Mixed room shares accepted history and running timer');
        dartsClick(f, 'history-close-btn');
    }
    const legWinner = tools.read().game.active;
    tools.mutate(data => { data.game.scores[legWinner] = 40; data.game.turnStartScore = 40; });
    await until(() => [a, b].every(f => dartsApi(f).snapshot().match.scores[legWinner] === 40), 'between-leg checkout fixture');
    await tools.throwAt(0, 165);
    dartsAssert(tools.read().game.status === 'between' && tools.read().game.wins[legWinner] === 1, 'First leg leaves first-to-two match active');
    dartsAssert([a, b].every(f => dartsApi(f).snapshot().feedback.resultPending && dartsDoc(f).getElementById('leg-result').hidden && !dartsDoc(f).getElementById('hit-toast').hidden), 'Both devices see the finalized checkout impact before the Leg result overlay');
    dartsClick(a, 'settings-btn');
    dartsAssert(dartsDoc(a).getElementById('back-lobby-btn').hidden && dartsDoc(a).getElementById('mode-select').disabled && dartsDoc(a).getElementById('out-select').disabled,
        'Between Legs cannot return to Lobby or edit match rules');
    dartsAssert(!await dartsApi(a).controller().backToLobby(), 'Room policy rejects leaving an unfinished competitive match for Lobby');
    dartsDoc(a).getElementById('back-lobby-btn').click(); await sleep(20);
    dartsAssert(tools.read().phase === 'playing' && tools.read().game.status === 'between', 'Hidden Return action cannot bypass between-Leg lock');
    dartsClick(a, 'lobby-close-btn'); tools.syncClock();
    [a, b].forEach(f => dartsApi(f).refresh());
    await until(() => !dartsDoc(a).getElementById('next-leg-btn').disabled, 'Next leg available after presentation');
    dartsClick(a, 'next-leg-btn');
    await until(() => [a, b].every(f => dartsApi(f).snapshot().match.leg === 2 && dartsApi(f).snapshot().match.status === 'playing'), 'Continue same competitive match');
    tools.mutate(data => { data.game.status = 'over'; data.game.winner = data.game.players[0]; data.game.legWinner = data.game.winner; data.phase = 'results'; data.status = 'waiting'; });
    await until(() => [a, b].every(f => dartsApi(f).snapshot().match.status === 'over'), 'mixed results');
    dartsAssert([a, b].every(f => !dartsDoc(f).getElementById('lobby').open), 'Finished room preserves result display');
    dartsClick(a, 'result-room-btn');
    await until(() => tools.read().phase === 'lobby' && dartsDoc(a).getElementById('lobby').open, 'same room back to lobby');
    dartsAssert(tools.read().seatOrder.length === 4 && Object.keys(tools.read().players).length === 2, 'Back to Lobby keeps devices and slots');
    dartsClick(a, 'lobby-close-btn'); dartsClick(a, 'history-btn');
    const beat = tools.read().presence[dartsApi(a).snapshot().uid];
    await dartsApi(a).controller().service.heartbeat(code, 0);
    await until(() => tools.read().presence[dartsApi(a).snapshot().uid] !== beat, 'Lobby heartbeat snapshot published');
    await sleep(30);
    dartsAssert(dartsDoc(a).getElementById('history-dialog').open && !dartsDoc(a).getElementById('lobby').open,
        'Lobby heartbeat must preserve open history without reopening Lobby over it');
    dartsClick(a, 'history-close-btn'); dartsClick(a, 'settings-btn');
    await dartsChange(a, 'mode-select', 'cricket'); await dartsChange(a, 'cricket-select', 'cutthroat'); await dartsChange(a, 'match-select', 1); await dartsChange(a, 'timer-select', 0);
    await dartsChange(a, 'starting-player-select', 'random');
    await until(() => dartsDoc(b).getElementById('lobby').open && dartsDoc(b).getElementById('mode-select').value === 'cricket', 'guest sees next game in existing room');
    await dartsStartOnline(a, [b]);
    dartsAssert(tools.read().game.matchId !== firstMatch && tools.read().game.cricketVariant === 'cutthroat' && tools.read().game.history.length === 0, 'Same code starts different game with fresh history');
    const thrower = tools.read().game.active;
    tools.mutate(data => { data.game.marks[thrower][20] = 3; });
    await until(() => [a, b].every(f => dartsApi(f).snapshot().match.marks[thrower][20] === 3), 'Cut-Throat fixture');
    await tools.throwAt(0, 103, () => {
        dartsAssert([a, b].every(f => !dartsDoc(f).querySelector('.player-penalty')), 'Remote penalty effects wait for the accepted dart to land');
    });
    dartsAssert(tools.read().game.scores[thrower] === 0 && tools.read().game.players.filter(id => id !== thrower).every(id => tools.read().game.scores[id] === 60), 'Cut-Throat penalties reach all applicable opponents');
    for (const f of [a, b]) {
        const doc = dartsDoc(f);
        dartsAssert(doc.getElementById('match-meta').textContent.includes('Cut-Throat') && doc.getElementById('dart-feedback').textContent.includes('+60'), 'Cut-Throat HUD explains recipient penalties');
        const affected = [...doc.querySelectorAll('.darts-player.penalty-flash')];
        dartsAssert(affected.length === 3 && affected.every(card => card.dataset.playerUid !== thrower && card.querySelector('.player-penalty').textContent === '+60'), 'Only the three actual accepted penalty recipients show warning badges');
        dartsAssert(doc.querySelectorAll('.cricket-table thead th').length === 5 && doc.querySelectorAll('.cricket-table tbody tr').length === 7, 'Four-player Cricket marks matrix');
        dartsAssert(doc.getElementById('turn-timer').hidden, 'Timer off hidden online');
        dartsClick(f, 'history-btn');
        dartsAssert(dartsDoc(f).querySelector('.history-turn-summary').textContent.includes('+60'), 'Penalty history matches actual recipients');
        dartsClick(f, 'history-close-btn');
    }
    for (const count of [2, 1, 0]) {
        [a, b].forEach(f => { f.contentWindow.__dartsNow += 1500; dartsApi(f).refresh(); });
        dartsAssert([a, b].every(f => !dartsDoc(f).querySelector('.player-penalty')), 'Penalty badges expire without changing permanent score/history');
        const expectedThrower = tools.read().game.active, opponents = tools.read().game.players.filter(id => id !== expectedThrower);
        tools.mutate(data => {
            data.game.marks[expectedThrower][20] = 3;
            opponents.forEach((id, index) => { data.game.marks[id][20] = index < count ? 0 : 3; });
        });
        await until(() => [a, b].every(f => opponents.every((id, index) => dartsApi(f).snapshot().match.marks[id][20] === (index < count ? 0 : 3))), 'accepted eligible penalty recipients');
        await tools.throwAt(0, 103);
        for (const f of [a, b]) {
            const cards = [...dartsDoc(f).querySelectorAll('.darts-player.penalty-flash')];
            dartsAssert(cards.length === count && cards.every(card => opponents.slice(0, count).includes(card.dataset.playerUid)), 'Closed opponents and the thrower receive no visual penalty: ' + count);
        }
    }
    const snapshotSeq = tools.read().game.seq;
    await dartsApi(a).controller().service.heartbeat(code, 0); await sleep(30);
    dartsAssert([a, b].every(f => !dartsDoc(f).querySelector('.player-penalty')) && tools.read().game.seq === snapshotSeq, 'A repeated room snapshot cannot replay the last accepted penalty effect');
    await dartsApi(a).controller().leave(); await dartsApi(b).controller().leave(); a.remove(); b.remove();
}
async function checkDartsLeaveRestoreV2() {
    const f = await dartsBoot('restore-owned-slots');
    await dartsAdd(f, 1);
    const original = dartsData(f).seatOrder.slice();
    await dartsPromote(f); dartsClick(f, 'leave-room-btn');
    await until(() => !dartsApi(f).snapshot().room && dartsData(f).phase === 'lobby' && dartsData(f).seatOrder.length === 2, 'Leave online room restores both owned local slots');
    dartsAssert(original.every(id => dartsData(f).participants[id] && dartsData(f).participants[id].controllerId === 'local-controller'), 'Restored slots retain identity and local ownership');
    await dartsAdd(f, 1);
    const ids = dartsData(f).seatOrder;
    dartsAssert(new Set(ids).size === 3 && Object.keys(dartsData(f).participants).length === 3 && original.every(id => ids.includes(id)), 'Adding after online leave allocates a new slot without overwriting restored IDs');
    await dartsChange(f, 'mode-select', 'countup'); await dartsChange(f, 'timer-select', 0); await dartsChange(f, 'rounds-select', 5);
    await dartsStartLocal(f);
    dartsAssert(dartsApi(f).snapshot().match.players.length === 3 && Object.values(dartsApi(f).snapshot().match.owners).every(id => id === 'local-controller'), 'Restored slots start a local Count-Up match');
    for (let i = 0; i < 3; i++) dartsThrow(f);
    dartsConfirmHandoff(f);
    await dartsFlick(f, dartsDoc(f).getElementById('mode-panel'));
    dartsAssert(dartsApi(f).snapshot().darts === 4, 'Restored local device can throw for the next owned seat');
    dartsClick(f, 'restart-btn');
    await until(() => dartsData(f).phase === 'lobby' && dartsDoc(f).getElementById('lobby').open, 'Local restart returns to configuration');
    await dartsChange(f, 'mode-select', '501'); await dartsChange(f, 'out-select', 'open'); await dartsChange(f, 'match-select', 2); await dartsChange(f, 'timer-select', 0);
    await dartsStartLocal(f);
    dartsThrow(f);
    const fixture = dartsApi(f).snapshot().match, points = fixture.lastDart.result.score;
    dartsAssert(points > 0, 'Deterministic local checkout fixture has a scoring dart');
    fixture.scores[fixture.active] = points; fixture.turnStartScore = points;
    dartsThrow(f);
    dartsAssert(dartsApi(f).snapshot().match.status === 'between', 'Local checkout reaches between-Leg state');
    dartsClick(f, 'settings-btn');
    dartsAssert(dartsDoc(f).getElementById('back-lobby-btn').hidden && dartsDoc(f).getElementById('out-select').disabled, 'Local between-Leg rules remain locked');
    dartsDoc(f).getElementById('back-lobby-btn').click(); await sleep(20);
    dartsAssert(dartsData(f).phase === 'playing' && dartsApi(f).snapshot().match.status === 'between', 'Local Return handler rejects unfinished competitive match');
    dartsClick(f, 'lobby-close-btn'); dartsFinishPresentation(f); dartsClick(f, 'next-leg-btn');
    dartsAssert(dartsApi(f).snapshot().match.leg === 2 && dartsApi(f).snapshot().match.status === 'playing', 'Local Next Leg resumes the locked match');
    f.remove();
}
async function checkDartsFourV2() {
    const frames = [];
    for (let i = 0; i < 4; i++) frames.push(await dartsBoot('four-' + i));
    await dartsChange(frames[0], 'mode-select', 'cricket');
    const code = await dartsPromote(frames[0]), tools = dartsRoomTools(code, frames);
    for (const f of frames.slice(1)) await dartsJoin(f, code);
    for (const f of frames.slice(1, 3)) dartsClick(f, 'lobby-start-btn');
    await until(() => Object.values(tools.read().ready).filter(Boolean).length === 2, 'two remote devices ready');
    dartsAssert(dartsDoc(frames[0]).getElementById('lobby-start-btn').disabled, 'Fourth remote device readiness required');
    dartsClick(frames[3], 'lobby-start-btn');
    await until(() => !dartsDoc(frames[0]).getElementById('lobby-start-btn').disabled, 'four remote ready');
    dartsClick(frames[0], 'lobby-start-btn');
    await until(() => frames.every(f => dartsApi(f).snapshot().match && dartsApi(f).snapshot().match.players.length === 4 && !dartsDoc(f).getElementById('lobby').open), 'four remote start');
    dartsAssert(tools.read().game.cricketVariant === 'cutthroat', 'Automatic multiplayer Cricket default captured');
    const seen = [];
    for (let turn = 0; turn < 4; turn++) {
        seen.push(tools.read().game.active);
        for (let dart = 0; dart < 3; dart++) await tools.throwAt(0, 80);
    }
    dartsAssert(new Set(seen).size === 4, 'Four remote turns rotate all seats');
    const oldHost = dartsApi(frames[0]).snapshot().uid, departedSlot = tools.read().game.players.find(id => tools.read().game.owners[id] === oldHost);
    await dartsApi(frames[0]).controller().leave();
    await until(() => tools.read().hostUid !== oldHost && tools.read().game.withdrawn.includes(departedSlot), 'host departure transfers controller and withdraws owned seat');
    for (const f of frames.slice(1)) await until(() => dartsDoc(f).querySelectorAll('.darts-player.withdrawn').length === 1, 'departed participant remains visible');
    dartsAssert(tools.read().game.status === 'playing', 'Three remaining players continue');
    await dartsApi(frames[1]).controller().leave();
    await until(() => Object.keys(tools.read().players).length === 2, 'two remote devices remain');
    dartsAssert(tools.read().game.status === 'playing', 'Two remaining players continue');
    await dartsApi(frames[2]).controller().leave();
    await until(() => dartsApi(frames[3]).snapshot().match.status === 'over', 'last participant wins by forfeit');
    const survivor = tools.read().game.players.find(id => tools.read().game.owners[id] === dartsApi(frames[3]).snapshot().uid);
    dartsAssert(tools.read().game.winner === survivor, 'Forfeit winner is participant rather than controller ID');
    await dartsApi(frames[3]).controller().leave(); frames.forEach(f => f.remove());
}
async function checkDartsLayoutsV2() {
    function box(doc, selector) { const b = doc.querySelector(selector).getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }
    function within(inner, outer, label) {
        dartsAssert(inner[0] >= outer[0] - .6 && inner[1] >= outer[1] - .6 && inner[0] + inner[2] <= outer[0] + outer[2] + .6 && inner[1] + inner[3] <= outer[1] + outer[3] + .6,
            label + ' outside viewport: ' + JSON.stringify([inner, outer]));
    }
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1200, 800]]) {
        let baseline;
        for (const [mode, count] of [['cricket', 4], ['501', 2], ['501', 4], ['countup', 4], ['practice', 1]]) {
            const f = await dartsBoot('layout-' + width + '-' + mode + count, width, height), doc = dartsDoc(f), w = f.contentWindow;
            if (count > 1) await dartsAdd(f, count - 1);
            await dartsChange(f, 'mode-select', mode); await dartsChange(f, 'timer-select', 0);
            await sleep(20);
            const ready = [...box(doc, '#match-panel'), ...box(doc, '#throw-surface'), ...box(doc, '.game-topbar')];
            await dartsStartLocal(f); if (mode === 'cricket') dartsApi(f).previewCricket(); await sleep(30);
            const viewport = box(doc, '#match-panel'), board = box(doc, '#throw-surface'), panel = box(doc, '#mode-panel'), summary = box(doc, '.darts-players');
            const playing = [...viewport, ...board, ...box(doc, '.game-topbar')];
            dartsAssert(playing.every((value, i) => Math.abs(value - ready[i]) <= .6), 'Start changes layout at ' + width + ' ' + mode);
            within(viewport, [0, 0, w.innerWidth, w.innerHeight], 'game viewport'); within(board, viewport, 'board'); within(panel, viewport, 'mode panel'); within(summary, viewport, 'player summary');
            const dimensions = [...board, ...panel, ...summary];
            if (!baseline) baseline = dimensions;
            else dartsAssert(dimensions.every((value, i) => Math.abs(value - baseline[i]) <= .6), 'Mode changes move board/panels at ' + width);
            dartsAssert(doc.documentElement.scrollWidth <= w.innerWidth + 1 && doc.documentElement.scrollHeight <= w.innerHeight + 1, 'Live game requires scrolling at ' + width + ' ' + mode);
            const cards = [...doc.querySelectorAll('.darts-player')]; dartsAssert(cards.length === count, 'Correct player cards');
            for (const card of cards) { const b = card.getBoundingClientRect(); within([b.x, b.y, b.width, b.height], summary, 'player card'); }
            if (mode === 'cricket') {
                dartsAssert(doc.querySelectorAll('.cricket-table tbody tr').length === 7 && doc.querySelectorAll('.cricket-table thead th').length === 5, 'Four-player Cricket matrix');
                within(box(doc, '.cricket-table'), panel, 'Cricket matrix');
                dartsAssert(doc.getElementById('mode-panel').scrollHeight <= doc.getElementById('mode-panel').clientHeight + 1, 'Cricket panel overflows at ' + width);
            }
            if (mode !== 'practice') dartsAssert(doc.querySelector('.status-dart').textContent.includes('1/3'), 'Dart counter stays visible');
            doc.querySelector('.darts-players').dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, clientX: 40, clientY: 400, pointerId: 1, isPrimary: true }));
            w.dispatchEvent(new w.PointerEvent('pointermove', { clientX: 40, clientY: 100, pointerId: 1, isPrimary: true }));
            w.dispatchEvent(new w.PointerEvent('pointerup', { clientX: 40, clientY: 100, pointerId: 1, isPrimary: true }));
            dartsAssert(dartsApi(f).snapshot().darts === 0 && dartsApi(f).snapshot().dartState !== 'flying', 'Player HUD cannot initiate throw');
            f.remove();
        }
    }
    if (preview && !lobbyPreview && !corkPreview) {
        const width = preview === 'mobile' ? 390 : 1200, height = preview === 'mobile' ? 844 : 800;
        const f = await dartsBoot('preview-player', width, height);
        f.style.cssText = 'position:fixed;inset:0;width:' + width + 'px;height:' + height + 'px;border:0;z-index:10';
        await dartsAdd(f, 3); await dartsChange(f, 'mode-select', 'cricket'); await dartsChange(f, 'timer-select', 0);
        await dartsStartLocal(f); dartsApi(f).previewCricket(); await sleep(60);
        const fixture = dartsApi(f).snapshot().match;
        fixture.players.forEach(id => { fixture.marks[id][20] = id === fixture.active ? 3 : 0; });
        dartsApi(f).accepted(dartsHit(20));
    }
}
async function checkDartsLobbyV2() {
    for (const [width, height] of [[320, 568], [390, 844], [1200, 420]]) {
        const f = await dartsBoot('lobby-layout-' + width, width, height), doc = dartsDoc(f), w = f.contentWindow;
        const dialog = doc.getElementById('lobby'), content = doc.getElementById('lobby-content'), start = doc.getElementById('lobby-start-btn');
        function footerVisible() {
            const bounds = dialog.getBoundingClientRect(), footer = doc.querySelector('.lobby-footer').getBoundingClientRect(), button = start.getBoundingClientRect();
            dartsAssert(bounds.left >= -.5 && bounds.right <= w.innerWidth + .5 && bounds.top >= -.5 && bounds.bottom <= w.innerHeight + .5, 'Lobby fits viewport at ' + width);
            dartsAssert(dialog.scrollWidth <= dialog.clientWidth + 1 && content.scrollWidth <= content.clientWidth + 1, 'Lobby has no horizontal scroll at ' + width);
            dartsAssert(button.top >= footer.top && button.bottom <= footer.bottom && footer.bottom <= bounds.bottom && button.left >= bounds.left && button.right <= bounds.right,
                'Primary action stays inside the non-scrolling footer at ' + width);
            if (width <= 760) dartsAssert(button.height >= 44, 'Mobile primary action has a touch-sized target');
            dartsAssert(w.getComputedStyle(dialog).overflowY === 'hidden' && w.getComputedStyle(content).overflowY === 'auto', 'Only lobby content scrolls');
            return [footer.top, footer.bottom, doc.querySelector('#lobby > .dialog-header').getBoundingClientRect().top];
        }
        dartsAssert(start.textContent === 'Start Practice' && !start.disabled, 'Solo Practice uses Start Practice'); footerVisible();
        dartsAssert(!doc.getElementById('lobby-rule-details').open && doc.getElementById('lobby-rule-summary').textContent.includes('Free throws'), 'Practice has a concise summary and collapsed explanation');
        await dartsChange(f, 'mode-select', '501');
        dartsAssert(start.textContent === 'Start Game' && start.disabled && doc.getElementById('lobby-start-reason').textContent.includes('at least 2') && start.getAttribute('aria-describedby').includes('lobby-start-reason'), 'Solo 501 has a disabled Start Game with an associated reason');
        await dartsAdd(f, 3);
        doc.getElementById('advanced-rules').open = true;
        doc.getElementById('lobby-rule-details').open = true;
        doc.getElementById('invite-details').open = true;
        doc.querySelector('.darts-gesture-help').open = true; await sleep(20);
        dartsAssert(content.scrollHeight > content.clientHeight && !start.disabled, 'Four-player advanced rules create an internal content scroll');
        const fixed = footerVisible(), pageY = w.scrollY;
        for (const fraction of [0, .5, 1]) {
            content.scrollTop = (content.scrollHeight - content.clientHeight) * fraction; await sleep(20);
            dartsAssert(footerVisible().every((value, i) => Math.abs(value - fixed[i]) < .6), 'Scrolling details cannot move the header or footer at ' + width);
            dartsAssert(w.scrollY === pageY && dialog.scrollTop === 0, 'Content scrolling does not scroll the page or outer dialog');
        }
        const summary = () => doc.getElementById('lobby-rule-summary').textContent, details = () => doc.getElementById('lobby-rule-note').textContent;
        dartsAssert(summary().includes('Double Out') && summary().includes('20 rounds'), '501 summary reflects the score-dependent default selected rules');
        await dartsChange(f, 'out-select', 'open');
        dartsAssert(summary().includes('Open Out') && !summary().includes('Double Out') && details().includes('Any scoring region can finish') && !details().includes('Finish on a double'), 'Summary and expanded explanation both switch to Open Out');
        await dartsChange(f, 'out-select', 'double'); await dartsChange(f, 'in-select', 'master'); await dartsChange(f, 'bull-select', '50-50');
        dartsAssert(summary().includes('Double Out') && summary().includes('Master In') && summary().includes('50 / 50') && details().includes('Finish on a double or inner Bull') && details().includes('Both Bulls score 50'), 'Selected In/Out and Bull settings update both rule views');
        await dartsChange(f, 'rounds-select', 0);
        dartsAssert(summary().includes('Unlimited rounds') && !details().includes('lowest remaining score wins'), 'Unlimited summary and explanation omit finite settlement');
        await dartsChange(f, 'mode-select', 'cricket');
        dartsAssert(summary().includes('Cut-Throat') && summary().includes('Lowest score wins') && !summary().includes('Double Out'), 'Cricket summary resolves the four-player automatic variant');
        await dartsChange(f, 'cricket-select', 'standard');
        dartsAssert(summary().includes('Standard') && summary().includes('Highest score wins') && !summary().includes('Cut-Throat'), 'Cricket explicit variant updates summary');
        await dartsChange(f, 'mode-select', 'countup'); await dartsChange(f, 'rounds-select', 5);
        dartsAssert(summary().includes('5 rounds') && summary().includes('3 darts per turn') && !summary().includes('501'), 'Count-Up summary reflects current round count');
        await dartsChange(f, 'mode-select', 'practice');
        w.ArcadeCommon.i18n.setLocale('zh');
        dartsAssert(start.textContent === '開始練習' && doc.querySelector('#lobby-rule-details > summary').textContent === '詳細規則', 'Primary label and details use Traditional Chinese');
        w.ArcadeCommon.i18n.setLocale('en');
        const field = [...doc.querySelectorAll('#lobby-slots input')].at(-1), slot = field.dataset.slotId;
        field.focus({ preventScroll: true });
        // Model the visual viewport shrink/offset produced by a mobile keyboard.
        const viewport = w.visualViewport, previousHeight = Object.getOwnPropertyDescriptor(viewport, 'height'), previousTop = Object.getOwnPropertyDescriptor(viewport, 'offsetTop');
        Object.defineProperty(viewport, 'height', { configurable: true, value: 260 });
        Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 20 });
        viewport.dispatchEvent(new w.Event('resize'));
        await until(() => {
            const outer = dialog.getBoundingClientRect(), input = field.getBoundingClientRect(), body = content.getBoundingClientRect();
            return outer.top >= 19.5 && outer.bottom <= 280.5 && input.top >= body.top - .5 && input.bottom <= body.bottom + .5;
        }, 'resized visual viewport and edited field settle at ' + width);
        footerVisible();
        const visible = dialog.getBoundingClientRect(), inputBounds = field.getBoundingClientRect(), bodyBounds = content.getBoundingClientRect();
        dartsAssert(visible.top >= 19.5 && visible.bottom <= 280.5 && inputBounds.top >= bodyBounds.top - .5 && inputBounds.bottom <= bodyBounds.bottom + .5,
            'Keyboard-sized visual viewport keeps the field and footer visible at ' + width + ': ' + JSON.stringify({ dialog: [visible.top, visible.bottom], field: [inputBounds.top, inputBounds.bottom], body: [bodyBounds.top, bodyBounds.bottom] }));
        dartsAssert(w.scrollY === pageY, 'Keeping the edited name visible does not scroll the webpage');
        field.value = 'Phone Player'; field.blur(); field.dispatchEvent(new w.Event('change', { bubbles: true }));
        await until(() => dartsData(f).participants[slot].name === 'Phone Player' && !start.disabled, 'Name can be edited with the reduced visual viewport');
        if (previousHeight) Object.defineProperty(viewport, 'height', previousHeight); else delete viewport.height;
        if (previousTop) Object.defineProperty(viewport, 'offsetTop', previousTop); else delete viewport.offsetTop;
        viewport.dispatchEvent(new w.Event('resize')); await sleep(20); footerVisible();
        f.remove();
    }
    if (lobbyPreview) {
        const width = preview === 'desktop' ? 1200 : 390, height = preview === 'desktop' ? 800 : 844;
        const f = await dartsBoot('lobby-preview', width, height), doc = dartsDoc(f);
        f.style.cssText = 'position:fixed;inset:0;width:' + width + 'px;height:' + height + 'px;border:0;z-index:10';
        await dartsAdd(f, 3); await dartsChange(f, 'mode-select', '501');
        doc.getElementById('advanced-rules').open = true; doc.getElementById('lobby-content').scrollTop = 0;
        await sleep(60);
    }
}
async function checkDartsExpandedSettingsV2() {
    const f = await dartsBoot('expanded-settings', 320, 568), doc = dartsDoc(f);
    const choices = id => [...doc.getElementById(id).options].map(option => Number(option.value));
    await dartsChange(f, 'mode-select', 'x01');
    dartsAssert(dartsData(f).options.startingScore === 501 && dartsData(f).options.roundLimit === 20, 'New X01 defaults to 501 and twenty casual rounds');
    dartsAssert(choices('starting-score-select').join(',') === '301,501,701,901,1101,1501', 'One X01 mode exposes exactly the supported starting scores');
    for (const [score, limit] of [[301, 15], [701, 20], [901, 30], [1101, 30], [1501, 30], [501, 20]]) {
        await dartsChange(f, 'starting-score-select', score);
        dartsAssert(dartsData(f).options.roundLimit === limit, 'Automatic cap follows the selected starting score before manual cap selection: ' + score);
    }
    dartsAssert(choices('rounds-select').slice().sort((a, b) => a - b).join(',') === '0,10,15,20,30', 'X01 exposes all finite and Unlimited round choices');
    await dartsAdd(f, 1);
    await dartsChange(f, 'settlement-select', 'cork');
    await dartsChange(f, 'rounds-select', 0); await dartsChange(f, 'starting-score-select', 701);
    dartsAssert(dartsData(f).options.roundLimit === 0 && doc.getElementById('settlement-setting').hidden, 'An explicit Unlimited choice survives a starting-score change and hides irrelevant settlement');
    await dartsChange(f, 'rounds-select', 30); await dartsChange(f, 'starting-score-select', 301);
    dartsAssert(dartsData(f).options.roundLimit === 30 && dartsData(f).options.settlement === 'cork' && !doc.getElementById('settlement-setting').hidden, 'Explicit finite cap and previous Cork settlement survive score edits and visibility changes');
    await dartsChange(f, 'starting-player-select', 'cork');
    dartsAssert(dartsData(f).options.settlement === 'cork', 'Opening Cork is independent of round-limit settlement');
    await dartsChange(f, 'settlement-select', 'score-then-cork');
    dartsAssert(dartsData(f).options.startingPlayer === 'cork', 'Lowest-score settlement does not disable opening Cork');
    const summary = doc.getElementById('lobby-rule-summary').textContent + doc.getElementById('lobby-round-note').textContent;
    dartsAssert(summary.includes('30') && summary.includes('90'), 'Long-match helper states the selected thirty rounds and ninety darts per player');
    await dartsChange(f, 'mode-select', 'cricket');
    dartsAssert(choices('rounds-select').slice().sort((a, b) => a - b).join(',') === '0,10,15,20,30' && dartsData(f).options.roundLimit === 15, 'Cricket keeps its default and receives expanded caps');
    await dartsChange(f, 'mode-select', 'countup');
    dartsAssert(choices('rounds-select').join(',') === '5,8,10,15,20,30' && dartsData(f).options.roundLimit === 8, 'Count-Up remains fixed-round with all six round counts');
    await dartsChange(f, 'mode-select', 'practice');
    dartsAssert(doc.getElementById('rounds-setting').hidden && doc.getElementById('starting-score-setting').hidden && doc.getElementById('starting-player-setting').hidden && doc.getElementById('settlement-setting').hidden, 'Practice hides competitive configuration');
    f.remove();
}
async function checkDartsOpeningCorkV2() {
    for (const count of [2, 3, 4]) {
        const f = await dartsBoot('opening-cork-' + count), api = dartsApi(f), doc = dartsDoc(f);
        await dartsAdd(f, count - 1); await dartsChange(f, 'mode-select', 'x01');
        await dartsChange(f, 'starting-score-select', 301); await dartsChange(f, 'starting-player-select', 'cork');
        await dartsChange(f, 'match-select', 2); await dartsChange(f, 'timer-select', 0);
        await dartsStartLocal(f);
        const initial = api.snapshot().match, seats = initial.players.slice(), distances = new Map();
        dartsAssert(initial.phase === 'cork' && initial.corkPurpose === 'opening', 'Opening Cork starts before normal Leg scoring');
        dartsAssert(doc.getElementById('match-meta').textContent.includes('Cork') && !doc.getElementById('match-meta').textContent.includes('Double Out'), 'Opening Cork takes priority over ordinary X01 rule text');
        dartsClick(f, 'settings-btn');
        for (const id of ['starting-score-select', 'starting-player-select', 'settlement-select']) dartsAssert(doc.getElementById(id).disabled, 'New match configuration is locked during opening Cork: ' + id);
        dartsClick(f, 'lobby-close-btn');
        for (let i = 0; i < count; i++) {
            dartsConfirmHandoff(f);
            const player = api.snapshot().match.active, distance = count === 4 && i < 2 ? 10 : count === 4 ? 30 + i : 30 - i * 5;
            distances.set(player, distance);
            api.accepted(dartsHit(25), { x: distance, y: 0 });
        }
        if (count === 4) {
            const tied = [...distances].filter(([, distance]) => distance === 10).map(([id]) => id);
            dartsAssert(api.snapshot().match.phase === 'cork' && api.snapshot().match.corkRound === 2 && api.snapshot().match.corkPlayers.length === 2 && api.snapshot().match.corkPlayers.every(id => tied.includes(id)), 'Only the closest tied players repeat opening Cork');
            for (let i = 0; i < 2; i++) {
                dartsConfirmHandoff(f);
                const id = api.snapshot().match.active; distances.set(id, i === 0 ? 8 : 3);
                api.accepted(dartsHit(25), { x: distances.get(id), y: 0 });
            }
        }
        const started = api.snapshot().match, expectedStarter = [...distances].sort((a, b) => a[1] - b[1])[0][0];
        dartsAssert(started.phase === 'play' && started.status === 'playing' && started.active === expectedStarter && started.legStarter === expectedStarter, 'Closest physical Bull distance selects the opening starter');
        dartsFinishPresentation(f);
        dartsAssert(doc.getElementById('match-meta').textContent.startsWith('301') && !doc.getElementById('match-meta').textContent.includes('X01'), 'Ordinary gameplay restores the actual X01 variant after opening Cork');
        dartsAssert(JSON.stringify(started.players) === JSON.stringify(seats), 'Opening Cork preserves participant seat order');
        dartsAssert(seats.every(id => started.scores[id] === 301 && started.turns[id] === 0 && started.stats[id].darts === 0 && started.stats[id].points === 0 && Object.values(started.marks[id]).every(n => n === 0)), 'Opening Cork never consumes scores, marks, normal darts or permitted turns');
        dartsAssert(started.history.length === (count === 4 ? 6 : count) && started.history.every(entry => entry.phase === 'cork' && entry.corkPurpose === 'opening'), 'Opening Cork is recorded separately in match history');
        dartsConfirmHandoff(f); started.scores[started.active] = 32; started.turnStartScore = 32;
        api.accepted(dartsHit(16, 2));
        dartsAssert(api.snapshot().match.status === 'between' && doc.getElementById('leg-result').hidden, 'A winning X01 dart finalizes the Leg before its visual result overlay');
        dartsFinishPresentation(f); dartsClick(f, 'next-leg-btn');
        const next = api.snapshot().match, expectedNext = seats[(seats.indexOf(expectedStarter) + 1) % seats.length];
        dartsAssert(next.leg === 2 && next.phase === 'play' && next.active === expectedNext && next.history.length === started.history.length + 1, 'Later Legs rotate from the Cork-selected starter without another opening Cork or losing history');
        f.remove();
    }
    const solo = await dartsBoot('solo-no-opening-cork');
    await dartsChange(solo, 'mode-select', 'countup');
    dartsAssert(dartsDoc(solo).getElementById('starting-player-setting').hidden, 'Solo Count-Up hides opening Cork');
    await dartsStartLocal(solo);
    dartsAssert(dartsApi(solo).snapshot().match.phase === 'play', 'Solo Count-Up begins scoring immediately');
    solo.remove();
}
async function checkDartsFinalHitV2() {
    for (const mode of ['x01', 'cricket', 'countup']) {
        const f = await dartsBoot('final-hit-' + mode), doc = dartsDoc(f), api = dartsApi(f), w = f.contentWindow;
        await dartsAdd(f, 1); await dartsChange(f, 'mode-select', mode); await dartsChange(f, 'timer-select', 30000);
        if (mode === 'cricket') await dartsChange(f, 'cricket-select', 'standard');
        await dartsStartLocal(f);
        const s = api.snapshot().match, scorer = s.active;
        if (mode === 'x01') { s.scores[scorer] = 32; s.turnStartScore = 32; }
        if (mode === 'cricket') {
            w.DartsRules.TARGETS.forEach(target => { s.marks[scorer][target] = target === 20 ? 2 : 3; });
        }
        if (mode === 'countup') {
            s.players.forEach(id => { s.turns[id] = s.roundLimit; });
            s.turns[scorer]--; s.dart = 2; s.turnDarts = [dartsHit(1), dartsHit(1)];
            s.scores[scorer] = 100; s.turnPoints = 2;
        }
        api.accepted(mode === 'x01' ? dartsHit(16, 2) : dartsHit(20));
        const accepted = api.snapshot().match, seq = accepted.seq, winner = accepted.winner;
        dartsAssert(accepted.status === 'over' && winner === scorer && api.snapshot().feedback.resultPending && doc.getElementById('leg-result').hidden, 'Winning ' + mode + ' state is final while the impact remains visible');
        dartsAssert(!doc.getElementById('turn-status').textContent.includes(w.ArcadeCommon.i18n.t('dartsMatchWon')), 'The live turn status also waits for the final hit before announcing victory');
        dartsAssert(!doc.getElementById('hit-toast').hidden && doc.getElementById('hit-toast').textContent.includes(mode === 'x01' ? 'D16' : 'S20'), 'The final scoring region is visible before the winner overlay: ' + mode);
        dartsAssert(!api.gesture(), 'No new scoring gesture is accepted after the authoritative win');
        api.refresh(); api.refresh();
        w.__dartsNow += w.DartsFeedback.TIMING.finalHit - 1; api.refresh();
        dartsAssert(doc.getElementById('leg-result').hidden && api.snapshot().match.seq === seq, 'Repeated snapshots do not restart or bypass the final-hit interval');
        w.__dartsNow += 2; api.refresh();
        dartsAssert(!doc.getElementById('leg-result').hidden && !api.snapshot().feedback.resultPending && doc.getElementById('result-title').textContent === w.ArcadeCommon.i18n.t('dartsMatchWon'), 'The finalized result appears once the impact interval completes');
        dartsAssert(doc.getElementById('turn-status').textContent.includes(w.ArcadeCommon.i18n.t('dartsMatchWon')), 'The live status announces the accepted winner after the impact interval');
        w.__dartsNow = accepted.turnStartedAt + accepted.turnMs + 10;
        await sleep(1050); api.refresh();
        dartsAssert(api.snapshot().match.seq === seq && api.snapshot().match.winner === winner, 'A late turn deadline cannot overwrite an already completed result');
        dartsClick(f, 'result-room-btn');
        await until(() => dartsData(f).phase === 'lobby', 'Completed match returns to setup');
        await dartsChange(f, 'mode-select', 'practice'); await dartsStartLocal(f);
        w.__dartsNow += 2000; api.refresh();
        dartsAssert(doc.getElementById('leg-result').hidden && !api.snapshot().feedback.resultPending, 'Starting another Match cancels old result presentation');
        f.remove();
    }
    const f = await dartsBoot('direct-limit-cork'), api = dartsApi(f), doc = dartsDoc(f);
    await dartsAdd(f, 3); await dartsChange(f, 'mode-select', 'x01'); await dartsChange(f, 'rounds-select', 10);
    await dartsChange(f, 'settlement-select', 'cork'); await dartsChange(f, 'timer-select', 0); await dartsStartLocal(f);
    const s = api.snapshot().match, scores = {};
    s.players.forEach((id, index) => { s.turns[id] = 9; s.scores[id] = (index + 1) * 20; scores[id] = s.scores[id]; });
    s.turnStartScore = s.scores[s.active];
    for (let i = 0; i < 12; i++) { dartsConfirmHandoff(f); api.accepted({ miss: true }); }
    const cork = api.snapshot().match;
    dartsAssert(cork.phase === 'cork' && cork.corkPurpose === 'limit' && cork.corkPlayers.length === 4 && cork.players.every(id => cork.turns[id] === 10), 'Direct Cork begins only after every participant exhausts the configured cap and includes all scores');
    const winner = cork.players.reduce((a, b) => scores[a] > scores[b] ? a : b);
    for (let i = 0; i < 4; i++) {
        dartsConfirmHandoff(f); const id = api.snapshot().match.active;
        api.accepted(dartsHit(25), { x: id === winner ? 2 : 30, y: 0 });
    }
    dartsAssert(api.snapshot().match.winner === winner && api.snapshot().match.legCorkPurpose === 'limit' && api.snapshot().feedback.resultPending && doc.getElementById('leg-result').hidden, 'Cork distance can select the previously highest remaining score and delays only its announcement');
    dartsAssert(doc.getElementById('hit-toast').textContent.includes(api.snapshot().match.lastDart.distance.toFixed(1)), 'The final accepted physical Cork distance is shown before victory');
    dartsClick(f, 'settings-btn'); dartsClick(f, 'back-lobby-btn');
    await until(() => dartsData(f).phase === 'lobby', 'Leave final-hit interval before it expires');
    dartsFinishPresentation(f);
    dartsAssert(!api.snapshot().feedback.resultPending && doc.getElementById('turn-notice').hidden, 'Leaving the match clears scheduled final-hit presentation');
    f.remove();
}
function dartsBox(element) {
    const b = element.getBoundingClientRect(); return [b.x, b.y, b.width, b.height];
}
function dartsSameBox(actual, expected, label) {
    dartsAssert(actual.every((value, index) => Math.abs(value - expected[index]) <= .6), label + ': ' + JSON.stringify([actual, expected]));
}
function dartsCorkRows(f) { return [...dartsDoc(f).querySelectorAll('#cork-results .cork-result')]; }
async function dartsPrepareCork(f, purpose) {
    await dartsAdd(f, 3);
    await dartsChange(f, 'mode-select', purpose === 'tie' ? 'countup' : 'x01');
    await dartsChange(f, 'timer-select', 0);
    if (purpose === 'opening') await dartsChange(f, 'starting-player-select', 'cork');
    else if (purpose === 'limit') { await dartsChange(f, 'rounds-select', 10); await dartsChange(f, 'settlement-select', 'cork'); }
    await dartsStartLocal(f);
    if (purpose !== 'opening') {
        const state = dartsApi(f).snapshot().match;
        state.players.forEach((id, index) => { state.turns[id] = state.roundLimit - 1; state.scores[id] = purpose === 'limit' ? [12, 38, 91, 150][index] : 0; });
        state.turnStartScore = state.scores[state.active];
        for (let i = 0; i < state.players.length * 3; i++) {
            dartsConfirmHandoff(f); dartsApi(f).accepted({ miss: true });
        }
    }
    dartsAssert(dartsApi(f).snapshot().match.phase === 'cork' && dartsApi(f).snapshot().match.corkPurpose === purpose, 'Fixture reaches the accepted ' + purpose + ' Cork context');
}
function dartsCorkImpact(f, distance) {
    dartsConfirmHandoff(f);
    return dartsApi(f).accepted(f.contentWindow.DartsRules.scoreAt(distance, 0), { x: distance, y: 0 });
}
function dartsAssertCorkContext(f, purpose) {
    const doc = dartsDoc(f), w = f.contentWindow, state = dartsApi(f).snapshot().match;
    const key = purpose === 'opening' ? 'dartsOpeningCorkStatus' : purpose === 'limit' ? 'dartsLimitCorkStatus' : 'dartsTieCorkStatus';
    dartsAssert(doc.getElementById('match-meta').textContent === w.ArcadeCommon.i18n.t(key), 'Top status immediately prioritizes the accepted Cork purpose');
    dartsAssert(doc.getElementById('match-meta').classList.contains('cork-phase') && !doc.getElementById('cork-panel').hidden && doc.getElementById('turn-panel').hidden,
        'Cork uses its identifiable information panel without duplicating ordinary turn slots');
    dartsAssert(doc.querySelectorAll('.status-round').length === 1 && !doc.querySelector('.status-round').textContent.includes('/'), 'Cork never presents misleading ordinary-round progress');
    dartsAssert(dartsCorkRows(f).length === state.players.length && dartsCorkRows(f).filter(row => row.classList.contains('current')).length === 1,
        'The Cork panel identifies every participant and exactly one active thrower');
    const heading = doc.getElementById('cork-heading').textContent;
    dartsAssert(heading && !heading.startsWith('darts') && doc.getElementById('cork-instruction').textContent, 'Cork heading and instruction are localized');
}
async function checkDartsStatusOverflowV2() {
    for (const [width, height] of [[320, 568], [390, 844], [1200, 800]]) {
        const f = await dartsBoot('status-overflow-' + width, width, height), doc = dartsDoc(f), w = f.contentWindow, api = dartsApi(f);
        // Keep this animation-specific fixture visible so headless offscreen RAF throttling
        // cannot consume the virtual budget while waiting for preference/resize observers.
        f.style.cssText = 'position:fixed;inset:0;width:' + width + 'px;height:' + height + 'px;border:0';
        const meta = doc.getElementById('match-meta'), strip = meta.querySelector('.status-strip'), detail = doc.getElementById('status-detail');
        await sleep(30);
        dartsAssert(strip && strip.getAnimations().length === 0, 'Short Practice status is static at ' + width);
        function keyboardDetail(expectedState) {
            for (const key of ['Enter', ' ']) {
                const event = new w.KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : 'Enter', bubbles: true, cancelable: true });
                meta.dispatchEvent(event);
                dartsAssert(!event.defaultPrevented && api.snapshot().shellState === expectedState, 'Status keyboard activation preserves button defaults without starting/resuming the shell');
                // Dispatching a synthetic key cannot produce the browser's trusted click;
                // follow it with the native button action to exercise the same popup path.
                meta.click();
                dartsAssert(!detail.hidden && api.snapshot().shellState === expectedState, 'Keyboard status detail can open while the shell remains ' + expectedState);
                doc.getElementById('turn-status').click();
            }
        }
        dartsClick(f, 'lobby-close-btn'); keyboardDetail('idle'); dartsClick(f, 'settings-btn');
        await dartsAdd(f, 3); await dartsChange(f, 'mode-select', 'x01'); await dartsChange(f, 'starting-score-select', 701);
        await dartsChange(f, 'match-select', 3); await dartsChange(f, 'timer-select', 30000); await dartsStartLocal(f);
        const board = dartsBox(doc.getElementById('throw-surface'));
        let previousAnimation;
        for (const locale of ['en', 'zh']) {
            w.ArcadeCommon.i18n.setLocale(locale); await sleep(35);
            const controls = dartsBox(doc.querySelector('.viewport-controls')), timer = dartsBox(doc.getElementById('turn-timer'));
            const fullText = meta.textContent, overflows = strip.scrollWidth > meta.clientWidth + 1;
            dartsAssert(meta.title === fullText && meta.getAttribute('aria-label') === fullText, 'Complete ordinary status stays available to assistive technology');
            dartsAssert(meta.dataset.overflow === String(overflows), 'Overflow is measured from actual rendered text at ' + width + ' ' + locale);
            if (overflows) {
                await until(() => strip.getAnimations().length === 1, 'Overflowing status receives one animation');
                const animation = strip.getAnimations()[0], timing = animation.effect.getTiming();
                if (previousAnimation) dartsAssert(animation !== previousAnimation, 'A locale/text change cancels the old scrolling text');
                const frames = animation.effect.getKeyframes(), end = frames.reduce((a, b) => new w.DOMMatrix(b.transform).m41 < new w.DOMMatrix(a.transform).m41 ? b : a);
                animation.currentTime = timing.duration * end.offset; await sleep(1);
                const contentBounds = strip.getBoundingClientRect(), clip = meta.getBoundingClientRect();
                dartsAssert(contentBounds.left < clip.left && contentBounds.right <= clip.right + 1, 'Animation reveals the entire hidden end of the status text');
                const beforeTime = animation.currentTime;
                api.accepted({ miss: true }); await sleep(1);
                dartsAssert(strip.getAnimations()[0] === animation && animation.currentTime >= beforeTime, 'A same-meta accepted dart does not restart the animation');
                previousAnimation = animation;
            } else dartsAssert(strip.getAnimations().length === 0, 'Fitting status text does not animate on desktop');
            dartsSameBox(dartsBox(doc.getElementById('throw-surface')), board, 'Status animation cannot change board geometry');
            dartsSameBox(dartsBox(doc.querySelector('.viewport-controls')), controls, 'Controls remain stationary');
            dartsSameBox(dartsBox(doc.getElementById('turn-timer')), timer, 'The timer remains stationary and outside the animated strip');
            w.__dartsReducedMotion(true);
            await until(() => strip.getAnimations().length === 0 && meta.dataset.scrolling === 'false', 'Reduced-motion change cancels status animation');
            dartsAssert(strip.getAnimations().length === 0 && meta.dataset.scrolling === 'false', 'Reduced-motion preference disables scrolling immediately: ' + JSON.stringify({ width, locale, reduced: w.matchMedia('(prefers-reduced-motion: reduce)').matches, scrolling: meta.dataset.scrolling, animations: strip.getAnimations().map(a => a.playState) }));
            meta.click();
            dartsAssert(!detail.hidden && detail.textContent === fullText && meta.getAttribute('aria-expanded') === 'true', 'Touch/click reveals complete status without opening Room');
            const bounds = detail.getBoundingClientRect();
            dartsAssert(bounds.left >= -.6 && bounds.right <= w.innerWidth + .6, 'Expanded status details stay inside the viewport');
            meta.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            dartsAssert(detail.hidden && meta.getAttribute('aria-expanded') === 'false', 'Escape closes the lightweight status detail');
            meta.click(); doc.getElementById('turn-status').click();
            dartsAssert(detail.hidden, 'Clicking outside the status closes its detail');
            dartsAssert(doc.documentElement.scrollWidth <= w.innerWidth + 1, 'Status animation/detail does not create horizontal page overflow');
            w.__dartsReducedMotion(false); await sleep(30);
        }
        const originalClip = meta.clientWidth, oldAnimation = strip.getAnimations()[0], acceptedSeq = api.snapshot().match.seq;
        f.style.width = (width < 761 ? 1200 : 320) + 'px'; f.style.height = (width < 761 ? 800 : 568) + 'px';
        w.dispatchEvent(new w.Event('resize'));
        await until(() => meta.clientWidth !== originalClip && meta.dataset.overflow === String(strip.scrollWidth > meta.clientWidth + 1), 'Resize remeasures actual status overflow');
        if (strip.scrollWidth > meta.clientWidth + 1) {
            await until(() => strip.getAnimations().length === 1 && strip.getAnimations()[0] !== oldAnimation, 'Resize creates an animation for the new clipping width');
        } else dartsAssert(strip.getAnimations().length === 0, 'Resizing until text fits cancels the old scrolling animation');
        dartsAssert(api.snapshot().match.seq === acceptedSeq && doc.documentElement.scrollWidth <= w.innerWidth + 1, 'Status resize changes neither accepted scoring nor horizontal page bounds');
        f.style.width = width + 'px'; f.style.height = height + 'px'; w.dispatchEvent(new w.Event('resize'));
        await until(() => meta.clientWidth === originalClip, 'Original status viewport is restored');
        dartsSameBox(dartsBox(doc.getElementById('throw-surface')), board, 'Returning to the original viewport restores the same board geometry');
        w.ArcadeCommon.i18n.setLocale('en');
        dartsClick(f, 'restart-btn'); await until(() => doc.getElementById('lobby').open, 'Status state reset reaches lobby');
        await dartsChange(f, 'mode-select', 'practice'); await dartsStartLocal(f); await sleep(30);
        dartsAssert(strip.textContent === w.ArcadeCommon.i18n.t('dartsPractice') && strip.getAnimations().length === 0 && detail.hidden, 'A new short-mode status removes stale animation/detail');
        dartsClick(f, 'pause-btn'); keyboardDetail('paused');
        f.remove();
    }
}
async function checkDartsCorkRethrowsV2() {
    for (const [width, height] of [[320, 568], [390, 844], [1200, 800]]) {
        for (const purpose of ['opening', 'tie', 'limit']) {
            const f = await dartsBoot('cork-clarity-' + width + '-' + purpose, width, height), doc = dartsDoc(f), api = dartsApi(f), w = f.contentWindow;
            await dartsPrepareCork(f, purpose);
            const board = dartsBox(doc.getElementById('throw-surface')), panel = dartsBox(doc.getElementById('mode-panel')), seats = api.snapshot().match.players.slice();
            dartsAssertCorkContext(f, purpose);
            dartsConfirmHandoff(f); api.refresh();
            const entry = api.snapshot().feedback.notice;
            dartsAssert(entry && entry.kind === 'cork' && entry.purpose === purpose, 'Entering Cork announces the accepted purpose after any handoff');
            if (purpose === 'limit') dartsAssert(doc.getElementById('turn-notice').textContent.includes('10'), 'Round-limit announcement uses the actual configured cap');
            dartsAssert(doc.getElementById('handoff-overlay').hidden && !doc.getElementById('turn-notice').hidden, 'Cork announcement and handoff never overlap');
            api.refresh(); dartsAssert(api.snapshot().feedback.notice.key === entry.key, 'Repeated accepted snapshots preserve one Cork announcement');
            for (let i = 0; i < seats.length; i++) {
                const id = api.snapshot().match.active, index = seats.indexOf(id);
                dartsCorkImpact(f, index < 2 ? 5 : 10 + index * 5);
            }
            for (const round of [2, 3]) {
                const state = api.snapshot().match;
                dartsAssert(state.corkRound === round && state.corkPlayers.length === 2 && state.corkPlayers.every(id => seats.slice(0, 2).includes(id)), 'Only the equal closest participants enter Cork round ' + round);
                dartsConfirmHandoff(f); api.refresh();
                const rethrow = api.snapshot().feedback.notice;
                dartsAssert(rethrow && rethrow.kind === 'cork-rethrow' && rethrow.round === round && rethrow.players.length === 2, 'A new Cork tie round receives its own concise rethrow announcement');
                for (const locale of ['en', 'zh']) {
                    w.ArcadeCommon.i18n.setLocale(locale); dartsAssertCorkContext(f, purpose);
                    const rows = dartsCorkRows(f), eligible = rows.filter(row => row.classList.contains('eligible'));
                    dartsAssert(eligible.length === 2 && eligible.every(row => seats.slice(0, 2).includes(row.dataset.playerUid) && row.dataset.state === 'rethrow'), 'Tied eligible rows are explicitly marked for another throw');
                    dartsAssert(rows.filter(row => row.classList.contains('excluded')).every(row => row.dataset.state === 'excluded' && /\d+\.0 mm/.test(row.querySelector('.cork-distance').textContent)), 'Excluded participants retain their distance without appearing to wait');
                    dartsAssert(doc.getElementById('cork-round-note').textContent.includes(String(round)), 'The panel states the current rethrow round');
                    dartsAssert(doc.documentElement.scrollWidth <= w.innerWidth + 1 && doc.getElementById('mode-panel').scrollHeight <= doc.getElementById('mode-panel').clientHeight + 1, 'Compact Cork rows fit the fixed mobile/desktop mode panel');
                    dartsSameBox(dartsBox(doc.getElementById('throw-surface')), board, 'Cork phase/rethrow never moves the board');
                    dartsSameBox(dartsBox(doc.getElementById('mode-panel')), panel, 'Cork phase/rethrow never resizes the mode panel');
                }
                for (let i = 0; i < 2; i++) dartsCorkImpact(f, round === 2 ? 5 : i === 0 ? 8 : 3);
            }
            const finished = api.snapshot().match;
            dartsAssert(finished.phase === 'play' && purpose === 'opening' || finished.status === 'over' && purpose !== 'opening', 'Repeated ties resolve into the correct starter or Leg winner outcome');
            dartsAssert(!api.snapshot().feedback.notice || !['cork', 'cork-rethrow'].includes(api.snapshot().feedback.notice.kind), 'Cork resolution cancels old phase/rethrow announcements');
            f.remove();
        }
    }
}
async function checkDartsRemoteCorkRethrowsV2() {
    const frames = [];
    for (let i = 0; i < 4; i++) frames.push(await dartsBoot('remote-rethrow-' + i));
    await dartsChange(frames[0], 'mode-select', 'x01'); await dartsChange(frames[0], 'starting-player-select', 'cork');
    await dartsChange(frames[0], 'timer-select', 30000);
    const code = await dartsPromote(frames[0]), tools = dartsRoomTools(code, frames);
    for (const f of frames.slice(1)) await dartsJoin(f, code);
    await dartsStartOnline(frames[0], frames.slice(1));
    const seats = tools.read().game.players.slice();
    for (let i = 0; i < seats.length; i++) {
        const index = seats.indexOf(tools.read().game.active);
        await tools.throwAt(index < 2 ? 3 : 10 + index * 5, index < 2 ? 4 : 0);
    }
    dartsAssert(tools.read().game.corkRound === 2 && tools.read().game.corkPlayers.length === 2, 'Actual accepted remote impact distances deterministically produce a Cork tie');
    dartsAssert(frames.every(f => dartsApi(f).snapshot().feedback.resultPending && dartsApi(f).snapshot().feedback.finalHit.corkOutcome.kind === 'rethrow' &&
        dartsDoc(f).getElementById('handoff-overlay').hidden && dartsDoc(f).getElementById('turn-notice').hidden && dartsCorkRows(f).every(row => row.dataset.state === 'thrown')),
        'Every remote client shows the completed Cork comparison before announcing a tied rethrow');
    dartsAssert(!dartsApi(tools.active()).gesture(), 'The next remote finalist cannot begin a gesture during the last Cork impact');
    frames.forEach(dartsFinishPresentation);
    const rethrowState = structuredClone(tools.read().game), rethrowSeq = rethrowState.seq;
    for (const f of frames) {
        dartsAssertCorkContext(f, 'opening');
        dartsAssert(dartsCorkRows(f).filter(row => row.classList.contains('eligible')).length === 2 && dartsApi(f).snapshot().feedback.notice.kind === 'cork-rethrow', 'Every remote client announces the same tied subset');
        const id = rethrowState.players.find(id => rethrowState.owners[id] === dartsApi(f).snapshot().uid);
        if (!rethrowState.corkPlayers.includes(id)) {
            dartsAssert(!dartsApi(f).gesture() && !await dartsApi(f).controller().submit(dartsFlight(1, 0)), 'An excluded remote controller cannot throw or impersonate a finalist');
        }
    }
    tools.syncClock();
    const active = tools.active(), expected = structuredClone(tools.read().game);
    const duplicate = await Promise.all([dartsApi(active).controller().submit(dartsFlight(3, 4), expected), dartsApi(active).controller().submit(dartsFlight(3, 4), expected)]);
    await until(() => frames.every(f => dartsApi(f).snapshot().match.seq === rethrowSeq + 1), 'One accepted remote rethrow reaches every client');
    frames.forEach(f => dartsApi(f).land());
    dartsAssert(duplicate.filter(Boolean).length === 1 && tools.read().game.seq === rethrowSeq + 1, 'Duplicate synchronized Cork submissions score only once');
    dartsAssert(!await dartsApi(active).controller().submit(dartsFlight(1, 0), expected), 'A stale rethrow state cannot submit another accepted event');
    await tools.throwAt(3, 4);
    dartsAssert(tools.read().game.corkRound === 3, 'Consecutive deterministic remote ties require another eligible-only Cork round');
    frames.forEach(dartsFinishPresentation);
    frames.forEach(f => { f.contentWindow.__dartsNow += 5000; dartsApi(f).refresh(); });
    const before = tools.read().game.seq;
    await dartsApi(frames[0]).controller().service.heartbeat(code, 0); await sleep(30);
    dartsAssert(frames.every(f => !dartsApi(f).snapshot().feedback.notice) && tools.read().game.seq === before, 'A duplicate heartbeat cannot replay an expired Cork rethrow announcement');
    await tools.throwAt(8, 0); await tools.throwAt(2, 0);
    dartsAssert(frames.every(f => dartsApi(f).snapshot().feedback.resultPending && dartsApi(f).snapshot().feedback.finalHit.corkOutcome.kind === 'starter' &&
        !dartsDoc(f).getElementById('cork-panel').hidden && dartsDoc(f).getElementById('turn-notice').hidden), 'Remote opening Cork keeps the decisive last dart visible before announcing the starting player');
    frames.forEach(dartsFinishPresentation);
    dartsAssert(frames.every(f => dartsApi(f).snapshot().feedback.notice.kind === 'cork-starter' && dartsDoc(f).getElementById('cork-panel').hidden), 'All devices announce the same accepted starter after the final impact');
    dartsAssert(tools.read().game.phase === 'play' && frames.every(f => !dartsApi(f).snapshot().feedback.notice || !['cork', 'cork-rethrow'].includes(dartsApi(f).snapshot().feedback.notice.kind)), 'Remote resolution clears stale special notices and begins normal scoring');
    for (const f of frames) { await dartsApi(f).controller().leave(); f.remove(); }
}
async function checkDartsCorkFinalPresentationV2() {
    for (const purpose of ['opening', 'tie', 'limit']) for (const tied of [false, true]) {
        const f = await dartsBoot('cork-final-' + purpose + '-' + tied, 320, 568), doc = dartsDoc(f), w = f.contentWindow, api = dartsApi(f);
        await dartsPrepareCork(f, purpose);
        const before = api.snapshot().match, seats = before.players.slice(), scores = JSON.stringify(before.scores);
        for (let i = 0; i < seats.length; i++) {
            dartsCorkImpact(f, i === 0 || tied && i === 1 ? 5 : 10 + i * 5);
        }
        const accepted = api.snapshot().match, seq = accepted.seq, completedRound = accepted.lastDart.corkRound;
        const outcome = tied ? 'rethrow' : purpose === 'opening' ? 'starter' : 'win';
        dartsAssert(accepted.phase === 'cork' && accepted.corkRound === 2 || !tied && (accepted.phase === 'play' || accepted.status === 'over'), 'Cork resolution is authoritative before its final impact display ends');
        dartsAssert(api.snapshot().feedback.resultPending && api.snapshot().feedback.finalHit.corkOutcome.kind === outcome, 'Every completed Cork round uses the existing final-hit display interval');
        dartsAssert(!doc.getElementById('hit-toast').hidden && doc.getElementById('hit-toast').textContent.includes('25.0 mm'), 'The final throw distance, including a losing final dart, remains visible');
        dartsAssert(doc.getElementById('leg-result').hidden && doc.getElementById('handoff-overlay').hidden && doc.getElementById('turn-notice').hidden, 'Starter, victory, handoff and rethrow announcements cannot cover the last Cork hit');
        dartsAssert(doc.getElementById('cork-round-note').textContent.includes(String(completedRound)) && dartsCorkRows(f).every(row => row.dataset.state === 'thrown'), 'Completed distances stay visible instead of clearing into the next Cork round');
        dartsAssert(dartsCorkRows(f).filter(row => row.classList.contains('eligible')).length === 4 && doc.querySelector('.cork-result.current').dataset.playerUid === accepted.lastDart.uid, 'The held comparison retains the previous field and actual last thrower');
        dartsAssert(!api.gesture(), 'No next-phase dart can be launched during final Cork presentation');
        await dartsFlick(f, doc.getElementById('mode-panel'));
        dartsAssert(api.snapshot().match.seq === seq && JSON.stringify(api.snapshot().match.scores) === scores, 'A blocked final-hit gesture cannot score or modify Cork totals');
        api.refresh(); api.refresh();
        w.__dartsNow += w.DartsFeedback.TIMING.finalHit - 1; api.refresh();
        dartsAssert(api.snapshot().feedback.resultPending && doc.getElementById('handoff-overlay').hidden, 'Repeated snapshots cannot shorten the Cork hit interval');
        w.__dartsNow += 2; api.refresh();
        dartsAssert(!api.snapshot().feedback.resultPending, 'The Cork display expires without changing authoritative state');
        if (outcome === 'win') {
            dartsAssert(!doc.getElementById('leg-result').hidden && accepted.winner === before.active, 'A settled Cork winner appears after the impact, even when the winner threw earlier: ' + purpose);
        } else {
            dartsAssert(!doc.getElementById('handoff-overlay').hidden, 'The next local participant requires handoff only after the final impact');
            if (outcome === 'starter') dartsAssert(doc.getElementById('handoff-title').textContent.includes(w.ArcadeCommon.i18n.t('dartsCorkStarter', dartsData(f).roster[seats[0]])), 'Opening Cork identifies who obtained the starting turn');
            else dartsAssert(doc.getElementById('handoff-message').textContent.includes(w.ArcadeCommon.i18n.t('dartsCorkRethrow', 2)), 'A tie explains the eligible-only rethrow before device exchange');
            dartsClick(f, 'handoff-ready-btn');
            if (tied) {
                dartsAssert(dartsCorkRows(f).filter(row => row.classList.contains('eligible')).length === 2 && api.snapshot().feedback.notice.kind === 'cork-rethrow', 'The next Cork round and tied subset appear after the held comparison');
            } else dartsAssert(doc.getElementById('cork-panel').hidden && doc.getElementById('match-meta').textContent.startsWith('501'), 'Opening resolution returns to the scoring phase after its last hit');
            dartsAssert(api.gesture(), 'A new gesture is available to the confirmed next participant');
        }
        dartsAssert(api.snapshot().match.seq === seq && JSON.stringify(api.snapshot().match.scores) === scores, 'Outcome presentation does not advance or rescore the accepted game');
        f.remove();
    }
    // When the last thrower wins opening Cork, no device exchange is needed.
    const f = await dartsBoot('cork-final-same-player'), doc = dartsDoc(f), api = dartsApi(f), w = f.contentWindow;
    await dartsAdd(f, 1); await dartsChange(f, 'mode-select', 'x01'); await dartsChange(f, 'starting-player-select', 'cork'); await dartsChange(f, 'timer-select', 30000);
    await dartsStartLocal(f); dartsCorkImpact(f, 10); dartsCorkImpact(f, 5);
    const winner = api.snapshot().match.active, deadline = api.snapshot().match.turnStartedAt + api.snapshot().match.turnMs;
    dartsAssert(api.snapshot().feedback.blocking && doc.getElementById('handoff-overlay').hidden, 'A same-player opening result still gates input until the final impact is shown');
    dartsFinishPresentation(f);
    dartsAssert(doc.getElementById('handoff-overlay').hidden && api.snapshot().feedback.notice.kind === 'cork-starter' && api.snapshot().feedback.notice.player === winner, 'The final thrower receives a nonblocking starting-player announcement');
    dartsAssert(api.snapshot().match.turnStartedAt + api.snapshot().match.turnMs === deadline, 'Finishing the Cork display never resets the accepted turn timer');
    dartsAssert(api.gesture(), 'The starting player can begin a fresh scoring gesture after the Cork display'); api.land();
    dartsAssert(!api.snapshot().feedback.notice && !doc.getElementById('hit-toast').hidden, 'The first ordinary impact replaces the starter notice so its hit is not obscured');
    dartsClick(f, 'restart-btn'); await until(() => doc.getElementById('lobby').open, 'restart before a second held Cork result');
    await dartsStartLocal(f); dartsCorkImpact(f, 10); dartsCorkImpact(f, 5);
    dartsClick(f, 'restart-btn'); await until(() => doc.getElementById('lobby').open, 'cancel held opening result');
    w.__dartsNow += 5000; api.refresh();
    dartsAssert(!api.snapshot().feedback.resultPending && !api.snapshot().feedback.notice && doc.getElementById('handoff-overlay').hidden, 'Leaving during the held Cork impact cancels its later outcome announcement');
    f.remove();
}
async function checkDartsCorkPreviewV2() {
    if (!corkPreview) return;
    const width = preview === 'desktop' ? 1200 : 390, height = preview === 'desktop' ? 800 : 844;
    const f = await dartsBoot('cork-preview', width, height), api = dartsApi(f);
    f.style.cssText = 'position:fixed;inset:0;width:' + width + 'px;height:' + height + 'px;border:0;z-index:20';
    await dartsPrepareCork(f, 'limit');
    const seats = api.snapshot().match.players;
    for (let i = 0; i < seats.length; i++) dartsCorkImpact(f, seats.indexOf(api.snapshot().match.active) < 2 ? 5 : 20 + i * 5);
    dartsConfirmHandoff(f); f.contentWindow.__dartsNow += 5000; api.refresh();
    const w = f.contentWindow, doc = dartsDoc(f), englishColors = ['settings-btn', 'history-btn'].map(id => w.getComputedStyle(doc.getElementById(id)).color);
    w.ArcadeCommon.i18n.setLocale('zh'); await doc.fonts.ready; await sleep(60);
    const chineseColors = ['settings-btn', 'history-btn'].map(id => w.getComputedStyle(doc.getElementById(id)).color);
    dartsAssert(chineseColors.every((color, index) => color === englishColors[index] && color === w.getComputedStyle(doc.body).color),
        'Cork and localization preserve toolbar foreground contrast: ' + JSON.stringify({ englishColors, chineseColors, body: w.getComputedStyle(doc.body).color }));
}
async function dartsAddCpu(f, difficulty = 'normal') {
    const count = dartsData(f).seatOrder.length;
    await until(() => !dartsDoc(f).getElementById('add-cpu-btn').disabled, 'CPU slot available');
    dartsClick(f, 'add-cpu-btn');
    await until(() => dartsData(f).seatOrder.length === count + 1 && !dartsDoc(f).getElementById('lobby-start-btn').disabled, 'CPU slot accepted');
    const id = dartsData(f).seatOrder.at(-1);
    if (difficulty !== 'normal') await dartsCpuDifficulty(f, id, difficulty);
    return id;
}
async function dartsCpuDifficulty(f, id, difficulty) {
    const select = [...dartsDoc(f).querySelectorAll('.slot-difficulty')].find(el => el.dataset.cpuSlot === id);
    await until(() => select && !select.disabled, 'editable CPU difficulty');
    select.focus(); select.value = difficulty;
    select.dispatchEvent(new f.contentWindow.Event('change', { bubbles: true }));
    await until(() => dartsData(f).participants[id].difficulty === difficulty && [...dartsDoc(f).querySelectorAll('.slot-difficulty')].some(el => el.dataset.cpuSlot === id && !el.disabled), 'CPU difficulty accepted');
}
async function dartsCpuStart(f, starter = 0) {
    const w = f.contentWindow, previous = w.Math.random, count = dartsData(f).seatOrder.length;
    w.Math.random = () => (starter + .1) / count;
    try { await dartsStartLocal(f); } finally { w.Math.random = previous; }
    dartsApi(f).cpuSeed(45291);
}
function dartsCpuSettleDisplay(f) {
    const api = dartsApi(f);
    if (api.snapshot().feedback.resultPending) api.step(1001, 0);
    if (api.snapshot().dartState === 'landed') api.step(0, 1);
    dartsConfirmHandoff(f);
}
function dartsCpuDart(f, pacing = false) {
    const api = dartsApi(f), w = f.contentWindow;
    dartsCpuSettleDisplay(f);
    const before = api.snapshot().match, uid = before.active, seq = before.seq;
    dartsAssert(before.participants[uid].type === 'cpu', 'CPU helper only operates the active CPU');
    dartsAssert(!api.gesture(), 'Human gesture entry is blocked throughout a CPU turn');
    api.step(0, 0);
    const pending = api.cpu().pending;
    dartsAssert(pending, 'A ready CPU schedules one ordinary throw');
    const remaining = Math.max(0, pending.at - w.__dartsNow);
    if (pacing && remaining > 0) {
        api.step(remaining - 1, 0);
        dartsAssert(api.snapshot().dartState === 'ready' && api.snapshot().match.seq === seq, 'CPU waits before its actual flight');
        api.step(1, 0);
    } else api.step(remaining, 0);
    const shot = api.cpu().last, physical = api.physics(shot.samples);
    dartsAssert(shot.player === uid && shot.accepted && api.snapshot().dartState === 'flying', 'CPU launches a synthetic gesture through the ordinary flight');
    dartsAssert(physical.analysis.valid && Math.hypot(physical.impact.x - shot.impact.x, physical.impact.y - shot.impact.y) < 1e-8, 'Replaying CPU samples through unchanged physics reproduces its physical impact');
    dartsAssert(api.snapshot().match.seq === seq, 'Starting a CPU flight does not assign an early score');
    api.step(0, 1);
    const accepted = api.snapshot().match;
    dartsAssert(accepted.seq === seq + 1 && accepted.lastDart.uid === uid, 'A physical CPU impact is accepted exactly once');
    const result = w.DartsRules.scoreResult(before, physical.result);
    dartsAssert(accepted.lastDart.result.base === result.base && accepted.lastDart.result.mult === result.mult && accepted.lastDart.result.score === result.score,
        'Physics and the active Bull rule determine the CPU scored region');
    api.step(0, 0);
    dartsAssert(api.snapshot().match.seq === seq + 1, 'Repeated scheduler polls cannot score the landed CPU dart again');
    return { shot, dart: accepted.lastDart, before, after: accepted };
}
function dartsHumanDart(f) {
    dartsCpuSettleDisplay(f); dartsAssert(dartsApi(f).gesture(), 'The confirmed human can throw after CPU presentation');
    dartsApi(f).step(0, 1);
}
async function checkDartsCpuLobbyV2() {
    for (const [width, height] of [[320, 568], [390, 844], [1200, 800]]) {
        const f = await dartsBoot('cpu-lobby-' + width, width, height), doc = dartsDoc(f), api = dartsApi(f), w = f.contentWindow;
        dartsAssert(!w.ArcadeNet && doc.getElementById('add-cpu-btn').disabled && doc.getElementById('lobby-cpu-note').textContent.includes('X01'), 'Practice explains how to enable local CPU opponents without networking');
        await dartsChange(f, 'mode-select', 'x01');
        const id = await dartsAddCpu(f), human = dartsData(f).seatOrder[0];
        dartsAssert(dartsData(f).participants[id].type === 'cpu' && dartsData(f).participants[id].difficulty === 'normal', 'New CPUs occupy a normal slot at Normal difficulty');
        dartsAssert(doc.querySelector('.darts-lobby-slot.cpu .slot-badge.cpu') && !doc.querySelector('[data-remove-slot="' + human + '"]') && !api.removePlayer(human), 'CPU is identified and the sole human cannot be removed');
        for (const difficulty of ['easy', 'hard', 'insane', 'normal']) {
            dartsData(f).ready = { test: true }; await dartsCpuDifficulty(f, id, difficulty);
            dartsAssert(!Object.keys(dartsData(f).ready).length && doc.activeElement.dataset.cpuSlot === id, 'CPU difficulty clears Ready and preserves keyboard focus');
        }
        dartsAssert(!doc.getElementById('create-room-btn').disabled && !doc.getElementById('join-room-btn').disabled && !doc.getElementById('room-code-input').disabled, 'CPU slots retain invitation and join controls');
        await dartsChange(f, 'mode-select', 'practice');
        dartsAssert(dartsData(f).participants[id].type === 'cpu' && doc.getElementById('lobby-start-btn').disabled && doc.getElementById('lobby-start-reason').textContent.includes('CPU'), 'Switching to Practice preserves CPU slots and explains its blocked start');
        await dartsChange(f, 'mode-select', 'countup');
        const bounds = doc.getElementById('lobby').getBoundingClientRect();
        for (const row of doc.querySelectorAll('.darts-lobby-slot')) {
            dartsAssert(row.scrollWidth <= row.clientWidth + 1, 'CPU row fits viewport ' + width);
            const select = row.querySelector('select');
            if (select) { const rect = select.getBoundingClientRect(); dartsAssert(rect.left >= bounds.left && rect.right <= bounds.right, 'CPU difficulty stays inside lobby ' + width); }
        }
        dartsAssert(await api.removePlayer(id), 'CPU removal remains available');
        const code = await dartsPromote(f);
        dartsAssert(!doc.getElementById('add-cpu-btn').disabled && await api.addCpu(), 'A coded room supports device-owned CPU slots');
        await api.controller().leave(); f.remove();
    }
}
async function checkDartsCpuMatchesV2() {
    for (const [humans, cpus] of [[1, 1], [1, 3], [2, 2], [3, 1]]) {
        const f = await dartsBoot('cpu-composition-' + humans + '-' + cpus), api = dartsApi(f), w = f.contentWindow;
        await dartsChange(f, 'mode-select', 'countup'); await dartsChange(f, 'rounds-select', 5); await dartsChange(f, 'timer-select', 0);
        if (humans > 1) await dartsAdd(f, humans - 1);
        const levels = cpus === 3 ? ['easy', 'hard', 'insane'] : cpus === 2 ? ['normal', 'hard'] : ['normal'];
        for (let i = 0; i < cpus; i++) await dartsAddCpu(f, levels[i]);
        await dartsCpuStart(f);
        const config = JSON.stringify(api.snapshot().match.participants), seen = new Set();
        for (let i = 0; api.snapshot().match.status === 'playing' && i < 150; i++) {
            const state = api.snapshot().match, cpu = state.participants[state.active].type === 'cpu';
            if (cpu) { dartsCpuDart(f, !seen.has(state.active)); seen.add(state.active); dartsAssert(!api.snapshot().feedback.handoff || api.snapshot().match.participants[api.snapshot().match.active].type !== 'cpu', 'CPU transitions never require CPU Ready to Throw'); }
            else dartsHumanDart(f);
        }
        const state = api.snapshot().match;
        dartsAssert(state.status === 'over' && seen.size === cpus && state.history.length >= (humans + cpus) * 5, 'Five-round Count-Up completes through real throws for composition ' + humans + '+' + cpus);
        dartsAssert(JSON.stringify(state.participants) === config && state.players.every(id => state.stats[id].darts === 15), 'CPU type/difficulty remain locked and every participant gets fifteen ordinary darts');
        dartsAssert(!w.ArcadeNet && state.history.every(row => !('samples' in row) && !('diagnostics' in row)), 'CPU gameplay remains offline and history contains ordinary game events');
        api.step(1001, 1); dartsClick(f, 'history-btn');
        dartsAssert(dartsDoc(f).getElementById('history-list').textContent.includes(dartsData(f).roster[[...seen][0]]), 'CPU throw history is available through the ordinary history view');
        f.remove();
    }
}
async function checkDartsCpuHandoffV2() {
    const f = await dartsBoot('cpu-intervening-handoff'), api = dartsApi(f), doc = dartsDoc(f);
    await dartsChange(f, 'mode-select', 'countup'); await dartsChange(f, 'timer-select', 0);
    await dartsAddCpu(f); await dartsAdd(f, 1); await dartsAddCpu(f); await dartsCpuStart(f);
    const seats = api.snapshot().match.players;
    for (let i = 0; i < 3; i++) dartsHumanDart(f);
    dartsAssert(api.snapshot().match.active === seats[1] && !api.snapshot().feedback.handoff, 'Human-to-CPU uses a normal turn notice');
    const rect = doc.getElementById('mode-panel').getBoundingClientRect(), w = f.contentWindow;
    doc.getElementById('mode-panel').dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true, clientX: rect.x + 20, clientY: rect.y + 20 }));
    dartsAssert(!api.snapshot().gestureActive, 'Actual pointer input cannot begin during the CPU turn');
    for (let i = 0; i < 3; i++) dartsCpuDart(f);
    dartsAssert(api.snapshot().match.active === seats[2] && api.snapshot().feedback.handoff && api.snapshot().feedback.handoff.player === seats[2], 'A different human following an intervening CPU still requires device handoff');
    dartsAssert(!api.gesture(), 'The second human cannot bypass its handoff'); dartsConfirmHandoff(f);
    for (let i = 0; i < 3; i++) dartsHumanDart(f);
    for (let i = 0; i < 3; i++) dartsCpuDart(f);
    dartsAssert(api.snapshot().feedback.handoff && api.snapshot().feedback.handoff.player === seats[0], 'The CPU-separated return to the first human preserves handoff protection');
    f.remove();
    const solo = await dartsBoot('cpu-one-human-handoff'), soloApi = dartsApi(solo);
    await dartsChange(solo, 'mode-select', 'countup'); await dartsChange(solo, 'timer-select', 0); await dartsAddCpu(solo); await dartsCpuStart(solo);
    for (let i = 0; i < 3; i++) dartsHumanDart(solo);
    for (let i = 0; i < 3; i++) dartsCpuDart(solo);
    dartsAssert(!soloApi.snapshot().feedback.handoff && soloApi.snapshot().feedback.notice.kind === 'turn', 'The sole human returns from CPU play with a clear notice and no redundant confirmation');
    solo.remove();
}
async function checkDartsCpuCancellationV2() {
    const f = await dartsBoot('cpu-cancellation'), api = dartsApi(f), doc = dartsDoc(f), w = f.contentWindow;
    await dartsChange(f, 'mode-select', 'countup'); await dartsChange(f, 'timer-select', 0); await dartsAddCpu(f); await dartsCpuStart(f, 1);
    api.step(0, 0); dartsAssert(api.cpu().pending, 'Initial CPU has a scheduled throw');
    dartsClick(f, 'pause-btn'); api.step(2000, 0);
    dartsAssert(!api.cpu().pending && api.snapshot().match.seq === 0, 'Pause cancels CPU work without advancing its score');
    dartsClick(f, 'pause-btn'); api.step(0, 0); dartsAssert(api.cpu().pending.at > w.__dartsNow, 'Resume starts a fresh CPU recognition delay');
    dartsClick(f, 'settings-btn'); api.step(2000, 0);
    dartsAssert(!api.cpu().pending && api.snapshot().match.seq === 0, 'Lobby dialog cancels CPU execution');
    dartsClick(f, 'lobby-close-btn'); api.step(0, 0); dartsAssert(api.cpu().pending, 'Closing Lobby reschedules the still-current CPU');
    dartsClick(f, 'history-btn'); api.step(2000, 0);
    dartsAssert(!api.cpu().pending && api.snapshot().match.seq === 0, 'History blocks CPU flight while open');
    dartsClick(f, 'history-close-btn'); api.step(0, 0);
    const replaced = structuredClone(api.snapshot().match); replaced.matchId += '-replacement';
    api.step(899, 0); api.replace(replaced); api.step(1, 0);
    dartsAssert(api.snapshot().match.seq === 0 && api.cpu().pending.key.includes('-replacement') && api.cpu().pending.at > w.__dartsNow, 'Replacing a match invalidates the stale pending dart');
    dartsClick(f, 'restart-btn'); await until(() => doc.getElementById('lobby').open, 'CPU restart returns to Lobby');
    api.step(5000, 1); dartsAssert(!api.cpu().pending && api.snapshot().match.seq === 1 && dartsData(f).phase === 'lobby', 'Restart cancels pending CPU work and cannot replay its stale throw');
    await dartsCpuStart(f, 1); api.step(0, 0); api.step(900, 0);
    dartsAssert(api.snapshot().dartState === 'flying' && api.snapshot().match.seq === 0, 'A CPU flight is still unscored before its impact');
    dartsClick(f, 'restart-btn'); await until(() => doc.getElementById('lobby').open, 'restart during CPU flight');
    api.step(5000, 1);
    dartsAssert(api.snapshot().dartState === 'ready' && api.snapshot().match.seq === 1 && !api.snapshot().match.history.length && !api.cpu().pending, 'Restart clears an in-flight CPU dart before it can become a stale hit');
    await dartsChange(f, 'mode-select', 'x01'); await dartsChange(f, 'timer-select', 30000); await dartsCpuStart(f, 1);
    const timed = api.snapshot().match, deadline = timed.turnStartedAt + timed.turnMs;
    dartsCpuDart(f, true); dartsAssert(api.snapshot().match.turnStartedAt + api.snapshot().match.turnMs === deadline, 'CPU pacing does not reset authoritative turn time');
    api.step(deadline - w.__dartsNow, 1); const seq = api.snapshot().match.seq;
    dartsAssert(!api.cpu().pending && api.snapshot().dartState !== 'flying', 'An expired CPU deadline cannot launch another dart');
    api.expire(); api.step(5000, 0);
    dartsAssert(api.snapshot().match.seq === seq + 1 && api.snapshot().match.participants[api.snapshot().match.active].type === 'human' && !api.cpu().pending, 'Existing timeout handling changes the turn and cancels CPU work');
    f.remove();
    const invalid = await dartsBoot('cpu-invalid-gesture'), rejected = dartsApi(invalid);
    await dartsChange(invalid, 'mode-select', 'countup'); await dartsChange(invalid, 'timer-select', 0);
    await dartsAddCpu(invalid, 'easy'); await dartsCpuStart(invalid, 1);
    rejected.cpuSeed(8549); rejected.step(0, 0); rejected.step(900, 0);
    dartsAssert(!rejected.cpu().last.accepted && rejected.snapshot().dartState === 'ready' && rejected.snapshot().match.seq === 0 && !rejected.snapshot().match.history.length,
        'A deterministic invalid CPU gesture consumes an input attempt without launching or scoring a dart');
    dartsAssert(dartsDoc(invalid).getElementById('hit-toast').hidden, 'A CPU fumble does not show misleading human throwing instructions');
    rejected.cpuSeed(45291); const actual = dartsCpuDart(invalid);
    dartsAssert(actual.after.seq === 1 && actual.after.stats[actual.shot.player].darts === 1, 'A later valid CPU gesture, including a real miss, is counted once');
    invalid.remove();
    const boundary = await dartsBoot('cpu-deadline-during-planning'), clocked = dartsApi(boundary), bw = boundary.contentWindow;
    await dartsChange(boundary, 'mode-select', 'countup'); await dartsChange(boundary, 'timer-select', 30000);
    await dartsAddCpu(boundary); await dartsCpuStart(boundary, 1); clocked.step(0, 0);
    const expiresAt = clocked.snapshot().match.turnStartedAt + clocked.snapshot().match.turnMs, choose = bw.DartsCpuStrategy.choose;
    bw.DartsCpuStrategy.choose = (...args) => { const target = choose(...args); bw.__dartsNow = expiresAt; return target; };
    try { clocked.step(900, 0); } finally { bw.DartsCpuStrategy.choose = choose; }
    dartsAssert(clocked.snapshot().dartState === 'ready' && clocked.snapshot().match.seq === 0 && !clocked.cpu().last.accepted,
        'A deadline reached during target/gesture planning is rechecked before flight launch');
    clocked.expire(); dartsAssert(clocked.snapshot().match.seq === 1, 'The ordinary timeout settles the expired CPU turn once');
    boundary.remove();
}
async function checkDartsCpuRulesAndCorkV2() {
    const longGame = await dartsBoot('cpu-long-x01'), longApi = dartsApi(longGame);
    await dartsChange(longGame, 'mode-select', 'x01'); await dartsChange(longGame, 'starting-score-select', 1501);
    await dartsChange(longGame, 'rounds-select', 0); await dartsChange(longGame, 'timer-select', 0);
    const longCpu = await dartsAddCpu(longGame, 'insane'); await dartsCpuStart(longGame);
    for (let dart = 0; longApi.snapshot().match.status === 'playing' && dart < 500; dart++) {
        if (longApi.snapshot().match.participants[longApi.snapshot().match.active].type === 'cpu') dartsCpuDart(longGame);
        else dartsHumanDart(longGame);
    }
    const complete = longApi.snapshot().match;
    dartsAssert(complete.status === 'over' && complete.legEndReason === 'checkout' && complete.startingScore === 1501 &&
        complete.stats[longCpu].darts >= 15 && complete.history.length >= 15, 'A long 1501 Double-Out game finishes through real human/CPU gestures without score fixtures');
    longGame.remove();
    for (const variant of ['standard', 'cutthroat']) {
        const f = await dartsBoot('cpu-cricket-' + variant), api = dartsApi(f);
        await dartsChange(f, 'mode-select', 'cricket'); await dartsChange(f, 'cricket-select', variant); await dartsChange(f, 'timer-select', 0); await dartsAddCpu(f, 'hard'); await dartsCpuStart(f, 1);
        for (let i = 0; i < 6; i++) {
            if (api.snapshot().match.participants[api.snapshot().match.active].type === 'cpu') dartsCpuDart(f, i === 0);
            else dartsHumanDart(f);
        }
        dartsAssert(api.snapshot().match.cricketVariant === variant && api.snapshot().match.history.some(row => row.uid.startsWith('cpu-')), 'CPU physical darts use the selected ' + variant + ' Cricket rules');
        f.remove();
    }
    const f = await dartsBoot('cpu-opening-cork'), api = dartsApi(f), doc = dartsDoc(f), w = f.contentWindow;
    await dartsChange(f, 'mode-select', 'x01'); await dartsChange(f, 'timer-select', 0); const cpuId = await dartsAddCpu(f, 'insane'); await dartsChange(f, 'starting-player-select', 'cork'); await dartsCpuStart(f);
    dartsHumanDart(f);
    const event = dartsCpuDart(f, true);
    dartsAssert(event.shot.target.x === 0 && event.shot.target.y === 0 && api.snapshot().match.phase === 'play', 'Opening Cork CPU aims at physical center and resolves the starting player');
    dartsAssert(api.snapshot().feedback.resultPending && api.snapshot().feedback.finalHit.corkOutcome.kind === 'starter' && !doc.getElementById('cork-panel').hidden, 'A final CPU Cork dart preserves the completed impact comparison');
    api.step(999, 1); dartsAssert(!api.cpu().pending, 'The starter cannot launch before the final Cork impact interval ends');
    api.step(2, 0); dartsAssert(!api.snapshot().feedback.resultPending, 'The held CPU Cork outcome expires normally');
    if (api.snapshot().match.active === cpuId) { api.step(0, 0); dartsAssert(api.cpu().pending && api.cpu().pending.at > w.__dartsNow, 'A CPU starter gets a fresh delay after final Cork presentation'); }
    const base = structuredClone(api.snapshot().match), humanId = base.players.find(id => id !== cpuId);
    for (const purpose of ['tie', 'limit']) {
        const state = structuredClone(base); state.matchId += '-' + purpose; state.phase = 'cork'; state.corkPurpose = purpose; state.corkRound = 1;
        state.active = cpuId; state.corkPlayers = state.players.slice(); state.corkDistances = {}; state.dart = 0; state.turnDarts = []; state.turnPoints = 0; state.history = []; state.seq = 0;
        api.replace(state); api.step(0, 1); const actual = dartsCpuDart(f);
        dartsAssert(actual.dart.corkPurpose === purpose && actual.dart.distance === Math.hypot(actual.shot.impact.x, actual.shot.impact.y), 'CPU ' + purpose + ' Cork records actual physical distance');
        const same = actual.shot.impact; dartsConfirmHandoff(f);
        api.accepted(w.DartsRules.scoreAt(same.x, same.y), { x: same.x, y: same.y });
        dartsAssert(api.snapshot().match.corkRound === 2 && api.snapshot().feedback.finalHit.corkOutcome.kind === 'rethrow', 'A physical CPU distance can produce a legal tied Cork rethrow');
        api.step(1001, 1); dartsConfirmHandoff(f);
        const rethrow = dartsCpuDart(f);
        dartsAssert(rethrow.dart.corkRound === 2, 'The eligible CPU performs an actual synthetic rethrow');
        api.accepted({ miss: true }, { x: 1000, y: 0 });
        const decisiveState = structuredClone(state); decisiveState.matchId += '-decisive'; decisiveState.active = humanId;
        api.replace(decisiveState); api.accepted({ miss: true }, { x: 1000, y: 0 });
        const decisive = dartsCpuDart(f);
        dartsAssert(decisive.after.status === 'over' && decisive.after.winner === cpuId && api.snapshot().feedback.finalHit.corkOutcome.kind === 'win', 'A final CPU Cork impact settles the Leg using ordinary distance comparison');
        api.step(5000, 1); dartsAssert(!api.cpu().pending && !doc.getElementById('leg-result').hidden, 'Settled CPU Cork victory cancels future throws and shows the normal result');
    }
    f.remove();
}
async function checkDartsCpuPreviewV2() {
    if (!cpuOnly || !preview) return;
    const width = preview === 'desktop' ? 1200 : 390, height = preview === 'desktop' ? 800 : 844;
    const f = await dartsBoot('cpu-preview', width, height), doc = dartsDoc(f);
    f.style.cssText = 'position:fixed;inset:0;width:' + width + 'px;height:' + height + 'px;border:0;z-index:20';
    await dartsChange(f, 'mode-select', 'x01'); await dartsChange(f, 'timer-select', 0);
    for (const level of ['normal', 'hard', 'insane']) await dartsAddCpu(f, level);
    f.contentWindow.ArcadeCommon.i18n.setLocale('zh');
    if (lobbyPreview) { doc.getElementById('lobby-content').scrollTop = 0; }
    else { await dartsCpuStart(f, 1); dartsCpuDart(f); dartsCpuDart(f); }
    await doc.fonts.ready; await sleep(60);
}
async function checkDartsInvalidV2() {
    const f = await dartsBoot('invalid-room'), doc = dartsDoc(f), w = f.contentWindow;
    dartsAssert(!w.ArcadeNet, 'Offline boot does not load networking');
    doc.getElementById('invite-details').open = true; dartsClick(f, 'create-room-btn');
    await until(() => w.ArcadeNet && w.ArcadeNet.ok && w.ArcadeNet.rooms.ok === false, 'invalid optional online backend');
    await until(() => !doc.getElementById('lobby-start-btn').disabled, 'local start remains available after online error');
    dartsAssert(!dartsApi(f).snapshot().room, 'Invalid backend does not replace local room');
    await w.ArcadeNet.profile.save('invalid-room', { games: { beam: { bests: { test: 7 } } } });
    dartsAssert((await w.ArcadeNet.profile.get('invalid-room')).games.beam.bests.test === 7, 'Account profiles survive disabled rooms');
    await dartsStartLocal(f); await dartsFlick(f, doc.getElementById('mode-panel'));
    dartsAssert(dartsApi(f).snapshot().darts === 1, 'Local practice still works after online failure');
    f.remove();
}

const dartsGuideKey = 'arcadeGames:darts:throw-guide:v1';
function dartsGuidePointer(f, target, type, x, y, id = 73) {
    const event = new f.contentWindow.PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y,
        pointerId: id, isPrimary: true, pointerType: f.contentWindow.matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse' });
    target.dispatchEvent(event); dartsApi(f).refresh(); return event;
}
async function dartsGuideFlick(f, target) {
    const api = dartsApi(f), w = f.contentWindow, rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.bottom - 7;
    const down = dartsGuidePointer(f, target, 'pointerdown', x, y);
    dartsAssert(down.defaultPrevented && api.snapshot().gestureActive && !dartsDoc(f).getElementById('gesture-contact').hasAttribute('hidden'),
        'A valid throw region tracks the actual pointer and prevents scrolling');
    await sleep(60); dartsGuidePointer(f, w, 'pointermove', x + 3, y - 60);
    await sleep(60); dartsGuidePointer(f, w, 'pointermove', x + 6, y - 140);
    const samples = structuredClone(api.input().gesture.samples), expected = api.physics(samples);
    dartsAssert(expected.analysis.valid && samples.length === 3, 'Visual feedback adds no extra gesture samples');
    dartsGuidePointer(f, w, 'pointerup', x + 6, y - 140);
    const actual = api.input();
    if (!api.snapshot().room) {
        dartsAssert(JSON.stringify(actual.analysis.samples) === JSON.stringify(expected.analysis.samples) &&
            Math.hypot(actual.impact.x - expected.impact.x, actual.impact.y - expected.impact.y) < 1e-8,
            'Feedback leaves the real human release analysis and physical impact unchanged');
    }
}
async function checkDartsThrowGuideV2() {
    localStorage.removeItem(dartsGuideKey);
    const practice = await dartsBoot('touch-guide-practice'), practiceDoc = dartsDoc(practice), practiceApi = dartsApi(practice);
    await dartsStartLocal(practice); practiceApi.step(5000, 0);
    dartsAssert(!practiceDoc.getElementById('throw-guide').hidden, 'First-use Practice shares the same nonblocking guide');
    dartsClick(practice, 'throw-guide-dismiss');
    dartsAssert(localStorage.getItem(dartsGuideKey) === 'true' && practiceApi.snapshot().match.seq === 0, 'Manual first-use dismissal persists without a throw');
    practice.remove();
    for (const [width, height, mode] of [[320, 568, 'cricket'], [390, 844, 'countup'], [1200, 800, 'x01']]) {
        localStorage.removeItem(dartsGuideKey);
        const f = await dartsBoot((width < 761 ? 'touch-' : '') + 'guide-' + width, width, height);
        const doc = dartsDoc(f), w = f.contentWindow, api = dartsApi(f), hint = doc.getElementById('throw-guide');
        dartsAssert(hint.hidden, 'Lobby does not show throwing onboarding');
        await dartsChange(f, 'mode-select', mode); await dartsChange(f, 'timer-select', 0);
        if (mode === 'cricket') await dartsAdd(f, 3);
        else if (mode === 'x01') await dartsAdd(f, 1);
        const bounds = () => ['stage', 'player-scores', 'mode-panel'].map(id => {
            const r = doc.getElementById(id).getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
        });
        const before = bounds(); await dartsCpuStart(f); api.step(5000, 0);
        dartsAssert(!hint.hidden && JSON.stringify(bounds()) === JSON.stringify(before), 'First human hint preserves all HUD and dartboard dimensions');
        dartsAssert(doc.getElementById('throw-guide-title').textContent === (width < 761 ? 'Swipe up to throw' : 'Drag upward and release'), 'Guidance adapts to touch versus mouse input');
        dartsAssert(hint.textContent.includes(width < 761 ? 'below' : 'on the right'), 'Guidance identifies the actual responsive mode panel');
        dartsAssert(hint.getBoundingClientRect().top >= api.boardBottom() - 1, 'English hint does not obscure the board number ring at ' + width + ': ' + JSON.stringify({ top: hint.getBoundingClientRect().top, board: api.boardBottom() }));
        const highlighted = [...doc.querySelectorAll('.throw-area-hint')].map(el => el.id).sort().join(',');
        dartsAssert(highlighted === 'mode-panel,throw-surface', 'Only the actual non-interactive throw regions are highlighted');
        const messageBounds = doc.getElementById('throw-guide-message').getBoundingClientRect();
        dartsAssert(doc.elementFromPoint(messageBounds.left + 2, messageBounds.top + 2).closest('#throw-surface'), 'The visible hint text lets real pointer input through to the existing throw surface');
        dartsAssert(w.getComputedStyle(doc.getElementById('mode-panel')).touchAction === 'none' && w.getComputedStyle(doc.getElementById('gesture-contact')).pointerEvents === 'none', 'Mode-panel swipes prevent page scrolling and gesture feedback cannot intercept input');
        dartsAssert(doc.documentElement.scrollWidth <= width && doc.documentElement.scrollHeight <= height,
            'Guidance creates no horizontal or vertical page overflow');
        w.ArcadeCommon.i18n.setLocale('zh');
        dartsAssert(hint.textContent.includes(width < 761 ? '下方計分區' : '右側計分區') && !/\p{Script=Han} +\p{Script=Han}/u.test(hint.textContent), 'Chinese guidance is concise and uses natural spacing');
        dartsAssert(hint.getBoundingClientRect().top >= api.boardBottom() - 1, 'Chinese hint does not obscure the board number ring at ' + width);
        w.ArcadeCommon.i18n.setLocale('en');
        const surface = doc.getElementById('throw-surface'), rect = surface.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.bottom - 12;
        for (const id of ['history-btn', 'settings-btn', 'pause-btn', 'restart-btn', 'match-meta', 'sound-btn']) {
            dartsGuidePointer(f, doc.getElementById(id), 'pointerdown', x, y);
            dartsAssert(!api.snapshot().gestureActive && doc.getElementById('gesture-contact').hasAttribute('hidden'), 'Interactive control cannot start feedback or throw: ' + id);
        }
        dartsGuidePointer(f, doc.querySelector('.darts-player-name'), 'pointerdown', x, y);
        dartsAssert(!api.snapshot().gestureActive, 'Player cards retain history behavior instead of throwing');
        dartsClick(f, 'history-btn'); api.refresh();
        dartsAssert(doc.getElementById('history-dialog').open && hint.hidden, 'History remains usable and suspends onboarding');
        dartsClick(f, 'history-close-btn'); api.refresh();
        dartsGuidePointer(f, surface, 'pointerdown', x, y);
        dartsAssert(hint.hidden && !doc.getElementById('gesture-contact').hasAttribute('hidden'), 'Contact cue replaces the tutorial during an actual drag');
        dartsGuidePointer(f, w, 'pointercancel', x, y);
        dartsAssert(!api.snapshot().gestureActive && doc.getElementById('gesture-contact').hasAttribute('hidden') && !hint.hidden && !localStorage.getItem(dartsGuideKey), 'Cancel clears feedback without completing or throwing');
        dartsGuidePointer(f, surface, 'pointerdown', x, y);
        dartsGuidePointer(f, w, 'pointerup', x, y);
        dartsAssert(api.snapshot().match.seq === 0 && !localStorage.getItem(dartsGuideKey), 'An invalid tap does not complete the human tutorial');
        api.step(2000, 2); dartsAssert(!hint.hidden, 'Hint remains available after invalid-gesture feedback expires');
        dartsGuidePointer(f, surface, 'pointerdown', x, y);
        dartsClick(f, 'pause-btn');
        dartsAssert(!api.snapshot().gestureActive && doc.getElementById('gesture-contact').hasAttribute('hidden') && hint.hidden, 'Pause immediately cancels contact feedback and onboarding');
        dartsClick(f, 'pause-btn'); api.refresh();
        w.__dartsReducedMotion(true);
        dartsGuidePointer(f, surface, 'pointerdown', x, y);
        dartsGuidePointer(f, w, 'pointermove', x + 2, y - 10);
        dartsAssert(w.getComputedStyle(doc.getElementById('gesture-trail')).display === 'none' && !doc.getElementById('gesture-contact').hasAttribute('hidden'), 'Reduced motion keeps the contact dot without the moving trail');
        dartsGuidePointer(f, w, 'pointercancel', x, y); w.__dartsReducedMotion(false);
        await dartsGuideFlick(f, surface);
        dartsAssert(hint.hidden && localStorage.getItem(dartsGuideKey) === 'true' && doc.getElementById('gesture-contact').hasAttribute('hidden'), 'An accepted human throw completes and persists the tutorial');
        api.land(); api.step(5000, 1);
        await dartsGuideFlick(f, doc.querySelector(mode === 'cricket' ? '.cricket-table tbody td' : '#turn-panel .turn-dart-hit'));
        api.land();
        dartsAssert(api.snapshot().match.seq === 2 && hint.hidden, 'Nested lower-panel content starts a normal second throw without repeating the tutorial');
        dartsClick(f, 'settings-btn'); doc.querySelector('.darts-gesture-help').open = true;
        dartsClick(f, 'throw-guide-review'); api.step(5000, 1);
        dartsAssert(!doc.getElementById('lobby').open && !hint.hidden, 'Existing throwing help can replay the nonblocking region hint');
        const seq = api.snapshot().match.seq;
        const dismiss = doc.getElementById('throw-guide-dismiss');
        dismiss.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'R', bubbles: true, cancelable: true }));
        dartsGuidePointer(f, dismiss, 'pointerdown', 20, 20);
        dartsAssert(!api.snapshot().gestureActive && !doc.getElementById('lobby').open, 'Guide controls cannot trigger a throw or the shell restart shortcut');
        dartsClick(f, 'throw-guide-dismiss');
        dartsAssert(hint.hidden && !doc.querySelector('.throw-area-hint') && api.snapshot().match.seq === seq, 'Manual dismissal removes the hint without creating a throw');
        dartsClick(f, 'restart-btn'); await until(() => doc.getElementById('lobby').open, 'guide restart');
        await dartsCpuStart(f); api.step(5000, 0);
        dartsAssert(hint.hidden, 'A new Match does not repeat completed onboarding');
        // A later Leg also keeps the device preference.
        const leg = structuredClone(api.snapshot().match); leg.leg++; api.replace(leg); api.step(5000, 0); dartsConfirmHandoff(f);
        dartsAssert(hint.hidden, 'A new Leg does not repeat completed onboarding');
        f.remove();
        const persisted = await dartsBoot('guide-persisted-' + width, width, height);
        await dartsStartLocal(persisted); dartsApi(persisted).step(5000, 0);
        dartsAssert(dartsDoc(persisted).getElementById('throw-guide').hidden, 'Tutorial completion survives a fresh page on the device'); persisted.remove();
    }
}
async function checkDartsThrowGuideOwnershipV2() {
    localStorage.removeItem(dartsGuideKey);
    const f = await dartsBoot('touch-guide-cpu'), api = dartsApi(f), doc = dartsDoc(f);
    await dartsChange(f, 'mode-select', 'countup'); await dartsChange(f, 'timer-select', 0);
    await dartsAddCpu(f); await dartsAdd(f, 1); await dartsCpuStart(f, 1);
    const hint = doc.getElementById('throw-guide');
    dartsAssert(hint.hidden, 'A CPU starting the Match does not show human onboarding');
    for (let i = 0; i < 3; i++) {
        dartsCpuDart(f);
        dartsAssert(doc.getElementById('gesture-contact').hasAttribute('hidden') && !localStorage.getItem(dartsGuideKey), 'CPU gestures never create human feedback or complete onboarding');
    }
    api.step(5000, 1);
    dartsAssert(!hint.hidden, 'First eligible human turn after CPU receives onboarding');
    for (let i = 0; i < 3; i++) dartsHumanDart(f);
    api.step(5000, 1);
    dartsAssert(!doc.getElementById('handoff-overlay').hidden && hint.hidden, 'Same-device handoff confirmation precedes throwing guidance');
    dartsClick(f, 'handoff-ready-btn'); api.step(5000, 0);
    dartsAssert(!hint.hidden && !localStorage.getItem(dartsGuideKey), 'Confirming another human does not count as a throw or complete guidance');
    await dartsGuideFlick(f, doc.getElementById('mode-panel')); api.land();
    dartsAssert(localStorage.getItem(dartsGuideKey) === 'true', 'Only an actual accepted human pointer gesture completes onboarding');
    api.step(5000, 1);
    const timed = structuredClone(api.snapshot().match); timed.turnMs = 30000; timed.turnStartedAt = f.contentWindow.__dartsNow;
    api.replace(timed);
    dartsGuidePointer(f, doc.getElementById('mode-panel'), 'pointerdown', 30, 500);
    dartsAssert(!doc.getElementById('gesture-contact').hasAttribute('hidden'), 'A timed human gesture still shows contact feedback');
    api.step(30001, 0); api.expire(); api.refresh();
    dartsAssert(!api.snapshot().gestureActive && doc.getElementById('gesture-contact').hasAttribute('hidden'), 'An accepted timeout cancels stale human contact feedback');
    f.remove();
}
async function checkDartsThrowGuideRemoteV2() {
    localStorage.removeItem(dartsGuideKey);
    const a = await dartsBoot('guide-host'), b = await dartsBoot('guide-guest');
    await dartsChange(a, 'mode-select', 'countup'); await dartsChange(a, 'timer-select', 0);
    const code = await dartsPromote(a); await dartsJoin(b, code); await dartsStartOnline(a, [b]);
    const tools = dartsRoomTools(code, [a, b]); tools.syncClock();
    [a, b].forEach(f => dartsApi(f).step(5000, 0));
    const active = tools.active(), waiting = active === a ? b : a;
    dartsAssert(!dartsDoc(active).getElementById('throw-guide').hidden && dartsDoc(waiting).getElementById('throw-guide').hidden, 'Remote observers do not show the throwing tutorial');
    const panel = dartsDoc(waiting).getElementById('mode-panel');
    dartsGuidePointer(waiting, panel, 'pointerdown', 20, 20);
    dartsAssert(!dartsApi(waiting).snapshot().gestureActive && dartsDoc(waiting).getElementById('gesture-contact').hasAttribute('hidden'), 'Remote ownership blocks contact feedback');
    const controller = dartsApi(active).controller(), submit = controller.submit;
    controller.submit = async () => false;
    try { await dartsGuideFlick(active, dartsDoc(active).getElementById('mode-panel')); await sleep(20); }
    finally { controller.submit = submit; }
    dartsAssert(!localStorage.getItem(dartsGuideKey) && tools.read().game.seq === 0, 'A rejected online human throw does not complete onboarding');
    dartsApi(active).step(2000, 2);
    await dartsGuideFlick(active, dartsDoc(active).getElementById('mode-panel'));
    await until(() => tools.read().game.seq === 1 && localStorage.getItem(dartsGuideKey) === 'true', 'remote human throw accepted before tutorial completion');
    [a, b].forEach(f => dartsApi(f).land());
    dartsAssert(dartsDoc(active).getElementById('throw-guide').hidden && dartsDoc(waiting).getElementById('throw-guide').hidden, 'An accepted online throw completes only its controlling human guide');
    // Simulated devices share this profile; both guide instances captured their
    // first-use state before the first device saved its completion preference.
    for (let i = 0; i < 2; i++) await tools.throwAt(500, 0);
    [a, b].forEach(f => dartsApi(f).step(5000, 1));
    dartsAssert(!dartsDoc(waiting).getElementById('throw-guide').hidden && dartsDoc(active).getElementById('throw-guide').hidden, 'The other device receives its own first human turn guidance');
    a.remove(); b.remove();
}
async function checkDartsThrowGuidePreviewV2() {
    if (!guideOnly || !preview) return;
    localStorage.removeItem(dartsGuideKey);
    const width = preview === 'desktop' ? 1200 : 390, height = preview === 'desktop' ? 800 : 844;
    const f = await dartsBoot((width < 761 ? 'touch-' : '') + 'guide-preview', width, height);
    f.style.cssText = 'position:fixed;inset:0;width:' + width + 'px;height:' + height + 'px;border:0;z-index:20';
    await dartsChange(f, 'mode-select', 'cricket'); await dartsChange(f, 'timer-select', 0); await dartsAdd(f, 3);
    f.contentWindow.ArcadeCommon.i18n.setLocale('zh'); await dartsCpuStart(f); dartsApi(f).step(5000, 0);
    await dartsDoc(f).fonts.ready; await sleep(60);
}
