// Procedural audio.
//
// Engines are synthesized from firing-order pulse trains, the way a real exhaust works: for every
// engine layout we pre-render (once, cached) looping buffers that hold whole engine cycles (720° of
// crank for a 4-stroke, 360° for a 2-stroke) with an exhaust pressure pulse at each cylinder's real
// firing angle — sharp blow-down front, damped body, rarefaction after it — plus turbulent blow-down
// noise and the ringing of that cylinder's header/collector resonances. A second channel carries the
// intake roar and valvetrain/cam-chain noise, phase-locked to the same crank. Voices loop the buffers
// with playbackRate = rpm / bufferRpm, crossfade several rpm tiers (so formants never chipmunk) and
// separate on-load / overrun sets, then shape the result with fixed muffler/pipe filters.
// Also: tyre squeal, wind, kerb/gravel/dirt layers, scrape, procedural reverb per environment,
// realistic one-shots (backfires, impacts, crashes, thunder) and the synthwave music.
import { Save } from './Settings.js';
import { clamp } from './utils.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

// ---------------------------------------------------------------- engine layouts
// fire: firing angles (crank degrees inside one cycle). amp: per-cylinder pulse strength.
// tiers: base rpm of each pre-rendered buffer. rise/decay/nzDecay: pulse shape in crank degrees.
// res: header/collector resonances [Hz, Q, gain] baked per cylinder (spread = unequal header lengths).
// lp: muffler low-pass [closed, wide open] Hz; pk: pipe body resonance [Hz, dB, Q] (live, fixed Hz).
// intake: airbox / runner resonances; mech: valvetrain ticks, cam-chain whine order, gearbox whine order.
// lim: rev-limiter [period s, cut length s]. pops: overrun crackle tendency.
export const ENGINES = {
  // Flat-plane inline four, even 180° firing (1-3-4-2): smooth hum at idle, 14k rpm scream.
  i4: {
    stroke: 4, fire: [0, 180, 360, 540], amp: [1, 0.94, 1.05, 0.97], tiers: [1500, 3300, 7000, 12800],
    rise: 2.2, decay: 34, neg: 0.8, noise: 0.45, nzDecay: 28, nzLP: 5200, var: 0.05, jit: 0.6,
    res: [[340, 3.5, 0.8], [1150, 6, 0.65], [2650, 5, 0.42]], spread: 0.045, dry: 0.5, drive: 1.7,
    intake: { res: [[185, 3, 1], [870, 5, 0.7], [2050, 6, 0.35]], decay: 70, amt: 1 },
    mech: { tick: 0.22, whine: 0.05, order: 18, trans: 7.5 },
    lp: [1900, 7000], pk: [620, 2.5, 1.1], intMix: 0.5, gain: 1.84, pops: 0.45, lim: [0.07, 0.03],
  },
  // GP "twin pulse" V4 (90° V, 70° crankpin offset): 0/90/290/380 — rough, growling, very open.
  v4: {
    stroke: 4, fire: [0, 90, 290, 380], amp: [1, 0.92, 1.06, 0.95], tiers: [2300, 4900, 9500, 16000],
    rise: 1.8, decay: 32, neg: 0.8, noise: 0.6, nzDecay: 30, nzLP: 6500, var: 0.06, jit: 0.8,
    res: [[290, 3, 0.85], [830, 5, 0.7], [2150, 4.5, 0.45]], spread: 0.06, dry: 0.55, drive: 2.4,
    intake: { res: [[210, 3, 1], [950, 4.5, 0.7], [2300, 5, 0.35]], decay: 65, amt: 1 },
    mech: { tick: 0.2, whine: 0.08, order: 22, trans: 8.2 },
    lp: [2400, 8500], pk: [520, 3, 1], intMix: 0.45, gain: 1.61, pops: 1, lim: [0.06, 0.028],
  },
  // Inline triple, even 240°: gravelly mid rasp and the famous intake howl.
  i3: {
    stroke: 4, fire: [0, 240, 480], amp: [1, 0.9, 1.08], tiers: [1400, 3000, 6100, 11000],
    rise: 2.4, decay: 38, neg: 0.8, noise: 0.5, nzDecay: 30, nzLP: 5000, var: 0.06, jit: 0.8,
    res: [[380, 3.5, 0.85], [1250, 5, 0.7], [2900, 4.5, 0.4]], spread: 0.06, dry: 0.5, drive: 1.9,
    intake: { res: [[220, 4, 1], [1100, 7, 0.9], [2500, 6, 0.3]], decay: 75, amt: 1.1 },
    mech: { tick: 0.22, whine: 0.05, order: 16, trans: 7 },
    lp: [1700, 6000], pk: [480, 3, 1.1], intMix: 0.6, gain: 1.7, pops: 1, lim: [0.07, 0.03],
  },
  // 45° V-twin, common crankpin: 315°/405° — the classic potato-potato, deep and thumpy.
  vtwin: {
    stroke: 4, fire: [0, 315], amp: [1, 0.86], tiers: [900, 1950, 4200],
    rise: 4.5, decay: 62, neg: 0.85, noise: 0.32, nzDecay: 45, nzLP: 3200, var: 0.12, jit: 2.2,
    res: [[96, 2.5, 0.8], [235, 3, 0.9], [640, 3.5, 0.65]], spread: 0.07, dry: 0.6, drive: 1.8,
    intake: { res: [[140, 3, 1], [520, 4, 0.5]], decay: 110, amt: 0.8 },
    mech: { tick: 0.35, whine: 0.03, order: 9, trans: 4.5 },
    lp: [900, 3200], pk: [120, 4, 0.9], intMix: 0.4, gain: 2.53, pops: 0.8, lim: [0.085, 0.04],
  },
  // 90° V-twin: 270°/450°, short open pipes — sharper bark than the 45°.
  vtwin2: {
    stroke: 4, fire: [0, 270], amp: [1, 0.9], tiers: [950, 2100, 4800],
    rise: 3.2, decay: 52, neg: 0.85, noise: 0.45, nzDecay: 40, nzLP: 4200, var: 0.1, jit: 1.8,
    res: [[125, 3, 0.8], [335, 3.5, 0.9], [910, 4, 0.6]], spread: 0.06, dry: 0.6, drive: 2.2,
    intake: { res: [[150, 3, 1], [610, 4, 0.5]], decay: 100, amt: 0.8 },
    mech: { tick: 0.3, whine: 0.03, order: 10, trans: 5 },
    lp: [1350, 4800], pk: [165, 4, 1], intMix: 0.4, gain: 2.4, pops: 1.25, lim: [0.08, 0.038],
  },
  // Parallel twin with 270° crank (fires like a 90° V-twin), 2-into-2 peashooters: throbby, mellow.
  twin: {
    stroke: 4, fire: [0, 270], amp: [1, 0.93], tiers: [1050, 2400, 5500],
    rise: 3, decay: 46, neg: 0.8, noise: 0.36, nzDecay: 36, nzLP: 4200, var: 0.07, jit: 1.2,
    res: [[175, 3, 0.85], [520, 4, 0.75], [1480, 4, 0.45]], spread: 0.04, dry: 0.55, drive: 1.6,
    intake: { res: [[170, 3, 1], [760, 5, 0.6]], decay: 90, amt: 0.9 },
    mech: { tick: 0.3, whine: 0.04, order: 12, trans: 5.5 },
    lp: [1500, 4600], pk: [260, 3, 1], intMix: 0.45, gain: 2.32, pops: 0.9, lim: [0.075, 0.034],
  },
  // 450 motocross single: one bang per 720°, loud raspy "braaap".
  single: {
    stroke: 4, fire: [0], amp: [1], tiers: [1700, 3600, 7100, 12000],
    rise: 2.2, decay: 40, neg: 0.85, noise: 0.62, nzDecay: 34, nzLP: 5500, var: 0.1, jit: 1.2,
    res: [[265, 3, 0.85], [760, 4, 0.75], [1900, 3.5, 0.5]], spread: 0, dry: 0.6, drive: 2.4,
    intake: { res: [[200, 3, 1], [900, 4, 0.6], [2200, 5, 0.3]], decay: 80, amt: 1 },
    mech: { tick: 0.3, whine: 0.04, order: 14, trans: 6.5 },
    lp: [2100, 7000], pk: [420, 3, 1], intMix: 0.45, gain: 1.76, pops: 0.9, lim: [0.09, 0.04],
  },
  // 690 supermoto single: bigger bore, deeper thump, lots of overrun crackle.
  singleBig: {
    stroke: 4, fire: [0], amp: [1], tiers: [1500, 2900, 5400, 9300],
    rise: 2.8, decay: 52, neg: 0.85, noise: 0.5, nzDecay: 40, nzLP: 4500, var: 0.11, jit: 1.5,
    res: [[150, 3, 0.9], [470, 4, 0.75], [1380, 3.5, 0.45]], spread: 0, dry: 0.6, drive: 2.2,
    intake: { res: [[160, 3, 1], [700, 4, 0.6]], decay: 95, amt: 0.9 },
    mech: { tick: 0.3, whine: 0.04, order: 12, trans: 6 },
    lp: [1700, 5600], pk: [240, 4, 1], intMix: 0.4, gain: 2.13, pops: 1.4, lim: [0.085, 0.04],
  },
  // Boxer twin, even 360°: left/right headers differ — the characteristic drone/chug.
  boxer: {
    stroke: 4, fire: [0, 360], amp: [1, 0.9], tiers: [1050, 2300, 4800, 8500],
    rise: 3, decay: 46, neg: 0.8, noise: 0.34, nzDecay: 34, nzLP: 4000, var: 0.06, jit: 1,
    res: [[145, 3, 0.85], [430, 3.5, 0.75], [1120, 4, 0.45]], spread: 0.09, dry: 0.55, drive: 1.5,
    intake: { res: [[175, 3, 1], [640, 4, 0.6]], decay: 90, amt: 0.9 },
    mech: { tick: 0.32, whine: 0.06, order: 11, trans: 5.2 },
    lp: [1400, 4300], pk: [210, 3, 1], intMix: 0.5, gain: 2.17, pops: 0.6, lim: [0.075, 0.034],
  },
  // Power-cruiser V4 (uneven 245/115): deep throaty roar.
  muscle: {
    stroke: 4, fire: [0, 245, 360, 605], amp: [1, 0.9, 1.04, 0.93], tiers: [1050, 2300, 4700, 8400],
    rise: 3.2, decay: 50, neg: 0.85, noise: 0.38, nzDecay: 38, nzLP: 3800, var: 0.07, jit: 1.2,
    res: [[112, 2.5, 0.8], [300, 3, 0.85], [850, 3.5, 0.55]], spread: 0.06, dry: 0.6, drive: 2,
    intake: { res: [[150, 3, 1], [560, 4, 0.6]], decay: 100, amt: 0.9 },
    mech: { tick: 0.25, whine: 0.04, order: 12, trans: 5 },
    lp: [1200, 4000], pk: [140, 4, 0.9], intMix: 0.45, gain: 2.02, pops: 1, lim: [0.08, 0.036],
  },
  // 500 GP two-stroke V4: one bang per cylinder per revolution, expansion chambers that "come on
  // the pipe" in the power band, 4-stroking "ring-ding-ding" at low rpm and on the overrun.
  twoStroke: {
    stroke: 2, fire: [0, 82, 180, 262], amp: [1, 0.95, 1.04, 0.97], tiers: [1900, 4000, 7600, 11600],
    rise: 1.4, decay: 26, neg: 0.9, noise: 0.62, nzDecay: 26, nzLP: 6500, var: 0.08, jit: 1,
    res: [[720, 7, 0.8], [1480, 8, 0.7], [2950, 6, 0.4]], spread: 0.035, dry: 0.45, drive: 2,
    pipe: [0.25, 0.45, 1, 1.35], mis: [0.38, 0.14, 0.03, 0], misOver: 0.5,
    intake: { res: [[260, 4, 1], [1300, 6, 0.6]], decay: 60, amt: 0.8 },
    mech: { tick: 0.12, whine: 0.02, order: 8, trans: 7 },
    lp: [2400, 8000], pk: [1450, 0, 2.2], band: [0.68, 0.98, 8, 0.3], intMix: 0.35, gain: 1.27, pops: 0.35, lim: [0.06, 0.028],
  },
  // Electric superbike: inverter + motor orders + straight-cut reduction gear (built live).
  electric: { electric: true, gain: 1.3, gear: 11.37, pwm: 9200 },
};
for (const k of Object.keys(ENGINES)) ENGINES[k].id = k;

// ---------------------------------------------------------------- DSP kit (offline synthesis)
// Self-contained (no outer references) so the same code also runs inside a Web Worker built from
// its source text: engine buffers are synthesized off the main thread when workers are available.
function dspKit() {
  const TAU = Math.PI * 2;
  function rng32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  const gauss = (R) => (R() + R() + R() - 1.5) * 2; // ~N(0,1), bounded

  // RBJ biquad coefficients -> [b0, b1, b2, a1, a2]
  function coef(type, f, Q, fs, db = 0) {
    const w = (TAU * Math.min(f, fs * 0.45)) / fs, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'pk') {
      const A = 10 ** (db / 40);
      b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A;
    } else {
      if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
      a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
    }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  // Filter x into out (in place allowed). warm > 0 treats x as a loop: the filter is first run over
  // the loop's last `warm` samples so the output is the periodic steady state and wraps seamlessly.
  function filt(x, k, out, g = 1, add = false, warm = 0) {
    const b0 = k[0], b1 = k[1], b2 = k[2], a1 = k[3], a2 = k[4], L = x.length;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let n = Math.max(0, L - warm); n < L && warm > 0; n++) { const xn = x[n], y = b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = xn; y2 = y1; y1 = y; }
    for (let n = 0; n < L; n++) {
      const xn = x[n], y = b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = xn; y2 = y1; y1 = y;
      out[n] = add ? out[n] + g * y : g * y;
    }
  }
  const warmLen = (f, q, fs) => Math.ceil(((14 * q) / (Math.PI * f)) * fs);
  function rms(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); }
  function peakAbs(x) { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; }
  function scale(x, s) { for (let i = 0; i < x.length; i++) x[i] *= s; return x; }
  function dcLoop(x, fs) {
    let m = 0;
    for (let i = 0; i < x.length; i++) m += x[i];
    m /= x.length;
    for (let i = 0; i < x.length; i++) x[i] -= m;
    filt(x, coef('hp', 35, 0.6, fs), x, 1, false, Math.ceil(fs * 0.08));
  }
  const wrapIdx = (i, L) => (i >= L || i < 0 ? ((i % L) + L) % L : i);
  // smooth saturator (rational tanh approximation, exact at 0 and saturating to ±1)
  const sat = (x) => (x > 3 ? 1 : x < -3 ? -1 : (x * (27 + x * x)) / (27 + 9 * x * x));
  // white-noise table shared by the generators (read at random offsets instead of calling the RNG per sample)
  const NT_LEN = 1 << 16, NT = new Float32Array(NT_LEN);
  { const R = rng32(987654321); for (let i = 0; i < NT_LEN; i++) NT[i] = R() * 2 - 1; }

  // Add one decaying pulse (pressure pulse + turbulent noise) at fractional sample s0.
  // Shapes are computed with recursive exponentials (no Math.exp in the inner loop).
  function addPulse(buf, s0, A, An, sh, R) {
    const L = buf.length, n0 = Math.ceil(s0), fr = n0 - s0, span = sh.span, nzK = sh.nzK, negK = sh.negK, kn = sh.kn;
    const mr = sh.mr, md = sh.md, mn = sh.mn, mz = sh.mz;
    let er = Math.exp(-fr * sh.kr), ed = Math.exp(-fr * sh.kd), en = Math.exp(-fr * kn), ez = Math.exp(-fr * sh.kz);
    let z = 0, o = (R() * NT_LEN) | 0, i = wrapIdx(n0, L);
    for (let j = 0; j < span; j++) {
      const att = 1 - er, u = (fr + j) * kn;
      z += nzK * (NT[o] - z);
      o = (o + 1) & (NT_LEN - 1);
      buf[i] += A * (att * ed - negK * u * u * en) + An * att * ez * z;
      if (++i === L) i = 0;
      er *= mr; ed *= md; en *= mn; ez *= mz;
    }
  }
  function pulseShape(rise, dec, negW, nzDec, neg, nzLP, dps, fs, L) {
    const kr = dps / rise, kd = dps / dec, kn = dps / negW, kz = dps / nzDec;
    return {
      kr, kd, kn, kz, mr: Math.exp(-kr), md: Math.exp(-kd), mn: Math.exp(-kn), mz: Math.exp(-kz),
      negK: 0.5 * neg * (dec / negW), nzK: 1 - Math.exp((-TAU * nzLP) / fs),
      span: Math.min(L, Math.ceil(Math.max(dec * 8, negW * 10, nzDec * 8) / dps)),
    };
  }

  // Render one rpm tier of an engine: returns on-load and overrun loops (exhaust + intake channels),
  // each an exact integer number of engine cycles long.
  function synthTier(P, ti, fs) {
    const two = P.stroke === 2, cyc = two ? 360 : 720;
    const nT = P.tiers.length, tT = nT > 1 ? ti / (nT - 1) : 0;
    const N = Math.max(32, Math.round((cyc * fs) / (6 * P.tiers[ti])));
    const base = (cyc * fs) / (6 * N), dps = cyc / N;
    const dur = (ti === 0 ? 1 : 0.55) * (two && ti < 2 ? 1.8 : 1);
    const nCyc = Math.max(6, Math.round((dur * fs) / N));
    const L = N * nCyc, nC = P.fire.length, nG = Math.min(nC, 2), dry = P.dry;
    const tmp = new Float32Array(L);
    const out = { base, L, N, nCyc };
    let inScale = 1, inRms = 1;
    for (const over of [false, true]) {
      const R = rng32(hashStr(P.id) + ti * 7919 + (over ? 104729 : 0));
      const ex = new Float32Array(L), inn = new Float32Array(L);
      // ---- exhaust pulses
      const rise = Math.max(P.rise * (over ? 2.6 : 1), 0.07e-3 * 6 * base);
      const dec = P.decay * (over ? 0.85 : 1);
      const sh = pulseShape(rise, dec, dec * 0.9, P.nzDecay * (over ? 0.8 : 1), P.neg, P.nzLP, dps, fs, L);
      const nzA = P.noise * 2.5 * (over ? 0.4 : 1) * (0.85 + 0.3 * tT);
      const varA = P.var * (over ? 2 : 1) * (1.3 - 0.5 * tT), jit = P.jit * (1.5 - tT) * (over ? 1.5 : 1);
      const mis = over ? (P.misOver ?? 0.04) : P.mis ? P.mis[ti] : 0;
      const rg = 2.5 * (0.8 + 0.4 * tT) * (P.pipe ? P.pipe[ti] : 1) * (over ? 0.75 : 1);
      // cylinders feed two header groups (e.g. the pairs of a 4-2-1, or each pipe of a twin),
      // each tuned slightly differently (unequal header lengths)
      for (let grp = 0; grp < nG; grp++) {
        tmp.fill(0);
        for (let k = grp; k < nC; k += nG) for (let c = 0; c < nCyc; c++) {
          let A = P.amp[k] * Math.max(0.25, 1 + varA * gauss(R));
          if (mis > 0 && R() < mis) A *= 0.05 + 0.15 * R();
          addPulse(tmp, (c * cyc + P.fire[k] + jit * gauss(R)) / dps, A, A * nzA, sh, R);
        }
        const sp = 1 + P.spread * (nG > 1 ? (grp ? 1 : -1) : 0);
        for (let i = 0; i < L; i++) ex[i] += dry * tmp[i];
        for (const [f, q, g] of P.res) filt(tmp, coef('bp', f * sp, q, fs), ex, g * rg, true, warmLen(f * sp, q, fs));
      }
      // gas-dynamic steepening / soft saturation of the big pulses (on load much more)
      const drv = P.drive * (over ? 0.5 : 1) * (0.85 + 0.3 * tT), tn = sat(drv), kd = drv / (peakAbs(ex) || 1);
      for (let i = 0; i < L; i++) ex[i] = sat(kd * ex[i]) / tn;
      dcLoop(ex, fs);
      filt(ex, coef('lp', 14000, 0.6, fs), ex, 1, false, 256);
      const er = rms(ex) || 1, ep = peakAbs(ex) || 1;
      scale(ex, Math.min(0.2 / er, 0.95 / ep));
      // ---- intake roar (suction pulse + turbulent rush through the airbox)
      tmp.fill(0);
      const I = P.intake, iA = (over ? 0.12 : 1) * I.amt, ioff = two ? 175 : 372;
      const ish = pulseShape(14, I.decay, I.decay, I.decay, 0, 2600, dps, fs, L);
      for (let k = 0; k < nC; k++) for (let c = 0; c < nCyc; c++) {
        const A = iA * P.amp[k] * Math.max(0.3, 1 + 0.12 * gauss(R));
        addPulse(tmp, (c * cyc + P.fire[k] + ioff + jit * gauss(R)) / dps, -0.6 * A, 2.4 * A, ish, R);
      }
      for (let i = 0; i < L; i++) inn[i] = 0.2 * tmp[i];
      for (const [f, q, g] of I.res) filt(tmp, coef('bp', f, q, fs), inn, g * 2.5, true, warmLen(f, q, fs));
      if (!over) inRms = rms(inn) || 1e-3;
      // ---- valvetrain: metallic ticks at valve closing, plus cam-chain whine locked to the crank
      const M = P.mech;
      if (M.tick > 0) {
        tmp.fill(0);
        const tspan = Math.ceil(fs * 0.0006), tk = Math.exp(-1 / (fs * 0.00009));
        const ev = two ? [95] : [385, 590];
        for (let k = 0; k < nC; k++) for (let c = 0; c < nCyc; c++) for (const e of ev) {
          const n0 = Math.ceil((c * cyc + P.fire[k] + e + 2 * gauss(R)) / dps);
          let a = 0.6 + 0.8 * R(), o = (R() * NT_LEN) | 0;
          for (let j = 0; j < tspan; j++) { tmp[wrapIdx(n0 + j, L)] += a * NT[(o + j) & (NT_LEN - 1)]; a *= tk; }
        }
        const tb = new Float32Array(L);
        for (const [f, q, g] of [[3300, 14, 1], [5600, 16, 0.8], [8100, 12, 0.5]]) filt(tmp, coef('bp', f, q, fs), tb, g, true, warmLen(f, q, fs));
        const ts = (M.tick * inRms) / (rms(tb) || 1);
        for (let i = 0; i < L; i++) inn[i] += tb[i] * ts;
      }
      if (M.whine > 0) {
        const per = Math.max(1, Math.round((M.order * cyc) / 360)), a = M.whine * inRms * Math.SQRT2;
        const tab = new Float32Array(N);
        for (let i = 0; i < N; i++) tab[i] = a * Math.sin((TAU * i) / N);
        for (let i = 0, ph = 0; i < L; i++) { inn[i] += tab[ph]; ph += per; if (ph >= N) ph -= N; }
      }
      dcLoop(inn, fs);
      if (!over) { const ir = rms(inn) || 1, ip = peakAbs(inn) || 1; inScale = Math.min(0.2 / ir, 0.95 / ip); }
      scale(inn, inScale);
      out[over ? 'over' : 'load'] = [ex, inn];
    }
    return out;
  }

  // ---------------------------------------------------------------- one-shot / texture generators
  function genPop(fs, R) {
    const L = Math.floor(fs * 0.2), x = new Float32Array(L);
    const fb = 70 + R() * 110, tb = 0.01 + R() * 0.018, tc = 0.0012 + R() * 0.003;
    let ph = 0;
    for (let i = 0; i < L; i++) {
      const t = i / fs, att = 1 - Math.exp(-t / 0.00022);
      ph += (TAU * fb * (1 - 0.3 * Math.min(1, t / 0.05))) / fs;
      x[i] = att * (Math.exp(-t / tc) * (R() * 2 - 1) * 1.1 + Math.exp(-t / tb) * Math.sin(ph) * 0.8);
    }
    const nc = 1 + Math.floor(R() * 3);
    for (let c = 0; c < nc; c++) {
      const s0 = Math.floor((0.008 + R() * 0.07) * fs), a = 0.15 + R() * 0.35, d = Math.exp(-1 / (fs * 0.0007));
      let e = a;
      for (let j = 0; j < fs * 0.006 && s0 + j < L; j++) { x[s0 + j] += e * (R() * 2 - 1); e *= d; }
    }
    filt(x, coef('hp', 55, 0.7, fs), x);
    filt(x, coef('lp', 9000, 0.7, fs), x);
    return scale(x, 0.9 / (peakAbs(x) || 1));
  }
  function genImpact(fs, R) {
    const L = Math.floor(fs * 0.9), x = new Float32Array(L), body = new Float32Array(L), crack = new Float32Array(L);
    let ph = 0;
    const modes = [[380, 0.25, 0.22], [1050, 0.18, 0.17], [2280, 0.12, 0.1], [3900, 0.08, 0.05]].map(([f, d, a]) => [f * (0.9 + 0.2 * R()), d * (0.8 + 0.4 * R()), a * (0.5 + R())]);
    for (let i = 0; i < L; i++) {
      const t = i / fs, att = 1 - Math.exp(-t / 0.0008);
      ph += (TAU * (45 + 75 * Math.exp(-t / 0.05))) / fs;
      let v = att * Math.exp(-t / 0.18) * Math.sin(ph) * 0.9;
      for (const [f, d, a] of modes) v += a * att * Math.exp(-t / d) * Math.sin(TAU * f * t);
      x[i] = v;
      body[i] = (R() * 2 - 1) * Math.exp(-t / 0.12) * att;
      crack[i] = (R() * 2 - 1) * Math.exp(-t / 0.03);
    }
    filt(body, coef('lp', 600, 0.7, fs), x, 0.9, true);
    filt(crack, coef('bp', 2600, 1.5, fs), x, 1.2, true);
    return scale(x, 0.9 / (peakAbs(x) || 1));
  }
  function genShatter(fs, R) {
    const L = Math.floor(fs * 0.7), x = new Float32Array(L), g = new Float32Array(Math.floor(fs * 0.04)), go = new Float32Array(g.length);
    for (let n = 0; n < 150; n++) {
      const t0 = -Math.log(1 - R() * 0.97) * 0.11, s0 = Math.floor(t0 * fs);
      if (s0 >= L) continue;
      const d = Math.exp(-1 / (fs * (0.002 + R() * 0.012))), a = (0.2 + R()) * Math.exp(-t0 / 0.25);
      let e = a;
      for (let j = 0; j < g.length; j++) { g[j] = e * (R() * 2 - 1); e *= d; }
      filt(g, coef('bp', 1500 + R() * 5500, 3 + R() * 5, fs), go);
      for (let j = 0; j < g.length && s0 + j < L; j++) x[s0 + j] += go[j];
    }
    return scale(x, 0.9 / (peakAbs(x) || 1));
  }
  // Metal grinding on asphalt (loop): dense random micro-impacts ringing metallic modes.
  function genGrind(fs, R) {
    const L = Math.floor(fs * 2), ex = new Float32Array(L), x = new Float32Array(L);
    let rough = 0;
    for (let i = 0; i < L; i++) {
      rough += 0.0008 * (R() - rough);
      if (R() < 0.07) ex[i] = (R() * 2 - 1) * (0.3 + 1.4 * rough) * (R() < 0.04 ? 3 : 1);
    }
    for (const [f, q, g] of [[1850, 9, 1], [3350, 12, 0.8], [5150, 10, 0.55], [7600, 8, 0.35]]) filt(ex, coef('bp', f, q, fs), x, g, true, warmLen(f, q, fs));
    filt(ex, coef('hp', 2500, 0.7, fs), x, 0.35, true, 512);
    dcLoop(x, fs);
    return scale(x, 0.25 / (rms(x) || 1));
  }
  // Gravel / dirt crunch (loop): Poisson grains of varying size and brightness.
  function genGravel(fs, R) {
    const L = Math.floor(fs * 2), x = new Float32Array(L);
    const add = (rate, d0, d1, a0) => {
      const n = Math.floor(rate * 2);
      for (let k = 0; k < n; k++) {
        const s0 = Math.floor(R() * L), d = Math.exp(-1 / (fs * (d0 + R() * (d1 - d0)))), lpK = 0.15 + R() * 0.8;
        let e = a0 * Math.pow(R(), 2.2), z = 0;
        for (let j = 0; j < fs * d1 * 6; j++) { z += lpK * (R() * 2 - 1 - z); x[wrapIdx(s0 + j, L)] += e * z; e *= d; }
      }
    };
    add(700, 0.0006, 0.003, 1);
    add(60, 0.002, 0.008, 2.2);
    dcLoop(x, fs);
    return scale(x, 0.25 / (rms(x) || 1));
  }
  // Thunder: close crack, then long rolling rumble built from overlapping low-passed bursts.
  function genThunder(fs, R) {
    const L = Math.floor(fs * 7), x = new Float32Array(L);
    const lo = new Float32Array(L), mid = new Float32Array(L), env = new Float32Array(L), env2 = new Float32Array(L);
    for (let i = 0; i < L; i++) { lo[i] = R() * 2 - 1; mid[i] = R() * 2 - 1; }
    filt(lo, coef('lp', 110, 0.7, fs), lo); filt(lo, coef('lp', 160, 0.7, fs), lo);
    filt(mid, coef('bp', 420, 0.8, fs), mid);
    for (let b = 0; b < 26; b++) {
      const t0 = Math.pow(R(), 1.6) * 4.2, a = (0.3 + R()) * Math.exp(-t0 / 2.6), at = 0.05 + R() * 0.3, dc = 0.4 + R() * 1.4;
      for (let i = Math.floor(t0 * fs); i < L; i++) {
        const t = i / fs - t0, e = a * (1 - Math.exp(-t / at)) * Math.exp(-t / dc);
        if (e < 1e-4 && t > at) break;
        env[i] += e; if (t0 < 1.5) env2[i] += e * 0.5;
      }
    }
    for (let i = 0; i < L; i++) {
      const t = i / fs, crack = t < 0.6 ? Math.exp(-t / 0.09) * (R() * 2 - 1) * 0.5 : 0;
      x[i] = lo[i] * env[i] * 9 + mid[i] * env2[i] * 1.6 + crack;
    }
    filt(x, coef('lp', 2800, 0.7, fs), x);
    filt(x, coef('hp', 25, 0.7, fs), x);
    for (let i = L - fs; i < L; i++) x[i] *= (L - i) / fs;
    return scale(x, 0.9 / (peakAbs(x) || 1));
  }
  // Smooth random control signal (looped), ~20 Hz bandwidth at playbackRate 1.
  function genLfo(fs, R) {
    const L = fs * 4, step = Math.floor(fs / 20), n = L / step, pts = Array.from({ length: n }, () => R() * 2 - 1), x = new Float32Array(L);
    for (let i = 0; i < L; i++) {
      const p = i / step, k = Math.floor(p), t = p - k;
      const p0 = pts[(k - 1 + n) % n], p1 = pts[k % n], p2 = pts[(k + 1) % n], p3 = pts[(k + 2) % n];
      x[i] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    }
    return scale(x, 1 / (peakAbs(x) || 1));
  }
  function genPink(fs, R) {
    const L = fs * 2, x = new Float32Array(L);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < L; i++) {
      const w = R() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      x[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
    }
    dcLoop(x, fs);
    return scale(x, 0.35 / (rms(x) || 1));
  }

  function genIR(fs, E, R) {
    const L = Math.floor(E.len * fs), chans = [new Float32Array(L), new Float32Array(L)];
    const pre = Math.floor(0.008 * fs);
    const ers = E.er.slice();
    for (let s = 0; s < (E.scatter || 0); s++) ers.push([0.01 + R() * 0.12, 0.08 + R() * 0.18]);
    for (let ch = 0; ch < 2; ch++) {
      const x = chans[ch];
      let lp = 0;
      for (let i = pre; i < L; i++) {
        const t = i / fs, fc = E.damp[1] + (E.damp[0] - E.damp[1]) * Math.exp(-t / (E.tau * 1.2));
        lp += (1 - Math.exp((-TAU * fc) / fs)) * (R() * 2 - 1 - lp);
        x[i] = E.diffuse * lp * Math.exp(-t / E.tau) * Math.min(1, (t - 0.008) / 0.03);
      }
      for (const [t0, g] of ers) {
        const s0 = Math.floor((t0 + (ch ? 1 : -1) * R() * 0.0025) * fs), sg = R() < 0.3 ? -1 : 1;
        for (let j = 0; j < fs * 0.004 && s0 + j < L; j++) x[s0 + j] += sg * g * Math.exp(-j / (fs * 0.0008)) * (j === 0 ? 1 : 0.4 * (R() * 2 - 1));
      }
      const tl = Math.floor(0.05 * fs);
      for (let i = L - tl; i < L; i++) x[i] *= (L - i) / tl;
      scale(x, 1 / Math.sqrt(x.reduce((s, v) => s + v * v, 0) || 1));
    }
    return chans;
  }
  return { rng32, hashStr, synthTier, genPop, genImpact, genShatter, genGrind, genGravel, genThunder, genLfo, genPink, genIR };
}
const DSP = dspKit();
export const synthTier = DSP.synthTier;
const { rng32, hashStr, genPop, genImpact, genShatter, genGrind, genGravel, genThunder, genLfo, genPink, genIR } = DSP;

// Procedural room/landscape impulse responses: discrete reflections (buildings, grandstands,
// canyon walls, mountains) + a darkening diffuse tail. Unit energy; level is set by the send.
const ENVS = {
  gp: { len: 1.3, tau: 0.26, er: [[0.042, 0.45], [0.088, 0.32], [0.135, 0.26], [0.2, 0.16], [0.29, 0.1]], diffuse: 0.35, damp: [6000, 1400], wet: 0.16 },
  city: { len: 1.2, tau: 0.3, er: [[0.011, 0.6], [0.017, 0.5], [0.024, 0.5], [0.033, 0.42], [0.046, 0.36], [0.061, 0.3], [0.08, 0.26], [0.104, 0.2], [0.13, 0.16]], diffuse: 0.55, damp: [7500, 2200], wet: 0.26 },
  coast: { len: 0.9, tau: 0.14, er: [[0.15, 0.22], [0.32, 0.1]], diffuse: 0.18, damp: [4500, 1200], wet: 0.08 },
  desert: { len: 1.5, tau: 0.3, er: [[0.17, 0.42], [0.39, 0.3], [0.66, 0.2], [0.95, 0.12]], diffuse: 0.25, damp: [5000, 1100], wet: 0.15 },
  alpine: { len: 1.6, tau: 0.42, er: [[0.24, 0.36], [0.52, 0.3], [0.88, 0.22], [1.3, 0.14]], diffuse: 0.3, damp: [4200, 900], wet: 0.14 },
  forest: { len: 1.1, tau: 0.36, er: [], scatter: 40, diffuse: 0.6, damp: [3600, 800], wet: 0.17 },
};

// ---------------------------------------------------------------- engine voice
class EngineVoice {
  constructor(sys, spec, { positional = false, lite = false } = {}) {
    const ctx = sys.ctx, eng = spec.engine || {};
    this.sys = sys; this.ctx = ctx; this.spec = spec; this.lite = lite;
    this.P = eng.electric ? ENGINES.electric : ENGINES[eng.sound] || ENGINES.i4;
    this.redline = eng.redline || 10000; this.idle = eng.idle ?? 1000;
    this.vol = 1;
    this.out = sys._gain(0);
    this.post = positional ? sys._filter('lowpass', 16000, 0.5) : sys._gain(1);
    this.out.connect(this.post);
    if (positional) {
      this.panner = ctx.createPanner();
      Object.assign(this.panner, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 5, maxDistance: 400, rolloffFactor: 1.3 });
      this.post.connect(this.panner); this.panner.connect(sys.sfx);
    } else this.post.connect(sys.sfx);
    this.rev = sys._gain(positional ? 0.3 : 0.22);
    this.post.connect(this.rev); this.rev.connect(sys.revIn);
    this.popBus = sys._gain(1); this.popBus.connect(this.post);
    this.cut = sys._gain(1);
    this.src = [];
    this._lt = ctx.currentTime; this.cutNext = 0; this._blipEnd = 0; this._brapEnd = 0; this._thr = 0;
    this.built = false;
    if (this.P.electric) this._buildElectric();
    else if (lite && !sys._engReady(this.P)) sys._whenReady(this.P, () => { if (!this._stopped) this._buildICE(); }); // rival: buffers still synthesizing
    else this._buildICE();
  }

  _buildICE() {
    const { ctx, sys, P } = this;
    const E = sys._engineSet(P);
    this.base = E.base.slice();
    this.mix = ctx.createChannelSplitter(2);
    const t0 = ctx.currentTime + 0.02;
    this.gL = []; this.gO = [];
    for (let i = 0; i < this.base.length; i++) {
      for (const [buf, arr] of [[E.load[i], this.gL], [E.over[i], this.gO]]) {
        const s = ctx.createBufferSource();
        s.buffer = buf; s.loop = true;
        s.playbackRate.value = Math.max(this.idle, 300) / this.base[i];
        const g = sys._gain(0);
        s.connect(g); g.connect(this.mix);
        s.start(t0); // every tier starts at crank 0 together: pulses stay phase-locked across crossfades
        this.src.push(s); arr.push(g);
      }
    }
    this.exLP = sys._filter('lowpass', P.lp[0], 0.7);
    this.exPk = sys._filter('peaking', P.pk[0], P.pk[2], P.pk[1]);
    this.exG = sys._gain(1);
    this.mix.connect(this.exLP, 0); this.exLP.connect(this.exPk); this.exPk.connect(this.exG); this.exG.connect(this.cut);
    this.built = true;
    if (this.lite) { this.cut.connect(this.out); return; }
    this.inLP = sys._filter('lowpass', 800, 0.6); this.inG = sys._gain(0);
    this.mix.connect(this.inLP, 1); this.inLP.connect(this.inG); this.inG.connect(this.cut);
    // slow combustion variability on the whole voice (also hides the loop period)
    this.lope = sys._gain(1);
    this.cut.connect(this.lope); this.lope.connect(this.out);
    const lfo = sys._src(sys.lfoBuf, true, Math.random() * 3); lfo.playbackRate.value = 1.3;
    const d = sys._gain(0.06); lfo.connect(d); d.connect(this.lope.gain);
    // straight-cut gearbox whine (rpm locked) and chain whine (road speed locked)
    this.trO = sys._osc(sys.waves.trans, 100); this.trG = sys._gain(0); this.trO.connect(this.trG); this.trG.connect(this.out);
    this.chO = sys._osc(sys.waves.chain, 50); this.chG = sys._gain(0); this.chO.connect(this.chG); this.chG.connect(this.out);
    this.src.push(lfo, this.trO, this.chO);
  }

  _buildElectric() {
    const { sys, P } = this;
    this.built = true;
    this.eLP = sys._filter('lowpass', 6000, 0.6);
    this.eLP.connect(this.cut); this.cut.connect(this.out);
    // motor: electrical orders (4 pole pairs) + torque-ripple orders, all locked to the rotor
    this.mO = sys._osc(sys.waves.motor, 10); this.mG = sys._gain(0); this.mO.connect(this.mG); this.mG.connect(this.eLP);
    // straight-cut primary reduction gear mesh
    this.geO = sys._osc(sys.waves.gear, 100); this.geG = sys._gain(0); this.geO.connect(this.geG); this.geG.connect(this.eLP);
    this.src.push(this.mO, this.geO);
    if (this.lite) return;
    // inverter: PWM carrier ring-modulated by twice the electrical frequency (sidebands only) + switching hiss
    this.invO = sys._osc('sine', P.pwm); this.modO = sys._osc('sine', 100); this.invRM = sys._gain(0);
    this.invO.connect(this.invRM); this.modO.connect(this.invRM.gain);
    this.invG = sys._gain(0); this.invRM.connect(this.invG); this.invG.connect(this.out);
    const h = sys._src(sys.noise, true, Math.random());
    this.hBP = sys._filter('bandpass', 8500, 2.2); this.hG = sys._gain(0);
    h.connect(this.hBP); this.hBP.connect(this.hG); this.hG.connect(this.out);
    this.chO = sys._osc(sys.waves.chain, 50); this.chG = sys._gain(0); this.chO.connect(this.chG); this.chG.connect(this.out);
    this.src.push(this.invO, this.modO, h, this.chO);
  }

  // rpm, throttle 0..1; opts: limiter, dopp (doppler factor), load (0 = clutch/shift, <1 free-revving),
  // decel, onboard (helmet cam), dist (camera distance), nitro, tc (traction-control cut 0..1), speed (m/s)
  set(rpm, throttle, o = {}) {
    const t = this.ctx.currentTime, P = this.P;
    const dt = clamp(t - this._lt, 0, 0.1);
    this._lt = t;
    const dopp = o.dopp || 1;
    rpm = Math.max(60, rpm || 0);
    if (!this.built) return;
    if (P.electric) { this._setElectric(rpm, throttle, o, t, dopp); return; }
    const red = this.redline, idle = this.idle;
    const r = clamp(rpm / red, 0, 1.05);
    let thr = clamp(throttle || 0, 0, 1) * clamp(o.load ?? 1, 0, 1.2);
    if (t < this._blipEnd) thr = Math.max(thr, 0.8);
    const m = Math.pow(clamp(thr, 0, 1), 0.6);
    // rpm tiers: equal-power crossfade of the two nearest tiers in log-rpm
    const B = this.base, n = B.length;
    let i = 0;
    while (i < n - 2 && rpm > B[i + 1]) i++;
    const f = clamp(Math.log(rpm / B[i]) / Math.log(B[i + 1] / B[i]), 0, 1);
    const wa = Math.cos((f * Math.PI) / 2), wb = Math.sin((f * Math.PI) / 2);
    const offL = lerp(0.62, 0.3, smooth(idle * 1.1, red * 0.6, rpm)); // overrun level; idle stays present
    for (let k = 0; k < n; k++) {
      const w = k === i ? wa : k === i + 1 ? wb : 0;
      const rate = (rpm * dopp) / B[k]; // all tiers get proportional rates -> crank phase stays locked
      this.src[2 * k].playbackRate.setTargetAtTime(rate, t, 0.012);
      this.src[2 * k + 1].playbackRate.setTargetAtTime(rate, t, 0.012);
      this.gL[k].gain.setTargetAtTime(w * m, t, 0.025);
      this.gO[k].gain.setTargetAtTime(w * (1 - m) * offL, t, 0.025);
    }
    // muffler brightness opens with throttle and rpm; re-ignition "brap" after a quickshift
    const brap = t < this._brapEnd ? 1 : 0;
    const bright = clamp(0.3 * r + 0.7 * m * (0.35 + 0.65 * r), 0, 1);
    let fc = lerp(P.lp[0], P.lp[1], bright) * (o.onboard ? 0.78 : 1) * (o.nitro ? 1.15 : 1) * (1 + 0.3 * brap);
    const dist = o.dist || 0, far = dist > 7 ? 7 / dist : 1; // TV camera: distance + air absorption
    if (far < 1) fc = Math.min(fc, 1500 + 16000 * far);
    this.exLP.frequency.setTargetAtTime(fc, t, 0.03);
    let g = P.gain * this.vol * (0.34 + 0.66 * Math.pow(Math.min(r, 1), 0.85));
    if (P.band) { // two-stroke expansion chambers "on the pipe"
      const pb = smooth(P.band[0] - 0.12, P.band[0], r) * (1 - smooth(P.band[1], P.band[1] + 0.06, r)) * m;
      this.exPk.gain.setTargetAtTime(P.pk[1] + P.band[2] * pb, t, 0.05);
      g *= 1 + P.band[3] * pb;
    }
    if (o.nitro) g *= 1.12;
    g *= (1 + 0.22 * brap) * Math.pow(far, 0.9);
    this.exG.gain.setTargetAtTime(o.onboard ? 0.82 : 1, t, 0.1);
    this.out.gain.setTargetAtTime(g, t, 0.03);
    if (!this.lite) {
      const onb = o.onboard ? 1.7 : 0.65;
      this.inG.gain.setTargetAtTime(P.intMix * (0.12 + 0.88 * m) * (0.25 + 0.75 * r) * onb, t, 0.03);
      this.inLP.frequency.setTargetAtTime(600 + 6500 * m * (0.3 + 0.7 * r), t, 0.03);
      this.trO.frequency.setTargetAtTime((rpm / 60) * P.mech.trans * dopp, t, 0.02);
      this.trG.gain.setTargetAtTime(0.012 * (0.3 + 0.7 * m) * r * (o.onboard ? 2 : 0.8), t, 0.05);
      const v = o.speed || 0;
      this.chO.frequency.setTargetAtTime(Math.max(5, v * 23), t, 0.03);
      this.chG.gain.setTargetAtTime(0.008 * clamp(v / 40, 0, 1) * (0.4 + 0.6 * m) * (o.onboard ? 1.6 : 0.7), t, 0.05);
    }
    this._cuts(t, !!o.limiter, o.tc || 0);
    // overrun: burble + crackles, a bang when the throttle snaps shut at high rpm
    const decel = o.decel ?? (throttle || 0) < 0.05;
    const closing = this._thr > 0.6 && thr < 0.1 && r > 0.55;
    this._thr = thr;
    if (P.pops > 0 && (decel || closing) && r > 0.38) {
      const rate = P.pops * (closing ? 25 : 3.5 * (r - 0.35)) * (this.lite ? 0.6 : 1);
      if (Math.random() < rate * dt) this._crackle(t, closing ? 1 : 0.6);
    }
  }

  _setElectric(rpm, throttle, o, t, dopp) {
    const P = this.P, r = clamp(rpm / this.redline, 0, 1.05);
    const thr = clamp(throttle || 0, 0, 1) * clamp(o.load ?? 1, 0, 1.2);
    const fm = (rpm / 60) * dopp, tq = thr * (r < 0.35 ? 1 : 1 - (r - 0.35) * 0.9);
    const far = (o.dist || 0) > 7 ? 7 / o.dist : 1;
    this.out.gain.setTargetAtTime(P.gain * this.vol * smooth(60, 1400, rpm) * Math.pow(far, 0.9), t, 0.03);
    this.mO.frequency.setTargetAtTime(fm, t, 0.015);
    this.geO.frequency.setTargetAtTime(fm * P.gear, t, 0.015);
    this.mG.gain.setTargetAtTime(0.5 * (0.3 + 0.7 * tq) * (0.45 + 0.55 * r), t, 0.04);
    this.geG.gain.setTargetAtTime(0.3 * (0.4 + 0.6 * tq) * Math.sqrt(Math.min(r, 1)), t, 0.04);
    this.eLP.frequency.setTargetAtTime(Math.min(2500 + 9000 * (0.25 + 0.75 * tq) * (0.4 + 0.6 * r), 1500 + 16000 * far), t, 0.04);
    if (this.lite) return;
    this.modO.frequency.setTargetAtTime(fm * 8, t, 0.015);
    this.invG.gain.setTargetAtTime(0.05 * tq, t, 0.04);
    this.hG.gain.setTargetAtTime(0.03 * (0.15 + tq), t, 0.05);
    const v = o.speed || 0;
    this.chO.frequency.setTargetAtTime(Math.max(5, v * 23), t, 0.03);
    this.chG.gain.setTargetAtTime(0.02 * clamp(v / 40, 0, 1) * (o.onboard ? 1.6 : 0.8), t, 0.05);
  }

  // ignition cuts: hard rev limiter stutter, lighter irregular traction-control cuts
  _cuts(t, lim, tc) {
    if (!lim && tc < 0.12) { this.cutNext = 0; return; }
    const c = this.cut.gain, P = this.P;
    if (this.cutNext < t) this.cutNext = t + 0.004;
    while (this.cutNext < t + 0.07) {
      const s = this.cutNext;
      if (lim) {
        const d = P.lim[1] * (0.8 + 0.4 * Math.random());
        c.setTargetAtTime(0.1, s, 0.003); c.setTargetAtTime(1, s + d, 0.005);
        if (Math.random() < 0.18 * P.pops) this.sys._pop(this.popBus, 0.25 * P.gain * this.vol, s + d * 0.6);
        this.cutNext = s + P.lim[0] * (0.85 + 0.3 * Math.random());
      } else {
        const d = 0.012 + 0.02 * Math.random() * tc;
        c.setTargetAtTime(1 - 0.75 * clamp(tc * 1.4, 0, 1), s, 0.003); c.setTargetAtTime(1, s + d, 0.005);
        this.cutNext = s + 0.035 + 0.08 * Math.random();
      }
    }
  }

  _crackle(t, s) {
    const n = 1 + Math.floor(Math.random() * (s > 0.8 ? 3 : 2));
    let when = t + Math.random() * 0.02;
    for (let k = 0; k < n; k++) {
      this.sys._pop(this.popBus, s * (0.5 + 0.5 * Math.random()) * this.P.gain * this.vol * (k ? 0.6 : 1), when);
      when += 0.03 + Math.random() * 0.07;
    }
  }

  // gear change: quickshifter ignition cut + re-ignition "brap" (up), auto-blip + crackle (down)
  shift(dir) {
    if (this.P.electric || !this.built) return;
    const t = this.ctx.currentTime + 0.003, c = this.cut.gain;
    c.cancelScheduledValues(t);
    this.cutNext = 0;
    if (dir > 0) {
      const d = 0.04 + Math.random() * 0.015;
      c.setTargetAtTime(0.07, t, 0.004); c.setTargetAtTime(1, t + d, 0.004);
      this._brapEnd = t + d + 0.07;
      if (Math.random() < 0.35 * this.P.pops) this.sys._pop(this.popBus, 0.3 * this.P.gain * this.vol, t + d * 0.5);
    } else {
      c.setTargetAtTime(1, t, 0.01);
      this._blipEnd = t + 0.085;
      if (Math.random() < 0.7 * this.P.pops) this._crackle(t + 0.12, 0.7);
    }
  }

  setPosition(x, y, z) {
    if (!this.panner) return;
    const t = this.ctx.currentTime, pn = this.panner;
    if (pn.positionX) { pn.positionX.setTargetAtTime(x, t, 0.02); pn.positionY.setTargetAtTime(y, t, 0.02); pn.positionZ.setTargetAtTime(z, t, 0.02); } else pn.setPosition(x, y, z);
    const L = this.sys.lis, d = Math.hypot(x - L.x, y - L.y, z - L.z);
    this.post.frequency.setTargetAtTime(clamp(17000 * Math.exp(-d / 80), 2200, 17000), t, 0.05); // air absorption
    this.rev.gain.setTargetAtTime(0.18 + 0.5 * smooth(6, 90, d), t, 0.1); // farther = more reverberant
  }

  // exhaust directivity: louder/brighter behind the bike than in front of it
  setHeading(h) {
    const pn = this.panner;
    if (!pn) return;
    if (!this._cone) { this._cone = true; pn.coneInnerAngle = 160; pn.coneOuterAngle = 340; pn.coneOuterGain = 0.55; }
    const t = this.ctx.currentTime, ox = -Math.sin(h), oz = -Math.cos(h);
    if (pn.orientationX) { pn.orientationX.setTargetAtTime(ox, t, 0.03); pn.orientationY.setTargetAtTime(0, t, 0.03); pn.orientationZ.setTargetAtTime(oz, t, 0.03); } else pn.setOrientation(ox, 0, oz);
  }

  fade(to, time = 0.3) { this.out.gain.setTargetAtTime(to, this.ctx.currentTime, time / 3); }

  stop() {
    this._stopped = true;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.05);
    this.popBus.gain.setTargetAtTime(0, t, 0.05);
    const nodes = this.src;
    setTimeout(() => {
      for (const s of nodes) { try { s.stop(); } catch (e) { /* noop */ } }
      try { (this.panner || this.post).disconnect(); this.rev.disconnect(); } catch (e) { /* noop */ }
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
const MAX_SHOTS = 24;

export class AudioSystem {
  constructor() {
    this.ctx = null; this.ready = false;
    this._eng = {}; this._jobs = []; this._shots = 0; this._irs = {}; this._waiters = {}; this._inflight = new Map();
    this.lis = { x: 0, y: 0, z: 0 }; this.env = 'gp'; this.envWet = false;
  }

  // ctxOverride: render into a given (e.g. Offline) AudioContext — used by the audio test harness.
  init(ctxOverride) {
    if (this.ctx && !ctxOverride) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    let ctx = ctxOverride;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC({ latencyHint: 'interactive' });
    }
    this.ctx = ctx;
    this._eng = {}; this._irs = {}; this.B = {}; this._waiters = {}; this._inflight = new Map(); this._jobs = [];
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 8; this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004; this.comp.release.value = 0.18;
    this.master.connect(this.comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.connect(this.master);
    this.ui = ctx.createGain(); this.ui.connect(this.master);
    const fs = ctx.sampleRate, R = rng32(12345);
    const white = new Float32Array(fs * 2);
    for (let i = 0; i < white.length; i++) white[i] = R() * 2 - 1;
    this.noise = this._mkBuf([white]);
    this.pink = this._mkBuf([genPink(fs, R)]);
    this.lfoBuf = this._mkBuf([genLfo(8000, R)], 8000);
    this.B.grind = [this._mkBuf([genGrind(fs, R)])];
    this.B.gravel = [this._mkBuf([genGravel(fs, R)])];
    this.waves = {
      motor: this._wave({ 4: 1, 8: 0.32, 12: 0.55, 16: 0.12, 24: 0.3, 36: 0.07, 48: 0.14 }),
      gear: this._wave({ 1: 1, 2: 0.35, 3: 0.12 }),
      trans: this._wave({ 1: 1, 2: 0.3, 3: 0.1 }),
      chain: this._wave({ 1: 1, 2: 0.6, 3: 0.35, 4: 0.2, 5: 0.1 }),
      squeal: this._wave({ 1: 1, 2: 0.5, 3: 0.28, 4: 0.12, 5: 0.06 }),
      pulse: this._pulseWave(0.22, 16),
    };
    // shared procedural reverb (environment dependent)
    this.revIn = this._gain(1); this.revOut = this._gain(0.16); this.revOut.connect(this.sfx);
    this.conv = null;
    this.musicPlayer = new Music(this);
    this.applyVolumes();
    this.setEnvironment(this.env, { wet: this.envWet });
    this._buildLayers();
    this.ready = true;
    if (this._pendingMusic) { this.playMusic(this._pendingMusic); this._pendingMusic = null; }
  }

  // ---- node helpers
  _gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  _filter(type, f, q = 0.7, db = 0) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (db) b.gain.value = db; return b; }
  _osc(wave, f) {
    const o = this.ctx.createOscillator();
    if (typeof wave === 'string') o.type = wave; else o.setPeriodicWave(wave);
    o.frequency.value = f; o.start();
    return o;
  }
  _src(buf, loop = true, offset = 0) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; s.start(this.ctx.currentTime, offset % buf.duration); return s; }
  _mkBuf(chans, fs = this.ctx.sampleRate) {
    const b = this.ctx.createBuffer(chans.length, chans[0].length, fs);
    chans.forEach((c, i) => { if (b.copyToChannel) b.copyToChannel(c, i); else b.getChannelData(i).set(c); });
    return b;
  }
  _wave(h) {
    const n = Math.max(...Object.keys(h).map(Number)) + 1, re = new Float32Array(n), im = new Float32Array(n);
    for (const k of Object.keys(h)) im[k] = h[k];
    return this.ctx.createPeriodicWave(re, im);
  }
  _pulseWave(duty, n) { // narrow rectangular pulse train (kerb ridge thumps)
    const re = new Float32Array(n + 1), im = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) re[k] = Math.sin(k * Math.PI * duty) / k;
    return this.ctx.createPeriodicWave(re, im);
  }

  // ---- engine buffers (cached per layout & sample rate; generated lazily or prewarmed in the background)
  _engCache(P) {
    const key = P.id + '@' + this.ctx.sampleRate;
    return this._eng[key] || (this._eng[key] = { base: [], load: [], over: [] });
  }
  _engReady(P) {
    const E = this._engCache(P);
    for (let i = 0; i < P.tiers.length; i++) if (!E.load[i]) return false;
    return true;
  }
  _storeTier(P, ti, r) {
    const E = this._engCache(P);
    if (E.load[ti]) return;
    E.base[ti] = r.base; E.load[ti] = this._mkBuf(r.load); E.over[ti] = this._mkBuf(r.over);
    const key = P.id + '@' + this.ctx.sampleRate, w = this._waiters[key];
    if (w && this._engReady(P)) { delete this._waiters[key]; for (const cb of w) cb(); }
  }
  _genTier(P, ti) {
    if (!this._engCache(P).load[ti]) this._storeTier(P, ti, synthTier(P, ti, this.ctx.sampleRate));
  }
  _engineSet(P) {
    for (let i = 0; i < P.tiers.length; i++) this._genTier(P, i);
    return this._engCache(P);
  }
  _whenReady(P, cb) {
    if (this._engReady(P)) { cb(); return; }
    const key = P.id + '@' + this.ctx.sampleRate;
    (this._waiters[key] || (this._waiters[key] = [])).push(cb);
    this._queue(P);
  }
  // Background synthesis of engine buffers: in a Web Worker (built from the DSP kit's source) when
  // possible, otherwise in small main-thread slices between frames.
  prewarm(specs = []) {
    if (!this.ctx) return;
    for (const sp of specs) {
      const e = sp && sp.engine;
      if (!e || e.electric) continue;
      this._queue(ENGINES[e.sound] || ENGINES.i4);
    }
  }
  _queue(P) {
    if (P.electric) return;
    const E = this._engCache(P), fs = this.ctx.sampleRate, w = this._getWorker();
    for (let i = 0; i < P.tiers.length; i++) {
      const key = P.id + ':' + i + '@' + fs;
      if (E.load[i] || this._inflight.has(key) || this._jobs.some((j) => j.key === key)) continue;
      const job = { key, P, ti: i };
      if (w) { this._inflight.set(key, job); w.postMessage({ id: key, P, ti: i, fs }); } else this._jobs.push(job);
    }
    this._pump();
  }
  _getWorker() {
    if (this._worker !== undefined) return this._worker;
    this._worker = null;
    try {
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return null;
      const src = `const DSP=(${dspKit.toString()})();onmessage=(e)=>{const d=e.data;try{const r=DSP.synthTier(d.P,d.ti,d.fs);` +
        'postMessage({id:d.id,r},[r.load[0].buffer,r.load[1].buffer,r.over[0].buffer,r.over[1].buffer]);}catch(err){postMessage({id:d.id,err:String(err)});}};';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = (e) => {
        const d = e.data, job = this._inflight.get(d.id);
        if (!job) return;
        this._inflight.delete(d.id);
        this.workerOk = true;
        if (d.r && this.ctx && d.id.endsWith('@' + this.ctx.sampleRate)) this._storeTier(job.P, job.ti, d.r);
        else if (!d.r) { this._jobs.push(job); this._pump(); }
      };
      w.onerror = (ev) => { // e.g. workers blocked for this origin: fall back to the main thread
        if (ev && ev.preventDefault) ev.preventDefault();
        this._worker = null; this.workerOk = false;
        for (const job of this._inflight.values()) this._jobs.push(job);
        this._inflight.clear();
        try { w.terminate(); } catch (e) { /* noop */ }
        this._pump();
      };
      this._worker = w;
    } catch (e) { this._worker = null; }
    return this._worker;
  }
  _pump() {
    if (this._pumping || !this._jobs.length) return;
    this._pumping = true;
    setTimeout(() => {
      this._pumping = false;
      const j = this._jobs.shift();
      if (j && this.ctx) this._genTier(j.P, j.ti);
      this._pump();
    }, 16);
  }

  // ---- environment reverb
  setEnvironment(theme = 'gp', o = {}) {
    this.env = ENVS[theme] ? theme : 'gp'; this.envWet = !!o.wet;
    if (!this.ctx) return;
    const E = ENVS[this.env], key = this.env + '@' + this.ctx.sampleRate;
    if (!this._irs[key]) this._irs[key] = this._mkBuf(genIR(this.ctx.sampleRate, E, rng32(hashStr(this.env))));
    if (!this.conv || this.conv.buffer !== this._irs[key]) {
      const conv = this.ctx.createConvolver();
      conv.normalize = false; conv.buffer = this._irs[key];
      if (this.conv) { try { this.revIn.disconnect(this.conv); this.conv.disconnect(); } catch (e) { /* noop */ } }
      this.revIn.connect(conv); conv.connect(this.revOut);
      this.conv = conv;
    }
    this.revOut.gain.setTargetAtTime(E.wet * (this.envWet ? 1.12 : 1), this.ctx.currentTime, 0.1);
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
    this.lis.x = p.x; this.lis.y = p.y; this.lis.z = p.z;
    const f = cam.getWorldDirection(this._fwd || (this._fwd = cam.position.clone()));
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(0, t, 0.02); l.upY.setTargetAtTime(1, t, 0.02); l.upZ.setTargetAtTime(0, t, 0.02);
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
  }

  // ---- continuous layers: wind, tyres, road, kerbs, off-road, scrape
  _buildLayers() {
    const L = (this.L = {}), bus = (L.bus = this._gain(1));
    bus.connect(this.sfx);
    const white = this._src(this.noise, true, Math.random() * 1.5), pink = this._src(this.pink, true, Math.random() * 1.5);
    const path = (src, ...nodes) => { let n = src; for (const x of nodes) { n.connect(x); n = x; } n.connect(bus); return n; };
    const lfo = (rate, depth, param) => { const s = this._src(this.lfoBuf, true, Math.random() * 4); s.playbackRate.value = rate; const d = this._gain(depth); s.connect(d); d.connect(param); return [s, d]; };
    // wind: low helmet buffeting (gusty), mid roar rising in pitch with speed, high hiss
    L.windLow = path(pink, this._filter('lowpass', 190, 0.8), this._gain(0));
    [L.buffSrc, L.buffD] = lfo(0.5, 0, L.windLow.gain);
    L.windBP = this._filter('bandpass', 500, 0.6); L.windMid = path(pink, L.windBP, this._gain(0));
    L.windHigh = path(white, this._filter('highpass', 2800, 0.7), this._filter('lowpass', 9000, 0.7), this._gain(0));
    // tyre squeal: tonal stick-slip squeal with jittery pitch + flutter, and rubber scrub noise
    L.sqO = this._osc(this.waves.squeal, 900);
    L.sqAM = this._gain(1);
    L.sqG = path(L.sqO, this._filter('bandpass', 1400, 1.6), L.sqAM, this._gain(0));
    [, L.sqJit] = lfo(2.5, 30, L.sqO.frequency);
    lfo(6, 0.5, L.sqAM.gain);
    L.scrubG = path(white, this._filter('bandpass', 2100, 0.8), this._gain(0));
    // tyre-on-road roar (dry) and spray hiss (wet)
    L.roadG = path(pink, this._filter('lowpass', 650, 0.7), this._gain(0));
    L.wetG = path(white, this._filter('highpass', 1800, 0.7), this._gain(0));
    // kerb ridges: thump train locked to speed / ridge spacing, plus rattle amplitude-modulated by it
    L.curbO = this._osc(this.waves.pulse, 40);
    L.curbG = this._gain(0); L.curbG.connect(bus);
    const clp = this._filter('lowpass', 420, 0.9); L.curbO.connect(clp); clp.connect(L.curbG);
    const ratAM = this._gain(0), ratD = this._gain(0.6);
    white.connect(this._filter('bandpass', 1000, 1.1)).connect(ratAM); L.curbO.connect(ratD); ratD.connect(ratAM.gain); ratAM.connect(L.curbG);
    // off-road: gravel grains, dirt rumble with bumps, grass swish
    L.grSrc = this._src(this.B.gravel[0], true, Math.random() * 2);
    L.grG = path(L.grSrc, this._filter('highpass', 350, 0.7), this._gain(0));
    const dirtAM = this._gain(1);
    L.dirtG = path(pink, this._filter('lowpass', 140, 0.8), dirtAM, this._gain(0));
    [L.dirtLfo] = lfo(3, 0.6, dirtAM.gain);
    L.grassG = path(white, this._filter('bandpass', 3800, 0.7), this._gain(0));
    // metal / plastic scraping on asphalt
    L.scSrc = this._src(this.B.grind[0], true, Math.random() * 2);
    L.scG = path(L.scSrc, this._gain(0));
    L.slideG = path(pink, this._filter('lowpass', 900, 0.7), this._gain(0));
    // nitro injection hiss
    L.niG = path(white, this._filter('bandpass', 4500, 0.6), this._gain(0));
  }

  // speed m/s, slip 0..1; optional: curb, offRoad, gravel, airborne, wet, onboard, nitro, dist
  layers(o = {}) {
    if (!this.ctx || !this.L) return;
    const { speed = 0, slip = 0, scrape = 0, rumble = 0 } = o;
    const t = this.ctx.currentTime, L = this.L, tc = 0.06;
    const set = (g, v, k = tc) => g.gain.setTargetAtTime(v, t, k);
    const v = Math.max(0, speed), w = clamp(v / 80, 0, 1.3), onb = o.onboard ? 1 : 0;
    const near = (o.dist || 0) > 12 ? 12 / o.dist : 1; // TV camera: rolling noise from afar, no rider wind
    const windK = near < 1 ? 0.15 : 1, ground = o.airborne ? 0 : near;
    // wind
    const wl = w * w * 0.3 * (0.55 + 0.6 * onb) * windK;
    set(L.windLow, wl, 0.1); set(L.buffD, wl * 0.8, 0.1);
    L.buffSrc.playbackRate.setTargetAtTime(0.4 + w * 2.2, t, 0.2);
    set(L.windMid, Math.pow(w, 2.2) * 0.16 * windK, 0.1);
    L.windBP.frequency.setTargetAtTime(300 + w * 1300, t, 0.1);
    set(L.windHigh, Math.pow(w, 3) * 0.07 * (0.7 + 0.6 * onb) * windK, 0.1);
    // tyres
    const s = clamp(slip, 0, 1) * ground, wet = o.wet ? 1 : 0;
    const sq = smooth(0.12, 0.65, s) * (wet ? 0.3 : 1) * clamp(v / 6, 0, 1);
    set(L.sqG, sq * 0.085, 0.04);
    L.sqO.frequency.setTargetAtTime(780 + 420 * s + v * 1.5, t, 0.05);
    L.sqJit.gain.setTargetAtTime(18 + 50 * s, t, 0.05);
    set(L.scrubG, clamp(s * 1.3, 0, 1) * 0.13 * clamp(v / 10, 0, 1), 0.04);
    const offR = o.offRoad !== undefined ? (o.offRoad ? 1 : 0) : clamp(rumble, 0, 1);
    set(L.roadG, Math.pow(clamp(v / 60, 0, 1), 1.5) * 0.05 * ground * (offR ? 0.3 : 1));
    set(L.wetG, wet * clamp(v / 50, 0, 1) * 0.09 * ground);
    // kerbs (ridges every ~0.55 m)
    const curb = o.curb ? 1 : 0;
    L.curbO.frequency.setTargetAtTime(Math.max(4, v / 0.55), t, 0.03);
    set(L.curbG, curb * clamp(v / 8, 0, 1) * 0.32 * ground, 0.03);
    // off-road surfaces
    const gr = o.gravel ? 1 : 0, sp = clamp(v / 20, 0, 1.4) * offR * ground;
    L.grSrc.playbackRate.setTargetAtTime(0.6 + v / 25, t, 0.1);
    L.dirtLfo.playbackRate.setTargetAtTime(1 + v / 8, t, 0.1);
    set(L.grG, sp * (gr ? 0.4 : 0.1)); set(L.dirtG, sp * (gr ? 0.25 : 0.35)); set(L.grassG, sp * (gr ? 0.02 : 0.06));
    // scraping metal + sliding body
    const sc = clamp(scrape, 0, 1) * near;
    set(L.scG, sc * 0.35, 0.03); set(L.slideG, sc * 0.16 * clamp(v / 8, 0, 1), 0.05);
    L.scSrc.playbackRate.setTargetAtTime(0.7 + clamp(v / 30, 0, 1) * 0.6, t, 0.1);
    set(L.niG, o.nitro ? 0.04 : 0, 0.08);
  }

  silenceLayers() { this.layers({}); }

  // ---- one-shots
  // Plays a buffer once (or looped for `dur`). Capped concurrency; returns {s, g} or null.
  _play(buf, { dest = this.sfx, gain = 1, rate = 1, when = 0, rev = 0, loop = false, dur = 0, filter = null, cap = MAX_SHOTS } = {}) {
    if (!this.ctx || !buf || this._shots >= cap) return null;
    const ctx = this.ctx, t = Math.max(ctx.currentTime, when || 0);
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; s.playbackRate.value = rate;
    const g = this._gain(gain);
    const f = filter ? this._filter(filter[0], filter[1], filter[2]) : null;
    if (f) { s.connect(f); f.connect(g); } else s.connect(g);
    g.connect(dest);
    if (rev > 0 && this.revIn) { const r = this._gain(rev); g.connect(r); r.connect(this.revIn); }
    this._shots++;
    s.onended = () => { this._shots--; try { g.disconnect(); } catch (e) { /* noop */ } };
    s.start(t, loop ? Math.random() * buf.duration : 0);
    if (dur > 0) s.stop(t + dur); else if (loop) s.stop(t + 1);
    return { s, g, f, t };
  }
  _buf(name) {
    if (this.B[name]) return this.B[name];
    const fs = this.ctx.sampleRate, R = rng32(hashStr(name));
    const gen = { pops: [6, genPop], impact: [3, genImpact], shatter: [2, genShatter], thunder: [2, genThunder] }[name];
    const tfs = name === 'thunder' ? 22050 : fs;
    return (this.B[name] = Array.from({ length: gen[0] }, () => this._mkBuf([gen[1](tfs, R)], tfs)));
  }
  _pick(name) { const b = this._buf(name); return b[(Math.random() * b.length) | 0]; }
  // exhaust backfire / overrun pop (short crack + body + after-crackle, with reverb tail)
  _pop(dest, s = 1, when = 0) {
    if (!this.ctx) return null;
    return this._play(this._pick('pops'), { dest: dest || this.sfx, gain: 0.42 * s, rate: 0.8 + Math.random() * 0.45, when, rev: dest ? 0 : 0.5, cap: 14 });
  }
  _impact(s = 1, when = 0) {
    if (!this.ctx) return;
    const k = clamp(s, 0.1, 1.6);
    this._play(this._pick('impact'), { gain: 0.62 * k, rate: 1.12 - 0.25 * Math.min(k, 1.2) + Math.random() * 0.1, when, rev: 0.35 });
  }
  _noiseHit(type, freq, dur, vol, dest = this.sfx, q = 1, when = 0) {
    if (!this.ctx) return;
    const t = Math.max(this.ctx.currentTime, when);
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const f = this._filter(type, freq, q);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(dest); n.start(t, Math.random()); n.stop(t + dur + 0.02);
  }
  _blip(freq, dur, type = 'sine', vol = 0.2, dest = this.ui, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  hover() { this._blip(1800, 0.04, 'sine', 0.05); }
  click() { this._blip(900, 0.07, 'triangle', 0.14); this._blip(1350, 0.06, 'sine', 0.06); }
  back() { this._blip(600, 0.09, 'triangle', 0.12, this.ui, 0.6); }
  select() { this._blip(660, 0.12, 'square', 0.06); setTimeout(() => this._blip(990, 0.18, 'square', 0.06), 70); }
  beep(high = false) { this._blip(high ? 1320 : 660, high ? 0.6 : 0.25, 'square', 0.12, this.sfx); }
  lap() { [880, 1108, 1318].forEach((f, i) => setTimeout(() => this._blip(f, 0.2, 'triangle', 0.12, this.sfx), i * 90)); }
  fanfare() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => setTimeout(() => this._blip(f, 0.3, 'square', 0.08, this.sfx), i * 140)); }
  warn() { this._blip(440, 0.2, 'sawtooth', 0.08, this.sfx); setTimeout(() => this._blip(440, 0.2, 'sawtooth', 0.08, this.sfx), 260); }
  // barrier / bump impact: low thump, body, plastic crack, metal modes
  impact(s = 1) { this._impact(s, 0); }
  // crash: impact + plastic shatter + metal grinding that slows down + body slide + tumbling hits
  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._impact(1.45, t);
    this._play(this._pick('shatter'), { gain: 0.5, rate: 0.9 + Math.random() * 0.2, when: t + 0.01, rev: 0.3 });
    const gr = this._play(this.B.grind[0], { gain: 0, loop: true, when: t, rev: 0.2, dur: 2.6 });
    if (gr) {
      gr.g.gain.setValueAtTime(0.0001, t); gr.g.gain.linearRampToValueAtTime(0.38, t + 0.06); gr.g.gain.setTargetAtTime(0, t + 0.5, 0.5);
      gr.s.playbackRate.setValueAtTime(1.2, t); gr.s.playbackRate.exponentialRampToValueAtTime(0.5, t + 2.2);
    }
    const sl = this._play(this.pink, { gain: 0, loop: true, when: t, dur: 2.6, filter: ['lowpass', 900, 0.7] });
    if (sl) { sl.g.gain.setValueAtTime(0.0001, t + 0.1); sl.g.gain.linearRampToValueAtTime(0.26, t + 0.2); sl.g.gain.setTargetAtTime(0, t + 0.6, 0.55); }
    this._impact(0.8, t + 0.26 + Math.random() * 0.1);
    this._impact(0.5, t + 0.6 + Math.random() * 0.15);
    this._impact(0.3, t + 1 + Math.random() * 0.2);
  }
  // gear engagement clack (dog rings)
  shiftClunk() { this._noiseHit('bandpass', 230, 0.045, 0.1, this.sfx, 2.2); this._noiseHit('bandpass', 2600, 0.01, 0.035, this.sfx, 3); }
  pop(dest, s = 1) { this._pop(dest, s); }
  // nitrous purge: sharp hiss + low whump
  nitro() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const a = this._play(this.noise, { gain: 0, loop: true, when: t, dur: 1.1, filter: ['bandpass', 3200, 0.7], rev: 0.2 });
    if (a) { a.g.gain.setValueAtTime(0.0001, t); a.g.gain.exponentialRampToValueAtTime(0.26, t + 0.025); a.g.gain.setTargetAtTime(0.0001, t + 0.3, 0.22); }
    const b = this._play(this.pink, { gain: 0, loop: true, when: t, dur: 0.9, filter: ['lowpass', 420, 0.8] });
    if (b) { b.g.gain.setValueAtTime(0.0001, t); b.g.gain.exponentialRampToValueAtTime(0.32, t + 0.04); b.g.gain.setTargetAtTime(0.0001, t + 0.12, 0.18); }
  }
  thunder() {
    if (!this.ctx) return;
    this._play(this._pick('thunder'), { gain: 0.85, rate: 0.85 + Math.random() * 0.25, rev: 0.5 });
  }
  whoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const w = this._play(this.pink, { gain: 0, loop: true, when: t, dur: 0.8, filter: ['bandpass', 400, 0.9], rev: 0.25 });
    if (!w) return;
    w.g.gain.setValueAtTime(0.0001, t); w.g.gain.exponentialRampToValueAtTime(0.35, t + 0.25); w.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    w.f.frequency.setValueAtTime(300, t); w.f.frequency.exponentialRampToValueAtTime(1400, t + 0.25); w.f.frequency.exponentialRampToValueAtTime(500, t + 0.75);
  }

  playMusic(name) {
    if (!this.ctx) { this._pendingMusic = name; return; }
    this.musicPlayer.play(name);
  }
  stopMusic() { if (this.musicPlayer) this.musicPlayer.stop(); }
}

export const Audio = new AudioSystem();
