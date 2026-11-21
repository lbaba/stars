window.Vortex = window.Vortex || {};

(function (V) {
  const HEX_RE = /^#[0-9a-f]{6}$/i;

  V.CONST = {
    MAX_DOTS: 240000,
    MIN_DOTS: 40000,
    MAX_CANVAS_PIXELS: 3840 * 2160,
    MIN_ASPECT: 0.125,
    MAX_ASPECT: 8.0,
    VIDEO_BITRATE: 16000000,
    MAX_RECORD_MS: 180000,
    LOW_FPS: 25,
    SLOW_FRAMES_TRIGGER: 24,
    MIRROR_STEPS: [0, 2, 4, 6, 8, 12],
    HEX_RE
  };

  V.LIMITS = {
    speed: [0, 2.5], curl: [0.2, 3.5], freq: [0.4, 2.8], swirl: [0, 4.0],
    silk: [0, 1], wind: [-2.5, 2.5], gravity: [-2.5, 2.5], dots: [40, 240],
    orbit: [0, 1.2], zoom: [0.6, 2.8], shutter: [0.004, 0.07], contrast: [0.6, 3.2],
    opacity: [0.2, 2.0], trails: [0, 0.95], glow: [0, 1.4], split: [0, 1.0],
    grain: [0, 0.25], hueDrift: [0, 1], light1: [0.2, 2.4], rim: [0, 2.0],
    lightAngle: [0, 6.28], pulse: [0, 1.0], audioPush: [0, 2.0],
    melt: [0, 1], photoCol: [0, 1], mirrorSpin: [-1.5, 1.5], warp: [-0.8, 0.8],
    lensBlur: [0, 1],
    shape: [0, 4], dotForm: [0, 3], colorDriver: [0, 2], mixMode: [0, 2],
    lightMode: [0, 2], mirror: [0, 12], lensMode: [0, 4], stepFps: [0, 24]
  };

  V.LOOKS = [
    {
      name: 'Original Mono',
      bg: '#000000', dark: '#101010', mid: '#8e8e8e', bright: '#ffffff',
      light1Col: '#ffffff', light2Col: '#dce8ff',
      colorDriver: 0, mixMode: 0, hueDrift: 0, glow: 0.2, trails: 0, split: 0,
      contrast: 1.75, opacity: 1.0, lensMode: 0, mirror: 0, dotForm: 0
    },
    {
      name: 'Ink on Paper',
      bg: '#f2eee6', dark: '#08080a', mid: '#2f323b', bright: '#737887',
      light1Col: '#ffffff', light2Col: '#d9cbb8',
      colorDriver: 0, mixMode: 2, hueDrift: 0, glow: 0, trails: 0.25, split: 0,
      contrast: 1.4, opacity: 0.85, lensMode: 0, mirror: 0, dotForm: 0
    },
    {
      name: 'Solar Fire',
      bg: '#050202', dark: '#360702', mid: '#e8450a', bright: '#fff3b8',
      light1Col: '#ffbe6b', light2Col: '#ff4d24',
      colorDriver: 1, mixMode: 1, hueDrift: 0, glow: 0.7, trails: 0.35, split: 0.15,
      contrast: 1.5, opacity: 0.75, lensMode: 0, mirror: 0, dotForm: 0
    },
    {
      name: 'Deep Ocean',
      bg: '#02070d', dark: '#041d30', mid: '#0d88b5', bright: '#b8fff9',
      light1Col: '#8ceeff', light2Col: '#2463ff',
      colorDriver: 2, mixMode: 0, hueDrift: 0.08, glow: 0.45, trails: 0.3, split: 0.08,
      contrast: 1.65, opacity: 1.05, lensMode: 0, mirror: 0, dotForm: 1
    },
    {
      name: 'Acid Mandala',
      bg: '#06020b', dark: '#2a064f', mid: '#ff1f9e', bright: '#4dffb8',
      light1Col: '#59ffd4', light2Col: '#ff36b8',
      colorDriver: 1, mixMode: 1, hueDrift: 0.22, glow: 0.8, trails: 0.45, split: 0.3,
      contrast: 1.35, opacity: 0.8, lensMode: 0, mirror: 8, dotForm: 3
    },
    {
      name: 'Liquid Silver',
      bg: '#090a0d', dark: '#1a2029', mid: '#7d8a9c', bright: '#f5f8ff',
      light1Col: '#ffffff', light2Col: '#7caeff',
      colorDriver: 0, mixMode: 0, hueDrift: 0, glow: 0.35, trails: 0.2, split: 0.12,
      contrast: 2.1, opacity: 1.15, lensMode: 0, mirror: 0, dotForm: 2
    },
    {
      name: 'Thermal Ghost',
      bg: '#000000', dark: '#111111', mid: '#808080', bright: '#ffffff',
      light1Col: '#ffffff', light2Col: '#ffffff',
      colorDriver: 1, mixMode: 0, hueDrift: 0, glow: 0.3, trails: 0.3, split: 0.1,
      contrast: 1.5, opacity: 1.0, lensMode: 1, mirror: 2, dotForm: 0
    }
  ];

  V.createState = function () {
    return {
      bg: '#000000', dark: '#101010', mid: '#8e8e8e', bright: '#ffffff',
      light1Col: '#ffffff', light2Col: '#dce8ff',
      colorDriver: 0, mixMode: 0, hueDrift: 0,
      lightMode: 0, light1: 1.0, rim: 0.45, lightAngle: 0.8, pulse: 0,
      shape: 0, dotForm: 0, speed: 1.0, curl: 1.55, freq: 1.15, swirl: 1.8,
      silk: 0.5, wind: 0, gravity: 0, dots: 150,
      orbit: 0.14, zoom: 1.45, shutter: 0.022, contrast: 1.75, opacity: 1.0,
      trails: 0, glow: 0.2, split: 0, grain: 0.03, audioPush: 1.0,
      melt: 0, photoCol: 0, mirror: 0, mirrorSpin: 0, lensMode: 0,
      warp: 0, lensBlur: 0, stepFps: 0, freezeSpin: false, reverse: false
    };
  };

  V.util = {
    clamp(v, min, max, fallback) {
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    },

    hexToRgb(hex) {
      const clean = HEX_RE.test(hex) ? hex : '#ffffff';
      return [
        parseInt(clean.slice(1, 3), 16) / 255,
        parseInt(clean.slice(3, 5), 16) / 255,
        parseInt(clean.slice(5, 7), 16) / 255
      ];
    },

    rgbToHex(r, g, b) {
      const ch = x => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
      return '#' + ch(r) + ch(g) + ch(b);
    },

    mixHex(a, b, t) {
      const ca = V.util.hexToRgb(a);
      const cb = V.util.hexToRgb(b);
      return V.util.rgbToHex(
        ca[0] + (cb[0] - ca[0]) * t,
        ca[1] + (cb[1] - ca[1]) * t,
        ca[2] + (cb[2] - ca[2]) * t
      );
    },

    applySafePatch(state, patch) {
      if (!patch || typeof patch !== 'object') return;
      Object.keys(patch).forEach(k => {
        if (k in V.LIMITS) {
          state[k] = V.util.clamp(patch[k], V.LIMITS[k][0], V.LIMITS[k][1], state[k]);
        } else if (typeof state[k] === 'boolean') {
          state[k] = Boolean(patch[k]);
        } else if (typeof state[k] === 'string' && HEX_RE.test(patch[k])) {
          state[k] = patch[k];
        }
      });
    }
  };
})(window.Vortex);