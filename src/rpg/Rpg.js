// MODO LEYENDA — RPG state and rules: profile level and rank, owned machines with
// their mastery and attribute points, the parts inventory (loot generation, equip,
// forge, salvage), talents, the region map, contracts and the post-event rewards.
// State lives in Save.data.rpg; every mutating call saves.
import { Save } from '../core/Settings.js';
import { BIKES, BIKE_BY_ID } from '../bikes/catalog.js';
import { TRACK_BY_ID } from '../track/catalog.js';
import * as D from './data.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r1 = (v) => Math.round(v * 10) / 10;
const rr = (a, b) => a + (b - a) * Math.random();
const ri = (a, b) => Math.floor(a + (b - a + 1) * Math.random());
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const zeroStats = () => Object.fromEntries(D.STAT_KEYS.map((k) => [k, 0]));
const LIFE = ['races', 'wins', 'podiums', 'overtakes', 'driftS', 'nitroS', 'airS', 'km', 'crashes', 'stars', 'clean', 'topKmh', 'bosses'];

function freshState() {
  return {
    v: 1, started: false, level: 1, xp: 0, credits: D.START_CREDITS, frags: 0,
    owned: [], active: null, bikes: {}, inv: [], uid: 1, talents: {}, events: {}, bosses: {}, contracts: [],
    life: Object.fromEntries(LIFE.map((k) => [k, 0])),
  };
}
function freshBike() {
  return { m: 1, mxp: 0, pts: Object.fromEntries(D.MASTERY_STATS.map((k) => [k, 0])), gear: Object.fromEntries(D.SLOT_KEYS.map((k) => [k, null])), livery: 0 };
}

class RpgStore {
  // ------------------------------------------------------------------ state
  get s() {
    if (!Save.data.rpg || Save.data.rpg.v !== 1) Save.data.rpg = freshState();
    return Save.data.rpg;
  }
  get started() { return this.s.started; }
  save() { Save.save(); }
  reset() { Save.data.rpg = freshState(); this.save(); }

  // ------------------------------------------------------------------ profile
  get level() { return this.s.level; }
  get credits() { return this.s.credits; }
  get frags() { return this.s.frags; }
  rank(level = this.s.level) {
    let r = D.RANKS[0];
    for (const k of D.RANKS) if (level >= k.from) r = k;
    return r;
  }
  // {level, xp, need, frac, rank:{name,color}, max}
  xpInfo() {
    const s = this.s, max = s.level >= D.LEVEL_MAX, need = max ? 1 : D.xpToNext(s.level);
    return { level: s.level, xp: max ? 0 : s.xp, need, frac: max ? 1 : s.xp / need, rank: this.rank(), max };
  }
  // adds profile XP; returns the number of levels gained
  _gainXp(n) {
    const s = this.s;
    let ups = 0;
    s.xp += Math.max(0, Math.round(n));
    while (s.level < D.LEVEL_MAX && s.xp >= D.xpToNext(s.level)) { s.xp -= D.xpToNext(s.level); s.level++; ups++; }
    if (s.level >= D.LEVEL_MAX) s.xp = 0;
    return ups;
  }

  // ------------------------------------------------------------------ bikes
  chooseStarter(id) {
    if (!D.STARTERS.includes(id)) return false;
    const s = this.s;
    s.started = true;
    s.owned = [id];
    s.active = id;
    s.bikes[id] = freshBike();
    // a full set of stock parts so every slot starts filled
    for (const slot of D.SLOT_KEYS) {
      const it = this.makeItem({ slot, rar: 0, ilvl: 1 });
      it.fresh = false;
      s.inv.push(it);
      s.bikes[id].gear[slot] = it.uid;
    }
    while (s.contracts.length < D.CONTRACT_SLOTS) s.contracts.push(this._newContract());
    this.save();
    return true;
  }
  activeSpec() { return BIKE_BY_ID[this.s.active] || BIKES[0]; }
  owns(id) { return this.s.owned.includes(id); }
  setActive(id) { if (!this.owns(id)) return false; this.s.active = id; this.save(); return true; }
  bike(id = this.s.active) {
    const s = this.s;
    if (!s.bikes[id]) s.bikes[id] = freshBike();
    return s.bikes[id];
  }
  setLivery(id, livery) { this.bike(id).livery = livery; this.save(); }
  bikePrice(id) { return D.BIKE_PRICE[id] ?? 5000; }
  // boss bikes can only be bought after their boss is beaten
  bikeAvailable(id) {
    const boss = Object.entries(D.BOSSES).find(([, b]) => b.bike === id);
    return !boss || !!this.s.bosses[boss[0]];
  }
  buyBike(id) {
    const s = this.s, price = this.bikePrice(id);
    if (this.owns(id) || !BIKE_BY_ID[id] || !this.bikeAvailable(id) || s.credits < price) return false;
    s.credits -= price;
    s.owned.push(id);
    this.bike(id);
    this.save();
    return true;
  }
  _grantBike(id) {
    if (this.owns(id)) return false;
    this.s.owned.push(id);
    this.bike(id);
    return true;
  }

  // ------------------------------------------------------------------ mastery
  // {level, xp, need, frac, points, spent, free, max}
  masteryInfo(id = this.s.active) {
    const b = this.bike(id), max = b.m >= D.MASTERY_MAX, need = max ? 1 : D.masteryToNext(b.m);
    const points = b.m * D.MASTERY_POINTS_PER_LEVEL;
    const spent = Object.values(b.pts).reduce((a, v) => a + v, 0);
    return { level: b.m, xp: max ? 0 : b.mxp, need, frac: max ? 1 : b.mxp / need, points, spent, free: points - spent, max, pts: { ...b.pts } };
  }
  allocate(id, stat, dir = 1) {
    const b = this.bike(id), info = this.masteryInfo(id);
    if (!D.MASTERY_STATS.includes(stat)) return false;
    if (dir > 0 && (info.free <= 0 || b.pts[stat] >= D.MASTERY_STAT_MAX)) return false;
    if (dir < 0 && b.pts[stat] <= 0) return false;
    b.pts[stat] += dir > 0 ? 1 : -1;
    this.save();
    return true;
  }
  resetAllocation(id) { const b = this.bike(id); for (const k of Object.keys(b.pts)) b.pts[k] = 0; this.save(); }
  _gainMastery(id, n) {
    const b = this.bike(id);
    let ups = 0;
    b.mxp += Math.max(0, Math.round(n));
    while (b.m < D.MASTERY_MAX && b.mxp >= D.masteryToNext(b.m)) { b.mxp -= D.masteryToNext(b.m); b.m++; ups++; }
    if (b.m >= D.MASTERY_MAX) b.mxp = 0;
    return ups;
  }

  // ------------------------------------------------------------------ items
  items() { return this.s.inv; }
  item(uid) { return this.s.inv.find((i) => i.uid === uid) || null; }
  newCount() { return this.s.inv.filter((i) => i.fresh).length; }
  seen(uid) { const it = this.item(uid); if (it && it.fresh) { it.fresh = false; this.save(); } }
  seenAll() { for (const it of this.s.inv) it.fresh = false; this.save(); }

  // Roll a new part. opts: {slot?, rar?, ilvl, perk?, minRar?, tier?, luck?}
  makeItem(opts = {}) {
    const slot = opts.slot || pick(D.SLOT_KEYS);
    const rar = opts.rar ?? Math.max(opts.minRar || 0, this.rollRarity(opts.tier || 0, opts.luck || 0));
    const R = D.RARITY[rar], S = D.SLOTS[slot];
    const ilvl = clamp(Math.round(opts.ilvl || 1), 1, 60);
    const f = 1 + ilvl * D.ILVL_K;
    const base = S.base.map(([st, K]) => [st, r1(K * f * R.mult * rr(0.92, 1.08))]);
    const pool = D.AFFIXES.filter(([st]) => !base.some((b) => b[0] === st));
    const aff = [];
    for (let i = 0; i < R.affixes && pool.length; i++) {
      const [st, K] = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      aff.push([st, r1(K * f * Math.sqrt(R.mult) * rr(0.7, 1.3))]);
    }
    let perk = opts.perk || null;
    if (!perk && (rar === 4 || (rar === 3 && Math.random() < 0.35))) perk = pick(D.PERK_KEYS);
    const it = { uid: this.s.uid++, slot, rar, ilvl, plus: 0, base, aff, perk, name: '', lock: false, fresh: true };
    it.name = this._itemName(it);
    return it;
  }
  _itemName(it) {
    const base = D.SLOTS[it.slot].names[it.rar];
    if (it.rar === 0) return base;
    if (it.perk && it.rar === 4) return `${base} «${D.PERKS[it.perk].name}»`;
    let top = it.aff[0] || it.base[0];
    for (const a of it.aff) if (a[1] / (D.AFFIXES.find((x) => x[0] === a[0])?.[1] || 1) > top[1] / (D.AFFIXES.find((x) => x[0] === top[0])?.[1] || 1)) top = a;
    return `${base} «${D.EPITHET[top[0]]}»`;
  }
  // rarity index from the drop table, shifted up by region tier (0..6) and luck (%)
  rollRarity(tier = 0, luck = 0) {
    const w = D.RARITY.map((R, i) => (i === 0 ? R.weight : R.weight * (1 + tier * 0.35) ** (i * 0.6) * (1 + luck / 100) ** i));
    let t = Math.random() * w.reduce((a, v) => a + v, 0);
    for (let i = 0; i < w.length; i++) { t -= w[i]; if (t <= 0) return i; }
    return 0;
  }
  // {stat: value} of one part, forge level included
  itemStats(it) {
    const out = {}, k = 1 + it.plus * D.PLUS_K;
    for (const [st, v] of [...it.base, ...it.aff]) out[st] = r1((out[st] || 0) + v * k);
    return out;
  }
  itemPower(it) { return Math.round((10 + it.ilvl * 6) * D.RARITY[it.rar].mult * (1 + it.plus * D.PLUS_K)); }
  // {name, rarity, slot, slotName, ilvl, plus, power, lines:[{stat,name,value,primary,text}], perk:{id,name,desc}|null}
  describe(it) {
    const k = 1 + it.plus * D.PLUS_K;
    const line = (primary) => ([st, v]) => ({ stat: st, name: D.STATS[st].name, value: r1(v * k), primary, text: `+${r1(v * k).toFixed(1)} % ${D.STATS[st].name}` });
    return {
      name: it.name + (it.plus ? ` +${it.plus}` : ''), rarity: D.RARITY[it.rar], slot: it.slot, slotName: D.SLOTS[it.slot].name,
      ilvl: it.ilvl, plus: it.plus, power: this.itemPower(it),
      lines: [...it.base.map(line(true)), ...it.aff.map(line(false))],
      perk: it.perk ? { id: it.perk, ...D.PERKS[it.perk] } : null,
    };
  }
  // bike id wearing the part, or null
  equippedBy(uid) {
    for (const [id, b] of Object.entries(this.s.bikes)) for (const u of Object.values(b.gear)) if (u === uid) return id;
    return null;
  }
  equipped(id = this.s.active, slot) { const u = this.bike(id).gear[slot]; return u ? this.item(u) : null; }
  equip(uid, id = this.s.active) {
    const it = this.item(uid);
    if (!it || !this.owns(id)) return false;
    const was = this.equippedBy(uid);
    if (was) this.bike(was).gear[it.slot] = null;
    this.bike(id).gear[it.slot] = uid;
    it.fresh = false;
    this.save();
    return true;
  }
  unequip(slot, id = this.s.active) { this.bike(id).gear[slot] = null; this.save(); }
  lock(uid, v) { const it = this.item(uid); if (it) { it.lock = v ?? !it.lock; this.save(); } }
  // per-stat difference (part minus what the bike wears in that slot) + power delta
  compare(it, id = this.s.active) {
    const cur = this.equipped(id, it.slot);
    const a = this.itemStats(it), b = cur && cur.uid !== it.uid ? this.itemStats(cur) : cur ? a : {};
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    const stats = Object.fromEntries(keys.map((k) => [k, r1((a[k] || 0) - (b[k] || 0))]));
    return { current: cur, stats, power: this.itemPower(it) - (cur ? this.itemPower(cur) : 0) };
  }
  salvageValue(it) { return { frags: Math.round(D.RARITY[it.rar].frags * (1 + it.plus * 0.5)), credits: 10 * (it.ilvl + 1) * (it.rar + 1) }; }
  canSalvage(it) { return !!it && !it.lock && !this.equippedBy(it.uid); }
  salvage(uid) {
    const it = this.item(uid);
    if (!this.canSalvage(it)) return null;
    const v = this.salvageValue(it);
    this.s.frags += v.frags; this.s.credits += v.credits;
    this.s.inv = this.s.inv.filter((x) => x !== it);
    this.save();
    return v;
  }
  // salvage every unlocked, unequipped part at or below a rarity; returns totals
  salvageBelow(rar) {
    const tot = { frags: 0, credits: 0, n: 0 };
    for (const it of [...this.s.inv]) {
      if (it.rar > rar || !this.canSalvage(it)) continue;
      const v = this.salvage(it.uid);
      if (v) { tot.frags += v.frags; tot.credits += v.credits; tot.n++; }
    }
    return tot;
  }
  upgradeCost(it) {
    if (it.plus >= D.PLUS_MAX) return null;
    return { credits: Math.round(40 * (it.ilvl + 4) * (it.plus + 1) * (1 + it.rar * 0.5)), frags: (it.plus + 1) * (it.rar + 1) * 2 };
  }
  upgrade(uid) {
    const it = this.item(uid), c = it && this.upgradeCost(it);
    if (!c || this.s.credits < c.credits || this.s.frags < c.frags) return false;
    this.s.credits -= c.credits; this.s.frags -= c.frags;
    it.plus++;
    this.save();
    return true;
  }
  rerollCost(it) { return it.rar >= 1 && it.aff.length ? { credits: 50 + it.ilvl * 10, frags: 8 * (it.rar + 1) + Math.round(it.ilvl / 2) } : null; }
  // re-roll affix i to a different stat (not already on the part)
  reroll(uid, i) {
    const it = this.item(uid), c = it && this.rerollCost(it);
    if (!c || !it.aff[i] || this.s.credits < c.credits || this.s.frags < c.frags) return false;
    const have = new Set([...it.base, ...it.aff].map((x) => x[0]));
    const pool = D.AFFIXES.filter(([st]) => !have.has(st));
    if (!pool.length) return false;
    const [st, K] = pick(pool);
    it.aff[i] = [st, r1(K * (1 + it.ilvl * D.ILVL_K) * Math.sqrt(D.RARITY[it.rar].mult) * rr(0.7, 1.3))];
    this.s.credits -= c.credits; this.s.frags -= c.frags;
    it.name = this._itemName(it);
    this.save();
    return true;
  }

  // ------------------------------------------------------------------ talents
  talentRank(id) { return this.s.talents[id] || 0; }
  talentPoints() {
    const spent = Object.values(this.s.talents).reduce((a, v) => a + v, 0);
    return { total: this.s.level, spent, free: this.s.level - spent };
  }
  canLearn(id) {
    const t = D.TALENT_BY_ID[id];
    if (!t || this.talentRank(id) >= t.max || this.talentPoints().free <= 0) return false;
    return (t.req || []).every(([rid, n]) => this.talentRank(rid) >= n);
  }
  learn(id) {
    if (!this.canLearn(id)) return false;
    this.s.talents[id] = this.talentRank(id) + 1;
    this.save();
    return true;
  }
  talentResetCost() { return D.talentResetCost(this.talentPoints().spent); }
  resetTalents() {
    const c = this.talentResetCost();
    if (this.s.credits < c) return false;
    this.s.credits -= c;
    this.s.talents = {};
    this.save();
    return true;
  }

  // ------------------------------------------------------------------ stats
  // Totals for a machine: {total, gear, mastery, talents, perks:[ids], power}
  stats(id = this.s.active) {
    const b = this.bike(id);
    const gear = zeroStats(), mastery = zeroStats(), talents = zeroStats(), total = zeroStats();
    const perks = new Set();
    let power = 0;
    for (const slot of D.SLOT_KEYS) {
      const it = b.gear[slot] ? this.item(b.gear[slot]) : null;
      if (!it) continue;
      const st = this.itemStats(it);
      for (const k of Object.keys(st)) gear[k] += st[k];
      if (it.perk) perks.add(it.perk);
      power += this.itemPower(it);
    }
    for (const k of D.MASTERY_STATS) mastery[k] = b.pts[k] * D.MASTERY_PER_POINT;
    for (const t of D.TALENTS) {
      const n = this.talentRank(t.id);
      if (!n) continue;
      if (t.stats) for (const [k, v] of Object.entries(t.stats)) talents[k] += v * n;
      if (t.perk) perks.add(t.perk);
    }
    for (const k of D.STAT_KEYS) total[k] = r1(Math.min(D.STAT_CAP[k], gear[k] + mastery[k] + talents[k]));
    power += b.m * 12 + this.talentPoints().spent * 8;
    return { total, gear, mastery, talents, perks: [...perks], power };
  }
  power(id = this.s.active) { return this.stats(id).power; }
  // physics multipliers for BikePhysics.tune(perf)
  perf(id = this.s.active) {
    const st = this.stats(id), t = st.total, P = new Set(st.perks);
    return {
      power: 1 + t.pot / 100, top: 1 + t.vel / 100, grip: 1 + t.agr / 200, brake: 1 + t.fre / 100, lean: 1 + t.man / 100,
      nitroPow: 1 + t.nit / 100, nitroDrain: 1 + t.nit / 200, nitroRegen: (1 + t.rec / 100) * (P.has('reactor') ? 1.6 : 1),
      draft: (1 + t.reb / 100) * (P.has('estela') ? 2 : 1), drift: 1 + t.der / 100,
      tough: (1 + t.res / 100) * (P.has('blindaje') ? 1.6 : 1), wet: P.has('tormenta') ? 0.75 : 0, airNitro: P.has('alas') ? 3 : 1,
      perks: [...P],
    };
  }
  // 0..100 ratings of the six core attributes: {stat: {base, total}}
  ratings(id = this.s.active) {
    const sp = BIKE_BY_ID[id] || BIKES[0], t = this.stats(id).total;
    const base = {
      pot: clamp((sp.engine.hp / (sp.mass + 60)) / 1.4 * 100, 8, 100),
      vel: clamp(sp.topKmh / 350 * 100, 8, 100),
      agr: clamp(sp.grip * 80, 8, 100),
      fre: clamp(sp.brakeG / 1.4 * 100, 8, 100),
      man: clamp(sp.leanRate / 3.6 * 100, 8, 100),
      nit: 50,
    };
    return Object.fromEntries(D.CORE_STATS.map((k) => [k, { base: Math.round(base[k]), total: Math.round(base[k] * (1 + t[k] / 100)) }]));
  }

  // ------------------------------------------------------------------ map
  regionUnlocked(ri) { return ri === 0 || !!this.s.bosses[D.REGIONS[ri - 1].boss]; }
  eventState(id) { return this.s.events[id] || { stars: 0, passed: false, best: 0, plays: 0 }; }
  starCount(mask) { return (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1); }
  eventUnlocked(id) {
    const e = D.EVENT_BY_ID[id];
    if (!e || !this.regionUnlocked(e.regionIndex)) return false;
    if (e.index === 0) return true;
    return this.eventState(D.REGIONS[e.regionIndex].events[e.index - 1].id).passed;
  }
  // regions with progress: [{...region, index, unlocked, stars, maxStars, done, events:[{...event, state, unlocked}]}]
  regions() {
    return D.REGIONS.map((r, i) => {
      const events = r.events.map((e) => ({ ...e, state: this.eventState(e.id), unlocked: this.eventUnlocked(e.id) }));
      const stars = events.reduce((a, e) => a + this.starCount(e.state.stars), 0);
      return { ...r, index: i, unlocked: this.regionUnlocked(i), stars, maxStars: events.length * 3, done: !!this.s.bosses[r.boss], events };
    });
  }
  totalStars() { return Object.values(this.s.events).reduce((a, e) => a + this.starCount(e.stars), 0); }
  recommended(eventId) { return D.recommendedPower(D.EVENT_BY_ID[eventId].level); }
  // The next event to play: first unlocked event without a pass, else the last unlocked one.
  nextEvent() {
    let last = null;
    for (const r of D.REGIONS) for (const e of r.events) {
      if (!this.eventUnlocked(e.id)) continue;
      last = e;
      if (!this.eventState(e.id).passed) return e;
    }
    return last;
  }

  // Config for Game.startRace(cfg). The race reads cfg.rpg (see Race).
  raceConfig(eventId) {
    const e = D.EVENT_BY_ID[eventId];
    const def = TRACK_BY_ID[e.track];
    const id = this.s.active;
    const trial = e.type === 'contrarreloj' || e.type === 'derrape';
    const boss = e.boss ? { key: e.boss, ...D.BOSSES[e.boss] } : null;
    return {
      mode: trial ? 'trial' : 'race',
      trackDef: def, bikeId: id, livery: this.bike(id).livery || 0,
      laps: e.laps, rivals: trial ? 0 : e.rivals,
      difficulty: Save.settings.difficulty,
      seed: Math.floor(Math.random() * 1e6),
      time: e.time || 'auto', weather: e.weather || 'auto',
      rpg: {
        eventId: e.id, type: e.type, name: e.name, level: e.level, region: e.region,
        ai: D.aiScale(e.level), boss, rival: e.rival || null,
        perf: this.perf(id), objectives: e.obj.map((o) => ({ ...o, text: D.objectiveText(o) })),
      },
    };
  }

  // ------------------------------------------------------------------ results
  // report (from the race): {eventId, completed, pos, total, eliminated, beatBoss, margin,
  //   bestLap, refLap, driftS, overtakes, nitroS, airS, crashes, topKmh, km}
  // Returns everything the rewards screen shows.
  finish(rep) {
    const s = this.s, e = D.EVENT_BY_ID[rep.eventId];
    const id = s.active;
    const st = this.stats(id).total;
    const before = { level: s.level, xp: s.xp, mastery: this.bike(id).m, mxp: this.bike(id).mxp, credits: s.credits, frags: s.frags };
    const wasState = this.eventState(e.id);
    const unlockedBefore = new Set(Object.keys(D.EVENT_BY_ID).filter((k) => this.eventUnlocked(k)));
    const ok = (o) => {
      const fin = !!rep.completed && !rep.eliminated;
      switch (o.kind) {
        case 'pos': return fin && rep.pos <= o.n;
        case 'win': return fin && rep.pos === 1;
        case 'boss': return fin && !!rep.beatBoss;
        case 'noCrash': return !!rep.completed && !rep.crashes;
        case 'survive': return fin;
        case 'lap': return rep.bestLap > 0 && rep.refLap > 0 && rep.bestLap <= rep.refLap * o.k;
        case 'drift': return (rep.driftS || 0) >= o.s;
        case 'margin': return fin && rep.pos === 1 && (rep.margin || 0) >= o.s;
        case 'overtakes': return (rep.overtakes || 0) >= o.n;
        default: return false;
      }
    };
    const objectives = e.obj.map((o, i) => ({ text: D.objectiveText(o), ok: ok(o), had: !!(wasState.stars & (1 << i)) }));
    const passed = objectives[0].ok;
    let mask = 0;
    objectives.forEach((o, i) => { if (o.ok) mask |= 1 << i; });
    const newStars = this.starCount(mask & ~wasState.stars);
    const firstClear = passed && !wasState.passed;
    const bossWin = !!(e.boss && passed && !s.bosses[e.boss]);

    // experience
    const trial = e.type === 'contrarreloj' || e.type === 'derrape';
    const posK = trial ? (passed ? 0.7 + 0.15 * this.starCount(mask) : 0.3) : passed ? (D.POS_FACTOR[(rep.pos || 12) - 1] ?? 0.2) : 0.3;
    const xpLines = [{ label: passed ? `${D.TYPE_NAME[e.type]} superada` : 'Participación', xp: Math.round(D.rewardXp(e.level) * posK) }];
    if (rep.overtakes) xpLines.push({ label: `Adelantamientos ×${rep.overtakes}`, xp: rep.overtakes * D.XP_BONUS.overtake });
    if (rep.driftS >= 1) xpLines.push({ label: `Derrape ${rep.driftS.toFixed(1)} s`, xp: Math.round(rep.driftS * D.XP_BONUS.driftS) });
    if (rep.completed && !rep.crashes) xpLines.push({ label: 'Prueba limpia', xp: D.XP_BONUS.clean });
    if (newStars) xpLines.push({ label: `Estrellas nuevas ×${newStars}`, xp: newStars * (D.XP_BONUS.star + e.level * D.XP_BONUS.perLevel * 0.4) });
    if (firstClear) xpLines.push({ label: 'Primera vez superada', xp: D.XP_BONUS.firstClear + e.level * D.XP_BONUS.perLevel });
    if (bossWin) xpLines.push({ label: 'Jefe derrotado', xp: D.XP_BONUS.boss + e.level * D.XP_BONUS.perLevel * 2 });
    for (const l of xpLines) l.xp = Math.round(l.xp);
    const xpBase = xpLines.reduce((a, l) => a + l.xp, 0);
    const xpBonus = Math.round(xpBase * st.xp / 100);
    if (xpBonus) xpLines.push({ label: `Bonificación de experiencia +${st.xp.toFixed(0)} %`, xp: xpBonus });
    const xp = xpBase + xpBonus;
    const credits = Math.round((D.rewardCredits(e.level) * posK + newStars * 40 + (bossWin ? 600 : 0)) * (1 + st.cre / 100));

    const levelUps = this._gainXp(xp);
    const masteryUps = this._gainMastery(id, xp);
    s.credits += credits;

    // loot
    const tier = e.regionIndex;
    const luck = st.suerte;
    let drops = !rep.completed ? 0 : !passed ? 1 : trial ? 1 + (this.starCount(mask) >= 2 ? 1 : 0) : rep.pos === 1 ? 3 : rep.pos <= 3 ? 2 : 1;
    if (this.talentRank('leyenda') && rep.completed) drops++;
    const items = [];
    for (let i = 0; i < drops; i++) items.push(this.makeItem({ ilvl: e.level + ri(-1, 2), tier, luck }));
    if (bossWin) items.push(this.makeItem({ ilvl: e.level + 2, rar: e.boss === 'mitico' ? 4 : 3 }));
    const salvaged = { n: 0, frags: 0, credits: 0 };
    for (const it of items) {
      if (s.inv.length < D.INV_MAX) { s.inv.push(it); continue; }
      const v = this.salvageValue(it);
      s.frags += v.frags; s.credits += v.credits;
      salvaged.n++; salvaged.frags += v.frags; salvaged.credits += v.credits;
      it.salvaged = true;
    }

    // map progress
    s.events[e.id] = { stars: wasState.stars | mask, passed: wasState.passed || passed, best: wasState.best ? (rep.pos ? Math.min(wasState.best, rep.pos) : wasState.best) : rep.pos || 0, plays: (wasState.plays || 0) + 1 };
    let bikeWon = null;
    if (bossWin) {
      s.bosses[e.boss] = true;
      const bid = D.BOSSES[e.boss].bike;
      if (this._grantBike(bid)) bikeWon = bid;
    }
    const unlockedEvents = Object.keys(D.EVENT_BY_ID).filter((k) => !unlockedBefore.has(k) && this.eventUnlocked(k)).map((k) => D.EVENT_BY_ID[k]);
    const regionUnlocked = unlockedEvents.find((x) => x.index === 0) ? D.REGIONS[unlockedEvents.find((x) => x.index === 0).regionIndex] : null;

    // lifetime stats and contracts
    const add = {
      races: rep.completed ? 1 : 0, wins: rep.completed && passed && rep.pos === 1 && !trial ? 1 : 0, podiums: rep.completed && passed && rep.pos <= 3 && !trial ? 1 : 0,
      overtakes: rep.overtakes || 0, driftS: rep.driftS || 0, nitroS: rep.nitroS || 0, airS: rep.airS || 0, km: rep.km || 0,
      crashes: rep.crashes || 0, stars: newStars, clean: rep.completed && !rep.crashes ? 1 : 0, bosses: bossWin ? 1 : 0,
    };
    for (const [k, v] of Object.entries(add)) s.life[k] = (s.life[k] || 0) + v;
    s.life.topKmh = Math.max(s.life.topKmh || 0, rep.topKmh || 0);
    const contracts = [];
    for (const c of s.contracts) {
      if (c.done) continue;
      const tpl = D.CONTRACTS.find((t) => t.id === c.tpl);
      const v = tpl.stat === 'topKmh' ? rep.topKmh || 0 : add[tpl.stat] || 0;
      if (!v) continue;
      const was = c.prog;
      c.prog = tpl.max ? Math.max(c.prog, v) : r1(c.prog + v);
      if (c.prog >= c.n) { c.prog = c.n; c.done = true; }
      contracts.push({ text: this.contractText(c), from: was, to: c.prog, n: c.n, done: c.done });
    }
    this.save();
    return {
      event: e, passed, objectives, stars: { before: wasState.stars, after: s.events[e.id].stars, gained: newStars },
      xp, xpLines, credits, levelBefore: before.level, levelAfter: s.level, levelUps, xpBefore: before.xp, xpAfter: s.xp,
      talentPoints: levelUps, mastery: { bike: id, before: before.mastery, after: this.bike(id).m, ups: masteryUps, points: masteryUps * D.MASTERY_POINTS_PER_LEVEL, mxpBefore: before.mxp, mxpAfter: this.bike(id).mxp },
      items, salvaged, bossWin, bikeWon, firstClear, unlockedEvents, regionUnlocked, contracts,
    };
  }

  // ------------------------------------------------------------------ contracts
  _newContract() {
    const have = new Set(this.s.contracts.map((c) => c.tpl));
    const tpl = pick(D.CONTRACTS.filter((t) => !have.has(t.id)));
    const k = clamp(this.s.level / 40, 0, 1);
    const n = Math.round(tpl.n[0] + (tpl.n[1] - tpl.n[0]) * (k * 0.7 + Math.random() * 0.3));
    const L = this.s.level;
    return { tpl: tpl.id, n, prog: 0, done: false, reward: { credits: 150 + L * 15, xp: 100 + L * 20, minRar: Math.random() < 0.25 ? 2 : 1 } };
  }
  contractText(c) { return D.CONTRACTS.find((t) => t.id === c.tpl).text.replace('{n}', c.n); }
  contracts() { return this.s.contracts.map((c, i) => ({ ...c, i, text: this.contractText(c), frac: c.prog / c.n })); }
  claim(i) {
    const c = this.s.contracts[i];
    if (!c || !c.done) return null;
    this.s.credits += c.reward.credits;
    const levelUps = this._gainXp(c.reward.xp);
    const item = this.makeItem({ ilvl: Math.max(1, this.s.level), minRar: c.reward.minRar, tier: Math.floor(this.s.level / 8) });
    if (this.s.inv.length < D.INV_MAX) this.s.inv.push(item); else { const v = this.salvageValue(item); this.s.frags += v.frags; this.s.credits += v.credits; item.salvaged = true; }
    this.s.contracts[i] = this._newContract();
    this.save();
    return { credits: c.reward.credits, xp: c.reward.xp, item, levelUps };
  }
  contractRerollCost() { return D.contractRerollCost(this.s.level); }
  rerollContract(i) {
    const cost = this.contractRerollCost();
    if (!this.s.contracts[i] || this.s.contracts[i].done || this.s.credits < cost) return false;
    this.s.credits -= cost;
    this.s.contracts[i] = this._newContract();
    this.save();
    return true;
  }
}

export const Rpg = new RpgStore();
