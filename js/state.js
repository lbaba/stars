window.VORTEX = (() => {
  const MAX_DOTS = 240000;
  const MIN_DOTS = 20000;
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
  const MAX_RECIPE_BYTES = 65536;
  const MAX_JSON_DEPTH = 6;
  const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
  const MAX_IMAGE_DIM = 4096;
  const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
  const TAG_NAME_RE = /^[a-z][a-z0-9-]*-[a-z0-9-]+$/;

  const SHAPE = {
    BALL: 0,
    RING: 1,
    WAVE: 2,
    TWIN: 3,
    FLOAT: 4,
    WORD: 5,
    SUPERFORM: 6,
    KNOT: 7,
    ATTRACTOR: 8,
    SDF: 9,
    BLACK_HOLE: 10,
    SPIRAL_GALAXY: 11,
    QUASAR_VORTEX: 12,
    COLLIDING_GALAXIES: 13,
    COSMIC_NEBULA: 14
  };

  const INTEGRATOR = {
    FLOW: 0,
    INERTIA: 1,
    LOOP: 2
  };

  const MATERIAL = {
    SMOKE: 0,
    SILK: 1,
    METAL: 2,
    IRIDESCENT: 3,
    PLASMA: 4,
    INK: 5,
    METABALL: 6
  };

  const LAYER_MODE = {
    SINGLE: 0,
    CORE_HALO: 1,
    CORE_DUST: 2,
    DUAL_SPIN: 3,
    TRIO: 4
  };

  const TOOL = {
    ORBIT: 0,
    BRUSH: 1,
    PIN: 2
  };

  const BG_MODE = {
    CUSTOM: 0,
    BLACK: 1,
    WHITE: 2,
    TRANSPARENT: 3
  };

  const EMBED_ROLES = ['background', 'orb', 'loader', 'logo', 'widget'];
  const POINTER_MODES = ['local', 'window', 'none'];
  const REDUCED_MODES = ['none', 'calm', 'static'];

  const PRESET_STATES = {
    idle: {},
    hover: { speed: 1.35, zoom: 1.56, glow: 0.45, light1: 1.25 },
    thinking: { speed: 1.85, swirl: 2.8, curl: 2.2, pulse: 0.65, hueDrift: 0.18 },
    active: { speed: 2.1, zoom: 1.65, glow: 0.72, light1: 1.55, rim: 1.05, pulse: 0.45 },
    loading: { speed: 1.4, swirl: 2.4, pulse: 0.35 }
  };

  const LIMITS = {
    speed: [-2.0, 2.5], curl: [0.2, 3.5], freq: [0.4, 2.8], swirl: [0, 4.0],
    silk: [0, 1], wind: [-2.5, 2.5], gravity: [-2.5, 2.5], dots: [20, 240],
    orbit: [0, 1.2], zoom: [0.6, 2.8], shutter: [0.004, 0.07], contrast: [0.6, 3.2],
    opacity: [0.2, 2.0], trails: [0, 0.95], glow: [0, 1.4], split: [0, 1.0],
    grain: [0, 0.25], hueDrift: [0, 1], light1: [0.2, 2.4], rim: [0, 2.0],
    light3: [0, 2.0], lightAngle: [0, 6.28], pulse: [0, 1.0], audioPush: [0, 2.0],
    mirrorSpin: [-1.5, 1.5], shape: [0, 14], colorDriver: [0, 4], mixMode: [0, 2],
    lightMode: [0, 2], dotShape: [0, 5], mirror: [0, 5], lens: [0, 7],
    fpsStep: [0, 60], bgMode: [0, 3], monoInvert: [0, 1],
    formA: [0, 12], formB: [0, 12], formC: [0, 2], surfaceFlow: [0, 1],
    integrator: [0, 2], loopSec: [2, 30], layerMode: [0, 4],
    material: [0, 6], specular: [0, 2], dof: [0, 1], fog: [0, 1],
    additive: [0, 1], toneMap: [0, 1], seed: [1, 999999],
    scrollReact: [0, 1]
  };

  const COLOR_KEYS = ['bg', 'dark', 'mid', 'bright', 'light1Col', 'light2Col', 'light3Col'];

  const MORPH_NUM_KEYS = [
    'curl', 'freq', 'swirl', 'silk', 'zoom', 'shutter', 'contrast', 'opacity',
    'glow', 'trails', 'split', 'light1', 'rim', 'light3', 'specular',
    'formA', 'formB', 'formC', 'surfaceFlow', 'dof', 'fog', 'additive'
  ];
  const MORPH_COL_KEYS = COLOR_KEYS.slice();

  const LOOKS = [
    {
      name: 'Original Mono',
      bg: '#000000', dark: '#101010', mid: '#8e8e8e', bright: '#ffffff',
      light1Col: '#ffffff', light2Col: '#dce8ff', light3Col: '#7098ff',
      colorDriver: 0, mixMode: 0, material: 0, layerMode: 0, shape: 0, dotShape: 0,
      hueDrift: 0, glow: 0.2, trails: 0, split: 0, contrast: 1.75, opacity: 1.0,
      lens: 0, specular: 0.35, light3: 0, dof: 0, fog: 0, additive: 0, toneMap: 1, bgMode: 0
    },
    {
      name: 'Gargantua Black Hole',
      bg: '#020204', dark: '#240902', mid: '#f57c1f', bright: '#fff5d6',
      light1Col: '#ffd89b', light2Col: '#ff6b1a', light3Col: '#fff0c2',
      colorDriver: 1, mixMode: 1, material: 4, layerMode: 0, shape: 10, dotShape: 0,
      formA: 3.5, formB: 1.6, formC: 0.55, surfaceFlow: 0.7, integrator: 0,
      speed: 1.15, curl: 0.85, swirl: 1.4, shutter: 0.028, zoom: 1.35,
      hueDrift: 0, glow: 0.72, trails: 0.32, split: 0.08, contrast: 1.45, opacity: 0.92,
      lens: 0, specular: 0.9, light3: 0.6, dof: 0.14, fog: 0.1, additive: 0.95, toneMap: 1, bgMode: 0
    },
    {
      name: 'Andromeda Spiral',
      bg: '#02030a', dark: '#0e1338', mid: '#6366f1', bright: '#fef0c7',
      light1Col: '#fde68a', light2Col: '#818cf8', light3Col: '#38bdf8',
      colorDriver: 1, mixMode: 1, material: 1, layerMode: 2, shape: 11, dotShape: 1,
      formA: 4.0, formB: 3.8, formC: 0.45, surfaceFlow: 0.6, integrator: 0,
      speed: 0.9, curl: 0.7, swirl: 1.1, shutter: 0.02, zoom: 1.32,
      hueDrift: 0.03, glow: 0.58, trails: 0.28, split: 0.06, contrast: 1.5, opacity: 0.95,
      lens: 0, specular: 0.85, light3: 0.75, dof: 0.22, fog: 0.15, additive: 0.85, toneMap: 1, bgMode: 0
    },
    {
      name: 'Quasar Blazar',
      bg: '#03020a', dark: '#1e0b40', mid: '#06b6d4', bright: '#f5d0fe',
      light1Col: '#67e8f9', light2Col: '#e879f9', light3Col: '#38bdf8',
      colorDriver: 1, mixMode: 1, material: 4, layerMode: 0, shape: 12, dotShape: 0,
      formA: 4.5, formB: 4.2, formC: 0.65, surfaceFlow: 0.75, integrator: 0,
      speed: 1.25, curl: 0.9, swirl: 1.6, shutter: 0.032, zoom: 1.35,
      hueDrift: 0.06, glow: 0.76, trails: 0.36, split: 0.14, contrast: 1.4, opacity: 0.88,
      lens: 0, specular: 1.0, light3: 0.8, dof: 0.12, fog: 0.12, additive: 1.0, toneMap: 1, bgMode: 0
    },
    {
      name: 'Colliding Galaxies',
      bg: '#020208', dark: '#240b2c', mid: '#ec4899', bright: '#bae6fd',
      light1Col: '#fbcfe8', light2Col: '#38bdf8', light3Col: '#fbbf24',
      colorDriver: 4, mixMode: 1, material: 3, layerMode: 3, shape: 13, dotShape: 0,
      formA: 5.0, formB: 3.5, formC: 0.75, surfaceFlow: 0.6, integrator: 0,
      speed: 1.0, curl: 0.75, swirl: 1.2, shutter: 0.024, zoom: 1.28,
      hueDrift: 0.05, glow: 0.62, trails: 0.34, split: 0.1, contrast: 1.5, opacity: 0.9,
      lens: 0, specular: 0.95, light3: 0.7, dof: 0.18, fog: 0.12, additive: 0.9, toneMap: 1, bgMode: 0
    },
    {
      name: 'Wormhole Nebula',
      bg: '#030208', dark: '#0f172a', mid: '#8b5cf6', bright: '#a7f3d0',
      light1Col: '#c4b5fd', light2Col: '#34d399', light3Col: '#38bdf8',
      colorDriver: 2, mixMode: 1, material: 3, layerMode: 2, shape: 14, dotShape: 0,
      formA: 4.2, formB: 5.0, formC: 0.8, surfaceFlow: 0.7, integrator: 2, loopSec: 10,
      speed: 1.1, curl: 0.95, swirl: 1.5, shutter: 0.026, zoom: 1.38,
      hueDrift: 0.08, glow: 0.66, trails: 0.3, split: 0.12, contrast: 1.5, opacity: 0.92,
      lens: 0, specular: 1.1, light3: 0.7, dof: 0.2, fog: 0.15, additive: 0.85, toneMap: 1, bgMode: 0
    },
    {
      name: 'AI Pulse Orb',
      bg: '#000000', dark: '#0b1840', mid: '#3b82f6', bright: '#e0f7ff',
      light1Col: '#93c5fd', light2Col: '#c084fc', light3Col: '#38bdf8',
      colorDriver: 0, mixMode: 0, material: 3, layerMode: 1, shape: 9, dotShape: 0,
      formA: 2.0, formB: 1.5, formC: 0.4, surfaceFlow: 0.72, integrator: 2, loopSec: 8,
      hueDrift: 0.08, glow: 0.55, trails: 0.28, split: 0.06, contrast: 1.55, opacity: 1.05,
      lens: 0, specular: 0.9, light3: 0.65, dof: 0.2, fog: 0.1, additive: 0.35, toneMap: 1,
      bgMode: 3, embedRole: 'orb'
    },
    {
      name: 'Silk Hero BG',
      bg: '#05070d', dark: '#12182b', mid: '#4b6594', bright: '#e6f0ff',
      light1Col: '#ffffff', light2Col: '#60a5fa', light3Col: '#a78bfa',
      colorDriver: 2, mixMode: 0, material: 1, layerMode: 2, shape: 2, dotShape: 0,
      surfaceFlow: 0.5, integrator: 0, hueDrift: 0.04, glow: 0.35, trails: 0.22,
      split: 0.04, contrast: 1.65, opacity: 0.92, lens: 0, specular: 1.15, light3: 0.45,
      dof: 0.28, fog: 0.35, additive: 0.15, toneMap: 1, bgMode: 0, embedRole: 'background'
    },
    {
      name: 'Quantum Loader',
      bg: '#000000', dark: '#0f2027', mid: '#06b6d4', bright: '#f0fdfa',
      light1Col: '#67e8f9', light2Col: '#818cf8', light3Col: '#22d3ee',
      colorDriver: 1, mixMode: 0, material: 1, layerMode: 1, shape: 7, dotShape: 0,
      formA: 3.0, formB: 5.0, formC: 0.35, surfaceFlow: 0.65, integrator: 2, loopSec: 6,
      hueDrift: 0, glow: 0.48, trails: 0.32, split: 0.05, contrast: 1.5, opacity: 1.0,
      lens: 0, specular: 0.95, light3: 0.5, dof: 0.12, fog: 0, additive: 0.45, toneMap: 1,
      bgMode: 3, embedRole: 'loader'
    },
    {
      name: 'Iridescent Superform',
      bg: '#04040a', dark: '#1f1042', mid: '#ec4899', bright: '#a5f3fc',
      light1Col: '#fde68a', light2Col: '#38bdf8', light3Col: '#f472b6',
      colorDriver: 4, mixMode: 0, material: 3, layerMode: 4, shape: 6, dotShape: 2,
      formA: 6.0, formB: 1.8, formC: 0.85, surfaceFlow: 0.6, integrator: 0,
      hueDrift: 0.12, glow: 0.42, trails: 0.18, split: 0.1, contrast: 1.6, opacity: 1.05,
      lens: 0, specular: 1.3, light3: 0.8, dof: 0.18, fog: 0.15, additive: 0.2, toneMap: 1, bgMode: 0
    },
    {
      name: 'Attractor Nebula',
      bg: '#030208', dark: '#240b36', mid: '#c31432', bright: '#ffd27d',
      light1Col: '#ffb36b', light2Col: '#6366f1', light3Col: '#f43f5e',
      colorDriver: 1, mixMode: 1, material: 4, layerMode: 2, shape: 8, dotShape: 1,
      formA: 4.5, formB: 2.0, formC: 0.7, integrator: 0,
      hueDrift: 0.06, glow: 0.68, trails: 0.42, split: 0.14, contrast: 1.45, opacity: 0.85,
      lens: 0, specular: 0.6, light3: 0.55, dof: 0.25, fog: 0.2, additive: 0.85, toneMap: 1, bgMode: 0
    },
    {
      name: 'Liquid Chrome',
      bg: '#08090d', dark: '#1b2230', mid: '#8d9cb3', bright: '#f8fbff',
      light1Col: '#ffffff', light2Col: '#93c5fd', light3Col: '#fcd34d',
      colorDriver: 0, mixMode: 0, material: 2, layerMode: 0, shape: 9, dotShape: 1,
      formA: 5.5, formB: 2.5, formC: 0.9, surfaceFlow: 0.82, integrator: 0,
      hueDrift: 0, glow: 0.3, trails: 0.16, split: 0.08, contrast: 2.0, opacity: 1.25,
      lens: 7, specular: 1.75, light3: 0.75, dof: 0.1, fog: 0.08, additive: 0, toneMap: 1, bgMode: 0
    },
    {
      name: 'Ink on Paper',
      bg: '#f2eee6', dark: '#08080a', mid: '#2f323b', bright: '#737887',
      light1Col: '#ffffff', light2Col: '#d9cbb8', light3Col: '#c4b5a0',
      colorDriver: 0, mixMode: 2, material: 5, layerMode: 0, shape: 0, dotShape: 0,
      hueDrift: 0, glow: 0, trails: 0.25, split: 0, contrast: 1.4, opacity: 0.9,
      lens: 0, specular: 0.1, light3: 0, dof: 0.08, fog: 0, additive: 0, toneMap: 0, bgMode: 0
    },
    {
      name: 'Solar Fire',
      bg: '#050202', dark: '#360702', mid: '#e8450a', bright: '#fff3b8',
      light1Col: '#ffbe6b', light2Col: '#ff4d24', light3Col: '#ffd166',
      colorDriver: 1, mixMode: 1, material: 4, layerMode: 3, shape: 0, dotShape: 0,
      hueDrift: 0, glow: 0.7, trails: 0.35, split: 0.15, contrast: 1.5, opacity: 0.8,
      lens: 0, specular: 0.5, light3: 0.5, dof: 0.15, fog: 0.1, additive: 1.0, toneMap: 1, bgMode: 0
    },
    {
      name: 'Deep Ocean',
      bg: '#02070d', dark: '#041d30', mid: '#0d88b5', bright: '#b8fff9',
      light1Col: '#8ceeff', light2Col: '#2463ff', light3Col: '#00f5d4',
      colorDriver: 2, mixMode: 0, material: 1, layerMode: 2, shape: 1, dotShape: 1,
      hueDrift: 0.08, glow: 0.45, trails: 0.3, split: 0.08, contrast: 1.65, opacity: 1.05,
      lens: 0, specular: 0.8, light3: 0.45, dof: 0.25, fog: 0.25, additive: 0.2, toneMap: 1, bgMode: 0
    }
  ];

  function createDefaultState() {
    return {
      bg: '#000000', dark: '#101010', mid: '#8e8e8e', bright: '#ffffff',
      light1Col: '#ffffff', light2Col: '#dce8ff', light3Col: '#7098ff',
      colorDriver: 0, mixMode: 0, hueDrift: 0,
      lightMode: 0, light1: 1.0, rim: 0.45, light3: 0.0, lightAngle: 0.8, pulse: 0,
      material: 0, specular: 0.45, dof: 0, fog: 0, additive: 0, toneMap: 1,
      shape: 0, formA: 3.0, formB: 2.0, formC: 0.5, surfaceFlow: 0.45,
      integrator: 0, loopSec: 8, layerMode: 0,
      speed: 1.0, curl: 1.55, freq: 1.15, swirl: 1.8,
      silk: 0.5, wind: 0, gravity: 0, dots: 150, fpsStep: 0,
      dotShape: 0, mirror: 0, mirrorSpin: 0, lens: 0,
      orbit: 0.14, zoom: 1.45, shutter: 0.022, contrast: 1.75, opacity: 1.0,
      trails: 0, glow: 0.2, split: 0, grain: 0.03, audioPush: 1.0,
      bgMode: BG_MODE.CUSTOM, monoInvert: 0,
      seed: 1337, word: 'VORTEX',
      embedRole: 'background', pointerMode: 'local', scrollReact: 0.25, reducedMotion: 'none'
    };
  }

  const state = createDefaultState();

  function clampVal(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function mulberry32(seed) {
    let a = (Number(seed) | 0) || 1337;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexToRgbInto(hex, out) {
    const clean = typeof hex === 'string' && HEX_COLOR_RE.test(hex) ? hex : '#ffffff';
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

  function srgbToLin(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function linToSrgb(c) {
    const v = Math.min(1, Math.max(0, c));
    return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  }

  function rgbToOklab(r, g, b) {
    const lr = srgbToLin(r);
    const lg = srgbToLin(g);
    const lb = srgbToLin(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ];
  }

  function oklabToRgb(L, a, b) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    return [
      linToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    ];
  }

  function mixHexOklab(hexA, hexB, t) {
    const ca = hexToRgb(hexA);
    const cb = hexToRgb(hexB);
    const oa = rgbToOklab(ca[0], ca[1], ca[2]);
    const ob = rgbToOklab(cb[0], cb[1], cb[2]);
    const rgb = oklabToRgb(
      oa[0] + (ob[0] - oa[0]) * t,
      oa[1] + (ob[1] - oa[1]) * t,
      oa[2] + (ob[2] - oa[2]) * t
    );
    return rgbToHex(rgb[0], rgb[1], rgb[2]);
  }

  function mixHex(a, b, t) {
    return mixHexOklab(a, b, t);
  }

  function checkDepth(val, depth) {
    if (depth > MAX_JSON_DEPTH) return false;
    if (!val || typeof val !== 'object') return true;
    const vals = Array.isArray(val) ? val : Object.values(val);
    for (let i = 0; i < vals.length; i++) {
      if (!checkDepth(vals[i], depth + 1)) return false;
    }
    return true;
  }

  function safeDecodeJson(rawText) {
    if (typeof rawText !== 'string' || rawText.length > MAX_RECIPE_BYTES) return null;
    try {
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      if (!checkDepth(parsed, 0)) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  // Reconstruct strictly from allowlisted keys to prevent prototype pollution
  function sanitizeRecipe(raw, base) {
    const out = Object.assign(createDefaultState(), base || null);
    if (!raw || typeof raw !== 'object') return out;
    const hasOwn = Object.prototype.hasOwnProperty;

    const numKeys = Object.keys(LIMITS);
    for (let i = 0; i < numKeys.length; i++) {
      const k = numKeys[i];
      if (hasOwn.call(raw, k)) {
        out[k] = clampVal(raw[k], LIMITS[k][0], LIMITS[k][1], out[k]);
      }
    }
    for (let i = 0; i < COLOR_KEYS.length; i++) {
      const k = COLOR_KEYS[i];
      if (hasOwn.call(raw, k) && typeof raw[k] === 'string' && HEX_COLOR_RE.test(raw[k])) {
        out[k] = raw[k].toLowerCase();
      }
    }
    if (hasOwn.call(raw, 'word') && typeof raw.word === 'string') {
      out.word = raw.word.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 20);
    }
    if (hasOwn.call(raw, 'embedRole') && EMBED_ROLES.includes(raw.embedRole)) {
      out.embedRole = raw.embedRole;
    }
    if (hasOwn.call(raw, 'pointerMode') && POINTER_MODES.includes(raw.pointerMode)) {
      out.pointerMode = raw.pointerMode;
    }
    if (hasOwn.call(raw, 'reducedMotion') && REDUCED_MODES.includes(raw.reducedMotion)) {
      out.reducedMotion = raw.reducedMotion;
    }
    if (hasOwn.call(raw, 'bg') && !hasOwn.call(raw, 'bgMode')) {
      out.bgMode = BG_MODE.CUSTOM;
    }
    return out;
  }

  function escapeJsonForHtml(obj) {
    return JSON.stringify(obj)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  function applyPatch(patch, onWord) {
    if (!patch || typeof patch !== 'object') return;
    const clean = sanitizeRecipe(patch, state);
    Object.assign(state, clean);
    if (Object.prototype.hasOwnProperty.call(patch, 'word') && onWord) {
      onWord(state.word);
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
    MAX_RECIPE_BYTES, MAX_JSON_DEPTH, MAX_UPLOAD_BYTES, MAX_IMAGE_DIM,
    HEX_COLOR_RE, TAG_NAME_RE,
    SHAPE, INTEGRATOR, MATERIAL, LAYER_MODE, TOOL, BG_MODE,
    EMBED_ROLES, POINTER_MODES, REDUCED_MODES, PRESET_STATES,
    LIMITS, COLOR_KEYS, LOOKS, MORPH_NUM_KEYS, MORPH_COL_KEYS,
    state, createDefaultState, clampVal, mulberry32,
    hexToRgbInto, hexToRgb, rgbToHex, mixHex, mixHexOklab,
    safeDecodeJson, sanitizeRecipe, escapeJsonForHtml, applyPatch, showError
  };
})();