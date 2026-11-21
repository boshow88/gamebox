/* Canvas artwork uses the same world coordinates and obstacle geometry as the rules. */
(function (root) {
    'use strict';
    const R = root.TrashTossRules, W = R.WORLD;
    function interpolate(model) {
        const previous = model.previous, dt = previous && model.time - previous.time;
        if (!(dt > 0 && dt <= .05) || !(model.alpha >= 0 && model.alpha < 1)) return model;
        const alpha = model.alpha;
        function body(current) {
            const old = current && previous.bodies.get(current);
            if (!old) return current;
            return Object.assign({}, current, {
                x: old.x + (current.x - old.x) * alpha,
                y: old.y + (current.y - old.y) * alpha,
                rotation: old.rotation + (current.rotation - old.rotation) * alpha,
            });
        }
        const ball = body(model.ball);
        return Object.assign({}, model, { time: previous.time + dt * alpha, ball, debris: model.debris.map(body),
            trail: ball && ball !== model.ball && model.trail.length ? model.trail.slice(0, -1).concat({ x: ball.x, y: ball.y }) : model.trail });
    }
    function create(canvas) {
        // The stage is fully painted; an opaque canvas avoids an alpha compositing layer.
        let ctx = canvas.getContext('2d', { alpha: false });
        let backdrop = null, backdropScene = '', pixelScale = 1;
        let binLayers = new WeakMap(), personLayers = new Map(), restingLayers = new WeakMap(), ruler = null;
        let portrait = false, qa = false, cameraX = 0, cameraY = 0, manual = false, lastTime = null, wasFlying = false;
        let worldWidth = W.width, layout = R.SCENES.office, overviewGrab = null;
        const overviewHeight = 68, viewport = R.SCENES.construction;
        function cameraEnabled() { return !qa && worldWidth > frameWidth(); }
        function frameWidth() { return qa ? worldWidth : portrait ? viewport.phoneWidth : viewport.viewWidth; }
        function frameHeight() { return qa ? Math.max(W.height, W.height * worldWidth / W.width) : W.height; }
        function fit() {
            const dpr = Math.min(root.devicePixelRatio || 1, 2);
            portrait = !qa && root.innerWidth <= 620 && root.innerHeight > root.innerWidth;
            canvas.parentElement.classList.toggle('is-portrait', portrait);
            canvas.parentElement.classList.toggle('is-camera', cameraEnabled());
            canvas.parentElement.classList.toggle('has-overview', !qa);
            canvas.parentElement.style.maxWidth = !qa && !portrait ? frameWidth() + 'px' : '';
            canvas.parentElement.style.setProperty('--tt-map-height', ((canvas.parentElement.clientWidth - 2) * overviewHeight / frameWidth()) + 'px');
            if (!cameraEnabled()) { manual = false; cameraX = 0; cameraY = 0; }
            // Match backing pixels to the displayed size, rather than the whole logical map.
            const displayWidth = Math.min(frameWidth(), Math.max(1, canvas.parentElement.clientWidth - 2));
            pixelScale = dpr * displayWidth / frameWidth();
            canvas.width = Math.round(frameWidth() * pixelScale);
            canvas.height = Math.round((frameHeight() + (!qa ? overviewHeight : 0)) * pixelScale);
            ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
            backdrop = null; backdropScene = '';
            binLayers = new WeakMap(); personLayers = new Map(); restingLayers = new WeakMap(); ruler = null;
            lastTime = null;
        }
        function follow() {
            manual = false; cameraX = 0; cameraY = 0; lastTime = null; wasFlying = false; overviewGrab = null;
        }
        function beginPan(clientX, clientY) {
            overviewGrab = null;
            if (!cameraEnabled()) return false;
            const bounds = canvas.getBoundingClientRect();
            if ((clientY - bounds.top) / bounds.height * (W.height + overviewHeight) < W.height) return false;
            const x = (clientX - bounds.left) / bounds.width * worldWidth;
            overviewGrab = x >= cameraX && x <= cameraX + frameWidth() ? x - cameraX : frameWidth() / 2;
            manual = true; cameraY = 0;
            cameraX = R.clamp(x - overviewGrab, 0, worldWidth - frameWidth());
            return true;
        }
        function panBy(pixels, clientY, clientX) {
            if (!cameraEnabled()) return;
            const bounds = canvas.getBoundingClientRect();
            const inOverview = (clientY - bounds.top) / bounds.height * (W.height + overviewHeight) >= W.height;
            manual = true; cameraY = 0;
            const target = inOverview ? Number.isFinite(clientX) ? (clientX - bounds.left) / bounds.width * worldWidth - (overviewGrab == null ? frameWidth() / 2 : overviewGrab) : cameraX + pixels * worldWidth / bounds.width : cameraX - pixels * frameWidth() / bounds.width;
            cameraX = R.clamp(target, 0, worldWidth - frameWidth());
        }
        function track(model) {
            const width = frameWidth();
            const anchor = model.ball || (!model.aiming ? model.resultPosition : null);
            if (model.ball && !wasFlying) manual = false;
            const target = anchor ? R.clamp(anchor.x - width * .42, 0, worldWidth - width) : 0;
            const targetY = qa ? W.height - frameHeight() : manual ? 0 : anchor ? Math.min(0, W.floor - anchor.y - 140) : 0;
            const dt = lastTime == null ? 0 : R.clamp(model.time - lastTime, 0, .1);
            if (!manual) {
                if (!cameraEnabled() || lastTime == null || model.time < lastTime || model.ball && !wasFlying) cameraX = target;
                else cameraX += (target - cameraX) * (1 - Math.exp(-dt * 12));
            }
            if (lastTime == null || !cameraEnabled()) cameraY = targetY;
            else cameraY += (targetY - cameraY) * (1 - Math.exp(-dt * 12));
            lastTime = model.time; wasFlying = !!model.ball;
            return width;
        }
        function rect(x, y, width, height, color, radius) {
            ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius || 0); ctx.fill();
        }
        function line(points, color, width) {
            ctx.strokeStyle = color; ctx.lineWidth = width || 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
        }
        function circle(x, y, radius, color) {
            ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
        }
        function text(value, x, y, size, color, align) {
            ctx.font = '600 ' + size + 'px system-ui, sans-serif'; ctx.fillStyle = color;
            ctx.textAlign = align || 'left'; ctx.fillText(value, x, y);
        }
        function visible(x, radius) { return x + radius >= cameraX && x - radius <= cameraX + frameWidth(); }
        function layer(left, top, width, height, paint) {
            const canvas = root.document.createElement('canvas');
            canvas.width = Math.ceil(width * pixelScale); canvas.height = Math.ceil(height * pixelScale);
            const main = ctx;
            ctx = canvas.getContext('2d'); ctx.setTransform(pixelScale, 0, 0, pixelScale, -left * pixelScale, -top * pixelScale);
            try { paint(); } finally { ctx = main; }
            return { canvas, left, top, width: canvas.width / pixelScale, height: canvas.height / pixelScale };
        }
        function blit(sprite, x = sprite.left, y = sprite.top) {
            ctx.drawImage(sprite.canvas, x, y, sprite.width, sprite.height);
        }
        function plant(x, y) {
            line([[x, y], [x - 4, y - 64]], '#63816c', 5);
            for (let i = 0; i < 4; i++) {
                ctx.fillStyle = i % 2 ? '#6c947b' : '#87a88a'; ctx.beginPath();
                ctx.ellipse(x + (i % 2 ? -11 : 9), y - 18 - i * 12, 9, 18, i % 2 ? -.7 : .7, 0, Math.PI * 2); ctx.fill();
            }
            rect(x - 18, y - 2, 36, 34, '#c7896f', 4);
        }
        function background(scene) {
            const arena = scene.scene === 'arena', park = scene.scene === 'park', living = scene.scene === 'living', construction = scene.scene === 'construction', field = Math.max(R.fieldWidth(scene), frameWidth());
            const sky = ctx.createLinearGradient(0, 0, 0, W.floor);
            sky.addColorStop(0, park || construction ? '#d7e9e5' : '#efe6d9'); sky.addColorStop(1, park || construction ? '#f3eedb' : '#e8dcca');
            ctx.fillStyle = sky; ctx.fillRect(0, 0, field, W.height);
            if (arena) {
                rect(0, 92, field, 374, '#a7aaa1');
                for (let y = 105; y < 458; y += 28) for (let x = (y % 56 ? -35 : 0); x < field; x += 72) {
                    rect(x + 2, y, 68, 24, ['#a4a69d', '#b1b0a4', '#999e98'][(Math.abs(x) + y) % 3], 1);
                }
                rect(0, 86, field, 8, '#798e88');
                line([[240, 278], [315, 214], [393, 275], [466, 203]], '#c07d8790', 14);
                line([[260, 299], [324, 255], [401, 308], [480, 237]], '#73a6a590', 8);
                text('THROW / REPEAT', 280, 153, 23, '#f3dfb9', 'center');
                line([[45, 60], [field - 45, 65]], '#6d7a75', 2);
                for (let x = 75; x < field - 10; x += 96) circle(x, 63 + Math.sin(x) * 3, 5, '#efd5a0');
                rect(180, 374, 97, 55, '#6b8381', 3);
                for (let x = 190; x < 270; x += 12) line([[x, 382], [x, 420]], '#91a29a', 3);
                line([[185, 440], [255, 440]], '#ba8d70', 6); circle(196, 449, 5, '#657976'); circle(246, 449, 5, '#657976');
            } else if (construction) {
                rect(0, 296, field, 170, '#ddcfb4');
                for (let x = 220; x < field; x += 360) {
                    rect(x, 90, 170, 276, '#a9b4ad', 3);
                    for (let y = 110; y < 350; y += 62) for (let col = 0; col < 3; col++) rect(x + 12 + col * 51, y, 36, 44, '#d7e2d9', 2);
                    for (const dx of [-15, 185]) line([[x + dx, 66], [x + dx, 400]], '#899687', 5);
                    for (let y = 80; y < 390; y += 65) { line([[x - 15, y], [x + 185, y]], '#a8aa88', 4); line([[x - 15, y], [x + 185, y + 65]], '#a8aa8870', 2); }
                }
                const craneX = field * .72;
                line([[craneX, 375], [craneX, 23], [craneX - 230, 23], [craneX + 290, 23]], '#bd9c56', 13);
                line([[craneX, 26], [craneX + 190, 26], [craneX, 86], [craneX, 26], [craneX - 200, 26]], '#d9b771', 5);
                line([[craneX + 260, 25], [craneX + 260, 224], [craneX + 250, 236]], '#7d8576', 3);
                for (let x = 360; x < field; x += 460) {
                    rect(x, 412, 94, 16, '#b88967', 2); rect(x + 8, 396, 78, 16, '#c79a72', 2);
                    line([[x - 35, 455], [x - 23, 422], [x - 10, 455]], '#d69958', 9);
                    rect(x - 43, 454, 41, 7, '#747b6e', 2);
                }
            } else if (living) {
                rect(0, 316, field, 150, '#e4d3bd'); rect(0, 312, field, 5, '#c9b398');
                for (let x = 28; x < field; x += 132) rect(x, 336, 104, 104, '#d9c4a833', 5);
                rect(0, 452, field, 14, '#bcaa90'); line([[0, 452], [field, 452]], '#f2e4cf', 3);
                // Window and seating occupy the front third, leaving the thrower clear.
                rect(91, 76, 148, 172, '#c7b9a1', 5); rect(99, 84, 132, 154, '#c2dcd4', 2);
                circle(199, 116, 18, '#f4e6bc');
                rect(161, 84, 6, 154, '#f5ecdb'); rect(99, 158, 132, 5, '#f5ecdb');
                line([[78, 66], [252, 66]], '#a99b83', 5);
                rect(80, 69, 23, 192, '#c99584', 7); rect(228, 69, 23, 192, '#c99584', 7);
                rect(86, 183, 15, 8, '#e5bea1', 3); rect(230, 183, 15, 8, '#e5bea1', 3);
                rect(171, 326, 152, 88, '#90a88f', 17); rect(156, 365, 183, 57, '#7e9b80', 12);
                rect(175, 342, 54, 43, '#b7c6a1', 9); rect(263, 343, 54, 42, '#cda587', 9);
                line([[178, 398], [318, 398]], '#a5b69a', 2);
                rect(170, 420, 11, 28, '#957b5c', 3); rect(314, 420, 11, 28, '#957b5c', 3);
                // A quiet gallery wall keeps the middle throwing lane readable.
                for (const [x, y, color] of [[358, 124, '#a6b59a'], [435, 145, '#c8a48b']]) {
                    rect(x, y, 59, 75, '#bc9e7d', 3); rect(x + 6, y + 6, 47, 63, '#f1e6d1', 1);
                    circle(x + 29, y + 25, 12, color);
                    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x + 9, y + 61); ctx.lineTo(x + 27, y + 37); ctx.lineTo(x + 49, y + 61); ctx.closePath(); ctx.fill();
                }
                circle(550, 112, 27, '#cbb99d'); circle(550, 112, 23, '#f7eddc');
                line([[550, 96], [550, 112], [562, 118]], '#857f6c', 2);
                rect(463, 385, 66, 9, '#b89a76', 4); rect(472, 394, 5, 48, '#a88b68'); rect(516, 394, 5, 48, '#a88b68');
                rect(481, 374, 30, 6, '#a3b39b', 2); rect(485, 369, 26, 5, '#c4a18a', 1);
                // TV console, reading lamp and bookcase balance the full desktop viewport.
                rect(620, 329, 144, 15, '#b89a76', 3); rect(627, 344, 130, 83, '#c4aa86', 5);
                rect(635, 353, 52, 61, '#b79b77', 3); rect(695, 353, 54, 61, '#d4bea0', 3);
                circle(676, 384, 2, '#8d816b'); circle(705, 384, 2, '#8d816b');
                rect(634, 426, 8, 20, '#9e896d'); rect(742, 426, 8, 20, '#9e896d');
                rect(638, 239, 109, 79, '#5c7270', 6); rect(645, 246, 95, 65, '#b6cbc0', 2);
                line([[659, 294], [684, 267], [706, 290], [726, 277]], '#a2bbad', 3);
                rect(685, 318, 15, 10, '#758a7d', 2); rect(673, 325, 39, 4, '#758a7d', 2);
                line([[799, 287], [799, 443]], '#a28f72', 4); rect(779, 441, 40, 6, '#a28f72', 4);
                ctx.fillStyle = '#e0ca9e'; ctx.beginPath(); ctx.moveTo(786, 244); ctx.lineTo(812, 244); ctx.lineTo(825, 288); ctx.lineTo(773, 288); ctx.closePath(); ctx.fill();
                rect(838, 233, 96, 213, '#b59a79', 5);
                for (let row = 0; row < 4; row++) {
                    const y = 244 + row * 48;
                    rect(846, y, 80, 39, '#ddc7a8', 2);
                    for (let i = 0; i < 5; i++) {
                        const height = 22 + (i + row) % 3 * 5;
                        rect(852 + i * 14, y + 36 - height, 10, height, ['#90a88f', '#c99584', '#a4abb2', '#d5b779'][(i + row) % 4], 1);
                    }
                }
                plant(885, 210);
            } else if (park) {
                circle(775, 87, 39, '#f7dd9d');
                for (const [x, y] of [[130, 100], [450, 61], [660, 130]]) {
                    rect(x, y, 118, 18, '#ffffff80', 20); circle(x + 37, y, 24, '#ffffff80'); circle(x + 75, y + 2, 19, '#ffffff80');
                }
                ctx.fillStyle = '#b6ccad'; ctx.beginPath(); ctx.moveTo(0, 320);
                ctx.bezierCurveTo(260, 180, 390, 360, 580, 275); ctx.bezierCurveTo(760, 190, 870, 250, field, 230); ctx.lineTo(field, 466); ctx.lineTo(0, 466); ctx.fill();
                for (const x of [170, 525, 915]) {
                    rect(x - 7, 250, 14, 151, '#9b9e79', 4);
                    circle(x, 241, 58, '#9ab89a'); circle(x - 31, 267, 34, '#a5c2a1'); circle(x + 35, 267, 35, '#a5c2a1');
                }
                rect(0, 403, field, 63, '#d5dbb9');
                for (let x = 0; x < field; x += 48) { rect(x, 376, 5, 69, '#b1b99a'); rect(x, 389, 48, 4, '#b1b99a'); }
                rect(235, 402, 115, 10, '#b79473', 3); rect(240, 378, 105, 17, '#b79473', 3);
                line([[250, 410], [250, 444]], '#8e8c74', 5); line([[332, 410], [332, 444]], '#8e8c74', 5);
            } else {
                rect(415, 21, 138, 32, '#cdd7cb', 6);
                rect(423, 40, 122, 5, '#9cb2a3', 2);
                for (const x of [145, 450]) {
                    rect(x, 69, 222, 191, '#d4c6b3', 5); rect(x + 8, 77, 206, 175, '#bad3cf', 2);
                    const gradient = ctx.createLinearGradient(x, 80, x, 250); gradient.addColorStop(0, '#a9c9ca'); gradient.addColorStop(1, '#e1e8d8');
                    ctx.fillStyle = gradient; ctx.fillRect(x + 8, 77, 206, 175);
                    for (let i = 0; i < 5; i++) rect(x + 15 + i * 42, 191 - (i % 3) * 20, 28, 61 + (i % 3) * 20, '#a2bbb5');
                    rect(x + 107, 77, 7, 175, '#f6f0e6'); rect(x + 8, 157, 206, 6, '#f6f0e6'); rect(x - 6, 256, 234, 10, '#c5b39b', 3);
                }
                circle(802, 126, 35, '#c7bba7'); circle(802, 126, 30, '#f9f3e9');
                line([[802, 108], [802, 126], [819, 135]], '#617a73', 3);
                rect(748, 282, 118, 8, '#baa58b', 3);
                for (let i = 0; i < 7; i++) rect(756 + i * 13, 238 + (i % 3) * 8, 10, 44 - (i % 3) * 8, ['#8ba99b', '#d7a485', '#a4abb2'][i % 3], 1);
                rect(0, 353, field, 113, '#e0d1bc'); rect(0, 350, field, 4, '#cbb99f');
                plant(890, 397); rect(170, 384, 140, 10, '#b39b7e', 3);
                rect(181, 394, 7, 72, '#a38f77'); rect(292, 394, 7, 72, '#a38f77');
                rect(212, 340, 56, 40, '#6d8580', 4); rect(216, 344, 48, 31, '#bad0c5', 2); rect(236, 380, 8, 5, '#6d8580');
            }
            rect(0, W.floor, field, 74, arena ? '#8f9892' : construction ? '#bca88a' : park ? '#c8baa0' : '#c8ad8d');
            line([[0, W.floor], [field, W.floor]], park ? '#a5ac87' : '#b89c7b', 3);
            for (let x = -100; x < field + 100; x += 120) line([[x, 466], [x + 55, 540]], '#ffffff1e', 2);
            line([[0, 508], [field, 508]], '#ffffff20', 2);
        }
        function drawBackground(scene) {
            if (!root.document) { background(scene); return; }
            if (!backdrop || backdropScene !== scene.scene) {
                const layer = root.document.createElement('canvas');
                layer.width = Math.ceil(Math.max(worldWidth, frameWidth()) * pixelScale); layer.height = Math.ceil(W.height * pixelScale);
                const main = ctx;
                ctx = layer.getContext('2d'); ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
                try { background(scene); } finally { ctx = main; }
                backdrop = layer; backdropScene = scene.scene;
            }
            ctx.drawImage(backdrop, 0, 0, backdrop.width, backdrop.height, 0, 0, Math.max(worldWidth, frameWidth()), W.height);
        }
        function person(box, time, thrower, charging) {
            const x = box.x, y = W.floor, boss = box.id === 'boss';
            const role = box.role || (box.id === 'mother' ? 'mother' : ''), size = role === 'child' ? .72 : 1;
            ctx.save(); ctx.translate(x, y); ctx.scale(size, size); ctx.translate(-x, -y);
            ctx.fillStyle = '#263e3420'; ctx.beginPath(); ctx.ellipse(x, y + 4, 27, 6, 0, 0, Math.PI * 2); ctx.fill();
            const stride = thrower || box.waiting || box.working ? 0 : Math.sin(time * 5) * 9;
            line([[x - 8, y - 42], [x - 10 - stride, y - 5]], '#465d61', 10);
            line([[x + 8, y - 42], [x + 11 + stride, y - 5]], '#465d61', 10);
            rect(x - 18 - stride, y - 7, 17, 7, '#354f51', 3); rect(x + 5 + stride, y - 7, 18, 7, '#354f51', 3);
            const worker = box.id === 'worker' || box.id === 'worker-far' || role === 'foreman';
            const shirt = box.id === 'cleaner' ? '#6096a1' : worker ? '#d79856' : role === 'child' ? box.player === 0 ? '#cc8f88' : '#7d9bbb' : role === 'grandma' ? '#a18ba7' : role === 'employee' ? '#7a9aa6' : role === 'mother' ? '#c99591' : box.player != null ? box.player === 0 ? '#3e8c7b' : '#6688b0' : boss ? '#647785' : '#c49567';
            rect(x - 17, y - 85, 34, 48, shirt, 8);
            if (boss) { line([[x, y - 81], [x, y - 58]], '#e4a48b', 6); rect(x + 7, y - 74, 6, 3, '#d8e4de', 1); }
            const armY = thrower ? y - 96 - (charging ? 5 : 0) : role === 'mother' ? y - 92 : y - 55;
            line([[x + 12, y - 78], [x + 26, armY], [x + 37, armY - 6]], '#d6a982', 9);
            line([[x - 13, y - 77], [x - 23, y - 53]], shirt, 9);
            circle(x, y - 101, 16, '#deb38c');
            if (boss || thrower || box.player != null || role === 'mother') { ctx.fillStyle = boss ? '#596365' : '#4c655a'; ctx.beginPath(); ctx.arc(x, y - 105, 16, Math.PI, Math.PI * 2); ctx.fill(); }
            else { rect(x - 19, y - 116, 39, 5, '#829585', 3); rect(x - 12, y - 128, 25, 14, '#829585', 5); }
            circle(x + 6, y - 102, 1.7, '#3d5853');
            if (worker || box.id === 'cleaner') {
                const helmet = role === 'foreman' ? box.player === 0 ? '#eee6d2' : '#a9c9cf' : worker ? '#edcc70' : '#76a5ac';
                rect(x - 18, y - 117, 36, 7, worker ? '#c1ac7c' : '#527d89', 3);
                rect(x - 12, y - 128, 24, 13, helmet, 6);
                if (worker) { line([[x - 9, y - 82], [x - 9, y - 40]], '#f2df9c', 4); line([[x + 9, y - 82], [x + 9, y - 40]], '#f2df9c', 4); }
            }
            if (box.id === 'cleaner') {
                const sway = box.working ? Math.sin(time * 8) * 9 : 0;
                line([[x + 25, y - 70], [x + 42 + sway, y - 4 - (box.working ? box.reach || 0 : 0)]], '#987b55', 4);
                rect(x + 29 + sway, y - 7, 29, 7, '#a5b58a', 3);
                if (box.carrying) { ctx.fillStyle = '#718878'; ctx.beginPath(); ctx.ellipse(x - 32, y - 31, 18, 25, -.15, 0, Math.PI * 2); ctx.fill(); }
            }
            if (role === 'employee') {
                line([[x - 7, y - 83], [x, y - 64], [x + 7, y - 83]], '#efe3ce', 2);
                rect(x - 5, y - 66, 10, 13, '#e4d7b7', 2); rect(x - 3, y - 63, 6, 4, '#869f9a');
            } else if (role === 'grandma') {
                ctx.fillStyle = '#d4d4c8'; ctx.beginPath(); ctx.arc(x, y - 107, 17, Math.PI, Math.PI * 2); ctx.fill();
                circle(x - 16, y - 113, 8, '#c6cac0');
                ctx.strokeStyle = '#7f7772'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x + 7, y - 103, 4, 5, 0, 0, Math.PI * 2); ctx.stroke();
                line([[x - 9, y - 105], [x + 3, y - 103]], '#7f7772', 1.4);
                line([[x + 13, y - 103], [x + 17, y - 99]], '#c99a79', 2);
                for (const dx of [-8, 5]) circle(x + dx, y - 65, 2, '#d6b8ca');
            } else if (role === 'skater') {
                rect(x - 18, y - 120, 34, 12, '#9a7f99', 4); rect(x + 7, y - 112, 17, 4, '#7f6d83', 2);
                line([[x - 10, y - 72], [x + 7, y - 61]], '#dcc78e', 3);
            } else if (role === 'mother') {
                circle(x - 15, y - 112, 10, '#655c52');
                ctx.fillStyle = '#655c52'; ctx.beginPath(); ctx.arc(x, y - 107, 17, Math.PI, Math.PI * 2); ctx.fill();
                rect(x - 13, y - 69, 26, 31, '#b8c4a6', 5); line([[x - 10, y - 81], [x - 5, y - 66], [x + 6, y - 66], [x + 11, y - 81]], '#e0d7b9', 2);
            } else if (role === 'child') {
                line([[x - 7, y - 111], [x - 2, y - 123], [x + 2, y - 113]], '#4c655a', 5); circle(x, y - 64, 7, '#eed38f');
                circle(x + 2, y - 65, 2, '#77765a');
            }
            ctx.restore();
        }
        function drawPlayer(box, time, thrower, charging) {
            if (!root.document) { person(box, time, thrower, charging); return; }
            // Throwers and waiting players have a fixed pose (no walking stride).
            const key = [box.role, box.player, thrower, charging].join(':');
            let sprite = personLayers.get(key);
            if (!sprite) {
                sprite = layer(-32, W.floor - 136, 80, 148, () => person({ ...box, x: 0 }, time, thrower, charging));
                personLayers.set(key, sprite);
            }
            blit(sprite, box.x - 32, W.floor - 136);
        }
        function obstacle(box, time) {
            const x = box.x, y = W.floor - box.y;
            ctx.save(); ctx.translate(x, y); ctx.scale(box.direction || 1, 1); ctx.translate(-x, -y);
            if (box.id === 'baby') {
                const crawl = Math.sin(time * 4) * 5;
                ctx.fillStyle = '#617b6a24'; ctx.beginPath(); ctx.ellipse(x, y - 1, 25, 5, 0, 0, Math.PI * 2); ctx.fill();
                line([[x - 11, y - 17], [x - 20 - crawl, y - 3]], '#d8ad8b', 7); line([[x + 7, y - 17], [x + 17 + crawl, y - 3]], '#d8ad8b', 7);
                rect(x - 15, y - 25, 30, 18, '#e2daca', 8); circle(x + 16, y - 28, 10, '#deb58e');
                line([[x + 15, y - 37], [x + 18, y - 40]], '#8c795e', 2); circle(x + 21, y - 29, 1.5, '#586354');
            } else if (box.id === 'parrot') {
                ctx.save(); ctx.translate(x, y);
                const flap = Math.sin(time * 12) * 12;
                line([[-5, -8], [-27, -12]], '#3c8d94', 6);
                ctx.fillStyle = '#83a96e'; ctx.beginPath(); ctx.ellipse(0, -10, 15, 9, -.2, 0, Math.PI * 2); ctx.fill();
                line([[-1, -10], [-13, -25 - flap]], '#6a9d85', 9);
                circle(11, -17, 8, '#b4bd73'); circle(14, -19, 2, '#445c54');
                line([[17, -16], [23, -13], [18, -11]], '#c58f65', 3); ctx.restore();
            } else if (box.id === 'laundry') {
                for (const dx of [-12, 0, 12]) circle(x + dx, y - 30, 9, dx === 0 ? '#cba9a0' : '#acbf9f');
                rect(x - box.width / 2, y - 28, box.width, 28, '#cfb281', 5);
                for (let dx = -16; dx < 20; dx += 10) line([[x + dx, y - 23], [x + dx + 2, y - 5]], '#ae956f', 2);
            } else if (box.id === 'bird') {
                const flap = Math.sin(time * 12) * 10;
                line([[x - 17, y - 12 - flap], [x - 3, y - 6], [x + 13, y - 15 - flap]], '#536e68', 5);
                circle(x + 10, y - 8, 5, '#536e68'); line([[x + 13, y - 8], [x + 19, y - 7]], '#c88c51', 3);
            } else if (box.id === 'files') {
                for (let i = 0; i < 5; i++) {
                    rect(x - 29 + i % 2 * 3, y - 12 - i * 13, 55 - i % 2 * 4, 12, ['#c0a77f', '#8ca59b', '#e4d5b7'][i % 3], 2);
                    rect(x - 22, y - 8 - i * 13, 14, 3, '#f5eddb', 1);
                }
            } else if (box.id === 'umbrella') {
                line([[x, y], [x, y + 80]], '#6b7776', 3);
                ctx.fillStyle = '#6e99aa'; ctx.beginPath(); ctx.moveTo(x - 59, y);
                ctx.quadraticCurveTo(x, y - 36, x + 59, y); ctx.closePath(); ctx.fill();
                line([[x - 59, y], [x + 59, y]], '#527c90', 2);
            } else if (box.id === 'planks') {
                for (let i = 0; i < 3; i++) rect(x - 47 + i * 3, y - 8 - i * 8, 91, 7, i % 2 ? '#c49b6c' : '#d7b180', 2);
            } else if (box.id === 'cart' || box.id === 'wheelbarrow') {
                rect(x - 24, y - 45, 48, 31, '#879f94', 5); line([[x - 24, y - 41], [x - 33, y - 60]], '#657e75', 3);
                circle(x - 14, y - 7, 7, '#5e766d'); circle(x + 14, y - 7, 7, '#5e766d');
            } else person(box, time, false, false);
            ctx.restore();
        }
        function binRim(bin, front) {
            const y = W.floor - (bin.y || 0) - bin.height;
            const color = bin.style === 'park' ? '#72917a' : bin.metal ? '#829b96' : bin.id === 'large' ? '#5ea994' : '#d69974';
            // The rear half sits behind trash; only the near lip belongs in front.
            ctx.strokeStyle = color; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(bin.x, y, bin.width / 2, 5, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); ctx.stroke();
        }
        function binCount(bin, contents) {
            if (!contents || !contents.count) return;
            const x = bin.x, y = W.floor - (bin.y || 0) + 20;
            ctx.save(); ctx.globalAlpha = .65;
            line([[x - 10, y - 8], [x - 5, y - 9], [x - 3, y - 4], [x - 6, y], [x - 11, y - 2], [x - 10, y - 8]], '#547367', 1.2);
            line([[x - 9, y - 6], [x - 6, y - 4], [x - 5, y - 7]], '#547367', 1);
            text(String(contents.count), x + 4, y, 11, '#547367'); ctx.restore();
        }
        function parkBin(bin, front) {
            const x = bin.x, base = W.floor - (bin.y || 0), y = base - bin.height, width = bin.width;
            const left = x - width / 2, frame = '#3e6557';
            if (!front) {
                ctx.fillStyle = '#314d3d24'; ctx.beginPath(); ctx.ellipse(x + 4, base + 7, width * .57, 9, 0, 0, Math.PI * 2); ctx.fill();
                ctx.save(); ctx.globalAlpha = .14;
                rect(left + 3, y + 2, width - 6, bin.height - 8, frame, [6, 6, 10, 10]); ctx.restore();
                ctx.fillStyle = '#29483c55'; ctx.beginPath(); ctx.ellipse(x, y, width / 2 - 6, 4, 0, 0, Math.PI * 2); ctx.fill();
                binRim(bin, false);
            } else {
                // Spaced wooden slats leave stored trash visible behind the front face.
                const step = (width - 12) / 8;
                ctx.save(); ctx.globalAlpha = .4;
                for (let i = 0; i < 8; i++) {
                    const sx = left + 6 + i * step;
                    rect(sx, y + 7, step - 3, bin.height - 17, i % 2 ? '#b4986b' : '#a38860', 2);
                    line([[sx + 2, y + 13], [sx + 2, base - 16]], '#ddc59a', 1);
                }
                ctx.restore();
                line([[left + 3, y + 4], [left + 3, base - 7], [x + width / 2 - 3, base - 7], [x + width / 2 - 3, y + 4]], frame, 4);
                for (const row of [.24, .85]) {
                    const bandY = y + bin.height * row;
                    rect(left + 2, bandY, width - 4, 5, frame, 2);
                    for (const side of [-1, 1]) circle(x + side * (width / 2 - 8), bandY + 2.5, 1.2, '#b9c8ac');
                }
                binRim(bin, true);
                const badgeY = y + bin.height * .56;
                rect(x - 13, badgeY - 14, 26, 28, '#ede6ce', 4);
                circle(x - 5, badgeY - 8, 2.2, frame);
                line([[x - 5, badgeY - 3], [x - 5, badgeY + 2], [x - 9, badgeY + 9]], frame, 2);
                line([[x - 5, badgeY + 2], [x - 1, badgeY + 9]], frame, 2);
                line([[x - 5, badgeY - 3], [x + 1, badgeY]], frame, 2);
                rect(x + 3, badgeY + 2, 6, 8, frame, 1); circle(x + 5, badgeY - 2, 1.3, frame);
                text(String(bin.points), x, y - 12, 22, frame, 'center');
            }
        }
        function bin(bin, front) {
            if (bin.style === 'park') { parkBin(bin, front); return; }
            const x = bin.x, base = W.floor - (bin.y || 0), y = base - bin.height, width = bin.width;
            const color = bin.metal ? bin.id === 'large' ? '#718d8e' : '#9c8464' : bin.id === 'large' ? '#3c8f7d' : '#bf7955';
            if (!front) {
                if (bin.y) {
                    rect(x - width / 2 - 8, base, width + 16, 8, '#6a7d78', 2);
                    line([[x - width / 2, base + 8], [x - width / 2 + 22, base + 34], [x - width / 2 + 22, base + 8]], '#7d8c83', 3);
                }
                ctx.fillStyle = '#314d3d24'; ctx.beginPath(); ctx.ellipse(x + 4, W.floor + 7, width * .57, 9, 0, 0, Math.PI * 2); ctx.fill();
                ctx.save(); ctx.globalAlpha = .12;
                rect(x - width / 2, y, width, bin.height, color, [5, 5, 12, 12]);
                rect(x - width / 2 + 6, y + 3, width - 12, 9, '#294a40', 4); ctx.restore();
                binRim(bin, false);
            } else {
                ctx.save(); ctx.globalAlpha = .16;
                rect(x - width / 2 + 6, y + 6, width - 12, bin.height - 6, color, [0, 0, 8, 8]); ctx.restore();
                line([[x - width / 2 + 3, y + 3], [x - width / 2 + 3, base - 6], [x + width / 2 - 3, base - 6], [x + width / 2 - 3, y + 3]], color + 'b0', 3);
                for (let i = 1; i < 4; i++) line([[x + width / 2 - 10, y + bin.height * i / 4], [x + width / 2 - 4, y + bin.height * i / 4]], color + '90', 1.5);
                if (bin.metal) for (const row of [.3, .7]) rect(x - width / 2 + 3, y + bin.height * row, width - 6, 4, color + 'b0', 2);
                binRim(bin, true);
                text(String(bin.points), x, bin.labelInside ? y + 27 : y - 12, 22, color, 'center');
            }
        }
        function drawBin(b, front, contents) {
            if (!visible(b.x, b.width / 2 + 40)) return;
            if (!root.document) bin(b, front);
            else {
                let layers = binLayers.get(b);
                if (!layers) { layers = {}; binLayers.set(b, layers); }
                const key = front ? 'front' : 'back';
                if (!layers[key]) layers[key] = layer(b.x - b.width / 2 - (front ? 8 : 24), W.floor - (b.y || 0) - b.height - 42,
                    b.width + (front ? 16 : 48), b.height + (front ? 52 : (b.y || 0) + 84), () => bin(b, front));
                blit(layers[key]);
            }
            if (front) binCount(b, contents);
        }
        function trash(item, x, y, rotation) {
            ctx.save(); ctx.translate(x, y); ctx.rotate(rotation || 0);
            if (item === 'paper') {
                ctx.fillStyle = '#faf5e6'; ctx.strokeStyle = '#b2ac97'; ctx.lineWidth = 1.5;
                ctx.beginPath(); [[-7, -6], [1, -9], [8, -4], [7, 5], [0, 8], [-8, 3]].forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.fill(); ctx.stroke();
                line([[-5, -4], [0, 0], [5, -4]], '#c7c1ae', 1); line([[0, 0], [-2, 6]], '#c7c1ae', 1);
            } else if (item === 'can') {
                rect(-7, -10, 14, 20, '#d09461', 3); rect(-7, -2, 14, 7, '#f1d5ab'); rect(-6, -10, 12, 3, '#d9ded4', 2);
            } else if (item === 'bottle') {
                rect(-7, -8, 14, 19, '#8bb5a8', 4); rect(-4, -15, 8, 9, '#9ec4b7', 2); rect(-4, -16, 8, 3, '#658b80', 1); rect(-7, -1, 14, 7, '#dfebd0', 1);
            } else if (item === 'cup') {
                ctx.fillStyle = '#f5e8cd'; ctx.beginPath(); ctx.moveTo(-10, -11); ctx.lineTo(10, -11); ctx.lineTo(6, 11); ctx.lineTo(-6, 11); ctx.closePath(); ctx.fill();
                line([[-10, -11], [10, -11]], '#ba9d7c', 2); rect(-5, -2, 10, 6, '#a1b49a', 1);
            } else if (item === 'carton') {
                rect(-12, -10, 24, 22, '#c9a776', 2); ctx.fillStyle = '#e1c393'; ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(-5, -17); ctx.lineTo(12, -10); ctx.fill(); line([[0, -10], [0, 12]], '#ad875d', 2);
            } else if (item === 'peel') {
                line([[-11, 7], [-3, 1], [0, -9], [4, 1], [13, 7]], '#d0aa46', 6); line([[0, -7], [-3, 6], [3, 10]], '#ecd173', 5);
            } else if (item === 'apple') {
                // custom: symmetric bitten apple core with flat peel caps and visible seeds.
                ctx.fillStyle = '#eee0b5'; ctx.beginPath(); ctx.moveTo(-8, -9);
                ctx.quadraticCurveTo(0, -4, -4, 0); ctx.quadraticCurveTo(0, 4, -8, 9);
                ctx.lineTo(8, 9); ctx.quadraticCurveTo(0, 4, 4, 0); ctx.quadraticCurveTo(0, -4, 8, -9);
                ctx.closePath(); ctx.fill();
                rect(-9, -11, 18, 4, '#b86e55', 2); rect(-9, 7, 18, 4, '#b86e55', 2);
                line([[0, -11], [2, -15]], '#7e7954', 2);
                ctx.fillStyle = '#88634b'; ctx.beginPath(); ctx.ellipse(-1.8, -.5, 1.3, 2.3, -.3, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(1.8, 1, 1.3, 2.3, .3, 0, Math.PI * 2); ctx.fill();
            } else if (item === 'screwdriver') {
                line([[-14, 0], [6, 0]], '#a8b5b1', 4); rect(3, -5, 16, 10, '#bd8055', 3); line([[-17, 0], [-12, 0]], '#6c807b', 3);
            } else if (item === 'screw' || item === 'bolt') {
                line([[-9, 0], [9, 0]], '#8fa19a', item === 'bolt' ? 5 : 3);
                rect(-12, -5, 5, 10, '#9daaa4', 1);
                for (let x = -3; x <= 7; x += 4) line([[x, -3], [x - 2, 3]], '#607c73', 1);
            } else if (item === 'wrench') {
                line([[-9, 7], [10, -8]], '#9aacaa', 7);
                line([[2, -12], [10, -5], [18, -12]], '#849a98', 6); circle(-10, 8, 6, '#8c9f9b'); circle(-10, 8, 2.5, '#dce3d5');
            } else if (item === 'nut' || item === 'washer') {
                if (item === 'washer') circle(0, 0, 9, '#a4b4ab');
                else { ctx.fillStyle = '#9aaa9f'; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; i ? ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10) : ctx.moveTo(10, 0); } ctx.closePath(); ctx.fill(); }
                circle(0, 0, 4, '#e3dfc7');
            } else if (item === 'offcut') {
                rect(-15, -6, 30, 12, '#c49d6e', 1); line([[-10, -3], [10, -2]], '#a78258', 1); line([[-7, 3], [13, 2]], '#a78258', 1);
            } else if (item === 'tape') {
                circle(0, 0, 11, '#b7a77d'); circle(0, 0, 5, '#efe5ce'); rect(6, -7, 11, 5, '#d1c299', 1);
            } else if (item === 'laptop') {
                rect(-17, -12, 34, 23, '#687e82', 3); rect(-14, -9, 28, 16, '#b2c8bd', 1); line([[-8, -4], [6, 4]], '#8ea69d', 1);
                rect(-20, 9, 40, 4, '#8fa2a0', 2); rect(-4, 9, 8, 2, '#c5cabc', 1);
            } else if (item === 'mouse') {
                ctx.fillStyle = '#879b9b'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 13, .2, 0, Math.PI * 2); ctx.fill();
                line([[0, -11], [1, -2]], '#d1d5c8', 1); rect(-1, -8, 3, 5, '#5c7776', 1); line([[0, -13], [-5, -18], [1, -21]], '#687d75', 1);
            } else if (item === 'folder') {
                rect(-14, -10, 28, 23, '#be9b63', 2); rect(-12, -14, 14, 6, '#d5b77d', 2); rect(-10, -8, 22, 17, '#f3e9cf', 1);
                for (let y = -4; y < 7; y += 4) line([[-7, y], [8, y]], '#a1ad9a', 1);
            } else if (item === 'voodoo') {
                circle(0, -8, 8, '#c3a078'); rect(-6, 0, 12, 13, '#c3a078', 4);
                line([[-5, 3], [-12, -1]], '#c3a078', 5); line([[5, 3], [12, 0]], '#c3a078', 5);
                line([[-3, 11], [-6, 18]], '#c3a078', 4); line([[3, 11], [6, 18]], '#c3a078', 4);
                for (const x of [-3, 3]) { line([[x - 2, -11], [x + 2, -7]], '#685e55', 1); line([[x + 2, -11], [x - 2, -7]], '#685e55', 1); }
                line([[3, 5], [13, -6]], '#8e8e7c', 1); circle(13, -6, 2.5, '#bc6f67');
            } else if (item === 'keyboard') {
                rect(-19, -8, 38, 16, '#829395', 3);
                for (let y = -4; y <= 3; y += 6) for (let x = -14; x < 16; x += 7) if (!(x === 0 && y === -4)) rect(x, y, 5, 4, '#d6d8ca', 1);
            } else if (item === 'badge') {
                line([[-4, -8], [0, -18], [5, -8]], '#78968c', 2); rect(-8, -9, 16, 21, '#eee3c6', 2); circle(-2, -2, 3, '#b8b99b');
                line([[-4, 5], [5, 5]], '#94ac9a', 2); rect(-8, -9, 16, 4, '#8ea99a', 1);
            } else if (item === 'stapler') {
                rect(-12, 4, 25, 5, '#6a807b', 2); ctx.save(); ctx.rotate(-.2); rect(-12, -7, 25, 9, '#b37669', 3); ctx.restore(); rect(-10, 0, 4, 6, '#8d9a8a', 1);
            } else if (item === 'overtime') {
                circle(0, 0, 11, '#b98670'); circle(0, 0, 8, '#eee4c8'); line([[0, -5], [0, 0], [5, 3]], '#64796e', 1.5);
                rect(-12, -13, 8, 4, '#a77c64', 2); rect(4, -13, 8, 4, '#a77c64', 2); line([[-6, 9], [-9, 14]], '#98735e', 3); line([[6, 9], [9, 14]], '#98735e', 3);
            } else if (item === 'sock') {
                ctx.fillStyle = '#a794ae'; ctx.beginPath(); [[-7, -14], [4, -14], [4, 3], [13, 6], [13, 13], [-1, 13], [-7, 8]].forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.fill();
                line([[-6, -10], [3, -10]], '#d9c6d3', 3); line([[6, 10], [12, 10]], '#d9c6d3', 2);
            } else if (item === 'remote') {
                rect(-7, -16, 14, 32, '#667d7d', 4); circle(0, -10, 2, '#c58572'); circle(0, -1, 4, '#b2c0ad');
                for (const x of [-3, 3]) for (const y of [7, 12]) circle(x, y, 1.4, '#dedbc1');
            } else if (item === 'block') {
                rect(-10, -6, 20, 16, '#c88772', 2); rect(-7, -10, 5, 5, '#dcaa89', 1); rect(2, -10, 5, 5, '#dcaa89', 1); line([[-8, 1], [8, 1]], '#aa735f', 1);
            } else if (item === 'duck') {
                ctx.fillStyle = '#e4c567'; ctx.beginPath(); ctx.ellipse(-2, 4, 12, 8, 0, 0, Math.PI * 2); ctx.fill(); circle(7, -6, 7, '#edcf70');
                circle(9, -8, 1.5, '#617566'); line([[12, -4], [18, -3]], '#c28f4f', 4); line([[-9, 0], [-15, -4]], '#ddbd61', 4);
            } else if (item === 'pacifier') {
                ctx.fillStyle = '#bda2b5'; ctx.beginPath(); ctx.ellipse(0, 1, 11, 5, 0, 0, Math.PI * 2); ctx.fill(); circle(0, -5, 4, '#d5c6b5');
                ctx.strokeStyle = '#8c98b1'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 6, 5, 0, Math.PI * 2); ctx.stroke();
            } else if (item === 'plush') {
                ctx.fillStyle = '#8ba78a'; ctx.beginPath(); ctx.ellipse(-1, 4, 11, 12, .2, 0, Math.PI * 2); ctx.fill(); circle(6, -9, 8, '#91ad8e'); circle(10, -10, 1.5, '#566f5a');
                line([[-8, 9], [-19, 10]], '#8ba78a', 7); line([[-5, 13], [-8, 19]], '#79997d', 5); line([[5, 13], [8, 19]], '#79997d', 5); line([[-5, 0], [4, 8]], '#c8d3a5', 5);
            } else if (item === 'slipper') {
                ctx.fillStyle = '#8aafae'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 17, -.25, 0, Math.PI * 2); ctx.fill(); rect(-7, -7, 14, 9, '#b6cbba', 4); line([[-4, 9], [4, 11]], '#6a9596', 2);
            } else if (item === 'robot') {
                rect(-9, -7, 18, 21, '#90a7a5', 3); rect(-9, -18, 18, 12, '#b1bcb0', 3); circle(-4, -12, 2, '#647d79'); circle(4, -12, 2, '#647d79');
                line([[0, -18], [2, -24]], '#8a9a8e', 2); circle(2, -24, 2, '#c48c74'); line([[-10, 0], [-15, 6]], '#96a8a0', 4); line([[10, 0], [15, 6]], '#96a8a0', 4); circle(0, 3, 4, '#cabd8a');
            } else if (item === 'leaf') {
                ctx.fillStyle = '#a9b779'; ctx.beginPath(); ctx.moveTo(-13, 9); ctx.quadraticCurveTo(-16, -12, 14, -13); ctx.quadraticCurveTo(15, 10, -13, 9); ctx.fill(); line([[-15, 13], [10, -9]], '#7e9a64', 2);
            } else if (item === 'frisbee') {
                ctx.fillStyle = '#ce956a'; ctx.beginPath(); ctx.ellipse(0, 1, 16, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#e9c495'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -1, 11, 4, 0, 0, Math.PI * 2); ctx.stroke();
            } else if (item === 'shuttlecock') {
                ctx.fillStyle = '#e9e5cd'; ctx.beginPath(); ctx.moveTo(-5, 7); ctx.lineTo(-13, -13); ctx.lineTo(13, -13); ctx.lineTo(5, 7); ctx.closePath(); ctx.fill();
                for (const x of [-9, -3, 3, 9]) line([[x, -12], [x / 3, 5]], '#b5c0aa', 1); circle(0, 9, 5, '#b59b78');
            } else if (item === 'dogbag') {
                ctx.fillStyle = '#7e9c7c'; ctx.beginPath(); ctx.moveTo(-5, -8); ctx.quadraticCurveTo(-17, 12, 0, 14); ctx.quadraticCurveTo(16, 11, 5, -8); ctx.closePath(); ctx.fill(); line([[-5, -13], [4, -7], [7, -14]], '#6d8b6c', 4);
            } else if (item === 'seedbag') {
                rect(-11, -14, 22, 28, '#c8ae7b', 3); rect(-11, -14, 22, 4, '#a79067', 1); circle(1, -2, 5, '#8a9f83'); circle(6, -6, 3, '#8a9f83');
                for (const x of [-6, 0, 6]) circle(x, 8, 1.5, '#8f7853');
            } else if (item === 'gnome') {
                rect(-9, 0, 18, 15, '#7b9ba0', 4); circle(0, -4, 7, '#d5af8b');
                ctx.fillStyle = '#be7f71'; ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(0, -23); ctx.lineTo(9, -6); ctx.fill();
                ctx.fillStyle = '#e7dfc5'; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(0, 10); ctx.lineTo(6, 0); ctx.fill(); circle(0, -2, 3, '#d8aa86');
            } else if (item === 'helmet') {
                ctx.fillStyle = '#ddbd62'; ctx.beginPath(); ctx.arc(0, 3, 14, Math.PI, Math.PI * 2); ctx.fill(); rect(-18, 2, 36, 5, '#ceb066', 3); line([[-2, -10], [2, -5], [-2, -1]], '#9b865b', 1.5);
            } else if (item === 'brick') {
                rect(-17, -10, 34, 20, '#b47e64', 2); rect(-14, -8, 28, 5, '#cf9b7a', 1); for (const x of [-9, 0, 9]) rect(x - 2, -6, 4, 3, '#926c58', 1);
            } else if (item === 'receipt') {
                rect(-7, -13, 14, 26, '#eee6ce', 1); for (let y = -8; y < 11; y += 5) line([[-4, y], [4, y]], '#9d9e8a', 1);
            } else if (item === 'spraycap') {
                rect(-8, -9, 16, 19, '#a783a0', 3); rect(-5, -11, 10, 4, '#c8aac0', 2); line([[-5, 8], [5, 8]], '#786b83', 2);
            } else if (item === 'cassette') {
                rect(-14, -9, 28, 18, '#677a7e', 3); rect(-11, -6, 22, 9, '#c9c3a3', 1); circle(-6, -1, 3, '#64736e'); circle(6, -1, 3, '#64736e'); line([[-6, 12], [-13, 18], [5, 18], [8, 11]], '#75675b', 1);
            } else if (item === 'bottlecap') {
                circle(0, 0, 7, '#c99276'); circle(0, 0, 4, '#e5bf94'); for (let a = 0; a < 6.2; a += .8) line([[Math.cos(a) * 6, Math.sin(a) * 6], [Math.cos(a) * 8, Math.sin(a) * 8]], '#a87565', 2);
            } else if (item === 'wristband') {
                ctx.strokeStyle = '#b78aa4'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(0, 0, 10, 7, .3, 0, Math.PI * 2); ctx.stroke(); rect(-4, -8, 10, 7, '#dcc291', 2);
            } else if (item === 'padlock') {
                ctx.strokeStyle = '#94a6a1'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -6, 7, Math.PI, Math.PI * 2); ctx.stroke(); rect(-10, -5, 20, 18, '#baa46e', 3); circle(0, 2, 2, '#727b6d'); line([[0, 3], [0, 7]], '#727b6d', 2);
            } else if (item === 'skatewheel') {
                circle(0, 0, 12, '#d4ba83'); circle(0, 0, 7, '#8c9f97'); circle(0, 0, 3, '#d7dfcc');
            } else if (item === 'noodlebox') {
                rect(-11, -9, 22, 21, '#d7c7a3', 2); line([[-11, -9], [-15, -16], [0, -12], [14, -16], [11, -9]], '#b7a888', 2); line([[-4, -4], [5, 6], [-4, 6], [5, -4]], '#ba8271', 2);
            } else if (item === 'vinyl') {
                circle(0, 0, 15, '#526467'); ctx.strokeStyle = '#81908a'; ctx.lineWidth = 1; for (const r of [9, 12]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); } circle(0, 0, 5, '#ba8d9b'); circle(0, 0, 1.5, '#dfddc4');
            } else if (item === 'sneaker') {
                rect(-15, -5, 29, 15, '#98a5b4', 5); rect(-16, 7, 33, 5, '#ddd7bd', 3); rect(-13, -10, 11, 12, '#8c8ca4', 2); for (let x = -3; x < 9; x += 4) line([[x, -4], [x + 2, 1]], '#efdfba', 2);
            } else { rect(-11, -8, 22, 16, '#9a6e61', 2); rect(-7, -6, 18, 12, '#eee4c9', 1); rect(-11, -8, 4, 16, '#7f594e', 1); }
            ctx.restore();
        }
        function body(scene, item) {
            if (!visible(item.x, 48)) return;
            const inside = !scene.freeFlight && scene.bins.find(bin => Math.abs(item.x - bin.x) <= bin.width / 2 - 6 && item.y >= (bin.y || 0) && item.y <= (bin.y || 0) + bin.height);
            ctx.save();
            if (inside) {
                ctx.beginPath(); ctx.rect(inside.x - inside.width / 2 + 6, 0, inside.width - 12, W.floor - (inside.y || 0) - W.binFloor); ctx.clip();
            }
            if (item.resting && root.document) {
                let cached = restingLayers.get(item);
                if (!cached || cached.item !== item.item || cached.rotation !== item.rotation) {
                    cached = { item: item.item, rotation: item.rotation, sprite: layer(-32, -32, 64, 64, () => trash(item.item, 0, 0, item.rotation)) };
                    restingLayers.set(item, cached);
                }
                blit(cached.sprite, item.x - 32, W.floor - item.y - 32);
            } else trash(item.item, item.x, W.floor - item.y, item.rotation);
            ctx.restore();
        }
        function overview(model, boxes) {
            const y = W.height, width = frameWidth(), scale = width / Math.max(worldWidth, width);
            rect(0, y, width, overviewHeight, '#e7e9da');
            const x = cameraX * scale;
            rect(x + 1, y + 5, width * scale - 2, 40, '#9fbdae35', 5);
            ctx.strokeStyle = '#688f7f88'; ctx.lineWidth = 1;
            ctx.strokeRect(x + 1, y + 5, width * scale - 2, 40);
            const drawRuler = () => {
                line([[12, y + 38], [width - 12, y + 38]], '#93a697', 2);
                for (let distance = 0; distance <= worldWidth - 96; distance += worldWidth > W.width ? 400 : 200) {
                    const tick = (96 + distance) * scale;
                    line([[tick, y + 44], [tick, y + 49]], '#95a899', 1);
                    text(String(distance), tick, y + 63, 14, '#71877a', 'center');
                }
            };
            if (root.document) {
                if (!ruler) ruler = layer(0, y + 36, width, overviewHeight - 36, drawRuler);
                blit(ruler);
            } else drawRuler();
            for (const p of model.debris) circle(p.x * scale, y + 37 - Math.min(24, p.y * .05), 2.5, '#8a9280');
            if (model.trail && model.trail.length) line(model.trail.map(p => [p.x * scale, y + 37 - R.clamp(p.y * .05, 0, 24)]), '#4b8b7790', 2);
            circle(96 * scale, y + 37, 5, '#3e8c7b');
            for (const box of boxes) {
                if (['boss', 'walker', 'worker', 'worker-far', 'cleaner', 'bird'].includes(box.id)) circle(box.x * scale, y + (box.id === 'bird' ? 12 : 33), box.id === 'cleaner' ? 5 : 4, box.id === 'cleaner' ? '#478aa0' : '#8e9b9b');
            }
            for (const b of model.scene.bins) {
                const bx = b.x * scale, color = b.id === 'large' ? '#3c8f7d' : '#bf7955';
                const arena = model.scene.scene === 'arena';
                // Separate the dense arena targets into three rows, including stacked bins at the same x.
                const by = arena ? y + ((b.y || 0) >= 220 ? 3 : b.y ? 16 : 29) : y + 23 - (b.y || 0) * .06;
                rect(bx - b.width * scale / 2, by, b.width * scale, arena ? 10 : 15, color + '55', 3);
                text(String(b.points), bx, arena ? by + 9 : by - 4, arena ? 14 : 19, color, 'center');
            }
            if (model.ball) circle(R.clamp(model.ball.x * scale, 5, width - 5), y + 37 - R.clamp(model.ball.y * .05, 0, 24), 5, '#f4b24a');
        }
        function render(model) {
            model = interpolate(model);
            const scene = model.scene;
            if (!scene) return;
            if (qa !== !!model.qa || worldWidth !== R.fieldWidth(scene) || layout !== R.SCENES[scene.scene]) { qa = !!model.qa; worldWidth = R.fieldWidth(scene); layout = R.SCENES[scene.scene]; fit(); }
            const width = track(model);
            const height = frameHeight();
            const boxes = R.obstacles(scene, model.time);
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip(); ctx.translate(-cameraX, -cameraY);
            rect(cameraX, cameraY, width, height, !layout.outdoor ? '#efe6d9' : '#d7e9e5');
            drawBackground(scene);
            const rain = model.visualRain == null ? scene.rain : model.visualRain;
            if (rain) { ctx.fillStyle = '#6c8d9e22'; ctx.globalAlpha = rain / 1.6; ctx.fillRect(cameraX, cameraY, width, height); ctx.globalAlpha = 1; }
            if (Math.abs(scene.wind) > 1) {
                const magnitude = Math.abs(scene.wind), direction = Math.sign(scene.wind);
                ctx.save(); ctx.globalAlpha = .10 + Math.min(magnitude, 100) / 700;
                for (let i = 0; i < Math.min(15, Math.ceil(magnitude / 15) * worldWidth / W.width); i++) {
                    const wrap = worldWidth + 140;
                    const x = ((model.time * (35 + magnitude * 1.5) * direction + i * 227) % wrap + wrap) % wrap - 70;
                    const y = 94 + i * 47, end = x + direction * (18 + magnitude * .6);
                    ctx.save(); ctx.translate(end, y); ctx.scale(direction, 1);
                    ctx.beginPath(); ctx.moveTo(-Math.abs(end - x), 0); ctx.lineTo(0, 0);
                    ctx.bezierCurveTo(13, 0, 13, -12, 5, -12); ctx.bezierCurveTo(0, -12, -1, -8, 2, -7);
                    ctx.strokeStyle = '#386b62'; ctx.lineWidth = 1.8; ctx.stroke(); ctx.restore();
                }
                ctx.restore();
            }
            if (model.ghost && model.practice) {
                ctx.setLineDash([7, 5]); line(model.ghost.map(p => [p.x, W.floor - p.y]), model.qa ? '#c9853ed0' : '#527c7370', 2); ctx.setLineDash([]);
            }
            if (model.reference) {
                ctx.setLineDash([2, 7]); line(model.reference.map(p => [p.x, W.floor - p.y]), '#467eafb0', 2); ctx.setLineDash([]);
            }
            scene.bins.forEach(b => drawBin(b, false));
            if (model.players === 2 && visible(22, 80)) {
                ctx.save(); ctx.translate(22, W.floor); ctx.scale(.78, .78); ctx.translate(-22, -W.floor);
                drawPlayer({ x: 22, player: 1 - model.active, waiting: true, role: scene.thrower }, model.time, false, false); ctx.restore();
                text(model.playerLabels[1 - model.active], 23, W.floor + 27, 14, '#38564d', 'center');
            }
            if (visible(73, 100)) {
                drawPlayer({ x: scene.thrower === 'child' ? 69 : 59, player: model.active, role: scene.thrower }, model.time, true, model.charging);
                text(model.playerLabels[model.active], 73, W.floor + 27, 15, model.active ? '#47638b' : '#2e6657', 'center');
            }
            if (model.aiming && visible(96, 80)) {
                const angle = model.angle * Math.PI / 180;
                const launchY = scene.launchY || layout.launchY;
                ctx.setLineDash([5, 7]); line([[96, W.floor - launchY], [96 + Math.cos(angle) * 72, W.floor - launchY - Math.sin(angle) * 72]], '#315d51', 2); ctx.setLineDash([]);
                trash(scene.item, 96, W.floor - launchY, -.3);
            }
            if (model.trail) line(model.trail.map(p => [p.x, W.floor - p.y]), model.qa ? '#2f8570d9' : '#ffffff99', 2);
            for (const scrap of model.debris) body(scene, scrap);
            if (model.ball) {
                const b = model.ball;
                ctx.fillStyle = '#34544822'; ctx.beginPath(); ctx.ellipse(b.x, W.floor + 3, Math.max(3, 11 - b.y / 80), 3, 0, 0, Math.PI * 2); ctx.fill();
                circle(b.x, W.floor - b.y, b.radius + 5, '#fff7db88');
                body(scene, b);
                if (b.y > W.floor - cameraY - 18) {
                    const x = R.clamp(b.x, cameraX + 18, cameraX + width - 18);
                    line([[x - 5, cameraY + 25], [x, cameraY + 18], [x + 5, cameraY + 25]], '#31594c', 3);
                    trash(b.item, x, cameraY + 40, b.rotation);
                }
            }
            scene.bins.forEach(b => drawBin(b, true, model.binContents[b.id]));
            // Actors occupy one foreground layer, never between the bin's back and front.
            boxes.forEach(box => {
                if (!visible(box.x, box.width / 2 + 80)) return;
                ctx.save(); if (box.id === 'umbrella') ctx.globalAlpha = Math.min(1, rain / .22);
                obstacle(box, model.time); ctx.restore();
            });
            if (model.result && model.result.kind === 'basket' && model.resultPosition) {
                const b = model.resultPosition;
                text('+' + (model.result.basketPoints || model.result.points), R.clamp(b.x, cameraX + 35, cameraX + width - 35), W.floor - b.y - 35, 36, '#2b6958', 'center');
            }
            for (const event of model.feedback || []) {
                const age = model.time - event.time;
                ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age / 1.5);
                text('−5', event.x, W.floor - event.y - 35 - age * 28, 32, '#a05043', 'center'); ctx.restore();
            }
            if (rain) {
                const count = Math.round(35 * rain);
                for (let i = 0; i < count; i++) {
                    const x = cameraX + ((i * 103 + model.time * (40 + scene.wind * 2)) % width + width) % width;
                    const y = cameraY + (i * 79 + model.time * 480) % height;
                    line([[x, y], [x + scene.wind * .15 + 3, y + 14]], '#6e95a75c', 1.5);
                }
            }
            ctx.restore();
            if (!qa) overview(model, boxes);
        }
        fit(); return { fit, render, follow, beginPan, panBy, canPan: cameraEnabled, isPortrait: () => portrait };
    }
    root.TrashTossView = { create };
})(window);
