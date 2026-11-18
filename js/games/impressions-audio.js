/* One Web Audio voice, scheduled against the canonical round clock. No microphone/files. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./impressions-pitch.js'));
    else root.ImpressionsAudio = factory(root.ImpressionsPitch);
})(typeof window === 'object' ? window : globalThis, function (Pitch) {
    'use strict';
    function plan(pitches, input, repeats) {
        var p = Pitch.audioParameters(input), notes = [], count = repeats === undefined ? p.repeats : repeats;
        if (!Array.isArray(pitches) || !pitches.length || !pitches.every(function (hz) { return Number.isFinite(hz) && hz > 0; }) || !Number.isInteger(count) || count < 1 || count > 3) throw new RangeError('Invalid audio sequence.');
        for (var repeat = 0; repeat < count; repeat++) pitches.forEach(function (hz, i) {
            var start = p.leadMs + repeat * (Pitch.sequenceDuration(pitches.length, p) + p.repeatGapMs) + i * (p.toneMs + p.gapMs);
            notes.push({ hz: hz, index: i, startMs: start, endMs: start + p.toneMs });
        });
        return notes;
    }
    function create(options) {
        options = options || {}; var context = null, nodes = [], schedule = [], source = null, closed = false, serial = 0, live = null;
        var muted = options.isMuted || function () { return false; }, onError = options.onError || function () {};
        function ready() { return !closed && !!context && context.state === 'running' && !muted(); }
        function stop() {
            serial++; source = null; schedule = []; live = null;
            if (!context) return;
            nodes.forEach(function (entry) {
                if (entry.stopping) return; entry.stopping = true;
                try { entry.gain.gain.cancelScheduledValues(context.currentTime); entry.gain.gain.setValueAtTime(Math.min(entry.volume, Math.max(0, entry.gain.gain.value)), context.currentTime); entry.gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.015); entry.osc.stop(context.currentTime + 0.02); } catch (_) { /* Already ended. */ }
            });
        }
        async function enable() {
            if (closed) throw new Error('Audio is closed.');
            if(context&&context.state==='closed'){stop();context.onstatechange=null;context=null;nodes=[];}
            if (!context) {
                var factory = options.contextFactory || function () { var Type = globalThis.AudioContext || globalThis.webkitAudioContext; if (!Type) throw new Error('Web Audio is unavailable.'); return new Type({ latencyHint: 'interactive' }); };
                context = factory();
                context.onstatechange = function () { if (!ready()) stop(); };
            }
            var timeout;
            try { await Promise.race([context.resume(), new Promise(function (_, reject) { timeout = setTimeout(function () { reject(new Error('Audio activation timed out.')); }, 3000); })]); }
            finally { clearTimeout(timeout); }
            if (!ready()) throw new Error(muted() ? 'Sound is muted.' : 'Audio could not start.'); return true;
        }
        async function recover() {
            if(closed||!context||muted())return false;
            try { return await enable(); } catch (_) { return false; }
        }
        function play(pitches, input, timing) {
            stop(); if (!ready()) return false;
            var p = Pitch.audioParameters(input), settings = timing || {}, nowMs = settings.nowMs === undefined ? 0 : settings.nowMs;
            var origin = settings.originMs === undefined ? nowMs : settings.originMs, end = settings.deadlineMs === undefined ? Infinity : settings.deadlineMs;
            var token = serial, base = context.currentTime, next = plan(pitches, p, settings.repeats);
            source = settings.source || 'preview';
            try {
                next.forEach(function (note) {
                    var delta = origin + note.startMs - nowMs, duration = Math.min(note.endMs + origin, end) - note.startMs - origin;
                    // Late/resumed clients hear only future notes from the shared schedule.
                    if (delta < 0 || duration < p.attackMs + p.releaseMs || origin + note.startMs >= end) return;
                    var start = base + Math.max(0.025, delta / 1000), finish = Math.min(start + duration / 1000, Number.isFinite(end) ? base + (end - nowMs) / 1000 : Infinity);
                    if (finish - start < (p.attackMs + p.releaseMs) / 1000) return;
                    var osc = context.createOscillator(), gain = context.createGain(), entry = { osc: osc, gain: gain, volume: p.volume, stopping: false };
                    osc.type = 'sine'; osc.frequency.setValueAtTime(note.hz, start);
                    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(p.volume, start + p.attackMs / 1000);
                    gain.gain.setValueAtTime(p.volume, finish - p.releaseMs / 1000); gain.gain.linearRampToValueAtTime(0, finish);
                    osc.connect(gain); gain.connect(context.destination); nodes.push(entry);
                    osc.onended = function () { osc.disconnect(); gain.disconnect(); nodes = nodes.filter(function (n) { return n !== entry; }); };
                    osc.start(start); osc.stop(finish);
                    schedule.push({ index: note.index, start: start, end: finish, token: token });
                });
            } catch (error) { stop(); onError(error); return false; }
            if (!schedule.length) { source = null; return false; } return true;
        }
        function state() {
            if (!ready() && schedule.length) stop();
            var now = context ? context.currentTime : 0, upcoming = schedule.some(function (note) { return note.end > now; });
            var active = schedule.find(function (note) { return note.start <= now && note.end > now; });
            return { ready: ready(), playing: upcoming, index: active ? active.index : -1, source: upcoming ? source : null, scheduled: schedule.length, voices: nodes.filter(function (n) { return !n.stopping; }).length };
        }
        function preview(hz, input, index) {
            if (!Number.isFinite(hz) || hz <= 0 || !ready()) return false;
            var p = Pitch.audioParameters(input), end = context.currentTime + 0.45;
            if (!live || live.stopping || !nodes.includes(live) || !schedule.length || schedule[0].end <= context.currentTime) {
                if (!play([hz], Object.assign({}, p, { toneMs: 450, leadMs: 0 }), { repeats: 1, source: 'tone:' + index })) return false;
                live = nodes[nodes.length - 1]; return true;
            }
            source = 'tone:' + index;
            if (context.currentTime < schedule[0].start) { live.osc.frequency.setValueAtTime(hz, schedule[0].start); return true; }
            live.osc.frequency.setTargetAtTime(hz, context.currentTime, 0.012);
            if (typeof live.gain.gain.cancelAndHoldAtTime === 'function') live.gain.gain.cancelAndHoldAtTime(context.currentTime);
            else { var level = live.gain.gain.value; live.gain.gain.cancelScheduledValues(context.currentTime); live.gain.gain.setValueAtTime(level, context.currentTime); }
            live.gain.gain.linearRampToValueAtTime(p.volume, context.currentTime + 0.015);
            live.gain.gain.setValueAtTime(p.volume, end - p.releaseMs / 1000); live.gain.gain.linearRampToValueAtTime(0, end);
            live.osc.stop(end); schedule[0].end = end; return true;
        }
        return { enable: enable, recover: recover, ready: ready, play: play, preview: preview, stop: stop, state: state,
            destroy: function () { stop(); closed = true; if (context) { context.onstatechange = null; var closing = context.close(); if (closing && closing.catch) closing.catch(function () {}); } } };
    }
    return { plan: plan, create: create };
});
