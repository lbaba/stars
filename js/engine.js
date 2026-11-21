(() => {
  const V = window.VORTEX;

  function createEngine(canvas, audio) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('WebGL2 is not supported in this browser.');

    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      V.showError('Graphics paused by system. Reload page to restore.');
    });

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }

    function createProgram(vsSrc, fsSrc, tfVaryings) {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
      if (tfVaryings) gl.transformFeedbackVaryings(p, tfVaryings, gl.SEPARATE_ATTRIBS);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    }

    const S = V.SHADERS;
    const simProg = createProgram(S.SIM_VS, S.SIM_FS, ['vPos', 'vVel']);
    const renderProg = createProgram(S.RENDER_VS, S.RENDER_FS);
    const fadeProg = createProgram(S.QUAD_VS, S.FADE_FS);
    const blurProg = createProgram(S.QUAD_VS, S.BLUR_FS);
    const postProg = createProgram(S.QUAD_VS, S.POST_FS);

    const uSim = {
      dt: gl.getUniformLocation(simProg, 'uDt'),
      time: gl.getUniformLocation(simProg, 'uTime'),
      pointer: gl.getUniformLocation(simProg, 'uPointer'),
      clickForce: gl.getUniformLocation(simProg, 'uClickForce'),
      curl: gl.getUniformLocation(simProg, 'uCurl'),
      freq: gl.getUniformLocation(simProg, 'uFreq'),
      swirl: gl.getUniformLocation(simProg, 'uSwirl'),
      shape: gl.getUniformLocation(simProg, 'uShape'),
      wind: gl.getUniformLocation(simProg, 'uWind'),
      silk: gl.getUniformLocation(simProg, 'uSilk'),
      audio: gl.getUniformLocation(simProg, 'uAudio'),
      flowDir: gl.getUniformLocation(simProg, 'uFlowDir'),
      pins: gl.getUniformLocation(simProg, 'uPins[0]'),
      useCam: gl.getUniformLocation(simProg, 'uUseCam'),
      targetTex: gl.getUniformLocation(simProg, 'uTargetTex'),
      brushTex: gl.getUniformLocation(simProg, 'uBrushTex'),
      camTex: gl.getUniformLocation(simProg, 'uCamTex')
    };

    const uRen = {
      res: gl.getUniformLocation(renderProg, 'uRes'),
      aspect: gl.getUniformLocation(renderProg, 'uAspect'),
      time: gl.getUniformLocation(renderProg, 'uTime'),
      shutter: gl.getUniformLocation(renderProg, 'uShutter'),
      zoom: gl.getUniformLocation(renderProg, 'uZoom'),
      contrast: gl.getUniformLocation(renderProg, 'uContrast'),
      opacity: gl.getUniformLocation(renderProg, 'uOpacity'),
      cam: gl.getUniformLocation(renderProg, 'uCam'),
      bgCol: gl.getUniformLocation(renderProg, 'uBgCol'),
      colDark: gl.getUniformLocation(renderProg, 'uColDark'),
      colMid: gl.getUniformLocation(renderProg, 'uColMid'),
      colBright: gl.getUniformLocation(renderProg, 'uColBright'),
      colorDriver: gl.getUniformLocation(renderProg, 'uColorDriver'),
      hueDrift: gl.getUniformLocation(renderProg, 'uHueDrift'),
      mixMode: gl.getUniformLocation(renderProg, 'uMixMode'),
      dotShape: gl.getUniformLocation(renderProg, 'uDotShape'),
      light1Col: gl.getUniformLocation(renderProg, 'uLight1Col'),
      light2Col: gl.getUniformLocation(renderProg, 'uLight2Col'),
      lightDir: gl.getUniformLocation(renderProg, 'uLightDir'),
      light1Power: gl.getUniformLocation(renderProg, 'uLight1Power'),
      rimPower: gl.getUniformLocation(renderProg, 'uRimPower'),
      lightPulse: gl.getUniformLocation(renderProg, 'uLightPulse'),
      audio: gl.getUniformLocation(renderProg, 'uAudio'),
      hasPhoto: gl.getUniformLocation(renderProg, 'uHasPhoto'),
      photoTex: gl.getUniformLocation(renderProg, 'uPhotoTex')
    };

    const uFade = {
      prev: gl.getUniformLocation(fadeProg, 'uPrev'),
      bgCol: gl.getUniformLocation(fadeProg, 'uBgCol'),
      decay: gl.getUniformLocation(fadeProg, 'uDecay')
    };
    const uBlur = {
      tex: gl.getUniformLocation(blurProg, 'uTex'),
      step: gl.getUniformLocation(blurProg, 'uStep')
    };
    const uPost = {
      scene: gl.getUniformLocation(postProg, 'uScene'),
      glowTex: gl.getUniformLocation(postProg, 'uGlowTex'),
      glow: gl.getUniformLocation(postProg, 'uGlow'),
      split: gl.getUniformLocation(postProg, 'uSplit'),
      grain: gl.getUniformLocation(postProg, 'uGrain'),
      time: gl.getUniformLocation(postProg, 'uTime'),
      mirror: gl.getUniformLocation(postProg, 'uMirror'),
      mirrorSpin: gl.getUniformLocation(postProg, 'uMirrorSpin'),
      lens: gl.getUniformLocation(postProg, 'uLens'),
      invert: gl.getUniformLocation(postProg, 'uInvert'),
      flip: gl.getUniformLocation(postProg, 'uFlip')
    };

    const masks = V.createMasks(gl);

    const initPos = new Float32Array(V.MAX_DOTS * 4);
    const initVel = new Float32Array(V.MAX_DOTS * 4);
    function seedParticles() {
      for (let i = 0; i < V.MAX_DOTS; i++) {
        const u = Math.random() * 2 - 1;
        const theta = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const r = 0.25 + Math.pow(Math.random(), 0.7) * 0.75;
        const idx = i * 4;
        initPos[idx]     = s * Math.cos(theta) * r;
        initPos[idx + 1] = s * Math.sin(theta) * r;
        initPos[idx + 2] = u * r;
        initPos[idx + 3] = Math.random();

        initVel[idx]     = -initPos[idx + 2] * 0.5;
        initVel[idx + 1] = initPos[idx] * 0.2;
        initVel[idx + 2] = initPos[idx] * 0.5;
        initVel[idx + 3] = Math.random();
      }
    }
    seedParticles();

    const posVBO = [gl.createBuffer(), gl.createBuffer()];
    const velVBO = [gl.createBuffer(), gl.createBuffer()];
    const simVAO = [gl.createVertexArray(), gl.createVertexArray()];
    const renderVAO = [gl.createVertexArray(), gl.createVertexArray()];
    const emptyVAO = gl.createVertexArray();

    // 2 triangles forming one quad per particle
    const quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, 0,  1, 0,  1, 1,
      -1, 0,  1, 1, -1, 1
    ]), gl.STATIC_DRAW);

    for (let i = 0; i < 2; i++) {
      gl.bindBuffer(gl.ARRAY_BUFFER, posVBO[i]);
      gl.bufferData(gl.ARRAY_BUFFER, initPos, gl.DYNAMIC_COPY);
      gl.bindBuffer(gl.ARRAY_BUFFER, velVBO[i]);
      gl.bufferData(gl.ARRAY_BUFFER, initVel, gl.DYNAMIC_COPY);

      gl.bindVertexArray(simVAO[i]);
      gl.bindBuffer(gl.ARRAY_BUFFER, posVBO[i]);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, velVBO[i]);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);

      gl.bindVertexArray(renderVAO[i]);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, posVBO[i]);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(1, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, velVBO[i]);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(2, 1);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    let targets = null;
    function makeTarget(w, h) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return { tex, fb, w, h };
    }

    function clearTrails() {
      if (!targets) return;
      const bg = V.hexToRgb(V.state.bg);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      [targets.trail0, targets.trail1].forEach(t => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
        gl.viewport(0, 0, t.w, t.h);
        gl.clear(gl.COLOR_BUFFER_BIT);
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function rebuildTargets(w, h) {
      if (targets) {
        [targets.trail0, targets.trail1, targets.blurA, targets.blurB].forEach(t => {
          gl.deleteTexture(t.tex);
          gl.deleteFramebuffer(t.fb);
        });
      }
      const bw = Math.max(2, Math.floor(w / 4));
      const bh = Math.max(2, Math.floor(h / 4));
      targets = {
        trail0: makeTarget(w, h),
        trail1: makeTarget(w, h),
        blurA: makeTarget(bw, bh),
        blurB: makeTarget(bw, bh),
        idx: 0
      };
      clearTrails();
    }

    // Live simulation & VJ drop values
    let paused = false;
    let frozen = false;
    let toolMode = V.TOOL.ORBIT;
    let simTime = 0;
    let stepAccum = 0;
    let ping = 0;
    let aspect = 1;
    let camYaw = 0;
    let camPitch = 0;
    let clickForce = 0;
    let blastDecay = 0;

    // VJ drop decay states
    let vjFlash = 0;
    let vjZoomKick = 0;
    let vjFlipTimer = 0;
    let vjGravDrop = 0;

    const pins = new Float32Array(V.MAX_PINS * 4);
    let pinNext = 0;

    let presetA = null;
    let presetB = null;
    let morphing = false;

    let slowFrameStreak = 0;
    let autoSkipGlow = false;
    let autoDotFactor = 1.0;

    const pointer = { x: 0, y: 0, s: 0 };

    function setSize(w, h) {
      canvas.width = Math.max(2, w & ~1);
      canvas.height = Math.max(2, h & ~1);
      gl.viewport(0, 0, canvas.width, canvas.height);
      aspect = canvas.width / canvas.height;
      rebuildTargets(canvas.width, canvas.height);
    }

    function resetParticles() {
      seedParticles();
      gl.bindBuffer(gl.ARRAY_BUFFER, posVBO[ping]);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, initPos);
      gl.bindBuffer(gl.ARRAY_BUFFER, velVBO[ping]);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, initVel);
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

    function computeLightDir(t) {
      let lx, ly, lz;
      if (V.state.lightMode === 1) {
        lx = pointer.x;
        ly = pointer.y;
        lz = 0.75;
      } else if (V.state.lightMode === 2) {
        lx = Math.cos(V.state.lightAngle);
        ly = Math.sin(V.state.lightAngle);
        lz = 0.7;
      } else {
        const a = t * 0.28 + V.state.lightAngle;
        lx = Math.cos(a);
        ly = 0.65;
        lz = Math.sin(a) + 0.6;
      }
      const len = Math.hypot(lx, ly, lz) || 1;
      return [lx / len, ly / len, lz / len];
    }

    function stepMorph(t) {
      if (!morphing || !presetA || !presetB) return;
      const k = Math.sin(t * 0.45) * 0.5 + 0.5;
      ['curl', 'freq', 'swirl', 'silk', 'zoom', 'shutter', 'contrast', 'opacity', 'glow', 'trails', 'split', 'light1', 'rim']
        .forEach(key => { V.state[key] = presetA[key] + (presetB[key] - presetA[key]) * k; });
      ['bg', 'dark', 'mid', 'bright', 'light1Col', 'light2Col']
        .forEach(key => { V.state[key] = V.mixHex(presetA[key], presetB[key], k); });
      V.state.shape = k < 0.5 ? presetA.shape : presetB.shape;
    }

    function drawParticles(drawIdx, activeCount, audioBands) {
      const st = V.state;
      const bg = V.hexToRgb(st.bg);
      const colDark = V.hexToRgb(st.dark);
      const colMid = V.hexToRgb(st.mid);
      const colBright = V.hexToRgb(st.bright);
      const l1 = V.hexToRgb(st.light1Col);
      const l2 = V.hexToRgb(st.light2Col);
      const lDir = computeLightDir(simTime);

      gl.enable(gl.BLEND);
      if (st.mixMode === 1) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(renderProg);
      gl.uniform2f(uRen.res, canvas.width, canvas.height);
      gl.uniform1f(uRen.aspect, aspect);
      gl.uniform1f(uRen.time, simTime);
      gl.uniform1f(uRen.shutter, st.shutter);
      gl.uniform1f(uRen.zoom, st.zoom + vjZoomKick);
      gl.uniform1f(uRen.contrast, st.contrast);
      gl.uniform1f(uRen.opacity, st.opacity);
      gl.uniform2f(uRen.cam, camYaw, camPitch);
      gl.uniform3f(uRen.bgCol, bg[0], bg[1], bg[2]);
      gl.uniform3f(uRen.colDark, colDark[0], colDark[1], colDark[2]);
      gl.uniform3f(uRen.colMid, colMid[0], colMid[1], colMid[2]);
      gl.uniform3f(uRen.colBright, colBright[0], colBright[1], colBright[2]);
      gl.uniform1i(uRen.colorDriver, st.colorDriver);
      gl.uniform1f(uRen.hueDrift, st.hueDrift);
      gl.uniform1i(uRen.mixMode, st.mixMode);
      gl.uniform1i(uRen.dotShape, st.dotShape);
      gl.uniform3f(uRen.light1Col, l1[0], l1[1], l1[2]);
      gl.uniform3f(uRen.light2Col, l2[0], l2[1], l2[2]);
      gl.uniform3f(uRen.lightDir, lDir[0], lDir[1], lDir[2]);
      gl.uniform1f(uRen.light1Power, st.light1);
      gl.uniform1f(uRen.rimPower, st.rim);
      gl.uniform1f(uRen.lightPulse, st.pulse);
      gl.uniform3f(uRen.audio, audioBands[0], audioBands[1], audioBands[2]);
      gl.uniform1i(uRen.hasPhoto, masks.hasPhoto);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, masks.photoTex);
      gl.uniform1i(uRen.photoTex, 2);

      gl.bindVertexArray(renderVAO[drawIdx]);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, activeCount);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }

    let last = performance.now();
    let fpsAccum = 0;
    let fpsFrames = 0;
    let checkedErr = false;

    function tick(now, isOrbiting, onFps, onRecordEndFrame) {
      const rawDt = Math.min((now - last) * 0.001, 0.05);
      last = now;
      pointer.s *= 0.94;
      blastDecay *= 0.86;
      vjFlash *= 0.82;
      vjZoomKick *= 0.86;
      vjGravDrop *= 0.88;
      if (vjFlipTimer > 0) vjFlipTimer = Math.max(0, vjFlipTimer - rawDt);

      fpsAccum += rawDt;
      fpsFrames++;
      if (fpsAccum >= 0.5) {
        const fps = Math.round(fpsFrames / fpsAccum);
        if (onFps) onFps(fps);
        if (fps < V.LOW_FPS_THRESHOLD) {
          slowFrameStreak += fpsFrames;
          if (slowFrameStreak >= V.SLOW_FRAMES_TRIGGER) {
            autoSkipGlow = true;
            autoDotFactor = Math.max(0.4, autoDotFactor * 0.85);
          }
        } else if (fps > 45) {
          slowFrameStreak = 0;
          autoSkipGlow = false;
          autoDotFactor = Math.min(1.0, autoDotFactor + 0.05);
        }
        fpsAccum = 0;
        fpsFrames = 0;
      }

      const audioBands = audio.sample();
      const st = V.state;
      const activeCount = Math.max(V.MIN_DOTS, Math.min(V.MAX_DOTS, Math.round(st.dots * 1000 * autoDotFactor)));

      masks.updateWebcam();
      masks.fadeBrush();

      if (!paused && !isOrbiting) {
        camYaw += rawDt * st.orbit;
      }

      let shouldStep = !paused && !frozen && Math.abs(st.speed) > 0.001;
      let stepDt = rawDt * Math.abs(st.speed);
      if (shouldStep && st.fpsStep > 0) {
        const stepSize = 1 / st.fpsStep;
        stepAccum += stepDt;
        if (stepAccum >= stepSize) {
          stepDt = stepSize;
          stepAccum -= stepSize;
        } else {
          shouldStep = false;
        }
      }

      let drawIdx = ping;
      if (shouldStep) {
        const flowDir = st.speed < 0 ? -1.0 : 1.0;
        simTime += stepDt * flowDir;
        stepMorph(simTime);

        const pong = 1 - ping;
        gl.useProgram(simProg);
        gl.uniform1f(uSim.dt, stepDt);
        gl.uniform1f(uSim.time, simTime);
        gl.uniform3f(uSim.pointer, pointer.x, pointer.y, pointer.s);
        gl.uniform1f(uSim.clickForce, clickForce + blastDecay);
        gl.uniform1f(uSim.curl, st.curl);
        gl.uniform1f(uSim.freq, st.freq);
        gl.uniform1f(uSim.swirl, st.swirl);
        gl.uniform1i(uSim.shape, st.shape);
        gl.uniform2f(uSim.wind, st.wind, st.gravity + vjGravDrop);
        gl.uniform1f(uSim.silk, st.silk);
        gl.uniform3f(uSim.audio, audioBands[0], audioBands[1], audioBands[2]);
        gl.uniform1f(uSim.flowDir, flowDir);
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
        gl.bindVertexArray(simVAO[ping]);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, posVBO[pong]);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, velVBO[pong]);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, activeCount);
        gl.endTransformFeedback();
        gl.bindVertexArray(null);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, null);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
        gl.disable(gl.RASTERIZER_DISCARD);

        ping = pong;
        drawIdx = pong;
      }

      const bg = V.hexToRgb(st.bg);
      const effectiveGlow = autoSkipGlow ? 0 : st.glow;
      const effectiveSplit = st.split + audioBands[2] * 0.25;
      const needsBlur = effectiveGlow > 0.001 || st.lens === 1;
      const usePolish =
        st.trails > 0.001 ||
        needsBlur ||
        effectiveSplit > 0.001 ||
        st.grain > 0.001 ||
        st.mirror > 0 ||
        st.lens > 0 ||
        vjFlash > 0.01 ||
        vjFlipTimer > 0;

      if (!usePolish || !targets) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(bg[0], bg[1], bg[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        drawParticles(drawIdx, activeCount, audioBands);
      } else {
        const readT = targets.idx === 0 ? targets.trail0 : targets.trail1;
        const writeT = targets.idx === 0 ? targets.trail1 : targets.trail0;

        gl.bindFramebuffer(gl.FRAMEBUFFER, writeT.fb);
        gl.viewport(0, 0, writeT.w, writeT.h);

        if (st.trails > 0.001) {
          gl.useProgram(fadeProg);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, readT.tex);
          gl.uniform1i(uFade.prev, 0);
          gl.uniform3f(uFade.bgCol, bg[0], bg[1], bg[2]);
          gl.uniform1f(uFade.decay, st.trails);
          gl.bindVertexArray(emptyVAO);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        } else {
          gl.clearColor(bg[0], bg[1], bg[2], 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }

        drawParticles(drawIdx, activeCount, audioBands);

        if (needsBlur) {
          gl.useProgram(blurProg);
          gl.bindVertexArray(emptyVAO);

          gl.bindFramebuffer(gl.FRAMEBUFFER, targets.blurA.fb);
          gl.viewport(0, 0, targets.blurA.w, targets.blurA.h);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, writeT.tex);
          gl.uniform1i(uBlur.tex, 0);
          gl.uniform2f(uBlur.step, 1.0 / targets.blurA.w, 0.0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);

          gl.bindFramebuffer(gl.FRAMEBUFFER, targets.blurB.fb);
          gl.bindTexture(gl.TEXTURE_2D, targets.blurA.tex);
          gl.uniform2f(uBlur.step, 0.0, 1.0 / targets.blurB.h);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(postProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, writeT.tex);
        gl.uniform1i(uPost.scene, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, targets.blurB.tex);
        gl.uniform1i(uPost.glowTex, 1);
        gl.uniform1f(uPost.glow, effectiveGlow);
        gl.uniform1f(uPost.split, effectiveSplit);
        gl.uniform1f(uPost.grain, st.grain);
        gl.uniform1f(uPost.time, now * 0.001);
        gl.uniform1i(uPost.mirror, st.mirror);
        gl.uniform1f(uPost.mirrorSpin, st.mirrorSpin);
        gl.uniform1i(uPost.lens, st.lens);
        gl.uniform1f(uPost.invert, vjFlash);
        gl.uniform1f(uPost.flip, vjFlipTimer > 0 ? 1.0 : 0.0);
        gl.bindVertexArray(emptyVAO);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);

        targets.idx = 1 - targets.idx;
      }

      if (onRecordEndFrame) onRecordEndFrame();

      if (!checkedErr) {
        checkedErr = true;
        const e = gl.getError();
        if (e !== gl.NO_ERROR) V.showError('Graphics error: 0x' + e.toString(16));
      }
    }

    return {
      masks,
      pointer,
      setSize,
      clearTrails,
      resetParticles,
      clearForces,
      addPin,
      triggerVJ,
      tick,
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
      resetAutoDots() { autoDotFactor = 1.0; },
      setPresetA() { presetA = Object.assign({}, V.state); },
      setPresetB() { presetB = Object.assign({}, V.state); },
      toggleMorph() {
        if (!presetA) presetA = Object.assign({}, V.state);
        if (!presetB) presetB = Object.assign({}, V.LOOKS[2], { shape: 1 });
        morphing = !morphing;
        return morphing;
      }
    };
  }

  V.createEngine = createEngine;
})();