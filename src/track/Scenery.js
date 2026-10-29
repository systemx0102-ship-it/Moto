// Theme scenery: instanced trees/rocks/cacti, buildings, billboards, lamps, grandstands.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, Noise2D, clamp } from '../core/utils.js';
import { facadeTextures, billboardTexture, neonSignTexture, foliageTexture, treeBarkTexture, makeCanvas, toTexture, heightToNormal } from '../core/textures.js';

function colorize(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function prep(geo) {
  let g = geo.index ? geo : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (g.index) g = g.toNonIndexed();
  return g;
}
function merge(list) { return mergeGeometries(list.map(prep), false); }

// --------------------------------------------------------------- tree models
function pineGeo(snowy) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.32, 3, 7);
  trunk.translate(0, 1.5, 0);
  parts.push(colorize(trunk, 0x4a3426));
  const layers = 5;
  for (let i = 0; i < layers; i++) {
    const r = 2.6 - i * 0.42, h = 3.2 - i * 0.25;
    const cone = new THREE.ConeGeometry(r, h, 9, 2);
    const y = 2.2 + i * 1.55 + h / 2;
    cone.translate(0, y, 0);
    // perturb vertices for organic look
    const p = cone.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const yy = p.getY(k);
      const j = Math.sin(k * 12.9898) * 0.18;
      p.setX(k, p.getX(k) * (1 + j)); p.setZ(k, p.getZ(k) * (1 - j * 0.5)); p.setY(k, yy + j * 0.2);
    }
    cone.computeVertexNormals();
    const col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const t = (p.getY(k) - (y - h / 2)) / h;
      const base = new THREE.Color(0x1f3a22).lerp(new THREE.Color(0x2f5a30), t);
      if (snowy && t > 0.35) base.lerp(new THREE.Color(0xf2f6ff), clamp((t - 0.35) * 2.2, 0, 0.85));
      col[k * 3] = base.r; col[k * 3 + 1] = base.g; col[k * 3 + 2] = base.b;
    }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(cone);
  }
  return merge(parts);
}

function broadGeo(seed) {
  const parts = [];
  const r = rng(seed);
  const trunk = new THREE.CylinderGeometry(0.22, 0.38, 3.4, 7);
  trunk.translate(0, 1.7, 0);
  parts.push(colorize(trunk, 0x4d3828));
  const nz = new Noise2D(seed);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.IcosahedronGeometry(1.9 + r() * 0.9, 2);
    const p = b.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const v = new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k));
      const d = 1 + nz.noise(v.x * 0.9 + i * 3, v.y * 0.9 + v.z * 0.7) * 0.22;
      v.multiplyScalar(d);
      p.setXYZ(k, v.x, v.y, v.z);
    }
    b.computeVertexNormals();
    const a = (i / 4) * Math.PI * 2 + r();
    const off = i === 0 ? [0, 5.4, 0] : [Math.cos(a) * 1.5, 4.2 + r() * 1.2, Math.sin(a) * 1.5];
    b.translate(...off);
    const col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const t = clamp((p.getY(k) - 2.5) / 5, 0, 1);
      const c = new THREE.Color(0x24461e).lerp(new THREE.Color(0x4f7a32), t * 0.8 + r() * 0.15);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    b.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(b);
  }
  return merge(parts);
}

function palmGeo() {
  const parts = [];
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(Math.sin(t * 1.2) * 1.4, t * 9, 0)); }
  const trunk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.24, 7, false);
  parts.push(colorize(trunk, 0x7a5a3a));
  const top = pts[pts.length - 1];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const leaf = new THREE.PlaneGeometry(4.2, 0.9, 8, 1);
    const p = leaf.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k) + 2.1; // 0..4.2
      const w = p.getY(k) * (1 - x / 4.6);
      p.setXYZ(k, x, -Math.pow(x / 4.2, 2) * 1.8, w);
    }
    leaf.rotateY(a);
    leaf.translate(top.x, top.y, top.z);
    leaf.computeVertexNormals();
    parts.push(colorize(leaf, i % 2 ? 0x3a6a2a : 0x4a7a30));
  }
  return merge(parts);
}

function cactusGeo() {
  const parts = [];
  const main = new THREE.CapsuleGeometry(0.42, 4.2, 4, 10);
  main.translate(0, 2.5, 0);
  parts.push(main);
  for (const s of [-1, 1]) {
    const pts = [new THREE.Vector3(0, 1.6 + (s > 0 ? 0.4 : 0), 0), new THREE.Vector3(s * 1.0, 1.9, 0), new THREE.Vector3(s * 1.15, 2.8, 0), new THREE.Vector3(s * 1.15, 3.6 + (s > 0 ? 0.3 : 0), 0)];
    const arm = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.3, 8, false);
    parts.push(arm);
    const cap = new THREE.SphereGeometry(0.3, 8, 6); cap.translate(pts[3].x, pts[3].y, 0); parts.push(cap);
  }
  return merge(parts.map((g) => colorize(g, 0x4a7a3a)));
}

function rockGeo(seed) {
  const r = rng(seed);
  const g = new THREE.DodecahedronGeometry(1, 1);
  const p = g.attributes.position;
  const nz = new Noise2D(seed + 5);
  for (let k = 0; k < p.count; k++) {
    const v = new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k));
    v.multiplyScalar(1 + nz.noise(v.x * 1.5, v.z * 1.5 + v.y) * 0.3);
    v.y *= 0.6 + r() * 0.05;
    p.setXYZ(k, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return colorize(g, 0xffffff);
}

// --------------------------------------------------------------- scenery
export class Scenery {
  constructor(track, terrain, quality) {
    this.track = track;
    this.terrain = terrain;
    this.q = quality;
    this.group = new THREE.Group();
    this.group.name = 'scenery';
    this.lamps = [];
    this.r = rng(track.def.id.length * 17 + 3);
  }

  build() {
    const th = this.track.theme;
    const dens = this.q.density;
    const T = th.trees;
    const total = this.useVegetation ? 0 : Math.round(1400 * T.density * dens);
    if (total > 0) {
      if (T.pine) this._scatter(pineGeo(!!T.snowy), Math.round(total * T.pine), { minD: 6, maxD: 420, scale: [0.8, 1.6], tint: 0.12 });
      if (T.broad) this._scatter(broadGeo(3), Math.round(total * T.broad * 0.6), { minD: 7, maxD: 380, scale: [0.8, 1.4], tint: 0.15 });
      if (T.broad) this._scatter(broadGeo(9), Math.round(total * T.broad * 0.4), { minD: 7, maxD: 380, scale: [0.7, 1.3], tint: 0.15 });
      if (T.palm) this._scatter(palmGeo(), Math.round(total * T.palm), { minD: 5, maxD: 260, scale: [0.8, 1.3], tint: 0.1, near: 0.6 });
      if (T.cactus) this._scatter(cactusGeo(), Math.round(total * T.cactus), { minD: 6, maxD: 500, scale: [0.6, 1.4], tint: 0.12 });
    }
    if (th.rocks) {
      const rockCol = th.terrain.rockColor;
      this._scatter(rockGeo(4), Math.round(260 * th.rocks * dens), { minD: 5, maxD: 600, scale: [0.6, 4.5], tint: 0.15, color: rockCol, sink: 0.35 });
      this._scatter(rockGeo(8), Math.round(160 * th.rocks * dens), { minD: 12, maxD: 700, scale: [3, 10], tint: 0.12, color: rockCol, sink: 0.4 });
    }
    if (th.billboards) this._billboards();
    if (th.grandstands) this._grandstands();
    if (th.buildings === 'city') this._city();
    if (th.buildings === 'villas') this._houses('villa');
    if (th.buildings === 'chalets') this._houses('chalet');
    if (th.lamps || this.track.def.time === 'night') this._lampPosts();
    this._marshalPosts();
    return this.group;
  }

  _candidate(minD, maxD, near = 0) {
    const t = this.terrain, r = this.r;
    for (let tries = 0; tries < 40; tries++) {
      let x, z;
      if (r() < 0.65 + near * 0.3) {
        // near the track: pick a track sample and offset sideways
        const p = this.track.pointAt(r() * this.track.L, 0);
        const side = r() < 0.5 ? -1 : 1;
        const off = this.track.barrierD + minD + Math.pow(r(), 1.6) * (maxD - minD);
        x = p.x + -p.tz * side * off; z = p.z + p.tx * side * off;
      } else {
        x = t.cx + (r() - 0.5) * t.size * 0.9; z = t.cz + (r() - 0.5) * t.size * 0.9;
      }
      const d = t.distanceToTrack(x, z);
      if (d < this.track.barrierD + minD) continue;
      if (d > maxD + this.track.barrierD + 200) continue;
      const y = t.heightAt(x, z);
      if (this.track.theme.water && y < this.track.theme.water.level + 0.5) continue;
      return { x, z, y };
    }
    return null;
  }

  _scatter(geo, count, o) {
    if (count <= 0) return;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, color: o.color ?? 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const c = new THREE.Color();
    let n = 0;
    for (let i = 0; i < count; i++) {
      const cand = this._candidate(o.minD, o.maxD, o.near || 0);
      if (!cand) continue;
      const sc = o.scale[0] + this.r() * (o.scale[1] - o.scale[0]);
      q.setFromEuler(new THREE.Euler((this.r() - 0.5) * 0.08, this.r() * Math.PI * 2, (this.r() - 0.5) * 0.08));
      s.set(sc * (0.9 + this.r() * 0.2), sc * (0.85 + this.r() * 0.3), sc * (0.9 + this.r() * 0.2));
      p.set(cand.x, cand.y - (o.sink ? sc * o.sink : 0.1), cand.z);
      m4.compose(p, q, s);
      mesh.setMatrixAt(n, m4);
      const v = 1 - o.tint + this.r() * o.tint * 2;
      c.setRGB(v, v * (0.96 + this.r() * 0.08), v);
      mesh.setColorAt(n, c);
      n++;
    }
    mesh.count = n;
    mesh.castShadow = this.q.shadows > 0;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    return mesh;
  }

  _billboards() {
    const brands = [
      ['NEXOIL', '#0a2a6a', '#ffffff', '#ffcc00'], ['VELOX', '#111111', '#ff3a3a', '#ffffff'], ['KRYO', '#00a0d8', '#ffffff', '#003a5a'],
      ['TURBOMAX', '#c8102e', '#ffffff', '#111111'], ['AURA', '#2a0a4a', '#ff7af0', '#00e5ff'], ['MÍTICO', '#05060a', '#ffffff', '#00d8ff'],
      ['ZENTEK', '#f2f2f2', '#111111', '#ff6a00'], ['RAYO', '#ffd400', '#111111', '#111111'],
    ];
    const t = this.track;
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.7, roughness: 0.4 });
    let k = 0;
    for (let s = 60; s < t.L - 40; s += 140) {
      const p = t.pointAt(s, 0);
      const i = p.i;
      if (Math.abs(t.c.kappaSmooth[i]) > 1 / 300) continue;
      const side = k % 2 ? 1 : -1;
      const [name, bg, fg, ac] = brands[k % brands.length];
      k++;
      const tex = billboardTexture(name, bg, fg, ac);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: this.track.def.time === 'night' || this.track.def.time === 'dusk' ? 0xffffff : 0x000000, emissiveMap: tex, emissiveIntensity: 0.6 });
      const g = new THREE.Group();
      const board = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 0.3), [legMat, legMat, legMat, legMat, mat, mat]);
      board.position.y = 4.2;
      board.castShadow = true;
      g.add(board);
      for (const lx of [-4.5, 4.5]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), legMat);
        leg.position.set(lx, 1.5, 0); g.add(leg);
      }
      const d = side * (t.barrierD + 4.5);
      const q = t.pointAt(s, d);
      g.position.set(q.x, Math.min(q.y, this.terrain.heightAt(q.x, q.z)) + 0, q.z);
      // face the track (board front = +z local)
      g.rotation.y = p.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI;
      this.group.add(g);
    }
  }

  _grandstands() {
    const t = this.track;
    const mat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.7, metalness: 0.2 });
    const seatCols = [0xc8102e, 0x123fb0, 0xf2f2f2, 0xffd400];
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
    for (const [s0, side, len] of [[-180, 1, 160], [60, 1, 120], [-60, -1, 60]]) {
      const p = t.pointAt(s0 + len / 2, side * (t.barrierD + 14));
      const g = new THREE.Group();
      const steps = 10;
      for (let k = 0; k < steps; k++) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, 1.4), k % 2 ? mat : new THREE.MeshStandardMaterial({ color: seatCols[k % 4], roughness: 0.6 }));
        st.position.set(0, 0.3 + k * 0.6, side * k * 1.2);
        st.castShadow = true; st.receiveShadow = true;
        g.add(st);
      }
      const back = new THREE.Mesh(new THREE.BoxGeometry(len, 8, 0.4), mat);
      back.position.set(0, 4, side * (steps * 1.2 + 0.4));
      g.add(back);
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(len, 15), roofMat);
      roof.rotation.x = -Math.PI / 2 - side * 0.12;
      roof.position.set(0, 10, side * 6);
      roof.castShadow = true;
      g.add(roof);
      for (let x = -len / 2; x <= len / 2; x += 20) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 10), mat);
        col.position.set(x, 5, side * (steps * 1.2 + 0.2));
        g.add(col);
      }
      // local x along the track, local +z = track right (steps rise away from the track)
      g.position.set(p.x, p.y - 0.2, p.z);
      g.rotation.y = p.heading - Math.PI / 2;
      this.group.add(g);
    }
    // pit building along the start straight (left side)
    const p = t.pointAt(-40, -(t.barrierD + 12));
    const pit = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(150, 7, 14), new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.5, metalness: 0.2 }));
    body.position.y = 3.5; body.castShadow = true; body.receiveShadow = true;
    pit.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(150.2, 2.2, 14.2), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.05, metalness: 0.9 }));
    glass.position.y = 5.2; pit.add(glass);
    for (let k = 0; k < 12; k++) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6 }));
      door.position.set(-66 + k * 12, 2.3, 7.05);
      pit.add(door);
    }
    pit.position.set(p.x, p.y - 0.1, p.z);
    pit.rotation.y = p.heading - Math.PI / 2;
    this.group.add(pit);
  }

  _lampPosts() {
    const t = this.track;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.7, roughness: 0.4 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffe2b0, emissiveIntensity: 2.5 });
    const spacing = 38;
    const n = Math.floor(t.L / spacing) * 2;
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 9, 8).translate(0, 4.5, 0), poleMat, n);
    const armGeo = new THREE.BoxGeometry(0.12, 0.12, 2.6).translate(0, 9, 1.2);
    const arm = new THREE.InstancedMesh(armGeo, poleMat, n);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.15, 1.0).translate(0, 8.9, 2.4), headMat, n);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let s = 0; s < t.L - 5; s += spacing) {
      for (const side of [-1, 1]) {
        const p = t.pointAt(s + (side > 0 ? spacing / 2 : 0), side * (t.barrierD + 0.9));
        // arm points toward the road: local +z -> toward the track center (-side * right)
        const yaw = p.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        m4.makeRotationY(yaw); m4.setPosition(p.x, p.y, p.z);
        pole.setMatrixAt(k, m4); arm.setMatrixAt(k, m4); head.setMatrixAt(k, m4);
        const hx = p.x + Math.sin(yaw) * 2.4, hz = p.z + Math.cos(yaw) * 2.4;
        this.lamps.push({ x: hx, y: p.y + 8.9, z: hz, intensity: 150 });
        k++;
      }
    }
    pole.count = arm.count = head.count = k;
    pole.castShadow = true;
    this.group.add(pole, arm, head);
  }

  _marshalPosts() {
    const t = this.track;
    if (t.def.theme === 'city') return;
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xff8a00, roughness: 0.6, side: THREE.DoubleSide });
    for (let s = 250; s < t.L - 100; s += 420) {
      const side = (Math.floor(s / 420) % 2) ? 1 : -1;
      const p = t.pointAt(s, side * (t.barrierD + 2.5));
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2.4, 2), mat);
      box.position.y = 1.2; box.castShadow = true; g.add(box);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 2.4), new THREE.MeshStandardMaterial({ color: 0xc8102e }));
      roof.position.y = 2.5; g.add(roof);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2), mat);
      pole.position.set(0.9, 3.4, 0.9); g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), flagMat);
      flag.position.set(1.3, 4.1, 0.9); g.add(flag);
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.heading;
      this.group.add(g);
    }
  }

  _city() {
    const t = this.track, ter = this.terrain, r = this.r;
    const variants = 4;
    const buckets = Array.from({ length: variants }, () => []);
    const placed = [];
    const neonWords = ['MÍTICO', 'NEO', 'KAZE', 'RYU', 'TOKIO', 'ZEN', 'MOTO', 'HIKARI', 'TURBO', 'NOVA'];
    const neonCols = ['#ff2bd6', '#00e5ff', '#ffd400', '#ff3a3a', '#7cff00', '#a07aff'];
    const signs = [];
    const collides = (x, z, hw, hd) => {
      for (const b of placed) if (Math.abs(b.x - x) < b.hw + hw + 1.5 && Math.abs(b.z - z) < b.hd + hd + 1.5) return true;
      return false;
    };
    const dens = this.q.density;
    for (let s = 0; s < t.L; s += 9 / Math.max(0.5, dens)) {
      for (const side of [-1, 1]) {
        if (r() < 0.25) continue;
        const w = 10 + r() * 22, dpt = 10 + r() * 24;
        const h = 12 + Math.pow(r(), 2) * 120;
        const off = t.barrierD + 6 + dpt / 2 + r() * 10;
        const p = t.pointAt(s, side * off);
        const hw = w / 2, hd = dpt / 2;
        // axis aligned for simple overlap tests (city grid is axis aligned)
        const ax = Math.abs(p.tx) > Math.abs(p.tz);
        const bw = ax ? hw : hd, bd = ax ? hd : hw;
        // ensure no corner gets near the track
        let ok = true;
        for (const [cx, cz] of [[-bw, -bd], [bw, -bd], [-bw, bd], [bw, bd], [0, 0]]) {
          if (ter.distanceToTrack(p.x + cx, p.z + cz) < t.barrierD + 4) { ok = false; break; }
        }
        if (!ok || collides(p.x, p.z, bw, bd)) continue;
        placed.push({ x: p.x, z: p.z, hw: bw, hd: bd });
        const v = Math.floor(r() * variants);
        const box = new THREE.BoxGeometry(bw * 2, h, bd * 2);
        // scale uvs so windows keep size: facade texture has 6x12 windows over 256x512
        const uv = box.attributes.uv;
        const nrm = box.attributes.normal;
        for (let i = 0; i < uv.count; i++) {
          const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
          const faceW = ny > 0.5 ? 0 : nx > 0.5 ? bd * 2 : bw * 2;
          uv.setXY(i, uv.getX(i) * (faceW / 21), uv.getY(i) * (ny > 0.5 ? 0 : h / 42));
        }
        box.translate(p.x, h / 2 - 0.5, p.z);
        buckets[v].push(box);
        // neon sign on the face toward the track
        if (r() < 0.35 && h > 18) signs.push({ x: p.x, z: p.z, side, ax, bw, bd, h, word: neonWords[Math.floor(r() * neonWords.length)], col: neonCols[Math.floor(r() * neonCols.length)], tx: p.tx, tz: p.tz });
      }
    }
    const night = t.def.time === 'night';
    for (let v = 0; v < variants; v++) {
      if (!buckets[v].length) continue;
      const geo = mergeGeometries(buckets[v], false);
      const ft = facadeTextures(v + 1, { night, hue: [210, 30, 260, 180][v], glass: v === 2 });
      const mat = new THREE.MeshStandardMaterial({
        map: ft.map, emissiveMap: ft.emissiveMap, emissive: night ? 0xffffff : 0x000000, emissiveIntensity: night ? 0.62 : 0,
        roughnessMap: ft.roughnessMap, roughness: 1, metalness: v === 2 ? 0.55 : 0.05,
      });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false; m.receiveShadow = true;
      this.group.add(m);
    }
    for (const sg of signs) {
      const tex = neonSignTexture(sg.word, sg.col);
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), mat);
      // place on facade facing the track: normal = -side * right
      const nx = sg.tz * sg.side, nz = -sg.tx * sg.side; // right=(-tz,tx); facing track = -side*right = (side*tz, -side*tx)
      const ext = Math.abs(nx) > Math.abs(nz) ? sg.bw : sg.bd;
      plane.position.set(sg.x + nx * (ext + 0.2), Math.min(sg.h - 4, 10 + r() * 20), sg.z + nz * (ext + 0.2));
      plane.lookAt(plane.position.x + nx, plane.position.y, plane.position.z + nz);
      this.group.add(plane);
    }
    // distant skyline ring
    const sky = [];
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2;
      const rad = ter.size * (0.32 + r() * 0.18);
      const w = 20 + r() * 40, h = 40 + Math.pow(r(), 1.5) * 260;
      const b = new THREE.BoxGeometry(w, h, w);
      b.translate(ter.cx + Math.cos(a) * rad, h / 2 - 1, ter.cz + Math.sin(a) * rad);
      const uv = b.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 21), uv.getY(k) * (h / 42));
      sky.push(b);
    }
    const ft = facadeTextures(9, { night, hue: 230 });
    const skyMat = new THREE.MeshStandardMaterial({ map: ft.map, emissiveMap: ft.emissiveMap, emissive: night ? 0xffffff : 0, emissiveIntensity: night ? 0.5 : 0, roughnessMap: ft.roughnessMap, roughness: 1 });
    this.group.add(new THREE.Mesh(mergeGeometries(sky, false), skyMat));
  }

  _houses(kind) {
    const t = this.track, r = this.r;
    const villa = kind === 'villa';
    const walls = [], roofs = [], trims = [];
    const count = Math.round(70 * this.q.density);
    const wallTex = houseWallTexture(kind), roofTex = roofTexture(kind);
    for (let i = 0; i < count; i++) {
      const c = this._candidate(18, 260);
      if (!c) continue;
      const w = 8 + r() * 8, d = 7 + r() * 6, h = villa ? (r() < 0.5 ? 3.2 : 6.2) : 5.4 + r() * 1.2;
      const rot = r() * Math.PI;
      const xf = new THREE.Matrix4().makeRotationY(rot).premultiply(new THREE.Matrix4().makeTranslation(c.x, c.y - 0.3, c.z));
      // walls: uv in metres / 4 so each tile holds one window bay and the floors line up
      const wall = new THREE.BoxGeometry(w, h, d);
      const uv = wall.attributes.uv, nrm = wall.attributes.normal;
      for (let k = 0; k < uv.count; k++) {
        const nx = Math.abs(nrm.getX(k)), ny = Math.abs(nrm.getY(k));
        const fw = ny > 0.5 ? 0 : nx > 0.5 ? d : w;
        uv.setXY(k, uv.getX(k) * fw / 4, ny > 0.5 ? 0 : uv.getY(k) * h / 3.1);
      }
      wall.translate(0, h / 2, 0);
      wall.applyMatrix4(xf);
      walls.push(wall);
      // gable roof with eaves overhang (ridge along the long side), tiles / shingles in uv metres
      const pitch = villa ? 0.36 : 0.62, ov = villa ? 0.45 : 0.9;
      const along = w >= d, L = (along ? w : d) / 2 + ov, S = (along ? d : w) / 2 + ov, rh = S * pitch;
      const roof = gableRoof(L, S, rh, 0.14);
      if (!along) roof.rotateY(Math.PI / 2);
      roof.translate(0, h, 0);
      roof.applyMatrix4(xf);
      roofs.push(roof);
      // chimney + (chalets) wooden balcony across the front
      const ch = new THREE.BoxGeometry(0.6, rh + 1.2, 0.6);
      ch.translate((along ? 1 : 0) * L * 0.4, h + rh * 0.6, (along ? 0 : 1) * L * 0.4);
      ch.applyMatrix4(xf); trims.push(colorize(prep(ch), villa ? 0xe8e2d6 : 0x8a8580));
      if (!villa) {
        const bw = (along ? w : d) * 0.9;
        const deck = new THREE.BoxGeometry(along ? bw : 1.3, 0.12, along ? 1.3 : bw);
        deck.translate(along ? 0 : (d / 2 + 0.6) * 0 + 0, h * 0.55, 0);
        const off = (along ? d : w) / 2 + 0.6;
        deck.translate(along ? 0 : off, 0, along ? off : 0);
        deck.applyMatrix4(xf); trims.push(colorize(prep(deck), 0x6a4528));
        const rail = new THREE.BoxGeometry(along ? bw : 0.08, 1.0, along ? 0.08 : bw);
        rail.translate(along ? 0 : off + 0.6, h * 0.55 + 0.55, along ? off + 0.6 : 0);
        rail.applyMatrix4(xf); trims.push(colorize(prep(rail), 0x5a3a20));
      }
    }
    if (!walls.length) return;
    const wm = new THREE.MeshStandardMaterial({ map: wallTex.map, normalMap: wallTex.normalMap, roughnessMap: wallTex.roughnessMap, roughness: 1 });
    const rm = new THREE.MeshStandardMaterial({ map: roofTex.map, normalMap: roofTex.normalMap, roughness: villa ? 0.8 : 0.85, side: THREE.DoubleSide });
    const a = new THREE.Mesh(mergeGeometries(walls, false), wm);
    const b = new THREE.Mesh(mergeGeometries(roofs, false), rm);
    const tm = new THREE.Mesh(mergeGeometries(trims, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    a.castShadow = b.castShadow = tm.castShadow = true;
    a.receiveShadow = b.receiveShadow = tm.receiveShadow = true;
    this.group.add(a, b, tm);
  }
}

// gable roof: two pitched slabs (thickness th) plus the gable ends, uv in metres
function gableRoof(L, S, rh, th) {
  const g = new THREE.BufferGeometry();
  const P = [], U = [], I = [];
  const quad = (a, b, c, d, ua, ub, uc, ud) => { const o = P.length / 3; P.push(...a, ...b, ...c, ...d); U.push(...ua, ...ub, ...uc, ...ud); I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  const slope = Math.hypot(S, rh);
  for (const sd of [-1, 1]) {
    // top surface of each slab, eave at z = sd*S, ridge at z = 0
    quad([-L, 0, sd * S], [L, 0, sd * S], [L, rh, 0], [-L, rh, 0], [0, 0], [2 * L, 0], [2 * L, slope], [0, slope]);
    // underside (soffit), a little lower
    quad([L, -th, sd * S], [-L, -th, sd * S], [-L, rh - th, 0], [L, rh - th, 0], [0, 0], [2 * L, 0], [2 * L, slope], [0, slope]);
    // fascia board along the eave
    quad([-L, -th, sd * S], [L, -th, sd * S], [L, 0, sd * S], [-L, 0, sd * S], [0, 0], [2 * L, 0], [2 * L, 0.1], [0, 0.1]);
  }
  for (const e of [-1, 1]) {
    // gable triangle (wall infill under the roof), set back by the overhang
    const x = e * (L - 0.5);
    const o = P.length / 3;
    P.push(x, 0, -S + 0.5, x, 0, S - 0.5, x, rh * (1 - 0.5 / S), 0);
    U.push(0, 0, 1, 0, 0.5, 0.5);
    I.push(o, o + 1, o + 2);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

const _houseCache = new Map();
// plaster wall with one window bay per 4 m tile (shutters for villas, timber + window boxes for chalets)
function houseWallTexture(kind) {
  if (_houseCache.has('w' + kind)) return _houseCache.get('w' + kind);
  const villa = kind === 'villa';
  const W = 256, Hh = 200;
  const { c, g } = makeCanvas(W, Hh);
  const rc = makeCanvas(W, Hh);
  const h = new Float32Array(W * Hh);
  const rr = rng(villa ? 3 : 5);
  // base: lime plaster (villas) or larch boards over a stone plinth (chalets)
  g.fillStyle = villa ? '#efe7d6' : '#7a5232'; g.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 1800; i++) { const v = rr(); g.fillStyle = `rgba(${v < 0.5 ? 60 : 255},${v < 0.5 ? 50 : 250},${v < 0.5 ? 40 : 240},${rr() * 0.07})`; g.fillRect(rr() * W, rr() * Hh, 1 + rr() * 6, 1 + rr() * 6); }
  if (!villa) for (let x = 0; x < W; x += 16) { g.fillStyle = `rgba(30,18,8,${0.35 + rr() * 0.2})`; g.fillRect(x, 0, 2, Hh); for (let y = 0; y < Hh; y++) h[y * W + x] = -0.5; }
  // window: frame, glass, glazing bars, sill; shutters for villas
  const wx = W * 0.32, wy = Hh * 0.22, ww = W * 0.36, wh = Hh * 0.5;
  if (villa) { g.fillStyle = '#2f5a3a'; g.fillRect(wx - ww * 0.42, wy, ww * 0.4, wh); g.fillRect(wx + ww * 1.02, wy, ww * 0.4, wh); for (let y = wy; y < wy + wh; y += 6) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(wx - ww * 0.42, y, ww * 0.4, 1.5); g.fillRect(wx + ww * 1.02, y, ww * 0.4, 1.5); } }
  g.fillStyle = villa ? '#f6f4ee' : '#e8e2d2'; g.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
  g.fillStyle = '#20262c'; g.fillRect(wx, wy, ww, wh);
  const grd = g.createLinearGradient(wx, wy, wx + ww, wy + wh); grd.addColorStop(0, 'rgba(160,190,220,0.35)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.05)'); grd.addColorStop(1, 'rgba(120,150,180,0.25)');
  g.fillStyle = grd; g.fillRect(wx, wy, ww, wh);
  g.fillStyle = villa ? '#f6f4ee' : '#e8e2d2'; g.fillRect(wx + ww / 2 - 2, wy, 4, wh); g.fillRect(wx, wy + wh * 0.45, ww, 3);
  g.fillStyle = villa ? '#d8d0c0' : '#a09a90'; g.fillRect(wx - 9, wy + wh + 3, ww + 18, 6);
  if (!villa) { g.fillStyle = '#5a3a1c'; g.fillRect(wx - 6, wy + wh + 9, ww + 12, 10); for (let k = 0; k < 9; k++) { g.fillStyle = ['#d23a3a', '#e85a8a', '#f0c030'][k % 3]; g.beginPath(); g.arc(wx + 4 + k * ww / 8.5, wy + wh + 9, 4, 0, Math.PI * 2); g.fill(); } }
  // plinth
  g.fillStyle = villa ? 'rgba(150,135,110,0.5)' : '#8a8580'; g.fillRect(0, Hh - 14, W, 14);
  // relief: window recess, sill out
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    let v = h[y * W + x];
    if (x > wx && x < wx + ww && y > wy && y < wy + wh) v -= 1.2;
    if (y > wy + wh + 3 && y < wy + wh + 9 && x > wx - 9 && x < wx + ww + 9) v += 0.6;
    h[y * W + x] = v;
  }
  rc.g.fillStyle = 'rgb(225,225,225)'; rc.g.fillRect(0, 0, W, Hh);
  rc.g.fillStyle = 'rgb(20,20,20)'; rc.g.fillRect(wx, wy, ww, wh);
  const tex = { map: toTexture(c), normalMap: toTexture(heightToNormal(h, W, Hh, 2), { srgb: false }), roughnessMap: toTexture(rc.c, { srgb: false }) };
  _houseCache.set('w' + kind, tex);
  return tex;
}

// terracotta pan tiles (villas) or snow-dusted timber shingles (chalets); uv in metres
function roofTexture(kind) {
  if (_houseCache.has('r' + kind)) return _houseCache.get('r' + kind);
  const villa = kind === 'villa';
  const W = 256, Hh = 256;
  const { c, g } = makeCanvas(W, Hh);
  const h = new Float32Array(W * Hh);
  const rr = rng(villa ? 7 : 9);
  const rows = villa ? 8 : 10, colsN = villa ? 10 : 7;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < colsN; x++) {
      const tw = W / colsN, th = Hh / rows;
      const ox = (y % 2) * tw * 0.5;
      const base = villa ? [168 + rr() * 30, 74 + rr() * 22, 44 + rr() * 14] : [96 + rr() * 30, 70 + rr() * 20, 50 + rr() * 12];
      for (let j = 0; j < th; j++) {
        for (let i = 0; i < tw; i++) {
          const px = Math.floor((x * tw + i + ox) % W), py = Math.floor(y * th + j);
          const u = i / tw, v = j / th;
          const curve = villa ? Math.sin(u * Math.PI) : 1 - Math.abs(u - 0.5) * 0.3;
          const shade = 0.72 + 0.28 * curve - v * 0.18;
          const o = (py * W + px) * 4;
          h[py * W + px] = curve * 0.8 + (1 - v) * 0.4;
          g.fillStyle = `rgb(${base[0] * shade | 0},${base[1] * shade | 0},${base[2] * shade | 0})`;
          g.fillRect(px, py, 1, 1);
          void o;
        }
      }
    }
  }
  if (!villa) { g.fillStyle = 'rgba(240,244,250,0.55)'; for (let k = 0; k < 900; k++) g.fillRect(rr() * W, rr() * Hh, 2 + rr() * 6, 1 + rr() * 2); }
  // weathering streaks
  for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(30,30,25,${rr() * 0.12})`; g.fillRect(rr() * W, 0, 1 + rr() * 3, Hh); }
  const tex = { map: toTexture(c, { repeat: [0.5, 0.5] }), normalMap: toTexture(heightToNormal(h, W, Hh, 3), { srgb: false, repeat: [0.5, 0.5] }) };
  _houseCache.set('r' + kind, tex);
  return tex;
}
