// Procedural audio: synthesized engines (per engine type), SFX and synthwave music.
import { Save } from './Settings.js';
import { clamp } from './utils.js';

const PROFILES = {
  i4: { cyl: 4, stroke: 4, wave: 'sawtooth', sub: 0.25, am: 0.04, amDiv: 1, cutoff: 1800, cutoffRpm: 5200, dist: 18, noise: 0.18, gain: 0.55, harm2: 0.35, decelPops: 0.5 },
  v4: { cyl: 4, stroke: 4, wave: 'sawtooth', sub: 0.5, am: 0.22, amDiv: 2, cutoff: 1300, cutoffRpm: 4200, dist: 26, noise: 0.22, gain: 0.6, harm2: 0.3, decelPops: 1 },
  i3: { cyl: 3, stroke: 4, wave: 'sawtooth', sub: 0.45, am: 0.12, amDiv: 1.5, cutoff: 1200, cutoffRpm: 4200, dist: 22, noise: 0.2, gain: 0.6, harm2: 0.25, decelPops: 1 },
  vtwin: { cyl: 2, stroke: 4, wave: 'sawtooth', sub: 0.9, am: 0.55, amDiv: 2, cutoff: 380, cutoffRpm: 1800, dist: 40, noise: 0.25, gain: 0.8, harm2: 0.15, decelPops: 0.7 },
  vtwin2: { cyl: 2, stroke: 4, wave: 'square', sub: 1.0, am: 0.6, amDiv: 2, cutoff: 320, cutoffRpm: 1500, dist: 48, noise: 0.28, gain: 0.75, harm2: 0.1, decelPops: 1.2 },
  twin: { cyl: 2, stroke: 4, wave: 'sawtooth', sub: 0.6, am: 0.3, amDiv: 1, cutoff: 650, cutoffRpm: 2600, dist: 30, noise: 0.22, gain: 0.65, harm2: 0.2, decelPops: 0.9 },
  single: { cyl: 1, stroke: 4, wave: 'square', sub: 0.4, am: 0.45, amDiv: 1, cutoff: 700, cutoffRpm: 2600, dist: 34, noise: 0.3, gain: 0.6, harm2: 0.3, decelPops: 1 },
  singleBig: { cyl: 1, stroke: 4, wave: 'square', sub: 0.7, am: 0.5, amDiv: 1, cutoff: 520, cutoffRpm: 2200, dist: 40, noise: 0.3, gain: 0.65, harm2: 0.2, decelPops: 1.3 },
  boxer: { cyl: 2, stroke: 4, wave: 'sawtooth', sub: 0.55, am: 0.2, amDiv: 1, cutoff: 600, cutoffRpm: 2600, dist: 28, noise: 0.22, gain: 0.62, harm2: 0.2, decelPops: 0.6 },
  muscle: { cyl: 4, stroke: 4, wave: 'sawtooth', sub: 0.8, am: 0.3, amDiv: 2, cutoff: 700, cutoffRpm: 2600, dist: 42, noise: 0.25, gain: 0.7, harm2: 0.2, decelPops: 1 },
  twoStroke: { cyl: 4, stroke: 2, wave: 'square', sub: 0.15, am: 0.1, amDiv: 4, cutoff: 1500, cutoffRpm: 5200, dist: 30, noise: 0.35, gain: 0.45, harm2: 0.4, decelPops: 0.3, pipe: true },
  electric: { electric: true, gain: 0.5 },
};

let noiseBuf = null;
function makeCurve(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
  return c;
}

class EngineVoice {
  constructor(sys, spec, { positional = false, lite = false } = {}) {
    const ctx = sys.ctx;
    this.sys = sys;
    this.ctx = ctx;
    this.spec = spec;
    this.p = PROFILES[spec.engine.sound] || PROFILES.i4;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    if (positional) {
      this.panner = ctx.createPanner();
      Object.assign(this.panner, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 5, maxDistance: 400, rolloffFactor: 1.3 });
      this.out.connect(this.panner);
      this.panner.connect(sys.sfx);
    } else this.out.connect(sys.sfx);
    const p = this.p;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 2.5;
    this.filter.connect(this.out);
    if (p.electric) {
      this.o1 = ctx.createOscillator(); this.o1.type = 'sine';
      this.o2 = ctx.createOscillator(); this.o2.type = 'triangle';
      this.g1 = ctx.createGain(); this.g2 = ctx.createGain();
      this.g1.gain.value = 0.6; this.g2.gain.value = 0.25;
      this.o1.connect(this.g1).connect(this.filter);
      this.o2.connect(this.g2).connect(this.filter);
      this.filter.frequency.value = 4000;
      if (!lite) {
        this.o3 = ctx.createOscillator(); this.o3.type = 'sine';
        this.g3 = ctx.createGain(); this.g3.gain.value = 0.08;
        this.o3.connect(this.g3).connect(this.out);
        this.o3.start();
      }
      this.o1.start(); this.o2.start();
    } else {
      this.shaper = ctx.createWaveShaper();
      this.shaper.curve = makeCurve(p.dist);
      this.shaper.oversample = lite ? 'none' : '2x';
      this.pre = ctx.createGain();
      this.pre.gain.value = 0.5;
      this.am = ctx.createGain();
      this.am.gain.value = 1;
      this.pre.connect(this.shaper).connect(this.am).connect(this.filter);
      this.o1 = ctx.createOscillator(); this.o1.type = p.wave;
      this.g1 = ctx.createGain(); this.g1.gain.value = 0.6;
      this.o1.connect(this.g1).connect(this.pre);
      this.o2 = ctx.createOscillator(); this.o2.type = 'square';
      this.g2 = ctx.createGain(); this.g2.gain.value = p.sub * 0.5;
      this.o2.connect(this.g2).connect(this.pre);
      if (!lite) {
        this.o3 = ctx.createOscillator(); this.o3.type = 'sawtooth';
        this.g3 = ctx.createGain(); this.g3.gain.value = p.harm2 * 0.4;
        this.o3.connect(this.g3).connect(this.pre);
        this.o3.start();
        // AM "lope"
        this.lfo = ctx.createOscillator(); this.lfo.type = 'sine';
        this.lfoGain = ctx.createGain(); this.lfoGain.gain.value = p.am;
        this.lfo.connect(this.lfoGain).connect(this.am.gain);
        this.lfo.start();
        // intake/exhaust noise
        this.ns = ctx.createBufferSource(); this.ns.buffer = sys.noise; this.ns.loop = true;
        this.nf = ctx.createBiquadFilter(); this.nf.type = 'bandpass'; this.nf.Q.value = 1.2;
        this.ng = ctx.createGain(); this.ng.gain.value = 0;
        this.ns.connect(this.nf).connect(this.ng).connect(this.filter);
        this.ns.start();
        if (p.pipe) {
          this.pipe = ctx.createBiquadFilter(); this.pipe.type = 'peaking'; this.pipe.Q.value = 3; this.pipe.gain.value = 0;
          this.filter.disconnect(); this.filter.connect(this.pipe).connect(this.out);
        }
      }
      this.o1.start(); this.o2.start();
    }
    this.popT = 0;
    this.vol = 1;
  }

  set(rpm, throttle, { limiter = false, dopp = 1, load = 1, decel = false } = {}) {
    const t = this.ctx.currentTime;
    const p = this.p;
    const tc = 0.025;
    if (p.electric) {
      const f = Math.max(20, (rpm / 60) * 6) * dopp;
      this.o1.frequency.setTargetAtTime(f, t, tc);
      this.o2.frequency.setTargetAtTime(f * 2.01, t, tc);
      if (this.o3) this.o3.frequency.setTargetAtTime(f * 7.3, t, tc);
      const v = clamp(rpm / 9000, 0, 1);
      this.out.gain.setTargetAtTime(p.gain * this.vol * (0.08 + v * 0.5 + throttle * 0.35), t, 0.05);
      this.filter.frequency.setTargetAtTime(1200 + v * 5000 + throttle * 1500, t, 0.05);
      return;
    }
    const fire = (rpm / 60) * (p.cyl / (p.stroke === 2 ? 1 : 2)) * dopp;
    this.o1.frequency.setTargetAtTime(fire, t, tc);
    this.o2.frequency.setTargetAtTime(fire * 0.5, t, tc);
    if (this.o3) this.o3.frequency.setTargetAtTime(fire * 2, t, tc);
    if (this.lfo) this.lfo.frequency.setTargetAtTime(Math.max(2, fire / p.amDiv / (p.cyl > 1 ? p.cyl / 2 : 1)), t, tc);
    const r = clamp(rpm / (this.spec.engine.redline || 10000), 0, 1);
    const cut = p.cutoff + p.cutoffRpm * r * (0.5 + throttle * 0.7);
    this.filter.frequency.setTargetAtTime(cut, t, tc);
    this.pre.gain.setTargetAtTime(0.25 + throttle * 0.75 * load, t, 0.04);
    if (this.ng) {
      this.nf.frequency.setTargetAtTime(fire * 3, t, tc);
      this.ng.gain.setTargetAtTime(p.noise * (0.2 + throttle * 0.8), t, 0.05);
    }
    if (this.pipe) {
      const on = clamp((r - 0.6) * 4, 0, 1) * throttle;
      this.pipe.frequency.setTargetAtTime(fire * 1.5, t, tc);
      this.pipe.gain.setTargetAtTime(on * 14, t, 0.05);
    }
    let g = p.gain * this.vol * (0.35 + throttle * 0.45 + r * 0.35);
    if (limiter) g *= 0.55 + Math.random() * 0.45;
    this.out.gain.setTargetAtTime(g, t, 0.03);
    // overrun pops & crackles
    if (decel && r > 0.45 && Math.random() < 0.06 * p.decelPops) this.sys.pop(this.panner ? this.out : null, 0.5 + Math.random() * 0.5);
  }

  setPosition(x, y, z) {
    if (!this.panner) return;
    const t = this.ctx.currentTime;
    if (this.panner.positionX) {
      this.panner.positionX.setTargetAtTime(x, t, 0.02); this.panner.positionY.setTargetAtTime(y, t, 0.02); this.panner.positionZ.setTargetAtTime(z, t, 0.02);
    } else this.panner.setPosition(x, y, z);
  }

  fade(to, time = 0.3) { this.out.gain.setTargetAtTime(to, this.ctx.currentTime, time / 3); }

  stop() {
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => {
      for (const o of [this.o1, this.o2, this.o3, this.lfo, this.ns]) { try { o && o.stop(); } catch (e) { /* noop */ } }
      try { (this.panner || this.out).disconnect(); } catch (e) { /* noop */ }
    }, 300);
  }
}

// ---------------------------------------------------------------- music
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const SONGS = {
  menu: { bpm: 100, prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], progB: [[50, 53, 57], [53, 57, 60], [55, 59, 62], [52, 56, 59]], drums: 'half' },
  race: { bpm: 126, prog: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]], progB: [[50, 53, 57], [48, 52, 55], [53, 57, 60], [52, 56, 59]], drums: 'four' },
  podium: { bpm: 112, prog: [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]], progB: [[53, 57, 60], [55, 59, 62], [48, 52, 55], [55, 59, 62]], drums: 'four' },
};

class Music {
  constructor(sys) {
    this.sys = sys; this.ctx = sys.ctx;
    this.out = this.ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(sys.music);
    // shared delay for arps
    this.delay = this.ctx.createDelay(1);
    this.fb = this.ctx.createGain(); this.fb.gain.value = 0.35;
    this.delay.connect(this.fb).connect(this.delay);
    this.delayOut = this.ctx.createGain(); this.delayOut.gain.value = 0.4;
    this.delay.connect(this.delayOut).connect(this.out);
    this.song = null; this.timer = null;
  }

  play(name) {
    if (this.songName === name) return;
    this.songName = name;
    this.song = SONGS[name];
    this.step = 0;
    this.next = this.ctx.currentTime + 0.1;
    this.delay.delayTime.value = (60 / this.song.bpm) * 0.75;
    this.out.gain.cancelScheduledValues(this.ctx.currentTime);
    this.out.gain.setTargetAtTime(name === 'race' ? 0.5 : 0.85, this.ctx.currentTime, 0.6);
    if (!this.timer) this.timer = setInterval(() => this._tick(), 30);
  }

  stop() {
    this.songName = null;
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    setTimeout(() => { if (!this.songName) { clearInterval(this.timer); this.timer = null; } }, 1600);
  }

  _tick() {
    if (!this.song) return;
    const spb = 60 / this.song.bpm / 4; // 16th
    while (this.next < this.ctx.currentTime + 0.15) {
      this._schedule(this.step, this.next, spb);
      this.next += spb;
      this.step++;
    }
  }

  _schedule(step, t, spb) {
    const s = this.song;
    const bar = Math.floor(step / 16), pos = step % 16;
    const section = Math.floor(bar / 8) % 2;
    const prog = section ? s.progB : s.prog;
    const chord = prog[bar % 4];
    // drums
    if (s.drums === 'four' ? pos % 4 === 0 : (pos === 0 || pos === 10)) this._kick(t);
    if (pos === 4 || pos === 12) this._snare(t);
    if (pos % 2 === 0) this._hat(t, pos % 4 === 2 ? 0.08 : 0.04);
    // bass: 8ths on root
    if (pos % 2 === 0) this._bass(t, NOTE(chord[0] - 24 + (pos === 14 ? 12 : 0)), spb * 1.8);
    // pad at bar start
    if (pos === 0) this._pad(t, chord, spb * 16);
    // arp
    const arp = [0, 1, 2, 1, 0, 2, 1, 2];
    if (bar % 8 >= 2) this._pluck(t, NOTE(chord[arp[pos % 8]] + 12 + (pos > 7 ? 12 : 0)), spb);
    // lead hook every 4 bars in section B
    if (section && pos % 4 === 0 && bar % 2 === 1) this._lead(t, NOTE(chord[(pos / 4) % 3] + 24), spb * 3);
  }

  _env(g, t, a, peak, d, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + d);
  }
  _kick(t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this._env(g, t, 0.003, 0.9, 0.3);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.35);
  }
  _snare(t) {
    const n = this.ctx.createBufferSource(); n.buffer = this.sys.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500;
    const g = this.ctx.createGain(); this._env(g, t, 0.002, 0.35, 0.18);
    n.connect(f).connect(g).connect(this.out); n.start(t, Math.random()); n.stop(t + 0.22);
    const o = this.ctx.createOscillator(), og = this.ctx.createGain(); o.frequency.value = 190;
    this._env(og, t, 0.002, 0.25, 0.08); o.connect(og).connect(this.out); o.start(t); o.stop(t + 0.1);
  }
  _hat(t, v) {
    const n = this.ctx.createBufferSource(); n.buffer = this.sys.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = this.ctx.createGain(); this._env(g, t, 0.001, v, 0.04);
    n.connect(f).connect(g).connect(this.out); n.start(t, Math.random()); n.stop(t + 0.06);
  }
  _bass(t, f0, dur) {
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f0;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = this.ctx.createGain(); this._env(g, t, 0.005, 0.22, dur);
    o.connect(f).connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }
  _pad(t, chord, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.6); g.gain.setValueAtTime(0.06, t + dur - 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    f.connect(g).connect(this.out);
    for (const n of chord) for (const det of [-7, 7]) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
  }
  _pluck(t, f0, dur) {
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = f0;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.15);
    const g = this.ctx.createGain(); this._env(g, t, 0.002, 0.07, 0.18);
    o.connect(f).connect(g); g.connect(this.out); g.connect(this.delay);
    o.start(t); o.stop(t + 0.25);
  }
  _lead(t, f0, dur) {
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f0;
    const v = this.ctx.createOscillator(); v.frequency.value = 5.5; const vg = this.ctx.createGain(); vg.gain.value = 6;
    v.connect(vg).connect(o.detune);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
    const g = this.ctx.createGain(); this._env(g, t, 0.03, 0.06, dur);
    o.connect(f).connect(g); g.connect(this.out); g.connect(this.delay);
    o.start(t); v.start(t); o.stop(t + dur + 0.1); v.stop(t + dur + 0.1);
  }
}

// ---------------------------------------------------------------- system
class AudioSystem {
  constructor() { this.ctx = null; this.ready = false; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.connect(this.master);
    this.ui = ctx.createGain(); this.ui.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = this.noise;
    this.musicPlayer = new Music(this);
    this.applyVolumes();
    this.ready = true;
    // continuous layers: wind + tyre screech + scrape
    this.wind = this._loopNoise('bandpass', 600, 0.6);
    this.screech = this._loopNoise('bandpass', 1900, 6);
    this.scrapeV = this._loopNoise('highpass', 3500, 0.7);
    this.rumble = this._loopNoise('lowpass', 160, 1);
    if (this._pendingMusic) { this.playMusic(this._pendingMusic); this._pendingMusic = null; }
  }

  _loopNoise(type, freq, q) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(this.sfx);
    src.start(0, Math.random() * 1.5);
    return { src, f, g };
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = Save.settings;
    this.master.gain.value = s.masterVol;
    this.music.gain.value = s.musicVol * 0.55;
    this.sfx.gain.value = s.sfxVol;
    this.ui.gain.value = s.sfxVol * 0.7;
  }

  engine(spec, opts) { return this.ctx ? new EngineVoice(this, spec, opts) : null; }

  setListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener, t = this.ctx.currentTime;
    const p = cam.position;
    const f = cam.getWorldDirection(this._fwd || (this._fwd = cam.position.clone()));
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(0, t, 0.02); l.upY.setTargetAtTime(1, t, 0.02); l.upZ.setTargetAtTime(0, t, 0.02);
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
  }

  layers({ speed = 0, slip = 0, scrape = 0, rumble = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const w = clamp(speed / 90, 0, 1);
    this.wind.g.gain.setTargetAtTime(w * w * 0.35, t, 0.1);
    this.wind.f.frequency.setTargetAtTime(400 + w * 1600, t, 0.1);
    this.screech.g.gain.setTargetAtTime(clamp(slip, 0, 1) * 0.22, t, 0.04);
    this.screech.f.frequency.setTargetAtTime(1500 + Math.random() * 600, t, 0.05);
    this.scrapeV.g.gain.setTargetAtTime(clamp(scrape, 0, 1) * 0.3, t, 0.03);
    this.rumble.g.gain.setTargetAtTime(clamp(rumble, 0, 1) * 0.5, t, 0.05);
  }

  silenceLayers() { this.layers({}); }

  // ---- one-shots
  _blip(freq, dur, type = 'sine', vol = 0.2, dest = this.ui, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  _noiseHit(type, freq, dur, vol, dest = this.sfx, q = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(dest); n.start(t, Math.random()); n.stop(t + dur + 0.02);
  }
  hover() { this._blip(1800, 0.04, 'sine', 0.05); }
  click() { this._blip(900, 0.07, 'triangle', 0.14); this._blip(1350, 0.06, 'sine', 0.06); }
  back() { this._blip(600, 0.09, 'triangle', 0.12, this.ui, 0.6); }
  select() { this._blip(660, 0.12, 'square', 0.06); setTimeout(() => this._blip(990, 0.18, 'square', 0.06), 70); }
  beep(high = false) { this._blip(high ? 1320 : 660, high ? 0.6 : 0.25, 'square', 0.12, this.sfx); }
  lap() { [880, 1108, 1318].forEach((f, i) => setTimeout(() => this._blip(f, 0.2, 'triangle', 0.12, this.sfx), i * 90)); }
  fanfare() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => setTimeout(() => this._blip(f, 0.3, 'square', 0.08, this.sfx), i * 140)); }
  warn() { this._blip(440, 0.2, 'sawtooth', 0.08, this.sfx); setTimeout(() => this._blip(440, 0.2, 'sawtooth', 0.08, this.sfx), 260); }
  impact(s = 1) {
    this._noiseHit('lowpass', 400, 0.35, 0.6 * clamp(s, 0.2, 1.5));
    this._blip(90, 0.25, 'sine', 0.5 * clamp(s, 0.2, 1.2), this.sfx, 0.5);
    this._noiseHit('bandpass', 2500, 0.2, 0.25 * s, this.sfx, 2);
  }
  crash() { this.impact(1.4); setTimeout(() => this._noiseHit('highpass', 3000, 0.9, 0.35), 80); setTimeout(() => this.impact(0.8), 300); }
  shiftClunk() { this._noiseHit('bandpass', 300, 0.05, 0.12, this.sfx, 3); }
  pop(dest, s = 1) {
    if (!this.ctx) return;
    this._noiseHit('bandpass', 900 + Math.random() * 900, 0.06, 0.35 * s, dest || this.sfx, 1.5);
  }
  nitro() { this._noiseHit('bandpass', 1200, 0.8, 0.3, this.sfx, 0.8); this._blip(200, 0.6, 'sawtooth', 0.08, this.sfx, 3); }
  thunder() {
    if (!this.ctx) return;
    this._noiseHit('lowpass', 220, 3.5, 0.9, this.sfx, 0.7);
    setTimeout(() => this._noiseHit('lowpass', 120, 2.5, 0.7, this.sfx, 0.5), 300);
  }
  whoosh() { this._noiseHit('bandpass', 800, 0.4, 0.2, this.sfx, 0.7); }

  playMusic(name) {
    if (!this.ctx) { this._pendingMusic = name; return; }
    this.musicPlayer.play(name);
  }
  stopMusic() { if (this.musicPlayer) this.musicPlayer.stop(); }
}

export const Audio = new AudioSystem();
void noiseBuf;
