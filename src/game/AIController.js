// AI rider: pure-pursuit on the racing line, speed profile with braking zones,
// overtaking offsets, nitro on straights and a little human-like imperfection.
import { clamp, wrapAngle, rng } from '../core/utils.js';

const G = 9.81;

export class AIController {
  constructor(phys, track, { skill = 0.93, seed = 1, wet = false } = {}) {
    this.p = phys;
    this.track = track;
    this.skill = skill;
    this.r = rng(seed);
    this.lane = 0; this.laneTarget = 0;
    this.mistakeT = 0; this.mistake = 0;
    this.wet = wet;
    this.rubber = 1;
    this.nitroHold = 0;
    this.buildProfile();
  }

  buildProfile() {
    const p = this.p;
    const lat = Math.min(p.mu * (this.wet ? 0.86 : 1), Math.tan(p.maxLean) * 0.88) * G * 0.88 * (0.94 + this.skill * 0.06);
    const brake = Math.min(p.brakeA, p.mu * G) * (this.wet ? 0.68 : 0.76) * this.skill;
    this.profile = this.track.speedProfile(lat, brake, p.vTop * 1.02);
  }

  update(dt, bikes) {
    const p = this.p, t = this.track, inp = p.input;
    if (p.crashed) { inp.throttle = 0; inp.brake = 0; inp.steer = 0; return; }
    const N = t.N, ds = t.ds;
    const i = p.hint < 0 ? 0 : p.hint;

    // ---- traffic: find the closest bike ahead and steer around it
    let threat = null, tdist = 1e9;
    for (const b of bikes) {
      if (b.phys === p || b.phys.crashed) continue;
      let gap = b.phys.dist - p.dist;
      if (gap < -t.L / 2) gap += t.L; if (gap > t.L / 2) gap -= t.L;
      if (gap > 0 && gap < 28) {
        const dl = b.phys.proj.d - p.proj.d;
        if (Math.abs(dl) < 2.6 && gap < tdist) { tdist = gap; threat = { gap, dl, v: b.phys.v, d: b.phys.proj.d }; }
      }
    }
    const lim = t.halfW - 1.2;
    const lineHere = t.lineD[i];
    if (threat && threat.v < p.v + 2) {
      // pick the side with more room
      const roomL = threat.d - -t.halfW, roomR = t.halfW - threat.d;
      const side = roomR > roomL ? 1 : -1;
      this.laneTarget = clamp(threat.d + side * 2.6 - lineHere, -lim - lineHere, lim - lineHere);
    } else {
      this.laneTarget *= Math.max(0, 1 - dt * 0.6);
    }
    this.lane += clamp(this.laneTarget - this.lane, -dt * 2.2, dt * 2.2);

    // ---- steering: curvature feed-forward + PD on lateral offset from the line
    const lim2 = lim;
    let dTarget = clamp(lineHere + this.lane, -lim2, lim2);
    // ease onto the racing line at low speed (grid starts, after respawns)
    if (p.v < 14) dTarget = p.proj.d + (dTarget - p.proj.d) * clamp(p.v / 14, 0.15, 1);
    const y = -(p.proj.d - dTarget); // + = bike is left of where it should be
    // heading of the line (blend lane changes as a small extra heading)
    const ePsi = wrapAngle(p.vh - t.lineH[i]); // + = pointing left of the line
    const v = Math.max(p.v, 3);
    const ydot = v * Math.sin(ePsi);
    const ahead = (i + Math.round((v * 0.28) / ds)) % N;
    const kappa = t.lineK[ahead];
    const w = clamp(2.4 - v * 0.012, 1.3, 2.4);
    let aLeft = v * v * kappa - w * w * y - 2 * w * ydot * 0.9;
    aLeft = clamp(aLeft, -G * 2, G * 2);
    const leanDes = -Math.atan(aLeft / G);
    inp.steer = clamp(leanDes / Math.max(0.2, p.maxLean), -1, 1);
    if (p.v < 5 && Math.abs(ePsi) > 0.9) {
      // very slow and pointing the wrong way: steer at a point ahead
      const look = 8;
      const j = (i + Math.round(look / ds)) % N;
      const tx = t.c.x[j] + t.c.rx[j] * dTarget, tz = t.c.z[j] + t.c.rz[j] * dTarget;
      const e = wrapAngle(Math.atan2(tx - p.x, tz - p.z) - p.vh);
      inp.steer = clamp(-e * 2.5, -1, 1);
    }

    // ---- speed
    const lead = (i + Math.round((p.v * 0.3) / ds)) % N;
    let vt = this.profile[lead] * this.rubber * (0.985 + this.skill * 0.015);
    if (this.mistake > 0) { this.mistake -= dt; vt *= 1.07; }
    else if (this.r() < dt * 0.012 * (1.1 - this.skill) * 10) this.mistake = 0.6 + this.r() * 0.6;
    // drafting / don't rear-end
    if (threat && threat.gap < 7 && Math.abs(threat.dl) < 1.4) vt = Math.min(vt, threat.v - 0.5);
    const err = vt - p.v;
    inp.throttle = clamp(err * 0.45 + 0.35, 0, 1);
    inp.brake = clamp(-err * 0.35 - 0.05, 0, 1);
    if (err < -0.5) inp.throttle = 0;
    inp.rearBrake = 0;
    inp.wheelie = false;

    // ---- nitro on long straights
    if (this.nitroHold > 0) this.nitroHold -= dt;
    let straight = true;
    for (let k = 1; k < 60; k += 6) if (this.profile[(i + k * 2) % N] < p.vTop * 0.92) { straight = false; break; }
    inp.nitro = straight && p.nitro > 0.25 && p.v > p.vTop * 0.45 && (this.nitroHold > 0 || this.r() < dt * 0.8 * this.skill);
    if (inp.nitro && this.nitroHold <= 0) this.nitroHold = 1.5 + this.r() * 2;

    // ---- stuck recovery
  }
}
