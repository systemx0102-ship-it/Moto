// Rider look: the suit's texture atlas (its layout is shared with the body geometry), the
// leather relief every rider shares (padded panels, seams with double rows of stitching,
// perforations, accordion stretch zones, aramid stretch fabric, folds at the joints, baked
// cavity and contact occlusion, roughness per zone), micro detail tiles (pebbled leather
// grain, aramid weave), the per-team paintwork (suit, helmet) and the materials.
import * as THREE from 'three';
import { makeCanvas, toTexture, heightToNormal } from '../core/textures.js';
import { makeTileFbm, rng } from '../core/utils.js';
import { Save } from '../core/Settings.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------------------
// Atlas layout in design pixels of a 2048 x 2048 sheet (y down), ~1300 px per metre on
// every part, so stitches, grain and lettering keep one scale all over the body. Inside a
// region: u round the body or limb, t along it (t0 at the bottom edge of the region).
// Torso u: 0 left side, .25 back, .5 right side, .75 front. Limb u (the left limbs are
// mirrored into it): 0 inner side, .25 front, .5 outer side, .75 back.
export const ATLAS = 2048;
export const PXM = 1300;
export const T_MIN = -0.15, T_MAX = 1.04; // torso ring range (fractions of the torso length)
export const LIMB_T = { upper: [-0.2, 1.04], fore: [-0.08, 1.05], thigh: [-0.24, 1.07], shin: [-0.07, 0.6] };
const rect = (x0, y0, x1, y1, mirror = false) => ({ x0, y0, x1, y1, u0: x0 / ATLAS, u1: x1 / ATLAS, v0: 1 - y1 / ATLAS, v1: 1 - y0 / ATLAS, mirror });
export const TORSO = rect(0, 0, 1272, 792);
export const HUMP = rect(1288, 0, 1792, 392);
export const COLLAR = rect(1288, 408, 1792, 480);
const LIMBS = {
  upper: [rect(1288, 496, 1792, 968, true), rect(1288, 984, 1792, 1440)],
  thigh: [rect(0, 808, 632, 1532, true), rect(648, 808, 1272, 1532)],
  fore: [rect(0, 1548, 412, 1940, true), rect(428, 1548, 840, 1940)],
  shin: [rect(856, 1548, 1268, 1920, true), rect(1288, 1456, 1700, 1836)],
};
export const limbRegion = (name, s) => LIMBS[name][s < 0 ? 0 : 1];
const GUT = 6; // paint this far past a region's edge (mip bleed)

// painting regions: rectangle + parametric range
const REG = {
  torso: { R: TORSO, t0: T_MIN, t1: T_MAX },
  hump: { R: HUMP, t0: 0, t1: 1 },
  collar: { R: COLLAR, t0: 0, t1: 1 },
};
const LREG = {};
const limbReg = (name, s) => (LREG[name + s] ||= { R: limbRegion(name, s), t0: LIMB_T[name][0], t1: LIMB_T[name][1], mirror: s < 0 });
const at = (rg, u, t) => [rg.R.x0 + (rg.R.x1 - rg.R.x0) * u, rg.R.y1 - (rg.R.y1 - rg.R.y0) * ((t - rg.t0) / (rg.t1 - rg.t0))];
const m2px = (m) => m * PXM;

// a polygon / polyline in a region's (u, t) space, wrapped round in u, clipped to the region
function inRegion(g, rg, fn) {
  const { x0, y0, x1, y1 } = rg.R;
  g.save(); g.beginPath(); g.rect(x0 - GUT, y0 - GUT, x1 - x0 + 2 * GUT, y1 - y0 + 2 * GUT); g.clip();
  fn(); g.restore();
}
function trace(g, rg, pts, du, close) {
  g.beginPath();
  pts.forEach(([u, t], i) => { const [x, y] = at(rg, u + du, t); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  if (close) g.closePath();
}
// the copies of a shape round the wrap that can reach the region (most need just one)
const SHIFTS = [[0], [-1, 0], [0, 1], [-1, 0, 1]];
function shifts(pts) {
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { if (p[0] < lo) lo = p[0]; if (p[0] > hi) hi = p[0]; }
  return SHIFTS[(hi > 1 - 0.01 ? 1 : 0) + (lo < 0.01 ? 2 : 0)];
}
function fillP(g, rg, pts, style) { inRegion(g, rg, () => { g.fillStyle = style; for (const du of shifts(pts)) { trace(g, rg, pts, du, true); g.fill(); } }); }
function strokeP(g, rg, pts, close) { inRegion(g, rg, () => { for (const du of shifts(pts)) { trace(g, rg, pts, du, close); g.stroke(); } }); }

// ---------------------------------------------------------------------------
// Suit construction (one-piece race leathers): panels whose outlines are the seams, and
// the special zones. kind: 'panel' (outline only), 'side' (side panel, second colour),
// 'black' (black leather), 'seat' (rubberised seat panel), 'fabric' (aramid stretch),
// 'pleats' (leather accordion), 'perf' (perforated, no seam), 'line' (open seam)
let CONS = null;
function construction() {
  if (CONS) return CONS;
  const P = [];
  const T = REG.torso;
  const add = (kind, rg, pts) => P.push({ kind, rg, pts });
  // torso: side panels from the armpits down to the hips, perforated at the top
  for (const uc of [0, 0.5]) {
    add('side', T, [[uc - 0.1, -0.02], [uc + 0.08, -0.02], [uc + 0.07, 0.35], [uc + 0.1, 0.62], [uc + 0.06, 0.84], [uc - 0.05, 0.86], [uc - 0.08, 0.55], [uc - 0.12, 0.3]]);
    add('perf', T, [[uc - 0.055, 0.5], [uc + 0.055, 0.5], [uc + 0.045, 0.78], [uc - 0.04, 0.8]]);
  }
  // front: chest panels round the pectorals down to the sternum, the abdomen, accordion
  // inserts at the sides of the waist, belt line, crotch
  add('line', T, [[0.555, 0.99], [0.565, 0.8], [0.61, 0.63], [0.68, 0.545], [0.75, 0.52], [0.82, 0.545], [0.89, 0.63], [0.935, 0.8], [0.945, 0.99]]);
  add('pleats', T, [[0.6, 0.25], [0.668, 0.25], [0.668, 0.47], [0.6, 0.47]]);
  add('pleats', T, [[0.832, 0.25], [0.9, 0.25], [0.9, 0.47], [0.832, 0.47]]);
  add('line', T, [[0.56, 0.2], [0.94, 0.2]]);
  add('perf', T, [[0.7, 0.6], [0.8, 0.6], [0.8, 0.7], [0.7, 0.7]]);
  add('black', T, [[0.665, T_MIN - 0.02], [0.835, T_MIN - 0.02], [0.81, -0.06], [0.69, -0.06]]);
  // black gusset between the legs, joining the crotch panel to the seat
  add('black', T, [[0.43, T_MIN - 0.02], [0.665, T_MIN - 0.02], [0.69, -0.06], [0.45, -0.04]]);
  add('black', T, [[0.835, T_MIN - 0.02], [1.07, T_MIN - 0.02], [1.05, -0.04], [0.81, -0.06]]);
  // back: yoke across the shoulders, back-protector panel, lower-back accordion, seat
  add('line', T, [[0.03, 0.925], [0.47, 0.925]]);
  add('panel', T, [[0.135, 0.455], [0.365, 0.455], [0.385, 0.9], [0.115, 0.9]]);
  add('pleats', T, [[0.16, 0.27], [0.34, 0.27], [0.33, 0.425], [0.17, 0.425]]);
  add('seat', T, [[0.07, T_MIN - 0.02], [0.43, T_MIN - 0.02], [0.41, 0.0], [0.25, 0.045], [0.09, 0.0]]);
  // collar band at the top of the torso
  add('black', T, [[-0.01, 0.992], [1.01, 0.992], [1.01, T_MAX + 0.02], [-0.01, T_MAX + 0.02]]);
  for (const s of [-1, 1]) {
    const U = limbReg('upper', s), F = limbReg('fore', s), TH = limbReg('thigh', s), SH = limbReg('shin', s);
    // upper arm: outer panel under the shoulder slider, aramid stretch on the inner arm
    add('line', U, [[0.3, -0.2], [0.3, 1.04]]); add('line', U, [[0.7, -0.2], [0.7, 1.04]]);
    add('fabric', U, [[-0.12, 0.14], [0.12, 0.14], [0.12, 0.95], [-0.12, 0.95]]);
    // forearm: outer panel round the elbow slider, aramid stretch inside, wrist cuff
    add('line', F, [[0.37, -0.08], [0.36, 0.9]]); add('line', F, [[0.9, -0.08], [0.88, 0.9]]);
    add('fabric', F, [[-0.1, 0.14], [0.14, 0.14], [0.14, 0.86], [-0.1, 0.86]]);
    add('line', F, [[-0.01, 0.9], [1.01, 0.9]]);
    // thigh: outer panel over the hip armour, black grip leather inside, accordion above
    // the knee, perforated front
    add('line', TH, [[0.36, -0.24], [0.38, 1.07]]); add('line', TH, [[0.64, -0.24], [0.62, 1.07]]);
    add('black', TH, [[-0.15, 0.04], [0.15, 0.04], [0.13, 0.94], [-0.13, 0.94]]);
    add('pleats', TH, [[0.17, 0.8], [0.33, 0.8], [0.33, 1.0], [0.17, 1.0]]);
    add('perf', TH, [[0.19, 0.14], [0.32, 0.14], [0.32, 0.6], [0.19, 0.6]]);
    // shin: knee panel, aramid stretch behind the knee
    add('line', SH, [[0.36, -0.07], [0.36, 0.6]]); add('line', SH, [[0.66, -0.07], [0.66, 0.6]]);
    add('fabric', SH, [[0.66, -0.08], [0.86, -0.08], [0.86, 0.22], [0.66, 0.22]]);
    add('line', SH, [[-0.01, 0.22], [0.36, 0.22]]);
  }
  CONS = P;
  return P;
}
const isClosed = (k) => k !== 'line';
const hasSeam = (k) => k !== 'perf';

// printed graphics per team design: { col: 'second' | 'accent', rg, pts }
function graphics(design) {
  const G = [];
  const T = REG.torso;
  const add = (col, rg, pts) => G.push({ col, rg, pts });
  const limbAll = (name, s, u0, u1, ta, tb, col) => { const rg = limbReg(name, s); add(col, rg, [[u0, ta ?? rg.t0 - 0.05], [u1, ta ?? rg.t0 - 0.05], [u1, tb ?? rg.t1 + 0.05], [u0, tb ?? rg.t1 + 0.05]]); };
  if (design === 0) {
    // sweeping swoosh: left shoulder across the chest to the right hip, mirrored on the back
    add('second', T, [[0.99, 0.97], [0.9, 0.97], [0.78, 0.76], [0.66, 0.52], [0.57, 0.26], [0.52, 0.08], [0.6, 0.1], [0.69, 0.32], [0.8, 0.56], [0.92, 0.77], [1.0, 0.85]]);
    add('second', T, [[0.49, 0.97], [0.4, 0.97], [0.29, 0.76], [0.17, 0.52], [0.08, 0.26], [0.02, 0.08], [0.1, 0.1], [0.19, 0.32], [0.3, 0.56], [0.42, 0.77], [0.5, 0.85]]);
    add('accent', T, [[0.52, 0.08], [0.55, 0.08], [0.6, 0.24], [0.69, 0.48], [0.8, 0.72], [0.9, 0.9], [0.88, 0.92], [0.78, 0.74], [0.67, 0.5], [0.58, 0.26]]);
    add('accent', T, [[0.02, 0.08], [0.05, 0.08], [0.1, 0.24], [0.19, 0.48], [0.3, 0.72], [0.4, 0.9], [0.38, 0.92], [0.28, 0.74], [0.17, 0.5], [0.08, 0.26]]);
    for (const s of [-1, 1]) {
      for (const n of ['upper', 'fore']) limbAll(n, s, 0.3, 0.7, null, null, 'second');
      const th = limbReg('thigh', s);
      add('second', th, [[0.36, th.t0 - 0.05], [0.64, th.t0 - 0.05], [0.7, 0.5], [0.6, th.t1 + 0.05], [0.4, th.t1 + 0.05], [0.3, 0.5]]);
      add('accent', th, [[0.3, 0.5], [0.36, 0.5], [0.44, th.t1 + 0.05], [0.4, th.t1 + 0.05]]);
    }
  } else if (design === 1) {
    // two-tone split: upper body in the second colour with a V to the sternum
    add('second', T, [[0, 0.6], [0.6, 0.6], [0.75, 0.46], [0.9, 0.6], [1, 0.6], [1, T_MAX + 0.05], [0, T_MAX + 0.05]]);
    add('accent', T, [[0, 0.58], [0.6, 0.58], [0.75, 0.44], [0.9, 0.58], [1, 0.58], [1, 0.6], [0.9, 0.6], [0.75, 0.46], [0.6, 0.6], [0, 0.6]]);
    for (const s of [-1, 1]) {
      for (const n of ['upper', 'fore']) limbAll(n, s, -0.2, 1.2, null, null, 'second');
      limbAll('thigh', s, -0.2, 1.2, 0.72, null, 'second');
      limbAll('thigh', s, -0.2, 1.2, 0.68, 0.72, 'accent');
      limbAll('shin', s, -0.2, 1.2, null, 0.2, 'second');
    }
  } else if (design === 2) {
    // racing bands: chest band all round, accent waist band, double stripes down the limbs
    add('second', T, [[0, 0.6], [1, 0.6], [1, 0.75], [0, 0.75]]);
    add('accent', T, [[0, 0.23], [1, 0.23], [1, 0.29], [0, 0.29]]);
    add('second', T, [[0, 0.86], [1, 0.86], [1, T_MAX + 0.05], [0, T_MAX + 0.05]]);
    for (const s of [-1, 1]) for (const n of ['upper', 'fore', 'thigh', 'shin']) { limbAll(n, s, 0.36, 0.46, null, null, 'second'); limbAll(n, s, 0.54, 0.64, null, null, 'accent'); }
  } else if (design === 3) {
    // arrows: stacked chevrons pointing up the chest and the back, arrowheads down the limbs
    for (const uc of [0.75, 0.25]) {
      add('second', T, [[uc - 0.17, 0.42], [uc, 0.7], [uc + 0.17, 0.42], [uc + 0.17, 0.3], [uc, 0.57], [uc - 0.17, 0.3]]);
      add('accent', T, [[uc - 0.15, 0.52], [uc, 0.78], [uc + 0.15, 0.52], [uc + 0.15, 0.47], [uc, 0.73], [uc - 0.15, 0.47]]);
    }
    add('second', T, [[0, 0.9], [1, 0.9], [1, T_MAX + 0.05], [0, T_MAX + 0.05]]);
    for (const s of [-1, 1]) {
      const U = limbReg('upper', s), F = limbReg('fore', s), TH = limbReg('thigh', s);
      add('second', U, [[0.3, U.t0 - 0.05], [0.7, U.t0 - 0.05], [0.7, 0.5], [0.5, 0.75], [0.3, 0.5]]);
      add('accent', U, [[0.3, 0.6], [0.5, 0.85], [0.7, 0.6], [0.7, 0.68], [0.5, U.t1 + 0.05], [0.3, 0.68]]);
      add('second', F, [[0.32, F.t0 - 0.05], [0.68, F.t0 - 0.05], [0.68, 0.4], [0.5, 0.62], [0.32, 0.4]]);
      add('second', TH, [[0.28, 0.95], [0.5, 0.5], [0.72, 0.95], [0.72, 0.78], [0.5, 0.36], [0.28, 0.78]]);
      add('accent', TH, [[0.32, 0.4], [0.5, 0.06], [0.68, 0.4], [0.68, 0.32], [0.5, -0.02], [0.32, 0.32]]);
      limbAll('shin', s, -0.2, 1.2, null, 0.12, 'second');
    }
  } else {
    // shards: diagonal cuts across the torso, two-tone sleeves split on a slant
    add('second', T, [[0.5, -0.05], [0.66, -0.05], [1.0, 0.72], [0.84, 0.72]]);
    add('accent', T, [[0.6, 0.5], [0.66, 0.5], [0.88, 1.0], [0.82, 1.0]]);
    add('second', T, [[0.0, -0.05], [0.16, -0.05], [0.5, 0.72], [0.34, 0.72]]);
    add('accent', T, [[0.1, 0.5], [0.16, 0.5], [0.38, 1.0], [0.32, 1.0]]);
    add('second', T, [[0.84, 0.72], [1.0, 0.72], [1.0, T_MAX + 0.05], [0.66, T_MAX + 0.05]]);
    add('second', T, [[0.34, 0.72], [0.5, 0.72], [0.5, T_MAX + 0.05], [0.16, T_MAX + 0.05]]);
    for (const s of [-1, 1]) {
      const U = limbReg('upper', s), F = limbReg('fore', s), TH = limbReg('thigh', s);
      add('second', U, [[-0.2, U.t0 - 0.05], [1.2, U.t0 - 0.05], [1.2, 0.55], [-0.2, 0.35]]);
      add('accent', F, [[-0.2, 0.55], [1.2, 0.35], [1.2, 0.45], [-0.2, 0.65]]);
      add('second', F, [[-0.2, 0.65], [1.2, 0.45], [1.2, F.t1 + 0.05], [-0.2, F.t1 + 0.05]]);
      add('second', TH, [[-0.2, 0.62], [1.2, 0.3], [1.2, TH.t1 + 0.05], [-0.2, TH.t1 + 0.05]]);
      add('accent', TH, [[-0.2, 0.55], [1.2, 0.23], [1.2, 0.29], [-0.2, 0.61]]);
    }
  }
  return G;
}

// seams: every closed panel outline and open seam line, at the given width (design px)
function strokeSeams(g, lw) {
  g.lineWidth = lw;
  for (const p of construction()) if (hasSeam(p.kind)) strokeP(g, p.rg, p.pts, isClosed(p.kind));
}

// every seam as polylines in design px (copies round the wrap included), each with the
// rectangle of its region
let SEAMS = null;
function seamPolylines() {
  if (SEAMS) return SEAMS;
  SEAMS = [];
  for (const p of construction()) {
    if (!hasSeam(p.kind)) continue;
    const pts = isClosed(p.kind) ? [...p.pts, p.pts[0]] : p.pts;
    for (const du of shifts(p.pts)) SEAMS.push({ R: p.rg.R, pts: pts.map(([u, t]) => at(p.rg, u + du, t)) });
  }
  return SEAMS;
}
// rasterise the seams (seed = 0 in D) and the two rows of stitches either side of them
// (dashes 3.4 long, 2.2 apart, 3.9 off the seam, 1.8 thick, design px) straight into
// arrays: much faster than reading the strokes back from a canvas
function rasterSeams(W, S, D, stitch) {
  for (const { R, pts } of seamPolylines()) {
    const xa = (R.x0 - GUT) * S, xb = (R.x1 + GUT) * S, ya = (R.y0 - GUT) * S, yb = (R.y1 + GUT) * S;
    const put = (arr, x, y, v) => { if (x >= xa && x < xb && y >= ya && y < yb && x >= 0 && y >= 0 && x < W && y < W) arr[(y | 0) * W + (x | 0)] = v; };
    let phase = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      const L = Math.hypot(bx - ax, by - ay);
      if (L < 1e-6) continue;
      const tx = (bx - ax) / L, ty = (by - ay) / L, nx = -ty, ny = tx;
      for (let d = 0; d <= L; d += 0.5 / S) put(D, (ax + tx * d) * S, (ay + ty * d) * S, 0);
      for (let d = 0; d < L; d += 0.35) {
        if ((phase + d) % 5.6 >= 3.4) continue;
        for (const side of [-1, 1]) for (let w = -0.9; w <= 0.9; w += 0.45) {
          const o = side * 3.9 + w;
          put(stitch, (ax + tx * d + nx * o) * S, (ay + ty * d + ny * o) * S, 255);
        }
      }
      phase = (phase + L) % 5.6;
    }
  }
}

// a tileable fbm evaluated once on a 256 grid, sampled bilinearly (x, y in [0, 1),
// wrapping): the low-frequency noises are far cheaper this way
function noiseGrid(seed, period, oct) {
  const G = 256, f = makeTileFbm(seed, period, oct), grid = new Float32Array(G * G);
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) grid[y * G + x] = f(x / G, y / G);
  return (x, y) => {
    const fx = x * G, fy = y * G, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const xa = ((x0 % G) + G) % G, xb = (xa + 1) % G, r0 = (((y0 % G) + G) % G) * G, r1 = ((((y0 + 1) % G) + G) % G) * G;
    const a = grid[r0 + xa] + (grid[r0 + xb] - grid[r0 + xa]) * tx, b = grid[r1 + xa] + (grid[r1 + xb] - grid[r1 + xa]) * tx;
    return a + (b - a) * ty;
  };
}

// ---------------------------------------------------------------------------
// Shared relief: normal map + ORM (r: occlusion, g: roughness, b: aramid fabric mask)
const RELIEF = {};
function reliefMaps(res) {
  if (RELIEF[res]) return RELIEF[res];
  const S = res / ATLAS, W = res, H = res, N = W * H, hw = W >> 1;
  const C = construction();
  // the zone masks, all in one half-resolution canvas (canvas read-backs are the slow part):
  // r: aramid fabric 255 / rubber seat 128; g: leather pleats 255 / black leather 128;
  // b: perforations (none of the zones sharing a channel overlap)
  const zm = new Uint8Array(hw * hw * 3);
  {
    const { g } = makeCanvas(hw, hw);
    g.setTransform(S / 2, 0, 0, S / 2, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, ATLAS, ATLAS);
    g.globalCompositeOperation = 'lighter';
    const col = { fabric: '#ff0000', seat: '#800000', pleats: '#00ff00', black: '#008000', perf: '#0000ff' };
    for (const p of C) if (col[p.kind]) fillP(g, p.rg, p.pts, col[p.kind]);
    const d = g.getImageData(0, 0, hw, hw).data;
    for (let i = 0, n = hw * hw; i < n; i++) { zm[i * 3] = d[i * 4]; zm[i * 3 + 1] = d[i * 4 + 1]; zm[i * 3 + 2] = d[i * 4 + 2]; }
  }
  const zone = (x, y) => ((y >> 1) * hw + (x >> 1)) * 3;
  // low-frequency noises on the same half-resolution grid
  const halfNoise = (seed, period, oct, k = 1) => {
    const f = noiseGrid(seed, period, oct), out = new Float32Array(hw * hw);
    for (let y = 0; y < hw; y++) for (let x = 0; x < hw; x++) out[y * hw + x] = f((x / hw) * k, (y / hw) * k);
    return out;
  };
  // seams (distance seeds) and stitches, rasterised directly
  const D = new Float32Array(N).fill(1e6), stitch = new Uint8Array(N);
  rasterSeams(W, S, D, stitch);
  // distance to the nearest seam (chamfer 1 / 1.414), in pixels
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let d = D[i], e;
    if (x > 0 && (e = D[i - 1] + 1) < d) d = e;
    if (y > 0) {
      if ((e = D[i - W] + 1) < d) d = e;
      if (x > 0 && (e = D[i - W - 1] + 1.414) < d) d = e;
      if (x < W - 1 && (e = D[i - W + 1] + 1.414) < d) d = e;
    }
    D[i] = d;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let d = D[i], e;
    if (x < W - 1 && (e = D[i + 1] + 1) < d) d = e;
    if (y < H - 1) {
      if ((e = D[i + W] + 1) < d) d = e;
      if (x < W - 1 && (e = D[i + W + 1] + 1.414) < d) d = e;
      if (x > 0 && (e = D[i + W - 1] + 1.414) < d) d = e;
    }
    D[i] = d;
  }
  // height in mm
  const h = new Float32Array(N);
  const und = halfNoise(63, 6, 3);
  const pr = 15 * S, gw = 1.5 * S, g3 = 3 * gw, perfSp = 7 * S, perfR2 = (1.25 * S) ** 2, ribP = 9 * S;
  for (let y = 0; y < H; y++) {
    const rib = 0.55 * Math.abs(Math.sin((y / ribP) * Math.PI)) ** 0.7 - 0.3;
    const prow = Math.floor(y / perfSp), pox = (prow % 2) * perfSp * 0.5, pdy = (y % perfSp) - perfSp / 2;
    for (let x = 0; x < W; x++) {
      const i = y * W + x, d = D[i], z = zone(x, y);
      let v = 0.12 * und[z / 3];
      if (zm[z] > 192) v += 0.05; // flat stretch fabric: no padding
      else {
        // padded leather panels puff up between the seams
        if (d >= pr) v += 0.85; else { const q = d / pr; v += 0.85 * q * q * (3 - 2 * q); }
        if (zm[z + 1] > 192) v += rib;
      }
      if (d < g3) { const q = d / gw; v -= 0.42 * Math.exp(-q * q); } // seam groove
      if (stitch[i]) v += 0.22 * (stitch[i] / 255);
      if (zm[z + 2] > 128) { const dx = ((x + pox) % perfSp) - perfSp / 2; if (dx * dx + pdy * pdy < perfR2) v -= 0.55; }
      h[i] = v;
    }
  }
  // soft folds where the joints bend: ridges across the limb, wandering a little
  const wob = noiseGrid(71, 8, 3);
  const folds = [];
  for (const s of [-1, 1]) {
    folds.push([limbReg('upper', s), 0.1, 0.4, 0.72, 1.04, 13, 0.5]); // inside of the elbow
    folds.push([limbReg('fore', s), 0.1, 0.4, -0.08, 0.22, 12, 0.45]);
    folds.push([limbReg('thigh', s), 0.62, 0.88, 0.8, 1.07, 14, 0.45]); // behind the knee
    folds.push([limbReg('thigh', s), 0.08, 0.42, -0.24, 0.05, 16, 0.4]); // hip fold
    folds.push([limbReg('upper', s), 0.6, 0.95, -0.2, 0.05, 15, 0.3]); // armpit, behind
  }
  folds.push([REG.torso, 0.62, 0.88, 0.05, 0.22, 16, 0.35]); // lap fold across the belly
  for (const uc of [0, 0.5]) folds.push([REG.torso, uc - 0.07, uc + 0.07, 0.1, 0.3, 14, 0.4]); // waist sides
  for (const [rg, u0, u1, t0, t1, per, amp] of folds) {
    const [ax, ay] = at(rg, u0, t1), [bx, by] = at(rg, u1, t0);
    for (const du of shifts([[u0], [u1]])) {
      const shift = du * (rg.R.x1 - rg.R.x0);
      const x0 = Math.floor((Math.min(ax, bx) + shift) * S), x1 = Math.ceil((Math.max(ax, bx) + shift) * S);
      const y0 = Math.floor(Math.min(ay, by) * S), y1 = Math.ceil(Math.max(ay, by) * S);
      const cx0 = Math.max(0, x0, Math.floor((rg.R.x0 - GUT) * S)), cx1 = Math.min(W, x1, Math.ceil((rg.R.x1 + GUT) * S));
      for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
        const fy = (y - y0) / (y1 - y0 || 1), ey = Math.sin(fy * Math.PI), ph = ((y / S) / per) * Math.PI * 2;
        for (let x = cx0; x < cx1; x++) {
          const fx = (x - x0) / (x1 - x0 || 1);
          const wave = Math.sin(ph + wob((x / W) * 3, (y / H) * 3) * 5 + fx * 1.4);
          if (wave > 0) h[y * W + x] += amp * Math.sin(fx * Math.PI) * ey * wave ** 1.6;
        }
      }
    }
  }
  // cavity: how far below its surroundings each texel sits (box blur, two passes)
  const r = Math.max(2, Math.round(5 * S)), kb = 1 / (2 * r + 1);
  const lo = new Int32Array(W), hi = new Int32Array(W);
  for (let x = 0; x < W; x++) { lo[x] = Math.max(0, x - r); hi[x] = Math.min(W - 1, x + r + 1); }
  const tmp = new Float32Array(N), hb = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const row = y * W; let acc = 0;
    for (let x = -r; x <= r; x++) acc += h[row + (x < 0 ? 0 : x)];
    for (let x = 0; x < W; x++) { tmp[row + x] = acc * kb; acc += h[row + hi[x]] - h[row + lo[x]]; }
  }
  // vertical pass with running column sums, row by row (cache friendly)
  const col = new Float32Array(W);
  for (let y = -r; y <= r; y++) { const row = (y < 0 ? 0 : y) * W; for (let x = 0; x < W; x++) col[x] += tmp[row + x]; }
  for (let y = 0; y < H; y++) {
    const row = y * W, add = hi[y] * W, sub = lo[y] * W;
    for (let x = 0; x < W; x++) { hb[row + x] = col[x] * kb; col[x] += tmp[add + x] - tmp[sub + x]; }
  }
  // contact occlusion where the body folds on itself: armpits, crotch, inside the elbows,
  // behind the knees, under the collar
  const zones = [
    [REG.torso, 0, 0.84, 0.07, 0.12, 0.45], [REG.torso, 0.5, 0.84, 0.07, 0.12, 0.45],
    [REG.torso, 0.75, -0.12, 0.12, 0.1, 0.5], [REG.torso, 0.25, -0.13, 0.16, 0.08, 0.35],
    [REG.collar, 0.5, 0, 0.6, 0.35, 0.3], [REG.collar, 0, 0, 0.6, 0.35, 0.3],
  ];
  for (const s of [-1, 1]) {
    zones.push([limbReg('upper', s), 0, -0.12, 0.26, 0.2, 0.5], [limbReg('thigh', s), 0, -0.18, 0.3, 0.18, 0.55]);
    zones.push([limbReg('upper', s), 0.25, 1.02, 0.18, 0.12, 0.35], [limbReg('fore', s), 0.25, -0.06, 0.18, 0.1, 0.35]);
    zones.push([limbReg('thigh', s), 0.75, 1.05, 0.2, 0.1, 0.4], [limbReg('shin', s), 0.75, -0.06, 0.2, 0.1, 0.4]);
  }
  const ao = new Float32Array(N).fill(1);
  for (const [rg, u, t, ru, rt, k] of zones) {
    const [cx, cy] = at(rg, u, t), w = (rg.R.x1 - rg.R.x0) * ru, hh = (rg.R.y1 - rg.R.y0) * (rt / (rg.t1 - rg.t0));
    for (let du = -1; du <= 1; du++) {
      const px = (cx + du * (rg.R.x1 - rg.R.x0)) * S, py = cy * S, rx = w * S, ry = hh * S;
      const xa = Math.max(0, Math.floor((rg.R.x0 - GUT) * S), Math.floor(px - rx)), xb = Math.min(W, Math.ceil((rg.R.x1 + GUT) * S), Math.ceil(px + rx));
      const ya = Math.max(0, Math.floor((rg.R.y0 - GUT) * S), Math.floor(py - ry)), yb = Math.min(H, Math.ceil((rg.R.y1 + GUT) * S), Math.ceil(py + ry));
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
        const qx = (x - px) / rx, qy = (y - py) / ry, q2 = qx * qx + qy * qy;
        if (q2 < 1) { const q = Math.sqrt(q2); ao[y * W + x] *= 1 - k * (1 - q * q * (3 - 2 * q)); }
      }
    }
  }
  // ORM: r occlusion, g roughness, b aramid fabric
  const { c: oc, g: og } = makeCanvas(W, H);
  const img = og.createImageData(W, H), od = img.data;
  const rn = halfNoise(64, 16, 3), rn4 = halfNoise(64, 16, 3, 4);
  const seamR = 2.2 * S;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, z = zone(x, y), fab = zm[z] > 192;
    let cav = 1 - 1.1 * (hb[i] - h[i]);
    cav = cav > 1 ? 1 : cav < 0.35 ? 0.35 : cav;
    let rough = 0.48 + 0.05 * rn[z / 3];
    if (zm[z + 1] > 64 && zm[z + 1] <= 192) rough += 0.04; // black leather
    if (zm[z] > 64 && zm[z] <= 192) rough = 0.74 + 0.04 * rn4[z / 3]; // seat
    if (fab) rough = 0.84;
    if (D[i] < seamR) rough += 0.1;
    if (stitch[i] > 100) rough = 0.66;
    if (h[i] < -0.3 && rough < 0.78) rough = 0.78; // perforation holes
    const o = i * 4, a = cav * ao[i];
    od[o] = a * 255; od[o + 1] = (rough > 1 ? 1 : rough) * 255; od[o + 2] = fab ? 255 : 0; od[o + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  const normal = toTexture(normalFromHeight(h, W, 0.62 * S * PXM / 1000), { srgb: false, wrap: false });
  const orm = toTexture(oc, { srgb: false, wrap: false });
  // the stitch rows as a white alpha mask, for the paintwork's thread
  const { c: sc, g: sg } = makeCanvas(W, H);
  const simg = sg.createImageData(W, H), sd = simg.data;
  for (let i = 0; i < N; i++) { const o = i * 4; sd[o] = sd[o + 1] = sd[o + 2] = 255; sd[o + 3] = stitch[i]; }
  sg.putImageData(simg, 0, 0);
  RELIEF[res] = { normal, orm, stitches: sc };
  return RELIEF[res];
}

// height field (mm) -> tangent-space normal map canvas (edges clamped; k = slope scale)
function normalFromHeight(h, W, k) {
  const { c, g } = makeCanvas(W, W);
  const img = g.createImageData(W, W), d = img.data;
  for (let y = 0; y < W; y++) {
    const yu = (y > 0 ? y - 1 : 0) * W, yd = (y < W - 1 ? y + 1 : y) * W, row = y * W;
    for (let x = 0; x < W; x++) {
      const nx = (h[row + (x > 0 ? x - 1 : 0)] - h[row + (x < W - 1 ? x + 1 : x)]) * k;
      const ny = (h[yd + x] - h[yu + x]) * k;
      const il = 1 / Math.sqrt(nx * nx + ny * ny + 1), o = (row + x) * 4;
      d[o] = (nx * il * 0.5 + 0.5) * 255; d[o + 1] = (ny * il * 0.5 + 0.5) * 255; d[o + 2] = (il * 0.5 + 0.5) * 255; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------------------
// Micro detail tiles (shared): pebbled full-grain leather (~1 mm cells over a 4 cm tile)
// and the aramid basket weave of the stretch panels
let GRAIN = null, WEAVE = null;
export function grainTexture() {
  if (GRAIN) return GRAIN;
  const W = 512, NC = 40, r = rng(91);
  const pts = new Float32Array(NC * NC * 2);
  for (let i = 0; i < NC * NC; i++) { pts[i * 2] = r(); pts[i * 2 + 1] = r(); }
  const fine = makeTileFbm(17, 64, 2);
  const h = new Float32Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const fx = (x / W) * NC, fy = (y / W) * NC, ix = Math.floor(fx), iy = Math.floor(fy);
    let d1 = 9, d2 = 9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = ix + ox, cy = iy + oy;
      const k = (((cy % NC) + NC) % NC) * NC + (((cx % NC) + NC) % NC);
      const dx = cx + pts[k * 2] - fx, dy = cy + pts[k * 2 + 1] - fy, d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    const e = Math.sqrt(d2) - Math.sqrt(d1); // 0 on the creases between the pebbles
    h[y * W + x] = smooth(0, 0.32, e) * 0.9 + fine(x / W, y / W) * 0.3;
  }
  GRAIN = toTexture(heightToNormal(h, W, W, 1.6), { srgb: false, wrap: true });
  return GRAIN;
}
export function weaveTexture() {
  if (WEAVE) return WEAVE;
  const W = 256, P = 16;
  const h = new Float32Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const cx = Math.floor(x / P), cy = Math.floor(y / P), fx = (x % P) / P, fy = (y % P) / P;
    // warp yarns run in v on the "over" cells, weft yarns in u on the others
    const over = (cx + cy) % 2 === 0;
    const a = over ? Math.sin(fx * Math.PI) : Math.sin(fy * Math.PI);
    const b = over ? Math.sin(fy * Math.PI) : Math.sin(fx * Math.PI);
    h[y * W + x] = a ** 0.6 * (0.55 + 0.45 * b);
  }
  WEAVE = toTexture(heightToNormal(h, W, W, 2.2), { srgb: false, wrap: true });
  return WEAVE;
}
const repTex = (t, n) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(n, n); c.needsUpdate = true; return c; };

// ---------------------------------------------------------------------------
// Team paintwork
export const lum = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
export const SPONSORS = [
  ['NEXOL', '#ffffff', '#111111'], ['VELOX', '#ffd400', '#111111'], ['ZENTEK', '#e2231a', '#ffffff'], ['TURBOMAX', '#111111', '#ffffff'],
  ['BAYO', '#1a4fd6', '#ffffff'], ['KRYO', '#19c3e6', '#0b1a22'], ['RAYO', '#ff7a00', '#111111'], ['AURA', '#6b2bd6', '#ffffff'],
];
// fictional rider surnames for the back of the suit
export const NAMES = ['VARGAS', 'MORENO', 'KAITO', 'LINDQVIST', 'DUCROS', 'BIANCHI', 'OKAFOR', 'ALVES', 'NAKAMURA', 'SCHNEIDER', 'TORRES', 'DUBOIS', 'KOWALSKI', 'HALVORSEN', 'RINALDI', 'SANTOS'];
const FONT = '"Barlow Condensed", Arial, sans-serif';
const BLACK = '#141416';

// dye mottling: a soft tileable noise drawn over the paint
let MOTTLE = null;
function mottle() {
  if (MOTTLE) return MOTTLE;
  const W = 256, n = makeTileFbm(81, 4, 4);
  const { c, g } = makeCanvas(W, W);
  const img = g.createImageData(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const v = 128 + n(x / W, y / W) * 110, i = (y * W + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = clamp(v, 0, 255); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  MOTTLE = c;
  return c;
}

function suitColorMap(res, main, second, accent, number, name, design, stitches) {
  const S = res / ATLAS;
  const { c, g } = makeCanvas(res, res);
  g.setTransform(S, 0, 0, S, 0, 0);
  g.fillStyle = main; g.fillRect(0, 0, ATLAS, ATLAS);
  const C = construction();
  // panels and team graphics
  for (const p of C) if (p.kind === 'side') fillP(g, p.rg, p.pts, design === 1 ? BLACK : second);
  for (const p of graphics(design)) fillP(g, p.rg, p.pts, p.col === 'second' ? second : accent);
  for (const p of C) {
    if (p.kind === 'black') fillP(g, p.rg, p.pts, BLACK);
    if (p.kind === 'seat') fillP(g, p.rg, p.pts, '#111113');
    if (p.kind === 'fabric') fillP(g, p.rg, p.pts, '#1c1d20');
  }
  // perforations: small dark holes on a hex grid
  for (const p of C) {
    if (p.kind !== 'perf') continue;
    inRegion(g, p.rg, () => {
      for (const du of [-1, 0, 1]) { trace(g, p.rg, p.pts, du, true); g.save(); g.clip(); g.fillStyle = 'rgba(0,0,0,0.42)'; for (let y = 0, row = 0; y < ATLAS; y += 7, row++) for (let x = (row % 2) * 3.5; x < ATLAS; x += 7) { g.beginPath(); g.arc(x + 3.5, y + 3.5, 1.25, 0, Math.PI * 2); g.fill(); } g.restore(); }
    });
  }
  // dye: soft mottling, a touch of darkening toward the hem of the seat
  g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.22;
  g.fillStyle = g.createPattern(mottle(), 'repeat'); g.fillRect(0, 0, ATLAS, ATLAS);
  g.restore();
  // seams: a fine dark groove, then the thread of the double stitching (lightening the
  // leather under it, whatever its colour)
  g.save(); g.globalCompositeOperation = 'multiply'; g.strokeStyle = 'rgba(40,40,44,0.55)'; strokeSeams(g, 1.4); g.restore();
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.5; g.drawImage(stitches, 0, 0, ATLAS, ATLAS); g.restore();
  // front zip: dark tape, teeth, the puller at the collar
  const T = REG.torso;
  { const [x0, y0] = at(T, 0.75, 0.3), [, y1] = at(T, 0.75, 0.985);
    g.fillStyle = '#0e0e10'; g.fillRect(x0 - 6, y1, 12, y0 - y1);
    g.fillStyle = '#4a4c50'; for (let y = y1; y < y0; y += 3.2) { g.fillRect(x0 - 3.2, y, 3, 1.6); g.fillRect(x0 + 0.2, y + 1.6, 3, 1.6); }
    g.fillStyle = '#8e9095'; g.beginPath(); g.roundRect(x0 - 5, y1 + 2, 10, 22, 3); g.fill();
    g.fillStyle = '#2a2b2e'; g.fillRect(x0 - 2, y1 + 10, 4, 10); }
  // lettering
  const text = (x, y, sizeM, col, str, rot = 0, mirror = false, font = 'italic 700', maxWM = 9, strokeCol = null) => {
    const size = m2px(sizeM);
    g.save(); g.translate(x, y); g.rotate(rot); if (mirror) g.scale(-1, 1);
    g.font = `${font} ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (strokeCol) { g.lineJoin = 'round'; g.lineWidth = Math.max(2, size * 0.09); g.strokeStyle = strokeCol; g.strokeText(str, 0, 0, m2px(maxWM)); }
    g.fillStyle = col; g.fillText(str, 0, 0, m2px(maxWM)); g.restore();
  };
  const ink = (bg) => (lum(bg) > 0.55 ? '#111111' : '#ffffff');
  const patch = (x, y, wM, hM, sp, rot = 0, mirror = false) => {
    const w = m2px(wM), hh = m2px(hM);
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = sp[1]; g.beginPath(); g.roundRect(-w / 2, -hh / 2, w, hh, Math.min(6, hh * 0.2)); g.fill();
    g.restore();
    text(x, y, hM * 0.74, sp[2], sp[0], rot, mirror, 'italic 800', wM * 0.88);
  };
  const off = (number.charCodeAt(0) + number.length) % SPONSORS.length;
  const SP = (k) => SPONSORS[(off + k) % SPONSORS.length];
  const chestBg = design === 1 ? second : main;
  inRegion(g, T, () => {
    // chest: team mark on the left breast, title sponsor on the right breast, belly sponsor
    { const [x, y] = at(T, 0.84, 0.72); text(x, y, 0.03, ink(chestBg), 'MÍTICO', 0, false, 'italic 800', 0.085); }
    { const [x, y] = at(T, 0.66, 0.72); patch(x, y, 0.075, 0.024, SP(0)); }
    { const [x, y] = at(T, 0.75, 0.37); patch(x, y, 0.13, 0.03, SP(1)); }
    { const [x, y] = at(T, 0.75, 0.255); text(x, y, 0.022, ink(main), SP(2)[0], 0, false, 'italic 700', 0.1); }
    // back: title sponsor under the hump, sponsor on the seat panel
    { const [x, y] = at(T, 0.25, 0.53); patch(x, y, 0.14, 0.034, SP(3)); }
    { const [x, y] = at(T, 0.25, -0.07); text(x, y, 0.024, '#d8d9dc', SP(4)[0], 0, false, 'italic 800', 0.12); }
  });
  // collar: suit colour (the yoke's on the split / bands designs), dark rolled edge and press
  // stud, small sponsor at the front, flag stripe at the back
  { const rg = REG.collar, cc = design === 2 || design === 1 ? second : main;
    fillP(g, rg, [[-0.01, -0.05], [1.01, -0.05], [1.01, 1.05], [-0.01, 1.05]], cc);
    fillP(g, rg, [[-0.01, 0.86], [1.01, 0.86], [1.01, 1.05], [-0.01, 1.05]], '#17181b');
    inRegion(g, rg, () => {
      const [fx, fy] = at(rg, 0.75, 0.45); text(fx, fy, 0.02, ink(cc), SP(5)[0], 0, false, 'italic 800', 0.075);
      const [sx, sy] = at(rg, 0.69, 0.62); g.fillStyle = '#8a8c90'; g.beginPath(); g.arc(sx, sy, 4, 0, Math.PI * 2); g.fill();
      const [bx, by] = at(rg, 0.25, 0.45); g.fillStyle = accent; g.fillRect(bx - 30, by - 8, 20, 16); g.fillStyle = second; g.fillRect(bx - 10, by - 8, 20, 16); g.fillStyle = main; g.fillRect(bx + 10, by - 8, 20, 16);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.strokeRect(bx - 30, by - 8, 60, 16);
    }); }
  // hump: race number, the name under it, piping round the base
  { const rg = REG.hump, hc = design === 1 ? second : main;
    fillP(g, rg, [[-0.01, -0.05], [1.01, -0.05], [1.01, 1.05], [-0.01, 1.05]], hc);
    fillP(g, rg, [[-0.01, -0.05], [1.01, -0.05], [1.01, 0.05], [-0.01, 0.05]], accent);
    inRegion(g, rg, () => {
      const [hx, hy] = at(rg, 0.25, 0.56); text(hx, hy, 0.105, ink(hc), number, 0, false, '800', 0.2, accent);
      const [nx, ny] = at(rg, 0.25, 0.2); text(nx, ny, 0.024, ink(hc), name, 0, false, '700', 0.15);
    }); }
  // limbs (outer side, u .5): sponsors running along the arms and thighs; the left strips
  // are mirrored, so the lettering is flipped there
  for (const s of [-1, 1]) {
    const U = limbReg('upper', s), F = limbReg('fore', s), TH = limbReg('thigh', s);
    inRegion(g, U, () => { const [x, y] = at(U, 0.5, 0.42); patch(x, y, 0.1, 0.024, SP(6), Math.PI / 2, s < 0); });
    inRegion(g, F, () => { const [x, y] = at(F, 0.5, 0.55); patch(x, y, 0.075, 0.019, SP(7), Math.PI / 2, s < 0); });
    inRegion(g, TH, () => {
      const [x, y] = at(TH, 0.5, 0.45); patch(x, y, 0.16, 0.036, SP(2), Math.PI / 2, s < 0);
      const [nx, ny] = at(TH, 0.5, 0.06); text(nx, ny, 0.045, ink(main), number, 0, s < 0, '800', 0.08, accent);
    });
  }
  // wear: fine scuffs where the leather meets the asphalt or the machine (knee and elbow
  // sliders, shoulder, the seat)
  const rr = rng(number.charCodeAt(0) * 7 + design);
  const scuff = (rg, u, t, ru, rt, n) => inRegion(g, rg, () => {
    g.save(); g.globalCompositeOperation = 'screen';
    for (let k = 0; k < n; k++) {
      const [x, y] = at(rg, u + (rr() - 0.5) * ru, t + (rr() - 0.5) * rt), len = 3 + rr() * 14, a = rr() * Math.PI;
      g.strokeStyle = `rgba(255,255,255,${0.03 + rr() * 0.06})`; g.lineWidth = 0.6 + rr() * 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    g.restore();
  });
  for (const s of [-1, 1]) {
    scuff(limbReg('shin', s), 0.42, 0.02, 0.22, 0.14, 40);
    scuff(limbReg('fore', s), 0.75, 0.02, 0.2, 0.12, 30);
    scuff(limbReg('upper', s), 0.5, -0.05, 0.2, 0.15, 20);
  }
  scuff(REG.torso, 0.25, -0.05, 0.3, 0.1, 30);
  return toTexture(c, { wrap: false });
}

// ---------------------------------------------------------------------------
// Helmet paintwork (u: 0/1 back, .25 right, .5 front, .75 left, read from outside;
// v: 1 crown -> base). HB: lower edge of the shell (theta) round the head.
export const HB = (ph) => 2.3 + 0.15 * smooth(0.5, 1.3, Math.abs(ph)) + 0.13 * smooth(1.9, 3.0, Math.abs(ph));
function helmetColorMap(scale, main, second, accent, number, design) {
  const W = 1024, H = 512;
  const { c, g } = makeCanvas(W * scale, H * scale);
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.fillStyle = main; g.fillRect(0, 0, W, H);
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
      for (const cx of [0.5, 0, 1]) {
        g.beginPath(); g.moveTo((cx - 0.22) * W, y + H * 0.2); g.lineTo(cx * W, y); g.lineTo((cx + 0.22) * W, y + H * 0.2);
        g.lineTo((cx + 0.22) * W, y + H * 0.26); g.lineTo(cx * W, y + H * 0.06); g.lineTo((cx - 0.22) * W, y + H * 0.26); g.closePath(); g.fill();
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
    g.fillStyle = accent; g.fillRect(0, H * 0.3, W, H * 0.03);
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
  g.font = `700 90px ${FONT}`; g.lineWidth = 6; g.strokeStyle = accent; g.lineJoin = 'round';
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
  for (let x = 0; x < W; x += 2) { const ph = (0.5 - x / W) * Math.PI * 2; g.fillRect(x, ((HB(ph) - 0.045) / Math.PI) * H, 2, H); }
  return toTexture(c, { wrap: true });
}

// ---------------------------------------------------------------------------
// Materials
// vertex colours the gear material swaps for the team's colours (main, second, accent)
export const TEAM = { main: 0xff00ff, second: 0x00ffff, accent: 0xffff00 };
// visor tints: dark smoke, blue iridium, gold iridium, silver mirror
export const VISORS = [
  { color: 0x0b0d11, metalness: 0.35, roughness: 0.04, iridescence: 0 },
  { color: 0x07090e, metalness: 0.92, roughness: 0.03, iridescence: 1, range: [180, 420] },
  { color: 0x0a0806, metalness: 0.92, roughness: 0.03, iridescence: 1, range: [480, 820] },
  { color: 0x3a3e46, metalness: 0.97, roughness: 0.02, iridescence: 0.25, range: [300, 500] },
];
const TEX = new Map();
const cached = (key, fn) => { if (!TEX.has(key)) TEX.set(key, fn()); return TEX.get(key); };

// race leather: the shared relief + micro grain (or the weave where the ORM marks aramid
// fabric), cavity darkening under direct light, grime ground in by falls
function leatherShader(mat) {
  mat.userData.dirt = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDirt = mat.userData.dirt;
    sh.uniforms.uGrain = { value: grainTexture() };
    sh.uniforms.uWeave = { value: weaveTexture() };
    sh.fragmentShader = `uniform float uDirt;
uniform sampler2D uGrain;
uniform sampler2D uWeave;
float dH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float dN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dH(i), dH(i + vec2(1.0, 0.0)), f.x), mix(dH(i + vec2(0.0, 1.0)), dH(i + 1.0), f.x), f.y); }
` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
      vec4 ormS = texture2D( roughnessMap, vRoughnessMapUv );
      // cavity: seams, stitches and folds also darken a little under direct light
      diffuseColor.rgb *= mix( 1.0, ormS.r, 0.4 );
      float dirtM = 0.0;
      if (uDirt > 0.001) {
        float dm = dN(vMapUv * vec2(48.0, 48.0)) * 0.55 + dN(vMapUv * vec2(150.0, 150.0)) * 0.3 + dN(vMapUv * vec2(460.0, 460.0)) * 0.15;
        dirtM = smoothstep(1.0 - uDirt * 0.95, 1.0 - uDirt * 0.95 + 0.16, dm);
        vec3 grime = mix(vec3(0.16, 0.13, 0.1), vec3(0.11, 0.13, 0.07), step(0.6, dN(vMapUv * vec2(12.0, 12.0))));
        diffuseColor.rgb = mix(diffuseColor.rgb, grime, dirtM * 0.8);
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.95, dirtM);`)
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', `mapN.xy *= normalScale;
      {
        // ~4 cm tiles of pebbled grain (40 cells), or the aramid weave on the stretch panels
        vec2 dUv = vNormalMapUv * ${(ATLAS / PXM / 0.04).toFixed(2)};
        vec2 dL = texture2D( uGrain, dUv ).xy * 2.0 - 1.0;
        vec2 dF = texture2D( uWeave, dUv * 3.4 ).xy * 2.0 - 1.0;
        mapN.xy += mix( dL * 0.22, dF * 0.45, ormS.b );
        mapN = normalize( mapN );
      }`));
  };
  mat.customProgramCacheKey = () => 'rider-leather-v4';
  return mat;
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

// rain soaks the leathers: darker, glossier; wet gloves and boots shine
export function setWet(m, wet) {
  m.suit.color.setScalar(wet ? 0.8 : 1);
  m.suit.roughness = wet ? 0.6 : 1;
  m.suit.sheen = wet ? 0.1 : 0.35;
  m.suit.clearcoat = wet ? 0.5 : 0;
  m.gear.roughness = wet ? 0.32 : 0.5;
  m.gear.clearcoat = wet ? 0.55 : 0.2;
  m.boot.roughness = wet ? 0.22 : 0.36;
}

// Every rider gets its own material instances (per-rider grime and wetness); textures are
// shared per team. hiRes: the suit paint at full atlas resolution (the player's rider, the
// showroom) when the quality allows it.
export function riderMaterials({ livery, number, name, design, visor = 1, hiRes = false }) {
  const q = Save.settings.quality;
  const big = q === 'alto' || q === 'ultra';
  const resRelief = big ? 2048 : 1024, resColor = big && hiRes ? 2048 : 1024;
  // very dark liveries get light secondary panels so the suit still reads
  const main = livery.base;
  let second = livery.second || '#ffffff';
  if (Math.abs(lum(second) - lum(main)) < 0.12) second = lum(main) > 0.5 ? '#16171a' : '#e8e9eb';
  const accent = livery.accent || '#e2231a';
  const key = `${main}|${second}|${accent}|${number}|${name}|${design}`;
  const relief = reliefMaps(resRelief);
  const suitMap = cached(`suit|${key}|${resColor}`, () => suitColorMap(resColor, main, second, accent, number, name, design, relief.stitches));
  const helmetMap = cached(`helmet|${key}|${resColor}`, () => helmetColorMap(resColor / 1024, main, second, accent, number, design));
  const grainGear = cached('grainGear', () => repTex(grainTexture(), 6));
  const grainBoot = cached('grainBoot', () => repTex(grainTexture(), 4));
  const v = VISORS[visor % VISORS.length];
  return {
    // race leather: atlas paint, shared relief + occlusion + roughness, micro grain
    suit: leatherShader(new THREE.MeshPhysicalMaterial({
      map: suitMap, normalMap: relief.normal, roughnessMap: relief.orm, aoMap: relief.orm, aoMapIntensity: 1,
      roughness: 1, metalness: 0, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x4a4a4a),
    })),
    // gloves, armour plates, sliders, soles, helmet trims: vertex-coloured, leather grain;
    // the TEAM placeholder colours become the livery's
    gear: teamGear(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05, normalMap: grainGear, normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 0.2, clearcoatRoughness: 0.5 }), main, second, accent),
    boot: new THREE.MeshPhysicalMaterial({ color: lum(main) < 0.25 ? 0xe9eaec : lum(main) > 0.7 ? 0x16171a : new THREE.Color(main).getHex(), roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.2, normalMap: grainBoot, normalScale: new THREE.Vector2(0.2, 0.2) }),
    helmet: new THREE.MeshPhysicalMaterial({ map: helmetMap, roughness: 0.2, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 }),
    // visor: smoked or iridium mirror with a thin-film colour shift
    visor: new THREE.MeshPhysicalMaterial({ color: v.color, roughness: v.roughness, metalness: v.metalness, iridescence: v.iridescence, iridescenceIOR: 1.9, iridescenceThicknessRange: v.range || [280, 640], envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.0 }),
  };
}
