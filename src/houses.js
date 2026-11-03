import * as THREE from 'three';
import { RES } from './terrain.js';
import { housePlan, buildHouses, kitMaterial } from './kithouse.js';
import { metreUVs } from './textures.js';
import { collider } from './collide.js';
import { MEDIEVAL_CLEAR } from './bristol.js';
import { nightLit, dayUniforms } from './daylight.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Houses and shops you can walk into in c.1400 and c.1650 (see kithouse.js), on plots along the main streets: shops
// on High Street, Broad Street, Wine Street, Corn Street and Redcliff Street, houses on Mary-le-Port, Peter, St
// Thomas and Temple Streets. Each plot was found (tools: a search along bristol-centre-streets.json) where a house
// of its size fits facing the street without touching another street, a wall, a church or the river.
// Also (by request; their sites are today's, whatever stood there c.1400): alehouses where the Llandoger Trow, the
// Hatchet and the Christmas Steps pubs are, shops at the foot of Christmas Steps (where Ahh Toots is) and down
// Christmas Street, and a guildhall on Old Market Street, on the site of the Stag & Hounds (the user's
// identification; the building is illustrative).
// [lat, lon of the middle of its front, bearing its front faces (degrees), modules across, modules deep,
//  shop (true) or the kind of building ('pub', 'hall'), options for housePlan]
// (Two shops that stood at the corners of the Carfax, within 5 m of the High Cross's steps, were taken out: the
// crossing was open ground round the Cross. bristol.js keeps other houses 9 m off it.)
const SITES = [
  [51.454197, -2.592028, 236.9, 3, 4, true], // High Street
  [51.454255, -2.592248, 56.9, 3, 4, true], // High Street
  [51.45498, -2.593194, 38.9, 3, 4, true], // Broad Street
  [51.455115, -2.592531, 136.5, 3, 4, true], // Wine Street
  [51.45419, -2.595036, 149.3, 2, 4, true], // Corn Street
  [51.454178, -2.594811, 329.3, 3, 4, true], // Corn Street
  [51.455225, -2.590328, 336.0, 3, 4, false], // Mary-le-Port Street
  [51.455172, -2.59052, 336.0, 3, 4, false], // Mary-le-Port Street
  [51.450586, -2.590139, 73.3, 3, 4, true], // Redcliff Street
  [51.450719, -2.590064, 253.3, 3, 4, true], // Redcliff Street
  [51.449429, -2.588519, 95.9, 3, 4, false], // Saint Thomas Street
  [51.449558, -2.588508, 90.3, 3, 4, false], // Saint Thomas Street
  [51.455444, -2.589978, 157.1, 3, 4, false], // Peter Street
  [51.455437, -2.589774, 337.1, 3, 4, false], // Peter Street
  [51.45238, -2.587244, 295.9, 2, 4, false], // Temple Street
  [51.45228, -2.587403, 102.3, 3, 4, false], // Temple Street
  [51.451968, -2.59313, 355, 4, 5, 'pub', { sign: { text: 'The\nLlandoger\nTrow' } }], // King Street
  [51.45402, -2.60045, 315, 3, 5, 'pub', { sign: { text: 'The\nHatchet', bg: '#24321e' } }], // Frogmore Street
  // The Stag & Hounds, 74 Old Market Street (the user's guildhall), as it stands today: a big three-storey building
  // on its mapped footprint (OSM: about 9 m along the street, 15 m deep), its front to the street (north).
  [51.455627, -2.582958, 345, 4, 7, 'hall', { storeys: 3, sign: { text: 'Stag\n&\nHounds', bg: '#4a2a1a' } }],
  [51.45606, -2.59672, 20, 3, 4, 'pub', { sign: { text: 'Christmas\nSteps', bg: '#2a3a5a' } }], // by Christmas Steps
  [51.456188, -2.596598, 124.8, 3, 4, true, { goods: ['GOODS_BREAD', 'GOODS_PALE', 'GOODS_OCHRE'] }], // a baker's, by Ahh Toots
  [51.45625, -2.596529, 124.8, 3, 4, true], // at the foot of Christmas Steps
  [51.456095, -2.596218, 12.9, 2, 4, true], // Christmas Street, by the Frome Bridge
  [51.456204, -2.596159, 344.6, 2, 3, true], // Christmas Street
  [51.45622, -2.596066, 344.6, 3, 4, true], // Christmas Street
  // The Guildhall in Broad Street (the user, 2026-11-03: "the old guild hall that stands today", its back on Small
  // Street, by St John on the Wall): the medieval Guildhall stood on this site; today's (Guildhall Chambers, 23 Broad
  // Street) is its rebuilding of the 1840s. On its OSM footprint (about 10 m along the street, 13.5 m deep), its front
  // to Broad Street (north-east); built as the Stag & Hounds is, as a guild's hall (both are hubs for missions
  // later: MISSIONS.md). No yard before it (Broad Street is narrow; the yard would clear the houses opposite).
  [51.455623, -2.594538, 30, 5, 7, 'hall', { storeys: 3, yard: 2, sign: { text: 'The\nGuildhall', bg: '#3a2a4a' } }],
];

// Ordinary houses keep off these plots (their footprints, and a metre round).
const M_LAT = 1 / 111320;
const M_LON = 1 / (111320 * Math.cos((51.455 * Math.PI) / 180));
for (const [lat, lon, bearing, w, d, kind, opts = {}] of SITES) {
  const b = (bearing * Math.PI) / 180;
  const [ox, oy] = [Math.sin(b), Math.cos(b)]; // out of the front (east, north)
  const [tx, ty] = [oy, -ox]; // along the front
  // (An alehouse or hall has a yard before it, and room round it: ordinary houses stand on 6 m plots.)
  const big = kind === 'pub' || kind === 'hall';
  const W = w * 2 + (big ? 8 : 2);
  const D = d * 2 + (big ? 4 : 1);
  const pt = (s, back) => [lat + (ty * s * W / 2 - oy * back) * M_LAT, lon + (tx * s * W / 2 - ox * back) * M_LON];
  const yard = opts.yard ?? (big ? 18 : 1);
  MEDIEVAL_CLEAR.push([pt(-1, -yard), pt(1, -yard), pt(1, D), pt(-1, D)]);
}

const fireMat = nightLit(new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 'flame');

export function kitHouses(ctx, { eras }) {
  const map = ctx.map;
  const mpp = ctx.metresPerPixel;
  const a = { i: (RES - 1) / 2, j: (RES - 1) / 2 };
  const ground = (i, j) => {
    const g = map.ground && i >= 0 && j >= 0 && i <= RES - 1 && j <= RES - 1 ? map.sample(i, j, map.ground) : NaN;
    return Number.isFinite(g) ? g : ctx.terrainAny(i, j);
  };
  const placed = [];
  const segs = [];
  const floors = [];
  const flames = [];
  const plinths = [];
  SITES.forEach(([lat, lon, bearing, w, d, kind, opts = {}], n) => {
    const f = map.source.toWindow(lat, lon);
    // (The guildhall shows from farther off, so it can be seen from the castle.)
    const m = kind === 'hall' ? -RES * 0.6 : 4;
    if (f.i < m || f.j < m || f.i > RES - 1 - m || f.j > RES - 1 - m) return;
    const shop = kind === true;
    // Most fronts are jettied (where the kit has a roof to suit).
    const plan = housePlan({ w, d, kind: typeof kind === 'string' ? kind : shop ? 'shop' : 'house', brick: kind === false && n % 3 === 2, seed: (n + 1) * 0.137, jetty: n % 4 !== 1, ...opts });
    const th = Math.PI - (bearing * Math.PI) / 180; // turning the house's +z (its front) to face the bearing
    const [c, s] = [Math.cos(th), Math.sin(th)];
    const fx = (f.i - a.i) * mpp;
    const fz = (f.j - a.j) * mpp;
    const toWorld = (x, z) => [fx + x * c + z * s, fz - x * s + z * c];
    const toPx = (x, z) => {
      const [X, Z] = toWorld(x, z);
      return [a.i + X / mpp, a.j + Z / mpp];
    };
    // Its floor: as high as the ground anywhere under it, on a stone plinth down to the lowest.
    let hi = -Infinity;
    let lo = Infinity;
    for (let x = -plan.W / 2; x <= plan.W / 2; x += plan.W / 4) {
      for (let z = -plan.D; z <= 1; z += plan.D / 4) {
        const g = ground(...toPx(x, z));
        hi = Math.max(hi, g);
        lo = Math.min(lo, g);
      }
    }
    // (Snapped to 25 cm, so the same house gets the same floor whichever patch of ground is loaded: the ground's
    // sampling shifts by centimetres between reloads, and the built houses are cached by their heights.)
    const base = Math.ceil(hi / 0.25) * 0.25 + 0.05;
    const matrix = new THREE.Matrix4().makeRotationY(th).setPosition(fx, base, fz);
    placed.push({ plan, matrix });
    plinths.push(metreUVs(new THREE.BoxGeometry(plan.W + 0.3, base - lo + 3, plan.D + 0.3), 1).translate(0, -(base - lo + 3) / 2, -plan.D / 2).applyMatrix4(matrix));
    // A step up to the door where the street is lower.
    if (base - ground(...toPx(plan.door[0], 1)) > 0.2) plinths.push(metreUVs(new THREE.BoxGeometry(1.6, base - lo + 3, 0.8), 1).translate(plan.door[0], -(base - lo + 3) / 2 - 0.01, 0.4).applyMatrix4(matrix));
    for (const sg of plan.segs) segs.push({ a: toPx(...sg.a), b: toPx(...sg.b), half: sg.half });
    for (const [x, y, z] of plan.fires) {
      const [X, Z] = toWorld(x, z);
      for (let k = 0; k < 3; k++) flames.push(new THREE.ConeGeometry(0.22 - k * 0.05, 0.6 - k * 0.12, 6).translate(X + (k - 1) * 0.12, base + y + (0.6 - k * 0.12) / 2 - 0.4, Z));
    }
    floors.push({ c, s, fx, fz, base, plan });
  });
  if (!placed.length) return [];
  const root = new THREE.Group();
  // (Plinths in the kit's dressed stone, once it's loaded.)
  const plinth = new THREE.Mesh(plinths.length ? mergeAll(plinths) : new THREE.BufferGeometry(), plinthMat);
  root.add(plinth);
  buildHouses(placed).then((g) => {
    root.add(g);
    plinth.material = kitMaterial('MI_RockTrim') ?? plinthMat;
  });
  let fire = null;
  if (flames.length) {
    fire = new THREE.Mesh(mergeAll(flames), fireMat);
    root.add(fire);
  }
  // Inside a house (or on its step), you stand on its floor.
  const walk = (i, j) => {
    const X = (i - a.i) * mpp;
    const Z = (j - a.j) * mpp;
    for (const { c, s, fx, fz, base, plan } of floors) {
      const dx = X - fx;
      const dz = Z - fz;
      const x = dx * c - dz * s;
      const z = dx * s + dz * c;
      const { x0, x1, z0 } = plan.inside;
      if (x > x0 && x < x1 && z > z0 && z < 0.9) return base;
    }
    return null;
  };
  // Hearth fires flicker.
  const animate = (t) => {
    if (fire && root.visible) fireMat.opacity = (0.55 + 0.4 * dayUniforms.uNight.value) * (0.8 + 0.2 * Math.sin(t * 9) * Math.sin(t * 5.3));
  };
  return [{ ...a, model: { group: root, top: 12 }, era: eras, trueSize: true, baseAlt: 0, far: true, collide: collider(segs, mpp), walk, animate }];
}

const plinthMat = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.95 });
function mergeAll(list) {
  return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
}
