// Builds an articulated, animated 3D motorcycle from the catalog.
import * as THREE from 'three';
import { Assembly } from './Assembly.js';
import { DESIGNS } from './designs.js';
import { M } from '../core/materials.js';
import { liveryTexture, numberPlateTexture, makeCanvas, toTexture, licensePlateTexture, flakeNormalTexture } from '../core/textures.js';
import { clamp } from '../core/utils.js';
import { Rider } from './Rider.js';

function liveryMaterials(spec, livery, opts) {
  const matte = !!livery.matte;
  const tex = liveryTexture(livery, spec.short, livery.number || '');
  const flakes = matte ? null : flakeNormalTexture();
  const P = (params) => new THREE.MeshPhysicalMaterial({
    metalness: matte ? 0.2 : 0.5, roughness: matte ? 0.62 : 0.3, clearcoat: matte ? 0 : 1, clearcoatRoughness: 0.03,
    normalMap: flakes, normalScale: new THREE.Vector2(0.35, 0.35), ...params,
  });
  const mats = {
    paint: P({ map: tex }),
    paintPlain: P({ map: liveryTexture(livery, '', '') }),
    paintSolid: P({ color: livery.base }),
    paint2Solid: P({ color: livery.second }),
    accentSolid: P({ color: livery.accent }),
    frame: new THREE.MeshStandardMaterial({ color: livery.frame, metalness: 0.6, roughness: 0.35 }),
    wheel: new THREE.MeshStandardMaterial({ color: livery.wheel, metalness: 0.65, roughness: 0.32 }),
    seat: M.leather(livery.seat ?? 0x1c1c1e),
    glass: M.glass(0x1a2a3a, 0.42),
    head: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff4e0, emissiveIntensity: 4, roughness: 0.2 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1010, emissiveIntensity: 1.6, roughness: 0.3 }),
    neon: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: livery.accent, emissiveIntensity: 3.2, roughness: 0.3 }),
    plate: new THREE.MeshStandardMaterial({ map: numberPlateTexture(livery.number || '1', livery.plate || '#ffffff', '#111111'), roughness: 0.5, side: THREE.DoubleSide }),
    plateSolid: new THREE.MeshStandardMaterial({ color: livery.plate || '#ffffff', roughness: 0.45 }),
    license: new THREE.MeshStandardMaterial({ map: licensePlateTexture(`${spec.short.slice(0, 3)} ${String(100 + spec.id.length * 37 + (opts.seed || 0)).padStart(4, '0')}`), roughness: 0.35, metalness: 0.2 }),
  };
  // live dashboard
  const dc = makeCanvas(256, 128);
  mats.dashCanvas = dc;
  mats.dashTex = toTexture(dc.c, { wrap: false, aniso: false });
  mats.dash = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: mats.dashTex, emissiveIntensity: 1.4, roughness: 0.2 });
  drawDash(mats.dashCanvas, 0, 0, 1, spec, 1);
  mats.dashTex.needsUpdate = true;
  return mats;
}

export function drawDash(dc, kmh, rpmFrac, gear, spec, nitro) {
  const { g, c } = dc;
  g.fillStyle = '#020306'; g.fillRect(0, 0, c.width, c.height);
  // rpm bar
  const segs = 24;
  for (let i = 0; i < segs; i++) {
    const on = i / segs < rpmFrac;
    const hot = i / segs > 0.82;
    g.fillStyle = on ? (hot ? '#ff2a2a' : i / segs > 0.6 ? '#ffd000' : '#22e6ff') : '#0b1a22';
    g.fillRect(10 + i * 9.8, 12, 7.5, 22);
  }
  g.fillStyle = '#e8f6ff';
  g.font = '700 54px Orbitron, Arial, sans-serif';
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText(String(Math.round(kmh)).padStart(3, ' '), 14, 104);
  g.font = '700 16px Orbitron, Arial, sans-serif';
  g.fillStyle = '#7fb8d0'; g.fillText('KM/H', 136, 104);
  g.font = '900 64px Orbitron, Arial, sans-serif';
  g.fillStyle = '#22e6ff'; g.textAlign = 'right';
  g.fillText(spec.engine.electric ? 'D' : (gear <= 0 ? 'N' : String(gear)), 246, 108);
  g.fillStyle = '#ff7a00';
  g.fillRect(14, 112, 120 * clamp(nitro, 0, 1), 6);
}

export class BikeModel {
  constructor(spec, liveryIndex = 0, opts = {}) {
    this.spec = spec;
    this.liveryIndex = liveryIndex % spec.liveries.length;
    this.livery = spec.liveries[this.liveryIndex];
    const A = new Assembly();
    const mats = liveryMaterials(spec, this.livery, opts);
    const ctx = { A, m: spec.model, mats, spec };
    DESIGNS[spec.design](ctx);
    this.meshes = A.finalize({ castShadow: opts.castShadow !== false });
    this.ctx = ctx;
    this.mats = mats;
    this.groups = A.groups;
    this.wb = spec.model.wb;

    // hierarchy for world placement / animation
    this.root = new THREE.Group();
    this.lean = new THREE.Group();
    this.pitch = new THREE.Group();
    this.offset = new THREE.Group();
    this.model = new THREE.Group();
    this.root.add(this.lean);
    this.lean.add(this.pitch);
    this.pitch.add(this.offset);
    this.offset.add(this.model);
    this.model.add(A.inner);
    this.model.rotation.y = -Math.PI / 2;
    this.pitch.position.z = -this.wb / 2;
    this.offset.position.z = this.wb / 2;
    this.groups.steer.rotation.order = 'ZYX';
    this.steerRest = this.groups.steer.rotation.z;
    this.sliderRest = this.groups.forkSlider.position.clone();
    this.wheelSpinF = 0; this.wheelSpinR = 0;
    this.root.userData.bike = this;
    this.exhausts = ctx.exhausts;
    this.headlights = ctx.headlights.filter((h) => !h.none);
    this.tailMat = mats.tail;
    this.headMat = mats.head;
    this.neonMat = mats.neon;

    // bounds (bike space, machine only)
    const box = new THREE.Box3().setFromObject(A.inner);
    if (opts.rider) {
      this.rider = new Rider(spec, this.livery, ctx, this.groups, { castShadow: opts.castShadow !== false, number: this.livery.number });
      this.model.add(this.rider.root);
    }
    this.bounds = box;
    this.height = box.max.y;
    this.length = box.max.x - box.min.x;
    this._v = new THREE.Vector3();
  }

  // Per-frame animation from physics state.
  animate(s, dt) {
    const fR = this.spec.model.front.R, rR = this.spec.model.rear.R;
    const dist = (s.speed || 0) * dt;
    this.wheelSpinF -= dist / fR;
    this.wheelSpinR -= (dist + (s.wheelSpinExtra || 0) * dt) / rR;
    this.groups.frontWheel.rotation.z = this.wheelSpinF;
    this.groups.rearWheel.rotation.z = this.wheelSpinR;
    this.groups.steer.rotation.y = -(s.steerAngle || 0);
    // suspension: chassis drops, wheels stay planted
    const cf = clamp(s.compF || 0, -0.04, 0.09), cr = clamp(s.compR || 0, -0.04, 0.08);
    this.groups.forkSlider.position.y = this.sliderRest.y + cf;
    const swLen = Math.hypot(this.ctx.rear.x - this.ctx.pivot[0], this.ctx.rear.y - this.ctx.pivot[1]);
    this.groups.swingarm.rotation.z = -cr / swLen;
    this.offset.position.y = -(cf + cr) * 0.5;
    this.lean.rotation.z = s.lean || 0;
    // wheelie (front up, pivot at rear contact) / stoppie (pivot at front)
    const p = s.pitch || 0;
    if (p >= 0) {
      this.pitch.position.z = -this.wb / 2; this.offset.position.z = this.wb / 2;
      this.pitch.rotation.x = -p;
    } else {
      this.pitch.position.z = this.wb / 2; this.offset.position.z = -this.wb / 2;
      this.pitch.rotation.x = -p;
    }
    // brake light
    this.tailMat.emissiveIntensity = s.braking ? 7 : 1.6;
    if (this.rider) this.rider.update(s, dt);
  }

  setVisible(v) { this.root.visible = v; }

  // Translucent holographic look (time-trial ghost)
  setGhost(color = 0x40e0ff) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 0.9, transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.5 });
    this.root.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.receiveShadow = false; } });
    this.ghostMat = mat;
  }

  worldPoint(local, target = new THREE.Vector3()) {
    // local in bike space -> world
    target.set(local[0], local[1], local[2] ?? 0);
    return this.ctx.A.inner.localToWorld(target);
  }

  dispose() {
    this.rider?.dispose(); // shared rider geometry stays alive for the next race
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const k of ['paint', 'paintPlain', 'paintSolid', 'paint2Solid', 'accentSolid', 'frame', 'wheel', 'head', 'tail', 'neon', 'plate', 'plateSolid', 'dash']) this.mats[k]?.dispose?.();
    this.mats.dashTex?.dispose();
    this.root.removeFromParent();
  }
}
