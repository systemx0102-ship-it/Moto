// Filmic looks per time of day, adjusted by weather. Display-space grading
// (lift/gamma/gain + split toning) plus how hard the lens reacts to light.
//  lift/gain/gamma: per channel (gamma is the exponent applied, <1 brightens)
//  shadow/high: split-toning offsets added to shadows / highlights
//  streak/flare/dirt/rays: lens amounts · thr: bright-pass threshold (exposed HDR)
//  cut/isolate/desat: streak source (extra threshold, how compact a light must be,
//  how blue-white the streak reads) · sunLine: anamorphic line through the sun
//  rayThr: sky brightness that feeds the sun shafts · rayLen: shaft length (uv)
//  bloom: multiplier over the scene's bloom strength
const BASE = {
  lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], shadow: [0, 0, 0], high: [0, 0, 0],
  sat: 1.12, vib: 0, contrast: 1.05,
  streak: 0.3, streakTint: [0.5, 0.72, 1.0], flare: 0.12, dirt: 0, rays: 0, rayTint: [1, 1, 1],
  thr: 1.5, rayThr: 0.5, rayLen: 0.7, stretch: 0.86, cut: 0.8, isolate: 1.6, desat: 0.5, sunLine: 1, bloom: 1,
};

const TIME = {
  // garage / menus: the original grade, a hint of streak on the bike's lights, no ghosts
  neutral: { streak: 0.22, flare: 0, dirt: 0 },
  day: {
    lift: [0, 0.003, 0.01], gain: [1.03, 1.01, 0.98], shadow: [-0.01, 0, 0.016], high: [0.026, 0.012, -0.016],
    sat: 1.08, vib: 0.2, contrast: 1.09,
    streak: 0.35, flare: 0.3, dirt: 0.55, rays: 0.4, rayTint: [1, 0.95, 0.85], thr: 1.7, rayThr: 0.45, sunLine: 0.8,
  },
  dawn: {
    lift: [0.01, 0.004, 0.03], gamma: [0.98, 1, 1.02], gain: [1.04, 0.99, 0.95], shadow: [-0.006, 0, 0.03], high: [0.045, 0.016, -0.006],
    sat: 1.12, vib: 0.2, contrast: 1.08,
    streak: 0.8, streakTint: [0.62, 0.75, 1.0], flare: 0.4, dirt: 0.5, rays: 0.45, rayTint: [1, 0.85, 0.72], thr: 2.4, rayThr: 0.3, rayLen: 0.8, bloom: 1.05,
  },
  // golden hour: warm highlights, violet-blue shadows, the sun flares the lens
  sunset: {
    lift: [0.014, 0, 0.03], gamma: [0.98, 1, 1.03], gain: [1.05, 0.99, 0.94], shadow: [-0.01, -0.005, 0.035], high: [0.035, 0.014, -0.02],
    sat: 1.12, vib: 0.2, contrast: 1.1,
    streak: 0.9, streakTint: [0.7, 0.8, 1.0], flare: 0.4, dirt: 0.5, rays: 0.35, rayTint: [1, 0.8, 0.55], thr: 2.6, rayThr: 0.6, rayLen: 0.8, desat: 0.35, bloom: 1.05,
  },
  dusk: {
    lift: [0, 0.008, 0.026], gain: [0.98, 1, 1.04], shadow: [-0.01, 0.005, 0.035], high: [0.028, 0.01, -0.012],
    sat: 1.07, vib: 0.25, contrast: 1.08,
    streak: 0.7, flare: 0.35, dirt: 0.45, rays: 0.3, rayTint: [0.85, 0.9, 1], thr: 1.6, rayThr: 0.3,
  },
  // night: teal-blue shadows, neutral-warm lights, neon pops, every lamp streaks
  night: {
    lift: [0, 0.008, 0.02], gamma: [1.02, 1, 0.97], gain: [1.02, 1, 0.98], shadow: [-0.012, 0.008, 0.03], high: [0.022, 0.008, -0.012],
    sat: 1.12, vib: 0.35, contrast: 1.12,
    streak: 0.8, streakTint: [0.45, 0.7, 1.0], flare: 0.35, dirt: 0.35, rays: 0.15, rayTint: [0.6, 0.75, 1], thr: 2.2, rayThr: 0.35, rayLen: 0.5, desat: 0.55, sunLine: 0.4,
  },
};

const add = (a, b) => { for (let i = 0; i < 3; i++) a[i] += b[i]; };
const mul = (a, b) => { for (let i = 0; i < 3; i++) a[i] *= b[i]; };

const WEATHER = {
  clear: null,
  cloudy: (g) => { g.sat *= 0.92; g.contrast *= 0.98; add(g.lift, [0.006, 0.007, 0.009]); g.rays *= 0.3; g.dirt *= 0.7; },
  wet: (g) => { g.sat *= 0.97; g.streak *= 1.1; g.rays *= 0.8; },
  // rain: desaturated and cool, the wet lens catches every light
  rain: (g) => {
    g.sat *= 0.8; g.vib *= 0.5; g.contrast *= 0.97; add(g.lift, [0.008, 0.011, 0.016]); mul(g.gain, [0.97, 0.99, 1.02]);
    add(g.shadow, [-0.005, 0.002, 0.012]); g.high = g.high.map((v) => v * 0.4);
    g.rays = 0; g.streak *= 1.25; g.dirt *= 1.4; g.flare *= 0.8; g.bloom *= 1.1;
  },
  // storm: bleached, cold and heavy
  storm: (g) => {
    g.sat *= 0.68; g.vib = 0; g.contrast *= 1.02; add(g.lift, [0.004, 0.008, 0.012]); mul(g.gain, [0.95, 0.98, 1]);
    add(g.shadow, [-0.004, 0.004, 0.012]); g.high = g.high.map((v) => v * 0.2);
    g.rays = 0; g.streak *= 1.25; g.dirt *= 1.5; g.flare *= 0.7; g.bloom *= 1.1;
  },
  fog: (g) => { g.sat *= 0.85; g.contrast *= 0.93; add(g.lift, [0.02, 0.022, 0.025]); g.rays *= 1.4; g.flare *= 0.5; g.bloom *= 1.15; },
  snow: (g) => { g.sat *= 0.92; mul(g.gain, [0.98, 1, 1.03]); add(g.shadow, [-0.006, 0, 0.014]); g.rays *= 0.5; },
};

const clone = (o) => {
  const r = {};
  for (const k of Object.keys(o)) r[k] = Array.isArray(o[k]) ? o[k].slice() : o[k];
  return r;
};

export function resolveGrade(time = 'neutral', weather = 'clear') {
  const g = clone(BASE);
  Object.assign(g, clone(TIME[time] || TIME.day));
  const w = WEATHER[weather];
  if (w) w(g);
  return g;
}
