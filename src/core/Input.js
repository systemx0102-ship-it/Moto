// Unified input: keyboard, gamepad and touch -> riding controls + menu nav.
import { clamp, moveTowards } from './utils.js';
import { Save } from './Settings.js';

const DEADZONE = 0.12;

class InputManager {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.touch = { throttle: 0, brake: 0, steer: 0, nitro: 0, rear: 0, wheelie: 0 };
    this.state = {
      throttle: 0, brake: 0, steer: 0, rearBrake: 0, nitro: false, wheelie: false, lookBack: false,
    };
    this.edges = { shiftUp: false, shiftDown: false, camera: false, pause: false, reset: false, confirm: false, back: false, up: false, down: false, left: false, right: false, any: false };
    this._kbSteer = 0;
    this._padPrev = [];
    this.usingPad = false;
    this.listeners = [];

    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (this._isGameKey(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.usingPad = false;
      if (this._isGameKey(e.code)) e.preventDefault();
      for (const l of this.listeners) l(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); });
  }

  _isGameKey(code) {
    return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(code);
  }

  onKey(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }

  down(...codes) { for (const c of codes) if (this.keys.has(c)) return true; return false; }
  hit(...codes) { for (const c of codes) if (this.pressed.has(c)) return true; return false; }

  setTouch(name, v) { this.touch[name] = v; }

  getPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  rumble(strong = 0.5, weak = 0.5, ms = 120) {
    if (!Save.settings.vibration) return;
    const p = this.getPad();
    try { p?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* noop */ }
    if (navigator.vibrate && Save.settings.touch && strong > 0.6) { try { navigator.vibrate(Math.min(ms, 80)); } catch (e) { /* noop */ } }
  }

  update(dt) {
    const s = this.state;
    const k = (...c) => this.down(...c);
    // keyboard
    let thr = k('KeyW', 'ArrowUp') ? 1 : 0;
    let brk = k('KeyS', 'ArrowDown') ? 1 : 0;
    let kbTarget = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
    // analog-ish ramp for keyboard steering
    const rate = kbTarget === 0 ? 7 : (Math.sign(kbTarget) !== Math.sign(this._kbSteer) && this._kbSteer !== 0 ? 9 : 4.5);
    this._kbSteer = moveTowards(this._kbSteer, kbTarget, rate * dt);
    let steer = this._kbSteer;
    let rear = k('Space') ? 1 : 0;
    let nitro = k('ShiftLeft', 'ShiftRight', 'KeyN');
    let wheelie = k('KeyX');
    let lookBack = k('KeyB');

    const e = this.edges;
    e.shiftUp = this.hit('KeyE');
    e.shiftDown = this.hit('KeyQ');
    e.camera = this.hit('KeyC');
    e.pause = this.hit('Escape', 'KeyP');
    e.reset = this.hit('KeyR');
    e.confirm = this.hit('Enter', 'NumpadEnter');
    e.back = this.hit('Escape', 'Backspace');
    e.up = this.hit('ArrowUp', 'KeyW');
    e.down = this.hit('ArrowDown', 'KeyS');
    e.left = this.hit('ArrowLeft', 'KeyA');
    e.right = this.hit('ArrowRight', 'KeyD');
    e.any = this.pressed.size > 0;

    // gamepad
    const p = this.getPad();
    if (p) {
      const b = (i) => (p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0);
      const edge = (i) => { const now = b(i) > 0.5; const was = this._padPrev[i]; this._padPrev[i] = now; return now && !was; };
      let ax = p.axes[0] || 0;
      if (Math.abs(ax) < DEADZONE) ax = 0; else ax = Math.sign(ax) * (Math.abs(ax) - DEADZONE) / (1 - DEADZONE);
      const rt = b(7), lt = b(6);
      const ay = p.axes[1] || 0;
      if (Math.abs(ax) > 0 || rt > 0.05 || lt > 0.05 || p.buttons.some((x) => x.pressed)) this.usingPad = true;
      if (this.usingPad) {
        thr = Math.max(thr, rt);
        brk = Math.max(brk, lt);
        if (Math.abs(ax) > Math.abs(steer)) steer = ax * Math.abs(ax) * 0.35 + ax * 0.65;
        rear = Math.max(rear, b(1));
        nitro = nitro || b(0) > 0.5;
        wheelie = wheelie || b(2) > 0.5 || ay > 0.75;
        lookBack = lookBack || b(10) > 0.5;
      }
      e.shiftUp = e.shiftUp || edge(5);
      e.shiftDown = e.shiftDown || edge(4);
      e.camera = e.camera || edge(3);
      e.pause = e.pause || edge(9);
      e.reset = e.reset || edge(8);
      e.confirm = e.confirm || edge(0) ;
      e.back = e.back || edge(1);
      e.up = e.up || edge(12) || this._axisEdge('ay-', ay < -0.6);
      e.down = e.down || edge(13) || this._axisEdge('ay+', ay > 0.6);
      e.left = e.left || edge(14) || this._axisEdge('ax-', (p.axes[0] || 0) < -0.6);
      e.right = e.right || edge(15) || this._axisEdge('ax+', (p.axes[0] || 0) > 0.6);
      e.any = e.any || p.buttons.some((x) => x.pressed);
    }

    // touch
    const t = this.touch;
    thr = Math.max(thr, t.throttle);
    brk = Math.max(brk, t.brake);
    if (Math.abs(t.steer) > Math.abs(steer)) steer = t.steer;
    nitro = nitro || t.nitro > 0.5;
    rear = Math.max(rear, t.rear);
    wheelie = wheelie || t.wheelie > 0.5;

    s.throttle = clamp(thr, 0, 1);
    s.brake = clamp(brk, 0, 1);
    s.steer = clamp(steer, -1, 1);
    s.rearBrake = clamp(rear, 0, 1);
    s.nitro = nitro;
    s.wheelie = wheelie;
    s.lookBack = lookBack;
    this.pressed.clear();
  }

  _axisEdge(key, now) {
    this._ax = this._ax || {};
    const was = this._ax[key];
    this._ax[key] = now;
    return now && !was;
  }
}

export const Input = new InputManager();
