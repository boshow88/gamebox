/* Throw-area guidance and contact feedback; reads the existing gesture samples only. */
(function () {
    'use strict';

    window.createDartsThrowGuide = function (options) {
        var doc = options.document, win = doc.defaultView, t = options.t;
        var get = function (id) { return doc.getElementById(id); };
        var hint = get('throw-guide'), title = get('throw-guide-title'), message = get('throw-guide-message');
        var surface = get('throw-surface'), panel = get('mode-panel'), viewport = get('match-panel');
        var contact = get('gesture-contact'), trail = get('gesture-trail'), dot = get('gesture-dot');
        var key = options.storage.storageKey('darts', 'throw-guide', 'v1');
        var completed = options.storage.readJSON(key, false) === true, requested = false;
        var coarse = win.matchMedia('(pointer: coarse)'), mobile = win.matchMedia('(max-width: 760px)');
        var reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
        var lastText = '', lastPath = '';

        function complete() {
            completed = true; requested = false;
            options.storage.writeJSON(key, true);
            hide();
        }
        function hide() {
            hint.hidden = true;
            surface.classList.remove('throw-area-hint'); panel.classList.remove('throw-area-hint');
        }
        function sync(eligible, gesture, quiet) {
            var show = eligible && quiet && !gesture && (!completed || requested);
            hint.hidden = !show;
            surface.classList.toggle('throw-area-hint', show); panel.classList.toggle('throw-area-hint', show);
            if (show) {
                var compact = surface.clientHeight < 260;
                hint.classList.toggle('compact', compact);
                var action = coarse.matches ? 'Swipe' : 'Drag', position = mobile.matches ? 'Below' : 'Beside';
                var heading = t('dartsGuide' + action);
                var body = t('dartsGuide' + (compact ? action : '') + position);
                var text = heading + body;
                if (text !== lastText) { title.textContent = heading; message.textContent = body; lastText = text; }
            }
            contact.toggleAttribute('hidden', !eligible || !gesture);
            if (contact.hasAttribute('hidden')) { lastPath = ''; return; }
            // Convert the same logical samples back to CSS pixels. Never smooth, append,
            // or otherwise modify samples here: this layer cannot affect the release.
            var bounds = viewport.getBoundingClientRect(), pts = gesture.samples;
            var start = Math.max(0, pts.length - 10), path = [];
            for (var i = start; i < pts.length; i++) {
                path.push((gesture.sx + pts[i].x / gesture.scaleX - bounds.left - viewport.clientLeft) + ',' +
                    (gesture.sy - pts[i].y / gesture.scaleY - bounds.top - viewport.clientTop));
            }
            var point = path[path.length - 1].split(',');
            dot.setAttribute('cx', point[0]); dot.setAttribute('cy', point[1]);
            trail.style.display = reduced.matches ? 'none' : '';
            var line = path.join(' ');
            if (line !== lastPath) { trail.setAttribute('points', line); lastPath = line; }
        }
        get('throw-guide-dismiss').addEventListener('click', complete);
        // Keep the shell's Space/R shortcuts from treating guide controls as game input.
        hint.addEventListener('keydown', function (event) { event.stopPropagation(); });
        get('throw-guide-review').addEventListener('click', function () { requested = true; options.review(); });
        return { sync: sync, complete: complete };
    };
})();
