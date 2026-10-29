// Professional race rider (v3). An athletic body in one-piece race leathers, skinned to a
// 21-bone skeleton: pelvis, lumbar spine, thorax, neck and head; clavicles so the shoulders
// shrug and roll forward; upper arm, forearm, hand and a lever-finger bone (index + middle
// on the brake / clutch lever); thigh, shin and foot. The suit carries the armour shapes
// (shoulder, elbow, hip, knee, back protector + airbag hump, padded collar), sliders,
// stretch panels, perforations, stitched seams and a team livery with sponsors, name and
// number; gauntlet gloves with carbon knuckles; race boots; a deep race helmet with its own
// graphic design, chin curtain and a smoked or iridium visor. Fictional brands and names only.
//
// Every rigid piece of gear is skinned 100 % to its bone and merged with the body by
// material, so a whole rider is five draw calls (suit, gear, boots, helmet, visor). Riders
// differ in height (±5 %) and build: the bones carry the scale and the solver uses each
// rider's own segment lengths.
//
// Animation is procedural and layered every frame on top of two-bone IK (seat under the
// pelvis, hands on the grips following the steering, balls of the feet on the pegs):
// tuck behind the screen, hang-off with the inside knee and elbow out and the head kept
// level, the knee slider reaching down to scrape the asphalt (never through it), corner
// anticipation, braking sit-up with the arms bracing and the MotoGP leg
// dangle, throttle twist, brake / clutch finger pulls, gear-lever toe flicks, rear-brake
// press, wheelie and jump stances, landing squats, spring-driven secondary motion (surge,
// heave, sway, head lag, wind buffeting), deeper tuck in a slipstream, look-into-the-corner
// and look-back head turns, glances over the shoulder on the straights and at a rival
// drawing alongside, grid ready pose
// with eyes on the start lights and a revving hand, the launch crouch over the tank,
// downshift throttle blips, a raised hand in protest after a knock from a rival, standing
// up over gravel and grass, stoppies braced on locked
// arms, visor wipes with the left glove on wet straights, idle life at a standstill
// (breathing, glances, visor wipes, hand flexes, standing up off the seat to stretch,
// cinching a glove strap with the other hand),
// victory celebrations (fist pumps, both arms up in a V with the machine stopped, the
// winner standing to point at the sky, waves to the crowd), a relaxed cool-down lap with a
// hand resting on the thigh, and crashes in world space:
// a highside flings the body over the front in a curled tumble that lands on the shoulders
// and rolls onto the back; a lowside drops it on the hip and slides it feet first. Each fall
// grinds dust and grass stains into the leathers for the rest of the race.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeCanvas, toTexture, heightToNormal } from '../core/textures.js';
import { leatherSet, grainSet, rep } from '../core/pbr.js';
import { makeTileFbm } from '../core/utils.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const V = () => new THREE.Vector3();
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const catm = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
// smooth value noise in time (for buffeting / breathing irregularity)
const noise1 = (t) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };

// body dimensions (m): a 1.78 m athlete. TL = hip joints to the base of the neck.
const B = {
  hipW: 0.094, pelvis: 0.11, spine: 0.17, chest: 0.24, neck: 0.042,
  clav: 0.165, shoulderDrop: 0.045,
  upper: 0.295, fore: 0.27, thigh: 0.44, shin: 0.44, foot: 0.2,
};
const TL = B.pelvis + B.spine + B.chest;
// riding styles: tuck = how far the rider folds onto the tank at speed, hang = hang-off,
// ext = arm extension at rest (fraction of full reach), back = allowed backward lean,
// lean0 = forward lean whenever moving, stand = how much the rider stands up off jumps,
// dangle = MotoGP leg dangle under hard braking, legOut = supermoto / MX inside leg in slides
const STYLES = {
  sport: { tuck: 1, hang: 1, ext: 0.66, back: 0, foot: [-0.085, 0.065], lean0: 0.55, stand: 0.35, dangle: 1, legOut: 0 },
  street: { tuck: 0.45, hang: 0.55, ext: 0.84, back: 0.05, foot: [-0.07, 0.07], lean0: 0.22, stand: 0.45, dangle: 0.35, legOut: 0.4 },
  mx: { tuck: 0.25, hang: 0.25, ext: 0.88, back: 0.05, foot: [-0.06, 0.075], lean0: 0.32, stand: 1, dangle: 0, legOut: 1 },
  cruiser: { tuck: 0.1, hang: 0.15, ext: 0.93, back: 0.32, foot: [-0.02, 0.08], lean0: 0, stand: 0.1, dangle: 0, legOut: 0 },
};
export const DESIGN_STYLE = {
  superbike: 'sport', gp: 'sport', twostroke: 'sport', sporttourer: 'sport', electric: 'sport', cafe: 'sport',
  naked: 'street', adventure: 'street', sm: 'street', mx: 'mx',
  cruiser: 'cruiser', bobber: 'cruiser', drag: 'cruiser',
};

// ---------------------------------------------------------------------------
// Texture atlas for the suit (1024 x 1536): torso on the top part (u round the body:
// 0 left side, .25 back, .5 right side, .75 front; v up the spine), a strip at the very top
// for the hump, limbs below in four rows (upper arm, forearm, thigh, shin) x two columns
// (left, right). Limb strips: u .5 = outer side, .25 front, 0/1 inner side, .75 back (left
// limbs are mirrored into this).
const AT = { W: 1024, H: 1536 };
const TORSO = { u0: 0, u1: 1, v0: 1 / 3, v1: 0.93 };
const HUMP = { u0: 0, u1: 0.5, v0: 0.94, v1: 1 };
const COLLAR = { u0: 0.5, u1: 1, v0: 0.94, v1: 1 };
const T_MIN = -0.15, T_MAX = 1.04; // torso ring range (fractions of TL)
const LIMB_ROWS = { upper: 3, fore: 2, thigh: 1, shin: 0 };
const limbRegion = (name, s) => {
  const r = LIMB_ROWS[name];
  return { u0: s < 0 ? 0 : 0.5, u1: s < 0 ? 0.5 : 1, v0: (r / 4) * (1 / 3), v1: ((r + 1) / 4) * (1 / 3), mirror: s < 0 };
};

// ---------------------------------------------------------------------------
// Body segment along +Y through anatomical cross-sections.
// ring: [t (of len), front, back, half-width, ox, oz, n]; `ant` = +1 when the bone's +X
// is anterior (torso), -1 for limbs (their +X points back in the rest pose).
// Rings are Catmull-Rom interpolated (sub steps) for smooth silhouettes.
function segment(len, rings, { radial = 28, sub = 3, caps = true, ant = 1, region = null, tMin, tMax } = {}) {
  const R = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[Math.max(0, i - 1)], r1 = rings[i], r2 = rings[i + 1], r3 = rings[Math.min(rings.length - 1, i + 2)];
    const steps = i === rings.length - 2 ? sub + 1 : sub;
    for (let k = 0; k < steps; k++) {
      const t = k / sub;
      const q = [];
      for (let c = 0; c < 7; c++) q.push(catm(r0[c] ?? (c === 6 ? 2.3 : 0), r1[c] ?? (c === 6 ? 2.3 : 0), r2[c] ?? (c === 6 ? 2.3 : 0), r3[c] ?? (c === 6 ? 2.3 : 0), t));
      R.push(q);
    }
  }
  const t0 = tMin ?? rings[0][0], t1 = tMax ?? rings[rings.length - 1][0];
  const pos = [], uv = [], idx = [], tv = [];
  const cols = radial + 1;
  for (const [t, f, b, w, ox, oz, nn] of R) {
    const e = 2 / Math.max(1.2, nn);
    for (let j = 0; j <= radial; j++) {
      tv.push(t);
      const a = -Math.PI / 2 - (j / radial) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const depth = c * ant > 0 ? f : b;
      pos.push(ox + depth * Math.sign(c) * Math.abs(c) ** e, t * len, oz + w * Math.sign(s) * Math.abs(s) ** e);
      let u = j / radial;
      if (region && region.mirror) u = ((0.5 - u) % 1 + 1) % 1;
      const vv = clamp((t - t0) / (t1 - t0 || 1), 0, 1);
      if (region) uv.push(region.u0 + (region.u1 - region.u0) * u, region.v0 + (region.v1 - region.v0) * vv);
      else uv.push(u, vv);
    }
  }
  for (let i = 0; i < R.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  if (caps) {
    for (const [ri, flip] of [[0, true], [R.length - 1, false]]) {
      const [t, , , , ox, oz] = R[ri];
      const ci = pos.length / 3;
      pos.push(ox, t * len, oz); uv.push(uv[ri * cols * 2], uv[ri * cols * 2 + 1]); tv.push(t);
      for (let j = 0; j < radial; j++) {
        const a = ri * cols + j;
        if (flip) idx.push(ci, a + 1, a); else idx.push(ci, a, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // weld the normals across the u seam
  const nm = g.attributes.normal;
  for (let i = 0; i < R.length; i++) {
    const a = i * cols, b = a + radial;
    const x = nm.getX(a) + nm.getX(b), y = nm.getY(a) + nm.getY(b), z = nm.getZ(a) + nm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nm.setXYZ(a, x / l, y / l, z / l); nm.setXYZ(b, x / l, y / l, z / l);
  }
  g.userData.tv = tv;
  return g;
}

// generic helpers for rigid gear (all in the owning bone's local frame)
function ellipsoid(rx, ry, rz, p = [0, 0, 0], ws = 18, hs = 12) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  g.translate(...p);
  return g;
}
function rbox(w, h, d, p, r = [0, 0, 0], round = 0.18) {
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i) / (w / 2), y = pa.getY(i) / (h / 2), z = pa.getZ(i) / (d / 2);
    // pillow the box: corners pulled in like a superellipsoid
    const k = 1 - round * (Math.abs(x * y) + Math.abs(y * z) + Math.abs(x * z)) / 3;
    pa.setXYZ(i, pa.getX(i) * k, pa.getY(i) * k, pa.getZ(i) * k);
  }
  g.computeVertexNormals();
  g.rotateX(r[0]); g.rotateY(r[1]); g.rotateZ(r[2]);
  g.translate(...p);
  return g;
}
// tube swept through points with a per-t radius (fingers, straps)
function tubeR(pts, radius, { radial = 8, seg = 10, caps = true, flat = 1 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(seg, false);
  const pos = [], idx = [], uv = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, p = curve.getPointAt(t), N = frames.normals[i], Bn = frames.binormals[i];
    const r = typeof radius === 'function' ? radius(t) : radius;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(p.x + r * (c * N.x + s * Bn.x * flat), p.y + r * (c * N.y + s * Bn.y * flat), p.z + r * (c * N.z + s * Bn.z * flat));
      uv.push(j / radial, t);
    }
  }
  const cols = radial + 1;
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) { const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1; idx.push(a, b, c, b, d, c); }
  if (caps) {
    for (const end of [0, seg]) {
      const p = curve.getPointAt(end / seg), ci = pos.length / 3;
      pos.push(p.x, p.y, p.z); uv.push(0.5, end ? 1 : 0);
      for (let j = 0; j < radial; j++) { const a = end * cols + j, b = a + 1; if (end === 0) idx.push(ci, b, a); else idx.push(ci, a, b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the Frenet frame may wind the skin inward: make it face away from the curve
  const n = g.attributes.normal, P = g.attributes.position;
  const mid = curve.getPointAt(0.5), k = Math.floor(seg / 2) * cols;
  if (n.getX(k) * (P.getX(k) - mid.x) + n.getY(k) * (P.getY(k) - mid.y) + n.getZ(k) * (P.getZ(k) - mid.z) < 0) {
    const ia = g.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}
// vertex colour for merged "gear" parts
function paint(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

// ---------------------------------------------------------------------------
// Skeleton: pelvis, lumbar spine, thorax, neck, head; per side clavicle, upper arm,
// forearm, hand, lever fingers, thigh, shin, foot (left side first).
const BONE = { pelvis: 0, spine: 1, chest: 2, neck: 3, head: 4 };
const LIMB = ['clav', 'upper', 'fore', 'hand', 'fing', 'thigh', 'shin', 'foot'];
const boneIndex = (s, name) => 5 + (s < 0 ? 0 : LIMB.length) + LIMB.indexOf(name);
// root of the index + middle fingers in hand space (hand +Y wrist -> grip, grip axis along Z)
const KNUCKLE = [-0.036, 0.08, 0];

// rest pose (rider standing, arms down): joint positions + bone frames in root space
function restPose() {
  const P = new THREE.Vector3(0, 0, 0), L = new THREE.Vector3(0, B.pelvis, 0), T = new THREE.Vector3(0, B.pelvis + B.spine, 0);
  const N = new THREE.Vector3(0, TL, 0), Hd = new THREE.Vector3(0, TL + B.neck, 0);
  const up = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const frames = [];
  const put = (i, a, b, hint) => { const o = new THREE.Object3D(); placeSeg(o, a, b, hint); o.updateMatrix(); frames[i] = o.matrix.clone(); };
  put(BONE.pelvis, P, L, Z);
  put(BONE.spine, L, T, Z);
  put(BONE.chest, T, N, Z);
  put(BONE.neck, N, Hd, Z);
  // head frame: +X forward, +Y up (as posed in update)
  { const o = new THREE.Object3D(); o.position.copy(Hd); o.updateMatrix(); frames[BONE.head] = o.matrix.clone(); }
  for (const s of [-1, 1]) {
    const c0 = new THREE.Vector3(0, TL - 0.03, s * 0.025);
    const sh = new THREE.Vector3(0, TL - B.shoulderDrop, s * (0.025 + B.clav));
    const el = sh.clone().add(new THREE.Vector3(0, -B.upper, 0)), wr = el.clone().add(new THREE.Vector3(0, -B.fore, 0));
    const hp = new THREE.Vector3(0, 0, s * B.hipW), kn = hp.clone().add(new THREE.Vector3(0, -B.thigh, 0)), an = kn.clone().add(new THREE.Vector3(0, -B.shin, 0));
    put(boneIndex(s, 'clav'), c0, sh, up);
    put(boneIndex(s, 'upper'), sh, el, Z);
    put(boneIndex(s, 'fore'), el, wr, Z);
    put(boneIndex(s, 'hand'), wr, wr.clone().add(new THREE.Vector3(0.0894, -0.0447, 0)), Z);
    frames[boneIndex(s, 'fing')] = frames[boneIndex(s, 'hand')].clone().multiply(new THREE.Matrix4().makeTranslation(...KNUCKLE));
    put(boneIndex(s, 'thigh'), hp, kn, Z);
    put(boneIndex(s, 'shin'), kn, an, Z);
    put(boneIndex(s, 'foot'), an, an.clone().add(new THREE.Vector3(B.foot, 0, 0)), up);
  }
  return frames;
}

// geometry along a bone, moved into rest space and weighted: w(t) -> [boneA, wA, boneB, wB]
function skinned(geo, rest, w) {
  const g = geo.clone();
  g.applyMatrix4(rest);
  const tv = geo.userData.tv;
  const n = g.attributes.position.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [a, wa, b, wb] = w(tv[i]);
    si[i * 4] = a; si[i * 4 + 1] = b; sw[i * 4] = wa; sw[i * 4 + 1] = wb;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return g;
}

// torso weights: pelvis -> lumbar -> thorax along the spine, the tops of the shoulders on
// the clavicles, the armpits on the upper arms, the buttocks / hip joints partly on the thighs
function skinTorso(geo, rest) {
  const g = geo.clone();
  g.applyMatrix4(rest[BONE.pelvis]);
  const tv = geo.userData.tv, p = g.attributes.position, n = p.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const t1 = B.pelvis / TL, t2 = (B.pelvis + B.spine) / TL;
  const shY = TL - B.shoulderDrop, shZ = 0.025 + B.clav;
  for (let i = 0; i < n; i++) {
    const t = tv[i];
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), s = z < 0 ? -1 : 1;
    const k1 = smooth(t1 - 0.07, t1 + 0.07, t), k2 = smooth(t2 - 0.09, t2 + 0.09, t);
    let a, wa, b, wb;
    if (t < (t1 + t2) / 2) { a = BONE.pelvis; wa = 1 - k1; b = BONE.spine; wb = k1; }
    else { a = BONE.spine; wa = 1 - k2; b = BONE.chest; wb = k2; }
    const az = Math.abs(z);
    const wClav = 0.7 * smooth(0.05, 0.15, az) * smooth(shY - 0.13, shY - 0.03, y);
    const ds = Math.hypot(x * 0.8, y - shY, z - s * shZ);
    const wUp = 0.45 * smooth(0.1, 0.03, ds) * smooth(shY + 0.03, shY - 0.05, y);
    const dh = Math.hypot(x * 0.7, y, z - s * B.hipW);
    const wTh = 0.36 * smooth(0.15, 0.05, dh) * smooth(0.06, -0.02, y);
    const wl1 = wClav + wUp > wTh ? Math.min(0.85, wClav + wUp) : 0;
    const wl2 = wl1 > 0 ? 0 : wTh;
    const keep = 1 - wl1 - wl2;
    si[i * 4] = a; si[i * 4 + 1] = b;
    sw[i * 4] = wa * keep; sw[i * 4 + 1] = wb * keep;
    if (wl1 > 0) {
      const fc = wClav / (wClav + wUp || 1);
      si[i * 4 + 2] = boneIndex(s, 'clav'); sw[i * 4 + 2] = wl1 * fc;
      si[i * 4 + 3] = boneIndex(s, 'upper'); sw[i * 4 + 3] = wl1 * (1 - fc);
    } else {
      si[i * 4 + 2] = boneIndex(s, 'thigh'); sw[i * 4 + 2] = wl2;
    }
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return g;
}
// geometry weighted by an arbitrary function of the ring parameter -> up to 4 [bone, weight]
function skinnedN(geo, rest, w) {
  const g = geo.clone();
  g.applyMatrix4(rest);
  const tv = geo.userData.tv;
  const n = g.attributes.position.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const list = w(tv[i]);
    for (let k = 0; k < Math.min(4, list.length); k++) { si[i * 4 + k] = list[k][0]; sw[i * 4 + k] = list[k][1]; }
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return g;
}

// rigid piece on one bone (authored in that bone's local frame)
function rigid(geo, rest, bone) {
  const g = geo.index ? geo : geo;
  g.applyMatrix4(rest);
  const n = g.attributes.position.count;
  const si = new Uint16Array(n * 4).fill(0), sw = new Float32Array(n * 4).fill(0);
  for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return g;
}
// blend from bone `own` toward `prev` below t0 and toward `next` above t1 (50 % at the joint)
const blend = (own, prev, next, t0 = 0.2, t1 = 0.82) => (t) => {
  if (prev !== null && t < t0) { const k = clamp(0.5 - 0.5 * (t / t0), 0, 1); return [own, 1 - k, prev, k]; }
  if (next !== null && t > t1) { const k = clamp(0.5 + 0.5 * ((t - 1) / (1 - t1)), 0, 1); return [own, 1 - k, next, k]; }
  return [own, 1, own, 0];
};

// ---------------------------------------------------------------------------
// Helmet in head space: origin at the top of the neck, +Y up, +X forward, +Z right.
// One parametric shell (crown, cheeks, integrated chin bar, rear spoiler lip, raised top
// intakes); the eye-port gasket and the visor are offsets of the same surface.
const HC = [0.014, 0.118, 0];
function helmR(dx, dy, dz) {
  const ax = dx > 0 ? 0.146 : 0.152, ay = dy > 0 ? 0.142 : 0.128, az = 0.119 + 0.004 * Math.max(0, -dy);
  let r = 1 / Math.sqrt((dx / ax) ** 2 + (dy / ay) ** 2 + (dz / az) ** 2);
  // chin bar: forward and down, a squarish snout
  r += 0.042 * smooth(0.15, 0.75, dx) * smooth(0.1, 0.65, -dy) * (1 - 0.35 * Math.abs(dz));
  // slightly flatter cheeks
  r -= 0.006 * smooth(0.6, 0.95, Math.abs(dz)) * smooth(-0.2, 0.3, -dy);
  // rear spoiler: a raised lip across the back of the crown
  r += 0.016 * Math.exp(-(((dx + 0.78) / 0.16) ** 2) - (((dy - 0.42) / 0.12) ** 2)) * Math.exp(-((dz / 0.42) ** 2));
  // the shell sweeps down toward the neck at the back
  r += 0.01 * smooth(0.3, 0.9, -dx) * smooth(-0.1, 0.5, -dy);
  // lower walls drop almost straight round the jaw and the nape (a real shell is deep)
  r += 0.03 * smooth(0.35, 0.85, -dy) * (1 - smooth(0.3, 0.9, dx));
  // twin top intakes, low scoops ahead of the crown
  for (const sz of [-1, 1]) r += 0.007 * Math.exp(-(((dx - 0.42) / 0.12) ** 2) - (((dy - 0.86) / 0.1) ** 2) - (((dz - sz * 0.2) / 0.1) ** 2));
  return r;
}
function helmetPoint(th, ph, off) {
  const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
  const r = helmR(dx, dy, dz) + off;
  return [HC[0] + dx * r, HC[1] + dy * r, HC[2] + dz * r];
}
function helmetSurf(th0, th1, ph0, ph1, nth, nph, off, uvFull, thFn = null) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nth; i++) {
    for (let j = 0; j <= nph; j++) {
      const ph = ph0 + (ph1 - ph0) * (j / nph);
      const fr = i / nth;
      const th = thFn ? thFn(fr, ph) : th0 + (th1 - th0) * fr;
      pos.push(...helmetPoint(th, ph, off));
      uv.push(uvFull ? 0.5 - ph / (Math.PI * 2) : j / nph, uvFull ? 1 - th / Math.PI : 1 - fr);
    }
  }
  for (let i = 0; i < nth; i++) for (let j = 0; j < nph; j++) {
    const a = i * (nph + 1) + j, b = a + 1, c = a + nph + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// eye port: top/bottom edge (theta) as a function of phi
const EYE = { top: (ph) => 1.13 + 0.12 * ph * ph, bot: (ph) => 1.66 - 0.06 * ph * ph, ph: 1.0 };
const VIS = { top: (ph) => 1.08 + 0.1 * ph * ph, bot: (ph) => 1.72 - 0.05 * ph * ph, ph: 1.2 };

// lower edge of the shell (theta) round the head: open under the chin, lower over the ears,
// lowest over the nape
const HB = (ph) => 2.3 + 0.15 * smooth(0.5, 1.3, Math.abs(ph)) + 0.13 * smooth(1.9, 3.0, Math.abs(ph));
function helmetGeometry() {
  const parts = { shell: [], visor: [], gear: [] };
  // shell with its eye port cut out (the gasket and visor close it)
  const shell = helmetSurf(0, 0, -Math.PI, Math.PI, 42, 64, 0, true, (fr, ph) => 0.001 + (HB(ph) - 0.001) * fr);
  {
    const p = shell.attributes.position, idx = shell.index.array, keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      let inside = 0;
      for (let k = 0; k < 3; k++) {
        const vi = idx[i + k];
        const x = p.getX(vi) - HC[0], y = p.getY(vi) - HC[1], z = p.getZ(vi) - HC[2];
        const r = Math.hypot(x, y, z), th = Math.acos(clamp(y / r, -1, 1)), ph = Math.atan2(z, x);
        if (Math.abs(ph) < EYE.ph - 0.02 && th > EYE.top(ph) + 0.015 && th < EYE.bot(ph) - 0.015) inside++;
      }
      if (inside < 3) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    shell.setIndex(keep);
  }
  parts.shell.push(shell);
  // eye-port gasket: dark rubber lip just inside the opening, recessed interior padding
  parts.gear.push(paint(helmetSurf(0, 0, -EYE.ph - 0.04, EYE.ph + 0.04, 3, 40, -0.004, false, (fr, ph) => EYE.top(ph) - 0.02 + (EYE.bot(ph) - EYE.top(ph) + 0.04) * fr), 0x0c0c0d));
  // visor: proud of the shell, pivot to pivot, with its thickness edge
  const vis = helmetSurf(0, 0, -VIS.ph, VIS.ph, 10, 40, 0.0055, false, (fr, ph) => VIS.top(ph) + (VIS.bot(ph) - VIS.top(ph)) * fr);
  parts.visor.push(vis);
  const visIn = helmetSurf(0, 0, -VIS.ph, VIS.ph, 2, 40, 0.0035, false, (fr, ph) => VIS.top(ph) + (VIS.bot(ph) - VIS.top(ph)) * fr);
  { const ia = visIn.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } visIn.computeVertexNormals(); }
  parts.visor.push(visIn);
  // visor edge trim + pull tab, tear-off posts either side
  const edge = [];
  for (let j = 0; j <= 30; j++) { const ph = -VIS.ph + (2 * VIS.ph * j) / 30; edge.push(helmetPoint(VIS.top(ph) - 0.004, ph, 0.006)); }
  parts.gear.push(paint(tubeR(edge, 0.0022, { radial: 5, seg: 30 }), 0x101012));
  const tab = rbox(0.012, 0.01, 0.03, helmetPoint(VIS.bot(-0.45) + 0.012, -0.45, 0.007), [0, 0, 0.3]);
  parts.gear.push(paint(tab, 0x101012));
  for (const s of [-1, 1]) {
    const p = helmetPoint(1.38, s * 1.02, 0.007);
    parts.gear.push(paint(new THREE.CylinderGeometry(0.0035, 0.0035, 0.009, 8).rotateX(Math.PI / 2).translate(...p), 0x1a1a1c));
    // visor pivot cover: flat oval disc on the side
    const pv = helmetPoint(1.33, s * 1.32, 0.004);
    const disc = new THREE.CylinderGeometry(0.015, 0.017, 0.004, 20).rotateX(Math.PI / 2).scale(1.3, 1, 1);
    disc.translate(...pv);
    parts.gear.push(paint(disc, 0x141416));
  }
  // top intakes: dark slots at the front of the two scoops, rear exhaust slots
  for (const s of [-1, 1]) {
    const p = helmetPoint(0.5, s * 0.42, 0.004);
    parts.gear.push(paint(rbox(0.004, 0.006, 0.026, p, [0, 0, -0.9]), 0x0d0d0e));
    const q = helmetPoint(1.75, Math.PI - s * 0.32, 0.001);
    parts.gear.push(paint(rbox(0.008, 0.01, 0.028, q, [0, 0, 0.6]), 0x0d0d0e));
  }
  // spoiler gurney lip
  { const pts = []; for (let j = 0; j <= 12; j++) { const ph = Math.PI - 0.55 + (1.1 * j) / 12; pts.push(helmetPoint(1.0, ph, 0.012)); } parts.gear.push(paint(tubeR(pts, 0.003, { radial: 5, seg: 12, flat: 0.5 }), 0x101012)); }
  // chin vent grille on the chin bar
  parts.gear.push(paint(rbox(0.006, 0.022, 0.044, helmetPoint(1.98, 0, -0.0005), [0, 0, 0.6]), 0x111113));
  for (let k = 0; k < 3; k++) parts.gear.push(paint(rbox(0.003, 0.0025, 0.04, helmetPoint(1.94 + k * 0.035, 0, 0.0025), [0, 0, 0.6]), 0x2a2b2e));
  // neck roll round the open base, liner just inside
  parts.gear.push(paint(helmetSurf(0, 0, -Math.PI, Math.PI, 3, 48, -0.008, false, (fr, ph) => HB(ph) - 0.06 + 0.12 * fr), 0x161617));
  // chin curtain: black fabric closing the opening under the chin bar
  { const cc = new THREE.CircleGeometry(1, 24).rotateX(Math.PI / 2).scale(0.064, 1, 0.072);
    cc.rotateZ(0.75).translate(0.086, 0.012, 0);
    parts.gear.push(paint(cc, 0x0e0e10)); }
  return parts;
}

// ---------------------------------------------------------------------------
// static geometry (shared by every rider), grouped by material and already skinned
let GEO = null;
function geometry() {
  if (GEO) return GEO;
  const rest = restPose();
  const out = { suit: [], gear: [], boot: [], helmet: [], visor: [] };
  // ---- torso: one surface from under the seat to the collar, anatomical sections under
  // padded leather: glutes and hip armour, waist, ribs, chest protector over the pecs,
  // shoulder blades and lats, trapezius into the collar. [t, front, back, half-width, ox, oz, n]
  const torso = segment(TL, [
    [T_MIN, 0.05, 0.068, 0.085, 0.004, 0, 2.2],
    [-0.08, 0.082, 0.118, 0.142, -0.004, 0, 2.3],
    [0.0, 0.094, 0.126, 0.16, -0.01, 0, 2.4],
    [0.09, 0.1, 0.112, 0.166, -0.014, 0, 2.5],
    [0.19, 0.1, 0.094, 0.152, -0.012, 0, 2.5],
    [0.3, 0.104, 0.09, 0.149, -0.006, 0, 2.4],
    [0.42, 0.112, 0.097, 0.157, 0.0, 0, 2.4],
    [0.54, 0.122, 0.106, 0.167, 0.004, 0, 2.45],
    [0.65, 0.131, 0.116, 0.177, 0.008, 0, 2.5],
    [0.75, 0.13, 0.122, 0.188, 0.008, 0, 2.55],
    [0.84, 0.112, 0.118, 0.189, 0.004, 0, 2.55],
    [0.91, 0.086, 0.104, 0.158, -0.004, 0, 2.45],
    [0.965, 0.066, 0.078, 0.098, -0.008, 0, 2.3],
    [1.0, 0.06, 0.066, 0.072, -0.008, 0, 2.2],
    [T_MAX, 0.058, 0.062, 0.064, -0.006, 0, 2.2],
  ], { radial: 44, sub: 3, ant: 1, region: TORSO, tMin: T_MIN, tMax: T_MAX });
  out.suit.push(skinTorso(torso, rest));
  // airbag / aero hump on the upper back, rising toward the helmet (rigid on the thorax)
  const hump = segment(0.3, [[0, 0.01, 0.012, 0.045, -0.098, 0, 2.2], [0.18, 0.03, 0.034, 0.08, -0.112, 0, 2.4], [0.45, 0.046, 0.048, 0.094, -0.126, 0, 2.5], [0.72, 0.046, 0.042, 0.086, -0.128, 0, 2.5], [0.9, 0.032, 0.026, 0.062, -0.116, 0, 2.3], [1.0, 0.012, 0.01, 0.034, -0.104, 0, 2.2]], { radial: 28, sub: 3, region: HUMP });
  hump.translate(0, 0.04, 0);
  out.suit.push(rigid(hump, rest[BONE.chest], BONE.chest));
  // tall padded collar round the neck: flared into the yoke, rolled edge on top
  const collar = segment(0.074, [[0, 0.084, 0.09, 0.088, -0.01, 0, 2.2], [0.3, 0.073, 0.079, 0.075, -0.007, 0, 2.2], [0.75, 0.065, 0.072, 0.067, -0.005, 0, 2.2], [0.93, 0.065, 0.072, 0.067, -0.005, 0, 2.2], [1, 0.06, 0.067, 0.062, -0.005, 0, 2.2]], { radial: 36, region: COLLAR });
  collar.translate(0, B.chest - 0.034, 0);
  // the rolled top follows the neck, so it stays snug when the head comes up
  out.suit.push(skinned(collar, rest[BONE.chest], (t) => { const k = 0.8 * smooth(0.3, 1, t); return [BONE.chest, 1 - k, BONE.neck, k]; }));
  // neck (balaclava) between collar and helmet
  const neck = segment(B.neck, [[-0.5, 0.05, 0.054, 0.054, 0.0, 0, 2.2], [0.5, 0.046, 0.051, 0.049, 0.003, 0, 2.2], [1.4, 0.048, 0.052, 0.05, 0.004, 0, 2.2]], { radial: 20 });
  out.gear.push(paint(skinned(neck, rest[BONE.neck], blend(BONE.neck, BONE.chest, BONE.head, 0.25, 0.8)), 0x1e1f22));

  for (const s of [-1, 1]) {
    const bi = (n) => boneIndex(s, n);
    // ---- limbs: [t, front, back, half-width, ox, oz, n]
    // upper arm: deltoid round the joint (its top rides the clavicle), biceps, elbow
    const up = segment(B.upper, [[-0.2, 0.016, 0.016, 0.016, 0, 0, 2], [-0.15, 0.052, 0.056, 0.058, 0, 0, 2.1], [-0.05, 0.072, 0.076, 0.078, 0.002, 0, 2.2], [0.1, 0.07, 0.074, 0.072, 0, 0, 2.3], [0.35, 0.064, 0.061, 0.061, 0, 0, 2.3], [0.62, 0.057, 0.055, 0.055, 0, 0, 2.2], [0.86, 0.053, 0.059, 0.055, 0, 0, 2.2], [1.04, 0.05, 0.055, 0.053, 0, 0, 2.2]], { radial: 26, ant: -1, region: limbRegion('upper', s) });
    out.suit.push(skinnedN(up, rest[bi('upper')], (t) => {
      if (t > 0.86) { const k = clamp(0.5 + 0.5 * ((t - 1) / 0.14), 0, 1); return [[bi('upper'), 1 - k], [bi('fore'), k]]; }
      const c = 0.4 * smooth(0.1, -0.15, t);
      return [[bi('upper'), 1 - c], [bi('clav'), c]];
    }));
    const fo = segment(B.fore, [[-0.08, 0.048, 0.053, 0.051, 0, 0, 2.2], [0.1, 0.055, 0.058, 0.061, 0, 0, 2.3], [0.3, 0.052, 0.052, 0.058, 0, 0, 2.3], [0.62, 0.042, 0.039, 0.047, 0, 0, 2.2], [0.85, 0.036, 0.033, 0.043, 0, 0, 2.2], [1.0, 0.033, 0.031, 0.04, 0, 0, 2.2], [1.05, 0.033, 0.031, 0.04, 0, 0, 2.2]], { radial: 24, ant: -1, region: limbRegion('fore', s) });
    out.suit.push(skinned(fo, rest[bi('fore')], blend(bi('fore'), bi('upper'), bi('hand'), 0.16, 0.95)));
    // thigh: hip ball round the joint, quads, knee
    const th = segment(B.thigh, [[-0.24, 0.02, 0.02, 0.02, 0, 0, 2], [-0.17, 0.064, 0.07, 0.068, 0, 0, 2.1], [-0.05, 0.09, 0.094, 0.088, 0, 0, 2.3], [0.2, 0.094, 0.084, 0.084, 0, 0, 2.4], [0.5, 0.083, 0.072, 0.074, 0, 0, 2.3], [0.8, 0.068, 0.06, 0.064, 0, 0, 2.3], [0.97, 0.066, 0.06, 0.063, 0, 0, 2.3], [1.07, 0.06, 0.057, 0.058, 0, 0, 2.3]], { radial: 26, ant: -1, region: limbRegion('thigh', s) });
    out.suit.push(skinned(th, rest[bi('thigh')], blend(bi('thigh'), null, bi('shin'), 0.28, 0.86)));
    const sh = segment(B.shin, [[-0.07, 0.056, 0.054, 0.055, 0, 0, 2.3], [0.08, 0.054, 0.062, 0.055, 0, 0, 2.3], [0.25, 0.05, 0.066, 0.053, 0.004, 0, 2.3], [0.45, 0.046, 0.055, 0.047, 0, 0, 2.2], [0.6, 0.042, 0.046, 0.042, 0, 0, 2.2]], { radial: 24, ant: -1, region: limbRegion('shin', s) });
    out.suit.push(skinned(sh, rest[bi('shin')], blend(bi('shin'), bi('thigh'), null, 0.16, 1)));

    // ---- armour (rigid). Limb frames: +Y down the limb, -X anterior, +Z = bike +z.
    // shoulder: domed cap with two ribs over the deltoid, outer side, plus the slider strip
    const cap = ellipsoid(0.052, 0.064, 0.027, [0, 0.0, 0], 22, 12);
    { const p = cap.attributes.position; for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) p.setZ(i, p.getZ(i) * 0.2); cap.computeVertexNormals(); }
    if (s < 0) cap.rotateY(Math.PI);
    cap.translate(0.004, 0.032, s * 0.056);
    out.suit.push(rigid(uvTo(cap, limbRegion('upper', s), 0.5, 0.1), rest[bi('upper')], bi('upper')));
    for (let k = 0; k < 2; k++) {
      const rib = rbox(0.052, 0.008, 0.006, [0.006, 0.018 + k * 0.03, s * 0.083], [0, 0, 0], 0.4);
      out.gear.push(rigid(paint(rib, 0x2d2f33), rest[bi('upper')], bi('upper')));
    }
    // elbow: armour bulge under the leather + replaceable slider puck on the point of the elbow
    const elA = ellipsoid(0.03, 0.05, 0.03, [0.04, 0.035, s * 0.008], 16, 10);
    out.suit.push(rigid(uvTo(elA, limbRegion('fore', s), 0.75, 0.08), rest[bi('fore')], bi('fore')));
    const puck = rbox(0.056, 0.016, 0.046, [0.062, 0.035, s * 0.014], [0, 0, 0], 0.3);
    puck.rotateX(s * 0.3);
    out.gear.push(rigid(paint(puck, 0x2a2b2e), rest[bi('fore')], bi('fore')));
    // hip armour: flat dome on the outside of the hip joint
    const hipA = ellipsoid(0.04, 0.065, 0.022, [0.004, 0.035, 0], 16, 10);
    { const p = hipA.attributes.position; for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) p.setZ(i, p.getZ(i) * 0.25); hipA.computeVertexNormals(); }
    if (s < 0) hipA.rotateY(Math.PI);
    hipA.translate(0, 0, s * 0.076);
    out.suit.push(rigid(uvTo(hipA, limbRegion('thigh', s), 0.5, 0.12), rest[bi('thigh')], bi('thigh')));
    // knee: armour bulge + slider on the outer side
    const kneeA = ellipsoid(0.032, 0.062, 0.054, [-0.052, 0.035, 0], 18, 10);
    out.suit.push(rigid(uvTo(kneeA, limbRegion('shin', s), 0.22, 0.02), rest[bi('shin')], bi('shin')));
    const ks = rbox(0.08, 0.018, 0.064, [-0.018, 0.035, s * 0.066], [Math.PI / 2, 0, 0], 0.28);
    out.gear.push(rigid(paint(ks, 0xdcdfe2), rest[bi('shin')], bi('shin')));
    // ---- glove (hand frame: +Y wrist -> grip, +X down/back, grip axis along Z at (0, .063));
    // the index and middle fingers ride their own bone to pull the levers
    gloveGeometry(s).forEach(([g, col, bone]) => out.gear.push(rigid(paint(g, col), rest[bi(bone)], bi(bone))));
    // ---- boot: shaft on the shin, foot shell on the foot bone
    bootGeometry(s).forEach(([g, kind, bone, col]) => {
      const tgt = kind === 'boot' ? out.boot : out.gear;
      const geo = kind === 'boot' ? g : paint(g, col);
      tgt.push(rigid(geo, rest[bi(bone)], bi(bone)));
    });
  }
  // helmet
  const H = helmetGeometry();
  for (const g of H.shell) out.helmet.push(rigid(g, rest[BONE.head], BONE.head));
  for (const g of H.visor) out.visor.push(rigid(g, rest[BONE.head], BONE.head));
  for (const g of H.gear) out.gear.push(rigid(g, rest[BONE.head], BONE.head));
  // merge per material (normalised attribute sets)
  const norm = (list, color) => list.map((g) => {
    const q = g;
    if (!q.attributes.uv) q.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
    if (color && !q.attributes.color) paint(q, 0xffffff);
    for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight', ...(color ? ['color'] : [])].includes(k)) q.deleteAttribute(k);
    if (!q.index) { const n = q.attributes.position.count; const ia = new Uint32Array(n); for (let i = 0; i < n; i++) ia[i] = i; q.setIndex(new THREE.BufferAttribute(ia, 1)); }
    return q;
  });
  GEO = {
    rest,
    suit: mergeGeometries(norm(out.suit, false)),
    gear: mergeGeometries(norm(out.gear, true)),
    boot: mergeGeometries(norm(out.boot, false)),
    helmet: mergeGeometries(norm(out.helmet, false)),
    visor: mergeGeometries(norm(out.visor, false)),
  };
  for (const k of ['suit', 'gear', 'boot', 'helmet', 'visor']) GEO[k].computeBoundingSphere();
  return GEO;
}

// map a rigid piece's UVs onto a spot of a limb strip (so armour bulges carry the suit colour)
function uvTo(g, region, u, v) {
  const uvA = g.attributes.uv;
  for (let i = 0; i < uvA.count; i++) uvA.setXY(i, region.u0 + (region.u1 - region.u0) * (u + (uvA.getX(i) - 0.5) * 0.12), region.v0 + (region.v1 - region.v0) * (v + uvA.getY(i) * 0.1));
  return g;
}

// vertex colours the gear material swaps for the team's colours (main, second, accent)
const TEAM = { main: 0xff00ff, second: 0x00ffff, accent: 0xffff00 };

// Gauntlet glove round the grip. Returns [geometry, colour, bone] in that bone's space: the
// hand body, cuff, thumb, ring + little fingers on 'hand'; index + middle (over the lever)
// on 'fing', authored relative to the knuckle so the bone can curl them.
function gloveGeometry(s) {
  const P = [];
  const GC = [0.0, 0.063]; // grip axis (x, y), along z
  const black = 0x141416, accent = 0x2b2c30, carbon = 0x1b1c1f, palm = 0x3a3b3f;
  // gauntlet cuff over the forearm, flared, with the velcro strap and a TPU wrist guard
  const cuff = segment(0.09, [[0, 0.043, 0.043, 0.048, 0, 0, 2.3], [0.55, 0.036, 0.036, 0.042, 0, 0, 2.2], [1, 0.033, 0.033, 0.039, 0, 0, 2.2]], { radial: 18 });
  cuff.translate(0, -0.09, 0);
  P.push([cuff, TEAM.main, 'hand']);
  P.push([segment(0.02, [[0, 0.039, 0.039, 0.045, 0, 0, 2.3], [1, 0.039, 0.039, 0.045, 0, 0, 2.3]], { radial: 18 }).translate(0, -0.052, 0), TEAM.second, 'hand']);
  P.push([rbox(0.01, 0.05, 0.03, [-0.04, -0.07, s * 0.02], [0, 0, 0.05], 0.4), carbon, 'hand']);
  // hand body: wrist -> knuckles, riding over the grip (back of the hand up = -X)
  const hb = segment(0.085, [[0, 0.031, 0.031, 0.041, 0.0, 0, 2.3], [0.35, 0.027, 0.025, 0.047, -0.01, 0, 2.6], [0.75, 0.019, 0.021, 0.048, -0.026, 0, 2.8], [1, 0.017, 0.019, 0.046, -0.033, 0, 2.8]], { radial: 18, ant: -1 });
  P.push([hb, black, 'hand']);
  // palm slider + carbon knuckle shell (three ridges) and the back-of-hand panel
  P.push([rbox(0.008, 0.034, 0.05, [0.02, 0.03, 0], [0, 0, -0.1], 0.4), palm, 'hand']);
  P.push([rbox(0.013, 0.031, 0.084, [-0.051, 0.072, 0], [0, 0, -0.25], 0.35), carbon, 'hand']);
  for (let k = -1; k <= 1; k++) P.push([rbox(0.004, 0.026, 0.012, [-0.058, 0.073, k * 0.024], [0, 0, -0.25], 0.4), TEAM.accent, 'hand']);
  P.push([rbox(0.008, 0.045, 0.06, [-0.046, 0.035, 0], [0, 0, -0.18], 0.4), TEAM.second, 'hand']);
  // fingers: index + middle reach forward over the lever, ring + little wrap the grip
  const K = KNUCKLE;
  for (let k = 0; k < 4; k++) {
    const z = s * [-0.026, -0.009, 0.008, 0.024][k];
    const Kz = [K[0], K[1], z];
    let pts;
    if (k < 2) {
      pts = [Kz, [-0.04, 0.1, z], [-0.032, 0.122, z], [-0.012, 0.128, z], [0.004, 0.122, z]];
    } else {
      const R = 0.027;
      pts = [Kz];
      const a0 = Math.atan2(Kz[1] - GC[1], Kz[0] - GC[0]);
      const len = k === 2 ? 2.6 : 2.25;
      for (let i = 1; i <= 5; i++) { const a = a0 - (len * i) / 5; pts.push([GC[0] + Math.cos(a) * R, GC[1] + Math.sin(a) * R, z]); }
    }
    const rad = (t) => (k === 3 ? 0.0088 : 0.0098) * (1 - 0.18 * t);
    const finger = tubeR(pts, rad, { radial: 8, seg: 12 });
    // finger armour plates on the first and second phalanx
    const plates = [];
    for (const [pi, w] of [[1, 0.016], [2, 0.012]]) {
      const q = pts[pi];
      plates.push(rbox(0.006, w, 0.013, [q[0] - 0.008, q[1], z], [0, 0, k < 2 ? -0.6 - pi * 0.3 : -1.3 - pi * 0.4], 0.4));
    }
    if (k < 2) {
      // lever fingers live on the 'fing' bone (origin at the knuckle)
      finger.translate(-K[0], -K[1], 0);
      P.push([finger, black, 'fing']);
      for (const pl of plates) { pl.translate(-K[0], -K[1], 0); P.push([pl, accent, 'fing']); }
    } else {
      P.push([finger, black, 'hand']);
      for (const pl of plates) P.push([pl, accent, 'hand']);
    }
  }
  // thumb: from the inside of the palm, under the grip
  const zt = -s * 0.038;
  P.push([tubeR([[-0.012, 0.025, zt], [0.008, 0.045, zt * 1.05], [0.024, 0.064, zt * 0.9], [0.026, 0.082, zt * 0.6]], (t) => 0.0115 * (1 - 0.2 * t), { radial: 8, seg: 10 }), black, 'hand']);
  return P;
}

// Race boot. Shin frame (shaft): +Y down the shin, -X anterior. Foot frame: +Y heel->toe,
// +Z up, +X = bike +z. Returns [geometry, 'boot' | 'gear', bone, colour].
function bootGeometry(s) {
  const P = [];
  // shaft from mid-calf to the ankle, calf brace at the back, shin plate in front
  const shaft = segment(B.shin, [[0.5, 0.05, 0.062, 0.052, 0, 0, 2.4], [0.62, 0.049, 0.064, 0.051, 0.002, 0, 2.5], [0.8, 0.045, 0.054, 0.047, 0.002, 0, 2.5], [0.95, 0.045, 0.05, 0.046, 0, 0, 2.4], [1.04, 0.048, 0.052, 0.047, 0, 0, 2.4]], { radial: 24, ant: -1 });
  P.push([shaft, 'boot', 'shin']);
  // top rim (rubber band) and shin plate
  P.push([segment(B.shin, [[0.495, 0.054, 0.066, 0.056, 0, 0, 2.4], [0.52, 0.054, 0.066, 0.056, 0, 0, 2.4]], { radial: 24, ant: -1 }), 'gear', 'shin', 0x151517]);
  const plate = rbox(0.012, 0.17, 0.06, [-0.052, B.shin * 0.73, 0], [0, 0, 0.04], 0.35);
  P.push([plate, 'gear', 'shin', TEAM.second]);
  const brace = rbox(0.014, 0.14, 0.05, [0.066, B.shin * 0.72, 0], [0, 0, -0.06], 0.35);
  P.push([brace, 'gear', 'shin', 0x1d1e21]);
  // buckles on the outer side
  for (let k = 0; k < 3; k++) {
    const y = B.shin * (0.6 + k * 0.11);
    P.push([rbox(0.03, 0.012, 0.006, [0.004, y, s * 0.057], [0, 0, 0.12], 0.3), 'gear', 'shin', 0x9ea2a8]);
  }
  // ankle brace pivot disc on the outer side
  P.push([new THREE.CylinderGeometry(0.02, 0.022, 0.006, 18).rotateX(Math.PI / 2).translate(0.006, B.shin * 0.99, s * 0.052), 'gear', 'shin', TEAM.accent]);
  // foot shell: heel cup -> instep -> toe box (x lateral, z up)
  const foot = segment(0.285, [
    [0, 0.026, 0.026, 0.026, 0, -0.01, 2.2], [0.08, 0.056, 0.058, 0.038, 0, -0.012, 2.6], [0.3, 0.052, 0.056, 0.042, 0, -0.014, 2.8],
    [0.55, 0.038, 0.046, 0.044, 0, -0.024, 3.0], [0.76, 0.03, 0.04, 0.043, 0, -0.03, 3.0], [0.92, 0.024, 0.034, 0.037, 0, -0.034, 2.8], [1.0, 0.014, 0.026, 0.02, 0, -0.04, 2.3],
  ].map(([t, up, dn, w, ox, oz, n]) => [t, up, dn, w, oz, ox, n]), { radial: 22, ant: 1 });
  // the segment is built along +Y with "front" = +X; rotate so its +X becomes +Z (up)
  foot.rotateY(-Math.PI / 2);
  foot.translate(0, -0.075, 0);
  P.push([foot, 'boot', 'foot']);
  // sole with heel step
  // sole: footprint outline (heel, waist, ball, toe) with a heel step
  const fp = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    const yy = 0.068 + 0.138 * sn; // -0.07 .. 0.206
    const t = (yy + 0.07) / 0.276;
    const w = 0.03 + 0.016 * Math.sin(Math.PI * Math.min(1, t * 1.15)) - (t > 0.35 && t < 0.55 ? 0.006 : 0);
    fp.push([w * c / Math.max(0.2, Math.abs(c) ** 0.3), yy]);
  }
  const sole = new THREE.ExtrudeGeometry(new THREE.Shape(fp.map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 1 });
  sole.translate(0, 0, -0.083);
  P.push([sole, 'gear', 'foot', 0x121213]);
  const heel = rbox(0.05, 0.06, 0.012, [0, -0.04, -0.084], [0, 0, 0], 0.3);
  P.push([heel, 'gear', 'foot', 0x121213]);
  // toe slider on the outer side of the toe box, heel cup
  P.push([rbox(0.012, 0.055, 0.026, [s * 0.04, 0.165, -0.052], [0, 0, 0.1], 0.4), 'gear', 'foot', 0xd8dbde]);
  P.push([rbox(0.07, 0.03, 0.05, [0, -0.064, -0.038], [0, 0, 0], 0.45), 'gear', 'foot', 0x26272a]);
  return P.map(([g, kind, bone, col]) => [g, kind, bone, col]);
}

// ---------------------------------------------------------------------------
// materials and textures (cached per livery + design)
const cache = new Map();
const lum = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
const SPONSORS = [
  ['NEXOL', '#ffffff', '#111111'], ['VELOX', '#ffd400', '#111111'], ['ZENTEK', '#e2231a', '#ffffff'], ['TURBOMAX', '#111111', '#ffffff'],
  ['BAYO', '#1a4fd6', '#ffffff'], ['KRYO', '#19c3e6', '#0b1a22'], ['RAYO', '#ff7a00', '#111111'], ['AURA', '#6b2bd6', '#ffffff'],
];
// fictional rider surnames for the back of the suit
const NAMES = ['VARGAS', 'MORENO', 'KAITO', 'LINDQVIST', 'DUCROS', 'BIANCHI', 'OKAFOR', 'ALVES', 'NAKAMURA', 'SCHNEIDER', 'TORRES', 'DUBOIS', 'KOWALSKI', 'HALVORSEN', 'RINALDI', 'SANTOS'];
const FONT = '"Barlow Condensed", Arial, sans-serif';

// canvas mapping helpers for the atlas (u, v in atlas space -> pixels)
const PX = (u) => u * AT.W, PY = (v) => (1 - v) * AT.H;
const torsoUV = (u, t) => [PX(TORSO.u0 + (TORSO.u1 - TORSO.u0) * u), PY(TORSO.v0 + (TORSO.v1 - TORSO.v0) * ((t - T_MIN) / (T_MAX - T_MIN)))];
const regionUV = (R, u, v) => [PX(R.u0 + (R.u1 - R.u0) * u), PY(R.v0 + (R.v1 - R.v0) * v)];
const LIMB_T = { upper: [-0.2, 1.04], fore: [-0.08, 1.05], thigh: [-0.24, 1.07], shin: [-0.07, 0.6] };
const limbUV = (name, s, u, t) => { const r = limbRegion(name, s); const [t0, t1] = LIMB_T[name]; return [PX(r.u0 + (r.u1 - r.u0) * u), PY(r.v0 + (r.v1 - r.v0) * clamp((t - t0) / (t1 - t0), 0, 1))]; };
const tp = (pts) => pts.map(([u, t]) => torsoUV(u, t));
const lp = (name, s, pts) => pts.map(([u, t]) => limbUV(name, s, u, t));
function fillPoly(g, poly) { g.beginPath(); poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }

// construction panels of the suit (leather pieces: the seams follow these), shared by the
// colour and relief maps
function suitConstruction() {
  const P = [];
  for (const uc of [0.5, 0.0, 1.0]) P.push({ kind: 'side', poly: tp([[uc - 0.1, -0.02], [uc + 0.08, -0.02], [uc + 0.07, 0.35], [uc + 0.1, 0.62], [uc + 0.06, 0.8], [uc - 0.05, 0.82], [uc - 0.08, 0.55], [uc - 0.12, 0.3]]) });
  P.push({ kind: 'yoke', poly: tp([[0, 0.86], [1, 0.86], [1, T_MAX], [0, T_MAX]]) });
  P.push({ kind: 'black', poly: tp([[0.08, T_MIN], [0.42, T_MIN], [0.4, -0.02], [0.25, 0.01], [0.1, -0.02]]) });
  P.push({ kind: 'black', poly: tp([[0.66, T_MIN], [0.84, T_MIN], [0.8, -0.07], [0.7, -0.07]]) });
  P.push({ kind: 'black', poly: tp([[0, 0.995], [1, 0.995], [1, T_MAX], [0, T_MAX]]) });
  P.push({ kind: 'backStretch', poly: tp([[0.155, 0.22], [0.345, 0.22], [0.33, 0.4], [0.17, 0.4]]) });
  P.push({ kind: 'perf', poly: tp([[0.64, 0.46], [0.86, 0.46], [0.86, 0.66], [0.64, 0.66]]) });
  P.push({ kind: 'perf', poly: tp([[0.16, 0.55], [0.34, 0.55], [0.34, 0.74], [0.16, 0.74]]) });
  for (const s of [-1, 1]) {
    for (const name of ['upper', 'fore', 'thigh', 'shin']) {
      const [t0, t1] = LIMB_T[name];
      const L = (pts) => lp(name, s, pts);
      P.push({ kind: 'limb', poly: L([[0.4, t0], [0.6, t0], [0.58, t1], [0.42, t1]]) });
      if (name === 'upper' || name === 'fore') P.push({ kind: 'stretch', poly: L([[-0.12, name === 'upper' ? 0.7 : t0], [0.12, name === 'upper' ? 0.7 : t0], [0.12, name === 'upper' ? t1 : 0.25], [-0.12, name === 'upper' ? t1 : 0.25]]) });
      if (name === 'thigh') {
        P.push({ kind: 'black', poly: L([[-0.14, 0.05], [0.14, 0.05], [0.12, 0.9], [-0.12, 0.9]]) });
        P.push({ kind: 'stretch', poly: L([[0.66, 0.82], [0.84, 0.82], [0.84, t1], [0.66, t1]]) });
        P.push({ kind: 'perf', poly: L([[0.16, 0.12], [0.34, 0.12], [0.34, 0.6], [0.16, 0.6]]) });
      }
      if (name === 'shin') P.push({ kind: 'stretch', poly: L([[0.12, t0], [0.38, t0], [0.38, 0.12], [0.12, 0.12]]) });
    }
  }
  return P;
}

// printed graphics per team design: { col: 'second' | 'accent', poly }
function suitGraphics(design) {
  const G = [];
  const limbAll = (name, s, u0, u1, ta, tb, col) => { const [t0, t1] = LIMB_T[name]; G.push({ col, poly: lp(name, s, [[u0, ta ?? t0], [u1, ta ?? t0], [u1, tb ?? t1], [u0, tb ?? t1]]) }); };
  if (design === 0) {
    // sweeping swoosh: left shoulder across the chest to the right hip, mirrored on the back
    G.push({ col: 'second', poly: tp([[0.99, 0.97], [0.9, 0.97], [0.78, 0.76], [0.66, 0.52], [0.57, 0.26], [0.52, 0.08], [0.6, 0.1], [0.69, 0.32], [0.8, 0.56], [0.92, 0.77], [1.0, 0.85]]) });
    G.push({ col: 'second', poly: tp([[0.49, 0.97], [0.4, 0.97], [0.29, 0.76], [0.17, 0.52], [0.08, 0.26], [0.02, 0.08], [0.1, 0.1], [0.19, 0.32], [0.3, 0.56], [0.42, 0.77], [0.5, 0.85]]) });
    G.push({ col: 'accent', poly: tp([[0.52, 0.08], [0.55, 0.08], [0.6, 0.24], [0.69, 0.48], [0.8, 0.72], [0.9, 0.9], [0.88, 0.92], [0.78, 0.74], [0.67, 0.5], [0.58, 0.26]]) });
    G.push({ col: 'accent', poly: tp([[0.02, 0.08], [0.05, 0.08], [0.1, 0.24], [0.19, 0.48], [0.3, 0.72], [0.4, 0.9], [0.38, 0.92], [0.28, 0.74], [0.17, 0.5], [0.08, 0.26]]) });
    for (const s of [-1, 1]) {
      for (const n of ['upper', 'fore']) limbAll(n, s, 0.3, 0.7, null, null, 'second');
      const [t0, t1] = LIMB_T.thigh;
      G.push({ col: 'second', poly: lp('thigh', s, [[0.36, t0], [0.64, t0], [0.7, 0.5], [0.6, t1], [0.4, t1], [0.3, 0.5]]) });
      G.push({ col: 'accent', poly: lp('thigh', s, [[0.3, 0.5], [0.36, 0.5], [0.44, t1], [0.4, t1]]) });
    }
  } else if (design === 1) {
    // two-tone split: upper body in the second colour with a V to the sternum
    G.push({ col: 'second', poly: tp([[0, 0.6], [0.6, 0.6], [0.75, 0.46], [0.9, 0.6], [1, 0.6], [1, T_MAX], [0, T_MAX]]) });
    G.push({ col: 'accent', poly: tp([[0, 0.58], [0.6, 0.58], [0.75, 0.44], [0.9, 0.58], [1, 0.58], [1, 0.6], [0.9, 0.6], [0.75, 0.46], [0.6, 0.6], [0, 0.6]]) });
    for (const s of [-1, 1]) {
      for (const n of ['upper', 'fore']) limbAll(n, s, -0.2, 1.2, null, null, 'second');
      limbAll('thigh', s, -0.2, 1.2, 0.72, null, 'second');
      limbAll('thigh', s, -0.2, 1.2, 0.68, 0.72, 'accent');
      limbAll('shin', s, -0.2, 1.2, null, 0.2, 'second');
    }
  } else if (design === 2) {
    // racing bands: chest band all round, accent waist band, double stripes down the limbs
    G.push({ col: 'second', poly: tp([[0, 0.6], [1, 0.6], [1, 0.75], [0, 0.75]]) });
    G.push({ col: 'accent', poly: tp([[0, 0.23], [1, 0.23], [1, 0.29], [0, 0.29]]) });
    G.push({ col: 'second', poly: tp([[0, 0.86], [1, 0.86], [1, T_MAX], [0, T_MAX]]) });
    for (const s of [-1, 1]) for (const n of ['upper', 'fore', 'thigh', 'shin']) { limbAll(n, s, 0.36, 0.46, null, null, 'second'); limbAll(n, s, 0.54, 0.64, null, null, 'accent'); }
  } else if (design === 3) {
    // arrows: stacked chevrons pointing up the chest and the back, arrowheads down the limbs
    for (const uc of [0.75, 0.25]) {
      G.push({ col: 'second', poly: tp([[uc - 0.17, 0.42], [uc, 0.7], [uc + 0.17, 0.42], [uc + 0.17, 0.3], [uc, 0.57], [uc - 0.17, 0.3]]) });
      G.push({ col: 'accent', poly: tp([[uc - 0.15, 0.52], [uc, 0.78], [uc + 0.15, 0.52], [uc + 0.15, 0.47], [uc, 0.73], [uc - 0.15, 0.47]]) });
    }
    G.push({ col: 'second', poly: tp([[0, 0.9], [1, 0.9], [1, T_MAX], [0, T_MAX]]) });
    for (const s of [-1, 1]) {
      const [u0, u1] = LIMB_T.upper, [f0] = LIMB_T.fore;
      G.push({ col: 'second', poly: lp('upper', s, [[0.3, u0], [0.7, u0], [0.7, 0.5], [0.5, 0.75], [0.3, 0.5]]) });
      G.push({ col: 'accent', poly: lp('upper', s, [[0.3, 0.6], [0.5, 0.85], [0.7, 0.6], [0.7, 0.68], [0.5, u1], [0.3, 0.68]]) });
      G.push({ col: 'second', poly: lp('fore', s, [[0.32, f0], [0.68, f0], [0.68, 0.4], [0.5, 0.62], [0.32, 0.4]]) });
      G.push({ col: 'second', poly: lp('thigh', s, [[0.28, 0.95], [0.5, 0.5], [0.72, 0.95], [0.72, 0.78], [0.5, 0.36], [0.28, 0.78]]) });
      G.push({ col: 'accent', poly: lp('thigh', s, [[0.32, 0.4], [0.5, 0.06], [0.68, 0.4], [0.68, 0.32], [0.5, -0.02], [0.32, 0.32]]) });
      limbAll('shin', s, -0.2, 1.2, null, 0.12, 'second');
    }
  } else {
    // shards: diagonal cuts across the torso, two-tone sleeves split on a slant
    G.push({ col: 'second', poly: tp([[0.5, -0.05], [0.66, -0.05], [1.0, 0.72], [0.84, 0.72]]) });
    G.push({ col: 'accent', poly: tp([[0.6, 0.5], [0.66, 0.5], [0.88, 1.0], [0.82, 1.0]]) });
    G.push({ col: 'second', poly: tp([[0.0, -0.05], [0.16, -0.05], [0.5, 0.72], [0.34, 0.72]]) });
    G.push({ col: 'accent', poly: tp([[0.1, 0.5], [0.16, 0.5], [0.38, 1.0], [0.32, 1.0]]) });
    G.push({ col: 'second', poly: tp([[0.84, 0.72], [1.0, 0.72], [1.0, T_MAX], [0.66, T_MAX]]) });
    G.push({ col: 'second', poly: tp([[0.34, 0.72], [0.5, 0.72], [0.5, T_MAX], [0.16, T_MAX]]) });
    for (const s of [-1, 1]) {
      const [u0, u1] = LIMB_T.upper, [f0, f1] = LIMB_T.fore, [t0, t1] = LIMB_T.thigh;
      G.push({ col: 'second', poly: lp('upper', s, [[-0.2, u0], [1.2, u0], [1.2, 0.55], [-0.2, 0.35]]) });
      G.push({ col: 'accent', poly: lp('fore', s, [[-0.2, 0.55], [1.2, 0.35], [1.2, 0.45], [-0.2, 0.65]]) });
      G.push({ col: 'second', poly: lp('fore', s, [[-0.2, 0.65], [1.2, 0.45], [1.2, f1], [-0.2, f1]]) });
      G.push({ col: 'second', poly: lp('thigh', s, [[-0.2, 0.62], [1.2, 0.3], [1.2, t1], [-0.2, t1]]) });
      G.push({ col: 'accent', poly: lp('thigh', s, [[-0.2, 0.55], [1.2, 0.23], [1.2, 0.29], [-0.2, 0.61]]) });
      void u1; void f0; void t0;
    }
  }
  return G;
}

function suitColorMap(main, second, accent, number, name, design) {
  const { c, g } = makeCanvas(AT.W, AT.H);
  g.fillStyle = main; g.fillRect(0, 0, AT.W, AT.H);
  const C = suitConstruction();
  const black = '#141416';
  // side panels in the second colour (black on the split design), then the team graphics
  for (const p of C) if (p.kind === 'side') { g.fillStyle = design === 1 ? black : second; fillPoly(g, p.poly); g.fill(); }
  for (const p of suitGraphics(design)) { g.fillStyle = p.col === 'second' ? second : accent; fillPoly(g, p.poly); g.fill(); }
  // subtle sheen gradient down the torso (dyed leather is never perfectly flat)
  { const [, y0] = torsoUV(0, T_MAX), [, y1] = torsoUV(0, T_MIN); const grd = g.createLinearGradient(0, y0, 0, y1); grd.addColorStop(0, 'rgba(255,255,255,0.05)'); grd.addColorStop(1, 'rgba(0,0,0,0.08)'); g.fillStyle = grd; g.fillRect(0, y0, AT.W, y1 - y0); }
  for (const p of C) {
    if (p.kind === 'black' || p.kind === 'stretch') { g.fillStyle = black; fillPoly(g, p.poly); g.fill(); }
    if (p.kind === 'backStretch') { g.fillStyle = main; fillPoly(g, p.poly); g.fill(); g.fillStyle = 'rgba(8,8,10,0.55)'; g.fill(); }
  }
  // perforated zones: darker dots
  for (const p of C) {
    if (p.kind !== 'perf') continue;
    g.save(); fillPoly(g, p.poly); g.clip();
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < AT.H; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < AT.W; x += 4) g.fillRect(x, y, 1.2, 1.2);
    g.restore();
  }
  // stitching: double rows along every construction seam
  g.setLineDash([5, 4]); g.lineWidth = 1.1;
  g.strokeStyle = lum(main) > 0.55 ? 'rgba(0,0,0,0.38)' : 'rgba(255,255,255,0.32)';
  for (const p of C) { fillPoly(g, p.poly); g.stroke(); }
  g.setLineDash([]);
  // front zip with its garage at the collar
  { const [x0, y0] = torsoUV(0.75, 0.3), [, y1] = torsoUV(0.75, 0.99); g.fillStyle = '#0d0d0f'; g.fillRect(x0 - 3, y1, 6, y0 - y1); g.fillStyle = '#6a6c70'; for (let y = y1; y < y0; y += 4) g.fillRect(x0 - 2, y, 4, 1.5); g.fillStyle = '#9a9ca0'; g.fillRect(x0 - 4, y1, 8, 10); }
  const text = (x, y, size, col, str, rot = 0, mirror = false, font = 'italic 700', maxW = 9999, stroke = null) => {
    g.save(); g.translate(x, y); g.rotate(rot); if (mirror) g.scale(-1, 1);
    g.font = `${font} ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (stroke) { g.lineWidth = Math.max(2, size * 0.08); g.strokeStyle = stroke; g.strokeText(str, 0, 0, maxW); }
    g.fillStyle = col; g.fillText(str, 0, 0, maxW); g.restore();
  };
  const ink = (bg) => (lum(bg) > 0.55 ? '#111111' : '#ffffff');
  const patch = (x, y, w, h, sp, mirror = false, round = 4) => {
    g.fillStyle = sp[1]; g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, round); g.fill();
    text(x, y + h * 0.04, Math.round(h * 0.76), sp[2], sp[0], 0, mirror, 'italic 800', w * 0.9);
  };
  const off = (number.charCodeAt(0) + number.length) % SPONSORS.length;
  const SP = (k) => SPONSORS[(off + k) % SPONSORS.length];
  // chest: team mark on the left breast, title sponsor on the right breast, belly sponsor
  { const [x, y] = torsoUV(0.84, 0.72); text(x, y, 34, ink(design === 1 ? second : main), 'MÍTICO', 0, false, 'italic 800', 110); }
  { const [x, y] = torsoUV(0.665, 0.72); patch(x, y, 86, 26, SP(0)); }
  { const [x, y] = torsoUV(0.75, 0.38); patch(x, y, 150, 34, SP(1), false, 6); }
  { const [x, y] = torsoUV(0.75, 0.2); text(x, y, 26, ink(main), SP(2)[0], 0, false, 'italic 700', 120); }
  // back: title sponsor across the shoulder blades, name over the yoke, seat sponsor
  { const [x, y] = torsoUV(0.25, 0.66); patch(x, y, 170, 44, SP(3), false, 6); }
  { const [x, y] = torsoUV(0.25, 0.92); text(x, y, 52, ink(design === 2 || design === 1 ? second : main), name, 0, false, '800', 230, design === 0 ? accent : null); }
  { const [x, y] = torsoUV(0.25, 0.06); text(x, y, 30, ink(main), SP(4)[0], 0, false, 'italic 800', 140); }
  // collar: suit colour (the yoke's on the bands design), dark rolled edge and press stud,
  // small sponsor at the front, flag stripe at the back
  { const cc = design === 2 || design === 1 ? second : main;
    const [x0, y0] = regionUV(COLLAR, 0, 1), [x1, y1] = regionUV(COLLAR, 1, 0); g.fillStyle = cc; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const [, ye] = regionUV(COLLAR, 0, 0.86); g.fillStyle = '#17181b'; g.fillRect(x0, y0, x1 - x0, ye - y0);
    const [, yb] = regionUV(COLLAR, 0, 0.08); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0, yb, x1 - x0, y1 - yb);
    const [fx, fy] = regionUV(COLLAR, 0.75, 0.45); text(fx, fy, 24, ink(cc), SP(5)[0], 0, false, 'italic 800', 96);
    const [sx, sy] = regionUV(COLLAR, 0.69, 0.62); g.fillStyle = '#8a8c90'; g.beginPath(); g.arc(sx, sy, 4, 0, Math.PI * 2); g.fill();
    const [bx, by] = regionUV(COLLAR, 0.25, 0.45); g.fillStyle = accent; g.fillRect(bx - 30, by - 8, 20, 16); g.fillStyle = second; g.fillRect(bx - 10, by - 8, 20, 16); g.fillStyle = main; g.fillRect(bx + 10, by - 8, 20, 16);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.strokeRect(bx - 30, by - 8, 60, 16); }
  // hump: big number, the name under it, accent outline
  { const [x0, y0] = regionUV(HUMP, 0, 1), [x1, y1] = regionUV(HUMP, 1, 0); g.fillStyle = design === 1 ? second : main; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const [hx, hy] = regionUV(HUMP, 0.25, 0.55); text(hx, hy, 74, ink(design === 1 ? second : main), number, 0, false, '800', 200, accent);
    const [nx, ny] = regionUV(HUMP, 0.25, 0.16); text(nx, ny, 20, ink(design === 1 ? second : main), name, 0, false, '700', 160); }
  // limbs (outer side, u .5): sponsors running down the arms and thighs; left strips are
  // mirrored, so flip the text there
  for (const s of [-1, 1]) {
    { const [ux, uy] = limbUV('upper', s, 0.5, 0.3); g.save(); g.translate(ux, uy); g.rotate(Math.PI / 2); patch(0, 0, 92, 24, SP(6), s < 0); g.restore(); }
    { const [ux, uy] = limbUV('upper', s, 0.5, 0.06); text(ux, uy, 18, ink(second), 'MÍTICO', 0, s < 0, 'italic 800', 60); }
    { const [fx, fy] = limbUV('fore', s, 0.5, 0.55); g.save(); g.translate(fx, fy); g.rotate(Math.PI / 2); patch(0, 0, 70, 20, SP(7), s < 0); g.restore(); }
    { const [tx, ty] = limbUV('thigh', s, 0.5, 0.42); g.save(); g.translate(tx, ty); g.rotate(Math.PI / 2); patch(0, 0, 150, 38, SP(2), s < 0, 6); g.restore(); }
    { const [tx, ty] = limbUV('thigh', s, 0.5, 0.1); text(tx, ty, 30, ink(main), number, 0, s < 0, '800', 60, accent); }
  }
  return toTexture(c, { wrap: false });
}

// relief + roughness for the suit atlas (shared by every livery): leather grain, panel seams
// with stitch dimples, perforations, accordion stretch ribs, creases where the joints bend
let SUIT_NR = null;
function suitReliefMaps() {
  if (SUIT_NR) return SUIT_NR;
  const W = AT.W, H = AT.H;
  const h = new Float32Array(W * H);
  const n = makeTileFbm(61, 128, 3), wn = makeTileFbm(73, 16, 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + x] = 0.5 + 0.12 * n((x / W) * 1, (y / H) * 1.5);
  const { g: mg } = makeCanvas(W, H);
  const C = suitConstruction();
  const mask = (...kinds) => {
    mg.fillStyle = '#000'; mg.fillRect(0, 0, W, H); mg.fillStyle = '#fff';
    for (const p of C) if (kinds.includes(p.kind)) { fillPoly(mg, p.poly); mg.fill(); }
    return mg.getImageData(0, 0, W, H).data;
  };
  const stretch = mask('stretch', 'backStretch'), perf = mask('perf');
  mg.fillStyle = '#000'; mg.fillRect(0, 0, W, H); mg.strokeStyle = '#fff'; mg.lineWidth = 3;
  for (const p of C) { fillPoly(mg, p.poly); mg.stroke(); }
  const seams = mg.getImageData(0, 0, W, H).data;
  // crease zones: inside of the elbows, behind the knees, the waist sides, the hip fold
  const creases = [];
  for (const s of [-1, 1]) {
    creases.push({ r: [limbUV('upper', s, 0.12, 1.04), limbUV('upper', s, 0.38, 0.72)], f: 0.62 });
    creases.push({ r: [limbUV('fore', s, 0.12, 0.25), limbUV('fore', s, 0.38, -0.08)], f: 0.62 });
    creases.push({ r: [limbUV('thigh', s, 0.62, 1.07), limbUV('thigh', s, 0.88, 0.78)], f: 0.5 });
    creases.push({ r: [limbUV('thigh', s, 0.12, 0.1), limbUV('thigh', s, 0.38, -0.24)], f: 0.45 });
  }
  for (const uc of [0.0, 0.5]) creases.push({ r: [torsoUV(uc - 0.06, 0.32), torsoUV(uc + 0.06, 0.14)], f: 0.4 });
  const rough = makeCanvas(W, H);
  const rimg = rough.g.createImageData(W, H), rd = rimg.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, k = i * 4;
    let v = h[i], r = 150;
    if (stretch[k] > 128) { v += 0.35 * Math.abs(Math.sin(y * 0.55)); r = 205; }
    if (perf[k] > 128 && (x % 4) === 0 && (y % 4) === 0) { v -= 0.35; r = 215; }
    if (seams[k] > 100) { v -= 0.45 * (seams[k] / 255); r = 170; }
    h[i] = v;
    rd[k] = r; rd[k + 1] = r; rd[k + 2] = r; rd[k + 3] = 255;
  }
  // soft folds: wavy ridges across the limb, fading to the zone edges
  for (const z of creases) {
    const x0 = Math.min(z.r[0][0], z.r[1][0]), x1 = Math.max(z.r[0][0], z.r[1][0]), y0 = Math.min(z.r[0][1], z.r[1][1]), y1 = Math.max(z.r[0][1], z.r[1][1]);
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
        const fx = (x - x0) / (x1 - x0 || 1), fy = (y - y0) / (y1 - y0 || 1);
        const edge = Math.sin(fx * Math.PI) * Math.sin(fy * Math.PI);
        const wave = Math.sin(y * z.f + wn(x / W * 4, y / H * 4) * 6);
        h[y * W + x] += 0.32 * edge * Math.max(0, wave) ** 1.5;
      }
    }
  }
  rough.g.putImageData(rimg, 0, 0);
  SUIT_NR = { normalMap: toTexture(heightToNormal(h, W, H, 3.4), { srgb: false, wrap: false }), roughnessMap: toTexture(rough.c, { srgb: false, wrap: false }) };
  return SUIT_NR;
}

function helmetColorMap(main, second, accent, number, design) {
  const W = 1024, H = 512;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = main; g.fillRect(0, 0, W, H);
  // u: 0/1 back, .25 right, .5 front, .75 left (reads correctly from outside); v: 1 crown -> base
  if (design === 0) {
    // swept side blades from the chin back over the ears, crown stripe with pinstripes
    g.fillStyle = second;
    for (const uc of [0.25, 0.75]) {
      const d = uc < 0.5 ? -1 : 1;
      g.beginPath();
      g.moveTo((0.5 + d * 0.02) * W, H * 0.62);
      g.bezierCurveTo((uc - d * 0.1) * W, H * 0.4, (uc + d * 0.1) * W, H * 0.3, (uc + d * 0.24) * W, H * 0.42);
      g.lineTo((uc + d * 0.24) * W, H * 0.6);
      g.bezierCurveTo((uc + d * 0.1) * W, H * 0.5, (uc - d * 0.02) * W, H * 0.62, (0.5 + d * 0.02) * W, H * 0.74);
      g.closePath(); g.fill();
    }
    for (const [x0, w] of [[0.5, 0.06], [0, 0.06], [1, 0.06]]) { g.fillStyle = second; g.fillRect((x0 - w / 2) * W, 0, w * W, H * 0.36); }
    g.fillStyle = accent;
    for (const x0 of [0.5, 0, 1]) { g.fillRect((x0 - 0.034) * W, 0, 5, H * 0.36); g.fillRect((x0 + 0.034) * W - 5, 0, 5, H * 0.36); }
  } else if (design === 1) {
    // chevrons pointing back over the crown, solid side panels
    for (let k = 0; k < 3; k++) {
      g.fillStyle = k === 1 ? accent : second;
      const y = H * (0.05 + k * 0.09);
      for (const [cx, d] of [[0.5, 1], [0, -1], [1, 1]]) {
        g.beginPath(); g.moveTo((cx - 0.22) * W, y + H * 0.2); g.lineTo(cx * W, y); g.lineTo((cx + 0.22) * W, y + H * 0.2);
        g.lineTo((cx + 0.22) * W, y + H * 0.26); g.lineTo(cx * W, y + H * 0.06); g.lineTo((cx - 0.22) * W, y + H * 0.26); g.closePath(); g.fill();
        void d;
      }
    }
    g.fillStyle = second;
    for (const uc of [0.25, 0.75]) g.fillRect((uc - 0.08) * W, H * 0.46, 0.16 * W, H * 0.22);
  } else if (design === 3) {
    // flames licking back from the chin bar over both sides
    for (const [col, sc, off] of [[second, 1, 0], [accent, 0.72, 0.012]]) {
      for (const uc of [0.25, 0.75]) {
        const d = uc < 0.5 ? -1 : 1;
        g.fillStyle = col;
        g.beginPath();
        g.moveTo((0.5 + d * 0.03) * W, H * 0.7);
        for (let k = 0; k <= 5; k++) {
          const ut = 0.5 + d * (0.06 + k * 0.075) * sc, peak = H * (0.36 + k * 0.03 + off * 10);
          g.quadraticCurveTo((ut - d * 0.03) * W, H * 0.5, ut * W, peak);
          g.quadraticCurveTo((ut + d * 0.01) * W, H * 0.52, (ut + d * 0.03) * W, H * 0.56);
        }
        g.lineTo((0.5 + d * 0.48 * sc) * W, H * 0.7);
        g.closePath(); g.fill();
      }
    }
  } else if (design === 4) {
    // split crown: the top half in the second colour cut by an accent blade, a centre stripe
    g.fillStyle = second; g.fillRect(0, 0, W, H * 0.3);
    g.fillStyle = accent; g.beginPath(); g.moveTo(0, H * 0.3); g.lineTo(W, H * 0.3); g.lineTo(W, H * 0.33); g.lineTo(0, H * 0.33); g.closePath(); g.fill();
    for (const uc of [0.25, 0.75]) { g.beginPath(); g.moveTo((uc - 0.12) * W, H * 0.33); g.lineTo((uc + 0.1) * W, H * 0.33); g.lineTo((uc - 0.02) * W, H * 0.52); g.closePath(); g.fill(); }
    g.fillStyle = main; for (const x0 of [0.5, 0, 1]) g.fillRect((x0 - 0.02) * W, 0, 0.04 * W, H * 0.3);
  } else {
    // flowing ribbons wrapping the shell with a field of small stars
    const band = (y0, amp, w, col) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, y0);
      for (let x = 0; x <= W; x += 16) g.lineTo(x, y0 + Math.sin((x / W) * Math.PI * 4) * amp);
      for (let x = W; x >= 0; x -= 16) g.lineTo(x, y0 + w + Math.sin((x / W) * Math.PI * 4 + 0.6) * amp);
      g.closePath(); g.fill();
    };
    band(H * 0.18, H * 0.08, H * 0.1, second);
    band(H * 0.31, H * 0.07, H * 0.04, accent);
    band(H * 0.5, H * 0.05, H * 0.08, second);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let k = 0; k < 40; k++) {
      const x = hash(k * 3.1) * W, y = H * (0.02 + hash(k * 5.7) * 0.14), r = 2 + hash(k) * 4;
      g.beginPath(); for (let p = 0; p < 10; p++) { const a = (p / 10) * Math.PI * 2, rr = p % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill();
    }
  }
  // brand above the visor and on the chin bar; number on both sides and at the back
  const ink = lum(main) > 0.55 ? '#111' : '#fff';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `italic 800 44px ${FONT}`; g.fillStyle = ink; g.fillText('MÍTICO', 0.5 * W, H * 0.39);
  g.font = `italic 700 26px ${FONT}`; g.fillText('MÍTICO', 0.5 * W, H * 0.665);
  g.font = `700 90px ${FONT}`; g.lineWidth = 6; g.strokeStyle = accent;
  // the back number straddles the seam: one copy centred on each edge, half of each shows
  g.strokeText(number, 0, H * 0.5); g.fillText(number, 0, H * 0.5); g.strokeText(number, W, H * 0.5); g.fillText(number, W, H * 0.5);
  g.font = `700 60px ${FONT}`;
  for (const uc of [0.25, 0.75]) { g.strokeText(number, uc * W, H * 0.58); g.fillText(number, uc * W, H * 0.58); }
  // sponsor stickers on the sides and the chin
  const sp = SPONSORS[number.length % SPONSORS.length], sp2 = SPONSORS[(number.length + 3) % SPONSORS.length];
  for (const uc of [0.33, 0.67]) { g.fillStyle = sp[1]; g.fillRect(uc * W - 34, H * 0.47 - 9, 68, 18); g.fillStyle = sp[2]; g.font = `italic 700 15px ${FONT}`; g.fillText(sp[0], uc * W, H * 0.47 + 1); }
  for (const uc of [0.42, 0.58]) { g.fillStyle = sp2[1]; g.fillRect(uc * W - 26, H * 0.6 - 7, 52, 14); g.fillStyle = sp2[2]; g.font = `italic 700 12px ${FONT}`; g.fillText(sp2[0], uc * W, H * 0.6 + 1); }
  // lower rim trim just above the shell's edge (which drops toward the nape)
  g.fillStyle = '#121214';
  for (let x = 0; x < W; x += 2) { const ph = (x / W - 0.5) * Math.PI * 2; g.fillRect(x, ((HB(ph) - 0.045) / Math.PI) * H, 2, H); }
  return toTexture(c, { wrap: true });
}

// grime ground into the leather by a fall: blotchy dust and grass stains that dull the sheen
// (userData.dirt.value 0..1, raised by each crash, cleared for a new race)
function dirtyLeather(mat) {
  mat.userData.dirt = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDirt = mat.userData.dirt;
    sh.fragmentShader = `uniform float uDirt;
float dH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float dN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dH(i), dH(i + vec2(1.0, 0.0)), f.x), mix(dH(i + vec2(0.0, 1.0)), dH(i + 1.0), f.x), f.y); }
` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
      float dirtM = 0.0;
      if (uDirt > 0.001) {
        float dm = dN(vMapUv * vec2(34.0, 52.0)) * 0.55 + dN(vMapUv * vec2(110.0, 170.0)) * 0.3 + dN(vMapUv * vec2(330.0, 510.0)) * 0.15;
        dirtM = smoothstep(1.0 - uDirt * 0.95, 1.0 - uDirt * 0.95 + 0.16, dm);
        vec3 grime = mix(vec3(0.16, 0.13, 0.1), vec3(0.11, 0.13, 0.07), step(0.6, dN(vMapUv * vec2(9.0, 14.0))));
        diffuseColor.rgb = mix(diffuseColor.rgb, grime, dirtM * 0.8);
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.95, dirtM);`);
  };
  mat.customProgramCacheKey = () => 'rider-suit-dirt';
  return mat;
}

// rain soaks the leathers: darker, glossier; wet gloves and boots shine
function setWet(m, wet) {
  m.suit.color.setScalar(wet ? 0.78 : 1);
  m.suit.roughness = wet ? 0.4 : 0.66;
  m.suit.clearcoat = wet ? 0.6 : 0.14;
  m.suit.clearcoatRoughness = wet ? 0.14 : 0.55;
  m.suit.sheen = wet ? 0.2 : 0.55;
  m.gear.roughness = wet ? 0.32 : 0.5;
  m.gear.clearcoat = wet ? 0.55 : 0.2;
  m.boot.roughness = wet ? 0.22 : 0.36;
}

function teamGear(mat, main, second, accent) {
  const u = { uTeamMain: { value: new THREE.Color(main) }, uTeamSecond: { value: new THREE.Color(second) }, uTeamAccent: { value: new THREE.Color(accent) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform vec3 uTeamMain;\nuniform vec3 uTeamSecond;\nuniform vec3 uTeamAccent;\n' + sh.fragmentShader.replace('#include <color_fragment>', `
      #if defined( USE_COLOR )
        vec3 vcT = vColor.rgb;
        if ( vcT.g < 0.02 && vcT.r > 0.98 && vcT.b > 0.98 ) vcT = uTeamMain;
        else if ( vcT.r < 0.02 && vcT.g > 0.98 && vcT.b > 0.98 ) vcT = uTeamSecond;
        else if ( vcT.b < 0.02 && vcT.r > 0.98 && vcT.g > 0.98 ) vcT = uTeamAccent;
        diffuseColor.rgb *= vcT;
      #endif`);
  };
  mat.customProgramCacheKey = () => 'rider-team-gear';
  return mat;
}

// visor tints: dark smoke, blue iridium, gold iridium, silver mirror
const VISORS = [
  { color: 0x0b0d11, metalness: 0.35, roughness: 0.04, iridescence: 0 },
  { color: 0x07090e, metalness: 0.92, roughness: 0.03, iridescence: 1, range: [180, 420] },
  { color: 0x0a0806, metalness: 0.92, roughness: 0.03, iridescence: 1, range: [480, 820] },
  { color: 0x3a3e46, metalness: 0.97, roughness: 0.02, iridescence: 0.25, range: [300, 500] },
];
function riderMaterials(livery, number, name, design, visor = 1) {
  const key = `${livery.base}|${livery.second}|${livery.accent}|${number}|${name}|${design}|${visor}`;
  if (cache.has(key)) return cache.get(key);
  // very dark liveries get light secondary panels so the suit still reads
  const main = livery.base;
  let second = livery.second || '#ffffff';
  if (Math.abs(lum(second) - lum(main)) < 0.12) second = lum(main) > 0.5 ? '#16171a' : '#e8e9eb';
  const accent = livery.accent || '#e2231a';
  const NR = suitReliefMaps();
  const L = leatherSet();
  const m = {
    // race leather: atlas colour + panel relief, satin sheen
    suit: dirtyLeather(new THREE.MeshPhysicalMaterial({
      map: suitColorMap(main, second, accent, number, name, design), normalMap: NR.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: NR.roughnessMap,
      roughness: 0.66, metalness: 0, clearcoat: 0.14, clearcoatRoughness: 0.55, sheen: 0.55, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x6a6a6a),
    })),
    // gloves, armour plates, sliders, soles, helmet trims: vertex-coloured, leather grain;
    // the TEAM placeholder colours become the livery's
    gear: teamGear(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05, normalMap: rep(L.normalMap, 6), normalScale: new THREE.Vector2(0.3, 0.3), clearcoat: 0.2, clearcoatRoughness: 0.5 }), main, second, accent),
    boot: new THREE.MeshPhysicalMaterial({ color: lum(main) < 0.25 ? 0xe9eaec : lum(main) > 0.7 ? 0x16171a : new THREE.Color(main).getHex(), roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.2, normalMap: rep(grainSet(19, 128, 2).normalMap, 4), normalScale: new THREE.Vector2(0.2, 0.2) }),
    helmet: new THREE.MeshPhysicalMaterial({ map: helmetColorMap(main, second, accent, number, design), roughness: 0.2, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 }),
    // visor: smoked or iridium mirror with a thin-film colour shift
    visor: (() => { const v = VISORS[visor % VISORS.length]; return new THREE.MeshPhysicalMaterial({ color: v.color, roughness: v.roughness, metalness: v.metalness, iridescence: v.iridescence, iridescenceIOR: 1.9, iridescenceThicknessRange: v.range || [280, 640], envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.0 }); })(),
  };
  cache.set(key, m);
  return m;
}

// ---------------------------------------------------------------------------
const _a = V(), _b = V(), _c = V(), _d = V(), _x = V(), _y = V(), _z = V(), _m = new THREE.Matrix4();

// orient a bone/segment from joint a toward joint b; z hint = side axis of the bend plane
function placeSeg(obj, a, b, zHint) {
  _y.subVectors(b, a).normalize();
  _z.copy(zHint).addScaledVector(_y, -_y.dot(zHint));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  obj.quaternion.setFromRotationMatrix(_m);
  obj.position.copy(a);
}

// two-bone IK: root r, target t, lengths a/b, pole direction p -> writes joint into out
const _dn = V(), _pp = V();
function ik(r, t, a, b, pole, out) {
  _dn.subVectors(t, r);
  let d = _dn.length();
  _dn.divideScalar(d || 1);
  d = clamp(d, Math.abs(a - b) + 1e-3, a + b - 1e-3);
  t.copy(r).addScaledVector(_dn, d);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _pp.copy(pole).addScaledVector(_dn, -pole.dot(_dn));
  if (_pp.lengthSq() < 1e-8) _pp.set(0, 1, 0).addScaledVector(_dn, -_dn.y);
  _pp.normalize();
  out.copy(r).addScaledVector(_dn, a * cosA).addScaledVector(_pp, a * sinA);
  return out;
}

// ---------------------------------------------------------------------------
// damped spring for secondary motion (sub-stepped; a long dt snaps to the target)
class Spring {
  constructor(k, c) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  step(target, dt) {
    if (!(dt > 0) || dt > 0.2) { this.x = target; this.v = 0; return this.x; }
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += ((target - this.x) * this.k - this.v * this.c) * h; this.x += this.v * h; }
    return this.x;
  }
}

const UP = new THREE.Vector3(0, 1, 0), ZAX = new THREE.Vector3(0, 0, 1), XAX = new THREE.Vector3(1, 0, 0);
const _P = V(), _L = V(), _T = V(), _N = V(), _e = V(), _f = V(), _g = V(), _fw = V(), _latP = V(), _latS = V(), _latC = V(), _tmp = V(), _tmp2 = V(), _hd = V(), _hz = V(), _wo = V();
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion();
// body extremities relative to the pelvis in the crash pose: helmet, hands, feet
const CRASH_PTS = [[0, 0.68, 0], [0.25, 0.42, 0.28], [0.25, 0.42, -0.28], [0.15, -0.86, 0.14], [0.15, -0.86, -0.14]];
const _cv = V(), _cp = V(), _cq = new THREE.Quaternion(), _cq2 = new THREE.Quaternion(), _cm = new THREE.Matrix4(), _cm2 = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _I4 = new THREE.Matrix4();
// idle repertoire at a standstill (duration s)
const IDLE = [['look', 2.4], ['visor', 1.7], ['flex', 1.3], ['dash', 1.5], ['stretch', 2.0], ['tank', 1.1], ['look', 2.0], ['legs', 2.2], ['gloves', 2.4]];
// standing beside the machine (showroom)
const STAND_IDLE = [['look', 2.2], ['visor', 1.6], ['flex', 1.4], ['stretch', 2.0], ['hip', 3.4], ['look', 1.8]];

export class Rider {
  // ctx: the bike's build context (seat, grips, pegs, design); groups: assembly groups
  constructor(spec, livery, ctx, groups, opts = {}) {
    const G = geometry();
    const num = String(livery.number || opts.number || spec.short.length + 20);
    const seed = [...(spec.id + num)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    this.seed = seed;
    this.name = opts.name || NAMES[seed % NAMES.length];
    const design = opts.design ?? (seed >>> 3) % 5;
    const mats = riderMaterials(livery, num, this.name, design, opts.visor ?? (seed >>> 6) % VISORS.length);
    this.mats = mats;
    mats.suit.userData.dirt.value = 0; // a clean suit for every race
    this.style = STYLES[DESIGN_STYLE[spec.design] || 'street'];
    // personal riding style: how far each rider hangs off, elbows, knee, tuck, head carriage
    const pr = (k) => hash(seed * 0.37 + k * 11.3);
    this.persona = { hang: 0.88 + 0.24 * pr(1), elbow: 0.75 + 0.5 * pr(2), knee: 0.85 + 0.3 * pr(3), tuck: 0.9 + 0.16 * pr(4), head: -0.035 + 0.07 * pr(5), lookIn: 0.7 + 0.6 * pr(6) };
    this.ctx = ctx;
    this.steer = groups.steer;
    this.root = new THREE.Group();
    this.root.name = 'rider';
    const cast = opts.castShadow !== false;
    // skeleton in the rest pose, then bind every skinned mesh to it
    this.bones = G.rest.map((mx) => {
      const b = new THREE.Bone();
      mx.decompose(b.position, b.quaternion, b.scale);
      this.root.add(b);
      return b;
    });
    this.root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(this.bones);
    this.meshes = [];
    for (const k of ['suit', 'gear', 'boot', 'helmet', 'visor']) {
      const sm = new THREE.SkinnedMesh(G[k], mats[k]);
      sm.castShadow = cast && k !== 'visor'; sm.receiveShadow = true; sm.frustumCulled = false;
      sm.name = `rider:${k}`;
      this.root.add(sm);
      sm.bind(skeleton);
      this.meshes.push(sm);
    }
    // body proportions differ between riders: height (segment lengths) and build (girth,
    // shoulder and hip width). The bones carry the scale, so the shared skinned meshes
    // stretch with them; the solver works with this rider's own lengths.
    const kH = opts.height ?? 0.95 + 0.1 * hash(seed * 0.71), kW = opts.build ?? 0.95 + 0.12 * hash(seed * 1.37);
    this.B = { ...B };
    for (const n of ['pelvis', 'spine', 'chest', 'neck', 'shoulderDrop', 'upper', 'fore', 'thigh', 'shin']) this.B[n] = B[n] * kH;
    this.B.clav = B.clav * kW; this.B.hipW = B.hipW * kW;
    for (const i of [BONE.pelvis, BONE.spine, BONE.chest]) this.bones[i].scale.set(kW, kH, kW);
    for (const sd of [-1, 1]) {
      for (const n of ['upper', 'fore', 'thigh', 'shin']) this.bones[boneIndex(sd, n)].scale.set(kW, kH, kW);
      this.bones[boneIndex(sd, 'clav')].scale.set(1, kW, 1);
    }
    // skeleton targets from the bike
    const seat = ctx.seat || { x: (ctx.pegs?.x ?? -0.2) + 0.05, y: 0.82 };
    this.seat = new THREE.Vector3(seat.x, seat.y, 0);
    this.pegs = ctx.pegs || { x: -0.2, y: 0.4, z: 0.17 };
    // grips in steering-group space (so they follow the bars)
    const grips = ctx.grips && ctx.grips.length >= 2 ? ctx.grips : [[0.45, 0.95, -0.33], [0.45, 0.95, 0.33]];
    this.steer.updateMatrix();
    const inv = this.steer.matrix.clone().invert();
    this.gripLocal = grips.map((p) => new THREE.Vector3(...p).applyMatrix4(inv));
    this.limbs = [-1, 1].map((s) => ({ s, c0: V(), sh: V(), el: V(), wr: V(), hp: V(), kn: V(), an: V(), toe: V(), grip: V() }));
    // smoothed pose state + secondary-motion springs
    this.st = {
      hang: 0, tuck: 0, brake: 0, stop: 1, crash: 0, air: 0, grid: 0, stand: 0, look: 0, thr: 0, clutch: 0, brakeF: 0,
      acc: 0, leanVel: 0, compVel: 0, pv: 0, pl: 0, pc: 0, wasAir: false,
      dangle: 0, dangleSide: 1, legOut: 0, legOutSide: 1, gear: undefined, shiftT: 0, shiftDir: 0, clutchT: 0,
      finT: -1, idleT: 0, nextAct: 0.4 + hash(seed) * 2.2, act: -1, actT: 0, actN: 0, ov: 0,
      launch: 0, wipe: 0, wipeT: 0, nextWipe: 5 + hash(seed * 4.1) * 8, glanceT: 0, nextGlance: 8 + hash(seed * 2.3) * 12, glance: 0, glanceSide: 1, glanceDur: 0.85, glanceAmp: 1.05, rivalWas: 0,
    };
    this.sp = { surge: new Spring(70, 11), heave: new Spring(160, 13), sway: new Spring(55, 9), headP: new Spring(120, 12), headR: new Spring(100, 11) };
    this.t = hash(seed * 1.7) * 10;
    this._ovP = V(); this._ovD = new THREE.Vector3(1, 0, 0);
    this.kneeDown = 0; this.kneePt = V(); // inside knee slider on the asphalt (0..1), rider space
    this._ovRP = V(); this._ovRD = new THREE.Vector3(1, 0, 0); // right arm, only with the machine stopped
    this.update({ speed: 0 }, 1);
  }

  update(s, dt) {
    if (s.stand) { this._standPose(dt); return; }
    const B = this.B; // this rider's own proportions
    if (this._standing) { this._standing = false; this.root.position.set(0, 0, 0); this.root.quaternion.identity(); }
    const st = this.st, S = this.style, bn = this.bones, sp = this.sp;
    const settle = !(dt > 0) || dt > 0.25;
    const sm = (cur, tgt, k) => (settle ? tgt : damp(cur, tgt, k, dt));
    if (!settle) this.t += dt;
    const t = this.t;
    const speed = Math.abs(s.speed || 0), lean = s.lean || 0;
    const thr = clamp(s.throttle ?? 0.5, 0, 1);
    const brk = clamp(s.brake ?? (s.braking ? 0.85 : 0), 0, 1);
    const crashed = !!s.crashed;
    const pitchB = s.pitch || 0;
    if (!!s.wet !== this._wet) { this._wet = !!s.wet; setWet(this.mats, this._wet); }
    const cr = crashed ? this._crashState(s) : null;
    const crT = cr ? Math.max(0, s.crashT || 0) : 0;
    // in the air after a highside the body curls up; on the ground it spreads out to slide
    const crAir = cr && cr.high ? 1 - smooth(cr.tLand - 0.1, cr.tLand + 0.25, crT) : 0;

    // ---------------- signals
    const comp = (s.compF || 0) + (s.compR || 0);
    if (!settle) {
      st.acc = damp(st.acc, clamp((speed - st.pv) / dt, -30, 18), 7, dt);
      st.leanVel = damp(st.leanVel, clamp((lean - st.pl) / dt, -4, 4), 9, dt);
      // the body lags the chassis: keep 60 % of a suspension movement, then spring back
      sp.heave.x += (comp - st.pc) * 0.3;
    } else { st.acc = 0; st.leanVel = 0; }
    st.pv = speed; st.pl = lean; st.pc = comp;
    if (s.gear !== undefined) {
      if (st.gear !== undefined && s.gear !== st.gear && !settle && speed > 1) {
        st.shiftT = 0.26; st.shiftDir = Math.sign(s.gear - st.gear);
        if (st.shiftDir < 0) st.clutchT = 0.22;
      }
      st.gear = s.gear;
    }
    if (s.shiftT !== undefined) { st.shiftT = s.shiftT; st.shiftDir = s.shiftDir || 1; }
    if (!settle) { st.shiftT = Math.max(0, st.shiftT - dt); st.clutchT = Math.max(0, st.clutchT - dt); }
    st.stop = sm(st.stop, speed < 0.7 && !crashed ? 1 : 0, 5);
    // landing: squat into the pegs
    if (st.wasAir && !s.airborne && !settle) sp.heave.v -= 1.6;
    // a knock from a rival or the barrier shoves the body away from it and snaps the head
    if (s.jolt > 0.02 && !settle) { sp.sway.v -= (s.joltSide || 1) * s.jolt * 1.4; sp.headR.v -= (s.joltSide || 1) * s.jolt * 3; sp.heave.v -= s.jolt * 0.6; }
    st.wasAir = !!s.airborne;
    st.air = sm(st.air, s.airborne ? 1 : 0, 7);
    st.crash = crashed ? sm(st.crash, 1, 4) : 0;
    st.grid = sm(st.grid, s.grid && speed < 1.5 ? 1 : 0, 4);
    st.look = sm(st.look, s.lookBack && !crashed ? 1 : 0, 6);
    const blip = st.clutchT > 0 ? 0.55 * Math.sin((1 - st.clutchT / 0.22) * Math.PI) : 0;
    st.thr = sm(st.thr, st.grid > 0.5 ? 0.25 + 0.35 * Math.max(0, Math.sin(t * 4.3) * Math.sin(t * 1.7 + 1)) : Math.max(thr, blip), 14);
    st.brakeF = sm(st.brakeF, brk, 16);
    st.clutch = sm(st.clutch, st.grid > 0.5 ? 0.9 : st.clutchT > 0 ? 1 : st.stop > 0.5 ? 0.25 : 0, 18);
    if (s.finished && !crashed) st.finT = st.finT < 0 ? 0 : st.finT + (settle ? 0 : dt); else st.finT = -1;
    const finT = s.celebrateT ?? st.finT;

    // ---------------- hang-off with anticipation: lead the lean, shift toward the coming corner
    const ca = clamp(s.curveAhead || 0, -1, 1);
    let hangT = clamp((lean + clamp(st.leanVel * 0.16, -0.35, 0.35)) / 0.85, -1, 1);
    hangT = clamp(hangT + ca * 0.45 * smooth(0.1, 0.5, brk) * (1 - clamp(Math.abs(lean) / 0.6, 0, 1)), -1, 1);
    st.hang = sm(st.hang, hangT * (1 - st.stop), 6);
    const pe = this.persona;
    const h = st.hang * S.hang * pe.hang, ha = Math.abs(h);
    // tuck behind the screen on the straights (deeper on nitro), not while braking or leaned over
    const cool = finT > 7.5 ? smooth(7.5, 8.5, finT) : 0; // cool-down lap after the flag
    const tuckT = (S.tuck * clamp((speed - 16) / 26, 0, 1) * (thr > 0.4 ? 1 : 0.35) * (1 - 0.85 * smooth(0.05, 0.4, brk)) * (1 - 0.6 * smooth(0.25, 0.8, Math.abs(lean))) + (s.nitro ? 0.15 * S.tuck : 0) + 0.1 * S.tuck * clamp(s.draft || 0, 0, 1)) * (1 - 0.85 * cool);
    st.tuck = sm(st.tuck, clamp(tuckT * pe.tuck, 0, 1.15) * (1 - st.stop), 2.6);
    st.brake = sm(st.brake, brk * smooth(2, 8, speed), 7);
    // MotoGP leg dangle: inside leg off the peg under hard braking into a corner
    const wantDangle = S.dangle > 0 && brk > 0.55 && speed > 20 && Math.abs(lean) < 0.32 && Math.abs(ca) > 0.25 && !crashed;
    if (wantDangle && st.dangle < 0.05) st.dangleSide = Math.sign(ca) || 1;
    if (s.dangle) { st.dangleSide = Math.sign(s.dangle); }
    st.dangle = sm(st.dangle, s.dangle ? Math.abs(s.dangle) : wantDangle ? S.dangle : 0, wantDangle ? 5 : 7);
    // supermoto / MX: inside leg forward in slides and slow turns
    const wantLegOut = S.legOut > 0 && !crashed && (s.drift || (S === STYLES.mx && Math.abs(lean) > 0.35 && speed < 25));
    if (Math.abs(lean) > 0.05) st.legOutSide = Math.sign(lean);
    st.legOut = sm(st.legOut, wantLegOut ? S.legOut : 0, 6);
    // stand on the pegs over jumps (MX most), and for a winner's celebration
    const winStand = finT >= 0 && s.place === 1 ? smooth(3.4, 3.9, finT) * (1 - smooth(5.4, 6.0, finT)) : 0;
    const offStand = s.offRoad && speed > 4 && !crashed && !s.airborne ? (S === STYLES.mx ? 0.75 : 0.22) : 0;
    st.stand = sm(st.stand, Math.max(st.air * S.stand, winStand * 0.8, offStand), 6);
    // launch: weight thrown forward over the tank to keep the front down
    st.launch = sm(st.launch, !crashed && !s.airborne && thr > 0.6 && speed < 22 && speed > 0.5 && st.acc > 4 ? 1 : 0, st.launch > 0.5 ? 2.5 : 6);
    const wheel = clamp(pitchB / 0.5, 0, 1.3);
    // stoppie: arms locked against the bars, hips back and up, the body leaning back
    const stoppie = clamp(-pitchB / 0.35, 0, 1.2);

    // ---------------- secondary motion
    const surge = sp.surge.step(clamp(-st.acc * 0.011, -0.12, 0.2) * (1 - st.stop), dt);
    const heave = sp.heave.step(0, dt);
    const sway = sp.sway.step(clamp(-st.leanVel * 0.03, -0.08, 0.08), dt);
    const headLagP = sp.headP.step(clamp(-heave * 2.5 + surge * 0.6, -0.3, 0.3), dt);
    const headLagR = sp.headR.step(clamp(-st.leanVel * 0.06, -0.2, 0.2), dt);

    // ---------------- idle life and celebrations: the left arm can leave the bar
    let ovW = 0, ovRW = 0, fingR = 0, headYaw = 0, headPitch = 0, headRoll = 0, fingL = 0, armRaise = 0, sitUp = 0, straddle = 0;
    const ov = this._ovP, ovD = this._ovD;
    if (st.stop > 0.9 && st.grid < 0.5 && !crashed && finT < 0) {
      if (!settle) {
        st.idleT += dt;
        if (st.act < 0 && st.idleT > st.nextAct) {
          st.actN++;
          st.act = Math.floor(hash(this.seed + st.actN * 7.3) * IDLE.length);
          if (s.wet && hash(st.actN * 3.1) < 0.5) st.act = -2; // wipe the rain off the visor
          st.actT = 0;
        }
        if (st.act !== -1) st.actT += dt;
      }
    } else if (!settle) { st.act = -1; st.idleT = 0; }
    if (s.idleAct !== undefined) { st.act = s.idleAct; st.actT = s.idleT ?? 0.8; }
    // breathing (visible at a standstill) and irregular glances
    const breath = Math.sin(t * 1.9) * 0.012 * st.stop;
    if (st.act !== -1 && st.stop > 0.5) {
      const kind = st.act === -2 ? 'wipe' : IDLE[st.act][0], dur = st.act === -2 ? 1.6 : IDLE[st.act][1];
      const u = st.actT / dur, env = smooth(0, 0.18, u) * (1 - smooth(0.78, 1, u));
      const side = hash(this.seed + st.actN) < 0.5 ? -1 : 1;
      if (kind === 'look') { headYaw += side * 0.85 * env; headPitch += 0.05 * env; }
      else if (kind === 'legs') { straddle = env; headPitch -= 0.1 * env; } // up off the seat, both feet down
      else if (kind === 'gloves') {
        // both hands off the bars: the right one cinches the left glove's wrist strap
        const shL = this.limbs[0].sh, shR = this.limbs[1].sh, pull = Math.sin(u * Math.PI * 5) * 0.025;
        ovW = env;
        ov.addVectors(shL, shR).multiplyScalar(0.5).add(_tmp.set(0.27, -0.16, -0.05));
        sitUp = Math.max(sitUp, 0.6 * env);
        ovD.set(0.45, 0.05, 0.9);
        ovRW = env;
        this._ovRP.copy(ov).add(_tmp.set(0.025, 0.035, 0.05 + pull));
        this._ovRD.set(0.25, 0.05, -0.95);
        fingL = 0.1; fingR = 0.7;
        headPitch -= 0.32 * env;
      }
      else if (kind === 'dash') headPitch -= 0.38 * env;
      else if (kind === 'stretch') { headRoll += Math.sin(u * Math.PI * 2) * 0.35 * env; headPitch -= 0.12 * env; }
      else if (kind === 'flex') fingL = Math.max(0, Math.sin(u * Math.PI * 4)) * 0.9 * env;
      if (kind === 'visor' || kind === 'wipe' || kind === 'tank') {
        ovW = env;
        if (kind === 'tank') { ov.set(this.seat.x + 0.28, this.seat.y + 0.13 + Math.abs(Math.sin(u * Math.PI * 3)) * 0.05, -0.06); ovD.set(0.6, -0.8, 0); }
        else {
          // fingertips to the visor: a sweep across it when wiping the rain off
          const sweep = kind === 'wipe' ? Math.sin(u * Math.PI * 2) * 0.09 : 0;
          ov.set(0, 0, 0).add(bn[BONE.head].position).add(_tmp.set(0.2, 0.1, -0.05 + sweep).applyQuaternion(bn[BONE.head].quaternion));
          ovD.set(0.2, 0.9, 0.3);
          headPitch -= 0.08 * env;
        }
      }
      if (st.actT > dur) { st.act = -1; st.idleT = 0; st.nextAct = 2.5 + hash(this.seed + st.actN * 1.3) * 4.5; }
    }
    // rain on a straight: the left glove sweeps the water off the visor now and then
    if (!settle) {
      const calmW = s.wet && speed > 18 && Math.abs(lean) < 0.1 && brk < 0.1 && !crashed && finT < 0 && st.stop < 0.1;
      if (st.wipe > 0) st.wipe = Math.max(0, st.wipe - dt);
      else if (calmW) { st.wipeT += dt; if (st.wipeT > st.nextWipe) { st.wipe = 0.75; st.wipeT = 0; st.nextWipe = 8 + hash(this.seed * 2.9 + t) * 12; } }
    }
    if (st.wipe > 0) {
      const u = 1 - st.wipe / 0.75, env = smooth(0, 0.2, u) * (1 - smooth(0.75, 1, u));
      ovW = env;
      ov.set(0, 0, 0).add(bn[BONE.head].position).add(_tmp.set(0.2, 0.09, -0.06 + Math.sin(u * Math.PI * 2) * 0.1).applyQuaternion(bn[BONE.head].quaternion));
      ovD.set(0.2, 0.9, 0.3);
    }
    // protest after a knock: the left hand leaves the bar, open palm toward the culprit,
    // the head turned to them (only upright and off the brakes)
    if (s.gripe > 0 && !crashed && Math.abs(lean) < 0.35 && brk < 0.3 && finT < 0) {
      const u = 1 - s.gripe / 1.4, env = smooth(0, 0.15, u) * (1 - smooth(0.75, 1, u));
      const side = s.gripeSide || 1, shake = Math.sin(u * Math.PI * 6) * 0.03;
      ovW = Math.max(ovW, env);
      ov.copy(this.limbs[0].sh).add(_tmp.set(0.2 + shake, 0.18 + Math.abs(shake), side > 0 ? 0.02 : -0.24));
      ovD.set(0.4, 0.75, side * 0.3);
      fingL = -0.25;
      headYaw += side * 0.7 * env;
      sitUp = Math.max(sitUp, 0.35 * env);
    }
    // victory: sit up, punch the air, the winner stands and points to the sky, then waves
    if (finT >= 0) {
      const win = s.place === 1;
      const on = smooth(0.4, 1.0, finT) * (1 - smooth(7.2, 8.2, finT));
      sitUp = on;
      // fist pumps from a bent elbow, the winner then points to the sky; everyone ends
      // waving an open hand to the crowd
      const pump = finT > 1.2 && finT < 3.5 ? Math.max(0, Math.sin((finT - 1.2) * 8.2)) : 0;
      const waving = win ? finT > 5.6 : finT > 3.5, wv = Math.sin(finT * 6.5);
      ovW = on;
      armRaise = on;
      const shL = this.limbs[0].sh;
      if (waving) {
        ov.copy(shL).add(_tmp.set(0.1, 0.36, -0.28 + 0.1 * wv));
        ovD.set(0.12, 1, -0.3 * wv);
        fingL = 0;
      } else if (win && finT >= 3.6) {
        ov.copy(shL).add(_tmp.set(0.18, 0.53, -0.08));
        ovD.set(0.25, 1, 0);
        fingL = -0.2; // index pointing up
      } else {
        ov.copy(shL).add(_tmp.set(0.12 + 0.06 * pump, 0.27 + 0.2 * pump, -0.16 - 0.05 * pump));
        ovD.set(0.1, 1, -0.1);
        fingL = 0.9;
      }
      headYaw += -0.55 * on * (finT < 5.6 ? 1 : 0.5) + (win && finT > 3.6 && finT < 5.6 ? 0.55 * on : 0);
      headPitch += (win && finT > 3.6 && finT < 5.6 ? 0.45 : 0.12) * on;
      // stopped (the podium): no throttle to hold, so both arms go up in a V, fists clenched
      if (st.stop > 0.5 && !waving) {
        ovRW = on * st.stop;
        this._ovRP.copy(this.limbs[1].sh).add(_tmp.set(0.05 + 0.03 * pump, 0.44 + 0.07 * pump, 0.22));
        this._ovRD.set(0.05, 1, 0.25);
        fingR = 0.9;
        // the left arm mirrors it (unless the winner is pointing to the sky)
        if (!(win && finT >= 3.6)) { ov.copy(this.limbs[0].sh).add(_tmp.set(0.05 + 0.03 * pump, 0.44 + 0.07 * pump, -0.22)); ovD.set(0.05, 1, -0.25); }
        headYaw *= 0.3; // facing the crowd, not one side
      }
      // cool-down lap: sitting up, relaxed, the left hand resting on the thigh now and then
      if (cool > 0) {
        sitUp = Math.max(sitUp, 0.55 * cool);
        const ru = finT > 9 ? ((finT - 9) % 6.5) / 2.6 : 2;
        if (ru < 1) {
          const env = cool * smooth(0, 0.2, ru) * (1 - smooth(0.8, 1, ru));
          ovW = Math.max(ovW, env);
          ov.copy(this.limbs[0].hp).add(_tmp.set(0.2, 0.03, -0.1));
          ovD.set(0.8, -0.5, 0.1);
          fingL = 0.3;
        }
      }
    }

    // a glance over the shoulder now and then on a straight (who's behind?); eyes up to the
    // start lights on the grid
    if (!settle) {
      const calm = speed > 25 && Math.abs(lean) < 0.12 && brk < 0.1 && st.look < 0.1 && finT < 0 && !crashed && !s.airborne;
      if (st.glance <= 0) {
        st.glanceT += calm ? dt : 0;
        if (st.glanceT > st.nextGlance) { st.glance = st.glanceDur = 0.85; st.glanceAmp = 1.05; st.glanceT = 0; st.glanceSide = hash(this.seed + t) < 0.5 ? -1 : 1; st.nextGlance = 9 + hash(this.seed * 1.7 + t) * 14; }
      } else st.glance = Math.max(0, st.glance - dt);
      // a rival drawing alongside earns a quick sideways look
      const rv = s.rival || 0;
      if (rv && rv !== st.rivalWas && st.glance <= 0 && speed > 15 && !crashed && st.look < 0.1) { st.glance = st.glanceDur = 0.7; st.glanceAmp = 0.62; st.glanceSide = rv; }
      st.rivalWas = rv;
    }
    const gla = st.glance > 0 ? Math.sin((1 - st.glance / st.glanceDur) * Math.PI) : 0;
    headYaw += st.glanceSide * st.glanceAmp * gla;
    headPitch += 0.13 * st.grid - 0.05 * gla - 0.06 * st.launch;

    // ---------------- pelvis on the seat
    const stop = st.stop, tuck = st.tuck;
    const P = _P.set(
      this.seat.x - 0.035 * ha - 0.025 * tuck + 0.05 * st.brake * (1 - ha) + surge * 0.12 + 0.03 * st.stand + 0.03 * wheel - 0.02 * sitUp + 0.045 * st.launch - 0.06 * stoppie,
      this.seat.y + 0.075 - 0.025 * ha + 0.22 * st.stand + heave - 0.004 * stop + breath * 0.3 + 0.05 * stoppie + 0.13 * straddle,
      h * 0.13 + sway * 0.5 - 0.025 * stop,
    );
    // grips follow the steering; wrists just behind and above them, the right one rolling
    // the throttle open
    this.steer.updateMatrix();
    const steerA = -(s.steerAngle || 0);
    const roll = st.thr * 0.5;
    for (const L of this.limbs) {
      L.grip.copy(this.gripLocal[L.s < 0 ? 0 : 1]).applyMatrix4(this.steer.matrix);
      _wo.set(-0.055, 0.03, 0);
      if (L.s > 0) _wo.applyAxisAngle(ZAX, roll);
      _wo.applyAxisAngle(UP, steerA);
      L.wr.copy(L.grip).add(_wo);
    }
    const gl = this.limbs[0].wr, gr = this.limbs[1].wr;

    // ---------------- spine: pelvis, lumbar and thorax pitch forward by shares of `th`,
    // bend toward the inside of the corner, the thorax twists so the outside shoulder leads
    const latBend = h * 0.42 + sway;
    let twist = -h * 0.22 + 0.5 * st.look + 0.16 * st.glanceSide * gla;
    const segDir = (a, b, out) => out.set(Math.sin(a), Math.cos(a), Math.tan(b)).normalize();
    const chain = (th) => {
      segDir(th * 0.5, latBend * 0.3, _e); _L.copy(P).addScaledVector(_e, B.pelvis);
      segDir(th * 0.95, latBend * 0.7, _f); _T.copy(_L).addScaledVector(_f, B.spine);
      segDir(th * 1.12, latBend, _g); _N.copy(_T).addScaledVector(_g, B.chest);
      return _tmp2.copy(_N).addScaledVector(_g, -B.shoulderDrop);
    };
    const ext = clamp(S.ext - 0.2 * tuck + 0.1 * st.brake + 0.04 * stop + 0.08 * st.stand + 0.05 * wheel + 0.12 * stoppie, 0.52, 0.97);
    const reach = (B.upper + B.fore) * ext;
    const gmx = (gl.x + gr.x) / 2, gmy = (gl.y + gr.y) / 2, half = Math.abs(gr.z - gl.z) / 2 - (0.025 + B.clav);
    let lo = -S.back, hi = 1.45;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const c = chain(mid);
      const dl = Math.hypot(c.x - gmx, c.y - gmy);
      if (Math.hypot(dl, half) > reach) lo = mid; else hi = mid;
    }
    const moving = clamp((speed - 1) / 7, 0, 1) * (1 - stop);
    let th = Math.max((lo + hi) / 2, tuck * S.tuck * 1.35, (S.lean0 || 0) * moving, st.grid * 0.45 * (S.lean0 > 0.3 ? 1 : 0.4));
    th += surge * 0.6 + wheel * 0.35 + breath + 0.28 * st.launch - 0.3 * stoppie;
    th = lerp(th, 0.12, sitUp * 0.85);
    th = clamp(th, -0.35, 1.5) * (1 - st.crash) + 0.55 * crAir * st.crash;
    chain(th);
    // lateral axes per segment (twist grows up the spine)
    _latP.set(0, 0, 1).addScaledVector(_e, -_e.z).normalize();
    _latS.set(Math.sin(twist * 0.45), 0, Math.cos(twist * 0.45)).addScaledVector(_f, -_f.dot(_tmp.set(Math.sin(twist * 0.45), 0, Math.cos(twist * 0.45)))).normalize();
    _latC.set(Math.sin(twist), 0, Math.cos(twist)).addScaledVector(_g, -_g.dot(_tmp.set(Math.sin(twist), 0, Math.cos(twist)))).normalize();
    placeSeg(bn[BONE.pelvis], P, _L, _latP);
    placeSeg(bn[BONE.spine], _L, _T, _latS);
    placeSeg(bn[BONE.chest], _T, _N, _latC);
    _fw.crossVectors(_g, _latC).normalize(); // thorax forward

    // ---------------- clavicles: shoulders roll forward in a tuck, lift for a raised arm
    for (const L of this.limbs) {
      const s0 = L.s;
      const prot = 0.38 * tuck + 0.12 * st.brake + 0.1 * st.grid;
      const elev = (s0 < 0 ? armRaise * 0.55 + ovW * 0.25 : ovRW * 0.8) - 0.06 + (s0 === Math.sign(h) ? -0.12 * ha : 0.06 * ha);
      L.c0.copy(_N).addScaledVector(_g, -0.03).addScaledVector(_latC, s0 * 0.025);
      _tmp.copy(_latC).multiplyScalar(s0 * Math.cos(prot)).addScaledVector(_fw, Math.sin(prot)).addScaledVector(_g, elev).normalize();
      L.sh.copy(L.c0).addScaledVector(_tmp, B.clav);
      placeSeg(bn[boneIndex(s0, 'clav')], L.c0, L.sh, _g);
    }

    // ---------------- neck and head: eyes to the horizon, into the corner, back over a shoulder
    const ext2 = clamp(0.32 - 0.14 * tuck + 0.3 * sitUp + 0.15 * st.stand, 0, 1);
    _tmp.copy(_g).multiplyScalar(1 - ext2).addScaledVector(UP, ext2).normalize();
    _tmp.applyAxisAngle(_latC, -headLagP * 0.5);
    const headPos = _tmp2.copy(_N).addScaledVector(_tmp, B.neck);
    placeSeg(bn[BONE.neck], _N, headPos, _latC);
    const head = bn[BONE.head];
    head.position.copy(headPos);
    // seen through the helmet camera (pov): no glances or idle head turns swinging the
    // player's view, softer buffeting, the head kept nearly level at a standstill
    if (this.pov) { headYaw = 0; headRoll *= 0.3; headPitch = clamp(headPitch, -0.12, 0.12); }
    const buffet = speed > 42 ? noise1(t * 9.3 + this.seed) * 0.016 * clamp((speed - 42) / 30, 0, 1) * (1 - tuck * 0.5) * (this.pov ? 0.4 : 1) : 0;
    const yaw = clamp(ca * 0.32 * pe.lookIn * (1 - stop) * (1 - st.look) + headYaw * (1 - st.look) - 1.25 * st.look, -1.4, 1.4);
    const pitchH = -0.06 + pe.head - 0.1 * tuck + 0.06 * st.brake + headPitch + headLagP * 0.4 + buffet - 0.5 * crAir * st.crash;
    const rollH = -lean * 0.55 + headRoll + headLagR + buffet * 0.6;
    _x.set(Math.cos(yaw) * Math.cos(pitchH), Math.sin(pitchH), Math.sin(yaw) * Math.cos(pitchH)).normalize();
    _y.copy(UP).applyAxisAngle(_x, rollH);
    _y.addScaledVector(_x, -_y.dot(_x)).normalize();
    _z.crossVectors(_x, _y);
    _m.makeBasis(_x, _y, _z);
    head.quaternion.setFromRotationMatrix(_m);

    // ---------------- arms: wrists on the grips (or wherever an action takes the left hand)
    for (const L of this.limbs) {
      const s0 = L.s;
      const b = (n) => bn[boneIndex(s0, n)];
      const inside = h !== 0 && Math.sign(h) === s0 ? ha : 0;
      const wrist = L.wr;
      // hand direction from the wrist toward the grip, rolled with the throttle, steered
      _hd.set(0.894, -0.447, 0);
      if (s0 > 0) _hd.applyAxisAngle(ZAX, roll);
      _hd.applyAxisAngle(UP, steerA);
      _hz.copy(ZAX).applyAxisAngle(UP, steerA);
      const w = s0 < 0 ? ovW : ovRW;
      if (w > 0.001) {
        wrist.lerp(s0 < 0 ? ov : this._ovRP, w);
        _hd.lerp(_tmp.copy(s0 < 0 ? ovD : this._ovRD).normalize(), w).normalize();
        _hz.lerp(_tmp.copy(_latC), w).normalize();
      }
      if (st.crash > 0) {
        // arms forward to protect the head in the air, then spread out to slide
        const ct = Math.min(3, crT), fl = Math.exp(-ct * 1.2);
        _tmp2.set(0.05 + 0.2 * Math.sin(ct * 9 + s0) * fl, 0.12 + 0.25 * Math.cos(ct * 7) * fl, s0 * 0.52);
        _tmp2.lerp(_c.set(0.3, -0.02, s0 * 0.26), crAir);
        wrist.lerp(_tmp.copy(L.sh).add(_tmp2), st.crash);
      }
      // elbows out and down; tucked in on a straight; the inside one drops in a corner and
      // the outside forearm comes in to rest along the tank
      const outside = ha - inside;
      _a.set(-0.35 - 0.25 * tuck, -1 - 0.6 * inside - 0.25 * outside, s0 * ((0.55 - 0.25 * tuck) * pe.elbow * (1 - 0.8 * outside) + 0.45 * inside - 0.35 * outside));
      ik(L.sh, wrist, B.upper, B.fore, _a, L.el);
      placeSeg(b('upper'), L.sh, L.el, ZAX);
      placeSeg(b('fore'), L.el, wrist, ZAX);
      _tmp.copy(wrist).add(_hd);
      placeSeg(b('hand'), wrist, _tmp, _hz);
      // lever fingers: brake (right) and clutch (left); a fist or a pointing finger when raised
      const hand = b('hand'), fing = b('fing');
      const curl = s0 > 0 ? Math.max(st.brakeF * 0.42, fingR) : Math.max(st.clutch * 0.5, fingL);
      fing.position.set(...KNUCKLE).applyQuaternion(hand.quaternion).add(hand.position);
      _qa.setFromAxisAngle(ZAX, -curl);
      fing.quaternion.copy(hand.quaternion).multiply(_qa);
    }

    // ---------------- legs: balls of the feet on the pegs, knees into the tank
    const pg = this.pegs;
    this.kneeDown = 0;
    for (const L of this.limbs) {
      const s0 = L.s;
      const b = (n) => bn[boneIndex(s0, n)];
      const inside = h !== 0 && Math.sign(h) === s0 ? ha : 0;
      L.hp.copy(P).addScaledVector(_latP, s0 * B.hipW).addScaledVector(_e, 0.02);
      const ankle = L.an.set(pg.x + S.foot[0], pg.y + S.foot[1], s0 * (pg.z + 0.035));
      let toeLift = 0, toeOut = 0;
      // gear lever (left toe) and rear brake (right toe)
      if (s0 < 0 && st.shiftT > 0) toeLift = Math.sin((1 - st.shiftT / 0.26) * Math.PI) * (st.shiftDir > 0 ? 0.045 : -0.035);
      if (s0 > 0) toeLift -= 0.025 * st.brake;
      // MotoGP leg dangle: off the peg, out and forward, fluttering in the wind
      if (st.dangle > 0.001 && s0 === st.dangleSide) {
        const fl = Math.sin(t * 7.5 + this.seed) * 0.035 + Math.sin(t * 13.1) * 0.015;
        ankle.lerp(_tmp.set(pg.x + 0.16, pg.y - 0.13 + fl * 0.5, s0 * (pg.z + 0.4 + fl)), st.dangle);
        toeOut += st.dangle;
      }
      // supermoto slide: inside leg forward toward the front axle
      if (st.legOut > 0.001 && s0 === st.legOutSide) {
        ankle.lerp(_tmp.set(pg.x + 0.62, pg.y + 0.08, s0 * (pg.z + 0.3)), st.legOut);
        toeOut += st.legOut * 0.6;
      }
      // stretching the legs on the grid: the right foot comes down too
      if (s0 > 0 && straddle > 0.001) ankle.lerp(_tmp.set(pg.x + 0.1, 0.09, pg.z + 0.2), straddle);
      // standstill: left foot down to the road
      if (s0 < 0 && stop > 0.01) ankle.lerp(_tmp.set(pg.x + 0.12, 0.09, -(pg.z + 0.2)), stop);
      if (st.crash > 0) {
        // knees drawn up while tumbling, legs out sliding (bent on a lowside)
        const ct = Math.min(3, crT), fl = Math.exp(-ct);
        _tmp2.set(0.12 + 0.25 * Math.sin(ct * 6 + s0) * fl, cr && !cr.high ? -0.64 : -0.76, s0 * 0.24);
        _tmp2.lerp(_c.set(0.32, -0.42, s0 * 0.17), crAir);
        ankle.lerp(_tmp.copy(L.hp).add(_tmp2), st.crash);
      }
      // knees: forward and gripping the tank, the inside one out toward the kerb
      _a.set(0.9, 0.3 - 0.5 * inside, s0 * (0.12 + 1.45 * inside * pe.knee + 0.8 * toeOut - 0.06 * st.brake));
      ik(L.hp, ankle, B.thigh, B.shin, _a, L.kn);
      // the knee slider rides on the asphalt, never through it, and past ~40° of lean the
      // inside knee reaches down for it. Height above the road of a bike-space point is
      // y cos(lean) - z sin(lean); the knee swings about the hip-ankle axis (lengths kept)
      if (!crashed && !s.airborne) {
        const cl = Math.cos(lean), sl = Math.sin(lean);
        const hgt = (q) => q.y * cl - (q.z + s0 * 0.07) * sl - 0.009;
        let hk = hgt(L.kn);
        const seek = inside > 0.3 ? smooth(0.66, 0.8, Math.abs(lean)) : 0;
        const target = hk < 0.004 ? 0.004 : seek > 0 && hk < 0.09 ? lerp(hk, 0.004, seek) : null;
        if (target !== null) {
          _b.subVectors(ankle, L.hp).normalize();
          _c.copy(L.hp).addScaledVector(_b, _d.subVectors(L.kn, L.hp).dot(_b)); // axis foot of the knee
          _d.subVectors(L.kn, _c);
          _x.crossVectors(_b, _d);
          const up = _y.set(0, cl, -sl);
          const A = _d.dot(up), Bv = _x.dot(up), R = Math.hypot(A, Bv), hc = hgt(_c);
          if (R > 1e-5) {
            // h(th) = hc + R cos(th - del): take the crossing of the target nearest th = 0
            const del = Math.atan2(Bv, A), a1 = Math.acos(clamp((target - hc) / R, -1, 1));
            const wrapA = (x) => Math.atan2(Math.sin(x), Math.cos(x));
            const t1 = wrapA(del - a1), t2 = wrapA(del + a1);
            const th = Math.abs(t1) < Math.abs(t2) ? t1 : t2;
            L.kn.copy(_c).addScaledVector(_d, Math.cos(th)).addScaledVector(_x, Math.sin(th));
            hk = hgt(L.kn);
          }
        }
        // contact for the scrape effects (the inside knee only)
        if (inside > 0.3) { this.kneeDown = clamp(1 - hk / 0.02, 0, 1); this.kneePt.copy(L.kn).add(_tmp.set(-0.01, -0.035, s0 * 0.07)); }
      }
      placeSeg(b('thigh'), L.hp, L.kn, ZAX);
      placeSeg(b('shin'), L.kn, ankle, ZAX);
      // foot points forward along the bike (outward when off the peg), toe on the lever
      const dg = s0 === st.dangleSide ? st.dangle : 0; // a dangling foot hangs toes down and out
      const toe = L.toe.set(ankle.x + B.foot * (0.98 - 0.15 * dg), ankle.y - 0.05 + toeLift - (s0 < 0 ? 0.03 * stop : 0) - 0.07 * dg, ankle.z + s0 * (0.01 + 0.09 * toeOut));
      placeSeg(b('foot'), ankle, toe, UP);
    }

    // ---------------- crash: the body leaves the machine and travels in world space
    if (cr) this._crashPlace(cr, crT);
    else if (this._crash) { this._crash = null; this.root.position.set(0, 0, 0); this.root.quaternion.identity(); }
  }

  // launch state at the moment the rider lets go: direction, speed, seat height, highside
  // (flung over the top, tumbling) or lowside (down on the hip beside the machine)
  _crashState(s) {
    if (this._crash) return this._crash;
    const dirt = this.mats.suit.userData.dirt;
    dirt.value = Math.min(0.7, dirt.value + 0.45);
    const par = this.root.parent;
    if (par) par.updateWorldMatrix(true, false);
    const M = par ? par.matrixWorld : _I4;
    const F = new THREE.Vector3(1, 0, 0).transformDirection(M); F.y = 0;
    if (F.lengthSq() < 1e-6) F.set(1, 0, 0);
    F.normalize();
    const R = V().crossVectors(F, UP).normalize();
    const pivot = new THREE.Vector3(this.seat.x, this.seat.y + 0.1, 0);
    const P0 = pivot.clone().applyMatrix4(M);
    let top = this.root;
    while (top.parent && !top.parent.isScene) top = top.parent;
    const kind = s.crashKind, lean0 = clamp(s.lean || 0, -1.2, 1.2);
    const high = kind ? kind !== 'lowside' && kind !== 'loop' : Math.abs(lean0) < 0.55;
    const v0 = Math.abs(s.speed || 0);
    const h0 = Math.max(0.2, P0.y - top.position.y - 0.15);
    const vy = high ? 1.8 + Math.min(2, v0 * 0.04) : 0;
    const tLand = high ? (vy + Math.sqrt(vy * vy + 2 * 9.81 * h0)) / 9.81 : 0.34;
    const off = P0.clone().sub(top.position);
    this._crash = { F, R, P0, off, pivot, top, high, lean0, side: Math.sign(lean0) || (hash(this.seed) < 0.5 ? -1 : 1), v0, h0, vy, tLand, spin: (hash(this.seed * 3.3 + v0) - 0.5) * 2.4 };
    return this._crash;
  }

  // closed-form motion relative to the sliding machine (so replays can scrub and the body
  // never strays out of shot): flight over the front, bounce, roll onto the back and slide;
  // or the fall onto the hip and a slide feet first beside it
  _crashPlace(C, ct) {
    const tA = C.high ? C.tLand : 0;
    const dist = C.high ? 2.2 * smooth(0, tA + 0.1, ct) + 1.6 * smooth(tA, tA + 1.2, ct) : -1.2 * smooth(0.1, 1.4, ct);
    let hgt, lat, roll, tumble, yaw = 0, turn = 0;
    if (C.high) {
      if (ct < tA) { hgt = 0.15 + C.h0 + C.vy * ct - 4.905 * ct * ct; tumble = -(Math.PI + 0.6) * (ct / tA); }
      else {
        const tau = ct - tA;
        hgt = 0.15 + 0.2 * Math.abs(Math.sin(tau * 6.5)) * Math.exp(-tau * 5);
        tumble = -(Math.PI + 0.6) - (Math.PI / 2 - 0.6) * smooth(0, 0.45, tau) + 0.12 * Math.sin(tau * 5) * Math.exp(-tau * 2);
        yaw = C.spin * (1 - Math.exp(-tau * 1.3));
      }
      roll = C.lean0 * (1 - smooth(0, 0.35, ct));
      lat = -C.side * 1.4 * smooth(0, 0.9, ct);
    } else {
      // down on the hip, rolled onto the back and swung round to slide feet first
      const k = smooth(0, C.tLand, ct);
      hgt = 0.15 + C.h0 * (1 - k);
      roll = lerp(C.lean0, C.side * Math.PI / 2, k);
      turn = C.side * Math.PI / 2 * 0.85 * smooth(0.4, 1.3, ct);
      tumble = -0.3 * smooth(0, 0.6, ct);
      yaw = -C.side * Math.PI / 2 * 0.9 * smooth(0.2, 1.5, ct) + C.spin * 0.15 * smooth(0.3, 1.8, ct);
      lat = C.side * 1.15 * smooth(0, 0.9, ct);
    }
    // world: T(P) R(yaw) R(heading) R(roll about forward) R(tumble about the side) T(-pivot)
    const T = C.top.position, k0 = 1 - smooth(0, 0.5, ct);
    _cp.set(T.x + C.off.x * k0, 0, T.z + C.off.z * k0).addScaledVector(C.F, dist).addScaledVector(C.R, lat);
    _cp.y = T.y + hgt;
    _cm.makeBasis(C.F, UP, C.R);
    _cq.setFromRotationMatrix(_cm);
    _cq2.setFromAxisAngle(UP, yaw); _cq.premultiply(_cq2);
    _cq2.setFromAxisAngle(XAX, roll); _cq.multiply(_cq2);
    _cq2.setFromAxisAngle(UP, turn); _cq.multiply(_cq2);
    _cq2.setFromAxisAngle(ZAX, tumble); _cq.multiply(_cq2);
    // never through the road: head, hands and feet stay above it (the body rolls over its
    // shoulders when it lands upside down)
    let low = 0;
    for (const q of CRASH_PTS) { _cv.set(q[0], q[1], q[2]).applyQuaternion(_cq); low = Math.min(low, _cv.y); }
    _cp.y = Math.max(_cp.y, C.top.position.y + 0.1 - low);
    _cm.compose(_cp, _cq, _one).multiply(_cm2.makeTranslation(-C.pivot.x, -C.pivot.y, -C.pivot.z));
    const par = this.root.parent;
    if (par) { par.updateWorldMatrix(true, false); _cm.premultiply(_cm2.copy(par.matrixWorld).invert()); }
    _cm.decompose(this.root.position, this.root.quaternion, this.root.scale);
  }

  // standing beside the machine in the showroom: the weight drifts from leg to leg, breathing,
  // the right hand resting on the seat; idle glances, a visor check, glove flexes, a neck
  // stretch, the left hand on the hip
  _standPose(dt) {
    const B = this.B;
    const st = this.st, bn = this.bones;
    const settle = !(dt > 0) || dt > 0.25;
    if (!settle) this.t += dt;
    const t = this.t;
    this._standing = true;
    this.root.position.set(this.seat.x + 0.08, 0, -0.5);
    this.root.rotation.set(0, 0.45, 0);
    this.root.updateMatrix();
    if (!settle) {
      st.idleT += dt;
      if (st.act < 0 && st.idleT > st.nextAct) { st.actN++; st.act = Math.floor(hash(this.seed + st.actN * 7.3) * STAND_IDLE.length); st.actT = 0; }
      if (st.act >= 0) {
        st.actT += dt;
        if (st.actT > STAND_IDLE[st.act][1]) { st.act = -1; st.idleT = 0; st.nextAct = 1.2 + hash(this.seed + st.actN * 1.3) * 3; }
      }
    } else if (st.act >= STAND_IDLE.length) st.act = -1;
    let headYaw = -0.2 + 0.15 * Math.sin(t * 0.23), headPitch = -0.06, headRoll = 0, fingL = 0.4, kind = '', env = 0, u = 0;
    if (st.act >= 0) {
      kind = STAND_IDLE[st.act][0]; u = st.actT / STAND_IDLE[st.act][1];
      env = smooth(0, 0.2, u) * (1 - smooth(0.8, 1, u));
      const side = hash(this.seed + st.actN) < 0.5 ? -1 : 1;
      if (kind === 'look') headYaw += side * 0.75 * env;
      else if (kind === 'stretch') { headRoll += Math.sin(u * Math.PI * 2) * 0.32 * env; headPitch -= 0.1 * env; }
      else if (kind === 'flex') fingL = 0.4 + Math.max(0, Math.sin(u * Math.PI * 4)) * 0.5 * env;
      else if (kind === 'visor') headPitch -= 0.06 * env;
    }
    // contrapposto: the weight settles on one leg for a while, then the other
    const shift = clamp(Math.sin(t * 0.22 + this.seed) * 1.7, -1, 1) * 0.85 + Math.sin(t * 0.13 + 1) * 0.15, breath = Math.sin(t * 1.6);
    // pelvis over the loaded leg, spine upright with a slight sway, chest lifting on the breath
    const P = _P.set(0, 0.075 + 0.966 * (B.thigh + B.shin) - 0.015 * Math.abs(shift), 0.05 * shift);
    const segDir = (a, b, out) => out.set(Math.sin(a), Math.cos(a), Math.tan(b)).normalize();
    const th = 0.03 + 0.012 * breath, latBend = -0.09 * shift, twist = -0.12 + 0.06 * shift;
    segDir(th * 0.5, latBend * 0.3, _e); _L.copy(P).addScaledVector(_e, B.pelvis);
    segDir(th * 0.95, latBend * 0.7, _f); _T.copy(_L).addScaledVector(_f, B.spine);
    segDir(th * 1.12, latBend, _g); _N.copy(_T).addScaledVector(_g, B.chest);
    _latP.set(0, 0, 1).addScaledVector(_e, -_e.z).normalize();
    _latS.set(Math.sin(twist * 0.45), 0, Math.cos(twist * 0.45)).addScaledVector(_f, -_f.dot(_tmp.set(Math.sin(twist * 0.45), 0, Math.cos(twist * 0.45)))).normalize();
    _latC.set(Math.sin(twist), 0, Math.cos(twist)).addScaledVector(_g, -_g.dot(_tmp.set(Math.sin(twist), 0, Math.cos(twist)))).normalize();
    placeSeg(bn[BONE.pelvis], P, _L, _latP);
    placeSeg(bn[BONE.spine], _L, _T, _latS);
    placeSeg(bn[BONE.chest], _T, _N, _latC);
    _fw.crossVectors(_g, _latC).normalize();
    for (const L of this.limbs) {
      const s0 = L.s;
      const elev = -0.06 + (s0 < 0 && kind === 'visor' ? 0.3 * env : 0) + 0.01 * breath;
      L.c0.copy(_N).addScaledVector(_g, -0.03).addScaledVector(_latC, s0 * 0.025);
      _tmp.copy(_latC).multiplyScalar(s0).addScaledVector(_g, elev).normalize();
      L.sh.copy(L.c0).addScaledVector(_tmp, B.clav);
      placeSeg(bn[boneIndex(s0, 'clav')], L.c0, L.sh, _g);
    }
    // neck and head
    _tmp.copy(_g).multiplyScalar(0.6).addScaledVector(UP, 0.4).normalize();
    const headPos = _tmp2.copy(_N).addScaledVector(_tmp, B.neck);
    placeSeg(bn[BONE.neck], _N, headPos, _latC);
    const head = bn[BONE.head];
    head.position.copy(headPos);
    _x.set(Math.cos(headYaw) * Math.cos(headPitch), Math.sin(headPitch), Math.sin(headYaw) * Math.cos(headPitch)).normalize();
    _y.copy(UP).applyAxisAngle(_x, headRoll);
    _y.addScaledVector(_x, -_y.dot(_x)).normalize();
    _z.crossVectors(_x, _y);
    _m.makeBasis(_x, _y, _z);
    head.quaternion.setFromRotationMatrix(_m);
    // arms: right hand flat on the seat, left hanging (or on the hip, or up at the visor)
    _c.set(this.seat.x + 0.12, this.seat.y + 0.07, -0.08).applyMatrix4(_cm2.copy(this.root.matrix).invert());
    for (const L of this.limbs) {
      const s0 = L.s, b = (n) => bn[boneIndex(s0, n)];
      const wrist = L.wr;
      if (s0 > 0) {
        wrist.copy(_c);
        _hd.set(0.55, -0.8, 0.1).normalize(); _hz.copy(ZAX);
        _a.set(-1, -0.25, 0.3); // elbow back and a little out
      } else {
        // hanging close to the body, elbow softly bent, a slow swing
        const sw = Math.sin(t * 0.9) * 0.015;
        wrist.copy(L.sh).add(_tmp.set(0.08 + sw, -0.5, 0.03));
        _hd.set(0.12, -1, 0.06).normalize(); _hz.copy(ZAX);
        _a.set(-1, -0.1, -0.25);
        if (kind === 'hip') {
          wrist.lerp(_tmp.copy(L.hp).add(_tmp2.set(-0.02, 0.1, -0.13)), env);
          _hd.lerp(_tmp.set(0.3, -0.5, 0.75).normalize(), env).normalize();
          _a.lerp(_tmp.set(-0.4, -0.1, -1.4), env);
        } else if (kind === 'visor') {
          wrist.lerp(_tmp.copy(head.position).add(_tmp2.set(0.2, 0.1, -0.05).applyQuaternion(head.quaternion)), env);
          _hd.lerp(_tmp.set(0.2, 0.9, 0.3).normalize(), env).normalize();
        }
      }
      ik(L.sh, wrist, B.upper, B.fore, _a, L.el);
      placeSeg(b('upper'), L.sh, L.el, ZAX);
      placeSeg(b('fore'), L.el, wrist, ZAX);
      _tmp.copy(wrist).add(_hd);
      placeSeg(b('hand'), wrist, _tmp, _hz);
      const hand = b('hand'), fing = b('fing');
      fing.position.set(...KNUCKLE).applyQuaternion(hand.quaternion).add(hand.position);
      _qa.setFromAxisAngle(ZAX, -(s0 > 0 ? 0.1 : fingL));
      fing.quaternion.copy(hand.quaternion).multiply(_qa);
    }
    // legs: feet planted a little apart, the unloaded knee eased forward
    for (const L of this.limbs) {
      const s0 = L.s, b = (n) => bn[boneIndex(s0, n)];
      const load = clamp(0.5 + 0.5 * s0 * shift, 0, 1);
      L.hp.copy(P).addScaledVector(_latP, s0 * B.hipW).addScaledVector(_e, 0.02);
      const ankle = L.an.set(0.03 + 0.05 * (1 - load), 0.075, s0 * (B.hipW + 0.055));
      _a.set(1, 0.1, s0 * 0.15);
      ik(L.hp, ankle, B.thigh, B.shin, _a, L.kn);
      placeSeg(b('thigh'), L.hp, L.kn, ZAX);
      placeSeg(b('shin'), L.kn, ankle, ZAX);
      const toe = L.toe.set(ankle.x + B.foot * 0.97, 0.02, ankle.z + s0 * 0.05);
      placeSeg(b('foot'), ankle, toe, UP);
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}
