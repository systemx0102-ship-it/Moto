// Modo Leyenda — equipment and inventory, mastery points, talent tree and forge. The
// methods become UI methods (this = the UI instance). Styles: src/rpg/gear.css, every
// class prefixed lg- (section heads, key hints, toasts and scrims come from hub.css).
import { h, clear } from '../../ui/dom.js';
import { BIKE_BY_ID } from '../../bikes/catalog.js';
import { Audio } from '../../core/Audio.js';
import { Rpg } from '../Rpg.js';
import * as D from '../data.js';
import { SLOT_ICON, RICON, fmtN, fmtPct, icon, bar, rpgTopBar, rarityTag, statLine, itemCard } from './common.js';

const SVG = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICO = {
  back: SVG('<path d="M15 5l-7 7 7 7"/>'),
  equip: SVG('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 20h14"/>'),
  remove: SVG('<path d="M12 21V9M7 14l5-5 5 5"/><path d="M5 4h14"/>'),
  unlock: SVG('<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
  salvage: SVG('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>'),
  sweep: SVG('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M9 13l2 2 4-4"/>'),
  list: SVG('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h1M4 12h1M4 18h1"/>'),
  swap: SVG('<path d="M4 8h14l-3-3M20 16H6l3 3"/>'),
  reset: SVG('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>'),
  up: SVG('<path d="M12 20V5M6 11l6-6 6 6"/>'),
  dice: SVG('<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="12" cy="12" r="1"/>'),
  play: SVG('<path d="M8 5l11 7-11 7z"/>'),
};
const SORTS = [['power', 'Poder'], ['rar', 'Rareza'], ['ilvl', 'Nivel'], ['new', 'Nuevas']];
const SECONDARY = D.STAT_KEYS.filter((k) => !D.CORE_STATS.includes(k));
// shorter labels where the full stat name does not fit a two-column grid
const LABEL = { rec: 'Recarga', vel: 'Velocidad' };
const SRC_COLOR = { gear: '#f3f4f6', mastery: '#8fd8ff', talents: '#f0c050' };

const put = (el, ...kids) => { el.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false)); return el; };
const head = (title, extra = null) => h('div', { class: 'lh-h' }, h('span', {}, title), h('i'), extra);
const keys = (list) => h('div', { class: 'lh-keys' }, ...list.map(([k, t]) => h('span', {}, ...k.split(' ').map((x) => h('span', { class: 'keycap' }, x)), h('em', {}, t))));
const plural = (n, one, many) => `${fmtN(n)} ${n === 1 ? one : many}`;
const pct = (v) => `${Math.max(0, Math.min(100, v))}%`;
const dec = (v) => (Math.round(v * 10) / 10).toFixed(1);
const shortName = (id) => BIKE_BY_ID[id]?.short || String(id).toUpperCase();
const cost = (c) => h('span', { class: 'lg-cost' },
  c.credits ? h('span', { class: 'cr' + (Rpg.credits < c.credits ? ' no' : '') }, icon(RICON.credits), fmtN(c.credits)) : null,
  c.frags ? h('span', { class: 'fr' + (Rpg.frags < c.frags ? ' no' : '') }, icon(RICON.frags), fmtN(c.frags)) : null);
const affordable = (c) => !!c && Rpg.credits >= (c.credits || 0) && Rpg.frags >= (c.frags || 0);

function sorter(key) {
  const pw = (it) => Rpg.itemPower(it);
  switch (key) {
    case 'rar': return (a, b) => b.rar - a.rar || pw(b) - pw(a);
    case 'ilvl': return (a, b) => b.ilvl - a.ilvl || b.rar - a.rar || pw(b) - pw(a);
    case 'new': return (a, b) => (b.fresh ? 1 : 0) - (a.fresh ? 1 : 0) || b.uid - a.uid;
    default: return (a, b) => pw(b) - pw(a) || b.rar - a.rar || b.uid - a.uid;
  }
}

// where a machine's stat total comes from: {gear, mastery, talents, parts:[{it, v}]}
function breakdown(id, k) {
  const st = Rpg.stats(id), b = Rpg.bike(id);
  const parts = [];
  for (const slot of D.SLOT_KEYS) {
    const it = b.gear[slot] ? Rpg.item(b.gear[slot]) : null;
    const v = it ? Rpg.itemStats(it)[k] : 0;
    if (v) parts.push({ it, v });
  }
  const talents = D.TALENTS.filter((t) => t.stats && t.stats[k] && Rpg.talentRank(t.id)).map((t) => ({ t, v: t.stats[k] * Rpg.talentRank(t.id) }));
  return { total: st.total[k], gear: st.gear[k], mastery: st.mastery[k], talents: st.talents[k], parts, talentList: talents, cap: D.STAT_CAP[k] };
}

// where a machine's unique power comes from (equipped parts and learned talents)
function perkSources(id, p) {
  const b = Rpg.bike(id), out = [];
  for (const slot of D.SLOT_KEYS) {
    const it = b.gear[slot] ? Rpg.item(b.gear[slot]) : null;
    if (it && it.perk === p) out.push({ kind: 'Pieza', name: Rpg.describe(it).name, rar: it.rar });
  }
  for (const t of D.TALENTS) if (t.perk === p && Rpg.talentRank(t.id)) out.push({ kind: 'Talento', name: t.name });
  return out;
}

// stacked bar: parts / mastery / talents share of a stat, scaled to its cap
function stackBar(bd) {
  const k = 100 / bd.cap;
  let x = 0;
  const seg = (v, cls) => { if (v <= 0 || x >= 100) return null; const w = Math.min(100 - x, v * k); const el = h('i', { class: cls, style: { left: pct(x), width: pct(w) } }); x += w; return el; };
  return h('div', { class: 'lg-stack' }, seg(bd.gear, 'g'), seg(bd.mastery, 'm'), seg(bd.talents, 't'));
}

export const gearScreens = {
  // ---------------------------------------------------------------- shared helpers
  // Arrow keys move to the nearest focusable in that direction, so grids, columns and the
  // talent tree navigate the way a pad expects. An element can override a direction with
  // el._lgTo = {left: () => el2, ...}. Parts scrolled out of a panel are skipped unless
  // the move stays inside that panel (which then scrolls).
  _lgMove(dx, dy) {
    const cur = this.nav[this.navI];
    if (!cur) return false;
    const dir = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
    const forced = cur._lgTo && cur._lgTo[dir] && cur._lgTo[dir]();
    if (forced && this.nav.includes(forced)) { this._focus(this.nav.indexOf(forced)); return true; }
    const a = cur.getBoundingClientRect();
    const hidden = (el, r) => {
      for (let sc = el.parentElement && el.parentElement.closest('.lg-scroll'); sc; sc = sc.parentElement && sc.parentElement.closest('.lg-scroll')) {
        if (sc.contains(cur)) continue;
        const b = sc.getBoundingClientRect();
        if (r.bottom < b.top + 6 || r.top > b.bottom - 6) return true;
      }
      return false;
    };
    let best = -1, bs = Infinity;
    this.nav.forEach((el, i) => {
      if (i === this.navI || el.disabled) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || hidden(el, r)) return;
      const cd = dx ? ((r.left + r.right) - (a.left + a.right)) / 2 * dx : ((r.top + r.bottom) - (a.top + a.bottom)) / 2 * dy;
      if (cd <= 2) return;
      const along = dx ? (dx > 0 ? r.left - a.right : a.left - r.right) : (dy > 0 ? r.top - a.bottom : a.top - r.bottom);
      const across = dx ? Math.max(0, Math.max(r.top, a.top) - Math.min(r.bottom, a.bottom)) : Math.max(0, Math.max(r.left, a.left) - Math.min(r.right, a.right));
      const off = dx ? Math.abs((r.top + r.bottom - a.top - a.bottom) / 2) : Math.abs((r.left + r.right - a.left - a.right) / 2);
      const score = Math.max(0, along) + across * 3 + off * 0.05;
      if (score < bs) { bs = score; best = i; }
    });
    if (best < 0) return false;
    this._focus(best);
    return true;
  },
  // arrows -> spatial moves; LB / RB (Q / E) -> `shoulder(±1)` when given
  _lgInput(shoulder = null) {
    this.onLeftRight = null;
    this.onInput = (e) => {
      if ((e.shiftUp || e.shiftDown) && shoulder) { shoulder(e.shiftUp ? 1 : -1); return true; }
      if (e.up || e.down) { this._lgMove(0, e.up ? -1 : 1); return true; }
      if (e.left || e.right) { this._lgMove(e.left ? -1 : 1, 0); return true; }
      return false;
    };
  },
  // replace the nav list keeping the focused element (or the one with key `want`)
  _lgRelink(list, want = null) {
    const cur = this.nav[this.navI];
    for (const x of this.nav) if (!list.includes(x)) x.classList.remove('focus');
    this.nav = list;
    let i = want ? list.findIndex((x) => x.dataset.k === want) : list.indexOf(cur);
    if (i < 0 && cur && cur.dataset.k) i = list.findIndex((x) => x.dataset.k === cur.dataset.k);
    this.navI = Math.max(0, i);
    list.forEach((x, k) => x.classList.toggle('focus', k === this.navI));
    return i >= 0;
  },
  // custom focusables follow the mouse like buttons do
  _lgHover(el) {
    el.addEventListener('mouseenter', () => { const i = this.nav.indexOf(el); if (i >= 0 && i !== this.navI) this._focus(i, false); });
    return el;
  },
  _lgToast(s, text, cls = '') {
    const t = h('div', { class: 'lh-toast lg-toast ' + cls }, text);
    s.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2400);
    setTimeout(() => t.remove(), 2900);
  },
  // modal with a primary action and Cancelar; arrows move between its buttons
  _lgConfirm({ kicker, title, body = null, ok, okIcon = null, onOk, cls = '', danger = false }) {
    const was = { nav: this.nav, i: this.navI };
    const close = () => { this.closeModal(); this.onLeftRight = null; if (this.nav === was.nav) this._focus(was.i, false); };
    const yes = this.btn(ok, okIcon, () => { this.closeModal(); this.onLeftRight = null; onOk(); }, 'primary' + (danger ? ' lg-danger' : ''));
    const no = this.btn('Cancelar', ICO.back, close, 'small');
    const box = h('div', { class: 'modal glass lg-modal ' + cls },
      h('div', { class: 'kicker acc' }, kicker), h('h2', {}, title), body,
      h('div', { class: 'lg-mbtns' }, no, yes));
    this._modal(box, close);
    this.onLeftRight = (d) => this._focus(this.navI + d);
    this._setNav([yes, no]);
    return box;
  },

  // ---------------------------------------------------------------- equipment
  // Equipment and inventory of one owned machine. Left: the eight slots; centre: the bike
  // with its technical sheet; right: the inventory and the selected part's detail.
  rpgGear(bikeId = null, focusUid = null) {
    if (!Rpg.started) { if (this.rpgHub) this.rpgHub(); else this.mainMenu(); return; }
    const g = this.game;
    let id = bikeId && Rpg.owns(bikeId) ? bikeId : Rpg.s.active;
    g.garage.setMode('garage');
    const s = this._screen('lh lg lg-gear');
    const V = this._lgInv || (this._lgInv = { filter: 'all', sort: 'power' });
    const goBack = () => { g.garage.frame = null; if (this.rpgHub) this.rpgHub(); else this.mainMenu(); };
    // sel: what the detail panel explains — {uid} part, {slot} slot, {stat}, {perk}
    let sel = focusUid != null && Rpg.item(focusUid) ? { uid: focusUid } : null;
    let origin = null;          // key of the slot / card the detail actions belong to
    let navL = [], navInv = [], navDet = [], navBot = [];
    let grid = null, det = null, subEl = null, chips = [];
    const cards = new Map();    // uid -> tile element

    const top = h('div', { class: 'lg-topwrap' });
    const wrap = h('div', { class: 'lg-wrap' });
    const bottom = h('div', { class: 'bottom-bar lg-bar' });
    put(s, h('div', { class: 'lh-scrim lg-scrim' }), top, wrap, bottom);

    // the studio camera puts the bike in the gap between the panels: measure the gap and
    // convert it to a camera shift (32° vertical field of view in landscape)
    const frame = () => {
      const lp = wrap.querySelector('.lg-colL'), inv = wrap.querySelector('.lg-inv'), sh = wrap.querySelector('.lg-sheet');
      if (!lp || !inv || !sh) return;
      const W = innerWidth, H = innerHeight, t = Math.tan(16 * Math.PI / 180);
      const wide = getComputedStyle(lp).display === 'contents';
      const a = (wide ? wrap.querySelector('.lg-lp') : lp).getBoundingClientRect(), b = inv.getBoundingClientRect(), c = sh.getBoundingClientRect();
      const gw = Math.max(120, b.left - a.right), gh = Math.max(120, (wide ? c.top : b.bottom) - a.top);
      const d = Math.min(11, Math.max(6, Math.max(2.3 * H / 2 / (t * gw), 1.6 * H / 2 / (t * gh))));
      const ppu = H / 2 / (t * d);
      g.garage.dist = d;
      g.garage.frame = { x: -((a.right + b.left) / 2 - W / 2) / ppu, y: ((a.top + (wide ? c.top : b.bottom)) / 2 - H / 2) / ppu };
    };
    const showBike = () => { const b = BIKE_BY_ID[id]; if (b) g.garage.setBike(b, Rpg.bike(id).livery || 0); };

    const list = () => {
      const all = Rpg.items().filter((it) => Rpg.equippedBy(it.uid) !== id);
      const shown = (V.filter === 'all' ? all : all.filter((it) => it.slot === V.filter)).sort(sorter(V.sort));
      return { all, shown };
    };

    // ---- left: machine header, slots, technical sheet
    const bikeHeader = () => {
      const spec = BIKE_BY_ID[id], mi = Rpg.masteryInfo(id), n = Rpg.s.owned.length, k = Rpg.s.owned.indexOf(id);
      const arrow = (d) => {
        const a = h('button', { class: 'lg-arr', title: d < 0 ? 'Moto anterior (Q)' : 'Moto siguiente (E)' }, d < 0 ? '‹' : '›');
        a.dataset.k = d < 0 ? 'bk:prev' : 'bk:next';
        a.addEventListener('click', () => { Audio.select(); switchBike(d); });
        return this._lgHover(a);
      };
      // the mastery block opens the attribute points screen
      const mBtn = h('button', { class: 'lg-ms' + (mi.free > 0 ? ' pts' : ''), title: 'Repartir los puntos de maestría' },
        h('div', { class: 'k' }, h('span', {}, `Maestría ${mi.level}`), h('span', {}, mi.max ? 'Máx.' : `${fmtN(mi.xp)} / ${fmtN(mi.need)}`)),
        bar(mi.frac, 'mastery'),
        h('div', { class: 's' }, mi.free > 0 ? `${plural(mi.free, 'punto', 'puntos')} por asignar` : `${mi.spent} de ${mi.points} puntos asignados`, h('i', {}, '›')));
      mBtn.dataset.k = 'bk:mastery';
      mBtn.addEventListener('click', () => { Audio.click(); g.garage.frame = null; this.rpgMastery(id, () => this.rpgGear(id)); });
      this._lgHover(mBtn);
      const act = id === Rpg.s.active;
      let useBtn = null;
      if (!act) {
        useBtn = h('button', { class: 'lg-use', title: 'Usar esta moto en las pruebas' }, 'Activar');
        useBtn.dataset.k = 'bk:use';
        useBtn.addEventListener('click', () => { Rpg.setActive(id); Audio.select(); this._lgToast(s, `${spec.name} es ahora tu moto activa`); render('bk:mastery'); });
        this._lgHover(useBtn);
      }
      const prev = n > 1 ? arrow(-1) : null, next = n > 1 ? arrow(1) : null;
      navL.push(...[prev, useBtn, next, mBtn].filter(Boolean));
      return h('div', { class: 'lg-bk' },
        h('div', { class: 'lg-bk-row' }, prev,
          h('div', { class: 'lg-bk-t' },
            h('div', { class: 'kicker' }, h('span', {}, n > 1 ? `Moto ${k + 1} de ${n} · ${spec.klass}` : spec.klass), act ? h('span', { class: 'lg-act' }, 'Activa') : useBtn),
            h('div', { class: 'lg-bk-n' }, spec.name)),
          next),
        h('div', { class: 'lg-bk-pw' },
          h('div', { class: 'lg-pw' }, h('div', { class: 'n' }, icon(RICON.power), h('b', {}, fmtN(Rpg.power(id)))), h('span', {}, 'Poder')),
          mBtn));
    };

    const slotRows = () => {
      const b = Rpg.bike(id);
      const filled = D.SLOT_KEYS.filter((k) => b.gear[k]).length;
      const rows = D.SLOT_KEYS.map((slot) => {
        const it = Rpg.equipped(id, slot);
        const d = it ? Rpg.describe(it) : null;
        const spare = Rpg.items().filter((x) => x.slot === slot && Rpg.equippedBy(x.uid) !== id);
        const better = it ? spare.some((x) => Rpg.itemPower(x) > Rpg.itemPower(it)) : spare.length > 0;
        const fresh = spare.some((x) => x.fresh);
        const row = h('div', { class: 'lg-slot ' + (it ? `r-${d.rarity.id}` : 'empty'), tabindex: '-1' },
          h('span', { class: 'ic', html: SLOT_ICON[slot] }),
          h('div', { class: 'tt' },
            h('div', { class: 'k' }, D.SLOTS[slot].name, fresh ? h('i', { class: 'nw', title: 'Piezas nuevas' }) : null),
            h('div', { class: 'n' }, it ? it.name : 'Hueco libre', it && it.plus ? h('em', {}, ` +${it.plus}`) : null)),
          h('div', { class: 'pw' },
            it ? h('b', {}, fmtN(d.power)) : h('b', { class: 'no' }, '—'),
            better ? h('span', { class: 'up', title: 'Hay una pieza con más poder en el inventario' }, icon(ICO.up)) : null,
            it && it.lock ? icon(RICON.lock, 'lk') : null));
        row.dataset.k = 'slot:' + slot;
        row._slot = slot;
        // Enter opens the detail actions of the slot; a click just selects it
        row.addEventListener('click', (ev) => {
          if (ev.detail === 0) { origin = row.dataset.k; const a = navDet.find((x) => !x.disabled); if (a) this._focus(this.nav.indexOf(a)); }
          else this._focus(this.nav.indexOf(row), false);
        });
        navL.push(row);
        return row;
      });
      return h('div', { class: 'lg-slots' }, head('Piezas montadas', h('span', { class: 'n' }, `${filled}/${D.SLOT_KEYS.length}`)), h('div', { class: 'lg-slot-l' }, ...rows));
    };

    const sheet = () => {
      const st = Rpg.stats(id);
      const block = (k, core) => {
        const bd = breakdown(id, k);
        const el = h('div', { class: 'lg-st' + (core ? ' core' : '') + (bd.total ? '' : ' zero'), tabindex: '-1', title: D.STATS[k].desc },
          h('span', { class: 'k' }, LABEL[k] || D.STATS[k].name),
          h('b', {}, bd.total ? fmtPct(bd.total) : '—'),
          core ? stackBar(bd) : null);
        el.dataset.k = 'stat:' + k;
        el.addEventListener('click', () => this._focus(this.nav.indexOf(el), false));
        navL.push(this._lgHover(el));
        return el;
      };
      const perks = st.perks.map((p) => {
        const el = h('div', { class: 'lg-perk', tabindex: '-1' }, h('b', {}, D.PERKS[p].name));
        el.dataset.k = 'perk:' + p;
        el.addEventListener('click', () => this._focus(this.nav.indexOf(el), false));
        navL.push(this._lgHover(el));
        return el;
      });
      return h('div', { class: 'lg-sheet glass' },
        head('Ficha técnica'),
        h('div', { class: 'lg-core' }, ...D.CORE_STATS.map((k) => block(k, true))),
        h('div', { class: 'lg-legend' }, h('i', { class: 'g' }), 'Piezas', h('i', { class: 'm' }), 'Maestría', h('i', { class: 't' }), 'Talentos'),
        h('div', { class: 'lg-sec' }, ...SECONDARY.map((k) => block(k, false))),
        perks.length ? h('div', { class: 'lg-perks' }, h('span', { class: 'lab' }, 'Poderes'), ...perks)
          : h('div', { class: 'lg-perks none' }, h('span', { class: 'lab' }, 'Poderes'), h('span', { class: 'lg-dim' }, 'Ninguno activo')));
    };

    // ---- right: inventory
    const inventory = () => {
      const { all, shown } = list();
      const total = Rpg.items().length;
      chips = [['all', 'Todas', null], ...D.SLOT_KEYS.map((k) => [k, D.SLOTS[k].name, SLOT_ICON[k]])].map(([k, name, ic]) => {
        const n = k === 'all' ? all.length : all.filter((it) => it.slot === k).length;
        const nw = (k === 'all' ? all : all.filter((it) => it.slot === k)).some((it) => it.fresh);
        const c = h('button', { class: 'lg-chip' + (V.filter === k ? ' on' : '') + (ic ? ' ic' : ''), title: `${name} · ${n}` },
          ic ? h('span', { class: 'i', html: ic }) : h('span', {}, name), nw ? h('i', { class: 'nw' }) : null);
        c.dataset.k = 'flt:' + k;
        c.addEventListener('click', () => { Audio.click(); V.filter = k; render(c.dataset.k); });
        navInv.push(this._lgHover(c));
        return c;
      });
      const sorts = SORTS.map(([k, name]) => {
        const t = h('button', { class: 'lg-sort' + (V.sort === k ? ' on' : '') }, name);
        t.dataset.k = 'sort:' + k;
        t.addEventListener('click', () => { Audio.click(); V.sort = k; render(t.dataset.k); });
        navInv.push(this._lgHover(t));
        return t;
      });
      grid = h('div', { class: 'lg-grid' });
      cards.clear();
      shown.forEach((it) => {
        const c = itemCard(it, { compact: true, compare: id });
        // tile: icon, level and flags on the first row, the name below on two lines
        const hd = c.querySelector('.rpg-card-head');
        hd.querySelector('.meta span:last-child').textContent = `Nv. ${it.ilvl}`;
        hd.insertBefore(c.querySelector('.rpg-card-flags'), hd.querySelector('.pw'));
        c.dataset.k = 'it:' + it.uid;
        c._uid = it.uid;
        c.addEventListener('click', (ev) => {
          if (ev.detail === 0) equip(it.uid);    // Enter on the focused tile
          else this._focus(this.nav.indexOf(c), false);
        });
        c.addEventListener('dblclick', () => equip(it.uid));
        cards.set(it.uid, c);
        grid.appendChild(c);
        navInv.push(c);
      });
      const fname = V.filter === 'all' ? 'piezas' : `piezas de ${D.SLOTS[V.filter].name.toLowerCase()}`;
      return h('div', { class: 'lg-inv glass' },
        h('div', { class: 'lg-inv-h' },
          h('div', { class: 'kicker' }, 'Inventario'),
          h('span', { class: 'lg-cap' + (total >= D.INV_MAX ? ' full' : total >= D.INV_MAX - 8 ? ' warn' : '') }, `${total} / ${D.INV_MAX}`)),
        h('div', { class: 'lg-chips' }, ...chips),
        h('div', { class: 'lg-sorts' }, h('span', { class: 'lab' }, 'Ordenar'), ...sorts),
        h('div', { class: 'lg-grid-w lg-scroll' }, shown.length ? grid
          : h('div', { class: 'lg-empty' }, all.length ? `No tienes ${fname} de recambio.` : 'Inventario vacío.', h('span', {}, 'Las pruebas del mapa, los jefes y los contratos dan piezas nuevas.'))));
    };

    // ---- right: detail of the selection
    const action = (label, ic, fn, cls = '', key = '') => {
      const b = this.btn(label, ic, fn, cls);
      b.dataset.k = 'act:' + key;
      // ← returns to the slot or part these actions belong to
      b._lgTo = { left: () => (origin ? this.nav.find((x) => x.dataset.k === origin) : null) };
      navDet.push(b);
      return b;
    };
    const partDetail = (it, fromSlot) => {
      const on = Rpg.equippedBy(it.uid);
      const mine = on === id;
      const cmp = Rpg.compare(it, id);
      const v = Rpg.salvageValue(it);
      const d = Rpg.describe(it);
      const card = itemCard(it, { compare: mine ? null : id });
      const lines = [];
      if (!mine) {
        const cur = cmp.current;
        lines.push(h('div', { class: 'lg-repl' + (cur ? ` r-${D.RARITY[cur.rar].id}` : '') },
          h('span', { class: 'k' }, cur ? 'Sustituye a' : 'Hueco libre'),
          cur ? h('b', {}, Rpg.describe(cur).name) : h('b', {}, `Sin ${D.SLOTS[it.slot].name.toLowerCase()} montado`)));
        const p0 = Rpg.power(id), p1 = p0 + cmp.power;
        lines.push(h('div', { class: 'lg-pchg' },
          h('span', { class: 'k' }, 'Poder de la moto'),
          h('b', {}, fmtN(p0)), h('span', { class: 'ar' }, '→'), h('b', { class: cmp.power > 0 ? 'up' : cmp.power < 0 ? 'down' : '' }, fmtN(p1)),
          cmp.power ? h('span', { class: 'd ' + (cmp.power > 0 ? 'up' : 'down') }, `${cmp.power > 0 ? '+' : '−'}${fmtN(Math.abs(cmp.power))}`) : null));
      }
      if (on && !mine) lines.push(h('div', { class: 'lg-note' }, `Montada en ${BIKE_BY_ID[on]?.name || on}. Al equiparla aquí se desmonta de esa moto.`));
      const acts = [];
      origin = fromSlot ? 'slot:' + it.slot : 'it:' + it.uid;
      if (fromSlot) acts.push(action(`Ver recambios`, ICO.list, () => browse(it.slot), 'primary wide', 'browse'));
      if (mine) acts.push(action('Quitar', ICO.remove, () => { Rpg.unequip(it.slot, id); Audio.click(); this._lgToast(s, `${d.slotName}: hueco libre`); sel = { slot: it.slot }; render('slot:' + it.slot); }, fromSlot ? 'small' : 'primary wide', 'remove'));
      else acts.push(action(on ? `Equipar · desmontar de ${shortName(on)}` : 'Equipar', ICO.equip, () => equip(it.uid), 'primary wide', 'equip'));
      acts.push(action(it.lock ? 'Desbloquear' : 'Bloquear', it.lock ? ICO.unlock : RICON.lock, () => { Rpg.lock(it.uid); Audio.click(); renderDetail('act:lock'); refreshTile(it.uid); }, 'small', 'lock'));
      const sv = action('Desguazar', ICO.salvage, () => salvage(it), 'small', 'salvage');
      if (!Rpg.canSalvage(it)) sv.disabled = true;
      acts.push(sv);
      acts.push(action('Forja', RICON.forge, () => this.rpgForge(it.uid, () => this.rpgGear(id, it.uid)), 'small', 'forge'));
      const why = on ? 'Montada: quítala para poder desguazarla.' : it.lock ? 'Bloqueada: desbloquéala para poder desguazarla.' : null;
      return {
        body: [h('div', { class: 'kicker' }, mine ? `Montada en ${shortName(id)}` : on ? `En inventario · montada en ${shortName(on)}` : 'En inventario'),
          card, ...lines,
          h('div', { class: 'lg-salv' }, h('span', { class: 'k' }, 'Desguace'), why ? h('span', { class: 'why' }, why) : h('span', {}, `+${fmtN(v.frags)} fragmentos · +${fmtN(v.credits)} créditos`))],
        acts,
      };
    };
    const slotDetail = (slot) => {
      const n = Rpg.items().filter((x) => x.slot === slot && Rpg.equippedBy(x.uid) !== id).length;
      origin = 'slot:' + slot;
      return {
        body: [h('div', { class: 'kicker' }, 'Hueco libre'),
          h('div', { class: 'lg-dt-n' }, h('span', { class: 'i', html: SLOT_ICON[slot] }), D.SLOTS[slot].name),
          h('div', { class: 'lg-dt-p' }, `No hay ninguna pieza montada en este hueco. Un hueco libre no aporta atributos ni poder.`),
          h('div', { class: 'lg-dt-p' }, n ? `${plural(n, 'pieza compatible', 'piezas compatibles')} en el inventario.` : 'No tienes piezas compatibles: consíguelas en las pruebas del mapa.')],
        acts: n ? [action('Ver recambios', ICO.list, () => browse(slot), 'primary wide', 'browse')] : [],
      };
    };
    const statDetail = (k) => {
      const bd = breakdown(id, k), core = D.CORE_STATS.includes(k);
      origin = 'stat:' + k;
      const row = (label, v, cls) => h('div', { class: 'lg-bd-r ' + cls }, h('i'), h('span', {}, label), h('b', {}, v ? fmtPct(v) : '—'));
      const rt = core ? Rpg.ratings(id)[k] : null;
      return {
        body: [h('div', { class: 'kicker' }, core ? 'Atributo principal' : 'Atributo secundario'),
          h('div', { class: 'lg-dt-n' }, D.STATS[k].name),
          h('div', { class: 'lg-dt-p' }, D.STATS[k].desc),
          h('div', { class: 'lg-dt-big' }, h('b', {}, bd.total ? fmtPct(bd.total) : '0 %'), h('span', {}, `Límite ${bd.cap} %`)),
          stackBar(bd),
          h('div', { class: 'lg-bd' }, row('Piezas', bd.gear, 'g'), row('Maestría', bd.mastery, 'm'), row('Talentos', bd.talents, 't')),
          bd.gear + bd.mastery + bd.talents > bd.cap ? h('div', { class: 'lg-note' }, `Se ha alcanzado el límite: lo que pasa de ${bd.cap} % no suma.`) : null,
          rt ? h('div', { class: 'lg-rt' }, h('span', { class: 'k' }, 'Valoración'), h('b', {}, String(rt.base)), h('span', { class: 'ar' }, '→'), h('b', { class: rt.total > rt.base ? 'up' : '' }, String(rt.total)), h('span', { class: 'lg-dim' }, 'sobre 100')) : null,
          bd.parts.length || bd.talentList.length ? head('Aportaciones') : null,
          ...bd.parts.map((p) => h('div', { class: `lg-src r-${D.RARITY[p.it.rar].id}` }, h('span', { class: 'i', html: SLOT_ICON[p.it.slot] }), h('span', { class: 'n' }, Rpg.describe(p.it).name), h('b', {}, fmtPct(p.v)))),
          ...bd.talentList.map((x) => h('div', { class: 'lg-src tal' }, h('span', { class: 'i', html: RICON.talents }), h('span', { class: 'n' }, `${x.t.name} · ${Rpg.talentRank(x.t.id)}/${x.t.max}`), h('b', {}, fmtPct(x.v))))],
        acts: [],
      };
    };
    const perkDetail = (p) => {
      origin = 'perk:' + p;
      const src = perkSources(id, p);
      return {
        body: [h('div', { class: 'kicker' }, 'Poder único'),
          h('div', { class: 'lg-dt-n' }, D.PERKS[p].name),
          h('div', { class: 'lg-dt-perk' }, D.PERKS[p].desc),
          head('Origen'),
          ...src.map((x) => h('div', { class: 'lg-src' + (x.rar != null ? ` r-${D.RARITY[x.rar].id}` : ' tal') }, h('span', { class: 'i', html: x.kind === 'Pieza' ? RICON.gear : RICON.talents }), h('span', { class: 'n' }, x.name), h('b', {}, x.kind)))],
        acts: [],
      };
    };
    const renderDetail = (want = null) => {
      navDet = [];
      let r;
      const it = sel && sel.uid != null ? Rpg.item(sel.uid) : null;
      if (it) r = partDetail(it, !!sel.fromSlot);
      else if (sel && sel.slot) r = slotDetail(sel.slot);
      else if (sel && sel.stat) r = statDetail(sel.stat);
      else if (sel && sel.perk) r = perkDetail(sel.perk);
      else r = { body: [h('div', { class: 'kicker' }, 'Detalle'), h('div', { class: 'lg-dt-p' }, 'Elige una pieza del inventario o un hueco de la moto.')], acts: [] };
      put(clear(det), h('div', { class: 'lg-det-b lg-scroll' }, ...r.body), r.acts.length ? h('div', { class: 'lg-det-a' }, ...r.acts) : null);
      this._lgRelink([...navL, ...navInv, ...navDet, ...navBot], want);
    };

    // ---- actions
    const refreshTile = (uid) => {
      const old = cards.get(uid), it = Rpg.item(uid);
      if (!old || !it) return;
      old.classList.toggle('fresh', !!it.fresh);
      const fl = old.querySelector('.rpg-card-flags');
      if (fl) {
        fl.querySelector('.nw')?.remove();
        const lk = fl.querySelector('.lk');
        if (it.lock && !lk) fl.prepend(icon(RICON.lock, 'lk'));
        if (!it.lock && lk) lk.remove();
      }
    };
    const markSeen = (uid) => {
      const it = Rpg.item(uid);
      if (!it || !it.fresh) return;
      Rpg.seen(uid);
      refreshTile(uid);
      const { all } = list();
      for (const c of chips) {
        const k = c.dataset.k.slice(4);
        const nw = (k === 'all' ? all : all.filter((x) => x.slot === k)).some((x) => x.fresh);
        if (!nw) c.querySelector('.nw')?.remove();
      }
      if (subEl) subEl.textContent = sub();
    };
    const equip = (uid) => {
      const it = Rpg.item(uid);
      if (!it) return;
      const idx = [...cards.keys()].indexOf(uid);
      if (!Rpg.equip(uid, id)) { Audio.warn(); return; }
      Audio.select();
      this._lgToast(s, `${D.SLOTS[it.slot].name}: ${Rpg.describe(it).name}`);
      // keep the focus on the same grid position: the next candidate or the part taken off
      const { shown } = list();
      const nxt = shown[Math.min(Math.max(0, idx), shown.length - 1)];
      sel = nxt ? { uid: nxt.uid } : { slot: it.slot };
      render(nxt ? 'it:' + nxt.uid : 'slot:' + it.slot, it.slot);
    };
    const browse = (slot) => {
      V.filter = slot;
      const { shown } = list();
      Audio.click();
      if (!shown.length) { this._lgToast(s, `Sin recambios de ${D.SLOTS[slot].name.toLowerCase()}`, 'warn'); render('flt:' + slot); return; }
      sel = { uid: shown[0].uid };
      render('it:' + shown[0].uid);
    };
    const salvage = (it) => {
      const go = () => {
        const { shown } = list();
        const idx = shown.findIndex((x) => x.uid === it.uid);
        const v = Rpg.salvage(it.uid);
        if (!v) { Audio.warn(); return; }
        Audio.click();
        this._lgToast(s, `Desguazada · +${fmtN(v.frags)} fragmentos · +${fmtN(v.credits)} créditos`);
        const rest = list().shown;
        const nxt = rest[Math.min(Math.max(0, idx), rest.length - 1)];
        sel = nxt ? { uid: nxt.uid } : null;
        render(nxt ? 'it:' + nxt.uid : 'flt:' + V.filter);
      };
      if (it.rar < 2) { go(); return; }
      const v = Rpg.salvageValue(it);
      this._lgConfirm({
        kicker: 'Desguace', title: '¿Desguazar esta pieza?', ok: 'Desguazar', okIcon: ICO.salvage, onOk: go, danger: true,
        body: h('div', { class: 'lg-cf' }, itemCard(it, { equippedOn: null }),
          h('div', { class: 'lg-cf-v' }, h('span', {}, 'Obtendrás'), h('b', {}, icon(RICON.frags), `+${fmtN(v.frags)}`), h('b', {}, icon(RICON.credits), `+${fmtN(v.credits)}`)),
          h('div', { class: 'lg-dt-p' }, `Pieza ${D.RARITY[it.rar].name.toLowerCase()}: el desguace no se puede deshacer.`)),
      });
    };
    const quickSalvage = () => {
      // preview per rarity: unlocked, unmounted parts at or below it
      const opts = [0, 1, 2, 3].map((rar) => {
        const pool = Rpg.items().filter((x) => x.rar <= rar && Rpg.canSalvage(x));
        return { rar, n: pool.length, frags: pool.reduce((a, x) => a + Rpg.salvageValue(x).frags, 0), credits: pool.reduce((a, x) => a + Rpg.salvageValue(x).credits, 0) };
      });
      let pick = 0;
      const was = { i: this.navI };
      const close = () => { this.closeModal(); this.onLeftRight = null; this._focus(was.i, false); };
      const go = this.btn('Desguazar', ICO.sweep, () => {
        const o = opts[pick];
        if (!o.n) { Audio.warn(); return; }
        this.closeModal(); this.onLeftRight = null;
        const t = Rpg.salvageBelow(o.rar);
        Audio.select();
        this._lgToast(s, `${plural(t.n, 'pieza desguazada', 'piezas desguazadas')} · +${fmtN(t.frags)} fragmentos · +${fmtN(t.credits)} créditos`);
        if (sel && sel.uid != null && !Rpg.item(sel.uid)) sel = null;
        render('bb:quick');
      }, 'primary lg-danger');
      const no = this.btn('Cancelar', ICO.back, close, 'small');
      const rows = opts.map((o, i) => {
        const r = h('div', { class: `lg-qs r-${D.RARITY[o.rar].id}` + (o.n ? '' : ' none'), tabindex: '-1' },
          h('span', { class: 'rd' }), h('div', { class: 'tt' }, h('span', { class: 'k' }, 'Hasta'), rarityTag(o.rar)),
          h('b', { class: 'n' }, plural(o.n, 'pieza', 'piezas')),
          h('span', { class: 'v' }, icon(RICON.frags), `+${fmtN(o.frags)}`), h('span', { class: 'v' }, icon(RICON.credits), `+${fmtN(o.credits)}`));
        r.addEventListener('click', (ev) => { choose(i); if (ev.detail === 0) this._focus(this.nav.indexOf(go)); });
        this._lgHover(r);
        return r;
      });
      const choose = (i) => {
        pick = i;
        rows.forEach((r, k) => r.classList.toggle('on', k === i));
        go.lastChild.textContent = opts[i].n ? `Desguazar ${plural(opts[i].n, 'pieza', 'piezas')}` : 'Nada que desguazar';
        go.disabled = !opts[i].n;
      };
      const box = h('div', { class: 'modal glass lg-modal lg-qsm' },
        h('div', { class: 'kicker acc' }, 'Desguace rápido'), h('h2', {}, 'Desguazar por rareza'),
        h('div', { class: 'lg-dt-p' }, 'Se desguazan de una vez todas las piezas de la rareza elegida o inferior. Las piezas montadas y las bloqueadas se conservan.'),
        h('div', { class: 'lg-qs-l' }, ...rows),
        h('div', { class: 'lg-mbtns' }, no, go));
      this._modal(box, close);
      this.onLeftRight = null;
      this._setNav([...rows, go, no]);
      choose(0);
    };

    // ---- bike switch
    const switchBike = (d) => {
      const o = Rpg.s.owned;
      if (o.length < 2) return;
      id = o[(o.indexOf(id) + d + o.length) % o.length];
      Audio.select();
      sel = null;
      showBike();
      render();
    };

    const sub = () => {
      const n = Rpg.items().length, nw = Rpg.newCount();
      return `${BIKE_BY_ID[id].name} · ${n} de ${D.INV_MAX} piezas` + (nw ? ` · ${plural(nw, 'nueva', 'nuevas')}` : '');
    };

    // ---- full render (keeps the grid scroll and the focus by key)
    const render = (want = null, flash = null) => {
      const cur = want || this.nav[this.navI]?.dataset.k || null;
      const scroll = grid ? grid.parentElement?.scrollTop || 0 : 0;
      navL = []; navInv = []; navDet = []; navBot = [];
      put(clear(top), rpgTopBar('Equipamiento', sub()));
      subEl = top.querySelector('.rpg-sub');
      det = h('div', { class: 'lg-det glass' });
      const left = h('div', { class: 'lg-colL lg-scroll' }, h('div', { class: 'lg-lp glass lg-scroll' }, bikeHeader(), slotRows()), sheet());
      put(clear(wrap), left, inventory(), det);
      frame();
      const quick = this.btn('Desguace rápido', ICO.sweep, quickSalvage, 'small');
      quick.dataset.k = 'bb:quick';
      const back = this.btn('Volver', ICO.back, goBack, 'small');
      back.dataset.k = 'bb:back';
      navBot = [quick, back];
      put(clear(bottom), keys([['← → ↑ ↓', 'Navegar'], ['Enter', 'Equipar'], ['Q E', 'Moto'], ['Esc', 'Volver']]), h('span', { class: 'grow' }), quick, back);
      if (grid && grid.parentElement) grid.parentElement.scrollTop = scroll;
      if (flash) wrap.querySelector(`[data-k="slot:${flash}"]`)?.classList.add('flash');
      // what to show and focus
      if (sel && sel.uid != null && !Rpg.item(sel.uid)) sel = null;
      if (!sel) { const f = list().shown[0]; sel = f ? { uid: f.uid } : { slot: D.SLOT_KEYS[0] }; }
      renderDetail();
      let key = cur;
      if (!key || !this.nav.some((x) => x.dataset.k === key)) key = sel.uid != null && cards.has(sel.uid) ? 'it:' + sel.uid : sel.slot ? 'slot:' + sel.slot : (navInv.find((x) => x._uid) || navL.find((x) => x._slot))?.dataset.k;
      const i = this.nav.findIndex((x) => x.dataset.k === key);
      this._focus(Math.max(0, i), false);
    };

    // selection follows the focus (keyboard, clicks); actions keep the current selection
    this._onFocus = (el) => {
      const k = el.dataset.k || '';
      if (k.startsWith('it:')) {
        const uid = el._uid;
        if (!sel || sel.uid !== uid || sel.fromSlot) { sel = { uid }; markSeen(uid); renderDetail(k); }
      } else if (k.startsWith('slot:')) {
        const it = Rpg.equipped(id, el._slot);
        const was = sel;
        sel = it ? { uid: it.uid, fromSlot: true } : { slot: el._slot };
        if (!was || was.uid !== sel.uid || was.slot !== sel.slot || !was.fromSlot !== !sel.fromSlot) renderDetail(k);
      } else if (k.startsWith('stat:')) {
        const st = k.slice(5);
        if (!sel || sel.stat !== st) { sel = { stat: st }; renderDetail(k); }
      } else if (k.startsWith('perk:')) {
        const p = k.slice(5);
        if (!sel || sel.perk !== p) { sel = { perk: p }; renderDetail(k); }
      }
      el.scrollIntoView({ block: 'nearest' });
    };
    this._lgInput((d) => switchBike(d));
    this.onBack = goBack;
    showBike();
    render(focusUid != null ? 'it:' + focusUid : null);
  },
};
