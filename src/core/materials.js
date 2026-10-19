// Shared PBR material library for the machines.
//
// Values follow measured references: metals carry their reflectance in the base colour
// (chrome ~0.55-0.6 linear, aluminium ~0.9, anodised layers tinted), dielectrics use dark
// albedos (tyre rubber ~0.02, black plastics ~0.03) with the roughness doing the work.
// Detail maps are read through the metric uv1 set the bike assembly box-projects, so grain,
// brushing, casting pits, carbon weave and paint flakes keep their real size everywhere.
//
// Materials that differ only by colour are "tinted": the factory returns a proxy carrying
// { base, color }; the assembly merges every tint of a base into one draw call using
// vertex colours. The proxy is itself a valid material, so it also renders on its own.
import * as THREE from 'three';
import { carbonTexture, leatherTexture, titaniumTexture, chainTexture, flakeNormalTexture } from './textures.js';
import { grainSet, brushedSet, castSet, scratchRoughness, heatTint, tireSet, rep, rep1, carbonSet, braidSet, knurlSet, radiatorSet, gripSet, suedeSet, grilleTexture } from './pbr.js';
const N2 = (s) => new THREE.Vector2(s, s);

const lib = new Map();
function get(key, make) {
  if (!lib.has(key)) { const m = make(); if (!m.name) m.name = key.split(':')[0]; lib.set(key, m); }
  return lib.get(key);
}

// colour variants of one base material -> one draw call
function tinted(key, color, makeBase) {
  const base = get(`base:${key}`, () => { const m = makeBase(); m.vertexColors = true; m.color.set(0xffffff); m.name = key; return m; });
  return get(`tint:${key}:${new THREE.Color(color).getHexString()}`, () => {
    const m = base.clone();
    m.vertexColors = false;
    m.color.set(color);
    m.userData = { tint: { base, color: new THREE.Color(color) } };
    return m;
  });
}

// Transparent glass / polycarbonate with physically split blending: the tint is
// alpha-blended over what is behind while the reflection is added on top unscaled, so a
// clear screen shows the background *and* bright reflections (plain alpha blending would
// fade the reflection with the opacity). Fresnel raises the coverage at grazing angles.
function glassMaterial(tint, opacity, rough = 0.02, extra = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: tint, metalness: 0, roughness: rough, transparent: true, opacity, depthWrite: false,
    side: THREE.DoubleSide, ior: 1.55, specularIntensity: 1, envMapIntensity: 1.3, premultipliedAlpha: true, ...extra,
  });
  m.userData.noShadow = true;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <opaque_fragment>', `
        vec3 gDiff = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
        vec3 gSpec = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
        float gNV = saturate( dot( normal, normalize( vViewPosition ) ) );
        float gF = pow( 1.0 - gNV, 4.0 );
        float gA = clamp( diffuseColor.a + gF * 0.6, 0.0, 1.0 );
        gl_FragColor = vec4( gDiff * gA + gSpec + totalEmissiveRadiance, gA );`)
      .replace('#include <premultiplied_alpha_fragment>', '')
      .replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace('mix( gl_FragColor.rgb, fogColor, fogFactor )', 'mix( gl_FragColor.rgb, fogColor * gl_FragColor.a, fogFactor )'));
  };
  m.customProgramCacheKey = () => 'glass-split';
  return m;
}

export const M = {
  paint(color, { metal = 0.55, rough = 0.32, clear = 1, map = null } = {}) {
    if (map) {
      return get(`paint:${metal}:${rough}:${clear}:${map.uuid}`, () => new THREE.MeshPhysicalMaterial({
        map, metalness: metal, roughness: rough, clearcoat: clear, clearcoatRoughness: 0.04,
      }));
    }
    return tinted(`paint:${metal}:${rough}:${clear}`, color, () => new THREE.MeshPhysicalMaterial({
      metalness: metal, roughness: rough, clearcoat: clear, clearcoatRoughness: 0.04,
      normalMap: rep1(flakes(), 40), normalScale: N2(metal > 0.3 ? 0.22 : 0.05),
    }));
  },
  matte(color, rough = 0.75) {
    return tinted(`matte:${rough}`, color, () => { const gr = grainSet(11, 160, 2); return new THREE.MeshStandardMaterial({ roughness: rough, metalness: 0.1, normalMap: rep1(gr.normalMap, 10), normalScale: N2(0.25) }); });
  },
  // polished chrome: near mirror with polishing swirls and micro-scratches
  chrome() {
    return get('chrome', () => new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.07, roughnessMap: rep1(scratchRoughness(), 3), envMapIntensity: 1.15 }));
  },
  // black chrome / smoked nickel
  darkChrome() {
    return get('darkchrome', () => new THREE.MeshStandardMaterial({ color: 0x45474c, metalness: 1, roughness: 0.16, roughnessMap: rep1(scratchRoughness(), 3) }));
  },
  // brushed aluminium: anisotropic highlight stretched along the brushing (bike x on sides)
  aluminum() {
    return get('alu', () => {
      const b = brushedSet();
      return new THREE.MeshPhysicalMaterial({ color: 0xd2d5d9, metalness: 1, roughness: 0.3, roughnessMap: rep1(b.roughnessMap, 4, 30), normalMap: rep1(b.normalMap, 4, 30), normalScale: N2(0.18), anisotropy: 0.7 });
    });
  },
  // machined / polished aluminium (rim lips, billet edges, fork caps)
  machined() {
    return get('machined', () => new THREE.MeshStandardMaterial({ color: 0xe3e5e8, metalness: 1, roughness: 0.12, roughnessMap: rep1(scratchRoughness(), 4) }));
  },
  // as-cast aluminium (wheel hubs, cases, castings left raw)
  cast(color = 0xa9adb3) {
    return tinted('cast', color, () => { const cs = castSet(); return new THREE.MeshStandardMaterial({ metalness: 0.9, roughness: 0.42, roughnessMap: rep1(cs.roughnessMap, 12), normalMap: rep1(cs.normalMap, 14), normalScale: N2(0.3) }); });
  },
  // anodised alloy: satin metallic with a fine machined grain
  anodized(color = 0x222428) {
    return tinted('anod', color, () => {
      const gr = grainSet(7, 96, 1.4);
      return new THREE.MeshPhysicalMaterial({ metalness: 0.9, roughness: 0.3, roughnessMap: rep1(gr.roughnessMap, 10), normalMap: rep1(gr.normalMap, 10), normalScale: N2(0.12), clearcoat: 0.3, clearcoatRoughness: 0.25 });
    });
  },
  // TiN / gold anodised: fork stanchions, adjusters
  gold() {
    return get('gold', () => new THREE.MeshStandardMaterial({ color: 0xd9ad4a, metalness: 1, roughness: 0.14, roughnessMap: rep1(scratchRoughness(), 3) }));
  },
  copper() {
    return get('copper', () => new THREE.MeshStandardMaterial({ color: 0xc46a3a, metalness: 1, roughness: 0.3 }));
  },
  // heat-blued titanium (gradient along the lathe v), brushed
  titanium() {
    return get('ti', () => { const b = brushedSet(); return new THREE.MeshPhysicalMaterial({ map: titaniumTexture(), metalness: 1, roughness: 0.26, normalMap: rep1(b.normalMap, 4, 30), normalScale: N2(0.15), anisotropy: 0.5 }); });
  },
  // 2x2 twill carbon under a deep clear coat, fibre-direction anisotropy
  carbon() {
    return get('carbon', () => {
      const c = carbonSet();
      return new THREE.MeshPhysicalMaterial({
        color: 0xffffff, map: rep1(c.map, 28), normalMap: rep1(c.normalMap, 28), normalScale: N2(0.35), anisotropyMap: rep1(c.anisotropyMap, 28), anisotropy: 0.85,
        metalness: 0.25, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.03,
      });
    });
  },
  rubber() {
    return get('rubber', () => { const gr = grainSet(3, 128, 2.5); return new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.88, metalness: 0, normalMap: rep1(gr.normalMap, 12), normalScale: N2(0.4), roughnessMap: rep1(gr.roughnessMap, 12) }); });
  },
  // moulded grip rubber (waffle), u round the grip
  grip() {
    return get('grip', () => new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.82, metalness: 0, normalMap: rep(gripSet().normalMap, 1, 6), normalScale: N2(0.9) }));
  },
  // tyre: worn contact band, swept grooves, moulded sidewall lettering in relief
  tire(knobby = false) {
    return get(`tire:${knobby}`, () => { const t = tireSet(knobby); return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: N2(1.0), roughnessMap: t.roughnessMap, roughness: 0.92, metalness: 0 }); });
  },
  // exhaust headers: brushed steel heat-coloured from the port outward (tube u = length)
  header() {
    return get('header', () => { const b = brushedSet(); return new THREE.MeshPhysicalMaterial({ map: heatTint(), metalness: 1, roughness: 0.3, normalMap: rep(b.normalMap, 1, 8), normalScale: N2(0.2), anisotropy: 0.5 }); });
  },
  chain() {
    return get('chain', () => { const t = chainTexture(); return new THREE.MeshStandardMaterial({ map: t, metalness: 0.85, roughness: 0.38 }); });
  },
  // oily steel (chain plates, bolts, springs left raw)
  steel(color = 0x8f9399) {
    return tinted('steel', color, () => new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.32, roughnessMap: rep1(scratchRoughness(), 4) }));
  },
  // moulded plastics: fine pebble texture, satin
  plastic(color = 0x141416) {
    return tinted('plastic', color, () => { const gr = grainSet(11, 160, 2); return new THREE.MeshStandardMaterial({ roughness: 0.58, metalness: 0.02, normalMap: rep1(gr.normalMap, 14), normalScale: N2(0.3), roughnessMap: rep1(gr.roughnessMap, 14) }); });
  },
  // gloss black plastics (fairing inners, mirror shells, headlight housings)
  gloss(color = 0x0c0c0e) {
    return tinted('gloss', color, () => new THREE.MeshPhysicalMaterial({ roughness: 0.25, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.06 }));
  },
  leather(color = 0x2a2a2a) {
    return get(`leather:${color}`, () => {
      const { map, normalMap } = leatherTexture();
      return new THREE.MeshPhysicalMaterial({ color, map: rep1(map, 10), normalMap: rep1(normalMap, 10), normalScale: N2(0.5), roughness: 0.6, metalness: 0, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x404040) });
    });
  },
  // race seat: grippy suede
  suede(color = 0x1c1c1e) {
    return tinted('suede', color, () => { const s = suedeSet(); return new THREE.MeshPhysicalMaterial({ roughness: 0.95, metalness: 0, normalMap: rep1(s.normalMap, 12), normalScale: N2(0.4), roughnessMap: rep1(s.roughnessMap, 12), sheen: 1, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x3a3a3c) }); });
  },
  glass(tint = 0x223344, opacity = 0.35) {
    return get(`glass:${tint}:${opacity}`, () => glassMaterial(tint, opacity * 0.7));
  },
  // clear polycarbonate lens over lamps
  lens() {
    return get('lens', () => glassMaterial(0xffffff, 0.06, 0.01));
  },
  // red / amber translucent lenses (lamp off still reads coloured)
  tintLens(color = 0x8a0a0a) {
    return get(`tlens:${color}`, () => glassMaterial(color, 0.55, 0.05));
  },
  emissive(color, intensity = 3) {
    return get(`emis:${color}:${intensity}`, () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }));
  },
  radiator() {
    return get('radiator', () => { const r = radiatorSet(); return new THREE.MeshStandardMaterial({ map: r.map, normalMap: r.normalMap, normalScale: N2(1.2), metalness: 0.7, roughness: 0.55 }); });
  },
  engine(color = 0x2b2d31) {
    // castings: sand-cast grain; dark ones read as satin powder coat over the casting
    const c = new THREE.Color(color);
    const dark = c.r + c.g + c.b < 0.25;
    return tinted(dark ? 'engine:dark' : 'engine:light', color, () => {
      const cs = castSet();
      return new THREE.MeshStandardMaterial({ metalness: dark ? 0.35 : 0.85, roughness: dark ? 0.48 : 0.38, roughnessMap: rep1(cs.roughnessMap, 12), normalMap: rep1(cs.normalMap, 14), normalScale: N2(dark ? 0.12 : 0.25) });
    });
  },
  disc() {
    return get('disc', () => new THREE.MeshStandardMaterial({ color: 0xa8acb2, metalness: 1, roughness: 0.28 }));
  },
  spring(color = 0xe2b521) {
    return tinted('spring', color, () => new THREE.MeshPhysicalMaterial({ metalness: 0.4, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.1 }));
  },
  black() {
    return get('black', () => { const gr = grainSet(11, 160, 2); return new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.55, metalness: 0.15, normalMap: rep1(gr.normalMap, 14), normalScale: N2(0.25) }); });
  },
  screen() {
    return get('screen', () => new THREE.MeshStandardMaterial({ color: 0x050608, emissive: 0x0a1a28, emissiveIntensity: 1, roughness: 0.2 }));
  },
  // braided stainless hose (u along the hose, v round it)
  braided() {
    return get('braid', () => { const b = braidSet(); return new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 1, roughness: 0.4, normalMap: b.normalMap, normalScale: N2(1.2), roughnessMap: b.roughnessMap }); });
  },
  // black expanded-metal guard (radiator / intake meshes): alpha-tested
  grille() {
    return get('grille', () => new THREE.MeshStandardMaterial({ color: 0x111113, map: rep(grilleTexture(), 7, 7), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.55 }));
  },
  knurled() {
    return get('knurl', () => new THREE.MeshStandardMaterial({ color: 0xc8cbd0, metalness: 1, roughness: 0.3, normalMap: rep(knurlSet().normalMap, 2, 2), normalScale: N2(1.4) }));
  },
};

// metallic paint flake normals (shared with the livery paints)
function flakes() { return flakeNormalTexture(); }
export { tinted, glassMaterial, carbonTexture };
