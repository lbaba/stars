(() => {
  const V = window.VORTEX;

  function hslToHex(h, s, l) {
    const hue = ((h % 1) + 1) % 1;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((hue * 6) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    const sec = Math.floor(hue * 6);
    if (sec === 0) { r = c; g = x; }
    else if (sec === 1) { r = x; g = c; }
    else if (sec === 2) { g = c; b = x; }
    else if (sec === 3) { g = x; b = c; }
    else if (sec === 4) { r = x; b = c; }
    else { r = c; b = x; }
    return V.rgbToHex(r + m, g + m, b + m);
  }

  function harmoniousPalette(inkMode) {
    const baseH = Math.random();
    const scheme = Math.floor(Math.random() * 4);
    const shiftB = scheme === 0 ? 0.5 : (scheme === 1 ? 0.33 : (scheme === 2 ? 0.12 : 0.42));
    const shiftC = scheme === 1 ? 0.66 : -shiftB * 0.5;
    if (inkMode) {
      return {
        bg: hslToHex(baseH, 0.14, 0.93),
        dark: hslToHex(baseH, 0.25, 0.08),
        mid: hslToHex(baseH + shiftB * 0.3, 0.32, 0.26),
        bright: hslToHex(baseH + shiftB, 0.35, 0.48),
        light1Col: '#ffffff',
        light2Col: hslToHex(baseH, 0.2, 0.8),
        light3Col: hslToHex(baseH + shiftC, 0.25, 0.7),
        mixMode: 2,
        material: V.MATERIAL.INK,
        glow: 0,
        additive: 0
      };
    }
    return {
      bg: hslToHex(baseH, 0.35, 0.03),
      dark: hslToHex(baseH, 0.55, 0.14),
      mid: hslToHex(baseH + shiftB * 0.5, 0.78, 0.48),
      bright: hslToHex(baseH + shiftB, 0.85, 0.84),
      light1Col: hslToHex(baseH + shiftC, 0.5, 0.86),
      light2Col: hslToHex(baseH + shiftB, 0.75, 0.68),
      light3Col: hslToHex(baseH - shiftB * 0.6, 0.8, 0.62),
      mixMode: Math.random() < 0.35 ? 1 : 0,
      glow: 0.25 + Math.random() * 0.55,
      additive: Math.random() < 0.4 ? 0.25 + Math.random() * 0.6 : 0
    };
  }

  function encodeState(obj) {
    const clean = V.sanitizeRecipe(obj);
    const bytes = new TextEncoder().encode(JSON.stringify(clean));
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeState(code) {
    if (typeof code !== 'string' || code.length > V.MAX_RECIPE_BYTES * 1.4) return null;
    const bin = atob(code.trim().replace(/-/g, '+').replace(/_/g, '/'));
    if (bin.length > V.MAX_RECIPE_BYTES) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch (_) {
      text = bin;
    }
    return V.safeDecodeJson(text);
  }

  function createPresets(engine, syncUI) {
    function applyLook(obj) {
      V.applyPatch(obj, word => engine.masks.setWord(word));
      engine.setBackgroundMode(V.state.bgMode);
      syncUI();
      engine.clearTrails();
    }

    function varyPalette() {
      const inkMode = Math.random() < 0.18;
      const pal = harmoniousPalette(inkMode);
      pal.colorDriver = Math.floor(Math.random() * 5);
      if (pal.colorDriver === 3 && !engine.masks.hasPhoto) pal.colorDriver = 0;
      pal.hueDrift = Math.random() < 0.45 ? Math.random() * 0.24 : 0;
      if (V.state.bgMode === V.BG_MODE.TRANSPARENT) pal.bgMode = V.BG_MODE.TRANSPARENT;
      applyLook(pal);
    }

    function varyForm() {
      const shapes = [0, 1, 2, 3, 4, 6, 7, 8, 9];
      applyLook({
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        formA: 1.5 + Math.random() * 8.5,
        formB: 0.8 + Math.random() * 6.5,
        formC: 0.2 + Math.random() * 1.4,
        surfaceFlow: 0.25 + Math.random() * 0.75,
        layerMode: Math.floor(Math.random() * 5),
        dotShape: Math.floor(Math.random() * 6),
        mirror: Math.random() < 0.3 ? Math.floor(Math.random() * 6) : 0
      });
    }

    function varyLight() {
      const mats = [0, 1, 2, 3, 4, 6];
      applyLook({
        material: mats[Math.floor(Math.random() * mats.length)],
        light1: 0.75 + Math.random() * 1.25,
        rim: 0.2 + Math.random() * 1.3,
        light3: Math.random() < 0.65 ? 0.3 + Math.random() * 0.9 : 0,
        specular: 0.3 + Math.random() * 1.4,
        dof: Math.random() < 0.5 ? Math.random() * 0.45 : 0,
        fog: Math.random() < 0.4 ? Math.random() * 0.4 : 0,
        pulse: Math.random() < 0.35 ? Math.random() * 0.6 : 0,
        lens: Math.random() < 0.22 ? (Math.random() < 0.5 ? 7 : Math.floor(Math.random() * 7)) : 0
      });
    }

    function varyMotion() {
      applyLook({
        integrator: Math.floor(Math.random() * 3),
        curl: 0.8 + Math.random() * 2.1,
        freq: 0.65 + Math.random() * 1.6,
        swirl: 0.6 + Math.random() * 2.5,
        silk: Math.random(),
        trails: Math.random() < 0.5 ? 0 : 0.18 + Math.random() * 0.52,
        shutter: 0.012 + Math.random() * 0.036
      });
    }

    function applyChaos() {
      const inkMode = Math.random() < 0.16;
      const pal = harmoniousPalette(inkMode);
      const shapes = [0, 1, 2, 3, 4, 6, 7, 8, 9];
      applyLook(Object.assign(pal, {
        colorDriver: Math.floor(Math.random() * 3),
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        formA: 1.5 + Math.random() * 8.5,
        formB: 0.8 + Math.random() * 6.5,
        formC: 0.2 + Math.random() * 1.4,
        surfaceFlow: 0.25 + Math.random() * 0.75,
        layerMode: Math.floor(Math.random() * 5),
        dotShape: Math.floor(Math.random() * 6),
        material: inkMode ? V.MATERIAL.INK : Math.floor(Math.random() * 5),
        specular: 0.4 + Math.random() * 1.2,
        light3: Math.random() < 0.6 ? 0.35 + Math.random() * 0.85 : 0,
        mirror: Math.random() < 0.28 ? Math.floor(Math.random() * 6) : 0,
        curl: 0.9 + Math.random() * 1.9,
        freq: 0.7 + Math.random() * 1.5,
        swirl: 0.7 + Math.random() * 2.4,
        silk: Math.random(),
        trails: Math.random() < 0.5 ? 0 : 0.2 + Math.random() * 0.45,
        split: Math.random() < 0.4 ? Math.random() * 0.35 : 0,
        lens: 0
      }));
    }

    function loadCode(code) {
      try {
        const raw = decodeState(code);
        if (!raw) return false;
        applyLook(raw);
        return true;
      } catch (_) {
        return false;
      }
    }

    function loadFromHash() {
      if (location.hash.startsWith('#s=')) {
        loadCode(location.hash.slice(3));
      }
    }

    function copyShareLink(btn) {
      const code = encodeState(V.state);
      const url = location.href.split('#')[0] + '#s=' + code;
      history.replaceState(null, '', '#s=' + code);
      V.copyText(url).then(ok => {
        btn.textContent = ok ? 'Copied!' : 'Copy failed';
        setTimeout(() => { btn.textContent = 'Copy Link'; }, 1200);
      });
    }

    function promptLoadCode() {
      const input = prompt('Paste preset code, JSON, or full link:');
      if (!input) return;
      const trimmed = input.trim();
      if (trimmed.startsWith('{')) {
        const parsed = V.safeDecodeJson(trimmed);
        if (parsed) { applyLook(parsed); return; }
      }
      const code = trimmed.includes('#s=') ? trimmed.split('#s=')[1] : trimmed;
      if (!loadCode(code)) V.showError('Invalid or oversized preset rejected safely.');
    }

    return {
      applyLook, varyPalette, varyForm, varyLight, varyMotion,
      applyChaos, loadCode, loadFromHash, copyShareLink, promptLoadCode
    };
  }

  V.createPresets = createPresets;
})();