import * as THREE from 'three';
import { puff, Effects, rand } from './scenarios.js';

// More "what it might have been like" scenes. Each class has a title and a caption that says plainly what is
// documented and what is dramatised. Scenes work in real metres via ctx (see ScenarioPlayer.context).

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// --- shared models (all generic; sizes approximate) ---

// Bristol Channel paddle steamer, about 65 m: dark hull, white saloon, two funnels, paddle boxes. +x is forward.
function paddleSteamer() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(64, 4, 8), mat(0x1c1f24));
  hull.position.y = 1;
  const bow = new THREE.Mesh(new THREE.ConeGeometry(4, 8, 4), mat(0x1c1f24));
  bow.rotation.z = -Math.PI / 2;
  bow.rotation.x = Math.PI / 4;
  bow.position.set(36, 1, 0);
  const saloon = new THREE.Mesh(new THREE.BoxGeometry(40, 3, 7), mat(0xe9e4d6));
  saloon.position.set(-4, 4.5, 0);
  g.add(hull, bow, saloon);
  const funnels = [];
  for (const x of [6, -6]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 9, 12), mat(0xf2efe6));
    f.position.set(x, 10, 0);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.32, 1.6, 12), mat(0x111111));
    top.position.set(x, 14, 0);
    g.add(f, top);
    funnels.push(new THREE.Vector3(x, 15, 0));
  }
  for (const z of [-5.5, 5.5]) {
    const box = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 2.5, 16, 1, false, 0, Math.PI), mat(0xe9e4d6));
    box.rotation.x = Math.PI / 2;
    box.position.set(0, 2, z);
    g.add(box);
  }
  return { group: g, funnels };
}

// A Severn trow: the sailing barge that carried cargo up the tidal Avon. About 20 m, one mast and a tan sail.
function trow() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(20, 2, 5), mat(0x4a3a2a));
  hull.position.y = 0.6;
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 4), mat(0x6b5a48));
  cargo.position.y = 2;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 16, 6), mat(0x3a2a1a));
  mast.position.set(3, 9, 0);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(9, 11), mat(0xb88a5a, { side: THREE.DoubleSide }));
  sail.position.set(-1.5, 9, 0.3);
  g.add(hull, cargo, mast, sail);
  return g;
}

// Fire: flickering glow sprites with smoke rising from them.
class Fire {
  constructor(root, size) {
    this.root = root;
    this.size = size;
    this.flames = Array.from({ length: 6 }, () => {
      const s = puff(0xff8a2a, 0.9, true);
      root.add(s);
      return s;
    });
    this.fx = new Effects(root);
    this.smokeT = 0;
  }

  update(ctx, dt, east, north, alt) {
    const k = ctx.minSize(this.size);
    this.flames.forEach((f, n) => {
      ctx.place(f, east + rand(-0.3, 0.3) * this.size, north + rand(-0.3, 0.3) * this.size, alt + (0.2 + 0.3 * Math.random()) * this.size);
      f.scale.setScalar(this.size * k * rand(0.5, 1.1));
      f.material.color.setHSL(0.06 + 0.04 * Math.random(), 1, 0.55 + 0.1 * (n % 2));
    });
    if ((this.smokeT -= dt) <= 0) {
      this.smokeT = 0.25;
      this.fx.burst(ctx, east, north, alt + this.size, { flash: 0x000000, smoke: 0x3a3632, size: this.size * 1.6, life: 7 });
    }
    this.fx.update(dt);
  }
}

// Move along a polyline of [east, north] points at a given speed; returns position and heading.
function along(path, distance) {
  let left = distance;
  for (let k = 1; k < path.length; k++) {
    const [ax, ay] = path[k - 1];
    const [bx, by] = path[k];
    const len = Math.hypot(bx - ax, by - ay);
    if (left <= len) {
      const t = left / len;
      return { e: ax + (bx - ax) * t, n: ay + (by - ay) * t, heading: Math.atan2(by - ay, bx - ax), done: false };
    }
    left -= len;
  }
  const [ax, ay] = path[path.length - 2];
  const [bx, by] = path[path.length - 1];
  return { e: bx, n: by, heading: Math.atan2(by - ay, bx - ax), done: true };
}

// Heading (radians, east = 0, north = +pi/2) to an object's yaw in the map frame (north is -z).
const yaw = (heading) => heading;

// --- Troopers Hill / Crew's Hole ---

export class WorksAtFullBlast {
  static title = "Crew's Hole works at full blast (reconstruction)";
  static caption = "Copper ore came up the tidal Avon by boat and local coal fired the furnaces; fumes went up the flue to the chimney on the hill. The buildings are traced from the c.1900 map, the rest is imagined.";

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    if (ctx.map.era !== 'then') ctx.map.toggleEra();
    this.boat = trow();
    root.add(this.boat);
    // The barge works up the river past the works, following the River Avon as mapped.
    const lines = (ctx.map.source.osm?.water.lines ?? []).filter((l) => l.name === 'River Avon');
    const pts = lines.flatMap((l) => l.pts).map(([lat, lon]) => ctx.en(lat, lon)).filter(([e, n]) => Math.hypot(e, n) < 450);
    pts.sort((a, b) => a[0] - b[0]);
    this.path = pts.length > 2 ? pts : [[-400, -100], [400, 100]];
    ctx.audio.rumble(8);
  }

  update(dt) {
    this.t += dt;
    const p = along(this.path, this.t * 3);
    this.ctx.placeOnWater(this.boat, p.e, p.n, 0);
    this.boat.scale.setScalar(this.ctx.minSize(20));
    this.boat.rotation.y = yaw(p.heading);
    return this.t < 120 && !p.done;
  }

  stop() {}
}

// --- Clifton ---

export class BuildingTheBridge {
  static title = 'Building the bridge, 1836–1864 (time-lapse)';
  static caption = "Brunel won the competition in 1831. Work began in 1836, the towers stood but the money ran out in 1843, and the ironwork was sold in 1853. Work restarted after Brunel's death, using chains from his Hungerford Bridge, and the bridge opened in 1864.";
  static stages = [[0, '1836 · foundations laid'], [0.2, '1843 · towers built, money runs out'], [0.38, '1853 · ironwork sold, towers stand empty'],
    [0.42, '1862 · work restarts with Hungerford chains'], [0.8, '1864 · deck hung'], [1, '8 December 1864 · bridge opens']];

  constructor(ctx) {
    this.ctx = ctx;
    this.t = 0;
    this.stage = -1;
  }

  update(dt) {
    this.t += dt;
    const p = clamp01(this.t / 45);
    this.ctx.map.features.buildProgress = p;
    const stages = BuildingTheBridge.stages;
    const s = stages.reduce((acc, [at], k) => (p >= at ? k : acc), 0);
    if (s !== this.stage) {
      this.stage = s;
      this.ctx.map.status = stages[s][1].toUpperCase();
      this.ctx.map.drawSign();
      this.ctx.audio.click();
    }
    return this.t < 52;
  }

  stop() {}
}

export class RocksRailway1941 {
  static title = 'Inside the Rocks Railway, 1941';
  static caption = 'Closed to passengers in 1934, the tunnel was taken over in the war: the BBC set up emergency studios and offices there, and it served as an air-raid shelter. X-ray shows the bore inside the cliff; the city is being bombed in the distance.';

  constructor(ctx) {
    this.ctx = ctx;
    this.t = 0;
    this.next = 4;
    ctx.map.xray = true;
    ctx.audio.siren(8);
  }

  update(dt) {
    this.t += dt;
    if ((this.next -= dt) <= 0) {
      this.next = rand(2, 5);
      // Distant bombs: far away, muffled by the rock.
      this.ctx.audio.rumble(2.5, { x: rand(-3000, 3000), y: 0, z: rand(-3000, -1000) });
    }
    return this.t < 45;
  }

  stop() {}
}

// Ride the Rocks Railway, 1893: at life size you board the car at the bottom station on Hotwell Road and ride it up
// through the tunnel to Sion Hill (about 40 seconds, as the real cars took), then step out at the top. The water
// balancing (tanks filled at the top car to send it down) is described, not modelled.
export class RideRocksRailway {
  static title = 'Ride the Rocks Railway, 1893';
  static caption = "Opened in 1893, the water-balanced funicular ran in a tunnel through the gorge wall from Hotwell Road up to Sion Hill: 137 m long, rising 61 m, four cars in two pairs, about 40 seconds a trip. Water was let into a tank under the top car until it was heavy enough to pull its partner up. It closed in 1934. The cars' styling here is illustrative.";

  constructor(ctx) {
    this.ctx = ctx;
    this.t = 0;
    this.state = 'boarding';
    this.wait = 3;
  }

  update(dt) {
    const map = this.ctx.map;
    const life = map.game.life;
    const rail = map.features.items.find((it) => it.tag === 'rocks-interior');
    if (!rail) return this.t < 10;
    this.t += dt;
    if (life.state !== 'on') return this.t < 60; // waiting to arrive at life size
    // The line's two ends in real-world metres, worked out once while no new terrain is loading (mid-load, the
    // window's pixels and its real-world centre disagree). The car then runs between them in a straight line.
    if (!this.line) {
      if (map.loading) return true;
      const end = (p) => {
        const w = rail.rideAt(p);
        const d = { x: (w.i / (map.RES - 1) - 0.5) * map.size, z: (w.j / (map.RES - 1) - 0.5) * map.size };
        return { real: map.dataToReal(d.x, d.z), alt: w.alt };
      };
      this.line = [end(0), end(1)];
    }
    const [a, b] = this.line;
    const at = (p) => ({ real: { x: a.real.x + (b.real.x - a.real.x) * p, y: a.real.y + (b.real.y - a.real.y) * p }, alt: a.alt + (b.alt - a.alt) * p });
    if (this.state === 'boarding') {
      rail.rideP = 0;
      life.setRide(at(0));
      if (!this.faced) {
        // Face up the line.
        const b = 90 + THREE.MathUtils.radToDeg(rail.rideHeading);
        life.q = life.facing(b);
        this.faced = true;
      }
      if ((this.wait -= dt) <= 0) {
        this.state = 'riding';
        this.p = 0;
      }
    } else if (this.state === 'riding') {
      this.p = Math.min(1, this.p + dt / 40);
      const e = this.p * this.p * (3 - 2 * this.p);
      rail.rideP = e;
      life.setRide(at(e));
      if (this.p >= 1) {
        this.state = 'arrived';
        this.wait = 2;
      }
    } else if (this.state === 'arrived' && (this.wait -= dt) <= 0) {
      return false;
    }
    return true;
  }

  stop() {
    const map = this.ctx.map;
    const rail = map.features.items.find((it) => it.tag === 'rocks-interior');
    if (rail) rail.rideP = null;
    map.game.life.setRide(null);
  }
}

// --- the piers ---

export class PaddleSteamer {
  static title = 'A paddle steamer calls, c.1900';
  static caption = 'Excursion steamers linked the Channel resorts and ports: Cardiff, Penarth, Weston, Ilfracombe. Here one comes alongside the pier head, takes on passengers and leaves.';

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    this.ship = paddleSteamer();
    root.add(this.ship.group);
    const [he, hn] = ctx.en(...ctx.opts.head);
    const [oe, on] = ctx.en(...ctx.opts.offshore);
    // In from offshore to alongside the head, then away again.
    this.inPath = [[oe, on], [he + (oe - he) * 0.25, hn + (on - hn) * 0.25 + 20], [he + 8, hn + 18]];
    this.outPath = [[he + 8, hn + 18], [he - 300, hn + 250], [oe - 600, on + 200]];
    this.smokeT = 0;
    this.whistled = 0;
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    let p;
    if (t < 30) p = along(this.inPath, ease(t / 30) * this.length(this.inPath));
    else if (t < 42) p = along(this.inPath, this.length(this.inPath));
    else p = along(this.outPath, ease(clamp01((t - 42) / 30)) * this.length(this.outPath));
    const g = this.ship.group;
    ctx.placeOnWater(g, p.e, p.n, 0);
    g.scale.setScalar(ctx.minSize(65));
    g.rotation.y = yaw(p.heading);
    if ((t > 27 && this.whistled === 0) || (t > 41 && this.whistled === 1)) {
      this.whistled++;
      ctx.audio.whistle(ctx.audioPos(g));
    }
    if ((this.smokeT -= dt) <= 0) {
      this.smokeT = 0.3;
      for (const f of this.ship.funnels) {
        const w = f.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), p.heading); // ship frame -> east/north
        this.fx.burst(ctx, p.e + w.x, p.n - w.z, (ctx.tide ?? 0) + 15, { flash: 0x000000, smoke: 0x2c2a28, size: 6, life: 6 });
      }
    }
    this.fx.update(dt);
    return t < 74;
  }

  length(path) {
    return path.slice(1).reduce((a, [x, y], k) => a + Math.hypot(x - path[k][0], y - path[k][1]), 0);
  }

  stop() {
    this.fx.clear();
  }
}

// Clevedon Pier as a model (eight spans on paired legs), so the two outer spans can fall in the 1970 scene.
export class PierCollapse {
  static title = 'The day the pier fell, 16 October 1970';
  static caption = 'During a load test two of the outer spans gave way and fell into the Channel. A long local campaign saved the pier, and it was restored and reopened. (Recreated here; the model of the pier is simplified.)';

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    ctx.map.gridOverride = 'terrain'; // hide the real pier while the model stands in for it
    ctx.map.showGrid();
    ctx.map.features.hiddenTags = new Set(['pier']);
    const [se, sn] = ctx.en(...ctx.opts.shore);
    const [he, hn] = ctx.en(...ctx.opts.head);
    this.deck = ctx.surfaceAlt((se + he) / 2, (sn + hn) / 2);
    this.spans = [];
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a = k / n;
      const b = (k + 1) / n;
      const span = { a: [se + (he - se) * a, sn + (hn - sn) * a], b: [se + (he - se) * b, sn + (hn - sn) * b], fall: 0 };
      span.group = new THREE.Group();
      const len = Math.hypot(span.b[0] - span.a[0], span.b[1] - span.a[1]);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 1.2, 6), mat(0xd8cbb0)); // pale so it reads against the sea
      const arch = new THREE.Mesh(new THREE.TorusGeometry(len / 2, 0.35, 6, 24, Math.PI), mat(0x2f3338));
      arch.rotation.x = Math.PI;
      arch.scale.y = 0.35;
      arch.position.y = -0.4;
      span.group.add(deck, arch);
      root.add(span.group);
      span.len = len;
      this.spans.push(span);
    }
    this.legs = this.spans.map((s) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 6), mat(0x2f3338));
      root.add(leg);
      return { leg, at: s.b };
    });
    this.heading = Math.atan2(hn - sn, he - se);
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    for (const [k, s] of this.spans.entries()) {
      // Spans 7 and 8, the outermost, give way: the seventh fails and brings down the eighth.
      if (k === 6 && t > 8) s.fall = Math.min(1, s.fall + dt / 2.5);
      if (k === 7 && t > 8.6) s.fall = Math.min(1, s.fall + dt / 2.5);
      const me = (s.a[0] + s.b[0]) / 2;
      const mn = (s.a[1] + s.b[1]) / 2;
      const drop = ease(s.fall) * (this.deck - (ctx.tide ?? 0) + 2);
      ctx.place(s.group, me, mn, this.deck - drop);
      s.group.scale.setScalar(Math.max(ctx.scaleTrue(), ctx.minSize(s.len) * 0.6));
      s.group.rotation.set(0, yaw(this.heading), (k === 6 ? 1 : -1) * ease(s.fall) * 0.5);
    }
    for (const { leg, at } of this.legs) {
      const ground = ctx.groundAlt(...at);
      ctx.place(leg, at[0], at[1], (this.deck + ground) / 2);
      leg.scale.set(ctx.minSize(30), ctx.scaleTrue() * Math.max(1, this.deck - ground), ctx.minSize(30));
    }
    if (t > 8 && !this.crashed) {
      this.crashed = true;
      ctx.audio.rumble(5, ctx.audioPosAt(...this.spans[7].a, this.deck));
    }
    if (t > 10.3 && !this.splashed) {
      this.splashed = true;
      for (const k of [6, 7]) {
        const s = this.spans[k];
        this.fx.burst(ctx, (s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, (ctx.tide ?? 0) + 8, { flash: 0xffffff, smoke: 0xe8f0f4, size: 30, life: 4 });
      }
      const ap = ctx.audioPosAt(...this.spans[6].a, 0);
      ctx.audio.splash(ap, ap.length());
    }
    this.fx.update(dt);
    return t < 30;
  }

  stop() {
    this.fx.clear();
  }
}

export class HmsBirnbeck {
  static title = 'HMS Birnbeck, 1940s (dramatisation)';
  static caption = "In the war the pier and island became HMS Birnbeck, an Admiralty research station for experimental naval weapons tested in the Channel. The searchlights and test explosions here are illustrative.";

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    this.beams = [0, 1].map(() => {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(10, 0.6, 1, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.geometry.translate(0, 0.5, 0);
      root.add(beam);
      return beam;
    });
    this.next = 5;
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    // Two lights on the island sweep the water to the north-west.
    this.beams.forEach((beam, k) => {
      ctx.place(beam, k * 30, 10, ctx.groundAlt(k * 30, 10) + 6);
      const a = Math.PI * 0.75 + Math.sin(t * 0.35 + k * 1.7) * 0.6;
      const dir = new THREE.Vector3(Math.cos(a), -0.05, -Math.sin(a));
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      const w = ctx.minSize(200);
      beam.scale.set(w, 900 * ctx.scaleTrue(), w); // a 900 m beam
    });
    // Test explosions out in the Channel: a muffled thud, then a column of water.
    if ((this.next -= dt) <= 0) {
      this.next = rand(5, 8);
      const e = rand(-900, -300);
      const n = rand(200, 700);
      this.fx.burst(ctx, e, n, (ctx.tide ?? 0) + 25, { flash: 0xffffff, smoke: 0xe8f0f4, size: 50, life: 4 });
      const ap = ctx.audioPosAt(e, n, 0);
      ctx.audio.rumble(2, ap);
      ctx.audio.splash(ap, ap.length());
    }
    this.fx.update(dt);
    return t < 50;
  }

  stop() {
    this.fx.clear();
  }
}

// --- Brean Down ---

export class MagazineExplosion {
  static title = 'The magazine explosion, July 1900 (dramatisation)';
  static caption = "In July 1900 a magazine at the fort blew up, wrecking gun positions and barracks; the fort's Victorian career effectively ended there. The blast here is a dramatisation.";

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    this.ground = ctx.groundAlt(0, 0);
    const count = 140;
    this.debris = Array.from({ length: count }, () => {
      const s = puff(Math.random() < 0.5 ? 0x4a4038 : 0xffb050, 1, Math.random() < 0.3);
      root.add(s);
      const a = Math.random() * Math.PI * 2;
      const up = rand(20, 70);
      const out = rand(10, 45);
      return { s, v: [Math.cos(a) * out, Math.sin(a) * out, up], p: [0, 0, this.ground + 3] };
    });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    this.ring.rotation.x = Math.PI / 2;
    root.add(this.ring);
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t - 3; // a moment of calm first
    if (t < 0) {
      for (const d of this.debris) d.s.visible = false;
      this.ring.visible = false;
      return true;
    }
    if (!this.boomed) {
      this.boomed = true;
      this.fx.burst(ctx, 0, 0, this.ground + 20, { flash: 0xfff0c0, smoke: 0x2a2420, size: 140, life: 18 });
      const ap = ctx.audioPosAt(0, 0, this.ground);
      ctx.audio.blast(ap, ap.length());
      ctx.audio.rumble(8, ap);
    }
    if (t < 1.2) ctx.shake(3 * (1 - t / 1.2));
    // A rising column of smoke for a while after.
    if (t < 12 && (this.colT = (this.colT ?? 0) - dt) <= 0) {
      this.colT = 0.2;
      this.fx.burst(ctx, rand(-15, 15), rand(-15, 15), this.ground + 20 + t * 12, { flash: 0x000000, smoke: 0x302a26, size: 70, life: 14 });
    }
    for (const d of this.debris) {
      d.v[2] -= 9.8 * dt;
      for (let k = 0; k < 3; k++) d.p[k] += d.v[k] * dt;
      const floor = ctx.groundAlt(d.p[0], d.p[1]);
      if (d.p[2] < floor) {
        d.p[2] = floor;
        d.v = [0, 0, 0];
      }
      ctx.place(d.s, d.p[0], d.p[1], d.p[2]);
      d.s.scale.setScalar(ctx.minSize(12) * 4); // 4 m chunks, a centimetre or so on the table
      d.s.visible = true;
    }
    // Shock ring racing out across the water.
    ctx.place(this.ring, 0, 0, (ctx.tide ?? this.ground) + 0.5);
    const r = t * 340;
    this.ring.scale.setScalar(Math.max(1e-6, r * ctx.scaleTrue()));
    this.ring.material.opacity = 0.6 * Math.max(0, 1 - t / 3);
    this.ring.visible = t < 3;
    this.fx.update(dt);
    return t < 30;
  }

  stop() {
    this.fx.clear();
  }
}

// The Great Panjandrum: a rocket-driven drum on two 3 m wheels, meant to roll up a defended beach.
export class Panjandrum {
  static title = 'The Great Panjandrum, 1943–44 (what it would have looked like here)';
  static caption = "Developed by the Admiralty's Directorate of Miscellaneous Weapons Development, whose outstation was HMS Birnbeck in Weston. Its real trials were at Westward Ho! in Devon, where it shed rockets and veered wildly; it was never used. Staged on Brean Sands as an illustration.";

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    ctx.map.hideSea = true; // trials ran on open sand at low tide
    const g = new THREE.Group();
    const spin = new THREE.Group();
    g.add(spin);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.6, 16), mat(0x5a5a52));
    drum.rotation.x = Math.PI / 2;
    spin.add(drum);
    this.rockets = [];
    for (const z of [-1.5, 1.5]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 6, 32), mat(0x3a3a36));
      rim.position.z = z;
      spin.add(rim);
      for (let k = 0; k < 6; k++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3, 0.08), mat(0x3a3a36));
        spoke.rotation.z = (k / 6) * Math.PI;
        spoke.position.z = z;
        spin.add(spoke);
      }
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        const rocket = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 6), mat(0x8a2a1a));
        rocket.position.set(Math.cos(a) * 1.5, Math.sin(a) * 1.5, z + Math.sign(z) * 0.2);
        rocket.rotation.z = a;
        spin.add(rocket);
        this.rockets.push({ rocket, attached: true });
      }
    }
    root.add(g);
    this.g = g;
    this.spin = spin;
    this.pos = [0, 0];
    this.heading = -Math.PI / 2 - 0.1; // south along the beach
    this.speed = 0;
    this.loose = [];
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    const running = t > 4 && t < 26;
    if (running) {
      this.speed = Math.min(25, this.speed + dt * 6);
      // Wobbles and veers as rockets fire unevenly, then come away.
      this.heading += Math.sin(t * 1.3) * dt * 0.6 + (t > 14 ? dt * 0.9 : 0);
      if (Math.random() < dt * 2.5) {
        const r = this.rockets.find((x) => x.attached);
        if (r) {
          r.attached = false;
          const flare = puff(0xffc060, 1, true);
          this.root.add(flare);
          this.loose.push({ flare, p: [this.pos[0], this.pos[1], 2], v: [rand(-30, 30), rand(-30, 30), rand(10, 40)], life: 3 });
          ctx.audio.rocket(ctx.audioPos(this.g));
        }
      }
    } else if (t >= 26) {
      this.speed = Math.max(0, this.speed - dt * 12);
    }
    this.pos[0] += Math.cos(this.heading) * this.speed * dt;
    this.pos[1] += Math.sin(this.heading) * this.speed * dt;
    const ground = ctx.groundAlt(...this.pos);
    ctx.place(this.g, this.pos[0], this.pos[1], ground + 1.5);
    this.g.scale.setScalar(ctx.minSize(4));
    this.g.rotation.y = this.heading;
    this.spin.rotation.z -= (this.speed / 1.5) * dt;
    // Tips over at the end of the run.
    if (t > 27) this.g.rotation.x = Math.min(Math.PI / 2, (t - 27) * 1.5);
    if (running && (this.trailT = (this.trailT ?? 0) - dt) <= 0) {
      this.trailT = 0.08;
      this.fx.burst(ctx, this.pos[0], this.pos[1], ground + 1, { flash: 0xffa040, smoke: 0xb8b0a8, size: 6, life: 3 });
    }
    this.loose = this.loose.filter((l) => {
      l.life -= dt;
      l.v[2] -= 9.8 * dt;
      for (let k = 0; k < 3; k++) l.p[k] += l.v[k] * dt;
      ctx.place(l.flare, l.p[0], l.p[1], ctx.groundAlt(l.p[0], l.p[1]) + Math.max(0, l.p[2]));
      l.flare.scale.setScalar(ctx.minSize(8) * 2);
      if (l.life > 0) return true;
      this.root.remove(l.flare);
      return false;
    });
    this.fx.update(dt);
    return t < 34;
  }

  stop() {
    this.fx.clear();
  }
}

// --- Glastonbury Tor ---

// The church on the summit before the earthquake: a simple nave and west tower. Its real form is unknown.
export class Earthquake1275 {
  static title = 'The earthquake of 11 September 1275 (dramatisation)';
  static caption = 'An earthquake brought down the first church of St Michael on the Tor. A later church was built in its place; only its tower stands today. The fallen church here is conjectural.';

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    const stone = mat(0x9a8f80);
    this.church = new THREE.Group();
    this.nave = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 8), stone);
    this.nave.position.set(-2, 4, 0);
    this.roof = new THREE.Mesh(new THREE.ConeGeometry(6.2, 4, 4, 1), mat(0x5a524a));
    this.roof.rotation.y = Math.PI / 4;
    this.roof.scale.set(2.3, 1, 1);
    this.roof.position.set(-2, 10, 0);
    this.tower = new THREE.Group();
    this.tower.position.set(10, 0, 0);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(6, 18, 6), stone);
    shaft.position.y = 9;
    this.tower.add(shaft);
    this.church.add(this.nave, this.roof, this.tower);
    root.add(this.church);
    this.ground = ctx.groundAlt(0, 0);
    this.bellT = 2;
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    ctx.place(this.church, 0, 0, this.ground);
    this.church.scale.setScalar(ctx.minSize(30));
    const quake = t > 3 && t < 13;
    if (quake) ctx.shake(1.2 * Math.sin(Math.PI * (t - 3) / 10));
    if (t > 3 && !this.rumbled) {
      this.rumbled = true;
      ctx.audio.rumble(10, ctx.audioPosAt(0, 0, this.ground));
    }
    // The bells ring by themselves as the tower sways, then fall silent.
    if (quake && (this.bellT -= dt) <= 0) {
      this.bellT = rand(0.4, 1.4);
      ctx.audio.bell(ctx.audioPosAt(10, 0, this.ground + 15), rand(0.9, 1.1));
    }
    const fall = ease(clamp01((t - 8) / 3));
    this.tower.rotation.z = -fall * 1.3;
    this.roof.position.y = 10 - ease(clamp01((t - 7) / 2)) * 8;
    this.nave.scale.y = 1 - 0.7 * ease(clamp01((t - 9) / 2));
    this.nave.position.y = 4 * this.nave.scale.y;
    if (t > 9 && (this.dustT = (this.dustT ?? 0) - dt) <= 0 && t < 16) {
      this.dustT = 0.15;
      this.fx.burst(ctx, rand(-12, 14), rand(-6, 6), this.ground + 4, { flash: 0x000000, smoke: 0xb8ad9a, size: 18, life: 6 });
    }
    this.fx.update(dt);
    return t < 30;
  }

  stop() {
    this.fx.clear();
  }
}

// --- the Cadbury hillforts, around AD 500 ---

// The stronghold itself (great hall, palisade, houses) is the place's AD 500 era (hillforts.js); this scene lights
// the beacon on the rampart.
export class Stronghold {
  static title = 'A stronghold around AD 500 (reconstruction)';
  static caption = 'After Roman rule ended, hilltops like this were refortified: new timber defences, a great hall, and trade goods such as Mediterranean wine jars. The hall at South Cadbury follows the size Leslie Alcock excavated (about 19 by 10 metres); its form, the palisade, houses and beacon are illustrative.';

  constructor(ctx, root) {
    this.ctx = ctx;
    this.t = 0;
    this.fire = new Fire(root, 5);
    this.crackle = ctx.audio.crackle(ctx.audioPosAt(25, 0, ctx.groundAlt(25, 0)));
  }

  update(dt) {
    this.t += dt;
    this.fire.update(this.ctx, dt, 25, 0, this.ctx.groundAlt(25, 0));
    return this.t < 90;
  }

  stop() {
    this.crackle.stop();
  }
}
