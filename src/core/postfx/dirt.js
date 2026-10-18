// Procedural lens dirt: grease smudges, dust, bokeh-like rings, specks and wipe
// marks. Only visible where bright light (sun, lamps, glow) hits the lens.
import * as THREE from 'three';
import { rng } from '../utils.js';

let cached = null;

export function lensDirtTexture() {
  if (cached) return cached;
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  const r = rng(1337);
  const tints = ['255,250,240', '240,248,255', '255,240,225', '235,245,255'];
  // more dirt toward the rim of the lens than in the middle
  const edgeX = () => { const t = r(); return (r() < 0.6 ? (t < 0.5 ? t * t * 2 : 1 - (1 - t) * (1 - t) * 2) : t) * W; };
  const blob = (x, y, rad, a, tint) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${tint},${a})`);
    gr.addColorStop(0.55, `rgba(${tint},${a * 0.45})`);
    gr.addColorStop(1, `rgba(${tint},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  // big soft grease smudges
  for (let i = 0; i < 26; i++) blob(edgeX(), r() * H, 50 + r() * 170, 0.04 + r() * 0.07, r.pick(tints));
  // medium dust blobs
  for (let i = 0; i < 170; i++) blob(edgeX(), r() * H, 4 + r() * 22, 0.08 + r() * 0.22, r.pick(tints));
  // dried droplets: faint discs with a brighter rim
  for (let i = 0; i < 34; i++) {
    const x = edgeX(), y = r() * H, rad = 6 + r() * 26, a = 0.04 + r() * 0.07;
    g.fillStyle = `rgba(255,255,255,${a * 0.6})`;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `rgba(255,255,255,${a * 0.9})`; g.lineWidth = 1 + r() * 1.5;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.stroke();
  }
  // fine specks
  for (let i = 0; i < 1100; i++) {
    g.fillStyle = `rgba(255,255,255,${0.12 + r() * 0.5})`;
    g.beginPath(); g.arc(edgeX(), r() * H, 0.5 + r() * 1.3, 0, Math.PI * 2); g.fill();
  }
  // wipe marks: soft curved strokes left by a cloth
  g.lineCap = 'round';
  g.filter = 'blur(3px)';
  for (let i = 0; i < 9; i++) {
    const x = r() * W, y = r() * H, rad = 120 + r() * 320, a0 = r() * Math.PI * 2;
    g.strokeStyle = `rgba(255,255,255,${0.03 + r() * 0.04})`; g.lineWidth = 8 + r() * 22;
    g.beginPath(); g.arc(x, y, rad, a0, a0 + 0.4 + r() * 0.9); g.stroke();
  }
  g.filter = 'none';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  cached = t;
  return t;
}
