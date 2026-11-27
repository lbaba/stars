(() => {
  const V = window.VORTEX;

  function randHex(minL, maxL) {
    const c = () => minL + Math.random() * (maxL - minL);
    return V.rgbToHex(c(), c(), c());
  }

  function encodeState(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function decodeState(code) {
    const bin = atob(code.trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) {
      return JSON.parse(bin);
    }
  }

  function createPresets(engine, syncUI) {
    function applyLook(obj) {
      V.applyPatch(obj, word => engine.masks.setWord(word));
      syncUI();
      engine.clearTrails();
    }

    function applyChaos() {
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
    }

    function loadCode(code) {
      try {
        const raw = decodeState(code);
        if (!raw || typeof raw !== 'object') return false;
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
      const url = location.origin + location.pathname + '#s=' + code;
      history.replaceState(null, '', '#s=' + code);
      if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Link'; }, 1200);
    }

    function promptLoadCode() {
      const input = prompt('Paste preset code or full link:');
      if (!input) return;
      const code = input.includes('#s=') ? input.split('#s=')[1] : input;
      if (!loadCode(code)) V.showError('Invalid preset code ignored safely.');
    }

    return { applyLook, applyChaos, loadCode, loadFromHash, copyShareLink, promptLoadCode };
  }

  V.createPresets = createPresets;
})();