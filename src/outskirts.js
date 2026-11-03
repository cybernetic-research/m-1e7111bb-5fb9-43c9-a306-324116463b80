import * as THREE from 'three';
import { natureParts } from './nature.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RES } from './terrain.js';
import { metreUVs } from './textures.js';

// Free the skeletons (their bones' textures) under these roots, in the scene or not.
function freeSkeletons(roots) {
  for (const r of roots) r?.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton?.dispose();
  });
}


// The outskirts of medieval Bristol (c.1400 and c.1650):
// - The edge of the world: the place's 2.4 km square ends in woodland, a wall of trees on all the land round its
//   edge (real trees from Quaternius's Stylized Nature MegaKit, CC0, in front; a continuous canopy behind them), which
//   you can't walk through. Wild animals live in and just inside it: deer and stags (which may be hunted: point and
//   pull the trigger), wolves and bears (which come for you if you stray close, and can kill you). They never stray
//   far from the trees.
//   History: deer were hunted in the royal forests and chases round Bristol (Kingswood Chase, Filwood); taking one
//   without right was poaching. Wolves were all but gone from England by 1400, and bears had been extinct in Britain
//   for centuries: those here are dramatic licence (think of a bear escaped from the baiting pit).
// - The horse fair, along today's Horsefair (Broadmead): hurdle pens of horses and donkeys for sale, and dealers.
// - A bear pit where the Bearpit (St James Barton) is today, sunk in the ground (bristol.js lowers it), stone-walled,
//   with a chained bear and onlookers. Bear-baiting was a common entertainment; this pit's site, size and form are
//   illustrative (the modern name is a 20th-century nickname).
// Animals: Quaternius's animal assortment (CC0). The bear: "Bear" by jeremy (Poly Pizza, CC-BY 3.0), credited in
// assets/models/wild/CREDITS.txt.

export const HORSE_FAIR = [[51.458101, -2.591045], [51.458257, -2.590624], [51.458427, -2.590133], [51.458563, -2.589748]];
export const BEAR_PIT = [51.459455, -2.590731];
export const PIT_R = 7; // metres, the pit's radius
export const PIT_DEPTH = 3.2; // metres below the ground round it

const BAND = 42; // metres of woodland inside the square's edge
const SOLID = 26; // ...of which the outer part can't be walked into
const LEASH = 110; // the furthest from the edge a wild animal goes
const TREE_VIEW = 140; // real trees drawn within this of you
const ANIMAL_VIEW = 220;
const WILD = 'assets/models/wild/';
const TREES = [['CommonTree_3', 3, [9, 14]], ['CommonTree_4', 3, [10, 15]], ['CommonTree_5', 3, [9, 13]], ['Pine_4', 2, [11, 16]], ['Pine_5', 2, [9, 13]], ['DeadTree_3', 0.3, [7, 10]]];
const UNDER = [['Bush_Common', 3, [1.2, 2.2]], ['Fern_1', 2, [0.6, 1.1]], ['Bush_Common_Flowers', 1, [1.0, 1.8]], ['Rock_Medium_1', 0.6, [0.6, 1.4]]];
// [model, height (m), walk clip, run clip, idle clip, speeds (walk, run) m/s]
const BEASTS = {
  deer: ['Deer', 1.35, 'Walk', 'Gallop', 'Eating', [1.2, 8]],
  stag: ['Stag', 1.6, 'Walk', 'Gallop', 'Idle', [1.2, 8]],
  wolf: ['Wolf', 0.85, 'Walk', 'Gallop', 'Idle', [1.4, 7]],
  bear: ['bear.glb', 1.3, null, null, null, [1.1, 5.5]],
  horse: ['Horse', 1.7, 'Walk', 'Gallop', 'Eating', [1.2, 6]],
  white: ['Horse_White', 1.7, 'Walk', 'Gallop', 'Idle', [1.2, 6]],
  donkey: ['Donkey', 1.35, 'Walk', 'Gallop', 'Eating', [1, 4]],
};

const loader = new GLTFLoader();
const cache = new Map();
const load = (file) => {
  if (!cache.has(file)) cache.set(file, loader.loadAsync(file).catch((err) => {
    console.warn('[outskirts] missing', file, err);
    return null;
  }));
  return cache.get(file);
};
const partsOf = natureParts; // (nature.js: shared, so the kit's models load once)

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const killed = new Set(); // wild animals killed (by their home, in metres), remembered across reloads
let dying = null; // the player's death: { t, kind }

export function outskirts(ctx, { eras }) {
  const map = ctx.map;
  const game = map.game;
  const mpp = ctx.metresPerPixel;
  const a = { i: (RES - 1) / 2, j: (RES - 1) / 2 };
  const root = new THREE.Group();
  const toM = (i, j) => [(i - a.i) * mpp, (j - a.j) * mpp];
  const ground = (i, j) => {
    const g = map.ground && i >= 0 && j >= 0 && i <= RES - 1 && j <= RES - 1 ? map.sample(i, j, map.ground) : NaN;
    return Number.isFinite(g) ? g : ctx.terrainAny(i, j);
  };
  const K = (i, j) => Math.round(j) * RES + Math.round(i);
  const wet = (i, j) => {
    const b = map.bristol;
    const k = K(i, j);
    return !!(b?.frome?.[k] || b?.harbour?.[k] || b?.pool?.[k] || map.seaMask?.[k]);
  };
  const inside = (i, j) => i > 2 && j > 2 && i < RES - 3 && j < RES - 3;
  // Metres from the square's nearest edge, at window pixel (i, j) (the square: map.source.size across).
  const S = map.source.size;
  const edge = (i, j) => {
    const r = map.dataToReal((i / (RES - 1) - 0.5) * map.size, (j / (RES - 1) - 0.5) * map.size);
    return Math.min(r.x, S - r.x, r.y, S - r.y);
  };
  const realKey = (i, j) => {
    const r = map.dataToReal((i / (RES - 1) - 0.5) * map.size, (j / (RES - 1) - 0.5) * map.size);
    return `${Math.round(r.x / 4)},${Math.round(r.y / 4)}`;
  };

  // --- the woodland at the edge ---
  const trees = []; // { x, z, y, s, rot, kind }
  const under = [];
  const treeMeshes = [];
  const underMeshes = [];
  let canopy = null;
  const plantWoods = () => {
    const rand = rng(1404);
    const blobs = [];
    const step = 6 / mpp;
    for (let j = 1; j < RES - 1; j += step) {
      for (let i = 1; i < RES - 1; i += step) {
        const ti = i + (rand() - 0.5) * step;
        const tj = j + (rand() - 0.5) * step;
        const d = edge(ti, tj);
        if (d > BAND || wet(ti, tj)) continue;
        const g = ground(ti, tj);
        const [x, z] = toM(ti, tj);
        if (d < SOLID + 4) {
          // The canopy: overlapping crowns, two layers, from the ground up to 10-16 m.
          const r = 4.5 + rand() * 2.5;
          blobs.push([x, g + r * 0.75, z, r, rand()]);
          if (rand() < 0.55) blobs.push([x + (rand() - 0.5) * 4, g + 7 + rand() * 4, z + (rand() - 0.5) * 4, 3.5 + rand() * 2, rand()]);
        }
        if (d > SOLID - 6 && rand() < 0.75) {
          const kind = pick(TREES, rand);
          const [h0, h1] = TREES[kind][2];
          trees.push({ x, z, y: g - 0.2, s: h0 + rand() * (h1 - h0), rot: rand() * 6.28, kind });
        }
        if (d > SOLID - 2 && rand() < 0.6) {
          const kind = pick(UNDER, rand);
          const [h0, h1] = UNDER[kind][2];
          under.push({ x: x + (rand() - 0.5) * 4, z: z + (rand() - 0.5) * 4, y: g - 0.05, s: h0 + rand() * (h1 - h0), rot: rand() * 6.28, kind });
        }
      }
    }
    if (blobs.length) {
      const geos = blobs.map(([x, y, z, r, v]) => {
        const geo = new THREE.IcosahedronGeometry(r, 1).scale(1, 0.8, 1).translate(x, y, z);
        const n = geo.attributes.position.count;
        const c = new THREE.Color().setHSL(0.27 + v * 0.06, 0.45, 0.16 + v * 0.07);
        geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, k) => [c.r, c.g, c.b][k % 3] * (0.85 + 0.3 * Math.random())), 3));
        return geo;
      });
      canopy = new THREE.Mesh(mergeGeometries(geos), canopyMat);
      canopy.frustumCulled = false;
      root.add(canopy);
    }
    map.woodCount = { canopy: blobs.length, trees: trees.length, under: under.length };
  };
  const pick = (list, rand) => {
    const total = list.reduce((s, k) => s + k[1], 0);
    let r = rand() * total;
    for (let n = 0; n < list.length; n++) if ((r -= list[n][1]) < 0) return n;
    return 0;
  };
  const buildInstances = async (list, kinds, out) => {
    const loaded = await Promise.all(kinds.map(([name]) => partsOf(name)));
    loaded.forEach((ps, kind) => {
      const n = list.filter((t) => t.kind === kind).length;
      for (const { geometry, material } of ps) {
        const m = new THREE.InstancedMesh(geometry, material, Math.max(1, n));
        m.count = 0;
        m.frustumCulled = false;
        m.userData.kind = kind;
        root.add(m);
        out.push(m);
      }
    });
  };
  const _m4 = new THREE.Matrix4();
  const _q4 = new THREE.Quaternion();
  const _v4 = new THREE.Vector3();
  const _s4 = new THREE.Vector3();
  const fillNear = (list, meshes, cx, cz, view) => {
    for (const m of meshes) m.count = 0;
    for (const t of list) {
      if (cx != null && Math.hypot(t.x - cx, t.z - cz) > view) continue;
      _q4.setFromAxisAngle(_up, t.rot);
      _m4.compose(_v4.set(t.x, t.y, t.z), _q4, _s4.set(t.s, t.s, t.s));
      for (const m of meshes) if (m.userData.kind === t.kind) m.setMatrixAt(m.count++, _m4);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  };

  // --- the horse fair and the bear pit ---
  const pens = [];
  const fairBeasts = [];
  const buildFair = () => {
    const rand = rng(1402);
    const wood = [];
    const w = HORSE_FAIR.map(([lat, lon]) => ctx.atAny(lat, lon));
    for (let k = 0; k < w.length - 1; k++) {
      // A pen on each side of the street, set back 9 m: hurdles round an 8 x 6 m enclosure.
      const p = w[k];
      const q = w[k + 1];
      const [px, pz] = toM(p.i, p.j);
      const [qx, qz] = toM(q.i, q.j);
      const len = Math.hypot(qx - px, qz - pz);
      const [ux, uz] = [(qx - px) / len, (qz - pz) / len];
      for (const sd of [-1, 1]) {
        const cx = (px + qx) / 2 - uz * sd * 10;
        const cz = (pz + qz) / 2 + ux * sd * 10;
        const ci = a.i + cx / mpp;
        const cj = a.j + cz / mpp;
        if (!inside(ci, cj) || wet(ci, cj)) continue;
        const g = ground(ci, cj);
        const corners = [[-4, -3], [4, -3], [4, 3], [-4, 3]].map(([s, t]) => [cx + ux * s - uz * t, cz + uz * s + ux * t]);
        for (let c = 0; c < 4; c++) {
          const [x0, z0] = corners[c];
          const [x1, z1] = corners[(c + 1) % 4];
          const L = Math.hypot(x1 - x0, z1 - z0);
          const rot = -Math.atan2(z1 - z0, x1 - x0);
          // (a gap on the street side, for leading them out)
          const gapped = (c === 0 && sd < 0) || (c === 2 && sd > 0);
          for (const [f0, f1] of gapped ? [[0, 0.4], [0.6, 1]] : [[0, 1]]) {
            const mx = x0 + (x1 - x0) * (f0 + f1) / 2;
            const mz = z0 + (z1 - z0) * (f0 + f1) / 2;
            const l = L * (f1 - f0);
            for (const y of [0.45, 0.9]) wood.push(metreUVs(new THREE.BoxGeometry(l, 0.08, 0.06)).rotateY(rot).translate(mx, g + y, mz));
            for (let s = 0; s <= Math.ceil(l / 2); s++) {
              const t = s / Math.ceil(l / 2);
              wood.push(new THREE.BoxGeometry(0.09, 1.1, 0.09).translate(x0 + (x1 - x0) * (f0 + (f1 - f0) * t), g + 0.5, z0 + (z1 - z0) * (f0 + (f1 - f0) * t)));
            }
          }
        }
        pens.push({ cx, cz, ux, uz, g });
        const n = 2 + Math.floor(rand() * 2);
        for (let h = 0; h < n; h++) {
          const kind = rand() < 0.2 ? 'donkey' : rand() < 0.3 ? 'white' : 'horse';
          const s = (rand() - 0.5) * 5;
          const t = (rand() - 0.5) * 3;
          fairBeasts.push(spawn(kind, a.i + (cx + ux * s - uz * t) / mpp, a.j + (cz + uz * s + ux * t) / mpp, { penned: true, rand }));
        }
      }
    }
    if (wood.length) root.add(new THREE.Mesh(mergeGeometries(wood.map((q) => (q.index ? q.toNonIndexed() : q))), hurdleMat));
  };
  let bear = null;
  const buildPit = () => {
    const c = ctx.atAny(...BEAR_PIT);
    if (!inside(c.i, c.j)) return;
    const [cx, cz] = toM(c.i, c.j);
    // The rim: the ground just outside the pit (bristol.js has sunk the inside by PIT_DEPTH).
    let rim = map.bristol?.pitRim;
    if (rim == null) {
      rim = -Infinity;
      for (let k = 0; k < 12; k++) {
        const t = (k / 12) * Math.PI * 2;
        rim = Math.max(rim, ground(c.i + (Math.cos(t) * (PIT_R + 2)) / mpp, c.j + (Math.sin(t) * (PIT_R + 2)) / mpp));
      }
    }
    const floor = rim - PIT_DEPTH;
    const stone = [];
    // Its lining: a ring of stone from the floor up to a parapet a metre above the rim, then a timber rail.
    const ring = new THREE.CylinderGeometry(PIT_R + 0.6, PIT_R + 0.6, PIT_DEPTH + 1 + 1, 40, 1, true);
    const inner = new THREE.CylinderGeometry(PIT_R, PIT_R, PIT_DEPTH + 1 + 1, 40, 1, true);
    inner.scale(-1, 1, 1); // (faces inwards)
    stone.push(metreUVs(ring, 2).translate(cx, floor + (PIT_DEPTH + 1) / 2 - 0.5, cz), metreUVs(inner, 2).translate(cx, floor + (PIT_DEPTH + 1) / 2 - 0.5, cz));
    stone.push(new THREE.RingGeometry(PIT_R, PIT_R + 0.6, 40).rotateX(-Math.PI / 2).translate(cx, rim + 1, cz));
    root.add(new THREE.Mesh(mergeGeometries(stone.map((q) => (q.index ? q.toNonIndexed() : q))), pitStone));
    const rail = [];
    for (let k = 0; k < 24; k++) {
      const t = (k / 24) * Math.PI * 2;
      rail.push(new THREE.BoxGeometry(0.1, 0.9, 0.1).translate(cx + Math.cos(t) * (PIT_R + 0.3), rim + 1.45, cz + Math.sin(t) * (PIT_R + 0.3)));
    }
    rail.push(new THREE.TorusGeometry(PIT_R + 0.3, 0.05, 4, 48).rotateX(Math.PI / 2).translate(cx, rim + 1.9, cz));
    // The stake in the middle, and its chain.
    rail.push(new THREE.CylinderGeometry(0.16, 0.2, 2.2, 8).translate(cx, floor + 1.1, cz));
    root.add(new THREE.Mesh(mergeGeometries(rail.map((q) => (q.index ? q.toNonIndexed() : q))), hurdleMat));
    // The floor: trodden earth and straw, so the pit isn't the street's cobbles.
    const dirt = new THREE.Mesh(new THREE.CircleGeometry(PIT_R, 32).rotateX(-Math.PI / 2).translate(cx, floor + 0.04, cz), pitFloor);
    root.add(dirt);
    bear = spawn('bear', c.i + 2.2 / mpp, c.j, { chained: { cx, cz, r: 3.2, floor }, rand: rng(1405) });
  };

  // --- animals (wild, fair and pit) ---
  const beasts = [];
  function spawn(kind, i, j, opts = {}) {
    const [file, height] = BEASTS[kind];
    const b = { kind, i, j, home: [i, j], heading: (opts.rand ?? Math.random)() * 6.28, state: 'idle', until: 1 + Math.random() * 5, hp: kind === 'bear' ? 3 : 1, ...opts, pivot: new THREE.Group() };
    b.key = `${kind}:${realKey(i, j)}`;
    if (killed.has(b.key)) b.state = 'dead';
    root.add(b.pivot);
    load(file.includes('.') ? WILD + file : WILD + file + '.gltf').then((g) => {
      if (!g) return;
      const model = SkeletonUtils.clone(g.scene);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const s = height / Math.max(size.y, 1e-6);
      model.scale.multiplyScalar(s);
      const ctr = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
      model.position.set(-ctr.x, -box.min.y * s, -ctr.z);
      // (The bear model faces -x: turn it to face +z like the others.)
      if (kind === 'bear') {
        const turn = new THREE.Group();
        turn.add(model);
        model.position.applyAxisAngle(_up, Math.PI / 2);
        model.rotation.y = Math.PI / 2;
        b.body = turn;
      } else b.body = model;
      model.traverse((o) => {
        if (o.isMesh) o.frustumCulled = false;
      });
      b.pivot.add(b.body);
      if (g.animations.length) {
        b.mixer = new THREE.AnimationMixer(model);
        const clip = (name) => name && g.animations.find((c) => c.name.split('|').pop() === name);
        const spec = BEASTS[kind];
        b.acts = {};
        for (const [k, n] of [['walk', spec[2]], ['run', spec[3]], ['idle', spec[4]], ['attack', 'Attack'], ['death', 'Death']]) {
          const c = clip(n);
          if (c) b.acts[k] = b.mixer.clipAction(c);
        }
        if (b.acts.death) {
          b.acts.death.setLoop(THREE.LoopOnce);
          b.acts.death.clampWhenFinished = true;
        }
        play(b, b.state === 'dead' ? 'death' : 'idle');
        if (b.state === 'dead') b.mixer.setTime(5);
        b.mixer.update(Math.random() * 2);
      }
      if (b.state === 'dead' && !b.mixer) b.body.rotation.z = Math.PI / 2;
    });
    beasts.push(b);
    return b;
  }
  const play = (b, name) => {
    if (!b.acts || b.playing === name) return;
    const next = b.acts[name] ?? b.acts.idle;
    if (!next) return;
    const prev = b.playing && b.acts[b.playing];
    next.reset().play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.25, false);
    b.playing = name;
  };
  const spawnWild = () => {
    const rand = rng(1403);
    const wants = [['deer', 4, 3], ['stag', 2, 1], ['wolf', 2, 3], ['bear', 1, 1]];
    for (const [kind, groups, each] of wants) {
      for (let g = 0; g < groups; g++) {
        // A spot on land just inside the trees.
        for (let tries = 0; tries < 400; tries++) {
          const i = 4 + rand() * (RES - 8);
          const j = 4 + rand() * (RES - 8);
          const d = edge(i, j);
          if (d < SOLID + 4 || d > SOLID + 30 || wet(i, j) || map.blockedAt(i, j)) continue;
          for (let n = 0; n < each; n++) spawn(kind, i + ((rand() - 0.5) * 6) / mpp, j + ((rand() - 0.5) * 6) / mpp, { wild: true, rand });
          break;
        }
      }
    }
  };

  // Hunting: point at a beast and pull the trigger (or click it on the flat screen). An arrow flies to it; a deer
  // or wolf falls to one, a bear to three.
  const arrows = [];
  const huntAt = (origin, dir) => {
    if (!eras.includes(map.era) || game.life.state !== 'on' || dying) return false;
    let best = null;
    for (const b of beasts) {
      if (b.state === 'dead' || !b.body || b.penned || b.chained || !b.pivot.visible) continue;
      b.pivot.getWorldPosition(_w);
      _w.y += BEASTS[b.kind][1] * 0.55;
      const t = _d.copy(_w).sub(origin).dot(dir);
      if (t < 1 || t > 70) continue;
      const off = _d.copy(origin).addScaledVector(dir, t).distanceTo(_w);
      if (off < 1.1 + BEASTS[b.kind][1] * 0.3 && (!best || t < best.t)) best = { b, t, at: _w.clone() };
    }
    if (!best) return false;
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    game.scene.add(arrow);
    arrows.push({ mesh: arrow, from: origin.clone(), to: best.at, t: 0, dur: Math.max(0.12, best.t / 45), b: best.b });
    game.sfx?.click?.();
    return true;
  };
  game.huntAt = huntAt;
  map.wildBeasts = beasts; // (for tests and the console)
  const strike = (b) => {
    if (b.state === 'dead') return;
    if (--b.hp > 0) {
      b.state = 'chase';
      return;
    }
    b.state = 'dead';
    killed.add(b.key);
    play(b, 'death');
    if (!b.mixer && b.body) b.body.rotation.z = Math.PI / 2;
    if (b.kind === 'deer' || b.kind === 'stag') {
      game.flash?.(b.kind === 'stag' ? 'A stag brought down' : 'A deer brought down',
        "The deer of the forests and chases round Bristol (Kingswood Chase to the east, Filwood to the south) belonged to the king or the lord of the chase. Taking one without the right was poaching: fines, prison, or worse under the forest law. Venison was a lord's meat.");
    } else if (b.kind === 'wolf') {
      game.flash?.('A wolf killed', 'By 1400 wolves were all but gone from England; bounties had been paid for them for centuries. This one is a rarity, or a tale.');
    } else if (b.kind === 'bear') {
      game.flash?.('A bear killed', 'Bears had been extinct in Britain for centuries by 1400 (dramatic licence here). The bears Bristol knew were imported for baiting, kept chained in pits like the one at St James.');
    }
  };

  // Death: wolves and bears that reach you kill you. The world fades red, then you wake in the market place.
  const veil = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 8), new THREE.MeshBasicMaterial({ color: 0x5a0000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false }));
  veil.renderOrder = 999;
  veil.visible = false;
  const die = (kind) => {
    if (dying) return;
    dying = { t: 0, kind };
    veil.visible = true;
    if (!veil.parent) game.camera.add(veil);
    game.flash?.(kind === 'bear' ? 'Mauled by a bear' : 'Brought down by wolves',
      kind === 'bear' ? "You strayed too near the woods. (Bears were long extinct in Britain by 1400: dramatic licence.) You wake again in the town's market place." : 'You strayed too far from the town and its walls, into the woods at its edge. You wake again in the market place.');
  };

  const _up = new THREE.Vector3(0, 1, 0);
  const _w = new THREE.Vector3();
  const _d = new THREE.Vector3();
  let state = 'wait';
  let last = null;
  let centre = null;
  const animate = (t) => {
    const dt = last == null ? 0 : Math.min(0.1, t - last);
    last = t;
    // The arrows, and death, run whatever's on show.
    for (let n = arrows.length - 1; n >= 0; n--) {
      const ar = arrows[n];
      ar.t += dt;
      const f = Math.min(1, ar.t / ar.dur);
      ar.mesh.position.lerpVectors(ar.from, ar.to, f);
      ar.mesh.quaternion.setFromUnitVectors(_up, _d.copy(ar.to).sub(ar.from).normalize());
      if (f >= 1) {
        ar.mesh.removeFromParent();
        arrows.splice(n, 1);
        strike(ar.b);
      }
    }
    if (dying) {
      dying.t += dt;
      veil.material.opacity = dying.t < 1.2 ? dying.t / 1.2 * 0.95 : dying.t < 3 ? 0.95 : Math.max(0, 0.95 - (dying.t - 3) / 1.2);
      if (dying.t >= 3 && !dying.moved) {
        dying.moved = true;
        const views = map.views.list;
        const market = views.findIndex((v) => /^The market place/.test(v.name));
        if (market >= 0) {
          map.views.index = (market - 1 + views.length) % views.length;
          game.life.nextView();
        }
      }
      if (dying.t > 4.3) {
        dying = null;
        veil.visible = false;
      }
    }
    if (!eras.includes(map.era)) return;
    if (state === 'wait') {
      if (!map.bristol?.gardens?.[map.era] || !map.objects?.solid) return;
      state = 'loading';
      plantWoods();
      buildFair();
      buildPit();
      spawnWild();
      Promise.all([buildInstances(trees, TREES, treeMeshes), buildInstances(under, UNDER, underMeshes)]).then(() => {
        state = 'ready';
        centre = null;
      }).catch((err) => {
        console.error('[outskirts] woods', err);
        state = 'ready';
      });
      return;
    }
    if (state !== 'ready') return;
    const life = game.life;
    const on = life?.state === 'on';
    root.updateWorldMatrix(true, false);
    const me = on ? life.pixelOf(game.head) : null;
    // Real trees near you at life size (the canopy alone on the table).
    if (on) {
      root.worldToLocal(_w.copy(game.head));
      if (!centre || Math.hypot(_w.x - centre[0], _w.z - centre[1]) > 20) {
        centre = [_w.x, _w.z];
        fillNear(trees, treeMeshes, _w.x, _w.z, TREE_VIEW);
        fillNear(under, underMeshes, _w.x, _w.z, 70);
      }
    } else if (centre) {
      centre = null;
      for (const m of [...treeMeshes, ...underMeshes]) m.count = 0;
    }
    const meEdge = me ? edge(me.i, me.j) : Infinity;
    for (const b of beasts) {
      const mine = me ? Math.hypot(b.i - me.i, b.j - me.j) * mpp : Infinity;
      // (Out of the scene unless near you at life size: their bones cost every frame.)
      const near = on && mine < ANIMAL_VIEW;
      b.pivot.visible = near;
      if (near !== !!b.pivot.parent) {
        if (near) root.add(b.pivot);
        else b.pivot.removeFromParent();
      }
      if (!near || !b.body) continue;
      b.mixer?.update(dt);
      if (b.state === 'dead') {
        b.pivot.position.set(...xyz(b));
        continue;
      }
      const [walkV, runV] = BEASTS[b.kind][5];
      let goal = null;
      let speed = 0;
      const predator = b.kind === 'wolf' || b.kind === 'bear';
      if (b.wild && predator && me && !dying && mine < 30 && meEdge < LEASH) b.state = 'chase';
      if (b.state === 'chase' && (!me || dying || meEdge > LEASH + 10 || mine > 60)) {
        b.state = 'home';
      }
      if (b.wild && !predator && me && mine < 22) b.state = 'flee';
      if (b.state === 'chase') {
        if (mine < 1.7) {
          speed = 0;
          play(b, 'attack');
          b.bite = (b.bite ?? 0) + dt;
          if (b.kind === 'bear' && b.body) b.body.rotation.x = -0.5 * Math.abs(Math.sin(t * 4));
          if (b.bite > (b.kind === 'bear' ? 0.7 : 1.1)) {
            b.bite = 0;
            b.state = 'home';
            die(b.kind);
          }
        } else {
          b.bite = 0;
          goal = [me.i, me.j];
          speed = runV;
        }
      } else if (b.state === 'flee') {
        if (mine > 45) b.state = 'idle';
        else {
          const away = Math.atan2(b.i - me.i, b.j - me.j);
          goal = [b.i + Math.sin(away) * 10 / mpp, b.j + Math.cos(away) * 10 / mpp];
          speed = runV;
        }
      } else if (b.state === 'home') {
        goal = b.home;
        speed = walkV * 1.6;
        if (Math.hypot(b.i - b.home[0], b.j - b.home[1]) * mpp < 2) b.state = 'idle';
      } else if (b.state === 'walk') {
        goal = b.target;
        speed = walkV;
        if (Math.hypot(b.i - goal[0], b.j - goal[1]) * mpp < 0.5 || (b.until -= dt) < 0) {
          b.state = 'idle';
          b.until = 3 + Math.random() * 8;
        }
      } else if ((b.until -= dt) < 0) {
        // Wander a little about home (in the pen; on the chain; near the trees).
        const r = b.penned ? 2.5 : b.chained ? 2.5 : 14;
        const t2 = Math.random() * 6.28;
        b.target = [b.home[0] + Math.cos(t2) * r * Math.random() / mpp, b.home[1] + Math.sin(t2) * r * Math.random() / mpp];
        b.state = 'walk';
        b.until = 12;
      }
      if (goal && speed > 0) {
        const di = goal[0] - b.i;
        const dj = goal[1] - b.j;
        const d = Math.hypot(di, dj) || 1;
        const step = Math.min((speed * dt) / mpp, d);
        const ni = b.i + (di / d) * step;
        const nj = b.j + (dj / d) * step;
        // Wild ones keep near the trees; none walk into water or through walls.
        const ok = inside(ni, nj) && !wet(ni, nj) && (!b.wild || edge(ni, nj) < LEASH) && (b.penned || b.chained || !map.blockedAt(ni, nj));
        if (ok) {
          b.i = ni;
          b.j = nj;
        } else if (b.state === 'walk' || b.state === 'flee') b.state = 'idle';
        const want = Math.atan2(di, dj);
        const turn = ((want - b.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        b.heading += turn * Math.min(1, dt * 6);
        play(b, speed > walkV * 1.7 ? 'run' : 'walk');
      } else if (b.state !== 'chase') play(b, 'idle');
      if (b.chained) {
        // (On its chain: no further than r from the stake.)
        const [x, z] = toM(b.i, b.j);
        const r = Math.hypot(x - b.chained.cx, z - b.chained.cz);
        if (r > b.chained.r) {
          b.i = a.i + (b.chained.cx + ((x - b.chained.cx) * b.chained.r) / r) / mpp;
          b.j = a.j + (b.chained.cz + ((z - b.chained.cz) * b.chained.r) / r) / mpp;
        }
      }
      b.pivot.position.set(...xyz(b));
      b.pivot.rotation.y = b.heading;
      // The bear has no animation of its own: a rolling gait when it moves, a sway when it stands.
      if (b.kind === 'bear' && b.body && b.state !== 'chase') {
        const moving = goal && speed > 0;
        b.body.position.y = moving ? Math.abs(Math.sin(t * (speed > 2 ? 9 : 5))) * 0.08 : 0;
        b.body.rotation.z = moving ? Math.sin(t * (speed > 2 ? 9 : 5)) * 0.06 : Math.sin(t * 0.8) * 0.02;
        b.body.rotation.x = 0;
      }
    }
  };
  const xyz = (b) => {
    const [x, z] = toM(b.i, b.j);
    return [x, b.chained ? b.chained.floor : ground(b.i, b.j), z];
  };
  // You can't walk into the woods' outer part (the world's edge).
  const collide = (i, j) => edge(i, j) < SOLID && !wet(i, j);
  const dispose = () => {
    freeSkeletons(beasts.map((b) => b.pivot));
    if (game.huntAt === huntAt) game.huntAt = null;
    veil.removeFromParent();
  };
  return [{ ...a, model: { group: root, top: 16 }, era: eras, trueSize: true, baseAlt: 0, far: true, animate, collide, dispose }];
}

const canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
const hurdleMat = new THREE.MeshStandardMaterial({ color: 0x6a5034, roughness: 0.95 });
const pitStone = new THREE.MeshStandardMaterial({ color: 0x8a8274, roughness: 0.95 });
const pitFloor = new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 1 });
const arrowGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.75, 4);
const arrowMat = new THREE.MeshBasicMaterial({ color: 0x3a2a18 });
