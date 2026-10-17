// Renderer, post-processing chain and main loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Save } from './Settings.js';
import { setMaxAnisotropy } from './textures.js';
import { clamp } from './utils.js';

// Display-space grading: radial speed blur, chromatic aberration, vignette,
// grain, flash and tint. Runs after tone mapping.
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uBlur: { value: 0 },
    uCA: { value: 0.0015 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintAmt: { value: 0 },
    uSat: { value: 1.08 },
    uContrast: { value: 1.04 },
    uCenter: { value: new THREE.Vector2(0.5, 0.52) },
    uDamage: { value: 0 },
    uRain: { value: 0 },
    uSpeed: { value: 0 },
    uAspect: { value: 1.7 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uBlur, uCA, uVignette, uGrain, uFlash, uTintAmt, uSat, uContrast, uDamage, uRain, uSpeed, uAspect;
    uniform vec3 uFlashColor, uTint;
    uniform vec2 uCenter;
    varying vec2 vUv;
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
      }
      // drop highlights
      col = mix(col, col * 0.85 + vec3(0.06), dr.z * 0.5);
      // grading
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col = mix(col, col * uTint, uTintAmt);
      // vignette
      float v = smoothstep(0.95, 0.25, dist * (1.0 + uVignette));
      col *= mix(1.0, v, uVignette * 2.2);
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
    if (q.post) {
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
        type: THREE.HalfFloatType, samples: q.msaa,
      });
      const composer = new EffectComposer(r, rt);
      this.renderPass = new RenderPass(this.scene, this.camera);
      composer.addPass(this.renderPass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.6, 0.86);
      this.bloom.enabled = q.bloom;
      composer.addPass(this.bloom);
      composer.addPass(new OutputPass());
      this.finalPass = new ShaderPass(FinalShader);
      composer.addPass(this.finalPass);
      this.composer = composer;
    } else {
      this.bloom = null; this.finalPass = null;
    }
    this.resize();
  }

  setScene(scene, camera = this.camera) {
    this.scene = scene;
    this.camera = camera;
    if (this.renderPass) { this.renderPass.scene = scene; this.renderPass.camera = camera; }
    this.resize();
  }

  setBloom(strength = 0.55, radius = 0.6, threshold = 0.86) {
    if (!this.bloom) return;
    this.bloom.strength = strength; this.bloom.radius = radius; this.bloom.threshold = threshold;
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
    if (this.composer) this.composer.render(this.dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
