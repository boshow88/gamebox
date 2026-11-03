/* Birthday-only standalone ceremony. No wish input, scores, feedback or room writes. */
(function () {
    'use strict';
    var TEXT = {
        zh: {
            pageTitle: '生日慶祝專案 · GameBox', home: '返回首頁', department: 'GAMEBOX・玩家事務處', caseName: '出生週年紀念專案',
            title: '閣下之生日，\n本處業已正式受理。', subtitle: '關於出生週年紀念之祝賀暨慶祝程序核准事宜。',
            moreBelow: '閱函後，前往吹蠟燭',
            issuer: 'GameBox 玩家事務處', subjectLabel: '主旨', explanationLabel: '說明', proposalLabel: '擬辦',
            subject: '為辦理閣下出生週年紀念之祝賀暨操作表現表彰事宜，特致本函，敬請查照。',
            clause1: '依本系統所載生日資料，今日適逢閣下出生週年紀念日，依照本站慶生作業程序，正式致上祝賀。',
            clause2: '閣下歷次蒞臨本站所展現之點擊毅力、操作精神及面對失敗仍願再試之勇氣，均予高度肯定。有無刷新最高紀錄，不影響本案表彰資格。',
            clause3: '本日特准閣下暫緩處理非必要任務，優先接受蛋糕、祝福及適量之快樂。',
            proposal: '核准閣下於心中許願，並親自執行生日蠟燭熄滅作業。祈願未來年度之主線任務推進順利、負面狀態悉數解除，且各項操作回應即時、執行皆得所願。',
            letterEnd: '專此函達。', validity: '本函於閣下生日當地日期內有效，當日屆滿後停止受理。',
            seal: '准予\n慶祝', ritualNote: '請先於心中許願，再行辦理下列吹蠟燭作業。', start: '開始辦理吹蠟燭作業',
            cakeTitle: '生日蠟燭熄滅作業', cakeLead: '請依下列操作要領完成本項慶祝程序。', readAgain: '返回閱覽祝賀函',
            blowHint: '滑鼠或觸控：按住畫面調整風向。',
            keyboardControls: '生日蛋糕。按住空白鍵朝游標方向送風；左右方向鍵轉向，移動滑鼠恢復游標控制。',
            remaining: function (n) { return n ? '尚待熄滅：' + n + ' 根蠟燭' : '全部蠟燭熄滅作業完成。'; },
            doneTitle: '本次慶生程序\n業已完成。', doneBody: '經查，所列生日蠟燭均已熄滅，本處謹向閣下致上正式祝賀。祈願往後年度諸事順遂，並請持續蒞臨本站指導。',
            again: '再次辦理吹蠟燭作業', doneSeal: '辦理完竣', checking: '生日資格查驗中。', checkingBody: '請稍候，本處正在核對帳號資料。',
            signInTitle: '請先辦理身分確認。', signInBody: '本專案僅供生日當日之登入玩家參與，請使用您的 Google 帳號登入。', signIn: '以 Google 帳號登入',
            unavailable: '本專案現未開放予閣下。', unavailableBody: '生日慶祝專案僅於帳號所載生日當地日期內開放。敬請返回首頁辦理其他事項。',
            failed: '暫無法完成資格查驗。', failedBody: '帳號資料尚未取得，敬請重新整理後再行辦理。', retry: '重新查驗', player: '本站玩家',
            recipient: function (name) { return '受文者：' + name + ' 閣下'; }, reference: function (date) { return '發文字號：GB－慶生字第 ' + date + ' 號'; },
        },
        en: {
            pageTitle: 'Birthday Proceedings · GameBox', home: 'Back to GameBox', department: 'GAMEBOX · PLAYER AFFAIRS', caseName: 'BIRTH ANNIVERSARY PROCEEDINGS',
            title: 'Your birthday\nhas been duly received.', subtitle: 'Concerning anniversary felicitations and the authorization of celebratory proceedings.',
            moreBelow: 'Read on, then blow out the candles',
            issuer: 'GameBox Office of Player Affairs', subjectLabel: 'Subject', explanationLabel: 'Findings', proposalLabel: 'Resolution',
            subject: 'Formal felicitations upon the anniversary of your birth, together with commendation of your operational performance. Kindly take due notice.',
            clause1: 'Upon examination of the birthday particulars held on record, this Office confirms that today constitutes the anniversary of your birth. Formal congratulations are hereby extended in accordance with established celebratory procedure.',
            clause2: 'Your persistence in clicking, dedication to the controls, and continued participation despite prior setbacks are duly acknowledged. The absence of a new High Score shall not prejudice eligibility for this commendation.',
            clause3: 'You are hereby authorized to defer non-essential assignments for the purpose of receiving cake, felicitations, and a reasonable allocation of happiness.',
            proposal: 'Permission is granted to formulate a wish privately and personally execute the extinguishing of the birthday candles. May your main quests proceed without obstruction, all adverse status effects be lifted, and all operations receive prompt and favorable responses.',
            letterEnd: 'Issued for your due notice and appropriate celebration.', validity: 'This instrument is valid solely on your birthday in the local calendar and expires at the close of that day.',
            seal: 'CELEBRATION\nAPPROVED', ritualNote: 'Kindly formulate your wish privately before commencing the candle-extinguishing procedure.', start: 'Commence candle proceedings',
            cakeTitle: 'Candle-extinguishing procedure', cakeLead: 'Kindly complete the celebratory operation in accordance with the instructions below.', readAgain: 'Return to the formal notice',
            blowHint: 'Mouse or touch: hold and move to direct the breeze.',
            keyboardControls: 'Birthday cake. Hold Space to blow toward the cursor. Left and right arrows take over steering; move the mouse to resume cursor control.',
            remaining: function (n) { return n ? 'Candles pending extinguishment: ' + n : 'All candle-extinguishing operations are complete.'; },
            doneTitle: 'The proceedings\nare duly concluded.', doneBody: 'Upon inspection, all listed birthday candles have been extinguished. This Office hereby conveys its formal congratulations and wishes you every success throughout the coming annual period. Your continued attendance at GameBox is cordially invited.',
            again: 'Repeat candle proceedings', doneSeal: 'DULY COMPLETED', checking: 'Verification in progress.', checkingBody: 'This Office is examining the account particulars. Kindly stand by.',
            signInTitle: 'Identification is required.', signInBody: 'Participation is reserved for signed-in players on their birthday. Kindly identify yourself using your Google account.', signIn: 'Sign in with Google',
            unavailable: 'These proceedings are not currently available.', unavailableBody: 'The birthday proceedings operate only on the birthday recorded for your account, according to the local calendar. Kindly return to GameBox to attend to other matters.',
            failed: 'Verification could not be completed.', failedBody: 'Account particulars are not yet available. Kindly refresh this page and submit to verification again.', retry: 'Refresh verification', player: 'the esteemed player',
            recipient: function (name) { return 'Addressee: ' + name; }, reference: function (date) { return 'Reference: GB-BD-' + date; },
        },
    };
    var REPEAT = {
        zh: {
            title: '閣下之慶生程序，\n業已辦理完竣。', subtitle: '關於已完成慶生程序之確認暨再次辦理核准事宜。',
            moreBelow: '前往再次辦理',
            subject: '為確認閣下今日生日吹蠟燭儀式業已完成，並核准續辦申請，特致本函，敬請查照。',
            clause1: '經查，閣下已於今日完成生日蠟燭熄滅作業，本處予以確認；本日之祝賀及休閒活動資格仍持續有效。',
            clause3: '本案既已辦理完竣，毋須重行辦理；如閣下仍有續辦之意願，本處准予受理，次數不拘。',
            proposal: '本函祝賀效力於當日持續有效。閣下如有續辦需求，請逕行啟動吹蠟燭作業；亦得返回首頁辦理其他事項。',
            seal: '辦理\n完竣', ritualNote: '今日儀式業已完成。如有續辦需求，得先於心中許願，再行辦理吹蠟燭作業。', start: '再次辦理吹蠟燭作業',
            cakeLead: '本次依續辦程序受理，原慶生完成紀錄仍予保留。',
        },
        en: {
            title: 'Your birthday proceedings\nare duly completed.', subtitle: 'Concerning confirmation of completed proceedings and authorization of further applications.',
            moreBelow: 'Proceed again',
            subject: 'Confirmation that today\'s birthday candle ceremony has been completed, together with authorization for supplementary proceedings. Kindly take due notice.',
            clause1: 'Upon examination, this Office confirms your completion of today\'s candle-extinguishing procedure. All birthday felicitations and celebratory authorizations remain in force for the remainder of this day.',
            clause3: 'The required proceedings having been concluded, no further action is obligatory. Supplementary applications shall nevertheless be accepted without numerical restriction.',
            proposal: 'These felicitations remain in force throughout this day. Should supplementary proceedings be required, kindly initiate the candle procedure; alternatively, return to GameBox to attend to other matters.',
            seal: 'DULY\nCOMPLETED', ritualNote: 'Today\'s ceremony is duly concluded. Should further proceedings be required, kindly formulate any additional wish privately before commencing.', start: 'Repeat candle proceedings',
            cakeLead: 'This application is accepted as supplementary proceedings. The original completion record remains valid.',
        },
    };
    var B = window.GameBoxBirthday, user, profile = null, locale = 'en', scene = 'notice', cake = null, finale = null, decoration = null;
    var midnight = null, loadingTimer = null, failed = false, activeDay = null;
    var completionTimer = null, pendingCompletion = null;
    var scrollCueFrame = null, scrollCueObserver = null;
    function el(id) { return document.getElementById(id); }
    function updateScrollCue() {
        scrollCueFrame = null;
        var cue = el('birthday-scroll-cue'), viewport = window.visualViewport;
        var top = viewport ? viewport.offsetTop : 0, height = viewport ? viewport.height : document.documentElement.clientHeight;
        var bottom = window.scrollY + top + height;
        var remaining = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - bottom;
        var show = window.matchMedia('(max-width: 700px)').matches && !el('birthday-notice').hidden
            && !finale && !document.hidden && remaining > 56;
        if (show) {
            var action = el('birthday-start').getBoundingClientRect();
            // Once the final action is fully visible, the reading path is complete.
            if (action.top >= top && action.bottom <= top + height - 12) show = false;
        }
        cue.hidden = !show;
    }
    function scheduleScrollCue() {
        if (scrollCueFrame === null) scrollCueFrame = requestAnimationFrame(updateScrollCue);
    }
    try { var saved = JSON.parse(localStorage.getItem('gamebox:lang')); if (saved === 'zh') locale = 'zh'; } catch (e) { /* default English */ }
    function eligible() { return user && !user.anon && profile && B.isBirthday(profile.birthday, new Date()); }
    function currentCopy() { return Object.assign({}, TEXT[locale], eligible() && B.hasCompleted(user.uid, new Date()) ? REPEAT[locale] : {}); }
    function cancelCompletion() { clearTimeout(completionTimer); completionTimer = null; pendingCompletion = null; }
    function cleanup() {
        cancelCompletion();
        if (scrollCueFrame !== null) cancelAnimationFrame(scrollCueFrame); scrollCueFrame = null;
        el('birthday-scroll-cue').hidden = true;
        if (cake) cake.destroy(); cake = null;
        if (finale) { finale.close(); finale.remove(); finale = null; }
        if (decoration) decoration(); decoration = null;
    }
    function renderLanguage() {
        var copy = currentCopy(); document.documentElement.lang = locale === 'zh' ? 'zh-Hant' : 'en'; document.title = copy.pageTitle;
        document.querySelectorAll('[data-copy]').forEach(function (node) { node.textContent = copy[node.dataset.copy]; });
        document.querySelectorAll('[data-lang]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.lang === locale)); });
        document.querySelector('.birthday-language').setAttribute('aria-label', locale === 'zh' ? '語言' : 'Language');
        if (user) {
            el('birthday-recipient').textContent = copy.recipient(user.name || copy.player);
            el('birthday-player-name').textContent = user.name || copy.player;
        }
        el('birthday-reference').textContent = copy.reference(B.dayKey(new Date()).replace(/-/g, ''));
        el('birthday-player-date').textContent = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-TW' : 'en', { dateStyle: 'long' }).format(new Date());
        if (cake) cake.setCopy(copy);
        if (finale) {
            finale.querySelector('h2').textContent = copy.doneTitle; finale.querySelector('p').textContent = copy.doneBody;
            finale.querySelector('.birthday-complete-seal').textContent = copy.doneSeal;
            finale.querySelector('.birthday-complete-home').textContent = copy.home;
            finale.querySelector('.birthday-complete-again').textContent = copy.again;
        }
    }
    function gate() {
        var copy = TEXT[locale], signed = user && !user.anon;
        var state = failed ? 'failed' : user === undefined || signed && profile === null ? 'checking' : !signed ? 'signIn' : 'unavailable';
        el('birthday-gate-title').textContent = state === 'signIn' ? copy.signInTitle : copy[state];
        el('birthday-gate-body').textContent = copy[state + 'Body'];
        el('birthday-sign-in').hidden = user === undefined || !!signed || !(window.ArcadeNet && window.ArcadeNet.ok);
        el('birthday-retry').hidden = !failed;
    }
    function paint() {
        renderLanguage();
        var valid = eligible();
        el('birthday-gate').hidden = !!valid; el('birthday-notice').hidden = !valid || scene !== 'notice';
        el('birthday-cake-screen').hidden = !valid || scene !== 'cake';
        scheduleScrollCue();
        if (!valid) { cleanup(); activeDay = null; scene = 'notice'; gate(); return; }
        var day = B.dayKey(new Date());
        if (activeDay !== day) { activeDay = day; B.markEntered(user.uid, new Date()); }
        if (!decoration) decoration = B.confetti(el('birthday-decoration'));
        var photo = el('birthday-player-photo');
        el('birthday-player-initial').textContent = Array.from(user.name || TEXT[locale].player)[0].toUpperCase();
        if (user.photo && /^https:\/\//i.test(user.photo)) {
            if (photo.getAttribute('src') !== user.photo) { photo.src = user.photo; photo.hidden = false; }
        } else { photo.hidden = true; photo.removeAttribute('src'); }
    }
    function refresh() { clearTimeout(midnight); paint(); midnight = setTimeout(refresh, B.midnightDelay(new Date())); }
    function complete() {
        if (!eligible() || finale || pendingCompletion || scene !== 'cake') return;
        B.markCompleted(user.uid, new Date());
        pendingCompletion = { uid: user.uid, day: B.dayKey(new Date()) };
        scheduleCompletion();
    }
    function scheduleCompletion() {
        clearTimeout(completionTimer); completionTimer = null;
        if (!pendingCompletion || document.hidden) return;
        // Keep the finished cake visible before moving focus into the dialog.
        completionTimer = setTimeout(function () {
            completionTimer = null;
            if (document.hidden) return;
            var completed = pendingCompletion; pendingCompletion = null;
            if (!completed || !eligible() || user.uid !== completed.uid || B.dayKey(new Date()) !== completed.day || scene !== 'cake') return;
            showCompletion();
        }, 800);
    }
    function showCompletion() {
        if (!eligible() || finale) return;
        finale = document.createElement('dialog'); finale.className = 'birthday-finale'; finale.setAttribute('aria-labelledby', 'birthday-complete-title');
        var seal = document.createElement('span'); seal.className = 'birthday-complete-seal';
        var heading = document.createElement('h2'); heading.id = 'birthday-complete-title'; heading.tabIndex = -1;
        var body = document.createElement('p');
        var home = document.createElement('a'); home.className = 'birthday-primary birthday-complete-home'; home.href = '../index.html';
        var again = document.createElement('button'); again.type = 'button'; again.className = 'birthday-secondary birthday-complete-again'; again.addEventListener('click', startCake);
        finale.addEventListener('cancel', function (event) {
            event.preventDefault(); finale.close(); finale.remove(); finale = null;
            if (cake) cake.destroy(); cake = null; scene = 'notice'; paint();
        });
        finale.append(seal, heading, body, home, again); document.body.append(finale); renderLanguage(); finale.showModal(); heading.focus({ preventScroll: true }); scheduleScrollCue();
    }
    function startCake() {
        if (!eligible()) { refresh(); return; }
        cancelCompletion();
        if (finale) { finale.close(); finale.remove(); finale = null; }
        if (cake) cake.destroy();
        scene = 'cake'; paint();
        cake = window.GameBoxBirthdayCake.mount({ element: el('birthday-cake-mount'), copy: currentCopy(), onComplete: complete });
        window.scrollTo({ top: 0, behavior: 'instant' }); cake.focus();
    }
    function connect() {
        var N = window.ArcadeNet;
        if (!N || !N.ok) { user = null; failed = true; paint(); return; }
        N.onAuth(function (next) {
            if (!next || !user || next.uid !== user.uid || next.anon) { cleanup(); profile = null; activeDay = null; scene = 'notice'; }
            user = next; failed = false; clearTimeout(loadingTimer); refresh();
            if (user && !user.anon && !profile) loadingTimer = setTimeout(function () { if (!profile) { failed = true; paint(); } }, 8000);
        });
        window.CloudSync.onProfile(function (data, uid) {
            if (!user || user.anon || uid !== user.uid) return;
            profile = data; failed = false; clearTimeout(loadingTimer); refresh();
        });
    }
    el('birthday-start').addEventListener('click', startCake);
    el('birthday-read-again').addEventListener('click', function () { cancelCompletion(); if (cake) cake.destroy(); cake = null; scene = 'notice'; paint(); });
    el('birthday-sign-in').addEventListener('click', function () {
        this.disabled = true;
        Promise.resolve(window.ArcadeNet.signInGoogle()).catch(function () { failed = true; paint(); }).finally(function () { el('birthday-sign-in').disabled = false; });
    });
    el('birthday-retry').addEventListener('click', function () { location.reload(); });
    el('birthday-player-photo').addEventListener('error', function () { this.hidden = true; });
    // Keep the standalone page's iOS double-tap guard in sync with js/arcade.js.
    (function () {
        var lastT = 0, lastX = 0, lastY = 0;
        document.addEventListener('touchend', function (event) {
            if (event.changedTouches.length !== 1) { lastT = 0; return; }
            var touch = event.changedTouches[0], now = Date.now();
            var near = Math.abs(touch.clientX - lastX) < 40 && Math.abs(touch.clientY - lastY) < 40;
            if (now - lastT <= 350 && near) {
                event.preventDefault();
                var target = document.elementFromPoint(touch.clientX, touch.clientY);
                if (target) target.dispatchEvent(new MouseEvent('click', {
                    bubbles: true, cancelable: true, view: window, clientX: touch.clientX, clientY: touch.clientY,
                }));
            }
            lastT = now; lastX = touch.clientX; lastY = touch.clientY;
        }, { passive: false });
    })();
    document.querySelectorAll('[data-lang]').forEach(function (button) { button.addEventListener('click', function () {
        locale = button.dataset.lang; try { localStorage.setItem('gamebox:lang', JSON.stringify(locale)); } catch (e) { /* optional preference */ }
        paint();
    }); });
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) { clearTimeout(completionTimer); completionTimer = null; }
        else { refresh(); scheduleCompletion(); }
    });
    window.addEventListener('storage', function (event) {
        if (event.key === 'gamebox:lang') { try { locale = JSON.parse(event.newValue) === 'zh' ? 'zh' : 'en'; } catch (e) { locale = 'en'; } paint(); }
        else if (!event.key || event.key.indexOf('gamebox:birthday:completed:') === 0) paint();
    });
    window.addEventListener('scroll', scheduleScrollCue, { passive: true });
    window.addEventListener('resize', scheduleScrollCue, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleScrollCue, { passive: true });
        window.visualViewport.addEventListener('scroll', scheduleScrollCue, { passive: true });
    }
    if (window.ResizeObserver) {
        scrollCueObserver = new ResizeObserver(scheduleScrollCue);
        scrollCueObserver.observe(document.querySelector('.birthday-app'));
    }
    window.addEventListener('pagehide', function () { cleanup(); clearTimeout(midnight); clearTimeout(loadingTimer); if (scrollCueObserver) scrollCueObserver.disconnect(); });
    window.addEventListener('pageshow', function (event) {
        if (event.persisted) { scene = 'notice'; refresh(); }
        if (scrollCueObserver) scrollCueObserver.observe(document.querySelector('.birthday-app'));
        scheduleScrollCue();
    });
    paint();
    if (window.ArcadeNet) connect(); else window.addEventListener('arcade-net-ready', connect, { once: true });
})();
