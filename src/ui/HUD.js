// In-race heads-up display: position, laps/times, standings tower, minimap,
// tachometer/speedometer with nitro ring, lean-angle meter and messages.
import { h, canvas } from './dom.js';
import { clamp, formatTime, formatGap } from '../core/utils.js';
import { Save } from '../core/Settings.js';
import { Input } from '../core/Input.js';

const TAU = Math.PI * 2;

export class HUD {
  constructor(root, race) {
    this.race = race;
    this.root = h('div', { class: 'hud screen show' });
    root.appendChild(this.root);
    this.el = {};
    const E = this.el;
    E.pos = h('div', { class: 'hud-pos' }, h('span', { class: 'p' }, '1'), h('span', { class: 'of' }, '/8'));
    E.laps = h('div', { class: 'hud-laps' },
      h('div', { class: 'lap' }, 'VUELTA 1/3'),
      h('div', { class: 'times' }));
    E.tower = h('div', { class: 'hud-tower' });
    E.mapC = canvas(230, 230, 'hud-map');
    E.gaugeC = canvas(290, 290, 'hud-gauge');
    E.leanC = canvas(220, 130, 'hud-lean');
    E.center = h('div', { class: 'hud-center' });
    E.cam = h('div', { class: 'hud-cam' }, '');
    E.fps = h('div', { class: 'hud-fps' }, '');
    E.ghost = h('div', { class: 'hud-ghost' }, '');
    this.root.append(E.pos, E.laps, E.tower, E.mapC, E.gaugeC, E.leanC, E.center, E.cam, E.fps, E.ghost);
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
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = S * 0.06; g.stroke(path);
    g.strokeStyle = 'rgba(200,225,255,0.85)'; g.lineWidth = S * 0.022; g.stroke(path);
    g.strokeStyle = 'rgba(0,229,255,0.9)'; g.lineWidth = S * 0.008; g.stroke(path);
    // start line
    const p0 = this.mapT(x[0], z[0]);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(p0[0], p0[1], S * 0.02, 0, TAU); g.fill();
    this.mapBase = off;
  }

  _drawMap(bikes, me) {
    const c = this.el.mapC, g = c.getContext('2d');
    const S = c.width;
    g.clearRect(0, 0, S, S);
    g.drawImage(this.mapBase, 0, 0);
    for (const b of bikes) {
      if (b === me) continue;
      const [mx, my] = this.mapT(b.phys.x, b.phys.z);
      g.fillStyle = b.color;
      g.strokeStyle = '#000'; g.lineWidth = S * 0.008;
      g.beginPath(); g.arc(mx, my, S * 0.024, 0, TAU); g.fill(); g.stroke();
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
      g.fillStyle = '#00e5ff'; g.strokeStyle = '#fff'; g.lineWidth = S * 0.01;
      g.shadowColor = '#00e5ff'; g.shadowBlur = S * 0.05;
      g.beginPath(); g.moveTo(0, -S * 0.045); g.lineTo(S * 0.032, S * 0.032); g.lineTo(-S * 0.032, S * 0.032); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }

  // ------------------------------------------------------------ gauge
  _drawGauge(ph, spec) {
    const c = this.el.gaugeC, g = c.getContext('2d');
    const S = c.width, C = S / 2, R = S * 0.42;
    g.clearRect(0, 0, S, S);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const redline = ph.redline;
    const rpmF = clamp(ph.rpm / redline, 0, 1);
    // backplate
    const bg = g.createRadialGradient(C, C, R * 0.2, C, C, R * 1.15);
    bg.addColorStop(0, 'rgba(10,16,30,0.85)'); bg.addColorStop(1, 'rgba(5,8,16,0.35)');
    g.fillStyle = bg; g.beginPath(); g.arc(C, C, R * 1.12, 0, TAU); g.fill();
    // ticks
    const maxK = Math.ceil(redline / 1000);
    for (let k = 0; k <= maxK; k++) {
      const f = (k * 1000) / redline;
      if (f > 1.0001) break;
      const a = a0 + (a1 - a0) * f;
      const red = f > 0.85;
      g.strokeStyle = red ? '#ff3b4e' : 'rgba(220,235,255,0.85)';
      g.lineWidth = S * 0.012;
      g.beginPath(); g.moveTo(C + Math.cos(a) * R * 0.86, C + Math.sin(a) * R * 0.86); g.lineTo(C + Math.cos(a) * R * 0.98, C + Math.sin(a) * R * 0.98); g.stroke();
      if (!spec.engine.electric && (maxK <= 10 || k % 2 === 0)) {
        g.fillStyle = red ? '#ff6a78' : 'rgba(200,220,240,0.8)';
        g.font = `700 ${S * 0.05}px Orbitron, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(k), C + Math.cos(a) * R * 0.74, C + Math.sin(a) * R * 0.74);
      }
    }
    // red zone arc
    g.strokeStyle = 'rgba(255,59,78,0.5)'; g.lineWidth = S * 0.03;
    g.beginPath(); g.arc(C, C, R * 0.92, a0 + (a1 - a0) * 0.85, a1); g.stroke();
    // rpm arc
    const grd = g.createLinearGradient(0, S, S, 0);
    grd.addColorStop(0, '#00e5ff'); grd.addColorStop(0.6, '#8a6cff'); grd.addColorStop(1, '#ff2bd6');
    g.strokeStyle = grd; g.lineWidth = S * 0.05; g.lineCap = 'round';
    g.shadowColor = rpmF > 0.9 ? '#ff3b4e' : '#00e5ff'; g.shadowBlur = S * 0.05;
    g.beginPath(); g.arc(C, C, R * 1.04, a0, a0 + (a1 - a0) * rpmF); g.stroke();
    g.shadowBlur = 0;
    // nitro ring (inner)
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = S * 0.022;
    g.beginPath(); g.arc(C, C, R * 0.56, a0, a1); g.stroke();
    g.strokeStyle = ph.nitroOn ? '#ffffff' : '#ff2bd6'; g.shadowColor = '#ff2bd6'; g.shadowBlur = ph.nitroOn ? S * 0.06 : S * 0.02;
    g.beginPath(); g.arc(C, C, R * 0.56, a0, a0 + (a1 - a0) * clamp(ph.nitro, 0, 1)); g.stroke();
    g.shadowBlur = 0;
    // needle
    const an = a0 + (a1 - a0) * rpmF;
    g.strokeStyle = '#ffffff'; g.lineWidth = S * 0.012;
    g.shadowColor = '#ffffff'; g.shadowBlur = S * 0.03;
    g.beginPath(); g.moveTo(C + Math.cos(an) * R * 0.62, C + Math.sin(an) * R * 0.62); g.lineTo(C + Math.cos(an) * R * 1.0, C + Math.sin(an) * R * 1.0); g.stroke();
    g.shadowBlur = 0;
    // speed
    const mph = Save.settings.units === 'mph';
    const spd = Math.round(ph.v * (mph ? 2.23694 : 3.6));
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `900 ${S * 0.2}px Orbitron, sans-serif`;
    g.fillText(String(spd), C, C + S * 0.06);
    g.fillStyle = 'rgba(160,190,220,0.9)';
    g.font = `700 ${S * 0.045}px Orbitron, sans-serif`;
    g.fillText(mph ? 'MPH' : 'KM/H', C, C + S * 0.13);
    // gear
    const gear = spec.engine.electric ? 'D' : String(ph.gear);
    const shiftLight = !spec.engine.electric && rpmF > 0.93;
    g.fillStyle = shiftLight ? '#ff3b4e' : 'rgba(0,229,255,0.16)';
    const gx = C, gy = C + S * 0.27, gw = S * 0.14, gh = S * 0.14;
    g.beginPath(); g.roundRect ? g.roundRect(gx - gw / 2, gy - gh / 2, gw, gh, S * 0.02) : g.rect(gx - gw / 2, gy - gh / 2, gw, gh); g.fill();
    g.fillStyle = shiftLight ? '#fff' : '#00e5ff';
    g.font = `900 ${S * 0.1}px Orbitron, sans-serif`; g.textBaseline = 'middle';
    g.fillText(gear, gx, gy + S * 0.005);
    g.fillStyle = 'rgba(160,190,220,0.8)';
    g.font = `700 ${S * 0.035}px Orbitron, sans-serif`;
    g.fillText(spec.engine.electric ? 'MOTOR' : 'x1000 RPM', C, C - S * 0.09);
    if (ph.nitroOn) { g.fillStyle = '#ff2bd6'; g.font = `900 ${S * 0.05}px Orbitron, sans-serif`; g.fillText('NITRO', C, C - S * 0.16); }
  }

  _drawLean(ph) {
    const c = this.el.leanC, g = c.getContext('2d');
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    const deg = Math.abs(ph.lean) * 57.3;
    if (!ph.crashed) this.maxLean = Math.max(this.maxLean * 0.9995, deg);
    const C = W / 2, R = H * 0.82, cy = H * 0.95;
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = H * 0.05;
    g.beginPath(); g.arc(C, cy, R, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    // grip-limit zone
    const lim = ph.maxLean;
    g.strokeStyle = 'rgba(255,59,78,0.45)';
    for (const s of [-1, 1]) {
      const a = -Math.PI / 2 + s * lim * 1.2;
      g.beginPath(); g.arc(C, cy, R, Math.min(a, -Math.PI / 2 + s * Math.PI * 0.42), Math.max(a, -Math.PI / 2 + s * Math.PI * 0.42)); g.stroke();
    }
    // bike line
    const a = -Math.PI / 2 + ph.lean * 1.2;
    const col = deg > lim * 57.3 * 0.92 ? '#ff3b4e' : '#00e5ff';
    g.strokeStyle = col; g.lineWidth = H * 0.05; g.lineCap = 'round';
    g.shadowColor = col; g.shadowBlur = H * 0.12;
    g.beginPath(); g.moveTo(C, cy); g.lineTo(C + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92); g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = '#fff'; g.font = `900 ${H * 0.26}px Orbitron, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(`${Math.round(deg)}°`, C, cy - R * 0.28);
    g.fillStyle = 'rgba(160,190,220,0.8)'; g.font = `700 ${H * 0.1}px Orbitron, sans-serif`;
    g.fillText(`INCLINACIÓN · MÁX ${Math.round(this.maxLean)}°`, C, H * 0.16);
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
  countdown(n) {
    const c = this.el.center;
    c.innerHTML = '';
    c.appendChild(h('div', { class: 'hud-count' + (n === 0 ? ' go' : '') }, n === 0 ? '¡YA!' : String(n)));
    this._msgT = 1.0;
  }
  toast(text, color = '#fff', ms = 1500) {
    if (this._toastEl) this._toastEl.remove();
    this._toastEl = h('div', { class: 'hud-toast', style: { color } }, text);
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
    E.pos.children[0].textContent = race.mode === 'trial' || race.mode === 'free' ? '—' : String(pos);
    E.pos.children[1].textContent = race.mode === 'trial' || race.mode === 'free' ? '' : `/${n}`;
    E.pos.classList.toggle('first', pos === 1 && n > 1);
    // laps & times
    const lapNow = clamp(ph.lap + 1, 1, race.laps);
    E.laps.children[0].textContent = race.mode === 'free' ? `VUELTA ${ph.lap + 1}` : `VUELTA ${lapNow}/${race.laps}`;
    const t = E.laps.children[1];
    const curLap = race.time - (me.lapStart ?? 0);
    const best = me.bestLap;
    t.innerHTML = `<b>TOTAL</b>${formatTime(race.time * 1000)}<br><b>VUELTA</b>${formatTime(Math.max(0, curLap) * 1000)}<br><b>MEJOR</b>${formatTime(best ? best * 1000 : 0)}`;
    if (race.mode !== 'trial' && race.mode !== 'free') this._drawTower(race.order, me);
    this._drawMap(race.bikes, me);
    this._drawGauge(ph, me.spec);
    this._drawLean(ph);
    if (Save.settings.showFps) E.fps.textContent = `${Math.round(race.game.engine.fps)} FPS`;
    else E.fps.textContent = '';
    // ghost delta
    if (race.ghostDelta !== undefined && race.ghostDelta !== null) {
      const d = race.ghostDelta;
      E.ghost.textContent = `FANTASMA ${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(2)} s`;
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
