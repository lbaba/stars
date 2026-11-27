(() => {
  const V = window.VORTEX;

  const SLIDERS = [
    ['pHueDrift', 'vHueDrift', 'hueDrift', 2],
    ['pLight1', 'vLight1', 'light1', 2],
    ['pRim', 'vRim', 'rim', 2],
    ['pLight3', 'vLight3', 'light3', 2],
    ['pSpecular', 'vSpecular', 'specular', 2],
    ['pLightAngle', 'vLightAngle', 'lightAngle', 2],
    ['pPulse', 'vPulse', 'pulse', 2],
    ['pAdditive', 'vAdditive', 'additive', 2],
    ['pDof', 'vDof', 'dof', 2],
    ['pFog', 'vFog', 'fog', 2],
    ['pFormA', 'vFormA', 'formA', 1],
    ['pFormB', 'vFormB', 'formB', 1],
    ['pFormC', 'vFormC', 'formC', 2],
    ['pSurfaceFlow', 'vSurfaceFlow', 'surfaceFlow', 2],
    ['pLoopSec', 'vLoopSec', 'loopSec', 0, 's'],
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
    ['pAudio', 'vAudio', 'audioPush', 2],
    ['pMonoInvert', 'vMonoInvert', 'monoInvert', 2],
    ['pScrollReact', 'vScrollReact', 'scrollReact', 2]
  ];

  const COLORS = [
    ['cBg', 'bg'], ['cDark', 'dark'], ['cMid', 'mid'],
    ['cBright', 'bright'], ['cLight1', 'light1Col'],
    ['cLight2', 'light2Col'], ['cLight3', 'light3Col']
  ];

  const SELECTS = [
    ['colorDriverSel', 'colorDriver'],
    ['mixModeSel', 'mixMode'],
    ['materialSel', 'material'],
    ['lightModeSel', 'lightMode'],
    ['shapeSel', 'shape'],
    ['layerModeSel', 'layerMode'],
    ['integratorSel', 'integrator'],
    ['bgModeSel', 'bgMode'],
    ['fpsStepSel', 'fpsStep'],
    ['dotShapeSel', 'dotShape'],
    ['mirrorSel', 'mirror'],
    ['lensSel', 'lens'],
    ['toneMapSel', 'toneMap']
  ];

  const $ = id => document.getElementById(id);

  try {
    const canvas = $('c');
    const audio = V.createAudio();
    const engine = V.createEngine(canvas, audio);
    const exporter = V.createExporter(engine);

    const sliderEls = SLIDERS.map(([id, vid, key, d, suffix]) => ({
      el: $(id), out: $(vid), key, d, suffix: suffix || ''
    }));
    const colorEls = COLORS.map(([id, key]) => ({ el: $(id), key }));
    const selectEls = SELECTS.map(([id, key]) => ({ el: $(id), key }));

    const wordBox = $('wordBox');
    const wordInput = $('wordInput');
    const panel = $('panel');
    const pauseBtn = $('pauseBtn');
    const freezeBtn = $('freezeBtn');
    const fpsLabel = $('fpsLabel');
    const pZoom = $('pZoom');
    const vZoom = $('vZoom');
    const expRoleSel = $('expRoleSel');
    const expFmtSel = $('expFmtSel');
    const expPtrSel = $('expPtrSel');
    const expReducedSel = $('expReducedSel');
    const expTagInput = $('expTagInput');
    const expCompactChk = $('expCompactChk');
    const expPosterChk = $('expPosterChk');
    const expAutoPauseChk = $('expAutoPauseChk');
    const expSizeLabel = $('expSizeLabel');
    const expSnippet = $('expSnippet');
    const sandboxModal = $('sandboxModal');
    const sandboxFrame = $('sandboxFrame');
    const sandboxBackdropSel = $('sandboxBackdropSel');

    let lastExport = null;

    function getExportOpts() {
      return {
        format: expFmtSel.value,
        role: expRoleSel.value,
        tagName: expTagInput.value,
        compact: expCompactChk.checked,
        includePoster: expPosterChk.checked,
        pointerMode: expPtrSel.value,
        scrollReact: V.state.scrollReact,
        reducedMotion: expReducedSel.value,
        autoPause: expAutoPauseChk.checked
      };
    }

    function refreshExportPreview() {
      lastExport = exporter.generate(getExportOpts());
      const rawKb = (lastExport.bytes / 1024).toFixed(1);
      const gzKb = (lastExport.gzipEstBytes / 1024).toFixed(1);
      expSizeLabel.textContent = `${rawKb} KB (~${gzKb} KB gz)`;
      expSnippet.value = lastExport.snippet;
      return lastExport;
    }

    const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
    const tabPanes = Array.from(document.querySelectorAll('.tab-pane'));
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        tabBtns.forEach(b => b.classList.toggle('active', b === btn));
        tabPanes.forEach(p => p.classList.toggle('show', p.dataset.pane === target));
        if (target === 'export') refreshExportPreview();
      });
    });

    function syncUIFromState() {
      for (let i = 0; i < sliderEls.length; i++) {
        const s = sliderEls[i];
        s.el.value = String(V.state[s.key]);
        s.out.textContent = V.state[s.key].toFixed(s.d) + s.suffix;
      }
      for (let i = 0; i < colorEls.length; i++) {
        colorEls[i].el.value = V.state[colorEls[i].key];
      }
      for (let i = 0; i < selectEls.length; i++) {
        selectEls[i].el.value = String(V.state[selectEls[i].key]);
      }
      wordInput.value = V.state.word || 'VORTEX';
      wordBox.classList.toggle('show', V.state.shape === V.SHAPE.WORD);
      expRoleSel.value = V.state.embedRole || 'background';
      expPtrSel.value = V.state.pointerMode || 'local';
      expReducedSel.value = V.state.reducedMotion || 'calm';
    }

    sliderEls.forEach(s => {
      s.el.addEventListener('input', () => {
        const lim = V.LIMITS[s.key];
        V.state[s.key] = V.clampVal(s.el.value, lim[0], lim[1], V.state[s.key]);
        s.out.textContent = V.state[s.key].toFixed(s.d) + s.suffix;
        if (s.key === 'dots') engine.resetAutoDots();
      });
    });

    colorEls.forEach(c => {
      c.el.addEventListener('input', e => {
        if (V.HEX_COLOR_RE.test(e.target.value)) {
          V.state[c.key] = e.target.value;
          if (c.key === 'bg') {
            V.state.bgMode = V.BG_MODE.CUSTOM;
            $('bgModeSel').value = String(V.BG_MODE.CUSTOM);
            engine.setBackgroundMode(V.BG_MODE.CUSTOM);
          }
        }
      });
    });

    selectEls.forEach(s => {
      s.el.addEventListener('change', e => {
        const lim = V.LIMITS[s.key];
        V.state[s.key] = Math.round(V.clampVal(e.target.value, lim[0], lim[1], V.state[s.key]));
        if (s.key === 'shape') {
          wordBox.classList.toggle('show', V.state.shape === V.SHAPE.WORD);
        }
      });
    });

    $('bgModeSel').addEventListener('change', () => {
      engine.setBackgroundMode(V.state.bgMode);
      $('cBg').value = V.state.bg;
    });

    wordInput.addEventListener('input', () => {
      V.state.word = wordInput.value;
      engine.masks.setWord(wordInput.value);
    });

    const logoFileInput = $('logoFileInput');
    $('logoBtn').addEventListener('click', () => logoFileInput.click());
    logoFileInput.addEventListener('change', () => {
      const file = logoFileInput.files && logoFileInput.files[0];
      if (!file || file.size > V.MAX_UPLOAD_BYTES) return;
      // Loading images/SVGs via Blob URL inside <img> neutralizes SVG scripts and external fetches
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        engine.masks.setImage(img);
        V.state.shape = V.SHAPE.WORD;
        V.state.colorDriver = 3;
        syncUIFromState();
        URL.revokeObjectURL(url);
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
      logoFileInput.value = '';
    });

    const objFileInput = $('objFileInput');
    $('objBtn').addEventListener('click', () => objFileInput.click());
    objFileInput.addEventListener('change', async () => {
      const file = objFileInput.files && objFileInput.files[0];
      if (!file || file.size > V.MAX_UPLOAD_BYTES) return;
      try {
        const text = await file.text();
        if (engine.masks.setObjText(text)) {
          V.state.shape = V.SHAPE.WORD;
          V.state.colorDriver = 0;
          syncUIFromState();
        } else {
          V.showError('OBJ mesh has too few valid vertices.');
        }
      } catch (_) {
        V.showError('Failed to read 3D OBJ file.');
      }
      objFileInput.value = '';
    });

    const camBtn = $('camBtn');
    camBtn.addEventListener('click', async () => {
      try {
        const on = await engine.masks.toggleWebcam();
        camBtn.classList.toggle('active', on);
        camBtn.textContent = on ? 'Webcam On' : 'Webcam Ghost';
      } catch (_) {
        camBtn.textContent = 'Cam Blocked';
      }
    });

    const toolSel = $('toolSel');
    toolSel.addEventListener('change', () => {
      engine.toolMode = parseInt(toolSel.value, 10) || 0;
      canvas.classList.toggle('drawing', engine.toolMode !== V.TOOL.ORBIT);
    });
    $('clearForcesBtn').addEventListener('click', () => engine.clearForces());

    const presets = V.createPresets(engine, syncUIFromState);
    const lookSel = $('lookSel');
    V.LOOKS.forEach((l, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = l.name;
      lookSel.appendChild(opt);
    });
    lookSel.addEventListener('change', () => {
      presets.applyLook(V.LOOKS[parseInt(lookSel.value, 10)] || V.LOOKS[0]);
    });
    $('chaosBtn').addEventListener('click', presets.applyChaos);
    $('varPalBtn').addEventListener('click', presets.varyPalette);
    $('varFormBtn').addEventListener('click', presets.varyForm);
    $('varLightBtn').addEventListener('click', presets.varyLight);
    $('varMotionBtn').addEventListener('click', presets.varyMotion);

    $('stateSel').addEventListener('change', e => engine.setInteractiveState(e.target.value));
    $('pProgress').addEventListener('input', e => {
      const v = V.clampVal(e.target.value, 0, 1, 0);
      engine.setProgress(v);
      $('vProgress').textContent = `${Math.round(v * 100)}%`;
    });

    [expRoleSel, expFmtSel, expPtrSel, expReducedSel, expCompactChk, expPosterChk, expAutoPauseChk].forEach(el => {
      el.addEventListener('change', () => {
        V.state.embedRole = expRoleSel.value;
        V.state.pointerMode = expPtrSel.value;
        V.state.reducedMotion = expReducedSel.value;
        if (expRoleSel.value === 'background') {
          expPtrSel.value = 'window';
          V.state.pointerMode = 'window';
        }
        refreshExportPreview();
      });
    });
    expTagInput.addEventListener('input', refreshExportPreview);

    const expCopyBtn = $('expCopyBtn');
    expCopyBtn.addEventListener('click', () => {
      const res = refreshExportPreview();
      if (navigator.clipboard) navigator.clipboard.writeText(res.code).catch(() => {});
      expCopyBtn.textContent = 'Copied!';
      setTimeout(() => { expCopyBtn.textContent = 'Copy JS'; }, 1200);
    });

    $('expDlBtn').addEventListener('click', () => {
      const res = refreshExportPreview();
      const blob = new Blob([res.code], { type: res.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });

    function openSandbox() {
      const res = refreshExportPreview();
      sandboxFrame.srcdoc = exporter.buildSandboxHtml(res, sandboxBackdropSel.value);
      sandboxModal.classList.remove('hidden');
    }
    $('expSandboxBtn').addEventListener('click', openSandbox);
    sandboxBackdropSel.addEventListener('change', () => {
      if (!sandboxModal.classList.contains('hidden')) openSandbox();
    });
    $('sandboxCloseBtn').addEventListener('click', () => {
      sandboxModal.classList.add('hidden');
      sandboxFrame.srcdoc = '';
    });

    function togglePanel() { panel.classList.toggle('hidden'); }
    function togglePause() {
      engine.paused = !engine.paused;
      pauseBtn.textContent = engine.paused ? 'Play [Space]' : 'Pause [Space]';
    }
    function syncFreezeBtn() {
      freezeBtn.classList.toggle('active', engine.frozen);
      freezeBtn.textContent = engine.frozen ? 'Unfreeze [F]' : 'Freeze [F]';
    }
    function toggleFreeze() {
      engine.frozen = !engine.frozen;
      syncFreezeBtn();
    }
    function runVJ(key) {
      engine.triggerVJ(key);
      if (key === 6) syncFreezeBtn();
    }

    $('toggleBtn').addEventListener('click', togglePanel);
    pauseBtn.addEventListener('click', togglePause);
    freezeBtn.addEventListener('click', toggleFreeze);
    $('blastBtn').addEventListener('click', () => engine.blast());
    $('resetBtn').addEventListener('click', () => engine.resetParticles());

    for (let k = 1; k <= 6; k++) {
      $('vj' + k).addEventListener('click', () => runVJ(k));
    }

    presets.loadFromHash();

    const saveABtn = $('saveABtn');
    const saveBBtn = $('saveBBtn');
    const morphBtn = $('morphBtn');
    const copyLinkBtn = $('copyLinkBtn');
    saveABtn.addEventListener('click', () => { engine.setPresetA(); saveABtn.classList.add('active'); });
    saveBBtn.addEventListener('click', () => { engine.setPresetB(); saveBBtn.classList.add('active'); });
    morphBtn.addEventListener('click', () => {
      const on = engine.toggleMorph();
      morphBtn.classList.toggle('active', on);
      morphBtn.textContent = on ? 'Morph On' : 'Morph Off';
    });
    copyLinkBtn.addEventListener('click', () => presets.copyShareLink(copyLinkBtn));
    $('pasteCodeBtn').addEventListener('click', presets.promptLoadCode);

    const micBtn = $('micBtn');
    const audioFileInput = $('audioFileInput');
    const audioDot = $('audioDot');
    const audioText = $('audioText');
    const audioBandsLabel = $('audioBands');

    micBtn.addEventListener('click', async () => {
      if (audio.isMicLive()) {
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

    $('fileAudioBtn').addEventListener('click', () => audioFileInput.click());
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

    const fmtSel = $('fmtSel');
    const durSel = $('durSel');
    const recBtn = $('recBtn');
    const recDot = $('recDot');
    const recText = $('recText');
    const recTimer = $('recTimer');

    let viewport = null;
    const recorder = V.createRecorder(canvas, audio, (isRec, label) => {
      if (viewport) viewport.setLocked(isRec);
      fmtSel.disabled = isRec;
      durSel.disabled = isRec;
      recBtn.classList.toggle('recording', isRec);
      recBtn.textContent = isRec ? '■ Stop' : '● Record';
      recDot.classList.toggle('live', isRec);
      recText.textContent = label;
    });

    viewport = V.createViewport(canvas, engine, recorder, {
      ratioSel: $('ratioSel'),
      customRatioRow: $('customRatioRow'),
      ratioW: $('ratioW'),
      ratioH: $('ratioH'),
      resSel: $('resSel'),
      dimLabel: $('dimLabel')
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
    $('snapBtn').addEventListener('click', () => recorder.requestSnap());

    const input = V.bindInput(canvas, engine, viewport, {
      onTogglePanel: togglePanel,
      onToggleFreeze: toggleFreeze,
      onTogglePause: togglePause,
      onVJ: runVJ,
      onZoom() {
        pZoom.value = String(V.state.zoom);
        vZoom.textContent = V.state.zoom.toFixed(2);
      }
    });

    syncUIFromState();

    let lastHudMs = 0;
    let lastRecStr = '';
    let lastAudioStr = '';
    const onFps = fps => {
      if (!panel.classList.contains('hidden')) fpsLabel.textContent = `${fps} fps`;
    };
    const onSnap = () => recorder.flushSnap();

    function loop(now) {
      if (now - lastHudMs >= V.HUD_UPDATE_MS && !panel.classList.contains('hidden')) {
        lastHudMs = now;
        if (recorder.isRecording()) {
          const recStr = recorder.formatTime(recorder.getElapsedSec(now));
          if (recStr !== lastRecStr) {
            lastRecStr = recStr;
            recTimer.textContent = recStr;
          }
        }
        const b = audio.bands;
        const audioStr = `B ${Math.round(b[0] * 9)} · M ${Math.round(b[1] * 9)} · H ${Math.round(b[2] * 9)}`;
        if (audioStr !== lastAudioStr) {
          lastAudioStr = audioStr;
          audioBandsLabel.textContent = audioStr;
        }
      }

      engine.tick(now, input.isOrbiting(), onFps, onSnap);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  } catch (err) {
    V.showError(err && err.stack ? err.stack : err);
  }
})();