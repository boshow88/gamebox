/* Public announcement board and admin editor. Read markers feed the shared unread hub. */
(function () {
    'use strict';
    var COPY = {
        zh: { board: '公告欄', admin: '公告管理', create: '新增公告', edit: '編輯', refresh: '重新整理', more: '載入更多', empty: '目前沒有公告。',
            loading: '正在讀取…', error: '無法完成操作，請稍後再試。', changed: '公告已更新或下架，請重新整理。', unavailable: '目前無法讀取公告，請稍後再試。',
            important: '重要公告', draft: '草稿', published: '已發布', game: '相關遊戲', none: '不指定', openGame: '前往遊戲',
            titleZh: '繁體中文標題', bodyZh: '繁體中文內文', titleEn: '英文標題', bodyEn: '英文內文',
            editorNote: '至少填妥一種語言的標題與內文。未提供的語言會顯示另一版本；已發布公告修改後會再次通知。',
            saveDraft: '儲存草稿', publish: '發布公告', update: '儲存並發布', unpublish: '下架為草稿', confirmUnpublish: '確認下架',
            remove: '刪除草稿', confirmRemove: '確認刪除', saved: '公告已儲存。', marked: '已讀', unread: '未讀',
            readAll: '全部標為已讀', readAllDone: '已更新已讀狀態。',
            limit: '已發布公告達到上限，請先下架較舊的公告。' },
        en: { board: 'Announcements', admin: 'Manage announcements', create: 'New announcement', edit: 'Edit', refresh: 'Refresh', more: 'Load more', empty: 'No announcements yet.',
            loading: 'Loading…', error: 'Could not complete the request. Please try again.', changed: 'This announcement changed or was withdrawn. Please refresh.', unavailable: 'Announcements are unavailable. Please try again later.',
            important: 'Important', draft: 'Draft', published: 'Published', game: 'Related game', none: 'None', openGame: 'Open game',
            titleZh: 'Traditional Chinese title', bodyZh: 'Traditional Chinese text', titleEn: 'English title', bodyEn: 'English text',
            editorNote: 'Complete the title and text in at least one language. Missing translations use the other language. Changes to published announcements notify readers again.',
            saveDraft: 'Save draft', publish: 'Publish', update: 'Save and publish', unpublish: 'Withdraw to draft', confirmUnpublish: 'Confirm withdrawal',
            remove: 'Delete draft', confirmRemove: 'Confirm deletion', saved: 'Announcement saved.', marked: 'Read', unread: 'Unread',
            readAll: 'Mark all as read', readAllDone: 'Read status updated.',
            limit: 'The published announcement limit was reached. Withdraw an older announcement first.' },
    };
    var GUEST_KEY = 'gamebox:announcements:guest-reads';
    function node(tag, cls, text) { var el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; }
    function button(text, handler) { var el = node('button', 'announcement-action', text); el.type = 'button'; el.addEventListener('click', handler); return el; }
    function numbers(value) {
        var result = Object.create(null);
        if (value && typeof value === 'object') Object.keys(value).forEach(function (id) { if (Number.isSafeInteger(value[id]) && value[id] > 0) result[id] = value[id]; });
        return result;
    }
    function guestReads() { try { return numbers(JSON.parse(localStorage.getItem(GUEST_KEY))); } catch (_) { return numbers(null); } }
    function time(at) { try { return at && at.toDate ? at.toDate().toLocaleString() : ''; } catch (_) { return ''; } }
    function create(options) {
        var user, epoch = 0, watchEpoch = 0, stop = null, source = null, modal = null, versions = null, reads = numbers(null), profileReady = false;
        var entry = document.getElementById('drawer-announcements'), manage = document.getElementById('drawer-announcements-admin');
        var hub = options.notifications, indicator = window.GameBoxNotifications.indicator;
        function copy() { return COPY[options.getLocale() === 'zh' ? 'zh' : 'en']; }
        function service() { return window.ArcadeNet && window.ArcadeNet.announcements; }
        function signed() { return user && !user.anon; }
        function localized(value) { var lang = options.getLocale() === 'zh' ? 'zh' : 'en'; return value && (value[lang] || value[lang === 'zh' ? 'en' : 'zh']) || ''; }
        function unread(id, revision) { return !!versions && versions[id] === revision && (!Number.isInteger(reads[id]) || reads[id] < revision); }
        function paint() {
            if (entry) entry.textContent = copy().board;
            if (manage) manage.textContent = copy().admin;
            if (source) source.publish(profileReady && versions ? Object.keys(versions).filter(function (id) { return unread(id, versions[id]); }).length : 0);
            if (modal && modal.ov.isConnected && modal.updateReadAll) modal.updateReadAll();
            hub.refresh();
        }
        hub.bind(entry, 'announcements', function (state) { return copy().board + (state.unread ? ' · ' + hub.describe(state) : ''); });
        function watch() {
            var token = ++watchEpoch;
            if (stop) stop(); stop = null;
            if (document.hidden || !service()) return;
            try { stop = service().watchIndex(function (next) { if (token !== watchEpoch) return; versions = numbers(next); paint(); }, function () {
                if (token === watchEpoch && modal && modal.ov.isConnected) modal.status.textContent = copy().unavailable;
            }); } catch (_) { /* Opening the board offers an explicit retry. */ }
        }
        function close() { if (modal) modal.close(); modal = null; }
        function show(admin) {
            close(); if (admin && !signed()) return;
            var c = copy(), version = epoch, uid = user && user.uid, box = service();
            var m = options.openModal(admin ? c.admin : c.board); modal = m; m.body.classList.add('announcement-board');
            var toolbar = node('div', 'announcement-toolbar'), list = node('div', 'announcement-list'), status = node('p', 'announcement-status');
            status.setAttribute('role', 'status'); m.status = status;
            var cursor = null, request = 0, items = [];
            var more = button(c.more, function () { load(true); }); more.hidden = true;
            var bulkBusy = false, readAll = admin ? null : button(c.readAll, markAllRead);
            function current() { return m.ov.isConnected && epoch === version && (user && user.uid) === uid; }
            function fail(error) {
                if (!current()) return;
                status.textContent = error && error.message === 'announcements/changed' ? c.changed
                    : error && error.message === 'announcements/limit' ? c.limit : c.error;
            }
            m.updateReadAll = function () {
                if (readAll) readAll.disabled = bulkBusy || !profileReady || !versions || !Object.keys(versions).some(function (id) { return unread(id, versions[id]); });
            };
            function markAllRead() {
                if (!current() || bulkBusy || !profileReady || !versions) return;
                var expected = Object.create(null);
                Object.keys(versions).forEach(function (id) { if (unread(id, versions[id])) expected[id] = versions[id]; });
                if (!Object.keys(expected).length) return;
                bulkBusy = true; m.updateReadAll();
                var operation;
                if (signed()) operation = window.CloudSync.saveAllAnnouncementReads(expected, uid);
                else {
                    var stored = guestReads();
                    Object.keys(stored).forEach(function (id) { reads[id] = Math.max(reads[id] || 0, stored[id]); });
                    Object.keys(expected).forEach(function (id) { if (versions[id] === expected[id]) reads[id] = Math.max(reads[id] || 0, expected[id]); });
                    try { localStorage.setItem(GUEST_KEY, JSON.stringify(reads)); } catch (_) { /* Keep this visit's state in memory. */ }
                    operation = Promise.resolve(true);
                }
                Promise.resolve(operation).then(function (saved) {
                    if (!current()) return;
                    if (!saved) { status.textContent = c.changed; return; }
                    paint(); status.textContent = c.readAllDone;
                    list.querySelectorAll('[data-announcement-id]').forEach(function (card) {
                        var item = items.find(function (item) { return item.id === card.dataset.announcementId; });
                        if (!item) return;
                        var active = unread(item.id, item.revision);
                        indicator(card.querySelector('summary'), active, localized(item.title) + (active ? ' · ' + c.unread : ''));
                    });
                }).catch(fail).finally(function () { if (current()) { bulkBusy = false; m.updateReadAll(); } });
            }
            function markRead(item, summary) {
                if (!current() || !unread(item.id, item.revision)) return;
                var operation;
                if (signed()) operation = window.CloudSync.saveAnnouncementRead(item.id, item.revision, uid);
                else {
                    var stored = guestReads();
                    Object.keys(stored).forEach(function (id) { reads[id] = Math.max(reads[id] || 0, stored[id]); });
                    reads[item.id] = Math.max(reads[item.id] || 0, item.revision);
                    try { localStorage.setItem(GUEST_KEY, JSON.stringify(reads)); } catch (_) { /* Keep this visit's state in memory. */ }
                    operation = Promise.resolve(true);
                }
                return Promise.resolve(operation).then(function (saved) {
                    if (!current()) return;
                    if (!saved) { status.textContent = c.changed; return; }
                    reads[item.id] = Math.max(reads[item.id] || 0, item.revision); paint();
                    indicator(summary, false, localized(item.title));
                }).catch(fail);
            }
            function renderItem(item) {
                var card = node('article', 'announcement-item'); card.dataset.announcementId = item.id;
                var heading = node('div', 'announcement-meta');
                if (item.important) heading.append(node('span', 'announcement-important', c.important));
                heading.append(node('span', '', admin ? item.published ? c.published : c.draft : time(item.publishedAt)));
                card.append(heading);
                if (admin) {
                    card.append(node('h3', '', localized(item.title)), button(c.edit, function () { edit(item); }));
                    if (!item.published) {
                        var remove = button(c.remove, function () {
                            if (remove.dataset.armed !== 'true') { remove.dataset.armed = 'true'; remove.textContent = c.confirmRemove; return; }
                            remove.disabled = true;
                            Promise.resolve().then(function () { if (current()) return box.remove(item.id, item.revision); }).then(function () { if (current()) load(false); }).catch(fail).finally(function () { remove.disabled = false; });
                        }); card.append(remove);
                    }
                } else {
                    var details = node('details'), summary = node('summary', '', localized(item.title));
                    indicator(summary, unread(item.id, item.revision), localized(item.title) + (unread(item.id, item.revision) ? ' · ' + c.unread : ''));
                    details.append(summary, node('div', 'announcement-text', localized(item.body)));
                    var game = options.getGames().find(function (candidate) { return candidate.id === item.game; });
                    if (game) { var link = node('a', 'announcement-game', c.openGame + ' · ' + game.name); link.href = game.href; details.append(link); }
                    var saving = false;
                    details.addEventListener('toggle', function () {
                        if (!current() || !details.open || saving || !unread(item.id, item.revision)) return;
                        saving = true; Promise.resolve(markRead(item, summary)).finally(function () { saving = false; });
                    }); card.append(details);
                }
                return card;
            }
            function load(append) {
                var token = ++request;
                if (!box) { status.textContent = c.unavailable; return; }
                status.textContent = c.loading; more.disabled = true;
                Promise.resolve().then(function () { return admin ? box.listAdmin(append ? cursor : null) : box.list(append ? cursor : null); }).then(function (page) {
                    if (!current() || request !== token) return;
                    items = append ? items.concat(page.items) : page.items; cursor = page.cursor; list.replaceChildren();
                    if (!items.length) list.append(node('p', 'records-empty', c.empty));
                    items.forEach(function (item) { list.append(renderItem(item)); });
                    more.hidden = !page.more; status.textContent = '';
                }).catch(fail).finally(function () { if (current() && request === token) more.disabled = false; });
            }
            function edit(item) {
                request++; list.replaceChildren(); more.hidden = true; status.textContent = ''; toolbar.replaceChildren();
                toolbar.append(button(c.board, function () { show(true); }));
                var form = node('form', 'announcement-editor'), fields = node('fieldset');
                form.append(node('p', 'announcement-note', c.editorNote), fields);
                var inputs = {};
                [['titleZh', 'title', 'zh', 120], ['bodyZh', 'body', 'zh', 6000], ['titleEn', 'title', 'en', 120], ['bodyEn', 'body', 'en', 6000]].forEach(function (field) {
                    var label = node('label', '', c[field[0]]), input = node(field[1] === 'body' ? 'textarea' : 'input');
                    input.name = field[0]; input.maxLength = field[3]; if (input.tagName === 'TEXTAREA') input.rows = 5; else input.type = 'text';
                    input.value = item && item[field[1]] && item[field[1]][field[2]] || ''; inputs[field[0]] = input; label.append(input); fields.append(label);
                });
                var gameLabel = node('label', '', c.game), gameSelect = node('select'); gameSelect.name = 'game';
                var none = node('option', '', c.none); none.value = ''; gameSelect.append(none);
                options.getGames().forEach(function (game) { var option = node('option', '', game.name); option.value = game.id; gameSelect.append(option); });
                gameSelect.value = item && item.game || ''; gameLabel.append(gameSelect); fields.append(gameLabel);
                var importantLabel = node('label', 'announcement-check'), important = node('input'); important.type = 'checkbox'; important.name = 'important'; important.checked = !!(item && item.important);
                importantLabel.append(important, node('span', '', c.important)); fields.append(importantLabel);
                var actions = node('div', 'announcement-toolbar'), publish = node('button', 'announcement-action primary', item && item.published ? c.update : c.publish);
                publish.type = 'submit'; actions.append(publish);
                var draft = button(item && item.published ? c.unpublish : c.saveDraft, function () {
                    if (item && item.published && draft.dataset.armed !== 'true') { draft.dataset.armed = 'true'; draft.textContent = c.confirmUnpublish; return; }
                    save(false);
                }); actions.append(draft); fields.append(actions); list.append(form);
                function save(published) {
                    if (!current() || fields.disabled) return;
                    var value = { title: { zh: inputs.titleZh.value, en: inputs.titleEn.value }, body: { zh: inputs.bodyZh.value, en: inputs.bodyEn.value }, game: gameSelect.value || null, important: important.checked, published };
                    if (!['zh', 'en'].some(function (lang) { return value.title[lang].trim() && value.body[lang].trim(); })
                        || ['zh', 'en'].some(function (lang) { return !!value.title[lang].trim() !== !!value.body[lang].trim(); })) { status.textContent = c.editorNote; return; }
                    fields.disabled = true;
                    Promise.resolve().then(function () { if (current()) return box.save(item && item.id, value, item ? item.revision : 0); }).then(function () {
                        if (current()) { show(true); modal.status.textContent = c.saved; }
                    }).catch(fail).finally(function () { fields.disabled = false; });
                }
                form.addEventListener('submit', function (event) { event.preventDefault(); save(true); }); inputs.titleZh.focus();
            }
            toolbar.append(button(c.refresh, function () { watch(); load(false); }));
            if (readAll) toolbar.append(readAll);
            if (admin) toolbar.append(button(c.create, function () { edit(null); }));
            m.body.append(toolbar, status, list, more); m.updateReadAll(); load(false); toolbar.querySelector('button').focus();
            m.ov.addEventListener('keydown', function (event) {
                if (event.key !== 'Tab') return;
                var controls = Array.from(m.ov.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, a[href]')).filter(function (el) { return el.getClientRects().length; });
                var first = controls[0], last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            });
        }
        if (entry) entry.addEventListener('click', function () { show(false); });
        if (manage) manage.addEventListener('click', function () { show(true); });
        document.addEventListener('visibilitychange', watch);
        window.addEventListener('storage', function (event) { if (event.key === GUEST_KEY && !signed()) { reads = guestReads(); paint(); } });
        return {
            setUser: function (next) {
                if (user !== undefined && (user && user.uid) === (next && next.uid) && !!(user && user.anon) === !!(next && next.anon)) { user = next; return; }
                epoch++; close(); if (source) source.dispose(); user = next; reads = signed() ? numbers(null) : guestReads(); profileReady = !signed();
                source = hub.source('announcements', 'menu'); paint(); watch();
            },
            update: function (profile, uid) { if (signed() && user.uid === uid) { reads = numbers(profile && profile.announcementReads); profileReady = true; paint(); } },
            refreshLocale: function () { paint(); close(); },
        };
    }
    window.GameBoxAnnouncements = { create: create };
})();
