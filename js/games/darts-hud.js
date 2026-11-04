/* One presentation model; CSS composes it into a portrait or landscape viewport. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./darts-rules.js'));
    else root.DartsHud = factory(root.DartsRules);
})(typeof window === 'object' ? window : globalThis, function (Rules) {
    'use strict';
    var COLORS = ['#86efac', '#7dd3fc', '#f9a8d4', '#fcd34d'];
    function model(input) {
        var s = input.state, practice = input.practice || { darts: 0, result: null, speed: null }, ids = s ? s.players : ['practice'];
        var current = s && (s.turnDarts || []).length > 0;
        var cork = !!(s && s.phase === 'cork');
        var previous = s && !current && s.lastTurn && (!cork || s.lastTurn.phase === 'cork') ? s.lastTurn : null;
        var mode = s ? s.mode : 'practice', limit = s ? s.roundLimit || 0 : 0;
        return {
            mode: mode, phase: s ? s.status : 'playing', throwPhase: cork ? 'cork' : 'play',
            leg: s && mode !== 'practice' ? s.leg : 0, bestOf: s ? s.bestOf : 1,
            legsToWin: s ? s.legsToWin || (s.bestOf === 3 ? 2 : 1) : 1,
            round: s && limit && !cork ? Math.min(limit, (s.turns[s.active] || 0) + 1) : 0,
            roundLimit: limit, corkRound: s ? s.corkRound || 1 : 1,
            inRule: s ? s.inRule || 'open' : 'open', outRule: s ? s.outRule || 'double' : 'double',
            bullMode: s ? s.bullMode || '25-50' : '25-50', cricketVariant: s ? s.cricketVariant || 'standard' : 'standard',
            active: s ? s.active : 'practice', dart: s ? Math.min(cork ? 1 : 3, s.dart + 1) : 0,
            timer: s && s.turnMs > 0 && s.status === 'playing' ? Math.min(s.turnMs / 1000,
                Math.max(0, Math.ceil((s.turnStartedAt + s.turnMs - input.now) / 1000))) : null,
            players: ids.map(function (id, index) { return { id: id, seat: index + 1, color: COLORS[index],
                name: s ? input.name(id) : input.you, score: s ? mode === 'practice' ? s.stats[id].darts : s.scores[id] : practice.darts,
                legs: s ? s.wins[id] : 0, entered: !s || !s.entered || s.entered[id] !== false,
                left: s ? (s.withdrawn || []).includes(id) : false,
                active: s ? id === s.active && s.status === 'playing' : true,
                marks: s ? s.marks[id] : null }; }),
            turn: s ? { owner: previous ? previous.uid : s.active, previous: !!previous,
                darts: previous ? previous.darts || [] : s.turnDarts || [],
                points: previous ? previous.points : s.turnPoints,
                penalties: previous ? previous.penalties || {} : s.turnPenalties || {},
                phase: previous ? previous.phase || 'play' : cork ? 'cork' : 'play',
                distance: previous ? previous.distance : cork && s.corkDistances ? s.corkDistances[s.active] : null } : null,
            feedback: s ? s.lastDart : null,
            timedOut: !!(previous && previous.reason === 'timeout'),
            practice: { darts: practice.darts, result: s && s.lastDart ? s.lastDart.result : practice.result, speed: practice.speed },
            winner: s ? s.winner || s.legWinner : null, draw: !!(s && s.draw),
            forfeit: !!(s && s.endReason === 'left'),
            endReason: s ? s.endReason : null,
        };
    }
    function create(options) {
        var doc = options.document, t = options.t, label = options.resultLabel;
        function el(tag, cls, text) {
            var node = doc.createElement(tag); if (cls) node.className = cls;
            if (text != null) node.textContent = text; return node;
        }
        function get(id) { return doc.getElementById(id); }
        function controls(id) { return options.controlsPlayer ? options.controlsPlayer(id) : id === options.myUid(); }
        function gateLabel(rule, suffix) { return t('darts' + ({ open: 'Open', master: 'Master', double: 'Double' }[rule] || 'Open') + suffix); }
        function variantLabel(m) { return m.mode === '501' ? gateLabel(m.outRule, 'Out') :
            m.mode === 'cricket' ? t(m.cricketVariant === 'cutthroat' ? 'dartsCutThroatCricket' : 'dartsStandardCricket') : ''; }
        function penaltiesText(penalties, names) {
            return Object.keys(penalties || {}).filter(function (id) { return penalties[id] > 0; })
                .map(function (id) { return (names[id] || id) + ' +' + penalties[id]; }).join(', ');
        }
        function distanceText(distance) { return Number.isFinite(distance) && distance < 1e9 ? distance.toFixed(1) + ' mm' : '—'; }
        function ruleSummary(m) {
            if (m.throwPhase === 'cork') return t('dartsCork') + ' · ' + t('dartsCorkRound') + ' ' + m.corkRound;
            var parts = [];
            if (m.mode === '501') parts.push(gateLabel(m.inRule, 'In'), gateLabel(m.outRule, 'Out'));
            if (m.mode === '501' || m.mode === 'countup') parts.push(t(m.bullMode === '50-50' ? 'dartsBull5050' : 'dartsBull2550'));
            if (m.mode === 'cricket') parts.push(variantLabel(m), t(m.cricketVariant === 'cutthroat' ? 'dartsLowestWins' : 'dartsHighestWins'));
            if (m.roundLimit) parts.push(t('dartsRoundLimit') + ' ' + m.roundLimit);
            return parts.join(' · ');
        }
        var lastKey = '', lastPlayersKey = '';
        function render(m) {
            // Clock updates should not rebuild the table, reset focus, or repeat live announcements.
            get('turn-timer').hidden = m.timer === null;
            get('turn-timer').textContent = m.timer === null ? '' : m.timer + 's';
            var withoutClock = JSON.stringify([Object.assign({}, m, { timer: null }), options.locale(), options.isFlying()]);
            if (withoutClock === lastKey) return;
            lastKey = withoutClock;
            var names = Object.fromEntries(m.players.map(function (p) { return [p.id, p.name]; }));
            var mode = options.modeName(m.mode);
            var variant = variantLabel(m), endedPractice = m.mode === 'practice' && m.phase === 'over', cancelled = m.endReason === 'cancelled';
            get('match-meta').textContent = mode + (variant ? ' · ' + variant : '') +
                (m.leg ? ' · ' + t('dartsLeg') + ' ' + m.leg + ' · ' + t('dartsLegsToWin') + ' ' + m.legsToWin : '');
            if (get('mode-rule-summary')) get('mode-rule-summary').textContent = ruleSummary(m);
            var status = cancelled ? t('dartsMatchEnded') : endedPractice ? t('dartsPracticeEnded') : m.phase === 'between' || m.phase === 'over' ? (m.draw ? t('dartsDraw') :
                t(m.phase === 'over' ? 'dartsMatchWon' : 'dartsLegWon') + ' · ' + names[m.winner]) :
                m.mode === 'practice' && m.players.length === 1 ? t('dartsFlickPrompt') :
                    (options.isOnline() ? t(controls(m.active) ? 'dartsYourTurn' : 'dartsWaiting') : t('dartsTurn')) +
                    ' · ' + names[m.active] + ' · ' + t('dartsDart') + ' ' + m.dart + '/' + (m.throwPhase === 'cork' ? 1 : 3);
            get('turn-status').textContent = status;
            if ((m.mode !== 'practice' || m.players.length > 1) && m.phase === 'playing') {
                var indicator = get('turn-status'); indicator.replaceChildren();
                indicator.append(el('span', 'status-name', (options.isOnline() ? t(controls(m.active) ? 'dartsYourTurn' : 'dartsWaiting') : t('dartsTurn')) + ' · ' + names[m.active]),
                    el('span', 'status-dart', t('dartsDart') + ' ' + m.dart + '/' + (m.throwPhase === 'cork' ? 1 : 3)));
                if (m.throwPhase === 'cork') indicator.append(el('span', 'status-round', t('dartsCorkRound') + ' ' + m.corkRound));
                else if (m.round) indicator.append(el('span', 'status-round', t('dartsRound') + ' ' + m.round + '/' + m.roundLimit));
            }
            var playersKey = JSON.stringify([m.players, m.mode, options.locale()]);
            if (playersKey !== lastPlayersKey) {
                lastPlayersKey = playersKey;
                var focused = doc.activeElement && doc.activeElement.closest('.darts-player');
                var focusedUid = focused && focused.dataset.playerUid;
                var players = get('player-scores'); players.replaceChildren();
                m.players.forEach(function (p) {
                var card = el('button', 'darts-player' + (p.active ? ' active' : '') + (p.left ? ' withdrawn' : ''));
                card.type = 'button'; card.setAttribute('aria-haspopup', 'dialog');
                card.setAttribute('aria-label', p.name + ' · ' + t('dartsHistory'));
                card.style.setProperty('--player-color', p.color); card.dataset.playerUid = p.id;
                if (p.active) card.setAttribute('aria-current', 'true');
                var seat = el('span', 'player-seat', p.seat); seat.setAttribute('aria-hidden', 'true');
                var name = el('span', 'darts-player-name', p.left ? t('dartsWithdrawn') + ' · ' + p.name : p.name); name.title = p.name;
                var score = el('strong', 'darts-player-score', p.score);
                score.setAttribute('aria-label', t(m.mode === '501' ? 'dartsRemaining' : m.mode === 'practice' ? 'dartsDarts' : 'dartsPoints') + ' ' + p.score);
                card.append(seat, name, score);
                if (m.mode !== 'practice') card.append(el('span', 'darts-player-legs', p.left ? t('dartsWithdrawn') :
                    m.mode === '501' && !p.entered ? t('dartsNotEntered') : t('dartsLegWins') + ' ' + p.legs));
                players.append(card);
                });
                if (focusedUid) {
                    var replacement = Array.from(players.children).find(function (card) { return card.dataset.playerUid === focusedUid; });
                    if (replacement) replacement.focus({ preventScroll: true });
                }
            }
            get('player-score-label').textContent = t(m.mode === '501' ? 'dartsRemaining' : m.mode === 'practice' ? 'dartsDarts' : 'dartsPoints');
            var cricket = m.mode === 'cricket';
            get('cricket-board').hidden = !cricket || m.throwPhase === 'cork';
            get('turn-panel').hidden = m.throwPhase !== 'cork' && (cricket || m.mode === 'practice');
            get('practice-panel').hidden = m.mode !== 'practice' || m.throwPhase === 'cork';
            if (cricket && m.throwPhase !== 'cork') {
                var table = el('table', 'cricket-table'), head = el('thead'), row = el('tr');
                row.append(el('th', '', t('dartsTarget')));
                m.players.forEach(function (p) {
                    var cell = el('th', p.left ? 'withdrawn' : '', p.seat);
                    cell.style.color = p.color; cell.title = p.name; cell.setAttribute('aria-label', p.name); row.append(cell);
                }); head.append(row); table.append(head);
                var body = el('tbody');
                Rules.TARGETS.forEach(function (target) {
                    var closed = m.players.filter(function (p) { return !p.left; }).every(function (p) { return p.marks[target] === 3; });
                    var line = el('tr', closed ? 'fully-closed' : '');
                    var title = el('th', '', target === 25 ? t('dartsBullShort') : target); title.scope = 'row'; line.append(title);
                    m.players.forEach(function (p) {
                        var n = p.marks[target], mark = el('td', p.left ? 'withdrawn' : n === 3 ? 'closed' : '', p.left ? '—' : ['·', '/', '×', '⊗'][n]);
                        mark.setAttribute('aria-label', p.name + ' · ' + (p.left ? t('dartsWithdrawn') : t('dartsMark' + n)));
                        line.append(mark);
                    }); body.append(line);
                }); table.append(body); get('cricket-board').replaceChildren(table);
            }
            if (m.turn) {
                var owner = m.players.find(function (p) { return p.id === m.turn.owner; });
                get('turn-owner').textContent = t(m.turn.phase === 'cork' ? 'dartsCork' : m.turn.previous ? 'dartsPreviousTurn' : 'dartsThisTurn') + ' · ' + names[m.turn.owner] +
                    (m.mode === '501' && owner && !owner.entered && m.turn.phase !== 'cork' ? ' · ' + t('dartsNotEntered') : '');
                var darts = get('turn-darts'); darts.replaceChildren();
                for (var i = 0; i < (m.turn.phase === 'cork' ? 1 : 3); i++) {
                    var r = m.turn.darts[i], slot = el('div', 'turn-dart');
                    slot.append(el('span', 'turn-dart-number', t('dartsDart') + ' ' + (i + 1)),
                        el('strong', 'turn-dart-hit' + (r && r.base === 25 ? ' bull-hit' : ''), r ?
                            r.miss ? t('dartsMiss') : r.base === 25 ? t(r.mult === 2 ? 'dartsBullShort' : 'dartsOuterBull') : r.label : '—'),
                        el('span', 'turn-dart-score', m.turn.phase === 'cork' ? '' : r ? r.score : '—'));
                    darts.append(slot);
                }
                get('turn-score').textContent = m.turn.phase === 'cork' ? t('dartsDistance') + ' · ' + distanceText(m.turn.distance) :
                    cricket && m.cricketVariant === 'cutthroat' ? t('dartsPenalties') + ' · ' + (penaltiesText(m.turn.penalties, names) || '—') :
                        t('dartsTurnScore') + ' · ' + m.turn.points;
            }
            var last = m.feedback, feedback = get('dart-feedback');
            feedback.textContent = m.timedOut ? t('dartsTimeout') : last ?
                (last.phase === 'cork' ? t('dartsCork') + ' · ' + t('dartsDistance') + ' ' + distanceText(last.distance) :
                    last.reason === 'bust' ? t('dartsBust') : last.reason === 'checkout' ? t('dartsCheckout') : cricket ? label(last.result) +
                        (m.cricketVariant === 'cutthroat' ? ' · ' + t('dartsPenalties') + ' · ' + (penaltiesText(last.penalties, names) || '—') : '') : '') : '';
            feedback.classList.toggle('bust', !!(last && last.reason === 'bust'));
            if (m.mode === 'practice') {
                get('practice-hit').textContent = m.practice.result ? label(m.practice.result) : '—';
                get('practice-speed').textContent = m.practice.speed === null ? '—' : Math.round(m.practice.speed) + ' px/s';
            }
            var result = get('leg-result'); result.hidden = options.isFlying() || !['between', 'over'].includes(m.phase);
            get('result-title').textContent = cancelled ? t('dartsMatchEnded') : endedPractice ? t('dartsPracticeEnded') : m.draw ? t('dartsDraw') : t(m.phase === 'over' ? 'dartsMatchWon' : 'dartsLegWon');
            get('result-winner').textContent = m.draw || endedPractice || cancelled ? '' : names[m.winner] || '';
            get('result-reason').textContent = m.forfeit ? t('dartsLeft') : m.endReason === 'round-limit' ? t('dartsRoundLimitReached') : '';
            get('next-leg-btn').hidden = m.phase !== 'between';
            get('play-again-btn').hidden = true;
            get('result-room-btn').hidden = m.phase !== 'over';
        }
        return { render: render };
    }
    return { model: model, create: create };
});
