(() => {
  const V = window.VORTEX;

  function stripGlsl(src) {
    const lines = src.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/\/\/.*$/, '').trim();
      if (line) out.push(line);
    }
    return out.join('\n');
  }

  function compactJs(code) {
    return code
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('//'))
      .join('\n');
  }

  function safeTagName(raw) {
    const clean = String(raw || 'vortex-scene').trim().toLowerCase();
    return V.TAG_NAME_RE.test(clean) ? clean : 'vortex-scene';
  }

  function analyzeFeatures(recipe, hasCustomTarget, hasPhoto) {
    const needsBloom = recipe.glow > 0.001 || recipe.lens === 1 || recipe.lens === 7;
    const needsTrails = recipe.trails > 0.001;
    const isTransparent = recipe.bgMode === V.BG_MODE.TRANSPARENT;
    const needsPost =
      needsTrails || needsBloom || recipe.split > 0.001 || recipe.grain > 0.001 ||
      recipe.mirror > 0 || recipe.lens > 0 || recipe.toneMap > 0 ||
      recipe.monoInvert > 0.001 || isTransparent;

    return {
      all: false,
      shapes: [recipe.shape],
      target: recipe.shape === V.SHAPE.WORD && hasCustomTarget,
      photo: recipe.colorDriver === 3 && hasPhoto,
      brush: false,
      cam: false,
      pins: false,
      mirror: recipe.mirror > 0,
      lens: recipe.lens > 0,
      bloom: needsBloom,
      trails: needsTrails,
      split: recipe.split > 0.001 || recipe.lens === 4,
      grain: recipe.grain > 0.001,
      toneMap: recipe.toneMap > 0,
      transparent: isTransparent,
      needsPost
    };
  }

  function buildRuntimeCore(recipe, features, shaders, opts, packedTarget, posterUrl) {
    const safeRecipe = V.escapeJsonForHtml(recipe);
    const safeStates = V.escapeJsonForHtml(V.PRESET_STATES);
    const safeShaders = V.escapeJsonForHtml({
      sv: shaders.SIM_VS,
      sf: shaders.SIM_FS,
      rv: shaders.RENDER_VS,
      rf: shaders.RENDER_FS,
      qv: features.needsPost ? shaders.QUAD_VS : '',
      ff: features.trails ? shaders.FADE_FS : '',
      kd: features.bloom ? shaders.KAWASE_DOWN_FS : '',
      ku: features.bloom ? shaders.KAWASE_UP_FS : '',
      pf: features.needsPost ? shaders.POST_FS : ''
    });
    const safeTarget = packedTarget ? V.escapeJsonForHtml(packedTarget) : 'null';
    const safePoster = posterUrl ? V.escapeJsonForHtml(posterUrl) : '""';
    const safeOpts = V.escapeJsonForHtml({
      role: opts.role,
      pointerMode: opts.pointerMode,
      scrollReact: opts.scrollReact,
      reducedMotion: opts.reducedMotion,
      autoPause: Boolean(opts.autoPause),
      maxDpr: opts.maxDpr || 2
    });

    const postBlock = features.needsPost ? `
function makeTarget(gl, w, h, hdr) {
  var sw = Math.max(2, w | 0), sh = Math.max(2, h | 0);
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, sw, sh, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, sw, sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  var fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (hdr && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, sw, sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { tex: tex, fb: fb, w: sw, h: sh };
}
function delTarget(gl, t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }
function probeHdr(gl) {
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return false;
  gl.getExtension('OES_texture_half_float_linear');
  var t = makeTarget(gl, 2, 2, true);
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
  var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  delTarget(gl, t);
  return ok;
}` : '';

    const targetBlock = (features.target || features.photo) ? `
function decodeTargets(gl, packed) {
  var T = 256, total = T * T;
  var tBuf = new Uint8Array(total * 4);
  var pBuf = new Uint8Array(total * 4);
  if (packed && packed.data && packed.count > 0) {
    var bin = atob(packed.data);
    var stride = packed.hasPhoto ? 6 : 3;
    var n = Math.min(packed.count, Math.floor(bin.length / stride));
    for (var i = 0; i < total; i++) {
      var s = (i % n) * stride;
      var d = i * 4;
      tBuf[d] = bin.charCodeAt(s);
      tBuf[d + 1] = bin.charCodeAt(s + 1);
      tBuf[d + 2] = bin.charCodeAt(s + 2);
      tBuf[d + 3] = 255;
      if (packed.hasPhoto) {
        pBuf[d] = bin.charCodeAt(s + 3);
        pBuf[d + 1] = bin.charCodeAt(s + 4);
        pBuf[d + 2] = bin.charCodeAt(s + 5);
        pBuf[d + 3] = 255;
      }
    }
  }
  function makeNear(buf) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, T, T, 0, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }
  return { targetTex: makeNear(tBuf), photoTex: makeNear(pBuf), hasPhoto: packed && packed.hasPhoto ? 1 : 0 };
}` : '';

    return `const RECIPE = ${safeRecipe};
const STATES = ${safeStates};
const SHADERS = ${safeShaders};
const PACKED_TARGET = ${safeTarget};
const POSTER = ${safePoster};
const DEFAULTS = ${safeOpts};
const HEX_RE = /^#[0-9a-f]{6}$/i;
const QUAD_VERTS = new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]);

function clamp(v, lo, hi, fb) {
  var n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb;
}
function hexRgb(hex, out) {
  var c = typeof hex === 'string' && HEX_RE.test(hex) ? hex : '#ffffff';
  out[0] = parseInt(c.slice(1, 3), 16) / 255;
  out[1] = parseInt(c.slice(3, 5), 16) / 255;
  out[2] = parseInt(c.slice(5, 7), 16) / 255;
  return out;
}
function prng(seed) {
  var a = (seed | 0) || 1337;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function compile(gl, type, src) {
  var s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    var log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(log);
  }
  return s;
}
function link(gl, vs, fs, tf) {
  var p = gl.createProgram();
  var v = compile(gl, gl.VERTEX_SHADER, vs);
  var f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  if (tf) gl.transformFeedbackVaryings(p, tf, gl.SEPARATE_ATTRIBS);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    var log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(log);
  }
  return p;
}
function locs(gl, p, names) {
  var o = {};
  for (var i = 0; i < names.length; i++) o[names[i]] = gl.getUniformLocation(p, names[i]);
  return o;
}
${postBlock}
${targetBlock}

function mount(container, userOpts) {
  var host = typeof container === 'string' ? document.querySelector(container) : container;
  if (!host) throw new Error('Vortex mount target not found.');
  var cfg = Object.assign({}, DEFAULTS, userOpts || {});
  var st = Object.assign({}, RECIPE);
  var isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  var maxDots = Math.max(20000, Math.min(240000, Math.round(st.dots * 1000 * (isMobile ? 0.55 : 1))));

  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;' + (cfg.role === 'background' ? 'pointer-events:none;' : 'touch-action:none;');
  if (POSTER) {
    canvas.style.backgroundImage = 'url(' + POSTER + ')';
    canvas.style.backgroundSize = 'cover';
    canvas.style.backgroundPosition = 'center';
  }
  host.appendChild(canvas);

  var gl = canvas.getContext('webgl2', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance'
  });
  if (!gl) {
    return {
      play: function () {}, pause: function () {}, setState: function () {},
      setProgress: function () {}, setParams: function () {}, setTheme: function () {},
      trigger: function () {}, resize: function () {},
      complete: function () { return Promise.resolve(); },
      destroy: function () { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    };
  }

  var initPos = new Float32Array(maxDots * 4);
  var initVel = new Float32Array(maxDots * 4);
  function seedData() {
    var rnd = prng(st.seed);
    for (var i = 0; i < maxDots; i++) {
      var u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(Math.max(0, 1 - u * u));
      var r = 0.25 + Math.pow(rnd(), 0.7) * 0.75, idx = i * 4;
      initPos[idx] = s * Math.cos(th) * r;
      initPos[idx + 1] = s * Math.sin(th) * r;
      initPos[idx + 2] = u * r;
      initPos[idx + 3] = rnd();
      initVel[idx] = -initPos[idx + 2] * 0.5;
      initVel[idx + 1] = initPos[idx] * 0.2;
      initVel[idx + 2] = initPos[idx] * 0.5;
      initVel[idx + 3] = rnd();
    }
  }
  seedData();

  var simP, renP, uS, uR, posV, velV, sVao, rVao, qVbo, tgtRes = null;
  var fadeP = null, downP = null, upP = null, postP = null, uF = null, uD = null, uU = null, uP = null, eVao = null, fbos = null, useHdr = false;

  function buildGpu() {
    simP = link(gl, SHADERS.sv, SHADERS.sf, ['vPos', 'vVel']);
    renP = link(gl, SHADERS.rv, SHADERS.rf);
    uS = locs(gl, simP, ['uDt','uTime','uPointer','uClickForce','uCurl','uFreq','uSwirl','uShape','uWind','uSilk','uFlowDir','uFlowOffset','uSpinVec','uTwinCenter','uFormParams','uIntegrator','uLoopSec','uLayerMode','uSeed','uProgress','uTargetTex']);
    uR = locs(gl, renP, ['uPx','uProjScale','uTime','uShutter','uZoom','uContrast','uOpacity','uCamTrig','uBgCol','uBgLum','uColDark','uColMid','uColBright','uColorDriver','uHueDrift','uMixMode','uDotShape','uLight1Col','uLight2Col','uLight3Col','uLightDir','uLight3Dir','uLight1Power','uRimPower','uLight3Power','uLightPulse','uAudioHi','uMaterial','uSpecular','uDof','uFog','uAdditive','uLayerMode','uProgress','uHasPhoto','uPhotoTex']);
    posV = [gl.createBuffer(), gl.createBuffer()];
    velV = [gl.createBuffer(), gl.createBuffer()];
    sVao = [gl.createVertexArray(), gl.createVertexArray()];
    rVao = [gl.createVertexArray(), gl.createVertexArray()];
    qVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qVbo);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTS, gl.STATIC_DRAW);
    for (var i = 0; i < 2; i++) {
      gl.bindBuffer(gl.ARRAY_BUFFER, posV[i]); gl.bufferData(gl.ARRAY_BUFFER, initPos, gl.DYNAMIC_COPY);
      gl.bindBuffer(gl.ARRAY_BUFFER, velV[i]); gl.bufferData(gl.ARRAY_BUFFER, initVel, gl.DYNAMIC_COPY);
      gl.bindVertexArray(sVao[i]);
      gl.bindBuffer(gl.ARRAY_BUFFER, posV[i]); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, velV[i]); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(rVao[i]);
      gl.bindBuffer(gl.ARRAY_BUFFER, qVbo); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, posV[i]); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, velV[i]); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(2, 1);
    }
    gl.bindVertexArray(null);
    ${(features.target || features.photo) ? 'tgtRes = decodeTargets(gl, PACKED_TARGET);' : ''}
    ${features.needsPost ? `useHdr = probeHdr(gl);
    eVao = gl.createVertexArray();
    postP = link(gl, SHADERS.qv, SHADERS.pf);
    uP = locs(gl, postP, ['uScene','uGlowTex','uGlow','uSplit','uGrain','uTime','uMirror','uMirrorSpin','uLens','uInvert','uMonoInvert','uTransparent','uFlip','uToneMap','uTexel','uBgCol']);
    ${features.trails ? `fadeP = link(gl, SHADERS.qv, SHADERS.ff); uF = locs(gl, fadeP, ['uPrev','uBgCol','uDecay','uTransparent']);` : ''}
    ${features.bloom ? `downP = link(gl, SHADERS.qv, SHADERS.kd); upP = link(gl, SHADERS.qv, SHADERS.ku); uD = locs(gl, downP, ['uTex','uHalfPx']); uU = locs(gl, upP, ['uTex','uHalfPx']);` : ''}` : ''}
  }
  buildGpu();

  var bgC = new Float32Array(3), dC = new Float32Array(3), mC = new Float32Array(3), bC = new Float32Array(3);
  var l1C = new Float32Array(3), l2C = new Float32Array(3), l3C = new Float32Array(3);
  function syncPal() {
    hexRgb(st.bg, bgC); hexRgb(st.dark, dC); hexRgb(st.mid, mC); hexRgb(st.bright, bC);
    hexRgb(st.light1Col, l1C); hexRgb(st.light2Col, l2C); hexRgb(st.light3Col, l3C);
  }
  syncPal();

  var ping = 0, simT = 0, lastMs = 0, aspect = 1, yaw = 0, pitch = 0, rafId = 0;
  var paused = false, hidden = false, offscreen = false, lost = false, dead = false, drawnFirst = false;
  var reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ptr = { x: 0, y: 0, s: 0 }, clickF = 0, blast = 0, flash = 0, kick = 0, flipT = 0;
  var progVal = 0, scrollVal = 0, stateName = 'idle', dotScale = 1, fpsAcc = 0, fpsCnt = 0;
  var sb = { speedMul: 1, zoomOff: 0, glowOff: 0, light1Mul: 1, rimOff: 0, pulseOff: 0, swirlOff: 0, curlOff: 0, hueOff: 0 };

  function resizeFbos(w, h) {
    ${features.needsPost ? `if (fbos) { delTarget(gl, fbos.t0); delTarget(gl, fbos.t1); delTarget(gl, fbos.m1); delTarget(gl, fbos.m2); delTarget(gl, fbos.bo); }
    var m1w = Math.max(2, w >> 1), m1h = Math.max(2, h >> 1), m2w = Math.max(2, w >> 2), m2h = Math.max(2, h >> 2);
    fbos = {
      t0: makeTarget(gl, w, h, useHdr),
      t1: makeTarget(gl, w, h, useHdr),
      m1: ${features.bloom ? 'makeTarget(gl, m1w, m1h, useHdr)' : 'null'},
      m2: ${features.bloom ? 'makeTarget(gl, m2w, m2h, useHdr)' : 'null'},
      bo: ${features.bloom ? 'makeTarget(gl, m1w, m1h, useHdr)' : 'null'},
      idx: 0
    };
    var isT = st.bgMode === 3;
    gl.clearColor(isT ? 0 : bgC[0], isT ? 0 : bgC[1], isT ? 0 : bgC[2], isT ? 0 : 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.t0.fb); gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.t1.fb); gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);` : ''}
  }

  function resize() {
    if (dead || lost) return;
    var r = host.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    var dpr = Math.min(window.devicePixelRatio || 1, cfg.maxDpr || 2);
    var w = Math.max(2, Math.round(r.width * dpr) & ~1);
    var h = Math.max(2, Math.round(r.height * dpr) & ~1);
    if (w * h > 3840 * 2160) {
      var k = Math.sqrt((3840 * 2160) / (w * h));
      w = Math.max(2, Math.floor(w * k) & ~1);
      h = Math.max(2, Math.floor(h * k) & ~1);
    }
    if (canvas.width === w && canvas.height === h && fbos) return;
    canvas.width = w; canvas.height = h;
    drawnFirst = false;
    aspect = w / h;
    gl.viewport(0, 0, w, h);
    resizeFbos(w, h);
  }
  resize();

  function drawScene(count) {
    var a1 = st.lightMode === 2 ? st.lightAngle : (simT * 0.28 + st.lightAngle);
    var lx = st.lightMode === 1 ? ptr.x : Math.cos(a1);
    var ly = st.lightMode === 1 ? ptr.y : (st.lightMode === 2 ? Math.sin(st.lightAngle) : 0.65);
    var lz = st.lightMode === 1 ? 0.75 : (st.lightMode === 2 ? 0.7 : Math.sin(a1) + 0.6);
    var il = 1 / (Math.hypot(lx, ly, lz) || 1);
    var a3 = -simT * 0.42 + st.lightAngle + 2.2;
    var l3x = Math.cos(a3), l3y = Math.sin(a3 * 0.7) * 0.8 - 0.3, l3z = Math.sin(a3) + 0.5;
    var il3 = 1 / (Math.hypot(l3x, l3y, l3z) || 1);
    var eYaw = yaw + scrollVal * st.scrollReact * 1.4;
    var ePit = clamp(pitch + (scrollVal - 0.5) * st.scrollReact * 0.4, -1.35, 1.35, pitch);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(renP);
    gl.uniform2f(uR.uPx, 2 / Math.max(canvas.width, 1), 2 / Math.max(canvas.height, 1));
    gl.uniform2f(uR.uProjScale, aspect >= 1 ? 1 / aspect : 1, aspect >= 1 ? 1 : aspect);
    gl.uniform1f(uR.uTime, simT);
    gl.uniform1f(uR.uShutter, st.shutter);
    gl.uniform1f(uR.uZoom, st.zoom + sb.zoomOff + kick);
    gl.uniform1f(uR.uContrast, st.contrast);
    gl.uniform1f(uR.uOpacity, st.opacity);
    gl.uniform4f(uR.uCamTrig, Math.cos(eYaw), Math.sin(eYaw), Math.cos(ePit), Math.sin(ePit));
    gl.uniform3f(uR.uBgCol, bgC[0], bgC[1], bgC[2]);
    gl.uniform1f(uR.uBgLum, bgC[0] * 0.299 + bgC[1] * 0.587 + bgC[2] * 0.114);
    gl.uniform3f(uR.uColDark, dC[0], dC[1], dC[2]);
    gl.uniform3f(uR.uColMid, mC[0], mC[1], mC[2]);
    gl.uniform3f(uR.uColBright, bC[0], bC[1], bC[2]);
    gl.uniform1i(uR.uColorDriver, st.colorDriver);
    gl.uniform1f(uR.uHueDrift, st.hueDrift + sb.hueOff);
    gl.uniform1i(uR.uMixMode, st.mixMode);
    gl.uniform1i(uR.uDotShape, st.dotShape);
    gl.uniform3f(uR.uLight1Col, l1C[0], l1C[1], l1C[2]);
    gl.uniform3f(uR.uLight2Col, l2C[0], l2C[1], l2C[2]);
    gl.uniform3f(uR.uLight3Col, l3C[0], l3C[1], l3C[2]);
    gl.uniform3f(uR.uLightDir, lx * il, ly * il, lz * il);
    gl.uniform3f(uR.uLight3Dir, l3x * il3, l3y * il3, l3z * il3);
    gl.uniform1f(uR.uLight1Power, st.light1 * sb.light1Mul);
    gl.uniform1f(uR.uRimPower, st.rim + sb.rimOff);
    gl.uniform1f(uR.uLight3Power, st.light3);
    gl.uniform1f(uR.uLightPulse, Math.min(1, st.pulse + sb.pulseOff));
    gl.uniform1f(uR.uAudioHi, 0);
    gl.uniform1i(uR.uMaterial, st.material);
    gl.uniform1f(uR.uSpecular, st.specular);
    gl.uniform1f(uR.uDof, st.dof);
    gl.uniform1f(uR.uFog, st.fog);
    gl.uniform1f(uR.uAdditive, st.additive);
    gl.uniform1i(uR.uLayerMode, st.layerMode);
    gl.uniform1f(uR.uProgress, progVal);
    ${features.photo ? 'if (tgtRes) { gl.uniform1i(uR.uHasPhoto, tgtRes.hasPhoto); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tgtRes.photoTex); gl.uniform1i(uR.uPhotoTex, 2); }' : ''}
    gl.bindVertexArray(rVao[ping]);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  function frame(now) {
    if (dead) return;
    rafId = requestAnimationFrame(frame);
    if (paused || hidden || offscreen || lost || canvas.width < 2 || canvas.height < 2) { lastMs = 0; return; }
    var dt = lastMs > 0 ? Math.min(0.05, Math.max(0.001, (now - lastMs) * 0.001)) : 1 / 60;
    lastMs = now;
    if (reduced && cfg.reducedMotion === 'static' && drawnFirst) return;
    var motionMul = reduced ? 0.28 : 1;

    fpsAcc += dt; fpsCnt++;
    if (fpsAcc >= 0.8) {
      var fps = fpsCnt / fpsAcc;
      if (fps < 30) dotScale = Math.max(0.4, dotScale * 0.85);
      else if (fps > 52) dotScale = Math.min(1, dotScale + 0.05);
      fpsAcc = 0; fpsCnt = 0;
    }

    var tgt = STATES[stateName] || STATES.idle;
    var sk = 1 - Math.exp(-5.5 * dt);
    sb.speedMul += ((tgt.speed ? tgt.speed / Math.max(Math.abs(st.speed), 0.5) : 1) - sb.speedMul) * sk;
    sb.zoomOff += ((tgt.zoom ? tgt.zoom - st.zoom : 0) - sb.zoomOff) * sk;
    sb.glowOff += ((tgt.glow ? Math.max(0, tgt.glow - st.glow) : 0) - sb.glowOff) * sk;
    sb.light1Mul += ((tgt.light1 ? tgt.light1 / Math.max(st.light1, 0.4) : 1) - sb.light1Mul) * sk;
    sb.rimOff += ((tgt.rim ? Math.max(0, tgt.rim - st.rim) : 0) - sb.rimOff) * sk;
    sb.pulseOff += ((tgt.pulse || 0) - sb.pulseOff) * sk;
    sb.swirlOff += ((tgt.swirl ? Math.max(0, tgt.swirl - st.swirl) : 0) - sb.swirlOff) * sk;
    sb.curlOff += ((tgt.curl ? Math.max(0, tgt.curl - st.curl) : 0) - sb.curlOff) * sk;
    sb.hueOff += ((tgt.hueDrift || 0) - sb.hueOff) * sk;

    var dk = Math.pow(0.9, dt * 60);
    ptr.s *= dk; blast *= Math.pow(0.86, dt * 60); flash *= Math.pow(0.82, dt * 60); kick *= Math.pow(0.86, dt * 60);
    if (flipT > 0) flipT = Math.max(0, flipT - dt);

    var count = Math.max(20000, Math.min(maxDots, Math.round(maxDots * dotScale)));
    yaw += dt * st.orbit * motionMul;
    var effSp = st.speed * sb.speedMul * motionMul;
    if (Math.abs(effSp) > 0.001) {
      var sDt = dt * Math.abs(effSp), fDir = st.speed < 0 ? -1 : 1;
      simT += sDt * fDir;
      var ph = simT * 0.35;
      var sw = (st.swirl + sb.swirlOff) * (1 + 0.45 * Math.sin(simT * 0.6)) * fDir;
      var sx = Math.sin(simT * 0.29), sy = Math.cos(simT * 0.21) * 0.8 + 0.4, sz = Math.cos(simT * 0.37);
      var si = sw / (Math.hypot(sx, sy, sz) || 1);
      var pong = 1 - ping;
      gl.useProgram(simP);
      gl.uniform1f(uS.uDt, sDt); gl.uniform1f(uS.uTime, simT);
      gl.uniform3f(uS.uPointer, ptr.x * Math.cos(-yaw), ptr.y, ptr.s);
      gl.uniform1f(uS.uClickForce, clickF + blast);
      gl.uniform1f(uS.uCurl, st.curl + sb.curlOff);
      gl.uniform1f(uS.uFreq, st.freq + 0.35 * Math.sin(ph * 0.9));
      gl.uniform1f(uS.uSwirl, sw); gl.uniform1i(uS.uShape, st.shape);
      gl.uniform2f(uS.uWind, st.wind, st.gravity); gl.uniform1f(uS.uSilk, st.silk);
      gl.uniform1f(uS.uFlowDir, fDir);
      gl.uniform3f(uS.uFlowOffset, Math.sin(ph * 0.7) * 1.4, Math.cos(ph * 0.5) * 1.4, Math.sin(ph * 0.3) * 1.4);
      gl.uniform3f(uS.uSpinVec, sx * si, sy * si, sz * si);
      gl.uniform3f(uS.uTwinCenter, Math.cos(simT * 0.45) * 0.52, Math.sin(simT * 0.45) * 0.52, 0.078);
      gl.uniform4f(uS.uFormParams, st.formA, st.formB, st.formC, st.surfaceFlow);
      gl.uniform1i(uS.uIntegrator, st.integrator); gl.uniform1f(uS.uLoopSec, st.loopSec);
      gl.uniform1i(uS.uLayerMode, st.layerMode); gl.uniform1f(uS.uSeed, st.seed);
      gl.uniform1f(uS.uProgress, progVal);
      ${features.target ? 'if (tgtRes) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tgtRes.targetTex); gl.uniform1i(uS.uTargetTex, 0); }' : ''}
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.bindVertexArray(sVao[ping]);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, posV[pong]);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, velV[pong]);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.endTransformFeedback();
      gl.bindVertexArray(null);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, null);
      gl.disable(gl.RASTERIZER_DISCARD);
      ping = pong;
    }

    ${features.needsPost ? `var isT = st.bgMode === 3;
    var rT = fbos.idx === 0 ? fbos.t0 : fbos.t1, wT = fbos.idx === 0 ? fbos.t1 : fbos.t0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, wT.fb); gl.viewport(0, 0, wT.w, wT.h);
    ${features.trails ? `if (st.trails > 0.001) {
      gl.useProgram(fadeP); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rT.tex);
      gl.uniform1i(uF.uPrev, 0); gl.uniform3f(uF.uBgCol, bgC[0], bgC[1], bgC[2]);
      gl.uniform1f(uF.uDecay, Math.pow(st.trails, dt * 60)); gl.uniform1f(uF.uTransparent, isT ? 1 : 0);
      gl.bindVertexArray(eVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {` : ''}
    gl.clearColor(isT ? 0 : bgC[0], isT ? 0 : bgC[1], isT ? 0 : bgC[2], isT ? 0 : 1); gl.clear(gl.COLOR_BUFFER_BIT);
    ${features.trails ? '}' : ''}
    drawScene(count);
    ${features.bloom ? `gl.bindVertexArray(eVao); gl.useProgram(downP); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(uD.uTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.m1.fb); gl.viewport(0, 0, fbos.m1.w, fbos.m1.h);
    gl.bindTexture(gl.TEXTURE_2D, wT.tex); gl.uniform2f(uD.uHalfPx, 0.5 / wT.w, 0.5 / wT.h); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.m2.fb); gl.viewport(0, 0, fbos.m2.w, fbos.m2.h);
    gl.bindTexture(gl.TEXTURE_2D, fbos.m1.tex); gl.uniform2f(uD.uHalfPx, 0.5 / fbos.m1.w, 0.5 / fbos.m1.h); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(upP); gl.uniform1i(uU.uTex, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.bo.fb); gl.viewport(0, 0, fbos.bo.w, fbos.bo.h);
    gl.bindTexture(gl.TEXTURE_2D, fbos.m2.tex); gl.uniform2f(uU.uHalfPx, 0.5 / fbos.m2.w, 0.5 / fbos.m2.h); gl.drawArrays(gl.TRIANGLES, 0, 3);` : ''}
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(postP); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, wT.tex); gl.uniform1i(uP.uScene, 0);
    ${features.bloom ? 'gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fbos.bo.tex); gl.uniform1i(uP.uGlowTex, 1);' : ''}
    gl.uniform1f(uP.uGlow, Math.min(1.4, st.glow + sb.glowOff)); gl.uniform1f(uP.uSplit, st.split);
    gl.uniform1f(uP.uGrain, st.grain); gl.uniform1f(uP.uTime, now * 0.001);
    gl.uniform1i(uP.uMirror, st.mirror); gl.uniform1f(uP.uMirrorSpin, st.mirrorSpin);
    gl.uniform1i(uP.uLens, st.lens); gl.uniform1f(uP.uInvert, flash); gl.uniform1f(uP.uMonoInvert, st.monoInvert);
    gl.uniform1f(uP.uTransparent, isT ? 1 : 0); gl.uniform1f(uP.uFlip, flipT > 0 ? 1 : 0);
    gl.uniform1i(uP.uToneMap, st.toneMap); gl.uniform2f(uP.uTexel, 1 / canvas.width, 1 / canvas.height);
    gl.uniform3f(uP.uBgCol, bgC[0], bgC[1], bgC[2]);
    gl.bindVertexArray(eVao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
    fbos.idx = 1 - fbos.idx;` : `var isT = st.bgMode === 3;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(isT ? 0 : bgC[0], isT ? 0 : bgC[1], isT ? 0 : bgC[2], isT ? 0 : 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawScene(count);`}
    if (!drawnFirst) { drawnFirst = true; canvas.style.backgroundImage = 'none'; }
  }

  function onPtrMove(e) {
    var r = canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    var nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    var ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
    ptr.x = aspect >= 1 ? nx * aspect : nx;
    ptr.y = aspect >= 1 ? ny : ny / aspect;
    ptr.s = 1;
  }
  function onEnter() { if (cfg.role === 'orb' && stateName === 'idle') stateName = 'hover'; }
  function onLeave() { if (cfg.role === 'orb' && stateName === 'hover') stateName = 'idle'; }
  function onClick() { if (cfg.role === 'orb' || cfg.role === 'logo') blast = -1.2; }
  function onScroll() {
    var r = host.getBoundingClientRect();
    var h = window.innerHeight || 1;
    scrollVal = clamp((h - r.top) / (h + r.height), 0, 1, 0);
  }
  function onVis() { hidden = document.hidden; if (hidden) lastMs = 0; }
  function onLost(e) { e.preventDefault(); lost = true; }
  function onRestore() { if (dead) return; lost = false; seedData(); buildGpu(); fbos = null; resize(); }

  var ptrTarget = cfg.pointerMode === 'window' ? window : (cfg.pointerMode === 'local' ? canvas : null);
  if (ptrTarget) ptrTarget.addEventListener('pointermove', onPtrMove, { passive: true });
  if (cfg.role === 'orb' || cfg.role === 'logo') {
    canvas.addEventListener('pointerenter', onEnter);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onClick);
  }
  if (cfg.scrollReact > 0.001) { window.addEventListener('scroll', onScroll, { passive: true }); onScroll(); }
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestore);

  var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(host); else window.addEventListener('resize', resize);
  var io = cfg.autoPause && typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(function (es) { offscreen = !es[0].isIntersecting; }, { threshold: 0.01 })
    : null;
  if (io) io.observe(host);

  rafId = requestAnimationFrame(frame);

  return {
    play: function () { paused = false; },
    pause: function () { paused = true; },
    setState: function (name) { stateName = Object.prototype.hasOwnProperty.call(STATES, name) ? name : 'idle'; },
    setProgress: function (v) { progVal = clamp(v, 0, 1, progVal); },
    setParams: function (patch) {
      if (!patch || typeof patch !== 'object') return;
      var keys = Object.keys(patch);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!Object.prototype.hasOwnProperty.call(st, k)) continue;
        if (typeof st[k] === 'number' && Number.isFinite(Number(patch[k]))) st[k] = Number(patch[k]);
        else if (typeof st[k] === 'string' && HEX_RE.test(patch[k])) st[k] = patch[k];
      }
      syncPal();
    },
    setTheme: function (pal) { this.setParams(pal); },
    trigger: function (kind) {
      if (kind === 'blast') blast = -1.6;
      else if (kind === 'flash') flash = 1;
      else if (kind === 'kick') kick = 0.7;
      else if (kind === 'flip') flipT = 0.25;
    },
    complete: function () {
      blast = -1.8; flash = 0.6;
      return new Promise(function (resolve) {
        canvas.style.transition = 'opacity 480ms ease';
        setTimeout(function () { canvas.style.opacity = '0'; }, 180);
        setTimeout(resolve, 680);
      });
    },
    resize: resize,
    destroy: function () {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(rafId);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
      if (io) io.disconnect();
      if (ptrTarget) ptrTarget.removeEventListener('pointermove', onPtrMove);
      canvas.removeEventListener('pointerenter', onEnter);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onClick);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestore);
      for (var i = 0; i < 2; i++) {
        gl.deleteBuffer(posV[i]); gl.deleteBuffer(velV[i]);
        gl.deleteVertexArray(sVao[i]); gl.deleteVertexArray(rVao[i]);
      }
      gl.deleteBuffer(qVbo);
      gl.deleteProgram(simP); gl.deleteProgram(renP);
      if (tgtRes) { gl.deleteTexture(tgtRes.targetTex); gl.deleteTexture(tgtRes.photoTex); }
      ${features.needsPost ? `if (fbos) { delTarget(gl, fbos.t0); delTarget(gl, fbos.t1); delTarget(gl, fbos.m1); delTarget(gl, fbos.m2); delTarget(gl, fbos.bo); }
      if (eVao) gl.deleteVertexArray(eVao);
      if (fadeP) gl.deleteProgram(fadeP);
      if (downP) gl.deleteProgram(downP);
      if (upP) gl.deleteProgram(upP);
      if (postP) gl.deleteProgram(postP);` : ''}
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  };
}`;
  }

  function buildComponentBundle(core, tag) {
    const tagJson = V.escapeJsonForHtml(tag);
    return `// Vortex Studio Drop-In Script + <${tag}> Web Component
(function (root) {
${core}
class VortexEl extends HTMLElement {
  static get observedAttributes() { return ['state', 'progress', 'paused']; }
  connectedCallback() {
    if (this._ctrl) return;
    this.style.display = this.style.display || 'block';
    this._ctrl = mount(this, { role: this.getAttribute('role') || DEFAULTS.role });
    if (this.hasAttribute('state')) this._ctrl.setState(this.getAttribute('state'));
    if (this.hasAttribute('progress')) this._ctrl.setProgress(Number(this.getAttribute('progress')));
    if (this.hasAttribute('paused')) this._ctrl.pause();
  }
  attributeChangedCallback(name, _o, val) {
    if (!this._ctrl) return;
    if (name === 'state') this._ctrl.setState(val || 'idle');
    else if (name === 'progress') this._ctrl.setProgress(Number(val));
    else if (name === 'paused') { if (val !== null) this._ctrl.pause(); else this._ctrl.play(); }
  }
  disconnectedCallback() { if (this._ctrl) { this._ctrl.destroy(); this._ctrl = null; } }
  get controller() { return this._ctrl; }
}
if (typeof customElements !== 'undefined' && !customElements.get(${tagJson})) {
  customElements.define(${tagJson}, VortexEl);
}
root.VortexAsset = { mount: mount, RECIPE: RECIPE };
})(typeof window !== 'undefined' ? window : globalThis);
`;
  }

  function escapeScriptBody(js) {
    return js.replace(/<\/script/gi, '<\\/script');
  }

  function createExporter(engine) {
    function generate(userOpts) {
      const opts = Object.assign({
        format: 'esm',
        role: V.state.embedRole || 'background',
        tagName: 'vortex-scene',
        compact: true,
        includePoster: true,
        pointerMode: V.state.pointerMode || 'local',
        scrollReact: V.state.scrollReact,
        reducedMotion: V.state.reducedMotion || 'calm',
        autoPause: true
      }, userOpts || {});

      const recipe = V.sanitizeRecipe(V.state);
      recipe.embedRole = opts.role;
      recipe.pointerMode = opts.pointerMode;
      recipe.scrollReact = opts.scrollReact;
      recipe.reducedMotion = opts.reducedMotion;

      const features = analyzeFeatures(recipe, engine.masks.hasCustomTarget, engine.masks.hasPhoto);
      const rawShaders = V.buildShaders(features);
      const shaders = opts.compact ? {
        SIM_VS: stripGlsl(rawShaders.SIM_VS),
        SIM_FS: stripGlsl(rawShaders.SIM_FS),
        RENDER_VS: stripGlsl(rawShaders.RENDER_VS),
        RENDER_FS: stripGlsl(rawShaders.RENDER_FS),
        QUAD_VS: stripGlsl(rawShaders.QUAD_VS),
        FADE_FS: stripGlsl(rawShaders.FADE_FS),
        KAWASE_DOWN_FS: stripGlsl(rawShaders.KAWASE_DOWN_FS),
        KAWASE_UP_FS: stripGlsl(rawShaders.KAWASE_UP_FS),
        POST_FS: stripGlsl(rawShaders.POST_FS)
      } : rawShaders;

      const packedTarget = (features.target || features.photo) ? engine.masks.exportPackedTarget(4096) : null;
      const poster = opts.includePoster ? engine.capturePoster(240) : '';
      const tag = safeTagName(opts.tagName);
      const coreRaw = buildRuntimeCore(recipe, features, shaders, opts, packedTarget, poster);
      const core = opts.compact ? compactJs(coreRaw) : coreRaw;
      const componentCode = buildComponentBundle(core, tag);

      let code = '';
      let filename = `vortex-${opts.role}.mjs`;
      let mime = 'application/javascript';
      let snippet = '';

      if (opts.format === 'json') {
        code = JSON.stringify({ version: 2, recipe, target: packedTarget }, null, opts.compact ? 0 : 2);
        filename = `vortex-${opts.role}.json`;
        mime = 'application/json';
        snippet = `// Load with shared Vortex runtime:\nVortexAsset.mount('#hero', recipeData);`;
      } else if (opts.format === 'esm') {
        code = `// Vortex Studio Standalone ES Module (${opts.role})\n${core}\nexport { mount, RECIPE };\nexport default mount;\n`;
        filename = `vortex-${opts.role}.mjs`;
        snippet = `import mount from './${filename}';\nconst fx = mount('#vortex-root');\n// fx.setState('active'); fx.setProgress(0.75); fx.destroy();`;
      } else if (opts.format === 'component') {
        code = componentCode;
        filename = `vortex-${opts.role}.js`;
        snippet = `<script src="./${filename}"></script>\n<${tag} role="${opts.role}" style="width:100%;height:420px"></${tag}>`;
      } else if (opts.format === 'react') {
        code = `// Vortex Studio React Component (SSR + StrictMode Safe)\nimport { useEffect, useRef } from 'react';\n${core}\nexport function VortexCanvas({ state = 'idle', progress = 0, paused = false, className = '', style, onReady }) {\n  const hostRef = useRef(null);\n  const ctrlRef = useRef(null);\n  useEffect(() => {\n    if (typeof window === 'undefined' || !hostRef.current) return;\n    const ctrl = mount(hostRef.current);\n    ctrlRef.current = ctrl;\n    if (onReady) onReady(ctrl);\n    return () => { ctrl.destroy(); ctrlRef.current = null; };\n  }, []);\n  useEffect(() => { if (ctrlRef.current) ctrlRef.current.setState(state); }, [state]);\n  useEffect(() => { if (ctrlRef.current) ctrlRef.current.setProgress(progress); }, [progress]);\n  useEffect(() => { if (ctrlRef.current) { if (paused) ctrlRef.current.pause(); else ctrlRef.current.play(); } }, [paused]);\n  return <div ref={hostRef} className={className} style={{ width: '100%', height: '100%', position: 'relative', ...style }} />;\n}\nexport { mount, RECIPE };\nexport default VortexCanvas;\n`;
        filename = 'VortexCanvas.jsx';
        snippet = `import VortexCanvas from './VortexCanvas';\n<VortexCanvas state="thinking" progress={0.6} style={{ height: 420 }} />`;
      } else {
        const isLight = recipe.bgMode === V.BG_MODE.WHITE;
        code = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width,initial-scale=1.0" />\n<title>Vortex Asset Preview</title>\n<style>*{margin:0;box-sizing:border-box}html,body{width:100%;height:100%;background:${isLight ? '#f4f4f6' : '#08090d'};overflow:hidden}${tag}{width:100vw;height:100vh}</style>\n</head>\n<body>\n<${tag} role="${opts.role}"></${tag}>\n<script>${escapeScriptBody(componentCode)}</script>\n</body>\n</html>`;
        filename = `vortex-${opts.role}.html`;
        mime = 'text/html';
        snippet = `Open ${filename} directly in any browser — zero external files required.`;
      }

      const bytes = new TextEncoder().encode(code).length;
      const gzipEstBytes = Math.round(bytes * 0.34);

      return { code, componentCode, tag, role: opts.role, filename, mime, bytes, gzipEstBytes, snippet };
    }

    function buildSandboxHtml(bundle, backdrop) {
      const tag = bundle.tag;
      const role = bundle.role;
      const bgCss = backdrop === 'light'
        ? '#f3f4f6;color:#111827'
        : (backdrop === 'gradient'
          ? 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#311042 100%);color:#f8fafc'
          : '#06070b;color:#f8fafc');
      const cardBg = backdrop === 'light' ? 'rgba(255,255,255,0.78);border:1px solid #d1d5db' : 'rgba(15,17,24,0.72);border:1px solid rgba(255,255,255,0.14)';

      let bodyMarkup = '';
      if (role === 'orb') {
        bodyMarkup = `<div class="center">
          <${tag} id="el" role="orb" style="width:280px;height:280px;border-radius:50%;overflow:hidden"></${tag}>
          <div class="bar">
            <button onclick="setS('idle')">Idle</button>
            <button onclick="setS('hover')">Hover</button>
            <button onclick="setS('thinking')">Thinking</button>
            <button onclick="setS('active')">Active</button>
            <button onclick="el.controller.trigger('blast')">Pulse</button>
          </div>
        </div>`;
      } else if (role === 'loader') {
        bodyMarkup = `<div class="center">
          <${tag} id="el" role="loader" style="width:260px;height:260px"></${tag}>
          <div class="bar">
            <input id="pr" type="range" min="0" max="1" step="0.01" value="0.35" oninput="el.controller.setProgress(Number(this.value));pv.textContent=Math.round(this.value*100)+'%'" />
            <span id="pv">35%</span>
            <button onclick="el.controller.complete().then(()=>{btn.textContent='Loaded!'})" id="btn">Complete()</button>
          </div>
        </div>`;
      } else if (role === 'widget') {
        bodyMarkup = `<div class="grid">
          <div class="card"><${tag} role="widget" style="width:100%;height:180px"></${tag}><p>Card Widget A</p></div>
          <div class="card"><${tag} role="widget" style="width:100%;height:180px"></${tag}><p>Multi-Instance B</p></div>
        </div>`;
      } else {
        bodyMarkup = `<${tag} id="el" role="${role}" style="position:fixed;inset:0;width:100vw;height:100vh;z-index:0"></${tag}>
        <main class="hero">
          <div class="card">
            <h1>Live Website Embed Test</h1>
            <p>Your exported JavaScript runs isolated with zero dependencies. Buttons remain clickable and scrolling drives parallax.</p>
            <div class="bar">
              <button onclick="el.controller.trigger('blast')">Trigger Blast</button>
              <button onclick="el.controller.setState('active')">Active State</button>
              <button onclick="el.controller.setState('idle')">Idle State</button>
            </div>
          </div>
          <div style="height:90vh"></div>
        </main>`;
      }

      return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
<style>
*{margin:0;box-sizing:border-box}
body{min-height:100vh;background:${bgCss};font:13px/1.5 system-ui,sans-serif;overflow-x:hidden}
.center{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px}
.hero{position:relative;z-index:2;max-width:560px;margin:18vh auto 0;padding:24px}
.card{background:${cardBg};backdrop-filter:blur(10px);padding:20px;border-radius:12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:32px;max-width:760px;margin:10vh auto}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
button{background:#18181b;color:#fff;border:1px solid #52525b;padding:6px 12px;border-radius:6px;cursor:pointer;font:12px monospace}
button:hover{background:#27272a}
h1{font-size:22px;margin-bottom:8px}
</style></head><body>${bodyMarkup}
<script>${escapeScriptBody(bundle.componentCode)}</script>
<script>var el=document.getElementById('el');function setS(s){if(el&&el.controller)el.controller.setState(s);}</script>
</body></html>`;
    }

    return { generate, buildSandboxHtml };
  }

  V.createExporter = createExporter;
})();