// Particles (smoke, dust, spray, sparks, flames), skid marks and nitro flames.
import * as THREE from 'three';
import { smokeTexture, softCircleTexture, flameTexture } from '../core/textures.js';
import { clamp } from '../core/utils.js';

class ParticlePool {
  constructor(max, { additive = false, tex }) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: tex }, uScale: { value: 600 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 } },
      vertexShader: `attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC; varying float vFog;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; vFog = -mv.z; }`,
      fragmentShader: `uniform sampler2D tex; uniform vec3 fogColor; uniform float fogDensity; varying vec4 vC; varying float vFog;
        void main(){ vec4 t = texture2D(tex, gl_PointCoord); float f = 1.0 - exp(-fogDensity*fogDensity*vFog*vFog);
          vec3 c = mix(vC.rgb, fogColor, ${additive ? '0.0' : 'f'}); gl_FragColor = vec4(c, t.a * vC.a * ${additive ? '(1.0 - f)' : '1.0'}); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
  }

  emit(x, y, z, vx, vy, vz, { life = 1, size = 1, grow = 1, r = 1, g = 1, b = 1, a = 1, drag = 1, grav = 0 } = {}) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.alpha0[i] = a;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grow[i] = grow; this.drag[i] = drag; this.grav[i] = grav;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.col[i * 4 + 3] = this.alpha0[i] * Math.min(1, t * 1.5) * Math.min(1, (1 - t) * 8 + 0.2);
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, quality, theme) {
    this.scene = scene;
    this.q = quality;
    const k = quality.density;
    this.smoke = new ParticlePool(Math.round(1600 * k + 400), { tex: smokeTexture() });
    this.glow = new ParticlePool(Math.round(1200 * k + 300), { additive: true, tex: softCircleTexture() });
    scene.add(this.smoke.points, this.glow.points);
    this.theme = theme;
    this._buildSkids();
    this.flames = new Map();
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

  _buildSkids() {
    const MAX = 2400;
    this.skMax = MAX;
    this.skPos = new Float32Array(MAX * 4 * 3);
    const idx = new Uint32Array(MAX * 6);
    for (let i = 0; i < MAX; i++) {
      const a = i * 4;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
    const g = new THREE.BufferGeometry();
    this.skAttr = new THREE.BufferAttribute(this.skPos, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.skAttr);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.skMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    this.skMesh.frustumCulled = false;
    this.skMesh.renderOrder = 2;
    this.scene.add(this.skMesh);
    this.skNext = 0;
    this.skLast = new Map();
  }

  // add skid segment for a bike wheel (key) at world point p with lateral dir r
  skid(key, x, y, z, rx, rz, w = 0.09) {
    const last = this.skLast.get(key);
    const cur = { x, y: y + 0.015, z, rx, rz };
    if (last && (x - last.x) ** 2 + (z - last.z) ** 2 < 25) {
      const i = this.skNext; this.skNext = (this.skNext + 1) % this.skMax;
      const P = this.skPos, o = i * 12;
      P[o] = last.x - last.rx * w; P[o + 1] = last.y; P[o + 2] = last.z - last.rz * w;
      P[o + 3] = last.x + last.rx * w; P[o + 4] = last.y; P[o + 5] = last.z + last.rz * w;
      P[o + 6] = x - rx * w; P[o + 7] = cur.y; P[o + 8] = z - rz * w;
      P[o + 9] = x + rx * w; P[o + 10] = cur.y; P[o + 11] = z + rz * w;
      this.skDirty = true;
    }
    this.skLast.set(key, cur);
  }
  skidBreak(key) { this.skLast.delete(key); }

  sparks(x, y, z, n = 10, dirx = 0, dirz = 0, speed = 8) {
    for (let i = 0; i < n; i++) {
      const vx = dirx * speed * 0.6 + (Math.random() - 0.5) * speed;
      const vz = dirz * speed * 0.6 + (Math.random() - 0.5) * speed;
      const vy = Math.random() * speed * 0.6;
      this.glow.emit(x, y, z, vx, vy, vz, { life: 0.25 + Math.random() * 0.35, size: 0.06 + Math.random() * 0.06, grow: -0.05, r: 1, g: 0.65 + Math.random() * 0.3, b: 0.25, a: 1, drag: 1.5, grav: 9 });
    }
  }

  tireSmoke(x, y, z, vx, vz, amount = 1) {
    const c = 0.82 + Math.random() * 0.1;
    this.smoke.emit(x + (Math.random() - 0.5) * 0.2, y + 0.15, z + (Math.random() - 0.5) * 0.2, vx * 0.3 + (Math.random() - 0.5), 0.6 + Math.random(), vz * 0.3 + (Math.random() - 0.5),
      { life: 1.6 + Math.random(), size: 0.6, grow: 2.2, r: c, g: c, b: c, a: 0.35 * amount, drag: 1.2, grav: -0.3 });
  }

  dust(x, y, z, vx, vz, col, amount = 1) {
    this.smoke.emit(x + (Math.random() - 0.5) * 0.3, y + 0.1, z + (Math.random() - 0.5) * 0.3, vx * 0.2 + (Math.random() - 0.5) * 2, 0.5 + Math.random() * 1.5, vz * 0.2 + (Math.random() - 0.5) * 2,
      { life: 1.2 + Math.random(), size: 0.5, grow: 2.5, r: col[0], g: col[1], b: col[2], a: 0.45 * amount, drag: 1.6, grav: 0.4 });
  }

  spray(x, y, z, vx, vz, amount = 1) {
    this.smoke.emit(x + (Math.random() - 0.5) * 0.3, y + 0.15, z + (Math.random() - 0.5) * 0.3, vx * 0.5 + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.2, vz * 0.5 + (Math.random() - 0.5) * 2,
      { life: 0.6 + Math.random() * 0.4, size: 0.4, grow: 2.8, r: 0.75, g: 0.78, b: 0.82, a: 0.28 * amount, drag: 2, grav: 2 });
  }

  exhaustPuff(x, y, z, vx, vy, vz, hot = false) {
    if (hot) this.glow.emit(x, y, z, vx, vy, vz, { life: 0.12, size: 0.25, grow: 1.5, r: 1, g: 0.5, b: 0.15, a: 0.9, drag: 4 });
    else this.smoke.emit(x, y, z, vx, vy + 0.3, vz, { life: 0.6, size: 0.12, grow: 0.7, r: 0.6, g: 0.6, b: 0.62, a: 0.12, drag: 2, grav: -0.2 });
  }

  explosionDust(x, y, z, col) {
    for (let i = 0; i < 24; i++) this.dust(x, y, z, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, col, 1.2);
    this.sparks(x, y + 0.3, z, 30, 0, 0, 10);
  }

  // Nitro / backfire flame cones attached to bike exhausts
  attachFlames(bike) {
    const ex = bike.model.exhausts;
    if (!ex || !ex.length) return;
    const tex = flameTexture();
    const list = [];
    for (const e of ex) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const geo = new THREE.ConeGeometry(Math.max(0.035, e.r * 0.85), 0.7, 12, 1, true);
      geo.translate(0, 0.35, 0); // base at the outlet, tip 0.7 m out
      const m = new THREE.Mesh(geo, mat);
      const d = new THREE.Vector3(...e.dir).normalize();
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      m.position.set(...e.pos);
      m.visible = false;
      bike.model.groups.chassis.add(m);
      list.push({ m, mat, e });
    }
    this.flames.set(bike, list);
  }

  updateFlames(bike, nitro, pop, dt) {
    const list = this.flames.get(bike);
    if (!list) return;
    for (const f of list) {
      const on = nitro || pop > 0;
      f.m.visible = on;
      if (!on) continue;
      const len = nitro ? 0.8 + Math.random() * 0.5 : 0.35 + Math.random() * 0.3;
      f.m.scale.set(nitro ? 1.2 : 1, len, nitro ? 1.2 : 1);
      f.mat.opacity = nitro ? 0.95 : 0.8;
      f.mat.color.setRGB(nitro ? 0.6 : 1, nitro ? 0.8 : 0.7, 1);
    }
  }

  removeBike(bike) {
    const list = this.flames.get(bike);
    if (list) for (const f of list) f.m.removeFromParent();
    this.flames.delete(bike);
  }

  update(dt, camera, renderer, fog) {
    this.smoke.update(dt); this.glow.update(dt);
    const h = renderer.domElement.height;
    const scale = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.smoke.mat.uniforms.uScale.value = scale;
    this.glow.mat.uniforms.uScale.value = scale;
    if (fog) {
      for (const m of [this.smoke.mat, this.glow.mat]) { m.uniforms.fogColor.value.copy(fog.color); m.uniforms.fogDensity.value = fog.density || 0; }
    }
    if (this.skDirty) { this.skAttr.needsUpdate = true; this.skDirty = false; }
  }

  dispose() {
    for (const o of [this.smoke.points, this.glow.points, this.skMesh]) { o.geometry.dispose(); o.material.dispose(); o.removeFromParent(); }
  }
}
