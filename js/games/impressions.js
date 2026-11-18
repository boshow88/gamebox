/* Shared Impressions presentation/local practice. Category mechanics remain pure. */
(function () {
    'use strict';
    var AC = window.ArcadeCommon, Color = window.ImpressionsColor, Rules = window.ImpressionsRules, Match = window.ImpressionsMatch;
    var Categories = window.ImpressionsCategories, Quantity = window.ImpressionsQuantity, Pitch = window.ImpressionsPitch, Progression = window.ImpressionsProgression;
    var DEFAULTS = Object.freeze({ timing: Rules.defaults.timing, generation: Color.defaults.generation,
        scoring: Color.defaults.scoring, initialAnswer: Object.freeze([128, 128, 128]), categoryMode: 'weighted', selectionVersion: 3, categoryWeights: Progression.defaults.weights, adaptive: Progression.defaults.adaptive, quantity: Quantity.defaults, pitch: Pitch.defaults });
    Object.assign(AC.i18n.STRINGS.en, {
        impressionsWeighted: 'Mixed categories', impressionsWeightedIdleTitle: 'A quick look. A short listen.', impressionsWeightedIdleMessage: 'Choose your mix of color, quantity and pitch.', impressionsFrequencyOff: 'Off', impressionsFrequencyLow: 'Low', impressionsFrequencyMedium: 'Medium', impressionsFrequencyHigh: 'High', impressionsAdaptive: 'Adaptive difficulty', impressionsInitialDifficulty: 'Starting difficulty', impressionsPracticeSettings: 'Practice settings',
        impressionsNoCategories: 'Enable at least one category before starting.', impressionsFrequencyNote: 'Percentages show relative frequency, not an exact number of rounds.',
        impressionsName: 'Impressions', impressionsColor: 'Color', impressionsLocal: 'Local practice', impressionsRound: 'Round',
        impressionsPhases: 'Round phases', impressionsPrepare: 'Prepare', impressionsMemorize: 'Notice', impressionsRecreate: 'Recreate', impressionsResults: 'Compare',
        impressionsTimeLeft: 'Time remaining', impressionsSeconds: 'sec', impressionsPreview: 'Color preview', impressionsControls: 'RGB controls',
        impressionsMix: 'Mix your color', impressionsRed: 'Red', impressionsGreen: 'Green', impressionsBlue: 'Blue',
        impressionsWheelHelp: 'Drag up or down · ± for precision',
        impressionsOriginal: 'Original', impressionsYourColor: 'Your color', impressionsStart: 'Start round', impressionsSubmit: 'Lock answer', impressionsNext: 'Next round',
        impressionsIdleTitle: 'Recreate a color.', impressionsIdleMessage: 'Notice the color, then match it with the wheels.',
        impressionsPrepareTitle: 'Get ready', impressionsPrepareMessage: 'Notice its lightness, warmth and intensity.',
        impressionsMemorizeTitle: 'Take in the color', impressionsMemorizeMessage: 'Notice its brightness, warmth, and intensity.',
        impressionsAnswerTitle: 'Recreate the color', impressionsAnswerMessage: 'Turn the wheels until it feels right.',
        impressionsResultsTitle: 'How close was it?', impressionsResultsMessage: 'Compare the original with your answer.',
        impressionsIdleCover: 'Your wheels will unlock after memorizing.', impressionsPrepareCover: 'Take in the target before adjusting.',
        impressionsMemorizeCover: 'Just look. No adjustments yet.', impressionsReadyLabel: 'Next round',
        impressionsMemorizeLabel: 'Remember this color', impressionsAnswerLabel: 'Your reconstruction', impressionsCompareLabel: 'Color comparison',
        impressionsLocked: 'Answer locked', impressionsAutoLocked: 'Time’s up · saved', impressionsSimilarity: 'Similarity',
        impressionsIdleFeedback: 'Your answer', impressionsIdleDescription: 'Closer is better',
        impressionsPlayingFeedback: 'Your answer', impressionsPlayingDescription: 'Closer is better',
        impressionsExact: 'Almost identical', impressionsExcellent: 'Very close', impressionsClose: 'Close', impressionsPractice: 'Try another round',
        impressionsOutOf100: '/ 100', impressionsUnavailable: 'This round could not start. Please reload and try again.',
        impressionsWaitingTitle: 'Answer locked', impressionsWaitingMessage: 'Waiting for the remaining answers or the shared deadline.',
        impressionsSending: 'Sending answer…', impressionsRetry: 'Retry submission', impressionsCalculating: 'Comparing everyone’s answers…',
        impressionsMissing: 'No accepted answer', impressionsWatching: 'Watching this round', impressionsWatchMessage: 'You are out of HP. Stay to see who wins.',
        impressionsEndedEarly: 'Round ended early',
        impressionsLobbyTitle: 'Your room is ready', impressionsLobbyMessage: 'Open the room to get ready and start a match.', impressionsRoom: 'Room',
        impressionsOnlineHelp: 'Everyone gets the same target and time limit. Answers lock when sent. Automatic submission starts just before the deadline; answers that arrive late score zero.',
        impressionsHelpFlow: 'Look at the color for {memorize} seconds, then recreate it within {answer} seconds. Lock it in when ready; your current answer is submitted when time runs out.',
        impressionsHelpControls: 'Drag a wheel up or down. Use ± or arrow keys for small adjustments; hold Shift for finer control. Page Up/Down changes by 16; Home/End jumps to a limit.',
        impressionsHelpScore: 'Closer colors score higher. Speed does not affect the score. Each answer starts from the same neutral gray.',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        impressionsWeighted: '混合題型', impressionsWeightedIdleTitle: '看一眼，聽一段。', impressionsWeightedIdleMessage: '挑選色彩、數量與音高的出題頻率。', impressionsFrequencyOff: '關閉', impressionsFrequencyLow: '低', impressionsFrequencyMedium: '中', impressionsFrequencyHigh: '高', impressionsAdaptive: '自適應難度', impressionsInitialDifficulty: '起始難度', impressionsPracticeSettings: '練習設定',
        impressionsNoCategories: '請先啟用至少一個題型，才能開始。', impressionsFrequencyNote: '百分比代表出題機會，不保證每場比例相同。',
        impressionsName: '印象派', impressionsColor: '色彩', impressionsLocal: '本機練習', impressionsRound: '回合',
        impressionsPhases: '回合階段', impressionsPrepare: '準備', impressionsMemorize: '留意', impressionsRecreate: '重現', impressionsResults: '比較',
        impressionsTimeLeft: '剩餘時間', impressionsSeconds: '秒', impressionsPreview: '色彩預覽', impressionsControls: 'RGB 調整控制',
        impressionsMix: '調出記憶中的顏色', impressionsRed: '紅色', impressionsGreen: '綠色', impressionsBlue: '藍色',
        impressionsWheelHelp: '上下拖曳調整 · 用 ± 精準微調',
        impressionsOriginal: '原來的顏色', impressionsYourColor: '你的顏色', impressionsStart: '開始回合', impressionsSubmit: '鎖定答案', impressionsNext: '下一回合',
        impressionsIdleTitle: '重現一個顏色。', impressionsIdleMessage: '留意顏色的明暗與濃淡，再用滾輪調回來。',
        impressionsPrepareTitle: '準備看顏色', impressionsPrepareMessage: '留意顏色的明暗、冷暖與濃淡。',
        impressionsMemorizeTitle: '留意這個顏色', impressionsMemorizeMessage: '留意它的明暗、冷暖與濃淡。',
        impressionsAnswerTitle: '把顏色調回來', impressionsAnswerMessage: '轉動滾輪，調到感覺對了為止。',
        impressionsResultsTitle: '有多接近？', impressionsResultsMessage: '看看原色與答案的差別。',
        impressionsIdleCover: '記住顏色後，就能開始調整。', impressionsPrepareCover: '????????????',
        impressionsMemorizeCover: '先專心看，稍後再調整。', impressionsReadyLabel: '???',
        impressionsMemorizeLabel: '記住這個顏色', impressionsAnswerLabel: '你重現的顏色', impressionsCompareLabel: '色彩比較',
        impressionsLocked: '答案已鎖定', impressionsAutoLocked: '時間到 · 已儲存', impressionsSimilarity: '相似程度',
        impressionsIdleFeedback: '????', impressionsIdleDescription: '????????',
        impressionsPlayingFeedback: '你的答案', impressionsPlayingDescription: '越接近，分數越高',
        impressionsExact: '幾乎一致', impressionsExcellent: '很接近', impressionsClose: '接近了', impressionsPractice: '再試一題',
        impressionsOutOf100: '/ 100', impressionsUnavailable: '無法開始這個回合，請重新載入後再試。',
        impressionsWaitingTitle: '答案已鎖定', impressionsWaitingMessage: '等待其他玩家完成，或共同作答時間結束。',
        impressionsSending: '正在送出答案…', impressionsRetry: '重試送出', impressionsCalculating: '正在比較大家的答案…',
        impressionsMissing: '沒有成功提交的答案', impressionsWatching: '本回合觀戰中', impressionsWatchMessage: '你的 HP 已歸零，可以留下來看最後誰勝出。',
        impressionsEndedEarly: '回合提前結束',
        impressionsLobbyTitle: '房間準備好了', impressionsLobbyMessage: '打開房間，確認準備狀態後開始對戰。', impressionsRoom: '房間',
        impressionsOnlineHelp: '大家的題目與時間相同。答案送出後就會鎖定，未鎖定的答案會在截止前自動送出；逾時未送達則以零分計算。',
        impressionsHelpFlow: '留意顏色{memorize}秒，再在{answer}秒內調回來。完成後鎖定答案，時間到則會自動送出。',
        impressionsHelpControls: '上下拖曳滾輪調整，用±或方向鍵微調。按住Shift可以調得更細，Page Up／Down每次調整16，Home／End直接調到兩端。',
        impressionsHelpScore: '顏色越接近，分數越高，作答速度不影響分數。每題都從同一個中性灰色開始。',
    });
    function cssColor(rgb) { return 'rgb(' + rgb.join(',') + ')'; }
    Object.assign(AC.i18n.STRINGS.en, {
        impressionsCategoryMode: 'Question categories', impressionsColorOnly: 'Color only', impressionsQuantityOnly: 'Quantity only', impressionsMixed: 'Mixed · alternating',
        impressionsQuantity: 'Quantity', impressionsOriginalQuantity: 'Original quantity', impressionsYourQuantity: 'Your quantity', impressionsQuantityMix: 'Recreate the quantity', impressionsCount: 'Dot count',
        impressionsQuantityWheelHelp: 'Drag for large changes · ± / arrows for one · Page Up / Down for 25',
        impressionsQuantityIdleTitle: 'Estimate the quantity.', impressionsQuantityIdleMessage: 'Look at the dots, then bring the quantity back.',
        impressionsQuantityPrepareTitle: 'Get ready to estimate', impressionsQuantityPrepareMessage: 'One collection of dots. Take it all in.',
        impressionsQuantityMemorizeTitle: 'Remember this quantity', impressionsQuantityMemorizeMessage: 'Notice how many dots fill the space.',
        impressionsQuantityAnswerTitle: 'Recreate the quantity', impressionsQuantityAnswerMessage: 'Turn the wheel to add or remove dots.',
        impressionsQuantityResultsTitle: 'How close was your estimate?', impressionsQuantityResultsMessage: 'Compare the original and your quantity.',
        impressionsQuantityHelp: 'Look at how many dots there are, then adjust the wheel to bring them back. Adding or removing dots leaves the other dots in place. Matching the count recreates the original arrangement.',
        impressionsQuantityClose: 'Close estimate', impressionsQuantityAccuracy: 'Quantity accuracy', impressionsCategoryLocked: 'Wait until the round ends to change categories.',
        impressionsQuantityComparison: 'Quantity comparison', impressionsQuantityHelpScore: 'The score compares the count difference with the original quantity. Speed does not affect it. Each answer starts with {initial} dots.',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        impressionsCategoryMode: '題型', impressionsColorOnly: '只玩色彩', impressionsQuantityOnly: '只玩數量', impressionsMixed: '混合 · 交替出題',
        impressionsQuantity: '數量', impressionsOriginalQuantity: '原本的數量', impressionsYourQuantity: '你的數量', impressionsQuantityMix: '重現點點的數量', impressionsCount: '點的數量',
        impressionsQuantityWheelHelp: '拖曳快速增減 · ±／方向鍵微調 1 · Page Up／Down 調整 25',
        impressionsQuantityIdleTitle: '憑印象估數量。', impressionsQuantityIdleMessage: '留意點點的數量，再用滾輪重現。',
        impressionsQuantityPrepareTitle: '準備估計下一組數量', impressionsQuantityPrepareMessage: '一組靜止的點，專心看就好。',
        impressionsQuantityMemorizeTitle: '記住這些點的數量', impressionsQuantityMemorizeMessage: '留意點點填滿空間的感覺。',
        impressionsQuantityAnswerTitle: '重現你記得的數量', impressionsQuantityAnswerMessage: '轉動滾輪，增加或移除點點。',
        impressionsQuantityResultsTitle: '你的估計有多接近？', impressionsQuantityResultsMessage: '把原本的點陣與你的數量放在一起看看。',
        impressionsQuantityHelp: '留意點點的數量，再用滾輪重現。增減數量時，其他點會留在原位；數量相同時，排列也會相同。',
        impressionsQuantityClose: '估得很接近', impressionsQuantityAccuracy: '數量準確度', impressionsCategoryLocked: '請等本回合結束後再更換題型。',
        impressionsQuantityComparison: '數量比較', impressionsQuantityHelpScore: '分數取決於數量差距占原數量的比例，作答速度不影響。每題從{initial}個點開始調整。',
    });
    function hexColor(rgb) { return '#' + rgb.map(function (n) { return n.toString(16).padStart(2, '0'); }).join('').toUpperCase(); }
    Object.assign(AC.i18n.STRINGS.en,{impressionsRandomNote: 'Percentages show the chance of each category, not exact totals. Question difficulty varies. Quantity advances after every human locks in an exact answer on time.'});
    Object.assign(AC.i18n.STRINGS.zh,{impressionsRandomNote: '百分比代表出題機會，不保證每場比例相同。每題難度會變化；數量題在所有真人玩家都準時鎖定正確答案後才會升級。'});
    function configuration(input) {
        input = input || {};
        var answer = input.initialAnswer === undefined ? DEFAULTS.initialAnswer : input.initialAnswer;
        if (!Color.validateAnswer(answer)) throw new TypeError('Invalid initial reconstruction color.');
        return Object.assign({ timing: Rules.timingParameters(input.timing) }, Categories.configuration(input));
    }
    function create(options) {
        var root = options.root, doc = root.ownerDocument, config = configuration(options.config);
        var localNow = options.now || function () { return performance.now(); };
        var seedSource = options.seedSource || function () { return crypto.getRandomValues(new Uint32Array(1))[0]; };
        var listeners = new AbortController(), destroyed = false, timer = null, wheels = [];
        var phase = 'idle', round = 0, question = null, timeline = null, result = null;
        var draft = Categories.initialAnswer({ type: Categories.forRound(config.categoryMode, 1, config.selectionVersion) }, config), locked = null, resultAt = 0, reason = null;
        var localConfig = config, shared = null, sharedKey = null, autoAttempted = false, ticking = false, localProgression = null;
        var playtestObserver = null, playtestLocalEpoch = 1, playtestMatches = new Map(), playtestResultKey = null;
        function observePlaytest(type, build) {
            if (!playtestObserver) return;
            // Copy only after settlement (or a small timing-only submission event).
            // Defer diagnostics until the current gameplay/submission call returns.
            try {
                var callback = playtestObserver, event = JSON.parse(JSON.stringify(build()));
                setTimeout(function () { if (callback === playtestObserver) { try { callback(type, event); } catch (_) {} } }, 0);
            } catch (_) { /* Diagnostic failures must never affect gameplay. */ }
        }
        function playtestMatchId(game) {
            if (!playtestMatches.has(game.matchId)) playtestMatches.set(game.matchId, 'online-' + (playtestMatches.size + 1));
            return playtestMatches.get(game.matchId);
        }
        function observeAttempt(source) {
            observePlaytest('attempt', function () { return { matchId: playtestMatchId(shared.game), round: round,
                source: source, elapsedMs: now() - timeline.answerAt }; });
        }
        var quantityWheel = null, quantityMaximum = null, poolKey = null, dotPool = null;
        var dotPreview = window.ImpressionsDots.create(root.querySelector('#impressions-dot-preview'));
        var targetDots = window.ImpressionsDots.create(root.querySelector('#impressions-target-dots'));
        var answerDots = window.ImpressionsDots.create(root.querySelector('#impressions-answer-dots'));
        function now() { return shared ? shared.now() : localNow(); }
        var t = AC.i18n.t;
        function get(id) { return root.querySelector('#impressions-' + id); }
        var dom = { title: get('phase-title'), message: get('phase-message'), seconds: get('seconds'), timer: get('timer'),
            timeFill: get('time-fill'), preview: get('preview'), previewCover: get('preview-cover'), countdown: get('countdown'),
            previewLabel: get('preview-label'), controlsCover: get('controls-cover'), controlsNote: get('controls-note'),
            action: get('action'), score: get('score'), scoreMax: get('score-max'), scoreDescription: get('score-description'), feedbackLabel: get('feedback-label'),
            comparison: get('comparison'), targetSwatch: get('target-swatch'), answerSwatch: get('answer-swatch'),
            targetHex: get('target-hex'), answerHex: get('answer-hex'), lockLabel: get('lock-label'), round: get('round') };
        function text(element, value) { if (element.textContent !== value) element.textContent = value; }
        var pitchView = window.ImpressionsPitchView.create({ root: root,
            canChange: function () { tick(); return !destroyed && isPitch() && phase === 'answer'; },
            onEnable: function(){if(audioSetupHandler)audioSetupHandler();else{get('local-audio').hidden=false;audioPanel('local');get('enable-audio').focus();}},
            onChange: function (index, hz) { draft[question && question.version === 2 ? question.tones[index] : index] = hz; } });
        var audioListeners=new Set(),audioSetupHandler=null,audioSetupRequested=false,audioRoomRequired=true,practiceResultListeners=new Set(),practiceResultSerial=0;
        var audioSetup=window.ImpressionsAudioReadiness.create({ready:pitchView.ready,muted:AC.audio.isMuted,hidden:function(){return doc.hidden;},test:pitchView.testSound,recover:pitchView.recover,onChange:function(state){if(state.confirmed&&state.usable)audioSetupRequested=false;renderAudioSetup();audioListeners.forEach(function(fn){fn();});queueMicrotask(function(){if(!destroyed)tick();});}});
        function renderAudioSetup(){
            var s=audioSetup.state(),duringMemory=isPitch()&&phase==='memorize';
            get('audio-setup').dataset.audioState=s.status;
            text(get('audio-instruction'),t(duringMemory?'impressionsAudioDuringMemory':get('audio-setup').parentNode===get('room-audio')?audioRoomRequired?'impressionsAudioInstruction':'impressionsAudioOptionalInstruction':'impressionsAudioLocalInstruction'));
            if(shared&&shared.game&&shared.game.status==='playing'&&!s.confirmed)text(get('audio-instruction'),t('impressionsAudioActiveRecovery')+' '+get('audio-instruction').textContent);
            text(get('enable-audio'),t('impressionsAudioTest'));get('enable-audio').disabled=s.busy||s.recovering||duringMemory;get('enable-audio').hidden=s.confirmed;
            text(get('confirm-audio'),t('impressionsAudioConfirm'));get('confirm-audio').disabled=!s.tested||!s.usable||s.busy||s.recovering;get('confirm-audio').hidden=s.confirmed;
            text(get('repeat-audio'),t('impressionsAudioRepeat'));get('repeat-audio').hidden=!s.confirmed;
            text(get('local-audio-status'),t(s.busy?'impressionsAudioTesting':{needed:'impressionsAudioNeeded',tested:'impressionsAudioTested',confirmed:'impressionsAudioConfirmed',unavailable:'impressionsAudioUnavailable',recovering:'impressionsAudioRecovering'}[s.status]));
        }
        function audioPanel(location,required){if(required!==undefined)audioRoomRequired=!!required;var host=get(location==='room'?'room-audio':'local-audio');if(get('audio-setup').parentNode!==host)host.append(get('audio-setup'));renderAudioSetup();}
        function showAudioSetup(){audioSetupRequested=true;if(shared&&audioSetupHandler){audioSetupHandler();return;}audioPanel('local');get('local-audio').hidden=false;get('enable-audio').focus({preventScroll:true});get('audio-setup').scrollIntoView({block:'center',behavior:'instant'});}
        function audioConfirmed(){var s=audioSetup.state();return s.confirmed&&s.usable&&!AC.audio.isMuted();}
        var groupsView = window.ImpressionsQuantityGroupsView.create({ root: root,
            canChange: function () { tick(); return !destroyed && isMultiQuantity() && phase === 'answer'; },
            onChange: function (id, value) { draft[id] = value; } });
        var colorView = window.ImpressionsColorView.create({ root: root,
            canChange: function () { tick(); return !destroyed && isModernColor() && phase === 'answer'; },
            onAnswer: function (rgb) { draft = rgb.slice(); },
            onChange: function (id, value) { draft[id] = value; } });
        function stopTimer() { if (timer !== null) { clearTimeout(timer); timer = null; } }
        function category() { return question ? question.type : config.categoryMode === 'weighted' ? 'color' : Categories.forRound(config.categoryMode, Math.max(1, round), config.selectionVersion); }
        function isQuantity() { return category() === 'quantity'; }
        function isMultiQuantity() { return !!question && question.type === 'quantity' && question.version === 2; }
        function isPitch() { return category() === 'pitch'; }
        function isModernColor() { return category() === 'color' && (question ? [2, 3].includes(question.version) : config.color && [1, 2].includes(config.color.variantSelectionVersion)); }
        function updateColor() { colorView.update({ phase: phase, question: isModernColor() ? question || { type: 'color', version: config.color.variantSelectionVersion === 2 ? 3 : 2, variant: 'single' } : null, config: config,
            key: (shared && shared.game ? shared.game.matchId : 'local') + ':' + round + ':' + (question && question.seed), draft: question ? draft : config.color.variantSelectionVersion === 2 ? window.ImpressionsColorSingle.initialAnswer(config.color) : config.color.initialHsl, answer: locked, active: !shared || shared.active }); }
        function updateGroups() { groupsView.update({ phase: phase, question: isMultiQuantity() ? question : null, config: config, draft: draft, answer: locked, active: !shared || shared.active }); }
        function updatePitch() { pitchView.update({ phase: phase, question: isPitch() ? question : null, config: config, timeline: timeline, now: now(), showEnable: !!shared && !!shared.game,
            key: (shared && shared.game ? shared.game.matchId : 'local') + ':' + round + ':' + (question && question.seed), draft: draft, answer: locked, active: !shared || shared.active }); }
        function preparePool() {
            if (!question || question.type !== 'quantity') return;
            var key = question.seed + ':' + JSON.stringify(config.quantity.generation);
            if (poolKey !== key) {
                poolKey = key; dotPool = Quantity.createPool(question.seed, config.quantity.generation);
            }
        }
        function ensureQuantityWheel() {
            var maximum = config.quantity.generation.poolSize;
            if (!quantityWheel) quantityWheel = window.ImpressionsWheel.create({ element: get('wheel-quantity'), channel: '#', label: t('impressionsCount'),
                value: config.quantity.initialAnswer, min: 0, max: maximum, pixelsPerUnit: 0.75, wheelPixelsPerUnit: 3, pageStep: 25, disabled: true,
                canChange: function () { tick(); return !destroyed && isQuantity() && phase === 'answer'; },
                onChange: function (value) { draft = value; paintPreview(); } });
            if (quantityMaximum !== maximum) { quantityWheel.setRange(0, maximum); quantityMaximum = maximum; }
        }
        function setControlsFromDraft() {
            if (isModernColor()) { updateColor(); }
            else if (isMultiQuantity()) { updateGroups(); }
            else if (isPitch()) { updatePitch(); }
            else if (isQuantity()) { ensureQuantityWheel(); quantityWheel.setValue(draft); }
            else wheels.forEach(function (wheel, index) { wheel.setValue(draft[index]); });
        }
        function paintPreview() {
            if (isModernColor()) { updateColor(); return; }
            if (isMultiQuantity()) { updateGroups(); return; }
            if (isPitch()) return;
            if (!isQuantity()) { dom.preview.style.backgroundColor = cssColor(draft); return; }
            preparePool(); if (!dotPool) return;
            dotPreview.setPool(dotPool, config.quantity.generation.dotRadius, t('impressionsQuantityAnswerTitle')); dotPreview.setCount(draft);
        }
        function paintResult(answer) {
            if (isModernColor()) return;
            if (isMultiQuantity()) return;
            if (isPitch()) return;
            if (isQuantity()) {
                preparePool();
                targetDots.setPool(dotPool, config.quantity.generation.dotRadius, t('impressionsOriginalQuantity'));
                answerDots.setPool(dotPool, config.quantity.generation.dotRadius, t('impressionsYourQuantity'));
                targetDots.setCount(question.target); answerDots.setCount(answer === null ? 0 : answer);
                text(get('target-count'), String(question.target)); text(get('answer-count'), answer === null ? '—' : String(answer));
                return;
            }
            dom.targetSwatch.style.backgroundColor = cssColor(question.target);
            dom.answerSwatch.style.backgroundColor = answer === null ? '#24232b' : cssColor(answer);
            text(dom.targetHex, hexColor(question.target)); text(dom.answerHex, answer === null ? '—' : hexColor(answer));
        }
        function categoryUI() {
            var quantity = isQuantity(), pitch = isPitch(), multi = isMultiQuantity(); root.dataset.category = category(); root.dataset.quantityVariant = multi ? question.variant : 'single';
            var modern = isModernColor(); if (!modern) delete root.dataset.colorVariant;
            get('hsl-controls').hidden = !modern; get('modern-color-display').hidden = !modern || phase === 'results'; get('modern-color-comparison').hidden = !modern || phase !== 'results';
            get('color-controls').hidden = quantity || pitch || modern; get('quantity-controls').hidden = !quantity || multi; get('pitch-controls').hidden = !pitch; get('group-controls').hidden = !multi;
            get('group-display').hidden = !multi || phase === 'results'; get('group-comparison').hidden = !multi || phase !== 'results';
            get('pitch-display').hidden = !pitch;
            dom.preview.hidden = quantity || pitch || modern || phase === 'results'; dom.comparison.hidden = quantity || pitch || modern || phase !== 'results';
            get('quantity-display').hidden = !quantity || multi || phase === 'results'; get('quantity-comparison').hidden = !quantity || multi || phase !== 'results';
            get('local-category').disabled = !!shared || !['idle', 'results'].includes(phase);
            get('local-category').value = config.categoryMode;
            get('practice-settings').hidden = !!shared;
            Progression.types.forEach(function (id) {
                var field = get('local-weight-' + id), sum = Progression.total(localConfig.categoryWeights);
                field.value = localConfig.categoryWeights[id]; field.disabled = !!shared || !['idle', 'results'].includes(phase);
                text(get('local-probability-' + id), sum ? Math.round(localConfig.categoryWeights[id] / sum * 100) + '%' : '—');
            });
            get('local-adaptive').closest('label').hidden=localConfig.challengeVersion===1;get('local-initial-difficulty').closest('label').hidden=localConfig.challengeVersion===1;
            get('local-adaptive').checked = localConfig.adaptive.enabled; get('local-adaptive').disabled = !!shared || !['idle', 'results'].includes(phase);
            get('local-initial-difficulty').value = localConfig.adaptive.initial; get('local-initial-difficulty').disabled = get('local-adaptive').disabled || !localConfig.adaptive.enabled;
            text(get('local-frequency-note'), t(Categories.enabled(localConfig) ? localConfig.challengeVersion===1?'impressionsRandomNote':'impressionsFrequencyNote' : 'impressionsNoCategories'));
            text(get('title'), t(pitch ? 'impressionsPitch' : quantity ? 'impressionsQuantity' : 'impressionsColor'));
            if (!question && config.categoryMode === 'weighted') text(get('title'), t('impressionsName'));
            root.querySelector('.impressions-controls-region').setAttribute('aria-label', t(pitch ? 'impressionsPitch' : quantity ? 'impressionsCount' : 'impressionsControls'));
            root.querySelector('.impressions-preview-region').setAttribute('aria-label', t(quantity ? 'impressionsQuantity' : 'impressionsPreview'));
            if (quantity && !multi) {
                ensureQuantityWheel(); quantityWheel.setDisabled(phase !== 'answer'); quantityWheel.setLabel(t('impressionsCount'));
                get('quantity-cover').hidden = phase === 'answer' || phase === 'results' || phase === 'waiting' && shared && shared.active;
                get('dot-cover').hidden = ['memorize', 'answer', 'waiting', 'results'].includes(phase);
                text(get('dot-note'), t(phase === 'prepare' ? 'impressionsQuantityPrepareMessage' : 'impressionsQuantityIdleMessage'));
                text(get('quantity-note'), t(shared && !shared.active ? 'impressionsWatching' : phase === 'memorize' ? 'impressionsMemorizeCover' : 'impressionsPrepareCover'));
                text(get('quantity-range'), '0 — ' + config.quantity.generation.poolSize);
                if (question && phase === 'memorize') {
                    preparePool(); dotPreview.setPool(dotPool, config.quantity.generation.dotRadius, t('impressionsQuantityMemorizeTitle')); dotPreview.setCount(question.target);
                } else if (question && (phase === 'answer' || phase === 'waiting')) paintPreview();
                else dotPreview.clear();
            } else { dotPreview.clear(); if (quantityWheel) quantityWheel.setDisabled(true); }
            get('local-audio').hidden = !!shared || !Categories.requiresAudio(config)&&!audioSetupRequested;
            renderAudioSetup();
            updatePitch();
            updateGroups();
            updateColor();
        }
        function feedbackKey() {
            if (result.missing) return 'impressionsMissing';
            if (result.score === null) return result.unplayed ? 'impressionsEndedEarly' : 'impressionsWatching';
            return result.error === 0 ? 'impressionsExact' : result.score >= 85 ? 'impressionsExcellent' : result.score >= 60 ? 'impressionsClose' : 'impressionsPractice';
        }
        function renderCopy() {
            var key = { idle: 'Idle', prepare: 'Prepare', memorize: 'Memorize', answer: 'Answer', waiting: 'Waiting', results: 'Results' }[phase];
            text(dom.title, t('impressions' + key + 'Title')); text(dom.message, t('impressions' + key + 'Message'));
            if (isQuantity() && phase !== 'waiting') {
                text(dom.title, t('impressionsQuantity' + key + 'Title')); text(dom.message, t('impressionsQuantity' + key + 'Message'));
            }
            if (isPitch() && phase !== 'waiting') { text(dom.title, t('impressionsPitch' + key + 'Title')); text(dom.message, t('impressionsPitch' + key + 'Message')); }
            if(isPitch()&&phase==='idle'&&config.challengeVersion===1)text(dom.message,t('impressionsPitchCurrentIdle'));
            if (isPitch() && question && question.version === 2 && ['memorize', 'answer'].includes(phase)) text(dom.message, t(phase === 'memorize' ? 'impressionsPitchVariationMemorize' : 'impressionsPitchVariationAnswer'));
            if(isPitch()&&config.challengeVersion===1&&phase==='answer')text(dom.message,t('impressionsPitchCurrentAnswer'));
            if (isMultiQuantity() && ['memorize', 'answer'].includes(phase)) { text(dom.title, t(phase === 'memorize' ? 'impressionsGroupsMemorizeTitle' : 'impressionsGroupsAnswerTitle')); text(dom.message, t(phase === 'memorize' ? 'impressionsGroupsMemorizeMessage' : 'impressionsGroupsAnswerMessage')); }
            if (!question && config.categoryMode === 'weighted' && phase === 'idle') { text(dom.title, t('impressionsWeightedIdleTitle')); text(dom.message, t(Categories.enabled(config) ? 'impressionsWeightedIdleMessage' : 'impressionsNoCategories')); }
            text(dom.controlsNote, t('impressions' + (phase === 'memorize' ? 'Memorize' : phase === 'prepare' ? 'Prepare' : 'Idle') + 'Cover'));
            text(dom.previewLabel, t(phase === 'memorize' ? 'impressionsMemorizeLabel' : phase === 'answer' || phase === 'waiting' ? 'impressionsAnswerLabel'
                : phase === 'results' ? 'impressionsCompareLabel' : 'impressionsReadyLabel'));
            if (isQuantity() && phase === 'results') text(dom.previewLabel, t('impressionsQuantityComparison'));
            text(dom.lockLabel, t(reason === 'timeout' ? 'impressionsAutoLocked' : 'impressionsLocked'));
            text(dom.action, t(phase === 'answer' ? 'impressionsSubmit' : phase === 'results' ? 'impressionsNext' : 'impressionsStart'));
            text(dom.feedbackLabel, t(phase === 'results' ? 'impressionsSimilarity' : phase === 'idle' ? 'impressionsIdleFeedback' : 'impressionsPlayingFeedback'));
            var hasScore = result && Number.isFinite(result.score);
            text(dom.score, hasScore ? result.score.toFixed(1) : '—');
            dom.scoreMax.hidden = !hasScore;
            text(dom.scoreDescription, result ? t(isQuantity() && feedbackKey() === 'impressionsClose' ? 'impressionsQuantityClose' : feedbackKey()) : t(phase === 'idle' ? 'impressionsIdleDescription' : 'impressionsPlayingDescription'));
            if (isQuantity() && phase === 'results') text(dom.feedbackLabel, t('impressionsQuantityAccuracy'));
            if (isPitch()) { text(dom.feedbackLabel, t('impressionsPitchAccuracy')); text(dom.previewLabel, t('impressionsPitch')); }
            dom.score.setAttribute('aria-label', hasScore ? result.score.toFixed(1) + ' ' + t('impressionsOutOf100') : t('impressionsSimilarity'));
            dom.preview.setAttribute('aria-label', t(phase === 'memorize' ? 'impressionsMemorizeLabel' : 'impressionsPreview'));
            var help = get('help-flow');
            text(help, isQuantity() ? t('impressionsQuantityHelp') : shared ? t('impressionsOnlineHelp') : t('impressionsHelpFlow').replace('{memorize}', String(config.timing.memorizeMs / 1000)).replace('{answer}', String(config.timing.answerMs / 1000)));
            text(get('help-controls'), t(isQuantity() ? 'impressionsQuantityWheelHelp' : 'impressionsHelpControls'));
            text(get('help-score'), isQuantity() ? t('impressionsQuantityHelpScore').replace('{initial}', String(config.quantity.initialAnswer)) : t('impressionsHelpScore'));
            if (isPitch()) { text(help, t(config.challengeVersion===1?'impressionsPitchCurrentHelp':question && question.version === 2 ? 'impressionsPitchVariationHelp' : 'impressionsPitchHelp')); text(get('help-controls'), t('impressionsPitchWheelHelp')); text(get('help-score'), t(question && question.version === 2 ? 'impressionsPitchVariationScore' : 'impressionsPitchHelpScore')); }
            if (isMultiQuantity()) { text(help, t('impressionsGroupsHelp')); text(get('help-controls'), t('impressionsGroupsControls')); text(get('help-score'), t('impressionsGroupsScore')); }
            if (isModernColor()) {
                var multiple = question && question.variant !== 'single', dual = question && question.version === 3; text(help, t(dual ? 'impressionsDualColorHelp' : multiple ? 'impressionsHueHelp' : 'impressionsHslHelp')); text(get('help-controls'), t(dual ? 'impressionsDualColorHelp' : 'impressionsHslControls')); text(get('help-score'), t(multiple ? 'impressionsHueScore' : 'impressionsHslScore'));
                root.querySelector('.impressions-controls-region').setAttribute('aria-label', multiple ? t('impressionsHue') : 'HSL');
                if (multiple && ['memorize', 'answer'].includes(phase)) { text(dom.title, t(phase === 'memorize' ? 'impressionsHueMemorize' : 'impressionsHueAnswer')); text(dom.message, t(phase === 'memorize' ? 'impressionsHueMemorizeMessage' : 'impressionsHueAnswerMessage')); }
            }
            if (shared) {
                if (!shared.game) {
                    text(dom.title, t('impressionsLobbyTitle')); text(dom.message, t('impressionsLobbyMessage')); text(dom.action, t('impressionsRoom'));
                } else if (phase === 'waiting') {
                    text(dom.title, t(shared.retry ? 'impressionsRetry' : shared.submitting ? 'impressionsSending' : !shared.active ? 'impressionsWatching'
                        : locked !== null ? 'impressionsWaitingTitle' : 'impressionsCalculating'));
                    text(dom.message, t(!shared.active ? 'impressionsWatchMessage' : now() >= timeline.deadline ? 'impressionsCalculating' : 'impressionsWaitingMessage'));
                    text(dom.action, t(shared.retry ? 'impressionsRetry' : 'impressionsWaitingTitle'));
                    text(dom.lockLabel, t(!shared.active ? 'impressionsWatching' : locked !== null ? 'impressionsLocked' : shared.submitting ? 'impressionsSending' : 'impressionsMissing'));
                } else if (phase === 'results') text(dom.action, t('impressionsRoom'));
                if (!shared.active && phase !== 'results') text(dom.controlsNote, t('impressionsWatching'));
                if (phase === 'results' && result && result.missing) text(dom.lockLabel, t('impressionsMissing'));
                if (shared.game) text(dom.message, t('impressionsRound') + ' ' + shared.game.round + ' / ' + shared.game.config.maxRounds
                    + ' · HP ' + ((shared.game.hpUnits[shared.participantId] || 0) / Rules.SCALE).toFixed(1).replace(/\.0$/, ''));
            }
            ['impressionsRed', 'impressionsGreen', 'impressionsBlue'].forEach(function (name, index) { wheels[index].setLabel(t(name)); });
            categoryUI();
            doc.title = t('impressionsName') + ' · GameBox';
        }
        function setPhase(next) {
            if (phase === next) return;
            phase = next; root.dataset.phase = phase;
            root.querySelectorAll('[data-step]').forEach(function (step) {
                if (step.dataset.step === (phase === 'waiting' ? 'answer' : phase)) step.setAttribute('aria-current', 'step');
                else step.removeAttribute('aria-current');
            });
            wheels.forEach(function (wheel) { wheel.setDisabled(phase !== 'answer' || isQuantity() || isPitch() || isModernColor()); });
            dom.comparison.hidden = phase !== 'results'; dom.preview.hidden = phase === 'results';
            dom.previewCover.hidden = phase === 'memorize' || phase === 'answer' || phase === 'waiting';
            dom.controlsCover.hidden = phase === 'answer' || phase === 'results' || phase === 'waiting' && shared && shared.active;
            dom.lockLabel.hidden = phase !== 'results' && phase !== 'waiting';
            if (phase === 'memorize' && !isQuantity() && !isPitch() && !isModernColor()) dom.preview.style.backgroundColor = cssColor(question.target);
            else if (phase === 'answer' || phase === 'waiting') paintPreview();
            else dom.preview.style.removeProperty('background-color');
            renderCopy();
            if (phase === 'answer') { if (isModernColor()) colorView.focus(); else if (isMultiQuantity()) groupsView.focus(); else if (isPitch()) pitchView.focus(); else (isQuantity() ? quantityWheel : wheels[0]).focus(); }
            else if (phase === 'results') dom.title.focus({ preventScroll: true });
            reveal();
        }
        function reveal() {
            if (!shared || !shared.game || window.innerWidth > 680 || doc.querySelector('dialog[open]')) return;
            var header = root.querySelector('.impressions-phase-header');
            // Use a normal-flow anchor after a result dialog restores focus.
            // The sticky header's own viewport position can remain at the top
            // while the next Quantity board is already above the viewport.
            var top = window.scrollY + root.querySelector('.impressions-time-track').getBoundingClientRect().top - header.getBoundingClientRect().height - root.querySelector('.game-topbar').getBoundingClientRect().height - root.querySelector('.impressions-panel-header').getBoundingClientRect().height;
            window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
        }
        function finish(nextReason, stamp) {
            if (destroyed || !question || locked !== null || !['prepare', 'memorize', 'answer'].includes(phase)) return false;
            locked = Categories.copyAnswer(draft); reason = nextReason; resultAt = stamp;
            result = Categories.grade(question, locked, config); paintResult(locked);
            if(localProgression&&localConfig.challengeVersion===1)localProgression=Match.settlePractice(localProgression,question,round,timeline,locked,reason,stamp,config);
            else if (localProgression) localProgression.difficultyState = Progression.observe(localProgression.difficultyState, question.type, round,
                [{ human: true, accepted: true, valid: result.valid, score: result.score }], localConfig.adaptive);
            setPhase('results');
            practiceResultSerial++;practiceResultListeners.forEach(function(fn){try{fn({phase:'results',serial:practiceResultSerial,round:round,question:question,config:config,result:result,answer:locked,name:t('impressionsYou')});}catch(_){/* Review cannot affect a completed practice grade. */}});
            observePlaytest('round', function () { return { completed: true, mode: 'local', matchId: 'local-' + playtestLocalEpoch, round: round,
                protocolVersion: Match.version, question: question, config: localConfig, timeline: timeline, reason: reason,
                elapsedMs: stamp - timeline.answerAt, difficultyAfter: localProgression && localProgression.difficultyState && localProgression.difficultyState.difficultyByType[question.type], quantityStageAfter:localProgression&&localProgression.quantityProgress&&localProgression.quantityProgress.stage,
                participants: [{ id: 'p1', self: true, answer: locked, score: result.score, error: result.error, missing: !result.valid }] }; });
            return true;
        }
        function tick() {
            if (destroyed || ticking) return;
            if (shared) { tickShared(); return; }
            stopTimer();
            var stamp = now(), remaining = 0, duration = 1;
            if (timeline && locked === null) {
                var due = Rules.phaseAt(timeline, stamp);
                if (due === 'expired') finish('timeout', stamp);
                else {
                    setPhase(due);
                    var end = phase === 'prepare' ? timeline.memorizeAt : phase === 'memorize' ? timeline.answerAt : timeline.deadline;
                    duration = end - (phase === 'prepare' ? timeline.startAt : phase === 'memorize' ? timeline.memorizeAt : timeline.answerAt);
                    remaining = Math.max(0, end - stamp);
                }
            }
            dom.action.disabled = phase === 'prepare' || phase === 'memorize'
                || phase === 'results' && stamp < resultAt + config.timing.resultMinMs
                || ['idle', 'results'].includes(phase) && (!Categories.enabled(localConfig) || Categories.requiresAudio(localConfig) && !audioConfirmed());
            updatePitch();
            updateGroups();
            updateColor();
            text(dom.seconds, remaining > 0 ? String(Math.ceil(remaining / 1000)).padStart(2, '0') : '—');
            text(dom.countdown, phase === 'prepare' ? String(Math.ceil(remaining / 1000)) : '');
            dom.timer.classList.toggle('urgent', phase === 'answer' && remaining <= 5000);
            dom.timeFill.style.width = (remaining > 0 ? Math.min(100, remaining / duration * 100) : phase === 'results' ? 100 : 0) + '%';
            if (['prepare', 'memorize', 'answer'].includes(phase) || phase === 'results' && dom.action.disabled)
                timer = setTimeout(tick, 100);
        }
        function start(seed) {
            if (destroyed || shared || !['idle', 'results'].includes(phase) || phase === 'results' && now() < resultAt + config.timing.resultMinMs) return false;
            if (!Categories.enabled(localConfig) || Categories.requiresAudio(localConfig) && !audioConfirmed()) return false;
            // Generate before changing any UI: a bad configuration cannot leave a half-started round.
            var fields = Match.roundFields(round + 1, seed === undefined ? seedSource() : seed, now(), localConfig, localProgression), nextQuestion = fields.question;
            pitchView.stop(); stopTimer(); question = nextQuestion; round++; locked = result = reason = null;
            config = Categories.forQuestion(question, localConfig); localProgression = fields.selectionState ? localConfig.challengeVersion===1?{selectionState:fields.selectionState,variantState:fields.variantState,challengeState:fields.challengeState,quantityProgress:fields.quantityProgress}:{ selectionState: fields.selectionState, difficultyState: fields.difficultyState, variantState: fields.variantState } : null;
            timeline = fields.timeline; draft = Categories.initialAnswer(question, config); setControlsFromDraft();
            // Never carry hidden target values or result styles into the answer interface.
            [dom.targetSwatch, dom.answerSwatch].forEach(function (swatch) { swatch.style.removeProperty('background-color'); });
            text(dom.targetHex, ''); text(dom.answerHex, ''); text(dom.round, String(round).padStart(2, '0'));
            targetDots.clear(); answerDots.clear(); text(get('target-count'), ''); text(get('answer-count'), '');
            setPhase('prepare'); dom.title.focus({ preventScroll: true }); tick(); return true;
        }
        function submit() {
            if (destroyed) return false;
            tick();
            if (shared) {
                if (!shared.game || !shared.active || !shared.connected || now() >= timeline.deadline
                    || phase !== 'answer' && !(phase === 'waiting' && shared.retry)) return false;
                observeAttempt('manual'); shared.onSubmit(Categories.copyAnswer(draft), 'manual'); return true;
            }
            if (phase !== 'answer') return false;
            var stamp = now(), expired = stamp >= timeline.deadline;
            var accepted = finish(expired ? 'timeout' : 'manual', stamp); tick(); return accepted && !expired;
        }
        ['r', 'g', 'b'].forEach(function (channel, index) {
            wheels.push(window.ImpressionsWheel.create({ element: get('wheel-' + channel), channel: channel,
                label: t(['impressionsRed', 'impressionsGreen', 'impressionsBlue'][index]), value: draft[index], disabled: true, helpId: 'impressions-wheel-help',
                canChange: function () { tick(); return !destroyed && !isQuantity() && !isPitch() && !isModernColor() && phase === 'answer'; },
                onChange: function (value) { draft[index] = value; paintPreview(); } }));
        });
        dom.action.addEventListener('click', function () {
            if (shared && (!shared.game || phase === 'results')) { shared.onLobby(); return; }
            if (shared && phase === 'waiting' && shared.retry) { submit(); return; }
            if (phase === 'answer') submit();
            else if (phase === 'idle' || phase === 'results') {
                try { start(); } catch (error) { console.warn('[impressions]', error); AC.toast.show(t('impressionsUnavailable')); }
            }
        }, { signal: listeners.signal });
        doc.addEventListener('visibilitychange', tick, { signal: listeners.signal });
        async function enableAudio() { if(isPitch()&&phase==='memorize')return false;var ready = await audioSetup.test(); renderCopy(); tick(); return ready; }
        get('enable-audio').addEventListener('click', enableAudio, { signal: listeners.signal });
        get('confirm-audio').addEventListener('click',function(){audioSetup.confirm();tick();},{signal:listeners.signal});
        get('repeat-audio').addEventListener('click',function(){pitchView.stop();audioSetup.repeat();tick();},{signal:listeners.signal});
        function refreshAudio(){audioSetup.refresh().then(function(){if(!destroyed){renderAudioSetup();if(['idle','results'].includes(phase))tick();}});}
        var audioHealthTimer=setInterval(refreshAudio,500);
        doc.addEventListener('visibilitychange',refreshAudio,{signal:listeners.signal});
        doc.addEventListener('click',function(e){if(e.target.closest('#sound-toggle'))queueMicrotask(refreshAudio);},{signal:listeners.signal});
        window.addEventListener('pageshow', tick, { signal: listeners.signal });
        // Local standalone page: mirror the shells' iOS double-tap guard, ignoring drags and multi-touch.
        var tap = null, lastTap = null;
        root.addEventListener('touchstart', function (event) {
            tap = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
        }, { passive: true, signal: listeners.signal });
        root.addEventListener('touchmove', function (event) {
            if (tap && (event.touches.length !== 1 || Math.abs(event.touches[0].clientX - tap.x) > 10
                || Math.abs(event.touches[0].clientY - tap.y) > 10)) tap = null;
        }, { passive: true, signal: listeners.signal });
        root.addEventListener('touchend', function (event) {
            if (!tap || event.changedTouches.length !== 1) { tap = lastTap = null; return; }
            var touch = event.changedTouches[0], stamp = Date.now();
            if (lastTap && stamp - lastTap.at <= 350 && Math.abs(touch.clientX - lastTap.x) < 40 && Math.abs(touch.clientY - lastTap.y) < 40) {
                event.preventDefault();
                var target = doc.elementFromPoint(touch.clientX, touch.clientY), button = target && target.closest('button');
                if (button) button.click();
            }
            lastTap = { at: stamp, x: touch.clientX, y: touch.clientY }; tap = null;
        }, { passive: false, signal: listeners.signal });
        root.addEventListener('touchcancel', function () { tap = lastTap = null; }, { passive: true, signal: listeners.signal });
        var unsubscribe = AC.i18n.subscribe(function () { if (!destroyed) renderCopy(); });
        function clearComparison() {
            [dom.targetSwatch, dom.answerSwatch].forEach(function (swatch) { swatch.style.removeProperty('background-color'); });
            text(dom.targetHex, ''); text(dom.answerHex, '');
            targetDots.clear(); answerDots.clear(); text(get('target-count'), ''); text(get('answer-count'), '');
        }
        function resetView() {
            stopTimer(); question = timeline = result = locked = reason = null; phase = null;
            draft = Categories.initialAnswer({ type: Categories.forRound(config.categoryMode, Math.max(1, round), config.selectionVersion) }, config); setControlsFromDraft(); clearComparison(); dotPreview.clear();
            setPhase('idle');
        }
        function sharedResult(game) {
            var row = game.lastResult && game.lastResult.round === game.round
                && game.lastResult.rows.find(function (value) { return value.id === shared.participantId; });
            result = row ? { score: row.scoreUnits / Rules.SCALE, error: row.error, valid: !row.missing, missing: row.missing }
                : { score: null, error: null, valid: false, unplayed: Match.eligible(game, shared.participantId) };
            var accepted = game.submissions[shared.participantId];
            paintResult(accepted ? accepted.answer : null);
            var observedKey = game.matchId + ':' + game.round;
            if (playtestObserver && playtestResultKey !== observedKey && game.settledRound === game.round && game.lastResult && game.lastResult.round === game.round) {
                playtestResultKey = observedKey;
                observePlaytest('round', function () { return { completed: true, mode: 'online', matchId: playtestMatchId(game), round: game.round,
                    protocolVersion: game.protocolVersion, question: game.question, timeline: game.timeline,
                    config: Object.assign({}, game.config, { scoring: Object.assign({ version: game.scoringVersion }, game.config.scoring) }),
                    over: game.status === 'over', multiplier: game.lastResult.multiplier,
                    difficultyAfter: game.difficultyState && game.difficultyState.difficultyByType[game.question.type], quantityStageAfter:game.quantityProgress&&game.quantityProgress.stage,
                    participants: game.lastResult.rows.map(function (row) {
                        var receipt = game.submissions[row.id];
                        return { id: 'p' + (game.seatOrder.indexOf(row.id) + 1), self: row.id === shared.participantId, participantType:game.roster[row.id].type,cpuDifficulty:game.roster[row.id].type==='cpu'?game.roster[row.id].difficulty:null,cpuVersion:game.roster[row.id].cpuVersion||null,
                            answer: receipt ? receipt.answer : null, acceptedElapsedMs: receipt ? receipt.acceptedAt - game.timeline.answerAt : null,
                            submissionSource: receipt && ['manual','auto','cpu'].includes(receipt.source) ? receipt.source : null,
                            score: row.scoreUnits / Rules.SCALE, error: row.error, missing: row.missing,
                            damageTaken: row.damageUnits / Rules.SCALE, hpBefore: row.hpBeforeUnits / Rules.SCALE, hpRemaining: row.hpAfterUnits / Rules.SCALE };
                    }) }; });
            }
        }
        function tickShared() {
            stopTimer(); ticking = true;
            try {
                var game = shared.game, stamp = now(), remaining = 0, duration = 1;
                if (game) {
                    var due = Match.phaseAt(game, stamp);
                    if (game.phase === 'active' && shared.active && locked === null && !shared.submitting && !autoAttempted
                        && stamp >= timeline.deadline - game.config.autoSubmitLeadMs && (shared.connected || stamp >= timeline.deadline)) {
                        autoAttempted = true; observeAttempt('auto'); shared.onSubmit(Categories.copyAnswer(draft), 'auto');
                    }
                    if (due === 'results') sharedResult(game);
                    else if ((due === 'answer' || due === 'waiting') && (locked !== null || shared.submitting || !shared.active)) due = 'waiting';
                    setPhase(due);
                    if (game.phase === 'results' && game.status !== 'over') {
                        remaining = Math.max(0, game.resultsUntil - stamp); duration = game.config.timing.resultsMs;
                    } else if (game.phase === 'active') {
                        var end = due === 'prepare' ? timeline.memorizeAt : due === 'memorize' ? timeline.answerAt : timeline.deadline;
                        remaining = Math.max(0, end - stamp);
                        duration = end - (due === 'prepare' ? timeline.startAt : due === 'memorize' ? timeline.memorizeAt : timeline.answerAt);
                    }
                    dom.action.disabled = phase === 'answer' ? !shared.connected : phase === 'waiting'
                        ? !shared.retry || !shared.connected || stamp >= timeline.deadline : phase !== 'results';
                } else { dom.action.disabled = false; }
                renderCopy();
                text(dom.seconds, remaining > 0 ? String(Math.ceil(remaining / 1000)).padStart(2, '0') : '—');
                text(dom.countdown, phase === 'prepare' ? String(Math.ceil(remaining / 1000)) : '');
                dom.timer.classList.toggle('urgent', phase === 'answer' && remaining <= 5000);
                dom.timeFill.style.width = (remaining > 0 ? Math.min(100, remaining / Math.max(1, duration) * 100) : phase === 'results' ? 100 : 0) + '%';
            } finally { ticking = false; }
            if (shared.game) timer = setTimeout(tick, 100);
        }
        function setShared(context) {
            if (destroyed) return;
            var game = context && context.game, key = game ? game.matchId + ':' + game.round + ':' + game.questionId : 'lobby';
            var changed = key !== sharedKey || !shared;
            shared = context;
            root.dataset.mode = context ? 'online' : 'local';
            if (!context) { sharedKey = null; config = localConfig; round = 0; text(dom.round, '01'); resetView(); tick(); return; }
            shared.active = !!game && Match.eligible(game, shared.participantId);
            if (changed) {
                pitchView.stop();
                sharedKey = key; config = game ? Categories.forQuestion(game.question, configuration(Object.assign({}, game.config, { challengeVersion:game.config.challengeVersion||0, selectionVersion: game.config.selectionVersion === undefined ? 1 : game.config.selectionVersion, scoring: Object.assign({ version: game.scoringVersion }, game.config.scoring) }))) : localConfig; resetView(); autoAttempted = false;
                if (game) { question = game.question; timeline = game.timeline; round = game.round; draft = Categories.initialAnswer(question, config); setControlsFromDraft(); text(dom.round, String(round).padStart(2, '0')); }
            }
            if (game) {
                var accepted = game.submissions[shared.participantId];
                if (accepted && locked === null) {
                    locked = Categories.copyAnswer(accepted.answer); draft = Categories.copyAnswer(locked);
                    setControlsFromDraft(); reason = 'manual';
                }
            }
            tick();
        }
        function setCategoryMode(mode) {
            if (shared || !['idle', 'results'].includes(phase)) { get('local-category').value = config.categoryMode; return false; }
            return setPracticeConfig({ categoryMode: Categories.mode(mode), categoryWeights: Progression.preset(mode) });
        }
        function setPracticeConfig(patch) {
            if (shared || !['idle', 'results'].includes(phase)) return false;
            var input = Object.assign({}, localConfig, patch);
            if (patch.adaptive) { input.adaptive = Object.assign({}, localConfig.adaptive, patch.adaptive); if (patch.adaptive.initial !== undefined && !patch.adaptive.initialByType) input.adaptive.initialByType = { color: patch.adaptive.initial, quantity: patch.adaptive.initial, pitch: patch.adaptive.initial }; }
            if (patch.quantity) input.quantity = Object.assign({}, localConfig.quantity, patch.quantity);
            if (patch.color) input.color = Object.assign({}, localConfig.color, patch.color);
            if (patch.pitch) input.pitch = Object.assign({}, localConfig.pitch, patch.pitch);
            localConfig = config = configuration(input); localProgression = null; playtestLocalEpoch++;
            pitchView.stop();
            round = 0; text(dom.round, '01'); resetView(); tick(); return true;
        }
        Progression.types.forEach(function (id) { get('local-weight-' + id).addEventListener('change', function () { setPracticeConfig({ categoryMode: 'weighted', categoryWeights: Object.assign({}, localConfig.categoryWeights, { [id]: Number(this.value) }) }); }, { signal: listeners.signal }); });
        get('local-adaptive').addEventListener('change', function () { setPracticeConfig({ adaptive: { enabled: this.checked } }); }, { signal: listeners.signal });
        get('local-initial-difficulty').addEventListener('change', function () { if (this.checkValidity()) setPracticeConfig({ adaptive: { initial: Number(this.value) } }); }, { signal: listeners.signal });
        get('local-category').addEventListener('change', function () { setCategoryMode(this.value); }, { signal: listeners.signal });
        [dom.targetSwatch, dom.answerSwatch].forEach(function (swatch) { swatch.style.removeProperty('background-color'); });
        text(dom.targetHex, ''); text(dom.answerHex, '');
        phase = null; setPhase('idle'); tick();
        return { start: start, submit: submit, tick: tick, setShared: setShared, reveal: reveal, setCategoryMode: setCategoryMode, setPracticeConfig: setPracticeConfig,
            setPlaytestObserver: function (callback) { playtestObserver = typeof callback === 'function' ? callback : null; playtestResultKey = null; },
            enableAudio: enableAudio, confirmAudio:audioSetup.confirm, audioReady: pitchView.ready, audioReadiness:audioSetup.state, audioPanel:audioPanel,showAudioSetup:showAudioSetup,audioSetupRequested:function(){return audioSetupRequested;},canReviewAudio:function(){return ['idle','results'].includes(phase)||shared&&!shared.game;}, setAudioSetupHandler:function(fn){audioSetupHandler=fn;}, onAudioChange:function(fn){audioListeners.add(fn);return function(){audioListeners.delete(fn);};},onPracticeResult:function(fn){practiceResultListeners.add(fn);return function(){practiceResultListeners.delete(fn);};},stopAudio: pitchView.stop,
            snapshot: function () { return JSON.parse(JSON.stringify({ phase: phase, round: round, question: question,
                timeline: timeline, draft: draft, answer: locked, result: result, reason: reason, shared: !!shared, categoryMode: config.categoryMode, progression: localProgression, audio: pitchView.state() })); },
            destroy: function () { destroyed = true;clearInterval(audioHealthTimer);audioSetup.destroy();audioListeners.clear();practiceResultListeners.clear();playtestObserver = null; stopTimer(); pitchView.destroy(); groupsView.destroy(); colorView.destroy(); wheels.forEach(function (wheel) { wheel.setDisabled(true); wheel.destroy(); }); if (quantityWheel) quantityWheel.destroy(); dotPreview.clear(); targetDots.clear(); answerDots.clear(); listeners.abort(); unsubscribe(); } };
    }
    window.ImpressionsGame = { create: create, defaults: DEFAULTS };
    function init() {
        var local = create({ root: document.getElementById('impressions-game') });
        if (window.ImpressionsOnline) window.ImpressionsOnline.create({ root: document.getElementById('impressions-game'), view: local });
        try { if (window.ImpressionsPlaytestUI) window.ImpressionsPlaytestUI.mount(local); } catch (_) { /* Optional diagnostics cannot prevent game initialization. */ }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
