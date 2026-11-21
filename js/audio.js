(() => {
  const V = window.VORTEX;

  function createAudio() {
    let ctx = null;
    let analyser = null;
    let data = null;
    let source = null;
    let elem = null;
    let dest = null;
    let peak = 0.25;
    const bands = [0, 0, 0];

    function stop() {
      if (source) {
        try { source.disconnect(); } catch (_) {}
        source = null;
      }
      if (elem) {
        elem.pause();
        elem.src = '';
        elem = null;
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
    }

    async function startFile(file) {
      stop();
      ensureCtx();
      elem = new Audio();
      elem.crossOrigin = 'anonymous';
      elem.loop = true;
      elem.src = URL.createObjectURL(file);
      source = ctx.createMediaElementSource(elem);
      source.connect(analyser);
      source.connect(ctx.destination);
      source.connect(dest);
      await elem.play();
    }

    function sample() {
      if (!analyser || !source) {
        bands[0] *= 0.9;
        bands[1] *= 0.9;
        bands[2] *= 0.9;
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
      peak = Math.max(top, peak * 0.992);
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

    return { startMic, startFile, stop, sample, getAudioTracks, bands };
  }

  V.createAudio = createAudio;
})();