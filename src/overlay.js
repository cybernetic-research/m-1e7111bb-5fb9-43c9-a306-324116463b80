import { lonLatToPx, RES } from './terrain.js';

export const OVR = 1024; // overlay texture size

export const BASEMAPS = [
  { id: 'none', label: 'NO MAP' },
  {
    id: 'map', label: 'MAP', maxZ: 19, credit: 'Map © OpenStreetMap contributors',
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  },
  {
    id: 'aerial', label: 'MAP 2', maxZ: 19, credit: 'Map © OpenStreetMap contributors',
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  },
  {
    id: 'historic', label: '1900 MAP', maxZ: 17, gbOnly: true,
    credit: 'OS six-inch 1888–1913, reproduced with the permission of the National Library of Scotland',
    url: (z, x, y) => `https://mapseries-tilesets.s3.amazonaws.com/os/6inchsecond/${z}/${x}/${y}.png`,
  },
];

const cache = new Map();
export function tile(base, z, x, y) {
  const key = `${base.id}/${z}/${x}/${y}`;
  if (!cache.has(key)) {
    const p = fetch(base.url(z, x, y))
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? createImageBitmap(b) : null))
      .catch(() => null); // gaps in coverage just stay blank
    cache.set(key, p);
  }
  return cache.get(key);
}

// Draws a web-map layer into the view by resampling: each overlay pixel's lat/lon is interpolated from the view's
// corners (exact for tile views, within a metre for the BNG-aligned LIDAR squares), then looked up in the tiles.
export async function drawBase(ctx, base, source) {
  const c = source.corners();
  const lat = (c.nw.lat + c.se.lat) / 2;
  const wanted = source.span / OVR;
  let z = Math.round(Math.log2((156543.034 * Math.cos((lat * Math.PI) / 180)) / wanted));
  z = Math.max(3, Math.min(base.maxZ, z));
  let px;
  let tx0;
  let ty0;
  let tx1;
  let ty1;
  for (;; z--) {
    px = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, lonLatToPx(v.lon, v.lat, z)]));
    const xs = Object.values(px).map((p) => p.x);
    const ys = Object.values(px).map((p) => p.y);
    [tx0, tx1, ty0, ty1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((v) => Math.floor(v / 256));
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 36 || z <= 3) break;
  }
  const w = (tx1 - tx0 + 1) * 256;
  const h = (ty1 - ty0 + 1) * 256;
  const stitch = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      jobs.push(tile(base, z, tx, ty).then((img) => img && stitch.drawImage(img, (tx - tx0) * 256, (ty - ty0) * 256)));
    }
  }
  await Promise.all(jobs);
  const src = stitch.getImageData(0, 0, w, h).data;
  const out = ctx.createImageData(OVR, OVR);
  const d = out.data;
  const ox = tx0 * 256;
  const oy = ty0 * 256;
  for (let v = 0; v < OVR; v++) {
    const fv = (v + 0.5) / OVR;
    const lx = px.nw.x + (px.sw.x - px.nw.x) * fv;
    const ly = px.nw.y + (px.sw.y - px.nw.y) * fv;
    const rx = px.ne.x + (px.se.x - px.ne.x) * fv;
    const ry = px.ne.y + (px.se.y - px.ne.y) * fv;
    for (let u = 0; u < OVR; u++) {
      const fu = (u + 0.5) / OVR;
      const sx = Math.floor(lx + (rx - lx) * fu - ox);
      const sy = Math.floor(ly + (ry - ly) * fu - oy);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const si = (sy * w + sx) * 4;
      const di = (v * OVR + u) * 4;
      d[di] = src[si];
      d[di + 1] = src[si + 1];
      d[di + 2] = src[si + 2];
      d[di + 3] = src[si + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

function path(ctx, source, pts) {
  const k = OVR / RES;
  ctx.beginPath();
  pts.forEach(([lat, lon], n) => {
    const { i, j } = source.toWindow(lat, lon);
    if (n) ctx.lineTo(i * k, j * k);
    else ctx.moveTo(i * k, j * k);
  });
}

// Water from the site's baked OSM data: lakes and river areas filled, rivers and streams drawn to real width.
function drawWater(ctx, source) {
  const water = source.osm?.water;
  if (!water) return;
  const mPerPx = source.span / OVR;
  ctx.fillStyle = 'rgba(52,128,205,0.9)';
  for (const poly of water.polygons) {
    path(ctx, source, poly);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(52,128,205,0.95)';
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const line of water.lines) {
    ctx.lineWidth = Math.max(line.width / mPerPx, line.kind === 'river' || line.kind === 'canal' ? 2.5 : 1.2);
    path(ctx, source, line.pts);
    ctx.stroke();
  }
}

// Outlines of archaeological sites and ruins (hillfort ramparts, the abbey) as dashed gold lines.
function drawSites(ctx, source) {
  ctx.strokeStyle = 'rgba(255,214,120,0.95)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 7]);
  for (const f of source.osm?.features ?? []) {
    if (!f.outline || f.kind === 'peak') continue;
    path(ctx, source, f.outline);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

export async function composeOverlay(canvas, source, { base, water, sites, extras }) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, OVR, OVR);
  if (base && base.id !== 'none') await drawBase(ctx, base, source);
  if (water) drawWater(ctx, source);
  if (sites) drawSites(ctx, source);
  // Extra shapes painted on the ground by scenes (e.g. Filton's runway as it was).
  for (const x of extras ?? []) {
    ctx.fillStyle = x.color;
    path(ctx, source, x.poly);
    ctx.fill();
  }
}
