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

    function makeTex(w, h, filter) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return tex;
    }

    const targetTex = makeTex(T, T, gl.NEAREST);
    const photoTex = makeTex(T, T, gl.NEAREST);
    const brushTex = makeTex(B, B, gl.LINEAR);
    const camTex = makeTex(C, C, gl.LINEAR);

    const targetBuf = new Uint8Array(T * T * 4);
    const photoBuf = new Uint8Array(T * T * 4);
    let hasPhoto = 0;

    function packFromCanvas() {
      const pixels = tCtx.getImageData(0, 0, T, T).data;
      const pts = [];
      for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
          const idx = (y * T + x) * 4;
          const a = pixels[idx + 3];
          const lum = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
          if (a > 40 && lum > 24) {
            pts.push([x / (T - 1), 1 - y / (T - 1), pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
          }
        }
      }
      const total = T * T;
      if (pts.length === 0) {
        for (let i = 0; i < total; i++) {
          const p = i * 4;
          targetBuf[p] = 128;
          targetBuf[p + 1] = 128;
          targetBuf[p + 2] = 128;
          targetBuf[p + 3] = 255;
        }
      } else {
        for (let i = 0; i < total; i++) {
          const src = pts[(i * 7919) % pts.length];
          const p = i * 4;
          targetBuf[p] = Math.round(src[0] * 255);
          targetBuf[p + 1] = Math.round(src[1] * 255);
          targetBuf[p + 2] = Math.floor(Math.random() * 256);
          targetBuf[p + 3] = 255;

          photoBuf[p] = src[2];
          photoBuf[p + 1] = src[3];
          photoBuf[p + 2] = src[4];
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

    function clearBrush() {
      bCtx.fillStyle = 'rgb(128,128,0)';
      bCtx.fillRect(0, 0, B, B);
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
      uploadBrush();
    }

    function fadeBrush() {
      bCtx.fillStyle = 'rgba(128,128,0,0.012)';
      bCtx.fillRect(0, 0, B, B);
      uploadBrush();
    }

    function uploadBrush() {
      gl.bindTexture(gl.TEXTURE_2D, brushTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, brushCanvas);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    // Optional live Webcam Ghost
    let camVideo = null;
    let camStream = null;
    let camActive = 0;

    async function toggleWebcam() {
      if (camActive) {
        camActive = 0;
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
      camActive = 1;
      return true;
    }

    function updateWebcam() {
      if (!camActive || !camVideo || camVideo.readyState < 2) return;
      cCtx.drawImage(camVideo, 0, 0, C, C);
      gl.bindTexture(gl.TEXTURE_2D, camTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, camCanvas);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    clearBrush();
    setWord(V.state.word);

    return {
      targetTex, photoTex, brushTex, camTex,
      setWord, setImage, clearBrush, paintBrush, fadeBrush,
      toggleWebcam, updateWebcam,
      get hasPhoto() { return hasPhoto; },
      get camActive() { return camActive; }
    };
  }

  V.createMasks = createMasks;
})();