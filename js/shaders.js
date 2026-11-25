(() => {
  const V = window.VORTEX;

  const SIM_VS = `#version 300 es
  precision highp float;
  precision highp int;

  layout(location = 0) in vec4 aPos;
  layout(location = 1) in vec4 aVel;

  uniform float uDt;
  uniform float uTime;
  uniform vec3  uPointer;
  uniform float uClickForce;
  uniform float uCurl;
  uniform float uFreq;
  uniform float uSwirl;
  uniform int   uShape;
  uniform vec2  uWind;
  uniform float uSilk;
  uniform float uFlowDir;
  uniform vec3  uFlowOffset;
  uniform vec3  uSpinVec;
  uniform vec3  uTwinCenter;
  uniform vec4  uPins[4];
  uniform int   uUseCam;

  uniform sampler2D uTargetTex;
  uniform sampler2D uBrushTex;
  uniform sampler2D uCamTex;

  out vec4 vPos;
  out vec4 vVel;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  // Exact 3D simplex slope: 3 noise calls per curl instead of 12
  vec3 snoiseGrad(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    vec4 m2 = m * m;
    vec4 m3 = m2 * m;
    vec4 m4 = m2 * m2;
    vec4 px = vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3));
    vec4 t = -8.0 * m3 * px;
    vec3 grad = t.x * x0 + t.y * x1 + t.z * x2 + t.w * x3
              + m4.x * p0 + m4.y * p1 + m4.z * p2 + m4.w * p3;
    return 42.0 * grad;
  }

  vec3 curlNoise(vec3 p) {
    const vec3 oy = vec3(31.416, -47.853, 12.793);
    const vec3 oz = vec3(-23.145, 19.342, 67.211);
    vec3 gx = snoiseGrad(p);
    vec3 gy = snoiseGrad(p + oy);
    vec3 gz = snoiseGrad(p + oz);
    return vec3(gz.y - gy.z, gx.z - gz.x, gy.x - gx.y);
  }

  vec3 hash3(float n) {
    return fract(sin(vec3(n, n + 1.0, n + 2.0) * 43758.5453)) * 2.0 - 1.0;
  }

  void main() {
    vec3 pos = aPos.xyz;
    float life = aPos.w;
    vec3 vel = aVel.xyz;
    float seed = aVel.w;

    float dt = min(uDt, 0.05);
    life -= dt * (0.14 + 0.18 * seed);

    bool bad = any(isnan(pos)) || any(isinf(pos)) || any(isnan(vel)) || any(isinf(vel)) || dot(pos, pos) > 36.0;
    if (life <= 0.0 || bad) {
      vec3 dir = normalize(hash3(seed * 917.3 + uTime) + 1e-4);
      float rad = 0.25 + 0.55 * fract(seed * 17.31 + uTime * 0.13);
      pos = dir * rad;
      vel = cross(dir, vec3(0.0, 1.0, 0.2)) * 0.8;
      life = 1.0;
    }

    vec3 curl = curlNoise(pos * uFreq + uFlowOffset) * uFlowDir;
    vec3 swirl = cross(uSpinVec, pos);

    vec3 pull = vec3(0.0);
    if (uShape == 0) {
      float r = length(pos);
      pull = -pos * (0.85 + 0.95 * r * r);
    } else if (uShape == 1) {
      vec2 xy = pos.xy;
      float xyLen = max(length(xy), 1e-4);
      vec3 ringTarget = vec3((xy / xyLen) * 0.72, 0.0);
      pull = (ringTarget - pos) * 2.4 + vec3(-xy.y, xy.x, 0.0) * (1.2 + uSwirl * 0.35);
    } else if (uShape == 2) {
      float waveY = sin(pos.x * 2.4 + uTime * 1.3) * 0.32;
      pull = vec3(-pos.x * 0.45, (waveY - pos.y) * 2.1, -pos.z * 2.4);
    } else if (uShape == 3) {
      vec3 c1 = uTwinCenter;
      vec3 c2 = -c1;
      bool near1 = dot(pos - c1, pos - c1) < dot(pos - c2, pos - c2);
      vec3 d = pos - (near1 ? c1 : c2);
      float spinDir = near1 ? 1.0 : -1.0;
      pull = -d * (1.4 + dot(d, d)) + cross(vec3(0.0, 0.0, spinDir), d) * 2.2;
    } else if (uShape == 4) {
      float r = length(pos);
      pull = r > 1.35 ? -pos * (r - 1.35) * 1.2 : vec3(0.0);
    } else {
      int slot = gl_VertexID & 65535;
      vec4 tInfo = texelFetch(uTargetTex, ivec2(slot & 255, slot >> 8), 0);
      vec3 tPos = vec3(tInfo.xy * 2.0 - 1.0, (tInfo.z - 0.5) * 0.25);
      pull = (tPos - pos) * 4.8;
      curl *= 0.28;
      swirl *= 0.12;
    }

    vec2 toPtr = pos.xy - uPointer.xy;
    float ptrDist = dot(toPtr, toPtr) + 0.04;
    vec3 ptrForce = vec3(toPtr.y, -toPtr.x, 0.0) * (uPointer.z * 0.25 / ptrDist);
    if (abs(uClickForce) > 0.01) {
      vec3 away = normalize(vec3(toPtr, pos.z) + 1e-4);
      ptrForce += away * (-uClickForce * 2.8 / (ptrDist + 0.08));
    }

    // Canvas textures upload top-down, so flip Y to match world +Y up
    vec2 bUv = clamp(pos.xy * 0.42 + 0.5, 0.0, 1.0);
    vec2 texUv = vec2(bUv.x, 1.0 - bUv.y);
    vec2 brushVal = (texture(uBrushTex, texUv).rg - 0.5) * 6.5;
    vec3 brushForce = vec3(brushVal.x, brushVal.y, 0.0);

    vec3 pinForce = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      float pPow = uPins[i].z;
      if (abs(pPow) > 0.01) {
        vec2 pd = pos.xy - uPins[i].xy;
        float dist2 = dot(pd, pd) + 0.03;
        pinForce += vec3(-pd.y, pd.x, 0.0) * (pPow * 1.1 / dist2) - vec3(pd, pos.z * 0.3) * (0.45 * abs(pPow) / dist2);
      }
    }

    vec3 camForce = vec3(0.0);
    if (uUseCam == 1) {
      float camBright = texture(uCamTex, vec2(1.0 - texUv.x, texUv.y)).r;
      if (camBright > 0.25) {
        camForce = vec3(0.0, (camBright - 0.25) * 2.2, 0.0);
      }
    }

    float dustBias = mix(0.15, 0.85, uSilk);
    float curlScale = uCurl * (0.75 + dustBias * seed);
    vec3 windForce = vec3(uWind.x, uWind.y, 0.0);
    vec3 targetVel = curl * curlScale + swirl + pull + ptrForce + windForce + brushForce + pinForce + camForce;

    float response = mix(mix(4.2, 2.0, uSilk), mix(5.8, 3.6, uSilk), seed);
    vel = mix(vel, targetVel, 1.0 - exp(-response * dt));

    float sp = length(vel);
    if (sp > 6.5) vel *= (6.5 / sp);

    pos += vel * dt;

    vPos = vec4(pos, life);
    vVel = vec4(vel, seed);
  }`;

  const SIM_FS = `#version 300 es
  precision highp float;
  precision highp int;
  void main() {}`;

  const RENDER_VS = `#version 300 es
  precision highp float;
  precision highp int;

  layout(location = 0) in vec2 aCorner;
  layout(location = 1) in vec4 aPos;
  layout(location = 2) in vec4 aVel;

  uniform vec2  uPx;
  uniform vec2  uProjScale;
  uniform float uTime;
  uniform float uShutter;
  uniform float uZoom;
  uniform float uContrast;
  uniform float uOpacity;
  uniform vec4  uCamTrig;
  uniform vec3  uBgCol;
  uniform float uBgLum;
  uniform vec3  uColDark;
  uniform vec3  uColMid;
  uniform vec3  uColBright;
  uniform int   uColorDriver;
  uniform float uHueDrift;
  uniform int   uMixMode;
  uniform int   uDotShape;
  uniform vec3  uLight1Col;
  uniform vec3  uLight2Col;
  uniform vec3  uLightDir;
  uniform float uLight1Power;
  uniform float uRimPower;
  uniform float uLightPulse;
  uniform float uAudioHi;
  uniform int   uHasPhoto;

  uniform sampler2D uPhotoTex;

  out vec3 vColor;
  out float vAlpha;
  out vec2 vUv;
  out float vSeed;

  vec3 hueShift(vec3 col, float shift) {
    const vec3 k = vec3(0.57735);
    float c = cos(shift);
    float s = sin(shift);
    return col * c + cross(k, col) * s + k * dot(k, col) * (1.0 - c);
  }

  vec3 ramp3(vec3 a, vec3 b, vec3 c, float t) {
    t = clamp(t, 0.0, 1.0);
    return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, (t - 0.5) * 2.0);
  }

  vec3 rotCam(vec3 w) {
    vec3 p1 = vec3(w.x * uCamTrig.x - w.z * uCamTrig.y, w.y, w.x * uCamTrig.y + w.z * uCamTrig.x);
    return vec3(p1.x, p1.y * uCamTrig.z - p1.z * uCamTrig.w, p1.y * uCamTrig.w + p1.z * uCamTrig.z);
  }

  vec2 toClip(vec3 p) {
    float s = uZoom / max(2.65 - p.z, 0.4);
    return p.xy * s * uProjScale;
  }

  void main() {
    vec3 pos = aPos.xyz;
    float life = aPos.w;
    vec3 vel = aVel.xyz;
    float seed = aVel.w;
    vSeed = seed;

    float speed = length(vel);
    float shutter = uShutter * (1.0 + 0.7 * (1.0 - seed));
    vec3 streakDir = speed > 1e-4 ? vel / speed : vec3(0.0, 1.0, 0.0);
    float streakLen = max(speed * shutter, 0.005);

    vec3 p = rotCam(pos);
    vec2 hClip = toClip(p);
    vec2 tClip = toClip(rotCam(pos - streakDir * streakLen));
    vec2 delta = hClip - tClip;
    float dLen = length(delta);
    vec2 dir2 = dLen > 1e-5 ? delta / dLen : vec2(0.0, 1.0);
    vec2 perp2 = vec2(-dir2.y, dir2.x);

    vec2 finalXY;
    if (uDotShape == 0) {
      finalXY = mix(tClip, hClip, aCorner.y) + perp2 * (aCorner.x * 0.85 * uPx);
      vUv = vec2(aCorner.x, aCorner.y);
    } else if (uDotShape == 1) {
      float rad = 2.4 + 3.4 * seed;
      finalXY = hClip + (perp2 * aCorner.x + dir2 * (aCorner.y * 2.0 - 1.0)) * rad * uPx;
      vUv = vec2(aCorner.x, aCorner.y * 2.0 - 1.0);
    } else if (uDotShape == 2) {
      float rad = 2.6 + 4.0 * seed;
      finalXY = hClip + (perp2 * aCorner.x * 0.7 + dir2 * (aCorner.y * 2.0 - 1.0) * 1.6) * rad * uPx;
      vUv = vec2(aCorner.x, aCorner.y * 2.0 - 1.0);
    } else {
      finalXY = mix(tClip, hClip, aCorner.y) + perp2 * (aCorner.x * 1.25 * uPx);
      vUv = vec2(aCorner.x, aCorner.y);
    }

    gl_Position = vec4(finalXY, 0.0, 1.0);

    vec3 surfN = normalize(mix(p, cross(vel, p) + p * 0.5, 0.45) + 1e-4);
    float diff = clamp(dot(surfN, uLightDir) * 0.5 + 0.5, 0.0, 1.0);
    float rim = pow(clamp(1.0 - abs(surfN.z), 0.0, 1.0), 1.6);
    float posLen = length(pos);
    float coreShade = smoothstep(0.05, 1.05, posLen);
    float pulse = 1.0 + uLightPulse * 0.45 * sin(uTime * 3.4 - posLen * 3.0) + uAudioHi;

    float lit = pow(diff, uContrast) * (0.72 + 0.28 * coreShade) * uLight1Power * pulse;

    float driver = lit;
    if (uColorDriver == 1) {
      driver = clamp(speed * 0.32, 0.0, 1.0);
    } else if (uColorDriver == 2) {
      driver = clamp((p.z + 1.1) * 0.45, 0.0, 1.0);
    }

    vec3 baseCol = ramp3(uColDark, uColMid, uColBright, driver);
    if (uColorDriver == 3 && uHasPhoto == 1) {
      int slot = gl_InstanceID & 65535;
      baseCol = texelFetch(uPhotoTex, ivec2(slot & 255, slot >> 8), 0).rgb;
    }

    if (uHueDrift > 0.001) {
      baseCol = clamp(hueShift(baseCol, uTime * uHueDrift * 1.4 + seed * 0.25), 0.0, 1.0);
    }

    vec3 finalCol = baseCol * mix(vec3(1.0), uLight1Col, 0.45) * (0.45 + 0.75 * clamp(lit, 0.0, 1.6));
    finalCol += uLight2Col * rim * uRimPower * (uMixMode == 2 ? -0.35 : 0.65);

    float bgDiff = length(finalCol - uBgCol);
    if (bgDiff < 0.08 && rim > 0.35) {
      finalCol = mix(finalCol, uBgLum > 0.5 ? vec3(0.05) : vec3(0.95), 0.45);
    }

    vColor = clamp(finalCol, 0.0, 1.35);

    float lifeFade = smoothstep(0.0, 0.12, life) * smoothstep(1.0, 0.85, life);
    float tailFade = uDotShape == 0 || uDotShape == 3 ? mix(0.25, 1.0, aCorner.y) : 1.0;
    float baseAlpha = mix(0.20, 0.40, clamp(speed * 0.35, 0.0, 1.0));
    if (uMixMode == 1) baseAlpha *= 0.65;
    vAlpha = clamp(lifeFade * tailFade * baseAlpha * uOpacity, 0.0, 1.0);
  }`;

  const RENDER_FS = `#version 300 es
  precision highp float;
  precision highp int;

  in vec3 vColor;
  in float vAlpha;
  in vec2 vUv;
  in float vSeed;

  uniform int uDotShape;
  out vec4 fragColor;

  void main() {
    float shapeMask = 1.0;
    if (uDotShape == 1) {
      shapeMask = smoothstep(1.0, 0.15, length(vUv));
    } else if (uDotShape == 2) {
      float d = abs(vUv.x) + abs(vUv.y);
      shapeMask = smoothstep(1.05, 0.7, d);
    } else if (uDotShape == 3) {
      shapeMask = step(0.45, fract(vUv.y * 3.5 + vSeed * 11.0));
    }
    float a = vAlpha * shapeMask;
    if (a < 0.005) discard;
    fragColor = vec4(vColor, a);
  }`;

  const QUAD_VS = `#version 300 es
  precision highp float;
  out vec2 vUv;
  void main() {
    vUv = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const FADE_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uPrev;
  uniform vec3 uBgCol;
  uniform float uDecay;
  out vec4 fragColor;

  void main() {
    vec3 c = texture(uPrev, vUv).rgb;
    c = mix(uBgCol, c, uDecay);
    vec3 diff = uBgCol - c;
    c += sign(diff) * min(abs(diff), vec3(1.0 / 255.0));
    fragColor = vec4(c, 1.0);
  }`;

  const BLUR_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uTex;
  uniform vec2 uStep;
  out vec4 fragColor;

  void main() {
    vec3 s = texture(uTex, vUv).rgb * 0.28;
    s += texture(uTex, vUv + uStep * 1.4).rgb * 0.24;
    s += texture(uTex, vUv - uStep * 1.4).rgb * 0.24;
    s += texture(uTex, vUv + uStep * 3.2).rgb * 0.12;
    s += texture(uTex, vUv - uStep * 3.2).rgb * 0.12;
    fragColor = vec4(s, 1.0);
  }`;

  const POST_FS = `#version 300 es
  precision highp float;
  precision highp int;
  in vec2 vUv;
  uniform sampler2D uScene;
  uniform sampler2D uGlowTex;
  uniform float uGlow;
  uniform float uSplit;
  uniform float uGrain;
  uniform float uTime;
  uniform int   uMirror;
  uniform float uMirrorSpin;
  uniform int   uLens;
  uniform float uInvert;
  uniform float uMonoInvert;
  uniform float uTransparent;
  uniform float uFlip;
  out vec4 fragColor;

  float rand2(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec2 foldUv(vec2 uv) {
    if (uFlip > 0.5) uv.x = 1.0 - uv.x;
    if (uMirror == 0) return uv;
    if (uMirror == 1) {
      return vec2(uv.x > 0.5 ? 1.0 - uv.x : uv.x, uv.y);
    }
    float slices = uMirror == 2 ? 4.0 : (uMirror == 3 ? 6.0 : (uMirror == 4 ? 8.0 : 12.0));
    vec2 p = uv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x) + uTime * uMirrorSpin;
    float sector = 6.2831853 / slices;
    a = mod(a, sector);
    if (a > sector * 0.5) a = sector - a;
    return vec2(cos(a), sin(a)) * r + 0.5;
  }

  vec3 thermalRamp(float x) {
    vec3 a = vec3(0.02, 0.0, 0.08);
    vec3 b = vec3(0.55, 0.05, 0.65);
    vec3 c = vec3(0.98, 0.38, 0.05);
    vec3 d = vec3(1.0, 0.96, 0.72);
    if (x < 0.33) return mix(a, b, x * 3.0);
    if (x < 0.66) return mix(b, c, (x - 0.33) * 3.0);
    return mix(c, d, (x - 0.66) * 3.0);
  }

  void main() {
    vec2 uv = foldUv(vUv);

    if (uLens == 5) {
      vec2 d = uv - 0.5;
      float r = length(d);
      if (r < 0.45) uv = 0.5 + d * pow(r / 0.45, 0.55) * (0.45 / max(r, 1e-4));
    } else if (uLens == 6) {
      uv = floor(uv * 150.0) / 150.0;
    } else if (uLens == 4) {
      uv.x += sin(uv.y * 42.0 + uTime * 9.0) * 0.004;
    }

    vec2 dir = uv - 0.5;
    float dist = length(dir);
    float splitAmt = uSplit + (uLens == 4 ? 0.28 : 0.0);
    vec2 off = dir * (splitAmt * 0.018);

    vec3 col;
    if (splitAmt > 0.001) {
      col.r = texture(uScene, clamp(uv + off, 0.0, 1.0)).r;
      col.g = texture(uScene, clamp(uv, 0.0, 1.0)).g;
      col.b = texture(uScene, clamp(uv - off, 0.0, 1.0)).b;
    } else {
      col = texture(uScene, clamp(uv, 0.0, 1.0)).rgb;
    }

    vec3 blurCol = vec3(0.0);
    if (uGlow > 0.001 || uLens == 1) {
      blurCol = texture(uGlowTex, clamp(uv, 0.0, 1.0)).rgb;
      if (uGlow > 0.001) {
        col += blurCol * uGlow;
      }
    }

    if (uLens == 1) {
      float dof = smoothstep(0.16, 0.52, dist);
      col = mix(col, blurCol, dof * 0.88);
    } else if (uLens == 2) {
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = thermalRamp(clamp(lum * 1.15, 0.0, 1.0));
    } else if (uLens == 3) {
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(0.88, 0.96, 1.0), vec3(0.02, 0.07, 0.12), clamp(lum * 1.2, 0.0, 1.0));
    } else if (uLens == 4) {
      float scan = 0.86 + 0.14 * sin(vUv.y * 620.0);
      col *= scan;
    }

    if (uGrain > 0.001) {
      float g = (rand2(vUv * 512.0 + fract(uTime * 17.3)) - 0.5) * uGrain;
      col += g;
      col *= 1.0 - dist * dist * 0.22;
    }

    if (uInvert > 0.01) {
      col = mix(col, 1.0 - col, clamp(uInvert, 0.0, 1.0));
    }

    col = clamp(col, 0.0, 1.0);
    if (uMonoInvert > 0.001) {
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(1.0 - lum), clamp(uMonoInvert, 0.0, 1.0));
    }

    float alpha = 1.0;
    if (uTransparent > 0.5) {
      alpha = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
      col = alpha > 0.001 ? min(col / alpha, vec3(1.0)) : vec3(0.0);
    }
    fragColor = vec4(col, alpha);
  }`;

  V.SHADERS = { SIM_VS, SIM_FS, RENDER_VS, RENDER_FS, QUAD_VS, FADE_FS, BLUR_FS, POST_FS };
})();