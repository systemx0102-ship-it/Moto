// Professional rider in one-piece race leathers: helmet with tinted visor and rear
// spoiler, aero hump, shoulder/elbow/knee armour with sliders, gauntlet gloves and
// race boots with toe sliders. Stylised proportions, not a likeness of anyone.
// Every frame the body is posed on the machine by two-bone IK: seat under the
// pelvis, hands on the grips (following the steering), balls of the feet on the
// pegs. It hangs off into corners, tucks behind the screen on the straights, sits
// up under braking, dabs a foot at a standstill and slides off in a crash.
import * as THREE from 'three';
import { makeCanvas, toTexture } from '../core/textures.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const V = () => new THREE.Vector3();

// body dimensions (m)
const B = {
  hipW: 0.095, pelvis: 0.15, chest: 0.37, shoulderW: 0.19, neck: 0.085,
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
  const pos = [], uv = [], idx = [];
  const cols = radial + 1;
  for (const [t, rx, rz, ox = 0, oz = 0] of rings) {
    for (let j = 0; j <= radial; j++) {
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
      pos.push(ox, t * len, oz); uv.push(0.5, t);
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
// static geometry (shared by every rider)
let GEO = null;
function geometry() {
  if (GEO) return GEO;
  GEO = {
    // pelvis: seat contact (t<0) to the waist; +X is the front. The lumbar spine bends
    // so the pelvis rotates far less than the chest in a tuck.
    pelvis: segment(B.pelvis, [
      [-0.32, 0.085, 0.12, -0.01], [-0.12, 0.118, 0.152, -0.02], [0.25, 0.13, 0.166, -0.03], [0.65, 0.115, 0.155, -0.015], [1.05, 0.1, 0.145, 0.0],
    ], { radial: 28, n: 2.3, v0: 0, v1: 0.32 }),
    // chest: waist to the base of the neck
    chest: segment(B.chest, [
      [-0.05, 0.095, 0.145, 0.0], [0.3, 0.104, 0.16, 0.006], [0.58, 0.113, 0.185, 0.004], [0.8, 0.108, 0.2, -0.008], [0.93, 0.082, 0.165, -0.02], [1.03, 0.05, 0.07, -0.01],
    ], { radial: 28, n: 2.3, v0: 0.32, v1: 1 }),
    // aero hump on the back, flowing into the helmet
    hump: segment(0.24, [[0, 0.015, 0.06, -0.09], [0.3, 0.045, 0.09, -0.11], [0.7, 0.058, 0.085, -0.115], [1, 0.025, 0.04, -0.09]], { radial: 18, n: 2.4 }),
    shoulder: ellipsoid(0.075, 0.07, 0.08),
    upper: segment(B.upper, [[-0.05, 0.06, 0.065], [0.15, 0.062, 0.066], [0.6, 0.053, 0.055], [1.0, 0.046, 0.048]], { radial: 16 }),
    elbow: ellipsoid(0.05, 0.05, 0.05),
    elbowPuck: rbox(0.06, 0.012, 0.05, [0, 0, 0]),
    fore: segment(B.fore, [[-0.02, 0.047, 0.05], [0.3, 0.05, 0.052], [0.8, 0.038, 0.042], [1.0, 0.035, 0.04]], { radial: 16 }),
    // gauntlet glove: cuff + fist wrapped round the grip; knuckle armour on top
    cuff: segment(0.07, [[0, 0.05, 0.052], [1, 0.043, 0.047]], { radial: 14 }).translate(0, -0.065, 0),
    fist: rbox(0.06, 0.1, 0.085, [0, 0.055, 0]),
    knuckle: rbox(0.022, 0.06, 0.07, [0.03, 0.06, 0]),
    hip: ellipsoid(0.085, 0.085, 0.085),
    thigh: segment(B.thigh, [[-0.04, 0.085, 0.085], [0.2, 0.09, 0.088], [0.7, 0.068, 0.07], [1.0, 0.056, 0.058]], { radial: 18 }),
    knee: ellipsoid(0.062, 0.062, 0.062),
    kneeSlider: rbox(0.075, 0.02, 0.055, [0, 0, 0]),
    shin: segment(B.shin, [[-0.02, 0.058, 0.058], [0.25, 0.06, 0.056], [0.45, 0.055, 0.052]], { radial: 16 }),
    // race boot: shaft over the lower shin with a calf brace, then the foot
    shaft: segment(B.shin, [[0.42, 0.064, 0.06], [0.7, 0.058, 0.054], [1.0, 0.052, 0.05], [1.06, 0.05, 0.05]], { radial: 16 }),
    // foot frame: +Y heel->toe, +Z up, +X = the bike's +z
    foot: segment(B.foot, [[-0.1, 0.045, 0.05, 0, 0.005], [0.08, 0.05, 0.052], [0.6, 0.045, 0.04, 0, -0.005], [0.93, 0.033, 0.028, 0, -0.012], [1.0, 0.02, 0.016, 0, -0.016]], { radial: 16, n: 2.6 }),
    sole: rbox(0.09, 0.24, 0.016, [0, 0.085, -0.046]),
    toeSlider: rbox(0.016, 0.06, 0.03, [0, 0.15, -0.025]),
    calfBrace: rbox(0.03, 0.16, 0.05, [0.05, 0.75 * B.shin, 0]),
    neck: segment(0.11, [[0, 0.05, 0.055], [1, 0.05, 0.055]], { radial: 14 }),
  };
  // helmet in head space: origin at the top of the neck, +Y up, +X forward
  const shell = new THREE.SphereGeometry(1, 34, 22);
  shell.scale(0.148, 0.136, 0.124); shell.translate(0.015, 0.12, 0);
  const chin = ellipsoid(0.08, 0.064, 0.105, [0.092, 0.046, 0], 24, 14);
  const visor = new THREE.SphereGeometry(1, 30, 12, Math.PI - 0.82, 1.64, 1.2, 0.55);
  visor.scale(0.152, 0.14, 0.128); visor.translate(0.015, 0.12, 0);
  const port = new THREE.SphereGeometry(1, 30, 12, Math.PI - 0.86, 1.72, 1.16, 0.63);
  port.scale(0.15, 0.138, 0.126); port.translate(0.015, 0.12, 0);
  const spoiler = rbox(0.085, 0.02, 0.12, [-0.122, 0.2, 0], [0, 0, -0.35]);
  const lip = rbox(0.065, 0.015, 0.095, [-0.145, 0.155, 0], [0, 0, -0.9]);
  const vents = [rbox(0.05, 0.015, 0.028, [0.085, 0.237, 0.033], [0, 0, 0.5]), rbox(0.05, 0.015, 0.028, [0.085, 0.237, -0.033], [0, 0, 0.5])];
  const chinVent = rbox(0.016, 0.03, 0.05, [0.17, 0.042, 0], [0, 0, 0.3]);
  const pivots = [ellipsoid(0.02, 0.02, 0.008, [0.03, 0.12, 0.128]), ellipsoid(0.02, 0.02, 0.008, [0.03, 0.12, -0.128])];
  const rim = segment(0.03, [[0, 0.108, 0.094, -0.01], [1, 0.122, 0.105, 0.0]], { radial: 24, caps: false });
  rim.translate(0, -0.005, 0);
  GEO.helmet = { shell, chin, visor, port, spoiler, lip, vents, chinVent, pivots, rim };
  return GEO;
}

// ---------------------------------------------------------------------------
const _a = V(), _b = V(), _c = V(), _d = V(), _x = V(), _y = V(), _z = V(), _m = new THREE.Matrix4();

// orient a segment mesh from joint a toward joint b; z hint = side axis of the bend plane
function placeSeg(mesh, a, b, zHint) {
  _y.subVectors(b, a).normalize();
  _z.copy(zHint).addScaledVector(_y, -_y.dot(zHint));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  mesh.quaternion.setFromRotationMatrix(_m);
  mesh.position.copy(a);
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
    const mk = (geo, mat, parent = this.root) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = opts.castShadow !== false; m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    // skeleton targets from the bike
    const seat = ctx.seat || { x: (ctx.pegs?.x ?? -0.2) + 0.05, y: 0.82 };
    this.seat = new THREE.Vector3(seat.x, seat.y, 0);
    const pegs = ctx.pegs || { x: -0.2, y: 0.4, z: 0.17 };
    this.pegs = pegs;
    // grips in steering-group space (so they follow the bars)
    const grips = ctx.grips || [[0.45, 0.95, -0.33], [0.45, 0.95, 0.33]];
    this.steer.updateMatrix();
    const inv = this.steer.matrix.clone().invert();
    this.gripLocal = grips.map((p) => new THREE.Vector3(...p).applyMatrix4(inv));

    // meshes
    this.pelvisMesh = mk(G.pelvis, mats.suit);
    this.torso = mk(G.chest, mats.suit);
    this.hump = mk(G.hump, mats.suit, this.torso);
    this.hump.position.set(0, B.chest * 0.6, 0);
    this.neck = mk(G.neck, mats.black);
    this.head = new THREE.Group(); this.root.add(this.head);
    const H = G.helmet;
    for (const g of [H.shell, H.chin]) mk(g, mats.helmet, this.head);
    mk(H.port, mats.trim, this.head);
    mk(H.visor, mats.visor, this.head);
    for (const g of [H.spoiler, H.lip, ...H.vents, H.chinVent, ...H.pivots, H.rim]) mk(g, mats.trim, this.head);
    this.limbs = [];
    for (const s of [-1, 1]) {
      const L = {
        s,
        shoulder: mk(G.shoulder, mats.limb), upper: mk(G.upper, mats.limb), elbow: mk(G.elbow, mats.limb),
        puck: mk(G.elbowPuck, mats.slider), fore: mk(G.fore, mats.limb),
        hand: new THREE.Group(),
        hip: mk(G.hip, mats.suit), thigh: mk(G.thigh, mats.limb), knee: mk(G.knee, mats.limb), slider: mk(G.kneeSlider, mats.slider),
        shin: mk(G.shin, mats.limb), shaft: mk(G.shaft, mats.boot), foot: new THREE.Group(),
        sh: V(), el: V(), wr: V(), hp: V(), kn: V(), an: V(), toe: V(),
      };
      this.root.add(L.hand, L.foot);
      mk(G.cuff, mats.glove, L.hand); mk(G.fist, mats.glove, L.hand); mk(G.knuckle, mats.knuckle, L.hand);
      mk(G.foot, mats.boot, L.foot); mk(G.sole, mats.black, L.foot);
      mk(G.toeSlider, mats.slider, L.foot).position.x = s * 0.048;
      mk(G.calfBrace, mats.bootTrim, L.shaft);
      this.limbs.push(L);
    }
    // smoothed pose state
    this.st = { hang: 0, tuck: 0, brake: 0, stop: 1, crash: 0, air: 0 };
    this._p = V(); this._spine = V(); this._pdir = V(); this._lumb = V(); this._lat = V(); this._neck = V(); this._g = [V(), V()];
    this.update({ speed: 0 }, 1);
  }

  update(s, dt) {
    const st = this.st, S = this.style;
    const lean = s.lean || 0, speed = Math.abs(s.speed || 0);
    st.hang = damp(st.hang, clamp(lean / 0.85, -1, 1), 5, dt);
    const tuckT = S.tuck * clamp((speed - 22) / 30, 0, 1) * (s.throttle === undefined || s.throttle > 0.4 ? 1 : 0.35) * (s.braking ? 0.2 : 1);
    st.tuck = damp(st.tuck, tuckT, 2.5, dt);
    st.brake = damp(st.brake, s.braking && speed > 3 ? 1 : 0, 6, dt);
    st.stop = damp(st.stop, speed < 0.7 && !s.crashed ? 1 : 0, 5, dt);
    st.air = damp(st.air, s.airborne ? 1 : 0, 6, dt);
    if (s.crashed) st.crash = damp(st.crash, 1, 4, dt); else st.crash = 0;
    const h = st.hang * S.hang, ha = Math.abs(h), side = Math.sign(h) || 1;
    const c = st.crash;

    // pelvis: on the seat, sliding toward the inside of the corner
    const P = this._p.set(this.seat.x - 0.03 * ha - 0.02 * st.tuck, this.seat.y + 0.075 - 0.02 * ha + 0.03 * st.air * (S === STYLES.mx ? 2 : 0.5), h * 0.11);
    // grips follow the steering
    this.steer.updateMatrix();
    const gl = this._g[0].copy(this.gripLocal[0]).applyMatrix4(this.steer.matrix);
    const gr = this._g[1].copy(this.gripLocal[1]).applyMatrix4(this.steer.matrix);
    // wrists sit just behind and above the grips
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
    placeSeg(this.pelvisMesh, P, lumb, lat);
    placeSeg(this.torso, lumb, _d.copy(lumb).add(spine), lat);
    const neckBase = _d.copy(lumb).addScaledVector(spine, B.chest);

    // head: look ahead (chin up in a tuck), stay closer to level than the bike
    const look = this._neck.set(Math.sin(th) * 0.8 + 0.25, Math.cos(th) * 0.5 + 0.55 - 0.15 * st.tuck, latBend * 0.6 + h * 0.15).normalize();
    this.neck.position.copy(neckBase);
    placeSeg(this.neck, neckBase, _c.copy(neckBase).add(look), lat);
    this.head.position.copy(neckBase).addScaledVector(look, B.neck);
    // head frame: forward toward the horizon, rolled back toward level
    _x.set(1, -0.12 - 0.1 * st.tuck, 0).normalize();
    _y.set(-Math.sin(th) * 0.25, 1, -lean * 0.45 + h * 0.2).normalize();
    _y.addScaledVector(_x, -_y.dot(_x)).normalize();
    _z.crossVectors(_x, _y);
    _m.makeBasis(_x, _y, _z);
    this.head.quaternion.setFromRotationMatrix(_m);

    for (const L of this.limbs) {
      const s0 = L.s;
      const inside = h !== 0 && Math.sign(h) === s0 ? ha : 0;
      // arms
      L.sh.copy(lumb).addScaledVector(spine, B.chest * 0.88).addScaledVector(lat, s0 * B.shoulderW);
      const wrist = L.wr.copy(s0 < 0 ? gl : gr);
      if (c > 0) wrist.lerp(_c.copy(L.sh).add(_b.set(0.15, 0.2, s0 * 0.45)), c);
      const pole = _a.set(-0.35, -1, s0 * 0.5);
      ik(L.sh, wrist, B.upper, B.fore, pole, L.el);
      placeSeg(L.upper, L.sh, L.el, _b.set(0, 0, 1));
      placeSeg(L.fore, L.el, wrist, _b.set(0, 0, 1));
      L.shoulder.position.copy(L.sh);
      L.elbow.position.copy(L.el);
      L.puck.position.copy(L.el).addScaledVector(_c.subVectors(L.el, L.sh).normalize(), 0.0).add(_b.set(-0.035, -0.02, s0 * 0.03));
      L.puck.quaternion.copy(L.fore.quaternion);
      // hand: from the wrist toward the grip, palm round it
      L.hand.position.copy(wrist);
      placeSeg(L.hand, wrist, _c.set(wrist.x + 0.07, wrist.y - 0.035, wrist.z), _b.set(0, 0, 1));
      L.hand.position.copy(wrist);

      // legs
      L.hp.copy(P).addScaledVector(lat, s0 * B.hipW).addScaledVector(pdir, 0.02);
      const pg = this.pegs;
      const ankle = L.an.set(pg.x + S.foot[0], pg.y + S.foot[1], s0 * (pg.z + 0.035));
      // foot down when stopped (left side), legs dangle a little in the air
      if (s0 < 0 && st.stop > 0.01) ankle.lerp(_c.set(pg.x + 0.12, 0.09, -(pg.z + 0.2)), st.stop);
      if (c > 0) ankle.lerp(_c.copy(L.hp).add(_b.set(0.1, -0.78, s0 * 0.22)), c);
      const kneePole = _a.set(0.9, 0.3 - 0.5 * inside, s0 * (0.12 + 1.4 * inside));
      ik(L.hp, ankle, B.thigh, B.shin, kneePole, L.kn);
      placeSeg(L.thigh, L.hp, L.kn, _b.set(0, 0, 1));
      placeSeg(L.shin, L.kn, ankle, _b.set(0, 0, 1));
      placeSeg(L.shaft, L.kn, ankle, _b.set(0, 0, 1));
      L.hip.position.copy(L.hp);
      L.knee.position.copy(L.kn);
      // knee slider on the outside of the knee, puck facing out
      _c.subVectors(L.kn, L.hp).normalize();
      _b.set(0, 0, s0).addScaledVector(_c, -_c.z * s0).normalize();
      _a.copy(L.kn).addScaledVector(_b, 0.058);
      placeSeg(L.slider, _a, _d.copy(_a).add(_b), _c);
      // foot points forward along the bike, toes slightly down onto the peg
      const toe = L.toe.set(ankle.x + B.foot * 0.98, ankle.y - 0.05 - (s0 < 0 ? 0.03 * st.stop : 0), ankle.z + s0 * 0.01);
      placeSeg(L.foot, ankle, toe, _b.set(0, 1, 0));
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
