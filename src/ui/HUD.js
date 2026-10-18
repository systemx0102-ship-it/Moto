// In-race heads-up display: position, laps/times, standings tower, minimap with
// the route ahead, tachometer/speedometer with nitro ring, lean-angle meter,
// drift-hold prompt, corner boards and messages.
import { h, canvas } from './dom.js';
import { clamp, formatTime, formatGap } from '../core/utils.js';
import { Save } from '../core/Settings.js';
import { Input } from '../core/Input.js';
import { GUIDE_CSS } from '../game/RacingLine.js';

const TAU = Math.PI * 2;

export class HUD {
  constructor(root, race) {
    this.race = race;
    this.root = h('div', { class: 'hud screen show' });
    root.appendChild(this.root);
    this.el = {};
    const E = this.el;
    E.posV = h('div', { class: 'v p' }, '1');
    E.lapV = h('div', { class: 'v' }, '1');
    E.posBlk = h('div', { class: 'blk' }, h('div', { class: 'k' }, 'POS'), E.posV);
    E.pos = h('div', { class: 'hud-pos hud-panel' }, E.posBlk, h('div', { class: 'blk' }, h('div', { class: 'k' }, 'VUELTA'), E.lapV));
    E.laps = h('div', { class: 'hud-laps hud-panel' }, h('div', { class: 'times' }));
    E.tower = h('div', { class: 'hud-tower' });
    E.mapC = canvas(270, 270, 'hud-map');
    E.gaugeC = canvas(340, 150, 'hud-gauge');
    E.leanC = canvas(200, 110, 'hud-lean');
    E.lights = h('div', { class: 'hud-lights off' }, ...Array.from({ length: 5 }, () => h('i', {})));
    E.center = h('div', { class: 'hud-center' });
    E.cam = h('div', { class: 'hud-cam' }, '');
    E.fps = h('div', { class: 'hud-fps' }, '');
    E.ghost = h('div', { class: 'hud-ghost' }, '');
    // drift-hold prompt (right-centre)
    E.driftK = h('div', { class: 'k' }, 'Mantén el derrape');
    E.driftV = h('b', {}, '0.00');
    E.driftAK = h('span', {}, 'Ángulo');
    E.driftA = h('b', {}, '0°');
    E.driftX = h('span', { class: 'x' }, '');
    E.driftBar = h('i', {});
    E.drift = h('div', { class: 'hud-drift' }, E.driftK, h('div', { class: 't' }, E.driftV, h('small', {}, 's')),
      h('div', { class: 'a' }, h('span', {}, E.driftAK, ' ', E.driftA), E.driftX), h('div', { class: 'bar' }, E.driftBar));
    // corner board: chevrons toward the bend + distance to turn-in
    E.cornerSign = h('div', { class: 'sign' }, h('i', {}), h('i', {}), h('i', {}));
    E.cornerD = h('div', { class: 'd' }, '');
    E.cornerV = h('div', { class: 's' }, '');
    E.corner = h('div', { class: 'hud-corner' }, E.cornerSign, E.cornerD, E.cornerV);
    this.root.append(E.pos, E.laps, E.tower, E.mapC, E.gaugeC, E.leanC, E.lights, E.center, E.cam, E.fps, E.ghost, E.drift, E.corner);
    this._drifting = false; this._driftDoneT = 0; this._dMax = 0; this._dN0 = 0;
    this._cornerOn = null; this._cornerCls = ''; this._cornerTxt = '';
    this.rows = new Map();
    this._msgT = 0; this._toastT = 0;
    this.maxLean = 0;
    this._buildMap();
    if (Save.settings.touch) this._touch(root);
  }

  setVisible(v) { this.root.style.display = v ? '' : 'none'; if (this.touchEl) this.touchEl.style.display = v ? '' : 'none'; }

  // ------------------------------------------------------------ minimap
  _buildMap() {
    const t = this.race.track;
    const { x, z, N } = t.c;
    const b = t.bounds;
    const c = this.el.mapC;
    const S = c.width;
    const pad = S * 0.1;
    const sc = (S - pad * 2) / b.size;
    this.mapT = (px, pz) => [S / 2 + (px - b.cx) * sc * -1, S / 2 + (pz - b.cz) * sc * -1];
    this.mapK = { cx: b.cx, cz: b.cz, sc, h: S / 2 }; // same transform, allocation-free
    // x is mirrored so the map matches the driver's left/right when heading +z (up)
    const off = document.createElement('canvas');
    off.width = S; off.height = S;
    const g = off.getContext('2d');
    g.lineCap = 'round'; g.lineJoin = 'round';
    const path = new Path2D();
    for (let i = 0; i <= N; i += 2) {
      const [mx, my] = this.mapT(x[i % N], z[i % N]);
      if (i === 0) path.moveTo(mx, my); else path.lineTo(mx, my);
    }
    path.closePath();
    g.strokeStyle = 'rgba(10,11,13,0.6)'; g.lineWidth = S * 0.05; g.stroke(path);
    g.strokeStyle = 'rgba(243,244,246,0.92)'; g.lineWidth = S * 0.016; g.stroke(path);
    // start / finish line across the track
    const p0 = this.mapT(x[0], z[0]), p1 = this.mapT(x[4 % N], z[4 % N]);
    const a = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + Math.PI / 2;
    g.strokeStyle = '#e2231a'; g.lineWidth = S * 0.018;
    g.beginPath(); g.moveTo(p0[0] - Math.cos(a) * S * 0.035, p0[1] - Math.sin(a) * S * 0.035); g.lineTo(p0[0] + Math.cos(a) * S * 0.035, p0[1] + Math.sin(a) * S * 0.035); g.stroke();
    this.mapBase = off;
  }

  _drawMap(bikes, me) {
    const c = this.el.mapC, g = c.getContext('2d');
    const S = c.width;
    g.clearRect(0, 0, S, S);
    g.drawImage(this.mapBase, 0, 0);
    if (me && this.race.racingLine && !me.phys.crashed) this._drawRoute(g, S, me.phys, this.race.racingLine);
    for (const b of bikes) {
      if (b === me) continue;
      const [mx, my] = this.mapT(b.phys.x, b.phys.z);
      g.fillStyle = b.color;
      g.strokeStyle = 'rgba(10,11,13,0.9)'; g.lineWidth = S * 0.01;
      g.beginPath(); g.arc(mx, my, S * 0.022, 0, TAU); g.fill(); g.stroke();
    }
    if (this.race.ghostPos) {
      const [mx, my] = this.mapT(this.race.ghostPos.x, this.race.ghostPos.z);
      g.fillStyle = 'rgba(64,224,255,0.6)';
      g.beginPath(); g.arc(mx, my, S * 0.026, 0, TAU); g.fill();
    }
    if (me) {
      const [mx, my] = this.mapT(me.phys.x, me.phys.z);
      const a = me.phys.vh;
      g.save(); g.translate(mx, my); g.rotate(-a);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#e2231a'; g.lineWidth = S * 0.012;
      g.beginPath(); g.moveTo(0, -S * 0.046); g.lineTo(S * 0.032, S * 0.032); g.lineTo(0, S * 0.018); g.lineTo(-S * 0.032, S * 0.032); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }

  // Next ~400 m of the route as a thick line coloured like the painted chevrons
  // (blue = full throttle, amber = lift, red = brake), fading toward its end.
  _drawRoute(g, S, ph, rl) {
    const t = this.race.track, { x, z } = t.c, N = t.N, K = this.mapK;
    const step = 2, segs = Math.round(400 / (t.ds * step)), tail = Math.round(segs * 0.7);
    const i0 = ph.proj.i ?? 0, v = ph.v;
    const mx = (i) => K.h - (x[i] - K.cx) * K.sc, my = (i) => K.h - (z[i] - K.cz) * K.sc;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(10,11,13,0.78)'; g.lineWidth = S * 0.05;
    g.beginPath(); g.moveTo(mx(i0), my(i0));
    for (let n = 1; n <= tail; n++) { const i = (i0 + n * step) % N; g.lineTo(mx(i), my(i)); }
    g.stroke();
    g.lineWidth = S * 0.028;
    let bucket = -1;
    g.beginPath();
    for (let n = 0; n < segs; n++) {
      const i = (i0 + n * step) % N, j = (i + step) % N;
      const bk = Math.round(rl.level(j, v) * 8);
      if (n >= tail) {
        // fading tail: one short stroke per step
        if (bucket >= 0) { g.stroke(); bucket = -1; }
        g.globalAlpha = 1 - (n - tail) / (segs - tail);
        g.strokeStyle = GUIDE_CSS[bk];
        g.beginPath(); g.moveTo(mx(i), my(i)); g.lineTo(mx(j), my(j)); g.stroke();
        continue;
      }
      if (bk !== bucket) {
        if (bucket >= 0) g.stroke();
        g.strokeStyle = GUIDE_CSS[bk]; bucket = bk;
        g.beginPath(); g.moveTo(mx(i), my(i));
      }
      g.lineTo(mx(j), my(j));
    }
    if (bucket >= 0) g.stroke();
    g.globalAlpha = 1;
  }

  // ------------------------------------------------------------ drift prompt
  _drift(dt, ph) {
    const E = this.el;
    if (ph.drifting && !ph.crashed) {
      if (!this._drifting) {
        this._drifting = true; this._dMax = 0; this._dN0 = ph.nitro; this._driftDoneT = 0;
        E.drift.className = 'hud-drift on';
        E.driftK.textContent = 'Mantén el derrape'; E.driftAK.textContent = 'Ángulo'; E.driftX.textContent = '';
      }
      const ang = Math.abs(ph.slip) * 57.3;
      this._dMax = Math.max(this._dMax, ang);
      E.driftV.textContent = ph.driftT.toFixed(2);
      E.driftA.textContent = `${Math.round(ang)}°`;
      E.driftBar.style.transform = `scaleX(${clamp(ang / 45, 0, 1).toFixed(3)})`;
    } else if (this._drifting) {
      this._drifting = false;
      if (this._driftDoneT <= 0) E.drift.className = 'hud-drift';
    }
    if (this._driftDoneT > 0) { this._driftDoneT -= dt; if (this._driftDoneT <= 0) E.drift.className = 'hud-drift'; }
  }
  // a held drift (> 1 s) ended cleanly: short success flash with the result
  driftEnd(t) {
    const E = this.el, ph = this.race.player.phys;
    const gain = Math.round((ph.nitro - this._dN0) * 100);
    E.driftK.textContent = 'Derrape completado';
    E.driftV.textContent = t.toFixed(2);
    E.driftAK.textContent = 'Máx';
    E.driftA.textContent = `${Math.round(this._dMax)}°`;
    E.driftX.textContent = gain > 0 ? `+${gain}% nitro` : '';
    E.drift.className = 'hud-drift on done';
    this._driftDoneT = 1.4;
  }

  // ------------------------------------------------------------ corner board
  _corner(rl, ph, race) {
    const E = this.el;
    const nc = rl.nextCorner(ph.s), c = nc.c, d = nc.dist;
    const live = race.phase === 'race' && !ph.crashed && ph.wrongWayT < 0.5 && c && d < 320 && d > 6;
    // latch a corner once it calls for real braking, until its turn-in is reached
    if (!live) this._cornerOn = null;
    else if (this._cornerOn !== c && ph.v - c.v > 10 && c.drop > 8) { this._cornerOn = c; this._cornerHeavy = ph.v - c.v > 24; }
    const on = this._cornerOn === c && live;
    let cls = 'hud-corner';
    if (on) {
      cls += ` on ${c.dir > 0 ? 'l' : 'r'} n${c.n}${this._cornerHeavy ? '' : ' mid'}${d < 90 && ph.v - c.v > 14 ? ' urgent' : ''}`;
      const txt = `${Math.max(10, Math.round(d / 10) * 10)}`;
      if (txt !== this._cornerTxt) {
        this._cornerTxt = txt;
        E.cornerD.innerHTML = `${txt}<small>M</small>`;
        const mph = Save.settings.units === 'mph';
        E.cornerV.textContent = `${Math.round(c.v * (mph ? 2.23694 : 3.6))} ${mph ? 'MPH' : 'KM/H'}`;
      }
    }
    if (cls !== this._cornerCls) { this._cornerCls = cls; E.corner.className = cls; }
  }

  // ------------------------------------------------------------ dash
  // Digital cluster in the style of a factory race dash: segmented rev bar with
  // shift light, large speed readout, gear window and boost bar.
  _drawGauge(ph, spec) {
    const c = this.el.gaugeC, g = c.getContext('2d');
    const W = c.width, H = c.height, k = W / 340;
    const F = (w, px) => `${w} ${Math.round(px * k)}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,11,13,0.74)'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e2231a'; g.fillRect(0, 0, 3 * k, H);
    const electric = spec.engine.electric;
    const redline = ph.redline;
    const rpmF = clamp(ph.rpm / redline, 0, 1);
    // rev bar
    const x0 = 16 * k, x1 = W - 14 * k, y0 = 14 * k, bh = 13 * k, N = 36;
    const sw = (x1 - x0) / N;
    const shift = !electric && rpmF > 0.94;
    const blink = shift && (performance.now() % 160) < 80;
    for (let i = 0; i < N; i++) {
      const f = (i + 1) / N;
      const on = f <= rpmF + 1e-6;
      let col = 'rgba(255,255,255,0.1)';
      if (on) col = blink ? '#ffffff' : f > 0.9 ? '#e2231a' : f > 0.76 ? '#f0a020' : '#f3f4f6';
      g.fillStyle = col;
      g.fillRect(x0 + i * sw + 1 * k, y0, sw - 2 * k, bh);
    }
    // rpm scale under the bar
    if (!electric) {
      g.fillStyle = 'rgba(154,161,169,0.9)'; g.font = F(600, 11); g.textAlign = 'center'; g.textBaseline = 'top';
      const maxK = Math.floor(redline / 1000);
      const stepK = maxK > 12 ? 2 : 1;
      for (let kk = 0; kk <= maxK; kk += stepK) {
        const f = (kk * 1000) / redline;
        g.fillText(String(kk), x0 + (x1 - x0) * f, y0 + bh + 4 * k);
      }
    }
    // speed
    const mph = Save.settings.units === 'mph';
    const spd = Math.round(ph.v * (mph ? 2.23694 : 3.6));
    g.fillStyle = '#ffffff'; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    g.font = F(700, 70);
    g.fillText(String(spd), W - 96 * k, H - 30 * k);
    g.fillStyle = 'rgba(154,161,169,1)'; g.font = F(600, 14);
    g.textAlign = 'left';
    g.fillText(mph ? 'MPH' : 'KM/H', W - 90 * k, H - 32 * k);
    // gear window
    const gx = W - 62 * k, gy = 44 * k, gw = 48 * k, gh = 58 * k;
    g.strokeStyle = shift ? '#e2231a' : 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5 * k;
    g.strokeRect(gx, gy, gw, gh);
    if (shift) { g.fillStyle = 'rgba(226,35,26,0.85)'; g.fillRect(gx, gy, gw, gh); }
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = F(700, 46);
    g.fillText(electric ? 'D' : (ph.gear <= 0 ? 'N' : String(ph.gear)), gx + gw / 2, gy + gh / 2 + 2 * k);
    g.fillStyle = 'rgba(154,161,169,1)'; g.font = F(600, 10); g.textBaseline = 'top';
    g.fillText(electric ? 'MOTOR' : 'MARCHA', gx + gw / 2, gy + gh + 4 * k);
    // boost bar
    const by = H - 18 * k, bx0 = 70 * k, bx1 = W - 14 * k;
    g.fillStyle = ph.nitroOn ? '#ffffff' : 'rgba(154,161,169,1)'; g.font = F(600, 12); g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('NITRO', 16 * k, by + 1.5 * k);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(bx0, by, bx1 - bx0, 4 * k);
    g.fillStyle = ph.nitroOn ? '#e2231a' : '#f3f4f6';
    g.fillRect(bx0, by, (bx1 - bx0) * clamp(ph.nitro, 0, 1), 4 * k);
  }

  _drawLean(ph) {
    const c = this.el.leanC, g = c.getContext('2d');
    const W = c.width, H = c.height, k = W / 200;
    const F = (w, px) => `${w} ${Math.round(px * k)}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
    g.clearRect(0, 0, W, H);
    const deg = Math.abs(ph.lean) * 57.3;
    if (!ph.crashed) this.maxLean = Math.max(this.maxLean * 0.9995, deg);
    g.fillStyle = 'rgba(10,11,13,0.6)'; g.fillRect(0, 0, W, H);
    const C = W * 0.36, cy = H - 14 * k, R = H * 0.66;
    // scale arc with the grip limit marked
    g.lineWidth = 2 * k; g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.beginPath(); g.arc(C, cy, R, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    const lim = ph.maxLean;
    g.strokeStyle = 'rgba(226,35,26,0.8)';
    for (const sd of [-1, 1]) {
      const a = -Math.PI / 2 + sd * lim * 1.2;
      const b = -Math.PI / 2 + sd * Math.PI * 0.45;
      g.beginPath(); g.arc(C, cy, R, Math.min(a, b), Math.max(a, b)); g.stroke();
    }
    // bike axis
    const a = -Math.PI / 2 + ph.lean * 1.2;
    g.strokeStyle = deg > lim * 57.3 * 0.92 ? '#e2231a' : '#ffffff'; g.lineWidth = 3 * k; g.lineCap = 'round';
    g.beginPath(); g.moveTo(C, cy); g.lineTo(C + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95); g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(C, cy, 3 * k, 0, TAU); g.fill();
    // readouts
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(154,161,169,1)'; g.font = F(600, 11);
    g.fillText('INCLINACIÓN', W * 0.66, 24 * k);
    g.fillStyle = '#ffffff'; g.font = F(700, 34);
    g.fillText(`${Math.round(deg)}°`, W * 0.66, 58 * k);
    g.fillStyle = 'rgba(154,161,169,1)'; g.font = F(600, 12);
    g.fillText(`MÁX ${Math.round(this.maxLean)}°`, W * 0.66, 80 * k);
  }

  // ------------------------------------------------------------ tower
  _drawTower(order, me) {
    const tw = this.el.tower;
    const leader = order[0];
    order.forEach((b, i) => {
      let r = this.rows.get(b);
      if (!r) {
        r = h('div', { class: 'tw-row' + (b === me ? ' me' : '') },
          h('span', { class: 'n' }), h('span', { class: 'c', style: { background: b.color } }), h('span', { class: 'nm' }, b.spec.short), h('span', { class: 'g' }));
        tw.appendChild(r);
        this.rows.set(b, r);
        r.style.position = 'absolute'; r.style.left = '0'; r.style.right = '0';
      }
      r.style.transform = `translateY(${i * 26}px)`;
      r.children[0].textContent = String(i + 1);
      let gap = '';
      if (b.finished) gap = i === 0 ? formatTime(b.finishTime) : formatGap(b.finishTime - leader.finishTime);
      else if (i > 0) {
        const d = leader.phys.dist - b.phys.dist;
        const v = Math.max(20, b.phys.v);
        gap = d > this.race.track.L ? `+${Math.floor(d / this.race.track.L)}V` : `+${(d / v).toFixed(1)}`;
      } else gap = 'LÍDER';
      r.children[3].textContent = gap;
      r.classList.toggle('out', !!b.phys.crashed);
    });
    tw.style.height = `${order.length * 26}px`;
  }

  // ------------------------------------------------------------ messages
  message(text, sub = '', ms = 1600, cls = '') {
    const c = this.el.center;
    c.innerHTML = '';
    c.appendChild(h('div', { class: 'hud-msg ' + cls }, text));
    if (sub) c.appendChild(h('div', { class: 'hud-sub' }, sub));
    this._msgT = ms / 1000;
  }
  // Start gantry: n red lights on (1..5); 0 = lights out, the race is on.
  startLights(n) {
    const L = this.el.lights;
    clearTimeout(this._lightsT);
    L.classList.remove('off');
    [...L.children].forEach((el, i) => el.classList.toggle('on', i < n));
    if (n === 0) this._lightsT = setTimeout(() => L.classList.add('off'), 1100);
  }
  countdown(n) { if (n === 0) this.startLights(0); }
  toast(text, color = '#fff', ms = 1500) {
    if (this._toastEl) this._toastEl.remove();
    this._toastEl = h('div', { class: 'hud-toast', style: { borderLeftColor: color } }, text);
    this.root.appendChild(this._toastEl);
    this._toastT = ms / 1000;
  }
  camName(name) {
    this.el.cam.textContent = `CÁMARA · ${name}`;
    this.el.cam.classList.add('show');
    clearTimeout(this._camT);
    this._camT = setTimeout(() => this.el.cam.classList.remove('show'), 1400);
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    const race = this.race;
    const me = race.player;
    if (!me) return;
    const ph = me.phys;
    const E = this.el;
    // position
    const n = race.order.length;
    const pos = race.order.indexOf(me) + 1;
    const solo = race.mode === 'trial' || race.mode === 'free';
    E.posBlk.style.display = solo ? 'none' : '';
    const posTxt = `${pos}<small>/${n}</small>`;
    if (!solo && E._posTxt !== posTxt) { E.posV.innerHTML = posTxt; E._posTxt = posTxt; }
    E.pos.classList.toggle('first', pos === 1 && n > 1);
    // laps & times
    const lapNow = clamp(ph.lap + 1, 1, race.laps);
    const lapTxt = race.mode === 'free' ? `${Math.max(1, ph.lap + 1)}` : `${lapNow}<small>/${race.laps}</small>`;
    if (E._lapTxt !== lapTxt) { E.lapV.innerHTML = lapTxt; E._lapTxt = lapTxt; }
    const t = E.laps.children[0];
    const curLap = race.time - (me.lapStart ?? 0);
    const best = me.bestLap;
    t.innerHTML = `<b>TOTAL</b>${formatTime(race.time * 1000)}<br><b>VUELTA</b>${formatTime(Math.max(0, curLap) * 1000)}<br><b>MEJOR</b>${formatTime(best ? best * 1000 : 0)}`;
    if (race.mode !== 'trial' && race.mode !== 'free') this._drawTower(race.order, me);
    this._drawMap(race.bikes, me);
    this._drawGauge(ph, me.spec);
    this._drawLean(ph);
    this._drift(dt, ph);
    if (race.racingLine) this._corner(race.racingLine, ph, race);
    if (Save.settings.showFps) E.fps.textContent = `${Math.round(race.game.engine.fps)} FPS`;
    else E.fps.textContent = '';
    // ghost delta
    if (race.ghostDelta !== undefined && race.ghostDelta !== null) {
      const d = race.ghostDelta;
      E.ghost.textContent = `FANTASMA  ${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`;
      E.ghost.className = 'hud-ghost ' + (d <= 0 ? 'ahead' : 'behind');
    } else E.ghost.textContent = '';
    if (this._msgT > 0) { this._msgT -= dt; if (this._msgT <= 0) this.el.center.innerHTML = ''; }
    if (this._toastT > 0) { this._toastT -= dt; if (this._toastT <= 0 && this._toastEl) { this._toastEl.remove(); this._toastEl = null; } }
  }

  // ------------------------------------------------------------ touch
  _touch(root) {
    const wrap = h('div', { class: 'touch' });
    const steer = h('div', { class: 'tb steer' }, h('div', { class: 'knob' }));
    const thr = h('div', { class: 'tb thr' }, 'GAS');
    const brk = h('div', { class: 'tb brk' }, 'FRENO');
    const nit = h('div', { class: 'tb nit' }, 'NITRO');
    const pause = h('div', { class: 'tb pause' }, 'II');
    wrap.append(steer, thr, brk, nit, pause);
    root.appendChild(wrap);
    this.touchEl = wrap;
    const knob = steer.firstChild;
    const bindBtn = (el, name) => {
      const on = (e) => { e.preventDefault(); el.classList.add('on'); Input.setTouch(name, 1); };
      const off = (e) => { e.preventDefault(); el.classList.remove('on'); Input.setTouch(name, 0); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    };
    bindBtn(thr, 'throttle'); bindBtn(brk, 'brake'); bindBtn(nit, 'nitro');
    pause.addEventListener('pointerdown', (e) => { e.preventDefault(); this.race.togglePause(); });
    let sid = null;
    const move = (e) => {
      const r = steer.getBoundingClientRect();
      const v = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      Input.setTouch('steer', v);
      knob.style.transform = `translateX(${v * r.width * 0.36}px)`;
    };
    steer.addEventListener('pointerdown', (e) => { e.preventDefault(); sid = e.pointerId; steer.setPointerCapture(sid); move(e); });
    steer.addEventListener('pointermove', (e) => { if (e.pointerId === sid) move(e); });
    const end = (e) => { if (e.pointerId !== sid) return; sid = null; Input.setTouch('steer', 0); knob.style.transform = ''; };
    steer.addEventListener('pointerup', end); steer.addEventListener('pointercancel', end);
  }

  dispose() {
    this.root.remove();
    if (this.touchEl) this.touchEl.remove();
    for (const k of ['throttle', 'brake', 'steer', 'nitro']) Input.setTouch(k, 0);
  }
}
