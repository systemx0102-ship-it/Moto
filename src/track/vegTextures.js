// Hand-painted (procedural) foliage & bark textures with alpha for leaf cards.
import * as THREE from 'three';
import { makeCanvas, toTexture, heightToNormal } from '../core/textures.js';
import { rng, makeTileFbm, clamp } from '../core/utils.js';

const cache = new Map();
function cached(k, fn) { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); }
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function alphaTex(c) {
  const t = toTexture(c, { wrap: false });
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.premultiplyAlpha = false;
  return t;
}

// Broadleaf cluster: many individual leaves around a twig network.
export function leafClusterTexture(kind = 'oak', seed = 1) {
  return cached(`leaf:${kind}:${seed}`, () => {
    const S = 512;
    const { c, g } = makeCanvas(S, S);
    const r = rng(seed * 97 + kind.length);
    const P = {
      oak: { h: [86, 112], s: [30, 52], l: [14, 36], n: 430, len: [16, 26], wid: [7, 12], twig: '#3a2a1c' },
      beech: { h: [80, 102], s: [38, 58], l: [16, 38], n: 470, len: [14, 22], wid: [7, 11], twig: '#4a3a2a' },
      birch: { h: [70, 92], s: [42, 62], l: [22, 44], n: 480, len: [10, 16], wid: [6, 9], twig: '#2a2a2a' },
      autumn: { h: [18, 48], s: [55, 80], l: [28, 50], n: 240, len: [14, 22], wid: [7, 11], twig: '#3a2a1c' },
      bush: { h: [88, 120], s: [30, 50], l: [12, 30], n: 520, len: [10, 16], wid: [5, 8], twig: '#2a2418' },
      jungle: { h: [95, 130], s: [40, 60], l: [14, 34], n: 140, len: [30, 46], wid: [12, 18], twig: '#2a2418' },
    }[kind] || {};
    const C = S / 2;
    // twigs
    g.strokeStyle = P.twig; g.lineCap = 'round';
    const tips = [];
    for (let k = 0; k < 9; k++) {
      const a = r() * Math.PI * 2, len = S * (0.18 + r() * 0.24);
      g.lineWidth = 3 + r() * 3;
      const ex = C + Math.cos(a) * len, ey = C + Math.sin(a) * len;
      g.beginPath(); g.moveTo(C, C + S * 0.05); g.quadraticCurveTo(C + Math.cos(a + 0.4) * len * 0.5, C + Math.sin(a + 0.4) * len * 0.5, ex, ey); g.stroke();
      tips.push([ex, ey]);
    }
    // leaves (back to front: darker first)
    const leaves = [];
    for (let i = 0; i < P.n; i++) {
      let x, y;
      if (r() < 0.6) { const t = tips[Math.floor(r() * tips.length)]; x = t[0] + (r() - 0.5) * S * 0.22; y = t[1] + (r() - 0.5) * S * 0.22; }
      else { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * S * 0.42; x = C + Math.cos(a) * d; y = C + Math.sin(a) * d; }
      const dd = Math.hypot(x - C, y - C) / (S * 0.48);
      if (dd > 1) continue;
      leaves.push({ x, y, depth: r(), a: r() * Math.PI * 2 });
    }
    leaves.sort((p, q) => p.depth - q.depth);
    for (const L of leaves) {
      const len = P.len[0] + r() * (P.len[1] - P.len[0]), wid = P.wid[0] + r() * (P.wid[1] - P.wid[0]);
      const h = P.h[0] + r() * (P.h[1] - P.h[0]), s = P.s[0] + r() * (P.s[1] - P.s[0]);
      const l = P.l[0] + (P.l[1] - P.l[0]) * (0.35 + L.depth * 0.65) * (0.8 + r() * 0.4);
      g.save(); g.translate(L.x, L.y); g.rotate(L.a);
      const grd = g.createLinearGradient(0, -wid, 0, wid);
      grd.addColorStop(0, hsl(h, s, l + 10)); grd.addColorStop(0.5, hsl(h, s, l)); grd.addColorStop(1, hsl(h + 4, s, l - 8));
      g.fillStyle = grd;
      g.beginPath();
      if (kind === 'oak') {
        // lobed leaf
        g.moveTo(-len, 0);
        for (let k = 0; k <= 6; k++) { const t = k / 6; const lx = -len + t * 2 * len; const ly = -wid * Math.sin(t * Math.PI) * (k % 2 ? 0.75 : 1); g.lineTo(lx, ly); }
        for (let k = 6; k >= 0; k--) { const t = k / 6; const lx = -len + t * 2 * len; const ly = wid * Math.sin(t * Math.PI) * (k % 2 ? 0.75 : 1); g.lineTo(lx, ly); }
      } else g.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = hsl(h, s - 10, l - 12, 0.6); g.lineWidth = 1;
      g.beginPath(); g.moveTo(-len * 0.9, 0); g.lineTo(len * 0.9, 0); g.stroke();
      g.restore();
    }
    return alphaTex(c);
  });
}

// Conifer frond (fir/spruce branch seen from above): stem along +x with needles.
export function firFrondTexture(snowy = false, seed = 2) {
  return cached(`fir:${snowy}:${seed}`, () => {
    const W = 512, H = 256;
    const { c, g } = makeCanvas(W, H);
    const r = rng(seed);
    const cy = H / 2;
    g.lineCap = 'round';
    const stem = (x0, y0, ang, len, w, depth) => {
      const ex = x0 + Math.cos(ang) * len, ey = y0 + Math.sin(ang) * len;
      g.strokeStyle = '#3a2a1a'; g.lineWidth = w;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(ex, ey); g.stroke();
      const n = Math.floor(len / 3.2);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const px = x0 + Math.cos(ang) * len * t, py = y0 + Math.sin(ang) * len * t;
        const nl = (1 - t * 0.6) * (depth ? 18 : 26) * (0.8 + r() * 0.4);
        for (const s of [-1, 1]) {
          const na = ang + s * (0.75 + r() * 0.25);
          const l = 20 + r() * 22;
          g.strokeStyle = hsl(98 + r() * 26, 24 + r() * 18, l * 0.72);
          g.lineWidth = 1.6 + r();
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); g.stroke();
        }
      }
      if (depth < 2) {
        for (let k = 1; k < 5; k++) {
          const t = k / 5 + (r() - 0.5) * 0.06;
          const px = x0 + Math.cos(ang) * len * t, py = y0 + Math.sin(ang) * len * t;
          for (const s of [-1, 1]) stem(px, py, ang + s * (0.55 + r() * 0.3), len * (0.42 - t * 0.25), w * 0.6, depth + 1);
        }
      }
    };
    stem(4, cy, 0, W * 0.94, 6, 0);
    if (snowy) {
      for (let i = 0; i < 260; i++) {
        const x = r() * W * 0.9, y = cy + (r() - 0.5) * H * 0.7;
        const d = Math.abs(y - cy) / (H * 0.4);
        if (r() < d) continue;
        g.fillStyle = `rgba(245,248,255,${0.6 + r() * 0.4})`;
        g.beginPath(); g.ellipse(x, y, 6 + r() * 12, 3 + r() * 6, (r() - 0.5) * 0.6, 0, Math.PI * 2); g.fill();
      }
    }
    return alphaTex(c);
  });
}

// Pine needle tuft (Scots pine style crown clumps)
export function pineTuftTexture(seed = 3) {
  return cached(`pinetuft:${seed}`, () => {
    const S = 256;
    const { c, g } = makeCanvas(S, S);
    const r = rng(seed);
    g.lineCap = 'round';
    for (let k = 0; k < 14; k++) {
      const cx = S * 0.2 + r() * S * 0.6, cy = S * 0.2 + r() * S * 0.6;
      g.strokeStyle = '#4a3220'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(S / 2, S * 0.9); g.lineTo(cx, cy); g.stroke();
      for (let i = 0; i < 46; i++) {
        const a = r() * Math.PI * 2, l = 14 + r() * 22;
        g.strokeStyle = hsl(110 + r() * 30, 30 + r() * 20, 16 + r() * 22); g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.stroke();
      }
    }
    return alphaTex(c);
  });
}

// Palm frond: long feather leaf, stem along +x
export function palmFrondTexture(seed = 4) {
  return cached(`palm:${seed}`, () => {
    const W = 512, H = 128;
    const { c, g } = makeCanvas(W, H);
    const r = rng(seed);
    const cy = H / 2;
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const t = i / 70;
      const x = 10 + t * (W - 20);
      const l = (Math.sin(t * Math.PI) * 0.8 + 0.2) * H * 0.48;
      for (const s of [-1, 1]) {
        const a = s * (1.0 + r() * 0.2) + (t - 0.5) * 0.2;
        g.strokeStyle = hsl(85 + r() * 25, 40 + r() * 20, 20 + r() * 18); g.lineWidth = 4 + r() * 2;
        g.beginPath(); g.moveTo(x, cy); g.quadraticCurveTo(x + 8, cy + Math.sin(a) * l * 0.5, x + Math.cos(a) * 12 + 14, cy + Math.sin(a) * l); g.stroke();
      }
    }
    g.strokeStyle = '#5a4a2a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, cy); g.lineTo(W, cy); g.stroke();
    return alphaTex(c);
  });
}

// Grass blades (vertical card). variant: green | dry | flowers | snow | reeds
export function grassTexture(variant = 'green', seed = 5) {
  return cached(`grass:${variant}:${seed}`, () => {
    const W = 256, H = 256;
    const { c, g } = makeCanvas(W, H);
    const r = rng(seed);
    const base = { green: [95, 45, 20], dry: [48, 45, 38], flowers: [100, 45, 22], snow: [90, 15, 60], reeds: [70, 35, 30] }[variant];
    const n = variant === 'reeds' ? 26 : 70;
    for (let i = 0; i < n; i++) {
      const x = 10 + r() * (W - 20);
      const h = H * (0.45 + r() * 0.53);
      const bend = (r() - 0.5) * 60;
      const w = 2.5 + r() * 3.5;
      const grd = g.createLinearGradient(0, H, 0, H - h);
      grd.addColorStop(0, hsl(base[0], base[1], base[2] * 0.6));
      grd.addColorStop(1, hsl(base[0] + (r() - 0.5) * 20, base[1] + 10, base[2] + 18 + r() * 10));
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(x - w, H);
      g.quadraticCurveTo(x - w * 0.5 + bend * 0.4, H - h * 0.6, x + bend, H - h);
      g.quadraticCurveTo(x + w * 0.5 + bend * 0.4, H - h * 0.6, x + w, H);
      g.closePath(); g.fill();
      if (variant === 'flowers' && r() < 0.35) {
        g.fillStyle = r() < 0.5 ? hsl(50, 90, 60) : r() < 0.5 ? hsl(0, 0, 95) : hsl(300 + r() * 40, 70, 65);
        g.beginPath(); g.arc(x + bend, H - h, 4 + r() * 3, 0, Math.PI * 2); g.fill();
      }
      if (variant === 'reeds') { g.fillStyle = '#5a4028'; g.fillRect(x + bend - 3, H - h - 2, 6, 22); }
    }
    return alphaTex(c);
  });
}

export function fernTexture(seed = 6) {
  return cached(`fern:${seed}`, () => {
    const S = 256;
    const { c, g } = makeCanvas(S, S);
    const r = rng(seed);
    g.lineCap = 'round';
    for (let f = 0; f < 7; f++) {
      const a = -Math.PI / 2 + (f - 3) * 0.32 + (r() - 0.5) * 0.1;
      const L = S * (0.36 + r() * 0.1);
      const x0 = S / 2, y0 = S * 0.98;
      g.strokeStyle = '#2a4018'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(x0, y0);
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const aa = a + t * t * (a < -Math.PI / 2 ? -0.8 : 0.8);
        const px = x0 + Math.cos(aa) * L * t * 1.1, py = y0 + Math.sin(aa) * L * t * 1.1;
        pts.push([px, py, aa]); g.lineTo(px, py);
      }
      g.stroke();
      for (let i = 2; i < pts.length; i++) {
        const [px, py, aa] = pts[i];
        const l = (1 - i / pts.length) * 26 + 4;
        for (const s of [-1, 1]) {
          g.strokeStyle = hsl(95 + r() * 20, 45, 18 + r() * 14); g.lineWidth = 4;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(aa + s * 1.2) * l, py + Math.sin(aa + s * 1.2) * l); g.stroke();
        }
      }
    }
    return alphaTex(c);
  });
}

export function barkTexture(kind = 'oak') {
  return cached(`bark:${kind}`, () => {
    const W = 256, H = 512;
    const n = makeTileFbm(kind.length * 13, 6, 5);
    const n2 = makeTileFbm(kind.length * 17, 24, 3);
    const { c, g } = makeCanvas(W, H);
    const img = g.createImageData(W, H);
    const hgt = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      let col, h;
      if (kind === 'birch') {
        const mark = n2(u * 1, v * 4) > 0.35 ? 1 : 0;
        const ring = Math.abs(Math.sin(v * 60 + n(u, v) * 3)) < 0.08 ? 1 : 0;
        const b = 215 + n(u, v) * 25;
        col = mark || ring ? [40, 38, 36] : [b, b - 4, b - 10];
        h = mark ? 0.2 : 0.6;
      } else if (kind === 'palm') {
        const ring = (Math.sin(v * 90 + n(u, v) * 2) * 0.5 + 0.5);
        const b = 90 + ring * 50 + n(u, v) * 20;
        col = [b, b * 0.82, b * 0.6]; h = ring;
      } else if (kind === 'pine') {
        const plate = Math.abs(n(u * 2, v * 0.5));
        const b = 70 + plate * 90;
        col = [b * 1.25, b * 0.72, b * 0.5]; h = plate;
      } else {
        const furrow = Math.abs(Math.sin(u * Math.PI * 14 + n(u, v) * 7));
        const b = 40 + furrow * 55 + n2(u, v) * 15;
        col = [b, b * 0.88, b * 0.74]; h = furrow;
      }
      const i = (y * W + x) * 4;
      img.data[i] = clamp(col[0], 0, 255); img.data[i + 1] = clamp(col[1], 0, 255); img.data[i + 2] = clamp(col[2], 0, 255); img.data[i + 3] = 255;
      hgt[y * W + x] = h;
    }
    g.putImageData(img, 0, 0);
    return { map: toTexture(c), normalMap: toTexture(heightToNormal(hgt, W, H, 3), { srgb: false }) };
  });
}
