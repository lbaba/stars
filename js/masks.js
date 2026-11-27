(() => {
  const V = window.VORTEX;

  function createMasks(gl) {
    const T = V.TARGET_TEX_SIZE;
    const B = V.BRUSH_TEX_SIZE;
    const C = V.CAM_TEX_SIZE;

    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = T;
    targetCanvas.height = T;
    const tCtx = targetCanvas.getContext('2d', { willReadFrequently: true });

    const brushCanvas = document.createElement('canvas');
    brushCanvas.width = B;
    brushCanvas.height = B;
    const bCtx = brushCanvas.getContext('2d');

    const camCanvas = document.createElement('canvas');
    camCanvas.width = C;
    camCanvas.height = C;
    const cCtx = camCanvas.getContext('2d');

    const targetTex = V.gl.makeTex(gl, T, T, gl.NEAREST);
    const photoTex = V.gl.makeTex(gl, T, T, gl.NEAREST);
    const brushTex = V.gl.makeTex(gl, B, B, gl.LINEAR);
    const camTex = V.gl.makeTex(gl, C, C, gl.LINEAR);

    const totalPixels = T * T;
    const targetBuf = new Uint8Array(totalPixels * 4);
    const photoBuf = new Uint8Array(totalPixels * 4);
    const hitOffset = new Int32Array(totalPixels);
    let hasPhoto = 0;

    function packFromCanvas() {
      const pixels = tCtx.getImageData(0, 0, T, T).data;
      let hitCount = 0;
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const a = pixels[idx + 3];
        if (a > 40 && (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) > 72) {
          hitOffset[hitCount++] = i;
        }
      }
      if (hitCount === 0) {
        for (let i = 0; i < totalPixels; i++) {
          const p = i * 4;
          targetBuf[p] = 128;
          targetBuf[p + 1] = 128;
          targetBuf[p + 2] = 128;
          targetBuf[p + 3] = 255;
        }
      } else {
        const scale = 255 / (T - 1);
        for (let i = 0; i < totalPixels; i++) {
          const pix = hitOffset[(i * 7919) % hitCount];
          const x = pix % T;
          const y = (pix - x) / T;
          const sIdx = pix * 4;
          const p = i * 4;
          targetBuf[p] = Math.round(x * scale);
          targetBuf[p + 1] = Math.round((T - 1 - y) * scale);
          targetBuf[p + 2] = Math.floor(Math.random() * 256);
          targetBuf[p + 3] = 255;

          photoBuf[p] = pixels[sIdx];
          photoBuf[p + 1] = pixels[sIdx + 1];
          photoBuf[p + 2] = pixels[sIdx + 2];
          photoBuf[p + 3] = 255;
        }
      }
      gl.bindTexture(gl.TEXTURE_2D, targetTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, T, T, gl.RGBA, gl.UNSIGNED_BYTE, targetBuf);
      gl.bindTexture(gl.TEXTURE_2D, photoTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, T, T, gl.RGBA, gl.UNSIGNED_BYTE, photoBuf);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    function setWord(text) {
      const clean = (text || 'VORTEX').trim().slice(0, 20) || 'VORTEX';
      tCtx.clearRect(0, 0, T, T);
      tCtx.fillStyle = '#ffffff';
      tCtx.textAlign = 'center';
      tCtx.textBaseline = 'middle';
      let fontPx = 88;
      tCtx.font = `900 ${fontPx}px sans-serif`;
      const measured = tCtx.measureText(clean).width;
      if (measured > T * 0.84) {
        fontPx = Math.max(18, Math.floor(fontPx * (T * 0.84) / measured));
        tCtx.font = `900 ${fontPx}px sans-serif`;
      }
      tCtx.fillText(clean, T * 0.5, T * 0.5);
      hasPhoto = 0;
      packFromCanvas();
    }

    function setImage(img) {
      tCtx.clearRect(0, 0, T, T);
      const scale = Math.min((T * 0.86) / img.width, (T * 0.86) / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      tCtx.drawImage(img, (T - w) * 0.5, (T - h) * 0.5, w, h);
      hasPhoto = 1;
      packFromCanvas();
    }

    const BRUSH_FADE_STEP = 1 / V.REF_FPS;
    const BRUSH_IDLE_STEPS = 360;
    let brushActive = false;
    let brushDirty = false;
    let brushFadeAccum = 0;
    let brushFadeSteps = 0;

    function uploadBrush() {
      gl.bindTexture(gl.TEXTURE_2D, brushTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, brushCanvas);
      gl.bindTexture(gl.TEXTURE_2D, null);
      brushDirty = false;
    }

    function clearBrush() {
      bCtx.fillStyle = 'rgb(128,128,0)';
      bCtx.fillRect(0, 0, B, B);
      brushActive = false;
      brushFadeAccum = 0;
      brushFadeSteps = 0;
      uploadBrush();
    }

    function paintBrush(nx, ny, dx, dy) {
      const bx = (nx * 0.42 + 0.5) * B;
      const by = (1 - (ny * 0.42 + 0.5)) * B;
      const vx = Math.round(128 + Math.max(-1, Math.min(1, dx)) * 127);
      const vy = Math.round(128 + Math.max(-1, Math.min(1, dy)) * 127);
      const grad = bCtx.createRadialGradient(bx, by, 1, bx, by, 9);
      grad.addColorStop(0, `rgba(${vx},${vy},0,0.85)`);
      grad.addColorStop(1, `rgba(${vx},${vy},0,0)`);
      bCtx.fillStyle = grad;
      bCtx.beginPath();
      bCtx.arc(bx, by, 9, 0, Math.PI * 2);
      bCtx.fill();
      brushActive = true;
      brushFadeSteps = 0;
      brushDirty = true;
    }

    // Only fade and upload brush when painted so idle frames skip GPU uploads
    function stepBrush(dt) {
      if (!brushActive) {
        if (brushDirty) uploadBrush();
        return;
      }
      brushFadeAccum += dt;
      let steps = 0;
      while (brushFadeAccum >= BRUSH_FADE_STEP && steps < 2) {
        brushFadeAccum -= BRUSH_FADE_STEP;
        steps++;
      }
      if (steps > 0) {
        bCtx.fillStyle = 'rgba(128,128,0,0.012)';
        for (let i = 0; i < steps; i++) bCtx.fillRect(0, 0, B, B);
        brushFadeSteps += steps;
        brushDirty = true;
        if (brushFadeSteps >= BRUSH_IDLE_STEPS) {
          clearBrush();
          return;
        }
      }
      if (brushDirty) uploadBrush();
    }

    let camVideo = null;
    let camStream = null;
    let camActive = 0;
    let lastCamTime = -1;

    async function toggleWebcam() {
      if (camActive) {
        camActive = 0;
        lastCamTime = -1;
        if (camStream) {
          camStream.getTracks().forEach(t => t.stop());
          camStream = null;
        }
        camVideo = null;
        return false;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 256, height: 256 } });
      camStream = stream;
      camVideo = document.createElement('video');
      camVideo.playsInline = true;
      camVideo.muted = true;
      camVideo.srcObject = stream;
      await camVideo.play();
      lastCamTime = -1;
      camActive = 1;
      return true;
    }

    function updateWebcam() {
      if (!camActive || !camVideo || camVideo.readyState < 2) return;
      if (camVideo.currentTime === lastCamTime) return;
      lastCamTime = camVideo.currentTime;
      cCtx.drawImage(camVideo, 0, 0, C, C);
      gl.bindTexture(gl.TEXTURE_2D, camTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, camCanvas);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    clearBrush();
    setWord(V.state.word);

    return {
      targetTex, photoTex, brushTex, camTex,
      setWord, setImage, clearBrush, paintBrush, stepBrush,
      toggleWebcam, updateWebcam,
      get hasPhoto() { return hasPhoto; },
      get camActive() { return camActive; }
    };
  }

  V.createMasks = createMasks;
})();