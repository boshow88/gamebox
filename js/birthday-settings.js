/* Optional manual account personalization. No profile writes on load. */
(function () {
    'use strict';
    var COPY = {
        zh: {
            title: '個人化設定', birthday: '生日資料', note: '可選填生日的月、日，用於生日當日的個人化內容。您可隨時刪除。',
            manual: '設定生日', month: '月', day: '日', choose: '請選擇',
            save: '儲存生日', remove: '刪除生日資料', confirm: '確認刪除', current: '目前設定：',
            empty: '尚未設定生日。',
            loading: '正在讀取設定…', retry: '重新讀取', busy: '正在處理…', saved: '生日已儲存。', removed: '生日資料已刪除。',
            signin: '以 Google 帳號登入', signinNote: '請先登入，再設定帳號的個人化資料。', offline: '目前無法連線，請稍後再試。',
            closed: '已取消登入。', blocked: '登入視窗未能開啟。請允許此網站開啟彈出式視窗後再試。',
            error: '設定未能儲存，請稍後再試。', invalid: '請選擇有效的月、日。',
        },
        en: {
            title: 'Personalization', birthday: 'Birthday details', note: 'Optionally provide your birthday month and day for birthday-specific content. You may delete these details at any time.',
            manual: 'Set birthday', month: 'Month', day: 'Day', choose: 'Select',
            save: 'Save birthday', remove: 'Delete birthday details', confirm: 'Confirm deletion', current: 'Current setting: ',
            empty: 'No birthday is set.',
            loading: 'Loading settings…', retry: 'Reload', busy: 'Processing…', saved: 'Birthday saved.', removed: 'Birthday details deleted.',
            signin: 'Sign in with Google', signinNote: 'Sign in to manage your account personalization.', offline: 'Connection is unavailable. Please try again later.',
            closed: 'Sign-in cancelled.', blocked: 'The sign-in window could not open. Allow pop-ups for this site and try again.',
            error: 'Settings could not be saved. Please try again later.', invalid: 'Select a valid month and day.',
        },
    };
    function node(tag, className, text) {
        var element = document.createElement(tag); if (className) element.className = className;
        if (text != null) element.textContent = text; return element;
    }
    function create(options) {
        var user, profile = null, draft = null, dirty = false, busy = false, message = '', dialog = null, serial = 0, armed = false, armTimer = null;
        function copy() { return COPY[options.getLocale() === 'zh' ? 'zh' : 'en']; }
        function network() { return window.ArcadeAuth || window.ArcadeNet; }
        function signed() { return user && !user.anon; }
        function errorKey(error) {
            var code = error && error.code || '';
            if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'closed';
            if (code === 'auth/popup-blocked') return 'blocked';
            return 'error';
        }
        function run(operation, success) {
            if (busy || !signed() || !profile || !window.CloudSync || !window.CloudSync.saveProfileFields) return;
            var token = ++serial, opened = dialog, uid = user.uid;
            function current() { return token === serial && dialog === opened && opened.ov.isConnected && signed() && user.uid === uid; }
            busy = true; message = ''; armed = false; render();
            var result;
            try { result = operation(uid); } catch (error) { result = Promise.reject(error); }
            Promise.resolve(result).then(function (saved) {
                if (!current() || saved === false) return;
                dirty = false; draft = null; message = success;
            }).catch(function (error) { if (current()) message = errorKey(error); }).finally(function () {
                if (!current()) return;
                busy = false; render();
            });
        }
        function render() {
            if (!dialog || !dialog.ov.isConnected) return;
            var text = copy(), N = network();
            dialog.ov.querySelector('.modal-title').textContent = text.title;
            var body = dialog.body; body.replaceChildren(); body.classList.add('personalization-settings'); body.setAttribute('aria-busy', String(busy));
            var section = node('section', 'personalization-section'); section.append(node('h2', '', text.birthday), node('p', 'personalization-note', text.note));
            if (!N || (user === undefined && N.ok)) section.append(node('p', 'personalization-note', text.loading));
            else if (!N.ok) section.append(node('p', 'personalization-note', text.offline));
            else if (!signed()) {
                section.append(node('p', 'personalization-note', text.signinNote));
                var signin = node('button', 'personalization-button primary', text.signin); signin.type = 'button';
                signin.addEventListener('click', function () {
                    signin.disabled = true;
                    Promise.resolve(N.signInGoogle()).catch(function (error) { message = errorKey(error); render(); }).finally(function () { signin.disabled = false; });
                }); section.append(signin);
            } else if (!profile) {
                section.append(node('p', 'personalization-note', text.loading));
                var retry = node('button', 'personalization-button', text.retry); retry.type = 'button';
                retry.disabled = !window.ArcadeNet || !window.ArcadeNet.ok;
                retry.addEventListener('click', function () {
                    retry.disabled = true;
                    Promise.resolve(window.CloudSync.sync()).then(function (ok) { if (!ok) { message = 'error'; render(); } }).finally(function () { retry.disabled = false; });
                }); section.append(retry);
            } else {
                var birthday = window.GameBoxBirthday.normalizeBirthday(profile.birthday);
                if (!draft) draft = { month: birthday ? birthday.month : 0, day: birthday ? birthday.day : 0 };
                var summary = birthday ? text.current + birthday.month + ' / ' + birthday.day : text.empty;
                section.append(node('p', 'personalization-summary', summary));
                var form = node('form', 'personalization-form'); form.id = 'birthday-manual-form';
                var fields = node('fieldset'); fields.disabled = busy; fields.append(node('legend', '', text.manual));
                var dates = node('div', 'personalization-date');
                function select(field, max) {
                    var label = node('label', '', text[field]); label.htmlFor = 'birthday-' + field;
                    var input = node('select'); input.id = label.htmlFor; input.required = true;
                    var placeholder = node('option', '', text.choose); placeholder.value = ''; input.append(placeholder);
                    for (var i = 1; i <= max; i++) { var option = node('option', '', String(i)); option.value = String(i); input.append(option); }
                    input.value = draft[field] ? String(draft[field]) : '';
                    input.addEventListener('change', function () {
                        draft[field] = Number(input.value); dirty = true;
                        if (field === 'month') {
                            var limit = new Date(2000, draft.month, 0).getDate();
                            if (draft.day > limit) draft.day = limit;
                            render(); dialog.body.querySelector('#birthday-day').focus();
                        }
                    }); label.append(input); dates.append(label);
                }
                select('month', 12); select('day', draft.month ? new Date(2000, draft.month, 0).getDate() : 31); fields.append(dates);
                var save = node('button', 'personalization-button primary', text.save); save.type = 'submit'; save.id = 'birthday-save'; fields.append(save); form.append(fields);
                form.addEventListener('submit', function (event) {
                    event.preventDefault();
                    var date = window.GameBoxBirthday.normalizeBirthday({ month: draft.month, day: draft.day });
                    if (!date) { message = 'invalid'; render(); return; }
                    var patch = { birthday: date };
                    run(function (uid) { return window.CloudSync.saveProfileFields(patch, uid); }, 'saved');
                }); section.append(form);
                if (profile.birthday != null) {
                    var remove = node('button', 'personalization-button danger', armed ? text.confirm : text.remove); remove.id = 'birthday-remove'; remove.type = 'button'; remove.disabled = busy;
                    remove.addEventListener('click', function () {
                        if (!armed) { armed = true; clearTimeout(armTimer); armTimer = setTimeout(function () { armed = false; render(); }, 5000); render(); return; }
                        clearTimeout(armTimer);
                        run(function (uid) { return window.CloudSync.saveProfileFields({ birthday: null }, uid); }, 'removed');
                    }); section.append(remove);
                }
            }
            var status = node('p', 'personalization-status', busy ? text.busy : text[message] || ''); status.setAttribute('role', 'status'); section.append(status);
            body.append(section);
        }
        return {
            show: function () {
                serial++; busy = false; message = ''; armed = false; clearTimeout(armTimer);
                if (dialog && dialog.ov.isConnected) dialog.close();
                dialog = options.openModal(copy().title); render();
                var first = dialog.body.querySelector('button:not(:disabled), select, a'); if (first) first.focus();
            },
            setUser: function (next) {
                if (!next || !user || next.uid !== user.uid || next.anon) { serial++; profile = null; draft = null; dirty = false; busy = false; message = ''; armed = false; clearTimeout(armTimer); }
                user = next; render();
            },
            update: function (data, uid) { if (!signed() || user.uid !== uid) return; profile = data || {}; if (!dirty && !busy) draft = null; render(); },
            refreshLocale: render,
        };
    }
    window.GameBoxBirthdaySettings = { create: create };
})();
