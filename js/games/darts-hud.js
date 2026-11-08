/* One presentation model; CSS composes it into a portrait or landscape viewport. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./darts-rules.js'), require('./darts-cpu-difficulty.js'));
    else root.DartsHud = factory(root.DartsRules, root.DartsCpuDifficulty);
})(typeof window === 'object' ? window : globalThis, function (Rules, Difficulty) {
    'use strict';
    var COLORS = ['#86efac', '#7dd3fc', '#f9a8d4', '#fcd34d'];
    function corkModel(s) {
        var purpose = s.corkPurpose || 'tie', distances = s.corkDistances || {}, round = s.corkRound || 1;
        var eligible = (s.corkPlayers || []).filter(function (id) { return !(s.withdrawn || []).includes(id); });
        return { purpose: purpose, round: round, eligible: eligible, rethrow: round > 1,
            entries: s.players.map(function (id) {
                var latest = null, previous = null;
                (s.history || []).slice().reverse().some(function (entry) {
                    if (entry.uid !== id || entry.leg !== s.leg || entry.phase !== 'cork' ||
                        (entry.corkPurpose || 'tie') !== purpose || entry.corkRound > round) return false;
                    if (!latest) latest = entry;
                    if (entry.corkRound < round && !previous) previous = entry;
                    return !!latest && !!previous;
                });
                var left = (s.withdrawn || []).includes(id), included = !left && eligible.includes(id);
                var hasThrown = Object.prototype.hasOwnProperty.call(distances, id);
                var distance = hasThrown && Number.isFinite(distances[id]) && distances[id] < 1e9 ? distances[id] : null;
                var status = left ? 'left' : !included ? 'excluded' : hasThrown ? distance === null ? 'forfeited' : 'thrown' : round > 1 ? 'rethrow' : 'waiting';
                return { id: id, eligible: included, active: included && s.status === 'playing' && s.active === id,
                    hasThrown: hasThrown, distance: distance,
                    previousDistance: previous && Number.isFinite(previous.distance) && previous.distance < 1e9 ? previous.distance : null,
                    result: latest && latest.darts && latest.darts[0] || null, status: status,
                    lastDistance: latest && Number.isFinite(latest.distance) && latest.distance < 1e9 ? latest.distance : null };
            }) };
    }
    function model(input) {
        var s = input.state, practice = input.practice || { darts: 0, result: null, speed: null }, ids = s ? s.players : ['practice'];
        var finalCork = input.effects && input.effects.finalHit && input.effects.finalHit.corkState;
        var corkState = finalCork || s;
        var current = s && (s.turnDarts || []).length > 0;
        var cork = !!(s && (finalCork || s.phase === 'cork'));
        var previous = s && !current && s.lastTurn && (!cork || s.lastTurn.phase === 'cork') ? s.lastTurn : null;
        var mode = s ? s.mode : 'practice', limit = s ? s.roundLimit || 0 : 0;
        var opening = input.effects && input.effects.opening;
        return {
            mode: mode, startingScore: s ? s.startingScore || 501 : 501,
            opening: opening || null,
            phase: s ? s.status : 'playing', throwPhase: cork ? 'cork' : 'play',
            corkPurpose: corkState ? corkState.corkPurpose || 'tie' : null,
            cork: cork ? corkModel(corkState) : null,
            leg: s && mode !== 'practice' ? s.leg : 0, bestOf: s ? s.bestOf : 1,
            legsToWin: s ? s.legsToWin || (s.bestOf === 3 ? 2 : 1) : 1,
            round: s && limit && !cork ? Math.min(limit, (s.turns[s.active] || 0) + 1) : 0,
            roundLimit: limit, corkRound: corkState ? corkState.corkRound || 1 : 1,
            inRule: s ? s.inRule || 'open' : 'open', outRule: s ? s.outRule || 'double' : 'double',
            bullMode: s ? s.bullMode || '25-50' : '25-50', cricketVariant: s ? s.cricketVariant || 'standard' : 'standard',
            active: finalCork ? finalCork.active : s ? s.active : 'practice', dart: s ? Math.min(cork ? 1 : 3, s.dart + 1) : 0,
            timer: s && s.turnMs > 0 && s.status === 'playing' ? Math.min(s.turnMs / 1000,
                Math.max(0, Math.ceil((s.turnStartedAt + s.turnMs - input.now) / 1000))) : null,
            players: ids.map(function (id, index) { return { id: id, seat: index + 1, color: COLORS[index],
                type: s && s.participants && s.participants[id] ? s.participants[id].type : 'human',
                difficulty: s && s.participants && s.participants[id] ? s.participants[id].difficulty : null,
                name: s ? input.name(id) : input.you, score: s ? mode === 'practice' ? s.stats[id].darts : s.scores[id] : practice.darts,
                legs: s ? s.wins[id] : 0, entered: !s || !s.entered || s.entered[id] !== false,
                left: s ? (s.withdrawn || []).includes(id) : false,
                active: opening ? id === opening.player : finalCork ? id === finalCork.active : s ? id === s.active && s.status === 'playing' : true,
                drawingStarter: !!(opening && opening.drawing && id === opening.player),
                marks: s ? s.marks[id] : null }; }),
            turn: s ? { owner: previous ? previous.uid : s.active, previous: !!previous,
                darts: previous ? previous.darts || [] : s.turnDarts || [],
                points: previous ? previous.points : s.turnPoints,
                penalties: previous ? previous.penalties || {} : s.turnPenalties || {},
                phase: previous ? previous.phase || 'play' : cork ? 'cork' : 'play',
                corkPurpose: previous ? previous.corkPurpose : s.corkPurpose,
                distance: previous ? previous.distance : cork && s.corkDistances ? s.corkDistances[s.active] : null } : null,
            feedback: s ? s.lastDart : null,
            timedOut: !!(previous && previous.reason === 'timeout'),
            practice: { darts: practice.darts, result: s && s.lastDart ? s.lastDart.result : practice.result, speed: practice.speed },
            winner: s ? s.winner || s.legWinner : null, draw: !!(s && s.draw),
            forfeit: !!(s && s.endReason === 'left'),
            endReason: s ? s.endReason : null,
            legEndReason: s ? s.legEndReason : null,
            legCorkPurpose: s ? s.legCorkPurpose : null,
            winnerDistance: s && s.corkDistances ? s.corkDistances[s.winner || s.legWinner] : null,
            effects: input.effects || { penalties: {} },
        };
    }
    function distanceText(distance) { return Number.isFinite(distance) && distance < 1e9 ? distance.toFixed(1) + ' mm' : ''; }
    // Explanations use the accepted finish reason, including between-Leg results.
    function resultReason(m, t) {
        if (m.forfeit || m.endReason === 'left' || m.legEndReason === 'left') return t('dartsLeft');
        if (m.endReason === 'practice-ended' || m.endReason === 'cancelled' || m.draw) return '';
        var reason = m.legEndReason || m.endReason;
        var winner = m.players.find(function (p) { return p.id === m.winner; });
        if (!winner) return '';
        if (reason === 'cork') return Rules.isX01(m.mode) && m.roundLimit ?
            t('dartsResultLimitCork', m.roundLimit, distanceText(m.winnerDistance)) : t('dartsResultCork', distanceText(m.winnerDistance));
        if (Rules.isX01(m.mode)) {
            if (reason === 'checkout') return t('dartsResultCheckout');
            if (reason === 'round-limit') return t('dartsResult501Limit', m.roundLimit, winner.score);
        }
        if (m.mode === 'cricket') {
            var prefix = m.cricketVariant === 'cutthroat' ? 'dartsResultCutthroat' : 'dartsResultStandard';
            if (reason === 'closed') return t(prefix + 'Closed', winner.score);
            if (reason === 'round-limit') return t(prefix + 'Limit', m.roundLimit, winner.score);
        }
        if (m.mode === 'countup' && reason === 'round-limit') return t('dartsResultCountup', m.roundLimit, winner.score);
        return '';
    }
    function create(options) {
        var doc = options.document, t = options.t, label = options.resultLabel;
        function el(tag, cls, text) {
            var node = doc.createElement(tag); if (cls) node.className = cls;
            if (text != null) node.textContent = text; return node;
        }
        function get(id) { return doc.getElementById(id); }
        function valueLabel(key, value) { return t('dartsLabelValue', t(key), value); }
        function controls(id) { return options.controlsPlayer ? options.controlsPlayer(id) : id === options.myUid(); }
        function gateLabel(rule, suffix) { return t('darts' + ({ open: 'Open', master: 'Master', double: 'Double' }[rule] || 'Open') + suffix); }
        function variantLabel(m) { return Rules.isX01(m.mode) ? gateLabel(m.outRule, 'Out') :
            m.mode === 'cricket' ? t(m.cricketVariant === 'cutthroat' ? 'dartsCutThroatCricket' : 'dartsStandardCricket') : ''; }
        function penaltiesText(penalties, names) {
            return Object.keys(penalties || {}).filter(function (id) { return penalties[id] > 0; })
                .map(function (id) { return (names[id] || id) + ' +' + penalties[id]; }).join(options.locale() === 'zh' ? '、' : ', ');
        }
        function shownDistance(distance) { return distanceText(distance) || '—'; }
        function corkLabel(purpose) { return t(purpose === 'opening' ? 'dartsOpeningCork' : purpose === 'limit' ? 'dartsLimitCork' : 'dartsTieCork'); }
        function corkStatusLabel(purpose) { return t(purpose === 'opening' ? 'dartsOpeningCorkStatus' : purpose === 'limit' ? 'dartsLimitCorkStatus' : 'dartsTieCorkStatus'); }
        function corkInstruction(purpose) { return t(purpose === 'opening' ? 'dartsCorkStarts' : 'dartsCorkWins'); }
        var win = doc.defaultView, meta = get('match-meta'), strip = meta.querySelector('.status-strip');
        if (!strip) { strip = el('span', 'status-strip', meta.textContent); meta.replaceChildren(strip); }
        var detail = get('status-detail'), overflowAnimation = null, measureFrame = 0, measureKey = '', metaText = '', detailText = '';
        var reducedMotion = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
        function closeDetail() { if (detail) detail.hidden = true; meta.setAttribute('aria-expanded', 'false'); }
        function stopOverflow() {
            if (overflowAnimation) overflowAnimation.cancel(); overflowAnimation = null;
            strip.style.transform = ''; meta.dataset.scrolling = 'false';
        }
        function measureOverflow() {
            measureFrame = 0;
            var distance = Math.max(0, Math.ceil(strip.scrollWidth - meta.clientWidth));
            var reduced = !!(reducedMotion && reducedMotion.matches), key = JSON.stringify([metaText, distance, reduced]);
            if (key === measureKey) return;
            measureKey = key; stopOverflow();
            meta.dataset.overflow = distance > 1 ? 'true' : 'false';
            if (distance <= 1 || reduced || typeof strip.animate !== 'function') return;
            // Keep both ends still long enough to read; move only the measured hidden distance.
            var pause = 1800, travel = Math.max(1800, distance / 20 * 1000), duration = pause * 2 + travel * 2;
            var end = 'translateX(-' + distance + 'px)';
            overflowAnimation = strip.animate([
                { transform: 'translateX(0)', offset: 0 },
                { transform: 'translateX(0)', offset: pause / duration },
                { transform: end, offset: (pause + travel) / duration },
                { transform: end, offset: (pause * 2 + travel) / duration },
                { transform: 'translateX(0)', offset: 1 },
            ], { duration: duration, iterations: Infinity, easing: 'linear' });
            meta.dataset.scrolling = 'true';
        }
        function queueMeasure() {
            if (!measureFrame) measureFrame = win.requestAnimationFrame(measureOverflow);
        }
        function setMeta(text, fullText) {
            fullText = fullText || text;
            if (metaText === text && detailText === fullText) return;
            metaText = text; detailText = fullText; measureKey = ''; stopOverflow(); closeDetail();
            strip.textContent = text; meta.title = fullText; meta.setAttribute('aria-label', fullText);
            if (detail) detail.textContent = fullText;
            queueMeasure();
        }
        meta.addEventListener('click', function () {
            if (!detail) return;
            detail.hidden = !detail.hidden; meta.setAttribute('aria-expanded', String(!detail.hidden));
        });
        meta.addEventListener('keydown', function (event) {
            // Keep native button activation away from the shell's Start/Space shortcuts.
            if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
        });
        doc.addEventListener('click', function (event) {
            if (!meta.contains(event.target) && !(detail && detail.contains(event.target))) closeDetail();
        });
        doc.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && detail && !detail.hidden) { closeDetail(); event.preventDefault(); event.stopPropagation(); }
        });
        if (win.ResizeObserver) {
            var overflowObserver = new win.ResizeObserver(queueMeasure); overflowObserver.observe(meta); overflowObserver.observe(strip);
        } else win.addEventListener('resize', queueMeasure);
        if (reducedMotion) {
            if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', queueMeasure);
            else if (reducedMotion.addListener) reducedMotion.addListener(queueMeasure);
        }
        if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(queueMeasure);
        function ruleSummary(m) {
            if (m.throwPhase === 'cork') return corkLabel(m.corkPurpose) + ' · ' + t('dartsCorkAttempt', m.corkRound);
            var parts = [];
            if (Rules.isX01(m.mode)) parts.push(gateLabel(m.inRule, 'In'), gateLabel(m.outRule, 'Out'));
            if (Rules.isX01(m.mode) || m.mode === 'countup') parts.push(t(m.bullMode === '50-50' ? 'dartsBull5050' : 'dartsBull2550'));
            if (m.mode === 'cricket') parts.push(variantLabel(m), t(m.cricketVariant === 'cutthroat' ? 'dartsLowestWins' : 'dartsHighestWins'));
            if (m.roundLimit) parts.push(valueLabel('dartsRoundLimit', m.roundLimit));
            return parts.join(' · ');
        }
        function renderEffects(m) {
            var penalties = m.effects && m.effects.penalties || {};
            Array.from(get('player-scores').children).forEach(function (card) {
                var amount = penalties[card.dataset.playerUid], affected = Number.isFinite(amount) && amount > 0;
                card.classList.toggle('penalty-flash', affected);
                var badge = card.querySelector('.player-penalty');
                if (!affected) { if (badge) badge.remove(); return; }
                if (!badge) { badge = el('span', 'player-penalty'); badge.setAttribute('aria-hidden', 'true'); card.append(badge); }
                var text = '+' + amount;
                if (badge.textContent !== text) badge.textContent = text;
            });
        }
        var lastKey = '', lastPlayersKey = '';
        function render(m) {
            // Clock updates should not rebuild the table, reset focus, or repeat live announcements.
            get('turn-timer').hidden = m.timer === null || !!m.opening;
            get('turn-timer').textContent = m.timer === null ? '' : m.timer + 's';
            get('leg-result').hidden = options.isFlying() || !!(m.effects && m.effects.resultPending) || !['between', 'over'].includes(m.phase);
            var finalDart = m.effects && m.effects.finalHit && m.effects.finalHit.dart;
            var withoutClock = JSON.stringify([Object.assign({}, m, { timer: null, effects: null }), options.locale(), options.isFlying(), !!finalDart]);
            if (withoutClock === lastKey) { renderEffects(m); return; }
            lastKey = withoutClock;
            var names = Object.fromEntries(m.players.map(function (p) { return [p.id, p.name]; }));
            var mode = options.modeName(m.mode, m);
            var variant = variantLabel(m), endedPractice = m.mode === 'practice' && m.endReason === 'practice-ended', cancelled = m.endReason === 'cancelled';
            var playingCork = m.throwPhase === 'cork' && (m.phase === 'playing' || !!(finalDart && finalDart.phase === 'cork'));
            meta.classList.toggle('cork-phase', playingCork);
            var ordinaryMeta = mode + (variant ? ' · ' + variant : '') +
                (m.leg ? ' · ' + t('dartsLegNumber', m.leg) + ' · ' + t('dartsMatchFormat', m.legsToWin) : '');
            setMeta(playingCork ? corkStatusLabel(m.corkPurpose) : ordinaryMeta,
                playingCork ? corkLabel(m.corkPurpose) + ' · ' + corkInstruction(m.corkPurpose) + ' · ' + t('dartsCorkAttempt', m.corkRound) : ordinaryMeta);
            if (get('mode-rule-summary')) get('mode-rule-summary').textContent = ruleSummary(m);
            var status = m.opening ? m.opening.drawing ? t('dartsDrawingStarter') : t('dartsCorkStarter', names[m.opening.winner]) : finalDart ? finalDart.phase === 'cork' ? t('dartsCork') + ' · ' + shownDistance(finalDart.distance) :
                t('dartsLast') + ' · ' + label(finalDart.result) :
                cancelled ? t('dartsMatchEnded') : endedPractice ? t('dartsPracticeEnded') : m.phase === 'between' || m.phase === 'over' ? (m.draw ? t('dartsDraw') :
                t(m.phase === 'over' ? 'dartsMatchWon' : 'dartsLegWon') + ' · ' + names[m.winner]) :
                m.mode === 'practice' && m.players.length === 1 ? t('dartsFlickPrompt') :
                    t('dartsTurnOf', names[m.active]) + ' · ' + t('dartsDartProgress', m.dart, m.throwPhase === 'cork' ? 1 : 3);
            get('turn-status').textContent = status;
            if (!m.opening && !finalDart && (m.mode !== 'practice' || m.players.length > 1) && m.phase === 'playing') {
                var indicator = get('turn-status'); indicator.replaceChildren();
                var turnName = el('span', 'status-name', t(playingCork ? 'dartsCorkTurnOf' : 'dartsTurnOf', names[m.active])); turnName.title = turnName.textContent;
                indicator.append(turnName, el('span', 'status-dart', playingCork ? t('dartsCorkDart') : t('dartsDartProgress', m.dart, 3)));
                if (m.throwPhase === 'cork') indicator.append(el('span', 'status-round', t('dartsCorkAttempt', m.corkRound)));
                else if (m.round) indicator.append(el('span', 'status-round', t('dartsRoundProgress', m.round, m.roundLimit)));
            }
            var playersKey = JSON.stringify([m.players, m.mode, options.locale()]);
            if (playersKey !== lastPlayersKey) {
                lastPlayersKey = playersKey;
                var focused = doc.activeElement && doc.activeElement.closest('.darts-player');
                var focusedUid = focused && focused.dataset.playerUid;
                var players = get('player-scores'); players.replaceChildren();
                m.players.forEach(function (p) {
                var card = el('button', 'darts-player' + (p.active ? ' active' : '') + (p.drawingStarter ? ' starter-draw' : '') + (p.left ? ' withdrawn' : ''));
                card.type = 'button'; card.setAttribute('aria-haspopup', 'dialog');
                var owned = options.ownsPlayer ? options.ownsPlayer(p.id) : controls(p.id), cpu = p.type === 'cpu';
                var ownership = (cpu ? t('dartsCpu') + ' · ' + Difficulty.label(p.difficulty, t) + ' · ' : '') +
                    t(owned ? 'dartsThisDevice' : 'dartsOtherDevice');
                card.setAttribute('aria-label', p.name + ' · ' + ownership + ' · ' + t('dartsHistory'));
                card.title = p.name + ' · ' + ownership;
                card.style.setProperty('--player-color', p.color); card.dataset.playerUid = p.id;
                if (p.active) card.setAttribute('aria-current', 'true');
                var seat = el('span', 'player-seat', p.seat); seat.setAttribute('aria-hidden', 'true');
                if (owned) { seat.classList.add('owned-seat'); seat.title = ownership; }
                var name = el('span', 'darts-player-name' + (cpu ? ' cpu-name' : '')); name.title = p.name;
                name.append(el('span', 'darts-name-text', p.left ? t('dartsWithdrawn') + ' · ' + p.name : p.name));
                if (cpu) name.append(el('span', 'cpu-tag', t('dartsCpu')));
                var score = el('strong', 'darts-player-score', p.score);
                score.setAttribute('aria-label', valueLabel(Rules.isX01(m.mode) ? 'dartsRemaining' : m.mode === 'practice' ? 'dartsDarts' : 'dartsPoints', p.score));
                card.append(seat, name, score);
                if (m.mode !== 'practice') card.append(el('span', 'darts-player-legs', p.left ? t('dartsWithdrawn') :
                    Rules.isX01(m.mode) && !p.entered ? t('dartsNotEntered') : valueLabel('dartsLegWins', p.legs)));
                players.append(card);
                });
                if (focusedUid) {
                    var replacement = Array.from(players.children).find(function (card) { return card.dataset.playerUid === focusedUid; });
                    if (replacement) replacement.focus({ preventScroll: true });
                }
            }
            renderEffects(m);
            get('player-score-label').textContent = t(Rules.isX01(m.mode) ? 'dartsRemaining' : m.mode === 'practice' ? 'dartsDarts' : 'dartsPoints');
            var cricket = m.mode === 'cricket';
            get('cricket-board').hidden = !cricket || m.throwPhase === 'cork';
            get('turn-panel').hidden = m.throwPhase === 'cork' || cricket || m.mode === 'practice';
            get('practice-panel').hidden = m.mode !== 'practice' || m.throwPhase === 'cork';
            get('mode-panel').classList.toggle('cork-active', m.throwPhase === 'cork');
            var corkPanel = get('cork-panel'); corkPanel.hidden = !m.cork;
            if (m.cork) {
                get('cork-heading').textContent = corkLabel(m.corkPurpose);
                get('cork-instruction').textContent = corkInstruction(m.corkPurpose);
                get('cork-round-note').textContent = m.cork.rethrow ? t('dartsCorkRethrow', m.cork.round) : t('dartsCorkAttempt', m.cork.round);
                var results = get('cork-results'); results.replaceChildren();
                m.cork.entries.forEach(function (entry) {
                    var player = m.players.find(function (p) { return p.id === entry.id; });
                    var row = el('div', 'cork-result ' + (entry.eligible ? 'eligible' : 'excluded') + (entry.active ? ' current' : ''));
                    row.dataset.playerUid = entry.id; row.dataset.state = entry.status; row.style.setProperty('--player-color', player.color);
                    var name = el('span', 'cork-player-name'), seat = el('span', 'player-seat', player.seat);
                    name.append(seat, el('span', 'cork-name-text', player.name)); name.title = player.name;
                    var hit = entry.result, region = !hit ? '—' : hit.miss ? t('dartsMiss') : hit.base === 25 ? t(hit.mult === 2 ? 'dartsBullShort' : 'dartsOuterBull') : hit.label;
                    var distance = entry.status === 'thrown' ? shownDistance(entry.distance) : entry.status === 'forfeited' ? t('dartsCorkForfeited') :
                        entry.status === 'left' ? t('dartsWithdrawn') :
                            (Number.isFinite(entry.lastDistance) ? shownDistance(entry.lastDistance) + ' · ' : '') +
                            t(entry.status === 'excluded' ? 'dartsCorkExcluded' : entry.status === 'rethrow' ? 'dartsCorkAgain' : 'dartsCorkWaiting');
                    row.append(name, el('span', 'cork-hit', region), el('span', 'cork-distance', distance));
                    results.append(row);
                });
            }
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
                get('turn-owner').textContent = (m.turn.phase === 'cork' ? corkLabel(m.turn.corkPurpose) : t(m.turn.previous ? 'dartsPreviousTurn' : 'dartsThisTurn')) + ' · ' + names[m.turn.owner] +
                    (Rules.isX01(m.mode) && owner && !owner.entered && m.turn.phase !== 'cork' ? ' · ' + t('dartsNotEntered') : '');
                var darts = get('turn-darts'); darts.replaceChildren();
                for (var i = 0; i < (m.turn.phase === 'cork' ? 1 : 3); i++) {
                    var r = m.turn.darts[i], slot = el('div', 'turn-dart');
                    slot.append(el('span', 'turn-dart-number', valueLabel('dartsDart', i + 1)),
                        el('strong', 'turn-dart-hit' + (r && r.base === 25 ? ' bull-hit' : ''), r ?
                            r.miss ? t('dartsMiss') : r.base === 25 ? t(r.mult === 2 ? 'dartsBullShort' : 'dartsOuterBull') : r.label : '—'),
                        el('span', 'turn-dart-score', m.turn.phase === 'cork' ? '' : r ? r.score : '—'));
                    darts.append(slot);
                }
                get('turn-score').textContent = m.turn.phase === 'cork' ? t('dartsDistance') + ' · ' + shownDistance(m.turn.distance) :
                    cricket && m.cricketVariant === 'cutthroat' ? t('dartsPenalties') + ' · ' + (penaltiesText(m.turn.penalties, names) || '—') :
                        t('dartsTurnScore') + ' · ' + m.turn.points;
            }
            var last = m.feedback, feedback = get('dart-feedback');
            feedback.textContent = m.timedOut ? t('dartsTimeout') : last ?
                (last.phase === 'cork' ? corkLabel(last.corkPurpose) + ' · ' + valueLabel('dartsDistance', shownDistance(last.distance)) :
                    last.reason === 'bust' ? t('dartsBust') : last.reason === 'checkout' ? t('dartsCheckout') : cricket ? label(last.result) +
                        (m.cricketVariant === 'cutthroat' ? ' · ' + t('dartsPenalties') + ' · ' + (penaltiesText(last.penalties, names) || '—') : '') : '') : '';
            feedback.classList.toggle('bust', !!(last && last.reason === 'bust'));
            if (m.mode === 'practice') {
                get('practice-hit').textContent = m.practice.result ? label(m.practice.result) : '—';
                get('practice-speed').textContent = m.practice.speed === null ? '—' : Math.round(m.practice.speed) + ' px/s';
            }
            get('result-title').textContent = cancelled ? t('dartsMatchEnded') : endedPractice ? t('dartsPracticeEnded') : m.draw ? t('dartsDraw') : t(m.phase === 'over' ? 'dartsMatchWon' : 'dartsLegWon');
            get('result-winner').textContent = m.draw || endedPractice || cancelled ? '' : names[m.winner] || '';
            get('result-reason').textContent = resultReason(m, t);
            get('next-leg-btn').hidden = m.phase !== 'between';
            get('play-again-btn').hidden = true;
            get('result-room-btn').hidden = m.phase !== 'over';
        }
        return { render: render };
    }
    return { model: model, create: create, resultReason: resultReason };
});
