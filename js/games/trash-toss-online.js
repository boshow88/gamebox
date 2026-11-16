/* Shared lobby/auth presentation; the room policy owns membership and accepted throws. */
(function (root) {
    'use strict';
    const AC = root.ArcadeCommon;
    Object.assign(AC.i18n.STRINGS.en, {
        ttNetLoading: 'Connecting to room service…', ttNetUnavailable: 'Room service is unavailable. Offline modes still work.',
        ttNetLogin: 'Sign in to create or join a room.', ttNetGoogle: 'Google sign-in', ttNetGuest: 'Play as guest', ttNetLogout: 'Sign out',
        ttNetCode: 'Room code', ttNetCreate: 'Create room', ttNetJoin: 'Join room', ttNetCopy: 'Copy code', ttNetCopied: 'Room code copied.',
        ttNetLeave: 'Leave room', ttNetClose: 'Back to field', ttNetHost: 'Host', ttNetReady: 'Ready', ttNetPrepare: 'Ready up', ttNetUnready: 'Cancel ready',
        ttNetStart: 'Start match', ttNetRematch: 'Return to lobby', ttNetWait: 'Waiting for the host…', ttNetInvite: 'Invite one friend. The guest readies up, then the host starts.',
        ttNetLive: 'Match in progress. Both devices share one field.', ttNetOffline: 'Disconnected', ttNetLost: 'The opponent left or disconnected.',
        ttNetTurn: 'Waiting for the opponent to throw…', ttNetSending: 'Sending throw…', ttNetRetry: 'Throw was not accepted. Check your connection and try again.',
        ttNetRules: 'Two players · five rounds · one throw each · 12 seconds to release', ttNetScene: name => 'Scene: ' + name,
        ttNetRulesDenied: 'Room permission denied. Publish the updated Realtime Database rules (trash_toss_rooms) before using online play.',
        ttNetFull: 'This room already has two players.', ttNetMissing: 'Room not found. Check the four-character code.', ttNetStarted: 'This match has started. Wait for the host to return to the lobby.',
        ttNetError: 'Connection failed. Please try again.', ttNetLocal: 'Leave the room to change offline settings.',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        ttNetLoading: '正在連線房間服務…', ttNetUnavailable: '房間服務暫時無法使用，仍可玩離線模式。',
        ttNetLogin: '登入後即可開房或加入房間。', ttNetGoogle: 'Google登入', ttNetGuest: '訪客遊玩', ttNetLogout: '登出',
        ttNetCode: '四碼房號', ttNetCreate: '建立房間', ttNetJoin: '加入房間', ttNetCopy: '複製房號', ttNetCopied: '已複製房號。',
        ttNetLeave: '離開房間', ttNetClose: '回到場地', ttNetHost: '房主', ttNetReady: '已準備', ttNetPrepare: '準備', ttNetUnready: '取消準備',
        ttNetStart: '開始對戰', ttNetRematch: '返回大廳', ttNetWait: '等待房主…', ttNetInvite: '邀請一位朋友，對手準備後由房主開始。',
        ttNetLive: '對戰進行中，兩台裝置共用同一個場地。', ttNetOffline: '已斷線', ttNetLost: '對手已離開或斷線。',
        ttNetTurn: '等待對手投擲…', ttNetSending: '正在送出投擲…', ttNetRetry: '本次投擲尚未接受，請確認連線後重試。',
        ttNetRules: '雙人・五回合・每人一投・十二秒內出手', ttNetScene: name => '場景：' + name,
        ttNetRulesDenied: '房間權限尚未開放，需先發布更新的Realtime Database規則（trash_toss_rooms）才能連線。',
        ttNetFull: '房間已有兩位玩家。', ttNetMissing: '找不到房間，請確認四碼房號。', ttNetStarted: '對戰已開始，請等房主返回大廳後再加入。',
        ttNetError: '連線失敗，請稍後重試。', ttNetLocal: '請先離開房間再調整離線設定。',
    });
    root.createTrashTossOnline = function (options) {
        const t = AC.i18n.t;
        let net = null, policy = null, lobby = null, user = null, status = '', pending = false, timer = null;
        let reported = null, setupTask = null;
        function game() { const g = policy && policy.room && policy.room.data && policy.room.data.game; return g && g.matchId ? g : null; }
        function error(err) {
            const code = String(err && (err.code || err.message) || err).toLowerCase();
            status = t(code.includes('permission') ? 'ttNetRulesDenied' : code.includes('full') ? 'ttNetFull' : code.includes('not-found') ? 'ttNetMissing' : code.includes('started') ? 'ttNetStarted' : 'ttNetError');
            if (lobby) { lobby.element.hidden = false; render(); }
            if (options.onError) options.onError(status);
        }
        async function run(action) {
            if (pending) return;
            pending = true; status = ''; render();
            try { return await action(); } catch (err) { error(err); } finally { pending = false; render(); }
        }
        function notify(data) {
            if (options.onChange) options.onChange(data);
            const g = game(), key = g && g.matchId;
            if (g && g.status !== 'over' && key !== reported) { reported = key; if (lobby) lobby.element.hidden = true; }
            if (g && g.status === 'over' && g.endReason) status = t('ttNetLost');
            render();
        }
        function render() {
            if (!lobby) return;
            const data = policy.room && policy.room.data, g = game();
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
                    start: { label: t('ttNetStart'), primary: true, disabled: pending || action.disabled, onClick: () => run(() => policy.start()) },
                    rematch: { label: t('ttNetRematch'), primary: true, disabled: pending, onClick: () => run(async () => { await policy.rematch(); reported = null; notify(policy.room && policy.room.data); }) },
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
            policy = root.TrashTossRoom.create({ net, onChange: notify, onError: error });
            lobby = net.rooms.lobby({ onClose() { lobby.element.hidden = true; options.onClose(); }, onError: error });
            net.onAuth(value => {
                if (user && (!value || value.uid !== user.uid)) { policy.detach(); reported = null; notify(null); }
                user = value; render();
            });
            timer = root.setInterval(() => policy.poll().catch(error), 250);
            return true;
        }
        async function open() {
            options.onOpen();
            options.message(t('ttNetLoading'));
            try {
                if (!await setup()) { options.message(t('ttNetUnavailable')); return; }
                status = ''; lobby.element.hidden = false; render();
            } catch (err) { options.message(t('ttNetUnavailable')); error(err); }
        }
        const api = { open, game, render, isOpen: () => !!(lobby && !lobby.element.hidden), now: () => policy ? policy.now() : Date.now(),
            inRoom: () => !!(policy && policy.room), canControl: () => !!(policy && policy.canControl()),
            seat: () => game() ? game().seats.indexOf((policy.service.currentPlayer() || {}).uid) : -1,
            async submit(angle, power) {
                if (pending || !policy) return false;
                pending = true;
                try { const accepted = await policy.submit(angle, power); if (!accepted) options.message(t('ttNetRetry')); return accepted; }
                catch (err) { error(err); return false; } finally { pending = false; }
            },
        };
        AC.i18n.subscribe(render);
        root.addEventListener('pagehide', event => { if (event.persisted) return; if (timer) root.clearInterval(timer); if (policy) policy.destroy(); });
        return api;
    };
})(window);
