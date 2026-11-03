import { toBNG, fromBNG } from './osgb.js';
import { loadSplatList } from './splats.js';

// Height data sources. Each one has a view (centre + zoom) and produces RES x RES grids of elevations in metres,
// row 0 = north, covering `span` metres: `terrain` (bare earth) and `surface` (with buildings, trees, bridges and
// piers where a LIDAR surface model was baked; otherwise the same grid). Panning and zooming change the view.

export const RES = 512;
const TILE = 256;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// A baked square of 1 m LIDAR (see tools/bake_lidar.py). Zoom levels show the whole square, then a half, quarter...
export class LidarSource {
  // Only the small files load up front; the height grids (11.5 MB each) load when you go to the place.
  static async load(slug, options = {}) {
    const optional = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [meta, osm, history, captions, route, splats] = await Promise.all([
      fetch(`assets/${slug}.json`).then((r) => r.json()),
      optional(`assets/${slug}-osm.json`),
      options.hasHistory ? optional(`assets/${slug}-history.json`) : null,
      optional(`assets/${slug}-captions.json`),
      options.hasRoute ? optional(`assets/${slug}-route.json`) : null,
      loadSplatList(slug),
    ]);
    const source = new LidarSource(meta, slug);
    Object.assign(source, { osm, history, captions, route, splats, ...options });
    return source;
  }

  constructor(meta, slug) {
    this.meta = meta;
    this.slug = slug;
    this.data = null;
    this.dsm = null;
    this.name = meta.name;
    this.kind = 'LIDAR 1 m';
    this.attribution = meta.attribution;
    this.size = meta.size;
    this.west = meta.easting - meta.size / 2;
    this.north = meta.northing + meta.size / 2;
    this.reset();
  }

  // Where a lat/lon falls in the current view, in RES-sized window pixels.
  toWindow(lat, lon) {
    const { e, n } = toBNG(lat, lon);
    const mpp = this.meta.metresPerPixel;
    return {
      i: (((e - this.west) / mpp - (this.cx - this.span / 2)) / this.span) * RES,
      j: (((this.north - n) / mpp - (this.cy - this.span / 2)) / this.span) * RES,
    };
  }

  // The lat/lon at a window pixel (the inverse of toWindow).
  fromWindow(i, j) {
    const mpp = this.meta.metresPerPixel;
    return fromBNG(this.west + (this.cx + (i / RES - 0.5) * this.span) * mpp, this.north - (this.cy + (j / RES - 0.5) * this.span) * mpp, this.meta);
  }

  // Lat/lon of the view's corners, for draping web map tiles over it.
  corners() {
    const mpp = this.meta.metresPerPixel;
    const at = (fx, fy) => fromBNG(this.west + (this.cx + (fx - 0.5) * this.span) * mpp,
      this.north - (this.cy + (fy - 0.5) * this.span) * mpp, this.meta);
    return { nw: at(0, 0), ne: at(1, 0), sw: at(0, 1), se: at(1, 1) };
  }

  reset() {
    this.zoom = 0;
    this.cx = this.size / 2;
    this.cy = this.size / 2;
  }

  get span() {
    return this.size / 2 ** this.zoom;
  }

  // View centre in metres east/south of the square's north-west corner.
  centreMetres() {
    return { x: this.cx * this.meta.metresPerPixel, y: this.cy * this.meta.metresPerPixel };
  }

  // Centre the view on a point given in the same frame (used to keep you in the middle at life size).
  centreOn(m) {
    this.cx = m.x / this.meta.metresPerPixel;
    this.cy = m.y / this.meta.metresPerPixel;
    this.clampCentre();
  }

  // Zoom so the view is about `metres` across.
  zoomToSpan(metres) {
    this.zoom = Math.max(0, Math.min(3, Math.round(Math.log2(this.size / metres))));
    this.clampCentre();
  }

  get maxSpan() {
    return this.size;
  }

  get minSpan() {
    return this.size / 8;
  }

  snapshot() {
    return { zoom: this.zoom, cx: this.cx, cy: this.cy };
  }

  restore(s) {
    Object.assign(this, s);
  }

  zoomBy(d) {
    this.zoom = clamp(this.zoom + d, 0, 3);
    this.clampCentre();
  }

  // Move the centre of the view east/south by real-world metres.
  pan(east, south) {
    this.cx += east / this.meta.metresPerPixel;
    this.cy += south / this.meta.metresPerPixel;
    this.clampCentre();
  }

  clampCentre() {
    const half = this.span / 2;
    this.cx = clamp(this.cx, half, this.size - half);
    this.cy = clamp(this.cy, half, this.size - half);
  }

  // Named spot to mark on the map: the place the data was baked around, in metres from the view's north-west corner.
  landmarks() {
    const x0 = this.cx - this.span / 2;
    const y0 = this.cy - this.span / 2;
    return [{ name: this.name, x: this.size / 2 - x0, y: this.size / 2 - y0 }];
  }

  // Bilinear resample of one stored grid (centimetres + offset) into the current view.
  resample(data, offset) {
    const out = new Float32Array(RES * RES);
    const { size } = this;
    const step = (this.span - 1) / (RES - 1);
    const x0 = Math.max(0, this.cx - this.span / 2);
    const y0 = Math.max(0, this.cy - this.span / 2);
    for (let j = 0; j < RES; j++) {
      const y = y0 + j * step;
      const yi = Math.min(Math.floor(y), size - 2);
      const fy = y - yi;
      for (let i = 0; i < RES; i++) {
        const x = x0 + i * step;
        const xi = Math.min(Math.floor(x), size - 2);
        const fx = x - xi;
        const k = yi * size + xi;
        const top = data[k] + (data[k + 1] - data[k]) * fx;
        const bottom = data[k + size] + (data[k + size + 1] - data[k + size]) * fx;
        out[j * RES + i] = (top + (bottom - top) * fy) / 100 - offset;
      }
    }
    return out;
  }

  async ensureData() {
    this.loadingData ??= Promise.all([
      loadGrid(`assets/${this.slug}`),
      this.meta.dsm ? loadGrid(`assets/${this.slug}-dsm`) : null,
      // Building footprints (only where a surface model exists to measure their heights).
      this.meta.dsm ? fetch(`assets/${this.slug}-buildings.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null,
    ]).then(([grid, dsm, buildings]) => {
      this.data = grid;
      this.dsm = dsm;
      this.buildings = buildings;
      return { data: grid, dsm };
    });
    return this.loadingData;
  }

  // Free the big grids when you move to another place (the headset browser has limited memory).
  release() {
    this.data = this.dsm = this.loadingData = this.buildings = null;
  }

  async window() {
    // Keep hold of the grids themselves: leaving for another place releases them while this may still be running.
    const { data, dsm } = await this.ensureData();
    const terrain = this.resample(data, this.meta.offset ?? 0);
    const surface = dsm ? this.resample(dsm, this.meta.dsmOffset ?? 0) : terrain;
    return { terrain, surface };
  }
}

// A height grid: the packed .dz (published builds, see tools/build_pages.py) if there is one, else the raw .bin.
async function loadGrid(path) {
  const packed = await fetch(`${path}.dz`).catch(() => null);
  if (packed?.ok && typeof DecompressionStream !== 'undefined') {
    const planes = new Uint8Array(await new Response(packed.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    const n = planes.length / 2;
    const size = Math.round(Math.sqrt(n));
    const out = new Uint16Array(n);
    for (let j = 0; j < size; j++) {
      let prev = 0;
      for (let i = 0, k = j * size; i < size; i++, k++) {
        prev = (prev + (planes[k] | (planes[n + k] << 8))) & 0xffff;
        out[k] = prev;
      }
    }
    return out;
  }
  return new Uint16Array(await (await fetch(`${path}.bin`)).arrayBuffer());
}

// Worldwide terrain from the public AWS/Mapzen "terrarium" tiles (30 m-ish outside the US, coarser at sea).
const tileCache = new Map();
function loadTile(z, x, y) {
  const n = 2 ** z;
  x = ((x % n) + n) % n;
  if (y < 0 || y >= n) return Promise.resolve(null);
  const key = `${z}/${x}/${y}`;
  if (!tileCache.has(key)) {
    const p = fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${key}.png`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`tile ${key}: ${r.status}`))))
      // No colour management: the RGB values are the data.
      .then((b) => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }));
    p.catch(() => tileCache.delete(key));
    tileCache.set(key, p);
  }
  return tileCache.get(key);
}

export function lonLatToPx(lon, lat, z) {
  const s = TILE * 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * s, y: ((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * s };
}

export function pxToLat(y, z) {
  const s = TILE * 2 ** z;
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s))) * 180) / Math.PI;
}

export class TileSource {
  constructor({ name, lat, lon, z }) {
    this.name = name;
    this.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    this.kind = 'SRTM / terrain tiles';
    this.attribution = 'Elevation: Mapzen terrain tiles (SRTM, USGS and others)';
    this.home = { lat, lon, z };
    this.reset();
  }

  reset() {
    const { lat, lon, z } = this.home;
    this.z = z;
    ({ x: this.cx, y: this.cy } = lonLatToPx(lon, lat, z));
    this.zoom = 0;
  }

  get mpp() {
    return (156543.034 * Math.cos((pxToLat(this.cy, this.z) * Math.PI) / 180)) / 2 ** this.z;
  }

  get span() {
    return RES * this.mpp;
  }

  // Metres east/south of the web-map origin, at this latitude's scale (stable across zoom levels).
  centreMetres() {
    return { x: this.cx * this.mpp, y: this.cy * this.mpp };
  }

  centreOn(m) {
    this.cx = m.x / this.mpp;
    this.cy = m.y / this.mpp;
  }

  zoomToSpan(metres) {
    this.zoomBy(Math.round(Math.log2(this.span / metres)));
  }

  get maxSpan() {
    return RES * (156543.034 * Math.cos((this.home.lat * Math.PI) / 180)) / 2 ** 3;
  }

  get minSpan() {
    return RES * (156543.034 * Math.cos((this.home.lat * Math.PI) / 180)) / 2 ** 15;
  }

  snapshot() {
    return { z: this.z, cx: this.cx, cy: this.cy, zoom: this.zoom };
  }

  restore(s) {
    Object.assign(this, s);
  }

  zoomBy(d) {
    const nz = clamp(this.z + d, 3, 15);
    const f = 2 ** (nz - this.z);
    this.cx *= f;
    this.cy *= f;
    this.z = nz;
    this.zoom += d;
  }

  pan(east, south) {
    const mpp = this.mpp;
    this.cx += east / mpp;
    this.cy += south / mpp;
  }

  toWindow(lat, lon) {
    const { x, y } = lonLatToPx(lon, lat, this.z);
    return { i: x - this.cx + RES / 2, j: y - this.cy + RES / 2 };
  }

  corners() {
    const s = TILE * 2 ** this.z;
    const at = (fx, fy) => ({
      lat: pxToLat(this.cy + (fy - 0.5) * RES, this.z), lon: ((this.cx + (fx - 0.5) * RES) / s) * 360 - 180,
    });
    return { nw: at(0, 0), ne: at(1, 0), sw: at(0, 1), se: at(1, 1) };
  }

  landmarks() {
    const { x, y } = lonLatToPx(this.home.lon, this.home.lat, this.z);
    const mpp = this.mpp;
    return [{ name: this.name, x: (x - this.cx + RES / 2) * mpp, y: (y - this.cy + RES / 2) * mpp }];
  }

  async window() {
    const left = Math.round(this.cx - RES / 2);
    const top = Math.round(this.cy - RES / 2);
    const tx0 = Math.floor(left / TILE);
    const ty0 = Math.floor(top / TILE);
    const tx1 = Math.floor((left + RES - 1) / TILE);
    const ty1 = Math.floor((top + RES - 1) / TILE);
    const canvas = new OffscreenCanvas((tx1 - tx0 + 1) * TILE, (ty1 - ty0 + 1) * TILE);
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
    const jobs = [];
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        jobs.push(loadTile(this.z, tx, ty).then((img) => img && ctx.drawImage(img, (tx - tx0) * TILE, (ty - ty0) * TILE)));
      }
    }
    await Promise.all(jobs);
    const px = ctx.getImageData(left - tx0 * TILE, top - ty0 * TILE, RES, RES).data;
    const out = new Float32Array(RES * RES);
    for (let i = 0; i < RES * RES; i++) out[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
    return { terrain: out, surface: out };
  }
}
