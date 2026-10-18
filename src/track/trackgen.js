// Pure track geometry: turtle path -> closed, smoothed, resampled centerline
// with curvature, elevation and banking. No three.js dependency (testable in node).

const TAU = Math.PI * 2;

// Corner-polygon paths: each corner [x, z, radius] is rounded with a tangent arc
// (fillet). Closed by construction. Path starts mid-way along `startEdge`.
export function filletPath(def, step = 1) {
  const C = def.corners;
  const n = C.length;
  const fil = [];
  for (let i = 0; i < n; i++) {
    const P = C[(i - 1 + n) % n], V = C[i], Q = C[(i + 1) % n];
    let ax = V[0] - P[0], az = V[1] - P[1];
    let bx = Q[0] - V[0], bz = Q[1] - V[1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    ax /= la; az /= la; bx /= lb; bz /= lb;
    const cross = ax * bz - az * bx; // >0 => turning toward -x? (see heading convention)
    const dot = ax * bx + az * bz;
    const theta = Math.atan2(cross, dot); // signed turn angle
    fil.push({ V, ax, az, bx, bz, la, lb, theta, R: V[2] ?? 40 });
  }
  // shrink radii that don't fit
  for (let i = 0; i < n; i++) {
    const f = fil[i], g = fil[(i + 1) % n];
    const Ti = f.R * Math.tan(Math.abs(f.theta) / 2), Tj = g.R * Math.tan(Math.abs(g.theta) / 2);
    if (Ti + Tj > f.lb * 0.98) {
      const k = (f.lb * 0.98) / (Ti + Tj);
      f.R *= k; g.R *= k;
    }
  }
  const pts = [];
  for (let i = 0; i < n; i++) {
    const f = fil[i];
    const T = f.R * Math.tan(Math.abs(f.theta) / 2);
    const p1 = [f.V[0] - f.ax * T, f.V[1] - f.az * T];
    // heading convention: dir = (sin h, cos h)
    const h0 = Math.atan2(f.ax, f.az);
    // cross>0 means b is rotated counter-clockwise from a in (x,z) plane -> heading decreases
    const dh = -f.theta;
    const len = Math.abs(dh) * f.R;
    const steps = Math.max(2, Math.round(len / step));
    let x = p1[0], z = p1[1], h = h0;
    pts.push([x, z]);
    for (let k = 0; k < steps; k++) {
      const ds = len / steps;
      h += dh / steps / 2; x += Math.sin(h) * ds; z += Math.cos(h) * ds; h += dh / steps / 2;
      pts.push([x, z]);
    }
    // straight to next corner's arc start
    const g = fil[(i + 1) % n];
    const Tn = g.R * Math.tan(Math.abs(g.theta) / 2);
    const q = [g.V[0] - g.ax * Tn, g.V[1] - g.az * Tn];
    const L = Math.hypot(q[0] - x, q[1] - z);
    const m = Math.max(1, Math.round(L / step));
    for (let k = 1; k < m; k++) pts.push([x + (q[0] - x) * (k / m), z + (q[1] - z) * (k / m)]);
  }
  // rotate the array so index 0 sits in the middle of the start edge
  const se = def.startEdge ?? longestEdge(C);
  const A = C[se], B = C[(se + 1) % n];
  const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  let best = 0, bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - mid[0], pts[i][1] - mid[1]);
    if (d < bd) { bd = d; best = i; }
  }
  const rot = pts.slice(best).concat(pts.slice(0, best));
  return { pts: rot, fil };
}

function longestEdge(C) {
  let best = 0, bl = 0;
  for (let i = 0; i < C.length; i++) {
    const a = C[i], b = C[(i + 1) % C.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > bl) { bl = l; best = i; }
  }
  return best;
}

function resampleClosed(pts, ds) {
  // drop duplicate end point if present
  const p = pts.slice();
  const last = p[p.length - 1], first = p[0];
  if (Math.hypot(last[0] - first[0], last[1] - first[1]) < 0.5) p.pop();
  const n = p.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const L = cum[n];
  const N = Math.max(16, Math.round(L / ds));
  const out = [];
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = (k / N) * L;
    while (cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const a = p[j], b = p[(j + 1) % n];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return { pts: out, L };
}

function smoothClosed(pts, iters, k = 0.5) {
  let p = pts.map((q) => q.slice());
  const n = p.length;
  for (let it = 0; it < iters; it++) {
    const q = p.map((v) => v.slice());
    for (let i = 0; i < n; i++) {
      const a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
      q[i][0] = p[i][0] + k * ((a[0] + b[0]) / 2 - p[i][0]);
      q[i][1] = p[i][1] + k * ((a[1] + b[1]) / 2 - p[i][1]);
    }
    p = q;
  }
  return p;
}

function periodicCatmull(keys, u) {
  // keys: [[u, value], ...] sorted, u in [0,1)
  const n = keys.length;
  let i = n - 1;
  for (let k = 0; k < n; k++) { if (keys[k][0] > u) { i = k - 1; break; } }
  if (i < 0) i = n - 1;
  const k1 = keys[i], k2 = keys[(i + 1) % n];
  const k0 = keys[(i - 1 + n) % n], k3 = keys[(i + 2) % n];
  let u1 = k1[0], u2 = k2[0];
  if (u2 <= u1) u2 += 1;
  let uu = u; if (uu < u1) uu += 1;
  const t = (uu - u1) / (u2 - u1 || 1);
  const p0 = k0[1], p1 = k1[1], p2 = k2[1], p3 = k3[1];
  const t2 = t * t, t3 = t2 * t;
  // slightly tensioned catmull (0.5)
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * Build the centerline data for a track definition.
 * Returns typed arrays indexed by sample: x, y, z, tx, tz (unit tangent), rx, rz (right),
 * kappa (signed curvature, +left), bank (rad, + raises right side), s (arc length).
 */
// Layouts are authored compactly and scaled up uniformly: longer straights and wider,
// faster bends. Jump positions follow the scale; crest shapes keep their size.
export const TRACK_SCALE = 1.5;
function scaledDef(def) {
  const S = def.scale ?? TRACK_SCALE;
  if (S === 1) return def;
  return {
    ...def,
    corners: def.corners.map(([x, z, r]) => [x * S, z * S, (r ?? 40) * S]),
    bumps: def.bumps && def.bumps.map(([s0, H, w]) => [s0 * S, H, w]),
    elevation: def.elevation && def.elevation.map(([f, h]) => [f, h * Math.sqrt(S)]),
  };
}

export function buildCenterline(def, ds = 2) {
  def = scaledDef(def);
  const fp = filletPath(def, 1);
  let { pts } = resampleClosed(fp.pts, ds);
  pts = smoothClosed(pts, def.smooth ?? 6, 0.5);
  const res = resampleClosed(pts, ds);
  pts = res.pts;
  const N = pts.length;
  const L = res.L;
  const x = new Float32Array(N), y = new Float32Array(N), z = new Float32Array(N);
  const tx = new Float32Array(N), tz = new Float32Array(N), rx = new Float32Array(N), rz = new Float32Array(N);
  const kappa = new Float32Array(N), bank = new Float32Array(N), s = new Float32Array(N), grade = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    x[i] = pts[i][0]; z[i] = pts[i][1]; s[i] = (i / N) * L;
  }
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
    // right = t x up = (-tz, 0, tx)?  t=(tx,0,tz), up=(0,1,0): t x up = (0*0-tz*1, tz*0-tx*0, tx*1-0*0) = (-tz, 0, tx)
    rx[i] = -tz[i]; rz[i] = tx[i];
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const h0 = Math.atan2(tx[i], tz[i]), h1 = Math.atan2(tx[j], tz[j]);
    let dh = h1 - h0;
    while (dh > Math.PI) dh -= TAU;
    while (dh < -Math.PI) dh += TAU;
    kappa[i] = dh / (L / N);
  }
  // smooth curvature for banking & racing purposes
  const ks = smooth1D(kappa, 12);
  const bf = def.bank ?? 0.6;
  for (let i = 0; i < N; i++) bank[i] = Math.max(-0.2, Math.min(0.2, ks[i] * bf * 18));
  const bs = smooth1D(bank, 8);
  bank.set(bs);
  // elevation
  const ek = (def.elevation || [[0, 0]]).slice().sort((p, q) => p[0] - q[0]);
  for (let i = 0; i < N; i++) y[i] = ek.length > 1 ? periodicCatmull(ek, i / N) : ek[0][1];
  // sharp crests (jumps): [s (m, negative = from the end), height, half-length]
  for (const [s0r, H, w] of def.bumps || []) {
    const s0 = s0r < 0 ? L + s0r : s0r;
    for (let i = 0; i < N; i++) {
      let ds2 = (i / N) * L - s0;
      if (ds2 > L / 2) ds2 -= L; if (ds2 < -L / 2) ds2 += L;
      if (Math.abs(ds2) < w) y[i] += H * 0.5 * (1 + Math.cos((Math.PI * ds2) / w));
    }
  }
  for (let i = 0; i < N; i++) grade[i] = (y[(i + 1) % N] - y[(i - 1 + N) % N]) / (2 * L / N);
  return { N, L, ds: L / N, x, y, z, tx, tz, rx, rz, kappa, kappaSmooth: ks, bank, s, grade, fil: fp.fil };
}

export function smooth1D(arr, radius) {
  const N = arr.length;
  const out = new Float32Array(N);
  const w = radius * 2 + 1;
  let acc = 0;
  for (let k = -radius; k <= radius; k++) acc += arr[(k + N) % N];
  for (let i = 0; i < N; i++) {
    out[i] = acc / w;
    acc += arr[(i + radius + 1) % N] - arr[(i - radius + N) % N];
  }
  return out;
}

// Minimal distance between non-adjacent parts of the centerline (overlap check).
export function selfClearance(c, skipMeters = 120) {
  const skip = Math.ceil(skipMeters / c.ds);
  let best = Infinity, bi = -1, bj = -1;
  for (let i = 0; i < c.N; i += 2) {
    for (let j = i + skip; j < c.N; j += 2) {
      if (c.N - (j - i) < skip) continue;
      const d = Math.hypot(c.x[i] - c.x[j], c.z[i] - c.z[j]);
      if (d < best) { best = d; bi = i; bj = j; }
    }
  }
  return { dist: best, i: bi, j: bj };
}
