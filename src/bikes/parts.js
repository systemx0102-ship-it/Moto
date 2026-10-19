// Reusable motorcycle components. All coordinates are bike space
// (x forward, y up, z right; ground y=0) unless noted as wheel-local.
import * as THREE from 'three';
import { loft, loftProfile, tube, taperTube, lathe, box, cyl, sphere, place, rod, between, spring, ring, torus, mirrorZ, flipGeometry } from './geo.js';
import { M } from '../core/materials.js';
import { discTexture } from '../core/textures.js';

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
  // tire
  const prof = [];
  const N = 18;
  const exp = w.knobby ? 0.28 : (w.exp ?? 0.42);
  for (let i = 0; i <= N; i++) {
    const th = -Math.PI / 2 + Math.PI * (i / N);
    const h = (tw / 2) * Math.sin(th);
    const r = rimR - 0.006 + (R - rimR + 0.006 - (w.knobby ? 0.012 : 0)) * Math.pow(Math.max(Math.cos(th), 0), exp);
    prof.push([r, h]);
  }
  A.add(group, lathe(prof, 56, 'z'), M.tire(!!w.knobby), { local: true });
  if (w.knobby) {
    const knobs = [];
    const count = Math.round((2 * Math.PI * R) / 0.042);
    for (let row = -1; row <= 1; row++) {
      for (let i = 0; i < count; i++) {
        const phi = (i / count) * Math.PI * 2 + (row === 0 ? 0 : (Math.PI / count) * row * 0.5);
        if (row !== 0 && i % 2) continue;
        const rr = R - 0.012 + (row === 0 ? 0.006 : 0.002);
        const g = box(0.014, 0.022, row === 0 ? 0.03 : 0.022);
        place(g, { p: [Math.cos(phi) * rr, Math.sin(phi) * rr, row * tw * 0.3], r: [row * 0.35, 0, phi] });
        knobs.push(g);
      }
    }
    for (const g of knobs) A.add(group, g, M.rubber(), { local: true });
  }
  // rim
  const rw = tw * (w.knobby ? 0.6 : 0.82);
  const rimMat = w.rimMat || ctx.mats.wheel;
  if (style !== 'hubless') {
    A.add(group, closedLathe([
      [rimR + 0.008, -rw / 2], [rimR - 0.002, -rw / 2 - 0.003], [rimR - 0.016, -rw / 2 + 0.006],
      [rimR - 0.03, -rw * 0.25], [rimR - 0.03, rw * 0.25], [rimR - 0.016, rw / 2 - 0.006],
      [rimR - 0.002, rw / 2 + 0.003], [rimR + 0.008, rw / 2], [rimR + 0.002, rw / 2 - 0.008],
      [rimR - 0.006, 0], [rimR + 0.002, -rw / 2 + 0.008],
    ], 56), rimMat, { local: true });
    if (w.rimStripe) {
      // pinstripe painted on the outer face of each rim flange (outside the tyre bead)
      for (const sz of [-1, 1]) {
        const g = ring(rimR - 0.011, rimR - 0.0065, 72);
        if (sz < 0) g.rotateY(Math.PI);
        g.translate(0, 0, sz * (rw / 2 + 0.0042));
        A.add(group, g, w.rimStripe, { local: true });
      }
    }
    // valve stem
    const vs = cyl(0.004, 0.004, 0.03, 8, 'y'); vs.translate(0, -(rimR - 0.035), rw * 0.18); vs.rotateZ(0.9);
    A.add(group, vs, M.chrome(), { local: true });
  }
  // hub
  const hw = w.hubW ?? Math.max(0.05, tw * 0.45);
  if (style !== 'hubless') {
    A.add(group, closedLathe([
      [0.016, -hw], [0.05, -hw], [0.056, -hw + 0.012], [0.042, -0.012], [0.042, 0.012], [0.056, hw - 0.012], [0.05, hw], [0.016, hw],
    ], 24), style === 'wire' ? M.aluminum() : rimMat, { local: true });
    A.add(group, cyl(0.018, 0.018, hw * 2 + 0.03, 12, 'z'), M.chrome(), { local: true });
  }
  const inner = rimR - 0.026;
  if (style === 'cast' || style === 'split') {
    const n = w.spokes || 5;
    const sweep = w.sweep ?? 0.25;
    const split = style === 'split';
    for (let i = 0; i < n; i++) {
      const base = (i / n) * Math.PI * 2;
      const angles = split ? [base - 0.07, base + 0.07] : [base];
      for (const a0 of angles) {
        A.add(group, spokeGeo(0.052, inner, split ? (w.spokeW ?? 0.021) : (w.spokeW ?? 0.028), w.spokeT ?? 0.024, a0, sweep, split ? (a0 < base ? -0.06 : 0.06) : 0), rimMat, { local: true });
      }
    }
  } else if (style === 'wire') {
    const n = w.spokes || 36;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const side = i % 2 ? 1 : -1;
      const cross = (i % 4 < 2 ? 1 : -1) * 0.38;
      const h0 = [Math.cos(a + cross) * 0.045, Math.sin(a + cross) * 0.045, side * hw * 0.8];
      const r0 = [Math.cos(a) * (inner + 0.01), Math.sin(a) * (inner + 0.01), side * 0.006];
      A.add(group, rod(h0, r0, 0.0022, 5), M.chrome(), { local: true });
    }
  } else if (style === 'disc') {
    A.add(group, closedLathe([[0.05, -hw * 0.7], [inner + 0.01, -0.012], [inner + 0.01, 0.012], [0.05, hw * 0.7]], 48), rimMat, { local: true });
  } else if (style === 'hubless') {
    // thick structural ring + glowing inner track
    const rr = rimR;
    A.add(group, closedLathe([
      [rr + 0.008, -rw / 2], [rr - 0.06, -rw / 2], [rr - 0.075, -rw / 3], [rr - 0.075, rw / 3], [rr - 0.06, rw / 2], [rr + 0.008, rw / 2], [rr - 0.004, 0],
    ], 64), rimMat, { local: true });
    A.add(group, closedLathe([[rr - 0.076, -rw * 0.12], [rr - 0.082, -rw * 0.12], [rr - 0.082, rw * 0.12], [rr - 0.076, rw * 0.12]], 64), ctx.mats.neon, { local: true });
  } else if (style === 'turbine') {
    const n = w.spokes || 14;
    for (let i = 0; i < n; i++) A.add(group, spokeGeo(0.05, inner, 0.02, 0.008, (i / n) * Math.PI * 2, 0.7, 0), rimMat, { local: true });
  }
  // brake discs (spin with wheel)
  if (w.discs) {
    for (const d of w.discs) {
      const mat = discMaterial(d.style || 'drilled', d.carrier || '#c9a227');
      const g = ring(d.r * 0.3, d.r, 64);
      g.translate(0, 0, d.z);
      A.add(group, g, mat, { local: true });
      // floating-disc buttons where the rotor meets the carrier
      if (d.style !== 'plain') {
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 + 0.31;
          const b = cyl(0.0058, 0.0058, 0.011, 10, 'z');
          b.translate(Math.cos(a) * d.r * 0.66, Math.sin(a) * d.r * 0.66, d.z);
          A.add(group, b, M.aluminum(), { local: true });
        }
      }
    }
  }
  if (w.sprocket) {
    const s = w.sprocket;
    const g = sprocketGeo(s.r, s.teeth ?? 42, s.holes ?? 6, 0.0065);
    g.translate(0, 0, s.z);
    A.add(group, g, M.anodized(s.color ?? 0x8a8f96), { local: true });
    // carrier bolts with their nuts
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const b = cyl(0.0065, 0.0065, 0.016, 6, 'z');
      b.translate(Math.cos(a) * 0.062, Math.sin(a) * 0.062, s.z);
      A.add(group, b, M.chrome(), { local: true });
    }
  }
}

// Laser-cut sprocket in the wheel plane (axis Z): tooth profile round the rim,
// lightening windows between the spokes and the centre bore.
export function sprocketGeo(R, teeth = 42, holes = 6, thick = 0.0065) {
  const shape = new THREE.Shape();
  const n = teeth * 6;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ph = (i % 6) / 6;
    // root, flank, rounded tip, flank (smooth bump per tooth)
    const r = R - 0.0035 + 0.011 * Math.pow(Math.sin(Math.PI * ph), 1.6);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const rin = 0.05, rout = R - 0.024;
  if (holes && rout > rin + 0.02) {
    const web = 0.016;
    for (let k = 0; k < holes; k++) {
      const a0 = (k / holes) * Math.PI * 2, a1 = ((k + 1) / holes) * Math.PI * 2;
      const h = new THREE.Path();
      const o0 = a0 + web / rout, o1 = a1 - web / rout, i0 = a0 + web / rin, i1 = a1 - web / rin;
      h.moveTo(Math.cos(o0) * rout, Math.sin(o0) * rout);
      for (let j = 1; j <= 10; j++) { const a = o0 + (o1 - o0) * (j / 10); h.lineTo(Math.cos(a) * rout, Math.sin(a) * rout); }
      for (let j = 0; j <= 6; j++) { const a = i1 + (i0 - i1) * (j / 6); h.lineTo(Math.cos(a) * rin, Math.sin(a) * rin); }
      h.closePath();
      shape.holes.push(h);
    }
  }
  const bore = new THREE.Path();
  bore.absarc(0, 0, 0.026, 0, Math.PI * 2, true);
  shape.holes.push(bore);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1, curveSegments: 8 });
  g.translate(0, 0, -thick / 2);
  return g;
}

const discMats = new Map();
function discMaterial(style, carrier) {
  const key = style + carrier;
  if (!discMats.has(key)) {
    discMats.set(key, new THREE.MeshStandardMaterial({
      map: discTexture(style, carrier), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.95, roughness: 0.3,
    }));
  }
  return discMats.get(key);
}

// Curved, tapered spoke in wheel-local polar coords.
function spokeGeo(r0, r1, width, thick, a0, sweep, splitBend) {
  const L = r1 - r0;
  const g = new THREE.BoxGeometry(L, width, thick, 10, 1, 1);
  g.translate(L / 2, 0, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = x / L;
    const r = r0 + x;
    const taper = 1.35 - t * 0.55;
    const ang = a0 + sweep * t * t + (y * taper) / r + splitBend * (1 - t) * 0;
    const zz = z * (1.25 - t * 0.4);
    p.setXYZ(i, Math.cos(ang) * r, Math.sin(ang) * r, zz);
  }
  g.computeVertexNormals();
  return g;
}

// Brake caliper near a disc (bike space)
export function caliper(ctx, group, axle, discR, z, angleDeg, color = 0xc81e1e, size = 1) {
  const a = angleDeg * DEG;
  const r = discR * 0.86;
  const sg = Math.sign(z || 1);
  const mat = M.anodized(color);
  const P = (rr, da = 0) => [axle[0] + Math.cos(a + da) * rr, axle[1] + Math.sin(a + da) * rr];
  const rot = [0, 0, a + Math.PI / 2];
  // outer and inner halves either side of the rotor, joined by the bridge over its edge
  for (const side of [1, -1]) {
    const half = box(0.052 * size, 0.108 * size, 0.022, 0.01);
    place(half, { p: [...P(r), z + side * sg * 0.017], r: rot });
    ctx.A.add(group, half, mat);
  }
  const bridge = box(0.028 * size, 0.09 * size, 0.056, 0.008);
  place(bridge, { p: [...P(r + 0.024), z], r: rot });
  ctx.A.add(group, bridge, mat);
  // piston bores showing as round bosses on the outer face
  for (const k of [-1, 1]) {
    const pb = cyl(0.0125 * size, 0.0125 * size, 0.006, 16, 'z');
    pb.translate(...P(r - 0.002, k * 0.024 / r), z + sg * 0.03);
    ctx.A.add(group, pb, mat);
  }
  // radial mounting bolts, pad pin, bleed nipple, logo window
  const zs = z + sg * 0.028;
  for (const k of [-1, 1]) {
    const lug = cyl(0.009, 0.009, 0.03, 8, 'x');
    place(lug, { p: [...P(r + 0.032, k * 0.042 / r), z + sg * 0.012], r: [0, 0, a] });
    ctx.A.add(group, lug, M.chrome());
  }
  const pin = rod([...P(r + 0.016, -0.03 / r), z - 0.03], [...P(r + 0.016, -0.03 / r), z + 0.03], 0.0035, 6);
  ctx.A.add(group, pin, M.chrome());
  const bleed = cyl(0.004, 0.004, 0.014, 6, 'z');
  bleed.translate(...P(r + 0.022, 0.05 / r), zs);
  ctx.A.add(group, bleed, M.chrome());
  const win = box(0.012, 0.05 * size, 0.003, 0.0015);
  place(win, { p: [...P(r + 0.006), zs + sg * 0.004], r: rot });
  ctx.A.add(group, win, M.plastic(0xf2f2f2));
  (ctx.calipers || (ctx.calipers = [])).push({ group, pos: [...P(r + 0.03), z], a });
}

// ---------------------------------------------------------------------------
// Front forks
export function fork(ctx, o = {}) {
  const { A } = ctx;
  const type = o.type || 'usd';
  const fw = ctx.fw;
  const Lf = ctx.Lf;
  const top = Lf + ctx.headLen + (o.extra ?? 0.04);
  const fp = ctx.fp;
  const outerMat = o.outerMat || (type === 'usd' ? M.anodized(0x1d1f22) : M.aluminum());
  const innerMat = o.innerMat || (type === 'usd' ? M.gold() : M.chrome());
  for (const z of [-fw, fw]) {
    if (type === 'usd') {
      A.add('forkSlider', rod(fp(0.0, z), fp(0.4, z), o.innerR ?? 0.023, 18), innerMat);
      const lug = box(0.06, 0.09, 0.05, 0.012);
      place(lug, { p: fp(0.01, z), r: [0, 0, ctx.rake] });
      A.add('forkSlider', lug, M.anodized(0x1a1a1a));
      A.add('steer', rod(fp(0.3, z), fp(top, z), o.outerR ?? 0.029, 20), outerMat);
      A.add('steer', rod(fp(top, z), fp(top + 0.012, z), (o.outerR ?? 0.029) * 0.8, 12), M.anodized(o.capColor ?? 0xd4a431));
    } else if (type === 'conv' || type === 'cruiser' || type === 'mx') {
      const lowerR = o.lowerR ?? (type === 'cruiser' ? 0.034 : 0.03);
      const lowerLen = o.lowerLen ?? 0.34;
      A.add('forkSlider', rod(fp(-0.02, z), fp(lowerLen, z), lowerR, 18), o.lowerMat || (type === 'cruiser' ? M.chrome() : M.aluminum()));
      A.add('steer', rod(fp(lowerLen - 0.06, z), fp(top, z), o.stanchionR ?? 0.022, 18), innerMat);
      if (type === 'cruiser' && o.gaiters) {
        A.add('steer', rod(fp(lowerLen, z), fp(lowerLen + 0.12, z), 0.04, 18), M.rubber());
      }
      if (type === 'mx') {
        // fork guards
        const gd = box(0.04, 0.24, 0.02, 0.008);
        place(gd, { p: fp(0.18, z + Math.sign(z) * 0.01), r: [0, 0, ctx.rake] });
        A.add('forkSlider', gd, o.guardMat || M.plastic(0xf2f2f2));
      }
    } else if (type === 'springer') {
      // springer: rigid rear legs + front legs + exposed springs
      A.add('steer', rod(fp(0.0, z), fp(top, z), 0.016, 12), M.chrome());
      const back = (t) => { const p = fp(t, z); return [p[0] - ctx.n.x * 0.06, p[1] - ctx.n.y * 0.06, z]; };
      A.add('steer', rod(back(0.0), back(top), 0.018, 12), M.black());
      A.add('steer', spring(back(top - 0.25), back(top - 0.02), 0.022, 0.005, 8), M.chrome());
    }
  }
  // triple clamps
  for (const [t, h] of [[Lf, 0.03], [Lf + ctx.headLen, 0.026]]) {
    const c = ctx.sp(t);
    const f = fp(t);
    const mid = [(c[0] + f[0]) / 2, (c[1] + f[1]) / 2, 0];
    const g = box(ctx.offset + 0.08, h, fw * 2 + 0.07, 0.01);
    place(g, { p: mid, r: [0, 0, ctx.rake] });
    A.add('steer', g, o.clampMat || M.anodized(0x2a2c30));
  }
  // axle
  const ax = cyl(0.013, 0.013, fw * 2 + 0.06, 12, 'z');
  place(ax, { p: [ctx.front.x, ctx.front.y, 0] });
  A.add('forkSlider', ax, M.aluminum());
}

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
  const z = o.z ?? -(ctx.rear.w / 2 + 0.012);
  const [px, py] = ctx.pivot;
  const fs = [px + 0.06, py + 0.02];
  const rs = [ctx.rear.x, ctx.rear.y];
  const rr = o.rearR ?? 0.1, fr = 0.04;
  const top0 = [fs[0], fs[1] + fr, z], top1 = [rs[0], rs[1] + rr, z];
  const bot0 = [fs[0], fs[1] - fr, z], bot1 = [rs[0], rs[1] - rr, z];
  const lenT = Math.hypot(top1[0] - top0[0], top1[1] - top0[1]);
  ctx.A.add('swingarm', uvScale(rod(top0, top1, 0.0065, 6), 1, lenT / 0.0127), M.chain());
  ctx.A.add('swingarm', uvScale(rod(bot0, bot1, 0.0065, 6), 1, lenT / 0.0127), M.chain());
  const spr = sprocketGeo(fr - 0.004, 16, 0, 0.009);
  spr.translate(fs[0], fs[1], z);
  ctx.A.add('chassis', spr, M.darkChrome());
  // guard
  if (o.guard !== false) {
    const g = box(0.25, 0.006, 0.03, 0.002);
    place(g, { p: [(top0[0] + top1[0]) / 2, (top0[1] + top1[1]) / 2 + 0.03, z], r: [0, 0, Math.atan2(top1[1] - top0[1], top1[0] - top0[0])] });
    ctx.A.add('swingarm', g, M.plastic());
  }
  return { z, r: rr };
}

// Belt final drive (cruiser)
export function belt(ctx) {
  const z = -(ctx.rear.w / 2 + 0.015);
  const [px, py] = ctx.pivot;
  const fs = [px + 0.04, py + 0.01];
  const rr = 0.13, fr = 0.05;
  ctx.A.add('swingarm', rod([fs[0], fs[1] + fr, z], [ctx.rear.x, ctx.rear.y + rr, z], 0.012, 4), M.rubber());
  ctx.A.add('swingarm', rod([fs[0], fs[1] - fr, z], [ctx.rear.x, ctx.rear.y - rr, z], 0.012, 4), M.rubber());
  return { z, r: rr };
}

// Rear shock absorber (static, chassis)
export function shock(ctx, a, b, o = {}) {
  ctx.A.add('chassis', rod(a, b, o.bodyR ?? 0.014, 12), o.bodyMat || M.anodized(0x222222));
  const k = 0.18;
  const s0 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const s1 = [a[0] + (b[0] - a[0]) * 0.82, a[1] + (b[1] - a[1]) * 0.82, a[2] + (b[2] - a[2]) * 0.82];
  ctx.A.add('chassis', spring(s0, s1, o.r ?? 0.03, o.wire ?? 0.0065, o.turns ?? 8), o.springMat || M.spring(o.springColor ?? 0xe2b521));
  if (o.reservoir) {
    const rv = cyl(0.02, 0.02, 0.12, 14, 'y');
    place(rv, { p: [a[0] - 0.03, a[1] - 0.04, a[2] + 0.04] });
    ctx.A.add('chassis', rv, M.anodized(o.resColor ?? 0xd4a431));
  }
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
  const g = box(0.04, h, w, 0.008);
  place(g, { p: c, r: [0, 0, o.tilt ?? -0.2] });
  ctx.A.add('chassis', g, M.radiator());
  const fr = box(0.045, h + 0.02, w + 0.02, 0.006);
  place(fr, { p: [c[0] - 0.004, c[1], c[2]], r: [0, 0, o.tilt ?? -0.2] });
  ctx.A.add('chassis', fr, M.black());
}

// ---------------------------------------------------------------------------
// Exhausts
export function header(ctx, pts, r = 0.02, mat) {
  ctx.A.add('chassis', tube(pts, r, { radial: 10 }), mat || M.titanium());
}

// Muffler can along a direction from p (center of inlet) to q (outlet)
export function muffler(ctx, p, q, o = {}) {
  const r = o.r ?? 0.055;
  const len = Math.hypot(q[0] - p[0], q[1] - p[1], (q[2] ?? 0) - (p[2] ?? 0));
  const type = o.type || 'round';
  let prof;
  if (type === 'megaphone') prof = [[0.001, 0], [r * 0.45, 0], [r * 0.55, len * 0.2], [r, len * 0.97], [r * 0.92, len], [r * 0.6, len * 0.98], [0.001, len * 0.96]];
  else if (type === 'shotgun') prof = [[0.001, 0], [r, 0.01], [r, len * 0.98], [r * 0.85, len], [r * 0.6, len * 0.985], [0.001, len * 0.98]];
  else if (type === 'cone') prof = [[0.001, 0], [r * 0.5, 0], [r, len * 0.3], [r * 0.95, len * 0.95], [r * 0.7, len], [r * 0.45, len * 0.97], [0.001, len * 0.96]];
  else prof = [[0.001, 0], [r * 0.55, 0], [r * 0.95, len * 0.12], [r, len * 0.3], [r, len * 0.9], [r * 0.85, len], [r * 0.5, len], [r * 0.45, len * 0.97], [0.001, len * 0.97]];
  const seg = type === 'hex' ? 6 : 28;
  let g = lathe(prof, seg, 'y');
  if (type === 'hex') { g = g.toNonIndexed(); g.computeVertexNormals(); }
  const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], (q[2] ?? 0) - (p[2] ?? 0)).normalize();
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d)));
  g.translate(p[0], p[1], p[2] ?? 0);
  ctx.A.add(o.group || 'chassis', g, o.mat || M.titanium());
  // dark outlet
  const out = cyl(r * 0.42, r * 0.42, 0.01, 16, 'y');
  out.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d)));
  const tip = [q[0] - d.x * 0.012, q[1] - d.y * 0.012, (q[2] ?? 0) - d.z * 0.012];
  out.translate(...tip);
  ctx.A.add(o.group || 'chassis', out, M.black());
  if (o.endcap) {
    const ec = cyl(r * 1.01, r * 1.01, 0.03, seg, 'y');
    ec.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d)));
    ec.translate(q[0] - d.x * 0.02, q[1] - d.y * 0.02, (q[2] ?? 0) - d.z * 0.02);
    ctx.A.add('chassis', ec, o.endcap);
  }
  ctx.exhausts.push({ pos: [q[0], q[1], q[2] ?? 0], dir: [d.x, d.y, d.z], r });
}

// Two-stroke expansion chamber along a smooth path
export function expansionChamber(ctx, pts, rMax = 0.055, mat) {
  const radii = [0.018, 0.02, 0.03, rMax * 0.8, rMax, rMax, rMax * 0.7, 0.025, 0.016, 0.016];
  const g = taperTube(pts, radii, { radial: 14, segments: 64 });
  ctx.A.add('chassis', g, mat || M.darkChrome());
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const d = new THREE.Vector3(last[0] - prev[0], last[1] - prev[1], last[2] - prev[2]).normalize();
  ctx.exhausts.push({ pos: last, dir: [d.x, d.y, d.z], r: 0.016 });
}

// ---------------------------------------------------------------------------
// Lights
export function headlightRound(ctx, center, r = 0.085, o = {}) {
  const group = o.group || 'steer';
  const dir = o.dir ?? 0;
  const shell = closedLathe([[0.001, -r * 1.1], [r * 0.8, -r * 0.9], [r * 1.02, -r * 0.2], [r * 1.05, 0.0], [r * 0.98, 0.012], [0.001, -0.004]], 32, 'x');
  place(shell, { p: center, r: [0, 0, dir] });
  ctx.A.add(group, shell, o.shellMat || M.chrome());
  const lens = sphere(r * 0.95, 24, 12);
  lens.scale(0.25, 1, 1);
  place(lens, { p: [center[0] + 0.004, center[1], center[2]] });
  ctx.A.add(group, lens, ctx.mats.head);
  const ringG = torus(r * 0.98, 0.006, 32, 6);
  ringG.rotateY(Math.PI / 2);
  ringG.translate(center[0] + 0.01, center[1], center[2]);
  ctx.A.add(group, ringG, M.chrome());
  ctx.headlights.push({ pos: center, group, r });
}

export function ledStrip(ctx, a, b, r = 0.006, group = 'chassis', mat) {
  ctx.A.add(group, rod(a, b, r, 6), mat || ctx.mats.head);
}

export function tailLight(ctx, c, w = 0.06, h = 0.02, o = {}) {
  const g = box(0.02, h, w, Math.min(h, 0.008) / 2);
  place(g, { p: c, r: [0, 0, o.tilt ?? 0.2] });
  ctx.A.add(o.group || 'chassis', g, ctx.mats.tail);
  ctx.tails.push({ pos: c });
}

export function mirror(ctx, base, side, o = {}) {
  const z = side * (o.reach ?? 0.27);
  const stem = [base[0], base[1], base[2]];
  const head = [base[0] + (o.dx ?? -0.02), base[1] + (o.up ?? 0.16), z];
  ctx.A.add(o.group || 'steer', rod(stem, head, 0.007, 8), M.black());
  const hs = box(0.04, 0.068, 0.135, 0.02);
  place(hs, { p: [head[0], head[1] + 0.02, head[2] + side * 0.04], r: [side * 0.12, side * -0.15, 0] });
  ctx.A.add(o.group || 'steer', hs, o.mat || M.black());
  const gl = new THREE.PlaneGeometry(0.115, 0.052);
  gl.rotateY(-Math.PI / 2);
  place(gl, { p: [head[0] - 0.0215, head[1] + 0.02, head[2] + side * 0.04], r: [side * 0.12, side * -0.15, 0] });
  ctx.A.add(o.group || 'steer', gl, M.chrome());
  if (o.signal) {
    // indicator LED strip along the leading outer edge of the housing
    const led = box(0.008, 0.012, 0.09, 0.004);
    place(led, { p: [head[0] + 0.021, head[1] + 0.005, head[2] + side * 0.055], r: [side * 0.12, side * -0.15, 0] });
    ctx.A.add(o.group || 'steer', led, M.emissive(0xff8a00, 0.25));
  }
}

// Handlebars (steer group)
export function handlebar(ctx, o = {}) {
  const type = o.type || 'wide';
  const top = ctx.Lf + ctx.headLen;
  const A = ctx.A;
  const fw = ctx.fw;
  let ends = [];
  if (type === 'clipon') {
    for (const s of [-1, 1]) {
      const a = ctx.fp(top - 0.035, s * fw);
      const b = [a[0] - 0.09, a[1] - 0.03, s * (fw + 0.21)];
      A.add('steer', rod(a, b, 0.012, 10), M.anodized(0x222222));
      A.add('steer', rod([a[0] - 0.05, a[1] - 0.016, s * (fw + 0.08)], b, 0.017, 12), M.rubber());
      ends.push(b);
      (ctx.grips || (ctx.grips = [])).push([(a[0] - 0.05 + b[0]) / 2, (a[1] - 0.016 + b[1]) / 2, (s * (fw + 0.08) + b[2]) / 2]);
    }
  } else {
    const rise = o.rise ?? 0.1, back = o.back ?? 0.1, half = o.half ?? 0.38;
    const c = ctx.sp(top + 0.02);
    const pts = (s) => [[c[0], c[1] + 0.02, 0], [c[0] - back * 0.3, c[1] + rise * 0.8, s * half * 0.45], [c[0] - back * 0.8, c[1] + rise, s * half * 0.85], [c[0] - back, c[1] + rise * 0.95, s * half]];
    if (type === 'ape') {
      const ape = (s) => [[c[0], c[1] + 0.02, s * 0.06], [c[0] + 0.02, c[1] + 0.35, s * 0.12], [c[0] - 0.05, c[1] + 0.42, s * 0.28], [c[0] - 0.16, c[1] + 0.38, s * 0.38]];
      for (const s of [-1, 1]) A.add('steer', tube(ape(s), 0.013), M.chrome());
      ends = [-1, 1].map((s) => ape(s)[3]);
    } else {
      for (const s of [-1, 1]) A.add('steer', tube(pts(s), o.r ?? 0.012), o.mat || M.anodized(0x1a1a1a));
      ends = [-1, 1].map((s) => pts(s)[3]);
      if (type === 'mx') A.add('steer', rod(pts(-1)[1], pts(1)[1], 0.012, 8).translate(0, 0.05, 0), o.mat || M.anodized(0x1a1a1a));
      // risers / clamp
      const cl = box(0.05, 0.03, 0.12, 0.01);
      place(cl, { p: [c[0], c[1] + 0.03, 0], r: [0, 0, ctx.rake] });
      A.add('steer', cl, M.anodized(0x222222));
    }
    for (const e of ends) {
      const s = Math.sign(e[2]);
      const grip = rod([e[0], e[1], e[2] - s * 0.12], e, 0.017, 12);
      A.add('steer', grip, M.rubber());
      (ctx.grips || (ctx.grips = [])).push([e[0], e[1], e[2] - s * 0.06]);
    }
  }
  // levers & switchgear
  for (const e of ends) {
    const s = Math.sign(e[2]);
    A.add('steer', rod([e[0] + 0.02, e[1], e[2] - s * 0.13], [e[0] + 0.07, e[1] - 0.02, e[2] - s * 0.02], 0.005, 6), M.aluminum());
    const sw = box(0.04, 0.035, 0.04, 0.01);
    place(sw, { p: [e[0], e[1], e[2] - s * 0.14] });
    A.add('steer', sw, M.black());
    if (s > 0) {
      const res = cyl(0.018, 0.018, 0.03, 12, 'y');
      place(res, { p: [e[0] + 0.02, e[1] + 0.035, e[2] - s * 0.16] });
      A.add('steer', res, M.anodized(0x111111));
    }
  }
  ctx.barEnds = ends;
  return ends;
}

// Instrument display (canvas texture can be swapped live)
export function dash(ctx, c, w = 0.13, h = 0.08, o = {}) {
  const frame = box(0.03, h + 0.02, w + 0.02, 0.01);
  place(frame, { p: c, r: [0, 0, o.tilt ?? -0.9] });
  ctx.A.add(o.group || 'chassis', frame, M.black());
  const screen = new THREE.PlaneGeometry(w, h);
  screen.rotateY(-Math.PI / 2);
  screen.rotateZ(o.tilt ?? -0.9);
  // face backwards/up towards rider
  screen.translate(c[0] - 0.016 * Math.cos(o.tilt ?? -0.9), c[1] - 0.016 * Math.sin(o.tilt ?? -0.9) + 0.0, c[2]);
  ctx.A.add(o.group || 'chassis', screen, ctx.mats.dash);
  ctx.dashPos = c;
}

export function footpegs(ctx, x, y, zHalf = 0.17, o = {}) {
  ctx.pegs = { x, y, z: zHalf };
  for (const s of [-1, 1]) {
    const p = rod([x, y, s * (zHalf - 0.05)], [x, y, s * zHalf], 0.011, 8);
    ctx.A.add('chassis', p, M.aluminum());
    const k = rod([x, y, s * (zHalf - 0.01)], [x - 0.0, y, s * (zHalf + 0.04)], 0.014, 8);
    ctx.A.add('chassis', k, M.rubber());
    if (o.plates) {
      const pl = box(0.12, 0.08, 0.008, 0.004);
      place(pl, { p: [x + 0.02, y + 0.04, s * (zHalf - 0.06)] });
      ctx.A.add('chassis', pl, M.aluminum());
    }
  }
}

export function numberPlate(ctx, c, size, mat, o = {}) {
  const g = new THREE.PlaneGeometry(size[0], size[1]);
  place(g, { p: c, r: o.r ?? [0, 0, 0] });
  ctx.A.add(o.group || 'chassis', g, mat);
}

function uvScale(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

// ---------------------------------------------------------------------------
// Fine detail: brake lines, cables, radiator hoses, turn signals, plate, kickstand, damper
export function details(ctx, o = {}) {
  const A = ctx.A;
  const hose = M.rubber();
  const banjo = M.chrome();
  const rightEnd = ctx.barEnds ? ctx.barEnds.find((e) => e[2] > 0) : null;
  const leftEnd = ctx.barEnds ? ctx.barEnds.find((e) => e[2] < 0) : null;
  const back = (p, k) => [p[0] - ctx.n.x * k, p[1] - ctx.n.y * k, p[2]];
  for (const c of ctx.calipers || []) {
    if (c.group === 'forkSlider') {
      const sgn = Math.sign(c.pos[2]) || 1;
      const z = c.pos[2] + sgn * 0.018;
      const p0 = [c.pos[0], c.pos[1], z];
      const pA = back(ctx.fp(0.3, z + sgn * 0.012), 0.045);
      const pB = back(ctx.fp(ctx.Lf - 0.04, z * 0.9), 0.06);
      const mc = rightEnd ? [rightEnd[0] + 0.01, rightEnd[1] - 0.02, rightEnd[2] - 0.17] : back(ctx.fp(ctx.Lf + ctx.headLen + 0.05, 0.12), 0.05);
      const mid = [pB[0] - 0.02, pB[1] + 0.1, sgn * 0.03];
      const path = sgn > 0 ? [p0, pA, pB, mid, mc] : [p0, pA, pB, mid, [mid[0] + 0.01, mid[1] + 0.03, 0.02]];
      A.add('steer', tube(path, 0.0052, { radial: 6 }), hose);
      const bj = cyl(0.009, 0.009, 0.02, 8, 'z'); bj.translate(p0[0], p0[1], p0[2]);
      A.add('steer', bj, banjo);
    } else if (c.group === 'swingarm') {
      const [px, py] = ctx.pivot;
      const z = c.pos[2] + 0.012;
      const path = [[c.pos[0], c.pos[1], z], [c.pos[0] + 0.12, c.pos[1] + 0.04, z], [px - 0.1, py + 0.07, z - 0.02], [px + 0.02, py + 0.1, z - 0.04]];
      A.add('swingarm', tube(path, 0.005, { radial: 6 }), hose);
    }
  }
  // throttle & clutch cables from the levers to the head stock
  for (const e of [leftEnd, rightEnd]) {
    if (!e) continue;
    const s = Math.sign(e[2]);
    const head = ctx.sp(ctx.Lf + ctx.headLen * 0.4);
    const path = [[e[0] + 0.01, e[1] - 0.015, e[2] - s * 0.15], [e[0] + 0.07, e[1] - 0.06, e[2] * 0.7], [head[0] + 0.1, head[1] + 0.08, s * 0.07], [head[0] + 0.02, head[1] - 0.06, s * 0.07]];
    A.add('steer', tube(path, 0.004, { radial: 5 }), M.black());
  }
  // radiator hoses
  for (const r of ctx.radiators || []) {
    for (const s of [-1, 1]) {
      const z = (r.c[2] || 0) + s * r.w * 0.32;
      const top = [r.c[0] - 0.03, r.c[1] + r.h * 0.35, z];
      A.add('chassis', tube([top, [top[0] - 0.08, top[1] + 0.03, z * 0.8], [top[0] - 0.18, top[1] - 0.02, z * 0.5]], 0.011, { radial: 8 }), hose);
      const bot = [r.c[0] - 0.02, r.c[1] - r.h * 0.4, z];
      A.add('chassis', tube([bot, [bot[0] - 0.06, bot[1] - 0.05, z * 0.8], [bot[0] - 0.16, bot[1] - 0.08, z * 0.5]], 0.011, { radial: 8 }), hose);
    }
  }
  // turn signals
  const amber = M.emissive(0xff8a00, 0.25);
  const signal = (grp, p, dir) => {
    const stalk = rod([p[0] - dir * 0.02, p[1], p[2] * 0.82], p, 0.006, 6);
    A.add(grp, stalk, M.black());
    const lens = sphere(0.022, 12, 8); lens.scale(1.5, 0.8, 0.9); lens.translate(p[0] + dir * 0.01, p[1], p[2]);
    A.add(grp, lens, amber);
  };
  if (o.signalsF) for (const p of o.signalsF) signal(o.signalsFGroup || 'chassis', p, 1);
  if (o.plate) {
    const pl = o.plate;
    // hanger bracket
    A.add(pl.group || 'chassis', rod([pl.pos[0] + 0.1, pl.pos[1] + 0.12, 0], [pl.pos[0] + 0.01, pl.pos[1] + 0.04, 0], 0.01, 6), M.black());
    const plateBox = box(0.008, 0.11, 0.18, 0.004);
    place(plateBox, { p: pl.pos, r: [0, 0, pl.tilt ?? 0.25] });
    A.add(pl.group || 'chassis', plateBox, M.black());
    const face = new THREE.PlaneGeometry(0.17, 0.1);
    face.rotateY(-Math.PI / 2);
    face.rotateZ(pl.tilt ?? 0.25);
    face.translate(pl.pos[0] - 0.006, pl.pos[1], pl.pos[2]);
    A.add(pl.group || 'chassis', face, ctx.mats.license);
    for (const s of [-1, 1]) signal(pl.group || 'chassis', [pl.pos[0] + 0.03, pl.pos[1] + 0.07, s * 0.12], -1);
  }
  // gear lever (left) with linkage to the shift shaft, brake pedal + master cylinder (right)
  if (ctx.pegs && o.pedals !== false) {
    const { x, y, z } = ctx.pegs;
    const zl = -(z - 0.03), zr = z - 0.03;
    A.add('chassis', rod([x, y, zl], [x + 0.19, y - 0.005, zl - 0.005], 0.007, 8), M.anodized(0x1c1c1e));
    A.add('chassis', rod([x + 0.19, y - 0.005, zl - 0.005], [x + 0.19, y - 0.005, zl - 0.045], 0.008, 8), M.rubber());
    const sh = ctx.engine && ctx.engine.shift;
    if (sh) A.add('chassis', rod([x + 0.08, y + 0.01, zl - 0.004], [sh[0], sh[1], zl - 0.004], 0.0045, 6), M.chrome());
    A.add('chassis', rod([x, y, zr], [x + 0.18, y - 0.03, zr + 0.005], 0.007, 8), M.anodized(0x1c1c1e));
    const pad = box(0.04, 0.008, 0.03, 0.003); place(pad, { p: [x + 0.19, y - 0.028, zr + 0.01] }); A.add('chassis', pad, M.anodized(0x2a2a2a));
    const mc = cyl(0.009, 0.009, 0.06, 10, 'y'); mc.translate(x + 0.025, y + 0.04, zr - 0.01); A.add('chassis', mc, M.aluminum());
    const res = cyl(0.014, 0.014, 0.035, 12, 'y'); res.translate(x - 0.03, y + 0.13, zr - 0.02); A.add('chassis', res, M.plastic(0x2a2a2c));
    A.add('chassis', tube([[x + 0.025, y + 0.07, zr - 0.01], [x, y + 0.11, zr - 0.012], [x - 0.03, y + 0.112, zr - 0.02]], 0.004, { radial: 5 }), M.rubber());
  }
  // folded kickstand (left side)
  if (o.kickstand !== false) {
    const [px, py] = ctx.pivot;
    const a = [px + 0.12, py - 0.12, -0.11], b2 = [px - 0.2, py - 0.17, -0.15];
    A.add('chassis', rod(a, b2, 0.011, 8), M.black());
    const foot = box(0.04, 0.008, 0.025, 0.003); foot.translate(b2[0] - 0.01, b2[1] - 0.008, b2[2]);
    A.add('chassis', foot, M.black());
  }
  // steering damper
  if (o.damper) {
    const h0 = ctx.sp(ctx.Lf + ctx.headLen + 0.02);
    const dm = rod([h0[0] - 0.02, h0[1] + 0.01, -0.11], [h0[0] - 0.02, h0[1] + 0.01, 0.11], 0.012, 10);
    A.add('chassis', dm, M.anodized(0xd4a431));
  }
}

export { V, DEG, loft, loftProfile, tube, taperTube, lathe, box, cyl, sphere, place, rod, between, spring, ring, torus, mirrorZ };
