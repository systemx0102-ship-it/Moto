// Bike catalog: specs (physics + sound), liveries and model geometry params.
// 13 completely different machines. No riders anywhere.

const T = {
  i4: [[0, 0.42], [0.25, 0.6], [0.5, 0.82], [0.72, 1], [0.88, 0.97], [1, 0.86]],
  v4: [[0, 0.5], [0.25, 0.7], [0.5, 0.9], [0.7, 1], [0.9, 0.95], [1, 0.85]],
  i3: [[0, 0.55], [0.25, 0.78], [0.5, 0.95], [0.7, 1], [0.9, 0.9], [1, 0.8]],
  vtwin: [[0, 0.75], [0.2, 0.92], [0.4, 1], [0.6, 0.95], [0.8, 0.82], [1, 0.68]],
  twin: [[0, 0.65], [0.25, 0.85], [0.5, 1], [0.7, 0.96], [0.9, 0.85], [1, 0.75]],
  single: [[0, 0.6], [0.25, 0.82], [0.55, 1], [0.75, 0.94], [0.9, 0.82], [1, 0.7]],
  boxer: [[0, 0.7], [0.25, 0.88], [0.5, 1], [0.7, 0.97], [0.9, 0.86], [1, 0.76]],
  twoStroke: [[0, 0.3], [0.4, 0.42], [0.6, 0.62], [0.72, 0.95], [0.85, 1], [0.95, 0.9], [1, 0.7]],
  electric: [[0, 1], [0.35, 1], [0.5, 0.72], [0.7, 0.52], [0.85, 0.43], [1, 0.36]],
  muscle: [[0, 0.65], [0.25, 0.85], [0.5, 0.97], [0.7, 1], [0.9, 0.9], [1, 0.8]],
};

export const BIKES = [
  {
    id: 'spectra', name: 'SPECTRA 1100 SX', short: 'SPECTRA', klass: 'SPORT TOURING', design: 'sporttourer',
    blurb: 'Sport-turismo de 1100 cc y cuatro cilindros: carenado completo, cúpula alta, asiento para dos y potencia de sobra para cruzar el país.',
    engine: { label: '1099 cc · 4 en línea', hp: 136, redline: 11000, idle: 1100, curve: T.i4, gears: [2.6, 1.95, 1.6, 1.38, 1.22, 1.1], sound: 'i4' },
    mass: 235, topKmh: 255, maxLean: 52, leanRate: 2.6, brakeG: 1.1, grip: 0.98, offroad: 0.4, wheelieTend: 0.45, cda: null,
    model: {
      wb: 1.44, rake: 24, forkLen: 0.58, forkOffset: 0.03, pivot: [-0.13, 0.46], headLen: 0.15,
      front: { R: 0.3, w: 0.12, rim: 0.216, style: 'split', spokes: 3, sweep: 0.12 },
      rear: { R: 0.312, w: 0.19, rim: 0.216, style: 'split', spokes: 3, sweep: 0.12 },
    },
    liveries: [
      { name: 'Negro Diablo', base: '#0b0b0d', second: '#3b3d42', accent: '#c9a54a', frame: '#141416', wheel: '#121212', pattern: 'pinstripe', seat: 0x2e3034, labelScale: 0.55, labelU: 0.62, labelV: 0.2, labelColor: '#d8d8d8', labelFamily: 'Rajdhani, Arial, sans-serif', labelFont: 'italic 700' },
      { name: 'Verde Esmeralda', base: '#0f3626', second: '#0b0b0d', accent: '#c9a54a', frame: '#141416', wheel: '#121212', pattern: 'pinstripe', seat: 0x2e3034, labelScale: 0.55, labelU: 0.62, labelV: 0.2, labelColor: '#d8d8d8', labelFamily: 'Rajdhani, Arial, sans-serif', labelFont: 'italic 700' },
      { name: 'Blanco Perla', base: '#e6e7e8', second: '#2b2d31', accent: '#b0181e', frame: '#141416', wheel: '#121212', pattern: 'pinstripe', seat: 0x2e3034, labelScale: 0.55, labelU: 0.62, labelV: 0.2, labelColor: '#2b2d31', labelFamily: 'Rajdhani, Arial, sans-serif', labelFont: 'italic 700' },
    ],
  },
  {
    id: 'raptor', name: 'RAPTOR RR1000', short: 'RAPTOR', klass: 'SUPERBIKE', design: 'superbike',
    blurb: 'Superbike de cuatro cilindros en línea. Agresiva, precisa y brutal a alta velocidad.',
    engine: { label: '999 cc · 4 en línea', hp: 215, redline: 14500, idle: 1300, curve: T.i4, gears: [2.6, 2.05, 1.72, 1.5, 1.34, 1.22], sound: 'i4' },
    mass: 199, topKmh: 299, maxLean: 58, leanRate: 3.0, brakeG: 1.18, grip: 1.0, offroad: 0.45, wheelieTend: 0.7, cda: null,
    model: {
      wb: 1.42, rake: 24, forkLen: 0.55, forkOffset: 0.032, pivot: [-0.12, 0.47],
      front: { R: 0.3, w: 0.12, rim: 0.216, style: 'cast', spokes: 5, sweep: 0.35 },
      rear: { R: 0.315, w: 0.19, rim: 0.216, style: 'cast', spokes: 5, sweep: 0.35 },
    },
    liveries: [
      { name: 'Rosso Corsa', base: '#c4121a', second: '#f2f2f2', accent: '#111111', frame: '#9ea3aa', wheel: '#151515', pattern: 'arrow' },
      { name: 'Azul Racing', base: '#123fb0', second: '#f2f2f2', accent: '#e6b800', frame: '#2b2d31', wheel: '#e6b800', pattern: 'split' },
      { name: 'Noche Oro', base: '#101012', second: '#2d2d32', accent: '#d4a431', frame: '#101012', wheel: '#d4a431', pattern: 'stripe' },
    ],
  },
  {
    id: 'apex', name: 'APEX GP-V4', short: 'APEX GP', klass: 'PROTOTIPO GP', design: 'gp',
    blurb: 'Prototipo de gran premio con alerones aerodinámicos y V4 de 290 CV. La cima absoluta.',
    engine: { label: '1000 cc · V4 big bang', hp: 290, redline: 18000, idle: 2200, curve: T.v4, gears: [2.4, 1.95, 1.66, 1.45, 1.3, 1.19], sound: 'v4' },
    mass: 157, topKmh: 345, maxLean: 62, leanRate: 3.4, brakeG: 1.32, grip: 1.12, offroad: 0.35, wheelieTend: 1.0,
    model: {
      wb: 1.44, rake: 23.5, forkLen: 0.54, forkOffset: 0.03, pivot: [-0.1, 0.48],
      front: { R: 0.3, w: 0.125, rim: 0.216, style: 'cast', spokes: 7, sweep: 0.15, spokeW: 0.02 },
      rear: { R: 0.32, w: 0.2, rim: 0.216, style: 'cast', spokes: 7, sweep: 0.15, spokeW: 0.022 },
    },
    liveries: [
      { name: 'Fábrica Neón', base: '#0b0b0d', second: '#00e5ff', accent: '#ff1e56', frame: '#1b1b1d', wheel: '#111111', pattern: 'neon', number: '93' },
      { name: 'Naranja Fuego', base: '#ff5a00', second: '#111111', accent: '#ffffff', frame: '#1b1b1d', wheel: '#111111', pattern: 'arrow', number: '46' },
      { name: 'Plata Mítica', base: '#c7ccd3', second: '#6a00ff', accent: '#111111', frame: '#1b1b1d', wheel: '#6a00ff', pattern: 'split', number: '1' },
    ],
  },
  {
    id: 'viper', name: 'VIPER 900 TRIPLE', short: 'VIPER', klass: 'NAKED', design: 'naked',
    blurb: 'Streetfighter tricilíndrica con chasis multitubular y basculante monobrazo.',
    engine: { label: '890 cc · 3 en línea', hp: 140, redline: 12000, idle: 1200, curve: T.i3, gears: [2.65, 2.08, 1.74, 1.5, 1.33, 1.2], sound: 'i3' },
    mass: 189, topKmh: 252, maxLean: 54, leanRate: 3.2, brakeG: 1.12, grip: 0.98, offroad: 0.55, wheelieTend: 1.0,
    model: {
      wb: 1.45, rake: 24.5, forkLen: 0.58, forkOffset: 0.03, pivot: [-0.13, 0.46],
      front: { R: 0.3, w: 0.12, rim: 0.216, style: 'cast', spokes: 3, sweep: 0.5, spokeW: 0.04, spokeT: 0.022 },
      rear: { R: 0.315, w: 0.18, rim: 0.216, style: 'cast', spokes: 3, sweep: 0.5, spokeW: 0.045, spokeT: 0.024 },
    },
    liveries: [
      { name: 'Verde Ácido', base: '#7cff00', second: '#1a1a1a', accent: '#1a1a1a', frame: '#c4121a', wheel: '#1a1a1a', pattern: 'split' },
      { name: 'Grafito', base: '#3a3d42', second: '#ff5a00', accent: '#ff5a00', frame: '#ff5a00', wheel: '#ff5a00', pattern: 'stripe' },
      { name: 'Blanco Hielo', base: '#eef2f6', second: '#c4121a', accent: '#c4121a', frame: '#c4121a', wheel: '#111111', pattern: 'arrow' },
    ],
  },
  {
    id: 'volt', name: 'VOLT PHANTOM X', short: 'VOLT', klass: 'ELÉCTRICA', design: 'electric',
    blurb: 'Naked eléctrica de 150 kW: batería de 17 kWh con aletas en un chasis multitubular, motor refrigerado por aceite y transmisión por correa.',
    engine: { label: '150 kW · Motor eléctrico', hp: 204, redline: 13000, idle: 0, curve: T.electric, gears: [1.0], sound: 'electric', electric: true },
    mass: 230, topKmh: 290, maxLean: 56, leanRate: 2.7, brakeG: 1.14, grip: 1.0, offroad: 0.5, wheelieTend: 0.8,
    model: {
      wb: 1.45, rake: 24.5, forkLen: 0.56, forkOffset: 0.03, pivot: [-0.1, 0.45],
      front: { R: 0.3, w: 0.12, rim: 0.216, style: 'split', spokes: 5, sweep: 0.2 },
      rear: { R: 0.32, w: 0.19, rim: 0.216, style: 'split', spokes: 5, sweep: 0.2 },
    },
    liveries: [
      { name: 'Cian Plasma', base: '#e9eef2', second: '#0d0f12', accent: '#00f0ff', frame: '#0d0f12', wheel: '#0d0f12', pattern: 'neon' },
      { name: 'Magenta Void', base: '#0d0f12', second: '#26292e', accent: '#ff2bd6', frame: '#26292e', wheel: '#26292e', pattern: 'neon' },
      { name: 'Lima Cromo', base: '#5d636b', second: '#0d0f12', accent: '#b6ff00', frame: '#0d0f12', wheel: '#0d0f12', pattern: 'neon' },
    ],
  },
  {
    id: 'baron', name: 'IRON BARON 1800', short: 'BARON', klass: 'CRUISER', design: 'cruiser',
    blurb: 'Crucero V-twin de 1800 cc: cromo, guardabarros profundos y par de locomotora.',
    engine: { label: '1801 cc · V-twin 45°', hp: 100, redline: 5800, idle: 850, curve: T.vtwin, gears: [3.0, 2.1, 1.6, 1.3, 1.1, 0.95], sound: 'vtwin' },
    mass: 340, topKmh: 198, maxLean: 34, leanRate: 1.6, brakeG: 0.86, grip: 0.92, offroad: 0.5, wheelieTend: 0.2,
    model: {
      wb: 1.72, rake: 32, forkLen: 0.64, forkOffset: 0.04, pivot: [-0.3, 0.38], headLen: 0.18,
      front: { R: 0.33, w: 0.13, rim: 0.24, style: 'wire', spokes: 40 },
      rear: { R: 0.33, w: 0.2, rim: 0.205, style: 'wire', spokes: 40 },
    },
    liveries: [
      { name: 'Vino Profundo', base: '#5a0b14', second: '#e8e2d0', accent: '#d4a431', frame: '#0d0d0f', wheel: '#d8dbe0', pattern: 'stripe', seat: 0x3a2214 },
      { name: 'Azul Medianoche', base: '#0b1c3a', second: '#c0c4ca', accent: '#c0c4ca', frame: '#0d0d0f', wheel: '#d8dbe0', pattern: 'flames', seat: 0x161616 },
      { name: 'Crema Clásico', base: '#e8dfc8', second: '#2c1a10', accent: '#8a1a10', frame: '#0d0d0f', wheel: '#d8dbe0', pattern: 'split', seat: 0x5a3a20 },
    ],
  },
  {
    id: 'bobber', name: 'GHOST BOBBER', short: 'GHOST', klass: 'BOBBER', design: 'bobber',
    blurb: 'Bobber mate con horquilla springer, asiento flotante y escapes rectos.',
    engine: { label: '1200 cc · V-twin', hp: 88, redline: 6500, idle: 900, curve: T.vtwin, gears: [2.8, 1.95, 1.5, 1.22, 1.03], sound: 'vtwin2' },
    mass: 250, topKmh: 192, maxLean: 33, leanRate: 1.9, brakeG: 0.9, grip: 0.92, offroad: 0.55, wheelieTend: 0.4,
    model: {
      wb: 1.6, rake: 30, forkLen: 0.6, forkOffset: 0.05, pivot: [-0.28, 0.36], headLen: 0.16,
      front: { R: 0.33, w: 0.14, rim: 0.205, style: 'wire', spokes: 40 },
      rear: { R: 0.33, w: 0.18, rim: 0.205, style: 'wire', spokes: 40 },
    },
    liveries: [
      { name: 'Negro Fantasma', base: '#141414', second: '#2a2a2a', accent: '#b0b0b0', frame: '#0b0b0b', wheel: '#111111', pattern: 'stripe', matte: true, seat: 0x3d2414 },
      { name: 'Verde Militar', base: '#3c4a2c', second: '#20261a', accent: '#e8e0c8', frame: '#0b0b0b', wheel: '#111111', pattern: 'stripe', matte: true, seat: 0x2a1a10 },
      { name: 'Óxido', base: '#7a3a1a', second: '#3a1a0a', accent: '#d0b080', frame: '#0b0b0b', wheel: '#111111', pattern: 'flames', matte: true, seat: 0x1a1a1a },
    ],
  },
  {
    id: 'cafe', name: 'CAFÉ BULLET 650', short: 'BULLET', klass: 'CAFÉ RACER', design: 'cafe',
    blurb: 'Café racer bicilíndrica de radios y semimanillares. Elegancia de los años 60.',
    engine: { label: '648 cc · Bicilíndrico 270°', hp: 78, redline: 8200, idle: 1000, curve: T.twin, gears: [2.75, 1.95, 1.55, 1.3, 1.12], sound: 'twin' },
    mass: 190, topKmh: 205, maxLean: 48, leanRate: 2.6, brakeG: 1.0, grip: 0.95, offroad: 0.5, wheelieTend: 0.5,
    model: {
      wb: 1.42, rake: 25, forkLen: 0.6, forkOffset: 0.035, pivot: [-0.18, 0.4],
      front: { R: 0.31, w: 0.1, rim: 0.23, style: 'wire', spokes: 36 },
      rear: { R: 0.31, w: 0.13, rim: 0.23, style: 'wire', spokes: 36 },
    },
    liveries: [
      { name: 'Verde Británico', base: '#0f3d2a', second: '#e8e0c8', accent: '#d4a431', frame: '#111111', wheel: '#cfd3d8', pattern: 'stripe', seat: 0x2a1a10 },
      { name: 'Plata Ton-Up', base: '#b8bcc2', second: '#111111', accent: '#c4121a', frame: '#111111', wheel: '#cfd3d8', pattern: 'stripe', seat: 0x161616 },
      { name: 'Rojo Cereza', base: '#8a0e1a', second: '#f0e8d8', accent: '#f0e8d8', frame: '#111111', wheel: '#cfd3d8', pattern: 'retro', seat: 0x3a2214 },
    ],
  },
  {
    id: 'drag', name: 'THUNDER DRAG V-MAX', short: 'THUNDER', klass: 'POWER CRUISER', design: 'drag',
    blurb: 'Muscle bike V4 con neumático trasero gigante y tomas de aire cromadas.',
    engine: { label: '1679 cc · V4', hp: 200, redline: 9500, idle: 1000, curve: T.muscle, gears: [2.55, 1.85, 1.45, 1.2, 1.02], sound: 'muscle' },
    mass: 310, topKmh: 270, maxLean: 40, leanRate: 1.8, brakeG: 0.98, grip: 0.96, offroad: 0.4, wheelieTend: 0.9,
    model: {
      wb: 1.7, rake: 31, forkLen: 0.62, forkOffset: 0.04, pivot: [-0.26, 0.4], headLen: 0.17,
      front: { R: 0.31, w: 0.12, rim: 0.23, style: 'cast', spokes: 5, sweep: 0.2, spokeW: 0.034 },
      rear: { R: 0.33, w: 0.25, rim: 0.205, style: 'cast', spokes: 5, sweep: 0.2, spokeW: 0.04 },
    },
    liveries: [
      { name: 'Negro Trueno', base: '#0c0c0e', second: '#c4121a', accent: '#c0c4ca', frame: '#0c0c0e', wheel: '#2a2a2e', pattern: 'split', seat: 0x111111 },
      { name: 'Titanio', base: '#5a5e66', second: '#0c0c0e', accent: '#00b0ff', frame: '#0c0c0e', wheel: '#0c0c0e', pattern: 'arrow', seat: 0x111111 },
      { name: 'Rojo Sangre', base: '#7a0008', second: '#0c0c0e', accent: '#e0e0e0', frame: '#0c0c0e', wheel: '#c0c4ca', pattern: 'stripe', seat: 0x111111 },
    ],
  },
  {
    id: 'hornet', name: 'MUD HORNET 450', short: 'HORNET', klass: 'MOTOCROSS', design: 'mx',
    blurb: 'Motocross monocilíndrica ultraligera. Reina absoluta fuera del asfalto.',
    engine: { label: '449 cc · Monocilíndrico', hp: 64, redline: 13000, idle: 1600, curve: T.single, gears: [2.9, 2.2, 1.75, 1.45, 1.22], sound: 'single' },
    mass: 106, topKmh: 178, maxLean: 50, leanRate: 3.6, brakeG: 1.0, grip: 0.95, offroad: 1.0, wheelieTend: 1.2,
    model: {
      wb: 1.48, rake: 27, forkLen: 0.72, forkOffset: 0.022, pivot: [-0.2, 0.58], headLen: 0.16,
      front: { R: 0.36, w: 0.085, rim: 0.267, style: 'wire', spokes: 36, knobby: true },
      rear: { R: 0.35, w: 0.115, rim: 0.241, style: 'wire', spokes: 36, knobby: true },
    },
    liveries: [
      { name: 'Naranja Factory', base: '#ff6a00', second: '#111111', accent: '#ffffff', frame: '#ff6a00', wheel: '#111111', pattern: 'arrow', number: '7' },
      { name: 'Amarillo Avispa', base: '#ffd400', second: '#1a3aa0', accent: '#111111', frame: '#9ea3aa', wheel: '#d4a431', pattern: 'split', number: '21' },
      { name: 'Verde Lima', base: '#56e000', second: '#111111', accent: '#ffffff', frame: '#9ea3aa', wheel: '#111111', pattern: 'stripe', number: '3' },
    ],
  },
  {
    id: 'fang', name: 'FANG SM 700', short: 'FANG', klass: 'SUPERMOTARD', design: 'sm',
    blurb: 'Supermotard de 700 cc: derrapes, caballitos y frenada imposible.',
    engine: { label: '693 cc · Monocilíndrico', hp: 78, redline: 10000, idle: 1400, curve: T.single, gears: [2.7, 2.05, 1.65, 1.4, 1.22, 1.1], sound: 'singleBig' },
    mass: 147, topKmh: 205, maxLean: 55, leanRate: 3.5, brakeG: 1.15, grip: 1.04, offroad: 0.82, wheelieTend: 1.3,
    model: {
      wb: 1.47, rake: 26, forkLen: 0.66, forkOffset: 0.024, pivot: [-0.2, 0.55], headLen: 0.16,
      front: { R: 0.3, w: 0.12, rim: 0.216, style: 'wire', spokes: 36, discs: 'wave' },
      rear: { R: 0.31, w: 0.165, rim: 0.216, style: 'wire', spokes: 36 },
    },
    liveries: [
      { name: 'Blanco Colmillo', base: '#f4f4f4', second: '#d0101a', accent: '#111111', frame: '#d0101a', wheel: '#d0101a', pattern: 'arrow', number: '11' },
      { name: 'Negro Ámbar', base: '#141414', second: '#ffb000', accent: '#ffb000', frame: '#ffb000', wheel: '#111111', pattern: 'split', number: '88' },
      { name: 'Azul Eléctrico', base: '#0050ff', second: '#ffffff', accent: '#00e5ff', frame: '#9ea3aa', wheel: '#111111', pattern: 'stripe', number: '5' },
    ],
  },
  {
    id: 'atlas', name: 'ATLAS GT 1300', short: 'ATLAS', klass: 'ADVENTURE', design: 'adventure',
    blurb: 'Trail aventurera con motor bóxer, maletas de aluminio y suspensión de largo recorrido.',
    engine: { label: '1300 cc · Bóxer bicilíndrico', hp: 145, redline: 9000, idle: 1000, curve: T.boxer, gears: [2.7, 2.0, 1.6, 1.35, 1.17, 1.04], sound: 'boxer' },
    mass: 249, topKmh: 232, maxLean: 46, leanRate: 2.2, brakeG: 1.02, grip: 0.96, offroad: 0.86, wheelieTend: 0.5,
    model: {
      wb: 1.53, rake: 26, forkLen: 0.66, forkOffset: 0.03, pivot: [-0.2, 0.47], headLen: 0.17,
      front: { R: 0.34, w: 0.11, rim: 0.241, style: 'wire', spokes: 40 },
      rear: { R: 0.325, w: 0.15, rim: 0.216, style: 'wire', spokes: 40 },
    },
    liveries: [
      { name: 'Tricolor Rally', base: '#f2f2f2', second: '#123fb0', accent: '#c4121a', frame: '#123fb0', wheel: '#111111', pattern: 'split', seat: 0x111111 },
      { name: 'Arena Dakar', base: '#c8b48a', second: '#2a2a2a', accent: '#ff6a00', frame: '#2a2a2a', wheel: '#d4a431', pattern: 'stripe', seat: 0x3a2a1a },
      { name: 'Verde Selva', base: '#2e5a2a', second: '#111111', accent: '#e6b800', frame: '#111111', wheel: '#111111', pattern: 'arrow', seat: 0x111111 },
    ],
  },
  {
    id: 'ringo', name: 'RINGO 2T 500', short: 'RINGO', klass: 'CLÁSICA 2T', design: 'twostroke',
    blurb: 'Réplica GP de dos tiempos de los 80. Banda de potencia explosiva y cámaras de expansión.',
    engine: { label: '499 cc · V4 dos tiempos', hp: 168, redline: 12500, idle: 1800, curve: T.twoStroke, gears: [2.5, 1.98, 1.66, 1.44, 1.29, 1.18], sound: 'twoStroke' },
    mass: 131, topKmh: 292, maxLean: 55, leanRate: 3.3, brakeG: 1.05, grip: 0.94, offroad: 0.4, wheelieTend: 1.1,
    model: {
      wb: 1.38, rake: 24, forkLen: 0.55, forkOffset: 0.032, pivot: [-0.12, 0.45],
      front: { R: 0.295, w: 0.11, rim: 0.216, style: 'cast', spokes: 3, sweep: 0.0, spokeW: 0.035 },
      rear: { R: 0.31, w: 0.17, rim: 0.216, style: 'cast', spokes: 3, sweep: 0.0, spokeW: 0.04 },
    },
    liveries: [
      { name: 'Retro Azul', base: '#f4f4f4', second: '#123f8a', accent: '#d4a431', frame: '#c9ccd1', wheel: '#d4a431', pattern: 'retro', number: '4', plate: '#ffd400' },
      { name: 'Amarillo 500', base: '#ffd400', second: '#111111', accent: '#c4121a', frame: '#c9ccd1', wheel: '#111111', pattern: 'retro', number: '2', plate: '#ffd400' },
      { name: 'Rojo Leyenda', base: '#c4121a', second: '#f4f4f4', accent: '#111111', frame: '#c9ccd1', wheel: '#f4f4f4', pattern: 'retro', number: '34', plate: '#ffffff' },
    ],
  },
];

export const BIKE_BY_ID = Object.fromEntries(BIKES.map((b) => [b.id, b]));

// Normalised 0..1 stats for UI bars
export function bikeStats(b) {
  const pw = b.engine.hp / b.mass;
  return {
    velocidad: clamp01((b.topKmh - 170) / (350 - 170)),
    aceleracion: clamp01((pw - 0.28) / (1.85 - 0.28)),
    manejo: clamp01(((b.maxLean - 32) / 30) * 0.5 + ((b.leanRate - 1.5) / 2.1) * 0.5),
    frenada: clamp01((b.brakeG - 0.82) / (1.34 - 0.82)),
    offroad: clamp01((b.offroad - 0.3) / 0.7),
  };
}
function clamp01(v) { return Math.max(0.04, Math.min(1, v)); }
