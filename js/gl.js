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
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('WebGL2 is not supported in this browser.');
    return gl;
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

  function makeTarget(gl, w, h) {
    const tex = makeTex(gl, w, h, gl.LINEAR);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
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

  V.gl = {
    createContext,
    createProgram,
    getUniforms,
    makeTex,
    makeTarget,
    destroyTarget,
    createParticleBuffers
  };
})();