/* Optional physics lab. All traces and diagnostics use the actual game rules. */
(function (root) {
    'use strict';
    const AC = root.ArcadeCommon, R = root.TrashTossRules;
    const strings = {
        en: {
            ttQaName: 'Physics QA', ttQaIntro: 'Start, enter exact angle, power and wind values, then press Test throw. No charging required.', ttQaWeight: 'Weight (g)', ttQaWind: 'Wind (−100 to +100)', ttQaWindShort: 'Wind',
            ttQaRain: 'Rain', ttQaDry: 'Dry', ttQaFire: 'Test throw', ttQaSweep: 'Compare wind', ttQaClear: 'Clear tests',
            ttQaCollision: 'Bins', ttQaOn: 'On', ttQaOff: 'Off',
            ttQaHud: 'QA data · px / s', ttQaRepeat: 'Repeat numeric throw', ttQaFreeFlight: 'Free flight: ignore bin collisions', ttQaDetails: 'Full diagnostics and test history',
            ttQaHudFree: 'QA · free flight (no bin collisions)', ttQaHudBins: 'QA · bin collisions on',
            ttQaLegend: 'Green: current · Orange: previous · Blue: no wind',
            ttQaNote: 'No people, birds or old trash. Bin collisions are on by default; enable Free flight to measure unobstructed ground range. Units are game px and seconds, not m/s. Each test clears the field.',
            ttQaBaseline: 'Green: current actual flight. Orange dashes: previous actual flight. Blue dots: same inputs without wind. All use the selected bin-collision setting. Wind comparison samples −60, −30, 0, +30 and +60.',
            ttQaHistory: 'Recent tests', ttQaTime: 'Flight (s)', ttQaRange: 'Range (px)', ttQaDrift: 'Wind drift (px)',
            ttQaSpeed: 'Launch speed · px/s', ttQaVx: 'Launch vx · px/s', ttQaVy: 'Launch vy · px/s',
            ttQaGravity: 'Gravity · px/s²', ttQaDrag: 'Drag coefficient · 1/s', ttQaWindAx: 'Wind acceleration · px/s²',
            ttQaPeak: 'Peak height · px', ttQaGround: 'End x · px', ttQaBaselineX: 'No-wind end x · px',
            ttQaLiveTime: 'Live time · s', ttQaX: 'Live x · px', ttQaY: 'Live height · px',
            ttQaLiveVx: 'Live vx · px/s', ttQaLiveVy: 'Live vy · px/s', ttQaAx: 'Net ax · px/s²', ttQaAy: 'Net ay · px/s²',
        },
        zh: {
            ttQaName: '物理QA', ttQaIntro: '開始後輸入角度、力度與風力，按「測試投擲」即可，不必按住蓄力。', ttQaWeight: '重量（g）', ttQaWind: '風力（−100～＋100）', ttQaWindShort: '風力',
            ttQaRain: '雨量', ttQaDry: '無雨', ttQaFire: '測試投擲', ttQaSweep: '比較風力', ttQaClear: '清除測試',
            ttQaCollision: '桶碰撞', ttQaOn: '開啟', ttQaOff: '關閉',
            ttQaHud: 'QA數據・px／s', ttQaRepeat: '重投目前數值', ttQaFreeFlight: '自由飛行：忽略垃圾桶碰撞', ttQaDetails: '完整數值與測試紀錄',
            ttQaHudFree: 'QA・自由飛行（無桶碰撞）', ttQaHudBins: 'QA・桶碰撞開啟',
            ttQaLegend: '綠：本投・橘：上投・藍：無風',
            ttQaNote: '不含人物、鳥或舊垃圾，預設保留垃圾桶碰撞；勾選「自由飛行」才會忽略桶身。座標使用遊戲px與秒，風力並非m/s。每次測試清空場地。',
            ttQaBaseline: '綠線：本投實際軌跡。橘虛線：上一投實際軌跡。藍點線：同條件無風軌跡，均依目前的桶碰撞設定。「比較風力」會測試−60、−30、0、＋30、＋60。',
            ttQaHistory: '最近測試', ttQaTime: '飛行時間（s）', ttQaRange: '水平距離（px）', ttQaDrift: '風致偏移（px）',
            ttQaSpeed: '出手速度・px/s', ttQaVx: '出手水平速度・px/s', ttQaVy: '出手垂直速度・px/s',
            ttQaGravity: '重力加速度・px/s²', ttQaDrag: '阻力係數・1/s', ttQaWindAx: '風致加速度・px/s²',
            ttQaPeak: '最高高度・px', ttQaGround: '結算座標x・px', ttQaBaselineX: '無風結算座標x・px',
            ttQaLiveTime: '目前飛行時間・s', ttQaX: '目前座標x・px', ttQaY: '目前高度・px',
            ttQaLiveVx: '目前水平速度・px/s', ttQaLiveVy: '目前垂直速度・px/s', ttQaAx: '水平合加速度・px/s²', ttQaAy: '垂直合加速度・px/s²',
        },
    };
    for (const locale of ['en', 'zh']) Object.assign(AC.i18n.STRINGS[locale], strings[locale]);
    function create(options) {
        const $ = id => document.getElementById(id), t = AC.i18n.t;
        const metrics = new Map(), rows = [], panel = $('tt-qa-metrics');
        let comparison = null, current = null, baseline = null, currentScene = 'office';
        const metricKeys = ['ttQaSpeed', 'ttQaVx', 'ttQaVy', 'ttQaGravity', 'ttQaDrag', 'ttQaWindAx', 'ttQaPeak',
            'ttQaGround', 'ttQaBaselineX', 'ttQaTime', 'ttQaRange', 'ttQaDrift', 'ttQaLiveTime', 'ttQaX', 'ttQaY', 'ttQaLiveVx', 'ttQaLiveVy', 'ttQaAx', 'ttQaAy'];
        const shortLabels = ['v0', 'vx0', 'vy0', 'g', 'k', 'aWind', 'hMax', 'xEnd', 'xW0', 'T', 'range', 'drift', 't', 'x', 'y', 'vx', 'vy', 'ax', 'ay'];
        for (const [index, key] of metricKeys.entries()) {
            const cell = document.createElement('div'), label = document.createElement('span'), value = document.createElement('output');
            const hudCell = document.createElement('div'), hudLabel = document.createElement('span'), hudValue = document.createElement('output');
            label.textContent = t(key); value.textContent = '—'; cell.append(label, value); panel.appendChild(cell);
            hudLabel.textContent = shortLabels[index]; hudCell.title = t(key); hudValue.textContent = '—'; hudValue.setAttribute('data-metric', key);
            hudCell.append(hudLabel, hudValue); $('tt-qa-hud-metrics').appendChild(hudCell); metrics.set(key, { label, value, hudValue, hudCell });
        }
        function number(id, fallback, min, max) {
            const raw = $(id).value.trim(), parsed = raw === '' ? NaN : Number(raw);
            return R.clamp(Number.isFinite(parsed) ? parsed : fallback, min, max);
        }
        function read() {
            const item = R.ITEMS[$('tt-qa-item').value] ? $('tt-qa-item').value : 'paper', grams = R.ITEMS[item].grams;
            return { item, grams: number('tt-qa-weight', grams, grams / 4, grams * 4), angle: number('tt-qa-angle', 45, 15, 80),
                power: number('tt-qa-power', 65, 0, 100), wind: number('tt-qa-wind', 30, -100, 100), rain: number('tt-qa-rain', 0, 0, 1.6), freeFlight: $('tt-qa-freeflight').checked === true };
        }
        function environment(base, input) {
            const c = input || read();
            return Object.assign({}, base, { qa: true, freeFlight: c.freeFlight, item: c.item, grams: c.grams, wind: c.wind, rain: c.rain,
                weather: c.rain > 1 ? 'storm' : c.rain > .3 ? 'rain' : c.rain > 0 ? 'drizzle' : Math.abs(c.wind) > 40 ? 'strong' : 'breeze' });
        }
        function set(key, value) {
            const node = metrics.get(key).value, text = Number.isFinite(value) ? value.toFixed(key === 'ttQaDrag' ? 4 : 2) : '—';
            if (node.textContent !== text) node.textContent = text;
            metrics.get(key).hudValue.textContent = text;
        }
        function renderRows() {
            $('tt-qa-history').replaceChildren();
            for (const row of rows) {
                const tr = document.createElement('tr');
                for (const value of [t('tt' + row.item[0].toUpperCase() + row.item.slice(1)), row.grams, row.angle, row.power, row.wind, row.rain, t(row.freeFlight ? 'ttQaOff' : 'ttQaOn'), row.seconds.toFixed(3), row.range.toFixed(2), row.drift.toFixed(2)]) {
                    const td = document.createElement('td'); td.textContent = value; tr.appendChild(td);
                }
                $('tt-qa-history').appendChild(tr);
            }
        }
        function record(scene, input, save) {
            const mode = { freeFlight: scene.freeFlight };
            current = R.traceFlight(scene, input.angle, input.power, mode);
            comparison = R.traceFlight(Object.assign({}, scene, { wind: 0 }), input.angle, input.power, mode);
            baseline = comparison.points;
            if (save !== false) {
                rows.unshift(Object.assign({}, input, { seconds: current.seconds, range: current.range, drift: current.ball.x - comparison.ball.x }));
                rows.length = Math.min(rows.length, 10); renderRows();
            }
            for (const [key, value] of Object.entries({ ttQaSpeed: Math.hypot(current.initial.vx, current.initial.vy), ttQaVx: current.initial.vx,
                ttQaVy: current.initial.vy, ttQaGravity: R.WORLD.gravity, ttQaDrag: current.force.drag, ttQaWindAx: current.force.wind,
                ttQaPeak: current.peak, ttQaGround: current.ball.x, ttQaBaselineX: comparison.ball.x, ttQaTime: current.seconds,
                ttQaRange: current.range, ttQaDrift: current.ball.x - comparison.ball.x })) set(key, value);
            live(scene, current.initial);
        }
        function live(scene, ball) {
            if (!ball) return;
            const a = R.acceleration(scene, ball);
            for (const [key, value] of Object.entries({ ttQaLiveTime: ball.age, ttQaX: ball.x, ttQaY: ball.y,
                ttQaLiveVx: ball.vx, ttQaLiveVy: ball.vy, ttQaAx: a.x, ttQaAy: a.y })) set(key, value);
        }
        function clear() {
            rows.length = 0; current = null; comparison = null; baseline = null; renderRows();
            for (const key of metricKeys) set(key, NaN);
        }
        function weightForItem() {
            const grams = R.ITEMS[$('tt-qa-item').value].grams;
            $('tt-qa-weight').value = grams; $('tt-qa-weight').min = grams / 4; $('tt-qa-weight').max = grams * 4;
        }
        function configureScene(scene) {
            currentScene = scene.scene;
            const pool = R.SCENES[currentScene].items, previous = $('tt-qa-item').value;
            const nodes = pool.map(key => { const node = document.createElement('option'); node.value = key; node.textContent = t('tt' + key[0].toUpperCase() + key.slice(1)); return node; });
            $('tt-qa-item').replaceChildren(...nodes);
            $('tt-qa-item').value = pool.includes(previous) ? previous : pool[0];
            if ($('tt-qa-item').value !== previous) weightForItem();
        }
        $('tt-qa-item').addEventListener('input', weightForItem);
        $('tt-qa-form').addEventListener('submit', e => { e.preventDefault(); if ($('tt-qa-form').reportValidity()) options.onThrow(read()); });
        $('tt-qa-sweep').addEventListener('click', () => {
            if (!$('tt-qa-form').reportValidity() || $('tt-qa-fire').disabled) return;
            const input = read(), base = options.getScene();
            for (const wind of [-60, -30, 0, 30, 60]) {
                const c = Object.assign({}, input, { wind }); record(environment(base, c), c);
            }
            record(environment(base, input), input, false);
        });
        $('tt-qa-clear').addEventListener('click', () => { clear(); options.onClear(); });
        AC.i18n.subscribe(() => { for (const [key, item] of metrics) { item.label.textContent = t(key); item.hudCell.title = t(key); } configureScene({ scene: currentScene }); renderRows(); });
        return { read, environment, record, live, clear, configureScene, baseline: () => baseline,
            ready(value) { $('tt-qa-fire').disabled = !value; $('tt-qa-quick-fire').disabled = !value; $('tt-qa-sweep').disabled = !value; } };
    }
    root.TrashTossQA = { create };
})(window);
