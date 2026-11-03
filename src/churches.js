import * as THREE from 'three';
import { buildHouses } from './kithouse.js';
import { collider } from './collide.js';
import { metreUVs } from './textures.js';

// Medieval churches built from the Medieval Village MegaKit's stone pieces, fitted inside their mapped outlines:
// a west tower, a nave of two or three stages (plain stone below, round-headed windows above, buttresses between
// the bays, a south door), a narrower chancel to the east, steep tiled roofs on stone gables, and inside, a brick
// floor, benches and an altar. The tower has a battlemented parapet with corner pinnacles, or (a small church) a
// tiled pyramid roof. Proportions follow the outline's oriented rectangle; the details are conjectural.

const M = 2; // a wall module
const H = 3.12; // a stage

// The outline's smallest enclosing rectangle (metres east/south of its centroid): its middle, long axis (unit,
// pointing east-ish), length and width.
export function outlineBox(outline) {
  const c = [outline.reduce((s, p) => s + p[0], 0) / outline.length, outline.reduce((s, p) => s + p[1], 0) / outline.length];
  const k = Math.cos((c[0] * Math.PI) / 180);
  const pts = outline.map(([lat, lon]) => [(lon - c[1]) * 111320 * k, -(lat - c[0]) * 111320]);
  let best = null;
  for (let n = 0; n < pts.length; n++) {
    const [ax, az] = pts[n];
    const [bx, bz] = pts[(n + 1) % pts.length];
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 1e-6) continue;
    const u = [(bx - ax) / l, (bz - az) / l];
    const v = [-u[1], u[0]];
    let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, z] of pts) {
      const a = x * u[0] + z * u[1];
      const b = x * v[0] + z * v[1];
      [u0, u1, v0, v1] = [Math.min(u0, a), Math.max(u1, a), Math.min(v0, b), Math.max(v1, b)];
    }
    let [L, W] = [u1 - u0, v1 - v0];
    let [uu, mid] = [u, [u[0] * (u0 + u1) / 2 + v[0] * (v0 + v1) / 2, u[1] * (u0 + u1) / 2 + v[1] * (v0 + v1) / 2]];
    if (W > L) [L, W, uu] = [W, L, v];
    if (!best || L * W < best.L * best.W) best = { L, W, u: uu, mid };
  }
  if (best.u[0] < 0) best.u = [-best.u[0], -best.u[1]]; // the long axis points east (churches face east)
  return { ...best, centre: c, lat: (z) => c[0] - z / 111320, lon: (x) => c[1] + x / (111320 * k) };
}

// The rectangle grown by `grow` metres, as [[lat, lon] x 4] (for the houses to keep clear of).
export function outlineClear(outline, grow = 3) {
  const b = outlineBox(outline);
  const v = [-b.u[1], b.u[0]];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => {
    const x = b.mid[0] + b.u[0] * s * (b.L / 2 + grow) + v[0] * t * (b.W / 2 + grow);
    const z = b.mid[1] + b.u[1] * s * (b.L / 2 + grow) + v[1] * t * (b.W / 2 + grow);
    return [b.lat(z), b.lon(x)];
  });
}

// The plan in the church's own frame: x along the axis (east), z across (south), y up from the floor.
function churchPlan({ L, W, towerH, stages }) {
  const list = [];
  const segs = [];
  const add = (name, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => list.push({ name, m: new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z).multiply(new THREE.Matrix4().makeScale(sx, sy, sz)) });
  const box = (material, sx, sy, sz, x, y, z, ry = 0) => list.push({ geometry: metreUVs(new THREE.BoxGeometry(sx, sy, sz), 1).rotateY(ry).translate(x, y, z), material });
  const even = (x) => Math.max(M * 2, Math.floor(x / M) * M);
  // Sizes in whole modules.
  const T = Math.min(8, even(Math.min(W, L * 0.25))); // the tower's side
  const NW = Math.min(12, even(W)); // the nave's width
  const total = even(L);
  const hasChancel = total - T >= 16;
  const CL = hasChancel ? even((total - T) * 0.3) : 0;
  const CW = Math.max(4, NW - 4);
  const NL = total - T - CL;
  const x0 = -total / 2; // the west end
  const xn0 = x0 + T; // the nave's west end
  const xc0 = xn0 + NL; // the chancel's west end
  const rot = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };
  // A run of wall modules from (xa, za) along +x or +z, n modules, facing `face`, `rows` stages high: plain stone
  // below, windows in the top stage (every other module); the door in the bottom stage at module `door`.
  const run = (xa, za, n, face, rows, door = -1, every = 2) => {
    for (let k = 0; k < n; k++) {
      const along = face === 'S' || face === 'N';
      const x = along ? xa + M / 2 + k * M : xa;
      const z = along ? za : za + M / 2 + k * M;
      for (let r = 0; r < rows; r++) {
        const win = r === rows - 1 && rows > 1 && k % every === every - 1;
        const name = r === 0 && k === door ? 'Wall_UnevenBrick_Door_Round' : win ? 'Wall_UnevenBrick_Window_Thin_Round' : 'Wall_UnevenBrick_Straight';
        add(name, x, r * H, z, rot[face]);
        if (win) add('Window_Thin_Round1', x, r * H, z, rot[face]);
      }
    }
  };
  // A stone gable (a triangle `w` wide and `rise` high, 0.6 thick) at x, across z, at height y.
  const gable = (x, w, rise, y) => {
    const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise)]);
    list.push({ geometry: metreUVs(new THREE.ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: false }).translate(0, 0, -0.3).rotateY(Math.PI / 2).translate(x, y, 0), 1), material: 'MI_UnevenBrick' });
  };
  // A block (nave or chancel): walls round it (less the sides it shares), roof, gables, buttresses.
  const block = (xa, len, w, rows, { west = true, east = true, door = -1 }) => {
    const n = len / M;
    run(xa, w / 2, n, 'S', rows, door);
    run(xa, -w / 2, n, 'N', rows);
    if (east) run(xa + len, -w / 2, w / M, 'E', rows, -1, 99);
    if (west) run(xa, -w / 2, w / M, 'W', rows, -1, 99);
    const top = rows * H;
    // The roof: the kit's 8 m roof stretched to the block (its pitch kept), on gables.
    const s = w / 8;
    add('Roof_RoundTiles_8x8', xa + len / 2, top, 0, Math.PI / 2, s, s, (len + 0.4) / 8);
    gable(xa + 0.15, w, 5.6 * s, top - 0.05);
    gable(xa + len - 0.15, w, 5.6 * s, top - 0.05);
    // Buttresses between the bays, and quoins at the corners.
    for (let k = 2; k < n; k += 2) {
      for (const sd of [-1, 1]) box('MI_UnevenBrick', 0.7, top - 0.6, 0.9, xa + k * M, (top - 0.6) / 2, sd * (w / 2 + 0.4));
    }
    for (const [cx, cz] of [[xa, -w / 2], [xa, w / 2], [xa + len, -w / 2], [xa + len, w / 2]]) box('MI_RockTrim', 0.5, top, 0.5, cx, top / 2, cz);
    // What you can't walk through: its walls (the door left open).
    const dx = door >= 0 ? xa + M / 2 + door * M : null;
    if (dx != null) segs.push({ a: [xa, w / 2], b: [dx - 0.6, w / 2], half: 0.35 }, { a: [dx + 0.6, w / 2], b: [xa + len, w / 2], half: 0.35 });
    else segs.push({ a: [xa, w / 2], b: [xa + len, w / 2], half: 0.35 });
    segs.push({ a: [xa, -w / 2], b: [xa + len, -w / 2], half: 0.35 });
    if (east) segs.push({ a: [xa + len, -w / 2], b: [xa + len, w / 2], half: 0.35 });
    if (west) segs.push({ a: [xa, -w / 2], b: [xa, w / 2], half: 0.35 });
  };
  block(xn0, NL, NW, stages, { west: true, east: !hasChancel, door: Math.floor(NL / M / 3) });
  if (hasChancel) {
    block(xc0, CL, CW, Math.max(2, stages - 1), { west: false, east: true });
    // The nave's east wall either side of the chancel arch.
    const side = (NW - CW) / 2;
    for (const sd of [-1, 1]) {
      const za = sd < 0 ? -NW / 2 : CW / 2;
      run(xc0, za, side / M, 'E', stages, -1, 99);
      segs.push({ a: [xc0, za], b: [xc0, za + side], half: 0.35 });
    }
    // Over the chancel arch, up to the nave's roof.
    box('MI_UnevenBrick', 0.6, (stages - Math.max(2, stages - 1)) * H + 0.1, CW, xc0, (Math.max(2, stages - 1) * H + stages * H) / 2, 0);
  }
  // The tower: stages to its height, a door to the west, belfry windows in the top stage, a parapet.
  const tStages = Math.max(stages + 1, Math.round(towerH / H));
  const tn = T / M;
  for (const [face, xa, za] of [['S', x0, T / 2], ['N', x0, -T / 2], ['W', x0, -T / 2], ['E', x0 + T, -T / 2]]) {
    for (let r = 0; r < tStages; r++) {
      for (let k = 0; k < tn; k++) {
        const along = face === 'S' || face === 'N';
        const x = along ? xa + M / 2 + k * M : xa;
        const z = along ? za : za + M / 2 + k * M;
        const door = face === 'W' && r === 0 && k === Math.floor((tn - 1) / 2);
        const win = r === tStages - 1 || (r === Math.floor(tStages / 2) && k === Math.floor((tn - 1) / 2));
        if (face === 'E' && r < stages) continue; // opens into the nave
        add(door ? 'Wall_UnevenBrick_Door_Round' : win ? 'Wall_UnevenBrick_Window_Thin_Round' : 'Wall_UnevenBrick_Straight', x, r * H, z, rot[face]);
        if (win) add('Window_Thin_Round1', x, r * H, z, rot[face]);
        if (door) add('Door_8_Round', x + 0.12, r * H, z - 0.53, rot[face] - 1.3); // (the house's open door, turned to face west)
      }
    }
  }
  const tTop = tStages * H;
  for (const [cx, cz] of [[x0, -T / 2], [x0, T / 2], [x0 + T, -T / 2], [x0 + T, T / 2]]) box('MI_RockTrim', 0.6, tTop + 0.3, 0.6, cx, (tTop + 0.3) / 2, cz);
  if (T >= 6) {
    // A battlemented parapet with a string course, and pinnacles at the corners.
    box('MI_RockTrim', T + 0.6, 0.3, T + 0.6, x0 + T / 2, tTop + 0.15, 0);
    for (const sd of [-1, 1]) {
      box('MI_UnevenBrick', T + 0.4, 0.8, 0.35, x0 + T / 2, tTop + 0.7, sd * (T / 2 + 0.1));
      box('MI_UnevenBrick', 0.35, 0.8, T + 0.4, x0 + T / 2 + sd * (T / 2 + 0.1), tTop + 0.7, 0);
      for (let q = -T / 2 + 0.4; q <= T / 2 - 0.3; q += 1.2) {
        box('MI_UnevenBrick', 0.7, 0.7, 0.35, x0 + T / 2 + q, tTop + 1.45, sd * (T / 2 + 0.1));
        box('MI_UnevenBrick', 0.35, 0.7, 0.7, x0 + T / 2 + sd * (T / 2 + 0.1), tTop + 1.45, q);
      }
    }
    for (const [cx, cz] of [[x0, -T / 2], [x0, T / 2], [x0 + T, -T / 2], [x0 + T, T / 2]]) {
      box('MI_RockTrim', 0.7, 2.2, 0.7, cx, tTop + 1.1, cz);
      list.push({ geometry: new THREE.ConeGeometry(0.5, 1.6, 4).rotateY(Math.PI / 4).translate(cx, tTop + 3.0, cz), material: 'MI_RockTrim' });
    }
    // The tower's roof behind the parapet.
    box('MI_WoodTrim', T, 0.2, T, x0 + T / 2, tTop + 0.2, 0);
  } else {
    add('Roof_Tower_RoundTiles', x0 + T / 2, tTop, 0, 0, T / 5.4, T / 5.4, T / 5.4);
  }
  segs.push({ a: [x0, -T / 2], b: [x0 + T, -T / 2], half: 0.4 }, { a: [x0, T / 2], b: [x0 + T, T / 2], half: 0.4 }, { a: [x0, -T / 2], b: [x0, T / 2], half: 0.4 });
  // Dark boards behind the stone panels (inside the wall), so no crack between the kit's panels shows daylight.
  for (const { name, m } of list.slice()) {
    if (!name?.startsWith('Wall_') || name.includes('Door')) continue;
    list.push({ geometry: new THREE.BoxGeometry(2.06, 3.0, 0.05).translate(0, 1.55, -0.2).applyMatrix4(m), material: 'BACKING' });
  }
  // A stone step along the south front (the kit's kerb).
  for (let x = xn0 + 1; x < xc0 - 1; x += M) add('Prop_ExteriorBorder_Straight1', x, 0, NW / 2 + 0.1);
  // Inside: a brick floor; benches down the nave either side of an aisle; an altar at the east end.
  for (let x = xn0; x < x0 + total; x += M) {
    const w = x < xc0 ? NW : CW;
    for (let z = -w / 2; z < w / 2; z += M) add('Floor_Brick', x + M / 2, 0.02, z + M / 2);
  }
  for (let x = xn0 + 3; x < xc0 - 2.5; x += 1.6) {
    for (const sd of [-1, 1]) {
      const bw = NW / 2 - 1.6;
      box('MI_WoodTrim', 0.4, 0.45, bw, x, 0.23, sd * (0.9 + bw / 2));
      segs.push({ a: [x, sd * 0.9], b: [x, sd * (0.9 + bw)], half: 0.3 });
    }
  }
  const ax = x0 + total - 1.6;
  box('MI_RockTrim', 1.2, 1.0, Math.min(3, CW - 1.5), ax, 0.5, 0);
  box('GOODS_RED', 1.25, 0.04, Math.min(3, CW - 1.5) + 0.1, ax, 1.02, 0);
  segs.push({ a: [ax, -1.4], b: [ax, 1.4], half: 0.8 });
  return { list, segs, x0, total, NW, CW, xc0, T };
}

// A church as a feature item. ground(i, j): the period's ground. towerH: metres.
export function kitChurch(ctx, outline, { towerH, era, ground, stages = 2 }) {
  const b = outlineBox(outline);
  const at = ctx.at(b.lat(b.mid[1]), b.lon(b.mid[0]));
  if (!at) return null;
  const mpp = ctx.metresPerPixel;
  const plan = churchPlan({ L: b.L, W: b.W, towerH, stages });
  const th = -Math.atan2(b.u[1], b.u[0]); // the plan's +x onto the axis
  const [c, s] = [Math.cos(th), Math.sin(th)];
  const toLocal = (x, z) => [x * c + z * s, -x * s + z * c];
  const toPx = (x, z) => {
    const [X, Z] = toLocal(x, z);
    return [at.i + X / mpp, at.j + Z / mpp];
  };
  // Its floor: as high as the ground anywhere under it, on a stone plinth.
  let hi = -Infinity;
  let lo = Infinity;
  for (let x = plan.x0; x <= plan.x0 + plan.total; x += 2) {
    for (let z = -plan.NW / 2; z <= plan.NW / 2; z += 2) {
      const g = ground(...toPx(x, z));
      hi = Math.max(hi, g);
      lo = Math.min(lo, g);
    }
  }
  const base = hi + 0.1;
  const matrix = new THREE.Matrix4().makeRotationY(th).setPosition(0, base, 0);
  const root = new THREE.Group();
  // On a plinth of dressed stone, down to the lowest ground under it.
  plan.list.push({ geometry: metreUVs(new THREE.BoxGeometry(plan.total + 0.8, base - lo + 3, plan.NW + 0.8), 1).translate(plan.x0 + plan.total / 2, -(base - lo + 3) / 2, 0), material: 'MI_RockTrim' });
  buildHouses([{ plan, matrix }]).then((g) => root.add(g));
  const segs = plan.segs.map((sg) => ({ a: toPx(...sg.a), b: toPx(...sg.b), half: sg.half }));
  // Inside (and on the step by the south door) you stand on its floor.
  const walk = (i, j) => {
    const X = (i - at.i) * mpp;
    const Z = (j - at.j) * mpp;
    const x = X * c - Z * s;
    const z = X * s + Z * c;
    if (x < plan.x0 + plan.T || x > plan.x0 + plan.total) return null;
    const w = x < plan.xc0 ? plan.NW : plan.CW;
    return Math.abs(z) < w / 2 + 1.2 ? base : null;
  };
  return { ...at, model: { group: root, top: towerH }, era, trueSize: true, baseAlt: 0, far: true, collide: collider(segs, mpp), walk };
}

