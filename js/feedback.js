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
        var errorNode = document.getElementById('feedback-notification-error');
        function copy() { return COPY[options.getLocale() === 'zh' ? 'zh' : 'en']; }
        function service() { return window.ArcadeNet && window.ArcadeNet.feedbackBox; }
        function signed() { return user && !user.anon; }
        var indicator = window.GameBoxNotifications.indicator;
        hub.bind(mine, 'feedback', function (state) { return copy().mine + (state.unread ? ' · ' + copy().notice(state.atLeast ? String(state.count) + '+' : String(state.count)) : ''); });
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
            if (!signed() || !service()) return;
            var c = copy(), version = epoch, uid = user.uid, box = service();
            var m = options.openModal(admin ? c.admin : c.mine); modal = m;
            m.body.classList.add('feedback-inbox');
            var toolbar = node('div', 'feedback-toolbar'), list = node('div', 'feedback-list');
            var status = node('p', 'feedback-status'); status.setAttribute('role', 'status');
            var moreButton = button(c.more, function () { load(true); });
            var cursor = null, more = false, loading = false, refreshSerial = 0, items = [];
            var onlyUnread = !!unreadOnly;
            function current() { return m.ov.isConnected && epoch === version && signed() && user.uid === uid; }
            function fail(error) { if (current()) status.textContent = error && error.message === 'feedback/reply-changed' ? c.changed : c.error; }
            function tabs() {
                toolbar.replaceChildren();
                if (!admin) {
                    [[false, c.all], [true, c.unread]].forEach(function (entry) {
                        var tab = button(entry[1], function () { onlyUnread = entry[0]; tabs(); load(false); });
                        if (entry[0]) tab.classList.add('feedback-unread-tab');
                        tab.setAttribute('aria-pressed', String(onlyUnread === entry[0])); toolbar.append(tab);
                        if (entry[0]) hub.bind(tab, 'feedback', function (state) { return c.unread + (state.unread ? ' · ' + c.notice(state.atLeast ? String(state.count) + '+' : String(state.count)) : ''); });
                    });
                }
                toolbar.append(button(c.refresh, function () { load(false); }));
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
                list.replaceChildren();
                if (!items.length) list.append(node('p', 'records-empty', onlyUnread ? c.noUnread : c.empty));
                items.forEach(function (fb) { list.append(renderItem(fb)); });
                moreButton.hidden = !more; moreButton.disabled = loading;
            }
            function load(append) {
                var request = ++refreshSerial;
                loading = true; status.textContent = c.loading; moreButton.disabled = true;
                var operation;
                if (onlyUnread && !admin) {
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
                    cursor = page.cursor; more = page.more; status.textContent = ''; loading = false; render();
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
        document.addEventListener('visibilitychange', function () { watch(); });
        return {
            setUser: function (next) {
                if ((next && next.uid) === (user && user.uid) && !!(next && next.anon) === !!(user && user.anon)) { user = next; return; }
                if (signed() || next && !next.anon) document.querySelectorAll('[data-feedback-composer]').forEach(function (el) { el.remove(); });
                if (source) source.dispose(); source = null;
                epoch++; if (stop) stop(); stop = null; close(); notices = []; noticeError = false; user = next;
                if (signed()) source = hub.source('feedback', 'menu');
                paintNotice(); watch();
            },
            showAdmin: function () { show(true, false); },
            refreshLocale: function () { paintNotice(); close(); },
        };
    }
    window.GameBoxFeedback = { create: create };
})();
