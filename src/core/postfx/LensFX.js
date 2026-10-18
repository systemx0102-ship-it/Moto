// Cinematic lens simulation, all done at low resolution in HDR before tone mapping:
//  · anamorphic streaks: horizontal-only pyramid of the bright-pass (stretched glare)
//  · ghosts + chromatic halo from a 1/8 bright image, modulated by procedural lens dirt
//  · crepuscular rays: 3-pass radial blur of the sky around the sun at 1/4 res
// `prepass` sits right after the RenderPass (reads the clean HDR frame, no swap);
// `composite` replaces OutputPass: adds the lens light, tone maps and encodes sRGB.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { lensDirtTexture } from './dirt.js';

const VS = /* glsl */`
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;

// 4 bilinear taps = 4x4 box: exposure, soft-knee threshold, clamp (alpha = sun-shaft source)
const BRIGHT = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 uTexel, uSun;
  uniform float uExposure, uThreshold, uClamp, uRayThr, uRayR, uRayOn, uAspect;
  varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
    c += texture2D(tDiffuse, vUv + uTexel * vec2(1.0, -1.0)).rgb;
    c += texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
    c += texture2D(tDiffuse, vUv + uTexel * vec2(1.0, 1.0)).rgb;
    c *= 0.25 * uExposure;
    float br = max(c.r, max(c.g, c.b));
    // a single NaN/Inf pixel would smear across the whole frame through the blurs
    if (!(br < 6e4) || !(min(c.r, min(c.g, c.b)) >= 0.0)) { c = vec3(0.0); br = 0.0; }
    // keep the sun disk / fireflies from swamping everything
    c *= min(1.0, uClamp / max(br, 1e-4));
    br = min(br, uClamp);
    float knee = uThreshold * 0.5;
    float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    vec3 b = c * (max(soft, br - uThreshold) / max(br, 1e-4));
    float ray = 0.0;
    if (uRayOn > 0.5) {
      vec2 d = (vUv - uSun) * vec2(uAspect, 1.0);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      ray = smoothstep(uRayThr, uRayThr * 2.5, l) * exp(-dot(d, d) / (uRayR * uRayR));
    }
    gl_FragColor = vec4(b, ray);
  }
`;

// 2x box downsample (4 bilinear taps)
const DOWN = /* glsl */`
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
    gl_FragColor = vec4(c * 0.25, 1.0);
  }
`;

// 3x3 bilinear tent (~6x6 texels): smooth glow that lights the lens dirt
const BLUR = /* glsl */`
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main(){
    vec2 o = uTexel * 1.5;
    vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
    c += (texture2D(tSrc, vUv + vec2(o.x, 0.0)).rgb + texture2D(tSrc, vUv - vec2(o.x, 0.0)).rgb
        + texture2D(tSrc, vUv + vec2(0.0, o.y)).rgb + texture2D(tSrc, vUv - vec2(0.0, o.y)).rgb) * 2.0;
    c += texture2D(tSrc, vUv + o).rgb + texture2D(tSrc, vUv - o).rgb
       + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb;
    gl_FragColor = vec4(c / 16.0, 1.0);
  }
`;

// Lens ghosts: scaled / mirrored copies of the bright image around the optical
// centre with per-channel dispersion, plus a chromatic halo ring.
const GHOSTS = /* glsl */`
  uniform sampler2D tSrc, tSoft;
  uniform float uAspect, uHalo;
  varying vec2 vUv;
  vec3 ghost(sampler2D t, float s, float ca) {
    vec2 p = (vUv - 0.5) * s;
    float w = (1.0 - smoothstep(0.28, 0.5, abs(p.x))) * (1.0 - smoothstep(0.28, 0.5, abs(p.y)));
    // sources near the optical centre make the strongest ghosts
    w *= 1.0 - smoothstep(0.0, 0.62, length(p * vec2(uAspect, 1.0)) / uAspect);
    return vec3(texture2D(t, p * (1.0 + ca) + 0.5).r, texture2D(t, p + 0.5).g, texture2D(t, p * (1.0 - ca) + 0.5).b) * w;
  }
  vec2 haloUv(vec2 x, float h) {
    float l = max(length(x), 1e-4);
    return x / l * (h - l) / vec2(uAspect, 1.0) + 0.5;
  }
  void main(){
    vec3 acc = ghost(tSrc, -1.0, 0.03) * vec3(0.16, 0.14, 0.26) + ghost(tSoft, -1.0, 0.05) * vec3(0.3, 0.26, 0.5);
    acc += ghost(tSoft, -0.55, 0.06) * vec3(0.1, 0.2, 0.32);
    acc += ghost(tSoft, -2.1, 0.04) * vec3(0.85, 0.5, 0.22);
    acc += ghost(tSoft, 1.8, 0.03) * vec3(0.25, 0.55, 0.32);
  #if GHOSTS > 4
    acc += ghost(tSoft, -0.33, 0.08) * vec3(0.06, 0.1, 0.24);
    acc += ghost(tSoft, -3.4, 0.03) * vec3(0.6, 0.3, 0.5);
  #endif
    // halo: a ring of radius uHalo for light near the centre, rainbow edged
    vec2 x = (vUv - 0.5) * vec2(uAspect, 1.0);
    vec2 hr = haloUv(x, uHalo * 1.04), hg = haloUv(x, uHalo), hb = haloUv(x, uHalo * 0.96);
    float hw = pow(clamp(1.0 - length((hg - 0.5) * vec2(uAspect, 1.0)) / 0.45, 0.0, 1.0), 4.0);
    acc += vec3(texture2D(tSoft, hr).r, texture2D(tSoft, hg).g, texture2D(tSoft, hb).b) * hw * 0.3;
    gl_FragColor = vec4(acc, 1.0);
  }
`;

// Anamorphic streak pyramid (after Keijiro's Kino Streak). The source keeps only
// compact highlights (bright minus its wide glow) so lamps and tail lights streak
// while big lit areas (sky, wet-road reflections) do not smear sideways.
const STREAK_PRE = /* glsl */`
  uniform sampler2D tSrc, tBlur;
  uniform float uIsolate, uCut;
  varying vec2 vUv;
  void main(){
    vec3 c = max(texture2D(tSrc, vUv).rgb - texture2D(tBlur, vUv).rgb * uIsolate, 0.0);
    float br = max(c.r, max(c.g, c.b));
    gl_FragColor = vec4(c * (max(br - uCut, 0.0) / max(br, 1e-4)), 1.0);
  }
`;
// halve the width only
const STREAK_DOWN = /* glsl */`
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main(){
    float dx = uTexel.x;
    vec3 c = texture2D(tSrc, vUv - vec2(dx * 3.0, 0.0)).rgb + texture2D(tSrc, vUv - vec2(dx, 0.0)).rgb
           + texture2D(tSrc, vUv + vec2(dx, 0.0)).rgb + texture2D(tSrc, vUv + vec2(dx * 3.0, 0.0)).rgb;
    gl_FragColor = vec4(c * 0.25, 1.0);
  }
`;
const STREAK_UP = /* glsl */`
  uniform sampler2D tLow, tHigh;
  uniform vec2 uTexel;
  uniform float uStretch;
  varying vec2 vUv;
  void main(){
    float dx = uTexel.x * 1.5;
    vec3 lo = texture2D(tLow, vUv - vec2(dx, 0.0)).rgb * 0.25 + texture2D(tLow, vUv).rgb * 0.5 + texture2D(tLow, vUv + vec2(dx, 0.0)).rgb * 0.25;
    gl_FragColor = vec4(mix(texture2D(tHigh, vUv).rgb, lo, uStretch), 1.0);
  }
`;

// Sun shafts: radial blur toward the sun, never past it (8 taps per pass)
const RAYS = /* glsl */`
  uniform sampler2D tSrc;
  uniform vec2 uSun;
  uniform float uStep, uAlpha;
  varying vec2 vUv;
  void main(){
    vec2 delta = uSun - vUv;
    float dist = length(delta);
    vec2 stepv = delta * (uStep / max(dist, 1e-5));
    float iters = dist / uStep;
    vec2 uv = vUv;
    float acc = 0.0, n = 0.0;
    for (int i = 0; i < 8; i++) {
      if (float(i) <= iters) { vec4 t = texture2D(tSrc, uv); acc += mix(t.r, t.a, uAlpha); n += 1.0; }
      uv += stepv;
    }
    gl_FragColor = vec4(acc / max(n, 1.0));
  }
`;

// Full-res composite + tone mapping + sRGB (same chunks as three's OutputPass)
const COMPOSITE_VS = /* glsl */`
  precision highp float;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const COMPOSITE_FS = /* glsl */`
  precision highp float;
  uniform sampler2D tDiffuse, tStreak, tFlare, tGlow, tDirt, tRays;
  uniform vec3 uStreakTint, uRayColor, uSunGlare;
  uniform vec2 uSunPos;
  uniform float uStreak, uFlare, uDirt, uRays, uInvExposure, uAspect;
  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>
  varying vec2 vUv;
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    vec3 dirt = texture2D(tDirt, vUv).rgb;
    vec3 lens = texture2D(tStreak, vUv).rgb * uStreakTint * uStreak;
    lens += texture2D(tFlare, vUv).rgb * uFlare * (0.45 + dirt * 1.6);
    lens += texture2D(tGlow, vUv).rgb * dirt * uDirt;
    if (uRays > 0.0) {
      // squared so open sky reads as shafts and occluders cut clear gaps
      float ry = texture2D(tRays, vUv).r;
      lens += pow(ry, 1.4) * 1.6 * uRayColor * uRays;
      // sun glare on the dirty glass + a faint veil, scaled by how open the sky around the sun is
      float open = texture2D(tRays, uSunPos).r;
      float r = length((vUv - uSunPos) * vec2(uAspect, 1.0));
      lens += uSunGlare * open * (dot(dirt, vec3(0.333)) * exp(-r * 3.5) + exp(-r * 2.0) * 0.02);
    }
    #ifdef LENS_ONLY
      c.rgb = vec3(0.0);
    #endif
    c.rgb += lens * uInvExposure;
    #if defined( ACES_FILMIC_TONE_MAPPING )
      c.rgb = ACESFilmicToneMapping(c.rgb);
    #elif defined( AGX_TONE_MAPPING )
      c.rgb = AgXToneMapping(c.rgb);
    #elif defined( NEUTRAL_TONE_MAPPING )
      c.rgb = NeutralToneMapping(c.rgb);
    #elif defined( REINHARD_TONE_MAPPING )
      c.rgb = ReinhardToneMapping(c.rgb);
    #elif defined( CINEON_TONE_MAPPING )
      c.rgb = CineonToneMapping(c.rgb);
    #elif defined( LINEAR_TONE_MAPPING )
      c.rgb = LinearToneMapping(c.rgb);
    #endif
    #ifdef SRGB_TRANSFER
      c = sRGBTransferOETF(c);
    #endif
    gl_FragColor = c;
  }
`;

// grade amounts are ~0..1; these map them to energy that reads well on screen
const STREAK_GAIN = 3, FLARE_GAIN = 2.5;

const TONE_DEFINES = {
  [THREE.LinearToneMapping]: 'LINEAR_TONE_MAPPING', [THREE.ReinhardToneMapping]: 'REINHARD_TONE_MAPPING',
  [THREE.CineonToneMapping]: 'CINEON_TONE_MAPPING', [THREE.ACESFilmicToneMapping]: 'ACES_FILMIC_TONE_MAPPING',
  [THREE.AgXToneMapping]: 'AGX_TONE_MAPPING', [THREE.NeutralToneMapping]: 'NEUTRAL_TONE_MAPPING',
};

const mat = (fs, uniforms, defines = {}) => new THREE.ShaderMaterial({
  uniforms, defines, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
});
const tex = () => ({ value: null });
const v2 = () => ({ value: new THREE.Vector2() });
const f = (x = 0) => ({ value: x });

class LensPrepass extends Pass {
  constructor(fx) { super(); this.fx = fx; this.needsSwap = false; }
  setSize(w, h) { this.fx.setSize(w, h); }
  render(renderer, writeBuffer, readBuffer) { this.fx.prepare(renderer, readBuffer); }
}

class LensComposite extends Pass {
  constructor(fx) {
    super();
    this.fx = fx;
    this.uniforms = {
      tDiffuse: tex(), tStreak: tex(), tFlare: tex(), tGlow: tex(), tDirt: { value: lensDirtTexture() }, tRays: tex(),
      uStreakTint: { value: new THREE.Color() }, uRayColor: { value: new THREE.Color() }, uSunGlare: { value: new THREE.Color() },
      uSunPos: { value: new THREE.Vector2(0.5, 0.5) }, uStreak: f(), uFlare: f(), uDirt: f(), uRays: f(), uInvExposure: f(1), uAspect: f(1.7),
      toneMappingExposure: f(1),
    };
    this.material = new THREE.RawShaderMaterial({ uniforms: this.uniforms, vertexShader: COMPOSITE_VS, fragmentShader: COMPOSITE_FS, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.material);
    this._cs = null; this._tm = null;
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.toneMappingExposure.value = renderer.toneMappingExposure;
    u.uInvExposure.value = 1 / Math.max(1e-3, renderer.toneMappingExposure);
    if (this._cs !== renderer.outputColorSpace || this._tm !== renderer.toneMapping || this._dbg !== this.fx.debug) {
      this._cs = renderer.outputColorSpace; this._tm = renderer.toneMapping; this._dbg = this.fx.debug;
      const d = {};
      if (THREE.ColorManagement.getTransfer(this._cs) === THREE.SRGBTransfer) d.SRGB_TRANSFER = '';
      if (TONE_DEFINES[this._tm]) d[TONE_DEFINES[this._tm]] = '';
      // dev: lens.debug = true shows only the lens light
      if (this._dbg) d.LENS_ONLY = '';
      this.material.defines = d;
      this.material.needsUpdate = true;
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose() { this.material.dispose(); this.quad.dispose(); }
}

export class LensFX {
  // tier: 1 medio, 2 alto, 3 ultra
  constructor(tier = 2) {
    this.tier = tier;
    this.maxLevels = tier >= 3 ? 7 : tier >= 2 ? 6 : 5;
    // look (set from the grade) and sun state (set by the engine every frame)
    this.p = { streak: 0, flare: 0, dirt: 0, rays: 0, thr: 1.5, rayThr: 0.7, rayLen: 0.7, stretch: 0.86 };
    this.streakTint = new THREE.Color(0.5, 0.72, 1);
    this.rayTint = new THREE.Color(1, 1, 1);
    this.sunPos = new THREE.Vector2(0.5, 0.5);
    this.sunColor = new THREE.Color(1, 1, 1);
    this.sunVis = 0;
    this.aspect = 1.7;
    this.debug = false;
    this.quad = new FullScreenQuad(null);
    this.mBright = mat(BRIGHT, { tDiffuse: tex(), uTexel: v2(), uSun: v2(), uExposure: f(1), uThreshold: f(1.5), uClamp: f(10), uRayThr: f(0.7), uRayR: f(0.3), uRayOn: f(), uAspect: f(1.7) });
    this.mDown = mat(DOWN, { tSrc: tex(), uTexel: v2() });
    this.mBlur = mat(BLUR, { tSrc: tex(), uTexel: v2() });
    this.mGhost = mat(GHOSTS, { tSrc: tex(), tSoft: tex(), uAspect: f(1.7), uHalo: f(0.42) }, { GHOSTS: tier >= 2 ? 6 : 4 });
    this.mSPre = mat(STREAK_PRE, { tSrc: tex(), tBlur: tex(), uIsolate: f(0.9), uCut: f(1) });
    this.mSDown = mat(STREAK_DOWN, { tSrc: tex(), uTexel: v2() });
    this.mSUp = mat(STREAK_UP, { tLow: tex(), tHigh: tex(), uTexel: v2(), uStretch: f(0.86) });
    this.mRays = mat(RAYS, { tSrc: tex(), uSun: v2(), uStep: f(0.1), uAlpha: f() });
    this.rts = [];
    this.down = []; this.up = [];
    this.prepass = new LensPrepass(this);
    this.composite = new LensComposite(this);
    this._w = 0; this._h = 0;
  }

  _rt(w, h) {
    const rt = new THREE.WebGLRenderTarget(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), {
      type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.rts.push(rt);
    return rt;
  }

  setSize(w, h) {
    w = Math.max(16, Math.round(w)); h = Math.max(16, Math.round(h));
    if (w === this._w && h === this._h) return;
    this._w = w; this._h = h;
    this.aspect = w / h;
    for (const rt of this.rts) rt.dispose();
    this.rts = [];
    const bw = Math.max(8, Math.round(w / 4)), bh = Math.max(4, Math.round(h / 4));
    this.bright = this._rt(bw, bh);
    this.q8 = this._rt(bw / 2, bh / 2);
    this.q16 = this._rt(bw / 4, bh / 4);
    this.glow = this._rt(bw / 4, bh / 4);
    this.flare = this._rt(bw / 2, bh / 2);
    this.raysA = this._rt(bw, bh);
    this.raysB = this._rt(bw, bh);
    // streak pyramid: widths halve, height stays at 1/4 so the lines stay thin
    const levels = Math.max(2, Math.min(this.maxLevels, Math.floor(Math.log2(bw / 6))));
    this.down = [this._rt(bw, bh)];
    this.up = [];
    for (let i = 1; i <= levels; i++) this.down.push(this._rt(bw >> i, bh));
    for (let i = 0; i < levels; i++) this.up.push(this._rt(i === 0 ? bw : bw >> i, bh));
    const u = this.composite.uniforms;
    u.tStreak.value = this.up[0].texture;
    u.tFlare.value = this.flare.texture;
    u.tGlow.value = this.glow.texture;
    u.tRays.value = this.raysA.texture;
    u.uAspect.value = this.aspect;
  }

  // look parameters from a resolved grade (see grades.js)
  setLook(g) {
    const p = this.p;
    p.streak = g.streak; p.flare = g.flare; p.dirt = g.dirt; p.rays = g.rays;
    p.thr = g.thr; p.rayThr = g.rayThr; p.rayLen = g.rayLen; p.stretch = g.stretch;
    this.streakTint.setRGB(...g.streakTint);
    this.rayTint.setRGB(...g.rayTint);
  }

  setSun(x, y, vis, color) {
    this.sunPos.set(x, y);
    this.sunVis = vis;
    this.sunColor.copy(color);
  }

  _draw(renderer, m, rt) {
    this.quad.material = m;
    renderer.setRenderTarget(rt);
    this.quad.render(renderer);
  }

  prepare(renderer, src) {
    const p = this.p, u = this.composite.uniforms;
    const rays = p.rays * this.sunVis;
    const doRays = rays > 0.002;
    const doFlare = p.flare > 0.001 || p.dirt > 0.001;
    const doStreak = p.streak > 0.001;
    // what the composite may use this frame (stale targets are weighted by zero)
    u.uStreak.value = doStreak ? p.streak * STREAK_GAIN : 0;
    u.uFlare.value = doFlare ? p.flare * FLARE_GAIN : 0;
    u.uDirt.value = doFlare ? p.dirt : 0;
    u.uRays.value = doRays ? rays : 0;
    if (!doRays && !doFlare && !doStreak) return;
    u.uStreakTint.value.copy(this.streakTint);
    u.uRayColor.value.copy(this.sunColor).multiply(this.rayTint);
    u.uSunGlare.value.copy(this.sunColor).multiplyScalar(this.sunVis * p.dirt);
    u.uSunPos.value.copy(this.sunPos);

    // bright pass (+ sky mask around the sun in alpha)
    let m = this.mBright, U = m.uniforms;
    U.tDiffuse.value = src.texture;
    U.uTexel.value.set(1 / src.width, 1 / src.height);
    U.uExposure.value = renderer.toneMappingExposure;
    U.uThreshold.value = p.thr;
    U.uRayThr.value = p.rayThr;
    U.uRayOn.value = doRays ? 1 : 0;
    U.uSun.value.copy(this.sunPos);
    U.uAspect.value = this.aspect;
    this._draw(renderer, m, this.bright);

    if (doFlare || doStreak) {
      // 1/8 and blurred 1/16 glow: ghost sources, dirt light, streak isolation
      m = this.mDown; U = m.uniforms;
      U.tSrc.value = this.bright.texture; U.uTexel.value.set(1 / this.bright.width, 1 / this.bright.height);
      this._draw(renderer, m, this.q8);
      U.tSrc.value = this.q8.texture; U.uTexel.value.set(1 / this.q8.width, 1 / this.q8.height);
      this._draw(renderer, m, this.q16);
      m = this.mBlur; U = m.uniforms;
      U.tSrc.value = this.q16.texture; U.uTexel.value.set(1 / this.q16.width, 1 / this.q16.height);
      this._draw(renderer, m, this.glow);
    }
    if (doFlare) {
      m = this.mGhost; U = m.uniforms;
      U.tSrc.value = this.q8.texture; U.tSoft.value = this.glow.texture; U.uAspect.value = this.aspect;
      this._draw(renderer, m, this.flare);
    }

    if (doStreak) {
      const D = this.down, Up = this.up, n = Up.length;
      m = this.mSPre; U = m.uniforms;
      U.tSrc.value = this.bright.texture; U.tBlur.value = this.glow.texture;
      this._draw(renderer, m, D[0]);
      m = this.mSDown; U = m.uniforms;
      for (let i = 1; i <= n; i++) {
        const s = D[i - 1];
        U.tSrc.value = s.texture; U.uTexel.value.set(1 / s.width, 1 / s.height);
        this._draw(renderer, m, D[i]);
      }
      m = this.mSUp; U = m.uniforms;
      U.uStretch.value = p.stretch;
      for (let i = n - 1; i >= 0; i--) {
        const lo = i === n - 1 ? D[n] : Up[i + 1];
        U.tLow.value = lo.texture; U.tHigh.value = D[i].texture;
        U.uTexel.value.set(1 / lo.width, 1 / lo.height);
        this._draw(renderer, m, Up[i]);
      }
    }

    if (doRays) {
      // three passes, each 8 taps with an 8x finer step: 512 effective samples
      m = this.mRays; U = m.uniforms;
      U.uSun.value.copy(this.sunPos);
      const L = p.rayLen;
      U.tSrc.value = this.bright.texture; U.uAlpha.value = 1; U.uStep.value = L / 8;
      this._draw(renderer, m, this.raysA);
      U.tSrc.value = this.raysA.texture; U.uAlpha.value = 0; U.uStep.value = L / 64;
      this._draw(renderer, m, this.raysB);
      U.tSrc.value = this.raysB.texture; U.uStep.value = L / 512;
      this._draw(renderer, m, this.raysA);
    }
  }

  dispose() {
    for (const rt of this.rts) rt.dispose();
    this.rts = [];
    for (const m of [this.mBright, this.mDown, this.mBlur, this.mGhost, this.mSPre, this.mSDown, this.mSUp, this.mRays]) m.dispose();
    this.composite.dispose();
  }
}
