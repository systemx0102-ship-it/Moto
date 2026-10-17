// Terrain height field blended into the track corridor, distant mountain ring and water.
import * as THREE from 'three';
import { Noise2D, smoothstep, clamp, rng } from '../core/utils.js';
import { groundTextures } from '../core/textures.js';

// Terrain material: anti-tiled base ground + triplanar rock on slopes + macro dirt patches
export function splatMaterial(theme) {
  const g = groundTextures(theme.ground, 5), rk = groundTextures(theme.rockGround || 'stone', 8), dt = groundTextures(theme.dirtGround || 'dirt', 13);
  const mat = new THREE.MeshStandardMaterial({ map: g.map, normalMap: g.normalMap, roughnessMap: g.roughnessMap, vertexColors: true, color: 0xffffff });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tRock = { value: rk.map };
    sh.uniforms.tDirt = { value: dt.map };
    sh.uniforms.uDirtAmt = { value: theme.dirtAmt ?? 0.5 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN; varying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWN = normalize(mat3(modelMatrix) * normal); vWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tRock; uniform sampler2D tDirt; uniform float uDirtAmt; varying vec3 vWN; varying vec3 vWP;')
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 gA = texture2D(map, vMapUv);
          vec4 gB = texture2D(map, vMapUv * 0.31 + vec2(0.37, 0.71));
          float macro = texture2D(tDirt, vWP.xz * 0.0023).g;
          float macro2 = texture2D(map, vWP.xz * 0.0011).g;
          vec4 ground = mix(gA, gB, 0.42) * (0.82 + macro2 * 0.36);
          vec3 bw = pow(abs(vWN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec4 rockC = texture2D(tRock, vWP.zy * 0.06) * bw.x + texture2D(tRock, vWP.xz * 0.05) * bw.y + texture2D(tRock, vWP.xy * 0.06) * bw.z;
          vec4 dirtC = texture2D(tDirt, vMapUv * 0.7);
          float slope = 1.0 - clamp(vWN.y, 0.0, 1.0);
          float wRock = smoothstep(0.2, 0.42, slope + (macro - 0.5) * 0.2);
          float wDirt = smoothstep(0.52, 0.7, macro) * (1.0 - wRock) * uDirtAmt;
          vec4 c = mix(ground, dirtC, wDirt);
          c = mix(c, rockC, wRock);
          diffuseColor *= c;
        #endif`);
  };
  mat.customProgramCacheKey = () => 'splat';
  return mat;
}

export class Terrain {
  constructor(track, quality) {
    this.track = track;
    const th = track.theme.terrain;
    this.th = th;
    this.noise = new Noise2D(track.def.id.length * 131 + 7);
    const b = track.bounds;
    this.margin = 900;
    this.size = b.size + this.margin * 2;
    this.cx = b.cx; this.cz = b.cz;
    this.res = quality.terrainRes;
    this.corridor = track.barrierD + 3;
    this.blend = th.followTrack ? 90 : 70;
    this._stamp();
  }

  // natural terrain height (no track influence)
  natural(x, z) {
    const th = this.th, n = this.noise;
    if (th.flat) return th.base;
    const s = th.scale;
    let h;
    if (th.ridged) {
      h = n.ridged(x / s, z / s, 5);
      h = (h - 0.45) * th.amp * 1.6;
    } else {
      h = n.fbm(x / s, z / s, 5) * th.amp;
    }
    if (th.mesa) {
      // terraced plateaus
      const step = 14;
      const f = h / step;
      const fl = Math.floor(f);
      const t = f - fl;
      h = (fl + smoothstep(0.75, 0.95, t)) * step;
    }
    h += n.fbm(x / 40, z / 40, 3) * 1.2;
    if (th.ocean) {
      const [dx, dz] = th.ocean.dir;
      const proj = (x - this.cx) * dx + (z - this.cz) * dz;
      const over = proj - (-th.ocean.start);
      if (over > 0) h -= over * th.ocean.drop;
    }
    return h + th.base;
  }

  _stamp() {
    const R = this.res;
    const t = this.track;
    const size = this.size;
    const step = size / R;
    const x0 = this.cx - size / 2, z0 = this.cz - size / 2;
    this.x0 = x0; this.z0 = z0; this.step = step;
    const n = (R + 1) * (R + 1);
    const dist = new Float32Array(n).fill(1e9);
    const trackY = new Float32Array(n);
    const reach = this.corridor + this.blend;
    const cells = Math.ceil(reach / step);
    const { x, y, z } = t.c;
    for (let i = 0; i < t.N; i += 2) {
      const gx = Math.round((x[i] - x0) / step), gz = Math.round((z[i] - z0) / step);
      for (let j = gz - cells; j <= gz + cells; j++) {
        if (j < 0 || j > R) continue;
        for (let k = gx - cells; k <= gx + cells; k++) {
          if (k < 0 || k > R) continue;
          const px = x0 + k * step, pz = z0 + j * step;
          const d = Math.hypot(px - x[i], pz - z[i]);
          const id = j * (R + 1) + k;
          if (d < dist[id]) { dist[id] = d; trackY[id] = y[i]; }
        }
      }
    }
    this.dist = dist; this.trackY = trackY;
  }

  heightAtVertex(k, j) {
    const R = this.res;
    const id = j * (R + 1) + k;
    const px = this.x0 + k * this.step, pz = this.z0 + j * this.step;
    const nat = this.natural(px, pz);
    const d = this.dist[id];
    if (d > this.corridor + this.blend) return nat;
    const road = this.trackY[id] - 0.6;
    if (d <= this.corridor) return road;
    const tt = smoothstep(this.corridor, this.corridor + this.blend, d);
    return road + (nat - road) * tt;
  }

  // approximate height anywhere (bilinear on the grid)
  heightAt(x, z) {
    const R = this.res;
    const fx = clamp((x - this.x0) / this.step, 0, R - 0.001), fz = clamp((z - this.z0) / this.step, 0, R - 0.001);
    const k = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - k, tz = fz - j;
    const H = this.heights;
    const a = H[j * (R + 1) + k], b = H[j * (R + 1) + k + 1], c = H[(j + 1) * (R + 1) + k], d = H[(j + 1) * (R + 1) + k + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  distanceToTrack(x, z) {
    const R = this.res;
    const k = clamp(Math.round((x - this.x0) / this.step), 0, R), j = clamp(Math.round((z - this.z0) / this.step), 0, R);
    return this.dist[j * (R + 1) + k];
  }

  build() {
    const R = this.res;
    const geo = new THREE.PlaneGeometry(this.size, this.size, R, R);
    geo.rotateX(-Math.PI / 2);
    // PlaneGeometry after rotation: vertices ordered rows along -z? compute from positions directly
    const pos = geo.attributes.position;
    const heights = new Float32Array((R + 1) * (R + 1));
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(this.th.color), rock = new THREE.Color(this.th.rockColor);
    const r = rng(9);
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i) + this.cx, pz = pos.getZ(i) + this.cz;
      const k = Math.round((px - this.x0) / this.step), j = Math.round((pz - this.z0) / this.step);
      const h = this.heightAtVertex(k, j);
      heights[j * (R + 1) + k] = h;
      pos.setXYZ(i, px, h, pz);
    }
    this.heights = heights;
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    void base; void rock;
    for (let i = 0; i < pos.count; i++) {
      // subtle large-scale value variation + darker hollows (fake AO)
      const n1 = this.noise.noise(pos.getX(i) / 60, pos.getZ(i) / 60), n2 = this.noise.noise(pos.getX(i) / 220 + 7, pos.getZ(i) / 220);
      const v = 0.9 + r() * 0.06 + n1 * 0.07 + n2 * 0.06;
      colors[i * 3] = v * (1 + n2 * 0.04); colors[i * 3 + 1] = v; colors[i * 3 + 2] = v * (1 - n2 * 0.03);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // world-space uv for tiling
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 14, pos.getZ(i) / 14);
    const mat = splatMaterial(this.track.theme);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    const group = new THREE.Group();
    group.add(mesh);
    group.add(this._farRing());
    if (this.track.theme.water) group.add(this._water());
    this.group = group;
    return group;
  }

  _farRing() {
    const far = this.track.theme.far;
    const group = new THREE.Group();
    if (far.skyline) {
      // distant city skyline: tall dark boxes with lit windows (merged)
      return group;
    }
    if (!far.height) return group;
    const segs = 160, rows = 6;
    const radius = this.size * 0.62;
    const pos = [], col = [], idx = [];
    const n = this.noise;
    const cBase = new THREE.Color(far.color), cSnow = new THREE.Color(0xf4f8ff);
    for (let r = 0; r <= rows; r++) {
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const v = r / rows;
        const ridge = n.ridged(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + 10, 5);
        let h = Math.pow(ridge, 2.2) * far.height * (0.6 + 0.4 * n.noise(a * 2, 3));
        if (far.mesa) h = Math.round(h / 40) * 40 * 0.9 + h * 0.1;
        const rr = radius + v * radius * 0.25;
        const hh = -20 + h * Math.sin(v * Math.PI) * (v < 0.5 ? v * 2 : 1);
        pos.push(this.cx + Math.cos(a) * rr, hh, this.cz + Math.sin(a) * rr);
        const t = far.snow ? smoothstep(far.height * 0.35, far.height * 0.6, hh) : 0;
        const c = cBase.clone().lerp(cSnow, t);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let s = 0; s < segs; s++) {
        const a = r * (segs + 1) + s, b = a + 1, c = a + segs + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide, flatShading: true }));
    group.add(m);
    return group;
  }

  _water() {
    const w = this.track.theme.water;
    const geo = new THREE.PlaneGeometry(this.size * 1.6, this.size * 1.6, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshPhysicalMaterial({
      color: w.color, roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4,
    });
    const m = new THREE.Mesh(geo, this.waterMat);
    m.position.set(this.cx, w.level, this.cz);
    m.receiveShadow = false;
    return m;
  }
}
