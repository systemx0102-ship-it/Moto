// Bike assembly: articulated groups (steering, suspension, wheels) whose parts
// are authored in "bike space" (x forward, y up, z right, ground at y=0) and
// merged per material to keep draw calls low.
//
// Two things happen to every part on the way in:
//  - a second UV set (uv1) is box-projected from its bike-space position in metres, so
//    detail maps (grain, brushing, casting, carbon weave, flakes) keep true physical scale
//    whatever the primitive's own UVs look like;
//  - tinted materials (anodised, castings, plastics, solid paints... that differ only by
//    colour) are redirected to one shared base material and the colour is written into a
//    vertex colour attribute, so a dozen colour variants cost a single draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

export class Assembly {
  constructor() {
    this.inner = new THREE.Group(); // bike space
    this.groups = {};
    this.buckets = new Map(); // groupName -> Map(material -> geo[])
    this.inverse = {};
    this.addGroup('chassis', this.inner);
  }

  addGroup(name, parent, position = [0, 0, 0], rotation = [0, 0, 0]) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...position);
    g.rotation.set(...rotation);
    (typeof parent === 'string' ? this.groups[parent] : parent).add(g);
    this.groups[name] = g;
    this.inner.updateMatrixWorld(true);
    this.inverse = {};
    return g;
  }

  // Matrix from bike space into a group's local space.
  _inv(name) {
    if (this.inverse[name]) return this.inverse[name];
    const g = this.groups[name];
    this.inner.updateMatrixWorld(true);
    const innerInv = new THREE.Matrix4().copy(this.inner.matrixWorld).invert();
    const rel = new THREE.Matrix4().multiplyMatrices(innerInv, g.matrixWorld);
    return (this.inverse[name] = rel.invert());
  }

  add(group, geometry, material, { local = false } = {}) {
    if (!geometry || !material) return;
    let geo = geometry.clone();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    boxUV(geo);
    let mat = material;
    const tint = mat.userData && mat.userData.tint;
    if (tint) {
      mat = tint.base;
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      _c.copy(tint.color);
      for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    if (!local && group !== 'chassis') geo.applyMatrix4(this._inv(group));
    if (!this.buckets.has(group)) this.buckets.set(group, new Map());
    const b = this.buckets.get(group);
    if (!b.has(mat)) b.set(mat, []);
    b.get(mat).push(geo);
  }

  // Merge everything; returns list of created meshes
  finalize({ castShadow = true } = {}) {
    const meshes = [];
    for (const [group, mats] of this.buckets) {
      for (const [mat, geos] of mats) {
        const withColor = !!mat.vertexColors;
        const norm = geos.map((g) => normalizeAttributes(g, withColor));
        let merged;
        try { merged = mergeGeometries(norm, false); } catch (e) { merged = null; }
        const shadow = castShadow && !mat.transparent && !mat.userData.noShadow && !(mat.emissiveIntensity > 1 && mat.color && mat.color.getHex() === 0);
        if (!merged) {
          for (const g of norm) {
            const mesh = new THREE.Mesh(g, mat);
            mesh.castShadow = shadow; mesh.receiveShadow = !mat.transparent;
            this.groups[group].add(mesh); meshes.push(mesh);
          }
          continue;
        }
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = shadow;
        mesh.receiveShadow = !mat.transparent;
        if (mat.userData.renderOrder) mesh.renderOrder = mat.userData.renderOrder;
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

// Box projection in metres from the dominant normal axis (side faces map x/y, top faces
// x/z, front faces z/y) into uv1.
export function boxUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const cnt = p.count;
  const uv = new Float32Array(cnt * 2);
  for (let i = 0; i < cnt; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (az >= ax && az >= ay) { uv[i * 2] = x; uv[i * 2 + 1] = y; }
    else if (ay >= ax) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
    else { uv[i * 2] = z; uv[i * 2 + 1] = y; }
  }
  geo.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// mergeGeometries requires identical attribute sets; make all indexed with pos/normal/uv/uv1
// (+ colour for tinted buckets).
function normalizeAttributes(g, withColor) {
  const geo = g;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!geo.attributes.uv1) boxUV(geo);
  if (withColor && !geo.attributes.color) geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const keep = withColor ? ['position', 'normal', 'uv', 'uv1', 'color'] : ['position', 'normal', 'uv', 'uv1'];
  for (const k of Object.keys(geo.attributes)) if (!keep.includes(k)) geo.deleteAttribute(k);
  for (const k of keep) {
    const a = geo.attributes[k];
    if (a && (a.isInterleavedBufferAttribute || a.normalized || !(a.array instanceof Float32Array))) {
      const arr = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c);
      geo.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize));
    }
  }
  if (!geo.index) {
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  geo.morphAttributes = {};
  return geo;
}

export { _m };
