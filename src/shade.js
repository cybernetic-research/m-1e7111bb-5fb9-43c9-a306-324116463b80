import * as THREE from 'three';
import { RES } from './terrain.js';
import { dayUniforms } from './daylight.js';

// Light and shade in the streets at life size, without real-time shadow maps (the Quest can't afford them): from the
// buildings' heights (objects.js, plus 8 m for the walls, towers and other solid features), worked out on the CPU
// a few rows a frame, into one texture over the window:
//   r: the height (metres OD) below which the air at that spot is in the sun's shadow: a building between it and
//      the sun stands above the line to the sun. So any point (the ground, a wall, a person) is in shadow if it's
//      lower than this. Recomputed as the sun moves.
//   g: how open to the sky it is (0 enclosed, 1 open), from how high the buildings rise round it within 12 m: narrow
//      lanes and corners are dim and cool, open places bright.
//   b: the ground (metres OD).
// The ground's and the houses' shaders (contour-map.js, objects.js) use it directly; every other lit material in
// the town (the kit's houses, the people, the props, the trees) is given it by shadeMaterial().

const BUDGET = 3; // milliseconds a frame
const AO_STEPS = 10; // pixels out, in each of 8 directions
const SOLID_H = 8; // metres: walls, towers, kit houses (features' solid raster)

export const shadeUniforms = {
  uShade: { value: null },
  uShadeM: { value: new THREE.Matrix4() }, // world -> (u, metres OD, v)
  uShadeOn: { value: 0 },
  uSunUp: { value: 0 },
};

// How lit a point is: od its height (metres OD); top, open, gnd from the texture.
export const SHADE_GLSL = /* glsl */ `
  vec3 shadeFactor(float od, float top, float open, float gnd) {
    float s = mix(1.0, 1.0 - smoothstep(-0.5, 1.1, top - od), uSunUp); // (soft-edged: the texture's pixels are over a metre)
    float h = clamp((od - gnd) / 9.0, 0.0, 1.0);
    float o = mix(open, 1.0, h * 0.7);
    return mix(vec3(0.80, 0.86, 1.0), vec3(1.03, 1.0, 0.95), s) * (0.55 + 0.45 * o) * mix(0.66, 1.08, s);
  }
`;

export class Shade {
  constructor(map) {
    this.map = map;
    this.half = new Uint16Array(RES * RES * 4);
    this.tex = new THREE.DataTexture(this.half, RES, RES, THREE.RGBAFormat, THREE.HalfFloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    shadeUniforms.uShade.value = this.tex;
    this.top = new Float32Array(RES * RES);
    this.open = new Float32Array(RES * RES).fill(1);
    this.inputs = null;
    this.job = null;
    this.sun = null; // the sun direction the shadows are for
    this.aoReady = false;
  }

  // The obstacles' tops (metres OD, -1e9 where none) and the ground, from the current window's rasters.
  gather() {
    const map = this.map;
    const ground = map.ground ?? map.grids?.terrain;
    const hs = map.objects.heights;
    const fs = map.solid;
    const os = map.objects.solid;
    const tops = new Float32Array(RES * RES);
    let max = 0;
    for (let k = 0; k < tops.length; k++) {
      let h = hs?.[k] || 0;
      if (!h && (fs?.[k] || os?.[k])) h = SOLID_H;
      tops[k] = h > 0 ? ground[k] + h : -1e9;
      if (h > max) max = h;
    }
    return { tops, ground, max };
  }

  update() {
    const map = this.map;
    const life = map.game?.life?.state === 'on';
    const sunDir = dayUniforms.uSunDir.value;
    shadeUniforms.uSunUp.value = THREE.MathUtils.smoothstep(sunDir.y, 0.02, 0.12);
    // World -> (u, OD, v): out of the map group's frame, then its local x, z to the window's texture, y to metres.
    if (map.group) {
      const { v } = map.scales();
      const size = map.size;
      const base = map.uniforms.uBase.value;
      _a.set(1 / size, 0, 0, 0.5, 0, 1 / v, 0, base, 0, 0, 1 / size, 0.5, 0, 0, 0, 1);
      map.group.updateWorldMatrix(true, false);
      shadeUniforms.uShadeM.value.multiplyMatrices(_a, _inv.copy(map.group.matrixWorld).invert());
    }
    const key = [map.ground ?? map.grids?.terrain, map.objects.heights, map.solid, map.objects.solid];
    if (!this.inputs || key.some((x, n) => x !== this.inputs.key[n])) {
      // A new window (or its buildings changed): start again, shade off until the new is worked out.
      if (!key[0] || !key[1]) {
        shadeUniforms.uShadeOn.value = 0;
        return;
      }
      this.inputs = { key, ...this.gather() };
      this.job = null;
      this.aoReady = false;
      this.sun = null;
      shadeUniforms.uShadeOn.value = 0;
    }
    if (!life || !this.inputs.max) return;
    if (!this.job) {
      if (!this.aoReady) this.job = this.aoJob();
      else if (!this.sun || this.sun.angleTo(sunDir) > 0.02) {
        this.sun = sunDir.clone();
        this.job = this.sunJob(this.sun);
      } else return;
    }
    const t0 = performance.now();
    while (performance.now() - t0 < BUDGET) {
      if (this.job.next().done) {
        this.job = null;
        break;
      }
    }
  }

  // How open each spot is to the sky.
  *aoJob() {
    const { tops, ground } = this.inputs;
    const mpp = this.map.span / RES;
    const dirs = Array.from({ length: 8 }, (_, n) => [Math.cos((n * Math.PI) / 4), Math.sin((n * Math.PI) / 4)]);
    for (let j = 0; j < RES; j++) {
      for (let i = 0; i < RES; i++) {
        const k = j * RES + i;
        const g = ground[k];
        let occ = 0;
        for (const [dx, dy] of dirs) {
          let best = 0;
          for (let s = 1; s <= AO_STEPS; s++) {
            const x = Math.round(i + dx * s);
            const y = Math.round(j + dy * s);
            if (x < 0 || y < 0 || x >= RES || y >= RES) break;
            const t = (tops[y * RES + x] - g) / (s * mpp);
            if (t > best) best = t;
          }
          occ += Math.atan(best);
        }
        this.open[k] = 1 - occ / (8 * Math.PI / 2);
      }
      if (j % 8 === 7) yield;
    }
    this.aoReady = true;
  }

  // The sun's shadows: for each spot, the highest line to the sun that a building cuts.
  *sunJob(dir) {
    const { tops, ground, max } = this.inputs;
    const mpp = this.map.span / RES;
    const flat = Math.hypot(dir.x, dir.z);
    const top = this.top;
    if (dir.y <= 0.02 || flat < 1e-4) {
      top.fill(-1e9);
    } else {
      const tanE = dir.y / flat;
      const ux = dir.x / flat;
      const uy = dir.z / flat; // (the map's z runs south, as the window's rows do)
      const steps = Math.min(60, Math.ceil(max / (mpp * tanE)));
      const fall = mpp * tanE;
      for (let j = 0; j < RES; j++) {
        for (let i = 0; i < RES; i++) {
          let best = -1e9;
          // (On a roof only what stands higher than it counts: its own building would shade it otherwise.)
          const own = tops[j * RES + i] + 0.5;
          for (let s = 1; s <= steps; s++) {
            const x = Math.round(i + ux * s);
            const y = Math.round(j + uy * s);
            if (x < 0 || y < 0 || x >= RES || y >= RES) break;
            const t = tops[y * RES + x];
            if (t < own) continue;
            const c = t - s * fall;
            if (c > best) best = c;
          }
          top[j * RES + i] = best;
        }
        if (j % 4 === 3) yield;
      }
    }
    // Into the texture.
    const h = this.half;
    const f = THREE.DataUtils.toHalfFloat;
    for (let k = 0; k < RES * RES; k++) {
      h[k * 4] = f(Math.max(-1000, top[k]));
      h[k * 4 + 1] = f(this.open[k]);
      h[k * 4 + 2] = f(ground[k]);
      h[k * 4 + 3] = f(1);
      if (k % 32768 === 32767) yield;
    }
    this.tex.needsUpdate = true;
    shadeUniforms.uShadeOn.value = 1;
  }
}
const _a = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

// Give a lit material the streets' light and shade (once): its world position and normal passed to the fragment
// shader, the texture sampled a little either side of the surface (a wall's own building would shade it; the
// street side wins), and the colour scaled by shadeFactor.
export function shadeMaterial(m) {
  if (!m || m.userData.shaded || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return;
  m.userData.shaded = true;
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, shadeUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShW;\nvarying vec3 vShN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 shP = vec4(transformed, 1.0);
        vec3 shN = objectNormal;
        #ifdef USE_INSTANCING
          shP = instanceMatrix * shP;
          shN = mat3(instanceMatrix) * shN;
        #endif
        vShW = (modelMatrix * shP).xyz;
        vShN = normalize(mat3(modelMatrix) * shN);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vShW;
        varying vec3 vShN;
        uniform sampler2D uShade;
        uniform mat4 uShadeM;
        uniform float uShadeOn, uSunUp;
        ${SHADE_GLSL}`)
      .replace('#include <dithering_fragment>', `
        if (uShadeOn > 0.5) {
          vec3 side = vec3(vShN.x, 0.0, vShN.z) * 0.8;
          vec2 a = (uShadeM * vec4(vShW + side, 1.0)).xz;
          vec2 b = (uShadeM * vec4(vShW - side, 1.0)).xz;
          vec4 sa = texture2D(uShade, a);
          vec4 sb = texture2D(uShade, b);
          float od = (uShadeM * vec4(vShW, 1.0)).y;
          gl_FragColor.rgb *= shadeFactor(od, min(sa.r, sb.r), max(sa.g, sb.g), min(sa.b, sb.b));
        }
        #include <dithering_fragment>`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|shade';
  m.needsUpdate = true;
}
