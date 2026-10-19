// Final drive: sprockets with real tooth form (roller seats on the pitch circle), an O-ring
// chain built link by link (inner plates + rollers, outer plates with rivet heads) wrapped
// round both sprockets on its true path, case-saver cover, chain slider and guard.
import * as THREE from 'three';
import { extrude, circle, cyl, sweep, superellipse, box, place, turned, hexHead, orient } from './geo.js';
import { M } from '../core/materials.js';

const TAU = Math.PI * 2;
export const CHAIN_PITCH = 0.015875; // 520 / 525 / 530 chains: 5/8"

export function teethFor(R) { return Math.max(9, Math.round(Math.PI / Math.asin(CHAIN_PITCH / (2 * R)))); }

// Sprocket in the wheel plane (axis Z), pitch radius R: roller seats + rounded tips,
// lightening windows, centre bore
export function sprocketGeo(R, teeth = 0, holes = 6, thick = 0.0065) {
  const N = teeth || teethFor(R);
  const rs = 0.0054, tip = R + 0.0062;
  const out = [];
  for (let k = 0; k < N; k++) {
    const th = (k / N) * TAU;
    const c = [Math.cos(th) * R, Math.sin(th) * R];
    for (let j = 0; j <= 4; j++) {
      const d = 1.25 - (2.5 * j) / 4;
      const f = th + Math.PI + d;
      out.push([c[0] + Math.cos(f) * rs, c[1] + Math.sin(f) * rs]);
    }
    const tm = th + Math.PI / N;
    for (const dt of [-0.22, 0.22]) { const t = tm + (dt * Math.PI) / N; out.push([Math.cos(t) * tip, Math.sin(t) * tip]); }
  }
  const hl = [circle(0.026, 20)];
  const rin = 0.048, rout = R - 0.022;
  if (holes && rout > rin + 0.018) {
    const web = 0.011;
    for (let k = 0; k < holes; k++) {
      const a0 = (k / holes) * TAU, a1 = ((k + 1) / holes) * TAU;
      const h = [];
      const o0 = a0 + web / rout, o1 = a1 - web / rout, i0 = a0 + web / rin, i1 = a1 - web / rin;
      for (let j = 0; j <= 10; j++) { const a = o0 + (o1 - o0) * (j / 10); h.push([Math.cos(a) * rout, Math.sin(a) * rout]); }
      for (let j = 0; j <= 6; j++) { const a = i1 + (i0 - i1) * (j / 6); h.push([Math.cos(a) * rin, Math.sin(a) * rin]); }
      hl.push(h.reverse());
    }
    // carrier bolt holes
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + Math.PI / 6; hl.push(circle(0.0045, 8, Math.cos(a) * 0.062, Math.sin(a) * 0.062)); }
  }
  return extrude(out, thick, { holes: hl, bevel: 0.0006, curveSegments: 2 });
}

// The chain's closed path round two sprockets (bike space x/y), sampled at the pitch.
function chainPins(F, rf, Rr, rr) {
  const D = [Rr[0] - F[0], Rr[1] - F[1]], d = Math.hypot(D[0], D[1]);
  const phi = Math.atan2(D[1], D[0]);
  const ac = Math.acos((rf - rr) / d);
  const psiU = phi - ac, psiL = phi + ac; // tangent normals: upper / lower run
  const P = (C, r, a) => [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r];
  // segments: upper run F->R, rear wrap (psiU -> psiL the long way round the back), lower run R->F, front wrap
  const segs = [];
  const tfU = P(F, rf, psiU), trU = P(Rr, rr, psiU), trL = P(Rr, rr, psiL), tfL = P(F, rf, psiL);
  segs.push({ kind: 'line', a: tfU, b: trU, len: Math.hypot(trU[0] - tfU[0], trU[1] - tfU[1]) });
  // rear wrap: from psiU increasing to psiL (+2PI if needed) passing angle PI (the back)
  let r0 = psiU, r1 = psiL;
  while (r1 < r0) r1 += TAU;
  if (!(r0 < Math.PI && r1 > Math.PI) && !(r0 < Math.PI + TAU && r1 > Math.PI + TAU)) { r1 = psiL - TAU; }
  segs.push({ kind: 'arc', C: Rr, r: rr, a0: r0, a1: r1, len: Math.abs(r1 - r0) * rr });
  segs.push({ kind: 'line', a: trL, b: tfL, len: Math.hypot(tfL[0] - trL[0], tfL[1] - trL[1]) });
  let f0 = psiL, f1 = psiU;
  while (f1 < f0) f1 += TAU;
  segs.push({ kind: 'arc', C: F, r: rf, a0: f0, a1: f1, len: Math.abs(f1 - f0) * rf });
  const L = segs.reduce((s, q) => s + q.len, 0);
  const n = Math.round(L / CHAIN_PITCH);
  const step = L / n;
  const pins = [];
  for (let i = 0; i < n; i++) {
    let s = i * step;
    for (const q of segs) {
      if (s <= q.len + 1e-9) {
        const t = q.len ? s / q.len : 0;
        if (q.kind === 'line') pins.push([q.a[0] + (q.b[0] - q.a[0]) * t, q.a[1] + (q.b[1] - q.a[1]) * t]);
        else { const a = q.a0 + (q.a1 - q.a0) * t; pins.push(P(q.C, q.r, a)); }
        break;
      }
      s -= q.len;
    }
  }
  return pins;
}

// dog-bone side plate, pins at (0,0) and (p,0), local frame
let _plateIn = null, _plateOut = null;
function plate(outer) {
  if (outer && _plateOut) return _plateOut;
  if (!outer && _plateIn) return _plateIn;
  const p = CHAIN_PITCH, re = outer ? 0.0068 : 0.0072, waist = outer ? 0.0052 : 0.0056;
  const pts = [];
  for (let i = 0; i <= 5; i++) { const a = Math.PI * 0.62 + (i / 5) * Math.PI * 0.76; pts.push([Math.cos(a) * re, Math.sin(a) * re]); }
  pts.push([p * 0.5, -waist]);
  for (let i = 0; i <= 5; i++) { const a = -Math.PI * 0.38 + (i / 5) * Math.PI * 0.76; pts.push([p + Math.cos(a) * re, Math.sin(a) * re]); }
  pts.push([p * 0.5, waist]);
  const g = extrude(pts, 0.0013, { bevel: 0, curveSegments: 1 });
  if (outer) _plateOut = g; else _plateIn = g;
  return g;
}

/**
 * Chain on the left (z < 0). F: front sprocket centre (chassis), rear sprocket on the rear
 * wheel. o: { rearR, frontR, z, gold, guard, slider }
 */
export function chainDrive(ctx, o = {}) {
  const A = ctx.A;
  const z = o.z ?? -(ctx.rear.w / 2 + 0.012);
  const [px, py] = ctx.pivot;
  const F = [px + 0.065, py + 0.018];
  const Rr = [ctx.rear.x, ctx.rear.y];
  const rr = o.rearR ?? 0.1, rf = o.frontR ?? 0.04;
  const pins = chainPins(F, rf, Rr, rr);
  const n = pins.length;
  const inMat = M.steel(0x55585e), outMat = o.gold ? M.gold() : M.steel(0x8a8e94);
  for (let i = 0; i < n; i++) {
    const a = pins[i], b = pins[(i + 1) % n];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const outer = i % 2 === 1;
    for (const s of [-1, 1]) {
      const g = plate(outer).clone();
      g.rotateZ(ang);
      g.translate(a[0], a[1], z + s * (outer ? 0.0071 : 0.0049));
      A.add('swingarm', g, outer ? outMat : inMat);
    }
    // roller on every pin, rivet heads on the outer links
    const rl = cyl(0.0051, 0.0051, 0.0085, 8, 'z', true); rl.translate(a[0], a[1], z);
    A.add('swingarm', rl, inMat);
    if (outer) {
      for (const p of [a, b]) for (const s of [-1, 1]) {
        const h = cyl(0.0027, 0.0029, 0.0016, 6, 'z'); h.translate(p[0], p[1], z + s * 0.0087);
        A.add('swingarm', h, M.steel(0xb4b8be));
      }
    }
  }
  // front sprocket + its nut on the output shaft, under a case-saver cover
  const fsp = sprocketGeo(rf, 0, 0, 0.008); fsp.translate(F[0], F[1], z);
  A.add('chassis', fsp, M.steel(0x5f6268));
  const nut = hexHead(0.024, 0.008); nut.rotateY(Math.PI); nut.translate(F[0], F[1], z - 0.004);
  A.add('chassis', nut, M.steel(0x8d9197));
  if (o.cover !== false) {
    const cv = [];
    for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU; const r = 0.062 + 0.012 * Math.cos(a - 0.6) + 0.008 * Math.cos(2 * a); cv.push([Math.cos(a) * r, Math.sin(a) * r * 0.92]); }
    const g = extrude(cv, 0.008, { bevel: 0.004, bevelSeg: 2, curveSegments: 1 });
    g.translate(F[0] + 0.012, F[1] + 0.012, z - 0.022);
    A.add('chassis', g, M.plastic(0x141416));
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.5; const b = capScrewSmall(); b.translate(F[0] + 0.012 + Math.cos(a) * 0.055, F[1] + 0.012 + Math.sin(a) * 0.05, z - 0.0275); A.add('chassis', b, M.steel(0x8d9197)); }
  }
  // chain slider on the swingarm leading edge, and the upper guard near the rear sprocket
  const up0 = pins[0], up1 = pins[Math.max(1, Math.floor(n * 0.36))];
  if (o.slider !== false) {
    const sl = sweep([[px + 0.02, py + 0.03, z], [px - 0.1, py + 0.01, z], [px - 0.2, py - 0.0, z]], () => superellipse(0.006, 0.012, 2.6, 10), { segments: 6, up: [0, 1, 0] });
    A.add('swingarm', sl, M.plastic(0x101012));
  }
  if (o.guard !== false) {
    const ga = [up0[0] + (Rr[0] - up0[0]) * 0.55, up0[1] + 0.022 + (Rr[1] + rr - up0[1]) * 0.55, z];
    const gb = [Rr[0] + 0.03, Rr[1] + rr + 0.02, z];
    const g = sweep([ga, [(ga[0] + gb[0]) / 2, (ga[1] + gb[1]) / 2 + 0.002, z], gb], () => [[0.0, -0.016], [0.004, -0.016], [0.004, 0.014], [-0.012, 0.016], [-0.012, 0.012], [0.0, 0.01]], { segments: 6, up: [0, 1, 0] });
    A.add('swingarm', g, M.plastic(0x101012));
  }
  void up1;
  return { z, r: rr };
}
function capScrewSmall() { const g = cyl(0.0045, 0.0045, 0.004, 10, 'z'); return g; }

// Toothed belt (cruisers, the electric): flat belt with tooth ridges round both pulleys
export function beltDrive(ctx, o = {}) {
  const A = ctx.A;
  const z = o.z ?? -(ctx.rear.w / 2 + 0.015);
  const [px, py] = ctx.pivot;
  const F = [px + 0.04, py + 0.01];
  const Rr = [ctx.rear.x, ctx.rear.y];
  const rr = o.rearR ?? 0.13, rf = o.frontR ?? 0.05;
  const pins = chainPins(F, rf + 0.003, Rr, rr + 0.003);
  const n = pins.length;
  const pts = pins.map(([x, y]) => [x, y, z]);
  const mat = M.rubber();
  for (let i = 0; i < n; i++) {
    const a = pins[i], b = pins[(i + 1) % n];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const seg = box(Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.0006, 0.0045, 0.03);
    seg.rotateZ(ang); seg.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
    A.add('swingarm', seg, mat);
  }
  void pts;
  return { z, r: rr };
}

export { orient, turned, place };
