/* Small category dispatch shared by local play and the match reducer. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./color.js'), require('./quantity.js'), require('./pitch.js'), require('./progression.js'), require('./quantity-groups.js'), require('./color-variants.js'), require('./pitch-variations.js'), require('./color-single.js'),require('./challenge.js'),require('./quantity-progression.js'));
    else root.ImpressionsCategories = factory(root.ImpressionsColor, root.ImpressionsQuantity, root.ImpressionsPitch, root.ImpressionsProgression, root.ImpressionsQuantityGroups, root.ImpressionsColorVariants, root.ImpressionsPitchVariations, root.ImpressionsColorSingle,root.ImpressionsChallenge,root.ImpressionsQuantityProgression);
})(typeof window === 'object' ? window : globalThis, function (Color, Quantity, Pitch, Progression, Groups, Colors, Pitches, Single, Challenge, Stages) {
    'use strict';
    function mode(value) { if (!['color', 'quantity', 'pitch', 'mixed', 'weighted'].includes(value)) throw new RangeError('Unknown category mode.'); return value; }
    function configuration(input) {
        input = input || {}; var initial = input.initialAnswer === undefined ? [128, 128, 128] : input.initialAnswer;
        if (!Color.validateAnswer(initial)) throw new RangeError('Invalid initial Color answer.');
        var selectionVersion = input.selectionVersion === undefined ? 3 : input.selectionVersion;
        if (![1, 2, 3].includes(selectionVersion)) throw new RangeError('Unknown category selection version.');
        var challengeVersion=input.challengeVersion===undefined?(selectionVersion===3?1:0):input.challengeVersion;
        if(![0,1].includes(challengeVersion)||challengeVersion===1&&selectionVersion!==3)throw new RangeError('Unsupported challenge policy.');
        var quantity = Object.assign(Quantity.configuration(input.quantity), { variantSelectionVersion: input.quantity && input.quantity.variantSelectionVersion !== undefined ? input.quantity.variantSelectionVersion : selectionVersion === 3 ? 1 : 0,
            multi: Groups.configuration(input.quantity && input.quantity.multi) });
        quantity.renderingVersion = challengeVersion===1?3:input.quantity && input.quantity.renderingVersion !== undefined ? input.quantity.renderingVersion : selectionVersion === 3 ? 2 : 1;
        if(challengeVersion===1){quantity.variantSelectionVersion=1;quantity.progression=Stages.configuration(input.quantity&&input.quantity.progression);if(quantity.initialAnswer>quantity.progression.ranges.single[0].answerMax||quantity.multi.multi2.initialAnswer>quantity.progression.ranges.multi2[0].answerMax||quantity.multi.multi3.initialAnswer>quantity.progression.ranges.multi3[0].answerMax)throw new RangeError('Quantity initial answers must fit every stage.');}
        if (![0, 1].includes(quantity.variantSelectionVersion) || ![1, 2, 3].includes(quantity.renderingVersion)) throw new RangeError('Unknown Quantity variant/rendering version.');
        var pitchVersion = challengeVersion===1?2:input.pitch && input.pitch.variantSelectionVersion !== undefined ? input.pitch.variantSelectionVersion : selectionVersion === 3 ? 1 : 0;
        var pitch = Object.assign(pitchVersion >= 1 ? Pitches.baseConfiguration(input.pitch) : Pitch.configuration(input.pitch), { variantSelectionVersion: pitchVersion, variations: challengeVersion===1?Challenge.pitchConfiguration(input.pitch&&input.pitch.variations):Pitches.configuration(input.pitch && input.pitch.variations) });
        if (![0, 1, 2].includes(pitch.variantSelectionVersion)) throw new RangeError('Unknown Pitch variant selection version.');
        var colorVersion = challengeVersion===1?2:input.color && input.color.variantSelectionVersion !== undefined ? input.color.variantSelectionVersion : selectionVersion === 3 ? 2 : 0;
        return { categoryMode: mode(input.categoryMode === undefined ? selectionVersion === 3 ? 'weighted' : 'color' : input.categoryMode), selectionVersion: selectionVersion,
            categoryWeights: Progression.weights(input.categoryWeights === undefined ? Progression.preset(input.categoryMode || (selectionVersion === 3 ? 'weighted' : 'color')) : input.categoryWeights),
            adaptive: Progression.parameters(challengeVersion===1?Object.assign({},input.adaptive,{enabled:false}):input.adaptive), challengeVersion:challengeVersion, challenge:Challenge.configuration(input.challenge), generation: Color.generationParameters(input.generation),
            scoring: Color.scoringParameters(input.scoring), initialAnswer: initial.slice(), quantity: quantity, pitch: pitch,
            color: colorVersion === 2 ? Single.configuration(input.color) : Colors.configuration(Object.assign({ variantSelectionVersion: colorVersion }, input.color)) };
    }
    function forRound(value, round, version) { return mode(value || 'color') === 'mixed' ? (version === 1 ? ['color', 'quantity'] : ['color', 'quantity', 'pitch'])[(round - 1) % (version === 1 ? 2 : 3)] : value || 'color'; }
    function requiresAudio(config) { return config.selectionVersion === 3 ? !!config.categoryWeights && config.categoryWeights.pitch > 0 : config.categoryMode === 'pitch' || config.categoryMode === 'mixed' && config.selectionVersion === 2; }
    function enabled(config) { return config.selectionVersion !== 3 || Progression.total(config.categoryWeights) > 0; }
    function timing(question, base, config) { return question.type === 'pitch' ? Object.assign({}, base, config.pitch.timing) : Object.assign({}, base); }
    function generateQuestion(seed, round, config, chosen) {
        var id = chosen || forRound(config.categoryMode, round, config.selectionVersion), category = id === 'pitch' ? Pitch : id === 'quantity' ? Quantity : Color;
        if (!['color', 'quantity', 'pitch'].includes(id)) throw new RangeError('Weighted questions need committed selection state.');
        var settings = id === 'pitch' ? config.pitch : id === 'quantity' ? config.quantity : config;
        return Object.freeze(Object.assign({}, category.generateQuestion(seed, settings.generation), { scoringVersion: settings.scoring.version }));
    }
    function forQuestion(question, config) {
        if (!question || !question.parameters) return config;
        if (question.parameters.version !== 1) throw new RangeError('Unsupported question parameters.');
        var result = Object.assign({}, config), parameters = question.parameters;
        if (question.type === 'color') result.generation = Color.generationParameters(parameters.generation);
        else if (question.type === 'quantity') result.quantity = Object.assign({}, config.quantity, { generation: Quantity.generationParameters(parameters.generation) });
        else if (question.type === 'pitch') result.pitch = question.version === 2 ? Object.assign({}, config.pitch, { generation: Pitches.generationParameters(parameters.generation) }) : Object.assign({}, config.pitch, Pitch.configuration(Object.assign({}, config.pitch, { generation: parameters.generation })));
        result.timing = Object.assign({}, config.timing, parameters.timing); return result;
    }
    function initialAnswer(question, config) { config = forQuestion(question, config); if (question.type === 'color' && (question.version === 3 || !question.target && config.color.variantSelectionVersion === 2)) return Single.initialAnswer(config.color); if (question.type === 'color' && question.version === 2) return Colors.initialAnswer(question, config.color); if (question.type === 'pitch' && question.version === 2) return Pitches.initialAnswer(question, config.pitch.initialHz); if (question.type === 'pitch' && !question.target && config.pitch.variantSelectionVersion >= 1) return {}; return question.type === 'pitch' ? Pitch.initialAnswer(question.target ? question : { target: Array(config.pitch.generation.toneCount).fill(config.pitch.initialHz) }, config.pitch) : question.type === 'quantity' ? question.version === 2 ? Groups.initialAnswer(question, config.quantity.multi) : config.quantity.initialAnswer : config.initialAnswer.slice(); }
    function copyAnswer(answer) { return Array.isArray(answer) ? answer.slice() : answer && typeof answer === 'object' ? { ...answer } : answer; }
    function validateAnswer(question, answer, config) {
        config = forQuestion(question, config);
        if (question.type === 'color' && question.version === 3) return Single.validateAnswer(answer);
        if (question.type === 'color' && question.version === 2) return Colors.validateAnswer(question, answer);
        if (question.type === 'pitch' && question.version === 2) return Pitches.validateAnswer(question, answer, config.pitch.generation);
        return question.type === 'pitch' ? Pitch.validateAnswer(question.target, answer, config.pitch.generation) : question.type === 'quantity' ? question.version === 2 ? Groups.validateAnswer(question, answer, config.quantity.generation) : Quantity.validateAnswer(answer, config.quantity.generation.poolSize) : question.type === 'color' && Color.validateAnswer(answer);
    }
    function equalAnswer(question, a, b, config) {
        if (question.type === 'color' && question.version === 3) return Single.equalAnswer(a, b);
        if (question.type === 'color' && question.version === 2) return Colors.equalAnswer(question, a, b);
        if (question.type === 'pitch' && question.version === 2) return Pitches.equalAnswer(question, a, b, forQuestion(question, config).pitch.generation);
        return validateAnswer(question, a, config) && validateAnswer(question, b, config)
            && (question.type === 'quantity' ? question.version === 2 ? question.groups.every(function (group) { return a[group.id] === b[group.id]; }) : a === b : a.every(function (value, i) { return value === b[i]; }));
    }
    function grade(question, answer, config) {
        config = forQuestion(question, config);
        if (!question || !['color', 'quantity', 'pitch'].includes(question.type)) throw new RangeError('Unknown question category.');
        if (question.type === 'color' && question.version === 3) return Single.grade(question, answer, config.scoring);
        if (question.type === 'color' && question.version === 2) return Colors.grade(question, answer, config.color, config.scoring);
        if (question.type === 'pitch' && question.version === 2) return Pitches.grade(question, answer, config.pitch.scoring, config.pitch.generation);
        return question.type === 'pitch' ? Pitch.grade(question.target, answer, config.pitch.scoring, config.pitch.generation) : question.type === 'quantity' ? question.version === 2 ? Groups.grade(question, answer, config.quantity.multi.scoring, config.quantity.generation) : Quantity.grade(question.target, answer, config.quantity.scoring, config.quantity.generation.poolSize)
            : Color.grade(question.target, answer, config.scoring);
    }
    function supported(question, config, round) {
        if (!config || !['color', 'quantity', 'pitch', 'mixed', 'weighted'].includes(config.categoryMode === undefined ? 'color' : config.categoryMode)
            || !question || (question.version !== 1 && !(question.type === 'color' && question.version === 3) && !(['color', 'quantity', 'pitch'].includes(question.type) && question.version === 2)) || (config.selectionVersion === 3 ? !config.categoryWeights || !config.categoryWeights[question.type] || !question.parameters || question.parameters.version !== 1 : question.type !== forRound(config.categoryMode, round, config.selectionVersion === undefined ? 1 : config.selectionVersion))) return false;
        try { config = forQuestion(question, config); } catch (_) { return false; }
        if(config.challengeVersion===1&&!Challenge.supported(question,config))return false;
        if (question.type === 'color' && question.version === 3) return Single.supported(question, config.color, config.scoring);
        if (question.type === 'color' && question.version === 2) return !!config.color && config.color.variantSelectionVersion === 1 && Colors.supported(question, config.color, config.scoring);
        if (question.type === 'pitch' && question.version === 2) return !!config.pitch && [1,2].includes(config.pitch.variantSelectionVersion) && !!config.pitch.variations && config.pitch.variations.version === 1 && Pitches.supported(question, config.pitch.generation, config.pitch.scoring);
        if (question.type === 'quantity' && question.version === 2) return config.quantity.variantSelectionVersion === 1 && (question.renderingVersion === undefined || question.renderingVersion === 1 || [2,3].includes(question.renderingVersion) && config.quantity.renderingVersion === question.renderingVersion) && !!config.quantity.multi && Groups.supported(question, config.quantity.generation, config.quantity.multi.scoring);
        if (question.type === 'pitch') return !!config.pitch && !!config.pitch.scoring && config.pitch.scoring.version === 1 && question.scoringVersion === 1
            && Pitch.validateAnswer(question.target, question.target, config.pitch.generation);
        if (question.type === 'color') return !!config.scoring && question.scoringVersion === config.scoring.version && Color.supportsScoringVersion(config.scoring.version) && Color.validateAnswer(question.target);
        return !!config.quantity && !!config.quantity.scoring && !!config.quantity.generation
            && config.quantity.scoring.version === 1 && question.scoringVersion === 1
            && Number.isInteger(question.target) && question.target > 0 && question.target >= config.quantity.generation.minCount
            && question.target <= config.quantity.generation.maxCount && question.target <= config.quantity.generation.poolSize;
    }
    return { configuration: configuration, mode: mode, forRound: forRound, forQuestion: forQuestion, requiresAudio: requiresAudio, enabled: enabled, timing: timing, generateQuestion: generateQuestion,
        initialAnswer: initialAnswer, copyAnswer: copyAnswer, validateAnswer: validateAnswer, equalAnswer: equalAnswer, grade: grade, supported: supported };
});
