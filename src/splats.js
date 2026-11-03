import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

// Gaussian splats (e.g. Scaniverse exports, .ply or .spz) placed on the LIDAR ground.
// assets/splats/<site>.json lists them:
//   [{ "name": "Blaise Castle folly", "file": "blaise-folly.ply", "lat": 51.50256, "lon": -2.63731,
//      "alt": 82.0,        // metres above Ordnance Datum of the splat's origin (omit to sit it on the ground there)
//      "heading": 0,       // degrees clockwise to turn it about the vertical
//      "scale": 1,         // if the scan isn't in metres
//      "up": "-y" }]       // which axis is up in the file: "y", "-y" (usual for 3DGS .ply) or "z"
// Viewers are cached per file, so zooming and panning (which rebuild the features) don't reload them.

const cache = new Map();

function viewer(url) {
  if (cache.has(url)) return cache.get(url);
  const v = new GaussianSplats3D.DropInViewer({
    gpuAcceleratedSort: false,
    sharedMemoryForWorkers: false, // no cross-origin isolation needed
    dynamicScene: false,
  });
  const entry = { v, ready: false, failed: false };
  v.addSplatScene(url, { showLoadingUI: false, splatAlphaRemovalThreshold: 5, progressiveLoad: false })
    .then(() => {
      entry.ready = true;
      console.info(`[splats] loaded ${url}`);
    })
    .catch((err) => {
      entry.failed = true;
      console.error(`[splats] ${url}`, err);
    });
  cache.set(url, entry);
  return entry;
}

const UP = {
  y: new THREE.Euler(0, 0, 0),
  '-y': new THREE.Euler(Math.PI, 0, 0),
  z: new THREE.Euler(-Math.PI / 2, 0, 0),
};

// Items for Features: each splat is a true-size model standing at its lat/lon (and altitude, if given).
// Hand adjustments made in the headset (ADJUST SCAN) are kept in this browser and applied over the JSON.
const ADJUST_KEY = (site, name) => `scan-adjust:${site}:${name}`;
function withAdjustment(site, s) {
  try {
    const saved = JSON.parse(localStorage.getItem(ADJUST_KEY(site, s.name)) ?? 'null');
    return saved ? { ...s, ...saved } : s;
  } catch {
    return s;
  }
}

// Is a scan placed well enough to show unasked? Yes if it was aligned to the LIDAR automatically or has been set by
// hand in this headset; scans with only their height known ("aligned": "height only...") wait until chosen from
// the menu, so a scan facing the wrong way (sky and all) doesn't hang over the landscape.
export function scanPlaced(site, s) {
  let saved = null;
  try {
    saved = localStorage.getItem(ADJUST_KEY(site, s.name));
  } catch { /* private browsing */ }
  return !!saved || !/^height only/.test(s.aligned ?? '');
}

export function splatItems(source, ctx) {
  const items = [];
  for (const raw of source.splats ?? []) {
    const s = withAdjustment(source.slug, raw);
    const at = ctx.at(s.lat, s.lon);
    if (!at) continue;
    const entry = viewer(`assets/splats/${s.file}`);
    const orient = new THREE.Group();
    orient.rotation.copy(UP[s.up ?? '-y'] ?? UP['-y']);
    orient.scale.setScalar(s.scale ?? 1);
    entry.v.removeFromParent();
    orient.add(entry.v);
    const g = new THREE.Group();
    g.rotation.y = -THREE.MathUtils.degToRad(s.heading ?? 0);
    g.add(orient);
    const item = { ...at, model: { group: g, top: 10 }, era: 'both', trueSize: true, splat: entry, name: s.name, scan: { ...s },
      placed: scanPlaced(source.slug, raw) };
    if (s.alt != null) item.baseAlt = s.alt;
    else item.baseAlt = ctx.terrain(at.i, at.j) + 1.5; // phone height above the ground where it was taken
    item.scan.alt = item.baseAlt;
    items.push(item);
  }
  return items;
}

// assets/splats/index.json says which sites have splats, so other sites don't request missing files.
let index = null;
// Move a scan: east/north in metres, heading in degrees, height in metres. Updates it live and saves it.
export function adjustScan(source, item, { east = 0, north = 0, turn = 0, up = 0 }) {
  const s = item.scan;
  s.lat += north / 111320;
  s.lon += east / (111320 * Math.cos((s.lat * Math.PI) / 180));
  s.heading = (((s.heading ?? 0) + turn) % 360 + 360) % 360;
  s.alt += up;
  const w = source.toWindow(s.lat, s.lon);
  item.i = w.i;
  item.j = w.j;
  item.baseAlt = s.alt;
  item.model.group.rotation.y = -THREE.MathUtils.degToRad(s.heading);
  const keep = { lat: +s.lat.toFixed(7), lon: +s.lon.toFixed(7), heading: +s.heading.toFixed(1), alt: +s.alt.toFixed(2) };
  try {
    localStorage.setItem(ADJUST_KEY(source.slug, s.name), JSON.stringify(keep));
  } catch { /* private browsing */ }
  item.placed = true;
  return keep;
}

export async function loadSplatList(slug) {
  try {
    index ??= fetch('assets/splats/index.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    if (!(await index)[slug]) return null;
    const r = await fetch(`assets/splats/${slug}.json`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
