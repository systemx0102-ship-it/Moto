// Wheels, tyres and brakes at close-up fidelity. Wheel-local space: axle at the origin,
// axis = Z (positive = bike right), the wheel plane is X/Y.
import * as THREE from 'three';
import { revolve, turned, sweep, superellipse, extrude, circle, hexHead, capScrew, orient, ring, cyl, box, place, rod, torus } from './geo.js';
import { M } from '../core/materials.js';
import { rotorTexture } from '../core/textures.js';
import { rotorRoughness } from '../core/pbr.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Tyre: real motorcycle section. Bead tucked inside the rim flange, sidewall bulge, a
// near-circular crown arc over the tread. v: 0.05 bead .. 0.3 shoulder .. 0.5 crown.
export function tyreGeo(R, rimR, tw, rimW, { knobby = false, seg = 96 } = {}) {
  const H = R - rimR, W = tw / 2, w = rimW / 2;
  const rs = rimR + (knobby ? 0.78 : 0.66) * H; // shoulder radius
  const crownR = knobby ? R - 0.012 : R;
  const dz = W, dr = crownR - rs;
  const Rc = (dz * dz + dr * dr) / (2 * dr); // crown arc radius
  const r0 = crownR - Rc;
  const half = [];
  // bead (hidden in the flange) -> over the flange lip -> sidewall bulge -> shoulder
  half.push([rimR + 0.006, w - 0.003, 0.02]);
  half.push([rimR + 0.014, w + 0.0, 0.05]);
  half.push([rimR + 0.021, w + 0.006, 0.08]);
  const side = [[rimR + 0.03, w + 0.014], [rimR + 0.42 * H, W * 0.985], [rimR + 0.55 * H, W * 1.0], [rs, W * 0.995]];
  side.forEach(([r, z], i) => half.push([r, z, 0.1 + (0.2 * (i + 1)) / side.length]));
  // tread arc from the shoulder to the crown
  const a1 = Math.asin(Math.min(1, dz / Rc));
  const n = 18;
  for (let i = 1; i <= n; i++) {
    const a = a1 * (1 - i / n);
    half.push([r0 + Rc * Math.cos(a), Rc * Math.sin(a), 0.3 + 0.2 * (i / n)]);
  }
  const prof = [];
  for (let i = 0; i < half.length; i++) { const [r, z, v] = half[i]; prof.push([r, -z, v]); }
  for (let i = half.length - 2; i >= 0; i--) { const [r, z, v] = half[i]; prof.push([r, z, 1 - v]); }
  return revolve(prof, seg, 'z');
}

// tapered knob block: wider at the root than at the face (12 faces)
let _knob = null;
function knob(h, l, w) {
  if (!_knob) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); if (x > 0) { p.setY(i, p.getY(i) * 0.8); p.setZ(i, p.getZ(i) * 0.82); } }
    g.computeVertexNormals();
    _knob = g;
  }
  return _knob.clone().scale(h, l, w);
}

// Knob blocks for an off-road tyre (merged)
export function knobsGeo(R, tw, rimR) {
  const out = [];
  const count = Math.round((TAU * R) / 0.036);
  const W = tw / 2;
  for (let i = 0; i < count; i++) {
    const phi = (i / count) * TAU;
    const rows = i % 2 ? [[0, 0.03, 0.028], [-0.62, 0.022, 0.02], [0.62, 0.022, 0.02]] : [[-0.34, 0.024, 0.022], [0.34, 0.024, 0.022], [-0.9, 0.02, 0.016], [0.9, 0.02, 0.016]];
    for (const [f, wz, wl] of rows) {
      const z = f * W * 0.92;
      const a = Math.asin(Math.min(0.95, Math.abs(f) * 0.85)) * Math.sign(f);
      const rr = R - 0.014 - (1 - Math.cos(a)) * 0.05;
      const g = knob(0.016, wl, wz);
      g.rotateX(a * 0.9);
      place(g, { p: [Math.cos(phi) * rr, Math.sin(phi) * rr, z], r: [0, 0, phi] });
      out.push(g);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cast rim: J-hook flanges with a rolled lip, bead seats, drop-centre well, barrel.
export function rimGeo(rimR, rimW, seg = 128) {
  const w = rimW / 2;
  const P = [
    [rimR + 0.017, w + 0.0065], [rimR + 0.0195, w + 0.002], [rimR + 0.017, w - 0.003], [rimR + 0.008, w - 0.0045],
    [rimR + 0.001, w - 0.006], [rimR + 0.002, w - 0.016], [rimR - 0.004, w - 0.02], [rimR - 0.012, w * 0.42],
    [rimR - 0.012, -w * 0.42], [rimR - 0.004, -(w - 0.02)], [rimR + 0.002, -(w - 0.016)], [rimR + 0.001, -(w - 0.006)],
    [rimR + 0.008, -(w - 0.0045)], [rimR + 0.017, -(w - 0.003)], [rimR + 0.0195, -(w + 0.002)], [rimR + 0.017, -(w + 0.0065)],
    [rimR + 0.006, -(w + 0.0075)], [rimR - 0.012, -(w + 0.004)], [rimR - 0.02, -(w - 0.006)], [rimR - 0.025, -w * 0.5],
    [rimR - 0.026, 0], [rimR - 0.025, w * 0.5], [rimR - 0.02, w - 0.006], [rimR - 0.012, w + 0.004], [rimR + 0.006, w + 0.0075],
  ];
  return turned(P, seg, 'z');
}
// machined flange face ring (both sides)
export function rimLipGeo(rimR, rimW, seg = 128) {
  const w = rimW / 2;
  const out = [];
  for (const s of [-1, 1]) {
    const g = revolve([[rimR - 0.009, s * (w + 0.0068)], [rimR + 0.0035, s * (w + 0.0081)], [rimR + 0.0145, s * (w + 0.0072)]], seg, 'z');
    out.push(g);
  }
  return out;
}

// One cast spoke from the hub boss to the rim barrel, swept with a rounded section that
// flares into fillets at both ends. a0: angle at the hub, a1: angle at the rim.
export function spokeGeo(r0, r1, a0, a1, { width = 0.022, depth = 0.02, bend = 0, z0 = 0, z1 = 0 } = {}) {
  const pts = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = r0 + (r1 - r0) * t;
    const a = a0 + (a1 - a0) * (t * t * (3 - 2 * t) * 0.5 + t * 0.5) + bend * Math.sin(Math.PI * t);
    pts.push([Math.cos(a) * r, Math.sin(a) * r, z0 + (z1 - z0) * t]);
  }
  const sec = (t) => {
    const fl = 1 + 0.9 * Math.max(0, (t - 0.82) / 0.18) ** 2 + 0.7 * Math.max(0, (0.12 - t) / 0.12) ** 2;
    const wd = width * (1.12 - 0.3 * t) * fl;
    const dp = depth * (1.15 - 0.35 * t) * (1 + 0.4 * Math.max(0, (t - 0.85) / 0.15));
    return superellipse(dp / 2, wd / 2, 2.6, 14);
  };
  return sweep(pts, sec, { segments: 14, up: [0, 0, 1], caps: true });
}

// Cast hub with bearing bosses and disc mounting flanges / sprocket carrier
export function hubGeo(hw, { discFlange = 0, carrier = false } = {}) {
  const prof = [[0.017, -hw - 0.006], [0.03, -hw - 0.006], [0.034, -hw], [0.04, -hw + 0.006], [0.046, -hw * 0.5], [0.05, 0], [0.046, hw * 0.5], [0.04, hw - 0.006], [0.034, hw], [0.03, hw + 0.006], [0.017, hw + 0.006], [0.017, -hw - 0.006]];
  const parts = [turned(prof, 40, 'z')];
  if (discFlange) {
    for (const s of discFlange > 1 ? [-1, 1] : [1]) {
      // six bosses the rotor carrier bolts onto
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        const b = cyl(0.009, 0.0105, 0.012, 12, 'z');
        b.translate(Math.cos(a) * 0.056, Math.sin(a) * 0.056, s * (hw - 0.002));
        parts.push(b);
      }
    }
  }
  if (carrier) {
    const c = turned([[0.03, 0], [0.09, 0], [0.092, 0.004], [0.09, 0.03], [0.07, 0.034], [0.03, 0.034]], 48, 'z');
    c.translate(0, 0, -hw - 0.03);
    parts.push(c);
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Brake rotor: two faces of the friction band (drilled / wave pattern by alpha test),
// edges, and for floating rotors an anodised carrier spider with ten bobbins.
const rotorMats = new Map();
function rotorMaterial(style) {
  if (!rotorMats.has(style)) {
    rotorMats.set(style, new THREE.MeshStandardMaterial({
      map: rotorTexture(style), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 1, roughness: 0.34, roughnessMap: rotorRoughness(), name: 'rotor',
    }));
  }
  return rotorMats.get(style);
}

export function rotor(A, group, z, R, { style = 'drilled', carrier = '#c9a227', float = true, band } = {}) {
  const bw = band ?? Math.min(0.036, R * 0.24);
  const rin = R - bw;
  const th = 0.0055;
  const mat = rotorMaterial(style);
  for (const s of [-1, 1]) {
    const g = ring(rin, R * 1.02, 96);
    g.translate(0, 0, z + s * th / 2);
    A.add(group, g, mat, { local: true });
  }
  // inner edge (outer edge reads from the face texture's alpha and the rotor's thinness)
  const ie = cyl(rin, rin, th, 96, 'z', true); ie.translate(0, 0, z);
  A.add(group, ie, M.steel(0x7d8288), { local: true });
  if (style !== 'wave') { const oe = cyl(R * 0.998, R * 0.998, th, 96, 'z', true); oe.translate(0, 0, z); A.add(group, oe, M.steel(0x9a9ea4), { local: true }); }
  const sg = Math.sign(z) || 1;
  if (float) {
    // carrier: hub ring and outer ring joined by six arms, big windows between them
    const out = circle(rin + 0.005, 72);
    const holes = [circle(0.033, 24)];
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; holes.push(circle(0.0045, 8, Math.cos(a) * 0.056, Math.sin(a) * 0.056)); }
    const ra = 0.072, rb = rin - 0.007, aw = 0.0075;
    for (let k = 0; k < 6; k++) {
      const t0 = ((k + 0.5) / 6) * TAU, t1 = ((k + 1.5) / 6) * TAU;
      const win = [];
      for (let i = 0; i <= 8; i++) { const t = t0 + aw / rb + ((t1 - t0 - (2 * aw) / rb) * i) / 8; win.push([Math.cos(t) * rb, Math.sin(t) * rb]); }
      for (let i = 8; i >= 0; i--) { const t = t0 + (aw * 1.6) / ra + ((t1 - t0 - (3.2 * aw) / ra) * i) / 8; win.push([Math.cos(t) * ra, Math.sin(t) * ra]); }
      holes.push(win.reverse());
    }
    const car = extrude(out, 0.0045, { holes, bevel: 0.0008, curveSegments: 2 });
    car.translate(0, 0, z + sg * 0.0005);
    A.add(group, car, M.anodized(new THREE.Color(carrier).getHex()), { local: true });
    // bobbins (floating buttons) bridging carrier and rotor
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + 0.18;
      const b = turned([[0.0001, -0.0045], [0.0055, -0.0045], [0.0065, -0.0035], [0.0065, 0.0035], [0.0055, 0.0045], [0.0001, 0.0045]], 12, 'z');
      b.translate(Math.cos(a) * (rin + 0.002), Math.sin(a) * (rin + 0.002), z);
      A.add(group, b, M.machined(), { local: true });
    }
    // carrier bolts on the hub bosses
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      const h = capScrew(0.009, 0.005); orient(h, [Math.cos(a) * 0.056, Math.sin(a) * 0.056, z + sg * 0.0025], [0, 0, sg]);
      A.add(group, h, M.steel(0x6f7378), { local: true });
    }
  } else {
    // solid-mount rear rotor: inner web with lightening slots straight to the hub
    const out = circle(rin + 0.004, 48);
    const holes = [circle(0.03, 20)];
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + 0.3; holes.push(circle(0.011, 12, Math.cos(a) * ((rin + 0.03) / 2 + 0.01), Math.sin(a) * ((rin + 0.03) / 2 + 0.01))); }
    const web = extrude(out, 0.004, { holes, bevel: 0.0006, curveSegments: 3 });
    web.translate(0, 0, z);
    A.add(group, web, M.steel(0x8a8e94), { local: true });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      const h = hexHead(0.01, 0.005); orient(h, [Math.cos(a) * 0.045, Math.sin(a) * 0.045, z + sg * 0.002], [0, 0, sg]);
      A.add(group, h, M.steel(0x6f7378), { local: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Radial-mount monobloc caliper (bike space). Body follows the rotor curvature, two piston
// bulges per side, pad window with pin, mounting ears with cap screws, bleed nipple.
export function caliperGeo(ctx, group, axle, discR, z, angleDeg, color, size = 1, { pistons = 2, logo = true } = {}) {
  const A = ctx.A;
  const a = (angleDeg * Math.PI) / 180;
  const sg = Math.sign(z) || 1;
  const rc = discR - 0.016 * size; // over the friction band
  const half = (0.046 * size) / rc; // half angular length of the straight part
  const e = 0.025 * size; // half height (radial)
  const rOut = rc + e, rIn = rc - e;
  const mat = M.anodized(color);
  const P = (r, t) => [Math.cos(t) * r, Math.sin(t) * r];
  // outline in the caliper frame (radial = +X at t = 0): a stadium bent along the rotor
  const out = [];
  const m = 10;
  for (let i = 0; i <= m; i++) out.push(P(rOut, -half + (2 * half * i) / m));
  const cap = (h, f0, f1) => {
    const ec = P(rc, h), d = [Math.cos(h), Math.sin(h)], tg = [-Math.sin(h), Math.cos(h)];
    for (let i = 1; i < 6; i++) { const f = f0 + ((f1 - f0) * i) / 6; out.push([ec[0] + e * (d[0] * Math.cos(f) + tg[0] * Math.sin(f)), ec[1] + e * (d[1] * Math.cos(f) + tg[1] * Math.sin(f))]); }
  };
  cap(half, 0, Math.PI);
  for (let i = m; i >= 0; i--) out.push(P(rIn, -half + (2 * half * i) / m));
  cap(-half, Math.PI, Math.PI * 2);
  // caliper frame -> bike space (rotate into the wheel plane at angle a, centre on the axle)
  const toBike = (g, zz) => { g.rotateZ(a); g.translate(axle[0], axle[1], zz); return g; };
  const depth = 0.066 * size;
  const body = extrude(out, depth, { bevel: 0.008 * size, bevelSeg: 3, curveSegments: 4 });
  A.add(group, toBike(body, z), mat);
  // parting line between the two halves
  const grooveO = out.map(([x, y]) => { const r = Math.hypot(x, y), t = Math.atan2(y, x); const r2 = rc + (r - rc) * 1.02 + 0.0004; return [Math.cos(t) * r2, Math.sin(t) * r2]; });
  A.add(group, toBike(extrude(grooveO, 0.003, { bevel: 0 }), z), M.black());
  // piston bulges on the outboard face
  const zo = z + sg * (depth / 2);
  for (let k = 0; k < pistons; k++) {
    const t = pistons === 1 ? 0 : (k / (pistons - 1) - 0.5) * (half + e / rc) * 1.05;
    const [px, py] = P(rc - 0.002, t);
    const dome = turned([[0.0001, 0], [0.0148 * size, 0], [0.0138 * size, 0.0035], [0.0095 * size, 0.006], [0.0001, 0.0066]], 20, 'z');
    if (sg < 0) dome.rotateY(Math.PI);
    dome.translate(px, py, 0);
    A.add(group, toBike(dome, zo - sg * 0.0025), mat);
  }
  // pad window on the radial top face: dark slot, pad backing plates, pad pin
  const win = box(0.006, 0.05 * size, 0.034 * size, 0.0015);
  win.translate(rOut - 0.0015, 0, 0);
  A.add(group, toBike(win, z), M.black());
  for (const s of [-1, 1]) {
    const pad = box(0.0045, 0.044 * size, 0.0045, 0.001);
    pad.translate(rOut + 0.0005, 0, s * 0.0085);
    A.add(group, toBike(pad, z), M.steel(0x3a3c40));
  }
  const pin = rod([rOut + 0.003, 0.006, -depth / 2 + 0.002], [rOut + 0.003, 0.006, depth / 2 - 0.002], 0.0026, 8);
  A.add(group, toBike(pin, z), M.steel(0xb8bcc2));
  // mounting ears toward the fork foot with radial cap screws
  for (const s of [-1, 1]) {
    const t = s * half * 0.9;
    const [ex, ey] = P(rOut + 0.005, t);
    const ear = box(0.016, 0.02, 0.026, 0.005);
    ear.rotateZ(t); ear.translate(ex, ey, 0);
    A.add(group, toBike(ear, z + sg * 0.016), mat);
    const scr = capScrew(0.011, 0.009);
    orient(scr, [...P(rOut + 0.012, t), 0], [Math.cos(t), Math.sin(t), 0]);
    A.add(group, toBike(scr, z + sg * 0.016), M.steel(0x8a8e94));
  }
  // bleed nipple on the trailing end
  const bt = half * 0.95;
  const bl = turned([[0.0001, 0], [0.0042, 0], [0.0042, 0.005], [0.0026, 0.011], [0.0001, 0.011]], 8, 'y');
  bl.rotateZ(bt - Math.PI / 2);
  bl.translate(...P(rOut - 0.003, bt), 0);
  A.add(group, toBike(bl, z + sg * 0.014), M.steel(0xc0c4c8));
  if (logo) {
    const lg = box(0.011 * size, 0.052 * size, 0.0012, 0.0005);
    lg.translate(rc + 0.004, 0, 0);
    A.add(group, toBike(lg, zo + sg * 0.0004), M.plastic(0xeeeeee));
  }
  const pos = [axle[0] + Math.cos(a) * (discR * 0.86 + 0.03), axle[1] + Math.sin(a) * (discR * 0.86 + 0.03)];
  (ctx.calipers || (ctx.calipers = [])).push({ group, pos: [pos[0], pos[1], z], a, banjo: toBikePoint(axle, a, P(rOut + 0.004, -half * 0.5), z + sg * 0.016) });
}
function toBikePoint(axle, a, p, z) {
  return [axle[0] + p[0] * Math.cos(a) - p[1] * Math.sin(a), axle[1] + p[0] * Math.sin(a) + p[1] * Math.cos(a), z];
}

export { TAU, torus };
