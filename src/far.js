import * as THREE from 'three';
import { dayUniforms } from './daylight.js';
import { fogUniforms, FOG_PARS, FOG_VARY } from './fog.js';
import { drawBase } from './overlay.js';
import { lonLatToPx } from './terrain.js';
import { fromBNG } from './osgb.js';

// The distant landscape at life size, in two rings. The detailed terrain only covers a window of about 600 m around you; beyond
// it, this draws the rest of the place's LIDAR square (a few km across) at lower resolution, with the same aerial
// photo or map draped over it, fading into haze with distance. It sits a little below the detailed ground so the
// two never fight where they overlap. Beyond that, a horizon 30 km across from the worldwide elevation tiles (about
// 50 m detail here): the Mendips, the Severn, Wales across the Channel. Very distant ground is drawn pulled in towards
// you along your line of sight (same angles, so it looks the same) to stay within the camera's range.

const N = 512; // samples per side
const DROP = 0.8; // metres below the detailed terrain

const vertexShader = /* glsl */ `
  uniform sampler2D uFar;
  uniform float uBase, uVScale, uHScale, uRise, uDrop, uPull;
  varying vec2 vUv;
  varying float vDist;
  varying float vH;
  ${FOG_VARY}
  void main() {
    vUv = vec2(uv.x, 1.0 - uv.y);
    float h = texture2D(uFar, vUv).r;
    vH = h;
    vec3 p = position;
    p.y = ((h - uBase) * uVScale - uDrop * uHScale) * uRise;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vec3 d = wp.xyz - cameraPosition;
    float L = length(d);
    vDist = L;
    // Beyond 7 km, pull the point in along the line of sight: it looks the same but stays within the far plane.
    if (L > 7000.0 && uPull > 0.5) wp.xyz = cameraPosition + d / L * (7000.0 + (L - 7000.0) * 0.08);
    gl_Position = projectionMatrix * viewMatrix * wp;
    vFogD = L;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uFar, uPhoto;
  uniform float uCell, uPhotoOn, uSea, uTexel, uHole, uTundra;
  uniform vec2 uHoleC;
  uniform vec3 uDayTint, uSkyHaze; // the time of day (daylight.js)
  ${FOG_PARS}
  varying vec2 vUv;
  varying float vDist;
  varying float vH;
  void main() {
    // Each ring leaves a hole where the more detailed ground is drawn (coarse heights would poke through it:
    // coastal flats at sea, or a narrow gorge's floor).
    if (max(abs(vUv.x - uHoleC.x), abs(vUv.y - uHoleC.y)) < uHole) discard;
    vec2 px = vec2(uTexel, 0.0);
    float gx = (texture2D(uFar, vUv + px.xy).r - texture2D(uFar, vUv - px.xy).r) / (2.0 * uCell);
    float gn = (texture2D(uFar, vUv - px.yx).r - texture2D(uFar, vUv + px.yx).r) / (2.0 * uCell);
    vec3 n = normalize(vec3(-gx, 1.0, gn));
    float shade = clamp(dot(n, normalize(vec3(-0.3, 1.6, 0.9))), 0.0, 1.0);
    float slope = length(vec2(gx, gn));
    vec3 land = mix(vec3(0.30, 0.42, 0.20), vec3(0.44, 0.38, 0.27), smoothstep(0.45, 0.9, slope));
    vec4 photo = texture2D(uPhoto, vUv);
    land = mix(land, photo.rgb, photo.a * uPhotoOn);
    land = mix(land, mix(vec3(0.66, 0.68, 0.62), vec3(0.86, 0.88, 0.88), step(slope, 0.25)), uTundra);
    vec3 col = land * (0.45 + 0.75 * shade);
    if (vH < uSea) col = vec3(0.30, 0.38, 0.40);
    // Haze: nothing at hand, the sky's colour by the far edge.
    // Haze: distant land turns a soft grey-blue, a little darker than the sky at the horizon, so islands and far
    // hills still stand out as silhouettes.
    float haze = smoothstep(400.0, 4000.0, vDist) * 0.3 + smoothstep(4000.0, 30000.0, vDist) * 0.3;
    col *= uDayTint;
    col = mix(col, uSkyHaze * 0.85, haze);
    // The town's fog (fog.js), at most this thick, so far hills still show through it.
    col = mix(col, uFogCol, min(0.6, fogAmount()));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class FarTerrain {
  constructor(map) {
    this.map = map;
    this.data = new Uint16Array(N * N);
    this.tex = new THREE.DataTexture(this.data, N, N, THREE.RedFormat, THREE.HalfFloatType);
    this.photoCanvas = document.createElement('canvas');
    this.photoCanvas.width = this.photoCanvas.height = 1024;
    this.photo = new THREE.CanvasTexture(this.photoCanvas);
    this.photo.colorSpace = THREE.SRGBColorSpace;
    const u = map.uniforms;
    this.uniforms = {
      uDayTint: dayUniforms.uDayTint, uSkyHaze: dayUniforms.uSkyHaze, ...fogUniforms,
      uFar: { value: this.tex }, uPhoto: { value: this.photo }, uPhotoOn: { value: 0 }, uCell: { value: 1 }, uSea: { value: -1000 },
      uTexel: { value: 1 / N }, uDrop: { value: DROP }, uPull: { value: 1 }, uHole: { value: 0 }, uHoleC: { value: new THREE.Vector2(0.5, 0.5) }, uTundra: u.uTundra,
      uBase: u.uBase, uVScale: u.uVScale, uHScale: u.uHScale, uRise: u.uRise,
    };
    this.horizon = new Horizon(map);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 255, 255).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.visible = false;
    map.holder.add(this.mesh);
    this.builtFor = null;
  }

  // Sample the whole square from the stored grid (once per place) and fetch its photo.
  build(source) {
    this.horizon.build(source);
    const key = `${source.slug}:${this.map.base?.id}`;
    if (!source.data || !source.meta || this.builtKey === key) return;
    this.builtFor = source;
    this.builtKey = key;
    const size = source.size;
    const off = source.meta.offset ?? 0;
    const step = size / N;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = Math.min(size - 1, Math.floor((i + 0.5) * step));
        const y = Math.min(size - 1, Math.floor((j + 0.5) * step));
        this.data[j * N + i] = THREE.DataUtils.toHalfFloat(source.data[y * size + x] / 100 - off);
      }
    }
    this.tex.needsUpdate = true;
    this.metres = size * source.meta.metresPerPixel;
    this.uniforms.uCell.value = this.metres / N;
    this.uniforms.uPhotoOn.value = 0;
    // The photo for the whole square: work out its corners as if zoomed right out.
    const saved = source.snapshot();
    source.reset();
    const corners = source.corners();
    const span = source.span;
    source.restore(saved);
    const base = this.map.base;
    if (!base || base.id === 'none') return;
    const ctx = this.photoCanvas.getContext('2d', { willReadFrequently: true });
    drawBase(ctx, base, { span, corners: () => corners }).then(() => {
      if (this.builtFor !== source) return;
      this.photo.needsUpdate = true;
      this.uniforms.uPhotoOn.value = 1;
    }).catch(() => {});
  }

  // Each frame: place the square around the detailed window (only at life size).
  update() {
    const map = this.map;
    const source = map.source;
    const show = map.mode === 'life' && map.lifeT > 0.98 && this.builtFor === source && !!source.meta;
    this.mesh.visible = show;
    this.horizon.mesh.visible = show && this.horizon.ready === source;
    if (!show) return;
    const k = map.size / map.span; // map units per metre
    const c = source.centreMetres(); // window centre, metres east/south of the square's north-west corner
    this.mesh.scale.set(this.metres * k, 1, this.metres * k);
    this.mesh.position.set((this.metres / 2 - c.x) * k, 0, (this.metres / 2 - c.y) * k);
    // The hole: the detailed window, less one of this ring's cells so the two overlap a little.
    this.uniforms.uHoleC.value.set(c.x / this.metres, c.y / this.metres);
    this.uniforms.uHole.value = Math.max(0, (map.span / 2 - this.metres / N) / this.metres);
    this.uniforms.uSea.value = map.waterNow?.() ?? -1000;
    this.horizon.update(this.mesh.position, k, this.metres);
  }
}

// The 30 km horizon: elevation tiles (terrarium, zoom 11) around the place's centre, and the base map over it.
const HN = 256;
const HSPAN = 30000;
class Horizon {
  constructor(map) {
    this.map = map;
    this.data = new Uint16Array(HN * HN);
    this.tex = new THREE.DataTexture(this.data, HN, HN, THREE.RedFormat, THREE.HalfFloatType);
    this.photoCanvas = document.createElement('canvas');
    this.photoCanvas.width = this.photoCanvas.height = 1024;
    this.photo = new THREE.CanvasTexture(this.photoCanvas);
    this.photo.colorSpace = THREE.SRGBColorSpace;
    const u = map.uniforms;
    this.uniforms = {
      uFar: { value: this.tex }, uPhoto: { value: this.photo }, uPhotoOn: { value: 0 }, uCell: { value: HSPAN / HN }, uSea: { value: 0.5 },
      uTexel: { value: 1 / HN }, uDrop: { value: 4 }, uPull: { value: 1 }, uHole: { value: 0 }, uHoleC: { value: new THREE.Vector2(0.5, 0.5) }, uTundra: u.uTundra,
      uDayTint: dayUniforms.uDayTint, uSkyHaze: dayUniforms.uSkyHaze, ...fogUniforms,
      uBase: u.uBase, uVScale: u.uVScale, uHScale: u.uHScale, uRise: u.uRise,
    };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, HN - 1, HN - 1).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -2;
    this.mesh.visible = false;
    map.holder.add(this.mesh);
  }

  async build(source) {
    const key = `${source.slug}:${this.map.base?.id}`;
    if (!source.meta || this.key === key) return;
    this.key = key;
    this.ready = null;
    const { easting: e0, northing: n0 } = source.meta;
    const half = HSPAN / 2;
    // Corners in lat/lon; inside, lat/lon is interpolated (plenty accurate over 30 km for scenery).
    const nw = fromBNG(e0 - half, n0 + half, source.meta);
    const ne = fromBNG(e0 + half, n0 + half, source.meta);
    const sw = fromBNG(e0 - half, n0 - half, source.meta);
    const se = fromBNG(e0 + half, n0 - half, source.meta);
    const z = 11;
    const pts = [nw, ne, sw, se].map((c) => lonLatToPx(c.lon, c.lat, z));
    const tx0 = Math.floor(Math.min(...pts.map((p) => p.x)) / 256);
    const tx1 = Math.floor(Math.max(...pts.map((p) => p.x)) / 256);
    const ty0 = Math.floor(Math.min(...pts.map((p) => p.y)) / 256);
    const ty1 = Math.floor(Math.max(...pts.map((p) => p.y)) / 256);
    const w = (tx1 - tx0 + 1) * 256;
    const h = (ty1 - ty0 + 1) * 256;
    const canvas = new OffscreenCanvas(w, h);
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const jobs = [];
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        jobs.push(fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`)
          .then((r) => (r.ok ? r.blob() : null))
          .then((b) => b && createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }))
          .then((img) => img && g.drawImage(img, (tx - tx0) * 256, (ty - ty0) * 256))
          .catch(() => {}));
      }
    }
    await Promise.all(jobs);
    if (this.key !== key) return;
    const px = g.getImageData(0, 0, w, h).data;
    for (let j = 0; j < HN; j++) {
      const fj = j / (HN - 1);
      for (let i = 0; i < HN; i++) {
        const fi = i / (HN - 1);
        const lat = nw.lat + (ne.lat - nw.lat) * fi + (sw.lat - nw.lat) * fj;
        const lon = nw.lon + (ne.lon - nw.lon) * fi + (sw.lon - nw.lon) * fj;
        const p = lonLatToPx(lon, lat, z);
        // The highest of the tile pixels round this point, so small islands and summits (Steep Holm, Flat Holm)
        // keep their height instead of being averaged away.
        let metres = -Infinity;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = Math.min(w - 1, Math.max(0, Math.floor(p.x - tx0 * 256) + dx));
            const y = Math.min(h - 1, Math.max(0, Math.floor(p.y - ty0 * 256) + dy));
            const k = (y * w + x) * 4;
            metres = Math.max(metres, px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768);
          }
        }
        this.data[j * HN + i] = THREE.DataUtils.toHalfFloat(Math.max(-5, metres));
      }
    }
    this.tex.needsUpdate = true;
    this.ready = source;
    // The base map over it, as for the near ground.
    this.uniforms.uPhotoOn.value = 0;
    const base = this.map.base;
    if (!base || base.id === 'none') return;
    const corners = { nw, ne, sw, se };
    drawBase(this.photoCanvas.getContext('2d', { willReadFrequently: true }), base, { span: HSPAN, corners: () => corners }).then(() => {
      if (this.key !== key) return;
      this.photo.needsUpdate = true;
      this.uniforms.uPhotoOn.value = 1;
    }).catch(() => {});
  }

  // Centred on the place's square (which the near ring is centred on too).
  update(centre, k, inner) {
    this.mesh.position.copy(centre);
    this.uniforms.uHole.value = (inner / HSPAN) * 0.5 - 0.5 / HN;
    this.mesh.scale.set(HSPAN * k, 1, HSPAN * k);
  }
}
