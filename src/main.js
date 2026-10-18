// MOTO MÍTICO — entry point and game state machine.
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { Audio } from './core/Audio.js';
import { Save } from './core/Settings.js';
import { GarageScene } from './scenes/GarageScene.js';
import { UI } from './ui/UI.js';
import { Race } from './game/Race.js';
import { BIKES, BIKE_BY_ID } from './bikes/catalog.js';
import { TRACKS, TRACK_BY_ID } from './track/catalog.js';
import { Rpg } from './rpg/Rpg.js';
import { roadTextures, groundTextures, tireTexture, carbonTexture, leatherTexture } from './core/textures.js';
import { nextFrame, sleep } from './core/utils.js';

class Game {
  constructor() {
    this.engine = new Engine(document.getElementById('stage'));
    this.engine.adaptive = true;
    this.ui = new UI(this);
    this.race = null;
    this.state = 'boot';
  }

  async boot() {
    const fill = document.getElementById('boot-fill');
    const msg = document.getElementById('boot-msg');
    const step = async (p, m) => { fill.style.width = `${p}%`; if (m) msg.textContent = m; await nextFrame(); };
    await step(5, 'Cargando tipografías…');
    try {
      const want = ['700 20px "Barlow Condensed"', '600 20px "Barlow Condensed"', '500 20px "Barlow Condensed"', '400 16px Barlow', '600 16px Barlow'];
      await Promise.race([Promise.all(want.map((f) => document.fonts?.load(f))), sleep(1500)]);
      await Promise.race([document.fonts?.ready, sleep(1500)]);
    } catch (e) { /* ignore */ }
    await step(20, 'Fabricando neumáticos…');
    tireTexture(false); tireTexture(true);
    await step(35, 'Tejiendo fibra de carbono…');
    carbonTexture(); leatherTexture();
    await step(50, 'Construyendo el garaje…');
    this.garage = new GarageScene(this.engine);
    const bike = BIKE_BY_ID[Save.data.garage.bike] || BIKES[0];
    this.garage.setBike(bike, Save.data.garage.livery[bike.id] ?? 0);
    await step(75, 'Calentando motores…');
    this.garage.activate();
    this.engine.renderer.compile(this.garage.scene, this.garage.camera);
    await step(100, 'Listo');
    this.engine.onUpdate = (dt) => this.update(dt);
    this.engine.onError = (e) => { if (!this._errShown) { this._errShown = true; console.error(e); } };
    this.engine.start();
    document.getElementById('boot').classList.add('hide');
    this.state = 'menu';
    this.ui.mainMenu();
    // audio needs a user gesture
    const unlock = () => { Audio.init(); Audio.playMusic(this.race ? 'race' : 'menu'); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.__game = this;
    window.__ready = true;
  }

  update(dt) {
    Input.update(dt);
    if (this.state === 'race' && this.race) {
      this.race.update(dt);
    } else {
      this.garage.update(dt);
    }
    this.ui.update(dt);
  }

  applyQuality() {
    this.engine.applyQuality();
    if (this.state === 'race' && this.race) this.engine.setScene(this.race.scene, this.engine.camera);
    else this.garage.activate();
  }

  // ------------------------------------------------------------- races
  async startRace(cfg) {
    if (this._loading) return;
    this._loading = true;
    this.lastCfg = cfg;
    Audio.init();
    Audio.stopMusic();
    const progress = this.ui.loading(cfg.trackDef, cfg);
    await sleep(120);
    this.garage.deactivate();
    try {
      if (this.race) { this.race.dispose(); this.race = null; }
      const race = new Race(this, cfg);
      await race.load((p, m) => progress(p, m));
      this.race = race;
      this.state = 'race';
      this.ui.hideScreens();
      this.engine.setScene(race.scene, this.engine.camera);
      race.start();
    } catch (e) {
      console.error(e);
      this.ui.error(e);
    }
    this._loading = false;
  }

  // Modo Leyenda: launch an event of the region map with the active machine
  startRpgEvent(eventId) {
    this.startRace(Rpg.raceConfig(eventId));
  }

  restartRace() {
    if (!this.lastCfg) return;
    const cfg = { ...this.lastCfg, seed: (this.lastCfg.seed || 1) + 1 };
    this.startRace(cfg);
  }

  exitRace() {
    if (this.race) { this.race.dispose(); this.race = null; }
    this.state = 'menu';
    this.garage.clearPodium();
    const bike = BIKE_BY_ID[Save.data.garage.bike] || BIKES[0];
    this.garage.setBike(bike, Save.data.garage.livery[bike.id] ?? 0);
    this.garage.activate();
    this.engine.renderer.toneMappingExposure = 1;
    this.ui.mainMenu();
  }

  onRaceFinished(race, results) {
    // stats
    const st = Save.data.stats;
    st.km = (st.km || 0) + (race.player.phys.dist > 0 ? race.player.phys.dist / 1000 : 0);
    st.topSpeed = Math.max(st.topSpeed || 0, race.player.phys.topSpeedSeen * 3.6);
    let champInfo = null;
    if (race.mode === 'champ' && Save.data.champ) {
      const c = Save.data.champ;
      for (const r of results) c.points[r.bikeId] = (c.points[r.bikeId] || 0) + r.points;
      c.results.push(results.map((r) => ({ bikeId: r.bikeId, pos: r.pos })));
      c.round++;
      champInfo = { round: c.round, next: c.round < TRACKS.length, done: c.round >= TRACKS.length };
      if (champInfo.done) c.done = true;
    }
    Save.save();
    this._lastResults = results;
    this._lastChamp = champInfo;
    // podium scene with the top three
    this.state = 'results';
    this.engine.renderer.toneMappingExposure = 1;
    const top3 = results.slice(0, 3).map((r) => ({ spec: BIKE_BY_ID[r.bikeId], livery: r.livery }));
    this.garage.setPodium(top3);
    this.garage.setMode('podium');
    this.garage.activate();
    Audio.playMusic('podium');
    this.ui.results(race, results, champInfo);
  }

  watchReplay() {
    if (!this.race) return;
    this.state = 'race';
    this.engine.setScene(this.race.scene, this.engine.camera);
    this.garage.deactivate();
    this.race.startReplay();
    this.ui.replayOverlay();
    Audio.playMusic('race');
  }

  endReplay() {
    if (!this.race) return;
    this.race.stopReplay();
    this.state = 'results';
    this.garage.activate();
    Audio.playMusic('podium');
    this.ui.results(this.race, this._lastResults, this._lastChamp);
  }

  // ------------------------------------------------------------- championship
  champStart() {
    const ids = BIKES.map((b) => b.id);
    Save.data.champ = {
      bike: Save.data.garage.bike, livery: Save.data.garage.livery[Save.data.garage.bike] ?? 0, difficulty: Save.settings.difficulty,
      round: 0, points: Object.fromEntries(ids.map((id) => [id, 0])), results: [], done: false, seed: Math.floor(Math.random() * 1e6),
    };
    Save.save();
    this.champRace();
  }

  champRace() {
    const c = Save.data.champ;
    if (!c) return;
    const def = TRACKS[c.round];
    // grid: reverse championship order for the player (leader starts mid-pack)
    const standings = Object.entries(c.points).sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const myPos = standings.indexOf(c.bike);
    this.startRace({ mode: 'champ', trackDef: def, bikeId: c.bike, livery: c.livery, laps: Math.min(Save.settings.laps, def.laps || 3), rivals: 11, difficulty: c.difficulty, seed: c.seed + c.round, gridSlot: c.round === 0 ? 8 : Math.min(11, 4 + Math.floor(myPos / 2)) });
  }

  champNext() {
    if (this.race) { this.race.dispose(); this.race = null; }
    this.champRace();
  }

  champFinal() {
    if (this.race) { this.race.dispose(); this.race = null; }
    const c = Save.data.champ;
    this.state = 'results';
    const rows = Object.entries(c.points).sort((a, b) => b[1] - a[1]).slice(0, 3);
    this.garage.setPodium(rows.map(([id]) => ({ spec: BIKE_BY_ID[id], livery: id === c.bike ? c.livery : 0 })));
    this.garage.setMode('podium');
    this.garage.activate();
    this.ui.champFinal(c);
  }
}

window.addEventListener('error', (e) => { console.error(e.error || e.message); });
const game = new Game();
game.boot().catch((e) => { console.error(e); const m = document.getElementById('boot-msg'); if (m) m.textContent = 'Error: ' + e.message; });
void TRACK_BY_ID; void roadTextures; void groundTextures;
