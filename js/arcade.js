/**
 * Arcade Games — shared utilities
 *
 * Everything here is intentionally framework-free so it works on
 * GitHub Pages / file:// / `python -m http.server` with no build step.
 *
 * Its sibling shell `js/puzzle.js` exposes `window.PuzzleCommon`; this one
 * exposes `window.ArcadeCommon`. The two are independent, but the shape
 * (storage / i18n / icons / toast helpers) is deliberately similar so a
 * reader who knows one knows the other.
 *
 * The big difference: arcade games are real-time, so instead of the
 * puzzle "shell" (difficulty / size / reveal / hint) this file ships:
 *   - loop   : a fixed-timestep requestAnimationFrame game loop
 *   - input  : keyboard state + edge helpers
 *   - audio  : a tiny WebAudio beep synth (no asset files)
 *   - scores : per-game high-score persistence
 *   - shell  : an idle → playing → paused → over lifecycle + overlay
 */
(function (global) {
    'use strict';

    // -----------------------------------------------------------------
    // localStorage helpers
    // -----------------------------------------------------------------

    const STORAGE_PREFIX = 'arcadeGames';

    function storageKey(...parts) {
        return [STORAGE_PREFIX, ...parts].join(':');
    }

    function readJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (raw == null) return fallback;
            return JSON.parse(raw);
        } catch (e) {
            console.warn('[arcade] readJSON failed for', key, e);
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn('[arcade] writeJSON failed for', key, e);
        }
    }

    // -----------------------------------------------------------------
    // Per-game preferences (mode, difficulty, etc.)
    // -----------------------------------------------------------------

    function getPrefs(game) {
        return readJSON(storageKey('prefs', game), {});
    }

    function setPrefs(game, patch) {
        const current = getPrefs(game);
        const next = Object.assign({}, current, patch);
        writeJSON(storageKey('prefs', game), next);
        return next;
    }

    // -----------------------------------------------------------------
    // High scores
    //
    // Stored per (game, mode). `mode` lets a single game keep separate
    // leaderboards (e.g. '1p' vs '2p', or a difficulty). We keep the
    // best score plus a small ring buffer of recent runs so a launcher
    // badge / stats view can be added later without re-plumbing.
    // -----------------------------------------------------------------

    function scoreKey(game) {
        return storageKey('scores', game);
    }

    function getBest(game, mode) {
        const data = readJSON(scoreKey(game), { best: {}, recent: [] });
        return (data.best && data.best[mode || 'default']) || 0;
    }

    function submitScore(game, mode, score, meta) {
        const m = mode || 'default';
        const data = readJSON(scoreKey(game), { best: {}, recent: [] });
        if (!data.best) data.best = {};
        if (!data.recent) data.recent = [];
        const prev = data.best[m] || 0;
        const isNewBest = score > prev;
        if (isNewBest) data.best[m] = score;
        data.recent.unshift(Object.assign({
            t: Date.now(), mode: m, score,
        }, meta || {}));
        data.recent = data.recent.slice(0, 25);
        writeJSON(scoreKey(game), data);
        return { best: data.best[m] || 0, isNewBest, previous: prev };
    }

    // One-time, cross-player score reset. A game declares a `scoreEpoch` integer
    // (via shell.create); each player's save stamps the epoch it was written
    // under. When the game bumps its epoch (because a mechanics change makes old
    // scores invalid), every returning player's next load sees a mismatch and
    // wipes THAT game's scores exactly once, then stamps the new epoch. Saves
    // from before this system (no epoch) count as stale, so the first bump resets
    // everyone too. `scoreEpoch` left undefined = never auto-reset.
    function resetScoresIfStale(game, epoch) {
        if (epoch == null) return;
        const key = scoreKey(game);
        const data = readJSON(key, null);
        if (data && data.epoch === epoch) return;          // already on this epoch
        writeJSON(key, { best: {}, recent: [], epoch: epoch });
    }

    // High-score cloud sync (per account, across devices) is handled by the shared
    // CloudSync engine in js/cloud-sync.js. The shell just repaints when it swaps
    // accounts / merges, and nudges a sync after a new best (see createShell / gameOver).

    // -----------------------------------------------------------------
    // Math / misc helpers
    // -----------------------------------------------------------------

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    // Format an integer with thousands separators, e.g. 12345 → "12,345".
    function formatScore(n) {
        return Math.round(n).toLocaleString('en-US');
    }

    // -----------------------------------------------------------------
    // PRNG — mulberry32. Small, fast, reproducible from a seed so a
    // "share this run" seed feature can be added later.
    // -----------------------------------------------------------------

    function makeRng(seed) {
        let a = (seed >>> 0) || 1;
        return function () {
            a |= 0;
            a = (a + 0x6d2b79f5) | 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function pickInt(rng, min, maxExclusive) {
        return Math.floor(rng() * (maxExclusive - min)) + min;
    }

    function pickFloat(rng, min, max) {
        return rng() * (max - min) + min;
    }

    function pickOne(rng, arr) {
        return arr[Math.floor(rng() * arr.length)];
    }

    function shuffleInPlace(arr, rng) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
    }

    // -----------------------------------------------------------------
    // Icons — a tiny self-contained subset of Lucide (lucide.dev, ISC).
    // Kept inline so the site stays dependency-free / offline-capable.
    // Each entry is the inner markup of a 24×24 stroke icon; `icon(name)`
    // wraps it in an <svg> that inherits colour via `stroke: currentColor`
    // and scales with font-size (1em). `renderIcons(root)` fills every
    // `[data-icon]` placeholder.
    // -----------------------------------------------------------------

    const ICONS = {
        'arrow-left':
            '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
        pause:
            '<rect x="14" y="4" width="4" height="16" rx="1"/>'
            + '<rect x="6" y="4" width="4" height="16" rx="1"/>',
        'rotate-ccw':
            '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>'
            + '<path d="M3 3v5h5"/>',
        trophy:
            '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>'
            + '<path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>'
            + '<path d="M4 22h16"/>'
            + '<path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>'
            + '<path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>'
            + '<path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
        'gamepad-2':
            '<line x1="6" x2="10" y1="11" y2="11"/>'
            + '<line x1="8" x2="8" y1="9" y2="13"/>'
            + '<line x1="15" x2="15.01" y1="12" y2="12"/>'
            + '<line x1="18" x2="18.01" y1="10" y2="10"/>'
            + '<path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>',
        zap:
            '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
        target:
            '<circle cx="12" cy="12" r="10"/>'
            + '<circle cx="12" cy="12" r="6"/>'
            + '<circle cx="12" cy="12" r="2"/>',
        clock:
            '<circle cx="12" cy="12" r="10"/>'
            + '<polyline points="12 6 12 12 16 14"/>',
        coins:
            '<circle cx="8" cy="8" r="6"/>'
            + '<path d="M18.09 10.37A6 6 0 1 1 10.34 18"/>'
            + '<path d="M7 6h1v4"/>'
            + '<path d="m16.71 13.88.7.71-2.82 2.82"/>',
        heart:
            '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
        ladder:
            '<path d="M8 3v18"/><path d="M16 3v18"/>'
            + '<path d="M8 8h8"/><path d="M8 13h8"/><path d="M8 18h8"/>',
        swords:
            '<path d="m13 19 6-6"/>'
            + '<path d="M14.5 17.5 3.586 6.586A2 2 0 0 1 3 5.172V3h2.172a2 2 0 0 1 1.414.586L17.5 14.5"/>'
            + '<path d="m14.828 6.172 2.586-2.586A2 2 0 0 1 18.828 3H21v2.172a2 2 0 0 1-.586 1.414l-2.586 2.586"/>'
            + '<path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="m5 14 4 4"/><path d="m5 21-2-2"/><path d="M7.5 16.5 4 20"/>',
        // a single sword (lucide) — marks the solo "Sandbag" mode toggle
        sword:
            '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/>'
            + '<line x1="13" x2="19" y1="19" y2="13"/>'
            + '<line x1="16" x2="20" y1="16" y2="20"/>'
            + '<line x1="19" x2="21" y1="21" y2="19"/>',
        // lucide "stone" — the Rune Stones brand mark (menu card + in-game)
        stone:
            '<path d="M11.264 2.205A4 4 0 0 0 6.42 4.211l-4 8a4 4 0 0 0 1.359 5.117l6 4a4 4 0 0 0 4.438 0l6-4a4 4 0 0 0 1.576-4.592l-2-6a4 4 0 0 0-2.53-2.53z"/>'
            + '<path d="M11.99 22 14 12l7.822 3.184"/>'
            + '<path d="M14 12 8.47 2.302"/>',
        // two people (lucide) — the online PvP button
        users:
            '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>'
            + '<circle cx="9" cy="7" r="4"/>'
            + '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/>'
            + '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        skull:
            '<circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>'
            + '<path d="M8 20v2h8v-2"/>'
            + '<path d="m12.5 17-.5-1-.5 1h1z"/>'
            + '<path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/>',
        'volume-2':
            '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>'
            + '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>'
            + '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
        'volume-x':
            '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>'
            + '<line x1="22" x2="16" y1="9" y2="15"/>'
            + '<line x1="16" x2="22" y1="9" y2="15"/>',
        // the two Beam mirror glyphs — a "/" and a "\" drawn like the board pieces
        'mirror-slash':
            '<line x1="6" x2="18" y1="18" y2="6"/>',
        'mirror-back':
            '<line x1="6" x2="18" y1="6" y2="18"/>',
    };

    function icon(name, opts) {
        const inner = ICONS[name];
        if (!inner) return null;
        const cls = 'icon' + (opts && opts.className ? ' ' + opts.className : '');
        const markup = `<svg class="${cls}" viewBox="0 0 24 24"`
            + ' width="1em" height="1em" fill="none" stroke="currentColor"'
            + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
            + ' aria-hidden="true">' + inner + '</svg>';
        const tmp = document.createElement('div');
        tmp.innerHTML = markup;
        return tmp.firstElementChild;
    }

    function renderIcons(root) {
        const scope = root || document;
        const nodes = scope.querySelectorAll('[data-icon]');
        for (const node of nodes) {
            if (node.getAttribute('data-icon-done') === '1') continue;
            const svg = icon(node.getAttribute('data-icon'));
            if (!svg) continue;
            node.insertBefore(svg, node.firstChild);
            node.setAttribute('data-icon-done', '1');
        }
    }

    // -----------------------------------------------------------------
    // i18n
    //
    // English is the active default; users flip to 'zh' via the
    // lang-toggle. The choice persists to localStorage. Games extend the
    // table by mutating AC.i18n.STRINGS[loc] before bootstrap fires.
    //
    // `data-i18n="key"` sets textContent; keys ending in `Html` set
    // innerHTML; `data-i18n-title` / `data-i18n-aria-label` handle those
    // attributes. Anything dynamic subscribes via AC.i18n.subscribe(cb).
    // -----------------------------------------------------------------

    const STRINGS = {
        en: {
            // Shared chrome
            menu: 'Menu',
            language: 'Language',
            play: 'Play',
            start: 'Start',
            pause: 'Pause',
            resume: 'Resume',
            restart: 'Restart',
            paused: 'Paused',
            sound: 'Sound',
            soundOn: 'Sound on',
            soundOff: 'Sound off',
            score: 'Score',
            best: 'Best',
            time: 'Time',
            lives: 'Lives',
            difficulty: 'Difficulty',
            howToPlay: 'How to play',
            newBest: 'New best!',
            gameOver: 'Game Over',
            youWin: 'You Win!',

            // In-game titles only. Keys keep the games' old names; renaming them
            // would mean touching each game's HTML/JS too, so they stay as-is.
            ladderConnectName: 'Colour Ladder',
            dotDodgeName: 'Bullet Storm',
            runeClashName: 'Rune Stones',
        },
        zh: {
            menu: '選單',
            language: '語言',
            play: '開始遊玩',
            start: '開始',
            pause: '暫停',
            resume: '繼續',
            restart: '重新開始',
            paused: '已暫停',
            sound: '音效',
            soundOn: '音效開啟',
            soundOff: '音效關閉',
            score: '分數',
            best: '最佳',
            time: '時間',
            lives: '生命',
            difficulty: '難度',
            howToPlay: '遊玩方式',
            newBest: '新紀錄！',
            gameOver: '遊戲結束',
            youWin: '你贏了！',

            ladderConnectName: '彩球梯',
            dotDodgeName: '彈幕風暴',
            runeClashName: '盧恩符石',
        },
    };

    const LANG_KEY = 'gamebox:lang';   // shared with the GameBox launcher + the puzzle shell so the language carries across
    const LANG_SUPPORTED = ['en', 'zh'];
    const localeSubscribers = new Set();
    let currentLocale = readJSON(LANG_KEY, 'en');
    if (!LANG_SUPPORTED.includes(currentLocale)) currentLocale = 'en';

    function tForLocale(loc, key, ...args) {
        const table = STRINGS[loc] || STRINGS.en;
        let entry = table[key];
        if (entry == null) entry = STRINGS.en[key];
        if (entry == null) return key;
        return typeof entry === 'function' ? entry(...args) : entry;
    }

    function t(key, ...args) {
        return tForLocale(currentLocale, key, ...args);
    }

    function translateNode(rootEl) {
        if (!rootEl) return;
        const isHtmlKey = (key) => /Html$/.test(key);
        for (const node of rootEl.querySelectorAll('[data-i18n]')) {
            const key = node.getAttribute('data-i18n');
            const text = t(key);
            if (isHtmlKey(key)) node.innerHTML = text;
            else node.textContent = text;
        }
        for (const node of rootEl.querySelectorAll('[data-i18n-title]')) {
            node.setAttribute('title', t(node.getAttribute('data-i18n-title')));
        }
        for (const node of rootEl.querySelectorAll('[data-i18n-aria-label]')) {
            node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria-label')));
        }
        // HTML i18n strings can embed [data-icon] placeholders, so
        // re-render icons after a translate wipes them.
        renderIcons(rootEl);
    }

    function setLocale(newLoc) {
        if (!LANG_SUPPORTED.includes(newLoc)) return;
        if (newLoc === currentLocale) return;
        currentLocale = newLoc;
        writeJSON(LANG_KEY, currentLocale);
        document.documentElement.lang = currentLocale === 'zh' ? 'zh-Hant' : 'en';
        translateNode(document);
        syncLangToggle();
        for (const cb of localeSubscribers) {
            try { cb(currentLocale); } catch (e) { console.warn('[i18n] subscriber threw', e); }
        }
    }

    function subscribe(cb) {
        localeSubscribers.add(cb);
        return () => localeSubscribers.delete(cb);
    }

    function syncLangToggle() {
        const tog = document.getElementById('lang-toggle');
        if (!tog) return;
        for (const btn of tog.querySelectorAll('button[data-lang]')) {
            const isActive = btn.dataset.lang === currentLocale;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
        }
    }

    function wireLangToggle() {
        const tog = document.getElementById('lang-toggle');
        if (!tog) return;
        tog.addEventListener('click', (ev) => {
            const btn = ev.target.closest('button[data-lang]');
            if (!btn) return;
            setLocale(btn.dataset.lang);
        });
        syncLangToggle();
    }

    // A global sound on/off toggle, injected beside the language toggle so BOTH game
    // templates put it in the same place. It flips the shared `gamebox:muted`
    // preference, silencing every game. (Arcade's old in-HUD sound button is hidden.)
    function wireSoundToggle() {
        const tog = document.getElementById('lang-toggle');
        if (!tog || !tog.parentNode || document.getElementById('sound-toggle')) return;
        const btn = document.createElement('button');
        btn.id = 'sound-toggle'; btn.type = 'button'; btn.className = 'sound-toggle';
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path class="wave" d="M15.5 8.5a5 5 0 0 1 0 7"/><path class="wave" d="M18.5 5.5a9 9 0 0 1 0 13"/><path class="off" d="m23 9-6 6"/><path class="off" d="m17 9 6 6"/></svg>';
        function sync() {
            const m = audio.isMuted();
            btn.classList.toggle('is-muted', m);
            btn.setAttribute('aria-pressed', m ? 'false' : 'true');
            btn.setAttribute('title', t(m ? 'soundOff' : 'soundOn'));
        }
        btn.addEventListener('click', () => { audio.unlock(); audio.toggleMuted(); sync(); });
        // Wrap the toggle + language control in one right-side group so adding the
        // toggle keeps the topbar's three-item balance (the title stays put).
        const group = document.createElement('div');
        group.className = 'topbar-actions';
        tog.parentNode.insertBefore(group, tog);
        group.appendChild(btn);
        group.appendChild(tog);
        sync();
        subscribe(sync);
    }

    function bootstrapI18n() {
        document.documentElement.lang = currentLocale === 'zh' ? 'zh-Hant' : 'en';
        translateNode(document); // also renders [data-icon] placeholders
        wireLangToggle();
        wireSoundToggle();
    }

    // -----------------------------------------------------------------
    // Toast — a single shared bottom-centre pill for transient notices.
    // -----------------------------------------------------------------

    const toast = (function () {
        let node = null;
        let hideTimer = null;

        function ensureEl() {
            if (node) return node;
            node = document.createElement('div');
            node.className = 'toast';
            node.setAttribute('role', 'status');
            node.setAttribute('aria-live', 'polite');
            document.body.appendChild(node);
            return node;
        }

        function show(text, ms) {
            const n = ensureEl();
            n.textContent = text || '';
            n.classList.remove('toast-visible');
            void n.offsetWidth;
            n.classList.add('toast-visible');
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                n.classList.remove('toast-visible');
            }, ms || 1800);
        }

        return { show };
    })();

    // -----------------------------------------------------------------
    // Input — keyboard state + edge detection
    //
    // A single window-level listener records which keys are currently
    // held (for continuous controls) and dispatches "pressed" callbacks
    // on the leading edge (for discrete actions). Games register a set
    // of keys they care about so browser defaults (space scrolling,
    // arrow scrolling) are prevented only for those.
    // -----------------------------------------------------------------

    function createKeyboard(opts) {
        const options = opts || {};
        const prevent = new Set(options.prevent || []);
        const held = new Set();
        const pressHandlers = [];
        let enabled = true;

        function norm(e) {
            // Normalise: use `key` but map Space consistently.
            return e.key === ' ' ? 'Space' : e.key;
        }

        function onKeyDown(e) {
            const k = norm(e);
            if (prevent.has(k) || prevent.has(e.code)) e.preventDefault();
            if (!enabled) return;
            const already = held.has(k);
            held.add(k);
            if (!already) {
                for (const h of pressHandlers) {
                    try { h(k, e); } catch (err) { console.warn('[input] press handler threw', err); }
                }
            }
        }

        function onKeyUp(e) {
            held.delete(norm(e));
        }

        function onBlur() { held.clear(); }

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);

        return {
            isDown(...keys) { return keys.some((k) => held.has(k)); },
            onPress(handler) { pressHandlers.push(handler); return this; },
            setEnabled(v) { enabled = v; if (!v) held.clear(); },
            clear() { held.clear(); },
            destroy() {
                window.removeEventListener('keydown', onKeyDown);
                window.removeEventListener('keyup', onKeyUp);
                window.removeEventListener('blur', onBlur);
            },
        };
    }

    // -----------------------------------------------------------------
    // Loop — fixed-timestep game loop on requestAnimationFrame
    //
    // update(dt) is called with a fixed dt (default 1/60 s) as many
    // times as needed to catch up (accumulator pattern), so game
    // physics stay deterministic regardless of display refresh rate.
    // render(alpha) is called once per frame; `alpha` is the leftover
    // interpolation fraction for games that want smooth rendering.
    // A large tab-switch gap is clamped so the sim never spirals.
    // -----------------------------------------------------------------

    function createLoop(opts) {
        const step = (opts && opts.step) || (1 / 60);
        const maxFrame = (opts && opts.maxFrame) || 0.25; // clamp big gaps
        const update = (opts && opts.update) || function () {};
        const render = (opts && opts.render) || function () {};

        let rafId = null;
        let running = false;
        let last = 0;
        let acc = 0;

        function frame(now) {
            if (!running) return;
            const nowSec = now / 1000;
            let delta = nowSec - last;
            last = nowSec;
            if (delta > maxFrame) delta = maxFrame;
            acc += delta;
            let guard = 0;
            while (acc >= step) {
                update(step);
                acc -= step;
                if (++guard > 300) { acc = 0; break; } // safety valve
            }
            render(acc / step);
            rafId = requestAnimationFrame(frame);
        }

        return {
            start() {
                if (running) return;
                running = true;
                last = performance.now() / 1000;
                acc = 0;
                rafId = requestAnimationFrame(frame);
            },
            stop() {
                running = false;
                if (rafId != null) cancelAnimationFrame(rafId);
                rafId = null;
            },
            isRunning() { return running; },
        };
    }

    // -----------------------------------------------------------------
    // Audio — a minimal WebAudio blip synth (no asset files)
    //
    // The AudioContext is created lazily on the first play() (which the
    // shell calls from a user gesture, satisfying autoplay policies).
    // Each sound is a short oscillator + gain envelope. Mute state
    // persists per-collection so it's remembered across games.
    // -----------------------------------------------------------------

    const audio = (function () {
        let ctx = null;
        const MUTE_KEY = 'gamebox:muted';   // shared across all games so one toggle silences everything
        let muted = readJSON(MUTE_KEY, false) === true;

        function ensureCtx() {
            if (ctx) return ctx;
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            try { ctx = new AC(); } catch (e) { ctx = null; }
            return ctx;
        }

        // Play one tone. freq in Hz, dur in seconds.
        // Optional opts (all default to the old plain blip): `attack` (ramp-up s),
        // `detune` (cents for a thicker second oscillator), `filter` ({ type, freq, to }
        // sweeps a low/high-pass over the note — softer or airier timbres).
        function tone(freq, dur, opts) {
            if (muted) return;
            const c = ensureCtx();
            if (!c) return;
            if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
            const o = opts || {};
            const now = c.currentTime;
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = o.type || 'square';
            osc.frequency.setValueAtTime(freq, now);
            if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), now + dur);
            const vol = (o.volume != null ? o.volume : 0.16);
            const atk = (o.attack != null ? o.attack : 0.008);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(vol, now + atk);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
            gain.connect(c.destination);
            let entry = gain;
            if (o.filter) {
                const f = c.createBiquadFilter();
                f.type = o.filter.type || 'lowpass';
                f.frequency.setValueAtTime(o.filter.freq || 1200, now);
                if (o.filter.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.filter.to), now + dur);
                f.connect(gain); entry = f;
            }
            osc.connect(entry);
            osc.start(now); osc.stop(now + dur + 0.02);
            if (o.detune) {
                const osc2 = c.createOscillator();
                osc2.type = osc.type;
                osc2.detune.setValueAtTime(o.detune, now);
                osc2.frequency.setValueAtTime(freq, now);
                if (o.slideTo) osc2.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), now + dur);
                osc2.connect(entry);
                osc2.start(now); osc2.stop(now + dur + 0.02);
            }
        }

        // A short filtered noise burst — for impacts, whooshes and air. Same mute/ctx
        // rules as tone(). opts: `volume`, `attack`, `filter` ({ type, freq, to } sweep).
        function noise(dur, opts) {
            if (muted) return;
            const c = ensureCtx();
            if (!c) return;
            if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
            const o = opts || {};
            const now = c.currentTime;
            const len = Math.max(1, Math.floor(c.sampleRate * dur));
            const buf = c.createBuffer(1, len, c.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
            const src = c.createBufferSource(); src.buffer = buf;
            const gain = c.createGain();
            const vol = (o.volume != null ? o.volume : 0.12);
            const atk = (o.attack != null ? o.attack : 0.004);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(vol, now + atk);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
            gain.connect(c.destination);
            let entry = gain;
            if (o.filter) {
                const f = c.createBiquadFilter();
                f.type = o.filter.type || 'lowpass';
                f.frequency.setValueAtTime(o.filter.freq || 2000, now);
                if (o.filter.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.filter.to), now + dur);
                f.connect(gain); entry = f;
            }
            src.connect(entry);
            src.start(now); src.stop(now + dur + 0.02);
        }

        // A small palette of blips used by the shell itself (button click +
        // end-of-run jingles). Per-game SFX use audio.tone/noise directly.
        const SFX = {
            levelup:  () => { [523, 659, 784, 1046].forEach((f, i) =>
                              setTimeout(() => tone(f, 0.16, { type: 'square', volume: 0.14 }), i * 90)); },
            gameover: () => { [440, 330, 262].forEach((f, i) =>
                              setTimeout(() => tone(f, 0.28, { type: 'triangle', volume: 0.16 }), i * 160)); },
            click:    () => tone(660, 0.05, { type: 'square', volume: 0.10 }),
        };

        return {
            play(name) {
                const fn = SFX[name];
                if (fn) fn();
            },
            tone,
            noise,
            unlock() {
                const c = ensureCtx();
                if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} }
            },
            isMuted() { return muted; },
            setMuted(v) {
                muted = !!v;
                writeJSON(MUTE_KEY, muted);
            },
            toggleMuted() { this.setMuted(!muted); return muted; },
        };
    })();

    // -----------------------------------------------------------------
    // Shell — arcade lifecycle + overlay + HUD glue
    //
    // Owns the state machine (idle → playing → paused → over), the
    // fixed-timestep loop, the start/pause/over overlay panel, and the
    // Pause / Restart / Sound buttons. The game supplies update(dt) /
    // render() / reset() and drives its own HUD; when the run ends it
    // calls shell.gameOver({ score, win }).
    //
    // Expected DOM ids on the page (all optional but recommended):
    //   #overlay #overlay-badge #overlay-title #overlay-message
    //   #overlay-btn #overlay-hint
    //   #pause-btn #restart-btn #sound-btn #best
    //
    // Config:
    //   gameId       string, namespaces prefs/scores
    //   mode()       -> string, current leaderboard bucket (optional)
    //   step         fixed timestep seconds (default 1/60)
    //   preventKeys  keys whose browser default should be suppressed
    //   update(dt)   advance the sim one step (only while playing)
    //   render()     paint a frame (called every frame while playing)
    //   reset()      set up a fresh run (called right before playing)
    //   onStart()    fired after reset when a run begins
    //   onPause() / onResume()
    //   onGameOver(result)
    //   overlayContent(state, result) -> { badge, title, message, button, hint }
    //
    // Returned object:
    //   shell.state           'idle' | 'playing' | 'paused' | 'over'
    //   shell.isPlaying()
    //   shell.keyboard        the shared ArcadeCommon keyboard instance
    //   shell.start()         begin a fresh run
    //   shell.togglePause()
    //   shell.gameOver(result)
    //   shell.refreshBest()   repaint the #best HUD readout
    // -----------------------------------------------------------------

    function createShell(opts) {
        const gameId = opts.gameId;
        const modeFn = opts.mode || (() => 'default');
        const update = opts.update || function () {};
        const render = opts.render || function () {};
        const reset = opts.reset || function () {};
        // When true, Restart (button / R) returns to the ready overlay
        // instead of launching straight into a new run.
        const restartToReady = !!opts.restartToReady;

        const dom = {
            overlay: document.getElementById('overlay'),
            overlayBadge: document.getElementById('overlay-badge'),
            overlayTitle: document.getElementById('overlay-title'),
            overlayMessage: document.getElementById('overlay-message'),
            overlayBtn: document.getElementById('overlay-btn'),
            overlayHint: document.getElementById('overlay-hint'),
            pauseBtn: document.getElementById('pause-btn'),
            restartBtn: document.getElementById('restart-btn'),
            soundBtn: document.getElementById('sound-btn'),
            best: document.getElementById('best'),
        };

        let state = 'idle';
        let lastResult = null;

        const keyboard = createKeyboard({
            prevent: opts.preventKeys || ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
        });

        const loop = createLoop({
            step: opts.step || (1 / 60),
            update: (dt) => { if (state === 'playing') update(dt); },
            render: (alpha) => { render(alpha); },
        });

        const shell = {
            keyboard,
            get state() { return state; },
            isPlaying() { return state === 'playing'; },
        };

        // ---------- overlay ----------

        function defaultOverlay(st, result) {
            if (st === 'idle') {
                return {
                    badge: 'gamepad-2',
                    title: t('play'),
                    message: '',
                    button: t('start'),
                    hint: '',
                };
            }
            if (st === 'paused') {
                return {
                    badge: 'pause',
                    title: t('paused'),
                    message: '',
                    button: t('resume'),
                    hint: '',
                };
            }
            // over
            const win = result && result.win;
            return {
                badge: win ? 'trophy' : 'skull',
                title: win ? t('youWin') : t('gameOver'),
                message: '',
                button: t('restart'),
                hint: '',
            };
        }

        function showOverlay(st, result) {
            if (!dom.overlay) return;
            const src = opts.overlayContent
                ? Object.assign(defaultOverlay(st, result),
                    opts.overlayContent(st, result) || {})
                : defaultOverlay(st, result);
            if (dom.overlayBadge) {
                dom.overlayBadge.innerHTML = '';
                const ic = icon(src.badge || 'gamepad-2');
                if (ic) dom.overlayBadge.appendChild(ic);
            }
            if (dom.overlayTitle) dom.overlayTitle.textContent = src.title || '';
            if (dom.overlayMessage) {
                dom.overlayMessage.innerHTML = src.message || '';
                dom.overlayMessage.hidden = !src.message;
            }
            if (dom.overlayBtn) dom.overlayBtn.textContent = src.button || t('start');
            if (dom.overlayHint) {
                dom.overlayHint.innerHTML = src.hint || '';
                dom.overlayHint.hidden = !src.hint;
            }
            dom.overlay.hidden = false;
        }

        function hideOverlay() {
            if (dom.overlay) dom.overlay.hidden = true;
        }

        // ---------- lifecycle ----------

        function start() {
            audio.unlock();
            lastResult = null;
            // With restartToReady the idle "ready" screen already shows a
            // prepared, frozen scene — play that exact one. (From 'over',
            // i.e. play-again, build a fresh scene.)
            if (!(restartToReady && state === 'idle')) reset();
            state = 'playing';
            hideOverlay();
            syncButtons();
            if (typeof opts.onStart === 'function') opts.onStart();
            loop.start();
        }

        // Return to the ready/idle screen (fresh board behind the overlay)
        // instead of launching straight into play. Used by Restart when the
        // game sets restartToReady.
        function goIdle() {
            loop.stop();
            reset();
            state = 'idle';
            render(0);
            showOverlay('idle');
            syncButtons();
        }

        function pause() {
            if (state !== 'playing') return;
            if (opts.canPause && !opts.canPause()) return;   // e.g. no pausing during online PvP
            state = 'paused';
            loop.stop();
            if (typeof opts.onPause === 'function') opts.onPause();
            showOverlay('paused');
            syncButtons();
        }

        function resume() {
            if (state !== 'paused') return;
            audio.unlock();
            state = 'playing';
            hideOverlay();
            if (typeof opts.onResume === 'function') opts.onResume();
            loop.start();
            syncButtons();
        }

        function togglePause() {
            if (state === 'playing') pause();
            else if (state === 'paused') resume();
        }

        function gameOver(result) {
            if (state !== 'playing' && state !== 'paused') return;
            state = 'over';
            loop.stop();
            lastResult = result || {};
            // Persist the score to the high-score table.
            const score = lastResult.score || 0;
            const rec = submitScore(gameId, modeFn(), score, lastResult.meta);
            lastResult.best = rec.best;
            lastResult.isNewBest = rec.isNewBest;
            refreshBest();
            if (rec.isNewBest && window.CloudSync) window.CloudSync.sync();   // mirror the new best to the cloud profile
            if (typeof opts.onGameOver === 'function') opts.onGameOver(lastResult);
            audio.play(lastResult.win ? 'levelup' : 'gameover');
            showOverlay('over', lastResult);
            syncButtons();
        }

        function refreshBest() {
            if (dom.best) dom.best.textContent = formatScore(getBest(gameId, modeFn()));
        }

        // ---------- buttons ----------

        function syncButtons() {
            if (dom.pauseBtn) {
                const canPause = (state === 'playing' || state === 'paused') && (opts.canPause ? opts.canPause() : true);
                dom.pauseBtn.disabled = !canPause;
                const label = dom.pauseBtn.querySelector('[data-role="pause-label"]');
                if (label) label.textContent = state === 'paused' ? t('resume') : t('pause');
            }
            if (dom.restartBtn) {
                dom.restartBtn.disabled = state === 'idle' || (opts.canRestart ? !opts.canRestart() : false);
            }
        }

        function syncSoundBtn() {
            if (!dom.soundBtn) return;
            const muted = audio.isMuted();
            dom.soundBtn.classList.toggle('is-muted', muted);
            dom.soundBtn.setAttribute('aria-pressed', muted ? 'false' : 'true');
            dom.soundBtn.setAttribute('title', t(muted ? 'soundOff' : 'soundOn'));
            const ic = dom.soundBtn.querySelector('[data-role="sound-icon"]');
            if (ic) {
                ic.innerHTML = '';
                ic.setAttribute('data-icon-done', '0');
                const svg = icon(muted ? 'volume-x' : 'volume-2');
                if (svg) ic.appendChild(svg);
            }
        }

        if (dom.overlayBtn) {
            dom.overlayBtn.addEventListener('click', () => {
                audio.play('click');
                if (state === 'idle' || state === 'over') start();
                else if (state === 'paused') resume();
            });
        }
        if (dom.pauseBtn) {
            dom.pauseBtn.addEventListener('click', () => { audio.play('click'); togglePause(); });
        }
        if (dom.restartBtn) {
            dom.restartBtn.addEventListener('click', () => {
                if (opts.canRestart && !opts.canRestart()) return;
                audio.play('click');
                restartToReady ? goIdle() : start();
            });
        }
        if (dom.soundBtn) {
            dom.soundBtn.hidden = true;   // retired: the sound toggle now lives in the topbar, beside the language toggle
            dom.soundBtn.addEventListener('click', () => {
                audio.toggleMuted();
                syncSoundBtn();
                if (!audio.isMuted()) audio.play('click');
            });
        }

        // Global keyboard shortcuts (game-agnostic). The game's own key
        // handling runs independently and checks shell.isPlaying().
        keyboard.onPress((k) => {
            if ((k === 'Space' || k === 'Enter') && (state === 'idle' || state === 'over')) {
                start();
                return;
            }
            if (k === 'Escape' || k === 'p' || k === 'P') {
                togglePause();
                return;
            }
            if (k === 'r' || k === 'R') {
                if (opts.canRestart && !opts.canRestart()) return;
                if (state !== 'idle') (restartToReady ? goIdle() : start());
                return;
            }
            if (k === 'm' || k === 'M') {
                audio.toggleMuted();
                syncSoundBtn();
            }
        });

        // Auto-pause when the tab loses focus mid-game.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && state === 'playing') pause();
        });

        // iOS Safari doesn't reliably honour CSS `touch-action` for double-tap-to-
        // zoom (it ignores it on <canvas>/<svg>), so a quick double-tap on the stage
        // or a HUD/overlay button can still zoom the page. Suppress it in JS: cancel
        // the quick second touchend (kills the zoom + its synthesised click) and
        // re-dispatch a click so buttons still fire. The canvas games act on pointer
        // events, so the synthetic click is a harmless no-op there.
        // Keep in sync with the equivalent guard in js/puzzle.js — see
        // docs/CONVENTIONS.md ("iOS double-tap-to-zoom").
        (function () {
            let lastT = 0, lastX = 0, lastY = 0;
            document.addEventListener('touchend', (e) => {
                if (e.changedTouches.length !== 1) { lastT = 0; return; }
                const tp = e.changedTouches[0];
                const now = Date.now();
                const near = Math.abs(tp.clientX - lastX) < 40 && Math.abs(tp.clientY - lastY) < 40;
                if (now - lastT <= 350 && near) {
                    e.preventDefault();
                    const el = document.elementFromPoint(tp.clientX, tp.clientY);
                    if (el) {
                        el.dispatchEvent(new MouseEvent('click', {
                            bubbles: true, cancelable: true, view: window,
                            clientX: tp.clientX, clientY: tp.clientY,
                        }));
                    }
                }
                lastT = now; lastX = tp.clientX; lastY = tp.clientY;
            }, { passive: false });
        })();

        // React to locale changes: re-show whatever panel is up so its
        // text re-localises, and refresh the button labels.
        subscribe(() => {
            if (state === 'idle') showOverlay('idle');
            else if (state === 'paused') showOverlay('paused');
            else if (state === 'over') showOverlay('over', lastResult);
            syncButtons();
            syncSoundBtn();
        });

        // ---------- boot ----------

        resetScoresIfStale(gameId, opts.scoreEpoch);   // one-time wipe if the game bumped its epoch
        refreshBest();

        // Repaint the Best readout whenever CloudSync swaps accounts or merges cloud data.
        // Then re-pull: CloudSync's first sync can land before this shell exists (net.js is
        // deferred) — its repaint is lost and, for games with a scoreEpoch, the cloud best it
        // wrote can be wiped by resetScoresIfStale above. Syncing again now (epoch stamped,
        // listener registered) re-applies the cloud best. No-op for guests.
        if (window.CloudSync) { window.CloudSync.onApplied(refreshBest); window.CloudSync.sync(); }
        syncButtons();
        syncSoundBtn();
        showOverlay('idle');

        shell.start = start;
        shell.pause = pause;
        shell.resume = resume;
        shell.togglePause = togglePause;
        shell.gameOver = gameOver;
        shell.goIdle = goIdle;             // return to the ready screen (stops the loop, re-shows idle overlay)
        shell.refreshBest = refreshBest;
        shell.syncButtons = syncButtons;   // let games refresh pause/restart enablement (e.g. online start/end)
        // Re-paint the overlay for the CURRENT state. A game calls this after
        // changing something the overlay text depends on while not actively
        // playing (e.g. switching mode on the ready screen) so the panel's
        // message/hint stay in sync with the staged choice.
        shell.refreshOverlay = function () {
            if (state === 'idle') showOverlay('idle');
            else if (state === 'paused') showOverlay('paused');
            else if (state === 'over') showOverlay('over', lastResult);
        };

        return shell;
    }

    // -----------------------------------------------------------------
    // Boot i18n once the DOM is ready.
    // -----------------------------------------------------------------

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapI18n);
    } else {
        bootstrapI18n();
    }

    // -----------------------------------------------------------------
    // Public surface
    // -----------------------------------------------------------------

    global.ArcadeCommon = {
        storage: { readJSON, writeJSON, storageKey },
        prefs: { get: getPrefs, set: setPrefs },
        scores: { best: getBest, submit: submitScore, resetIfStale: resetScoresIfStale },
        rng: { make: makeRng, int: pickInt, float: pickFloat, one: pickOne, shuffle: shuffleInPlace },
        math: { clamp },
        format: { score: formatScore },
        icon,
        icons: { render: renderIcons },
        i18n: {
            get locale() { return currentLocale; },
            setLocale,
            t,
            tForLocale,
            subscribe,
            translateNode,
            STRINGS,
        },
        toast,
        input: { keyboard: createKeyboard },
        loop: { create: createLoop },
        audio,
        shell: { create: createShell },
    };
})(window);
