// Geometry primitives used to sculpt the procedural motorcycles.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const V3 = THREE.Vector3;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

const SEC_KEYS = ['x', 'y', 'w', 'ht', 'hb', 'n', 'z', 'nb', 'wb', 'wt'];

function normSection(s) {
  return {
    x: s.x, y: s.y ?? 0, w: s.w ?? 0.1, ht: s.ht ?? s.h ?? 0.1, hb: s.hb ?? s.ht ?? s.h ?? 0.1,
    n: s.n ?? 2.4, z: s.z ?? 0, nb: s.nb ?? s.n ?? 2.4, wb: s.wb ?? s.w ?? 0.1, wt: s.wt ?? s.w ?? 0.1,
  };
}

/**
 * Loft a smooth shell along +X through superellipse cross-sections.
 * section: {x, y (center), w (half width), ht (top half-height), hb (bottom half-height), n (exponent), z,
 *           wb / wt (half width the sides taper to toward the bottom / top: wedge-shaped sections)}
 * opts: radial, sub (subdivisions between sections), t0/t1 (partial arc), capStart/capEnd
 * UV: u along X (0..1), v around (0 bottom, .25 +z, .5 top, .75 -z)
 */
export function loft(sections, opts = {}) {
  const radial = opts.radial ?? 28;
  const sub = opts.sub ?? 6;
  const t0 = opts.t0 ?? -Math.PI / 2, t1 = opts.t1 ?? Math.PI * 1.5;
  const full = opts.t0 === undefined && opts.t1 === undefined;
  let secs = sections.map(normSection);
  if (secs[secs.length - 1].x < secs[0].x) {
    // author order front->rear: reverse so x increases (keeps outward winding)
    secs = secs.reverse();
    opts = { ...opts, capStart: opts.capEnd, capEnd: opts.capStart };
  }
  // interpolate
  const rings = [];
  for (let i = 0; i < secs.length - 1; i++) {
    const s0 = secs[Math.max(0, i - 1)], s1 = secs[i], s2 = secs[i + 1], s3 = secs[Math.min(secs.length - 1, i + 2)];
    const steps = i === secs.length - 2 ? sub + 1 : sub;
    for (let k = 0; k < steps; k++) {
      const t = k / sub;
      const r = {};
      for (const key of SEC_KEYS) {
        r[key] = catmull(s0[key], s1[key], s2[key], s3[key], t);
      }
      r.w = Math.max(r.w, 0.0005); r.ht = Math.max(r.ht, 0.0005); r.hb = Math.max(r.hb, 0.0005);
      r.wb = Math.max(r.wb, 0.0005); r.wt = Math.max(r.wt, 0.0005);
      r.n = Math.max(r.n, 0.6); r.nb = Math.max(r.nb, 0.6);
      rings.push(r);
    }
  }
  const x0 = rings[0].x, x1 = rings[rings.length - 1].x;
  const cols = full ? radial + 1 : radial + 1;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    for (let j = 0; j < cols; j++) {
      const t = t0 + (t1 - t0) * (j / radial);
      const c = Math.cos(t), s = Math.sin(t);
      const e = 2 / (s >= 0 ? r.n : r.nb);
      const wid = r.w + ((s >= 0 ? r.wt : r.wb) - r.w) * Math.abs(s);
      const z = r.z + wid * Math.sign(c) * Math.pow(Math.abs(c), e);
      const y = r.y + (s >= 0 ? r.ht : r.hb) * Math.sign(s) * Math.pow(Math.abs(s), e);
      pos.push(r.x, y, z);
      uv.push((r.x - x0) / (x1 - x0 || 1), (t + Math.PI / 2) / (Math.PI * 2));
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      // winding so normals face outward (x increasing, t increasing = CCW seen from +x)
      idx.push(a, c, b, b, c, d);
    }
  }
  const capRing = (ri, flip) => {
    const r = rings[ri];
    const center = pos.length / 3;
    pos.push(r.x, r.y, r.z);
    uv.push(ri === 0 ? 0 : 1, 0.5);
    for (let j = 0; j < radial; j++) {
      const a = ri * cols + j, b = a + 1;
      if (flip) idx.push(center, a, b); else idx.push(center, b, a);
    }
  };
  if (opts.capStart) capRing(0, true);
  if (opts.capEnd) capRing(rings.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (opts.flip) flipGeometry(g);
  return g;
}

/**
 * Loft through arbitrary half-profiles mirrored across z = 0, with optional hard creases.
 * sections: [{ x, pts: [[z, y], ...] }] — pts run from the bottom centre (z = 0) round the +z
 * side to the top centre (z = 0); every section has the same number of points.
 * opts: sub (rings between sections), around (samples per profile span), creases (indices of
 * profile points that are sharp edges), capStart/capEnd.
 * UV: u along X (0..1), v = arc length round the loop from the bottom centre (.25 ~ +z side).
 */
export function loftProfile(sections, opts = {}) {
  const sub = opts.sub ?? 6, ar = opts.around ?? 4;
  let secs = sections;
  if (secs[secs.length - 1].x < secs[0].x) {
    secs = secs.slice().reverse();
    opts = { ...opts, capStart: opts.capEnd, capEnd: opts.capStart };
  }
  const m = secs[0].pts.length;
  const crease = new Set(opts.creases || []);
  const rings = [];
  for (let i = 0; i < secs.length - 1; i++) {
    const s0 = secs[Math.max(0, i - 1)], s1 = secs[i], s2 = secs[i + 1], s3 = secs[Math.min(secs.length - 1, i + 2)];
    const steps = i === secs.length - 2 ? sub + 1 : sub;
    for (let k = 0; k < steps; k++) {
      const t = k / sub;
      const pts = [];
      for (let j = 0; j < m; j++) {
        const z = catmull(s0.pts[j][0], s1.pts[j][0], s2.pts[j][0], s3.pts[j][0], t);
        const y = catmull(s0.pts[j][1], s1.pts[j][1], s2.pts[j][1], s3.pts[j][1], t);
        pts.push([j === 0 || j === m - 1 ? 0 : Math.max(0.0005, z), y]);
      }
      rings.push({ x: catmull(s0.x, s1.x, s2.x, s3.x, t), pts });
    }
  }
  const n = 2 * m - 2;
  const half = (q) => (q < m ? q : n - q);
  const isCrease = (q) => crease.has(half(((q % n) + n) % n));
  const x0 = rings[0].x, x1 = rings[rings.length - 1].x;
  const pos = [], uv = [], idx = [];
  const ringIn = [], ringOut = [], ringLoop = [];
  for (const r of rings) {
    const L = [];
    for (let q = 0; q < n; q++) { const h = half(q); L.push(q < m ? r.pts[h] : [-r.pts[h][0], r.pts[h][1]]); }
    const P = (q) => L[((q % n) + n) % n];
    const S = [];
    for (let q = 0; q < n; q++) {
      const p1 = P(q), p2 = P(q + 1);
      const p0 = isCrease(q) ? p1 : P(q - 1), p3 = isCrease(q + 1) ? p2 : P(q + 2);
      for (let k = 0; k < ar; k++) {
        const t = k / ar;
        S.push({ z: catmull(p0[0], p1[0], p2[0], p3[0], t), y: catmull(p0[1], p1[1], p2[1], p3[1], t), c: k === 0 && isCrease(q) });
      }
    }
    const ns = S.length;
    let len = 0;
    const acc = [0];
    for (let k = 1; k <= ns; k++) { const a = S[k - 1], b = S[k % ns]; len += Math.hypot(a.z - b.z, a.y - b.y); acc.push(len); }
    const inI = [], outI = [];
    const u = (r.x - x0) / (x1 - x0 || 1);
    for (let k = 0; k <= ns; k++) {
      const sp = S[k % ns];
      const vtx = () => { pos.push(r.x, sp.y, sp.z); uv.push(u, acc[k] / (len || 1)); return pos.length / 3 - 1; };
      const a = vtx();
      const b = sp.c && k > 0 && k < ns ? vtx() : a;
      inI.push(a); outI.push(b);
    }
    ringIn.push(inI); ringOut.push(outI); ringLoop.push(S);
  }
  for (let r = 0; r < rings.length - 1; r++) {
    const ns = ringLoop[r].length;
    for (let k = 0; k < ns; k++) {
      const a = ringOut[r][k], b = ringIn[r][k + 1], c = ringOut[r + 1][k], d = ringIn[r + 1][k + 1];
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (ri, flip) => {
    const r = rings[ri], S = ringLoop[ri];
    let cy = 0, cz = 0;
    for (const sp of S) { cy += sp.y; cz += sp.z; }
    const c = pos.length / 3;
    pos.push(r.x, cy / S.length, cz / S.length); uv.push(ri === 0 ? 0 : 1, 0.5);
    const base = pos.length / 3;
    for (const sp of S) { pos.push(r.x, sp.y, sp.z); uv.push(ri === 0 ? 0 : 1, 0.5); }
    for (let k = 0; k < S.length; k++) {
      const a = base + k, b = base + ((k + 1) % S.length);
      if (flip) idx.push(c, a, b); else idx.push(c, b, a);
    }
  };
  if (opts.capStart) cap(0, true);
  if (opts.capEnd) cap(rings.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function flipGeometry(g) {
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.index.needsUpdate = true;
  const n = g.attributes.normal;
  if (n) { for (let i = 0; i < n.array.length; i++) n.array[i] *= -1; n.needsUpdate = true; }
  return g;
}

export function tube(points, radius = 0.02, { segments, radial = 10, closed = false, tension = 0.5, type = 'catmullrom' } = {}) {
  const pts = points.map((p) => (p.isVector3 ? p : new V3(p[0], p[1], p[2] ?? 0)));
  const curve = new THREE.CatmullRomCurve3(pts, closed, type, tension);
  const seg = segments ?? Math.max(8, Math.round(curve.getLength() * 40));
  return new THREE.TubeGeometry(curve, seg, radius, radial, closed);
}

// Tube with varying radius: radii array matches points
export function taperTube(points, radii, { radial = 12, segments = 48, capEnds = true } = {}) {
  const pts = points.map((p) => (p.isVector3 ? p : new V3(p[0], p[1], p[2] ?? 0)));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  const frames = curve.computeFrenetFrames(segments, false);
  const pos = [], uv = [], idx = [];
  const radAt = (t) => {
    const f = t * (radii.length - 1);
    const i = Math.min(Math.floor(f), radii.length - 2);
    const k = f - i;
    return radii[i] * (1 - k) + radii[i + 1] * k;
  };
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const N = frames.normals[i], B = frames.binormals[i];
    const r = radAt(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      pos.push(p.x + r * (c * N.x + s * B.x), p.y + r * (c * N.y + s * B.y), p.z + r * (c * N.z + s * B.z));
      uv.push(j / radial, t);
    }
  }
  const cols = radial + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  if (capEnds) {
    for (const end of [0, segments]) {
      const p = curve.getPointAt(end / segments);
      const ci = pos.length / 3;
      pos.push(p.x, p.y, p.z); uv.push(0.5, end ? 1 : 0);
      for (let j = 0; j < radial; j++) {
        const a = end * cols + j, b = a + 1;
        if (end === 0) idx.push(ci, b, a); else idx.push(ci, a, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Lathe a profile [[radius, along], ...] around an axis ('x','y','z'). */
export function lathe(profile, segments = 32, axis = 'y', phiStart = 0, phiLength = Math.PI * 2) {
  const pts = profile.map(([r, h]) => new THREE.Vector2(Math.max(r, 0.0001), h));
  const g = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  else if (axis === 'x') g.rotateZ(-Math.PI / 2);
  return g;
}

export function box(w, h, d, r = 0) {
  if (r > 0) return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2 - 1e-4));
  return new THREE.BoxGeometry(w, h, d);
}

export function cyl(rTop, rBot, h, seg = 20, axis = 'y', open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  else if (axis === 'x') g.rotateZ(Math.PI / 2);
  return g;
}

export function sphere(r, ws = 20, hs = 14) {
  return new THREE.SphereGeometry(r, ws, hs);
}

// Place a geometry: translate / rotate (euler xyz) / scale
export function place(g, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(
    new V3(p[0], p[1], p[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])),
    new V3(s[0], s[1], s[2]),
  );
  g.applyMatrix4(m);
  return g;
}

// Orient a Y-aligned geometry (e.g., cylinder) so it spans from a to b.
export function between(g, a, b) {
  const A = new V3(...a), B = new V3(...b);
  const dir = B.clone().sub(A);
  const len = dir.length();
  g.applyMatrix4(new THREE.Matrix4().makeScale(1, len, 1));
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.normalize());
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
  const mid = A.add(B).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

export function rod(a, b, r = 0.015, seg = 10) {
  const g = new THREE.CylinderGeometry(r, r, 1, seg, 1, false);
  return between(g, a, b);
}

// Mirror a geometry across the z=0 plane (bike centerline)
export function mirrorZ(g) {
  const m = g.clone();
  m.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1));
  flipWinding(m);
  return m;
}

export function flipWinding(g) {
  if (g.index) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.index.needsUpdate = true;
  } else {
    const p = g.attributes.position;
    const swap = (attr) => {
      if (!attr) return;
      const a = attr.array, s = attr.itemSize;
      for (let i = 0; i < attr.count; i += 3) {
        for (let k = 0; k < s; k++) { const t = a[(i + 1) * s + k]; a[(i + 1) * s + k] = a[(i + 2) * s + k]; a[(i + 2) * s + k] = t; }
      }
      attr.needsUpdate = true;
    };
    swap(p); swap(g.attributes.normal); swap(g.attributes.uv);
  }
  return g;
}

// Helical coil spring
export function spring(a, b, radius = 0.035, wire = 0.007, turns = 9) {
  const pts = [];
  const N = turns * 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const ang = t * turns * Math.PI * 2;
    pts.push(new V3(Math.cos(ang) * radius, t, Math.sin(ang) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, N, wire, 6, false);
  // map unit height to segment a->b
  const A = new V3(...a), B = new V3(...b);
  const dir = B.clone().sub(A);
  const len = dir.length();
  g.applyMatrix4(new THREE.Matrix4().makeScale(1, len, 1));
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.normalize());
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
  g.translate(A.x, A.y, A.z);
  return g;
}

// Extrude a 2D outline (in the XY side-profile plane) with thickness along Z.
export function sideExtrude(points2d, depth, { bevel = 0.004, z = 0, curveSegments = 8 } = {}) {
  const shape = new THREE.Shape(points2d.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments,
  });
  g.translate(0, 0, z - depth / 2);
  return g;
}

// Smooth closed outline from control points (Catmull-Rom), returns [[x,y]...]
export function smoothOutline(points, samplesPer = 6) {
  const pts = points.map(([x, y]) => new V3(x, y, 0));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  return curve.getPoints(points.length * samplesPer).map((p) => [p.x, p.y]);
}

export function ring(inner, outer, seg = 48) {
  return new THREE.RingGeometry(inner, outer, seg, 1);
}

export function torus(r, tube, seg = 32, tubSeg = 8, arc = Math.PI * 2) {
  return new THREE.TorusGeometry(r, tube, tubSeg, seg, arc);
}
