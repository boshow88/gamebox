/* Shared lobby/auth presentation; the room policy owns membership and accepted throws. */
(function (root) {
    'use strict';
    const AC = root.ArcadeCommon;
    Object.assign(AC.i18n.STRINGS.en, {
        ttNetLoading: 'Connecting to room service…', ttNetUnavailable: 'Room service is unavailable. Offline modes still work.',
        ttNetLogin: 'Sign in to create or join a room.', ttNetGoogle: 'Google sign-in', ttNetGuest: 'Play as guest', ttNetLogout: 'Sign out',
        ttNetCode: 'Room code', ttNetCreate: 'Create room', ttNetJoin: 'Join room', ttNetCopy: 'Copy code', ttNetCopied: 'Room code copied.',
        ttNetLeave: 'Leave room', ttNetClose: 'Back to field', ttNetHost: 'Host', ttNetReady: 'Ready', ttNetPrepare: 'Ready to play', ttNetUnready: 'Cancel ready',
        ttNetAwaitReady: 'Waiting for opponent readiness', ttNetStart: 'Start match', ttNetRematch: 'Choose scene and play again', ttNetWait: 'Waiting for the host…', ttNetInvite: 'Invite one friend. The guest readies up, then the host starts.',
        ttNetLive: 'Match in progress. Both devices share one field.', ttNetOffline: 'Disconnected', ttNetLost: 'The opponent left or disconnected.',
        ttNetTurn: 'Waiting for the opponent to throw…', ttNetSending: 'Sending throw…', ttNetRetry: 'Throw was not accepted. Check your connection and try again.',
        ttNetSceneHelp: 'Host can change scenes in this room. Changing scene clears readiness.', ttNetSceneLocked: 'After the match, choose Play again to select the next scene.',
        ttNetReconnecting: 'Connection interrupted. Reconnecting…', ttNetTurnEnded: 'This turn has ended. Waiting for the next turn.', ttNetBusy: 'The previous action is still finishing. Please wait.',
        ttNetPreparing: 'Preparing the next match…', ttNetLeft: 'The opponent left the room.', ttNetExpired: 'The opponent did not reconnect in time.',
        ttNetRules: 'Two players · five rounds · one throw each · 12 seconds to release', ttNetScene: name => 'Scene: ' + name,
        ttNetRulesDenied: 'Room access was denied. Sign in again or rejoin the room.',
        ttNetFull: 'This room already has two players.', ttNetMissing: 'The room no longer exists. Create or join a room again.', ttNetStarted: 'This match has started. Wait for the host to prepare the next match.',
        ttNetError: 'Room synchronization failed. Please try again.', ttNetLocal: 'Leave the room to change offline settings.',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        ttNetLoading: '正在連線房間服務…', ttNetUnavailable: '房間服務暫時無法使用，仍可玩離線模式。',
        ttNetLogin: '登入後即可開房或加入房間。', ttNetGoogle: 'Google登入', ttNetGuest: '訪客遊玩', ttNetLogout: '登出',
        ttNetCode: '四碼房號', ttNetCreate: '建立房間', ttNetJoin: '加入房間', ttNetCopy: '複製房號', ttNetCopied: '已複製房號。',
        ttNetLeave: '離開房間', ttNetClose: '回到場地', ttNetHost: '房主', ttNetReady: '已準備', ttNetPrepare: '準備對戰', ttNetUnready: '取消準備',
        ttNetAwaitReady: '等待對手準備', ttNetStart: '開始對戰', ttNetRematch: '選圖再戰', ttNetWait: '等待房主…', ttNetInvite: '邀請一位朋友，對手準備後由房主開始。',
        ttNetLive: '對戰進行中，兩台裝置共用同一個場地。', ttNetOffline: '已斷線', ttNetLost: '對手已離開或斷線。',
        ttNetTurn: '等待對手投擲…', ttNetSending: '正在送出投擲…', ttNetRetry: '本次投擲尚未接受，請確認連線後重試。',
        ttNetSceneHelp: '房主可在這個房間選圖，換圖後對手需重新準備。', ttNetSceneLocked: '本場結束後，按「再來一場」即可選圖。',
        ttNetReconnecting: '連線暫時中斷，正在重新連線…', ttNetTurnEnded: '本回合已結束，正在等待下一回合。', ttNetBusy: '上一個動作尚未完成，請稍候。',
        ttNetPreparing: '正在準備下一場…', ttNetLeft: '對手已離開房間。', ttNetExpired: '對手未在期限內恢復連線。',
        ttNetRules: '雙人・五回合・每人一投・十二秒內出手', ttNetScene: name => '場景：' + name,
        ttNetRulesDenied: '目前無法存取房間，請重新登入或重新加入房間。',
        ttNetFull: '房間已有兩位玩家。', ttNetMissing: '房間已不存在，請重新建立或加入房間。', ttNetStarted: '對戰已開始，請等房主準備下一場後再加入。',
        ttNetError: '房間同步暫時失敗，請稍候再試。', ttNetLocal: '請先離開房間再調整離線設定。',
    });
    root.createTrashTossOnline = function (options) {
        const t = AC.i18n.t;
        let net = null, policy = null, lobby = null, user = null, status = '', pending = false, timer = null;
        let reported = null, setupTask = null, lastRender = '', lastGameUpdate = '', restarting = null, connected = null;
        function game() { const g = policy && policy.room && policy.room.data && policy.room.data.game; return g && g.matchId ? g : null; }
        function error(err, { showRoom = true, action = 'room' } = {}) {
            const code = String(err && (err.code || err.message) || err).toLowerCase();
            const denied = code.includes('permission') || code.includes('unauthorized') || code.includes('auth/');
            status = t(denied ? 'ttNetRulesDenied' : code.includes('full') ? 'ttNetFull' : code.includes('not-found') ? 'ttNetMissing' : code.includes('started') ? 'ttNetStarted' : policy && !policy.service.isConnected() ? 'ttNetReconnecting' : 'ttNetError');
            console.warn('[Trash Toss room]', action, code);
            if (lobby) { if (showRoom || denied || code.includes('not-found')) lobby.element.hidden = false; render(); }
            if (options.onError) options.onError(status);
        }
        async function run(action) {
            if (pending) return;
            pending = true; status = ''; render();
            try { return await action(); } catch (err) { error(err); } finally { pending = false; render(); }
        }
        function notify(data) {
            const g = game(), key = g && g.matchId;
            if (restarting && key !== restarting) restarting = null;
            if (!data && reported) {
                reported = null; status = t('ttNetMissing');
                if (lobby) lobby.element.hidden = false;
            }
            if (!g && reported && data) {
                reported = null; status = connected === false ? t('ttNetReconnecting') : '';
                if (lobby) lobby.element.hidden = false;
            }
            // Presence pulses still update the lobby, but do not rewrite game
            // settings/localStorage or force a canvas/HUD refresh for the same turn.
            const version = JSON.stringify([policy && policy.room && policy.room.code,
                g ? [g.matchId, g.seq, g.status] : data && [data.options && data.options.scene, data.revision || 0]]);
            if (version !== lastGameUpdate) {
                lastGameUpdate = version;
                if (options.onChange) options.onChange(data);
            }
            if (g && g.status !== 'over' && key !== reported) { reported = key; if (lobby) lobby.element.hidden = true; }
            if (g && g.status === 'over' && g.endReason) status = t(g.endReason === 'disconnected' ? 'ttNetExpired' : g.endReason === 'left' ? 'ttNetLeft' : 'ttNetLost');
            render();
        }
        function render() {
            if (!lobby || lobby.element.hidden) return;
            const data = policy.room && policy.room.data, g = game();
            const signature = JSON.stringify([AC.i18n.locale, user, status, pending, restarting, connected, data && [data.options, data.ready, data.players, policy.service.host(data), policy.service.playerIds(data).map(id => policy.presence.isAvailable(id)), g && [g.matchId, g.status]]]);
            if (signature === lastRender) return;
            lastRender = signature;
            const model = { title: t('ttRoom'), closeLabel: t('ttNetClose'), status,
                auth: { text: user ? user.name || t('ttNetGuest') : t('ttNetLogin'), actions: user ? [
                    { id: 'sign-out', label: t('ttNetLogout'), disabled: pending, onClick: () => run(async () => { await policy.leave(); notify(null); return net.signOut(); }) },
                ] : [
                    { id: 'sign-in-google', label: t('ttNetGoogle'), primary: true, disabled: pending, onClick: () => run(() => net.signInGoogle()) },
                    { id: 'sign-in-guest', label: t('ttNetGuest'), disabled: pending, onClick: () => run(() => net.signInGuest()) },
                ] } };
            if (user && !data) model.entry = { codeLabel: t('ttNetCode'), codeLength: 4,
                create: { label: t('ttNetCreate'), primary: true, disabled: pending, onClick: () => run(() => policy.create(options.settings())) },
                join: { label: t('ttNetJoin'), disabled: pending, onClick: code => run(() => policy.join(code)) } };
            if (user && data) {
                const uid = policy.service.currentPlayer().uid, host = policy.service.host(data), action = policy.service.primaryAction(data);
                const primary = action && ({
                    start: { label: t(action.disabled ? 'ttNetAwaitReady' : 'ttNetStart'), primary: true, disabled: pending || action.disabled, onClick: () => run(() => policy.start()) },
                    rematch: restarting ? { text: t('ttNetPreparing') } : { label: t('ttNetRematch'), primary: true, disabled: pending, onClick: () => playAgain() },
                    'wait-rematch': { text: t('ttNetWait') },
                    ready: { label: t('ttNetPrepare'), primary: true, disabled: pending, onClick: () => run(() => policy.ready(true)) },
                    'wait-ready': { label: t('ttNetUnready'), disabled: pending, onClick: () => run(() => policy.ready(false)) },
                }[action.kind]);
                model.room = { code: policy.room.code,
                    players: policy.service.playerIds(data).map((id, index) => ({ uid: id, name: (data.players[id].name || 'P' + (index + 1)) + (id === uid ? ' · ' + t('ttYou') : ''),
                        muted: !policy.presence.isAvailable(id), badges: [
                            ...(id === host ? [{ label: t('ttNetHost'), tone: 'host' }] : []),
                            ...((data.ready || {})[id] ? [{ label: t('ttNetReady'), tone: 'ready' }] : []),
                            ...(!policy.presence.isAvailable(id) ? [{ label: t('ttNetOffline') }] : []),
                        ] })), primary,
                    notes: [t('ttNetScene', t('tt' + data.options.scene[0].toUpperCase() + data.options.scene.slice(1))), t('ttNetRules'), t(g && g.status !== 'over' ? 'ttNetLive' : 'ttNetInvite')],
                    copy: { label: t('ttNetCopy'), onClick: () => run(async () => { await navigator.clipboard.writeText(policy.room.code); status = t('ttNetCopied'); }) },
                    leave: { label: t('ttNetLeave'), disabled: pending, onClick: () => run(async () => { await policy.leave(); reported = null; notify(null); }) } };
            }
            lobby.render(model);
            const main = lobby.refs.room.querySelector('[data-lobby-row="main"]');
            const primary = main && main.querySelector('[data-lobby-action="primary"], .lobby-waiting');
            if (primary) main.prepend(primary);
            if (user && data) {
                const field = document.createElement('label'); field.className = 'tt-room-scene';
                const label = document.createElement('span'); label.textContent = t('ttScene');
                const select = document.createElement('select'); select.id = 'tt-room-scene';
                for (const scene of Object.keys(root.TrashTossRules.SCENES)) {
                    const option = document.createElement('option'); option.value = scene;
                    option.textContent = t('tt' + scene[0].toUpperCase() + scene.slice(1)); select.append(option);
                }
                select.value = data.options.scene;
                select.disabled = pending || !!g || policy.service.host(data) !== policy.service.currentPlayer().uid;
                select.addEventListener('change', () => run(() => policy.configure(select.value)));
                field.append(label, select);
                const note = document.createElement('small'); note.textContent = t(g ? 'ttNetSceneLocked' : 'ttNetSceneHelp'); field.append(note);
                lobby.refs.room.insertBefore(field, lobby.refs.room.querySelector('[data-lobby-row="main"]'));
            }
        }
        function setup() {
            if (policy) return Promise.resolve(true);
            if (!setupTask) setupTask = initialize().finally(() => { setupTask = null; });
            return setupTask;
        }
        async function initialize() {
            net = root.ArcadeNet;
            if (!net || !net.ok) return false;
            await net.rooms.ready();
            policy = root.TrashTossRoom.create({ net, onChange: notify, onError: err => error(err, { showRoom: false, action: 'watch' }) });
            lobby = net.rooms.lobby({ onClose() { lobby.element.hidden = true; options.onClose(); }, onError: error });
            lobby.element.classList.add('tt-room-lobby');
            net.onAuth(value => {
                if (user && (!value || value.uid !== user.uid)) { policy.detach(); reported = null; notify(null); }
                user = value; render();
            });
            connected = policy.service.isConnected();
            timer = root.setInterval(() => {
                const next = policy.service.isConnected();
                if (next !== connected) {
                    connected = next; status = next ? '' : t('ttNetReconnecting');
                    if (options.onConnection) options.onConnection(next, status);
                    render();
                }
                policy.poll().catch(err => error(err, { showRoom: false, action: 'sync' }));
            }, 250);
            return true;
        }
        async function open() {
            options.onOpen();
            options.message(t('ttNetLoading'));
            try {
                if (!await setup()) { options.message(t('ttNetUnavailable')); return; }
                status = ''; lastRender = ''; lobby.element.hidden = false; render();
            } catch (err) { options.message(t('ttNetUnavailable')); error(err); }
        }
        function playAgain() {
            if (pending) { options.message(t('ttNetBusy')); return Promise.resolve(false); }
            options.onOpen();
            return run(async () => {
                if (!await setup()) { options.message(t('ttNetUnavailable')); return; }
                lobby.element.hidden = false;
                const g = game(), data = policy.room && policy.room.data;
                if (g && g.status === 'over' && policy.service.host(data) === policy.service.currentPlayer().uid) {
                    restarting = g.matchId; render();
                    let accepted;
                    try { accepted = await policy.rematch(); }
                    catch (err) { restarting = null; throw err; }
                    if (!accepted) { restarting = null; options.message(t('ttNetRetry')); return; }
                    reported = null; notify(policy.room && policy.room.data);
                }
                status = ''; lastRender = ''; render();
            });
        }
        const api = { open, playAgain, game, render, isOpen: () => !!(lobby && !lobby.element.hidden), now: () => policy ? policy.now() : Date.now(),
            inRoom: () => !!(policy && policy.room), canControl: () => !!(!pending && policy && policy.canControl()),
            seat: () => game() ? game().seats.indexOf((policy.service.currentPlayer() || {}).uid) : -1,
            async submit(angle, power) {
                if (pending || !policy) { options.message(t('ttNetBusy')); return false; }
                pending = true;
                try {
                    const accepted = await policy.submit(angle, power);
                    if (!accepted) options.message(t(!policy.service.isConnected() ? 'ttNetReconnecting' : !policy.canControl() ? 'ttNetTurnEnded' : 'ttNetRetry'));
                    return accepted;
                } catch (err) { error(err, { showRoom: false, action: 'throw' }); return false; } finally { pending = false; }
            },
        };
        AC.i18n.subscribe(render);
        root.addEventListener('pagehide', event => { if (event.persisted) return; if (timer) root.clearInterval(timer); if (policy) policy.destroy(); });
        return api;
    };
})(window);
