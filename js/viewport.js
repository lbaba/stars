(() => {
  const V = window.VORTEX;

  function createViewport(canvas, engine, recorder, els) {
    const { ratioSel, customRatioRow, ratioW, ratioH, resSel, dimLabel } = els;
    let rect = { left: 0, top: 0, width: 1, height: 1 };

    function refreshRect() {
      const r = canvas.getBoundingClientRect();
      rect.left = r.left;
      rect.top = r.top;
      rect.width = Math.max(1, r.width);
      rect.height = Math.max(1, r.height);
    }

    function getTargetAspect() {
      const v = ratioSel.value;
      if (v === 'fill') {
        return V.clampVal(innerWidth / Math.max(1, innerHeight), V.MIN_ASPECT, V.MAX_ASPECT, 1);
      }
      if (v === 'custom') {
        const w = V.clampVal(ratioW.value, 1, 9999, 16);
        const h = V.clampVal(ratioH.value, 1, 9999, 9);
        return V.clampVal(w / h, V.MIN_ASPECT, V.MAX_ASPECT, 1);
      }
      const parts = v.split(':');
      return V.clampVal(Number(parts[0]) / Number(parts[1]), V.MIN_ASPECT, V.MAX_ASPECT, 1);
    }

    function resize() {
      if (recorder.isRecording()) return;
      const mode = ratioSel.value;
      customRatioRow.classList.toggle('show', mode === 'custom');
      canvas.classList.toggle('framed', mode !== 'fill');

      const targetAspect = getTargetAspect();
      let cssW, cssH;
      if (mode === 'fill') {
        cssW = innerWidth;
        cssH = innerHeight;
      } else {
        const pad = 28;
        const availW = Math.max(64, innerWidth - pad);
        const availH = Math.max(64, innerHeight - pad);
        if (availW / availH > targetAspect) {
          cssH = availH;
          cssW = cssH * targetAspect;
        } else {
          cssW = availW;
          cssH = cssW / targetAspect;
        }
      }
      canvas.style.width = `${Math.floor(cssW)}px`;
      canvas.style.height = `${Math.floor(cssH)}px`;

      let pxW, pxH;
      if (resSel.value === 'auto') {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        pxW = Math.round(cssW * dpr);
        pxH = Math.round(cssH * dpr);
      } else {
        const base = parseInt(resSel.value, 10);
        if (targetAspect >= 1) {
          pxH = base;
          pxW = Math.round(base * targetAspect);
        } else {
          pxW = base;
          pxH = Math.round(base / targetAspect);
        }
      }

      const totalPx = pxW * pxH;
      if (totalPx > V.MAX_CANVAS_PIXELS) {
        const shrink = Math.sqrt(V.MAX_CANVAS_PIXELS / totalPx);
        pxW = Math.floor(pxW * shrink);
        pxH = Math.floor(pxH * shrink);
      }

      engine.setSize(pxW, pxH);
      refreshRect();
      dimLabel.textContent = `${canvas.width} × ${canvas.height}`;
    }

    function mapToWorld(clientX, clientY, out) {
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
      const wx = engine.aspect >= 1 ? nx * engine.aspect : nx;
      const wy = engine.aspect >= 1 ? ny : ny / engine.aspect;
      engine.pointer.x = wx;
      engine.pointer.y = wy;
      engine.pointer.s = 1.0;
      out[0] = wx;
      out[1] = wy;
      return out;
    }

    function setLocked(locked) {
      ratioSel.disabled = locked;
      ratioW.disabled = locked;
      ratioH.disabled = locked;
      resSel.disabled = locked;
    }

    ratioSel.addEventListener('change', resize);
    resSel.addEventListener('change', resize);
    ratioW.addEventListener('input', resize);
    ratioH.addEventListener('input', resize);
    addEventListener('resize', resize);
    resize();

    return { resize, mapToWorld, setLocked };
  }

  V.createViewport = createViewport;
})();