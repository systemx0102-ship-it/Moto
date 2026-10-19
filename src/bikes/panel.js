// Hard-surface body panels: Coons patches through four boundary curves, crowned
// outward and thickened into thin shells with a rolled edge — the way real fairing
// plastics read: crisp outlines, visible edge thickness and shut-line gaps between
// neighbouring panels. Authored for the right side (z >= 0) and mirrored.
import * as THREE from 'three';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Centripetal-ish Catmull-Rom through pts, resampled to n+1 points evenly by arc length.
export function spline(pts, n) {
  if (pts.length === 2) return Array.from({ length: n + 1 }, (_, i) => lerp3(pts[0], pts[1], i / n));
  const dense = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      dense.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  dense.push(pts[pts.length - 1]);
  const acc = [0];
  for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1] + len(sub(dense[i], dense[i - 1])));
  const L = acc[acc.length - 1] || 1;
  const out = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const d = (i / n) * L;
    while (j < acc.length - 2 && acc[j + 1] < d) j++;
    const t = (d - acc[j]) / ((acc[j + 1] - acc[j]) || 1);
    out.push(lerp3(dense[j], dense[j + 1], Math.min(1, Math.max(0, t))));
  }
  return out;
}

/**
 * Coons patch: bottom/top run rear->front (u), rear/front run bottom->top (v); the four
 * corners should coincide. Returns rows[v][u] of [x,y,z].
 * crown: { dir:[x,y,z] | fn(p)->[x,y,z], amount } bulges the interior outward.
 */
export function coons(bottom, top, rear, front, nu = 24, nv = 12, crown = null) {
  const B = spline(bottom, nu), T = spline(top, nu), R = spline(rear, nv), F = spline(front, nv);
  const c00 = B[0], c10 = B[nu], c01 = T[0], c11 = T[nu];
  const rows = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, row = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const p = [0, 1, 2].map((c) => (1 - v) * B[i][c] + v * T[i][c] + (1 - u) * R[j][c] + u * F[j][c]
        - ((1 - u) * (1 - v) * c00[c] + u * (1 - v) * c10[c] + (1 - u) * v * c01[c] + u * v * c11[c]));
      if (crown) {
        const k = crown.amount * Math.sin(Math.PI * u) * Math.sin(Math.PI * v) ** (crown.pv ?? 1);
        const d = typeof crown.dir === 'function' ? crown.dir(p, u, v) : crown.dir;
        const dl = len(d) || 1;
        for (let c = 0; c < 3; c++) p[c] += (d[c] / dl) * k;
      }
      row.push(p);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Thin shell from a grid: outer skin, inner skin offset by `thick` against the outward
 * normal, and an edge band; the outer boundary is rolled in a little so the edge reads.
 * o: { thick, out:[x,y,z] (rough outward direction to orient normals), mirror (bool),
 *      uv: fn(p, u, v) -> [u, v] (defaults to the grid parameters) }
 */
export function shell(rows, o = {}) {
  const nv = rows.length - 1, nu = rows[0].length - 1;
  const thick = o.thick ?? 0.004;
  const P = rows.map((r) => r.map((p) => p.slice()));
  // normals by central differences, oriented along `out`
  const N = [];
  let flip = 0;
  for (let j = 0; j <= nv; j++) {
    const nr = [];
    for (let i = 0; i <= nu; i++) {
      const du = sub(P[j][Math.min(nu, i + 1)], P[j][Math.max(0, i - 1)]);
      const dv = sub(P[Math.min(nv, j + 1)][i], P[Math.max(0, j - 1)][i]);
      const n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
      const l = len(n) || 1;
      nr.push([n[0] / l, n[1] / l, n[2] / l]);
    }
    N.push(nr);
  }
  const out = o.out || [0, 0, 1];
  const mid = N[nv >> 1][nu >> 1];
  if (mid[0] * out[0] + mid[1] * out[1] + mid[2] * out[2] < 0) flip = 1;
  if (flip) for (const r of N) for (const n of r) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }
  // rolled edge: pull the outer boundary toward the inside by half the thickness
  const roll = o.roll ?? 0.6;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    if (i === 0 || j === 0 || i === nu || j === nv) for (let c = 0; c < 3; c++) P[j][i][c] -= N[j][i][c] * thick * roll;
  }
  const pos = [], uv = [], idx = [];
  const uvf = o.uv || ((p, u, v) => [u, v]);
  const skin = (off) => {
    const base = pos.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const p = P[j][i], n = N[j][i];
      pos.push(p[0] - n[0] * off, p[1] - n[1] * off, p[2] - n[2] * off);
      uv.push(...uvf(p, i / nu, j / nv));
    }
    return base;
  };
  const o0 = skin(0), o1 = skin(thick);
  const at = (b, i, j) => b + j * (nu + 1) + i;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = at(o0, i, j), b = at(o0, i + 1, j), c = at(o0, i, j + 1), d = at(o0, i + 1, j + 1);
    const a1 = at(o1, i, j), b1 = at(o1, i + 1, j), c1 = at(o1, i, j + 1), d1 = at(o1, i + 1, j + 1);
    if (flip) { idx.push(a, c, b, b, c, d); idx.push(a1, b1, c1, b1, d1, c1); } else { idx.push(a, b, c, b, d, c); idx.push(a1, c1, b1, b1, c1, d1); }
  }
  // edge band round the boundary loop
  const loop = [];
  for (let i = 0; i < nu; i++) loop.push([i, 0]);
  for (let j = 0; j < nv; j++) loop.push([nu, j]);
  for (let i = nu; i > 0; i--) loop.push([i, nv]);
  for (let j = nv; j > 0; j--) loop.push([0, j]);
  for (let k = 0; k < loop.length; k++) {
    const [i0, j0] = loop[k], [i1, j1] = loop[(k + 1) % loop.length];
    const a = at(o0, i0, j0), b = at(o0, i1, j1), a1 = at(o1, i0, j0), b1 = at(o1, i1, j1);
    if (flip) idx.push(a, b, a1, b, b1, a1); else idx.push(a, a1, b, b, a1, b1);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g = g.toNonIndexed();
  g.computeVertexNormals();
  // smooth the skins (keep the edge band sharp): re-average normals per position on skins
  smoothSkins(g, (nu + 1) * (nv + 1) * 2);
  return g;
}

// Smooth normals across shared positions (the non-indexed copy split them per face).
function smoothSkins(g) {
  const p = g.attributes.position, n = g.attributes.normal;
  const map = new Map();
  const key = (i) => `${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    let e = map.get(k);
    if (!e) { e = []; map.set(k, e); }
    e.push(i);
  }
  for (const list of map.values()) {
    if (list.length < 2) continue;
    // group by similar direction so the rolled edge stays crisp against the band
    const groups = [];
    for (const i of list) {
      const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
      let gp = groups.find((G) => G.nx * nx + G.ny * ny + G.nz * nz > 0.5 * G.c);
      if (!gp) { gp = { nx: 0, ny: 0, nz: 0, c: 0, ids: [] }; groups.push(gp); }
      gp.nx += nx; gp.ny += ny; gp.nz += nz; gp.c++; gp.ids.push(i);
    }
    for (const G of groups) {
      const l = Math.hypot(G.nx, G.ny, G.nz) || 1;
      for (const i of G.ids) n.setXYZ(i, G.nx / l, G.ny / l, G.nz / l);
    }
  }
  n.needsUpdate = true;
}

// Mirror a right-side panel to the left (z -> -z) with flipped winding and u mirrored
// into the left half of a side-projected livery when `uvLeft` is given.
export function mirrorPanel(g, uvLeft = null) {
  const m = g.clone();
  m.scale(1, 1, -1);
  const p = m.attributes.position, n = m.attributes.normal;
  for (let i = 0; i < p.count; i += 3) {
    for (const attr of [p, n, m.attributes.uv]) {
      const s = attr.itemSize;
      for (let c = 0; c < s; c++) { const t = attr.array[(i + 1) * s + c]; attr.array[(i + 1) * s + c] = attr.array[(i + 2) * s + c]; attr.array[(i + 2) * s + c] = t; }
    }
  }
  if (uvLeft) { const uv = m.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, ...uvLeft(uv.getX(i), uv.getY(i))); }
  m.computeVertexNormals();
  smoothSkins(m);
  return m;
}

// Side-projection UV for liveries: x/y over the bike's side frame -> right half of the
// texture (v .5..1); the mirrored left panels map to the bottom half, read front-to-back.
export function sideUV(frame) {
  const [x0, x1, y0, y1] = frame;
  return (p) => [(p[0] - x0) / (x1 - x0), 0.5 + 0.5 * ((p[1] - y0) / (y1 - y0))];
}
export const sideUVLeft = (u, v) => [1 - u, v - 0.5];

// Point on a panel grid at parameters (u, v) by bilinear interpolation of the rows.
export function sample(rows, u, v) {
  const nv = rows.length - 1, nu = rows[0].length - 1;
  const fu = Math.min(nu - 1e-6, Math.max(0, u * nu)), fv = Math.min(nv - 1e-6, Math.max(0, v * nv));
  const i = Math.floor(fu), j = Math.floor(fv), a = fu - i, b = fv - j;
  const p00 = rows[j][i], p10 = rows[j][i + 1], p01 = rows[j + 1][i], p11 = rows[j + 1][i + 1];
  return [0, 1, 2].map((c) => (1 - a) * (1 - b) * p00[c] + a * (1 - b) * p10[c] + (1 - a) * b * p01[c] + a * b * p11[c]);
}

// A sub-patch lying on a panel: corners given in the panel's (u, v) space (rear-bottom,
// front-bottom, front-top, rear-top), lifted `off` along the outward direction `out`.
export function onPanel(rows, quad, off, out, nu = 10, nv = 6) {
  const [q0, q1, q2, q3] = quad;
  const res = [];
  const o = Math.hypot(...out) || 1;
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, row = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const pu = (1 - v) * ((1 - u) * q0[0] + u * q1[0]) + v * ((1 - u) * q3[0] + u * q2[0]);
      const pv = (1 - v) * ((1 - u) * q0[1] + u * q1[1]) + v * ((1 - u) * q3[1] + u * q2[1]);
      const p = sample(rows, pu, pv);
      row.push([p[0] + (out[0] / o) * off, p[1] + (out[1] / o) * off, p[2] + (out[2] / o) * off]);
    }
    res.push(row);
  }
  return res;
}
