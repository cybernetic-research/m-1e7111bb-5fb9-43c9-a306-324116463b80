import * as THREE from 'three';
import { natureParts } from './nature.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RES } from './terrain.js';
import { MARKETS } from './bristol.js';

// Trees from Quaternius's Stylized Nature MegaKit (CC0; assets/models/nature), planted in c.1400 and c.1650 where
// trees would grow: in the gardens and orchards behind the houses, along the riverbanks, in copses and along field
// edges outside the town, and the odd dead one. Each spot is tested on a jittered grid against the town's masks:
// never on a street, in the water, in or against a building, on a bridge or a floor, nor in a market place. Their
// kind, size and turn vary at random (seeded), so no pattern repeats. Drawn as instances, within VIEW metres of you
// (the set follows you as you walk): the kit's models (some 3,000-6,500 triangles each) within NEAR, and beyond
// that the same trees simplified with meshoptimizer (the *_far files, about 800-1,500 triangles: the bark cut
// hardest, the leaves kept for the crown's shape). On the table, where they're tiny and all of them show, a picture
// of each on two crossed boards, made once from the model. Counted in map.treeCount.

const VIEW = 130; // (fading into the fog, fog.js)
const NEAR = 70;
const REFRESH = 25;
const MAX = 900;
// [model, weight, height range (m) in which it's scaled]
const KINDS = [
  ['CommonTree_1', 2, [7, 11]], ['CommonTree_2', 2, [6, 10]], ['CommonTree_3', 3, [5, 9]], ['CommonTree_4', 3, [5, 9]],
  ['CommonTree_5', 3, [4, 8]], ['DeadTree_2', 0.3, [4, 7]], ['DeadTree_4', 0.2, [4, 7]],
];

// The far picture of a tree: the model drawn once, side on, into a texture (lit softly from the front and above),
// shown on two boards crossing at right angles. Its boards' normals point up, so the sky lights them evenly.
const impostors = new Map();
function impostor(name, list, renderer) {
  if (impostors.has(name)) return impostors.get(name);
  const scene = new THREE.Scene();
  // (Its colours unlit, shaded only by a darkening towards the trunk and underneath: the boards are lit in the
  // scene like everything else.)
  for (const { geometry, material } of list) {
    const m = new THREE.MeshBasicMaterial({ map: material.map, color: material.color, alphaTest: 0.4, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;')
        .replace('#include <dithering_fragment>', 'gl_FragColor.rgb *= 0.62 + 0.38 * clamp(length(vP.xz) * 3.0, 0.0, 1.0) * (0.75 + 0.25 * vP.y);\n#include <dithering_fragment>');
    };
    scene.add(new THREE.Mesh(geometry, m));
  }
  const box = new THREE.Box3().setFromObject(scene);
  const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 0.2) * 1.02;
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, 1.01, -0.01, -5, 5);
  cam.position.set(0, 0, 2);
  const rt = new THREE.WebGLRenderTarget(Math.round(256 * w), 256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  // (Not to the headset: with XR on, three would draw with the headset's cameras instead.)
  const xr = renderer.xr.enabled;
  const before = renderer.getRenderTarget();
  const clear = renderer.getClearAlpha();
  const clearColour = renderer.getClearColor(new THREE.Color());
  renderer.xr.enabled = false;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x2e3a1e, 0); // (leaf-coloured, so the edges don't darken)
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(before);
  renderer.setClearColor(clearColour, clear);
  renderer.xr.enabled = xr;
  for (const o of scene.children) o.material?.dispose();
  const a = new THREE.PlaneGeometry(w, 1.02).translate(0, 0.5, 0);
  // (Each board twice, back to back, drawn one-sided: a double-sided board's back turns its normal down, and the
  // trees seen from that side were lit from the ground, nearly black.)
  const geometry = mergeGeometries([0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((r) => a.clone().rotateY(r)));
  const nrm = geometry.attributes.normal;
  for (let k = 0; k < nrm.count; k++) nrm.setXYZ(k, 0, 1, 0);
  geometry.userData.keep = true;
  const out = { geometry, material: new THREE.MeshLambertMaterial({ map: rt.texture, alphaTest: 0.35 }) };
  impostors.set(name, out);
  return out;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
// Smooth value noise (for copses: trees gather where it's high).
function noise(x, y) {
  const h = (i, j) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  return h(i, j) * (1 - u) * (1 - v) + h(i + 1, j) * u * (1 - v) + h(i, j + 1) * (1 - u) * v + h(i + 1, j + 1) * u * v;
}

export function townTrees(ctx, { eras }) {
  const map = ctx.map;
  const mpp = ctx.metresPerPixel;
  const a = { i: (RES - 1) / 2, j: (RES - 1) / 2 };
  const root = new THREE.Group();
  let trees = null; // [{ x, z, y, s, rot, kind }] (metres in this item's frame)
  let meshes = [];
  let centre = null;
  let lastFill = -Infinity;
  const _h = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _up = new THREE.Vector3(0, 1, 0);

  const plant = () => {
    const b = map.bristol;
    const era = map.era;
    const garden = b.gardens?.[era];
    const town = b.towns?.[era];
    const street = b.streetMasks?.[era];
    const solid = map.objects.solid;
    const rand = rng(1381);
    const K = (i, j) => Math.round(j) * RES + Math.round(i);
    const wet = (q) => b.frome?.[q] || b.harbour?.[q] || b.pool?.[q] || map.seaMask?.[q];
    const markets = MARKETS.map((mk) => mk.poly.map(([lat, lon]) => {
      const w = map.source.toWindow(lat, lon);
      return [w.i, w.j];
    }));
    const inPoly = (i, j, poly) => {
      let r = false;
      for (let n = 0, m = poly.length - 1; n < poly.length; m = n++) if ((poly[n][1] > j) !== (poly[m][1] > j) && i < ((poly[m][0] - poly[n][0]) * (j - poly[n][1])) / (poly[m][1] - poly[n][1]) + poly[n][0]) r = !r;
      return r;
    };
    // Clear of streets, water and buildings by about r metres.
    const clear = (i, j, r) => {
      const d = Math.ceil(r / mpp);
      for (let dj = -d; dj <= d; dj++) {
        for (let di = -d; di <= d; di++) {
          if (di * di + dj * dj > d * d) continue;
          const q = K(i + di, j + dj);
          if (street?.[q] || wet(q) || solid?.[q]) return false;
        }
      }
      return true;
    };
    const crownBlocked = (i, j, r) => {
      for (let n = 0; n < 8; n++) {
        const t = (n / 8) * Math.PI * 2;
        for (const f of [0.5, 1]) if (map.blockedAt(i + (Math.cos(t) * r * f) / mpp, j + (Math.sin(t) * r * f) / mpp)) return true;
      }
      return false;
    };
    const ground = (i, j) => {
      const g = map.ground ? map.sample(i, j, map.ground) : NaN;
      return Number.isFinite(g) ? g : ctx.terrainAny(i, j);
    };
    const weights = KINDS.reduce((s, k) => s + k[1], 0);
    const pick = () => {
      let r = rand() * weights;
      for (let n = 0; n < KINDS.length; n++) if ((r -= KINDS[n][1]) < 0) return n;
      return 0;
    };
    const out = [];
    const counts = { garden: 0, river: 0, field: 0 };
    const step = 5 / mpp;
    for (let j = 4; j < RES - 4; j += step) {
      for (let i = 4; i < RES - 4; i += step) {
        const ti = i + (rand() - 0.5) * step;
        const tj = j + (rand() - 0.5) * step;
        const q = K(ti, tj);
        // Where it is, and how likely a tree is there.
        let where = null;
        let p = 0;
        if (garden?.[q]) [where, p] = ['garden', 0.32];
        else if (b.nearWater?.[q] > 0.05 && !b.fromeQuay?.[q]) [where, p] = ['river', 0.3];
        else if (town && !town[q]) {
          // Copses and hedgerow lines out in the fields.
          const n = noise((ti * mpp) / 60, (tj * mpp) / 60);
          const hedge = Math.abs(noise((ti * mpp) / 140 + 7, (tj * mpp) / 140) - 0.5) < 0.03;
          [where, p] = ['field', n > 0.74 ? 0.4 : hedge ? 0.35 : 0.008];
        }
        if (!where || rand() > p) continue;
        if (!clear(ti, tj, where === 'garden' ? 2.5 : 3.5) || map.blockedAt(ti, tj) || map.features.walkHeight(ti, tj) != null) continue;
        // Its crown clear of walls, towers, gatehouses and buildings (about 4 m round), and none in the castle.
        if (b.castleWard?.[q] || crownBlocked(ti, tj, where === 'garden' ? 3 : 4)) continue;
        if (markets.some((m) => inPoly(ti, tj, m))) continue;
        const kind = pick();
        const [h0, h1] = KINDS[kind][2];
        out.push({ x: (ti - a.i) * mpp, z: (tj - a.j) * mpp, y: ground(ti, tj) - 0.1, s: h0 + rand() * (h1 - h0), rot: rand() * Math.PI * 2, kind, lean: (rand() - 0.5) * 0.06, where });
        counts[where]++;
      }
    }
    // At most MAX in a window (the fields beyond the town can be wide), a random choice.
    for (let n = out.length - 1; n > 0; n--) {
      const r = Math.floor(rand() * (n + 1));
      [out[n], out[r]] = [out[r], out[n]];
    }
    if (out.length > MAX) {
      for (const t of out.slice(MAX)) counts[t.where]--;
      out.length = MAX;
    }
    trees = out;
    map.treeCount = { total: out.length, ...counts };
    console.info(`[trees] ${out.length} planted (${counts.garden} in gardens, ${counts.river} by the water, ${counts.field} in the fields)`);
  };

  const build = async () => {
    const loaded = await Promise.all(KINDS.map(([name]) => natureParts(name)));
    const simple = await Promise.all(KINDS.map(([name]) => natureParts(name + '_far')));
    meshes = [];
    loaded.forEach((list, kind) => {
      const n = trees.filter((t) => t.kind === kind).length;
      // tier: 'near' (the model), 'far' (simplified), 'board' (the table's picture)
      const add = (geometry, material, tier) => {
        const m = new THREE.InstancedMesh(geometry, material, Math.max(1, n));
        m.count = 0;
        m.frustumCulled = false;
        m.userData.kind = kind;
        m.userData.tier = tier;
        root.add(m);
        meshes.push(m);
      };
      for (const { geometry, material } of list) add(geometry, material, 'near');
      // (The simplified model's materials are the same textures: the model's own used, sharing their programs.)
      if (list.length) simple[kind].forEach(({ geometry }, n) => add(geometry, (list[n] ?? list[0]).material, 'far'));
      if (list.length) {
        const im = impostor(KINDS[kind][0], list, map.game.renderer);
        add(im.geometry, im.material, 'board');
      }
    });
    centre = null;
  };

  const fill = (cx, cz, near = NEAR) => {
    for (const m of meshes) m.count = 0;
    for (const t of trees) {
      if (Math.hypot(t.x - cx, t.z - cz) > VIEW) continue;
      _q.setFromAxisAngle(_up, t.rot);
      _m.compose(new THREE.Vector3(t.x, t.y, t.z), _q, new THREE.Vector3(t.s * (0.9 + t.lean), t.s, t.s * (0.9 - t.lean)));
      const tier = Math.hypot(t.x - cx, t.z - cz) > near ? 'far' : 'near';
      for (const m of meshes) if (m.userData.kind === t.kind && m.userData.tier === tier) m.setMatrixAt(m.count++, _m);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    centre = [cx, cz];
  };

  let state = 'wait';
  let lifeFrom = null;
  let warmed = false;
  const WARM_S = 4;
  const animate = (t) => {
    if (!eras.includes(map.era)) return;
    if (state === 'wait') {
      if (!map.bristol?.gardens?.[map.era] || !map.bristol.streetMasks || !map.objects.solid || !map.crossings) return;
      state = 'building';
      plant();
      build().then(() => (state = 'ready'));
      return;
    }
    if (state !== 'ready') return;
    root.updateWorldMatrix(true, false);
    root.worldToLocal(_h.copy(map.game.head));
    const life = map.game?.life?.state === 'on';
    // On the table, all of them (they're tiny); at life size, those within VIEW of you.
    if (!life) {
      // On the table, only those on the round map: refilled as the view is panned or zoomed.
      const h = map.holder;
      const view = `${h.position.x.toFixed(4)},${h.position.z.toFixed(4)},${h.rotation.y.toFixed(3)},${h.scale.x.toFixed(3)},${root.scale.x}`;
      if (centre?.[0] !== Infinity || view !== tableView) {
        fillAll();
        centre = [Infinity, Infinity];
        tableView = view;
      }
    } else {
      // Just gone in at life size: the simplified trees only for the first few seconds (while everything else is
      // being made and drawn for the first time), then the full ones near you.
      if (lifeFrom == null) lifeFrom = t;
      const warm = t - lifeFrom < WARM_S;
      if (warmed && !warm) {
        warmed = false;
        centre = null;
      }
      if ((!centre || centre[0] === Infinity || Math.hypot(_h.x - centre[0], _h.z - centre[1]) > REFRESH) && (t - lastFill > 1 || !centre)) {
        lastFill = t;
        fill(_h.x, _h.z, warm ? 0 : NEAR);
        if (warm) warmed = true;
      }
    }
    if (!life) lifeFrom = null;
  };
  let tableView = '';
  const _c = new THREE.Vector3();
  const fillAll = () => {
    for (const m of meshes) m.count = 0;
    const o = root.position;
    const k = root.scale.x;
    for (const t of trees) {
      if (!map.onMap(_c.set(o.x + t.x * k, 0, o.z + t.z * k))) continue;
      _q.setFromAxisAngle(_up, t.rot);
      _m.compose(new THREE.Vector3(t.x, t.y, t.z), _q, new THREE.Vector3(t.s, t.s, t.s));
      for (const m of meshes) if (m.userData.kind === t.kind && m.userData.tier === 'board') m.setMatrixAt(m.count++, _m);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  };
  return [{ ...a, model: { group: root, top: 10 }, era: eras, trueSize: true, baseAlt: 0, far: true, animate }];
}
