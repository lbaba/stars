(() => {
  const V = window.VORTEX;

  function createPost(gl) {
    const S = V.SHADERS;
    const useHdr = V.gl.supportsHdrTargets(gl);
    const fadeProg = V.gl.createProgram(gl, S.QUAD_VS, S.FADE_FS);
    const downProg = V.gl.createProgram(gl, S.QUAD_VS, S.KAWASE_DOWN_FS);
    const upProg = V.gl.createProgram(gl, S.QUAD_VS, S.KAWASE_UP_FS);
    const postProg = V.gl.createProgram(gl, S.QUAD_VS, S.POST_FS);

    const uFade = V.gl.getUniforms(gl, fadeProg, {
      prev: 'uPrev',
      bgCol: 'uBgCol',
      decay: 'uDecay',
      transparent: 'uTransparent'
    });
    const uDown = V.gl.getUniforms(gl, downProg, {
      tex: 'uTex',
      halfPx: 'uHalfPx'
    });
    const uUp = V.gl.getUniforms(gl, upProg, {
      tex: 'uTex',
      halfPx: 'uHalfPx'
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
      flip: 'uFlip',
      toneMap: 'uToneMap',
      texel: 'uTexel',
      bgCol: 'uBgCol'
    });

    const emptyVAO = gl.createVertexArray();
    let targets = null;

    function clearTrails(bgRgb, canvasW, canvasH, transparent) {
      if (!targets) return;
      if (transparent) gl.clearColor(0, 0, 0, 0);
      else gl.clearColor(bgRgb[0], bgRgb[1], bgRgb[2], 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets.trail0.fb);
      gl.viewport(0, 0, targets.trail0.w, targets.trail0.h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets.trail1.fb);
      gl.viewport(0, 0, targets.trail1.w, targets.trail1.h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvasW, canvasH);
    }

    function destroyTargets() {
      if (!targets) return;
      V.gl.destroyTarget(gl, targets.trail0);
      V.gl.destroyTarget(gl, targets.trail1);
      V.gl.destroyTarget(gl, targets.mip1);
      V.gl.destroyTarget(gl, targets.mip2);
      V.gl.destroyTarget(gl, targets.bloomOut);
      targets = null;
    }

    function resize(w, h, bgRgb, transparent) {
      destroyTargets();
      const sw = Math.max(2, w | 0);
      const sh = Math.max(2, h | 0);
      const m1w = Math.max(2, Math.floor(sw / 2));
      const m1h = Math.max(2, Math.floor(sh / 2));
      const m2w = Math.max(2, Math.floor(sw / 4));
      const m2h = Math.max(2, Math.floor(sh / 4));
      targets = {
        trail0: V.gl.makeTarget(gl, sw, sh, useHdr),
        trail1: V.gl.makeTarget(gl, sw, sh, useHdr),
        mip1: V.gl.makeTarget(gl, m1w, m1h, useHdr),
        mip2: V.gl.makeTarget(gl, m2w, m2h, useHdr),
        bloomOut: V.gl.makeTarget(gl, m1w, m1h, useHdr),
        idx: 0
      };
      clearTrails(bgRgb, sw, sh, transparent);
    }

    function render(p, drawScene) {
      const bg = p.bgRgb;
      const isTrans = p.transparent > 0.5;
      const needsBlur = p.glow > 0.001 || p.lens === 1 || p.lens === 7;
      const usePost =
        p.trails > 0.001 ||
        needsBlur ||
        p.split > 0.001 ||
        p.grain > 0.001 ||
        p.mirror > 0 ||
        p.lens > 0 ||
        p.toneMap > 0 ||
        p.invert > 0.01 ||
        p.monoInvert > 0.001 ||
        isTrans ||
        p.flip > 0.5;

      if (!usePost || !targets) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, p.w, p.h);
        if (isTrans) gl.clearColor(0, 0, 0, 0);
        else gl.clearColor(bg[0], bg[1], bg[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        drawScene();
        return;
      }

      const readT = targets.idx === 0 ? targets.trail0 : targets.trail1;
      const writeT = targets.idx === 0 ? targets.trail1 : targets.trail0;

      gl.bindFramebuffer(gl.FRAMEBUFFER, writeT.fb);
      gl.viewport(0, 0, writeT.w, writeT.h);

      if (p.trails > 0.001) {
        const decay = Math.pow(p.trails, p.dt * V.REF_FPS);
        gl.useProgram(fadeProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readT.tex);
        gl.uniform1i(uFade.prev, 0);
        gl.uniform3f(uFade.bgCol, bg[0], bg[1], bg[2]);
        gl.uniform1f(uFade.decay, decay);
        gl.uniform1f(uFade.transparent, p.transparent);
        gl.bindVertexArray(emptyVAO);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        if (isTrans) gl.clearColor(0, 0, 0, 0);
        else gl.clearColor(bg[0], bg[1], bg[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }

      drawScene();

      if (needsBlur) {
        gl.bindVertexArray(emptyVAO);
        gl.useProgram(downProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(uDown.tex, 0);

        gl.bindFramebuffer(gl.FRAMEBUFFER, targets.mip1.fb);
        gl.viewport(0, 0, targets.mip1.w, targets.mip1.h);
        gl.bindTexture(gl.TEXTURE_2D, writeT.tex);
        gl.uniform2f(uDown.halfPx, 0.5 / writeT.w, 0.5 / writeT.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindFramebuffer(gl.FRAMEBUFFER, targets.mip2.fb);
        gl.viewport(0, 0, targets.mip2.w, targets.mip2.h);
        gl.bindTexture(gl.TEXTURE_2D, targets.mip1.tex);
        gl.uniform2f(uDown.halfPx, 0.5 / targets.mip1.w, 0.5 / targets.mip1.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.useProgram(upProg);
        gl.uniform1i(uUp.tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, targets.bloomOut.fb);
        gl.viewport(0, 0, targets.bloomOut.w, targets.bloomOut.h);
        gl.bindTexture(gl.TEXTURE_2D, targets.mip2.tex);
        gl.uniform2f(uUp.halfPx, 0.5 / targets.mip2.w, 0.5 / targets.mip2.h);
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
        gl.bindTexture(gl.TEXTURE_2D, targets.bloomOut.tex);
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
      gl.uniform1i(uPost.toneMap, p.toneMap);
      gl.uniform2f(uPost.texel, 1.0 / p.w, 1.0 / p.h);
      gl.uniform3f(uPost.bgCol, bg[0], bg[1], bg[2]);
      gl.bindVertexArray(emptyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);

      targets.idx = 1 - targets.idx;
    }

    function destroy() {
      destroyTargets();
      gl.deleteVertexArray(emptyVAO);
      gl.deleteProgram(fadeProg);
      gl.deleteProgram(downProg);
      gl.deleteProgram(upProg);
      gl.deleteProgram(postProg);
    }

    return { resize, clearTrails, render, destroy, get isHdr() { return useHdr; } };
  }

  V.createPost = createPost;
})();