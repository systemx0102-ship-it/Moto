// Dev-only: renders bikes from fixed angles for visual QA (?bike=id&view=side&livery=0)
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
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x30343a);
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 6, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.8 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
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
let tris = 0;
scene.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
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
renderer.render(scene, cam);
document.title = `ok build=${buildMs.toFixed(0)}ms tris=${tris} draws=${renderer.info.render.calls}`;
window.__models = models;
window.__ready = true;
