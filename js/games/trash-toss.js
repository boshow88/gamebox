/* Trash Toss: shared arcade lifecycle, staged settings and local turn presentation. */
(function () {
    'use strict';
    const AC = window.ArcadeCommon, R = window.TrashTossRules;
    const strings = {
        en: {
            ttName: 'Trash Toss', ttSettings: 'Game settings', ttMode: 'Mode', ttPractice: 'Practice', ttCpu: 'Vs CPU', ttLocal: 'Two players',
            ttScene: 'Scene', ttOffice: 'Office', ttPark: 'Park', ttItem: 'Trash', ttPaper: 'Paper', ttCan: 'Can', ttBook: 'Book',
            ttMixed: 'Mixed trash', ttBottle: 'Bottle', ttCup: 'Paper cup', ttCarton: 'Carton', ttPeel: 'Banana peel', ttApple: 'Apple core',
            ttCurrentTrash: 'Current trash', ttDrizzleWeather: 'Drizzle', ttAcWind: (arrow, n) => arrow + ' A/C airflow ' + n,
            ttFirstThrow: 'First throw', ttSecondThrow: 'Second throw', ttQaComplete: 'Test complete. See range and wind drift below.',
            ttBasketAfterHit: (base, total) => 'In! +' + base + ' · collision −5 · total +' + total,
            ttHitContinue: 'Collision −5. Still in flight — a basket can still score.',
            ttMaterial: (name, grams) => name + ' · ' + grams + 'g', ttNext: label => 'Next: ' + label,
            ttCalmWeather: 'Calm', ttBreezeWeather: 'Breeze', ttStrongWeather: 'Strong wind', ttRainWeather: 'Rain', ttStormWeather: 'Wind & rain',
            ttWeather: 'Weather and wind', ttRainEffect: 'Rain increases air resistance', ttDebris: n => n + (n === 1 ? ' piece' : ' pieces') + ' on the field',
            ttFiles: 'the files', ttUmbrella: 'the umbrella', ttBlocked: 'Blocked by earlier trash. Try a higher arc.',
            ttStrength: 'CPU strength', ttEasy: 'Easy', ttNormal: 'Normal', ttHard: 'Hard', ttNew: 'New game', ttRound: 'Round', ttBestFive: 'Best five rounds',
            ttYou: 'You', ttPlayer: n => 'Player ' + n, ttComputer: 'CPU', ttControls: 'Throwing controls', ttCanvas: 'Side-view field: throw from the left into either bin, avoiding the moving obstacles.',
            ttAngle: 'Angle', ttPower: 'Power', ttLower: 'Lower angle', ttRaise: 'Raise angle', ttAngleHint: '← / → to adjust',
            ttHold: 'Hold to charge', ttRelease: 'Release to throw · Space', ttCharging: 'Release to throw', ttWait: 'Watch the throw',
            ttNoLast: 'Your last throw appears here', ttLast: (a, p) => 'Last: ' + a + '° / ' + p + ' power',
            ttPoints: 'Large 10 · Small 25 · Hit an obstacle −5', ttReady: "I'm ready", ttHandoff: name => 'Pass the device to ' + name + '.',
            ttAim: 'Choose an angle. Hold, then release.', ttCpuAim: 'CPU is lining up a throw…', ttFlying: 'In flight…',
            ttBasket: points => 'In! +' + points, ttRim: 'Off the rim. Try a little more height.', ttShort: 'Too short. Try more power.',
            ttLong: 'Too far. Try less power.', ttGap: 'Between the bins. Adjust angle or power.', ttTimeout: 'Time up. No points.',
            ttObstacle: name => 'Hit ' + name + '. −5', ttBoss: 'the boss', ttWalker: 'the walker', ttCart: 'the cart', ttBird: 'a bird',
            ttCalm: 'No wind', ttWind: (arrow, n) => arrow + ' Wind ' + n, ttTime: n => n + 's to release',
            ttTurn: name => name + ' to throw', ttReadyTitle: 'Find your angle.', ttIntro: 'Set an angle. Hold to charge. Release to land it.',
            ttStart: 'Start throwing', ttAgain: 'Play again', ttWinner: name => name + ' wins!', ttDraw: 'A draw!',
            ttFinal: (a, b) => a + ' : ' + b, ttExtra: n => 'Extra ' + n, ttPending: (a, b) => a + ' → ' + b + ' · Apply with New game',
            ttHelp1: 'Set the angle, hold Space or the throw button, then release. Power cycles 0 → 100 → 0; each sweep takes 1.3 seconds.',
            ttHelp2: 'Large bins score 10, small bins 25. Actor contact costs 5 once and rebounds without ending flight: a later basket still adds points. First entry counts even if the trash bounces out. The newest 40 pieces stay on the field.',
            ttHelp3: 'Eight trash types rotate automatically with visible weights. Wind affects light trash most; rain increases air resistance. Weather passes through drizzle before heavier rain. Physics QA supports exact numeric throws without blockers.',
            ttHelp4: 'Practice has no clock. Matches have five rounds, one throw each, and 12 seconds to release. Every round is P1 then P2/CPU. Both receive identical trash weights and weather. The shared field keeps moving through throws and handoffs.',
            ttHelp5: 'Ties add up to three extra rounds, then draw. Change settings and press New game to apply. P pauses, R returns to ready, M mutes.',
        },
        zh: {
            ttName: '丟垃圾', ttSettings: '遊戲設定', ttMode: '模式', ttPractice: '自由練習', ttCpu: '挑戰電腦', ttLocal: '同機雙人',
            ttScene: '場景', ttOffice: '辦公室', ttPark: '公園', ttItem: '垃圾', ttPaper: '紙團', ttCan: '鋁罐', ttBook: '舊書',
            ttMixed: '輪換垃圾', ttBottle: '空寶特瓶', ttCup: '紙杯', ttCarton: '紙盒', ttPeel: '香蕉皮', ttApple: '蘋果核',
            ttCurrentTrash: '本投垃圾與重量', ttDrizzleWeather: '毛毛雨', ttAcWind: (arrow, n) => arrow + '冷氣風量' + n,
            ttFirstThrow: '本回合先手', ttSecondThrow: '本回合後手', ttQaComplete: '測試完成，可查看下方落地與風致偏移數值。',
            ttBasketAfterHit: (base, total) => '進桶＋' + base + '分・碰撞扣５分・本投＋' + total + '分',
            ttHitContinue: '碰撞扣５分，仍在飛行，入桶還能得分。',
            ttMaterial: (name, grams) => name + '・' + grams + 'g', ttNext: label => '下一投：' + label,
            ttCalmWeather: '微風', ttBreezeWeather: '和風', ttStrongWeather: '強風', ttRainWeather: '下雨', ttStormWeather: '風雨',
            ttWeather: '天氣與風力', ttRainEffect: '雨天增加空氣阻力', ttDebris: n => '場上垃圾：' + n + '件',
            ttFiles: '文件堆', ttUmbrella: '雨傘', ttBlocked: '被之前的垃圾擋住了，試著提高拋物線。',
            ttStrength: '電腦強度', ttEasy: '簡單', ttNormal: '普通', ttHard: '困難', ttNew: '新遊戲', ttRound: '回合', ttBestFive: '五回合最佳',
            ttYou: '你', ttPlayer: n => '玩家' + n, ttComputer: '電腦', ttControls: '投擲控制', ttCanvas: '側視投擲場地：從左方將垃圾丟入任一垃圾桶，避開移動中的障礙。',
            ttAngle: '角度', ttPower: '力度', ttLower: '降低角度', ttRaise: '提高角度', ttAngleHint: '←／→調整角度',
            ttHold: '按住蓄力', ttRelease: '放開投擲・空白鍵', ttCharging: '放開投擲', ttWait: '觀看投擲',
            ttNoLast: '上一投的角度與力度會留在這裡', ttLast: (a, p) => '上一投：' + a + '°／力度' + p,
            ttPoints: '大桶１０分・小桶２５分・撞到障礙扣５分', ttReady: '準備好了', ttHandoff: name => '請把裝置交給' + name + '。',
            ttAim: '調整角度，按住蓄力後放開。', ttCpuAim: '電腦正在瞄準…', ttFlying: '飛行中…',
            ttBasket: points => '進桶！加' + points + '分', ttRim: '碰到桶緣了，試著再拋高一點。', ttShort: '太短了，試著增加力度。',
            ttLong: '太遠了，試著減少力度。', ttGap: '落在兩桶之間，調整角度或力度再試。', ttTimeout: '時間到，本投不計分。',
            ttObstacle: name => '撞到' + name + '，扣５分。', ttBoss: '老闆', ttWalker: '阿伯', ttCart: '推車', ttBird: '鳥',
            ttCalm: '無風', ttWind: (arrow, n) => arrow + '風力' + n, ttTime: n => '剩' + n + '秒出手',
            ttTurn: name => '輪到' + name, ttReadyTitle: '找準角度，丟進去。', ttIntro: '調整角度，按住蓄力，放開投擲。',
            ttStart: '開始投擲', ttAgain: '再來一場', ttWinner: name => name + '獲勝！', ttDraw: '平手！',
            ttFinal: (a, b) => a + '：' + b, ttExtra: n => '加賽' + n, ttPending: (a, b) => a + ' → ' + b + '；按「新遊戲」套用',
            ttHelp1: '調整角度後，按住空白鍵或投擲按鈕蓄力，放開出手。力度會從０升到１００，再降到０，持續來回；每趟約１．３秒。',
            ttHelp2: '大桶１０分，小桶２５分。碰撞人物或鳥每投最多扣５分，投擲仍會繼續，之後入桶照樣加分。首次入桶即計分，彈出不扣回。場上保留最新４０件垃圾。',
            ttHelp3: '八種垃圾自動輪換，重量顯示在畫面內。輕垃圾較受風影響，雨天增加空氣阻力；天氣會先經過毛毛雨再轉大雨。物理QA可直接輸入投擲數值，排除障礙測試。',
            ttHelp4: '練習不限時。比賽共五回合，每人每回合一投，需在十二秒內出手。每回合固定玩家１先投，再換玩家２或電腦。同回合垃圾、重量與天氣相同，場景持續移動。',
            ttHelp5: '平手最多加賽三回合，仍同分則和局。修改設定後，按「新遊戲」套用。P暫停，R回到準備畫面，M靜音。',
        },
    };
    Object.assign(AC.i18n.STRINGS.en, strings.en); Object.assign(AC.i18n.STRINGS.zh, strings.zh);
    const t = AC.i18n.t, $ = id => document.getElementById(id);
    const fields = { mode: $('tt-mode'), scene: $('tt-scene'), difficulty: $('tt-difficulty') };
    const prefs = AC.prefs.get('trash-toss');
    const saved = R.config(Object.assign({}, prefs, prefs.version === 2 ? {} : { item: 'mixed' }));
    Object.keys(fields).forEach(key => { fields[key].value = saved[key]; });
    const view = window.TrashTossView.create($('stage'));
    let shell, match, scene, pendingMatch, phase = 'aim', time = 0, power = 0, angle = 45;
    let ball = null, trail = [], ghost = [], result = null, resultTime = 0, plan = null;
    let charging = null, pointerId = null, chargeStart = 0, last = [null, null], angleCarry = 0;
    let worldTime = 0, debris = [], resultPosition = null;
    let visualRain = 0;
    const qa = window.TrashTossQA.create({ onThrow: startQaThrow, onClear: clearQa, getScene: () => scene });
    function isQa() { return match && match.config.mode === 'qa'; }
    function isFree() { return match.config.mode === 'practice' || isQa(); }
    function material(s) { return t('ttMaterial', t('tt' + s.item[0].toUpperCase() + s.item.slice(1)), s.grams); }
    function chosen() { return R.config(Object.fromEntries(Object.entries(fields).map(([key, node]) => [key, node.value]))); }
    function playerName(index) {
        return match.config.mode === 'local' ? t('ttPlayer', index + 1) : index === 0 ? t('ttYou') : t('ttComputer');
    }
    function isCpu() { return match.config.mode === 'cpu' && match.active === 1; }
    function canInput() { return shell && shell.isPlaying() && !isCpu() && !isQa() && ['aim', 'charge'].includes(phase); }
    function modeKey() { const c = match ? match.config : chosen(); return [c.mode, c.scene, c.mode === 'cpu' ? c.difficulty : 'standard', 'v2'].join('-'); }
    function setupLabel(c) { return t({ practice: 'ttPractice', cpu: 'ttCpu', local: 'ttLocal', qa: 'ttQaName' }[c.mode]) + ' · ' + t(c.scene === 'park' ? 'ttPark' : 'ttOffice') +
        (c.mode === 'cpu' ? ' · ' + t('tt' + c.difficulty[0].toUpperCase() + c.difficulty.slice(1)) : ''); }
    function syncSettings() {
        const c = chosen();
        $('tt-difficulty-field').hidden = c.mode !== 'cpu';
        const different = JSON.stringify(c) !== JSON.stringify(match.config);
        $('tt-pending').hidden = !different;
        $('tt-pending').textContent = different ? t('ttPending', setupLabel(match.config), setupLabel(c)) : '';
        AC.prefs.set('trash-toss', Object.assign({ version: 2 }, c));
    }
    function cancelCharge() {
        charging = null; pointerId = null; power = 0;
        if (phase === 'charge') phase = 'aim';
    }
    function beginTurn(handoff) {
        cancelCharge(); time = 0; ball = null; trail = []; result = null; pendingMatch = null;
        scene = R.scenario(match.config, match.round, match.seed);
        if (isQa()) scene = qa.environment(scene);
        if (worldTime === 0 || isQa()) visualRain = scene.rain;
        angle = last[match.active] ? last[match.active].angle : 45;
        phase = handoff ? 'handoff' : 'aim';
        plan = isCpu() ? R.cpuPlan(scene, match.config.difficulty, match.seed + match.round * 101 + match.active, worldTime, debris) : null;
        sync();
    }
    function reset() {
        match = R.createMatch(chosen(), Date.now()); last = [null, null]; ghost = []; debris = []; worldTime = 0;
        qa.clear();
        resultPosition = null; beginTurn(false); syncSettings();
        if (shell) shell.refreshBest();
    }
    function beginCharge(source) {
        if (!canInput() || phase !== 'aim') return;
        AC.audio.unlock(); charging = source; chargeStart = time; power = 0; phase = 'charge'; sync();
    }
    function release() {
        if (!shell.isPlaying() || phase !== 'charge') return;
        charging = null; pointerId = null;
        ball = R.launch(scene, angle, power, worldTime); trail = [{ x: ball.x, y: ball.y }];
        last[match.active] = { angle, power, item: scene.item, grams: scene.grams }; phase = 'flight'; AC.audio.play('click'); sync();
    }
    function startQaThrow(input) {
        if (!isQa() || !shell.isPlaying() || phase !== 'aim') return;
        scene = qa.environment(scene, input); visualRain = scene.rain;
        ghost = trail.slice(); debris = []; trail = []; result = null; resultPosition = null;
        angle = input.angle; power = input.power; phase = 'charge';
        qa.record(scene, input); release();
    }
    function clearQa() {
        if (!isQa()) return;
        cancelCharge(); phase = 'aim'; ball = null; debris = []; trail = []; ghost = []; result = null; pendingMatch = null;
        scene = qa.environment(scene); visualRain = scene.rain; sync(); render();
    }
    function finish(value) {
        result = value; resultTime = 0; phase = 'result'; charging = null; pointerId = null;
        const controls = value.kind === 'timeout' ? {} : { angle, power, releaseAt: ball.time - ball.age };
        pendingMatch = isQa() ? null : R.settle(match, value, controls);
        resultPosition = ball ? { x: ball.x, y: ball.y } : null;
        if (ball && !ball.removed) {
            debris.push(ball);
            if (debris.length > R.WORLD.debrisLimit) debris.shift();
        }
        ball = null;
        AC.audio.tone(value.points > 0 ? 880 : value.points < 0 ? 160 : 330, .12, { type: 'triangle', volume: .12 }); sync();
    }
    function resultText() {
        if (!result) return '';
        if (isQa()) return t('ttQaComplete');
        if (result.kind === 'basket') return result.penalty ? t('ttBasketAfterHit', result.basketPoints, result.points) : t('ttBasket', result.points);
        if (result.kind === 'timeout') return t('ttTimeout');
        if (result.kind === 'obstacle') return t('ttObstacle', t({ boss: 'ttBoss', walker: 'ttWalker', cart: 'ttCart', bird: 'ttBird', files: 'ttFiles', umbrella: 'ttUmbrella' }[result.obstacle]));
        if (result.blocked) return t('ttBlocked');
        if (result.rim) return t('ttRim');
        return t(resultPosition.x < scene.bins[0].x ? 'ttShort' : resultPosition.x > scene.bins[1].x ? 'ttLong' : 'ttGap');
    }
    function sync() {
        if (!match) return;
        const practice = isFree(), scores = pendingMatch ? pendingMatch.scores : match.scores;
        $('tt-round').textContent = practice ? '∞' : match.round > 5 ? t('ttExtra', match.round - 5) : match.round + ' / 5';
        $('tt-score-a').textContent = scores[0]; $('tt-score-b').textContent = scores[1];
        $('tt-player-label').textContent = playerName(0); $('tt-rival-label').textContent = playerName(1);
        $('tt-rival-stat').hidden = practice; $('tt-best-stat').hidden = practice;
        $('tt-score-a').parentElement.classList.toggle('is-active', match.active === 0);
        $('tt-rival-stat').classList.toggle('is-active', match.active === 1);
        $('tt-turn').textContent = isQa() ? t('ttQaName') : practice ? t('ttPractice') : t('ttTurn', playerName(match.active));
        $('tt-turn-order').textContent = practice ? '' : t(match.turn === 0 ? 'ttFirstThrow' : 'ttSecondThrow');
        $('tt-material').textContent = material(scene);
        const nextRound = practice || match.turn === 1 ? match.round + 1 : match.round;
        $('tt-next').textContent = t('ttNext', material(R.scenario(match.config, nextRound, match.seed)));
        $('tt-next').hidden = isQa(); $('tt-qa-panel').hidden = !isQa(); $('tt-qa-hud').hidden = !isQa(); $('tt-qa-legend').hidden = !isQa(); $('tt-normal-controls').hidden = isQa();
        $('stage').parentElement.classList.toggle('is-qa', isQa());
        $('tt-qa-hud-title').textContent = t(scene.freeFlight ? 'ttQaHudFree' : 'ttQaHudBins');
        qa.ready(isQa() && shell && shell.isPlaying() && phase === 'aim');
        $('tt-debris').textContent = t('ttDebris', debris.length);
        $('tt-weather-name').textContent = t('tt' + scene.weather[0].toUpperCase() + scene.weather.slice(1) + 'Weather');
        $('tt-rain-effect').hidden = !scene.rain;
        $('tt-wind').textContent = scene.scene === 'office' ? t('ttAcWind', scene.wind < 0 ? '←' : '→', Math.abs(scene.wind)) :
            scene.wind === 0 ? t('ttCalm') : t('ttWind', scene.wind > 0 ? '→' : '←', Math.abs(scene.wind));
        $('tt-wind-icon').classList.toggle('is-left', scene.wind < 0);
        $('tt-angle').value = Math.round(angle); $('tt-angle-value').textContent = Math.round(angle) + '°';
        const input = canInput();
        for (const id of ['tt-angle', 'tt-angle-down', 'tt-angle-up', 'tt-throw']) $(id).disabled = !input || (phase === 'charge' && id !== 'tt-throw');
        $('tt-throw').classList.toggle('is-charging', phase === 'charge');
        $('tt-throw-label').textContent = t(phase === 'charge' ? 'ttCharging' : input ? 'ttHold' : 'ttWait');
        $('tt-power-value').textContent = Math.round(power);
        $('tt-power-fill').style.width = power + '%'; $('tt-power-meter').setAttribute('aria-valuenow', Math.round(power));
        const previous = last[match.active];
        $('tt-last').textContent = previous ? material(previous) + ' · ' + t('ttLast', Math.round(previous.angle), Math.round(previous.power)) : t('ttNoLast');
        $('tt-last-mark').hidden = !previous; if (previous) $('tt-last-mark').style.left = previous.power + '%';
        const status = result ? resultText() : phase === 'handoff' ? t('ttHandoff', playerName(match.active)) : phase === 'flight' ? t(ball && ball.hits.length ? 'ttHitContinue' : 'ttFlying') : isCpu() ? t('ttCpuAim') : t('ttAim');
        if ($('tt-status').textContent !== status) $('tt-status').textContent = status;
        $('tt-ready').hidden = phase !== 'handoff'; $('tt-ready').disabled = !shell || !shell.isPlaying();
        $('tt-clock').textContent = !practice && ['aim', 'charge'].includes(phase) && shell && shell.isPlaying() ? t('ttTime', Math.max(0, Math.ceil(R.WORLD.turnSeconds - time))) : '';
    }
    function update(dt) {
        worldTime += dt;
        const rainStep = dt * .65;
        visualRain += R.clamp(scene.rain - visualRain, -rainStep, rainStep);
        for (const scrap of debris) if (!scrap.resting) R.advance(scene, scrap, dt, debris, true);
        debris = debris.filter(scrap => !scrap.removed);
        if (phase === 'handoff') { sync(); return; }
        if (phase === 'result') {
            resultTime += dt;
            if (isQa()) { if (resultTime >= R.WORLD.resultSeconds) { phase = 'aim'; sync(); } return; }
            if (resultTime >= R.WORLD.resultSeconds) {
                const previousPlayer = match.active;
                if (match.config.mode === 'practice') ghost = trail.slice();
                match = pendingMatch;
                if (match.over) {
                    const regulationScore = match.history.filter(entry => entry.player === 0 && entry.round <= 5).reduce((total, entry) => total + entry.result.points, 0);
                    phase = 'over'; shell.gameOver({ score: regulationScore, win: match.winner === 0,
                        meta: { scene: match.config.scene, rounds: match.round } }); sync(); return;
                }
                beginTurn(match.config.mode === 'local' && previousPlayer !== match.active);
            }
            return;
        }
        time += dt;
        if (phase === 'flight') {
            R.advance(scene, ball, dt, debris);
            if (isQa()) qa.live(scene, ball);
            trail.push({ x: ball.x, y: ball.y });
            if (ball.result) finish(ball.result);
        } else {
            if (isCpu()) {
                angle = plan.angle;
                if (phase === 'aim' && time >= plan.releaseAt - plan.power / 100 * R.WORLD.chargeSeconds) {
                    phase = 'charge'; chargeStart = plan.releaseAt - plan.power / 100 * R.WORLD.chargeSeconds;
                }
            } else if (phase === 'aim') {
                const keys = shell.keyboard;
                const editing = document.activeElement && document.activeElement.matches('select, input, button:not(#tt-throw)');
                const direction = editing ? 0 : (keys.isDown('ArrowRight', 'ArrowUp') ? 1 : 0) - (keys.isDown('ArrowLeft', 'ArrowDown') ? 1 : 0);
                if (direction) {
                    angleCarry += direction * dt * 32;
                    if (Math.abs(angleCarry) >= 1) { const delta = Math.trunc(angleCarry); angle = R.clamp(angle + delta, 15, 80); angleCarry -= delta; }
                } else angleCarry = 0;
            }
            if (phase === 'charge') {
                power = R.chargePower(time - chargeStart);
                if (isCpu() && time >= plan.releaseAt) { power = plan.power; release(); }
            }
            if (['aim', 'charge'].includes(phase) && !isFree() && time >= R.WORLD.turnSeconds) finish({ kind: 'timeout', points: 0 });
        }
        sync();
    }
    function render() {
        if (shell && !shell.isPlaying()) sync();
        view.render({ scene, time: worldTime, visualRain, angle, ball, trail, ghost, reference: isQa() ? qa.baseline() : null, result: isQa() ? null : result, debris, resultPosition,
            binContents: R.binContents(scene, debris), players: isFree() ? 1 : 2, active: match.active,
            playerLabels: ['P1', match.config.mode === 'cpu' ? 'CPU' : 'P2'],
            practice: isFree(), qa: isQa(), countLabel: n => AC.i18n.locale === 'zh' ? n + '件' : n + (n === 1 ? ' item' : ' items'),
            charging: phase === 'charge', aiming: ['aim', 'charge', 'handoff'].includes(phase) });
    }
    // Capture before the shared shell: the Space that starts a game must not also charge it.
    window.addEventListener('keydown', e => {
        if (!shell) return;
        const editing = e.target instanceof Element && e.target.closest('select, input, button') && e.target !== $('tt-throw');
        if (editing) { e.stopImmediatePropagation(); return; }
        if (!shell.isPlaying()) { if (e.code === 'Space') e.preventDefault(); return; }
        if (e.key.startsWith('Arrow') && canInput()) {
            e.preventDefault();
            if (!e.repeat && phase === 'aim') {
                angle = R.clamp(angle + (['ArrowRight', 'ArrowUp'].includes(e.key) ? 1 : -1), 15, 80); sync();
            }
        }
        if (e.code !== 'Space' && !(e.code === 'Enter' && e.target === $('tt-throw'))) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (!e.repeat) beginCharge('key:' + e.code);
    }, true);
    window.addEventListener('keyup', e => {
        if (charging === 'key:' + e.code) { e.preventDefault(); release(); }
    }, true);
    shell = AC.shell.create({ gameId: 'trash-toss', mode: modeKey, step: 1 / 60, restartToReady: true,
        preventKeys: [], update, render, reset,
        onStart() { if (JSON.stringify(chosen()) !== JSON.stringify(match.config)) reset(); sync(); },
        onPause() { cancelCharge(); sync(); }, onResume: sync,
        overlayContent(state) {
            if (state === 'idle') return { title: t(chosen().mode === 'qa' ? 'ttQaName' : 'ttReadyTitle'),
                message: t(chosen().mode === 'qa' ? 'ttQaIntro' : 'ttIntro'), button: t('ttStart'), hint: setupLabel(chosen()) };
            if (state === 'over') return { badge: match.winner == null ? 'gamepad-2' : 'trophy',
                title: match.winner == null ? t('ttDraw') : t('ttWinner', playerName(match.winner)),
                message: t('ttFinal', match.scores[0], match.scores[1]), button: t('ttAgain'), hint: setupLabel(match.config) };
            return {};
        },
    });
    // The shell does not call reset during construction.
    reset(); render();
    Object.values(fields).forEach(field => field.addEventListener('input', () => { syncSettings(); shell.refreshOverlay(); }));
    $('tt-apply').addEventListener('click', () => { shell.goIdle(); sync(); });
    $('tt-ready').addEventListener('click', () => { if (shell.isPlaying()) { phase = 'aim'; sync(); } });
    $('tt-angle').addEventListener('input', e => { if (canInput() && phase === 'aim') { angle = Number(e.target.value); sync(); } });
    for (const [id, delta] of [['tt-angle-down', -1], ['tt-angle-up', 1]]) $(id).addEventListener('click', () => {
        if (canInput() && phase === 'aim') { angle = R.clamp(angle + delta, 15, 80); sync(); }
    });
    $('tt-throw').addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.isPrimary === false || !canInput() || phase !== 'aim') return;
        e.preventDefault(); beginCharge('pointer'); pointerId = e.pointerId;
        $('tt-throw').setPointerCapture(e.pointerId);
    });
    window.addEventListener('pointerup', e => { if (charging === 'pointer' && e.pointerId === pointerId) release(); });
    window.addEventListener('pointercancel', e => { if (e.pointerId === pointerId) { cancelCharge(); sync(); } });
    $('tt-throw').addEventListener('lostpointercapture', () => { if (charging === 'pointer') { cancelCharge(); sync(); } });
    $('tt-throw').addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => { cancelCharge(); if (shell.isPlaying()) shell.pause(); });
    window.addEventListener('resize', () => { view.fit(); render(); });
    AC.i18n.subscribe(() => { syncSettings(); sync(); render(); });
})();
