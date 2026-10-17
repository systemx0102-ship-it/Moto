// Realistic procedural vegetation: species-specific trees built from bark
// tubes + alpha leaf cards with rounded-crown normals, wind animation in the
// vertex shader, baked impostors for distant trees, grass/ferns/bushes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, clamp } from '../core/utils.js';
import { leafClusterTexture, firFrondTexture, pineTuftTexture, palmFrondTexture, grassTexture, fernTexture, barkTexture } from './vegTextures.js';

export const WIND = { time: { value: 0 }, strength: { value: 1 } };

// Inject wind sway into a material (works with instancing).
export function addWind(mat, amp = 0.25, freq = 1.3, stiff = 1.0) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWindTime = WIND.time;
    sh.uniforms.uWindStr = WIND.strength;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uWindTime; uniform float uWindStr;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float hgt = max(0.0, transformed.y) * ${stiff.toFixed(3)};
          float ph = ip.x * 0.07 + ip.z * 0.05;
          float sway = sin(uWindTime * ${freq.toFixed(3)} + ph) * 0.6 + sin(uWindTime * ${(freq * 2.7).toFixed(3)} + ph * 3.0 + transformed.x) * 0.25;
          float flutter = sin(uWindTime * 7.0 + transformed.x * 3.0 + transformed.z * 2.0 + ph) * 0.04;
          float k = hgt * hgt * ${(amp * 0.02).toFixed(4)} * uWindStr;
          transformed.x += sway * k + flutter * hgt * 0.15 * uWindStr;
          transformed.z += sway * k * 0.6 + flutter * hgt * 0.1 * uWindStr;
        }`);
  };
  mat.customProgramCacheKey = () => `wind${amp}_${freq}_${stiff}`;
  return mat;
}

// --------------------------------------------------------------- geometry helpers
function tubeAlong(pts, r0, r1, radial = 6, vScale = 1) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const seg = Math.max(2, pts.length * 2);
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  // taper: scale ring radius by t
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  const frames = curve.computeFrenetFrames(seg, false);
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const p = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      const nx = nrm.getX(k), ny = nrm.getY(k), nz = nrm.getZ(k);
      pos.setXYZ(k, p.x + nx * r, p.y + ny * r, p.z + nz * r);
      uv.setXY(k, j / radial, t * vScale);
    }
  }
  void frames;
  g.computeVertexNormals();
  return g;
}

// A quad card centered at c, spanning axes ax (width) and ay (height); normals rounded from crown center.
function cardGeo(c, ax, ay, w, h, crown, upBias = 0.4, uv = [0, 0, 1, 1], ao = null) {
  const A = new THREE.Vector3(...ax).normalize().multiplyScalar(w / 2);
  const B = new THREE.Vector3(...ay).normalize().multiplyScalar(h / 2);
  const C = new THREE.Vector3(...c);
  const p = [C.clone().sub(A).sub(B), C.clone().add(A).sub(B), C.clone().add(A).add(B), C.clone().sub(A).add(B)];
  const pos = [], nor = [], uvs = [];
  const cr = new THREE.Vector3(...crown);
  for (const v of p) {
    pos.push(v.x, v.y, v.z);
    const n = v.clone().sub(cr).normalize();
    n.y += upBias; n.normalize();
    nor.push(n.x, n.y, n.z);
  }
  uvs.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // ambient occlusion: darker toward the crown core and toward the bottom
  const col = [];
  const rad = ao ?? 3;
  for (const v of p) {
    const d = Math.min(1, v.distanceTo(cr) / rad);
    const k = 0.42 + 0.58 * Math.pow(d, 0.8) + Math.max(0, (v.y - cr.y) / (rad * 4));
    col.push(Math.min(1.1, k), Math.min(1.1, k), Math.min(1.1, k * 0.96));
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

// Three intersecting cards around a point (volumetric leaf cluster)
function clusterGeo(c, size, crown, r, upBias = 0.5, ao = 3) {
  const out = [];
  const a0 = r() * Math.PI;
  for (let k = 0; k < 3; k++) {
    const a = a0 + (k * Math.PI) / 3;
    const tilt = (r() - 0.5) * 0.6;
    const ax = [Math.cos(a), 0, Math.sin(a)];
    const ay = [Math.sin(tilt) * Math.sin(a), Math.cos(tilt), -Math.sin(tilt) * Math.cos(a)];
    out.push(cardGeo(c, ax, k === 2 ? [Math.cos(a + 1.57), 0.25, Math.sin(a + 1.57)] : ay, size * (0.9 + r() * 0.25), size * (0.9 + r() * 0.25), crown, upBias, undefined, ao));
  }
  return out;
}

function prep(list, withColor = false) {
  return mergeGeometries(list.map((g) => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', ...(withColor ? ['color'] : [])].includes(k)) g.deleteAttribute(k);
    if (withColor && !g.attributes.color) {
      const n = g.attributes.position.count;
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
    return g.index ? g.toNonIndexed() : g;
  }), false);
}

// --------------------------------------------------------------- species
function broadleafTree(seed, kind) {
  const r = rng(seed);
  const birch = kind === 'birch';
  const H = birch ? 11 + r() * 4 : 10 + r() * 4;
  const bark = [], leaves = [];
  const lean = [(r() - 0.5) * 0.7, (r() - 0.5) * 0.7];
  const trunkPts = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; trunkPts.push([lean[0] * t * t + Math.sin(t * 5 + seed) * 0.12, t * H * 0.8, lean[1] * t * t]); }
  bark.push(tubeAlong(trunkPts, birch ? 0.24 : 0.42, 0.1, 8, 3));
  // root flare
  const flare = new THREE.CylinderGeometry(birch ? 0.25 : 0.42, birch ? 0.4 : 0.75, 0.7, 8, 1, true);
  flare.translate(0, 0.3, 0);
  bark.push(flare);
  const crown = [lean[0] * 0.7, H * 0.66, lean[1] * 0.7];
  const crx = birch ? 2.3 : 3.6, cry = birch ? 3.4 : 3.0;
  const nB = birch ? 6 : 7;
  for (let b = 0; b < nB; b++) {
    const a = (b / nB) * Math.PI * 2 + r() * 0.6;
    const h0 = H * (0.42 + r() * 0.28);
    const len = crx * (0.6 + r() * 0.3);
    const up = 0.6 + r() * 0.4;
    const p0 = [lean[0] * (h0 / H) ** 2, h0, lean[1] * (h0 / H) ** 2];
    const p1 = [p0[0] + Math.cos(a) * len * 0.5, h0 + len * up * 0.55, p0[2] + Math.sin(a) * len * 0.5];
    const p2 = [p0[0] + Math.cos(a) * len, h0 + len * up, p0[2] + Math.sin(a) * len];
    bark.push(tubeAlong([p0, p1, p2], birch ? 0.09 : 0.15, 0.04, 5, 1));
  }
  // dense ellipsoidal crown of leaf clusters (outer shell + inner fill)
  const csize = birch ? 2.0 : 2.9;
  const shell = birch ? 26 : 34;
  for (let i = 0; i < shell; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2;
    const k = Math.sqrt(1 - u * u);
    const rr = 0.78 + r() * 0.3;
    const c = [crown[0] + Math.cos(a) * k * crx * rr, crown[1] + u * cry * rr + (u < 0 ? u * 0.4 : 0), crown[2] + Math.sin(a) * k * crx * rr];
    leaves.push(...clusterGeo(c, csize * (0.85 + r() * 0.35), crown, r, 0.35, Math.max(crx, cry)));
  }
  for (let i = 0; i < (birch ? 8 : 12); i++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * crx * 0.5;
    leaves.push(...clusterGeo([crown[0] + Math.cos(a) * rr, crown[1] + (r() - 0.5) * cry, crown[2] + Math.sin(a) * rr], csize, crown, r, 0.35, Math.max(crx, cry)));
  }
  return { bark: prep(bark), leaves: prep(leaves, true), height: H };
}

function firTree(seed, snowy) {
  const r = rng(seed);
  const H = 14 + r() * 7;
  const bark = [tubeAlong([[0, 0, 0], [0, H * 0.45, 0], [0, H * 0.9, 0]], 0.36, 0.06, 7, 6)];
  const fr = [];
  const levels = 19;
  const R = 3.1 + r() * 0.9;
  for (let l = 0; l < levels; l++) {
    const t = l / levels;
    const y = 1.3 + t * (H - 2.0);
    const L = R * Math.pow(1 - t, 1.05) + 0.45 + r() * 0.25;
    const n = t > 0.75 ? 5 : 7;
    const a0 = r() * Math.PI * 2;
    const core = [0, y - 0.8, 0];
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + (r() - 0.5) * 0.35;
      const droop = 0.22 + r() * 0.2 + t * 0.1;
      const dir = [Math.cos(a), -droop, Math.sin(a)];
      const side = [-Math.sin(a), 0, Math.cos(a)];
      const c = [dir[0] * L * 0.5, y + dir[1] * L * 0.5, dir[2] * L * 0.5];
      const w = L * 0.78 + 0.3;
      fr.push(cardGeo(c, dir, side, L, w, core, 1.0, undefined, R));
      // vertical card facing outward so the frond reads from the side
      fr.push(cardGeo([c[0], c[1] - 0.05, c[2]], dir, [0, 1, 0], L * 0.95, w * 0.62, core, 0.5, undefined, R));
      // diagonal card for volume
      fr.push(cardGeo([c[0] * 0.92, c[1] + 0.15, c[2] * 0.92], dir, [side[0] * 0.7, 0.7, side[2] * 0.7], L * 0.85, w * 0.7, core, 0.7, undefined, R));
    }
  }
  // leader (top shoot)
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    fr.push(cardGeo([0, H - 0.6, 0], [0, 1, 0], [Math.cos(a), 0, Math.sin(a)], 1.6, 0.8, [0, H - 2, 0], 0.4, undefined, R));
  }
  void snowy;
  return { bark: prep(bark), leaves: prep(fr, true), height: H };
}

function pineTree(seed) {
  const r = rng(seed);
  const H = 12 + r() * 5;
  const bend = [(r() - 0.5) * 1.2, (r() - 0.5) * 1.2];
  const pts = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push([bend[0] * Math.sin(t * 2), t * H, bend[1] * Math.sin(t * 2)]); }
  const bark = [tubeAlong(pts, 0.3, 0.1, 7, 5)];
  const leaves = [];
  const top = pts[5];
  const crown = [top[0], H * 0.86, top[2]];
  for (let b = 0; b < 5; b++) {
    const a = r() * Math.PI * 2, h0 = H * (0.62 + r() * 0.25), len = 2 + r() * 1.6;
    const p0 = [bend[0] * Math.sin((h0 / H) * 2), h0, bend[1] * Math.sin((h0 / H) * 2)];
    const p2 = [p0[0] + Math.cos(a) * len, h0 + len * 0.4, p0[2] + Math.sin(a) * len];
    bark.push(tubeAlong([p0, [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2 + 0.2, (p0[2] + p2[2]) / 2], p2], 0.1, 0.04, 5, 1));
    leaves.push(...clusterGeo(p2, 2.2 + r(), crown, r, 0.8));
  }
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 2.6;
    leaves.push(...clusterGeo([crown[0] + Math.cos(a) * rr, crown[1] + (r() - 0.3) * 2.2, crown[2] + Math.sin(a) * rr], 2.2 + r() * 0.8, crown, r, 0.8));
  }
  return { bark: prep(bark), leaves: prep(leaves, true), height: H };
}

function palmTree(seed) {
  const r = rng(seed);
  const H = 8 + r() * 4;
  const lean = 1.5 + r() * 2;
  const pts = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([Math.sin(t * 1.3) * lean, t * H, 0]); }
  const bark = [tubeAlong(pts, 0.28, 0.2, 8, 8)];
  const leaves = [];
  const top = pts[6];
  const n = 13;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.3;
    const L = 4.2 + r() * 1.4;
    const segs = 6;
    const pos = [], nor = [], uv = [], idx = [];
    const droop = 0.4 + r() * 0.6;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const d = t * L;
      const y = top[1] + 0.4 + d * (0.5 - droop * t * 1.2);
      const cx = top[0] + Math.cos(a) * d, cz = top[2] + Math.sin(a) * d;
      const w = 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08));
      const sx = -Math.sin(a), sz = Math.cos(a);
      pos.push(cx - sx * w, y, cz - sz * w, cx + sx * w, y, cz + sz * w);
      nor.push(0, 1, 0, 0, 1, 0);
      uv.push(t, 0, t, 1);
      if (i < segs) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
    leaves.push(g);
  }
  // coconuts
  for (let k = 0; k < 4; k++) {
    const s = new THREE.SphereGeometry(0.16, 8, 6);
    s.translate(top[0] + Math.cos(k * 1.6) * 0.25, top[1] - 0.1, top[2] + Math.sin(k * 1.6) * 0.25);
    bark.push(s);
  }
  return { bark: prep(bark), leaves: prep(leaves, true), height: H };
}

function cactusGeo(seed) {
  const r = rng(seed);
  const star = (rad, h0, h1, n = 12) => {
    const prof = [];
    prof.push([0.001, h0]);
    const g = new THREE.LatheGeometry([new THREE.Vector2(rad * 0.9, h0), new THREE.Vector2(rad, h0 + 0.2), new THREE.Vector2(rad, h1 - rad), new THREE.Vector2(rad * 0.6, h1 - rad * 0.3), new THREE.Vector2(0.01, h1)], n * 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + Math.cos(a * n) * 0.08;
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    g.computeVertexNormals();
    void prof;
    return g;
  };
  const parts = [star(0.42, 0, 4.6 + r() * 1.5)];
  for (const s of [-1, 1]) {
    if (r() < 0.25) continue;
    const y0 = 1.4 + r() * 1.2;
    const arm = star(0.28, 0, 1.6 + r());
    arm.translate(s * 1.0, y0 + 0.4, 0);
    parts.push(arm);
    const elbow = tubeAlong([[0, y0, 0], [s * 0.6, y0 + 0.05, 0], [s * 1.0, y0 + 0.45, 0]], 0.3, 0.28, 10, 1);
    parts.push(elbow);
  }
  return prep(parts);
}

// --------------------------------------------------------------- impostors
function bakeImpostor(renderer, meshes, height) {
  const W = 256, H = 512;
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 2.6));
  const d = new THREE.DirectionalLight(0xffffff, 3.2); d.position.set(3, 6, 8); scene.add(d);
  const d2 = new THREE.DirectionalLight(0xffffff, 1.2); d2.position.set(-4, 3, 6); scene.add(d2);
  for (const m of meshes) scene.add(m);
  const halfH = height * 0.56;
  const cam = new THREE.OrthographicCamera(-halfH * 0.5, halfH * 0.5, halfH * 1.0 + halfH * 0.0, -halfH * 0.0, 0.1, 100);
  cam.top = height * 1.05; cam.bottom = -0.1; cam.left = -height * 0.27; cam.right = height * 0.27;
  cam.updateProjectionMatrix();
  cam.position.set(0, 0, 40); cam.lookAt(0, 0, 0);
  cam.position.y = 0;
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTone;
  for (const m of meshes) scene.remove(m);
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  return { tex: rt.texture, w: height * 0.54, h: height * 1.15, rt };
}

function impostorGeo(w, h) {
  const a = new THREE.PlaneGeometry(w, h); a.translate(0, h / 2 - 0.1, 0);
  const b = a.clone(); b.rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b], false);
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

// --------------------------------------------------------------- vegetation manager
export const SPECIES = { broadleafTree, firTree, pineTree, palmTree, cactusGeo, bakeImpostor, impostorGeo };

export class Vegetation {
  constructor(track, terrain, quality, renderer) {
    this.track = track; this.terrain = terrain; this.q = quality; this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    this.r = rng(track.def.id.length * 131 + 9);
    this.a2c = quality.msaa > 0;
    this.near = 75;
  }

  _foliageMat(tex, opts = {}) {
    const m = new THREE.MeshStandardMaterial({
      map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82, metalness: 0,
      alphaToCoverage: this.a2c, color: opts.color ?? 0xffffff, vertexColors: !!opts.vc,
    });
    return addWind(m, opts.amp ?? 0.25, opts.freq ?? 1.3, opts.stiff ?? 1);
  }
  _barkMat(kind) {
    const b = barkTexture(kind);
    return new THREE.MeshStandardMaterial({ map: b.map, normalMap: b.normalMap, roughness: 0.92 });
  }

  _place(count, minD, maxD, opts = {}) {
    const t = this.track, ter = this.terrain, r = this.r;
    const out = [];
    for (let n = 0; n < count * 3 && out.length < count; n++) {
      let x, z;
      if (r() < (opts.trackBias ?? 0.75)) {
        const p = t.pointAt(r() * t.L, 0);
        const side = r() < 0.5 ? -1 : 1;
        const off = t.barrierD + minD + Math.pow(r(), opts.pow ?? 1.4) * (maxD - minD);
        x = p.x - p.tz * side * off; z = p.z + p.tx * side * off;
      } else {
        x = ter.cx + (r() - 0.5) * ter.size * 0.85; z = ter.cz + (r() - 0.5) * ter.size * 0.85;
      }
      const d = ter.distanceToTrack(x, z);
      if (d < t.barrierD + minD || d > t.barrierD + maxD) continue;
      const y = ter.heightAt(x, z);
      if (t.theme.water && y < t.theme.water.level + 0.6) continue;
      out.push({ x, y, z, d });
    }
    return out;
  }

  _instanced(geo, mat, items, scaleR, { shadow = true, tint = 0.12, sink = 0.15 } = {}) {
    if (!items.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      if (!it.m4) {
        const sc = scaleR[0] + this.r() * (scaleR[1] - scaleR[0]);
        e.set((this.r() - 0.5) * 0.06, this.r() * Math.PI * 2, (this.r() - 0.5) * 0.06);
        q.setFromEuler(e);
        s.set(sc, sc * (0.9 + this.r() * 0.2), sc);
        p.set(it.x, it.y - sink * sc, it.z);
        it.m4 = new THREE.Matrix4().compose(p, q, s);
      }
      m4.copy(it.m4);
      mesh.setMatrixAt(i, m4);
      const v = 1 - tint + this.r() * tint * 2;
      c.setRGB(v * (it.tr ?? 1), v * (it.tg ?? 1), v * (it.tb ?? 1));
      mesh.setColorAt(i, c);
    });
    mesh.castShadow = shadow && this.q.shadows > 0;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    return mesh;
  }

  // species: {make(seed) -> {bark, leaves, height}, leafTex, barkKind, count, far, scale}
  _species(sp) {
    const variants = sp.variants ?? 3;
    const nearItems = this._place(Math.round(sp.count * this.q.density), sp.minD ?? 4, this.near, { pow: 1.2 });
    const farItems = this._place(Math.round((sp.far ?? 0) * this.q.density), this.near, sp.maxD ?? 650, { pow: 1.0, trackBias: 0.55 });
    const leafMat = this._foliageMat(sp.leafTex, { ...(sp.wind || {}), vc: true, color: sp.leafColor });
    const barkMat = this._barkMat(sp.barkKind);
    let impostor = null;
    for (let v = 0; v < variants; v++) {
      const model = sp.make(sp.seed + v * 17);
      const mine = nearItems.filter((_, i) => i % variants === v);
      if (mine.length) {
        this._instanced(model.bark, barkMat, mine, sp.scale, { tint: 0.1 });
        const lm = this._instanced(model.leaves, leafMat, mine.map((it) => it), sp.scale, { tint: sp.tint ?? 0.16 });
        void lm;
      }
      if (v === 0 && farItems.length) {
        const bm = new THREE.Mesh(model.bark, barkMat), fm = new THREE.Mesh(model.leaves, leafMat);
        impostor = bakeImpostor(this.renderer, [bm, fm], model.height);
      }
    }
    if (impostor && farItems.length) {
      const mat = new THREE.MeshStandardMaterial({ map: impostor.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, alphaToCoverage: this.a2c });
      this._instanced(impostorGeo(impostor.w, impostor.h), mat, farItems, sp.scale, { shadow: false, tint: 0.18, sink: 0 });
    }
  }

  _ground(tex, count, minD, maxD, size, { inRunoff = false, wind = 1, tint = 0.2, colorFn = null } = {}) {
    if (count <= 0) return;
    const t = this.track, ter = this.terrain, r = this.r;
    const items = [];
    for (let n = 0; n < count * 2 && items.length < count; n++) {
      const p = t.pointAt(r() * t.L, 0);
      const side = r() < 0.5 ? -1 : 1;
      const lo = inRunoff ? t.halfW + 1.6 : t.barrierD + 0.6;
      const off = lo + Math.pow(r(), 1.5) * (inRunoff ? (t.barrierD - 0.8 - lo) : maxD);
      const x = p.x - p.tz * side * off, z = p.z + p.tx * side * off;
      let y;
      if (off < t.barrierD + 2) { const pr = t.pointAt(p.i * t.ds, side * off); y = pr.y; }
      else {
        if (ter.distanceToTrack(x, z) < t.barrierD + 0.5) continue;
        y = ter.heightAt(x, z);
      }
      if (t.theme.water && y < t.theme.water.level + 0.3) continue;
      const it = { x, y, z };
      if (colorFn) Object.assign(it, colorFn(r));
      items.push(it);
    }
    const w = size[0], h = size[1];
    const parts = [];
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      const g = new THREE.PlaneGeometry(w, h, 1, 2);
      g.translate(0, h / 2, 0);
      g.rotateY(a);
      parts.push(g);
    }
    const geo = mergeGeometries(parts, false);
    const nrm = geo.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0); // soft, sky-lit look
    const mat = this._foliageMat(tex, { amp: 1.4 * wind, freq: 1.8, stiff: 2.2 });
    mat.alphaTest = 0.4;
    this._instanced(geo, mat, items, [0.7, 1.3], { shadow: false, tint, sink: 0.03 });
  }

  build() {
    const th = this.track.def.theme;
    const snowy = th === 'alpine';
    const S = (n) => Math.round(n);
    const grassN = this.q.density >= 1 ? 1 : this.q.density >= 0.7 ? 0.5 : 0;
    if (th === 'gp') {
      this._species({ make: (s) => broadleafTree(s, 'oak'), leafTex: leafClusterTexture('oak', 1), barkKind: 'oak', count: S(260), far: 700, scale: [0.85, 1.3], seed: 11, minD: 8 });
      this._species({ make: (s) => broadleafTree(s, 'beech'), leafTex: leafClusterTexture('beech', 2), barkKind: 'oak', count: S(160), far: 400, scale: [0.85, 1.25], seed: 21, minD: 8 });
      this._species({ make: (s) => pineTree(s), leafTex: pineTuftTexture(3), barkKind: 'pine', count: S(90), far: 300, scale: [0.85, 1.2], seed: 31, minD: 10 });
      this._ground(grassTexture('green', 1), S(9000 * grassN), 0, 45, [1.1, 0.55]);
      this._ground(grassTexture('flowers', 2), S(2500 * grassN), 0, 40, [1.1, 0.5]);
      this._ground(leafClusterTexture('bush', 4), S(260), 3, 60, [1.8, 1.3], { wind: 0.4 });
    } else if (th === 'coast') {
      this._species({ make: (s) => palmTree(s), leafTex: palmFrondTexture(4), barkKind: 'palm', count: S(220), far: 380, scale: [0.85, 1.25], seed: 41, minD: 4, wind: { amp: 0.5, freq: 1.1 } });
      this._species({ make: (s) => pineTree(s), leafTex: pineTuftTexture(5), barkKind: 'pine', count: S(110), far: 300, scale: [0.8, 1.15], seed: 51, minD: 8 });
      this._ground(grassTexture('dry', 3), S(7000 * grassN), 0, 45, [1.1, 0.6]);
      this._ground(leafClusterTexture('bush', 6), S(320), 2, 70, [1.8, 1.2], { wind: 0.4 });
    } else if (th === 'desert') {
      const cg = cactusGeo(7), cg2 = cactusGeo(8);
      const cm = new THREE.MeshStandardMaterial({ color: 0x4f7a3e, roughness: 0.75 });
      const items = this._place(S(300 * this.q.density + 60), 6, 500, { pow: 1.1, trackBias: 0.6 });
      this._instanced(cg, cm, items.filter((_, i) => i % 2 === 0), [0.6, 1.4], { tint: 0.15 });
      this._instanced(cg2, cm, items.filter((_, i) => i % 2 === 1), [0.6, 1.3], { tint: 0.15 });
      this._ground(grassTexture('dry', 9), S(2200 * grassN + 300), 1, 120, [1.2, 0.7], { wind: 0.6, tint: 0.3 });
    } else if (th === 'alpine') {
      this._species({ make: (s) => firTree(s, true), leafTex: firFrondTexture(true, 2), barkKind: 'pine', count: S(620), far: 1800, scale: [0.7, 1.25], seed: 61, minD: 3, wind: { amp: 0.12, freq: 0.9 }, tint: 0.12 });
      this._ground(grassTexture('snow', 10), S(1800 * grassN), 0, 25, [1.0, 0.45], { wind: 0.6 });
    } else if (th === 'forest') {
      this._species({ make: (s) => firTree(s, false), leafTex: firFrondTexture(false, 3), barkKind: 'pine', count: S(560), far: 2600, scale: [0.75, 1.3], seed: 71, minD: 2.5, wind: { amp: 0.2, freq: 1.0 } });
      this._species({ make: (s) => broadleafTree(s, 'beech'), leafTex: leafClusterTexture('beech', 7), barkKind: 'oak', count: S(300), far: 900, scale: [0.85, 1.35], seed: 81, minD: 2.5, wind: { amp: 0.35, freq: 1.4 } });
      this._species({ make: (s) => broadleafTree(s, 'birch'), leafTex: leafClusterTexture('birch', 8), barkKind: 'birch', count: S(140), far: 300, scale: [0.85, 1.2], seed: 91, minD: 3, wind: { amp: 0.4, freq: 1.6 } });
      this._ground(fernTexture(1), S(3200 * Math.max(0.35, grassN)), 0, 55, [1.5, 1.0], { wind: 0.7 });
      this._ground(leafClusterTexture('bush', 9), S(700), 0, 60, [1.9, 1.4], { wind: 0.5 });
      this._ground(grassTexture('green', 11), S(5000 * grassN), 0, 30, [1.1, 0.6]);
      this._ground(grassTexture('green', 12), S(1500 * grassN), 0, 0, [1.0, 0.5], { inRunoff: true });
    }
    return this.group;
  }
}
