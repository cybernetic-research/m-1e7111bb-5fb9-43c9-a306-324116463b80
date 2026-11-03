import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RES } from './terrain.js';
import { MARKETS } from './bristol.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Free the skeletons (their bones' textures) under these roots, in the scene or not.
function freeSkeletons(roots) {
  for (const r of roots) r?.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton?.dispose();
  });
}


// Townsfolk in c.1400 and c.1650: men and women in the peasant clothes of Quaternius's Modular Character Outfits
// (CC0; assets/models/people). The pack's outfits are made for its separate base characters, of which only the head
// is needed: here each has a simple head made in code (skin, eyes, a nose; the men bare-headed with their hair, or
// in a hood; the women in a linen coif or kerchief) on the outfit's head bone, and walks by turning its leg and arm
// bones (the pack has no animations). They're spread through the town: along the streets, in the market places,
// at the gates, in the churchyards, on the quays, and out on the open ground; each stands about, or strolls to
// another spot nearby that can be walked to (over the footbridges too), keeping clear of you. Only the nearest
// POOL are drawn (each some 9,000 triangles in five or six meshes; the models' triangles halved with meshoptimizer); the others carry on unseen. Counted in map.peopleCount.

const DIR = 'assets/models/people/';
const POOL = 20;
const SHY = 1.6; // metres they keep from you
const SKIN = [0xe8c4a8, 0xd9a888, 0xc68e6a, 0xa8714e, 0x8a5a3c];
const HAIR = [0x2a1d14, 0x4a3020, 0x6e4a2a, 0x8e6a3a, 0x9a9890, 0x3a2a1a];
const CLOTH = [0x6a3a2a, 0x3e4a32, 0x4a4436, 0x5a2a2a, 0x2e3a4a, 0x7a6a4a];
const LINEN = [0xe8e2d0, 0xd8d0bc, 0xcfc8b0];

const loader = new GLTFLoader();
// How someone looks: their colouring, hair (and the men's beards), clothes; the women mostly in a coif.
function lookOf(rand, hoods) {
  const tone = Math.min(SKIN.length - 1, Math.floor(rand() ** 1.7 * SKIN.length)); // (mostly fair)
  return {
    skin: SKIN[tone], skinTint: SKIN_TINT[tone], hair: HAIR[Math.floor(rand() * HAIR.length)], hood: rand() < hoods,
    cloth: CLOTH[Math.floor(rand() * CLOTH.length)], linen: LINEN[Math.floor(rand() * LINEN.length)], coif: rand() < 0.8,
    beard: rand() < 0.45, hairPick: rand(),
  };
}
const crateGeo = new THREE.BoxGeometry(0.5, 0.38, 0.42);
const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 });
const _hang = new THREE.Vector3();
const _qDown = new THREE.Quaternion();
const _qSwing = new THREE.Quaternion();
const _qTurn = new THREE.Quaternion();
const _X = new THREE.Vector3(1, 0, 0);
const _Y = new THREE.Vector3(0, 1, 0);
const outfits = {};
// Skinned meshes (sharing a skeleton and its binding) that share a material, merged into one: a draw call each, not
// one per part (each is drawn once per eye).
const ATTRS = ['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight'];
function mergeSkinned(parts) {
  const geos = parts.map((m) => {
    const g = new THREE.BufferGeometry();
    for (const at of ATTRS) if (m.geometry.attributes[at]) g.setAttribute(at, m.geometry.attributes[at]);
    g.setIndex(m.geometry.index);
    return g;
  });
  const common = ATTRS.filter((at) => geos.every((g) => g.attributes[at]));
  for (const g of geos) for (const at of ATTRS) if (!common.includes(at)) g.deleteAttribute(at);
  return mergeGeometries(geos);
}
function mergeByMaterial(root) {
  const sets = new Map();
  root.traverse((o) => {
    if (!o.isSkinnedMesh || Array.isArray(o.material)) return;
    const key = o.material.name + '|' + o.skeleton.uuid + '|' + o.bindMatrix.elements.map((x) => x.toFixed(5)).join(',');
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push(o);
  });
  for (const list of sets.values()) {
    if (list.length < 2) continue;
    const merged = mergeSkinned(list);
    if (!merged) continue;
    list[0].geometry = merged;
    if (!merged.attributes.color && list[0].material.vertexColors) {
      // (Vertex colours only some parts had: without them the material would draw black.)
      list[0].material = list[0].material.clone();
      list[0].material.vertexColors = false;
    }
    for (const o of list.slice(1)) o.removeFromParent();
  }
}
const loadOutfit = (name) => (outfits[name] ??= loader.loadAsync(DIR + name + '.gltf').then((g) => {
  mergeByMaterial(g.scene);
  g.scene.traverse((o) => {
    if (o.isMesh) {
      o.material.metalness = 0;
      o.frustumCulled = false;
    }
  });
  return g;
}).catch(() => null));

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Heads from Quaternius's Universal Base Characters (CC0; assets/models/people/heads), made for the same skeleton as
// the outfits: the base bodies' heads and necks (the triangles skinned to the Head and neck_01 bones), their eyes and
// eyebrows, and the kit's hairstyles and beards, each bound to the outfit's own skeleton so they turn and nod with it.
// Skin tinted to each person's colouring, hair to theirs. Over them, made in code: the women's linen coif and
// kerchief, and some men's hoods.
const HEADS = DIR + 'heads/';
const HAIRS = { male: ['Hair_SimpleParted', 'Hair_Buzzed', 'Hair_SimpleParted'], female: ['Hair_Buns', 'Hair_Long'] };
const headParts = {};
// Skinned parts of a file: [{ geometry (bone indices by name, see names), material, names }]. keep(name, mesh) picks
// the triangles to keep (a vertex's strongest bone name -> keep?), or all.
function skinnedParts(file, keep) {
  return (headParts[file] ??= loader.loadAsync(HEADS + file + '.gltf').then((g) => {
    const out = [];
    g.scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const names = o.skeleton.bones.map((bn) => bn.name);
      const src = o.geometry;
      const si = src.attributes.skinIndex;
      const sw = src.attributes.skinWeight;
      const want = keep?.(o);
      let index = src.index ? Array.from(src.index.array) : Array.from({ length: src.attributes.position.count }, (_, k) => k);
      if (want) {
        const strong = (k) => {
          let best = 0;
          let bw = -1;
          for (let c = 0; c < 4; c++) if (sw.getComponent(k, c) > bw) [bw, best] = [sw.getComponent(k, c), si.getComponent(k, c)];
          return names[best];
        };
        const ok = new Uint8Array(si.count);
        for (let k = 0; k < si.count; k++) ok[k] = want.has(strong(k)) ? 1 : 0;
        const tri = [];
        const all = src.index ? src.index.array : null;
        const count = all ? all.length : src.attributes.position.count;
        for (let n = 0; n < count; n += 3) {
          const [i0, i1, i2] = all ? [all[n], all[n + 1], all[n + 2]] : [n, n + 1, n + 2];
          if (ok[i0] && ok[i1] && ok[i2]) tri.push(i0, i1, i2);
        }
        index = tri;
      }
      const geometry = new THREE.BufferGeometry();
      for (const at of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) if (src.attributes[at]) geometry.setAttribute(at, src.attributes[at]);
      geometry.setIndex(index);
      geometry.userData.keep = true;
      const m = o.material;
      m.metalness = 0;
      m.roughness = Math.max(0.7, m.roughness ?? 0.7);
      m.vertexColors = false; // (the files carry vertex colours, not kept here: they'd have drawn black)
      out.push({ geometry, material: m, names, name: o.name });
    });
    return out;
  }).catch((err) => {
    console.warn('[people] no head', file, err);
    return [];
  }));
}
const HEAD_BONES = new Set(['Head', 'neck_01']);
const loadHead = (female) => skinnedParts(female ? 'Superhero_Female_FullBody' : 'Superhero_Male_FullBody', (o) => (/SuperHero/i.test(o.name) ? HEAD_BONES : null));
// Each part's bone indices put into the outfits' skeleton's order (all the outfits share one), once.
const remapped = new WeakMap();
function boundGeometry(part, skeleton) {
  if (remapped.has(part.geometry)) return remapped.get(part.geometry);
  const order = new Map(skeleton.bones.map((bn, k) => [bn.name, k]));
  const g = part.geometry.clone();
  const si = g.attributes.skinIndex.clone();
  for (let k = 0; k < si.count; k++) for (let c = 0; c < 4; c++) si.setComponent(k, c, order.get(part.names[si.getComponent(k, c)]) ?? 0);
  g.setAttribute('skinIndex', si);
  g.userData.keep = true;
  remapped.set(part.geometry, g);
  return g;
}
// Parts bound to the skeleton and merged into one geometry, once per combination.
const mergedSets = new Map();
function mergedBound(parts, skeleton) {
  if (parts.length === 1) return boundGeometry(parts[0], skeleton);
  const key = parts.map((x) => x.geometry.uuid).join('+');
  if (!mergedSets.has(key)) {
    const g = mergeSkinned(parts.map((x) => ({ geometry: boundGeometry(x, skeleton) })));
    g.userData.keep = true;
    mergedSets.set(key, g);
  }
  return mergedSets.get(key);
}
// Materials per tint, shared.
const tintedMats = new Map();
function tinted(material, hex, gain = 1) {
  const key = `${material.uuid}:${hex}:${gain}`;
  if (!tintedMats.has(key)) {
    const m = material.clone();
    m.color.setHex(hex).multiplyScalar(gain);
    tintedMats.set(key, m);
  }
  return tintedMats.get(key);
}
// The skin palette as tints of the base texture (a light tan).
const SKIN_TINT = [0xffffff, 0xf2e2d6, 0xdcc0a8, 0xb08e74, 0x87664e];

// The coif and kerchief, or a hood (metres, from the head bone: up is +y, the face towards +z), coloured per vertex.
const headMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
function makeCovering({ female, cloth }) {
  const parts = [];
  const put = (geo, color) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const at of Object.keys(g.attributes)) if (at !== 'position' && at !== 'normal') g.deleteAttribute(at);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, k) => [c.r, c.g, c.b][k % 3]), 3));
    parts.push(g);
  };
  // (Fitted to the kit's heads: about 0.18 m wide, 0.23 m from chin to crown, centred 0.1 m above the bone.)
  if (female) {
    put(new THREE.SphereGeometry(1, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(0.104, 0.13, 0.12).rotateX(-0.75).translate(0, 0.1, 0.0), cloth);
    put(new THREE.BoxGeometry(0.19, 0.17, 0.04).translate(0, 0.02, -0.095), cloth);
  } else {
    // (Open at the face: the sphere's front quarter left out.)
    put(new THREE.SphereGeometry(1, 16, 9, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.7).scale(0.112, 0.138, 0.13).rotateX(-0.3).translate(0, 0.1, -0.015), cloth);
    put(new THREE.CylinderGeometry(0.13, 0.17, 0.08, 12, 1).translate(0, -0.03, 0), cloth);
  }
  return new THREE.Mesh(mergeGeometries(parts), headMat);
}

// A person's head on a pool member p: skinned parts bound to its skeleton, and their covering on its head bone.
async function dressHead(p, f) {
  const look = f.look;
  const female = f.female;
  const files = [];
  const coif = female && look.coif;
  const styles = HAIRS[female ? 'female' : 'male'];
  if (!coif && !(look.hood && !female)) files.push(styles[Math.floor(look.hairPick * styles.length)]);
  if (!female && look.beard) files.push('Hair_Beard');
  // (The eyebrows come with the head.)
  const lists = await Promise.all([loadHead(female), ...files.map((x) => skinnedParts(x))]);
  if (p.who !== f) return; // (given to someone else meanwhile)
  const group = new THREE.Group();
  // The parts sharing a material (the hair, beard and eyebrows) as one mesh.
  const byMat = new Map();
  for (const part of lists.flat()) {
    if (!byMat.has(part.material.name)) byMat.set(part.material.name, []);
    byMat.get(part.material.name).push(part);
  }
  for (const parts of byMat.values()) {
    const part = parts[0];
    const hair = /Hair/.test(part.material.name);
    const eyes = /Eyes/.test(part.material.name);
    const mat = eyes ? part.material : hair ? tinted(part.material, look.hair, 1.7) : tinted(part.material, look.skinTint);
    const mesh = new THREE.SkinnedMesh(mergedBound(parts, p.skeleton), mat);
    mesh.bind(p.skeleton, p.bindMatrix);
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  if (coif || (look.hood && !female)) {
    const c = makeCovering({ female, cloth: female ? look.linen : look.cloth });
    p.bones.Head.add(c);
    group.userData.covering = c;
  }
  p.skinParent.add(group);
  p.head = group;
  // Their hands the same colouring as their face.
  for (const m of p.handMats) m.color.setHex(look.skinTint);
}
function undressHead(p) {
  if (!p.head) return;
  p.head.removeFromParent();
  const c = p.head.userData.covering;
  if (c) {
    c.removeFromParent();
    c.geometry.dispose();
  }
  p.head = null;
}

// crowds: [[lat, lon, people, radius (m), where]...]: onlookers at the bear pit, dealers at the horse fair.
export function townsfolk(ctx, { eras, gates = [], churches = [], crowds = [] }) {
  const map = ctx.map;
  const mpp = ctx.metresPerPixel;
  const a = { i: (RES - 1) / 2, j: (RES - 1) / 2 };
  const root = new THREE.Group();
  const folk = []; // { i, j, heading, target, state, until, speed, phase, look, kind, actor }
  const pool = []; // { object, bones, head, used }
  let state = 'wait';
  let lastAssign = -Infinity;
  // Coming in (the town just loaded, or you've just gone in at life size), the pool is filled a few at a time over
  // some seconds, not all in one frame along with everything else: WARM per sex at first, one more each half second.
  let warmFrom = null;
  let wasLife = false;
  const WARM = 3;
  let docked = false;
  let last = null;
  const K = (i, j) => Math.round(j) * RES + Math.round(i);
  const inside = (i, j) => i > 3 && j > 3 && i < RES - 4 && j < RES - 4;
  const ground = (i, j) => {
    const w = map.features.walkHeight(i, j);
    if (w != null) return w;
    const g = map.ground ? map.sample(i, j, map.ground) : NaN;
    return Number.isFinite(g) ? g : ctx.terrainAny(i, j);
  };
  const wet = (i, j) => {
    const b = map.bristol;
    const q = K(i, j);
    return !!(b?.frome?.[q] || b?.harbour?.[q] || b?.pool?.[q] || map.seaMask?.[q]);
  };
  const groundOk = (i, j) => inside(i, j) && !map.blockedAt(i, j) && (!wet(i, j) || !!map.onFootbridge?.(i, j));
  // (Nor through the market stalls, carts, crates and barrels (townlife.js): someone who finds themself in one, as
  // where they first stood, may walk out of it.)
  let escaping = false;
  const free = (i, j) => groundOk(i, j) && (escaping || !map.propBlocked?.(i, j));
  // Can someone walk straight from p to q (sampled every metre)?
  const clearLine = (p, q) => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]) * mpp;
    for (let m = 0.4; m < d; m += 0.4) {
      const t = m / d;
      if (!free(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)) return false;
    }
    return free(q[0], q[1]);
  };

  // Where people are: spots of each sort (window pixels).
  const spread = (rand) => {
    const b = map.bristol;
    const era = map.era;
    const street = b.streetMasks?.[era];
    const town = b.towns?.[era];
    const out = [];
    const counts = { street: 0, market: 0, gate: 0, churchyard: 0, quay: 0, open: 0 };
    const add = (where, i, j) => {
      if (!free(i, j) || wet(i, j)) return false;
      out.push({ where, i, j });
      counts[where]++;
      return true;
    };
    const tries = (n, f) => {
      for (let t = 0, got = 0; got < n && t < n * 300; t++) if (f()) got++;
    };
    const toW = ([lat, lon]) => map.source.toWindow(lat, lon);
    tries(70, () => {
      const i = 4 + rand() * (RES - 8);
      const j = 4 + rand() * (RES - 8);
      return street?.[K(i, j)] > 0 && add('street', i, j);
    });
    for (const mk of MARKETS) {
      const poly = mk.poly.map(toW);
      const ci = poly.reduce((s, p) => s + p.i, 0) / poly.length;
      const cj = poly.reduce((s, p) => s + p.j, 0) / poly.length;
      if (!inside(ci, cj)) continue;
      // (Shoppers in proportion to the stalls: the big markets, St Nicholas's and Old Market, are crowded.)
      // (Spread over the place's whole extent: Old Market runs some 230 m along its street.)
      const spanI = Math.max(...poly.map((p) => p.i)) - Math.min(...poly.map((p) => p.i));
      const spanJ = Math.max(...poly.map((p) => p.j)) - Math.min(...poly.map((p) => p.j));
      tries(Math.round(Math.min(45, (mk.stalls ?? 20) / 1.4)), () => add('market', ci + (rand() - 0.5) * spanI * 0.9, cj + (rand() - 0.5) * spanJ * 0.9));
    }
    for (const gt of gates) {
      const w = toW(gt);
      if (inside(w.i, w.j)) tries(2, () => add('gate', w.i + (rand() - 0.5) * 16 / mpp, w.j + (rand() - 0.5) * 16 / mpp));
    }
    for (const [lat, lon, n, r, where] of crowds) {
      const w = toW([lat, lon]);
      counts[where] ??= 0;
      if (inside(w.i, w.j)) tries(n, () => add(where, w.i + (rand() - 0.5) * 2 * r / mpp, w.j + (rand() - 0.5) * 2 * r / mpp));
    }
    for (const c of churches) {
      const w = toW(c);
      if (inside(w.i, w.j)) tries(2, () => add('churchyard', w.i + (rand() - 0.5) * 40 / mpp, w.j + (rand() - 0.5) * 40 / mpp));
    }
    tries(14, () => {
      const i = 4 + rand() * (RES - 8);
      const j = 4 + rand() * (RES - 8);
      const q = K(i, j);
      return b.fromeQuay?.[q] && !b.frome?.[q] && add('quay', i, j);
    });
    tries(12, () => {
      const i = 4 + rand() * (RES - 8);
      const j = 4 + rand() * (RES - 8);
      return town && !town[K(i, j)] && add('open', i, j);
    });
    map.peopleCount = { total: out.length, ...counts };
    console.info(`[people] ${out.length} townsfolk: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    return out;
  };

  const setup = async () => {
    const rand = rng(1399);
    for (const s of spread(rand)) {
      folk.push({
        i: s.i, j: s.j, home: [s.i, s.j], where: s.where, heading: rand() * Math.PI * 2, state: 'idle', until: rand() * 8,
        speed: 1.0 + rand() * 0.45, phase: rand() * 10, female: rand() < 0.45, rand, actor: null,
        look: lookOf(rand, 0.3),
      });
    }
    map.townFolk = folk; // (for the sound of a crowd: ambience.js)
    const [male, female] = await Promise.all([loadOutfit('Male_Peasant'), loadOutfit('Female_Peasant')]);
    if (!male || !female) return;
    // The pool: half men, half women; heads are made per person (cheap) when one is assigned.
    for (let n = 0; n < POOL; n++) {
      const isF = n % 2 === 1;
      const object = SkeletonUtils.clone((isF ? female : male).scene);
      const bones = {};
      object.traverse((o) => {
        if (o.isBone) bones[o.name] = o;
      });
      for (const b of Object.values(bones)) b.userData.rest = b.rotation.clone();
      // Each bone's rest orientation in the outfit's own frame (and its parent's), and the arms' direction in the
      // T-pose, so arms can be turned about the body's axes whatever the bones' own axes are (see pose()).
      object.updateMatrixWorld(true);
      const inv = object.getWorldQuaternion(new THREE.Quaternion()).invert();
      const frame = (o) => inv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
      for (const b of Object.values(bones)) {
        b.userData.W = frame(b);
        b.userData.Wp = frame(b.parent);
        b.userData.Wpi = b.userData.Wp.clone().invert();
      }
      const armDir = {};
      for (const sd of ['l', 'r']) {
        const u = bones[`upperarm_${sd}`];
        const l = bones[`lowerarm_${sd}`];
        if (!u || !l) continue;
        const pu = object.worldToLocal(u.getWorldPosition(new THREE.Vector3()));
        const pl = object.worldToLocal(l.getWorldPosition(new THREE.Vector3()));
        armDir[sd] = pl.sub(pu).normalize();
      }
      // The outfit's skeleton (its parts share it), where its skinned meshes hang, and its hands' material (made
      // its own, to take the face's colouring).
      let skinned = null;
      const handMats = [];
      object.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        skinned ??= o;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const own = mats.map((m) => (/Regular|Skin/i.test(m.name) ? (handMats.push(m.clone()), handMats[handMats.length - 1]) : m));
        o.material = Array.isArray(o.material) ? own : own[0];
      });
      const hold = new THREE.Group();
      hold.add(object);
      hold.visible = false; // (and out of the scene until someone is given it: its 70 bones cost every frame)
      // A crate, carried in front at chest height by the dock workers.
      const crate = new THREE.Mesh(crateGeo, crateMat);
      crate.position.set(0, 1.12, 0.32); // (held between the hands)
      crate.visible = false;
      hold.add(crate);
      pool.push({ hold, object, bones, armDir, crate, female: isF, head: null, who: null, skeleton: skinned.skeleton, bindMatrix: skinned.bindMatrix, skinParent: skinned.parent, handMats });
    }
    state = 'ready';
  };

  // Give the pool to the nearest people (each to one of matching sex).
  const assign = (me, cap = POOL / 2) => {
    const order = folk.map((f) => [f, me ? Math.hypot(f.i - me.i, f.j - me.j) : 0]).sort((x, y) => x[1] - y[1]);
    const want = new Set();
    const counts = [0, 0];
    for (const [f] of order) {
      const s = f.female ? 1 : 0;
      if (counts[s] < cap) {
        want.add(f);
        counts[s]++;
      }
    }
    for (const p of pool) {
      if (p.who && !want.has(p.who)) {
        p.who.actor = null;
        p.who = null;
        p.hold.visible = false;
        p.hold.removeFromParent();
      }
    }
    for (const f of want) {
      if (f.actor) continue;
      const p = pool.find((q) => !q.who && q.female === f.female);
      if (!p) continue;
      p.who = f;
      f.actor = p;
      undressHead(p);
      dressHead(p, f);
      p.hold.visible = true;
      root.add(p.hold);
    }
  };

  const pose = (p, walk, phase, t) => {
    const B = p.bones;
    // (Angles added to each bone's rest angles, as tried on the outfits: x swings a leg forward (-) or back, and
    // brings an arm down from the T-pose (-).)
    const set = (name, x, y = 0, z = 0) => {
      const b = B[name];
      if (!b) return;
      const r = b.userData.rest;
      b.rotation.set(r.x + x, r.y + y, r.z + z, r.order);
    };
    const s = Math.sin(phase);
    const sw = 0.42 * walk;
    // Legs stepping, the knee bending as each comes forward; a little breathing and sway when standing.
    const breathe = Math.sin(t * 1.7 + phase) * 0.02;
    // Arms: turned in the outfit's own frame (forward +z, up +y, its left +x), then put into each bone's frame:
    // local = (parent's rest frame)^-1 * turn * (bone's rest frame). Lowered from the T-pose to hang a little out
    // from the body, then swung forward and back about the body's side-to-side axis, opposite to the legs; the
    // elbows bend a little forward, more at the front of the swing.
    for (const sd of ['l', 'r']) {
      const up = B[`upperarm_${sd}`];
      const lo = B[`lowerarm_${sd}`];
      const dir = p.armDir?.[sd];
      if (!up || !lo || !dir) continue;
      const side = Math.sign(dir.x) || (sd === 'l' ? 1 : -1);
      _hang.set(side * 0.16, -1, 0.04).normalize();
      _qDown.setFromUnitVectors(dir, _hang);
      // (Carrying: both arms forward round the crate.)
      const swing = p.carrying ? 0.4 + breathe : (sd === 'l' ? -1 : 1) * s * 0.38 * walk + breathe;
      _qSwing.setFromAxisAngle(_X, -swing);
      _qTurn.multiplyQuaternions(_qSwing, _qDown);
      up.quaternion.copy(up.userData.Wpi).multiply(_qTurn).multiply(up.userData.W);
      const bend = p.carrying ? 1.15 : 0.25 + 0.3 * walk * Math.max(0, swing);
      _qTurn.setFromAxisAngle(_Y, -side * bend); // (in the T-pose frame: the forearm towards the front)
      lo.quaternion.copy(lo.userData.Wpi).multiply(_qTurn).multiply(lo.userData.W);
    }
    set('thigh_l', -sw * s, 0, 0);
    set('thigh_r', sw * s, 0, 0);
    set('calf_l', 0.7 * walk * Math.max(0, -Math.cos(phase)), 0, 0);
    set('calf_r', 0.7 * walk * Math.max(0, Math.cos(phase)), 0, 0);
    set('spine_01', 0.04 * walk, 0.05 * s * walk, 0);
    set('neck_01', 0, Math.sin(t * 0.3 + p.who.phase) * 0.25 * (1 - walk), 0);
  };

  const animate = (t) => {
    const dt = last == null ? 0 : Math.min(0.1, t - last);
    last = t;
    if (!eras.includes(map.era)) return;
    if (state === 'wait') {
      if (!map.bristol?.gardens?.[map.era] || !map.bristol.streetMasks || !map.objects.solid || !map.crossings) return;
      state = 'loading';
      setup();
      return;
    }
    if (state !== 'ready') return;
    const life = map.game?.life;
    const me = life?.state === 'on' ? life.pixelOf(map.game.head) : null;
    // Dock workers (once the ships are moored: townlife.js lists where they lie alongside, map.townDocks): two to a
    // ship, carrying crates between the cargo piled on the quay and the gangplank, some loading, some unloading.
    if (!docked && map.townDocks?.length) {
      docked = true;
      const rand = rng(1373);
      for (const d of map.townDocks) {
        for (let n = 0; n < 2; n++) {
          const loading = rand() < 0.5;
          folk.push({
            i: d.pi, j: d.pj, home: [d.pi, d.pj], where: 'dock', heading: 0, state: 'walk', until: 40, speed: 0.9 + rand() * 0.3,
            phase: rand() * 10, female: false, rand, actor: null, target: [d.qi, d.qj],
            job: { pile: [d.pi + (n - 0.5) * 1.2 / mpp, d.pj], quay: [d.qi, d.qj], loading, toQuay: true, wait: n * 3 }, carrying: loading,
            look: lookOf(rand, 0.4),
          });
        }
      }
      map.peopleCount = { ...(map.peopleCount ?? {}), dock: map.townDocks.length * 2 };
    }
    if (!!me !== wasLife || warmFrom == null) {
      wasLife = !!me;
      warmFrom = t;
    }
    const cap = Math.min(POOL / 2, WARM + Math.floor((t - warmFrom) / 0.5));
    if (t - lastAssign > (cap < POOL / 2 ? 0.5 : 1)) {
      lastAssign = t;
      assign(me, cap);
    }
    for (const f of folk) {
      if (f.job) {
        // Back and forth: at the gangplank the crate is handed over (or taken), at the pile it's set down (or picked up).
        const J = f.job;
        if (J.wait > 0) {
          J.wait -= dt;
          f.state = 'idle';
        } else {
          const tgt = J.toQuay ? J.quay : J.pile;
          const dx = tgt[0] - f.i;
          const dj = tgt[1] - f.j;
          const d = Math.hypot(dx, dj);
          const step = (f.speed * dt) / mpp;
          const mineNow = me ? Math.hypot(f.i - me.i, f.j - me.j) * mpp : Infinity;
          if (d < 0.15) {
            // Arrived: pick up or put down, and pause.
            f.carrying = J.loading ? !J.toQuay : J.toQuay;
            J.toQuay = !J.toQuay;
            J.wait = 1.5 + f.rand() * 2.5;
          } else if (!(me && mineNow < SHY)) {
            f.state = 'walk';
            f.i += (dx / d) * Math.min(step, d);
            f.j += (dj / d) * Math.min(step, d);
            const want = Math.atan2(dx, dj);
            const turn = ((want - f.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            f.heading += turn * Math.min(1, dt * 6);
            f.phase += dt * f.speed * 4.2;
          } else f.state = 'idle';
        }
        const p = f.actor;
        if (!p) continue;
        const mine = me ? Math.hypot(f.i - me.i, f.j - me.j) * mpp : Infinity;
        p.walkBlend = THREE.MathUtils.lerp(p.walkBlend ?? 0, f.state === 'walk' ? 1 : 0, Math.min(1, dt * 4));
        p.carrying = f.carrying;
        p.crate.visible = !!f.carrying;
        p.hold.position.set((f.i - a.i) * mpp, ground(f.i, f.j), (f.j - a.j) * mpp);
        p.hold.rotation.y = f.heading;
        p.hold.visible = mine > 0.8;
        pose(p, p.walkBlend, f.phase, t);
        continue;
      }
      // Strolling to a spot nearby that can be reached in a straight line; standing a while; out of your way.
      f.until -= dt;
      const mine = me ? Math.hypot(f.i - me.i, f.j - me.j) * mpp : Infinity;
      escaping = !!map.propBlocked?.(f.i, f.j);
      if (f.state === 'idle' && f.until <= 0) {
        // (A few tries: among the stalls most straight lines are blocked, and they'd stand about for good.)
        let tgt = null;
        for (let tries = 0; tries < 6 && !tgt; tries++) {
          const ang = f.rand() * Math.PI * 2;
          const d = ((tries > 2 ? 3 : 4) + f.rand() * (tries > 2 ? 8 : 18)) / mpp;
          const t = [f.home[0] + Math.cos(ang) * d, f.home[1] + Math.sin(ang) * d];
          if (clearLine([f.i, f.j], t)) tgt = t;
        }
        if (tgt) {
          f.target = tgt;
          f.state = 'walk';
          f.until = 40;
        } else f.until = 1 + f.rand() * 3;
      } else if (f.state === 'walk') {
        const dx = f.target[0] - f.i;
        const dj = f.target[1] - f.j;
        const d = Math.hypot(dx, dj);
        const step = (f.speed * dt) / mpp;
        const ni = f.i + (dx / (d || 1)) * Math.min(step, d);
        const nj = f.j + (dj / (d || 1)) * Math.min(step, d);
        const crowd = me && Math.hypot(ni - me.i, nj - me.j) * mpp < Math.min(SHY, mine);
        if (!crowd && free(ni, nj)) {
          f.i = ni;
          f.j = nj;
          const want = Math.atan2(dx, dj);
          const turn = ((want - f.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          f.heading += turn * Math.min(1, dt * 5);
          f.phase += dt * f.speed * 4.2;
          f.stuck = 0;
        } else f.stuck = (f.stuck ?? 0) + dt;
        // (Blocked, by a stall or someone's cart, they stop and think again: not stand frozen mid-stride.)
        if (crowd || d < 0.3 || f.until <= 0 || f.stuck > 0.25) {
          f.stuck = 0;
          f.state = 'idle';
          f.until = 3 + f.rand() * 12;
        }
      }
      const p = f.actor;
      if (!p) continue;
      p.walkBlend = THREE.MathUtils.lerp(p.walkBlend ?? 0, f.state === 'walk' ? 1 : 0, Math.min(1, dt * 4));
      p.carrying = false;
      p.crate.visible = false;
      p.hold.position.set((f.i - a.i) * mpp, ground(f.i, f.j), (f.j - a.j) * mpp);
      p.hold.rotation.y = f.heading;
      p.hold.visible = mine > 0.8;
      pose(p, p.walkBlend, f.phase, t);
    }
  };
  const dispose = () => freeSkeletons(pool.map((p) => p.hold));
  return [{ ...a, model: { group: root, top: 2 }, era: eras, trueSize: true, baseAlt: 0, far: true, animate, dispose }];
}
