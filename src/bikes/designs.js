// Twelve procedural motorcycle designs. Bike space: x forward, y up, z right.
import * as THREE from 'three';
import {
  setupChassis, wheel, caliper, fork, frontFender, rearFender, swingarm, chain, belt, shock,
  finnedCylinder, crankcase, radiator, header, muffler, expansionChamber, headlightRound, ledStrip,
  tailLight, mirror, handlebar, dash, footpegs, numberPlate, closedLathe, details,
  loft, loftProfile, tube, taperTube, lathe, box, cyl, sphere, place, rod, spring, torus, mirrorZ, V, DEG,
} from './parts.js';
import { M } from '../core/materials.js';

// ---------------------------------------------------------------------------
// Shared helpers
function wheels(ctx, o = {}) {
  const f = ctx.front, r = ctx.rear;
  const fDiscR = o.fDiscR ?? 0.155, rDiscR = o.rDiscR ?? 0.11;
  const fDiscs = o.singleFrontDisc ? [{ r: fDiscR, z: -(ctx.fw - 0.03), style: o.discStyle, carrier: o.carrier }]
    : [{ r: fDiscR, z: -(ctx.fw - 0.03), style: o.discStyle, carrier: o.carrier }, { r: fDiscR, z: ctx.fw - 0.03, style: o.discStyle, carrier: o.carrier }];
  wheel(ctx, 'frontWheel', { ...f, discs: o.noFrontDisc ? null : fDiscs, rimMat: ctx.mats.wheel, rimStripe: o.rimStripe });
  wheel(ctx, 'rearWheel', {
    ...r, discs: o.noRearDisc ? null : [{ r: rDiscR, z: (r.w / 2 + 0.03), style: o.discStyle === 'wave' ? 'wave' : 'drilled', carrier: '#2a2a2a' }],
    rimMat: ctx.mats.wheel, rimStripe: o.rimStripe,
    sprocket: o.noSprocket ? null : { r: o.sprocketR ?? 0.1, z: -(r.w / 2 + 0.012), color: o.sprocketColor },
  });
  const calColor = o.caliperColor ?? 0xc81e1e;
  if (!o.noFrontDisc) {
    caliper(ctx, 'forkSlider', [f.x, f.y], fDiscR, -(ctx.fw - 0.03), 150, calColor);
    if (!o.singleFrontDisc) caliper(ctx, 'forkSlider', [f.x, f.y], fDiscR, ctx.fw - 0.03, 150, calColor);
  }
  if (!o.noRearDisc) caliper(ctx, 'swingarm', [r.x, r.y], rDiscR, r.w / 2 + 0.03, 300, 0x2a2a2a, 0.8);
}

function paintMats(ctx) {
  return ctx.mats;
}

// Twin-spar aluminium frame beams from the head to the swingarm pivot.
function twinSpar(ctx, o = {}) {
  const H = ctx.head, [px, py] = ctx.pivot;
  const zw = o.z ?? 0.13;
  for (const s of [-1, 1]) {
    const g = loft([
      { x: H[0] + 0.02, y: H[1] + 0.06, w: 0.03, ht: 0.06, n: 4, z: s * 0.05 },
      { x: H[0] - 0.12, y: H[1] + 0.02, w: 0.025, ht: 0.07, n: 4, z: s * zw * 0.85 },
      { x: (H[0] + px) / 2, y: (H[1] + py) / 2 + 0.07, w: 0.022, ht: 0.065, n: 4, z: s * zw },
      { x: px + 0.06, y: py + 0.05, w: 0.022, ht: 0.08, n: 4, z: s * zw * 0.95 },
      { x: px - 0.01, y: py - 0.02, w: 0.024, ht: 0.07, n: 4, z: s * zw * 0.9 },
    ], { radial: 16, sub: 6, capStart: true, capEnd: true });
    ctx.A.add('chassis', g, o.mat || M.aluminum());
  }
  // head tube
  ctx.A.add('chassis', rod(ctx.sp(ctx.Lf - 0.01), ctx.sp(ctx.Lf + ctx.headLen + 0.01), 0.038, 18), o.mat || M.aluminum());
}

// Subframe rails under seat/tail
function subframe(ctx, from, to, z = 0.09, r = 0.012, mat) {
  for (const s of [-1, 1]) ctx.A.add('chassis', rod([from[0], from[1], s * z], [to[0], to[1], s * z * 0.7], r, 8), mat || M.aluminum());
}

function seatLoft(ctx, x0, x1, y, w, h, o = {}) {
  const g = loft([
    { x: x1, y: y - 0.005, w: w * (o.rearW ?? 0.8), ht: h * 0.8, hb: 0.02, n: 3 },
    { x: x1 + (x0 - x1) * 0.4, y: y + (o.dip ?? 0), w, ht: h, hb: 0.025, n: 3.2 },
    { x: x0, y: y + (o.frontRise ?? 0.0), w: w * (o.frontW ?? 0.7), ht: h * 0.9, hb: 0.025, n: 3 },
  ], { radial: 22, sub: 6, capStart: true, capEnd: true });
  ctx.A.add('chassis', g, ctx.mats.seat);
}

// Modern multi-panel sport fairing (superbike / GP), sculpted from creased profiles:
// sharp-nosed cowl with a headlight crease, side panels with a hard flank line, V-shaped
// belly pan, faceted tank and a knife-edge tail. Separate shells so colour breaks and
// shut lines read like real bodywork.
function sportBody(ctx, P) {
  const { A, mats } = ctx;
  const k = P.k ?? 1;
  const nx = P.nose ?? 0.97;
  const S = (x, ...pts) => ({ x, pts: pts.map(([z, y]) => [z * k, y]) });
  // nose cowl: bottom centre, chin flank, headlight crease, shoulder crease, top centre
  const cowl = loftProfile([
    S(nx, [0, 0.822], [0.012, 0.826], [0.022, 0.835], [0.012, 0.845], [0, 0.848]),
    S(nx - 0.04, [0, 0.79], [0.045, 0.8], [0.075, 0.835], [0.05, 0.865], [0, 0.875]),
    S(nx - 0.13, [0, 0.745], [0.075, 0.763], [0.13, 0.838], [0.1, 0.9], [0, 0.915]),
    S(nx - 0.25, [0, 0.71], [0.1, 0.728], [0.172, 0.828], [0.148, 0.925], [0, 0.95]),
    S(nx - 0.37, [0, 0.69], [0.118, 0.7], [0.198, 0.8], [0.178, 0.922], [0, 0.958]),
    S(nx - 0.47, [0, 0.7], [0.12, 0.7], [0.19, 0.78], [0.17, 0.89], [0, 0.93]),
    S(nx - 0.53, [0, 0.72], [0.1, 0.72], [0.15, 0.77], [0.13, 0.86], [0, 0.88]),
  ], { sub: 6, around: 4, creases: [2, 3], capStart: true, capEnd: true });
  A.add('chassis', cowl, mats.paintPlain);
  // side panels: lower edge rakes back to clear the front wheel; hard flank crease
  const side = loftProfile([
    S(0.66, [0, 0.73], [0.08, 0.735], [0.15, 0.775], [0.15, 0.83], [0, 0.855]),
    S(0.56, [0, 0.665], [0.11, 0.672], [0.19, 0.7], [0.186, 0.81], [0, 0.845]),
    S(0.48, [0, 0.58], [0.125, 0.59], [0.205, 0.64], [0.196, 0.8], [0, 0.84]),
    S(0.38, [0, 0.39], [0.13, 0.41], [0.212, 0.57], [0.2, 0.79], [0, 0.835]),
    S(0.2, [0, 0.37], [0.13, 0.39], [0.207, 0.56], [0.192, 0.78], [0, 0.83]),
    S(0.06, [0, 0.43], [0.12, 0.45], [0.182, 0.57], [0.172, 0.76], [0, 0.8]),
    S(-0.04, [0, 0.56], [0.08, 0.57], [0.122, 0.62], [0.112, 0.73], [0, 0.75]),
  ], { sub: 6, around: 4, creases: [2], capStart: true, capEnd: true });
  A.add('chassis', side, mats.paint);
  // V-section belly pan
  const belly = loftProfile([
    S(0.43, [0, 0.37], [0.05, 0.38], [0.09, 0.42], [0.1, 0.47], [0, 0.49]),
    S(0.33, [0, 0.225], [0.07, 0.238], [0.14, 0.31], [0.15, 0.42], [0, 0.45]),
    S(0.12, [0, 0.2], [0.075, 0.212], [0.146, 0.28], [0.15, 0.4], [0, 0.43]),
    S(-0.06, [0, 0.25], [0.06, 0.26], [0.12, 0.32], [0.12, 0.4], [0, 0.42]),
    S(-0.14, [0, 0.32], [0.02, 0.325], [0.04, 0.35], [0.04, 0.38], [0, 0.39]),
  ], { sub: 6, around: 3, creases: [2], capStart: true, capEnd: true });
  A.add('chassis', belly, P.bellyMat || mats.paint2Solid);
  // fuel tank with faceted knee recesses
  const tank = loftProfile([
    S(0.47, [0, 0.845], [0.08, 0.85], [0.1, 0.885], [0.08, 0.93], [0, 0.945]),
    S(0.34, [0, 0.83], [0.15, 0.84], [0.178, 0.9], [0.14, 0.99], [0, 1.02]),
    S(0.14, [0, 0.83], [0.152, 0.84], [0.185, 0.9], [0.15, 0.99], [0, 1.025]),
    S(-0.04, [0, 0.83], [0.115, 0.84], [0.138, 0.88], [0.11, 0.94], [0, 0.96]),
    S(-0.14, [0, 0.845], [0.07, 0.85], [0.08, 0.865], [0.06, 0.888], [0, 0.897]),
  ], { sub: 6, around: 4, creases: [2], capStart: true, capEnd: true });
  A.add('chassis', tank, mats.paintPlain);
  // knife-edge tail unit
  const tx = P.tailX ?? -0.9;
  const hump = P.hump ?? 0.055;
  const tail = loftProfile([
    S(-0.02, [0, 0.7], [0.1, 0.71], [0.15, 0.76], [0.13, 0.83], [0, 0.84]),
    S(-0.3, [0, 0.74], [0.08, 0.75], [0.13, 0.8], [0.12, 0.86], [0, 0.87]),
    S((-0.3 + tx) / 2 - 0.05, [0, 0.8], [0.05, 0.81], [0.1, 0.87], [0.08, 0.875 + hump], [0, 0.885 + hump]),
    S(tx + 0.12, [0, 0.86], [0.03, 0.87], [0.06, 0.92], [0.045, 0.955], [0, 0.962]),
    S(tx, [0, 0.92], [0.008, 0.925], [0.015, 0.945], [0.01, 0.958], [0, 0.96]),
  ], { sub: 6, around: 4, creases: [2, 3], capStart: true, capEnd: true });
  A.add('chassis', tail, mats.paintPlain);
  // dark undertray beneath the tail
  const under = loft([
    { x: -0.2, y: 0.71, w: 0.09 * k, ht: 0.03, hb: 0.03, n: 2.4 },
    { x: -0.55, y: 0.79, w: 0.07 * k, ht: 0.03, hb: 0.03, n: 2.4 },
    { x: -0.76, y: 0.85, w: 0.035 * k, ht: 0.02, hb: 0.02, n: 2.2 },
  ], { radial: 18, sub: 4, capStart: true, capEnd: true });
  A.add('chassis', under, M.plastic(0x101012));
  seatLoft(ctx, -0.12, -0.44, 0.868, 0.125 * k, 0.03);
  // windscreen: bottom edges sit on the cowl shoulder crease
  const screen = loft([
    { x: nx - 0.12, y: 0.898, w: 0.1 * k, ht: 0.03, n: 2.1 },
    { x: nx - 0.25, y: 0.925, w: 0.15 * k, ht: 0.075, n: 2.1 },
    { x: nx - 0.37, y: 0.922, w: 0.18 * k, ht: 0.13, n: 2.1 },
    { x: nx - 0.43, y: 0.91, w: 0.175 * k, ht: 0.155, n: 2.1 },
  ], { radial: 22, sub: 6, t0: 0.02, t1: Math.PI - 0.02 });
  A.add('chassis', screen, mats.glass);
  // side vent: recessed black opening with three carbon gills
  for (const s of [-1, 1]) {
    const vent = box(0.15, 0.1, 0.012, 0.008);
    place(vent, { p: [0.36, 0.66, s * 0.2 * k], r: [0, 0, 0.5] });
    A.add('chassis', vent, M.black());
    for (let i = 0; i < 3; i++) {
      const f = box(0.14, 0.008, 0.016, 0.003);
      place(f, { p: [0.36 + (i - 1) * 0.018, 0.66 + (i - 1) * 0.03, s * 0.205 * k], r: [0, 0, 0.5] });
      A.add('chassis', f, M.carbon());
    }
  }
}

// Modern superbike face: twin recessed LED eyes, central ram-air intake, DRL brows.
function sportFace(ctx, o = {}) {
  const { A, mats } = ctx;
  const nx = o.nose ?? 0.97;
  const k = o.k ?? 1;
  const intake = loftProfile([
    { x: nx + 0.004, pts: [[0, 0.81], [0.022 * k, 0.814], [0.03 * k, 0.83], [0.016 * k, 0.842], [0, 0.844]] },
    { x: nx - 0.05, pts: [[0, 0.78], [0.04 * k, 0.786], [0.052 * k, 0.825], [0.03 * k, 0.85], [0, 0.854]] },
  ], { sub: 2, around: 3, creases: [2], capStart: true, capEnd: true });
  A.add('chassis', intake, M.black());
  if (o.lights === false) return;
  for (const s of [-1, 1]) {
    // glossy black housing set into the cowl's front face
    const h = sphere(1, 18, 10); h.scale(0.06, 0.022, 0.042);
    place(h, { p: [nx - 0.075, 0.828, s * 0.08 * k], r: [0, s * 0.62, -0.12] });
    A.add('chassis', h, M.darkChrome());
    const lens = sphere(0.013, 12, 8); lens.translate(nx - 0.06, 0.826, s * 0.072 * k);
    A.add('chassis', lens, mats.head);
    // LED brow along the headlight crease
    const brow = loft([
      { x: nx - 0.035, y: 0.837, w: 0.004, ht: 0.003, n: 2, z: s * 0.07 * k },
      { x: nx - 0.08, y: 0.84, w: 0.006, ht: 0.004, n: 2, z: s * 0.1 * k },
      { x: nx - 0.13, y: 0.842, w: 0.004, ht: 0.003, n: 2, z: s * 0.132 * k },
    ], { radial: 8, sub: 4, capStart: true, capEnd: true });
    A.add('chassis', brow, mats.head);
    const cover = sphere(1, 18, 10); cover.scale(0.062, 0.024, 0.044);
    place(cover, { p: [nx - 0.073, 0.829, s * 0.081 * k], r: [0, s * 0.62, -0.12] });
    A.add('chassis', cover, M.lens());
  }
  ctx.headlights.push({ pos: [nx - 0.05, 0.83, 0], group: 'chassis', r: 0.05 });
}

// Rounded one-piece fairing of the classic two-stroke GP era.
// P scales: k (overall width), nose (nose tip x), tailX (tail tip x), round (retro roundness)
function sportBodyRetro(ctx, P) {
  const { A, mats } = ctx;
  const k = P.k ?? 1;
  const nx = P.nose ?? 0.92;
  const n0 = P.round ? 2.1 : 2.4;
  const fair = loft([
    { x: nx, y: 0.84, w: 0.03 * k, ht: 0.018, hb: 0.022, n: 2 },
    { x: nx - 0.06, y: 0.845, w: 0.11 * k, ht: 0.06, hb: 0.075, n: n0 },
    { x: nx - 0.18, y: 0.84, w: 0.18 * k, ht: 0.105, hb: 0.13, n: n0 + 0.1 },
    { x: nx - 0.32, y: 0.8, w: 0.22 * k, ht: 0.155, hb: 0.13, n: n0 + 0.3 },
    { x: 0.46, y: 0.72, w: 0.245 * k, ht: 0.235, hb: 0.23, n: 2.9 },
    { x: 0.39, y: 0.6, w: 0.25 * k, ht: 0.36, hb: 0.38, n: 3.1 },
    { x: 0.2, y: 0.57, w: 0.25 * k, ht: 0.35, hb: 0.39, n: 3.2 },
    { x: 0.0, y: 0.54, w: 0.225 * k, ht: 0.29, hb: 0.36, n: 3.0 },
    { x: -0.1, y: 0.52, w: 0.17 * k, ht: 0.2, hb: 0.27, n: 2.8 },
    { x: -0.17, y: 0.56, w: 0.08 * k, ht: 0.08, hb: 0.1, n: 2.4 },
  ], { radial: 40, sub: 7, capStart: true, capEnd: true });
  A.add('chassis', fair, mats.paint);
  const tank = loft([
    { x: 0.45, y: 0.92, w: 0.1 * k, ht: 0.045, hb: 0.06, n: 2.6 },
    { x: 0.3, y: 0.935, w: 0.175 * k, ht: 0.085, hb: 0.1, n: 2.9 },
    { x: 0.08, y: 0.935, w: 0.185 * k, ht: 0.085, hb: 0.1, n: 2.9 },
    { x: -0.08, y: 0.885, w: 0.15 * k, ht: 0.05, hb: 0.08, n: 2.7 },
    { x: -0.15, y: 0.86, w: 0.1 * k, ht: 0.02, hb: 0.05, n: 2.4 },
  ], { radial: 30, sub: 6, capStart: true, capEnd: true });
  A.add('chassis', tank, mats.paint);
  const tx = P.tailX ?? -0.8;
  const tail = loft([
    { x: -0.06, y: 0.72, w: 0.16 * k, ht: 0.11, hb: 0.08, n: 2.8 },
    { x: -0.3, y: 0.79, w: 0.14 * k, ht: 0.075, hb: 0.1, n: 2.9 },
    { x: (-0.3 + tx) / 2 - 0.02, y: 0.87, w: 0.095 * k, ht: P.hump ?? 0.06, hb: 0.065, n: 2.7 },
    { x: tx, y: 0.95, w: 0.03, ht: 0.024, hb: 0.022, n: 2.2 },
  ], { radial: 28, sub: 6, capStart: true, capEnd: true });
  A.add('chassis', tail, mats.paint);
  seatLoft(ctx, -0.12, -0.44, 0.865, 0.125 * k, 0.03);
  const screen = loft([
    { x: nx - 0.07, y: 0.905, w: 0.085 * k, ht: 0.025, n: 2 },
    { x: nx - 0.22, y: 0.985, w: 0.16 * k, ht: 0.04, n: 2.2 },
    { x: nx - 0.36, y: 1.02, w: 0.18 * k, ht: 0.03, n: 2.2 },
  ], { radial: 18, sub: 6, t0: 0.12, t1: Math.PI - 0.12 });
  A.add('chassis', screen, mats.glass);
  // dark vents on fairing sides
  for (const s of [-1, 1]) {
    const v = box(0.16, 0.05, 0.01, 0.004);
    place(v, { p: [0.28, 0.52, s * 0.25 * k], r: [0, 0, 0.35] });
    A.add('chassis', v, M.black());
    const v2 = box(0.12, 0.035, 0.01, 0.004);
    place(v2, { p: [0.22, 0.44, s * 0.248 * k], r: [0, 0, 0.35] });
    A.add('chassis', v2, M.black());
  }
}

// ---------------------------------------------------------------------------
// 1. Superbike
function superbike(ctx) {
  const { A, mats } = ctx;
  setupChassis(ctx);
  fork(ctx, { type: 'usd' });
  wheels(ctx, { caliperColor: 0xc81e1e, rimStripe: mats.accentSolid });
  swingarm(ctx, { style: 'banana', mat: M.aluminum() });
  chain(ctx);
  twinSpar(ctx, { mat: mats.frame });
  // engine (mostly hidden)
  crankcase(ctx, [0.08, 0.32, 0], [0.42, 0.2, 0.3], { tilt: 0.05, covers: true });
  const blk = box(0.2, 0.24, 0.34, 0.03); place(blk, { p: [0.2, 0.52, 0], r: [0, 0, -0.5] }); A.add('chassis', blk, M.engine());
  const hc = box(0.12, 0.08, 0.32, 0.03); place(hc, { p: [0.27, 0.66, 0], r: [0, 0, -0.5] }); A.add('chassis', hc, mats.accentSolid);
  radiator(ctx, [0.37, 0.52, 0], 0.27, 0.28, { tilt: -0.25 });
  // headers -> collector -> right side muffler
  for (let i = 0; i < 4; i++) {
    const z = -0.09 + i * 0.06;
    header(ctx, [[0.33, 0.56, z], [0.42, 0.4, z * 1.1], [0.36, 0.18, z * 0.6], [0.15, 0.12, z * 0.3], [-0.02, 0.15, 0.06]], 0.018);
  }
  header(ctx, [[-0.02, 0.15, 0.06], [-0.14, 0.2, 0.14], [-0.22, 0.27, 0.17]], 0.03);
  muffler(ctx, [-0.22, 0.27, 0.17], [-0.56, 0.42, 0.17], { type: 'hex', r: 0.06, mat: M.titanium(), endcap: M.carbon() });
  sportBody(ctx, {});
  sportFace(ctx, {});
  // small aero winglets on the cowl flanks
  for (const s of [-1, 1]) {
    const w = box(0.1, 0.008, 0.06, 0.004);
    place(w, { p: [0.68, 0.77, s * 0.19], r: [s * -0.12, 0, 0.1] });
    A.add('chassis', w, M.carbon());
  }
  tailLight(ctx, [-0.86, 0.925, 0], 0.05, 0.016, { tilt: 0.5 });
  // cockpit
  handlebar(ctx, { type: 'clipon' });
  dash(ctx, [0.5, 0.97, 0], 0.12, 0.075, { tilt: -1.1 });
  for (const s of [-1, 1]) mirror(ctx, [0.62, 0.95, s * 0.2], s, { group: 'chassis', reach: 0.3, up: 0.06, dx: -0.03 });
  footpegs(ctx, -0.2, 0.4, 0.17, { plates: true });
  shock(ctx, [-0.08, 0.62, 0], [-0.2, 0.36, 0], { r: 0.026, springColor: 0xe2b521 });
  frontFender(ctx, { from: 1.8, len: 1.7, w: 0.13, mat: mats.paintSolid });
  rearFender(ctx, { from: 1.9, len: 1.4, mat: M.carbon(), w: 0.2 });
  details(ctx, { damper: true, plate: { pos: [-0.86, 0.76, 0], tilt: 0.3 }, signalsF: [[0.7, 0.83, 0.205], [0.7, 0.83, -0.205]] });
}

// 2. MotoGP prototype
function gp(ctx) {
  const { A, mats } = ctx;
  setupChassis(ctx);
  fork(ctx, { type: 'usd', innerMat: M.gold(), outerMat: M.anodized(0x111111) });
  wheels(ctx, { caliperColor: 0x111111, carrier: '#333333', fDiscR: 0.17, discStyle: 'plain', rimStripe: mats.accentSolid });
  swingarm(ctx, { style: 'banana', mat: M.carbon(), h: 0.06 });
  chain(ctx);
  twinSpar(ctx, { mat: M.aluminum() });
  crankcase(ctx, [0.06, 0.32, 0], [0.4, 0.2, 0.28], { tilt: 0.08 });
  // V4: front + rear banks
  for (const [x, a] of [[0.24, -0.75], [0.0, 0.55]]) {
    const b = box(0.16, 0.24, 0.3, 0.03); place(b, { p: [x, 0.52, 0], r: [0, 0, a] }); A.add('chassis', b, M.engine(0x2a2c30));
  }
  radiator(ctx, [0.38, 0.52, 0], 0.27, 0.3, { tilt: -0.22 });
  // exhaust: under seat, exits high
  header(ctx, [[0.33, 0.5, 0.06], [0.4, 0.3, 0.08], [0.2, 0.16, 0.1], [-0.05, 0.2, 0.12], [-0.2, 0.4, 0.12], [-0.42, 0.62, 0.07]], 0.022);
  header(ctx, [[0.33, 0.5, -0.06], [0.4, 0.3, -0.08], [0.2, 0.16, -0.1], [-0.05, 0.2, -0.12], [-0.25, 0.32, -0.15], [-0.42, 0.36, -0.16]], 0.022);
  muffler(ctx, [-0.42, 0.62, 0.07], [-0.66, 0.72, 0.07], { type: 'round', r: 0.045, mat: M.titanium() });
  muffler(ctx, [-0.42, 0.36, -0.16], [-0.62, 0.44, -0.16], { type: 'round', r: 0.04, mat: M.titanium() });
  sportBody(ctx, { k: 0.95, tailX: -0.76, hump: 0.085, bellyMat: M.carbon() });
  sportFace(ctx, { k: 0.95, lights: false });
  // winglets: stacked aero wings with endplates on both sides
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const w = box(0.14, 0.012, 0.11, 0.005);
      place(w, { p: [0.72 - k * 0.04, 0.8 - k * 0.06, s * (0.19 + k * 0.012)], r: [s * -0.1, 0, 0.12] });
      A.add('chassis', w, M.carbon());
    }
    const ep = box(0.16, 0.12, 0.008, 0.004);
    place(ep, { p: [0.7, 0.77, s * 0.25] });
    A.add('chassis', ep, M.carbon());
    // side vents / ground-effect fins on lower fairing
    for (let k = 0; k < 3; k++) {
      const f = box(0.12, 0.008, 0.04, 0.003);
      place(f, { p: [0.15, 0.32 + k * 0.05, s * 0.162], r: [0, 0, 0.3] });
      A.add('chassis', f, M.carbon());
    }
  }
  // number plate on nose
  numberPlate(ctx, [0.912, 0.868, 0], [0.1, 0.066], mats.plate, { r: [0, Math.PI / 2, 0.62] });
  tailLight(ctx, [-0.735, 0.88, 0], 0.03, 0.018, { tilt: 0.3 });
  handlebar(ctx, { type: 'clipon' });
  dash(ctx, [0.52, 0.96, 0], 0.11, 0.06, { tilt: -1.1 });
  footpegs(ctx, -0.22, 0.42, 0.16, { plates: true });
  shock(ctx, [-0.06, 0.62, 0], [-0.18, 0.36, 0], { r: 0.025, springColor: 0xd8d8d8 });
  frontFender(ctx, { from: 1.8, len: 1.6, w: 0.13, mat: M.carbon() });
  ctx.headlights.push({ pos: [0.88, 0.84, 0], group: 'chassis', r: 0.0, none: true });
  details(ctx, { damper: true, kickstand: false });
}

// 3. Naked streetfighter with trellis frame + single-sided swingarm
function naked(ctx) {
  const { A, mats } = ctx;
  setupChassis(ctx);
  fork(ctx, { type: 'usd', innerMat: M.gold(), outerMat: M.anodized(0x1a1a1a) });
  wheels(ctx, { caliperColor: 0xd4a431, carrier: '#222222', rimStripe: mats.accentSolid });
  swingarm(ctx, { style: 'single', mat: M.aluminum() });
  chain(ctx);
  // trellis frame: nodes on each side
  const H = ctx.head, [px, py] = ctx.pivot;
  const top = (t) => [H[0] + (px + 0.05 - H[0]) * t, H[1] + 0.07 + (py + 0.2 - H[1] - 0.07) * t];
  const bot = (t) => [H[0] - 0.05 + (px + 0.02 - H[0] + 0.05) * t, H[1] - 0.15 + (py - 0.02 - H[1] + 0.15) * t];
  const fm = mats.frame;
  for (const s of [-1, 1]) {
    const z0 = 0.06, z1 = 0.13;
    const zz = (t) => s * (z0 + (z1 - z0) * Math.min(1, t * 2));
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const a = i / steps, b = (i + 1) / steps;
      const ta = top(a), tb = top(b), ba = bot(a), bb = bot(b);
      A.add('chassis', rod([ta[0], ta[1], zz(a)], [tb[0], tb[1], zz(b)], 0.011, 8), fm);
      A.add('chassis', rod([ba[0], ba[1], zz(a)], [bb[0], bb[1], zz(b)], 0.011, 8), fm);
      A.add('chassis', rod([ta[0], ta[1], zz(a)], [bb[0], bb[1], zz(b)], 0.009, 8), fm);
    }
    // rear subframe trellis
    A.add('chassis', rod([top(1)[0], top(1)[1], s * z1], [-0.62, 0.8, s * 0.07], 0.01, 8), fm);
    A.add('chassis', rod([bot(1)[0], bot(1)[1] + 0.05, s * z1], [-0.5, 0.78, s * 0.08], 0.009, 8), fm);
  }
  A.add('chassis', rod(ctx.sp(ctx.Lf - 0.01), ctx.sp(ctx.Lf + ctx.headLen + 0.01), 0.036, 16), fm);
  // inline triple (visible)
  crankcase(ctx, [0.04, 0.3, 0], [0.4, 0.2, 0.26], { tilt: 0.05, coverMat: M.engine(0x6a6e75) });
  finnedCylinder(ctx, [0.13, 0.4, 0], [0.4, 1, 0], 0.22, { core: 0.12, fin: 0.135, fins: 6, square: true, mat: M.engine(0x2f3236) });
  const head = box(0.16, 0.08, 0.3, 0.025); place(head, { p: [0.23, 0.64, 0], r: [0, 0, -0.38] }); A.add('chassis', head, M.engine(0x6a6e75));
  const vc = box(0.12, 0.04, 0.27, 0.02); place(vc, { p: [0.25, 0.69, 0], r: [0, 0, -0.38] }); A.add('chassis', vc, mats.accentSolid);
  radiator(ctx, [0.36, 0.48, 0], 0.32, 0.24, { tilt: -0.15 });
  for (let i = 0; i < 3; i++) {
    const z = -0.07 + i * 0.07;
    header(ctx, [[0.3, 0.58, z], [0.4, 0.42, z], [0.32, 0.2, z * 0.5], [0.1, 0.14, 0.04], [-0.06, 0.18, 0.1]], 0.019, M.titanium());
  }
  muffler(ctx, [-0.06, 0.2, 0.12], [-0.3, 0.3, 0.17], { type: 'cone', r: 0.06, mat: M.darkChrome(), endcap: M.carbon() });
  // angular tank + scoops
  const tank = loft([
    { x: 0.4, y: 0.88, w: 0.11, ht: 0.05, hb: 0.08, n: 3.2 },
    { x: 0.26, y: 0.95, w: 0.19, ht: 0.085, hb: 0.12, n: 3.6 },
    { x: 0.05, y: 0.94, w: 0.18, ht: 0.08, hb: 0.12, n: 3.4 },
    { x: -0.12, y: 0.86, w: 0.12, ht: 0.05, hb: 0.08, n: 3 },
  ], { radial: 28, sub: 6, capStart: true, capEnd: true });
  A.add('chassis', tank, mats.paint);
  for (const s of [-1, 1]) {
    const scoop = loft([
      { x: 0.46, y: 0.78, w: 0.02, ht: 0.05, hb: 0.07, n: 3, z: s * 0.17 },
      { x: 0.3, y: 0.78, w: 0.035, ht: 0.07, hb: 0.1, n: 3.2, z: s * 0.2 },
      { x: 0.14, y: 0.8, w: 0.02, ht: 0.05, hb: 0.06, n: 3, z: s * 0.17 },
    ], { radial: 14, sub: 5, capStart: true, capEnd: true });
    A.add('chassis', scoop, mats.paint2Solid);
  }
  const tail = loft([
    { x: -0.1, y: 0.8, w: 0.11, ht: 0.04, hb: 0.05, n: 3 },
    { x: -0.4, y: 0.85, w: 0.09, ht: 0.05, hb: 0.05, n: 3 },
    { x: -0.68, y: 0.92, w: 0.035, ht: 0.03, hb: 0.025, n: 2.6 },
  ], { radial: 22, sub: 6, capStart: true, capEnd: true });
  A.add('chassis', tail, mats.paint);
  seatLoft(ctx, -0.1, -0.46, 0.86, 0.12, 0.04);
  // twin bug-eye headlights + flyscreen
  for (const s of [-1, 1]) headlightRound(ctx, [0.66, 0.86, s * 0.055], 0.05, { shellMat: M.black() });
  const fly = loft([
    { x: 0.7, y: 0.93, w: 0.07, ht: 0.02, n: 2 },
    { x: 0.62, y: 0.99, w: 0.09, ht: 0.02, n: 2 },
  ], { radial: 12, sub: 4, t0: 0.2, t1: Math.PI - 0.2 });
  A.add('steer', fly, mats.glass);
  tailLight(ctx, [-0.69, 0.91, 0], 0.05, 0.015);
  handlebar(ctx, { type: 'wide', rise: 0.07, back: 0.12, half: 0.37 });
  dash(ctx, [0.55, 0.99, 0], 0.1, 0.065, { group: 'steer', tilt: -1.0 });
  for (const s of [-1, 1]) mirror(ctx, [ctx.barEnds[s > 0 ? 1 : 0][0] + 0.05, ctx.barEnds[0][1], s * 0.24], s, { reach: 0.3, up: 0.14 });
  footpegs(ctx, -0.22, 0.41, 0.17, { plates: true });
  shock(ctx, [-0.05, 0.66, 0.02], [-0.18, 0.37, 0.02], { r: 0.027, springColor: 0xc81e1e, reservoir: true });
  frontFender(ctx, { from: 1.8, len: 1.6, w: 0.13, mat: mats.paintSolid });
  rearFender(ctx, { from: 1.9, len: 1.3, mat: M.black(), w: 0.19 });
  details(ctx, { plate: { pos: [-0.75, 0.76, 0], tilt: 0.3 }, signalsF: [[0.6, 0.8, 0.14], [0.6, 0.8, -0.14]], signalsFGroup: 'steer' });
}

// 4. Electric hyperbike
function electric(ctx) {
  const { A, mats } = ctx;
  setupChassis(ctx);
  fork(ctx, { type: 'usd', innerMat: M.chrome(), outerMat: mats.paint2Solid, capColor: 0x111111 });
  wheels(ctx, { noSprocket: true, noFrontDisc: true, noRearDisc: true });
  // static stator rings inside hubless rims + rim brake calipers
  for (const [grp, w] of [['forkSlider', ctx.front], ['swingarm', ctx.rear]]) {
    const g = closedLathe([[w.rim - 0.095, -w.w * 0.2], [w.rim - 0.084, -w.w * 0.2], [w.rim - 0.084, w.w * 0.2], [w.rim - 0.095, w.w * 0.2]], 64);
    g.translate(w.x, w.y, 0);
    A.add(grp, g, M.anodized(0x15171a));
    const arm = box(0.06, 0.13, w.w * 0.42, 0.012);
    place(arm, { p: [w.x - 0.05, w.y + w.rim - 0.13, 0], r: [0, 0, 0.35] });
    A.add(grp, arm, M.anodized(0x15171a));
    const cal = box(0.07, 0.035, w.w * 0.5, 0.01);
    place(cal, { p: [w.x - w.rim * 0.62, w.y + w.rim * 0.62, 0], r: [0, 0, -0.78] });
    A.add(grp, cal, mats.paint2Solid);
  }
  swingarm(ctx, { style: 'single', mat: mats.paint2Solid, side: 0.13 });
  // monocoque body: one long sculpted shell
  const S = [
    { x: 0.95, y: 0.845, w: 0.02, ht: 0.012, hb: 0.016, n: 2 },
    { x: 0.86, y: 0.835, w: 0.085, ht: 0.06, hb: 0.06, n: 2.6 },
    { x: 0.64, y: 0.79, w: 0.165, ht: 0.11, hb: 0.15, n: 3.2 },
    { x: 0.4, y: 0.66, w: 0.2, ht: 0.235, hb: 0.25, n: 3.8 },
    { x: 0.12, y: 0.68, w: 0.19, ht: 0.31, hb: 0.3, n: 3.8 },
    { x: -0.15, y: 0.71, w: 0.15, ht: 0.16, hb: 0.2, n: 3.4 },
    { x: -0.45, y: 0.85, w: 0.1, ht: 0.065, hb: 0.07, n: 3 },
    { x: -0.82, y: 0.97, w: 0.025, ht: 0.015, hb: 0.015, n: 2.2 },
  ];
  const body = loft(S, { radial: 40, sub: 7, capStart: true, capEnd: true });
  A.add('chassis', body, mats.paint);
  // battery pack visible underneath with glowing cells
  const pack = box(0.46, 0.16, 0.24, 0.04); place(pack, { p: [0.14, 0.3, 0] }); A.add('chassis', pack, M.anodized(0x1b1d20));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const cell = box(0.05, 0.09, 0.006, 0.002);
      place(cell, { p: [-0.06 + i * 0.07, 0.3, s * 0.122] });
      A.add('chassis', cell, mats.neon);
    }
    // neon line hugging the body surface
    const line = [[0.8, 0.82, 0.115], [0.62, 0.78, 0.172], [0.4, 0.67, 0.205], [0.12, 0.69, 0.196], [-0.15, 0.73, 0.155], [-0.45, 0.86, 0.104], [-0.72, 0.94, 0.05]];
    A.add('chassis', tube(line.map(([x, y, z]) => [x, y, s * z]), 0.0065, { radial: 6 }), mats.neon);
    // dark side intake
    const vent = box(0.22, 0.09, 0.01, 0.01);
    place(vent, { p: [0.36, 0.54, s * 0.2], r: [0, 0, 0.25] });
    A.add('chassis', vent, M.black());
  }
  // motor near pivot + orange HV cables
  const motor = cyl(0.11, 0.11, 0.2, 32, 'z'); motor.translate(-0.06, 0.38, 0); A.add('chassis', motor, M.aluminum());
  for (const s of [-1, 1]) {
    const cap = cyl(0.09, 0.09, 0.012, 32, 'z'); cap.translate(-0.06, 0.38, s * 0.105); A.add('chassis', cap, mats.neon);
    A.add('chassis', tube([[0.1, 0.32, s * 0.1], [0.02, 0.36, s * 0.13], [-0.04, 0.42, s * 0.1]], 0.012), M.matte(0xff6a00, 0.5));
  }
  seatLoft(ctx, -0.14, -0.5, 0.905, 0.12, 0.03);
  // LED headlight blades + DRL
  for (const s of [-1, 1]) {
    ledStrip(ctx, [0.945, 0.845, s * 0.02], [0.84, 0.86, s * 0.09], 0.007, 'chassis');
    ledStrip(ctx, [0.84, 0.81, s * 0.09], [0.7, 0.8, s * 0.16], 0.005, 'chassis', mats.neon);
  }
  ctx.headlights.push({ pos: [0.93, 0.845, 0], group: 'chassis', r: 0.03 });
  ledStrip(ctx, [-0.81, 0.968, -0.03], [-0.81, 0.968, 0.03], 0.008, 'chassis', mats.tail);
  ctx.tails.push({ pos: [-0.81, 0.968, 0] });
  const screen = loft([
    { x: 0.8, y: 0.88, w: 0.07, ht: 0.02, n: 2 },
    { x: 0.62, y: 0.95, w: 0.13, ht: 0.03, n: 2 },
  ], { radial: 14, sub: 5, t0: 0.2, t1: Math.PI - 0.2 });
  A.add('chassis', screen, mats.glass);
  handlebar(ctx, { type: 'clipon' });
  dash(ctx, [0.42, 0.95, 0], 0.14, 0.07, { tilt: -1.05 });
  footpegs(ctx, -0.2, 0.42, 0.18);
  frontFender(ctx, { from: 1.8, len: 1.6, w: 0.13, mat: mats.paint2Solid });
  details(ctx, { plate: { pos: [-0.86, 0.84, 0], tilt: 0.35 }, signalsF: [[0.8, 0.78, 0.16], [0.8, 0.78, -0.16]] });
}

// 5. Cruiser
function cruiser(ctx) {
  const { A, mats } = ctx;
  setupChassis(ctx);
  fork(ctx, { type: 'cruiser', stanchionR: 0.025, lowerR: 0.036, gaiters: false, clampMat: M.chrome() });
  wheels(ctx, { caliperColor: 0x2a2a2a, carrier: '#9a9a9a', fDiscR: 0.15, noSprocket: true, discStyle: 'drilled' });
  swingarm(ctx, { style: 'tube', mat: mats.frame, side: 0.14 });
  belt(ctx);
  const fm = mats.frame;
  const H = ctx.head, [px, py] = ctx.pivot;
  A.add('chassis', rod(ctx.sp(ctx.Lf - 0.02), ctx.sp(ctx.Lf + ctx.headLen + 0.02), 0.038, 16), fm);
  for (const s of [-1, 1]) {
    // backbone, downtubes, cradle, rear rails
    A.add('chassis', tube([[H[0], H[1] + 0.12, 0], [H[0] - 0.3, H[1] + 0.03, s * 0.04], [-0.2, 0.62, s * 0.1], [-0.42, 0.62, s * 0.12], [-0.72, 0.6, s * 0.13]], 0.016), fm);
    A.add('chassis', tube([[H[0], H[1], s * 0.03], [H[0] - 0.08, 0.38, s * 0.08], [0.25, 0.13, s * 0.1], [-0.15, 0.12, s * 0.12], [px, py - 0.02, s * 0.12]], 0.017), fm);
    A.add('chassis', rod([px, py, s * 0.12], [-0.42, 0.62, s * 0.12], 0.015, 10), fm);
  }
  // V-twin 45° with big fins
  crankcase(ctx, [0.0, 0.27, 0], [0.42, 0.2, 0.22], { tilt: 0, coverR: 0.1, coverMat: M.chrome(), coverDx: -0.06 });
  const cylMat = M.engine(0x2a2a2c);
  finnedCylinder(ctx, [0.07, 0.34, 0], [Math.sin(22.5 * DEG), Math.cos(22.5 * DEG), 0], 0.3, { core: 0.06, fin: 0.1, fins: 11, mat: cylMat });
  finnedCylinder(ctx, [-0.07, 0.34, 0], [-Math.sin(22.5 * DEG), Math.cos(22.5 * DEG), 0], 0.3, { core: 0.06, fin: 0.1, fins: 11, mat: cylMat });
  for (const sx of [-1, 1]) {
    const rb = box(0.13, 0.07, 0.15, 0.03);
    place(rb, { p: [sx * 0.19, 0.66, 0], r: [0, 0, -sx * 22.5 * DEG] });
    A.add('chassis', rb, M.chrome());
  }
  // primary cover (left) + air cleaner (right)
  const prim = closedLathe([[0.001, 0], [0.13, 0], [0.14, 0.02], [0.12, 0.05], [0.001, 0.055]], 40, 'z');
  prim.scale(1.4, 1, 1); prim.rotateY(Math.PI); prim.translate(-0.18, 0.28, -0.14); A.add('chassis', prim, M.chrome());
  const air = closedLathe([[0.001, 0], [0.11, 0], [0.12, 0.03], [0.1, 0.07], [0.001, 0.075]], 40, 'z');
  air.translate(0.0, 0.52, 0.1); A.add('chassis', air, M.chrome());
  // dual shotgun exhaust (right)
  header(ctx, [[0.16, 0.56, 0.06], [0.28, 0.42, 0.12], [0.18, 0.2, 0.17], [-0.1, 0.17, 0.2]], 0.026, M.chrome());
  header(ctx, [[-0.16, 0.56, 0.06], [-0.22, 0.42, 0.14], [-0.2, 0.3, 0.2], [-0.3, 0.27, 0.21]], 0.026, M.chrome());
  muffler(ctx, [-0.1, 0.17, 0.2], [-0.95, 0.24, 0.2], { type: 'shotgun', r: 0.045, mat: M.chrome() });
  muffler(ctx, [-0.3, 0.27, 0.21], [-1.0, 0.36, 0.21], { type: 'shotgun', r: 0.045, mat: M.chrome() });
  // teardrop tank + chrome console
  const tank = loft([
    { x: 0.48, y: 0.83, w: 0.09, ht: 0.06, hb: 0.08, n: 2.2 },
    { x: 0.32, y: 0.87, w: 0.19, ht: 0.1, hb: 0.12, n: 2.3 },
    { x: 0.08, y: 0.85, w: 0.2, ht: 0.1, hb: 0.13, n: 2.3 },
    { x: -0.12, y: 0.76, w: 0.13, ht: 0.07, hb: 0.08, n: 2.2 },
  ], { radial: 30, sub: 7, capStart: true, capEnd: true });
  A.add('chassis', tank, mats.paint);
  const console = loft([
    { x: 0.36, y: 0.965, w: 0.03, ht: 0.01, hb: 0.01, n: 2 },
    { x: 0.2, y: 0.975, w: 0.06, ht: 0.014, hb: 0.01, n: 2.5 },
    { x: 0.0, y: 0.95, w: 0.04, ht: 0.01, hb: 0.01, n: 2 },
  ], { radial: 16, sub: 4, capStart: true, capEnd: true });
  A.add('chassis', console, M.chrome());
  // stepped two-up seat
  seatLoft(ctx, -0.12, -0.48, 0.67, 0.17, 0.05, { dip: -0.02, frontRise: 0.04 });
  seatLoft(ctx, -0.48, -0.72, 0.72, 0.11, 0.04);
  // deep valanced fenders
  frontFender(ctx, { from: 1.3, len: 2.7, w: 0.17, gap: 0.03, mat: mats.paintSolid, skirts: 0.09 });
  rearFender(ctx, { from: 1.8, len: 2.6, w: 0.25, gap: 0.035, mat: mats.paintSolid, group: 'chassis', skirts: 0.1 });
  // twin chrome shocks
  for (const s of [-1, 1]) shock(ctx, [-0.6, 0.37, s * 0.15], [-0.56, 0.62, s * 0.14], { r: 0.026, springMat: M.chrome(), bodyMat: M.chrome() });
  // headlight + spots, pullback bars
  headlightRound(ctx, [ctx.sp(ctx.Lf + 0.06)[0] + 0.14, ctx.sp(ctx.Lf + 0.06)[1], 0], 0.1);
  for (const s of [-1, 1]) headlightRound(ctx, [ctx.sp(ctx.Lf - 0.04)[0] + 0.12, ctx.sp(ctx.Lf - 0.04)[1] - 0.06, s * 0.14], 0.045);
  tailLight(ctx, [-0.97, 0.66, 0], 0.08, 0.03, { group: 'chassis', tilt: 0.6 });
  handlebar(ctx, { type: 'wide', rise: 0.14, back: 0.28, half: 0.38, mat: M.chrome(), r: 0.014 });
  dash(ctx, [0.2, 0.99, 0], 0.07, 0.05, { tilt: -1.4 });
  for (const s of [-1, 1]) mirror(ctx, [ctx.barEnds[0][0] + 0.12, ctx.barEnds[0][1] - 0.02, s * 0.25], s, { reach: 0.3, up: 0.18, mat: M.chrome() });
  // floorboards
  for (const s of [-1, 1]) {
    const fb = box(0.26, 0.015, 0.1, 0.006); place(fb, { p: [0.22, 0.3, s * 0.27] }); A.add('chassis', fb, M.rubber());
    const fbr = box(0.27, 0.02, 0.11, 0.006); place(fbr, { p: [0.22, 0.29, s * 0.27] }); A.add('chassis', fbr, M.chrome());
  }
  { const hp = ctx.sp(ctx.Lf + 0.02); details(ctx, { plate: { pos: [-1.0, 0.56, 0], tilt: 0.55 }, signalsF: [[hp[0] + 0.1, hp[1] + 0.03, 0.22], [hp[0] + 0.1, hp[1] + 0.03, -0.22]], signalsFGroup: 'steer' }); }
}

// 6. Bobber
function bobber(ctx) {
  const { A, mats } = ctx;
  setupChassis(ctx);
  fork(ctx, { type: 'springer', clampMat: M.black() });
  wheels(ctx, { singleFrontDisc: true, caliperColor: 0x1a1a1a, carrier: '#444444', fDiscR: 0.14, noSprocket: false, sprocketR: 0.13, sprocketColor: 0x111111 });
  swingarm(ctx, { style: 'tube', mat: mats.frame, side: 0.13 });
  chain(ctx, { rearR: 0.13, guard: false });
  const fm = mats.frame;
  const H = ctx.head, [px, py] = ctx.pivot;
  A.add('chassis', rod(ctx.sp(ctx.Lf - 0.02), ctx.sp(ctx.Lf + ctx.headLen + 0.02), 0.036, 16), fm);
  for (const s of [-1, 1]) {
    A.add('chassis', tube([[H[0], H[1] + 0.1, 0], [H[0] - 0.35, H[1] + 0.0, s * 0.05], [-0.25, 0.6, s * 0.1], [-0.55, 0.52, s * 0.12]], 0.016), fm);
    A.add('chassis', tube([[H[0], H[1], s * 0.03], [H[0] - 0.08, 0.36, s * 0.08], [0.22, 0.12, s * 0.1], [-0.15, 0.11, s * 0.11], [px, py - 0.02, s * 0.12]], 0.017), fm);
  }
  // blacked-out V-twin with polished fin edges
  crankcase(ctx, [0.0, 0.26, 0], [0.4, 0.19, 0.2], { coverR: 0.09, coverMat: M.black(), coverDx: -0.05, mat: M.black() });
  finnedCylinder(ctx, [0.06, 0.33, 0], [Math.sin(24 * DEG), Math.cos(24 * DEG), 0], 0.28, { core: 0.055, fin: 0.095, fins: 10, mat: M.darkChrome() });
  finnedCylinder(ctx, [-0.06, 0.33, 0], [-Math.sin(24 * DEG), Math.cos(24 * DEG), 0], 0.28, { core: 0.055, fin: 0.095, fins: 10, mat: M.darkChrome() });
  const air = closedLathe([[0.001, 0], [0.09, 0], [0.1, 0.05], [0.001, 0.06]], 32, 'z'); air.translate(0.0, 0.5, 0.1); A.add('chassis', air, M.black());
  // drag pipes
  header(ctx, [[0.15, 0.54, 0.06], [0.26, 0.4, 0.13], [0.15, 0.25, 0.17], [-0.2, 0.25, 0.19], [-0.62, 0.3, 0.19]], 0.025, M.black());
  header(ctx, [[-0.15, 0.54, 0.06], [-0.2, 0.42, 0.15], [-0.25, 0.36, 0.2], [-0.62, 0.4, 0.2]], 0.025, M.black());
  ctx.exhausts.push({ pos: [-0.62, 0.3, 0.19], dir: [-1, 0.1, 0], r: 0.025 }, { pos: [-0.62, 0.4, 0.2], dir: [-1, 0.1, 0], r: 0.025 });
  // peanut tank
  const tank = loft([
    { x: 0.42, y: 0.85, w: 0.07, ht: 0.05, hb: 0.06, n: 2.2 },
    { x: 0.3, y: 0.89, w: 0.12, ht: 0.075, hb: 0.08, n: 2.2 },
    { x: 0.12, y: 0.87, w: 0.12, ht: 0.07, hb: 0.08, n: 2.2 },
    { x: -0.02, y: 0.81, w: 0.07, ht: 0.04, hb: 0.05, n: 2 },
  ], { radial: 28, sub: 6, capStart: true, capEnd: true });
  A.add('chassis', tank, mats.paint);
  // floating solo seat on springs
  const seat = loft([
    { x: -0.42, y: 0.69, w: 0.13, ht: 0.03, hb: 0.02, n: 2.6 },
    { x: -0.3, y: 0.69, w: 0.15, ht: 0.035, hb: 0.02, n: 2.8 },
    { x: -0.12, y: 0.72, w: 0.06, ht: 0.025, hb: 0.02, n: 2.4 },
  ], { radial: 20, sub: 5, capStart: true, capEnd: true });
  A.add('chassis', seat, mats.seat);
  for (const s of [-1, 1]) A.add('chassis', spring([-0.4, 0.55, s * 0.08], [-0.4, 0.67, s * 0.08], 0.018, 0.004, 6), M.chrome());
  // chopped rear fender
  rearFender(ctx, { from: 2.6, len: 1.5, w: 0.2, gap: 0.03, mat: mats.paintSolid });
  tailLight(ctx, [-0.83, 0.42, 0], 0.04, 0.02, { group: 'swingarm', tilt: 1.2 });
  // small headlight, low drag bars
  headlightRound(ctx, [ctx.sp(ctx.Lf + 0.05)[0] + 0.15, ctx.sp(ctx.Lf + 0.05)[1], 0], 0.07, { shellMat: M.black() });
  handlebar(ctx, { type: 'wide', rise: 0.03, back: 0.06, half: 0.34, mat: M.black() });
  dash(ctx, [0.3, 0.95, 0], 0.05, 0.05, { tilt: -1.4 });
  footpegs(ctx, 0.28, 0.28, 0.24);
  frontFender(ctx, { from: 2.0, len: 1.3, w: 0.15, mat: mats.paintSolid, gap: 0.02 });
  details(ctx, { plate: { pos: [-0.8, 0.5, 0], tilt: 0.9, group: 'swingarm' } });
}

// 7. Café racer
function cafe(ctx) {
  const { A, mats } = ctx;
  setupChassis(ctx);
  fork(ctx, { type: 'conv', lowerMat: M.aluminum(), innerMat: M.chrome(), stanchionR: 0.02, lowerR: 0.028 });
  wheels(ctx, { singleFrontDisc: true, caliperColor: 0xd4a431, carrier: '#9a9a9a', fDiscR: 0.15, sprocketR: 0.11 });
  swingarm(ctx, { style: 'tube', mat: mats.frame, side: 0.11 });
  chain(ctx, { rearR: 0.11 });
  const fm = mats.frame;
  const H = ctx.head, [px, py] = ctx.pivot;
  A.add('chassis', rod(ctx.sp(ctx.Lf - 0.02), ctx.sp(ctx.Lf + ctx.headLen + 0.02), 0.033, 16), fm);
  for (const s of [-1, 1]) {
    A.add('chassis', tube([[H[0], H[1] + 0.1, 0], [H[0] - 0.3, H[1] + 0.01, s * 0.05], [-0.2, 0.75, s * 0.09], [-0.64, 0.77, s * 0.09]], 0.014), fm);
    A.add('chassis', tube([[H[0], H[1], s * 0.03], [H[0] - 0.06, 0.4, s * 0.08], [0.2, 0.15, s * 0.09], [-0.12, 0.14, s * 0.1], [px, py - 0.02, s * 0.1]], 0.015), fm);
  }
  // parallel twin, upright finned barrels, polished covers
  crankcase(ctx, [0.03, 0.29, 0], [0.34, 0.18, 0.26], { coverMat: M.chrome(), coverR: 0.08 });
  for (const z of [-0.06, 0.06]) finnedCylinder(ctx, [0.07, 0.37, z], [0.22, 1, 0], 0.24, { core: 0.05, fin: 0.065, fins: 10, mat: M.aluminum() });
  const head = box(0.14, 0.07, 0.28, 0.025); place(head, { p: [0.13, 0.64, 0], r: [0, 0, -0.2] }); A.add('chassis', head, M.aluminum());
  // twin upswept megaphones
  for (const s of [-1, 1]) {
    header(ctx, [[0.16, 0.56, s * 0.06], [0.28, 0.45, s * 0.1], [0.22, 0.22, s * 0.14], [0.0, 0.2, s * 0.16], [-0.2, 0.27, s * 0.17]], 0.022, M.chrome());
    muffler(ctx, [-0.2, 0.27, s * 0.17], [-0.68, 0.42, s * 0.17], { type: 'megaphone', r: 0.05, mat: M.chrome() });
  }
  // long tank with knee dents
  const tank = loft([
    { x: 0.47, y: 0.85, w: 0.075, ht: 0.045, hb: 0.05, n: 2.2 },
    { x: 0.34, y: 0.875, w: 0.14, ht: 0.07, hb: 0.075, n: 2.4 },
    { x: 0.1, y: 0.87, w: 0.135, ht: 0.065, hb: 0.07, n: 2.4 },
    { x: -0.1, y: 0.84, w: 0.13, ht: 0.05, hb: 0.06, n: 2.4 },
    { x: -0.18, y: 0.82, w: 0.09, ht: 0.02, hb: 0.04, n: 2.2 },
  ], { radial: 28, sub: 6, capStart: true, capEnd: true });
  A.add('chassis', tank, mats.paint);
  // side covers / oil tank under the seat + seat pan
  const sc = box(0.28, 0.2, 0.2, 0.05); place(sc, { p: [-0.2, 0.63, 0] }); A.add('chassis', sc, mats.paint2Solid);
  const pan = box(0.36, 0.02, 0.2, 0.008); place(pan, { p: [-0.3, 0.775, 0] }); A.add('chassis', pan, M.black());
  // knee pads
  for (const s of [-1, 1]) {
    const kp = sphere(0.05, 14, 10); kp.scale(1.2, 0.8, 0.2); kp.translate(0.12, 0.86, s * 0.13); A.add('chassis', kp, M.rubber());
  }
  // seat + humped cowl
  seatLoft(ctx, -0.12, -0.46, 0.8, 0.12, 0.035);
  const cowl = loft([
    { x: -0.42, y: 0.8, w: 0.12, ht: 0.03, hb: 0.03, n: 2.6 },
    { x: -0.52, y: 0.86, w: 0.11, ht: 0.07, hb: 0.06, n: 2.6 },
    { x: -0.66, y: 0.84, w: 0.07, ht: 0.05, hb: 0.05, n: 2.4 },
  ], { radial: 22, sub: 5, capStart: true, capEnd: true });
  A.add('chassis', cowl, mats.paint);
  tailLight(ctx, [-0.67, 0.83, 0], 0.035, 0.03, { tilt: 0.2 });
  // round headlight, clip-ons, bar-end mirrors
  headlightRound(ctx, [ctx.sp(ctx.Lf + 0.04)[0] + 0.13, ctx.sp(ctx.Lf + 0.04)[1] - 0.01, 0], 0.085);
  handlebar(ctx, { type: 'clipon' });
  for (const e of ctx.barEnds) {
    const s = Math.sign(e[2]);
    const mh = sphere(0.04, 14, 10); mh.scale(0.4, 0.8, 1); mh.translate(e[0] - 0.02, e[1], e[2] + s * 0.04); A.add('steer', mh, M.chrome());
  }
  // twin round gauges
  for (const s of [-1, 1]) {
    const gg = closedLathe([[0.001, 0], [0.04, 0], [0.042, 0.03], [0.001, 0.032]], 20, 'y');
    gg.rotateZ(0.5); gg.translate(ctx.sp(ctx.Lf + ctx.headLen + 0.05)[0] + 0.03, ctx.sp(ctx.Lf + ctx.headLen + 0.05)[1], s * 0.05);
    A.add('steer', gg, M.chrome());
  }
  dash(ctx, [ctx.sp(ctx.Lf + ctx.headLen + 0.06)[0] + 0.02, ctx.sp(ctx.Lf + ctx.headLen + 0.06)[1] + 0.02, 0], 0.05, 0.04, { group: 'steer', tilt: -1.2 });
  footpegs(ctx, -0.25, 0.38, 0.15);
  for (const s of [-1, 1]) shock(ctx, [-0.6, 0.36, s * 0.13], [-0.5, 0.75, s * 0.1], { r: 0.024, springMat: M.chrome(), bodyMat: M.chrome() });
  frontFender(ctx, { from: 1.6, len: 2.0, w: 0.12, mat: M.chrome(), gap: 0.02 });
  rearFender(ctx, { from: 2.4, len: 1.6, mat: M.chrome(), w: 0.15 });
  { const hp = ctx.sp(ctx.Lf + 0.04); details(ctx, { plate: { pos: [-0.72, 0.68, 0], tilt: 0.3 }, signalsF: [[hp[0] + 0.06, hp[1] - 0.02, 0.15], [hp[0] + 0.06, hp[1] - 0.02, -0.15]], signalsFGroup: 'steer' }); }
}

// 8. Power cruiser / drag
function drag(ctx) {
  const { A, mats } = ctx;
  setupChassis(ctx);
  fork(ctx, { type: 'conv', lowerMat: M.black(), innerMat: M.chrome(), stanchionR: 0.026, lowerR: 0.036 });
  wheels(ctx, { caliperColor: 0xc81e1e, carrier: '#2a2a2a', fDiscR: 0.16, noSprocket: true, rimStripe: M.chrome() });
  swingarm(ctx, { style: 'single', mat: M.black(), side: 0.16 });
  // shaft drive tube (left)
  A.add('swingarm', rod([ctx.pivot[0], ctx.pivot[1], -0.17], [ctx.rear.x, ctx.rear.y, -0.17], 0.035, 14), M.black());
  const fm = mats.frame;
  const H = ctx.head, [px, py] = ctx.pivot;
  A.add('chassis', rod(ctx.sp(ctx.Lf - 0.02), ctx.sp(ctx.Lf + ctx.headLen + 0.02), 0.04, 16), fm);
  for (const s of [-1, 1]) {
    A.add('chassis', tube([[H[0], H[1] + 0.1, s * 0.03], [H[0] - 0.3, H[1] - 0.02, s * 0.12], [-0.2, 0.62, s * 0.13], [-0.55, 0.66, s * 0.1]], 0.02), fm);
  }
  // V4 muscle engine, chrome, big
  crankcase(ctx, [0.0, 0.3, 0], [0.5, 0.22, 0.3], { coverMat: M.chrome(), coverR: 0.1 });
  for (const sx of [-1, 1]) {
    const b = box(0.2, 0.26, 0.32, 0.04); place(b, { p: [sx * 0.15, 0.55, 0], r: [0, 0, -sx * 0.6] }); A.add('chassis', b, M.engine(0x2a2a2e));
    const hc = box(0.12, 0.06, 0.34, 0.025); place(hc, { p: [sx * 0.23, 0.67, 0], r: [0, 0, -sx * 0.6] }); A.add('chassis', hc, M.chrome());
  }
  // fake tank (airbox) + giant chrome air scoops
  const tank = loft([
    { x: 0.46, y: 0.82, w: 0.1, ht: 0.06, hb: 0.08, n: 3 },
    { x: 0.28, y: 0.88, w: 0.17, ht: 0.09, hb: 0.12, n: 3.2 },
    { x: 0.02, y: 0.86, w: 0.17, ht: 0.08, hb: 0.12, n: 3.2 },
    { x: -0.16, y: 0.78, w: 0.13, ht: 0.05, hb: 0.08, n: 3 },
  ], { radial: 28, sub: 6, capStart: true, capEnd: true });
  A.add('chassis', tank, mats.paint);
  for (const s of [-1, 1]) {
    const scoop = loft([
      { x: 0.5, y: 0.74, w: 0.04, ht: 0.07, hb: 0.07, n: 3, z: s * 0.2 },
      { x: 0.35, y: 0.74, w: 0.07, ht: 0.09, hb: 0.09, n: 3.4, z: s * 0.24 },
      { x: 0.12, y: 0.74, w: 0.04, ht: 0.06, hb: 0.06, n: 3, z: s * 0.2 },
    ], { radial: 16, sub: 5, capEnd: true });
    A.add('chassis', scoop, M.chrome());
    const mouth = sphere(0.07, 14, 10); mouth.scale(0.15, 1.1, 0.9); mouth.translate(0.505, 0.74, s * 0.2); A.add('chassis', mouth, M.black());
  }
  // 4 exhausts (2 per side) low
  for (const s of [-1, 1]) {
    header(ctx, [[0.3, 0.5, s * 0.1], [0.35, 0.25, s * 0.14], [0.1, 0.13, s * 0.18], [-0.2, 0.18, s * 0.2]], 0.026, M.chrome());
    muffler(ctx, [-0.2, 0.18, s * 0.2], [-0.62, 0.3, s * 0.22], { type: 'round', r: 0.058, mat: M.chrome() });
  }
  seatLoft(ctx, -0.14, -0.5, 0.72, 0.17, 0.05, { frontRise: 0.04 });
  const tail = loft([
    { x: -0.46, y: 0.72, w: 0.13, ht: 0.04, hb: 0.04, n: 3 },
    { x: -0.68, y: 0.74, w: 0.08, ht: 0.03, hb: 0.03, n: 3 },
  ], { radial: 18, sub: 4, capStart: true, capEnd: true });
  A.add('chassis', tail, mats.paint);
  tailLight(ctx, [-0.69, 0.74, 0], 0.08, 0.02, { tilt: 0.2 });
  rearFender(ctx, { from: 1.9, len: 1.4, mat: M.black(), w: 0.28 });
  // rectangular headlight
  const hlc = ctx.sp(ctx.Lf + 0.05);
  const hl = box(0.06, 0.09, 0.17, 0.02); place(hl, { p: [hlc[0] + 0.12, hlc[1], 0], r: [0, 0, 0.2] }); A.add('steer', hl, M.black());
  const lens = box(0.01, 0.07, 0.15, 0.01); place(lens, { p: [hlc[0] + 0.155, hlc[1], 0], r: [0, 0, 0.2] }); A.add('steer', lens, ctx.mats.head);
  ctx.headlights.push({ pos: [hlc[0] + 0.16, hlc[1], 0], group: 'steer', r: 0.06 });
  handlebar(ctx, { type: 'wide', rise: 0.04, back: 0.12, half: 0.36, mat: M.chrome() });
  dash(ctx, [0.32, 0.96, 0], 0.09, 0.05, { tilt: -1.3 });
  for (const s of [-1, 1]) mirror(ctx, [ctx.barEnds[0][0] + 0.1, ctx.barEnds[0][1], s * 0.24], s, { reach: 0.3, up: 0.14 });
  footpegs(ctx, 0.05, 0.32, 0.2);
  for (const s of [-1, 1]) shock(ctx, [-0.6, 0.38, s * 0.16], [-0.42, 0.64, s * 0.13], { r: 0.026, springColor: 0xc81e1e });
  frontFender(ctx, { from: 1.8, len: 1.6, w: 0.14, mat: mats.paintSolid });
  { const hp = ctx.sp(ctx.Lf + 0.05); details(ctx, { plate: { pos: [-0.76, 0.6, 0], tilt: 0.35 }, signalsF: [[hp[0] + 0.1, hp[1], 0.17], [hp[0] + 0.1, hp[1], -0.17]], signalsFGroup: 'steer' }); }
}

// 9. Motocross + 10. Supermoto share the MX body
function mxBody(ctx, sm) {
  const { A, mats } = ctx;
  setupChassis(ctx);
  fork(ctx, { type: 'usd', innerMat: M.gold(), outerMat: sm ? M.anodized(0x1a1a1a) : M.anodized(0x1d1f22), outerR: 0.03, innerR: 0.025 });
  wheels(ctx, {
    singleFrontDisc: true, caliperColor: sm ? 0xd4a431 : 0x2a2a2a, carrier: '#2a2a2a', fDiscR: sm ? 0.16 : 0.135, rDiscR: 0.11,
    discStyle: 'wave', sprocketR: 0.12, sprocketColor: sm ? 0xd4a431 : 0x111111,
  });
  swingarm(ctx, { style: 'box', mat: M.aluminum(), h: 0.04 });
  chain(ctx, { rearR: 0.12 });
  const H = ctx.head, [px, py] = ctx.pivot;
  const fm = mats.frame;
  A.add('chassis', rod(ctx.sp(ctx.Lf - 0.02), ctx.sp(ctx.Lf + ctx.headLen + 0.02), 0.034, 16), fm);
  for (const s of [-1, 1]) {
    // perimeter spars + cradle
    A.add('chassis', tube([[H[0], H[1] + 0.08, s * 0.03], [H[0] - 0.25, H[1] - 0.05, s * 0.11], [px + 0.06, py + 0.12, s * 0.12], [px, py - 0.04, s * 0.11]], 0.016), fm);
    A.add('chassis', tube([[px, py - 0.05, s * 0.1], [px + 0.05, 0.28, s * 0.08], [0.22, 0.24, s * 0.06]], 0.015), fm);
    A.add('chassis', tube([[px + 0.04, py + 0.12, s * 0.12], [-0.4, 0.78, s * 0.09], [-0.62, 0.86, s * 0.08]], 0.011), M.aluminum());
  }
  A.add('chassis', tube([[H[0] - 0.02, H[1] - 0.02, 0], [H[0] - 0.08, 0.4, 0], [0.24, 0.24, 0]], 0.018), fm);
  // single cylinder
  crankcase(ctx, [0.0, 0.33, 0], [0.3, 0.2, 0.2], { coverR: 0.08, coverMat: M.engine(0x8a8f96) });
  finnedCylinder(ctx, [0.04, 0.42, 0], [0.12, 1, 0], 0.22, { core: 0.06, fin: 0.07, fins: 4, mat: M.engine(0x2f3236) });
  const head = box(0.14, 0.08, 0.16, 0.02); place(head, { p: [0.08, 0.68, 0], r: [0, 0, -0.1] }); A.add('chassis', head, M.engine(0x8a8f96));
  for (const s of [-1, 1]) radiator(ctx, [0.18, 0.62, s * 0.11], 0.04, 0.22, { tilt: -0.3 });
  // exhaust
  if (sm) {
    header(ctx, [[0.12, 0.62, 0.03], [0.22, 0.52, 0.07], [0.2, 0.32, 0.12], [0.0, 0.3, 0.14], [-0.25, 0.48, 0.14]], 0.022, M.titanium());
    muffler(ctx, [-0.25, 0.48, 0.14], [-0.6, 0.66, 0.14], { type: 'hex', r: 0.05, mat: M.carbon(), endcap: M.titanium() });
  } else {
    header(ctx, [[0.12, 0.62, 0.03], [0.22, 0.52, 0.08], [0.18, 0.38, 0.13], [-0.05, 0.5, 0.14], [-0.3, 0.66, 0.13]], 0.022, M.titanium());
    muffler(ctx, [-0.3, 0.66, 0.13], [-0.66, 0.8, 0.12], { type: 'round', r: 0.045, mat: M.aluminum(), endcap: M.black() });
  }
  // tank + shrouds (plastics)
  const tank = loft([
    { x: 0.28, y: 0.85, w: 0.08, ht: 0.045, hb: 0.07, n: 2.6 },
    { x: 0.14, y: 0.87, w: 0.13, ht: 0.06, hb: 0.1, n: 2.8 },
    { x: -0.06, y: 0.86, w: 0.12, ht: 0.05, hb: 0.1, n: 2.6 },
  ], { radial: 24, sub: 5, capStart: true, capEnd: true });
  A.add('chassis', tank, mats.paint);
  for (const s of [-1, 1]) {
    const sh = loft([
      { x: 0.38, y: 0.78, w: 0.012, ht: 0.05, hb: 0.18, n: 3, z: s * 0.13 },
      { x: 0.22, y: 0.8, w: 0.02, ht: 0.08, hb: 0.2, n: 3.4, z: s * 0.165 },
      { x: 0.02, y: 0.84, w: 0.012, ht: 0.06, hb: 0.12, n: 3, z: s * 0.14 },
    ], { radial: 16, sub: 5, capStart: true, capEnd: true });
    A.add('chassis', sh, mats.paint);
    // side number plates
    const sp = loft([
      { x: -0.1, y: 0.8, w: 0.012, ht: 0.06, hb: 0.1, n: 3.4, z: s * 0.115 },
      { x: -0.36, y: 0.83, w: 0.014, ht: 0.075, hb: 0.1, n: 3.6, z: s * 0.125 },
      { x: -0.62, y: 0.88, w: 0.01, ht: 0.03, hb: 0.05, n: 3, z: s * 0.09 },
    ], { radial: 14, sub: 5, capStart: true, capEnd: true });
    A.add('chassis', sp, mats.paint2Solid);
    numberPlate(ctx, [-0.36, 0.82, s * 0.141], [0.15, 0.11], mats.plate, { r: [0, s > 0 ? 0 : Math.PI, 0] });
  }
  // long flat seat
  seatLoft(ctx, 0.08, -0.62, 0.93, 0.1, 0.035, { frontRise: 0.02 });
  // upswept rear fender
  const rf = loft([
    { x: -0.42, y: 0.86, w: 0.1, ht: 0.015, hb: 0.01, n: 3 },
    { x: -0.7, y: 0.9, w: 0.08, ht: 0.015, hb: 0.01, n: 3 },
    { x: -0.92, y: 0.95, w: 0.04, ht: 0.01, hb: 0.008, n: 2.4 },
  ], { radial: 16, sub: 5, capEnd: true });
  A.add('chassis', rf, mats.paintSolid);
  // fenders + front plate
  if (sm) {
    frontFender(ctx, { from: 1.8, len: 1.6, w: 0.13, mat: mats.paintSolid, gap: 0.02 });
    const hl = box(0.03, 0.06, 0.08, 0.01); place(hl, { p: [ctx.fp(ctx.Lf + 0.03)[0] + 0.07, ctx.fp(ctx.Lf + 0.03)[1], 0], r: [0, 0, 0.35] }); A.add('steer', hl, ctx.mats.head);
    ctx.headlights.push({ pos: [ctx.fp(ctx.Lf + 0.03)[0] + 0.09, ctx.fp(ctx.Lf + 0.03)[1], 0], group: 'steer', r: 0.03 });
    tailLight(ctx, [-0.9, 0.94, 0], 0.04, 0.012, { tilt: 0.3 });
  } else {
    // high front fender on lower triple clamp
    const ff = loft([
      { x: ctx.fp(ctx.Lf)[0] - 0.12, y: ctx.fp(ctx.Lf)[1] - 0.05, w: 0.06, ht: 0.012, hb: 0.008, n: 3 },
      { x: ctx.fp(ctx.Lf)[0] + 0.05, y: ctx.fp(ctx.Lf)[1] - 0.04, w: 0.08, ht: 0.015, hb: 0.008, n: 3 },
      { x: ctx.fp(ctx.Lf)[0] + 0.28, y: ctx.fp(ctx.Lf)[1] - 0.1, w: 0.06, ht: 0.012, hb: 0.008, n: 3 },
      { x: ctx.fp(ctx.Lf)[0] + 0.4, y: ctx.fp(ctx.Lf)[1] - 0.12, w: 0.04, ht: 0.01, hb: 0.006, n: 2.6 },
    ], { radial: 16, sub: 5, capStart: true, capEnd: true });
    A.add('steer', ff, mats.paintSolid);
    ctx.headlights.push({ pos: [0.7, 1.0, 0], group: 'steer', r: 0, none: true });
  }
  const plate = loft([
    { x: 0, y: 0, w: 0.1, ht: 0.11, hb: 0.08, n: 3.4 },
    { x: 0.015, y: 0, w: 0.1, ht: 0.11, hb: 0.08, n: 3.4 },
  ], { radial: 18, sub: 1, capStart: true, capEnd: true });
  const pc = ctx.fp(ctx.Lf + 0.06);
  plate.rotateZ(ctx.rake * 0.6); plate.translate(pc[0] + 0.05, pc[1], 0);
  A.add('steer', plate, mats.paint2Solid);
  numberPlate(ctx, [pc[0] + 0.068, pc[1] + 0.01, 0], [0.13, 0.12], mats.plate, { r: [0, Math.PI / 2, ctx.rake * 0.6], group: 'steer' });
  handlebar(ctx, { type: 'mx', rise: 0.11, back: 0.08, half: 0.4, mat: M.anodized(sm ? 0x111111 : 0xd4a431), r: 0.013 });
  // hand guards
  for (const e of ctx.barEnds) {
    const s = Math.sign(e[2]);
    const hg = loft([
      { x: e[0] + 0.02, y: e[1], w: 0.04, ht: 0.03, hb: 0.01, n: 2.4, z: e[2] - s * 0.1 },
      { x: e[0] + 0.07, y: e[1] + 0.01, w: 0.05, ht: 0.04, hb: 0.01, n: 2.4, z: e[2] - s * 0.04 },
    ], { radial: 12, sub: 3, t0: 0, t1: Math.PI });
    A.add('steer', hg, M.plastic(0xf2f2f2));
  }
  dash(ctx, [pc[0] + 0.0, pc[1] + 0.1, 0], 0.05, 0.03, { group: 'steer', tilt: -1.0 });
  footpegs(ctx, -0.12, 0.42, 0.17);
  shock(ctx, [-0.1, 0.78, 0], [-0.26, 0.42, 0], { r: 0.034, springColor: sm ? 0xc81e1e : 0x4a8a2a, reservoir: true });
  if (sm) details(ctx, { plate: { pos: [-0.95, 0.82, 0], tilt: 0.6 } }); else details(ctx, { kickstand: false });
}

function mx(ctx) { mxBody(ctx, false); }
function sm(ctx) { mxBody(ctx, true); }

// 11. Adventure with boxer twin
function adventure(ctx) {
  const { A, mats } = ctx;
  setupChassis(ctx);
  fork(ctx, { type: 'usd', innerMat: M.gold(), outerMat: M.anodized(0x1d1f22), outerR: 0.03 });
  wheels(ctx, { caliperColor: 0xd4a431, carrier: '#2a2a2a', fDiscR: 0.16, noSprocket: true });
  swingarm(ctx, { style: 'single', mat: M.aluminum(), side: 0.12 });
  A.add('swingarm', rod([ctx.pivot[0], ctx.pivot[1], -0.13], [ctx.rear.x, ctx.rear.y, -0.13], 0.04, 14), M.anodized(0x2a2a2a));
  const fm = mats.frame;
  const H = ctx.head, [px, py] = ctx.pivot;
  A.add('chassis', rod(ctx.sp(ctx.Lf - 0.02), ctx.sp(ctx.Lf + ctx.headLen + 0.02), 0.036, 16), fm);
  for (const s of [-1, 1]) {
    A.add('chassis', tube([[H[0], H[1] + 0.1, s * 0.03], [H[0] - 0.3, H[1] - 0.02, s * 0.1], [px + 0.05, py + 0.18, s * 0.12], [px, py, s * 0.12]], 0.018), fm);
    A.add('chassis', tube([[px + 0.05, py + 0.18, s * 0.12], [-0.45, 0.84, s * 0.12], [-0.72, 0.86, s * 0.12]], 0.013), fm);
  }
  // boxer: crankcase + horizontal cylinders sticking out both sides
  crankcase(ctx, [0.02, 0.4, 0], [0.32, 0.24, 0.2], { covers: false, mat: M.engine(0x3a3d42) });
  for (const s of [-1, 1]) {
    finnedCylinder(ctx, [0.1, 0.38, s * 0.1], [0.15, 0.08, s * 1], 0.18, { core: 0.06, fin: 0.075, fins: 7, mat: M.engine(0x2f3236) });
    const head = box(0.15, 0.13, 0.08, 0.03); place(head, { p: [0.135, 0.4, s * 0.31] }); A.add('chassis', head, M.aluminum());
    const vc = box(0.13, 0.11, 0.03, 0.02); place(vc, { p: [0.135, 0.4, s * 0.355] }); A.add('chassis', vc, mats.paint2Solid);
    // crash bars
    A.add('chassis', tube([[0.32, 0.58, s * 0.13], [0.36, 0.45, s * 0.33], [0.25, 0.28, s * 0.36], [0.0, 0.3, s * 0.3], [-0.05, 0.5, s * 0.15]], 0.012), M.black());
  }
  // exhaust right high
  header(ctx, [[0.2, 0.36, 0.34], [0.28, 0.24, 0.24], [0.05, 0.16, 0.14], [-0.22, 0.28, 0.16], [-0.35, 0.48, 0.2]], 0.024, M.aluminum());
  muffler(ctx, [-0.35, 0.48, 0.2], [-0.68, 0.62, 0.2], { type: 'hex', r: 0.06, mat: M.aluminum(), endcap: M.black() });
  // big tank
  const tank = loft([
    { x: 0.42, y: 0.92, w: 0.12, ht: 0.05, hb: 0.08, n: 2.8 },
    { x: 0.26, y: 0.98, w: 0.21, ht: 0.09, hb: 0.15, n: 3 },
    { x: 0.04, y: 0.97, w: 0.2, ht: 0.08, hb: 0.15, n: 3 },
    { x: -0.12, y: 0.9, w: 0.13, ht: 0.05, hb: 0.1, n: 2.6 },
  ], { radial: 28, sub: 6, capStart: true, capEnd: true });
  A.add('chassis', tank, mats.paint);
  // fairing with headlight, beak and tall screen
  const fair = loft([
    { x: 0.82, y: 1.03, w: 0.06, ht: 0.05, hb: 0.06, n: 2.6 },
    { x: 0.72, y: 1.05, w: 0.15, ht: 0.09, hb: 0.12, n: 2.8 },
    { x: 0.55, y: 1.02, w: 0.21, ht: 0.1, hb: 0.17, n: 3 },
    { x: 0.42, y: 0.96, w: 0.22, ht: 0.06, hb: 0.15, n: 3 },
  ], { radial: 28, sub: 6, capStart: true });
  A.add('chassis', fair, mats.paint);
  const beak = loft([
    { x: 0.62, y: 0.88, w: 0.1, ht: 0.03, hb: 0.01, n: 2.6 },
    { x: 0.8, y: 0.86, w: 0.08, ht: 0.025, hb: 0.01, n: 2.6 },
    { x: 0.94, y: 0.8, w: 0.04, ht: 0.015, hb: 0.008, n: 2.4 },
  ], { radial: 16, sub: 5, capStart: true, capEnd: true });
  A.add('chassis', beak, mats.paint2Solid);
  for (const s of [-1, 1]) {
    const hl = sphere(0.05, 16, 10); hl.scale(0.4, 0.75, 1); hl.translate(0.83, 1.02, s * 0.05); A.add('chassis', hl, ctx.mats.head);
  }
  ctx.headlights.push({ pos: [0.85, 1.02, 0], group: 'chassis', r: 0.05 });
  const screen = loft([
    { x: 0.76, y: 1.12, w: 0.13, ht: 0.03, n: 2 },
    { x: 0.66, y: 1.26, w: 0.17, ht: 0.03, n: 2 },
    { x: 0.6, y: 1.36, w: 0.16, ht: 0.02, n: 2 },
  ], { radial: 16, sub: 6, t0: 0.25, t1: Math.PI - 0.25 });
  A.add('chassis', screen, mats.glass);
  seatLoft(ctx, -0.1, -0.5, 0.92, 0.15, 0.05, { frontRise: -0.02 });
  seatLoft(ctx, -0.5, -0.74, 0.96, 0.12, 0.04);
  // rack + panniers + top case (aluminium boxes)
  for (const s of [-1, 1]) {
    const p = box(0.42, 0.34, 0.14, 0.02); place(p, { p: [-0.62, 0.66, s * 0.26] }); A.add('chassis', p, M.aluminum());
    const lid = box(0.43, 0.04, 0.15, 0.015); place(lid, { p: [-0.62, 0.85, s * 0.26] }); A.add('chassis', lid, M.black());
    A.add('chassis', rod([-0.4, 0.82, s * 0.19], [-0.84, 0.82, s * 0.19], 0.01, 8), M.black());
  }
  const tc = box(0.3, 0.24, 0.36, 0.03); place(tc, { p: [-0.84, 1.08, 0] }); A.add('chassis', tc, M.aluminum());
  tailLight(ctx, [-0.99, 1.06, 0], 0.1, 0.02, { tilt: 0 });
  handlebar(ctx, { type: 'wide', rise: 0.1, back: 0.14, half: 0.41 });
  for (const e of ctx.barEnds) {
    const s = Math.sign(e[2]);
    const hg = loft([
      { x: e[0] + 0.02, y: e[1], w: 0.04, ht: 0.03, hb: 0.01, n: 2.4, z: e[2] - s * 0.1 },
      { x: e[0] + 0.07, y: e[1] + 0.01, w: 0.05, ht: 0.04, hb: 0.01, n: 2.4, z: e[2] - s * 0.04 },
    ], { radial: 12, sub: 3, t0: 0, t1: Math.PI });
    A.add('steer', hg, M.plastic(0x1a1a1a));
  }
  dash(ctx, [0.58, 1.1, 0], 0.14, 0.09, { tilt: -1.05 });
  for (const s of [-1, 1]) mirror(ctx, [0.6, 1.06, s * 0.2], s, { group: 'chassis', reach: 0.32, up: 0.12 });
  footpegs(ctx, -0.12, 0.42, 0.19);
  shock(ctx, [-0.08, 0.7, 0.03], [-0.25, 0.4, 0.03], { r: 0.03, springColor: 0xd4a431, reservoir: true });
  frontFender(ctx, { from: 1.8, len: 1.7, w: 0.12, mat: mats.paintSolid, gap: 0.02 });
  details(ctx, { plate: { pos: [-1.02, 0.84, 0], tilt: 0.2 }, signalsF: [[0.64, 0.95, 0.24], [0.64, 0.95, -0.24]] });
}

// 12. 80s two-stroke GP replica
function twostroke(ctx) {
  const { A, mats } = ctx;
  setupChassis(ctx);
  fork(ctx, { type: 'conv', lowerMat: M.gold(), innerMat: M.chrome(), stanchionR: 0.022, lowerR: 0.03 });
  wheels(ctx, { caliperColor: 0xd4a431, carrier: '#d4a431', fDiscR: 0.15, discStyle: 'drilled' });
  swingarm(ctx, { style: 'banana', mat: M.aluminum(), h: 0.055 });
  chain(ctx);
  twinSpar(ctx, { mat: mats.frame, z: 0.12 });
  // compact V4 2-stroke block
  crankcase(ctx, [0.06, 0.32, 0], [0.32, 0.18, 0.26], { tilt: 0.05 });
  for (const [x, a] of [[0.17, -0.7], [-0.02, 0.55]]) {
    const b = box(0.12, 0.18, 0.28, 0.02); place(b, { p: [x, 0.5, 0], r: [0, 0, a] }); A.add('chassis', b, M.engine(0x55595f));
  }
  radiator(ctx, [0.35, 0.5, 0], 0.32, 0.26, { tilt: -0.2 });
  // four expansion chambers: two below, two up under the tail
  for (const s of [-1, 1]) {
    expansionChamber(ctx, [[0.26, 0.42, s * 0.06], [0.36, 0.3, s * 0.08], [0.32, 0.16, s * 0.1], [0.12, 0.11, s * 0.1], [-0.12, 0.13, s * 0.12], [-0.28, 0.2, s * 0.14], [-0.38, 0.26, s * 0.15]], 0.05);
    expansionChamber(ctx, [[0.0, 0.56, s * 0.05], [-0.06, 0.48, s * 0.1], [-0.15, 0.5, s * 0.13], [-0.32, 0.6, s * 0.1], [-0.48, 0.7, s * 0.05], [-0.62, 0.78, s * 0.04]], 0.045);
  }
  sportBodyRetro(ctx, { k: 0.9, round: true, nose: 0.9, tailX: -0.7, hump: 0.09 });
  const board = sphere(0.1, 20, 12); board.scale(0.08, 0.6, 0.85); board.translate(0.895, 0.84, 0); A.add('chassis', board, mats.plateSolid);
  numberPlate(ctx, [0.905, 0.84, 0], [0.12, 0.09], mats.plate, { r: [0, Math.PI / 2, 0] });
  ctx.headlights.push({ pos: [0.88, 0.8, 0], group: 'chassis', r: 0, none: true });
  tailLight(ctx, [-0.68, 0.86, 0], 0.03, 0.015);
  handlebar(ctx, { type: 'clipon' });
  dash(ctx, [0.5, 0.93, 0], 0.07, 0.06, { tilt: -1.0 });
  footpegs(ctx, -0.22, 0.42, 0.15, { plates: true });
  shock(ctx, [-0.06, 0.6, 0], [-0.18, 0.35, 0], { r: 0.024, springColor: 0xd4a431 });
  frontFender(ctx, { from: 1.8, len: 1.7, w: 0.12, mat: mats.paintSolid });
  details(ctx, { damper: true, kickstand: false });
}

export const DESIGNS = { superbike, gp, naked, electric, cruiser, bobber, cafe, drag, mx, sm, adventure, twostroke };
