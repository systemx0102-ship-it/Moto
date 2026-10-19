// Cockpit hardware: clip-ons / tubular bars with clamps, moulded grips, bar-end weights,
// switchgear, radial brake master cylinder with remote reservoir, clutch perch, levers with
// span adjusters, TFT dash in a bezel under a glass cover, mirrors. Bike space; parts that
// steer go in the 'steer' group.
import * as THREE from 'three';
import { revolve, turned, sweep, superellipse, extrude, roundRect, circle, hexHead, capScrew, orient, rod, tube, box, place, cyl, sphere, loft } from './geo.js';
import { M } from '../core/materials.js';

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2] ?? 0);
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// turned profile laid along the segment from p in direction d (profile h along d)
function along(profile, p, d, seg = 20) {
  const g = revolve(profile, seg, 'y');
  return orient(g.rotateX(Math.PI / 2), p, d);
}

// grip + controls on one bar from `inner` (where the bar leaves the clamp) to `end`
function barControls(ctx, inner, end, s, o) {
  const A = ctx.A;
  const d = nrm(sub(end, inner));
  const gripLen = 0.125;
  const g0 = add(end, d, -gripLen - 0.004);
  // moulded grip with a flange at the inboard end
  A.add('steer', along([[0.0125, 0], [0.0175, 0.002], [0.0175, 0.008], [0.016, 0.01], [0.0165, gripLen - 0.012], [0.0172, gripLen - 0.004], [0.0158, gripLen]], g0, d, 24), M.grip());
  // bar-end weight
  A.add('steer', along([[0.0001, 0], [0.0135, 0], [0.0155, 0.004], [0.0155, 0.022], [0.012, 0.03], [0.006, 0.031], [0.0001, 0.031]], add(end, d, -0.004), d, 24), o.barEndMat || M.machined());
  (ctx.grips || (ctx.grips = [])).push(add(end, d, -gripLen * 0.5));
  // switchgear housing inboard of the grip
  const swc = add(g0, d, -0.022);
  const sw = box(0.05, 0.042, 0.04, 0.012);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v3(d));
  sw.applyQuaternion(q); sw.translate(swc[0] - 0.004, swc[1] - 0.003, swc[2]);
  A.add('steer', sw, M.plastic(0x16171a));
  // buttons on the switch block face toward the rider
  for (let i = 0; i < 3; i++) {
    const b = box(0.006, 0.01, 0.014, 0.002); b.applyQuaternion(q);
    b.translate(swc[0] - 0.03, swc[1] + 0.012 - i * 0.012, swc[2]);
    A.add('steer', b, i === 0 && s > 0 ? M.plastic(0xb01818) : M.plastic(0x2a2b2e));
  }
  // lever pivot block / master cylinder just inboard of the switch
  const pc = add(swc, d, -0.034);
  const fwd = [1, 0, 0];
  if (s > 0) {
    // radial master cylinder pointing forward with its clamp, remote reservoir on a stalk
    const mc = along([[0.0001, -0.012], [0.0125, -0.012], [0.0125, 0.05], [0.0105, 0.058], [0.0001, 0.058]], add(pc, [0.004, 0.0, 0]), fwd, 18);
    A.add('steer', mc, M.anodized(o.mcColor ?? 0x1b1c1f));
    const clampR = along([[0.0001, 0], [0.017, 0], [0.017, 0.026], [0.0001, 0.026]], add(pc, d, -0.013), d, 16);
    A.add('steer', clampR, M.anodized(o.mcColor ?? 0x1b1c1f));
    const resP = add(pc, [-0.005, 0.07, 0]);
    A.add('steer', rod(add(pc, [0.02, 0.012, 0]), add(resP, [0, -0.02, 0]), 0.0035, 6), M.black());
    const cup = turned([[0.0001, 0], [0.015, 0], [0.0155, 0.004], [0.0155, 0.036], [0.0001, 0.036]], 20, 'y'); cup.translate(...add(resP, [0, -0.02, 0]));
    A.add('steer', cup, M.tintLens(0x3a2a14));
    const fluid = turned([[0.0001, 0], [0.0138, 0], [0.0138, 0.022], [0.0001, 0.022]], 16, 'y'); fluid.translate(...add(resP, [0, -0.019, 0]));
    A.add('steer', fluid, M.plastic(0x6a4a18));
    const capR = turned([[0.0001, 0], [0.0165, 0], [0.0165, 0.008], [0.014, 0.011], [0.0001, 0.011]], 20, 'y'); capR.translate(...add(resP, [0, 0.016, 0]));
    A.add('steer', capR, M.anodized(o.capColor ?? 0x1b1c1f));
    // banjo + braided line leaving the master cylinder
    const bj = hexHead(0.012, 0.012); orient(bj, add(pc, [0.03, -0.014, 0]), [0, -1, 0]); A.add('steer', bj, M.machined());
    ctx.masterCyl = add(pc, [0.03, -0.024, 0]);
  } else {
    // clutch perch with its cable adjuster
    const pr = along([[0.0001, 0], [0.017, 0], [0.017, 0.024], [0.0001, 0.024]], add(pc, d, -0.012), d, 16);
    A.add('steer', pr, M.anodized(0x1b1c1f));
    const body = box(0.036, 0.022, 0.024, 0.006); body.translate(...add(pc, [0.02, 0.0, 0]));
    A.add('steer', body, M.anodized(0x1b1c1f));
    const adj = along([[0.0001, 0], [0.0055, 0], [0.0055, 0.016], [0.0001, 0.016]], add(pc, [0.036, 0.004, -0.0]), [1, -0.2, 0], 10);
    A.add('steer', adj, M.machined());
    ctx.clutchPerch = add(pc, [0.05, 0.0, 0]);
  }
  // lever: forged blade from the pivot sweeping out in front of the grip, span adjuster dial
  const piv = add(pc, [0.035, -0.004, 0]);
  const tip = add(add(end, d, -0.022), [0.042, -0.016, 0]);
  const mid = add(lerp(piv, tip, 0.45), [0.012, -0.002, 0]);
  const blade = sweep([piv, add(lerp(piv, mid, 0.5), [0.004, 0, 0]), mid, lerp(mid, tip, 0.6), tip], (t) => superellipse(0.0075 - t * 0.0018, 0.0034, 2.6, 10), { segments: 18, up: [0, 1, 0] });
  A.add('steer', blade, o.leverMat || M.machined());
  const dial = along([[0.0001, 0], [0.0085, 0], [0.0085, 0.007], [0.0001, 0.007]], add(piv, [0, 0.006, 0]), [0, 1, 0], 12);
  A.add('steer', dial, M.anodized(o.dialColor ?? 0xc81e1e));
  const pivB = hexHead(0.009, 0.006); orient(pivB, add(piv, [0, -0.012, 0]), [0, -1, 0]); A.add('steer', pivB, M.steel(0x9a9ea4));
  // throttle / clutch cable leaving the housing
  return { switchPos: swc, pivot: piv };
}

export function handlebar(ctx, o = {}) {
  const type = o.type || 'wide';
  const top = ctx.Lf + ctx.headLen;
  const A = ctx.A;
  const fw = ctx.fw;
  const tubeR = ctx.forkTubeR ?? 0.029;
  const ends = [];
  ctx.grips = [];
  const barMat = o.mat || M.anodized(0x1e1f22);
  if (type === 'clipon') {
    for (const s of [-1, 1]) {
      // clamp ring round the fork tube under the top clamp, with its pinch bolt
      const tc = top - 0.022;
      const ring = along([[tubeR + 0.0004, -0.014], [tubeR + 0.0085, -0.014], [tubeR + 0.0095, -0.01], [tubeR + 0.0095, 0.012], [tubeR + 0.0085, 0.015], [tubeR + 0.0004, 0.015]], ctx.fp(tc, s * fw), [ctx.d.x, ctx.d.y, 0], 28);
      A.add('steer', ring, M.anodized(0x1e1f22));
      const pb = capScrew(0.008, 0.007);
      orient(pb, add(ctx.fp(tc, s * fw), [-ctx.n.x * (tubeR + 0.013), -ctx.n.y * (tubeR + 0.013), s * 0.006]), [0, 0, s]);
      A.add('steer', pb, M.steel(0x8d9197));
      // stalk + bar: out, down and back
      const a = ctx.fp(tc, s * (fw + tubeR + 0.006));
      const b = [a[0] - 0.085, a[1] - 0.035, s * (fw + 0.215)];
      const st = sweep([add(a, [0, 0, -s * 0.004]), lerp(a, b, 0.12)], () => superellipse(0.013, 0.013, 2.4, 14), { segments: 3, up: [0, 1, 0] });
      A.add('steer', st, M.anodized(0x1e1f22));
      const s0 = lerp(a, b, 0.1);
      A.add('steer', along([[0.011, 0], [0.011, Math.hypot(...sub(b, s0))]], s0, nrm(sub(b, s0)), 16), barMat);
      ends.push(b);
    }
  } else {
    const rise = o.rise ?? 0.1, back = o.back ?? 0.1, half = o.half ?? 0.38;
    const c = ctx.sp(top + 0.02);
    const pts = (s) => [[c[0], c[1] + 0.02, 0], [c[0] - back * 0.3, c[1] + rise * 0.8, s * half * 0.45], [c[0] - back * 0.8, c[1] + rise, s * half * 0.85], [c[0] - back, c[1] + rise * 0.95, s * half]];
    const r = o.r ?? 0.0125;
    if (type === 'ape') {
      const ape = (s) => [[c[0], c[1] + 0.02, s * 0.06], [c[0] + 0.02, c[1] + 0.35, s * 0.12], [c[0] - 0.05, c[1] + 0.42, s * 0.28], [c[0] - 0.16, c[1] + 0.38, s * 0.38]];
      for (const s of [-1, 1]) A.add('steer', tube(ape(s), 0.013, { radial: 14 }), M.chrome());
      for (const s of [-1, 1]) ends.push(ape(s)[3]);
    } else {
      // tapered (fat) bar: 28 mm in the middle, 22 mm at the grips
      for (const s of [-1, 1]) {
        const p = pts(s);
        A.add('steer', sweep(p, (t) => superellipse(r * (1.25 - 0.25 * Math.min(1, t * 1.6)), r * (1.25 - 0.25 * Math.min(1, t * 1.6)), 2, 16), { segments: 20 }), barMat);
        ends.push(p[3]);
      }
      if (type === 'mx') {
        // cross brace with its pad
        const b0 = pts(-1)[1], b1 = pts(1)[1];
        A.add('steer', rod(add(b0, [0, 0.05, 0]), add(b1, [0, 0.05, 0]), 0.0095, 12), barMat);
        const pad = sweep([add(b0, [0, 0.05, 0.03]), add(b1, [0, 0.05, -0.03])], () => superellipse(0.022, 0.018, 2.4, 14), { segments: 2 });
        A.add('steer', pad, M.plastic(o.padColor ?? 0x1a1a1a));
      }
      // riser clamp with four cap screws
      const cl = box(0.055, 0.032, 0.11, 0.012);
      place(cl, { p: [c[0] - 0.005, c[1] + 0.035, 0], r: [0, 0, ctx.rake * 0.5] });
      A.add('steer', cl, M.anodized(0x1e1f22));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const b = capScrew(0.008, 0.006); orient(b, [c[0] - 0.005 + sx * 0.016, c[1] + 0.052, sz * 0.04], [0, 1, 0]); A.add('steer', b, M.steel(0x8d9197));
      }
      for (const s of [-1, 1]) { const rs = along([[0.0001, 0], [0.016, 0], [0.016, 0.03], [0.0001, 0.03]], [c[0], c[1] - 0.004, s * 0.04], [0, 1, 0], 16); A.add('steer', rs, M.anodized(0x1e1f22)); }
    }
  }
  ctx.barEnds = ends;
  for (const e of ends) {
    const s = Math.sign(e[2]);
    const inner = s > 0 ? [e[0] + 0.06, e[1] - 0.02, e[2] - 0.2] : [e[0] + 0.06, e[1] - 0.02, e[2] + 0.2];
    barControls(ctx, inner, e, s, o);
  }
  // keep grip order left, right
  ctx.grips.sort((p, q) => p[2] - q[2]);
  return ends;
}

// TFT dash: rounded housing, thin bezel, live screen, glass cover with reflections
export function dash(ctx, c, w = 0.13, h = 0.08, o = {}) {
  const A = ctx.A, grp = o.group || 'chassis';
  const tilt = o.tilt ?? -0.9;
  const hous = extrude(roundRect(w + 0.026, h + 0.026, 0.012), 0.032, { bevel: 0.006, bevelSeg: 2 });
  const toBike = (g, dz) => { g.rotateY(-Math.PI / 2); g.translate(-dz, 0, 0); g.rotateZ(tilt); g.translate(c[0], c[1], c[2]); return g; };
  A.add(grp, toBike(hous, 0), M.plastic(0x101113));
  const bez = extrude(roundRect(w + 0.01, h + 0.01, 0.006), 0.004, { holes: [roundRect(w, h, 0.003)], bevel: 0.001 });
  A.add(grp, toBike(bez, 0.0175), M.gloss(0x0a0a0b));
  const screen = new THREE.PlaneGeometry(w, h);
  A.add(grp, toBike(screen, 0.0172), ctx.mats.dash);
  const cover = new THREE.PlaneGeometry(w + 0.008, h + 0.008);
  A.add(grp, toBike(cover, 0.0195), M.lens());
  ctx.dashPos = c;
}

// Sport mirror: pillowed housing on a stalk, glass facing back, optional LED indicator
export function mirror(ctx, base, side, o = {}) {
  const A = ctx.A, grp = o.group || 'steer';
  const z = side * (o.reach ?? 0.27);
  const head = [base[0] + (o.dx ?? -0.02), base[1] + (o.up ?? 0.16), z];
  const stalk = sweep([base, lerp(base, head, 0.5), add(head, [0.01, -0.005, -side * 0.025])], (t) => superellipse(0.008 - t * 0.002, 0.005, 2.4, 10), { segments: 8, up: [1, 0, 0] });
  A.add(grp, stalk, o.mat || M.gloss(0x0d0d0f));
  const bev = 0.014;
  const W = 0.15 - bev * 2, H = 0.068 - bev * 2;
  const out = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const outer = c * side > 0; // outboard end tapers to a point, inboard end stays round
    out.push([side * (W / 2) * Math.sign(c) * Math.abs(c) ** 0.6, (H / 2) * Math.sign(s) * Math.abs(s) ** 0.75 * (outer ? 0.8 : 1) + (outer ? 0.004 * c * side : 0)]);
  }
  // local: x lateral, y up, z fore-aft (+z = back); depth centred on z = 0
  const place2 = (g, dz) => { g.translate(0, 0, dz); g.rotateY(-Math.PI / 2); g.rotateX(side * 0.1); g.translate(head[0], head[1] + 0.02, head[2] + side * 0.045); return g; };
  A.add(grp, place2(extrude(out, 0.046, { bevel: bev, bevelSeg: 4, curveSegments: 2 }), 0), o.mat || M.gloss(0x0d0d0f));
  A.add(grp, place2(extrude(out.map(([x, y]) => [x * 0.92, y * 0.86]), 0.0015, { bevel: 0 }), 0.0232), M.chrome());
  if (o.signal) {
    const led = sweep([[-side * W * 0.1, -H * 0.62, -0.02], [side * W * 0.2, -H * 0.66, -0.022], [side * W * 0.5, -H * 0.4, -0.02]], () => superellipse(0.0035, 0.003, 2, 8), { segments: 10 });
    A.add(grp, place2(led, 0), M.emissive(0xff8a00, 0.35));
  }
}

export { loft, sphere, cyl, circle };
