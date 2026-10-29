// Track: centerline data, spatial queries, racing line and 3D road meshes.
import * as THREE from 'three';
import { buildCenterline, smooth1D } from './trackgen.js';
import { THEMES } from './themes.js';
import {
  roadTextures, groundTextures, curbTexture, concreteTexture, tireWallTexture, armcoTexture,
  makeCanvas, toTexture, checkerTexture,
} from '../core/textures.js';
import { clamp } from '../core/utils.js';
import { asphaltDetail, rubberTexture, addSurfaceDetail, groundDetail, DETAIL_KIND } from './surfaceDetail.js';

const CELL = 20;

export class Track {
  constructor(def) {
    this.def = def;
    this.theme = THEMES[def.theme];
    const c = buildCenterline(def, 2);
    this.c = c;
    this.N = c.N; this.L = c.L; this.ds = c.ds;
    this.W = def.width; this.halfW = def.width / 2; this.runoff = def.runoff;
    this.barrierD = this.halfW + this.runoff;
    this.wet = def.weather === 'wet' || def.weather === 'storm' || def.weather === 'rain';
    this._buildGrid();
    this.computeRacingLine();
  }

  // ------------------------------------------------------------------ queries
  _buildGrid() {
    const { x, z, N } = this.c;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < N; i++) {
      minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i]);
      minZ = Math.min(minZ, z[i]); maxZ = Math.max(maxZ, z[i]);
    }
    this.bounds = { minX, minZ, maxX, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, size: Math.max(maxX - minX, maxZ - minZ) };
    this.gMinX = minX - CELL * 4; this.gMinZ = minZ - CELL * 4;
    this.gCols = Math.ceil((maxX - minX) / CELL) + 9;
    this.gRows = Math.ceil((maxZ - minZ) / CELL) + 9;
    this.grid = new Array(this.gCols * this.gRows);
    for (let i = 0; i < N; i++) {
      const cx = Math.floor((x[i] - this.gMinX) / CELL), cz = Math.floor((z[i] - this.gMinZ) / CELL);
      const k = cz * this.gCols + cx;
      (this.grid[k] || (this.grid[k] = [])).push(i);
    }
  }

  nearestIndex(px, pz) {
    const { x, z } = this.c;
    const cx = Math.floor((px - this.gMinX) / CELL), cz = Math.floor((pz - this.gMinZ) / CELL);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 12 && best < 0; r += 2) {
      for (let j = cz - r; j <= cz + r; j++) {
        if (j < 0 || j >= this.gRows) continue;
        for (let i = cx - r; i <= cx + r; i++) {
          if (i < 0 || i >= this.gCols) continue;
          const cell = this.grid[j * this.gCols + i];
          if (!cell) continue;
          for (const k of cell) {
            const d = (x[k] - px) ** 2 + (z[k] - pz) ** 2;
            if (d < bd) { bd = d; best = k; }
          }
        }
      }
    }
    if (best < 0) {
      for (let k = 0; k < this.N; k++) {
        const d = (x[k] - px) ** 2 + (z[k] - pz) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
    }
    return best;
  }

  wrap(i) { const N = this.N; return ((i % N) + N) % N; }
  wrapS(s) { const L = this.L; return ((s % L) + L) % L; }

  /** Project a world point onto the track. */
  project(px, pz, hint = -1, out = {}) {
    const { x, z, y, tx, tz, bank, kappaSmooth, grade } = this.c;
    const N = this.N;
    let i = -1;
    if (hint >= 0) {
      let best = hint, bd = Infinity;
      for (let k = -12; k <= 12; k++) {
        const j = (hint + k + N) % N;
        const d = (x[j] - px) ** 2 + (z[j] - pz) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
      if (bd < (this.barrierD + 25) ** 2) i = best;
    }
    if (i < 0) i = this.nearestIndex(px, pz);
    // choose segment (i-1,i) or (i,i+1)
    let seg = i, t = 0, bestD = Infinity;
    for (const a of [(i - 1 + N) % N, i]) {
      const b = (a + 1) % N;
      const ex = x[b] - x[a], ez = z[b] - z[a];
      const l2 = ex * ex + ez * ez || 1;
      let u = ((px - x[a]) * ex + (pz - z[a]) * ez) / l2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const qx = x[a] + ex * u, qz = z[a] + ez * u;
      const d = (px - qx) ** 2 + (pz - qz) ** 2;
      if (d < bestD) { bestD = d; seg = a; t = u; }
    }
    const b = (seg + 1) % N;
    const cxp = x[seg] + (x[b] - x[seg]) * t, czp = z[seg] + (z[b] - z[seg]) * t;
    let ttx = tx[seg] + (tx[b] - tx[seg]) * t, ttz = tz[seg] + (tz[b] - tz[seg]) * t;
    const tl = Math.hypot(ttx, ttz) || 1; ttx /= tl; ttz /= tl;
    const rrx = -ttz, rrz = ttx;
    const d = (px - cxp) * rrx + (pz - czp) * rrz;
    const bk = bank[seg] + (bank[b] - bank[seg]) * t;
    const cy = y[seg] + (y[b] - y[seg]) * t;
    out.i = seg; out.t = t;
    out.s = (seg + t) * this.ds;
    out.d = d;
    out.cx = cxp; out.cz = czp; out.cy = cy;
    out.yBase = cy + d * Math.tan(bk);
    out.y = out.yBase + this.curbHeight(seg, d);
    out.tx = ttx; out.tz = ttz; out.rx = rrx; out.rz = rrz;
    out.bank = bk;
    out.kappa = kappaSmooth[seg];
    out.grade = grade[seg] + (grade[b] - grade[seg]) * t;
    const ad = Math.abs(d);
    out.onRoad = ad <= this.halfW;
    out.onCurb = this.curbMask ? (this.curbAt(seg, d)) : false;
    out.offRoad = ad > this.halfW + (out.onCurb ? 1.2 : 0);
    out.barrier = ad >= this.barrierD - 0.35;
    out.gravel = this.gravelMask && ad > this.halfW + (this.theme.apron || 0) + 1.2 ? (this.gravelMask[seg] & (d < 0 ? 1 : 2)) !== 0 : false;
    return out;
  }

  /** Position on the track at arc length s, lateral offset d. */
  pointAt(s, d = 0, out = {}) {
    const { x, z, y, tx, tz, bank } = this.c;
    s = this.wrapS(s);
    const f = s / this.ds;
    const i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f);
    let ttx = tx[i] + (tx[j] - tx[i]) * t, ttz = tz[i] + (tz[j] - tz[i]) * t;
    const tl = Math.hypot(ttx, ttz) || 1; ttx /= tl; ttz /= tl;
    const bk = bank[i] + (bank[j] - bank[i]) * t;
    out.x = x[i] + (x[j] - x[i]) * t - ttz * d;
    out.z = z[i] + (z[j] - z[i]) * t + ttx * d;
    out.y = y[i] + (y[j] - y[i]) * t + d * Math.tan(bk);
    out.tx = ttx; out.tz = ttz; out.heading = Math.atan2(ttx, ttz); out.i = i; out.bank = bk;
    return out;
  }

  curbHeight(i, d) {
    if (!this.curbMask) return 0;
    const ad = Math.abs(d);
    if (ad < this.halfW - 0.2 || ad > this.halfW + 1.2) return 0;
    if (!this.curbAt(i, d)) return 0;
    const u = (ad - (this.halfW - 0.2)) / 1.4;
    return Math.sin(u * Math.PI) * 0.045;
  }

  curbAt(i, d) {
    const m = this.curbMask[i];
    if (!m) return false;
    return d < 0 ? (m & 1) !== 0 : (m & 2) !== 0;
  }

  // -------------------------------------------------------------- racing line
  computeRacingLine() {
    const { x, z, rx, rz, N } = { ...this.c, N: this.N };
    const lim = this.halfW - 1.3;
    const d = new Float32Array(N);
    const px = new Float32Array(N), pz = new Float32Array(N);
    const passes = [[24, 120], [12, 160], [6, 160], [3, 80]];
    for (const [k, iters] of passes) {
      for (let it = 0; it < iters; it++) {
        for (let i = 0; i < N; i++) { px[i] = x[i] + rx[i] * d[i]; pz[i] = z[i] + rz[i] * d[i]; }
        for (let i = 0; i < N; i++) {
          const a = (i - k + N) % N, b = (i + k) % N;
          const mx = (px[a] + px[b]) / 2, mz = (pz[a] + pz[b]) / 2;
          const nd = (mx - x[i]) * rx[i] + (mz - z[i]) * rz[i];
          d[i] = clamp(d[i] + (nd - d[i]) * 0.5, -lim, lim);
        }
      }
    }
    this.lineD = smooth1D(d, 2);
    // curvature of the racing line
    const kl = new Float32Array(N);
    for (let i = 0; i < N; i++) { px[i] = x[i] + rx[i] * this.lineD[i]; pz[i] = z[i] + rz[i] * this.lineD[i]; }
    for (let i = 0; i < N; i++) {
      const a = (i - 3 + N) % N, b = (i + 3) % N;
      const h0 = Math.atan2(px[i] - px[a], pz[i] - pz[a]);
      const h1 = Math.atan2(px[b] - px[i], pz[b] - pz[i]);
      let dh = h1 - h0;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const len = Math.hypot(px[b] - px[i], pz[b] - pz[i]) + Math.hypot(px[i] - px[a], pz[i] - pz[a]);
      kl[i] = dh / (len / 2 || 1);
    }
    this.lineK = smooth1D(kl, 3);
    // racing-line positions and headings
    this.lineX = new Float32Array(N); this.lineZ = new Float32Array(N); this.lineH = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.lineX[i] = px[i]; this.lineZ[i] = pz[i]; }
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      this.lineH[i] = Math.atan2(px[b] - px[a], pz[b] - pz[a]);
    }
  }

  // Speed profile (m/s) along the racing line for given lateral grip (m/s^2) and braking (m/s^2)
  speedProfile(latAcc, brakeAcc, vmax) {
    const N = this.N, ds = this.ds;
    const v = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const k = Math.abs(this.lineK[i]);
      v[i] = k > 1e-5 ? Math.min(vmax, Math.sqrt(latAcc / k)) : vmax;
    }
    // backwards braking pass (twice around the loop for wrap)
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const j = (i + 1) % N;
        const lim = Math.sqrt(v[j] * v[j] + 2 * brakeAcc * ds);
        if (v[i] > lim) v[i] = lim;
      }
    }
    return v;
  }

  // ------------------------------------------------------------------ meshes
  build(quality) {
    const group = new THREE.Group();
    group.name = 'track';
    this._computeCurbs();
    const th = this.theme;
    const roadTex = roadTextures({
      seed: this.def.id.length * 7, size: quality.density > 0.8 ? 512 : 256,
      base: th.road.base.map((v) => Math.round(v * 1.36)), edge: th.road.edge, centerDash: th.road.centerDash, centerColor: th.road.centerColor,
      wet: this.wet, rubber: false, patches: th.road.patches, cracks: !th.road.rubber,
    });
    const repeats = Math.max(1, Math.round(this.L / (this.W * 2)));
    this.roadMat = new THREE.MeshStandardMaterial({
      map: roadTex.map, normalMap: roadTex.normalMap, roughnessMap: roadTex.roughnessMap,
      roughness: this.wet ? 0.85 : 1.0, metalness: this.wet ? 0.08 : 0.0, normalScale: new THREE.Vector2(this.wet ? 0.18 : 0.6, this.wet ? 0.18 : 0.6),
      envMapIntensity: this.wet ? 1.15 : 0.42, color: this.wet ? 0x9ea2aa : 0xffeedd,
    });
    // aggregate detail: ~1 m tiles of stones in bitumen over the large-scale road texture
    const asph = asphaltDetail(this.def.id.length + 5);
    addSurfaceDetail(this.roadMat, { ...asph, scale: [this.W / 1.05, this.L / repeats / 1.05], albedo: this.wet ? 0.7 : 1, normal: this.wet ? 0.5 : 1.15, rough: this.wet ? 0.6 : 1, fade: [70, 220], key: 'road' });
    const road = this.ribbon([-this.halfW, this.halfW], 8, (i, d) => 0, (i, u) => [u, (i / this.N) * repeats]);
    const roadMesh = new THREE.Mesh(road, this.roadMat);
    roadMesh.receiveShadow = true;
    roadMesh.name = 'road';
    group.add(roadMesh);

    // runoff (both sides) with world-space UVs; optional asphalt apron
    const rg = groundTextures(th.runoffGround || 'grass', 11);
    const runMat = new THREE.MeshStandardMaterial({ map: rg.map, normalMap: rg.normalMap, roughnessMap: rg.roughnessMap, color: 0xffffff });
    if (th.mow) {
      // mown verges: bands across the track that flip brightness with view direction
      runMat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aMow; varying vec3 vMow; varying vec3 vWP2;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMow = aMow; vWP2 = (modelMatrix * vec4(position, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMow; varying vec3 vWP2;')
          .replace('#include <map_fragment>', `#include <map_fragment>
            float sg = mod(floor(vMow.x / 7.0), 2.0) * 2.0 - 1.0;
            vec2 vd = normalize(vWP2.xz - cameraPosition.xz + vec2(1e-3));
            diffuseColor.rgb *= 1.0 + sg * (0.05 + 0.09 * abs(dot(vd, normalize(vMow.yz + vec2(1e-4)))));`);
      };
      runMat.customProgramCacheKey = () => 'mowRunoff';
    }
    {
      const kind = DETAIL_KIND[th.runoffGround || 'grass'] || 'grass';
      const det = kind === 'asphalt' ? asphaltDetail(13) : groundDetail(kind, 11);
      addSurfaceDetail(runMat, { ...det, world: true, scale: [1 / 0.85, 1 / 0.85], albedo: 0.85, normal: 1.1, rough: 0.8, fade: [40, 110], key: 'runoff' + kind });
    }
    const apron = th.apron || 0;
    for (const side of [-1, 1]) {
      const a = side * (this.halfW + apron), b = side * (this.barrierD + 2.5);
      const geo = this.ribbon(side < 0 ? [b, a] : [a, b], 4, () => -0.012, null, null, true);
      if (th.mow) this._mowAttr(geo, 4);
      const m = new THREE.Mesh(geo, runMat);
      m.receiveShadow = true;
      group.add(m);
    }
    if (apron) {
      const at = groundTextures('asphaltDark', 21);
      const apMat = new THREE.MeshStandardMaterial({ map: at.map, normalMap: at.normalMap, roughnessMap: at.roughnessMap, roughness: 1 });
      apMat.color.setRGB(1.9, 1.86, 1.82);
      addSurfaceDetail(apMat, { ...asphaltDetail(17), world: true, scale: [1 / 1.1, 1 / 1.1], albedo: 1, normal: 1.1, rough: 1, fade: [60, 180], key: 'apron' });
      for (const side of [-1, 1]) {
        const a = side * this.halfW, b = side * (this.halfW + apron);
        const m = new THREE.Mesh(this.ribbon(side < 0 ? [b, a] : [a, b], 2, () => -0.004, null, null, true), apMat);
        m.receiveShadow = true;
        group.add(m);
      }
    }
    // gravel traps on the outside of corners
    this._computeGravel();
    if (this.gravelRuns.length) {
      const gt = groundTextures('gravel', 23);
      const gMat = new THREE.MeshStandardMaterial({ map: gt.map, normalMap: gt.normalMap, roughnessMap: gt.roughnessMap, color: 0xd8d2c4 });
      addSurfaceDetail(gMat, { ...groundDetail('grain', 23), world: true, scale: [1 / 0.6, 1 / 0.6], albedo: 1, normal: 1.4, rough: 0.8, fade: [40, 120], key: 'gravel' });
      for (const run of this.gravelRuns) {
        const side = run.side;
        const a = side * (this.halfW + apron + 1.2), b = side * (this.barrierD - 0.4);
        const geo = this.ribbon(side < 0 ? [b, a] : [a, b], 3, (i, d) => 0.004 + Math.sin(i * 1.7 + d) * 0.01, null, [run.i0, run.i1], true);
        const m = new THREE.Mesh(geo, gMat);
        m.receiveShadow = true;
        group.add(m);
      }
    }
    // curbs
    const ct = curbTexture();
    const curbMat = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.6 });
    for (const run of this.curbRuns) {
      const side = run.side;
      const a = side * (this.halfW - 0.2), b = side * (this.halfW + 1.2);
      const geo = this.ribbon(side < 0 ? [b, a] : [a, b], 6, (i, d) => {
        const u = (Math.abs(d) - (this.halfW - 0.2)) / 1.4;
        return Math.sin(clamp(u, 0, 1) * Math.PI) * 0.045 + 0.004;
      }, (i, u) => [side < 0 ? 1 - u : u, (i * this.ds) / 2.4], [run.i0, run.i1]);
      const m = new THREE.Mesh(geo, curbMat);
      m.receiveShadow = true;
      group.add(m);
    }
    // rubber laid down along the racing line, heavier where riders brake and turn
    if (th.road.rubber || th.road.rubberLine) group.add(this._buildRubber());
    // barriers
    group.add(this._buildBarriers(quality));
    group.add(this._buildStart());
    this.group = group;
    return group;
  }

  _buildRubber() {
    const { x, y, z, rx, rz, bank } = this.c;
    const N = this.N, cols = 6, half = 1.0;
    // intensity: corners plus the braking zones that lead into them
    const k = new Float32Array(N);
    for (let i = 0; i < N; i++) k[i] = clamp(Math.abs(this.lineK[i]) * 34, 0, 1);
    const look = Math.round(70 / this.ds);
    const inten = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let b = 0;
      for (let j = 1; j <= look; j += 2) b = Math.max(b, k[(i + j) % N] * (1 - j / look));
      inten[i] = 0.62 + 0.38 * Math.max(k[i] * 0.85, b);
    }
    const pos = new Float32Array(N * (cols + 1) * 3), uv = new Float32Array(N * (cols + 1) * 2), col = new Float32Array(N * (cols + 1) * 4);
    let p = 0, q = 0, cc = 0;
    for (let i = 0; i < N; i++) {
      const tb = Math.tan(bank[i]), dl = clamp(this.lineD[i], -this.halfW + half, this.halfW - half);
      for (let c = 0; c <= cols; c++) {
        const u = c / cols, d = dl - half + 2 * half * u;
        pos[p++] = x[i] + rx[i] * d; pos[p++] = y[i] + d * tb + 0.006; pos[p++] = z[i] + rz[i] * d;
        uv[q++] = u; uv[q++] = (i * this.ds) / 16;
        col[cc++] = 1; col[cc++] = 1; col[cc++] = 1; col[cc++] = inten[i];
      }
    }
    const idx = [];
    for (let r = 0; r < N; r++) {
      const r2 = (r + 1) % N;
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c, b = a + 1, c2 = r2 * (cols + 1) + c, d2 = c2 + 1;
        idx.push(a, c2, b, b, c2, d2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    const n = g.attributes.normal;
    let sy = 0; for (let i = 0; i < n.count; i++) sy += n.getY(i);
    if (sy < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0b0b0c, map: rubberTexture(3), vertexColors: true, transparent: true, depthWrite: false,
      roughness: this.wet ? 0.3 : 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      opacity: this.wet ? 0.6 : 0.9,
    });
    const m = new THREE.Mesh(g, mat);
    m.name = 'rubber';
    m.receiveShadow = true;
    m.renderOrder = 1;
    return m;
  }

  // per-vertex [distance along track, tangent x, tangent z] for the mowing-stripe shader
  _mowAttr(geo, cols) {
    const { tx, tz } = this.c;
    const n = geo.attributes.position.count, rows = n / (cols + 1);
    const a = new Float32Array(n * 3);
    for (let r = 0; r < rows; r++) {
      const i = r % this.N;
      for (let c = 0; c <= cols; c++) { const k = (r * (cols + 1) + c) * 3; a[k] = r * this.ds; a[k + 1] = tx[i]; a[k + 2] = tz[i]; }
    }
    geo.setAttribute('aMow', new THREE.BufferAttribute(a, 3));
  }

  _computeGravel() {
    const N = this.N;
    this.gravelMask = new Uint8Array(N);
    this.gravelRuns = [];
    if (!this.theme.gravelTraps) return;
    const k = this.c.kappaSmooth;
    const pre = Math.round(10 / this.ds), post = Math.round(45 / this.ds);
    for (let i = 0; i < N; i++) {
      if (Math.abs(k[i]) < 1 / 220) continue;
      const outside = k[i] > 0 ? 2 : 1;
      for (let j = -pre; j <= post; j++) this.gravelMask[(i + j + N) % N] |= outside;
    }
    for (let j = -60; j <= 25; j++) this.gravelMask[(j + N) % N] = 0;
    const mask = this.gravelMask;
    for (const [bit, side] of [[1, -1], [2, 1]]) {
      let start = -1, g0 = 0;
      while (g0 < N && (mask[g0] & bit)) g0++;
      for (let n = 0; n <= N; n++) {
        const i = (g0 + n) % N;
        const on = (mask[i] & bit) !== 0 && n < N;
        if (on && start < 0) start = g0 + n;
        if (!on && start >= 0) { this.gravelRuns.push({ side, i0: start, i1: g0 + n }); start = -1; }
      }
    }
  }

  _computeCurbs() {
    const N = this.N;
    const k = this.c.kappaSmooth;
    const thr = 1 / 160;
    const mask = new Uint8Array(N);
    const ext = Math.round(14 / this.ds), exitShift = Math.round(26 / this.ds);
    for (let i = 0; i < N; i++) {
      if (Math.abs(k[i]) < thr) continue;
      const inside = k[i] > 0 ? 1 : 2; // left turn -> inside is left (d<0)
      const outside = inside === 1 ? 2 : 1;
      for (let j = -ext; j <= ext; j++) mask[(i + j + N) % N] |= inside;
      for (let j = -ext + exitShift; j <= ext + exitShift; j++) mask[(i + j + N) % N] |= outside;
    }
    // no curbs on the start straight
    for (let j = -30; j <= 30; j++) mask[(j + N) % N] = 0;
    this.curbMask = mask;
    const runs = [];
    for (const [bit, side] of [[1, -1], [2, 1]]) {
      // find runs (handle wrap by starting at a gap)
      let start = -1;
      let g0 = 0;
      while (g0 < N && (mask[g0] & bit)) g0++;
      for (let n = 0; n <= N; n++) {
        const i = (g0 + n) % N;
        const on = (mask[i] & bit) !== 0 && n < N;
        if (on && start < 0) start = g0 + n;
        if (!on && start >= 0) { runs.push({ side, i0: start, i1: g0 + n }); start = -1; }
      }
    }
    this.curbRuns = runs;
  }

  /**
   * Build a ribbon along the track between lateral offsets [d0, d1].
   * hFn(i, d) -> extra height; uvFn(i, u) -> [u, v]; range [i0, i1] (indices, may exceed N for wrap)
   * worldUV: planar world UVs (for ground materials)
   */
  ribbon([d0, d1], cols, hFn, uvFn, range = null, worldUV = false) {
    const { x, y, z, rx, rz, bank } = this.c;
    const N = this.N;
    const i0 = range ? range[0] : 0, i1 = range ? range[1] : N;
    const rows = i1 - i0 + 1;
    const pos = new Float32Array(rows * (cols + 1) * 3);
    const uv = new Float32Array(rows * (cols + 1) * 2);
    let p = 0, q = 0;
    for (let r = 0; r < rows; r++) {
      const ii = i0 + r;
      const i = ((ii % N) + N) % N;
      const tb = Math.tan(bank[i]);
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const d = d0 + (d1 - d0) * u;
        const px = x[i] + rx[i] * d, pz = z[i] + rz[i] * d;
        pos[p++] = px; pos[p++] = y[i] + d * tb + (hFn ? hFn(i, d) : 0); pos[p++] = pz;
        if (worldUV) { uv[q++] = px / 8; uv[q++] = pz / 8; } else {
          const [uu, vv] = uvFn ? uvFn(ii, u) : [u, ii / N];
          uv[q++] = uu; uv[q++] = vv;
        }
      }
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c, b = a + 1, cc = a + cols + 1, dd = cc + 1;
        // forward = +rows, right = +cols, up normal: (a, b, cc) => (right x forward)...
        idx.push(a, cc, b, b, cc, dd);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // ensure normals point up
    const n = g.attributes.normal;
    let sumY = 0;
    for (let i = 0; i < n.count; i++) sumY += n.getY(i);
    if (sumY < 0) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    g.computeBoundingSphere();
    return g;
  }

  /**
   * Extrude a cross-section profile along the track.
   * segs: [{a:[d,h], b:[d,h], n:[nd,nh]}] in road-relative coords; texLen: meters per v unit.
   */
  extrude(segs, texLen = 4, range = null, step = 1) {
    const { x, y, z, rx, rz, bank } = this.c;
    const N = this.N;
    const i0 = range ? range[0] : 0, i1 = range ? range[1] : N;
    const pos = [], nor = [], uv = [], idx = [];
    for (const sg of segs) {
      const base = pos.length / 3;
      let rows = 0;
      for (let ii = i0; ii <= i1; ii += step) {
        const i = ((ii % N) + N) % N;
        const tb = Math.tan(bank[i]);
        for (const [k, P] of [[0, sg.a], [1, sg.b]]) {
          const d = P[0];
          pos.push(x[i] + rx[i] * d, y[i] + d * tb + P[1], z[i] + rz[i] * d);
          const nx = rx[i] * sg.n[0], ny = sg.n[1], nz = rz[i] * sg.n[0];
          const nl = Math.hypot(nx, ny, nz) || 1;
          nor.push(nx / nl, ny / nl, nz / nl);
          uv.push(sg.u ? sg.u[k] : k, (ii * this.ds) / texLen);
        }
        rows++;
      }
      for (let r = 0; r < rows - 1; r++) {
        const a = base + r * 2, b = a + 1, c = a + 2, d = a + 3;
        // decide winding using desired normal
        const A = new THREE.Vector3(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]);
        const B = new THREE.Vector3(pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
        const C = new THREE.Vector3(pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]);
        const fn = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
        const dn = new THREE.Vector3(nor[a * 3], nor[a * 3 + 1], nor[a * 3 + 2]);
        if (fn.dot(dn) >= 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  _buildBarriers(quality) {
    const th = this.theme;
    const grp = new THREE.Group();
    const D = this.barrierD;
    const add = (geo, mat, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow && quality.shadows > 0; m.receiveShadow = true;
      grp.add(m);
      return m;
    };
    for (const side of [-1, 1]) {
      const d = side * D;
      if (th.barrier === 'concrete') {
        const t = 0.55;
        const tex = concreteTexture(th.neonWalls ? '#202020' : '#c8102e', 3);
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
        add(this.extrude([
          { a: [d, 0], b: [d, 1.15], n: [-side, 0] },
          { a: [d, 1.15], b: [d + side * t, 1.15], n: [0, 1] },
          { a: [d + side * t, 1.15], b: [d + side * t, 0], n: [side, 0] },
        ], 4), mat);
        if (th.neonWalls) {
          const col = side < 0 ? 0x00e5ff : 0xff2bd6;
          const nm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: col, emissiveIntensity: 4 });
          add(this.extrude([{ a: [d - side * 0.01, 0.9], b: [d - side * 0.01, 1.0], n: [-side, 0] }], 4), nm, false);
          add(this.extrude([{ a: [d - side * 0.01, 0.12], b: [d - side * 0.01, 0.16], n: [-side, 0] }], 4), nm, false);
        }
      } else if (th.barrier === 'tirewall') {
        const tex = tireWallTexture();
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
        add(this.extrude([
          { a: [d, 0], b: [d, 0.95], n: [-side, 0] },
          { a: [d, 0.95], b: [d + side * 0.9, 0.95], n: [0, 1], u: [0, 0.3] },
          { a: [d + side * 0.9, 0.95], b: [d + side * 0.9, 0], n: [side, 0] },
        ], 2.6), mat);
      } else {
        // armco W-beam on posts
        const tex = armcoTexture();
        const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide });
        add(this.extrude([
          { a: [d, 0.42], b: [d - side * 0.06, 0.55], n: [-side, -0.4] },
          { a: [d - side * 0.06, 0.55], b: [d - side * 0.06, 0.7], n: [-side, 0] },
          { a: [d - side * 0.06, 0.7], b: [d, 0.82], n: [-side, 0.4] },
        ], 4), mat);
        // posts
        const count = Math.floor(this.L / 4);
        const postGeo = new THREE.BoxGeometry(0.12, 0.85, 0.12);
        postGeo.translate(0, 0.42, 0);
        const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.7, roughness: 0.5 }), count);
        const m4 = new THREE.Matrix4();
        const p = {};
        for (let k = 0; k < count; k++) {
          this.pointAt(k * 4, d + side * 0.12, p);
          m4.makeRotationY(p.heading);
          m4.setPosition(p.x, p.y, p.z);
          posts.setMatrixAt(k, m4);
        }
        posts.castShadow = quality.shadows > 0;
        grp.add(posts);
      }
      if (th.fence) {
        const fc = makeCanvas(64, 64);
        const g = fc.g;
        g.clearRect(0, 0, 64, 64);
        g.strokeStyle = 'rgba(200,205,210,1)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
        const ft = toTexture(fc.c);
        ft.repeat.set(1, 1);
        const fmat = new THREE.MeshStandardMaterial({ map: ft, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 });
        const off = th.barrier === 'tirewall' ? 1.1 : 0.6;
        const g2 = this.extrude([{ a: [d + side * off, 1.0], b: [d + side * off, 3.6], n: [-side, 0], u: [0, 20] }], 0.15);
        // map u across height with many repeats: emulate via uv scale
        const uvA = g2.attributes.uv;
        for (let i = 0; i < uvA.count; i++) uvA.setX(i, uvA.getX(i));
        add(g2, fmat, false);
        // fence top rail
        add(this.extrude([{ a: [d + side * off, 3.55], b: [d + side * (off + 0.05), 3.62], n: [0, 1] }], 4), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.3 }), false);
      }
    }
    return grp;
  }

  _buildStart() {
    const grp = new THREE.Group();
    const p = this.pointAt(0, 0);
    const W = this.W;
    // checkered line
    const chk = checkerTexture('#111111', '#f2f2f2', 16);
    const lineGeo = new THREE.PlaneGeometry(W, 1.6);
    lineGeo.rotateX(-Math.PI / 2);
    const line = new THREE.Mesh(lineGeo, new THREE.MeshStandardMaterial({ map: chk, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    line.position.set(p.x, p.y + 0.012, p.z);
    line.rotation.y = p.heading;
    line.receiveShadow = true;
    grp.add(line);
    // grid boxes
    const gridMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let k = 0; k < 12; k++) {
      const s = -10 - k * 7;
      const d = (k % 2 ? 1 : -1) * W * 0.22;
      const q = this.pointAt(s, d);
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.18).rotateX(-Math.PI / 2), gridMat);
      bar.position.set(q.x, q.y + 0.012, q.z);
      bar.rotation.y = q.heading;
      grp.add(bar);
    }
    // gantry
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1c22, metalness: 0.7, roughness: 0.35 });
    const half = this.barrierD + 0.5;
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8, 0.9), mat);
      pil.position.set(s * -half, 4, 0);
      pil.castShadow = true;
      g.add(pil);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.9, 1.6, 1.2), mat);
    beam.position.set(0, 7.4, 0);
    beam.castShadow = true;
    g.add(beam);
    // banner
    const bc = makeCanvas(1024, 128);
    const bg = bc.g;
    const grd = bg.createLinearGradient(0, 0, 1024, 0);
    grd.addColorStop(0, '#0a0d18'); grd.addColorStop(0.5, '#142040'); grd.addColorStop(1, '#0a0d18');
    bg.fillStyle = grd; bg.fillRect(0, 0, 1024, 128);
    bg.font = '900 84px Orbitron, Arial, sans-serif';
    bg.textAlign = 'center'; bg.textBaseline = 'middle';
    bg.fillStyle = '#ffffff'; bg.shadowColor = '#00d8ff'; bg.shadowBlur = 20;
    bg.fillText('MOTO MÍTICO', 512, 68);
    const btex = toTexture(bc.c, { wrap: false });
    const bmat = new THREE.MeshStandardMaterial({ map: btex, emissive: 0xffffff, emissiveMap: btex, emissiveIntensity: 1.2 });
    for (const zf of [-1, 1]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 - 1, 1.2), bmat);
      banner.position.set(0, 7.4, zf * 0.61);
      if (zf < 0) banner.rotation.y = Math.PI;
      g.add(banner);
    }
    // start lights (5 pairs)
    this.startLights = [];
    for (let k = 0; k < 5; k++) {
      const lm = new THREE.MeshStandardMaterial({ color: 0x110000, emissive: 0xff0000, emissiveIntensity: 0 });
      for (const zf of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), lm);
        l.position.set((k - 2) * 0.9, 6.2, zf * 0.62);
        if (zf < 0) l.rotation.y = Math.PI;
        g.add(l);
      }
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 1.1), mat);
      housing.position.set((k - 2) * 0.9, 6.2, 0);
      g.add(housing);
      this.startLights.push(lm);
    }
    // local Z = track tangent, local X spans the road
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.heading;
    grp.add(g);
    this.gantry = g;
    return grp;
  }

  setStartLights(n, green = false) {
    if (!this.startLights) return;
    this.startLights.forEach((m, k) => {
      if (green) { m.emissive.set(0x00ff40); m.emissiveIntensity = 5; } else {
        m.emissive.set(0xff0000);
        m.emissiveIntensity = k < n ? 6 : 0;
      }
    });
  }
}
