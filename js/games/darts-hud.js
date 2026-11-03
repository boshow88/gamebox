/* One presentation model; CSS composes it into a portrait or landscape viewport. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./darts-rules.js'));
    else root.DartsHud = factory(root.DartsRules);
})(typeof window === 'object' ? window : globalThis, function (Rules) {
    'use strict';
    var COLORS = ['#86efac', '#7dd3fc', '#f9a8d4', '#fcd34d'];
    function model(input) {
        var s = input.state, practice = input.practice, ids = s ? s.players : ['practice'];
        var current = s && (s.turnDarts || []).length > 0;
        var previous = s && !current && s.lastTurn;
        return {
            mode: s ? s.mode : 'practice', phase: s ? s.status : 'playing',
            leg: s ? s.leg : 0, bestOf: s ? s.bestOf : 1,
            round: s && s.mode === 'countup' ? Math.min(8, s.turns[s.active] + 1) : 0,
            active: s ? s.active : 'practice', dart: s ? Math.min(3, s.dart + 1) : 0,
            timer: input.online && s && s.status === 'playing' ? Math.min(s.turnMs / 1000,
                Math.max(0, Math.ceil((s.turnStartedAt + s.turnMs - input.now) / 1000))) : null,
            players: ids.map(function (id, index) { return { id: id, seat: index + 1, color: COLORS[index],
                name: s ? input.name(id) : input.you, score: s ? s.scores[id] : practice.darts,
                legs: s ? s.wins[id] : 0, left: s ? (s.withdrawn || []).includes(id) : false,
                active: s ? id === s.active && s.status === 'playing' : true,
                marks: s ? s.marks[id] : null }; }),
            turn: s ? { owner: previous ? previous.uid : s.active, previous: !!previous,
                darts: previous ? previous.darts || [] : s.turnDarts || [],
                points: previous ? previous.points : s.turnPoints } : null,
            feedback: s ? s.lastDart : null,
            timedOut: !!(previous && previous.reason === 'timeout'),
            practice: practice,
            winner: s ? s.winner || s.legWinner : null, draw: !!(s && s.draw),
            forfeit: !!(s && s.endReason === 'left'),
        };
    }
    function create(options) {
        var doc = options.document, t = options.t, label = options.resultLabel;
        function el(tag, cls, text) {
            var node = doc.createElement(tag); if (cls) node.className = cls;
            if (text != null) node.textContent = text; return node;
        }
        function get(id) { return doc.getElementById(id); }
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
            get('match-meta').textContent = mode + (m.leg ? ' · ' + t('dartsLeg') + ' ' + m.leg + ' · ' + t(m.bestOf === 3 ? 'dartsBO3' : 'dartsBO1') : '');
            var status = m.phase === 'between' || m.phase === 'over' ? (m.draw ? t('dartsDraw') :
                t(m.phase === 'over' ? 'dartsMatchWon' : 'dartsLegWon') + ' · ' + names[m.winner]) :
                m.mode === 'practice' ? t('dartsFlickPrompt') :
                    (options.isOnline() ? t(m.active === options.myUid() ? 'dartsYourTurn' : 'dartsWaiting') : t('dartsTurn')) +
                    ' · ' + names[m.active] + ' · ' + t('dartsDart') + ' ' + m.dart + '/3' + (m.round ? ' · ' + t('dartsRound') + ' ' + m.round + '/8' : '');
            get('turn-status').textContent = status;
            if (m.mode !== 'practice' && m.phase === 'playing') {
                var indicator = get('turn-status'); indicator.replaceChildren();
                indicator.append(el('span', 'status-name', (options.isOnline() ? t(m.active === options.myUid() ? 'dartsYourTurn' : 'dartsWaiting') : t('dartsTurn')) + ' · ' + names[m.active]),
                    el('span', 'status-dart', t('dartsDart') + ' ' + m.dart + '/3'));
                if (m.round) indicator.append(el('span', 'status-round', t('dartsRound') + ' ' + m.round + '/8'));
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
                if (m.mode !== 'practice') card.append(el('span', 'darts-player-legs', p.left ? t('dartsWithdrawn') : t('dartsLegWins') + ' ' + p.legs));
                players.append(card);
                });
                if (focusedUid) {
                    var replacement = Array.from(players.children).find(function (card) { return card.dataset.playerUid === focusedUid; });
                    if (replacement) replacement.focus({ preventScroll: true });
                }
            }
            get('player-score-label').textContent = t(m.mode === '501' ? 'dartsRemaining' : m.mode === 'practice' ? 'dartsDarts' : 'dartsPoints');
            var cricket = m.mode === 'cricket';
            get('cricket-board').hidden = !cricket; get('turn-panel').hidden = cricket || m.mode === 'practice';
            get('practice-panel').hidden = m.mode !== 'practice';
            if (cricket) {
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
                get('turn-owner').textContent = t(m.turn.previous ? 'dartsPreviousTurn' : 'dartsThisTurn') + ' · ' + names[m.turn.owner];
                var darts = get('turn-darts'); darts.replaceChildren();
                for (var i = 0; i < 3; i++) {
                    var r = m.turn.darts[i], slot = el('div', 'turn-dart');
                    slot.append(el('span', 'turn-dart-number', t('dartsDart') + ' ' + (i + 1)),
                        el('strong', 'turn-dart-hit' + (r && r.base === 25 ? ' bull-hit' : ''), r ?
                            r.miss ? t('dartsMiss') : r.base === 25 ? t(r.mult === 2 ? 'dartsBullShort' : 'dartsOuterBull') : r.label : '—'),
                        el('span', 'turn-dart-score', r ? r.score : '—'));
                    darts.append(slot);
                }
                get('turn-score').textContent = t('dartsTurnScore') + ' · ' + m.turn.points;
            }
            var last = m.feedback, feedback = get('dart-feedback');
            feedback.textContent = m.timedOut ? t('dartsTimeout') : last ?
                (last.reason === 'bust' ? t('dartsBust') : last.reason === 'checkout' ? t('dartsCheckout') : cricket ? label(last.result) : '') : '';
            feedback.classList.toggle('bust', !!(last && last.reason === 'bust'));
            if (m.mode === 'practice') {
                get('practice-hit').textContent = m.practice.result ? label(m.practice.result) : '—';
                get('practice-speed').textContent = m.practice.speed === null ? '—' : Math.round(m.practice.speed) + ' px/s';
            }
            var result = get('leg-result'); result.hidden = options.isFlying() || !['between', 'over'].includes(m.phase);
            get('result-title').textContent = m.draw ? t('dartsDraw') : t(m.phase === 'over' ? 'dartsMatchWon' : 'dartsLegWon');
            get('result-winner').textContent = m.draw ? '' : names[m.winner];
            get('result-reason').textContent = m.forfeit ? t('dartsLeft') : '';
            get('next-leg-btn').hidden = m.phase !== 'between';
            get('play-again-btn').hidden = m.phase !== 'over' || options.isOnline();
            get('result-room-btn').hidden = m.phase !== 'over' || !options.isOnline();
        }
        return { render: render };
    }
    return { model: model, create: create };
});
