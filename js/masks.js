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
    let hasCustomTarget = false;
    let packedPointCount = 0;

    function uploadTargetTextures() {
      gl.bindTexture(gl.TEXTURE_2D, targetTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, T, T, gl.RGBA, gl.UNSIGNED_BYTE, targetBuf);
      gl.bindTexture(gl.TEXTURE_2D, photoTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, T, T, gl.RGBA, gl.UNSIGNED_BYTE, photoBuf);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    function packFromCanvas() {
      let pixels;
      try {
        pixels = tCtx.getImageData(0, 0, T, T).data;
      } catch (_) {
        return;
      }
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
        packedPointCount = 0;
      } else {
        const rand = V.mulberry32(V.state.seed);
        const scale = 255 / (T - 1);
        packedPointCount = Math.min(hitCount, totalPixels);
        for (let i = 0; i < totalPixels; i++) {
          const pix = hitOffset[(i * 7919) % hitCount];
          const x = pix % T;
          const y = (pix - x) / T;
          const sIdx = pix * 4;
          const p = i * 4;
          targetBuf[p] = Math.round(x * scale);
          targetBuf[p + 1] = Math.round((T - 1 - y) * scale);
          targetBuf[p + 2] = Math.round(128 + (rand() - 0.5) * 36);
          targetBuf[p + 3] = 255;

          photoBuf[p] = pixels[sIdx];
          photoBuf[p + 1] = pixels[sIdx + 1];
          photoBuf[p + 2] = pixels[sIdx + 2];
          photoBuf[p + 3] = 255;
        }
      }
      uploadTargetTextures();
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
      hasCustomTarget = true;
      packFromCanvas();
    }

    function setImage(img) {
      if (!img || !img.width || !img.height) return;
      if (img.width > V.MAX_IMAGE_DIM || img.height > V.MAX_IMAGE_DIM) {
        V.showError('Image exceeds 4096px safety limit.');
        return;
      }
      tCtx.clearRect(0, 0, T, T);
      const scale = Math.min((T * 0.86) / img.width, (T * 0.86) / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      tCtx.drawImage(img, (T - w) * 0.5, (T - h) * 0.5, w, h);
      hasPhoto = 1;
      hasCustomTarget = true;
      packFromCanvas();
    }

    // Bounded OBJ parser supporting 3D mesh vertices + area-weighted triangle sampling
    function setObjText(text) {
      if (typeof text !== 'string' || text.length > V.MAX_UPLOAD_BYTES) return false;
      const MAX_VERTS = 50000;
      const MAX_FACES = 50000;
      const verts = [];
      const tris = [];
      const lines = text.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('v ') && verts.length < MAX_VERTS * 3) {
          const p = line.split(/\s+/);
          const x = Number(p[1]), y = Number(p[2]), z = Number(p[3]);
          if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
            verts.push(x, y, z);
          }
        } else if (line.startsWith('f ') && tris.length < MAX_FACES * 3) {
          const p = line.split(/\s+/).slice(1);
          const vCount = verts.length / 3;
          const idx = [];
          for (let j = 0; j < p.length; j++) {
            const raw = parseInt(p[j].split('/')[0], 10);
            const vi = raw < 0 ? vCount + raw : raw - 1;
            if (vi >= 0 && vi < vCount) idx.push(vi);
          }
          for (let j = 1; j + 1 < idx.length && tris.length < MAX_FACES * 3; j++) {
            tris.push(idx[0], idx[j], idx[j + 1]);
          }
        }
      }

      const vCount = verts.length / 3;
      if (vCount < 3) return false;

      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < verts.length; i += 3) {
        if (verts[i] < minX) minX = verts[i];
        if (verts[i] > maxX) maxX = verts[i];
        if (verts[i + 1] < minY) minY = verts[i + 1];
        if (verts[i + 1] > maxY) maxY = verts[i + 1];
        if (verts[i + 2] < minZ) minZ = verts[i + 2];
        if (verts[i + 2] > maxZ) maxZ = verts[i + 2];
      }
      const cx = (minX + maxX) * 0.5;
      const cy = (minY + maxY) * 0.5;
      const cz = (minZ + maxZ) * 0.5;
      const invSpan = 0.82 / (Math.max(maxX - minX, maxY - minY, maxZ - minZ) * 0.5 || 1);
      const rand = V.mulberry32(V.state.seed);
      const triCount = tris.length / 3;

      for (let i = 0; i < totalPixels; i++) {
        let x, y, z;
        if (triCount > 0) {
          const t = (i * 7919) % triCount;
          const a = tris[t * 3] * 3;
          const b = tris[t * 3 + 1] * 3;
          const c = tris[t * 3 + 2] * 3;
          let r1 = Math.sqrt(rand());
          let r2 = rand();
          const u = 1 - r1;
          const v = r1 * (1 - r2);
          const w = r1 * r2;
          x = verts[a] * u + verts[b] * v + verts[c] * w;
          y = verts[a + 1] * u + verts[b + 1] * v + verts[c + 1] * w;
          z = verts[a + 2] * u + verts[b + 2] * v + verts[c + 2] * w;
        } else {
          const vi = ((i * 7919) % vCount) * 3;
          x = verts[vi];
          y = verts[vi + 1];
          z = verts[vi + 2];
        }
        const nx = (x - cx) * invSpan * 0.5 + 0.5;
        const ny = (y - cy) * invSpan * 0.5 + 0.5;
        const nz = (z - cz) * invSpan * 0.5 + 0.5;
        const p = i * 4;
        targetBuf[p] = Math.round(Math.min(1, Math.max(0, nx)) * 255);
        targetBuf[p + 1] = Math.round(Math.min(1, Math.max(0, ny)) * 255);
        targetBuf[p + 2] = Math.round(Math.min(1, Math.max(0, nz)) * 255);
        targetBuf[p + 3] = 255;
      }

      hasPhoto = 0;
      hasCustomTarget = true;
      packedPointCount = totalPixels;
      uploadTargetTextures();
      return true;
    }

    function exportPackedTarget(maxPts) {
      if (!hasCustomTarget) return null;
      const count = Math.min(maxPts || 4096, packedPointCount || 4096);
      const stride = hasPhoto ? 6 : 3;
      const bytes = new Uint8Array(count * stride);
      const step = Math.max(1, Math.floor(totalPixels / count));
      for (let i = 0; i < count; i++) {
        const src = ((i * step) % totalPixels) * 4;
        const dst = i * stride;
        bytes[dst] = targetBuf[src];
        bytes[dst + 1] = targetBuf[src + 1];
        bytes[dst + 2] = targetBuf[src + 2];
        if (hasPhoto) {
          bytes[dst + 3] = photoBuf[src];
          bytes[dst + 4] = photoBuf[src + 1];
          bytes[dst + 5] = photoBuf[src + 2];
        }
      }
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return { count, hasPhoto, data: btoa(bin) };
    }

    function destroy() {
      if (camStream) {
        camStream.getTracks().forEach(t => t.stop());
        camStream = null;
      }
      camVideo = null;
      camActive = 0;
      gl.deleteTexture(targetTex);
      gl.deleteTexture(photoTex);
      gl.deleteTexture(brushTex);
      gl.deleteTexture(camTex);
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
      setWord, setImage, setObjText, exportPackedTarget,
      clearBrush, paintBrush, stepBrush,
      toggleWebcam, updateWebcam, destroy,
      get hasPhoto() { return hasPhoto; },
      get hasCustomTarget() { return hasCustomTarget; },
      get camActive() { return camActive; }
    };
  }

  V.createMasks = createMasks;
})();