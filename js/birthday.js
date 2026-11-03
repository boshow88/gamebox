/* Birthday eligibility and homepage entry. Reuses the existing CloudSync profile read. */
(function () {
    'use strict';
    var COPY = {
        en: { tag: 'BIRTHDAY PROCEEDINGS · TODAY ONLY', title: 'An official celebration has been issued.',
            body: function (name) { return 'To ' + name + ': your anniversary notice and candle-extinguishing ceremony await.'; },
            enter: 'Attend the birthday proceedings', seal: 'APPROVED', player: 'the esteemed player' },
        zh: { tag: '生日專案・本日限定', title: '閣下之慶生專案，業已核准。',
            body: function (name) { return name + ' 閣下：本處已備妥專屬祝賀函及生日吹蠟燭儀式，敬請蒞臨辦理。'; },
            enter: '進入生日慶祝專案', seal: '准予慶祝', player: '本站玩家' },
    };
    var COMPLETED_COPY = {
        en: { title: 'Birthday proceedings completed. Further celebration authorized.',
            body: function (name) { return 'To ' + name + ': today\'s candle ceremony is duly recorded as complete. Your anniversary notice remains available; repeat proceedings are expressly permitted.'; },
            enter: 'Revisit the birthday proceedings', seal: 'COMPLETED' },
        zh: { title: '慶生程序業已完成，准予再次辦理。',
            body: function (name) { return name + ' 閣下：今日吹蠟燭儀式業已完成，祝賀函仍可閱覽；如有再玩一場之需求，本處准予續辦。'; },
            enter: '重返生日慶祝專案', seal: '辦理完竣' },
    };
    function isBirthday(value, today) {
        if (typeof value !== 'string') return false;
        var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!match) return false;
        var year = +match[1], month = +match[2], day = +match[3];
        var birth = new Date(0); birth.setHours(0, 0, 0, 0); birth.setFullYear(year, month - 1, day);
        today = today || new Date();
        return year > 0 && birth.getFullYear() === year && birth.getMonth() === month - 1 && birth.getDate() === day
            && birth <= today && today.getMonth() === month - 1 && today.getDate() === day;
    }
    function dayKey(date) {
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    function midnightDelay(date) { return Math.max(50, new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - date.getTime() + 50); }
    function markerKey(kind, uid, date) { return 'gamebox:birthday:' + kind + ':' + uid + ':' + dayKey(date || new Date()); }
    function enteredKey(uid, date) { return markerKey('entered', uid, date); }
    function hasMarker(kind, uid, date) {
        var key = markerKey(kind, uid, date);
        try { if (localStorage.getItem(key) === '1') return true; } catch (e) { /* optional storage */ }
        try { return sessionStorage.getItem(key) === '1'; } catch (e) { return false; }
    }
    function mark(kind, uid, date) {
        var key = markerKey(kind, uid, date), persisted = false;
        try { localStorage.setItem(key, '1'); persisted = true; } catch (e) { /* use session storage */ }
        try { sessionStorage.setItem(key, '1'); persisted = true; } catch (e) { /* no auto-navigation without persistence */ }
        return persisted;
    }
    function hasEntered(uid, date) { return hasMarker('entered', uid, date); }
    function markEntered(uid, date) { return mark('entered', uid, date); }
    function hasCompleted(uid, date) { return hasMarker('completed', uid, date); }
    function markCompleted(uid, date) { return hasCompleted(uid, date) || mark('completed', uid, date); }
    function confetti(root) {
        var layer = document.createElement('div'); layer.className = 'birthday-confetti'; layer.setAttribute('aria-hidden', 'true');
        var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduced) for (var i = 0; i < 44; i++) {
            var piece = document.createElement('i'); piece.className = 'birthday-piece';
            piece.style.cssText = '--x:' + Math.random() * 100 + '%;--drift:' + (Math.random() - .5) * 160 + 'px;--delay:' + -Math.random() * 6 + 's;--duration:' + (4 + Math.random() * 3) + 's;--turn:' + (Math.random() - .5) * 900 + 'deg;--color:' + ['#dcc18b', '#c38c87', '#aac3c1', '#eee4c9'][i % 4];
            layer.append(piece);
        }
        root.append(layer);
        function visible() { layer.classList.toggle('is-paused', document.visibilityState === 'hidden'); }
        document.addEventListener('visibilitychange', visible); visible();
        return function () { document.removeEventListener('visibilitychange', visible); layer.remove(); };
    }
    function create(options) {
        var root = document.getElementById('birthday-entry');
        var user = null, profile = null, midnight = null, auto = null, observer = null, version = 0;
        var now = options.now || function () { return new Date(); };
        var navigate = options.navigate || function () { location.assign('./games/birthday.html'); };
        function eligible() { return user && !user.anon && profile && isBirthday(profile.birthday, now()); }
        function stopAuto() { clearTimeout(auto); auto = null; if (observer) observer.disconnect(); observer = null; }
        function render() {
            if (!root) return;
            root.hidden = !eligible();
            if (root.hidden) { root.replaceChildren(); return; }
            var locale = options.getLocale() === 'zh' ? 'zh' : 'en';
            var copy = Object.assign({}, COPY[locale], hasCompleted(user.uid, now()) ? COMPLETED_COPY[locale] : {});
            root.setAttribute('aria-label', copy.title);
            root.replaceChildren();
            var text = document.createElement('div'); text.className = 'birthday-entry-copy';
            [['p', 'birthday-entry-tag', copy.tag], ['h2', 'birthday-entry-title', copy.title], ['p', 'birthday-entry-body', copy.body(user.name || copy.player)]].forEach(function (item) {
                var node = document.createElement(item[0]); node.className = item[1]; node.textContent = item[2]; text.append(node);
            });
            var action = document.createElement('a'); action.className = 'birthday-entry-link'; action.href = './games/birthday.html'; action.textContent = copy.enter;
            action.addEventListener('click', function (event) {
                if (!eligible()) { event.preventDefault(); refresh(); return; }
                markEntered(user.uid, now());
            });
            var seal = document.createElement('span'); seal.className = 'birthday-entry-seal'; seal.textContent = copy.seal; seal.setAttribute('aria-hidden', 'true');
            text.append(action); root.append(text, seal);
        }
        function enterAutomatically() {
            stopAuto();
            if (!eligible() || hasEntered(user.uid, now()) || document.visibilityState === 'hidden') return;
            if (document.querySelector('.wip-gate, dialog[open]')) {
                observer = new MutationObserver(scheduleAuto); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] }); return;
            }
            var expected = version, uid = user.uid, date = now();
            function enter() {
                if (expected !== version || !eligible() || document.visibilityState === 'hidden' || hasEntered(uid, date) || dayKey(now()) !== dayKey(date)) return;
                if (!markEntered(uid, date)) return;
                navigate();
            }
            if (navigator.locks && navigator.locks.request) navigator.locks.request(enteredKey(uid, date), enter).catch(function () {});
            else enter();
        }
        function scheduleAuto() { stopAuto(); auto = setTimeout(enterAutomatically, 250); }
        function refresh() {
            clearTimeout(midnight); midnight = null; render();
            if (user && !user.anon && profile) midnight = setTimeout(refresh, midnightDelay(now()));
            if (eligible()) scheduleAuto(); else stopAuto();
        }
        function setUser(next) {
            if (!next || !user || next.uid !== user.uid || next.anon) { version++; profile = null; stopAuto(); clearTimeout(midnight); }
            user = next; render();
        }
        function update(next, data) { setUser(next); profile = data; refresh(); }
        function visible() { if (document.visibilityState !== 'hidden') refresh(); }
        document.addEventListener('visibilitychange', visible);
        window.addEventListener('pageshow', visible);
        function stored(event) { if (!event.key || event.key.indexOf('gamebox:birthday:completed:') === 0) render(); }
        window.addEventListener('storage', stored);
        return { setUser: setUser, update: update, refreshLocale: render,
            destroy: function () { version++; stopAuto(); clearTimeout(midnight); document.removeEventListener('visibilitychange', visible); window.removeEventListener('pageshow', visible); window.removeEventListener('storage', stored); if (root) { root.hidden = true; root.replaceChildren(); } },
        };
    }
    window.GameBoxBirthday = { isBirthday: isBirthday, dayKey: dayKey, midnightDelay: midnightDelay, hasEntered: hasEntered, markEntered: markEntered,
        hasCompleted: hasCompleted, markCompleted: markCompleted, confetti: confetti, create: create };
})();
