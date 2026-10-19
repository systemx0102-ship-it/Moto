// Twelve procedural motorcycle designs. Bike space: x forward, y up, z right.
import * as THREE from 'three';
import {
  setupChassis, wheel, caliper, fork, frontFender, rearFender, swingarm, chain, belt, shock,
  finnedCylinder, crankcase, radiator, header, muffler, expansionChamber, headlightRound, ledStrip,
  tailLight, mirror, handlebar, dash, footpegs, numberPlate, closedLathe, details,
  loft, loftProfile, tube, taperTube, lathe, box, cyl, sphere, place, rod, spring, torus, mirrorZ, V, DEG,
} from './parts.js';
import { engineUnit } from './engine.js';
import { coons, shell, mirrorPanel, sideUV, sideUVLeft, onPanel } from './panel.js';
import { sideLiveryTexture } from '../core/textures.js';
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
  const mat = o.mat || M.aluminum();
  for (const s of [-1, 1]) {
    // pressed/extruded beam: tall box section with crisp corners
    const g = loft([
      { x: H[0] + 0.02, y: H[1] + 0.06, w: 0.032, ht: 0.07, n: 5, z: s * 0.05 },
      { x: H[0] - 0.12, y: H[1] + 0.025, w: 0.03, ht: 0.085, n: 5, z: s * zw * 0.85 },
      { x: (H[0] + px) / 2, y: (H[1] + py) / 2 + 0.075, w: 0.028, ht: 0.08, n: 5, z: s * zw },
      { x: px + 0.07, y: py + 0.06, w: 0.028, ht: 0.09, n: 5, z: s * zw * 0.95 },
      { x: px - 0.01, y: py - 0.01, w: 0.03, ht: 0.085, n: 5, z: s * zw * 0.9 },
    ], { radial: 20, sub: 6, capStart: true, capEnd: true });
    ctx.A.add('chassis', g, mat);
    // cast pivot plate with the swingarm pivot boss
    const plate = box(0.13, 0.2, 0.016, 0.01);
    place(plate, { p: [px + 0.01, py + 0.01, s * zw * 0.92] });
    ctx.A.add('chassis', plate, mat);
    const boss = cyl(0.042, 0.042, 0.03, 22, 'z'); boss.translate(px, py, s * zw * 0.95);
    ctx.A.add('chassis', boss, mat);
    // engine mount bolts through the beam
    for (const [bx, by] of [[(H[0] + px) / 2 + 0.05, (H[1] + py) / 2 + 0.03], [px + 0.06, py + 0.1]]) {
      const b = cyl(0.009, 0.009, 0.012, 6, 'z'); b.translate(bx, by, s * (zw + 0.03));
      ctx.A.add('chassis', b, M.chrome());
    }
  }
  // cast headstock wrapping the head tube
  ctx.A.add('chassis', rod(ctx.sp(ctx.Lf - 0.01), ctx.sp(ctx.Lf + ctx.headLen + 0.01), 0.04, 20), mat);
  const hs = box(0.1, ctx.headLen + 0.02, 0.1, 0.02);
  const hm = ctx.sp(ctx.Lf + ctx.headLen / 2);
  place(hs, { p: [hm[0] - 0.035, hm[1], 0], r: [0, 0, ctx.rake] });
  ctx.A.add('chassis', hs, mat);
}

// Subframe rails under seat/tail
function subframe(ctx, from, to, z = 0.09, r = 0.012, mat) {
  for (const s of [-1, 1]) ctx.A.add('chassis', rod([from[0], from[1], s * z], [to[0], to[1], s * z * 0.7], r, 8), mat || M.aluminum());
}

function seatLoft(ctx, x0, x1, y, w, h, o = {}) {
  // the first seat built is the rider's: sit a third of the way back from its front
  if (!ctx.seat) ctx.seat = { x: x0 + (x1 - x0) * 0.32, y: y + h * 0.9 + (o.frontRise ?? 0) * 0.5 };
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
  const soft = !!P.smooth; // 90s two-stroke: rounded panels, no hard creases
  if (P.panels) return sportPanels(ctx, P);
  // nose cowl: bottom centre, chin flank, headlight crease, shoulder crease, top centre
  const cowl = loftProfile([
    S(nx, [0, 0.822], [0.012, 0.826], [0.022, 0.835], [0.012, 0.845], [0, 0.848]),
    S(nx - 0.04, [0, 0.79], [0.045, 0.8], [0.075, 0.835], [0.05, 0.865], [0, 0.875]),
    S(nx - 0.13, [0, 0.745], [0.075, 0.763], [0.13, 0.838], [0.1, 0.9], [0, 0.915]),
    S(nx - 0.25, [0, 0.71], [0.1, 0.728], [0.172, 0.828], [0.148, 0.925], [0, 0.95]),
    S(nx - 0.37, [0, 0.69], [0.118, 0.7], [0.198, 0.8], [0.178, 0.922], [0, 0.958]),
    S(nx - 0.47, [0, 0.7], [0.12, 0.7], [0.19, 0.78], [0.17, 0.89], [0, 0.93]),
    S(nx - 0.53, [0, 0.72], [0.1, 0.72], [0.15, 0.77], [0.13, 0.86], [0, 0.88]),
  ], { sub: 6, around: 4, creases: soft ? [] : [2, 3], capStart: true, capEnd: true });
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
  ], { sub: 6, around: 4, creases: soft ? [] : [2], capStart: true, capEnd: true });
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
  return sportRest(ctx, P);
}

// Flat label (canvas text) facing +z, w x h metres; mat attached in userData.
function labelPlane(ctx, text, w, h, color, bg) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * (h / w));
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = color; g.font = `600 ${Math.round(c.height * 0.72)}px Barlow, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height * 0.54, c.width * 0.96);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(w, h);
  geo.userData.mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.5, metalness: 0.2 });
  return geo;
}

// Tank, tail, seat and screen shared by the classic and the panelled sport bodies.
function sportRest(ctx, P) {
  const { A, mats } = ctx;
  const k = P.k ?? 1;
  const nx = P.nose ?? 0.97;
  const S = (x, ...pts) => ({ x, pts: pts.map(([z, y]) => [z * k, y]) });
  const soft = !!P.smooth;
  // fuel tank with faceted knee recesses
  const tank = loftProfile([
    S(0.47, [0, 0.845], [0.08, 0.85], [0.1, 0.882], [0.082, 0.922], [0, 0.935]),
    S(0.34, [0, 0.83], [0.15, 0.84], [0.178, 0.895], [0.15, 0.975], [0, 0.995]),
    S(0.14, [0, 0.83], [0.152, 0.84], [0.185, 0.895], [0.158, 0.978], [0, 1.0]),
    S(-0.04, [0, 0.83], [0.115, 0.84], [0.138, 0.875], [0.115, 0.93], [0, 0.948]),
    S(-0.14, [0, 0.845], [0.07, 0.85], [0.08, 0.865], [0.06, 0.888], [0, 0.897]),
  ], { sub: 6, around: 4, creases: [2], capStart: true, capEnd: true });
  if (!P.panels) A.add('chassis', tank, mats.paintPlain);
  // knife-edge tail unit
  const tx = P.tailX ?? -0.9;
  const hump = P.hump ?? 0.055;
  const tail = loftProfile([
    S(-0.02, [0, 0.7], [0.1, 0.71], [0.15, 0.76], [0.13, 0.83], [0, 0.84]),
    S(-0.3, [0, 0.74], [0.08, 0.75], [0.13, 0.8], [0.12, 0.86], [0, 0.87]),
    S((-0.3 + tx) / 2 - 0.05, [0, 0.8], [0.05, 0.81], [0.1, 0.87], [0.08, 0.875 + hump], [0, 0.885 + hump]),
    S(tx + 0.12, [0, 0.86], [0.03, 0.87], [0.06, 0.92], [0.045, 0.955], [0, 0.962]),
    S(tx, [0, 0.92], [0.008, 0.925], [0.015, 0.945], [0.01, 0.958], [0, 0.96]),
  ], { sub: 6, around: 4, creases: soft ? [] : [2, 3], capStart: true, capEnd: true });
  if (!P.panels) A.add('chassis', tail, mats.paintPlain);
  // dark undertray beneath the tail
  if (!P.noUnder) A.add('chassis', loft([
    { x: -0.2, y: 0.71, w: 0.09 * k, ht: 0.03, hb: 0.03, n: 2.4 },
    { x: -0.55, y: 0.79, w: 0.07 * k, ht: 0.03, hb: 0.03, n: 2.4 },
    { x: -0.76, y: 0.85, w: 0.035 * k, ht: 0.02, hb: 0.02, n: 2.2 },
  ], { radial: 18, sub: 4, capStart: true, capEnd: true }), M.plastic(0x101012));
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
  for (const s of soft || P.panels ? [] : [-1, 1]) {
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


// ---------------------------------------------------------------------------
// Panelled superbike bodywork: thin-shell plastics with real outlines and shut lines
// (nose cowl with LED eyes and ram-air mouth, side fairing with a vented flank, V belly
// pan), painted with a side-view livery that follows the panel lines.
function raceLivery(ctx, label) {
  const L = ctx.livery, num = String(L.number || ctx.spec.short.length * 7 + 2);
  const frame = [-1.0, 1.05, 0.1, 1.2];
  const SP = [['NEXOL', '#ffffff', '#111111'], ['VELOX', '#ffd400', '#111111'], ['TURBOMAX', '#111111', '#ffffff'], ['ZENTEK', '#e2231a', '#ffffff'], ['BAYO', '#1a4fd6', '#ffffff']];
  const map = sideLiveryTexture(`race:${JSON.stringify(L)}:${label}`, frame, (g, X, Y, side) => {
    const poly = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); g.fillStyle = fill; g.fill(); };
    const line = (pts, w, col) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.lineWidth = w; g.strokeStyle = col; g.stroke(); };
    g.fillStyle = L.base; g.fillRect(0, 0, 4096, 4096);
    // second colour: a blade from the nose sweeping down the flank into the belly pan
    const blade = [[1.02, 0.82], [0.86, 0.76], [0.62, 0.69], [0.45, 0.58], [0.26, 0.45], [0.04, 0.36], [-0.05, 0.2], [0.3, 0.2], [0.52, 0.42], [0.7, 0.6], [0.9, 0.7], [1.02, 0.76]];
    poly(blade, L.second);
    line([[1.02, 0.835], [0.86, 0.775], [0.62, 0.705], [0.45, 0.595], [0.26, 0.465], [0.04, 0.375]], 7, L.accent);
    // tail: second colour underside with an accent cut
    poly([[-0.05, 0.72], [-0.5, 0.8], [-0.95, 0.9], [-0.95, 0.86], [-0.45, 0.75], [-0.05, 0.66]], L.second);
    line([[-0.05, 0.735], [-0.5, 0.815], [-0.95, 0.915]], 5, L.accent);
    // model badge and sponsor decals on the side fairing
    const txt = (t, x, y, size, col, font = 'italic 700', fam = '"Barlow Condensed", Arial, sans-serif') => {
      g.font = `${font} ${size}px ${fam}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(t, X(x), Y(y));
    };
    const deco = (x, y, w, h, sp) => {
      const x0p = Math.min(X(x - w / 2), X(x + w / 2)), wp = Math.abs(X(x + w / 2) - X(x - w / 2)), hp = Math.abs(Y(y + h / 2) - Y(y - h / 2));
      g.fillStyle = sp[1]; g.fillRect(x0p, Y(y + h / 2), wp, hp);
      g.fillStyle = sp[2]; g.font = `italic 700 ${Math.round(hp * 0.78)}px "Barlow Condensed", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(sp[0], X(x), Y(y) + hp * 0.04, wp * 0.88);
    };
    const off = label.length % SP.length;
    txt(label, 0.22, 0.6, 84, L.accent === L.base ? '#ffffff' : L.accent);
    deco(0.24, 0.715, 0.13, 0.03, SP[off]);
    deco(0.27, 0.33, 0.16, 0.032, SP[(off + 2) % SP.length]);
    deco(0.8, 0.79, 0.1, 0.026, SP[(off + 3) % SP.length]);
    // racing number on the tail
    g.lineWidth = 10; g.strokeStyle = L.base;
    g.font = '700 150px "Barlow Condensed", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.strokeText(num, X(-0.55), Y(0.865)); g.fillText(num, X(-0.55), Y(0.865));
    // small technical stickers
    g.font = '600 26px Barlow, Arial, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText('MÍTICO RACING DEPT.', X(0.2), Y(0.5));
  });
  return { map, frame };
}

function sportPanels(ctx, P) {
  const { A, mats } = ctx;
  const { map, frame } = raceLivery(ctx, ctx.spec.short);
  const paint = mats.side || (mats.side = mats.makePaint(map));
  const uv = sideUV(frame);
  const both = (geo, mat) => { A.add('chassis', geo, mat); A.add('chassis', mirrorPanel(geo, mat === paint ? sideUVLeft : null), mat); };
  const T = 0.0045;
  // ---- nose cowl: pointed beak, shoulders under the screen, chin over the wheel
  const cowlRows = coons(
    [[0.6, 0.7, 0.19], [0.74, 0.712, 0.17], [0.87, 0.735, 0.118], [0.95, 0.762, 0.045], [0.975, 0.772, 0.0]],
    [[0.578, 0.945, 0.158], [0.7, 0.915, 0.138], [0.83, 0.875, 0.092], [0.93, 0.847, 0.034], [0.968, 0.838, 0.0]],
    [[0.6, 0.7, 0.19], [0.585, 0.83, 0.212], [0.578, 0.945, 0.158]],
    [[0.975, 0.772, 0.0], [0.993, 0.806, 0.0], [0.968, 0.838, 0.0]],
    26, 12, { dir: (p) => [(p[0] - 0.5) * 1.6, 0.25, 1], amount: 0.038 },
  );
  both(shell(cowlRows, { thick: T, out: [0.5, 0.2, 1], uv }), paint);
  // LED eyes: black recess with a light bar along the top edge (race replicas have none)
  if (P.eyes !== false) {
  const eye = onPanel(cowlRows, [[0.66, 0.18], [0.9, 0.3], [0.9, 0.56], [0.68, 0.46]], 0.0015, [0.6, 0.1, 1], 12, 5);
  both(shell(eye, { thick: 0.003, out: [0.6, 0.1, 1] }), M.darkChrome());
  const led = onPanel(cowlRows, [[0.68, 0.43], [0.9, 0.52], [0.9, 0.57], [0.68, 0.48]], 0.0035, [0.6, 0.1, 1], 12, 2);
  both(shell(led, { thick: 0.002, out: [0.6, 0.1, 1] }), mats.head);
  const proj = onPanel(cowlRows, [[0.72, 0.24], [0.84, 0.3], [0.84, 0.42], [0.73, 0.36]], 0.0032, [0.6, 0.1, 1], 8, 4);
  both(shell(proj, { thick: 0.002, out: [0.6, 0.1, 1] }), M.lens());
  ctx.headlights.push({ pos: [0.9, 0.79, 0], group: 'chassis', r: 0.05 });
  }
  // ram-air mouth under the beak
  const mouth = onPanel(cowlRows, [[0.88, 0.0], [1.0, 0.0], [1.0, 0.4], [0.9, 0.3]], 0.001, [0.8, -0.2, 0.6], 8, 4);
  both(shell(mouth, { thick: 0.003, out: [0.8, -0.2, 0.6] }), M.black());
  // ---- side fairing: flank between the cowl and the frame, vented
  const sideRows = coons(
    [[0.05, 0.44, 0.185], [0.22, 0.4, 0.2], [0.42, 0.47, 0.198], [0.55, 0.6, 0.18], [0.575, 0.67, 0.172]],
    [[0.08, 0.745, 0.15], [0.25, 0.795, 0.178], [0.45, 0.83, 0.196], [0.57, 0.845, 0.2]],
    [[0.05, 0.44, 0.185], [0.03, 0.6, 0.178], [0.08, 0.745, 0.15]],
    [[0.575, 0.67, 0.172], [0.58, 0.76, 0.205], [0.57, 0.845, 0.2]],
    28, 14, { dir: [0, 0.1, 1], amount: 0.032 },
  );
  both(shell(sideRows, { thick: T, out: [0, 0, 1], uv }), paint);
  // the vent: dark recess with three gills, a sharp chrome-black rim
  const vent = onPanel(sideRows, [[0.5, 0.36], [0.88, 0.58], [0.9, 0.86], [0.56, 0.68]], 0.0018, [0, 0.1, 1], 12, 6);
  both(shell(vent, { thick: 0.003, out: [0, 0, 1] }), M.black());
  for (let k = 0; k < 3; k++) {
    const a = 0.2 + k * 0.25;
    const gill = onPanel(sideRows, [[0.52 + a * 0.06, 0.38 + a * 0.4], [0.88 + a * 0.02, 0.6 + a * 0.24], [0.88 + a * 0.02, 0.63 + a * 0.24], [0.52 + a * 0.06, 0.41 + a * 0.4]], 0.006, [0, 0.1, 1], 8, 1);
    both(shell(gill, { thick: 0.004, out: [0, 0.4, 1] }), M.carbon());
  }
  // ---- V belly pan under the engine
  const bellyRows = coons(
    [[0.0, 0.25, 0.0], [0.2, 0.19, 0.0], [0.4, 0.22, 0.0], [0.52, 0.4, 0.0]],
    [[0.05, 0.425, 0.185], [0.22, 0.385, 0.2], [0.42, 0.455, 0.198], [0.545, 0.585, 0.18]],
    [[0.0, 0.25, 0.0], [0.025, 0.35, 0.13], [0.05, 0.425, 0.185]],
    [[0.52, 0.4, 0.0], [0.54, 0.5, 0.13], [0.545, 0.585, 0.18]],
    24, 10, { dir: [0, -0.5, 1], amount: 0.035 },
  );
  // a carbon belly keeps its own (panel) mapping so the weave stays at true scale
  if (P.bellyMat) both(shell(bellyRows, { thick: T, out: [0, -0.4, 1], uv: (p, u, v) => [u * 0.9, v * 0.45] }), P.bellyMat);
  else both(shell(bellyRows, { thick: T, out: [0, -0.4, 1], uv }), paint);
  // ---- inner black trim behind the cowl (dash surround) and the frame covers
  const inner = coons(
    [[0.5, 0.8, 0.15], [0.56, 0.78, 0.17]], [[0.47, 0.95, 0.1], [0.56, 0.93, 0.14]],
    [[0.5, 0.8, 0.15], [0.47, 0.95, 0.1]], [[0.56, 0.78, 0.17], [0.56, 0.93, 0.14]], 6, 6,
  );
  both(shell(inner, { thick: 0.004, out: [-0.3, 0.2, 1] }), M.plastic(0x101012));
  // ---- tail: thin upswept side panels, a pillion cover on top, the seat drops in between
  const tk = ((P.tailX ?? -0.9) + 0.06) / (-0.9 + 0.06);
  const tx = (x) => -0.06 + (x + 0.06) * tk;
  const lift = P.hump ? (P.hump - 0.055) : 0;
  const tp = (x, y, z) => [tx(x), y + lift * Math.max(0, (-0.3 - x) / 0.6), z];
  const tailRows = coons(
    [tp(-0.9, 0.9, 0.024), tp(-0.62, 0.805, 0.088), tp(-0.32, 0.738, 0.122), [-0.06, 0.7, 0.14]],
    [tp(-0.92, 0.968, 0.02), tp(-0.62, 0.91, 0.09), tp(-0.32, 0.868, 0.118), [-0.1, 0.852, 0.138]],
    [tp(-0.9, 0.9, 0.024), tp(-0.92, 0.968, 0.02)],
    [[-0.06, 0.7, 0.14], [-0.08, 0.78, 0.148], [-0.1, 0.852, 0.138]],
    26, 8, { dir: [0, 0.1, 1], amount: 0.014 },
  );
  both(shell(tailRows, { thick: T, out: [0, 0, 1], uv }), paint);
  const coverRows = coons(
    [tp(-0.93, 0.978, 0.0), tp(-0.7, 0.935, 0.0), tp(-0.44, 0.902, 0.0)],
    [tp(-0.92, 0.968, 0.02), tp(-0.7, 0.926, 0.074), tp(-0.44, 0.886, 0.11)],
    [tp(-0.93, 0.978, 0.0), tp(-0.92, 0.968, 0.02)],
    [tp(-0.44, 0.902, 0.0), tp(-0.44, 0.898, 0.06), tp(-0.44, 0.886, 0.11)],
    18, 6, { dir: [0, 1, 0.2], amount: 0.008 },
  );
  // ---- fuel tank: faceted side shells with knee recesses under a crowned top cover
  const tankSide = coons(
    [[-0.14, 0.846, 0.075], [0.05, 0.836, 0.132], [0.3, 0.84, 0.156], [0.47, 0.852, 0.105]],
    [[-0.14, 0.892, 0.06], [0.05, 0.942, 0.112], [0.3, 0.976, 0.138], [0.47, 0.93, 0.082]],
    [[-0.14, 0.846, 0.075], [-0.14, 0.892, 0.06]],
    [[0.47, 0.852, 0.105], [0.47, 0.93, 0.082]],
    22, 8, { dir: (p) => [0, 0.25, p[0] < 0.12 ? 0.35 : 1], amount: 0.016 },
  );
  both(shell(tankSide, { thick: T, out: [0, 0.2, 1], uv }), paint);
  const tankTop = coons(
    [[-0.14, 0.902, 0.0], [0.05, 0.968, 0.0], [0.3, 1.004, 0.0], [0.47, 0.946, 0.0]],
    [[-0.14, 0.892, 0.06], [0.05, 0.942, 0.112], [0.3, 0.976, 0.138], [0.47, 0.93, 0.082]],
    [[-0.14, 0.902, 0.0], [-0.14, 0.892, 0.06]],
    [[0.47, 0.946, 0.0], [0.47, 0.93, 0.082]],
    22, 8, { dir: [0, 1, 0.15], amount: 0.01 },
  );
  both(shell(tankTop, { thick: T, out: [0, 1, 0.1], uv }), paint);
  // fuel filler cap flush in the top cover
  const cap = cyl(0.04, 0.04, 0.008, 24, 'y'); place(cap, { p: [0.3, 1.004, 0], r: [0, 0, -0.15] }); A.add('chassis', cap, M.aluminum());
  both(shell(coverRows, { thick: T, out: [0, 1, 0.1], uv }), paint);
  // tail-light lens set into the tip, and a slim black seat surround
  const tl = onPanel(tailRows, [[0.0, 0.3], [0.12, 0.25], [0.12, 0.85], [0.0, 0.9]], 0.002, [-0.4, 0.2, 1], 6, 4);
  both(shell(tl, { thick: 0.003, out: [-0.4, 0.2, 1] }), mats.tail);
  return sportRest(ctx, P);
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
  radiator(ctx, [0.37, 0.52, 0], 0.27, 0.28, { tilt: -0.25 });
  const eng = engineUnit(ctx, { pos: [0.1, 0.3], cyl: 4, tilt: 0.5, cooling: 'liquid', caseMat: M.engine(0x1f2124), coverMat: M.engine(0x4a4d52), camMat: M.anodized(0x8a1010) });
  // headers -> collector -> right side muffler
  for (const [x, y, z] of eng.ports) {
    header(ctx, [[x, y, z], [x + 0.07, y - 0.1, z * 1.05], [0.4, 0.26, z * 0.9], [0.34, 0.14, z * 0.6], [0.15, 0.11, z * 0.3], [-0.02, 0.15, 0.06]], 0.018);
  }
  header(ctx, [[-0.02, 0.15, 0.06], [-0.14, 0.2, 0.14], [-0.22, 0.27, 0.17]], 0.03);
  muffler(ctx, [-0.22, 0.27, 0.17], [-0.56, 0.42, 0.17], { type: 'hex', r: 0.06, mat: M.titanium(), endcap: M.carbon() });
  sportBody(ctx, { panels: true });
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
  for (const s of [-1, 1]) mirror(ctx, [0.62, 0.95, s * 0.2], s, { group: 'chassis', reach: 0.3, up: 0.06, dx: -0.03, signal: true });
  footpegs(ctx, -0.2, 0.4, 0.17, { plates: true });
  shock(ctx, [-0.08, 0.62, 0], [-0.2, 0.36, 0], { r: 0.026, springColor: 0xe2b521 });
  frontFender(ctx, { from: 1.8, len: 1.7, w: 0.13, mat: mats.paintSolid });
  rearFender(ctx, { from: 1.9, len: 1.4, mat: M.carbon(), w: 0.2 });
  details(ctx, { damper: true, plate: { pos: [-0.86, 0.76, 0], tilt: 0.3 } });
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
  radiator(ctx, [0.38, 0.52, 0], 0.27, 0.3, { tilt: -0.22 });
  // 90-degree V4: front bank forward, rear bank under the tank
  const eng = engineUnit(ctx, { pos: [0.12, 0.3], layout: 'v', cyl: 2, tilt: 0.72, vAngle: Math.PI / 2, scale: 0.85, pitch: 0.08, cooling: 'liquid', caseMat: M.engine(0x1a1b1e), coverMat: M.carbon(), camMat: M.engine(0x2e3034) });
  eng.ports.forEach(([x, y, z], i) => {
    if (i < 2) header(ctx, [[x, y, z], [x + 0.06, y - 0.1, z * 1.1], [0.36, 0.2, z], [0.15, 0.12, z * 0.8 - 0.05], [-0.1, 0.22, -0.12], [-0.25, 0.32, -0.15], [-0.42, 0.36, -0.16]], 0.02);
    else header(ctx, [[x, y, z], [x - 0.06, y + 0.03, z], [-0.25, 0.52, z * 0.8], [-0.42, 0.62, 0.07]], 0.02);
  });
  muffler(ctx, [-0.42, 0.62, 0.07], [-0.66, 0.72, 0.07], { type: 'round', r: 0.045, mat: M.titanium() });
  muffler(ctx, [-0.42, 0.36, -0.16], [-0.62, 0.44, -0.16], { type: 'round', r: 0.04, mat: M.titanium() });
  sportBody(ctx, { panels: true, tailX: -0.8, hump: 0.085, bellyMat: M.carbon() });
  // winglets: stacked aero wings with endplates on both sides
  for (const s of [-1, 1]) {
    // stacked carbon wings off the cowl flank, joined by a thin endplate
    for (let k = 0; k < 2; k++) {
      const blade = box(0.12, 0.006, 0.075, 0.003);
      place(blade, { p: [0.66 - k * 0.03, 0.8 - k * 0.05, s * 0.21], r: [0, 0, 0.14] });
      A.add('chassis', blade, M.carbon());
    }
    const ep = box(0.11, 0.075, 0.004, 0.002);
    place(ep, { p: [0.645, 0.78, s * 0.248], r: [0, 0, 0.1] });
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
  radiator(ctx, [0.38, 0.48, 0], 0.3, 0.24, { tilt: -0.15 });
  const eng = engineUnit(ctx, { pos: [0.05, 0.31], cyl: 3, tilt: 0.38, cooling: 'liquid', caseMat: M.engine(0x232528), coverMat: M.engine(0x6a6e75), camMat: mats.accentSolid });
  for (const [x, y, z] of eng.ports) {
    header(ctx, [[x, y, z], [x + 0.06, y - 0.08, z * 1.05], [0.36, 0.24, z * 0.7], [0.3, 0.14, z * 0.4], [0.1, 0.12, 0.04], [-0.06, 0.18, 0.1]], 0.019, M.titanium());
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
  // Realistic electric streetfighter: steel trellis frame cradling a finned battery
  // box, oil-cooled motor under the swingarm pivot, belt final drive, charger
  // compartment where the tank would be, short tail, LED headlight nacelle.
  const { A, mats } = ctx;
  setupChassis(ctx);
  fork(ctx, { type: 'usd', innerMat: M.gold(), outerMat: M.anodized(0x15171a) });
  wheels(ctx, { noSprocket: true, caliperColor: 0xd4a431, carrier: '#1e1e1e', rimStripe: mats.accentSolid });
  swingarm(ctx, { style: 'banana', mat: M.anodized(0x1c1e21) });
  const bz = belt(ctx).z;
  // toothed belt pulley bolted to the rear wheel
  const pul = closedLathe([[0.045, -0.013], [0.126, -0.013], [0.134, -0.011], [0.134, 0.011], [0.126, 0.013], [0.045, 0.013]], 72);
  pul.translate(0, 0, bz);
  A.add('rearWheel', pul, M.aluminum(), { local: true });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const hole = cyl(0.024, 0.024, 0.03, 16, 'z'); hole.translate(Math.cos(a) * 0.09, Math.sin(a) * 0.09, bz);
    A.add('rearWheel', hole, M.black(), { local: true });
  }
  // ---- steel trellis frame round the battery
  const H = ctx.head, [px, py] = ctx.pivot;
  const fm = mats.frame;
  const top = (t) => [H[0] + (px + 0.02 - H[0]) * t, H[1] + 0.06 + (py + 0.3 - H[1] - 0.06) * t];
  const bot = (t) => [H[0] - 0.04 + (px + 0.01 - H[0] + 0.04) * t, H[1] - 0.18 + (py + 0.02 - H[1] + 0.18) * t - 0.08 * Math.sin(Math.PI * t)];
  for (const s of [-1, 1]) {
    const zz = (t) => s * (0.06 + 0.12 * Math.min(1, t * 2.2));
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const a = i / steps, b = (i + 1) / steps;
      const ta = top(a), tb = top(b), ba = bot(a), bb = bot(b);
      A.add('chassis', rod([ta[0], ta[1], zz(a)], [tb[0], tb[1], zz(b)], 0.012, 10), fm);
      A.add('chassis', rod([ba[0], ba[1], zz(a)], [bb[0], bb[1], zz(b)], 0.012, 10), fm);
      A.add('chassis', rod([ta[0], ta[1], zz(a)], [bb[0], bb[1], zz(b)], 0.009, 8), fm);
    }
    // subframe to the tail
    A.add('chassis', rod([top(1)[0], top(1)[1], s * 0.18], [-0.66, 0.84, s * 0.07], 0.011, 8), fm);
    A.add('chassis', rod([px + 0.02, py + 0.12, s * 0.18], [-0.52, 0.8, s * 0.075], 0.009, 8), fm);
    // pivot plates
    const pl = box(0.12, 0.18, 0.014, 0.01); place(pl, { p: [px + 0.02, py + 0.04, s * 0.19] }); A.add('chassis', pl, M.anodized(0x1c1e21));
  }
  A.add('chassis', rod(ctx.sp(ctx.Lf - 0.01), ctx.sp(ctx.Lf + ctx.headLen + 0.01), 0.036, 16), fm);
  // ---- battery: finned aluminium case, brackets, service plug and its label
  const bat = box(0.47, 0.36, 0.3, 0.035); place(bat, { p: [0.15, 0.5, 0] }); A.add('chassis', bat, M.anodized(0x1a1c1f));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const fin = box(0.4, 0.011, 0.014, 0.004); place(fin, { p: [0.15, 0.37 + i * 0.034, s * 0.155] }); A.add('chassis', fin, M.anodized(0x2a2d31));
    }
    for (const bx of [-0.05, 0.35]) {
      const br = box(0.04, 0.1, 0.02, 0.006); place(br, { p: [bx, 0.66, s * 0.16] }); A.add('chassis', br, M.aluminum());
      const bo = cyl(0.008, 0.008, 0.01, 6, 'z'); bo.translate(bx, 0.66, s * 0.172); A.add('chassis', bo, M.chrome());
    }
  }
  const lab = labelPlane(ctx, 'MÍTICO Z-CELL  17.3 kWh', 0.3, 0.035, '#d9dde2', 'rgba(0,0,0,0)');
  for (const s of [-1, 1]) {
    const g = lab.clone(); if (s < 0) g.rotateY(Math.PI); g.translate(0.15, 0.665, s * 0.1525); A.add('chassis', g, lab.userData.mat);
  }
  // ---- motor under the pivot: cooling ribs, end covers, controller and HV cabling
  const ribs = [[0.03, -0.12]];
  for (let i = 0; i < 9; i++) ribs.push([0.1, -0.11 + i * 0.027], [0.108, -0.105 + i * 0.027], [0.108, -0.093 + i * 0.027], [0.1, -0.088 + i * 0.027]);
  ribs.push([0.1, 0.12], [0.03, 0.12]);
  const motor = closedLathe(ribs, 40); motor.translate(-0.07, 0.31, 0); A.add('chassis', motor, M.engine(0x8a8f96));
  for (const s of [-1, 1]) {
    const cap = closedLathe([[0.02, 0], [0.095, 0], [0.09, 0.02], [0.04, 0.03], [0.02, 0.03]], 40);
    if (s < 0) cap.rotateY(Math.PI);
    cap.translate(-0.07, 0.31, s * 0.12); A.add('chassis', cap, M.anodized(0x1c1e21));
  }
  const ctrl = box(0.22, 0.07, 0.18, 0.015); place(ctrl, { p: [-0.2, 0.64, 0] }); A.add('chassis', ctrl, M.anodized(0x2a2d31));
  for (const s of [-1, 1]) {
    A.add('chassis', tube([[-0.08, 0.48, s * 0.12], [-0.12, 0.56, s * 0.13], [-0.18, 0.62, s * 0.09]], 0.011, { radial: 8 }), M.matte(0xff6a00, 0.45));
    A.add('chassis', tube([[-0.18, 0.61, s * 0.05], [-0.14, 0.45, s * 0.12], [-0.08, 0.38, s * 0.125]], 0.01, { radial: 8 }), M.matte(0xff6a00, 0.45));
  }
  // ---- charger compartment in place of a tank, with air shrouds either side
  const both = (geo, mat) => { A.add('chassis', geo, mat); A.add('chassis', mirrorPanel(geo), mat); };
  const T = 0.0045;
  const tankSide = coons(
    [[-0.12, 0.79, 0.09], [0.08, 0.79, 0.15], [0.3, 0.8, 0.16], [0.45, 0.82, 0.11]],
    [[-0.12, 0.86, 0.075], [0.08, 0.93, 0.12], [0.3, 0.965, 0.14], [0.45, 0.92, 0.085]],
    [[-0.12, 0.79, 0.09], [-0.12, 0.86, 0.075]],
    [[0.45, 0.82, 0.11], [0.45, 0.92, 0.085]],
    20, 8, { dir: [0, 0.3, 1], amount: 0.018 },
  );
  both(shell(tankSide, { thick: T, out: [0, 0.2, 1] }), mats.paintSolid);
  const tankTop = coons(
    [[-0.12, 0.872, 0.0], [0.08, 0.955, 0.0], [0.3, 0.992, 0.0], [0.45, 0.935, 0.0]],
    [[-0.12, 0.86, 0.075], [0.08, 0.93, 0.12], [0.3, 0.965, 0.14], [0.45, 0.92, 0.085]],
    [[-0.12, 0.872, 0.0], [-0.12, 0.86, 0.075]],
    [[0.45, 0.935, 0.0], [0.45, 0.92, 0.085]],
    20, 8, { dir: [0, 1, 0.1], amount: 0.01 },
  );
  both(shell(tankTop, { thick: T, out: [0, 1, 0.1] }), mats.paintSolid);
  const port = cyl(0.035, 0.035, 0.01, 24, 'y'); place(port, { p: [0.27, 0.99, 0], r: [0, 0, -0.12] }); A.add('chassis', port, M.anodized(0x15171a));
  const shroud = coons(
    [[0.2, 0.62, 0.2], [0.34, 0.62, 0.21], [0.47, 0.68, 0.19]],
    [[0.16, 0.79, 0.165], [0.32, 0.81, 0.18], [0.47, 0.83, 0.15]],
    [[0.2, 0.62, 0.2], [0.17, 0.7, 0.19], [0.16, 0.79, 0.165]],
    [[0.47, 0.68, 0.19], [0.48, 0.76, 0.18], [0.47, 0.83, 0.15]],
    16, 10, { dir: [0.2, 0.1, 1], amount: 0.02 },
  );
  both(shell(shroud, { thick: T, out: [0.2, 0, 1] }), mats.paint2Solid);
  const slot = onPanel(shroud, [[0.35, 0.3], [0.85, 0.42], [0.85, 0.62], [0.35, 0.5]], 0.0015, [0.2, 0, 1], 8, 4);
  both(shell(slot, { thick: 0.003, out: [0.2, 0, 1] }), mats.neon);
  // ---- short tail on the subframe, seat
  const tail = coons(
    [[-0.86, 0.9, 0.02], [-0.6, 0.83, 0.075], [-0.36, 0.79, 0.11]],
    [[-0.88, 0.955, 0.018], [-0.6, 0.915, 0.08], [-0.36, 0.89, 0.115]],
    [[-0.86, 0.9, 0.02], [-0.88, 0.955, 0.018]],
    [[-0.36, 0.79, 0.11], [-0.36, 0.89, 0.115]],
    18, 6, { dir: [0, 0.1, 1], amount: 0.012 },
  );
  both(shell(tail, { thick: T, out: [0, 0, 1] }), mats.paintSolid);
  seatLoft(ctx, -0.12, -0.5, 0.88, 0.13, 0.035);
  ledStrip(ctx, [-0.865, 0.94, -0.03], [-0.865, 0.94, 0.03], 0.008, 'chassis', mats.tail);
  ctx.tails.push({ pos: [-0.865, 0.94, 0] });
  // ---- headlight nacelle: twin LED bars over a projector, small smoked screen
  const nac = loft([
    { x: 0.6, y: 0.86, w: 0.08, ht: 0.06, hb: 0.06, n: 3 },
    { x: 0.67, y: 0.855, w: 0.1, ht: 0.075, hb: 0.07, n: 3.2 },
    { x: 0.71, y: 0.85, w: 0.085, ht: 0.06, hb: 0.06, n: 3 },
  ], { radial: 22, sub: 4, capStart: true, capEnd: true });
  A.add('steer', nac, M.black());
  for (const dy of [0.03, -0.035]) ledStrip(ctx, [0.715, 0.85 + dy, -0.06], [0.715, 0.85 + dy, 0.06], 0.007, 'steer');
  const projL = cyl(0.03, 0.03, 0.01, 20, 'x'); projL.translate(0.716, 0.85, 0); A.add('steer', projL, M.lens());
  ctx.headlights.push({ pos: [0.72, 0.85, 0], group: 'steer', r: 0.04 });
  const scr = loft([{ x: 0.66, y: 0.92, w: 0.07, ht: 0.015, n: 2 }, { x: 0.6, y: 0.99, w: 0.09, ht: 0.02, n: 2 }], { radial: 14, sub: 4, t0: 0.25, t1: Math.PI - 0.25 });
  A.add('steer', scr, mats.glass);
  handlebar(ctx, { type: 'wide', rise: 0.06, back: 0.12, half: 0.35 });
  dash(ctx, [0.5, 0.98, 0], 0.13, 0.08, { tilt: -1.0, group: 'steer' });
  footpegs(ctx, -0.18, 0.4, 0.17, { plates: true });
  shock(ctx, [-0.12, 0.66, 0.0], [-0.24, 0.42, 0.0], { r: 0.026, springColor: 0xd4a431, reservoir: true });
  frontFender(ctx, { from: 1.8, len: 1.6, w: 0.13, mat: mats.paint2Solid });
  rearFender(ctx, { from: 1.9, len: 1.2, mat: M.black(), w: 0.2 });
  details(ctx, { plate: { pos: [-0.9, 0.74, 0], tilt: 0.35 }, signalsF: [[0.68, 0.8, 0.12], [0.68, 0.8, -0.12]], signalsFGroup: 'steer', kickstand: true });
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
  ctx.seat = { x: -0.3, y: 0.725 };
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
  const eng = engineUnit(ctx, { pos: [0.03, 0.29], cyl: 2, pitch: 0.085, tilt: 0.2, scale: 0.95, rearGearbox: 0.22, cooling: 'air', caseMat: M.engine(0x9a9da2), finMat: M.aluminum(), coverMat: M.chrome(), camMat: M.aluminum(), filter: false });
  // twin upswept megaphones
  for (const [x, y, z] of eng.ports) {
    const s = z < 0 ? -1 : 1;
    header(ctx, [[x, y, z], [x + 0.07, y - 0.06, s * 0.08], [0.27, 0.36, s * 0.11], [0.22, 0.22, s * 0.14], [0.0, 0.2, s * 0.16], [-0.2, 0.27, s * 0.17]], 0.022, M.chrome());
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
  const bat = box(0.2, 0.16, 0.15, 0.02); place(bat, { p: [-0.2, 0.64, 0] }); A.add('chassis', bat, M.black());
  for (const s of [-1, 1]) {
    // domed side cover in the tank colour, carrying an oval racing number board
    const sc = loft([
      { x: -0.05, y: 0.64, w: 0.02, ht: 0.1, hb: 0.11, n: 2.8, z: s * 0.095 },
      { x: -0.2, y: 0.67, w: 0.026, ht: 0.075, hb: 0.07, n: 2.8, z: s * 0.1 },
      { x: -0.35, y: 0.725, w: 0.018, ht: 0.035, hb: 0.025, n: 2.6, z: s * 0.094 },
    ], { radial: 22, sub: 5, capStart: true, capEnd: true });
    A.add('chassis', sc, mats.paintSolid);
    const board = new THREE.CircleGeometry(1, 32);
    board.scale(0.07, 0.052, 1);
    if (s < 0) board.rotateY(Math.PI);
    board.translate(-0.15, 0.665, s * 0.127);
    A.add('chassis', board, mats.plate);
    const rim = torus(1, 0.06, 32, 6); rim.scale(0.072, 0.054, 0.072); rim.translate(-0.15, 0.665, s * 0.126);
    A.add('chassis', rim, M.chrome());
  }
  const pan = box(0.36, 0.02, 0.2, 0.008); place(pan, { p: [-0.3, 0.775, 0] }); A.add('chassis', pan, M.black());
  // knee pads
  for (const s of [-1, 1]) {
    const kp = sphere(0.045, 16, 10); kp.scale(1.3, 0.75, 0.12); kp.translate(0.1, 0.86, s * 0.131); A.add('chassis', kp, M.rubber());
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
  const eng = engineUnit(ctx, { pos: [0.02, 0.3], layout: 'v', cyl: 2, tilt: 0.62, vAngle: 1.25, scale: 1.1, pitch: 0.085, cooling: 'liquid', caseMat: M.engine(0x202124), coverMat: M.chrome(), camMat: M.chrome(), filterMat: M.chrome() });
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
  eng.ports.forEach(([x, y, z], i) => {
    const s = z < 0 ? -1 : 1;
    if (i < 2) header(ctx, [[x, y, z], [x + 0.08, y - 0.12, z * 1.3], [0.35, 0.25, s * 0.14], [0.1, 0.13, s * 0.18], [-0.2, 0.18, s * 0.2]], 0.026, M.chrome());
    else header(ctx, [[x, y, z], [x - 0.05, y - 0.08, s * 0.14], [-0.1, 0.24, s * 0.19], [-0.2, 0.19, s * 0.2]], 0.024, M.chrome());
  });
  for (const s of [-1, 1]) muffler(ctx, [-0.2, 0.18, s * 0.2], [-0.62, 0.3, s * 0.22], { type: 'round', r: 0.058, mat: M.chrome() });
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
  for (const s of [-1, 1]) radiator(ctx, [0.18, 0.62, s * 0.11], 0.04, 0.22, { tilt: -0.3 });
  const eng = engineUnit(ctx, { pos: [0.0, 0.33], cyl: 1, pitch: 0.09, width: 0.2, tilt: 0.14, scale: 0.86, rearGearbox: 0.2, cooling: 'liquid', caseMat: M.engine(0x3a3d42), coverMat: M.engine(0x8a8f96), camMat: M.anodized(sm ? 0xc81e1e : 0xff6a00), filter: false });
  const [epx, epy] = eng.ports[0];
  // exhaust
  if (sm) {
    header(ctx, [[epx, epy, 0.0], [epx + 0.07, epy - 0.05, 0.05], [0.22, 0.42, 0.09], [0.2, 0.32, 0.12], [0.0, 0.3, 0.14], [-0.25, 0.48, 0.14]], 0.022, M.titanium());
    muffler(ctx, [-0.25, 0.48, 0.14], [-0.6, 0.66, 0.14], { type: 'hex', r: 0.05, mat: M.carbon(), endcap: M.titanium() });
  } else {
    header(ctx, [[epx, epy, 0.0], [epx + 0.07, epy - 0.05, 0.05], [0.2, 0.42, 0.1], [0.18, 0.38, 0.13], [-0.05, 0.5, 0.14], [-0.3, 0.66, 0.13]], 0.022, M.titanium());
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
  // faceted tank with crease lines
  const tank = loftProfile([
    { x: 0.47, pts: [[0, 0.88], [0.1, 0.89], [0.13, 0.95], [0.1, 1.02], [0, 1.035]] },
    { x: 0.3, pts: [[0, 0.86], [0.17, 0.87], [0.21, 0.96], [0.16, 1.06], [0, 1.08]] },
    { x: 0.1, pts: [[0, 0.86], [0.17, 0.87], [0.2, 0.95], [0.15, 1.05], [0, 1.07]] },
    { x: -0.06, pts: [[0, 0.88], [0.12, 0.89], [0.14, 0.93], [0.1, 0.98], [0, 0.995]] },
    { x: -0.14, pts: [[0, 0.9], [0.06, 0.905], [0.07, 0.92], [0.05, 0.94], [0, 0.945]] },
  ], { sub: 6, around: 4, creases: [2, 3], capStart: true, capEnd: true });
  A.add('chassis', tank, mats.paint);
  // tank shrouds sweeping down over the radiators
  for (const s of [-1, 1]) {
    const sh = loft([
      { x: 0.53, y: 0.9, w: 0.012, ht: 0.03, hb: 0.04, n: 3, z: s * 0.19 },
      { x: 0.42, y: 0.87, w: 0.016, ht: 0.075, hb: 0.11, n: 6, z: s * 0.222 },
      { x: 0.26, y: 0.87, w: 0.016, ht: 0.08, hb: 0.07, n: 6, z: s * 0.224 },
      { x: 0.12, y: 0.89, w: 0.012, ht: 0.05, hb: 0.03, n: 3, z: s * 0.205 },
    ], { radial: 24, sub: 5, capStart: true, capEnd: true });
    A.add('chassis', sh, mats.paint2Solid);
  }
  // headlight mask: angular, wraps the LED unit, carries the tall screen
  const mask = loftProfile([
    { x: 0.885, pts: [[0, 0.92], [0.05, 0.925], [0.09, 0.99], [0.06, 1.06], [0, 1.07]] },
    { x: 0.82, pts: [[0, 0.9], [0.09, 0.905], [0.15, 0.985], [0.11, 1.08], [0, 1.095]] },
    { x: 0.7, pts: [[0, 0.88], [0.12, 0.885], [0.2, 0.97], [0.16, 1.08], [0, 1.1]] },
    { x: 0.58, pts: [[0, 0.87], [0.13, 0.875], [0.215, 0.95], [0.175, 1.05], [0, 1.07]] },
    { x: 0.5, pts: [[0, 0.88], [0.12, 0.885], [0.19, 0.93], [0.15, 1.0], [0, 1.02]] },
  ], { sub: 6, around: 4, creases: [2, 3], capStart: true, capEnd: true });
  A.add('chassis', mask, mats.paint);
  // high beak below the mask
  const beak = loftProfile([
    { x: 0.6, pts: [[0, 0.86], [0.07, 0.865], [0.11, 0.885], [0.09, 0.9], [0, 0.905]] },
    { x: 0.8, pts: [[0, 0.84], [0.06, 0.845], [0.095, 0.866], [0.075, 0.88], [0, 0.888]] },
    { x: 0.99, pts: [[0, 0.79], [0.02, 0.792], [0.035, 0.8], [0.025, 0.81], [0, 0.812]] },
  ], { sub: 6, around: 3, creases: [2], capStart: true, capEnd: true });
  A.add('chassis', beak, mats.paint2Solid);
  // LED headlight: dark housing, twin projectors, DRL brow
  const hous = sphere(1, 20, 12); hous.scale(0.03, 0.055, 0.08); hous.translate(0.884, 0.99, 0);
  A.add('chassis', hous, M.darkChrome());
  for (const s of [-1, 1]) {
    const pj = sphere(0.024, 14, 10); pj.scale(0.6, 1, 1); pj.translate(0.902, 0.985, s * 0.036);
    A.add('chassis', pj, ctx.mats.head);
    const drl = box(0.012, 0.01, 0.07, 0.004); place(drl, { p: [0.9, 1.035, s * 0.04], r: [s * 0.25, 0, 0] });
    A.add('chassis', drl, ctx.mats.head);
  }
  const lensC = sphere(1, 20, 12); lensC.scale(0.034, 0.058, 0.083); lensC.translate(0.886, 0.99, 0);
  A.add('chassis', lensC, M.lens());
  ctx.headlights.push({ pos: [0.9, 0.99, 0], group: 'chassis', r: 0.05 });
  const screen = loft([
    { x: 0.8, y: 1.075, w: 0.1, ht: 0.03, n: 2.1 },
    { x: 0.7, y: 1.095, w: 0.15, ht: 0.13, n: 2.1 },
    { x: 0.62, y: 1.09, w: 0.16, ht: 0.27, n: 2.1 },
  ], { radial: 18, sub: 6, t0: 0.03, t1: Math.PI - 0.03 });
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
  radiator(ctx, [0.35, 0.5, 0], 0.3, 0.26, { tilt: -0.2 });
  const eng = engineUnit(ctx, { pos: [0.1, 0.3], layout: 'v', cyl: 2, tilt: 0.75, vAngle: 1.4, scale: 0.8, pitch: 0.08, blockH: 0.13, headH: 0.05, twoStroke: true, cooling: 'liquid', caseMat: M.engine(0x55595f), coverMat: M.engine(0x8a8f96), filter: false });
  const fp = eng.ports.slice(0, 2), rp = eng.ports.slice(2);
  // four expansion chambers: two below, two up under the tail
  for (const s of [-1, 1]) {
    const f = fp[s < 0 ? 0 : 1], r = rp[s < 0 ? 0 : 1];
    expansionChamber(ctx, [[f[0], f[1], f[2]], [0.36, 0.3, s * 0.08], [0.32, 0.16, s * 0.1], [0.12, 0.11, s * 0.1], [-0.12, 0.13, s * 0.12], [-0.28, 0.2, s * 0.14], [-0.38, 0.26, s * 0.15]], 0.05);
    expansionChamber(ctx, [[r[0], r[1], r[2]], [r[0] - 0.05, r[1] - 0.02, s * 0.1], [-0.15, 0.5, s * 0.13], [-0.32, 0.6, s * 0.1], [-0.48, 0.7, s * 0.05], [-0.62, 0.78, s * 0.04]], 0.045);
  }
  sportBody(ctx, { panels: true, eyes: false, tailX: -0.8, hump: 0.09 });
  // oval number board on the nose, as on the 90s 500 cc racers
  const board = sphere(0.1, 22, 14); board.scale(0.08, 0.52, 0.8); place(board, { p: [0.972, 0.806, 0], r: [0, 0, 0.5] }); A.add('chassis', board, mats.plateSolid);
  numberPlate(ctx, [0.98, 0.808, 0], [0.11, 0.078], mats.plate, { r: [0, Math.PI / 2, 0.5] });
  ctx.headlights.push({ pos: [0.88, 0.8, 0], group: 'chassis', r: 0, none: true });
  tailLight(ctx, [-0.79, 0.93, 0], 0.03, 0.015, { tilt: 0.4 });
  handlebar(ctx, { type: 'clipon' });
  dash(ctx, [0.5, 0.93, 0], 0.07, 0.06, { tilt: -1.0 });
  footpegs(ctx, -0.22, 0.42, 0.15, { plates: true });
  shock(ctx, [-0.06, 0.6, 0], [-0.18, 0.35, 0], { r: 0.024, springColor: 0xd4a431 });
  frontFender(ctx, { from: 1.8, len: 1.7, w: 0.12, mat: mats.paintSolid });
  details(ctx, { damper: true, kickstand: false });
}

// 13. Sport tourer: big inline-4 under a full touring fairing (modelled on a modern
// 1100 cc sport tourer): sharp nose with twin slanted LED lights, tall screen, layered
// side panels over graphite inner panels, faceted tank with gold pinstripes, stepped
// two-up seat with grab rails, angular right-side silencer, six-spoke wheels.
function textDecal(ctx, text, pos, size, side, o = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = `${o.weight ?? 800} ${o.px ?? 84}px ${o.font ?? 'Rajdhani, Arial, sans-serif'}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (o.italic) { g.setTransform(1, 0, -0.25, 1, 32, 0); }
  g.fillStyle = o.color ?? '#f2f2f2';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.3, metalness: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const pl = new THREE.PlaneGeometry(size[0], size[1]);
  if (side < 0) pl.rotateY(Math.PI);
  place(pl, { p: pos, r: [o.rx ?? 0, side * (o.ry ?? 0), o.rz ?? 0] });
  ctx.A.add('chassis', pl, m);
}

// Thin panel lying on a face of a loftProfile body (between profile points i and j),
// spanning authored x stations with per-station fractions [lo, hi] across the face,
// pushed `off` along the face normal. Used for lamps and inserts that sit on bodywork.
function profileAt(secs, x) {
  let k = 0;
  while (k < secs.length - 2 && secs[k + 1].x > x) k++;
  const a = secs[k], b = secs[k + 1];
  const t = Math.min(1, Math.max(0, (a.x - x) / (a.x - b.x)));
  return a.pts.map((p, n) => [p[0] + (b.pts[n][0] - p[0]) * t, p[1] + (b.pts[n][1] - p[1]) * t]);
}

// Point on face i->j of a loftProfile body at station x and fraction f, pushed off along
// the face normal; returns [x, y, z] for side +1.
function facePoint(secs, i, j, x, f, off = 0) {
  const pr = profileAt(secs, x), P0 = pr[i], P1 = pr[j];
  const dz = P1[0] - P0[0], dy = P1[1] - P0[1], l = Math.hypot(dz, dy) || 1;
  let nz = dy / l, ny = -dz / l;
  if (nz < 0 || (nz === 0 && ny < 0)) { nz = -nz; ny = -ny; }
  return [x, P0[1] + dy * f + ny * off, P0[0] + dz * f + nz * off];
}

function facePatch(A, secs, i, j, xs, lo, hi, off, side, mat, group = 'chassis') {
  const at = (x) => profileAt(secs, x);
  const pos = [];
  xs.forEach((x, k) => {
    const pr = at(x), P0 = pr[i], P1 = pr[j];
    const dz = P1[0] - P0[0], dy = P1[1] - P0[1], l = Math.hypot(dz, dy) || 1;
    const nz = dy / l, ny = -dz / l; // outward normal of the face in the (z, y) plane
    const sg = nz * 1 + ny * 0 >= 0 || ny > 0 ? 1 : -1;
    for (const f of [lo[k], hi[k]]) {
      const z = P0[0] + dz * f + nz * sg * off, y = P0[1] + dy * f + ny * sg * off;
      pos.push(x, y, side * z);
    }
  });
  // two skins with their own vertices so each side gets a proper normal
  const n = pos.length / 3;
  const idx = [];
  for (let k = 0; k < xs.length - 1; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c, n + a, n + c, n + b, n + b, n + c, n + d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos.concat(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  A.add(group, g, mat);
}

function sporttourer(ctx) {
  const { A, mats } = ctx;
  setupChassis(ctx);
  fork(ctx, { type: 'usd', innerMat: M.chrome(), outerMat: M.anodized(0x2c2a26), capColor: 0x8a6a2a });
  wheels(ctx, { caliperColor: 0x34363b, carrier: '#2a2a2a', fDiscR: 0.15, discStyle: 'drilled', rimStripe: mats.accentSolid });
  swingarm(ctx, { style: 'banana', mat: M.anodized(0x151517), h: 0.06 });
  chain(ctx);
  twinSpar(ctx, { mat: M.anodized(0x141416) });
  radiator(ctx, [0.38, 0.52, 0], 0.3, 0.28, { tilt: -0.22 });
  const eng = engineUnit(ctx, { pos: [0.1, 0.3], cyl: 4, tilt: 0.48, cooling: 'liquid', caseMat: M.engine(0x17181a), coverMat: M.engine(0x2c2e32), camMat: M.engine(0x2c2e32), filterMat: M.black() });
  // 4-2-1 polished headers under the engine to the right-hand silencer
  for (const [x, y, z] of eng.ports) {
    header(ctx, [[x, y, z], [x + 0.07, y - 0.1, z * 1.05], [0.42, 0.26, z * 0.9], [0.36, 0.15, z * 0.6], [0.16, 0.12, z * 0.3], [-0.02, 0.14, 0.05]], 0.018, M.chrome());
  }
  header(ctx, [[-0.02, 0.14, 0.05], [-0.1, 0.2, 0.12], [-0.2, 0.29, 0.165]], 0.034, M.aluminum());
  // angular silencer: brushed can with chamfered edges and a black end cap
  const can = (x, yc, hh, hw) => ({ x, pts: [[0, yc - hh], [hw * 0.72, yc - hh], [hw, yc - hh * 0.32], [hw, yc + hh * 0.38], [hw * 0.74, yc + hh], [0, yc + hh]] });
  const body = loftProfile([can(-0.19, 0.3, 0.05, 0.05), can(-0.26, 0.345, 0.1, 0.07), can(-0.47, 0.455, 0.106, 0.072), can(-0.51, 0.476, 0.096, 0.066)],
    { sub: 5, around: 3, creases: [1, 2, 3, 4], capStart: true, capEnd: true });
  body.translate(0, 0, 0.178);
  A.add('chassis', body, M.aluminum());
  const capG = loftProfile([can(-0.505, 0.474, 0.094, 0.064), can(-0.555, 0.5, 0.074, 0.052)], { sub: 3, around: 3, creases: [1, 2, 3, 4], capStart: true, capEnd: true });
  capG.translate(0, 0, 0.178);
  A.add('chassis', capG, M.black());
  for (const k of [-1, 1]) { const o = cyl(0.018, 0.018, 0.02, 12, 'x'); place(o, { p: [-0.56, 0.5 + k * 0.026, 0.178] }); A.add('chassis', o, M.darkChrome()); }
  A.add('chassis', rod([-0.4, 0.52, 0.17], [-0.42, 0.58, 0.14], 0.012, 8), M.black());

  // ---- bodywork
  const P = (x, ...pts) => ({ x, pts });
  // one continuous front fairing: sharp nose, headlight crease, main flank crease and
  // shoulder; its lower edge sweeps down behind the front wheel to cover the radiator
  const FAIR = [
    P(0.978, [0, 0.848], [0.025, 0.851], [0.042, 0.861], [0.05, 0.872], [0.032, 0.884], [0, 0.888]),
    P(0.94, [0, 0.818], [0.05, 0.825], [0.085, 0.845], [0.1, 0.872], [0.07, 0.906], [0, 0.918]),
    P(0.84, [0, 0.775], [0.07, 0.782], [0.12, 0.82], [0.145, 0.868], [0.115, 0.94], [0, 0.958]),
    P(0.72, [0, 0.74], [0.1, 0.748], [0.165, 0.8], [0.195, 0.862], [0.165, 0.972], [0, 0.99]),
    P(0.6, [0, 0.68], [0.12, 0.69], [0.19, 0.74], [0.215, 0.84], [0.19, 0.97], [0, 0.995]),
    P(0.5, [0, 0.575], [0.13, 0.585], [0.2, 0.65], [0.218, 0.8], [0.19, 0.91], [0, 0.93]),
    P(0.4, [0, 0.37], [0.14, 0.39], [0.21, 0.52], [0.218, 0.76], [0.18, 0.85], [0, 0.87]),
    P(0.28, [0, 0.35], [0.14, 0.37], [0.205, 0.5], [0.212, 0.74], [0.17, 0.83], [0, 0.85]),
    P(0.16, [0, 0.42], [0.12, 0.44], [0.175, 0.53], [0.185, 0.7], [0.15, 0.78], [0, 0.8]),
    P(0.06, [0, 0.6], [0.085, 0.61], [0.12, 0.635], [0.13, 0.69], [0.1, 0.74], [0, 0.75]),
  ];
  A.add('chassis', loftProfile(FAIR, { sub: 6, around: 4, creases: [2, 3, 4], capStart: true, capEnd: true }), mats.paint);
  // graphite chin below the lights with a slim central intake
  const chin = loftProfile([
    P(0.955, [0, 0.8], [0.03, 0.803], [0.05, 0.83], [0.035, 0.845], [0, 0.848]),
    P(0.86, [0, 0.765], [0.07, 0.772], [0.11, 0.81], [0.09, 0.84], [0, 0.85]),
    P(0.76, [0, 0.745], [0.09, 0.75], [0.14, 0.79], [0.12, 0.83], [0, 0.84]),
  ], { sub: 4, around: 3, creases: [2], capStart: true, capEnd: true });
  A.add('chassis', chin, mats.paint2Solid);
  const slot = box(0.03, 0.022, 0.07, 0.008); place(slot, { p: [0.955, 0.818, 0], r: [0, 0, 0.5] }); A.add('chassis', slot, M.black());
  // twin slanted LED headlights: dark housing, LED blade, clear cover
  for (const s of [-1, 1]) {
    // twin LED headlights laid on the nose's upper faces: housing, LED blade, clear cover
    const xs = [0.968, 0.94, 0.9, 0.862, 0.83];
    facePatch(A, FAIR, 3, 4, xs, [0.0, 0.0, 0.04, 0.12, 0.3], [0.62, 0.86, 0.9, 0.82, 0.55], 0.004, s, M.darkChrome());
    facePatch(A, FAIR, 3, 4, xs.slice(1, 4), [0.12, 0.14, 0.22], [0.42, 0.5, 0.48], 0.0065, s, mats.head);
    facePatch(A, FAIR, 3, 4, xs.slice(0, 4), [0.6, 0.66, 0.62, 0.56], [0.7, 0.76, 0.72, 0.64], 0.0065, s, mats.head);
    facePatch(A, FAIR, 3, 4, xs, [0.0, 0.0, 0.04, 0.12, 0.3], [0.62, 0.86, 0.9, 0.82, 0.55], 0.009, s, M.lens());
    // integrated front indicators on the cowl flanks
    A.add('chassis', rod([0.79, 0.845, s * 0.165], [0.71, 0.86, s * 0.193], 0.006, 6), M.emissive(0xff8a00, 0.25));
  }
  ctx.headlights.push({ pos: [0.93, 0.87, 0], group: 'chassis', r: 0.05 });
  // tall touring screen with smoked top edge
  const screen = loft([
    { x: 0.86, y: 0.935, w: 0.1, ht: 0.03, n: 2.1 },
    { x: 0.74, y: 0.96, w: 0.155, ht: 0.12, n: 2.1 },
    { x: 0.62, y: 0.97, w: 0.18, ht: 0.22, n: 2.1 },
    { x: 0.575, y: 0.97, w: 0.172, ht: 0.255, n: 2.1 },
  ], { radial: 22, sub: 6, t0: 0.03, t1: Math.PI - 0.03 });
  A.add('chassis', screen, M.glass(0x2a3138, 0.32));
  // graphite lower side panels with intake slots over the radiator flanks
  for (const s of [-1, 1]) {
    const lp = loft([
      { x: 0.45, y: 0.55, w: 0.005, ht: 0.02, hb: 0.02, n: 3, z: s * 0.214 },
      { x: 0.4, y: 0.5, w: 0.008, ht: 0.045, hb: 0.05, n: 5, z: s * 0.216 },
      { x: 0.28, y: 0.46, w: 0.008, ht: 0.045, hb: 0.06, n: 5, z: s * 0.212 },
      { x: 0.2, y: 0.49, w: 0.005, ht: 0.02, hb: 0.02, n: 3, z: s * 0.188 },
    ], { radial: 22, sub: 5, capStart: true, capEnd: true });
    A.add('chassis', lp, mats.paint2Solid);
    for (let i = 0; i < 4; i++) {
      const sl = box(0.09, 0.01, 0.006, 0.003);
      place(sl, { p: [0.37 - i * 0.012, 0.52 - i * 0.022, s * 0.225], r: [0, 0, 0.42] });
      A.add('chassis', sl, M.black());
    }
  }
  // graphite inner panels behind the fairing, lower cowl
  const inner = loftProfile([
    P(0.44, [0, 0.62], [0.12, 0.63], [0.19, 0.7], [0.19, 0.845], [0, 0.865]),
    P(0.2, [0, 0.56], [0.12, 0.57], [0.196, 0.64], [0.196, 0.845], [0, 0.865]),
    P(0.02, [0, 0.55], [0.11, 0.56], [0.172, 0.62], [0.172, 0.81], [0, 0.835]),
    P(-0.07, [0, 0.6], [0.07, 0.61], [0.122, 0.65], [0.122, 0.77], [0, 0.79]),
  ], { sub: 6, around: 4, creases: [2, 3], capStart: true, capEnd: true });
  A.add('chassis', inner, mats.paint2Solid);
  const belly = loftProfile([
    P(0.4, [0, 0.36], [0.05, 0.37], [0.09, 0.41], [0.1, 0.45], [0, 0.47]),
    P(0.3, [0, 0.23], [0.07, 0.24], [0.14, 0.31], [0.15, 0.42], [0, 0.45]),
    P(0.1, [0, 0.215], [0.075, 0.225], [0.145, 0.29], [0.15, 0.4], [0, 0.43]),
    P(-0.08, [0, 0.26], [0.06, 0.27], [0.12, 0.32], [0.12, 0.39], [0, 0.41]),
    P(-0.15, [0, 0.31], [0.02, 0.315], [0.04, 0.34], [0.04, 0.37], [0, 0.38]),
  ], { sub: 6, around: 3, creases: [2], capStart: true, capEnd: true });
  A.add('chassis', belly, M.paint(0x1c1d20, { metal: 0.4, rough: 0.35 }));
  // side vents: dark louvres in the panel's front flank
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const f = box(0.12 - i * 0.015, 0.008, 0.012, 0.003);
      place(f, { p: [0.47 - i * 0.025, 0.75 - i * 0.035, s * 0.214], r: [0, 0, 0.55] });
      A.add('chassis', f, M.black());
    }
  }
  // faceted tank with gold pinstripes along the shoulder crease
  const tank = loftProfile([
    P(0.5, [0, 0.85], [0.08, 0.855], [0.1, 0.89], [0.08, 0.94], [0, 0.95]),
    P(0.36, [0, 0.84], [0.155, 0.85], [0.185, 0.92], [0.15, 1.02], [0, 1.05]),
    P(0.16, [0, 0.84], [0.16, 0.85], [0.19, 0.92], [0.155, 1.02], [0, 1.05]),
    P(-0.02, [0, 0.84], [0.125, 0.85], [0.15, 0.89], [0.115, 0.95], [0, 0.975]),
    P(-0.12, [0, 0.85], [0.07, 0.855], [0.08, 0.87], [0.06, 0.895], [0, 0.905]),
  ], { sub: 6, around: 4, creases: [2, 3], capStart: true, capEnd: true });
  A.add('chassis', tank, mats.paintPlain);
  for (const s of [-1, 1]) {
    A.add('chassis', tube([[0.47, 0.935, s * 0.092], [0.36, 1.02, s * 0.153], [0.16, 1.022, s * 0.158], [-0.02, 0.952, s * 0.118]], 0.0025, { radial: 5 }), mats.accentSolid);
    A.add('chassis', tube([[0.58, 0.845, s * 0.205], [0.42, 0.818, s * 0.214], [0.2, 0.796, s * 0.209], [0.08, 0.74, s * 0.16]], 0.0022, { radial: 5 }), mats.accentSolid);
    textDecal(ctx, '1100 SX', [0.2, 0.975, s * 0.168], [0.13, 0.032], s, { ry: 0, rx: s * -0.55, color: '#e8e8e8' });
  }
  // stepped two-up seat
  seatLoft(ctx, -0.08, -0.45, 0.835, 0.17, 0.05, { frontW: 0.72 });
  seatLoft(ctx, -0.47, -0.76, 0.93, 0.135, 0.045);
  // slim tail with integrated LED light, grab rails
  const tail = loftProfile([
    P(-0.04, [0, 0.7], [0.11, 0.71], [0.16, 0.76], [0.15, 0.82], [0, 0.83]),
    P(-0.3, [0, 0.75], [0.11, 0.76], [0.155, 0.81], [0.14, 0.86], [0, 0.87]),
    P(-0.55, [0, 0.8], [0.09, 0.81], [0.135, 0.86], [0.12, 0.92], [0, 0.93]),
    P(-0.78, [0, 0.85], [0.06, 0.86], [0.09, 0.9], [0.08, 0.95], [0, 0.96]),
    P(-0.88, [0, 0.88], [0.03, 0.885], [0.05, 0.915], [0.045, 0.955], [0, 0.96]),
    P(-0.92, [0, 0.9], [0.01, 0.902], [0.02, 0.92], [0.016, 0.945], [0, 0.948]),
  ], { sub: 6, around: 4, creases: [2, 3], capStart: true, capEnd: true });
  A.add('chassis', tail, mats.paintPlain);
  tailLight(ctx, [-0.905, 0.928, 0], 0.07, 0.02, { tilt: 0.7 });
  for (const s of [-1, 1]) {
    ledStrip(ctx, [-0.83, 0.905, s * 0.07], [-0.9, 0.918, s * 0.025], 0.004, 'chassis', mats.tail);
    const rail = tube([[-0.47, 0.905, s * 0.15], [-0.6, 0.93, s * 0.155], [-0.74, 0.95, s * 0.125], [-0.8, 0.955, s * 0.085]], 0.012, { radial: 8 });
    A.add('chassis', rail, M.anodized(0x141416));
    A.add('chassis', rod([-0.5, 0.9, s * 0.14], [-0.5, 0.82, s * 0.13], 0.01, 6), M.anodized(0x141416));
  }
  // side covers under the seats close the gap between tail, subframe and swingarm pivot
  const covers = loftProfile([
    P(0.0, [0, 0.55], [0.1, 0.56], [0.145, 0.62], [0.14, 0.72], [0, 0.74]),
    P(-0.25, [0, 0.6], [0.1, 0.61], [0.14, 0.66], [0.135, 0.765], [0, 0.775]),
    P(-0.45, [0, 0.68], [0.08, 0.69], [0.12, 0.73], [0.115, 0.805], [0, 0.815]),
    P(-0.6, [0, 0.76], [0.05, 0.765], [0.08, 0.79], [0.078, 0.84], [0, 0.85]),
  ], { sub: 5, around: 3, creases: [2, 3], capStart: true, capEnd: true });
  A.add('chassis', covers, M.paint(0x141518, { metal: 0.3, rough: 0.4, clear: 0.6 }));
  // number-plate hanger under the tail
  const hanger = box(0.31, 0.012, 0.15, 0.006); place(hanger, { p: [-0.92, 0.74, 0], r: [0, 0, 0.876] }); A.add('chassis', hanger, M.plastic(0x101012));
  rearFender(ctx, { from: 1.9, len: 1.4, mat: M.black(), w: 0.21 });
  frontFender(ctx, { from: 1.75, len: 1.75, w: 0.13, mat: mats.paintSolid });
  // panel shut lines and dome-head fasteners on the fairing
  for (const s of [-1, 1]) {
    facePatch(A, FAIR, 2, 3, [0.74, 0.66, 0.58, 0.52], [0.86, 0.6, 0.32, 0.12], [0.9, 0.64, 0.36, 0.16], 0.0015, s, M.black());
    facePatch(A, FAIR, 1, 2, [0.5, 0.42, 0.34, 0.26], [0.75, 0.5, 0.42, 0.4], [0.79, 0.54, 0.46, 0.44], 0.0015, s, M.black());
    for (const [i, j, x, f] of [[2, 3, 0.7, 0.55], [2, 3, 0.55, 0.62], [3, 4, 0.5, 0.55], [1, 2, 0.4, 0.75], [1, 2, 0.22, 0.6], [3, 4, 0.66, 0.85]]) {
      const [px, py, pz] = facePoint(FAIR, i, j, x, f, 0.001);
      const sc = sphere(0.0062, 10, 6); sc.scale(1, 1, 0.45); sc.translate(px, py, s * pz);
      A.add('chassis', sc, M.black());
    }
  }
  // flush fuel cap with its bolt ring
  { const fc = cyl(0.045, 0.047, 0.008, 28, 'y'); fc.translate(0.3, 1.047, 0); A.add('chassis', fc, M.aluminum());
    const fi = cyl(0.032, 0.032, 0.01, 24, 'y'); fi.translate(0.3, 1.05, 0); A.add('chassis', fi, M.black());
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const b = cyl(0.004, 0.004, 0.006, 6, 'y'); b.translate(0.3 + Math.cos(a) * 0.039, 1.052, Math.sin(a) * 0.039); A.add('chassis', b, M.chrome()); } }
  // seat stitching along the upper edges
  for (const s of [-1, 1]) {
    A.add('chassis', tube([[-0.1, 0.862, s * 0.11], [-0.25, 0.872, s * 0.155], [-0.42, 0.872, s * 0.13]], 0.0018, { radial: 4 }), M.plastic(0x55575c));
    A.add('chassis', tube([[-0.49, 0.958, s * 0.1], [-0.6, 0.966, s * 0.118], [-0.73, 0.962, s * 0.09]], 0.0018, { radial: 4 }), M.plastic(0x55575c));
  }
  // weld beads where the headers meet the collector, collector band clamp
  for (const [x, y, z] of [[-0.02, 0.14, 0.05], [-0.1, 0.2, 0.12]]) {
    const w = torus(0.036, 0.004, 16, 6); w.rotateY(Math.PI / 2 - 0.6); w.translate(x, y, z); A.add('chassis', w, M.aluminum());
  }
  { const cl = torus(0.054, 0.006, 20, 6); cl.rotateY(Math.PI / 2); cl.rotateZ(0.44); cl.translate(-0.205, 0.31, 0.178); A.add('chassis', cl, M.black()); }
  // cockpit
  handlebar(ctx, { type: 'wide', rise: 0.07, back: 0.12, half: 0.33 });
  dash(ctx, [0.56, 1.0, 0], 0.15, 0.09, { tilt: -1.0 });
  for (const s of [-1, 1]) mirror(ctx, [0.66, 0.975, s * 0.17], s, { group: 'chassis', reach: 0.33, up: 0.075, dx: -0.04 });
  // pegs with black hangers, passenger pegs
  footpegs(ctx, -0.2, 0.42, 0.17);
  for (const s of [-1, 1]) {
    const hg = box(0.16, 0.1, 0.01, 0.01); place(hg, { p: [-0.17, 0.46, s * 0.15], r: [0, 0, -0.35] }); A.add('chassis', hg, M.anodized(0x141416));
    const ph = box(0.2, 0.05, 0.01, 0.01); place(ph, { p: [-0.42, 0.56, s * 0.15], r: [0, 0, -0.55] }); A.add('chassis', ph, M.anodized(0x141416));
    A.add('chassis', rod([-0.48, 0.52, s * 0.15], [-0.48, 0.52, s * 0.21], 0.011, 8), M.rubber());
  }
  shock(ctx, [-0.08, 0.62, 0], [-0.2, 0.36, 0], { r: 0.026, springColor: 0x3a3c40 });
  details(ctx, { plate: { pos: [-1.03, 0.6, 0], tilt: 0.3 } });
}

export const DESIGNS = { superbike, gp, naked, electric, cruiser, bobber, cafe, drag, mx, sm, adventure, twostroke, sporttourer };
