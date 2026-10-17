// Dev-only: render a track from a camera placed on the circuit (?track=gp&s=100&h=3&back=12&q=alto)
import * as THREE from 'three';
import { Engine } from '../core/Engine.js';
import { Save } from '../core/Settings.js';
import { TRACK_BY_ID } from '../track/catalog.js';
import { TrackScene } from '../scenes/TrackScene.js';
import { BIKES } from '../bikes/catalog.js';
import { BikeModel } from '../bikes/BikeModel.js';

(async () => {
const P = new URLSearchParams(location.search);
if (P.get('q')) Save.settings.quality = P.get('q');
const engine = new Engine(document.getElementById('stage'));
const t0 = performance.now();
const ts = await TrackScene.create(engine, TRACK_BY_ID[P.get('track') || 'gp']);
const buildMs = performance.now() - t0;
engine.setScene(ts.scene, engine.camera);
engine.camera.fov = 62; engine.camera.far = 6000; engine.camera.updateProjectionMatrix();
const s = +(P.get('s') || 30);
const p = ts.track.pointAt(s, +(P.get('d') || 0));
// put a few bikes on track
const nb = +(P.get('bikes') || 3);
for (let i = 0; i < nb; i++) {
  const b = new BikeModel(BIKES[i % BIKES.length], 0);
  const q = ts.track.pointAt(s + 6 + i * 5, (i % 2 ? 2 : -2));
  b.root.position.set(q.x, q.y, q.z);
  b.root.rotation.y = q.heading;
  b.animate({ speed: 0, lean: i === 1 ? -0.3 : 0 }, 0);
  ts.scene.add(b.root);
}
const back = +(P.get('back') || 8), h = +(P.get('h') || 2.5);
const cp = ts.track.pointAt(s - back, +(P.get('d') || 0));
if (P.get('aerial')) {
  const b = ts.track.bounds;
  engine.camera.position.set(b.cx + b.size * 0.3, b.size * 0.75, b.cz - b.size * 0.7);
  engine.camera.lookAt(b.cx, 0, b.cz);
} else {
  engine.camera.position.set(cp.x, cp.y + h, cp.z);
  const la = ts.track.pointAt(s + 20, 0);
  engine.camera.lookAt(la.x, la.y + 1, la.z);
}
ts.update(0.016, engine.camera, new THREE.Vector3(p.x, p.y, p.z));
engine.resize();
engine.render();
engine.render();
document.title = `ok build=${buildMs.toFixed(0)}ms calls=${engine.renderer.info.render.calls} tris=${engine.renderer.info.render.triangles} L=${ts.track.L.toFixed(0)}`;
window.__ready = true;
})().catch((e) => { document.title = 'ERR ' + e.message; console.error(e); window.__ready = true; });
