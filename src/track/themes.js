// Visual / environmental configuration per track theme.
export const THEMES = {
  gp: {
    ground: 'grass', runoffGround: 'gravel', barrier: 'tirewall', fence: true, grandstands: true,
    road: { base: [58, 60, 64], edge: '#f4f4f4', centerDash: false, rubber: true, edgeRed: false },
    terrain: { amp: 18, scale: 420, base: -2, ridged: false, color: 0x7a9a50, rockColor: 0x8a8070 },
    far: { height: 140, color: 0x6a7a68, snow: false },
    trees: { pine: 0.25, broad: 0.75, palm: 0, density: 1.0 }, rocks: 0.2,
    lamps: false, billboards: true, buildings: false, water: null,
  },
  coast: {
    ground: 'dryGrass', runoffGround: 'sand', barrier: 'armco', fence: false,
    road: { base: [62, 60, 60], edge: '#f2f2f2', centerDash: true, centerColor: '#f4c400', rubber: false },
    terrain: { amp: 30, scale: 380, base: 6, ridged: false, color: 0xa09060, rockColor: 0x9a7a5a, ocean: { dir: [-1, 0.25], start: -260, drop: 0.35 } },
    far: { height: 180, color: 0x7a6a70, snow: false },
    trees: { pine: 0.15, broad: 0.25, palm: 0.6, density: 0.7 }, rocks: 0.5,
    lamps: false, billboards: true, buildings: 'villas', water: { level: -1.5, color: 0x0a3a5a },
  },
  city: {
    ground: 'asphaltDark', runoffGround: 'asphaltDark', barrier: 'concrete', neonWalls: true, fence: true,
    road: { base: [44, 46, 50], edge: '#ffffff', centerDash: true, centerColor: '#ffffff', rubber: false, patches: true },
    terrain: { amp: 0, scale: 400, base: -0.6, ridged: false, color: 0x303236, rockColor: 0x303236, flat: true },
    far: { height: 0, color: 0x101018, skyline: true },
    trees: { pine: 0, broad: 0, palm: 0, density: 0 }, rocks: 0,
    lamps: true, billboards: true, buildings: 'city', water: null,
  },
  desert: {
    ground: 'sand', runoffGround: 'sand', barrier: 'tirewall', fence: false,
    road: { base: [70, 62, 58], edge: '#f4f4f4', centerDash: true, centerColor: '#f4f4f4', rubber: false },
    terrain: { amp: 55, scale: 600, base: -4, ridged: true, mesa: true, color: 0xc07850, rockColor: 0xa05030 },
    far: { height: 260, color: 0xb87a5a, snow: false, mesa: true },
    trees: { pine: 0, broad: 0, palm: 0, cactus: 1, density: 0.5 }, rocks: 1.2,
    lamps: false, billboards: true, buildings: false, water: null,
  },
  alpine: {
    ground: 'snow', runoffGround: 'snow', barrier: 'armco', fence: false,
    road: { base: [54, 56, 60], edge: '#f4f4f4', centerDash: true, centerColor: '#f4f4f4', rubber: false },
    terrain: { amp: 120, scale: 520, base: 0, ridged: true, color: 0xe8eef6, rockColor: 0x6a6e78, followTrack: true },
    far: { height: 700, color: 0xc8d4e4, snow: true },
    trees: { pine: 1, broad: 0, palm: 0, density: 1.2, snowy: true }, rocks: 0.6,
    lamps: false, billboards: false, buildings: 'chalets', water: null,
  },
  forest: {
    ground: 'forest', runoffGround: 'grass', barrier: 'armco', fence: false,
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
  dawn: { sunElev: 7, sunAzim: 95, turbidity: 6, rayleigh: 3.2, mie: 0.008, exposure: 0.55, bloom: [0.3, 0.5, 1.2], sun: 2.2, sunColor: 0xffb98a, hemi: 0.6, hemiSky: 0xd8b8d8, hemiGround: 0x403848, fog: [0xc8a8b8, 0.0008], env: 0.75 },
  day: { sunElev: 52, sunAzim: 135, turbidity: 3, rayleigh: 2.2, mie: 0.004, exposure: 0.5, bloom: [0.22, 0.4, 1.4], sun: 3.2, sunColor: 0xfff4e6, hemi: 0.9, hemiSky: 0xbcd4ff, hemiGround: 0x6a5a40, fog: [0xb8c8dc, 0.00045], env: 0.9 },
  sunset: { sunElev: 4, sunAzim: 250, turbidity: 9, rayleigh: 2.6, mie: 0.012, exposure: 0.6, bloom: [0.3, 0.5, 1.2], sun: 2.6, sunColor: 0xffa060, hemi: 0.55, hemiSky: 0xffb890, hemiGround: 0x403040, fog: [0xd89a78, 0.0008], env: 0.8 },
  dusk: { sunElev: 6, sunAzim: 200, turbidity: 14, rayleigh: 0.8, mie: 0.02, exposure: 0.68, bloom: [0.45, 0.5, 0.85], sun: 1.1, sunColor: 0xa8b4d0, hemi: 1.1, hemiSky: 0x5a6a88, hemiGround: 0x1a2018, fog: [0x3a4450, 0.0026], env: 0.45, overcast: true },
  night: { sunElev: -20, sunAzim: 60, exposure: 0.85, bloom: [0.5, 0.45, 0.8], sun: 0.35, sunColor: 0x8ab0ff, hemi: 0.35, hemiSky: 0x2a3a6a, hemiGround: 0x0a0a12, fog: [0x0a0c18, 0.0016], env: 0.35, night: true },
};
