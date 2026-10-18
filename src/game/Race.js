// A race session: grid, start lights, laps, positions, bike-to-bike contact,
// slipstream, cameras, effects, positional engine audio, replay and ghosts.
import * as THREE from 'three';
import { TrackScene } from '../scenes/TrackScene.js';
import { BIKES, BIKE_BY_ID } from '../bikes/catalog.js';
import { BikeModel, drawDash } from '../bikes/BikeModel.js';
import { BikePhysics } from './BikePhysics.js';
import { AIController } from './AIController.js';
import { CameraController, CAM_NAMES } from './CameraController.js';
import { Effects } from './Effects.js';
import { BikeGlow } from './BikeGlow.js';
import { SpeedFX } from './SpeedFX.js';
import { Recorder, GhostTrack } from './Replay.js';
import { HUD } from '../ui/HUD.js';
import { Input } from '../core/Input.js';
import { Audio } from '../core/Audio.js';
import { Save } from '../core/Settings.js';
import { clamp, rng, damp, formatTime, wrapAngle } from '../core/utils.js';

const DT = 1 / 120;
export const POINTS = [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const SKILL = { facil: 0.86, normal: 0.93, mitico: 1.0 };
const DUST = {
  sand: [0.78, 0.55, 0.38], snow: [0.95, 0.97, 1.0], grass: [0.42, 0.36, 0.26], gravel: [0.7, 0.68, 0.64],
  concrete: [0.5, 0.5, 0.52], dryGrass: [0.62, 0.55, 0.4], forest: [0.35, 0.3, 0.22], asphaltDark: [0.4, 0.4, 0.42],
};

export class Race {
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.mode = cfg.mode || 'race';
    this.laps = this.mode === 'free' ? 9999 : cfg.laps || 3;
    this.time = 0;
    this.phase = 'loading';
    this.paused = false;
    this.bikes = [];
    this.order = [];
    this.finishOrder = [];
    this._acc = 0;
    this._vis = {};
  }

  async load(onProgress) {
    const engine = this.game.engine;
    const base = this.cfg.trackDef;
    const def = { ...base, time: this.cfg.time && this.cfg.time !== 'auto' ? this.cfg.time : base.time, weather: this.cfg.weather && this.cfg.weather !== 'auto' ? this.cfg.weather : base.weather };
    this.def = def;
    this.ts = await TrackScene.create(engine, def, onProgress);
    this.track = this.ts.track;
    this.scene = this.ts.scene;
    onProgress(0.82, 'Preparando parrilla…');
    const q = Save.quality;
    this.effects = new Effects(this.scene, q, this.track.theme);
    this.env = { wet: this.track.wet, snow: def.weather === 'snow', assist: Save.settings.assist };

    // ---------------- entrants
    const pSpec = BIKE_BY_ID[this.cfg.bikeId] || BIKES[0];
    const rivalsN = this.mode === 'race' || this.mode === 'champ' ? clamp(this.cfg.rivals ?? 7, 0, 11) : 0;
    const others = BIKES.filter((b) => b.id !== pSpec.id);
    const r = rng((this.cfg.seed ?? Date.now()) & 0xffff);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    const field = others.slice(0, rivalsN);
    const total = field.length + 1;
    // grid slot for the player
    const diff = this.cfg.difficulty || 'normal';
    let pSlot = total - 1;
    if (this.mode === 'champ' && this.cfg.gridSlot !== undefined) pSlot = clamp(this.cfg.gridSlot, 0, total - 1);
    else if (diff === 'facil') pSlot = Math.min(total - 1, Math.floor(total * 0.35));
    else if (diff === 'normal') pSlot = Math.min(total - 1, Math.floor(total * 0.6));
    const entrants = [];
    let fi = 0;
    for (let slot = 0; slot < total; slot++) {
      if (slot === pSlot) entrants.push({ spec: pSpec, livery: this.cfg.livery ?? 0, player: true });
      else entrants.push({ spec: field[fi++], livery: Math.floor(r() * 3), player: false });
    }
    const skill = SKILL[diff] ?? 0.93;
    const playerProbe = new BikePhysics(pSpec, this.track);
    entrants.forEach((e, slot) => {
      const model = new BikeModel(e.spec, e.livery, { castShadow: q.shadows > 0 });
      this.scene.add(model.root);
      let perf = {};
      if (!e.player) {
        // balance the AI machine against the player's bike so every race is a fight
        const probe = new BikePhysics(e.spec, this.track);
        const var_ = 0.97 + r() * 0.06;
        perf = {
          power: (playerProbe.Pmax / playerProbe.mass) / (probe.Pmax / probe.mass) * var_,
          top: (playerProbe.vTop / probe.vTop) * (0.98 + r() * 0.04),
          grip: (playerProbe.mu / probe.mu),
          maxLean: Math.max(playerProbe.maxLean, 0.5),
        };
      }
      const phys = new BikePhysics(e.spec, this.track, { ai: !e.player, perf });
      if (perf.maxLean) { phys.maxLean = perf.maxLean; }
      const row = Math.floor(slot / 2);
      const d = (slot % 2 ? 1 : -1) * this.track.W * 0.22;
      phys.place(-10 - row * 7 - (slot % 2) * 2.5, d, 0);
      phys.lap = -1;
      phys._progress(phys.proj);
      phys.prevS = phys.s; phys.dist = phys.lap * this.track.L + phys.s;
      phys.manual = e.player && Save.settings.transmission === 'manual';
      const bike = {
        id: slot, spec: e.spec, livery: e.livery, model, phys, isPlayer: e.player,
        color: model.livery.base === '#111111' || model.livery.base === '#0c0c0e' || model.livery.base === '#0b0b0d' || model.livery.base === '#101012' || model.livery.base === '#141414' || model.livery.base === '#0d0f12' ? model.livery.accent : model.livery.base,
        lapStart: 0, lapTimes: [], bestLap: 0, finished: false, finishTime: 0, popT: 0,
      };
      if (!e.player) bike.ai = new AIController(phys, this.track, { skill: skill * (0.97 + r() * 0.05), seed: slot * 31 + 7, wet: this.env.wet || this.env.snow });
      this.effects.attachFlames(bike);
      this.bikes.push(bike);
      if (e.player) this.player = bike;
    });
    this.order = this.bikes.slice();
    this.glow = new BikeGlow(this.scene, Save.quality, this.ts.env, this.bikes);

    // headlight for the player at night / dusk / storm
    const T = this.ts.env.T;
    if (T.night || T.overcast || this.ts.env.W.overcast || T.sunElev < 8) {
      const hl = this.player.model.headlights[0];
      if (hl) {
        const spot = new THREE.SpotLight(0xfff2dd, 900, 140, 0.42, 0.45, 1.4);
        spot.position.set(hl.pos[0], hl.pos[1], hl.pos[2]);
        const tgt = new THREE.Object3D();
        tgt.position.set(hl.pos[0] + 10, hl.pos[1] - 1.2, hl.pos[2]);
        const grp = this.player.model.groups[hl.group] || this.player.model.groups.chassis;
        grp.add(spot, tgt);
        spot.target = tgt;
        spot.castShadow = false;
        this.headSpot = spot;
      }
    }

    // ---------------- ghost (time trial)
    if (this.mode === 'trial') {
      this.ghostRec = new GhostTrack();
      const saved = Save.data.ghosts[def.id];
      if (saved && saved.data) {
        try {
          this.ghostData = GhostTrack.decode(saved.data);
          this.ghostSpec = BIKE_BY_ID[saved.bike] || pSpec;
        } catch (e) { this.ghostData = null; }
      }
      this._makeGhostModel(this.ghostSpec || pSpec);
    }

    this.cam = new CameraController(this.game.engine.camera, this.track);
    this.cam.set(Save.settings.camera || 0);
    this.speedFx = new SpeedFX(this.scene, Save.quality, this);
    this.recorder = new Recorder(this.bikes.length);
    onProgress(0.92, 'Afinando motores…');
    this.hud = new HUD(this.game.ui.layer, this);
    this.hud.setVisible(false);
    // audio
    this.voices = new Map();
    if (Audio.ready) {
      this.playerVoice = Audio.engine(this.player.spec, { positional: false });
    }
    this.ts.env.onThunder = () => Audio.thunder();
    // warm-up render (compile shaders)
    const engine2 = this.game.engine;
    engine2.setScene(this.scene, engine2.camera);
    this._placeIntroCamera(0);
    this._syncModels(0);
    engine2.renderer.compile(this.scene, engine2.camera);
    onProgress(1, '¡Listo!');
  }

  _makeGhostModel(spec) {
    if (this.ghostModel) { this.ghostModel.dispose(); this.ghostModel = null; }
    const gm = new BikeModel(spec, 0, { castShadow: false });
    gm.setGhost(0x40e0ff);
    gm.root.visible = false;
    this.scene.add(gm.root);
    this.ghostModel = gm;
  }

  start() {
    this.phase = 'intro';
    this.phaseT = 0;
    this.hud.setVisible(true);
    this.hud.message(this.track.def.name, `${this.track.def.place.toUpperCase()} · ${this.mode === 'free' ? 'PASEO LIBRE' : this.mode === 'trial' ? 'CONTRARRELOJ' : `${this.laps} VUELTAS`}`, 2600);
    Audio.playMusic('race');
    Audio.whoosh();
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    if (this.paused || this.phase === 'loading') { this.game.engine.render; return; }
    const inp = Input.state, edges = Input.edges;
    if (edges.pause && this.phase !== 'results') { this.togglePause(); return; }
    if (this.phase === 'replay') { this._replayUpdate(dt); return; }

    this.phaseT += dt;
    const P = this.player;
    // ---- phase logic
    if (this.phase === 'intro') {
      this._placeIntroCamera(this.phaseT);
      if (this.phaseT > 3.2 || (edges.confirm && this.phaseT > 0.4)) { this.phase = 'countdown'; this.phaseT = 0; this.lightsOn = 0; this.cam.initialized = false; }
    } else if (this.phase === 'countdown') {
      const n = Math.min(5, Math.floor(this.phaseT / 0.75) + 1);
      if (n !== this.lightsOn && this.phaseT < 3.75) { this.lightsOn = n; this.track.setStartLights(n); Audio.beep(false); if (n >= 3) this.hud.countdown(6 - n); }
      if (!this.goAt) this.goAt = 3.75 + 0.3 + Math.random() * 0.8;
      if (this.phaseT >= this.goAt) {
        this.phase = 'race'; this.phaseT = 0; this.time = 0;
        this.track.setStartLights(0, true);
        setTimeout(() => this.track.setStartLights(0), 2500);
        this.hud.countdown(0); Audio.beep(true);
        Input.rumble(0.6, 0.6, 200);
      }
    }

    // ---- player input
    const pi = P.phys.input;
    const canDrive = this.phase === 'race' || this.phase === 'finished';
    pi.throttle = inp.throttle; pi.brake = inp.brake; pi.steer = inp.steer; pi.rearBrake = inp.rearBrake;
    pi.nitro = inp.nitro; pi.wheelie = inp.wheelie;
    if (P.finished && this.phase === 'finished') { this._autopilot(P); }
    if (edges.shiftUp) { P.phys.manual = true; P.phys.shift(1); }
    if (edges.shiftDown) { P.phys.manual = true; P.phys.shift(-1); }
    if (edges.camera) { this.cam.next(); Save.settings.camera = this.cam.mode; this.hud.camName(CAM_NAMES[this.cam.mode]); }
    if (edges.reset && canDrive && !P.phys.crashed && (P.phys.v < 4 || P.phys.wrongWayT > 0.5)) P.phys.respawn();
    if (inp.nitro && !this._nitroWas && P.phys.nitro > 0.05 && canDrive) Audio.nitro();
    this._nitroWas = inp.nitro;

    // ---- AI
    if (canDrive) for (const b of this.bikes) if (b.ai && !(b.finished && b.coast)) b.ai.update(dt, this.bikes);
    this._rubberBand();

    // ---- physics (fixed step)
    this._acc += dt;
    let steps = 0;
    while (this._acc >= DT && steps < 12) {
      this._acc -= DT; steps++;
      if (canDrive) {
        for (const b of this.bikes) b.phys.step(DT, this.env);
        this._collisions();
      } else {
        // held on the grid: allow revving
        for (const b of this.bikes) {
          const ph = b.phys;
          const thr = b.isPlayer ? inp.throttle : (this.phase === 'countdown' ? 0.35 + Math.sin(this.phaseT * 3 + b.id) * 0.25 : 0.1);
          ph.input.throttle = thr;
          ph.rpm = damp(ph.rpm, ph.idle + thr * ph.redline * 0.75, 6, DT);
          ph.v = 0;
        }
      }
    }
    if (canDrive) this.time += dt;
    this._draft();
    this._progressAndLaps();
    this._processEvents(dt);
    this._syncModels(dt);
    this._fx(dt);

    // ---- camera
    if (this.phase === 'race' || this.phase === 'countdown') this.cam.update(dt, P, { lookBack: inp.lookBack });
    else if (this.phase === 'finished') this.cam.update(dt, P, { forceMode: this.phaseT < 2.5 ? 0 : 4 });
    this.recorder.record(canDrive ? dt : 0, this.bikes);
    if (this.mode === 'trial' && canDrive) this._ghostUpdate(dt);

    // ---- audio
    this._audio(dt);
    this.ts.update(dt, this.game.engine.camera, new THREE.Vector3(P.phys.x, P.phys.y, P.phys.z));
    this.effects.update(dt, this.game.engine.camera, this.game.engine.renderer, this.scene.fog);
    this.glow.update(dt, this.game.engine.camera);
    this._postFx(dt);
    this.speedFx.update(dt, this.game.engine.camera);
    this.hud.update(dt);
    // player dash
    this._dashT = (this._dashT || 0) - dt;
    if (this._dashT <= 0 && (this.cam.mode === 2)) {
      this._dashT = 0.08;
      drawDash(P.model.mats.dashCanvas, P.phys.v * 3.6, P.phys.rpm / P.phys.redline, P.phys.gear, P.spec, P.phys.nitro);
      P.model.mats.dashTex.needsUpdate = true;
    }

    // wrong way / finish transitions
    if (P.phys.wrongWayT > 1.2 && this.phase === 'race' && !this._wwShown) { this._wwShown = true; this.hud.message('DIRECCIÓN CONTRARIA', 'PULSA R PARA VOLVER A PISTA', 2000, 'hud-warn'); Audio.warn(); }
    if (P.phys.wrongWayT <= 0.2) this._wwShown = false;
    if (this.phase === 'finished' && this.phaseT > 7) this._toResults();
  }

  _autopilot(b) {
    // after the flag: gentle cruise along the racing line
    if (!b.autoAI) b.autoAI = new AIController(b.phys, this.track, { skill: 0.8, seed: 99 });
    b.autoAI.update(DT, this.bikes);
    b.phys.input.throttle *= 0.6;
  }

  _placeIntroCamera(t) {
    const cam = this.game.engine.camera;
    const p = this.track.pointAt(-30 + t * 6, 0);
    const a = t * 0.35 + 0.6;
    const R = 18 - t * 2;
    cam.position.set(p.x + Math.sin(a) * R, p.y + 4 + t * 0.6, p.z + Math.cos(a) * R);
    const tp = this.track.pointAt(-20, 0);
    cam.up.set(0, 1, 0);
    cam.lookAt(tp.x, tp.y + 0.8, tp.z);
    cam.fov = 55; cam.updateProjectionMatrix();
  }

  _rubberBand() {
    if (this.mode !== 'race' && this.mode !== 'champ') return;
    const P = this.player;
    for (const b of this.bikes) {
      if (!b.ai) continue;
      const gap = b.phys.dist - P.phys.dist; // + = AI ahead
      let k = 1;
      if (gap > 60) k = 1 - clamp((gap - 60) / 600, 0, 0.06);
      else if (gap < -60) k = 1 + clamp((-gap - 60) / 500, 0, 0.06);
      b.ai.rubber = damp(b.ai.rubber, k, 0.5, 1 / 60);
    }
  }

  _collisions() {
    const B = this.bikes;
    const R = 0.42;
    for (let i = 0; i < B.length; i++) {
      const a = B[i].phys;
      if (a.ghostT > 0) continue;
      for (let j = i + 1; j < B.length; j++) {
        const b = B[j].phys;
        if (b.ghostT > 0) continue;
        const dx0 = b.x - a.x, dz0 = b.z - a.z;
        if (dx0 * dx0 + dz0 * dz0 > 9) continue;
        if (Math.abs(a.y - b.y) > 1.2) continue;
        // two circles per bike along heading
        let best = null;
        for (const sa of [-0.45, 0.45]) {
          const ax = a.x + Math.sin(a.h) * sa * a.wb, az = a.z + Math.cos(a.h) * sa * a.wb;
          for (const sb of [-0.45, 0.45]) {
            const bx = b.x + Math.sin(b.h) * sb * b.wb, bz = b.z + Math.cos(b.h) * sb * b.wb;
            const dx = bx - ax, dz = bz - az;
            const d = Math.hypot(dx, dz);
            if (d < 2 * R && (!best || d < best.d)) best = { d, nx: dx / (d || 1), nz: dz / (d || 1) };
          }
        }
        if (!best) continue;
        const pen = 2 * R - best.d;
        const ma = a.mass, mb = b.mass, tot = ma + mb;
        a.x -= best.nx * pen * (mb / tot); a.z -= best.nz * pen * (mb / tot);
        b.x += best.nx * pen * (ma / tot); b.z += best.nz * pen * (ma / tot);
        // velocity exchange along the normal
        const avx = Math.sin(a.vh) * a.v, avz = Math.cos(a.vh) * a.v;
        const bvx = Math.sin(b.vh) * b.v, bvz = Math.cos(b.vh) * b.v;
        const rel = (bvx - avx) * best.nx + (bvz - avz) * best.nz;
        if (rel < 0) {
          const jimp = (-(1 + 0.25) * rel) / (1 / ma + 1 / mb);
          const nax = avx - (jimp / ma) * best.nx, naz = avz - (jimp / ma) * best.nz;
          const nbx = bvx + (jimp / mb) * best.nx, nbz = bvz + (jimp / mb) * best.nz;
          a.v = Math.hypot(nax, naz); a.vh = Math.atan2(nax, naz);
          b.v = Math.hypot(nbx, nbz); b.vh = Math.atan2(nbx, nbz);
          a.h += wrapAngle(a.vh - a.h) * 0.3; b.h += wrapAngle(b.vh - b.h) * 0.3;
          const impact = -rel;
          a.events.push({ type: 'bump', impact, x: (a.x + b.x) / 2, y: a.y + 0.5, z: (a.z + b.z) / 2, other: B[j] });
          b.events.push({ type: 'bump', impact, x: (a.x + b.x) / 2, y: b.y + 0.5, z: (a.z + b.z) / 2, other: B[i] });
          if (impact > 11) { if (Math.random() < 0.5) a.crash('contact'); else b.crash('contact'); }
        }
      }
    }
  }

  _draft() {
    for (const b of this.bikes) {
      let best = 0;
      const p = b.phys;
      for (const o of this.bikes) {
        if (o === b) continue;
        const q = o.phys;
        const dx = q.x - p.x, dz = q.z - p.z;
        const fwd = dx * Math.sin(p.vh) + dz * Math.cos(p.vh);
        if (fwd < 2 || fwd > 24) continue;
        const lat = Math.abs(dx * Math.cos(p.vh) - dz * Math.sin(p.vh));
        if (lat > 1.6) continue;
        best = Math.max(best, (1 - (fwd - 2) / 22) * (1 - lat / 1.6) * clamp((p.v - 25) / 20, 0, 1));
      }
      p.draft = damp(p.draft, best, 3, 1 / 60);
    }
  }

  _progressAndLaps() {
    for (const b of this.bikes) {
      const p = b.phys;
      // lap completion (events processed here so timing is exact per frame)
      for (const e of p.events) {
        if (e.type !== 'lap') continue;
        if (p.lap >= 1 && !b.finished) {
          const lt = this.time - b.lapStart;
          b.lapTimes.push(lt);
          b.lapStart = this.time;
          const isBest = !b.bestLap || lt < b.bestLap;
          if (isBest) b.bestLap = lt;
          if (b.isPlayer) this._playerLap(lt, isBest);
          if (p.lap >= this.laps) this._finish(b);
          else if (b.isPlayer && p.lap === this.laps - 1 && this.mode !== 'free') { this.hud.message('ÚLTIMA VUELTA', '', 1800); Audio.lap(); }
        }
        if (p.lap === 0) b.lapStart = 0;
      }
    }
    // standings
    this.order = this.bikes.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.phys.dist - a.phys.dist;
    });
    const pos = this.order.indexOf(this.player);
    if (this._lastPos !== undefined && pos !== this._lastPos && this.phase === 'race' && this.time > 3 && this.mode !== 'trial' && this.mode !== 'free') {
      if (pos < this._lastPos) this.hud.toast(`▲ P${pos + 1}`, '#3dff8a', 900);
      else this.hud.toast(`▼ P${pos + 1}`, '#ff3b4e', 900);
    }
    this._lastPos = pos;
  }

  _playerLap(lt, isBest) {
    const def = this.track.def;
    const rec = Save.data.records[def.id] || {};
    let txt = `VUELTA ${formatTime(lt * 1000)}`;
    let sub = '';
    if (!rec.lap || lt < rec.lap) {
      rec.lap = lt; rec.lapBike = this.player.spec.id;
      Save.data.records[def.id] = rec; Save.save();
      sub = '¡NUEVO RÉCORD DE PISTA!';
    } else if (isBest && this.player.lapTimes.length > 1) sub = 'VUELTA RÁPIDA';
    this.hud.message(txt, sub, 2000);
    Audio.lap();
    if (this.mode === 'trial') this._ghostLapDone(lt);
  }

  _finish(b) {
    b.finished = true;
    b.finishTime = this.time;
    this.finishOrder.push(b);
    if (b.isPlayer) {
      const place = this.finishOrder.length;
      this.phase = 'finished'; this.phaseT = 0;
      if (this.mode === 'trial') this.hud.message('¡SESIÓN COMPLETA!', '', 3000);
      else this.hud.message(place === 1 ? '¡VICTORIA!' : `${place}º PUESTO`, place <= 3 ? '¡PODIO!' : 'BANDERA A CUADROS', 4000);
      Audio.fanfare();
      Input.rumble(0.5, 0.8, 400);
      const st = Save.data.stats;
      if (this.mode === 'race' || this.mode === 'champ') {
        st.races++;
        if (place === 1) st.wins++;
        if (place <= 3) st.podiums++;
        const rec = Save.data.records[this.track.def.id] || {};
        if (!rec.race || this.time < rec.race) { rec.race = this.time; rec.raceBike = b.spec.id; rec.raceLaps = this.laps; }
        Save.data.records[this.track.def.id] = rec;
      }
      Save.save();
    } else {
      b.coast = false;
    }
  }

  _processEvents(dt) {
    const P = this.player;
    for (const b of this.bikes) {
      const p = b.phys;
      const near = b.isPlayer || (Math.hypot(p.x - P.phys.x, p.z - P.phys.z) < 70);
      for (const e of p.events) {
        switch (e.type) {
          case 'wall':
            if (near) { this.effects.sparks(e.x, e.y, e.z, Math.min(40, 6 + e.impact * 2), 0, 0, 4 + e.impact * 0.5); }
            if (b.isPlayer) {
              this.cam.addShake(clamp(e.impact / 12, 0.2, 1)); Audio.impact(clamp(e.impact / 14, 0.2, 1.2)); Input.rumble(0.8, 0.4, 160);
              this._damage = Math.min(1, (this._damage || 0) + e.impact / 20);
            }
            break;
          case 'scrape':
            if (near && Math.random() < 0.4) this.effects.sparks(e.x, e.y, e.z, 2, 0, 0, 5);
            if (b.isPlayer) this._scrape = 1;
            break;
          case 'bump':
            if (near) this.effects.sparks(e.x, e.y, e.z, 6, 0, 0, 5);
            if (b.isPlayer) { this.cam.addShake(clamp(e.impact / 10, 0.1, 0.8)); Audio.impact(clamp(e.impact / 12, 0.15, 0.9)); Input.rumble(0.6, 0.6, 120); }
            break;
          case 'crash':
            if (near) this.effects.explosionDust(e.x, e.y, e.z, DUST[this.track.def.runoffMat] || DUST.gravel);
            if (b.isPlayer) {
              this.hud.message('¡CAÍDA!', 'REAPARECIENDO…', 2200, 'hud-warn'); Audio.crash(); this.cam.addShake(1.5); Input.rumble(1, 1, 500);
              Save.data.stats.crashes++;
              this._damage = 1;
            } else if (near) Audio.impact(0.6);
            this.effects.skidBreak(b.id + 'r'); this.effects.skidBreak(b.id + 'f');
            break;
          case 'land':
            if (b.isPlayer && e.impact > 3) { this.cam.addShake(clamp(e.impact / 12, 0.1, 0.9)); Audio.impact(clamp(e.impact / 16, 0.1, 0.7)); Input.rumble(0.7, 0.3, 120); if (e.air > 0.5) this.hud.toast(`¡SALTO! ${e.air.toFixed(1)} s`, '#00e5ff', 900); }
            break;
          case 'shift':
            if (e.dir > 0) {
              b.popT = 0.09;
              if (b.isPlayer) Audio.shiftClunk();
              if (near && Math.random() < 0.5) Audio.pop(null, b.isPlayer ? 0.7 : 0.3);
            }
            break;
          case 'respawn':
            if (b.isPlayer) this.hud.toast('DE VUELTA EN PISTA', '#fff', 1000);
            break;
          default: break;
        }
      }
      p.events.length = 0;
    }
  }

  _syncModels(dt) {
    const v = this._vis;
    for (const b of this.bikes) {
      const p = b.phys, m = b.model;
      m.root.position.set(p.x, p.y + (p.curbY || 0), p.z);
      m.root.rotation.set(0, p.h, 0);
      // align with banked surface
      m.root.rotateZ(-(p.proj.bank || 0) * Math.cos(wrapAngle(p.h - Math.atan2(p.proj.tx || 0, p.proj.tz || 1))) * (p.airborne ? 0 : 1));
      p.visual(v);
      m.animate(v, dt);
      // fade invulnerable bikes
      if (p.ghostT > 0) m.root.visible = Math.floor(p.ghostT * 10) % 2 === 0; else m.root.visible = true;
    }
  }

  _fx(dt) {
    const ef = this.effects;
    const dustCol = DUST[this.track.def.runoffMat] || DUST.gravel;
    const cam = this.game.engine.camera.position;
    for (const b of this.bikes) {
      const p = b.phys, m = b.model;
      const dist2 = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2;
      if (dist2 > 160 * 160) { ef.updateFlames(b, false, 0, dt); continue; }
      const rx = Math.cos(p.vh), rz = -Math.sin(p.vh);
      const rear = m.worldPoint([-m.wb / 2, 0.02, 0], ef._v);
      const sliding = !p.airborne && !p.crashed && (Math.abs(p.slip) > 0.1 || p.wheelspin > 0.25 || p.skid > 0.3);
      if (sliding && !p.offRoad) {
        const amt = clamp(Math.abs(p.slip) * 3 + p.wheelspin + p.skid, 0, 1.5);
        if (Math.random() < 0.6 * amt + 0.2) ef.tireSmoke(rear.x, rear.y, rear.z, Math.sin(p.vh) * p.v, Math.cos(p.vh) * p.v, clamp(amt, 0.3, 1));
        ef.skid(b.id + 'r', rear.x, rear.y, rear.z, rx, rz);
      } else ef.skidBreak(b.id + 'r');
      if (p.skid > 0.35 && !p.offRoad && !p.airborne) {
        const front = m.worldPoint([m.wb / 2, 0.02, 0], ef._w);
        ef.skid(b.id + 'f', front.x, front.y, front.z, rx, rz, 0.06);
      } else ef.skidBreak(b.id + 'f');
      if (p.offRoad && p.v > 4 && !p.airborne) {
        const n = clamp(p.v / 20, 0.2, 1.5);
        if (Math.random() < n) ef.dust(rear.x, rear.y, rear.z, Math.sin(p.vh) * p.v, Math.cos(p.vh) * p.v, dustCol, clamp(n, 0.4, 1));
      }
      if (this.env.wet && p.v > 12 && !p.offRoad && Math.random() < clamp(p.v / 50, 0, 0.9)) ef.spray(rear.x, rear.y, rear.z, Math.sin(p.vh) * p.v * -0.1, Math.cos(p.vh) * p.v * -0.1, clamp(p.v / 60, 0.3, 1));
      // exhaust idle puffs & overrun pops
      b.popT -= dt;
      const decel = p.input.throttle < 0.05 && p.rpm > p.redline * 0.55 && !p.electric;
      if (decel && Math.random() < 0.03) b.popT = 0.06;
      ef.updateFlames(b, p.nitroOn, b.popT, dt);
      if (!p.electric && m.exhausts.length && Math.random() < 0.08) {
        const e = m.exhausts[0];
        const wp = m.worldPoint(e.pos, ef._w);
        ef.exhaustPuff(wp.x, wp.y, wp.z, 0, 0.2, 0, b.popT > 0);
      }
    }
  }

  _audio(dt) {
    if (!Audio.ready) return;
    const cam = this.game.engine.camera;
    Audio.setListener(cam);
    const P = this.player, p = P.phys;
    if (this.playerVoice) {
      const inside = this.cam.mode >= 2;
      this.playerVoice.vol = inside ? 1.1 : 0.85;
      this.playerVoice.set(p.rpm, p.input.throttle, { limiter: p.limiter > 0, decel: p.input.throttle < 0.05 && p.v > 8 });
    }
    Audio.layers({
      speed: p.v, slip: (Math.abs(p.slip) > 0.1 || p.skid > 0.3 || p.wheelspin > 0.3) && !p.offRoad && !p.airborne ? clamp(Math.abs(p.slip) * 2 + p.skid + p.wheelspin * 0.6, 0, 1) : 0,
      scrape: this._scrape || 0, rumble: (p.offRoad ? clamp(p.v / 25, 0, 1) : 0) + (p.onCurb ? 0.5 : 0),
    });
    this._scrape = Math.max(0, (this._scrape || 0) - dt * 6);
    // nearest AI voices with doppler
    this._voiceT = (this._voiceT || 0) - dt;
    if (this._voiceT <= 0) {
      this._voiceT = 0.35;
      const near = this.bikes.filter((b) => !b.isPlayer).map((b) => [b, (b.phys.x - cam.position.x) ** 2 + (b.phys.z - cam.position.z) ** 2])
        .filter(([, d]) => d < 140 * 140).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([b]) => b);
      for (const [b, v] of this.voices) if (!near.includes(b)) { v.stop(); this.voices.delete(b); }
      for (const b of near) if (!this.voices.has(b)) this.voices.set(b, Audio.engine(b.spec, { positional: true, lite: true }));
    }
    const lv = this._lastCam || cam.position.clone();
    const lvx = (cam.position.x - lv.x) / Math.max(dt, 1e-3), lvz = (cam.position.z - lv.z) / Math.max(dt, 1e-3);
    this._lastCam = cam.position.clone();
    for (const [b, v] of this.voices) {
      const q = b.phys;
      v.setPosition(q.x, q.y + 0.6, q.z);
      const dx = q.x - cam.position.x, dz = q.z - cam.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const svx = Math.sin(q.vh) * q.v, svz = Math.cos(q.vh) * q.v;
      const vrel = ((svx - lvx) * dx + (svz - lvz) * dz) / d;
      const dopp = clamp(343 / (343 + vrel), 0.7, 1.4);
      v.vol = 0.9;
      v.set(q.rpm, q.input.throttle, { dopp, limiter: q.limiter > 0 });
    }
  }

  _postFx(dt) {
    const fx = this.game.engine.fx;
    if (!fx) return;
    const p = this.player.phys;
    const blurOn = Save.settings.motionBlur;
    const sp = clamp((p.v - 35) / 55, 0, 1);
    const target = blurOn ? sp * 0.45 + (p.nitroOn ? 0.55 : 0) : 0;
    fx.uBlur.value = damp(fx.uBlur.value, this.phase === 'race' || this.phase === 'finished' ? target : 0, 4, dt);
    fx.uCA.value = 0.0012 + (p.nitroOn ? 0.004 : 0);
    fx.uTint.value.setRGB(0.75, 0.9, 1.25);
    fx.uTintAmt.value = damp(fx.uTintAmt.value, p.nitroOn ? 0.25 : 0, 5, dt);
    this._damage = Math.max(0, (this._damage || 0) - dt * 1.5);
    fx.uDamage.value = this._damage * 0.35;
    fx.uFlash.value = Math.max(0, fx.uFlash.value - dt * 3);
    fx.uVignette.value = 0.18 + sp * 0.1;
    const W = this.ts.env.W;
    const drops = (W.drops || 0) * (this.cam.mode === 3 ? 0.6 : 1);
    fx.uRain.value = damp(fx.uRain.value, drops * (this.phase === 'replay' ? 0.5 : 1), 1.5, dt);
    fx.uSpeed.value = clamp(p.v / 60, 0, 1);
    // cinematic look: filmic grade per time/weather, sun (moon at night) for shafts + lens glare
    const eng = this.game.engine, T = this.ts.env.T;
    eng.setGrade(this.def.time, this.ts.env.weather);
    if (T.night) eng.setSun(this._moonDir || (this._moonDir = new THREE.Vector3().setFromSphericalCoords(1, 55 * Math.PI / 180, (T.sunAzim + 40) * Math.PI / 180)), 0x9ab4ff, 0.4);
    else eng.setSun(this.ts.env.sunDir, T.sunColor, clamp(1 - (W.gray || 0) * 1.3, 0, 1));
    if (fx.uShimmer) fx.uShimmer.value = damp(fx.uShimmer.value, p.nitroOn && (this.phase === 'race' || this.phase === 'finished') ? 1 : 0, 5, dt);
  }

  // ------------------------------------------------------------------ ghost
  _ghostUpdate(dt) {
    const P = this.player;
    const lapT = this.time - P.lapStart;
    if (P.phys.lap >= 0) this.ghostRec.record(dt, P.phys);
    if (this.ghostData && P.phys.lap >= 0) {
      const g = GhostTrack.sample(this.ghostData, lapT, this._gs || (this._gs = {}));
      if (g && !g.done) {
        const m = this.ghostModel;
        m.root.visible = true;
        m.root.position.set(g.x, g.y, g.z);
        m.root.rotation.set(0, g.h, 0);
        m.animate({ speed: g.speed, lean: g.lean, pitch: g.pitch, steerAngle: g.steerAngle }, dt);
        this.ghostPos = g;
        // delta: compare progress
        const gp = this.track.project(g.x, g.z, this._ghint ?? -1, this._gproj || (this._gproj = {}));
        this._ghint = gp.i;
        let ds = gp.s - P.phys.s;
        if (ds > this.track.L / 2) ds -= this.track.L;
        if (ds < -this.track.L / 2) ds += this.track.L;
        this.ghostDelta = ds / Math.max(10, P.phys.v);
      } else { this.ghostModel.root.visible = false; this.ghostPos = null; this.ghostDelta = null; }
    }
  }

  _ghostLapDone(lt) {
    const def = this.track.def;
    const arr = this.ghostRec.toArray();
    this.ghostRec.reset();
    const saved = Save.data.ghosts[def.id];
    if (!saved || !saved.lap || lt < saved.lap) {
      Save.data.ghosts[def.id] = { bike: this.player.spec.id, lap: lt, data: GhostTrack.encode(arr) };
      Save.save();
      this.ghostData = arr;
      if (!this.ghostSpec || this.ghostSpec.id !== this.player.spec.id) { this.ghostSpec = this.player.spec; this._makeGhostModel(this.player.spec); }
      this.hud.toast('NUEVO FANTASMA GUARDADO', '#40e0ff', 1600);
    }
  }

  // ------------------------------------------------------------------ results
  _toResults() {
    if (this.phase === 'results') return;
    this.phase = 'results';
    // estimate finish times for bikes still running
    const avg = this.player.finishTime / Math.max(1, this.laps * this.track.L);
    for (const b of this.order) {
      if (b.finished) continue;
      const remain = this.laps * this.track.L - b.phys.dist;
      b.finished = true; b.estimated = true;
      b.finishTime = this.time + remain * avg * (1.02 + Math.random() * 0.03);
    }
    this.order.sort((a, b) => a.finishTime - b.finishTime);
    const results = this.order.map((b, i) => ({
      pos: i + 1, bikeId: b.spec.id, name: b.spec.name, short: b.spec.short, color: b.color, livery: b.livery,
      time: b.finishTime, best: b.bestLap, player: b.isPlayer, points: POINTS[i] || 0,
    }));
    this.hud.setVisible(false);
    this.silence();
    this.game.onRaceFinished(this, results);
  }

  togglePause() {
    if (this.phase === 'results' || this.phase === 'replay') return;
    this.paused = !this.paused;
    if (this.paused) { this.silence(); this.game.ui.pauseMenu(this); } else { this.game.ui.closeModal(); if (this.playerVoice) this.playerVoice.fade(0.4); }
  }

  silence() {
    if (this.playerVoice) this.playerVoice.fade(0, 0.2);
    for (const [, v] of this.voices || []) v.fade(0, 0.2);
    Audio.silenceLayers();
  }

  // ------------------------------------------------------------------ replay
  startReplay() {
    this.phase = 'replay';
    this.replayT = 0;
    this.cam.set(4);
    this.replayCamT = 0;
    this.replayFocus = this.player;
    this.hud.setVisible(false);
    for (const b of this.bikes) b.model.root.visible = true;
    if (this.ghostModel) this.ghostModel.root.visible = false;
    if (this.playerVoice) this.playerVoice.fade(0.5);
  }

  _replayUpdate(dt) {
    const rec = this.recorder;
    this.replayT += dt;
    if (this.replayT > rec.duration) this.replayT = 0;
    const tmp = this._rs || (this._rs = {});
    this.bikes.forEach((b, i) => {
      const s = rec.sample(i, this.replayT, tmp);
      const m = b.model;
      m.root.position.set(s.x, s.y, s.z);
      m.root.rotation.set(0, s.h, 0);
      m.animate({ speed: s.speed, lean: s.lean, pitch: s.pitch, steerAngle: s.steerAngle, compF: s.compF, compR: s.compR, braking: s.braking }, dt);
      // feed camera/audio with a fake phys snapshot
      const p = b.phys;
      p.x = s.x; p.y = s.y; p.z = s.z; p.h = p.vh = s.h; p.v = s.speed; p.lean = s.lean; p.rpm = s.rpm; p.input.throttle = s.throttle;
      p.nitroOn = s.nitro; p.s = s.s; p.crashed = s.crashed; p.slip = 0; p.airborne = false;
      this.effects.updateFlames(b, s.nitro, 0, dt);
    });
    // camera director: alternate TV / chase / onboard every few seconds
    this.replayCamT += dt;
    if (this.replayCamT > 5) {
      this.replayCamT = 0;
      const modes = [4, 0, 2, 4, 1, 3];
      this._rcm = ((this._rcm || 0) + 1) % modes.length;
      this.cam.set(modes[this._rcm]);
      if (Math.random() < 0.3) this.replayFocus = this.bikes[Math.floor(Math.random() * this.bikes.length)];
      else this.replayFocus = this.player;
    }
    this.cam.update(dt, this.replayFocus, {});
    this._audio(dt);
    this.ts.update(dt, this.game.engine.camera, this.replayFocus.model.root.position);
    this.effects.update(dt, this.game.engine.camera, this.game.engine.renderer, this.scene.fog);
    this.glow.update(dt, this.game.engine.camera);
    const fx = this.game.engine.fx;
    if (fx) { fx.uBlur.value = 0; fx.uTintAmt.value = 0.12; fx.uTint.value.setRGB(1.05, 1, 0.92); fx.uDamage.value = 0; }
  }

  stopReplay() { this.phase = 'results'; this.silence(); }

  dispose() {
    this.silence();
    if (this.playerVoice) this.playerVoice.stop();
    for (const [, v] of this.voices || []) v.stop();
    this.voices?.clear();
    this.speedFx?.dispose();
    this.hud?.dispose();
    this.glow?.dispose();
    this.effects?.dispose();
    for (const b of this.bikes) b.model.dispose();
    this.ghostModel?.dispose();
    this.ts?.dispose();
    const fx = this.game.engine.fx;
    if (fx) { fx.uBlur.value = 0; fx.uTintAmt.value = 0; fx.uDamage.value = 0; fx.uFlash.value = 0; fx.uRain.value = 0; }
  }
}
