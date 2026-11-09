/* Private account inbox, admin replies and bounded unread notifications. */
(function () {
    'use strict';
    var COPY = {
        zh: {
            mine: '我的意見', admin: '意見箱（管理）', loading: '正在讀取…', empty: '目前沒有意見紀錄。',
            all: '全部紀錄', unread: '未讀回覆', noUnread: '目前沒有未讀回覆。', more: '載入更多', refresh: '重新整理',
            pending: '待處理', resolved: '已處理', reply: '管理員回覆', noReply: '尚未回覆', read: '查看回覆',
            replyPlaceholder: '輸入給玩家的回覆…', sendReply: '送出回覆', updateReply: '更新回覆', latest: '此處保留最新一則管理員回覆。',
            replySaved: '回覆已送出。', error: '操作失敗，請稍後再試。', changed: '回覆已更新，請重新整理後再操作。',
            del: '刪除', confirm: '確認刪除', guest: '訪客', anonReply: '訪客意見不會收到帳號通知。',
            noticeError: '回覆通知暫時無法讀取，可開啟「我的意見」重新整理。',
            submissions: '新投稿', noSubmissions: '目前沒有新投稿。', newSubmission: '尚未查看的投稿',
            adminNoticeError: '新投稿通知暫時無法讀取，請重新整理。',
            adminNotice: function (count) { return '有' + count + '則新投稿'; },
            notice: function (count) { return '你有 ' + count + ' 則未讀回覆'; },
        },
        en: {
            mine: 'My feedback', admin: 'Feedback inbox', loading: 'Loading…', empty: 'No feedback yet.',
            all: 'All feedback', unread: 'Unread replies', noUnread: 'No unread replies.', more: 'Load more', refresh: 'Refresh',
            pending: 'Pending', resolved: 'Handled', reply: 'Admin reply', noReply: 'No reply yet', read: 'View reply',
            replyPlaceholder: 'Write a reply to the player…', sendReply: 'Send reply', updateReply: 'Update reply', latest: 'Only the latest admin reply is retained here.',
            replySaved: 'Reply sent.', error: 'Could not complete the request. Please try again.', changed: 'The reply has changed. Refresh before continuing.',
            del: 'Delete', confirm: 'Confirm deletion', guest: 'Guest', anonReply: 'Guest submissions do not receive account notifications.',
            noticeError: 'Reply notifications are unavailable. Open My feedback to refresh.',
            submissions: 'New submissions', noSubmissions: 'No new submissions.', newSubmission: 'Unseen submission',
            adminNoticeError: 'New submission notifications are unavailable. Please refresh.',
            adminNotice: function (count) { return count + ' new ' + (count === '1' ? 'submission' : 'submissions'); },
            notice: function (count) { return 'You have ' + count + ' unread ' + (count === '1' ? 'reply' : 'replies'); },
        },
    };
    function node(tag, className, text) {
        var el = document.createElement(tag); if (className) el.className = className;
        if (text != null) el.textContent = text; return el;
    }
    function button(label, handler, className) {
        var el = node('button', className || 'feedback-action', label); el.type = 'button';
        el.addEventListener('click', handler); return el;
    }
    function date(at) { try { return at && at.toDate ? at.toDate().toLocaleString() : ''; } catch (_) { return ''; } }
    function create(options) {
        var user = null, epoch = 0, watchEpoch = 0, stop = null, notices = [], noticeError = false, modal = null;
        var mine = document.getElementById('drawer-feedback-mine'), notice = document.getElementById('feedback-notification');
        var hub = options.notifications, source = null;
        var isAdmin = false, adminSource = null, adminStop = null, adminWatchEpoch = 0, adminNotices = [], adminError = false;
        var adminEntry = document.getElementById('drawer-feedback-admin');
        var errorNode = document.getElementById('feedback-notification-error');
        function copy() { return COPY[options.getLocale() === 'zh' ? 'zh' : 'en']; }
        function service() { return window.ArcadeNet && window.ArcadeNet.feedbackBox; }
        function signed() { return user && !user.anon; }
        var indicator = window.GameBoxNotifications.indicator;
        hub.bind(mine, 'feedback', function (state) { return copy().mine + (state.unread ? ' · ' + copy().notice(state.atLeast ? String(state.count) + '+' : String(state.count)) : ''); });
        hub.bind(adminEntry, 'feedback-admin', function (state) { return copy().admin + (state.unread ? ' · ' + copy().adminNotice(state.atLeast ? String(state.count) + '+' : String(state.count)) : ''); });
        function paintAdminNotice() {
            if (adminSource) adminSource.publish(adminNotices.length, { atLeast: adminNotices.length === 20 });
            hub.refresh();
            if (modal && modal.paintAdmin) modal.paintAdmin();
        }
        function watchAdmin() {
            var subscription = ++adminWatchEpoch, version = epoch;
            if (adminStop) adminStop(); adminStop = null;
            if (!signed() || !isAdmin || document.hidden || !service()) return;
            try {
                adminStop = service().watchAdminUnread(function (items) {
                    if (version !== epoch || subscription !== adminWatchEpoch || !isAdmin) return;
                    adminNotices = items; adminError = false; paintAdminNotice();
                }, function () {
                    if (version !== epoch || subscription !== adminWatchEpoch || !isAdmin) return;
                    adminError = true; paintAdminNotice();
                });
            } catch (_) { adminError = true; paintAdminNotice(); }
        }
        function paintNotice() {
            var c = copy();
            var count = notices.length === 20 ? '20+' : String(notices.length);
            if (source) source.publish(signed() ? notices.length : 0, { atLeast: notices.length === 20 });
            if (mine) { mine.hidden = !signed(); mine.textContent = c.mine; }
            hub.refresh();
            if (notice) {
                notice.hidden = !signed() || !notices.length;
                notice.textContent = c.notice(count);
            }
            if (errorNode) { errorNode.hidden = !signed() || !noticeError; errorNode.textContent = c.noticeError; }
        }
        function watch() {
            var subscription = ++watchEpoch;
            if (stop) stop(); stop = null;
            if (!signed() || document.hidden || !service()) return;
            var version = epoch;
            try {
                stop = service().watchUnread(function (items) {
                    if (version !== epoch || subscription !== watchEpoch || !signed()) return;
                    notices = items; noticeError = false; paintNotice();
                }, function () { if (version === epoch && subscription === watchEpoch) { noticeError = true; paintNotice(); } });
            } catch (_) { noticeError = true; paintNotice(); }
        }
        function close() { if (modal) modal.close(); modal = null; }
        function show(admin, unreadOnly) {
            close();
            if (!signed() || !service() || admin && !isAdmin) return;
            var c = copy(), version = epoch, uid = user.uid, box = service();
            var m = options.openModal(admin ? c.admin : c.mine); modal = m;
            m.body.classList.add('feedback-inbox');
            var toolbar = node('div', 'feedback-toolbar'), list = node('div', 'feedback-list');
            var status = node('p', 'feedback-status'); status.setAttribute('role', 'status');
            var moreButton = button(c.more, function () { load(true); });
            var cursor = null, more = false, loading = false, refreshSerial = 0, items = [];
            var onlyUnread = !!unreadOnly;
            var observed = new Map(), seenByListener = new Set(), observer = null;
            function current() { return m.ov.isConnected && epoch === version && signed() && user.uid === uid && (!admin || isAdmin); }
            function fail(error) { if (current()) status.textContent = error && error.message === 'feedback/reply-changed' ? c.changed : c.error; }
            function stopObserving() {
                if (observer) observer.disconnect();
                observed.forEach(function (entry) { clearTimeout(entry.timer); }); observed.clear();
            }
            m.onClose = stopObserving;
            // Observe the submission text inside the scrollable modal, not the offscreen list.
            if (admin && window.IntersectionObserver) observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    var pending = observed.get(entry.target);
                    if (!pending) return;
                    clearTimeout(pending.timer);
                    if (entry.isIntersecting && entry.intersectionRatio > 0 && !document.hidden) {
                        pending.timer = setTimeout(function () { acknowledge(pending.fb, pending.card); }, 500);
                    }
                });
            }, { root: m.body, threshold: 0 });
            if (admin) m.refreshVisibility = function () {
                if (!current()) return;
                if (observer) observer.disconnect();
                observed.forEach(function (entry, text) {
                    clearTimeout(entry.timer);
                    if (!document.hidden && observer) observer.observe(text);
                });
            };
            function acknowledge(fb, card) {
                if (!current() || document.hidden || !card.isConnected || fb.adminUnread !== true || fb.acknowledging) return;
                fb.acknowledging = true;
                Promise.resolve().then(function () { if (current()) return box.markAdminRead(fb.id); }).then(function () {
                    if (!current()) return;
                    fb.adminUnread = false; paintSubmission(fb, card);
                }).catch(fail).finally(function () { fb.acknowledging = false; });
            }
            function paintSubmission(fb, card) {
                var meta = card.querySelector('.fb-meta');
                indicator(meta, fb.adminUnread === true, fb.adminUnread === true ? c.newSubmission + ' · ' + meta.textContent : meta.textContent);
            }
            if (admin) m.paintAdmin = function () {
                if (!current()) { stopObserving(); return; }
                // A full bounded batch may evict IDs without marking them read.
                var next = new Set(adminNotices.map(function (fb) { return fb.id; }));
                if (!adminError) items.forEach(function (fb) {
                    if (next.has(fb.id)) fb.adminUnread = true;
                    else if (adminNotices.length < 20 && seenByListener.has(fb.id)) fb.adminUnread = false;
                    var card = Array.from(list.children).find(function (el) { return el.dataset.feedbackId === fb.id; });
                    if (card) paintSubmission(fb, card);
                });
                next.forEach(function (id) { seenByListener.add(id); });
                if (adminError && !loading) status.textContent = c.adminNoticeError;
                else if (status.textContent === c.adminNoticeError) status.textContent = '';
            };
            function tabs() {
                toolbar.replaceChildren();
                [[false, c.all], [true, admin ? c.submissions : c.unread]].forEach(function (entry) {
                    var tab = button(entry[1], function () { onlyUnread = entry[0]; tabs(); load(false); });
                    if (entry[0]) tab.classList.add(admin ? 'feedback-submissions-tab' : 'feedback-unread-tab');
                    tab.setAttribute('aria-pressed', String(onlyUnread === entry[0])); toolbar.append(tab);
                    if (entry[0]) hub.bind(tab, admin ? 'feedback-admin' : 'feedback', function (state) {
                        return (admin ? c.submissions : c.unread) + (state.unread ? ' · ' + (admin ? c.adminNotice : c.notice)(state.atLeast ? String(state.count) + '+' : String(state.count)) : '');
                    });
                });
                toolbar.append(button(c.refresh, function () { if (admin && adminError) watchAdmin(); load(false); }));
                paintNotice();
            }
            function renderItem(fb) {
                var card = node('article', 'fb-item'), text = node('div', 'fb-text', fb.text || '');
                card.dataset.feedbackId = fb.id;
                card.classList.toggle('is-resolved', fb.resolved === true);
                var metaParts = [fb.resolved ? c.resolved : c.pending, date(fb.at)];
                if (admin) metaParts.unshift(fb.anon ? c.guest : fb.name || fb.email || c.guest);
                if (fb.kind) metaParts.push(options.translate('feedbackKind' + fb.kind.charAt(0).toUpperCase() + fb.kind.slice(1)));
                if (fb.game) metaParts.push(options.gameName(fb.game));
                card.append(text, node('div', 'fb-meta', metaParts.filter(Boolean).join(' · ')));
                if (admin) {
                    paintSubmission(fb, card);
                    if (fb.adminUnread === true) {
                        observed.set(text, { fb: fb, card: card });
                        if (observer) observer.observe(text);
                        card.addEventListener('focusin', function () { acknowledge(fb, card); });
                        card.addEventListener('pointerdown', function () { acknowledge(fb, card); });
                    }
                }
                if (fb.reply && fb.reply.text) {
                    var details = node('details', 'feedback-reply');
                    var summary = node('summary', '', c.read + (fb.unread && !admin ? ' · ' + c.unread : ''));
                    indicator(summary, fb.unread && !admin, summary.textContent);
                    details.append(summary, node('h3', '', c.reply), node('div', 'fb-text', fb.reply.text), node('p', 'fb-meta', date(fb.reply.at)));
                    var acknowledging = false;
                    details.addEventListener('toggle', function () {
                        if (!current() || !details.open || admin || !fb.unread || acknowledging) return;
                        acknowledging = true;
                        Promise.resolve().then(function () { if (current()) return box.markRead(fb.id, fb.replyVersion); }).then(function (saved) {
                            if (!current()) return;
                            if (saved) { fb.unread = false; summary.textContent = c.read; indicator(summary, false, c.read); }
                            else status.textContent = c.changed;
                        }).catch(fail).finally(function () { acknowledging = false; });
                    });
                    card.append(details);
                } else card.append(node('p', 'fb-meta', c.noReply));
                if (admin) {
                    var controls = node('div', 'fb-actions'), label = node('label', 'fb-resolved');
                    var resolved = node('input'); resolved.type = 'checkbox'; resolved.checked = fb.resolved === true;
                    label.append(resolved, node('span', '', c.resolved)); controls.append(label);
                    var del = button(c.del, function () {
                        if (del.dataset.armed !== 'true') { del.dataset.armed = 'true'; del.textContent = c.confirm; return; }
                        del.disabled = true;
                        Promise.resolve().then(function () { if (current()) return box.remove(fb.id); }).then(function () {
                            if (current()) {
                                items = items.filter(function (item) { return item.id !== fb.id; }); card.remove();
                                if (!items.length) list.append(node('p', 'records-empty', c.empty));
                            }
                        }).catch(function (error) { del.disabled = false; fail(error); });
                    }, 'fb-del'); controls.append(del);
                    resolved.addEventListener('change', function () {
                        var next = resolved.checked; resolved.disabled = true;
                        Promise.resolve().then(function () { if (current()) return box.setResolved(fb.id, next); }).then(function () {
                            if (current()) { fb.resolved = next; card.classList.toggle('is-resolved', next); }
                        }).catch(function (error) { resolved.checked = fb.resolved === true; fail(error); }).finally(function () { resolved.disabled = false; });
                    });
                    card.append(controls);
                    var form = node('form', 'feedback-reply-form'), inputLabel = node('label', '', c.reply);
                    var input = node('textarea', 'feedback-input'); input.rows = 3; input.maxLength = 2000; input.required = true;
                    input.placeholder = c.replyPlaceholder; input.value = fb.reply && fb.reply.text || ''; inputLabel.append(input);
                    var submit = node('button', 'feedback-action primary', fb.reply ? c.updateReply : c.sendReply); submit.type = 'submit';
                    form.append(inputLabel, node('p', 'fb-meta', c.latest), submit);
                    if (fb.anon) form.append(node('p', 'fb-meta', c.anonReply));
                    form.addEventListener('submit', function (event) {
                        event.preventDefault(); if (!current() || !input.value.trim()) return;
                        submit.disabled = true; input.disabled = true; del.disabled = true;
                        Promise.resolve().then(function () { if (current()) return box.reply(fb.id, input.value, fb.replyVersion || 0); }).then(function (replyVersion) {
                            if (!current()) return;
                            fb.replyVersion = replyVersion; fb.unread = true;
                            fb.reply = { text: input.value.trim(), by: uid, at: { toDate: function () { return new Date(); } } };
                            status.textContent = c.replySaved;
                            var updated = renderItem(fb); card.replaceWith(updated);
                            updated.querySelector('textarea').focus();
                        }).catch(fail).finally(function () { submit.disabled = false; input.disabled = false; del.disabled = false; });
                    }); card.append(form);
                }
                return card;
            }
            function render() {
                if (!current()) return;
                stopObserving(); list.replaceChildren();
                if (!items.length) list.append(node('p', 'records-empty', onlyUnread ? (admin ? c.noSubmissions : c.noUnread) : c.empty));
                items.forEach(function (fb) { list.append(renderItem(fb)); });
                moreButton.hidden = !more; moreButton.disabled = loading;
                if (admin) m.paintAdmin();
            }
            function load(append) {
                var request = ++refreshSerial;
                loading = true; status.textContent = c.loading; moreButton.disabled = true;
                var operation;
                if (onlyUnread && admin) {
                    try { operation = box.listAdminUnread(append ? cursor : null); } catch (error) { operation = Promise.reject(error); }
                } else if (onlyUnread) {
                    // Explicit refresh also retries a failed listener. No polling.
                    if (noticeError) watch();
                    try { operation = box.listUnread(); } catch (error) { operation = Promise.reject(error); }
                } else {
                    try { operation = admin ? box.listAdmin(append ? cursor : null) : box.listMine(append ? cursor : null); }
                    catch (error) { operation = Promise.reject(error); }
                }
                Promise.resolve(operation).then(function (page) {
                    if (!current() || request !== refreshSerial) return;
                    items = append ? items.concat(page.items) : page.items;
                    cursor = page.cursor; more = page.more; status.textContent = admin && adminError ? c.adminNoticeError : ''; loading = false; render();
                }).catch(function (error) { if (current() && request === refreshSerial) { loading = false; moreButton.disabled = false; fail(error); } });
            }
            m.body.append(toolbar, status, list, moreButton); tabs(); load(false);
            m.ov.addEventListener('keydown', function (event) {
                if (event.key !== 'Tab') return;
                var focusable = Array.from(m.ov.querySelectorAll('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), summary')).filter(function (el) { return el.getClientRects().length; });
                var first = focusable[0], last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            });
            toolbar.querySelector('button').focus();
        }
        if (mine) mine.addEventListener('click', function () { show(false, false); });
        if (notice) notice.addEventListener('click', function () { show(false, true); });
        document.addEventListener('visibilitychange', function () {
            watch(); watchAdmin();
            if (modal && modal.refreshVisibility) modal.refreshVisibility();
        });
        return {
            setUser: function (next) {
                if ((next && next.uid) === (user && user.uid) && !!(next && next.anon) === !!(user && user.anon)) { user = next; return; }
                if (signed() || next && !next.anon) document.querySelectorAll('[data-feedback-composer]').forEach(function (el) { el.remove(); });
                if (source) source.dispose(); source = null;
                if (adminSource) adminSource.dispose(); adminSource = null;
                isAdmin = false; adminNotices = []; adminError = false; ++adminWatchEpoch;
                if (adminStop) adminStop(); adminStop = null;
                epoch++; if (stop) stop(); stop = null; close(); notices = []; noticeError = false; user = next;
                if (signed()) source = hub.source('feedback', 'menu');
                paintNotice(); watch();
            },
            setAdmin: function (next, uid) {
                if (!signed() || user.uid !== uid || isAdmin === !!next) return;
                isAdmin = !!next;
                if (adminSource) adminSource.dispose(); adminSource = null;
                adminNotices = []; adminError = false;
                if (isAdmin) adminSource = hub.source('feedback-admin', 'menu');
                else close();
                paintAdminNotice(); watchAdmin();
            },
            showAdmin: function () { show(true, adminNotices.length > 0); },
            refreshLocale: function () { paintNotice(); paintAdminNotice(); close(); },
        };
    }
    window.GameBoxFeedback = { create: create };
})();
