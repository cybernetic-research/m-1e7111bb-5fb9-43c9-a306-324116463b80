import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stoneTexture, grassTexture, textured, metreUVs, roundUVs } from './textures.js';
import { hillfortStructures } from './hillforts.js';
import { cheddarLife, CAMP } from './cheddar-life.js';
import { stJohnOnTheWall } from './stjohn.js';
import { cornStreet } from './cornstreet.js';
import { medievalLandmarks } from './medieval.js';

// Landmarks modelled by hand, to replace the plain boxes drawn from their map footprints.
// - Blaise Castle (1766, Robert Mylne for Thomas Farr): a Gothic folly, a round central tower with three round
//   corner towers, crenellated, with pointed windows. Tower positions and sizes from its mapped outline; heights
//   are my estimate (about 15–17 m).
// - Brean Down Fort (1860s Palmerston fort, re-armed 1939–45): single-storey stone barrack and casemate blocks
//   with grassed earth roofs, rows of windows and chimneys, on their mapped footprints; a gun emplacement at the
//   western tip. Heights, window spacing and the gun are approximate.
// - A photograph of pre-war Bristol on a stand in Wine Street (c.1900 era).

const grey = textured(stoneTexture(0x9a978d, 2), { tile: 2 });
const fortStone = textured(stoneTexture(0xa39d90, 4), { tile: 2 });
const turf = textured(grassTexture(0x5f7d3c), { tile: 4 });
const dark = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6 });
const frame = new THREE.MeshStandardMaterial({ color: 0xc9c2b0, roughness: 0.8 });
const glass = new THREE.MeshStandardMaterial({ color: 0x4f6470, roughness: 0.2, metalness: 0.3 });
const concrete = new THREE.MeshStandardMaterial({ color: 0x9d9a92, roughness: 0.95 });
const gunMetal = new THREE.MeshStandardMaterial({ color: 0x2c2f30, roughness: 0.5, metalness: 0.5 });

// Metres east (x) and south (z) of a point, from lat/lon.
function localXZ(lat, lon, lat0, lon0) {
  return [(lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180), -(lat - lat0) * 111320];
}

function inside(x, z, poly) {
  let hit = false;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [xa, za] = poly[a];
    const [xb, zb] = poly[b];
    if (za > z !== zb > z && x < ((xb - xa) * (z - za)) / (zb - za) + xa) hit = !hit;
  }
  return hit;
}

// A pointed (Gothic) window opening, w wide, h tall to the tip of the arch, in the x–y plane facing +z.
function gothicWindow(w, h) {
  const s = new THREE.Shape();
  const spring = h - w * 0.85;
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, spring);
  s.quadraticCurveTo(w / 2, spring + w * 0.6, 0, h);
  s.quadraticCurveTo(-w / 2, spring + w * 0.6, -w / 2, spring);
  s.closePath();
  return new THREE.ShapeGeometry(s, 6);
}

// A round crenellated tower: drum, a corbelled band, and merlons round the top.
function roundTower(r, h, mat) {
  const parts = [];
  const drum = roundUVs(new THREE.CylinderGeometry(r, r * 1.04, h, 28), r, h).translate(0, h / 2, 0);
  parts.push(drum);
  const band = roundUVs(new THREE.CylinderGeometry(r + 0.25, r, 0.6, 28), r, 0.6).translate(0, h - 0.3, 0);
  parts.push(band);
  const n = Math.max(6, Math.round((Math.PI * 2 * r) / 1.3));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const m = metreUVs(new THREE.BoxGeometry(0.65, 1, 0.45)).rotateY(-a).translate(Math.sin(a) * (r + 0.05), h + 0.5, Math.cos(a) * (r + 0.05));
    parts.push(m);
  }
  return new THREE.Mesh(mergeGeometries(parts), mat);
}

// Windows set into a round tower at angle a (radians, from +z towards +x), height y.
function towerWindow(group, r, a, y, w, h) {
  const win = new THREE.Mesh(gothicWindow(w, h), dark);
  win.position.set(Math.sin(a) * (r + 0.03), y, Math.cos(a) * (r + 0.03));
  win.rotation.y = a;
  group.add(win);
}

const BLAISE = { lat: 51.502554, lon: -2.637336 };
// Turret centres (metres east, north of the centre) and radii, from the lobes of the mapped outline.
const BLAISE_TURRETS = [[-3.0, 6.3, 2.6], [-3.6, -5.6, 2.2], [6.6, -0.3, 2.2]];

function blaiseCastle(ctx) {
  const at = ctx.at(BLAISE.lat, BLAISE.lon);
  if (!at) return [];
  const g = new THREE.Group();
  const bodyR = 4.6;
  g.add(roundTower(bodyR, 14, grey));
  for (const [e, n, r] of BLAISE_TURRETS) {
    const t = new THREE.Group();
    t.position.set(e, 0, -n);
    t.add(roundTower(r, 16.5, grey));
    // Slit windows up each turret, facing outwards.
    const out = Math.atan2(e, -n);
    for (const y of [3, 7.5, 12]) towerWindow(t, r, out, y, 0.35, 1.4);
    g.add(t);
  }
  // Tall pointed windows on the central drum, between the turrets, on two floors.
  // The doorway is in the south-east face.
  for (const [e, n, door] of [[-1, 0.1, false], [1.5, 3, false], [1.5, -3, true]]) {
    const a = Math.atan2(e, -n);
    if (door) towerWindow(g, bodyR, a, 0, 1.5, 2.9);
    else towerWindow(g, bodyR, a, 3.2, 1.2, 3);
    towerWindow(g, bodyR, a, 8.4, 1.1, 2.8);
  }
  return [{ ...at, model: { group: g, top: 17 }, era: 'both', trueSize: true, pad: 11 }];
}

// A single-storey stone block on a mapped footprint: walls, windows in pale stone surrounds, a grassed roof and
// chimney stacks. outline: [[lat, lon]...]. Returns a feature item anchored at its centroid.
function fortBlock(ctx, outline, h = 4.6) {
  const pts = outline.map(([lat, lon]) => ctx.at(lat, lon));
  if (pts.some((p) => !p)) return null;
  const ai = pts.reduce((a, p) => a + p.i, 0) / pts.length;
  const aj = pts.reduce((a, p) => a + p.j, 0) / pts.length;
  const [ax, az] = ctx.metres(ai, aj);
  const local = pts.map((p) => {
    const [x, z] = ctx.metres(p.i, p.j);
    return [x - ax, z - az];
  });
  if (local.length > 3 && local[0][0] === local.at(-1)[0] && local[0][1] === local.at(-1)[1]) local.pop();
  const shape = new THREE.Shape(local.map(([x, z]) => new THREE.Vector2(x, -z)));
  const walls = metreUVs(new THREE.ExtrudeGeometry(shape, { depth: h + 1.5, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -1.5, 0));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(walls, fortStone));
  const roof = metreUVs(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, h + 0.4, 0), 4);
  g.add(new THREE.Mesh(roof, turf));
  // The earth on the roof shows as a low bank above the parapet.
  const darks = [];
  const frames = [];
  let longest = [0, 0, 0, 0, 0];
  for (let k = 0; k < local.length; k++) {
    const [x0, z0] = local[k];
    const [x1, z1] = local[(k + 1) % local.length];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 3) continue;
    let nx = (z1 - z0) / len;
    let nz = -(x1 - x0) / len;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    if (inside(mx + nx * 0.3, mz + nz * 0.3, local)) {
      nx = -nx;
      nz = -nz;
    }
    if (len > longest[0]) longest = [len, x0, z0, x1, z1];
    const n = Math.floor(len / 3.4);
    const a = Math.atan2(nx, nz);
    for (let w = 0; w < n; w++) {
      const t = (w + 0.5) / n;
      const x = x0 + (x1 - x0) * t + nx * 0.06;
      const z = z0 + (z1 - z0) * t + nz * 0.06;
      frames.push(new THREE.BoxGeometry(1.35, 1.85, 0.12).rotateY(a).translate(x, 2.25, z));
      darks.push(new THREE.BoxGeometry(1, 1.45, 0.12).rotateY(a).translate(x + nx * 0.04, 2.25, z + nz * 0.04));
    }
    // Parapet coping along the top.
    frames.push(new THREE.BoxGeometry(len, 0.3, 0.5).rotateY(Math.atan2(-(z1 - z0), x1 - x0)).translate(mx, h, mz));
  }
  if (frames.length) g.add(new THREE.Mesh(mergeGeometries(frames), frame));
  if (darks.length) g.add(new THREE.Mesh(mergeGeometries(darks), glass));
  // Chimney stacks along the longest wall, set in from it.
  const [len, x0, z0, x1, z1] = longest;
  const stacks = [];
  for (let c = 1; c <= Math.max(1, Math.floor(len / 9)); c++) {
    const t = c / (Math.floor(len / 9) + 1);
    let x = x0 + (x1 - x0) * t;
    let z = z0 + (z1 - z0) * t;
    const toward = [-local.reduce((s, p) => s + p[0], 0) / local.length + x, -local.reduce((s, p) => s + p[1], 0) / local.length + z];
    const d = Math.hypot(...toward) || 1;
    x -= (toward[0] / d) * 2;
    z -= (toward[1] / d) * 2;
    stacks.push(metreUVs(new THREE.BoxGeometry(1, 1.8, 0.9)).translate(x, h + 1.1, z));
  }
  if (stacks.length) g.add(new THREE.Mesh(mergeGeometries(stacks), fortStone));
  return { i: ai, j: aj, model: { group: g, top: h + 2 }, era: FORT_ERAS, trueSize: true };
}

// A Victorian gun emplacement: a round pit with a stone apron wall, the racer rails, and a muzzle-loader.
function gunPit() {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(roundUVs(new THREE.CylinderGeometry(6.5, 6.5, 1.3, 32, 1, true, Math.PI * 0.2, Math.PI * 1.6), 6.5, 1.3), new THREE.MeshStandardMaterial({ map: fortStone.map, side: THREE.DoubleSide }));
  wall.position.y = 0.4;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6.4, 32), concrete);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.05;
  const racer = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.08, 4, 40), gunMetal);
  racer.rotation.x = Math.PI / 2;
  racer.position.y = 0.1;
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 4.2), gunMetal);
  carriage.position.set(0, 0.7, 0.4);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 4.6, 14), gunMetal);
  barrel.rotation.x = Math.PI / 2 - 0.05;
  barrel.position.set(0, 1.4, -1.2);
  g.add(wall, floor, racer, carriage, barrel);
  return g;
}

const FORT = { lat: 51.3280, lon: -3.0343, reach: 110 };
const FORT_ERAS = ['now', 'then']; // not in the Iron Age

function breanFort(ctx, source) {
  const items = [];
  const [cx, cz] = [FORT.lat, FORT.lon];
  for (const [, , outline] of source.buildings ?? []) {
    const la = outline.reduce((s, p) => s + p[0], 0) / outline.length;
    const lo = outline.reduce((s, p) => s + p[1], 0) / outline.length;
    const [x, z] = localXZ(la, lo, cx, cz);
    if (Math.hypot(x, z) > FORT.reach) continue;
    const it = fortBlock(ctx, outline);
    if (it) items.push(it);
  }
  // The gun position at the western tip, facing out over the Channel (west).
  const tip = ctx.at(51.32844, -3.03556);
  if (tip) {
    const pit = gunPit();
    pit.rotation.y = Math.PI / 2;
    items.push({ ...tip, model: { group: pit, top: 2 }, era: FORT_ERAS, trueSize: true });
  }
  return items;
}

// Pre-war Bristol: a photograph (supplied as royalty free) on a heritage-style stand.
const PHOTO = { lat: 51.45540, lon: -2.59143, face: 270, src: 'assets/photos/bristol-prewar.webp' }; // in Wine Street

function photoBoard(ctx) {
  return []; // (the photograph isn't in this copy)
  const at = ctx.at(PHOTO.lat, PHOTO.lon);
  if (!at) return [];
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 900;
  const g2 = c.getContext('2d');
  g2.fillStyle = '#1e2a33';
  g2.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    g2.drawImage(img, 32, 32, 960, 731);
    g2.fillStyle = '#f2e6c8';
    g2.font = 'bold 44px Georgia, serif';
    g2.fillText('Bristol before the war', 32, 820);
    g2.font = '30px Georgia, serif';
    g2.fillText('A busy shopping street in the 1930s · photograph', 32, 866);
    tex.needsUpdate = true;
  };
  img.src = PHOTO.src;
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  board.position.y = 2.2;
  const posts = new THREE.Mesh(mergeGeometries([-1.3, 1.3].map((x) => new THREE.BoxGeometry(0.1, 3.3, 0.1).translate(x, 1.6, -0.02))), gunMetal);
  g.add(board, posts);
  g.rotation.y = THREE.MathUtils.degToRad(-PHOTO.face) + Math.PI;
  return [{ ...at, model: { group: g, top: 3.4 }, era: 'then', trueSize: true }];
}

export const LANDMARKS = {
  'blaise-castle': [blaiseCastle],
  'brean-down': [breanFort, hillfortStructures],
  'bristol-centre': [photoBoard, stJohnOnTheWall, cornStreet, medievalLandmarks],
  'cadbury-castle': [hillfortStructures],
  cheddar: [cheddarLife],
  'cadbury-hill': [hillfortStructures],
};

// Footprint boxes not to draw, because a model above stands there: [lat, lon, radius m].
export const MODELLED = {
  'blaise-castle': [[BLAISE.lat, BLAISE.lon, 30]], // the folly stands on an open lawn
  'brean-down': [[FORT.lat, FORT.lon, FORT.reach]],
  'clevedon-pier': [[51.44375, -2.86535, 30]],
  // Weston's Grand Pier: the head and pavilion, and the deck out from the shore.
  'birnbeck-pier': [[51.34777, -2.98660, 75], [51.34772, -2.98420, 30], [51.34768, -2.98220, 25]],
  'weston-bay': [[51.34777, -2.98660, 75], [51.34772, -2.98420, 30], [51.34768, -2.98220, 25]], // the pier head (pavilion modelled with the pier)
  // St John on the Wall (church and gate); the Exchange and the Glass Arcade.
  'bristol-centre': [[51.455977, -2.595004, 5], [51.4544048, -2.5934897, 5], [51.4542624, -2.5930659, 5],
    [51.4541937, -2.5932653, 6], [51.4542925, -2.5930244, 6], [51.4543922, -2.5927835, 6], // the arcade's lane
    [51.4551679, -2.5929243, 5]], // Christ Church
  cheddar: [[...CAMP, 22]], // the Mesolithic camp's clearing
  clifton: [[51.4543762, -2.6291734, 14], [51.455395, -2.6265697, 14], [51.4532514, -2.6265865, 22]], // bridge towers, Rocks Railway station
};
