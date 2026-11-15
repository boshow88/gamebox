/* Canvas artwork uses the same world coordinates and obstacle geometry as the rules. */
(function (root) {
    'use strict';
    const R = root.TrashTossRules, W = R.WORLD;
    function create(canvas) {
        const ctx = canvas.getContext('2d');
        function fit() {
            const dpr = Math.min(root.devicePixelRatio || 1, 2);
            canvas.width = W.width * dpr; canvas.height = W.height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
        function plant(x, y) {
            line([[x, y], [x - 4, y - 64]], '#63816c', 5);
            for (let i = 0; i < 4; i++) {
                ctx.fillStyle = i % 2 ? '#6c947b' : '#87a88a'; ctx.beginPath();
                ctx.ellipse(x + (i % 2 ? -11 : 9), y - 18 - i * 12, 9, 18, i % 2 ? -.7 : .7, 0, Math.PI * 2); ctx.fill();
            }
            rect(x - 18, y - 2, 36, 34, '#c7896f', 4);
        }
        function background(scene) {
            const park = scene.scene === 'park';
            const sky = ctx.createLinearGradient(0, 0, 0, W.floor);
            sky.addColorStop(0, park ? '#d7e9e5' : '#efe6d9'); sky.addColorStop(1, park ? '#f3eedb' : '#e8dcca');
            ctx.fillStyle = sky; ctx.fillRect(0, 0, W.width, W.height);
            if (park) {
                circle(775, 87, 39, '#f7dd9d');
                for (const [x, y] of [[130, 100], [450, 61], [660, 130]]) {
                    rect(x, y, 118, 18, '#ffffff80', 20); circle(x + 37, y, 24, '#ffffff80'); circle(x + 75, y + 2, 19, '#ffffff80');
                }
                ctx.fillStyle = '#b6ccad'; ctx.beginPath(); ctx.moveTo(0, 320);
                ctx.bezierCurveTo(260, 180, 390, 360, 580, 275); ctx.bezierCurveTo(760, 190, 870, 250, 960, 230); ctx.lineTo(960, 466); ctx.lineTo(0, 466); ctx.fill();
                for (const x of [170, 525, 915]) {
                    rect(x - 7, 250, 14, 151, '#9b9e79', 4);
                    circle(x, 241, 58, '#9ab89a'); circle(x - 31, 267, 34, '#a5c2a1'); circle(x + 35, 267, 35, '#a5c2a1');
                }
                rect(0, 403, 960, 63, '#d5dbb9');
                for (let x = 0; x < 960; x += 48) { rect(x, 376, 5, 69, '#b1b99a'); rect(x, 389, 48, 4, '#b1b99a'); }
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
                rect(0, 353, 960, 113, '#e0d1bc'); rect(0, 350, 960, 4, '#cbb99f');
                plant(890, 397); rect(170, 384, 140, 10, '#b39b7e', 3);
                rect(181, 394, 7, 72, '#a38f77'); rect(292, 394, 7, 72, '#a38f77');
                rect(212, 340, 56, 40, '#6d8580', 4); rect(216, 344, 48, 31, '#bad0c5', 2); rect(236, 380, 8, 5, '#6d8580');
            }
            rect(0, W.floor, 960, 74, park ? '#c8baa0' : '#c8ad8d');
            line([[0, W.floor], [960, W.floor]], park ? '#a5ac87' : '#b89c7b', 3);
            for (let x = -100; x < 1100; x += 120) line([[x, 466], [x + 55, 540]], '#ffffff1e', 2);
            line([[0, 508], [960, 508]], '#ffffff20', 2);
        }
        function person(box, time, thrower, charging) {
            const x = box.x, y = W.floor, boss = box.id === 'boss';
            ctx.fillStyle = '#263e3420'; ctx.beginPath(); ctx.ellipse(x, y + 4, 27, 6, 0, 0, Math.PI * 2); ctx.fill();
            const stride = thrower || box.waiting ? 0 : Math.sin(time * 5) * 9;
            line([[x - 8, y - 42], [x - 10 - stride, y - 5]], '#465d61', 10);
            line([[x + 8, y - 42], [x + 11 + stride, y - 5]], '#465d61', 10);
            rect(x - 18 - stride, y - 7, 17, 7, '#354f51', 3); rect(x + 5 + stride, y - 7, 18, 7, '#354f51', 3);
            const shirt = box.player != null ? box.player === 0 ? '#3e8c7b' : '#6688b0' : boss ? '#647785' : '#c49567';
            rect(x - 17, y - 85, 34, 48, shirt, 8);
            if (boss) { line([[x, y - 81], [x, y - 58]], '#e4a48b', 6); rect(x + 7, y - 74, 6, 3, '#d8e4de', 1); }
            const armY = thrower ? y - 96 - (charging ? 5 : 0) : y - 55;
            line([[x + 12, y - 78], [x + 26, armY], [x + 37, armY - 6]], '#d6a982', 9);
            line([[x - 13, y - 77], [x - 23, y - 53]], shirt, 9);
            circle(x, y - 101, 16, '#deb38c');
            if (boss || thrower || box.player != null) { ctx.fillStyle = boss ? '#596365' : '#4c655a'; ctx.beginPath(); ctx.arc(x, y - 105, 16, Math.PI, Math.PI * 2); ctx.fill(); }
            else { rect(x - 19, y - 116, 39, 5, '#829585', 3); rect(x - 12, y - 128, 25, 14, '#829585', 5); }
            circle(x + 6, y - 102, 1.7, '#3d5853');
        }
        function obstacle(box, time) {
            const x = box.x, y = W.floor - box.y;
            if (box.id === 'bird') {
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
            } else if (box.id === 'cart') {
                rect(x - 24, y - 45, 48, 31, '#879f94', 5); line([[x - 24, y - 41], [x - 33, y - 60]], '#657e75', 3);
                circle(x - 14, y - 7, 7, '#5e766d'); circle(x + 14, y - 7, 7, '#5e766d');
            } else person(box, time, false, false);
        }
        function bin(bin, front, contents, countLabel) {
            const x = bin.x, y = W.floor - bin.height, width = bin.width;
            const color = bin.id === 'large' ? '#3c8f7d' : '#bf7955';
            if (!front) {
                ctx.fillStyle = '#314d3d24'; ctx.beginPath(); ctx.ellipse(x + 4, W.floor + 7, width * .57, 9, 0, 0, Math.PI * 2); ctx.fill();
                ctx.save(); ctx.globalAlpha = .12;
                rect(x - width / 2, y, width, bin.height, color, [5, 5, 12, 12]);
                rect(x - width / 2 + 6, y + 3, width - 12, 9, '#294a40', 4); ctx.restore();
            } else {
                ctx.save(); ctx.globalAlpha = .16;
                rect(x - width / 2 + 6, y + 6, width - 12, bin.height - 6, color, [0, 0, 8, 8]); ctx.restore();
                line([[x - width / 2 + 3, y + 3], [x - width / 2 + 3, W.floor - 6], [x + width / 2 - 3, W.floor - 6], [x + width / 2 - 3, y + 3]], color + 'b0', 3);
                for (let i = 1; i < 4; i++) line([[x + width / 2 - 10, y + bin.height * i / 4], [x + width / 2 - 4, y + bin.height * i / 4]], color + '90', 1.5);
                rect(x - width / 2 - 2, y - 3, width + 4, 6, bin.id === 'large' ? '#5ea994' : '#d69974', 3);
                text(String(bin.points), x, y - 12, 22, color, 'center');
                text(countLabel(contents.count), x, W.floor + 25, 16, '#45685b', 'center');
            }
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
            } else { rect(-11, -8, 22, 16, '#9a6e61', 2); rect(-7, -6, 18, 12, '#eee4c9', 1); rect(-11, -8, 4, 16, '#7f594e', 1); }
            ctx.restore();
        }
        function body(scene, item) {
            const inside = !scene.freeFlight && scene.bins.find(bin => Math.abs(item.x - bin.x) <= bin.width / 2 - 6 && item.y <= bin.height);
            ctx.save();
            if (inside) {
                ctx.beginPath(); ctx.rect(inside.x - inside.width / 2 + 6, 0, inside.width - 12, W.floor - W.binFloor); ctx.clip();
            }
            trash(item.item, item.x, W.floor - item.y, item.rotation); ctx.restore();
        }
        function render(model) {
            const scene = model.scene;
            if (!scene) return;
            background(scene);
            const rain = model.visualRain == null ? scene.rain : model.visualRain;
            if (rain) { ctx.fillStyle = '#6c8d9e22'; ctx.globalAlpha = rain / 1.6; ctx.fillRect(0, 0, W.width, W.height); ctx.globalAlpha = 1; }
            if (Math.abs(scene.wind) > 1) {
                const magnitude = Math.abs(scene.wind), direction = Math.sign(scene.wind);
                ctx.save(); ctx.globalAlpha = .10 + Math.min(magnitude, 100) / 700;
                for (let i = 0; i < Math.min(6, Math.ceil(magnitude / 15)); i++) {
                    const x = ((model.time * (35 + magnitude * 1.5) * direction + i * 227) % 1100 + 1100) % 1100 - 70;
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
            scene.bins.forEach(b => bin(b, false));
            if (model.players === 2) {
                ctx.save(); ctx.translate(22, W.floor); ctx.scale(.78, .78); ctx.translate(-22, -W.floor);
                person({ x: 22, player: 1 - model.active, waiting: true }, model.time, false, false); ctx.restore();
                text(model.playerLabels[1 - model.active], 23, W.floor + 27, 14, '#38564d', 'center');
            }
            person({ x: 59, player: model.active }, model.time, true, model.charging);
            text(model.playerLabels[model.active], 73, W.floor + 27, 15, model.active ? '#47638b' : '#2e6657', 'center');
            if (model.aiming) {
                const angle = model.angle * Math.PI / 180;
                ctx.setLineDash([5, 7]); line([[96, W.floor - 102], [96 + Math.cos(angle) * 72, W.floor - 102 - Math.sin(angle) * 72]], '#315d51', 2); ctx.setLineDash([]);
                trash(scene.item, 96, W.floor - 102, -.3);
            }
            if (model.trail) line(model.trail.map(p => [p.x, W.floor - p.y]), model.qa ? '#2f8570d9' : '#ffffff99', 2);
            for (const scrap of model.debris) body(scene, scrap);
            if (model.ball) {
                const b = model.ball;
                ctx.fillStyle = '#34544822'; ctx.beginPath(); ctx.ellipse(b.x, W.floor + 3, Math.max(3, 11 - b.y / 80), 3, 0, 0, Math.PI * 2); ctx.fill();
                circle(b.x, W.floor - b.y, b.radius + 5, '#fff7db88');
                body(scene, b);
                if (b.y > W.floor - 18) {
                    const x = R.clamp(b.x, 18, W.width - 18);
                    line([[x - 5, 25], [x, 18], [x + 5, 25]], '#31594c', 3);
                    trash(b.item, x, 40, b.rotation);
                }
            }
            scene.bins.forEach(b => bin(b, true, model.binContents[b.id], model.countLabel));
            // Actors occupy one foreground layer, never between the bin's back and front.
            R.obstacles(scene, model.time).forEach(box => {
                ctx.save(); if (box.id === 'umbrella') ctx.globalAlpha = Math.min(1, rain / .22);
                obstacle(box, model.time); ctx.restore();
            });
            if (model.result && model.resultPosition) {
                const b = model.resultPosition;
                text(model.result.points > 0 ? '+' + model.result.points : model.result.points < 0 ? '−5' : '·', R.clamp(b.x, 35, 925), W.floor - R.clamp(b.y + 45, 70, 410), 36, model.result.points < 0 ? '#9a4e3e' : '#2b6958', 'center');
            }
            if (rain) {
                const count = Math.round(35 * rain);
                for (let i = 0; i < count; i++) {
                    const x = ((i * 103 + model.time * (40 + scene.wind * 2)) % 1020 + 1020) % 1020;
                    const y = (i * 79 + model.time * 480) % 550;
                    line([[x, y], [x + scene.wind * .15 + 3, y + 14]], '#6e95a75c', 1.5);
                }
            }
        }
        fit(); return { fit, render };
    }
    root.TrashTossView = { create };
})(window);
