(() => {
  const V = window.VORTEX;

  const NOISE_CHUNK = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

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
  `;

  const SUPERFORM_HELPER = `
  float superR(float ang, float m, float n1, float n2, float n3) {
    float a = abs(cos(m * ang * 0.25));
    float b = abs(sin(m * ang * 0.25));
    float t1 = pow(max(a, 1e-4), n2);
    float t2 = pow(max(b, 1e-4), n3);
    return pow(max(t1 + t2, 1e-4), -1.0 / max(n1, 0.25));
  }
  `;

  const SDF_HELPER = `
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-3), 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  float sceneSdf(vec3 p, vec4 fp, float t) {
    float twist = fp.z * 1.6 * p.y;
    float ct = cos(twist);
    float st = sin(twist);
    vec3 q = vec3(p.x * ct - p.z * st, p.y, p.x * st + p.z * ct);
    float dSphere = length(q) - (0.58 + 0.14 * sin(t * 0.8));
    vec2 torQ = vec2(length(q.xz) - (0.68 + fp.x * 0.025), q.y);
    float dTorus = length(torQ) - (0.14 + fp.y * 0.014);
    float dUnion = smin(dSphere, dTorus, 0.24);
    float rip = sin(q.x * (2.5 + fp.x * 0.5) + t) * sin(q.y * (2.5 + fp.y * 0.5)) * sin(q.z * 3.0) * (0.04 + fp.z * 0.06);
    if (fp.x > 6.0) {
      vec3 bq = abs(q) - vec3(0.46);
      float dBox = length(max(bq, 0.0)) + min(max(bq.x, max(bq.y, bq.z)), 0.0);
      dUnion = smin(dUnion, dBox, 0.18);
    }
    return dUnion + rip;
  }

  vec3 sdfNormal(vec3 p, vec4 fp, float t) {
    const float e = 0.008;
    return normalize(vec3(
      sceneSdf(p + vec3(e, 0.0, 0.0), fp, t) - sceneSdf(p - vec3(e, 0.0, 0.0), fp, t),
      sceneSdf(p + vec3(0.0, e, 0.0), fp, t) - sceneSdf(p - vec3(0.0, e, 0.0), fp, t),
      sceneSdf(p + vec3(0.0, 0.0, e), fp, t) - sceneSdf(p - vec3(0.0, 0.0, e), fp, t)
    ) + 1e-5);
  }
  `;

  function hasFlag(list, id) {
    return !list || list.includes(id);
  }

  function buildSimVS(f) {
    const all = !f || f.all;
    const shapes = all ? null : f.shapes;
    const needTarget = all || f.target;
    const needBrush = all || f.brush;
    const needCam = all || f.cam;
    const needPins = all || f.pins;
    const needSuper = hasFlag(shapes, 6);
    const needSdf = hasFlag(shapes, 9);

    const shapeBranches = [];
    if (hasFlag(shapes, 0)) {
      shapeBranches.push(`if (uShape == 0) {
      float r = length(pos);
      pull = -pos * (0.85 + 0.95 * r * r);
    }`);
    }
    if (hasFlag(shapes, 1)) {
      shapeBranches.push(`if (uShape == 1) {
      vec2 xy = pos.xy;
      float xyLen = max(length(xy), 1e-4);
      vec3 ringTarget = vec3((xy / xyLen) * (0.68 + 0.12 * uProgress), 0.0);
      pull = (ringTarget - pos) * 2.4 + vec3(-xy.y, xy.x, 0.0) * (1.2 + uSwirl * 0.35);
    }`);
    }
    if (hasFlag(shapes, 2)) {
      shapeBranches.push(`if (uShape == 2) {
      float waveY = sin(pos.x * 2.4 + wavePhase) * 0.32;
      pull = vec3(-pos.x * 0.45, (waveY - pos.y) * 2.1, -pos.z * 2.4);
    }`);
    }
    if (hasFlag(shapes, 3)) {
      shapeBranches.push(`if (uShape == 3) {
      vec3 c1 = uTwinCenter;
      vec3 c2 = -c1;
      bool near1 = dot(pos - c1, pos - c1) < dot(pos - c2, pos - c2);
      vec3 d = pos - (near1 ? c1 : c2);
      float spinDir = near1 ? 1.0 : -1.0;
      pull = -d * (1.4 + dot(d, d)) + cross(vec3(0.0, 0.0, spinDir), d) * 2.2;
    }`);
    }
    if (hasFlag(shapes, 4)) {
      shapeBranches.push(`if (uShape == 4) {
      float r = length(pos);
      pull = r > 1.35 ? -pos * (r - 1.35) * 1.2 : vec3(0.0);
    }`);
    }
    if (hasFlag(shapes, 5) && needTarget) {
      shapeBranches.push(`if (uShape == 5) {
      int slot = gl_VertexID & 65535;
      vec4 tInfo = texelFetch(uTargetTex, ivec2(slot & 255, slot >> 8), 0);
      vec3 tPos = tInfo.xyz * 2.0 - 1.0;
      pull = (tPos - pos) * 4.8;
      curl *= 0.28;
      swirl *= 0.12;
    }`);
    }
    if (needSuper) {
      shapeBranches.push(`if (uShape == 6) {
      float fi = float(gl_VertexID & 65535) / 65536.0;
      float th = (fi * 6.2831853 * 29.0) + seed * 6.2831853;
      float ph = (fract(fi * 173.17 + seed) - 0.5) * 3.1415926;
      float m = 1.0 + uFormParams.x;
      float n1 = 0.35 + uFormParams.y * 0.45;
      float n2 = 0.4 + uFormParams.z * 2.2;
      float r1 = superR(th, m, n1, n2, n2);
      float r2 = superR(ph, m, n1, n2, n2);
      float cp = cos(ph);
      vec3 tPos = vec3(r1 * cos(th) * r2 * cp, r2 * sin(ph), r1 * sin(th) * r2 * cp) * 0.78;
      vec3 toT = tPos - pos;
      vec3 nrm = normalize(tPos + 1e-4);
      pull = toT * 3.2 + cross(nrm, curl) * (uFormParams.w * 1.8);
      curl *= mix(0.65, 0.25, uFormParams.w);
    }`);
    }
    if (hasFlag(shapes, 7)) {
      shapeBranches.push(`if (uShape == 7) {
      float fi = float(gl_VertexID & 65535) / 65536.0;
      float pK = floor(2.0 + uFormParams.x * 0.55);
      float qK = floor(3.0 + uFormParams.y * 0.55);
      float ang = fi * 6.2831853 + loopPhase * 0.5;
      float rr = 0.56 + 0.22 * cos(qK * ang);
      vec3 knot = vec3(rr * cos(pK * ang), rr * sin(pK * ang), 0.26 * sin(qK * ang));
      vec3 tanDir = normalize(vec3(-sin(pK * ang) * pK, cos(pK * ang) * pK, cos(qK * ang) * qK * 0.35) + 1e-4);
      vec3 side = normalize(cross(tanDir, vec3(0.0, 0.0, 1.0)) + 1e-4);
      vec3 up = cross(side, tanDir);
      float tube = (0.04 + uFormParams.z * 0.14) * (0.35 + 0.65 * seed);
      float a2 = seed * 6.2831853 * 7.0 + loopPhase;
      vec3 tPos = knot + (side * cos(a2) + up * sin(a2)) * tube;
      pull = (tPos - pos) * 3.8 + tanDir * (0.9 + uFormParams.w * 1.4);
      curl *= 0.35;
    }`);
    }
    if (hasFlag(shapes, 8)) {
      shapeBranches.push(`if (uShape == 8) {
      vec3 pA = pos * 1.65;
      vec3 dA;
      if (uFormParams.x < 4.0) {
        dA = vec3(10.0 * (pA.y - pA.x), pA.x * (28.0 - (pA.z * 12.0 + 22.0)) - pA.y, pA.x * pA.y - 2.66 * (pA.z * 12.0 + 22.0)) * 0.065;
      } else if (uFormParams.x < 8.0) {
        float a = 0.95; float b = 0.7; float c = 0.6; float d = 3.5; float e = 0.25; float f = 0.1;
        dA = vec3((pA.z - b) * pA.x - d * pA.y, d * pA.x + (pA.z - b) * pA.y, c + a * pA.z - (pA.z * pA.z * pA.z) / 3.0 - (pA.x * pA.x + pA.y * pA.y) * (1.0 + e * pA.z) + f * pA.z * pA.x * pA.x * pA.x) * 0.85;
      } else {
        float b = 0.19 + uFormParams.z * 0.08;
        dA = vec3(sin(pA.y * 2.2) - b * pA.x, sin(pA.z * 2.2) - b * pA.y, sin(pA.x * 2.2) - b * pA.z) * 2.1;
      }
      float rA = length(pos);
      pull = dA * (0.7 + uFormParams.y * 0.14) - pos * max(0.0, rA - 1.05) * 3.5;
      curl *= 0.4;
    }`);
    }
    if (needSdf) {
      shapeBranches.push(`if (uShape == 9) {
      float d = sceneSdf(pos, uFormParams, wavePhase * 0.6);
      vec3 n = sdfNormal(pos, uFormParams, wavePhase * 0.6);
      vec3 tang = cross(n, normalize(uSpinVec + vec3(0.0, 1.0, 0.2) + 1e-4));
      pull = -n * (d * 5.2) + tang * (0.9 + uFormParams.w * 2.2);
      curl *= mix(0.7, 0.22, uFormParams.w);
    }`);
    }
    if (hasFlag(shapes, 10)) {
      shapeBranches.push(`if (uShape == 10) {
      float fi = float(gl_VertexID & 65535) / 65536.0;
      float hR = 0.24 + uFormParams.z * 0.1;
      float r3 = length(pos);
      if (seed < 0.16) {
        vec2 xy = pos.xy;
        float rl = max(length(xy), 1e-4);
        vec3 ringT = vec3((xy / rl) * (hR * 1.12), 0.0);
        pull = (ringT - pos) * 6.0 + vec3(-xy.y, xy.x, 0.0) * (3.6 / max(rl, 0.18));
        curl *= 0.12;
      } else if (seed < 0.36) {
        float ang = fi * 6.2831853 * 13.0 + wavePhase * 0.7;
        float arcR = hR * (1.18 + 0.42 * fract(seed * 29.1));
        vec3 lensT = vec3(cos(ang) * arcR, sin(ang) * arcR, (fract(seed * 73.7) - 0.5) * 0.14);
        pull = (lensT - pos) * 4.4 + vec3(-sin(ang), cos(ang), 0.0) * 2.2;
        curl *= 0.18;
      } else if (seed > 0.91 && uFormParams.y > 0.6) {
        float sgn = fract(seed * 41.3) > 0.5 ? 1.0 : -1.0;
        float jetY = sgn * (hR * 1.1 + fract(fi * 7.0 + uTime * 0.55) * 1.15);
        float cone = 0.025 + abs(jetY) * (0.04 + uFormParams.z * 0.06);
        float ja = jetY * (5.0 + uFormParams.y) + wavePhase * 1.5;
        vec3 jetT = vec3(cos(ja) * cone, jetY, sin(ja) * cone);
        pull = (jetT - pos) * 4.8 + vec3(0.0, sgn * (1.8 + uFormParams.y * 0.22), 0.0);
        curl *= 0.16;
      } else {
        vec2 xz = pos.xz;
        float rad = max(length(xz), 1e-4);
        float tR = hR * 1.18 + pow(fract(fi * 17.3 + seed * 3.1), 1.35) * (0.85 + uFormParams.x * 0.04);
        float ang = atan(xz.y, xz.x);
        float waveY = sin(ang * floor(2.0 + uFormParams.x * 0.35) - rad * 7.0 + wavePhase) * 0.03 * rad;
        vec3 diskT = vec3((xz / rad) * tR, waveY).xzy;
        float kep = (2.1 + uFormParams.w * 1.4) / sqrt(max(rad, 0.14));
        vec3 orb = vec3(-xz.y / rad, 0.0, xz.x / rad) * kep;
        pull = (diskT - pos) * vec3(2.2, 6.2, 2.2) + orb;
        curl *= 0.22;
      }
      if (r3 < hR * 1.02) pull += normalize(pos + 1e-4) * ((hR * 1.06 - r3) * 14.0);
      swirl *= 0.12;
    }`);
    }
    if (hasFlag(shapes, 11)) {
      shapeBranches.push(`if (uShape == 11) {
      float fi = float(gl_VertexID & 65535) / 65536.0;
      float arms = floor(2.0 + uFormParams.x * 0.5);
      float windK = 1.6 + uFormParams.y * 0.55;
      if (seed < 0.18) {
        float cr = 0.04 + pow(fract(seed * 19.3), 1.4) * 0.24;
        float ca = fi * 6.2831853 * 19.0 + wavePhase * 0.5;
        float cz = (fract(seed * 53.1) - 0.5) * 0.16;
        vec3 coreT = vec3(cos(ca) * cr * 1.35, cz, sin(ca) * cr);
        pull = (coreT - pos) * 3.8 + vec3(-sin(ca), 0.0, cos(ca)) * 1.6;
      } else if (seed > 0.90) {
        float hr = 0.45 + fract(seed * 31.7) * 0.85;
        float ha = fi * 6.2831853 * 11.0 + wavePhase * 0.15;
        float hb = (fract(seed * 89.3) - 0.5) * 2.4;
        vec3 haloT = vec3(cos(ha) * cos(hb), sin(hb) * 0.65, sin(ha) * cos(hb)) * hr;
        pull = (haloT - pos) * 1.8;
      } else {
        float armIdx = floor(fract(seed * 97.3) * arms);
        float rArm = 0.14 + pow(fract(fi * 23.7 + seed * 1.7), 1.15) * 1.05;
        float theta = (armIdx / arms) * 6.2831853 + rArm * windK + wavePhase * 0.28;
        float spread = (fract(seed * 47.9) - 0.5) * (0.14 + uFormParams.z * 0.22) * (0.4 + rArm);
        float thick = (fract(seed * 61.7) - 0.5) * (0.04 + uFormParams.z * 0.08) / (0.35 + rArm);
        vec3 armT = vec3(cos(theta + spread) * rArm, thick, sin(theta + spread) * rArm);
        vec3 tanV = vec3(-sin(theta), 0.0, cos(theta)) * (1.45 / sqrt(max(rArm, 0.16)));
        pull = (armT - pos) * 3.4 + tanV;
      }
      curl *= 0.26;
      swirl *= 0.16;
    }`);
    }
    if (hasFlag(shapes, 12)) {
      shapeBranches.push(`if (uShape == 12) {
      float fi = float(gl_VertexID & 65535) / 65536.0;
      float sgn = fract(seed * 37.3) > 0.5 ? 1.0 : -1.0;
      if (seed < 0.34) {
        float t = fract(fi * 5.0 + uTime * 0.48 + seed);
        float yJ = sgn * (0.08 + t * 1.28);
        float rJ = 0.03 + t * (0.06 + uFormParams.z * 0.08);
        float aJ = t * (8.0 + uFormParams.y * 1.8) + wavePhase * 1.6;
        vec3 jPos = vec3(cos(aJ) * rJ, yJ, sin(aJ) * rJ);
        pull = (jPos - pos) * 5.2 + vec3(-sin(aJ) * 0.6, sgn * 2.4, cos(aJ) * 0.6);
      } else {
        float u = fract(fi * 13.7 + seed * 2.3);
        float rad = 0.15 + u * (0.85 + uFormParams.x * 0.05);
        float funY = sgn * (0.11 / (rad + 0.14) - 0.08) * (0.7 + uFormParams.z * 0.7);
        float ang = atan(pos.z, pos.x);
        vec3 fPos = vec3(cos(ang) * rad, funY, sin(ang) * rad);
        float spinK = (2.3 + uFormParams.w * 1.6) / sqrt(max(rad, 0.12));
        pull = (fPos - pos) * 3.8 + vec3(-sin(ang), 0.0, cos(ang)) * spinK;
      }
      curl *= 0.24;
      swirl *= 0.18;
    }`);
    }
    if (hasFlag(shapes, 13)) {
      shapeBranches.push(`if (uShape == 13) {
      float fi = float(gl_VertexID & 65535) / 65536.0;
      float sep = 0.42 + uFormParams.x * 0.035;
      float orbA = wavePhase * 0.22;
      vec3 c1 = vec3(cos(orbA) * sep, sin(orbA) * 0.14, sin(orbA) * sep);
      vec3 c2 = -c1;
      if (seed > 0.84) {
        float bt = fract(fi * 11.0 + seed * 3.7);
        vec3 midP = mix(c1, c2, bt);
        float arch = sin(bt * 3.1415926) * (0.28 + uFormParams.z * 0.24);
        vec3 brT = midP + vec3(0.0, arch * cos(orbA), arch * sin(orbA));
        pull = (brT - pos) * 3.2 + normalize(c2 - c1 + 1e-4) * 1.1;
      } else {
        bool g1 = seed < 0.42;
        vec3 ctr = g1 ? c1 : c2;
        float sDir = g1 ? 1.0 : -1.0;
        float arm = fract(seed * 71.3) > 0.5 ? 0.0 : 3.1415926;
        float rG = 0.06 + pow(fract(fi * 19.1 + seed * 2.9), 1.2) * 0.54;
        float th = arm + rG * (2.6 + uFormParams.y * 0.45) * sDir + wavePhase * 0.35 * sDir;
        vec3 loc = vec3(cos(th) * rG, (fract(seed * 43.1) - 0.5) * 0.05, sin(th) * rG);
        float tilt = g1 ? (0.45 + uFormParams.z * 0.35) : -(0.55 + uFormParams.z * 0.3);
        float ct = cos(tilt); float stT = sin(tilt);
        vec3 rotL = vec3(loc.x, loc.y * ct - loc.z * stT, loc.y * stT + loc.z * ct);
        vec3 locV = vec3(-sin(th) * sDir, 0.0, cos(th) * sDir) * (1.4 / sqrt(max(rG, 0.1)));
        vec3 rotV = vec3(locV.x, locV.y * ct - locV.z * stT, locV.y * stT + locV.z * ct);
        pull = (ctr + rotL - pos) * 3.8 + rotV;
      }
      curl *= 0.24;
      swirl *= 0.14;
    }`);
    }
    if (hasFlag(shapes, 14)) {
      shapeBranches.push(`if (uShape == 14) {
      float fi = float(gl_VertexID & 65535) / 65536.0;
      if (seed < 0.58) {
        float u = (fract(fi * 9.3 + seed * 1.9 + uTime * 0.08) - 0.5) * 2.0;
        float throat = 0.22 + uFormParams.x * 0.025;
        float rad = throat + u * u * (0.68 + uFormParams.z * 0.28);
        float a = fi * 6.2831853 * 23.0 + u * (2.0 + uFormParams.b) + wavePhase * 0.45;
        vec3 wPos = vec3(cos(a) * rad, sin(a) * rad, u * 0.92);
        vec3 wTan = vec3(-sin(a) * 1.4, cos(a) * 1.4, 0.85);
        pull = (wPos - pos) * 4.2 + wTan;
      } else {
        float th = fi * 6.2831853 * 17.0 + wavePhase * 0.2;
        float ph = (fract(seed * 83.7) - 0.5) * 3.1415926;
        float ridge = 1.0 + 0.18 * sin(th * floor(3.0 + uFormParams.y * 0.5)) * cos(ph * 4.0 + wavePhase);
        float shR = (0.76 + uFormParams.z * 0.24) * ridge;
        vec3 shP = vec3(cos(th) * cos(ph), sin(ph), sin(th) * cos(ph)) * shR;
        pull = (shP - pos) * 2.8 + cross(normalize(shP + 1e-4), vec3(0.0, 1.0, 0.3)) * 1.2;
      }
      curl *= 0.32;
      swirl *= 0.18;
    }`);
    }

    const shapeBody = shapeBranches.length ? shapeBranches.join(' else ') : '';

    return `#version 300 es
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
  uniform vec4  uFormParams;
  uniform int   uIntegrator;
  uniform float uLoopSec;
  uniform int   uLayerMode;
  uniform float uSeed;
  uniform float uProgress;
${needPins ? '  uniform vec4  uPins[4];' : ''}
${needCam ? '  uniform int   uUseCam;\n  uniform sampler2D uCamTex;' : ''}
${needTarget ? '  uniform sampler2D uTargetTex;' : ''}
${needBrush ? '  uniform sampler2D uBrushTex;' : ''}

  out vec4 vPos;
  out vec4 vVel;
${NOISE_CHUNK}
${needSuper ? SUPERFORM_HELPER : ''}
${needSdf ? SDF_HELPER : ''}

  vec3 hash3(float n) {
    return fract(sin(vec3(n, n + 1.0, n + 2.0) * 43758.5453)) * 2.0 - 1.0;
  }

  void main() {
    vec3 pos = aPos.xyz;
    float life = aPos.w;
    vec3 vel = aVel.xyz;
    float seed = aVel.w;

    float dt = clamp(uDt, 0.0001, 0.05);
    float loopPhase = (uTime / max(uLoopSec, 2.0)) * 6.2831853;
    float wavePhase = uIntegrator == 2 ? loopPhase : uTime * 1.3;

    if (uIntegrator == 2) {
      life = fract(life - dt / max(uLoopSec, 2.0));
    } else {
      life -= dt * (0.14 + 0.18 * seed);
    }

    bool bad = any(isnan(pos)) || any(isinf(pos)) || any(isnan(vel)) || any(isinf(vel)) || dot(pos, pos) > 36.0;
    if ((uIntegrator != 2 && life <= 0.0) || bad) {
      vec3 dir = normalize(hash3(seed * 917.3 + uTime + uSeed * 0.017) + 1e-4);
      float rad = 0.25 + 0.55 * fract(seed * 17.31 + uTime * 0.13);
      pos = dir * rad;
      vel = cross(dir, vec3(0.0, 1.0, 0.2)) * 0.8;
      life = 1.0;
    }

    int layer = 0;
    if (uLayerMode == 1 && seed > 0.78) layer = 1;
    else if (uLayerMode == 2 && seed > 0.82) layer = 2;
    else if (uLayerMode == 3 && seed > 0.5) layer = 1;
    else if (uLayerMode == 4) layer = seed > 0.85 ? 2 : (seed > 0.65 ? 1 : 0);

    vec3 flowOff = uIntegrator == 2
      ? vec3(cos(loopPhase), sin(loopPhase), sin(loopPhase * 2.0) * 0.5) * 0.85
      : uFlowOffset;
    vec3 curl = curlNoise(pos * uFreq + flowOff) * uFlowDir;
    vec3 swirl = cross(uSpinVec * (layer == 1 && uLayerMode == 3 ? -1.0 : 1.0), pos);

    vec3 pull = vec3(0.0);
    if (layer == 2) {
      float rD = length(pos);
      pull = (rD > 1.85 ? -pos * (rD - 1.85) * 1.1 : vec3(0.0)) + cross(vec3(0.0, 0.25, 0.0), pos);
      curl *= 0.45;
      swirl *= 0.25;
    } else if (layer == 1 && (uLayerMode == 1 || uLayerMode == 4)) {
      vec2 xz = pos.xz;
      float xzL = max(length(xz), 1e-4);
      float ringR = 1.05 + 0.18 * uProgress;
      vec3 ringT = vec3((xz / xzL) * ringR, 0.0);
      pull = (ringT - pos) * 2.8 + vec3(-xz.y, 0.0, xz.x) * (1.5 + uSwirl * 0.4);
      curl *= 0.32;
    } else {
      ${shapeBody}
    }

    vec2 toPtr = pos.xy - uPointer.xy;
    float ptrDist = dot(toPtr, toPtr) + 0.04;
    vec3 ptrForce = vec3(toPtr.y, -toPtr.x, 0.0) * (uPointer.z * 0.25 / ptrDist);
    if (abs(uClickForce) > 0.01) {
      vec3 away = normalize(vec3(toPtr, pos.z) + 1e-4);
      ptrForce += away * (-uClickForce * 2.8 / (ptrDist + 0.08));
    }

    vec3 brushForce = vec3(0.0);
${needBrush ? `    vec2 bUv = clamp(pos.xy * 0.42 + 0.5, 0.0, 1.0);
    vec2 texUv = vec2(bUv.x, 1.0 - bUv.y);
    vec2 brushVal = (texture(uBrushTex, texUv).rg - 0.5) * 6.5;
    brushForce = vec3(brushVal.x, brushVal.y, 0.0);` : ''}

    vec3 pinForce = vec3(0.0);
${needPins ? `    for (int i = 0; i < 4; i++) {
      float pPow = uPins[i].z;
      if (abs(pPow) > 0.01) {
        vec2 pd = pos.xy - uPins[i].xy;
        float dist2 = dot(pd, pd) + 0.03;
        pinForce += vec3(-pd.y, pd.x, 0.0) * (pPow * 1.1 / dist2) - vec3(pd, pos.z * 0.3) * (0.45 * abs(pPow) / dist2);
      }
    }` : ''}

    vec3 camForce = vec3(0.0);
${needCam ? `    if (uUseCam == 1) {
      vec2 cUv = clamp(pos.xy * 0.42 + 0.5, 0.0, 1.0);
      float camBright = texture(uCamTex, vec2(1.0 - cUv.x, 1.0 - cUv.y)).r;
      if (camBright > 0.25) camForce = vec3(0.0, (camBright - 0.25) * 2.2, 0.0);
    }` : ''}

    float dustBias = mix(0.15, 0.85, uSilk);
    float curlScale = uCurl * (0.75 + dustBias * seed);
    vec3 windForce = vec3(uWind.x, uWind.y, 0.0);
    vec3 targetVel = curl * curlScale + swirl + pull + ptrForce + windForce + brushForce + pinForce + camForce;

    if (uIntegrator == 1) {
      float mass = 0.65 + 0.7 * seed;
      vel += (targetVel / mass) * dt * 2.4;
      vel *= exp(-(0.85 + 1.15 * (1.0 - uSilk)) * dt);
    } else {
      float response = mix(mix(4.2, 2.0, uSilk), mix(5.8, 3.6, uSilk), seed);
      vel = mix(vel, targetVel, 1.0 - exp(-response * dt));
    }

    float sp = length(vel);
    if (sp > 6.5) vel *= (6.5 / sp);

    pos += vel * dt;
    if (any(isnan(pos)) || any(isinf(pos))) pos = vec3(0.0);
    if (any(isnan(vel)) || any(isinf(vel))) vel = vec3(0.0);

    vPos = vec4(pos, life);
    vVel = vec4(vel, seed);
  }`;
  }

  const SIM_FS = `#version 300 es
  precision highp float;
  precision highp int;
  void main() {}`;

  function buildRenderVS(f) {
    const all = !f || f.all;
    const needPhoto = all || f.photo;
    return `#version 300 es
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
  uniform vec3  uLight3Col;
  uniform vec3  uLightDir;
  uniform vec3  uLight3Dir;
  uniform float uLight1Power;
  uniform float uRimPower;
  uniform float uLight3Power;
  uniform float uLightPulse;
  uniform float uAudioHi;
  uniform int   uMaterial;
  uniform float uSpecular;
  uniform float uDof;
  uniform float uFog;
  uniform float uAdditive;
  uniform int   uLayerMode;
  uniform float uProgress;
${needPhoto ? '  uniform int   uHasPhoto;\n  uniform sampler2D uPhotoTex;' : ''}

  out vec3 vColor;
  out float vAlpha;
  out vec2 vUv;
  out float vSeed;
  out float vAdditive;
  out float vMat;

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
    vMat = float(uMaterial);

    int layer = 0;
    if (uLayerMode == 1 && seed > 0.78) layer = 1;
    else if (uLayerMode == 2 && seed > 0.82) layer = 2;
    else if (uLayerMode == 3 && seed > 0.5) layer = 1;
    else if (uLayerMode == 4) layer = seed > 0.85 ? 2 : (seed > 0.65 ? 1 : 0);

    float speed = length(vel);
    float shutter = uShutter * (1.0 + 0.7 * (1.0 - seed));
    vec3 streakDir = speed > 1e-4 ? vel / speed : vec3(0.0, 1.0, 0.0);
    float streakLen = max(speed * shutter, 0.005);

    vec3 p = rotCam(pos);
    float coc = abs(p.z) * uDof;
    vec2 hClip = toClip(p);
    vec2 tClip = toClip(rotCam(pos - streakDir * streakLen));
    vec2 delta = hClip - tClip;
    float dLen = length(delta);
    vec2 dir2 = dLen > 1e-5 ? delta / dLen : vec2(0.0, 1.0);
    vec2 perp2 = vec2(-dir2.y, dir2.x);

    float sizeBoost = (1.0 + coc * 2.8) * (layer == 2 ? 1.35 : 1.0);
    vec2 finalXY;
    if (uDotShape == 0) {
      finalXY = mix(tClip, hClip, aCorner.y) + perp2 * (aCorner.x * (0.85 + coc * 1.4) * uPx);
      vUv = vec2(aCorner.x, aCorner.y);
    } else if (uDotShape == 1 || uDotShape == 4 || uDotShape == 5) {
      float rad = (2.4 + 3.4 * seed) * sizeBoost;
      finalXY = hClip + (perp2 * aCorner.x + dir2 * (aCorner.y * 2.0 - 1.0)) * rad * uPx;
      vUv = vec2(aCorner.x, aCorner.y * 2.0 - 1.0);
    } else if (uDotShape == 2) {
      float rad = (2.6 + 4.0 * seed) * sizeBoost;
      finalXY = hClip + (perp2 * aCorner.x * 0.7 + dir2 * (aCorner.y * 2.0 - 1.0) * 1.6) * rad * uPx;
      vUv = vec2(aCorner.x, aCorner.y * 2.0 - 1.0);
    } else {
      finalXY = mix(tClip, hClip, aCorner.y) + perp2 * (aCorner.x * (1.25 + coc * 1.4) * uPx);
      vUv = vec2(aCorner.x, aCorner.y);
    }

    gl_Position = vec4(finalXY, 0.0, 1.0);

    vec3 viewVel = normalize(rotCam(streakDir) + 1e-4);
    vec3 surfN = normalize(mix(p, cross(vel, p) + p * 0.5, 0.45) + 1e-4);
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float diff1 = clamp(dot(surfN, uLightDir) * 0.5 + 0.5, 0.0, 1.0);
    float diff3 = clamp(dot(surfN, uLight3Dir) * 0.5 + 0.5, 0.0, 1.0);
    float rim = pow(max(1.0 - abs(surfN.z), 1e-4), 1.6);
    float posLen = length(pos);
    float coreShade = smoothstep(0.05, 1.05, posLen);
    float pulse = 1.0 + uLightPulse * 0.45 * sin(uTime * 3.4 - posLen * 3.0) + uAudioHi + uProgress * 0.25;

    float lit = pow(max(diff1, 1e-4), uContrast) * (0.72 + 0.28 * coreShade) * uLight1Power * pulse;

    float driver = lit;
    if (uColorDriver == 1) driver = clamp(speed * 0.32, 0.0, 1.0);
    else if (uColorDriver == 2) driver = clamp((p.z + 1.1) * 0.45, 0.0, 1.0);
    else if (uColorDriver == 4) driver = clamp(float(layer) * 0.45 + seed * 0.25 + diff1 * 0.3, 0.0, 1.0);

    vec3 baseCol = ramp3(uColDark, uColMid, uColBright, driver);
${needPhoto ? `    if (uColorDriver == 3 && uHasPhoto == 1) {
      int slot = gl_InstanceID & 65535;
      baseCol = texelFetch(uPhotoTex, ivec2(slot & 255, slot >> 8), 0).rgb;
    }` : ''}

    if (uHueDrift > 0.001) {
      baseCol = clamp(hueShift(baseCol, uTime * uHueDrift * 1.4 + seed * 0.25 + float(layer) * 0.4), 0.0, 1.0);
    }

    vec3 finalCol = baseCol * mix(vec3(1.0), uLight1Col, 0.45) * (0.45 + 0.75 * clamp(lit, 0.0, 1.8));
    finalCol += uLight3Col * pow(max(diff3, 1e-4), 1.8) * uLight3Power * 0.65;

    vec3 halfVec = normalize(uLightDir + viewDir);
    if (uMaterial == 1) {
      float th = dot(viewVel, halfVec);
      float kajiya = pow(max(sqrt(max(1.0 - th * th, 0.0)), 1e-4), 10.0);
      finalCol += uLight1Col * kajiya * uSpecular * 0.85;
    } else if (uMaterial == 2) {
      vec3 refl = reflect(-viewDir, surfN);
      float env = smoothstep(-0.2, 0.85, refl.y) * 0.65 + pow(max(dot(surfN, halfVec), 1e-4), 18.0);
      finalCol = mix(finalCol, uColBright * (0.35 + env * 1.15) * uLight1Col, 0.55 * clamp(uSpecular, 0.0, 1.5));
    } else if (uMaterial == 3) {
      float iridAng = (1.0 - abs(dot(surfN, viewDir))) * 6.2831 + uTime * 0.6 + seed * 1.5;
      vec3 irid = 0.5 + 0.5 * cos(iridAng + vec3(0.0, 2.094, 4.188));
      finalCol = mix(finalCol, finalCol * (0.55 + irid * 1.15), 0.72) + irid * rim * 0.38 * uSpecular;
    } else if (uMaterial == 4) {
      finalCol = finalCol * 1.35 + uLight1Col * pow(max(diff1, 1e-4), 2.5) * 0.55;
    } else if (uMaterial == 5) {
      finalCol = mix(uColDark, baseCol, 0.45);
    } else if (uMaterial == 6) {
      float spec = pow(max(dot(surfN, halfVec), 1e-4), 24.0) * uSpecular;
      finalCol += uLight1Col * spec * 1.1;
    }

    bool inkStyle = (uMixMode == 2 || uMaterial == 5);
    finalCol += uLight2Col * rim * uRimPower * (inkStyle ? -0.3 : 0.65);

    if (uFog > 0.001) {
      float fogAmt = smoothstep(0.3, -1.6, p.z) * uFog;
      finalCol = mix(finalCol, uBgCol, fogAmt * 0.65);
    }

    float bgDiff = length(finalCol - uBgCol);
    if (!inkStyle && bgDiff < 0.08 && rim > 0.35) {
      finalCol = mix(finalCol, uBgLum > 0.5 ? vec3(0.05) : vec3(0.95), 0.45);
    }

    vColor = clamp(finalCol, 0.0, 2.4);

    float lifeFade = smoothstep(0.0, 0.12, life) * smoothstep(1.0, 0.85, life);
    float tailFade = (uDotShape == 0 || uDotShape == 3) ? mix(0.25, 1.0, aCorner.y) : 1.0;
    float baseAlpha = mix(0.20, 0.42, clamp(speed * 0.35, 0.0, 1.0));
    float dofFade = 1.0 / (1.0 + coc * 1.8);
    float layerFade = layer == 2 ? 0.6 : 1.0;
    float addMix = inkStyle ? 0.0 : ((uMixMode == 1 || uMaterial == 4) ? 1.0 : clamp(uAdditive, 0.0, 1.0));
    if (addMix > 0.5) baseAlpha *= 0.7;

    vAdditive = addMix;
    vAlpha = clamp(lifeFade * tailFade * baseAlpha * dofFade * layerFade * uOpacity, 0.0, 1.0);
  }`;
  }

  const RENDER_FS = `#version 300 es
  precision highp float;
  precision highp int;

  in vec3 vColor;
  in float vAlpha;
  in vec2 vUv;
  in float vSeed;
  in float vAdditive;
  in float vMat;

  uniform int uDotShape;
  out vec4 fragColor;

  void main() {
    float shapeMask = 1.0;
    vec3 col = vColor;
    if (uDotShape == 1) {
      float r = length(vUv);
      shapeMask = smoothstep(1.0, 0.15, r);
      if (vMat > 5.5 && r < 1.0) {
        float nz = sqrt(max(1.0 - r * r, 0.0));
        float hi = pow(max(dot(vec3(vUv * 0.8, nz), normalize(vec3(0.4, 0.6, 0.9))), 0.0), 14.0);
        col += vec3(hi * 0.65);
      }
    } else if (uDotShape == 2) {
      float d = abs(vUv.x) + abs(vUv.y);
      shapeMask = smoothstep(1.05, 0.7, d);
    } else if (uDotShape == 3) {
      shapeMask = step(0.45, fract(vUv.y * 3.5 + vSeed * 11.0));
    } else if (uDotShape == 4) {
      float r = length(vUv);
      shapeMask = smoothstep(1.0, 0.82, r) * smoothstep(0.42, 0.62, r);
    } else if (uDotShape == 5) {
      vec2 a = abs(vUv);
      float star = max(a.x * 0.25 + a.y, a.y * 0.25 + a.x);
      shapeMask = smoothstep(0.85, 0.18, star);
    }
    float a = vAlpha * shapeMask;
    if (a < 0.004) discard;
    // Unified premultiplied output: Over (vAdditive=0) smoothly to pure Plus (vAdditive=1)
    fragColor = vec4(col * a, a * (1.0 - vAdditive));
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
  uniform float uTransparent;
  out vec4 fragColor;

  void main() {
    vec4 c = texture(uPrev, vUv);
    if (uTransparent > 0.5) {
      c *= uDecay;
      c = max(c - vec4(0.5 / 255.0), vec4(0.0));
      fragColor = c;
    } else {
      vec3 rgb = mix(uBgCol, c.rgb, uDecay);
      vec3 diff = uBgCol - rgb;
      rgb += sign(diff) * min(abs(diff), vec3(1.0 / 255.0));
      fragColor = vec4(rgb, 1.0);
    }
  }`;

  const KAWASE_DOWN_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uTex;
  uniform vec2 uHalfPx;
  out vec4 fragColor;

  void main() {
    vec4 s = texture(uTex, vUv) * 4.0;
    s += texture(uTex, vUv - uHalfPx);
    s += texture(uTex, vUv + uHalfPx);
    s += texture(uTex, vUv + vec2(uHalfPx.x, -uHalfPx.y));
    s += texture(uTex, vUv - vec2(uHalfPx.x, -uHalfPx.y));
    fragColor = s * 0.125;
  }`;

  const KAWASE_UP_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uTex;
  uniform vec2 uHalfPx;
  out vec4 fragColor;

  void main() {
    vec4 s = texture(uTex, vUv + vec2(-uHalfPx.x * 2.0, 0.0));
    s += texture(uTex, vUv + vec2(uHalfPx.x * 2.0, 0.0));
    s += texture(uTex, vUv + vec2(0.0, -uHalfPx.y * 2.0));
    s += texture(uTex, vUv + vec2(0.0, uHalfPx.y * 2.0));
    s += texture(uTex, vUv + vec2(-uHalfPx.x, uHalfPx.y)) * 2.0;
    s += texture(uTex, vUv + vec2(uHalfPx.x, uHalfPx.y)) * 2.0;
    s += texture(uTex, vUv + vec2(-uHalfPx.x, -uHalfPx.y)) * 2.0;
    s += texture(uTex, vUv + vec2(uHalfPx.x, -uHalfPx.y)) * 2.0;
    fragColor = s / 12.0;
  }`;

  function buildPostFS(f) {
    const all = !f || f.all;
    const needMirror = all || f.mirror;
    const needLens = all || f.lens;
    const needBloom = all || f.bloom;
    const needSplit = all || f.split || needLens;
    const needGrain = all || f.grain;

    return `#version 300 es
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
  uniform int   uToneMap;
  uniform vec2  uTexel;
  out vec4 fragColor;

  float rand2(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
${needLens ? `
  vec3 thermalRamp(float x) {
    vec3 a = vec3(0.02, 0.0, 0.08);
    vec3 b = vec3(0.55, 0.05, 0.65);
    vec3 c = vec3(0.98, 0.38, 0.05);
    vec3 d = vec3(1.0, 0.96, 0.72);
    if (x < 0.33) return mix(a, b, x * 3.0);
    if (x < 0.66) return mix(b, c, (x - 0.33) * 3.0);
    return mix(c, d, (x - 0.66) * 3.0);
  }` : ''}

  vec2 foldUv(vec2 uv) {
    if (uFlip > 0.5) uv.x = 1.0 - uv.x;
${needMirror ? `    if (uMirror == 0) return uv;
    if (uMirror == 1) return vec2(uv.x > 0.5 ? 1.0 - uv.x : uv.x, uv.y);
    float slices = uMirror == 2 ? 4.0 : (uMirror == 3 ? 6.0 : (uMirror == 4 ? 8.0 : 12.0));
    vec2 p = uv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x) + uTime * uMirrorSpin;
    float sector = 6.2831853 / slices;
    a = mod(a, sector);
    if (a > sector * 0.5) a = sector - a;
    return vec2(cos(a), sin(a)) * r + 0.5;` : '    return uv;'}
  }

  void main() {
    vec2 uv = foldUv(vUv);
${needLens ? `    if (uLens == 5) {
      vec2 d = uv - 0.5;
      float r = length(d);
      if (r < 0.45) uv = 0.5 + d * pow(max(r / 0.45, 1e-4), 0.55) * (0.45 / max(r, 1e-4));
    } else if (uLens == 6) {
      uv = floor(uv * 150.0) / 150.0;
    } else if (uLens == 4) {
      uv.x += sin(uv.y * 42.0 + uTime * 9.0) * 0.004;
    }` : ''}

    vec2 dir = uv - 0.5;
    float dist = length(dir);
    vec4 samp = texture(uScene, clamp(uv, 0.0, 1.0));
    vec3 col = samp.rgb;
    float alpha = uTransparent > 0.5 ? clamp(samp.a, 0.0, 1.0) : 1.0;

${needSplit ? `    float splitAmt = uSplit + (uLens == 4 ? 0.28 : 0.0);
    if (splitAmt > 0.001) {
      vec2 off = dir * (splitAmt * 0.018);
      vec4 sr = texture(uScene, clamp(uv + off, 0.0, 1.0));
      vec4 sb = texture(uScene, clamp(uv - off, 0.0, 1.0));
      col.r = sr.r;
      col.b = sb.b;
      if (uTransparent > 0.5) alpha = max(alpha, max(sr.a, sb.a));
    }` : ''}

    vec4 blurS = vec4(0.0);
${needBloom ? `    if (uGlow > 0.001 || uLens == 1 || uLens == 7) {
      blurS = texture(uGlowTex, clamp(uv, 0.0, 1.0));
      if (uGlow > 0.001) {
        col += blurS.rgb * uGlow;
        if (uTransparent > 0.5) {
          float gLum = max(blurS.r, max(blurS.g, blurS.b));
          alpha = clamp(alpha + gLum * uGlow * 0.55, 0.0, 1.0);
        }
      }
    }` : ''}

${needLens ? `    if (uLens == 1) {
      float dof = smoothstep(0.16, 0.52, dist);
      col = mix(col, blurS.rgb, dof * 0.88);
      if (uTransparent > 0.5) alpha = mix(alpha, blurS.a, dof * 0.88);
    } else if (uLens == 2) {
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = thermalRamp(clamp(lum * 1.15, 0.0, 1.0)) * (uTransparent > 0.5 ? alpha : 1.0);
    } else if (uLens == 3) {
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(0.88, 0.96, 1.0), vec3(0.02, 0.07, 0.12), clamp(lum * 1.2, 0.0, 1.0)) * (uTransparent > 0.5 ? alpha : 1.0);
    } else if (uLens == 4) {
      col *= 0.86 + 0.14 * sin(vUv.y * 620.0);
    } else if (uLens == 7) {
      vec2 dt = uTexel * 2.5;
      float lR = dot(texture(uGlowTex, clamp(uv + vec2(dt.x, 0.0), 0.0, 1.0)).rgb, vec3(0.3, 0.6, 0.1));
      float lL = dot(texture(uGlowTex, clamp(uv - vec2(dt.x, 0.0), 0.0, 1.0)).rgb, vec3(0.3, 0.6, 0.1));
      float lU = dot(texture(uGlowTex, clamp(uv + vec2(0.0, dt.y), 0.0, 1.0)).rgb, vec3(0.3, 0.6, 0.1));
      float lD = dot(texture(uGlowTex, clamp(uv - vec2(0.0, dt.y), 0.0, 1.0)).rgb, vec3(0.3, 0.6, 0.1));
      vec3 nM = normalize(vec3((lL - lR) * 4.5, (lD - lU) * 4.5, 0.45));
      float spec = pow(max(dot(nM, normalize(vec3(0.35, 0.65, 0.7))), 0.0), 16.0);
      float fres = pow(1.0 - max(nM.z, 0.0), 2.5);
      float mask = smoothstep(0.04, 0.25, dot(blurS.rgb, vec3(0.3, 0.6, 0.1)));
      col = mix(col, col * 0.65 + vec3(0.88, 0.94, 1.0) * (spec * 1.25 + fres * 0.45), mask);
    }` : ''}

    if (uToneMap == 1) {
      col = aces(max(col, vec3(0.0)));
    } else {
      col = clamp(col, 0.0, 1.0);
    }

${needGrain ? `    if (uGrain > 0.001) {
      float g = (rand2(vUv * 512.0 + fract(uTime * 17.3)) - 0.5) * uGrain;
      col += g * (uTransparent > 0.5 ? alpha : 1.0);
      if (uTransparent < 0.5) col *= 1.0 - dist * dist * 0.22;
    }` : ''}

    if (uInvert > 0.01) {
      vec3 inv = uTransparent > 0.5 ? (vec3(alpha) - col) : (1.0 - col);
      col = mix(col, inv, clamp(uInvert, 0.0, 1.0));
    }

    col = clamp(col, 0.0, 1.0);
    if (uMonoInvert > 0.001) {
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 invL = vec3((uTransparent > 0.5 ? alpha : 1.0) - lum);
      col = mix(col, invL, clamp(uMonoInvert, 0.0, 1.0));
    }

    if (uTransparent > 0.5) {
      alpha = clamp(max(alpha, max(col.r, max(col.g, col.b)) * 0.85), 0.0, 1.0);
    }
    fragColor = vec4(col, alpha);
  }`;
  }

  function buildShaders(features) {
    return {
      SIM_VS: buildSimVS(features),
      SIM_FS,
      RENDER_VS: buildRenderVS(features),
      RENDER_FS,
      QUAD_VS,
      FADE_FS,
      KAWASE_DOWN_FS,
      KAWASE_UP_FS,
      POST_FS: buildPostFS(features)
    };
  }

  V.buildShaders = buildShaders;
  V.SHADERS = buildShaders({ all: true });
})();