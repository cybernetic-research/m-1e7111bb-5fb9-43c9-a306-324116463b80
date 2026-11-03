import * as THREE from 'three';
import { puff, Effects, rand } from './scenarios.js';

// Bath through the ages, and the Roman port of Abona at Sea Mills.
// Sources: Wikipedia (Roman Baths; Aquae Sulis; Royal Crescent; Sea Mills). Documented: temple begun AD 60-70 on a
// podium over 2 m high with a 7.9 m pediment (Gorgon head); baths enclosed in a barrel-vaulted building in the 2nd
// century; walls probably 3rd century round about 9.3 ha; the spring at 46 °C, 1.17 million litres a day; baths
// silted after Rome; John of Tours' bath over the King's Spring (12th c.); Royal Crescent 1767-74, 30 houses,
// 114 Ionic columns, 150 m. Conjecture: every building's exact form and colour, the wall line (drawn on the
// medieval walls, which followed it), the town houses, the abbey's medieval form, crowds, ships and warehouses.
// Note the Roman ground was several metres below today's streets; the model shows today's ground.

export const BATH_ERAS = [
  { id: 'now', label: 'BATH TODAY', base: 'aerial' },
  { id: 'roman', label: 'AQUAE SULIS · c. AD 200', base: 'none' },
  { id: 'medieval', label: 'THE LOST BATHS · MEDIEVAL', base: 'none' },
  { id: 'georgian', label: 'GEORGIAN SPA · 1770s', base: 'historic' },
];

// Positions from OpenStreetMap ('The Roman Baths'; 'Temple of Sulis Minerva').
const GREAT_BATH = [51.381115, -2.359734];
const TEMPLE = [51.381127, -2.35938];
const ABBEY = [51.38145, -2.35887];
const CRESCENT = [51.38727, -2.36823];
const CIRCUS = [51.38620, -2.36376];
// The walled town (on the medieval wall line, which followed the Roman one; approximate).
const WALLS = [[51.3838, -2.3618], [51.3839, -2.3588], [51.3829, -2.3572], [51.3806, -2.3571], [51.3796, -2.3588],
  [51.3797, -2.3615], [51.3812, -2.3628]];

const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...extra });
const stone = mat(0xd9c9a3);
const painted = [0xc0533a, 0xe0c27a, 0xf0e6d0, 0x6a8fa8, 0xb8462c].map((c) => mat(c));
const tile = mat(0xa64b2a);
const water = new THREE.MeshStandardMaterial({ color: 0x4f8f86, roughness: 0.15, metalness: 0.1 });

function pointIn(x, y, poly) {
  let inside = false;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [xa, ya] = poly[a];
    const [xb, yb] = poly[b];
    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}

// Georgian Bath: today's buildings inside the Georgian city (roughly the old town and the upper town to the
// Crescent); the rest (largely later) are left out. A rough cut, noted in the caption.
const GEORGIAN = [[51.3893, -2.3720], [51.3893, -2.3560], [51.3840, -2.3520], [51.3790, -2.3540], [51.3785, -2.3640],
  [51.3820, -2.3700]];
export function footprintsFor(map, era) {
  const all = map.source.buildings ?? [];
  if (era === 'now') return all;
  if (era === 'georgian') return all.filter(([, , o]) => pointIn(o[0][1], o[0][0], GEORGIAN.map(([la, lo]) => [lo, la])));
  return [];
}

// The temple of Sulis Minerva: podium, columns, pediment, bright paint.
function temple() {
  const g = new THREE.Group();
  const podium = new THREE.Mesh(new THREE.BoxGeometry(16, 2.2, 24), stone);
  podium.position.y = 1.1;
  g.add(podium);
  for (const x of [-6, -2, 2, 6]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 8, 12), stone);
    col.position.set(x, 6.2, 10);
    g.add(col);
  }
  const cella = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 15), painted[2]);
  cella.position.set(0, 6.2, -3);
  // Pediment: a triangular prism along the temple's length, front face at +z.
  const tri = new THREE.Shape([new THREE.Vector2(-8.2, 0), new THREE.Vector2(8.2, 0), new THREE.Vector2(0, 3.2)]);
  const pediment = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 24, bevelEnabled: false }), painted[0]);
  pediment.position.set(0, 10.8, -12);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.6, 25), tile);
  roof.position.y = 10.5;
  const gorgon = new THREE.Mesh(new THREE.CircleGeometry(1.2, 20), mat(0xd8a640, { metalness: 0.5 }));
  gorgon.position.set(0, 11.6, 12.4);
  g.add(cella, roof, pediment, gorgon);
  return g;
}

// The bath building: an open pool in a colonnaded hall under a barrel vault (2nd century).
function baths() {
  const g = new THREE.Group();
  const pool = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 10), water);
  pool.position.y = 0.2;
  const surround = new THREE.Mesh(new THREE.BoxGeometry(34, 0.4, 22), stone);
  g.add(surround, pool);
  for (let k = 0; k < 6; k++) {
    for (const z of [-7, 7]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 1.2), stone);
      pier.position.set(-14 + k * 5.6, 4.5, z);
      g.add(pier);
    }
  }
  // Barrel vault along the hall's length (x): the upper half of a cylinder lying on its side.
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 34, 24, 1, true, 0, Math.PI), mat(0xa64b2a, { side: THREE.DoubleSide }));
  vault.rotation.z = Math.PI / 2;
  vault.position.y = 9;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(34, 9, 0.8), painted[1]);
  walls.position.set(0, 4.5, -11);
  const walls2 = walls.clone();
  walls2.position.z = 11;
  g.add(vault, walls, walls2);
  return { group: g, pool };
}

function houseBlock(seed) {
  const g = new THREE.Group();
  const w = 8 + (seed % 5) * 2;
  const d = 10 + (seed % 3) * 3;
  const h = 4 + (seed % 2) * 3;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), painted[seed % painted.length]);
  body.position.y = h / 2;
  // Pitched tile roof: a triangular prism along the house's depth.
  const tri = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.4, 0), new THREE.Vector2(w / 2 + 0.4, 0), new THREE.Vector2(0, w * 0.3)]);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: d + 0.6, bevelEnabled: false }), tile);
  roof.position.set(0, h, -d / 2 - 0.3);
  g.add(body, roof);
  return g;
}

function wallRing(ctx, pts, height, mat_) {
  const g = new THREE.Group();
  const ends = pts.map(([la, lo]) => ctx.at(la, lo));
  if (ends.some((p) => !p)) return null;
  const a = ends[0];
  const [ax, az] = ctx.metres(a.i, a.j);
  ends.forEach((p, k) => {
    const q = ends[(k + 1) % ends.length];
    const [x0, z0] = ctx.metres(p.i, p.j);
    const [x1, z1] = ctx.metres(q.i, q.j);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(len, height, 2.5), mat_);
    seg.position.set((x0 + x1) / 2 - ax, height / 2 - 1, (z0 + z1) / 2 - az);
    seg.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    g.add(seg);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, height + 2, 10), mat_);
    tower.position.set(x0 - ax, (height + 2) / 2 - 1, z0 - az);
    g.add(tower);
  });
  return { ...a, model: { group: g, top: height }, trueSize: true };
}

const hashInt = (a, b) => Math.abs(Math.floor(Math.sin(a * 91.3 + b * 47.7) * 10000));

export function bathStructures(ctx) {
  const items = [];
  const at = (ll) => ctx.at(...ll);
  for (const era of ['roman', 'medieval']) {
    const w = wallRing(ctx, WALLS, era === 'roman' ? 6 : 8, stone);
    if (w) items.push({ ...w, era });
  }
  const t = at(TEMPLE);
  if (t) items.push({ ...t, model: { group: temple(), top: 13 }, era: 'roman', trueSize: true });
  const b = at(GREAT_BATH);
  if (b) {
    const roman = baths();
    roman.group.rotation.y = 0.15;
    items.push({ ...b, model: { group: roman.group, top: 18 }, era: 'roman', trueSize: true });
    // Medieval: the Roman hall gone, a small open bath (John of Tours' King's Bath) over the spring among houses.
    const med = new THREE.Group();
    const pool = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 12), water);
    pool.position.y = 0.3;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(17, 1.2, 15), stone);
    rim.position.y = -0.2;
    med.add(rim, pool);
    // Fragments of Roman wall poking through the mud.
    for (let k = 0; k < 5; k++) {
      const frag = new THREE.Mesh(new THREE.BoxGeometry(rand(2, 5), rand(1, 3), 1.2), stone);
      frag.position.set(rand(-20, 20), 0.5, rand(-16, 16));
      frag.rotation.y = rand(0, 3);
      med.add(frag);
    }
    items.push({ ...b, model: { group: med, top: 4 }, era: 'medieval', trueSize: true });
  }
  // The medieval cathedral priory on the abbey site (a large Norman church; its true plan is not modelled).
  const ab = at(ABBEY);
  if (ab) {
    const g = new THREE.Group();
    const nave = new THREE.Mesh(new THREE.BoxGeometry(70, 18, 20), stone);
    nave.position.y = 9;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 13, 70, 4, 1), mat(0x5a524a));
    roof.rotation.set(0, Math.PI / 4, Math.PI / 2);
    roof.scale.set(1, 1, 0.5);
    roof.position.y = 22;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(12, 40, 12), stone);
    tower.position.set(5, 20, 0);
    g.add(nave, roof, tower);
    g.rotation.y = 0.05;
    items.push({ ...ab, model: { group: g, top: 40 }, era: 'medieval', trueSize: true });
  }
  // Town houses inside the walls: painted Roman blocks; smaller timber-and-stone medieval ones.
  const ring = WALLS.map(([la, lo]) => [lo, la]);
  for (let n = 0; n < 500; n++) {
    const la = 51.3795 + Math.random() * 0.0045;
    const lo = -2.3630 + Math.random() * 0.0062;
    if (!pointIn(lo, la, ring)) continue;
    if (Math.hypot((la - GREAT_BATH[0]) * 111000, (lo - GREAT_BATH[1]) * 69500) < 45) continue;
    if (Math.hypot((la - ABBEY[0]) * 111000, (lo - ABBEY[1]) * 69500) < 45) continue;
    const p = ctx.at(la, lo);
    if (!p) continue;
    const seed = hashInt(la * 1e4, lo * 1e4);
    const era = n % 2 ? 'roman' : 'medieval';
    const g = houseBlock(seed);
    g.rotation.y = era === 'roman' ? 0.15 : (seed % 7) * 0.2;
    if (era === 'medieval') g.scale.set(0.7, 0.9, 0.7);
    items.push({ ...p, model: { group: g, top: 8 }, era, trueSize: true });
  }
  return items;
}

// --- scenes ---

function crowd(count, colours) {
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.25, 1.0, 3, 6), new THREE.MeshStandardMaterial({ roughness: 0.9 }), count);
  for (let k = 0; k < count; k++) body.setColorAt(k, new THREE.Color(colours[k % colours.length]));
  return body;
}

export class SacredSpring {
  static title = 'The sacred spring of Sulis Minerva, c. AD 200 (reconstruction)';
  static caption = 'Water at 46 °C rises here, over a million litres a day. A temple was begun in AD 60–70 and the baths grew over 300 years; worshippers threw offerings, and over 130 curse tablets were found in the spring. Buildings, paint and people here are illustrative; the Roman ground lay several metres below today\'s streets.';

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    ctx.map.setEra('roman');
    this.people = crowd(220, [0xe8e0cc, 0xb04030, 0x3a5a8a, 0xd8b060, 0x6a4a3a]);
    root.add(this.people);
    this.spots = Array.from({ length: 220 }, () => [rand(-45, 45), rand(-35, 45), rand(0, 6)]);
    this.tmp = new THREE.Object3D();
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    if ((this.steamT = (this.steamT ?? 0) - dt) <= 0) {
      this.steamT = 0.12;
      this.fx.burst(ctx, rand(-10, 10), rand(-4, 4), ctx.groundAlt(0, 0) + 2, { flash: 0x000000, smoke: 0xf2f2f2, size: 10, life: 6 });
    }
    // Now and then an offering glints into the spring.
    if ((this.coinT = (this.coinT ?? 2) - dt) <= 0) {
      this.coinT = rand(1.5, 4);
      ctx.audio.tone(2400, 2200, 0.25, { gain: 0.05, out: ctx.audio.out(ctx.audioPosAt(0, 0, ctx.groundAlt(0, 0))) });
    }
    const tmp = this.tmp;
    this.root.add(tmp);
    const s = Math.max(ctx.scaleTrue(), ctx.minSize(2) * 0.25);
    this.spots.forEach(([e, n, ph], k) => {
      const walk = Math.sin(this.t * 0.2 + ph) * 3;
      ctx.place(tmp, e + walk, n, ctx.groundAlt(e + walk, n) + 0.75);
      tmp.scale.setScalar(s);
      tmp.updateMatrix();
      this.people.setMatrixAt(k, tmp.matrix);
    });
    this.root.remove(tmp);
    this.people.instanceMatrix.needsUpdate = true;
    this.fx.update(dt);
    return this.t < 70;
  }

  stop() {
    this.fx.clear();
  }
}

// Georgian Bath: promenaders on the Royal Crescent lawn and along the streets, sedan chairs carried between the
// Circus and the Crescent, and a little chamber music.
export class GeorgianPromenade {
  static title = 'Taking the air in Georgian Bath, 1770s (illustration)';
  static caption = "The Royal Crescent (John Wood the Younger, 1767–1774): 30 houses behind one 150 m front of 114 Ionic columns, looking over parkland: 'the country in the city'. Fashionable visitors came to take the waters and be seen. The people, chairs and music here are illustrative.";

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    ctx.map.setEra('georgian');
    this.people = crowd(260, [0xd8c8e8, 0x9a2a3a, 0x2a4a7a, 0xf0e8d8, 0x3a6a4a, 0x1a1a1a]);
    root.add(this.people);
    [this.cx, this.cn] = ctx.en(...CRESCENT);
    [this.kx, this.kn] = ctx.en(...CIRCUS);
    // Promenaders on the lawn below the Crescent (to its south).
    this.walkers = Array.from({ length: 260 }, () => ({ e: this.cx + rand(-90, 90), n: this.cn - rand(25, 130), dir: rand(0, 6.28), sp: rand(0.4, 1) }));
    this.chairs = [0, 1, 2].map((k) => {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 0.9), mat(0x2a1a14));
      box.position.y = 1.2;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.15, 1), mat(0x7a5a2a));
      roof.position.y = 2.05;
      const poles = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.08), mat(0x3a2a1a));
      poles.position.y = 0.9;
      g.add(box, roof, poles);
      for (const x of [-1.5, 1.5]) {
        const bearer = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1, 3, 6), mat(0x3a3a5a));
        bearer.position.set(x, 0.75, 0);
        g.add(bearer);
      }
      root.add(g);
      return { g, phase: k / 3 };
    });
    this.tmp = new THREE.Object3D();
    this.nextBar = 0;
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const tmp = this.tmp;
    this.root.add(tmp);
    const s = Math.max(ctx.scaleTrue(), ctx.minSize(2) * 0.25);
    this.walkers.forEach((w, k) => {
      w.dir += rand(-0.3, 0.3) * dt;
      w.e += Math.cos(w.dir) * w.sp * dt;
      w.n += Math.sin(w.dir) * w.sp * dt;
      ctx.place(tmp, w.e, w.n, ctx.groundAlt(w.e, w.n) + 0.75);
      tmp.scale.setScalar(s);
      tmp.updateMatrix();
      this.people.setMatrixAt(k, tmp.matrix);
    });
    this.root.remove(tmp);
    this.people.instanceMatrix.needsUpdate = true;
    // Sedan chairs going back and forth between the Circus and the Crescent along Brock Street.
    for (const c of this.chairs) {
      const f = (this.t / 120 + c.phase) % 1;
      const u = f < 0.5 ? f * 2 : 2 - f * 2;
      const e = this.kx + (this.cx - this.kx) * u;
      const n = this.kn + (this.cn - this.kn - 20) * u;
      ctx.place(c.g, e, n, ctx.groundAlt(e, n));
      c.g.scale.setScalar(Math.max(ctx.scaleTrue(), ctx.minSize(3) * 0.4));
      c.g.rotation.y = Math.atan2(this.cn - this.kn, this.cx - this.kx) + (f < 0.5 ? 0 : Math.PI);
    }
    // A string quartet-ish minuet (original): simple chords on the bar.
    if ((this.nextBar -= dt) <= 0) {
      this.nextBar = 2.4;
      const bars = [[262, 330, 392], [294, 349, 440], [247, 294, 392], [262, 330, 392]];
      const chord = bars[Math.floor(this.t / 2.4) % bars.length];
      chord.forEach((f, k) => ctx.audio.tone(f, f, 0.7, { type: 'triangle', gain: 0.04, at: k * 0.8 }));
    }
    return this.t < 120;
  }

  stop() {}
}

// Abona: Roman ships come up the Avon to the port at the mouth of the Trym. Warehouses illustrative.
export class RomanPort {
  static title = 'Abona, the Roman port at Sea Mills (reconstruction)';
  static caption = 'A small Roman town and port stood here where the Trym meets the Avon: Abona, on a route in the 3rd-century Antonine Itinerary. Excavations found streets, buildings and cemeteries on the south side of the Trym. The ships, warehouses and people here are illustrative.';

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    ctx.map.setEra('roman');
    this.ships = [0, 1].map((k) => {
      const g = new THREE.Group();
      // Hull: the lower half of a cylinder lying along x.
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 18, 12, 1, false, Math.PI, Math.PI), mat(0x5a3a22, { side: THREE.DoubleSide }));
      hull.rotation.z = Math.PI / 2;
      hull.position.y = 1.2;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 10, 6), mat(0x3a2a1a));
      mast.position.y = 6;
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(7, 6), mat(0xd8c8a0, { side: THREE.DoubleSide }));
      sail.rotation.y = Math.PI / 2;
      sail.position.y = 7;
      g.add(hull, mast, sail);
      root.add(g);
      return { g, delay: k * 25 };
    });
    // Warehouses and houses on the south bank of the Trym mouth (illustrative).
    this.blocks = Array.from({ length: 14 }, (_, k) => {
      const g = houseBlock(k * 7 + 3);
      root.add(g);
      return { g, e: rand(-60, 60), n: rand(-140, -40), yaw: rand(-0.2, 0.2) };
    });
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const level = ctx.tide ?? 3;
    // In from the Severn, up the Avon from the north-west to the Trym mouth.
    for (const s of this.ships) {
      const u = Math.min(1, Math.max(0, (this.t - s.delay) / 40));
      const e = -650 + 560 * u;
      const n = 620 - 560 * u;
      ctx.placeOnWater(s.g, e, n, 0);
      s.g.scale.setScalar(Math.max(ctx.scaleTrue(), ctx.minSize(18) * 0.6));
      s.g.rotation.y = Math.atan2(-560, 560);
      if (this.t < s.delay) s.g.visible = false;
    }
    for (const b of this.blocks) {
      ctx.place(b.g, b.e, b.n, Math.max(ctx.groundAlt(b.e, b.n), level));
      b.g.scale.setScalar(ctx.scaleTrue());
      b.g.rotation.y = b.yaw;
    }
    return this.t < 80;
  }

  stop() {}
}
