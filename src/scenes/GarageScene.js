// 3D showroom: turntable, studio lights, reflective floor. Used by the main
// menu, garage (bike select) and the podium/results ceremony.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { BikeModel } from '../bikes/BikeModel.js';
import { polishedConcreteTexture, softCircleTexture } from '../core/textures.js';
import { Save } from '../core/Settings.js';
import { damp, clamp, rng } from '../core/utils.js';

const STAND = { speed: 0, stand: true };

export class GarageScene {
  constructor(engine) {
    this.engine = engine;
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.userData.ao = true; // showroom gets screen-space ambient occlusion
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
    RectAreaLightUniformsLib.init();
    // studio reflections: dark room lit only by the softboxes, baked to PMREM
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x0c0d10);
    const bright = (w, h, v, pos, rot) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v * 1.02), side: THREE.DoubleSide }));
      m.position.set(...pos); m.rotation.set(...rot); envScene.add(m);
    };
    bright(4, 1.6, 9, [0, 4.4, 0], [Math.PI / 2, 0, 0]);
    bright(0.7, 4, 6, [-3.6, 2, 1.2], [0, Math.PI / 2, 0]);
    bright(0.7, 4, 6, [3.6, 2, -1.2], [0, -Math.PI / 2, 0]);
    bright(6, 0.25, 4, [0, 1.2, -5], [0, 0, 0]);
    bright(0.25, 6, 2.5, [0, 3, 5], [0, Math.PI, 0]);
    const floorEnv = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x2a2b2e }));
    floorEnv.rotation.x = -Math.PI / 2; envScene.add(floorEnv);
    const pm = new THREE.PMREMGenerator(this.engine.renderer);
    this.envTex = pm.fromScene(envScene, 0.02).texture;
    s.environment = this.envTex;
    s.environmentIntensity = 0.9;
    pm.dispose();
    s.background = new THREE.Color(0x101114);

    // cyclorama: seamless cove from floor into a round backdrop wall
    const R0 = 8, cove = 2.6, R1 = R0 + cove, Hw = 9;
    const prof = [];
    for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * (Math.PI / 2); prof.push(new THREE.Vector2(R0 + Math.cos(a) * cove, cove + Math.sin(a) * cove)); }
    prof.push(new THREE.Vector2(R1, Hw), new THREE.Vector2(0.01, Hw + 0.5));
    const cycGeo = new THREE.LatheGeometry(prof, 96);
    const cc = new Float32Array(cycGeo.attributes.position.count * 3);
    for (let i = 0; i < cycGeo.attributes.position.count; i++) {
      const y = cycGeo.attributes.position.getY(i);
      const v = 0.85 - Math.min(1, y / Hw) * 0.55;
      cc[i * 3] = v; cc[i * 3 + 1] = v; cc[i * 3 + 2] = v * 1.03;
    }
    cycGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    // bounce light on the backdrop: brightest in the cove, falling off toward the ceiling
    const gc = document.createElement('canvas'); gc.width = 4; gc.height = 256;
    const gg = gc.getContext('2d');
    const grd = gg.createLinearGradient(0, 256, 0, 0);
    grd.addColorStop(0, '#2c2e33'); grd.addColorStop(0.45, '#3a3d43'); grd.addColorStop(0.75, '#1d1f23'); grd.addColorStop(1, '#08090b');
    gg.fillStyle = grd; gg.fillRect(0, 0, 4, 256);
    const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
    const cyc = new THREE.Mesh(cycGeo, new THREE.MeshStandardMaterial({ color: 0x5a5d64, vertexColors: true, roughness: 0.92, side: THREE.BackSide, emissive: 0xffffff, emissiveMap: gt, emissiveIntensity: 0.6, fog: false }));
    cyc.receiveShadow = true;
    s.add(cyc);
    // accent LED line along the foot of the cove
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00d8ff, emissiveIntensity: 1.6 });
    this.ledMat = ledMat;
    const led = new THREE.Mesh(new THREE.TorusGeometry(R0 + 0.15, 0.015, 6, 160), ledMat);
    led.rotation.x = Math.PI / 2; led.position.y = 0.02;
    s.add(led);

    // polished concrete floor (over a planar mirror on high settings)
    if (q.post && q.shadows >= 2048) {
      const mirror = new Reflector(new THREE.CircleGeometry(R0 + 0.3, 64), {
        textureWidth: 1024, textureHeight: 1024, color: 0x8a8d94, clipBias: 0.003,
      });
      mirror.rotation.x = -Math.PI / 2;
      mirror.position.y = -0.002;
      s.add(mirror);
      this.mirror = mirror;
    }
    const pc = polishedConcreteTexture(4);
    pc.map.repeat.set(4, 4); pc.roughnessMap.repeat.set(4, 4);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R0 + 0.3, 64), new THREE.MeshStandardMaterial({
      map: pc.map, roughnessMap: pc.roughnessMap, roughness: 1, metalness: 0.05, color: 0xb4b8bf,
      transparent: !!this.mirror, opacity: this.mirror ? 0.9 : 1,
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    // turntable: low brushed-steel disc with a rubber top and a thin light ring
    const tt = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.74, 0.07, 128), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.35 }));
    disc.position.y = 0.035; disc.receiveShadow = true;
    tt.add(disc);
    const top = new THREE.Mesh(new THREE.CircleGeometry(1.66, 96), new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.85 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.0705; top.receiveShadow = true;
    tt.add(top);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00d8ff, emissiveIntensity: 2 });
    this.ringMat = ringMat;
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(1.68, 0.006, 6, 160), ringMat);
    ringMesh.rotation.x = Math.PI / 2; ringMesh.position.y = 0.071;
    tt.add(ringMesh);
    // soft contact shadow under the bike
    const cs = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.1), new THREE.MeshBasicMaterial({ map: softCircleTexture(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    cs.rotation.x = -Math.PI / 2; cs.position.y = 0.073;
    tt.add(cs);
    s.add(tt);
    this.turntable = tt;
    this.bikeHolder = new THREE.Group();
    this.bikeHolder.position.y = 0.071;
    tt.add(this.bikeHolder);

    // softboxes: visible diffuser panels + matching area lights
    const boxMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.25) });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.6, metalness: 0.4 });
    const softbox = (w, h, intensity, pos, look) => {
      const l = new THREE.RectAreaLight(0xfff8f0, intensity, w, h);
      l.position.set(...pos); l.lookAt(...look);
      s.add(l);
      const g = new THREE.Group();
      g.position.copy(l.position); g.quaternion.copy(l.quaternion);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), boxMat);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.25), frameMat);
      fr.position.z = -0.14;
      g.add(panel, fr);
      s.add(g);
      return l;
    };
    this.areaLights = [
      softbox(4, 1.6, 9, [0, 4.4, 0], [0, 0, 0]),
      softbox(0.7, 4, 7, [-3.6, 2, 1.2], [0, 0.8, 0]),
      softbox(0.7, 4, 7, [3.6, 2, -1.2], [0, 0.8, 0]),
    ];
    // stands for the side strip boxes
    for (const x of [-3.6, 3.6]) {
      const z = x < 0 ? 1.2 : -1.2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4, 8), frameMat);
      pole.position.set(x * 1.04, 2, z * 1.04); s.add(pole);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.03, 16), frameMat);
      base.position.set(x * 1.04, 0.015, z * 1.04); s.add(base);
    }
    const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x202022, 0.25);
    s.add(hemi);
    // shadow caster from the overhead box
    const key = new THREE.SpotLight(0xffffff, 26, 20, 0.6, 1, 1.4);
    key.position.set(0.4, 6, 0.6);
    key.target.position.set(0, 0, 0);
    key.castShadow = q.shadows > 0;
    key.shadow.mapSize.set(Math.min(2048, q.shadows || 1024), Math.min(2048, q.shadows || 1024));
    key.shadow.bias = -0.0004;
    key.shadow.radius = 6;
    key.shadow.camera.near = 2; key.shadow.camera.far = 12;
    s.add(key, key.target);
    // cool and warm rim accents from behind
    const rim = new THREE.SpotLight(0x8fd8ff, 30, 30, 0.5, 0.8, 1.6);
    rim.position.set(-4, 3, -5); rim.target.position.set(0, 0.6, 0);
    const rim2 = new THREE.SpotLight(0xffb08a, 20, 30, 0.5, 0.8, 1.6);
    rim2.position.set(4.5, 2.5, -4.5); rim2.target.position.set(0, 0.6, 0);
    s.add(rim, rim.target, rim2, rim2.target);

    // faint dust in the light
    const N = 220;
    const pos = new Float32Array(N * 3);
    const r = rng(5);
    for (let i = 0; i < N; i++) { pos[i * 3] = r.range(-5, 5); pos[i * 3 + 1] = r.range(0.2, 5); pos[i * 3 + 2] = r.range(-5, 5); }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xcfd8e0, size: 0.012, transparent: true, opacity: 0.2, depthWrite: false }));
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
    // the rider stands beside the machine, idling
    const m = new BikeModel(spec, livery, { rider: true });
    m.animate({ speed: 0, steerAngle: 0.18, lean: 0, pitch: 0, stand: true }, 0);
    this.bikeHolder.add(m.root);
    m.root.rotation.y = 0;
    this.bikes.push(m);
    this.bike = m;
    const accent = m.livery.accent === '#111111' || m.livery.accent === '#1a1a1a' ? m.livery.base : m.livery.accent;
    this.ringMat.emissive.set(accent);
    this.ledMat.emissive.set(accent);
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
        const e = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.03, 0.03), edge.clone());
        e.material.emissive.set(col);
        e.position.set(x, hgt - 0.015, 1.31);
        g.add(e);
        const c = document.createElement('canvas'); c.width = 128; c.height = 128;
        const cg = c.getContext('2d');
        cg.fillStyle = '#' + new THREE.Color(col).getHexString(); cg.font = '700 110px "Barlow Condensed", Arial'; cg.textAlign = 'center'; cg.textBaseline = 'middle';
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
      const pal = [0xd6b25e, 0xf3f4f6, 0xc3c8ce, 0xe2231a, 0xf3f4f6].map((c) => new THREE.Color(c));
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
      // riders aboard, celebrating: the winner stands on the pegs and points to the sky
      const m = new BikeModel(e.spec, e.livery || 0, { rider: true });
      m.podium = { steerAngle: 0.25, lean: 0, pitch: i === 0 ? 0.22 : 0, speed: 0, finished: true, place: i + 1, celebrateT: 1 };
      m.podiumPhase = i * 1.7;
      m.animate(m.podium, 0);
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
    // screens with their own layout may set {x, y}: camera shift along its right / up axes
    // (world units) so the bike sits in the gap between their panels
    this.frame = null;
    if (mode === 'menu') { this.dist = 5.4; this.pitch = 0.1; }
    if (mode === 'garage') { this.dist = 4.4; this.pitch = 0.16; this.autoSpin = true; }
    if (mode === 'podium') { this.dist = 6; this.pitch = 0.18; }
  }

  activate() {
    this.active = true;
    this.engine.setScene(this.scene, this.camera);
    this.engine.setBloom(0.28, 0.45, 1.6);
    const fx = this.engine.fx;
    if (fx) { fx.uBlur.value = 0; fx.uVignette.value = 0.38; fx.uTintAmt.value = 0; fx.uFlash.value = 0; fx.uDamage.value = 0; fx.uRain.value = 0; }
    this.engine.renderer.toneMappingExposure = 0.95;
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
      // slow cinematic drift, bike and rider offset to the right of the menu
      yaw = t * 0.12 + 0.6;
      pitch = 0.08 + Math.sin(t * 0.21) * 0.05;
      dist = 6.1 + Math.sin(t * 0.17) * 0.5;
      target.set(0, 0.78, 0);
    }
    const cam = this.camera;
    cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, 0.25 + Math.sin(pitch) * dist + 0.4, Math.cos(yaw) * Math.cos(pitch) * dist);
    cam.lookAt(target);
    // shift the framing so the bike sits clear of the UI panels
    const portrait = this.engine.width < this.engine.height;
    const fr = portrait ? null : this.frame;
    const shift = portrait ? 0 : fr ? fr.x || 0 : (this.mode === 'menu' ? -1.25 : this.mode === 'garage' ? -0.75 : 0);
    const lift = fr ? fr.y || 0 : 0;
    if (shift || lift) {
      cam.updateMatrixWorld();
      const off = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(shift);
      if (lift) off.add(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).multiplyScalar(lift));
      cam.position.add(off);
    }
    cam.aspect = this.engine.width / this.engine.height;
    cam.fov = this.engine.width < this.engine.height ? 48 : 32;
    cam.updateProjectionMatrix();
    // light show
    if (this._flash > 0) { this._flash = Math.max(0, this._flash - dt * 2.5); }
    this.ringMat.emissiveIntensity = 1.8 + Math.sin(t * 2) * 0.3 + this._flash * 5;
    this.ledMat.emissiveIntensity = 1.4 + this._flash * 3;
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
      // the rider poses beside the machine on the title screen; the garage shows the bike alone
      const rd = this.bike.rider;
      if (rd) { rd.root.visible = this.mode === 'menu'; if (rd.root.visible) rd.update(STAND, dt); }
    }
    // podium riders keep celebrating (pumps, the winner's point to the sky, waves)
    if (this.mode === 'podium') for (const m of this.bikes) if (m.podium && m.rider) { m.podium.celebrateT = 1 + ((t + m.podiumPhase) % 6.4); m.rider.update(m.podium, dt); }
  }
}
