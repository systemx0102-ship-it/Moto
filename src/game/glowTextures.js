// Procedural lens-glare atlas for BikeGlow: 2x2 frames (soft core, 6-point star,
// anamorphic streak, exhaust flame). Values are stored as sqrt(linear) in 8 bits so the
// long faint tails keep precision; the shader squares them back.
import * as THREE from 'three';

let atlas = null;
const S = 256; // frame size

function frame(data, fx, fy, fn) {
  const W = S * 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // u,v in [-1,1]; data row 0 is texture v = 0 (flipY off), so v grows with the row
      const u = ((x + 0.5) / S) * 2 - 1, v = ((y + 0.5) / S) * 2 - 1;
      const c = fn(u, v);
      const o = ((fy * S + y) * W + fx * S + x) * 4;
      data[o] = Math.round(Math.sqrt(Math.min(1, Math.max(0, c[0]))) * 255);
      data[o + 1] = Math.round(Math.sqrt(Math.min(1, Math.max(0, c[1]))) * 255);
      data[o + 2] = Math.round(Math.sqrt(Math.min(1, Math.max(0, c[2]))) * 255);
      data[o + 3] = 255;
    }
  }
}

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// cheap value noise for flame turbulence
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function glareAtlas() {
  if (atlas) return atlas;
  const W = S * 2;
  const data = new Uint8Array(W * W * 4);
  const c3 = [0, 0, 0];
  const grey = (f) => { c3[0] = c3[1] = c3[2] = f; return c3; };
  // 0: hot core + soft halo (point-source bloom of a lamp seen through a lens)
  frame(data, 0, 0, (u, v) => {
    const r2 = u * u + v * v, r = Math.sqrt(r2);
    const f = 0.95 * Math.exp(-r2 * 110) + 0.42 * Math.exp(-r2 * 16) + 0.14 * Math.exp(-r * 5.2);
    return grey((f / 1.51) * sstep(1, 0.82, r));
  });
  // 1: six-point diffraction star (aperture blades), thin spikes fading to the tips
  frame(data, 1, 0, (u, v) => {
    const r = Math.hypot(u, v);
    let f = 0;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI + Math.PI / 2;
      const d = Math.abs(u * Math.sin(a) - v * Math.cos(a));
      const w = 0.007 + 0.018 * r;
      f += Math.exp(-(d * d) / (w * w)) * Math.pow(Math.max(0, 1 - r), 1.8);
    }
    f += 0.35 * Math.exp(-r * r * 60);
    return grey(Math.min(1, f) * sstep(1, 0.9, r));
  });
  // 2: anamorphic streak: bright thin core line with a long soft falloff
  frame(data, 0, 1, (u, v) => {
    const ax = Math.abs(u);
    const px = Math.pow(1 - ax, 2.4) * (0.3 + 0.7 * Math.exp(-ax * 6));
    const py = Math.exp(-((v * 2.4) ** 2)) * 0.75 + Math.exp(-((v * 7) ** 2)) * 0.25;
    return grey(px * py * sstep(1, 0.75, Math.abs(v)));
  });
  // 3: backfire flame along +v (base at v=-1): blue-violet root, white-yellow body, orange/red tip
  frame(data, 1, 1, (u, v) => {
    const t = (v + 1) / 2; // 0 at the outlet, 1 at the tip
    const w = (0.22 + 0.78 * Math.sin(Math.min(1, t * 1.7) * Math.PI / 2)) * (1 - Math.pow(t, 2.5) * 0.8) * 0.8;
    const turb = 0.72 + 0.28 * vnoise(u * 4 + 3, t * 9);
    const x = u / Math.max(0.05, w);
    let a = Math.exp(-x * x * 2.6) * sstep(1, 0.6, t) * sstep(0, 0.05, t) * turb;
    const core = Math.exp(-x * x * 10);
    // colour ramp
    const blue = 1 - sstep(0.06, 0.28, t);
    let r = 1, g = 0.82, b = 0.5;
    const o = sstep(0.28, 0.72, t);
    r = 1; g = g * (1 - o) + 0.38 * o; b = b * (1 - o) + 0.07 * o;
    r = r * (1 - blue) + 0.45 * blue; g = g * (1 - blue) + 0.55 * blue; b = b * (1 - blue) + 1 * blue;
    a *= 0.65 + 0.35 * core;
    c3[0] = r * a; c3[1] = g * a; c3[2] = b * a;
    return c3;
  });
  const t = new THREE.DataTexture(data, W, W, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.flipY = false;
  t.needsUpdate = true;
  atlas = t;
  return t;
}

// The atlas is shared across races; BikeGlow.dispose() releases its GPU copy only.
export function releaseGlareAtlas() { if (atlas) atlas.dispose(); }
