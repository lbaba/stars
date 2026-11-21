(() => {
  const V = window.VORTEX;

  const MIN_DT = 0.001;
  const FPS_WINDOW_SEC = 0.5;
  const MIN_DOT_FACTOR = 0.4;

  function createClock() {
    let lastMs = 0;
    let fpsAccum = 0;
    let fpsFrames = 0;
    let slowStreak = 0;
    let stepAccum = 0;
    let autoSkipGlow = false;
    let autoDotFactor = 1.0;

    const frame = {
      rawDt: 1 / V.REF_FPS,
      autoSkipGlow: false,
      autoDotFactor: 1.0
    };

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        lastMs = 0;
        fpsAccum = 0;
        fpsFrames = 0;
      }
    });

    function decay(rateAt60, dt) {
      return Math.pow(rateAt60, dt * V.REF_FPS);
    }

    function snapZero(val) {
      return Math.abs(val) < 0.0005 ? 0 : val;
    }

    function tick(now, onFps) {
      let rawDt = 1 / V.REF_FPS;
      if (lastMs > 0 && now > lastMs) {
        rawDt = Math.max(MIN_DT, Math.min((now - lastMs) * 0.001, V.MAX_FRAME_DT));
      }
      lastMs = now;

      fpsAccum += rawDt;
      fpsFrames++;
      if (fpsAccum >= FPS_WINDOW_SEC) {
        const fps = Math.round(fpsFrames / fpsAccum);
        if (onFps) onFps(fps);
        if (fps < V.LOW_FPS_THRESHOLD) {
          slowStreak += fpsFrames;
          if (slowStreak >= V.SLOW_FRAMES_TRIGGER) {
            autoSkipGlow = true;
            autoDotFactor = Math.max(MIN_DOT_FACTOR, autoDotFactor * 0.85);
          }
        } else if (fps < V.SOFT_FPS_THRESHOLD) {
          slowStreak += fpsFrames;
          if (slowStreak >= V.SLOW_FRAMES_TRIGGER * 2) {
            autoDotFactor = Math.max(MIN_DOT_FACTOR, autoDotFactor * 0.92);
          }
        } else if (fps >= V.RECOVER_FPS_THRESHOLD) {
          slowStreak = 0;
          autoSkipGlow = false;
          autoDotFactor = Math.min(1.0, autoDotFactor + 0.05);
        }
        fpsAccum = 0;
        fpsFrames = 0;
      }

      frame.rawDt = rawDt;
      frame.autoSkipGlow = autoSkipGlow;
      frame.autoDotFactor = autoDotFactor;
      return frame;
    }

    function consumeStep(dt, fpsStep) {
      if (fpsStep <= 0) {
        stepAccum = 0;
        return dt;
      }
      const stepSize = 1 / fpsStep;
      stepAccum = Math.min(stepAccum + dt, stepSize * 2);
      if (stepAccum < stepSize) return 0;
      stepAccum -= stepSize;
      return stepSize;
    }

    function resetAutoDots() {
      autoDotFactor = 1.0;
      slowStreak = 0;
    }

    return { tick, consumeStep, decay, snapZero, resetAutoDots };
  }

  V.createClock = createClock;
})();