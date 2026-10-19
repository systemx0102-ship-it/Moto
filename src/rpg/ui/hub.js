// Modo Leyenda — hub, starter choice, region map, event briefing, contracts,
// dealership and the post-event rewards screen. The methods become UI methods
// (this = the UI instance). Styles: src/rpg/hub.css, every class prefixed lh-.
import { h, clear } from '../../ui/dom.js';
import { trackThumb } from '../../ui/UI.js';
import { BIKES, BIKE_BY_ID } from '../../bikes/catalog.js';
import { TRACK_BY_ID } from '../../track/catalog.js';
import { Audio } from '../../core/Audio.js';
import { formatTime } from '../../core/utils.js';
import { Rpg } from '../Rpg.js';
import * as D from '../data.js';
import { RICON, fmtN, icon, bar, rpgTopBar, stars, rarityTag, itemCard } from './common.js';

const SVG = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICO = {
  play: SVG('<path d="M8 5l11 7-11 7z"/>'),
  back: SVG('<path d="M15 5l-7 7 7 7"/>'),
  retry: SVG('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>'),
  replay: SVG('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M10 9l5 3-5 3z"/>'),
  exit: SVG('<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>'),
  garage: SVG('<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-7h5l3 7M10 10l-1-3H7M15 10l2-3h2"/>'),
  swap: SVG('<path d="M4 8h14l-3-3M20 16H6l3 3"/>'),
  xp: SVG('<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>'),
  part: SVG('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>'),
  unlock: SVG('<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
};
// one icon per event type
const TYPE_ICON = {
  carrera: SVG('<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>'),
  duelo: SVG('<path d="M3 8h14M13 4l4 4-4 4"/><path d="M21 16H7M11 12l-4 4 4 4"/>'),
  eliminacion: SVG('<path d="M4 5h16l-6 7.5V19l-4 2v-8.5z"/>'),
  contrarreloj: SVG('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M10 2.5h4M12 2.5V6M18.5 6.5L20 5"/>'),
  derrape: SVG('<path d="M5 20c0-7.7 6.3-14 14-14"/><path d="M15 3l4 3-3 4"/><path d="M4 13h3M6 9h3"/>'),
  jefe: RICON.boss,
};
const TIME_NAME = { dawn: 'Amanecer', day: 'Día', sunset: 'Atardecer', dusk: 'Anochecer', night: 'Noche' };
const WEATHER_NAME = { clear: 'Despejado', cloudy: 'Nublado', wet: 'Mojado', rain: 'Lluvia', storm: 'Tormenta', fog: 'Niebla', snow: 'Nieve' };
const TRIAL = { contrarreloj: true, derrape: true };

const pct = (v) => `${Math.max(0, Math.min(100, v))}%`;
const fmtDec = (v) => (Math.round(v * 10) / 10).toLocaleString('es-ES');
const plural = (n, one, many) => `${fmtN(n)} ${n === 1 ? one : many}`;

// section heading: caps label + hairline (+ optional right-hand element)
const head = (title, extra = null) => h('div', { class: 'lh-h' }, h('span', {}, title), h('i'), extra);
const fact = (k, v) => h('div', { class: 'lh-fact' }, h('span', {}, k), h('b', {}, v));
const badge = (text, cls = '') => h('span', { class: 'lh-badge ' + cls }, text);
// Element.append() would print null/false as text: drop them first
const put = (el, ...kids) => { el.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false)); return el; };
// catalogue track names are upper case; sentence lines want 'Costa Dorada'
const SMALL = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y']);
const tc = (str) => str.toLowerCase().split(' ').map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
// '1 pruebas' -> '1 prueba' in generated contract texts; decimal comma for Spanish
const ONE = { pruebas: 'prueba', podios: 'podio', estrellas: 'estrella', rivales: 'rival' };
const sing = (t) => t.replace(/\b1 (pruebas|podios|estrellas|rivales)\b/, (m, w) => `1 ${ONE[w]}`);
const comma = (t) => t.replace(/(\d)\.(\d)/g, '$1,$2');
const keys = (list) => h('div', { class: 'lh-keys' }, ...list.map(([k, t]) => h('span', {}, ...k.split(' ').map((x) => h('span', { class: 'keycap' }, x)), h('em', {}, t))));

// the six core ratings: solid base + lighter bonus from parts, mastery and talents
function ratingRows(id, baseOnly = false) {
  const R = Rpg.ratings(id);
  return h('div', { class: 'lh-rates' }, ...D.CORE_STATS.map((k) => {
    const r = R[k], tot = baseOnly ? r.base : r.total, bonus = Math.max(0, tot - r.base);
    return h('div', { class: 'lh-rate', title: D.STATS[k].desc },
      h('span', { class: 'k' }, D.STATS[k].name),
      h('div', { class: 'b' },
        h('i', { class: 'base', style: { width: pct(r.base) } }),
        bonus ? h('i', { class: 'bonus', style: { left: pct(r.base), width: pct(Math.min(100, tot) - r.base) } }) : null),
      h('b', {}, String(tot)),
      h('span', { class: 'plus' }, bonus ? `+${bonus}` : ''));
  }));
}

// lifetime record of the mode (Rpg.s.life)
function lifeStrip() {
  const L = Rpg.s.life;
  const cell = (k, v, u = '') => h('div', {}, h('span', {}, k), h('b', {}, v), u ? h('small', {}, u) : null);
  return h('div', { class: 'lh-life glass' }, head('Trayectoria'),
    h('div', { class: 'lh-life-g' },
      cell('Pruebas', fmtN(L.races || 0)), cell('Victorias', fmtN(L.wins || 0)), cell('Podios', fmtN(L.podiums || 0)),
      cell('Adelantamientos', fmtN(L.overtakes || 0)), cell('Derrape', fmtN(L.driftS || 0), 's'), cell('Distancia', fmtDec(L.km || 0), 'km'),
      cell('Punta máxima', fmtN(L.topKmh || 0), 'km/h'), cell('Jefes', fmtN(L.bosses || 0))));
}

function bikeFacts(b) {
  return h('div', { class: 'lh-facts' },
    fact('Motor', b.engine.label), fact('Potencia', `${b.engine.hp} CV`),
    fact('Peso', `${b.mass} kg`), fact('V. máxima', `${b.topKmh} km/h`));
}

// rAF tween with ease-out; registers a finisher in `fin` so a skip jumps to the end
function tween(fin, ms, cb) {
  const t0 = performance.now();
  let raf = 0;
  const end = () => { cancelAnimationFrame(raf); fin.delete(end); cb(1); };
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    if (k >= 1) { end(); return; }
    cb(1 - (1 - k) ** 3);
    raf = requestAnimationFrame(tick);
  };
  fin.add(end);
  raf = requestAnimationFrame(tick);
}

// face-down part card that flips to reveal itemCard(); rarity glow on the frame
function flipCard(it, opts = {}) {
  const R = D.RARITY[it.rar];
  const front = itemCard(it, opts);
  const v = it.salvaged ? Rpg.salvageValue(it) : null;
  return h('div', { class: `lh-flip r-${R.id}` + (it.rar >= 3 ? ' big' : '') + (it.salvaged ? ' salv' : '') },
    h('div', { class: 'lh-flip-in' },
      h('div', { class: 'lh-front' }, front,
        v ? h('div', { class: 'lh-salv' }, h('b', {}, 'Desguazada'), h('span', {}, 'Inventario lleno'), h('em', {}, `+${fmtN(v.frags)} fragmentos · +${fmtN(v.credits)} créditos`)) : null),
      h('div', { class: 'lh-back' }, h('div', { class: 'lh-back-mark' }, icon(ICO.part), h('span', {}, 'Pieza')))));
}

export const hubScreens = {
  // ---------------------------------------------------------------- helpers
  // move the nav to another list, clearing the old list's highlight
  _lhSwapNav(list, i = 0) {
    for (const el of this.nav) el.classList.remove('focus');
    this._setNav(list, i);
  },
  // custom focusables (tiles, nodes, swatches) follow the mouse like buttons do
  _lhHover(el) {
    el.addEventListener('mouseenter', () => { const i = this.nav.indexOf(el); if (i >= 0 && i !== this.navI) this._focus(i, false); });
    return el;
  },
  _lhToast(s, text, cls = '') {
    const t = h('div', { class: 'lh-toast ' + cls }, text);
    s.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => t.remove(), 2700);
  },

  // ---------------------------------------------------------------- hub
  rpgHub() {
    if (!Rpg.started) { this.rpgStarter(); return; }
    const g = this.game;
    g.garage.setMode('garage');
    const spec = Rpg.activeSpec();
    g.garage.setBike(spec, Rpg.bike().livery || 0);
    const s = this._screen('lh lh-hub');
    const regs = Rpg.regions();
    const next = Rpg.nextEvent();
    const reg = regs[next.regionIndex];
    const nNew = Rpg.newCount(), tp = Rpg.talentPoints().free, mi = Rpg.masteryInfo();
    const ready = Rpg.contracts().filter((c) => c.done).length;
    const st = Rpg.stats();

    // left column: continue + the mode's sections
    const go = (key, fn) => () => { this._lhHubKey = key; fn(); };
    const cont = this.btn('', ICO.play, go('cont', () => this.rpgEvent(next.id, () => this.rpgHub())), 'primary lh-cont');
    cont.lastChild.replaceWith(h('span', { class: 'lh-cont-t' },
      h('b', {}, `Continuar · ${next.name}`),
      h('small', {}, `${reg.name} · ${D.TYPE_NAME[next.type]} · Nivel ${next.level}`)));
    cont.dataset.key = 'cont';
    const entry = (key, label, ic, fn, note = null) => {
      const b = this.btn(label, ic, go(key, fn));
      b.dataset.key = key;
      if (note) b.appendChild(badge(note));
      return b;
    };
    const items = [cont,
      entry('map', 'Mapa de regiones', RICON.map, () => { this._lhMap = null; this.rpgMap(); }),
      entry('gear', 'Equipamiento', RICON.gear, () => this.rpgGear?.(), nNew ? plural(nNew, 'nueva', 'nuevas') : null),
      entry('talents', 'Talentos', RICON.talents, () => this.rpgTalents?.(), tp > 0 ? plural(tp, 'punto', 'puntos') : null),
      entry('forge', 'Taller y forja', RICON.forge, () => this.rpgForge?.()),
      entry('contracts', 'Contratos', RICON.contracts, () => this.rpgContracts(), ready ? `${ready} por cobrar` : null),
      entry('shop', 'Concesionario', RICON.shop, () => this.rpgShop()),
      entry('menu', 'Menú principal', ICO.exit, () => { this._lhHubKey = null; this.mainMenu(); }),
    ];

    // right column: the active machine
    const mBtn = this.btn('Maestría', RICON.mastery, go('mastery', () => this.rpgMastery?.()), 'small');
    if (mi.free > 0) mBtn.appendChild(badge(plural(mi.free, 'punto', 'puntos')));
    const swap = this.btn('Cambiar moto', ICO.swap, go('shop', () => this.rpgShop()), 'small');
    const right = [mBtn, swap];
    const perks = st.perks.map((p) => D.PERKS[p]).filter(Boolean);
    const panel = h('div', { class: 'lh-machine glass' + (perks.length ? '' : ' noperks') },
      h('div', { class: 'kicker' }, `Moto activa · ${spec.klass}`),
      h('div', { class: 'lh-mname' }, spec.name),
      h('div', { class: 'lh-mrow' },
        h('div', { class: 'lh-pow' }, h('div', { class: 'n' }, icon(RICON.power), h('b', {}, fmtN(st.power))), h('span', {}, 'Poder')),
        h('div', { class: 'lh-mast' },
          h('div', { class: 'k' }, h('span', {}, `Maestría ${mi.level}`), h('span', {}, mi.max ? 'Máx.' : `${fmtN(mi.xp)} / ${fmtN(mi.need)}`)),
          bar(mi.frac, 'mastery'),
          h('div', { class: 's' }, mi.free > 0 ? `${plural(mi.free, 'punto', 'puntos')} por asignar` : `${mi.spent} de ${mi.points} puntos asignados`))),
      head('Atributos', h('span', { class: 'lh-legend' }, h('i', { class: 'a' }), 'Base', h('i', { class: 'b' }), 'Mejoras')),
      ratingRows(spec.id),
      h('div', { class: 'lh-perkh' }, head('Poderes únicos')),
      perks.length
        ? h('div', { class: 'lh-perks' }, ...perks.map((p) => h('div', { class: 'lh-perk' }, h('b', {}, p.name), h('span', {}, p.desc))))
        : h('div', { class: 'lh-none' }, 'Ninguno activo. Las piezas legendarias, las míticas y algunos talentos otorgan poderes únicos.'),
      h('div', { class: 'lh-mbtns' }, mBtn, swap));

    // progress strip
    const maxStars = regs.reduce((a, r) => a + r.maxStars, 0), nStars = Rpg.totalStars();
    const nBoss = Object.keys(Rpg.s.bosses).length, nRegDone = regs.filter((r) => r.done).length;
    const pr = (k, v, frac) => h('div', { class: 'lh-pr' }, h('span', {}, k), h('b', {}, v), bar(frac));
    put(s,
      h('div', { class: 'lh-scrim' }),
      rpgTopBar('Leyenda', `Región ${reg.index + 1} de ${regs.length} · ${reg.name} · ${reg.sub}`),
      h('div', { class: 'lh-nav' }, ...items),
      panel,
      h('div', { class: 'lh-foot' },
        h('div', { class: 'lh-prog' },
          pr('Regiones', `${nRegDone}/${regs.length}`, nRegDone / regs.length),
          pr('Estrellas', `${nStars}/${maxStars}`, nStars / maxStars),
          pr('Jefes', `${nBoss}/${Object.keys(D.BOSSES).length}`, nBoss / Object.keys(D.BOSSES).length)),
        h('span', { class: 'grow' }),
        keys([['↑ ↓', 'Navegar'], ['← →', 'Panel'], ['Enter', 'Aceptar'], ['Esc', 'Menú principal']])),
    );
    // left/right hops between the menu column and the machine panel
    let side = 0, leftI = 0;
    this._setNav(items, Math.max(0, items.findIndex((b) => b.dataset.key === this._lhHubKey)));
    if (this._lhHubKey === 'mastery') { side = 1; this._lhSwapNav(right, 0); }
    this.onLeftRight = (d) => {
      if (d > 0 && side === 0) { leftI = this.navI; side = 1; this._lhSwapNav(right, 0); Audio.hover(); }
      else if (d < 0 && side === 1) { side = 0; this._lhSwapNav(items, leftI); Audio.hover(); }
    };
    this.onBack = () => { this._lhHubKey = null; this.mainMenu(); };
    Audio.playMusic('menu');
  },

  // ---------------------------------------------------------------- starter
  rpgStarter() {
    const g = this.game;
    g.garage.setMode('garage');
    const s = this._screen('lh lh-starter');
    const ids = D.STARTERS.filter((id) => BIKE_BY_ID[id]);
    let idx = 0;
    const panel = h('div', { class: 'lh-side glass' });
    const cards = ids.map((id, i) => {
      const b = BIKE_BY_ID[id];
      const c = h('div', { class: 'lh-opt' },
        h('div', { class: 'no' }, String(i + 1).padStart(2, '0')),
        h('div', { class: 'nm' }, b.name),
        h('div', { class: 'cl' }, b.klass),
        h('div', { class: 'sp' }, `${b.engine.hp} CV · ${b.mass} kg · ${b.topKmh} km/h`));
      c.addEventListener('click', () => { Audio.select(); pick(i); });
      return c;
    });
    const pick = (i) => {
      idx = (i + ids.length) % ids.length;
      const b = BIKE_BY_ID[ids[idx]];
      cards.forEach((c, k) => c.classList.toggle('on', k === idx));
      g.garage.setBike(b, 0);
      put(clear(panel),
        h('div', { class: 'kicker' }, `Opción ${idx + 1} de ${ids.length} · ${b.klass}`),
        h('div', { class: 'lh-mname' }, b.name),
        h('div', { class: 'lh-blurb' }, b.blurb),
        bikeFacts(b),
        head('Atributos'),
        ratingRows(b.id, true));
    };
    const choose = this.btn('Elegir esta moto', ICO.play, () => {
      if (!Rpg.chooseStarter(ids[idx])) return;
      Audio.fanfare();
      this._lhWelcome();
    }, 'primary');
    const back = this.btn('Volver', ICO.back, () => this.mainMenu(), 'small');
    const arrow = (d, txt) => { const a = h('div', { class: 'arrow-btn lh-arrow ' + (d < 0 ? 'l' : 'r') }, txt); a.addEventListener('click', () => { Audio.select(); pick(idx + d); }); return a; };
    put(s,
      h('div', { class: 'lh-scrim' }),
      rpgTopBar('Tu primera moto', 'Elige la máquina con la que empezará tu leyenda'),
      h('div', { class: 'lh-intro' },
        h('div', { class: 'kicker acc' }, 'Primera elección'),
        h('div', { class: 't' }, 'Cada leyenda empieza con una sola máquina'),
        h('div', { class: 'p' }, 'Elige tu primera moto. Las demás se ganan derrotando a los jefes de cada región o se compran en el concesionario.')),
      h('div', { class: 'lh-opts' }, ...cards),
      arrow(-1, '‹'), arrow(1, '›'),
      panel,
      h('div', { class: 'bottom-bar' }, keys([['← →', 'Cambiar de moto']]), h('span', { class: 'grow' }), back, choose));
    pick(idx);
    this._setNav([choose, back]);
    this.onLeftRight = (d) => { Audio.select(); pick(idx + d); };
    this.onBack = () => this.mainMenu();
  },

  _lhWelcome() {
    const done = () => { this.closeModal(); this.rpgHub(); };
    const ok = this.btn('Empezar', ICO.play, done, 'primary');
    const lines = [
      [RICON.map, 'Corre pruebas en siete regiones, cada una con su jefe.'],
      [ICO.xp, 'Gana experiencia, créditos y piezas en cada prueba.'],
      [RICON.gear, 'Mejora tu moto con piezas, maestría, talentos y la forja.'],
      [RICON.boss, 'Derrota a los jefes para ganar sus motos.'],
    ];
    const box = h('div', { class: 'modal glass lh-welcome' },
      h('div', { class: 'kicker acc' }, 'Bienvenido'),
      h('h2', {}, 'Modo Leyenda'),
      h('div', { class: 'lh-wl' }, ...lines.map(([ic, t], i) => h('div', {}, h('span', { class: 'n' }, String(i + 1)), icon(ic), h('span', {}, t)))),
      h('div', { class: 'lh-wbike' }, 'Tu moto: ', h('b', {}, Rpg.activeSpec().name)),
      h('div', { class: 'btns' }, ok));
    this.onLeftRight = null;
    this._modal(box, done);
    this._setNav([ok]);
  },

  // ---------------------------------------------------------------- map
  rpgMap(focusId = null) {
    if (!Rpg.started) { this.rpgStarter(); return; }
    const g = this.game;
    g.garage.setMode('menu');
    const s = this._screen('lh lh-map');
    const regs = Rpg.regions();
    const next = Rpg.nextEvent();
    const at = focusId ? D.EVENT_BY_ID[focusId] : null;
    let ri = at ? at.regionIndex : this._lhMap ? this._lhMap.ri : next.regionIndex;
    let ei = at ? at.index : this._lhMap ? this._lhMap.ei : next.regionIndex === ri ? next.index : 0;
    const back = this.btn('Volver', ICO.back, () => this.rpgHub(), 'small');
    const open = this.btn('Ver prueba', ICO.play, () => this.rpgEvent(regs[ri].events[ei].id), 'primary');

    // the route: one tile per region, joined by a progress line
    const tiles = regs.map((r, i) => {
      const boss = D.BOSSES[r.boss];
      const t = h('div', { class: 'lh-reg' + (r.unlocked ? '' : ' lock') + (r.done ? ' done' : '') + (r.final ? ' final' : '') },
        trackThumb(TRACK_BY_ID[r.track], 150, 100, true),
        h('div', { class: 'top' }, h('span', { class: 'no' }, String(i + 1).padStart(2, '0')),
          r.unlocked ? h('span', { class: 'st' }, icon(RICON.star), `${r.stars}/${r.maxStars}`) : icon(RICON.lock, 'lk')),
        h('div', { class: 'nm' }, r.name),
        h('div', { class: 'lv' }, `Nivel ${r.levels[0]}–${r.levels[1]}`),
        h('div', { class: 'bs' }, r.done ? h('span', { class: 'ok' }, icon(RICON.check), 'Jefe derrotado') : h('span', {}, icon(RICON.boss), boss.name)));
      t.addEventListener('click', () => { Audio.select(); pickRegion(i); });
      return t;
    });
    const line = h('div', { class: 'lh-rline' }, ...regs.map((r, i) => h('i', { class: r.done ? 'done' : i === next.regionIndex ? 'cur' : r.unlocked ? 'open' : '' })));
    const detail = h('div', { class: 'lh-rdet glass' });
    const path = h('div', { class: 'lh-path glass' });
    let nodes = [];

    const pickRegion = (i, evI = null) => {
      ri = (i + regs.length) % regs.length;
      const r = regs[ri], boss = D.BOSSES[r.boss], bb = BIKE_BY_ID[boss.bike];
      tiles.forEach((t, k) => t.classList.toggle('on', k === ri));
      const prevBoss = ri > 0 ? D.BOSSES[regs[ri - 1].boss] : null;
      const passed = r.events.filter((e) => e.state.passed).length;
      const tracks = [...new Set(r.events.map((e) => e.track))];
      const th = trackThumb(TRACK_BY_ID[r.track], 220, 150);
      put(clear(detail),
        h('div', { class: 'kicker' }, `Región ${ri + 1} de ${regs.length} · Nivel ${r.levels[0]}–${r.levels[1]}`),
        h('div', { class: 'lh-rname' }, r.name),
        h('div', { class: 'lh-rsub' }, r.sub),
        h('div', { class: 'lh-rmid' },
          h('div', { class: 'lh-rthumb' }, th, h('span', {}, tracks.length > 1 ? `${tracks.length} circuitos` : tc(TRACK_BY_ID[r.track].name))),
          h('div', { class: 'lh-rstats' },
            h('div', {}, h('span', {}, 'Estrellas'), h('b', {}, `${r.stars}/${r.maxStars}`), bar(r.stars / r.maxStars)),
            h('div', {}, h('span', {}, 'Pruebas superadas'), h('b', {}, `${passed}/${r.events.length}`), bar(passed / r.events.length)),
            h('div', {}, h('span', {}, 'Poder recomendado'), h('b', {}, `${fmtN(D.recommendedPower(r.events[0].level))}–${fmtN(D.recommendedPower(r.events[4].level))}`)))),
        r.unlocked ? null : h('div', { class: 'lh-req' }, icon(RICON.lock), h('span', {}, `Derrota a ${prevBoss.name} para desbloquear`)),
        h('div', { class: 'lh-rboss' + (r.done ? ' done' : '') },
          icon(RICON.boss, 'cr'),
          h('div', { class: 'tt' }, h('div', { class: 'k' }, boss.title), h('div', { class: 'n' }, boss.name), h('div', { class: 'm' }, `${bb.name} · ${bb.klass}`),
            h('div', { class: 'stt' }, r.done ? h('span', { class: 'ok' }, icon(RICON.check), 'Derrotado') : r.unlocked ? h('span', {}, 'Recompensa: su moto') : h('span', { class: 'lk' }, icon(RICON.lock), 'Bloqueado')))));
      nodes = r.events.map((e, k) => {
        const state = e.state.passed ? 'done' : !e.unlocked ? 'lock' : e.id === next.id ? 'next' : 'open';
        const tag = { done: 'Superada', lock: 'Bloqueada', next: 'Siguiente', open: 'Disponible' }[state];
        const eb = e.boss ? D.BOSSES[e.boss] : null;
        const sub = eb ? `${eb.title} · ${BIKE_BY_ID[eb.bike].name}`
          : e.rival ? `${D.TYPE_NAME[e.type]} · contra ${BIKE_BY_ID[e.rival].name}` : `${D.TYPE_NAME[e.type]} · ${tc(TRACK_BY_ID[e.track].name)}`;
        const n = h('div', { class: `lh-ev ${state}` + (eb ? ' boss' : '') },
          h('div', { class: 'c' }, state === 'lock' ? icon(RICON.lock) : icon(TYPE_ICON[e.type])),
          h('div', { class: 'tt' }, h('div', { class: 'nm' }, e.name), h('div', { class: 'sb' }, sub)),
          h('div', { class: 'lv' }, h('span', {}, 'Nivel'), h('b', {}, String(e.level))),
          stars(e.state.stars),
          h('span', { class: 'tag' }, tag));
        n.addEventListener('click', () => { Audio.click(); ei = k; this._lhMap = { ri, ei }; this.rpgEvent(e.id); });
        return this._lhHover(n);
      });
      put(clear(path),
        h('div', { class: 'lh-path-h' }, h('span', {}, 'Pruebas'), h('i'), h('span', { class: 'n' }, `${passed}/${r.events.length}`)),
        ...nodes);
      ei = evI ?? (ri === next.regionIndex ? next.index : nodes.findIndex((_, k) => !r.events[k].state.passed && r.events[k].unlocked));
      if (ei < 0) ei = 0;
      this._lhSwapNav([...nodes, open, back], ei);
    };
    this._onFocus = (el) => {
      const k = nodes.indexOf(el);
      if (k >= 0) { ei = k; this._lhMap = { ri, ei }; }
      el.scrollIntoView({ block: 'nearest' });
    };
    put(s,
      h('div', { class: 'lh-scrim full' }),
      rpgTopBar('Mapa de regiones', `${Rpg.totalStars()} de ${regs.length * 15} estrellas · ${Object.keys(Rpg.s.bosses).length} de ${regs.length} jefes derrotados`),
      h('div', { class: 'lh-route' }, h('div', { class: 'lh-tiles' }, ...tiles), line),
      h('div', { class: 'lh-mapbody' }, detail, path),
      h('div', { class: 'bottom-bar' }, keys([['← →', 'Región'], ['↑ ↓', 'Prueba'], ['Enter', 'Abrir'], ['Esc', 'Volver']]), h('span', { class: 'grow' }), back, open));
    pickRegion(ri, ei);
    this.onLeftRight = (d) => { Audio.select(); pickRegion(ri + d); this._lhMap = { ri, ei }; };
    this.onBack = () => this.rpgHub();
  },

  // ---------------------------------------------------------------- event briefing
  rpgEvent(id, back = null) {
    const e = D.EVENT_BY_ID[id];
    if (!e || !Rpg.started) { this.rpgHub(); return; }
    const g = this.game;
    const goBack = back || (() => this.rpgMap());
    const reg = D.REGIONS[e.regionIndex];
    const st = Rpg.eventState(id), unlocked = Rpg.eventUnlocked(id);
    const tdef = TRACK_BY_ID[e.track];
    const time = e.time || tdef.time, weather = e.weather || tdef.weather;
    const boss = e.boss ? D.BOSSES[e.boss] : null;
    const beaten = boss ? !!Rpg.s.bosses[e.boss] : false;
    // the 3D studio shows the machine to beat (boss / duel rival), else yours
    g.garage.setMode('garage');
    if (boss) g.garage.setBike(BIKE_BY_ID[boss.bike], boss.livery);
    else if (e.rival) g.garage.setBike(BIKE_BY_ID[e.rival], 0);
    else g.garage.setBike(Rpg.activeSpec(), Rpg.bike().livery || 0);
    const s = this._screen('lh lh-event');

    // power check against the recommendation
    const rec = Rpg.recommended(id), pw = Rpg.power(), ratio = pw / rec;
    const pc = ratio >= 1 ? 'ok' : ratio >= 0.85 ? 'mid' : 'low';
    const verdict = { ok: 'Preparado', mid: 'Ajustado', low: 'Por debajo' }[pc];
    const rivals = TRIAL[e.type] ? 'Sin rivales' : e.rival ? `1 · ${BIKE_BY_ID[e.rival].short}` : String(e.rivals);

    // expected rewards
    const xp = D.rewardXp(e.level), cr = D.rewardCredits(e.level);
    const extra = Rpg.talentRank('leyenda') ? 1 : 0;
    const drops = TRIAL[e.type] ? [1, 2] : [1, 3];
    let lockText = '';
    if (!unlocked) {
      if (!Rpg.regionUnlocked(e.regionIndex)) lockText = `Derrota a ${D.BOSSES[D.REGIONS[e.regionIndex - 1].boss].name} para desbloquear la región.`;
      else lockText = `Supera «${reg.events[e.index - 1].name}» para desbloquear esta prueba.`;
    }
    const brief = h('div', { class: 'lh-brief glass' + (boss ? ' boss' : '') },
      h('div', { class: 'lh-btype' }, icon(TYPE_ICON[e.type]), h('span', {}, D.TYPE_NAME[e.type]), h('span', { class: 'lv' }, `Nivel ${e.level}`),
        st.passed ? badge('Superada', 'ok') : null),
      h('div', { class: 'lh-bname' }, e.name),
      h('div', { class: 'lh-bdesc' }, D.TYPE_DESC[e.type]),
      lockText ? h('div', { class: 'lh-req' }, icon(RICON.lock), h('span', {}, lockText)) : null,
      h('div', { class: 'lh-facts six' },
        fact('Circuito', tc(tdef.name)), fact('Hora', TIME_NAME[time] || time), fact('Clima', WEATHER_NAME[weather] || weather),
        fact('Vueltas', String(e.laps)), fact('Rivales', rivals), fact('Nivel de piezas', `${Math.max(1, e.level - 1)}–${e.level + 2}`)),
      head('Poder'),
      h('div', { class: 'lh-pcmp ' + pc },
        h('div', { class: 'v' }, h('span', {}, 'Recomendado'), h('b', {}, fmtN(rec))),
        h('div', { class: 'v me' }, h('span', {}, 'Tu moto'), h('b', {}, fmtN(pw))),
        h('div', { class: 'meter' }, h('i', { style: { width: pct(Math.min(1.25, ratio) / 1.25 * 100) } }), h('em', { style: { left: pct(100 / 1.25) } })),
        h('div', { class: 'vd' }, verdict)),
      head('Objetivos', stars(st.stars)),
      h('div', { class: 'lh-objs' }, ...e.obj.map((o, i) => {
        const has = !!(st.stars & (1 << i));
        return h('div', { class: 'lh-obj' + (has ? ' on' : '') }, icon(RICON.star, has ? 'on' : ''), h('span', {}, D.objectiveText(o)), i === 0 ? h('em', {}, 'Para superar') : null);
      })));

    // expected rewards card (bottom of the side column)
    const rewCard = h('div', { class: 'lh-rewcard glass' },
      head('Recompensas'),
      h('div', { class: 'lh-rew' },
        h('div', {}, icon(ICO.xp), h('span', {}, 'Experiencia'), h('b', {}, `${fmtN(xp * 0.3)} – ${fmtN(xp)}`)),
        h('div', {}, icon(RICON.credits), h('span', {}, 'Créditos'), h('b', {}, `${fmtN(cr * 0.3)} – ${fmtN(cr)}`)),
        h('div', {}, icon(ICO.part), h('span', {}, 'Piezas'), h('b', {}, `${drops[0] + extra} – ${drops[1] + extra}`)),
        st.passed ? null : h('div', { class: 'bonus' }, icon(RICON.star), h('span', {}, 'Primera vez superada'), h('b', {}, `+${fmtN(D.XP_BONUS.firstClear + e.level * D.XP_BONUS.perLevel)} XP`)),
        boss && !beaten ? h('div', { class: 'bonus' }, icon(RICON.boss), h('span', {}, 'Jefe derrotado'), h('b', {}, e.boss === 'mitico' ? 'Pieza mítica y su moto' : 'Pieza legendaria y su moto')) : null));

    // side column: track card, boss / rival / your machine, rewards
    const th = trackThumb(tdef, 360, 150);
    const side = [h('div', { class: 'lh-tcard glass' }, th,
      h('div', { class: 'pills' }, h('span', { class: 'pill' }, TIME_NAME[time] || time), h('span', { class: 'pill' }, WEATHER_NAME[weather] || weather)),
      h('div', { class: 'inf' }, h('div', { class: 'nm' }, tdef.name), h('div', { class: 'mt' }, `${(th.__len / 1000).toFixed(2).replace('.', ',')} km · ${tdef.place} · ${plural(e.laps, 'vuelta', 'vueltas')}`)))];
    if (boss) {
      const bb = BIKE_BY_ID[boss.bike];
      const adv = [['power', 'potencia'], ['top', 'punta'], ['grip', 'agarre']].filter(([k]) => boss.perf[k] > 1).map(([k, n]) => `+${Math.round((boss.perf[k] - 1) * 100)} % ${n}`).join(' · ');
      side.push(h('div', { class: 'lh-boss glass' + (beaten ? ' done' : '') },
        h('div', { class: 'k' }, icon(RICON.boss), boss.title),
        h('div', { class: 'n' }, boss.name),
        h('div', { class: 'm' }, h('b', {}, bb.name), h('em', {}, `${bb.klass} · ${bb.engine.hp} CV · ${bb.topKmh} km/h`)),
        h('div', { class: 'adv' }, `Ventaja del jefe: ${adv}`),
        h('div', { class: 'rw' }, beaten ? h('span', { class: 'ok' }, icon(RICON.check), 'Derrotado') : h('span', {}, icon(ICO.garage), 'Recompensa: su moto'))));
    } else if (e.rival) {
      const rb = BIKE_BY_ID[e.rival];
      side.push(h('div', { class: 'lh-rival glass' },
        h('div', { class: 'k' }, icon(TYPE_ICON.duelo), 'Rival del duelo'),
        h('div', { class: 'n' }, rb.name),
        h('div', { class: 'm' }, `${rb.klass} · ${rb.engine.hp} CV · ${rb.mass} kg · ${rb.topKmh} km/h`)));
    } else {
      const sp = Rpg.activeSpec(), mi = Rpg.masteryInfo();
      side.push(h('div', { class: 'lh-rival glass' },
        h('div', { class: 'k' }, icon(ICO.garage), 'Tu moto'),
        h('div', { class: 'n' }, sp.name),
        h('div', { class: 'm' }, `${sp.klass} · Maestría ${mi.level} · Poder ${fmtN(pw)}`)));
    }
    side.push(rewCard);

    const run = this.btn('Correr', ICO.play, () => { this._lhMap = { ri: e.regionIndex, ei: e.index }; g.startRpgEvent(id); }, 'primary');
    const gear = this.btn('Equipamiento', RICON.gear, () => this.rpgGear?.(), 'small');
    const bk = this.btn('Volver', ICO.back, goBack, 'small');
    if (!unlocked) run.disabled = true;
    put(s,
      h('div', { class: 'lh-scrim brief' }),
      rpgTopBar(reg.name, `Región ${e.regionIndex + 1} de ${D.REGIONS.length} · Prueba ${e.index + 1} de ${reg.events.length}`),
      brief,
      h('div', { class: 'lh-bside' }, ...side),
      h('div', { class: 'bottom-bar' }, keys([['↑ ↓', 'Navegar'], ['Enter', 'Aceptar'], ['Esc', 'Volver']]), h('span', { class: 'grow' }), bk, gear, run));
    this._setNav(unlocked ? [run, gear, bk] : [gear, bk]);
    this.onLeftRight = (d) => this._focus(this.navI - d);
    this.onBack = goBack;
  },

  // ---------------------------------------------------------------- contracts
  rpgContracts() {
    if (!Rpg.started) { this.rpgStarter(); return; }
    this.game.garage.setMode('menu');
    const s = this._screen('lh lh-contracts');
    const render = (focus = 0) => {
      const list = Rpg.contracts(), cost = Rpg.contractRerollCost();
      const nav = [];
      const cards = list.map((c) => {
        const r = c.reward;
        const btn = c.done
          ? this.btn('Cobrar', RICON.check, () => claim(c.i, sing(c.text)), 'primary')
          : this.btn(`Cambiar contrato · ${fmtN(cost)}`, ICO.retry, () => {
            if (Rpg.rerollContract(c.i)) { Audio.select(); render(nav.indexOf(btn)); } else Audio.warn();
          }, 'small');
        if (!c.done && Rpg.credits < cost) btn.disabled = true;
        else nav.push(btn);
        return h('div', { class: 'lh-con glass' + (c.done ? ' done' : '') },
          h('div', { class: 'kicker' }, `Contrato ${c.i + 1}`, c.done ? badge('Completado', 'ok') : null),
          h('div', { class: 'lh-con-t' }, sing(c.text)),
          h('div', { class: 'lh-con-p' }, h('span', {}, 'Progreso'), h('b', {}, `${fmtDec(c.prog)} / ${fmtN(c.n)}`)),
          bar(c.frac, c.done ? 'done' : ''),
          head('Recompensa'),
          h('div', { class: 'lh-con-r' },
            h('div', {}, icon(RICON.credits), h('b', {}, fmtN(r.credits)), h('span', {}, 'créditos')),
            h('div', {}, icon(ICO.xp), h('b', {}, fmtN(r.xp)), h('span', {}, 'XP')),
            h('div', { class: 'pz' }, icon(ICO.part), h('span', {}, 'Pieza'), rarityTag(r.minRar), h('span', {}, 'o superior'))),
          h('div', { class: 'lh-con-b' }, btn));
      });
      const back = this.btn('Volver', ICO.back, () => this.rpgHub(), 'small');
      nav.push(back);
      put(clear(s),
        h('div', { class: 'lh-scrim full' }),
        rpgTopBar('Contratos', 'Encargos de los patrocinadores. Avanzan con cada prueba, en cualquier región.'),
        h('div', { class: 'lh-cons' }, ...cards),
        h('div', { class: 'lh-con-note' }, `Cambiar un contrato sin completar cuesta ${fmtN(cost)} créditos.`),
        lifeStrip(),
        h('div', { class: 'bottom-bar' }, keys([['↑ ↓', 'Navegar'], ['Enter', 'Aceptar'], ['Esc', 'Volver']]), h('span', { class: 'grow' }), back));
      this._setNav(nav, Math.min(focus, nav.length - 1));
      this.onLeftRight = (d) => this._focus(this.navI + d);
      this.onBack = () => this.rpgHub();
    };
    const claim = (i, text) => {
      const r = Rpg.claim(i);
      if (!r) return;
      Audio.fanfare();
      const card = flipCard(r.item, { compare: Rpg.s.active });
      const close = () => { this.closeModal(); render(0); };
      const ok = this.btn('Aceptar', RICON.check, close, 'primary');
      const eq = this.btn('Ver equipamiento', RICON.gear, () => { this.closeModal(); this.rpgGear?.(); }, 'small');
      const box = h('div', { class: 'modal glass lh-claim' },
        h('div', { class: 'kicker acc' }, 'Contrato cobrado'),
        h('h2', {}, text),
        h('div', { class: 'lh-claim-r' },
          h('div', {}, icon(RICON.credits), h('b', {}, `+${fmtN(r.credits)}`), h('span', {}, 'créditos')),
          h('div', {}, icon(ICO.xp), h('b', {}, `+${fmtN(r.xp)}`), h('span', {}, 'XP'))),
        card,
        r.levelUps ? h('div', { class: 'lh-note up' }, `Nivel ${Rpg.level} alcanzado · +${plural(r.levelUps, 'punto', 'puntos')} de talento`) : null,
        h('div', { class: 'btns row' }, ok, this.rpgGear ? eq : null));
      this._modal(box, close);
      this._setNav(this.rpgGear ? [ok, eq] : [ok]);
      setTimeout(() => card.classList.add('open'), 350);
    };
    render(0);
  },

  // ---------------------------------------------------------------- dealership
  rpgShop() {
    if (!Rpg.started) { this.rpgStarter(); return; }
    const g = this.game;
    g.garage.setMode('garage');
    const s = this._screen('lh lh-shop');
    let idx = Math.max(0, BIKES.findIndex((b) => b.id === (this._lhShopBike || Rpg.s.active)));
    const bossOf = (id) => Object.values(D.BOSSES).find((b) => b.bike === id) || null;
    const list = h('div', { class: 'lh-shoplist glass' });
    const panel = h('div', { class: 'lh-side glass' });
    const top = h('div', { class: 'lh-topwrap' });
    let rows = [];
    const buildList = () => {
      rows = BIKES.map((b, i) => {
        const own = Rpg.owns(b.id), avail = Rpg.bikeAvailable(b.id), price = Rpg.bikePrice(b.id);
        const state = b.id === Rpg.s.active ? h('span', { class: 'act' }, 'Activa')
          : own ? h('span', { class: 'own' }, icon(RICON.check), 'Tuya')
            : !avail ? h('span', { class: 'lk' }, icon(RICON.lock), 'Jefe')
              : h('span', { class: 'pr' + (Rpg.credits < price ? ' no' : '') }, icon(RICON.credits), fmtN(price));
        const it = h('div', { class: 'lh-shopitem' + (own ? ' own' : '') + (!own && !avail ? ' lock' : '') },
          h('div', { class: 'sw', style: { background: b.liveries[0].base === '#0b0b0d' || b.liveries[0].base === '#111111' ? b.liveries[0].accent : b.liveries[0].base } }),
          h('div', { class: 'tt' }, h('div', { class: 't' }, b.name), h('div', { class: 'c' }, b.klass)),
          state);
        it.addEventListener('click', () => { Audio.select(); pick(i); });
        return it;
      });
      put(clear(list), ...rows);
    };
    const pick = (i, focus = 0) => {
      idx = (i + BIKES.length) % BIKES.length;
      const b = BIKES[idx];
      this._lhShopBike = b.id;
      const own = Rpg.owns(b.id), avail = Rpg.bikeAvailable(b.id), price = Rpg.bikePrice(b.id);
      const liv = own ? Rpg.bike(b.id).livery || 0 : 0;
      rows.forEach((r, k) => r.classList.toggle('on', k === idx));
      rows[idx].scrollIntoView({ block: 'nearest' });
      g.garage.setBike(b, liv);
      const nav = [];
      let action = null, status;
      if (own) {
        const active = b.id === Rpg.s.active;
        const mi = Rpg.masteryInfo(b.id);
        status = h('div', { class: 'lh-own' }, icon(RICON.check), h('span', {}, active ? 'Moto activa' : 'En propiedad'), h('em', {}, `Maestría ${mi.level} · Poder ${fmtN(Rpg.power(b.id))}`));
        if (!active) action = this.btn('Usar esta moto', ICO.play, () => { Rpg.setActive(b.id); Audio.select(); refresh(); this._lhToast(s, `${b.name} es ahora tu moto activa`); }, 'primary');
      } else if (!avail) {
        const bs = bossOf(b.id);
        const ri = D.REGIONS.findIndex((r) => D.BOSSES[r.boss] === bs);
        status = h('div', { class: 'lh-req' }, icon(RICON.lock), h('span', {}, `Bloqueada hasta derrotar a ${bs.name}`, ri >= 0 ? h('em', {}, `${bs.title} · Región ${ri + 1}`) : null));
      } else {
        const short = price - Rpg.credits;
        status = h('div', { class: 'lh-price' + (short > 0 ? ' no' : '') }, h('span', {}, 'Precio'), h('b', {}, icon(RICON.credits), fmtN(price)), short > 0 ? h('em', {}, `Te faltan ${fmtN(short)} créditos`) : null);
        action = this.btn(`Comprar · ${fmtN(price)}`, RICON.credits, () => {
          if (!Rpg.buyBike(b.id)) { Audio.warn(); return; }
          Audio.fanfare();
          refresh();
          this._lhToast(s, `Compra realizada: ${b.name}`);
        }, 'primary');
        if (short > 0) action.disabled = true;
      }
      if (action && !action.disabled) nav.push(action);
      let swatches = null;
      if (own) {
        swatches = h('div', { class: 'liveries lh-liv' }, ...b.liveries.map((L, k) => {
          const d = h('div', { class: 'livery' + (k === liv ? ' on' : ''), title: L.name }, h('i', { style: { background: `linear-gradient(135deg, ${L.base} 0 50%, ${L.second} 50% 80%, ${L.accent} 80%)` } }));
          d.addEventListener('click', () => { Audio.select(); Rpg.setLivery(b.id, k); pick(idx, nav.indexOf(d)); });
          nav.push(this._lhHover(d));
          return d;
        }));
      }
      put(clear(panel),
        h('div', { class: 'kicker' }, `${idx + 1} de ${BIKES.length} · ${b.klass}`),
        h('div', { class: 'lh-mname' }, b.name),
        h('div', { class: 'lh-blurb' }, b.blurb),
        h('div', { class: 'lh-spec' }, `${b.engine.label} · ${b.engine.hp} CV · ${b.mass} kg · ${b.topKmh} km/h`),
        head('Atributos', own ? null : h('span', { class: 'lh-legend' }, 'Con tus talentos')),
        ratingRows(b.id),
        status,
        own ? head(`Decoración · ${b.liveries[liv].name}`) : null,
        swatches,
        action ? h('div', { class: 'lh-act' }, action) : null);
      nav.push(back);
      this._lhSwapNav(nav, Math.min(focus, nav.length - 1));
    };
    const back = this.btn('Volver', ICO.back, () => this.rpgHub(), 'small');
    const arrow = (d, txt) => { const a = h('div', { class: 'arrow-btn lh-arrow ' + (d < 0 ? 'l' : 'r') }, txt); a.addEventListener('click', () => { Audio.select(); pick(idx + d); }); return a; };
    // wallet, power and list states change after a purchase or a switch
    const refresh = () => { put(clear(top), rpgTopBar('Concesionario', `${Rpg.s.owned.length} de ${BIKES.length} motos en tu garaje`)); buildList(); pick(idx); };
    put(s,
      h('div', { class: 'lh-scrim' }),
      top, list, arrow(-1, '‹'), arrow(1, '›'), panel,
      h('div', { class: 'bottom-bar' }, keys([['← →', 'Moto'], ['↑ ↓', 'Navegar'], ['Esc', 'Volver']]), h('span', { class: 'grow' }), back));
    refresh();
    this.onLeftRight = (d) => { Audio.select(); pick(idx + d); };
    this.onBack = () => this.rpgHub();
  },

  // ---------------------------------------------------------------- rewards
  // Post-event sequence. The first Enter (or a click on the panels) completes every
  // animation; after that Enter activates the focused button.
  rpgRewards(race, results, rw) {
    this.game._lastRewards = rw;
    const again = !!rw._shown;   // back from the replay: show the final state at once
    rw._shown = true;
    const s = this._screen('lh lh-rw');
    const e = rw.event, reg = D.REGIONS[e.regionIndex];
    const me = (results || []).find((r) => r.player) || null;
    const rep = (race && (race.rpgReport || race.report)) || null;
    const elim = !!(me && (me.eliminated || me.out)) || (e.type === 'eliminacion' && !rw.passed);
    let big, bigCls = '';
    if (e.type === 'contrarreloj') { big = me && me.best ? formatTime(me.best * 1000) : '—'; bigCls = 'time'; }
    else if (e.type === 'derrape') { big = rep && rep.driftS != null ? `${fmtDec(rep.driftS)} s` : `${Rpg.starCount(rw.stars.after & 7)}/3`; bigCls = 'time'; }
    else if (elim) { big = 'Eliminado'; bigCls = 'word'; }
    else if (me) { big = `${me.pos}º`; bigCls = me.pos <= 3 ? `p${me.pos}` : ''; }
    else big = '—';

    const fin = new Set();
    const steps = [];
    const step = (fn) => steps.push(fn);
    const live = () => this.current === s;

    // header
    const hstars = [0, 1, 2].map((i) => icon(RICON.star, rw.stars.before & (1 << i) ? 'on' : ''));
    const header = h('div', { class: 'lh-rw-head' },
      h('div', { class: 'lh-rw-big ' + bigCls }, big, me && !elim && !TRIAL[e.type] && results ? h('small', {}, `de ${results.length}`) : null),
      h('div', { class: 'lh-rw-ht' },
        h('div', { class: 'kicker' }, `Modo Leyenda · ${reg.name} · ${D.TYPE_NAME[e.type]} · Nivel ${e.level}`),
        h('div', { class: 'nm' }, e.name),
        h('div', { class: 'lh-rw-verdict ' + (rw.passed ? 'ok' : 'ko') }, h('b', {}, rw.passed ? 'Superada' : 'No superada'),
          rw.firstClear ? badge('Primera vez') : null, rw.bossWin ? badge('Jefe derrotado', 'boss') : null)),
      h('span', { class: 'grow' }),
      h('div', { class: 'lh-rw-stars' }, ...hstars));

    // column A: objectives + experience
    const objRows = rw.objectives.map((o) => h('div', { class: 'lh-rw-obj lh-a' + (o.ok ? ' ok' : o.had ? ' had' : '') },
      icon(RICON.star, 'st'),
      h('span', { class: 't' }, o.text),
      o.ok && !o.had ? h('em', { class: 'new' }, 'Nueva') : o.ok ? h('em', {}, 'Conseguida') : o.had ? h('em', {}, 'Ya conseguida') : h('em', { class: 'no' }, 'No conseguida')));
    const xpRows = rw.xpLines.map((l, i) => {
      const v = h('b', {}, '+0');
      const label = i === 0 && rw.passed ? 'Prueba superada' : comma(l.label);
      return { row: h('div', { class: 'lh-rw-xl lh-a' }, h('span', {}, label), v), v, xp: l.xp };
    });
    const xpTot = h('b', {}, '0');
    const xpTotRow = h('div', { class: 'lh-rw-xt lh-a' }, h('span', {}, 'Experiencia total'), xpTot);
    const colA = h('div', { class: 'lh-rw-col glass' },
      head('Objetivos'), h('div', { class: 'lh-rw-objs' }, ...objRows),
      head('Experiencia'), h('div', { class: 'lh-rw-xls' }, ...xpRows.map((x) => x.row), xpTotRow));

    // column B: level, mastery, credits, unlocks, contracts
    const mkProg = (label, sub, cls) => {
      const lab = h('span', { class: 'l' }, label);
      const val = h('span', { class: 'v' }, '');
      const b = bar(0, cls, 0);
      const ban = h('div', { class: 'lh-rw-bans' });
      const el = h('div', { class: 'lh-rw-prog ' + cls }, h('div', { class: 'k' }, h('span', { class: 'sub' }, sub), lab, h('span', { class: 'grow' }), val), b, ban);
      b.querySelectorAll('i').forEach((i) => { i.style.transition = 'none'; });
      return { el, lab, val, ban, fill: b.querySelector('.fill'), ghost: b.querySelector('.ghost') };
    };
    const lvl = mkProg(`Nivel ${rw.levelBefore}`, 'Perfil', 'xp');
    const mast = mkProg(`Maestría ${rw.mastery.before}`, BIKE_BY_ID[rw.mastery.bike]?.short || '', 'mastery');
    const crV = h('b', {}, '+0');
    const crRow = h('div', { class: 'lh-rw-cr lh-a' }, icon(RICON.credits), h('span', {}, 'Créditos'), crV,
      rw.salvaged.n ? h('em', {}, `Inventario lleno: ${plural(rw.salvaged.n, 'pieza desguazada', 'piezas desguazadas')} automáticamente (+${fmtN(rw.salvaged.frags)} fragmentos · +${fmtN(rw.salvaged.credits)} créditos). Libera espacio en Equipamiento.`) : null);
    const conRows = rw.contracts.map((c) => {
      const b = bar(c.from / c.n, c.done ? 'done' : '');
      const f = b.querySelector('.fill');
      f.style.transition = 'none';
      const v = h('b', {}, `${fmtDec(c.from)} / ${fmtN(c.n)}`);
      return { c, f, v, row: h('div', { class: 'lh-rw-con lh-a' + (c.done ? ' done' : '') }, h('div', { class: 'k' }, h('span', {}, sing(c.text)), v), b, c.done ? h('em', {}, 'Completado · cóbralo en Contratos') : null) };
    });

    // column C: boss bike and loot
    const cards = rw.items.map((it) => flipCard(it, { compare: Rpg.s.active }));
    const won = rw.bikeWon ? BIKE_BY_ID[rw.bikeWon] : null;
    const wonEl = won ? h('div', { class: 'lh-rw-won lh-a' }, icon(RICON.boss), h('div', {}, h('span', {}, 'La moto del jefe es tuya'), h('b', {}, won.name))) : null;
    const unl = [];
    if (rw.regionUnlocked) unl.push(h('div', { class: 'lh-rw-unl lh-a reg' }, icon(ICO.unlock), h('span', {}, 'Nueva región'), h('b', {}, rw.regionUnlocked.name)));
    for (const ue of rw.unlockedEvents) unl.push(h('div', { class: 'lh-rw-unl lh-a' }, icon(ICO.unlock), h('span', {}, 'Nueva prueba'), h('b', {}, ue.name)));
    const loot = h('div', { class: 'lh-rw-loot' + (cards.length > 2 ? ' many' : '') }, ...cards);
    const colC = h('div', { class: 'lh-rw-col glass wide' },
      head('Piezas', h('span', { class: 'n' }, cards.length ? plural(cards.length, 'pieza', 'piezas') : '')),
      wonEl,
      cards.length ? loot : h('div', { class: 'lh-none' }, 'Sin piezas: termina la prueba para conseguir botín.'));

    // these headings appear together with their first line
    const unlHead = unl.length ? head('Desbloqueado') : null;
    const conHead = conRows.length ? head('Contratos') : null;
    for (const hd of [unlHead, conHead]) if (hd) hd.classList.add('lh-a');
    const colB = h('div', { class: 'lh-rw-col glass' },
      head('Progreso'), lvl.el, mast.el, crRow,
      unlHead, ...unl,
      conHead, ...conRows.map((x) => x.row));
    const body = h('div', { class: 'lh-rw-body' }, colA, colB, colC);

    // buttons + skip hint
    const btns = [
      this.btn('Continuar', ICO.play, () => this.game.exitRace(), 'primary'),
      this.btn('Repetir prueba', ICO.retry, () => this.game.restartRace()),
      this.btn('Equipar piezas', RICON.gear, () => { this.game.exitRace(); this.rpgGear?.(); }),
      this.btn('Ver repetición', ICO.replay, () => this.game.watchReplay()),
    ];
    const skipEl = h('div', { class: 'lh-skip' }, h('span', { class: 'keycap' }, 'Enter'), h('em', {}, 'Saltar'));
    put(s, h('div', { class: 'lh-scrim rw' }), header, body, h('div', { class: 'bottom-bar lh-rw-bar' }, skipEl, h('span', { class: 'grow' }), ...btns));

    // ---- the sequence (each step: instant? -> ms to wait before the next)
    const show = (el) => el && el.classList.add('in');
    const count = (el, to, ms, pre = '+') => tween(fin, ms, (k) => { el.textContent = pre + fmtN(to * k); });
    step(() => 350);
    rw.objectives.forEach((o, i) => step((inst) => {
      show(objRows[i]);
      const got = o.ok || o.had;
      if (got) { hstars[i].classList.add('on'); if (o.ok && !o.had) hstars[i].classList.add('pop'); }
      if (!inst && o.ok) Audio.select();
      return o.ok ? 330 : 220;
    }));
    let xpSum = 0;
    xpRows.forEach((x) => step((inst) => {
      show(x.row);
      xpSum += x.xp;
      if (inst) { x.v.textContent = `+${fmtN(x.xp)}`; return 0; }
      count(x.v, x.xp, 240);
      return 170;
    }));
    step((inst) => {
      show(xpTotRow);
      if (inst) { xpTot.textContent = fmtN(rw.xp); return 0; }
      count(xpTot, rw.xp, 450, '');
      return 500;
    });
    // a bar that fills across level-ups: one segment per level, a banner per level-up
    const segments = (L0, x0, ups, x1, need, max) => {
      let L = L0, from = max(L) ? 1 : x0 / need(L);
      const segs = [];
      for (let k = 0; k < ups; k++) { segs.push({ L, from, to: 1, up: true }); L++; from = 0; }
      segs.push({ L, from, to: max(L) ? 1 : x1 / need(L), up: false });
      return segs;
    };
    const runBar = (P, segs, label, unit, need, max, banner) => {
      segs.forEach((g, gi) => {
        step((inst) => {
          if (gi === 0) show(P.el);
          P.lab.textContent = label(g.L);
          P.fill.style.width = pct(g.from * 100);
          const val = (k) => { const f = g.from + (g.to - g.from) * k; P.ghost.style.width = pct(f * 100); P.val.textContent = max(g.L) ? 'Máx.' : `${fmtN(f * need(g.L))} / ${fmtN(need(g.L))} ${unit}`; };
          if (inst) { val(1); return 0; }
          const ms = Math.max(220, 750 * (g.to - g.from));
          tween(fin, ms, val);
          return ms + 100;
        });
        if (g.up) step((inst) => {
          P.ban.appendChild(banner(g.L + 1));
          P.fill.style.width = '0%'; P.ghost.style.width = '0%';
          P.lab.textContent = label(g.L + 1);
          if (!inst) Audio.fanfare();
          return 650;
        });
      });
    };
    const maxL = (L) => L >= D.LEVEL_MAX, maxM = (m) => m >= D.MASTERY_MAX;
    runBar(lvl, segments(rw.levelBefore, rw.xpBefore, rw.levelUps, rw.xpAfter, D.xpToNext, maxL), (L) => `Nivel ${L}`, 'XP', D.xpToNext, maxL,
      (L) => h('div', { class: 'lh-ban lh-a in' }, h('b', {}, `Nivel ${L}`), h('span', {}, '+1 punto de talento')));
    const M = rw.mastery;
    runBar(mast, segments(M.before, M.mxpBefore, M.ups, M.mxpAfter, D.masteryToNext, maxM), (m) => `Maestría ${m}`, 'XP', D.masteryToNext, maxM,
      (m) => h('div', { class: 'lh-ban lh-a in m' }, h('b', {}, `Maestría ${m}`), h('span', {}, `+${D.MASTERY_POINTS_PER_LEVEL} puntos`)));
    step((inst) => {
      show(crRow);
      if (inst) { crV.textContent = `+${fmtN(rw.credits)}`; return 0; }
      count(crV, rw.credits, 500);
      Audio.click();
      return 550;
    });
    if (wonEl) step((inst) => { show(wonEl); if (!inst) Audio.fanfare(); return 800; });
    cards.forEach((c, i) => step((inst) => {
      if (inst) c.classList.add('inst');
      c.classList.add('open');
      if (!inst) {
        c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        if (rw.items[i].rar >= 3) Audio.fanfare(); else Audio.select();
      }
      return rw.items[i].rar >= 3 ? 950 : 550;
    }));
    unl.forEach((u) => step((inst) => { show(unlHead); show(u); if (!inst) Audio.lap(); return 380; }));
    conRows.forEach((x) => step((inst) => {
      show(conHead);
      show(x.row);
      const val = (k) => { const v = x.c.from + (x.c.to - x.c.from) * k; x.f.style.width = pct(v / x.c.n * 100); x.v.textContent = `${fmtDec(v)} / ${fmtN(x.c.n)}`; };
      if (inst) { val(1); return 0; }
      tween(fin, 600, val);
      return 420;
    }));

    let si = 0, timer = 0, ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      skipEl.classList.add('gone');
      body.classList.add('done');
      if (!live()) return;
      for (const el of this.nav) el.classList.remove('focus');
      this._setNav(btns, 0);
      this.onLeftRight = (d) => this._focus(this.navI + d);
      this.onBack = () => this.game.exitRace();
    };
    const runNext = () => {
      timer = 0;
      if (!live()) return;
      // a tween still running (rAF paused in a hidden tab) must land before the next step
      for (const f of [...fin]) f();
      if (si >= steps.length) { end(); return; }
      const ms = steps[si++](false);
      timer = setTimeout(runNext, ms);
    };
    const skip = () => {
      if (ended) return;
      clearTimeout(timer);
      for (const f of [...fin]) f();
      fin.clear();
      while (si < steps.length) steps[si++](true);
      end();
    };
    skipEl.addEventListener('click', skip);
    body.addEventListener('click', () => { if (!ended) skip(); });
    this._setNav([skipEl]);
    this.onBack = skip;
    if (again) skip(); else runNext();
  },
};
