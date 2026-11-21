window.Vortex = window.Vortex || {};

(function (V) {
  const FORMATS = [
    { label: 'MP4 (H.264)', mime: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4' },
    { label: 'MP4',         mime: 'video/mp4',                    ext: 'mp4' },
    { label: 'WebM (VP9)',  mime: 'video/webm;codecs=vp9',        ext: 'webm' },
    { label: 'WebM (VP8)',  mime: 'video/webm;codecs=vp8',        ext: 'webm' },
    { label: 'WebM',        mime: 'video/webm',                   ext: 'webm' }
  ];

  V.createMedia = function (canvas, state) {
    let audioCtx = null;
    let audioAnalyser = null;
    let audioData = null;
    let audioSource = null;
    let audioElem = null;
    let audioDest = null;
    let audioPeak = 0.25;
    let micLive = false;
    const bands = [0, 0, 0];

    let recorder = null;
    let recChunks = [];
    let recStart = 0;
    let recStopTimeout = 0;

    const supportedFormats = (typeof MediaRecorder !== 'undefined' && canvas.captureStream)
      ? FORMATS.filter(f => MediaRecorder.isTypeSupported(f.mime))
      : [];

    function ensureAudioCtx() {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) throw new Error('Audio not supported.');
        audioCtx = new AC();
        audioAnalyser = audioCtx.createAnalyser();
        audioAnalyser.fftSize = 256;
        audioAnalyser.smoothingTimeConstant = 0.78;
        audioData = new Uint8Array(audioAnalyser.frequencyBinCount);
        audioDest = audioCtx.createMediaStreamDestination();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function stopAudio() {
      if (audioSource) {
        try { audioSource.disconnect(); } catch (_) {}
        audioSource = null;
      }
      if (audioElem) {
        audioElem.pause();
        audioElem.src = '';
        audioElem = null;
      }
      micLive = false;
      bands[0] = bands[1] = bands[2] = 0;
    }

    async function toggleMic(onStatus) {
      if (micLive) {
        stopAudio();
        onStatus('Off', false);
        return false;
      }
      try {
        stopAudio();
        ensureAudioCtx();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioSource = audioCtx.createMediaStreamSource(stream);
        audioSource.connect(audioAnalyser);
        micLive = true;
        onStatus('Mic Live', true);
        return true;
      } catch (_) {
        onStatus('Mic blocked', false);
        return false;
      }
    }

    function loadAudioFile(file, onStatus) {
      if (!file) return;
      try {
        stopAudio();
        ensureAudioCtx();
        audioElem = new Audio();
        audioElem.crossOrigin = 'anonymous';
        audioElem.loop = true;
        audioElem.src = URL.createObjectURL(file);
        audioSource = audioCtx.createMediaElementSource(audioElem);
        audioSource.connect(audioAnalyser);
        audioSource.connect(audioCtx.destination);
        audioSource.connect(audioDest);
        audioElem.play().then(() => {
          onStatus(file.name.slice(0, 14), true);
        }).catch(() => {
          onStatus('Play failed', false);
        });
      } catch (_) {
        onStatus('Bad audio file', false);
      }
    }

    function sampleAudio() {
      if (!audioAnalyser || !audioSource) {
        bands[0] *= 0.9;
        bands[1] *= 0.9;
        bands[2] *= 0.9;
        return bands;
      }
      audioAnalyser.getByteFrequencyData(audioData);
      let b = 0, m = 0, h = 0;
      for (let i = 0; i < 10; i++) b += audioData[i];
      for (let i = 10; i < 44; i++) m += audioData[i];
      for (let i = 44; i < 100; i++) h += audioData[i];
      b /= 10 * 255;
      m /= 34 * 255;
      h /= 56 * 255;

      const top = Math.max(b, m, h, 0.08);
      audioPeak = Math.max(top, audioPeak * 0.992);
      const gain = state.audioPush / audioPeak;
      bands[0] = Math.min(1.5, b * gain);
      bands[1] = Math.min(1.5, m * gain);
      bands[2] = Math.min(1.5, h * gain);
      return bands;
    }

    function isRecording() {
      return Boolean(recorder && recorder.state === 'recording');
    }

    function stopRecording() {
      if (recStopTimeout) { clearTimeout(recStopTimeout); recStopTimeout = 0; }
      if (isRecording()) recorder.stop();
    }

    function startRecording(formatIdx, autoSec, onChange) {
      const fmt = supportedFormats[formatIdx] || supportedFormats[0];
      if (!fmt) return false;

      recChunks = [];
      const canvasStream = canvas.captureStream(60);
      const tracks = [...canvasStream.getVideoTracks()];
      if (audioDest && audioElem && !audioElem.paused) {
        tracks.push(...audioDest.stream.getAudioTracks());
      }
      const mixStream = new MediaStream(tracks);

      recorder = new MediaRecorder(mixStream, {
        mimeType: fmt.mime,
        videoBitsPerSecond: V.CONST.VIDEO_BITRATE
      });

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) recChunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(recChunks, { type: fmt.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vortex-${canvas.width}x${canvas.height}.${fmt.ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        canvasStream.getTracks().forEach(t => t.stop());
        recorder = null;
        onChange(false, 'Saved');
      };

      recorder.start(250);
      recStart = performance.now();
      onChange(true, 'Recording');

      const maxMs = autoSec > 0 ? autoSec * 1000 : V.CONST.MAX_RECORD_MS;
      recStopTimeout = setTimeout(stopRecording, maxMs);
      return true;
    }

    function getRecordElapsed(now) {
      if (!isRecording()) return null;
      const sec = (now - recStart) * 0.001;
      const m = String(Math.floor(sec / 60)).padStart(2, '0');
      const s = (sec % 60).toFixed(1).padStart(4, '0');
      return `${m}:${s}`;
    }

    function savePng() {
      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vortex-${canvas.width}x${canvas.height}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      }, 'image/png');
    }

    return {
      supportedFormats,
      toggleMic,
      loadAudioFile,
      sampleAudio,
      isRecording,
      startRecording,
      stopRecording,
      getRecordElapsed,
      savePng
    };
  };
})(window.Vortex);