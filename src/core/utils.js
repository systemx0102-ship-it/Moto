// General math / helpers shared across the game.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const remap = (v, a, b, c, d) => c + (d - c) * clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Frame-rate independent exponential smoothing.
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const sign = (v) => (v < 0 ? -1 : 1);
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function moveTowards(v, target, maxDelta) {
  if (Math.abs(target - v) <= maxDelta) return target;
  return v + Math.sign(target - v) * maxDelta;
}

// Deterministic PRNG (mulberry32).
export function rng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
}

// ---------------------------------------------------------------------------
// Simplex noise 2D (Stefan Gustavson, public domain) + fbm helpers.
const GRAD3 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
export class Noise2D {
  constructor(seed = 1) {
    const r = rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  noise(xin, yin) {
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    const perm = this.perm;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = GRAD3[perm[ii + perm[jj]] & 7]; t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = GRAD3[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = GRAD3[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * (n0 + n1 + n2); // [-1, 1]
  }
  fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) { s += a * this.noise(x * f, y * f); n += a; a *= gain; f *= lac; }
    return s / n;
  }
  ridged(x, y, oct = 4) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) { s += a * (1 - Math.abs(this.noise(x * f, y * f))); n += a; a *= 0.5; f *= 2; }
    return s / n;
  }
}

// Tileable value noise on a wrapped lattice (for seamless textures).
export class TileNoise {
  constructor(seed = 1, period = 16) {
    const r = rng(seed);
    this.period = period;
    this.v = new Float32Array(period * period);
    for (let i = 0; i < this.v.length; i++) this.v[i] = r() * 2 - 1;
  }
  at(ix, iy) {
    const p = this.period;
    ix = ((ix % p) + p) % p; iy = ((iy % p) + p) % p;
    return this.v[iy * p + ix];
  }
  // x,y in [0,1) -> seamless
  sample(x, y) {
    const p = this.period;
    const fx = x * p, fy = y * p;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = this.at(ix, iy), b = this.at(ix + 1, iy), c = this.at(ix, iy + 1), d = this.at(ix + 1, iy + 1);
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }
}

// Multi-octave seamless noise built from several TileNoise lattices.
export function makeTileFbm(seed, basePeriod = 4, octaves = 5) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(new TileNoise(seed + o * 101, basePeriod << o));
  return (x, y) => {
    let s = 0, a = 1, n = 0;
    for (let o = 0; o < octaves; o++) { s += layers[o].sample(x, y) * a; n += a; a *= 0.5; }
    return s / n;
  };
}

export function formatTime(ms, showMs = true) {
  if (!isFinite(ms) || ms <= 0) return showMs ? '-:--.---' : '-:--';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = Math.floor(ms % 1000);
  return showMs
    ? `${m}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatGap(ms) {
  if (!isFinite(ms)) return '';
  const s = ms / 1000;
  return (s >= 0 ? '+' : '-') + Math.abs(s).toFixed(3);
}

export function hexToRgb(hex) {
  const n = typeof hex === 'number' ? hex : parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function ordinal(n) {
  return `${n}º`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
