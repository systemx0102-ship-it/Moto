// Speed sensation, nitro and impact spectacle around the player's bike:
// camera-relative wind streaks, nitro shockwave / flash / plasma aura /
// afterimages, slipstream air tunnel, landing rings + camera bounce, the
// top-speed vapor cone with a light sweep and the overtake light streak.
// Everything is pooled, allocation-free per frame and scaled by quality.
import * as THREE from 'three';
import { flareTexture, softCircleTexture } from '../core/textures.js';
import { clamp, damp } from '../core/utils.js';

const KMH = 1 / 3.6;
const DEG = Math.PI / 180;
const HIST = 48; // afterimage pose history (frames)
const DUST = {
  sand: [0.8, 0.62, 0.44], snow: [0.95, 0.97, 1.0], grass: [0.55, 0.5, 0.4], gravel: [0.72, 0.7, 0.66],
  concrete: [0.66, 0.66, 0.68], dryGrass: [0.68, 0.6, 0.46], forest: [0.45, 0.4, 0.32], asphaltDark: [0.5, 0.5, 0.52],
};

const OUT = /* glsl */`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
const NOISE = /* glsl */`
  float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h13(i), h13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h13(i + vec3(0.0, 1.0, 0.0)), h13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(h13(i + vec3(0.0, 0.0, 1.0)), h13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h13(i + vec3(0.0, 1.0, 1.0)), h13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }`;

// Camera-space wind streaks: thin ribbons on a cylinder around the travel axis,
// flowing past the camera at the bike's speed and stretched by motion blur.
const StreakShader = {
  vertexShader: /* glsl */`
    attribute vec4 aSeed; // angle, radius, phase, variety
    uniform vec3 uF, uU, uR, uTail;
    uniform float uTravel, uLen, uAlpha, uPix, uFar, uNear, uRmin, uRmax, uW, uAspect, uOn;
    varying float vA; varying vec2 vC;
    void main() {
      // mostly on both sides near camera height, few overhead, none in the ground
      float sx = fract(aSeed.x * 2.0);
      float ang = mix(-0.5, 0.95, sx * sx);
      if (aSeed.x > 0.5) ang = 3.14159 - ang;
      float r = mix(uRmin, uRmax, aSeed.y);
      float range = uFar + uNear;
      float s = uFar - mod(aSeed.z * range + uTravel * (0.85 + 0.3 * aSeed.w), range);
      vec3 head = uF * s + (uR * cos(ang) + uU * sin(ang)) * r;
      float len = uLen * (0.5 + aSeed.w);
      vec3 p = head + uTail * (position.y * len);
      float w = uW * (0.7 + 0.6 * fract(aSeed.w * 7.31));
      float we = max(w, max(0.05, -p.z) * uPix * 1.4); // never thinner than ~1.4 px (no shimmer)
      p += normalize(cross(uTail, p)) * (position.x * we * 0.5);
      float a = uAlpha * uOn * (w / we) * smoothstep(uFar, uFar * 0.4, s) * smoothstep(-uNear, 2.0, s);
      vec4 hc = projectionMatrix * vec4(head, 1.0);
      vec2 nd = hc.xy / max(0.05, hc.w);
      a *= smoothstep(0.45, 1.15, length(nd * vec2(uAspect, 1.0))); // keep the bike clear
      a *= 0.35 + 0.65 * fract(aSeed.w * 13.7);
      vA = a; vC = position.xy;
      gl_Position = projectionMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColor;
    varying float vA; varying vec2 vC;
    void main() {
      float e = 1.0 - vC.x * vC.x;
      float l = pow(1.0 - vC.y, 1.6) * smoothstep(0.0, 0.05, vC.y);
      gl_FragColor = vec4(uColor, vA * e * e * l);
      ${OUT}
    }`,
};

// Slipstream air tunnel: lines spiralling from the leading bike toward the camera.
const SlipShader = {
  vertexShader: /* glsl */`
    attribute vec4 aSeed;
    uniform vec3 uA, uAx, uU, uV;
    uniform float uL, uFlow, uR0, uR1, uAlpha, uSeg, uW, uPix;
    varying float vA; varying vec2 vC;
    void main() {
      float t = fract(aSeed.z + uFlow * (0.75 + 0.5 * aSeed.w));
      float ang = aSeed.x * 6.2831853 + t * (aSeed.w - 0.5) * 2.5;
      float rad = mix(uR0, uR1, t * t) * (0.55 + 0.45 * aSeed.y);
      vec3 c = uA + uAx * (t * uL) + (uU * cos(ang) + uV * sin(ang)) * rad;
      vec3 p = c - uAx * (position.y * uSeg * (0.6 + 0.8 * aSeed.w));
      vec3 toCam = cameraPosition - p;
      float we = max(uW, length(toCam) * uPix * 1.4);
      p += normalize(cross(uAx, toCam)) * (position.x * we * 0.5);
      vA = uAlpha * (uW / we) * sin(3.14159 * t) * (0.45 + 0.55 * aSeed.y);
      vC = position.xy;
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: StreakShader.fragmentShader,
};

// Expanding energy ring (shockwaves, landing air ring, top-speed shock collar).
const RingShader = {
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColA, uColB;
    uniform float uAlpha, uWidth, uFill, uTime, uSeed, uBreak, uArc;
    varying vec2 vUv;
    void main() {
      vec2 q = vUv * 2.0 - 1.0;
      float d = length(q);
      float x = (d - 0.8) / uWidth;
      float ring = exp(-x * x);
      float an = atan(q.y, q.x);
      float br = mix(1.0, 0.55 + 0.45 * sin(an * 9.0 + uSeed) * sin(an * 5.0 - uTime * 6.0 + uSeed * 1.7), uBreak);
      float fill = uFill * smoothstep(0.8, 0.25, d) * smoothstep(0.05, 0.6, d);
      float a = (ring * br + fill) * uAlpha * smoothstep(1.0, 0.94, d) * mix(1.0, smoothstep(-0.6, 0.2, q.y), uArc);
      gl_FragColor = vec4(mix(uColB, uColA, smoothstep(-1.5, 1.5, x)), a);
      ${OUT}
    }`,
};

// Silhouette mask: the bike proxy at its current pose (R) and up to three past
// poses (G, B, A), max-blended into a half-resolution target.
const MaskShader = {
  vertexShader: /* glsl */`
    attribute vec4 aCh;
    varying vec4 vC;
    void main() { vC = aCh; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    varying vec4 vC;
    void main() { gl_FragColor = vC; }`,
};

// Composite over the bike's screen rectangle: plasma glow hugging the outline,
// afterimage silhouettes (never over the bike itself) and the light sweep.
const GlowShader = {
  vertexShader: /* glsl */`
    uniform vec4 uRect;
    varying vec2 vUv, vL;
    void main() {
      vL = position.xy;
      vec2 p = mix(uRect.xy, uRect.zw, position.xy);
      vUv = p * 0.5 + 0.5;
      gl_Position = vec4(p, 0.0, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tMask;
    uniform vec2 uTexel, uRes;
    uniform float uAura, uFlick, uTime, uSweep, uSweepAmt, uOn;
    uniform vec3 uEcho, uAuraA, uAuraB, uEchoA, uEchoB, uSweepCol;
    varying vec2 vUv, vL;
    ${NOISE}
    void main() {
      vec4 c = texture2D(tMask, vUv);
      vec4 b1 = vec4(0.0), b2 = vec4(0.0);
      for (int i = 0; i < 6; i++) {
        float a = float(i) * 1.0472;
        vec2 o = vec2(cos(a), sin(a)) * uTexel;
        b1 += texture2D(tMask, vUv + o * 2.0);
        b2 += texture2D(tMask, vUv + vec2(o.x * 0.866 - o.y * 0.5, o.x * 0.5 + o.y * 0.866) * 5.5);
      }
      b1 /= 6.0; b2 /= 6.0;
      float out1 = 1.0 - c.r;
      vec3 col = vec3(0.0);
      if (uAura > 0.001) {
        // flickering plasma: tendrils flowing away from the outline
        vec2 sp = vUv * uRes / 14.0;
        float n = vnoise(vec3(sp, uTime * 5.0));
        float n2 = vnoise(vec3(sp * 2.3 + vec2(uTime * 3.0, 0.0), uTime * 9.0));
        float tend = smoothstep(0.35, 0.9, n * 0.6 + n2 * 0.55);
        float rim = b1.r * out1;
        float halo = b2.r * out1;
        float g = rim * (0.9 + 0.8 * tend) + halo * (0.25 + 1.1 * tend);
        col += mix(uAuraA, uAuraB, n2) * (g * uAura * uFlick);
      }
      // afterimages: soft fill + brighter edge, hidden where the bike is
      vec3 e = (c.gba * 0.35 + b1.gba * 0.65) * uEcho;
      vec3 ed = clamp(b1.gba - c.gba * 0.7, 0.0, 1.0) * uEcho;
      float hide = 1.0 - max(c.r, b1.r * 0.85);
      col += (uEchoA * (e.x * 0.5 + ed.x) + mix(uEchoA, uEchoB, 0.5) * (e.y * 0.5 + ed.y) + uEchoB * (e.z * 0.5 + ed.z)) * hide;
      // light sweep across the bodywork
      if (uSweepAmt > 0.001) {
        float x = (vL.x * 0.75 + vL.y * 0.65) - uSweep;
        col += uSweepCol * (c.r * exp(-x * x / 0.006) * uSweepAmt);
      }
      gl_FragColor = vec4(col * uOn, 1.0);
      ${OUT}
    }`,
};

// Top-speed vapor cone: misty bell around the bike, open toward the rear.
const VaporShader = {
  vertexShader: /* glsl */`
    uniform float uR0, uR1, uLen, uGrow;
    varying float vT; varying vec3 vN, vW; varying vec2 vD;
    void main() {
      float t = 0.5 - position.y; // 0 = front lip, 1 = trailing end
      vec2 d = normalize(position.xz);
      float rad = mix(uR0, uR1, pow(t, 0.6)) * uGrow;
      vec4 w = modelMatrix * vec4(d.x * rad, -t * uLen, d.y * rad, 1.0);
      vN = mat3(modelMatrix) * normalize(vec3(d.x, (uR1 - uR0) / uLen, d.y));
      vW = w.xyz; vT = t; vD = d;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    uniform float uAlpha, uTime;
    uniform vec3 uMist;
    varying float vT; varying vec3 vN, vW; varying vec2 vD;
    ${NOISE}
    void main() {
      vec3 V = normalize(cameraPosition - vW);
      float fr = 1.0 - abs(dot(normalize(vN), V));
      float n = vnoise(vec3(vD * 3.0, vT * 4.0 - uTime * 9.0));
      float st = vnoise(vec3(vD * 11.0, vT * 1.5 - uTime * 4.0));
      float prof = smoothstep(0.0, 0.12, vT) * pow(1.0 - vT, 1.4);
      float a = uAlpha * prof * (0.2 + 0.8 * fr * fr) * (0.35 + 0.65 * n) * (0.55 + 0.7 * st);
      gl_FragColor = vec4(uMist, clamp(a, 0.0, 1.0));
      ${OUT}
    }`,
};

// Screen overlay: nitro burst rays, overtake light streaks, top-speed sweep.
const OverlayShader = {
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform float uBurst, uOver, uSweep, uAspect, uTime, uOn;
    uniform vec2 uCenter;
    uniform vec3 uBurstCol, uOverCol, uSweepCol;
    varying vec2 vUv;
    float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
    float streak(float y0, float w, float sp, float p, float ax) {
      float dy = (vUv.y - y0) / w;
      float head = 0.04 + p * sp, tail = head * 0.25;
      return exp(-dy * dy) * smoothstep(tail, head, ax) * smoothstep(head + 0.015, head, ax);
    }
    void main() {
      vec3 col = vec3(0.0);
      vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
      float r = length(d);
      if (uBurst > 0.001) {
        float k = atan(d.y, d.x) * 11.459; // 72 rays
        float id = floor(k);
        float ray = smoothstep(0.5, 0.0, abs(fract(k) - 0.5) * (1.2 + 2.5 * h1(id))) * step(0.35, h1(id + 3.1));
        float reach = 0.25 + (1.0 - uBurst) * 1.1; // rays race outward
        float m = ray * smoothstep(0.35, 0.8, r) * smoothstep(reach, reach - 0.35, r) * 0.22 + smoothstep(0.6, 1.3, r) * 0.4;
        col += uBurstCol * (m * uBurst);
      }
      if (uOver > 0.0 && uOver < 1.0) {
        float ax = abs(vUv.x - 0.5) * uAspect;
        float f = pow(1.0 - uOver, 1.5);
        float s = streak(0.38, 0.0035, 1.1, uOver, ax) + streak(0.47, 0.006, 1.5, uOver, ax) * 0.8
                + streak(0.555, 0.0028, 1.3, uOver, ax) + streak(0.64, 0.0045, 0.9, uOver, ax) * 0.7;
        col += uOverCol * (s * f + exp(-pow((vUv.y - 0.5) / 0.08, 2.0)) * f * 0.05);
      }
      if (uSweep > 0.0 && uSweep < 1.0) {
        float x = (vUv.x * uAspect + vUv.y * 0.45) - (uSweep * 1.8 - 0.2) * uAspect;
        col += uSweepCol * (exp(-x * x / 0.03) * sin(uSweep * 3.14159) * 0.16);
      }
      gl_FragColor = vec4(col * uOn, 1.0);
      ${OUT}
    }`,
};

function lineGeometry(n) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  const s = new Float32Array(n * 4);
  for (let i = 0; i < s.length; i++) s[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(s, 4));
  g.instanceCount = n;
  return g;
}

// One merged position/normal copy of the bike in bike space (built once).
function proxyGeometry(model) {
  const inner = model.ctx.A.inner;
  model.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(inner.matrixWorld).invert();
  const parts = [];
  let nv = 0, ni = 0;
  inner.traverse((o) => {
    const g = o.isMesh && o.geometry;
    if (!g || !g.attributes.position || !g.attributes.normal || o.material?.visible === false) return;
    parts.push({ g, m: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  });
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let vo = 0, io = 0;
  for (const { g, m } of parts) {
    const P = g.attributes.position, N = g.attributes.normal;
    nm.getNormalMatrix(m);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
    else for (let i = 0; i < P.count; i++) idx[io + i] = vo + i;
    io += g.index ? g.index.count : P.count;
    vo += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

const fxMaterial = (shader, uniforms, opts = {}) => new THREE.ShaderMaterial({
  uniforms, vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...opts,
});

export class SpeedFX {
  constructor(scene, quality, race) {
    this.scene = scene;
    this.race = race;
    this.q = quality;
    this.tier = !quality.post ? 0 : quality.density >= 1.3 ? 3 : quality.density >= 1 ? 2 : 1;
    this.renderer = race.game.engine.renderer;
    this.mainCam = race.game.engine.camera;
    this.time = 0;
    this.objects = [];
    const T = race.ts.env.T, W = race.ts.env.W;
    this.T = T; this.W = W;
    // exposure compensation so additive light reads the same at any time of day
    this.expK = 0.5 / (T.exposure || 0.5);
    // scratch
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._fwd = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0); this._q = new THREE.Quaternion();
    this._Y = new THREE.Vector3(0, 1, 0); this._Z = new THREE.Vector3(0, 0, 1);
    this._c = new THREE.Color();
    // state
    this._sI = 0; this._travel = 0; this._surge = 0;
    this._nitroWas = false; this._nitroOff = 9; this._burst = 0; this._auraI = 0; this._ghostI = 0;
    this._wasAir = false; this._airVy = 0;
    this._gear = race.player.phys.gear;
    this._topArmed = true; this._pos = -1;
    this._slipI = 0; this._slipFlow = 0; this._leader = null;
    this._flashT = 9; this._vaporT = 9; this._sweepT = 9; this._overT = 9; this._sSweepT = 9;
    this._aiNitro = new Uint8Array(64);
    this._pix = 0.001;
    this.inner = race.player.model.ctx.A.inner;
    this._buildStreaks();
    this._buildSlip();
    this._buildRings();
    this._buildSprites();
    this._buildVapor();
    this._buildOverlay();
    if (this.tier > 0) this._buildShell();
    // everything stays visible until the first update so the race warm-up compiles it
    this._primed = false;
  }

  _add(o, order) {
    o.frustumCulled = false;
    o.renderOrder = order;
    this.scene.add(o);
    this.objects.push(o);
    return o;
  }

  // ------------------------------------------------------------------ builders
  _buildStreaks() {
    const W = this.W, T = this.T;
    const wet = !!W.rain, snow = !!W.snow;
    const n = Math.round([70, 150, 210, 280][this.tier] * (wet ? 1.5 : snow ? 1.4 : 1));
    // tint by time of day / weather
    const col = T.night ? [0.55, 0.78, 1.0] : T.sunElev < 10 && !T.overcast ? [1.0, 0.86, 0.72] : T.overcast ? [0.72, 0.82, 1.0] : [0.86, 0.93, 1.0];
    if (wet) col.splice(0, 3, 0.72, 0.8, 0.88);
    if (snow) col.splice(0, 3, 0.95, 0.97, 1.0);
    this.sBase = (T.night ? 1.1 : 1.6) * (wet ? 1.1 : 1) * this.expK * 2;
    this.sCol = new THREE.Color(...col);
    this.sLen = wet ? 1.35 : snow ? 0.55 : 1;
    this.sTilt = wet ? 0.16 : snow ? 0.3 : 0;
    this.sV0 = (wet || snow ? 115 : 140) * KMH;
    this.streak = this._add(new THREE.Mesh(lineGeometry(n), fxMaterial(StreakShader, {
      uF: { value: new THREE.Vector3(0, 0, -1) }, uU: { value: new THREE.Vector3(0, 1, 0) }, uR: { value: new THREE.Vector3(1, 0, 0) },
      uTail: { value: new THREE.Vector3(0, 0, -1) }, uTravel: { value: 0 }, uLen: { value: 2 }, uAlpha: { value: 0 }, uPix: { value: 0.001 },
      uFar: { value: 40 }, uNear: { value: 3 }, uRmin: { value: 1.7 }, uRmax: { value: snow ? 6 : 7 }, uW: { value: wet ? 0.02 : snow ? 0.035 : 0.018 },
      uAspect: { value: 1.7 }, uOn: { value: 1 }, uColor: { value: this.sCol.clone() },
    }, { side: THREE.DoubleSide })), 7);
    this.streak.onBeforeRender = (r, s, cam) => { this.streak.material.uniforms.uOn.value = cam === this.mainCam ? 1 : 0; };
  }

  _buildSlip() {
    const n = this.tier ? 44 : 24;
    this.slip = this._add(new THREE.Mesh(lineGeometry(n), fxMaterial(SlipShader, {
      uA: { value: new THREE.Vector3() }, uAx: { value: new THREE.Vector3(0, 0, 1) }, uU: { value: new THREE.Vector3(0, 1, 0) }, uV: { value: new THREE.Vector3(1, 0, 0) },
      uL: { value: 10 }, uFlow: { value: 0 }, uR0: { value: 0.3 }, uR1: { value: 1.3 }, uAlpha: { value: 0 }, uSeg: { value: 2.2 }, uW: { value: 0.012 }, uPix: { value: 0.001 },
      uColor: { value: new THREE.Color(0.75, 0.9, 1.0).multiplyScalar(this.T.night ? 1.0 : 0.8) },
    }, { side: THREE.DoubleSide })), 7);
  }

  _buildRings() {
    this.rings = [];
    const geo = new THREE.PlaneGeometry(2, 2);
    this.ringGeo = geo;
    const base = fxMaterial(RingShader, {
      uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, uAlpha: { value: 0 }, uWidth: { value: 0.05 },
      uFill: { value: 0 }, uTime: { value: 0 }, uSeed: { value: 0 }, uBreak: { value: 0.5 }, uArc: { value: 0 },
    }, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (let i = 0; i < 8; i++) {
      const mat = i ? base.clone() : base;
      const mesh = this._add(new THREE.Mesh(geo, mat), 6);
      this.rings.push({ mesh, u: mat.uniforms, t: 9, life: 1, r0: 0, r1: 1, a: 0, ox: 0, oy: 0, flat: false, follow: null, x: 0, y: 0, z: 0 });
    }
  }

  _buildSprites() {
    const mk = (tex) => {
      const m = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
      return this._add(new THREE.Sprite(m), 8);
    };
    this.flashCore = mk(flareTexture('glow'));
    this.flashStreak = mk(softCircleTexture());
    this.halo = mk(softCircleTexture()); // cheap nitro aura (all tiers, main one on 'bajo')
  }

  _buildVapor() {
    const g = new THREE.CylinderGeometry(1, 1, 1, this.tier ? 40 : 24, this.tier ? 10 : 6, true);
    const mist = this.T.night ? [0.42, 0.52, 0.72] : this.T.sunElev < 10 && !this.T.overcast ? [1.0, 0.88, 0.78] : [0.95, 0.97, 1.0];
    this.vapor = this._add(new THREE.Mesh(g, fxMaterial(VaporShader, {
      uR0: { value: 0.5 }, uR1: { value: 1.35 }, uLen: { value: 2.4 }, uGrow: { value: 1 }, uAlpha: { value: 0 }, uTime: { value: 0 },
      uMist: { value: new THREE.Color(...mist) },
    }, { blending: THREE.NormalBlending, side: THREE.DoubleSide })), 6);
  }

  _buildOverlay() {
    this.overlay = this._add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fxMaterial(OverlayShader, {
      uBurst: { value: 0 }, uOver: { value: 0 }, uSweep: { value: 0 }, uAspect: { value: 1.7 }, uTime: { value: 0 }, uOn: { value: 1 },
      uCenter: { value: new THREE.Vector2(0.5, 0.45) },
      uBurstCol: { value: new THREE.Color(0.35, 0.55, 1.0).multiplyScalar(0.55 * this.expK * 2) },
      uOverCol: { value: new THREE.Color(1, 1, 1) },
      uSweepCol: { value: new THREE.Color(1.0, 0.95, 0.85).multiplyScalar(this.expK * 2) },
    }, { depthTest: false })), 999);
    this.overlay.onBeforeRender = (r, s, cam) => { this.overlay.material.uniforms.uOn.value = cam === this.mainCam ? 1 : 0; };
  }

  _buildShell() {
    const P = this.race.player;
    this.ghostN = [0, 2, 3, 3][this.tier];
    const n = this.ghostN + 1;
    // mask pass: own tiny scene, rendered into a half-res target before the frame
    const geo = proxyGeometry(P.model);
    const ch = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) ch[k * 4 + k] = 1;
    geo.setAttribute('aCh', new THREE.InstancedBufferAttribute(ch, 4));
    this.maskScene = new THREE.Scene();
    this.maskScene.matrixWorldAutoUpdate = false;
    this.mask = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
      vertexShader: MaskShader.vertexShader, fragmentShader: MaskShader.fragmentShader, side: THREE.DoubleSide,
      depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation,
    }), n);
    this.mask.frustumCulled = false;
    this.maskScene.add(this.mask);
    this.maskRT = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, type: THREE.UnsignedByteType });
    this._rtSize = new THREE.Vector2();
    this._cc = new THREE.Color();
    const k = this.expK * 2;
    this.glow = this._add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), fxMaterial(GlowShader, {
      tMask: { value: this.maskRT.texture }, uTexel: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2() }, uRect: { value: new THREE.Vector4(-1, -1, 1, 1) },
      uAura: { value: 0 }, uFlick: { value: 1 }, uTime: { value: 0 }, uSweep: { value: 0 }, uSweepAmt: { value: 0 }, uOn: { value: 1 },
      uEcho: { value: new THREE.Vector3() },
      uAuraA: { value: new THREE.Color(0.3, 0.6, 1.8).multiplyScalar(k) }, uAuraB: { value: new THREE.Color(0.9, 0.4, 1.9).multiplyScalar(k) },
      uEchoA: { value: new THREE.Color(0.5, 0.85, 1.5).multiplyScalar(k * 0.7) }, uEchoB: { value: new THREE.Color(0.65, 0.35, 1.5).multiplyScalar(k * 0.7) },
      uSweepCol: { value: new THREE.Color(1.5, 1.4, 1.2).multiplyScalar(k) },
    }, { depthTest: false })), 990);
    this.glow.onBeforeRender = (r, s, cam) => { this.glow.material.uniforms.uOn.value = cam === this.mainCam ? 1 : 0; };
    const b = P.model.bounds;
    this.box = [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z];
    this.hist = new Float32Array(HIST * 16);
    this.hOdo = new Float64Array(HIST);
    this.hN = 0; this.hHead = 0; this.odo = 0;
  }

  // screen rectangle (NDC) around the bike's bounds, grown for glow and echoes
  _screenRect(camera, e, out) {
    const B = this.box, v = this._v;
    let x0 = 2, y0 = 2, x1 = -2, y1 = -2;
    for (let i = 0; i < 8; i++) {
      v.set(B[i & 1], B[2 + ((i >> 1) & 1)], B[4 + ((i >> 2) & 1)]);
      v.set(e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12], e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13], e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]);
      v.applyMatrix4(camera.matrixWorldInverse);
      if (v.z > -0.2) return out.set(-1, -1, 1, 1); // straddles the camera: whole screen
      v.applyMatrix4(camera.projectionMatrix);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    const mx = (x1 - x0) * 0.6 + 0.06, my = (y1 - y0) * 0.6 + 0.06;
    return out.set(clamp(x0 - mx, -1, 1), clamp(y0 - my, -1, 1), clamp(x1 + mx, -1, 1), clamp(y1 + my, -1, 1));
  }

  _renderMask(camera) {
    const r = this.renderer;
    r.getDrawingBufferSize(this._rtSize);
    const w = Math.max(4, Math.round(this._rtSize.x / 2)), h = Math.max(4, Math.round(this._rtSize.y / 2));
    if (this.maskRT.width !== w || this.maskRT.height !== h) this.maskRT.setSize(w, h);
    const u = this.glow.material.uniforms;
    u.uTexel.value.set(1 / w, 1 / h);
    u.uRes.value.set(this._rtSize.x, this._rtSize.y);
    const prev = r.getRenderTarget(), ca = r.getClearAlpha();
    r.getClearColor(this._cc);
    r.setRenderTarget(this.maskRT);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.render(this.maskScene, camera);
    r.setRenderTarget(prev);
    r.setClearColor(this._cc, ca);
  }

  // ------------------------------------------------------------------ events
  _ring(o) {
    let it = this.rings[0];
    for (const r of this.rings) if (r.t / r.life > it.t / it.life) it = r; // free or oldest
    it.t = 0; it.life = o.life; it.r0 = o.r0; it.r1 = o.r1; it.a = o.a;
    it.ox = o.ox || 0; it.oy = o.oy || 0; it.flat = !!o.flat; it.follow = o.follow || null;
    it.x = o.x || 0; it.y = o.y || 0; it.z = o.z || 0;
    const u = it.u;
    u.uColA.value.setRGB(o.ca[0], o.ca[1], o.ca[2]).multiplyScalar(this.expK * 2);
    u.uColB.value.setRGB(o.cb[0], o.cb[1], o.cb[2]).multiplyScalar(this.expK * 2);
    u.uWidth.value = o.w; u.uFill.value = o.fill || 0; u.uBreak.value = o.brk ?? 0.5; u.uSeed.value = Math.random() * 40;
    u.uArc.value = o.flat ? 0 : 1; // upright rings fade out toward the road
    if (!it.follow) {
      it.mesh.position.set(it.x, it.y + it.oy, it.z);
      it.mesh.quaternion.setFromUnitVectors(this._Z, it.flat ? this._Y : this._v.set(o.dx || 0, 0, o.dz ?? 1));
    }
    it.mesh.visible = true;
    return it;
  }

  _nitroStart(inside) {
    const r = this.race, P = r.player;
    this._burst = 1; this._flashT = 0;
    r.cam.fovPunch(this.tier ? 9 : 7);
    r.cam.kick(0.6);
    const ox = inside ? 4 : -0.25;
    this._ring({ follow: P, ox, oy: 0.75, life: 0.5, r0: 0.5, r1: 3.2, a: 0.75, ca: [0.75, 0.9, 1.6], cb: [0.55, 0.45, 1.5], w: 0.04, fill: 0.1, brk: 0.55 });
    this._ring({ follow: P, ox: ox + 0.5, oy: 0.75, life: 0.32, r0: 0.3, r1: 2.0, a: 0.6, ca: [1.0, 1.0, 1.5], cb: [0.5, 0.6, 1.4], w: 0.03, fill: 0, brk: 0.3 });
    this._ring({ follow: P, flat: true, ox: 0, oy: 0.05, life: 0.6, r0: 0.4, r1: 6, a: 0.5, ca: [0.55, 0.75, 1.5], cb: [0.6, 0.45, 1.4], w: 0.035, fill: 0.06, brk: 0.6 });
  }

  _land(air, impact) {
    const r = this.race, P = r.player, p = P.phys;
    const k = clamp((impact - 1.5) / 9, 0.1, 1) * clamp(air / 0.6, 0.4, 1);
    r.cam.bounce(0.05 + 0.16 * k);
    r.cam.fovPunch(-2.2 * k);
    const d = DUST[r.track.def.runoffMat] || DUST.gravel;
    const g = p.offRoad ? 1 : 0.45; // on tarmac mostly an air ring, dust off-road
    const c = [d[0] * g + 0.78 * (1 - g), d[1] * g + 0.8 * (1 - g), d[2] * g + 0.84 * (1 - g)];
    const ca = [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9], cb = [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5];
    this._ring({ follow: P, flat: true, oy: 0.06, life: 0.6, r0: 0.5, r1: 3.5 + 3.5 * k, a: 0.35 + 0.45 * k, ca, cb, w: 0.09, fill: 0.3, brk: 0.7 });
    this._ring({ follow: P, flat: true, oy: 0.08, life: 0.4, r0: 0.3, r1: 2 + 1.5 * k, a: 0.25 + 0.35 * k, ca, cb, w: 0.06, fill: 0.15, brk: 0.8 });
    const ef = r.effects;
    if (ef && ef.dust) {
      const n = Math.round((6 + 16 * k) * (this.tier ? 1 : 0.5));
      const m = P.model, rear = m.worldPoint([-m.wb / 2, 0.05, 0], this._v);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ef.dust(rear.x, rear.y, rear.z, Math.cos(a) * 30 + Math.sin(p.vh) * p.v * 0.6, Math.sin(a) * 30 + Math.cos(p.vh) * p.v * 0.6, c, 0.5 + 0.6 * k);
      }
    }
  }

  _topSpeed() {
    const r = this.race;
    this._vaporT = 0; this._sweepT = 0; this._sSweepT = 0;
    r.cam.fovPunch(3);
    this._ring({ follow: r.player, ox: 0.55, oy: 0.65, life: 0.6, r0: 0.6, r1: 3, a: 0.9, ca: [1.3, 1.4, 1.6], cb: [0.7, 0.8, 1.1], w: 0.03, fill: 0.08, brk: 0.6 });
  }

  _overtake(other) {
    this._overT = 0;
    const u = this.overlay.material.uniforms.uOverCol.value;
    u.setRGB(1, 1, 1);
    if (other && other.color) { this._c.set(other.color); u.lerp(this._c, 0.3); }
    u.multiplyScalar(this.expK * 1.6);
    this.race.cam.fovPunch(1.5);
  }

  // ------------------------------------------------------------------ frame
  update(dt, camera) {
    const r = this.race, P = r.player, p = P.phys;
    if (!this._primed) { this._primed = true; for (const o of this.objects) o.visible = false; }
    this.time += dt;
    camera.updateMatrixWorld();
    this.inner.updateWorldMatrix(true, false); // bike pose of this frame (worldPoint)
    this._pix = (2 * Math.tan((camera.fov * DEG) / 2)) / Math.max(1, this.renderer.domElement.height);
    const live = (r.phase === 'race' || r.phase === 'finished') && !(r.phase === 'finished' && r.phaseT > 5);
    const mode = r.phase === 'finished' && r.phaseT >= 2.5 ? 4 : r.cam.mode;
    const inside = mode === 2 || mode === 3;
    const fwd = this._fwd.set(Math.sin(p.h), 0, Math.cos(p.h));

    // ---- events from state diffs
    if (p.nitroOn) { if (!this._nitroWas && this._nitroOff > 0.3 && live && !p.crashed) this._nitroStart(inside); this._nitroOff = 0; } else this._nitroOff += dt;
    this._nitroWas = p.nitroOn;
    if (p.airborne) { this._airVy = p.vy; this._wasAir = true; } else if (this._wasAir) {
      this._wasAir = false;
      if (live && !p.crashed && p.airT > 0.25) this._land(p.airT, Math.max(0, (p.proj.grade || 0) * p.v - this._airVy));
    }
    if (p.gear !== this._gear) { if (p.gear > this._gear && p.v > 15 && live) { r.cam.fovPunch(1.2); this._surge = 1; } this._gear = p.gear; }
    const kmh = p.v * 3.6, top = P.spec.topKmh;
    if (kmh >= top * 0.97) { if (this._topArmed && live && !p.crashed) { this._topArmed = false; this._topSpeed(); } } else if (kmh < top * 0.9) this._topArmed = true;
    const pos = r.order.indexOf(P);
    if (this._pos >= 0 && pos < this._pos && r.phase === 'race' && r.time > 3 && r.mode !== 'trial' && r.mode !== 'free') this._overtake(r.order[pos + 1]);
    this._pos = pos;
    this._aiNitroRings(camera, live);

    this._streaks(dt, camera, p, live && mode !== 4 && !p.crashed);
    this._slipstream(dt, p, live && mode !== 4 && !p.crashed);
    this._nitroDressing(dt, camera, p, live && !p.crashed, inside);
    this._updateRings(dt);
    this._updateVapor(dt, p, fwd, inside);
    this._updateOverlay(dt, camera, p);
  }

  _aiNitroRings(camera, live) {
    // rivals lighting their nitro close to the camera get a smaller shockwave
    const cp = camera.position;
    for (const b of this.race.bikes) {
      if (b.isPlayer || b.id >= 64) continue;
      const q = b.phys, on = q.nitroOn ? 1 : 0;
      if (on && !this._aiNitro[b.id] && live && (q.x - cp.x) ** 2 + (q.z - cp.z) ** 2 < 45 * 45) {
        this._ring({ follow: b, ox: -0.3, oy: 0.7, life: 0.45, r0: 0.4, r1: 3.6, a: 0.9, ca: [0.45, 0.8, 1.6], cb: [0.8, 0.4, 1.7], w: 0.05, fill: 0.15, brk: 0.5 });
      }
      this._aiNitro[b.id] = on;
    }
  }

  _streaks(dt, camera, p, on) {
    const u = this.streak.material.uniforms;
    const vmax = Math.max(this.sV0 + 3, p.vTop * 0.985);
    let I = clamp((p.v - this.sV0) / (vmax - this.sV0), 0, 1);
    I = Math.pow(I, 0.85);
    const ng = clamp((p.v - 20) / 15, 0, 1); // no wind lines on a standing-start boost
    if (p.nitroOn) I = Math.min(1.3, Math.max(I, 0.45 * ng) + 0.3 * ng);
    this._surge = Math.max(0, this._surge - dt * 3);
    if (I > 0) I += this._surge * 0.2;
    // travel axis in view space
    const view = camera.matrixWorldInverse;
    const F = u.uF.value.set(Math.sin(p.vh), 0, Math.cos(p.vh)).transformDirection(view);
    const U = u.uU.value.set(0, 1, 0).transformDirection(view);
    U.addScaledVector(F, -U.dot(F)).normalize();
    u.uR.value.crossVectors(F, U);
    u.uTail.value.copy(F).addScaledVector(U, this.sTilt).normalize();
    I *= clamp((-F.z - 0.3) / 0.4, 0, 1); // fades when looking back
    if (!on) I = 0;
    this._sI = damp(this._sI, I, I > this._sI ? 5 : 2.5, dt);
    const vis = this._sI > 0.004;
    this.streak.visible = vis;
    if (!vis) return;
    this._travel = (this._travel + p.v * dt) % 50000;
    u.uTravel.value = this._travel;
    u.uAlpha.value = this._sI * this.sBase;
    u.uLen.value = clamp(p.v * 0.05, 0.6, 5.5) * (p.nitroOn ? 1.45 : 1) * this.sLen;
    u.uPix.value = this._pix;
    u.uAspect.value = camera.aspect;
    // nitro: lines shift toward electric blue-violet
    const n = p.nitroOn ? 1 : 0;
    this._nt = damp(this._nt || 0, n, 6, dt);
    u.uColor.value.copy(this.sCol).lerp(this._c.setRGB(0.55, 0.6, 1.25), this._nt * 0.6);
  }

  _slipstream(dt, p, on) {
    const r = this.race, P = r.player;
    let best = 0, leader = null;
    const sh = Math.sin(p.vh), ch = Math.cos(p.vh);
    for (const b of r.bikes) {
      if (b === P) continue;
      const q = b.phys;
      const dx = q.x - p.x, dz = q.z - p.z;
      const f = dx * sh + dz * ch;
      if (f < 2 || f > 25) continue;
      const lat = Math.abs(dx * ch - dz * sh);
      if (lat > 1.8 || q.crashed) continue;
      const sc = (1 - f / 25) * (1 - lat / 1.8);
      if (sc > best) { best = sc; leader = b; }
    }
    if (leader) this._leader = leader;
    const gate = clamp((p.v - 150 * KMH) / (20 * KMH), 0, 1);
    const target = on && leader ? clamp(0.25 + p.draft * 1.5, 0, 1) * gate * clamp(best * 3, 0, 1) : 0;
    this._slipI = damp(this._slipI, target, target > this._slipI ? 3 : 2.5, dt);
    const vis = this._slipI > 0.01 && this._leader;
    this.slip.visible = !!vis;
    if (!vis) return;
    const L = this._leader, q = L.phys, u = this.slip.material.uniforms;
    const A = u.uA.value.set(q.x - Math.sin(q.h) * 0.8, q.y + 0.75, q.z - Math.cos(q.h) * 0.8);
    const B = this._w.set(p.x - sh * 2.2, p.y + 0.9, p.z - ch * 2.2);
    const ax = u.uAx.value.subVectors(B, A);
    const len = Math.max(1, ax.length());
    ax.multiplyScalar(1 / len);
    u.uL.value = len;
    u.uV.value.crossVectors(ax, this._up).normalize();
    u.uU.value.crossVectors(u.uV.value, ax).normalize();
    this._slipFlow = (this._slipFlow + (dt * Math.max(p.v, 20) * 0.35) / len) % 1000;
    u.uFlow.value = this._slipFlow;
    u.uAlpha.value = this._slipI * (this.T.night ? 0.9 : 0.6) * this.expK * 1.6;
    u.uPix.value = this._pix;
  }

  _nitroDressing(dt, camera, p, on, inside) {
    const P = this.race.player, m = P.model;
    const nit = on && p.nitroOn;
    this._burst = Math.max(0, this._burst - dt / 0.5);
    this._auraI = damp(this._auraI, nit ? 1 : 0, nit ? 10 : 4, dt);
    // flash at the exhaust outlet
    this._flashT += dt;
    const fk = this._flashT / 0.35;
    const ex = m.exhausts && m.exhausts[0];
    const src = ex ? m.worldPoint(ex.pos, this._v) : m.worldPoint([-m.wb / 2 - 0.2, 0.55, 0], this._v);
    // nudge toward the camera so the flash sits in front of the tail
    this._w.subVectors(camera.position, src).normalize();
    src.addScaledVector(this._w, 0.35);
    if (fk < 1 && !inside) {
      const f = (1 - fk) * (1 - fk), k = this.expK * 2;
      this.flashCore.visible = true; this.flashStreak.visible = true;
      this.flashCore.position.copy(src); this.flashStreak.position.copy(src);
      this.flashCore.scale.setScalar(1.0 + fk * 2.5);
      this.flashCore.material.color.setRGB(1.4 * f * k, 2.0 * f * k, 4.0 * f * k);
      this.flashStreak.scale.set(4.5 + fk * 7, 0.16 * (1 - fk * 0.5), 1);
      this.flashStreak.material.color.setRGB(0.9 * f * k, 1.5 * f * k, 3.6 * f * k);
    } else { this.flashCore.visible = false; this.flashStreak.visible = false; }
    // soft halo around the bike while boosting
    const hI = this._auraI * (this.tier ? 0.35 : 0.8) + this._burst * 0.6;
    if (hI > 0.01 && !inside) {
      const k = this.expK * 2 * hI * (0.85 + 0.3 * Math.random());
      this.halo.visible = true;
      m.worldPoint([0, 0.6, 0], this.halo.position);
      this.halo.scale.set(2.8 + this._burst, 1.9 + this._burst * 0.6, 1);
      this.halo.material.color.setRGB(0.25 * k, 0.32 * k, 0.9 * k);
    } else this.halo.visible = false;
    if (!this.glow) return;

    // ---- plasma glow, light sweep and afterimages (silhouette mask + composite)
    const e = this.inner.matrixWorld.elements, H = this.hist;
    if (this.hN) {
      const o = ((this.hHead + HIST - 1) % HIST) * 16;
      if ((H[o + 12] - e[12]) ** 2 + (H[o + 14] - e[14]) ** 2 > 64) this.hN = 0; // respawn teleport
    }
    this.odo += p.v * dt;
    const ho = this.hHead * 16;
    for (let i = 0; i < 16; i++) H[ho + i] = e[i];
    this.hOdo[this.hHead] = this.odo;
    this.hHead = (this.hHead + 1) % HIST; this.hN = Math.min(HIST, this.hN + 1);

    const u = this.glow.material.uniforms, im = this.mask.instanceMatrix.array;
    this._sweepT += dt;
    const sk = this._sweepT / 0.8;
    const sweepAmt = sk < 1 && !inside ? Math.sin(sk * Math.PI) * 1.2 : 0;
    u.uSweep.value = 0.2 + sk * 1.0;
    u.uSweepAmt.value = sweepAmt;
    const aura = inside ? 0 : this._auraI * 0.55 + this._burst * 0.45;
    u.uAura.value = aura;
    for (let i = 0; i < 16; i++) im[i] = e[i];
    // afterimages trail by distance travelled, short enough to stay around the bike
    this._ghostI = damp(this._ghostI, nit && p.v > 20 && !inside ? 1 : 0, nit ? 6 : 4, dt);
    const camD = camera.position.distanceTo(this._w.set(e[12], e[13], e[14]));
    const spacing = Math.min(p.v * 0.012, (camD * 0.32) / this.ghostN, 1.0);
    let ghosts = 0;
    const ec = u.uEcho.value.set(0, 0, 0);
    for (let k = 1; k <= this.ghostN; k++) {
      let a = 0;
      if (this._ghostI > 0.01 && spacing > 0.12) {
        const target = this.odo - k * spacing;
        for (let j = 1; j < this.hN; j++) {
          const idx = (this.hHead - 1 - j + HIST * 2) % HIST;
          if (this.hOdo[idx] <= target) {
            for (let i = 0; i < 16; i++) im[k * 16 + i] = H[idx * 16 + i];
            a = this._ghostI * 0.8 * Math.pow(1 - (k - 1) / (this.ghostN + 0.5), 1.2);
            break;
          }
        }
      }
      ec.setComponent(k - 1, a);
      if (a > 0) ghosts = k;
    }
    const vis = aura > 0.004 || sweepAmt > 0 || ghosts > 0;
    this.glow.visible = vis;
    if (!vis) return;
    this.mask.count = ghosts + 1;
    this.mask.instanceMatrix.needsUpdate = true;
    this._screenRect(camera, e, u.uRect.value);
    this._renderMask(camera);
    u.uTime.value = this.time;
    u.uFlick.value = 0.82 + 0.18 * Math.sin(this.time * 53) * Math.sin(this.time * 31) + 0.15 * Math.random();
  }

  _updateRings(dt) {
    for (const it of this.rings) {
      if (it.t >= it.life) { it.mesh.visible = false; continue; }
      it.t += dt;
      const k = Math.min(1, it.t / it.life);
      const rad = it.r0 + (it.r1 - it.r0) * (1 - (1 - k) ** 3);
      const mesh = it.mesh;
      mesh.scale.setScalar(rad / 0.8);
      if (it.follow) {
        const q = it.follow.phys;
        const fx = Math.sin(q.h), fz = Math.cos(q.h);
        mesh.position.set(q.x + fx * it.ox, q.y + it.oy, q.z + fz * it.ox);
        if (it.flat) {
          // lie on the road, tilted with the slope along the heading
          const g = q.proj.grade || 0;
          this._v.set(-fx * g, 1, -fz * g).normalize();
          mesh.quaternion.setFromUnitVectors(this._Z, this._v);
        } else mesh.quaternion.setFromUnitVectors(this._Z, this._v.set(fx, 0, fz));
      }
      const u = it.u;
      u.uAlpha.value = it.a * Math.min(1, k * 8) * (1 - k) * (1 - k);
      u.uTime.value = this.time;
      mesh.visible = true;
    }
  }

  _updateVapor(dt, p, fwd, inside) {
    this._vaporT += dt;
    const k = this._vaporT / 1.3;
    const vis = k < 1 && !inside && !p.crashed;
    this.vapor.visible = vis;
    if (this._sSweepT < 2) this._sSweepT += dt;
    if (!vis) return;
    const m = this.race.player.model, u = this.vapor.material.uniforms;
    m.worldPoint([m.bounds.max.x * 0.75, 0.62, 0], this.vapor.position);
    this.vapor.quaternion.setFromUnitVectors(this._Y, fwd);
    u.uGrow.value = 0.85 + 0.3 * k;
    u.uAlpha.value = (this.T.night ? 0.55 : 0.75) * Math.min(1, k * 7) * (1 - k) ** 1.5;
    u.uTime.value = this.time;
  }

  _updateOverlay(dt, camera, p) {
    const u = this.overlay.material.uniforms;
    this._overT += dt;
    const over = this._overT / 0.5;
    const sweep = this._sSweepT / 0.9;
    const burst = this._burst > 0 ? this._burst ** 1.5 : 0;
    const vis = burst > 0.002 || over < 1 || sweep < 1;
    this.overlay.visible = vis;
    if (!vis) return;
    u.uBurst.value = burst;
    u.uOver.value = over < 1 ? over : 0;
    u.uSweep.value = sweep < 1 ? sweep : 0;
    u.uAspect.value = camera.aspect;
    u.uTime.value = this.time;
    // radial burst centred on the bike on screen
    const v = this._v.set(p.x, p.y + 0.7, p.z).project(camera);
    u.uCenter.value.set(clamp(v.x * 0.5 + 0.5, 0.2, 0.8), clamp(v.y * 0.5 + 0.5, 0.2, 0.8));
  }

  dispose() {
    const done = new Set();
    for (const o of this.objects) {
      o.removeFromParent();
      if (o.geometry && !done.has(o.geometry)) { done.add(o.geometry); o.geometry.dispose(); }
      if (o.material && !done.has(o.material)) { done.add(o.material); o.material.dispose(); }
    }
    if (this.mask) { this.mask.geometry.dispose(); this.mask.material.dispose(); this.mask.dispose(); this.maskRT.dispose(); }
    this.objects.length = 0;
  }
}
