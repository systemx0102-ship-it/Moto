// Procedural texture factory. Everything is generated at runtime on <canvas>
// so the game needs zero external image assets.
import * as THREE from 'three';
import { makeTileFbm, rng, clamp, hexToRgb } from './utils.js';

const cache = new Map();
let maxAniso = 8;
export function setMaxAnisotropy(a) { maxAniso = a; }

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d', { willReadFrequently: false }) };
}

export function toTexture(c, { repeat = [1, 1], srgb = true, aniso = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso ? maxAniso : 1;
  t.needsUpdate = true;
  return t;
}

// Height field (Float32Array, values ~[0,1]) -> tangent-space normal map canvas.
export function heightToNormal(h, w, hgt, strength = 2) {
  const { c, g } = makeCanvas(w, hgt);
  const img = g.createImageData(w, hgt);
  const d = img.data;
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const xl = h[y * w + ((x - 1 + w) % w)], xr = h[y * w + ((x + 1) % w)];
      const yu = h[((y - 1 + hgt) % hgt) * w + x], yd = h[((y + 1) % hgt) * w + x];
      let nx = (xl - xr) * strength, ny = (yd - yu) * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function fillPixels(w, h, fn) {
  const { c, g } = makeCanvas(w, h);
  const img = g.createImageData(w, h);
  const d = img.data;
  const out = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      fn(x, y, out);
      const i = (y * w + x) * 4;
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
    }
  }
  g.putImageData(img, 0, 0);
  return { c, g };
}

// ---------------------------------------------------------------------------
// Road surface: asphalt + markings. u = across road, v = along road.
export function roadTextures({ seed = 7, size = 512, base = [52, 54, 58], edge = '#f2f2f2', centerDash = false,
  centerColor = '#f2f2f2', wet = false, rubber = true, patches = false, edgeRed = false } = {}) {
  const key = `road:${seed}:${size}:${base}:${edge}:${centerDash}:${centerColor}:${wet}:${rubber}:${patches}:${edgeRed}`;
  return cached(key, () => {
    const W = size, H = size * 2;
    const n1 = makeTileFbm(seed, 8, 6);
    const n2 = makeTileFbm(seed + 9, 32, 3);
    const n3 = makeTileFbm(seed + 21, 2, 3);
    const r = rng(seed);
    const height = new Float32Array(W * H);
    const rough = makeCanvas(W, H);
    const { c, g } = fillPixels(W, H, (x, y, o) => {
      const u = x / W, v = y / H;
      const big = n3(u, v * 2);
      const grain = n1(u, v * 2) * 0.5 + n2(u, v * 2) * 0.5;
      const speck = r() < 0.06 ? (r() - 0.3) * 60 : 0;
      // rubbered-in racing groove in the middle third
      let groove = 0;
      if (rubber) {
        const du = Math.abs(u - 0.5 - big * 0.08);
        groove = Math.exp(-du * du * 30) * 16;
      }
      const k = 1 + big * 0.12;
      let rr = base[0] * k + grain * 22 + speck - groove;
      let gg = base[1] * k + grain * 22 + speck - groove;
      let bb = base[2] * k + grain * 22 + speck - groove;
      if (patches && big > 0.25) { rr -= 10; gg -= 10; bb -= 8; }
      o[0] = clamp(rr, 0, 255); o[1] = clamp(gg, 0, 255); o[2] = clamp(bb, 0, 255); o[3] = 255;
      height[y * W + x] = grain * 0.5 + (speck > 0 ? 0.25 : 0);
    });
    // Markings
    g.globalAlpha = 0.92;
    const lw = W * 0.022;
    const edgeOff = W * 0.035;
    const drawEdge = (xx) => {
      if (edgeRed) {
        for (let y = 0; y < H; y += H / 8) {
          g.fillStyle = (Math.round(y / (H / 8)) % 2) ? '#d01818' : '#f0f0f0';
          g.fillRect(xx, y, lw, H / 8);
        }
      } else {
        g.fillStyle = edge;
        g.fillRect(xx, 0, lw, H);
      }
    };
    drawEdge(edgeOff);
    drawEdge(W - edgeOff - lw);
    if (centerDash) {
      g.fillStyle = centerColor;
      for (let y = 0; y < H; y += H / 2) g.fillRect(W / 2 - lw / 2, y + H * 0.05, lw, H * 0.22);
    }
    // worn paint noise
    g.globalAlpha = 1;
    const img = g.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      const wear = r();
      if (wear < 0.18) { img.data[i] *= 0.85; img.data[i + 1] *= 0.85; img.data[i + 2] *= 0.85; }
    }
    g.putImageData(img, 0, 0);

    // roughness: wet -> low
    const rg = rough.g;
    const rimg = rg.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const hh = height[y * W + x];
        let rv = wet ? 70 + hh * 90 : 200 + hh * 50;
        if (wet) {
          const u = x / W, v = y / H;
          const puddle = n3(u * 1.0, v * 2) > 0.15 ? 0.25 : 1;
          rv *= puddle;
        }
        rimg.data[i] = rv; rimg.data[i + 1] = rv; rimg.data[i + 2] = rv; rimg.data[i + 3] = 255;
      }
    }
    rg.putImageData(rimg, 0, 0);
    const normal = heightToNormal(height, W, H, 3);
    return {
      map: toTexture(c),
      normalMap: toTexture(normal, { srgb: false }),
      roughnessMap: toTexture(rough.c, { srgb: false }),
      aspect: H / W,
    };
  });
}

// Generic ground (grass, sand, snow, dirt, gravel, rock, forest)
const GROUND = {
  grass: { a: [58, 92, 34], b: [96, 128, 52], c: [44, 64, 28], scale: 6, blades: true, rough: 235, bump: 2.5 },
  dryGrass: { a: [120, 116, 60], b: [150, 140, 80], c: [92, 88, 48], scale: 6, blades: true, rough: 240, bump: 2.5 },
  sand: { a: [196, 120, 70], b: [222, 156, 98], c: [160, 92, 54], scale: 4, ripples: true, rough: 230, bump: 2 },
  snow: { a: [228, 234, 244], b: [250, 252, 255], c: [196, 208, 226], scale: 3, rough: 150, bump: 1.5 },
  dirt: { a: [104, 78, 54], b: [134, 102, 70], c: [76, 56, 40], scale: 6, pebbles: true, rough: 240, bump: 3 },
  gravel: { a: [150, 144, 132], b: [184, 178, 166], c: [110, 104, 96], scale: 16, pebbles: true, rough: 245, bump: 4 },
  forest: { a: [52, 62, 30], b: [84, 74, 40], c: [36, 40, 22], scale: 5, pebbles: true, blades: true, rough: 240, bump: 3 },
  rock: { a: [150, 82, 52], b: [186, 112, 72], c: [112, 58, 38], scale: 3, strata: true, rough: 220, bump: 5 },
  asphaltDark: { a: [30, 32, 36], b: [48, 50, 56], c: [22, 22, 26], scale: 10, rough: 200, bump: 2 },
  volcanic: { a: [34, 30, 30], b: [58, 50, 48], c: [20, 18, 18], scale: 6, pebbles: true, rough: 230, bump: 4 },
};

export function groundTextures(type = 'grass', seed = 3, size = 512) {
  return cached(`ground:${type}:${seed}:${size}`, () => {
    const P = GROUND[type] || GROUND.grass;
    const W = size;
    const n1 = makeTileFbm(seed, P.scale, 6);
    const n2 = makeTileFbm(seed + 5, 3, 3);
    const n3 = makeTileFbm(seed + 11, 64, 2);
    const r = rng(seed * 7 + 1);
    const height = new Float32Array(W * W);
    const { c, g } = fillPixels(W, W, (x, y, o) => {
      const u = x / W, v = y / W;
      let t = n1(u, v) * 0.5 + 0.5;
      const m = n2(u, v) * 0.5 + 0.5;
      let hh = t;
      if (P.ripples) { const rp = Math.sin((v * 22 + n2(u, v) * 3) * Math.PI * 2) * 0.5 + 0.5; t = t * 0.7 + rp * 0.3; hh = rp; }
      if (P.strata) { const st = Math.sin((v * 14 + n1(u, v) * 2) * Math.PI * 2) * 0.5 + 0.5; t = t * 0.6 + st * 0.4; hh = st * 0.7 + t * 0.3; }
      if (P.blades) { const bl = n3(u, v) * 0.5 + 0.5; t = t * 0.6 + bl * 0.4; hh = hh * 0.5 + bl * 0.5; }
      let k = r();
      let col;
      if (P.pebbles && k < 0.05) { col = P.c.map((ch) => ch * 0.8 + 30 * r()); hh += 0.4; }
      else col = [0, 1, 2].map((i) => P.a[i] + (P.b[i] - P.a[i]) * t * 0.8 + (P.c[i] - P.a[i]) * (1 - m) * 0.5);
      const j = (r() - 0.5) * 10;
      o[0] = clamp(col[0] + j, 0, 255); o[1] = clamp(col[1] + j, 0, 255); o[2] = clamp(col[2] + j, 0, 255); o[3] = 255;
      height[y * W + x] = hh;
    });
    const normal = heightToNormal(height, W, W, P.bump);
    const rough = fillPixels(W, W, (x, y, o) => { const v = P.rough - height[y * W + x] * 30; o[0] = o[1] = o[2] = v; o[3] = 255; });
    return {
      map: toTexture(c),
      normalMap: toTexture(normal, { srgb: false }),
      roughnessMap: toTexture(rough.c, { srgb: false }),
    };
  });
}

// Red/white racing curb (u across, v along)
export function curbTexture(colA = '#d81c1c', colB = '#f4f4f4') {
  return cached(`curb:${colA}:${colB}`, () => {
    const { c, g } = makeCanvas(128, 256);
    for (let i = 0; i < 2; i++) {
      g.fillStyle = i ? colB : colA;
      g.fillRect(0, i * 128, 128, 128);
    }
    const grd = g.createLinearGradient(0, 0, 128, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.35)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(0,0,0,0.0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 256);
    // dirt
    const r = rng(4);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(30,30,30,${r() * 0.25})`;
      g.fillRect(r() * 128, r() * 256, 2 + r() * 3, 2 + r() * 3);
    }
    return toTexture(c);
  });
}

export function concreteTexture(stripe = null, seed = 2) {
  return cached(`concrete:${stripe}:${seed}`, () => {
    const W = 256;
    const n = makeTileFbm(seed, 8, 5);
    const { c, g } = fillPixels(W, W, (x, y, o) => {
      const v = 170 + n(x / W, y / W) * 40;
      o[0] = v; o[1] = v; o[2] = v * 0.98; o[3] = 255;
    });
    // panel joints
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, 3, W);
    if (stripe) {
      g.fillStyle = stripe;
      g.fillRect(0, W * 0.62, W, W * 0.12);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, W * 0.92, W, W * 0.08);
    return toTexture(c);
  });
}

export function tireWallTexture() {
  return cached('tirewall', () => {
    const { c, g } = makeCanvas(256, 128);
    g.fillStyle = '#111'; g.fillRect(0, 0, 256, 128);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 4; i++) {
        const x = i * 64 + 32 + (row % 2) * 32, y = row * 42 + 22;
        const grd = g.createRadialGradient(x, y, 4, x, y, 30);
        grd.addColorStop(0, '#000');
        grd.addColorStop(0.45, '#000');
        grd.addColorStop(0.5, '#2a2a2a');
        grd.addColorStop(0.9, '#1a1a1a');
        grd.addColorStop(1, '#080808');
        g.fillStyle = grd;
        g.beginPath(); g.arc(x, y, 30, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(x - 64 * 4, y, 30, 0, Math.PI * 2); g.fill();
      }
    }
    // colored belt
    g.fillStyle = '#c8102e'; g.fillRect(0, 54, 256, 16);
    g.fillStyle = '#fff'; g.fillRect(0, 58, 256, 3);
    return toTexture(c);
  });
}

export function armcoTexture() {
  return cached('armco', () => {
    const { c, g } = makeCanvas(64, 64);
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, '#9aa0a6'); grd.addColorStop(0.25, '#e6eaee'); grd.addColorStop(0.5, '#8d9399');
    grd.addColorStop(0.75, '#d9dde1'); grd.addColorStop(1, '#7d8389');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return toTexture(c);
  });
}

// Building facade with windows (day/night variants), returns {map, emissiveMap}
export function facadeTextures(seed = 1, { night = false, hue = 210, cols = 6, rows = 12, glass = false } = {}) {
  return cached(`facade:${seed}:${night}:${hue}:${cols}:${rows}:${glass}`, () => {
    const W = 256, H = 512;
    const r = rng(seed);
    const map = makeCanvas(W, H);
    const em = makeCanvas(W, H);
    const g = map.g, e = em.g;
    const baseL = 20 + r() * 25;
    g.fillStyle = `hsl(${hue},${8 + r() * 12}%,${night ? baseL * 0.5 : baseL + 20}%)`;
    g.fillRect(0, 0, W, H);
    e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
    const cw = W / cols, rh = H / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = x * cw + cw * 0.15, py = y * rh + rh * 0.18, ww = cw * 0.7, hh = rh * 0.6;
        const lit = r() < (night ? 0.55 : 0.1);
        if (glass) {
          g.fillStyle = `hsl(${hue + 10},40%,${night ? 10 : 30 + r() * 20}%)`;
        } else {
          g.fillStyle = night ? '#0b0d12' : `hsl(${hue},25%,${18 + r() * 14}%)`;
        }
        g.fillRect(px, py, ww, hh);
        if (lit) {
          const warm = r() < 0.6;
          const col = warm ? `hsl(${35 + r() * 15},90%,${55 + r() * 20}%)` : `hsl(${190 + r() * 40},80%,${60 + r() * 15}%)`;
          e.fillStyle = col;
          e.fillRect(px, py, ww, hh);
          g.fillStyle = col; g.globalAlpha = night ? 0.9 : 0.25; g.fillRect(px, py, ww, hh); g.globalAlpha = 1;
          // blinds
          if (r() < 0.4) { e.fillStyle = 'rgba(0,0,0,0.5)'; e.fillRect(px, py, ww, hh * r()); }
        }
      }
    }
    return { map: toTexture(map.c), emissiveMap: toTexture(em.c) };
  });
}

// Neon sign
export function neonSignTexture(text, color = '#ff2bd6', seed = 1) {
  return cached(`neon:${text}:${color}:${seed}`, () => {
    const { c, g } = makeCanvas(512, 128);
    g.fillStyle = '#05050a'; g.fillRect(0, 0, 512, 128);
    g.font = '900 72px Orbitron, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 24;
    g.strokeStyle = color; g.lineWidth = 6;
    g.strokeText(text, 256, 66);
    g.fillStyle = '#fff'; g.shadowBlur = 8;
    g.fillText(text, 256, 66);
    return toTexture(c, { wrap: false });
  });
}

// Sponsor billboard (fictional brands only)
export function billboardTexture(text, bg = '#0a2a6a', fg = '#ffffff', accent = '#ffcc00') {
  return cached(`bill:${text}:${bg}:${fg}:${accent}`, () => {
    const { c, g } = makeCanvas(512, 128);
    const grd = g.createLinearGradient(0, 0, 512, 128);
    grd.addColorStop(0, bg); grd.addColorStop(1, shade(bg, -30));
    g.fillStyle = grd; g.fillRect(0, 0, 512, 128);
    g.fillStyle = accent; g.fillRect(0, 108, 512, 20);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(70, 0); g.lineTo(30, 108); g.lineTo(0, 108); g.fill();
    g.font = '900 64px Orbitron, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = fg;
    g.fillText(text, 280, 56, 420);
    return toTexture(c, { wrap: false });
  });
}

export function shade(hex, pct) {
  const [r, g, b] = hexToRgb(hex);
  const f = (v) => clamp(Math.round(v + (pct / 100) * 255), 0, 255);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function carbonTexture() {
  return cached('carbon', () => {
    const S = 128;
    const cells = 8;
    const cw = S / cells;
    const height = new Float32Array(S * S);
    const { c } = fillPixels(S, S, (x, y, o) => {
      const cx = Math.floor(x / cw), cy = Math.floor(y / cw);
      const fx = (x % cw) / cw, fy = (y % cw) / cw;
      const horiz = ((cx + cy) & 1) === 0;
      const t = horiz ? fx : fy;
      const s = Math.sin(t * Math.PI);
      const v = 18 + s * 38 + (horiz ? 6 : 0);
      o[0] = v; o[1] = v; o[2] = v + 4; o[3] = 255;
      height[y * S + x] = s;
    });
    return { map: toTexture(c, { repeat: [1, 1] }), normalMap: toTexture(heightToNormal(height, S, S, 1.5), { srgb: false }) };
  });
}

export function brushedTexture() {
  return cached('brushed', () => {
    const W = 256;
    const r = rng(12);
    const rows = new Float32Array(W).map(() => r());
    const { c } = fillPixels(W, W, (x, y, o) => {
      const v = 150 + rows[y] * 50 + (r() - 0.5) * 20;
      o[0] = v; o[1] = v; o[2] = v; o[3] = 255;
    });
    return toTexture(c, { srgb: false });
  });
}

export function leatherTexture() {
  return cached('leather', () => {
    const W = 256;
    const n = makeTileFbm(31, 24, 3);
    const height = new Float32Array(W * W);
    const { c } = fillPixels(W, W, (x, y, o) => {
      const h = n(x / W, y / W) * 0.5 + 0.5;
      height[y * W + x] = h;
      const v = 22 + h * 14;
      o[0] = v; o[1] = v; o[2] = v; o[3] = 255;
    });
    // stitched quilting pattern for seats
    return { map: toTexture(c), normalMap: toTexture(heightToNormal(height, W, W, 4), { srgb: false }) };
  });
}

export function gridFloorTexture() {
  return cached('gridfloor', () => {
    const W = 1024;
    const n = makeTileFbm(77, 8, 4);
    const { c, g } = fillPixels(W, W, (x, y, o) => {
      const v = 18 + n(x / W, y / W) * 8;
      o[0] = v; o[1] = v; o[2] = v + 2; o[3] = 255;
    });
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 3;
    for (let i = 0; i <= 8; i++) {
      g.beginPath(); g.moveTo(i * W / 8, 0); g.lineTo(i * W / 8, W); g.stroke();
      g.beginPath(); g.moveTo(0, i * W / 8); g.lineTo(W, i * W / 8); g.stroke();
    }
    return toTexture(c);
  });
}

export function radiatorTexture() {
  return cached('radiator', () => {
    const { c, g } = makeCanvas(128, 128);
    g.fillStyle = '#111'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#3a3a3a'; g.lineWidth = 2;
    for (let i = 0; i < 128; i += 6) { g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    g.strokeStyle = '#222';
    for (let i = 0; i < 128; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); }
    return toTexture(c);
  });
}

// Burnt titanium gradient along exhaust (v along length)
export function titaniumTexture() {
  return cached('titanium', () => {
    const { c, g } = makeCanvas(16, 256);
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#c9b27a'); grd.addColorStop(0.18, '#a9805a'); grd.addColorStop(0.32, '#6a5a8a');
    grd.addColorStop(0.45, '#5a6e96'); grd.addColorStop(0.62, '#9aa3ad'); grd.addColorStop(1, '#c4c8cc');
    g.fillStyle = grd; g.fillRect(0, 0, 16, 256);
    return toTexture(c);
  });
}

export function softCircleTexture() {
  return cached('softcircle', () => {
    const { c, g } = makeCanvas(64, 64);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return toTexture(c, { wrap: false, aniso: false });
  });
}

export function smokeTexture() {
  return cached('smoke', () => {
    const W = 128;
    const n = makeTileFbm(5, 4, 5);
    const { c } = fillPixels(W, W, (x, y, o) => {
      const dx = x / W - 0.5, dy = y / W - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const fall = clamp(1 - d, 0, 1);
      const a = clamp(fall * fall * (0.6 + n(x / W, y / W) * 0.8), 0, 1);
      o[0] = o[1] = o[2] = 255; o[3] = a * 255;
    });
    return toTexture(c, { wrap: false, aniso: false });
  });
}

export function flameTexture() {
  return cached('flame', () => {
    const { c, g } = makeCanvas(64, 256);
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.15, 'rgba(120,200,255,1)');
    grd.addColorStop(0.45, 'rgba(60,90,255,0.8)');
    grd.addColorStop(0.7, 'rgba(255,120,40,0.5)');
    grd.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 256);
    const side = g.createLinearGradient(0, 0, 64, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.5, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = side; g.fillRect(0, 0, 64, 256);
    const t = toTexture(c, { wrap: false, aniso: false });
    t.flipY = false; // hot end at v=0 (cone base)
    return t;
  });
}

export function starsTexture() {
  return cached('stars', () => {
    const W = 2048, H = 1024;
    const { c, g } = makeCanvas(W, H);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const r = rng(99);
    for (let i = 0; i < 4000; i++) {
      const y = Math.pow(r(), 1.6) * H * 0.55;
      const b = r();
      g.fillStyle = `rgba(${200 + r() * 55},${200 + r() * 55},255,${0.3 + b * 0.7})`;
      const s = b > 0.97 ? 2.2 : b > 0.85 ? 1.4 : 0.9;
      g.fillRect(r() * W, y, s, s);
    }
    // milky way haze
    const n = makeTileFbm(3, 4, 5);
    const img = g.getImageData(0, 0, W, H);
    for (let y = 0; y < H * 0.5; y++) {
      for (let x = 0; x < W; x += 1) {
        const band = Math.exp(-Math.pow((y - H * 0.22 - Math.sin(x / W * Math.PI * 2) * H * 0.12) / (H * 0.06), 2));
        const v = band * (n(x / W, y / H) * 0.5 + 0.5) * 40;
        const i = (y * W + x) * 4;
        img.data[i] += v * 0.8; img.data[i + 1] += v * 0.85; img.data[i + 2] += v;
      }
    }
    g.putImageData(img, 0, 0);
    const t = toTexture(c, { wrap: false });
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}

export function cloudTexture(seed = 8, coverage = 0.5) {
  return cached(`cloud:${seed}:${coverage}`, () => {
    const W = 1024, H = 256;
    const n = makeTileFbm(seed, 4, 6);
    const thr = 0.62 - coverage * 0.3;
    const { c } = fillPixels(W, H, (x, y, o) => {
      const v = n(x / W, y / H) * 0.5 + 0.5;
      const fade = Math.sin((y / H) * Math.PI);
      const a = clamp((v - thr) * 3.2, 0, 1) * fade;
      o[0] = o[1] = o[2] = 255; o[3] = a * 255;
    });
    const t = toTexture(c, { wrap: false });
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}

export function numberPlateTexture(num, bg = '#ffffff', fg = '#111111') {
  return cached(`plate:${num}:${bg}:${fg}`, () => {
    const { c, g } = makeCanvas(256, 256);
    g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
    g.font = '900 170px Orbitron, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = fg;
    g.fillText(String(num), 128, 140, 230);
    return toTexture(c, { wrap: false });
  });
}

// Tire sidewall lettering. u = around the wheel, v = along the profile.
export function tireTexture(knobby = false) {
  return cached(`tire:${knobby}`, () => {
    const W = 1024, H = 128;
    const { c, g } = makeCanvas(W, H);
    g.fillStyle = '#1b1b1d'; g.fillRect(0, 0, W, H);
    const r = rng(knobby ? 3 : 2);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.03})`; g.fillRect(r() * W, r() * H, 2, 2); }
    // tread band (center of profile)
    g.fillStyle = '#141416';
    g.fillRect(0, H * 0.3, W, H * 0.4);
    if (!knobby) {
      g.strokeStyle = '#0a0a0b'; g.lineWidth = 3;
      for (let i = 0; i < 24; i++) {
        const x = (i / 24) * W;
        g.beginPath(); g.moveTo(x, H * 0.36); g.quadraticCurveTo(x + 18, H * 0.5, x + 40, H * 0.46); g.stroke();
      }
    }
    // lettering on both sidewalls
    g.font = '700 22px Orbitron, Arial, sans-serif';
    g.fillStyle = 'rgba(210,210,210,0.55)';
    g.textBaseline = 'middle';
    for (let k = 0; k < 2; k++) {
      g.fillText('MÍTICO RACE', k * W / 2 + 40, H * 0.14);
      g.fillText('MÍTICO RACE', k * W / 2 + 40, H * 0.86);
    }
    g.fillStyle = 'rgba(255,210,0,0.55)';
    for (let k = 0; k < 2; k++) {
      g.fillText('SOFT', k * W / 2 + 330, H * 0.14);
      g.fillText('SOFT', k * W / 2 + 330, H * 0.86);
    }
    return toTexture(c);
  });
}

// Livery for loft-generated body panels. u = along bike (0 rear -> 1 front),
// v = around section: 0 bottom, .25 +z side, .5 top, .75 -z side, 1 bottom.
export function liveryTexture(livery, label = '', number = '') {
  const key = `livery:${JSON.stringify(livery)}:${label}:${number}`;
  return cached(key, () => {
    const W = 1024, H = 1024;
    const { c, g } = makeCanvas(W, H);
    const { base, second, accent, pattern = 'stripe' } = livery;
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    // canvas y = (1 - v) * H
    const vy = (v) => (1 - v) * H;
    const sideBand = (vc, hw, color) => { g.fillStyle = color; g.fillRect(0, vy(vc + hw), W, (hw * 2) * H); };
    if (pattern === 'stripe') {
      // racing stripes over the top
      sideBand(0.5, 0.05, second);
      sideBand(0.5, 0.012, accent);
      sideBand(0.25, 0.03, second);
      sideBand(0.75, 0.03, second);
    } else if (pattern === 'split') {
      g.fillStyle = second; g.fillRect(0, vy(0.36), W, vy(0.14) - vy(0.36));
      g.fillRect(0, vy(0.86), W, vy(0.64) - vy(0.86));
      sideBand(0.36, 0.01, accent); sideBand(0.64, 0.01, accent);
    } else if (pattern === 'arrow') {
      g.fillStyle = second;
      for (const vc of [0.25, 0.75]) {
        g.beginPath();
        g.moveTo(W * 0.1, vy(vc - 0.08)); g.lineTo(W * 0.75, vy(vc - 0.02)); g.lineTo(W * 0.95, vy(vc + 0.02));
        g.lineTo(W * 0.75, vy(vc + 0.1)); g.lineTo(W * 0.1, vy(vc + 0.04)); g.closePath(); g.fill();
      }
      sideBand(0.5, 0.008, accent);
    } else if (pattern === 'retro') {
      for (let i = 0; i < 3; i++) {
        g.fillStyle = [second, accent, '#ffffff'][i];
        for (const vc of [0.22, 0.78]) g.fillRect(0, vy(vc + 0.06 - i * 0.04), W, 0.025 * H);
      }
    } else if (pattern === 'neon') {
      g.strokeStyle = accent; g.lineWidth = 6;
      for (const vc of [0.25, 0.75]) {
        g.beginPath();
        for (let x = 0; x <= W; x += 8) g.lineTo(x, vy(vc + Math.sin(x / W * Math.PI * 3) * 0.04));
        g.stroke();
      }
      sideBand(0.5, 0.006, accent);
    } else if (pattern === 'flames') {
      g.fillStyle = second;
      for (const vc of [0.25, 0.75]) {
        const dir = vc < 0.5 ? 1 : -1;
        g.beginPath();
        g.moveTo(W, vy(vc - 0.15 * dir));
        for (let i = 0; i <= 6; i++) {
          const x = W * (0.95 - i * 0.1);
          g.lineTo(x, vy(vc + (i % 2 ? 0.1 : -0.02) * dir));
        }
        g.lineTo(W * 0.3, vy(vc + 0.02 * dir));
        g.lineTo(W, vy(vc + 0.16 * dir));
        g.closePath(); g.fill();
      }
    }
    // labels on both sides
    if (label) {
      g.font = '900 52px Orbitron, Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      // +z side: v .25 (normal orientation)
      g.save(); g.translate(W * 0.45, vy(0.27));
      g.fillStyle = accent; g.fillText(label, 0, 0, W * 0.32); g.restore();
      // -z side: rotated 180°
      g.save(); g.translate(W * 0.45, vy(0.73)); g.rotate(Math.PI);
      g.fillStyle = accent; g.fillText(label, 0, 0, W * 0.32); g.restore();
    }
    if (number) {
      g.font = '900 110px Orbitron, Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = base;
      g.save(); g.translate(W * 0.22, vy(0.27)); g.fillStyle = '#fff'; g.strokeText(number, 0, 0); g.fillText(number, 0, 0); g.restore();
      g.save(); g.translate(W * 0.22, vy(0.73)); g.rotate(Math.PI); g.fillStyle = '#fff'; g.strokeText(number, 0, 0); g.fillText(number, 0, 0); g.restore();
    }
    return toTexture(c, { wrap: false });
  });
}

export function waterNormalTexture() {
  return cached('waternormal', () => {
    const W = 256;
    const n = makeTileFbm(42, 6, 5);
    const height = new Float32Array(W * W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) height[y * W + x] = n(x / W, y / W);
    return toTexture(heightToNormal(height, W, W, 6), { srgb: false });
  });
}

export function lavaTexture() {
  return cached('lava', () => {
    const W = 512;
    const n = makeTileFbm(66, 4, 6);
    const n2 = makeTileFbm(67, 12, 3);
    const em = makeCanvas(W, W);
    const { c } = fillPixels(W, W, (x, y, o) => {
      const v = n(x / W, y / W) * 0.5 + 0.5;
      const crack = Math.abs(n2(x / W, y / W));
      const hot = clamp(1 - crack * 6, 0, 1) * v;
      o[0] = 30 + hot * 225; o[1] = 20 + hot * 120; o[2] = 18 + hot * 20; o[3] = 255;
    });
    em.g.drawImage(c, 0, 0);
    return { map: toTexture(c), emissiveMap: toTexture(em.c) };
  });
}

export function treeBarkTexture() {
  return cached('bark', () => {
    const W = 128;
    const n = makeTileFbm(8, 4, 4);
    const { c } = fillPixels(W, W, (x, y, o) => {
      const v = 50 + (Math.sin(x / W * Math.PI * 16 + n(x / W, y / W) * 6) * 0.5 + 0.5) * 30;
      o[0] = v; o[1] = v * 0.78; o[2] = v * 0.6; o[3] = 255;
    });
    return toTexture(c);
  });
}

export function foliageTexture(hue = 110, seed = 4) {
  return cached(`foliage:${hue}:${seed}`, () => {
    const W = 256;
    const n = makeTileFbm(seed, 8, 5);
    const r = rng(seed);
    const { c } = fillPixels(W, W, (x, y, o) => {
      const v = n(x / W, y / W) * 0.5 + 0.5;
      const l = 14 + v * 26 + (r() - 0.5) * 6;
      const [rr, gg, bb] = hslToRgb(hue / 360, 0.45, l / 100);
      o[0] = rr; o[1] = gg; o[2] = bb; o[3] = 255;
    });
    return toTexture(c);
  });
}

export function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = hue2rgb(h + 1 / 3); g = hue2rgb(h); b = hue2rgb(h - 1 / 3);
  }
  return [r * 255, g * 255, b * 255];
}

// Brake rotor (planar, mapped onto RingGeometry): drilled ring + carrier.
export function discTexture(style = 'drilled', carrier = '#c9a227') {
  return cached(`disc:${style}:${carrier}`, () => {
    const S = 256, C = S / 2;
    const { c, g } = makeCanvas(S, S);
    g.clearRect(0, 0, S, S);
    const outer = C - 1, inner = C * 0.66;
    // friction ring
    const grd = g.createRadialGradient(C, C, inner, C, C, outer);
    grd.addColorStop(0, '#8d9298'); grd.addColorStop(0.5, '#c6cace'); grd.addColorStop(1, '#7f8489');
    g.fillStyle = grd;
    g.beginPath();
    if (style === 'wave') {
      const n = 12;
      for (let i = 0; i <= n * 8; i++) {
        const a = (i / (n * 8)) * Math.PI * 2;
        const r = outer - (Math.sin(a * n) * 0.5 + 0.5) * C * 0.06;
        const x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
    } else g.arc(C, C, outer, 0, Math.PI * 2);
    g.arc(C, C, inner, 0, Math.PI * 2, true);
    g.fill();
    // concentric wear rings
    g.strokeStyle = 'rgba(60,60,60,0.25)'; g.lineWidth = 1;
    for (let r = inner + 4; r < outer - 4; r += 5) { g.beginPath(); g.arc(C, C, r, 0, Math.PI * 2); g.stroke(); }
    // holes (transparent)
    g.globalCompositeOperation = 'destination-out';
    const rows = style === 'plain' ? 0 : 2;
    for (let row = 0; row < rows; row++) {
      const n = 24;
      const rr = inner + (outer - inner) * (0.33 + row * 0.34);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + row * (Math.PI / n);
        g.beginPath(); g.arc(C + Math.cos(a) * rr, C + Math.sin(a) * rr, 3.2, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    // carrier with cutouts
    g.fillStyle = carrier;
    g.beginPath(); g.arc(C, C, inner + 3, 0, Math.PI * 2); g.arc(C, C, C * 0.3, 0, Math.PI * 2, true); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath(); g.ellipse(C + Math.cos(a) * C * 0.5, C + Math.sin(a) * C * 0.5, C * 0.11, C * 0.07, a, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // floating buttons
    g.fillStyle = '#e8e8e8';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.beginPath(); g.arc(C + Math.cos(a) * (inner + 1), C + Math.sin(a) * (inner + 1), 4, 0, Math.PI * 2); g.fill();
    }
    const t = toTexture(c, { wrap: false });
    return t;
  });
}

export function checkerTexture(a = '#111', b = '#eee', n = 8) {
  return cached(`checker:${a}:${b}:${n}`, () => {
    const { c, g } = makeCanvas(256, 64);
    const s = 256 / n;
    for (let y = 0; y < 2; y++) for (let x = 0; x < n; x++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * s, y * 32, s, 32); }
    return toTexture(c);
  });
}
