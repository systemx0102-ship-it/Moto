// Race cameras: chase (near/far), onboard, front-wheel and TV cameras.
import * as THREE from 'three';
import { clamp, damp, lerp, wrapAngle } from '../core/utils.js';

export const CAM_NAMES = ['PERSECUCIÓN', 'LEJANA', 'A BORDO', 'RUEDA', 'TV'];

export class CameraController {
  constructor(camera, track) {
    this.cam = camera;
    this.track = track;
    this.mode = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.yaw = 0;
    this.shake = 0;
    this.fov = 62;
    this.roll = 0;
    this.initialized = false;
    this._v = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this.tvSpots = [];
    this._buildTV();
  }

  _buildTV() {
    const t = this.track;
    for (let s = 0; s < t.L; s += 170) {
      const side = (Math.floor(s / 170) % 2) ? 1 : -1;
      const p = t.pointAt(s, side * (t.barrierD + 7));
      this.tvSpots.push({ s, x: p.x, y: p.y + 4 + Math.random() * 5, z: p.z });
    }
  }

  next() { this.mode = (this.mode + 1) % 4; this.initialized = false; }
  set(mode) { this.mode = mode; this.initialized = false; }
  addShake(a) { this.shake = Math.min(1.5, this.shake + a); }

  update(dt, bike, opts = {}) {
    const ph = bike.phys;
    const model = bike.model;
    const mode = opts.forceMode ?? this.mode;
    const cam = this.cam;
    const sp = ph.v;
    const yawTarget = ph.vh + clamp(wrapAngle(ph.h - ph.vh), -0.4, 0.4) * 0.5;
    if (!this.initialized) { this.yaw = yawTarget; }
    this.yaw += wrapAngle(yawTarget - this.yaw) * (1 - Math.exp(-(mode === 1 ? 4 : 6) * dt));
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const back = opts.lookBack ? -1 : 1;
    let roll = 0;
    let fovT = 60 + clamp(sp / 90, 0, 1) * 18 + (ph.nitroOn ? 7 : 0);

    if (mode === 0 || mode === 1) {
      const far = mode === 1;
      const dist = (far ? 7.6 : 4.6) + clamp(sp / 80, 0, 1) * (far ? 1.6 : 1.0);
      const hgt = far ? 2.5 : 1.55;
      const tx = ph.x - fx * dist * back, tz = ph.z - fz * dist * back;
      const ty = ph.y + hgt + (ph.airborne ? 0.3 : 0);
      if (!this.initialized) this.pos.set(tx, ty, tz);
      // stiff along the direction of travel (no lag at speed), softer sideways
      const ex = tx - this.pos.x, ez = tz - this.pos.z;
      const along = ex * fx + ez * fz;
      const latx = ex - along * fx, latz = ez - along * fz;
      const kA = 1 - Math.exp(-28 * dt), kL = 1 - Math.exp(-(far ? 4.5 : 6.5) * dt);
      this.pos.x += along * fx * kA + latx * kL;
      this.pos.z += along * fz * kA + latz * kL;
      this.pos.y += (ty - this.pos.y) * (1 - Math.exp(-5 * dt));
      // stay above the surface
      const g = this.track.project(this.pos.x, this.pos.z, ph.hint, this._proj || (this._proj = {}));
      const minY = (Math.abs(g.d) < this.track.barrierD + 3 ? g.y : this.pos.y - 5) + 0.6;
      if (this.pos.y < minY) this.pos.y = minY;
      this.look.set(ph.x + fx * 6 * back, ph.y + 0.95, ph.z + fz * 6 * back);
      roll = ph.lean * 0.2;
      cam.position.copy(this.pos);
    } else if (mode === 2) {
      // onboard: behind the dash, rolling with the bike
      const m = model;
      const ctx = m.ctx;
      const hx = ctx.headTop ? ctx.headTop[0] - 0.42 : 0.1;
      const hy = (m.height || 1.0) + 0.16;
      const p = m.worldPoint([hx, hy, 0], this._v);
      cam.position.copy(p);
      const ahead = m.worldPoint([hx + 10 * back, hy - 0.6, 0], new THREE.Vector3());
      this.look.copy(ahead);
      roll = ph.lean * 0.8;
      fovT += 6;
    } else if (mode === 3) {
      // low front-wheel camera
      const m = model;
      const p = m.worldPoint([m.spec.model.wb / 2 + 0.55, 0.32, 0.0], this._v);
      cam.position.copy(p);
      this.look.copy(m.worldPoint([m.spec.model.wb / 2 + 10, 0.3, 0], new THREE.Vector3()));
      roll = ph.lean * 0.5;
      fovT += 4;
    } else if (mode === 4) {
      // TV: nearest trackside camera, zooming to frame the bike
      let best = this.tvSpots[0], bd = Infinity;
      for (const t of this.tvSpots) {
        let ds = ph.s - t.s;
        if (ds < -this.track.L / 2) ds += this.track.L;
        if (ds > this.track.L / 2) ds -= this.track.L;
        const d = Math.abs(ds + 40);
        if (d < bd) { bd = d; best = t; }
      }
      cam.position.set(best.x, best.y, best.z);
      this.look.set(ph.x, ph.y + 0.6, ph.z);
      const dist = cam.position.distanceTo(this.look);
      fovT = clamp(2 * Math.atan(5 / dist) * 57.3, 8, 55);
      roll = 0;
    }
    this.initialized = true;
    // shake
    if (this.shake > 0) {
      const s = this.shake * 0.12;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    const hiSpeed = clamp((sp - 50) / 40, 0, 1) * (mode < 2 ? 0.012 : 0.006) + (ph.offRoad ? 0.02 * clamp(sp / 20, 0, 1) : 0);
    if (hiSpeed > 0) { cam.position.y += (Math.random() - 0.5) * hiSpeed; }
    this.roll = damp(this.roll, roll, 6, dt);
    cam.up.set(Math.sin(this.roll) * Math.cos(this.yaw) * -1, Math.cos(this.roll), Math.sin(this.roll) * Math.sin(this.yaw));
    cam.lookAt(this.look);
    this.fov = damp(this.fov, fovT, 3, dt);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }
}
