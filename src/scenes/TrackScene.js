// Assembles a full race environment: road, terrain, sky/weather, scenery.
import * as THREE from 'three';
import { Track } from '../track/Track.js';
import { Terrain } from '../track/Terrain.js';
import { Environment } from '../track/Environment.js';
import { Scenery } from '../track/Scenery.js';
import { Save } from '../core/Settings.js';
import { nextFrame } from '../core/utils.js';
import { waterNormalTexture } from '../core/textures.js';

export class TrackScene {
  static async create(engine, def, onProgress = () => {}) {
    const ts = new TrackScene();
    ts.engine = engine;
    ts.def = def;
    const q = Save.quality;
    ts.scene = new THREE.Scene();
    onProgress(0.05, 'Trazando circuito…');
    await nextFrame();
    ts.track = new Track(def);
    ts.scene.add(ts.track.build(q));
    onProgress(0.25, 'Modelando terreno…');
    await nextFrame();
    ts.terrain = new Terrain(ts.track, q);
    ts.scene.add(ts.terrain.build());
    onProgress(0.45, 'Generando cielo y clima…');
    await nextFrame();
    ts.env = new Environment(engine, ts.scene, ts.track, q);
    onProgress(0.6, 'Plantando escenario…');
    await nextFrame();
    ts.scenery = new Scenery(ts.track, ts.terrain, q);
    ts.scene.add(ts.scenery.build());
    ts.env.setLamps(ts.scenery.lamps);
    if (ts.terrain.waterMat) {
      const wn = waterNormalTexture();
      wn.repeat.set(220, 220);
      ts.terrain.waterMat.normalMap = wn;
      ts.terrain.waterMat.normalScale = new THREE.Vector2(0.35, 0.35);
      ts.terrain.waterMat.needsUpdate = true;
      ts.waterNormal = wn;
    }
    onProgress(0.75, 'Compilando sombreadores…');
    await nextFrame();
    return ts;
  }

  update(dt, camera, focus) {
    this.env.update(dt, camera, focus);
    if (this.waterNormal) { this.waterNormal.offset.x += dt * 0.004; this.waterNormal.offset.y += dt * 0.0025; }
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
    this.env.dispose();
  }
}
