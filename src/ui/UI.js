// Menu system: main menu, garage, track select, settings, pause, results,
// championship hub, records, credits. Keyboard / gamepad / mouse / touch.
import { h, clear, canvas } from './dom.js';
import { BIKES, BIKE_BY_ID, bikeStats } from '../bikes/catalog.js';
import { TRACKS, TRACK_BY_ID } from '../track/catalog.js';
import { buildCenterline } from '../track/trackgen.js';
import { Save, QUALITY } from '../core/Settings.js';
import { Audio } from '../core/Audio.js';
import { Input } from '../core/Input.js';
import { formatTime, clamp } from '../core/utils.js';
import { installRpgUI } from '../rpg/ui/index.js';

// Line icons (24px grid, stroked) for action buttons; main-menu entries are text only.
const SVG = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICON = {
  play: SVG('<path d="M8 5l11 7-11 7z"/>'),
  back: SVG('<path d="M15 5l-7 7 7 7"/>'),
  retry: SVG('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>'),
  replay: SVG('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M10 9l5 3-5 3z"/>'),
  exit: SVG('<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>'),
  garage: SVG('<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-7h5l3 7M10 10l-1-3H7M15 10l2-3h2"/>'),
  settings: SVG('<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>'),
  cam: SVG('<rect x="3" y="7" width="18" height="12" rx="1"/><circle cx="12" cy="13" r="3"/><path d="M8 7l2-3h4l2 3"/>'),
  champ: SVG('<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M12 14v4M8 20h8M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>'),
  clear: SVG('<path d="M6 6l12 12M18 6L6 18"/>'),
};
const MENU_DESC = {
  leyenda: 'Rol sobre ruedas: sube de nivel, consigue piezas legendarias, aprende talentos y derrota a los jefes de cada región para ganarte sus motos.',
  race: 'Una carrera contra rivales controlados por la IA en el circuito que elijas.',
  champ: 'Seis rondas, puntuación de Gran Premio. Gana el que más puntos sume.',
  trial: 'Vuelta lanzada contra el reloj y contra tu propio fantasma.',
  free: 'Rueda sin rivales ni límite de vueltas para aprender el trazado.',
  garage: 'Trece motos, especificaciones completas y decoraciones.',
  records: 'Mejores vueltas, carreras y estadísticas de piloto.',
  settings: 'Gráficos, sonido, controles y ayudas de pilotaje.',
};
const TIME_LABEL = { dawn: 'AMANECER', day: 'DÍA', sunset: 'ATARDECER', dusk: 'ANOCHECER', night: 'NOCHE' };
const WEATHER_LABEL = { clear: 'DESPEJADO', cloudy: 'NUBLADO', wet: 'MOJADO', rain: 'LLUVIA', storm: 'TORMENTA', fog: 'NIEBLA', snow: 'NIEVE' };
const TIME_OPTS = [['auto', 'AUTO'], ['dawn', 'AMANECER'], ['day', 'DÍA'], ['sunset', 'ATARDECER'], ['dusk', 'ANOCHECER'], ['night', 'NOCHE']];
const WEATHER_OPTS = [['auto', 'AUTO'], ['clear', 'DESPEJADO'], ['cloudy', 'NUBLADO'], ['rain', 'LLUVIA'], ['storm', 'TORMENTA'], ['fog', 'NIEBLA'], ['snow', 'NIEVE']];
const DIFF = [['facil', 'PRINCIPIANTE'], ['normal', 'PROFESIONAL'], ['mitico', 'LEYENDA']];
const TIPS = [
  'Inclinar más no siempre es girar más: si te pasas del límite de agarre, la moto se abre.',
  'Frena recto y suelta el freno al inclinar. El neumático sólo tiene un 100% de agarre para repartir.',
  'Ponte detrás de un rival para aprovechar el rebufo: menos resistencia y el nitro se recarga más rápido.',
  'Los saltos largos recargan el nitro. Gas en el aire levanta el morro, freno lo baja.',
  'Para derrapar: inclina en la curva, toca ESPACIO y mantén el gas. Contravolantea para cerrar el derrape.',
  'Pulsa C para cambiar de cámara: persecución, lejana, a bordo o a ras de rueda.',
  'En mojado y nieve el agarre baja: frena antes y abre gas con suavidad.',
  'Las motos de campo (motocross, supermotard, trail) apenas pierden velocidad fuera del asfalto.',
  'X para hacer un caballito. Cuidado: si te pasas, te vas al suelo.',
  'En contrarreloj compites contra tu propio fantasma: tu mejor vuelta queda guardada.',
];

function trackThumb(def, w = 300, hh = 200, bare = false) {
  const c = canvas(w, hh);
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  if (!bare) {
  // muted theme tint over graphite, fine survey grid
  const tint = { gp: '#1c2a22', coast: '#2c2420', city: '#1a1c28', desert: '#2c2219', alpine: '#1f2630', forest: '#18221b' }[def.theme] || '#1c1d20';
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, '#141518'); grd.addColorStop(1, tint);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.045)'; g.lineWidth = 1;
  const step = Math.round(W / 12);
  for (let x = step; x < W; x += step) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
  for (let y = step; y < H; y += step) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  }
  const cl = trackThumb.cache[def.id] || (trackThumb.cache[def.id] = buildCenterline(def, 6));
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < cl.N; i++) { minX = Math.min(minX, cl.x[i]); maxX = Math.max(maxX, cl.x[i]); minZ = Math.min(minZ, cl.z[i]); maxZ = Math.max(maxZ, cl.z[i]); }
  const pad = W * 0.12;
  const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2.2) / (maxZ - minZ));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const T = (i) => [W / 2 - (cl.x[i] - cx) * sc, H * 0.44 - (cl.z[i] - cz) * sc];
  g.lineJoin = 'round'; g.lineCap = 'round';
  const path = new Path2D();
  for (let i = 0; i <= cl.N; i++) { const [x, y] = T(i % cl.N); if (i) path.lineTo(x, y); else path.moveTo(x, y); }
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = W * 0.028; g.stroke(path);
  g.strokeStyle = '#f3f4f6'; g.lineWidth = Math.max(2, W * 0.009); g.stroke(path);
  const [sx, sy] = T(0), [nx, ny] = T(3);
  const a = Math.atan2(ny - sy, nx - sx) + Math.PI / 2;
  g.strokeStyle = '#e2231a'; g.lineWidth = Math.max(3, W * 0.012);
  g.beginPath(); g.moveTo(sx - Math.cos(a) * W * 0.03, sy - Math.sin(a) * W * 0.03); g.lineTo(sx + Math.cos(a) * W * 0.03, sy + Math.sin(a) * W * 0.03); g.stroke();
  c.__len = cl.L;
  return c;
}
trackThumb.cache = {};

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.layer = h('div', { class: 'layer', style: { position: 'absolute', inset: '0' } });
    this.root.appendChild(this.layer);
    this.nav = []; this.navI = 0;
    this.current = null;
    this.modal = null;
  }

  // ---------------------------------------------------------------- helpers
  _screen(cls = '') {
    if (this.current) { const old = this.current; old.classList.remove('show'); setTimeout(() => old.remove(), 350); }
    const s = h('div', { class: 'screen ' + cls });
    this.layer.appendChild(s);
    requestAnimationFrame(() => s.classList.add('show'));
    this.current = s;
    this.nav = []; this.navI = 0;
    this.onBack = null;
    this.onLeftRight = null;
    this._onFocus = null;
    return s;
  }

  btn(label, icon, onClick, cls = '') {
    const b = h('button', { class: 'btn ' + cls }, h('span', { class: 'ico', html: icon || '' }), h('span', {}, label));
    b.addEventListener('click', () => { Audio.init(); Audio.click(); onClick(); });
    b.addEventListener('mouseenter', () => { const i = this.nav.indexOf(b); if (i >= 0) this._focus(i, false); Audio.hover(); });
    return b;
  }

  _setNav(list, start = 0) { this.nav = list; this._focus(start, false); }
  _focus(i, sound = true) {
    if (!this.nav.length) return;
    this.navI = (i + this.nav.length) % this.nav.length;
    this.nav.forEach((b, k) => b.classList.toggle('focus', k === this.navI));
    if (this._onFocus) this._onFocus(this.nav[this.navI]);
    if (sound) Audio.hover();
  }

  update(dt) {
    const e = Input.edges;
    if (this.game.race && !this.game.race.paused && this.game.race.phase !== 'results' && this.game.race.phase !== 'replay') return;
    if (!this.nav.length && !this.onBack) return;
    if (e.up) this._focus(this.navI - 1);
    if (e.down) this._focus(this.navI + 1);
    if ((e.left || e.right) && this.onLeftRight) this.onLeftRight(e.left ? -1 : 1);
    if (e.confirm && this.nav[this.navI]) this.nav[this.navI].click();
    if (e.back && this.onBack && !(this.game.race && this.game.race.paused && e.pause)) { Audio.back(); this.onBack(); }
  }

  closeModal() { if (this.modal) { this.modal.remove(); this.modal = null; } this.nav = this._savedNav || []; this.onBack = this._savedBack || null; }

  _modal(content, onBack) {
    if (this.modal) this.modal.remove();
    this._savedNav = this.nav; this._savedBack = this.onBack;
    this.modal = h('div', { class: 'modal-wrap' }, content);
    this.layer.appendChild(this.modal);
    this.onBack = onBack;
    return this.modal;
  }

  // ---------------------------------------------------------------- main menu
  mainMenu() {
    const g = this.game;
    g.garage.setMode('menu');
    const s = this._screen();
    const bike = BIKE_BY_ID[Save.data.garage.bike] || BIKES[0];
    const entries = [
      ['leyenda', 'Modo Leyenda', () => this.rpgHub()],
      ['race', 'Carrera rápida', () => this.trackSelect('race')],
      ['champ', 'Campeonato', () => this.champHub()],
      ['trial', 'Contrarreloj', () => this.trackSelect('trial')],
      ['free', 'Paseo libre', () => this.trackSelect('free')],
      ['garage', 'Garaje', () => this.garage()],
      ['records', 'Récords', () => this.records()],
      ['settings', 'Ajustes', () => this.settings(() => this.mainMenu())],
    ];
    const desc = h('div', { class: 'menu-desc' });
    const items = entries.map(([key, label, fn], i) => {
      const b = this.btn(label, '', fn, i === 0 ? 'primary' : '');
      b.dataset.key = key;
      return b;
    });
    const st = Save.data.stats;
    const stat = (n, label) => h('div', { class: 'stat-n' }, h('b', {}, String(n)), h('span', {}, label));
    s.append(
      h('div', { class: 'menu-scrim' }),
      h('div', { class: 'menu-left' },
        h('div', { class: 'logo' }, h('div', { class: 'bar' }), h('div', { class: 'l1' }, 'Moto'), h('div', { class: 'l2' }, 'Mítico'), h('div', { class: 'l3' }, 'Simulación de motociclismo')),
        ...items, desc),
      h('div', { class: 'stats-strip' }, stat(st.races, 'Carreras'), stat(st.wins, 'Victorias'), stat(st.podiums, 'Podios')),
      h('div', { class: 'menu-bike-tag' }, h('div', { class: 'k' }, bike.klass), h('div', { class: 'n' }, bike.name), h('div', { class: 's' }, `${bike.engine.label} · ${bike.engine.hp} CV · ${bike.mass} kg`)),
      h('div', { class: 'menu-foot' },
        h('span', {}, h('span', { class: 'keycap' }, '↑'), ' ', h('span', { class: 'keycap' }, '↓'), '  Navegar'),
        h('span', {}, h('span', { class: 'keycap' }, 'Enter'), '  Aceptar'),
        h('span', {}, h('span', { class: 'keycap' }, 'Esc'), '  Volver'),
        h('span', { class: 'grow' }),
        h('span', {}, `Versión 1.0 · ${BIKES.length} motos · 6 circuitos`)),
    );
    this._onFocus = (b) => { desc.textContent = MENU_DESC[b.dataset.key] || ''; };
    this._setNav(items);
    Audio.playMusic('menu');
  }

  // ---------------------------------------------------------------- garage
  garage(onDone = null) {
    const g = this.game;
    g.garage.setMode('garage');
    const s = this._screen();
    let idx = Math.max(0, BIKES.findIndex((b) => b.id === Save.data.garage.bike));
    let liv = Save.data.garage.livery[BIKES[idx].id] ?? 0;
    const list = h('div', { class: 'garage-list glass' });
    const panel = h('div', { class: 'spec-panel glass' });
    const items = BIKES.map((b, i) => {
      const it = h('div', { class: 'bike-item' }, h('div', { class: 'sw', style: { background: b.liveries[0].base === '#0b0b0d' || b.liveries[0].base === '#111111' ? b.liveries[0].accent : b.liveries[0].base } }),
        h('div', {}, h('div', { class: 't' }, b.name), h('div', { class: 'c' }, b.klass)));
      it.addEventListener('click', () => { Audio.select(); select(i); });
      list.appendChild(it);
      return it;
    });
    const select = (i, keepLivery = false) => {
      idx = (i + BIKES.length) % BIKES.length;
      const b = BIKES[idx];
      if (!keepLivery) liv = Save.data.garage.livery[b.id] ?? 0;
      items.forEach((it, k) => it.classList.toggle('on', k === idx));
      items[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      g.garage.setBike(b, liv);
      const st = bikeStats(b);
      clear(panel).append(
        h('div', { class: 'kicker' }, b.klass),
        h('div', { class: 'bn' }, b.name),
        h('div', { class: 'blurb' }, b.blurb),
        ...[['Velocidad', st.velocidad], ['Aceleración', st.aceleracion], ['Manejo', st.manejo], ['Frenada', st.frenada], ['Off-road', st.offroad]].map(([n, v]) =>
          h('div', { class: 'stat' }, h('div', { class: 'lab' }, h('span', {}, n), h('span', {}, String(Math.round(v * 10)))), h('div', { class: 'bar' }, h('i', { style: { width: `${v * 100}%` } })))),
        h('div', { class: 'specs-grid' },
          h('div', {}, h('span', {}, 'Motor'), h('b', {}, b.engine.label)),
          h('div', {}, h('span', {}, 'Potencia'), h('b', {}, `${b.engine.hp} CV`)),
          h('div', {}, h('span', {}, 'Peso'), h('b', {}, `${b.mass} kg`)),
          h('div', {}, h('span', {}, 'V. máxima'), h('b', {}, `${b.topKmh} km/h`)),
          h('div', {}, h('span', {}, 'Inclinación'), h('b', {}, `${b.maxLean}°`)),
          h('div', {}, h('span', {}, 'Cambio'), h('b', {}, b.engine.electric ? 'Directo' : `${b.engine.gears.length} vel.`)),
        ),
        h('div', { class: 'kicker', style: { marginTop: '16px' } }, `Decoración  ·  ${b.liveries[liv].name}`),
        h('div', { class: 'liveries' }, ...b.liveries.map((L, k) => {
          const d = h('div', { class: 'livery' + (k === liv ? ' on' : ''), title: L.name }, h('i', { style: { background: `linear-gradient(135deg, ${L.base} 0 50%, ${L.second} 50% 80%, ${L.accent} 80%)` } }));
          d.addEventListener('click', () => { Audio.select(); liv = k; select(idx, true); });
          return d;
        })),
      );
    };
    const confirm = () => {
      Save.data.garage.bike = BIKES[idx].id;
      Save.data.garage.livery[BIKES[idx].id] = liv;
      Save.save();
      if (onDone) onDone(); else this.mainMenu();
    };
    const choose = this.btn(onDone ? 'Elegir y continuar' : 'Elegir moto', ICON.play, confirm, 'primary');
    const back = this.btn('Volver', ICON.back, () => (onDone ? this.trackSelectBack() : this.mainMenu()), 'small');
    const left = h('div', { class: 'arrow-btn', style: { left: 'calc(min(300px, 40vw) + 34px)' } }, '‹');
    const right = h('div', { class: 'arrow-btn', style: { right: 'calc(min(360px, 44vw) + 34px)' } }, '›');
    left.addEventListener('click', () => { Audio.select(); select(idx - 1); });
    right.addEventListener('click', () => { Audio.select(); select(idx + 1); });
    s.append(
      h('div', { class: 'top-bar' }, h('h2', {}, 'Garaje'), h('span', { class: 'crumb' }, `${BIKES.length} motos`), h('span', { class: 'grow' }), h('span', { class: 'crumb' }, 'Arrastra para girar · rueda para acercar')),
      list, panel, left, right,
      h('div', { class: 'bottom-bar' }, back, choose),
    );
    select(idx);
    this._setNav([choose, back]);
    this.onLeftRight = (d) => { Audio.select(); select(idx + d); };
    this.onBack = () => (onDone ? this.trackSelectBack() : this.mainMenu());
  }

  // ---------------------------------------------------------------- track select
  trackSelect(mode) {
    this._tsMode = mode;
    const g = this.game;
    g.garage.setMode('garage');
    const s = this._screen();
    const S = Save.settings;
    let sel = Math.max(0, TRACKS.findIndex((t) => t.id === (this._lastTrack || 'gp')));
    const grid = h('div', { class: 'tracks-grid' });
    const cards = TRACKS.map((t, i) => {
      const th = trackThumb(t);
      const rec = Save.data.records[t.id];
      const c = h('div', { class: 'track-card' }, th,
        h('div', { class: 'badges' }, h('span', { class: 'pill' }, TIME_LABEL[t.time]), h('span', { class: 'pill' }, WEATHER_LABEL[t.weather])),
        h('div', { class: 'info' }, h('div', { class: 'nm' }, t.name), h('div', { class: 'meta' }, `${(th.__len / 1000).toFixed(2)} km · ${t.place}`),
          h('div', { class: 'meta' }, rec && rec.lap ? `Récord de vuelta  ${formatTime(rec.lap * 1000)}` : 'Sin tiempo registrado')));
      c.addEventListener('click', () => { Audio.select(); pick(i); });
      grid.appendChild(c);
      return c;
    });
    const opts = h('div', { class: 'race-opts glass' });
    const pick = (i) => {
      sel = (i + TRACKS.length) % TRACKS.length;
      this._lastTrack = TRACKS[sel].id;
      cards.forEach((c, k) => c.classList.toggle('on', k === sel));
      cards[sel].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      renderOpts();
    };
    const stepper = (label, get, set, fmt) => {
      const v = h('span', { class: 'v' }, fmt(get()));
      const mk = (d) => { const b = h('button', {}, d < 0 ? '−' : '+'); b.addEventListener('click', () => { Audio.click(); set(d); v.textContent = fmt(get()); }); return b; };
      return h('div', { class: 'opt' }, h('span', { class: 'lab' }, label), h('div', { class: 'stepper' }, mk(-1), v, mk(1)));
    };
    const renderOpts = () => {
      const t = TRACKS[sel];
      const bike = BIKE_BY_ID[Save.data.garage.bike] || BIKES[0];
      clear(opts);
      opts.append(
        h('div', { class: 'kicker acc' }, mode === 'race' ? 'Carrera rápida' : mode === 'trial' ? 'Contrarreloj' : 'Paseo libre'),
        h('div', { class: 'bn' }, t.name),
        h('div', { class: 'dim', style: { fontSize: '14px', lineHeight: '1.45', marginBottom: '10px' } }, t.blurb),
      );
      if (mode !== 'free') opts.append(stepper('Vueltas', () => S.laps, (d) => { S.laps = clamp(S.laps + d, 1, 10); Save.save(); }, (v) => String(v)));
      if (mode === 'race') {
        opts.append(stepper('Rivales', () => S.rivals, (d) => { S.rivals = clamp(S.rivals + d, 1, 11); Save.save(); }, (v) => String(v)));
        opts.append(stepper('Dificultad', () => DIFF.findIndex((x) => x[0] === S.difficulty), (d) => { const k = clamp(DIFF.findIndex((x) => x[0] === S.difficulty) + d, 0, 2); S.difficulty = DIFF[k][0]; Save.save(); }, (k) => DIFF[k][1]));
      }
      const cyc = (key, list, d) => { const k = list.findIndex((x) => x[0] === S[key]); S[key] = list[(Math.max(0, k) + d + list.length) % list.length][0]; Save.save(); };
      opts.append(stepper('Hora', () => S.timeSel, (d) => cyc('timeSel', TIME_OPTS, d), (v) => v === 'auto' ? `AUTO · ${TIME_LABEL[t.time]}` : TIME_LABEL[v]));
      opts.append(stepper('Clima', () => S.weatherSel, (d) => cyc('weatherSel', WEATHER_OPTS, d), (v) => v === 'auto' ? `AUTO · ${WEATHER_LABEL[t.weather]}` : WEATHER_LABEL[v]));
      const bikeRow = h('div', { class: 'opt' }, h('span', { class: 'lab' }, 'Moto'), h('span', { class: 'val' }, bike.name));
      opts.append(bikeRow);
      const ghost = Save.data.ghosts[t.id];
      if (mode === 'trial') opts.append(h('div', { class: 'opt' }, h('span', { class: 'lab' }, 'Fantasma'), h('span', { class: 'val' }, ghost ? `${formatTime(ghost.lap * 1000)} · ${(BIKE_BY_ID[ghost.bike] || bike).short}` : 'Ninguno')));
    };
    const go = this.btn('Salir a pista', ICON.play, () => {
      const t = TRACKS[sel];
      g.startRace({ mode, trackDef: t, bikeId: Save.data.garage.bike, livery: Save.data.garage.livery[Save.data.garage.bike] ?? 0, laps: mode === 'free' ? 9999 : S.laps, rivals: mode === 'race' ? S.rivals : 0, difficulty: S.difficulty, time: S.timeSel, weather: S.weatherSel });
    }, 'primary');
    const bikeBtn = this.btn('Cambiar moto', ICON.garage, () => this.garage(() => this.trackSelect(mode)), 'small');
    const back = this.btn('Volver', ICON.back, () => this.mainMenu(), 'small');
    s.append(
      h('div', { class: 'top-bar' }, h('h2', {}, 'Circuito'), h('span', { class: 'crumb' }, `${mode === 'race' ? 'Carrera rápida' : mode === 'trial' ? 'Contrarreloj' : 'Paseo libre'} · ${TRACKS.length} circuitos`)),
      grid, opts,
      h('div', { class: 'bottom-bar' }, back, bikeBtn, go),
    );
    pick(sel);
    this._setNav([go, bikeBtn, back]);
    this.onLeftRight = (d) => { Audio.select(); pick(sel + d); };
    this.onBack = () => this.mainMenu();
  }
  trackSelectBack() { this.trackSelect(this._tsMode || 'race'); }

  // ---------------------------------------------------------------- loading
  loading(def, cfg = {}) {
    def = { ...def, time: cfg.time && cfg.time !== 'auto' ? cfg.time : def.time, weather: cfg.weather && cfg.weather !== 'auto' ? cfg.weather : def.weather };
    const s = this._screen('loading');
    const fill = h('i', {});
    const msg = h('div', { class: 'boot-msg' }, 'Cargando…');
    const mini = trackThumb(def, 460, 460, true);
    mini.className = 'mini';
    s.append(mini,
      h('div', { class: 'kicker acc' }, `${TIME_LABEL[def.time]}  ·  ${WEATHER_LABEL[def.weather]}`),
      h('div', { class: 'tn' }, def.name), h('div', { class: 'tp' }, def.place),
      h('div', { class: 'tip' }, h('b', {}, 'Consejo'), TIPS[Math.floor(Math.random() * TIPS.length)]),
      h('div', { class: 'boot-bar' }, fill), msg);
    return (p, m) => { fill.style.width = `${Math.round(p * 100)}%`; if (m) msg.textContent = m; };
  }

  hideScreens() { if (this.current) { const o = this.current; o.classList.remove('show'); setTimeout(() => o.remove(), 350); this.current = null; } this.nav = []; this.onBack = null; this.onLeftRight = null; }

  // ---------------------------------------------------------------- pause
  pauseMenu(race) {
    const items = [
      this.btn('Continuar', ICON.play, () => race.togglePause(), 'primary'),
      this.btn('Reiniciar', ICON.retry, () => { this.closeModal(); this.game.restartRace(); }),
      this.btn('Cambiar cámara', ICON.cam, () => { race.cam.next(); Save.settings.camera = race.cam.mode; race.hud.camName(['PERSECUCIÓN', 'LEJANA', 'A BORDO', 'RUEDA'][race.cam.mode]); }),
      this.btn('Ajustes', ICON.settings, () => { this.closeModal(); this.settings(() => { this.hideScreens(); this.pauseMenu(race); }, true); }),
      this.btn('Salir al menú', ICON.exit, () => { this.closeModal(); this.game.exitRace(); }),
    ];
    const box = h('div', { class: 'modal glass' }, h('h2', {}, 'Pausa'), h('div', { class: 'kicker', style: { marginBottom: '16px' } }, `${race.track.def.name}  ·  ${formatTime(race.time * 1000)}`),
      h('div', { class: 'btns' }, ...items),
      h('div', { class: 'dim', style: { marginTop: '18px', fontSize: '13px', lineHeight: '1.5', maxWidth: '420px' } }, this._controlsHint()));
    this._modal(box, () => race.togglePause());
    this._setNav(items);
  }

  _controlsHint() {
    return h('div', {}, 'W/↑ gas  ·  S/↓ freno  ·  A/D inclinar  ·  Espacio derrapar  ·  Shift nitro  ·  X caballito  ·  C cámara  ·  R volver a pista');
  }

  // ---------------------------------------------------------------- results
  results(race, results, champInfo) {
    const s = this._screen('results');
    const me = results.find((r) => r.player);
    const placeCls = me.pos <= 3 ? `p${me.pos}` : '';
    const showPts = race.mode !== 'trial';
    const table = h('table', { class: 'res-table' },
      h('tr', {}, h('th', {}, 'Pos'), h('th', {}, 'Moto'), h('th', { class: 't' }, 'Tiempo'), h('th', { class: 't' }, 'Mejor vuelta'), showPts ? h('th', { class: 't' }, 'Pts') : null),
      ...results.map((r) =>
        h('tr', { class: r.player ? 'me' : '' },
          h('td', { class: `pos p${r.pos}` }, String(r.pos)),
          h('td', { class: 'nm' }, h('span', { class: 'sw', style: { background: r.color } }), r.name, r.player ? h('span', { class: 'you' }, 'Tú') : null),
          h('td', { class: 't' }, r.pos === 1 ? formatTime(r.time * 1000) : `+${(r.time - results[0].time).toFixed(3)}`),
          h('td', { class: 't' }, r.best ? formatTime(r.best * 1000) : '—'),
          showPts ? h('td', { class: 'pts' }, String(r.points)) : null,
        )));
    const items = [];
    if (champInfo && champInfo.next) items.push(this.btn('Siguiente ronda', ICON.play, () => this.game.champNext(), 'primary'));
    else if (champInfo && champInfo.done) items.push(this.btn('Clasificación final', ICON.champ, () => this.game.champFinal(), 'primary'));
    else items.push(this.btn('Continuar', ICON.play, () => this.game.exitRace(), 'primary'));
    if (!champInfo) items.push(this.btn('Revancha', ICON.retry, () => this.game.restartRace()));
    items.push(this.btn('Ver repetición', ICON.replay, () => this.game.watchReplay()));
    if (champInfo) items.push(this.btn('Salir', ICON.exit, () => this.game.exitRace()));
    const best = Math.min(...results.filter((r) => r.best).map((r) => r.best));
    const fact = (k, v) => h('div', {}, h('span', {}, k), h('b', {}, v));
    s.append(h('div', { class: 'results' }, h('div', { class: 'res-panel glass' },
      h('div', { class: 'kicker acc' }, race.mode === 'trial' ? 'Contrarreloj' : race.mode === 'champ' ? `Campeonato · Ronda ${champInfo?.round ?? ''}` : 'Clasificación final'),
      h('div', { class: 'res-head' },
        h('div', { class: 'big-place ' + placeCls + (race.mode === 'trial' ? ' word' : '') }, race.mode === 'trial' ? formatTime((me.best || 0) * 1000) : `${me.pos}º`),
        h('div', {}, h('div', { class: 'tn' }, race.track.def.name),
          h('div', { class: 'facts' },
            fact('Tu mejor vuelta', formatTime((me.best || 0) * 1000)),
            fact('Vuelta rápida', isFinite(best) ? formatTime(best * 1000) : '—'),
            fact('Velocidad punta', `${Math.round(race.player.phys.topSpeedSeen * 3.6)} km/h`)))),
      race.mode === 'trial' ? null : table,
      h('div', { class: 'btns', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '18px' } }, ...items),
    )));
    this._setNav(items);
    this.onBack = null;
  }

  replayOverlay() {
    const s = this._screen();
    const stop = this.btn('Salir de la repetición', ICON.back, () => this.game.endReplay(), 'small');
    const cam = this.btn('Cambiar cámara', ICON.cam, () => this.game.race.cam.next(), 'small');
    s.append(h('div', { class: 'replay-badge' }, 'REPETICIÓN'), h('div', { class: 'bottom-bar' }, cam, stop));
    this._setNav([stop, cam]);
    this.onBack = () => this.game.endReplay();
  }

  // ---------------------------------------------------------------- championship
  champHub() {
    const g = this.game;
    g.garage.setMode('garage');
    const s = this._screen();
    const c = Save.data.champ;
    const box = h('div', { class: 'spec-panel glass', style: { width: 'min(560px, 92vw)', left: 'auto' } });
    const items = [];
    if (!c || c.done) {
      box.append(h('div', { class: 'kicker acc' }, 'Campeonato'), h('div', { class: 'bn' }, `${TRACKS.length} rondas`),
        h('div', { class: 'blurb' }, 'Recorre los seis circuitos contra los 11 rivales. Puntos estilo Gran Premio: 25-20-16-13-11… El que más sume se corona campeón.'),
        h('div', { class: 'rounds' }, ...TRACKS.map((t, i) => h('span', { class: 'round' }, `${i + 1}. ${t.name}`))));
      const diffSel = h('div', { class: 'opt' });
      const S = Save.settings;
      const renderDiff = () => { clear(diffSel).append(h('span', { class: 'lab' }, 'Dificultad'), h('div', { class: 'stepper' },
        (() => { const b = h('button', {}, '−'); b.onclick = () => { S.difficulty = DIFF[clamp(DIFF.findIndex((x) => x[0] === S.difficulty) - 1, 0, 2)][0]; Audio.click(); renderDiff(); }; return b; })(),
        h('span', { class: 'v' }, DIFF.find((x) => x[0] === S.difficulty)[1]),
        (() => { const b = h('button', {}, '+'); b.onclick = () => { S.difficulty = DIFF[clamp(DIFF.findIndex((x) => x[0] === S.difficulty) + 1, 0, 2)][0]; Audio.click(); renderDiff(); }; return b; })())); };
      renderDiff();
      box.append(diffSel, h('div', { class: 'opt' }, h('span', { class: 'lab' }, 'Moto'), h('span', {}, (BIKE_BY_ID[Save.data.garage.bike] || BIKES[0]).name)));
      items.push(this.btn('Empezar campeonato', ICON.play, () => g.champStart(), 'primary'));
      items.push(this.btn('Cambiar moto', ICON.garage, () => this.garage(() => this.champHub()), 'small'));
    } else {
      box.append(h('div', { class: 'kicker acc' }, 'Campeonato en curso'), h('div', { class: 'bn' }, `Ronda ${c.round + 1} de ${TRACKS.length}`),
        h('div', { class: 'rounds' }, ...TRACKS.map((t, i) => h('span', { class: 'round ' + (i < c.round ? 'done' : i === c.round ? 'cur' : '') }, `${i + 1}. ${t.name}`))),
        this._standingsTable(c));
      items.push(this.btn(`Correr: ${TRACKS[c.round].name}`, ICON.play, () => g.champRace(), 'primary'));
      items.push(this.btn('Abandonar campeonato', ICON.exit, () => { Save.data.champ = null; Save.save(); this.champHub(); }, 'small'));
    }
    const back = this.btn('Volver', ICON.back, () => this.mainMenu(), 'small');
    items.push(back);
    box.append(h('div', { class: 'btns', style: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '18px' } }, ...items));
    s.append(h('div', { class: 'top-bar' }, h('h2', {}, 'Campeonato')), box);
    this._setNav(items);
    this.onBack = () => this.mainMenu();
  }

  _standingsTable(c) {
    const rows = Object.entries(c.points).sort((a, b) => b[1] - a[1]);
    return h('table', { class: 'champ-table' }, ...rows.map(([id, pts], i) => {
      const b = BIKE_BY_ID[id];
      return h('tr', { class: id === c.bike ? 'me' : '' }, h('td', { style: { width: '34px', fontWeight: 700 } }, String(i + 1)), h('td', {}, b ? b.name : id), h('td', { style: { textAlign: 'right', fontWeight: 700 } }, `${pts} pts`));
    }));
  }

  champFinal(c) {
    const s = this._screen('results');
    const rows = Object.entries(c.points).sort((a, b) => b[1] - a[1]);
    const pos = rows.findIndex(([id]) => id === c.bike) + 1;
    const items = [this.btn('Volver al menú', ICON.back, () => this.game.exitRace(), 'primary')];
    s.append(h('div', { class: 'results' }, h('div', { class: 'res-panel glass' },
      h('div', { class: 'kicker acc' }, 'Campeonato finalizado'),
      h('div', { class: 'big-place word ' + (pos <= 3 ? `p${pos}` : '') }, pos === 1 ? 'Campeón' : `${pos}º en la general`),
      this._standingsTable(c),
      h('div', { class: 'btns', style: { marginTop: '18px' } }, ...items))));
    this._setNav(items);
  }

  // ---------------------------------------------------------------- records
  records() {
    const s = this._screen();
    const rows = TRACKS.map((t) => {
      const r = Save.data.records[t.id] || {};
      const gh = Save.data.ghosts[t.id];
      return h('tr', {}, h('td', { class: 'nm' }, t.name),
        h('td', { class: 't' }, r.lap ? formatTime(r.lap * 1000) : '—'), h('td', {}, r.lapBike ? (BIKE_BY_ID[r.lapBike]?.short || '') : ''),
        h('td', { class: 't' }, r.race ? formatTime(r.race * 1000) : '—'), h('td', { class: 't' }, gh ? 'Guardado' : '—'));
    });
    const st = Save.data.stats;
    const back = this.btn('Volver', ICON.back, () => this.mainMenu(), 'small');
    const reset = this.btn('Borrar récords', ICON.clear, () => { Save.data.records = {}; Save.data.ghosts = {}; Save.save(); this.records(); }, 'small');
    s.append(h('div', { class: 'top-bar' }, h('h2', {}, 'Récords')),
      h('div', { class: 'spec-panel glass', style: { left: '18px', right: 'auto', width: 'min(720px, 94vw)' } },
        h('table', { class: 'res-table' }, h('tr', {}, h('th', {}, 'Circuito'), h('th', { class: 't' }, 'Vuelta'), h('th', {}, 'Moto'), h('th', { class: 't' }, 'Carrera'), h('th', { class: 't' }, 'Fantasma')), ...rows),
        h('div', { class: 'specs-grid', style: { gridTemplateColumns: 'repeat(3, 1fr)', marginTop: '20px' } },
          h('div', {}, h('span', {}, 'Carreras'), h('b', {}, String(st.races))), h('div', {}, h('span', {}, 'Victorias'), h('b', {}, String(st.wins))),
          h('div', {}, h('span', {}, 'Podios'), h('b', {}, String(st.podiums))), h('div', {}, h('span', {}, 'Caídas'), h('b', {}, String(st.crashes))),
          h('div', {}, h('span', {}, 'Km recorridos'), h('b', {}, (st.km || 0).toFixed(1))), h('div', {}, h('span', {}, 'Punta máx.'), h('b', {}, `${Math.round(st.topSpeed || 0)} km/h`)))),
      h('div', { class: 'bottom-bar' }, reset, back));
    this._setNav([back, reset]);
    this.onBack = () => this.mainMenu();
  }

  // ---------------------------------------------------------------- settings
  settings(onBack, inRace = false) {
    const s = this._screen();
    const S = Save.settings;
    let tab = 'graficos';
    const body = h('div', {});
    const tabs = h('div', { class: 'tabs' });
    const row = (label, ctrl) => h('div', { class: 'opt' }, h('span', { class: 'lab' }, label), ctrl);
    const toggle = (key, after) => { const t = h('div', { class: 'toggle' + (S[key] ? ' on' : '') }); t.addEventListener('click', () => { S[key] = !S[key]; t.classList.toggle('on', S[key]); Audio.click(); Save.save(); after && after(); }); return t; };
    const slider = (key, after) => { const r = h('input', { type: 'range', class: 'slider', min: '0', max: '1', step: '0.05', value: String(S[key]) }); r.addEventListener('input', () => { S[key] = +r.value; Save.save(); after && after(); }); return r; };
    const choice = (key, list, after) => {
      const v = h('span', { class: 'v' });
      const upd = () => { v.textContent = list.find((x) => x[0] === S[key])?.[1] ?? String(S[key]); };
      const mk = (d) => { const b = h('button', {}, d < 0 ? '‹' : '›'); b.addEventListener('click', () => { const i = list.findIndex((x) => x[0] === S[key]); S[key] = list[(i + d + list.length) % list.length][0]; upd(); Audio.click(); Save.save(); after && after(); }); return b; };
      upd();
      return h('div', { class: 'stepper' }, mk(-1), v, mk(1));
    };
    const render = () => {
      clear(tabs);
      for (const [id, name] of [['graficos', 'Gráficos'], ['sonido', 'Sonido'], ['juego', 'Juego'], ['controles', 'Controles']]) {
        const t = h('div', { class: 'tab' + (tab === id ? ' on' : '') }, name);
        t.addEventListener('click', () => { tab = id; Audio.click(); render(); });
        tabs.appendChild(t);
      }
      clear(body);
      if (tab === 'graficos') {
        body.append(
          row('Calidad', choice('quality', Object.entries(QUALITY).map(([k, v]) => [k, v.label]), () => { this.game.applyQuality(); })),
          row('Escala de resolución', choice('resScale', [[0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.25, '125%']], () => this.game.engine.resize())),
          row('Desenfoque de velocidad', toggle('motionBlur')),
          row('Mostrar FPS', toggle('showFps')),
          h('div', { class: 'dim', style: { fontSize: '13px', marginTop: '10px' } }, inRace ? 'Algunos cambios de calidad se aplican en la próxima carrera.' : 'BAJO para equipos modestos · ULTRA para tarjetas gráficas potentes.'),
        );
      } else if (tab === 'sonido') {
        body.append(row('Volumen general', slider('masterVol', () => Audio.applyVolumes())), row('Música', slider('musicVol', () => Audio.applyVolumes())), row('Efectos', slider('sfxVol', () => Audio.applyVolumes())));
      } else if (tab === 'juego') {
        body.append(
          row('Unidades', choice('units', [['kmh', 'KM/H'], ['mph', 'MPH']])),
          row('Cambio', choice('transmission', [['auto', 'AUTOMÁTICO'], ['manual', 'MANUAL']])),
          row('Ayudas de pilotaje', toggle('assist')),
          row('Línea de trazada', toggle('racingLine')),
          row('Vibración', toggle('vibration')),
          row('Controles táctiles', toggle('touch')),
          row('Cámara inicial', choice('camera', [[0, 'PERSECUCIÓN'], [1, 'LEJANA'], [2, 'A BORDO'], [3, 'RUEDA']])),
        );
      } else {
        const ctl = [['Acelerar', 'W / ↑', 'RT'], ['Frenar', 'S / ↓', 'LT'], ['Inclinar', 'A D / ← →', 'Stick izq.'], ['Freno trasero / derrape', 'ESPACIO', 'B'], ['Nitro', 'SHIFT / N', 'A'],
          ['Caballito', 'X', 'X'], ['Subir / bajar marcha', 'E / Q', 'RB / LB'], ['Cámara', 'C', 'Y'], ['Mirar atrás', 'B', 'L3'], ['Volver a pista', 'R', 'SELECT'], ['Pausa', 'ESC / P', 'START']];
        body.append(h('table', { class: 'res-table controls-table' }, h('tr', {}, h('th', {}, 'Acción'), h('th', {}, 'Teclado'), h('th', {}, 'Mando')),
          ...ctl.map(([a, k, p]) => h('tr', {}, h('td', {}, a), h('td', {}, h('span', { class: 'keycap' }, k)), h('td', {}, h('span', { class: 'keycap' }, p))))));
      }
    };
    render();
    const back = this.btn('Volver', ICON.back, () => onBack(), 'small');
    const reset = this.btn('Restablecer todo', ICON.clear, () => { if (confirm('¿Borrar ajustes, récords y progreso?')) { Save.reset(); this.game.applyQuality(); this.settings(onBack, inRace); } }, 'small');
    s.append(h('div', { class: 'modal-wrap' }, h('div', { class: 'modal glass', style: { width: 'min(640px, 94vw)' } }, h('h2', {}, 'Ajustes'), tabs, body,
      h('div', { class: 'row', style: { marginTop: '20px', justifyContent: 'flex-end' } }, inRace ? null : reset, back))));
    this._setNav([back]);
    this.onBack = onBack;
  }

  error(e) {
    const box = h('div', { class: 'error-box glass' }, h('h2', { style: { fontFamily: 'var(--font-h)', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' } }, 'Se ha producido un error'), h('div', { class: 'dim' }, String(e && e.message || e)),
      h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn small', onclick: () => location.reload() }, h('span', {}, 'Recargar'))));
    this.root.appendChild(box);
  }
}

installRpgUI(UI);
