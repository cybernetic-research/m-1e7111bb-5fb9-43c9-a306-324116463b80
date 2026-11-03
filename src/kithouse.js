import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { metreUVs } from './textures.js';

// Houses and shops you can walk into, built from Quaternius's Medieval Village MegaKit (CC0; assets/models/megakit):
// timber-framed walls 2 m wide and 3.12 m high, wood and brick floors, tiled roofs, gable fronts, doors, shutters,
// a chimney. A house's front (its gable, as was usual in Bristol) faces the street; its door stands open, or a shop
// is open to the street through arches, with goods inside. Each house is assembled from the pieces and merged into a
// mesh per material, so a whole street of them costs a handful of draw calls.

const DIR = 'assets/models/megakit/';
const loader = new GLTFLoader();
const pieces = new Map(); // name -> Promise<[{ geometry, material }]>, each geometry in the piece's own frame
const materials = new Map(); // one material per name across all the pieces (so textures load once)

export function piece(name) {
  if (!pieces.has(name)) {
    pieces.set(name, loader.loadAsync(DIR + name + '.gltf').then((gltf) => {
      const out = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
        for (const a of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(a)) geometry.deleteAttribute(a);
        const m = o.material;
        if (!materials.has(m.name)) {
          // (Some of the kit's materials leave metalness at glTF's default of 1, which renders black without an
          // environment map: none of them is metal.)
          m.metalness = 0;
          m.roughness = Math.max(m.roughness, 0.75);
          // (The kit's round tiles are a bright new orange: weathered down for the roofs that aren't tinted house
          // by house, the churches' and the friary's.)
          if (m.name === 'MI_RoundTiles') m.color.setRGB(0.6, 0.47, 0.42);
          materials.set(m.name, m);
        }
        out.push({ geometry: geometry.index ? geometry.toNonIndexed() : geometry, material: materials.get(m.name) });
      });
      return out;
    }).catch(() => []));
  }
  return pieces.get(name);
}

// Goods on a shop's counter and shelves: bolts of cloth, sacks, pots.
const GOODS = Object.fromEntries(Object.entries({ GOODS_RED: 0x8a2a22, GOODS_BLUE: 0x2a3e6a, GOODS_OCHRE: 0xb08a3a, GOODS_GREEN: 0x3e5a2e, GOODS_BREAD: 0xa8743a, GOODS_PALE: 0xd8c08a, BARREL: 0x3a3532, BACKING: 0x3b2a1e })
  .map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })]));

const H = 3.12; // a storey
const M = 2; // a wall module

// Roofs in the kit, by width x depth (metres); a jettied front needs one 2 m deeper.
const ROOFS = new Set(['4x6', '4x8', '6x6', '6x8', '6x10', '8x8', '8x10', '8x12', '8x14']);
const J = 1.12; // how far a jettied upper storey oversails the street (the kit's short overhang)

// The plan of a house: its pieces, each with a matrix (in the house's frame: x along the street, y up, z out
// towards the street; the front wall on z = 0, the house behind it), the walls you can't walk through (segments in
// metres with the doorway left open), and the floor inside.
//   w, d: modules across the front and in depth.
//   kind: 'house' (a hearth, table and benches), 'shop' (open to the street through arches, a counter and shelves of
//     goods), 'pub' (an alehouse: a door and windows, tables and benches, barrels, a hearth and a sign over the
//     street) or 'hall' (a guildhall: a stone ground floor, long tables, a hearth).
//   jetty: the upper storey oversails the front on brackets, as most of Bristol's timber houses did (where the kit
//     has a roof deep enough).
//   sign: { text, bg, fg } painted on a board hung over the street.
//   goods: the colours of a shop's wares (keys of GOODS).
// storeys: 2 (the default) or more (the upper ones like the first floor, unjettied above it).
export function housePlan(args) {
  const plan = housePlanOf(args);
  plan.key = JSON.stringify(args); // (the same arguments make the same house: buildHouses caches by it)
  return plan;
}
function housePlanOf({ w = 3, d = 4, shop = false, kind = shop ? 'shop' : 'house', brick = false, seed = 0.5, jetty = false, sign = null, goods = null, storeys }) {
  shop = kind === 'shop';
  const W = w * M;
  const D = d * M;
  jetty = jetty && ROOFS.has(`${W}x${D + 2}`);
  const list = [];
  const mat = (x, y, z, ry = 0) => new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  const add = (name, m) => list.push({ name, m });
  const rnd = (k) => {
    const s = Math.sin(seed * 9301 + k * 49297) * 233280;
    return s - Math.floor(s);
  };
  // (One house or shop in four of three storeys (more rooms over the street, a taller frontage and a broken
  // roofline), unless told; and two in five shops with a painted sign of their trade hung over the street.)
  storeys ??= (kind === 'house' || kind === 'shop') && rnd(72) < 0.25 ? 3 : 2;
  if (!sign && kind === 'shop' && rnd(73) < 0.4) sign = { icon: ICONS[Math.floor(rnd(74) * ICONS.length) % ICONS.length], bg: SIGN_BG[Math.floor(rnd(75) * SIGN_BG.length) % SIGN_BG.length] };
  const stone = brick || kind === 'hall';
  const plain = stone ? 'Wall_UnevenBrick_Straight' : rnd(31) < 0.5 ? 'Wall_Plaster_Straight_Base' : 'Wall_Plaster_Straight';
  const doorAt = Math.floor(w / 2);
  const F = jetty ? J : 0; // where the upper storey's front stands
  // Walls: front (z = 0, facing +z), back (z = -D, facing -z), sides (x = -W/2 facing -x, x = W/2 facing +x).
  // (The kit's walls face +z: their outer face is the thin side at z = 0.09.)
  const box = (material, sx, sy, sz, x, y, z) => list.push({ geometry: metreUVs(new THREE.BoxGeometry(sx, sy, sz), 1).translate(x, y, z), material });
  const S = Math.max(2, storeys);
  for (let storey = 0; storey < S; storey++) {
    const y = storey * H;
    const upper = storey > 0; // (the upper storeys' walls: their windows and timbering)
    for (let k = 0; k < w; k++) {
      const x = -W / 2 + M / 2 + k * M;
      if (storey === 0) {
        let front;
        if (shop) front = 'Wall_Arch';
        else if (k === doorAt) front = stone ? 'Wall_UnevenBrick_Door_Round' : 'Wall_Plaster_Door_Flat';
        else front = stone ? (kind === 'hall' ? 'Wall_UnevenBrick_Window_Thin_Round' : 'Wall_UnevenBrick_Window_Wide_Round') : 'Wall_Plaster_Window_Wide_Flat';
        add(front, mat(x, y, 0, 0));
        // A frame round the door; shutters at a house's windows, closed at some.
        if (!shop && k === doorAt) add(stone ? 'DoorFrame_Round_Brick' : 'DoorFrame_Flat_WoodDark', mat(x, y, 0.02, 0));
        if (front === 'Wall_Plaster_Window_Wide_Flat') add(rnd(k + 40) < 0.35 ? 'WindowShutters_Wide_Flat_Closed' : 'WindowShutters_Wide_Flat_Open', mat(x, y, 0.05, 0));
        if (front === 'Wall_UnevenBrick_Window_Thin_Round') add('WindowShutters_Thin_Round_Closed', mat(x, y, 0.05, 0));
      } else if (jetty && storey === 1) {
        // The jetty: the upper wall oversails the one below on a coved underside, with a window in each bay.
        add('Overhang_Plaster_Short', mat(x, y, 0, 0));
        if (rnd(k + 50) < 0.6) {
          add('Window_Wide_Flat1', mat(x, y, F - 0.12, 0));
          add('WindowShutters_Wide_Flat_Open', mat(x, y, F + 0.02, 0));
        } else add('WindowShutters_Wide_Flat_Closed', mat(x, y, F + 0.04, 0));
      } else {
        const front = rnd(k + storey * 7) < 0.5 ? 'Wall_Plaster_Window_Wide_Flat' : 'Wall_Plaster_WoodGrid';
        add(front, mat(x, y, F, 0));
        if (front === 'Wall_Plaster_Window_Wide_Flat') add('WindowShutters_Wide_Flat_Open', mat(x, y, F + 0.05, 0));
      }
      add(upper && rnd(k + 9 + storey) < 0.4 ? 'Wall_Plaster_Window_Thin_Round' : upper ? 'Wall_Plaster_WoodGrid' : plain, mat(x, y, -D, Math.PI));
    }
    for (let k = 0; k < d; k++) {
      const z = -M / 2 - k * M;
      const win = upper && k % 2 === 1;
      add(win ? 'Wall_Plaster_Window_Thin_Round' : upper ? 'Wall_Plaster_WoodGrid' : plain, mat(-W / 2, y, z, -Math.PI / 2));
      add(win ? 'Wall_Plaster_Window_Thin_Round' : upper ? 'Wall_Plaster_WoodGrid' : plain, mat(W / 2, y, z, Math.PI / 2));
      // (Above a jetty the side walls' front bays stand forward with it.)
      if (jetty && storey > 1 && k === 0) for (const sx of [-1, 1]) box('MI_Plaster', 0.18, H, F, sx * (W / 2 - 0.02), y + H / 2, F / 2);
    }
    // Corner posts; a stone house's ground floor has dressed quoins (cheaper than the kit's carved stone corner).
    for (const [x, z] of [[-W / 2, storey ? F : 0], [W / 2, storey ? F : 0], [-W / 2, -D], [W / 2, -D]]) {
      if (stone && storey === 0) list.push({ geometry: metreUVs(new THREE.BoxGeometry(0.42, H, 0.42), 1).translate(x, H / 2, z - Math.sign(z + 0.01) * 0.05), material: 'MI_RockTrim' });
      else add('Corner_Exterior_Wood', mat(x, y, z));
    }
  }
  if (jetty) {
    // The jetty's sides, its floor joists' ends, and a curved bracket under each post.
    for (const sx of [-1, 1]) {
      box('MI_Plaster', 0.18, H, F, sx * (W / 2 - 0.02), H * 1.5, F / 2);
      box('MI_WoodTrim', 0.2, 0.2, F + 0.1, sx * (W / 2 - 0.02), H + 0.05, F / 2);
    }
    for (let k = 0; k <= w; k++) {
      const x = -W / 2 + k * M;
      list.push({ name: 'Prop_Support', m: new THREE.Matrix4().makeTranslation(x, H - 2.92 * 0.58 + 0.05, 0.05).multiply(new THREE.Matrix4().makeScale(1, 0.58, 0.58)) });
    }
    box('MI_WoodTrim', W + 0.1, 0.16, 0.16, 0, H + 0.08, F - 0.05);
  }
  // A kerb of stone along the front.
  if (!shop) for (let k = 0; k < w; k++) add('Prop_ExteriorBorder_Straight1', mat(-W / 2 + M / 2 + k * M, 0, 0.06, 0));
  // Floors: the ground floor (brick in a shop, boards elsewhere) and the floor above (the ceiling below).
  for (let i = 0; i < w; i++) {
    for (let k = 0; k < d; k++) {
      const x = -W / 2 + M / 2 + i * M;
      const z = -M / 2 - k * M;
      add(shop || kind === 'hall' ? 'Floor_Brick' : 'Floor_WoodDark', mat(x, 0.02, z));
      for (let s = 1; s < S; s++) add('Floor_WoodDark', mat(x, s * H, z));
    }
  }
  // The roof, its ridge running back from the street (a gable front), the gable ends filled, and a chimney (of
  // stone or brick).
  const RD = D + (jetty ? 2 : 0);
  const RY = S * H;
  add(`Roof_RoundTiles_${W}x${RD}`, mat(0, RY, jetty ? -D / 2 + 0.56 : -D / 2));
  add(`Roof_Front_Brick${W}`, mat(0, RY, F, 0));
  add(`Roof_Front_Brick${W}`, mat(0, RY, -D, Math.PI));
  add('Roof_FrontSupports', mat(0, RY - 0.05, F + 0.02, 0));
  add(rnd(33) < 0.5 || stone ? 'Prop_Chimney2' : 'Prop_Chimney', mat(W / 2 - 0.9, RY + 0.6, -D + 1.2));
  if (kind === 'hall' || kind === 'pub') add('Prop_Chimney2', mat(-W / 2 + 0.9, RY + 0.6, -D * 0.55));
  // The door, standing open; a stair up the back wall (to the floor above, which you can't reach).
  if (!shop) add(stone ? 'Door_8_Round' : rnd(34) < 0.5 ? 'Door_1_Flat' : 'Door_4_Flat', mat(-W / 2 + M / 2 + doorAt * M - 0.53, 0, -0.12, -1.3));
  add('Stair_Interior_Simple', mat(W / 2 - 0.9, 0, -D + 0.2, Math.PI));
  // Now and then ivy up a wall.
  if (!shop && rnd(35) < 0.25) add(rnd(36) < 0.5 ? 'Prop_Vine4' : 'Prop_Vine5', mat(-W / 2 + 0.6, 0, 0.12, 0));
  // Furnishings (conjectural), as boxes and cylinders in the kit's materials, and the fire in a hearth.
  const fires = [];
  const furniture = [];
  const hearth = () => {
    // A hearth against the side wall, its chimney breast above, and the fire in it.
    const hz = -D * 0.55;
    box('MI_Brick', 0.8, 0.5, 1.6, -W / 2 + 0.45, 0.25, hz);
    box('MI_Brick', 0.7, 2.4, 1.6, -W / 2 + 0.4, 1.9, hz);
    box('MI_Brick', 0.2, 0.9, 1.6, -W / 2 + 0.75, 0.95, hz - 0.7);
    box('MI_Brick', 0.2, 0.9, 1.6, -W / 2 + 0.75, 0.95, hz + 0.7);
    fires.push([-W / 2 + 0.55, 0.5, hz]);
    furniture.push({ a: [-W / 2 + 0.4, hz - 0.8], b: [-W / 2 + 0.4, hz + 0.8], half: 0.5 });
  };
  // A trestle table with a bench each side, along z (len metres) or across.
  const table = (tx, tz, len = 1.7, across = false) => {
    const [lx, lz] = across ? [len, 0.85] : [0.85, len];
    box('MI_WoodTrim', lx, 0.06, lz, tx, 0.76, tz);
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box('MI_WoodTrim', 0.08, 0.74, 0.08, tx + ox * (lx / 2 - 0.1), 0.37, tz + oz * (lz / 2 - 0.1));
    for (const sd of [-1, 1]) {
      if (across) box('MI_WoodTrim', len - 0.1, 0.45, 0.3, tx, 0.22, tz + sd * 0.75);
      else box('MI_WoodTrim', 0.3, 0.45, len - 0.1, tx + sd * 0.75, 0.22, tz);
    }
    furniture.push(across ? { a: [tx - len / 2, tz], b: [tx + len / 2, tz], half: 0.95 } : { a: [tx, tz - len / 2], b: [tx, tz + len / 2], half: 0.95 });
  };
  const barrel = (x, z, r = 0.32, h = 0.85, y = 0) => {
    list.push({ geometry: metreUVs(new THREE.CylinderGeometry(r * 0.88, r * 0.88, h, 10), 1).translate(x, y + h / 2, z), material: 'MI_WoodTrim' });
    list.push({ geometry: new THREE.CylinderGeometry(r, r, h * 0.6, 10).translate(x, y + h / 2, z), material: 'BARREL' });
  };
  if (shop) {
    // A counter across the shop, shelves of goods along the back, crates by the door.
    const cx0 = -W / 2 + 0.5;
    const cx1 = W / 2 - 1.9;
    box('MI_WoodTrim', cx1 - cx0, 0.95, 0.6, (cx0 + cx1) / 2, 0.47, -2.4);
    furniture.push({ a: [cx0, -2.4], b: [cx1, -2.4], half: 0.45 });
    for (const y of [0.5, 1.15, 1.8]) box('MI_WoodTrim', W - 2.2, 0.06, 0.45, -1.0, y, -D + 0.45);
    furniture.push({ a: [-W / 2 + 0.2, -D + 0.45], b: [W / 2 - 2.1, -D + 0.45], half: 0.4 });
    const wares = goods ?? ['GOODS_RED', 'GOODS_BLUE', 'GOODS_OCHRE', 'GOODS_GREEN'];
    for (let k = 0; k < 9; k++) {
      const g = wares[Math.floor(rnd(k + 20) * wares.length)];
      box(g, 0.35, 0.22, 0.3, -W / 2 + 0.6 + (k % 3) * 0.55 + rnd(k) * 0.2, [0.64, 1.29, 1.94][Math.floor(k / 3)], -D + 0.45);
      if (k < 5) box(g, 0.4, 0.15, 0.3, cx0 + 0.4 + k * 0.6, 1.02, -2.4);
    }
    add('Prop_Crate', mat(-W / 2 + 0.7, 0, -0.9, rnd(3)));
    add('Prop_Crate', mat(W / 2 - 0.7, 0, -0.9, rnd(4)));
    furniture.push({ a: [-W / 2 + 0.7, -0.9], b: [-W / 2 + 0.71, -0.9], half: 0.6 }, { a: [W / 2 - 0.7, -0.9], b: [W / 2 - 0.69, -0.9], half: 0.6 });
  } else if (kind === 'pub') {
    // An alehouse: a hearth, tables with benches, barrels racked along the back, and a serving board with jugs.
    hearth();
    table(0.3, -D * 0.35, 1.6);
    table(0.3, -D * 0.72, 1.6);
    if (W >= 8) table(W / 2 - 2, -D * 0.5, 1.6);
    for (let k = 0; k < Math.floor((W - 2.6) / 0.75); k++) barrel(-W / 2 + 1.4 + k * 0.75, -D + 0.45);
    for (let k = 0; k < Math.floor((W - 3.4) / 0.75); k++) barrel(-W / 2 + 1.8 + k * 0.75, -D + 0.45, 0.32, 0.85, 0.87);
    furniture.push({ a: [-W / 2 + 1.1, -D + 0.45], b: [W / 2 - 1.9, -D + 0.45], half: 0.45 });
    box('MI_WoodTrim', 1.8, 0.95, 0.5, W / 2 - 2.3, 0.47, -D + 1.6);
    for (let k = 0; k < 3; k++) list.push({ geometry: new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8).translate(W / 2 - 2.9 + k * 0.5, 1.06, -D + 1.6), material: 'GOODS_OCHRE' });
    furniture.push({ a: [W / 2 - 3.2, -D + 1.6], b: [W / 2 - 1.4, -D + 1.6], half: 0.4 });
  } else if (kind === 'hall') {
    // The guild's hall: long tables down the room, the master's table across the end, a hearth.
    hearth();
    table(-0.6, -D * 0.45, D * 0.45);
    table(W / 2 - 2.2, -D * 0.45, D * 0.45);
    table(0, -D + 1.6, W - 3.6, true);
  } else {
    hearth();
    table(W * 0.1, -D * 0.45);
    add('Prop_Crate', mat(-W / 2 + 0.7, 0, -D + 0.7, rnd(5)));
    furniture.push({ a: [-W / 2 + 0.7, -D + 0.7], b: [-W / 2 + 0.71, -D + 0.7], half: 0.6 });
  }
  // A shop without a jetty over it has a cloth awning out over its counter half the time, on two poles.
  if (shop && !jetty && rnd(76) < 0.5) {
    const cloth = ['GOODS_RED', 'GOODS_OCHRE', 'GOODS_BLUE', 'GOODS_GREEN', 'GOODS_PALE'][Math.floor(rnd(77) * 5) % 5];
    const out = 1.3;
    const drop = 0.4;
    list.push({ geometry: new THREE.BoxGeometry(W - 0.2, 0.03, Math.hypot(out, drop)).rotateX(Math.atan2(drop, out)).translate(0, 2.65 - drop / 2, out / 2), material: cloth });
    for (const sx of [-1, 1]) {
      box('MI_WoodTrim', 0.07, 2.25, 0.07, sx * (W / 2 - 0.25), 1.12, out - 0.05);
      furniture.push({ a: [sx * (W / 2 - 0.25), out - 0.05], b: [sx * (W / 2 - 0.25) + 0.01, out - 0.05], half: 0.12 });
    }
  }
  // A sign hung from an iron-braced beam over the street (for an alehouse, or a guild's hall).
  if (sign) {
    const sx = -W / 2 + M / 2 + doorAt * M + (w > 1 ? M * 0.75 : 0);
    const out = F + 1.25;
    box('MI_WoodTrim', 0.12, 0.12, out, sx, H - 0.35, out / 2);
    list.push({ geometry: metreUVs(new THREE.BoxGeometry(0.06, 0.06, Math.hypot(out * 0.7, 0.9)), 1).rotateX(-Math.atan2(0.9, out * 0.7)).translate(sx, H - 0.8, out * 0.35), material: 'MI_WoodTrim' });
    for (const ch of [-0.35, 0.35]) box('MI_WoodTrim', 0.02, 0.3, 0.02, sx, H - 0.55, out - 0.6 + ch);
    list.push({ geometry: new THREE.PlaneGeometry(1.1, 0.8).rotateY(Math.PI / 2).translate(sx + 0.03, H - 1.1, out - 0.6), material: signMaterial(sign) });
    list.push({ geometry: new THREE.PlaneGeometry(1.1, 0.8).rotateY(-Math.PI / 2).translate(sx - 0.03, H - 1.1, out - 0.6), material: signMaterial(sign) });
    box('MI_WoodTrim', 0.05, 0.86, 1.16, sx, H - 1.1, out - 0.6);
  }

  // Behind every wall panel but a doorway or an arch, dark boards within the wall's thickness: the kit's lattice
  // panels and unglazed windows are open, and its panels don't quite meet, so the house could be seen through.
  for (const { name, m } of list.slice()) {
    if (!name?.startsWith('Wall_') || name.includes('Door') || name === 'Wall_Arch') continue;
    list.push({ geometry: new THREE.BoxGeometry(2.06, 3.0, 0.05).translate(0, 1.55, -0.2).applyMatrix4(m), material: 'BACKING' });
  }

  // What you can't walk through: the walls (leaving the doorway, or the shop's arches, open) and the stair.
  const segs = [
    { a: [-W / 2, -D], b: [W / 2, -D], half: 0.25 },
    { a: [-W / 2, 0], b: [-W / 2, -D], half: 0.25 },
    { a: [W / 2, 0], b: [W / 2, -D], half: 0.25 },
    { a: [W / 2 - 0.9, -D + 0.3], b: [W / 2 - 0.9, -D + 4.6], half: 0.85 },
  ];
  const dx = -W / 2 + M / 2 + doorAt * M;
  if (shop) {
    // Arches: the posts between them.
    for (let k = 0; k <= w; k++) segs.push({ a: [-W / 2 + k * M, 0], b: [-W / 2 + k * M + 0.01, 0], half: 0.2 });
  } else {
    segs.push({ a: [-W / 2, 0], b: [dx - 0.55, 0], half: 0.25 }, { a: [dx + 0.55, 0], b: [W / 2, 0], half: 0.25 });
  }
  segs.push(...furniture);
  return { list, segs, fires, W, D, door: [dx, 0.3], inside: { x0: -W / 2 + 0.2, x1: W / 2 - 0.2, z0: -D + 0.2, z1: 0.3 }, tints: houseTints(rnd, stone) };
}

// Each house its own weathered colours (multiplying the kit's textures, per vertex): roofs of old clay tiles gone
// brown, umber and grey-red with soot and lichen, a few of grey stone tiles (the kit's bright orange was the same
// on every house); limewash in creams, ochres, a pink or a grey, dirtier near the ground.
const ROOF_TINTS = [[0.62, 0.42, 0.36], [0.5, 0.33, 0.27], [0.44, 0.34, 0.3], [0.56, 0.4, 0.3], [0.4, 0.37, 0.34], [0.47, 0.42, 0.36], [0.36, 0.3, 0.27]];
const WASH_TINTS = [[1, 0.97, 0.9], [0.95, 0.86, 0.68], [0.9, 0.8, 0.62], [0.96, 0.86, 0.8], [0.85, 0.84, 0.8], [0.93, 0.9, 0.82], [0.82, 0.74, 0.6]];
function houseTints(rnd, stone) {
  const pick = (list, k) => list[Math.floor(rnd(k) * list.length) % list.length];
  const roof = pick(ROOF_TINTS, 61).map((c) => c * (0.85 + 0.25 * rnd(62)));
  const wash = pick(WASH_TINTS, 63).map((c) => c * (stone ? 0.95 : 0.88 + 0.12 * rnd(64)));
  return { MI_RoundTiles: roof, MI_Plaster: wash };
}
// A tint on a geometry, varied vertex by vertex (patches of soot and lichen a metre or two across, single tiles a
// shade lighter or darker), from its position in the town (so the same house is the same each time it's built).
const _hp = new THREE.Vector3();
function tintGeometry(g, [r, gr, b], roof, base) {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const h = (x, y, z) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let k = 0; k < pos.count; k++) {
    _hp.fromBufferAttribute(pos, k);
    const patch = h(Math.floor(_hp.x / 1.7), Math.floor(_hp.y / 1.7), Math.floor(_hp.z / 1.7));
    const fine = h(Math.round(_hp.x * 3), Math.round(_hp.y * 3), Math.round(_hp.z * 3));
    let f = (roof ? 0.78 : 0.9) + (roof ? 0.3 : 0.14) * patch + (roof ? 0.14 : 0.04) * (fine - 0.5);
    // (Walls dirtier towards the ground, from splashing mud and rising damp.)
    if (!roof) f *= 0.8 + 0.2 * Math.min(1, Math.max(0, (_hp.y - base) / 1.6));
    let cr = r * f;
    let cg = gr * f;
    let cb = b * f;
    if (roof && patch > 0.72) {
      // Lichen and moss, yellow-green to grey.
      const m = (patch - 0.72) * 1.4;
      cr += (0.42 - cr) * m;
      cg += (0.44 - cg) * m;
      cb += (0.3 - cb) * m;
    }
    col[k * 3] = cr;
    col[k * 3 + 1] = cg;
    col[k * 3 + 2] = cb;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const tinted = new Map(); // material -> its copy taking vertex colours
const tintedMaterial = (m) => {
  if (!tinted.has(m)) {
    const c = m.clone();
    c.vertexColors = true;
    c.color.setRGB(1, 1, 1); // (the tints say it all)
    tinted.set(m, c);
  }
  return tinted.get(m);
};

// The trades' signs, as pictures (few could read): a key, a bell, a fish, a star, a crescent moon, a boot, a sheaf.
const ICONS = ['key', 'bell', 'fish', 'star', 'moon', 'boot', 'sheaf'];
const SIGN_BG = ['#6a2a1e', '#2a3a5a', '#3a4a2a', '#5a4a2a', '#202020'];
function drawIcon(x, icon, fg) {
  x.fillStyle = fg;
  x.strokeStyle = fg;
  x.lineWidth = 10;
  x.lineCap = 'round';
  x.beginPath();
  if (icon === 'key') {
    x.arc(80, 96, 26, 0, Math.PI * 2);
    x.moveTo(106, 96);
    x.lineTo(196, 96);
    x.moveTo(176, 96);
    x.lineTo(176, 122);
    x.moveTo(156, 96);
    x.lineTo(156, 116);
    x.stroke();
  } else if (icon === 'bell') {
    x.moveTo(90, 140);
    x.quadraticCurveTo(96, 50, 128, 46);
    x.quadraticCurveTo(160, 50, 166, 140);
    x.closePath();
    x.fill();
    x.beginPath();
    x.arc(128, 150, 12, 0, Math.PI * 2);
    x.fill();
  } else if (icon === 'fish') {
    x.ellipse(118, 96, 62, 28, 0, 0, Math.PI * 2);
    x.moveTo(176, 96);
    x.lineTo(214, 66);
    x.lineTo(214, 126);
    x.closePath();
    x.fill();
  } else if (icon === 'star') {
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 26 : 64;
      const t = (k / 10) * Math.PI * 2 - Math.PI / 2;
      x.lineTo(128 + Math.cos(t) * r, 96 + Math.sin(t) * r);
    }
    x.closePath();
    x.fill();
  } else if (icon === 'moon') {
    x.arc(128, 96, 60, 0, Math.PI * 2);
    x.fill();
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    x.arc(152, 84, 54, 0, Math.PI * 2);
    x.fill();
    x.globalCompositeOperation = 'source-over';
  } else if (icon === 'boot') {
    x.moveTo(100, 40);
    x.lineTo(140, 40);
    x.lineTo(140, 120);
    x.lineTo(196, 128);
    x.lineTo(196, 152);
    x.lineTo(96, 152);
    x.closePath();
    x.fill();
  } else {
    for (let k = -3; k <= 3; k++) {
      x.moveTo(128 + k * 4, 150);
      x.lineTo(128 + k * 14, 44);
    }
    x.stroke();
    x.fillRect(100, 104, 56, 12);
  }
}

// A painted sign board: the name in a pale band over a coloured ground, with a border; or a trade's picture.
const signs = new Map();
function signMaterial({ text = '', icon = null, bg = '#6a2a1e', fg = '#f0d890' }) {
  const key = text + (icon ?? '') + bg + fg;
  if (!signs.has(key)) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 192;
    const x = c.getContext('2d');
    x.fillStyle = bg;
    x.fillRect(0, 0, 256, 192);
    x.strokeStyle = fg;
    x.lineWidth = 8;
    x.strokeRect(8, 8, 240, 176);
    x.fillStyle = fg;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    if (icon) drawIcon(x, icon, fg);
    const lines = icon ? [] : text.split('\n');
    let size = 44;
    do x.font = `bold ${size}px Georgia, serif`; while (lines.some((l) => x.measureText(l).width > 220) && (size -= 2) > 14);
    lines.forEach((l, k) => x.fillText(l, 128, 96 + (k - (lines.length - 1) / 2) * size * 1.1));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    signs.set(key, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  }
  return signs.get(key);
}

// A material of the kit's, by name (once a building using it has been built).
export const kitMaterial = (name) => materials.get(name);

// Merge plans (each with a matrix placing it in a shared frame) into one group: a mesh per material.
// Cached: the same houses in the same places relative to one another (most reloads of terrain just move the frame)
// give a copy of the group made before, sharing its geometry, moved to where the first now stands. (Building and
// merging them all again took about half a second on the Quest at every reload.)
const built = new Map();
export async function buildHouses(placed) {
  const keyed = placed.length && placed.every(({ plan }) => plan.key);
  let key = null;
  let ox = 0;
  let oz = 0;
  if (keyed) {
    ox = placed[0].matrix.elements[12];
    oz = placed[0].matrix.elements[14];
    key = placed.map(({ plan, matrix }) => {
      const e = matrix.elements.slice();
      e[12] -= ox;
      e[14] -= oz;
      return plan.key + e.map((v) => v.toFixed(2)).join(',');
    }).join('|');
    const hit = built.get(key);
    if (hit) {
      const copy = (await hit).clone();
      copy.position.set(ox, 0, oz);
      return copy;
    }
  }
  const make = buildHousesNow(placed.map(({ plan, matrix }) => ({ plan, matrix: keyed ? matrix.clone().premultiply(new THREE.Matrix4().makeTranslation(-ox, 0, -oz)) : matrix })));
  if (!keyed) return make;
  if (built.size > 40) built.clear();
  built.set(key, make.then((g) => {
    g.traverse((o) => {
      if (o.geometry) o.geometry.userData.keep = true; // (shared by its copies: never freed on a reload)
    });
    return g;
  }));
  const copy = (await built.get(key)).clone();
  copy.position.set(ox, 0, oz);
  return copy;
}
async function buildHousesNow(placed) {
  const names = [...new Set(placed.flatMap(({ plan }) => plan.list.map((p) => p.name)))];
  const loaded = new Map(await Promise.all(names.map(async (n) => [n, await piece(n)])));
  const buckets = new Map();
  const put = (material, geometry) => {
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(geometry.index ? geometry.toNonIndexed() : geometry);
  };
  let base = 0;
  const putTinted = (plan, mt, g) => {
    const tint = plan.tints?.[mt.name];
    if (!tint) return put(mt, g);
    put(tintedMaterial(mt), tintGeometry(g.index ? g.toNonIndexed() : g, tint, mt.name === 'MI_RoundTiles', base));
  };
  for (const { plan, matrix } of placed) {
    base = matrix.elements[13]; // (the house's ground floor)
    for (const { name, m, geometry, material } of plan.list) {
      if (geometry) {
        putTinted(plan, material?.isMaterial ? material : materials.get(material) ?? GOODS[material] ?? GOODS.GOODS_RED, geometry.clone().applyMatrix4(matrix));
        continue;
      }
      const at = new THREE.Matrix4().multiplyMatrices(matrix, m);
      for (const { geometry: g, material: mt } of loaded.get(name) ?? []) putTinted(plan, mt, g.clone().applyMatrix4(at));
    }
  }
  const g = new THREE.Group();
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos);
    if (merged) g.add(new THREE.Mesh(merged, material));
  }
  return g;
}
