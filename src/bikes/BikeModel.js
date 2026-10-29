// Builds an articulated, animated 3D motorcycle from the catalog.
import * as THREE from 'three';
import { Assembly } from './Assembly.js';
import { DESIGNS } from './designs.js';
import { M, tinted } from '../core/materials.js';
import { liveryTexture, numberPlateTexture, makeCanvas, toTexture, licensePlateTexture, flakeNormalTexture } from '../core/textures.js';
import { clamp } from '../core/utils.js';
import { orangePeel, rep1 } from '../core/pbr.js';
import { Rider } from './Rider.js';

// Paint finish from the livery: explicit `finish`, else matte / pearl (near-white) /
// solid (saturated racing colours) / metallic (darks, greys, silvers).
export function paintFinish(livery) {
  if (livery.finish) return livery.finish;
  if (livery.matte) return 'matte';
  const c = new THREE.Color(livery.base);
  const hsl = {}; c.getHSL(hsl);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (l > 0.6 && hsl.s < 0.2) return 'pearl';
  if (hsl.s > 0.55 && hsl.l > 0.18) return 'solid';
  return 'metallic';
}
// multi-layer paint: base coat (flakes for metallics) under a deep clear coat with a hint
// of orange peel; detail maps are metric (uv1)
const FINISH = {
  metallic: { metalness: 0.6, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.035, flake: 0.3 },
  solid: { metalness: 0.0, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.03, flake: 0.0 },
  pearl: { metalness: 0.2, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.03, flake: 0.12, iridescence: 0.35 },
  candy: { metalness: 0.75, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02, flake: 0.35 },
  matte: { metalness: 0.25, roughness: 0.6, clearcoat: 0, clearcoatRoughness: 0.5, flake: 0.15 },
};
function paintParams(finish) {
  const f = FINISH[finish] || FINISH.metallic;
  const p = {
    metalness: f.metalness, roughness: f.roughness, clearcoat: f.clearcoat, clearcoatRoughness: f.clearcoatRoughness,
    normalMap: f.flake ? rep1(flakeNormalTexture(), 40) : null, normalScale: new THREE.Vector2(f.flake, f.flake),
    clearcoatNormalMap: f.clearcoat ? rep1(orangePeel(), 2.5) : null, clearcoatNormalScale: new THREE.Vector2(0.05, 0.05),
  };
  if (f.iridescence) Object.assign(p, { iridescence: f.iridescence, iridescenceIOR: 1.6, iridescenceThicknessRange: [300, 500] });
  return p;
}

function liveryMaterials(spec, livery, opts) {
  const finish = paintFinish(livery);
  const tex = liveryTexture(livery, spec.short, livery.number || '');
  const P = (params) => new THREE.MeshPhysicalMaterial({ ...paintParams(finish), ...params });
  // solid colours of every bike share one paint material per finish (vertex-colour tints)
  const solid = (color) => tinted(`livpaint:${finish}`, color, () => new THREE.MeshPhysicalMaterial(paintParams(finish)));
  // wheels: painted cast alloy under clear; frames: wet-look powder coat
  const wheelPaint = (color) => tinted('wheelpaint', color, () => new THREE.MeshPhysicalMaterial({ ...paintParams('metallic'), metalness: 0.5, roughness: 0.32, normalScale: new THREE.Vector2(0.12, 0.12) }));
  const framePaint = (color) => tinted('framepaint', color, () => new THREE.MeshPhysicalMaterial({ ...paintParams('metallic'), metalness: 0.55, roughness: 0.34, clearcoat: 0.8 }));
  const mats = {
    paint: P({ map: tex }),
    paintPlain: P({ map: liveryTexture(livery, '', '') }),
    makePaint: (map) => P({ map }),
    paintSolid: solid(livery.base),
    paint2Solid: solid(livery.second),
    accentSolid: solid(livery.accent),
    solid,
    frame: framePaint(livery.frame),
    wheel: wheelPaint(livery.wheel),
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

// radial blur disc: spokes smeared to a soft metallic grey, rim lip, rubber sidewall with the
// lettering smeared into a faint ring; alpha fades out at the hub and the tread
let _blurTex = null;
function blurTex() {
  if (_blurTex) return _blurTex;
  const N = 256, c = document.createElement('canvas'), a = document.createElement('canvas');
  c.width = c.height = a.width = a.height = N;
  const g = c.getContext('2d'), ga = a.getContext('2d');
  const C = N / 2;
  const col = g.createRadialGradient(C, C, 0, C, C, C);
  col.addColorStop(0, '#2c2e32'); col.addColorStop(0.2, '#3a3d42'); col.addColorStop(0.62, '#4a4d52');
  col.addColorStop(0.7, '#6a6d72'); col.addColorStop(0.73, '#121214'); col.addColorStop(0.84, '#1c1c1e');
  col.addColorStop(0.87, '#2e2e30'); col.addColorStop(0.9, '#151516'); col.addColorStop(1, '#0c0c0d');
  g.fillStyle = col; g.fillRect(0, 0, N, N);
  const al = ga.createRadialGradient(C, C, 0, C, C, C);
  al.addColorStop(0, '#000'); al.addColorStop(0.14, '#000'); al.addColorStop(0.24, '#9a9a9a'); al.addColorStop(0.66, '#b4b4b4');
  al.addColorStop(0.72, '#d8d8d8'); al.addColorStop(0.8, '#8a8a8a'); al.addColorStop(0.95, '#6a6a6a'); al.addColorStop(1, '#000');
  ga.fillStyle = al; ga.fillRect(0, 0, N, N);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const alpha = new THREE.CanvasTexture(a);
  _blurTex = { map, alpha };
  return _blurTex;
}

export class BikeModel {
  constructor(spec, liveryIndex = 0, opts = {}) {
    this.spec = spec;
    this.liveryIndex = liveryIndex % spec.liveries.length;
    this.livery = spec.liveries[this.liveryIndex];
    const A = new Assembly();
    const mats = liveryMaterials(spec, this.livery, opts);
    const ctx = { A, m: spec.model, mats, spec, livery: this.livery };
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
    // spin blur: translucent discs over each side of the wheels that fade in with angular
    // speed, smearing spokes and sidewall lettering the way a camera shutter does
    this._blur = [];
    if (opts.wheelBlur !== false) {
      for (const [gname, w] of [['frontWheel', spec.model.front], ['rearWheel', spec.model.rear]]) {
        const mat = new THREE.MeshStandardMaterial({ map: blurTex().map, alphaMap: blurTex().alpha, color: 0xffffff, metalness: 0.5, roughness: 0.45, transparent: true, opacity: 0, depthWrite: false });
        const geo = new THREE.RingGeometry(0.04, w.R - 0.006, 56, 1);
        const meshes = [];
        for (const sd of [-1, 1]) {
          const m = new THREE.Mesh(geo, mat);
          m.position.z = sd * (w.w / 2 + 0.008);
          if (sd < 0) m.rotation.y = Math.PI;
          m.renderOrder = 2; m.visible = false;
          this.groups[gname].add(m);
          meshes.push(m);
        }
        this._blur.push({ mat, meshes, R: w.R });
      }
    }
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
    for (let i = 0; i < this._blur.length; i++) {
      const b = this._blur[i];
      const w = Math.abs(s.speed || 0) / b.R + (i === 1 ? Math.abs(s.wheelSpinExtra || 0) / b.R : 0);
      const k = clamp((w - 10) / 34, 0, 1);
      b.mat.opacity = 0.92 * k;
      b.meshes[0].visible = b.meshes[1].visible = k > 0.01;
    }
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
    // no spin-blur discs on a hologram
    for (const b of this._blur) for (const m of b.meshes) m.removeFromParent();
    this._blur.length = 0;
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
    // shared (cached / tinted) materials stay alive; only this bike's own ones go
    for (const k of ['side', 'paint', 'paintPlain', 'head', 'tail', 'neon', 'plate', 'plateSolid', 'license', 'dash']) this.mats[k]?.dispose?.();
    this.mats.dashTex?.dispose();
    this.root.removeFromParent();
  }
}
