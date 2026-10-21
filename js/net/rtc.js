/* ArcadeRTC — minimal WebRTC DataChannel transport for realtime P2P games.
 *
 * Non-trickle signaling: one offer + one answer, with all ICE candidates bundled
 * into the SDP after gathering completes, carried over an ArcadeNet.mp room doc
 * (so no extra backend — the lobby room IS the signaling channel). The channel is
 * reliable + ordered (lockstep needs inputs in order). STUN only, no TURN: if a
 * direct/relayless path can't be negotiated we simply fail to connect (acceptable
 * for peer play — a relay would add latency and cost anyway).
 *
 * connect(group, code, isHost, opts) -> Promise<conn> that resolves when the channel
 * OPENS. opts.sid ties this attempt to a "generation" so stale SDP left in the room
 * from an earlier match (rematch reuses the same code) is ignored. opts.onMessage /
 * opts.onClose are the live-channel callbacks. conn = { send, close, pc, dc }.
 */
(function () {
    'use strict';
    // STUN discovers each peer's public address; TURN relays when a direct path can't be
    // punched through (symmetric / carrier-grade NAT — common on mobile data, which is why
    // LAN works but phone-vs-PC fails without it). The free openrelay TURN is best-effort;
    // set window.ARCADE_ICE (array of RTCIceServer) to plug in your own (e.g. metered.ca,
    // Cloudflare) for reliability. relay adds latency but "connects at all" beats "fast".
    var DEFAULT_ICE = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ];

    // Non-trickle: resolve once ICE gathering finishes (or a short fallback timeout),
    // so pc.localDescription already carries every candidate we found.
    function iceDone(pc, ms) {
        return new Promise(function (resolve) {
            if (pc.iceGatheringState === 'complete') return resolve();
            var fired = false;
            function go() { if (fired) return; fired = true; resolve(); }
            pc.addEventListener('icegatheringstatechange', function () { if (pc.iceGatheringState === 'complete') go(); });
            pc.addEventListener('icecandidate', function (e) { if (!e.candidate) go(); });
            setTimeout(go, ms || 3000);
        });
    }

    function connect(group, code, isHost, opts) {
        opts = opts || {};
        var net = window.ArcadeNet, F = net && net.field;
        if (!net || !net.ok || !window.RTCPeerConnection) return Promise.reject(new Error('rtc unavailable'));
        var sid = String(opts.sid != null ? opts.sid : 1);
        var pc = new RTCPeerConnection({ iceServers: opts.iceServers || window.ARCADE_ICE || DEFAULT_ICE });
        var unsub = null, settled = false;
        var conn = {
            pc: pc, dc: null, closed: false, remoteSet: false,
            send: function (s) { try { if (conn.dc && conn.dc.readyState === 'open') conn.dc.send(s); } catch (e) { /* channel gone */ } },
            close: function () { conn.closed = true; try { if (unsub) unsub(); } catch (e) { } try { if (conn.dc) conn.dc.close(); } catch (e) { } try { pc.close(); } catch (e) { } },
        };

        return new Promise(function (resolve, reject) {
            function stopSig() { if (unsub) { try { unsub(); } catch (e) { } unsub = null; } }
            function fail(e) {
                if (settled) { if (!conn.closed && opts.onClose) opts.onClose(conn); return; }   // post-open drop → treat as close
                settled = true; stopSig(); try { pc.close(); } catch (x) { }
                reject(e instanceof Error ? e : new Error(String(e)));
            }
            function wire(dc) {
                conn.dc = dc;
                dc.onopen = function () { if (!settled) { settled = true; stopSig(); resolve(conn); } };
                dc.onmessage = function (e) { if (opts.onMessage) opts.onMessage(e.data, conn); };
                dc.onclose = function () { if (!conn.closed && opts.onClose) opts.onClose(conn); };
            }
            pc.oniceconnectionstatechange = function () { if (pc.iceConnectionState === 'failed') fail(new Error('ice failed')); };

            if (isHost) {
                wire(pc.createDataChannel('game', { ordered: true }));            // offerer creates the channel
                unsub = net.mp.watch(group, code, function (d) {
                    if (!d || conn.remoteSet) return;
                    if (d.rtc_ans && String(d.rtc_asid) === sid) { conn.remoteSet = true; pc.setRemoteDescription(JSON.parse(d.rtc_ans)).catch(fail); }
                });
                net.mp.update(group, code, { rtc_sid: sid, rtc_off: F.delete(), rtc_ans: F.delete(), rtc_asid: F.delete() })   // clear stale SDP first
                    .then(function () { return pc.createOffer(); })
                    .then(function (o) { return pc.setLocalDescription(o); })
                    .then(function () { return iceDone(pc); })
                    .then(function () { return net.mp.update(group, code, { rtc_sid: sid, rtc_off: JSON.stringify(pc.localDescription) }); })
                    .catch(fail);
            } else {
                pc.ondatachannel = function (e) { wire(e.channel); };            // answerer receives the channel
                unsub = net.mp.watch(group, code, function (d) {
                    if (!d || conn.remoteSet) return;
                    if (d.rtc_off && String(d.rtc_sid) === sid) {
                        conn.remoteSet = true;
                        pc.setRemoteDescription(JSON.parse(d.rtc_off))
                            .then(function () { return pc.createAnswer(); })
                            .then(function (a) { return pc.setLocalDescription(a); })
                            .then(function () { return iceDone(pc); })
                            .then(function () { return net.mp.update(group, code, { rtc_ans: JSON.stringify(pc.localDescription), rtc_asid: sid }); })
                            .catch(fail);
                    }
                });
            }
            setTimeout(function () { if (!settled) fail(new Error('timeout')); }, opts.timeoutMs || 25000);
        });
    }

    window.ArcadeRTC = { connect: connect, supported: function () { return !!window.RTCPeerConnection; } };
})();
