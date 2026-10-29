// Race cameras: chase (near/far), helmet (onboard), front-wheel and TV cameras.
import * as THREE from 'three';
import { clamp, damp, lerp, wrapAngle } from '../core/utils.js';

export const CAM_NAMES = ['PERSECUCIÓN', 'LEJANA', 'CASCO', 'RUEDA', 'TV'];

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
    // spring offsets driven by fovPunch() / kick() / bounce()
    this.fovOff = 0; this.fovVel = 0;
    this.lag = 0; this.lagVel = 0;
    this.bob = 0; this.bobVel = 0;
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

  next() { this.mode = (this.mode + 1) % 4; this.initialized = false; this._dropPov(); }
  set(mode) { this.mode = mode; this.initialized = false; this._dropPov(); }
  // the rider seen through the helmet camera moves its head freely again
  _dropPov() { if (this._pov && this.mode !== 2) { this._pov.pov = false; this._pov = null; } }
  addShake(a) { this.shake = Math.min(1.5, this.shake + a); }
  // FOV surge peaking at ~deg degrees (critically damped spring)
  fovPunch(deg) { this.fovVel = Math.min(this.fovVel + deg * 8 * Math.E, 30 * 8 * Math.E); }
  // chase camera falls back ~m metres and catches up again (boost feel)
  kick(m) { this.lagVel = Math.min(this.lagVel + m * 7 * Math.E, 3 * 7 * Math.E); }
  // vertical dip of ~m metres with a damped rebound (landings)
  bounce(m) { this.bobVel = Math.max(this.bobVel - m * 11 * 1.55, -0.6 * 11 * 1.55); }

  _springs(dt) {
    // fixed sub-steps keep the springs stable at any frame time
    for (let t = dt; t > 1e-5; t -= 1 / 120) {
      const h = Math.min(t, 1 / 120);
      this.fovVel += (-64 * this.fovOff - 16 * this.fovVel) * h; this.fovOff += this.fovVel * h;
      this.lagVel += (-49 * this.lag - 14 * this.lagVel) * h; this.lag += this.lagVel * h;
      this.bobVel += (-121 * this.bob - 7.7 * this.bobVel) * h; this.bob += this.bobVel * h;
    }
  }

  update(dt, bike, opts = {}) {
    const ph = bike.phys;
    const model = bike.model;
    const mode = opts.forceMode ?? this.mode;
    const cam = this.cam;
    // a forced camera (the flag, the replay director) frees the helmet-camera rider's head
    if (mode !== 2 && this._pov) { this._pov.pov = false; this._pov = null; }
    const sp = ph.v;
    const yawTarget = ph.vh + clamp(wrapAngle(ph.h - ph.vh), -0.4, 0.4) * 0.5;
    if (!this.initialized) { this.yaw = yawTarget; }
    this.yaw += wrapAngle(yawTarget - this.yaw) * (1 - Math.exp(-(mode === 1 ? 4 : 6) * dt));
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const back = opts.lookBack ? -1 : 1;
    let roll = 0;
    let fovT = 60 + clamp(sp / 90, 0, 1) * 18 + (ph.nitroOn ? 7 : 0);
    this._springs(dt);

    if (mode === 0 || mode === 1) {
      const far = mode === 1;
      const dist = (far ? 7.6 : 4.6) + clamp(sp / 80, 0, 1) * (far ? 1.6 : 1.0) + this.lag;
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
    } else if (mode === 2 && model.rider && !ph.crashed && !model.rider._standing && back > 0) {
      // helmet camera at the rider's eyes, just ahead of the visor: the head stays more level
      // than the machine through a corner and turns into it; the gloves on the levers, the
      // forearms and the dash fill the lower half of the view
      const rd = model.rider;
      if (this._pov !== rd) { if (this._pov) this._pov.pov = false; this._pov = rd; rd.pov = true; }
      const head = rd.bones[4];
      head.updateWorldMatrix(true, false);
      const e = head.matrixWorld.elements;
      cam.position.set(0.2, 0.12, 0).applyMatrix4(head.matrixWorld);
      const f = this._f || (this._f = new THREE.Vector3()), u = this._u || (this._u = new THREE.Vector3());
      f.set(e[0], e[1], e[2]).normalize(); u.set(e[4], e[5], e[6]).normalize();
      // eyes ~16° below the head's line: the road ahead with the dash, the bars and the arms
      this.look.copy(cam.position).addScaledVector(f, 10).addScaledVector(u, -2.9);
      // roll: the head's up vector against the travel direction's right (-cos yaw, 0, sin yaw)
      roll = Math.atan2(-u.x * Math.cos(this.yaw) + u.z * Math.sin(this.yaw), u.y);
      fovT += 16;
    } else if (mode === 2) {
      // onboard fallback (crashed, looking back): behind the dash, rolling with the bike
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
    // landing bounce (not on the fixed TV cameras)
    if (mode !== 4 && this.bob !== 0) { cam.position.y += this.bob; this.look.y += this.bob * (mode < 2 ? 0.35 : 1); }
    this.roll = damp(this.roll, roll, 6, dt);
    cam.up.set(Math.sin(this.roll) * Math.cos(this.yaw) * -1, Math.cos(this.roll), Math.sin(this.roll) * Math.sin(this.yaw));
    cam.lookAt(this.look);
    this.fov = damp(this.fov, fovT, 3, dt);
    cam.fov = mode === 4 ? this.fov : clamp(this.fov + this.fovOff, 20, 110);
    cam.updateProjectionMatrix();
  }
}
