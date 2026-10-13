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
            id: 'rune-stones', theme: 'arcade', icon: 'stone', color: '#d9544e',
            href: './arcade/games/rune-stones.html',
            tags: ['puzzle', 'timeattack', 'single', 'multi'],
        },
        {
            id: 'colour-ladder', theme: 'arcade', icon: 'ladder', color: '#5ad0e0',
            href: './arcade/games/colour-ladder.html',
            tags: ['action', 'single'],
        },
        {
            id: 'bullet-storm', theme: 'arcade', icon: 'target', color: '#a78bfa',
            href: './arcade/games/bullet-storm.html',
            tags: ['action', 'single'],
        },
        {
            id: 'patches', theme: 'puzzle', icon: 'shapes', color: '#e5484d',
            href: './puzzle/games/patches.html',
            tags: ['puzzle', 'single'],
        },
        {
            id: 'hashi', theme: 'puzzle', icon: 'waypoints', color: '#8a5a2c',
            href: './puzzle/games/hashi.html',
            tags: ['puzzle', 'single'],
        },
        {
            id: 'tango', theme: 'puzzle', icon: 'sun', color: '#f5a623',
            href: './puzzle/games/tango.html',
            tags: ['puzzle', 'single'],
        },
        {
            id: 'sudoku', theme: 'puzzle', icon: 'grid-3x3', color: '#2e7d32',
            href: './puzzle/games/sudoku.html',
            tags: ['puzzle', 'single'],
        },
        {
            id: 'zip', theme: 'puzzle', icon: 'route', color: '#3498db',
            href: './puzzle/games/zip.html',
            tags: ['puzzle', 'single'],
        },
        {
            id: 'guards', theme: 'puzzle', icon: 'user', color: '#4f46e5',
            href: './puzzle/games/guards.html',
            tags: ['puzzle', 'single'],
        },
        {
            id: 'nonogram', theme: 'puzzle', icon: 'image', color: '#7c3aed',
            href: './puzzle/games/nonogram.html',
            tags: ['puzzle', 'single'],
        },
        {
            id: 'queens', theme: 'puzzle', icon: 'crown', color: '#b341d1',
            href: './puzzle/games/queens.html',
            tags: ['puzzle', 'single'],
        },
    ];

    // ---------------------------------------------------------------
    // i18n
    // ---------------------------------------------------------------
    var STRINGS = {
        en: {
            subtitle: 'One box, many little games. Filter by what you feel like playing.',
            all: 'All',
            playable: 'Playable',
            noResults: 'No games match this tag yet.',
            footer: 'A static site — works offline. ' + GAMES.length + ' games and counting.',

            tag_puzzle: 'Puzzle',
            tag_action: 'Action',
            tag_casual: 'Casual',
            tag_progression: 'Progression',
            tag_timeattack: 'Time-Attack',
            tag_single: 'Single',
            tag_multi: 'Multiplayer',

            'rune-stones_name': 'Rune Stones',
            'rune-stones_tagline': 'Raise shields, play cards, then spin to break through.',
            'rune-stones_body': "Raise shields, play cards, then spin to break the rival\u2019s shields. Versus the computer or online.",
            'colour-ladder_name': 'Colour Ladder',
            'colour-ladder_tagline': 'Move the rungs, route the balls.',
            'colour-ladder_body': 'Balls rain down a ladder of lanes. Move the coloured rungs to steer each one into its matching-colour basket.',
            'bullet-storm_name': 'Bullet Storm',
            'bullet-storm_tagline': 'Dodge the bullets, outlast the storm.',
            'bullet-storm_body': 'Bullets pour in from every side. Fly your dot, weave through the gaps, and last as long as you can.',
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
            subtitle: '一個盒子，裝滿小遊戲。用標籤挑你現在想玩的。',
            all: '全部',
            playable: '可玩',
            noResults: '目前沒有符合這個標籤的遊戲。',
            footer: '純靜態網站，可離線使用。目前收錄 ' + GAMES.length + ' 款，持續增加中。',

            tag_puzzle: '益智',
            tag_action: '動作',
            tag_casual: '休閒',
            tag_progression: '成長',
            tag_timeattack: '計時',
            tag_single: '單人',
            tag_multi: '多人',

            'rune-stones_name': '盧恩符石',
            'rune-stones_tagline': '佈盾、出牌，再轉珠破盾。',
            'rune-stones_body': '佈盾、出牌，再轉珠破解對手的盾。可對戰電腦或線上對戰。',
            'colour-ladder_name': '彩球梯',
            'colour-ladder_tagline': '移動橫線，把球導到對的籃子。',
            'colour-ladder_body': '球沿著一排排直線往下掉。移動彩色的橋，把每顆球導進同色的籃子。',
            'bullet-storm_name': '彈幕風暴',
            'bullet-storm_tagline': '閃避子彈，撐過風暴。',
            'bullet-storm_body': '子彈從四面八方湧入。在縫隙間穿梭閃避，盡量撐久一點。',
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
        shapes: '<path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.199 0l3.726 5.921A.7.7 0 0 1 15.7 10Z"/><rect width="7" height="7" x="3" y="14" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>',
        waypoints: '<circle cx="12" cy="4.5" r="2.5"/><path d="m10.2 6.3-3.9 3.9"/><circle cx="4.5" cy="12" r="2.5"/><path d="M7 12h10"/><circle cx="19.5" cy="12" r="2.5"/><path d="m13.8 17.7 3.9-3.9"/><circle cx="12" cy="19.5" r="2.5"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
        'grid-3x3': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',
        route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
        user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
        crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
    };

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
    var lang = localStorage.getItem(LANG_KEY) || 'en';
    if (SUPPORTED.indexOf(lang) === -1) lang = 'en';
    var activeTag = null; // null = show all

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

    function visibleGames() {
        if (!activeTag) return GAMES;
        return GAMES.filter(function (g) { return g.tags.indexOf(activeTag) !== -1; });
    }

    // ---------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------
    function renderChrome() {
        document.documentElement.lang = (lang === 'zh') ? 'zh-Hant' : 'en';
        document.getElementById('app-subtitle').textContent = t('subtitle');
        document.getElementById('app-footer').textContent = t('footer');
        var tog = document.getElementById('lang-toggle');
        var btns = tog.querySelectorAll('button[data-lang]');
        for (var i = 0; i < btns.length; i++) {
            var active = btns[i].getAttribute('data-lang') === lang;
            btns[i].classList.toggle('active', active);
            btns[i].setAttribute('aria-checked', active ? 'true' : 'false');
        }
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
                + '<span class="badge badge-playable">' + t('playable') + '</span>'
                + '</div>';

            grid.appendChild(card);
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
        localStorage.setItem(LANG_KEY, lang);
        renderAll();
    }

    // ---------------------------------------------------------------
    // Boot
    // ---------------------------------------------------------------
    function boot() {
        var tog = document.getElementById('lang-toggle');
        tog.addEventListener('click', function (ev) {
            var btn = ev.target.closest ? ev.target.closest('button[data-lang]') : null;
            if (!btn) return;
            setLang(btn.getAttribute('data-lang'));
        });
        renderAll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
