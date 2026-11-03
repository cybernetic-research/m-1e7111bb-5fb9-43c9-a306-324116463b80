import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { thatchTexture, daubTexture, timberTexture, shingleTexture, stoneTexture, textured, metreUVs, roundUVs } from './textures.js';
import { RES } from './terrain.js';

// Life inside the hillforts.
// - IRON AGE (c. 100 BC): a settlement of roundhouses (wattle-and-daub walls, conical thatched roofs, doors facing
//   east to south-east as excavated ones mostly do), raised four-post granaries, and a timber palisade on the inner
//   rampart with a gate. You can walk into the houses: hearth, roof posts, beds, a loom and pots.
// - AD 500 (Cadbury Castle, Cadbury Congresbury): refortified with a new timber rampart, and at South Cadbury a
//   great hall about 19 x 10 m (Leslie Alcock's excavations). The hall can be walked into: aisle posts, benches
//   along the walls, a long hearth, shields and lamps.
// The rampart line is where the hilltop falls away (the area above a height that matches the known size of each
// interior); house numbers, sizes and positions are illustrative, generated the same way every time.

const thatch = textured(thatchTexture(0x9b8456), { side: THREE.DoubleSide });
const daub = textured(daubTexture(0xb3a17f), { side: THREE.DoubleSide });
const timber = textured(timberTexture(0x6b4a2e), { side: THREE.DoubleSide });
const darkTimber = textured(timberTexture(0x4a3523));
const shingles = textured(shingleTexture(0x6f6650), { side: THREE.DoubleSide });
const hearthStone = textured(stoneTexture(0x7c7770, 6), { tile: 1 });
const floorMat = new THREE.MeshStandardMaterial({ color: 0x6b5638, roughness: 1 });
const fur = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 });
const cloth = new THREE.MeshStandardMaterial({ color: 0x7a3b2a, roughness: 1 });
const pot = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.9 });
const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.5 });
const embers = new THREE.MeshBasicMaterial({ color: 0xff5a1a });
const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
const shieldPaint = [0xb83a2a, 0xe0c060, 0x2f5f8a, 0xe8e0d0].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));

const hash = (a, b) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Merge geometries per material into a handful of meshes.
function build(parts) {
  const g = new THREE.Group();
  const byMat = new Map();
  for (const [geo, mat] of parts) {
    // Texture coordinates in metres, unless a round part already has its own.
    if (!geo.userData.uvDone) metreUVs(geo);
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(geo.index ? geo.toNonIndexed() : geo);
  }
  for (const [mat, geos] of byMat) {
    for (const geo of geos) {
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    }
    g.add(new THREE.Mesh(mergeGeometries(geos), mat));
  }
  return g;
}

// A hearth: a ring of stones, glowing embers, and flames that flicker (item.animate).
function hearth(parts, x, z, r = 0.7) {
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    parts.push([new THREE.BoxGeometry(0.35, 0.22, 0.28).rotateY(a).translate(x + Math.sin(a) * r, 0.23, z + Math.cos(a) * r), hearthStone]);
  }
  parts.push([new THREE.CircleGeometry(r * 0.8, 12).rotateX(-Math.PI / 2).translate(x, 0.16, z), embers]);
}

function flames(x, z, size = 1) {
  const g = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.12 * size, 0.55 * size, 7), flameMat);
    f.position.set(x + Math.sin(k * 2.4) * 0.22 * size, 0.15 + 0.27 * size, z + Math.cos(k * 2.4) * 0.22 * size);
    f.userData.size = size;
    f.userData.base = f.position.clone();
    g.add(f);
  }
  return g;
}

function flicker(group, t) {
  group.children.forEach((f, k) => {
    const s = 0.6 + 0.5 * Math.abs(Math.sin(t * (7 + k * 2.3) + k) * Math.sin(t * 3.1 + k * 1.7));
    f.scale.set(1, s, 1);
    f.position.y = f.userData.base.y * s;
  });
}

// A roundhouse of diameter d, door facing +z. Walls 1.9 m; roof pitched at about 45 degrees, thatch to an apex.
const houseCache = new Map();
function roundhouseGeometry(d) {
  if (houseCache.has(d)) return houseCache.get(d);
  const r = d / 2;
  const parts = [];
  const wallH = 1.9;
  const gap = 1.5 / r; // door width 1.5 m
  const wall = new THREE.CylinderGeometry(r, r, wallH, 40, 1, true, gap / 2, Math.PI * 2 - gap);
  parts.push([roundUVs(wall, r, wallH).translate(0, wallH / 2, 0), daub]);
  // Door frame: two posts and a lintel.
  for (const s of [-1, 1]) parts.push([new THREE.BoxGeometry(0.22, 2, 0.22).translate(Math.sin((s * gap) / 2) * r, 1, Math.cos((s * gap) / 2) * r), darkTimber]);
  parts.push([new THREE.BoxGeometry(1.8, 0.25, 0.25).translate(0, 1.9, r), darkTimber]);
  // A short porch roof over the door.
  parts.push([new THREE.BoxGeometry(2.2, 0.15, 1.4).rotateX(-0.5).translate(0, 2.05, r + 0.55), thatch]);
  // Roof: a thatch cone from the eaves (0.7 m out, a little below the wall top) to the apex.
  const eaveR = r + 0.7;
  const roofH = eaveR * 1.05;
  parts.push([roundUVs(new THREE.ConeGeometry(eaveR, roofH, 40, 1, true), eaveR, roofH).translate(0, 1.75 + roofH / 2, 0), thatch]);
  parts.push([new THREE.ConeGeometry(0.35, 0.6, 8).translate(0, 1.75 + roofH + 0.15, 0), thatch]);
  // Inside: a ring of posts carrying the roof, the hearth, beds by the wall, a loom, pots.
  const ringR = r * 0.62;
  const postH = 1.75 + roofH * (1 - ringR / eaveR);
  const posts = Math.max(6, Math.round(r));
  for (let k = 0; k < posts; k++) {
    const a = ((k + 0.5) / posts) * Math.PI * 2;
    parts.push([new THREE.CylinderGeometry(0.13, 0.15, postH, 6).translate(Math.sin(a) * ringR, postH / 2, Math.cos(a) * ringR), darkTimber]);
  }
  // A beaten-earth floor, a little proud of the ground so bumps in the hillside don't show through.
  parts.push([new THREE.CircleGeometry(r - 0.05, 40).rotateX(-Math.PI / 2).translate(0, 0.12, 0), floorMat]);
  hearth(parts, 0, 0, 0.6 + r * 0.04);
  for (const side of [-1, 1]) {
    const a = side * 1.9;
    const bx = Math.sin(a) * (r - 0.9);
    const bz = Math.cos(a) * (r - 0.9);
    parts.push([new THREE.BoxGeometry(1.4, 0.35, 2.2).rotateY(a).translate(bx, 0.17, bz), timber]);
    parts.push([new THREE.BoxGeometry(1.3, 0.12, 2.0).rotateY(a).translate(bx, 0.4, bz), fur]);
  }
  // Upright loom against the back wall.
  const la = Math.PI;
  const lx = Math.sin(la) * (r - 0.7);
  const lz = Math.cos(la) * (r - 0.7);
  for (const s of [-0.7, 0.7]) parts.push([new THREE.BoxGeometry(0.1, 1.9, 0.1).rotateX(0.15).translate(lx + s, 0.95, lz), darkTimber]);
  parts.push([new THREE.BoxGeometry(1.5, 0.08, 0.08).translate(lx, 1.85, lz + 0.14), darkTimber]);
  parts.push([new THREE.PlaneGeometry(1.3, 1.4).rotateX(0.15).rotateY(Math.PI).translate(lx, 1.1, lz + 0.05), cloth]);
  // Storage jars.
  for (let k = 0; k < 4; k++) {
    const a = 2.6 + k * 0.25;
    const pts = [[0, 0], [0.2, 0.02], [0.27, 0.25], [0.2, 0.55], [0.14, 0.6]].map(([x, y]) => new THREE.Vector2(x, y));
    parts.push([new THREE.LatheGeometry(pts, 10).translate(Math.sin(-a) * (r - 0.5), 0, Math.cos(-a) * (r - 0.5)), pot]);
  }
  const geo = { parts, height: 1.75 + roofH };
  houseCache.set(d, geo);
  return geo;
}

function roundhouse(d) {
  const { parts, height } = roundhouseGeometry(d);
  const g = build(parts.map(([geo, mat]) => [geo.clone(), mat]));
  const fire = flames(0, 0, 0.9);
  g.add(fire);
  return { group: g, height, animate: (t) => flicker(fire, t) };
}

// A four-post granary: a wattle store with a thatched gable roof, up on posts out of reach of damp and rats.
function granary() {
  const parts = [];
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) parts.push([new THREE.CylinderGeometry(0.15, 0.17, 1.2, 6).translate(x, 0.6, z), darkTimber]);
  parts.push([new THREE.BoxGeometry(3, 0.2, 3).translate(0, 1.25, 0), timber]);
  parts.push([new THREE.BoxGeometry(2.8, 1.5, 2.8).translate(0, 2.1, 0), daub]);
  const tri = new THREE.Shape([new THREE.Vector2(-1.9, 0), new THREE.Vector2(1.9, 0), new THREE.Vector2(0, 1.9)]);
  parts.push([metreUVs(new THREE.ExtrudeGeometry(tri, { depth: 3.6, bevelEnabled: false }).translate(0, 2.8, -1.8)), thatch]);
  return build(parts);
}

// The great hall: about 19 x 10 m, planked walls, a steep shingled roof with crossed gable boards, doors in both
// ends and one side. Long axis along x.
function greatHall() {
  const L = 19;
  const W = 10;
  const wallH = 2.6;
  const ridge = 8.5;
  const parts = [];
  // Long walls, with a door in the south (+z) side.
  for (const side of [-1, 1]) {
    const s = new THREE.Shape([new THREE.Vector2(-L / 2, 0), new THREE.Vector2(L / 2, 0), new THREE.Vector2(L / 2, wallH), new THREE.Vector2(-L / 2, wallH)]);
    if (side > 0) s.holes.push(new THREE.Path([new THREE.Vector2(-1, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 2.2), new THREE.Vector2(-1, 2.2)]));
    parts.push([metreUVs(new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false }).translate(0, 0, side * W / 2 - 0.1)), timber]);
  }
  // Gable ends, each with a door.
  for (const side of [-1, 1]) {
    const s = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(W / 2, wallH), new THREE.Vector2(0, ridge), new THREE.Vector2(-W / 2, wallH)]);
    s.holes.push(new THREE.Path([new THREE.Vector2(-1, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 2.4), new THREE.Vector2(-1, 2.4)]));
    parts.push([metreUVs(new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false }).rotateY(Math.PI / 2).translate(side * L / 2 - 0.1, 0, 0)), timber]);
    // Crossed boards at the apex.
    for (const t of [-1, 1]) {
      parts.push([new THREE.BoxGeometry(0.15, 2.4, 0.3).rotateX(t * 0.7).translate(side * (L / 2 + 0.2), ridge + 0.6, t * 0.45), darkTimber]);
    }
  }
  // Roof: two shingled slopes overhanging the walls.
  const run = W / 2 + 0.9;
  const rise = ridge - wallH + 0.6;
  const slope = Math.hypot(run, rise);
  for (const side of [-1, 1]) {
    const plane = metreUVs(new THREE.BoxGeometry(L + 1.6, 0.18, slope));
    plane.rotateX(side * Math.atan2(rise, run));
    plane.translate(0, wallH - 0.6 + rise / 2, (side * run) / 2);
    parts.push([plane, shingles]);
  }
  parts.push([new THREE.BoxGeometry(L + 1.6, 0.35, 0.5).translate(0, ridge + 0.05, 0), darkTimber]);
  // Inside: two rows of aisle posts, tie beams, benches along the walls, a long hearth, a high table.
  for (let k = 0; k < 5; k++) {
    const x = -L / 2 + 2.5 + k * ((L - 5) / 4);
    for (const side of [-1, 1]) parts.push([new THREE.CylinderGeometry(0.18, 0.2, 5.6, 8).translate(x, 2.8, side * 2.6), darkTimber]);
    parts.push([new THREE.BoxGeometry(0.25, 0.3, 5.6).translate(x, 5.5, 0), darkTimber]);
  }
  for (const side of [-1, 1]) {
    parts.push([new THREE.BoxGeometry(L - 1, 0.45, 1.5).translate(0, 0.22, side * (W / 2 - 0.95)), timber]);
    parts.push([new THREE.BoxGeometry(L - 1.4, 0.1, 1.3).translate(0, 0.5, side * (W / 2 - 0.95)), fur]);
  }
  for (let k = 0; k < 7; k++) {
    for (const [px, pz] of [[-6 + k * 2, -0.8], [-6 + k * 2, 0.8]]) {
      parts.push([new THREE.BoxGeometry(0.35, 0.15, 0.3).translate(px, 0.08, pz), hearthStone]);
    }
  }
  parts.push([new THREE.PlaneGeometry(12, 1.2).rotateX(-Math.PI / 2).translate(0, 0.03, 0), embers]);
  parts.push([new THREE.BoxGeometry(3.2, 0.9, 1.1).translate(L / 2 - 2, 0.45, 0), timber]);
  // A cauldron on a tripod over the hearth.
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    parts.push([new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5).rotateX(0.35).rotateY(a).translate(-4 + Math.sin(a) * 0.45, 1.1, Math.cos(a) * 0.45), iron]);
  }
  parts.push([new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(-4, 1, 0), iron]);
  // Painted shields along the walls.
  for (let k = 0; k < 8; k++) {
    for (const side of [-1, 1]) {
      const x = -L / 2 + 1.8 + k * 2.2;
      parts.push([new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16).rotateX(Math.PI / 2).translate(x, 1.7, side * (W / 2 - 0.16)), shieldPaint[(k + (side > 0 ? 1 : 0)) % shieldPaint.length]]);
      parts.push([new THREE.SphereGeometry(0.09, 8, 6).translate(x, 1.7, side * (W / 2 - 0.22)), iron]);
    }
  }
  const g = build(parts);
  const fire = new THREE.Group();
  for (let k = 0; k < 5; k++) for (const c of [...flames(-5 + k * 2.5, 0, 1.3).children]) fire.add(c);
  g.add(fire);
  // Hanging iron lamps (lit).
  for (let k = 0; k < 3; k++) {
    const lamp = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 4, 16), iron);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(-5 + k * 5, 4.2, 0);
    g.add(lamp);
    for (let c = 0; c < 6; c++) {
      const a = (c / 6) * Math.PI * 2;
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd080 }));
      flame.position.set(-5 + k * 5 + Math.sin(a) * 0.5, 4.32, Math.cos(a) * 0.5);
      g.add(flame);
    }
  }
  return { group: g, height: ridge + 1.5, animate: (t) => flicker(fire, t) };
}

// The interior: cells of the window above `level`, joined to the summit. Its edge, walked round from the summit
// as radii, is where the palisade goes.
function interior(ctx, summit, def) {
  const cell = ctx.metresPerPixel;
  const ground = (i, j) => ctx.terrain(i, j);
  // The summit: the highest ground within 60 m of the given point.
  let top = { i: summit.i, j: summit.j, h: ground(summit.i, summit.j) };
  const reach = Math.ceil(60 / cell);
  for (let dj = -reach; dj <= reach; dj++) {
    for (let di = -reach; di <= reach; di++) {
      const i = Math.round(summit.i + di);
      const j = Math.round(summit.j + dj);
      if (i < 0 || j < 0 || i >= RES || j >= RES) continue;
      const h = ground(i, j);
      if (h > top.h) top = { i, j, h };
    }
  }
  const N = 96;
  const radii = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    if (def.radius) {
      radii.push(def.radius);
      continue;
    }
    // Walk out until the ground has stayed below the level for 6 m (so a hedge bank or a pit doesn't stop it).
    let r = 4;
    let below = 0;
    let last = r;
    while (r < def.maxR) {
      const i = summit.i + (Math.sin(a) * r) / cell;
      const j = summit.j - (Math.cos(a) * r) / cell;
      if (i < 0 || j < 0 || i >= RES - 1 || j >= RES - 1) break;
      if (ground(i, j) < top.h - def.drop) {
        below += 2;
        if (below >= 6) break;
      } else {
        below = 0;
        last = r;
      }
      r += 2;
    }
    radii.push(last);
  }
  // Smooth: median of five neighbours.
  const smooth = radii.map((_, k) => [-2, -1, 0, 1, 2].map((d) => radii[(k + d + N) % N]).sort((x, y) => x - y)[2]);
  return { radii: smooth, N, top };
}

// The palisade: pointed stakes, with a gateway (two timber towers) at `gate` degrees. Each stake stands on its own
// ground; on the table, where the hills are exaggerated, adjust() follows.
function palisade(ctx, centre, edge, def, era) {
  const { radii, N } = edge;
  const cell = ctx.metresPerPixel;
  const g0 = ctx.terrain(centre.i, centre.j);
  const stakes = [];
  const gateA = THREE.MathUtils.degToRad(def.gate ?? 45);
  let towers = null;
  const step = 0.45;
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2;
    const a1 = ((k + 1) / N) * Math.PI * 2;
    const r0 = radii[k] - 2;
    const r1 = radii[(k + 1) % N] - 2;
    const p0 = [Math.sin(a0) * r0, -Math.cos(a0) * r0];
    const p1 = [Math.sin(a1) * r1, -Math.cos(a1) * r1];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const n = Math.max(1, Math.round(len / step));
    for (let s = 0; s < n; s++) {
      const t = s / n;
      const e = p0[0] + (p1[0] - p0[0]) * t;
      const north = p0[1] + (p1[1] - p0[1]) * t;
      const ang = Math.atan2(e, north);
      const off = Math.abs(((ang - gateA + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (off * Math.hypot(e, north) < 2.5) {
        towers ??= [e, north, ang];
        continue;
      }
      const i = centre.i + e / cell;
      const j = centre.j - north / cell;
      stakes.push([e, -north, ctx.terrain(i, j) - g0, hash(i, j)]);
    }
  }
  const stake = mergeGeometries([new THREE.CylinderGeometry(0.17, 0.19, 3.2, 6).translate(0, 1.4, 0), new THREE.ConeGeometry(0.17, 0.5, 6).translate(0, 3.25, 0)]);
  const mesh = new THREE.InstancedMesh(stake, darkTimber, stakes.length);
  const group = new THREE.Group();
  group.add(mesh);
  const m = new THREE.Matrix4();
  let lastExag = null;
  const place = (exag) => {
    stakes.forEach(([x, z, dy, rnd], k) => {
      m.makeScale(1, 0.85 + rnd * 0.3, 1).setPosition(x, dy * exag, z);
      mesh.setMatrixAt(k, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  place(1);
  if (towers) {
    const [e, north, ang] = towers;
    const ti = centre.i + e / cell;
    const tj = centre.j - north / cell;
    const gate = new THREE.Group();
    for (const s of [-1, 1]) {
      const tower = new THREE.Group();
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), darkTimber);
        post.position.set(x, 3, z);
        tower.add(post);
      }
      const deck = new THREE.Mesh(metreUVs(new THREE.BoxGeometry(2.6, 1.2, 2.6)), timber);
      deck.position.y = 5.4;
      tower.add(deck);
      tower.position.x = s * 3.6;
      gate.add(tower);
    }
    const bridge = new THREE.Mesh(metreUVs(new THREE.BoxGeometry(7.4, 0.5, 2)), timber);
    bridge.position.y = 5;
    gate.add(bridge);
    gate.rotation.y = -ang;
    gate.position.set(e, ctx.terrain(ti, tj) - g0, -north);
    gate.userData.dy = ctx.terrain(ti, tj) - g0;
    group.add(gate);
    towers = gate;
  }
  const item = { i: centre.i, j: centre.j, model: { group, top: 6 }, era, trueSize: true };
  item.adjust = (v, h) => {
    const exag = v / h;
    if (exag === lastExag) return;
    lastExag = exag;
    place(exag);
    if (towers) towers.position.y = towers.userData.dy * exag;
  };
  return item;
}

// Roundhouses spread over the interior: on a jittered grid, away from the rampart, on fairly level ground.
function settlement(ctx, centre, edge, def, era) {
  const items = [];
  const cell = ctx.metresPerPixel;
  const { radii, N } = edge;
  const spacing = def.spacing ?? 20;
  const maxR = Math.max(...radii);
  const homes = [];
  // The chief's house first, at its fixed spot (it has a viewpoint inside).
  if (def.chief) {
    const c = ctx.at(...def.chief);
    if (c) homes.push({ i: c.i, j: c.j, d: 14 });
  }
  for (let y = -maxR; y <= maxR; y += spacing) {
    for (let x = -maxR; x <= maxR; x += spacing) {
      const e = x + (hash(x, y) - 0.5) * spacing * 0.6;
      const n = y + (hash(y, x) - 0.5) * spacing * 0.6;
      const r = Math.hypot(e, n);
      const a = (Math.atan2(e, n) + Math.PI * 2) % (Math.PI * 2);
      if (r > radii[Math.round((a / (Math.PI * 2)) * N) % N] - 9) continue;
      const i = centre.i + e / cell;
      const j = centre.j - n / cell;
      if (i < 2 || j < 2 || i > RES - 3 || j > RES - 3) continue;
      const slope = Math.abs(ctx.terrain(i + 4 / cell, j) - ctx.terrain(i - 4 / cell, j)) + Math.abs(ctx.terrain(i, j + 4 / cell) - ctx.terrain(i, j - 4 / cell));
      if (slope > 2.4) continue;
      const d = 8 + Math.round(hash(e, n) * 4);
      if (homes.some((h) => Math.hypot(h.i - i, h.j - j) * cell < (h.d + d) / 2 + 5)) continue;
      homes.push({ i, j, d, granary: hash(n, e) < 0.18 });
      if (homes.length >= def.houses) break;
    }
    if (homes.length >= def.houses) break;
  }
  for (const h of homes) {
    if (h.granary) {
      const g = granary();
      g.rotation.y = hash(h.i, h.j) * Math.PI;
      items.push({ i: h.i, j: h.j, model: { group: g, top: 5 }, era, trueSize: true, pad: 2.6 });
      continue;
    }
    const house = roundhouse(h.d);
    // Doors face between east and south-east.
    house.group.rotation.y = Math.PI - THREE.MathUtils.degToRad(95 + hash(h.j, h.i) * 45);
    items.push({ i: h.i, j: h.j, model: { group: house.group, top: house.height }, era, trueSize: true, animate: house.animate, pad: h.d / 2 + 1 });
  }
  return items;
}

// lat/lon: near the summit. drop: how far below the summit the interior's edge lies. maxR: how far to look.
// radius: a fixed ring instead (for a fort on a long ridge). gate: bearing of the gateway. chief: a house with
// a viewpoint inside. hall: AD 500 great hall [lat, lon, bearing of its long axis].
const HILLFORTS = {
  'cadbury-castle': {
    at: [51.0243, -2.5325], drop: 15, maxR: 260, gate: 225, houses: 30, chief: [51.02421, -2.53273],
    eras: ['iron-age', 'ad500'], hall: [51.02462, -2.53207, 70],
  },
  'cadbury-hill': { at: [51.3806, -2.8034], drop: 8, maxR: 200, gate: 90, houses: 14, spacing: 18, chief: [51.38050, -2.80336], eras: ['iron-age', 'ad500'] },
  'brean-down': { at: [51.32448, -3.00882], radius: 48, gate: 90, houses: 6, spacing: 16, chief: [51.32448, -3.00882], eras: ['iron-age'] },
};

export function hillfortStructures(ctx, source) {
  const def = HILLFORTS[source.slug];
  const centre = def && ctx.at(...def.at);
  if (!centre) return [];
  const edge = interior(ctx, centre, def);
  const items = [];
  for (const era of def.eras) {
    items.push(palisade(ctx, centre, edge, def, era));
    // By AD 500 the old houses are long gone; a few buildings stand round the hall.
    items.push(...settlement(ctx, centre, edge, { ...def, houses: era === 'ad500' ? Math.ceil(def.houses / 4) : def.houses }, era));
    if (era === 'ad500' && def.hall) {
      const at = ctx.at(def.hall[0], def.hall[1]);
      if (at) {
        const hall = greatHall();
        // Long axis at the given bearing.
        hall.group.rotation.y = Math.PI / 2 - THREE.MathUtils.degToRad(def.hall[2]);
        items.push({ ...at, model: { group: hall.group, top: hall.height }, era, trueSize: true, animate: hall.animate, pad: 11.5 });
      }
    }
  }
  return items;
}

export const HILLFORT_ERAS = {
  'iron-age': { id: 'iron-age', label: 'IRON AGE · c. 100 BC', base: 'none' },
  ad500: { id: 'ad500', label: 'STRONGHOLD · c. AD 500', base: 'none' },
};
