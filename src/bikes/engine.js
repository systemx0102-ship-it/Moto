// Realistic engine units. Bike space: x forward, y up, z right.
// A cast crankcase (bevelled side-profile extrusion) carries the gearbox and sump;
// clutch, alternator and sprocket covers bolt to its flanks; cylinder banks stand on
// the deck with liquid jackets or air fins, a head, a cam cover with coil packs, exhaust
// ports in front and throttle bodies behind. Returns port positions so designs can route
// their headers from the real exhaust ports.
import * as THREE from 'three';
import { box, cyl, lathe, tube, place, sideExtrude, smoothOutline } from './geo.js';
import { M } from '../core/materials.js';

const V2 = (x, y) => [x, y];

// Domed round cover with a ring of hex bolts, facing ±z.
function roundCover(A, c, r, side, z, mat, o = {}) {
  const pts = [];
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; pts.push(V2(Math.cos(a) * r * (o.ex ?? 1), Math.sin(a) * r)); }
  const g = sideExtrude(pts, o.depth ?? 0.012, { bevel: o.bevel ?? 0.01, curveSegments: 4 });
  g.translate(c[0], c[1], z);
  A.add('chassis', g, mat);
  if (o.boss) {
    const b = sideExtrude(pts.map(([x, y]) => [x * o.boss, y * o.boss]), 0.006, { bevel: 0.006, curveSegments: 4 });
    b.translate(c[0] + (o.bossDx ?? 0), c[1] + (o.bossDy ?? 0), z + side * ((o.depth ?? 0.012) / 2 + (o.bevel ?? 0.01) + 0.004));
    A.add('chassis', b, o.bossMat || mat);
  }
  const nb = o.bolts ?? 8;
  const zb = z + side * ((o.depth ?? 0.012) / 2 + (o.bevel ?? 0.01) * 0.6);
  for (let k = 0; k < nb; k++) {
    const a = (k / nb) * Math.PI * 2 + 0.2;
    const hb = cyl(0.0055, 0.0055, 0.008, 6, 'z');
    place(hb, { p: [c[0] + Math.cos(a) * r * 0.88 * (o.ex ?? 1), c[1] + Math.sin(a) * r * 0.88, zb] });
    A.add('chassis', hb, M.chrome());
  }
}

// Ribbed spin-on oil filter along direction d from point p.
function oilFilter(A, p, d, mat) {
  const prof = [[0.001, 0], [0.03, 0]];
  for (let i = 0; i < 9; i++) prof.push([i % 2 ? 0.034 : 0.036, 0.008 + i * 0.006]);
  prof.push([0.034, 0.064], [0.02, 0.07], [0.001, 0.07]);
  const g = lathe(prof, 20, 'y');
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(d[0], d[1], d[2] ?? 0).normalize());
  g.applyQuaternion(q);
  g.translate(p[0], p[1], p[2] ?? 0);
  A.add('chassis', g, mat);
}

/**
 * o: { pos:[x,y] crank centre, layout:'inline'|'v'|'single', cyl: cylinders per bank,
 *      tilt: forward tilt of the (front) bank from vertical, vAngle, width, pitch (bore spacing),
 *      blockH, headH, cooling:'liquid'|'air', twoStroke, scale, caseMat, coverMat, camMat, filterMat,
 *      throttle (bool), rearGearbox (length of the case behind the crank) }
 */
export function engineUnit(ctx, o) {
  const { A } = ctx;
  const s = o.scale ?? 1;
  const [cx, cy] = o.pos;
  const n = o.cyl ?? 4;
  const pitch = (o.pitch ?? 0.072) * s;
  const W = o.width ?? Math.max(0.17, n * pitch + 0.05);
  const caseMat = o.caseMat || M.engine(0x2b2d31);
  const coverMat = o.coverMat || M.engine(0x55595f);
  const camMat = o.camMat || coverMat;
  const air = o.cooling === 'air';
  const back = (o.rearGearbox ?? 0.235) * s;
  // ---- crankcase: bevelled side-profile casting with gearbox lobe and sump
  const outline = smoothOutline([
    [0.05 * s, 0.1 * s], [0.12 * s, 0.04 * s], [0.125 * s, -0.05 * s], [0.09 * s, -0.12 * s], [0.04 * s, -0.16 * s],
    [-0.1 * s, -0.165 * s], [-back * 0.78, -0.12 * s], [-back, -0.04 * s], [-back * 0.96, 0.05 * s], [-back * 0.72, 0.1 * s],
    [-0.07 * s, 0.115 * s], [-0.02 * s, 0.112 * s],
  ], 6).map(([x, y]) => [x + cx, y + cy]);
  const bev = 0.014;
  A.add('chassis', sideExtrude(outline, W - bev * 2, { bevel: bev, curveSegments: 4 }), caseMat);
  // finned oil sump
  const sump = sideExtrude(smoothOutline([[0.07 * s, -0.12 * s], [0.06 * s, -0.19 * s], [-0.08 * s, -0.195 * s], [-0.12 * s, -0.13 * s]], 5).map(([x, y]) => [x + cx, y + cy]), W * 0.62, { bevel: 0.008, curveSegments: 3 });
  A.add('chassis', sump, caseMat);
  for (let i = 0; i < 4; i++) {
    const f = box(0.15 * s, 0.004, W * 0.66, 0.0015);
    place(f, { p: [cx - 0.01 * s, cy - (0.15 + i * 0.012) * s, 0] });
    A.add('chassis', f, caseMat);
  }
  const drain = cyl(0.008, 0.008, 0.012, 6, 'y'); place(drain, { p: [cx - 0.02 * s, cy - 0.2 * s, 0] }); A.add('chassis', drain, M.chrome());
  // ---- side covers: clutch (right), alternator + sprocket (left)
  const zr = W / 2 + 0.004, zl = -W / 2 - 0.004;
  roundCover(A, [cx - 0.1 * s, cy - 0.01 * s], 0.086 * s, 1, zr, coverMat, { boss: 0.5, bossDx: 0.01 * s, bolts: 10, depth: 0.014, bevel: 0.012 });
  const cap = cyl(0.014, 0.014, 0.012, 12, 'z'); place(cap, { p: [cx - 0.06 * s, cy + 0.06 * s, zr + 0.026] }); A.add('chassis', cap, M.anodized(0xc81e1e));
  roundCover(A, [cx, cy], 0.072 * s, -1, zl, coverMat, { boss: 0.42, bolts: 8, depth: 0.012, bevel: 0.014 });
  roundCover(A, [cx - back * 0.82, cy - 0.015 * s], 0.05 * s, -1, zl, M.engine(0x1c1d20), { ex: 1.3, bolts: 3, depth: 0.008, bevel: 0.008 });
  // shift shaft + water pump / starter
  const ss = cyl(0.008, 0.008, 0.03, 8, 'z'); place(ss, { p: [cx - 0.13 * s, cy - 0.08 * s, zl - 0.02] }); A.add('chassis', ss, M.chrome());
  const starter = cyl(0.03 * s, 0.03 * s, W * 0.7, 18, 'z'); place(starter, { p: [cx - 0.12 * s, cy + 0.095 * s, 0] }); A.add('chassis', starter, M.black());
  if (!air) {
    roundCover(A, [cx + 0.03 * s, cy - 0.1 * s], 0.032 * s, -1, zl - 0.01, coverMat, { bolts: 4, depth: 0.02, bevel: 0.008 });
  }
  if (o.filter !== false) oilFilter(A, [cx + 0.1 * s, cy - 0.1 * s, 0.04], [0.75, -0.66, 0], o.filterMat || M.anodized(0x1a3a8a));

  // ---- cylinder banks
  const banks = [];
  const tilt = o.tilt ?? 0.5;
  if (o.layout === 'v') {
    banks.push({ t: tilt, base: [0.03 * s, 0.09 * s] });
    banks.push({ t: tilt - (o.vAngle ?? Math.PI / 2), base: [-0.05 * s, 0.1 * s], rear: true });
  } else banks.push({ t: tilt, base: [0.015 * s, 0.1 * s] });
  const ports = [], intakes = [];
  const blockH = (o.blockH ?? 0.12) * s, headH = (o.headH ?? 0.065) * s;
  const Wb = n * pitch + 0.03;
  for (const b of banks) {
    const ax = [Math.sin(b.t), Math.cos(b.t)], pr = [Math.cos(b.t), -Math.sin(b.t)];
    const at = (u, v) => [cx + b.base[0] + ax[0] * u + pr[0] * v, cy + b.base[1] + ax[1] * u + pr[1] * v];
    const rot = [0, 0, -b.t];
    const D = 0.12 * s;
    if (air) {
      const core = box(D * 0.82, blockH, Wb - 0.02, 0.01); place(core, { p: [...at(blockH / 2, 0), 0], r: rot }); A.add('chassis', core, caseMat);
      const nf = Math.round(blockH / (0.013 * s));
      for (let i = 0; i < nf; i++) {
        const f = box(D * 1.35, 0.0045, Wb + 0.03, 0.002);
        place(f, { p: [...at((i + 0.5) * (blockH / nf), 0), 0], r: rot });
        A.add('chassis', f, o.finMat || caseMat);
      }
    } else {
      const blk = box(D, blockH, Wb, 0.016); place(blk, { p: [...at(blockH / 2, 0), 0], r: rot }); A.add('chassis', blk, caseMat);
      // water-jacket casting line + coolant outlet
      const rib = box(D + 0.008, 0.008, Wb + 0.008, 0.003); place(rib, { p: [...at(blockH * 0.55, 0), 0], r: rot }); A.add('chassis', rib, caseMat);
    }
    const hd = box(D * 1.1, headH, Wb + 0.006, 0.014); place(hd, { p: [...at(blockH + headH / 2, 0), 0], r: rot }); A.add('chassis', hd, air ? (o.finMat || caseMat) : coverMat);
    if (air) {
      for (let i = 0; i < 3; i++) { const f = box(D * 1.4, 0.004, Wb + 0.03, 0.002); place(f, { p: [...at(blockH + headH * (0.25 + i * 0.25), 0), 0], r: rot }); A.add('chassis', f, o.finMat || caseMat); }
    }
    if (!o.twoStroke) {
      // cam cover with ribs, bolts and coil packs
      const cc = box(D * 0.96, 0.04 * s, Wb - 0.012, 0.016); place(cc, { p: [...at(blockH + headH + 0.018 * s, 0), 0], r: rot }); A.add('chassis', cc, camMat);
      for (const v of [-0.03, 0, 0.03]) {
        const rb = box(0.005, 0.01, Wb - 0.05, 0.002); place(rb, { p: [...at(blockH + headH + 0.04 * s, v * s), 0], r: rot }); A.add('chassis', rb, camMat);
      }
      for (let k = 0; k < n; k++) {
        const z = (k - (n - 1) / 2) * pitch;
        const coil = cyl(0.013, 0.013, 0.028, 12, 'y'); place(coil, { p: [...at(blockH + headH + 0.05 * s, -0.012 * s), z], r: rot }); A.add('chassis', coil, M.black());
      }
      for (const v of [-1, 1]) for (const zz of [-1, 1]) {
        const bo = cyl(0.005, 0.005, 0.008, 6, 'y'); place(bo, { p: [...at(blockH + headH + 0.04 * s, v * 0.05 * s), zz * (Wb / 2 - 0.02)], r: rot }); A.add('chassis', bo, M.chrome());
      }
    } else {
      // two-stroke head: plug + cap per cylinder
      for (let k = 0; k < n; k++) {
        const z = (k - (n - 1) / 2) * pitch;
        const pc = cyl(0.011, 0.011, 0.035, 10, 'y'); place(pc, { p: [...at(blockH + headH + 0.012, 0), z], r: rot }); A.add('chassis', pc, M.black());
      }
    }
    // exhaust ports (front of the bank; rear bank exhausts backwards)
    const pv = b.rear ? -0.07 * s : 0.07 * s;
    for (let k = 0; k < n; k++) {
      const z = (k - (n - 1) / 2) * pitch;
      const pp = at(o.twoStroke ? blockH * 0.45 : blockH + headH * 0.4, pv);
      ports.push([pp[0], pp[1], z]);
      const flange = cyl(0.024, 0.024, 0.012, 14, 'y'); place(flange, { p: [pp[0], pp[1], z], r: [0, 0, -b.t + (b.rear ? Math.PI / 2 : -Math.PI / 2)] }); A.add('chassis', flange, M.darkChrome());
      // intakes (opposite side of the head)
      if (!o.twoStroke && o.throttle !== false) {
        const ip = at(blockH + headH * 0.55, -pv * 1.05);
        intakes.push([ip[0], ip[1], z]);
        const dir = b.rear ? [pr[0] * 0.6 + ax[0], pr[1] * 0.6 + ax[1]] : [-pr[0] * 0.6 + ax[0], -pr[1] * 0.6 + ax[1]];
        const len = 0.07 * s, dl = Math.hypot(dir[0], dir[1]);
        const tb = tube([[ip[0], ip[1], z], [ip[0] + (dir[0] / dl) * len, ip[1] + (dir[1] / dl) * len, z]], 0.02, { radial: 12 });
        A.add('chassis', tb, M.aluminum());
      }
    }
  }
  // ---- coolant hoses to the radiator
  if (!air && ctx.radiators && ctx.radiators.length) {
    const r = ctx.radiators[0];
    const b = banks[0];
    const ax = [Math.sin(b.t), Math.cos(b.t)], pr = [Math.cos(b.t), -Math.sin(b.t)];
    const top = [cx + b.base[0] + ax[0] * (blockH + headH * 0.8) + pr[0] * 0.05 * s, cy + b.base[1] + ax[1] * (blockH + headH * 0.8) + pr[1] * 0.05 * s];
    const rz = r.c[2] ? -r.c[2] : Math.min(r.w / 2 - 0.03, 0.1);
    A.add('chassis', tube([[top[0], top[1], -0.04], [top[0] + 0.04, top[1] + 0.02, -0.08], [r.c[0] - 0.04, r.c[1] + r.h / 2 - 0.04, -rz]], 0.012, { radial: 8 }), M.rubber());
    A.add('chassis', tube([[cx + 0.03 * s, cy - 0.1 * s, -W / 2 - 0.03], [cx + 0.1 * s, cy - 0.08 * s, -W / 2 - 0.02], [r.c[0] - 0.04, r.c[1] - r.h / 2 + 0.04, -rz]], 0.012, { radial: 8 }), M.rubber());
  }
  ctx.engine = { ports, intakes, width: W };
  return ctx.engine;
}

