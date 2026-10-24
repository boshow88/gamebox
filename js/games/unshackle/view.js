/** Small, local WebGL renderer. Shared geometry drives drawing and picking. */
(function () {
    'use strict';
    const M = window.UnshackleEngine.math;

    function create(canvas) {
        const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
        if (!gl) return null;
        const vertex = `
            attribute vec3 aPosition, aNormal;
            uniform mat3 uRotation;
            uniform vec3 uOffset;
            uniform vec2 uScale;
            uniform vec2 uShift;
            varying vec3 vNormal;
            void main() {
                vec3 p = uRotation * (aPosition + uOffset);
                vNormal = uRotation * aNormal;
                gl_Position = vec4(p.xy * uScale + uShift, -p.z / 24.0, 1.0);
            }`;
        const fragment = `
            precision mediump float;
            uniform vec3 uColor;
            uniform bool uPicking;
            varying vec3 vNormal;
            void main() {
                if (uPicking) { gl_FragColor = vec4(uColor, 1.0); return; }
                vec3 n = normalize(vNormal);
                vec3 light = normalize(vec3(-0.5, 0.8, 1.2));
                float diffuse = max(dot(n, light), 0.0);
                float specular = pow(max(dot(n, normalize(light + vec3(0.,0.,1.))), 0.0), 44.0);
                float rim = pow(1.0 - max(n.z, 0.0), 3.0);
                vec3 color = uColor * (0.58 + 0.42 * diffuse) + 0.32 * specular;
                color += 0.045 * rim;
                gl_FragColor = vec4(color, 1.0);
            }`;
        function compile(type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source); gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
            return shader;
        }
        const program = gl.createProgram();
        const shaders = [compile(gl.VERTEX_SHADER, vertex), compile(gl.FRAGMENT_SHADER, fragment)];
        shaders.forEach(s => gl.attachShader(program, s));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        shaders.forEach(s => gl.deleteShader(s));
        const loc = {};
        ['uRotation', 'uOffset', 'uScale', 'uShift', 'uColor', 'uPicking'].forEach(n => { loc[n] = gl.getUniformLocation(program, n); });
        const position = gl.getAttribLocation(program, 'aPosition'), normal = gl.getAttribLocation(program, 'aNormal');
        // Accumulate rotations in screen space. Left-multiplying a unit
        // quaternion keeps horizontal drags on the current screen-up axis,
        // including after a vertical turn or an upside-down view.
        const initialOrientation = () => {
            const sx = Math.sin(0.28 / 2), cx = Math.cos(0.28 / 2);
            const sy = Math.sin(-0.35 / 2), cy = Math.cos(-0.35 / 2);
            return [sx * cy, cx * sy, sx * sy, cx * cy];
        };
        let meshes = [], pieces = [], orientation = initialOrientation(), zoom = 1;
        let center = [0, 0, 0], sceneRadius = 3.5;
        let rotation, scale, shift = [0, 0], frame, depth, texture, frameWidth = 0, frameHeight = 0;

        function upload(vertices) {
            const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
            return { buffer, count: vertices.length / 6 };
        }
        function tube(path, radius, planeNormal, closed) {
            const vertices = [], rings = [], sides = 14;
            for (let i = 0; i < path.length; i++) {
                const prev = path[closed ? (i - 1 + path.length) % path.length : Math.max(0, i - 1)];
                const next = path[closed ? (i + 1) % path.length : Math.min(path.length - 1, i + 1)];
                const tangent = M.unit(M.sub(next, prev));
                const side = M.unit(M.cross(planeNormal, tangent));
                rings.push(Array.from({ length: sides }, (_, j) => {
                    const a = j * Math.PI * 2 / sides;
                    const n = M.add(M.mul(side, Math.cos(a)), M.mul(planeNormal, Math.sin(a)));
                    return [...M.add(path[i], M.mul(n, radius)), ...n];
                }));
            }
            for (let i = 0; i < path.length - (closed ? 0 : 1); i++) {
                const next = (i + 1) % path.length;
                for (let j = 0; j < sides; j++) {
                    const k = (j + 1) % sides;
                    vertices.push(...rings[i][j], ...rings[next][j], ...rings[next][k],
                        ...rings[i][j], ...rings[next][k], ...rings[i][k]);
                }
            }
            return vertices;
        }
        function sphere(center, radius) {
            const vertices = [], rows = 14, cols = 20;
            const point = (i, j) => {
                const a = i / rows * Math.PI, b = j / cols * Math.PI * 2;
                const n = [Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b)];
                return [...M.add(center, M.mul(n, radius)), ...n];
            };
            for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++)
                vertices.push(...point(i, j), ...point(i + 1, j), ...point(i + 1, j + 1),
                    ...point(i, j), ...point(i + 1, j + 1), ...point(i, j + 1));
            return vertices;
        }
        function setPieces(next) {
            meshes.forEach(m => { gl.deleteBuffer(m.body.buffer); gl.deleteBuffer(m.knob.buffer); });
            pieces = next;
            const bounds = window.UnshackleEngine.bounds(pieces);
            center = bounds.center;
            sceneRadius = Math.max(2.5, ...pieces.flatMap(p => p.segments.flatMap(s =>
                [Math.hypot(...M.sub(s.a, center)) + s.r, Math.hypot(...M.sub(s.b, center)) + s.r])));
            meshes = pieces.map(p => {
                const n = M.unit(M.cross(p.u, p.v));
                return { body: upload([...tube(p.path, p.radius, n, true), ...tube(p.stem, p.radius, n, false)]),
                    knob: upload(sphere(p.knob, 0.19)), color: p.color.match(/\w\w/g).map(n => parseInt(n, 16) / 255) };
            });
        }

        function fit(state) {
            const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            const [x, y, z, wq] = orientation;
            rotation = [1-2*(y*y+z*z), 2*(x*y+wq*z), 2*(x*z-wq*y),
                2*(x*y-wq*z), 1-2*(x*x+z*z), 2*(y*z+wq*x),
                2*(x*z+wq*y), 2*(y*z-wq*x), 1-2*(x*x+y*y)];
            // Waiting pieces share the canvas's white frame. Reserve a little
            // internal space for them; Classic retains its original projection.
            const inset = state && state.mode === 'match' ? Math.min(96, rect.width * 0.28) * dpr : 0;
            const available = Math.max(1, w - inset);
            scale = [zoom * 0.95 / sceneRadius * Math.min(1, h/available) * (available/w),
                zoom * 0.95 / sceneRadius * Math.min(1, available/h)];
            shift = [-inset / w, 0];
            gl.viewport(0, 0, w, h);
        }
        function drawMesh(mesh) {
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
            gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 24, 0);
            gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 24, 12);
            gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        }
        function render(state, picking = false) {
            fit(state);
            gl.useProgram(program); gl.enable(gl.DEPTH_TEST); gl.disable(gl.DITHER);
            gl.enableVertexAttribArray(position); gl.enableVertexAttribArray(normal);
            gl.clearColor(...(picking ? [0, 0, 0, 1] : [0.975, 0.981, 0.987, 1]));
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.uniformMatrix3fv(loc.uRotation, false, rotation);
            gl.uniform2fv(loc.uScale, scale);
            gl.uniform2fv(loc.uShift, shift);
            gl.uniform1i(loc.uPicking, picking ? 1 : 0);
            pieces.forEach((p, i) => {
                const anim = state.animation && state.animation.id === p.id ? state.animation : null;
                if (anim && anim.docking) return;
                if (state.removed.has(p.id) && !(anim && anim.returning && anim.phase === 'insert')) return;
                gl.uniform3fv(loc.uOffset, M.sub(M.mul(p.dir, anim ? anim.offset : 0), center));
                let color = meshes[i].color;
                if (p.id === state.blocked) color = [0.9, 0.28, 0.28];
                else if (state.blockers.includes(p.id)) color = [0.96, 0.69, 0.27];
                else if (p.id === state.highlight || p.id === state.hover) color = color.map(n => n * 0.8 + 0.2);
                gl.uniform3fv(loc.uColor, picking ? [p.id / 255, 0, 0] : color);
                drawMesh(meshes[i].body);
                gl.uniform3fv(loc.uColor, picking ? [p.id / 255, 0, 0] : [0.97, 0.98, 1]);
                drawMesh(meshes[i].knob);
            });
        }
        function pickMany(points, state) {
            fit(state);
            if (frameWidth !== canvas.width || frameHeight !== canvas.height) {
                if (frame) { gl.deleteFramebuffer(frame); gl.deleteTexture(texture); gl.deleteRenderbuffer(depth); }
                frameWidth = canvas.width; frameHeight = canvas.height;
                frame = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
                texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, frameWidth, frameHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
                depth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
                gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, frameWidth, frameHeight);
                gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
            } else gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
            render(state, true);
            const rect = canvas.getBoundingClientRect(), pixel = new Uint8Array(4);
            const ids = points.map(({ x, y }) => {
                if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
                gl.readPixels(Math.max(0, Math.min(frameWidth - 1, Math.floor(x / rect.width * frameWidth))),
                    Math.max(0, Math.min(frameHeight - 1, Math.floor((1 - y / rect.height) * frameHeight))),
                    1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                return pieces.some(p => p.id === pixel[0]) ? pixel[0] : null;
            });
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return ids;
        }
        function project(point) {
            const r = rotation, p = M.sub(point, center);
            return { x: ((r[0]*p[0] + r[3]*p[1] + r[6]*p[2]) * scale[0] + shift[0] + 1) / 2 * canvas.clientWidth,
                y: (1 - (r[1]*p[0] + r[4]*p[1] + r[7]*p[2]) * scale[1]) / 2 * canvas.clientHeight,
                z: r[2]*p[0] + r[5]*p[1] + r[8]*p[2] };
        }
        // Full swept-path legality is checked by the engine. Limit only the
        // visible extraction preview, handing over before any part leaves view.
        function pullPreviewDistance(piece, travel, area, state) {
            fit(state);
            const origin = project(piece.center), step = project(M.add(piece.center, piece.dir));
            const axes = [[1,0,0], [0,1,0], [0,0,1]].map(a => project(M.add(piece.center, a)));
            const radii = ['x', 'y', 'z'].map(key => Math.hypot(...axes.map(p => p[key] - origin[key])));
            const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
            for (const segment of piece.segments) for (const point of [segment.a, segment.b]) {
                const p = project(point);
                ['x', 'y', 'z'].forEach((key, i) => {
                    lo[i] = Math.min(lo[i], p[key] - segment.r*radii[i]);
                    hi[i] = Math.max(hi[i], p[key] + segment.r*radii[i]);
                });
            }
            const limits = [[area.left, area.right], [area.top, area.bottom], [-23, 23]];
            let distance = travel;
            ['x', 'y', 'z'].forEach((key, i) => {
                const delta = step[key] - origin[key];
                if (delta > 1e-8) distance = Math.min(distance, (limits[i][1] - hi[i]) / delta);
                else if (delta < -1e-8) distance = Math.min(distance, (limits[i][0] - lo[i]) / delta);
            });
            return Math.max(0, distance);
        }
        function feedingCenter(mouth, plate) {
            const rect = mouth.getBoundingClientRect(), plateRect = plate.getBoundingClientRect();
            const target = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
            return { x: target.x - 14, y: target.y - Math.min(64, Math.max(30, (target.y - plateRect.bottom)*0.65)) };
        }
        // Start with the exact projected loop, then continuously shrink/morph
        // into its plate miniature. There is no offscreen exit or clamped spawn.
        function createPlateFlight(piece, distance, destination) {
            const node = name => document.createElementNS('http://www.w3.org/2000/svg', name);
            const svg = node('svg'), viewport = node('svg'), body = node('path'), stem = node('path'), knob = node('circle');
            svg.classList.add('piece-flight'); svg.dataset.phase = 'docking'; svg.setAttribute('aria-hidden', 'true');
            for (const p of [body, stem]) {
                p.setAttribute('fill', 'none'); p.setAttribute('stroke', piece.color);
                p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
            }
            knob.setAttribute('fill', '#f7faff'); knob.setAttribute('stroke', piece.color);
            viewport.style.overflow = 'hidden'; viewport.append(body, stem, knob); svg.appendChild(viewport);
            document.body.appendChild(svg);
            function target() {
                const d = destination();
                if (!d.slot) {
                    const center = feedingCenter(d.mouth, d.plate), width = Math.min(40, Math.max(25, piece.length*4+12));
                    return { ...center, width, height: 8, cap: { x: center.x+width/2+3, y: center.y }, capRadius: 3 };
                }
                const link = d.slot.querySelector('.match-link'), rect = link.getBoundingClientRect();
                const style = getComputedStyle(link), cap = getComputedStyle(link, '::after');
                const x = rect.left+rect.width/2, y = rect.top+rect.height/2;
                return { x, y, width: rect.width-2, height: rect.height-2,
                    cap: { x: rect.right-parseFloat(style.borderRightWidth)-parseFloat(cap.right)-parseFloat(cap.width)/2,
                        y: rect.top+parseFloat(style.borderTopWidth)+parseFloat(cap.top)+parseFloat(cap.height)/2 },
                    capRadius: parseFloat(cap.width)/2-0.5 };
            }
            return {
                update(progress) {
                    const rect = canvas.getBoundingClientRect(), offset = M.mul(piece.dir, distance), end = target();
                    for (const [key,value] of Object.entries({ x:rect.left, y:rect.top, width:rect.width, height:rect.height,
                        viewBox:`${rect.left} ${rect.top} ${rect.width} ${rect.height}` })) viewport.setAttribute(key,value);
                    const at = p => { const v = project(M.add(p, offset)); return { x: rect.left+v.x, y: rect.top+v.y }; };
                    const points = piece.path.map(at), cap = at(piece.knob);
                    const origin = at(piece.center), ease = progress*progress*(3-2*progress);
                    const top = Math.min(...points.map(p => p.y), cap.y, end.y-end.height/2);
                    const bow = -Math.min(24, Math.max(0, top-rect.top-8))*Math.sin(Math.PI*progress);
                    const mix = (a,b) => ({ x: a.x+(b.x-a.x)*ease, y: a.y+(b.y-a.y)*ease+bow });
                    const miniature = points.map((_, i) => {
                        const k = Math.floor(i/9), angle = k*Math.PI/2 + (i%9)/8*Math.PI/2;
                        const r = end.height/2, cx = (k===0||k===3?1:-1)*(end.width/2-r);
                        return { x: end.x+cx+r*Math.cos(angle), y: end.y+r*Math.sin(angle) };
                    });
                    const path = list => list.map((p,i) => `${i?'L':'M'}${p.x},${p.y}`).join(' ');
                    body.setAttribute('d', path(points.map((p,i) => mix(p,miniature[i])))+' Z');
                    stem.setAttribute('d', path(piece.stem.map((p,i) => mix(at(p), i ? end.cap : { x: end.x+end.width/2, y:end.y }))));
                    const axes = [[1,0,0],[0,1,0],[0,0,1]].map(a => at(M.add(piece.center,a)));
                    const unit = Math.sqrt(axes.reduce((s,p) => s+(p.x-origin.x)**2+(p.y-origin.y)**2,0)/2);
                    for (const p of [body,stem]) p.setAttribute('stroke-width', 2*piece.radius*unit*(1-ease)+2*ease);
                    const center = mix(cap,end.cap);
                    knob.setAttribute('cx',center.x); knob.setAttribute('cy',center.y);
                    knob.setAttribute('r',piece.segments[piece.segments.length-1].r*unit*(1-ease)+end.capRadius*ease);
                    knob.setAttribute('stroke-width',ease);
                },
                arrival() { const p=target(); return { x:p.x, y:p.y }; },
                remove() { svg.remove(); },
            };
        }
        // The small tray representation travels to the clear end of the pull
        // axis. The actual WebGL mesh then inserts along that axis, at full size.
        function createReturnFlight(piece, distance = 0, showSymbols = false) {
            const node = name => document.createElementNS('http://www.w3.org/2000/svg', name);
            const svg = node('svg'), body = node('path'), stem = node('path'), knob = node('circle'), label = node('text');
            svg.classList.add('piece-flight'); svg.setAttribute('aria-hidden', 'true');
            for (const path of [body, stem]) {
                path.setAttribute('fill', 'none'); path.setAttribute('stroke', piece.color);
                path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
            }
            knob.setAttribute('fill', '#f7faff'); knob.setAttribute('stroke', piece.color);
            label.setAttribute('text-anchor', 'middle'); label.setAttribute('dominant-baseline', 'central');
            label.setAttribute('fill', '#4b5563'); label.setAttribute('font-size', '10'); label.setAttribute('font-weight', '700');
            label.textContent = showSymbols ? `${piece.id}${piece.symbol}` : piece.id;
            svg.append(body, stem, knob, label); document.body.appendChild(svg);
            return {
                update(source, progress) {
                    const rect = canvas.getBoundingClientRect(), offset = M.mul(piece.dir, distance);
                    const at = p => project(M.add(p, offset)), origin = at(piece.center);
                    const points = piece.path.map(at), end = at(piece.knob);
                    const width = Math.max(...points.map(p => p.x), end.x) - Math.min(...points.map(p => p.x), end.x);
                    const height = Math.max(...points.map(p => p.y), end.y) - Math.min(...points.map(p => p.y), end.y);
                    const ease = progress * progress * (3 - 2 * progress);
                    const small = Math.min(1, 30 / Math.max(1, width), 20 / Math.max(1, height));
                    const grow = small + (1 - small) * ease;
                    const x = source.left + source.width / 2, y = source.top + source.height / 2;
                    const cx = x + (rect.left + origin.x - x) * ease;
                    const cy = y + (rect.top + origin.y - y) * ease - 36 * Math.sin(Math.PI * progress);
                    const transform = p => ({ x: cx + (p.x - origin.x) * grow, y: cy + (p.y - origin.y) * grow });
                    const path = list => list.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
                    body.setAttribute('d', path(points.map(transform)) + ' Z');
                    stem.setAttribute('d', path(piece.stem.map(p => transform(at(p)))));
                    const axes = [[1,0,0], [0,1,0], [0,0,1]].map(a => at(M.add(piece.center, a)));
                    const unit = Math.sqrt(axes.reduce((s, p) => s + (p.x - origin.x) ** 2 + (p.y - origin.y) ** 2, 0) / 2) * grow;
                    for (const p of [body, stem]) p.setAttribute('stroke-width', 2 * piece.radius * unit);
                    const cap = transform(end);
                    knob.setAttribute('cx', cap.x); knob.setAttribute('cy', cap.y);
                    knob.setAttribute('r', 0.19 * unit); knob.setAttribute('stroke-width', '0.6');
                    label.setAttribute('x', cap.x); label.setAttribute('y', cap.y);
                    label.setAttribute('opacity', ease);
                },
                remove() { svg.remove(); },
            };
        }
        function createFeedingFlight(next, sources, mouth, plate) {
            const node = name => document.createElementNS('http://www.w3.org/2000/svg', name);
            const svg = node('svg'); svg.classList.add('piece-flight'); svg.setAttribute('aria-hidden', 'true');
            const clamp = n => Math.max(0, Math.min(1, n)), smooth = n => n*n*(3-2*n);
            const tokens = next.map(p => {
                // custom: a miniature metal loop with its white end cap.
                const group = node('g'), ring = node('rect'), cap = node('circle');
                const width = Math.min(40, Math.max(25, p.length * 4 + 12));
                for (const [key, value] of Object.entries({ x: -width/2, y: -4, width, height: 8, rx: 4,
                    fill: 'none', stroke: p.color, 'stroke-width': 2 })) ring.setAttribute(key, value);
                for (const [key, value] of Object.entries({ cx: width/2+3, cy: 0, r: 3,
                    fill: '#f7faff', stroke: p.color, 'stroke-width': 1 })) cap.setAttribute(key, value);
                group.append(ring, cap); svg.appendChild(group); return group;
            });
            // custom: three metal loops condense into a single glossy star treat.
            const pulse = node('circle'), candy = node('g'), glow = node('circle'), star = node('polygon'), shine = node('path');
            pulse.setAttribute('fill', 'none'); pulse.setAttribute('stroke', next[0].color); pulse.setAttribute('stroke-width', '1.5');
            candy.classList.add('fusion-candy'); candy.setAttribute('opacity', '0');
            glow.setAttribute('r', '22'); glow.setAttribute('fill', next[0].color); glow.setAttribute('opacity', '0.12');
            star.setAttribute('points', Array.from({ length: 10 }, (_, i) => {
                const angle = -Math.PI/2 + i*Math.PI/5, r = i % 2 ? 6.5 : 14;
                return `${Math.cos(angle)*r},${Math.sin(angle)*r}`;
            }).join(' '));
            star.setAttribute('fill', next[0].color); star.setAttribute('stroke', '#fff');
            star.setAttribute('stroke-width', '1.5'); star.setAttribute('stroke-linejoin', 'round');
            shine.setAttribute('d', 'M-4-7Q-3-3-7-2Q-3-1-3 2Q-2-2 1-3Q-3-3-4-7Z');
            shine.setAttribute('fill', '#fff'); shine.setAttribute('opacity', '0.8');
            candy.append(glow, star, shine); svg.append(pulse, candy);
            document.body.appendChild(svg);
            return {
                update(progress) {
                    const rect = mouth.getBoundingClientRect(), target = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
                    const fusion = feedingCenter(mouth, plate);
                    const merge = clamp((progress - 0.34) / 0.18), deliver = clamp((progress - 0.54) / 0.3);
                    svg.dataset.phase = progress < 0.34 ? 'gather' : progress < 0.54 ? 'fusion' : progress < 0.84 ? 'deliver' : 'chew';
                    tokens.forEach((token, i) => {
                        const angle = -Math.PI/2 + i*2*Math.PI/3;
                        let x, y, scale, turn;
                        if (progress < 0.34) {
                            const p = clamp((progress - i*0.02) / 0.3), ease = smooth(p);
                            x = sources[i].x + (fusion.x + Math.cos(angle)*14 - sources[i].x)*ease;
                            y = sources[i].y + (fusion.y + Math.sin(angle)*14 - sources[i].y)*ease - 20*Math.sin(Math.PI*p);
                            scale = 1 - 0.35*ease; turn = ease*i*120;
                        } else {
                            const spin = angle + merge*2*Math.PI;
                            x = fusion.x + Math.cos(spin)*14*(1-merge); y = fusion.y + Math.sin(spin)*14*(1-merge);
                            scale = 0.65*(1-merge); turn = i*120 + merge*360;
                        }
                        token.setAttribute('transform', `translate(${x},${y}) rotate(${turn}) scale(${scale})`);
                        token.setAttribute('opacity', 1-merge);
                    });
                    pulse.setAttribute('cx', fusion.x); pulse.setAttribute('cy', fusion.y);
                    pulse.setAttribute('r', 10 + merge*24);
                    pulse.setAttribute('opacity', progress >= 0.34 && progress < 0.54 ? Math.sin(merge*Math.PI)*0.45 : 0);
                    const ease = smooth(deliver), x = fusion.x + (target.x-fusion.x)*ease;
                    const y = fusion.y + (target.y-fusion.y)*ease - 12*Math.sin(deliver*Math.PI);
                    const scale = progress < 0.54 ? 0.3 + smooth(merge)*0.7 + Math.sin(merge*Math.PI)*0.14 : 1-ease*0.78;
                    candy.setAttribute('transform', `translate(${x},${y}) rotate(${-18 + smooth(merge)*18 + ease*20}) scale(${scale})`);
                    candy.setAttribute('opacity', progress >= 0.84 ? 0 : clamp((progress-0.34)/0.12));
                },
                remove() { svg.remove(); },
            };
        }
        return { setPieces, render, project, pickMany, pullPreviewDistance, createPlateFlight, createReturnFlight, createFeedingFlight,
            pick(x, y, state) { return pickMany([{ x, y }], state)[0]; },
            rotate(dx, dy) {
                const angle = Math.hypot(dx, dy);
                if (!angle) return;
                const s = Math.sin(angle / 2) / angle;
                const ax = dy * s, ay = dx * s, aw = Math.cos(angle / 2);
                const [bx, by, bz, bw] = orientation;
                const next = [aw*bx + ax*bw + ay*bz, aw*by - ax*bz + ay*bw,
                    aw*bz + ax*by - ay*bx, aw*bw - ax*bx - ay*by];
                const length = Math.hypot(...next);
                orientation = next.map(v => v / length);
            },
            zoom(factor) { zoom = Math.max(0.7, Math.min(3, zoom * factor)); },
            reset() { orientation = initialOrientation(); zoom = 1; } };
    }
    window.UnshackleView = { create };
})();
