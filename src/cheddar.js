import { RES } from './terrain.js';
import { BASEMAPS } from './overlay.js';

// Cheddar Gorge, from deep time to now. Geology (British Geological Survey; Wikipedia, Cheddar Gorge, Mendip Hills,
// Gough's Cave): the rock is Carboniferous Limestone, laid down about 350 million years ago in a warm shallow sea from
// the shells and skeletons of sea creatures; folded and lifted into the Mendip Hills about 300 million years ago.
// The gorge was cut in the cold stages of the last ice ages (within roughly the last million years): with the ground
// frozen (permafrost) the limestone's cracks were sealed, so summer meltwater ran over the surface and carved the
// gorge; as the climate warmed the river sank into the caves, and it now rises at the foot as the Cheddar Yeo.
// People sheltered in Gough's Cave about 14,700 years ago; Cheddar Man lived about 9,000 years ago.
// The landscape "before the gorge" is a reconstruction: today's terrain with every valley narrower than about
// 260 m filled to the level of the land either side (a morphological closing), not a survey of an ancient surface.

export const CHEDDAR_ERAS = [
  { id: 'now', label: 'CHEDDAR TODAY', base: 'aerial' },
  { id: 'mesolithic', label: 'CHEDDAR MAN · c. 7000 BC', base: 'none' },
  { id: 'ice-age', label: 'ICE AGE · c. 15,000 YEARS AGO', base: 'none' },
  { id: 'before', label: 'BEFORE THE GORGE (reconstruction)', base: 'none' },
  { id: 'carboniferous', label: 'CARBONIFEROUS SEA · 350 MILLION YEARS AGO', base: 'none' },
];

// How far the gorge is cut (0 none, 1 today), whether the ground is frozen tundra, and the sea.
// ancient: before today, so the modern quarries are filled in.
const ERA_STATE = {
  now: { cut: 1 },
  mesolithic: { cut: 1, ancient: true },
  'ice-age': { cut: 0.7, tundra: true, ancient: true, river: true },
  before: { cut: 0, ancient: true },
  carboniferous: { cut: 0, sea: true, ancient: true },
};

const GAP = 130; // metres: valleys up to twice this wide are filled in the "before" landscape
const PIT = 450; // metres: wider pits that only a much bigger filling closes are quarries (modern), filled before today

// Running max (or min) over a window of r cells either side, along rows then columns.
function morph(src, r, isMax) {
  const n = RES;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const pick = isMax ? (a, b) => (a > b ? a : b) : (a, b) => (a < b ? a : b);
  const pass = (from, to, horizontal) => {
    const line = new Float32Array(n);
    const res = new Float32Array(n);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) line[b] = from[horizontal ? a * n + b : b * n + a];
      // van Herk / Gil-Werman: block prefix and suffix extremes give each window's extreme in O(1).
      const w = 2 * r + 1;
      const pre = new Float32Array(n);
      const suf = new Float32Array(n);
      for (let b = 0; b < n; b++) pre[b] = b % w === 0 ? line[b] : pick(pre[b - 1], line[b]);
      for (let b = n - 1; b >= 0; b--) suf[b] = b === n - 1 || (b + 1) % w === 0 ? line[b] : pick(suf[b + 1], line[b]);
      for (let b = 0; b < n; b++) {
        const lo = Math.max(0, b - r);
        const hi = Math.min(n - 1, b + r);
        res[b] = pick(suf[lo], pre[hi]);
      }
      for (let b = 0; b < n; b++) to[horizontal ? a * n + b : b * n + a] = res[b];
    }
  };
  pass(src, tmp, true);
  pass(tmp, out, false);
  return out;
}

function blur(src, r) {
  let a = src;
  for (let k = 0; k < 2; k++) {
    const t = new Float32Array(a.length);
    const o = new Float32Array(a.length);
    for (let j = 0; j < RES; j++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += a[j * RES + Math.min(RES - 1, Math.max(0, i))];
      for (let i = 0; i < RES; i++) {
        t[j * RES + i] = s / (2 * r + 1);
        s += a[j * RES + Math.min(RES - 1, i + r + 1)] - a[j * RES + Math.max(0, i - r)];
      }
    }
    for (let i = 0; i < RES; i++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += t[Math.min(RES - 1, Math.max(0, j)) * RES + i];
      for (let j = 0; j < RES; j++) {
        o[j * RES + i] = s / (2 * r + 1);
        s += t[Math.min(RES - 1, j + r + 1) * RES + i] - t[Math.max(0, j - r) * RES + i];
      }
    }
    a = o;
  }
  return a;
}

// Called when terrain arrives: work out the filled ("before the gorge") surface for this window.
export function onApply(map) {
  const terrain = map.grids.terrain;
  const r = Math.max(2, Math.round(GAP / (map.span / RES)));
  const closed = morph(morph(terrain, r, true), r, false);
  const smooth = blur(closed, Math.max(1, Math.round(r / 3)));
  const filled = new Float32Array(terrain.length);
  for (let k = 0; k < filled.length; k++) filled[k] = Math.max(terrain[k], smooth[k]);
  // Quarries: deep pits (over 15 m) left by the gorge filling but closed by a much wider one. Before today they
  // are filled to that wider surface. Found once, over the whole place (a close-up window is too small to tell a
  // quarry from a valley), and kept in the place's own coordinates for every later window.
  const source = map.source;
  const cellsAcross = map.span / RES;
  if (!source.quarries && map.span >= source.size * 0.99) {
    const R2 = Math.round(PIT / cellsAcross);
    const wide = blur(morph(morph(terrain, R2, true), R2, false), Math.max(1, Math.round(R2 / 4)));
    const height = new Float32Array(terrain.length).fill(NaN);
    // Weight 0..1 by how deep the pit is (fading in from 10 m to 30 m), so the filling has no hard edge.
    const weight = new Float32Array(terrain.length);
    for (let k = 0; k < terrain.length; k++) {
      const d = wide[k] - closed[k];
      if (d > 10) {
        height[k] = wide[k];
        weight[k] = Math.min(1, (d - 10) / 20);
      }
    }
    // Height times weight and weight, blurred alike: their ratio is the fill height, smooth at the edges.
    source.quarries = { height: blur(height.map((v, k) => (Number.isNaN(v) ? 0 : v * weight[k])), 3), weight: blur(weight, 3), cell: source.size / RES };
  }
  const unquarried = Float32Array.from(terrain);
  let quarry = 0;
  const q = source.quarries;
  if (q) {
    const x0 = source.cx - map.span / 2;
    const y0 = source.cy - map.span / 2;
    for (let j = 0; j < RES; j++) {
      const qj = Math.floor((y0 + (j + 0.5) * cellsAcross) / q.cell);
      if (qj < 0 || qj >= RES) continue;
      for (let i = 0; i < RES; i++) {
        const qi = Math.floor((x0 + (i + 0.5) * cellsAcross) / q.cell);
        if (qi < 0 || qi >= RES) continue;
        // Bilinear, so the place's coarse grid doesn't show as blocks at life size.
        const fx = (x0 + (i + 0.5) * cellsAcross) / q.cell - 0.5;
        const fy = (y0 + (j + 0.5) * cellsAcross) / q.cell - 0.5;
        const ix = Math.max(0, Math.min(RES - 2, Math.floor(fx)));
        const iy = Math.max(0, Math.min(RES - 2, Math.floor(fy)));
        const tx = Math.min(1, Math.max(0, fx - ix));
        const ty = Math.min(1, Math.max(0, fy - iy));
        const bl = (g) => {
          const a = g[iy * RES + ix] + (g[iy * RES + ix + 1] - g[iy * RES + ix]) * tx;
          const b = g[(iy + 1) * RES + ix] + (g[(iy + 1) * RES + ix + 1] - g[(iy + 1) * RES + ix]) * tx;
          return a + (b - a) * ty;
        };
        const w = bl(q.weight);
        if (w <= 0.001) continue;
        const k = j * RES + i;
        const h = bl(q.height) / w;
        const target = Math.max(terrain[k], h);
        unquarried[k] = terrain[k] + (target - terrain[k]) * w;
        filled[k] = Math.max(filled[k], unquarried[k]);
        quarry++;
      }
    }
  }
  let top = -Infinity;
  for (const v of filled) top = Math.max(top, v);
  map.cheddarFill = { filled, unquarried, top, quarry };
}

// The state on show: a running scene's (map.cheddar) or the era's.
function state(map) {
  return map.cheddar ?? ERA_STATE[map.era] ?? ERA_STATE.now;
}

export function composeGrid(map) {
  const { terrain } = map.grids;
  const f = map.cheddarFill;
  const { cut, ancient } = state(map);
  if (!f) return { ground: terrain, surface: terrain };
  const base = ancient ? f.unquarried : terrain;
  if (cut >= 1) return { ground: base, surface: base };
  const ground = new Float32Array(terrain.length);
  for (let k = 0; k < ground.length; k++) ground[k] = f.filled[k] + (base[k] - f.filled[k]) * cut;
  return { ground, surface: ground };
}

// The Carboniferous sea covers everything; otherwise no sea here (the reservoir comes from the map).
export function waterLevel(map) {
  const s = state(map);
  if (s.seaLevel != null) return s.seaLevel;
  return s.sea && map.cheddarFill ? map.cheddarFill.top + 25 : null;
}

// Tundra: frost-pale grass with snow on the flatter ground (the terrain shader's uTundra), 0 to 1.
export function tundraFor(map) {
  const s = state(map);
  return s.tundra === true ? 1 : s.tundra || 0;
}

// Ice-age meltwater: water routed downhill over the ground on show (each cell drains to its lowest neighbour);
// wherever it has gathered from more than about 2.5 hectares it runs as a stream, wider as it grows. Recomputed
// only when the ground changes. Returns a RES x RES mask (0..255) or null.
const CATCH = 25000; // square metres of catchment before a stream shows
export function riverFor(map, ground) {
  if (!state(map).river) return null;
  if (map.cheddarRiver?.ground === ground) return map.cheddarRiver.mask;
  const n = RES * RES;
  const order = new Uint32Array(n);
  for (let k = 0; k < n; k++) order[k] = k;
  order.sort((a, b) => ground[b] - ground[a]);
  const acc = new Float32Array(n).fill(1);
  for (const k of order) {
    const i = k % RES;
    const j = (k - i) / RES;
    let low = k;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const x = i + di;
        const y = j + dj;
        if ((!di && !dj) || x < 0 || y < 0 || x >= RES || y >= RES) continue;
        const q = y * RES + x;
        if (ground[q] < ground[low]) low = q;
      }
    }
    if (low !== k) acc[low] += acc[k];
  }
  const cell = map.span / RES;
  const area = cell * cell;
  const mask = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const a = acc[k] * area;
    if (a < CATCH) continue;
    const widthM = Math.min(14, 2.5 + 2.2 * Math.log2(a / CATCH));
    const r = widthM / 2 / cell;
    const R = Math.ceil(r);
    const i = k % RES;
    const j = (k - i) / RES;
    for (let dj = -R; dj <= R; dj++) {
      for (let di = -R; di <= R; di++) {
        const x = i + di;
        const y = j + dj;
        if (x < 0 || y < 0 || x >= RES || y >= RES) continue;
        const d = Math.hypot(di, dj);
        if (d > r + 0.5) continue;
        const v = Math.round(255 * Math.min(1, r + 0.5 - d));
        const q = y * RES + x;
        if (v > mask[q]) mask[q] = v;
      }
    }
  }
  map.cheddarRiver = { ground, mask };
  return mask;
}

export function footprintsFor(map, era) {
  return era === 'now' ? map.source.buildings : [];
}

// Today's trees; and in Cheddar Man's time the Mendips were wooded (today's trees stand in for that woodland).
export function treesFor(era) {
  return era === 'now' || era === 'mesolithic';
}

// --- the scene ---

const PHASES = [
  { until: 10, text: '350 million years ago: a warm, shallow tropical sea. Shells and skeletons of sea creatures pile up on the sea floor and harden into limestone.' },
  { until: 20, text: 'About 300 million years ago the limestone is folded and pushed up into the Mendip Hills. Over ages the hills wear down to a rolling plateau.' },
  { until: 50, text: 'The ice ages, within the last million years or so. The ground is frozen solid, so summer meltwater cannot sink into the limestone: it pours across the surface and cuts the gorge, cold stage after cold stage.' },
  { until: 62, text: "As the climate warms the river sinks into the caves; today it rises at the gorge foot as the Cheddar Yeo. People sheltered in Gough's Cave about 14,700 years ago; Cheddar Man lived here about 9,000 years ago." },
];

export class HowTheGorgeFormed {
  static title = 'How Cheddar Gorge formed';
  static caption = 'Deep time to now, compressed into a minute: the Carboniferous sea, the Mendips lifted, and the gorge cut by ice-age meltwater. The landscape before the gorge is a reconstruction (today\'s valleys filled in); the sea and river are illustrative.';

  constructor(ctx) {
    this.ctx = ctx;
    this.t = 0;
    this.phase = -1;
    this.redraw = 0;
    // Deep time has no fields or roads: the map is off until today comes back.
    const map = ctx.map;
    this.savedBase = map.baseIndex;
    map.baseIndex = BASEMAPS.findIndex((b) => b.id === 'none');
    map.refreshOverlay();
  }

  update(dt) {
    const map = this.ctx.map;
    this.t += dt;
    const t = this.t;
    const top = map.cheddarFill?.top ?? 300;
    let s;
    if (t < 10) s = { cut: 0, ancient: true, seaLevel: top + 25 - Math.max(0, t - 5) * ((top + 25) / 5) * 0.9 };
    else if (t < 20) s = { cut: 0, ancient: true };
    else if (t < 50) s = { cut: (t - 20) / 30, tundra: true, ancient: true, river: t > 24 };
    else s = { cut: 1, ancient: t < 60, tundra: Math.max(0, 1 - (t - 50) / 6) };
    map.cheddar = s;
    const k = PHASES.findIndex((p) => t < p.until);
    if (k !== this.phase && k >= 0) {
      this.phase = k;
      map.game.flash?.(HowTheGorgeFormed.title, PHASES[k].text);
    }
    // Redraw the ground and water a few times a second (it's a whole-window recalculation).
    if ((this.redraw -= dt) <= 0) {
      this.redraw = 0.2;
      map.showGrid();
      map.floodSea();
    }
    if (t > 58 && !this.restored) {
      this.restored = true;
      map.baseIndex = this.savedBase;
      map.refreshOverlay();
    }
    return t < 64;
  }

  stop() {
    const map = this.ctx.map;
    map.cheddar = null;
    if (!this.restored) {
      map.baseIndex = this.savedBase;
      map.refreshOverlay();
    }
    map.showGrid();
    map.floodSea();
  }
}
