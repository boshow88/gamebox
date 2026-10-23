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
            varying vec3 vNormal;
            void main() {
                vec3 p = uRotation * (aPosition + uOffset);
                vNormal = uRotation * aNormal;
                gl_Position = vec4(p.xy * uScale, -p.z / 24.0, 1.0);
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
        ['uRotation', 'uOffset', 'uScale', 'uColor', 'uPicking'].forEach(n => { loc[n] = gl.getUniformLocation(program, n); });
        const position = gl.getAttribLocation(program, 'aPosition'), normal = gl.getAttribLocation(program, 'aNormal');
        let meshes = [], pieces = [], yaw = -0.35, pitch = 0.28, zoom = 1;
        let center = [0, 0, 0], sceneRadius = 3.5;
        let rotation, scale, frame, depth, texture, frameWidth = 0, frameHeight = 0;

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

        function fit() {
            const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
            rotation = [cy, sp*sy, -cp*sy, 0, cp, sp, sy, -sp*cy, cp*cy];
            scale = [zoom * 0.95 / sceneRadius * Math.min(1, h/w), zoom * 0.95 / sceneRadius * Math.min(1, w/h)];
            gl.viewport(0, 0, w, h);
        }
        function drawMesh(mesh) {
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
            gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 24, 0);
            gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 24, 12);
            gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        }
        function render(state, picking = false) {
            fit();
            gl.useProgram(program); gl.enable(gl.DEPTH_TEST); gl.disable(gl.DITHER);
            gl.enableVertexAttribArray(position); gl.enableVertexAttribArray(normal);
            gl.clearColor(...(picking ? [0, 0, 0, 1] : [0.975, 0.981, 0.987, 1]));
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.uniformMatrix3fv(loc.uRotation, false, rotation);
            gl.uniform2fv(loc.uScale, scale);
            gl.uniform1i(loc.uPicking, picking ? 1 : 0);
            pieces.forEach((p, i) => {
                if (state.removed.has(p.id)) return;
                const anim = state.animation && state.animation.id === p.id ? state.animation : null;
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
            fit();
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
            return { x: ((r[0]*p[0] + r[3]*p[1] + r[6]*p[2]) * scale[0] + 1) / 2 * canvas.clientWidth,
                y: (1 - (r[1]*p[0] + r[4]*p[1] + r[7]*p[2]) * scale[1]) / 2 * canvas.clientHeight,
                z: r[2]*p[0] + r[5]*p[1] + r[8]*p[2] };
        }
        return { setPieces, render, project, pickMany,
            pick(x, y, state) { return pickMany([{ x, y }], state)[0]; },
            // Wrap rather than clamp: either drag direction can pass every pole.
            rotate(dx, dy) { yaw = (yaw + dx) % (Math.PI * 2); pitch = (pitch + dy) % (Math.PI * 2); },
            zoom(factor) { zoom = Math.max(0.7, Math.min(1.65, zoom * factor)); },
            reset() { yaw = -0.35; pitch = 0.28; zoom = 1; } };
    }
    window.UnshackleView = { create };
})();
