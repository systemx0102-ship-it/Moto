// Shared building blocks for the Modo Leyenda screens: icons, wallet and profile
// chips, XP bars, stars, rarity tags and the part card used by the inventory,
// the forge and the rewards screen.
import { h } from '../../ui/dom.js';
import { Rpg } from '../Rpg.js';
import * as D from '../data.js';

const SVG = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;

// one stroked 24px icon per part slot
export const SLOT_ICON = {
  motor: SVG('<rect x="4" y="8" width="13" height="10" rx="1"/><path d="M8 8V5h5v3M17 11h3v4h-3M4 12H2v3h2"/>'),
  escape: SVG('<path d="M2 16h9l6-6"/><path d="M15 6l5 5-3 3-5-5z"/>'),
  centralita: SVG('<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>'),
  neumaticos: SVG('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>'),
  frenos: SVG('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M15.5 4.8a8 8 0 0 1 3.7 3.7"/>'),
  suspension: SVG('<path d="M12 2v3M12 19v3M8 5h8l-8 3.5h8l-8 3.5h8l-8 3.5h8"/>'),
  chasis: SVG('<path d="M3 17l5-9h7l5 9M8 8l3.5 9H20M3 17h5"/>'),
  nitro: SVG('<rect x="8" y="6" width="8" height="15" rx="2"/><path d="M10 6V3h4v3M12 10v6M9 13h6"/>'),
};
// interface icons for the mode
export const RICON = {
  map: SVG('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  talents: SVG('<circle cx="12" cy="4" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="12" cy="20" r="2"/><path d="M11 6l-4 4M13 6l4 4M7 14l4 4M17 14l-4 4"/>'),
  forge: SVG('<path d="M3 10h13l-2 4H7z"/><path d="M9 14v3H6v3h12v-3h-3v-3M16 10l4-4-2-2-4 4"/>'),
  contracts: SVG('<rect x="5" y="4" width="14" height="17" rx="1"/><path d="M9 4V2h6v2M8 10h8M8 14h8M8 18h5"/>'),
  shop: SVG('<path d="M3 9l2-5h14l2 5"/><path d="M4 9v11h16V9M3 9h18M9 20v-6h6v6"/>'),
  mastery: SVG('<path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'),
  star: SVG('<path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'),
  credits: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M15 9.2c-.6-1-1.8-1.6-3-1.6-1.9 0-3 1-3 2.2 0 2.9 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2-1.3 0-2.6-.6-3.2-1.6M12 5.5v13"/>'),
  frags: SVG('<path d="M12 2l6 7-6 13-6-13z"/><path d="M6 9h12M12 2v20"/>'),
  lock: SVG('<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  power: SVG('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  boss: SVG('<path d="M4 18l1-11 4 4 3-6 3 6 4-4 1 11z"/><path d="M4 21h16"/>'),
  check: SVG('<path d="M5 12l5 5 9-10"/>'),
};

export const fmtN = (n) => Math.round(n).toLocaleString('es-ES');
export const fmtPct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} %`;
export const rarityOf = (it) => D.RARITY[it.rar];

export function icon(svg, cls = '') { return h('span', { class: 'rpg-ico ' + cls, html: svg }); }

// wallet: credits and fragments
export function wallet() {
  return h('div', { class: 'rpg-wallet' },
    h('span', { class: 'rpg-chip cr', title: 'Créditos' }, icon(RICON.credits), fmtN(Rpg.credits)),
    h('span', { class: 'rpg-chip fr', title: 'Fragmentos' }, icon(RICON.frags), fmtN(Rpg.frags)));
}

// horizontal progress bar (0..1); `ghost` shows a second, lighter fill (e.g. gained XP)
export function bar(frac, cls = '', ghost = null) {
  const b = h('div', { class: 'rpg-bar ' + cls });
  if (ghost !== null) b.appendChild(h('i', { class: 'ghost', style: { width: `${Math.max(0, Math.min(1, ghost)) * 100}%` } }));
  b.appendChild(h('i', { class: 'fill', style: { width: `${Math.max(0, Math.min(1, frac)) * 100}%` } }));
  return b;
}

// rank badge + level + XP bar
export function profileChip() {
  const x = Rpg.xpInfo();
  return h('div', { class: 'rpg-profile' },
    h('div', { class: 'rpg-rank', style: { '--rk': x.rank.color } }, h('b', {}, String(x.level)), h('span', {}, x.rank.name)),
    h('div', { class: 'rpg-prof-xp' },
      h('div', { class: 'k' }, `Nivel ${x.level}`, h('span', {}, x.max ? 'MÁX.' : `${fmtN(x.xp)} / ${fmtN(x.need)} XP`)),
      bar(x.frac, 'xp')));
}

// the mode's top bar: title (+ optional sub), profile, power of the active machine, wallet
export function rpgTopBar(title, sub = '') {
  return h('div', { class: 'top-bar rpg-top' },
    h('div', { class: 'rpg-title' }, h('div', { class: 'kicker acc' }, 'Modo Leyenda'), h('h2', {}, title), sub ? h('div', { class: 'rpg-sub' }, sub) : null),
    h('span', { class: 'grow' }),
    Rpg.started ? h('div', { class: 'rpg-power', title: 'Poder de tu moto' }, icon(RICON.power), h('b', {}, fmtN(Rpg.power())), h('span', {}, 'Poder')) : null,
    Rpg.started ? profileChip() : null,
    wallet());
}

// three stars from a bit mask (bit i = objective i)
export function stars(mask, n = 3) {
  return h('span', { class: 'rpg-stars' }, ...Array.from({ length: n }, (_, i) => icon(RICON.star, mask & (1 << i) ? 'on' : '')));
}

export function rarityTag(rar) {
  const R = D.RARITY[rar];
  return h('span', { class: `rpg-rtag r-${R.id}` }, R.name);
}

// one stat line; `delta` (optional) is the change against the equipped part
export function statLine(stat, value, delta = null, primary = false) {
  return h('div', { class: 'rpg-sl' + (primary ? ' pri' : '') },
    h('span', { class: 'n' }, D.STATS[stat].name),
    h('b', {}, fmtPct(value)),
    delta !== null && Math.abs(delta) >= 0.05 ? h('span', { class: 'd ' + (delta > 0 ? 'up' : 'down') }, fmtPct(delta)) : null);
}

// Part card. opts: {compare: bikeId|null (show deltas vs that bike's slot), compact,
// equippedOn: bikeId|null badge, onClick, selected}
export function itemCard(it, opts = {}) {
  const d = Rpg.describe(it), R = d.rarity;
  const cmp = opts.compare ? Rpg.compare(it, opts.compare) : null;
  const on = opts.equippedOn === undefined ? Rpg.equippedBy(it.uid) : opts.equippedOn;
  const card = h('div', { class: `rpg-card r-${R.id}` + (opts.compact ? ' compact' : '') + (opts.selected ? ' sel' : '') + (it.fresh ? ' fresh' : ''), tabindex: '-1' },
    h('div', { class: 'rpg-card-head' },
      icon(SLOT_ICON[it.slot], 'slot'),
      h('div', { class: 'tt' }, h('div', { class: 'nm' }, d.name), h('div', { class: 'meta' }, rarityTag(it.rar), h('span', {}, `${d.slotName} · Nv. ${d.ilvl}`))),
      h('div', { class: 'pw' }, h('b', {}, fmtN(d.power)), cmp && cmp.current && cmp.current.uid !== it.uid ? h('span', { class: 'd ' + (cmp.power >= 0 ? 'up' : 'down') }, `${cmp.power >= 0 ? '+' : '−'}${fmtN(Math.abs(cmp.power))}`) : h('span', {}, 'Poder'))),
    opts.compact ? null : h('div', { class: 'rpg-card-body' },
      ...d.lines.map((l) => statLine(l.stat, l.value, cmp && cmp.current && cmp.current.uid !== it.uid ? cmp.stats[l.stat] ?? null : null, l.primary)),
      d.perk ? h('div', { class: 'rpg-perk' }, h('b', {}, d.perk.name), h('span', {}, d.perk.desc)) : null),
    h('div', { class: 'rpg-card-flags' },
      it.lock ? icon(RICON.lock, 'lk') : null,
      on ? h('span', { class: 'eq' }, on === Rpg.s.active ? 'Equipada' : `En ${on.toUpperCase()}`) : null,
      it.fresh ? h('span', { class: 'nw' }, 'Nueva') : null));
  if (opts.onClick) { card.style.cursor = 'pointer'; card.addEventListener('click', () => opts.onClick(it, card)); }
  return card;
}
