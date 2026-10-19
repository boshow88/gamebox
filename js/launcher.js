/**
 * GameBox — unified launcher.
 *
 * Framework-free, no build step (matches the two game collections it hosts).
 * Everything is data-driven: each game is one entry in GAMES with a `tags`
 * array, and the launcher renders cards + a tag filter bar from that list.
 * The arcade / puzzle split is NOT a user-facing category — it only decides
 * which sub-folder a game lives in (and, inside the game, which theme it uses).
 *
 * Adding a game = append one entry to GAMES (+ its strings). Nothing else here
 * needs editing, so two people can add different games with minimal conflict.
 */
(function () {
    'use strict';

    // ---------------------------------------------------------------
    // Tag taxonomy. `order` fixes the chip order. A tag with zero games
    // is automatically hidden from the filter bar (see renderFilter), so
    // "casual" / "progression" stay defined here for future games without
    // showing an empty category today.
    // ---------------------------------------------------------------
    var TAGS = [
        { id: 'puzzle',      order: 1 },
        { id: 'action',      order: 2 },
        { id: 'casual',      order: 3 },
        { id: 'progression', order: 4 },
        { id: 'timeattack',  order: 5 },
        { id: 'single',      order: 6 },
        { id: 'multi',       order: 7 },
    ];

    // ---------------------------------------------------------------
    // Games. `href` is relative to this launcher. `theme` is informational
    // only (which collection / palette the game itself uses).
    // ---------------------------------------------------------------
    var GAMES = [
        {
            id: 'rune-stones', theme: 'arcade', icon: 'stone', color: '#86cfc6',
            href: './games/rune-stones.html',
            tags: ['puzzle', 'timeattack', 'single', 'multi'],
        },
        {
            id: 'colour-ladder', theme: 'arcade', icon: 'ladder', color: '#f472b6',
            href: './games/colour-ladder.html',
            tags: ['action', 'single'],
        },
        {
            id: 'bullet-storm', theme: 'arcade', icon: 'target', color: '#a78bfa',
            href: './games/bullet-storm.html',
            tags: ['action', 'single'],
        },
        {
            id: 'beam', theme: 'arcade', icon: 'zap', color: '#22d3ee',
            href: './games/beam.html',
            tags: ['timeattack', 'single', 'multi'],
        },
        {
            id: 'carom', theme: 'arcade', icon: 'soccer', color: '#10b981', wip: true,
            href: './games/carom.html',
            tags: ['action', 'multi'],
        },
        {
            id: 'patches', theme: 'puzzle', icon: 'layout-template-ccw', color: '#e5484d',
            href: './games/patches.html',
            tags: ['puzzle', 'single'],
        },
        {
            id: 'hashi', theme: 'puzzle', icon: 'graph-star', color: '#8a5a2c',
            href: './games/hashi.html',
            tags: ['puzzle', 'single'],
        },
        {
            id: 'tango', theme: 'puzzle', icon: 'sun-moon-balance', color: '#f5a623',
            href: './games/tango.html',
            tags: ['puzzle', 'single'],
        },
        {
            id: 'sudoku', theme: 'puzzle', icon: 'grid-3x3', color: '#2e7d32',
            href: './games/sudoku.html',
            tags: ['puzzle', 'single'],
        },
        {
            id: 'zip', theme: 'puzzle', icon: 'route', color: '#3498db',
            href: './games/zip.html',
            tags: ['puzzle', 'single'],
        },
        {
            id: 'guards', theme: 'puzzle', icon: 'user', color: '#4f46e5',
            href: './games/guards.html',
            tags: ['puzzle', 'single'],
        },
        {
            id: 'nonogram', theme: 'puzzle', icon: 'image', color: '#7c3aed',
            href: './games/nonogram.html',
            tags: ['puzzle', 'single'],
        },
        {
            id: 'queens', theme: 'puzzle', icon: 'crown', color: '#b341d1',
            href: './games/queens.html',
            tags: ['puzzle', 'single'],
        },
    ];

    // Default display order: a soft rainbow sorted by each game's theme-colour hue.
    GAMES.sort(function (a, b) { return hexHue(a.color) - hexHue(b.color); });

    // ---------------------------------------------------------------
    // i18n
    // ---------------------------------------------------------------
    var STRINGS = {
        en: {
            subtitle: 'A collection of small games.',
            all: 'All',
            signIn: 'Sign in',
            signOut: 'Sign out',
            account: 'Account',
            playable: 'Playable',
            wip: 'WIP',
            wipGateMsg: 'This one is still being built \u2014 it isn\u2019t open yet.',
            wipGateStay: 'I\u2019ll wait',
            wipGateGo: 'Let me in anyway',
            wipGateUnlockedEyebrow: 'Backstage',
            wipGateUnlockedMsg: 'Still in development and rough around the edges. Take a look?',
            wipGateEnter: 'Take a look',
            wipUnlockedToast: 'Preview access unlocked on this device.',
            searchPlaceholder: 'Search games\u2026',
            searchAria: 'Search games',
            searchClear: 'Clear search',
            noResults: 'No games match your filters.',
            footer: 'A static site — works offline. ' + GAMES.length + ' games and counting.',

            tag_puzzle: 'Puzzle',
            tag_action: 'Action',
            tag_casual: 'Casual',
            tag_progression: 'Progression',
            tag_timeattack: 'Time-Attack',
            tag_single: 'Single',
            tag_multi: 'Multiplayer',

            'rune-stones_name': 'Rune Stones',
            'rune-stones_tagline': 'Match runes to score, or duel to win.',
            'rune-stones_body': 'Line up 3+ of a colour and chain combos. Pile on damage solo in Sandbag, or duel the computer or an online rival.',
            'colour-ladder_name': 'Colour Ladder',
            'colour-ladder_tagline': 'Move the rungs, route the balls.',
            'colour-ladder_body': 'Balls rain down a ladder of lanes. Move the coloured rungs to steer each one into its matching-colour basket.',
            'bullet-storm_name': 'Bullet Storm',
            'bullet-storm_tagline': 'Dodge the bullets, outlast the storm.',
            'bullet-storm_body': 'Bullets pour in from every side. Fly your dot, weave through the gaps, and last as long as you can.',
            'beam_name': 'Beam',
            'beam_tagline': 'Memorise the mirrors, trace the laser.',
            'beam_body': 'Mirrors appear then vanish; a laser fires in and you tap where it exits in time.',
            'carom_name': 'Carom',
            'carom_tagline': 'Flick a player, carom the ball in.',
            'carom_body': 'Two-player hot-seat. Drag a player back and launch it — carom off teammates, rivals and the ball to knock it into the far net.',
            'patches_name': 'Patches',
            'patches_tagline': 'Tile the grid with shapes.',
            'patches_body': "Split the grid into rectangles \u2014 one per clue \u2014 matching each clue\u2019s shape and size.",
            'hashi_name': 'Hashi',
            'hashi_tagline': 'Bridge every island.',
            'hashi_body': 'Link the numbered islands with the right number of bridges \u2014 no crossings, all connected.',
            'tango_name': 'Tango',
            'tango_tagline': 'Sun & moon balance.',
            'tango_body': 'Fill the grid with suns and moons \u2014 half of each per row and column, no three in a row, respect the walls.',
            'sudoku_name': 'Sudoku',
            'sudoku_tagline': 'Classic number logic.',
            'sudoku_body': 'Fill the grid so every row, column and box contains each digit exactly once.',
            'zip_name': 'Zip',
            'zip_tagline': 'One path, every cell.',
            'zip_body': 'Drag from 1 to draw a single path covering every open cell, hitting checkpoints in numerical order.',
            'guards_name': 'Guards',
            'guards_tagline': 'Watch every corridor.',
            'guards_body': 'Post the right number of guards to watch the corridors \u2014 none may see another.',
            'nonogram_name': 'Nonogram',
            'nonogram_tagline': 'Reveal the hidden picture.',
            'nonogram_body': 'Use the row and column number clues to fill the grid and reveal the picture.',
            'queens_name': 'Queens',
            'queens_tagline': 'Royal regions, one queen each.',
            'queens_body': 'Place N queens so that every row, column, colour region and 8-neighbourhood contains exactly one.',
        },
        zh: {
            subtitle: '一個小遊戲合輯。',
            all: '全部',
            signIn: '登入',
            signOut: '登出',
            account: '帳號',
            playable: '可玩',
            wip: '開發中',
            wipGateMsg: '這款還在開發中，還沒對外開放。',
            wipGateStay: '再等等',
            wipGateGo: '我硬要玩',
            wipGateUnlockedEyebrow: '測試者通道',
            wipGateUnlockedMsg: '這款還在開發中、尚未完工。要進去看看嗎？',
            wipGateEnter: '進去看看',
            wipUnlockedToast: '已在此裝置解鎖開發中遊戲。',
            searchPlaceholder: '搜尋遊戲…',
            searchAria: '搜尋遊戲',
            searchClear: '清除搜尋',
            noResults: '沒有符合條件的遊戲。',
            footer: '純靜態網站，可離線使用。目前收錄 ' + GAMES.length + ' 款，持續增加中。',

            tag_puzzle: '益智',
            tag_action: '動作',
            tag_casual: '休閒',
            tag_progression: '成長',
            tag_timeattack: '計時',
            tag_single: '單人',
            tag_multi: '多人',

            'rune-stones_name': '盧恩符石',
            'rune-stones_tagline': '轉珠連消，衝傷害或對戰。',
            'rune-stones_body': '連成同色 3 顆以上、串接連擊。單人沙包衝高傷害，或對戰電腦與線上玩家。',
            'colour-ladder_name': '彩球梯',
            'colour-ladder_tagline': '移動橫線，把球導到對的籃子。',
            'colour-ladder_body': '球沿著一排排直線往下掉。移動彩色的橋，把每顆球導進同色的籃子。',
            'bullet-storm_name': '彈幕風暴',
            'bullet-storm_tagline': '閃避子彈，撐過風暴。',
            'bullet-storm_body': '子彈從四面八方湧入。在縫隙間穿梭閃避，盡量撐久一點。',
            'beam_name': '追光',
            'beam_tagline': '記住鏡子，追蹤雷射。',
            'beam_body': '鏡子出現後消失，雷射射入，在時間內點出它射出的邊界位置。',
            'carom_name': '彈球場',
            'carom_tagline': '彈射球員，碰撞得分。',
            'carom_body': '兩人同機對戰。往後拖曳球員再放開彈射，撞擊隊友、對手與球，把球送進對方球門。',
            'patches_name': 'Patches',
            'patches_tagline': '用形狀鋪滿整個盤面。',
            'patches_body': '把盤面切成一個個矩形 \u2014 每個提示對應一個 \u2014 並符合該提示的形狀與大小。',
            'hashi_name': 'Hashi',
            'hashi_tagline': '把每座島連起來。',
            'hashi_body': '用正確數量的橋連接數字島 \u2014 不可交叉，且全部連成一網。',
            'tango_name': 'Tango',
            'tango_tagline': '太陽與月亮的平衡。',
            'tango_body': '用太陽和月亮填滿盤面 \u2014 每列每行各半，不能連續三個相同，並遵循牆的限制。',
            'sudoku_name': 'Sudoku',
            'sudoku_tagline': '經典數字邏輯。',
            'sudoku_body': '填滿盤面，使每列、每行、每個區域都恰好包含 1 至 N 各一次。',
            'zip_name': 'Zip',
            'zip_tagline': '一條路徑，貫穿每格。',
            'zip_body': '從 1 開始拖曳，畫出一條覆蓋每個白色格子的路徑，並依序通過編號的檢查點。',
            'guards_name': 'Guards',
            'guards_tagline': '看守每一條走廊。',
            'guards_body': '部署符合數量的守衛看守走廊 \u2014 彼此不能互相看到。',
            'nonogram_name': 'Nonogram',
            'nonogram_tagline': '還原隱藏的圖案。',
            'nonogram_body': '依每列與每行的數字線索把格子填滿，還原出圖案。',
            'queens_name': 'Queens',
            'queens_tagline': '皇家領地，每區一后。',
            'queens_body': '在每個列、行、色塊區域與 8 鄰域中各放一個皇后。',
        },
    };

    // ---------------------------------------------------------------
    // Icons — inline Lucide subset (same glyphs the collections use).
    // ---------------------------------------------------------------
    var ICONS = {
        ladder: '<path d="M8 3v18"/><path d="M16 3v18"/><path d="M8 8h8"/><path d="M8 13h8"/><path d="M8 18h8"/>',
        target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
        stone: '<path d="M11.264 2.205A4 4 0 0 0 6.42 4.211l-4 8a4 4 0 0 0 1.359 5.117l6 4a4 4 0 0 0 4.438 0l6-4a4 4 0 0 0 1.576-4.592l-2-6a4 4 0 0 0-2.53-2.53z"/><path d="M11.99 22 14 12l7.822 3.184"/><path d="M14 12 8.47 2.302"/>',
        // lucide: graph-star (Hashi)
        'graph-star': '<path d="m12.342 9.316 1.764-3.527"/><path d="m12.59 14.545 2.35 3.759"/><path d="m13.982 12.332 4.03.447"/><path d="M5.414 17.586 8.88 14.12"/><path d="M9.025 9.742 5.317 5.505"/><circle cx="11" cy="12" r="3"/><circle cx="15" cy="4" r="2"/><circle cx="16" cy="20" r="2"/><circle cx="20" cy="13" r="2"/><circle cx="4" cy="19" r="2"/><circle cx="4" cy="4" r="2"/>',
        // lucide: layout-template, rotated 90° counter-clockwise (Patches)
        'layout-template-ccw': '<g transform="rotate(-90 12 12)"><rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/><rect width="5" height="7" x="16" y="14" rx="1"/></g>',
        // custom: lucide sun rays around a lucide moon crescent at the centre (Tango)
        'sun-moon-balance': '<path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/><g transform="translate(6 6) scale(0.5)" stroke-width="4"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></g>',
        'grid-3x3': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',
        route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
        user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
        crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
        zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
        soccer: '<circle cx="12" cy="12" r="9"/><path d="M12 7 14.9 9.1 13.8 12.5 10.2 12.5 9.1 9.1Z"/>',
    };

    // Hue (0–360) of a #rrggbb colour — used to order the launcher as a soft rainbow.
    function hexHue(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
        if (!m) return 0;
        var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        if (d === 0) return 0;
        var h;
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        return h < 0 ? h + 360 : h;
    }

    function iconSvg(name) {
        var inner = ICONS[name];
        if (!inner) return '';
        return '<svg class="icon" viewBox="0 0 24 24" width="1em" height="1em"'
            + ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"'
            + ' stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
    }

    // ---------------------------------------------------------------
    // State + helpers
    // ---------------------------------------------------------------
    var LANG_KEY = 'gamebox:lang';
    var SUPPORTED = ['en', 'zh'];
    // Stored JSON-encoded to match the game engines' writeJSON/readJSON on the
    // same shared key (they JSON.stringify the value) — otherwise the engine's
    // JSON.parse on a raw "zh" throws and silently falls back to English.
    var lang = 'en';
    (function () {
        var raw = localStorage.getItem(LANG_KEY);
        if (raw != null) {
            try {
                var v = JSON.parse(raw);
                if (typeof v === 'string') lang = v;
            } catch (e) {
                if (SUPPORTED.indexOf(raw) !== -1) lang = raw; // tolerate a legacy raw value
            }
        }
        if (SUPPORTED.indexOf(lang) === -1) lang = 'en';
        // Normalise storage to the JSON form the engines expect, so a legacy
        // raw value self-heals even if the user never toggles again.
        try { localStorage.setItem(LANG_KEY, JSON.stringify(lang)); } catch (e) {}
    })();
    var activeTag = null; // null = show all
    var query = '';       // lower-cased search text; '' = no search
    var wipUnlocked = false;      // WIP games open directly on this device (set by the ?backstage link)
    var wipJustUnlocked = false;  // the ?backstage link was used on THIS load (→ confirm with a toast)
    var accountUser = null;       // signed-in user (from ArcadeNet), or null

    function t(key) {
        var table = STRINGS[lang] || STRINGS.en;
        return (table[key] != null) ? table[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
    }

    function tagCount(tagId) {
        var n = 0;
        for (var i = 0; i < GAMES.length; i++) {
            if (GAMES[i].tags.indexOf(tagId) !== -1) n++;
        }
        return n;
    }

    // Match the search text against the game's localized name, tagline, body and
    // tag labels (so searching works in whichever language is showing).
    function matchesQuery(g) {
        if (!query) return true;
        var hay = t(g.id + '_name') + ' ' + t(g.id + '_tagline') + ' ' + t(g.id + '_body');
        for (var j = 0; j < g.tags.length; j++) hay += ' ' + t('tag_' + g.tags[j]);
        return hay.toLowerCase().indexOf(query) !== -1;
    }

    function visibleGames() {
        return GAMES.filter(function (g) {
            if (activeTag && g.tags.indexOf(activeTag) === -1) return false;
            return matchesQuery(g);
        });
    }

    // ---------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------
    function renderChrome() {
        document.documentElement.lang = (lang === 'zh') ? 'zh-Hant' : 'en';
        document.getElementById('app-subtitle').textContent = t('subtitle');
        document.getElementById('app-footer').textContent = t('footer');
        var si = document.getElementById('search-input');
        if (si) { si.placeholder = t('searchPlaceholder'); si.setAttribute('aria-label', t('searchAria')); }
        var sc = document.getElementById('search-clear');
        if (sc) { sc.setAttribute('aria-label', t('searchClear')); sc.title = t('searchClear'); }
        var tog = document.getElementById('lang-toggle');
        var btns = tog.querySelectorAll('button[data-lang]');
        for (var i = 0; i < btns.length; i++) {
            var active = btns[i].getAttribute('data-lang') === lang;
            btns[i].classList.toggle('active', active);
            btns[i].setAttribute('aria-checked', active ? 'true' : 'false');
        }
        renderAccount(accountUser);   // re-localise the account control on language change
    }

    function renderFilter() {
        var nav = document.getElementById('tag-filter');
        nav.innerHTML = '';

        var allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = 'tag-chip' + (activeTag === null ? ' active' : '');
        allBtn.innerHTML = t('all') + ' <span class="chip-count">' + GAMES.length + '</span>';
        allBtn.addEventListener('click', function () { setTag(null); });
        nav.appendChild(allBtn);

        var ordered = TAGS.slice().sort(function (a, b) { return a.order - b.order; });
        for (var i = 0; i < ordered.length; i++) {
            (function (tag) {
                var count = tagCount(tag.id);
                if (count === 0) return; // auto-hide empty tags (casual / progression today)
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'tag-chip' + (activeTag === tag.id ? ' active' : '');
                btn.innerHTML = t('tag_' + tag.id) + ' <span class="chip-count">' + count + '</span>';
                btn.addEventListener('click', function () {
                    setTag(activeTag === tag.id ? null : tag.id);
                });
                nav.appendChild(btn);
            })(ordered[i]);
        }
    }

    function renderGrid() {
        var grid = document.getElementById('games-grid');
        var none = document.getElementById('no-results');
        grid.innerHTML = '';
        var games = visibleGames();

        if (games.length === 0) {
            none.textContent = t('noResults');
            none.hidden = false;
            return;
        }
        none.hidden = true;

        for (var i = 0; i < games.length; i++) {
            var g = games[i];
            var card = document.createElement('a');
            card.className = 'game-card';
            card.href = g.href;
            card.style.setProperty('--game-color', g.color);

            var tagsHtml = '';
            for (var j = 0; j < g.tags.length; j++) {
                tagsHtml += '<span class="tag">' + t('tag_' + g.tags[j]) + '</span>';
            }

            card.innerHTML =
                '<div class="game-card-header">'
                + '<span class="game-icon">' + iconSvg(g.icon) + '</span>'
                + '<div>'
                + '<div class="game-name">' + t(g.id + '_name') + '</div>'
                + '<div class="game-tagline">' + t(g.id + '_tagline') + '</div>'
                + '</div>'
                + '</div>'
                + '<p class="game-card-body">' + t(g.id + '_body') + '</p>'
                + '<div class="game-card-tags">' + tagsHtml + '</div>'
                + '<div class="game-card-footer">'
                + (g.wip ? '<span class="badge badge-wip">' + t('wip') + '</span>' : '<span class="badge badge-playable">' + t('playable') + '</span>')
                + '</div>';

            // WIP games always open a confirm dialog first. On a locked device it's a
            // "not open yet" deterrent (insisting → a well-known video); once unlocked
            // via the ?backstage link it's a tester's "take a look?" that really enters.
            if (g.wip) {
                card.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    openWipGate(ev.currentTarget.getAttribute('href'));
                });
            }

            grid.appendChild(card);
        }
    }

    // Confirm dialog for a WIP game. Locked: a "not open yet" deterrent whose "let me
    // in anyway" is the trap. Unlocked (via ?backstage): a tester's confirmation —
    // visually distinct (green "backstage" styling) — whose button really opens it.
    function openWipGate(href) {
        var ov = document.createElement('div');
        ov.className = 'wip-gate' + (wipUnlocked ? ' unlocked' : '');
        var card = document.createElement('div');
        card.className = 'wip-gate-card' + (wipUnlocked ? ' unlocked' : '');
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        if (wipUnlocked) {
            var eyebrow = document.createElement('div');
            eyebrow.className = 'wip-gate-eyebrow';
            eyebrow.textContent = t('wipGateUnlockedEyebrow');
            card.appendChild(eyebrow);
        }
        var msg = document.createElement('p');
        msg.className = 'wip-gate-msg';
        msg.textContent = wipUnlocked ? t('wipGateUnlockedMsg') : t('wipGateMsg');
        var actions = document.createElement('div');
        actions.className = 'wip-gate-actions';
        var stay = document.createElement('button');
        stay.type = 'button'; stay.className = 'wip-gate-btn stay'; stay.textContent = t('wipGateStay');
        var go = document.createElement('button');
        go.type = 'button'; go.className = 'wip-gate-btn go'; go.textContent = wipUnlocked ? t('wipGateEnter') : t('wipGateGo');
        actions.appendChild(stay); actions.appendChild(go);
        card.appendChild(msg); card.appendChild(actions);
        ov.appendChild(card);
        function close() { ov.remove(); document.removeEventListener('keydown', onKey); }
        function onKey(e) { if (e.key === 'Escape') close(); }
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        stay.addEventListener('click', close);
        go.addEventListener('click', function () {
            location.href = wipUnlocked ? href : 'https://youtu.be/dQw4w9WgXcQ';
        });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(ov);
        (wipUnlocked ? go : stay).focus();  // unlocked: Enter proceeds; locked: Enter just closes (safe)
    }

    // Brief auto-dismissing toast (used to confirm the ?backstage unlock worked).
    function showToast(text) {
        var el = document.createElement('div');
        el.className = 'wip-toast';
        el.textContent = text;
        document.body.appendChild(el);
        requestAnimationFrame(function () { el.classList.add('show'); });
        setTimeout(function () {
            el.classList.remove('show');
            setTimeout(function () { el.remove(); }, 300);
        }, 2600);
    }

    // Wait for the async Firebase layer to report in, then run cb with ArcadeNet (or a
    // stub). Always fires — net.js dispatches arcade-net-ready even when it fails.
    function whenNet(cb) {
        if (window.ArcadeNet) { cb(window.ArcadeNet); return; }
        window.addEventListener('arcade-net-ready', function once() {
            window.removeEventListener('arcade-net-ready', once); cb(window.ArcadeNet);
        }, { once: true });
    }

    // Account control: hidden when cloud is unavailable; "Sign in" (Google) when signed
    // out; avatar + name + "Sign out" when signed in with a real account.
    function renderAccount(user) {
        var el = document.getElementById('account'); if (!el) return;
        var N = window.ArcadeNet;
        if (!N || !N.ok) { el.hidden = true; el.innerHTML = ''; return; }
        el.hidden = false;
        el.innerHTML = '';
        if (user && !user.anon) {
            if (user.photo) {
                var img = document.createElement('img');
                img.className = 'account-avatar'; img.src = user.photo; img.alt = '';
                img.referrerPolicy = 'no-referrer';
                el.appendChild(img);
            }
            var name = document.createElement('span');
            name.className = 'account-name';
            name.textContent = user.name || t('account');
            el.appendChild(name);
            var out = document.createElement('button');
            out.type = 'button'; out.className = 'account-btn';
            out.textContent = t('signOut');
            out.addEventListener('click', function () { N.signOut(); });
            el.appendChild(out);
        } else {
            var inBtn = document.createElement('button');
            inBtn.type = 'button'; inBtn.className = 'account-btn primary';
            inBtn.textContent = t('signIn');
            inBtn.addEventListener('click', function () {
                inBtn.disabled = true;
                Promise.resolve(N.signInGoogle()).catch(function () {}).then(function () { inBtn.disabled = false; });
            });
            el.appendChild(inBtn);
        }
    }

    function renderAll() {
        renderChrome();
        renderFilter();
        renderGrid();
    }

    function setTag(tagId) {
        activeTag = tagId;
        renderFilter();
        renderGrid();
    }

    function setLang(next) {
        if (SUPPORTED.indexOf(next) === -1 || next === lang) return;
        lang = next;
        localStorage.setItem(LANG_KEY, JSON.stringify(lang));
        renderAll();
    }

    // ---------------------------------------------------------------
    // Boot
    // ---------------------------------------------------------------
    function boot() {
        // WIP soft-gate: opening `index.html?backstage` unlocks WIP games on this
        // device (persisted), then the param is stripped for a clean URL. Share that
        // one link with testers — a click is all it takes.
        try {
            var sp = new URLSearchParams(location.search);
            if (sp.has('backstage')) {
                localStorage.setItem('gamebox:backstage', '1');
                wipJustUnlocked = true;
                sp.delete('backstage');
                var qs = sp.toString();
                history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
            }
            wipUnlocked = localStorage.getItem('gamebox:backstage') === '1';
        } catch (e) { wipUnlocked = false; }

        var tog = document.getElementById('lang-toggle');
        tog.addEventListener('click', function (ev) {
            var btn = ev.target.closest ? ev.target.closest('button[data-lang]') : null;
            if (!btn) return;
            setLang(btn.getAttribute('data-lang'));
        });

        var searchInput = document.getElementById('search-input');
        var searchClear = document.getElementById('search-clear');
        function applyQuery() {
            query = searchInput.value.trim().toLowerCase();
            searchClear.hidden = !searchInput.value;
            renderGrid();
        }
        searchInput.addEventListener('input', applyQuery);
        searchInput.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' && searchInput.value) {
                ev.preventDefault();
                searchInput.value = '';
                applyQuery();
            }
        });
        searchClear.addEventListener('click', function () {
            searchInput.value = '';
            applyQuery();
            searchInput.focus();
        });
        // "/" jumps to the search box (unless you're already typing somewhere).
        document.addEventListener('keydown', function (ev) {
            if (ev.key !== '/' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
            var a = document.activeElement;
            if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
            ev.preventDefault();
            searchInput.focus();
        });

        // Account: reflect sign-in state once the Firebase layer reports in.
        whenNet(function (N) {
            if (N && N.ok && N.onAuth) N.onAuth(function (u) { accountUser = u; renderAccount(u); });
        });

        renderAll();
        if (wipJustUnlocked) showToast(t('wipUnlockedToast'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
