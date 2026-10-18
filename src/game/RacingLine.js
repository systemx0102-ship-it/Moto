// Racing guidance in the style of Forza / Racing Master: chevrons painted on the
// racing line ahead of the player, coloured against the AI's own target-speed
// profile (blue = full throttle, amber = lift, red = brake), plus the corner list
// behind the HUD's route preview and corner boards. One instanced draw call; the
// chevrons are anchored to the track and only re-placed as they enter the window.
import * as THREE from 'three';
import { AIController } from './AIController.js';
import { Save } from '../core/Settings.js';
import { clamp, damp, smoothstep } from '../core/utils.js';

const GAP = 7;     // metres between chevrons (rounded so they divide the lap)
const NEAR = 3;    // fade in from here (m ahead of the bike)
const LIFT = 0.03; // above the asphalt (plus polygon offset)
// full throttle / lift / brake: linear colours for the paint, sRGB for the HUD
const PAL = [[0.06, 0.42, 1.0], [1.0, 0.5, 0.03], [1.0, 0.07, 0.04]];
const CSS = [[38, 150, 255], [255, 176, 28], [255, 50, 36]];
const mix3 = (P, t, out) => {
  const a = P[t < 1 ? 0 : 1], b = P[t < 1 ? 1 : 2], u = t < 1 ? t : t - 1;
  for (let c = 0; c < 3; c++) out[c] = a[c] + (b[c] - a[c]) * u;
  return out;
};
// HUD colours for level t = 0..2 in 1/8 steps (no per-frame string building)
export const GUIDE_CSS = Array.from({ length: 17 }, (_, k) => { const c = mix3(CSS, k / 8, [0, 0, 0]); return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; });

// Painted chevron pointing +z in a quad laid out in metres: crisp anti-aliased
// stroke with a soft halo so it still reads on a wet road at night.
const VS = /* glsl */`
  attribute vec4 iCol;
  varying vec2 vP;
  varying vec4 vCol;
  #include <fog_pars_vertex>
  void main() {
    vP = position.xz;
    vCol = iCol;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const FS = /* glsl */`
  uniform float uInt;
  varying vec2 vP;
  varying vec4 vCol;
  #include <fog_pars_fragment>
  const float HW = 1.1, TIP = 0.95, SW = 1.45, TH = 0.27;
  void main() {
    float ax = abs(vP.x);
    float k = SW / HW;
    float d = abs(vP.y - (TIP - ax * k)) / sqrt(1.0 + k * k);
    d = max(d, ax - HW);
    float aa = fwidth(d) * 0.9 + 0.004;
    float core = 1.0 - smoothstep(TH - aa, TH + aa, d);
    float halo = exp(-max(d - TH, 0.0) * 7.0) * 0.26;
    float a = max(core, halo) * vCol.a;
    if (a < 0.003) discard;
    // brighter spine, slightly darker edge: reads as glossy paint rather than a sticker
    vec3 col = vCol.rgb * uInt * mix(0.75, 1.0 + 0.3 * (1.0 - d / TH), core);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export class RacingLine {
  constructor(scene, quality, race) {
    this.scene = scene;
    this.race = race;
    const t = this.track = race.track;
    const P = race.player;
    // the very profile the AI races to, for the player's machine at top skill
    this.profile = new AIController(P.phys, t, { skill: 1, wet: !!(race.env.wet || race.env.snow) }).profile;
    let cap = 0;
    for (let i = 0; i < t.N; i++) cap = Math.max(cap, this.profile[i]);
    this.vCap = cap;
    this._findCorners();

    // ---- chevrons
    this.nK = Math.max(8, Math.round(t.L / GAP));
    this.gap = t.L / this.nK;
    this.range = quality.density < 0.6 ? 165 : 215;
    const n = this.count = Math.ceil((this.range + NEAR) / this.gap) + 1;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1.5, 0, -1.3, 1.5, 0, -1.3, -1.5, 0, 1.75, 1.5, 0, 1.75]), 3));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    this.col = new Float32Array(n * 4);
    this.colAttr = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iCol', this.colAttr);
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uInt: { value: 2 } }]),
      vertexShader: VS, fragmentShader: FS, fog: true,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6,
    });
    this.mesh = new THREE.InstancedMesh(g, this.mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3; // over skid marks
    this.mesh.visible = false;
    this.mesh.name = 'racingLine';
    scene.add(this.mesh);
    this.slotK = new Float64Array(n).fill(NaN);
    this.slotI = new Int32Array(n);
    this.lv = new Float32Array(n);
    this.vis = 0;
    this.night = !!race.ts.env.T.night;
    this._m = new THREE.Matrix4();
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._p = [{}, {}, {}];
    this._rgb = [0, 0, 0];
    this._nc = { c: null, dist: 0 };
  }

  // What the line asks for at track index i when arriving at speed v (m/s):
  // 0 = full throttle, 1 = lift, 2 = brake (continuous in between).
  level(i, v) {
    const vt = this.profile[i];
    if (vt >= this.vCap - 0.3) return 0; // unconstrained straight
    const e = v - vt;
    return clamp((e + 4) / 3, 0, 1) + clamp((e - 1) / 3, 0, 1);
  }

  // Corners worth a warning: local minima of the profile with their turn-in point
  // (where the line starts bending), direction (+1 left, -1 right) and approach speed.
  _findCorners() {
    const t = this.track, N = t.N, ds = t.ds, v = this.profile, K = t.lineK;
    const win = Math.max(1, Math.round(40 / ds));
    const list = [];
    for (let i = 0; i < N; i++) {
      const vi = v[i];
      if (vi > this.vCap * 0.92) continue;
      let min = true;
      for (let k = 1; k <= win && min; k++) if (v[(i + k) % N] < vi || v[(i - k + N) % N] <= vi) min = false;
      if (!min) continue;
      const sg = Math.sign(K[i]) || 1, kA = Math.abs(K[i]);
      let j = i;
      for (let n = 0; n < 160 / ds; n++) { const p = (j - 1 + N) % N; if (K[p] * sg < kA * 0.3) break; j = p; }
      let peak = vi;
      for (let n = 0, p = j; n < 320 / ds; n++, p = (p - 1 + N) % N) peak = Math.max(peak, v[p]);
      list.push({ i, s: j * ds, v: vi, dir: sg, drop: peak - vi, n: vi < 22 ? 3 : vi < 34 ? 2 : 1 });
    }
    this.corners = list;
  }

  // Next corner whose turn-in is still ahead of track position s (reused result).
  nextCorner(s) {
    const L = this.track.L, out = this._nc;
    out.c = null; out.dist = Infinity;
    for (const c of this.corners) {
      let d = c.s - s;
      if (d < 0) d += L;
      if (d < out.dist) { out.dist = d; out.c = c; }
    }
    return out;
  }

  // point on the racing line at arc length s
  _lp(s, o) {
    const t = this.track, f = t.wrapS(s) / t.ds;
    const i = Math.floor(f) % t.N, j = (i + 1) % t.N, u = f - Math.floor(f);
    return t.pointAt(s, t.lineD[i] + (t.lineD[j] - t.lineD[i]) * u, o);
  }

  // lay chevron k flat on the (banked, sloped) asphalt, pointing along the line
  _place(slot, k) {
    const s = k * this.gap;
    const [F, R, U, X, Z] = this._v;
    const a = this._lp(s - 1.5, this._p[0]), b = this._lp(s + 1.5, this._p[1]), c = this._lp(s, this._p[2]);
    F.set(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
    R.set(-c.tz, Math.tan(c.bank), c.tx).normalize();
    U.crossVectors(R, F).normalize();
    if (U.y < 0) U.negate();
    X.crossVectors(U, F).normalize();
    Z.crossVectors(X, U);
    this._m.makeBasis(X, U, Z).setPosition(c.x + U.x * LIFT, c.y + U.y * LIFT, c.z + U.z * LIFT);
    this.mesh.setMatrixAt(slot, this._m);
    this.slotK[slot] = k;
    this.slotI[slot] = c.i;
    return true;
  }

  update(dt) {
    const race = this.race, ph = race.player.phys;
    const on = Save.settings.racingLine !== false && (race.phase === 'race' || race.phase === 'countdown') && !ph.crashed && ph.wrongWayT < 0.5;
    this.vis = damp(this.vis, on ? 1 : 0, on ? 2.5 : 9, dt);
    if (!on && this.vis < 0.01) { this.vis = 0; this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const n = this.count, gap = this.gap, dist = ph.dist, v = ph.v;
    const k0 = Math.floor((dist + NEAR) / gap);
    let moved = false;
    for (let k = k0; k < k0 + n; k++) {
      const slot = ((k % n) + n) % n;
      if (this.slotK[slot] !== k) { moved = this._place(slot, k); this.lv[slot] = this.level(this.slotI[slot], v); }
    }
    if (moved) this.mesh.instanceMatrix.needsUpdate = true;
    const C = this.col, rgb = this._rgb, far = this.range;
    for (let slot = 0; slot < n; slot++) {
      const D = this.slotK[slot] * gap - dist;
      const lv = this.lv[slot] = damp(this.lv[slot], this.level(this.slotI[slot], v), 10, dt);
      mix3(PAL, lv, rgb);
      const o = slot * 4;
      C[o] = rgb[0]; C[o + 1] = rgb[1]; C[o + 2] = rgb[2];
      C[o + 3] = this.vis * smoothstep(NEAR, NEAR + 9, D) * (1 - smoothstep(far * 0.68, far, D)) * (0.82 + lv * 0.09);
    }
    this.colAttr.needsUpdate = true;
    // constant on-screen punch whatever the scene exposure; a touch softer at night
    const exp = race.game.engine.renderer.toneMappingExposure || 1;
    this.mat.uniforms.uInt.value = (this.night ? 0.95 : 1.25) / exp;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}
