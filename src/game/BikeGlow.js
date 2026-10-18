// Glowing light effects ON the motorcycles — the night-race photo look: lens glare (hot
// core, diffraction star, anamorphic streak) on head/tail/brake lights, long-exposure light
// trails, lamp reflections streaking down wet asphalt, hot brake discs, exhaust backfire
// (energy arcs on electric bikes), volumetric headlight beams with light pools on the road
// and neon underglow. No real lights: everything is additive, pooled into a handful of
// batched draw calls and gated by distance, time of day, weather and quality.
import * as THREE from 'three';
import { glareAtlas, releaseGlareAtlas } from './glowTextures.js';
import { clamp, smoothstep as sstep } from '../core/utils.js';

// per quality tier: bajo, medio, alto, ultra
const TIERS = [
  { star: false, trailPts: 18, beamDist: 45, discDist: 30, reflDist: 60, arcs: false },
  { star: true, trailPts: 26, beamDist: 80, discDist: 40, reflDist: 90, arcs: true },
  { star: true, trailPts: 34, beamDist: 110, discDist: 50, reflDist: 120, arcs: true },
  { star: true, trailPts: 40, beamDist: 140, discDist: 60, reflDist: 150, arcs: true },
];
const LED = { electric: 1, sporttourer: 1, superbike: 1, adventure: 1, gp: 1, sm: 1, mx: 1 };
const TAIL = [1.0, 0.035, 0.018];
// outlets of silencers built without the shared muffler() helper (bike space)
const OUTLETS = {
  sporttourer: [{ pos: [-0.57, 0.526, 0.178], dir: [-1, 0.3, 0], r: 0.018 }, { pos: [-0.57, 0.474, 0.178], dir: [-1, 0.3, 0], r: 0.018 }],
};
// lamp output relative to a headlight (light reaching the lens is output * view / (d/10 m)^2)
const I_TAIL = 0.2, I_BRAKE = 0.75;

// ------------------------------------------------------------------ shaders
const FADE = /* glsl */`float fogT(float d){ float f = uFogDensity * d; return exp(-f * f); }`;
const OUT = /* glsl */`
    #include <tonemapping_fragment>
    #include <colorspace_fragment>`;

const GLARE_VS = /* glsl */`
  attribute vec3 iPos;
  attribute vec4 iCol;   // rgb (HDR), atlas frame
  attribute vec4 iShape; // half width, half height, rotation, pull toward the camera (m)
  attribute vec4 iAxis;  // world axis (flames), w = 1 for axial billboards
  uniform float uFogDensity;
  varying vec2 vUv;
  varying vec3 vCol;
  ${FADE}
  void main() {
    vec4 mv = viewMatrix * vec4(iPos, 1.0);
    float d = max(-mv.z, 0.01);
    // pulled toward the eye so the lamp's own housing never clips its glow
    float k = max(d - iShape.w, 0.05) / d;
    vec2 c = position.xy;
    vec2 off;
    if (iAxis.w > 0.5) {
      vec2 a = (mat3(viewMatrix) * iAxis.xyz).xy;
      float la = length(a);
      vec2 dir = la > 1e-4 ? a / la : vec2(0.0, 1.0);
      // (perp, dir) keeps the quad's winding: from the outlet out along the axis
      off = dir * (c.y + 1.0) * iShape.y * max(la, 0.2) + vec2(dir.y, -dir.x) * c.x * iShape.x;
    } else {
      float s = sin(iShape.z), co = cos(iShape.z);
      vec2 q = c * iShape.xy;
      off = vec2(co * q.x - s * q.y, s * q.x + co * q.y);
    }
    mv.xyz *= k;
    mv.xy += off * k;
    gl_Position = projectionMatrix * mv;
    float f = iCol.a;
    vUv = (vec2(mod(f, 2.0), floor(f * 0.5 + 0.01)) + c * 0.5 + 0.5) * 0.5;
    vCol = iCol.rgb * fogT(d);
  }`;
const GLARE_FS = /* glsl */`
  uniform sampler2D tAtlas;
  varying vec2 vUv;
  varying vec3 vCol;
  void main() {
    vec3 t = texture2D(tAtlas, vUv).rgb;
    gl_FragColor = vec4(vCol * t * t, 1.0);
    ${OUT}
  }`;

const DECAL_VS = /* glsl */`
  attribute vec3 iPos;  // centre on the road
  attribute vec3 iNrm;  // road normal
  attribute vec4 iAxis; // long axis (x,z), half length, half width
  attribute vec4 iCol;  // rgb, skew (brighter toward the -u end)
  uniform float uFogDensity;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vSkew;
  ${FADE}
  void main() {
    vec3 a = vec3(iAxis.x, 0.0, iAxis.y);
    a = normalize(a - iNrm * dot(a, iNrm) + vec3(1e-5, 0.0, 0.0));
    vec3 b = cross(iNrm, a);
    vec3 wp = iPos + a * position.x * iAxis.z + b * position.y * iAxis.w;
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mv;
    vUv = position.xy;
    vSkew = iCol.a;
    vCol = iCol.rgb * fogT(-mv.z);
  }`;
const DECAL_FS = /* glsl */`
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vSkew;
  void main() {
    float u = vUv.x, v = vUv.y;
    // skewed decals (headlight pools) also widen toward the far end like a real beam
    float vv = v / (1.0 + vSkew * 0.6 * (u + 1.0));
    float f = exp(-(u * u * 2.6 + vv * vv * 3.6)) * max(0.0, 1.0 - vSkew * u);
    f *= smoothstep(1.0, 0.72, max(abs(u), abs(v)));
    gl_FragColor = vec4(vCol * f, 1.0);
    ${OUT}
  }`;

// Wet-road reflection: a streak drawn in screen space along the projected road normal —
// from the lamp's foot, through the mirror point, on toward the viewer — and cast back onto
// the road plane, so it keeps its photographic shape at any distance and is still hidden
// by whatever stands on the road in front of it.
const REFL_VS = /* glsl */`
  attribute vec3 iPos;  // mirror point on the road
  attribute vec3 iNrm;  // road normal
  attribute vec4 iCol;  // rgb, ripple seed
  attribute vec3 iSize; // half width, length toward the viewer, length up to the lamp's foot (image plane)
  uniform float uFogDensity;
  varying vec2 vUv;
  varying vec4 vCol;
  ${FADE}
  void main() {
    vec3 P = (viewMatrix * vec4(iPos, 1.0)).xyz;
    vec3 N = normalize(mat3(viewMatrix) * iNrm);
    float zP = max(-P.z, 0.05);
    vec2 s0 = P.xy / zP;
    vec3 Q = P - N * 0.3;
    vec2 dir = Q.xy / max(-Q.z, 0.05) - s0;
    float ld = length(dir);
    dir = ld > 1e-6 ? dir / ld : vec2(0.0, -1.0);
    float along = position.y * (position.y < 0.0 ? iSize.z : iSize.y);
    vec3 r = vec3(s0 + dir * along + vec2(-dir.y, dir.x) * position.x * iSize.x, -1.0);
    float t = clamp((dot(N, P) + 0.025) / min(dot(N, r), -1e-4), 0.0, zP * 3.0);
    gl_Position = projectionMatrix * vec4(r * t, 1.0);
    vUv = position.xy;
    vCol = vec4(iCol.rgb * fogT(zP), iCol.a);
  }`;
const REFL_FS = /* glsl */`
  varying vec2 vUv;
  varying vec4 vCol;
  void main() {
    float u = vUv.x, v = vUv.y;
    float along = v < 0.0 ? smoothstep(-1.0, 0.0, v) * (0.55 + 0.45 * smoothstep(-0.25, 0.0, v)) : pow(1.0 - v, 1.5);
    float across = exp(-u * u * 5.0) * 0.55 + exp(-u * u * 40.0) * 0.45;
    // broken up by the ripples and grain of the wet asphalt
    float rip = 0.72 + 0.28 * sin(v * 23.0 + vCol.a) * sin(v * 9.0 - vCol.a * 1.7 + u * 1.3);
    gl_FragColor = vec4(vCol.rgb * along * across * rip, 1.0);
    ${OUT}
  }`;

const RIBBON_VS = /* glsl */`
  attribute vec4 aCol; // premultiplied rgb, across-ribbon coordinate (-1..1)
  uniform float uFogDensity;
  varying vec4 vC;
  ${FADE}
  void main() {
    vec4 mv = viewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vC = vec4(aCol.rgb * fogT(-mv.z), aCol.w);
  }`;
const RIBBON_FS = /* glsl */`
  varying vec4 vC;
  void main() {
    float f = 1.0 - vC.w * vC.w;
    gl_FragColor = vec4(vC.rgb * f * f, 1.0);
    ${OUT}
  }`;

const DISC_VS = /* glsl */`
  attribute float aR; // 0 inner edge of the friction band, 1 outer edge
  uniform float uFogDensity;
  varying float vR;
  varying float vFog;
  ${FADE}
  void main() {
    vR = aR;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFog = fogT(-mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const DISC_FS = /* glsl */`
  uniform float uHeat, uGain;
  varying float vR;
  varying float vFog;
  void main() {
    // hottest along the pad track, cooler toward the carrier and the rim edge
    float band = smoothstep(0.0, 0.3, vR) * smoothstep(1.0, 0.84, vR);
    float h = uHeat * band * (0.8 + 0.2 * smoothstep(0.25, 0.75, vR));
    // incandescence: dull cherry red -> orange -> yellow, radiance rising steeply
    vec3 c = mix(vec3(1.0, 0.1, 0.012), vec3(1.0, 0.3, 0.04), smoothstep(0.4, 0.8, h));
    c = mix(c, vec3(1.0, 0.58, 0.2), smoothstep(0.85, 1.2, h));
    float I = smoothstep(0.1, 0.35, h) * h * h * (0.6 + 1.6 * h);
    gl_FragColor = vec4(c * I * uGain * vFog, 1.0);
    ${OUT}
  }`;

// Headlight shaft: the closed cone mesh is only a proxy. Each pixel finds where its view
// ray crosses the (convex) beam volume and integrates the scattered light along that chord,
// so it reads right from the side, from behind along the beam, or from inside it.
const BEAM_L = 17, BEAM_R = 3.4, BEAM_A = 0.04, BEAM_KY = 1 / 0.45;
const BEAM_VS = /* glsl */`
  varying vec3 vL;
  void main() {
    vL = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const BEAM_FS = /* glsl */`
  uniform vec3 uColor, uCam;
  uniform float uInt, uInside, uFogDensity;
  uniform vec4 uPlane; // road plane in beam space
  varying vec3 vL;
  ${FADE}
  const float L = ${BEAM_L.toFixed(1)}, CA = ${BEAM_A.toFixed(3)}, CB = ${(BEAM_R / BEAM_L).toFixed(5)}, KY = ${BEAM_KY.toFixed(4)};
  float dens(vec3 p) {
    float r = CA + CB * max(p.x, 0.0);
    float q = (p.y * p.y * KY * KY + p.z * p.z) / (r * r);
    // soft edges, 1/r-ish falloff from the lamp, cut by the road surface
    return max(0.0, 1.0 - q) * pow(max(1.0 - p.x / L, 0.0), 1.5) / (0.3 + p.x * 0.4)
      * smoothstep(0.0, 0.3, dot(uPlane.xyz, p) + uPlane.w) * smoothstep(0.0, 0.25, p.x);
  }
  void main() {
    bool inside = uInside > 0.5;
    if (gl_FrontFacing == inside) discard;
    vec3 o = uCam, dv = vL - o;
    float tf = length(dv);
    vec3 d = dv / tf;
    float t0 = 0.0, t1 = tf;
    if (!inside) {
      // entering here: leave through the far wall or an end cap
      t0 = tf;
      float ex = 1e4;
      if (d.x > 1e-4) ex = (L - o.x) / d.x; else if (d.x < -1e-4) ex = -o.x / d.x;
      float r0 = CA + CB * o.x;
      float A = KY * KY * d.y * d.y + d.z * d.z - CB * CB * d.x * d.x;
      float B = 2.0 * (KY * KY * o.y * d.y + o.z * d.z - CB * r0 * d.x);
      float C = KY * KY * o.y * o.y + o.z * o.z - r0 * r0;
      float D = B * B - 4.0 * A * C;
      if (abs(A) > 1e-6 && D > 0.0) {
        float s = sqrt(D), ra = (-B - s) / (2.0 * A), rb = (-B + s) / (2.0 * A);
        float w = A > 0.0 ? max(ra, rb) : min(ra, rb);
        if (w > t0 + 1e-3) ex = min(ex, w);
      }
      t1 = max(ex, t0);
    }
    float seg = (t1 - t0) / 5.0, acc = 0.0;
    for (int i = 0; i < 5; i++) acc += dens(o + d * (t0 + seg * (float(i) + 0.5)));
    // mist scatters forward (Henyey-Greenstein, g = 0.5): faint seen from behind the lamp,
    // stronger looking back into it; normalised to 1 seen side-on
    float ph = min(1.396 / pow(1.25 + d.x, 1.5), 2.5);
    gl_FragColor = vec4(uColor * (acc * seg * ph * uInt * fogT(t0 + seg * 2.5)), 1.0);
    ${OUT}
  }`;

function additive(params) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false, ...params,
  });
}

function quadGeometry() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
function inst(g, name, max, size) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute(name, a);
  return a;
}
function upload(a, n) { a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, n * a.itemSize)); a.needsUpdate = true; }

// ------------------------------------------------------------------ batches
// Instanced additive quads rebuilt every frame: one draw call per batch.
class Batch {
  constructor(geo, max, attrs, mat, order) {
    this.max = max; this.n = 0;
    this.attrs = attrs.map(([name, size]) => inst(geo, name, max, size));
    geo.instanceCount = 0;
    this.mat = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.visible = false;
  }
  flush() {
    const n = this.n, A = this.attrs;
    this.mesh.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n) for (let i = 0; i < A.length; i++) upload(A[i], n);
    this.n = 0;
  }
}

// Camera-facing glare sprites (and axial flame billboards).
class GlareBatch extends Batch {
  constructor(max, fogU) {
    super(quadGeometry(), max, [['iPos', 3], ['iCol', 4], ['iShape', 4], ['iAxis', 4]],
      additive({ uniforms: { tAtlas: { value: glareAtlas() }, uFogDensity: fogU }, vertexShader: GLARE_VS, fragmentShader: GLARE_FS, side: THREE.DoubleSide }), 9);
  }
  add(x, y, z, r, g, b, frame, sx, sy, rot, pull, ax = 0, ay = 0, az = 0, axial = 0) {
    if (this.n >= this.max) return;
    const i = this.n++, [P, C, S, A] = this.attrs;
    P.array[i * 3] = x; P.array[i * 3 + 1] = y; P.array[i * 3 + 2] = z;
    C.array[i * 4] = r; C.array[i * 4 + 1] = g; C.array[i * 4 + 2] = b; C.array[i * 4 + 3] = frame;
    S.array[i * 4] = sx; S.array[i * 4 + 1] = sy; S.array[i * 4 + 2] = rot; S.array[i * 4 + 3] = pull;
    A.array[i * 4] = ax; A.array[i * 4 + 1] = ay; A.array[i * 4 + 2] = az; A.array[i * 4 + 3] = axial;
  }
}

// Soft additive decals lying on the road (light pools, underglow, exhaust flashes).
class DecalBatch extends Batch {
  constructor(max, fogU) {
    super(quadGeometry(), max, [['iPos', 3], ['iNrm', 3], ['iAxis', 4], ['iCol', 4]], additive({
      uniforms: { uFogDensity: fogU }, vertexShader: DECAL_VS, fragmentShader: DECAL_FS,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6,
    }), 3);
  }
  add(x, y, z, nx, ny, nz, ax, az, hl, hw, r, g, b, skew = 0) {
    if (this.n >= this.max) return;
    const i = this.n++, [P, N, A, C] = this.attrs;
    P.array[i * 3] = x + nx * 0.03; P.array[i * 3 + 1] = y + ny * 0.03; P.array[i * 3 + 2] = z + nz * 0.03;
    N.array[i * 3] = nx; N.array[i * 3 + 1] = ny; N.array[i * 3 + 2] = nz;
    A.array[i * 4] = ax; A.array[i * 4 + 1] = az; A.array[i * 4 + 2] = hl; A.array[i * 4 + 3] = hw;
    C.array[i * 4] = r; C.array[i * 4 + 1] = g; C.array[i * 4 + 2] = b; C.array[i * 4 + 3] = skew;
  }
}

// Lamp reflections on wet asphalt (see REFL_VS); the strip is split along its length so
// the falloff stays even on screen.
class ReflBatch extends Batch {
  constructor(max, fogU) {
    const g = new THREE.InstancedBufferGeometry();
    const pos = [], idx = [], SEG = 12;
    for (let i = 0; i <= SEG; i++) {
      const v = -1 + (2 * i) / SEG;
      pos.push(-1, v, 0, 1, v, 0);
      if (i < SEG) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    super(g, max, [['iPos', 3], ['iNrm', 3], ['iCol', 4], ['iSize', 3]], additive({
      uniforms: { uFogDensity: fogU }, vertexShader: REFL_VS, fragmentShader: REFL_FS, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6,
    }), 4);
  }
  add(x, y, z, nx, ny, nz, r, g, b, seed, hw, len, up) {
    if (this.n >= this.max) return;
    const i = this.n++, [P, N, C, S] = this.attrs;
    P.array[i * 3] = x; P.array[i * 3 + 1] = y; P.array[i * 3 + 2] = z;
    N.array[i * 3] = nx; N.array[i * 3 + 1] = ny; N.array[i * 3 + 2] = nz;
    C.array[i * 4] = r; C.array[i * 4 + 1] = g; C.array[i * 4 + 2] = b; C.array[i * 4 + 3] = seed;
    S.array[i * 3] = hw; S.array[i * 3 + 1] = len; S.array[i * 3 + 2] = up;
  }
}

// Camera-facing ribbons rebuilt every frame from scratch points (trails, arcs).
class RibbonBatch {
  constructor(maxVerts, fogU) {
    this.maxV = maxVerts;
    this.pos = new Float32Array(maxVerts * 3);
    this.col = new Float32Array(maxVerts * 4);
    this.idx = new Uint32Array(maxVerts * 3);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aIdx = new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aCol', this.aCol);
    g.setIndex(this.aIdx);
    g.setDrawRange(0, 0);
    this.mat = additive({ uniforms: { uFogDensity: fogU }, vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    // scratch input: points, half widths, premultiplied colours
    this.sp = new Float32Array(64 * 3);
    this.sw = new Float32Array(64);
    this.sc = new Float32Array(64 * 3);
    this.nv = 0; this.ni = 0;
    this.cx = 0; this.cy = 0; this.cz = 0;
  }
  begin(cam) { this.nv = 0; this.ni = 0; this.cx = cam.x; this.cy = cam.y; this.cz = cam.z; }
  // emit the first n scratch points as one strip
  flush(n) {
    if (n < 2 || this.nv + n * 2 > this.maxV) return;
    const sp = this.sp, P = this.pos, C = this.col, I = this.idx;
    const base = this.nv;
    for (let i = 0; i < n; i++) {
      const i0 = i > 0 ? i - 1 : 0, i1 = i < n - 1 ? i + 1 : n - 1;
      const tx = sp[i1 * 3] - sp[i0 * 3], ty = sp[i1 * 3 + 1] - sp[i0 * 3 + 1], tz = sp[i1 * 3 + 2] - sp[i0 * 3 + 2];
      const px = sp[i * 3], py = sp[i * 3 + 1], pz = sp[i * 3 + 2];
      const vx = this.cx - px, vy = this.cy - py, vz = this.cz - pz;
      let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
      let l = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (l < 1e-6) { sx = vz; sy = 0; sz = -vx; l = Math.sqrt(sx * sx + sz * sz) || 1; }
      const w = this.sw[i] / l;
      const v = (base + i * 2) * 3;
      P[v] = px - sx * w; P[v + 1] = py - sy * w; P[v + 2] = pz - sz * w;
      P[v + 3] = px + sx * w; P[v + 4] = py + sy * w; P[v + 5] = pz + sz * w;
      const c = (base + i * 2) * 4, r = this.sc[i * 3], g = this.sc[i * 3 + 1], b = this.sc[i * 3 + 2];
      C[c] = r; C[c + 1] = g; C[c + 2] = b; C[c + 3] = -1;
      C[c + 4] = r; C[c + 5] = g; C[c + 6] = b; C[c + 7] = 1;
      if (i > 0) {
        const a = base + (i - 1) * 2, o = this.ni;
        I[o] = a; I[o + 1] = a + 1; I[o + 2] = a + 2; I[o + 3] = a + 1; I[o + 4] = a + 3; I[o + 5] = a + 2;
        this.ni += 6;
      }
    }
    this.nv += n * 2;
  }
  end() {
    this.mesh.geometry.setDrawRange(0, this.ni);
    this.mesh.visible = this.ni > 0;
    if (this.ni) { upload(this.aPos, this.nv); upload(this.aCol, this.nv); upload(this.aIdx, this.ni); }
  }
}

// ------------------------------------------------------------------ geometry
// Glow overlay for one rotor: a ring on each face of the disc (wheel-local, axis Z).
function discGeometry(r, z) {
  const seg = 40, rIn = r * 0.62, pos = [], aR = [], idx = [];
  for (const s of [1, -1]) {
    const b = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      pos.push(c * rIn, sn * rIn, z + s * 0.0035, c * r, sn * r, z + s * 0.0035);
      aR.push(0, 1);
    }
    for (let i = 0; i < seg; i++) {
      const a = b + i * 2;
      if (s > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aR', new THREE.Float32BufferAttribute(aR, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// Closed proxy hull of the headlight beam along +x (flattened elliptic cone, both ends
// capped, outward winding): every ray through the volume has one front and one back face.
function beamGeometry() {
  const seg = 20, pos = [], idx = [];
  const ring = (x, r) => { const b = pos.length / 3; for (let j = 0; j < seg; j++) { const a = (j / seg) * Math.PI * 2; pos.push(x, (Math.cos(a) * r) / BEAM_KY, Math.sin(a) * r); } return b; };
  // the hull is the exact cone, so the proxy slightly outgrows it to avoid clipping rays
  const r0 = ring(0, BEAM_A * 1.08), r1 = ring(BEAM_L, (BEAM_A + BEAM_R) * 1.08);
  for (let j = 0; j < seg; j++) {
    const j1 = (j + 1) % seg;
    idx.push(r0 + j, r0 + j1, r1 + j, r0 + j1, r1 + j1, r1 + j);
  }
  const c0 = pos.length / 3; pos.push(0, 0, 0);
  const c1 = pos.length / 3; pos.push(BEAM_L, 0, 0);
  for (let j = 0; j < seg; j++) {
    const j1 = (j + 1) % seg;
    idx.push(c0, r0 + j1, r0 + j, c1, r1 + j, r1 + j1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ main
export class BikeGlow {
  constructor(scene, quality = {}, env, bikes) {
    this.scene = scene;
    this.env = env;
    this.bikes = bikes;
    this.tier = !quality.post ? 0 : quality.density >= 1.3 ? 3 : quality.density >= 1 ? 2 : 1;
    this.T = TIERS[this.tier];
    this.time = 0;
    this.fogU = { value: 0 };
    this.renderer = env?.engine?.renderer || null;
    this._cf = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._g = { S: 0, I: 0 }; // size / intensity of the last glare drawn
    this._beamGeo = beamGeometry();

    let nG = 0, nD = 0, nR = 0, nV = 0;
    this.st = bikes.map((b) => this._setup(b));
    for (const s of this.st) {
      nG += (s.heads.length + s.tails.length) * 3 + s.ex.length * 3 + 4;
      nD += s.ex.length + 2;
      nR += s.heads.length + s.tails.length;
      nV += s.trails.length * this.T.trailPts * 2 + (s.arcs ? 2 * 9 * 2 : 0);
    }
    this.glare = new GlareBatch(Math.max(8, nG), this.fogU);
    this.decals = new DecalBatch(Math.max(8, nD), this.fogU);
    this.refl = new ReflBatch(Math.max(8, nR), this.fogU);
    this.ribbons = new RibbonBatch(Math.max(64, nV), this.fogU);
    scene.add(this.decals.mesh, this.refl.mesh, this.ribbons.mesh, this.glare.mesh);
  }

  // Per-bike light rig: lamp positions in their group's space, discs, beam, trails.
  _setup(b) {
    const m = b.model, spec = b.spec, ctx = m.ctx;
    m.root.updateMatrixWorld(true);
    const chassis = m.groups.chassis;
    const toBike = this._m.copy(chassis.matrixWorld).invert();
    const rel = (grp) => new THREE.Matrix4().multiplyMatrices(toBike, grp.matrixWorld); // group -> bike space
    const led = !!LED[spec.design];
    const hc = led ? [0.86, 0.93, 1.0] : [1.0, 0.88, 0.7];
    const s = {
      b, m, p: b.phys, chassis, hc, heads: [], tails: [], ex: [], discs: [], trails: [], seed: b.id * 1.37 + 0.5,
      heatF: 0, heatR: 0, prevGear: b.phys.gear, prevPop: 0, burstT: 0, burstDur: 1, burstI: 0, arcT: 0, prevThr: 0, dist: 0, brake: 0,
    };
    // headlights (the biggest one is the main beam)
    const rMax = Math.max(0.03, ...m.headlights.map((h) => h.r || 0.04));
    for (const h of m.headlights) {
      const grp = m.groups[h.group] || chassis;
      const inv = rel(grp).invert();
      const lp = new THREE.Vector3(h.pos[0] + 0.02, h.pos[1], h.pos[2] ?? 0).applyMatrix4(inv);
      const ld = new THREE.Vector3(1, 0, 0).transformDirection(inv);
      s.heads.push({ grp, lx: lp.x, ly: lp.y, lz: lp.z, dx: ld.x, dy: ld.y, dz: ld.z, k: clamp((h.r || 0.04) / rMax, 0.45, 1), view: 0, facing: 0 });
    }
    // tail lamps: most sit on the chassis, a few (bobber) ride on the swingarm
    for (const t of ctx.tails || []) {
      const grp = this._groupOf(m, t.pos, rel);
      const lp = new THREE.Vector3(t.pos[0] - 0.012, t.pos[1], t.pos[2] ?? 0).applyMatrix4(rel(grp).invert());
      s.tails.push({ grp, lx: lp.x, ly: lp.y, lz: lp.z, view: 0 });
    }
    for (const e of m.exhausts?.length ? m.exhausts : b.phys.electric ? [] : OUTLETS[spec.design] || []) {
      const d = Math.hypot(e.dir[0], e.dir[1], e.dir[2]) || 1;
      s.ex.push({ lx: e.pos[0], ly: e.pos[1], lz: e.pos[2] ?? 0, dx: e.dir[0] / d, dy: e.dir[1] / d, dz: e.dir[2] / d, r: e.r || 0.04 });
    }
    // light trails: one per tail lamp + the main headlight
    for (const t of s.tails) s.trails.push(this._trail(t, false));
    if (s.heads.length) s.trails.push(this._trail(s.heads[0], true));
    // hot brake discs: radius/offset recovered from the calipers (caliper sits at 0.86 R + 3 cm)
    for (const c of ctx.calipers || []) {
      const front = c.group === 'forkSlider';
      const ax = front ? ctx.front : ctx.rear;
      const R = (Math.hypot(c.pos[0] - ax.x, c.pos[1] - ax.y) - 0.03) / 0.86;
      if (!(R > 0.05 && R < 0.3)) continue;
      const mat = additive({
        uniforms: { uHeat: { value: 0 }, uGain: { value: 1 }, uFogDensity: this.fogU }, vertexShader: DISC_VS, fragmentShader: DISC_FS,
      });
      const mesh = new THREE.Mesh(discGeometry(R, c.pos[2]), mat);
      mesh.renderOrder = 6;
      mesh.visible = false;
      (front ? m.groups.frontWheel : m.groups.rearWheel).add(mesh);
      s.discs.push({ mesh, mat, front });
    }
    // volumetric beam on the main headlight
    if (s.heads.length) {
      const h = m.headlights[0];
      const grp = s.heads[0].grp;
      const mat = additive({
        uniforms: {
          uColor: { value: new THREE.Color(hc[0], hc[1], hc[2]) }, uCam: { value: new THREE.Vector3() }, uInt: { value: 0 }, uInside: { value: 0 },
          uPlane: { value: new THREE.Vector4(0, 1, 0, 0) }, uFogDensity: this.fogU,
        },
        vertexShader: BEAM_VS, fragmentShader: BEAM_FS, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this._beamGeo, mat);
      const mb = new THREE.Matrix4().compose(new THREE.Vector3(h.pos[0] + 0.03, h.pos[1], h.pos[2] ?? 0),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.035), new THREE.Vector3(1, 1, 1));
      rel(grp).invert().multiply(mb).decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.updateMatrix();
      mesh.renderOrder = 6;
      mesh.visible = false;
      grp.add(mesh);
      s.beam = { mesh, mat, grp };
    }
    // neon underglow + electric motor arcs
    const lv = m.livery;
    if (spec.design === 'electric' || lv.pattern === 'neon') {
      const c = new THREE.Color(lv.accent);
      s.neon = [c.r, c.g, c.b];
    }
    if (b.phys.electric) {
      const mc = spec.design === 'electric' ? [-0.06, 0.38, 0.112, 0.085] : [ctx.pivot[0] + 0.12, ctx.pivot[1] - 0.04, 0.13, 0.07];
      const c = new THREE.Color(lv.accent);
      s.arcs = { x: mc[0], y: mc[1], z: mc[2], r: mc[3], c: [0.45 + c.r * 0.55, 0.75 + c.g * 0.25, 0.9 + c.b * 0.1] };
    }
    return s;
  }

  // The articulated group whose tail-lamp mesh contains a bike-space point.
  _groupOf(m, pos, rel) {
    const v = new THREE.Vector3();
    for (const name of ['swingarm', 'chassis']) {
      const grp = m.groups[name];
      if (!grp) continue;
      const inv = rel(grp).invert();
      for (const o of grp.children) {
        if (!o.isMesh || o.material !== m.tailMat) continue;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        v.set(pos[0], pos[1], pos[2] ?? 0).applyMatrix4(inv);
        if (o.geometry.boundingBox.distanceToPoint(v) < 0.02) return grp;
      }
    }
    return m.groups.chassis;
  }

  _trail(light, head) {
    const M = this.T.trailPts;
    return { light, head, M, buf: new Float32Array(M * 7), headI: 0, n: 0, lastPush: -1 };
  }

  // ---------------------------------------------------------------- per frame
  update(dt, camera) {
    if (!camera) return;
    this.time += dt;
    const env = this.env, T = env?.T || {}, W = env?.W || {};
    const fog = this.scene.fog;
    this.fogU.value = fog && fog.density ? fog.density : 0;
    // how dark it is (glare / trails / beams scale with it) and how much the air scatters light
    const elev = T.sunElev ?? 50;
    let night = T.night ? 1 : T.overcast && elev < 10 ? 0.8 : elev < 10 ? 0.45 : 0.06;
    night = clamp(night + (W.overcast ? 0.12 : 0) + (W.rain ? 0.15 : 0) + (W.fogLight ? 0.2 : 0) + (W.lightning ? 0.08 : 0), 0, 1);
    this.night = night;
    this.G = night * (W.rain ? 1.15 : W.wet ? 1.06 : 1);
    this.scatter = clamp(this.fogU.value * 200 + (W.rain ? 0.35 : 0) + (W.snow ? 0.3 : 0), 0.12, 1.3);
    this.wet = W.wet || env?.track?.wet ? 1 : W.snowy ? 0.25 : 0;
    // camera
    const cam = camera.position;
    camera.getWorldDirection(this._cf);
    const H = this.renderer ? this.renderer.domElement.height : 720;
    this.pxK = H / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.resK = H / 720;
    this.maxS = H * 0.2;
    this.ribbons.begin(cam);
    for (let i = 0; i < this.st.length; i++) this._bike(this.st[i], dt, cam);
    this.glare.flush();
    this.decals.flush();
    this.refl.flush();
    this.ribbons.end();
  }

  _bike(s, dt, cam) {
    const b = s.b, p = s.p, m = s.m, Tq = this.T;
    const rp = m.root.position;
    const dx = rp.x - cam.x, dy = rp.y - cam.y, dz = rp.z - cam.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    s.dist = dist;
    // ---- state that evolves even off-screen: brake heat, combustion bursts.
    // The brake light is the source of truth (it is animated in replays too).
    const braking = m.tailMat ? m.tailMat.emissiveIntensity > 3 : (p.input.brake || 0) > 0.1;
    const brake = braking ? Math.max(0.55, p.input.brake || 0) : 0;
    const sp = clamp(p.v / 55, 0, 1.3);
    s.brake = brake;
    s.heatF = clamp(s.heatF + brake * sp * dt * 1.15 - s.heatF * dt * 0.24, 0, 1.25);
    s.heatR = clamp(s.heatR + (braking ? Math.max(brake * 0.45, p.input.rearBrake || 0) : 0) * sp * dt * 1.15 - s.heatR * dt * 0.22, 0, 1.25);
    this._bursts(s, dt);
    if (!m.root.visible || dist > 330) { this._hide(s); return; }

    // ---- bike-space frame (fresh this frame)
    s.chassis.updateWorldMatrix(true, false);
    const e = s.chassis.matrixWorld.elements;
    const fx = e[0], fy = e[1], fz = e[2];
    const cf = this._cf;
    const night = this.night, G = this.G;
    const n = this._up.set(0, 1, 0).applyQuaternion(m.root.quaternion); // road normal under the bike
    const gx = rp.x, gy = rp.y, gz = rp.z;
    const hl = Math.hypot(fx, fz) || 1, hx = fx / hl, hz = fz / hl;
    const near = dist < 95;
    // the player's own lamps right under a chase camera are toned down
    const own = b.isPlayer && dist < 9 ? 0.45 : 1;
    const refl = this.wet > 0 && dist < Tq.reflDist;

    // ---- lens glare: headlights
    for (let i = 0; i < s.heads.length; i++) {
      const h = s.heads[i];
      let he = e;
      if (h.grp !== s.chassis) { h.grp.updateWorldMatrix(false, false); he = h.grp.matrixWorld.elements; }
      const x = he[0] * h.lx + he[4] * h.ly + he[8] * h.lz + he[12];
      const y = he[1] * h.lx + he[5] * h.ly + he[9] * h.lz + he[13];
      const z = he[2] * h.lx + he[6] * h.ly + he[10] * h.lz + he[14];
      const ddx = he[0] * h.dx + he[4] * h.dy + he[8] * h.dz, ddy = he[1] * h.dx + he[5] * h.dy + he[9] * h.dz, ddz = he[2] * h.dx + he[6] * h.dy + he[10] * h.dz;
      h.wx = x; h.wy = y; h.wz = z;
      const vx = cam.x - x, vy = cam.y - y, vz = cam.z - z, d = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      const facing = (ddx * vx + ddy * vy + ddz * vz) / d;
      const v = sstep(0.0, 0.92, facing);
      h.view = v * v; h.facing = facing;
      if (h.view < 0.01 || -(vx * cf.x + vy * cf.y + vz * cf.z) < 0.25) continue;
      const E = (h.k * h.view * own) / Math.max(0.0625, d * d * 0.01);
      this._glare(x, y, z, d, E, s.hc, true, 1);
      if (refl) this._reflect(x, y, z, d, gx, gy, gz, n, cam, s.hc, s.seed + i);
    }
    // ---- tail / brake lights
    const tk = I_TAIL + (I_BRAKE - I_TAIL) * brake;
    for (let i = 0; i < s.tails.length; i++) {
      const t = s.tails[i];
      let te = e;
      if (t.grp !== s.chassis) { t.grp.updateWorldMatrix(false, false); te = t.grp.matrixWorld.elements; }
      const x = te[0] * t.lx + te[4] * t.ly + te[8] * t.lz + te[12];
      const y = te[1] * t.lx + te[5] * t.ly + te[9] * t.lz + te[13];
      const z = te[2] * t.lx + te[6] * t.ly + te[10] * t.lz + te[14];
      t.wx = x; t.wy = y; t.wz = z;
      const vx = cam.x - x, vy = cam.y - y, vz = cam.z - z, d = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      const facing = -(fx * vx + fy * vy + fz * vz) / d;
      t.view = sstep(-0.3, 0.6, facing);
      if (t.view < 0.01 || -(vx * cf.x + vy * cf.y + vz * cf.z) < 0.25) continue;
      const E = (tk * t.view * own) / Math.max(0.0625, d * d * 0.01);
      this._glare(x, y, z, d, E, TAIL, false, brake);
      if (refl) this._reflect(x, y, z, d, gx, gy, gz, n, cam, TAIL, s.seed + 7 + i);
    }

    // ---- light trails (long exposure): night/dusk, or very high speed by day
    if (dist < 160) {
      const amt = night > 0.4 ? sstep(5, 28, p.v) : sstep(46, 58, p.v) * 0.3;
      for (let i = 0; i < s.trails.length; i++) this._trailUpdate(s.trails[i], s, amt, p.crashed, cam);
    }

    // ---- hot brake discs
    const discOn = dist < Tq.discDist;
    for (let i = 0; i < s.discs.length; i++) {
      const d = s.discs[i];
      const heat = d.front ? s.heatF : s.heatR;
      d.mesh.visible = discOn && heat > 0.12;
      if (d.mesh.visible) { d.mat.uniforms.uHeat.value = heat; d.mat.uniforms.uGain.value = 0.3 + 1.25 * night; }
    }

    // ---- exhaust backfire flames / electric arcs
    if (s.burstT > 0 && dist < 80) this._flames(s, e, n, gy);
    if (s.arcs && s.arcT > 0 && dist < 60 && Tq.arcs) this._arcs(s, e);

    // ---- volumetric headlight beam + light pool on the road
    if (s.beam) {
      const bi = night * (0.3 + this.scatter);
      const on = bi > 0.12 && dist < Tq.beamDist;
      s.beam.mesh.visible = on;
      if (on) {
        // camera and road plane in beam space (the lamp group's matrix is fresh from above)
        const B = s.beam, u = B.mat.uniforms;
        const inv = this._m.multiplyMatrices(B.grp.matrixWorld, B.mesh.matrix).invert();
        const c = u.uCam.value.copy(cam).applyMatrix4(inv);
        const r = (BEAM_A + (BEAM_R * clamp(c.x, 0, BEAM_L)) / BEAM_L) * 1.08;
        u.uInside.value = c.x > 0 && c.x < BEAM_L && (c.y * BEAM_KY) ** 2 + c.z * c.z < r * r ? 1 : 0;
        const pn = this._v.copy(n).transformDirection(inv), pp = this._v2.set(gx, gy, gz).applyMatrix4(inv);
        u.uPlane.value.set(pn.x, pn.y, pn.z, -pn.dot(pp));
        // looking into the lamp the glare takes over; the shaft reads from the side/behind
        u.uInt.value = 1.6 * bi * (1 - 0.8 * sstep(0.7, 0.97, s.heads[0].facing)) * (1 - sstep(0.75, 1, dist / Tq.beamDist));
      }
      // (the player's bike has a real spotlight doing this)
      if (!b.isPlayer && near && night > 0.3) {
        const c = s.hc, k = 0.11 * night;
        this.decals.add(gx + hx * 7.5, gy, gz + hz * 7.5, n.x, n.y, n.z, hx, hz, 6.5, 1.8, c[0] * k, c[1] * k, c[2] * k, 0.55);
      }
    }
    // ---- neon underglow
    if (s.neon && near) {
      const k = (0.25 + 0.95 * night) * (1 + this.wet * 0.5) * (0.9 + 0.1 * Math.sin(this.time * 2.7 + s.seed));
      const c = s.neon;
      this.decals.add(gx + hx * 0.05, gy, gz + hz * 0.05, n.x, n.y, n.z, hx, hz, m.wb * 0.8, 0.62, c[0] * k, c[1] * k, c[2] * k, 0);
    }
  }

  _hide(s) {
    for (let i = 0; i < s.discs.length; i++) s.discs[i].mesh.visible = false;
    if (s.beam) s.beam.mesh.visible = false;
  }

  // Lens glare for one lamp: hot core + halo, anamorphic streak, diffraction star.
  // E is the light reaching the lens (1 = headlight 10 m away, head-on). Sizes are worked
  // out on screen from it (a photo's glare grows with brightness, not with proximity) and
  // converted back to metres at the lamp's depth.
  _glare(x, y, z, d, E, c, head, brake) {
    const G = this.G, gl = this.glare;
    const mpp = d / this.pxK;
    const pull = Math.min(0.5 + d * 0.03, d * 0.4);
    let S = (head ? 64 : 46) * this.resK * (0.25 + 0.75 * G) * Math.pow(E, 0.4);
    let ci = (head ? 3.4 : 2.6) * (0.16 + 0.84 * G) * Math.pow(E, 0.25);
    // distant lamps stay crisp points instead of shimmering sub-pixel sprites
    const minS = (head ? 3.2 : 2.6) * this.resK;
    if (S < minS) { ci *= Math.pow(S / minS, 1.5); S = minS; }
    S = Math.min(S, this.maxS);
    this._g.S = S; this._g.I = ci;
    if (ci < 0.01) return;
    gl.add(x, y, z, c[0] * ci, c[1] * ci, c[2] * ci, 0, S * mpp, S * mpp, 0, pull);
    // horizontal anamorphic streak (blue-shifted on white lamps)
    if (G > 0.2 && S > 7) {
      const L = Math.min(S * (head ? 5.5 : 3.4 + brake * 1.2) * G, this.maxS * 3), h = Math.max(0.9, S * 0.045);
      const si = ci * 0.2 * G;
      if (head) gl.add(x, y, z, c[0] * si * 0.55, c[1] * si * 0.75, c[2] * si * 1.15, 2, L * mpp, h * mpp, 0, pull);
      else gl.add(x, y, z, c[0] * si, c[1] * si, c[2] * si, 2, L * mpp, h * mpp, 0, pull);
    }
    // six-point star (aperture diffraction) on bright lamps
    if (this.T.star && G > 0.35 && (head || brake > 0.5) && S > 12) {
      const ss = Math.min(S * (head ? 1.8 : 1.2), this.maxS * 1.5), si = ci * (head ? 0.2 : 0.12) * G;
      gl.add(x, y, z, c[0] * si, c[1] * si, c[2] * si, 1, ss * mpp, ss * mpp, 0.21, pull);
    }
  }

  // Lamp mirrored by wet asphalt: a streak from the mirror point toward the viewer, longest
  // and brightest at grazing angles (Fresnel), sized from the glare just drawn.
  _reflect(x, y, z, d, gx, gy, gz, n, cam, c, seed) {
    const hc = (cam.x - gx) * n.x + (cam.y - gy) * n.y + (cam.z - gz) * n.z;
    const hl = (x - gx) * n.x + (y - gy) * n.y + (z - gz) * n.z;
    if (hc < 0.15 || hl < 0.05) return;
    // the eye -> mirror-image ray meets the road here
    const t = hc / (hc + hl);
    const mx = x - 2 * hl * n.x, my = y - 2 * hl * n.y, mz = z - 2 * hl * n.z;
    const rx = cam.x + (mx - cam.x) * t, ry = cam.y + (my - cam.y) * t, rz = cam.z + (mz - cam.z) * t;
    const lx = cam.x - rx, ly = cam.y - ry, lz = cam.z - rz, dr = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
    const ci = 1 - hc / dr, F = 0.02 + 0.98 * ci * ci * ci * ci * ci;
    const S = this._g.S, k = this._g.I * F * this.wet * 0.75;
    if (k < 0.01) return;
    // image-plane units: pixels / pxK
    const len = (S * (2.5 + 4 * F) + 14 * this.resK) / this.pxK, hw = (S * 0.3 + 2.5 * this.resK) / this.pxK;
    this.refl.add(rx, ry, rz, n.x, n.y, n.z, c[0] * k, c[1] * k, c[2] * k, seed, hw, len, (hl * 0.9) / d);
  }

  _trailUpdate(tr, s, amt, crashed, cam) {
    const L = tr.light, buf = tr.buf, M = tr.M;
    // the rider's own trail would stream under a chase camera: keep it short
    const own = s.b.isPlayer && s.dist < 12;
    const life = tr.head ? 0.3 : own ? 0.22 : 0.45;
    if (L.wx !== undefined && amt > 0.01 && !crashed) {
      // brightness baked per sample: lamp facing and brake state at that instant
      const c = tr.head ? s.hc : TAIL;
      const k = tr.head
        ? amt * L.view * (0.2 + 0.7 * this.night) * L.k
        : amt * Math.max(0.15, L.view) * (0.5 + 1.6 * this.night) * (1 + 1.9 * s.brake);
      let o = tr.headI * 7;
      const jump = tr.n > 0 && (buf[o] - L.wx) ** 2 + (buf[o + 1] - L.wy) ** 2 + (buf[o + 2] - L.wz) ** 2 > 225;
      if (jump) tr.n = 0;
      if (tr.n === 0 || this.time - tr.lastPush >= 1 / 50) {
        tr.headI = (tr.headI + 1) % M; tr.n = Math.min(M, tr.n + 1); tr.lastPush = this.time;
        o = tr.headI * 7;
        buf[o + 3] = this.time;
      }
      buf[o] = L.wx; buf[o + 1] = L.wy; buf[o + 2] = L.wz;
      buf[o + 4] = c[0] * k; buf[o + 5] = c[1] * k; buf[o + 6] = c[2] * k;
    }
    if (tr.n < 2) return;
    // emit newest -> oldest into the ribbon scratch
    const R = this.ribbons, sp = R.sp, sw = R.sw, sc = R.sc;
    const w0 = tr.head ? 0.03 : 0.026;
    const n0 = own ? 4 : 1.5, n1 = own ? 9 : 6;
    let n = 0;
    for (let j = 0; j < tr.n && n < 64; j++) {
      const o = ((tr.headI - j + M) % M) * 7;
      const age = this.time - buf[o + 3];
      if (age > life) break;
      const x = buf[o], y = buf[o + 1], z = buf[o + 2];
      const dd = Math.sqrt((x - cam.x) ** 2 + (y - cam.y) ** 2 + (z - cam.z) ** 2);
      const f = 1 - age / life;
      // most of the energy right behind the lamp, a long faint tail
      let a = f * f * Math.sqrt(f) * sstep(n0, n1, dd);
      // never thinner than ~1.3 px (no shimmer); dim instead
      let w = w0 * (0.35 + 0.65 * f);
      const wMin = (1.3 * this.resK * dd) / this.pxK;
      if (w < wMin) { a *= w / wMin; w = wMin; }
      sp[n * 3] = x; sp[n * 3 + 1] = y; sp[n * 3 + 2] = z;
      sw[n] = w;
      sc[n * 3] = buf[o + 4] * a; sc[n * 3 + 1] = buf[o + 5] * a; sc[n * 3 + 2] = buf[o + 6] * a;
      n++;
    }
    if (n >= 2) R.flush(n);
    else if (this.time - tr.lastPush > life) tr.n = 0;
  }

  // Combustion bursts: upshift bangs and overrun crackle (throttle closed at high rpm).
  _bursts(s, dt) {
    const p = s.p, b = s.b;
    if (p.electric) {
      // regen crackle and hard-launch arcs instead of flames
      const regen = p.input.throttle < 0.05 && p.v > 8;
      const kick = s.prevThr < 0.5 && p.input.throttle > 0.85;
      s.prevThr = p.input.throttle;
      s.arcT -= dt;
      if (s.arcT <= 0 && ((regen && Math.random() < 5 * dt) || (kick && Math.random() < 0.6) || (p.nitroOn && Math.random() < 9 * dt))) s.arcT = 0.05 + Math.random() * 0.08;
      return;
    }
    s.burstT -= dt;
    let trig = 0;
    if (p.gear > s.prevGear) trig = 1;
    s.prevGear = p.gear;
    const pop = b.popT || 0;
    if (pop > 0 && s.prevPop <= 0) trig = Math.max(trig, 0.8);
    s.prevPop = pop;
    const rf = p.rpm / (p.redline || 12000);
    if (p.input.throttle < 0.06 && rf > 0.56 && p.v > 9 && !p.crashed && Math.random() < 8 * clamp((rf - 0.56) / 0.3, 0, 1) * dt) trig = Math.max(trig, 0.45 + Math.random() * 0.4);
    if (trig && s.burstT < s.burstDur * 0.4) {
      s.burstDur = 0.05 + 0.07 * trig + Math.random() * 0.03;
      s.burstT = s.burstDur;
      s.burstI = trig * (0.75 + Math.random() * 0.35);
    }
  }

  _flames(s, e, n, gy) {
    const t = clamp(s.burstT / s.burstDur, 0, 1);
    const env = Math.sin(Math.sqrt(1 - t) * Math.PI); // fast attack, quick decay
    const I = s.burstI * env;
    if (I < 0.02) return;
    const night = this.night, gl = this.glare;
    for (let i = 0; i < s.ex.length; i++) {
      const x = s.ex[i];
      const px = e[0] * x.lx + e[4] * x.ly + e[8] * x.lz + e[12];
      const py = e[1] * x.lx + e[5] * x.ly + e[9] * x.lz + e[13];
      const pz = e[2] * x.lx + e[6] * x.ly + e[10] * x.lz + e[14];
      const ax = e[0] * x.dx + e[4] * x.dy + e[8] * x.dz, ay = e[1] * x.dx + e[5] * x.dy + e[9] * x.dz, az = e[2] * x.dx + e[6] * x.dy + e[10] * x.dz;
      const flick = 0.7 + Math.random() * 0.45;
      const len = (0.16 + 0.42 * s.burstI) * (0.55 + 0.45 * env) * flick;
      const wid = (0.045 + x.r * 0.75) * (0.8 + 0.3 * flick);
      const fi = I * (1.0 + 1.7 * night) * flick;
      gl.add(px, py, pz, fi, fi, fi, 3, wid, len * 0.5, 0, 0.12, ax, ay, az, 1);
      // muzzle flash glow just clear of the silencer + blue root at the outlet
      const gi = I * (1.2 + 4.5 * night);
      const gs = 0.1 + 0.16 * I;
      gl.add(px + ax * 0.12, py + ay * 0.12, pz + az * 0.12, gi, gi * 0.42, gi * 0.12, 0, gs, gs, 0, 0.15);
      gl.add(px, py, pz, I * 0.8, I * 1.2, I * 2.4, 0, 0.05, 0.05, 0, 0.12);
      // the flash licks the asphalt at night
      if (night > 0.3) { const k = I * 0.22 * night; this.decals.add(px + ax * 0.3, gy, pz + az * 0.3, n.x, n.y, n.z, ax, az, 0.9, 0.7, k, k * 0.4, k * 0.1, 0); }
    }
  }

  // Electric: jagged energy arcs jumping across the motor covers.
  _arcs(s, e) {
    const A = s.arcs, R = this.ribbons, sp = R.sp, sw = R.sw, sc = R.sc;
    const k = (1.5 + 3.5 * this.night) * (0.7 + Math.random() * 0.6);
    for (let side = -1; side <= 1; side += 2) {
      if (Math.random() < 0.35) continue;
      const a0 = Math.random() * Math.PI * 2, a1 = a0 + (0.6 + Math.random() * 1.6) * (Math.random() < 0.5 ? -1 : 1);
      const N = 9;
      let mx = 0, my = 0, mz = 0;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const a = a0 + (a1 - a0) * t;
        const j = i === 0 || i === N - 1 ? 0 : (Math.random() - 0.5) * 0.045;
        const bulge = Math.sin(t * Math.PI);
        const rr = A.r * (0.9 + 0.25 * bulge) + j;
        const lx = A.x + Math.cos(a) * rr, ly = A.y + Math.sin(a) * rr, lz = side * (A.z + bulge * 0.02 + Math.random() * 0.008);
        const x = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
        const y = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
        const z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
        sp[i * 3] = x; sp[i * 3 + 1] = y; sp[i * 3 + 2] = z;
        sw[i] = 0.006 + Math.random() * 0.004;
        sc[i * 3] = A.c[0] * k; sc[i * 3 + 1] = A.c[1] * k; sc[i * 3 + 2] = A.c[2] * k;
        if (i === (N >> 1)) { mx = x; my = y; mz = z; }
      }
      R.flush(N);
      const gi = k * 0.5;
      this.glare.add(mx, my, mz, A.c[0] * gi, A.c[1] * gi, A.c[2] * gi, 0, 0.16, 0.16, 0, 0.15);
    }
  }

  dispose() {
    for (const o of [this.glare, this.decals, this.refl, this.ribbons]) { o.mesh.removeFromParent(); o.mesh.geometry.dispose(); o.mat.dispose(); }
    for (const s of this.st) {
      for (const d of s.discs) { d.mesh.removeFromParent(); d.mesh.geometry.dispose(); d.mat.dispose(); }
      if (s.beam) { s.beam.mesh.removeFromParent(); s.beam.mat.dispose(); }
    }
    this._beamGeo.dispose();
    releaseGlareAtlas();
    this.st = [];
  }
}
