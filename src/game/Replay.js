// Fixed-rate recording of bike states for replays and time-trial ghosts.
export const REC_HZ = 30;
const F = 14; // floats per bike per frame

export class Recorder {
  constructor(nBikes) {
    this.n = nBikes;
    this.cap = 4096;
    this.data = new Float32Array(this.cap * nBikes * F);
    this.frames = 0;
    this.acc = 0;
  }

  record(dt, bikes) {
    this.acc += dt;
    if (this.acc < 1 / REC_HZ) return;
    this.acc -= 1 / REC_HZ;
    if (this.frames >= this.cap) {
      if (this.cap >= 30 * 60 * 15) return; // 15 minutes max
      const nd = new Float32Array(this.cap * 2 * this.n * F);
      nd.set(this.data);
      this.data = nd; this.cap *= 2;
    }
    const base = this.frames * this.n * F;
    bikes.forEach((b, i) => {
      const p = b.phys, o = base + i * F;
      const d = this.data;
      d[o] = p.x; d[o + 1] = p.y + (p.curbY || 0); d[o + 2] = p.z; d[o + 3] = p.h;
      d[o + 4] = p.lean; d[o + 5] = p.pitch; d[o + 6] = p.steerAngle; d[o + 7] = p.v;
      d[o + 8] = p.rpm; d[o + 9] = p.input.throttle; d[o + 10] = p.compF; d[o + 11] = p.compR;
      d[o + 12] = (p.nitroOn ? 1 : 0) + (p.crashed ? 2 : 0) + (p.input.brake > 0.1 ? 4 : 0); d[o + 13] = p.s;
    });
    this.frames++;
  }

  get duration() { return this.frames / REC_HZ; }

  // interpolated sample for bike i at time t
  sample(i, t, out = {}) {
    const f = Math.max(0, Math.min(this.frames - 1.001, t * REC_HZ));
    const a = Math.floor(f), k = f - a;
    const d = this.data, n = this.n;
    const oa = (a * n + i) * F, ob = ((a + 1) * n + i) * F;
    const L = (j) => d[oa + j] + (d[ob + j] - d[oa + j]) * k;
    out.x = L(0); out.y = L(1); out.z = L(2);
    let dh = d[ob + 3] - d[oa + 3];
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    out.h = d[oa + 3] + dh * k;
    out.lean = L(4); out.pitch = L(5); out.steerAngle = L(6); out.speed = L(7);
    out.rpm = L(8); out.throttle = L(9); out.compF = L(10); out.compR = L(11);
    const fl = d[oa + 12];
    out.nitro = (fl & 1) !== 0; out.crashed = (fl & 2) !== 0; out.braking = (fl & 4) !== 0;
    out.s = d[oa + 13];
    return out;
  }
}

// Single-bike lap recording for ghosts (time-indexed from lap start).
export class GhostTrack {
  constructor() { this.buf = []; this.acc = 0; }
  reset() { this.buf = []; this.acc = 0; }
  record(dt, p) {
    this.acc += dt;
    while (this.acc >= 1 / REC_HZ) {
      this.acc -= 1 / REC_HZ;
      this.buf.push(p.x, p.y + (p.curbY || 0), p.z, p.h, p.lean, p.pitch, p.steerAngle, p.v);
    }
  }
  toArray() { return new Float32Array(this.buf); }
  static sample(arr, t, out = {}) {
    const frames = arr.length / 8;
    if (frames < 2) return null;
    const f = Math.max(0, Math.min(frames - 1.001, t * REC_HZ));
    const a = Math.floor(f), k = f - a;
    const oa = a * 8, ob = (a + 1) * 8;
    const L = (j) => arr[oa + j] + (arr[ob + j] - arr[oa + j]) * k;
    out.x = L(0); out.y = L(1); out.z = L(2);
    let dh = arr[ob + 3] - arr[oa + 3];
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    out.h = arr[oa + 3] + dh * k;
    out.lean = L(4); out.pitch = L(5); out.steerAngle = L(6); out.speed = L(7);
    out.done = f >= frames - 1.01;
    return out;
  }
  static encode(arr) {
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  static decode(str) {
    const s = atob(str);
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return new Float32Array(u8.buffer);
  }
}
