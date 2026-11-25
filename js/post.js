(() => {
  const V = window.VORTEX;

  function createPost(gl) {
    const S = V.SHADERS;
    const fadeProg = V.gl.createProgram(gl, S.QUAD_VS, S.FADE_FS);
    const blurProg = V.gl.createProgram(gl, S.QUAD_VS, S.BLUR_FS);
    const postProg = V.gl.createProgram(gl, S.QUAD_VS, S.POST_FS);

    const uFade = V.gl.getUniforms(gl, fadeProg, {
      prev: 'uPrev',
      bgCol: 'uBgCol',
      decay: 'uDecay'
    });
    const uBlur = V.gl.getUniforms(gl, blurProg, {
      tex: 'uTex',
      step: 'uStep'
    });
    const uPost = V.gl.getUniforms(gl, postProg, {
      scene: 'uScene',
      glowTex: 'uGlowTex',
      glow: 'uGlow',
      split: 'uSplit',
      grain: 'uGrain',
      time: 'uTime',
      mirror: 'uMirror',
      mirrorSpin: 'uMirrorSpin',
      lens: 'uLens',
      invert: 'uInvert',
      monoInvert: 'uMonoInvert',
      transparent: 'uTransparent',
      flip: 'uFlip'
    });

    const emptyVAO = gl.createVertexArray();
    let targets = null;

    function clearTrails(bgRgb, canvasW, canvasH) {
      if (!targets) return;
      gl.clearColor(bgRgb[0], bgRgb[1], bgRgb[2], 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets.trail0.fb);
      gl.viewport(0, 0, targets.trail0.w, targets.trail0.h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets.trail1.fb);
      gl.viewport(0, 0, targets.trail1.w, targets.trail1.h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvasW, canvasH);
    }

    function resize(w, h, bgRgb) {
      if (targets) {
        V.gl.destroyTarget(gl, targets.trail0);
        V.gl.destroyTarget(gl, targets.trail1);
        V.gl.destroyTarget(gl, targets.blurA);
        V.gl.destroyTarget(gl, targets.blurB);
      }
      const bw = Math.max(2, Math.floor(w / 4));
      const bh = Math.max(2, Math.floor(h / 4));
      targets = {
        trail0: V.gl.makeTarget(gl, w, h),
        trail1: V.gl.makeTarget(gl, w, h),
        blurA: V.gl.makeTarget(gl, bw, bh),
        blurB: V.gl.makeTarget(gl, bw, bh),
        idx: 0
      };
      clearTrails(bgRgb, w, h);
    }

    function render(p, drawScene) {
      const bg = p.bgRgb;
      const clearAlpha = p.transparent > 0.5 ? 0 : 1;
      const needsBlur = p.glow > 0.001 || p.lens === 1;
      const usePost =
        p.trails > 0.001 ||
        needsBlur ||
        p.split > 0.001 ||
        p.grain > 0.001 ||
        p.mirror > 0 ||
        p.invert > 0.01 ||
        p.monoInvert > 0.001 ||
        p.transparent > 0.5 ||
        p.flip > 0.5;

      if (!usePost || !targets) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, p.w, p.h);
        gl.clearColor(bg[0], bg[1], bg[2], clearAlpha);
        gl.clear(gl.COLOR_BUFFER_BIT);
        drawScene();
        return;
      }

      const readT = targets.idx === 0 ? targets.trail0 : targets.trail1;
      const writeT = targets.idx === 0 ? targets.trail1 : targets.trail0;

      gl.bindFramebuffer(gl.FRAMEBUFFER, writeT.fb);
      gl.viewport(0, 0, writeT.w, writeT.h);

      if (p.trails > 0.001) {
        // Match trail length across 60fps and 120fps+ displays
        const decay = Math.pow(p.trails, p.dt * V.REF_FPS);
        gl.useProgram(fadeProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readT.tex);
        gl.uniform1i(uFade.prev, 0);
        gl.uniform3f(uFade.bgCol, bg[0], bg[1], bg[2]);
        gl.uniform1f(uFade.decay, decay);
        gl.bindVertexArray(emptyVAO);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        gl.clearColor(bg[0], bg[1], bg[2], clearAlpha);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }

      drawScene();

      if (needsBlur) {
        gl.useProgram(blurProg);
        gl.bindVertexArray(emptyVAO);

        gl.bindFramebuffer(gl.FRAMEBUFFER, targets.blurA.fb);
        gl.viewport(0, 0, targets.blurA.w, targets.blurA.h);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, writeT.tex);
        gl.uniform1i(uBlur.tex, 0);
        gl.uniform2f(uBlur.step, 1.0 / targets.blurA.w, 0.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindFramebuffer(gl.FRAMEBUFFER, targets.blurB.fb);
        gl.bindTexture(gl.TEXTURE_2D, targets.blurA.tex);
        gl.uniform2f(uBlur.step, 0.0, 1.0 / targets.blurB.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, p.w, p.h);
      gl.useProgram(postProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, writeT.tex);
      gl.uniform1i(uPost.scene, 0);
      if (needsBlur) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, targets.blurB.tex);
        gl.uniform1i(uPost.glowTex, 1);
      }
      gl.uniform1f(uPost.glow, p.glow);
      gl.uniform1f(uPost.split, p.split);
      gl.uniform1f(uPost.grain, p.grain);
      gl.uniform1f(uPost.time, p.time);
      gl.uniform1i(uPost.mirror, p.mirror);
      gl.uniform1f(uPost.mirrorSpin, p.mirrorSpin);
      gl.uniform1i(uPost.lens, p.lens);
      gl.uniform1f(uPost.invert, p.invert);
      gl.uniform1f(uPost.monoInvert, p.monoInvert);
      gl.uniform1f(uPost.transparent, p.transparent);
      gl.uniform1f(uPost.flip, p.flip);
      gl.bindVertexArray(emptyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);

      targets.idx = 1 - targets.idx;
    }

    return { resize, clearTrails, render };
  }

  V.createPost = createPost;
})();