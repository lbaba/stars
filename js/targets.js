window.Vortex = window.Vortex || {};

(function (V) {
  const SAMPLE_SIZE = 200;
  const CAM_SIZE = 128;

  V.createTargetSampler = function (onUpdate, onStatus) {
    const count = V.CONST.MAX_DOTS;
    const posBuf = new Float32Array(count * 4);
    const colBuf = new Float32Array(count * 4);

    const scratch = document.createElement('canvas');
    scratch.width = SAMPLE_SIZE;
    scratch.height = SAMPLE_SIZE;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });

    let camStream = null;
    let camVideo = null;
    let camTimer = 0;

    function fillFromPixels(imgData, w, h, threshold, useColors) {
      const data = imgData.data;
      const hits = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const a = data[i + 3] / 255;
          if (a < 0.25) continue;
          const r = data[i] / 255;
          const g = data[i + 1] / 255;
          const b = data[i + 2] / 255;
          const lum = r * 0.299 + g * 0.587 + b * 0.114;
          if (lum >= threshold) {
            hits.push([
              (x / w) * 2 - 1,
              1 - (y / h) * 2,
              r, g, b
            ]);
          }
        }
      }

      if (!hits.length) {
        clear();
        return false;
      }

      const len = hits.length;
      for (let i = 0; i < count; i++) {
        const hItem = hits[(i * 7919) % len];
        const idx = i * 4;
        posBuf[idx]     = hItem[0] * 1.15 + (Math.random() - 0.5) * 0.014;
        posBuf[idx + 1] = hItem[1] * 1.15 + (Math.random() - 0.5) * 0.014;
        posBuf[idx + 2] = (Math.random() - 0.5) * 0.14;
        posBuf[idx + 3] = 1.0;

        colBuf[idx]     = hItem[2];
        colBuf[idx + 1] = hItem[3];
        colBuf[idx + 2] = hItem[4];
        colBuf[idx + 3] = useColors ? 1.0 : 0.0;
      }

      onUpdate(posBuf, colBuf);
      return true;
    }

    function stopWebcam() {
      if (camTimer) { clearInterval(camTimer); camTimer = 0; }
      if (camStream) {
        camStream.getTracks().forEach(t => t.stop());
        camStream = null;
      }
      if (camVideo) {
        camVideo.srcObject = null;
        camVideo = null;
      }
    }

    function clear() {
      stopWebcam();
      posBuf.fill(0);
      colBuf.fill(0);
      onUpdate(posBuf, colBuf);
      onStatus('None', false);
    }

    function fromText(rawText) {
      stopWebcam();
      const text = String(rawText || '').trim().slice(0, 24);
      if (!text) {
        clear();
        return false;
      }
      scratch.width = SAMPLE_SIZE;
      scratch.height = SAMPLE_SIZE;
      ctx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const size = Math.max(24, Math.min(82, Math.floor(230 / Math.max(2, text.length))));
      ctx.font = `900 ${size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(text, SAMPLE_SIZE / 2, SAMPLE_SIZE / 2, SAMPLE_SIZE - 16);

      const ok = fillFromPixels(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE), SAMPLE_SIZE, SAMPLE_SIZE, 0.25, false);
      onStatus(ok ? `Text: ${text}` : 'Empty text', false);
      return ok;
    }

    function fromImageFile(file) {
      if (!file) return;
      stopWebcam();
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        scratch.width = SAMPLE_SIZE;
        scratch.height = SAMPLE_SIZE;
        ctx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const scale = Math.min(SAMPLE_SIZE / img.width, SAMPLE_SIZE / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, (SAMPLE_SIZE - dw) / 2, (SAMPLE_SIZE - dh) / 2, dw, dh);
        URL.revokeObjectURL(url);
        const ok = fillFromPixels(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE), SAMPLE_SIZE, SAMPLE_SIZE, 0.14, true);
        onStatus(ok ? `Img: ${file.name.slice(0, 14)}` : 'Too dark', false);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        onStatus('Bad image', false);
      };
      img.src = url;
    }

    async function toggleWebcam() {
      if (camStream) {
        clear();
        return false;
      }
      try {
        camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        camVideo = document.createElement('video');
        camVideo.srcObject = camStream;
        camVideo.muted = true;
        camVideo.playsInline = true;
        await camVideo.play();

        scratch.width = CAM_SIZE;
        scratch.height = CAM_SIZE;
        onStatus('Webcam Live', true);

        camTimer = setInterval(() => {
          if (!camVideo || camVideo.readyState < 2) return;
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(camVideo, -CAM_SIZE, 0, CAM_SIZE, CAM_SIZE);
          ctx.restore();
          fillFromPixels(ctx.getImageData(0, 0, CAM_SIZE, CAM_SIZE), CAM_SIZE, CAM_SIZE, 0.22, true);
        }, 90);
        return true;
      } catch (_) {
        stopWebcam();
        onStatus('Webcam blocked', false);
        return false;
      }
    }

    return { fromText, fromImageFile, toggleWebcam, clear };
  };
})(window.Vortex);