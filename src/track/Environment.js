// Sky, sun, fog, environment reflections, clouds, weather and night lighting.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { TIMES, WEATHER } from './themes.js';
import { starsTexture, cloudTexture, softCircleTexture } from '../core/textures.js';
import { rng, clamp } from '../core/utils.js';

const DEG = Math.PI / 180;

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
    if (!T.night) {
      const mkSky = (scale) => {
        const sky = new Sky();
        sky.scale.setScalar(scale);
        const u = sky.material.uniforms;
        const g = W.gray || 0;
        u.turbidity.value = T.turbidity + g * 14; u.rayleigh.value = T.rayleigh * (1 - g * 0.75);
        u.mieCoefficient.value = T.mie + g * 0.02; u.mieDirectionalG.value = 0.86 - g * 0.3;
        u.sunPosition.value.copy(this.sunDir);
        return sky;
      };
      this.sky = mkSky(4500);
      scene.add(this.sky);
      envScene.add(mkSky(900));
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
    // ground hemisphere for env
    const groundCol = new THREE.Color(T.hemiGround).multiplyScalar(T.night ? 0.3 : 0.8);
    const gmesh = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: groundCol, side: THREE.BackSide }));
    envScene.add(gmesh);
    const pm = new THREE.PMREMGenerator(r);
    this.envRT = pm.fromScene(envScene, 0, 1, 2000);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = T.env * (W.overcast ? 1.1 : 1);
    pm.dispose();

    // clouds
    const coverage = Math.max(W.clouds, T.overcast ? 0.95 : 0);
    if (!T.night || coverage > 0.6) {
      const dense = coverage > 0.8;
      const ct = cloudTexture(this.track.def.id.length, coverage);
      ct.repeat.set(3, 1);
      const base = T.night ? 0x15171e : dense ? (W.lightning ? 0x4a5260 : 0x7a8290) : 0xffffff;
      const cmat = new THREE.MeshBasicMaterial({
        map: ct, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
        color: new THREE.Color(base).multiplyScalar(T.sunElev < 10 && !T.night ? 0.95 : 1.0),
        opacity: dense ? 0.96 : 0.85,
      });
      if (T.sunElev < 10 && !dense && !T.night) cmat.color.set(T.sunAzim < 180 ? 0xffd0d8 : 0xffc8a0);
      const cg = new THREE.SphereGeometry(3000, 48, 12, 0, Math.PI * 2, 0, Math.PI * 0.42);
      this.clouds = new THREE.Mesh(cg, cmat);
      this.clouds.renderOrder = -1;
      scene.add(this.clouds);
      if (dense) {
        const c2 = this.clouds.clone();
        c2.material = cmat.clone(); c2.material.opacity = 0.8;
        c2.scale.setScalar(0.92); c2.rotation.y = 1.3;
        this.clouds2 = c2;
        scene.add(c2);
      }
    }

    // fog: overcast weather pulls the fog colour toward a neutral grey
    const fogCol = new THREE.Color(T.fog[0]);
    if (W.gray) {
      const l = fogCol.r * 0.3 + fogCol.g * 0.59 + fogCol.b * 0.11;
      const grey = new THREE.Color(l, l * 1.02, l * 1.06);
      if (W.fogLight && !T.night) grey.multiplyScalar(1.25);
      if (W.snowy && !T.night) grey.lerp(new THREE.Color(0xdde4ee), 0.5);
      fogCol.lerp(grey, W.gray);
    }
    scene.fog = new THREE.FogExp2(fogCol, T.fog[1] * W.fogMul);
    scene.background = T.night ? new THREE.Color(0x02030a) : null;
    this.fogBase = scene.fog.density;

    // lights
    const hemi = new THREE.HemisphereLight(T.hemiSky, T.hemiGround, T.hemi * W.hemiMul);
    if (W.gray) hemi.color.lerp(new THREE.Color(0xc8ccd4), W.gray * 0.6);
    scene.add(hemi);
    this.hemi = hemi;
    this.hemiBase = hemi.intensity;
    const sun = new THREE.DirectionalLight(T.sunColor, T.sun * W.sunMul);
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
    if (this.sky) this.sky.position.copy(camera.position);
    if (this.clouds) { this.clouds.position.set(camera.position.x, 0, camera.position.z); this.clouds.rotation.y += dt * 0.004; }
    if (this.clouds2) { this.clouds2.position.set(camera.position.x, 0, camera.position.z); this.clouds2.rotation.y += dt * 0.007; }
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
  }
}
