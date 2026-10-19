// Professional rider in one-piece race leathers: helmet with tinted visor and rear
// spoiler, aero hump, shoulder/elbow/knee armour with sliders, gauntlet gloves and
// race boots with toe sliders. Stylised proportions, not a likeness of anyone.
// Every frame the body is posed on the machine by two-bone IK: seat under the
// pelvis, hands on the grips (following the steering), balls of the feet on the
// pegs. It hangs off into corners, tucks behind the screen on the straights, sits
// up under braking, dabs a foot at a standstill and slides off in a crash.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeCanvas, toTexture } from '../core/textures.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const V = () => new THREE.Vector3();

// body dimensions (m)
const B = {
  hipW: 0.095, pelvis: 0.15, chest: 0.37, shoulderW: 0.19, neck: 0.06,
  upper: 0.29, fore: 0.27, thigh: 0.43, shin: 0.43, foot: 0.2,
};
// riding styles: tuck = how far the rider folds onto the tank at speed, hang = hang-off,
// ext = arm extension at rest (fraction of full reach), back = allowed backward lean
const STYLES = {
  sport: { tuck: 1, hang: 1, ext: 0.8, back: 0, foot: [-0.085, 0.065] },
  street: { tuck: 0.45, hang: 0.55, ext: 0.9, back: 0.05, foot: [-0.07, 0.07] },
  mx: { tuck: 0.25, hang: 0.25, ext: 0.88, back: 0.05, foot: [-0.06, 0.075] },
  cruiser: { tuck: 0.1, hang: 0.15, ext: 0.93, back: 0.32, foot: [-0.02, 0.08] },
};
export const DESIGN_STYLE = {
  superbike: 'sport', gp: 'sport', twostroke: 'sport', sporttourer: 'sport', electric: 'sport', cafe: 'sport',
  naked: 'street', adventure: 'street', sm: 'street', mx: 'mx',
  cruiser: 'cruiser', bobber: 'cruiser', drag: 'cruiser',
};

// ---------------------------------------------------------------------------
// geometry: a body segment along +Y through superellipse rings
// rings: [t (0..1 of len), rx (front/back half size), rz (side half size), ox, oz]
// UV: u round the ring (0 = -Z side, .25 back, .5 +Z side, .75 front), v along
function segment(len, rings, { radial = 20, n = 2.2, caps = true, v0 = 0, v1 = 1 } = {}) {
  const pos = [], uv = [], idx = [], tv = [];
  const cols = radial + 1;
  for (const [t, rx, rz, ox = 0, oz = 0] of rings) {
    for (let j = 0; j <= radial; j++) {
      tv.push(t);
      const a = -Math.PI / 2 - (j / radial) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a), e = 2 / n;
      pos.push(ox + rx * Math.sign(c) * Math.abs(c) ** e, t * len, oz + rz * Math.sign(s) * Math.abs(s) ** e);
      uv.push(j / radial, v0 + (v1 - v0) * clamp(t, 0, 1));
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  if (caps) {
    for (const [ri, flip] of [[0, true], [rings.length - 1, false]]) {
      const [t, , , ox = 0, oz = 0] = rings[ri];
      const ci = pos.length / 3;
      pos.push(ox, t * len, oz); uv.push(0.5, t); tv.push(t);
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
  for (let i = 0; i < rings.length; i++) {
    const a = i * cols, b = a + radial;
    const x = nm.getX(a) + nm.getX(b), y = nm.getY(a) + nm.getY(b), z = nm.getZ(a) + nm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nm.setXYZ(a, x / l, y / l, z / l); nm.setXYZ(b, x / l, y / l, z / l);
  }
  g.userData.tv = tv;
  return g;
}

function ellipsoid(rx, ry, rz, p = [0, 0, 0], ws = 18, hs = 12) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  g.translate(...p);
  return g;
}
function rbox(w, h, d, p, r = [0, 0, 0]) {
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  // round it off a little
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const k = 1 - 0.18 * ((Math.abs(x) / (w / 2)) * (Math.abs(y) / (h / 2)) + (Math.abs(y) / (h / 2)) * (Math.abs(z) / (d / 2)) + (Math.abs(x) / (w / 2)) * (Math.abs(z) / (d / 2))) / 3;
    pa.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  g.rotateX(r[0]); g.rotateY(r[1]); g.rotateZ(r[2]);
  g.translate(...p);
  return g;
}

// ---------------------------------------------------------------------------
// materials and textures (cached per livery)
const cache = new Map();
const lum = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };

function suitTexture(main, second, accent, number) {
  const W = 512, H = 512;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = main; g.fillRect(0, 0, W, H);
  // side panels (u .5 = +Z side, u 0/1 = -Z side): swept second-colour flashes
  g.fillStyle = second;
  for (const u0 of [0.5, 0, 1]) {
    const x = u0 * W;
    g.beginPath();
    g.moveTo(x - 70, H); g.lineTo(x + 70, H); g.lineTo(x + 46, H * 0.42); g.lineTo(x + 18, H * 0.12); g.lineTo(x - 30, H * 0.3); g.lineTo(x - 60, H * 0.62);
    g.closePath(); g.fill();
  }
  // accent piping along the panel edges
  g.strokeStyle = accent; g.lineWidth = 6;
  for (const u0 of [0.5, 0, 1]) {
    const x = u0 * W;
    g.beginPath(); g.moveTo(x + 76, H); g.lineTo(x + 52, H * 0.42); g.lineTo(x + 22, H * 0.08); g.stroke();
  }
  // black leather crotch / seat panel and stretch zones at the waist
  g.fillStyle = '#121214'; g.fillRect(0, H * 0.86, W, H * 0.14);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 6; i++) g.fillRect(0, H * (0.6 + i * 0.012), W, 2);
  // chest: maker-style lettering (fictional) on the front (u .75)
  g.save(); g.translate(W * 0.75, H * 0.2);
  g.fillStyle = lum(main) > 0.55 ? '#111' : '#fff';
  g.font = 'italic 700 34px Rajdhani, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('MÍTICO', 0, 0);
  g.fillStyle = accent; g.fillRect(-60, 22, 120, 5);
  g.restore();
  // racing number on the upper back (u .25)
  g.save(); g.translate(W * 0.25, H * 0.27);
  g.fillStyle = lum(main) > 0.55 ? '#111' : '#fff';
  g.strokeStyle = accent; g.lineWidth = 6;
  g.font = '700 120px "Barlow Condensed", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.strokeText(number, 0, 0); g.fillText(number, 0, 0);
  g.restore();
  // perforation / seam lines (subtle)
  g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2;
  for (const y of [0.45, 0.62]) { g.beginPath(); g.moveTo(0, H * y); g.lineTo(W, H * y); g.stroke(); }
  return toTexture(c, { wrap: false });
}

function limbTexture(main, second, accent) {
  const W = 256, H = 256;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = main; g.fillRect(0, 0, W, H);
  // stripes down both sides (u 0/1 and .5)
  for (const u0 of [0, 0.5, 1]) {
    g.fillStyle = second; g.fillRect(u0 * W - 22, 0, 44, H);
    g.fillStyle = accent; g.fillRect(u0 * W - 26, 0, 4, H); g.fillRect(u0 * W + 22, 0, 4, H);
  }
  // stretch panel and cuff
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let i = 0; i < 5; i++) g.fillRect(0, H * (0.48 + i * 0.016), W, 2);
  return toTexture(c, { wrap: false });
}

function helmetTexture(main, second, accent) {
  const W = 512, H = 256;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = main; g.fillRect(0, 0, W, H);
  // centre stripes over the crown, front (u .5) to back (u 0/1)
  for (const u0 of [0.5, 0, 1]) {
    g.fillStyle = second; g.fillRect(u0 * W - 34, 0, 68, H * 0.62);
    g.fillStyle = accent; g.fillRect(u0 * W - 8, 0, 16, H * 0.62);
  }
  // swept side graphic
  g.fillStyle = second;
  for (const u0 of [0.25, 0.75]) {
    g.beginPath();
    g.moveTo(u0 * W - 90, H * 0.72); g.quadraticCurveTo(u0 * W, H * 0.45, u0 * W + 100, H * 0.58);
    g.lineTo(u0 * W + 100, H * 0.66); g.quadraticCurveTo(u0 * W, H * 0.56, u0 * W - 90, H * 0.8); g.closePath(); g.fill();
  }
  // lower rim
  g.fillStyle = '#16171a'; g.fillRect(0, H * 0.9, W, H * 0.1);
  return toTexture(c, { wrap: false });
}

function riderMaterials(livery, number) {
  const key = `${livery.base}|${livery.second}|${livery.accent}|${number}`;
  if (cache.has(key)) return cache.get(key);
  // very dark liveries get light secondary panels so the suit still reads
  const main = livery.base;
  let second = livery.second || '#ffffff';
  if (Math.abs(lum(second) - lum(main)) < 0.12) second = lum(main) > 0.5 ? '#16171a' : '#e8e9eb';
  const accent = livery.accent || '#e2231a';
  const leather = (map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x888888) });
  const m = {
    suit: leather(suitTexture(main, second, accent, number)),
    limb: leather(limbTexture(main, second, accent)),
    black: new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.55 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.5 }),
    knuckle: new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), roughness: 0.35, metalness: 0.1 }),
    boot: new THREE.MeshPhysicalMaterial({ color: lum(main) < 0.25 ? 0xe9eaec : 0x161719, roughness: 0.35, clearcoat: 0.6 }),
    bootTrim: new THREE.MeshStandardMaterial({ color: new THREE.Color(second), roughness: 0.4 }),
    slider: new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.6, metalness: 0.2 }),
    helmet: new THREE.MeshPhysicalMaterial({ map: helmetTexture(main, second, accent), roughness: 0.18, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.04 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x0b0f18, roughness: 0.04, metalness: 0.9, iridescence: 0.8, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 620], envMapIntensity: 1.4 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.35, metalness: 0.3 }),
  };
  cache.set(key, m);
  return m;
}

// ---------------------------------------------------------------------------
// Skeleton. Bones are all children of the rider root and are placed absolutely
// every frame from the IK joints; the suit is one skinned surface over them so
// waist, hips, shoulders, elbows and knees bend without seams.
const BONE = { pelvis: 0, chest: 1, neck: 2, head: 3 };
const LIMB = ['upper', 'fore', 'hand', 'thigh', 'shin', 'foot'];
const boneIndex = (s, name) => 4 + (s < 0 ? 0 : 6) + LIMB.indexOf(name);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

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
  put(BONE.head, headP, headP.clone().add(up), Z);
  for (const s of [-1, 1]) {
    const sh = new THREE.Vector3(0, B.pelvis + B.chest * 0.88, s * B.shoulderW);
    const el = sh.clone().add(new THREE.Vector3(0, -B.upper, 0)), wr = el.clone().add(new THREE.Vector3(0, -B.fore, 0));
    const hp = new THREE.Vector3(0, 0.02, s * B.hipW), kn = hp.clone().add(new THREE.Vector3(0, -B.thigh, 0)), an = kn.clone().add(new THREE.Vector3(0, -B.shin, 0));
    put(boneIndex(s, 'upper'), sh, el, Z);
    put(boneIndex(s, 'fore'), el, wr, Z);
    put(boneIndex(s, 'hand'), wr, wr.clone().add(new THREE.Vector3(0, -0.1, 0)), Z);
    put(boneIndex(s, 'thigh'), hp, kn, Z);
    put(boneIndex(s, 'shin'), kn, an, Z);
    put(boneIndex(s, 'foot'), an, an.clone().add(new THREE.Vector3(B.foot, 0, 0)), up);
  }
  return frames;
}

// tube geometry along a bone, moved into rest space and weighted to the bone and its
// neighbours: w(t) -> [boneA, weightA, boneB, weightB]
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
// blend from bone `own` toward `prev` below t0 and toward `next` above t1 (50 % at the joint)
const blend = (own, prev, next, t0 = 0.2, t1 = 0.82) => (t) => {
  if (prev !== null && t < t0) { const k = clamp(0.5 - 0.5 * (t / t0), 0, 1); return [own, 1 - k, prev, k]; }
  if (next !== null && t > t1) { const k = clamp(0.5 + 0.5 * ((t - 1) / (1 - t1)), 0, 1); return [own, 1 - k, next, k]; }
  return [own, 1, own, 0];
};

// static geometry (shared by every rider)
let GEO = null;
function geometry() {
  if (GEO) return GEO;
  const rest = restPose();
  const T = B.pelvis + B.chest;
  // torso as one surface from the seat to the neck, pelvis + chest bones blended at the waist
  const torso = segment(T, [
    [-0.09, 0.085, 0.118, 0.0], [0.0, 0.11, 0.148, -0.02], [0.14, 0.124, 0.164, -0.03], [0.27, 0.112, 0.152, -0.012],
    [0.4, 0.104, 0.15, 0.004], [0.55, 0.112, 0.168, 0.01], [0.7, 0.118, 0.188, 0.006], [0.82, 0.112, 0.2, -0.004],
    [0.9, 0.098, 0.19, -0.014], [0.96, 0.075, 0.14, -0.02], [1.01, 0.052, 0.068, -0.012],
  ], { radial: 32, n: 2.3 });
  const tl = B.pelvis / T;
  const torsoW = (t) => { const k = smooth(tl - 0.12, tl + 0.1, t); return [BONE.pelvis, 1 - k, BONE.chest, k]; };
  const suitParts = [skinned(torso, rest[BONE.pelvis], torsoW)];
  const limbParts = [];
  for (const s of [-1, 1]) {
    const bi = (n) => boneIndex(s, n);
    // upper arm from inside the deltoid to the elbow
    const up = segment(B.upper, [[-0.16, 0.05, 0.058], [-0.04, 0.064, 0.068], [0.12, 0.062, 0.064], [0.45, 0.052, 0.054], [0.8, 0.045, 0.047], [1.0, 0.046, 0.048], [1.08, 0.044, 0.046]], { radial: 18 });
    limbParts.push(skinned(up, rest[bi('upper')], blend(bi('upper'), BONE.chest, bi('fore'), 0.22, 0.85)));
    const fo = segment(B.fore, [[-0.06, 0.045, 0.047], [0.08, 0.047, 0.05], [0.3, 0.049, 0.052], [0.7, 0.039, 0.042], [1.0, 0.034, 0.037], [1.06, 0.035, 0.037]], { radial: 18 });
    limbParts.push(skinned(fo, rest[bi('fore')], blend(bi('fore'), bi('upper'), bi('hand'), 0.16, 0.95)));
    // thigh from inside the hip to the knee, shin down into the boot
    const th = segment(B.thigh, [[-0.16, 0.072, 0.07], [-0.02, 0.088, 0.086], [0.2, 0.087, 0.082], [0.55, 0.073, 0.068], [0.88, 0.06, 0.058], [1.0, 0.06, 0.058], [1.07, 0.058, 0.056]], { radial: 20 });
    limbParts.push(skinned(th, rest[bi('thigh')], blend(bi('thigh'), BONE.pelvis, bi('shin'), 0.26, 0.85)));
    const sh = segment(B.shin, [[-0.06, 0.058, 0.056], [0.06, 0.06, 0.057], [0.22, 0.058, 0.053, 0.008], [0.45, 0.052, 0.049]], { radial: 18 });
    limbParts.push(skinned(sh, rest[bi('shin')], blend(bi('shin'), bi('thigh'), null, 0.16, 1)));
  }
  GEO = { rest, suit: mergeGeometries(suitParts), limbs: mergeGeometries(limbParts) };
  // aero hump on the back, flowing into the helmet (rigid on the chest)
  GEO.hump = segment(0.24, [[0, 0.015, 0.06, -0.09], [0.3, 0.045, 0.09, -0.112], [0.7, 0.058, 0.084, -0.118], [1, 0.025, 0.04, -0.092]], { radial: 18, n: 2.4 });
  // armour shells (rigid on their bones)
  GEO.shoulderPad = rbox(0.06, 0.08, 0.035, [0, 0.02, 0]);
  GEO.elbowPuck = rbox(0.05, 0.012, 0.045, [0, 0, 0]);
  GEO.kneeCap = rbox(0.05, 0.085, 0.07, [0, 0.0, 0]);
  GEO.kneeSlider = rbox(0.07, 0.02, 0.055, [0, 0, 0]);
  GEO.neck = segment(0.07, [[-0.1, 0.05, 0.055], [0.6, 0.042, 0.046], [1, 0.044, 0.048]], { radial: 16 });
  // gauntlet glove: cuff + fist wrapped round the grip; knuckle armour on top
  GEO.cuff = segment(0.07, [[0, 0.05, 0.052], [1, 0.043, 0.047]], { radial: 16 }).translate(0, -0.065, 0);
  GEO.fist = rbox(0.06, 0.1, 0.085, [0, 0.055, 0]);
  GEO.knuckle = rbox(0.022, 0.06, 0.07, [0.03, 0.06, 0]);
  GEO.thumb = rbox(0.025, 0.05, 0.025, [-0.01, 0.05, 0.045]);
  // race boot: shaft over the lower shin with a calf brace, then the foot (foot frame: +Y heel->toe, +Z up)
  GEO.shaft = segment(B.shin, [[0.42, 0.064, 0.06], [0.7, 0.058, 0.054], [1.0, 0.052, 0.05], [1.06, 0.05, 0.05]], { radial: 18 });
  GEO.calfBrace = rbox(0.03, 0.16, 0.05, [0.05, 0.75 * B.shin, 0]);
  GEO.buckles = [rbox(0.012, 0.03, 0.045, [-0.058, 0.62 * B.shin, 0]), rbox(0.012, 0.03, 0.045, [-0.054, 0.82 * B.shin, 0])];
  GEO.foot = segment(B.foot, [[-0.1, 0.045, 0.05, 0, 0.005], [0.08, 0.05, 0.052], [0.6, 0.045, 0.04, 0, -0.005], [0.93, 0.033, 0.028, 0, -0.012], [1.0, 0.02, 0.016, 0, -0.016]], { radial: 16, n: 2.6 });
  GEO.sole = rbox(0.09, 0.24, 0.016, [0, 0.085, -0.046]);
  GEO.toeSlider = rbox(0.016, 0.06, 0.03, [0, 0.15, -0.025]);
  // helmet in head space: origin at the top of the neck, +Y up, +X forward.
  // One parametric shell (crown, cheeks, integrated chin bar, open base); the visor and
  // its seal are offsets of the same surface over the eye port, so they fit exactly.
  const HC = [0.012, 0.118, 0];
  const helmR = (dx, dy, dz) => {
    const ax = dx > 0 ? 0.142 : 0.152, ay = dy > 0 ? 0.138 : 0.128, az = 0.122;
    let r = 1 / Math.sqrt((dx / ax) ** 2 + (dy / ay) ** 2 + (dz / az) ** 2);
    // chin bar: forward and down
    r += 0.05 * Math.max(0, dx) ** 2 * Math.max(0, -dy - 0.05) ** 0.8;
    // swept tail toward the neck roll
    r += 0.012 * Math.max(0, -dx) ** 3 * Math.max(0, 0.4 - Math.abs(dy));
    return r;
  };
  const surf = (th0, th1, ph0, ph1, nth, nph, off, uvFull) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nth; i++) {
      const th = th0 + (th1 - th0) * (i / nth);
      for (let j = 0; j <= nph; j++) {
        const ph = ph0 + (ph1 - ph0) * (j / nph);
        const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
        const r = helmR(dx, dy, dz) + off;
        pos.push(HC[0] + dx * r, HC[1] + dy * r, HC[2] + dz * r);
        uv.push(uvFull ? ((ph / (Math.PI * 2)) + 0.5) % 1 : j / nph, uvFull ? 1 - th / Math.PI : 1 - i / nth);
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
  };
  // shell: phi from the back (-PI) round to the back again so the texture seam sits behind
  const shell = surf(0.001, 2.32, -Math.PI, Math.PI, 30, 48, 0, true);
  const EYE = [1.12, 1.72, -0.9, 0.9];
  const port = surf(EYE[0] - 0.035, EYE[1] + 0.03, EYE[2] - 0.05, EYE[3] + 0.05, 8, 24, 0.0015, false);
  const visor = surf(EYE[0], EYE[1], EYE[2], EYE[3], 10, 28, 0.0045, false);
  const chin = surf(1.95, 2.25, -0.32, 0.32, 4, 8, 0.002, false); // chin vent grille
  const spoiler = rbox(0.085, 0.018, 0.12, [-0.128, 0.205, 0], [0, 0, -0.32]);
  const lip = rbox(0.06, 0.014, 0.09, [-0.15, 0.15, 0], [0, 0, -0.95]);
  const vents = [rbox(0.05, 0.014, 0.026, [0.08, 0.247, 0.034], [0, 0, 0.45]), rbox(0.05, 0.014, 0.026, [0.08, 0.247, -0.034], [0, 0, 0.45])];
  const chinVent = rbox(0.012, 0.022, 0.05, [0.165, 0.035, 0], [0, 0, 0.4]);
  const pivots = [ellipsoid(0.02, 0.02, 0.006, [0.04, 0.12, 0.124]), ellipsoid(0.02, 0.02, 0.006, [0.04, 0.12, -0.124])];
  // neck roll round the open base
  const rim = surf(2.28, 2.36, -Math.PI, Math.PI, 2, 40, -0.004, false);
  GEO.helmet = { shell, chin, visor, port, spoiler, lip, vents, chinVent, pivots, rim };
  return GEO;
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
    const mk = (geo, mat, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast; m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    // skeleton in the rest pose, then bind the skinned suit to it
    this.bones = G.rest.map((mx) => {
      const b = new THREE.Bone();
      mx.decompose(b.position, b.quaternion, b.scale);
      this.root.add(b);
      return b;
    });
    this.root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(this.bones);
    for (const [geo, mat] of [[G.suit, mats.suit], [G.limbs, mats.limb]]) {
      const sm = new THREE.SkinnedMesh(geo, mat);
      sm.castShadow = cast; sm.receiveShadow = true; sm.frustumCulled = false;
      this.root.add(sm);
      sm.bind(skeleton);
    }
    const bn = this.bones;
    // rigid gear on the bones
    mk(G.hump, mats.suit, bn[BONE.chest]).position.set(0, B.chest * 0.6, 0);
    mk(G.neck, mats.black, bn[BONE.neck]);
    const H = G.helmet, head = bn[BONE.head];
    for (const g of [H.shell, H.chin]) mk(g, mats.helmet, head);
    mk(H.port, mats.trim, head);
    mk(H.visor, mats.visor, head);
    for (const g of [H.spoiler, H.lip, ...H.vents, H.chinVent, ...H.pivots, H.rim]) mk(g, mats.trim, head);
    for (const s of [-1, 1]) {
      const b = (n) => bn[boneIndex(s, n)];
      // local frames: limb bones have +Y down the limb and +Z = the bike's +z, so the
      // outside of a left limb is -Z and of a right limb +Z
      mk(G.shoulderPad, mats.slider, b('upper')).position.set(-0.005, 0.05, s * 0.058);
      const puck = mk(G.elbowPuck, mats.slider, b('fore'));
      puck.position.set(0.02, 0.01, s * 0.04); puck.rotation.x = s * 0.6;
      mk(G.kneeCap, mats.limb, b('shin')).position.set(-0.05, 0.04, 0);
      const ks = mk(G.kneeSlider, mats.slider, b('shin'));
      ks.position.set(-0.02, 0.03, s * 0.062); ks.rotation.x = Math.PI / 2;
      mk(G.cuff, mats.glove, b('hand')); mk(G.fist, mats.glove, b('hand')); mk(G.knuckle, mats.knuckle, b('hand'));
      mk(G.thumb, mats.glove, b('hand')).position.z = s > 0 ? -0.09 : 0;
      mk(G.shaft, mats.boot, b('shin')); mk(G.calfBrace, mats.bootTrim, b('shin'));
      for (const g of G.buckles) mk(g, mats.slider, b('shin'));
      mk(G.foot, mats.boot, b('foot')); mk(G.sole, mats.black, b('foot'));
      mk(G.toeSlider, mats.slider, b('foot')).position.x = s * 0.048;
    }
    // skeleton targets from the bike
    const seat = ctx.seat || { x: (ctx.pegs?.x ?? -0.2) + 0.05, y: 0.82 };
    this.seat = new THREE.Vector3(seat.x, seat.y, 0);
    this.pegs = ctx.pegs || { x: -0.2, y: 0.4, z: 0.17 };
    // grips in steering-group space (so they follow the bars)
    const grips = ctx.grips || [[0.45, 0.95, -0.33], [0.45, 0.95, 0.33]];
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
    const tuckT = S.tuck * clamp((speed - 22) / 30, 0, 1) * (s.throttle === undefined || s.throttle > 0.4 ? 1 : 0.35) * (s.braking ? 0.2 : 1);
    st.tuck = damp(st.tuck, tuckT, 2.5, dt);
    st.brake = damp(st.brake, s.braking && speed > 3 ? 1 : 0, 6, dt);
    st.stop = damp(st.stop, speed < 0.7 && !s.crashed ? 1 : 0, 5, dt);
    st.air = damp(st.air, s.airborne ? 1 : 0, 6, dt);
    if (s.crashed) st.crash = damp(st.crash, 1, 4, dt); else st.crash = 0;
    const h = st.hang * S.hang, ha = Math.abs(h);
    const c = st.crash;

    // pelvis: on the seat, sliding toward the inside of the corner
    const P = this._p.set(this.seat.x - 0.03 * ha - 0.02 * st.tuck, this.seat.y + 0.075 - 0.02 * ha + 0.03 * st.air * (S === STYLES.mx ? 2 : 0.5), h * 0.11);
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
    const th = Math.max((lo + hi) / 2, st.tuck * S.tuck * 1.22) * (1 - c);
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
      placeSeg(b('hand'), wrist, _c.set(wrist.x + 0.07, wrist.y - 0.035, wrist.z), _b.set(0, 0, 1));

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
