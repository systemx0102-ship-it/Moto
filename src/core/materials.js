// Shared PBR material library.
import * as THREE from 'three';
import { carbonTexture, brushedTexture, leatherTexture, titaniumTexture, radiatorTexture, tireTexture, tireNormalTexture, chainTexture } from './textures.js';
import { grainSet, brushedSet, castSet, scratchRoughness, heatTint, tireSet, rep } from './pbr.js';
const N2 = (s) => new THREE.Vector2(s, s);

const lib = new Map();
function get(key, make) {
  if (!lib.has(key)) lib.set(key, make());
  return lib.get(key);
}

export const M = {
  paint(color, { metal = 0.55, rough = 0.32, clear = 1, map = null } = {}) {
    const key = `paint:${color}:${metal}:${rough}:${clear}:${map ? map.uuid : ''}`;
    return get(key, () => new THREE.MeshPhysicalMaterial({
      color: map ? 0xffffff : color, map, metalness: metal, roughness: rough, clearcoat: clear, clearcoatRoughness: 0.06,
    }));
  },
  matte(color, rough = 0.75) {
    return get(`matte:${color}:${rough}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.15 }));
  },
  // polished chrome: near mirror with polishing swirls and micro-scratches
  chrome() {
    return get('chrome', () => new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 1, roughness: 0.09, roughnessMap: rep(scratchRoughness(), 2), envMapIntensity: 1.2 }));
  },
  darkChrome() {
    return get('darkchrome', () => new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 1, roughness: 0.2, roughnessMap: rep(scratchRoughness(), 2) }));
  },
  // brushed aluminium: anisotropic highlight stretched along the brushing
  aluminum() {
    return get('alu', () => {
      const b = brushedSet();
      return new THREE.MeshPhysicalMaterial({ color: 0xcfd2d6, metalness: 1, roughness: 0.34, roughnessMap: rep(b.roughnessMap, 3, 1), normalMap: rep(b.normalMap, 3, 1), normalScale: N2(0.25), anisotropy: 0.75 });
    });
  },
  // anodised alloy: satin metallic with a fine machined grain
  anodized(color = 0x222428) {
    return get(`anod:${color}`, () => {
      const gr = grainSet(7, 96, 1.4);
      return new THREE.MeshPhysicalMaterial({ color, metalness: 0.85, roughness: 0.36, roughnessMap: rep(gr.roughnessMap, 3), normalMap: rep(gr.normalMap, 3), normalScale: N2(0.12), clearcoat: 0.25, clearcoatRoughness: 0.3 });
    });
  },
  gold() {
    return get('gold', () => new THREE.MeshStandardMaterial({ color: 0xd4a431, metalness: 1, roughness: 0.22 }));
  },
  copper() {
    return get('copper', () => new THREE.MeshStandardMaterial({ color: 0xc46a3a, metalness: 1, roughness: 0.3 }));
  },
  titanium() {
    return get('ti', () => new THREE.MeshStandardMaterial({ map: titaniumTexture(), metalness: 1, roughness: 0.25 }));
  },
  carbon() {
    return get('carbon', () => {
      const { map, normalMap } = carbonTexture();
      map.repeat.set(6, 6); normalMap.repeat.set(6, 6);
      return new THREE.MeshPhysicalMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.4, 0.4), metalness: 0.3, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 });
    });
  },
  rubber() {
    return get('rubber', () => { const gr = grainSet(3, 128, 2.5); return new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.9, metalness: 0, normalMap: rep(gr.normalMap, 3), normalScale: N2(0.5), roughnessMap: rep(gr.roughnessMap, 3) }); });
  },
  // tyre: worn contact band, swept grooves, moulded sidewall lettering in relief
  tire(knobby = false) {
    return get(`tire:${knobby}`, () => { const t = tireSet(knobby); return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: N2(1.0), roughnessMap: t.roughnessMap, roughness: 0.95, metalness: 0 }); });
  },
  // exhaust headers: brushed steel heat-coloured from the port outward (tube u = length)
  header() {
    return get('header', () => { const b = brushedSet(); return new THREE.MeshPhysicalMaterial({ map: heatTint(), metalness: 1, roughness: 0.3, normalMap: rep(b.normalMap, 1, 8), normalScale: N2(0.2), anisotropy: 0.5 }); });
  },
  chain() {
    return get('chain', () => { const t = chainTexture(); return new THREE.MeshStandardMaterial({ map: t, metalness: 0.85, roughness: 0.38 }); });
  },
  // moulded plastics: fine pebble texture, satin
  plastic(color = 0x141416) {
    return get(`plastic:${color}`, () => { const gr = grainSet(11, 160, 2); return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.02, normalMap: rep(gr.normalMap, 4), normalScale: N2(0.35), roughnessMap: rep(gr.roughnessMap, 4) }); });
  },
  leather(color = 0x2a2a2a) {
    return get(`leather:${color}`, () => {
      const { map, normalMap } = leatherTexture();
      map.repeat.set(3, 3); normalMap.repeat.set(3, 3);
      return new THREE.MeshStandardMaterial({ color, map, normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.68, metalness: 0 });
    });
  },
  glass(tint = 0x223344, opacity = 0.35) {
    return get(`glass:${tint}:${opacity}`, () => new THREE.MeshPhysicalMaterial({
      color: tint, metalness: 0, roughness: 0.03, transparent: true, opacity, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
    }));
  },
  lens() {
    return get('lens', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.02, transparent: true, opacity: 0.55, clearcoat: 1 }));
  },
  emissive(color, intensity = 3) {
    return get(`emis:${color}:${intensity}`, () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }));
  },
  radiator() {
    return get('radiator', () => {
      const t = radiatorTexture();
      t.repeat.set(3, 3);
      return new THREE.MeshStandardMaterial({ map: t, metalness: 0.6, roughness: 0.6 });
    });
  },
  engine(color = 0x2b2d31) {
    return get(`engine:${color}`, () => {
      // castings: sand-cast grain; dark ones read as satin powder coat over the casting
      const c = new THREE.Color(color);
      const dark = c.r + c.g + c.b < 0.25;
      const cs = castSet();
      return new THREE.MeshStandardMaterial({ color, metalness: dark ? 0.35 : 0.8, roughness: dark ? 0.5 : 0.4, roughnessMap: rep(cs.roughnessMap, 6), normalMap: rep(cs.normalMap, 7), normalScale: N2(dark ? 0.1 : 0.22) });
    });
  },
  disc() {
    return get('disc', () => new THREE.MeshStandardMaterial({ color: 0xa8acb2, metalness: 1, roughness: 0.28 }));
  },
  spring(color = 0xe2b521) {
    return get(`spring:${color}`, () => new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35 }));
  },
  black() {
    return get('black', () => { const gr = grainSet(11, 160, 2); return new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.58, metalness: 0.2, normalMap: rep(gr.normalMap, 4), normalScale: N2(0.3) }); });
  },
  screen() {
    return get('screen', () => new THREE.MeshStandardMaterial({ color: 0x050608, emissive: 0x0a1a28, emissiveIntensity: 1, roughness: 0.2 }));
  },
};
