/* Concurrent Impressions match reducer. All inputs/HP are JSON; no DOM, timers or Firebase. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./color.js'), require('./rules.js'), require('./categories.js'), require('./progression.js'), require('./quantity-groups.js'), require('./color-variants.js'), require('./pitch-variations.js'), require('./color-single.js'),require('./challenge.js'),require('./quantity-progression.js'),require('./cpu.js'));
    else root.ImpressionsMatch = factory(root.ImpressionsColor, root.ImpressionsRules, root.ImpressionsCategories, root.ImpressionsProgression, root.ImpressionsQuantityGroups, root.ImpressionsColorVariants, root.ImpressionsPitchVariations, root.ImpressionsColorSingle,root.ImpressionsChallenge,root.ImpressionsQuantityProgression,root.ImpressionsCpu);
})(typeof window === 'object' ? window : globalThis, function (Color, Rules, Categories, Progression, Groups, Colors, Pitches, Single, Challenge, Stages, Cpu) {
    'use strict';
    var VERSION = 14;
    var STEPS = Object.freeze([1, 1, 1.3, 1.3, 1.7, 1.7, 2.2, 2.2, 3, 3, 3, 3]);
    var TIMING = Object.freeze({ prepareMs: 3000, memorizeMs: 4000, answerMs: 25000, resultsMs: 15000 });
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function integer(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
    function options(input) {
        if (typeof Color.supportsScoringVersion !== 'function' || !Color.supportsScoringVersion(4)
            || typeof Color.oklabToSrgb !== 'function' || !Cpu || Cpu.version !== 1)
            throw Object.assign(new Error('Reload the cached Color module before starting a match.'), { code: 'room/client-outdated' });
        input = input || {};
        var timing = Object.assign({}, TIMING, input.timing);
        var initialAnswer = input.initialAnswer === undefined ? [128, 128, 128] : input.initialAnswer;
        if (!Color.validateAnswer(initialAnswer)) throw new RangeError('Invalid initial answer.');
        Rules.timingParameters(timing);
        if (!Number.isFinite(timing.resultsMs) || timing.resultsMs < 1000 || timing.resultsMs > 60000
            || timing.prepareMs < 1000 || timing.memorizeMs < 1000 || timing.answerMs < 1000)
            throw new RangeError('Invalid result duration.');
        var result = { capacity: input.capacity === undefined ? 8 : input.capacity,
            maxRounds: input.maxRounds === undefined ? 12 : input.maxRounds,
            startingHp: input.startingHp === undefined ? 500 : input.startingHp,
            timing: { prepareMs: timing.prepareMs, memorizeMs: timing.memorizeMs, answerMs: timing.answerMs, resultsMs: timing.resultsMs },
            initialAnswer: initialAnswer.slice(),
            generation: Color.generationParameters(input.generation), scoring: Color.scoringParameters(input.scoring),
            multiplierSchedule: Rules.multiplierParameters(input.multiplierSchedule || { steps: STEPS }),
            // Send a final local draft shortly before the cutoff to allow for ordinary network transit.
            autoSubmitLeadMs: input.autoSubmitLeadMs === undefined ? 350 : input.autoSubmitLeadMs };
        Object.assign(result, Categories.configuration(input));
        result.cpu = Cpu.configuration(input.cpu);
        if (!integer(result.capacity, 2, 8) || !integer(result.maxRounds, 1, 100)
            || !Number.isFinite(result.startingHp) || result.startingHp < 1 || result.startingHp > 1000000
            || !Color.validateAnswer(result.initialAnswer)
            || !Number.isFinite(result.autoSubmitLeadMs) || result.autoSubmitLeadMs < 0
            || result.autoSubmitLeadMs > Math.min(1000, timing.answerMs / 2)) throw new RangeError('Invalid match options.');
        return result;
    }
    function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
    function randomFields(round,seed,stamp,config,previous){
        var draw=Progression.draw(previous&&previous.selectionState||Progression.selection(seed),config.categoryWeights),type=draw.categoryId;
        var choice=Challenge.prepare(type,seed,config,previous),q=type==='color'?Single.generateQuestion(seed,config.color,config.scoring.version):type==='pitch'?Pitches.generateQuestion(seed,choice.variation,choice.metadata.parameters.generation):choice.variant==='single'?Categories.generateQuestion(seed,round,Categories.forQuestion({type:'quantity',parameters:choice.metadata.parameters},config),'quantity'):Groups.generateQuestion(seed,choice.variant,choice.metadata.parameters.generation);
        if(type==='quantity')q=Object.assign({},q,{variant:choice.variant,variantVersion:1},q.version===2?{renderingVersion:3}:{});
        var states=Object.assign({quantity:Groups.initialState(),color:Colors.initialState(),pitch:Pitches.initialState()},choice.variantState);
        q=freeze(Object.assign({},q,choice.metadata));
        var timing=copy(choice.metadata.parameters.timing),humans=previous&&previous.roster?previous.participants.filter(function(id){return previous.roster[id].type==='human'&&previous.hpUnits[id]>0&&!previous.withdrawn.includes(id);}):['local'];
        return {round:round,categoryId:type,questionId:type+'-'+(q.variant||'single')+'-v'+q.version+'-'+round+'-'+seed.toString(36),question:copy(q),roundTiming:timing,timeline:Rules.createTimeline(stamp,timing),phase:'active',submissions:{},resultsAt:null,resultsUntil:null,
            selectionState:draw.state,variantState:states,challengeState:choice.challengeState,quantityProgress:choice.quantityProgress,roundHumans:humans};
    }
    function roundFields(round, seed, stamp, config, previous) {
        if(config.challengeVersion===1)return randomFields(round,seed,stamp,config,previous);
        var state = {}, currentConfig = config, categoryId, metadata, variant, pitchVariation;
        if (config.selectionVersion === 3) {
            var selected = Progression.draw(previous && previous.selectionState || Progression.selection(seed), config.categoryWeights);
            state.selectionState = selected.state; state.difficultyState = previous && previous.difficultyState || Progression.difficulty(config.adaptive); categoryId = selected.categoryId;
            metadata = Progression.prepare(categoryId, seed, config, state.difficultyState, config.adaptive);
            if (config.quantity.variantSelectionVersion === 1) {
                state.variantState = previous && previous.variantState || { quantity: Groups.initialState() };
                if (categoryId === 'quantity') { var choice = Groups.prepare(seed, config, state.difficultyState, state.variantState.quantity); variant = choice.variant; metadata = choice.metadata; state.variantState = Object.assign({}, state.variantState, { quantity: choice.state }); }
            }
            if (config.color && [1, 2].includes(config.color.variantSelectionVersion)) {
                state.variantState = state.variantState || previous && previous.variantState || {};
                if (categoryId === 'color') { var colorChoice = (config.color.variantSelectionVersion === 2 ? Single : Colors).prepare(seed, config, state.difficultyState, state.variantState.color); variant = colorChoice.variant; metadata = colorChoice.metadata; state.variantState = Object.assign({}, state.variantState, { color: colorChoice.state }); }
                else if (!state.variantState.color) state.variantState = Object.assign({}, state.variantState, { color: Colors.initialState() });
            }
            if (config.pitch.variantSelectionVersion === 1) {
                state.variantState = state.variantState || previous && previous.variantState || {};
                if (categoryId === 'pitch') { var pitchChoice = Pitches.prepare(seed, config, state.difficultyState, state.variantState.pitch); pitchVariation = pitchChoice.variation; metadata = pitchChoice.metadata; state.variantState = Object.assign({}, state.variantState, { pitch: pitchChoice.state }); }
                else if (!state.variantState.pitch) state.variantState = Object.assign({}, state.variantState, { pitch: Pitches.initialState() });
            }
            currentConfig = Categories.forQuestion({ type: categoryId, version: pitchVariation ? 2 : 1, parameters: metadata.parameters }, config);
        }
        var question = pitchVariation ? Pitches.generateQuestion(seed, pitchVariation, metadata.parameters.generation) : categoryId === 'color' && variant ? config.color.variantSelectionVersion === 2 ? Single.generateQuestion(seed, config.color, config.scoring.version) : Colors.generateQuestion(seed, variant, config.color, metadata.parameters.color, config.scoring.version)
            : variant && variant !== 'single' ? Groups.generateQuestion(seed, variant, metadata.parameters.generation) : Categories.generateQuestion(seed, round, currentConfig, categoryId);
        if (variant === 'single' && categoryId === 'quantity') question = Object.assign({}, question, { variant: 'single', variantVersion: 1 });
        if (categoryId === 'quantity' && question.version === 2 && config.quantity.renderingVersion === 2) {
            question = Object.assign({}, question, { renderingVersion: 2 });
            if (metadata) metadata.parameters.quantityRenderingVersion = 2;
        }
        if (metadata) question = freeze(Object.assign({}, question, metadata));
        var timing = metadata ? copy(metadata.parameters.timing) : Categories.timing(question, config.timing, config);
        return { round: round, categoryId: question.type, questionId: question.type + (question.version === 2 ? '-' + question.variant : '') + '-v' + question.version + '-' + round + '-' + seed.toString(36), question: copy(question),
            roundTiming: timing, timeline: Rules.createTimeline(stamp, timing), phase: 'active', submissions: {}, resultsAt: null, resultsUntil: null, ...state };
    }
    function upgradeDefaultScoring(input) {
        if (!input || !input.scoring) return options(input);
        var scoring = input.scoring, version = scoring.version === undefined ? 1 : scoring.version;
        if (version !== 1 && version !== 2 && version !== 3) return null;
        var normalized = Color.scoringParameters(Object.assign({}, scoring, { version: version }));
        var previousDefault = Color.scoringParameters({ version: version });
        // Only migrate a standard old lobby default. Explicit custom curves and
        // every already-frozen match retain their own version and parameters.
        if (JSON.stringify(normalized) !== JSON.stringify(previousDefault)) return null;
        return options(Object.assign({}, input, { scoring: Color.defaults.scoring }));
    }
    function create(participants, seatOrder, input, seed, stamp, matchId) {
        var config = options(input), ids = seatOrder.slice(), roster = copy(participants);
        if (!Categories.enabled(config)) throw new RangeError('Enable at least one category.');
        var humans=ids.filter(function(id){return roster[id]&&roster[id].type==='human';}),controllers=humans.map(function(id){return roster[id].controllerId;});
        if(ids.length>config.capacity||!humans.length||new Set(controllers).size!==humans.length||ids.some(function(id){var p=roster[id];return !p||p.id!==id||typeof p.controllerId!=='string'||!p.controllerId||p.type!=='human'&&(p.type!=='cpu'||!Cpu.validDifficulty(p.difficulty)||!controllers.includes(p.controllerId)||p.cpuVersion!==undefined&&p.cpuVersion!==Cpu.version);}))throw new TypeError('Each human needs a unique controller; CPUs need an owning human and valid difficulty.');
        ids.forEach(function(id){if(roster[id].type==='cpu')roster[id].cpuVersion=Cpu.version;});
        var battle = Rules.createBattle(ids, config);
        var base=Object.assign(battle, { protocolVersion: VERSION, scoringVersion: config.scoring.version, matchId: matchId || '',
            config: config, roster: roster, seatOrder: ids, owners: Object.fromEntries(ids.map(function (id) { return [id, roster[id].controllerId]; })),
            withdrawn: [], endReason: null });
        if (base.protocolVersion >= 14) base.eliminations = {};
        return Object.assign(base,roundFields(1, seed, stamp, config,config.challengeVersion===1?base:undefined));
    }
    function supported(game) {
        var scoring = game && game.config && game.config.scoring;
        var colorSupported = !!game && typeof Color.supportsScoringVersion === 'function'
            && Color.supportsScoringVersion(game.scoringVersion) && !!scoring
            && (scoring.version === undefined ? game.scoringVersion === 1 : scoring.version === game.scoringVersion);
        if (!colorSupported || game.protocolVersion < 10 && game.scoringVersion === 4) return false;
        if (game.protocolVersion >= 14 && (!game.eliminations || typeof game.eliminations !== 'object' || Array.isArray(game.eliminations)
            || Object.keys(game.eliminations).some(function(id){var e=game.eliminations[id];return !game.participants.includes(id)||game.hpUnits[id]!==0||!e||!integer(e.round,1,game.settledRound)||!Number.isSafeInteger(e.rawRemainingHpUnits)||e.rawRemainingHpUnits>0;})
            || game.participants.some(function(id){return game.hpUnits[id]===0&&!game.eliminations[id];}))) return false;
        if(game.protocolVersion<11&&Object.values(game.roster||{}).some(function(p){return p.type==='cpu';}))return false;
        if([11,12,13,VERSION].includes(game.protocolVersion)&&(!game.config.cpu||game.config.cpu.version!==Cpu.version||!game.participants.some(function(id){return game.roster[id].type==='human';})||game.participants.some(function(id){var p=game.roster[id];return p.type!=='human'&&(p.type!=='cpu'||p.cpuVersion!==Cpu.version||!Cpu.validDifficulty(p.difficulty))||game.owners[id]!==p.controllerId;})))return false;
        if (game.protocolVersion === 1) return !!game.question && game.question.type === 'color' && game.question.version === 1;
        var random=[9,10,11,12,13,VERSION].includes(game.protocolVersion)&&game.config.challengeVersion===1;
        if(game.protocolVersion<9&&game.config.challengeVersion===1)return false;
        if ([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, VERSION].includes(game.protocolVersion) && ![1, 2, 3].includes(game.config.selectionVersion)) return false;
        if ([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, VERSION].includes(game.protocolVersion) && game.config.selectionVersion === 3 && (!game.selectionState || game.selectionState.version !== 1 || !random&&(!game.difficultyState || game.difficultyState.version !== 1) || !game.config.adaptive || game.config.adaptive.version !== 1)) return false;
        if(random&&(!game.challengeState||game.challengeState.version!==1||!Stages.valid(game.quantityProgress,game.config.quantity.progression)||!Array.isArray(game.roundHumans)||game.protocolVersion<11&&!game.roundHumans.length||game.roundHumans.some(function(id){return !game.roster[id]||game.roster[id].type!=='human';})))return false;
        if ([5, 6, 7, 8, 9, 10, 11, 12, 13, VERSION].includes(game.protocolVersion) && game.config.selectionVersion === 3 && game.config.quantity.variantSelectionVersion === 1 && (!game.variantState || !game.variantState.quantity || game.variantState.quantity.version !== 1)) return false;
        if ([6, 7, 8, 9, 10, 11, 12, 13, VERSION].includes(game.protocolVersion) && game.config.selectionVersion === 3 && game.config.color && [1, 2].includes(game.config.color.variantSelectionVersion) && (!game.variantState || !game.variantState.color || game.variantState.color.version !== 1)) return false;
        if ([7, 8, 9, 10, 11, 12, 13, VERSION].includes(game.protocolVersion) && game.config.selectionVersion === 3 && [1,2].includes(game.config.pitch.variantSelectionVersion) && (!game.variantState || !game.variantState.pitch || game.variantState.pitch.version !== 1)) return false;
        if (game.protocolVersion < 5 && game.question && game.question.version !== 1 || game.protocolVersion < 6 && game.question && game.question.type === 'color' && game.question.version !== 1 || game.protocolVersion < 7 && game.question && game.question.type === 'pitch' && game.question.version !== 1 || game.protocolVersion < 8 && game.question && (game.question.type === 'color' && game.question.version === 3 || game.question.renderingVersion === 2) || game.protocolVersion<9&&game.question&&game.question.renderingVersion===3) return false;
        if (game.protocolVersion === 3 && ![1, 2].includes(game.config.selectionVersion)) return false;
        if (game.protocolVersion === 2 && (game.config.selectionVersion !== undefined && game.config.selectionVersion !== 1 || game.question && game.question.type === 'pitch')) return false;
        return [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, VERSION].includes(game.protocolVersion) && !!Categories && !!game.question && game.categoryId === game.question.type
            && Categories.supported(game.question, game.config, game.round);
    }
    function eligible(game, id) {
        return supported(game) && game.participants.includes(id) && game.hpUnits[id] > 0 && !game.withdrawn.includes(id);
    }
    function activeIds(game) { return game.participants.filter(function (id) { return eligible(game, id); }); }
    function token(game) {
        var result = { matchId: game.matchId, round: game.round, questionId: game.questionId };
        if (game.protocolVersion >= 2) result.categoryId = game.categoryId;
        return result;
    }
    function sameQuestion(game, expected) {
        return supported(game) && !!expected && ['matchId', 'round', 'questionId'].every(function (key) { return game[key] === expected[key]; })
            && (game.protocolVersion === 1 || expected.categoryId === game.categoryId);
    }
    function validAnswer(game, answer) { return Categories.validateAnswer(game.question, answer, game.config); }
    function receipt(game, controllerId, request) {
        if (!sameQuestion(game, request) || game.owners[request.participantId] !== controllerId) return false;
        var accepted = game.submissions[request.participantId];
        return !!accepted && accepted.nonce === request.nonce && Categories.equalAnswer(game.question, accepted.answer, request.answer, game.config);
    }
    function submit(game, controllerId, request, stamp) {
        if(game&&request&&game.protocolVersion>=11){var p=game.roster&&game.roster[request.participantId];if(p&&p.type==='cpu'?request.source!=='cpu':request.source!==undefined&&!['manual','auto'].includes(request.source))return null;}
        else if(game&&game.config&&game.config.challengeVersion===1&&request&&request.source!==undefined&&!['manual','auto'].includes(request.source))return null;
        if (!sameQuestion(game, request) || game.owners[request.participantId] !== controllerId
            || !validAnswer(game, request.answer) || typeof request.nonce !== 'string'
            || !/^[A-Za-z0-9_-]{1,180}$/.test(request.nonce)) return null;
        // An acknowledged-lost request remains the same accepted answer, even after the cutoff.
        if (receipt(game, controllerId, request)) return { state: game, duplicate: true };
        if (!Number.isFinite(stamp) || game.status !== 'playing' || game.phase !== 'active'
            || !eligible(game, request.participantId) || game.submissions[request.participantId]
            || stamp < game.timeline.answerAt || stamp >= game.timeline.deadline) return null;
        var accepted = { nonce: request.nonce, answer: Categories.copyAnswer(request.answer), acceptedAt: stamp,
            matchId: game.matchId, round: game.round, questionId: game.questionId };
        if (game.protocolVersion >= 2) accepted.categoryId = game.categoryId;
        if(game.protocolVersion>=11||game.config.challengeVersion===1)accepted.source=request.source||'manual';
        return { duplicate: false, state: Object.assign({}, game, {
            submissions: Object.assign({}, game.submissions, { [request.participantId]: accepted }) }) };
    }
    function ended(game, winners, reason, stamp) {
        return Object.assign({}, game, { status: 'over', phase: 'results', winners: winners, endReason: reason,
            resultsAt: game.resultsAt === null ? stamp : game.resultsAt,
            resultsUntil: game.resultsUntil === null ? stamp + game.config.timing.resultsMs : game.resultsUntil });
    }
    // Only committed, valid receipts from every still-eligible actor can end v13
    // answering early. Presence/UI drafts never count as a submission.
    function canSettleEarly(game, stamp) {
        if (!supported(game) || game.protocolVersion < 13 || game.status !== 'playing'
            || game.phase !== 'active' || game.settledRound >= game.round
            || !Number.isFinite(stamp) || stamp < game.timeline.answerAt) return false;
        var ids = activeIds(game);
        return ids.length > 1 && ids.every(function (id) {
            var r = game.submissions[id], p = game.roster[id];
            return !!r && sameQuestion(game, r) && validAnswer(game, r.answer)
                && typeof r.nonce === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(r.nonce)
                && Number.isFinite(r.acceptedAt) && r.acceptedAt >= game.timeline.answerAt
                && r.acceptedAt < game.timeline.deadline && r.acceptedAt <= stamp
                && (p.type === 'cpu' ? r.source === 'cpu' : ['manual', 'auto'].includes(r.source));
        });
    }
    function settle(game, expected, stamp) {
        if (!sameQuestion(game, expected) || !Number.isFinite(stamp) || game.status !== 'playing'
            || game.phase !== 'active' || game.settledRound >= game.round
            || stamp < game.timeline.deadline && !canSettleEarly(game, stamp)) return null;
        var ids = activeIds(game);
        if (ids.length <= 1) return ended(game, ids, ids.length ? 'withdrawal' : 'empty', stamp);
        var grades = {}, scores = {};
        // Before scoring v2, the frozen config had no nested version. Use the
        // match's explicit scoringVersion rather than today's defaults for it.
        var gradingConfig = Object.assign({}, game.config, { scoring: Object.assign({ version: game.scoringVersion }, game.config.scoring) });
        ids.forEach(function (id) {
            var accepted = game.submissions[id];
            var valid = accepted && sameQuestion(game, accepted) && validAnswer(game, accepted.answer);
            grades[id] = valid ? Categories.grade(game.question, accepted.answer, gradingConfig) : { valid: false, score: 0, error: null };
            scores[id] = grades[id].score;
        });
        var battle = Rules.settleRound(Object.assign({}, game, { participants: ids }), game.round, scores);
        var result = Object.assign({}, battle.lastResult, { questionId: game.questionId, categoryId: game.question.type,
            rows: battle.lastResult.rows.map(function (row) {
                return Object.assign({}, row, { error: grades[row.id].error, missing: !grades[row.id].valid },
                    game.question.type === 'pitch' ? { pitchErrors: grades[row.id].errors || null } : game.question.type === 'quantity' && game.question.version === 2 ? { quantityErrors: grades[row.id].errors || null } : game.question.type === 'color' && game.question.version === 2 && game.question.variant !== 'single' ? { colorErrors: grades[row.id].errors || null } : {});
            }) });
        var next = Object.assign({}, game, { hpUnits: battle.hpUnits, settledRound: game.round, lastResult: result,
            phase: 'results', resultsAt: stamp, resultsUntil: stamp + game.config.timing.resultsMs });
        if (game.protocolVersion >= 14) {
            var eliminations = Object.assign({}, game.eliminations);
            result.rows.forEach(function(row){
                if (row.hpBeforeUnits > 0 && row.hpAfterUnits === 0 && !eliminations[row.id])
                    eliminations[row.id] = { round: game.round, rawRemainingHpUnits: row.hpBeforeUnits - row.damageUnits };
            });
            next.eliminations = eliminations;
        }
        if(game.config.challengeVersion===1){
            next.quantityProgress=Stages.settle(game.quantityProgress,game.question,game.round,game.timeline,game.roundHumans,game.roundHumans.map(function(id){var receipt=game.submissions[id];return {id:id,human:game.roster[id].type==='human',withdrawn:game.withdrawn.includes(id),valid:!!(grades[id]&&grades[id].valid),answer:receipt&&receipt.answer,acceptedAt:receipt&&receipt.acceptedAt,source:receipt&&receipt.source};}),game.config.quantity.progression,true);
        }else if ([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, VERSION].includes(game.protocolVersion) && game.config.selectionVersion === 3) {
            next.difficultyState = Progression.observe(game.difficultyState, game.categoryId, game.round, ids.map(function (id) {
                return { human: game.roster[id].type === 'human', accepted: !!game.submissions[id], valid: grades[id].valid, withdrawn: game.withdrawn.includes(id), score: grades[id].score };
            }), game.config.adaptive);
        }
        var alive = activeIds(next);
        if (alive.length <= 1) return ended(next, alive, alive.length ? 'last-survivor' : 'empty', stamp);
        if (game.round >= game.config.maxRounds) {
            var bestHp = Math.max.apply(null, alive.map(function (id) { return next.hpUnits[id]; }));
            return ended(next, alive.filter(function (id) { return next.hpUnits[id] === bestHp; }), 'round-cap', stamp);
        }
        return next;
    }
    function advance(game, expected, seed, stamp) {
        if (!sameQuestion(game, expected) || !Number.isFinite(stamp) || game.status !== 'playing'
            || game.phase !== 'results' || game.settledRound !== game.round || stamp < game.resultsUntil) return null;
        if (game.protocolVersion === 1) {
            var question = Color.generateQuestion(seed, game.config.generation);
            return Object.assign({}, game, { round: game.round + 1, questionId: 'color-v1-' + (game.round + 1) + '-' + seed.toString(36), question: copy(question),
                timeline: Rules.createTimeline(stamp, game.config.timing), phase: 'active', submissions: {}, resultsAt: null, resultsUntil: null });
        }
        if (game.protocolVersion === 2) {
            var legacyConfig = Object.assign({}, game.config, { selectionVersion: 1 });
            var fields = roundFields(game.round + 1, seed, stamp, legacyConfig); delete fields.roundTiming;
            return Object.assign({}, game, fields);
        }
        if (game.protocolVersion === 4) return Object.assign({}, game, roundFields(game.round + 1, seed, stamp,
            Object.assign({}, game.config, { color: undefined, pitch: Object.assign({}, game.config.pitch, { variantSelectionVersion: 0 }), quantity: Object.assign({}, game.config.quantity, { variantSelectionVersion: 0 }) }), game));
        if (game.protocolVersion === 5) return Object.assign({}, game, roundFields(game.round + 1, seed, stamp, Object.assign({}, game.config, { color: undefined, pitch: Object.assign({}, game.config.pitch, { variantSelectionVersion: 0 }) }), game));
        if (game.protocolVersion === 6) return Object.assign({}, game, roundFields(game.round + 1, seed, stamp, Object.assign({}, game.config, { pitch: Object.assign({}, game.config.pitch, { variantSelectionVersion: 0 }) }), game));
        if (game.protocolVersion === 7) return Object.assign({}, game, roundFields(game.round + 1, seed, stamp,
            Object.assign({}, game.config, { color: game.config.color && Object.assign({}, game.config.color, { variantSelectionVersion: Math.min(1, game.config.color.variantSelectionVersion) }), quantity: Object.assign({}, game.config.quantity, { renderingVersion: 1 }) }), game));
        return Object.assign({}, game, roundFields(game.round + 1, seed, stamp, game.config, game));
    }
    function withdraw(game, controllerId, stamp) {
        if (!supported(game)) return game;
        var ids = game.participants.filter(function (id) { return game.owners[id] === controllerId; });
        var withdrawn = Array.from(new Set(game.withdrawn.concat(ids)));
        if (withdrawn.length === game.withdrawn.length) return game;
        var next = Object.assign({}, game, { withdrawn: withdrawn });
        if (next.status !== 'playing') return next;
        var remaining = activeIds(next);
        return remaining.length <= 1 ? ended(next, remaining, remaining.length ? 'withdrawal' : 'empty', stamp) : next;
    }
    function phaseAt(game, stamp) {
        if (game.phase === 'results') return 'results';
        var phase = Rules.phaseAt(game.timeline, stamp);
        return phase === 'expired' ? 'waiting' : phase;
    }
    function settlePractice(previous,question,round,timeline,answer,reason,stamp,config){return Object.assign({},previous,{quantityProgress:Stages.settle(previous.quantityProgress,question,round,timeline,['local'],[{id:'local',human:true,withdrawn:false,valid:Categories.validateAnswer(question,answer,config),answer:answer,acceptedAt:stamp,source:reason==='manual'?'manual':'auto'}],config.quantity.progression,true)});}
    return { version: VERSION, defaults: Object.freeze({ capacity: 8, maxRounds: 12, startingHp: 500, timing: TIMING, steps: STEPS }),
        options: options, enabled: Categories && Categories.enabled, roundFields: roundFields, settlePractice:settlePractice, requiresAudio: Categories && Categories.requiresAudio, upgradeDefaultScoring: upgradeDefaultScoring, create: create, supported: supported, eligible: eligible, activeIds: activeIds, token: token,
        copyAnswer: Categories && Categories.copyAnswer, sameQuestion: sameQuestion, receipt: receipt, submit: submit, canSettleEarly: canSettleEarly, settle: settle, advance: advance, withdraw: withdraw, phaseAt: phaseAt };
});
