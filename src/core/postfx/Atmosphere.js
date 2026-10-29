// Aerial perspective from the depth buffer: every opaque pixel is attenuated by the
// air between it and the camera (height-dependent haze: denser in the valleys, thinner
// on the peaks) and gains the light that air scatters toward the eye, taken from the
// physical sky table in that viewing direction (bright and warm toward the sun, blue
// away from it). Runs in HDR right after the scene render; the sky itself (depth = 1)
// is left to the sky shader. Replaces the scene's built-in fog while it is active.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { SKY_GLSL } from '../../track/PhysicalSky.js';

const SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tSky: { value: null },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uDensity: { value: 2e-4 },
    uFalloff: { value: 1 / 300 },
    uBaseY: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uMinElev: { value: 0.012 },
    uSkyMix: { value: 1 },
    uFogColor: { value: new THREE.Color(0.6, 0.7, 0.8) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tDepth, tSky;
    uniform mat4 uProjInv, uCamWorld;
    uniform vec3 uCamPos, uSun, uTint, uFogColor;
    uniform float uDensity, uFalloff, uBaseY, uMinElev, uSkyMix;
    varying vec2 vUv;
    ${SKY_GLSL}
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float z = texture2D(tDepth, vUv).x;
      if (z >= 0.999999) { gl_FragColor = c; return; }
      vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
      vp.xyz /= vp.w;
      vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
      vec3 rd = wp - uCamPos;
      float d = length(rd);
      rd /= max(d, 1e-4);
      // optical depth through an exponential height distribution of haze
      float h0 = uCamPos.y - uBaseY, h1 = wp.y - uBaseY;
      float k = uFalloff, dh = h1 - h0;
      float f0 = exp(-k * max(h0, -50.0));
      float od = abs(dh) > 0.05 ? uDensity * d * (f0 - exp(-k * max(h1, -50.0))) / (k * dh) : uDensity * d * f0;
      vec3 T = exp(-od * uTint);
      vec3 dir = rd; dir.y = max(dir.y, uMinElev); dir = normalize(dir);
      vec3 L = mix(uFogColor, skyRadiance(tSky, dir, uSun), uSkyMix);
      c.rgb = c.rgb * T + L * (1.0 - T);
      gl_FragColor = c;
    }
  `,
};

export class AtmospherePass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SHADER.uniforms),
      vertexShader: SHADER.vertexShader, fragmentShader: SHADER.fragmentShader,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    this.camera = null;
    this.atmo = null;
  }

  // atmo: { sky (DataTexture), sunDir, density, falloff, baseY, tint [r,g,b], fogColor }
  setAtmo(atmo) {
    this.atmo = atmo;
    this.enabled = !!atmo;
    if (!atmo) return;
    const u = this.material.uniforms;
    u.tSky.value = atmo.sky || null;
    u.uSkyMix.value = atmo.sky ? 1 : 0;
    u.uSun.value.copy(atmo.sunDir);
    u.uDensity.value = atmo.density;
    u.uFalloff.value = 1 / atmo.falloff;
    u.uBaseY.value = atmo.baseY;
    u.uTint.value.fromArray(atmo.tint || [1, 1, 1]);
    u.uFogColor.value.copy(atmo.fogColor);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms, cam = this.camera;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    if (cam) {
      cam.updateMatrixWorld();
      u.uProjInv.value.copy(cam.projectionMatrixInverse);
      u.uCamWorld.value.copy(cam.matrixWorld);
      u.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}
