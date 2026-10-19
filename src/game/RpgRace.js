// MODO LEYENDA inside a race. Race.js calls in at a few hook points; everything the
// event type changes lives here: the grid (duel rival, boss on pole, player at the
// back), the AI scaling of the event level, eliminations, the perks of the machine,
// the reference lap of time trials and the player's tracker that becomes the report
// for Rpg.finish(). The HUD reads objectives(), plate() and the feed queue.
//
// Bikes get a few extra fields here: label (display name, the boss's name), isBoss,
// out (elimination number, 1 = first out), outT / outTime / outRec / outLap.
// Result rows (Race._toResults) add: boss, eliminated, outLap.
import { BIKE_BY_ID } from '../bikes/catalog.js';
import { AIController } from './AIController.js';
import { Audio } from '../core/Audio.js';
import { formatTime } from '../core/utils.js';
import { TYPE_NAME, PERKS, XP_BONUS } from '../rpg/data.js';

const DIFF_K = { facil: 0.97, normal: 1, mitico: 1.02 };
const SKILL_CAP = 1.02;
const OUT_BLINK = 1.2;      // s an eliminated bike blinks before it disappears
const PLAYER_OUT_END = 2.5; // s on screen after the player is eliminated, then results
const PASS_HYST = 1.2;      // m either side before a pass counts (no side-by-side flicker)

export class RpgRace {
  constructor(race) {
    this.race = race;
    this.rpg = race.cfg.rpg;
    this.type = this.rpg.type;
    this.perks = new Set(this.rpg.perf.perks || []);
    this.diffK = DIFF_K[race.cfg.difficulty] ?? 1;
    this.elims = 0;
    this.feed = [];          // {kind: 'xp'|'perk'|'obj', text, sub} consumed by the HUD
    this.bulletin = null;    // {name, lap, t} last elimination, shown by the HUD for a few seconds
    this.danger = false;     // player last in the final quarter of a lap that eliminates
    this.t = { overtakes: 0, driftS: 0, nitroS: 0, airS: 0, crashes: 0, topKmh: 0 };
    this.boostT = { deriva: 0, relampago: 0 };
    this._ahead = new Map();
    this._done = [];
  }

  // ------------------------------------------------------------------ grid
  // Entrants from pole to the back: [{spec, livery, player, role?, label?}].
  // others: every other model, shuffled; n: rivals from the config.
  entrants(pSpec, livery, others, n, r) {
    const rpg = this.rpg, P = { spec: pSpec, livery, player: true };
    const rnd = (spec) => ({ spec, livery: Math.floor(r() * 3) % spec.liveries.length, player: false });
    if (this.type === 'duelo') {
      // one rival, front row next to the player; a different livery if it is the same model
      const spec = BIKE_BY_ID[rpg.rival] || others[0];
      const e = { ...rnd(spec), role: 'rival' };
      if (spec.id === pSpec.id && e.livery === livery) e.livery = (livery + 1) % spec.liveries.length;
      return [e, P];
    }
    if (this.type === 'jefe' && rpg.boss) {
      const spec = BIKE_BY_ID[rpg.boss.bike] || others[0];
      const boss = { spec, livery: rpg.boss.livery % spec.liveries.length, player: false, role: 'boss', label: rpg.boss.name };
      const escort = others.filter((s) => s.id !== spec.id).slice(0, Math.max(0, n - 1)).map(rnd);
      return [boss, ...escort, P];
    }
    // carrera / eliminacion: the player starts at the back
    return [...others.slice(0, n).map(rnd), P];
  }

  // event scaling on top of the usual balancing against the player's stock machine
  tuneAI(e, perf) {
    const ai = this.rpg.ai;
    let k = { power: ai.power, top: ai.top, grip: ai.grip };
    if (e.role === 'boss') { const bp = this.rpg.boss.perf || {}; k = { power: k.power * (bp.power ?? 1), top: k.top * (bp.top ?? 1), grip: k.grip * (bp.grip ?? 1) }; }
    if (e.role === 'rival') k = { power: k.power * 1.03, top: k.top * 1.03, grip: k.grip * 1.03 };
    perf.power *= k.power; perf.top *= k.top; perf.grip *= k.grip;
  }

  aiSkill(e, r) {
    if (e.role === 'boss') return Math.min(SKILL_CAP, this.diffK);
    return Math.min(SKILL_CAP, this.rpg.ai.skill * this.diffK * (0.975 + r() * 0.05));
  }

  // after the bikes exist
  setup() {
    const race = this.race, P = race.player;
    this.boss = race.bikes.find((b) => b.isBoss) || null;
    this.rival = this.type === 'duelo' ? race.bikes.find((b) => !b.isPlayer) || null : null;
    // reference lap: the ideal lap of the player's machine (AI target speeds at skill 1).
    // The constructor only builds the profile, it does not touch the bike.
    const prof = new AIController(P.phys, race.track, { skill: 1, wet: !!(race.env.wet || race.env.snow) }).profile;
    let t = 0;
    for (let i = 0; i < prof.length; i++) t += race.track.ds / Math.max(5, prof[i]);
    this.refLap = t;
    this.objs = this.rpg.objectives.map((o) => ({ ...o, state: 'pending' }));
  }

  // sub line of the finish message in time trials and drift challenges
  trialSummary() {
    const P = this.race.player;
    return this.type === 'derrape' ? `Derrape total ${this.t.driftS.toFixed(1)} s` : `Mejor vuelta ${formatTime((P.bestLap || 0) * 1000)}`;
  }

  introText() {
    const race = this.race, laps = race.laps, type = TYPE_NAME[this.type];
    // the type goes in the sub line unless the event is simply named after it
    const sub = [type.toLowerCase() === this.rpg.name.toLowerCase() ? `Nivel ${this.rpg.level}` : type, race.track.def.name, `${laps} ${laps === 1 ? 'vuelta' : 'vueltas'}`];
    return [this.rpg.name, sub.join(' · ').toUpperCase()];
  }

  // ------------------------------------------------------------------ frame
  // Called by Race.update after laps and standings, before the events are consumed.
  update(dt) {
    const race = this.race, P = race.player, ph = P.phys;
    const live = race.phase === 'race' && !P.finished && !P.out;
    if (race.phase === 'race' && !this.started) { this.started = true; this._green(); }
    for (const b of race.bikes) {
      for (const e of b.phys.events) {
        if (e.type === 'crash') { b.crashAt = race.time; if (b === P) this._crash(live); }
        if (b !== P) continue;
        if (e.type === 'drift') this._drift(e.t);
        else if (e.type === 'land' && e.air > 0.3 && live) { this.t.airS += e.air; if (e.air > 0.6) this.feed.push({ kind: 'xp', text: `Salto ${e.air.toFixed(1)} s` }); }
      }
    }
    if (live) {
      if (ph.drifting && !ph.crashed) this.t.driftS += dt;
      if (ph.nitroOn) this.t.nitroS += dt;
      this.t.topKmh = Math.max(this.t.topKmh, ph.v * 3.6);
      if (race.time > 3) this._passes(); else this._ahead.clear();
    }
    if (this.type === 'eliminacion') this._eliminations(dt);
    for (const b of race.bikes) if (b.out) b.outT += dt;
    if (this.bulletin && (this.bulletin.t -= dt) <= 0) this.bulletin = null;
    this._boost(dt);
    this._objectives();
    if (this.playerOutT !== undefined && race.phase !== 'results') {
      this.playerOutT += dt;
      if (this.playerOutT > PLAYER_OUT_END) race._toResults();
    }
  }

  // eliminated bikes blink, then disappear
  visible(b) { return b.outT < OUT_BLINK && Math.floor(b.outT * 8) % 2 === 0; }

  _perk(id, sub) {
    this.feed.push({ kind: 'perk', text: PERKS[id].name, sub });
  }

  _green() {
    if (this.perks.has('relampago')) {
      this.race.player.phys.nitro = 1;
      this.boostT.relampago = 4;
      this._perk('relampago', 'Nitro lleno · +10 % de potencia');
    }
  }

  _crash(live) {
    const ph = this.race.player.phys;
    if (live) this.t.crashes++;
    if (this.perks.has('fenix') && !this._fenix) {
      // respawn() runs at crashT > 1.8: start the clock so it comes ~0.6 s after the fall
      this._fenix = true;
      ph.crashT = Math.max(ph.crashT, 1.2);
      this._perk('fenix', 'De vuelta en pista al instante');
    }
  }

  _drift(t) {
    if (this.race.phase !== 'race' || this.race.player.finished) return;
    this.feed.push({ kind: 'xp', text: `Derrape ${t.toFixed(1)} s`, xp: Math.round(t * XP_BONUS.driftS) });
    if (this.perks.has('deriva')) { this.boostT.deriva = 3; this._perk('deriva', '+8 % de potencia · 3 s'); }
  }

  // perks that push the drive force; recomputed every frame so they never stack up
  _boost(dt) {
    const race = this.race, P = race.player;
    let k = 1;
    for (const id of ['deriva', 'relampago']) {
      if (this.boostT[id] > 0) { this.boostT[id] -= dt; k *= id === 'deriva' ? 1.08 : 1.1; }
    }
    const last = race.phase === 'race' && !P.finished && !P.out && P.phys.lap === race.laps - 1;
    if (this.perks.has('instinto') && last) {
      k *= 1.06;
      if (!this._instinto) { this._instinto = true; this._perk('instinto', '+6 % de potencia en la última vuelta'); }
    }
    P.phys.boost = k;
  }

  // overtakes on track: a rival that was ahead (by more than the hysteresis) is now behind
  _passes() {
    const race = this.race, P = race.player, now = race.time;
    for (const b of race.active) {
      if (b === P) continue;
      const d = b.phys.dist - P.phys.dist;
      const was = this._ahead.get(b);
      if (was === undefined) { this._ahead.set(b, d > 0); continue; }
      if (was && d < -PASS_HYST) {
        this._ahead.set(b, false);
        // a rival that just fell over or dropped out isn't an overtake
        if (b.finished || (b.crashAt !== undefined && now - b.crashAt < 2) || b.phys.crashed) continue;
        this.t.overtakes++;
        this.feed.push({ kind: 'xp', text: 'Adelantamiento', xp: XP_BONUS.overtake });
        if (this.perks.has('sed')) { P.phys.nitro = Math.min(1, P.phys.nitro + 0.1); this._perk('sed', '+10 % de nitro'); }
      } else if (!was && d > PASS_HYST) this._ahead.set(b, true);
    }
  }

  // ------------------------------------------------------------------ eliminations
  // Each time the leader completes lap k (k < laps) the last bike still running is out.
  _eliminations() {
    const race = this.race, P = race.player;
    let leaderLap = 0, leader = null;
    for (const b of race.active) if (!leader || b.phys.dist > leader.phys.dist) leader = b;
    for (const b of race.active) leaderLap = Math.max(leaderLap, b.phys.lap);
    const cuts = Math.min(leaderLap, race.laps - 1);
    while (this.elims < cuts) {
      let last = null;
      for (const b of race.active) if (!b.finished && (!last || b.phys.dist < last.phys.dist)) last = b;
      if (!last || race.active.length <= 2) break;
      this._eliminate(last, this.elims + 1);
    }
    // warning: last in the final quarter of a lap whose end eliminates
    const runners = race.active.filter((b) => !b.finished);
    const lastNow = runners.reduce((a, b) => (!a || b.phys.dist < a.phys.dist ? b : a), null);
    const cutting = leader && leader.phys.lap + 1 <= race.laps - 1 && leader.phys.lap >= 0;
    const danger = race.phase === 'race' && !P.out && cutting && lastNow === P && runners.length > 2 && leader.phys.s / race.track.L > 0.75;
    if (danger && !this.danger) Audio.warn();
    this.danger = danger;
  }

  _eliminate(b, k) {
    const race = this.race, ph = b.phys;
    b.out = k; b.outT = 0; b.outTime = race.time; b.outRec = race.recorder.duration; b.outLap = k;
    race.active = race.active.filter((x) => x !== b);
    // freeze it where it is
    ph.v = 0; ph.nitroOn = false; ph.drifting = false; ph.draft = 0;
    Object.assign(ph.input, { throttle: 0, brake: 0, steer: 0, rearBrake: 0, nitro: false, wheelie: false });
    race.effects.skidBreak(b.id + 'r'); race.effects.skidBreak(b.id + 'f');
    const v = race.voices && race.voices.get(b);
    if (v) { v.stop(); race.voices.delete(b); }
    this.elims++;
    this._ahead.delete(b);
    this.bulletin = { name: b.label || b.spec.name, lap: k, t: 3.2 };
    if (b.isPlayer) {
      race.hud.message('Eliminado', 'Fin de la prueba', PLAYER_OUT_END * 1000, 'hud-warn');
      race.silence();
      Audio.warn();
      this.playerOutT = 0;
      this.danger = false;
    } else Audio.impact(0.4);
  }

  // ------------------------------------------------------------------ live state
  _pos() { return this.race.order.indexOf(this.race.player) + 1; }

  // estimated finish time of a bike (as Race._toResults estimates bikes still running)
  _eta(b) {
    const race = this.race;
    if (b.finished) return b.finishTime;
    // pace (s/m) of the player if finished, else of the first finisher, else of the leader so far
    const P = race.player, ref = P.finished ? P : race.finishOrder[0], len = race.laps * race.track.L;
    const pace = ref ? ref.finishTime / Math.max(1, len) : race.time / Math.max(1, ...race.active.map((x) => x.phys.dist));
    return race.time + Math.max(0, len - b.phys.dist) * pace * 1.035;
  }

  // seconds the player leads `o` by (negative when behind)
  gapTo(o) {
    const race = this.race, P = race.player;
    if (!o) return 0;
    if (P.finished || o.finished) return this._eta(o) - this._eta(P);
    const d = P.phys.dist - o.phys.dist;
    return d >= 0 ? d / Math.max(15, o.phys.v) : d / Math.max(15, P.phys.v);
  }

  _objectives() {
    const race = this.race, P = race.player, t = this.t;
    const fin = P.finished && !P.out;
    const over = P.finished || !!P.out || race.phase === 'results';
    const fpos = fin ? race.finishOrder.indexOf(P) + 1 : 0;
    this.objs.forEach((o, i) => {
      let st = 'pending';
      switch (o.kind) {
        case 'pos': case 'win': { const n = o.kind === 'win' ? 1 : o.n; st = fin ? (fpos <= n ? 'done' : 'failed') : P.out ? 'failed' : 'pending'; break; }
        case 'boss': {
          const B = this.boss;
          if (P.out) st = 'failed';
          else if (B && B.finished && (!P.finished || B.finishTime < P.finishTime)) st = 'failed';
          else if (fin) st = 'done';
          break;
        }
        case 'noCrash': st = t.crashes ? 'failed' : fin ? 'done' : 'pending'; break;
        case 'survive': st = P.out ? 'failed' : fin ? 'done' : 'pending'; break;
        case 'lap': st = P.bestLap > 0 && P.bestLap <= this.refLap * o.k ? 'done' : over ? 'failed' : 'pending'; break;
        case 'drift': st = t.driftS >= o.s ? 'done' : over ? 'failed' : 'pending'; break;
        case 'overtakes': st = t.overtakes >= o.n ? 'done' : over ? 'failed' : 'pending'; break;
        case 'margin': {
          if (P.out || (fin && fpos > 1)) { st = 'failed'; break; }
          if (!fin) break;
          const second = race.finishOrder[1];
          if (second) st = second.finishTime - P.finishTime >= o.s ? 'done' : 'failed';
          else if (race.time - P.finishTime >= o.s) st = 'done';
          break;
        }
        default: break;
      }
      if (st !== o.state) {
        if (st === 'done' && !this._done[i]) { this._done[i] = true; this.feed.push({ kind: 'obj', text: 'Objetivo cumplido', sub: this.objText(o) }); Audio.select(); }
        o.state = st;
      }
    });
  }

  objText(o) {
    if (o.kind === 'lap') return `Vuelta en menos de ${formatTime(this.refLap * o.k * 1000)}`;
    return o.text;
  }

  // HUD rows: [{text, state, value, frac (0..1 bar or null), on (currently meeting it)}]
  objectives() {
    const race = this.race, P = race.player, t = this.t, pos = this._pos();
    return this.objs.map((o) => {
      let value = '', frac = null, on = false;
      switch (o.kind) {
        case 'pos': case 'win': { const n = o.kind === 'win' ? 1 : o.n; value = P.out ? 'FUERA' : `P${pos}`; on = !P.out && pos <= n; break; }
        case 'boss': { const g = this.gapTo(this.boss); value = `${g >= 0 ? '+' : '−'}${Math.abs(g).toFixed(1)} s`; on = g >= 0; break; }
        case 'noCrash': value = t.crashes ? `${t.crashes} ${t.crashes === 1 ? 'caída' : 'caídas'}` : ''; break;
        case 'survive': value = P.out ? 'FUERA' : `P${pos}`; on = !P.out && pos < race.active.length; break;
        case 'lap': value = P.bestLap ? formatTime(P.bestLap * 1000) : '—'; on = P.bestLap > 0 && P.bestLap <= this.refLap * o.k; break;
        case 'drift': value = `${t.driftS.toFixed(1)} / ${o.s} s`; frac = Math.min(1, t.driftS / o.s); on = frac >= 1; break;
        case 'overtakes': value = `${t.overtakes} / ${o.n}`; frac = Math.min(1, t.overtakes / o.n); on = frac >= 1; break;
        case 'margin': { if (pos === 1 && !P.out) { const second = race.order[1]; const g = second ? this.gapTo(second) : 0; value = `+${g.toFixed(1)} s`; on = g >= o.s; } else value = '—'; break; }
        default: break;
      }
      return { text: this.objText(o), state: o.state, value, frac, on };
    });
  }

  // top-centre plate: {cls, kicker, name, label, value}; null when the event has none
  plate() {
    const race = this.race, P = race.player;
    if (this.boss || this.rival) {
      const o = this.boss || this.rival, g = this.gapTo(o), lead = g >= 0 ? ' lead' : '';
      const value = `${Math.abs(g).toFixed(1)} s`, label = g >= 0 ? 'Ventaja' : 'Diferencia';
      if (this.boss) return { cls: 'boss' + lead, kicker: this.rpg.boss.title, name: this.rpg.boss.name, label, value };
      return { cls: 'rival' + lead, kicker: 'Duelo', name: o.spec.name, label, value };
    }
    if (this.type === 'eliminacion') {
      if (this.bulletin) return { cls: 'elim out', kicker: `Fin de la vuelta ${this.bulletin.lap}`, name: this.bulletin.name, label: '', value: 'Eliminado' };
      if (this.danger) return { cls: 'elim danger', kicker: 'Eliminación', name: 'Último puesto — riesgo de eliminación', label: '', value: '' };
      const lead = race.order[0];
      const lap = lead ? Math.max(1, lead.phys.lap + 1) : 1;
      const more = lap <= race.laps - 1 && !P.out;
      return { cls: 'elim', kicker: 'Eliminación', name: `${race.active.length} en pista`, label: more ? 'Cae el último' : 'Última vuelta', value: more ? `Fin vuelta ${lap}` : 'Sin cortes' };
    }
    return null;
  }

  // ------------------------------------------------------------------ report
  // For Rpg.finish(). completed: the event reached the results normally.
  report() {
    const race = this.race, P = race.player, t = this.t;
    const pos = this._pos();
    let margin = 0;
    if (pos === 1 && !P.out) {
      const second = race.order.find((b) => b !== P && !b.out);
      margin = second ? Math.max(0, this._eta(second) - this._eta(P)) : 0;
    }
    const beatBoss = !!this.boss && !P.out && this._eta(P) < this._eta(this.boss);
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      eventId: this.rpg.eventId, completed: race.phase === 'results', pos, total: race.bikes.length, eliminated: !!P.out,
      beatBoss, margin: r2(margin), bestLap: r2(P.bestLap || 0), refLap: r2(this.refLap),
      driftS: r2(t.driftS), overtakes: t.overtakes, nitroS: r2(t.nitroS), airS: r2(t.airS), crashes: t.crashes,
      topKmh: Math.round(t.topKmh), km: Math.round(Math.max(0, P.phys.dist) / 10) / 100,
    };
  }
}
