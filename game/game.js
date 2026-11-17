/*  YOGISHWAR · MOTOVERSE
    A self-contained WebGL2 night-racing engine (no libraries, works offline).
    The track IS the GitHub contribution calendar: 53 weeks long, 7 weekday lanes wide.
    Active days light up green, raise the terrain and carry "commit beams" you collect.

    Controls: W/↑ throttle · S/↓ brake · A/D/←/→ steer · R restart · Esc exit
    URL flags: ?capture (manual stepping for renders) · &shot=hero|chase|terrain|wide
*/
(() => {
  "use strict";

  // ───────────────────────────── data ─────────────────────────────
  const DATA = window.MOTOVERSE_DATA;
  const TL = 24;          // metres per week (track length per calendar column)
  const TW = 4.2;         // metres per weekday lane
  const LANES = 7;
  const HALF_W = (LANES * TW) / 2;
  const startDate = new Date(DATA.calendar_start + "T00:00:00Z");
  const startWd = startDate.getUTCDay();
  const nDays = DATA.counts.length;
  const WEEKS = Math.ceil((nDays + startWd) / 7);
  const TRACK_LEN = WEEKS * TL;
  const maxCount = Math.max(1, ...DATA.counts);
  const level = n => (n <= 0 ? 0 : 1 + Math.min(3, Math.floor(4 * Math.sqrt(n / maxCount) - 1e-9)));
  const cells = []; // cells[w][d] = {idx, count, date}
  for (let w = 0; w < WEEKS; w++) {
    cells.push([]);
    for (let d = 0; d < 7; d++) {
      const idx = w * 7 + d - startWd;
      const ok = idx >= 0 && idx < nDays;
      const date = ok ? new Date(startDate.getTime() + idx * 864e5) : null;
      cells[w].push({ idx, valid: ok, count: ok ? DATA.counts[idx] : 0, date, collected: false });
    }
  }
  const laneX = d => (3 - d) * TW;            // Sunday on the left of the rider (screen-left = +x)
  const cellAt = (x, z) => {
    const w = Math.floor(z / TL), d = Math.round(3 - x / TW);
    return w >= 0 && w < WEEKS && d >= 0 && d < 7 ? cells[w][d] : null;
  };
  const tileTop = c => (c && c.count ? 0.07 * level(c.count) : 0);
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const fmt = dt => `${String(dt.getUTCDate()).padStart(2, "0")} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;

  // deterministic RNG (scenery and obstacles are identical on every load)
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // ───────────────────────────── math ─────────────────────────────
  const M = {
    id: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
    mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    t: (x, y, z) => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]),
    s: (x, y, z) => new Float32Array([x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]),
    rx(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); },
    ry(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); },
    rz(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); },
    persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2); return new Float32Array([t / asp,0,0,0, 0,t,0,0, 0,0,(f + n) / (n - f),-1, 0,0,2 * f * n / (n - f),0]); },
    look(e, c, u) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0, -(xx*e[0]+xy*e[1]+xz*e[2]), -(yx*e[0]+yy*e[1]+yz*e[2]), -(zx*e[0]+zy*e[1]+zz*e[2]), 1]);
    },
    nrm(m) { // inverse-transpose of upper 3x3
      const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
      const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1;
      return new Float32Array([A / det, B / det, C / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det]);
    },
    xf(m, p) { return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]]; },
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ───────────────────────────── geometry ─────────────────────────────
  // every geometry is a flat array [px,py,pz,nx,ny,nz]* (non-indexed, flat shaded where useful)
  function tri(out, a, b, c) {
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2], vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    out.push(...a, nx, ny, nz, ...b, nx, ny, nz, ...c, nx, ny, nz);
  }
  function quad(out, a, b, c, d) { tri(out, a, b, c); tri(out, a, c, d); }
  function boxGeo() {
    const o = [], p = (x, y, z) => [x * .5, y * .5, z * .5];
    quad(o, p(-1,-1, 1), p( 1,-1, 1), p( 1, 1, 1), p(-1, 1, 1));
    quad(o, p( 1,-1,-1), p(-1,-1,-1), p(-1, 1,-1), p( 1, 1,-1));
    quad(o, p(-1, 1, 1), p( 1, 1, 1), p( 1, 1,-1), p(-1, 1,-1));
    quad(o, p(-1,-1,-1), p( 1,-1,-1), p( 1,-1, 1), p(-1,-1, 1));
    quad(o, p( 1,-1, 1), p( 1,-1,-1), p( 1, 1,-1), p( 1, 1, 1));
    quad(o, p(-1,-1,-1), p(-1,-1, 1), p(-1, 1, 1), p(-1, 1,-1));
    return o;
  }
  function smoothPush(o, p, n) { o.push(p[0], p[1], p[2], n[0], n[1], n[2]); }
  function cylGeo(seg = 20, cap = true) { // axis x, radius 1, length 1
    const o = [];
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const P = (x, c, s) => [x, c, s];
      smoothPush(o, P(-.5, c0, s0), [0, c0, s0]); smoothPush(o, P(.5, c0, s0), [0, c0, s0]); smoothPush(o, P(.5, c1, s1), [0, c1, s1]);
      smoothPush(o, P(-.5, c0, s0), [0, c0, s0]); smoothPush(o, P(.5, c1, s1), [0, c1, s1]); smoothPush(o, P(-.5, c1, s1), [0, c1, s1]);
      if (cap) for (const x of [-.5, .5]) { const n = [Math.sign(x), 0, 0]; smoothPush(o, [x, 0, 0], n); smoothPush(o, [x, c0, s0], n); smoothPush(o, [x, c1, s1], n); }
    }
    return o;
  }
  function torusGeo(R, r, seg = 40, side = 12) { // ring in the y-z plane around the x axis
    const o = [];
    const P = (u, v) => { const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
      return [[r * sv, (R + r * cv) * cu, (R + r * cv) * su], [sv, cv * cu, cv * su]]; };
    for (let i = 0; i < seg; i++) for (let j = 0; j < side; j++) {
      const u0 = i / seg * 6.2832, u1 = (i + 1) / seg * 6.2832, v0 = j / side * 6.2832, v1 = (j + 1) / side * 6.2832;
      const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), d = P(u0, v1);
      for (const q of [a, b, c, a, c, d]) smoothPush(o, q[0], q[1]);
    }
    return o;
  }
  function sphereGeo(seg = 18) {
    const o = [];
    const P = (i, j) => { const th = i / seg * Math.PI, ph = j / seg * 2 * Math.PI; const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; return [n, n]; };
    for (let i = 0; i < seg; i++) for (let j = 0; j < seg; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      for (const q of [a, b, c, a, c, d]) smoothPush(o, q[0], q[1]);
    }
    return o;
  }
  function coneGeo(seg = 24) { // apex at origin, opens along +z to radius 1 at z = 1
    const o = [];
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * 6.2832, a1 = (i + 1) / seg * 6.2832;
      tri(o, [0, 0, 0], [Math.cos(a0), Math.sin(a0), 1], [Math.cos(a1), Math.sin(a1), 1]);
    }
    return o;
  }
  function triangulate(pts) { // ear clipping, pts: [[z,y],...] CCW
    const idx = pts.map((_, i) => i), outT = [];
    const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
    if (area < 0) idx.reverse();
    const inside = (p, a, b, c) => {
      const s = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
      return s(a, b, p) >= 0 && s(b, c, p) >= 0 && s(c, a, p) >= 0;
    };
    let guard = 0;
    while (idx.length > 3 && guard++ < 999) {
      for (let i = 0; i < idx.length; i++) {
        const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
        const a = pts[ia], b = pts[ib], c = pts[ic];
        if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 0) continue;
        if (idx.some(k => k !== ia && k !== ib && k !== ic && inside(pts[k], a, b, c))) continue;
        outT.push([ia, ib, ic]); idx.splice(i, 1); break;
      }
    }
    if (idx.length === 3) outT.push([...idx]);
    return outT;
  }
  function extrudeGeo(profile, halfW) { // profile [[z,y]], halfW(z,y) -> half width; side faces at ±x
    const o = [], T = triangulate(profile);
    const V = (i, s) => { const [z, y] = profile[i]; return [s * halfW(z, y), y, z]; };
    for (const [a, b, c] of T) { tri(o, V(a, 1), V(c, 1), V(b, 1)); tri(o, V(a, -1), V(b, -1), V(c, -1)); }
    for (let i = 0; i < profile.length; i++) { const j = (i + 1) % profile.length; quad(o, V(i, -1), V(j, -1), V(j, 1), V(i, 1)); }
    return o;
  }
  function transformGeo(g, m) {
    const nm = M.nrm(m), o = new Array(g.length);
    for (let i = 0; i < g.length; i += 6) {
      const p = M.xf(m, [g[i], g[i + 1], g[i + 2]]);
      let nx = nm[0]*g[i+3] + nm[3]*g[i+4] + nm[6]*g[i+5], ny = nm[1]*g[i+3] + nm[4]*g[i+4] + nm[7]*g[i+5], nz = nm[2]*g[i+3] + nm[5]*g[i+4] + nm[8]*g[i+5];
      const l = Math.hypot(nx, ny, nz) || 1;
      o[i] = p[0]; o[i + 1] = p[1]; o[i + 2] = p[2]; o[i + 3] = nx / l; o[i + 4] = ny / l; o[i + 5] = nz / l;
    }
    return o;
  }
  function between(a, b, r) { // matrix mapping the unit x-cylinder onto the segment a→b with radius r
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d), x = d.map(v => v / L);
    let up = Math.abs(x[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    let y = [x[1] * up[2] - x[2] * up[1], x[2] * up[0] - x[0] * up[2], x[0] * up[1] - x[1] * up[0]]; const ly = Math.hypot(...y); y = y.map(v => v / ly);
    const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    return new Float32Array([x[0] * L, x[1] * L, x[2] * L, 0, y[0] * r, y[1] * r, y[2] * r, 0, z[0] * r, z[1] * r, z[2] * r, 0,
      (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 1]);
  }

  // ───────────────────────────── GL setup ─────────────────────────────
  const canvas = document.getElementById("world");
  const CAPTURE = /[?&]capture/.test(location.search);
  const SHOT = (location.search.match(/shot=(\w+)/) || [])[1] || null;
  const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: CAPTURE, powerPreference: "high-performance" });
  if (!gl) { document.body.classList.add("nogl"); console.warn("WebGL2 unavailable"); return; }

  function shader(vs, fs) {
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace("[0]", "")] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  const SCENE_VS = `#version 300 es
  layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor;
  layout(location=2) in vec3 iPos; layout(location=3) in vec3 iScl; layout(location=4) in vec3 iCol; layout(location=5) in vec4 iEmi;
  uniform mat4 uModel, uVP; uniform mat3 uNM; uniform float uMirror;
  out vec3 vW; out vec3 vN; out vec3 vCol; out vec4 vEmi; out vec3 vL; out vec3 vS;
  void main(){
    vec3 p = aPos * iScl + iPos;
    vec4 w = uModel * vec4(p, 1.0);
    vW = w.xyz; vN = normalize(uNM * (aNor / iScl)); vCol = iCol; vEmi = iEmi; vL = aPos; vS = iScl;
    if (uMirror > .5) w.y = -w.y;
    gl_Position = uVP * w;
  }`;
  const SCENE_FS = `#version 300 es
  precision highp float;
  in vec3 vW; in vec3 vN; in vec3 vCol; in vec4 vEmi; in vec3 vL; in vec3 vS;
  uniform vec3 uCam; uniform vec3 uLP[8]; uniform vec3 uLC[8]; uniform int uNL;
  uniform vec3 uHP; uniform vec3 uHD; uniform float uHI; uniform vec3 uKey; uniform float uKeyI; uniform float uGloss; uniform float uMirror; uniform float uAlpha; uniform float uTime;
  out vec4 o;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    int mode = int(vEmi.w + .5);
    vec3 N = normalize(vN); vec3 V = normalize(uCam - vW); if (dot(N, V) < 0.) N = -N;
    if (mode == 3 || mode == 5) { // additive light volumes (beams, headlight cone, trails)
      float f = mode == 3 ? clamp(1. - (vL.y + .5), 0., 1.) : clamp(1. - vL.z, 0., 1.);
      float edge = pow(1. - abs(dot(N, V)), 1.5);
      float a = mode == 3 ? f * f * (.55 + .45 * edge) : f * f * .22 * (1. - edge * .7);
      o = vec4(vEmi.rgb * a * (uMirror > .5 ? .35 : 1.), 1.); return;
    }
    if (mode == 4) { // soft contact shadow
      float r = length(vL.xz * 2.); o = vec4(0., 0., 0., (1. - smoothstep(.2, 1., r)) * .75); return;
    }
    vec3 base = vCol;
    vec3 Lm = normalize(vec3(-.35, .8, -.45));
    vec3 col = base * (.035 + .16 * max(dot(N, Lm), 0.)) * vec3(.75, .95, .85);
    vec3 H = normalize(Lm + V);
    col += vec3(.22, .32, .27) * pow(max(dot(N, H), 0.), 8. + uGloss * 120.) * uGloss;
    for (int i = 0; i < 8; i++) {
      if (i >= uNL) break;
      vec3 d = uLP[i] - vW; float dist = length(d); d /= dist;
      float att = 1. / (1. + .045 * dist * dist);
      float dif = max(dot(N, d), 0.);
      float spe = pow(max(dot(N, normalize(d + V)), 0.), 10. + uGloss * 90.) * (.15 + uGloss * 1.4);
      col += (base * dif + spe) * uLC[i] * att;
    }
    { // headlight spot
      vec3 d = uHP - vW; float dist = length(d); d /= dist;
      float spot = smoothstep(.86, .975, dot(-d, uHD));
      float att = uHI / (1. + .012 * dist * dist);
      col += (base * max(dot(N, d), 0.) * 1.6 + pow(max(dot(N, normalize(d + V)), 0.), 40.) * uGloss * 2.) * vec3(1., .99, .94) * spot * att;
    }
    col += vec3(0., 1., .46) * pow(1. - max(dot(N, V), 0.), 4.) * .06 * uGloss; // green rim
    if (uKeyI > 0.) { // studio lighting reserved for the bike & rider
      vec3 K = normalize(uKey);
      col += base * max(dot(N, K), 0.) * .35 * uKeyI;
      col += vec3(.85, .95, .9) * pow(max(dot(N, normalize(K + V)), 0.), 14. + uGloss * 160.) * uGloss * 1.6 * uKeyI;
      vec3 R = normalize(vec3(-K.x, .25, -K.z));
      col += vec3(.1, 1., .45) * pow(max(dot(N, R), 0.), 3.) * .55 * uKeyI * (.35 + uGloss);
      float strip = smoothstep(.9, 1., dot(reflect(-V, N), normalize(vec3(0., 1., .15))));
      col += vec3(.75, .85, .8) * strip * uGloss * .9 * uKeyI; // overhead softbox reflection
    }
    vec3 emi = vEmi.rgb;
    if (mode == 1) { // contribution tile: glowing edges + lit top
      vec3 hs = vS * .5; vec3 lp = vL * vS;
      float e = min(hs.x - abs(lp.x), hs.z - abs(lp.z));
      float top = step(.5, N.y);
      float edge = smoothstep(.14, 0., e) * top + smoothstep(.06, 0., hs.y - abs(lp.y)) * (1. - top) * .5;
      float scan = .5 + .5 * sin(lp.z * .9 - uTime * 3.);
      col += emi * (edge * 1.5 + top * (.12 + .05 * scan));
    } else if (mode == 2) { // building windows
      vec3 lp = vL * vS + vec3(vW.x, 0., vW.z) * .0;
      vec2 cell = floor(vec2(abs(N.x) > .5 ? lp.z : lp.x, lp.y) / vec2(2.6, 3.4));
      vec2 fr = fract(vec2(abs(N.x) > .5 ? lp.z : lp.x, lp.y) / vec2(2.6, 3.4));
      float lit = step(.88, hash(cell + floor(vW.xz * .05))) * step(.25, fr.x) * step(fr.x, .75) * step(.3, fr.y) * step(fr.y, .7) * (1. - step(.5, abs(N.y)));
      col += emi * lit;
    } else {
      col += emi;
    }
    float fd = length(uCam - vW);
    float fog = 1. - exp(-pow(fd * .0062, 1.6));
    col = mix(col, vec3(.004, .012, .008), fog);
    if (uMirror > .5) col *= .42;
    o = vec4(col, uAlpha);
  }`;
  const QUAD_VS = `#version 300 es
  out vec2 v; void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); v = p; gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
  const BRIGHT_FS = `#version 300 es
  precision highp float; in vec2 v; uniform sampler2D uT; out vec4 o;
  void main(){ vec3 c = texture(uT, v).rgb; float l = max(c.r, max(c.g, c.b)); o = vec4(c * smoothstep(.45, 1., l) * 1.4, 1.); }`;
  const BLUR_FS = `#version 300 es
  precision highp float; in vec2 v; uniform sampler2D uT; uniform vec2 uD; out vec4 o;
  void main(){ vec3 c = texture(uT, v).rgb * .227;
    c += (texture(uT, v + uD * 1.385).rgb + texture(uT, v - uD * 1.385).rgb) * .316;
    c += (texture(uT, v + uD * 3.231).rgb + texture(uT, v - uD * 3.231).rgb) * .070; o = vec4(c, 1.); }`;
  const COMP_FS = `#version 300 es
  precision highp float; in vec2 v; uniform sampler2D uS, uB; uniform float uBlur, uTime, uExposure; out vec4 o;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
  void main(){
    vec2 d = v - vec2(.5, .48); vec3 c = vec3(0.);
    for (int i = 0; i < 7; i++) c += texture(uS, vec2(.5, .48) + d * (1. - float(i) * .0055 * uBlur)).rgb;
    c /= 7.;
    c += texture(uB, v).rgb * 1.25;
    c *= uExposure;
    c = c / (1. + c * .12);
    float vig = smoothstep(1.05, .25, length(d * vec2(1.15, 1.)));
    c *= mix(.25, 1., vig);
    c += (h(v * 913.) - .5) * .018;
    c = pow(max(c, 0.), vec3(.95, .92, .97));
    o = vec4(c, 1.);
  }`;

  const sceneP = shader(SCENE_VS, SCENE_FS);
  const brightP = shader(QUAD_VS, BRIGHT_FS);
  const blurP = shader(QUAD_VS, BLUR_FS);
  const compP = shader(QUAD_VS, COMP_FS);
  const emptyVAO = gl.createVertexArray();

  function mesh(geo) {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);
    return { vao, n: geo.length / 6 };
  }
  // instance group: shares a mesh, per-instance pos/scale/colour/emission
  function group(m, dynamic = false) {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const g = { m, vao, buf: gl.createBuffer(), count: 0, list: [], dynamic };
    // re-bind the mesh's vertex buffer inside this VAO
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.buf);
    const S = 13 * 4;
    [[2, 3, 0], [3, 3, 12], [4, 3, 24], [5, 4, 36]].forEach(([loc, n, off]) => {
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, off); gl.vertexAttribDivisor(loc, 1); });
    gl.bindVertexArray(null);
    return g;
  }
  function meshV(geo) { const m = mesh(geo); gl.bindVertexArray(m.vao); m.vbo = gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING); gl.bindVertexArray(null); return m; }
  function inst(g, pos, scl, col, emi = [0, 0, 0], mode = 0) { g.list.push(pos[0], pos[1], pos[2], scl[0], scl[1], scl[2], col[0], col[1], col[2], emi[0], emi[1], emi[2], mode); }
  function upload(g) {
    gl.bindBuffer(gl.ARRAY_BUFFER, g.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.list), g.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    g.count = g.list.length / 13;
  }

  const CUBE = meshV(boxGeo());
  const CONE = meshV(coneGeo());
  const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const GREEN = [hex("#00E676"), hex("#00C853"), hex("#39FF14"), hex("#A3FF12")];
  const LV = [[.02, .07, .04], [0, .5, .16], [0, .8, .22], [.14, 1.1, .16], [.48, 1.35, .06]];

  // ───────────────────────────── world build ─────────────────────────────
  const tiles = group(CUBE), world = group(CUBE), beams = group(CUBE, true), fx = group(CUBE, true), shadow = group(CUBE, true);
  const lights = [];        // {p:[x,y,z], c:[r,g,b]}
  const obstacles = [];     // {x, z, hit}
  const gates = [];         // {z, label, passed}

  for (let w = 0; w < WEEKS; w++) for (let d = 0; d < 7; d++) {
    const c = cells[w][d], top = tileTop(c), lv = c.valid ? level(c.count) : 0;
    const col = c.valid ? (lv ? [.02, .09, .05] : [.035, .045, .04]) : [.015, .018, .016];
    const em = c.valid ? (lv ? LV[lv] : [.0, .09, .045]) : [0, .02, .01];
    const h = 0.6 + top;
    inst(tiles, [laneX(d), top - h / 2, w * TL + TL / 2], [TW * .955, h, TL * .985], col, em, 1);
    if (lv) lights.push({ p: [laneX(d), 1.4, w * TL + TL / 2], c: LV[lv].map(v => v * 1.3), cell: c });
  }
  // outer wet asphalt
  inst(tiles, [0, -0.62, TRACK_LEN / 2], [900, 1.2, TRACK_LEN + 1200], [.012, .016, .014], [0, 0, 0], 0);

  // barriers, LED strips, fence posts, lamps
  for (let z = -60; z < TRACK_LEN + 60; z += 6) {
    for (const s of [-1, 1]) {
      const x = s * (HALF_W + .75);
      inst(world, [x, .45, z + 3], [.6, .9, 5.95], [.05, .055, .05], [0, 0, 0]);            // concrete barrier
      inst(world, [x - s * .31, .78, z + 3], [.04, .06, 5.9], [0, 0, 0], [0, 1.3, .55]);    // LED strip
      inst(world, [x + s * 1.1, 2.2, z], [.08, 4.4, .08], [.08, .09, .085], [0, 0, 0]);      // fence post
    }
  }
  for (const s of [-1, 1]) for (const y of [1.6, 3.2, 4.3]) inst(world, [s * (HALF_W + 1.85), y, TRACK_LEN / 2], [.03, .03, TRACK_LEN + 120], [.07, .08, .075]);
  for (let z = TL; z < TRACK_LEN; z += TL * 2) for (const s of [-1, 1]) {
    const x = s * (HALF_W + 3.2);
    inst(world, [x, 4.5, z], [.22, 9, .22], [.06, .07, .065]);
    inst(world, [x - s * 1.6, 8.9, z], [3.2, .16, .3], [.06, .07, .065]);
    inst(world, [x - s * 2.9, 8.75, z], [.9, .12, .45], [0, 0, 0], [1.1, 1.6, 1.2]);
    lights.push({ p: [x - s * 2.9, 8.2, z], c: [.25, .9, .5] });
  }
  // month checkpoints
  let lastMonth = -1;
  for (let w = 0; w < WEEKS; w++) {
    const first = cells[w].find(c => c.valid); if (!first) continue;
    const m = first.date.getUTCMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      if (w < 2) continue;
      const z = w * TL;
      gates.push({ z, label: `${MONTHS[m]} ${first.date.getUTCFullYear()}`, passed: false });
      for (const s of [-1, 1]) {
        inst(world, [s * (HALF_W + .9), 3.6, z], [.7, 7.2, .7], [.04, .05, .045], [0, 0, 0]);
        inst(world, [s * (HALF_W + .5), 3.6, z], [.06, 6.8, .06], [0, 0, 0], [0, 1.6, .7]);
      }
      inst(world, [0, 7.3, z], [HALF_W * 2 + 2.5, .8, .8], [.04, .05, .045], [0, 0, 0]);
      inst(world, [0, 6.86, z], [HALF_W * 2 + 1, .07, .07], [0, 0, 0], [.2, 1.8, .6]);
      lights.push({ p: [0, 6, z], c: [.1, 1.1, .5] });
    }
  }
  // start / finish gantries
  for (const z of [0, TRACK_LEN]) {
    for (const s of [-1, 1]) inst(world, [s * (HALF_W + .9), 4.5, z], [.9, 9, .9], [.04, .05, .045]);
    inst(world, [0, 8.6, z], [HALF_W * 2 + 3, 1.6, 1], [.03, .035, .03]);
    for (let i = 0; i < 14; i++) inst(world, [-HALF_W + 1 + i * (HALF_W * 2 - 2) / 13, 8.6, z - .52], [.9, .9, .05], [0, 0, 0], i % 2 ? [.9, 1.5, 1] : [0, 1.4, .5]);
  }
  // obstacles: traffic barrels on empty tiles (game elements, not data)
  for (let w = 4; w < WEEKS - 1; w++) {
    if (rnd() < .45) continue;
    const empties = cells[w].map((c, d) => (c.count ? -1 : d)).filter(d => d >= 0);
    if (!empties.length) continue;
    const d = empties[Math.floor(rnd() * empties.length)], z = w * TL + 6 + rnd() * (TL - 12);
    obstacles.push({ x: laneX(d), z, hit: false });
    inst(world, [laneX(d), .55, z], [.75, 1.1, .75], [.05, .055, .05], [0, 0, 0]);
    inst(world, [laneX(d), .8, z], [.78, .1, .78], [0, 0, 0], [.9, 1.5, .4]);
    inst(world, [laneX(d), .4, z], [.78, .1, .78], [0, 0, 0], [.9, 1.5, .4]);
  }
  // skyline
  for (let i = 0; i < 260; i++) {
    const s = rnd() < .5 ? -1 : 1, x = s * (55 + rnd() * 170), z = -250 + rnd() * (TRACK_LEN + 600);
    const h = 18 + Math.pow(rnd(), 1.6) * 110, wdt = 10 + rnd() * 26, dpt = 10 + rnd() * 26;
    inst(world, [x, h / 2, z], [wdt, h, dpt], [.025, .03, .028], [.35, .9, .55], 2);
    if (rnd() < .25) inst(world, [x, h + .3, z], [wdt * .6, .25, .25], [0, 0, 0], [0, .9, .4]);
  }
  upload(tiles); upload(world);

  function rebuildBeams() {
    beams.list.length = 0;
    for (let w = 0; w < WEEKS; w++) for (let d = 0; d < 7; d++) {
      const c = cells[w][d]; if (!c.count || c.collected) continue;
      const lv = level(c.count), h = 3 + 2.6 * Math.sqrt(c.count);
      inst(beams, [laneX(d), tileTop(c) + h / 2, w * TL + TL / 2], [TW * .5, h, TL * .3], [0, 0, 0], LV[lv].map(v => v * .9), 3);
      inst(beams, [laneX(d), tileTop(c) + h / 2, w * TL + TL / 2], [TW * .14, h * 1.15, TL * .08], [0, 0, 0], [.6, 1.6, .8], 3);
    }
    upload(beams);
  }
  rebuildBeams();

  // ───────────────────────────── the motorcycle ─────────────────────────────
  const parts = {}; // name -> {geo:[], col, emi, gloss, mode}
  const P = (name, col, gloss = .5, emi = [0, 0, 0], mode = 0) => (parts[name] = { geo: [], col, gloss, emi, mode });
  P("body", [.018, .02, .02], 1.0); P("metal", [.11, .12, .12], .8); P("tire", [.012, .012, .012], .12);
  P("suit", [.03, .032, .031], .6); P("helmet", [.012, .013, .013], 1.0); P("visor", [.0, .02, .012], 1.0, [0, .06, .03]);
  P("glow", [0, 0, 0], 0, [.12, 2.0, .42]); P("lamp", [0, 0, 0], 0, [2.6, 2.6, 2.4]); P("screen", [.01, .025, .02], 1.0);
  P("wheelF", [.02, .02, .02], .9); P("wheelR", [.02, .02, .02], .9);
  const add = (name, geo, m) => parts[name].geo.push(...transformGeo(geo, m));
  const CYL = cylGeo(20), SPH = sphereGeo(16), BOX = boxGeo();
  const tube = (name, a, b, r) => add(name, CYL, between(a, b, r));
  const ball = (name, c, r, sx = 1, sy = 1, sz = 1) => add(name, SPH, M.mul(M.t(...c), M.s(r * sx, r * sy, r * sz)));
  const cube = (name, c, s) => add(name, BOX, M.mul(M.t(...c), M.s(...s)));

  const WR = .325, ZF = .72, ZR = -.72;
  // fairing silhouette (z forward, y up) — sharp, faceted supersport profile
  const prof = [[.99,.58],[.94,.74],[.80,.90],[.62,1.02],[.42,1.04],[.24,1.03],[.03,1.07],[-.18,.99],[-.42,.95],[-.64,1.03],[-.93,1.12],[-.97,1.06],[-.72,.91],[-.38,.80],[-.16,.62],[.18,.40],[.56,.38],[.82,.45],[.96,.50]];
  const halfW = (z, y) => { const t = clamp(1 - Math.abs(z - .05) / 1.05, 0, 1); return .07 + .14 * Math.pow(t, .6) * (y > .95 && z < -.2 ? .7 : 1); };
  add("body", extrudeGeo(prof, halfW), M.id());
  add("screen", extrudeGeo([[.80,.90],[.62,1.15],[.46,1.13],[.58,1.00]], () => .11), M.id());
  // green accent line along the fairing
  const acc = [[.95,.66],[.62,.60],[.25,.62],[-.15,.74],[-.55,.90],[-.9,1.06]];
  for (const s of [-1, 1]) for (let i = 0; i < acc.length - 1; i++) {
    const za = acc[i][0], zb = acc[i + 1][0];
    tube("glow", [s * (halfW(za, acc[i][1]) + .004), acc[i][1], za], [s * (halfW(zb, acc[i + 1][1]) + .004), acc[i + 1][1], zb], .007);
  }
  for (const s of [-1, 1]) {
    cube("lamp", [s * .055, .74, .965], [.07, .03, .02]);
    tube("glow", [s * .02, .80, .93], [s * .1, .77, .93], .006);
    tube("metal", [s * .09, .97, .44], [s * .085, WR, ZF], .03);                 // forks
    tube("metal", [s * .1, .99, .45], [s * .31, .97, .40], .014);               // clip-ons
    tube("metal", [s * .11, .44, -.04], [s * .1, WR, ZR], .035);               // swingarm
  }
  tube("metal", [0, WR, ZF], [0, .99, .45], .001);
  cube("metal", [0, .5, .06], [.30, .30, .46]);                                  // engine
  tube("metal", [.15, .36, -.12], [.17, .63, -.66], .055);                       // exhaust
  add("glow", CYL, M.mul(M.t(.172, .645, -.69), M.mul(M.ry(1.35), M.s(.02, .058, .058))));
  cube("glow", [0, 1.08, -.965], [.12, .025, .02]);                              // tail LED
  // rider in a full tuck
  const hip = [0, 1.1, -.3], sh = [0, 1.235, .15];
  tube("suit", hip, sh, .158); ball("suit", hip, .162); ball("suit", sh, .168, 1.2, .85, 1);
  ball("helmet", [0, 1.315, .37], .148, .95, .95, 1.14); ball("helmet", [0, 1.36, .30], .1, 1, .6, 1.2);
  ball("visor", [0, 1.31, .44], .128, .93, .52, .88);
  tube("glow", [0, 1.262, -.3], [0, 1.395, .15], .009);                           // suit spine stripe
  tube("glow", [-.141, 1.32, .27], [-.118, 1.37, .45], .006); tube("glow", [.141, 1.32, .27], [.118, 1.37, .45], .006);
  for (const s of [-1, 1]) {
    const elbow = [s * .25, 1.04, .22], hand = [s * .29, .985, .41], knee = [s * .25, .84, .04], foot = [s * .19, .52, -.26];
    tube("suit", [s * .17, 1.22, .14], elbow, .058); ball("suit", elbow, .058);
    tube("suit", elbow, hand, .05); ball("suit", hand, .052);
    tube("suit", [s * .13, 1.08, -.28], knee, .088); ball("suit", knee, .08);
    tube("suit", knee, foot, .068); cube("suit", [s * .19, .53, -.21], [.09, .1, .22]);
    ball("glow", [s * .255, .865, .095], .025);                                  // knee slider LED
  }
  // wheels (spin around their axle)
  for (const [name, z] of [["wheelF", ZF], ["wheelR", ZR]]) {
    add(name, torusGeo(.25, .075, 40, 12), M.t(0, WR, z));
    add(name, CYL, M.mul(M.t(0, WR, z), M.s(.05, .2, .2)));
    add(name, CYL, M.mul(M.t(0, WR, z), M.s(.11, .05, .05)));
    for (let i = 0; i < 5; i++) add(name, BOX, M.mul(M.t(0, WR, z), M.mul(M.rx(i * 1.2566), M.mul(M.t(0, .1, 0), M.s(.03, .2, .025)))));
    add(name, torusGeo(.212, .011, 48, 6), M.mul(M.t(.033, WR, z), M.id()));
    add(name, torusGeo(.212, .011, 48, 6), M.mul(M.t(-.033, WR, z), M.id()));
  }
  const RIMGLOW = { geo: [], col: [0, 0, 0], gloss: 0, emi: [.1, 2.2, .45], mode: 0 };
  RIMGLOW.geo = transformGeo(torusGeo(.214, .012, 48, 6), M.t(.034, 0, 0)).concat(transformGeo(torusGeo(.214, .012, 48, 6), M.t(-.034, 0, 0)));
  for (const k in parts) parts[k].mesh = meshV(parts[k].geo.length ? parts[k].geo : boxGeo());
  RIMGLOW.mesh = meshV(RIMGLOW.geo);

  // ───────────────────────────── render targets ─────────────────────────────
  let W = 0, H = 0, msFbo, msColor, msDepth, sceneFbo, sceneTex, bA, bB, tA, tB, bw, bh;
  const texFbo = (w, h) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return [f, t]; };
  function resize(fw, fh) {
    const dpr = CAPTURE ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.floor((fw || canvas.clientWidth) * dpr), h = Math.floor((fh || canvas.clientHeight) * dpr);
    if (w === W && h === H) return; W = w; H = h; canvas.width = w; canvas.height = h;
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
    msFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
    msColor = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, msColor); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColor);
    msDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, msDepth); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msDepth);
    [sceneFbo, sceneTex] = texFbo(w, h);
    bw = Math.max(1, w >> 2); bh = Math.max(1, h >> 2);
    [bA, tA] = texFbo(bw, bh); [bB, tB] = texFbo(bw, bh);
  }

  // ───────────────────────────── game state ─────────────────────────────
  const S = {};
  const best = (() => { try { return JSON.parse(localStorage.getItem("motoverse-best") || "null"); } catch (e) { return null; } })();
  let bestRun = best;
  function reset(mode) {
    Object.assign(S, { mode, x: laneX(3), z: 4, y: 0, yaw: 0, v: mode === "attract" ? 42 : 0, lean: 0, spin: 0, t: 0, dist: 0, score: 0,
      collected: 0, cps: 0, shake: 0, trail: [], toastT: 0, cd: mode === "play" ? 3.2 : 0, done: false, shotT: 0, demo: false });
    for (const row of cells) for (const c of row) c.collected = false;
    for (const o of obstacles) o.hit = false;
    for (const g of gates) g.passed = false;
    rebuildBeams();
    cam.init = false;
  }
  const totalCommits = DATA.counts.reduce((a, b) => a + b, 0);
  const cam = { p: [0, 3, -6], t: [0, 1, 6], fov: 62, init: false };
  const keys = {};

  // streak particles for the sense of speed
  const streaks = Array.from({ length: 70 }, () => ({ x: (rnd() - .5) * 60, y: .2 + rnd() * 7, z: rnd() * 220 }));

  // ───────────────────────────── simulation ─────────────────────────────
  function autopilot() {
    // aim for the next uncollected commit beam within ~6 weeks, dodge barrels
    const w0 = Math.floor(S.z / TL);
    let tx = S.x;
    outer: for (let w = w0; w < Math.min(WEEKS, w0 + 6); w++) {
      if ((w + 1) * TL < S.z + 4) continue;
      let bestD = -1, bestDist = 99;
      for (let d = 0; d < 7; d++) { const c = cells[w][d]; if (c.count && !c.collected && Math.abs(laneX(d) - S.x) < bestDist) { bestDist = Math.abs(laneX(d) - S.x); bestD = d; } }
      if (bestD >= 0) { tx = laneX(bestD); break outer; }
    }
    for (const o of obstacles) if (!o.hit && o.z > S.z && o.z - S.z < 45 && Math.abs(o.x - tx) < 1.6) tx = o.x + (o.x > 0 ? -TW : TW);
    tx = clamp(tx, -HALF_W + 1.5, HALF_W - 1.5);
    return { thr: 1, brk: 0, steer: clamp((S.x - tx) * .35 - S.yaw * 2.5, -1, 1) };
  }
  function input() {
    if (S.demo && S.cd <= 0 && !S.done) return autopilot();
    if (S.mode !== "play" || S.cd > 0 || S.done) return S.mode === "attract" ? autopilot() : { thr: 0, brk: S.done ? 1 : 0, steer: 0 };
    return { thr: keys.w ? 1 : 0, brk: keys.s ? 1 : 0, steer: (keys.d ? 1 : 0) - (keys.a ? 1 : 0) };
  }
  let toastTimer = 0;
  function toast(msg) { const el = document.getElementById("h-toast"); if (!el) return; el.textContent = msg; el.classList.add("show"); toastTimer = 1.6; }

  function step(dt) {
    S.t += dt;
    if (S.cd > 0) { S.cd -= dt; const el = document.getElementById("countdown"); el.textContent = S.cd > .2 ? Math.ceil(S.cd - .2) : "GO"; if (S.cd <= 0) el.textContent = ""; }
    const inp = input();
    const acc = inp.thr * (16 - S.v * .14) - inp.brk * 28 - (.0016 * S.v * S.v + .35) * (S.v > 0 ? 1 : 0);
    S.v = clamp(S.v + acc * dt, 0, S.mode === "attract" ? 52 : 82);
    const grip = clamp(S.v / 22, 0, 1);
    const yawT = -inp.steer * .34 * grip;
    S.yaw = lerp(S.yaw, yawT, 1 - Math.exp(-dt * 3.2));
    S.x += Math.sin(S.yaw) * S.v * dt; S.z += Math.cos(S.yaw) * S.v * dt;
    S.dist += Math.cos(S.yaw) * S.v * dt;
    S.lean = lerp(S.lean, inp.steer * .5 * grip, 1 - Math.exp(-dt * 5));
    S.spin += S.v * dt / WR;
    const c = cellAt(S.x, S.z);
    S.y = lerp(S.y, tileTop(c), 1 - Math.exp(-dt * 14));

    if (S.mode !== "attract") S.score += S.v * dt * 1.5;
    // walls
    const lim = HALF_W - .55;
    if (Math.abs(S.x) > lim) { S.x = Math.sign(S.x) * lim; if (S.v > 12) { S.v *= .72; S.shake = .5; if (S.mode === "play") toast("BARRIER CONTACT"); } S.yaw *= -.2; }
    // barrels
    for (const o of obstacles) if (!o.hit && Math.abs(o.x - S.x) < .85 && Math.abs(o.z - S.z) < 1.1) {
      o.hit = true; S.v *= .32; S.shake = .9; if (S.mode === "play") { S.score = Math.max(0, S.score - 600); toast("CRASH −600"); }
    }
    // commit beams
    if (c && c.count && !c.collected && Math.abs(S.z - (Math.floor(S.z / TL) * TL + TL / 2)) < TL * .45) {
      c.collected = true; S.collected += c.count; rebuildBeams();
      S.v = Math.min(S.v + 5 + c.count * .6, 90);
      if (S.mode === "play") { S.score += c.count * 250; toast(`+${c.count} COMMIT${c.count > 1 ? "S" : ""} · ${fmt(c.date)}`); }
    }
    for (const g of gates) if (!g.passed && S.z >= g.z) { g.passed = true; S.cps++; if (S.mode === "play") { S.score += 1000; toast(`CHECKPOINT · ${g.label}`); } }
    // finish / loop
    if (S.z >= TRACK_LEN) {
      if (S.mode === "play" && !S.done) finish();
      if (S.mode === "attract") reset("attract");
    }
    // light trail from the tail LED
    S.trail.unshift([S.x - Math.sin(S.lean) * 1.08, S.y + 1.08 * Math.cos(S.lean), S.z - .97]);
    if (S.trail.length > 46) S.trail.pop();
    S.shake = Math.max(0, S.shake - dt * 1.8);
    if (toastTimer > 0 && (toastTimer -= dt) <= 0) document.getElementById("h-toast")?.classList.remove("show");
  }
  function finish() {
    S.done = true;
    const run = { time: S.t - 3.2, score: Math.round(S.score), collected: S.collected };
    if (!bestRun || run.score > bestRun.score) { bestRun = run; try { localStorage.setItem("motoverse-best", JSON.stringify(run)); } catch (e) {} }
    const r = document.getElementById("results"); r.hidden = false;
    document.getElementById("r-time").textContent = run.time.toFixed(2) + " s";
    document.getElementById("r-score").textContent = run.score.toLocaleString();
    document.getElementById("r-col").textContent = `${S.collected} / ${totalCommits}`;
    document.getElementById("r-cp").textContent = `${S.cps} / ${gates.length}`;
    document.getElementById("r-best").textContent = `${bestRun.score.toLocaleString()} pts`;
  }

  // ───────────────────────────── camera ─────────────────────────────
  function cameraFor(dt, shot) {
    const fwd = [Math.sin(S.yaw), 0, Math.cos(S.yaw)];
    const b = [S.x, S.y, S.z];
    let p, t, fov;
    if (shot === "hero") {           // low three-quarter front, bike framed right of centre
      p = [b[0] - 3.1, b[1] + .95, b[2] + 6.4]; t = [b[0] + .55, b[1] + .72, b[2] - .1]; fov = 24;
    } else if (shot === "wide") {    // wide cinematic, room for typography on the left
      p = [b[0] - 3.6, b[1] + 1.0, b[2] + 6.6]; t = [b[0] - 1.5, b[1] + .72, b[2] - .82]; fov = 20;
    } else if (shot === "mobile") {
      p = [b[0] - 2.9, b[1] + 1.0, b[2] + 6.0]; t = [b[0] + .15, b[1] + 1.12, b[2]]; fov = 25;
    } else if (shot === "terrain") { // elevated view along the calendar
      p = [b[0] + 13, b[1] + 11, b[2] - 12]; t = [b[0] - 3, 0, b[2] + 40]; fov = 56;
    } else {                          // chase
      p = [b[0] - fwd[0] * 6.4, b[1] + 2.35, b[2] - fwd[2] * 6.4];
      t = [b[0] + fwd[0] * 8, b[1] + 1.05, b[2] + fwd[2] * 8];
      fov = 58 + S.v * .2;
    }
    const k = cam.init && !CAPTURE_HARD ? 1 - Math.exp(-dt * (shot === "chase" ? 7 : 3)) : 1;
    cam.p = cam.p.map((v, i) => lerp(v, p[i], k)); cam.t = cam.t.map((v, i) => lerp(v, t[i], k)); cam.fov = lerp(cam.fov, fov, k); cam.init = true;
  }
  let CAPTURE_HARD = false;
  let KEY_I = 1.3;
  function attractShot() { // cycle cinematic shots behind the hero copy
    const cyc = [["wide", 9], ["chase", 7], ["terrain", 6], ["hero", 7]];
    let t = S.t % cyc.reduce((a, c) => a + c[1], 0);
    for (const [s, d] of cyc) { if (t < d) return s; t -= d; }
    return "wide";
  }

  // ───────────────────────────── rendering ─────────────────────────────
  function bikeMatrix() {
    return M.mul(M.t(S.x, S.y, S.z), M.mul(M.ry(S.yaw), M.rz(S.lean)));
  }
  function setCommon(vp, camPos, mirror) {
    const u = sceneP.u;
    gl.uniformMatrix4fv(u.uVP, false, vp); gl.uniform3fv(u.uCam, camPos); gl.uniform1f(u.uMirror, mirror ? 1 : 0); gl.uniform1f(u.uTime, S.t);
  }
  function drawGroup(g, gloss, alpha = 1) {
    if (!g.count) return;
    const u = sceneP.u;
    gl.uniformMatrix4fv(u.uModel, false, M.id()); gl.uniformMatrix3fv(u.uNM, false, M.nrm(M.id()));
    gl.uniform1f(u.uGloss, gloss); gl.uniform1f(u.uAlpha, alpha);
    gl.bindVertexArray(g.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, g.m.n, g.count);
  }
  function drawPart(pt, model) {
    const u = sceneP.u;
    gl.bindVertexArray(pt.mesh.vao);
    for (let i = 2; i <= 5; i++) gl.disableVertexAttribArray(i);
    gl.vertexAttrib3f(2, 0, 0, 0); gl.vertexAttrib3f(3, 1, 1, 1); gl.vertexAttrib3fv(4, pt.col); gl.vertexAttrib4f(5, pt.emi[0], pt.emi[1], pt.emi[2], pt.mode);
    gl.uniformMatrix4fv(u.uModel, false, model); gl.uniformMatrix3fv(u.uNM, false, M.nrm(model));
    gl.uniform1f(u.uGloss, pt.gloss); gl.uniform1f(u.uAlpha, 1);
    gl.drawArrays(gl.TRIANGLES, 0, pt.mesh.n);
  }
  function drawBike() {
    const B = bikeMatrix();
    const kd = M.xf(B, [-.6, 1.4, 1.2]); gl.uniform3f(sceneP.u.uKey, kd[0] - S.x, kd[1] - S.y, kd[2] - S.z); gl.uniform1f(sceneP.u.uKeyI, KEY_I);
    for (const k of ["body", "metal", "suit", "helmet", "visor", "glow", "lamp", "screen"]) drawPart(parts[k], B);
    for (const [k, z] of [["wheelF", ZF], ["wheelR", ZR]]) {
      const Wm = M.mul(B, M.mul(M.t(0, WR, z), M.mul(M.rx(S.spin), M.t(0, -WR, -z))));
      drawPart(parts[k], Wm);
      drawPart(RIMGLOW, M.mul(B, M.mul(M.t(0, WR, z), M.rx(S.spin))));
    }
    gl.uniform1f(sceneP.u.uKeyI, 0);
  }
  function buildFx() {
    fx.list.length = 0;
    // headlight volume
    // (drawn separately with the cone mesh)
    // tail light trail
    for (let i = 1; i < S.trail.length; i++) {
      const a = S.trail[i - 1], b = S.trail[i], f = 1 - i / S.trail.length;
      const len = Math.max(.05, a[2] - b[2]);
      inst(fx, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [.03, .03, len], [0, 0, 0], [.05 * f, .7 * f, .3 * f], 3);
    }
    // wheel light trails at ground level
    for (const s of [-1, 1]) for (let i = 1; i < S.trail.length; i++) {
      const a = S.trail[i - 1], b = S.trail[i], f = Math.pow(1 - i / S.trail.length, 1.5);
      inst(fx, [(a[0] + b[0]) / 2 + s * .08, S.y + .04, (a[2] + b[2]) / 2 + .2], [.035, .02, Math.max(.05, a[2] - b[2])], [0, 0, 0], [0, 1.1 * f * Math.min(1, S.v / 40), .4 * f], 3);
    }
    // speed streaks
    const sp = S.v;
    for (const st of streaks) {
      if (st.z < S.z - 10) st.z += 230; if (st.z > S.z + 220) st.z -= 230;
      const len = .5 + sp * .16;
      if (sp > 15) inst(fx, [S.x * .2 + st.x, st.y, st.z], [.025, .025, len], [0, 0, 0], [.2, .9, .5].map(v => v * Math.min(1, (sp - 15) / 40)), 3);
    }
    upload(fx);
    shadow.list.length = 0;
    inst(shadow, [S.x, S.y + .012, S.z], [1.0, .01, 2.6], [0, 0, 0], [0, 0, 0], 4);
    upload(shadow);
  }
  function pickLights(center) {
    const L = lights.filter(l => !(l.cell && l.cell.collected))
      .map(l => [l, (l.p[0] - center[0]) ** 2 + (l.p[2] - center[2]) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, 8).map(a => a[0]);
    const lp = new Float32Array(24), lc = new Float32Array(24);
    L.forEach((l, i) => { lp.set(l.p, i * 3); lc.set(l.c.map(v => v * 2.1), i * 3); });
    return [lp, lc, L.length];
  }

  function render(shot) {
    const asp = W / H;
    const sh = S.shake * .12;
    const eye = [cam.p[0] + (Math.random() - .5) * sh, cam.p[1] + (Math.random() - .5) * sh, cam.p[2]];
    const proj = M.persp(cam.fov * Math.PI / 180, asp, .1, 1400);
    const vp = M.mul(proj, M.look(eye, cam.t, [0, 1, 0]));
    buildFx();
    const B = bikeMatrix();
    const head = M.xf(B, [0, .74, 1.0]), headF = M.xf(B, [0, .62, 2.0]);
    const hd = [headF[0] - head[0], headF[1] - head[1], headF[2] - head[2]]; const hl = Math.hypot(...hd);
    const [lp, lc, nl] = pickLights([(S.x + cam.p[0]) / 2, 0, (S.z + cam.t[2]) / 2]);

    gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo); gl.viewport(0, 0, W, H);
    gl.clearColor(.004, .012, .008, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(sceneP.p);
    const u = sceneP.u;
    gl.uniform3fv(u.uLP, lp); gl.uniform3fv(u.uLC, lc); gl.uniform1i(u.uNL, nl);
    gl.uniform3fv(u.uHP, head); gl.uniform3fv(u.uHD, hd.map(v => v / hl)); gl.uniform1f(u.uHI, 9);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);

    for (const mirror of [true, false]) {
      setCommon(vp, mirror ? [eye[0], -eye[1], eye[2]] : eye, mirror);
      if (mirror) gl.uniform3fv(u.uHP, [head[0], head[1], head[2]]);
      gl.disable(gl.BLEND); gl.depthMask(true);
      if (!mirror) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); drawGroup(tiles, .9, .8); gl.disable(gl.BLEND); }
      drawGroup(world, .35);
      drawBike();
      // translucent / additive
      gl.enable(gl.BLEND); gl.depthMask(false);
      if (!mirror) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); drawGroup(shadow, 0); }
      gl.blendFunc(gl.ONE, gl.ONE);
      drawGroup(beams, 0); drawGroup(fx, 0);
      // headlight cone
      gl.bindVertexArray(CONE.vao); for (let i = 2; i <= 5; i++) gl.disableVertexAttribArray(i);
      gl.vertexAttrib3f(2, 0, 0, 0); gl.vertexAttrib3f(3, 1, 1, 1); gl.vertexAttrib3f(4, 0, 0, 0); gl.vertexAttrib4f(5, .32, .38, .33, 5);
      const cone = M.mul(B, M.mul(M.t(0, .74, .98), M.mul(M.rx(.05), M.s(1.9, 1.0, 16))));
      gl.uniformMatrix4fv(u.uModel, false, cone); gl.uniformMatrix3fv(u.uNM, false, M.nrm(cone)); gl.uniform1f(u.uAlpha, 1);
      gl.drawArrays(gl.TRIANGLES, 0, CONE.n);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }

    // resolve MSAA → texture
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneFbo);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(emptyVAO);
    // bloom
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(brightP.p); gl.bindFramebuffer(gl.FRAMEBUFFER, bA); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex); gl.uniform1i(brightP.u.uT, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(blurP.p); gl.uniform1i(blurP.u.uT, 0);
    for (let i = 0; i < 3; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, bB); gl.bindTexture(gl.TEXTURE_2D, tA); gl.uniform2f(blurP.u.uD, (1 + i) / bw, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bA); gl.bindTexture(gl.TEXTURE_2D, tB); gl.uniform2f(blurP.u.uD, 0, (1 + i) / bh); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.useProgram(compP.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex); gl.uniform1i(compP.u.uS, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tA); gl.uniform1i(compP.u.uB, 1);
    gl.uniform1f(compP.u.uBlur, shot === "terrain" ? 0 : clamp((S.v - 20) / 55, 0, 1) * (shot === "chase" ? 1.4 : .7));
    gl.uniform1f(compP.u.uTime, CAPTURE ? 0 : S.t); gl.uniform1f(compP.u.uExposure, 1.15);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  // ───────────────────────────── HUD ─────────────────────────────
  const speedo = document.getElementById("speedo"), sctx = speedo?.getContext("2d");
  const mini = document.getElementById("minimap"), mctx = mini?.getContext("2d");
  function drawSpeedo() {
    if (!sctx) return;
    const w = speedo.width, cx = w / 2, cy = w / 2, r = w * .42, kmh = S.v * 3.6, max = 320;
    sctx.clearRect(0, 0, w, w);
    const a0 = Math.PI * .75, a1 = Math.PI * 2.25, a = a0 + (a1 - a0) * Math.min(1, kmh / max);
    sctx.fillStyle = "rgba(8,12,9,.82)"; sctx.beginPath(); sctx.arc(cx, cy, r + 16, 0, 7); sctx.fill();
    sctx.lineWidth = 10; sctx.strokeStyle = "rgba(242,255,244,.08)"; sctx.beginPath(); sctx.arc(cx, cy, r, a0, a1); sctx.stroke();
    const grad = sctx.createLinearGradient(0, w, w, 0); grad.addColorStop(0, "#00C853"); grad.addColorStop(.7, "#39FF14"); grad.addColorStop(1, "#A3FF12");
    sctx.strokeStyle = grad; sctx.shadowColor = "#39FF14"; sctx.shadowBlur = 16; sctx.beginPath(); sctx.arc(cx, cy, r, a0, a); sctx.stroke(); sctx.shadowBlur = 0;
    sctx.fillStyle = "#8FA295"; sctx.font = `${w * .045}px JetBrains Mono, monospace`; sctx.textAlign = "center";
    for (let i = 0; i <= 8; i++) { const ang = a0 + (a1 - a0) * i / 8, rr = r - 22;
      sctx.fillText(String(i * 40), cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr + 4);
      sctx.fillRect(cx + Math.cos(ang) * (r + 8) - 1, cy + Math.sin(ang) * (r + 8) - 1, 2, 2); }
    sctx.strokeStyle = "#F2FFF4"; sctx.lineWidth = 3; sctx.beginPath(); sctx.moveTo(cx, cy); sctx.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); sctx.stroke();
    sctx.fillStyle = "#F2FFF4"; sctx.font = `800 ${w * .17}px Sora, Inter, sans-serif`; sctx.fillText(Math.round(kmh), cx, cy + w * .2);
    sctx.fillStyle = "#00E676"; sctx.font = `${w * .05}px JetBrains Mono, monospace`; sctx.fillText("KM/H", cx, cy + w * .29);
  }
  function drawMini() {
    if (!mctx) return;
    const cw = mini.width / WEEKS, ch = (mini.height - 14) / 7;
    mctx.clearRect(0, 0, mini.width, mini.height);
    const pal = ["#151c17", "#0b5d2d", "#00a046", "#00E676", "#A3FF12"];
    for (let w = 0; w < WEEKS; w++) for (let d = 0; d < 7; d++) {
      const c = cells[w][d]; if (!c.valid) continue;
      mctx.fillStyle = pal[level(c.count)];
      mctx.globalAlpha = c.collected ? .35 : 1;
      mctx.fillRect(w * cw + 1, 12 + d * ch + 1, cw - 2, ch - 2);
    }
    mctx.globalAlpha = 1; mctx.fillStyle = "#8FA295"; mctx.font = "9px JetBrains Mono, monospace";
    for (const g of gates) mctx.fillText(g.label.slice(0, 3), g.z / TL * cw, 9);
    const bx = S.z / TL * cw, by = 12 + (3 - S.x / TW + .5) * ch;
    mctx.fillStyle = "#F2FFF4"; mctx.shadowColor = "#39FF14"; mctx.shadowBlur = 10; mctx.beginPath(); mctx.arc(bx, by, 4, 0, 7); mctx.fill(); mctx.shadowBlur = 0;
  }
  function updateHud() {
    if (S.mode !== "play") return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("h-score", Math.round(S.score).toLocaleString());
    set("h-dist", `${Math.max(0, Math.round(S.dist)).toLocaleString()} m`);
    set("h-time", Math.max(0, S.t - 3.2).toFixed(2));
    set("h-cp", `${S.cps} / ${gates.length}`);
    set("h-col", `${S.collected} / ${totalCommits}`);
    const c = cellAt(S.x, S.z);
    set("h-date", c && c.valid ? `${fmt(c.date)} · ${c.count} contribution${c.count === 1 ? "" : "s"}` : "—");
    drawSpeedo(); drawMini();
  }

  // ───────────────────────────── profile panels (real data) ─────────────────────────────
  (function fillProfile() {
    const u = DATA.user, set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const active = DATA.counts.filter(n => n > 0).length;
    set("m-contrib", u.contributions_last_year); set("m-days", active); set("m-repos", u.public_repos);
    let longest = 0, run = 0; for (const n of DATA.counts) { run = n ? run + 1 : 0; longest = Math.max(longest, run); }
    let cur = 0; for (let i = DATA.counts.length - 1 - (DATA.counts[DATA.counts.length - 1] ? 0 : 1); i >= 0 && DATA.counts[i]; i--) cur++;
    const g = document.getElementById("gauges");
    const items = [["PUBLIC REPOS", u.public_repos, 20], ["STARS EARNED", u.stars_received, 20], ["FOLLOWERS", u.followers, 20],
      ["CONTRIBUTIONS", u.contributions_last_year, 400], ["COMMITS", u.total_commits_last_year ?? "—", 400],
      ["LONGEST STREAK", longest + "d", 30], ["CURRENT STREAK", cur + "d", 30]];
    if (g) g.innerHTML = items.map(([lab, val, max]) => {
      const f = typeof val === "number" ? Math.min(1, val / max) : parseInt(val) ? Math.min(1, parseInt(val) / max) : 0;
      const a0 = Math.PI, a = a0 + Math.PI * f, x = 60 + 46 * Math.cos(a), y = 70 + 46 * Math.sin(a);
      return `<div class="gauge"><svg viewBox="0 0 120 84" aria-hidden="true"><path d="M14 70 A46 46 0 0 1 106 70" fill="none" stroke="rgba(242,255,244,.1)" stroke-width="8" stroke-linecap="round"/>
        <path d="M14 70 A46 46 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="#00E676" stroke-width="8" stroke-linecap="round" style="filter:drop-shadow(0 0 6px #39FF14)"/></svg>
        <b>${val}</b><span>${lab}</span></div>`;
    }).join("");
    const langs = {}; for (const r of DATA.repos) if (!r.fork && r.language) langs[r.language] = (langs[r.language] || 0) + 1;
    const lb = DATA.language_bytes && Object.keys(DATA.language_bytes).length ? DATA.language_bytes : langs;
    const tot = Object.values(lb).reduce((a, b) => a + b, 0) || 1, shades = ["#00E676", "#A3FF12", "#00C853", "#39FF14", "#0b8a43"];
    const ent = Object.entries(lb).sort((a, b) => b[1] - a[1]);
    const L = document.getElementById("langs");
    if (L) { L.innerHTML = ent.map(([k, v], i) => `<div title="${k}" style="width:${100 * v / tot}%;background:${shades[i % 5]}"></div>`).join("");
      L.insertAdjacentHTML("afterend", `<p class="langs-legend">${ent.map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join(" · ")} — ${DATA.language_bytes ? "by bytes" : "by primary language of original repos"}</p>`); }
    set("source", `Source: GitHub API · as of ${DATA.captured_at} · regenerated by scripts/generate-contributions.py`);
    const recent = DATA.repos.filter(r => !r.fork).sort((a, b) => b.pushed_at.localeCompare(a.pushed_at)).slice(0, 2).map(r => r.name);
    set("recent", `Latest pushes: ${recent.join(" and ")}.`);
  })();

  // ───────────────────────────── loop & controls ─────────────────────────────
  const KEYMAP = { KeyW: "w", ArrowUp: "w", KeyS: "s", ArrowDown: "s", KeyA: "a", ArrowLeft: "a", KeyD: "d", ArrowRight: "d" };
  addEventListener("keydown", e => {
    if (S.mode !== "play") return;
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
    if (e.code === "KeyR") startGame();
    if (e.code === "Escape") exitGame();
  });
  addEventListener("keyup", e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
  // touch: left/right halves steer, hold anywhere for throttle
  addEventListener("touchstart", e => touch(e), { passive: false }); addEventListener("touchmove", e => touch(e), { passive: false });
  addEventListener("touchend", () => { keys.w = keys.a = keys.d = false; });
  function touch(e) { if (S.mode !== "play") return; e.preventDefault(); const t = e.touches[0]; keys.w = true; keys.a = t.clientX < innerWidth * .35; keys.d = t.clientX > innerWidth * .65; }

  function startGame() {
    window.scrollTo({ top: 0 });
    document.body.classList.add("playing");
    document.getElementById("hud").hidden = false; document.getElementById("results").hidden = true;
    for (const k in keys) keys[k] = false;
    reset("play");
  }
  function exitGame() {
    document.body.classList.remove("playing"); document.getElementById("hud").hidden = true; reset("attract");
  }
  document.getElementById("play")?.addEventListener("click", startGame);
  document.getElementById("restart")?.addEventListener("click", startGame);
  document.getElementById("again")?.addEventListener("click", startGame);
  document.getElementById("exit")?.addEventListener("click", exitGame);
  addEventListener("scroll", () => document.body.classList.toggle("scrolled", scrollY > innerHeight * .6), { passive: true });
  addEventListener("resize", () => resize());

  reset("attract");
  resize();
  const shotNow = () => SHOT || (S.mode === "play" ? "chase" : attractShot());
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    step(dt); cameraFor(dt, shotNow()); render(shotNow()); updateHud();
    requestAnimationFrame(frame);
  }

  // capture API for deterministic renders (used by scripts/capture.mjs)
  window.MOTOVERSE = {
    resize: (w, h) => resize(w, h),
    setup(opts = {}) { reset(opts.mode || "attract"); S.demo = !!opts.demo; if (opts.cd != null) S.cd = opts.cd; if (opts.z != null) S.z = opts.z; if (opts.x != null) S.x = opts.x; if (opts.v != null) S.v = opts.v; if (opts.lean != null) S.lean = opts.lean; S.t = opts.t || 0;
      for (const g of gates) if (g.z < S.z) g.passed = true; for (const o of obstacles) if (o.z < S.z) o.hit = true; },
    advance(dt, shot, n = 1, steer = null, opts_png = true) {
      for (let i = 0; i < n; i++) { if (steer !== null) S.lean = steer; step(dt); cameraFor(dt, shot); }
      render(shot); updateHud(); return opts_png ? canvas.toDataURL("image/png") : null;
    },
    state: () => ({ ...S, trail: undefined }),
    hard: v => (CAPTURE_HARD = v),
    key: v => (KEY_I = v),
    TRACK_LEN, TL, TW, WEEKS, laneX,
  };
  if (!CAPTURE) requestAnimationFrame(frame);
})();
