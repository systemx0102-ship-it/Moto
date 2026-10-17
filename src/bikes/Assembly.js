// Bike assembly: articulated groups (steering, suspension, wheels) whose parts
// are authored in "bike space" (x forward, y up, z right, ground at y=0) and
// merged per material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();

export class Assembly {
  constructor() {
    this.inner = new THREE.Group(); // bike space
    this.groups = {};
    this.buckets = new Map(); // groupName -> Map(material -> geo[])
    this.inverse = {};
    this.addGroup('chassis', this.inner);
  }

  addGroup(name, parent, position = [0, 0, 0], rotation = [0, 0, 0]) {
    const g = name === 'chassis' ? new THREE.Group() : new THREE.Group();
    g.name = name;
    g.position.set(...position);
    g.rotation.set(...rotation);
    (typeof parent === 'string' ? this.groups[parent] : parent).add(g);
    this.groups[name] = g;
    this.inner.updateMatrixWorld(true);
    return g;
  }

  // Matrix from bike space into a group's local space.
  _inv(name) {
    const g = this.groups[name];
    this.inner.updateMatrixWorld(true);
    const innerInv = new THREE.Matrix4().copy(this.inner.matrixWorld).invert();
    const rel = new THREE.Matrix4().multiplyMatrices(innerInv, g.matrixWorld);
    return rel.invert();
  }

  add(group, geometry, material, { local = false } = {}) {
    if (!geometry) return;
    let geo = geometry;
    if (geo.index === null) { /* fine */ }
    if (!local && group !== 'chassis') {
      geo = geo.clone();
      geo.applyMatrix4(this._inv(group));
    }
    if (!this.buckets.has(group)) this.buckets.set(group, new Map());
    const b = this.buckets.get(group);
    if (!b.has(material)) b.set(material, []);
    b.get(material).push(geo);
  }

  // Merge everything; returns list of created meshes
  finalize({ castShadow = true } = {}) {
    const meshes = [];
    for (const [group, mats] of this.buckets) {
      for (const [mat, geos] of mats) {
        const norm = geos.map((g) => normalizeAttributes(g));
        let merged;
        try { merged = mergeGeometries(norm, false); } catch (e) { merged = null; }
        if (!merged) {
          for (const g of norm) {
            const mesh = new THREE.Mesh(g, mat);
            mesh.castShadow = castShadow && !mat.transparent; mesh.receiveShadow = true;
            this.groups[group].add(mesh); meshes.push(mesh);
          }
          continue;
        }
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = castShadow && !mat.transparent && !(mat.emissiveIntensity > 1 && mat.color && mat.color.getHex() === 0);
        mesh.receiveShadow = !mat.transparent;
        mesh.name = `${group}:${mat.name || mat.type}`;
        this.groups[group].add(mesh);
        meshes.push(mesh);
        for (const g of norm) g.dispose();
      }
    }
    this.buckets.clear();
    return meshes;
  }
}

// mergeGeometries requires identical attribute sets; make all indexed with pos/normal/uv.
function normalizeAttributes(g) {
  let geo = g;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) {
    const n = geo.attributes.position.count;
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  for (const k of Object.keys(geo.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
  }
  if (!geo.index) {
    const n = geo.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  geo.morphAttributes = {};
  return geo;
}

export { _m };
