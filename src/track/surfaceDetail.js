// High-frequency surface detail layered over the large-scale track textures:
// asphalt aggregate (two sizes of stones set in bitumen) with its own normal and
// roughness, rubber laid down along the racing line, and a generic shader patch that
// multiplies a tiled detail albedo, blends a detail normal (UDN) and modulates
// roughness on any MeshStandardMaterial, fading with distance.
import * as THREE from 'three';
import { makeCanvas, toTexture, heightToNormal } from '../core/textures.js';
import { rng, clamp, makeTileFbm } from '../core/utils.js';

const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };

// weighted Voronoi stone layer: writes height/albedo/roughness where its stones are taller
function stoneLayer(N, C, seed, toneLo, toneHi, H, A, R, hScale) {
  const r = rng(seed);
  const pts = new Float32Array(C * C * 4);
  for (let i = 0; i < C * C; i++) {
    pts[i * 4] = 0.15 + r() * 0.7; pts[i * 4 + 1] = 0.15 + r() * 0.7;
    pts[i * 4 + 2] = 0.75 + r() * 0.5; // size
    const q = r();
    pts[i * 4 + 3] = q < 0.08 ? 0.86 + r() * 0.1 : q < 0.25 ? toneLo * 0.75 : toneLo + (toneHi - toneLo) * r();
  }
  const cs = N / C;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fx = x / cs, fy = y / cs, ix = Math.floor(fx), iy = Math.floor(fy);
      let f1 = 9, f2 = 9, k1 = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j;
        const wx = ((cx % C) + C) % C, wy = ((cy % C) + C) % C, k = (wy * C + wx) * 4;
        const dx = cx + pts[k] - fx, dy = cy + pts[k + 1] - fy;
        const d = Math.sqrt(dx * dx + dy * dy) / pts[k + 2];
        if (d < f1) { f2 = f1; f1 = d; k1 = k; } else if (d < f2) f2 = d;
      }
      const edge = f2 - f1;
      const inside = clamp((edge - 0.06) / 0.16, 0, 1);
      if (inside <= 0) continue;
      const dome = Math.sqrt(Math.max(0, 1 - f1 * f1 * 0.9)) * inside;
      const h = dome * hScale * (0.7 + 0.3 * pts[k1 + 2]);
      const o = y * N + x;
      if (h > H[o]) {
        H[o] = h;
        A[o] = pts[k1 + 3] * (0.86 + 0.14 * dome);
        // exposed stone tops are polished by tyres, their flanks less so
        R[o] = 0.5 + (1 - dome) * 0.22;
      }
    }
  }
}

// Asphalt aggregate: tile of ~1 m, mean albedo 0.5 (used as a x2 multiplier)
export function asphaltDetail(seed = 5) {
  return cached(`asph:${seed}`, () => {
    const N = 512;
    const H = new Float32Array(N * N), A = new Float32Array(N * N), R = new Float32Array(N * N);
    const fine = makeTileFbm(seed + 3, 32, 3);
    // bitumen matrix with fine sand
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      const n = fine(x / N, y / N);
      A[i] = 0.17 + n * 0.05; R[i] = 0.93; H[i] = 0.02 + n * 0.03;
    }
    stoneLayer(N, 44, seed + 11, 0.42, 0.7, H, A, R, 1.0);   // coarse aggregate (~2.3 cm)
    stoneLayer(N, 110, seed + 17, 0.36, 0.66, H, A, R, 0.55); // fine aggregate (~9 mm)
    let mean = 0;
    for (let i = 0; i < N * N; i++) mean += A[i];
    mean /= N * N;
    const k = 0.5 / mean;
    const { c, g } = makeCanvas(N, N);
    const img = g.createImageData(N, N);
    const rc = makeCanvas(N, N), rimg = rc.g.createImageData(N, N);
    let rmean = 0;
    for (let i = 0; i < N * N; i++) rmean += R[i];
    rmean /= N * N;
    for (let i = 0; i < N * N; i++) {
      const v = clamp(A[i] * k, 0, 1) * 255;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.995; img.data[i * 4 + 2] = v * 0.985; img.data[i * 4 + 3] = 255;
      // roughness stored relative to its mean (x0.5): shader multiplies by 2x
      const rv = clamp(R[i] / rmean * 0.5, 0, 1) * 255;
      rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = rv; rimg.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    rc.g.putImageData(rimg, 0, 0);
    return {
      map: toTexture(c, { srgb: false }),
      normalMap: toTexture(heightToNormal(H, N, N, 7), { srgb: false }),
      roughnessMap: toTexture(rc.c, { srgb: false }),
    };
  });
}

// Rubber laid down by tyres: u across a 2 m band, v along 16 m. White rgb, alpha = rubber.
export function rubberTexture(seed = 3) {
  return cached(`rubber:${seed}`, () => {
    const W = 64, H = 512;
    const r = rng(seed);
    const along = makeTileFbm(seed + 5, 6, 4);
    const fine = makeTileFbm(seed + 9, 48, 2);
    const bands = [];
    for (let i = 0; i < 14; i++) bands.push({ u: 0.18 + r() * 0.64, w: 0.012 + r() * 0.05, a: 0.25 + r() * 0.55, ph: r() });
    const { c, g } = makeCanvas(W, H);
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W, v = y / H;
        let a = 0;
        for (const b of bands) {
          const d = (u - b.u + (along(b.ph, v) - 0.0) * 0.03) / b.w;
          a += Math.exp(-d * d) * b.a * (0.55 + 0.45 * along(v * 3 + b.ph, b.ph));
        }
        // general darkening in the middle of the line
        const mid = Math.exp(-(((u - 0.5) / 0.26) ** 2)) * 0.35;
        a = clamp((a * 0.55 + mid) * (0.82 + 0.3 * fine(u, v)), 0, 1);
        const i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = toTexture(c, { srgb: true });
    t.wrapS = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// Shader patch: tiled detail over a MeshStandardMaterial that uses map/normalMap/roughnessMap on uv.
// opts: { map, normalMap, roughnessMap, scale: [su, sv], albedo, normal, rough, fade: [d0, d1], key }
export function addSurfaceDetail(mat, opts) {
  const u = {
    tDetail: { value: opts.map }, tDetailN: { value: opts.normalMap }, tDetailR: { value: opts.roughnessMap },
    uDetailScale: { value: new THREE.Vector2(opts.scale[0], opts.scale[1]) },
    uDetailStr: { value: new THREE.Vector3(opts.albedo ?? 1, opts.normal ?? 1, opts.rough ?? 1) },
    uDetailFade: { value: new THREE.Vector2(...(opts.fade || [60, 160])) },
  };
  mat.userData.detail = u;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.onBeforeCompile = (sh, renderer) => {
    if (prev) prev.call(mat, sh, renderer);
    Object.assign(sh.uniforms, u);
    // detail uv: the material's map uv, or world xz (opts.world) for meshes whose uv is world-scaled anyway
    const uvExpr = opts.world ? 'vDetailW.xz' : 'vMapUv';
    if (opts.world) {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDetailW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDetailW = (modelMatrix * vec4(position, 1.0)).xyz;');
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tDetail, tDetailN, tDetailR; uniform vec2 uDetailScale, uDetailFade; uniform vec3 uDetailStr;
        ${opts.world ? 'varying vec3 vDetailW;' : ''}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `vec4 diffuseColor = vec4( diffuse, opacity );
        float dFade = 1.0 - smoothstep(uDetailFade.x, uDetailFade.y, length(vViewPosition));
        vec2 dUv = ${uvExpr} * uDetailScale;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(vec3(1.0), texture2D(tDetail, dUv).rgb * 2.0, uDetailStr.x * dFade);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(1.0, texture2D(tDetailR, dUv).g * 2.0, uDetailStr.z * dFade), 0.04, 1.0);`)
      .replace('mapN.xy *= normalScale;', `mapN.xy *= normalScale;
        {
          vec3 dn = texture2D(tDetailN, dUv).xyz * 2.0 - 1.0;
          dn.xy *= uDetailStr.y * dFade;
          mapN = normalize(vec3(mapN.xy + dn.xy, mapN.z * dn.z));
        }`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|detail:' + (opts.key || '');
  return mat;
}

// Ground detail for close-up shading. kind: 'grass' (blades over soil), 'grain' (sand/dirt/gravel
// grains), 'snow' (crystals and wind-packed relief). Tile ~0.8-1 m, mean albedo 0.5.
export function groundDetail(kind = 'grass', seed = 7) {
  return cached(`gdet:${kind}:${seed}`, () => {
    const N = 512;
    const H = new Float32Array(N * N), A = new Float32Array(N * N), R = new Float32Array(N * N);
    const r = rng(seed);
    const fine = makeTileFbm(seed + 1, 24, 3), mid = makeTileFbm(seed + 2, 6, 3);
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0, u = x / N, v = y / N;
      const n = fine(u, v), m = mid(u, v);
      if (kind === 'snow') { A[i] = 0.9 + n * 0.06; H[i] = m * 0.6 + n * 0.25; R[i] = 0.62 + n * 0.1; }
      else if (kind === 'grain') { A[i] = 0.42 + m * 0.12 + n * 0.08; H[i] = m * 0.2 + n * 0.1; R[i] = 0.92; }
      else { A[i] = 0.22 + m * 0.06 + n * 0.05; H[i] = n * 0.15; R[i] = 0.95; }
    }
    if (kind === 'grain') {
      stoneLayer(N, 70, seed + 11, 0.32, 0.72, H, A, R, 0.8);
      stoneLayer(N, 150, seed + 13, 0.36, 0.68, H, A, R, 0.45);
      for (let i = 0; i < N * N; i++) R[i] = Math.max(R[i], 0.8);
    } else if (kind === 'grass') {
      // blades: short tapered strokes leaning in random directions, lighter tips
      const blades = 9000;
      for (let b = 0; b < blades; b++) {
        let x = r() * N, y = r() * N;
        const a = r() * Math.PI * 2, len = 10 + r() * 26, w = 1.2 + r() * 1.6;
        const tone = 0.42 + r() * 0.4, hb = 0.55 + r() * 0.45;
        const steps = Math.ceil(len);
        const dx = Math.cos(a), dy = Math.sin(a);
        for (let s = 0; s < steps; s++) {
          const t = s / steps, ww = w * (1 - t * 0.8);
          for (let k = -2; k <= 2; k++) {
            const px = ((Math.round(x - dy * k * ww * 0.5) % N) + N) % N, py = ((Math.round(y + dx * k * ww * 0.5) % N) + N) % N;
            const o = py * N + px;
            const h = hb * (0.35 + t * 0.65) * (1 - Math.abs(k) / 3);
            if (h > H[o]) { H[o] = h; A[o] = tone * (0.7 + t * 0.45); R[o] = 0.7 + (1 - t) * 0.2; }
          }
          x += dx; y += dy;
        }
      }
    }
    let mean = 0, rmean = 0;
    for (let i = 0; i < N * N; i++) { mean += A[i]; rmean += R[i]; }
    mean /= N * N; rmean /= N * N;
    const { c, g } = makeCanvas(N, N);
    const img = g.createImageData(N, N);
    const rc = makeCanvas(N, N), rimg = rc.g.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const v = clamp(A[i] * 0.5 / mean, 0, 1) * 255;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
      const rv = clamp(R[i] / rmean * 0.5, 0, 1) * 255;
      rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = rv; rimg.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    rc.g.putImageData(rimg, 0, 0);
    return {
      map: toTexture(c, { srgb: false }),
      normalMap: toTexture(heightToNormal(H, N, N, kind === 'grass' ? 5 : kind === 'snow' ? 2.5 : 6), { srgb: false }),
      roughnessMap: toTexture(rc.c, { srgb: false }),
    };
  });
}

export const DETAIL_KIND = {
  grass: 'grass', wildGrass: 'grass', dryGrass: 'grass', forest: 'grass', sand: 'grain', beachSand: 'grain',
  snow: 'snow', dirt: 'grain', gravel: 'grain', rock: 'grain', stone: 'grain', mossStone: 'grain', asphaltDark: 'asphalt', volcanic: 'grain',
};

// Racing kerb: red/white painted concrete blocks (u across: 0 = track side, v along: one
// red + one white block per tile) with transverse ridges, paint worn off where tyres run,
// rubber streaks, dirt toward the grass and chipped edges. Returns map/normal/roughness.
export function kerbTextures(colA = '#c3161b', colB = '#ededea', seed = 4) {
  return cached(`kerb:${colA}:${colB}:${seed}`, () => {
    const W = 256, Hh = 512;
    const r = rng(seed);
    const wearN = makeTileFbm(seed + 1, 8, 5), rubN = makeTileFbm(seed + 2, 4, 4), fine = makeTileFbm(seed + 3, 32, 3);
    const ca = [parseInt(colA.slice(1, 3), 16), parseInt(colA.slice(3, 5), 16), parseInt(colA.slice(5, 7), 16)];
    const cb = [parseInt(colB.slice(1, 3), 16), parseInt(colB.slice(3, 5), 16), parseInt(colB.slice(5, 7), 16)];
    const H = new Float32Array(W * Hh);
    const { c, g } = makeCanvas(W, Hh);
    const img = g.createImageData(W, Hh);
    const rc = makeCanvas(W, Hh), rimg = rc.g.createImageData(W, Hh);
    for (let y = 0; y < Hh; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W, v = y / Hh;
        const block = v < 0.5 ? ca : cb;
        // seam between blocks
        const seam = Math.min(Math.abs(v - 0.5), v, 1 - v) * Hh < 1.5;
        // transverse ridges on the inner 80 %
        const ridge = u < 0.8 ? Math.pow(Math.abs(Math.sin(v * Math.PI * 24)), 0.6) : 0.4;
        const n = fine(u, v);
        // paint wear: strongest on the track side and on ridge tops
        const wear = wearN(u * 1.3, v) + (1 - u) * 0.18 + ridge * 0.06 - 0.5;
        const bare = wear > 0.12 ? 1 : wear > 0.06 ? (wear - 0.06) / 0.06 : 0;
        const conc = 120 + n * 30;
        let rr = block[0] * (0.92 + n * 0.12), gg = block[1] * (0.92 + n * 0.12), bb = block[2] * (0.92 + n * 0.12);
        rr = rr * (1 - bare) + conc * bare; gg = gg * (1 - bare) + (conc - 2) * bare; bb = bb * (1 - bare) + (conc - 6) * bare;
        // rubber streaks where wheels ride over the kerb
        const rub = Math.max(0, rubN(u * 0.8, v * 1.0) - 0.45) * 2.2 * Math.exp(-(((u - 0.3) / 0.25) ** 2));
        const rk = 1 - Math.min(0.85, rub);
        rr *= rk; gg *= rk; bb *= rk;
        // dirt and grass stains on the outer edge
        const dirt = Math.max(0, (u - 0.78) / 0.22) * (0.5 + 0.5 * fine(u * 2, v * 2));
        rr = rr * (1 - dirt * 0.6) + 92 * dirt * 0.6; gg = gg * (1 - dirt * 0.6) + 86 * dirt * 0.6; bb = bb * (1 - dirt * 0.6) + 60 * dirt * 0.6;
        if (seam) { rr *= 0.45; gg *= 0.45; bb *= 0.45; }
        const i = (y * W + x) * 4;
        img.data[i] = clamp(rr, 0, 255); img.data[i + 1] = clamp(gg, 0, 255); img.data[i + 2] = clamp(bb, 0, 255); img.data[i + 3] = 255;
        const rough = (bare > 0.5 ? 0.86 : 0.5 + n * 0.08) * (1 - rub * 0.25) + dirt * 0.2;
        rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = clamp(rough, 0, 1) * 255; rimg.data[i + 3] = 255;
        H[y * W + x] = ridge * 0.6 + n * 0.12 - bare * 0.05 - (seam ? 0.3 : 0);
      }
    }
    // a few chips knocked out of the paint
    g.putImageData(img, 0, 0);
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(${130 + r() * 30},${128 + r() * 30},${122 + r() * 30},${0.7 + r() * 0.3})`;
      g.beginPath(); g.arc(r() * W * 0.7, r() * Hh, 1 + r() * 3, 0, Math.PI * 2); g.fill();
    }
    rc.g.putImageData(rimg, 0, 0);
    return {
      map: toTexture(c),
      normalMap: toTexture(heightToNormal(H, W, Hh, 4), { srgb: false }),
      roughnessMap: toTexture(rc.c, { srgb: false }),
    };
  });
}
