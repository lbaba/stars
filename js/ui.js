(() => {
  const V = window.VORTEX;

  try {
    const canvas = document.getElementById('c');
    const audio = V.createAudio();
    const engine = V.createEngine(canvas, audio);

    const SLIDERS = [
      ['pHueDrift', 'vHueDrift', 'hueDrift', 2],
      ['pLight1', 'vLight1', 'light1', 2],
      ['pRim', 'vRim', 'rim', 2],
      ['pLightAngle', 'vLightAngle', 'lightAngle', 2],
      ['pPulse', 'vPulse', 'pulse', 2],
      ['pSpeed', 'vSpeed', 'speed', 2],
      ['pCurl', 'vCurl', 'curl', 2],
      ['pFreq', 'vFreq', 'freq', 2],
      ['pSwirl', 'vSwirl', 'swirl', 2],
      ['pSilk', 'vSilk', 'silk', 2],
      ['pWind', 'vWind', 'wind', 2],
      ['pGravity', 'vGravity', 'gravity', 2],
      ['pDots', 'vDots', 'dots', 0, 'k'],
      ['pMirrorSpin', 'vMirrorSpin', 'mirrorSpin', 2],
      ['pOrbit', 'vOrbit', 'orbit', 2],
      ['pZoom', 'vZoom', 'zoom', 2],
      ['pShutter', 'vShutter', 'shutter', 3],
      ['pContrast', 'vContrast', 'contrast', 2],
      ['pOpacity', 'vOpacity', 'opacity', 2],
      ['pTrails', 'vTrails', 'trails', 2],
      ['pGlow', 'vGlow', 'glow', 2],
      ['pSplit', 'vSplit', 'split', 2],
      ['pGrain', 'vGrain', 'grain', 2],
      ['pAudio', 'vAudio', 'audioPush', 2]
    ];

    const COLORS = [
      ['cBg', 'bg'], ['cDark', 'dark'], ['cMid', 'mid'],
      ['cBright', 'bright'], ['cLight1', 'light1Col'], ['cLight2', 'light2Col']
    ];

    const SELECTS = [
      ['colorDriverSel', 'colorDriver'],
      ['mixModeSel', 'mixMode'],
      ['lightModeSel', 'lightMode'],
      ['shapeSel', 'shape'],
      ['fpsStepSel', 'fpsStep'],
      ['dotShapeSel', 'dotShape'],
      ['mirrorSel', 'mirror'],
      ['lensSel', 'lens']
    ];

    const wordBox = document.getElementById('wordBox');
    const wordInput = document.getElementById('wordInput');

    function syncUIFromState() {
      SLIDERS.forEach(([id, vid, key, d, suffix]) => {
        document.getElementById(id).value = String(V.state[key]);
        document.getElementById(vid).textContent = V.state[key].toFixed(d) + (suffix || '');
      });
      COLORS.forEach(([id, key]) => {
        document.getElementById(id).value = V.state[key];
      });
      SELECTS.forEach(([id, key]) => {
        document.getElementById(id).value = String(V.state[key]);
      });
      wordInput.value = V.state.word || 'VORTEX';
      wordBox.classList.toggle('show', V.state.shape === V.SHAPE.WORD);
    }

    SLIDERS.forEach(([id, vid, key, d, suffix]) => {
      const el = document.getElementById(id);
      const out = document.getElementById(vid);
      el.addEventListener('input', () => {
        const lim = V.LIMITS[key];
        V.state[key] = V.clampVal(el.value, lim[0], lim[1], V.state[key]);
        out.textContent = V.state[key].toFixed(d) + (suffix || '');
        if (key === 'dots') engine.resetAutoDots();
      });
    });

    COLORS.forEach(([id, key]) => {
      document.getElementById(id).addEventListener('input', e => {
        if (V.HEX_COLOR_RE.test(e.target.value)) {
          V.state[key] = e.target.value;
          if (key === 'bg') engine.clearTrails();
        }
      });
    });

    SELECTS.forEach(([id, key]) => {
      document.getElementById(id).addEventListener('change', e => {
        const lim = V.LIMITS[key];
        V.state[key] = Math.round(V.clampVal(e.target.value, lim[0], lim[1], V.state[key]));
        if (key === 'shape') {
          wordBox.classList.toggle('show', V.state.shape === V.SHAPE.WORD);
        }
      });
    });

    wordInput.addEventListener('input', () => {
      V.state.word = wordInput.value;
      engine.masks.setWord(wordInput.value);
    });

    const logoBtn = document.getElementById('logoBtn');
    const logoFileInput = document.getElementById('logoFileInput');
    logoBtn.addEventListener('click', () => logoFileInput.click());
    logoFileInput.addEventListener('change', () => {
      const file = logoFileInput.files && logoFileInput.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        engine.masks.setImage(img);
        V.state.shape = V.SHAPE.WORD;
        V.state.colorDriver = 3;
        syncUIFromState();
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
      logoFileInput.value = '';
    });

    const camBtn = document.getElementById('camBtn');
    camBtn.addEventListener('click', async () => {
      try {
        const on = await engine.masks.toggleWebcam();
        camBtn.classList.toggle('active', on);
        camBtn.textContent = on ? 'Webcam On' : 'Webcam Ghost';
      } catch (_) {
        camBtn.textContent = 'Cam Blocked';
      }
    });

    const toolSel = document.getElementById('toolSel');
    toolSel.addEventListener('change', () => {
      engine.toolMode = parseInt(toolSel.value, 10) || 0;
      canvas.classList.toggle('drawing', engine.toolMode !== V.TOOL.ORBIT);
    });
    document.getElementById('clearForcesBtn').addEventListener('click', () => engine.clearForces());

    const lookSel = document.getElementById('lookSel');
    V.LOOKS.forEach((l, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = l.name;
      lookSel.appendChild(opt);
    });

    function applyLook(obj) {
      Object.keys(obj).forEach(k => {
        if (k in V.LIMITS) {
          V.state[k] = V.clampVal(obj[k], V.LIMITS[k][0], V.LIMITS[k][1], V.state[k]);
        } else if (k === 'word' && typeof obj[k] === 'string') {
          V.state.word = obj[k].slice(0, 20);
          engine.masks.setWord(V.state.word);
        } else if (typeof V.state[k] === 'string' && V.HEX_COLOR_RE.test(obj[k])) {
          V.state[k] = obj[k];
        }
      });
      syncUIFromState();
      engine.clearTrails();
    }
    lookSel.addEventListener('change', () => applyLook(V.LOOKS[parseInt(lookSel.value, 10)] || V.LOOKS[0]));

    document.getElementById('chaosBtn').addEventListener('click', () => {
      const randHex = (minL, maxL) => {
        const c = () => minL + Math.random() * (maxL - minL);
        return V.rgbToHex(c(), c(), c());
      };
      const inkMode = Math.random() < 0.2;
      applyLook({
        bg: inkMode ? randHex(0.88, 0.96) : randHex(0.0, 0.06),
        dark: inkMode ? randHex(0.02, 0.14) : randHex(0.04, 0.25),
        mid: randHex(0.25, 0.85),
        bright: inkMode ? randHex(0.25, 0.55) : randHex(0.75, 1.0),
        light1Col: randHex(0.7, 1.0),
        light2Col: randHex(0.4, 1.0),
        colorDriver: Math.floor(Math.random() * 3),
        mixMode: inkMode ? 2 : (Math.random() < 0.45 ? 1 : 0),
        shape: Math.floor(Math.random() * 5),
        dotShape: Math.floor(Math.random() * 4),
        mirror: Math.random() < 0.35 ? Math.floor(Math.random() * 6) : 0,
        curl: 0.9 + Math.random() * 1.9,
        freq: 0.7 + Math.random() * 1.5,
        swirl: 0.7 + Math.random() * 2.4,
        silk: Math.random(),
        glow: inkMode ? 0 : Math.random() * 0.85,
        trails: Math.random() < 0.5 ? 0 : 0.2 + Math.random() * 0.5,
        split: Math.random() < 0.4 ? Math.random() * 0.4 : 0
      });
    });

    const panel = document.getElementById('panel');
    const toggleBtn = document.getElementById('toggleBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const freezeBtn = document.getElementById('freezeBtn');
    const fpsLabel = document.getElementById('fpsLabel');

    function togglePanel() { panel.classList.toggle('hidden'); }
    function togglePause() {
      engine.paused = !engine.paused;
      pauseBtn.textContent = engine.paused ? 'Play [Space]' : 'Pause [Space]';
    }
    function syncFreezeBtn() {
      freezeBtn.classList.toggle('active', engine.frozen);
      freezeBtn.textContent = engine.frozen ? 'Unfreeze [F]' : 'Freeze [F]';
    }

    toggleBtn.addEventListener('click', togglePanel);
    pauseBtn.addEventListener('click', togglePause);
    freezeBtn.addEventListener('click', () => {
      engine.frozen = !engine.frozen;
      syncFreezeBtn();
    });
    document.getElementById('blastBtn').addEventListener('click', () => engine.blast());
    document.getElementById('resetBtn').addEventListener('click', () => engine.resetParticles());

    // VJ drop buttons + keys 1-6
    for (let k = 1; k <= 6; k++) {
      document.getElementById('vj' + k).addEventListener('click', () => {
        engine.triggerVJ(k);
        if (k === 6) syncFreezeBtn();
      });
    }

    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'h' || e.key === 'H') togglePanel();
      if (e.key === 'f' || e.key === 'F') {
        engine.frozen = !engine.frozen;
        syncFreezeBtn();
      }
      if (e.code === 'Space') { e.preventDefault(); togglePause(); }
      if (e.key >= '1' && e.key <= '6') {
        engine.triggerVJ(parseInt(e.key, 10));
        if (e.key === '6') syncFreezeBtn();
      }
    });

    // Presets & Morph
    function exportStateCode() {
      return btoa(JSON.stringify(V.state));
    }

    function loadStateCode(code) {
      try {
        const raw = JSON.parse(atob(code.trim()));
        if (!raw || typeof raw !== 'object') return false;
        applyLook(raw);
        return true;
      } catch (_) {
        return false;
      }
    }

    if (location.hash.startsWith('#s=')) {
      loadStateCode(location.hash.slice(3));
    }

    const saveABtn = document.getElementById('saveABtn');
    const saveBBtn = document.getElementById('saveBBtn');
    const morphBtn = document.getElementById('morphBtn');
    saveABtn.addEventListener('click', () => { engine.setPresetA(); saveABtn.classList.add('active'); });
    saveBBtn.addEventListener('click', () => { engine.setPresetB(); saveBBtn.classList.add('active'); });
    morphBtn.addEventListener('click', () => {
      const on = engine.toggleMorph();
      morphBtn.classList.toggle('active', on);
      morphBtn.textContent = on ? 'Morph On' : 'Morph Off';
    });

    document.getElementById('copyLinkBtn').addEventListener('click', () => {
      const code = exportStateCode();
      const url = location.origin + location.pathname + '#s=' + code;
      history.replaceState(null, '', '#s=' + code);
      if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
      const btn = document.getElementById('copyLinkBtn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Link'; }, 1200);
    });

    document.getElementById('pasteCodeBtn').addEventListener('click', () => {
      const input = prompt('Paste preset code or full link:');
      if (!input) return;
      const code = input.includes('#s=') ? input.split('#s=')[1] : input;
      if (!loadStateCode(code)) V.showError('Invalid preset code ignored safely.');
    });

    // Audio controls
    const micBtn = document.getElementById('micBtn');
    const fileAudioBtn = document.getElementById('fileAudioBtn');
    const audioFileInput = document.getElementById('audioFileInput');
    const audioDot = document.getElementById('audioDot');
    const audioText = document.getElementById('audioText');
    const audioBandsLabel = document.getElementById('audioBands');

    micBtn.addEventListener('click', async () => {
      if (audioText.textContent === 'Mic Live') {
        audio.stop();
        micBtn.classList.remove('active');
        audioDot.classList.remove('audio');
        audioText.textContent = 'Off';
        return;
      }
      try {
        await audio.startMic();
        micBtn.classList.add('active');
        audioDot.classList.add('audio');
        audioText.textContent = 'Mic Live';
      } catch (_) {
        audioText.textContent = 'Mic blocked';
      }
    });

    fileAudioBtn.addEventListener('click', () => audioFileInput.click());
    audioFileInput.addEventListener('change', async () => {
      const file = audioFileInput.files && audioFileInput.files[0];
      if (!file) return;
      try {
        micBtn.classList.remove('active');
        await audio.startFile(file);
        audioDot.classList.add('audio');
        audioText.textContent = file.name.slice(0, 14);
      } catch (_) {
        audioText.textContent = 'Audio error';
      }
      audioFileInput.value = '';
    });

    // Aspect Ratio & Recording
    const ratioSel = document.getElementById('ratioSel');
    const customRatioRow = document.getElementById('customRatioRow');
    const ratioW = document.getElementById('ratioW');
    const ratioH = document.getElementById('ratioH');
    const resSel = document.getElementById('resSel');
    const dimLabel = document.getElementById('dimLabel');
    const fmtSel = document.getElementById('fmtSel');
    const durSel = document.getElementById('durSel');
    const recBtn = document.getElementById('recBtn');
    const snapBtn = document.getElementById('snapBtn');
    const recDot = document.getElementById('recDot');
    const recText = document.getElementById('recText');
    const recTimer = document.getElementById('recTimer');

    function setResizeLocked(locked) {
      ratioSel.disabled = locked;
      ratioW.disabled = locked;
      ratioH.disabled = locked;
      resSel.disabled = locked;
      fmtSel.disabled = locked;
      durSel.disabled = locked;
    }

    const recorder = V.createRecorder(canvas, audio, (isRec, label) => {
      setResizeLocked(isRec);
      recBtn.classList.toggle('recording', isRec);
      recBtn.textContent = isRec ? '■ Stop' : '● Record';
      recDot.classList.toggle('live', isRec);
      recText.textContent = label;
    });

    if (recorder.supported.length) {
      recorder.supported.forEach((f, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = f.label;
        fmtSel.appendChild(opt);
      });
    } else {
      const opt = document.createElement('option');
      opt.textContent = 'Unsupported';
      fmtSel.appendChild(opt);
      recBtn.disabled = true;
    }

    recBtn.addEventListener('click', () => {
      if (recorder.isRecording()) recorder.stop();
      else recorder.start(parseInt(fmtSel.value, 10) || 0, parseInt(durSel.value, 10) || 0);
    });
    snapBtn.addEventListener('click', () => recorder.requestSnap());

    function getTargetAspect() {
      const v = ratioSel.value;
      if (v === 'fill') return V.clampVal(innerWidth / Math.max(1, innerHeight), V.MIN_ASPECT, V.MAX_ASPECT, 1);
      if (v === 'custom') {
        const w = V.clampVal(ratioW.value, 1, 9999, 16);
        const h = V.clampVal(ratioH.value, 1, 9999, 9);
        return V.clampVal(w / h, V.MIN_ASPECT, V.MAX_ASPECT, 1);
      }
      const [w, h] = v.split(':').map(Number);
      return V.clampVal(w / h, V.MIN_ASPECT, V.MAX_ASPECT, 1);
    }

    function resize() {
      if (recorder.isRecording()) return;
      const mode = ratioSel.value;
      customRatioRow.classList.toggle('show', mode === 'custom');
      canvas.classList.toggle('framed', mode !== 'fill');

      const targetAspect = getTargetAspect();
      let cssW, cssH;
      if (mode === 'fill') {
        cssW = innerWidth;
        cssH = innerHeight;
      } else {
        const pad = 28;
        const availW = Math.max(64, innerWidth - pad);
        const availH = Math.max(64, innerHeight - pad);
        if (availW / availH > targetAspect) {
          cssH = availH;
          cssW = cssH * targetAspect;
        } else {
          cssW = availW;
          cssH = cssW / targetAspect;
        }
      }
      canvas.style.width = `${Math.floor(cssW)}px`;
      canvas.style.height = `${Math.floor(cssH)}px`;

      let pxW, pxH;
      if (resSel.value === 'auto') {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        pxW = Math.round(cssW * dpr);
        pxH = Math.round(cssH * dpr);
      } else {
        const base = parseInt(resSel.value, 10);
        if (targetAspect >= 1) {
          pxH = base;
          pxW = Math.round(base * targetAspect);
        } else {
          pxW = base;
          pxH = Math.round(base / targetAspect);
        }
      }

      const totalPx = pxW * pxH;
      if (totalPx > V.MAX_CANVAS_PIXELS) {
        const shrink = Math.sqrt(V.MAX_CANVAS_PIXELS / totalPx);
        pxW = Math.floor(pxW * shrink);
        pxH = Math.floor(pxH * shrink);
      }

      engine.setSize(pxW, pxH);
      dimLabel.textContent = `${canvas.width} × ${canvas.height}`;
    }

    ratioSel.addEventListener('change', resize);
    resSel.addEventListener('change', resize);
    ratioW.addEventListener('input', resize);
    ratioH.addEventListener('input', resize);
    addEventListener('resize', resize);
    resize();

    // Mouse & Touch interactions (Orbit / Wind Brush / Pin Whirlpool / Blast)
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    function mapToWorld(e) {
      const rect = canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
      const wx = engine.aspect >= 1 ? nx * engine.aspect : nx;
      const wy = engine.aspect >= 1 ? ny : ny / engine.aspect;
      engine.pointer.x = wx;
      engine.pointer.y = wy;
      engine.pointer.s = 1.0;
      return [wx, wy];
    }

    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      const [wx, wy] = mapToWorld(e);
      if (e.button === 2) {
        engine.clickForce = -1.4;
      } else if (e.shiftKey) {
        engine.clickForce = 1.4;
      } else if (engine.toolMode === V.TOOL.PIN) {
        engine.addPin(wx, wy, 1.2);
      } else {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      }
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', e => {
      const [wx, wy] = mapToWorld(e);
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      if (engine.toolMode === V.TOOL.ORBIT) {
        engine.adjustCam(dx * 0.006, dy * 0.006);
      } else if (engine.toolMode === V.TOOL.BRUSH) {
        engine.masks.paintBrush(wx, wy, dx * 0.08, -dy * 0.08);
      }
    });

    function endDrag() {
      isDragging = false;
      engine.clickForce = 0;
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      V.state.zoom = V.clampVal(V.state.zoom - e.deltaY * 0.001, V.LIMITS.zoom[0], V.LIMITS.zoom[1], V.state.zoom);
      document.getElementById('pZoom').value = String(V.state.zoom);
      document.getElementById('vZoom').textContent = V.state.zoom.toFixed(2);
    }, { passive: false });

    syncUIFromState();

    function loop(now) {
      if (recorder.isRecording()) {
        const sec = recorder.getElapsedSec(now);
        const m = String(Math.floor(sec / 60)).padStart(2, '0');
        const s = (sec % 60).toFixed(1).padStart(4, '0');
        recTimer.textContent = `${m}:${s}`;
      }

      const b = audio.bands;
      audioBandsLabel.textContent = `B ${Math.round(b[0] * 9)} · M ${Math.round(b[1] * 9)} · H ${Math.round(b[2] * 9)}`;

      engine.tick(
        now,
        isDragging && engine.toolMode === V.TOOL.ORBIT,
        fps => { fpsLabel.textContent = `${fps} fps`; },
        () => recorder.flushSnap()
      );
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  } catch (err) {
    V.showError(err && err.stack ? err.stack : err);
  }
})();