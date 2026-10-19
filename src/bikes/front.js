// Front end at close-up fidelity: telescopic forks (upside-down cartridge forks with
// forged axle feet, conventional forks with cast sliders), sculpted triple clamps with
// pinch bolts and the steering stem nut, adjuster caps. Bike space, built along the fork
// line ctx.fp(t, z) (t = distance from the axle up the fork).
import * as THREE from 'three';
import { revolve, turned, extrude, circle, hexHead, capScrew, orient, rod, cyl, box, place, sweep, superellipse } from './geo.js';
import { M } from '../core/materials.js';

// a turned part along the fork axis from t0 (profile h = 0) at lateral z
function alongFork(ctx, profile, t0, z, seg = 28) {
  const g = revolve(profile, seg, 'y');
  const p = ctx.fp(t0, z);
  return orient(g.rotateX(Math.PI / 2), p, [ctx.d.x, ctx.d.y, 0]);
}

// Clamp plate perpendicular to the fork axis at distance t: tubes at ±fw, stem behind.
function clampGeo(ctx, t, th, tubeR, { stemR = 0.03, lug = 0.011 } = {}) {
  const fw = ctx.fw, off = ctx.offset;
  const rc = tubeR + lug;
  const out = [];
  const arc = (cx, cy, r, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  arc(0, fw, rc, -0.35, Math.PI, 14); // right tube: front -> outer -> back
  out.push([-off - stemR * 0.9, fw * 0.42]);
  arc(-off, 0, stemR + 0.006, Math.PI * 0.62, Math.PI * 1.38, 8); // round the stem
  out.push([-off - stemR * 0.9, -fw * 0.42]);
  arc(0, -fw, rc, Math.PI, Math.PI * 2 + 0.35, 14); // left tube: back -> outer -> front
  out.push([rc * 0.62, -fw * 0.35], [rc * 0.5, 0], [rc * 0.62, fw * 0.35]); // concave front edge
  const g = extrude(out, th, { bevel: Math.min(0.004, th * 0.2), bevelSeg: 2, curveSegments: 4 });
  // local (u fwd, v lateral, w along the fork) -> bike: u -> n, v -> -z, w -> d
  const c = ctx.fp(t);
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(ctx.n.x, ctx.n.y, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(ctx.d.x, ctx.d.y, 0));
  g.applyMatrix4(m);
  g.translate(c[0], c[1], 0);
  return g;
}

export function fork(ctx, o = {}) {
  const { A } = ctx;
  const type = o.type || 'usd';
  const fw = ctx.fw;
  const Lf = ctx.Lf;
  const top = Lf + ctx.headLen + (o.extra ?? 0.04);
  const fp = ctx.fp;
  const outerMat = o.outerMat || (type === 'usd' ? M.anodized(0x1d1f22) : M.aluminum());
  const innerMat = o.innerMat || (type === 'usd' ? M.gold() : M.chrome());
  const footMat = o.footMat || M.anodized(o.footColor ?? 0x1b1c1f);
  const capMat = M.anodized(o.capColor ?? 0xd4a431);
  ctx.forkFootMat = footMat;
  const clampMat = o.clampMat || M.anodized(0x2a2c30);
  const outerR = o.outerR ?? 0.0295, innerR = o.innerR ?? 0.0215;
  ctx.forkTubeR = type === 'usd' ? outerR : (o.stanchionR ?? 0.022);
  for (const z of [-fw, fw]) {
    const sz = Math.sign(z);
    if (type === 'usd') {
      // inner tube (stanchion) from the foot up into the outer tube
      A.add('forkSlider', alongFork(ctx, [[innerR, 0], [innerR, 0.4]], 0.06, z, 28), innerMat);
      // forged axle foot: boss round the axle, tapered body up to the tube, caliper lugs
      const foot = turned([[0.0001, 0], [innerR + 0.0045, 0], [innerR + 0.0055, 0.03], [innerR + 0.004, 0.075], [innerR + 0.0015, 0.09], [0.0001, 0.09]], 24, 'y');
      orient(foot.rotateX(Math.PI / 2), fp(0.0, z), [ctx.d.x, ctx.d.y, 0]);
      A.add('forkSlider', foot, footMat);
      const boss = turned([[0.0001, -0.026], [0.024, -0.026], [0.027, -0.022], [0.027, 0.022], [0.024, 0.026], [0.0001, 0.026]], 28, 'z');
      boss.translate(ctx.front.x, ctx.front.y, z);
      A.add('forkSlider', boss, footMat);
      // axle pinch slit + two pinch bolts on the front of the foot
      for (const k of [-1, 1]) {
        const b = capScrew(0.0085, 0.008);
        const p = [ctx.front.x + ctx.n.x * 0.026 + ctx.d.x * 0.0, ctx.front.y + ctx.n.y * 0.026 - 0.0, z + k * 0.012];
        orient(b, p, [ctx.n.x, ctx.n.y, 0]);
        A.add('forkSlider', b, M.steel(0x9a9ea4));
      }
      // axle end: hex on the right, pinch on the left
      if (sz > 0) { const h = hexHead(0.024, 0.01); h.translate(0, 0, 0); orient(h, [ctx.front.x, ctx.front.y, z + 0.026], [0, 0, 1]); A.add('forkSlider', h, M.machined()); }
      // outer tube: dust seal, wiper chamfer, main body (clamped twice), top cap
      const H = top - 0.3;
      A.add('steer', alongFork(ctx, [
        [innerR + 0.0005, -0.004], [innerR + 0.0042, -0.002], [innerR + 0.0048, 0.006], [outerR - 0.0015, 0.008], // seal
        [outerR + 0.0009, 0.016], [outerR + 0.0009, 0.05], [outerR + 0.0004, 0.07], [outerR, H * 0.55], [outerR - 0.0006, H - 0.004], [outerR - 0.0018, H],
      ], 0.3, z, 32), outerMat);
      A.add('steer', alongFork(ctx, [[innerR + 0.0005, -0.0045], [outerR - 0.001, -0.0045], [outerR - 0.001, 0.008], [innerR + 0.0005, 0.008]], 0.3, z, 28), M.rubber());
      // top cap: big hex, preload adjuster hex, rebound screw
      A.add('steer', alongFork(ctx, [[0.0001, 0], [outerR - 0.003, 0], [outerR - 0.003, 0.004], [0.0001, 0.004]], top, z, 24), capMat);
      const hx = hexHead(0.034, 0.009); orient(hx, fp(top + 0.003, z), [ctx.d.x, ctx.d.y, 0]); A.add('steer', hx, capMat);
      const pre = hexHead(0.019, 0.008); orient(pre, fp(top + 0.011, z), [ctx.d.x, ctx.d.y, 0]); A.add('steer', pre, M.machined());
      A.add('steer', alongFork(ctx, [[0.0001, 0], [0.0062, 0], [0.0062, 0.006], [0.005, 0.0075], [0.0001, 0.0075]], top + 0.018, z, 14), M.gold());
      // compression adjuster at the foot bottom
      const ca = turned([[0.0001, 0], [0.007, 0], [0.007, 0.004], [0.0001, 0.004]], 12, 'y');
      orient(ca.rotateX(Math.PI / 2), fp(-0.028, z), [-ctx.d.x, -ctx.d.y, 0]);
      A.add('forkSlider', ca, M.gold());
    } else if (type === 'conv' || type === 'cruiser' || type === 'mx') {
      const lowerR = o.lowerR ?? (type === 'cruiser' ? 0.034 : 0.03);
      const stR = o.stanchionR ?? 0.022;
      const lowerLen = o.lowerLen ?? 0.34;
      const lowerMat = o.lowerMat || (type === 'cruiser' ? M.chrome() : M.aluminum());
      // cast slider: axle lug at the bottom, body, seal holder lip at the top
      A.add('forkSlider', alongFork(ctx, [
        [0.0001, -0.035], [lowerR * 0.8, -0.035], [lowerR, -0.02], [lowerR, 0.02], [lowerR * 0.97, 0.06], [lowerR * 0.94, lowerLen - 0.03],
        [lowerR * 0.98, lowerLen - 0.022], [lowerR * 0.98, lowerLen - 0.006], [stR + 0.004, lowerLen], [stR + 0.001, lowerLen + 0.002],
      ], -0.0, z, 30), lowerMat);
      A.add('forkSlider', alongFork(ctx, [[stR + 0.0003, 0], [stR + 0.0045, 0.001], [stR + 0.0045, 0.008], [stR + 0.0003, 0.009]], lowerLen + 0.001, z, 24), M.rubber());
      const boss = turned([[0.0001, -0.024], [0.022, -0.024], [0.025, -0.02], [0.025, 0.02], [0.022, 0.024], [0.0001, 0.024]], 24, 'z');
      boss.translate(ctx.front.x, ctx.front.y, z);
      A.add('forkSlider', boss, lowerMat);
      for (const k of [-1, 1]) {
        const b = hexHead(0.012, 0.007);
        orient(b, [ctx.front.x - ctx.n.x * 0.024, ctx.front.y - ctx.n.y * 0.024, z + k * 0.012], [-ctx.n.x, -ctx.n.y, 0]);
        A.add('forkSlider', b, M.steel(0x9a9ea4));
      }
      // stanchion
      A.add('steer', alongFork(ctx, [[stR, 0], [stR, top - (lowerLen - 0.06)]], lowerLen - 0.06, z, 28), innerMat);
      if (type === 'cruiser' && o.gaiters) {
        const gp = [];
        for (let i = 0; i <= 16; i++) gp.push([stR + 0.012 + (i % 2 ? 0.006 : 0), (i / 16) * 0.12]);
        A.add('steer', alongFork(ctx, gp, lowerLen, z, 24), M.rubber());
      }
      // chrome / alloy cap nut on top
      A.add('steer', alongFork(ctx, [[0.0001, 0], [stR - 0.001, 0], [stR - 0.001, 0.006], [stR - 0.004, 0.01], [0.0001, 0.011]], top, z, 20), o.capMat || M.chrome());
      if (type === 'mx') {
        // fork guards
        const gd = box(0.04, 0.24, 0.02, 0.008);
        place(gd, { p: fp(0.18, z + Math.sign(z) * 0.01), r: [0, 0, ctx.rake] });
        A.add('forkSlider', gd, o.guardMat || M.plastic(0xf2f2f2));
      }
    } else if (type === 'springer') {
      // springer: rigid rear legs + front legs + exposed springs
      A.add('steer', rod(fp(0.0, z), fp(top, z), 0.016, 14), M.chrome());
      const back = (t) => { const p = fp(t, z); return [p[0] - ctx.n.x * 0.06, p[1] - ctx.n.y * 0.06, z]; };
      A.add('steer', rod(back(0.0), back(top), 0.018, 14), M.black());
      A.add('steer', spring2(back(top - 0.25), back(top - 0.02), 0.022, 0.005, 8), M.chrome());
      for (const t of [0.02, top - 0.02]) { const b = hexHead(0.016, 0.008); orient(b, [back(t)[0], back(t)[1], z + Math.sign(z) * 0.018], [0, 0, Math.sign(z)]); A.add('steer', b, M.chrome()); }
    }
  }
  // triple clamps
  const tubeR = type === 'usd' ? outerR : (o.stanchionR ?? 0.022);
  if (type !== 'springer') {
    A.add('steer', clampGeo(ctx, Lf - 0.005, 0.036, tubeR, { stemR: 0.032, lug: 0.012 }), clampMat);
    A.add('steer', clampGeo(ctx, Lf + ctx.headLen + 0.012, 0.024, tubeR, { stemR: 0.03, lug: 0.01 }), o.topClampMat || clampMat);
    // pinch bolts on the clamp ears (lateral, at the back of each tube bore)
    for (const s of [-1, 1]) {
      for (const [t, k] of [[Lf - 0.016, 2], [Lf + ctx.headLen + 0.012, 1]]) {
        for (let i = 0; i < k; i++) {
          const p = ctx.fp(t + (k > 1 ? (i - 0.5) * 0.016 : 0), s * fw);
          const q = [p[0] - ctx.n.x * (tubeR + 0.008), p[1] - ctx.n.y * (tubeR + 0.008), s * (fw + tubeR * 0.55)];
          const b = capScrew(0.008, 0.007); orient(b, q, [0, 0, s]); A.add('steer', b, M.steel(0x8d9197));
        }
      }
    }
    // steering stem nut on the top clamp
    const sn = ctx.sp(Lf + ctx.headLen + 0.024);
    const nut = turned([[0.0001, 0], [0.024, 0], [0.024, 0.008], [0.02, 0.012], [0.012, 0.012], [0.012, 0.006], [0.0001, 0.006]], 6, 'y');
    orient(nut.rotateX(Math.PI / 2), sn, [ctx.d.x, ctx.d.y, 0]);
    A.add('steer', nut, M.machined());
  } else {
    // springer: forged girder plates
    for (const [t, h] of [[Lf, 0.03], [Lf + ctx.headLen, 0.026]]) {
      const c = ctx.sp(t), f = fp(t);
      const g = box(ctx.offset + 0.08, h, fw * 2 + 0.07, 0.01);
      place(g, { p: [(c[0] + f[0]) / 2, (c[1] + f[1]) / 2, 0], r: [0, 0, ctx.rake] });
      A.add('steer', g, clampMat);
    }
  }
  // axle
  const ax = cyl(0.0125, 0.0125, fw * 2 + 0.052, 16, 'z');
  place(ax, { p: [ctx.front.x, ctx.front.y, 0] });
  A.add('forkSlider', ax, M.machined());
}

// helical spring (local copy to avoid a cycle with parts.js)
function spring2(a, b, radius, wire, turns) {
  const pts = [];
  const N = turns * 16;
  for (let i = 0; i <= N; i++) { const t = i / N, ang = t * turns * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(ang) * radius, t, Math.sin(ang) * radius)); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, wire, 6, false);
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A);
  g.applyMatrix4(new THREE.Matrix4().makeScale(1, dir.length(), 1));
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())));
  g.translate(A.x, A.y, A.z);
  return g;
}

export { sweep, superellipse };
