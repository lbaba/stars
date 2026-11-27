(() => {
  const V = window.VORTEX;

  const QUAD_STRIP_VERTS = new Float32Array([
    -1, 0,
     1, 0,
    -1, 1,
     1, 1
  ]);

  function createContext(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('WebGL2 is not supported in this browser.');
    return gl;
  }

  function supportsHdrTargets(gl) {
    const hasExt = Boolean(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    if (!hasExt) return false;
    gl.getExtension('OES_texture_half_float_linear');
    const tex = gl.createTexture();
    const fb = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 2, 2, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    return ok;
  }

  function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(log);
    }
    return s;
  }

  function createProgram(gl, vsSrc, fsSrc, tfVaryings) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    if (tfVaryings) gl.transformFeedbackVaryings(p, tfVaryings, gl.SEPARATE_ATTRIBS);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error(log);
    }
    return p;
  }

  function getUniforms(gl, prog, map) {
    const out = {};
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      out[k] = gl.getUniformLocation(prog, map[k]);
    }
    return out;
  }

  function makeTex(gl, w, h, filter) {
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

  function makeTarget(gl, w, h, hdr) {
    const sw = Math.max(2, w | 0);
    const sh = Math.max(2, h | 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (hdr) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, sw, sh, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, sw, sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (hdr && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, sw, sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { tex, fb, w: sw, h: sh };
  }

  function destroyTarget(gl, target) {
    if (!target) return;
    gl.deleteTexture(target.tex);
    gl.deleteFramebuffer(target.fb);
  }

  function createParticleBuffers(gl, initPos, initVel) {
    const posVBO = [gl.createBuffer(), gl.createBuffer()];
    const velVBO = [gl.createBuffer(), gl.createBuffer()];
    const simVAO = [gl.createVertexArray(), gl.createVertexArray()];
    const renderVAO = [gl.createVertexArray(), gl.createVertexArray()];

    const quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_STRIP_VERTS, gl.STATIC_DRAW);

    for (let i = 0; i < 2; i++) {
      gl.bindBuffer(gl.ARRAY_BUFFER, posVBO[i]);
      gl.bufferData(gl.ARRAY_BUFFER, initPos, gl.DYNAMIC_COPY);
      gl.bindBuffer(gl.ARRAY_BUFFER, velVBO[i]);
      gl.bufferData(gl.ARRAY_BUFFER, initVel, gl.DYNAMIC_COPY);

      gl.bindVertexArray(simVAO[i]);
      gl.bindBuffer(gl.ARRAY_BUFFER, posVBO[i]);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, velVBO[i]);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);

      gl.bindVertexArray(renderVAO[i]);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, posVBO[i]);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(1, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, velVBO[i]);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(2, 1);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    return { posVBO, velVBO, simVAO, renderVAO, quadVBO };
  }

  function destroyParticleBuffers(gl, bufs) {
    if (!bufs) return;
    for (let i = 0; i < 2; i++) {
      gl.deleteBuffer(bufs.posVBO[i]);
      gl.deleteBuffer(bufs.velVBO[i]);
      gl.deleteVertexArray(bufs.simVAO[i]);
      gl.deleteVertexArray(bufs.renderVAO[i]);
    }
    gl.deleteBuffer(bufs.quadVBO);
  }

  V.gl = {
    createContext,
    supportsHdrTargets,
    createProgram,
    getUniforms,
    makeTex,
    makeTarget,
    destroyTarget,
    createParticleBuffers,
    destroyParticleBuffers
  };
})();