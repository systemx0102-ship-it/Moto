// Physically based daytime sky. A Rayleigh / Mie / ozone atmosphere is integrated on
// the CPU (single scattering + an isotropic multiple-scattering term) into a small
// sky-view table indexed by azimuth from the sun and elevation; the dome shader adds
// the sun disk and a 2.5D cloud layer (fbm on a spherical shell, lit by the sun's
// transmittance through the cloud, powder darkening, forward scattering and sky
// ambient, hazed by aerial perspective). The same table feeds the image-based
// lighting, the sun colour, the hemisphere fill and the aerial perspective pass.
import * as THREE from 'three';
import { rng, clamp, smoothstep } from '../core/utils.js';

const RE = 6360e3, RA = 6460e3;
const BR = [5.802e-6, 13.558e-6, 33.1e-6], HR = 8000;
const BMS = 3.996e-6, BMA = 4.4e-6, HM = 1200;
const BO = [0.65e-6, 1.881e-6, 0.085e-6];
const PI = Math.PI;
const LUM = [0.2126, 0.7152, 0.0722];
const lum = (c) => c[0] * LUM[0] + c[1] * LUM[1] + c[2] * LUM[2];

// sky-view table resolution: azimuth from the sun (0..pi) x elevation (-pi/2..pi/2)
const SW = 96, SH = 128;
// transmittance table: altitude (sqrt mapped) x cos(sun zenith) in [-0.3, 1]
const TH = 32, TMU = 96;

function buildTransmittance(mie, ozone) {
  const T = new Float32Array(TH * TMU * 3);
  const od = [0, 0, 0];
  for (let i = 0; i < TH; i++) {
    const h = (i / (TH - 1)) ** 2 * (RA - RE);
    const r0 = RE + h;
    for (let j = 0; j < TMU; j++) {
      const mu = -0.3 + 1.3 * j / (TMU - 1);
      const dx = Math.sqrt(Math.max(0, 1 - mu * mu)), dy = mu;
      const b = r0 * dy;
      const discG = b * b - (r0 * r0 - RE * RE);
      const o = (i * TMU + j) * 3;
      // below the geometric horizon: soften over ~0.6 degrees so the terminator is not a hard step
      let shade = 1;
      if (discG >= 0 && -b - Math.sqrt(discG) > 0) {
        const muH = -Math.sqrt(Math.max(0, 1 - (RE / r0) ** 2));
        shade = smoothstep(muH - 0.012, muH + 0.004, mu);
        if (shade <= 0) { T[o] = T[o + 1] = T[o + 2] = 0; continue; }
      }
      const tA = -b + Math.sqrt(b * b - (r0 * r0 - RA * RA));
      od[0] = od[1] = od[2] = 0;
      const n = 48;
      for (let k = 0; k < n; k++) {
        const t0 = tA * (k / n) ** 2, t1 = tA * ((k + 1) / n) ** 2, t = (t0 + t1) * 0.5, ds = t1 - t0;
        const px = dx * t, py = r0 + dy * t;
        const hh = Math.max(0, Math.hypot(px, py) - RE);
        const dR = Math.exp(-hh / HR), dM = Math.exp(-hh / HM), dO = Math.max(0, 1 - Math.abs(hh - 25000) / 15000);
        for (let c = 0; c < 3; c++) od[c] += (BR[c] * dR + (BMS + BMA) * mie * dM + BO[c] * ozone * dO) * ds;
      }
      for (let c = 0; c < 3; c++) T[o + c] = Math.exp(-od[c]) * shade;
    }
  }
  return T;
}

function sampleT(T, h, mu, out) {
  const fi = Math.sqrt(clamp(h / (RA - RE), 0, 1)) * (TH - 1);
  const fj = clamp((mu + 0.3) / 1.3, 0, 1) * (TMU - 1);
  const i0 = Math.min(TH - 2, Math.floor(fi)), j0 = Math.min(TMU - 2, Math.floor(fj));
  const ti = fi - i0, tj = fj - j0;
  for (let c = 0; c < 3; c++) {
    const a = T[(i0 * TMU + j0) * 3 + c], b = T[(i0 * TMU + j0 + 1) * 3 + c];
    const d = T[((i0 + 1) * TMU + j0) * 3 + c], e = T[((i0 + 1) * TMU + j0 + 1) * 3 + c];
    out[c] = (a * (1 - tj) + b * tj) * (1 - ti) + (d * (1 - tj) + e * tj) * ti;
  }
  return out;
}

// Atmosphere radiance (per unit solar irradiance) along view direction d from camera altitude camH.
function makeIntegrator(T, sun, mie, ozone, ms, camH, groundAlbedo, rayBoost = 1) {
  const ts = [0, 0, 0], tg = [0, 0, 0], Tv = [1, 1, 1], L = [0, 0, 0];
  const g = 0.8, g2 = g * g;
  return (dx, dy, dz, out) => {
    const r0 = RE + camH;
    const b = r0 * dy;
    const discG = b * b - (r0 * r0 - RE * RE);
    let tmax = -b + Math.sqrt(b * b - (r0 * r0 - RA * RA));
    let ground = false;
    if (discG >= 0) { const tGround = -b - Math.sqrt(discG); if (tGround > 0) { tmax = tGround; ground = true; } }
    const mu = dx * sun[0] + dy * sun[1] + dz * sun[2];
    const pR = 3 / (16 * PI) * (1 + mu * mu);
    const pM = 3 / (8 * PI) * ((1 - g2) * (1 + mu * mu)) / ((2 + g2) * Math.pow(1 + g2 - 2 * g * mu, 1.5));
    L[0] = L[1] = L[2] = 0; Tv[0] = Tv[1] = Tv[2] = 1;
    const n = 40;
    for (let k = 0; k < n; k++) {
      const t0 = tmax * (k / n) ** 2, t1 = tmax * ((k + 1) / n) ** 2, t = (t0 + t1) * 0.5, ds = t1 - t0;
      // sample position (camera at (0, r0, 0))
      const px = dx * t, py = r0 + dy * t, pz = dz * t;
      const r = Math.hypot(px, py, pz);
      const h = Math.max(0, r - RE);
      const muS = (px * sun[0] + py * sun[1] + pz * sun[2]) / r;
      sampleT(T, h, muS, ts);
      // multiple scattering keeps twilight skies lit after the direct path is shadowed
      sampleT(T, h, Math.max(muS, -0.02) + 0.06, tg);
      const msW = smoothstep(-0.35, 0.05, muS);
      const dR = Math.exp(-h / HR), dM = Math.exp(-h / HM), dO = Math.max(0, 1 - Math.abs(h - 25000) / 15000);
      for (let c = 0; c < 3; c++) {
        const sR = BR[c] * dR, sM = BMS * mie * dM;
        const ext = sR + (BMS + BMA) * mie * dM + BO[c] * ozone * dO;
        // higher scattering orders are mostly Rayleigh light: a boost on the Rayleigh source term + an isotropic part
        const S = (sR * pR * rayBoost + sM * pM) * ts[c] + (sR * rayBoost + sM) * ms * (ts[c] * 0.6 + tg[c] * 0.4 * msW) / (4 * PI);
        const Ts = Math.exp(-ext * ds);
        L[c] += Tv[c] * S * (1 - Ts) / Math.max(ext, 1e-12);
        Tv[c] *= Ts;
      }
    }
    if (ground) {
      // lit ground seen through the atmosphere (lambertian, direct sun + a little sky)
      const px = dx * tmax, py = r0 + dy * tmax, pz = dz * tmax;
      const r = Math.hypot(px, py, pz);
      const muS = (px * sun[0] + py * sun[1] + pz * sun[2]) / r;
      sampleT(T, 0, muS, ts);
      for (let c = 0; c < 3; c++) L[c] += Tv[c] * groundAlbedo[c] / PI * (ts[c] * Math.max(muS, 0) + 0.08 * ts[c]);
    }
    out[0] = L[0]; out[1] = L[1]; out[2] = L[2];
    return out;
  };
}

// ---------------------------------------------------------------------------
// Tileable cloud noise: R = Perlin-Worley (billowy base), G/B = Worley fbm (detail), A = Perlin fbm
let noiseTex = null;
function cloudNoiseTexture() {
  if (noiseTex) return noiseTex;
  const N = 128;
  const perlin = (seed, P) => {
    const r = rng(seed), g = new Float32Array(P * P * 2);
    for (let i = 0; i < P * P; i++) { const a = r() * PI * 2; g[i * 2] = Math.cos(a); g[i * 2 + 1] = Math.sin(a); }
    const gr = (ix, iy, x, y) => { ix = ((ix % P) + P) % P; iy = ((iy % P) + P) % P; const k = (iy * P + ix) * 2; return g[k] * x + g[k + 1] * y; };
    return (u, v) => {
      const x = u * P, y = v * P, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10), sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      const a = gr(ix, iy, fx, fy), b = gr(ix + 1, iy, fx - 1, fy), c = gr(ix, iy + 1, fx, fy - 1), d = gr(ix + 1, iy + 1, fx - 1, fy - 1);
      return ((a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy) * 1.4;
    };
  };
  const worley = (seed, C) => {
    const r = rng(seed), pts = new Float32Array(C * C * 2);
    for (let i = 0; i < C * C * 2; i++) pts[i] = r();
    return (u, v) => {
      const x = u * C, y = v * C, ix = Math.floor(x), iy = Math.floor(y);
      let d = 9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j, wx = ((cx % C) + C) % C, wy = ((cy % C) + C) % C;
        const k = (wy * C + wx) * 2;
        const ddx = cx + pts[k] - x, ddy = cy + pts[k + 1] - y;
        d = Math.min(d, ddx * ddx + ddy * ddy);
      }
      return Math.min(1, Math.sqrt(d));
    };
  };
  const p4 = perlin(11, 4), p8 = perlin(12, 8), p16 = perlin(13, 16), p32 = perlin(14, 32);
  const w4 = worley(21, 4), w8 = worley(22, 8), w16 = worley(23, 16), w32 = worley(24, 32);
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      const pf = clamp((p4(u, v) * 0.55 + p8(u, v) * 0.3 + p16(u, v) * 0.15) * 0.5 + 0.5, 0, 1);
      const wf4 = (1 - w4(u, v)) * 0.625 + (1 - w8(u, v)) * 0.25 + (1 - w16(u, v)) * 0.125;
      // Perlin-Worley: perlin remapped by billowy worley
      const pw = clamp((pf - (wf4 - 1)) / (2 - wf4) * 1.0, 0, 1);
      const wf8 = (1 - w8(u, v)) * 0.625 + (1 - w16(u, v)) * 0.25 + (1 - w32(u, v)) * 0.125;
      const wf16 = (1 - w16(u, v)) * 0.7 + (1 - w32(u, v)) * 0.3;
      const ph = clamp((p16(u, v) * 0.6 + p32(u, v) * 0.4) * 0.5 + 0.5, 0, 1);
      const o = (y * N + x) * 4;
      data[o] = pw * 255; data[o + 1] = wf8 * 255; data[o + 2] = wf16 * 255; data[o + 3] = ph * 255;
    }
  }
  // rank-normalise every channel to a uniform distribution so coverage maps linearly
  const idx = new Uint32Array(N * N);
  for (let ch = 0; ch < 4; ch++) {
    for (let i = 0; i < N * N; i++) idx[i] = i;
    idx.sort((a, b) => data[a * 4 + ch] - data[b * 4 + ch]);
    const out = new Uint8Array(N * N);
    for (let r = 0; r < N * N; r++) out[idx[r]] = Math.round((r / (N * N - 1)) * 255);
    for (let i = 0; i < N * N; i++) data[i * 4 + ch] = out[i];
  }
  noiseTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

// shared GLSL: sky-table lookup by world direction
export const SKY_GLSL = /* glsl */`
  vec3 skyRadiance(sampler2D tSky, vec3 d, vec3 sun) {
    vec2 a = d.xz; float la = length(a);
    vec2 s = normalize(sun.xz + vec2(1e-5));
    float az = la > 1e-4 ? acos(clamp(dot(a / la, s), -1.0, 1.0)) / 3.14159265 : 0.5;
    float el = asin(clamp(d.y, -1.0, 1.0));
    float x = sign(el) * sqrt(abs(el) / 1.5707963);
    return texture2D(tSky, vec2(az, x * 0.5 + 0.5)).rgb;
  }
`;

const DOME_VS = /* glsl */`
  varying vec3 vDir;
  void main(){
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const DOME_FS = /* glsl */`
  uniform sampler2D tSky, tNoise;
  uniform vec3 uSun, uSunDisk, uCloudSun, uAmbTop, uAmbBot;
  uniform float uSunCos, uTime, uCover, uDens, uCloudH, uCamH, uClouds, uDetail, uDark;
  uniform vec2 uWind;
  varying vec3 vDir;
  ${SKY_GLSL}
  float hg(float mu, float g) { float g2 = g * g; return (1.0 - g2) / (12.566371 * pow(1.0 + g2 - 2.0 * g * mu, 1.5)); }
  float shape(vec2 p) {
    vec2 q = p * 0.16 + uWind * uTime;
    // cloud fields: low-frequency coverage modulation, then billowy Perlin-Worley masses
    float field = texture2D(tNoise, q * 0.21 + vec2(0.31, 0.77)).a;
    float base = texture2D(tNoise, q).r * 0.7 + texture2D(tNoise, q * 0.47 + vec2(0.13, 0.71)).r * 0.3;
    float cov = clamp(uCover + (field - 0.5) * 0.35 * (1.0 - uCover), 0.0, 1.0);
    float c = clamp((base - (1.0 - cov)) / max(cov, 0.08), 0.0, 1.0);
    if (uDetail > 0.5) {
      // erode only the edges with billowy detail; cores stay solid
      vec4 n = texture2D(tNoise, q * 2.7 + uWind * uTime * 0.5 + vec2(0.37, 0.19));
      float det = n.g * 0.7 + n.b * 0.3;
      c = clamp(c - (1.0 - c) * det * 0.55, 0.0, 1.0);
    }
    return c * c * (3.0 - 2.0 * c);
  }
  void main(){
    vec3 d = normalize(vDir);
    vec3 col = skyRadiance(tSky, d, uSun);
    // sun disk with limb darkening
    float mu = dot(d, uSun);
    if (mu > uSunCos) {
      float r = clamp((1.0 - mu) / (1.0 - uSunCos), 0.0, 1.0);
      col += uSunDisk * (1.0 - 0.6 * r) * smoothstep(1.0, 0.85, r);
    }
    if (uClouds > 0.5 && d.y > 0.0) {
      // intersection with a spherical shell of the cloud base altitude
      float re = 6360e3;
      float r0 = re + uCamH, rc = re + uCloudH;
      float b = r0 * d.y;
      float t = -b + sqrt(b * b - (r0 * r0 - rc * rc));
      vec2 p = d.xz * t * 0.001; // km
      float dens = shape(p);
      if (dens > 0.002) {
        // light through the cloud toward the sun (plane-projected march)
        float sunEl = max(uSun.y, 0.06);
        vec2 sd = normalize(uSun.xz + vec2(1e-5)) * clamp(0.7 / (sunEl / sqrt(1.0 - sunEl * sunEl)), 0.25, 3.0) / 3.0;
        float od = shape(p + sd) + shape(p + sd * 2.0) * 0.8 + shape(p + sd * 3.0) * 0.6;
        float sunT = exp(-od * 1.2 * uDens) * (1.0 - uDark * 0.7);
        float powder = 1.0 - exp(-dens * 6.0);
        float phase = mix(hg(mu, 0.6), hg(mu, -0.15), 0.3) * 12.566371;
        // thin edges let the sun through (bright rims, silver lining toward the sun);
        // thick cores are seen from below as their shaded, bluish-grey bases
        float thick = smoothstep(0.15, 0.95, dens);
        vec3 lit = uCloudSun * sunT * (0.55 + 0.45 * phase) * mix(1.0, powder, 0.5);
        vec3 base = uAmbBot * 0.9 + uAmbTop * 0.35 + uCloudSun * sunT * 0.12;
        vec3 cc = mix(lit + uAmbTop * 0.6, base, thick * (0.7 + 0.25 * uDark));
        float alpha = smoothstep(0.0, 0.55, dens) * (1.0 - exp(-uDens * 3.5));
        // aerial perspective toward the horizon
        float haze = 1.0 - exp(-t * 0.001 / 28.0);
        cc = mix(cc, col, haze * 0.85);
        alpha *= smoothstep(0.0, 0.035, d.y);
        col = mix(col, cc, alpha);
      }
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class PhysicalSky {
  // opts: sunDir (Vector3), mie, ozone, ms, camH, sunIntensity (target ground irradiance),
  //       groundAlbedo [r,g,b], coverage, cloudDens, dark (0..1 storm darkening), detail
  constructor(opts) {
    const o = this.opts = {
      mie: 1, ozone: 1, ms: 0.9, rayBoost: 1.9, camH: 120, sunIntensity: 3.8, groundAlbedo: [0.12, 0.13, 0.09],
      coverage: 0.35, cloudDens: 1, dark: 0, detail: true, cloudH: 1600, ...opts,
    };
    const sun = [o.sunDir.x, o.sunDir.y, o.sunDir.z];
    this.sun = sun;
    const T = buildTransmittance(o.mie, o.ozone);
    this.T = T;
    // sunlight at the ground: chromaticity and the solar constant that gives the requested intensity
    const tsun = sampleT(T, o.camH, sun[1], [0, 0, 0]);
    const tl = Math.max(1e-4, lum(tsun));
    this.E0 = o.sunIntensity / tl;
    this.sunColor = new THREE.Color(tsun[0] / tl, tsun[1] / tl, tsun[2] / tl);
    this.sunGround = tsun.map((v) => v * this.E0);
    // sky-view table
    const integ = makeIntegrator(T, sun, o.mie, o.ozone, o.ms, o.camH, o.groundAlbedo, o.rayBoost);
    const data = new Uint16Array(SW * SH * 4);
    const L = [0, 0, 0];
    const sAz = Math.atan2(sun[2], sun[0]);
    const toH = THREE.DataUtils.toHalfFloat;
    const rows = [];
    for (let j = 0; j < SH; j++) {
      const x = (j + 0.5) / SH * 2 - 1;
      const el = Math.sign(x) * x * x * PI / 2;
      const row = new Float32Array(SW * 3);
      for (let i = 0; i < SW; i++) {
        const az = sAz + (i / (SW - 1)) * PI;
        const ce = Math.cos(el);
        integ(Math.cos(az) * ce, Math.sin(el), Math.sin(az) * ce, L);
        const k = (j * SW + i) * 4;
        for (let c = 0; c < 3; c++) { const v = L[c] * this.E0; data[k + c] = toH(Math.min(v, 6e4)); row[i * 3 + c] = v; }
        data[k + 3] = toH(1);
      }
      rows.push({ el, row });
    }
    this.lut = new THREE.DataTexture(data, SW, SH, THREE.RGBAFormat, THREE.HalfFloatType);
    this.lut.wrapS = this.lut.wrapT = THREE.ClampToEdgeWrapping;
    this.lut.magFilter = this.lut.minFilter = THREE.LinearFilter;
    this.lut.generateMipmaps = false;
    this.lut.needsUpdate = true;
    // hemisphere averages: zenith-weighted sky irradiance colour, horizon band (fog), ground
    const sky = [0, 0, 0], hor = [0, 0, 0], low = [0, 0, 0];
    let ws = 0, wh = 0, wl = 0;
    for (const { el, row } of rows) {
      const w = Math.cos(el);
      for (let i = 0; i < SW; i++) {
        const r = row[i * 3], g = row[i * 3 + 1], b = row[i * 3 + 2];
        if (el > 0) { const ww = w * Math.sin(el); sky[0] += r * ww; sky[1] += g * ww; sky[2] += b * ww; ws += ww; }
        if (el > 0.005 && el < 0.06) { hor[0] += r; hor[1] += g; hor[2] += b; wh++; }
        if (el < -0.05) { low[0] += r * w; low[1] += g * w; low[2] += b * w; wl += w; }
      }
    }
    this.skyAvg = sky.map((v) => v / Math.max(ws, 1e-6));
    this.horizon = hor.map((v) => v / Math.max(wh, 1));
    this.groundL = low.map((v) => v / Math.max(wl, 1e-6));
    // light reaching the cloud layer, and the clouds' ambient (sky above, ground bounce below)
    const tcl = sampleT(T, o.cloudH, sun[1], [0, 0, 0]);
    this.cloudSun = new THREE.Color(tcl[0], tcl[1], tcl[2]).multiplyScalar(this.E0 / PI * 1.05);
    const zen = [0, 0, 0];
    integ(0, 1, 0, zen);
    this.zenith = zen.map((v) => v * this.E0);
    const dimmed = 1 - o.dark * 0.75;
    this.ambTop = new THREE.Color(this.skyAvg[0] * 1.15 + this.zenith[0] * 0.25, this.skyAvg[1] * 1.15 + this.zenith[1] * 0.25, this.skyAvg[2] * 1.15 + this.zenith[2] * 0.25).multiplyScalar(dimmed);
    const gb = o.groundAlbedo, eSun = lum(this.sunGround) * Math.max(sun[1], 0);
    this.ambBot = new THREE.Color(gb[0] * eSun / PI + this.skyAvg[0] * 0.25, gb[1] * eSun / PI + this.skyAvg[1] * 0.25, gb[2] * eSun / PI + this.skyAvg[2] * 0.25).multiplyScalar(0.9 * dimmed);
    this.uniforms = {
      tSky: { value: this.lut },
      tNoise: { value: cloudNoiseTexture() },
      uSun: { value: o.sunDir.clone().normalize() },
      uSunDisk: { value: new THREE.Color(tsun[0], tsun[1], tsun[2]).multiplyScalar(this.E0 * 11 * (1 - o.coverage * 0.2)) },
      uSunCos: { value: Math.cos(0.0058) },
      uCloudSun: { value: this.cloudSun },
      uAmbTop: { value: this.ambTop },
      uAmbBot: { value: this.ambBot },
      uTime: { value: 0 },
      uCover: { value: o.coverage },
      uDens: { value: o.cloudDens },
      uDark: { value: o.dark },
      uCloudH: { value: o.cloudH },
      uCamH: { value: o.camH },
      uClouds: { value: o.coverage > 0.01 ? 1 : 0 },
      uDetail: { value: o.detail ? 1 : 0 },
      uWind: { value: new THREE.Vector2(0.0011, 0.0004) },
    };
  }

  dome(radius) {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: DOME_VS, fragmentShader: DOME_FS,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), mat);
    m.renderOrder = -2;
    m.frustumCulled = false;
    return m;
  }

  // lower-hemisphere ground radiance for reflections/IBL
  groundColor() { return new THREE.Color(this.groundL[0], this.groundL[1], this.groundL[2]); }

  update(dt) { this.uniforms.uTime.value += dt; }

  dispose() { this.lut.dispose(); }
}
