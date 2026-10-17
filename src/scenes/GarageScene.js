// 3D showroom: turntable, studio lights, reflective floor. Used by the main
// menu, garage (bike select) and the podium/results ceremony.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { BikeModel } from '../bikes/BikeModel.js';
import { gridFloorTexture } from '../core/textures.js';
import { Save } from '../core/Settings.js';
import { damp, clamp, rng } from '../core/utils.js';

export class GarageScene {
  constructor(engine) {
    this.engine = engine;
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.background = new THREE.Color(0x05060a);
    scene.fog = new THREE.Fog(0x05060a, 14, 40);
    const pm = new THREE.PMREMGenerator(engine.renderer);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envTex;
    scene.environmentIntensity = 0.55;
    pm.dispose();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
    this.time = 0;
    this.mode = 'menu';
    this.yaw = 0.6; this.pitch = 0.12; this.dist = 4.6;
    this.targetYaw = 0.6; this.autoSpin = true;
    this.bikes = [];

    this._buildStage();
    this._bindPointer();
  }

  _buildStage() {
    const s = this.scene;
    const q = Save.quality;
    // floor: mirror + glossy dark overlay
    if (q.post && q.shadows >= 2048) {
      const mirror = new Reflector(new THREE.CircleGeometry(30, 64), {
        textureWidth: 1024, textureHeight: 1024, color: 0x7f8590, clipBias: 0.003,
      });
      mirror.rotation.x = -Math.PI / 2;
      mirror.position.y = -0.002;
      s.add(mirror);
      this.mirror = mirror;
    }
    const ftex = gridFloorTexture();
    ftex.repeat.set(10, 10);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({
      map: ftex, color: 0x9aa0aa, roughness: 0.35, metalness: 0.3, transparent: !!this.mirror, opacity: this.mirror ? 0.82 : 1,
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    // turntable
    const tt = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.75, 0.08, 96), new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.8, roughness: 0.25 }));
    disc.position.y = 0.04; disc.receiveShadow = true; disc.castShadow = false;
    tt.add(disc);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00d8ff, emissiveIntensity: 3 });
    this.ringMat = ringMat;
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(1.74, 0.012, 8, 128), ringMat);
    ringMesh.rotation.x = Math.PI / 2; ringMesh.position.y = 0.075;
    tt.add(ringMesh);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.006, 6, 128), ringMat);
    inner.rotation.x = Math.PI / 2; inner.position.y = 0.081;
    tt.add(inner);
    // light gaps (radial lines)
    for (let i = 0; i < 24; i++) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.004, 0.012), ringMat);
      const a = (i / 24) * Math.PI * 2;
      g.position.set(Math.cos(a) * 1.45, 0.082, Math.sin(a) * 1.45);
      g.rotation.y = -a;
      tt.add(g);
    }
    tt.position.y = 0;
    s.add(tt);
    this.turntable = tt;
    this.bikeHolder = new THREE.Group();
    this.bikeHolder.position.y = 0.08;
    tt.add(this.bikeHolder);

    // backdrop: curved wall with vertical light strips
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.6, metalness: 0.4, side: THREE.BackSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 9, 64, 1, true), wallMat);
    wall.position.y = 4.5;
    s.add(wall);
    const stripMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 2.2 });
    this.stripMat = stripMat;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 6.5, 0.06), stripMat);
      st.position.set(Math.cos(a) * 11.85, 3.6, Math.sin(a) * 11.85);
      s.add(st);
    }
    // ceiling light rings
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1.6 });
    for (const r of [2.6, 3.4]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 96), ceilMat);
      ring.rotation.x = Math.PI / 2; ring.position.y = 6.2;
      s.add(ring);
    }
    // logo floor text ring
    // lights
    const hemi = new THREE.HemisphereLight(0x9ab0ff, 0x101010, 0.35);
    s.add(hemi);
    const key = new THREE.SpotLight(0xffffff, 120, 30, 0.42, 0.6, 1.6);
    key.position.set(3.5, 7, 4);
    key.target.position.set(0, 0.5, 0);
    key.castShadow = q.shadows > 0;
    key.shadow.mapSize.set(Math.min(2048, q.shadows || 1024), Math.min(2048, q.shadows || 1024));
    key.shadow.bias = -0.0004;
    key.shadow.camera.near = 2; key.shadow.camera.far = 20;
    s.add(key, key.target);
    const rim = new THREE.SpotLight(0x40c8ff, 90, 30, 0.5, 0.7, 1.6);
    rim.position.set(-4, 4, -4);
    rim.target.position.set(0, 0.6, 0);
    s.add(rim, rim.target);
    const rim2 = new THREE.SpotLight(0xff3a6a, 60, 30, 0.5, 0.7, 1.6);
    rim2.position.set(4, 3, -5);
    rim2.target.position.set(0, 0.6, 0);
    s.add(rim2, rim2.target);
    this.rimLights = [rim, rim2];

    // floating dust motes
    const N = 300;
    const pos = new Float32Array(N * 3);
    const r = rng(5);
    for (let i = 0; i < N; i++) { pos[i * 3] = r.range(-8, 8); pos[i * 3 + 1] = r.range(0.2, 6); pos[i * 3 + 2] = r.range(-8, 8); }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x88aacc, size: 0.025, transparent: true, opacity: 0.5, depthWrite: false }));
    s.add(this.dust);
  }

  _bindPointer() {
    const el = this.engine.renderer.domElement;
    let dragging = false, lx = 0, ly = 0;
    this._onDown = (e) => { if (!this.active || this.mode === 'menu') return; dragging = true; lx = e.clientX; ly = e.clientY; this.autoSpin = false; };
    this._onMove = (e) => {
      if (!dragging) return;
      this.targetYaw -= (e.clientX - lx) * 0.008;
      this.pitch = clamp(this.pitch + (e.clientY - ly) * 0.004, 0.02, 0.7);
      lx = e.clientX; ly = e.clientY;
    };
    this._onUp = () => { dragging = false; clearTimeout(this._spinT); this._spinT = setTimeout(() => { this.autoSpin = true; }, 3500); };
    this._onWheel = (e) => { if (!this.active || this.mode === 'menu') return; this.dist = clamp(this.dist + Math.sign(e.deltaY) * 0.35, 2.6, 7.5); };
    el.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    el.addEventListener('wheel', this._onWheel, { passive: true });
  }

  setBike(spec, livery = 0) {
    for (const b of this.bikes) b.dispose();
    this.bikes = [];
    const m = new BikeModel(spec, livery);
    m.animate({ speed: 0, steerAngle: 0.18, lean: 0, pitch: 0 }, 0);
    this.bikeHolder.add(m.root);
    m.root.rotation.y = 0;
    this.bikes.push(m);
    this.bike = m;
    this.ringMat.emissive.set(m.livery.accent === '#111111' || m.livery.accent === '#1a1a1a' ? m.livery.base : m.livery.accent);
    this._flash = 1;
    return m;
  }

  // Podium ceremony with the top-3 bikes on stepped blocks + confetti
  setPodium(top3) {
    for (const b of this.bikes) b.dispose();
    this.bikes = [];
    if (!this.podium) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.6, roughness: 0.3 });
      const edge = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffcc33, emissiveIntensity: 2 });
      const steps = [[0, 0.9, 0xffcc33], [-2.3, 0.6, 0xd0d8e0], [2.3, 0.35, 0xe09a5a]];
      steps.forEach(([x, hgt, col], i) => {
        const blk = new THREE.Mesh(new THREE.BoxGeometry(2.1, hgt, 2.6), mat);
        blk.position.set(x, hgt / 2, 0); blk.castShadow = true; blk.receiveShadow = true;
        g.add(blk);
        const e = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.04, 2.62), edge.clone());
        e.material.emissive.set(col);
        e.position.set(x, hgt, 0);
        g.add(e);
        const c = document.createElement('canvas'); c.width = 128; c.height = 128;
        const cg = c.getContext('2d');
        cg.fillStyle = '#' + new THREE.Color(col).getHexString(); cg.font = '900 100px Orbitron, Arial'; cg.textAlign = 'center'; cg.textBaseline = 'middle';
        cg.fillText(String(i + 1), 64, 70);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        const num = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(0.8, hgt * 0.9), Math.min(0.8, hgt * 0.9)), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        num.position.set(x, hgt / 2, 1.31);
        g.add(num);
      });
      this.podium = g;
      this.scene.add(g);
      // confetti
      const N = 600;
      const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      const r = rng(11);
      const pal = [0x00e5ff, 0xff2bd6, 0xffcc33, 0xffffff, 0x3dff8a].map((c) => new THREE.Color(c));
      for (let i = 0; i < N; i++) {
        pos[i * 3] = r.range(-6, 6); pos[i * 3 + 1] = r.range(0, 9); pos[i * 3 + 2] = r.range(-4, 4);
        const c = pal[i % pal.length]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.confetti = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
      this.scene.add(this.confetti);
    }
    this.podium.visible = true;
    this.confetti.visible = true;
    this.turntable.visible = false;
    const xs = [0, -2.3, 2.3], hs = [0.9, 0.6, 0.35];
    top3.forEach((e, i) => {
      if (!e) return;
      const m = new BikeModel(e.spec, e.livery || 0);
      m.animate({ speed: 0, steerAngle: 0.25, lean: 0, pitch: i === 0 ? 0.22 : 0 }, 0);
      m.root.position.set(xs[i], hs[i], 0);
      m.root.rotation.y = Math.PI / 2 + (i === 0 ? 0 : i === 1 ? 0.35 : -0.35);
      m.root.scale.setScalar(0.85);
      this.scene.add(m.root);
      this.bikes.push(m);
    });
    this.bike = null;
  }

  clearPodium() {
    if (this.podium) { this.podium.visible = false; this.confetti.visible = false; }
    this.turntable.visible = true;
  }

  setMode(mode) {
    if (mode !== 'podium') this.clearPodium();
    this.mode = mode;
    if (mode === 'menu') { this.dist = 5.4; this.pitch = 0.1; }
    if (mode === 'garage') { this.dist = 4.4; this.pitch = 0.16; this.autoSpin = true; }
    if (mode === 'podium') { this.dist = 6; this.pitch = 0.18; }
  }

  activate() {
    this.active = true;
    this.engine.setScene(this.scene, this.camera);
    this.engine.setBloom(0.5, 0.55, 0.82);
    const fx = this.engine.fx;
    if (fx) { fx.uBlur.value = 0; fx.uVignette.value = 0.38; fx.uTintAmt.value = 0; fx.uFlash.value = 0; fx.uDamage.value = 0; }
  }

  deactivate() { this.active = false; }

  update(dt) {
    this.time += dt;
    const t = this.time;
    if (this.autoSpin) this.targetYaw += dt * (this.mode === 'menu' ? 0.18 : 0.28);
    this.yaw = damp(this.yaw, this.targetYaw, 4, dt);
    let target = new THREE.Vector3(0, 0.62, 0);
    let yaw = this.yaw, pitch = this.pitch, dist = this.dist;
    if (this.mode === 'menu') {
      // slow cinematic drift, bike offset to the right of the menu
      yaw = t * 0.12 + 0.6;
      pitch = 0.08 + Math.sin(t * 0.21) * 0.05;
      dist = 5.2 + Math.sin(t * 0.17) * 0.5;
      target.set(0, 0.55, 0);
    }
    const cam = this.camera;
    cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, 0.25 + Math.sin(pitch) * dist + 0.4, Math.cos(yaw) * Math.cos(pitch) * dist);
    cam.lookAt(target);
    // shift the framing so the bike sits clear of the UI panels
    const portrait = this.engine.width < this.engine.height;
    const shift = portrait ? 0 : (this.mode === 'menu' ? -1.25 : this.mode === 'garage' ? -0.75 : 0);
    if (shift) {
      cam.updateMatrixWorld();
      const off = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(shift);
      cam.position.add(off);
    }
    cam.aspect = this.engine.width / this.engine.height;
    cam.fov = this.engine.width < this.engine.height ? 48 : 32;
    cam.updateProjectionMatrix();
    // light show
    this.rimLights[0].intensity = 80 + Math.sin(t * 1.3) * 20;
    this.rimLights[1].intensity = 50 + Math.cos(t * 0.9) * 15;
    if (this._flash > 0) { this._flash = Math.max(0, this._flash - dt * 2.5); }
    this.ringMat.emissiveIntensity = 2.5 + Math.sin(t * 3) * 0.6 + this._flash * 6;
    this.stripMat.emissiveIntensity = 1.8 + this._flash * 2;
    this.dust.rotation.y = t * 0.02;
    if (this.confetti && this.confetti.visible) {
      const p = this.confetti.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * (0.8 + (i % 7) * 0.12);
        if (y < 0) y += 9;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(t * 2 + i) * dt * 0.3);
      }
      p.needsUpdate = true;
    }
    if (this.mode === 'podium') {
      const cam = this.camera;
      const a = t * 0.15;
      cam.position.set(Math.sin(a) * 7.5, 2.6 + Math.sin(t * 0.3) * 0.4, 6.5 + Math.cos(a) * 1.5);
      cam.lookAt(0, 1.2, 0);
      cam.updateProjectionMatrix();
    }
    if (this.bike) {
      // idle engine shiver
      this.bike.root.position.y = Math.sin(t * 40) * 0.0008;
    }
  }
}
