// Sky, sun, fog, environment reflections, clouds, weather and night lighting.
import * as THREE from 'three';
import { TIMES, WEATHER } from './themes.js';
import { starsTexture, cloudTexture, softCircleTexture, litCloudTexture, flareTexture } from '../core/textures.js';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { rng, clamp } from '../core/utils.js';
import { PhysicalSky } from './PhysicalSky.js';
import { STATIC_LAYER } from '../core/shadowCascade.js';
import { THEMES } from './themes.js';

const DEG = Math.PI / 180;
// linear diffuse albedo of the dominant ground per theme (feeds sky/ground bounce)
const GROUND_ALBEDO = {
  grass: [0.07, 0.12, 0.04], wildGrass: [0.07, 0.1, 0.045], dryGrass: [0.2, 0.17, 0.08], sand: [0.42, 0.24, 0.13],
  snow: [0.8, 0.82, 0.86], asphaltDark: [0.05, 0.05, 0.055], forest: [0.06, 0.08, 0.04],
};

export class Environment {
  constructor(engine, scene, track, quality) {
    this.engine = engine;
    this.scene = scene;
    this.track = track;
    this.quality = quality;
    this.T = TIMES[track.def.time] || TIMES.day;
    this.weather = track.def.weather;
    this.W = WEATHER[this.weather] || WEATHER.clear;
    this.time = 0;
    this.lampLights = [];
    this.onThunder = null;
    this._build();
  }

  _build() {
    const T = this.T, W = this.W, scene = this.scene, q = this.quality;
    const r = this.engine.renderer;
    r.toneMappingExposure = T.exposure * (W.overcast && !T.night ? 1.15 : 1);
    if (T.bloom) this.engine.setBloom(...T.bloom);
    // sun direction
    const phi = (90 - T.sunElev) * DEG, theta = T.sunAzim * DEG;
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    const lightDir = T.night ? new THREE.Vector3().setFromSphericalCoords(1, (90 - 38) * DEG, (T.sunAzim + 40) * DEG) : this.sunDir.clone();
    if (lightDir.y < 0.12) lightDir.y = 0.12;
    lightDir.normalize();
    this.lightDir = lightDir;

    // sky
    const envScene = new THREE.Scene();
    const coverage = Math.max(W.clouds, T.overcast ? 0.95 : 0);
    const theme = THEMES[this.track.def.theme] || {};
    if (!T.night) {
      // physically based atmosphere; the cloud layer lives in the same shader
      const dark = clamp((coverage - 0.75) * 2.2, 0, 1) * (W.lightning ? 1 : W.rain ? 0.8 : 0.55);
      this.psky = new PhysicalSky({
        sunDir: this.sunDir, mie: (T.turbidity || 2.2) * 0.5 * (W.fogLight ? 3 : W.overcast ? 1.6 : 1), ozone: 1,
        sunIntensity: T.sun, camH: 120 + Math.max(0, (theme.terrain?.base || 0)),
        groundAlbedo: GROUND_ALBEDO[theme.ground] || GROUND_ALBEDO.grass,
        coverage: W.clouds !== undefined ? clamp(coverage * (coverage > 0.6 ? 1 : 1.25), 0, 1) : 0.35,
        cloudDens: coverage > 0.8 ? 1.6 : 1, dark, detail: q.post, cloudH: coverage > 0.8 ? 1100 : 1700,
      });
      this.sky = this.psky.dome(4500);
      scene.add(this.sky);
      envScene.add(this.psky.dome(900));
    } else {
      this.sky = this._nightSky(4200);
      scene.add(this.sky);
      envScene.add(this._nightSky(900));
      // a few bright city-light blobs for reflections
      const rr = rng(4);
      for (let i = 0; i < 40; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(rr.range(8, 25), 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(rr.pick([0.55, 0.85, 0.08, 0.12]), 0.9, 0.6) }));
        const a = rr() * Math.PI * 2;
        m.position.set(Math.cos(a) * 600, rr.range(-20, 120), Math.sin(a) * 600);
        envScene.add(m);
      }
    }
    // ground hemisphere for env: the lit ground seen through the atmosphere
    const groundCol = this.psky ? this.psky.groundColor() : new THREE.Color(T.hemiGround).multiplyScalar(T.night ? 0.3 : 0.8);
    const gmesh = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: groundCol, side: THREE.BackSide }));
    envScene.add(gmesh);
    const pm = new THREE.PMREMGenerator(r);
    this.envRT = pm.fromScene(envScene, 0, 1, 2000);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = T.env * (W.overcast ? 1.1 : 1);
    pm.dispose();

    // night / storm-night clouds keep the painted dome
    if (T.night && coverage > 0.6) {
      const thetaLen = Math.PI * 0.46;
      const sd = this.sunDir;
      const phi = Math.atan2(sd.z, -sd.x);
      const sunU = ((phi / (Math.PI * 2)) % 1 + 1) % 1;
      const sunY = Math.min(1.3, Math.acos(Math.max(-1, Math.min(1, sd.y))) / thetaLen);
      const ct = litCloudTexture(this.track.def.id.length + 3, coverage, sunU, sunY, 0x2a2e3a, 0x0c0e14, 0.55);
      const cmat = new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false, opacity: 0.97 });
      this.clouds = new THREE.Mesh(new THREE.SphereGeometry(3000, 64, 16, 0, Math.PI * 2, 0, thetaLen), cmat);
      this.clouds.renderOrder = -1;
      scene.add(this.clouds);
    }
    // sun lens flare when the sun is visible
    if (!T.night && (W.gray || 0) < 0.4 && q.post) {
      const lf = new Lensflare();
      const sunCol = new THREE.Color(T.sunColor);
      lf.addElement(new LensflareElement(flareTexture('glow'), T.sunElev < 12 ? 900 : 600, 0, sunCol));
      lf.addElement(new LensflareElement(flareTexture('hex'), 70, 0.35, new THREE.Color(0.5, 0.7, 1.0)));
      lf.addElement(new LensflareElement(flareTexture('hex'), 110, 0.55, new THREE.Color(0.9, 0.6, 1.0)));
      lf.addElement(new LensflareElement(flareTexture('ring'), 160, 0.75, new THREE.Color(0.6, 1.0, 0.8)));
      lf.addElement(new LensflareElement(flareTexture('hex'), 60, 0.9, new THREE.Color(1.0, 0.8, 0.5)));
      this.flare = lf;
      scene.add(lf);
    }

    // fog: overcast weather pulls the fog colour toward a neutral grey
    const fogCol = new THREE.Color(T.fog[0]);
    if (this.psky) {
      // haze takes the colour of the horizon sky (the aerial perspective pass refines it per pixel)
      const h = this.psky.horizon;
      fogCol.setRGB(h[0], h[1], h[2]);
    }
    if (W.gray && !this.psky) {
      const l = fogCol.r * 0.3 + fogCol.g * 0.59 + fogCol.b * 0.11;
      const grey = new THREE.Color(l, l * 1.02, l * 1.06);
      if (W.fogLight && !T.night) grey.multiplyScalar(1.25);
      if (W.snowy && !T.night) grey.lerp(new THREE.Color(0xdde4ee), 0.5);
      fogCol.lerp(grey, W.gray);
    }
    scene.fog = new THREE.FogExp2(fogCol, T.fog[1] * W.fogMul);
    scene.background = T.night ? new THREE.Color(0x02030a) : null;
    this.fogBase = scene.fog.density;
    // aerial perspective (post pass): exponential haze thinning with altitude, lit by the sky
    let minY = Infinity;
    for (const y of this.track.c.y) minY = Math.min(minY, y);
    scene.userData.atmo = {
      sky: this.psky ? this.psky.lut : null, sunDir: this.sunDir.clone(), fogColor: fogCol.clone(), fogDensity: scene.fog.density,
      density: T.fog[1] * W.fogMul * (T.night ? 0.9 : 0.55), falloff: W.fogLight ? 700 : W.overcast ? 520 : 380, baseY: minY - 5,
      tint: this.psky ? [0.86, 0.95, 1.12] : [1, 1, 1],
    };

    // lights
    const hemi = new THREE.HemisphereLight(T.hemiSky, T.hemiGround, T.hemi * W.hemiMul);
    if (this.psky) {
      // fill from the actual sky and ground radiance (normalised; the IBL carries most of the ambient)
      const a = this.psky.skyAvg, g = this.psky.groundL;
      const la = Math.max(1e-4, a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722), lg = Math.max(1e-4, g[0] * 0.2126 + g[1] * 0.7152 + g[2] * 0.0722);
      hemi.color.setRGB(a[0] / la, a[1] / la, a[2] / la);
      hemi.groundColor.setRGB(g[0] / lg, g[1] / lg, g[2] / lg).multiplyScalar(Math.min(1, lg / la));
      hemi.intensity *= 0.75;
      if (W.gray) hemi.color.lerp(new THREE.Color(0xc8ccd4), W.gray * 0.5);
    } else if (W.gray) hemi.color.lerp(new THREE.Color(0xc8ccd4), W.gray * 0.6);
    scene.add(hemi);
    this.hemi = hemi;
    this.hemiBase = hemi.intensity;
    // sunlight: colour from the atmosphere's transmittance (white at noon, amber at dusk)
    this.sunColor = this.psky ? this.psky.sunColor.clone() : new THREE.Color(T.sunColor);
    const sun = new THREE.DirectionalLight(this.sunColor, T.sun * W.sunMul);
    sun.castShadow = q.shadows > 0;
    if (sun.castShadow) {
      sun.shadow.mapSize.set(q.shadows, q.shadows);
      const ext = q.shadows >= 4096 ? 55 : 42;
      Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 400 });
      sun.shadow.bias = -0.0003;
      sun.shadow.normalBias = 0.03;
    }
    scene.add(sun, sun.target);
    this.sun = sun;
    // far cascade: zero-intensity shadow caster over a few hundred metres of static scenery
    if (sun.castShadow && q.shadows >= 1024) {
      const far = new THREE.DirectionalLight(0xffffff, 0);
      far.castShadow = true;
      const size = Math.min(4096, q.shadows * 2);
      far.shadow.mapSize.set(size, size);
      const ext = size >= 4096 ? 320 : 240;
      Object.assign(far.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 1400 });
      far.shadow.camera.layers.set(STATIC_LAYER);
      far.shadow.bias = -0.00012;
      far.shadow.normalBias = 0.22;
      far.shadow.radius = 1.5;
      far.shadow.autoUpdate = false;
      far.shadow.needsUpdate = true;
      scene.add(far, far.target);
      this.sunFar = far;
      this.farExt = ext;
      this._farC = new THREE.Vector3(1e9, 0, 0);
    }

    // weather particles
    const dens = clamp(q.density, 0.4, 1.3);
    if (W.rain) this._rain(Math.round(W.rain * dens));
    if (W.snow) this._snow(Math.round(W.snow * dens));
    this.nextLightning = 6 + Math.random() * 6;
    this.flash = 0;

    // night street-light pool
    const nl = T.night || T.overcast || W.lightning ? (q.shadows >= 2048 ? 8 : q.shadows ? 5 : 3) : 0;
    for (let i = 0; i < nl; i++) {
      const pl = new THREE.PointLight(T.night ? 0xffd7a0 : 0xffe0b0, 0, 45, 1.6);
      scene.add(pl);
      this.lampLights.push(pl);
    }
  }

  _nightSky(radius) {
    const tex = starsTexture();
    const mat = new THREE.ShaderMaterial({
      uniforms: { tStars: { value: tex }, uHorizon: { value: new THREE.Color(0x1a1840) }, uZenith: { value: new THREE.Color(0x01020a) }, uGlow: { value: new THREE.Color(0x5a2a60) } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform sampler2D tStars; uniform vec3 uHorizon, uZenith, uGlow; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.5, h));
          col += uGlow * pow(1.0 - abs(h), 8.0) * 0.6;
          vec2 uv = vec2(atan(vDir.x, vDir.z) / 6.2831853 + 0.5, 1.0 - acos(clamp(vDir.y,-1.0,1.0)) / 3.14159265);
          vec3 st = texture2D(tStars, vec2(uv.x, 1.0 - (uv.y * 0.5 + 0.5))).rgb;
          col += st * smoothstep(0.02, 0.25, h) * 1.4;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
    m.renderOrder = -2;
    g.add(m);
    // moon
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.025, 24, 16), moonMat);
    const md = new THREE.Vector3().setFromSphericalCoords(radius * 0.9, (90 - 35) * DEG, (this.T.sunAzim + 40) * DEG);
    moon.position.copy(md);
    g.add(moon);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softCircleTexture(), color: 0x8ab0ff, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    glow.scale.setScalar(radius * 0.25);
    glow.position.copy(md);
    g.add(glow);
    return g;
  }

  _rain(count) {
    const pos = new Float32Array(count * 2 * 3);
    const seed = new Float32Array(count * 2 * 4);
    const r = rng(77);
    for (let i = 0; i < count; i++) {
      const sx = r(), sy = r(), sz = r(), sp = 0.8 + r() * 0.4;
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        seed.set([sx, sy, sz, k], j * 4);
        pos.set([0, 0, 0], j * 3);
        void sp;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    this.rainMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(60, 30, 60) }, uColor: { value: new THREE.Color(0x9aaabb) }, uVel: { value: new THREE.Vector3(2, -24, 1) }, uFlash: { value: 0 } },
      vertexShader: `attribute vec4 seed; uniform float uTime; uniform vec3 uCam, uBox, uVel; varying float vA;
        void main(){
          vec3 p = seed.xyz * uBox + uVel * uTime;
          p = mod(p, uBox) - uBox * 0.5;
          p += uCam;
          p -= normalize(uVel) * seed.w * 0.9;
          vA = seed.w;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uFlash; varying float vA; void main(){ gl_FragColor = vec4(uColor * (1.0 + uFlash * 3.0), 0.32 * (1.0 - vA * 0.6)); }`,
      transparent: true, depthWrite: false,
    });
    this.rain = new THREE.LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  _snow(count) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    const r = rng(78);
    for (let i = 0; i < count; i++) seed.set([r(), r(), r(), r()], i * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    this.snowMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(70, 35, 70) }, tex: { value: softCircleTexture() }, uScale: { value: 300 } },
      vertexShader: `attribute vec4 seed; uniform float uTime, uScale; uniform vec3 uCam, uBox;
        void main(){
          vec3 p = seed.xyz * uBox + vec3(sin(uTime * 0.7 + seed.w * 20.0) * 1.2, -2.2 * uTime * (0.6 + seed.w), cos(uTime * 0.5 + seed.w * 13.0) * 1.2);
          p = mod(p, uBox) - uBox * 0.5;
          p += uCam;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = uScale * (0.05 + seed.w * 0.06) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D tex; void main(){ vec4 c = texture2D(tex, gl_PointCoord); gl_FragColor = vec4(vec3(1.0), c.a * 0.9); }`,
      transparent: true, depthWrite: false,
    });
    this.snow = new THREE.Points(g, this.snowMat);
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
  }

  setLamps(positions) { this.lamps = positions; }

  update(dt, camera, focus) {
    this.time += dt;
    const sun = this.sun;
    // keep the shadow frustum around the focus point (snapped to texels to avoid shimmer)
    const f = focus || camera.position;
    const ext = sun.shadow.camera.right;
    const texel = (ext * 2) / (sun.shadow.mapSize.x || 1024);
    const fx = Math.round(f.x / texel) * texel, fz = Math.round(f.z / texel) * texel;
    sun.target.position.set(fx, f.y, fz);
    sun.position.set(fx + this.lightDir.x * 200, f.y + this.lightDir.y * 200, fz + this.lightDir.z * 200);
    if (this.sunFar) {
      // re-render the far map only when the view has moved well inside it
      camera.getWorldDirection(this._fw || (this._fw = new THREE.Vector3()));
      const e = this.farExt, fw = this._fw;
      const l = Math.hypot(fw.x, fw.z) || 1;
      const cx = f.x + (fw.x / l) * e * 0.5, cz = f.z + (fw.z / l) * e * 0.5;
      if (Math.hypot(cx - this._farC.x, cz - this._farC.z) > e * 0.28) {
        const ft = (e * 2) / this.sunFar.shadow.mapSize.x;
        const sx = Math.round(cx / ft) * ft, sz = Math.round(cz / ft) * ft;
        this._farC.set(sx, f.y, sz);
        this.sunFar.target.position.set(sx, f.y, sz);
        this.sunFar.position.set(sx + this.lightDir.x * 600, f.y + this.lightDir.y * 600, sz + this.lightDir.z * 600);
        this.sunFar.target.updateMatrixWorld();
        this.sunFar.updateMatrixWorld();
        this.sunFar.shadow.needsUpdate = true;
      }
    }
    if (this.sky) this.sky.position.copy(camera.position);
    if (this.psky) this.psky.update(dt);
    if (this.flare) this.flare.position.copy(camera.position).addScaledVector(this.sunDir, 2500);
    if (this.clouds) { this.clouds.position.set(camera.position.x, 0, camera.position.z); this.clouds.rotation.y += dt * 0.0006; }
    if (this.clouds2) { this.clouds2.position.set(camera.position.x, 0, camera.position.z); this.clouds2.rotation.y += dt * 0.0011; }
    if (this.rainMat) { this.rainMat.uniforms.uTime.value = this.time; this.rainMat.uniforms.uCam.value.copy(camera.position); }
    if (this.snowMat) { this.snowMat.uniforms.uTime.value = this.time; this.snowMat.uniforms.uCam.value.copy(camera.position); }

    // lightning
    if (this.W.lightning) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.nextLightning = 7 + Math.random() * 12;
        this.flashSeq = [0, 0.08, 0.18, 0.32].map((t) => this.time + t);
        if (this.onThunder) setTimeout(() => this.onThunder(), 600 + Math.random() * 1600);
      }
      let fl = 0;
      if (this.flashSeq) for (const t of this.flashSeq) { const d = this.time - t; if (d >= 0 && d < 0.12) fl = Math.max(fl, 1 - d / 0.12); }
      this.flash = fl;
      this.hemi.intensity = this.hemiBase + fl * 4;
      if (this.rainMat) this.rainMat.uniforms.uFlash.value = fl;
      const fx2 = this.engine.fx;
      if (fx2) fx2.uFlash.value = Math.max(fx2.uFlash.value, fl * 0.12);
    }

    // street-light pool: attach lights to the lamps nearest the camera
    if (this.lampLights.length && this.lamps && this.lamps.length) {
      this._lampT = (this._lampT || 0) - dt;
      if (this._lampT <= 0) {
        this._lampT = 0.2;
        const cp = camera.position;
        const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
        const scored = this.lamps.map((p, i) => {
          const dx = p.x - cp.x, dz = p.z - cp.z;
          const d = Math.hypot(dx, dz);
          const ahead = (dx * fwd.x + dz * fwd.z) / (d || 1);
          return [d - ahead * 25, i];
        }).sort((a, b) => a[0] - b[0]);
        this.lampLights.forEach((l, k) => {
          const p = this.lamps[scored[k][1]];
          l.position.set(p.x, p.y - 0.4, p.z);
          l.intensity = p.intensity ?? 260;
          if (p.color !== undefined) l.color.set(p.color);
        });
      }
    }
  }

  dispose() {
    this.envRT?.dispose();
    this.psky?.dispose();
  }
}
