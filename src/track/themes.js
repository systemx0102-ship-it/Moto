// Visual / environmental configuration per track theme.
export const THEMES = {
  gp: {
    rockGround: 'stone', dirtGround: 'dirt', dirtAmt: 0.5, apron: 2.5, gravelTraps: true, mow: true,
    ground: 'grass', runoffGround: 'grass', barrier: 'tirewall', fence: true, grandstands: true,
    road: { base: [66, 64, 62], edge: '#f4f4f4', centerDash: false, rubber: true, edgeRed: false },
    terrain: { amp: 18, scale: 420, base: -2, ridged: false, color: 0x7a9a50, rockColor: 0x8a8070 },
    far: { height: 140, color: 0x6a7a68, snow: false },
    trees: { pine: 0.25, broad: 0.75, palm: 0, density: 1.0 }, rocks: 0.2,
    lamps: false, billboards: true, buildings: false, water: null,
  },
  coast: {
    rockGround: 'rock', dirtGround: 'beachSand', dirtAmt: 0.6,
    ground: 'dryGrass', runoffGround: 'beachSand', barrier: 'armco', fence: false,
    road: { base: [62, 60, 60], edge: '#f2f2f2', centerDash: true, centerColor: '#f4c400', rubber: false },
    terrain: { amp: 30, scale: 380, base: 6, ridged: false, color: 0xa09060, rockColor: 0x9a7a5a, ocean: { dir: [-1, 0.25], start: -260, drop: 0.35 } },
    far: { height: 180, color: 0x7a6a70, snow: false },
    trees: { pine: 0.15, broad: 0.25, palm: 0.6, density: 0.7 }, rocks: 0.5,
    lamps: false, billboards: true, buildings: 'villas', water: { level: -1.5, color: 0x0a3a5a },
  },
  city: {
    rockGround: 'stone', dirtGround: 'asphaltDark', dirtAmt: 0.0,
    ground: 'asphaltDark', runoffGround: 'asphaltDark', barrier: 'concrete', neonWalls: true, fence: true,
    road: { base: [44, 46, 50], edge: '#ffffff', centerDash: true, centerColor: '#ffffff', rubber: false, rubberLine: true, patches: true },
    terrain: { amp: 0, scale: 400, base: -0.6, ridged: false, color: 0x303236, rockColor: 0x303236, flat: true },
    far: { height: 0, color: 0x101018, skyline: true },
    trees: { pine: 0, broad: 0, palm: 0, density: 0 }, rocks: 0,
    lamps: true, billboards: true, buildings: 'city', water: null,
  },
  desert: {
    rockGround: 'rock', dirtGround: 'gravel', dirtAmt: 0.5,
    ground: 'sand', runoffGround: 'sand', barrier: 'tirewall', fence: false,
    road: { base: [70, 62, 58], edge: '#f4f4f4', centerDash: true, centerColor: '#f4f4f4', rubber: false },
    terrain: { amp: 55, scale: 600, base: -4, ridged: true, mesa: true, color: 0xc07850, rockColor: 0xa05030 },
    far: { height: 260, color: 0xb87a5a, snow: false, mesa: true },
    trees: { pine: 0, broad: 0, palm: 0, cactus: 1, density: 0.5 }, rocks: 1.2,
    lamps: false, billboards: true, buildings: false, water: null,
  },
  alpine: {
    rockGround: 'stone', dirtGround: 'gravel', dirtAmt: 0.25,
    ground: 'snow', runoffGround: 'snow', barrier: 'armco', fence: false,
    road: { base: [60, 60, 60], edge: '#f4f4f4', centerDash: true, centerColor: '#f4f4f4', rubber: false },
    terrain: { amp: 120, scale: 520, base: 0, ridged: true, color: 0xe8eef6, rockColor: 0x6a6e78, followTrack: true },
    far: { height: 700, color: 0xc8d4e4, snow: true },
    trees: { pine: 1, broad: 0, palm: 0, density: 1.2, snowy: true }, rocks: 0.6,
    lamps: false, billboards: false, buildings: 'chalets', water: null,
  },
  forest: {
    rockGround: 'mossStone', dirtGround: 'dirt', dirtAmt: 0.7,
    ground: 'forest', runoffGround: 'wildGrass', barrier: 'armco', fence: false,
    road: { base: [50, 52, 56], edge: '#f0f0f0', centerDash: true, centerColor: '#f0f0f0', rubber: false },
    terrain: { amp: 40, scale: 360, base: 0, ridged: false, color: 0x4a6a3a, rockColor: 0x5a5a50 },
    far: { height: 220, color: 0x2a3a34, snow: false },
    trees: { pine: 0.6, broad: 0.4, palm: 0, density: 2.0 }, rocks: 0.5,
    lamps: false, billboards: false, buildings: false, water: null,
  },
};

// Weather presets (multipliers over the time-of-day lighting)
export const WEATHER = {
  clear: { label: 'DESPEJADO', clouds: 0.3, fogMul: 1, sunMul: 1, hemiMul: 1, wind: 0.8 },
  cloudy: { label: 'NUBLADO', clouds: 0.85, fogMul: 1.7, sunMul: 0.38, hemiMul: 1.3, wind: 1.2, overcast: true, gray: 0.45 },
  wet: { label: 'ASFALTO MOJADO', clouds: 0.6, fogMul: 1.3, sunMul: 0.7, hemiMul: 1.1, wind: 0.9, wet: true, gray: 0.2 },
  rain: { label: 'LLUVIA', clouds: 0.95, fogMul: 2.6, sunMul: 0.22, hemiMul: 1.15, wind: 1.5, wet: true, rain: 6000, overcast: true, gray: 0.6, drops: 0.6 },
  storm: { label: 'TORMENTA', clouds: 1, fogMul: 3.2, sunMul: 0.14, hemiMul: 1.05, wind: 2.4, wet: true, rain: 10000, lightning: true, overcast: true, gray: 0.7, drops: 1 },
  fog: { label: 'NIEBLA', clouds: 0.9, fogMul: 11, sunMul: 0.3, hemiMul: 1.25, wind: 0.3, overcast: true, gray: 0.55, fogLight: true },
  snow: { label: 'NIEVE', clouds: 0.9, fogMul: 3.2, sunMul: 0.4, hemiMul: 1.35, wind: 1.0, snow: 7000, overcast: true, gray: 0.5, snowy: true },
};

// Time of day presets
export const TIMES = {
  dawn: { sky: { zenith: 0x34407a, horizon: 0xf2b8a0, ground: 0x4a3a40, glow: 1.4, hglow: 1.6, k: 1.6 }, sunElev: 7, sunAzim: 95, turbidity: 6, rayleigh: 3.2, mie: 0.008, exposure: 0.55, bloom: [0.28, 0.5, 2.0], sun: 2.2, sunColor: 0xffb98a, hemi: 0.6, hemiSky: 0xd8b8d8, hemiGround: 0x403848, fog: [0xc8a8b8, 0.0008], env: 0.75 },
  day: { sky: { zenith: 0x1d5ccc, horizon: 0xb4d2f0, ground: 0x6a7480, glow: 0.8, hglow: 0.3, k: 2.3 }, sunElev: 48, sunAzim: 135, turbidity: 2.2, rayleigh: 3.0, mie: 0.0035, exposure: 0.48, bloom: [0.16, 0.35, 3.2], sun: 3.8, sunColor: 0xfff1e0, hemi: 0.5, hemiSky: 0xc8d8f0, hemiGround: 0x6a5a40, fog: [0xb8c8dc, 0.00045], env: 0.7 },
  sunset: { sky: { zenith: 0x23306e, horizon: 0xff9850, ground: 0x3a2a30, glow: 1.6, hglow: 2.4, k: 1.7 }, sunElev: 4, sunAzim: 250, turbidity: 9, rayleigh: 2.6, mie: 0.012, exposure: 0.6, bloom: [0.28, 0.5, 2.0], sun: 2.6, sunColor: 0xffa060, hemi: 0.55, hemiSky: 0xffb890, hemiGround: 0x403040, fog: [0xd89a78, 0.0008], env: 0.8 },
  dusk: { sky: { zenith: 0x141c34, horizon: 0x5a6680, ground: 0x1a1c22, glow: 0.6, hglow: 0.8, k: 1.1 }, sunElev: 6, sunAzim: 200, turbidity: 14, rayleigh: 0.8, mie: 0.02, exposure: 0.68, bloom: [0.45, 0.5, 0.85], sun: 1.1, sunColor: 0xa8b4d0, hemi: 1.1, hemiSky: 0x5a6a88, hemiGround: 0x1a2018, fog: [0x3a4450, 0.0026], env: 0.45, overcast: true },
  night: { sunElev: -20, sunAzim: 60, exposure: 0.85, bloom: [0.5, 0.45, 0.8], sun: 0.35, sunColor: 0x8ab0ff, hemi: 0.35, hemiSky: 0x2a3a6a, hemiGround: 0x0a0a12, fog: [0x0a0c18, 0.0016], env: 0.35, night: true },
};
