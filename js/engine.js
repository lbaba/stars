(() => {
  const V = window.VORTEX;

  const COLOR_KEYS = V.COLOR_KEYS;

  function createColorCache() {
    const cache = {};
    for (let i = 0; i < COLOR_KEYS.length; i++) {
      cache[COLOR_KEYS[i]] = { hex: '', rgb: new Float32Array(3) };
    }
    return cache;
  }

  function syncColors(cache, st) {
    for (let i = 0; i < COLOR_KEYS.length; i++) {
      const k = COLOR_KEYS[i];
      const entry = cache[k];
      if (entry.hex !== st[k]) {
        entry.hex = st[k];
        V.hexToRgbInto(st[k], entry.rgb);
      }
    }
  }

  function createEngine(canvas, audio, customState) {
    const st = customState || V.state;
    let gl = V.gl.createContext(canvas);
    let contextLost = false;
    let destroyed = false;

    const initPos = new Float32Array(V.MAX_DOTS * 4);
    const initVel = new Float32Array(V.MAX_DOTS * 4);

    function seedParticles() {
      const rand = V.mulberry32(st.seed);
      for (let i = 0; i < V.MAX_DOTS; i++) {
        const u = rand() * 2 - 1;
        const theta = rand() * Math.PI * 2;
        const s = Math.sqrt(Math.max(0, 1 - u * u));
        const r = 0.25 + Math.pow(rand(), 0.7) * 0.75;
        const idx = i * 4;
        initPos[idx]     = s * Math.cos(theta) * r;
        initPos[idx + 1] = s * Math.sin(theta) * r;
        initPos[idx + 2] = u * r;
        initPos[idx + 3] = rand();

        initVel[idx]     = -initPos[idx + 2] * 0.5;
        initVel[idx + 1] = initPos[idx] * 0.2;
        initVel[idx + 2] = initPos[idx] * 0.5;
        initVel[idx + 3] = rand();
      }
    }
    seedParticles();

    let simProg, renderProg, uSim, uRen, masks, post, bufs;

    function initGpu() {
      const S = V.SHADERS;
      simProg = V.gl.createProgram(gl, S.SIM_VS, S.SIM_FS, ['vPos', 'vVel']);
      renderProg = V.gl.createProgram(gl, S.RENDER_VS, S.RENDER_FS);

      uSim = V.gl.getUniforms(gl, simProg, {
        dt: 'uDt',
        time: 'uTime',
        pointer: 'uPointer',
        clickForce: 'uClickForce',
        curl: 'uCurl',
        freq: 'uFreq',
        swirl: 'uSwirl',
        shape: 'uShape',
        wind: 'uWind',
        silk: 'uSilk',
        flowDir: 'uFlowDir',
        flowOffset: 'uFlowOffset',
        spinVec: 'uSpinVec',
        twinCenter: 'uTwinCenter',
        formParams: 'uFormParams',
        integrator: 'uIntegrator',
        loopSec: 'uLoopSec',
        layerMode: 'uLayerMode',
        seed: 'uSeed',
        progress: 'uProgress',
        pins: 'uPins[0]',
        useCam: 'uUseCam',
        targetTex: 'uTargetTex',
        brushTex: 'uBrushTex',
        camTex: 'uCamTex'
      });

      uRen = V.gl.getUniforms(gl, renderProg, {
        px: 'uPx',
        projScale: 'uProjScale',
        time: 'uTime',
        shutter: 'uShutter',
        zoom: 'uZoom',
        contrast: 'uContrast',
        opacity: 'uOpacity',
        camTrig: 'uCamTrig',
        bgCol: 'uBgCol',
        bgLum: 'uBgLum',
        colDark: 'uColDark',
        colMid: 'uColMid',
        colBright: 'uColBright',
        colorDriver: 'uColorDriver',
        hueDrift: 'uHueDrift',
        mixMode: 'uMixMode',
        dotShape: 'uDotShape',
        light1Col: 'uLight1Col',
        light2Col: 'uLight2Col',
        light3Col: 'uLight3Col',
        lightDir: 'uLightDir',
        light3Dir: 'uLight3Dir',
        light1Power: 'uLight1Power',
        rimPower: 'uRimPower',
        light3Power: 'uLight3Power',
        lightPulse: 'uLightPulse',
        audioHi: 'uAudioHi',
        material: 'uMaterial',
        specular: 'uSpecular',
        dof: 'uDof',
        fog: 'uFog',
        additive: 'uAdditive',
        layerMode: 'uLayerMode',
        progress: 'uProgress',
        hasPhoto: 'uHasPhoto',
        photoTex: 'uPhotoTex'
      });

      masks = V.createMasks(gl);
      post = V.createPost(gl);
      bufs = V.gl.createParticleBuffers(gl, initPos, initVel);
    }

    initGpu();

    const onContextLost = e => {
      e.preventDefault();
      contextLost = true;
      V.showError('WebGL context lost; waiting for the browser to restore it.');
    };
    const onContextRestored = () => {
      if (destroyed) return;
      contextLost = false;
      V.hideError();
      masks.destroy();
      seedParticles();
      initGpu();
      setSize(canvas.width || 512, canvas.height || 512);
      masks.setWord(st.word);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const clock = V.createClock();
    const colors = createColorCache();
    syncColors(colors, st);

    let paused = false;
    let frozen = false;
    let toolMode = V.TOOL.ORBIT;
    let simTime = 0;
    let ping = 0;
    let aspect = 1;
    let camYaw = 0;
    let camPitch = 0;
    let clickForce = 0;
    let blastDecay = 0;
    let vjFlash = 0;
    let vjZoomKick = 0;
    let vjFlipTimer = 0;
    let vjGravDrop = 0;
    let progressVal = 0;
    let scrollVal = 0;

    let activeStateName = 'idle';
    const stateBlend = {
      speedMul: 1, zoomOff: 0, glowOff: 0, light1Mul: 1,
      rimOff: 0, pulseOff: 0, swirlOff: 0, curlOff: 0, hueOff: 0
    };

    const pins = new Float32Array(V.MAX_PINS * 4);
    let pinNext = 0;

    let presetA = null;
    let presetB = null;
    let morphing = false;
    let checkedErr = false;

    const pointer = { x: 0, y: 0, s: 0 };
    const lightDir = new Float32Array(3);
    const light3Dir = new Float32Array(3);
    const postParams = {
      w: 2, h: 2, bgRgb: colors.bg.rgb,
      trails: 0, glow: 0, split: 0, grain: 0,
      mirror: 0, mirrorSpin: 0, lens: 0, toneMap: 1,
      invert: 0, monoInvert: 0, transparent: 0,
      flip: 0, time: 0, dt: 1 / V.REF_FPS
    };

    let drawIdx = 0;
    let drawCount = V.MIN_DOTS;
    let drawAudio = audio ? audio.bands : [0, 0, 0];

    function setBackgroundMode(mode) {
      const BG = V.BG_MODE;
      st.bgMode = mode;
      if (mode === BG.BLACK || mode === BG.TRANSPARENT) st.bg = '#000000';
      else if (mode === BG.WHITE) st.bg = '#ffffff';
      const transparent = mode === BG.TRANSPARENT;
      const stage = document.getElementById('stage');
      if (stage) stage.classList.toggle('transparent', transparent);
      canvas.classList.toggle('transparent', transparent);
      clearTrails();
    }

    function clearTrails() {
      if (contextLost || destroyed) return;
      syncColors(colors, st);
      post.clearTrails(colors.bg.rgb, canvas.width, canvas.height, st.bgMode === V.BG_MODE.TRANSPARENT);
    }

    function setSize(w, h) {
      if (destroyed) return;
      canvas.width = Math.max(2, (w | 0) & ~1);
      canvas.height = Math.max(2, (h | 0) & ~1);
      aspect = canvas.width / canvas.height;
      if (contextLost) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      syncColors(colors, st);
      post.resize(canvas.width, canvas.height, colors.bg.rgb, st.bgMode === V.BG_MODE.TRANSPARENT);
    }

    function resetParticles() {
      if (contextLost || destroyed) return;
      seedParticles();
      for (let i = 0; i < 2; i++) {
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs.posVBO[i]);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, initPos);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs.velVBO[i]);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, initVel);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      camYaw = 0;
      camPitch = 0;
      simTime = 0;
      clearTrails();
    }

    function clearForces() {
      pins.fill(0);
      pinNext = 0;
      masks.clearBrush();
    }

    function addPin(nx, ny, power) {
      const idx = (pinNext % V.MAX_PINS) * 4;
      pins[idx] = nx;
      pins[idx + 1] = ny;
      pins[idx + 2] = power;
      pins[idx + 3] = 0;
      pinNext++;
    }

    function triggerVJ(key) {
      if (key === 1) vjFlash = 1.0;
      else if (key === 2) vjZoomKick = 0.7;
      else if (key === 3) vjFlipTimer = 0.25;
      else if (key === 4) vjGravDrop = -3.2;
      else if (key === 5) blastDecay = -1.8;
      else if (key === 6) frozen = !frozen;
      return frozen;
    }

    function setInteractiveState(name) {
      if (Object.prototype.hasOwnProperty.call(V.PRESET_STATES, name)) {
        activeStateName = name;
      } else {
        activeStateName = 'idle';
      }
    }

    function stepStateBlend(dt) {
      const target = V.PRESET_STATES[activeStateName] || V.PRESET_STATES.idle;
      const k = 1 - Math.exp(-5.5 * dt);
      const tSpeedMul = target.speed ? target.speed / Math.max(Math.abs(st.speed), 0.5) : 1;
      stateBlend.speedMul += (tSpeedMul - stateBlend.speedMul) * k;
      stateBlend.zoomOff += ((target.zoom ? target.zoom - st.zoom : 0) - stateBlend.zoomOff) * k;
      stateBlend.glowOff += ((target.glow ? Math.max(0, target.glow - st.glow) : 0) - stateBlend.glowOff) * k;
      stateBlend.light1Mul += ((target.light1 ? target.light1 / Math.max(st.light1, 0.4) : 1) - stateBlend.light1Mul) * k;
      stateBlend.rimOff += ((target.rim ? Math.max(0, target.rim - st.rim) : 0) - stateBlend.rimOff) * k;
      stateBlend.pulseOff += ((target.pulse || 0) - stateBlend.pulseOff) * k;
      stateBlend.swirlOff += ((target.swirl ? Math.max(0, target.swirl - st.swirl) : 0) - stateBlend.swirlOff) * k;
      stateBlend.curlOff += ((target.curl ? Math.max(0, target.curl - st.curl) : 0) - stateBlend.curlOff) * k;
      stateBlend.hueOff += ((target.hueDrift || 0) - stateBlend.hueOff) * k;
    }

    function updateLightDirs(t) {
      let lx, ly, lz;
      if (st.lightMode === 1) {
        lx = pointer.x;
        ly = pointer.y;
        lz = 0.75;
      } else if (st.lightMode === 2) {
        lx = Math.cos(st.lightAngle);
        ly = Math.sin(st.lightAngle);
        lz = 0.7;
      } else {
        const a = t * 0.28 + st.lightAngle;
        lx = Math.cos(a);
        ly = 0.65;
        lz = Math.sin(a) + 0.6;
      }
      const invLen = 1 / (Math.hypot(lx, ly, lz) || 1);
      lightDir[0] = lx * invLen;
      lightDir[1] = ly * invLen;
      lightDir[2] = lz * invLen;

      const a3 = -t * 0.42 + st.lightAngle + 2.2;
      const l3x = Math.cos(a3);
      const l3y = Math.sin(a3 * 0.7) * 0.8 - 0.3;
      const l3z = Math.sin(a3) + 0.5;
      const inv3 = 1 / (Math.hypot(l3x, l3y, l3z) || 1);
      light3Dir[0] = l3x * inv3;
      light3Dir[1] = l3y * inv3;
      light3Dir[2] = l3z * inv3;
    }

    function stepMorph(t) {
      if (!morphing || !presetA || !presetB) return;
      const k = Math.sin(t * 0.45) * 0.5 + 0.5;
      for (let i = 0; i < V.MORPH_NUM_KEYS.length; i++) {
        const key = V.MORPH_NUM_KEYS[i];
        st[key] = presetA[key] + (presetB[key] - presetA[key]) * k;
      }
      for (let i = 0; i < V.MORPH_COL_KEYS.length; i++) {
        const key = V.MORPH_COL_KEYS[i];
        st[key] = V.mixHexOklab(presetA[key], presetB[key], k);
      }
      st.shape = k < 0.5 ? presetA.shape : presetB.shape;
    }

    function stepSim(stepDt, activeCount, audioBands) {
      const flowDir = st.speed < 0 ? -1.0 : 1.0;
      simTime += stepDt * flowDir;
      stepMorph(simTime);

      const bass = audioBands[0];
      const mid = audioBands[1];
      const phase = simTime * 0.35;
      const freqEff = st.freq + 0.35 * Math.sin(phase * 0.9) + mid * 0.35;
      const swirlMag = (st.swirl + stateBlend.swirlOff + bass * 1.4) * (1.0 + 0.45 * Math.sin(simTime * 0.6)) * flowDir;

      const sx = Math.sin(simTime * 0.29);
      const sy = Math.cos(simTime * 0.21) * 0.8 + 0.4;
      const sz = Math.cos(simTime * 0.37);
      const sInv = swirlMag / (Math.hypot(sx, sy, sz) || 1);
      const twinAng = simTime * 0.45;

      // Rotate pointer back into world XY to account for camera orbit
      const cy = Math.cos(-camYaw);
      const syw = Math.sin(-camYaw);
      const ptrX = pointer.x * cy;
      const ptrY = pointer.y;

      const pong = 1 - ping;
      gl.useProgram(simProg);
      gl.uniform1f(uSim.dt, stepDt);
      gl.uniform1f(uSim.time, simTime);
      gl.uniform3f(uSim.pointer, ptrX, ptrY, pointer.s);
      gl.uniform1f(uSim.clickForce, clickForce + blastDecay);
      gl.uniform1f(uSim.curl, st.curl + stateBlend.curlOff + mid * 0.85);
      gl.uniform1f(uSim.freq, freqEff);
      gl.uniform1f(uSim.swirl, swirlMag);
      gl.uniform1i(uSim.shape, st.shape);
      gl.uniform2f(uSim.wind, st.wind, st.gravity + vjGravDrop);
      gl.uniform1f(uSim.silk, st.silk);
      gl.uniform1f(uSim.flowDir, flowDir);
      gl.uniform3f(
        uSim.flowOffset,
        Math.sin(phase * 0.7) * 1.4,
        Math.cos(phase * 0.5) * 1.4,
        Math.sin(phase * 0.3) * 1.4
      );
      gl.uniform3f(uSim.spinVec, sx * sInv, sy * sInv, sz * sInv);
      gl.uniform3f(uSim.twinCenter, Math.cos(twinAng) * 0.52, Math.sin(twinAng) * 0.52, 0.078);
      gl.uniform4f(uSim.formParams, st.formA, st.formB, st.formC, st.surfaceFlow);
      gl.uniform1i(uSim.integrator, st.integrator);
      gl.uniform1f(uSim.loopSec, st.loopSec);
      gl.uniform1i(uSim.layerMode, st.layerMode);
      gl.uniform1f(uSim.seed, st.seed);
      gl.uniform1f(uSim.progress, progressVal);
      gl.uniform4fv(uSim.pins, pins);
      gl.uniform1i(uSim.useCam, masks.camActive);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, masks.targetTex);
      gl.uniform1i(uSim.targetTex, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, masks.brushTex);
      gl.uniform1i(uSim.brushTex, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, masks.camTex);
      gl.uniform1i(uSim.camTex, 2);

      gl.enable(gl.RASTERIZER_DISCARD);
      gl.bindVertexArray(bufs.simVAO[ping]);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, bufs.posVBO[pong]);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, bufs.velVBO[pong]);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, activeCount);
      gl.endTransformFeedback();
      gl.bindVertexArray(null);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, null);
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
      gl.disable(gl.RASTERIZER_DISCARD);

      ping = pong;
    }

    function drawParticlesPass() {
      const bg = colors.bg.rgb;
      const colDark = colors.dark.rgb;
      const colMid = colors.mid.rgb;
      const colBright = colors.bright.rgb;
      const l1 = colors.light1Col.rgb;
      const l2 = colors.light2Col.rgb;
      const l3 = colors.light3Col.rgb;
      updateLightDirs(simTime);

      const projX = aspect >= 1 ? 1 / aspect : 1;
      const projY = aspect >= 1 ? 1 : aspect;
      const bgLum = bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114;
      const effYaw = camYaw + scrollVal * st.scrollReact * 1.4;
      const effPitch = V.clampVal(camPitch + (scrollVal - 0.5) * st.scrollReact * 0.4, -1.35, 1.35, camPitch);

      // Unified premultiplied Over + Plus blend state handles smoke, ink, and additive fire together
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(renderProg);
      gl.uniform2f(uRen.px, 2 / Math.max(canvas.width, 1), 2 / Math.max(canvas.height, 1));
      gl.uniform2f(uRen.projScale, projX, projY);
      gl.uniform1f(uRen.time, simTime);
      gl.uniform1f(uRen.shutter, st.shutter);
      gl.uniform1f(uRen.zoom, (st.zoom + stateBlend.zoomOff + vjZoomKick) * (1 + drawAudio[0] * 0.14));
      gl.uniform1f(uRen.contrast, st.contrast);
      gl.uniform1f(uRen.opacity, st.opacity);
      gl.uniform4f(uRen.camTrig, Math.cos(effYaw), Math.sin(effYaw), Math.cos(effPitch), Math.sin(effPitch));
      gl.uniform3f(uRen.bgCol, bg[0], bg[1], bg[2]);
      gl.uniform1f(uRen.bgLum, bgLum);
      gl.uniform3f(uRen.colDark, colDark[0], colDark[1], colDark[2]);
      gl.uniform3f(uRen.colMid, colMid[0], colMid[1], colMid[2]);
      gl.uniform3f(uRen.colBright, colBright[0], colBright[1], colBright[2]);
      gl.uniform1i(uRen.colorDriver, st.colorDriver);
      gl.uniform1f(uRen.hueDrift, st.hueDrift + stateBlend.hueOff);
      gl.uniform1i(uRen.mixMode, st.mixMode);
      gl.uniform1i(uRen.dotShape, st.dotShape);
      gl.uniform3f(uRen.light1Col, l1[0], l1[1], l1[2]);
      gl.uniform3f(uRen.light2Col, l2[0], l2[1], l2[2]);
      gl.uniform3f(uRen.light3Col, l3[0], l3[1], l3[2]);
      gl.uniform3f(uRen.lightDir, lightDir[0], lightDir[1], lightDir[2]);
      gl.uniform3f(uRen.light3Dir, light3Dir[0], light3Dir[1], light3Dir[2]);
      gl.uniform1f(uRen.light1Power, st.light1 * stateBlend.light1Mul);
      gl.uniform1f(uRen.rimPower, st.rim + stateBlend.rimOff);
      gl.uniform1f(uRen.light3Power, st.light3);
      gl.uniform1f(uRen.lightPulse, Math.min(1, st.pulse + stateBlend.pulseOff));
      gl.uniform1f(uRen.audioHi, drawAudio[2] * 0.35);
      gl.uniform1i(uRen.material, st.material);
      gl.uniform1f(uRen.specular, st.specular);
      gl.uniform1f(uRen.dof, st.dof);
      gl.uniform1f(uRen.fog, st.fog);
      gl.uniform1f(uRen.additive, st.additive);
      gl.uniform1i(uRen.layerMode, st.layerMode);
      gl.uniform1f(uRen.progress, progressVal);
      gl.uniform1i(uRen.hasPhoto, masks.hasPhoto);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, masks.photoTex);
      gl.uniform1i(uRen.photoTex, 2);

      gl.bindVertexArray(bufs.renderVAO[drawIdx]);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, drawCount);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }

    function tick(now, isOrbiting, onFps, onRecordEndFrame) {
      if (contextLost || destroyed) return;
      const frame = clock.tick(now, onFps);
      const rawDt = frame.rawDt;

      stepStateBlend(rawDt);
      pointer.s = clock.snapZero(pointer.s * clock.decay(0.94, rawDt));
      blastDecay = clock.snapZero(blastDecay * clock.decay(0.86, rawDt));
      vjFlash = clock.snapZero(vjFlash * clock.decay(0.82, rawDt));
      vjZoomKick = clock.snapZero(vjZoomKick * clock.decay(0.86, rawDt));
      vjGravDrop = clock.snapZero(vjGravDrop * clock.decay(0.88, rawDt));
      if (vjFlipTimer > 0) vjFlipTimer = Math.max(0, vjFlipTimer - rawDt);

      const audioBands = audio ? audio.sample(rawDt) : drawAudio;
      const activeCount = Math.max(
        V.MIN_DOTS,
        Math.min(V.MAX_DOTS, Math.round(st.dots * 1000 * frame.autoDotFactor))
      );

      masks.updateWebcam();
      masks.stepBrush(rawDt);

      if (!paused && !isOrbiting) {
        camYaw += rawDt * st.orbit;
      }

      const effSpeed = st.speed * stateBlend.speedMul;
      if (!paused && !frozen && Math.abs(effSpeed) > 0.001) {
        const stepDt = clock.consumeStep(rawDt * Math.abs(effSpeed), st.fpsStep);
        if (stepDt > 0) stepSim(stepDt, activeCount, audioBands);
      }

      syncColors(colors, st);
      drawIdx = ping;
      drawCount = activeCount;
      drawAudio = audioBands;

      postParams.w = canvas.width;
      postParams.h = canvas.height;
      postParams.bgRgb = colors.bg.rgb;
      postParams.trails = st.trails;
      postParams.glow = frame.autoSkipGlow ? 0 : Math.min(1.4, st.glow + stateBlend.glowOff);
      postParams.split = st.split + audioBands[2] * 0.25;
      postParams.grain = st.grain;
      postParams.mirror = st.mirror;
      postParams.mirrorSpin = st.mirrorSpin;
      postParams.lens = st.lens;
      postParams.toneMap = st.toneMap;
      postParams.invert = vjFlash;
      postParams.monoInvert = st.monoInvert;
      postParams.transparent = st.bgMode === V.BG_MODE.TRANSPARENT ? 1 : 0;
      postParams.flip = vjFlipTimer > 0 ? 1.0 : 0.0;
      postParams.time = now * 0.001;
      postParams.dt = rawDt;

      post.render(postParams, drawParticlesPass);

      if (onRecordEndFrame) onRecordEndFrame();

      if (!checkedErr) {
        checkedErr = true;
        const e = gl.getError();
        if (e !== gl.NO_ERROR) V.showError('Graphics error: 0x' + e.toString(16));
      }
    }

    function capturePoster(maxWidth) {
      if (contextLost || destroyed || !canvas.width || !canvas.height) return '';
      const scale = Math.min(1, (maxWidth || 280) / canvas.width);
      const pw = Math.max(2, Math.round(canvas.width * scale));
      const ph = Math.max(2, Math.round(canvas.height * scale));
      const tmp = document.createElement('canvas');
      tmp.width = pw;
      tmp.height = ph;
      const ctx = tmp.getContext('2d');
      if (!ctx) return '';
      try {
        ctx.drawImage(canvas, 0, 0, pw, ph);
        const webp = tmp.toDataURL('image/webp', 0.72);
        return webp.startsWith('data:image/webp') ? webp : tmp.toDataURL('image/png');
      } catch (_) {
        return '';
      }
    }

    function destroy(releaseContext) {
      if (destroyed) return;
      destroyed = true;
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (masks) masks.destroy();
      if (post) post.destroy();
      if (bufs) V.gl.destroyParticleBuffers(gl, bufs);
      if (simProg) gl.deleteProgram(simProg);
      if (renderProg) gl.deleteProgram(renderProg);
      if (releaseContext) {
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
    }

    return {
      get masks() { return masks; },
      get state() { return st; },
      pointer,
      setSize,
      clearTrails,
      setBackgroundMode,
      resetParticles,
      clearForces,
      addPin,
      triggerVJ,
      setInteractiveState,
      setProgress(v) { progressVal = V.clampVal(v, 0, 1, 0); },
      setScroll(v) { scrollVal = V.clampVal(v, 0, 1, 0); },
      capturePoster,
      tick,
      destroy,
      get aspect() { return aspect; },
      get paused() { return paused; },
      set paused(v) { paused = v; },
      get frozen() { return frozen; },
      set frozen(v) { frozen = v; },
      get toolMode() { return toolMode; },
      set toolMode(v) { toolMode = v; },
      get clickForce() { return clickForce; },
      set clickForce(v) { clickForce = v; },
      blast() { blastDecay = -1.6; },
      adjustCam(dx, dy) {
        camYaw += dx;
        camPitch = V.clampVal(camPitch + dy, -1.35, 1.35, camPitch);
      },
      resetAutoDots() { clock.resetAutoDots(); },
      setPresetA() { presetA = Object.assign({}, st); },
      setPresetB() { presetB = Object.assign({}, st); },
      toggleMorph() {
        if (!presetA) presetA = Object.assign({}, st);
        if (!presetB) presetB = Object.assign({}, st, V.LOOKS[4], { shape: 6 });
        morphing = !morphing;
        return morphing;
      }
    };
  }

  V.createEngine = createEngine;
})();