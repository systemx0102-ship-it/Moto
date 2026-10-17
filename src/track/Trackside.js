// Trackside detail: rubbered-in racing line, sponsor bridges, waving flags,
// ad hoardings, snow banks and city overhead structures with flickering neon.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, clamp, smoothstep } from '../core/utils.js';
import { makeCanvas, toTexture, billboardTexture, neonSignTexture, groundTextures } from '../core/textures.js';
import { smooth1D } from './trackgen.js';
import { WIND } from './Vegetation.js';

const BRANDS = [
  ['NEXOIL', '#0a2a6a', '#ffffff', '#ffcc00'], ['VELOX', '#111111', '#ff3a3a', '#ffffff'], ['KRYO', '#00a0d8', '#ffffff', '#003a5a'],
  ['TURBOMAX', '#c8102e', '#ffffff', '#111111'], ['AURA', '#2a0a4a', '#ff7af0', '#00e5ff'], ['MÍTICO', '#05060a', '#ffffff', '#00d8ff'],
  ['ZENTEK', '#f2f2f2', '#111111', '#ff6a00'], ['RAYO', '#ffd400', '#111111', '#111111'],
];

function streakTexture() {
  const W = 128, H = 512;
  const { c, g } = makeCanvas(W, H);
  g.clearRect(0, 0, W, H);
  const r = rng(77);
  for (let i = 0; i < 90; i++) {
    const x = W * (0.15 + r() * 0.7);
    const w = 1 + r() * 4;
    g.fillStyle = `rgba(8,8,8,${0.1 + r() * 0.35})`;
    g.fillRect(x, r() * H * 0.3, w, H * (0.4 + r() * 0.8));
  }
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.2, 'rgba(0,0,0,0)'); grd.addColorStop(0.8, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  return toTexture(c);
}

export class Trackside {
  constructor(track, terrain, quality) {
    this.track = track; this.terrain = terrain; this.q = quality;
    this.group = new THREE.Group();
    this.group.name = 'trackside';
    this.r = rng(track.def.id.length * 53 + 1);
    this.neon = [];
    this.time = 0;
  }

  build() {
    const th = this.track.def.theme;
    this._rubber();
    if (th === 'gp') { this._bridge(260, 0); this._bridge(this.track.L * 0.55, 3); this._flags(); this._hoardings(1.0); }
    if (th === 'coast') { this._bridge(this.track.L * 0.4, 5); this._hoardings(0.5); }
    if (th === 'desert') { this._bridge(this.track.L * 0.32, 1); this._flags(); this._hoardings(0.6); }
    if (th === 'alpine' || this.track.def.weather === 'snow') this._snowBanks();
    if (th === 'city') { this._cityOverheads(); }
    if (th === 'forest') this._hoardings(0.25);
    return this.group;
  }

  // dark rubber laid down along the racing line (stronger in braking zones and corners)
  _rubber() {
    const t = this.track, c = t.c, N = t.N;
    if (!t.lineD) return;
    const k = smooth1D(Float32Array.from(t.lineK, Math.abs), 10);
    const ahead = new Float32Array(N);
    for (let i = 0; i < N; i++) { let m = 0; for (let j = 0; j < 30; j += 3) m = Math.max(m, k[(i + j) % N]); ahead[i] = m; }
    const pos = [], uv = [], col = [], idx = [];
    const w = 0.95;
    let row = 0;
    for (let ii = 0; ii <= N; ii++) {
      const i = ii % N;
      const d = t.lineD[i];
      const tb = Math.tan(c.bank[i]);
      const inten = clamp(0.25 + k[i] * 28 + ahead[i] * 22, 0, 1) * (t.wet ? 0.6 : 1);
      for (const o of [-w, w]) {
        const dd = d + o;
        pos.push(c.x[i] + c.rx[i] * dd, c.y[i] + dd * tb + 0.008, c.z[i] + c.rz[i] * dd);
        uv.push(o < 0 ? 0 : 1, (ii * t.ds) / 9);
        col.push(1, 1, 1, inten);
      }
      if (ii > 0) { const a = (row - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      row++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const mat = new THREE.MeshStandardMaterial({ map: streakTexture(), transparent: true, depthWrite: false, vertexColors: true, roughness: t.wet ? 0.3 : 0.75, color: 0x222222, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.renderOrder = 1;
    this.group.add(m);
  }

  _bridge(s, brandIdx) {
    const t = this.track;
    const p = t.pointAt(s, 0);
    const half = t.barrierD + 1.6;
    const H = 7.2;
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.8, roughness: 0.35 });
    for (const sd of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(1.0, H + 1.4, 1.0), steel);
      pil.position.set(sd * half, (H + 1.4) / 2, 0);
      pil.castShadow = true;
      g.add(pil);
    }
    // truss beam
    const beamL = half * 2 + 1;
    const chords = [[0, H, 0.5], [0, H, -0.5], [0, H + 1.3, 0.5], [0, H + 1.3, -0.5]];
    for (const [x, y, z] of chords) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(beamL, 0.14, 0.14), steel);
      b.position.set(x, y, z); b.castShadow = true; g.add(b);
    }
    for (let i = 0; i <= 12; i++) {
      const x = -beamL / 2 + (i / 12) * beamL;
      for (const z of [-0.5, 0.5]) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), steel);
        v.position.set(x, H + 0.65, z); g.add(v);
        if (i < 12) {
          const dgl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.06), steel);
          dgl.position.set(x + beamL / 24, H + 0.65, z); dgl.rotation.z = (i % 2 ? 1 : -1) * 0.6; g.add(dgl);
        }
      }
    }
    // sponsor banners both faces
    const [name, bg, fg, ac] = BRANDS[brandIdx % BRANDS.length];
    const tex = billboardTexture(name, bg, fg, ac);
    const night = this.track.def.time === 'night' || this.track.def.time === 'dusk';
    const bm = new THREE.MeshStandardMaterial({ map: tex, emissive: night ? 0xffffff : 0x000000, emissiveMap: tex, emissiveIntensity: 0.7, roughness: 0.5 });
    for (const z of [-0.56, 0.56]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(beamL - 2, 1.2), bm);
      pl.position.set(0, H + 0.65, z);
      if (z < 0) pl.rotation.y = Math.PI;
      g.add(pl);
    }
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.heading;
    this.group.add(g);
  }

  // waving flags on poles behind the barriers of the main straight
  _flags() {
    const t = this.track;
    const cols = [0xc8102e, 0xffffff, 0x123fb0, 0xffd400, 0x00a0d8, 0x111111, 0x3dff8a, 0xff6a00];
    const count = Math.round(26 * this.q.density + 6);
    const flagGeo = new THREE.PlaneGeometry(1.6, 1.0, 10, 4);
    flagGeo.translate(0.8, 4.4, 0);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uWindTime = WIND.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWindTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = 0.0;
          #ifdef USE_INSTANCING
            ph = instanceMatrix[3].x * 0.3 + instanceMatrix[3].z * 0.2;
          #endif
          float u = max(0.0, transformed.x);
          transformed.z += sin(uWindTime * 7.0 + u * 3.5 + ph) * u * 0.18 + sin(uWindTime * 3.1 + u * 1.7 + ph) * u * 0.08;
          transformed.y -= u * u * 0.05;`);
    };
    mat.customProgramCacheKey = () => 'flag';
    const flags = new THREE.InstancedMesh(flagGeo, mat, count);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.05, 5, 6).translate(0, 2.5, 0), new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.8, roughness: 0.3 }), count);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const s = -150 + (k / count) * 300;
      const side = k % 2 ? 1 : -1;
      const p = t.pointAt(s, side * (t.barrierD + 3.5));
      p.y = this.terrain.heightAt(p.x, p.z);
      const yaw = p.heading + Math.PI / 2 + (this.r() - 0.5) * 0.4; // flags stream across the wind
      m4.makeRotationY(yaw); m4.setPosition(p.x, p.y, p.z);
      flags.setMatrixAt(k, m4); poles.setMatrixAt(k, m4);
      flags.setColorAt(k, c.set(cols[k % cols.length]));
    }
    poles.castShadow = true;
    this.group.add(flags, poles);
  }

  // advertising boards behind the barriers on straights
  _hoardings(density) {
    const t = this.track;
    const per = BRANDS.map(() => []);
    const step = 7;
    let k = 0;
    for (let s = 0; s < t.L; s += step) {
      const i = Math.floor(s / t.ds) % t.N;
      if (Math.abs(t.c.kappaSmooth[i]) > 1 / 250) continue;
      if (this.r() > density) continue;
      for (const side of [-1, 1]) {
        if (this.r() < 0.35) continue;
        const p = t.pointAt(s, side * (t.barrierD + (t.theme.barrier === 'tirewall' ? 1.4 : 0.7)));
        p.y = Math.min(p.y, this.terrain.heightAt(p.x, p.z)) - 0.05;
        per[(k++ + (side > 0 ? 3 : 0)) % BRANDS.length].push({ p, side });
      }
    }
    // boards stand on two legs so they clear the barrier in front of them
    const lift = t.theme.barrier === 'tirewall' ? 1.05 : t.theme.barrier === 'concrete' ? 1.25 : 0.85;
    const geo = new THREE.BoxGeometry(6.6, 1.25, 0.08);
    geo.translate(0, lift + 0.625, 0);
    const legGeo = mergeGeometries([-2.6, 2.6].map((x) => new THREE.BoxGeometry(0.1, lift + 1.2, 0.1).translate(x, (lift + 1.2) / 2, -0.09)));
    const back = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.7 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.7, roughness: 0.45 });
    const total = per.reduce((a, l) => a + l.length, 0);
    const legs = new THREE.InstancedMesh(legGeo, legMat, Math.max(1, total));
    let li = 0;
    const m4 = new THREE.Matrix4();
    per.forEach((list, b) => {
      if (!list.length) return;
      const [name, bg, fg, ac] = BRANDS[b];
      const tex = billboardTexture(name, bg, fg, ac);
      const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
      const mesh = new THREE.InstancedMesh(geo, [back, back, back, back, face, face], list.length);
      list.forEach(({ p, side }, j) => {
        m4.makeRotationY(p.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI);
        m4.setPosition(p.x, p.y, p.z);
        mesh.setMatrixAt(j, m4);
        legs.setMatrixAt(li++, m4);
      });
      mesh.castShadow = this.q.shadows > 0;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    });
    legs.count = li;
    legs.castShadow = this.q.shadows > 0;
    if (li) this.group.add(legs);
  }

  // ploughed snow ridges along the outer edge of the runoff
  _snowBanks() {
    const t = this.track;
    const st = groundTextures('snow', 31);
    const mat = new THREE.MeshStandardMaterial({ map: st.map, normalMap: st.normalMap, roughness: 0.75, color: 0xf4f8ff });
    for (const side of [-1, 1]) {
      const segs = [];
      const prof = [[-0.6, 0], [-0.2, 0.42], [0.25, 0.62], [0.8, 0.4], [1.4, 0]];
      for (let k = 0; k < prof.length - 1; k++) {
        const [d0, h0] = prof[k], [d1, h1] = prof[k + 1];
        const nd = -(h1 - h0), nh = d1 - d0;
        segs.push({ a: [side * (t.halfW + 0.9 + d0 * side * side), h0], b: [side * (t.halfW + 0.9 + d1), h1], n: [nd * side, nh], u: [k / 4, (k + 1) / 4] });
      }
      // place the bank right at the barrier side of the shoulder
      const base = side * (t.barrierD - 1.9);
      const segs2 = prof.slice(0, -1).map(([d0, h0], k) => {
        const [d1, h1] = prof[k + 1];
        return { a: [base + side * d0, h0 + Math.sin(k) * 0.02], b: [base + side * d1, h1], n: [-(h1 - h0) * side, (d1 - d0)], u: [k / 4, (k + 1) / 4] };
      });
      void segs;
      const g = t.extrude(segs2, 3);
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true; m.castShadow = true;
      this.group.add(m);
    }
  }

  // elevated walkways / train viaduct spanning the street circuit, neon trim
  _cityOverheads() {
    const t = this.track;
    const concrete = new THREE.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.8, metalness: 0.1 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0a1a2a, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.6 });
    const cols = [0xff2bd6, 0x00e5ff, 0xffd400, 0x7cff00];
    const words = ['MÍTICO', 'NEO', 'KAZE', 'HIKARI', 'TURBO'];
    for (let k = 0; k < 4; k++) {
      const s = t.L * (0.12 + k * 0.23);
      const i = Math.floor(s / t.ds) % t.N;
      if (Math.abs(t.c.kappaSmooth[i]) > 1 / 300) continue;
      const p = t.pointAt(s, 0);
      const half = t.barrierD + 4;
      const g = new THREE.Group();
      const H = 8 + (k % 2) * 4;
      for (const sd of [-1, 1]) {
        const pil = new THREE.Mesh(new THREE.BoxGeometry(1.6, H, 1.6), concrete);
        pil.position.set(sd * half, H / 2, 0); pil.castShadow = true; g.add(pil);
      }
      const deck = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 6, 1.2, 5), concrete);
      deck.position.y = H + 0.6; deck.castShadow = true; g.add(deck);
      const tube = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 6, 2.6, 4.2), glass);
      tube.position.y = H + 2.5; g.add(tube);
      const nm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: cols[k % cols.length], emissiveIntensity: 3 });
      for (const z of [-2.52, 2.52]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 6, 0.12, 0.05), nm);
        strip.position.set(0, H + 0.05, z); g.add(strip);
        const strip2 = strip.clone(); strip2.position.y = H + 1.2; g.add(strip2);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: neonSignTexture(words[k % words.length], ['#ff2bd6', '#00e5ff', '#ffd400', '#7cff00'][k % 4]), toneMapped: false }));
        sign.position.set(0, H - 1.0, z * 1.01);
        if (z < 0) sign.rotation.y = Math.PI;
        g.add(sign);
      }
      this.neon.push({ mat: nm, base: 3, phase: this.r() * 10 });
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.heading;
      this.group.add(g);
    }
  }

  update(dt) {
    this.time += dt;
    for (const n of this.neon) {
      const f = Math.sin(this.time * 13 + n.phase) > 0.96 ? 0.3 : 1;
      n.mat.emissiveIntensity = n.base * f * (0.9 + Math.sin(this.time * 2 + n.phase) * 0.1);
    }
  }
}

void smoothstep;
