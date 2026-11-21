window.VORTEX = (() => {
  const MAX_DOTS = 240000;
  const MIN_DOTS = 40000;
  const MAX_CANVAS_PIXELS = 3840 * 2160;
  const MIN_ASPECT = 0.125;
  const MAX_ASPECT = 8.0;
  const VIDEO_BITRATE = 16000000;
  const MAX_RECORD_MS = 180000;
  const LOW_FPS_THRESHOLD = 28;
  const SOFT_FPS_THRESHOLD = 45;
  const RECOVER_FPS_THRESHOLD = 54;
  const SLOW_FRAMES_TRIGGER = 24;
  const MAX_FRAME_DT = 0.05;
  const REF_FPS = 60;
  const HUD_UPDATE_MS = 50;
  const TARGET_TEX_SIZE = 256;
  const BRUSH_TEX_SIZE = 64;
  const CAM_TEX_SIZE = 128;
  const MAX_PINS = 4;
  const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

  const SHAPE = {
    BALL: 0,
    RING: 1,
    WAVE: 2,
    TWIN: 3,
    FLOAT: 4,
    WORD: 5
  };

  const TOOL = {
    ORBIT: 0,
    BRUSH: 1,
    PIN: 2
  };

  const LIMITS = {
    speed: [-2.0, 2.5], curl: [0.2, 3.5], freq: [0.4, 2.8], swirl: [0, 4.0],
    silk: [0, 1], wind: [-2.5, 2.5], gravity: [-2.5, 2.5], dots: [40, 240],
    orbit: [0, 1.2], zoom: [0.6, 2.8], shutter: [0.004, 0.07], contrast: [0.6, 3.2],
    opacity: [0.2, 2.0], trails: [0, 0.95], glow: [0, 1.4], split: [0, 1.0],
    grain: [0, 0.25], hueDrift: [0, 1], light1: [0.2, 2.4], rim: [0, 2.0],
    lightAngle: [0, 6.28], pulse: [0, 1.0], audioPush: [0, 2.0],
    mirrorSpin: [-1.5, 1.5], shape: [0, 5], colorDriver: [0, 3], mixMode: [0, 2],
    lightMode: [0, 2], dotShape: [0, 3], mirror: [0, 5], lens: [0, 6],
    fpsStep: [0, 60]
  };

  const MORPH_NUM_KEYS = [
    'curl', 'freq', 'swirl', 'silk', 'zoom', 'shutter',
    'contrast', 'opacity', 'glow', 'trails', 'split', 'light1', 'rim'
  ];
  const MORPH_COL_KEYS = ['bg', 'dark', 'mid', 'bright', 'light1Col', 'light2Col'];

  const LOOKS = [
    {
      name: 'Original Mono',
      bg: '#000000', dark: '#101010', mid: '#8e8e8e', bright: '#ffffff',
      light1Col: '#ffffff', light2Col: '#dce8ff',
      colorDriver: 0, mixMode: 0, hueDrift: 0, glow: 0.2, trails: 0, split: 0, contrast: 1.75, opacity: 1.0, lens: 0
    },
    {
      name: 'Ink on Paper',
      bg: '#f2eee6', dark: '#08080a', mid: '#2f323b', bright: '#737887',
      light1Col: '#ffffff', light2Col: '#d9cbb8',
      colorDriver: 0, mixMode: 2, hueDrift: 0, glow: 0, trails: 0.25, split: 0, contrast: 1.4, opacity: 0.85, lens: 0
    },
    {
      name: 'Solar Fire',
      bg: '#050202', dark: '#360702', mid: '#e8450a', bright: '#fff3b8',
      light1Col: '#ffbe6b', light2Col: '#ff4d24',
      colorDriver: 1, mixMode: 1, hueDrift: 0, glow: 0.7, trails: 0.35, split: 0.15, contrast: 1.5, opacity: 0.75, lens: 0
    },
    {
      name: 'Deep Ocean',
      bg: '#02070d', dark: '#041d30', mid: '#0d88b5', bright: '#b8fff9',
      light1Col: '#8ceeff', light2Col: '#2463ff',
      colorDriver: 2, mixMode: 0, hueDrift: 0.08, glow: 0.45, trails: 0.3, split: 0.08, contrast: 1.65, opacity: 1.05, lens: 0
    },
    {
      name: 'Acid Neon',
      bg: '#06020b', dark: '#2a064f', mid: '#ff1f9e', bright: '#4dffb8',
      light1Col: '#59ffd4', light2Col: '#ff36b8',
      colorDriver: 1, mixMode: 1, hueDrift: 0.2, glow: 0.8, trails: 0.45, split: 0.35, contrast: 1.35, opacity: 0.8, lens: 0
    },
    {
      name: 'Liquid Silver',
      bg: '#090a0d', dark: '#1a2029', mid: '#7d8a9c', bright: '#f5f8ff',
      light1Col: '#ffffff', light2Col: '#7caeff',
      colorDriver: 0, mixMode: 0, hueDrift: 0, glow: 0.35, trails: 0.2, split: 0.12, contrast: 2.1, opacity: 1.15, lens: 0
    }
  ];

  const state = {
    bg: '#000000', dark: '#101010', mid: '#8e8e8e', bright: '#ffffff',
    light1Col: '#ffffff', light2Col: '#dce8ff',
    colorDriver: 0, mixMode: 0, hueDrift: 0,
    lightMode: 0, light1: 1.0, rim: 0.45, lightAngle: 0.8, pulse: 0,
    shape: 0, speed: 1.0, curl: 1.55, freq: 1.15, swirl: 1.8,
    silk: 0.5, wind: 0, gravity: 0, dots: 150, fpsStep: 0,
    dotShape: 0, mirror: 0, mirrorSpin: 0, lens: 0,
    orbit: 0.14, zoom: 1.45, shutter: 0.022, contrast: 1.75, opacity: 1.0,
    trails: 0, glow: 0.2, split: 0, grain: 0.03, audioPush: 1.0,
    word: 'VORTEX'
  };

  function clampVal(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function hexToRgbInto(hex, out) {
    const clean = HEX_COLOR_RE.test(hex) ? hex : '#ffffff';
    out[0] = parseInt(clean.slice(1, 3), 16) / 255;
    out[1] = parseInt(clean.slice(3, 5), 16) / 255;
    out[2] = parseInt(clean.slice(5, 7), 16) / 255;
    return out;
  }

  function hexToRgb(hex) {
    return hexToRgbInto(hex, [0, 0, 0]);
  }

  function rgbToHex(r, g, b) {
    const toHex = x => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  function mixHex(a, b, t) {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    return rgbToHex(
      ca[0] + (cb[0] - ca[0]) * t,
      ca[1] + (cb[1] - ca[1]) * t,
      ca[2] + (cb[2] - ca[2]) * t
    );
  }

  function applyPatch(patch, onWord) {
    if (!patch || typeof patch !== 'object') return;
    const keys = Object.keys(patch);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k in LIMITS) {
        state[k] = clampVal(patch[k], LIMITS[k][0], LIMITS[k][1], state[k]);
      } else if (k === 'word' && typeof patch[k] === 'string') {
        state.word = patch[k].slice(0, 20);
        if (onWord) onWord(state.word);
      } else if (typeof state[k] === 'string' && HEX_COLOR_RE.test(patch[k])) {
        state[k] = patch[k];
      }
    }
  }

  function showError(msg) {
    const box = document.getElementById('errBox');
    if (box) {
      box.textContent = String(msg);
      box.style.display = 'block';
    }
    console.error(msg);
  }

  return {
    MAX_DOTS, MIN_DOTS, MAX_CANVAS_PIXELS, MIN_ASPECT, MAX_ASPECT,
    VIDEO_BITRATE, MAX_RECORD_MS, LOW_FPS_THRESHOLD, SOFT_FPS_THRESHOLD,
    RECOVER_FPS_THRESHOLD, SLOW_FRAMES_TRIGGER, MAX_FRAME_DT, REF_FPS,
    HUD_UPDATE_MS, TARGET_TEX_SIZE, BRUSH_TEX_SIZE, CAM_TEX_SIZE, MAX_PINS,
    HEX_COLOR_RE, SHAPE, TOOL, LIMITS, LOOKS, MORPH_NUM_KEYS, MORPH_COL_KEYS,
    state, clampVal, hexToRgbInto, hexToRgb, rgbToHex, mixHex, applyPatch, showError
  };
})();