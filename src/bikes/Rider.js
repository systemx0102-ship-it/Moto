// Professional rider in one-piece race leathers: an anatomically shaped body skinned to a
// skeleton (pelvis, chest, neck, head, arms, legs), aero hump, shoulder caps, elbow and
// knee sliders over armour, gauntlet gloves wrapped round the grips (two fingers covering
// the lever), race boots with toe sliders, ankle brace and buckles, and a race helmet with
// chin bar, vents, spoiler, visor pivots, tear-off posts and an iridium visor. Fictional
// brands only; not a likeness of anyone.
//
// Every rigid piece of gear is skinned 100 % to its bone and merged with the body by
// material, so a whole rider is five draw calls (suit, gear, boots, helmet, visor).
// Every frame the body is posed on the machine by two-bone IK: seat under the pelvis,
// hands on the grips (following the steering), balls of the feet on the pegs. It hangs off
// into corners with the inside knee out, tucks behind the screen on the straights, sits up
// under braking, dabs a foot at a standstill and slides off in a crash.
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

// body dimensions (m): a 1.78 m athlete
const B = {
  hipW: 0.09, pelvis: 0.14, chest: 0.38, shoulderW: 0.185, neck: 0.07,
  upper: 0.3, fore: 0.27, thigh: 0.44, shin: 0.44, foot: 0.2,
};
// riding styles: tuck = how far the rider folds onto the tank at speed, hang = hang-off,
// ext = arm extension at rest (fraction of full reach), back = allowed backward lean
const STYLES = {
  sport: { tuck: 1, hang: 1, ext: 0.66, back: 0, foot: [-0.085, 0.065], lean0: 0.55 },
  street: { tuck: 0.45, hang: 0.55, ext: 0.84, back: 0.05, foot: [-0.07, 0.07], lean0: 0.22 },
  mx: { tuck: 0.25, hang: 0.25, ext: 0.88, back: 0.05, foot: [-0.06, 0.075] },
  cruiser: { tuck: 0.1, hang: 0.15, ext: 0.93, back: 0.32, foot: [-0.02, 0.08] },
};
export const DESIGN_STYLE = {
  superbike: 'sport', gp: 'sport', twostroke: 'sport', sporttourer: 'sport', electric: 'sport', cafe: 'sport',
  naked: 'street', adventure: 'street', sm: 'street', mx: 'mx',
  cruiser: 'cruiser', bobber: 'cruiser', drag: 'cruiser',
};

// ---------------------------------------------------------------------------
// Texture atlas for the suit (1024 x 1536): torso on the top half (u round the body:
// 0 left side, .25 back, .5 right side, .75 front; v up the spine), limbs below in four
// rows (upper arm, forearm, thigh, shin) x two columns (left, right). Limb strips: u .5 =
// outer side, .25 front, 0/1 inner side, .75 back (left limbs are mirrored into this).
const AT = { W: 1024, H: 1536 };
const TORSO = { u0: 0, u1: 1, v0: 1 / 3, v1: 1 };
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
// Skeleton
const BONE = { pelvis: 0, chest: 1, neck: 2, head: 3 };
const LIMB = ['upper', 'fore', 'hand', 'thigh', 'shin', 'foot'];
const boneIndex = (s, name) => 4 + (s < 0 ? 0 : 6) + LIMB.indexOf(name);

// rest pose (rider standing, arms down): joint positions + bone frames in root space
function restPose() {
  const P = new THREE.Vector3(0, 0, 0), lumb = new THREE.Vector3(0, B.pelvis, 0);
  const neckBase = new THREE.Vector3(0, B.pelvis + B.chest, 0), headP = new THREE.Vector3(0, B.pelvis + B.chest + B.neck, 0);
  const up = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const frames = [];
  const put = (i, a, b, hint) => { const o = new THREE.Object3D(); placeSeg(o, a, b, hint); o.updateMatrix(); frames[i] = o.matrix.clone(); };
  put(BONE.pelvis, P, lumb, Z);
  put(BONE.chest, lumb, neckBase, Z);
  put(BONE.neck, neckBase, headP, Z);
  // head frame: +X forward, +Y up (as posed in update)
  { const o = new THREE.Object3D(); o.position.copy(headP); o.updateMatrix(); frames[BONE.head] = o.matrix.clone(); }
  for (const s of [-1, 1]) {
    const sh = new THREE.Vector3(0, B.pelvis + B.chest * 0.88, s * B.shoulderW);
    const el = sh.clone().add(new THREE.Vector3(0, -B.upper, 0)), wr = el.clone().add(new THREE.Vector3(0, -B.fore, 0));
    const hp = new THREE.Vector3(0, 0.02, s * B.hipW), kn = hp.clone().add(new THREE.Vector3(0, -B.thigh, 0)), an = kn.clone().add(new THREE.Vector3(0, -B.shin, 0));
    put(boneIndex(s, 'upper'), sh, el, Z);
    put(boneIndex(s, 'fore'), el, wr, Z);
    put(boneIndex(s, 'hand'), wr, wr.clone().add(new THREE.Vector3(0.0894, -0.0447, 0)), Z);
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
// torso weights: pelvis / chest by height, plus a share to the nearest upper-arm or thigh
// bone for the skin round the shoulder and hip joints so it follows the limb
function skinTorso(geo, rest, tl) {
  const g = geo.clone();
  g.applyMatrix4(rest[BONE.pelvis]);
  const tv = geo.userData.tv, p = g.attributes.position, n = p.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const shY = B.pelvis + B.chest * 0.88;
  for (let i = 0; i < n; i++) {
    const k = smooth(tl - 0.12, tl + 0.12, tv[i]);
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), s = z < 0 ? -1 : 1;
    const ds = Math.hypot(x * 0.8, y - shY, z - s * B.shoulderW);
    const dh = Math.hypot(x * 0.7, y - 0.0, z - s * B.hipW);
    const ws = 0.55 * smooth(0.13, 0.04, ds);
    const wh = 0.38 * smooth(0.15, 0.05, dh);
    const limb = ws >= wh ? boneIndex(s, 'upper') : boneIndex(s, 'thigh');
    const wl = Math.max(ws, wh);
    si[i * 4] = BONE.pelvis; si[i * 4 + 1] = BONE.chest; si[i * 4 + 2] = limb;
    sw[i * 4] = (1 - k) * (1 - wl); sw[i * 4 + 1] = k * (1 - wl); sw[i * 4 + 2] = wl;
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
      uv.push(uvFull ? ((ph / (Math.PI * 2)) + 0.5) % 1 : j / nph, uvFull ? 1 - th / Math.PI : 1 - fr);
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

function helmetGeometry() {
  const parts = { shell: [], visor: [], gear: [] };
  // shell with its eye port cut out (the gasket and visor close it)
  const shell = helmetSurf(0.001, 2.3, -Math.PI, Math.PI, 40, 64, 0, true);
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
  parts.gear.push(paint(helmetSurf(2.24, 2.36, -Math.PI, Math.PI, 3, 48, -0.008, false), 0x161617));
  return parts;
}

// ---------------------------------------------------------------------------
// static geometry (shared by every rider), grouped by material and already skinned
let GEO = null;
function geometry() {
  if (GEO) return GEO;
  const rest = restPose();
  const out = { suit: [], gear: [], boot: [], helmet: [], visor: [] };
  const T = B.pelvis + B.chest;
  // ---- torso: one surface from the seat to the neck; pelvis + chest bones blended at the waist
  // [t, front, back, half-width, ox, oz, n]
  const torso = segment(T, [
    [-0.13, 0.06, 0.085, 0.1, 0.0, 0, 2.2],
    [-0.06, 0.085, 0.108, 0.14, -0.01, 0, 2.3],
    [0.02, 0.095, 0.112, 0.155, -0.018, 0, 2.4],
    [0.12, 0.1, 0.098, 0.158, -0.02, 0, 2.4],
    [0.25, 0.104, 0.088, 0.146, -0.012, 0, 2.3],
    [0.38, 0.108, 0.092, 0.15, 0.0, 0, 2.3],
    [0.52, 0.118, 0.102, 0.162, 0.006, 0, 2.4],
    [0.65, 0.122, 0.112, 0.172, 0.008, 0, 2.5],
    [0.76, 0.112, 0.116, 0.178, 0.004, 0, 2.6],
    [0.85, 0.094, 0.108, 0.176, -0.004, 0, 2.6],
    [0.92, 0.07, 0.09, 0.14, -0.012, 0, 2.4],
    [0.97, 0.052, 0.066, 0.085, -0.016, 0, 2.2],
    [1.02, 0.042, 0.048, 0.052, -0.01, 0, 2.1],
  ], { radial: 40, sub: 3, ant: 1, region: TORSO });
  const tl = B.pelvis / T;
  out.suit.push(skinTorso(torso, rest, tl));
  // aero hump on the back, flowing up toward the helmet (rigid on the chest)
  const hump = segment(0.26, [[0, 0.01, 0.01, 0.05, -0.1, 0, 2.2], [0.25, 0.03, 0.03, 0.085, -0.122, 0, 2.4], [0.6, 0.05, 0.04, 0.088, -0.136, 0, 2.5], [0.88, 0.038, 0.03, 0.062, -0.122, 0, 2.3], [1, 0.012, 0.012, 0.03, -0.1, 0, 2.2]], { radial: 24, sub: 3, region: { u0: 0.14, u1: 0.36, v0: 0.9, v1: 0.99 } });
  hump.translate(0, B.chest * 0.5, 0);
  out.suit.push(rigid(hump, rest[BONE.chest], BONE.chest));
  for (const s of [-1, 1]) {
    const bi = (n) => boneIndex(s, n);
    // limbs: [t, front, back, half-width, ox, oz, n]
    // upper arm: a deltoid ball round the shoulder joint (rigid to the arm, so it turns
    // inside the torso without pinching), biceps, elbow
    const up = segment(B.upper, [[-0.2, 0.012, 0.012, 0.012, 0.0, 0, 2], [-0.15, 0.046, 0.050, 0.051, 0.0, 0, 2.1], [-0.05, 0.066, 0.071, 0.071, 0.002, 0, 2.2], [0.12, 0.064, 0.068, 0.066, 0, 0, 2.3], [0.4, 0.058, 0.054, 0.055, 0, 0, 2.2], [0.7, 0.051, 0.049, 0.050, 0, 0, 2.2], [0.92, 0.049, 0.054, 0.050, 0, 0, 2.2], [1.05, 0.047, 0.050, 0.048, 0, 0, 2.2]], { radial: 24, ant: -1, region: limbRegion('upper', s) });
    out.suit.push(skinned(up, rest[bi('upper')], blend(bi('upper'), null, bi('fore'), 0.24, 0.86)));
    const fo = segment(B.fore, [[-0.08, 0.046, 0.051, 0.049, 0, 0, 2.2], [0.1, 0.052, 0.055, 0.058, 0, 0, 2.3], [0.3, 0.050, 0.050, 0.056, 0, 0, 2.3], [0.62, 0.041, 0.038, 0.046, 0, 0, 2.2], [0.85, 0.035, 0.032, 0.042, 0, 0, 2.2], [1.0, 0.032, 0.030, 0.039, 0, 0, 2.2], [1.05, 0.032, 0.030, 0.039, 0, 0, 2.2]], { radial: 24, ant: -1, region: limbRegion('fore', s) });
    out.suit.push(skinned(fo, rest[bi('fore')], blend(bi('fore'), bi('upper'), bi('hand'), 0.16, 0.95)));
    // thigh: hip ball round the joint, quads, knee
    const th = segment(B.thigh, [[-0.24, 0.02, 0.02, 0.02, 0, 0, 2], [-0.17, 0.06, 0.066, 0.064, 0, 0, 2.1], [-0.05, 0.084, 0.09, 0.083, 0, 0, 2.3], [0.2, 0.088, 0.082, 0.08, 0, 0, 2.4], [0.5, 0.078, 0.07, 0.07, 0, 0, 2.3], [0.8, 0.064, 0.058, 0.06, 0, 0, 2.3], [0.97, 0.062, 0.058, 0.06, 0, 0, 2.3], [1.07, 0.058, 0.055, 0.056, 0, 0, 2.3]], { radial: 26, ant: -1, region: limbRegion('thigh', s) });
    out.suit.push(skinned(th, rest[bi('thigh')], blend(bi('thigh'), null, bi('shin'), 0.28, 0.86)));
    const sh = segment(B.shin, [[-0.07, 0.056, 0.054, 0.055, 0, 0, 2.3], [0.08, 0.054, 0.06, 0.054, 0, 0, 2.3], [0.25, 0.05, 0.064, 0.052, 0.004, 0, 2.3], [0.45, 0.046, 0.054, 0.046, 0, 0, 2.2], [0.6, 0.042, 0.046, 0.042, 0, 0, 2.2]], { radial: 24, ant: -1, region: limbRegion('shin', s) });
    out.suit.push(skinned(sh, rest[bi('shin')], blend(bi('shin'), bi('thigh'), null, 0.16, 1)));

    // ---- armour (rigid). Limb frames: +Y down the limb, -X anterior, +Z = bike +z.
    // shoulder cap: domed shell with three ribs over the deltoid, outer side
    const cap = ellipsoid(0.046, 0.058, 0.024, [0, 0.0, 0], 20, 12);
    { const p = cap.attributes.position; for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) p.setZ(i, p.getZ(i) * 0.2); cap.computeVertexNormals(); }
    if (s < 0) cap.rotateY(Math.PI);
    cap.translate(0.004, 0.035, s * 0.05);
    out.suit.push(rigid(uvTo(cap, limbRegion('upper', s), 0.5, 0.12), rest[bi('upper')], bi('upper')));
    const sp = rbox(0.05, 0.034, 0.006, [0.004, 0.04, s * 0.073], [0, 0, 0], 0.4);
    out.gear.push(rigid(paint(sp, 0x34363a), rest[bi('upper')], bi('upper')));
    // elbow slider puck on the outside/back of the elbow
    const puck = rbox(0.052, 0.014, 0.044, [0.044, 0.035, s * 0.016], [0, 0, 0], 0.3);
    puck.rotateX(s * 0.35);
    out.gear.push(rigid(paint(puck, 0x2a2b2e), rest[bi('fore')], bi('fore')));
    // knee: armour bulge under the leather + replaceable slider on the outer side
    const kneeA = ellipsoid(0.03, 0.06, 0.052, [-0.05, 0.035, 0], 18, 10);
    out.suit.push(rigid(uvTo(kneeA, limbRegion('shin', s), 0.22, 0.02), rest[bi('shin')], bi('shin')));
    const ks = rbox(0.075, 0.016, 0.06, [-0.018, 0.035, s * 0.064], [Math.PI / 2, 0, 0], 0.28);
    out.gear.push(rigid(paint(ks, 0xdcdfe2), rest[bi('shin')], bi('shin')));
    // ---- glove (hand frame: +Y wrist -> grip, +X down/back, grip axis along Z at (0, .063))
    gloveGeometry(s).forEach(([g, col]) => out.gear.push(rigid(paint(g, col), rest[bi('hand')], bi('hand'))));
    // ---- boot: shaft on the shin, foot shell on the foot bone
    bootGeometry(s).forEach(([g, kind, bone, col]) => {
      const tgt = kind === 'boot' ? out.boot : out.gear;
      const geo = kind === 'boot' ? g : paint(g, col);
      tgt.push(rigid(geo, rest[bi(bone)], bi(bone)));
    });
  }
  // neck (balaclava / collar band) on the neck bone
  const neck = segment(B.neck, [[-0.2, 0.042, 0.046, 0.046, 0.0, 0, 2.2], [0.5, 0.038, 0.042, 0.041, 0.002, 0, 2.2], [1.15, 0.04, 0.044, 0.043, 0.004, 0, 2.2]], { radial: 18 });
  out.gear.push(paint(skinned(neck, rest[BONE.neck], blend(BONE.neck, BONE.chest, BONE.head, 0.2, 0.9)), 0x1a1b1e));
  // helmet
  const H = helmetGeometry();
  for (const g of H.shell) out.helmet.push(rigid(g, rest[BONE.head], BONE.head));
  for (const g of H.visor) out.visor.push(rigid(g, rest[BONE.head], BONE.head));
  for (const g of H.gear) out.gear.push(rigid(g, rest[BONE.head], BONE.head));
  // merge per material (normalised attribute sets)
  const norm = (list, color) => list.map((g) => {
    const q = g.index ? g : g;
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

// Gauntlet glove round the grip. Returns [geometry, colour] pairs in hand space.
function gloveGeometry(s) {
  const P = [];
  const GC = [0.0, 0.063]; // grip axis (x, y), along z
  const black = 0x141416, accent = 0x2b2c30;
  // gauntlet cuff over the forearm, flared, with the velcro strap
  const cuff = segment(0.085, [[0, 0.04, 0.04, 0.045, 0, 0, 2.3], [0.55, 0.034, 0.034, 0.04, 0, 0, 2.2], [1, 0.032, 0.032, 0.038, 0, 0, 2.2]], { radial: 18 });
  cuff.translate(0, -0.085, 0);
  P.push([cuff, black]);
  P.push([segment(0.018, [[0, 0.036, 0.036, 0.042, 0, 0, 2.3], [1, 0.036, 0.036, 0.042, 0, 0, 2.3]], { radial: 18 }).translate(0, -0.05, 0), 0x2a2b2e]);
  // hand body: wrist -> knuckles, riding over the grip (back of the hand up = -X)
  const hb = segment(0.085, [[0, 0.03, 0.03, 0.04, 0.0, 0, 2.3], [0.35, 0.026, 0.024, 0.046, -0.01, 0, 2.6], [0.75, 0.018, 0.02, 0.047, -0.026, 0, 2.8], [1, 0.016, 0.018, 0.045, -0.033, 0, 2.8]], { radial: 18, ant: -1 });
  P.push([hb, black]);
  // knuckle armour (hard shell) and the back-of-hand panel
  P.push([rbox(0.012, 0.03, 0.082, [-0.05, 0.072, 0], [0, 0, -0.25], 0.35), accent]);
  P.push([rbox(0.008, 0.045, 0.06, [-0.045, 0.035, 0], [0, 0, -0.18], 0.4), 0x1f2023]);
  // fingers: index + middle reach forward over the lever, ring + little wrap the grip
  const knuckle = (z) => [-0.036, 0.08, z];
  for (let k = 0; k < 4; k++) {
    const z = s * [-0.026, -0.009, 0.008, 0.024][k];
    const K = knuckle(z);
    let pts;
    if (k < 2) {
      pts = [K, [-0.04, 0.1, z], [-0.032, 0.122, z], [-0.012, 0.128, z], [0.004, 0.122, z]];
    } else {
      const R = 0.027;
      pts = [K];
      const a0 = Math.atan2(K[1] - GC[1], K[0] - GC[0]);
      const len = k === 2 ? 2.6 : 2.25;
      for (let i = 1; i <= 5; i++) { const a = a0 - (len * i) / 5; pts.push([GC[0] + Math.cos(a) * R, GC[1] + Math.sin(a) * R, z]); }
    }
    const rad = (t) => (k === 3 ? 0.0085 : 0.0095) * (1 - 0.18 * t);
    P.push([tubeR(pts, rad, { radial: 8, seg: 10 }), black]);
    // finger armour plate on the first phalanx
    const mid = pts[1];
    P.push([rbox(0.006, 0.016, 0.013, [mid[0] - 0.008, mid[1], z], [0, 0, k < 2 ? -0.6 : -1.3], 0.4), accent]);
  }
  // thumb: from the inside of the palm, under the grip
  const zt = -s * 0.038;
  P.push([tubeR([[-0.012, 0.025, zt], [0.008, 0.045, zt * 1.05], [0.024, 0.064, zt * 0.9], [0.026, 0.082, zt * 0.6]], (t) => 0.011 * (1 - 0.2 * t), { radial: 8, seg: 10 }), black]);
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
  P.push([plate, 'gear', 'shin', 0x2a2b2e]);
  const brace = rbox(0.014, 0.14, 0.05, [0.066, B.shin * 0.72, 0], [0, 0, -0.06], 0.35);
  P.push([brace, 'gear', 'shin', 0x1d1e21]);
  // buckles on the outer side
  for (let k = 0; k < 3; k++) {
    const y = B.shin * (0.6 + k * 0.11);
    P.push([rbox(0.03, 0.012, 0.006, [0.004, y, s * 0.057], [0, 0, 0.12], 0.3), 'gear', 'shin', 0x9ea2a8]);
  }
  // ankle brace pivot disc on the outer side
  P.push([new THREE.CylinderGeometry(0.02, 0.022, 0.006, 18).rotateX(Math.PI / 2).translate(0.006, B.shin * 0.99, s * 0.052), 'gear', 'shin', 0x26272a]);
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
// materials and textures (cached per livery)
const cache = new Map();
const lum = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
const SPONSORS = [['NEXOL', '#ffffff', '#111111'], ['VELOX', '#ffd400', '#111111'], ['ZENTEK', '#e2231a', '#ffffff'], ['TURBOMAX', '#111111', '#ffffff'], ['BAYO', '#1a4fd6', '#ffffff']];

// canvas mapping helpers for the atlas (u, v in atlas space -> pixels)
const PX = (u) => u * AT.W, PY = (v) => (1 - v) * AT.H;
const torsoUV = (u, t) => [PX(TORSO.u0 + (TORSO.u1 - TORSO.u0) * u), PY(TORSO.v0 + (TORSO.v1 - TORSO.v0) * ((t + 0.13) / 1.15))];
const limbUV = (name, s, u, t, t0, t1) => { const r = limbRegion(name, s); return [PX(r.u0 + (r.u1 - r.u0) * u), PY(r.v0 + (r.v1 - r.v0) * clamp((t - t0) / (t1 - t0), 0, 1))]; };
const LIMB_T = { upper: [-0.18, 1.08], fore: [-0.07, 1.05], thigh: [-0.2, 1.08], shin: [-0.07, 0.6] };

// panel layout shared by the colour and the relief maps: list of { poly (canvas px), kind }
function suitLayout() {
  const P = [];
  const tp = (pts) => pts.map(([u, t]) => torsoUV(u, t));
  // torso side panels (second colour) from the hip up into the armpit, both sides
  for (const uc of [0.5, 0.0, 1.0]) {
    P.push({ kind: 'second', poly: tp([[uc - 0.1, -0.02], [uc + 0.08, -0.02], [uc + 0.07, 0.35], [uc + 0.1, 0.62], [uc + 0.06, 0.8], [uc - 0.05, 0.82], [uc - 0.08, 0.55], [uc - 0.12, 0.3]]) });
  }
  // shoulder yoke
  P.push({ kind: 'second', poly: tp([[0, 0.86], [1, 0.86], [1, 1.04], [0, 1.04]]) });
  // seat / crotch panel and collar
  P.push({ kind: 'black', poly: tp([[0.08, -0.15], [0.42, -0.15], [0.4, -0.02], [0.25, 0.01], [0.1, -0.02]]) });
  P.push({ kind: 'black', poly: tp([[0.66, -0.15], [0.84, -0.15], [0.8, -0.07], [0.7, -0.07]]) });
  P.push({ kind: 'black', poly: tp([[0, 0.995], [1, 0.995], [1, 1.04], [0, 1.04]]) });
  // lower-back accordion stretch panel
  P.push({ kind: 'stretch', poly: tp([[0.12, 0.2], [0.38, 0.2], [0.38, 0.42], [0.12, 0.42]]) });
  // perforated chest + upper back
  P.push({ kind: 'perf', poly: tp([[0.64, 0.46], [0.86, 0.46], [0.86, 0.66], [0.64, 0.66]]) });
  P.push({ kind: 'perf', poly: tp([[0.16, 0.55], [0.34, 0.55], [0.34, 0.74], [0.16, 0.74]]) });
  // limbs: outer stripe (u .5), inner stretch / grip panels (u 0)
  for (const s of [-1, 1]) {
    for (const name of ['upper', 'fore', 'thigh', 'shin']) {
      const [t0, t1] = LIMB_T[name];
      const lp = (pts) => pts.map(([u, t]) => limbUV(name, s, u, t, t0, t1));
      P.push({ kind: 'second', poly: lp([[0.4, t0], [0.6, t0], [0.58, t1], [0.42, t1]]) });
      if (name === 'upper' || name === 'fore') P.push({ kind: 'stretch', poly: lp([[-0.12, name === 'upper' ? 0.7 : t0], [0.12, name === 'upper' ? 0.7 : t0], [0.12, name === 'upper' ? t1 : 0.25], [-0.12, name === 'upper' ? t1 : 0.25]]) });
      if (name === 'thigh') {
        P.push({ kind: 'black', poly: lp([[-0.14, 0.05], [0.14, 0.05], [0.12, 0.9], [-0.12, 0.9]]) });
        P.push({ kind: 'stretch', poly: lp([[0.66, 0.82], [0.84, 0.82], [0.84, t1], [0.66, t1]]) });
        P.push({ kind: 'perf', poly: lp([[0.16, 0.12], [0.34, 0.12], [0.34, 0.6], [0.16, 0.6]]) });
      }
      if (name === 'shin') P.push({ kind: 'stretch', poly: lp([[0.12, t0], [0.38, t0], [0.38, 0.12], [0.12, 0.12]]) });
    }
  }
  return P;
}
function fillPoly(g, poly) { g.beginPath(); poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }

function suitColorMap(main, second, accent, number) {
  const { c, g } = makeCanvas(AT.W, AT.H);
  g.fillStyle = main; g.fillRect(0, 0, AT.W, AT.H);
  const L = suitLayout();
  const black = '#141416';
  for (const p of L) {
    if (p.kind === 'second') g.fillStyle = second;
    else if (p.kind === 'black' || p.kind === 'stretch') g.fillStyle = black;
    else continue;
    fillPoly(g, p.poly); g.fill();
  }
  // accent piping along the second-colour panel edges
  g.strokeStyle = accent; g.lineWidth = 3;
  for (const p of L) if (p.kind === 'second') { fillPoly(g, p.poly); g.stroke(); }
  // perforated zones: slightly darker dots
  for (const p of L) {
    if (p.kind !== 'perf') continue;
    g.save(); fillPoly(g, p.poly); g.clip();
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < AT.H; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < AT.W; x += 4) g.fillRect(x, y, 1, 1);
    g.restore();
  }
  // stitching: double rows along every panel seam
  g.setLineDash([5, 4]); g.lineWidth = 1.2;
  g.strokeStyle = lum(main) > 0.55 ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
  for (const p of L) { fillPoly(g, p.poly); g.stroke(); }
  g.setLineDash([]);
  // front zip
  { const [x0, y0] = torsoUV(0.75, 0.32), [, y1] = torsoUV(0.75, 0.99); g.fillStyle = '#0d0d0f'; g.fillRect(x0 - 3, y1, 6, y0 - y1); g.fillStyle = '#5a5c60'; for (let y = y1; y < y0; y += 4) g.fillRect(x0 - 2, y, 4, 1.5); }
  // chest maker lettering (fictional), accent underline
  const text = (x, y, size, col, str, rot = 0, mirror = false, font = 'italic 700', fam = '"Barlow Condensed", Arial, sans-serif', maxW = 9999) => {
    g.save(); g.translate(x, y); g.rotate(rot); if (mirror) g.scale(-1, 1);
    g.font = `${font} ${size}px ${fam}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(str, 0, 0, maxW); g.restore();
  };
  const ink = lum(main) > 0.55 ? '#111111' : '#ffffff';
  { const [x, y] = torsoUV(0.75, 0.74); text(x, y, 44, ink, 'MÍTICO', 0, false, 'italic 800', '"Barlow Condensed", Arial, sans-serif', 170); g.fillStyle = accent; g.fillRect(x - 70, y + 24, 140, 5); }
  // sponsor patches: chest (sides of the zip), belly, arms, thighs
  const patch = (x, y, w, h, sp, mirror = false) => {
    g.fillStyle = sp[1]; g.fillRect(x - w / 2, y - h / 2, w, h);
    text(x, y + h * 0.04, Math.round(h * 0.78), sp[2], sp[0], 0, mirror, 'italic 700', '"Barlow Condensed", Arial, sans-serif', w * 0.9);
  };
  const off = number.length % SPONSORS.length;
  { const [x, y] = torsoUV(0.68, 0.58); patch(x, y, 64, 20, SPONSORS[off % 5]); }
  { const [x, y] = torsoUV(0.82, 0.58); patch(x, y, 64, 20, SPONSORS[(off + 1) % 5]); }
  { const [x, y] = torsoUV(0.75, 0.22); patch(x, y, 120, 26, SPONSORS[(off + 2) % 5]); }
  // racing number high on the back (under the hump) and on the hump region
  { const [x, y] = torsoUV(0.25, 0.66); g.lineWidth = 6; g.strokeStyle = accent; g.font = '700 110px "Barlow Condensed", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink; g.strokeText(number, x, y); g.fillText(number, x, y); }
  { const x = PX(0.195), y = PY(0.945); g.fillStyle = second; g.fillRect(PX(0.14), PY(0.99), PX(0.22), PY(0.9) - PY(0.99)); g.font = '700 80px "Barlow Condensed", Arial, sans-serif'; g.lineWidth = 5; g.strokeStyle = accent; g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeText(number, x, y); g.fillText(number, x, y); }
  // limb sponsors on the outer side (u .5); the left strips are mirrored, so flip the text
  for (const s of [-1, 1]) {
    const [ux, uy] = limbUV('upper', s, 0.5, 0.25, ...LIMB_T.upper); g.save(); g.translate(ux, uy); g.rotate(Math.PI / 2); patch(0, 0, 80, 22, SPONSORS[(off + 3) % 5], s < 0); g.restore();
    const [tx, ty] = limbUV('thigh', s, 0.5, 0.35, ...LIMB_T.thigh); g.save(); g.translate(tx, ty); g.rotate(Math.PI / 2); patch(0, 0, 130, 34, SPONSORS[(off + 4) % 5], s < 0); g.restore();
  }
  return toTexture(c, { wrap: false });
}

// relief + roughness for the suit atlas (shared by all liveries): leather grain, panel
// seams with stitch dimples, perforations, accordion stretch ribs
let SUIT_NR = null;
function suitReliefMaps() {
  if (SUIT_NR) return SUIT_NR;
  const W = AT.W, H = AT.H;
  const h = new Float32Array(W * H);
  const n = makeTileFbm(61, 128, 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + x] = 0.5 + 0.12 * n((x / W) * 1, (y / H) * 1.5);
  // rasterise panels into masks with a canvas, then read back
  const { c: mc, g: mg } = makeCanvas(W, H);
  const L = suitLayout();
  const mask = (kind) => {
    mg.fillStyle = '#000'; mg.fillRect(0, 0, W, H); mg.fillStyle = '#fff';
    for (const p of L) if (p.kind === kind) { fillPoly(mg, p.poly); mg.fill(); }
    return mg.getImageData(0, 0, W, H).data;
  };
  const stretch = mask('stretch'), perf = mask('perf');
  mg.fillStyle = '#000'; mg.fillRect(0, 0, W, H); mg.strokeStyle = '#fff'; mg.lineWidth = 3;
  for (const p of L) { fillPoly(mg, p.poly); mg.stroke(); }
  const seams = mg.getImageData(0, 0, W, H).data;
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
  rough.g.putImageData(rimg, 0, 0);
  SUIT_NR = { normalMap: toTexture(heightToNormal(h, W, H, 3.2), { srgb: false, wrap: false }), roughnessMap: toTexture(rough.c, { srgb: false, wrap: false }) };
  return SUIT_NR;
}

function helmetColorMap(main, second, accent, number) {
  const W = 1024, H = 512;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = main; g.fillRect(0, 0, W, H);
  // u: 0/1 back, .25 left, .5 front, .75 right; v: 1 crown -> .26 base
  // swept side blades from the chin back over the ears
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
  // crown stripe front-to-back with accent pinstripes
  for (const [x0, w] of [[0.5, 0.06], [0, 0.06], [1, 0.06]]) { g.fillStyle = second; g.fillRect((x0 - w / 2) * W, 0, w * W, H * 0.36); }
  g.fillStyle = accent;
  for (const x0 of [0.5, 0, 1]) { g.fillRect((x0 - 0.034) * W, 0, 5, H * 0.36); g.fillRect((x0 + 0.034) * W - 5, 0, 5, H * 0.36); }
  // brand on the forehead above the visor and on the chin bar; number at the back
  const ink = lum(main) > 0.55 ? '#111' : '#fff';
  g.font = 'italic 800 44px "Barlow Condensed", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = ink; g.fillText('MÍTICO', 0.5 * W, H * 0.39);
  g.font = 'italic 700 26px "Barlow Condensed", Arial, sans-serif'; g.fillText('MÍTICO', 0.5 * W, H * 0.665);
  g.font = '700 90px "Barlow Condensed", Arial, sans-serif'; g.lineWidth = 6; g.strokeStyle = accent;
  g.strokeText(number, 0.02 * W, H * 0.5); g.fillText(number, 0.02 * W, H * 0.5); g.strokeText(number, 0.98 * W, H * 0.5); g.fillText(number, 0.98 * W, H * 0.5);
  // small sponsor stickers on the sides
  const sp = SPONSORS[number.length % 5];
  for (const uc of [0.32, 0.68]) { g.fillStyle = sp[1]; g.fillRect(uc * W - 34, H * 0.52 - 9, 68, 18); g.fillStyle = sp[2]; g.font = 'italic 700 15px "Barlow Condensed", Arial, sans-serif'; g.fillText(sp[0], uc * W, H * 0.52 + 1); }
  // lower rim trim
  g.fillStyle = '#121214'; g.fillRect(0, H * 0.72, W, H * 0.28);
  return toTexture(c, { wrap: true });
}

function riderMaterials(livery, number) {
  const key = `${livery.base}|${livery.second}|${livery.accent}|${number}`;
  if (cache.has(key)) return cache.get(key);
  // very dark liveries get light secondary panels so the suit still reads
  const main = livery.base;
  let second = livery.second || '#ffffff';
  if (Math.abs(lum(second) - lum(main)) < 0.12) second = lum(main) > 0.5 ? '#16171a' : '#e8e9eb';
  const accent = livery.accent || '#e2231a';
  const NR = suitReliefMaps();
  const L = leatherSet();
  const m = {
    // race leather: atlas colour + panel relief, waxy sheen
    suit: new THREE.MeshPhysicalMaterial({
      map: suitColorMap(main, second, accent, number), normalMap: NR.normalMap, normalScale: new THREE.Vector2(0.55, 0.55), roughnessMap: NR.roughnessMap,
      roughness: 0.66, metalness: 0, clearcoat: 0.14, clearcoatRoughness: 0.55, sheen: 0.55, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x6a6a6a),
    }),
    // gloves, armour plates, sliders, soles, helmet trims: vertex-coloured, leather grain
    gear: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05, normalMap: rep(L.normalMap, 6), normalScale: new THREE.Vector2(0.3, 0.3), clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    boot: new THREE.MeshPhysicalMaterial({ color: lum(main) < 0.25 ? 0xe9eaec : lum(main) > 0.7 ? 0x16171a : new THREE.Color(main).getHex(), roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.2, normalMap: rep(grainSet(19, 128, 2).normalMap, 4), normalScale: new THREE.Vector2(0.2, 0.2) }),
    helmet: new THREE.MeshPhysicalMaterial({ map: helmetColorMap(main, second, accent, number), roughness: 0.2, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 }),
    // dark iridium visor: mirror-like, thin-film colour shift
    visor: new THREE.MeshPhysicalMaterial({ color: 0x07090e, roughness: 0.03, metalness: 0.92, iridescence: 1, iridescenceIOR: 1.9, iridescenceThicknessRange: [280, 640], envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.0 }),
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

export class Rider {
  // ctx: the bike's build context (seat, grips, pegs, design); groups: assembly groups
  constructor(spec, livery, ctx, groups, opts = {}) {
    const G = geometry();
    const mats = riderMaterials(livery, String(livery.number || opts.number || spec.short.length + 20));
    this.style = STYLES[DESIGN_STYLE[spec.design] || 'street'];
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
    // skeleton targets from the bike
    const seat = ctx.seat || { x: (ctx.pegs?.x ?? -0.2) + 0.05, y: 0.82 };
    this.seat = new THREE.Vector3(seat.x, seat.y, 0);
    this.pegs = ctx.pegs || { x: -0.2, y: 0.4, z: 0.17 };
    // grips in steering-group space (so they follow the bars)
    const grips = ctx.grips && ctx.grips.length >= 2 ? ctx.grips : [[0.45, 0.95, -0.33], [0.45, 0.95, 0.33]];
    this.steer.updateMatrix();
    const inv = this.steer.matrix.clone().invert();
    this.gripLocal = grips.map((p) => new THREE.Vector3(...p).applyMatrix4(inv));
    this.limbs = [-1, 1].map((s) => ({ s, sh: V(), el: V(), wr: V(), hp: V(), kn: V(), an: V(), toe: V() }));
    // smoothed pose state
    this.st = { hang: 0, tuck: 0, brake: 0, stop: 1, crash: 0, air: 0 };
    this._p = V(); this._spine = V(); this._pdir = V(); this._lumb = V(); this._lat = V(); this._neck = V(); this._g = [V(), V()]; this._nb = V();
    this.update({ speed: 0 }, 1);
  }

  update(s, dt) {
    const st = this.st, S = this.style, bn = this.bones;
    const lean = s.lean || 0, speed = Math.abs(s.speed || 0);
    st.hang = damp(st.hang, clamp(lean / 0.85, -1, 1), 5, dt);
    const tuckT = S.tuck * clamp((speed - 16) / 26, 0, 1) * (s.throttle === undefined || s.throttle > 0.4 ? 1 : 0.35) * (s.braking ? 0.2 : 1);
    st.tuck = damp(st.tuck, tuckT, 2.5, dt);
    st.brake = damp(st.brake, s.braking && speed > 3 ? 1 : 0, 6, dt);
    st.stop = damp(st.stop, speed < 0.7 && !s.crashed ? 1 : 0, 5, dt);
    st.air = damp(st.air, s.airborne ? 1 : 0, 6, dt);
    if (s.crashed) st.crash = damp(st.crash, 1, 4, dt); else st.crash = 0;
    const h = st.hang * S.hang, ha = Math.abs(h);
    const c = st.crash;

    // pelvis: on the seat, sliding toward the inside of the corner
    const P = this._p.set(this.seat.x - 0.03 * ha - 0.02 * st.tuck, this.seat.y + 0.07 - 0.02 * ha + 0.03 * st.air * (S === STYLES.mx ? 2 : 0.5), h * 0.11);
    // grips follow the steering; wrists sit just behind and above them
    this.steer.updateMatrix();
    const gl = this._g[0].copy(this.gripLocal[0]).applyMatrix4(this.steer.matrix);
    const gr = this._g[1].copy(this.gripLocal[1]).applyMatrix4(this.steer.matrix);
    for (const g of this._g) g.x -= 0.055, g.y += 0.03;

    // torso pitch so the shoulders land at the desired arm reach
    const reach = (B.upper + B.fore) * clamp(S.ext - 0.2 * st.tuck + 0.06 * st.brake + 0.04 * st.stop, 0.56, 0.97);
    const latBend = h * 0.32;
    const spineAt = (th, out) => out.set(Math.sin(th), Math.cos(th), latBend).normalize();
    // the pelvis rolls forward with the chest (a bit less); the lumbar joint sits on top of it
    const lumbar = (th, out) => out.set(Math.sin(th * 0.72), Math.cos(th * 0.72), latBend * 0.5).normalize().multiplyScalar(B.pelvis).add(P);
    const shoulderMid = (th, out) => lumbar(th, out).addScaledVector(spineAt(th, _b), B.chest * 0.9);
    let lo = -S.back, hi = 1.32;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      shoulderMid(mid, _c);
      const dl = Math.hypot(_c.x - (gl.x + gr.x) / 2, _c.y - (gl.y + gr.y) / 2);
      const dz = (gr.z - gl.z) / 2 - B.shoulderW;
      if (Math.hypot(dl, dz) > reach) lo = mid; else hi = mid;
    }
    // at speed the rider folds onto the tank whatever the arm reach (elbows bend more)
    const moving = clamp((speed - 1) / 7, 0, 1) * (1 - st.stop);
    const th = Math.max((lo + hi) / 2, st.tuck * S.tuck * 1.4, (S.lean0 || 0) * moving) * (1 - c);
    const spine = spineAt(th, this._spine);
    const lat = this._lat.set(0, 0, 1).addScaledVector(spine, -spine.z).normalize();
    const lumb = lumbar(th, this._lumb);
    const pdir = this._pdir.subVectors(lumb, P).normalize();
    placeSeg(bn[BONE.pelvis], P, lumb, lat);
    placeSeg(bn[BONE.chest], lumb, _d.copy(lumb).add(spine), lat);
    const neckBase = this._nb.copy(lumb).addScaledVector(spine, B.chest);

    // head: look ahead (chin up in a tuck), stay closer to level than the bike
    const look = this._neck.set(Math.sin(th) * 0.8 + 0.25, Math.cos(th) * 0.5 + 0.55 - 0.15 * st.tuck, latBend * 0.6 + h * 0.15).normalize();
    placeSeg(bn[BONE.neck], neckBase, _c.copy(neckBase).add(look), lat);
    const head = bn[BONE.head];
    head.position.copy(neckBase).addScaledVector(look, B.neck);
    _x.set(1, -0.12 - 0.1 * st.tuck, 0).normalize();
    _y.set(-Math.sin(th) * 0.25, 1, -lean * 0.45 + h * 0.2).normalize();
    _y.addScaledVector(_x, -_y.dot(_x)).normalize();
    _z.crossVectors(_x, _y);
    _m.makeBasis(_x, _y, _z);
    head.quaternion.setFromRotationMatrix(_m);

    for (const L of this.limbs) {
      const s0 = L.s;
      const b = (n) => bn[boneIndex(s0, n)];
      const inside = h !== 0 && Math.sign(h) === s0 ? ha : 0;
      // arms: elbows out and down
      L.sh.copy(lumb).addScaledVector(spine, B.chest * 0.88).addScaledVector(lat, s0 * B.shoulderW);
      const wrist = L.wr.copy(s0 < 0 ? gl : gr);
      if (c > 0) wrist.lerp(_c.copy(L.sh).add(_b.set(0.15, 0.2, s0 * 0.45)), c);
      ik(L.sh, wrist, B.upper, B.fore, _a.set(-0.35, -1, s0 * 0.5), L.el);
      placeSeg(b('upper'), L.sh, L.el, _b.set(0, 0, 1));
      placeSeg(b('fore'), L.el, wrist, _b.set(0, 0, 1));
      // hand: from the wrist toward the grip, palm round it
      placeSeg(b('hand'), wrist, _c.set(wrist.x + 0.0894, wrist.y - 0.0447, wrist.z), _b.set(0, 0, 1));

      // legs: knees forward and against the tank, the inside one out in a corner
      L.hp.copy(P).addScaledVector(lat, s0 * B.hipW).addScaledVector(pdir, 0.02);
      const pg = this.pegs;
      const ankle = L.an.set(pg.x + S.foot[0], pg.y + S.foot[1], s0 * (pg.z + 0.035));
      if (s0 < 0 && st.stop > 0.01) ankle.lerp(_c.set(pg.x + 0.12, 0.09, -(pg.z + 0.2)), st.stop);
      if (c > 0) ankle.lerp(_c.copy(L.hp).add(_b.set(0.1, -0.78, s0 * 0.22)), c);
      ik(L.hp, ankle, B.thigh, B.shin, _a.set(0.9, 0.3 - 0.5 * inside, s0 * (0.12 + 1.4 * inside)), L.kn);
      placeSeg(b('thigh'), L.hp, L.kn, _b.set(0, 0, 1));
      placeSeg(b('shin'), L.kn, ankle, _b.set(0, 0, 1));
      // foot points forward along the bike, toes slightly down onto the peg
      const toe = L.toe.set(ankle.x + B.foot * 0.98, ankle.y - 0.05 - (s0 < 0 ? 0.03 * st.stop : 0), ankle.z + s0 * 0.01);
      placeSeg(b('foot'), ankle, toe, _b.set(0, 1, 0));
    }

    // crash: the rider is flung clear and slides beside the bike, limbs loose
    if (c > 0.001) {
      const t = Math.min(1.6, s.crashT || 0);
      this.root.position.set(-0.4 * t, (0.55 + 0.6 * t) * c, 0);
      this.root.rotation.set(0, 0, -0.5 * c);
    } else if (this.root.position.lengthSq() > 0) {
      this.root.position.set(0, 0, 0); this.root.rotation.set(0, 0, 0);
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}

