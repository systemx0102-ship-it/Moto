// Twelve procedural motorcycle designs. Bike space: x forward, y up, z right.
import * as THREE from 'three';
import {
  setupChassis, wheel, caliper, fork, frontFender, rearFender, swingarm, chain, belt, shock,
  finnedCylinder, crankcase, radiator, header, muffler, expansionChamber, headlightRound, ledStrip,
  tailLight, mirror, handlebar, dash, footpegs, numberPlate, closedLathe, details,
  loft, loftProfile, tube, taperTube, lathe, box, cyl, sphere, place, rod, spring, torus, mirrorZ, V, DEG,
} from './parts.js';
import { extrude, roundRect, circle, turned, hexHead, sweep } from './geo.js';
import { engineUnit } from './engine.js';
import { coons, shell, mirrorPanel, sideUV, sideUVLeft, onPanel, sectionStrips, sectionShells } from './panel.js';
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

// Twin-spar aluminium frame: deep box-section beams from the cast headstock to cast
// swingarm-pivot sections (lightening pockets, pivot boss, engine mounts), weld beads at
// the joints.
function twinSpar(ctx, o = {}) {
  const H = ctx.head, [px, py] = ctx.pivot;
  const zw = o.z ?? 0.13;
  const mat = o.mat || M.aluminum();
  const castM = o.castMat || mat;
  for (const s of [-1, 1]) {
    // extruded beam: tall box section, slightly wider at the top (draft)
    const sec = (x, y, w, ht, z) => ({ x, y, w, ht, hb: ht, wt: w * 1.05, wb: w * 0.92, n: 6, z: s * z });
    const g = loft([
      sec(H[0] + 0.02, H[1] + 0.055, 0.03, 0.06, 0.055),
      sec(H[0] - 0.1, H[1] + 0.02, 0.03, 0.08, zw * 0.85),
      sec((H[0] + px) / 2 + 0.05, (H[1] + py) / 2 + 0.085, 0.029, 0.085, zw),
      sec(px + 0.12, py + 0.11, 0.029, 0.08, zw * 0.98),
      sec(px + 0.04, py + 0.06, 0.03, 0.07, zw * 0.95),
    ], { radial: 24, sub: 8, capStart: true, capEnd: true });
    ctx.A.add('chassis', g, mat);
    // the beam's outer face carries a shallow machined channel
    const ch = loft([
      sec(H[0] - 0.06, H[1] + 0.03, 0.004, 0.03, zw * 0.9 + 0.028),
      sec((H[0] + px) / 2 + 0.05, (H[1] + py) / 2 + 0.085, 0.004, 0.034, zw + 0.026),
      sec(px + 0.14, py + 0.11, 0.004, 0.03, zw * 0.98 + 0.026),
    ].map((q) => ({ ...q, z: q.z })), { radial: 12, sub: 6, capStart: true, capEnd: true });
    ctx.A.add('chassis', ch, M.cast(0x7f8389));
    // cast pivot section: outline with two pockets, pivot boss, engine mount
    const out = [[-0.07, -0.06], [0.05, -0.08], [0.12, -0.02], [0.13, 0.1], [0.08, 0.15], [-0.02, 0.14], [-0.07, 0.06]];
    const pl = extrude(out, 0.026, { holes: [circle(0.018, 14, 0.06, 0.07), circle(0.012, 12, 0.07, 0.0)], bevel: 0.004, bevelSeg: 2, curveSegments: 2 });
    pl.translate(px + 0.02, py + 0.02, s * zw * 0.93);
    ctx.A.add('chassis', pl, castM);
    const boss = turned([[0.0001, -0.022], [0.04, -0.022], [0.044, -0.018], [0.044, 0.018], [0.04, 0.022], [0.0001, 0.022]], 28, 'z');
    boss.translate(px, py, s * zw * 0.95);
    ctx.A.add('chassis', boss, castM);
    const pnut = hexHead(0.03, 0.012); if (s < 0) pnut.rotateY(Math.PI); pnut.translate(px, py, s * (zw * 0.95 + 0.022));
    ctx.A.add('chassis', pnut, M.steel(0x9a9ea4));
    // weld bead where the beam meets the pivot casting and the headstock
    for (const [wx, wy, wz] of [[px + 0.13, py + 0.11, zw * 0.98], [H[0] - 0.02, H[1] + 0.04, zw * 0.62]]) {
      const w = torus(0.05, 0.0035, 20, 5); w.rotateY(Math.PI / 2); w.scale(1, 1.4, 0.7); w.translate(wx, wy, s * wz);
      ctx.A.add('chassis', w, castM);
    }
    // engine mount bolts through the beam
    for (const [bx, by] of [[(H[0] + px) / 2 + 0.05, (H[1] + py) / 2 + 0.03], [px + 0.06, py + 0.12]]) {
      const b = hexHead(0.016, 0.008); if (s < 0) b.rotateY(Math.PI); b.translate(bx, by, s * (zw + 0.03));
      ctx.A.add('chassis', b, M.steel(0x9a9ea4));
    }
  }
  // cast headstock wrapping the head tube
  ctx.A.add('chassis', rod(ctx.sp(ctx.Lf - 0.01), ctx.sp(ctx.Lf + ctx.headLen + 0.01), 0.04, 24), castM);
  const hs = box(0.1, ctx.headLen + 0.02, 0.1, 0.02);
  const hm = ctx.sp(ctx.Lf + ctx.headLen / 2);
  place(hs, { p: [hm[0] - 0.035, hm[1], 0], r: [0, 0, ctx.rake] });
  ctx.A.add('chassis', hs, castM);
}

// Subframe rails under seat/tail
function subframe(ctx, from, to, z = 0.09, r = 0.012, mat) {
  for (const s of [-1, 1]) ctx.A.add('chassis', rod([from[0], from[1], s * z], [to[0], to[1], s * z * 0.7], r, 8), mat || M.aluminum());
}

function seatLoft(ctx, x0, x1, y, w, h, o = {}) {
  // the first seat built is the rider's: sit a third of the way back from its front
  if (!ctx.seat) ctx.seat = { x: x0 + (x1 - x0) * 0.32, y: y + h * 0.9 + (o.frontRise ?? 0) * 0.5 };
  const g = loft([
    { x: x1, y: y - 0.005 + (o.rearRise ?? 0), w: w * (o.rearW ?? 0.8), ht: h * 0.8, hb: 0.02, n: 3 },
    { x: x1 + (x0 - x1) * 0.4, y: y + (o.dip ?? 0), w, ht: h, hb: 0.025, n: 3.2 },
    { x: x0, y: y + (o.frontRise ?? 0.0), w: w * (o.frontW ?? 0.7), ht: h * 0.9, hb: 0.025, n: 3 },
  ], { radial: 28, sub: 8, capStart: true, capEnd: true });
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
// Panelled sport bodywork: thin-shell plastics with real outlines, shut-line gaps between
// panels and seamless centrelines (mirrored halves share symmetric normals): an upper
// cowl wrapping the nose up to the screen line, side fairings, a V belly pan, a one-piece
// tank cover with knee recesses, tail sides + pillion cover + undertray, the screen set on
// the cowl's screen line and a dark dash surround. Painted with a side-view livery that
// follows the panel lines. P tunes the proportions per machine (superbike, GP, 2T replica).
function raceLivery(ctx, label, P = {}) {
  const L = ctx.livery, num = String(L.number || ctx.spec.short.length * 7 + 2);
  const frame = [-1.0, 1.05, 0.1, 1.2];
  const SP = [['NEXOL', '#ffffff', '#111111'], ['VELOX', '#ffd400', '#111111'], ['TURBOMAX', '#111111', '#ffffff'], ['ZENTEK', '#e2231a', '#ffffff'], ['BAYO', '#1a4fd6', '#ffffff']];
  const map = sideLiveryTexture(`race2:${JSON.stringify(L)}:${label}:${P.livery || ''}`, frame, (g, X, Y) => {
    const poly = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); g.fillStyle = fill; g.fill(); };
    const line = (pts, w, col) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.lineWidth = w; g.strokeStyle = col; g.stroke(); };
    g.fillStyle = L.base; g.fillRect(0, 0, 4096, 4096);
    if (P.road) {
      // road machine: deep base colour, graphite lower fairing + belly, fine accent
      // pinstripes along the character lines, a small model badge
      poly([[1.05, 0.73], [0.8, 0.708], [0.6, 0.62], [0.46, 0.52], [0.3, 0.46], [0.1, 0.43], [-0.05, 0.44], [-0.1, 0.1], [1.05, 0.1]], L.second);
      line([[1.05, 0.835], [0.9, 0.84], [0.6, 0.852], [0.42, 0.81], [0.25, 0.77], [0.1, 0.72]], 3, L.accent);
      line([[1.05, 0.745], [0.8, 0.722], [0.6, 0.635], [0.46, 0.535], [0.3, 0.475], [0.1, 0.445]], 3, L.accent);
      line([[-0.12, 0.92], [0.1, 0.975], [0.3, 0.972]], 3, L.accent);
      line([[-0.1, 0.78], [-0.5, 0.86], [-0.98, 0.95]], 3, L.accent);
      g.font = `${L.labelFont ?? 'italic 700'} 54px ${L.labelFamily ?? 'Rajdhani, Arial, sans-serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = L.labelColor ?? L.accent; g.fillText(label, X(0.33), Y(0.66));
      g.font = '600 26px Barlow, Arial, sans-serif'; g.fillText(ctx.spec.name.replace(label, '').trim(), X(0.33), Y(0.625));
      return;
    }
    // second colour: lower fairing + belly, rising into a blade along the flank to the nose
    const blade = [[1.05, 0.77], [0.94, 0.745], [0.8, 0.735], [0.62, 0.7], [0.48, 0.6], [0.3, 0.52], [0.12, 0.5], [-0.05, 0.52], [-0.1, 0.1], [1.05, 0.1]];
    poly(blade, L.second);
    line([[1.05, 0.785], [0.94, 0.76], [0.8, 0.75], [0.62, 0.716], [0.48, 0.616], [0.3, 0.536], [0.12, 0.516], [-0.05, 0.536]], 9, L.accent);
    // tail: second-colour underside with an accent cut
    poly([[-0.1, 0.74], [-0.5, 0.82], [-1.0, 0.94], [-1.0, 0.1], [-0.1, 0.1]], L.second);
    line([[-0.1, 0.755], [-0.5, 0.835], [-1.0, 0.955]], 7, L.accent);
    // tank: thin accent pinstripe along the crease
    line([[-0.12, 0.905], [0.1, 0.958], [0.3, 0.948]], 4, L.accent);
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
    const light = (c) => { const q = new THREE.Color(c); return 0.2126 * q.r + 0.7152 * q.g + 0.0722 * q.b > 0.55; };
    const onBase = light(L.base) ? '#111111' : '#ffffff';
    txt(label, 0.3, 0.705, 64, L.accent === L.base ? onBase : L.accent);
    deco(0.38, 0.79, 0.11, 0.026, SP[off]);
    deco(0.2, 0.42, 0.15, 0.03, SP[(off + 2) % SP.length]);
    deco(0.82, 0.8, 0.08, 0.022, SP[(off + 3) % SP.length]);
    deco(-0.62, 0.79, 0.12, 0.024, SP[(off + 4) % SP.length]);
    // racing number on the tail
    g.lineWidth = 10; g.strokeStyle = L.base;
    g.font = '700 150px "Barlow Condensed", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = light(L.second) ? '#111111' : '#ffffff';
    g.strokeText(num, X(-0.6), Y(0.9)); g.fillText(num, X(-0.6), Y(0.9));
    // small technical stickers
    g.font = '600 24px Barlow, Arial, sans-serif'; g.fillStyle = light(L.second) ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.8)';
    g.fillText('MÍTICO RACING DEPT.', X(0.28), Y(0.47));
  });
  return { map, frame };
}

// Aerofoil winglet off the fairing flank (both sides): cambered section extruded
// laterally from z0 by `span`, swept back, optional second element + endplate.
function wing(ctx, x, y, z0, span, chord, o = {}) {
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) { const t = i / n, xx = chord * (1 - t); pts.push([xx, 0.06 * chord * Math.sqrt(t * (1 - t)) * 2.2 + 0.03 * chord * Math.sin(Math.PI * t)]); }
  for (let i = 1; i < n; i++) { const t = i / n, xx = chord * t; pts.push([xx, -0.03 * chord * Math.sqrt(t * (1 - t)) * 2 + 0.03 * chord * Math.sin(Math.PI * t)]); }
  const elements = o.elements ?? 1;
  for (const s of [-1, 1]) {
    for (let e = 0; e < elements; e++) {
      const g = extrude(pts.map(([a, b]) => [a - chord / 2, b]), span, { bevel: 0.001, curveSegments: 1 });
      g.translate(0, 0, span / 2);
      // sweep: shift the tip back, droop it; angle of attack about z
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const zz = p.getZ(i) / span; p.setX(i, p.getX(i) - (o.sweep ?? 0.04) * zz); p.setY(i, p.getY(i) - (o.droop ?? 0.0) * zz); }
      g.computeVertexNormals();
      g.rotateZ(o.aoa ?? -0.12);
      g.translate(x - e * chord * 0.35, y - e * (o.gap ?? 0.045), z0);
      ctx.A.add('chassis', s < 0 ? mirrorZ(g) : g, o.mat || M.carbon());
    }
    if (o.endplate) {
      const ep = extrude(roundRect(chord * 1.25, (o.gap ?? 0.045) * (elements - 1) + 0.03, 0.008), 0.003, { bevel: 0.0008 });
      ep.translate(x - chord * 0.2 - (o.sweep ?? 0.04), y - (o.gap ?? 0.045) * (elements - 1) / 2 - (o.droop ?? 0), s * (z0 + span));
      ctx.A.add('chassis', ep, o.mat || M.carbon());
    }
  }
}

function sportPanels(ctx, P) {
  const { A, mats } = ctx;
  const { map, frame } = raceLivery(ctx, ctx.spec.short, P);
  const paint = mats.side || (mats.side = mats.makePaint(map));
  const uv = sideUV(frame);
  // add a right-side panel and its mirrored twin (left livery half for painted panels)
  const both = (geo, mat) => { A.add('chassis', geo, mat); A.add('chassis', mirrorPanel(geo, mat === paint ? sideUVLeft : null), mat); };
  const T = 0.0042;
  const k = P.k ?? 1; // width scale
  const W = (pts) => pts.map(([x, y, z]) => [x, y, z * k]);
  const nose = P.nose ?? [0.982, 0.805], chin = P.chin ?? [0.955, 0.758];
  const sb = P.screenBase ?? [0.8, 0.912];
  const lo = P.cowlLow ?? 0.69; // cowl lower edge height over the front wheel
  // ---- upper cowl from cross-sections: flank below a sharp shoulder crease, top surface
  // above it running to the nose centreline and, behind the screen line, to the screen base
  const lz = (z) => z * k;
  const cowlSecs = (P.cowl ?? [
    [0.984, [[0, 0.79], [0, 0.803], [0, 0.816], [0, 0.824], [0, 0.828]]],
    [0.96, [[0.042, 0.772], [0.056, 0.792], [0.058, 0.82], [0.036, 0.842], [0, 0.85]]],
    [0.92, [[0.088, 0.75], [0.11, 0.778], [0.113, 0.826], [0.076, 0.86], [0, 0.872]]],
    [0.86, [[0.132, 0.728], [0.154, 0.762], [0.157, 0.83], [0.108, 0.878], [0, 0.894]]],
    [sb[0], [[0.164, 0.712], [0.184, 0.752], [0.188, 0.834], [0.132, 0.892], [0, sb[1]]]],
    [0.73, [[0.188, 0.698], [0.205, 0.745], [0.206, 0.83], [0.16, 0.902], [0.115, 0.916]]],
    [0.66, [[0.2, 0.693], [0.214, 0.745], [0.216, 0.842], [0.18, 0.913], [0.152, 0.926]]],
    [0.602, [[0.205, lo], [0.218, 0.746], [0.218, 0.852], [0.192, 0.92], [0.167, 0.933]]],
  ]).map(([x, pts]) => ({ x, pts: pts.map(([z, y]) => [lz(z), y]) }));
  const soft = !!P.smooth;
  const cowlStrips = sectionStrips(cowlSecs, { sub: 6, around: 5, creases: soft ? [] : [2] });
  const flankRows = cowlStrips[0].rows;
  if (soft) both(shell(flankRows, { thick: T, out: [0.4, 0.2, 1], uv, seam: 'top' }), paint);
  else {
    both(shell(flankRows, { thick: T, out: [0.4, -0.1, 1], uv, seam: 'top', crisp: ['top'] }), paint);
    both(shell(cowlStrips[1].rows, { thick: T, out: [0.4, 1, 0.6], uv, seam: 'top', crisp: ['bottom'] }), paint);
  }
  const cowlRows = flankRows;
  const cowlTop = W([[0.586, 0.933, 0.167], [0.66, 0.926, 0.152], [0.73, 0.916, 0.115], [0.775, 0.909, 0.062], [sb[0], sb[1], 0]]);
  // headlights: dark recessed eyes under the shoulder crease, twin projectors, LED brow
  if (P.eyes !== false) {
    const eyeQ = [[0.55, 0.42], [0.9, 0.5], [0.93, 0.96], [0.56, 0.96]];
    both(shell(onPanel(flankRows, eyeQ, -0.0015, [0.5, 0.1, 1], 14, 6), { thick: 0.003, out: [0.5, 0.1, 1] }), M.gloss(0x0a0a0b));
    both(shell(onPanel(flankRows, [[0.56, 0.86], [0.92, 0.88], [0.93, 0.95], [0.57, 0.95]], 0.0015, [0.5, 0.1, 1], 14, 2), { thick: 0.0015, out: [0.5, 0.1, 1] }), mats.head);
    for (const [u0, u1] of [[0.62, 0.71], [0.74, 0.83]]) {
      // projector: chrome reflector ring with the lit lens inside
      both(shell(onPanel(flankRows, [[u0, 0.5], [u1, 0.52], [u1, 0.8], [u0, 0.78]], 0.0004, [0.5, 0.1, 1], 8, 6), { thick: 0.002, out: [0.5, 0.1, 1] }), M.chrome());
      both(shell(onPanel(flankRows, [[u0 + 0.015, 0.55], [u1 - 0.015, 0.565], [u1 - 0.015, 0.75], [u0 + 0.015, 0.735]], 0.0012, [0.5, 0.1, 1], 8, 6), { thick: 0.0015, out: [0.5, 0.1, 1] }), mats.head);
    }
    both(shell(onPanel(flankRows, eyeQ, 0.003, [0.5, 0.1, 1], 14, 6), { thick: 0.0015, out: [0.5, 0.1, 1] }), M.lens());
    ctx.headlights.push({ pos: [0.9, 0.79, 0], group: 'chassis', r: 0.05 });
  }
  // ram-air intake at the chin: dark mouth with a mesh
  both(shell(onPanel(flankRows, [[0.86, 0.0], [1.0, 0.0], [1.0, 0.5], [0.88, 0.42]], -0.0015, [0.8, -0.2, 0.6], 8, 5), { thick: 0.003, out: [0.8, -0.2, 0.6] }), M.gloss(0x08080a));
  both(shell(onPanel(flankRows, [[0.88, 0.04], [0.995, 0.04], [0.995, 0.44], [0.9, 0.38]], 0.0006, [0.8, -0.2, 0.6], 6, 4), { thick: 0.001, out: [0.8, -0.2, 0.6] }), M.grille());
  // ---- side fairing (front edge 6 mm behind the cowl's rear edge: the shut line), its
  // shoulder crease carrying the cowl's character line back to the tank
  // outline: front edge on the shut line, top edge under the tank, rear edge rising
  // diagonally from the belly to the tank; crease curve splits it into flank + shoulder
  const sideBot = W(P.sideBot ?? [[-0.04, 0.43, 0.17], [0.12, 0.41, 0.2], [0.3, 0.44, 0.212], [0.46, 0.53, 0.214], [0.596, lo, 0.205]]);
  const sideTopE = W(P.sideTop ?? [[0.16, 0.81, 0.176], [0.3, 0.845, 0.19], [0.45, 0.885, 0.196], [0.582, 0.931, 0.166]]);
  const crease = W(P.sideCrease ?? [[0.1, 0.72, 0.182], [0.25, 0.77, 0.205], [0.42, 0.81, 0.216], [0.598, 0.852, 0.218]]);
  const lowerRows = coons(sideBot, crease, W([sideBot[0].slice(), [0.03, 0.6, 0.178], crease[0].slice()]).map((q, i) => (i === 0 ? sideBot[0] : i === 2 ? crease[0] : q)),
    [sideBot[sideBot.length - 1], W([[0.598, 0.75, 0.218]])[0], crease[crease.length - 1]], 32, 14, { dir: [0.1, 0, 1], amount: 0.01 });
  const upperRows = coons(crease, sideTopE, [crease[0], sideTopE[0]], [crease[crease.length - 1], W([[0.592, 0.915, 0.196]])[0], sideTopE[sideTopE.length - 1]], 32, 6, { dir: [0, 0.6, 1], amount: 0.004 });
  const sideRows = lowerRows;
  both(shell(lowerRows, { thick: T, out: [0, 0, 1], uv, crisp: ['top'] }), paint);
  both(shell(upperRows, { thick: T, out: [0, 0.6, 1], uv, crisp: ['bottom'] }), paint);
  // flank intake behind the front wheel: dark duct with angled carbon slats standing proud
  const ventQ = [[0.68, 0.36], [0.97, 0.4], [0.97, 0.92], [0.74, 0.84]];
  both(shell(onPanel(sideRows, ventQ, 0.0012, [0, 0.1, 1], 12, 8), { thick: 0.002, out: [0, 0, 1] }), M.gloss(0x060607));
  for (let g = 0; g < 4; g++) {
    const a = 0.1 + g * 0.24;
    const gill = onPanel(sideRows, [[0.69 + a * 0.06, 0.38 + a * 0.5], [0.97, 0.42 + a * 0.5], [0.97, 0.45 + a * 0.5], [0.69 + a * 0.06, 0.41 + a * 0.5]], 0.006, [0.3, -0.5, 1], 8, 1);
    both(shell(gill, { thick: 0.007, out: [0, 0.4, 1] }), M.carbon());
  }
  // ---- belly pan (meets the side fairing 4 mm lower; seam along the bottom centreline)
  const bellyTop = sideBot.map(([x, y, z], i) => [x + (i === 0 ? 0.004 : 0), y + 0.016, z - 0.01 * k]);
  const bellyBot = [[-0.08, 0.26, 0], [0.06, 0.175, 0], [0.26, 0.175, 0], [0.43, 0.25, 0]];
  const bellyRear = [[-0.08, 0.26, 0], W([[-0.07, 0.36, 0.13]])[0], bellyTop[0]];
  const bellyFront = [[0.43, 0.25, 0], W([[0.5, 0.44, 0.15]])[0], bellyTop[bellyTop.length - 1]];
  const bellyRows = coons(bellyBot, bellyTop, bellyRear, bellyFront, 28, 12, { dir: [0, -0.6, 1], amount: 0.018 });
  if (P.bellyMat) both(shell(bellyRows, { thick: T, out: [0, -0.4, 1], seam: 'bottom', uv: (q, u, v) => [u * 0.9, v * 0.45] }), P.bellyMat);
  else both(shell(bellyRows, { thick: T, out: [0, -0.4, 1], seam: 'bottom', uv }), paint);
  // ---- dash surround behind the screen line (dark, so the screen shows the cockpit)
  const dsTop = cowlTop.map(([x, y, z]) => [x - 0.004, y - 0.006, z * 0.97]);
  const dsRows = coons(W([[0.5, 0.86, 0.15], [0.53, 0.858, 0.1], [0.55, 0.856, 0.05], [0.56, 0.856, 0]]), dsTop.slice(0, 4).concat([[sb[0] - 0.004, sb[1] - 0.006, 0]]),
    [[0.5, 0.86, 0.15 * k], dsTop[0]], [[0.56, 0.856, 0], [0.68, 0.878, 0], [sb[0] - 0.004, sb[1] - 0.006, 0]], 12, 6);
  both(shell(dsRows, { thick: 0.003, out: [0, 1, 0], seam: 'front' }), M.plastic(0x0e0e10));
  // ---- screen on the cowl's screen line: double-curved polycarbonate bubble
  const st = P.screenTop ?? [0.52, 1.125];
  const scrBase = cowlTop.map(([x, y, z]) => [x, y + 0.003, z]);
  const scrTopE = W([[0.535, st[1] - 0.09, 0.14], [0.525, st[1] - 0.05, 0.112], [st[0] + 0.0, st[1] - 0.016, 0.06], [st[0], st[1], 0]]);
  const scrRear = [scrBase[0], W([[0.555, 0.975, 0.162]])[0], scrTopE[0]];
  const scrFront = [scrBase[scrBase.length - 1], [sb[0] - 0.1, sb[1] + 0.07, 0], [(sb[0] + st[0]) / 2 - 0.05, (sb[1] + st[1]) / 2 + 0.045, 0], [st[0], st[1], 0]];
  const scrRows = coons(scrBase, scrTopE, scrRear, scrFront, 14, 12, { dir: [0.4, 0.6, 0.6], amount: 0.012 });
  both(shell(scrRows, { thick: 0.003, out: [0.6, 0.8, 0.3], seam: 'front' }), mats.glass);
  // ---- fuel tank cover: sides below a shoulder crease, a flatter top, knee recesses
  const tankSecs = (P.tank ?? [
    [-0.15, [[0.09, 0.85], [0.093, 0.868], [0.083, 0.886], [0.042, 0.896], [0, 0.898]]],
    [-0.04, [[0.142, 0.832], [0.15, 0.874], [0.142, 0.93], [0.074, 0.968], [0, 0.976]]],
    [0.1, [[0.188, 0.826], [0.2, 0.89], [0.184, 0.97], [0.096, 1.012], [0, 1.022]]],
    [0.25, [[0.19, 0.836], [0.2, 0.902], [0.182, 0.975], [0.094, 1.016], [0, 1.026]]],
    [0.37, [[0.152, 0.87], [0.16, 0.915], [0.14, 0.968], [0.075, 0.994], [0, 1.0]]],
  ]).map(([x, pts]) => ({ x, pts: pts.map(([z, y]) => [z * k, y]) }));
  const tankStrips = sectionStrips(tankSecs, { sub: 6, around: 5, creases: soft ? [] : [2] });
  if (soft) both(shell(tankStrips[0].rows, { thick: T, out: [0, 0.6, 1], uv, seam: 'top' }), paint);
  else {
    both(shell(tankStrips[0].rows, { thick: T, out: [0, 0.2, 1], uv, seam: 'top', crisp: ['top'] }), paint);
    both(shell(tankStrips[1].rows, { thick: T, out: [0, 1, 0.3], uv, seam: 'top', crisp: ['bottom'] }), paint);
  }
  const tankRows = tankStrips[0].rows;
  // racing fuel cap: flush aero cap with its bolt ring
  { const fc = cyl(0.036, 0.038, 0.007, 32, 'y'); place(fc, { p: [0.17, 1.017, 0], r: [0, 0, 0.02] }); A.add('chassis', fc, M.machined());
    const fi = cyl(0.026, 0.026, 0.009, 24, 'y'); place(fi, { p: [0.17, 1.019, 0], r: [0, 0, 0.02] }); A.add('chassis', fi, M.anodized(0x18191b));
    for (let q = 0; q < 6; q++) { const a = (q / 6) * Math.PI * 2; const b = cyl(0.0035, 0.0035, 0.004, 6, 'y'); b.translate(0.17 + Math.cos(a) * 0.031, 1.0215, Math.sin(a) * 0.031); A.add('chassis', b, M.steel(0x9a9ea4)); } }
  // ---- tail: thin upswept sides, pillion cover on top, undertray below
  const tx = P.tailX ?? -0.95; // tail tip
  const hump = P.hump ?? 0;
  const tk = (tx + 0.1) / (-0.95 + 0.1);
  const TX = (x) => -0.1 + (x + 0.1) * tk;
  const tp = (x, y, z) => [TX(x), y + hump * Math.max(0, (-0.35 - x) / 0.6), z * k];
  const tailRows = coons(
    [tp(-0.93, 0.912, 0.022), tp(-0.7, 0.835, 0.075), tp(-0.4, 0.755, 0.12), tp(-0.04, 0.685, 0.145)],
    [tp(-0.95, 0.985, 0.02), tp(-0.72, 0.945, 0.085), tp(-0.5, 0.878, 0.117), tp(-0.3, 0.84, 0.132), tp(-0.09, 0.83, 0.14)],
    [tp(-0.93, 0.912, 0.022), tp(-0.95, 0.985, 0.02)],
    [tp(-0.04, 0.685, 0.145), tp(-0.05, 0.765, 0.152), tp(-0.09, 0.83, 0.14)],
    30, 10, { dir: [0, 0.1, 1], amount: 0.014 },
  );
  both(shell(tailRows, { thick: T, out: [0, 0, 1], uv }), paint);
  const coverRows = coons(
    [tp(-0.95, 0.99, 0.018), tp(-0.72, 0.951, 0.08), tp(-0.5, 0.885, 0.11)],
    [tp(-0.96, 1.0, 0), tp(-0.72, 0.968, 0), tp(-0.5, 0.905, 0)],
    [tp(-0.95, 0.99, 0.018), tp(-0.96, 1.0, 0)],
    [tp(-0.5, 0.885, 0.11), tp(-0.5, 0.9, 0.06), tp(-0.5, 0.905, 0)],
    20, 8, { dir: [0, 1, 0.2], amount: 0.008 },
  );
  both(shell(coverRows, { thick: T, out: [0, 1, 0.1], uv, seam: 'top' }), paint);
  const underRows = coons(
    [tp(-0.9, 0.895, 0), tp(-0.6, 0.79, 0), tp(-0.3, 0.72, 0), tp(-0.06, 0.68, 0)],
    [tp(-0.93, 0.908, 0.02), tp(-0.7, 0.831, 0.073), tp(-0.4, 0.751, 0.118), tp(-0.04, 0.681, 0.143)],
    [tp(-0.9, 0.895, 0), tp(-0.93, 0.908, 0.02)],
    [tp(-0.06, 0.68, 0), tp(-0.04, 0.681, 0.143)],
    20, 6,
  );
  both(shell(underRows, { thick: 0.003, out: [0, -1, 0], seam: 'bottom' }), M.plastic(0x101012));
  // LED tail light set into the tip, number-plate hanger under it
  const tl = onPanel(tailRows, [[0.0, 0.25], [0.1, 0.22], [0.1, 0.9], [0.0, 0.92]], 0.0015, [-0.5, 0.2, 1], 6, 4);
  both(shell(tl, { thick: 0.003, out: [-0.5, 0.2, 1] }), mats.tail);
  ctx.tails.push({ pos: [TX(-0.92), 0.95 + hump * 0.95, 0] });
  // seat: grippy race seat between tank and pillion cover (a stepped pad for two-up)
  seatLoft(ctx, -0.12, -0.5, 0.836, 0.134 * k, 0.04, { rearRise: 0.032 });
  if (P.pillionSeat) seatLoft(ctx, -0.52, -0.84, 0.905, 0.11 * k, 0.035, { frontRise: -0.01, rearRise: 0.03 });
  return { cowlRows, sideRows, tailRows, tankRows };
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
  // aero winglets on the cowl flanks
  wing(ctx, 0.8, 0.775, 0.17, 0.075, 0.09, { elements: 1, sweep: 0.03, aoa: -0.08, droop: 0.008 });
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
  sportBody(ctx, { panels: true, eyes: false, tailX: -0.82, hump: 0.07, bellyMat: M.carbon(), screenTop: [0.53, 1.14] });
  // MotoGP aero: stacked wing boxes on the cowl flanks with endplates
  wing(ctx, 0.83, 0.79, 0.15, 0.12, 0.11, { elements: 2, gap: 0.042, endplate: true, sweep: 0.05, aoa: -0.1 });
  // ground-effect strakes on the belly pan
  for (const s of [-1, 1]) for (let q = 0; q < 3; q++) {
    const f = extrude(roundRect(0.12, 0.006, 0.002), 0.03, { bevel: 0.001 }); f.rotateZ(0.32); f.translate(0.2 + q * 0.012, 0.31 + q * 0.045, s * 0.19);
    A.add('chassis', f, M.carbon());
  }
  // racing number on the nose: white board with the number, facing forward
  numberPlate(ctx, [0.957, 0.848, 0], [0.07, 0.05], mats.plate, { face: 'front', tilt: 0.9 });
  handlebar(ctx, { type: 'clipon' });
  dash(ctx, [0.52, 0.96, 0], 0.11, 0.06, { tilt: -1.1 });
  footpegs(ctx, -0.22, 0.42, 0.16, { plates: true });
  shock(ctx, [-0.06, 0.62, 0], [-0.18, 0.36, 0], { r: 0.025, springColor: 0xd8d8d8 });
  frontFender(ctx, { from: 1.8, len: 1.6, w: 0.13, mat: M.carbon() });
  ctx.headlights.push({ pos: [0.88, 0.84, 0], group: 'chassis', r: 0.0, none: true });
  details(ctx, { damper: true, kickstand: false });
}

// ---------------------------------------------------------------------------
// Street bodywork (naked / streetfighter): side-projected street livery, angular tank
// with a shoulder crease, radiator shrouds, a slim upswept tail with an LED light, seat,
// engine spoiler. Shapes come from cross-sections so the character lines stay crisp.
function streetLivery(ctx, label, P = {}) {
  const L = ctx.livery;
  const frame = [-1.0, 1.05, 0.1, 1.2];
  const map = sideLiveryTexture(`street:${JSON.stringify(L)}:${label}:${P.key || ''}`, frame, (g, X, Y) => {
    const poly = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); g.fillStyle = fill; g.fill(); };
    const line = (pts, w, col) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.lineWidth = w; g.strokeStyle = col; g.stroke(); };
    g.fillStyle = L.base; g.fillRect(0, 0, 4096, 4096);
    for (const q of P.second || []) poly(q, L.second);
    for (const q of P.lines || []) line(q, 6, L.accent);
    const light = (c) => { const q = new THREE.Color(c); return 0.2126 * q.r + 0.7152 * q.g + 0.0722 * q.b > 0.55; };
    if (P.labelAt) {
      const [lx, ly, size] = P.labelAt;
      g.font = `italic 800 ${size || 60}px "Barlow Condensed", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = L.accent === L.base ? (light(L.base) ? '#111' : '#fff') : L.accent; g.fillText(label, X(lx), Y(ly));
    }
    if (P.sub) { g.font = '600 22px Barlow, Arial, sans-serif'; g.fillStyle = light(L.base) ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.75)'; g.fillText(P.sub[0], X(P.sub[1]), Y(P.sub[2])); }
  });
  return { map, frame };
}

function nakedBody(ctx, P) {
  const { A, mats } = ctx;
  const { map, frame } = streetLivery(ctx, ctx.spec.short, P.livery || {});
  const paint = mats.side || (mats.side = mats.makePaint(map));
  const uv = sideUV(frame);
  const both = (geo, mat) => { A.add('chassis', geo, mat); A.add('chassis', mirrorPanel(geo, mat === paint ? sideUVLeft : null), mat); };
  const T = 0.0042;
  const secs = (list) => list.map(([x, pts]) => ({ x, pts }));
  // tank: sides below a shoulder crease, top to the centreline
  const tank = sectionStrips(secs(P.tank), { sub: 6, around: 5, creases: [2] });
  both(shell(tank[0].rows, { thick: T, out: [0, 0.2, 1], uv, seam: 'top', crisp: ['top'] }), paint);
  both(shell(tank[1].rows, { thick: T, out: [0, 1, 0.3], uv, seam: 'top', crisp: ['bottom'] }), paint);
  // radiator shrouds: two layered blades down over the radiator flanks
  if (P.shroud) {
    const [bot, top, rear, front] = P.shroud;
    const rows = coons(bot, top, rear, front, 22, 10, { dir: [0.3, 0, 1], amount: 0.012 });
    both(shell(rows, { thick: T, out: [0.2, 0, 1], uv }), paint);
    // intake slot + inner dark layer peeking out under the blade
    both(shell(onPanel(rows, [[0.45, 0.25], [0.92, 0.3], [0.9, 0.48], [0.47, 0.42]], 0.0012, [0.2, 0, 1], 10, 3), { thick: 0.002, out: [0.2, 0, 1] }), M.gloss(0x08080a));
    const inner = coons(bot.map(([x, y, z]) => [x + 0.02, y - 0.04, z - 0.012]), bot.map(([x, y, z]) => [x, y + 0.02, z - 0.008]), [[bot[0][0] + 0.02, bot[0][1] - 0.04, bot[0][2] - 0.012], [bot[0][0], bot[0][1] + 0.02, bot[0][2] - 0.008]], [[bot[bot.length - 1][0] + 0.02, bot[bot.length - 1][1] - 0.04, bot[bot.length - 1][2] - 0.012], [bot[bot.length - 1][0], bot[bot.length - 1][1] + 0.02, bot[bot.length - 1][2] - 0.008]], 16, 3);
    both(shell(inner, { thick: 0.003, out: [0, -0.2, 1] }), M.plastic(0x141416));
  }
  // tail: upswept sides with an under-crease, cover, undertray, LED light in the tip
  if (P.tail) {
    const [bot, top, rear, front] = P.tail;
    const rows = coons(bot, top, rear, front, 24, 8, { dir: [0, 0.1, 1], amount: 0.01 });
    both(shell(rows, { thick: T, out: [0, 0, 1], uv }), paint);
    const cover = coons(top.map(([x, y, z]) => [x, y + 0.004, z]), top.map(([x, y]) => [x, y + 0.02, 0]), [[top[0][0], top[0][1] + 0.004, top[0][2]], [top[0][0], top[0][1] + 0.02, 0]], [[top[top.length - 1][0], top[top.length - 1][1] + 0.004, top[top.length - 1][2]], [top[top.length - 1][0], top[top.length - 1][1] + 0.02, 0]], 16, 4, { dir: [0, 1, 0], amount: 0.006 });
    both(shell(cover, { thick: T, out: [0, 1, 0.1], uv, seam: 'top' }), P.coverMat || paint);
    const under = coons(bot.map(([x, y]) => [x, y - 0.004, 0]), bot.map(([x, y, z]) => [x, y - 0.004, z]), [[bot[0][0], bot[0][1] - 0.004, 0], [bot[0][0], bot[0][1] - 0.004, bot[0][2]]], [[bot[bot.length - 1][0], bot[bot.length - 1][1] - 0.004, 0], [bot[bot.length - 1][0], bot[bot.length - 1][1] - 0.004, bot[bot.length - 1][2]]], 16, 3);
    both(shell(under, { thick: 0.003, out: [0, -1, 0], seam: 'bottom' }), M.plastic(0x101012));
    both(shell(onPanel(rows, [[0.0, 0.25], [0.08, 0.22], [0.08, 0.92], [0.0, 0.95]], 0.0015, [-0.5, 0.2, 1], 6, 4), { thick: 0.003, out: [-0.5, 0.2, 1] }), mats.tail);
    const tip = bot[0];
    ctx.tails.push({ pos: [tip[0] - 0.01, (tip[1] + top[0][1]) / 2, 0] });
  }
  // engine spoiler under the crankcase
  if (P.spoiler) {
    const [bot, top, rear, front] = P.spoiler;
    const rows = coons(bot, top, rear, front, 16, 8, { dir: [0, -0.5, 1], amount: 0.01 });
    both(shell(rows, { thick: T, out: [0, -0.4, 1], seam: 'bottom', uv }), P.spoilerMat || paint);
  }
}

// LED headlight nacelle on the forks: angular housing, twin projectors with chrome
// reflector rings, DRL brow, clear cover, flyscreen, mounting brackets to the fork legs
function ledNacelle(ctx, c, o = {}) {
  const A = ctx.A, grp = 'steer';
  const w = o.w ?? 0.085, h = o.h ?? 0.06, d = o.d ?? 0.09;
  const sec = (x, s, y = 0) => ({ x: c[0] + x, y: c[1] + y, w: w * s, ht: h * s * 0.9, hb: h * s, wt: w * s * 0.85, n: 3.2 });
  const hs = loft([sec(-d, 0.75, 0.005), sec(-d * 0.5, 0.95), sec(-0.012, 1), sec(0, 0.97)], { radial: 28, sub: 5, capStart: true, capEnd: false });
  A.add(grp, hs, M.gloss(0x0b0b0c));
  const face = c[0] + 0.001;
  for (const s of [-1, 1]) {
    const pz = s * w * 0.48, py = c[1] - h * 0.12;
    const ringG = revolveFace(0.024, 0.016, 0.006); ringG.translate(face - 0.004, py, pz); A.add(grp, ringG, M.chrome());
    const lensG = cyl(0.017, 0.017, 0.006, 24, 'x'); lensG.translate(face - 0.006, py, pz); A.add(grp, lensG, ctx.mats.head);
  }
  // DRL brow: thin lit blade along the top edge
  A.add(grp, sweep([[face - 0.002, c[1] + h * 0.55, -w * 0.85], [face + 0.002, c[1] + h * 0.62, 0], [face - 0.002, c[1] + h * 0.55, w * 0.85]], () => [[0, -0.004], [0.003, 0], [0, 0.004], [-0.003, 0]], { segments: 16 }), ctx.mats.head);
  const cov = loft([sec(-0.006, 1.02), sec(0.004, 0.99)], { radial: 28, sub: 2, capStart: false, capEnd: true });
  A.add(grp, cov, M.lens());
  ctx.headlights.push({ pos: [c[0] + 0.01, c[1], 0], group: grp, r: 0.045 });
  // brackets to the fork legs
  for (const s of [-1, 1]) A.add(grp, sweep([[c[0] - d * 0.7, c[1] + h * 0.3, s * w * 0.8], [c[0] - d * 0.95, c[1] + h * 0.4, s * (ctx.fw - 0.02)]], () => roundRect(0.03, 0.006, 0.002, 2), { segments: 2, up: [0, 0, 1] }), M.black());
  if (o.flyscreen !== false) {
    const fly = loft([
      { x: c[0] - 0.02, y: c[1] + h + 0.01, w: w * 0.9, ht: 0.012, n: 2 },
      { x: c[0] - 0.07, y: c[1] + h + 0.06, w: w * 1.05, ht: 0.014, n: 2 },
    ], { radial: 14, sub: 5, t0: 0.15, t1: Math.PI - 0.15 });
    A.add(grp, fly, o.flyMat || ctx.mats.glass);
  }
}
function revolveFace(ro, ri, dz) { return turned([[ri, -dz / 2], [ro, -dz / 2], [ro, dz / 2], [ri, dz / 2]], 24, 'x'); }

// Trellis frame: welded steel tubes between two rails per side, weld beads at the nodes
function trellis(ctx, top, bot, zz, o = {}) {
  const A = ctx.A, fm = o.mat || ctx.mats.frame, steps = o.steps ?? 5, r = o.r ?? 0.0115;
  const nodes = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < steps; i++) {
      const a = i / steps, b = (i + 1) / steps;
      const ta = [...top(a), zz(a, s)], tb = [...top(b), zz(b, s)], ba = [...bot(a), zz(a, s)], bb = [...bot(b), zz(b, s)];
      A.add('chassis', rod(ta, tb, r, 12), fm);
      A.add('chassis', rod(ba, bb, r, 12), fm);
      A.add('chassis', rod(i % 2 ? ba : ta, i % 2 ? tb : bb, r * 0.85, 10), fm);
      nodes.push(ta, ba);
    }
    nodes.push([...top(1), zz(1, s)], [...bot(1), zz(1, s)]);
  }
  for (const n of nodes) { const w = sphere(r * 1.35, 10, 8); w.translate(...n); A.add('chassis', w, fm); }
}

// 3. Naked streetfighter with trellis frame + single-sided swingarm
function naked(ctx) {
  const { A, mats } = ctx;
  setupChassis(ctx);
  fork(ctx, { type: 'usd', innerMat: M.gold(), outerMat: M.anodized(0x1a1a1a) });
  wheels(ctx, { caliperColor: 0xd4a431, carrier: '#222222', rimStripe: mats.accentSolid });
  swingarm(ctx, { style: 'single', mat: M.aluminum() });
  chain(ctx);
  // trellis frame round the engine, rear subframe to the tail
  const H = ctx.head, [px, py] = ctx.pivot;
  const top = (t) => [H[0] + (px + 0.05 - H[0]) * t, H[1] + 0.07 + (py + 0.2 - H[1] - 0.07) * t];
  const bot = (t) => [H[0] - 0.05 + (px + 0.02 - H[0] + 0.05) * t, H[1] - 0.15 + (py - 0.02 - H[1] + 0.15) * t];
  trellis(ctx, top, bot, (t, s) => s * (0.06 + 0.07 * Math.min(1, t * 2)));
  const fm = mats.frame;
  for (const s of [-1, 1]) {
    A.add('chassis', rod([top(1)[0], top(1)[1], s * 0.13], [-0.62, 0.8, s * 0.07], 0.011, 12), fm);
    A.add('chassis', rod([bot(1)[0], bot(1)[1] + 0.05, s * 0.13], [-0.5, 0.78, s * 0.08], 0.0095, 12), fm);
  }
  A.add('chassis', rod(ctx.sp(ctx.Lf - 0.01), ctx.sp(ctx.Lf + ctx.headLen + 0.01), 0.036, 24), fm);
  // inline triple (visible)
  radiator(ctx, [0.38, 0.48, 0], 0.3, 0.24, { tilt: -0.15 });
  const eng = engineUnit(ctx, { pos: [0.05, 0.31], cyl: 3, tilt: 0.38, cooling: 'liquid', caseMat: M.engine(0x232528), coverMat: M.engine(0x6a6e75), camMat: mats.accentSolid });
  for (const [x, y, z] of eng.ports) {
    header(ctx, [[x, y, z], [x + 0.06, y - 0.08, z * 1.05], [0.36, 0.24, z * 0.7], [0.3, 0.14, z * 0.4], [0.1, 0.12, 0.04], [-0.06, 0.18, 0.1]], 0.019, M.header());
  }
  muffler(ctx, [-0.06, 0.2, 0.12], [-0.3, 0.3, 0.17], { type: 'cone', r: 0.06, mat: M.darkChrome(), endcap: M.carbon() });
  nakedBody(ctx, {
    livery: { key: 'viper', second: [[[0.5, 0.86], [0.42, 0.64], [0.3, 0.55], [0.14, 0.6], [0.12, 0.8], [0.3, 0.86]], [[-0.1, 0.78], [-0.4, 0.84], [-0.75, 0.93], [-0.75, 0.88], [-0.4, 0.79], [-0.1, 0.72]]], lines: [[[0.45, 0.64], [0.3, 0.58], [0.15, 0.62]], [[-0.1, 0.795], [-0.45, 0.86], [-0.75, 0.945]]], labelAt: [0.1, 0.88, 50] },
    tank: [
      [-0.13, [[0.08, 0.83], [0.086, 0.858], [0.076, 0.884], [0.04, 0.896], [0, 0.898]]],
      [-0.02, [[0.13, 0.818], [0.137, 0.868], [0.122, 0.922], [0.066, 0.946], [0, 0.952]]],
      [0.12, [[0.16, 0.818], [0.172, 0.888], [0.156, 0.962], [0.086, 0.99], [0, 0.996]]],
      [0.3, [[0.152, 0.838], [0.162, 0.9], [0.15, 0.962], [0.085, 0.994], [0, 0.999]]],
      [0.42, [[0.1, 0.862], [0.11, 0.9], [0.1, 0.935], [0.06, 0.954], [0, 0.958]]],
    ],
    shroud: [
      [[0.16, 0.64, 0.168], [0.3, 0.57, 0.19], [0.44, 0.565, 0.19], [0.53, 0.63, 0.165]],
      [[0.13, 0.82, 0.158], [0.28, 0.852, 0.162], [0.4, 0.862, 0.128], [0.48, 0.842, 0.108]],
      [[0.16, 0.64, 0.168], [0.13, 0.73, 0.172], [0.13, 0.82, 0.158]],
      [[0.53, 0.63, 0.165], [0.52, 0.74, 0.14], [0.48, 0.842, 0.108]],
    ],
    tail: [
      [[-0.74, 0.9, 0.024], [-0.5, 0.815, 0.07], [-0.25, 0.765, 0.1], [-0.06, 0.74, 0.118]],
      [[-0.76, 0.952, 0.02], [-0.5, 0.898, 0.08], [-0.3, 0.86, 0.1], [-0.1, 0.84, 0.118]],
      [[-0.74, 0.9, 0.024], [-0.76, 0.952, 0.02]],
      [[-0.06, 0.74, 0.118], [-0.08, 0.8, 0.124], [-0.1, 0.84, 0.118]],
    ],
    spoiler: [
      [[-0.06, 0.2, 0], [0.12, 0.17, 0], [0.3, 0.2, 0]],
      [[-0.04, 0.29, 0.12], [0.12, 0.26, 0.135], [0.28, 0.28, 0.12]],
      [[-0.06, 0.2, 0], [-0.04, 0.29, 0.12]],
      [[0.3, 0.2, 0], [0.28, 0.28, 0.12]],
    ],
    spoilerMat: M.plastic(0x141416),
  });
  seatLoft(ctx, -0.1, -0.48, 0.835, 0.122, 0.042, { rearRise: 0.04 });
  ledNacelle(ctx, [0.62, 0.85, 0], { w: 0.08, h: 0.055 });
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
  const bz = belt(ctx, { pulley: false }).z;
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
  trellis(ctx, top, bot, (t, s) => s * (0.06 + 0.12 * Math.min(1, t * 2.2)), { r: 0.012 });
  for (const s of [-1, 1]) {
    // subframe to the tail
    A.add('chassis', rod([top(1)[0], top(1)[1], s * 0.18], [-0.66, 0.84, s * 0.07], 0.011, 12), fm);
    A.add('chassis', rod([px + 0.02, py + 0.12, s * 0.18], [-0.52, 0.8, s * 0.075], 0.009, 12), fm);
    // pivot plates
    const pl = extrude([[-0.06, -0.09], [0.07, -0.09], [0.08, 0.06], [0.0, 0.1], [-0.06, 0.06]], 0.014, { holes: [circle(0.016, 12, 0.01, 0.0)], bevel: 0.003 }); pl.translate(px + 0.02, py + 0.04, s * 0.19); A.add('chassis', pl, M.anodized(0x1c1e21));
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
  // ---- charger compartment in place of a tank, air shrouds with lit slots, short tail
  nakedBody(ctx, {
    livery: { key: 'volt', second: [[[0.5, 0.84], [0.47, 0.64], [0.2, 0.62], [0.16, 0.8], [0.3, 0.84]], [[-0.1, 0.8], [-0.86, 0.95], [-0.86, 0.9], [-0.1, 0.75]]], lines: [[[0.46, 0.66], [0.2, 0.64]], [[-0.1, 0.81], [-0.86, 0.96]]], labelAt: [0.12, 0.9, 46] },
    tank: [
      [-0.12, [[0.09, 0.8], [0.094, 0.83], [0.084, 0.855], [0.044, 0.868], [0, 0.872]]],
      [0.08, [[0.15, 0.79], [0.158, 0.86], [0.142, 0.925], [0.074, 0.952], [0, 0.958]]],
      [0.3, [[0.16, 0.8], [0.168, 0.875], [0.15, 0.962], [0.08, 0.988], [0, 0.993]]],
      [0.45, [[0.11, 0.82], [0.118, 0.87], [0.104, 0.918], [0.056, 0.932], [0, 0.936]]],
    ],
    shroud: [
      [[0.2, 0.62, 0.2], [0.34, 0.62, 0.21], [0.47, 0.68, 0.19]],
      [[0.16, 0.79, 0.165], [0.32, 0.81, 0.18], [0.47, 0.83, 0.15]],
      [[0.2, 0.62, 0.2], [0.17, 0.7, 0.19], [0.16, 0.79, 0.165]],
      [[0.47, 0.68, 0.19], [0.48, 0.76, 0.18], [0.47, 0.83, 0.15]],
    ],
    tail: [
      [[-0.86, 0.9, 0.02], [-0.6, 0.83, 0.075], [-0.36, 0.79, 0.11]],
      [[-0.88, 0.955, 0.018], [-0.6, 0.915, 0.08], [-0.36, 0.89, 0.115]],
      [[-0.86, 0.9, 0.02], [-0.88, 0.955, 0.018]],
      [[-0.36, 0.79, 0.11], [-0.36, 0.84, 0.118], [-0.36, 0.89, 0.115]],
    ],
  });
  const port = cyl(0.035, 0.035, 0.01, 24, 'y'); place(port, { p: [0.27, 0.992, 0], r: [0, 0, -0.12] }); A.add('chassis', port, M.anodized(0x15171a));
  for (const s of [-1, 1]) { const slot = sweep([[0.42, 0.72, s * 0.192], [0.3, 0.69, s * 0.206], [0.2, 0.68, s * 0.2]], () => [[0, -0.004], [0.003, 0], [0, 0.004], [-0.003, 0]], { segments: 8 }); A.add('chassis', slot, mats.neon); }
  seatLoft(ctx, -0.12, -0.5, 0.86, 0.13, 0.04, { rearRise: 0.03 });
  ledNacelle(ctx, [0.7, 0.85, 0], { w: 0.085, h: 0.06, flyMat: mats.glass });
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
    header(ctx, [[epx, epy, 0.0], [epx + 0.07, epy - 0.05, 0.05], [0.22, 0.42, 0.09], [0.2, 0.32, 0.12], [0.0, 0.3, 0.14], [-0.25, 0.48, 0.14]], 0.022, M.header());
    muffler(ctx, [-0.25, 0.48, 0.14], [-0.6, 0.66, 0.14], { type: 'hex', r: 0.05, mat: M.carbon(), endcap: M.titanium() });
  } else {
    header(ctx, [[epx, epy, 0.0], [epx + 0.07, epy - 0.05, 0.05], [0.2, 0.42, 0.1], [0.18, 0.38, 0.13], [-0.05, 0.5, 0.14], [-0.3, 0.66, 0.13]], 0.022, M.header());
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
  sportBody(ctx, { panels: true, eyes: false, smooth: true, tailX: -0.82, hump: 0.08, screenTop: [0.53, 1.1] });
  // oval number board on the nose, as on the 90s 500 cc racers
  const ob = extrude(circle(1, 40).map(([a, b]) => [a * 0.062, b * 0.044]), 0.004, { bevel: 0.001 });
  ob.rotateY(Math.PI / 2); ob.rotateZ(0.8); ob.translate(0.958, 0.84, 0);
  A.add('chassis', ob, mats.plateSolid);
  numberPlate(ctx, [0.9605, 0.8418, 0], [0.07, 0.05], mats.plate, { face: 'front', tilt: 0.8 });
  ctx.headlights.push({ pos: [0.88, 0.8, 0], group: 'chassis', r: 0, none: true });
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
  for (const k of [-1, 1]) {
    const o = cyl(0.018, 0.018, 0.02, 12, 'x'); place(o, { p: [-0.56, 0.5 + k * 0.026, 0.178] }); A.add('chassis', o, M.darkChrome());
    ctx.exhausts.push({ pos: [-0.568, 0.5 + k * 0.026, 0.178], dir: [-0.88, 0.47, 0], r: 0.02 });
  }
  A.add('chassis', rod([-0.4, 0.52, 0.17], [-0.42, 0.58, 0.14], 0.012, 8), M.black());

  // ---- bodywork: full touring fairing on the shared panel system (road livery), tall
  // screen, wider tank and tail, stepped two-up seat, grab rails, integrated indicators
  sportPanels(ctx, { road: true, k: 1.06, screenTop: [0.47, 1.21], screenBase: [0.8, 0.915], tailX: -0.98, hump: -0.01, pillionSeat: true, cowlLow: 0.69 });
  for (const s of [-1, 1]) {
    // integrated front indicators on the cowl flanks
    A.add('chassis', sweep([[0.79, 0.85, s * 0.17], [0.75, 0.856, s * 0.188], [0.71, 0.862, s * 0.2]], () => [[0, -0.004], [0.004, 0], [0, 0.004], [-0.004, 0]], { segments: 6 }), M.emissive(0xff8a00, 0.25));
    // passenger grab rails along the tail
    const rail = sweep([[-0.5, 0.875, s * 0.142], [-0.62, 0.9, s * 0.15], [-0.76, 0.93, s * 0.13], [-0.83, 0.94, s * 0.09]], () => roundRect(0.022, 0.014, 0.005, 2), { segments: 16, up: [0, 1, 0] });
    A.add('chassis', rail, M.anodized(0x141416));
    A.add('chassis', rod([-0.52, 0.872, s * 0.14], [-0.52, 0.8, s * 0.13], 0.009, 8), M.anodized(0x141416));
  }
  // number-plate hanger under the tail
  const hanger = box(0.31, 0.012, 0.15, 0.006); place(hanger, { p: [-0.92, 0.74, 0], r: [0, 0, 0.876] }); A.add('chassis', hanger, M.plastic(0x101012));
  rearFender(ctx, { from: 1.9, len: 1.4, mat: M.black(), w: 0.21 });
  frontFender(ctx, { from: 1.75, len: 1.75, w: 0.13, mat: mats.paintSolid });
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
