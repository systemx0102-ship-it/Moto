// Dev-only: renders bikes from fixed angles for visual QA (?bike=id&view=side&livery=0)
// params: rider=1, speed, lean, steer, pitch, livery, cam=x,y,z, look=x,y,z, fov,
//         studio=0 (plain grey room instead of the photo studio), w/h via the shooter.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BIKES, BIKE_BY_ID } from '../bikes/catalog.js';
import { BikeModel } from '../bikes/BikeModel.js';

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(renderer);
const studio = params.get('studio') !== '0';
if (studio) {
  // photo studio: dark room lit by large softboxes (baked to PMREM for reflections),
  // seamless cyclorama, key + rim lights
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x0b0c0f);
  const box = (w, h, v, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v * 1.02), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); env.add(m);
  };
  box(5, 2, 7, [0, 4.4, 0], [Math.PI / 2, 0, 0]);
  box(0.9, 4, 5, [-3.6, 2, 1.4], [0, Math.PI / 2, 0]);
  box(0.9, 4, 5, [3.6, 2, -1.4], [0, -Math.PI / 2, 0]);
  box(6, 0.3, 3, [0, 1.3, -5], [0, 0, 0]);
  box(0.3, 6, 2.2, [0, 3, 5], [0, Math.PI, 0]);
  box(3, 1.2, 1.5, [4, 1.5, 3.5], [0, -Math.PI * 0.75, 0]);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x24262a }));
  fl.rotation.x = -Math.PI / 2; env.add(fl);
  scene.environment = pm.fromScene(env, 0.02).texture;
  scene.environmentIntensity = 1.0;
  scene.background = new THREE.Color(0x15171b);
  const R0 = 7, cove = 2.4, Hw = 8;
  const prof = [];
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * (Math.PI / 2); prof.push(new THREE.Vector2(R0 + Math.cos(a) * cove, cove + Math.sin(a) * cove)); }
  prof.push(new THREE.Vector2(R0 + cove, Hw), new THREE.Vector2(0.01, Hw + 0.5));
  const cyc = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), new THREE.MeshStandardMaterial({ color: 0x3a3d43, roughness: 0.95, side: THREE.BackSide }));
  cyc.receiveShadow = true; scene.add(cyc);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R0 + 0.2, 96), new THREE.MeshStandardMaterial({ color: 0x46494f, roughness: 0.55, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const key = new THREE.DirectionalLight(0xfff6ea, 2.4);
  key.position.set(3, 6, 4); key.castShadow = true; key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.01;
  Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 1.3); rim.position.set(-4, 3, -3); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xc8d0dc, 0x2a2622, 0.35));
} else {
  scene.background = new THREE.Color(0x30343a);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 6, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.8 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
}
const cam = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.05, 100);

const ids = (params.get('bike') || 'raptor').split(',');
const view = params.get('view') || 'side';
const liv = +(params.get('livery') || 0);
const t0 = performance.now();
const models = ids.map((id, i) => {
  const m = new BikeModel(BIKE_BY_ID[id] || BIKES[0], liv, { rider: params.get('rider') === '1' });
  scene.add(m.root);
  if (ids.length > 1) {
    const cols = Math.ceil(Math.sqrt(ids.length));
    m.root.position.set((i % cols) * 1.2 - (cols - 1) * 0.6, 0, Math.floor(i / cols) * -2.6);
  }
  m.animate({ speed: +(params.get('speed') || 0), throttle: 1, steerAngle: +(params.get('steer') || 0), lean: +(params.get('lean') || 0), pitch: +(params.get('pitch') || 0) }, 10);
  return m;
});
const buildMs = performance.now() - t0;
let tris = 0, meshes = 0, riderTris = 0;
const mats = new Set();
scene.traverse((o) => {
  if (!o.isMesh || !models.some((m) => { let p = o; while (p) { if (p === m.root) return true; p = p.parent; } return false; })) return;
  const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  tris += n; meshes++; mats.add(o.material);
  let p = o; while (p) { if (p.name === 'rider') { riderTris += n; break; } p = p.parent; }
});
const dist = ids.length > 1 ? 9 : 4.2;
const views = {
  side: [dist, 0.7, 0], other: [-dist, 0.7, 0], front34: [dist * 0.7, 1.2, dist * 0.7], rear34: [dist * 0.6, 1.3, -dist * 0.75],
  closeF: [1.6, 0.6, 1.0], front: [0, 0.8, dist], rear: [0, 0.9, -dist], top: [0.01, dist * 1.2, 0.01], low: [dist * 0.6, 0.3, dist * 0.5],
};
const p = params.get('cam') ? params.get('cam').split(',').map(Number) : views[view] || views.side;
cam.position.set(...p);
if (params.get('look')) cam.lookAt(new THREE.Vector3(...params.get('look').split(',').map(Number)));
else cam.lookAt(view === 'closeF' ? new THREE.Vector3(0, 0.4, 0.7) : new THREE.Vector3(0, 0.55, ids.length > 1 ? -2.6 : 0));
if (params.get('fov')) { cam.fov = +params.get('fov'); cam.updateProjectionMatrix(); }
// draw calls of the colour pass alone (shadow pass excluded), then the real frame
renderer.shadowMap.enabled = false;
renderer.render(scene, cam);
const colourCalls = renderer.info.render.calls;
renderer.shadowMap.enabled = true;
renderer.shadowMap.needsUpdate = true;
renderer.compile(scene, cam);
renderer.render(scene, cam);
document.title = `ok build=${buildMs.toFixed(0)}ms tris=${Math.round(tris)} riderTris=${Math.round(riderTris)} meshes=${meshes} mats=${mats.size} colourDraws=${colourCalls} draws=${renderer.info.render.calls}`;
window.__models = models;
window.__ready = true;
