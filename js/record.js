(() => {
  const V = window.VORTEX;

  const FORMATS = [
    { label: 'MP4 (H.264)', mime: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4' },
    { label: 'MP4',         mime: 'video/mp4',                    ext: 'mp4' },
    { label: 'WebM (VP9)',  mime: 'video/webm;codecs=vp9',        ext: 'webm' },
    { label: 'WebM (VP8)',  mime: 'video/webm;codecs=vp8',        ext: 'webm' },
    { label: 'WebM',        mime: 'video/webm',                   ext: 'webm' }
  ];

  function createRecorder(canvas, audio, onStateChange) {
    const supported = (typeof MediaRecorder !== 'undefined' && canvas.captureStream)
      ? FORMATS.filter(f => MediaRecorder.isTypeSupported(f.mime))
      : [];

    let recorder = null;
    let chunks = [];
    let startMs = 0;
    let stopTimer = 0;
    let snapNext = false;

    function isRecording() {
      return Boolean(recorder && recorder.state === 'recording');
    }

    function stop() {
      if (stopTimer) { clearTimeout(stopTimer); stopTimer = 0; }
      if (isRecording()) recorder.stop();
    }

    function start(fmtIndex, autoSec) {
      const fmt = supported[fmtIndex] || supported[0];
      if (!fmt || isRecording()) return;

      chunks = [];
      const canvasStream = canvas.captureStream(60);
      const stream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audio.getAudioTracks()
      ]);

      recorder = new MediaRecorder(stream, {
        mimeType: fmt.mime,
        videoBitsPerSecond: V.VIDEO_BITRATE
      });

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: fmt.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vortex-${canvas.width}x${canvas.height}.${fmt.ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        canvasStream.getTracks().forEach(t => t.stop());
        recorder = null;
        onStateChange(false, 'Saved');
      };

      recorder.start(250);
      startMs = performance.now();
      onStateChange(true, 'Recording');

      const maxMs = autoSec > 0 ? autoSec * 1000 : V.MAX_RECORD_MS;
      stopTimer = setTimeout(stop, maxMs);
    }

    function getElapsedSec(now) {
      return isRecording() ? (now - startMs) * 0.001 : 0;
    }

    function formatTime(sec) {
      const m = String(Math.floor(sec / 60)).padStart(2, '0');
      const s = (sec % 60).toFixed(1).padStart(4, '0');
      return `${m}:${s}`;
    }

    function requestSnap() {
      snapNext = true;
    }

    function flushSnap() {
      if (!snapNext) return;
      snapNext = false;
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

    return { supported, isRecording, start, stop, getElapsedSec, formatTime, requestSnap, flushSnap };
  }

  V.createRecorder = createRecorder;
})();