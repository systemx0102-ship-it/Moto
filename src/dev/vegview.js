// Dev-only: inspect vegetation models (?kind=fir&n=5)
import * as THREE from 'three';
import { Engine } from '../core/Engine.js';
import { Save } from '../core/Settings.js';
import { SPECIES, addWind } from '../track/Vegetation.js';
import { leafClusterTexture, firFrondTexture, pineTuftTexture, palmFrondTexture, barkTexture, grassTexture, fernTexture } from '../track/vegTextures.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

const P = new URLSearchParams(location.search);
Save.settings.quality = P.get('q') || 'alto';
const engine = new Engine(document.getElementById('stage'));
const scene = new THREE.Scene();
const sky = new Sky(); sky.scale.setScalar(1000); scene.add(sky);
const u = sky.material.uniforms; u.turbidity.value = 3; u.rayleigh.value = 2; u.sunPosition.value.set(0.4, 0.6, 0.5);
const pm = new THREE.PMREMGenerator(engine.renderer);
scene.environment = pm.fromScene((() => { const s = new THREE.Scene(); const k = new Sky(); k.scale.setScalar(100); k.material.uniforms.sunPosition.value.set(0.4, 0.6, 0.5); s.add(k); return s; })()).texture;
scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x6a5a40, 0.9));
const sun = new THREE.DirectionalLight(0xfff4e6, 3); sun.position.set(20, 30, 25); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 }); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x4a6a30, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const kind = P.get('kind') || 'fir';
const n = +(P.get('n') || 4);
const mk = {
  fir: [(s) => SPECIES.firTree(s, false), firFrondTexture(false, 3), 'pine'],
  firsnow: [(s) => SPECIES.firTree(s, true), firFrondTexture(true, 2), 'pine'],
  oak: [(s) => SPECIES.broadleafTree(s, 'oak'), leafClusterTexture('oak', 1), 'oak'],
  beech: [(s) => SPECIES.broadleafTree(s, 'beech'), leafClusterTexture('beech', 7), 'oak'],
  birch: [(s) => SPECIES.broadleafTree(s, 'birch'), leafClusterTexture('birch', 8), 'birch'],
  pine: [(s) => SPECIES.pineTree(s), pineTuftTexture(3), 'pine'],
  palm: [(s) => SPECIES.palmTree(s), palmFrondTexture(4), 'palm'],
}[kind];
const leafMat = addWind(new THREE.MeshStandardMaterial({ map: mk[1], alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82, alphaToCoverage: true, vertexColors: true }), 0.25);
const bk = barkTexture(mk[2]);
const barkMat = new THREE.MeshStandardMaterial({ map: bk.map, normalMap: bk.normalMap, roughness: 0.9 });
let H = 10;
for (let i = 0; i < n; i++) {
  const m = mk[0](100 + i * 17);
  H = m.height;
  const b = new THREE.Mesh(m.bark, barkMat), l = new THREE.Mesh(m.leaves, leafMat);
  b.castShadow = l.castShadow = true;
  const g = new THREE.Group(); g.add(b, l);
  g.position.set((i - (n - 1) / 2) * 9, 0, 0);
  scene.add(g);
}
if (P.get('imp')) {
  const m = mk[0](100);
  const imp = SPECIES.bakeImpostor(engine.renderer, [new THREE.Mesh(m.bark, barkMat), new THREE.Mesh(m.leaves, leafMat)], m.height);
  const im = new THREE.Mesh(SPECIES.impostorGeo(imp.w, imp.h), new THREE.MeshStandardMaterial({ map: imp.tex, alphaTest: 0.5, side: THREE.DoubleSide }));
  im.position.set(n * 4.5 + 2, 0, 0); scene.add(im);
}
engine.setScene(scene, engine.camera);
engine.camera.position.set(0, H * 0.45, n * 7 + 6); engine.camera.lookAt(0, H * 0.45, 0);
engine.camera.fov = 50; engine.camera.updateProjectionMatrix();
engine.setBloom(0.2, 0.4, 1.4);
engine.renderer.toneMappingExposure = 0.6;
engine.render(); engine.render();
document.title = 'ok';
window.__ready = true;
void grassTexture; void fernTexture;
