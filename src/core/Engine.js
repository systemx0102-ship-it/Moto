// Renderer, post-processing chain and main loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { Save } from './Settings.js';
import { setMaxAnisotropy } from './textures.js';
import { clamp } from './utils.js';
import { LensFX } from './postfx/LensFX.js';
import { FXAAShader } from './postfx/fxaa.js';
import { resolveGrade } from './postfx/grades.js';

const TIER = { bajo: 0, medio: 1, alto: 2, ultra: 3 };
const _v = new THREE.Vector3(), _fwd = new THREE.Vector3(), _buf = new THREE.Vector2();

// Display-space grading: radial speed blur, chromatic aberration, light sharpening,
// nitro heat shimmer, filmic lift/gamma/gain + split toning, vignette, grain,
// flash and tint. Runs after tone mapping (and FXAA when there is no MSAA).
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uBlur: { value: 0 },
    uCA: { value: 0.0015 },
    uVignette: { value: 0.2 },
    uGrain: { value: 0.02 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintAmt: { value: 0 },
    uSat: { value: 1.12 },
    uContrast: { value: 1.05 },
    uCenter: { value: new THREE.Vector2(0.5, 0.52) },
    uDamage: { value: 0 },
    uRain: { value: 0 },
    uSpeed: { value: 0 },
    uAspect: { value: 1.7 },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uSharpen: { value: 0 },
    uShimmer: { value: 0 },
    uVibrance: { value: 0 },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
    uGamma: { value: new THREE.Vector3(1, 1, 1) },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uShadowTint: { value: new THREE.Vector3(0, 0, 0) },
    uHighTint: { value: new THREE.Vector3(0, 0, 0) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uBlur, uCA, uVignette, uGrain, uFlash, uTintAmt, uSat, uContrast, uDamage, uRain, uSpeed, uAspect;
    uniform float uSharpen, uShimmer, uVibrance;
    uniform vec3 uFlashColor, uTint, uLift, uGamma, uGain, uShadowTint, uHighTint;
    uniform vec2 uCenter, uTexel;
    varying vec2 vUv;
    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    // raindrops on the lens: returns uv offset (refraction) and a mask in z
    vec3 drops(vec2 uv) {
      vec3 acc = vec3(0.0);
      for (int L = 0; L < 3; L++) {
        float fl = float(L);
        vec2 grid = vec2(9.0 + fl * 7.0, 5.0 + fl * 4.0);
        vec2 g = vec2(uv.x * uAspect / 1.7, uv.y) * grid;
        // drops slide down (and sideways with speed)
        g.y += uTime * (0.05 + fl * 0.04) * (1.0 + uSpeed * 2.0);
        vec2 id = floor(g);
        vec2 f = fract(g) - 0.5;
        float n = hash(id + fl * 17.0);
        float life = fract(uTime * (0.08 + n * 0.12) + n * 7.0);
        if (n < uRain * (0.55 - fl * 0.12)) {
          vec2 p = vec2(hash(id + 1.3) - 0.5, hash(id + 2.7) - 0.5) * 0.55;
          float rad = (0.16 + 0.12 * hash(id + 5.1)) * (1.0 - fl * 0.2);
          vec2 d = f - p;
          d.y *= 1.0 + uSpeed * 1.5;
          float m = smoothstep(rad, rad * 0.55, length(d)) * smoothstep(1.0, 0.7, life) * smoothstep(0.0, 0.08, life);
          acc.xy += d * m * 0.06 / grid * 9.0;
          acc.z = max(acc.z, m);
        }
      }
      return acc;
    }
    void main(){
      vec2 uvIn = vUv;
      vec3 dr = vec3(0.0);
      if (uRain > 0.001) { dr = drops(vUv); uvIn += dr.xy; }
      // nitro: heat shimmer rippling in from the screen edges (two octaves of
      // rising, wobbling waves; no texture taps)
      float edge = 0.0;
      if (uShimmer > 0.001) {
        vec2 e = (vUv - 0.5) * vec2(uAspect, 1.0);
        edge = smoothstep(0.3, 0.95, length(e)) * uShimmer;
        vec2 q = vUv * vec2(uAspect, 1.0) * 14.0;
        vec2 w = vec2(sin(q.y * 1.9 - uTime * 17.0 + sin(q.x * 1.3 + uTime * 6.0)),
                      cos(q.x * 1.6 - uTime * 15.0 + sin(q.y * 0.8 - uTime * 9.0)));
        q *= 2.7;
        w += 0.5 * vec2(sin(q.y * 1.3 - uTime * 29.0 + q.x * 0.7), cos(q.x * 1.1 + q.y * 0.6 - uTime * 23.0));
        uvIn += w * edge * 0.0035;
      }
      vec2 dir = uvIn - uCenter;
      float dist = length(dir);
      vec3 col;
      float ca = uCA * (1.0 + uBlur * 6.0) * dist;
      if (uBlur > 0.001) {
        vec3 acc = vec3(0.0);
        float wsum = 0.0;
        float amt = uBlur * smoothstep(0.08, 0.6, dist) * 0.09;
        for (int i = 0; i < 10; i++) {
          float t = float(i) / 9.0;
          float w = 1.0 - t * 0.7;
          vec2 uv = uvIn - dir * amt * t;
          acc.r += texture2D(tDiffuse, uv + dir * ca).r * w;
          acc.g += texture2D(tDiffuse, uv).g * w;
          acc.b += texture2D(tDiffuse, uv - dir * ca).b * w;
          wsum += w;
        }
        col = acc / wsum;
      } else {
        col.r = texture2D(tDiffuse, uvIn + dir * ca).r;
        col.g = texture2D(tDiffuse, uvIn).g;
        col.b = texture2D(tDiffuse, uvIn - dir * ca).b;
        // light luma sharpening (clamped so edges never ring)
        if (uSharpen > 0.0) {
          vec3 nb = texture2D(tDiffuse, uvIn + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, uvIn - vec2(uTexel.x, 0.0)).rgb
                  + texture2D(tDiffuse, uvIn + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, uvIn - vec2(0.0, uTexel.y)).rgb;
          col += clamp(dot(col - nb * 0.25, LUMA) * uSharpen, -0.045, 0.045);
        }
      }
      // drop highlights
      col = mix(col, col * 0.85 + vec3(0.06), dr.z * 0.5);
      // filmic grade: lift / gamma / gain, split toning (cool shadows, warm highlights)
      col = max(col, 0.0);
      col = col * uGain + uLift * (1.0 - col);
      col = pow(col, uGamma);
      float lg = dot(col, LUMA);
      col += uShadowTint * (1.0 - smoothstep(0.0, 0.5, lg)) + uHighTint * smoothstep(0.35, 1.0, lg);
      // saturation with vibrance (muted colours gain more than already vivid ones)
      float l = dot(col, LUMA);
      float chroma = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
      col = mix(vec3(l), col, uSat + uVibrance * (1.0 - smoothstep(0.0, 0.5, chroma)));
      col = (col - 0.5) * uContrast + 0.5;
      // nitro energy: faint cold glow breathing at the frame edge
      col += vec3(0.12, 0.42, 1.0) * edge * edge * (0.05 + 0.03 * sin(uTime * 23.0 + dist * 40.0));
      col = mix(col, col * uTint, uTintAmt);
      // vignette
      float v = smoothstep(0.95, 0.25, dist * (1.0 + uVignette));
      col *= mix(1.0, v, uVignette * 1.6);
      // damage pulse (red edges)
      col = mix(col, vec3(0.9, 0.05, 0.02), uDamage * smoothstep(0.3, 0.75, dist));
      // grain
      float n = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime * 7.31)) - 0.5;
      col += n * uGrain;
      col = mix(col, uFlashColor, uFlash);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

export class Engine {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.id = 'gl';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;
    setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 6000);
    this.scene = new THREE.Scene();
    this.time = 0;
    this.dt = 0;
    this.fps = 60;
    this.frameMs = 16;
    this.dynScale = 1;
    this.onUpdate = null;
    this.paused = false;
    this._last = performance.now();
    this._fpsAcc = 0; this._fpsFrames = 0;
    this._slowTime = 0; this._fastTime = 0;
    // cinematic look (grade + sun for the lens) is remembered per scene, so the
    // garage stays neutral and a replay keeps its race's look
    this._looks = new WeakMap();
    this.look = this._newLook();
    this._looks.set(this.scene, this.look);
    this._bloomBase = [0.55, 0.6, 0.86];

    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applyQuality() {
    const q = Save.quality;
    this.quality = q;
    const r = this.renderer;
    r.shadowMap.enabled = q.shadows > 0;
    r.shadowMap.needsUpdate = true;
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    this.lens?.dispose(); this.bloom?.dispose?.(); this.aaPass?.dispose?.(); this.finalPass?.dispose?.(); this.gtao?.dispose?.();
    this.lens = null; this.aaPass = null; this.gtao = null;
    const tier = q.post ? (TIER[Save.settings.quality] || 2) : 0;
    this.tier = tier;
    if (q.post) {
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
        type: THREE.HalfFloatType, samples: q.msaa,
      });
      const composer = new EffectComposer(r, rt);
      this.renderPass = new RenderPass(this.scene, this.camera);
      composer.addPass(this.renderPass);
      // ground-truth ambient occlusion for the showroom (scenes flagged userData.ao): dark
      // crevices round the engine, under the tank and between the parts, contact shadows
      this.gtao = new GTAOPass(this.scene || new THREE.Scene(), this.camera, Math.max(1, size.x), Math.max(1, size.y));
      this.gtao.updateGtaoMaterial({ radius: 0.2, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: q.msaa ? 16 : 12, distanceFallOff: 1, screenSpaceRadius: false });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
      this.gtao.blendIntensity = 1;
      this.gtao.enabled = !!this.scene?.userData?.ao;
      composer.addPass(this.gtao);
      // lens work reads the clean HDR frame (before bloom) at 1/4 res
      this.lens = new LensFX(tier);
      composer.addPass(this.lens.prepass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.6, 0.86);
      this.bloom.enabled = q.bloom;
      composer.addPass(this.bloom);
      // lens composite + tone mapping + sRGB (replaces OutputPass)
      composer.addPass(this.lens.composite);
      // no MSAA on this preset: FXAA on the display image
      if (!q.msaa) { this.aaPass = new ShaderPass(FXAAShader); composer.addPass(this.aaPass); }
      this.finalPass = new ShaderPass(FinalShader);
      this.finalPass.uniforms.uSharpen.value = tier === 1 ? 0.45 : tier === 3 ? 0.3 : 0.4;
      composer.addPass(this.finalPass);
      this.composer = composer;
    } else {
      this.bloom = null; this.finalPass = null;
    }
    this._applyLook();
    this.resize();
  }

  setScene(scene, camera = this.camera) {
    if (scene !== this.scene) {
      this.look = this._looks.get(scene) || this._newLook();
      this._looks.set(scene, this.look);
      this._applyLook();
    }
    this.scene = scene;
    this.camera = camera;
    if (this.renderPass) { this.renderPass.scene = scene; this.renderPass.camera = camera; }
    if (this.gtao) { this.gtao.scene = scene; this.gtao.camera = camera; this.gtao.enabled = !!scene.userData.ao; }
    if (this.finalPass) this.finalPass.uniforms.uShimmer.value = 0;
    this.resize();
  }

  setBloom(strength = 0.55, radius = 0.6, threshold = 0.86) {
    const b = this._bloomBase;
    b[0] = strength; b[1] = radius; b[2] = threshold;
    if (!this.bloom) return;
    this.bloom.strength = strength * this.look.grade.bloom; this.bloom.radius = radius; this.bloom.threshold = threshold;
  }

  // Filmic look for the current scene: time of day ('day', 'sunset', 'night'…,
  // 'neutral' for menus) adjusted by weather ('rain', 'storm', 'fog'…). Cached.
  setGrade(time = 'neutral', weather = 'clear') {
    const L = this.look;
    if (L.time === time && L.weather === weather) return;
    L.time = time; L.weather = weather;
    L.grade = resolveGrade(time, weather);
    this._applyLook();
  }

  // Sun (or moon) for shafts and lens glare: world direction, colour, strength 0..1.
  setSun(dir, color, amount = 1) {
    const L = this.look;
    L.sunDir.copy(dir).normalize();
    L.sunColor.set(color);
    L.sunAmt = amount;
  }

  _newLook() {
    return { time: 'neutral', weather: 'clear', grade: resolveGrade('neutral'), sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color(1, 1, 1), sunAmt: 0 };
  }

  _applyLook() {
    const g = this.look.grade;
    const b = this._bloomBase;
    if (this.bloom) this.bloom.strength = b[0] * g.bloom;
    if (this.lens) this.lens.setLook(g);
    if (!this.finalPass) return;
    const u = this.finalPass.uniforms;
    u.uLift.value.fromArray(g.lift);
    u.uGamma.value.fromArray(g.gamma);
    u.uGain.value.fromArray(g.gain);
    u.uShadowTint.value.fromArray(g.shadow);
    u.uHighTint.value.fromArray(g.high);
    u.uSat.value = g.sat; u.uContrast.value = g.contrast; u.uVibrance.value = g.vib;
  }

  // project the sun into screen space; fades out off screen / behind the camera
  _updateSun() {
    const L = this.look, cam = this.camera;
    let vis = 0, x = 0.5, y = 0.5;
    if (L.sunAmt > 0 && cam.isPerspectiveCamera) {
      cam.updateMatrixWorld();
      cam.getWorldDirection(_fwd);
      const facing = _fwd.dot(L.sunDir);
      if (facing > 0.05) {
        _v.setFromMatrixPosition(cam.matrixWorld).add(L.sunDir).project(cam);
        x = _v.x * 0.5 + 0.5; y = _v.y * 0.5 + 0.5;
        const off = Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5)) - 0.5;
        vis = L.sunAmt * clamp(1 - off / 0.35, 0, 1) * clamp((facing - 0.05) / 0.25, 0, 1);
      }
    }
    this.lens.setSun(x, y, vis, L.sunColor);
  }

  get fx() { return this.finalPass ? this.finalPass.uniforms : null; }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const q = this.quality || Save.quality;
    const dpr = Math.min(window.devicePixelRatio || 1, q.maxDpr);
    const scale = dpr * q.pixelRatio * (Save.settings.resScale || 1) * this.dynScale;
    this.renderer.setPixelRatio(clamp(scale, 0.35, 3));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    if (this.finalPass) this.finalPass.uniforms.uAspect.value = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      const buf = this.renderer.getDrawingBufferSize(_buf);
      this.finalPass.uniforms.uTexel.value.set(1 / Math.max(1, buf.x), 1 / Math.max(1, buf.y));
      if (this.aaPass) this.aaPass.uniforms.uTexel.value.set(1 / Math.max(1, buf.x), 1 / Math.max(1, buf.y));
    }
    this.width = w; this.height = h;
  }

  start() {
    const loop = (now) => {
      requestAnimationFrame(loop);
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (dt > 0.1) dt = 0.1;
      if (dt <= 0) dt = 0.0001;
      this.dt = dt;
      this.time += dt;
      this._fpsAcc += dt; this._fpsFrames++;
      if (this._fpsAcc >= 0.5) {
        this.fps = this._fpsFrames / this._fpsAcc;
        this._fpsAcc = 0; this._fpsFrames = 0;
        this._adapt();
      }
      try {
        if (this.onUpdate) this.onUpdate(dt);
        this.render();
      } catch (e) {
        console.error(e);
        if (this.onError) this.onError(e);
      }
    };
    requestAnimationFrame(loop);
  }

  // Dynamic resolution keeps the frame rate smooth on weaker GPUs.
  _adapt() {
    if (!this.adaptive) return;
    if (this.fps < 45) { this._slowTime += 0.5; this._fastTime = 0; }
    else if (this.fps > 58) { this._fastTime += 0.5; this._slowTime = 0; }
    else { this._slowTime = 0; this._fastTime = 0; }
    if (this._slowTime >= 1.5 && this.dynScale > 0.55) { this.dynScale = Math.max(0.55, this.dynScale - 0.1); this._slowTime = 0; this.resize(); }
    if (this._fastTime >= 4 && this.dynScale < 1) { this.dynScale = Math.min(1, this.dynScale + 0.05); this._fastTime = 0; this.resize(); }
  }

  render() {
    if (this.finalPass) this.finalPass.uniforms.uTime.value = this.time;
    if (this.lens) this._updateSun();
    if (this.composer) this.composer.render(this.dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
