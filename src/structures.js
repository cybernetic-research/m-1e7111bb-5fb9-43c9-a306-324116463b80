import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stoneTexture, timberTexture, brickTexture, gravelTexture, textured, metreUVs } from './textures.js';
import { bristolStructures } from './bristol.js';
import { bathStructures } from './bath.js';
import { lifeboatStation } from './lifeboat.js';

// Hand-built models of landmark structures, keyed by site. Positions come from OpenStreetMap; heights from the
// LIDAR at build time. Dimensions marked "approx" are my estimates from general knowledge, not survey data.
//
// Each builder gets a context with:
//   at(lat, lon)          -> { i, j } window pixel, or null outside the loaded window
//   metres(i, j)          -> [x, z] real metres from the window centre
//   terrain(i, j), surface(i, j) -> elevation in metres
// and returns items for Features: { i, j, model: { group, top }, era, hugsGround?, xray? }.

const stone = new THREE.MeshStandardMaterial({ color: 0x9a8f80, roughness: 0.85 });
const towerStone = textured(stoneTexture(0xb3a58c, 21), { tile: 2.5 });
const iron = new THREE.MeshStandardMaterial({ color: 0x2b2f35, metalness: 0.6, roughness: 0.5 });
const deckMat = new THREE.MeshStandardMaterial({ color: 0x5a554d, roughness: 0.8 });
// X-ray materials: drawn through the rock so the hidden tunnel can be seen.
const xrayTunnel = new THREE.MeshBasicMaterial({ color: 0x7fd6ff, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const xrayEdge = new THREE.LineBasicMaterial({ color: 0xbff0ff, transparent: true, opacity: 0.9, depthTest: false });
const carMat = new THREE.MeshStandardMaterial({ color: 0x7a2a22, roughness: 0.6 });
const carXray = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.95, depthTest: false });

// Clifton Suspension Bridge. Ends of the main span = OSM's Leigh Woods and Clifton towers (215 m apart; the bridge's
// main span is 214 m). The LIDAR surface model misses the deck, and the Leigh Woods tower stands on a tall abutment
// below cliff-top level, so the deck is set level with the higher abutment (the Clifton cliff top, ~80 m OD, which
// matches its 75 m clearance above high water). Dimensions from Wikipedia: main span 214.05 m, total length 412 m,
// deck 9.45 m wide, towers 26 m above the deck, three chains a side dipping 21.34 m, 81 pairs of hanger rods, and
// the Leigh Woods tower on a 34 m red-sandstone abutment.
function cliftonBridge(ctx) {
  const a = ctx.at(51.4543762, -2.6291734); // Leigh Woods tower
  const b = ctx.at(51.455395, -2.6265697); // Clifton tower
  if (!a || !b) return [];
  const mid = { i: (a.i + b.i) / 2, j: (a.j + b.j) / 2 };
  const [ax, az] = ctx.metres(a.i, a.j);
  const [bx, bz] = ctx.metres(b.i, b.j);
  const span = Math.hypot(bx - ax, bz - az);
  const deckY = Math.max(ctx.terrain(a.i, a.j), ctx.terrain(b.i, b.j)) - ctx.terrain(a.i, a.j); // deck above the Leigh Woods ground
  const g = new THREE.Group();
  const along = new THREE.Group(); // x runs from the Leigh Woods tower to the Clifton tower
  along.rotation.y = -Math.atan2(bz - az, bx - ax);
  g.add(along);
  const towerH = 26;
  const halfW = 9.45 / 2;
  const dip = 21.34;
  const sandstone = new THREE.MeshStandardMaterial({ color: 0x8a4a3a, roughness: 0.9 });
  const abutment = new THREE.Mesh(new THREE.BoxGeometry(14, 34, 16), sandstone);
  abutment.position.set(-3, deckY - 17, 0); // under the Leigh Woods tower; its foot is lifted with the deck below
  along.add(abutment);
  const towers = [];
  // Each tower is a stone pylon pierced by a tall round-headed arch the road runs through, slightly tapering, with
  // a cornice; Clifton's is pale Pennant/limestone, Leigh Woods' stands on its red sandstone abutment.
  const footY = 8; // the tower's foot is set 8 m below its ground
  const total = towerH + deckY + footY;
  const across = halfW * 2 + 6;
  const archW = halfW * 2 + 0.6;
  const archTop = deckY + footY + 20;
  const shape = new THREE.Shape([new THREE.Vector2(-across / 2, 0), new THREE.Vector2(across / 2, 0),
    new THREE.Vector2(across / 2 - 1.2, total), new THREE.Vector2(-across / 2 + 1.2, total)]);
  const arch = new THREE.Path();
  arch.moveTo(-archW / 2, deckY + footY - 0.6);
  arch.lineTo(archW / 2, deckY + footY - 0.6);
  arch.lineTo(archW / 2, archTop - archW / 2);
  arch.absarc(0, archTop - archW / 2, archW / 2, 0, Math.PI, false);
  arch.lineTo(-archW / 2, deckY + footY - 0.6);
  shape.holes.push(arch);
  const pylon = metreUVs(new THREE.ExtrudeGeometry(shape, { depth: 7, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-3.5, 0, 0));
  for (const x of [0, span]) {
    const tower = new THREE.Group(); // grows from its base in the construction time-lapse
    tower.position.set(x, -footY, 0);
    tower.add(new THREE.Mesh(pylon, towerStone));
    const cornice = new THREE.Mesh(metreUVs(new THREE.BoxGeometry(8.4, 1.4, across - 1)), towerStone);
    cornice.position.y = total + 0.4;
    // The saddles where the chains pass over the top.
    const saddles = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, across - 3), iron);
    saddles.position.y = total + 1.6;
    tower.add(cornice, saddles);
    along.add(tower);
    towers.push(tower);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(span + 60, 1.2, halfW * 2), deckMat);
  deck.position.set(span / 2, deckY, 0);
  along.add(deck);
  const chains = [];
  const rods = [];
  const hung = new THREE.Group(); // chains and hangers, lifted with the deck
  along.add(hung);
  // Chains: three per side (drawn stacked) on a parabola dipping 21.34 m to just above the deck, 81 pairs of rods.
  for (const side of [-1, 1]) for (const layer of [0, 1, 2]) {
    const pts = [];
    for (let k = 0; k <= 82; k++) {
      const x = (k / 82) * span;
      const s = (x / span) * 2 - 1;
      pts.push(new THREE.Vector3(x, deckY + 1.5 + dip * s * s + layer * 0.7, side * halfW));
    }
    const chain = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 82, 0.3, 5), iron);
    hung.add(chain);
    chains.push(chain);
    // Backstays: from each tower top down into the rock behind it, where the chains are anchored.
    for (const [x0, dir, foot] of [[0, -1, 0], [span, 1, deckY]]) {
      const top = new THREE.Vector3(x0, deckY + 1.5 + dip + layer * 0.7, side * halfW);
      const end = new THREE.Vector3(x0 + dir * 55, foot - 2, side * halfW);
      const stay = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(top, end), 4, 0.3, 5), iron);
      hung.add(stay);
      chains.push(stay);
    }
    if (layer) continue;
    for (let k = 1; k < 82; k++) {
      const p = pts[k];
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, p.y - deckY, 4), iron);
      rod.position.set(p.x, (p.y + deckY) / 2, p.z);
      hung.add(rod);
      rods.push(rod);
    }
  }
  // The bridge itself is true to scale, but the gorge is drawn with the hills' height exaggeration, so the whole
  // span is lifted to sit on the (exaggerated) clifftops and the towers' legs stretch down to the ground.
  const item = { ...a, model: { group: g, top: deckY + towerH }, era: 'both', trueSize: true };
  let legStretch = 1;
  item.adjust = (v, h) => {
    const lift = deckY * (v / h - 1);
    deck.position.y = deckY + lift;
    hung.position.y = lift;
    abutment.scale.y = (34 + lift) / 34;
    abutment.position.y = deckY + lift - (34 + lift) / 2;
    legStretch = (towerH + deckY + lift + 8) / (towerH + deckY + 8);
    item.model.top = deckY + lift + towerH;
  };
  // Construction progress 0..1 (the time-lapse scene): towers rise, chains creep across, hangers, then the deck.
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  item.build = (p) => {
    const t = clamp01(p / 0.35);
    for (const tower of towers) tower.scale.y = Math.max(0.001, t) * legStretch;
    const c = clamp01((p - 0.4) / 0.3);
    for (const chain of chains) chain.geometry.setDrawRange(0, Math.floor(chain.geometry.index.count * c / 6) * 6);
    rods.forEach((rod, k) => { rod.visible = p > 0.72 + 0.12 * (k % 81) / 81; });
    deck.visible = p > 0.85;
    deck.scale.x = clamp01((p - 0.85) / 0.15) || 0.001;
  };
  return [item];
}

// Clifton Rocks Railway (1893-1934): a water-balanced funicular in a tunnel through the gorge wall, four tracks in
// one bore, cars in two counterbalanced pairs. Ends from OSM (the abandoned railway way). OSM's end points sit on the
// cliff face, so the levels are the lowest ground near the bottom (Hotwell Road, ~9 m) and the highest near the top
// (the upper station on Sion Hill, ~63 m). From Wikipedia: 137 m long, 61 m rise (1 in 2.2), a 8.5 m wide brick-lined
// bore, four cars in two pairs, 40-second journeys. Car size is approximate. Shown in X-ray.
function rocksRailway(ctx) {
  const lo = ctx.at(51.4532514, -2.6265865);
  const hi = ctx.at(51.4539583, -2.6254967);
  if (!lo || !hi) return [];
  const [lx, lz] = ctx.metres(lo.i, lo.j);
  const [hx, hz] = ctx.metres(hi.i, hi.j);
  const run = Math.hypot(hx - lx, hz - lz);
  // Search ~20 m around each end (window pixels are span/512 metres).
  const near = (p, pick) => {
    const r = Math.max(1, Math.round(20 / ctx.metresPerPixel));
    let best = pick === 'min' ? Infinity : -Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const e = ctx.terrain(p.i + di, p.j + dj);
        best = pick === 'min' ? Math.min(best, e) : Math.max(best, e);
      }
    }
    return best;
  };
  const bottom = near(lo, 'min');
  const top = near(hi, 'max');
  const rise = top - bottom;
  const length = Math.hypot(run, rise);
  const g = new THREE.Group();
  const incline = new THREE.Group();
  incline.rotation.y = -Math.atan2(hz - lz, hx - lx);
  g.add(incline);
  const tube = new THREE.Group(); // x along the slope
  tube.rotation.z = Math.atan2(rise, run);
  incline.add(tube);
  const bore = new THREE.BoxGeometry(length, 6, 8.5);
  const shell = new THREE.Mesh(bore, xrayTunnel);
  shell.position.set(length / 2, 3, 0);
  shell.renderOrder = 30;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(bore), xrayEdge);
  edges.position.copy(shell.position);
  edges.renderOrder = 31;
  tube.add(shell, edges);
  const cars = [];
  for (let k = 0; k < 4; k++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 2.2), carXray);
    car.renderOrder = 32;
    car.position.set(0, 1.8, -3.0 + k * 2.0);
    tube.add(car);
    cars.push(car);
  }
  const item = { ...lo, model: { group: g, top: 0 }, era: 'both', hugsGround: true, xray: true, baseAlt: bottom, trueSize: true };
  item.animate = (time, running) => {
    // Pairs (0,1) and (2,3): as one car climbs, its partner descends. 40 s each way, 10 s stops at each end.
    cars.forEach((car, k) => {
      const phase = (time / 100 + (k >= 2 ? 0.25 : 0)) % 1;
      let t = phase < 0.4 ? phase / 0.4 : phase < 0.5 ? 1 : phase < 0.9 ? 1 - (phase - 0.5) / 0.4 : 0;
      t = t * t * (3 - 2 * t);
      if (k % 2) t = 1 - t;
      car.position.x = 4 + (length - 8) * (running ? t : k % 2);
    });
  };
  return [item, rocksInterior(ctx, lo, hi, { bottom, rise, run, length }), ...rocksStations(ctx, lo, hi, bottom, top, Math.atan2(hz - lz, hx - lx))];
}

rocksRailway.xray = true;

// Inside the Rocks Railway, for life size: the brick-lined bore (open at both ends), four tracks, lamps along the
// roof, and a pair of cars with windows. The car on the second track can carry you up (the RideRocksRailway
// scene sets item.rideP, 0 at the bottom to 1 at the top); otherwise the cars run their 40-second trips.
// The cars kept their floors level on the slope (they were built stepped); car size and styling are approximate.
const boreBrick = textured(brickTexture(0x7a4532), { tile: 2, side: THREE.DoubleSide, color: 0xb0a8a0 });
const RIDE_TRACK = -1; // metres across the bore from its centre line
function rocksCar() {
  const g = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: 0x24407a, roughness: 0.5 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.8 });
  const L = 5.2;
  const W = 2.2;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(L, 0.2, W), wood);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(L + 0.2, 0.15, W + 0.2), cream);
  roof.position.y = 2.6;
  g.add(floor, roof);
  // Lower panels all round, posts between the windows.
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(L, 1.0, 0.06), blue);
    panel.position.set(0, 0.6, side * W / 2);
    g.add(panel);
    for (let k = 0; k <= 4; k++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.08), cream);
      post.position.set(-L / 2 + (k / 4) * L, 1.85, side * W / 2);
      g.add(post);
    }
  }
  for (const end of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, W), blue);
    panel.position.set(end * L / 2, 0.6, 0);
    g.add(panel);
  }
  // Two benches facing each other.
  for (const x of [-1.4, 1.4]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, W - 0.2), wood);
    bench.position.set(x, 0.32, 0);
    g.add(bench);
  }
  // A lamp in the roof. (Glowing, but not a real light: adding lights recompiles every material, a stall.)
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
  lamp.position.y = 2.45;
  g.add(lamp);
  return g;
}

function rocksInterior(ctx, lo, hi, { bottom, rise, run, length }) {
  const [lx, lz] = ctx.metres(lo.i, lo.j);
  const [hx, hz] = ctx.metres(hi.i, hi.j);
  const heading = Math.atan2(hz - lz, hx - lx);
  const slope = Math.atan2(rise, run);
  const g = new THREE.Group();
  const incline = new THREE.Group();
  incline.rotation.y = -heading;
  g.add(incline);
  const tube = new THREE.Group();
  tube.rotation.z = slope;
  incline.add(tube);
  const W = 8.5;
  const H = 6;
  // Walls, floor and an arched roof, as one open-ended bore.
  const bore = [];
  bore.push(metreUVs(new THREE.PlaneGeometry(length, W).rotateX(-Math.PI / 2).translate(length / 2, 0, 0)));
  for (const side of [-1, 1]) bore.push(metreUVs(new THREE.PlaneGeometry(length, H - 2).rotateY(side > 0 ? Math.PI : 0).translate(length / 2, (H - 2) / 2, side * W / 2)));
  const vault = new THREE.CylinderGeometry(W / 2, W / 2, length, 20, 1, true, 0, Math.PI); // the upper half, once turned
  vault.rotateZ(Math.PI / 2).translate(length / 2, H - 2, 0);
  bore.push(metreUVs(vault));
  // Brick walls and an arched roof; the floor is ballast.
  const ballast = textured(gravelTexture(0x77706a), { tile: 3 });
  bore.forEach((geo, k) => tube.add(new THREE.Mesh(geo, k === 0 ? ballast : boreBrick)));
  // Rails: four tracks, 1.2 m gauge.
  const rails = [];
  for (const z of [-3, -1, 1, 3]) for (const g2 of [-0.6, 0.6]) rails.push(new THREE.BoxGeometry(length, 0.12, 0.08).translate(length / 2, 0.1, z + g2));
  for (let x = 1; x < length; x += 1.2) rails.push(new THREE.BoxGeometry(0.25, 0.08, W - 1).translate(x, 0.03, 0));
  tube.add(new THREE.Mesh(mergeGeometries(rails), iron));
  // Lamps along the roof.
  const lamps = [];
  for (let x = 6; x < length; x += 10) lamps.push(new THREE.SphereGeometry(0.15, 8, 6).translate(x, H - 0.4, 0));
  tube.add(new THREE.Mesh(mergeGeometries(lamps), new THREE.MeshBasicMaterial({ color: 0xffe6b0 })));
  // The cars: level bodies on the slope.
  const cars = [RIDE_TRACK, 1].map((z) => {
    const car = new THREE.Group();
    const body = rocksCar();
    body.rotation.z = -slope;
    car.add(body);
    car.position.z = z;
    tube.add(car);
    return car;
  });
  const span = length - 8;
  const place = (car, p) => car.position.set(4 + span * p, 0.5, car.position.z);
  const item = { ...lo, model: { group: g, top: 0 }, era: 'both', hugsGround: true, baseAlt: bottom, trueSize: true, lifeOnly: true, rideP: null };
  item.animate = (time) => {
    if (item.rideP != null) {
      place(cars[0], item.rideP);
      place(cars[1], 1 - item.rideP);
      return;
    }
    const phase = (time / 100) % 1;
    let t = phase < 0.4 ? phase / 0.4 : phase < 0.5 ? 1 : phase < 0.9 ? 1 - (phase - 0.5) / 0.4 : 0;
    t = t * t * (3 - 2 * t);
    place(cars[0], t);
    place(cars[1], 1 - t);
  };
  // Where the riding car's floor is at progress p: window pixel and metres OD.
  item.rideAt = (p) => {
    const sAlong = 4 + span * p;
    const f = (sAlong * Math.cos(slope)) / run;
    const mpp = ctx.metresPerPixel;
    const across = RIDE_TRACK / mpp;
    const i = lo.i + (hi.i - lo.i) * f - Math.sin(heading) * across;
    const j = lo.j + (hi.j - lo.j) * f + Math.cos(heading) * across;
    return { i, j, alt: bottom + sAlong * Math.sin(slope) + 0.6 };
  };
  item.rideHeading = heading;
  item.tag = 'rocks-interior';
  return item;
}

// A sign board: text painted on a canvas.
function signBoard(text, w, h, { bg = '#2b2b2b', fg = '#f1e6c8' } = {}) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round((1024 * h) / w);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.font = `bold ${Math.round(c.height * 0.62)}px Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
}

// A round-headed window w wide, h tall, facing +z.
function roundWindow(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
  s.closePath();
  return new THREE.ShapeGeometry(s, 8);
}

// The railway's two stations, after period photographs: at the bottom, a stone frontage on Hotwell Road with
// round-arched windows, a glazed canopy and the CLIFTON ROCKS RAILWAY sign along the top; at the top on Sion Hill,
// an iron arch lettered CLIFTON ROCKS over the entrance, with railings. Sizes approximate.
const stationStone = textured(stoneTexture(0xb7aa8f, 31), { tile: 2 });
const ROCKS_ROAD = [51.453293, -2.626832]; // a point on Hotwell Road in front of the lower station
function rocksStations(ctx, lo, hi, bottom, top, heading) {
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.5 });
  // Bottom: the building's front faces away from the cliff (back down the line of the railway).
  // It stands at the road's edge in front of the tunnel mouth, facing the road (Hotwell Road, west of it).
  const road = ctx.at(...ROCKS_ROAD);
  const [lx, lz] = ctx.metres(lo.i, lo.j);
  const [rx, rz] = road ? ctx.metres(road.i, road.j) : [lx - 10, lz];
  const toRoad = Math.atan2(rx - lx, rz - lz);
  const front = Math.min(10, Math.hypot(rx - lx, rz - lz) - 6);
  const base = { i: lo.i + (((rx - lx) / Math.hypot(rx - lx, rz - lz)) * front) / ctx.metresPerPixel, j: lo.j + (((rz - lz) / Math.hypot(rx - lx, rz - lz)) * front) / ctx.metresPerPixel };
  const low = new THREE.Group();
  const face = new THREE.Group();
  face.rotation.y = toRoad; // local +z points at the road
  low.add(face);
  const body = new THREE.Mesh(metreUVs(new THREE.BoxGeometry(16, 10, 7)), stationStone);
  body.position.set(0, 5, -3.5);
  face.add(body);
  for (let k = 0; k < 5; k++) {
    const win = new THREE.Mesh(roundWindow(1.6, 3.6), dark);
    win.position.set(-6 + k * 3, 5.2, 0.05);
    face.add(win);
  }
  for (let k = 0; k < 3; k++) {
    const door = new THREE.Mesh(roundWindow(2.2, 3.2), dark);
    door.position.set(-4 + k * 4, 0, 0.05);
    face.add(door);
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.25, 2.6), new THREE.MeshStandardMaterial({ color: 0x4a4f4a, roughness: 0.6 }));
  canopy.position.set(0, 3.7, 1.3);
  canopy.rotation.x = 0.12;
  face.add(canopy);
  const sign = signBoard('CLIFTON ROCKS RAILWAY', 14, 1.6);
  sign.position.set(0, 10.9, 0.2);
  sign.rotation.x = -0.15;
  face.add(sign);
  const items = [{ ...base, model: { group: low, top: 12 }, era: 'both', trueSize: true, baseAlt: bottom }];
  // Top: the lettered iron arch and railings.
  const up = new THREE.Group();
  const face2 = new THREE.Group();
  face2.rotation.y = -heading - Math.PI / 2;
  up.add(face2);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.07, 6, 24, Math.PI), dark);
  arch.position.y = 2.6;
  for (const x of [-1.8, 1.8]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 6), dark);
    post.position.set(x, 1.3, 0);
    face2.add(post);
  }
  const lettering = signBoard('CLIFTON ROCKS', 3, 0.45, { bg: '#1b1d1f', fg: '#e8d9a8' });
  lettering.position.set(0, 4.15, 0);
  face2.add(arch, lettering);
  const rails = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k <= 14; k++) rails.push(new THREE.BoxGeometry(0.04, 1.1, 0.04).translate(side * (2.2 + k * 0.35), 0.55, 0));
    rails.push(new THREE.BoxGeometry(5, 0.06, 0.06).translate(side * 4.6, 1.1, 0));
  }
  face2.add(new THREE.Mesh(mergeGeometries(rails), dark));
  items.push({ ...hi, model: { group: up, top: 5 }, era: 'both', trueSize: true, baseAlt: top });
  return items;
}

// Deck boards laid lengthways along the pier (the plank texture is turned 90 degrees).
function boardsAlong(geo) {
  metreUVs(geo, 2);
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getY(k), uv.getX(k));
  return geo;
}

// A pier lamp post with a white globe.
function globeLamp() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 3, 6), new THREE.MeshStandardMaterial({ color: 0x2f3a36, roughness: 0.5 }));
  post.position.y = 1.5;
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfaf6ea, emissive: 0x6a6450, roughness: 0.3 }));
  globe.position.y = 3.15;
  g.add(post, globe);
  return g;
}

// A pagoda-roofed building (Clevedon's pavilion and shelters): white octagonal walls with windows, a roof with
// curved, upswept eaves in green, a second tier when tiers is 1 (full size), and a finial.
function pagoda(r, scale) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf1eee6, roughness: 0.6 });
  const green = new THREE.MeshStandardMaterial({ color: 0x4f8a80, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x30404a, roughness: 0.3 });
  const roofProfile = (rr, h) => new THREE.LatheGeometry([[rr * 1.3, 0], [rr * 1.15, h * 0.15], [rr * 0.75, h * 0.45], [rr * 0.35, h * 0.8], [0, h]].map(([x, y]) => new THREE.Vector2(x, y)), 8);
  const wallH = 3.2 * Math.max(scale, 0.7);
  const walls = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wallH, 8), white);
  walls.position.y = wallH / 2;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.03, r + 0.03, wallH * 0.45, 8, 1, true), dark);
  glass.position.y = wallH * 0.55;
  const roof = new THREE.Mesh(roofProfile(r, r * 0.6), green);
  roof.position.y = wallH;
  g.add(walls, glass, roof);
  let top = wallH + r * 0.6;
  if (scale >= 1) {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 2.2, 8), white);
    upper.position.y = wallH + r * 0.35 + 1.1;
    const roof2 = new THREE.Mesh(roofProfile(r * 0.45, r * 0.45), green);
    roof2.position.y = wallH + r * 0.35 + 2.2;
    g.add(upper, roof2);
    top = wallH + r * 0.35 + 2.2 + r * 0.45;
  }
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.2 * scale, 6), new THREE.MeshStandardMaterial({ color: 0xc9a23a, metalness: 0.6, roughness: 0.4 }));
  finial.position.y = top + 0.5 * scale;
  g.add(finial);
  return g;
}

const pierIron = new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.4, roughness: 0.6 });
const pierDeck = new THREE.MeshStandardMaterial({ color: 0xcfc2a6, roughness: 0.8 });
const planking = textured(timberTexture(0x9c8466), { tile: 2 });
const railMat = new THREE.MeshStandardMaterial({ color: 0x5f8f86, roughness: 0.5, metalness: 0.3 });
const pavilionMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.7 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x3f6f68, roughness: 0.6 });

// A pier from its OSM centre line: deck sections on legs every span, a pier head, optional buildings. The LIDAR only
// catches piers as a smeared ridge, so they're modelled. The model's origin is at 0 m OD, the deck sits
// its true clearance above that, and the legs stretch down to the (exaggerated) seabed each frame.
// Spans, widths and pavilion sizes are approximate.
function pier(def) {
  return (ctx) => {
    const ends = def.line.map(([lat, lon]) => (ctx.atAny ?? ctx.at)(lat, lon));
    if (ends.some((p) => !p)) return [];
    const [s, e] = ends;
    const [sx, sz] = ctx.metres(s.i, s.j);
    const [ex, ez] = ctx.metres(e.i, e.j);
    const len = Math.hypot(ex - sx, ez - sz);
    const sea = 0; // heights are measured from Ordnance Datum, whatever the tide
    const deckAlt = def.deck;
    const g = new THREE.Group();
    const along = new THREE.Group(); // x runs from the shore to the head
    along.rotation.y = -Math.atan2(ez - sz, ex - sx);
    g.add(along);
    const legs = [];
    const braces = [];
    const legMat = def.paint ? new THREE.MeshStandardMaterial({ color: def.paint, metalness: 0.3, roughness: 0.55 }) : pierIron;
    const deckH = deckAlt - sea;
    for (let k = 0; k < def.spans; k++) {
      const x0 = (k / def.spans) * len;
      const x1 = ((k + 1) / def.spans) * len;
      const deck = new THREE.Mesh(boardsAlong(new THREE.BoxGeometry(x1 - x0, 0.6, def.width)), planking);
      deck.position.set((x0 + x1) / 2, deckH, 0);
      along.add(deck);
      // Railings both sides: posts every 2.5 m, a top rail and a middle rail.
      for (const side of [-1, 1]) {
        const z = side * (def.width / 2 - 0.08);
        for (const y of [deckH + 1.25, deckH + 0.7]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.07, 0.07), railMat);
          rail.position.set((x0 + x1) / 2, y, z);
          along.add(rail);
        }
        const n = Math.max(1, Math.round((x1 - x0) / 2.5));
        const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), railMat, n);
        const m4 = new THREE.Matrix4();
        for (let q = 0; q < n; q++) posts.setMatrixAt(q, m4.makeTranslation(x0 + (q / n) * (x1 - x0), deckH + 0.8, z));
        along.add(posts);
      }
      if (def.arches) {
        // Arches rising from leg to leg to meet the deck at mid-span (Clevedon's Barlow-rail arches).
        for (const side of [-1, 1]) {
          const r = (x1 - x0) / 2;
          const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.22, 5, 28, Math.PI), legMat);
          rib.scale.y = 0.5;
          rib.position.set((x0 + x1) / 2, deckH - 0.45 - r * 0.5, side * (def.width / 2 - 0.3));
          along.add(rib);
        }
      } else {
        // Lattice girders either side: top and bottom booms with diagonal bars between (Birnbeck).
        const bars = [];
        for (const side of [-1, 1]) {
          const z = side * (def.width / 2 - 0.2);
          for (const y of [deckH - 0.35, deckH - 1.9]) bars.push(new THREE.BoxGeometry(x1 - x0, 0.18, 0.18).translate((x0 + x1) / 2, y, z));
          const n = Math.max(2, Math.round((x1 - x0) / 1.6));
          for (let q = 0; q < n; q++) {
            const xa = x0 + (q / n) * (x1 - x0);
            const xb = x0 + ((q + 1) / n) * (x1 - x0);
            const len = Math.hypot(xb - xa, 1.55);
            for (const dir of [1, -1]) {
              bars.push(new THREE.BoxGeometry(len, 0.08, 0.08).rotateZ(dir * Math.atan2(1.55, xb - xa)).translate((xa + xb) / 2, deckH - 1.12, z));
            }
          }
        }
        along.add(new THREE.Mesh(mergeGeometries(bars), legMat));
      }
      // Seabed under this support, for stretching its legs down each frame.
      const t = (k + 1) / def.spans;
      const bed = (ctx.terrainAny ?? ctx.terrain)(s.i + (e.i - s.i) * t, s.j + (e.j - s.j) * t);
      for (const side of [-1, 1]) {
        // Clevedon: each support is a pair of slender legs, together under the deck and splayed apart at the
        // foot along the pier. Elsewhere, one stout leg each side.
        for (const dx of def.arches ? [-1.8, 1.8] : [0]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(def.arches ? 0.16 : 0.3, def.arches ? 0.2 : 0.3, 1, 8), legMat);
          along.add(leg);
          legs.push({ leg, x: x1, z: side * (def.width / 2 - 0.4), bed, dx });
        }
      }
      if (def.lamps && k % 2 === 1) {
        for (const side of [-1, 1]) {
          const lamp = globeLamp();
          lamp.position.set(x1, deckH + 0.3, side * (def.width / 2 - 0.1));
          along.add(lamp);
        }
      }
      // Cross-bracing between each pair of legs (stretched with them, in adjust).
      if (!def.arches) {
        for (const dir of [1, -1]) {
          const brace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), legMat);
          along.add(brace);
          braces.push({ brace, x: x1, dir, bed: legs.at(-1).bed });
        }
      }
    }
    if (def.head) {
      const [hw, hd] = def.head;
      const platform = new THREE.Mesh(boardsAlong(new THREE.BoxGeometry(hw, 0.8, hd)), planking);
      platform.position.set(len + hw / 2 - 2, deckH, 0);
      along.add(platform);
      // Legs under the head, on a grid.
      for (let x = 6; x < hw - 4; x += 12) {
        for (let z = -hd / 2 + 3; z < hd / 2 - 2; z += 12) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 8), legMat);
          along.add(leg);
          const t = (len + x - 2) / len;
          const bed = (ctx.terrainAny ?? ctx.terrain)(s.i + (e.i - s.i) * t, s.j + (e.j - s.j) * t);
          legs.push({ leg, x: len + x - 2, z, bed });
        }
      }
      if (typeof def.pavilion === 'function') {
        const pav = def.pavilion(hw, hd);
        pav.position.set(len + hw / 2 - 2, deckH + 0.4, 0);
        along.add(pav);
      } else if (def.pavilion) {
        // Clevedon's pier head: railings and globe lamps round it, the two-tier pagoda pavilion (1894) in the
        // middle, two small pagoda shelters at the shore-side corners, and a timber landing stage below.
        const cx = len + hw / 2 - 2;
        const head = new THREE.Group();
        head.position.set(cx, deckH + 0.4, 0);
        along.add(head);
        const rails = [];
        for (const [x0r, z0r, x1r, z1r] of [[-hw / 2, -hd / 2, hw / 2, -hd / 2], [-hw / 2, hd / 2, hw / 2, hd / 2], [hw / 2, -hd / 2, hw / 2, hd / 2]]) {
          const l = Math.hypot(x1r - x0r, z1r - z0r);
          const rot = -Math.atan2(z1r - z0r, x1r - x0r);
          for (const y of [1.15, 0.6]) rails.push(new THREE.BoxGeometry(l, 0.07, 0.07).rotateY(rot).translate((x0r + x1r) / 2, y, (z0r + z1r) / 2));
          const n = Math.round(l / 1.5);
          for (let q = 0; q <= n; q++) rails.push(new THREE.BoxGeometry(0.06, 1.15, 0.06).translate(x0r + ((x1r - x0r) * q) / n, 0.58, z0r + ((z1r - z0r) * q) / n));
        }
        head.add(new THREE.Mesh(mergeGeometries(rails), legMat));
        for (const [x, z] of [[-hw / 2, -hd / 2], [-hw / 2, hd / 2], [hw / 2, -hd / 2], [hw / 2, hd / 2], [0, -hd / 2], [0, hd / 2]]) {
          const lamp = globeLamp();
          lamp.position.set(x, 0, z);
          head.add(lamp);
        }
        head.add(pagoda(5.2, 1));
        for (const z of [-hd / 2 + 3, hd / 2 - 3]) {
          const kiosk = pagoda(2.4, 0.55);
          kiosk.position.set(-hw / 2 + 3, 0, z);
          head.add(kiosk);
        }
        // The landing stage: timber decks on piles down the seaward end, below the head.
        const stage = new THREE.Group();
        for (const [y, x] of [[-4, 2], [-8, 6]]) {
          const deck = new THREE.Mesh(boardsAlong(new THREE.BoxGeometry(6, 0.4, hd * 0.8)), planking);
          deck.position.set(hw / 2 + x, y, 0);
          stage.add(deck);
        }
        const piles = [];
        for (let x = 0; x < 10; x += 2) for (let z = -hd * 0.4; z <= hd * 0.4; z += 3) piles.push(new THREE.CylinderGeometry(0.18, 0.18, 14, 6).translate(hw / 2 + x, -7, z));
        stage.add(new THREE.Mesh(mergeGeometries(piles), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.9 })));
        head.add(stage);
      }
    }
    const item = { ...s, model: { group: g, top: deckH + 6 }, era: def.era ?? 'both', trueSize: true, baseAlt: sea, tag: 'pier', far: true };
    // Walkable at life size: the deck (and the pier head), at its true height, a little narrower than drawn.
    const mpp = ctx.metresPerPixel;
    const ux = (e.i - s.i) / Math.hypot(e.i - s.i, e.j - s.j);
    const uz = (e.j - s.j) / Math.hypot(e.i - s.i, e.j - s.j);
    const [hw, hd] = def.head ?? [0, 0];
    item.walk = (i, j) => {
      const along = ((i - s.i) * ux + (j - s.j) * uz) * mpp;
      const off = Math.abs((i - s.i) * -uz + (j - s.j) * ux) * mpp;
      if (along >= -1 && along <= len + 1 && off <= def.width / 2 - 0.2) return deckAlt + 0.3;
      if (def.head && along > len - 2 && along <= len + hw - 2 && off <= hd / 2 - 0.3) return deckAlt + 0.4;
      return null;
    };
    item.adjust = (v, hh) => {
      const exag = v / hh;
      for (const { leg, x, z, bed, dx = 0 } of legs) {
        const bottom = (bed - sea) * exag; // seabed relative to the sea surface, in the model's metres
        const top = deckH - 0.3;
        const h = Math.max(0.1, top - bottom);
        leg.scale.y = Math.hypot(h, dx);
        leg.rotation.z = Math.atan2(dx, h);
        leg.position.set(x + dx / 2, (top + bottom) / 2, z);
      }
      // An X between the two legs, from just under the girder to 1 m above the seabed.
      const w = def.width - 0.8;
      for (const { brace, x, dir, bed } of braces) {
        const top = deckH - 2;
        const bottom = (bed - sea) * exag + 1;
        const h2 = Math.max(0.1, top - bottom);
        brace.scale.y = Math.hypot(h2, w);
        brace.rotation.set(dir * Math.atan2(w, h2), 0, 0);
        brace.position.set(x, (top + bottom) / 2, 0);
      }
    };
    const items = [item];
    // Buildings from mapped footprints (Birnbeck Island), standing on their own ground.
    for (const b of def.buildings ?? []) {
      const pts = b.map(([lat, lon]) => ctx.at(lat, lon));
      if (pts.some((p) => !p)) continue;
      const ai = pts.reduce((a, p) => a + p.i, 0) / pts.length;
      const aj = pts.reduce((a, p) => a + p.j, 0) / pts.length;
      const [ax, az] = ctx.metres(ai, aj);
      const shape = new THREE.Shape(pts.map((p) => {
        const [x, z] = ctx.metres(p.i, p.j);
        return new THREE.Vector2(x - ax, -(z - az));
      }));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 8, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, pavilionMat);
      const bg = new THREE.Group();
      bg.add(mesh);
      items.push({ i: ai, j: aj, model: { group: bg, top: 8 }, era: 'both', trueSize: true });
    }
    return items;
  };
}

// Clevedon (Wikipedia): eight 30 m spans of Barlow-rail legs and arches, deck 5 m wide; opened 1869; concrete
// landing stage 1913, pavilion 1894. Deck level from the LIDAR (~12.5 m OD).
const CLEVEDON_PIER = {
  line: [[51.4427, -2.86149], [51.443744, -2.865196]], spans: 8, width: 5, deck: 12.5, arches: true, paint: 0x4f8a80,
  head: [24, 22], pavilion: true, lamps: true,
};
// Birnbeck (Wikipedia): Eugenius Birch, opened 1867, 351 m, 6 m wide, a continuous lattice girder on 15 groups of
// four screw piles. Island buildings by Hans Price, from their mapped footprints.
const BIRNBECK_PIER = {
  line: [[51.356481, -2.994502], [51.357867, -2.99876]], spans: 15, width: 6, deck: 11,
};
// The steamer landing jetty on the north side of Birnbeck Island.
const BIRNBECK_JETTY = { line: [[51.358079, -2.999003], [51.358669, -2.998532]], spans: 4, width: 5, deck: 9 };

// Weston-super-Mare's Grand Pier (Wikipedia): opened 1904, about 366 m; its pavilion, a theatre, burned in 1930 and
// was rebuilt in 1933; that burned in 2008 and today's pavilion opened in 2010. In 1907 a long extension was built
// out from the head as a steamer landing, but the tides made it hard to use and it was later demolished.
// Line and head from OpenStreetMap; deck level from the LIDAR (about 10.4 m OD). Styling approximate.
const white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 });
const greenRoof = new THREE.MeshStandardMaterial({ color: 0x3f7a6a, roughness: 0.5, metalness: 0.2 });
const greyRoof = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.5, metalness: 0.3 });
const redSign = new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.5 });

function onion(r, h) {
  const pts = [[0, 0], [r, 0], [r * 1.15, h * 0.25], [r * 0.95, h * 0.55], [r * 0.45, h * 0.8], [r * 0.12, h * 0.95], [0, h]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 16);
}

// 1904: a white theatre pavilion with a big central dome and domed corner turrets (in the seaside "oriental" style).
function pavilion1904() {
  const g = new THREE.Group();
  const hall = new THREE.Mesh(new THREE.BoxGeometry(60, 12, 32), white);
  hall.position.y = 6;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(61, 1, 33), greenRoof);
  roof.position.y = 12.5;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 4, 16), white);
  drum.position.y = 15;
  const dome = new THREE.Mesh(onion(7, 11), greenRoof);
  dome.position.y = 17;
  g.add(hall, roof, drum, dome);
  for (const [x, z] of [[-30, -16], [30, -16], [-30, 16], [30, 16]]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 17, 10), white);
    tower.position.set(x, 8.5, z);
    const cap = new THREE.Mesh(onion(2.6, 5), greenRoof);
    cap.position.set(x, 17, z);
    g.add(tower, cap);
  }
  // Arched windows along the sides.
  for (let k = 0; k < 10; k++) {
    for (const z of [-16.05, 16.05]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5), new THREE.MeshBasicMaterial({ color: 0x2a3440, side: THREE.DoubleSide }));
      win.position.set(-24 + k * 5.3, 6, z);
      g.add(win);
    }
  }
  return g;
}

// 2010: a big white shed over the whole head, with a shallow curved roof and slender pointed towers.
function pavilion2010(hw, hd) {
  const g = new THREE.Group();
  const L = hw - 6;
  const W = hd - 8;
  const hall = new THREE.Mesh(new THREE.BoxGeometry(L, 12, W), white);
  hall.position.y = 6;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.75, W * 0.75, L, 24, 1, false, Math.PI / 2 - 0.73, 1.46), greyRoof);
  roof.rotation.z = Math.PI / 2;
  roof.position.y = 12 - W * 0.75 * Math.cos(0.73);
  g.add(hall, roof);
  for (const [x, z] of [[-L / 2, -W / 2], [-L / 2, W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, 0], [0, -W / 2], [0, W / 2]]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 18, 8), white);
    tower.position.set(x, 9, z);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.8, 6, 8), white);
    spire.position.set(x, 21, z);
    g.add(tower, spire);
  }
  // Bands of glazing, and the name in red at the shore end.
  for (const z of [-W / 2 - 0.05, W / 2 + 0.05]) {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(L - 6, 3), new THREE.MeshBasicMaterial({ color: 0x40505c, side: THREE.DoubleSide }));
    glass.position.set(0, 7, z);
    g.add(glass);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 22), redSign);
  sign.position.set(-L / 2 - 0.3, 14, 0);
  g.add(sign);
  return g;
}

const GRAND_LINE = [[51.347665, -2.981880], [51.347780, -2.985620]];
const GRAND_PIER_1904 = { line: GRAND_LINE, spans: 18, width: 10, deck: 10.4, head: [135, 66], pavilion: pavilion1904, era: 'then', paint: 0x4a5560 };
const GRAND_PIER_NOW = { line: GRAND_LINE, spans: 18, width: 10, deck: 10.4, head: [135, 66], pavilion: pavilion2010, era: 'now', paint: 0x4a5560 };
// The 1907 steamer extension, straight on from the head (length approximate).
const GRAND_EXTENSION = { line: [[51.34782, -2.98755], [51.34802, -2.99415]], spans: 30, width: 4, deck: 10.4, era: 'then', paint: 0x4a5560 };

export const STRUCTURES = {
  clifton: [cliftonBridge, rocksRailway],
  'clevedon-pier': [pier(CLEVEDON_PIER)],
  'birnbeck-pier': [pier(BIRNBECK_PIER), pier(BIRNBECK_JETTY), pier(GRAND_PIER_1904), pier(GRAND_PIER_NOW), pier(GRAND_EXTENSION), lifeboatStation],
  'weston-bay': [pier(GRAND_PIER_1904), pier(GRAND_PIER_NOW), pier(GRAND_EXTENSION)],
  'bristol-centre': [bristolStructures],
  bath: [bathStructures],
};

export { carMat };
