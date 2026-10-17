// Motorcycle dynamics: lean-steered turning, engine/gearbox, traction circle,
// slides, wheelies, ballistic jumps, barrier impacts and crashes.
import { clamp, lerp, wrapAngle, damp, moveTowards } from '../core/utils.js';

const G = 9.81;
const RHO = 1.2;
const DEG = Math.PI / 180;

function curveAt(curve, f) {
  if (f <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (f <= curve[i][0]) {
      const [a, va] = curve[i - 1], [b, vb] = curve[i];
      const t = (f - a) / (b - a);
      return va + (vb - va) * (t * t * (3 - 2 * t));
    }
  }
  return curve[curve.length - 1][1];
}

export class BikePhysics {
  constructor(spec, track, opts = {}) {
    this.spec = spec;
    this.track = track;
    this.ai = !!opts.ai;
    this.tune(opts.perf || {});
    // state
    this.x = 0; this.y = 0; this.z = 0;
    this.h = 0; this.vh = 0; // body heading, velocity heading
    this.v = 0; this.vy = 0;
    this.lean = 0; this.leanVel = 0;
    this.pitch = 0; this.pitchVel = 0;
    this.steerAngle = 0;
    this.gear = 1; this.rpm = this.idle; this.shiftT = 0;
    this.compF = 0; this.compR = 0; this.cvF = 0; this.cvR = 0;
    this.nitro = 0.6; this.nitroOn = false;
    this.airborne = false; this.airT = 0;
    this.slip = 0; this.wheelspin = 0; this.skid = 0;
    this.crashed = false; this.crashT = 0; this.ghostT = 0;
    this.hint = -1;
    this.proj = {};
    this.lap = 0; this.s = 0; this.dist = 0; this.prevS = 0;
    this.wrongWayT = 0;
    this.events = []; // impacts, sparks, etc. consumed by game
    this.input = { throttle: 0, brake: 0, steer: 0, rearBrake: 0, nitro: false, wheelie: false };
    this.manual = false;
    this.draft = 0;
    this.offRoad = false; this.onCurb = false;
    this.accelLong = 0;
    this.limiter = 0;
    this.topSpeedSeen = 0;
  }

  // Derive engine / chassis constants. perf: {power, grip, top} multipliers (AI balancing)
  tune(perf = {}) {
    const sp = this.spec;
    const pw = perf.power ?? 1, gr = perf.grip ?? 1, tp = perf.top ?? 1;
    this.mass = sp.mass + 60;
    this.Pmax = sp.engine.hp * 745.7 * pw;
    this.redline = sp.engine.redline || 12000;
    this.idle = sp.engine.idle || 1000;
    this.electric = !!sp.engine.electric;
    this.r = sp.model.rear.R;
    this.wb = sp.model.wb;
    this.vTop = (sp.topKmh / 3.6) * tp;
    this.gears = sp.engine.gears;
    const omegaRed = (this.redline * 2 * Math.PI) / 60;
    this.final = (omegaRed * this.r) / (this.vTop * 1.04 * this.gears[this.gears.length - 1]);
    // peak torque so that max power == Pmax
    let best = 0;
    for (let f = 0.05; f <= 1.0001; f += 0.01) best = Math.max(best, curveAt(sp.engine.curve, f) * f * omegaRed);
    this.Tpeak = this.Pmax / best;
    const eta = 0.92;
    const Frr = 0.015 * this.mass * G;
    this.CdA = Math.max(0.15, (2 * (this.Pmax * eta - Frr * this.vTop)) / (RHO * this.vTop ** 3));
    this.mu = 1.28 * sp.grip * gr;
    this.maxLean = Math.min(sp.maxLean * DEG, Math.atan(this.mu * 1.05) + 4 * DEG);
    this.leanRate = sp.leanRate;
    this.brakeA = sp.brakeG * G * gr;
    this.wheelieA = G * 0.82 / Math.max(0.3, sp.wheelieTend);
    this.offroadGrip = sp.offroad;
  }

  place(s, d, v = 0) {
    const p = this.track.pointAt(s, d);
    this.x = p.x; this.z = p.z; this.y = p.y;
    this.h = this.vh = p.heading;
    this.v = v; this.vy = 0;
    this.lean = 0; this.pitch = 0;
    this.hint = p.i;
    this.track.project(this.x, this.z, this.hint, this.proj);
    this.s = this.prevS = this.proj.s;
    this.dist = this.lap * this.track.L + this.s;
    this.crashed = false; this.airborne = false;
    this.gear = 1; this.rpm = this.idle;
  }

  get kmh() { return this.v * 3.6; }

  ratio(g = this.gear) { return this.gears[Math.max(0, Math.min(this.gears.length - 1, g - 1))] * this.final; }

  torqueAt(rpm) { return this.Tpeak * curveAt(this.spec.engine.curve, clamp(rpm / this.redline, 0, 1)); }

  shift(dir) {
    if (this.electric) return;
    const ng = clamp(this.gear + dir, 1, this.gears.length);
    if (ng !== this.gear) { this.gear = ng; this.shiftT = 0.09; this.events.push({ type: 'shift', dir }); }
  }

  step(dt, env = {}) {
    const inp = this.input;
    const tr = this.track;
    const P = tr.project(this.x, this.z, this.hint, this.proj);
    this.hint = P.i;
    this.offRoad = P.offRoad; this.onCurb = P.onCurb;
    const wetMul = env.wet ? 0.86 : env.snow ? 0.8 : 1;
    const surfGrip = (P.offRoad ? 0.25 + this.offroadGrip * 0.62 : 1) * (P.onRoad || P.onCurb ? wetMul : 1);
    if (this.ghostT > 0) this.ghostT -= dt;

    if (this.crashed) { this._crashStep(dt, P); return; }

    // ---------------- engine & gearbox
    const wheelOmega = this.v / this.r;
    let rpmWheel = (wheelOmega * this.ratio() * 60) / (2 * Math.PI);
    const throttle = this.shiftT > 0 ? 0 : inp.throttle;
    if (!this.electric) {
      if (!this.manual) {
        if (this.shiftT <= 0 && rpmWheel > this.redline * 0.965 && this.gear < this.gears.length) this.shift(1);
        else if (this.shiftT <= 0 && this.gear > 1) {
          const lower = (wheelOmega * this.ratio(this.gear - 1) * 60) / (2 * Math.PI);
          const want = inp.brake > 0.3 ? 0.78 : 0.62;
          if (rpmWheel < this.redline * want * 0.62 && lower < this.redline * 0.9) this.shift(-1);
        }
      }
      rpmWheel = (wheelOmega * this.ratio() * 60) / (2 * Math.PI);
    }
    // clutch slip at launch
    const launch = this.electric ? 0 : this.idle + inp.throttle * (this.redline * 0.55 - this.idle);
    let rpmTarget = Math.max(rpmWheel, this.gear === 1 && !this.electric ? launch * clamp(1 - this.v / 9, 0, 1) : 0, this.electric ? 0 : this.idle);
    if (this.airborne && !this.electric) rpmTarget = Math.max(rpmTarget, this.idle + inp.throttle * this.redline * 0.95);
    this.rpm = damp(this.rpm, rpmTarget, this.airborne ? 6 : 18, dt);
    if (this.shiftT > 0) { this.shiftT -= dt; this.rpm *= 0.995; }
    let limiter = false;
    if (this.rpm >= this.redline) { this.rpm = this.redline; limiter = true; }
    this.limiter = limiter ? 1 : 0;

    let T = this.torqueAt(this.rpm) * throttle;
    if (limiter) T *= 0.15 + 0.5 * Math.random();
    // electric motors: torque available from 0 rpm
    let Fdrive = (T * this.ratio() * 0.92) / this.r;
    // nitro
    this.nitroOn = inp.nitro && this.nitro > 0.02 && !this.airborne && throttle > 0.2;
    if (this.nitroOn) { Fdrive = Fdrive * 1.42 + this.mass * 1.6; this.nitro = Math.max(0, this.nitro - dt * 0.24); }
    else this.nitro = Math.min(1, this.nitro + dt * (0.012 + this.draft * 0.08));

    // ---------------- traction circle
    const muAvail = this.mu * surfGrip;
    const latDemand = Math.abs(Math.tan(this.lean)); // in g's
    const longAvail = Math.sqrt(Math.max(0.02, muAvail * muAvail - Math.min(latDemand, muAvail) ** 2 * 0.85));
    // drive traction (rear ~ 0.6 of weight under accel) -> wheelspin
    const driveMax = longAvail * this.mass * G * 0.95;
    this.wheelspin = 0;
    // traction control (AI always; player with assists, unless sliding on purpose)
    const tc = this.ai || (env.assist && inp.rearBrake < 0.3);
    if (tc && Fdrive > driveMax * 1.02) { this.tcCut = 1 - (driveMax * 1.02) / Fdrive; Fdrive = driveMax * 1.02; } else this.tcCut = 0;
    if (Fdrive > driveMax) { this.wheelspin = clamp((Fdrive - driveMax) / driveMax, 0, 1); Fdrive = driveMax + (Fdrive - driveMax) * 0.15; }

    // brakes
    const brakeIn = inp.brake;
    let Fb = brakeIn * this.brakeA * this.mass + inp.rearBrake * 0.32 * G * this.mass;
    const brakeMax = longAvail * this.mass * G * 1.02;
    this.skid = 0;
    if (Fb > brakeMax) { this.skid = clamp((Fb - brakeMax) / brakeMax, 0, 1); Fb = brakeMax; }
    if (this.v < 0.3) Fb = 0;

    // resistances
    const drag = 0.5 * RHO * this.CdA * (1 - this.draft * 0.35) * (this.nitroOn ? 0.82 : 1) * this.v * this.v;
    const rolling = (0.015 + (P.offRoad ? 0.05 + (1 - this.offroadGrip) * 0.16 : 0)) * this.mass * G;
    const align = Math.cos(this.vh - Math.atan2(P.tx, P.tz));
    const slopeF = this.mass * G * Math.sin(Math.atan(P.grade)) * align;
    let a = 0;
    if (!this.airborne) a = (Fdrive - Fb - drag - rolling * (this.v > 0.1 ? 1 : 0) - slopeF) / this.mass;
    else a = -drag / this.mass;
    this.accelLong = a;
    this.v = Math.max(0, this.v + a * dt);
    // reverse crawl when stuck
    if (this.v < 0.5 && brakeIn > 0.5 && inp.throttle < 0.1) this.reverse = true;
    if (inp.throttle > 0.1) this.reverse = false;

    // ---------------- lean & yaw
    const speedK = clamp(this.v / 14, 0, 1);
    const gripLean = Math.atan(muAvail) + 2 * DEG;
    const leanMax = Math.min(this.maxLean, gripLean + 6 * DEG);
    const target = this.airborne ? this.lean * 0.98 : inp.steer * leanMax * (0.3 + 0.7 * speedK);
    // critically damped lean response limited by the bike's lean rate
    const k = 9 * (this.leanRate / 3);
    const acc = (target - this.lean) * k * k - this.leanVel * 2 * k;
    this.leanVel += acc * dt;
    this.leanVel = clamp(this.leanVel, -this.leanRate * 1.6, this.leanRate * 1.6);
    this.lean += this.leanVel * dt;
    this.lean = clamp(this.lean, -this.maxLean, this.maxLean);

    let yawRate = 0;
    if (!this.airborne) {
      const latAcc = G * Math.tan(this.lean);
      const latMax = muAvail * G * 1.03;
      const latEff = clamp(latAcc, -latMax, latMax);
      if (this.v > 0.5) yawRate = (-latEff / Math.max(this.v, 3.5)) * clamp(this.v / 4, 0, 1);
      // low speed handlebar steering
      const slowK = clamp(1 - this.v / 10, 0, 1);
      this.steerAngle = damp(this.steerAngle, inp.steer * (0.08 + 0.42 * slowK) * (this.reverse ? -1 : 1), 10, dt);
      yawRate += (-this.v * Math.tan(this.steerAngle) / this.wb) * slowK;
      // over-lean beyond grip -> front washes out (understeer) & risk of lowside
      if (Math.abs(latAcc) > latMax * 1.25 && this.v > 12 && !env.assist) {
        this.lowsideT = (this.lowsideT || 0) + dt;
        if (this.lowsideT > 0.6 && !this.ai) { this.crash('lowside'); return; }
      } else this.lowsideT = 0;
      this.overLean = clamp((Math.abs(latAcc) - latMax) / latMax, 0, 1);
    } else {
      this.steerAngle = damp(this.steerAngle, 0, 4, dt);
    }

    // drift: rear brake or power-slide while leaned
    const driftIn = (inp.rearBrake > 0.3 && this.v > 9) ? inp.rearBrake : 0;
    const powerSlide = this.wheelspin * clamp((Math.abs(this.lean) - 0.25) * 2, 0, 1) * clamp((this.v - 6) / 10, 0, 1);
    const slideAmt = clamp(driftIn * 0.9 + powerSlide + (P.offRoad ? 0.2 : 0) + (env.wet ? 0.1 : 0), 0, 1);
    if (!this.airborne) {
      this.h += yawRate * dt;
      // rear steps out in the direction of the turn
      const kick = slideAmt * (-Math.sign(this.lean) || -inp.steer) * clamp(Math.abs(this.lean) / 0.5, 0, 1) * 0.9;
      this.h += kick * dt * (driftIn > 0 ? 1.6 : 1);
      const gripK = lerp(14, 1.8, slideAmt) * (P.offRoad ? 0.6 : 1);
      this.vh += wrapAngle(this.h - this.vh) * Math.min(1, gripK * dt);
    }
    this.slip = wrapAngle(this.h - this.vh);
    const slipMax = env.assist ? 0.6 : 0.75;
    if (Math.abs(this.slip) > slipMax) {
      if (this.v > 15 && !this.ai && !env.assist) { this.crash('highside'); return; }
      this.h = this.vh + Math.sign(this.slip) * slipMax;
      this.slip = Math.sign(this.slip) * slipMax;
    }
    // scrub speed while sliding
    this.v *= 1 - Math.abs(Math.sin(this.slip)) * 0.55 * dt;

    // ---------------- wheelie / stoppie
    const wantWheelie = inp.wheelie && this.v > 3 && !this.airborne;
    let pTarget = 0;
    if (!this.airborne) {
      if (a > this.wheelieA && throttle > 0.6) pTarget = clamp((a - this.wheelieA) * 0.12, 0, this.ai || env.assist ? 0.12 : 0.35);
      if (wantWheelie) pTarget = Math.max(pTarget, inp.throttle > 0.3 ? 0.62 : 0.3);
      if (brakeIn > 0.85 && this.v > 8 && -a > this.brakeA * 0.85) pTarget = -0.1 * brakeIn;
      const pk = 6;
      const pacc = (pTarget - this.pitch) * pk * pk - this.pitchVel * 2 * pk * 0.9;
      this.pitchVel += pacc * dt;
      this.pitch += this.pitchVel * dt;
      if (this.pitch > 0.9) { if (!this.ai) { this.crash('loop'); return; } this.pitch = 0.9; }
    } else {
      // in the air: throttle lifts the nose, brake drops it
      this.pitchVel += ((inp.throttle - inp.brake) * 1.6 - this.pitchVel * 0.8) * dt;
      this.pitch += this.pitchVel * dt;
      this.pitch = clamp(this.pitch, -0.7, 0.9);
    }

    // ---------------- integrate position
    const dir = this.reverse ? -1 : 1;
    const vv = this.reverse ? Math.min(this.v, 2) : this.v;
    if (this.reverse && inp.brake > 0.5) this.v = Math.min(2, this.v + dt * 2);
    this.x += Math.sin(this.vh) * vv * dt * dir;
    this.z += Math.cos(this.vh) * vv * dt * dir;

    // vertical: ballistic vs ground following
    const P2 = tr.project(this.x, this.z, this.hint, this.proj);
    const gy = P2.yBase;
    this.curbY = P2.y - P2.yBase;
    // crest detection uses the centerline elevation only (bank/lateral changes are absorbed by suspension)
    const along = Math.cos(wrapAngle(this.vh - Math.atan2(P2.tx, P2.tz)));
    const vyCenter = P2.grade * this.v * along;
    const prevGround = this._lastGround ?? gy;
    const vyGround = Math.abs(gy - prevGround) > 2 ? 0 : (gy - prevGround) / dt;
    this._lastGround = gy;
    if (!this.airborne) {
      // can the tyres stay glued? if the road falls away faster than gravity -> take off
      if (this.vyC === undefined) this.vyC = vyCenter;
      const nextVy = this.vyC - G * dt * 1.2;
      if (vyCenter < nextVy && this.v > 15) {
        this.airborne = true; this.airT = 0;
        this.vy = this.vyC;
      } else {
        this.vy = vyGround; this.y = gy;
      }
      this.vyC = vyCenter;
    }
    if (this.airborne) {
      this.airT += dt;
      this.vy -= G * dt;
      this.y += this.vy * dt;
      if (this.y <= gy) {
        const impact = vyCenter - this.vy;
        this.y = gy; this.airborne = false;
        this.events.push({ type: 'land', impact, air: this.airT });
        this.cvF -= impact * 0.35; this.cvR -= impact * 0.35;
        const pitchErr = Math.abs(this.pitch - Math.atan(P2.grade));
        if ((pitchErr > 0.7 || (impact > 14 && pitchErr > 0.35)) && !this.ai) { this.crash('landing'); return; }
        if (this.airT > 0.4) this.nitro = Math.min(1, this.nitro + 0.05 + this.airT * 0.05);
        this.vy = vyGround; this.vyC = vyCenter;
      }
    }

    // ---------------- barriers
    const lim = tr.barrierD - 0.45;
    if (Math.abs(P2.d) > lim) {
      const side = Math.sign(P2.d);
      const pen = Math.abs(P2.d) - lim;
      this.x -= P2.rx * side * pen; this.z -= P2.rz * side * pen;
      const th = Math.atan2(P2.tx, P2.tz);
      const rel = wrapAngle(this.vh - th);
      let vt = this.v * Math.cos(rel);
      let vn = this.v * Math.sin(rel); // + = toward left? (rotating heading +) -> toward -right
      // outward speed toward the barrier (right side: d>0)
      const outward = side > 0 ? -vn : vn;
      if (outward > 0) {
        const impact = outward;
        vn = -vn * 0.25;
        vt *= 1 - 0.3 * clamp(impact / 14, 0, 1);
        this.v = Math.hypot(vt, vn);
        this.vh = th + Math.atan2(vn, vt);
        this.h = this.vh + this.slip * 0.3;
        this.events.push({ type: 'wall', impact, side, x: this.x, y: this.y + 0.6, z: this.z });
        if (impact > (env.assist ? 16 : 12.5) && !this.ai) { this.crash('wall'); return; }
        if (impact > 15 && this.ai) { this.crash('wall'); return; }
      } else {
        // grinding along the wall
        this.v *= 1 - 0.4 * dt;
        this.events.push({ type: 'scrape', x: this.x, y: this.y + 0.5, z: this.z, side });
      }
    }

    // ---------------- suspension (visual) from accelerations and surface
    const bump = (P2.offRoad ? 0.012 : 0) + (P2.onCurb ? 0.008 : 0);
    const nF = (bump ? (Math.random() - 0.5) * bump * this.v * 0.4 : 0);
    const nR = (bump ? (Math.random() - 0.5) * bump * this.v * 0.4 : 0);
    const loadF = -a * 0.006, loadR = a * 0.005;
    const sk = 90, sd = 12;
    this.cvF += ((loadF + nF - this.compF) * sk - this.cvF * sd) * dt;
    this.cvR += ((loadR + nR - this.compR) * sk - this.cvR * sd) * dt;
    this.compF = clamp(this.compF + this.cvF * dt, -0.04, 0.09);
    this.compR = clamp(this.compR + this.cvR * dt, -0.04, 0.08);

    // ---------------- progress & laps
    this._progress(P2);
    this.topSpeedSeen = Math.max(this.topSpeedSeen, this.v);
  }

  _progress(P) {
    const L = this.track.L;
    const s = P.s;
    let ds = s - this.prevS;
    if (ds < -L / 2) { this.lap++; ds += L; this.events.push({ type: 'lap' }); }
    else if (ds > L / 2) { this.lap--; ds -= L; }
    this.prevS = s;
    this.s = s;
    this.dist = this.lap * L + s;
    // wrong-way detection
    const th = Math.atan2(P.tx, P.tz);
    const rel = Math.cos(wrapAngle(this.vh - th));
    if (rel < -0.3 && this.v > 3) this.wrongWayT += 1 / 120; else this.wrongWayT = Math.max(0, this.wrongWayT - 1 / 60);
  }

  crash(kind) {
    if (this.crashed) return;
    this.crashed = true;
    this.crashT = 0;
    this.crashSpin = (Math.random() - 0.5) * 6;
    this.crashSide = this.lean !== 0 ? Math.sign(this.lean) : (Math.random() < 0.5 ? -1 : 1);
    this.events.push({ type: 'crash', kind, v: this.v, x: this.x, y: this.y, z: this.z });
  }

  _crashStep(dt, P) {
    this.crashT += dt;
    // tumble / slide on its side with friction
    this.lean = damp(this.lean, this.crashSide * 1.45, 6, dt);
    this.pitch = damp(this.pitch, 0, 4, dt);
    this.h += this.crashSpin * dt;
    this.crashSpin *= 1 - 1.2 * dt;
    this.v = Math.max(0, this.v - 6.5 * dt - this.v * 0.6 * dt);
    this.x += Math.sin(this.vh) * this.v * dt;
    this.z += Math.cos(this.vh) * this.v * dt;
    const P2 = this.track.project(this.x, this.z, this.hint, this.proj);
    this.hint = P2.i;
    const lim = this.track.barrierD - 0.6;
    if (Math.abs(P2.d) > lim) {
      const side = Math.sign(P2.d);
      const pen = Math.abs(P2.d) - lim;
      this.x -= P2.rx * side * pen; this.z -= P2.rz * side * pen;
      this.v *= 0.5;
    }
    this.y = P2.y + 0.05;
    this.rpm = damp(this.rpm, this.idle, 3, dt);
    if (this.v > 2) this.events.push({ type: 'scrape', x: this.x, y: this.y + 0.2, z: this.z, side: 0 });
    this._progress(P2);
    if (this.crashT > 2.4) this.respawn();
  }

  respawn() {
    const s = this.s - 4;
    const p = this.track.pointAt(s, 0);
    const lap = this.lap;
    const line = this.track.lineD ? this.track.lineD[p.i] * 0.4 : 0;
    this.place(s, line, 10);
    this.lap = lap;
    this._progress(this.track.project(this.x, this.z, this.hint, this.proj));
    this.prevS = this.s;
    this.dist = this.lap * this.track.L + this.s;
    this.ghostT = 2.5;
    this.events.push({ type: 'respawn' });
  }

  // visual state for BikeModel.animate
  visual(out = {}) {
    out.speed = this.reverse ? -Math.min(this.v, 2) : this.v;
    out.steerAngle = this.steerAngle + clamp(this.slip, -0.5, 0.5) * 0.6;
    out.lean = this.lean;
    out.pitch = this.pitch;
    out.compF = this.compF; out.compR = this.compR;
    out.braking = this.input.brake > 0.1 || this.input.rearBrake > 0.1;
    out.wheelSpinExtra = this.wheelspin * 25 + (this.airborne ? this.input.throttle * 30 : 0);
    return out;
  }
}
