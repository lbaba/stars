(() => {
  const V = window.VORTEX;

  function createAudio() {
    let ctx = null;
    let analyser = null;
    let data = null;
    let source = null;
    let micStream = null;
    let elem = null;
    let elemUrl = '';
    let dest = null;
    let peak = 0.25;
    const bands = [0, 0, 0];

    function stop() {
      if (source) {
        try { source.disconnect(); } catch (_) {}
        source = null;
      }
      if (micStream) {
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;
      }
      if (elem) {
        elem.pause();
        elem.src = '';
        elem = null;
      }
      if (elemUrl) {
        URL.revokeObjectURL(elemUrl);
        elemUrl = '';
      }
      bands[0] = bands[1] = bands[2] = 0;
    }

    function ensureCtx() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) throw new Error('Audio input not supported.');
        ctx = new AC();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.78;
        data = new Uint8Array(analyser.frequencyBinCount);
        dest = ctx.createMediaStreamDestination();
      }
      if (ctx.state === 'suspended') ctx.resume();
    }

    async function startMic() {
      stop();
      ensureCtx();
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      source = ctx.createMediaStreamSource(micStream);
      source.connect(analyser);
    }

    async function startFile(file) {
      stop();
      ensureCtx();
      elemUrl = URL.createObjectURL(file);
      elem = new Audio();
      elem.crossOrigin = 'anonymous';
      elem.loop = true;
      elem.src = elemUrl;
      source = ctx.createMediaElementSource(elem);
      source.connect(analyser);
      source.connect(ctx.destination);
      source.connect(dest);
      await elem.play();
    }

    function sample(dt) {
      const step = (dt || 1 / V.REF_FPS) * V.REF_FPS;
      if (!analyser || !source) {
        const k = Math.pow(0.9, step);
        bands[0] = bands[0] * k < 0.0005 ? 0 : bands[0] * k;
        bands[1] = bands[1] * k < 0.0005 ? 0 : bands[1] * k;
        bands[2] = bands[2] * k < 0.0005 ? 0 : bands[2] * k;
        return bands;
      }
      analyser.getByteFrequencyData(data);
      let b = 0, m = 0, h = 0;
      for (let i = 0; i < 10; i++) b += data[i];
      for (let i = 10; i < 44; i++) m += data[i];
      for (let i = 44; i < 100; i++) h += data[i];
      b /= 10 * 255;
      m /= 34 * 255;
      h /= 56 * 255;

      const top = Math.max(b, m, h, 0.08);
      peak = Math.max(top, peak * Math.pow(0.992, step));
      const gain = V.state.audioPush / peak;
      bands[0] = Math.min(1.5, b * gain);
      bands[1] = Math.min(1.5, m * gain);
      bands[2] = Math.min(1.5, h * gain);
      return bands;
    }

    function getAudioTracks() {
      if (dest && elem && !elem.paused) return dest.stream.getAudioTracks();
      return [];
    }

    function isMicLive() {
      return Boolean(micStream);
    }

    return { startMic, startFile, stop, sample, getAudioTracks, isMicLive, bands };
  }

  V.createAudio = createAudio;
})();