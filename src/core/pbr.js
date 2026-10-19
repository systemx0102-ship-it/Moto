// Procedural PBR texture pack for the machines and riders: high-resolution colour,
// normal and roughness maps for tyres (moulded sidewall lettering, worn tread band,
// grooves), brushed and cast metals, textured plastics, clearcoat orange peel,
// micro-scratches, heat-tinted exhaust headers and race-leather grain.
import * as THREE from 'three';
import { makeCanvas, toTexture, heightToNormal } from './textures.js';
import { makeTileFbm, rng } from './utils.js';

const cache = new Map();
const cached = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
const data = (c, srgb = false, repeat = [1, 1]) => toTexture(c, { srgb, repeat });

// fill a W x H canvas from a per-pixel function writing [r,g,b]
function pixels(W, H, fn) {
  const { c, g } = makeCanvas(W, H);
  const img = g.createImageData(W, H), d = img.data, o = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    fn(x, y, o);
    const i = (y * W + x) * 4;
    d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
const normalFrom = (h, W, H, s) => data(heightToNormal(h, W, H, s));

// ---------------------------------------------------------------------------
// Fine pebble grain (moulded plastics, rubber, anodised and painted castings)
export function grainSet(seed = 5, period = 64, strength = 2.2) {
  return cached(`grain:${seed}:${period}:${strength}`, () => {
    const W = 512;
    const n = makeTileFbm(seed, period, 3), m = makeTileFbm(seed + 9, 8, 3);
    const h = new Float32Array(W * W);
    const rough = pixels(W, W, (x, y, o) => {
      const v = n(x / W, y / W) * 0.5 + 0.5;
      h[y * W + x] = v;
      const r = 200 + (m(x / W, y / W) * 0.5 + 0.5) * 55;
      o[0] = r; o[1] = r; o[2] = r;
    });
    return { normalMap: normalFrom(h, W, W, strength), roughnessMap: data(rough) };
  });
}

// Brushed metal: streaks along u, faint cross noise; roughness varies with the strokes
export function brushedSet() {
  return cached('brushed2', () => {
    const W = 512;
    const r = rng(21);
    const rows = new Float32Array(W);
    for (let y = 0; y < W; y++) rows[y] = r();
    // smear the row values a little so strokes have width
    const sm = rows.map((v, i) => (rows[(i + W - 1) % W] + v * 2 + rows[(i + 1) % W]) / 4);
    const n = makeTileFbm(4, 32, 2);
    const h = new Float32Array(W * W);
    const rough = pixels(W, W, (x, y, o) => {
      const v = sm[y] * 0.8 + (n(x / W, y / W) * 0.5 + 0.5) * 0.2;
      h[y * W + x] = v;
      const k = 170 + v * 70;
      o[0] = k; o[1] = k; o[2] = k;
    });
    return { normalMap: normalFrom(h, W, W, 1.2), roughnessMap: data(rough) };
  });
}

// Sand-cast aluminium: coarse grain with pits, rougher in the recesses
export function castSet() {
  return cached('cast', () => {
    const W = 512;
    const n = makeTileFbm(17, 48, 4), p = rng(77);
    const h = new Float32Array(W * W);
    for (let i = 0; i < W * W; i++) h[i] = 0;
    const rough = pixels(W, W, (x, y, o) => {
      const v = n(x / W, y / W) * 0.5 + 0.5;
      h[y * W + x] = v;
      const k = 160 + (1 - v) * 80;
      o[0] = k; o[1] = k; o[2] = k;
    });
    for (let i = 0; i < 2600; i++) { const x = Math.floor(p() * W), y = Math.floor(p() * W); h[y * W + x] -= 0.6; }
    return { normalMap: normalFrom(h, W, W, 2.6), roughnessMap: data(rough) };
  });
}

// Clearcoat orange peel: very soft, low-frequency undulation
export function orangePeel() {
  return cached('peel', () => {
    const W = 256;
    const n = makeTileFbm(33, 16, 3);
    const h = new Float32Array(W * W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) h[y * W + x] = n(x / W, y / W);
    return normalFrom(h, W, W, 0.8);
  });
}

// Micro-scratches for polished parts (roughness map)
export function scratchRoughness() {
  return cached('scratch', () => {
    const W = 1024;
    const { c, g } = makeCanvas(W, W);
    g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, W, W);
    const r = rng(9);
    for (let i = 0; i < 900; i++) {
      const x = r() * W, y = r() * W, a = r() * Math.PI, l = 8 + r() * 60;
      g.strokeStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`; g.lineWidth = 0.6 + r() * 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // swirl marks from polishing
    for (let i = 0; i < 60; i++) {
      const x = r() * W, y = r() * W, rad = 20 + r() * 90;
      g.strokeStyle = `rgba(255,255,255,${0.06 + r() * 0.1})`; g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, rad, r() * 6, r() * 6 + 1.5); g.stroke();
    }
    return data(c);
  });
}

// Exhaust headers: heat colouring along the pipe (tube u = length from the port)
export function heatTint() {
  return cached('heat', () => {
    const { c, g } = makeCanvas(512, 16);
    const grd = g.createLinearGradient(0, 0, 512, 0);
    grd.addColorStop(0, '#5c4a2e'); grd.addColorStop(0.06, '#b8873e'); grd.addColorStop(0.14, '#d4a54e');
    grd.addColorStop(0.24, '#8a4e7a'); grd.addColorStop(0.34, '#3e4f9a'); grd.addColorStop(0.46, '#5d79a8');
    grd.addColorStop(0.6, '#a7aeb6'); grd.addColorStop(1, '#c9cdd2');
    g.fillStyle = grd; g.fillRect(0, 0, 512, 16);
    return toTexture(c, { wrap: false });
  });
}

// ---------------------------------------------------------------------------
// Tyre: u round the tyre, v across the profile (0 bead -> .5 tread centre -> 1 bead).
export function tireSet(knobby = false) {
  return cached(`tire2:${knobby}`, () => {
    const W = 2048, H = 512;
    const { c, g } = makeCanvas(W, H);
    const hc = makeCanvas(W, H);
    const hg = hc.g;
    // base rubber with fine noise
    g.fillStyle = '#1c1c1e'; g.fillRect(0, 0, W, H);
    hg.fillStyle = 'rgb(128,128,128)'; hg.fillRect(0, 0, W, H);
    const r = rng(knobby ? 31 : 13);
    for (let i = 0; i < 26000; i++) {
      const x = r() * W, y = r() * H, a = r() * 0.05;
      g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(x, y, 2, 2);
    }
    // canvas y = (1 - v) * H. Tread band: v .3 .. .7; sidewalls outside it.
    const Y = (v) => (1 - v) * H;
    if (!knobby) {
      // worn contact band: scuffed lighter rubber with streaks along the rolling direction
      const grd = g.createLinearGradient(0, Y(0.66), 0, Y(0.34));
      grd.addColorStop(0, 'rgba(70,70,72,0)'); grd.addColorStop(0.25, 'rgba(70,70,72,0.55)'); grd.addColorStop(0.75, 'rgba(70,70,72,0.55)'); grd.addColorStop(1, 'rgba(70,70,72,0)');
      g.fillStyle = grd; g.fillRect(0, Y(0.66), W, Y(0.34) - Y(0.66));
      for (let i = 0; i < 1600; i++) {
        const y = Y(0.36 + r() * 0.28), x = r() * W, l = 20 + r() * 140;
        g.strokeStyle = `rgba(${r() < 0.5 ? '90,90,92' : '20,20,22'},${0.15 + r() * 0.25})`; g.lineWidth = 1 + r() * 1.5;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (r() - 0.5) * 2); g.stroke();
      }
      // sport tread: long swept grooves on the shoulders, none in the centre
      for (let k = 0; k < 18; k++) {
        const x0 = (k / 18) * W;
        for (const side of [-1, 1]) {
          const path = new Path2D();
          path.moveTo(x0, Y(0.5 + side * 0.06));
          path.bezierCurveTo(x0 + 30, Y(0.5 + side * 0.12), x0 + 70, Y(0.5 + side * 0.17), x0 + 130, Y(0.5 + side * 0.19));
          g.strokeStyle = '#060607'; g.lineWidth = 7; g.stroke(path);
          hg.strokeStyle = 'rgb(20,20,20)'; hg.lineWidth = 7; hg.stroke(path);
        }
      }
    } else {
      // knobby: staggered blocks across the tread with mud-worn edges
      for (let row = 0; row < 3; row++) {
        const n = 46;
        for (let i = 0; i < n; i++) {
          if (row !== 1 && i % 2) continue;
          const x = (i / n) * W + (row === 1 ? W / n / 2 : 0), v = [0.36, 0.5, 0.64][row];
          const bw = 26, bh = H * 0.07;
          g.fillStyle = '#29292b'; g.fillRect(x - bw / 2, Y(v) - bh / 2, bw, bh);
          hg.fillStyle = 'rgb(220,220,220)'; hg.fillRect(x - bw / 2, Y(v) - bh / 2, bw, bh);
        }
      }
    }
    // sidewalls: moulded lettering, size code, rotation arrow and bead rings, in relief
    const side = (vc, flip) => {
      const y = Y(vc);
      for (const ctx of [g, hg]) {
        const relief = ctx === hg;
        ctx.save();
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        const col = relief ? 'rgb(235,235,235)' : 'rgba(150,150,154,0.55)';
        ctx.fillStyle = col;
        for (let k = 0; k < 2; k++) {
          const x0 = k * (W / 2);
          ctx.save(); ctx.translate(x0 + 90, y);
          if (flip) ctx.scale(1, -1);
          ctx.font = '700 46px "Barlow Condensed", Arial, sans-serif';
          ctx.fillText('MÍTICO', 0, 0);
          ctx.font = 'italic 600 34px "Barlow Condensed", Arial, sans-serif';
          ctx.fillText(knobby ? 'TERRA MX' : 'TRACK PRO RS', 170, 2);
          ctx.font = '600 22px Barlow, Arial, sans-serif';
          ctx.fillText(knobby ? '110/90-19  62M  TT' : '190/55 ZR17  (75W)  TUBELESS', 470, 2);
          ctx.fillText('DOT 7K4F 2426', 840, 2);
          // rotation arrow
          ctx.beginPath(); ctx.moveTo(760, -6); ctx.lineTo(800, -6); ctx.lineTo(800, -14); ctx.lineTo(818, 0); ctx.lineTo(800, 14); ctx.lineTo(800, 6); ctx.lineTo(760, 6); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        // concentric moulding rings toward the bead
        ctx.strokeStyle = relief ? 'rgb(190,190,190)' : 'rgba(60,60,64,0.6)'; ctx.lineWidth = 2;
        for (const dv of [0.075, 0.09]) { const yy = Y(flip ? 1 - dv : dv); ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); }
        ctx.restore();
      }
    };
    side(0.17, false);
    side(0.83, true);
    // height -> normal (relief)
    const img = hg.getImageData(0, 0, W, H).data;
    const h = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) h[i] = img[i * 4] / 255;
    const normalMap = data(heightToNormal(h, W, H, 3.5));
    // roughness: worn band slightly smoother/shinier than the sidewalls
    const rc = makeCanvas(W, H);
    rc.g.fillStyle = 'rgb(235,235,235)'; rc.g.fillRect(0, 0, W, H);
    if (!knobby) { rc.g.fillStyle = 'rgb(200,200,200)'; rc.g.fillRect(0, Y(0.64), W, Y(0.36) - Y(0.64)); }
    const map = toTexture(c);
    map.anisotropy = 8;
    return { map, normalMap, roughnessMap: data(rc.c) };
  });
}

// ---------------------------------------------------------------------------
// Race leather: grain, a perforated zone, stitched seams; for the rider's suit and gloves
export function leatherSet() {
  return cached('suitLeather', () => {
    const W = 1024;
    const n = makeTileFbm(61, 96, 3), m = makeTileFbm(62, 6, 3);
    const h = new Float32Array(W * W);
    const rough = pixels(W, W, (x, y, o) => {
      const v = n(x / W, y / W) * 0.5 + 0.5;
      // perforation band (ventilation) on part of the texture
      const pz = y > W * 0.42 && y < W * 0.58 && (x % 12 < 3) && (y % 12 < 3) ? -0.8 : 0;
      h[y * W + x] = v + pz;
      const k = 120 + (m(x / W, y / W) * 0.5 + 0.5) * 70 + (pz ? 60 : 0);
      o[0] = k; o[1] = k; o[2] = k;
    });
    // stitched seams: grooves with stitch dimples either side
    for (const sy of [0.25, 0.75]) {
      const yy = Math.floor(sy * W);
      for (let x = 0; x < W; x++) {
        for (let d = -2; d <= 2; d++) h[(yy + d) * W + x] -= 0.35 * (1 - Math.abs(d) / 3);
        if (x % 10 < 5) { h[(yy - 5) * W + x] += 0.4; h[(yy + 5) * W + x] += 0.4; }
      }
    }
    return { normalMap: normalFrom(h, W, W, 2.4), roughnessMap: data(rough) };
  });
}

// Disc rotor surface: concentric machining rings (roughness), used over the drilled map
export function rotorRoughness() {
  return cached('rotorRough', () => {
    const W = 512;
    const r = rng(5);
    const rings = new Float32Array(W).map(() => r());
    const c = pixels(W, W, (x, y, o) => {
      const dx = x - W / 2, dy = y - W / 2, d = Math.hypot(dx, dy) | 0;
      const k = 110 + (rings[Math.min(W - 1, d)] || 0) * 70;
      o[0] = k; o[1] = k; o[2] = k;
    });
    return data(c);
  });
}

// texture copy with its own repeat (shares the image)
export function rep(t, x, y = x) {
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(x, y);
  c.needsUpdate = true;
  return c;
}
