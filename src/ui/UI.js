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

const ICON = { race: '▶', champ: '♛', trial: '◷', free: '∞', garage: '⚙', settings: '☰', records: '★', back: '◀', play: '▶', retry: '↻', replay: '⏵', exit: '⏏', cam: '◉' };
const TIME_LABEL = { day: 'DÍA', sunset: 'ATARDECER', dusk: 'ANOCHECER', night: 'NOCHE' };
const WEATHER_LABEL = { clear: 'DESPEJADO', wet: 'MOJADO', snow: 'NIEVE', storm: 'TORMENTA', rain: 'LLUVIA' };
const DIFF = [['facil', 'FÁCIL'], ['normal', 'NORMAL'], ['mitico', 'MÍTICO']];
const TIPS = [
  'Inclinar más no siempre es girar más: si te pasas del límite de agarre, la moto se abre.',
  'Frena recto y suelta el freno al inclinar. El neumático sólo tiene un 100% de agarre para repartir.',
  'Ponte detrás de un rival para aprovechar el rebufo: menos resistencia y el nitro se recarga más rápido.',
  'Los saltos largos recargan el nitro. Gas en el aire levanta el morro, freno lo baja.',
  'Freno trasero (ESPACIO) en mitad de la curva = derrape controlado al estilo supermotard.',
  'Pulsa C para cambiar de cámara: persecución, lejana, a bordo o a ras de rueda.',
  'En mojado y nieve el agarre baja: frena antes y abre gas con suavidad.',
  'Las motos de campo (motocross, supermotard, trail) apenas pierden velocidad fuera del asfalto.',
  'X para hacer un caballito. Cuidado: si te pasas, te vas al suelo.',
  'En contrarreloj compites contra tu propio fantasma: tu mejor vuelta queda guardada.',
];

function trackThumb(def, w = 300, hh = 200) {
  const c = canvas(w, hh);
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  const pal = { gp: ['#12301e', '#1d4a2c'], coast: ['#3a1e2a', '#ff8a4a'], city: ['#0a0820', '#2a0a3a'], desert: ['#3a1a10', '#a0502a'], alpine: ['#1a2a40', '#a8c0e0'], forest: ['#0a1a10', '#203a20'] }[def.theme] || ['#111', '#333'];
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, pal[0]); grd.addColorStop(1, pal[1]);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // texture lines
  g.globalAlpha = 0.07; g.strokeStyle = '#fff';
  for (let i = -H; i < W; i += 14) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); }
  g.globalAlpha = 1;
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
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = W * 0.035; g.stroke(path);
  g.strokeStyle = '#ffffff'; g.lineWidth = W * 0.014; g.shadowColor = '#00e5ff'; g.shadowBlur = W * 0.04; g.stroke(path);
  g.shadowBlur = 0;
  const [sx, sy] = T(0);
  g.fillStyle = '#00e5ff'; g.beginPath(); g.arc(sx, sy, W * 0.018, 0, Math.PI * 2); g.fill();
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
    return s;
  }

  btn(label, icon, onClick, cls = '') {
    const b = h('button', { class: 'btn ' + cls }, h('span', { class: 'ico' }, icon || ''), h('span', {}, label));
    b.addEventListener('click', () => { Audio.init(); Audio.click(); onClick(); });
    b.addEventListener('mouseenter', () => { const i = this.nav.indexOf(b); if (i >= 0) this._focus(i, false); Audio.hover(); });
    return b;
  }

  _setNav(list, start = 0) { this.nav = list; this._focus(start, false); }
  _focus(i, sound = true) {
    if (!this.nav.length) return;
    this.navI = (i + this.nav.length) % this.nav.length;
    this.nav.forEach((b, k) => b.classList.toggle('focus', k === this.navI));
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
    const items = [
      this.btn('Carrera rápida', ICON.race, () => this.trackSelect('race'), 'primary'),
      this.btn('Campeonato', ICON.champ, () => this.champHub()),
      this.btn('Contrarreloj', ICON.trial, () => this.trackSelect('trial')),
      this.btn('Paseo libre', ICON.free, () => this.trackSelect('free')),
      this.btn('Garaje', ICON.garage, () => this.garage()),
      this.btn('Récords', ICON.records, () => this.records()),
      this.btn('Ajustes', ICON.settings, () => this.settings(() => this.mainMenu())),
    ];
    const st = Save.data.stats;
    s.append(
      h('div', { class: 'menu-left' },
        h('div', { class: 'logo' }, h('div', { class: 'l1' }, 'MOTO'), h('div', { class: 'l2' }, 'MÍTICO'), h('div', { class: 'l3' }, 'ULTRA RACING 3D')),
        ...items),
      h('div', { class: 'stats-strip' },
        h('span', { class: 'pill c1' }, `${st.races} carreras`), h('span', { class: 'pill gold' }, `${st.wins} victorias`), h('span', { class: 'pill c2' }, `${st.podiums} podios`)),
      h('div', { class: 'menu-bike-tag' }, h('div', { class: 'k' }, bike.klass), h('div', { class: 'n' }, bike.name)),
      h('div', { class: 'menu-foot' },
        h('span', {}, h('span', { class: 'keycap' }, '↑'), ' ', h('span', { class: 'keycap' }, '↓'), ' navegar'),
        h('span', {}, h('span', { class: 'keycap' }, 'ENTER'), ' aceptar'),
        h('span', {}, h('span', { class: 'keycap' }, 'ESC'), ' volver'),
        h('span', { class: 'grow' }),
        h('span', {}, 'v1.0 · Motor 3D procedural · 12 motos · 6 circuitos')),
    );
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
      const it = h('div', { class: 'bike-item' }, h('div', { class: 'sw', style: { background: `linear-gradient(${b.liveries[0].base}, ${b.liveries[0].second})` } }),
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
        h('div', { class: 'kicker', style: { marginTop: '16px' } }, `Decoración · ${b.liveries[liv].name}`),
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
      h('div', { class: 'top-bar' }, h('h2', {}, 'GARAJE'), h('span', { class: 'pill c1' }, '12 MOTOS'), h('span', { class: 'grow' }), h('span', { class: 'dim' }, 'Arrastra para girar · rueda para zoom')),
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
        h('div', { class: 'badges' }, h('span', { class: 'pill' }, TIME_LABEL[t.time]), h('span', { class: 'pill c1' }, WEATHER_LABEL[t.weather])),
        h('div', { class: 'info' }, h('div', { class: 'nm' }, t.name), h('div', { class: 'meta' }, `${(th.__len / 1000).toFixed(2)} km · ${t.place}`),
          h('div', { class: 'meta' }, rec && rec.lap ? `Récord: ${formatTime(rec.lap * 1000)}` : 'Sin récord')));
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
        h('div', { class: 'kicker' }, mode === 'race' ? 'CARRERA RÁPIDA' : mode === 'trial' ? 'CONTRARRELOJ' : 'PASEO LIBRE'),
        h('div', { class: 'bn', style: { fontFamily: 'var(--font-h)', fontWeight: 900, fontSize: '24px', margin: '6px 0 4px' } }, t.name),
        h('div', { class: 'dim', style: { fontSize: '15px', marginBottom: '10px' } }, t.blurb),
      );
      if (mode !== 'free') opts.append(stepper('Vueltas', () => S.laps, (d) => { S.laps = clamp(S.laps + d, 1, 10); Save.save(); }, (v) => String(v)));
      if (mode === 'race') {
        opts.append(stepper('Rivales', () => S.rivals, (d) => { S.rivals = clamp(S.rivals + d, 1, 11); Save.save(); }, (v) => String(v)));
        opts.append(stepper('Dificultad', () => DIFF.findIndex((x) => x[0] === S.difficulty), (d) => { const k = clamp(DIFF.findIndex((x) => x[0] === S.difficulty) + d, 0, 2); S.difficulty = DIFF[k][0]; Save.save(); }, (k) => DIFF[k][1]));
      }
      const bikeRow = h('div', { class: 'opt' }, h('span', { class: 'lab' }, 'Moto'), h('span', { style: { fontFamily: 'var(--font-h)', fontWeight: 700 } }, bike.short));
      opts.append(bikeRow);
      const ghost = Save.data.ghosts[t.id];
      if (mode === 'trial') opts.append(h('div', { class: 'opt' }, h('span', { class: 'lab' }, 'Fantasma'), h('span', {}, ghost ? `${formatTime(ghost.lap * 1000)} · ${(BIKE_BY_ID[ghost.bike] || bike).short}` : 'Ninguno')));
    };
    const go = this.btn('¡A correr!', ICON.play, () => {
      const t = TRACKS[sel];
      g.startRace({ mode, trackDef: t, bikeId: Save.data.garage.bike, livery: Save.data.garage.livery[Save.data.garage.bike] ?? 0, laps: mode === 'free' ? 9999 : S.laps, rivals: mode === 'race' ? S.rivals : 0, difficulty: S.difficulty });
    }, 'primary');
    const bikeBtn = this.btn('Cambiar moto', ICON.garage, () => this.garage(() => this.trackSelect(mode)), 'small');
    const back = this.btn('Volver', ICON.back, () => this.mainMenu(), 'small');
    s.append(
      h('div', { class: 'top-bar' }, h('h2', {}, 'ELIGE CIRCUITO'), h('span', { class: 'pill c1' }, `${TRACKS.length} CIRCUITOS`)),
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
  loading(def) {
    const s = this._screen('loading');
    const fill = h('i', {});
    const msg = h('div', { class: 'boot-msg' }, 'Cargando…');
    const mini = trackThumb(def, 460, 460);
    mini.className = 'mini';
    s.append(mini,
      h('div', { class: 'kicker' }, `${TIME_LABEL[def.time]} · ${WEATHER_LABEL[def.weather]}`),
      h('div', { class: 'tn' }, def.name), h('div', { class: 'tp' }, def.place),
      h('div', { class: 'tip' }, '💡 ' + TIPS[Math.floor(Math.random() * TIPS.length)]),
      h('div', { class: 'boot-bar' }, fill), msg);
    s.style.background = 'radial-gradient(ellipse at 70% 30%, #10203c, #05060a 70%)';
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
    const box = h('div', { class: 'modal glass' }, h('h2', {}, 'PAUSA'), h('div', { class: 'dim', style: { marginBottom: '14px' } }, `${race.track.def.name} · ${formatTime(race.time * 1000)}`),
      h('div', { class: 'btns' }, ...items),
      h('div', { class: 'dim', style: { marginTop: '16px', fontSize: '13px' } }, this._controlsHint()));
    this._modal(box, () => race.togglePause());
    this._setNav(items);
  }

  _controlsHint() {
    return h('div', {}, 'W/↑ gas · S/↓ freno · A/D inclinar · ESPACIO freno trasero · SHIFT nitro · X caballito · C cámara · R volver a pista');
  }

  // ---------------------------------------------------------------- results
  results(race, results, champInfo) {
    const s = this._screen('results');
    const me = results.find((r) => r.player);
    const placeCls = me.pos <= 3 ? `p${me.pos}` : '';
    const table = h('table', { class: 'res-table' }, ...results.map((r) =>
      h('tr', { class: r.player ? 'me' : '' },
        h('td', { class: `pos p${r.pos}` }, String(r.pos)),
        h('td', {}, h('span', { style: { display: 'inline-block', width: '8px', height: '16px', background: r.color, borderRadius: '2px', marginRight: '8px', verticalAlign: 'middle' } }), r.name, r.player ? '  (TÚ)' : ''),
        h('td', { class: 't' }, r.pos === 1 ? formatTime(r.time * 1000) : `+${(r.time - results[0].time).toFixed(3)}`),
        h('td', { class: 't' }, r.best ? formatTime(r.best * 1000) : '—'),
        race.mode !== 'trial' ? h('td', { class: 'pts' }, `+${r.points}`) : null,
      )));
    const items = [];
    if (champInfo && champInfo.next) items.push(this.btn('Siguiente ronda', ICON.play, () => this.game.champNext(), 'primary'));
    else if (champInfo && champInfo.done) items.push(this.btn('Clasificación final', ICON.champ, () => this.game.champFinal(), 'primary'));
    else items.push(this.btn('Continuar', ICON.play, () => this.game.exitRace(), 'primary'));
    if (!champInfo) items.push(this.btn('Revancha', ICON.retry, () => this.game.restartRace()));
    items.push(this.btn('Ver repetición', ICON.replay, () => this.game.watchReplay()));
    if (champInfo) items.push(this.btn('Salir', ICON.exit, () => this.game.exitRace()));
    const best = Math.min(...results.filter((r) => r.best).map((r) => r.best));
    s.append(h('div', { class: 'results' }, h('div', { class: 'res-panel glass' },
      h('div', { class: 'kicker' }, race.mode === 'trial' ? 'CONTRARRELOJ' : race.mode === 'champ' ? `CAMPEONATO · RONDA ${champInfo?.round ?? ''}` : 'RESULTADO FINAL'),
      h('div', { class: 'row' }, h('div', { class: 'big-place ' + placeCls }, race.mode === 'trial' ? formatTime((me.best || 0) * 1000) : `${me.pos}º`),
        h('div', { style: { marginLeft: '16px' } }, h('div', { style: { fontFamily: 'var(--font-h)', fontSize: '20px', fontWeight: 900 } }, race.track.def.name),
          h('div', { class: 'dim' }, `Tu mejor vuelta: ${formatTime((me.best || 0) * 1000)}`), h('div', { class: 'dim' }, `Vuelta rápida: ${isFinite(best) ? formatTime(best * 1000) : '—'}`),
          h('div', { class: 'dim' }, `Vel. punta: ${Math.round(race.player.phys.topSpeedSeen * 3.6)} km/h`))),
      race.mode === 'trial' ? null : table,
      h('div', { class: 'btns', style: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '18px' } }, ...items),
    )));
    this._setNav(items);
    this.onBack = null;
  }

  replayOverlay() {
    const s = this._screen();
    const stop = this.btn('Salir de la repetición', ICON.back, () => this.game.endReplay(), 'small');
    const cam = this.btn('Cambiar cámara', ICON.cam, () => this.game.race.cam.next(), 'small');
    s.append(h('div', { class: 'replay-badge' }, '● REPETICIÓN'), h('div', { class: 'bottom-bar' }, cam, stop));
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
      box.append(h('div', { class: 'kicker' }, 'CAMPEONATO MÍTICO'), h('div', { class: 'bn' }, '6 RONDAS'),
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
      box.append(h('div', { class: 'kicker' }, 'CAMPEONATO EN CURSO'), h('div', { class: 'bn' }, `RONDA ${c.round + 1} / ${TRACKS.length}`),
        h('div', { class: 'rounds' }, ...TRACKS.map((t, i) => h('span', { class: 'round ' + (i < c.round ? 'done' : i === c.round ? 'cur' : '') }, `${i + 1}. ${t.name}`))),
        this._standingsTable(c));
      items.push(this.btn(`Correr: ${TRACKS[c.round].name}`, ICON.play, () => g.champRace(), 'primary'));
      items.push(this.btn('Abandonar campeonato', ICON.exit, () => { Save.data.champ = null; Save.save(); this.champHub(); }, 'small'));
    }
    const back = this.btn('Volver', ICON.back, () => this.mainMenu(), 'small');
    items.push(back);
    box.append(h('div', { class: 'btns', style: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '18px' } }, ...items));
    s.append(h('div', { class: 'top-bar' }, h('h2', {}, 'CAMPEONATO')), box);
    this._setNav(items);
    this.onBack = () => this.mainMenu();
  }

  _standingsTable(c) {
    const rows = Object.entries(c.points).sort((a, b) => b[1] - a[1]);
    return h('table', { class: 'champ-table' }, ...rows.map(([id, pts], i) => {
      const b = BIKE_BY_ID[id];
      return h('tr', { class: id === c.bike ? 'me' : '' }, h('td', { style: { fontFamily: 'var(--font-h)', width: '30px' } }, String(i + 1)), h('td', {}, b ? b.name : id, id === c.bike ? ' (TÚ)' : ''), h('td', { style: { textAlign: 'right', fontFamily: 'var(--font-h)', color: 'var(--c1)' } }, String(pts)));
    }));
  }

  champFinal(c) {
    const s = this._screen('results');
    const rows = Object.entries(c.points).sort((a, b) => b[1] - a[1]);
    const pos = rows.findIndex(([id]) => id === c.bike) + 1;
    const items = [this.btn('Volver al menú', ICON.back, () => this.game.exitRace(), 'primary')];
    s.append(h('div', { class: 'results' }, h('div', { class: 'res-panel glass' },
      h('div', { class: 'kicker' }, 'CAMPEONATO FINALIZADO'),
      h('div', { class: 'big-place ' + (pos <= 3 ? `p${pos}` : '') }, pos === 1 ? '¡CAMPEÓN!' : `${pos}º FINAL`),
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
      return h('tr', {}, h('td', { style: { fontFamily: 'var(--font-h)' } }, t.name),
        h('td', { class: 't' }, r.lap ? formatTime(r.lap * 1000) : '—'), h('td', {}, r.lapBike ? (BIKE_BY_ID[r.lapBike]?.short || '') : ''),
        h('td', { class: 't' }, r.race ? formatTime(r.race * 1000) : '—'), h('td', {}, gh ? '👻' : ''));
    });
    const st = Save.data.stats;
    const back = this.btn('Volver', ICON.back, () => this.mainMenu(), 'small');
    const reset = this.btn('Borrar récords', '✕', () => { Save.data.records = {}; Save.data.ghosts = {}; Save.save(); this.records(); }, 'small');
    s.append(h('div', { class: 'top-bar' }, h('h2', {}, 'RÉCORDS')),
      h('div', { class: 'spec-panel glass', style: { left: '18px', right: 'auto', width: 'min(720px, 94vw)' } },
        h('table', { class: 'res-table' }, h('tr', {}, h('td', { class: 'dim' }, 'CIRCUITO'), h('td', { class: 'dim t' }, 'VUELTA'), h('td', { class: 'dim' }, 'MOTO'), h('td', { class: 'dim t' }, 'CARRERA'), h('td', {})), ...rows),
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
      for (const [id, name] of [['graficos', 'GRÁFICOS'], ['sonido', 'SONIDO'], ['juego', 'JUEGO'], ['controles', 'CONTROLES']]) {
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
          row('Vibración', toggle('vibration')),
          row('Controles táctiles', toggle('touch')),
          row('Cámara inicial', choice('camera', [[0, 'PERSECUCIÓN'], [1, 'LEJANA'], [2, 'A BORDO'], [3, 'RUEDA']])),
        );
      } else {
        const ctl = [['Acelerar', 'W / ↑', 'RT'], ['Frenar', 'S / ↓', 'LT'], ['Inclinar', 'A D / ← →', 'Stick izq.'], ['Freno trasero / derrape', 'ESPACIO', 'B'], ['Nitro', 'SHIFT / N', 'A'],
          ['Caballito', 'X', 'X'], ['Subir / bajar marcha', 'E / Q', 'RB / LB'], ['Cámara', 'C', 'Y'], ['Mirar atrás', 'B', 'L3'], ['Volver a pista', 'R', 'SELECT'], ['Pausa', 'ESC / P', 'START']];
        body.append(h('table', { class: 'controls-table' }, h('tr', {}, h('td', { class: 'dim' }, 'ACCIÓN'), h('td', { class: 'dim' }, 'TECLADO'), h('td', { class: 'dim' }, 'MANDO')),
          ...ctl.map(([a, k, p]) => h('tr', {}, h('td', {}, a), h('td', {}, h('span', { class: 'keycap' }, k)), h('td', {}, h('span', { class: 'keycap' }, p))))));
      }
    };
    render();
    const back = this.btn('Volver', ICON.back, () => onBack(), 'small');
    const reset = this.btn('Restablecer todo', '✕', () => { if (confirm('¿Borrar ajustes, récords y progreso?')) { Save.reset(); this.game.applyQuality(); this.settings(onBack, inRace); } }, 'small');
    s.append(h('div', { class: 'modal-wrap' }, h('div', { class: 'modal glass', style: { width: 'min(640px, 94vw)' } }, h('h2', {}, 'AJUSTES'), tabs, body,
      h('div', { class: 'row', style: { marginTop: '20px', justifyContent: 'flex-end' } }, inRace ? null : reset, back))));
    this._setNav([back]);
    this.onBack = onBack;
  }

  error(e) {
    const box = h('div', { class: 'error-box glass' }, h('h2', {}, 'Algo salió mal'), h('div', { class: 'dim' }, String(e && e.message || e)),
      h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn small', onclick: () => location.reload() }, h('span', {}, 'Recargar'))));
    this.root.appendChild(box);
  }
}
