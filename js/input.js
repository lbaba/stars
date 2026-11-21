(() => {
  const V = window.VORTEX;

  function bindInput(canvas, engine, viewport, actions) {
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    const worldPos = [0, 0];

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('pointerdown', e => {
      viewport.mapToWorld(e.clientX, e.clientY, worldPos);
      if (e.button === 2) {
        engine.clickForce = -1.4;
      } else if (e.shiftKey) {
        engine.clickForce = 1.4;
      } else if (engine.toolMode === V.TOOL.PIN) {
        engine.addPin(worldPos[0], worldPos[1], 1.2);
      } else {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      }
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', e => {
      viewport.mapToWorld(e.clientX, e.clientY, worldPos);
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      if (engine.toolMode === V.TOOL.ORBIT) {
        engine.adjustCam(dx * 0.006, dy * 0.006);
      } else if (engine.toolMode === V.TOOL.BRUSH) {
        engine.masks.paintBrush(worldPos[0], worldPos[1], dx * 0.08, -dy * 0.08);
      }
    });

    function endDrag() {
      isDragging = false;
      engine.clickForce = 0;
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      V.state.zoom = V.clampVal(
        V.state.zoom - e.deltaY * 0.001,
        V.LIMITS.zoom[0],
        V.LIMITS.zoom[1],
        V.state.zoom
      );
      actions.onZoom();
    }, { passive: false });

    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'h' || e.key === 'H') actions.onTogglePanel();
      if (e.key === 'f' || e.key === 'F') actions.onToggleFreeze();
      if (e.code === 'Space') {
        e.preventDefault();
        actions.onTogglePause();
      }
      if (e.key >= '1' && e.key <= '6') {
        actions.onVJ(parseInt(e.key, 10));
      }
    });

    return {
      isOrbiting() {
        return isDragging && engine.toolMode === V.TOOL.ORBIT;
      }
    };
  }

  V.bindInput = bindInput;
})();