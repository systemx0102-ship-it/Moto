// Shared PBR material library.
import * as THREE from 'three';
import { carbonTexture, brushedTexture, leatherTexture, titaniumTexture, radiatorTexture, tireTexture } from './textures.js';

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
  chrome() {
    return get('chrome', () => new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 1, roughness: 0.06 }));
  },
  darkChrome() {
    return get('darkchrome', () => new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 1, roughness: 0.15 }));
  },
  aluminum() {
    return get('alu', () => {
      const t = brushedTexture();
      return new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.32, roughnessMap: t });
    });
  },
  anodized(color = 0x222428) {
    return get(`anod:${color}`, () => new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.38 }));
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
    return get('rubber', () => new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.92, metalness: 0 }));
  },
  tire(knobby = false) {
    return get(`tire:${knobby}`, () => new THREE.MeshStandardMaterial({ map: tireTexture(knobby), roughness: 0.88, metalness: 0 }));
  },
  plastic(color = 0x141416) {
    return get(`plastic:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 }));
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
    return get(`engine:${color}`, () => new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.42 }));
  },
  disc() {
    return get('disc', () => new THREE.MeshStandardMaterial({ color: 0xa8acb2, metalness: 1, roughness: 0.28 }));
  },
  spring(color = 0xe2b521) {
    return get(`spring:${color}`, () => new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35 }));
  },
  black() {
    return get('black', () => new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.6, metalness: 0.3 }));
  },
  screen() {
    return get('screen', () => new THREE.MeshStandardMaterial({ color: 0x050608, emissive: 0x0a1a28, emissiveIntensity: 1, roughness: 0.2 }));
  },
};
