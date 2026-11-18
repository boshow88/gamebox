/** Audio scheduling/lifecycle with an injected Web Audio mock, not a listening test. */
'use strict';
const assert = require('node:assert/strict'), Audio = require('../js/games/impressions-audio.js'), P = require('../js/games/impressions-pitch.js');
const notes = Audio.plan([330, 440, 550, 660]); assert.equal(notes.length, 8);
for (let i = 1; i < notes.length; i++) assert(notes[i].startMs > notes[i - 1].endMs);
assert(notes.at(-1).endMs < 8000); assert.equal(notes[0].startMs, 250);
function context() {
    const nodes = [], params = () => ({ value: 0, calls: [], setValueAtTime(...a) { this.calls.push(['set', ...a]); this.value = a[0]; }, linearRampToValueAtTime(...a) { this.calls.push(['ramp', ...a]); this.value = a[0]; }, cancelScheduledValues(...a) { this.calls.push(['cancel', ...a]); }, setTargetAtTime(...a) { this.calls.push(['target', ...a]); this.value = a[0]; } });
    return { currentTime: 10, state: 'suspended', nodes, destination: {}, resume() { this.state = 'running'; return Promise.resolve(); }, close() { this.state = 'closed'; return Promise.resolve(); },
        createOscillator() { const n = { frequency: params(), connect() {}, disconnect() { this.disconnected = true; }, start(at) { this.startAt = at; }, stop(at) { this.stopAt = at; } }; nodes.push(n); return n; },
        createGain() { return { gain: params(), connect() {}, disconnect() {} }; } };
}
(async () => {
    const ctx = context(); let muted = false; const audio = Audio.create({ contextFactory: () => ctx, isMuted: () => muted });
    assert.equal(audio.ready(), false); assert.equal(audio.play([440]), false); await audio.enable(); assert(audio.ready());
    audio.play([330, 440, 550, 660], P.defaults.audio, { originMs: 1000, nowMs: 1000, deadlineMs: 9000, source: 'target' });
    assert.equal(audio.state().scheduled, 8); assert.equal(ctx.nodes[0].startAt, 10.25);
    assert.equal(ctx.nodes[0].stopAt, 10.8); assert(ctx.nodes.every(n => n.type === 'sine'));
    ctx.currentTime = 10.3; assert.equal(audio.state().index, 0); audio.stop(); assert.equal(audio.state().playing, false);
    assert(ctx.nodes.every(n => n.stopAt <= 10.32));
    audio.play([330, 440, 550, 660], {}, { originMs: 1000, nowMs: 4000, deadlineMs: 9000, source: 'target' });
    assert.equal(audio.state().scheduled, 4, 'Late client schedules only the future repeat');
    assert.equal(audio.play([330, 440], {}, { originMs: 1000, nowMs: 9000, deadlineMs: 9000 }), false);
    audio.play([440], { leadMs: 0, toneMs: 150 }, { originMs: 1000, nowMs: 1000, deadlineMs: 1150, repeats: 1 });
    assert(ctx.nodes.at(-1).stopAt <= ctx.currentTime + 0.150001, 'Scheduling lead never extends the shared audio window');
    for (let i = 0; i < 50; i++) { ctx.currentTime += 0.01; audio.preview(440 + i, {}, 1); }
    assert.equal(audio.state().scheduled, 1); assert.equal(audio.state().voices, 1, 'Rapid live pitch changes retune one oscillator');
    assert(ctx.nodes.at(-1).frequency.calls.some(call => call[0] === 'target'), 'Playing previews use smooth frequency ramps');
    audio.play([440, 550], {}, { repeats: 1 }); assert.equal(audio.state().scheduled, 2); audio.stop();
    muted = true; assert.equal(audio.play([440]), false); assert.equal(audio.ready(), false); muted = false;
    ctx.state = 'suspended'; ctx.onstatechange(); assert.equal(audio.state().playing, false); await audio.enable();
    audio.destroy(); assert.equal(ctx.state, 'closed'); assert.equal(audio.ready(), false);
    const broken = Audio.create({ contextFactory: () => { throw new Error('Unavailable'); } }); await assert.rejects(broken.enable(), /Unavailable/); broken.destroy();
    console.log('PASS: mock Web Audio readiness/failure, audio-time sequence/envelope scheduling, late-note filtering, stop/replacement, one-voice live retuning, mute/suspension and teardown. No perceptual listening claim.');
})().catch(error => { console.error(error); process.exitCode = 1; });
