// WebGL2 渲染器 — 瀏覽器層。區塊網格、實體、天空、雲、選取框、裂痕。
// 只負責畫面；遊戲狀態一律由 main.js 的固定時步餵入。
'use strict';

(function () {
  // ---------- mat4（column-major） ----------
  function ident() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
  function mul(a, b) { // a*b
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f;
    m[10] = (far + near) / (near - far); m[11] = -1;
    m[14] = 2 * far * near / (near - far);
    return m;
  }
  function translate(x, y, z) { const m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function scale(x, y, z) { const m = ident(); m[0] = x; m[5] = y; m[10] = z; return m; }
  function rotX(a) { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
  function rotY(a) { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
  function rotZ(a) { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
  function compose(...ms) { return ms.reduce((a, b) => mul(a, b)); }

  // ---------- shader 工具 ----------
  function makeProgram(gl, vs, fs) {
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  const CHUNK_VS = `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec2 aUv;
  layout(location=2) in vec2 aL;
  uniform mat4 uPV; uniform vec3 uCam; uniform vec2 uUvOff;
  out vec2 vUv; out vec2 vL; out float vDist;
  void main() {
    gl_Position = uPV * vec4(aPos, 1.0);
    vUv = aUv + uUvOff; vL = aL; vDist = distance(aPos, uCam);
  }`;
  const CHUNK_FS = `#version 300 es
  precision mediump float;
  in vec2 vUv; in vec2 vL; in float vDist;
  uniform sampler2D uTex;
  uniform float uDay, uGlow, uAlpha, uCutout, uFogNear, uFogFar;
  uniform vec3 uFog;
  out vec4 frag;
  void main() {
    vec4 t = texture(uTex, vUv);
    if (uCutout > 0.5 && t.a < 0.5) discard;
    float bright;
    if (vL.x > 1.5) bright = 1.0;                    // 自發光
    else {
      float sun = vL.x * (0.22 + 0.78 * uDay);
      float glow = clamp(1.0 - vDist / 9.0, 0.0, 1.0);
      glow = glow * glow * uGlow * clamp(1.0 - sun, 0.0, 1.0);
      bright = clamp(0.07 + sun + glow, 0.0, 1.0);
    }
    vec3 c = t.rgb * bright * vL.y;
    float fog = smoothstep(uFogNear, uFogFar, vDist);
    frag = vec4(mix(c, uFog, fog), t.a * uAlpha);
  }`;

  const ENT_VS = `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec2 aUv;
  layout(location=2) in float aShade;
  uniform mat4 uPV, uModel;
  uniform vec2 uTileOff, uTileScale;
  uniform vec3 uCam;
  out vec2 vUv; out float vShade; out float vDist;
  void main() {
    vec4 w = uModel * vec4(aPos, 1.0);
    gl_Position = uPV * w;
    vUv = uTileOff + aUv * uTileScale;
    vShade = aShade;
    vDist = distance(w.xyz, uCam);
  }`;
  const ENT_FS = `#version 300 es
  precision mediump float;
  in vec2 vUv; in float vShade; in float vDist;
  uniform sampler2D uTex;
  uniform float uLight, uAlpha, uCutout;
  uniform vec3 uTint; uniform float uTintAmt;
  uniform float uFogNear, uFogFar; uniform vec3 uFog;
  out vec4 frag;
  void main() {
    vec4 t = texture(uTex, vUv);
    if (uCutout > 0.5 && t.a < 0.4) discard;
    vec3 c = mix(t.rgb, uTint, uTintAmt) * uLight * vShade;
    float fog = smoothstep(uFogNear, uFogFar, vDist);
    frag = vec4(mix(c, uFog, fog), t.a * uAlpha);
  }`;

  const FLAT_VS = `#version 300 es
  layout(location=0) in vec3 aPos;
  uniform mat4 uPV; uniform mat4 uModel;
  void main() { gl_Position = uPV * uModel * vec4(aPos, 1.0); gl_PointSize = 2.0; }`;
  const FLAT_FS = `#version 300 es
  precision mediump float;
  uniform vec4 uColor;
  out vec4 frag;
  void main() { frag = uColor; }`;

  const SKY_VS = `#version 300 es
  layout(location=0) in vec2 aPos;
  out vec2 vP;
  void main() { vP = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;
  const SKY_FS = `#version 300 es
  precision mediump float;
  in vec2 vP;
  uniform vec3 uTop, uHorizon;
  uniform mat4 uInvRot;   // 只含旋轉的 view 逆矩陣
  uniform float uAspect, uTanHalf;
  out vec4 frag;
  void main() {
    vec3 dir = normalize((uInvRot * vec4(vP.x * uTanHalf * uAspect, vP.y * uTanHalf, -1.0, 0.0)).xyz);
    float h = clamp(dir.y * 1.6 + 0.25, 0.0, 1.0);
    frag = vec4(mix(uHorizon, uTop, h), 1.0);
  }`;

  // ---------- 單位立方體（含每面 uv 與面向陰影） ----------
  const CUBE_FACES = [
    { n: [1, 0, 0], sh: 0.8, c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
    { n: [-1, 0, 0], sh: 0.8, c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { n: [0, 1, 0], sh: 1.0, c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], sh: 0.55, c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], sh: 0.7, c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], sh: 0.7, c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
  ];
  function buildCube() { // 中心在原點，邊長 1；頂點：pos3 uv2 shade1
    const v = [], idx = [];
    const uv = [[0, 1], [1, 1], [1, 0], [0, 0]];
    for (const f of CUBE_FACES) {
      const b = v.length / 6;
      for (let i = 0; i < 4; i++) {
        const c = f.c[i];
        v.push(c[0] - 0.5, c[1] - 0.5, c[2] - 0.5, uv[i][0], uv[i][1], f.sh);
      }
      idx.push(b, b + 1, b + 2, b + 2, b + 3, b);
    }
    return { verts: new Float32Array(v), inds: new Uint16Array(idx) };
  }

  // ---------- 生物模型（各部件：尺寸、中心、tile、擺動類型） ----------
  const MODELS = {
    pig: [
      { size: [0.62, 0.5, 0.94], at: [0, 0.62, 0], tile: 48 },
      { size: [0.5, 0.5, 0.5], at: [0, 0.75, -0.66], tile: 48 },
      { size: [0.48, 0.48, 0.05], at: [0, 0.75, -0.93], tile: 49 },
      { size: [0.18, 0.4, 0.18], pivot: [0.2, 0.42, 0.3], swing: 1, tile: 48 },
      { size: [0.18, 0.4, 0.18], pivot: [-0.2, 0.42, 0.3], swing: -1, tile: 48 },
      { size: [0.18, 0.4, 0.18], pivot: [0.2, 0.42, -0.3], swing: -1, tile: 48 },
      { size: [0.18, 0.4, 0.18], pivot: [-0.2, 0.42, -0.3], swing: 1, tile: 48 },
    ],
    zombie: [
      { size: [0.22, 0.8, 0.22], pivot: [0.13, 0.8, 0], swing: 1, tile: 53 },
      { size: [0.22, 0.8, 0.22], pivot: [-0.13, 0.8, 0], swing: -1, tile: 53 },
      { size: [0.52, 0.74, 0.3], at: [0, 1.18, 0], tile: 52 },
      { size: [0.18, 0.18, 0.66], at: [0.35, 1.44, -0.3], tile: 50 },
      { size: [0.18, 0.18, 0.66], at: [-0.35, 1.44, -0.3], tile: 50 },
      { size: [0.48, 0.48, 0.48], at: [0, 1.8, 0], tile: 50 },
      { size: [0.46, 0.46, 0.05], at: [0, 1.8, -0.25], tile: 51 },
    ],
  };

  function createRenderer(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) return null;

    const progChunk = makeProgram(gl, CHUNK_VS, CHUNK_FS);
    const progEnt = makeProgram(gl, ENT_VS, ENT_FS);
    const progFlat = makeProgram(gl, FLAT_VS, FLAT_FS);
    const progSky = makeProgram(gl, SKY_VS, SKY_FS);
    const U = (p, n) => gl.getUniformLocation(p, n);

    // 材質
    function uploadTex(cv) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    }
    const atlasTex = uploadTex(MWTextures.makeAtlas());
    const cloudCv = MWTextures.makeClouds();
    const cloudTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, cloudTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cloudCv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    // ---- 區塊網格 ----
    const chunkMeshes = new Map(); // key -> {parts:{solid,cutout,water}, cx, cz}
    function uploadPart(part) {
      if (!part.count) return null;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, part.verts, gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.inds, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 20);
      gl.bindVertexArray(null);
      return { vao, vbo, ibo, count: part.count };
    }
    function freePart(p) {
      if (!p) return;
      gl.deleteVertexArray(p.vao); gl.deleteBuffer(p.vbo); gl.deleteBuffer(p.ibo);
    }
    function setChunkMesh(key, cx, cz, mesh) {
      deleteChunkMesh(key);
      chunkMeshes.set(key, {
        cx, cz,
        solid: uploadPart(mesh.solid),
        cutout: uploadPart(mesh.cutout),
        water: uploadPart(mesh.water),
      });
    }
    function deleteChunkMesh(key) {
      const m = chunkMeshes.get(key);
      if (m) { freePart(m.solid); freePart(m.cutout); freePart(m.water); chunkMeshes.delete(key); }
    }

    // ---- 立方體（實體/掉落物/裂痕共用） ----
    const cube = buildCube();
    const cubeVao = gl.createVertexArray();
    gl.bindVertexArray(cubeVao);
    const cubeVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVbo);
    gl.bufferData(gl.ARRAY_BUFFER, cube.verts, gl.STATIC_DRAW);
    const cubeIbo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cube.inds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 20);
    gl.bindVertexArray(null);

    // ---- 線框（選取框） ----
    const lineVao = gl.createVertexArray();
    gl.bindVertexArray(lineVao);
    const lineVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
    const E = 0.002, S = 1 + E * 2;
    const lv = [];
    const cs = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [a, b] of edges) for (const i of [a, b]) lv.push(cs[i][0] * S - E, cs[i][1] * S - E, cs[i][2] * S - E);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lv), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);

    // ---- 星星 ----
    const starVao = gl.createVertexArray();
    gl.bindVertexArray(starVao);
    const starVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, starVbo);
    const stars = [];
    const srand = MWNoise.mulberry32(88);
    for (let i = 0; i < 350; i++) {
      const a = srand() * Math.PI * 2, b = Math.acos(srand() * 2 - 1);
      stars.push(Math.sin(b) * Math.cos(a) * 900, Math.abs(Math.cos(b)) * 900 + 30, Math.sin(b) * Math.sin(a) * 900);
    }
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(stars), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);

    // ---- 天空全螢幕 quad ----
    const skyVao = gl.createVertexArray();
    gl.bindVertexArray(skyVao);
    const skyVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, skyVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);

    // ---- 雲層 quad（大平面，uv 重複） ----
    const cloudVao = gl.createVertexArray();
    gl.bindVertexArray(cloudVao);
    const cloudVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudVbo);
    const CS = 640; // 半徑；uv 5 次重複 → 每世界單位 5/1280
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -CS, 0, -CS, 0, 0, 1, 1, CS, 0, -CS, 5, 0, 1, 1, CS, 0, CS, 5, 5, 1, 1,
      -CS, 0, -CS, 0, 0, 1, 1, CS, 0, CS, 5, 5, 1, 1, -CS, 0, CS, 0, 5, 1, 1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 20);
    gl.bindVertexArray(null);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w; canvas.height = h;
      }
    }

    function render(sc) {
      resize();
      const W = canvas.width, H = canvas.height;
      if (!W || !H) return;
      gl.viewport(0, 0, W, H);

      const proj = perspective(sc.fovY, W / H, 0.08, 900);
      const view = compose(rotX(-sc.cam.pitch), rotY(-sc.cam.yaw), translate(-sc.cam.x, -sc.cam.y, -sc.cam.z));
      const pv = mul(proj, view);
      const invRot = compose(rotY(sc.cam.yaw), rotX(sc.cam.pitch));

      gl.clearColor(sc.fogColor[0], sc.fogColor[1], sc.fogColor[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);

      // 天空
      if (!sc.underwater) {
        gl.depthMask(false);
        gl.useProgram(progSky);
        gl.uniform3fv(U(progSky, 'uTop'), sc.skyTop);
        gl.uniform3fv(U(progSky, 'uHorizon'), sc.skyHorizon);
        gl.uniformMatrix4fv(U(progSky, 'uInvRot'), false, invRot);
        gl.uniform1f(U(progSky, 'uAspect'), W / H);
        gl.uniform1f(U(progSky, 'uTanHalf'), Math.tan(sc.fovY / 2));
        gl.bindVertexArray(skyVao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // 星星
        if (sc.starAlpha > 0.02) {
          gl.useProgram(progFlat);
          gl.uniformMatrix4fv(U(progFlat, 'uPV'), false, pv);
          gl.uniformMatrix4fv(U(progFlat, 'uModel'), false, translate(sc.cam.x, sc.cam.y, sc.cam.z));
          gl.uniform4f(U(progFlat, 'uColor'), 1, 1, 1, sc.starAlpha);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.bindVertexArray(starVao);
          gl.drawArrays(gl.POINTS, 0, 350);
          gl.disable(gl.BLEND);
        }
        // 太陽與月亮（方形告示板）
        gl.useProgram(progFlat);
        gl.uniformMatrix4fv(U(progFlat, 'uPV'), false, pv);
        for (const b of sc.billboards) {
          const m = compose(
            translate(sc.cam.x + b.dir[0] * 600, sc.cam.y + b.dir[1] * 600, sc.cam.z + b.dir[2] * 600),
            rotY(Math.atan2(b.dir[0], b.dir[2])),
            rotX(-Math.asin(Math.max(-1, Math.min(1, b.dir[1])))),
            scale(b.size, b.size, b.size));
          gl.uniformMatrix4fv(U(progFlat, 'uModel'), false, m);
          gl.uniform4f(U(progFlat, 'uColor'), b.color[0], b.color[1], b.color[2], b.color[3]);
          gl.bindVertexArray(cubeVao);
          gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        }
        gl.depthMask(true);
      }

      // 區塊
      gl.useProgram(progChunk);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(U(progChunk, 'uTex'), 0);
      gl.uniformMatrix4fv(U(progChunk, 'uPV'), false, pv);
      gl.uniform3f(U(progChunk, 'uCam'), sc.cam.x, sc.cam.y, sc.cam.z);
      gl.uniform1f(U(progChunk, 'uDay'), sc.day);
      gl.uniform1f(U(progChunk, 'uGlow'), sc.glow);
      gl.uniform1f(U(progChunk, 'uFogNear'), sc.fogNear);
      gl.uniform1f(U(progChunk, 'uFogFar'), sc.fogFar);
      gl.uniform3fv(U(progChunk, 'uFog'), sc.fogColor);

      const fx = -Math.sin(sc.cam.yaw), fz = -Math.cos(sc.cam.yaw);
      const visible = [];
      for (const m of chunkMeshes.values()) {
        const cx = m.cx * 16 + 8 - sc.cam.x, cz = m.cz * 16 + 8 - sc.cam.z;
        const d2 = cx * cx + cz * cz;
        if (d2 > (sc.fogFar + 20) * (sc.fogFar + 20)) continue;
        if (d2 > 900 && cx * fx + cz * fz < -26) continue; // 背後剔除
        visible.push(m);
      }

      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.uniform1f(U(progChunk, 'uAlpha'), 1);
      gl.uniform1f(U(progChunk, 'uCutout'), 0);
      for (const m of visible) if (m.solid) {
        gl.bindVertexArray(m.solid.vao);
        gl.drawElements(gl.TRIANGLES, m.solid.count, gl.UNSIGNED_INT, 0);
      }
      gl.disable(gl.CULL_FACE);
      gl.uniform1f(U(progChunk, 'uCutout'), 1);
      for (const m of visible) if (m.cutout) {
        gl.bindVertexArray(m.cutout.vao);
        gl.drawElements(gl.TRIANGLES, m.cutout.count, gl.UNSIGNED_INT, 0);
      }

      // 實體
      gl.useProgram(progEnt);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(U(progEnt, 'uTex'), 0);
      gl.uniformMatrix4fv(U(progEnt, 'uPV'), false, pv);
      gl.uniform3f(U(progEnt, 'uCam'), sc.cam.x, sc.cam.y, sc.cam.z);
      gl.uniform1f(U(progEnt, 'uFogNear'), sc.fogNear);
      gl.uniform1f(U(progEnt, 'uFogFar'), sc.fogFar);
      gl.uniform3fv(U(progEnt, 'uFog'), sc.fogColor);
      gl.uniform1f(U(progEnt, 'uAlpha'), 1);
      gl.uniform1f(U(progEnt, 'uCutout'), 0);
      gl.bindVertexArray(cubeVao);
      gl.enable(gl.CULL_FACE);

      const tileUV = (t) => [(t % 16) / 16 + 0.004, Math.floor(t / 16) / 16 + 0.004];
      const TS = 1 / 16 - 0.008;

      for (const mob of sc.mobs) {
        const base = compose(
          translate(mob.x, mob.y, mob.z),
          rotY(mob.yaw),
          rotZ(mob.deathT ? Math.min(1, mob.deathT / 0.6) * Math.PI / 2 : 0));
        const light = 0.25 + 0.75 * mob.light * (0.22 + 0.78 * sc.day);
        gl.uniform1f(U(progEnt, 'uLight'), Math.min(1, light));
        const hurt = mob.hurtT > 0 ? 0.55 : 0;
        const burn = mob.burning ? 0.35 : 0;
        gl.uniform3f(U(progEnt, 'uTint'), 1, burn > 0 ? 0.45 : 0.15, 0.1);
        gl.uniform1f(U(progEnt, 'uTintAmt'), Math.max(hurt, burn));
        const swing = Math.sin(mob.anim * 4) * 0.7;
        for (const part of MODELS[mob.type]) {
          let pm;
          if (part.pivot) {
            pm = compose(base,
              translate(part.pivot[0], part.pivot[1], part.pivot[2]),
              rotX(swing * part.swing),
              translate(0, -part.size[1] / 2, 0),
              scale(part.size[0], part.size[1], part.size[2]));
          } else {
            pm = compose(base, translate(part.at[0], part.at[1], part.at[2]),
              scale(part.size[0], part.size[1], part.size[2]));
          }
          gl.uniformMatrix4fv(U(progEnt, 'uModel'), false, pm);
          const [u, v] = tileUV(part.tile);
          gl.uniform2f(U(progEnt, 'uTileOff'), u, v);
          gl.uniform2f(U(progEnt, 'uTileScale'), TS, TS);
          gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        }
      }

      // 掉落物
      gl.uniform1f(U(progEnt, 'uTintAmt'), 0);
      for (const d of sc.drops) {
        const bob = Math.sin(d.spin * 1.7) * 0.05;
        const m = compose(
          translate(d.x, d.y + 0.12 + bob, d.z),
          rotY(d.spin),
          scale(0.24, 0.24, 0.24));
        gl.uniformMatrix4fv(U(progEnt, 'uModel'), false, m);
        gl.uniform1f(U(progEnt, 'uLight'), Math.min(1, 0.3 + 0.7 * d.light * (0.22 + 0.78 * sc.day)));
        const [u, v] = tileUV(d.tile);
        gl.uniform2f(U(progEnt, 'uTileOff'), u, v);
        gl.uniform2f(U(progEnt, 'uTileScale'), TS, TS);
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
      }
      gl.disable(gl.CULL_FACE);

      // 雲
      if (!sc.underwater) {
        gl.useProgram(progChunk); // 共用 chunk shader 的霧；改綁雲貼圖
        gl.bindTexture(gl.TEXTURE_2D, cloudTex);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.uniform1f(U(progChunk, 'uAlpha'), 0.55);
        gl.uniform1f(U(progChunk, 'uCutout'), 0);
        gl.bindVertexArray(cloudVao);
        // 平面跟著攝影機，uv 依世界座標偏移 → 雲相對世界固定並隨時間飄
        const upu = 5 / 1280; // 每世界單位的 uv
        gl.uniform2f(U(progChunk, 'uUvOff'), (sc.cam.x + sc.cloudOffset) * upu, sc.cam.z * upu);
        const cm = mul(pv, translate(sc.cam.x, 100, sc.cam.z));
        gl.uniformMatrix4fv(U(progChunk, 'uPV'), false, cm);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.uniformMatrix4fv(U(progChunk, 'uPV'), false, pv);
        gl.uniform2f(U(progChunk, 'uUvOff'), 0, 0);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }

      // 水（半透明，最後畫）
      gl.useProgram(progChunk);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.uniform1f(U(progChunk, 'uAlpha'), 0.82);
      gl.uniform1f(U(progChunk, 'uCutout'), 0);
      for (const m of visible) if (m.water) {
        gl.bindVertexArray(m.water.vao);
        gl.drawElements(gl.TRIANGLES, m.water.count, gl.UNSIGNED_INT, 0);
      }
      gl.depthMask(true);

      // 裂痕
      if (sc.crack) {
        gl.useProgram(progEnt);
        gl.uniformMatrix4fv(U(progEnt, 'uModel'), false, compose(
          translate(sc.crack.x + 0.5, sc.crack.y + 0.5, sc.crack.z + 0.5),
          scale(1.01, 1.01, 1.01)));
        gl.uniform1f(U(progEnt, 'uLight'), 1);
        gl.uniform1f(U(progEnt, 'uTintAmt'), 0);
        gl.uniform1f(U(progEnt, 'uCutout'), 1);
        const [u, v] = tileUV(40 + Math.max(0, Math.min(7, sc.crack.stage)));
        gl.uniform2f(U(progEnt, 'uTileOff'), u, v);
        gl.uniform2f(U(progEnt, 'uTileScale'), TS, TS);
        gl.bindVertexArray(cubeVao);
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        gl.uniform1f(U(progEnt, 'uCutout'), 0);
      }
      gl.disable(gl.BLEND);

      // 選取框
      if (sc.sel) {
        gl.useProgram(progFlat);
        gl.uniformMatrix4fv(U(progFlat, 'uPV'), false, pv);
        gl.uniformMatrix4fv(U(progFlat, 'uModel'), false, translate(sc.sel.x, sc.sel.y, sc.sel.z));
        gl.uniform4f(U(progFlat, 'uColor'), 0.05, 0.05, 0.05, 0.9);
        gl.bindVertexArray(lineVao);
        gl.drawArrays(gl.LINES, 0, 24);
      }
      gl.bindVertexArray(null);
    }

    return { render, resize, setChunkMesh, deleteChunkMesh, chunkCount: () => chunkMeshes.size };
  }

  window.MWRender = { createRenderer };
})();
