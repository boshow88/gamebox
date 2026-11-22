/** Test-only observation of real AudioContext nodes; leaves synthesis/scheduling unchanged. */
'use strict';
exports.instrument = source => {
    const marker = 'context = factory();';
    if (!source.includes(marker)) throw new Error('Impressions audio instrumentation marker changed');
    return source.replace(marker, `${marker}
        const probe={context,notes:[]};(globalThis.__impressionsAudioProbe ||= []).push(probe);
        const makeOsc=context.createOscillator.bind(context);
        context.createOscillator=()=>{const osc=makeOsc(),entry={start:null,stop:null,ended:false};probe.notes.push(entry);
            const start=osc.start.bind(osc),stop=osc.stop.bind(osc);osc.start=at=>{entry.start=at;return start(at)};osc.stop=at=>{entry.stop=at;return stop(at)};
            osc.addEventListener('ended',()=>entry.ended=true);return osc;};`);
};
