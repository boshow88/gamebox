/* Pitch-only presentation/audio. Shared game controller owns drafts, phases and deadlines. */
(function () {
    'use strict';
    var AC = window.ArcadeCommon, Pitch = window.MemoryPitch, Variations = window.MemoryPitchVariations;
    Object.assign(AC.i18n.STRINGS.en,{memoryAudioActiveRecovery:'This match is already running. Sound setup restores playback; it does not restart the round or pause its clock.'});
    Object.assign(AC.i18n.STRINGS.zh,{memoryAudioActiveRecovery:'對戰已在進行中，聲音設定只會恢復播放，不會重開回合或暫停倒數。'});
    Object.assign(AC.i18n.STRINGS.en, {
        memoryPitch: 'Pitch', memoryPitchOnly: 'Pitch only', memoryPitchMixed: 'Mixed · color, quantity, pitch',
        memoryPitchIdleTitle: 'Recreate a melody.', memoryPitchIdleMessage: 'The first tone stays correct. Recreate the others by ear.',
        memoryPitchPrepareTitle: 'Get ready to listen', memoryPitchPrepareMessage: 'Remember the order and pitch of the tones.',
        memoryPitchMemorizeTitle: 'Listen to the sequence', memoryPitchMemorizeMessage: 'Hear it twice. Tone 1 is your fixed reference.',
        memoryPitchAnswerTitle: 'Bring the tones back', memoryPitchAnswerMessage: 'Tone 1 is locked. Turn the other wheels and listen.',
        memoryPitchResultsTitle: 'How close did it sound?', memoryPitchResultsMessage: 'Compare both sequences and their pitch errors.',
        memoryPitchTone: 'Tone', memoryPitchLocked: 'Locked reference', memoryPitchPlay: 'Play your sequence', memoryPitchOriginal: 'Play original',
        memoryPitchStop: 'Stop', memoryPitchEnable: 'Enable sound & test', memoryPitchConfirm: 'Test sound & confirm ready',
        memoryPitchAudioReady: 'Sound is enabled', memoryPitchAudioNeeded: 'Enable sound before starting. Listen for a short test tone.',
        memoryPitchAudioFailed: 'Sound could not start. Check mute/output and tap Enable sound again.', memoryPitchPlaying: 'Playing',
        memoryPitchCents: 'cents', memoryPitchRms: 'Overall pitch error', memoryPitchHelp: 'Listen to the target sequence twice. Tone 1 stays fixed; recreate the remaining tones relative to it. The original can be replayed only after results.',
        memoryPitchWheelHelp: 'Drag for larger intervals · Shift for fine control · ± / arrows: 1 cent · Page Up / Down: 100 cents',
        memoryPitchHelpScore: 'Only adjustable notes count toward the score. Closer pitches score higher; speed does not affect it.',
        memoryPitchRoomAudio: 'Pitch requires every player, including the host, to test sound and confirm readiness for the current room settings.',
        memoryPitchAccuracy: 'Pitch accuracy', memoryPitchFrequency: 'Frequency (Hz)', memoryPitchError: 'Error (cents)', memoryPitchTarget: 'Original Hz', memoryPitchAnswer: 'Answer Hz', memoryPitchMemorizeTime: 'Pitch memorization', memoryPitchAnswerTime: 'Pitch answering'
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        memoryPitch: '音高', memoryPitchOnly: '只玩音高', memoryPitchMixed: '混合 · 色彩、數量、音高',
        memoryPitchIdleTitle: '重現一段旋律。', memoryPitchIdleMessage: '第一音保持正確，用耳朵把其他音調回來。',
        memoryPitchPrepareTitle: '準備聆聽', memoryPitchPrepareMessage: '記住各個音的順序與高低。',
        memoryPitchMemorizeTitle: '聽聽這段音序', memoryPitchMemorizeMessage: '播放兩次，第一音會是固定的參考。',
        memoryPitchAnswerTitle: '重現你記得的音高', memoryPitchAnswerMessage: '第一音已鎖定，轉動其他滾輪並試聽。',
        memoryPitchResultsTitle: '你記得有多接近？', memoryPitchResultsMessage: '比較原本音序、你的答案與各音的誤差。',
        memoryPitchTone: '音', memoryPitchLocked: '固定參考音', memoryPitchPlay: '播放你的音序', memoryPitchOriginal: '播放原音序',
        memoryPitchStop: '停止', memoryPitchEnable: '啟用聲音並試聽', memoryPitchConfirm: '試聽並確認聲音已就緒',
        memoryPitchAudioReady: '聲音已啟用', memoryPitchAudioNeeded: '開始前請啟用聲音，確認能聽到短測試音。',
        memoryPitchAudioFailed: '聲音無法啟動，請確認靜音與輸出裝置後，再按啟用聲音。', memoryPitchPlaying: '播放中',
        memoryPitchCents: '音分', memoryPitchRms: '整體音高誤差', memoryPitchHelp: '聽兩次目標音序。第一音固定正確，請以它為參考重現其餘音高；原音序要到結果階段才能重播。',
        memoryPitchWheelHelp: '拖曳快速升降 · Shift 精細調整 · ±／方向鍵：1 音分 · Page Up／Down：100 音分',
        memoryPitchHelpScore: '只計算可調整的音，越接近原音分數越高；作答速度不影響。',
        memoryPitchRoomAudio: '含音高題型時，每位玩家（包含房主）都要針對目前設定試聽並確認聲音已就緒。',
        memoryPitchAccuracy: '音高準確度', memoryPitchFrequency: '頻率（Hz）', memoryPitchError: '誤差（音分）', memoryPitchTarget: '原音 Hz', memoryPitchAnswer: '答案 Hz', memoryPitchMemorizeTime: '音高記憶時間', memoryPitchAnswerTime: '音高作答時間'
    });
    Object.assign(AC.i18n.STRINGS.en, { memoryPitchVariationMemorize: 'Listen to the melody. Locked tones will remain available as references.', memoryPitchVariationAnswer: 'Locked tones are correct. Adjust the others; tap a tone to hear or select it.', memoryPitchVariationHelp: 'Remember the melody. Locked tones stay correct and playable; reconstruct the other tones. Five-tone questions use a selected tone and one shared wheel.', memoryPitchVariationScore: 'Only adjustable notes count toward the score. A larger pitch difference lowers the score more.', memoryPitchSelected: 'Selected tone', memoryPitchReferences: 'Fixed references' });
    Object.assign(AC.i18n.STRINGS.zh, { memoryPitchVariationMemorize: '聽聽這段旋律，鎖定的音會保留作為參考。', memoryPitchVariationAnswer: '鎖定音已正確。調整其餘音，點選音符可試聽或切換。', memoryPitchVariationHelp: '記住旋律。鎖定音保持正確且可試聽，請重現其餘音；五音題可選取音符，再用同一個滾輪調整。', memoryPitchVariationScore: '只計算可調整的音，偏差較大的音會更影響分數。', memoryPitchSelected: '目前調整的音', memoryPitchReferences: '固定參考音' });
    Object.assign(AC.i18n.STRINGS.en,{memoryPitchCurrentHelp: 'Listen to the melody twice, then tune the other notes around the fixed reference. Preview individual notes or play your whole answer while adjusting.',memoryPitchCurrentIdle:'One marked reference stays correct. Recreate the other tones by ear.',memoryPitchCurrentAnswer:'The locked reference is correct. Adjust the other wheels; tap a tone to preview it.'});
    Object.assign(AC.i18n.STRINGS.zh,{memoryPitchCurrentHelp: '聽兩次旋律，再以固定參考音為基準，調整其他音。作答時可以試聽單音或整段旋律。',memoryPitchCurrentIdle:'標記的單一參考音會保持正確，請憑聽覺重現其餘音高。',memoryPitchCurrentAnswer:'鎖定的參考音已正確。調整其他滾輪，點選音符可試聽。'});
    Object.assign(AC.i18n.STRINGS.en,{memoryAudioInstruction:'Play the test sound, then confirm that you can hear it. Sound setup is separate from match Ready.',memoryAudioTest:'Play test sound',memoryAudioConfirm:'I can hear it',memoryAudioRepeat:'Repeat sound setup',memoryAudioNeeded:'Sound test needed',memoryAudioTested:'Test sound played — please confirm',memoryAudioConfirmed:'Sound confirmed',memoryAudioUnavailable:'Audio unavailable — check mute/output, then retry',memoryAudioRecovering:'Restoring sound…',memoryAudioTesting:'Playing test sound…',memoryAudioDuringMemory:'Wait until memorization ends to test sound. The round clock keeps running.',memoryPitchCoarse:'Coarse',memoryPitchFine:'Fine',memoryPitchUnits:'Wheel values are cents relative to 220 Hz; the smaller readout shows Hz. Fine mode works with touch; Shift is optional.'});
    Object.assign(AC.i18n.STRINGS.zh,{memoryAudioInstruction:'播放測試音，聽到後再確認。聲音確認與對戰準備是兩個步驟。',memoryAudioTest:'播放測試音',memoryAudioConfirm:'我聽到了',memoryAudioRepeat:'重新設定聲音',memoryAudioNeeded:'需要測試聲音',memoryAudioTested:'測試音已播放，請確認是否聽到',memoryAudioConfirmed:'聲音已確認',memoryAudioUnavailable:'聲音無法使用，請檢查靜音與輸出裝置後重試',memoryAudioRecovering:'正在恢復聲音…',memoryAudioTesting:'正在播放測試音…',memoryAudioDuringMemory:'請等記憶播放結束後再測試聲音，回合倒數仍會繼續。',memoryPitchCoarse:'粗調',memoryPitchFine:'細調',memoryPitchUnits:'滾輪數字是以 220 Hz 為零點的音分，下方另顯示 Hz。觸控可直接選細調，Shift 為選用快捷鍵。'});
    Object.assign(AC.i18n.STRINGS.en,{memoryPitchEnable:'Sound setup',memoryAudioLocalInstruction:'Play the test sound, then press I can hear it to enable Pitch practice and replay.',memoryPitchAudioReady:'Sound available',memoryPitchAudioNeeded:'Open Sound setup, play the test sound, then confirm that you can hear it.',memoryPitchAudioFailed:'Audio unavailable. Open Sound setup, check mute/output, then retry.'});Object.assign(AC.i18n.STRINGS.zh,{memoryPitchEnable:'聲音設定',memoryAudioLocalInstruction:'播放測試音，聽到後按「我聽到了」，即可使用音高練習與重播。',memoryPitchAudioReady:'聲音可用',memoryPitchAudioNeeded:'請開啟聲音設定，播放測試音後按「我聽到了」。',memoryPitchAudioFailed:'聲音無法使用，請開啟聲音設定，檢查靜音與輸出裝置後重試。'});
    Object.assign(AC.i18n.STRINGS.en,{memoryAudioOptionalInstruction:'Sound is optional for these settings. Test and confirm only if you want to replay Pitch results.'});Object.assign(AC.i18n.STRINGS.zh,{memoryAudioOptionalInstruction:'目前設定不要求聲音；如需重播音高回合，可測試並確認。'});
    window.MemoryPitchView = { controls:function(generation){return {min:Math.ceil(Pitch.hzToCents(generation.minHz)),max:Math.floor(Pitch.hzToCents(generation.maxHz)),pixelsPerUnit:0.1,finePixelsPerUnit:2,wheelPixelsPerUnit:1,pageStep:100,visualPixelsPerUnit:0.437};}, create: function (options) {
        var root = options.root, doc = root.ownerDocument, t = AC.i18n.t, context = null, key = null, scheduled = null, failure = false, wheels = [], buttons = [], wheelKey = null, selected = null, controlListeners = null, adjustmentMode='coarse';
        var listeners = new AbortController(), audio = window.MemoryAudio.create({ isMuted: AC.audio.isMuted, onError: function () { failure = true; } });
        function get(id) { return root.querySelector('#memory-' + id); }
        function text(e, value) { if (e.textContent !== value) e.textContent = value; }
        function node(tag, cls, value) { var e = doc.createElement(tag); e.className = cls || ''; if (value !== undefined) e.textContent = value; return e; }
        function listen(e, fn) { e.addEventListener('click', fn, { signal: listeners.signal }); }
        function stop() { audio.stop(); }
        function modern(q) { return q && q.version === 2; }
        function fixed(q, index) { return modern(q) ? q.fixed.includes(q.tones[index]) : index === 0; }
        function frequency(q, answer, index) { return modern(q) ? answer[q.tones[index]] : answer[index]; }
        function sequence(q, answer) { return modern(q) ? Variations.sequence(q, answer) : answer; }
        function shared(q) { return modern(q) && q.tones.length === 5; }
        async function enable() {
            try {
                if (AC.audio.isMuted()) { var toggle = doc.getElementById('sound-toggle'); if (toggle) toggle.click(); else AC.audio.setMuted(false); }
                await audio.enable(); failure = false; scheduled = null;
                if (!context || !context.question) audio.preview(440, Pitch.defaults.audio, 0);
                else if (context.phase === 'answer' || context.phase === 'results') { var q = context.question, index = modern(q) ? q.variation.fixedIndices[0] : 0; audio.preview(frequency(q, q.target, index), context.config.pitch.audio, index); }
                return true;
            }
            catch (error) { failure = true; console.warn('[Memory audio]', error); return false; }
        }
        async function testSound(){
            try {
                if(AC.audio.isMuted()){var toggle=doc.getElementById('sound-toggle');if(toggle)toggle.click();else AC.audio.setMuted(false);}
                await audio.enable();failure=false;
                return audio.preview(440,Pitch.defaults.audio,0)===true;
            }catch(error){failure=true;console.warn('[Memory audio]',error);return false;}
        }
        function playable() { return context && context.question && (context.phase === 'answer' || context.phase === 'results') && !doc.hidden; }
        function play(original, index) {
            if (!playable() || original && context.phase !== 'results') return false;
            var q = context.question, answer = original ? q.target : context.phase === 'results' ? context.answer : context.draft;
            if (!answer && modern(q) && index !== undefined && fixed(q, index)) answer = q.target;
            if (!answer || !audio.ready()) { failure = true; return false; }
            if (index !== undefined) return audio.preview(frequency(q, answer, index), context.config.pitch.audio, index);
            return audio.play(sequence(q, answer), Object.assign({}, context.config.pitch.audio, { leadMs: 0 }), { repeats: 1, source: original ? 'original' : 'answer' });
        }
        function build(state) {
            var settings = state.config.pitch, generation = settings.generation, q = state.question;
            var nextKey = JSON.stringify({ generation: generation, version: q.version, fixed: modern(q) ? q.fixed : [0] }); if (nextKey === wheelKey) return;
            if (controlListeners) controlListeners.abort(); controlListeners = new AbortController();
            wheels.forEach(function (entry) { entry.wheel.destroy(); }); wheels = []; buttons = []; wheelKey = nextKey;
            get('pitch-tones').replaceChildren(); get('pitch-wheels').replaceChildren();
            selected = Array.from({ length: generation.toneCount }, function (_, i) { return i; }).find(function (i) { return !fixed(q, i); });
            for (var i = 0; i < generation.toneCount; i++) (function (index) {
                var button = node('button', 'btn memory-tone', String(index + 1)); button.type = 'button'; button.dataset.tone = String(index);
                if (modern(q)) button.id = 'memory-pitch-tone-' + index;
                if (fixed(q, index)) button.classList.add('locked'); get('pitch-tones').append(button); buttons.push(button); button.addEventListener('click', function () {
                    if (shared(q) && !fixed(q, index) && context && context.phase === 'answer') { selected = index; update(context); wheels[0].wheel.focus(); }
                    play(false, index);
                }, { signal: controlListeners.signal });
                if (fixed(q, index) || shared(q) && index !== selected) return;
                var host = node('div', 'memory-channel'); host.id = shared(q) ? 'memory-wheel-pitch-shared' : 'memory-wheel-pitch-' + index; get('pitch-wheels').append(host);
                var wheel = window.MemoryWheel.create(Object.assign(window.MemoryPitchView.controls(generation),{ element: host, channel: String(index + 1), label: t('memoryPitchTone') + ' ' + (index + 1), value: Math.round(Pitch.hzToCents(settings.initialHz)),
                    disabled: true, helpId: 'memory-pitch-help',
                    // Decorative tick travel is separate from cents sensitivity.
                    // The old 10-unit repeat hid normal 10/100-cent input steps.
                    isFine:function(){return adjustmentMode==='fine';},
                    ariaValueText:function(cents){return cents+' '+t('memoryPitchCents')+' / '+Pitch.centsToHz(cents).toFixed(2)+' Hz';},
                    canChange: function () { return options.canChange(); }, onChange: function (cents) { var current = shared(q) ? selected : index, hz = Pitch.centsToHz(cents); options.onChange(current, hz); if (context) audio.preview(hz, context.config.pitch.audio, current); } }));
                wheels.push({ index: index, wheel: wheel });
                host.querySelector('.memory-wheel-value').after(node('small','memory-pitch-unit',t('memoryPitchCents')),node('output','memory-pitch-hz',''));
            })(i);
            get('pitch-tones').style.setProperty('--pitch-tones', generation.toneCount); get('pitch-wheels').style.setProperty('--pitch-controls', wheels.length);
            get('pitch-wheels').classList.toggle('shared', shared(q));
        }
        function update(state) {
            context = state;
            get('pitch-enable').hidden = !state || state.showEnable === false || audio.ready();
            if (!state || !state.question || state.question.type !== 'pitch') {
                if (key !== null) stop(); key = scheduled = null; wheels.forEach(function (entry) { entry.wheel.setDisabled(true); });
                buttons.forEach(function (button) { button.disabled = true; }); get('pitch-play').disabled = get('pitch-stop').disabled = true;
                get('pitch-original').hidden = get('pitch-comparison').hidden = true; get('pitch-result-rows').replaceChildren(); text(get('pitch-rms'), ''); delete root.dataset.pitchVariant; return;
            }
            var nextKey = state.key + ':' + state.phase;
            if (key !== nextKey) { stop(); key = nextKey; scheduled = null; }
            if (doc.hidden) { stop(); scheduled = null; return; }
            build(state);
            var q = state.question; if (modern(q)) root.dataset.pitchVariant = 'melody'; else delete root.dataset.pitchVariant;
            get('pitch-wheels').dataset.policy = state.config.challengeVersion === 1 ? 'random' : 'legacy';
            var status = audio.state();
            if (!status.ready) scheduled = null;
            get('pitch-enable').hidden = state.showEnable === false || status.ready;
            if (state.phase === 'memorize' && status.ready && scheduled !== key) {
                scheduled = key;
                audio.play(sequence(q, q.target), state.config.pitch.audio, { originMs: state.timeline.memorizeAt, nowMs: state.now, deadlineMs: state.timeline.answerAt, source: 'target' });
                status = audio.state();
            }
            var editable = state.phase === 'answer' && state.active !== false;
            if(get('pitch-adjustment')){
                get('pitch-adjustment').hidden=state.phase==='results';
                ['coarse','fine'].forEach(function(mode){var b=get('pitch-'+mode);b.setAttribute('aria-pressed',String(adjustmentMode===mode));text(b,t(mode==='coarse'?'memoryPitchCoarse':'memoryPitchFine'));});
            }
            wheels.forEach(function (entry) { var index = shared(q) ? selected : entry.index, wheel = entry.wheel, value = Math.round(Pitch.hzToCents(frequency(q, state.draft, index))); if (wheel.value() !== value) wheel.setValue(value); wheel.setDisabled(!editable); wheel.setLabel(t('memoryPitchTone') + ' ' + (index + 1)); if (shared(q)) get('pitch-wheels').querySelector('.memory-channel-letter').textContent = String(index + 1); });
            wheels.forEach(function(entry){var host=entry.wheel&&get('pitch-wheels').querySelector(shared(q)?'#memory-wheel-pitch-shared':'#memory-wheel-pitch-'+entry.index),index=shared(q)?selected:entry.index;if(host){text(host.querySelector('.memory-pitch-unit'),t('memoryPitchCents'));text(host.querySelector('.memory-pitch-hz'),frequency(q,state.draft,index).toFixed(2)+' Hz');}});
            var activeIndex = status.source && status.source.startsWith('tone:') ? Number(status.source.split(':')[1]) : status.index;
            buttons.forEach(function (button, i) { var locked = fixed(q, i); text(button, String(i + 1) + (locked ? ' · 🔒' : '')); button.disabled = !playable() || !status.ready || state.phase === 'results' && !state.answer && (!modern(q) || !locked); button.classList.toggle('playing', status.playing && activeIndex === i); button.classList.toggle('selected', shared(q) && selected === i); button.setAttribute('aria-label', t('memoryPitchTone') + ' ' + (i + 1) + (locked ? ' · ' + t('memoryPitchLocked') : '')); if (shared(q) && !locked) button.setAttribute('aria-pressed', String(selected === i)); });
            text(root.querySelector('.memory-pitch-reference'), modern(q) ? t('memoryPitchReferences') + ': ' + q.variation.fixedIndices.map(function (i) { return i + 1; }).join(', ') : t('memoryPitchLocked'));
            get('pitch-play').disabled = !playable() || !status.ready || state.phase === 'results' && !state.answer;
            get('pitch-original').hidden = state.phase !== 'results'; get('pitch-original').disabled = !status.ready;
            get('pitch-stop').disabled = !status.playing;
            text(get('pitch-audio-status'), t(!status.ready ? failure ? 'memoryPitchAudioFailed' : 'memoryPitchAudioNeeded' : status.playing ? 'memoryPitchPlaying' : 'memoryPitchAudioReady'));
            get('pitch-comparison').hidden = state.phase !== 'results'; get('pitch-wheels').hidden = state.phase === 'results';
            if (state.phase === 'results') {
                var grade = state.answer ? modern(q) ? Variations.grade(q, state.answer, state.config.pitch.scoring, state.config.pitch.generation) : Pitch.grade(q.target, state.answer, state.config.pitch.scoring, state.config.pitch.generation) : null;
                var rows = sequence(q, q.target).map(function (hz, i) { var tr = node('tr'), error = grade && grade.valid && !fixed(q, i) ? modern(q) ? grade.errors[q.tones[i]] : grade.errors[i - 1] : null; [String(i + 1) + (fixed(q, i) ? ' 🔒' : ''), hz.toFixed(2), state.answer ? frequency(q, state.answer, i).toFixed(2) : '—', error === null ? '—' : error.toFixed(1)].forEach(function (value) { tr.append(node('td', '', value)); }); return tr; });
                get('pitch-result-rows').replaceChildren.apply(get('pitch-result-rows'), rows);
                text(get('pitch-rms'), t('memoryPitchRms') + ': ' + (grade && grade.valid ? grade.error.toFixed(1) : '—') + ' ' + t('memoryPitchCents'));
            } else { get('pitch-result-rows').replaceChildren(); text(get('pitch-rms'), ''); }
        }
        listen(get('pitch-play'), function () { play(false); }); listen(get('pitch-original'), function () { play(true); }); listen(get('pitch-stop'), stop);
        ['coarse','fine'].forEach(function(mode){if(get('pitch-'+mode))listen(get('pitch-'+mode),function(){adjustmentMode=mode;if(context)update(context);});});
        listen(get('pitch-enable'), async function () { await (options.onEnable ? options.onEnable() : enable()); if (context) update(context); });
        doc.addEventListener('visibilitychange', function () { stop(); scheduled = null; }, { signal: listeners.signal });
        doc.addEventListener('freeze', function () { stop(); scheduled = null; }, { signal: listeners.signal });
        window.addEventListener('pagehide', stop, { signal: listeners.signal });
        return { update: update, enable: enable, testSound:testSound, recover:audio.recover, ready: audio.ready, stop: stop, state: function () { return Object.assign(audio.state(), { failed: failure, adjustmentMode:adjustmentMode }); },
            focus: function () { if (wheels[0]) wheels[0].wheel.focus(); }, destroy: function () { listeners.abort(); if (controlListeners) controlListeners.abort(); wheels.forEach(function (entry) { entry.wheel.destroy(); }); audio.destroy(); } };
    } };
})();
