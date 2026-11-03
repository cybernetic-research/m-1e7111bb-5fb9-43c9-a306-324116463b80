import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RES } from './terrain.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nightLit } from './daylight.js';
import { MARKETS } from './bristol.js';

// Free the skeletons (their bones' textures) under these roots, in the scene or not.
function freeSkeletons(roots) {
  for (const r of roots) r?.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton?.dispose();
  });
}


// Life in the medieval town at life size: animals in the yards, streets and fields, birds over the rooftops and the
// water, fish jumping in the Frome and the Avon, smoke from one house in twenty, fires burning in yards, market stalls
// round the High Cross, and barrels, crates, carts, wells and lanterns (lit at night) about the streets.
// - Animals are CC0 models by Quaternius (via Poly Pizza; assets/models/cc0, see CREDITS.txt), playing their own
//   animations; they wander near where they were put, never through a wall, a building or into the water.
// - Birds and fish are simple models made here.
// - Everything is placed at random (but the same each time) where it belongs, once the town's masks are ready:
//   chickens and goats in yards and gardens, horses in the streets and on the Marsh, sheep and cows in the fields.

const DIR = 'assets/models/cc0/';
// Each kind: its model, its height in metres (to scale the model), and the names of its idle and walking clips.
const KINDS = {
  // (A realistic hen, CC0, from the user's chicken.zip: assets/models/wild/CREDITS.txt.)
  chicken: { file: 'assets/models/wild/Chicken.gltf', height: 0.42, idle: /^(Idle1|Idle2|Eating|Pecking1|Pecking2)$/, walk: /^Walk$/, speed: 0.5, roam: 5 },
  goat: { file: 'goat.glb', fallback: 'sheep-b.glb', tint: 0x8a6a4a, height: 0.85, idle: /Eating|Idle/, walk: /Walk/, speed: 0.6, roam: 6 },
  sheep: { file: 'sheep-b.glb', height: 0.95, idle: /Eating|Idle/, walk: /Walk/, speed: 0.5, roam: 14 },
  cow: { file: 'cow.glb', height: 1.45, idle: /Eating|Idle_Headlow|Idle_2/, walk: /^Walk/, speed: 0.6, roam: 16 },
  horse: { file: 'horse-a.glb', height: 1.65, idle: /Eating|Idle_Headlow|Idle_2/, walk: /^Walk/, speed: 1.0, roam: 12 },
  // Dogs: curs about the streets and yards (Quaternius's Shiba Inu as is, and the Husky darkened to a brown mastiff).
  dog: { file: 'assets/models/wild/ShibaInu.gltf', height: 0.62, idle: /^Idle$|Idle_2$|Eating/, walk: /^Walk/, speed: 1.3, roam: 14 },
  mastiff: { file: 'assets/models/wild/Husky.gltf', tint: 0x6a4a32, height: 0.72, idle: /^Idle$|Idle_2_HeadLow|Eating/, walk: /^Walk/, speed: 1.1, roam: 10 },
};
// How many of each, and where: 'yard' (gardens and yards), 'street', 'field' (beyond the town).
const HERDS = [
  ['chicken', 'yard', 14, 4], ['goat', 'yard', 6, 2], ['horse', 'street', 8, 1], ['horse', 'field', 4, 2],
  ['sheep', 'field', 8, 6], ['cow', 'field', 5, 3], ['cow', 'river', 3, 2], ['goat', 'river', 3, 2],
  ['chicken', 'market', 4, 3], ['horse', 'market', 2, 1],
  ['dog', 'street', 7, 1], ['dog', 'market', 2, 2], ['mastiff', 'yard', 4, 1], ['mastiff', 'street', 3, 1], ['dog', 'river', 2, 1],
];
const FIRES = 7;
const SHY = 3; // metres animals keep from you
const CHIMNEYS = 50; // the most chimneys that smoke at once (about 1 house in 20 does)
const VIEW = 80; // animals further than this from you are hidden and not animated

const loader = new GLTFLoader();
const cache = new Map();
function loadModel(file, fallback) {
  if (!cache.has(file)) {
    const url = file.includes('/') ? file : DIR + file;
    cache.set(file, loader.loadAsync(url).then((gltf) => {
      // (None of these is metal: glTF's default metalness of 1 would render them black.)
      gltf.scene.traverse((o) => {
        if (o.isMesh && o.material && !o.material.userData.fixed) {
          o.material.metalness = 0;
          o.material.userData.fixed = true;
        }
      });
      return gltf;
    }).catch(() => (fallback ? loadModel(fallback) : null)));
  }
  return cache.get(file);
}

// Ships (Quaternius's Ships pack, CC0; assets/models/ships): OBJ with plain colours.
const ships = new Map();
function loadShip(name) {
  if (!ships.has(name)) {
    ships.set(name, new MTLLoader().setPath('assets/models/ships/').loadAsync(name + '.mtl')
      .then((m) => {
        m.preload();
        return new OBJLoader().setMaterials(m).setPath('assets/models/ships/').loadAsync(name + '.obj');
      })
      .catch(() => null));
  }
  return ships.get(name);
}
// Where ships lie: on the Avon below Bristol Bridge (the Back and Welsh Back) and in the Frome's Reach by the Quay.
// [lat, lon, radius (m) to look in, [kind, count]...]; kinds: [file, length (m), beam (m), how deep it sits (m)].
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _pc = new THREE.Vector3();
const _pz = new THREE.Vector3(0, 0, 1);
const SHIP_KINDS = { ship: ['sail-ship', 22, 6, 1.4], sail: ['boat-sail', 9, 3, 0.5], boat: ['boat', 5, 2, 0.25] };
const HARBOURS = [
  [51.4522, -2.5924, 260, [['ship', 7], ['sail', 6], ['boat', 7]]],
  [51.4548, -2.5970, 140, [['ship', 4], ['sail', 3], ['boat', 5]]],
  [51.4505, -2.5935, 200, [['ship', 3], ['sail', 3], ['boat', 3]]],
  [51.4561, -2.5964, 40, [['boat', 2]]],
];

// A seeded random sequence, so the town looks the same each visit.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// An animal: a model scaled to its height, standing on its feet, facing +z, with its clips.
function makeAnimal(gltf, kind) {
  const spec = KINDS[kind];
  const model = SkeletonUtils.clone(gltf.scene);
  if (spec.tint && !spec.loaded) {
    model.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.color?.multiply(new THREE.Color(spec.tint));
      }
    });
  }
  // (Precisely, from the skinned vertices: the plain box of these models' skinned meshes is that of their geometry
  // before the armature's 1/100 scale, which made every animal a hundredth of its size: heard but never seen.)
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const size = box.getSize(new THREE.Vector3());
  const s = spec.height / Math.max(size.y, 1e-6);
  model.scale.multiplyScalar(s);
  const centre = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
  model.position.set(-centre.x, -box.min.y * s, -centre.z);
  const pivot = new THREE.Group();
  pivot.add(model);
  model.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false; // skinned meshes' bounds don't follow their animation
  });
  const mixer = new THREE.AnimationMixer(model);
  const clip = (re) => gltf.animations.find((a) => re.test(a.name.split('|').pop()));
  // (Of several idle clips, one at random.)
  const idles = gltf.animations.filter((a) => spec.idle.test(a.name.split('|').pop()));
  const idle = idles[Math.floor(Math.random() * idles.length)] ?? gltf.animations[0];
  const walk = clip(spec.walk) ?? idle;
  return { pivot, mixer, idle: idle && mixer.clipAction(idle), walk: walk && mixer.clipAction(walk) };
}

// A bird: a body and two wings, flapping. Gulls white and grey, crows black.
function makeBird(gull) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: gull ? 0xe8e8e4 : 0x18181a, roughness: 0.8, side: THREE.DoubleSide });
  const wingMat = new THREE.MeshStandardMaterial({ color: gull ? 0xb8bcc0 : 0x111113, roughness: 0.8, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 2, 6).rotateX(Math.PI / 2), mat);
  g.add(body);
  const wings = [-1, 1].map((side) => {
    const shape = new THREE.Shape([new THREE.Vector2(0, 0.08), new THREE.Vector2(0.55 * side, 0.02), new THREE.Vector2(0.5 * side, -0.08), new THREE.Vector2(0, -0.1)]);
    const w = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2), wingMat);
    const pivot = new THREE.Group();
    pivot.add(w);
    g.add(pivot);
    return { pivot, side };
  });
  g.scale.setScalar(gull ? 1.2 : 0.9);
  return { g, wings };
}

// A fish, silver, about 40 cm.
function makeFish() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xa8b4bc, roughness: 0.3, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat);
  body.scale.set(0.35, 0.45, 1);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 4).rotateX(-Math.PI / 2).translate(0, 0, -0.24), mat);
  const g = new THREE.Group();
  g.add(body, tail);
  return g;
}

const _s = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
let glowTex = null; // (shared: one texture, not one per reload)
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,190,110,1)');
  grd.addColorStop(1, 'rgba(255,140,60,0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.userData.shared = true;
  return glowTex;
}

// Flames: a few additive cones that flicker, and a glow that shows after dark.
function makeFlames() {
  const g = new THREE.Group();
  const cols = [0xff6a1a, 0xffa030, 0xffd070];
  const flames = cols.map((c, k) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.32 - k * 0.07, 1.1 - k * 0.2, 7).translate(0, (1.1 - k * 0.2) / 2, 0),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(m);
    return m;
  });
  const glowTex = (makeFlames.tex ??= (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,170,80,1)');
    grd.addColorStop(1, 'rgba(255,120,40,0)');
    x.fillStyle = grd;
    x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.userData.shared = true;
    return t;
  })());
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3 }));
  glow.scale.set(5, 5, 1);
  glow.position.y = 0.6;
  g.add(glow);
  return { g, flames, glow };
}

// The builder: one item holding the animals, birds and fish (anchored at the window's centre, in metres OD), plus an
// item per chimney and fire (each with its own smoke).
export function townLife(ctx, { eras, dayUniforms }) {
  const map = ctx.map;
  const mpp = ctx.metresPerPixel;
  const a = { i: (RES - 1) / 2, j: (RES - 1) / 2 };
  const ground = (i, j) => {
    const g = map.ground ? map.sample(i, j, map.ground) : NaN;
    return Number.isFinite(g) ? g : map.sample(i, j, map.grids.terrain);
  };
  const toPx = (x, z) => [a.i + x / mpp, a.j + z / mpp];
  const toM = (i, j) => [(i - a.i) * mpp, (j - a.j) * mpp];
  const water = () => map.waterNow?.() ?? 0;
  const inside = (i, j) => i > 2 && j > 2 && i < RES - 3 && j < RES - 3;
  const wet = (i, j) => {
    const b = map.bristol;
    const k = Math.round(j) * RES + Math.round(i);
    // (The rivers' and harbour's outlines, and wherever the tide has flooded: not just low ground, which may be dry.)
    // (A footbridge over it is dry.)
    return !!(b?.frome?.[k] || b?.harbour?.[k] || b?.pool?.[k] || map.seaMask?.[k]) && !map.onFootbridge?.(i, j);
  };
  const free = (i, j) => inside(i, j) && !map.blockedAt(i, j) && !wet(i, j);

  const root = new THREE.Group();
  const item = { ...a, model: { group: root, top: 30 }, era: eras, trueSize: true, baseAlt: 0, far: true };
  const animals = [];
  const birds = [];
  const fish = [];
  const smokers = [];
  let ready = false;
  let lampPoints = null;
  const shipsAfloat = [];
  const docks = []; // where ships lie alongside a quay: { ship, qi, qj (the quay by the gangplank), pi, pj (the cargo) }
  map.townDocks = docks;
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.9 });
  let last = null;

  // The market places' outlines (window pixels), and a test for a point in one.
  const marketPolys = () => MARKETS.map((mk) => mk.poly.map(([lat, lon]) => {
    const w = map.source.toWindow(lat, lon);
    return [w.i, w.j];
  }));
  const inPoly = (i, j, poly) => {
    let r = false;
    for (let n = 0, m = poly.length - 1; n < poly.length; m = n++) if ((poly[n][1] > j) !== (poly[m][1] > j) && i < ((poly[m][0] - poly[n][0]) * (j - poly[n][1])) / (poly[m][1] - poly[n][1]) + poly[n][0]) r = !r;
    return r;
  };
  // Places of each sort, from the town's masks (when they're ready): window pixels.
  const places = (where, rand, n) => {
    const b = map.bristol;
    const era = map.era;
    const yard = b?.gardens?.[era];
    const town = b?.towns?.[era];
    const street = b?.streetMasks?.[era];
    const out = [];
    for (let tries = 0; out.length < n && tries < n * 400; tries++) {
      const i = 4 + rand() * (RES - 8);
      const j = 4 + rand() * (RES - 8);
      const k = Math.round(j) * RES + Math.round(i);
      const solid = map.objects.solid;
      const byHouse = () => [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([di, dj]) => solid?.[k + dj * RES + di]);
      const ok = where === 'market' ? marketPolys().some((poly) => inPoly(i, j, poly)) : where === 'river' ? b?.nearWater?.[k] > 0.05 && !b?.fromeQuay?.[k] && !street?.[k] : where === 'front' ? street?.[k] > 0 && byHouse() : where === 'yard' ? yard?.[k] > 0 : where === 'street' ? street?.[k] > 0 : where === 'field' ? town && !town[k] : where === 'roof' ? map.objects.solid?.[k] : where === 'water' ? wet(i, j) && !map.blockedAt(i, j) : true;
      if (ok && (where === 'roof' || where === 'water' || free(i, j))) out.push([i, j]);
    }
    return out;
  };

  const setup = () => {
    const rand = rng(1400);
    // Animals, in small groups.
    for (const [kind, where, groups, each] of HERDS) {
      for (const [hi, hj] of places(where, rand, groups)) {
        for (let n = 0; n < each; n++) {
          const spot = { i: hi + (rand() - 0.5) * 3 / mpp, j: hj + (rand() - 0.5) * 3 / mpp };
          if (!free(spot.i, spot.j)) Object.assign(spot, { i: hi, j: hj });
          // (Those of the fields, yards and riverside keep off the streets; those of the streets and markets don't.)
          const animal = { kind, home: [hi, hj], i: spot.i, j: spot.j, heading: rand() * Math.PI * 2, state: 'idle', until: rand() * 6, target: null, rand, roads: where === 'street' || where === 'market' };
          animals.push(animal);
          // (Its model is made the first time you come near it, not all at once here: making ~170 took a fifth of a
          // second on the Quest at every reload.)
          loadModel(KINDS[kind].file, KINDS[kind].fallback).then((gltf) => {
            animal.gltf = gltf;
          });
        }
      }
    }
    map.townAnimals = animals; // (for their calls: ambience.js)
    map.animalCount = animals.reduce((c, an) => ((c[an.kind] = (c[an.kind] ?? 0) + 1), c), { total: animals.length });
    // Birds: gulls over the water, crows over the roofs, wheeling in flocks.
    const watery = places('water', rand, 3);
    const roofs = places('roof', rand, 2);
    for (const [c, gull] of [...watery.map((w) => [w, true]), ...roofs.map((r) => [r, false])]) {
      const n = gull ? 6 : 5;
      for (let k = 0; k < n; k++) {
        const b = makeBird(gull);
        root.add(b.g);
        birds.push({ ...b, c, r: 18 + rand() * 30, h: 18 + rand() * 22, w: (gull ? 0.25 : 0.32) * (rand() < 0.5 ? 1 : -1), ph: rand() * Math.PI * 2, flap: 6 + rand() * 4 });
      }
    }
    // Fish, jumping now and then in the river.
    const pools = places('water', rand, 8);
    for (let k = 0; k < 4; k++) {
      const f = { g: new THREE.Group(), pools, t: -rand() * 6, rand };
      f.g.visible = false;
      root.add(f.g);
      fish.push(f);
      loadModel('fish-b.glb').then((gltf) => {
        if (!gltf) return f.g.add(makeFish());
        const m = SkeletonUtils.clone(gltf.scene); // skinned: a plain clone() left it bound to the original skeleton, drawn giant at the world origin (on you)
        const box = new THREE.Box3().setFromObject(m);
        const sz = box.getSize(new THREE.Vector3());
        const along = Math.max(sz.x, sz.z, 1e-6);
        m.scale.multiplyScalar(0.4 / along);
        if (sz.x > sz.z) m.rotation.y = Math.PI / 2; // nose along +z
        f.g.add(m);
      });
    }
    // The market places (bristol.js MARKETS): stalls in rows with aisles between, along the place's longest side;
    // here and there a wagon, crates and barrels.
    for (const mk of MARKETS) {
      const poly = mk.poly.map(([lat, lon]) => {
        const w = map.source.toWindow(lat, lon);
        return [w.i, w.j];
      });
      if (!poly.some(([i, j]) => inside(i, j))) continue;
      let best = 0;
      let ang = 0;
      poly.forEach((p, k) => {
        const q = poly[(k + 1) % poly.length];
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (len > best) [best, ang] = [len, Math.atan2(q[1] - p[1], q[0] - p[0])];
      });
      const ci = poly.reduce((t, p) => t + p[0], 0) / poly.length;
      const cj = poly.reduce((t, p) => t + p[1], 0) / poly.length;
      const [ux, uz] = [Math.cos(ang), Math.sin(ang)];
      const within = (i, j, margin) => {
        let r = false;
        for (let k = 0, n = poly.length; k < n; k++) {
          const [x1, y1] = poly[k];
          const [x2, y2] = poly[(k + 1) % n];
          if ((y1 > j) !== (y2 > j) && i < ((x2 - x1) * (j - y1)) / (y2 - y1) + x1) r = !r;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const t = Math.max(0, Math.min(1, ((i - x1) * dx + (j - y1) * dy) / (dx * dx + dy * dy || 1)));
          if (Math.hypot(x1 + dx * t - i, y1 + dy * t - j) * mpp < margin) return false;
        }
        return r;
      };
      // Every spot on the grid that's in the place and clear, then as many as wanted, picked at random.
      const spots = [];
      // (The St Nicholas market place is packed: stalls closer together, with narrower aisles.)
      const [dAlong, dAcross] = [mk.along ?? 5, mk.across ?? 6];
      for (let row = -14; row <= 14; row++) {
        for (let col = -20; col <= 20; col++) {
          const along = col * dAlong + (row % 2 ? dAlong / 2 : 0);
          const across = row * dAcross;
          const i = ci + (ux * along - uz * across) / mpp;
          const j = cj + (uz * along + ux * across) / mpp;
          if (within(i, j, 3) && free(i, j)) spots.push([i, j, row]);
        }
      }
      for (let k = spots.length - 1; k > 0; k--) {
        const r = Math.floor(rand() * (k + 1));
        [spots[k], spots[r]] = [spots[r], spots[k]];
      }
      // (The brightly awninged stalls (market-stalls, a cluster of stalls in one model) were half their true size:
      // three in four are now full size, needing twice the room; the rest left small, as booths.)
      const taken = [];
      let n = 0;
      for (const [i, j, row] of spots) {
        if (n >= mk.stalls) break;
        const face = -ang + (row % 2 ? Math.PI : 0) + Math.PI / 2;
        // (Kinds: a fifth the brightly awninged stalls (there were too many: the user), the rest plain stands and
        // wagons.)
        const kind = rand();
        const big = kind < 0.2 && rand() < 0.75;
        const r = big ? 3.6 : 1.8; // metres it needs round it
        if (taken.some(([ti, tj, tr]) => Math.hypot(ti - i, tj - j) * mpp < tr + r - 0.6)) continue;
        if (big && !within(i, j, 4)) continue;
        taken.push([i, j, r]);
        n++;
        if (kind < 0.2) prop('market-stalls', i, j, big ? 6.8 : 3.4, 0, face, 'length');
        else if (kind < 0.7) prop('market-stand', i, j, 3.0, 0, face, 'length');
        else prop('assets/models/megakit/Prop_Wagon.gltf', i, j, 3.2, 0, face + Math.PI / 2, 'length');
        for (let c = 0; c < (mk.along ? 1 : 2); c++) {
          const off = (big ? 3.8 : 1.8) + c * 0.9;
          const oi = i + (ux * off + uz * 1.2) / mpp;
          const oj = j + (uz * off - ux * 1.2) / mpp;
          if (free(oi, oj)) prop(rand() < 0.5 ? 'crate' : 'barrel-a', oi, oj, rand() < 0.5 ? 0.75 : 0.9, 0, rand() * 6, 'height');
        }
      }
    }

    // Ships, moored where the water is wide enough for them, lying along the channel.
    const runs = (i, j, ang) => {
      // How far the water goes each way along a direction (metres), up to 40 m.
      let a1 = 0;
      let a2 = 0;
      for (; a1 < 40 && wet(i + (Math.cos(ang) * a1) / mpp, j + (Math.sin(ang) * a1) / mpp); a1 += 1);
      for (; a2 < 40 && wet(i - (Math.cos(ang) * a2) / mpp, j - (Math.sin(ang) * a2) / mpp); a2 += 1);
      return [a1, a2];
    };
    const moored = [];
    const bridge = map.source.toWindow(51.45363, -2.59135); // (not under Bristol Bridge)
    for (const [lat, lon, radius, wants] of HARBOURS) {
      const c = map.source.toWindow(lat, lon);
      for (const [kind, count] of wants) {
        const [file, len, beam, sink] = SHIP_KINDS[kind];
        let got = 0;
        for (let tries = 0; tries < 400 && got < count; tries++) {
          const r = Math.sqrt(rand()) * radius;
          const t = rand() * Math.PI * 2;
          const i = c.i + (Math.cos(t) * r) / mpp;
          const j = c.j + (Math.sin(t) * r) / mpp;
          if (!inside(i, j) || !wet(i, j) || Math.hypot(i - bridge.i, j - bridge.j) * mpp < 35) continue;
          // The channel's line: the direction with the longest run of water.
          let best = -1;
          let ang = 0;
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI;
            const [p, q] = runs(i, j, a);
            if (p + q > best) [best, ang] = [p + q, a];
          }
          const [along1, along2] = runs(i, j, ang);
          const [side1, side2] = runs(i, j, ang + Math.PI / 2);
          if (along1 < len / 2 + 1 || along2 < len / 2 + 1 || side1 < beam / 2 + 0.5 || side2 < beam / 2 + 0.5) continue;
          if (moored.some(([mi, mj, ml]) => Math.hypot(mi - i, mj - j) * mpp < (ml + len) / 2 + 2)) continue;
          moored.push([i, j, len]);
          got++;
          const holder = new THREE.Group();
          const [x, z] = toM(i, j);
          holder.position.set(x, water(), z);
          holder.rotation.y = -ang + (rand() < 0.5 ? Math.PI : 0);
          root.add(holder);
          const sh = { g: holder, ph: rand() * 6, i, j, sink, kind, heel: rand() < 0.5 ? 1 : -1, len, beam };
          shipsAfloat.push(sh);
          // The bigger vessels lie alongside a quay: a gangplank from the quay to the ship's side, cargo piled on the
          // quay behind it, and dock workers carrying it between them (people.js, from map.townDocks).
          if (kind !== 'boat') {
            let dock = null;
            for (const sd of [1, -1]) {
              const px = Math.cos(ang + Math.PI / 2) * sd;
              const pz = Math.sin(ang + Math.PI / 2) * sd;
              for (let d = beam / 2; d < 16; d += 0.5) {
                const qi = i + (px * d) / mpp;
                const qj = j + (pz * d) / mpp;
                if (wet(qi, qj)) continue;
                const [ki, kj] = [qi + (px * 1.2) / mpp, qj + (pz * 1.2) / mpp]; // a step onto the quay
                const [pi, pj] = [qi + (px * 5) / mpp, qj + (pz * 5) / mpp]; // the cargo, further back
                if (free(ki, kj) && free(pi, pj) && (!dock || d < dock.d)) dock = { d, qi: ki, qj: kj, pi, pj, px, pz, sd };
                break;
              }
            }
            if (dock) {
              sh.dock = dock;
              docks.push({ ship: sh, qi: dock.qi, qj: dock.qj, pi: dock.pi, pj: dock.pj });
              const plank = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 1), plankMat);
              root.add(plank);
              sh.plank = plank;
              const along = [Math.cos(ang), Math.sin(ang)];
              for (let c = 0; c < 5; c++) {
                const off = (c - 2) * 0.95;
                const oi = dock.pi + (along[0] * off + dock.px * (c % 2) * 0.9) / mpp;
                const oj = dock.pj + (along[1] * off + dock.pz * (c % 2) * 0.9) / mpp;
                if (free(oi, oj)) prop(c % 2 ? 'barrel-a' : 'crate', oi, oj, c % 2 ? 0.9 : 0.75, 0, rand() * 6, 'height');
              }
            }
          }
          loadShip(file).then((obj) => {
            if (!obj) return;
            const m = obj.clone();
            const box = new THREE.Box3().setFromObject(m);
            const sz = box.getSize(new THREE.Vector3());
            const k = len / Math.max(sz.x, sz.z, 1e-6);
            m.scale.multiplyScalar(k);
            const ctr = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
            m.position.set(-ctr.x, -box.min.y * k - sink, -ctr.z);
            const spin = new THREE.Group(); // its length along the holder's x
            spin.add(m);
            if (sz.z > sz.x) spin.rotation.y = Math.PI / 2;
            holder.add(spin);
          });
        }
      }
    }

    // Street clutter against the house fronts: barrels, crates, a cart or two; lanterns hung by doors (lit at
    // night); wells in a few yards.
    const fronts = places('front', rand, 70);
    fronts.forEach(([i, j], n) => {
      const kind = n < 18 ? 'lantern' : n < 44 ? (n % 2 ? 'barrel-a' : 'barrel-b') : n < 62 ? 'crate' : 'cart';
      if (kind === 'lantern') {
        // Hung from a post against the house front (they hung in mid-air a couple of metres out): the nearest wall
        // pixel, the post 0.25 m out from it, and the lantern 1.1 m out on the post's arm, towards the street.
        const solid = map.objects.solid;
        let best = null;
        for (let dj = -3; dj <= 3; dj++) {
          for (let di = -3; di <= 3; di++) {
            const q = Math.round(j + dj) * RES + Math.round(i + di);
            const d = Math.hypot(di, dj);
            if (solid?.[q] && (!best || d < best[2])) best = [Math.round(i + di), Math.round(j + dj), d];
          }
        }
        if (!best || best[2] < 0.5) return;
        const [wi, wj] = best;
        const d = Math.hypot(i - wi, j - wj);
        const [nx, nz] = [(i - wi) / d, (j - wj) / d];
        i = wi + nx * (1.1 / mpp);
        j = wj + nz * (1.1 / mpp);
        lampPosts.push({ i: wi + nx * (0.25 / mpp), j: wj + nz * (0.25 / mpp), g: ground(i, j), turn: Math.atan2(nx, nz) });
      }
      const size = { lantern: 0.45, 'barrel-a': 0.9, 'barrel-b': 0.9, crate: 0.75, cart: 2.6 }[kind];
      const lift = kind === 'lantern' ? 2.5 : 0;
      prop(kind === 'lantern' ? 'lantern-hanging' : kind, i, j, size, lift, rand() * Math.PI * 2, kind === 'cart' ? 'length' : 'height', kind === 'lantern');
      if (kind === 'barrel-a' && rand() < 0.5) prop('barrel-b', i + 0.9 / mpp, j + 0.3 / mpp, 0.9, 0, rand() * 6, 'height');
    });
    for (const [i, j] of places('yard', rand, 5)) prop('well', i, j, 2.4, 0, rand() * 6, 'height');
    // Woodpiles stacked against the house fronts (firewood for every hearth), along the wall.
    for (const [i0, j0] of places('front', rand, 40)) {
      const solid = map.objects.solid;
      let best = null;
      for (let dj = -3; dj <= 3; dj++) {
        for (let di = -3; di <= 3; di++) {
          const q = Math.round(j0 + dj) * RES + Math.round(i0 + di);
          const d = Math.hypot(di, dj);
          if (solid?.[q] && (!best || d < best[2])) best = [Math.round(i0 + di), Math.round(j0 + dj), d];
        }
      }
      if (!best || best[2] < 0.5) continue;
      const [wi, wj, d] = best;
      const [nx, nz] = [(i0 - wi) / d, (j0 - wj) / d]; // out from the wall
      const i = wi + nx * (1.0 / mpp);
      const j = wj + nz * (1.0 / mpp);
      if (!free(i, j)) continue;
      woodpiles.push({ i, j, turn: Math.atan2(nx, nz) + (rand() - 0.5) * 0.1, len: 1.2 + rand() * 0.8, high: 0.6 + rand() * 0.5 });
    }
    buildWoodpiles();
    buildLampPosts();
    ready = true;
  };

  // A prop from the packs at window pixel (i, j), scaled so its height (or length) is `size` metres.
  const lampMat = nightLit(new THREE.PointsMaterial({ color: 0xffb060, size: 1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTexture() }), 'glow');
  const lamps = [];
  map.townLamps = lamps; // (for tests)
  // Props (stalls, wagons, crates, barrels, wells, lanterns...): each kind drawn as instances, a draw call per part
  // of its model however many there are. (All are placed during setup, before any model has loaded.)
  const batches = new Map();
  // What stands on the ground (stalls, wagons, carts, crates, barrels, wells) is in the way of the townsfolk and
  // the animals: each a rectangle (metres, in this item's frame), filed in a coarse grid of cells. map.propBlocked
  // tests a window pixel against them, with a margin for a body's width.
  const CELL = 8; // pixels
  const cells = new Map();
  const addObstacle = (x, z, hx, hz, turn) => {
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    const ob = { x, z, hx, hz, c, s: sn };
    const r = Math.hypot(hx, hz) + 0.5;
    const [i0, j0] = toPx(x - r, z - r);
    const [i1, j1] = toPx(x + r, z + r);
    for (let cj = Math.floor(j0 / CELL); cj <= Math.floor(j1 / CELL); cj++) {
      for (let ci = Math.floor(i0 / CELL); ci <= Math.floor(i1 / CELL); ci++) {
        const key = cj * 1000 + ci;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(ob);
      }
    }
  };
  map.propBlocked = (i, j, margin = 0.3) => {
    const list = cells.get(Math.floor(j / CELL) * 1000 + Math.floor(i / CELL));
    if (!list) return false;
    const [x, z] = toM(i, j);
    for (const ob of list) {
      const dx = x - ob.x;
      const dz = z - ob.z;
      // (Into the prop's own frame: the inverse of its turn about y.)
      const lx = dx * ob.c - dz * ob.s;
      const lz = dx * ob.s + dz * ob.c;
      if (Math.abs(lx) < ob.hx + margin && Math.abs(lz) < ob.hz + margin) return true;
    }
    return false;
  };
  function prop(file, i, j, size, lift, turn, by, lamp) {
    if (!batches.has(file)) {
      batches.set(file, []);
      loadModel(file.includes('/') ? file : file + '.glb').then((gltf) => {
        const list = batches.get(file);
        if (!gltf || !list.length) return;
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(scene);
        const sz = box.getSize(new THREE.Vector3());
        const meshes = [];
        scene.traverse((o) => {
          if (o.isMesh) meshes.push(o);
        });
        const at = list.map((pl) => {
          const k = pl.size / Math.max(pl.by === 'length' ? Math.max(sz.x, sz.z) : sz.y, 1e-6);
          const [x, z] = toM(pl.i, pl.j);
          const y = ground(pl.i, pl.j) + pl.lift - box.min.y * k;
          if (pl.lamp) lamps.push(x, y + pl.size * 0.4, z);
          if (!pl.lift) {
            // Its footprint, turned as it is (the box's centre may be off the model's origin).
            const ctr = box.getCenter(new THREE.Vector3()).multiplyScalar(k).applyAxisAngle(_yAxis, pl.turn);
            addObstacle(x + ctr.x, z + ctr.z, (sz.x * k) / 2, (sz.z * k) / 2, pl.turn);
          }
          return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.turn), new THREE.Vector3(k, k, k));
        });
        for (const o of meshes) {
          const im = new THREE.InstancedMesh(o.geometry, o.material, at.length);
          at.forEach((m, n) => im.setMatrixAt(n, new THREE.Matrix4().multiplyMatrices(m, o.matrixWorld)));
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
          root.add(im);
        }
      });
    }
    batches.get(file).push({ i, j, size, lift, turn, by, lamp });
  }

  // Woodpiles: split logs in a stack, made here; drawn as instances (one per pile size class).
  const woodpiles = [];
  const logMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.95 });
  function buildWoodpiles() {
    if (!woodpiles.length) return;
    // A stack 1 m long, 1 m high, 0.8 m deep (scaled to each pile): rows of logs, ends to the street.
    const logs = [];
    for (let row = 0; row < 6; row++) {
      for (let c = 0; c < 9 - (row % 2); c++) {
        const r = 0.055 + ((row * 7 + c * 3) % 5) * 0.004;
        logs.push(new THREE.CylinderGeometry(r, r, 0.8, 6).rotateX(Math.PI / 2).translate(-0.45 + c * 0.11 + (row % 2) * 0.055, 0.06 + row * 0.105, 0));
      }
    }
    const geo = mergeGeometries(logs);
    const im = new THREE.InstancedMesh(geo, logMat, woodpiles.length);
    woodpiles.forEach((w, n) => {
      const [x, z] = toM(w.i, w.j);
      // (Its depth across the wall, its length along it: local x along the wall.)
      const q = new THREE.Quaternion().setFromAxisAngle(_yAxis, w.turn);
      im.setMatrixAt(n, new THREE.Matrix4().compose(new THREE.Vector3(x, ground(w.i, w.j), z), q, new THREE.Vector3(w.len, w.high / 0.63, 1)));
      addObstacle(x, z, w.len / 2, 0.4, w.turn);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    root.add(im);
  }

  // The lanterns' posts: an oak post with an arm out over the street (the lantern on its end, 0.85 m out) and a
  // brace under the arm; one instanced mesh. (Local +z is out from the wall.)
  const lampPosts = [];
  const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 });
  function buildLampPosts() {
    if (!lampPosts.length) return;
    const brace = new THREE.BoxGeometry(0.06, 0.06, 0.62);
    brace.rotateX(-Math.PI / 4).translate(0, 2.78, 0.22); // (low end on the post, high under the arm)
    const geo = mergeGeometries([
      new THREE.BoxGeometry(0.14, 3.45, 0.14).translate(0, 3.15 - 3.45 / 2, 0), // (from 0.3 m below the ground)
      new THREE.BoxGeometry(0.08, 0.08, 1.0).translate(0, 3.04, 0.43), // the arm, to just past the lantern's hook
      brace,
      new THREE.BoxGeometry(0.02, 0.1, 0.02).translate(0, 2.97, 0.85), // the hook
    ]);
    const im = new THREE.InstancedMesh(geo, postMat, lampPosts.length);
    im.name = 'lamp posts';
    lampPosts.forEach((pp, n) => {
      const [x, z] = toM(pp.i, pp.j);
      const q = new THREE.Quaternion().setFromAxisAngle(_yAxis, pp.turn);
      im.setMatrixAt(n, new THREE.Matrix4().compose(new THREE.Vector3(x, pp.g, z), q, new THREE.Vector3(1, 1, 1)));
      addObstacle(x, z, 0.12, 0.12, pp.turn);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    root.add(im);
  }

  item.dispose = () => freeSkeletons(animals.map((an) => an.pivot));
  item.animate = (t) => {
    const dt = last == null ? 0 : Math.min(0.1, t - last);
    last = t;
    if (!root.visible) return;
    if (!ready) {
      if (map.bristol?.gardens?.[map.era] && map.objects.solid) setup();
      return;
    }
    const life = map.game?.life;
    const me = life?.state === 'on' ? life.pixelOf(map.game.head) : null; // the window pixel you're standing at
    let made = 0;
    for (const an of animals) {
      // Only those near you at life size are in the scene at all (on the table, where they'd be a millimetre long,
      // none): each is a skinned model with some 25 bones, and even hidden ones cost every frame (their matrices).
      const near = !!me && Math.hypot(an.i - me.i, an.j - me.j) * mpp < VIEW;
      if (!an.pivot) {
        // (Made when first near, a few a frame.)
        if (!near || !an.gltf || made >= 3) continue;
        made++;
        Object.assign(an, makeAnimal(an.gltf, an.kind));
        an.idle?.play();
        an.mixer.update(an.rand() * 3);
      }
      if (near !== !!an.pivot.parent) {
        if (near) root.add(an.pivot);
        else an.pivot.removeFromParent();
      }
      if (!near) continue;
      const spec = KINDS[an.kind];
      an.until -= dt;
      // They keep their distance from you (walking up to the camera, a horse's neck filled the view): one that finds
      // you within SHY metres moves off, away from you; none walks closer than that; and one you stand right on
      // isn't drawn.
      const mine = me ? Math.hypot(an.i - me.i, an.j - me.j) * mpp : Infinity;
      an.pivot.visible = mine > 1.2;
      if (mine < SHY && (an.state === 'idle' || !an.fleeing)) {
        const away = Math.atan2(an.j - me.j, an.i - me.i);
        an.target = [an.i + (Math.cos(away) * (SHY + 3)) / mpp, an.j + (Math.sin(away) * (SHY + 3)) / mpp];
        an.fleeing = true;
        if (an.state !== 'walk') {
          an.state = 'walk';
          an.idle?.fadeOut(0.3);
          an.walk?.reset().fadeIn(0.3).play();
        }
        an.until = 8;
      }
      if (an.state === 'idle' && an.until <= 0) {
        // Off somewhere nearby.
        const ang = an.rand() * Math.PI * 2;
        const d = (0.3 + an.rand() * 0.7) * spec.roam / mpp;
        an.target = [an.home[0] + Math.cos(ang) * d, an.home[1] + Math.sin(ang) * d];
        an.state = 'walk';
        an.until = 12;
        an.idle?.fadeOut(0.3);
        an.walk?.reset().fadeIn(0.3).play();
      } else if (an.state === 'walk') {
        const dx = an.target[0] - an.i;
        const dj = an.target[1] - an.j;
        const d = Math.hypot(dx, dj);
        const step = (spec.speed * dt) / mpp;
        const ni = an.i + (dx / (d || 1)) * Math.min(step, d);
        const nj = an.j + (dj / (d || 1)) * Math.min(step, d);
        const closer = me && Math.hypot(ni - me.i, nj - me.j) * mpp < Math.min(SHY, mine);
        const offRoad = !an.roads && map.bristol?.streetMasks?.[map.era]?.[Math.round(nj) * RES + Math.round(ni)] > 0;
        // (Not into a stall or a cart; one that finds itself in one may walk out.)
        const blocked = !free(ni, nj) || closer || offRoad || (map.propBlocked(ni, nj, 0.2) && !map.propBlocked(an.i, an.j, 0.2));
        if (!blocked) {
          an.i = ni;
          an.j = nj;
          const want = Math.atan2(dx, dj);
          let turn = ((want - an.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          an.heading += turn * Math.min(1, dt * 4);
        }
        if (blocked || d < 0.2 || an.until <= 0) {
          an.state = 'idle';
          an.fleeing = false;
          an.until = 3 + an.rand() * 9;
          an.walk?.fadeOut(0.3);
          an.idle?.reset().fadeIn(0.3).play();
        }
      }
      const [x, z] = toM(an.i, an.j);
      an.pivot.position.set(x, ground(an.i, an.j), z);
      an.pivot.rotation.y = an.heading;
      an.mixer.update(dt);
    }
    // The lanterns' glow (point sizes are in world units, so follow the scale).
    if (lamps.length / 3 !== (lampPoints?.geometry.attributes.position.count ?? 0)) {
      if (!lampPoints) {
        lampPoints = new THREE.Points(new THREE.BufferGeometry(), lampMat);
        lampPoints.frustumCulled = false;
        root.add(lampPoints);
      }
      lampPoints.geometry.setAttribute('position', new THREE.Float32BufferAttribute(lamps, 3));
    }
    lampMat.size = 2 * root.getWorldScale(_s).x;
    // Ships rock gently at their moorings while afloat. Before the Floating Harbour the tide (TIDE) runs out to a
    // trickle in the channel: as the water drops below a ship's keel it settles on the mud, heeling over a little,
    // and stays there, still, until the tide lifts it again.
    for (const sh of shipsAfloat) {
      const level = water();
      const bed = ground(sh.i, sh.j);
      const afloat = level - sh.sink >= bed;
      const dry = Math.min(1, Math.max(0, (bed + sh.sink - level) / 1.5)); // how far it has settled
      sh.g.position.y = afloat ? level + Math.sin(t * 0.7 + sh.ph) * 0.06 : bed + sh.sink;
      sh.g.rotation.z = afloat ? Math.sin(t * 0.5 + sh.ph) * 0.02 : sh.heel * 0.11 * dry;
      if (sh.plank) {
        // The gangplank: from the quay's edge up (or down) to the ship's rail.
        const { qi, qj, px, pz } = sh.dock;
        const [qx, qz] = toM(qi, qj);
        const from = _pa.set(qx, ground(qi, qj) + 0.05, qz);
        const rail = sh.g.position.y + (sh.kind === 'ship' ? 2.2 : 0.9) - sh.sink;
        const to = _pb.set(sh.g.position.x + px * sh.beam * 0.42, rail, sh.g.position.z + pz * sh.beam * 0.42);
        sh.plank.position.copy(from).add(to).multiplyScalar(0.5);
        sh.plank.scale.z = from.distanceTo(to) + 0.3;
        sh.plank.quaternion.setFromUnitVectors(_pz, _pc.copy(to).sub(from).normalize()); // (in the town's own frame)
      }
    }
    // Birds wheel round their centres, flapping and gliding.
    for (const b of birds) {
      const [cx, cz] = toM(...b.c);
      const ang = b.ph + t * b.w;
      const x = cx + Math.cos(ang) * b.r;
      const z = cz + Math.sin(ang) * b.r;
      const y = ground(...b.c) + b.h + Math.sin(t * 0.5 + b.ph) * 2;
      b.g.position.set(x, y, z);
      b.g.rotation.set(0, -ang - (b.w > 0 ? 0 : Math.PI), b.w > 0 ? -0.3 : 0.3);
      const glide = Math.sin(t * 0.3 + b.ph) > 0.2;
      const f = glide ? 0.1 : Math.sin(t * b.flap + b.ph) * 0.6;
      for (const w of b.wings) w.pivot.rotation.z = w.side * f;
    }
    // Fish: every few seconds one leaps from the water in a short arc.
    for (const f of fish) {
      f.t += dt;
      if (f.t < 0 || !f.pools.length) {
        f.g.visible = false;
        continue;
      }
      if (!f.at) {
        const [pi, pj] = f.pools[Math.floor(f.rand() * f.pools.length)];
        f.at = [pi + (f.rand() - 0.5) * 6 / mpp, pj + (f.rand() - 0.5) * 6 / mpp];
        f.dir = f.rand() * Math.PI * 2;
      }
      const T = 0.7;
      const u = f.t / T;
      if (u > 1) {
        f.g.visible = false;
        f.t = -(2 + f.rand() * 7);
        f.at = null;
        continue;
      }
      const [x, z] = toM(...f.at);
      const along = (u - 0.5) * 1.4;
      f.g.visible = true;
      f.g.position.set(x + Math.sin(f.dir) * along, water() + Math.sin(u * Math.PI) * 0.7 - 0.1, z + Math.cos(f.dir) * along);
      f.g.rotation.set(-Math.cos(u * Math.PI) * 0.9, f.dir, 0);
    }
  };

  // Chimney smoke above the roofs, and fires in yards (each smoking). Each is placed once the masks are ready (until
  // then it belongs to no period, so it isn't shown).
  const smoke = (kind) => ({ i: a.i, j: a.j, model: { group: new THREE.Group(), top: 0 }, era: [], trueSize: true, baseAlt: 0, far: true, kind,
    smoke: kind === 'fire' ? { count: 120, color: 0x6a645c, opacity: 0.3, size: 6 } : { count: 110, color: 0xb4b2ae, opacity: 0.18, size: 8 } });
  for (let k = 0; k < CHIMNEYS; k++) smokers.push(smoke('chimney'));
  for (let k = 0; k < FIRES; k++) smokers.push(smoke('fire'));
  let placed = false;
  const place = () => {
    placed = true;
    const rand = rng(1066);
    // About one house in twenty has its fire lit, smoking from its chimney.
    const lit = (map.objects.chimneys ?? []).filter((c) => (c.seed * 91.7) % 1 < 0.05);
    const yards = places('yard', rand, FIRES);
    smokers.forEach((sm, n) => {
      const c = sm.kind === 'fire' ? null : lit[n];
      const p = sm.kind === 'fire' ? yards[n - CHIMNEYS] : c && [c.i, c.j];
      if (!p) return;
      [sm.i, sm.j] = p;
      sm.era = eras;
      const g = ground(...p);
      sm.model.top = sm.kind === 'fire' ? g + 0.9 : c.top + 0.3;
      if (sm.kind !== 'fire') return;
      const fl = makeFlames();
      fl.g.position.y = g;
      sm.model.group.add(fl.g);
      sm.flames = fl;
      loadModel('bonfire-a.glb').then((gltf) => {
        if (!gltf) return;
        const logs = gltf.scene.clone();
        const box = new THREE.Box3().setFromObject(logs);
        const sz = box.getSize(new THREE.Vector3());
        logs.scale.multiplyScalar(1.2 / Math.max(sz.x, sz.z, 1e-6));
        logs.position.y = g;
        sm.model.group.add(logs);
      });
    });
  };
  for (const sm of smokers) {
    sm.animate = (t) => {
      if (!placed && map.bristol?.gardens?.[map.era] && map.objects.solid) place();
      // Fires flicker, and glow brighter after dark.
      if (!sm.flames || !sm.model.group.visible) return;
      sm.flames.flames.forEach((m, k) => {
        m.scale.set(1 + 0.15 * Math.sin(t * 11 + k * 2), 0.8 + 0.35 * Math.abs(Math.sin(t * 7.3 + k * 1.7)), 1 + 0.15 * Math.cos(t * 9 + k));
      });
      sm.flames.glow.material.opacity = 0.15 + 0.6 * dayUniforms.uNight.value;
    };
  }
  return [item, ...smokers];
}
