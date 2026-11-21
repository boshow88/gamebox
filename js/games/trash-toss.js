/* Trash Toss: shared arcade lifecycle, staged settings and local turn presentation. */
(function () {
    'use strict';
    const AC = window.ArcadeCommon, R = window.TrashTossRules;
    const strings = {
        en: {
            ttLaunching: 'Releasing…', ttName: 'Trash Toss', ttOnline: 'Online duel', ttRoom: 'Online room', ttArena: 'Street arena · multi-level', ttParrot: 'the pet parrot',
            ttInputInterrupted: 'The gesture was interrupted. Hold and release to try again.',
            ttReceipt: 'Lottery receipt', ttSpraycap: 'Spray paint cap', ttCassette: 'Tangled mixtape', ttBottlecap: 'Soda bottle cap', ttWristband: 'Expired gig wristband', ttPadlock: 'Keyless padlock', ttSkatewheel: 'Worn skate wheel', ttNoodlebox: 'Empty noodle box', ttVinyl: 'Scratched vinyl', ttSneaker: 'Retired sneaker', ttSettings: 'Game settings', ttMode: 'Mode', ttPractice: 'Practice', ttCpu: 'Vs CPU', ttLocal: 'Two players',
            ttScene: 'Scene', ttOffice: 'Office · medium', ttLiving: 'Living room · short', ttPark: 'Park · medium', ttItem: 'Object', ttPaper: 'Scrunched memo', ttCan: 'Crushed soda can', ttBook: 'Outdated comic',
            ttMixed: 'Mixed objects', ttBottle: 'Empty bottle', ttCup: 'Yesterday’s coffee cup', ttCarton: 'Empty cookie box', ttPeel: 'Banana peel', ttApple: 'Apple core',
            ttLaptop: 'Retired laptop', ttMouse: 'Striking mouse', ttFolder: 'Rejected folder', ttVoodoo: 'Boss curse doll', ttKeyboard: 'Keyless keyboard', ttBadge: 'Expired work badge', ttStapler: 'Jammed stapler', ttOvertime: 'Overtime alarm',
            ttSock: 'Lonely stinky sock', ttRemote: 'Broken remote', ttBlock: 'Foot-trap brick', ttDuck: 'Deflated rubber duck', ttPacifier: 'Spare pacifier', ttPlush: 'Unstitched dinosaur', ttSlipper: 'Flying slipper', ttRobot: 'Powerless robot',
            ttLeaf: 'Giant fallen leaf', ttFrisbee: 'Cracked frisbee', ttShuttlecock: 'Bald shuttlecock', ttDogbag: 'Tied pet bag', ttSeedbag: 'Pigeon snack bag', ttGnome: 'Retired garden gnome', ttHelmet: 'Cracked hard hat', ttBrick: 'Retired red brick',
            ttCurrentTrash: 'Current trash', ttDrizzleWeather: 'Drizzle', ttAcWind: (arrow, n) => arrow + ' A/C airflow ' + n,
            ttPreviousWind: value => 'Last throw: ' + value,
            ttConstruction: 'Construction · long', ttFanWind: (arrow, n) => arrow + ' Fan ' + n,
            ttScrewdriver: 'Screwdriver', ttScrew: 'Screw', ttWrench: 'Wrench', ttNut: 'Nut', ttWasher: 'Washer', ttBolt: 'Bolt', ttOffcut: 'Wood offcut', ttTape: 'Tape roll',
            ttCleaner: 'the cleaner', ttWorker: 'a worker', ttPlanks: 'the planks', ttWheelbarrow: 'the wheelbarrow',
            ttMother: 'Mom', ttBaby: 'the crawling baby', ttRat: 'the pet parrot', ttLaundry: 'the laundry basket',
            ttCleaning: n => n + '-point bin: cleaner on the way', ttCleaningWork: n => n + '-point bin: collecting trash', ttCleaned: n => n + '-point bin cleared; cleaner leaving',
            ttFirstThrow: 'First throw', ttSecondThrow: 'Second throw', ttQaScore: 'Test points',
            ttQaComplete: 'Test: no basket, 0 points. No score is saved.', ttQaBasket: points => 'Test: basket, +' + points + ' points. No score is saved.',
            ttQaFreeComplete: 'Free-flight test complete. Bin collisions and scoring are off.',
            ttBasketAfterHit: base => 'Collision −5 · Basket +' + base,
            ttHitContinue: 'Collision −5. Still in flight — a basket can still score.',
            ttMaterial: (name, grams) => name + ' · ' + grams + 'g', ttNext: label => 'Next: ' + label,
            ttCalmWeather: 'Calm', ttBreezeWeather: 'Breeze', ttStrongWeather: 'Strong wind', ttRainWeather: 'Rain', ttStormWeather: 'Wind & rain',
            ttWeather: 'Weather and wind', ttRainEffect: 'Rain increases air resistance', ttDebris: n => n + (n === 1 ? ' piece' : ' pieces') + ' on the field',
            ttFiles: 'the files', ttUmbrella: 'the umbrella', ttBlocked: 'Blocked by earlier trash. Try a higher arc.',
            ttStrength: 'CPU strength', ttEasy: 'Easy', ttNormal: 'Normal', ttHard: 'Hard', ttNew: 'New game', ttRound: 'Round', ttBestFive: 'Best five rounds',
            ttYou: 'You', ttPlayer: n => 'Player ' + n, ttComputer: 'CPU', ttControls: 'Throwing controls', ttCanvas: 'Throwing field. Drag sideways to inspect the field or overview; release a throw to return to the thrower and follow the trash.',
            ttAngle: 'Angle', ttPower: 'Power', ttLower: 'Lower angle', ttRaise: 'Raise angle', ttAngleHint: '← / → to adjust',
            ttHold: 'Hold to charge', ttRelease: 'Release to throw · Space', ttCharging: 'Release to throw', ttWait: 'Watch the throw',
            ttNoLast: 'Your last throw appears here', ttLast: (a, p) => 'Last: ' + a + '° / ' + p + ' power',
            ttPoints: values => 'Bins ' + values.join(' / ') + ' · Contact −5', ttReady: "I'm ready", ttHandoff: name => 'Pass the device to ' + name + '.',
            ttAim: 'Choose an angle. Hold, then release.', ttCpuAim: 'CPU is lining up a throw…', ttFlying: 'In flight…',
            ttBasket: points => 'In! +' + points, ttRim: 'Off the rim. Try a little more height.', ttShort: 'Too short. Try more power.',
            ttLong: 'Too far. Try less power.', ttGap: 'Between the bins. Adjust angle or power.', ttTimeout: 'Time up. No points.',
            ttObstacle: name => 'Hit ' + name + '. −5', ttBoss: 'the boss', ttWalker: 'the walker', ttCart: 'the cart', ttBird: 'a bird',
            ttCalm: 'No wind', ttWind: (arrow, n) => arrow + ' Wind ' + n, ttTime: n => n + 's to release',
            ttTurn: name => name + ' to throw', ttReadyTitle: 'Find your angle.', ttIntro: 'Set an angle. Hold to charge. Release to land it.',
            ttStart: 'Start throwing', ttAgain: 'Play again', ttWinner: name => name + ' wins!', ttDraw: 'A draw!',
            ttFinal: (a, b) => a + ' : ' + b, ttExtra: n => 'Extra ' + n, ttPending: (a, b) => a + ' → ' + b + ' · Apply with New game',
            ttHelp1: 'Set the angle, hold Space or the throw button, then release. Power cycles 0 → 100 → 0; each sweep takes 1.3 seconds. Drag the scene to pan; drag or tap the overview to view that location. Every release returns to the thrower, then follows the trash.',
            ttHelp2: 'Each bin shows its points: wider openings award fewer points. Contact with people, animals or cleaners deducts 5 once per throw, separately from a later basket. A basket counts only after the whole object passes below the opening; a later bounce out keeps those points. Full bins summon a cleaner without revoking earned points.',
            ttHelp3: 'Each scene has ten exclusive objects with fixed weights and its own thrower. All scenes use the same throwing strength; the living room needs less power for its closer bins. Construction has five barrels at increasing distances; the street arena has twelve bins at different heights. Its rear high-score bins suit faster objects; choose lower targets for slower objects. Indoor air comes from a fan or A/C; outdoor weather transitions through drizzle. QA lists only the applied scene’s objects.',
            ttHelp4: 'Practice has no clock. Matches have five rounds, one throw each, and 12 seconds to release. Every round is P1 then P2/CPU. Both receive identical trash weights and weather. The shared field keeps moving through throws and handoffs.',
            ttHelp5: 'Ties add up to three extra rounds, then draw. Change settings and press New game to apply. P pauses, R returns to ready, M mutes.',
        },
        zh: {
            ttLaunching: '準備出手…', ttName: '丟垃圾', ttOnline: '連線對戰', ttRoom: '連線房間', ttArena: '街頭競技場・多層挑戰', ttParrot: '寵物鸚鵡',
            ttInputInterrupted: '手勢已被系統中斷，請重新按住並放開投擲。',
            ttReceipt: '沒中的發票', ttSpraycap: '噴漆罐蓋', ttCassette: '卡帶混音帶', ttBottlecap: '汽水瓶蓋', ttWristband: '過期演唱會手環', ttPadlock: '沒鑰匙的掛鎖', ttSkatewheel: '磨平滑板輪', ttNoodlebox: '空炒麵盒', ttVinyl: '刮花黑膠唱片', ttSneaker: '退休球鞋', ttSettings: '遊戲設定', ttMode: '模式', ttPractice: '自由練習', ttCpu: '挑戰電腦', ttLocal: '同機雙人',
            ttScene: '場景', ttOffice: '辦公室・中距離', ttLiving: '客廳・短距離', ttPark: '公園・中距離', ttItem: '投擲物', ttPaper: '廢紙團', ttCan: '喝扁的汽水罐', ttBook: '過期漫畫',
            ttMixed: '輪換物件', ttBottle: '空寶特瓶', ttCup: '隔夜咖啡杯', ttCarton: '空餅乾盒', ttPeel: '香蕉皮', ttApple: '蘋果核',
            ttLaptop: '退休筆電', ttMouse: '罷工滑鼠', ttFolder: '退件文件夾', ttVoodoo: '老闆詛咒娃娃', ttKeyboard: '掉鍵鍵盤', ttBadge: '失效識別證', ttStapler: '卡針訂書機', ttOvertime: '加班鬧鐘',
            ttSock: '孤單臭襪子', ttRemote: '失靈遙控器', ttBlock: '踩了會尖叫積木', ttDuck: '漏氣橡皮鴨', ttPacifier: '備用奶嘴', ttPlush: '開線恐龍玩偶', ttSlipper: '飛天拖鞋', ttRobot: '沒電機器人',
            ttLeaf: '超大落葉', ttFrisbee: '裂開飛盤', ttShuttlecock: '禿毛羽球', ttDogbag: '打結寵物便袋', ttSeedbag: '鴿飼料袋', ttGnome: '退休花園小矮人', ttHelmet: '裂痕安全帽', ttBrick: '退休紅磚',
            ttCurrentTrash: '本投垃圾與重量', ttDrizzleWeather: '毛毛雨', ttAcWind: (arrow, n) => arrow + '冷氣風量' + n,
            ttPreviousWind: value => '上一投：' + value,
            ttConstruction: '工地・長距離', ttFanWind: (arrow, n) => arrow + '電扇風量' + n,
            ttScrewdriver: '螺絲起子', ttScrew: '螺絲', ttWrench: '板手', ttNut: '螺帽', ttWasher: '墊圈', ttBolt: '螺栓', ttOffcut: '木料', ttTape: '膠帶捲',
            ttCleaner: '清潔人員', ttWorker: '工人', ttPlanks: '木板', ttWheelbarrow: '推車',
            ttMother: '媽媽', ttBaby: '爬行寶寶', ttRat: '寵物鸚鵡', ttLaundry: '洗衣籃',
            ttCleaning: n => n + '分桶：清潔人員前往清運', ttCleaningWork: n => n + '分桶：清運中', ttCleaned: n => n + '分桶已清空，清潔人員離場中',
            ttFirstThrow: '本回合先手', ttSecondThrow: '本回合後手', ttQaScore: '本投測試分數',
            ttQaComplete: '測試判定：未入桶，０分；不寫入遊戲成績。', ttQaBasket: points => '測試判定：進桶，加' + points + '分；不寫入遊戲成績。',
            ttQaFreeComplete: '自由飛行測試完成；目前已關閉垃圾桶碰撞與計分。',
            ttBasketAfterHit: base => '碰撞 −5分 · 入桶 ＋' + base + '分',
            ttHitContinue: '碰撞扣５分，仍在飛行，入桶還能得分。',
            ttMaterial: (name, grams) => name + '・' + grams + 'g', ttNext: label => '下一投：' + label,
            ttCalmWeather: '微風', ttBreezeWeather: '和風', ttStrongWeather: '強風', ttRainWeather: '下雨', ttStormWeather: '風雨',
            ttWeather: '天氣與風力', ttRainEffect: '雨天增加空氣阻力', ttDebris: n => '場上垃圾：' + n + '件',
            ttFiles: '文件堆', ttUmbrella: '雨傘', ttBlocked: '被之前的垃圾擋住了，試著提高拋物線。',
            ttStrength: '電腦強度', ttEasy: '簡單', ttNormal: '普通', ttHard: '困難', ttNew: '新遊戲', ttRound: '回合', ttBestFive: '五回合最佳',
            ttYou: '你', ttPlayer: n => '玩家' + n, ttComputer: '電腦', ttControls: '投擲控制', ttCanvas: '投擲場地：可左右拖曳場景或全場小圖查看，出手時切回投擲者並跟隨垃圾。',
            ttAngle: '角度', ttPower: '力度', ttLower: '降低角度', ttRaise: '提高角度', ttAngleHint: '←／→調整角度',
            ttHold: '按住蓄力', ttRelease: '放開投擲・空白鍵', ttCharging: '放開投擲', ttWait: '觀看投擲',
            ttNoLast: '上一投的角度與力度會留在這裡', ttLast: (a, p) => '上一投：' + a + '°／力度' + p,
            ttPoints: values => '桶分：' + values.join('／') + '・碰撞扣５分', ttReady: '準備好了', ttHandoff: name => '請把裝置交給' + name + '。',
            ttAim: '調整角度，按住蓄力後放開。', ttCpuAim: '電腦正在瞄準…', ttFlying: '飛行中…',
            ttBasket: points => '進桶！加' + points + '分', ttRim: '碰到桶緣了，試著再拋高一點。', ttShort: '太短了，試著增加力度。',
            ttLong: '太遠了，試著減少力度。', ttGap: '落在兩桶之間，調整角度或力度再試。', ttTimeout: '時間到，本投不計分。',
            ttObstacle: name => '撞到' + name + '，扣５分。', ttBoss: '老闆', ttWalker: '阿伯', ttCart: '推車', ttBird: '鳥',
            ttCalm: '無風', ttWind: (arrow, n) => arrow + '風力' + n, ttTime: n => '剩' + n + '秒出手',
            ttTurn: name => '輪到' + name, ttReadyTitle: '找準角度，丟進去。', ttIntro: '調整角度，按住蓄力，放開投擲。',
            ttStart: '開始投擲', ttAgain: '再來一場', ttWinner: name => name + '獲勝！', ttDraw: '平手！',
            ttFinal: (a, b) => a + '：' + b, ttExtra: n => '加賽' + n, ttPending: (a, b) => a + ' → ' + b + '；按「新遊戲」套用',
            ttHelp1: '調整角度後，按住空白鍵或投擲按鈕蓄力，放開出手。力度０～１００來回，每趟約１．３秒。拖場景可移動畫面；拖曳或點小圖則查看該位置。每次出手先切回投擲者，再跟隨物件。',
            ttHelp2: '各桶標示分數，寬口低分、窄口高分。撞到人物、動物或清潔人員每投最多扣５分，之後入桶獨立加分。整個物件通過桶口才加分；只碰內緣又彈出不算，真正入桶後彈出不扣回。滿桶會請清潔人員清運，保留既有分數。',
            ttHelp3: '各場景有十種固定重量的獨立物件與專屬投擲角色。所有場景使用相同投擲力量；客廳桶位較近，用較少力度即可投到。工地有五個由近到遠的鐵桶；街頭競技場設有十二個高低不同的桶，後排高分桶適合較輕快的物件，較慢物件可選中低層目標。室內有電扇或冷氣，戶外天氣先經毛毛雨再轉大雨。QA只列出目前套用場景的物件。',
            ttHelp4: '練習不限時。比賽共五回合，每人每回合一投，需在十二秒內出手。每回合固定玩家１先投，再換玩家２或電腦。同回合垃圾、重量與天氣相同，場景持續移動。',
            ttHelp5: '平手最多加賽三回合，仍同分則和局。修改設定後，按「新遊戲」套用。P暫停，R回到準備畫面，M靜音。',
        },
    };
    Object.assign(AC.i18n.STRINGS.en, strings.en); Object.assign(AC.i18n.STRINGS.zh, strings.zh);
    const t = AC.i18n.t, nodes = new Map(), $ = id => {
        if (!nodes.has(id)) nodes.set(id, document.getElementById(id));
        return nodes.get(id);
    };
    const fields = { mode: $('tt-mode'), scene: $('tt-scene'), difficulty: $('tt-difficulty') };
    const prefs = AC.prefs.get('trash-toss');
    const saved = R.config(Object.assign({}, prefs, { scene: 'office', item: 'mixed' }));
    Object.keys(fields).forEach(key => { fields[key].value = saved[key]; });
    const view = window.TrashTossView.create($('stage'));
    const cpu = window.TrashTossCPU.create();
    const ANGLE_REPEAT_DELAY = .3, ANGLE_REPEAT_SPEED = 12;
    let hudAt = -Infinity, paintAt = -Infinity, nextScenario = null, nextScenarioKey = '';
    let hudState = [], hudAngle = null, hudPower = null;
    let online = null, netCache = null, netKey = '', netFinished = '', sending = false, pendingRelease = null, inputMessage = '';
    let shell, match, scene, pendingMatch, phase = 'aim', time = 0, power = 0, angle = 45;
    let ball = null, trail = [], ghost = [], result = null, resultTime = 0, plan = null;
    let charging = null, pointerId = null, chargeStart = 0, last = [null, null], angleCarry = 0;
    let angleHold = null;
    let angleDirection = 0, angleHeldSeconds = 0;
    let worldTime = 0, debris = [], resultPosition = null;
    let visualRain = 0, previousThrow = null, cleaning = R.createCleaning(), feedback = [], drag = null;
    let previousFrame = null;
    const qa = window.TrashTossQA.create({ onThrow: startQaThrow, onClear: clearQa, getScene: () => scene });
    function isOnline() { return !!(online && online.game()); }
    function isQa() { return match && match.config.mode === 'qa'; }
    function isFree() { return match.config.mode === 'practice' || isQa(); }
    function material(s) { return t('ttMaterial', t('tt' + s.item[0].toUpperCase() + s.item.slice(1)), s.grams); }
    function windLabel(s) {
        return !R.SCENES[s.scene].outdoor ? t(s.scene === 'living' ? 'ttFanWind' : 'ttAcWind', s.wind < 0 ? '←' : '→', Math.abs(s.wind)) :
            s.wind === 0 ? t('ttCalm') : t('ttWind', s.wind > 0 ? '→' : '←', Math.abs(s.wind));
    }
    function chosen() { return R.config(Object.fromEntries(Object.entries(fields).map(([key, node]) => [key, node.value]))); }
    function playerName(index) {
        if (isOnline()) return online.game().names[index];
        return ['local', 'online'].includes(match.config.mode) ? t('ttPlayer', index + 1) : index === 0 ? t('ttYou') : t('ttComputer');
    }
    function isCpu() { return match.config.mode === 'cpu' && match.active === 1; }
    function canInput() { return shell && shell.isPlaying() && !isCpu() && !isQa() && !sending && !(online && online.isOpen()) && (match.config.mode !== 'online' || isOnline() && online.canControl()) && ['aim', 'charge'].includes(phase); }
    function modeKey() { const c = match ? match.config : chosen(); return [c.mode, c.scene, c.mode === 'cpu' ? c.difficulty : 'standard'].join('-'); }
    function setupLabel(c) { return t({ practice: 'ttPractice', cpu: 'ttCpu', local: 'ttLocal', qa: 'ttQaName', online: 'ttOnline' }[c.mode]) + ' · ' + t('tt' + c.scene[0].toUpperCase() + c.scene.slice(1)) +
        (c.mode === 'cpu' ? ' · ' + t('tt' + c.difficulty[0].toUpperCase() + c.difficulty.slice(1)) : ''); }
    function syncSettings() {
        const c = chosen();
        const locked = !!(online && online.inRoom());
        Object.values(fields).forEach(field => { field.disabled = locked; });
        $('tt-apply').disabled = locked;
        $('tt-difficulty-field').hidden = c.mode !== 'cpu';
        const different = JSON.stringify(c) !== JSON.stringify(match.config);
        $('tt-pending').hidden = !different;
        $('tt-pending').textContent = different ? t('ttPending', setupLabel(match.config), setupLabel(c)) : '';
        // Drop the retired frame-rate preference when preferences are serialized.
        AC.prefs.set('trash-toss', Object.assign({ version: 3, motion: undefined }, c));
    }
    function cancelCharge() {
        angleHold = null; resetAngleRepeat(); charging = null; pointerId = null; power = 0;
        if (phase === 'charge') phase = 'aim';
    }
    function interruptCharge() {
        if (phase !== 'charge') return;
        cancelCharge(); inputMessage = t('ttInputInterrupted'); sync(); render(true);
    }
    function beginTurn(handoff) {
        cpu.cancel();
        cancelCharge(); time = 0; ball = null; trail = []; result = null; pendingMatch = null;
        previousThrow = last[match.active];
        scene = R.scenario(match.config, match.round, match.seed);
        scene.cleaning = cleaning;
        if (isQa()) { qa.configureScene(scene); scene = qa.environment(scene); }
        if (worldTime === 0 || isQa()) visualRain = scene.rain;
        angle = last[match.active] ? last[match.active].angle : 45;
        phase = handoff ? 'handoff' : 'aim';
        plan = null;
        if (isCpu()) {
            const turn = match;
            cpu.plan(scene, match.config.difficulty, match.seed + match.round * 101 + match.active, worldTime, debris, value => {
                if (match !== turn || !isCpu() || phase !== 'aim') return;
                plan = value;
                // A slow worker may finish after its intended release. Give the
                // CPU a visible release instead of firing during this callback.
                plan.releaseAt = Math.max(plan.releaseAt, time + .15);
                sync();
            });
        }
        sync();
    }
    function reset() {
        cpu.cancel(); previousFrame = null;
        hudAt = -Infinity; paintAt = -Infinity;
        pendingRelease = null; sending = false; inputMessage = '';
        if (isOnline()) { applyOnline(); return; }
        match = R.createMatch(chosen(), Date.now()); last = [null, null]; ghost = []; debris = []; worldTime = 0;
        cleaning = R.createCleaning(); feedback = []; drag = null;
        view.follow();
        qa.clear();
        resultPosition = null; beginTurn(false); syncSettings();
        if (shell) shell.refreshBest();
    }
    function beginCharge(source) {
        if (!canInput() || phase !== 'aim') return;
        inputMessage = ''; angleHold = null; AC.audio.unlock(); charging = source; chargeStart = time; power = 0; phase = 'charge'; sync();
    }
    function release() {
        if (!shell.isPlaying() || phase !== 'charge') return;
        charging = null; pointerId = null;
        if (isOnline()) {
            drag = null; view.follow();
            const submittedAngle = angle, submittedPower = power;
            const attempt = { key: netKey };
            pendingRelease = attempt; inputMessage = '';
            phase = 'sending'; sending = true; sync();
            online.submit(submittedAngle, submittedPower).then(accepted => {
                if (pendingRelease !== attempt) return;
                // The transaction ack can precede the room subscription. Keep the
                // held item and lock this throw until the new sequence is observed.
                if (!accepted) { pendingRelease = null; sending = false; if (phase === 'sending') phase = 'aim'; }
                applyOnline(); sync(); render(true);
            }).catch(() => {
                if (pendingRelease !== attempt) return;
                pendingRelease = null; sending = false; phase = 'aim';
                inputMessage = t('ttNetRetry'); sync(); render(true);
            });
            return;
        }
        drag = null; view.follow();
        ball = R.launch(scene, angle, power, worldTime); trail = [{ x: ball.x, y: ball.y }];
        last[match.active] = { angle, power, item: scene.item, grams: scene.grams,
            scene: scene.scene, wind: scene.wind, weather: scene.weather }; phase = 'flight'; AC.audio.play('click'); sync();
    }
    function startQaThrow(input) {
        if (!isQa() || !shell.isPlaying() || phase !== 'aim') return;
        previousThrow = last[match.active];
        scene = qa.environment(scene, input); visualRain = scene.rain;
        ghost = trail.slice(); debris = []; trail = []; result = null; resultPosition = null;
        angle = input.angle; power = input.power; phase = 'charge';
        qa.record(scene, input); release();
    }
    function clearQa() {
        if (!isQa()) return;
        cancelCharge(); phase = 'aim'; ball = null; debris = []; trail = []; ghost = []; result = null; pendingMatch = null;
        previousThrow = null; last[match.active] = null;
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
        if (isQa()) return scene.freeFlight ? t('ttQaFreeComplete') : result.kind === 'basket' ? t('ttQaBasket', result.points) : t('ttQaComplete');
        if (result.kind === 'basket') return result.penalty ? t('ttBasketAfterHit', result.basketPoints) : t('ttBasket', result.points);
        if (result.kind === 'timeout') return t('ttTimeout');
        if (result.kind === 'obstacle') return t('ttObstacle', t({ boss: 'ttBoss', walker: 'ttWalker', cart: 'ttCart', bird: 'ttBird', files: 'ttFiles', umbrella: 'ttUmbrella', cleaner: 'ttCleaner', worker: 'ttWorker', 'worker-far': 'ttWorker', planks: 'ttPlanks', wheelbarrow: 'ttWheelbarrow', mother: 'ttMother', baby: 'ttBaby', parrot: 'ttParrot', laundry: 'ttLaundry' }[result.obstacle]));
        if (result.blocked) return t('ttBlocked');
        if (result.rim) return t('ttRim');
        return t(resultPosition.x < scene.bins[0].x ? 'ttShort' : resultPosition.x > scene.bins[scene.bins.length - 1].x ? 'ttLong' : 'ttGap');
    }
    function putText(id, value) {
        const node = $(id);
        if (String(node.textContent) !== String(value)) node.textContent = value;
    }
    function sync(force = true) {
        if (!match) return;
        if (!force && (document.hidden || online && online.isOpen())) return;
        // Match the 60 Hz charge calculation; only the other HUD work is capped at 30 Hz.
        if (force || hudPower !== power) {
            if (force || Math.round(hudPower) !== Math.round(power)) $('tt-power-meter').setAttribute('aria-valuenow', Math.round(power));
            hudPower = power; putText('tt-power-value', Math.round(power));
            $('tt-power-fill').style.transform = 'scaleX(' + power / 100 + ')';
        }
        if (!force && worldTime >= hudAt && worldTime - hudAt < 1 / 30 - .0001) return;
        hudAt = worldTime;
        // Angle changes touch only their own controls, not every label.
        const shownAngle = Math.round(angle);
        if (force || hudAngle !== shownAngle) {
            hudAngle = shownAngle; $('tt-angle').value = shownAngle;
            putText('tt-angle-value', shownAngle + '°');
        }
        // Physics and the canvas keep moving; unchanged labels/attributes do not
        // need to be written again on every HUD tick.
        const state = [scene, match, pendingMatch, result, phase, match.active, match.round, match.turn,
            match.scores[0], match.scores[1], previousThrow, last[match.active], debris.length,
            !!(ball && ball.hits.length), sending, inputMessage, canInput(),
            shell && shell.isPlaying(), isOnline() && online.canControl(), AC.i18n.locale,
            !isFree() && ['aim', 'charge'].includes(phase) ? Math.max(0, Math.ceil(R.WORLD.turnSeconds - time)) : 0,
            cleaning.active, cleaning.active && cleaning.active.cleared,
            cleaning.active && worldTime >= cleaning.active.arriveAt];
        if (!force && state.length === hudState.length && state.every((value, i) => value === hudState[i])) return;
        hudState = state;
        const practice = isFree(), scores = (pendingMatch ? pendingMatch.scores : match.scores).slice();
        if (phase === 'flight' && ball.hits.length) scores[match.active] -= 5;
        putText('tt-round', practice ? '∞' : match.round > 5 ? t('ttExtra', match.round - 5) : match.round + ' / 5');
        putText('tt-score-a', isQa() ? result ? result.points : 0 : scores[0]); putText('tt-score-b', scores[1]);
        putText('tt-player-label', isQa() ? t('ttQaScore') : playerName(0)); putText('tt-rival-label', playerName(1));
        $('tt-rival-stat').hidden = practice; $('tt-best-stat').hidden = match.config.mode !== 'cpu';
        $('tt-score-a').parentElement.classList.toggle('is-active', match.active === 0);
        $('tt-rival-stat').classList.toggle('is-active', match.active === 1);
        putText('tt-turn', isQa() ? t('ttQaName') : practice ? t('ttPractice') : t('ttTurn', playerName(match.active)));
        putText('tt-turn-order', practice ? '' : t(match.turn === 0 ? 'ttFirstThrow' : 'ttSecondThrow'));
        putText('tt-material', material(scene));
        $('tt-previous-material').hidden = !previousThrow;
        putText('tt-previous-material', previousThrow ? t('ttPreviousWind', material(previousThrow)) : '');
        putText('tt-points', t('ttPoints', scene.bins.map(bin => bin.points)));
        const nextRound = practice || match.turn === 1 ? match.round + 1 : match.round;
        const nextKey = [match.seed, match.config.mode, match.config.scene, match.config.item, nextRound].join(':');
        if (nextKey !== nextScenarioKey) { nextScenarioKey = nextKey; nextScenario = R.scenario(match.config, nextRound, match.seed); }
        putText('tt-next', t('ttNext', material(nextScenario)));
        $('tt-next').hidden = isQa(); $('tt-qa-panel').hidden = !isQa(); $('tt-qa-hud').hidden = !isQa(); $('tt-qa-legend').hidden = !isQa(); $('tt-normal-controls').hidden = isQa();
        $('stage').parentElement.classList.toggle('is-qa', isQa());
        putText('tt-qa-hud-title', t(scene.freeFlight ? 'ttQaHudFree' : 'ttQaHudBins'));
        qa.ready(isQa() && shell && shell.isPlaying() && phase === 'aim');
        putText('tt-debris', t('ttDebris', debris.length));
        const job = cleaning.active;
        $('tt-cleaning').hidden = !job || isQa();
        putText('tt-cleaning', job ? t(job.cleared ? 'ttCleaned' : worldTime >= job.arriveAt ? 'ttCleaningWork' : 'ttCleaning', job.points) : '');
        putText('tt-weather-name', t('tt' + scene.weather[0].toUpperCase() + scene.weather.slice(1) + 'Weather'));
        $('tt-rain-effect').hidden = !scene.rain;
        putText('tt-wind', windLabel(scene));
        $('tt-previous-wind').hidden = !previousThrow;
        putText('tt-previous-wind', previousThrow ? t('ttPreviousWind', windLabel(previousThrow) +
            (R.SCENES[previousThrow.scene].outdoor ? ' · ' + t('tt' + previousThrow.weather[0].toUpperCase() + previousThrow.weather.slice(1) + 'Weather') : '')) : '');
        $('tt-wind-icon').classList.toggle('is-left', scene.wind < 0);
        const input = canInput();
        for (const id of ['tt-angle', 'tt-angle-down', 'tt-angle-up', 'tt-throw']) $(id).disabled = !input || (phase === 'charge' && id !== 'tt-throw');
        $('tt-throw').classList.toggle('is-charging', phase === 'charge');
        putText('tt-throw-label', t(phase === 'charge' ? 'ttCharging' : input ? 'ttHold' : 'ttWait'));
        const previous = last[match.active];
        putText('tt-last', previous ? material(previous) + ' · ' + t('ttLast', Math.round(previous.angle), Math.round(previous.power)) : t('ttNoLast'));
        $('tt-last-mark').hidden = !previous; if (previous) $('tt-last-mark').style.left = previous.power + '%';
        const status = inputMessage || (sending ? t('ttNetSending') : isOnline() && !online.canControl() && phase === 'aim' ? t('ttNetTurn') : result ? resultText() : phase === 'handoff' ? t('ttHandoff', playerName(match.active)) : phase === 'launch' ? t('ttLaunching') : phase === 'flight' ? t(ball && ball.hits.length ? 'ttHitContinue' : 'ttFlying') : isCpu() ? t('ttCpuAim') : t('ttAim'));
        if ($('tt-status').textContent !== status) putText('tt-status', status);
        $('tt-ready').hidden = phase !== 'handoff'; $('tt-ready').disabled = !shell || !shell.isPlaying();
        putText('tt-clock', !practice && ['aim', 'charge'].includes(phase) && shell && shell.isPlaying() ? t('ttTime', Math.max(0, Math.ceil(R.WORLD.turnSeconds - time))) : '');
    }
    function applyOnline() {
        const g = online && online.game();
        if (!g) return;
        const key = g.matchId + ':' + g.seq;
        const changed = key !== netKey;
        if (changed) {
            previousFrame = null;
            pendingRelease = null; sending = false; inputMessage = '';
            cancelCharge(); netKey = key; netCache = null; result = null; trail = []; feedback = [];
            if (g.status === 'flight') { drag = null; view.follow(); AC.audio.play('click'); }
        }
        const now = online.now();
        const wasLaunched = netCache && netCache.launched;
        if (netCache && Math.floor((now - g.originAt) * .06 + 1e-7) > netCache.world.tick) rememberFrame();
        netCache = window.TrashTossRoom.project(g, now, netCache);
        if (netCache.launched && !wasLaunched) paintAt = -Infinity;
        match = g.match; last = g.last; previousThrow = last[match.active];
        scene = netCache.scene; cleaning = netCache.world.cleaning; worldTime = netCache.world.tick / 60;
        visualRain += R.clamp(scene.rain - visualRain, -.011, .011);
        debris = netCache.world.debris; ball = netCache.ball; trail = netCache.trail; feedback = netCache.feedback;
        result = netCache.result; resultPosition = g.outcome && g.outcome.position;
        pendingMatch = result && g.outcome ? g.outcome.match : null;
        time = Math.max(0, (now - g.turnStartedAt) / 1000);
        if (g.status === 'flight') { angle = g.shot.angle; power = g.shot.power; phase = result ? 'result' : netCache.launched ? 'flight' : 'launch'; }
        else if (g.status === 'over') phase = 'over';
        else if (changed || !['aim', 'charge', 'sending'].includes(phase)) { phase = 'aim'; angle = previousThrow ? previousThrow.angle : 45; }
        if (phase === 'charge') power = R.chargePower(time - chargeStart);
        if (changed) Object.keys(fields).forEach(key => { if (fields[key].value !== match.config[key]) fields[key].value = match.config[key]; });
        if (g.status === 'over' && netFinished !== g.matchId) {
            netFinished = g.matchId;
            const seat = online.seat();
            const score = match.history.filter(entry => entry.player === seat && entry.round <= 5).reduce((total, entry) => total + entry.result.points, 0);
            shell.gameOver({ score, win: match.winner === seat, meta: { scene: match.config.scene, rounds: match.round, online: true, endReason: g.endReason || 'score' } });
        }
    }
    function resetAngleRepeat() {
        angleCarry = 0; angleDirection = 0; angleHeldSeconds = 0;
    }
    function adjustAngle(dt) {
        if (!canInput() || phase !== 'aim') return;
        const keys = shell.keyboard;
        const editing = document.activeElement && document.activeElement.matches('select, input, button:not(#tt-throw)');
        const direction = angleHold ? angleHold.delta : editing ? 0 : (keys.isDown('ArrowRight', 'ArrowUp') ? 1 : 0) - (keys.isDown('ArrowLeft', 'ArrowDown') ? 1 : 0);
        if (direction !== angleDirection) { resetAngleRepeat(); angleDirection = direction; }
        if (direction) {
            const previous = angleHeldSeconds;
            angleHeldSeconds += dt;
            // A short tap is exactly one degree; sustained input repeats after a grace period.
            const repeatSeconds = Math.max(0, angleHeldSeconds - ANGLE_REPEAT_DELAY) - Math.max(0, previous - ANGLE_REPEAT_DELAY);
            angleCarry += direction * repeatSeconds * ANGLE_REPEAT_SPEED;
            if (Math.abs(angleCarry) >= 1) { const delta = Math.trunc(angleCarry); angle = R.clamp(angle + delta, 15, 80); angleCarry -= delta; }
        }
    }
    function rememberFrame() {
        const bodies = new Map();
        for (const body of ball ? [...debris, ball] : debris) if (!body.resting && !body.removed) {
            bodies.set(body, { x: body.x, y: body.y, rotation: body.rotation });
        }
        previousFrame = { time: worldTime, bodies };
    }
    function update(dt) {
        if (isOnline()) {
            // Room deadlines/presence keep running, but a covered/hidden field
            // needs no local replay. Reconstruct it exactly when shown again.
            if (document.hidden || online.isOpen()) return;
            adjustAngle(dt); return;
        }
        rememberFrame();
        worldTime += dt;
        const rainStep = dt * .65;
        visualRain += R.clamp(scene.rain - visualRain, -rainStep, rainStep);
        for (const scrap of debris) if (!scrap.resting) R.advance(scene, scrap, dt, debris, true);
        R.advanceCleaning(scene, cleaning, debris, worldTime);
        debris = debris.filter(scrap => !scrap.removed);
        feedback = feedback.filter(event => worldTime - event.time < 1.5);
        if (phase === 'handoff') { sync(false); return; }
        if (phase === 'result') {
            resultTime += dt;
            if (isQa()) { if (resultTime >= R.WORLD.resultSeconds) { phase = 'aim'; sync(false); } return; }
            if (resultTime >= R.WORLD.resultSeconds) {
                const previousPlayer = match.active;
                if (match.config.mode === 'practice') ghost = trail.slice();
                match = pendingMatch;
                if (match.over) {
                    const regulationScore = match.history.filter(entry => entry.player === 0 && entry.round <= 5).reduce((total, entry) => total + entry.result.points, 0);
                    phase = 'over'; shell.gameOver({ score: regulationScore, win: match.winner === 0,
                        meta: { scene: match.config.scene, rounds: match.round } }); sync(false); return;
                }
                beginTurn(match.config.mode === 'local' && previousPlayer !== match.active);
            }
            return;
        }
        time += dt;
        if (phase === 'flight') {
            const hadHit = ball.hits.length > 0;
            R.advance(scene, ball, dt, debris);
            if (!hadHit && ball.hits.length) feedback.push({ x: ball.x, y: ball.y, time: worldTime });
            if (isQa()) qa.live(scene, ball);
            trail.push({ x: ball.x, y: ball.y });
            if (ball.result) finish(ball.result);
        } else {
            if (isCpu() && plan) {
                angle = plan.angle;
                if (phase === 'aim' && time >= plan.releaseAt - plan.power / 100 * R.WORLD.chargeSeconds) {
                    phase = 'charge'; chargeStart = plan.releaseAt - plan.power / 100 * R.WORLD.chargeSeconds;
                }
            } else if (phase === 'aim') {
                adjustAngle(dt);
            }
            if (phase === 'charge') {
                power = R.chargePower(time - chargeStart);
                if (isCpu() && time >= plan.releaseAt) { power = plan.power; release(); }
            }
            if (['aim', 'charge'].includes(phase) && !isFree() && time >= R.WORLD.turnSeconds) finish({ kind: 'timeout', points: 0 });
        }
        sync(false);
    }
    function render(force) {
        if (document.hidden || online && online.isOpen()) return;
        const now = window.performance ? window.performance.now() : worldTime * 1000;
        const interval = 1000 / 60;
        // At 60 Hz, +/-1 ms RAF jitter must not discard every early callback.
        // A quarter interval tolerates jitter while still skipping 120 Hz's
        // intermediate callbacks, which arrive half an interval apart.
        const tolerance = interval / 4;
        if (force !== true && now < paintAt + interval - tolerance) return;
        // Retain the RAF phase even after a missed deadline; do not reset it at
        // two intervals and turn one late callback into repeated dropped frames.
        paintAt = force !== true && Number.isFinite(paintAt) && now >= paintAt ?
            paintAt + Math.max(1, Math.floor((now - paintAt + tolerance) / interval)) * interval : now;
        if (isOnline() && shell && shell.isPlaying()) { applyOnline(); sync(false); }
        if (shell && !shell.isPlaying()) sync();
        let alpha = typeof force === 'number' ? R.clamp(force, 0, 1) : 1;
        if (isOnline() && previousFrame && worldTime > previousFrame.time) {
            const target = (online.now() - online.game().originAt) / 1000 - 1 / 60;
            alpha = R.clamp((target - previousFrame.time) / (worldTime - previousFrame.time), 0, 1);
        }
        view.render({ scene, time: worldTime, visualRain, angle, ball, trail, ghost, reference: isQa() ? qa.baseline() : null, result: isQa() ? null : result, debris, resultPosition, feedback,
            previous: shell && shell.isPlaying() && force !== true ? previousFrame : null, alpha,
            binContents: R.binContents(scene, debris), players: isFree() ? 1 : 2, active: match.active,
            playerLabels: ['P1', match.config.mode === 'cpu' ? 'CPU' : 'P2'],
            practice: isFree(), qa: isQa(),
            charging: phase === 'charge', aiming: ['aim', 'charge', 'handoff', 'sending', 'launch'].includes(phase) });
    }
    // Capture before the shared shell: the Space that starts a game must not also charge it.
    window.addEventListener('keydown', e => {
        if (!shell) return;
        if (isOnline() && phase === 'over' && ['Space', 'Enter'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); online.playAgain(); return; }
        const editing = e.target instanceof Element && e.target.closest('select, input, button') && e.target !== $('tt-throw');
        if (editing) { e.stopImmediatePropagation(); return; }
        if (online && online.isOpen()) { e.stopImmediatePropagation(); return; }
        if (online && !isOnline() && chosen().mode === 'online' && ['Space', 'Enter'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); online.open(); return; }
        if (!shell.isPlaying()) { if (e.code === 'Space') e.preventDefault(); return; }
        if (e.key.startsWith('Arrow') && canInput()) {
            e.preventDefault();
            if (!e.repeat && phase === 'aim') {
                resetAngleRepeat();
                angle = R.clamp(angle + (['ArrowRight', 'ArrowUp'].includes(e.key) ? 1 : -1), 15, 80); sync();
            }
        }
        if (e.code !== 'Space' && !(e.code === 'Enter' && e.target === $('tt-throw'))) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (!e.repeat) beginCharge('key:' + e.code);
    }, true);
    window.addEventListener('keyup', e => {
        if (e.key && e.key.startsWith('Arrow')) resetAngleRepeat();
        if (charging === 'key:' + e.code) { e.preventDefault(); release(); }
    }, true);
    shell = AC.shell.create({ gameId: 'trash-toss', mode: modeKey, step: 1 / 60, restartToReady: true,
        canRecord: () => match.config.mode === 'cpu',
        preventKeys: [], update, render, reset, canPause: () => !isOnline(), canRestart: () => !(online && online.inRoom()),
        onStart() {
            if (isOnline()) { applyOnline(); sync(); return; }
            if (JSON.stringify(chosen()) !== JSON.stringify(match.config)) reset(); sync();
            if (view.isPortrait() && !isQa()) $('stage').parentElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
        },
        onPause() { cancelCharge(); sync(); }, onResume: sync,
        overlayContent(state) {
            if (state === 'idle') return { title: t(chosen().mode === 'qa' ? 'ttQaName' : 'ttReadyTitle'),
                message: t(chosen().mode === 'qa' ? 'ttQaIntro' : 'ttIntro'), button: t('ttStart'), hint: setupLabel(chosen()) };
            if (state === 'over') return { badge: match.winner == null ? 'gamepad-2' : 'trophy',
                title: match.winner == null ? t('ttDraw') : t('ttWinner', playerName(match.winner)),
                message: t('ttFinal', match.scores[0], match.scores[1]) + (isOnline() && online.game().endReason ? ' · ' + t(online.game().endReason === 'disconnected' ? 'ttNetExpired' : online.game().endReason === 'left' ? 'ttNetLeft' : 'ttNetLost') : ''), button: t('ttAgain'), hint: setupLabel(match.config) };
            return {};
        },
    });
    // The shell does not call reset during construction.
    reset(); render();
    Object.values(fields).forEach(field => field.addEventListener('input', () => { syncSettings(); shell.refreshOverlay(); }));
    $('tt-apply').addEventListener('click', () => {
        if (online && online.inRoom()) return;
        shell.goIdle(); sync(); if (chosen().mode === 'online' && online) online.open();
    });
    $('tt-ready').addEventListener('click', () => { if (shell.isPlaying()) { phase = 'aim'; sync(); } });
    $('stage').addEventListener('pointerdown', e => {
        if (!view.canPan() || e.button !== 0 || e.isPrimary === false) return;
        const overview = view.beginPan(e.clientX, e.clientY);
        drag = { id: e.pointerId, startX: e.clientX, startY: e.clientY, lastX: e.clientX, moving: overview };
        $('stage').setPointerCapture(e.pointerId);
        if (overview) render(true);
    });
    $('stage').addEventListener('pointermove', e => {
        if (!drag || drag.id !== e.pointerId) return;
        if (!drag.moving && Math.abs(e.clientX - drag.startX) > 6 && Math.abs(e.clientX - drag.startX) > Math.abs(e.clientY - drag.startY)) drag.moving = true;
        if (drag.moving) { e.preventDefault(); view.panBy(e.clientX - drag.lastX, drag.startY, e.clientX); render(true); }
        drag.lastX = e.clientX;
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('stage').addEventListener(type, () => { drag = null; });
    $('tt-angle').addEventListener('input', e => { if (canInput() && phase === 'aim') { angle = Number(e.target.value); sync(); } });
    for (const [id, delta] of [['tt-angle-down', -1], ['tt-angle-up', 1]]) {
        const button = $(id);
        button.addEventListener('pointerdown', e => {
            if (e.button !== 0 || e.isPrimary === false || !canInput() || phase !== 'aim') return;
            e.preventDefault(); angle = R.clamp(angle + delta, 15, 80); resetAngleRepeat();
            angleHold = { id: e.pointerId, delta }; button.setPointerCapture(e.pointerId); sync();
        });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => { angleHold = null; resetAngleRepeat(); });
        button.addEventListener('click', e => {
            if (e.detail === 0 && canInput() && phase === 'aim') { angle = R.clamp(angle + delta, 15, 80); sync(); }
        });
        button.addEventListener('contextmenu', e => e.preventDefault());
    }
    $('tt-throw').addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.isPrimary === false || !canInput() || phase !== 'aim') return;
        e.preventDefault(); beginCharge('pointer'); pointerId = e.pointerId;
        try { $('tt-throw').setPointerCapture(e.pointerId); } catch (_) { /* Window/touch release still works without capture. */ }
    });
    window.addEventListener('pointerup', e => { if (charging === 'pointer' && e.pointerId === pointerId) release(); }, true);
    window.addEventListener('touchend', e => { if (!e.touches.length && charging === 'pointer') release(); }, { capture: true, passive: true });
    window.addEventListener('pointercancel', e => { if (e.pointerId === pointerId) interruptCharge(); }, true);
    // Losing capture alone is not a cancelled gesture. Window pointerup/touchend
    // still releases the throw; pointercancel or blur explicitly cancels it.
    $('tt-throw').addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => { drag = null; if (phase === 'charge') interruptCharge(); else cancelCharge(); if (shell.isPlaying()) shell.pause(); });
    window.addEventListener('resize', () => { view.fit(); render(true); });
    window.addEventListener('pagehide', event => { if (!event.persisted) cpu.destroy(); });
    if (window.createTrashTossOnline) {
        online = window.createTrashTossOnline({ settings: chosen,
            message: text => { inputMessage = text; sync(); },
            onOpen() { cancelCharge(); if (!isOnline() && shell.isPlaying()) shell.pause(); },
            onClose() { inputMessage = ''; if (isOnline()) applyOnline(); shell.refreshOverlay(); sync(); render(true); },
            onError(text) { cancelCharge(); inputMessage = text; sync(); },
            onConnection(connected, text) {
                if (!online.inRoom()) return;
                if (!connected) { cancelCharge(); inputMessage = text; }
                else {
                    if (inputMessage === t('ttNetReconnecting')) inputMessage = '';
                    if (isOnline()) applyOnline();
                }
                sync();
            },
            onChange(data) {
                const g = data && data.game;
                if (g && g.matchId) {
                    const fresh = !netKey.startsWith(g.matchId + ':');
                    applyOnline(); syncSettings();
                    if (g.status !== 'over' && !shell.isPlaying()) {
                        if (fresh) view.follow();
                        if (shell.state !== 'idle') shell.goIdle();
                        shell.start();
                    }
                    sync(); render(); shell.syncButtons();
                } else {
                    const waitingScene = data && data.options && data.options.scene;
                    const changedScene = waitingScene && waitingScene !== match.config.scene;
                    if (waitingScene) fields.scene.value = waitingScene;
                    const wasOnline = !!netKey;
                    netKey = ''; netCache = null; netFinished = ''; sending = false;
                    if (wasOnline || changedScene) { fields.mode.value = 'online'; shell.goIdle(); }
                    syncSettings(); shell.syncButtons();
                }
            },
        });
        $('tt-online-room').addEventListener('click', () => online.open());
        $('overlay-btn').addEventListener('click', e => {
            if (chosen().mode !== 'online' && !isOnline()) return;
            e.preventDefault(); e.stopImmediatePropagation(); if (isOnline() && phase === 'over') online.playAgain(); else online.open();
        }, true);
    }
    AC.i18n.subscribe(() => { syncSettings(); sync(); render(true); });
})();
