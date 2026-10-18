// Compact FXAA (console variant, 5 taps on flat areas, 9 on edges) for presets
// without MSAA. Runs on the tone-mapped sRGB image.
import * as THREE from 'three';

export const FXAAShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main(){
      const vec3 L = vec3(0.299, 0.587, 0.114);
      vec3 rgbM = texture2D(tDiffuse, vUv).rgb;
      float lNW = dot(texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * uTexel).rgb, L);
      float lNE = dot(texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * uTexel).rgb, L);
      float lSW = dot(texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * uTexel).rgb, L);
      float lSE = dot(texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * uTexel).rgb, L);
      float lM = dot(rgbM, L);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      // flat area: nothing to smooth
      if (lMax - lMin < max(0.03, lMax * 0.12)) { gl_FragColor = vec4(rgbM, 1.0); return; }
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
      float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
      dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * uTexel;
      vec3 rgbA = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
      float lB = dot(rgbB, L);
      gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
    }
  `,
};
