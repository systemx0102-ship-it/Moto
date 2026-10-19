// Reusable motorcycle components. All coordinates are bike space
// (x forward, y up, z right; ground y=0) unless noted as wheel-local.
import * as THREE from 'three';
import { loft, loftProfile, tube, taperTube, lathe, box, cyl, sphere, place, rod, between, spring, ring, torus, mirrorZ, flipGeometry, revolve, turned, sweep, superellipse, roundRect, circle, extrude, hexHead, capScrew, orient, merge } from './geo.js';
import { M } from '../core/materials.js';
import { tyreGeo, knobsGeo, rimGeo, rimLipGeo, spokeGeo, hubGeo, rotor, caliperGeo } from './wheels.js';
import { sprocketGeo, chainDrive, beltDrive } from './drive.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

function area2(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
// Closed profile for solid lathe parts (CCW in r,h plane = outward normals)
export function closedLathe(pts, seg = 32, axis = 'z') {
  const p = pts.slice();
  if (area2(p) < 0) p.reverse();
  p.push(p[0]);
  return lathe(p, seg, axis);
}

// ---------------------------------------------------------------------------
// Frame geometry setup: wheels, steering head, groups.
export function setupChassis(ctx) {
  const { A, m } = ctx;
  const wb = m.wb;
  ctx.rear = { x: -wb / 2, y: m.rear.R, ...m.rear };
  ctx.front = { x: wb / 2, y: m.front.R, ...m.front };
  ctx.rake = m.rake * DEG;
  ctx.offset = m.forkOffset ?? 0.032;
  ctx.Lf = m.forkLen ?? 0.56;
  ctx.headLen = m.headLen ?? 0.15;
  ctx.fw = m.forkWidth ?? Math.max(0.085, ctx.front.w / 2 + 0.045);
  const r = ctx.rake;
  ctx.d = V(-Math.sin(r), Math.cos(r)); // fork direction (up)
  ctx.n = V(Math.cos(r), Math.sin(r)); // perpendicular, forward
  // fork line point at distance t from axle
  ctx.fp = (t, z = 0) => [ctx.front.x + ctx.d.x * t, ctx.front.y + ctx.d.y * t, z];
  // steering axis point at t
  ctx.sp = (t, z = 0) => [ctx.front.x + ctx.d.x * t - ctx.n.x * ctx.offset, ctx.front.y + ctx.d.y * t - ctx.n.y * ctx.offset, z];
  const H = ctx.sp(ctx.Lf);
  ctx.head = H; // bottom of the head tube
  ctx.headTop = ctx.sp(ctx.Lf + ctx.headLen);
  ctx.pivot = m.pivot || [-0.16, 0.44];
  A.addGroup('steer', 'chassis', [H[0], H[1], 0], [0, 0, r]);
  // slider: axle in steer-local coordinates
  const ax = ctx.front.x - H[0], ay = ctx.front.y - H[1];
  const lx = ax * Math.cos(-r) - ay * Math.sin(-r), ly = ax * Math.sin(-r) + ay * Math.cos(-r);
  A.addGroup('forkSlider', 'steer', [lx, ly, 0]);
  A.addGroup('frontWheel', 'forkSlider');
  A.addGroup('swingarm', 'chassis', [ctx.pivot[0], ctx.pivot[1], 0]);
  A.addGroup('rearWheel', 'swingarm', [ctx.rear.x - ctx.pivot[0], ctx.rear.y - ctx.pivot[1], 0]);
  ctx.exhausts = [];
  ctx.headlights = [];
  ctx.tails = [];
}

// ---------------------------------------------------------------------------
// Wheels (wheel-local: axle at origin, axis = Z)
export function wheel(ctx, group, w) {
  const { A } = ctx;
  const R = w.R, rimR = w.rim, tw = w.w;
  const style = w.style || 'cast';
  const rimW = w.rimW ?? tw * (w.knobby ? 0.5 : 0.76);
  // tyre
  A.add(group, tyreGeo(R, rimR, tw, rimW, { knobby: !!w.knobby }), M.tire(!!w.knobby), { local: true });
  if (w.knobby) for (const g of knobsGeo(R, tw, rimR)) A.add(group, g, M.tire(true), { local: true });
  // rim
  const rimMat = w.rimMat || ctx.mats.wheel;
  A.add(group, rimGeo(rimR, rimW), rimMat, { local: true });
  if (style === 'cast' || style === 'split') {
    for (const g of rimLipGeo(rimR, rimW)) A.add(group, g, M.machined(), { local: true });
  }
  if (w.rimStripe) {
    // pinstripe painted on the outer face of each rim flange (outside the tyre bead)
    for (const sz of [-1, 1]) {
      const g = ring(rimR + 0.0045, rimR + 0.0095, 128);
      if (sz < 0) g.rotateY(Math.PI);
      g.translate(0, 0, sz * (rimW / 2 + 0.0083));
      A.add(group, g, w.rimStripe, { local: true });
    }
  }
  // valve stem with its cap
  const vs = turned([[0.0001, 0], [0.0042, 0], [0.0042, 0.016], [0.0035, 0.018], [0.0035, 0.03], [0.0001, 0.03]], 10, 'y');
  vs.translate(0, -(rimR - 0.04), 0); vs.rotateZ(0.9);
  A.add(group, vs, M.steel(0x9a9ea4), { local: true });
  // hub
  const hw = w.hubW ?? Math.max(0.05, tw * 0.42);
  const front = group === 'frontWheel';
  const hubMat = style === 'wire' ? M.cast(0xb8bcc2) : rimMat;
  for (const g of hubGeo(hw, { discFlange: w.discs ? w.discs.length : 0, carrier: !!w.sprocket })) A.add(group, g, hubMat, { local: true });
  A.add(group, cyl(0.018, 0.018, hw * 2 + 0.03, 16, 'z'), M.machined(), { local: true });
  for (const s of [-1, 1]) {
    const nut = hexHead(0.034, 0.012); if (s < 0) nut.rotateY(Math.PI); nut.translate(0, 0, s * (hw + 0.016));
    A.add(group, nut, M.steel(0x8d9197), { local: true });
  }
  const inner = rimR - 0.022;
  if (style === 'cast' || style === 'split') {
    const n = w.spokes || 5;
    const sweepA = w.sweep ?? 0.25;
    const split = style === 'split';
    const width = w.spokeW ?? (split ? 0.019 : 0.026);
    const depth = w.spokeT ?? 0.022;
    for (let i = 0; i < n; i++) {
      const base = (i / n) * Math.PI * 2;
      if (split) {
        const spread = Math.min(0.16, (Math.PI / n) * 0.32);
        for (const s of [-1, 1]) A.add(group, spokeGeo(0.046, inner, base, base + s * spread + sweepA * 0.5, { width, depth, bend: s * 0.02 }), rimMat, { local: true });
      } else {
        A.add(group, spokeGeo(0.046, inner, base, base + sweepA, { width, depth, bend: sweepA * 0.25 }), rimMat, { local: true });
      }
    }
  } else if (style === 'wire') {
    const n = w.spokes || 36;
    // laced hub flanges
    for (const s of [-1, 1]) {
      const fl = turned([[0.03, -0.004], [0.052, -0.004], [0.055, 0], [0.052, 0.004], [0.03, 0.004]], 32, 'z');
      fl.translate(0, 0, s * hw * 0.82);
      A.add(group, fl, M.cast(0xc4c8cc), { local: true });
    }
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const side = i % 2 ? 1 : -1;
      const cross = (i % 4 < 2 ? 1 : -1) * 0.42;
      const h0 = [Math.cos(a + cross) * 0.048, Math.sin(a + cross) * 0.048, side * hw * 0.82];
      const r0 = [Math.cos(a) * (rimR - 0.012), Math.sin(a) * (rimR - 0.012), side * 0.006];
      A.add(group, rod(h0, r0, 0.0021, 5), M.chrome(), { local: true });
      // nipple at the rim
      const nip = cyl(0.0033, 0.0033, 0.012, 6, 'y');
      const d = [r0[0] - h0[0], r0[1] - h0[1], r0[2] - h0[2]];
      orient(nip.rotateX(Math.PI / 2), [r0[0] - d[0] * 0.03, r0[1] - d[1] * 0.03, r0[2] - d[2] * 0.03], d);
      A.add(group, nip, M.steel(0xb0b4b9), { local: true });
    }
  } else if (style === 'disc') {
    A.add(group, closedLathe([[0.05, -hw * 0.7], [inner + 0.01, -0.012], [inner + 0.01, 0.012], [0.05, hw * 0.7]], 48), rimMat, { local: true });
  } else if (style === 'hubless') {
    const rr = rimR;
    A.add(group, closedLathe([
      [rr + 0.008, -rimW / 2], [rr - 0.06, -rimW / 2], [rr - 0.075, -rimW / 3], [rr - 0.075, rimW / 3], [rr - 0.06, rimW / 2], [rr + 0.008, rimW / 2], [rr - 0.004, 0],
    ], 64), rimMat, { local: true });
    A.add(group, closedLathe([[rr - 0.076, -rimW * 0.12], [rr - 0.082, -rimW * 0.12], [rr - 0.082, rimW * 0.12], [rr - 0.076, rimW * 0.12]], 64), ctx.mats.neon, { local: true });
  }
  // brake rotors (spin with the wheel)
  if (w.discs) {
    for (const d of w.discs) {
      const st = d.style === 'plain' ? 'carbon' : d.style || 'drilled';
      rotor(A, group, d.z, d.r, { style: st, carrier: d.carrier || '#c9a227', float: front && st !== 'carbon' ? true : front, band: st === 'carbon' ? d.r * 0.3 : undefined });
    }
  }
  if (w.sprocket) {
    const s = w.sprocket;
    const g = sprocketGeo(s.r, s.teeth ?? 0, s.holes ?? 6, 0.0065);
    g.translate(0, 0, s.z);
    A.add(group, g, M.anodized(s.color ?? 0x8a8f96), { local: true });
    // carrier nuts
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const b = hexHead(0.012, 0.007); b.rotateY(Math.PI); b.translate(Math.cos(a) * 0.062, Math.sin(a) * 0.062, s.z - 0.0035);
      A.add(group, b, M.steel(0x8d9197), { local: true });
    }
  }
}

// Brake caliper near a disc (bike space): radial monobloc
export function caliper(ctx, group, axle, discR, z, angleDeg, color = 0xc81e1e, size = 1) {
  caliperGeo(ctx, group, axle, discR, z, angleDeg, color, size, { pistons: size < 0.9 ? 1 : 2 });
}

// ---------------------------------------------------------------------------
// Front forks: see front.js
export { fork } from './front.js';
export { handlebar, dash, mirror } from './cockpit.js';

// Front mudguard (moves with wheel)
// Moulded fender shell around a wheel: a crowned arch hugging the tyre with skirts
// that deepen mid-span and narrowing ends. Angle t runs from the bottom toward the
// front (t = PI is the top). Built as outer + inner skin so it reads from both sides.
function archFender(ctx, wheelPos, o, defGroup, defMat) {
  const R = o.R, w = o.w;
  const t0 = o.from, len = o.len;
  const crown = o.crown ?? w * 0.22;
  const skirt = o.skirts ?? 0.035;
  const endW = o.endW ?? 0.6;
  const nu = 32, nv = 16;
  const build = (off, flip) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const t = t0 + len * u;
      const env = Math.sin(Math.PI * u);
      const hw = (w / 2) * (endW + (1 - endW) * Math.pow(env, 0.45));
      const sk = skirt * Math.pow(env, 0.6) + 0.004;
      const prof = [[R - sk, -hw * 0.96]];
      for (let j = 0; j <= nv; j++) { const a = -Math.PI / 2 + (Math.PI * j) / nv; prof.push([R + crown * Math.pow(Math.cos(a), 0.7) * (0.6 + 0.4 * env), hw * Math.sin(a)]); }
      prof.push([R - sk, hw * 0.96]);
      for (const [r, z] of prof) {
        const rr = r - off;
        pos.push(wheelPos[0] + Math.sin(t) * rr, wheelPos[1] - Math.cos(t) * rr, z);
        uv.push(u, (z / w) + 0.5);
      }
    }
    const cols = nv + 3;
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
        if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const outer = build(0, false), inner = build(0.003, true);
  // make sure the outer skin faces away from the wheel
  const n = outer.attributes.normal, p = outer.attributes.position;
  const mid = Math.floor(n.count / 2);
  const rx = p.getX(mid) - wheelPos[0], ry = p.getY(mid) - wheelPos[1];
  if (n.getX(mid) * rx + n.getY(mid) * ry < 0) { flipGeometry(outer); flipGeometry(inner); }
  for (const g of [outer, inner]) ctx.A.add(o.group || defGroup, g, o.mat || defMat);
}

export function frontFender(ctx, o = {}) {
  const R = ctx.front.R + (o.gap ?? 0.025);
  const w = o.w ?? ctx.front.w * 1.15;
  const fpos = [ctx.front.x + (o.dx ?? 0), ctx.front.y + (o.dy ?? 0)];
  archFender(ctx, fpos, { ...o, R, w, from: o.from ?? 0.95, len: o.len ?? 2.0 }, 'forkSlider', ctx.mats.paint);
  // mounting brackets out to the fork sliders
  if ((o.group || 'forkSlider') === 'forkSlider' && o.brackets !== false) {
    const t = (o.from ?? 0.95) + (o.len ?? 2.0) * 0.42;
    for (const s of [-1, 1]) {
      const z0 = w / 2 - 0.004, z1 = ctx.fw - 0.022;
      if (z1 <= z0) continue;
      const b = box(0.05, 0.012, z1 - z0 + 0.01, 0.004);
      place(b, { p: [fpos[0] + Math.sin(t) * (R - 0.012), fpos[1] - Math.cos(t) * (R - 0.012), s * (z0 + z1) / 2], r: [0, 0, t] });
      ctx.A.add('forkSlider', b, M.black());
    }
  }
}

// Rear fender / hugger around rear wheel (bike space, attached to group)
export function rearFender(ctx, o = {}) {
  const R = ctx.rear.R + (o.gap ?? 0.03);
  const w = o.w ?? ctx.rear.w * 1.1;
  archFender(ctx, [ctx.rear.x, ctx.rear.y], { ...o, R, w, from: o.from ?? 2.6, len: o.len ?? 1.6, skirts: o.skirts ?? 0.03 }, 'swingarm', M.black());
}

// ---------------------------------------------------------------------------
// Swingarms
export function swingarm(ctx, o = {}) {
  const { A } = ctx;
  const [px, py] = ctx.pivot;
  const ax = ctx.rear.x, ay = ctx.rear.y;
  const style = o.style || 'banana';
  const side = o.side ?? Math.max(0.1, ctx.rear.w / 2 + 0.04);
  const mat = o.mat || M.aluminum();
  const sides = style === 'single' ? [-side] : [-side, side];
  for (const z of sides) {
    if (style === 'tube') {
      A.add('swingarm', rod([px, py, z * 0.85], [ax + 0.02, ay, z], 0.02, 12), mat);
    } else {
      const hgt = style === 'single' ? 0.065 : (o.h ?? 0.058);
      const arch = style === 'banana' ? (z > 0 ? 0.045 : 0.03) : 0;
      const L = (t) => [px + (ax - px) * t, py + (ay - py) * t + arch * Math.sin(Math.PI * Math.min(1, t * 1.15))];
      const sec = (t, w, ht, zz, n = 5.5) => { const [x, y] = L(t); return { x, y, w, ht, hb: ht, n, z: zz }; };
      // box section: tall at the pivot, tapering to the axle block
      const g = loft([
        sec(0.0, 0.03, hgt, z * 0.78), sec(0.18, 0.028, hgt * 1.02, z * 0.93),
        sec(0.5, 0.025, hgt * 0.86, z), sec(0.82, 0.022, hgt * 0.66, z), sec(1.0, 0.021, hgt * 0.56, z),
      ], { radial: 20, sub: 6, capStart: true, capEnd: true });
      A.add('swingarm', g, mat);
      if (style === 'banana' || o.brace) {
        // underslung brace truss with two webs
        const [x0, y0] = L(0.16), [x1, y1] = L(0.74);
        const by = (t) => y0 + (y1 - y0) * t - hgt - 0.045 * Math.sin(Math.PI * t);
        const br = loft([
          { x: x0, y: y0 - hgt * 0.7, w: 0.018, ht: 0.016, n: 5, z: z * 0.92 },
          { x: x0 + (x1 - x0) * 0.35, y: by(0.35), w: 0.017, ht: 0.017, n: 5, z: z * 0.98 },
          { x: x0 + (x1 - x0) * 0.7, y: by(0.7), w: 0.016, ht: 0.016, n: 5, z },
          { x: x1, y: y1 - hgt * 0.5, w: 0.015, ht: 0.014, n: 5, z },
        ], { radial: 14, sub: 5, capStart: true, capEnd: true });
        A.add('swingarm', br, mat);
        for (const t of [0.35, 0.68]) {
          const [wx, wy] = L(t);
          A.add('swingarm', rod([wx, wy - hgt * 0.8, z], [wx, by(t) + 0.005, z], 0.008, 8), mat);
        }
      }
      // axle block with the adjuster bolt and lock nut
      const blk = box(0.07, hgt * 1.25, 0.034, 0.008);
      place(blk, { p: [ax + 0.005, ay, z] });
      A.add('swingarm', blk, mat);
      A.add('swingarm', rod([ax + 0.04, ay, z], [ax + 0.075, ay, z], 0.0045, 6), M.chrome());
      const nut = cyl(0.008, 0.008, 0.008, 6, 'x'); nut.translate(ax + 0.07, ay, z);
      A.add('swingarm', nut, M.chrome());
      if (style === 'single') {
        // big hub carrier
        const hub = cyl(0.075, 0.075, 0.05, 28, 'z');
        place(hub, { p: [ax, ay, z] });
        A.add('swingarm', hub, mat);
      }
    }
  }
  // cross brace + pivot
  if (style !== 'single') A.add('swingarm', rod([px + 0.08, py - 0.01, -side * 0.85], [px + 0.08, py - 0.01, side * 0.85], 0.02, 10), mat);
  A.add('swingarm', cyl(0.03, 0.03, side * 2 + 0.06, 20, 'z').translate(px, py, 0), M.aluminum());
  // pivot bolt heads
  for (const s of [-1, 1]) {
    const nut = cyl(0.02, 0.02, 0.012, 6, 'z'); nut.translate(px, py, s * (side + 0.036));
    A.add('swingarm', nut, M.chrome());
  }
  // axle
  const axle = cyl(0.014, 0.014, side * 2 + 0.05, 12, 'z');
  axle.translate(ax, ay, 0);
  A.add('swingarm', axle, M.aluminum());
  // chain adjusters
  for (const z of sides) {
    const ad = box(0.05, 0.025, 0.012, 0.004);
    place(ad, { p: [ax - 0.01, ay, z + Math.sign(z) * 0.018] });
    A.add('swingarm', ad, M.anodized(0xd4a431));
  }
}

// Chain drive on the left side (z<0). Rear sprocket must be on rear wheel.
export function chain(ctx, o = {}) {
  return chainDrive(ctx, { gold: o.gold ?? ['superbike', 'gp', 'twostroke', 'naked', 'sm', 'mx'].includes(ctx.spec?.design), ...o });
}

// Toothed belt final drive (cruisers): belt + polished pulleys
export function belt(ctx, o = {}) {
  const r = beltDrive(ctx, o);
  if (o.pulley !== false) {
    const pul = closedLathe([[0.045, -0.016], [r.r - 0.004, -0.016], [r.r + 0.002, -0.013], [r.r + 0.002, 0.013], [r.r - 0.004, 0.016], [0.045, 0.016]], 96);
    pul.translate(0, 0, r.z);
    ctx.A.add('rearWheel', pul, M.machined(), { local: true });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const hole = cyl(0.022, 0.022, 0.034, 16, 'z'); hole.translate(Math.cos(a) * 0.088, Math.sin(a) * 0.088, r.z);
      ctx.A.add('rearWheel', hole, M.black(), { local: true });
    }
  }
  return r;
}

// Rear shock absorber (static, chassis): rod-end eye, anodised body with piggyback
// reservoir, preload collar + lock ring, progressive spring with ground ends, chromed
// shaft, bottom clevis with the rebound adjuster.
export function shock(ctx, a, b, o = {}) {
  const A = ctx.A;
  const d = [b[0] - a[0], b[1] - a[1], (b[2] ?? 0) - (a[2] ?? 0)];
  const L = Math.hypot(...d);
  const u = [d[0] / L, d[1] / L, d[2] / L];
  const at = (t) => [a[0] + d[0] * t, a[1] + d[1] * t, (a[2] ?? 0) + d[2] * t];
  const bodyMat = o.bodyMat || M.anodized(o.bodyColor ?? 0x1e1f22);
  const along = (prof, p0, seg = 20) => orient(revolve(prof, seg, 'y').rotateX(Math.PI / 2), p0, u);
  const R = o.r ?? 0.03;
  const bodyR = Math.max(0.017, R * 0.62);
  // top eye
  const eye = turned([[0.0001, -0.012], [0.014, -0.012], [0.016, -0.009], [0.016, 0.009], [0.014, 0.012], [0.0001, 0.012]], 18, 'z');
  eye.translate(a[0], a[1], a[2] ?? 0);
  A.add('chassis', eye, bodyMat);
  // body: from the eye to 55 %, with machined rings
  A.add('chassis', along([[0.0001, 0.0], [bodyR * 0.8, 0.0], [bodyR, 0.012], [bodyR, L * 0.52], [bodyR * 0.92, L * 0.55], [0.009, L * 0.56]], a, 24), bodyMat);
  for (const t of [0.14, 0.17]) A.add('chassis', along([[bodyR + 0.0006, -0.0015], [bodyR + 0.0006, 0.0015]], at(t), 24), M.machined());
  // preload collar + lock ring (knurled)
  A.add('chassis', along([[bodyR, 0], [R + 0.004, 0], [R + 0.004, 0.012], [bodyR, 0.012]], at(0.2), 24), M.anodized(o.collarColor ?? 0xc81e1e));
  A.add('chassis', along([[bodyR, 0], [R + 0.002, 0], [R + 0.002, 0.006], [bodyR, 0.006]], at(0.2 + 0.014 / L), 24), M.knurled());
  // shaft and the lower spring seat + clevis
  A.add('chassis', along([[0.0085, 0], [0.0085, L * 0.36]], at(0.55), 16), M.chrome());
  A.add('chassis', along([[0.009, 0], [R + 0.003, 0.002], [R + 0.003, 0.008], [0.014, 0.012], [0.014, 0.05], [0.0001, 0.05]], at(0.86), 24), bodyMat);
  const cl = turned([[0.0001, -0.014], [0.013, -0.014], [0.015, -0.011], [0.015, 0.011], [0.013, 0.014], [0.0001, 0.014]], 18, 'z');
  cl.translate(b[0], b[1], b[2] ?? 0);
  A.add('chassis', cl, bodyMat);
  const reb = turned([[0.0001, 0], [0.008, 0], [0.008, 0.006], [0.0001, 0.006]], 12, 'z'); reb.translate(b[0], b[1], (b[2] ?? 0) + 0.016);
  A.add('chassis', reb, M.gold());
  // spring: closed ground ends, progressive pitch
  const s0 = at(0.2 + 0.022 / L), s1 = at(0.86);
  A.add('chassis', coil(s0, s1, R, o.wire ?? 0.0068, o.turns ?? 7.5), o.springMat || M.spring(o.springColor ?? 0xe2b521));
  if (o.reservoir) {
    // piggyback reservoir alongside the body with its banjo head
    const rp = [a[0] - 0.034, a[1] - 0.01, (a[2] ?? 0) + 0.035];
    const rd = [u[0] * 0.85 + 0.0, u[1] * 0.85, u[2] * 0.85 + 0.0];
    const rr = orient(revolve([[0.0001, 0], [0.019, 0], [0.021, 0.006], [0.021, 0.1], [0.019, 0.106], [0.006, 0.108], [0.0001, 0.108]], 24, 'y').rotateX(Math.PI / 2), rp, rd);
    A.add('chassis', rr, M.anodized(o.resColor ?? 0xd4a431));
    A.add('chassis', rod(a, rp, 0.011, 10), bodyMat);
    const knob = turned([[0.0001, 0], [0.01, 0], [0.01, 0.008], [0.0001, 0.008]], 14, 'y');
    orient(knob.rotateX(Math.PI / 2), [rp[0] + rd[0] * 0.108, rp[1] + rd[1] * 0.108, rp[2] + rd[2] * 0.108], rd);
    A.add('chassis', knob, M.anodized(0xc81e1e));
  }
}

// Coil spring with closed, ground ends and progressive pitch between a and b
export function coil(a, b, radius, wire, turns) {
  const pts = [];
  const N = Math.round(turns * 20);
  const D = new THREE.Vector3(b[0] - a[0], b[1] - a[1], (b[2] ?? 0) - (a[2] ?? 0));
  const L = D.length();
  const closed = (wire * 2.1) / L; // one closed turn at each end
  for (let i = 0; i <= N; i++) {
    const t = i / N, ang = t * turns * Math.PI * 2;
    let h;
    const e = 1 / turns;
    if (t < e) h = closed * (t / e);
    else if (t > 1 - e) h = 1 - closed * ((1 - t) / e);
    else { const k = (t - e) / (1 - 2 * e); h = closed + (1 - 2 * closed) * (k * 0.85 + k * k * 0.15); }
    pts.push(new THREE.Vector3(Math.cos(ang) * radius, h, Math.sin(ang) * radius));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, wire, 7, false);
  g.applyMatrix4(new THREE.Matrix4().makeScale(1, L, 1));
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), D.clone().normalize())));
  g.translate(a[0], a[1], a[2] ?? 0);
  return g;
}

// ---------------------------------------------------------------------------
// Engines
// Finned cylinder (air-cooled) along a direction.
export function finnedCylinder(ctx, base, dir, len, o = {}) {
  const fins = o.fins ?? 9;
  const core = o.core ?? 0.05, fin = o.fin ?? 0.075;
  const prof = [[0.001, 0]];
  for (let i = 0; i < fins; i++) {
    const h0 = (i / fins) * len, h1 = ((i + 0.45) / fins) * len, h2 = ((i + 1) / fins) * len;
    const f = fin * (o.taper ? 1 - (i / fins) * o.taper : 1);
    prof.push([core, h0 + 0.002], [f, h0 + 0.004], [f, h1], [core, h1 + 0.002], [core, h2]);
  }
  prof.push([0.001, len]);
  const seg = o.square ? 4 : 24;
  const g = lathe(prof, seg, 'y', o.square ? Math.PI / 4 : 0);
  if (o.square) { const ng = g.toNonIndexed(); ng.computeVertexNormals(); return addAlong(ctx, ng, base, dir, o); }
  return addAlong(ctx, g, base, dir, o);
}
function addAlong(ctx, g, base, dir, o) {
  const d = new THREE.Vector3(...dir).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
  g.translate(base[0], base[1], base[2] ?? 0);
  ctx.A.add(o.group || 'chassis', g, o.mat || M.engine(0x3a3d42));
  return g;
}

export function crankcase(ctx, c, size, o = {}) {
  const g = box(size[0], size[1], size[2], o.r ?? 0.04);
  place(g, { p: c, r: [0, 0, o.tilt ?? 0] });
  ctx.A.add('chassis', g, o.mat || M.engine());
  // side covers
  if (o.covers !== false) {
    for (const z of [-1, 1]) {
      const cv = cyl(o.coverR ?? size[1] * 0.38, o.coverR ?? size[1] * 0.38, 0.03, 32, 'z');
      place(cv, { p: [c[0] + (o.coverDx ?? 0), c[1] + (o.coverDy ?? -size[1] * 0.08), c[2] + z * (size[2] / 2 + 0.01)] });
      ctx.A.add('chassis', cv, o.coverMat || M.engine(0x55595f));
      const bolt = cyl(0.02, 0.02, 0.01, 8, 'z');
      place(bolt, { p: [c[0] + (o.coverDx ?? 0), c[1] + (o.coverDy ?? -size[1] * 0.08), c[2] + z * (size[2] / 2 + 0.027)] });
      ctx.A.add('chassis', bolt, M.chrome());
      const cr = (o.coverR ?? size[1] * 0.38) * 0.86;
      for (let k = 0; k < 8; k++) {
        const ak = (k / 8) * Math.PI * 2;
        const hb = cyl(0.0055, 0.0055, 0.008, 6, 'z');
        place(hb, { p: [c[0] + (o.coverDx ?? 0) + Math.cos(ak) * cr, c[1] + (o.coverDy ?? -size[1] * 0.08) + Math.sin(ak) * cr, c[2] + z * (size[2] / 2 + 0.026)] });
        ctx.A.add('chassis', hb, M.chrome());
      }
    }
  }
}

export function radiator(ctx, c, w, h, o = {}) {
  (ctx.radiators || (ctx.radiators = [])).push({ c, w, h });
  const A = ctx.A;
  const tilt = o.tilt ?? -0.2;
  // in radiator space: x = through the core (front +), y up, z across; then tilt + move
  const put = (g) => { g.rotateZ(tilt); g.translate(c[0], c[1], c[2]); return g; };
  const core = box(0.032, h, w);
  A.add('chassis', put(core), M.radiator());
  const fm = M.anodized(0x18191b);
  // header tanks left/right with the filler neck on the right one, top/bottom frame rails
  for (const s of [-1, 1]) {
    const t = box(0.05, h + 0.012, 0.026, 0.008); t.translate(-0.004, 0, s * (w / 2 + 0.012));
    A.add('chassis', put(t), fm);
  }
  for (const s of [-1, 1]) { const r = box(0.036, 0.01, w + 0.02, 0.003); r.translate(0, s * (h / 2 + 0.003), 0); A.add('chassis', put(r), fm); }
  const neck = turned([[0.0001, 0], [0.012, 0], [0.012, 0.018], [0.017, 0.02], [0.017, 0.028], [0.0001, 0.028]], 18, 'y');
  neck.translate(-0.004, h / 2 + 0.004, w / 2 + 0.012); A.add('chassis', put(neck), M.machined());
  // protective guard grille in front of the core
  if (o.guard !== false) {
    const gp = new THREE.PlaneGeometry(w + 0.004, h + 0.004);
    gp.rotateY(Math.PI / 2); gp.translate(0.024, 0, 0);
    A.add('chassis', put(gp), M.grille());
    const gf = extrude(roundRect(h + 0.016, w + 0.016, 0.01), 0.004, { holes: [roundRect(h + 0.002, w + 0.002, 0.006)], bevel: 0.001 });
    gf.rotateY(Math.PI / 2); gf.rotateX(Math.PI / 2); gf.translate(0.024, 0, 0);
    A.add('chassis', put(gf), fm);
  }
  // oil cooler slung under the radiator on sport bikes
  if (o.oil) {
    const oc = box(0.026, h * 0.28, w * 0.7); oc.translate(0.02, -h / 2 - h * 0.2, 0);
    A.add('chassis', put(oc), M.radiator());
    for (const s of [-1, 1]) { const t = box(0.034, h * 0.3, 0.018, 0.005); t.translate(0.02, -h / 2 - h * 0.2, s * (w * 0.35 + 0.009)); A.add('chassis', put(t), fm); }
  }
}

// ---------------------------------------------------------------------------
// Exhausts
export function header(ctx, pts, r = 0.02, mat) {
  const g = tube(pts, r, { radial: 18 });
  const len = g.parameters.path.getLength();
  const seg = Math.max(20, Math.round(len * 40));
  ctx.A.add('chassis', tube(pts, r, { radial: 18, segments: seg }), mat || M.header());
}

// Muffler can along a direction from p (centre of the inlet) to q (outlet): inlet cone,
// body (round / hex / oval / cone / megaphone / shotgun), riveted end cap, rolled outlet
// tip with a dark baffle, clamp band and hanger strap.
export function muffler(ctx, p, q, o = {}) {
  const r = o.r ?? 0.055;
  const len = Math.hypot(q[0] - p[0], q[1] - p[1], (q[2] ?? 0) - (p[2] ?? 0));
  const type = o.type || 'round';
  const grp = o.group || 'chassis';
  const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], (q[2] ?? 0) - (p[2] ?? 0)).normalize();
  const qd = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
  const put = (g, h = 0) => { g.applyQuaternion(qd); g.translate(p[0] + d.x * h, p[1] + d.y * h, (p[2] ?? 0) + d.z * h); return g; };
  const ecL = o.endcap ? Math.min(0.07, len * 0.16) : 0;
  const bodyEnd = len - ecL;
  let prof, seg = 36;
  if (type === 'megaphone') prof = [[r * 0.42, 0], [r * 0.5, len * 0.18], [r, bodyEnd * 0.97], [r * 0.98, bodyEnd]];
  else if (type === 'shotgun') prof = [[r * 0.6, 0], [r, 0.03], [r, bodyEnd]];
  else if (type === 'cone') prof = [[r * 0.48, 0], [r * 0.62, len * 0.08], [r, len * 0.34], [r * 0.96, bodyEnd]];
  else prof = [[r * 0.45, 0], [r * 0.52, len * 0.03], [r * 0.93, len * 0.14], [r, len * 0.2], [r, bodyEnd - 0.004], [r * 0.985, bodyEnd]];
  if (type === 'hex') seg = 6;
  let body = revolve(prof, seg, 'y', { phi0: type === 'hex' ? Math.PI / 6 : 0, smooth: type !== 'hex' });
  if (type === 'oval') body.scale(1, 1, 0.78);
  ctx.A.add(grp, put(body), o.mat || M.titanium());
  // end cap: tapered cap (carbon / titanium) with a ring of rivets
  const tipR = r * 0.42;
  if (o.endcap) {
    const ec = revolve([[r * 0.99, 0], [r * 1.005, ecL * 0.15], [r * 0.95, ecL * 0.7], [r * 0.78, ecL], [tipR + 0.006, ecL]], seg, 'y', { phi0: type === 'hex' ? Math.PI / 6 : 0, smooth: type !== 'hex' });
    if (type === 'oval') ec.scale(1, 1, 0.78);
    ctx.A.add(grp, put(ec, bodyEnd), o.endcap);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rv = sphere(0.0028, 6, 4); rv.translate(Math.sin(a) * r * 1.0, ecL * 0.08, Math.cos(a) * r * (type === 'oval' ? 0.78 : 1));
      ctx.A.add(grp, put(rv, bodyEnd), M.steel(0xb8bcc2));
    }
  } else {
    const ec = revolve([[r * 0.985, 0], [r * 0.9, 0.012], [tipR + 0.006, 0.016]], seg, 'y', { phi0: type === 'hex' ? Math.PI / 6 : 0, smooth: type !== 'hex' });
    if (type === 'oval') ec.scale(1, 1, 0.78);
    ctx.A.add(grp, put(ec, bodyEnd), o.mat || M.titanium());
  }
  // outlet tip with a rolled lip and the dark baffle inside
  const tipH = o.endcap ? ecL : 0.016;
  const tipT = revolve([[tipR + 0.003, -0.01], [tipR + 0.003, 0.012], [tipR + 0.0045, 0.015], [tipR + 0.002, 0.018], [tipR, 0.014], [tipR, -0.02]], 28, 'y');
  ctx.A.add(grp, put(tipT, bodyEnd + tipH), M.machined());
  const baffle = cyl(tipR, tipR, 0.004, 24, 'y');
  ctx.A.add(grp, put(baffle, bodyEnd + tipH - 0.014), M.black());
  // clamp band near the front + hanger strap toward the subframe
  if (type !== 'shotgun' && type !== 'megaphone') {
    const band = revolve([[r + 0.003, -0.012], [r + 0.004, -0.01], [r + 0.004, 0.01], [r + 0.003, 0.012]], seg === 6 ? 6 : 36, 'y', { phi0: type === 'hex' ? Math.PI / 6 : 0, smooth: type !== 'hex' });
    if (type === 'oval') band.scale(1, 1, 0.78);
    ctx.A.add(grp, put(band, len * 0.62), o.bandMat || M.carbon());
  }
  ctx.exhausts.push({ pos: [q[0], q[1], q[2] ?? 0], dir: [d.x, d.y, d.z], r });
}

// Two-stroke expansion chamber along a smooth path: welded cone sections (seams), spring
// joint at the cylinder, heat-coloured bare steel
export function expansionChamber(ctx, pts, rMax = 0.055, mat) {
  const radii = [0.018, 0.02, 0.03, rMax * 0.8, rMax, rMax, rMax * 0.7, 0.025, 0.016, 0.016];
  const radAt = (t) => { const f = t * (radii.length - 1), i = Math.min(Math.floor(f), radii.length - 2), k = f - i; return radii[i] * (1 - k) + radii[i + 1] * k; };
  const g = sweep(pts, (t) => circle(radAt(t), 24), { segments: 120, caps: true });
  // normalise u along the length for the heat tint
  const uv = g.attributes.uv; let mx = 0;
  for (let i = 0; i < uv.count; i++) mx = Math.max(mx, uv.getX(i));
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) / (mx || 1));
  ctx.A.add('chassis', g, mat || M.header());
  // weld seams between the cone sections
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => V(q[0], q[1], q[2])));
  for (let k = 1; k < 9; k++) {
    const t = k / 9;
    const p = curve.getPointAt(t), tg = curve.getTangentAt(t);
    const ring2 = torus(radAt(t) + 0.0004, 0.0018, 24, 4);
    ring2.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), tg));
    ring2.translate(p.x, p.y, p.z);
    ctx.A.add('chassis', ring2, M.steel(0x7d7468));
  }
  // retaining springs at the port joint
  const p0 = curve.getPointAt(0.03), t0 = curve.getTangentAt(0.03);
  for (const s of [-1, 1]) {
    const side = V(0, 0, 1).cross(t0).normalize().multiplyScalar(s * 0.026);
    const a = [p0.x + side.x - t0.x * 0.02, p0.y + side.y - t0.y * 0.02, p0.z + side.z - t0.z * 0.02];
    const b = [p0.x + side.x + t0.x * 0.035, p0.y + side.y + t0.y * 0.035, p0.z + side.z + t0.z * 0.035];
    ctx.A.add('chassis', coil(a, b, 0.004, 0.0011, 9), M.steel(0xb0b4ba));
  }
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const d = new THREE.Vector3(last[0] - prev[0], last[1] - prev[1], last[2] - prev[2]).normalize();
  ctx.exhausts.push({ pos: last, dir: [d.x, d.y, d.z], r: 0.016 });
}

// ---------------------------------------------------------------------------
// Lights
// Round headlight: bucket with mounting ears, chrome trim ring, parabolic reflector, LED
// projector with a DRL halo, domed clear glass.
export function headlightRound(ctx, center, r = 0.085, o = {}) {
  const group = o.group || 'steer';
  const dir = o.dir ?? 0;
  const A = ctx.A;
  const put = (g) => { g.rotateZ(dir); g.translate(center[0], center[1], center[2]); return g; };
  const bucket = revolve([[0.0001, -r * 1.05], [r * 0.55, -r * 1.0], [r * 0.9, -r * 0.72], [r * 1.02, -r * 0.3], [r * 1.04, 0.0], [r * 1.02, 0.004]], 40, 'x');
  A.add(group, put(bucket), o.shellMat || M.chrome());
  const trim = revolve([[r * 0.96, -0.002], [r * 1.05, 0.002], [r * 1.07, 0.008], [r * 1.03, 0.014], [r * 0.95, 0.012]], 48, 'x');
  A.add(group, put(trim), o.trimMat || M.chrome());
  const refl = revolve([[r * 0.95, 0.004], [r * 0.8, -r * 0.18], [r * 0.5, -r * 0.42], [r * 0.2, -r * 0.52]], 40, 'x');
  A.add(group, put(refl), M.chrome());
  const proj = revolve([[0.0001, -r * 0.2], [r * 0.32, -r * 0.2], [r * 0.34, -r * 0.05], [r * 0.3, 0.0], [0.0001, r * 0.06]], 24, 'x');
  A.add(group, put(proj), ctx.mats.head);
  const halo = torus(r * 0.62, Math.max(0.0025, r * 0.035), 40, 6); halo.rotateY(Math.PI / 2); halo.translate(-r * 0.08, 0, 0);
  A.add(group, put(halo), ctx.mats.head);
  const lens = revolve([[0.0001, r * 0.2], [r * 0.5, r * 0.16], [r * 0.85, r * 0.08], [r * 0.97, 0.008]], 40, 'x');
  A.add(group, put(lens), M.lens());
  for (const s of [-1, 1]) {
    const ear = cyl(0.008, 0.008, 0.02, 10, 'z'); ear.translate(-r * 0.5, 0, s * (r * 0.97 + 0.008));
    A.add(group, put(ear), o.shellMat || M.chrome());
  }
  ctx.headlights.push({ pos: center, group, r });
}

export function ledStrip(ctx, a, b, r = 0.006, group = 'chassis', mat) {
  ctx.A.add(group, sweep([a, b], () => superellipse(r, r * 0.8, 2.6, 10), { segments: 1 }), mat || ctx.mats.head);
}

// LED tail light: gloss housing, lit LED board, red lens
export function tailLight(ctx, c, w = 0.06, h = 0.02, o = {}) {
  const A = ctx.A, grp = o.group || 'chassis';
  const put = (g) => { g.rotateZ(o.tilt ?? 0.2); g.translate(c[0], c[1], c[2]); return g; };
  const hs = box(0.03, h + 0.01, w + 0.012, Math.min(h + 0.01, 0.012) / 2.2); hs.translate(0.008, 0, 0);
  A.add(grp, put(hs), M.gloss(0x0b0b0c));
  const led = box(0.006, h, w, Math.min(h, 0.008) / 2.2); led.translate(-0.008, 0, 0);
  A.add(grp, put(led), ctx.mats.tail);
  const lens = box(0.006, h + 0.004, w + 0.004, Math.min(h, 0.01) / 2.1); lens.translate(-0.0125, 0, 0);
  A.add(grp, put(lens), M.tintLens(0x8a0a0a));
  ctx.tails.push({ pos: c });
}

// Rear sets: billet hanger plates with lightening pockets, knurled pegs, heel guards
export function footpegs(ctx, x, y, zHalf = 0.17, o = {}) {
  ctx.pegs = { x, y, z: zHalf };
  const A = ctx.A;
  const plateMat = o.plateMat || M.anodized(o.plateColor ?? 0x1b1c1f);
  for (const s of [-1, 1]) {
    // knurled peg on its pivot block, folding spring
    const peg = revolve([[0.0001, 0], [0.0095, 0], [0.011, 0.004], [0.011, 0.058], [0.0095, 0.062], [0.0001, 0.062]], 18, 'z');
    if (s < 0) peg.rotateY(Math.PI);
    peg.translate(x, y, s * (zHalf - 0.018));
    A.add('chassis', peg, M.knurled());
    const blk = box(0.026, 0.024, 0.022, 0.005); blk.translate(x + 0.004, y + 0.004, s * (zHalf - 0.03));
    A.add('chassis', blk, plateMat);
    if (o.plates !== false) {
      // hanger: kidney plate from the frame down to the peg, three pockets
      const out = [[-0.03, -0.012], [0.03, -0.018], [0.075, 0.03], [0.07, 0.085], [0.02, 0.1], [-0.02, 0.06]];
      const sm = [];
      for (let i = 0; i < out.length; i++) {
        const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
        sm.push([b[0] * 0.8 + (a[0] + c[0]) * 0.1, b[1] * 0.8 + (a[1] + c[1]) * 0.1]);
        sm.push([(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]);
      }
      const holes = [circle(0.011, 12, 0.02, 0.025), circle(0.009, 12, 0.045, 0.06), circle(0.007, 10, 0.012, 0.07)];
      const pl = extrude(sm, 0.008, { holes, bevel: 0.0015, curveSegments: 2 });
      pl.translate(x - 0.004, y - 0.004, s * (zHalf - 0.045));
      A.add('chassis', pl, plateMat);
      // heel guard: thin plate with slots over the peg
      const hg = extrude(roundRect(0.075, 0.055, 0.012), 0.0025, { holes: [roundRect(0.05, 0.007, 0.003).map(([a, b]) => [a, b + 0.012]), roundRect(0.05, 0.007, 0.003).map(([a, b]) => [a, b - 0.004])], bevel: 0.0005 });
      hg.translate(x - 0.012, y + 0.045, s * (zHalf - 0.038));
      A.add('chassis', hg, M.machined());
      for (const [bx, by] of [[0.02, 0.1], [0.07, 0.085]]) {
        const b = capScrew(0.009, 0.006); orient(b, [x - 0.004 + bx, y - 0.004 + by, s * (zHalf - 0.04)], [0, 0, s]); A.add('chassis', b, M.steel(0x8d9197));
      }
    }
  }
}

// Number board decal. o.face: 'front' (faces +x, tilted back by o.tilt about z) or
// Euler o.r for the side boards.
export function numberPlate(ctx, c, size, mat, o = {}) {
  const g = new THREE.PlaneGeometry(size[0], size[1]);
  if (o.face === 'front') { g.rotateY(Math.PI / 2); g.rotateZ(o.tilt ?? 0); g.translate(...c); }
  else place(g, { p: c, r: o.r ?? [0, 0, 0] });
  ctx.A.add(o.group || 'chassis', g, mat);
}

function uvScale(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

// ---------------------------------------------------------------------------
// Fine detail: braided brake lines with banjo bolts, cables, radiator hoses with clamps,
// turn signals, number-plate hanger, gear / brake levers with linkage, rear master
// cylinder, kickstand, steering damper.
function hoseGeo(path, r, tile = 0.04) {
  const g = tube(path, r, { radial: 8 });
  const len = g.parameters.path.getLength();
  const seg = Math.max(8, Math.round(len * 60));
  const h = tube(path, r, { radial: 8, segments: seg });
  const uv = h.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / tile);
  return h;
}
function banjoAt(A, grp, p, axis) {
  const eye = turned([[0.0001, -0.0055], [0.0075, -0.0055], [0.0085, -0.004], [0.0085, 0.004], [0.0075, 0.0055], [0.0001, 0.0055]], 14, 'z');
  orient(eye, p, axis);
  A.add(grp, eye, M.steel(0xb8bcc2));
  const bolt = hexHead(0.011, 0.005); orient(bolt, [p[0] + axis[0] * 0.0055, p[1] + axis[1] * 0.0055, p[2] + axis[2] * 0.0055], axis);
  A.add(grp, bolt, M.machined());
}
function signalLamp(A, grp, p, dir, stalk = 0.05) {
  // stalk from the mount out to a bullet LED indicator with an amber lens
  const d = Math.sign(dir) || 1;
  const s0 = [p[0] - d * 0.012, p[1], p[2] - Math.sign(p[2]) * stalk];
  A.add(grp, sweep([s0, [p[0] - d * 0.004, p[1], p[2] - Math.sign(p[2]) * 0.008], p], () => superellipse(0.0055, 0.0045, 2.4, 10), { segments: 6 }), M.gloss(0x0d0d0f));
  const body = revolve([[0.0001, -0.018], [0.009, -0.016], [0.011, -0.004], [0.0105, 0.004], [0.0001, 0.006]], 16, 'x');
  if (d < 0) body.rotateY(Math.PI);
  body.translate(p[0] + d * 0.006, p[1], p[2]);
  A.add(grp, body, M.gloss(0x0d0d0f));
  const lens = revolve([[0.0001, 0.012], [0.007, 0.01], [0.0102, 0.002], [0.0102, -0.002]], 16, 'x');
  if (d < 0) lens.rotateY(Math.PI);
  lens.translate(p[0] + d * 0.012, p[1], p[2]);
  A.add(grp, lens, M.emissive(0xff8a00, 0.25));
}

export function details(ctx, o = {}) {
  const A = ctx.A;
  const line = M.braided();
  const rubber = M.rubber();
  const rightEnd = ctx.barEnds ? ctx.barEnds.find((e) => e[2] > 0) : null;
  const back = (p, k) => [p[0] - ctx.n.x * k, p[1] - ctx.n.y * k, p[2]];
  // front brake lines: caliper banjo -> up behind the fork leg -> splitter -> master cylinder
  const front = (ctx.calipers || []).filter((c) => c.group === 'forkSlider');
  const split = back(ctx.sp(ctx.Lf - 0.02, 0), 0.0);
  const splitP = [split[0] + 0.06, split[1] + 0.005, 0];
  for (const c of front) {
    const sgn = Math.sign(c.pos[2]) || 1;
    const p0 = c.banjo || [c.pos[0], c.pos[1], c.pos[2] + sgn * 0.018];
    banjoAt(A, 'forkSlider', p0, [0, 0, sgn]);
    const z = p0[2] + sgn * 0.004;
    const pA = back(ctx.fp(0.22, z), 0.04);
    const pB = back(ctx.fp(ctx.Lf - 0.07, z * 0.95), 0.045);
    A.add('steer', hoseGeo([[p0[0], p0[1] + 0.006, z], pA, pB, [splitP[0] + 0.01, splitP[1] - 0.04, sgn * 0.035], splitP], 0.0042), line);
    // hose guide clip on the fork foot
    const clip = box(0.012, 0.008, 0.01, 0.002); clip.translate(...back(ctx.fp(0.16, z), 0.033));
    A.add('forkSlider', clip, M.black());
  }
  if (front.length) {
    const spl = box(0.022, 0.014, 0.03, 0.004); spl.translate(...splitP);
    A.add('steer', spl, M.machined());
    const mc = ctx.masterCyl || (rightEnd ? [rightEnd[0] + 0.06, rightEnd[1] - 0.04, rightEnd[2] - 0.2] : back(ctx.fp(ctx.Lf + ctx.headLen + 0.05, 0.12), 0.05));
    A.add('steer', hoseGeo([splitP, [splitP[0] + 0.03, splitP[1] + 0.06, 0.04], [mc[0] + 0.02, mc[1] - 0.06, mc[2] * 0.7], mc], 0.0042), line);
  }
  // rear brake line along the swingarm to the rear master cylinder by the right peg
  for (const c of (ctx.calipers || []).filter((q) => q.group === 'swingarm')) {
    const [px, py] = ctx.pivot;
    const z = c.pos[2] + 0.014;
    banjoAt(A, 'swingarm', c.banjo || [c.pos[0], c.pos[1], z], [0, 0, 1]);
    const path = [[c.pos[0], c.pos[1] + 0.01, z], [c.pos[0] + 0.12, c.pos[1] + 0.035, z], [px - 0.1, py + 0.05, z - 0.01], [px + 0.02, py + 0.08, z - 0.03]];
    A.add('swingarm', hoseGeo(path, 0.0038), line);
    // hose clips on the arm
    for (const t of [0.35, 0.65]) { const q = [c.pos[0] + (px - c.pos[0]) * t, c.pos[1] + (py + 0.05 - c.pos[1]) * t + 0.008, z]; const cl = box(0.01, 0.006, 0.012, 0.002); cl.translate(...q); A.add('swingarm', cl, M.black()); }
  }
  // throttle & clutch cables from the switchgear down to the head stock
  for (const e of ctx.barEnds || []) {
    const s = Math.sign(e[2]);
    const head = ctx.sp(ctx.Lf + ctx.headLen * 0.4);
    const sw = [e[0] + 0.06, e[1] - 0.02, e[2] - s * 0.2];
    for (const k of s > 0 ? [0, 1] : [0]) {
      const path = [[sw[0] + 0.008, sw[1] - 0.012, sw[2] - s * 0.01 * k], [sw[0] + 0.07, sw[1] - 0.07, e[2] * 0.55], [head[0] + 0.1, head[1] + 0.06, s * (0.07 + 0.01 * k)], [head[0] + 0.02, head[1] - 0.08, s * 0.075]];
      A.add('steer', hoseGeo(path, 0.0036), M.black());
    }
  }
  // radiator hoses with clamp bands at both ends
  for (const r of ctx.radiators || []) {
    for (const s of [-1, 1]) {
      const z = (r.c[2] || 0) + s * r.w * 0.32;
      const top = [r.c[0] - 0.03, r.c[1] + r.h * 0.35, z];
      const ends = [[top, [top[0] - 0.08, top[1] + 0.03, z * 0.8], [top[0] - 0.18, top[1] - 0.02, z * 0.5]]];
      const bot = [r.c[0] - 0.02, r.c[1] - r.h * 0.4, z];
      ends.push([bot, [bot[0] - 0.06, bot[1] - 0.05, z * 0.8], [bot[0] - 0.16, bot[1] - 0.08, z * 0.5]]);
      for (const path of ends) {
        A.add('chassis', hoseGeo(path, 0.011, 1), rubber);
        for (const [i, j] of [[0, 1], [2, 1]]) {
          const a = path[i], b = path[j];
          const dn = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
          const cl = torus(0.0122, 0.0016, 18, 4); cl.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dn));
          cl.translate(a[0] + dn.x * 0.012, a[1] + dn.y * 0.012, a[2] + dn.z * 0.012);
          A.add('chassis', cl, M.steel(0xb0b4ba));
        }
      }
    }
  }
  // front turn signals
  if (o.signalsF) for (const p of o.signalsF) signalLamp(A, o.signalsFGroup || 'chassis', p, 1);
  if (o.plate) {
    const pl = o.plate;
    const grp = pl.group || 'chassis';
    const tilt = pl.tilt ?? 0.25;
    // hanger arm, plate holder, licence plate, plate light, rear indicators
    A.add(grp, sweep([[pl.pos[0] + 0.14, pl.pos[1] + 0.13, 0], [pl.pos[0] + 0.07, pl.pos[1] + 0.1, 0], [pl.pos[0] + 0.01, pl.pos[1] + 0.05, 0]], () => superellipse(0.01, 0.035, 2.6, 12), { segments: 8, up: [0, 0, 1] }), M.plastic(0x101012));
    const holder = box(0.008, 0.115, 0.19, 0.004);
    place(holder, { p: pl.pos, r: [0, 0, tilt] });
    A.add(grp, holder, M.plastic(0x101012));
    const face = new THREE.PlaneGeometry(0.17, 0.1);
    face.rotateY(-Math.PI / 2);
    face.rotateZ(tilt);
    face.translate(pl.pos[0] - 0.0045, pl.pos[1], pl.pos[2]);
    A.add(grp, face, ctx.mats.license);
    const lamp = box(0.012, 0.012, 0.04, 0.004); place(lamp, { p: [pl.pos[0] + 0.004 - Math.sin(tilt) * 0.0, pl.pos[1] + 0.062, 0], r: [0, 0, tilt] });
    A.add(grp, lamp, M.gloss(0x0d0d0f));
    for (const s of [-1, 1]) signalLamp(A, grp, [pl.pos[0] + 0.03, pl.pos[1] + 0.07, s * 0.12], -1, 0.07);
  }
  // gear lever (left) with the linkage + quickshifter, brake pedal + master cylinder (right)
  if (ctx.pegs && o.pedals !== false) {
    const { x, y, z } = ctx.pegs;
    const zl = -(z - 0.028), zr = z - 0.028;
    const pivL = [x + 0.004, y + 0.004, zl - 0.004];
    A.add('chassis', sweep([pivL, [x + 0.1, y + 0.012, zl - 0.006], [x + 0.19, y + 0.006, zl - 0.008]], (t) => superellipse(0.008 - t * 0.002, 0.0035, 2.4, 10), { segments: 10, up: [0, 0, 1] }), M.anodized(0x1c1c1e));
    const toe = revolve([[0.0001, 0], [0.007, 0], [0.008, 0.004], [0.008, 0.036], [0.0001, 0.04]], 12, 'z');
    toe.rotateY(Math.PI); toe.translate(x + 0.19, y + 0.006, zl - 0.006);
    A.add('chassis', toe, M.knurled());
    const sh = ctx.engine && ctx.engine.shift;
    if (sh) {
      const a = [x + 0.06, y + 0.012, zl - 0.012], b = [sh[0], sh[1] + 0.02, zl - 0.012];
      A.add('chassis', rod(a, b, 0.0042, 8), M.machined());
      for (const p of [a, b]) { const re = turned([[0.0001, -0.005], [0.0075, -0.005], [0.0075, 0.005], [0.0001, 0.005]], 12, 'z'); re.translate(...p); A.add('chassis', re, M.steel(0x9a9ea4)); }
      // quickshifter sensor on the rod
      const q = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2]];
      const qs = orient(revolve([[0.0001, -0.022], [0.0085, -0.022], [0.0085, 0.022], [0.0001, 0.022]], 14, 'y').rotateX(Math.PI / 2), q, [b[0] - a[0], b[1] - a[1], 0]);
      A.add('chassis', qs, M.anodized(0x161718));
      A.add('chassis', hoseGeo([[q[0], q[1] + 0.008, q[2]], [q[0] + 0.02, q[1] + 0.06, q[2] + 0.01], [q[0] + 0.05, q[1] + 0.12, q[2] + 0.04]], 0.0022, 1), M.black());
    }
    const pivR = [x + 0.004, y + 0.004, zr + 0.004];
    A.add('chassis', sweep([pivR, [x + 0.1, y - 0.016, zr + 0.006], [x + 0.18, y - 0.03, zr + 0.008]], (t) => superellipse(0.008 - t * 0.002, 0.0035, 2.4, 10), { segments: 10, up: [0, 0, 1] }), M.anodized(0x1c1c1e));
    const pad = box(0.045, 0.006, 0.032, 0.0025); place(pad, { p: [x + 0.19, y - 0.026, zr + 0.012], r: [0, 0, -0.15] }); A.add('chassis', pad, M.knurled());
    // rear master cylinder (vertical) + translucent reservoir
    const mcP = [x + 0.03, y + 0.02, zr - 0.012];
    A.add('chassis', revolve([[0.0001, 0], [0.0095, 0], [0.0095, 0.065], [0.008, 0.07], [0.0001, 0.07]], 16, 'y').translate(...mcP), M.anodized(0x1b1c1f));
    A.add('chassis', rod([x + 0.03, y + 0.02, zr - 0.012], [x + 0.06, y - 0.01, zr + 0.002], 0.0035, 6), M.machined());
    const res = [x - 0.03, y + 0.13, zr - 0.02];
    A.add('chassis', revolve([[0.0001, 0], [0.014, 0], [0.014, 0.034], [0.0001, 0.034]], 18, 'y').translate(...res), M.tintLens(0x3a2a14));
    A.add('chassis', revolve([[0.0001, 0], [0.0125, 0], [0.0125, 0.02], [0.0001, 0.02]], 14, 'y').translate(res[0], res[1] + 0.002, res[2]), M.plastic(0x6a4a18));
    A.add('chassis', revolve([[0.0001, 0], [0.015, 0], [0.015, 0.006], [0.0001, 0.009]], 18, 'y').translate(res[0], res[1] + 0.034, res[2]), M.black());
    A.add('chassis', hoseGeo([[x + 0.03, y + 0.09, zr - 0.012], [x, y + 0.11, zr - 0.016], [res[0], res[1] + 0.004, res[2]]], 0.0035, 1), M.black());
  }
  // folded kickstand (left side)
  if (o.kickstand !== false) {
    const [px, py] = ctx.pivot;
    const a = [px + 0.12, py - 0.12, -0.11], b2 = [px - 0.2, py - 0.17, -0.15];
    A.add('chassis', sweep([a, [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2 - 0.01, (a[2] + b2[2]) / 2], b2], (t) => superellipse(0.013 - t * 0.003, 0.009, 2.4, 10), { segments: 8 }), M.black());
    const foot = extrude(roundRect(0.05, 0.03, 0.01), 0.006, { bevel: 0.0015 }); foot.rotateX(Math.PI / 2); foot.translate(b2[0] - 0.012, b2[1] - 0.008, b2[2]);
    A.add('chassis', foot, M.black());
    const sp2 = coil([a[0] - 0.02, a[1] + 0.01, a[2] - 0.012], [a[0] - 0.09, a[1] + 0.0, a[2] - 0.02], 0.0045, 0.0012, 10);
    A.add('chassis', sp2, M.steel(0xb0b4ba));
  }
  // steering damper: transverse body ahead of the tank, rod to the top clamp
  if (o.damper) {
    const h0 = ctx.sp(ctx.Lf + ctx.headLen + 0.02);
    const body = revolve([[0.0001, -0.075], [0.0115, -0.075], [0.0125, -0.07], [0.0125, 0.03], [0.011, 0.034], [0.0001, 0.034]], 18, 'z');
    body.translate(h0[0] - 0.045, h0[1] + 0.012, 0);
    A.add('chassis', body, M.anodized(0xd4a431));
    A.add('chassis', rod([h0[0] - 0.045, h0[1] + 0.012, 0.034], [h0[0] - 0.045, h0[1] + 0.012, 0.09], 0.005, 10), M.chrome());
    const knob = revolve([[0.0001, 0], [0.012, 0], [0.012, 0.01], [0.0001, 0.01]], 16, 'y'); knob.translate(h0[0] - 0.045, h0[1] + 0.024, -0.04);
    A.add('chassis', knob, M.anodized(0x1b1c1f));
  }
}

export { V, DEG, loft, loftProfile, tube, taperTube, lathe, box, cyl, sphere, place, rod, between, spring, ring, torus, mirrorZ };
