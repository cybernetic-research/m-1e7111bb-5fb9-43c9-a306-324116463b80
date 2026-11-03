import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Life at Cheddar: Gough's Cave to walk into, ice-age animals on the hills, and a camp of Cheddar Man's time.
// Sources: Wikipedia (Gough's Cave; Cheddar Man; Cheddar Gorge). Gough's Cave opens at the foot of the gorge's
// south side and runs into the hill for about 3.4 km; the show cave's formations include the flowstone
// "Solomon's Temple". People used it about 14,700 years ago, hunting mainly wild horse and red deer; reindeer and
// arctic hare are also found. Cheddar Man (about 9,100 years ago, a Mesolithic hunter-gatherer) was buried in it.
// The passage's shape, the formations' positions and every figure and animal here are illustrative, original
// designs; only the entrance position and the cave's direction under the cliff come from the map and the LIDAR.

// The entrance (at the foot of the cliff) and the bearing the cave runs into the hill.
const CAVE = { lat: 51.281819, lon: -2.767417, bearing: 185, length: 140 };
export const CAMP = [51.28212, -2.76718]; // on the gorge floor, a little up from the cave mouth
const rad = (d) => (d * Math.PI) / 180;
const bump = (s, c, w) => Math.exp(-(((s - c) / w) ** 2));
const hash = (a, b) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// The passage: centre line wiggling a little either side of the bearing, a gently falling floor, two chambers.
const caveWiggle = (s) => 3 * Math.sin((2 * Math.PI * s) / 100) * Math.min(1, s / 20);
const caveHalfWidth = (s) => 2.6 + 4.5 * bump(s, 50, 12) + 3.5 * bump(s, 105, 10) + 0.6 * Math.sin(s * 0.37);
const caveHeight = (s) => 3.8 + 7 * bump(s, 50, 12) + 5 * bump(s, 105, 10) + 0.5 * Math.sin(s * 0.53);
const caveDrop = (s) => 0.07 * s;
// Lamps along the show cave (lighting is baked into the rock's colours: no real lights).
const LAMPS = [8, 22, 36, 46, 54, 66, 82, 96, 104, 112, 126];

// Colours are worked out as they should look on screen; vertex colours are linear, so convert.
const lin = (rgb) => rgb.map((x) => Math.pow(Math.max(0, x), 2.2));

// Brightness at a point: a faint background, plus each lamp falling off with distance (pools of light between
// darker stretches).
function caveLight(p, lamps) {
  let b = 0.03;
  for (const l of lamps) {
    const d2 = (p.x - l.x) ** 2 + (p.y - l.y) ** 2 + (p.z - l.z) ** 2;
    b += 0.9 / (1 + d2 / 6);
  }
  return Math.min(1.1, b);
}

// Push a cone (stalactite pointing down, or stalagmite up) into the formation arrays, coloured and lit.
function cone(out, base, length, radius, down, colour, lamps) {
  const geo = new THREE.ConeGeometry(radius, length, 7).toNonIndexed();
  if (down) geo.rotateX(Math.PI);
  geo.translate(base.x, base.y + (down ? -length / 2 : length / 2), base.z);
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let k = 0; k < p.count; k++) {
    v.fromBufferAttribute(p, k);
    const b = caveLight(v, lamps);
    const [r, g2, bl] = lin([colour[0] * b, colour[1] * b, colour[2] * b]);
    c[k * 3] = r;
    c[k * 3 + 1] = g2;
    c[k * 3 + 2] = bl;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  out.push(geo);
}

function goughsCave(ctx) {
  const at = ctx.at(CAVE.lat, CAVE.lon);
  if (!at) return [];
  const mpp = ctx.metresPerPixel;
  const dir = [Math.sin(rad(CAVE.bearing)), Math.cos(rad(CAVE.bearing))]; // east, north
  const perp = [Math.cos(rad(CAVE.bearing)), -Math.sin(rad(CAVE.bearing))];
  // The entrance floor: the lowest ground within 6 m of the entrance.
  let floor0 = Infinity;
  const r6 = Math.ceil(6 / mpp);
  for (let dj = -r6; dj <= r6; dj++) for (let di = -r6; di <= r6; di++) floor0 = Math.min(floor0, ctx.terrain(at.i + di, at.j + dj));
  // Centre line point s metres in: [east, north] from the entrance.
  const centre = (s) => [dir[0] * s + perp[0] * caveWiggle(s), dir[1] * s + perp[1] * caveWiggle(s)];
  const groundAbove = (s) => {
    const [e, n] = centre(s);
    return ctx.terrain(at.i + e / mpp, at.j - n / mpp);
  };
  // Stop where the hill above gets too thin to hold the passage.
  let L = CAVE.length;
  for (let s = 16; s <= CAVE.length; s += 2) {
    if (groundAbove(s) - 2 - (floor0 - caveDrop(s)) < 3) {
      L = s - 2;
      break;
    }
  }
  const lamps = LAMPS.filter((s) => s < L).map((s, k) => {
    const [e, n] = centre(s);
    const side = k % 2 ? 1 : -1;
    const off = side * (caveHalfWidth(s) - 0.8);
    return new THREE.Vector3(e + perp[0] * off, -caveDrop(s) + 1.2, -(n + perp[1] * off));
  });
  // Rings of the passage, every 2 m.
  const NR = 20;
  const pos = [];
  const col = [];
  const rings = [];
  const v = new THREE.Vector3();
  for (let s = 0; s <= L; s += 2) {
    const [e, n] = centre(s);
    const hw = caveHalfWidth(s);
    const H = Math.min(caveHeight(s), Math.max(2.4, groundAbove(s) - 2 - (floor0 - caveDrop(s))));
    const fy = -caveDrop(s);
    const ring = [];
    for (let a = 0; a < NR; a++) {
      const th = (a / NR) * Math.PI * 2;
      const wob = 1 + 0.16 * (hash(s, a) - 0.5) + 0.1 * Math.sin(s * 0.8 + a);
      const x = Math.cos(th) * hw * wob;
      const y = Math.max(fy, fy + H / 2 + Math.sin(th) * (H / 2) * wob);
      v.set(e + perp[0] * x, y, -(n + perp[1] * x));
      ring.push(pos.length / 3);
      pos.push(v.x, v.y, v.z);
      const b = caveLight(v, lamps);
      const t = hash(a * 3.1, s * 1.7);
      const wet = y < fy + 0.05 ? 0.75 : 1;
      col.push(...lin([(0.62 + 0.13 * t) * b * wet, (0.55 + 0.12 * t) * b * wet, (0.45 + 0.1 * t) * b * wet]));
    }
    rings.push(ring);
  }
  const idx = [];
  for (let r = 0; r < rings.length - 1; r++) {
    for (let a = 0; a < NR; a++) {
      const p0 = rings[r][a];
      const p1 = rings[r][(a + 1) % NR];
      const p2 = rings[r + 1][a];
      const p3 = rings[r + 1][(a + 1) % NR];
      idx.push(p0, p2, p1, p1, p2, p3);
    }
  }
  // Close the far end.
  const last = rings[rings.length - 1];
  for (let a = 1; a < NR - 1; a++) idx.push(last[0], last[a], last[a + 1]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const rock = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, rock));
  // Formations: stalactites in the chambers and along the roof, stalagmites at the walls, Solomon's Temple.
  const forms = [];
  const cream = [0.86, 0.78, 0.64];
  const ochre = [0.84, 0.62, 0.42];
  for (let k = 0; k < 160; k++) {
    const s = 6 + hash(k, 1) * (L - 10);
    const [e, n] = centre(s);
    const hw = caveHalfWidth(s);
    const H = Math.min(caveHeight(s), groundAbove(s) - 2 - (floor0 - caveDrop(s)));
    const x = (hash(k, 2) - 0.5) * hw * 1.2;
    const roofY = -caveDrop(s) + H / 2 + (H / 2) * Math.sqrt(Math.max(0, 1 - (x / hw) ** 2)) - 0.2;
    const chamber = bump(s, 50, 12) + bump(s, 105, 10);
    if (hash(k, 3) > 0.35 + chamber * 0.5) continue;
    const base = new THREE.Vector3(e + perp[0] * x, roofY, -(n + perp[1] * x));
    cone(forms, base, 0.3 + hash(k, 4) * (0.8 + chamber * 2.2), 0.06 + hash(k, 5) * 0.14, true, hash(k, 6) > 0.5 ? cream : ochre, lamps);
  }
  for (let k = 0; k < 70; k++) {
    const s = 10 + hash(k, 11) * (L - 14);
    const [e, n] = centre(s);
    const x = (hash(k, 12) > 0.5 ? 1 : -1) * (caveHalfWidth(s) - 0.4 - hash(k, 13) * 0.8);
    const base = new THREE.Vector3(e + perp[0] * x, -caveDrop(s) - 0.05, -(n + perp[1] * x));
    cone(forms, base, 0.3 + hash(k, 14) * 1.6, 0.12 + hash(k, 15) * 0.25, false, cream, lamps);
  }
  // Solomon's Temple: tiers of flowstone rising up one side of the second chamber.
  if (L > 105) {
    const s = 105;
    const [e, n] = centre(s);
    const x = caveHalfWidth(s) - 2.6;
    for (let t = 0; t < 6; t++) {
      const y = -caveDrop(s) + t * 1.0;
      const base = new THREE.Vector3(e + perp[0] * x, y, -(n + perp[1] * x));
      cone(forms, base, 1.3, 2.4 - t * 0.33, false, ochre, lamps);
    }
  }
  if (forms.length) g.add(new THREE.Mesh(mergeGeometries(forms), rock));
  // A pool in the first chamber, and the lamps themselves.
  if (L > 56) {
    const [e, n] = centre(50);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1f5a5c }));
    pool.position.set(e - perp[0] * 2, -caveDrop(50) + 0.04, -(n - perp[1] * 2));
    g.add(pool);
  }
  const lampGeo = mergeGeometries(lamps.map((p) => new THREE.SphereGeometry(0.12, 8, 6).translate(p.x, p.y, p.z)));
  g.add(new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffe2a8 })));
  const item = { ...at, model: { group: g, top: 4 }, era: ['now', 'mesolithic', 'ice-age'], trueSize: true, baseAlt: floor0, lifeOnly: true };
  // Walkable: the passage floor (under the hill, so it overrides the ground above), from 3 m in.
  item.walk = (i, j) => {
    const de = (i - at.i) * mpp;
    const dn = -(j - at.j) * mpp;
    const s = de * dir[0] + dn * dir[1];
    if (s < 0 || s > L) return null;
    const lateral = de * perp[0] + dn * perp[1] - caveWiggle(s);
    if (Math.abs(lateral) > caveHalfWidth(s) - 0.5) return null;
    return { h: floor0 - caveDrop(s) + 0.05, force: s > 3 };
  };
  return [item];
}

// --- animals (original low-poly models, metres; +x forward) ---

const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });

function legSet(g, len, x, z, m) {
  const legs = [];
  for (const [lx, lz] of [[x, z], [x, -z], [-x, z], [-x, -z]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, len, lz);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, len, 5), m);
    leg.position.y = -len / 2;
    pivot.add(leg);
    g.add(pivot);
    legs.push(pivot);
  }
  return legs;
}

// A wild horse: stocky, dun with a dark mane, tail and legs (as ice-age horses are usually drawn).
function horse() {
  const g = new THREE.Group();
  const dun = mat(0x9c7a4e);
  const dark = mat(0x2e241b);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.0, 4, 10).rotateZ(Math.PI / 2), dun);
  body.position.y = 1.15;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.27, 0.8, 8), dun);
  neck.rotation.z = -0.75;
  neck.position.set(0.82, 1.48, 0);
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.42, 3, 8).rotateZ(Math.PI / 2 + 0.6), dun);
  head.position.set(1.13, 1.7, 0);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), dark);
  muzzle.position.set(1.33, 1.53, 0);
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 0.06), dark);
  mane.rotation.z = -0.75;
  mane.position.set(0.76, 1.66, 0);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.8, 6), dark);
  tail.rotation.z = -0.35;
  tail.position.set(-0.98, 0.95, 0);
  for (const z of [-0.07, 0.07]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), dun);
    ear.position.set(1.0, 1.95, z);
    g.add(ear);
  }
  g.add(body, neck, head, muzzle, mane, tail);
  const legs = legSet(g, 0.95, 0.55, 0.18, dark);
  return { g, legs };
}

// A reindeer: grey-brown with a pale neck, branching antlers.
function reindeer() {
  const g = new THREE.Group();
  const coat = mat(0x6f6352);
  const pale = mat(0xd8d0c0);
  const antler = mat(0x8a7a62);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.8, 4, 10).rotateZ(Math.PI / 2), coat);
  body.position.y = 1.0;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.6, 8), pale);
  neck.rotation.z = -0.9;
  neck.position.set(0.65, 1.28, 0);
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.3, 3, 8).rotateZ(Math.PI / 2 + 0.5), coat);
  head.position.set(0.9, 1.42, 0);
  g.add(body, neck, head);
  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 5), antler);
    beam.rotation.set(side * 0.5, 0, 0.35);
    beam.position.set(0.82, 1.9, side * 0.2);
    g.add(beam);

    for (let t = 0; t < 3; t++) {
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.35, 4), antler);
      tine.rotation.set(side * 0.9, 0, -0.4 + t * 0.2);
      tine.position.set(0.86 - t * 0.08, 1.75 + t * 0.18, side * (0.25 + t * 0.08));
      g.add(tine);

    }
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), pale);
  tail.position.set(-0.72, 1.08, 0);
  g.add(tail);
  const legs = legSet(g, 0.85, 0.45, 0.15, coat);
  return { g, legs };
}

// A herd wandering slowly round its home ground: walking to a new spot, then grazing (head down).
function herd(ctx, centre, kind, count, seed) {
  const at = ctx.at(...centre);
  if (!at) return [];
  const mpp = ctx.metresPerPixel;
  const items = [];
  for (let k = 0; k < count; k++) {
    const a = kind === 'horse' ? horse() : reindeer();
    a.g.scale.setScalar(0.9 + hash(seed, k) * 0.25);
    const outer = new THREE.Group(); // the feature system sets the outer group's scale each frame
    outer.add(a.g);
    const home = { i: at.i + ((hash(k, seed) - 0.5) * 50) / mpp, j: at.j + ((hash(seed, k * 3) - 0.5) * 50) / mpp };
    const it = { i: home.i, j: home.j, model: { group: outer, top: 2.2 }, era: 'ice-age', trueSize: true, onShown: true };
    let target = null;
    let last = null;
    let pause = hash(k, 9) * 8;
    it.animate = (time) => {
      const dt = last == null ? 0 : Math.min(0.1, time - last);
      last = time;
      if (!target) {
        // Standing grazing: legs come to rest.
        pause -= dt;
        if (pause <= 0) {
          const ang = hash(time, k) * Math.PI * 2;
          const r = (8 + hash(k, time) * 18) / mpp;
          target = { i: home.i + Math.cos(ang) * r, j: home.j + Math.sin(ang) * r };
        }
        a.legs.forEach((l) => { l.rotation.z *= 0.9; });
        return;
      }
      const di = target.i - it.i;
      const dj = target.j - it.j;
      const d = Math.hypot(di, dj) * mpp;
      if (d < 0.5) {
        target = null;
        pause = 4 + hash(k, time) * 10;
        return;
      }
      const speed = kind === 'horse' ? 1.1 : 0.9;
      const step = Math.min(d, speed * dt);
      it.i += (di * step) / d;
      it.j += (dj * step) / d;
      // Face the way it's going: model +x forward; window j runs south.
      a.g.rotation.y = -Math.atan2(dj, di);
      const swing = Math.sin(time * 7 + k) * 0.45;
      a.legs.forEach((l, n) => { l.rotation.z = n % 3 === 0 ? swing : -swing; });
    };
    items.push(it);
  }
  return items;
}

// --- Cheddar Man's time: a camp at the cave mouth (original figures) ---

const skin = mat(0x7a5a40);
const hide = mat(0x8a6a48);
const fur = mat(0x5a4632);
const hair = mat(0x1e1712);

// A person in hide clothing. pose: 'stand' (with a spear), 'crouch' (at the fire), 'sit'.
function person(pose, seed) {
  const g = new THREE.Group();
  const coat = [hide, fur][seed % 2];
  const crouch = pose === 'crouch';
  const sit = pose === 'sit';
  const hipY = sit ? 0.35 : crouch ? 0.55 : 0.9;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.45, 3, 8), coat);
  torso.position.y = hipY + 0.33;
  torso.rotation.z = crouch ? -0.35 : 0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), skin);
  head.position.set(crouch ? 0.17 : 0, hipY + 0.78, 0);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.8), hair);
  hairCap.position.copy(head.position);
  hairCap.rotation.z = 0.3;
  g.add(torso, head, hairCap);
  const legs = [];
  for (const z of [-0.08, 0.08]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, sit ? 0.4 : 0.6, 3, 6), coat);
    if (sit) {
      leg.rotation.z = Math.PI / 2;
      leg.position.set(0.25, 0.12, z);
    } else if (crouch) {
      leg.rotation.z = 0.9;
      leg.position.set(0.12, 0.3, z);
    } else {
      leg.position.set(0, 0.42, z);
    }
    g.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const z of [-0.2, 0.2]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, hipY + 0.55, z);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.45, 3, 6), skin);
    arm.position.y = -0.25;
    pivot.add(arm);
    pivot.rotation.z = crouch ? 0.9 : sit ? 0.5 : 0.1;
    g.add(pivot);
    arms.push(pivot);
  }
  if (pose === 'stand') {
    const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 2.2, 5), mat(0x6a4a2c));
    spear.position.set(0.1, 1.1, 0.24);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), mat(0x3a3a3a));
    tip.position.set(0.1, 2.25, 0.24);
    g.add(spear, tip);
  }
  return { g, arms };
}

// A conical shelter of poles and hides, r metres across the base.
function shelter(g, x, z, r, colour) {
  const hideMat = new THREE.MeshStandardMaterial({ color: colour, roughness: 1, side: THREE.DoubleSide });
  const cover = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.5, 10, 1, true), hideMat);
  cover.position.set(x, r * 0.75, z);
  g.add(cover);
  // Door flap gap: a dark triangle on the side facing the hearth (towards the camp centre).
  const door = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.5, r * 0.8), new THREE.MeshBasicMaterial({ color: 0x1a120c, side: THREE.DoubleSide }));
  const a = Math.atan2(-z, -x);
  door.position.set(x + Math.cos(a) * r * 0.62, r * 0.4, z + Math.sin(a) * r * 0.62);
  door.rotation.y = -a + Math.PI / 2;
  g.add(door);
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * Math.PI * 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, r * 1.9, 4), mat(0x5a4028));
    pole.position.set(x + Math.cos(t) * r * 0.18, r * 0.9, z + Math.sin(t) * r * 0.18);
    pole.rotation.set(Math.sin(t) * 0.25, 0, -Math.cos(t) * 0.25);
    g.add(pole);
  }
}

function hearth(g, x, z, flames) {
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16), mat(0x6e6a62));
    st.position.set(x + Math.cos(a) * 0.6, 0.08, z + Math.sin(a) * 0.6);
    g.add(st);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let k = 0; k < 5; k++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.65, 7), flameMat);
    f.position.set(x + Math.sin(k * 2.4) * 0.2, 0.32, z + Math.cos(k * 2.4) * 0.2);
    g.add(f);
    flames.push(f);
  }
  const embers = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a1a }));
  embers.position.set(x, 0.03, z);
  g.add(embers);
}

function rack(g, x, z, rotY) {
  const r = new THREE.Group();
  for (const px of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 5), mat(0x5a4028));
    post.position.set(px, 0.9, 0);
    r.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5).rotateZ(Math.PI / 2), mat(0x5a4028));
  bar.position.y = 1.75;
  const skinHide = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), new THREE.MeshStandardMaterial({ color: 0xa88560, side: THREE.DoubleSide, roughness: 1 }));
  skinHide.position.y = 1.15;
  // Strips of meat or fish drying.
  for (let k = 0; k < 5; k++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.02), mat(0x6a2a20));
    strip.position.set(-0.8 + k * 0.4, 1.45, 0.05);
    r.add(strip);
  }
  r.add(bar, skinHide);
  r.position.set(x, 0, z);
  r.rotation.y = rotY;
  g.add(r);
}

function dog() {
  const g = new THREE.Group();
  const coat = mat(0x6a5236);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.45, 3, 8).rotateZ(Math.PI / 2), coat);
  body.position.y = 0.45;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 6).rotateZ(-Math.PI / 2), coat);
  head.position.set(0.42, 0.58, 0);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 5).rotateZ(0.6), coat);
  tail.position.set(-0.4, 0.55, 0);
  for (const z of [-0.06, 0.06]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), coat);
    ear.position.set(0.36, 0.7, z);
    g.add(ear);
  }
  g.add(body, head, tail);
  const legs = legSet(g, 0.35, 0.2, 0.08, coat);
  return { g, legs };
}

// A camp of a few families: shelters round two hearths, people at work, children, a dog.
function camp(ctx) {
  const at = ctx.at(...CAMP);
  if (!at) return [];
  const g = new THREE.Group();
  const flames = [];
  const tones = [0x8a6a48, 0x7a5a3a, 0x9a7a52, 0x6e5034];
  [[-7, -5, 2.4], [-2, -9, 2.0], [6, -7, 2.6], [8, 3, 2.2]].forEach(([x, z, r], k) => shelter(g, x, z, r, tones[k]));
  hearth(g, 0, 0, flames);
  hearth(g, 3, 6, flames);
  rack(g, -6, 4, 0.4);
  rack(g, 9, -1, 1.4);
  // Firewood pile and hides pegged out to dry.
  for (let k = 0; k < 12; k++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.4, 5).rotateZ(Math.PI / 2), mat(0x5a4028));
    log.position.set(-3 + (k % 4) * 0.02, 0.08 + Math.floor(k / 4) * 0.15, 4 + (k % 4) * 0.16);
    log.rotation.y = 0.3;
    g.add(log);
  }
  for (const [x, z] of [[4, -2], [-4, 8]]) {
    const pegged = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb08d66, roughness: 1, side: THREE.DoubleSide }));
    pegged.position.set(x, 0.04, z);
    g.add(pegged);
  }
  // People (original designs): around the fires, at work, coming and going; children (smaller) playing.
  const people = [
    ['crouch', -0.9, 0.3, 0.5], ['sit', 0.9, -1.0, 2.2], ['stand', 1.8, 1.2, 2.8], ['sit', -0.6, -1.2, 1.0],
    ['crouch', 3.9, 6.6, 3.6], ['sit', 2.0, 7.0, -0.6], ['stand', -6, 2.6, 0.2], ['stand', 7.5, 1, 2.0],
  ].map(([pose, x, z, ry], k) => {
    const p = person(pose, k);
    p.g.position.set(x, 0, z);
    p.g.rotation.y = ry;
    g.add(p.g);
    return p;
  });
  const children = [0, 1, 2].map((k) => {
    const p = person('stand', k + 1);
    p.g.scale.setScalar(0.62);
    g.add(p.g);
    return p;
  });
  const hound = dog();
  g.add(hound.g);
  const item = { ...at, model: { group: g, top: 4 }, era: 'mesolithic', trueSize: true, onShown: true, pad: 13 };
  item.animate = (time) => {
    flames.forEach((f, k) => {
      const s = 0.6 + 0.5 * Math.abs(Math.sin(time * (7 + k * 2.3) + k) * Math.sin(time * 3.1 + k));
      f.scale.set(1, s, 1);
      f.position.y = 0.32 * s;
    });
    people[0].arms[1].rotation.z = 0.9 + Math.sin(time * 1.3) * 0.25; // tending the fire
    people[1].arms[0].rotation.z = 0.5 + Math.abs(Math.sin(time * 6)) * 0.4; // knapping flint
    people[4].arms[0].rotation.z = 0.9 + Math.sin(time * 1.7) * 0.3;
    people[5].arms[1].rotation.z = 0.5 + Math.abs(Math.sin(time * 4)) * 0.3; // scraping a hide
    // Children chasing round the second hearth; the dog after them.
    children.forEach((c, k) => {
      const a = time * 0.7 + (k * Math.PI * 2) / 3;
      c.g.position.set(3 + Math.cos(a) * 3.2, Math.abs(Math.sin(time * 8 + k)) * 0.08, 6 + Math.sin(a) * 3.2);
      c.g.rotation.y = -a;
    });
    const a = time * 0.7 - 0.6;
    hound.g.position.set(3 + Math.cos(a) * 3.6, 0, 6 + Math.sin(a) * 3.6);
    hound.g.rotation.y = -a - Math.PI / 2;
    const swing = Math.sin(time * 12) * 0.5;
    hound.legs.forEach((l, n) => { l.rotation.z = n % 3 === 0 ? swing : -swing; });
  };
  return [item];
}

export function cheddarLife(ctx) {
  return [
    ...goughsCave(ctx),
    ...camp(ctx),
    ...herd(ctx, [51.2878, -2.7590], 'horse', 7, 1),
    ...herd(ctx, [51.2836, -2.7556], 'reindeer', 8, 2),
    ...herd(ctx, [51.2840, -2.7630], 'horse', 5, 3),
    ...herd(ctx, [51.2862, -2.7535], 'reindeer', 6, 4),
  ];
}
