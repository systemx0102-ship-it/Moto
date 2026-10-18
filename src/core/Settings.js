// Persistent settings + save data (localStorage, guarded).
const KEY = 'motomitico.save.v1';

export const QUALITY = {
  bajo: { label: 'BAJO', pixelRatio: 0.75, shadows: 0, bloom: false, msaa: 0, density: 0.45, post: false, terrainRes: 128, maxDpr: 1 },
  medio: { label: 'MEDIO', pixelRatio: 1, shadows: 1024, bloom: true, msaa: 0, density: 0.7, post: true, terrainRes: 160, maxDpr: 1 },
  alto: { label: 'ALTO', pixelRatio: 1, shadows: 2048, bloom: true, msaa: 4, density: 1, post: true, terrainRes: 200, maxDpr: 1.5 },
  ultra: { label: 'ULTRA', pixelRatio: 1, shadows: 4096, bloom: true, msaa: 4, density: 1.35, post: true, terrainRes: 256, maxDpr: 2 },
};

const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const DEFAULTS = {
  settings: {
    quality: isMobile ? 'medio' : 'alto',
    resScale: 1,
    motionBlur: true,
    masterVol: 0.85,
    musicVol: 0.55,
    sfxVol: 0.9,
    units: 'kmh',
    transmission: 'auto',
    camera: 0,
    showFps: false,
    touch: isMobile,
    vibration: true,
    laps: 3,
    rivals: 7,
    difficulty: 'normal',
    assist: true,
    timeSel: 'auto',
    weatherSel: 'auto',
  },
  records: {}, // trackId -> { lap, race, bike }
  ghosts: {}, // trackId -> { bike, lap, data(base64) }
  champ: null,
  stats: { races: 0, wins: 0, podiums: 0, km: 0, crashes: 0, topSpeed: 0 },
  garage: { bike: 'spectra', livery: {} },
  trophies: {},
};

function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over)) {
    if (base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])) out[k] = deepMerge(base[k], over[k]);
    else out[k] = over[k];
  }
  return out;
}

class SaveStore {
  constructor() {
    this.data = deepMerge(DEFAULTS, null);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = deepMerge(DEFAULTS, JSON.parse(raw));
    } catch (e) { /* storage unavailable: defaults */ }
    if (!QUALITY[this.data.settings.quality]) this.data.settings.quality = 'alto';
  }
  get settings() { return this.data.settings; }
  get quality() { return QUALITY[this.data.settings.quality]; }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {
      // quota: drop ghosts and retry once
      try { this.data.ghosts = {}; localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e2) { /* ignore */ }
    }
  }
  reset() {
    this.data = deepMerge(DEFAULTS, null);
    this.save();
  }
}

export const Save = new SaveStore();
export const IS_MOBILE = isMobile;
