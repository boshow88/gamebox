/* Real Darts DOM checks, injected by rooms-browser-check.js. No production hooks. */
const dartsApi = f => f.contentWindow.__dartsTest;
const dartsDoc = f => f.contentDocument;
const dartsData = f => dartsApi(f).snapshot().data;
function dartsAssert(value, message) { if (!value) throw new Error(message); }
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
    const input = dartsDoc(f).getElementById(id);
    dartsAssert(input, 'Darts setting: ' + id);
    await until(() => !input.disabled, 'editable Darts setting ' + id);
    input.value = String(value);
    input.dispatchEvent(new f.contentWindow.Event('change', { bubbles: true }));
    const fields = { 'mode-select': 'mode', 'match-select': 'legsToWin', 'timer-select': 'turnMs', 'rounds-select': 'roundLimit',
        'out-select': 'outRule', 'in-select': 'inRule', 'bull-select': 'bullMode', 'cricket-select': 'cricketVariant' };
    await until(() => String(dartsData(f).options[fields[id]]) === String(value) && !input.disabled, 'accepted Darts setting ' + id);
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
    async function throwAt(x, y) {
        syncClock(); const old = read().game.seq;
        dartsAssert(await dartsApi(active()).controller().submit(dartsFlight(x, y)), 'Controlling device throw rejected');
        await until(() => frames.every(f => dartsApi(f).snapshot().match && dartsApi(f).snapshot().match.seq > old), 'accepted Darts throw sync');
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
    dartsAssert(note().includes('5 回合') && !note().includes('八回合'), 'Contextual explanation updates with locale');
    dartsAssert([...doc.querySelectorAll('#lobby-slots .slot-name')].every(input => !['你', 'You'].includes(input.value)), 'Switching locale does not turn player names into You');
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
    await dartsFlick(a, doc.getElementById('mode-panel')); api.gesture(); api.land();
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
    for (let i = 0; i < 15; i++) { api.gesture(); api.land(); }
    dartsAssert(api.snapshot().match.status === 'over' && api.snapshot().match.stats[slot].darts === 15 && dartsData(a).phase === 'results',
        'Reserved local solo Count-Up finishes without waiting for shared room scoring');
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
    const code = await dartsPromote(f); await dartsStartOnline(f, []);
    await dartsFlick(f, doc.getElementById('mode-panel'));
    const matchId = api.snapshot().match.matchId, seq = api.snapshot().match.seq;
    await api.controller().service.remove(code);
    await until(() => !api.snapshot().room, 'lost reservation falls back to local play');
    dartsAssert(api.snapshot().match && api.snapshot().match.matchId === matchId && api.snapshot().match.seq === seq && !doc.getElementById('lobby').open,
        'Losing a room reservation preserves local match and history without interrupting play');
    await dartsFlick(f, doc.getElementById('mode-panel'));
    dartsAssert(api.snapshot().match.seq === seq + 1 && dartsData(f).phase === 'playing', 'Local throwing continues after reservation disappears');
    f.remove();
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
    await dartsStartLocal(f); dartsApi(f).gesture(); dartsApi(f).land();
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
    for (let i = 0; i < 15; i++) { api.gesture(); api.land(); }
    dartsAssert(api.snapshot().match.status === 'over' && api.snapshot().match.stats[slot].darts === 15, 'Configurable solo Count-Up completes');
    dartsAssert(!doc.getElementById('leg-result').hidden && !doc.getElementById('lobby').open, 'Results remain visible before returning');
    dartsClick(f, 'result-room-btn');
    await until(() => dartsData(f).phase === 'lobby' && doc.getElementById('lobby').open, 'result returns to same local lobby');
    await dartsAdd(f, 3);
    await dartsChange(f, 'rounds-select', 15);
    await dartsStartLocal(f);
    for (let i = 0; i < 72; i++) { api.gesture(); api.land(); }
    dartsAssert(api.snapshot().match.history.length === 24, 'Match history updates one entry per three-dart turn');
    doc.querySelector('.darts-player').click();
    dartsAssert(doc.querySelectorAll('.history-turn').length === 6, 'Four-player personal history filter');
    const filter = doc.getElementById('history-player'); filter.value = 'all'; filter.dispatchEvent(new w.Event('change'));
    dartsAssert(doc.querySelectorAll('.history-turn').length === 24, 'All-player history filter');
    const list = doc.getElementById('history-list');
    dartsAssert(list.scrollHeight > list.clientHeight, 'History body scrolls');
    list.scrollTop = 200;
    const anchor = [...list.children].find(el => el.getBoundingClientRect().bottom > list.getBoundingClientRect().top), key = anchor.dataset.historyKey, offset = anchor.getBoundingClientRect().top;
    api.gesture(); api.land();
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
    dartsClick(b, 'lobby-start-btn'); await until(() => tools.read().ready[bUid], 'one device readies both its players');
    await dartsChange(a, 'out-select', 'open');
    await until(() => Object.values(tools.read().ready).every(ready => !ready), 'Rule edit clears Ready');
    await until(() => dartsDoc(b).getElementById('out-select').value === 'open', 'Rule edit reaches guest');
    dartsAssert(dartsDoc(b).getElementById('out-select').disabled && dartsDoc(a).getElementById('lobby-start-btn').disabled, 'Guest cannot configure; host waits after edit');
    await dartsStartOnline(a, [b]);
    const firstMatch = tools.read().game.matchId;
    dartsAssert(tools.read().game.legsToWin === 2 && tools.read().game.outRule === 'open', 'Active rules captured');
    const other = tools.active() === a ? b : a;
    dartsAssert(!await dartsApi(other).controller().submit(dartsFlight(0, 103)), 'Another device cannot impersonate active slot');
    dartsAssert(!await dartsApi(a).controller().configure({ outRule: 'double' }), 'Room cannot mutate active rules');
    const turns = [];
    for (let turn = 0; turn < 4; turn++) {
        turns.push(tools.read().game.active);
        for (let dart = 0; dart < 3; dart++) await tools.throwAt(0, 80);
    }
    dartsAssert(new Set(turns).size === 4 && tools.read().game.history.length === 4, 'Both devices can control each of their two seats');
    for (const f of [a, b]) {
        dartsClick(f, 'history-btn');
        dartsAssert(dartsDoc(f).querySelectorAll('.history-turn').length === 4 && !dartsDoc(f).getElementById('history-clock-note').hidden, 'Mixed room shares accepted history and running timer');
        dartsClick(f, 'history-close-btn');
    }
    const legWinner = tools.read().game.active;
    tools.mutate(data => { data.game.scores[legWinner] = 40; data.game.turnStartScore = 40; });
    await until(() => [a, b].every(f => dartsApi(f).snapshot().match.scores[legWinner] === 40), 'between-leg checkout fixture');
    await tools.throwAt(0, 165);
    dartsAssert(tools.read().game.status === 'between' && tools.read().game.wins[legWinner] === 1, 'First leg leaves first-to-two match active');
    dartsClick(a, 'settings-btn');
    dartsAssert(dartsDoc(a).getElementById('back-lobby-btn').hidden && dartsDoc(a).getElementById('mode-select').disabled && dartsDoc(a).getElementById('out-select').disabled,
        'Between Legs cannot return to Lobby or edit match rules');
    dartsAssert(!await dartsApi(a).controller().backToLobby(), 'Room policy rejects leaving an unfinished competitive match for Lobby');
    dartsDoc(a).getElementById('back-lobby-btn').click(); await sleep(20);
    dartsAssert(tools.read().phase === 'playing' && tools.read().game.status === 'between', 'Hidden Return action cannot bypass between-Leg lock');
    dartsClick(a, 'lobby-close-btn'); tools.syncClock();
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
    await until(() => dartsDoc(b).getElementById('lobby').open && dartsDoc(b).getElementById('mode-select').value === 'cricket', 'guest sees next game in existing room');
    await dartsStartOnline(a, [b]);
    dartsAssert(tools.read().game.matchId !== firstMatch && tools.read().game.cricketVariant === 'cutthroat' && tools.read().game.history.length === 0, 'Same code starts different game with fresh history');
    const thrower = tools.read().game.active;
    tools.mutate(data => { data.game.marks[thrower][20] = 3; });
    await until(() => [a, b].every(f => dartsApi(f).snapshot().match.marks[thrower][20] === 3), 'Cut-Throat fixture');
    await tools.throwAt(0, 103);
    dartsAssert(tools.read().game.scores[thrower] === 0 && tools.read().game.players.filter(id => id !== thrower).every(id => tools.read().game.scores[id] === 60), 'Cut-Throat penalties reach all applicable opponents');
    for (const f of [a, b]) {
        const doc = dartsDoc(f);
        dartsAssert(doc.getElementById('match-meta').textContent.includes('Cut-Throat') && doc.getElementById('dart-feedback').textContent.includes('+60'), 'Cut-Throat HUD explains recipient penalties');
        dartsAssert(doc.querySelectorAll('.cricket-table thead th').length === 5 && doc.querySelectorAll('.cricket-table tbody tr').length === 7, 'Four-player Cricket marks matrix');
        dartsAssert(doc.getElementById('turn-timer').hidden, 'Timer off hidden online');
        dartsClick(f, 'history-btn');
        dartsAssert(dartsDoc(f).querySelector('.history-turn-summary').textContent.includes('+60'), 'Penalty history matches actual recipients');
        dartsClick(f, 'history-close-btn');
    }
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
    for (let i = 0; i < 3; i++) { dartsApi(f).gesture(); dartsApi(f).land(); }
    await dartsFlick(f, dartsDoc(f).getElementById('mode-panel'));
    dartsAssert(dartsApi(f).snapshot().darts === 4, 'Restored local device can throw for the next owned seat');
    dartsClick(f, 'restart-btn');
    await until(() => dartsData(f).phase === 'lobby' && dartsDoc(f).getElementById('lobby').open, 'Local restart returns to configuration');
    await dartsChange(f, 'mode-select', '501'); await dartsChange(f, 'out-select', 'open'); await dartsChange(f, 'match-select', 2); await dartsChange(f, 'timer-select', 0);
    await dartsStartLocal(f);
    dartsApi(f).gesture(); dartsApi(f).land();
    const fixture = dartsApi(f).snapshot().match, points = fixture.lastDart.result.score;
    dartsAssert(points > 0, 'Deterministic local checkout fixture has a scoring dart');
    fixture.scores[fixture.active] = points; fixture.turnStartScore = points;
    dartsApi(f).gesture(); dartsApi(f).land();
    dartsAssert(dartsApi(f).snapshot().match.status === 'between', 'Local checkout reaches between-Leg state');
    dartsClick(f, 'settings-btn');
    dartsAssert(dartsDoc(f).getElementById('back-lobby-btn').hidden && dartsDoc(f).getElementById('out-select').disabled, 'Local between-Leg rules remain locked');
    dartsDoc(f).getElementById('back-lobby-btn').click(); await sleep(20);
    dartsAssert(dartsData(f).phase === 'playing' && dartsApi(f).snapshot().match.status === 'between', 'Local Return handler rejects unfinished competitive match');
    dartsClick(f, 'lobby-close-btn'); dartsClick(f, 'next-leg-btn');
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
    if (preview && !lobbyPreview) {
        const width = preview === 'mobile' ? 390 : 1200, height = preview === 'mobile' ? 844 : 800;
        const f = await dartsBoot('preview-player', width, height);
        f.style.cssText = 'position:fixed;inset:0;width:' + width + 'px;height:' + height + 'px;border:0;z-index:10';
        await dartsAdd(f, 3); await dartsChange(f, 'mode-select', 'cricket'); await dartsChange(f, 'timer-select', 0);
        await dartsStartLocal(f); dartsApi(f).previewCricket(); await sleep(60);
    }
}
async function checkDartsLobbyV2() {
    for (const [width, height] of [[320, 568], [390, 844]]) {
        const f = await dartsBoot('lobby-layout-' + width, width, height), doc = dartsDoc(f), w = f.contentWindow;
        await dartsAdd(f, 3); await dartsChange(f, 'mode-select', '501');
        doc.getElementById('advanced-rules').open = true; await sleep(20);
        const dialog = doc.getElementById('lobby'), bounds = dialog.getBoundingClientRect();
        dartsAssert(bounds.left >= 0 && bounds.right <= w.innerWidth && bounds.top >= 0 && bounds.bottom <= w.innerHeight, 'Lobby fits viewport at ' + width);
        dartsAssert(dialog.scrollWidth <= dialog.clientWidth + 1, 'Lobby has no horizontal scroll at ' + width);
        const visibleControls = [...dialog.querySelectorAll('input,select,button')].filter(el => el.getClientRects().length && !el.hidden);
        for (const control of visibleControls) {
            const b = control.getBoundingClientRect();
            dartsAssert(b.left >= bounds.left && b.right <= bounds.right, 'Lobby control exceeds width at ' + width + ': ' + control.id);
        }
        const start = doc.getElementById('lobby-start-btn'); start.scrollIntoView({ block: 'nearest' }); await sleep(20);
        const buttonBounds = start.getBoundingClientRect();
        dartsAssert(!start.disabled && buttonBounds.top >= bounds.top && buttonBounds.bottom <= bounds.bottom,
            'Four-slot advanced 501 Start remains reachable by scrolling at ' + width);
        dialog.scrollTop = 0;
        f.remove();
    }
    if (lobbyPreview) {
        const width = preview === 'desktop' ? 1200 : 390, height = preview === 'desktop' ? 800 : 844;
        const f = await dartsBoot('lobby-preview', width, height), doc = dartsDoc(f);
        f.style.cssText = 'position:fixed;inset:0;width:' + width + 'px;height:' + height + 'px;border:0;z-index:10';
        await dartsAdd(f, 3); await dartsChange(f, 'mode-select', '501');
        doc.getElementById('advanced-rules').open = true; doc.getElementById('lobby').scrollTop = 0;
        await sleep(60);
    }
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
