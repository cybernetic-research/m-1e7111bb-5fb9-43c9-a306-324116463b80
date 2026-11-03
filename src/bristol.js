import * as THREE from 'three';
import { BEAR_PIT, PIT_R, PIT_DEPTH, HORSE_FAIR } from './outskirts.js';
import { RES } from './terrain.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stoneTexture, textured, metreUVs, roundUVs } from './textures.js';
import { phMaterial } from './phtex.js';
import { nightLit, dayUniforms } from './daylight.js';
import { collider } from './collide.js';
import { OVR, BASEMAPS, drawBase } from './overlay.js';
import { puff, Effects, rand } from './scenarios.js';
import { greatBritain, matthew } from './ssgb.js';
import { ST_JOHN_FOOTPRINT, wall as archedWall } from './stjohn.js';
import { EXCHANGE_FOOTPRINT, ARCADE_FOOTPRINT, CHRIST_CHURCH_FOOTPRINT } from './cornstreet.js';
import { kitChurch, outlineClear } from './churches.js';

// Rubble walls and the castle: a weathered coursed-stone photo texture (Poly Haven, CC0).
const castleStone = phMaterial('castle_wall_varriation', { color: 0xd8d0c0 });
// On the walls: arrow slits (dark), windows that are firelit after dark, and torches in iron brackets, burning
// brighter (and glowing) at night.
const slitMat = new THREE.MeshStandardMaterial({ color: 0x0e0c0a, roughness: 1 });
const wallWindowMat = nightLit(new THREE.MeshBasicMaterial({ color: 0x14100c }), 'window');
const torchFlameMat = nightLit(new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 'flame');
const torchGlowMat = nightLit(new THREE.PointsMaterial({ map: (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,190,110,1)');
  g.addColorStop(1, 'rgba(255,140,60,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})(), color: 0xffffff, size: 1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 'glow');
const _ws = new THREE.Vector3();
const castleDark = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.8 });

// Central Bristol: Broadmead, the old city around Castle Park, and the docks, in four eras.
//   now     today's surface model and aerial photo
//   castle  the 1640s: Bristol Castle, a compact old city, and no Floating Harbour (the tidal Avon; the New Cut and
//           Feeder Canal not yet dug)
//   then    c.1900: the city's blocks raised from the OS six-inch map, the Floating Harbour, the churches whole
//   blitz   1941: the Wine Street / Castle Street heart (now Castle Park) burnt out on 24 November 1940
// Sources: Wikipedia (Bristol Castle, Bristol Blitz, Castle Park, St Peter's and St Mary-le-Port churches, Bristol
// Harbour). The block massing is read from the map's hatched buildings; heights, the castle's form and the
// 1640s city extent are conjecture.

export const ERAS = [
  { id: 'now', year: 2026, label: 'TODAY', base: 'aerial', note: "Today's city: buildings from the current map, at the heights the LIDAR survey measured." },
  {
    id: 'medieval', year: 1400, label: 'c.1400 · MEDIEVAL MERCHANT CITY', base: 'historic',
    note: 'A walled merchant city trading wool, cloth and wine. Timber-framed houses with jettied upper storeys line narrow streets inside the walls; St John on the Wall is one of its gates, and the castle still stands. Gardens and yards lie behind the street fronts. The street layout follows the blocks of the c.1900 map; house styles are representative.',
  },
  {
    id: 'castle', year: 1650, label: 'c.1650 · CASTLE AND TIDAL PORT', base: 'historic',
    note: 'Bristol around the Civil War sieges (1643 and 1645), before the castle was demolished in 1656. The river is tidal (the Floating Harbour was dug in 1804–09). Most houses are still timber-framed, jettied and gabled, with stone and brick beginning to appear. House styles are representative, not each house surveyed.',
  },
  {
    id: 'georgian', year: 1750, label: 'c.1750 · ATLANTIC PORT', base: 'historic',
    note: "Bristol at the height of its Atlantic trade. Its merchants traded sugar, tobacco and rum from the Caribbean and the American colonies, and financed and sent ships in the trade in enslaved Africans: Bristol ships made more than 2,000 slaving voyages between 1698 and 1807, carrying hundreds of thousands of people into slavery. That wealth built much of the Georgian city: brick and stone merchants' houses, warehouses and the Exchange (1743). The castle is gone; the river is still tidal. House styles are representative.",
  },
  {
    id: 'then', year: 1938, label: '1938 · BEFORE THE WAR', base: 'historic',
    note: 'Bristol just before the Second World War: a dense shopping centre around Wine Street, Castle Street and Mary-le-Port, with medieval, Georgian, Victorian and Edwardian buildings side by side. The layout is from the Ordnance Survey map of about 1900; building styles are representative.',
  },
  {
    id: 'blitz', year: 1942, label: '1942 · WARTIME', base: 'historic',
    note: 'After the raids of November 1940 to April 1941. The shopping streets of Wine Street, Castle Street and Mary-le-Port (today Castle Park) are burnt out: about 80 of some 500 buildings there survived. The damaged area follows the records of the 24 November 1940 raid; individual buildings are approximate.',
  },
];
// Before the Floating Harbour (1804–09): the river is tidal and the New Cut isn't dug.
const TIDAL_ERAS = ['medieval', 'castle', 'georgian'];

const HARBOUR_LEVEL = 6.9; // the Floating Harbour is held at a constant level, close to high water (approx.)
const OLD_CITY = [51.4535, -2.5921];
const CLEARINGS = [[51.45540, -2.59158, 9],
  // Broad Street, from St John's Gate up to Christ Church, and Corn Street past the Exchange: the old map's blocks
  // spill into these narrow streets.
  [51.455850, -2.595095, 4], [51.455753, -2.594801, 6], [51.455566, -2.594337, 5], [51.455303, -2.593742, 5],
  [51.454991, -2.593122, 5], [51.456151, -2.594948, 4], [51.4546770, -2.5937789, 6], [51.4546, -2.59365, 5],
  [51.4543837, -2.5943366, 5], [51.4547992, -2.5933246, 5]]; // [lat, lon, radius m] kept free of blocks // Bristol Bridge: the 1640s city is drawn within ~550 m of it
// The worst of the 24 November 1940 fires: between Broad Quay and Old Market, through Wine Street, Castle Street and
// Mary-le-Port (Wikipedia); this band around them is approximate. Castle Park's own outline is added to it.
const BLITZ_BAND = [[51.4548, -2.5975], [51.4560, -2.5950], [51.4566, -2.5895], [51.4572, -2.5835], [51.4560, -2.5825],
  [51.4549, -2.5870], [51.4541, -2.5925], [51.4537, -2.5968]];
// The castle on the big rectangle that is Castle Park today (the user's reading, 2026-11-01, replacing the round
// moat of the 17th-century pictures, which are drawn to convention): the Frome along its north side (Broad Weir),
// the Avon along its south, and a moat cut from the Frome round its east end and back to the Avon: OpenStreetMap
// maps it as the Bristol Castle Moat Culvert, leaving the Frome at Broad Weir, down under Lower Castle Street (the
// road into and out of Broadmead), then west under Castle Street, and the stretch still open, "Bristol Castle Moat",
// into the harbour beside Castle Park View (as the user guessed, 2026-11-01). On the west the castle faces the town
// across open ground, its gate towards Castle Street. The curtain wall follows the water round, with towers at its
// corners. The keep: Leland (c.1540) saw "a large keep" in the north-west part of the court; placed there, size
// approximate. The moat's width (about 14 m) is approximate.
export const KEEP = [51.45620, -2.58720];
export const EAST_MOAT = [[51.45720, -2.58595], [51.457056, -2.585884], [51.456981, -2.585919], [51.45607, -2.585306],
  [51.455963, -2.585165], [51.455737, -2.58505], [51.455639, -2.58501], [51.455466, -2.585111], [51.455253, -2.585286],
  [51.455157, -2.585444], [51.455117, -2.58615], [51.455091, -2.586651], [51.455078, -2.586973], [51.455032, -2.587386],
  [51.454929, -2.587694], [51.454706, -2.58794]];
// The castle and its moat, where no town houses stand.
const CASTLE_SITE = [[51.45645, -2.58845], [51.45735, -2.58590], [51.45620, -2.58500], [51.45500, -2.58510], [51.45480, -2.58780],
  [51.45520, -2.58845]];
// Its course: from Broadmead past the castle's north side (the line of its culvert today, OpenStreetMap), then, as
// the user's drawing has it (from a walking-tour map of the river), close round the north of the town wall from
// Newgate past the Pithay to Lewins Mead, just east of the foot of Christmas Steps, and down St Augustine's Reach
// (under Colston Avenue) to the harbour. The last stretch, from FROME_REACH, is the wide Reach.
export const FROME = [[51.45798, -2.58343], [51.45718, -2.58558], [51.45664, -2.58712], [51.45643, -2.58792],
  [51.45651, -2.58908], [51.456, -2.5903], [51.456125, -2.591058], [51.456854, -2.592681], [51.45705, -2.59335],
  [51.457198, -2.594139], [51.457125, -2.594975], [51.457, -2.595695], [51.456812, -2.59605], [51.456573, -2.59625],
  [51.456292, -2.5963], [51.455948, -2.59645], [51.455531, -2.5968], [51.455072, -2.59725], [51.454697, -2.5975],
  [51.45394, -2.59765], [51.45236, -2.59782]];
export const FROME_REACH = 16; // from this point on, the wide Reach
// The curtain wall, a few metres inside the water all round, from its north-west corner clockwise; the gate is in
// the middle of the last side (the west).
export const CASTLE_WARD = [[51.45633, -2.58836], [51.45648, -2.58710], [51.45690, -2.58610], [51.45610, -2.58550],
  [51.45532, -2.58565], [51.45525, -2.58680], [51.45522, -2.58836]];
// The town's walls, after the user's floorplan (aligned to OpenStreetMap), snapped to surviving lines and gates.
// [lat, lon, gate name or null, the bearing of the street through the gate (else square to the wall)]; each is an
// open run (rivers and the castle close the circuits).
// - TOWN_WALL, the main circuit, as the user's drawing has it: from the Avon by Bristol Bridge through St Nicholas
//   Gate, west just south of St Nicholas Street to the West Gate (towards the Marsh), north to the Frome Gate on
//   Christmas Street, round the north through the Pithay Gate to Newgate at the east end of Wine Street, and on
//   along the north side of Castle Street, with a gate onto a bridge across the Frome, to the castle's moat. The
//   Frome ran outside the walls, as their moat.
// - INNER_WALL: the older inner line through St Leonard's Gate (end of Corn Street), St Giles Gate (Small Street)
//   and St John's Gate (which survives), and just outside Tower Lane (which follows it).
// - MARSH_WALL: across the Marsh, from the Frome to the Avon along the line of King Street.
// - PORT_WALL (1240s): round Redcliffe and Temple, from the Avon to Redcliffe Gate (Redcliff Street), along Portwall
//   Lane (which follows it) to Temple Gate, and to the Avon again downstream.
// Wherever an old street crosses a wall there is a gate ('Gate' where its name isn't known), and where a lane does,
// a postern (a small doorway); found by crossing the walls with the streets in bristol-centre-streets.json.
export const TOWN_WALL = [
  [51.45384, -2.5916, null], [51.45395, -2.59185, 'St Nicholas Gate', 142], [51.45372, -2.593, null],
  [51.45364, -2.59345, null], [51.4536, -2.5942, null], [51.45366, -2.5947, null], [51.453686, -2.594911, 'Gate', 312],
  [51.453782, -2.595702, null], [51.45392, -2.595829, 'West Gate'], [51.454395, -2.596264, null],
  [51.454666, -2.596341, 'postern'], [51.454958, -2.596424, null], [51.455583, -2.596264, null],
  [51.456, -2.59605, null], [51.45627, -2.59577, 'Frome Gate', 312], [51.456344, -2.595611, null],
  [51.456729, -2.594691, null], [51.456938, -2.593687, null], [51.4569, -2.59332, 'Pithay Gate'],
  [51.45676, -2.592934, null], [51.456685, -2.592753, 'postern'], [51.456304, -2.591838, 'postern'],
  [51.456063, -2.59126, 'postern'], [51.45603, -2.59118, null], [51.455696, -2.591021, null],
  [51.45561, -2.59098, 'Newgate', 66], [51.455507, -2.590931, null], [51.4555, -2.59089, null],
];
// Newgate stands in the town wall where it comes down from the Pithay, the wall on both sides of its passage (south
// of it a short stretch to a corner tower), Wine Street running out through it into Castle Street (the user,
// 2026-11-03: it had stood at the wall's end, the Castle Street wall starting beside it). From that wall 10 m north
// of the gate, the Castle Street wall runs east along the north side of Castle Street, with a gate onto a bridge
// north across the Frome, to the castle's moat (the user's drawing).
// (Newgate stands on the level crest at the east end of Wine Street, about 25 m back from where the drawing has it:
// there the ground fell some 5 m across the gate's passage, towards the Frome and the castle.)
export const CASTLE_STREET_WALL = [
  [51.455696, -2.591021, null], [51.45578, -2.59058, null], [51.45597, -2.5896, null], [51.45601, -2.5892, 'Gate'], [51.45604, -2.58845, null],
  [51.45625, -2.58872, null],
];
export const INNER_WALL = [
  [51.45405, -2.595944, null], [51.45411, -2.59512, "St Leonard's Gate", 59], [51.4547, -2.5954, null],
  [51.455198, -2.595317, 'St Giles Gate'], [51.4553, -2.5953, null], [51.45585, -2.59515, "St John's Gate"],
  [51.456188, -2.594779, null], [51.456431, -2.59399, null], [51.456337, -2.593709, null],
  [51.456268, -2.593459, 'postern'], [51.456122, -2.593295, null], [51.455964, -2.593181, null],
  [51.455845, -2.592974, null], [51.455726, -2.59266, null], [51.455697, -2.592569, null],
];
export const MARSH_WALL = [
  [51.45226, -2.59755, null], [51.452244, -2.597408, null], [51.451769, -2.596766, null], [51.451661, -2.596393, 'postern'],
  [51.451542, -2.595984, 'postern'], [51.451453, -2.59568, 'postern'], [51.451156, -2.594657, null],
  [51.450931, -2.592448, null],
];
export const PORT_WALL = [
  [51.449768, -2.591645, null], [51.449657, -2.591072, 'Gate'], [51.44945, -2.59, 'Redcliffe Gate'],
  [51.4494, -2.58913, null], [51.449349, -2.588484, 'Gate'], [51.44927, -2.587485, 'postern'],
  [51.449242, -2.587098, 'postern'], [51.44923, -2.58694, null], [51.44915, -2.58594, null],
  [51.44922, -2.58541, null], [51.449317, -2.584975, 'postern'], [51.4494, -2.5846, 'Temple Gate'],
  [51.449518, -2.583753, null], [51.449611, -2.583446, 'postern'], [51.450106, -2.581805, null],
  [51.450731, -2.580356, 'postern'], [51.450869, -2.580038, null],
];
// Market places, open ground kept clear of houses and filled with stalls (townlife.js): one where St Nicholas
// Market is today, between Corn Street, High Street and St Nicholas Street; and fairs on the open ground outside
// the walls, along Old Market Street beyond the castle and on the Marsh. Extents approximate.
export const MARKETS = [
  { name: 'Market place (where St Nicholas Market is)', stalls: 55, along: 4.2, across: 4.6, poly: [[51.45440, -2.59375], [51.45448, -2.59300], [51.45436, -2.59252], [51.45412, -2.59238], [51.45398, -2.59298], [51.45402, -2.59362]] },
  // Old Market, the town's great market outside the walls, filling the broad street east of the castle from the Stag &
  // Hounds to Lawford Street (bigger than St Nicholas's; the user's request). Its extent along OSM's Old Market Street.
  { name: 'Old Market', stalls: 150, along: 4.2, across: 4.6, poly: [[51.455888, -2.582834], [51.456034, -2.582089], [51.456172, -2.581425], [51.456323, -2.581392], [51.456471, -2.580732], [51.456557, -2.580261], [51.456263, -2.580125], [51.456181, -2.580582], [51.456075, -2.581106], [51.455916, -2.581157], [51.455744, -2.581935], [51.455596, -2.582686]] },
  { name: 'The Marsh (fair)', stalls: 26, poly: [[51.4507, -2.5975], [51.4510, -2.5955], [51.4500, -2.5950], [51.4497, -2.5970]] },
];
// Outlines of medieval landmarks that ordinary houses keep clear of in c.1400 and c.1650 (churches, the friary),
// filled in by medieval.js.
export const MEDIEVAL_CLEAR = [];
// A ring of points r metres round [lat, lon].
export function circleOf([lat, lon], r, n = 24) {
  return Array.from({ length: n }, (_, k) => {
    const t = (k / n) * Math.PI * 2;
    return [lat + (Math.cos(t) * r) / 111320, lon + (Math.sin(t) * r) / (111320 * Math.cos((lat * Math.PI) / 180))];
  });
}
// No houses in the bear pit and round it, nor on the horse fair (its street and pens, about 18 m each side).
MEDIEVAL_CLEAR.push(circleOf(BEAR_PIT, PIT_R + 7));
// The High Cross (medieval.js) stood in the open at the Carfax, the crossing of High, Broad, Corn and Wine Streets:
// no house within 9 m of it (a plot touching that circle isn't built).
export const HIGH_CROSS = [51.454893, -2.592665];
MEDIEVAL_CLEAR.push(circleOf(HIGH_CROSS, 9));
for (let k = 0; k < HORSE_FAIR.length - 1; k++) {
  const [p, q] = [HORSE_FAIR[k], HORSE_FAIR[k + 1]];
  const dy = (q[0] - p[0]) * 111320;
  const dx = (q[1] - p[1]) * 69318;
  const L = Math.hypot(dx, dy);
  const [ox, oy] = [(-dy / L) * 18, (dx / L) * 18];
  MEDIEVAL_CLEAR.push([[p[0] + oy / 111320, p[1] + ox / 69318], [q[0] + oy / 111320, q[1] + ox / 69318], [q[0] - oy / 111320, q[1] - ox / 69318], [p[0] - oy / 111320, p[1] - ox / 69318]]);
}
// Water in the Marsh, as the floorplan shows it (perhaps the Frome's older course), approximate.
// The walled town, as a closed outline: the main circuit, the castle's west side, and the river bank back to the
// bridge.
const WALLED_TOWN = [...TOWN_WALL.map(([lat, lon]) => [lat, lon]), [51.4562, -2.58875], [51.4550, -2.58875], [51.45482, -2.5900], [51.45427, -2.5910]];
export const MARSH_POOL = [[51.453107, -2.596364], [51.452269, -2.594055], [51.451982, -2.594356], [51.452832, -2.596465]];

const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// Rasterise lat/lon polygons into a RES x RES mask (1 inside).
function mask(source, polygons) {
  const c = new OffscreenCanvas(RES, RES);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  for (const poly of polygons) {
    ctx.beginPath();
    poly.forEach(([lat, lon], k) => {
      const { i, j } = source.toWindow(lat, lon);
      if (k) ctx.lineTo(i, j);
      else ctx.moveTo(i, j);
    });
    ctx.fill();
  }
  const d = ctx.getImageData(0, 0, RES, RES).data;
  const out = new Uint8Array(RES * RES);
  for (let k = 0; k < out.length; k++) out[k] = d[k * 4 + 3] > 127 ? 1 : 0;
  return out;
}

// Blur a mask so carved channels have sloping banks: 0 at the edge rising to 1 in the middle: each cell's city-block
// distance (in cells) to the nearest cell outside the mask (or the window's edge), over `radius`, at most 1. (Two
// passes over the grid; it used to take `radius` passes, which for the Avon's 30 m bed was 25.)
function depthFromEdge(m, radius) {
  const d = new Float32Array(RES * RES);
  const BIG = 1e9;
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const k = j * RES + i;
      if (!m[k] || i === 0 || j === 0 || i === RES - 1 || j === RES - 1) {
        d[k] = 0;
        continue;
      }
      d[k] = Math.min(BIG, d[k - 1] + 1, d[k - RES] + 1);
    }
  }
  for (let j = RES - 2; j > 0; j--) {
    for (let i = RES - 2; i > 0; i--) {
      const k = j * RES + i;
      if (d[k]) d[k] = Math.min(d[k], d[k + 1] + 1, d[k + RES] + 1);
    }
  }
  for (let k = 0; k < d.length; k++) d[k] = Math.min(1, d[k] / radius);
  return d;
}

// The city's blocks from the c.1900 OS map: buildings there are hatched dark, streets and yards left white.
// Dark density over a few metres (hatching is about 30% dark ink, blank paper none), then a clean-up that removes isolated specks (map lettering).
export async function massingFromMap(source) {
  const canvas = new OffscreenCanvas(OVR, OVR);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await drawBase(ctx, BASEMAPS.find((b) => b.id === 'historic'), source);
  const px = ctx.getImageData(0, 0, OVR, OVR).data;
  const integral = new Float32Array((OVR + 1) * (OVR + 1));
  for (let y = 0; y < OVR; y++) {
    let row = 0;
    for (let x = 0; x < OVR; x++) {
      const k = (y * OVR + x) * 4;
      const lum = (px[k] * 0.3 + px[k + 1] * 0.59 + px[k + 2] * 0.11) / 255;
      row += px[k + 3] > 0 && lum < 0.62 ? 1 : 0;
      integral[(y + 1) * (OVR + 1) + x + 1] = integral[y * (OVR + 1) + x + 1] + row;
    }
  }
  const mpp = source.span / OVR;
  const r = Math.max(2, Math.round(3 / mpp));
  const dens = (x, y) => {
    const x0 = Math.max(0, x - r);
    const y0 = Math.max(0, y - r);
    const x1 = Math.min(OVR, x + r + 1);
    const y1 = Math.min(OVR, y + r + 1);
    const s = integral[y1 * (OVR + 1) + x1] - integral[y0 * (OVR + 1) + x1] - integral[y1 * (OVR + 1) + x0] + integral[y0 * (OVR + 1) + x0];
    return s / ((x1 - x0) * (y1 - y0));
  };
  const step = OVR / RES;
  const built = new Uint8Array(RES * RES);
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) built[j * RES + i] = dens(Math.floor((i + 0.5) * step), Math.floor((j + 0.5) * step)) > 0.22 ? 1 : 0;
  }
  // Keep a cell only if most of its neighbours are built too.
  const heights = new Float32Array(RES * RES);
  for (let j = 1; j < RES - 1; j++) {
    for (let i = 1; i < RES - 1; i++) {
      const k = j * RES + i;
      if (!built[k]) continue;
      let n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) n += built[k + dj * RES + di];
      // Three or four storeys, varying block by block.
      if (n >= 6) heights[k] = 9 + 9 * hash(Math.floor(i / 5), Math.floor(j / 5));
    }
  }
  return heights;
}

let oldStreets = null;
export const QUAYSIDE = 7.5; // metres OD: the quays and banks of the Frome before the ground was made up (approximate)

// A box blur of a 0/1 RES x RES mask, radius r cells, giving 0..1.
function boxBlur(m, r) {
  // Separable, with running sums: O(cells) whatever the radius (it was O(cells x radius), slow on the Quest).
  let a = Float32Array.from(m);
  const out = new Float32Array(a.length);
  for (const horizontal of [true, false]) {
    for (let line = 0; line < RES; line++) {
      const at = (t) => (horizontal ? line * RES + t : t * RES + line);
      let sum = 0;
      for (let t = 0; t <= Math.min(r, RES - 1); t++) sum += a[at(t)];
      for (let t = 0; t < RES; t++) {
        const lo = Math.max(0, t - r);
        const hi = Math.min(RES - 1, t + r);
        out[at(t)] = sum / (hi - lo + 1);
        // slide: add the cell entering on the right, drop the one leaving on the left
        if (t + r + 1 < RES) sum += a[at(t + r + 1)];
        if (t - r >= 0) sum -= a[at(t - r)];
      }
    }
    a = Float32Array.from(out);
  }
  return a;
}
const ERA_ORDER = ['medieval', 'castle', 'georgian', 'then', 'blitz'];

// The streets standing in an era, as a RES x RES mask (1 on the street), each drawn its own width.
// smooth: keep the canvas's anti-aliased coverage (0–255) instead of 0/1, for soft edges in a texture.
function streetMask(source, streets, era, cell, narrower = 0, smooth = false) {
  const c = new OffscreenCanvas(RES, RES);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const st of streets) {
    if (ERA_ORDER.indexOf(st.from) > ERA_ORDER.indexOf(era)) continue;
    // Open places (market places) are filled.
    for (const poly of st.polys ?? []) {
      ctx.beginPath();
      poly.forEach(([lat, lon], k) => {
        const { i, j } = source.toWindow(lat, lon);
        if (k) ctx.lineTo(i, j);
        else ctx.moveTo(i, j);
      });
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
    ctx.lineWidth = (Math.max(0, st.half - narrower) * 2) / cell;
    for (const line of st.lines) {
      ctx.beginPath();
      line.forEach(([lat, lon], k) => {
        const { i, j } = source.toWindow(lat, lon);
        if (k) ctx.lineTo(i, j);
        else ctx.moveTo(i, j);
      });
      ctx.stroke();
    }
  }
  const d = ctx.getImageData(0, 0, RES, RES).data;
  const out = new Uint8Array(RES * RES);
  for (let k = 0; k < out.length; k++) out[k] = smooth ? d[k * 4 + 3] : d[k * 4 + 3] > 127 ? 1 : 0;
  return out;
}

// Called whenever new terrain arrives for this place: work out the masks, and (once) start reading the map.
export function onApply(map) {
  const source = map.source;
  const areas = source.osm?.areas ?? [];
  const named = (...names) => areas.filter((a) => names.includes(a.name)).map((a) => a.outline);
  map.bristol = {
    harbour: mask(source, named('Floating Harbour', 'Bathurst Basin', 'Albion Dockyard', 'Totterdown Basin')),
    cuts: mask(source, named('New Cut', 'Feeder Canal')),
    castlePark: mask(source, [...named('Castle Park'), BLITZ_BAND]),
    castleWard: mask(source, [CASTLE_SITE]), // the castle and its moats: no houses
    pool: mask(source, [MARSH_POOL]),
    pit: mask(source, [circleOf(BEAR_PIT, PIT_R)]), // the bear pit (outskirts.js), sunk in the ground
    // Today's Bearpit, the 1960s sunken roundabout round it (about 55 m across, 4 m deep in the LIDAR): filled in
    // before then, to the level of the ground round it.
    pitArea: mask(source, [circleOf(BEAR_PIT, 34)]),
    massing: null,
  };
  map.bristol.channel = depthFromEdge(map.bristol.harbour, 6);
  {
    // The level round today's Bearpit (the median of the bare ground on a ring 38 m out).
    const ring = circleOf(BEAR_PIT, 38, 36).map(([lat, lon]) => source.toWindow(lat, lon)).filter((w) => w.i >= 0 && w.j >= 0 && w.i < RES && w.j < RES);
    const hs = ring.map((w) => map.grids.terrain[Math.round(w.j) * RES + Math.round(w.i)]).sort((x, y) => x - y);
    map.bristol.pitRim = hs.length ? hs[Math.floor(hs.length / 2)] : null;
  }
  // The River Frome before it was covered over (from the 1890s), along FROME; under Frome Bridge by Christmas Street
  // and down the trench dug in the 1240s (St Augustine's Reach, today's Colston Avenue) to the harbour. Widths about
  // 15 m, the Reach about 30 m (approximate).
  const cell = map.span / RES;
  map.bristol.frome = streetMask(source, [
    { from: 'medieval', half: 7.5, lines: [FROME.slice(0, FROME_REACH + 1)] },
    { from: 'medieval', half: 15, lines: [FROME.slice(FROME_REACH)] },
    { from: 'medieval', half: 7, lines: [EAST_MOAT] }, // the castle's moat, from the Frome round to the Avon
  ], 'medieval', cell);
  map.bristol.fromeDepth = depthFromEdge(map.bristol.frome, 4);
  // The beds of the tidal rivers before 1809, by distance from the bank in metres: the Avon shelving from its quays
  // for about 30 m to a channel in the middle, the Frome for about 7 m; so at low water a stream runs down the middle
  // between banks of mud (see composeGrid).
  map.bristol.avonBed = depthFromEdge(map.bristol.harbour, Math.max(2, Math.round(30 / cell)));
  map.bristol.fromeBed = depthFromEdge(map.bristol.frome, Math.max(2, Math.round(7 / cell)));
  // Its banks: the ground along the Frome and the Quay has been built up since (culverts, roads, made ground). Before
  // 1800 it's brought down towards the old quayside level within about 30 m, so the water is seen from the
  // streets as it was.
  const band = streetMask(source, [
    { from: 'medieval', half: 7.5 + 30, lines: [FROME.slice(0, FROME_REACH + 1)] },
    { from: 'medieval', half: 15 + 30, lines: [FROME.slice(FROME_REACH)] },
  ], 'medieval', cell);
  map.bristol.fromeBank = boxBlur(band, Math.max(1, Math.round(12 / cell)));
  // No house within 10 m of the water: the harbour and rivers, the Frome, the castle moat and the Marsh's water.
  const wet = new Uint8Array(RES * RES);
  for (let k = 0; k < wet.length; k++) wet[k] = map.bristol.harbour[k] || map.bristol.frome[k] || map.bristol.pool[k] ? 1 : 0;
  map.bristol.nearWater = boxBlur(wet, Math.max(1, Math.round(10 / cell)));
  // The river and an open quay about 6 m wide along each side, where no house stands.
  map.bristol.fromeQuay = streetMask(source, [
    { from: 'medieval', half: 7.5 + 6, lines: [FROME.slice(0, FROME_REACH + 1)] },
    { from: 'medieval', half: 15 + 6, lines: [FROME.slice(FROME_REACH)] },
  ], 'medieval', cell);
  const job = (map.bristolJob = (map.bristolJob ?? 0) + 1);
  // The old streets that keep their lines (assets/bristol-centre-streets.json), loaded once.
  oldStreets ??= fetch('assets/bristol-centre-streets.json').then((r) => r.json()).then((d) => d.streets).catch(() => []);
  // (Each heavy step in its own frame, so a reload is a few short pauses rather than one long one.)
  const frame = (label) => map.nextFrame?.(label) ?? new Promise((r) => setTimeout(r, 0));
  Promise.all([massingFromMap(source), oldStreets]).then(async ([h, streets]) => {
    if (job !== map.bristolJob) return;
    map.bristol.massing = h;
    map.bristol.streets = [...streets, ...MARKETS.map(({ name, poly }) => ({ name, from: 'medieval', half: 0, lines: [], polys: [poly] }))];
    await frame('bristol:blocks');
    if (job !== map.bristolJob) return;
    // (At life size a step a frame; on the table at once.)
    const life = map.mode === 'life';
    const steps = blocksSteps(map);
    let r;
    while (!(r = steps.next()).done) {
      if (!life) continue;
      await frame();
      if (job !== map.bristolJob) return;
    }
    map.bristol.blocks = r.value;
    map.bristol.blocksEras = [map.era];
    await frame('bristol:houses');
    if (job !== map.bristolJob) return;
    if (life) await map.rebuildObjectsStaged(() => frame());
    else map.rebuildObjects();
    if (job !== map.bristolJob) return;
    await frame('bristol:ground');
    if (job !== map.bristolJob) return;
    map.showGrid();
  }).catch((err) => {
    console.error('[bristol] massing', err);
    if (job === map.bristolJob) map.rebuildObjects();
  });
  return 'defer'; // (the buildings are built above, once the old map is read: not twice)
}

// The map's blocks as building footprints for each historic era, so they're drawn like buildings (walls, windows,
// roofs) rather than as bumps in the ground, which at life size turn into spikes. Cells of equal height are merged
// into rectangles, row by row.
// Only for the periods asked (by default the one on show): working out all five on every reload took a second on
// the Quest. Others are worked out when first shown (footprintsFor).
function blocksFor(map, only = [map.era]) {
  const steps = blocksSteps(map, only);
  let r;
  while (!(r = steps.next()).done);
  return r.value;
}
// (As steps: the street masks and each block of plot rows a step, for building a frame at a time.)
function* blocksSteps(map, only = [map.era]) {
  const b = map.bristol;
  const source = map.source;
  const w = source.toWindow(...OLD_CITY);
  const cityR = 550 / (map.span / RES);
  // Window pixel -> lat/lon: exact at three corners, linear between (the window is at most a few km across).
  const o = source.fromWindow(0, 0);
  const ei = source.fromWindow(RES, 0);
  const ej = source.fromWindow(0, RES);
  const ll = (i, j) => [o.lat + ((ei.lat - o.lat) * i + (ej.lat - o.lat) * j) / RES, o.lon + ((ei.lon - o.lon) * i + (ej.lon - o.lon) * j) / RES];
  // Redcliffe and Temple, inside the Port Wall (closed along the river), were built up from the 13th century.
  const portward = mask(source, [[...PORT_WALL.map(([lat, lon]) => [lat, lon]), [51.4525, -2.5835], [51.4535, -2.5875], [51.4537, -2.5905], [51.4520, -2.5915], [51.4500, -2.5918]]]);
  const eras = {
    then: (k) => b.massing[k],
    // The walled city c.1400 was smaller (about 400 m round Bristol Bridge), c.1650 a little larger; by 1750 the city
    // had spread, and the castle site (demolished 1656) was built over.
    medieval: (k, i, j) => ((Math.hypot(i - w.i, j - w.j) < cityR * 0.72 || portward[k]) && !b.castleWard[k] ? b.massing[k] * 0.7 : 0),
    castle: (k, i, j) => ((Math.hypot(i - w.i, j - w.j) < cityR || portward[k]) && !b.castleWard[k] ? b.massing[k] * 0.75 : 0),
    georgian: (k, i, j) => (Math.hypot(i - w.i, j - w.j) < cityR * 1.45 ? b.massing[k] * 0.85 : 0),
    // About 80 of some 500 buildings around Castle Park survived intact; the rest is rubble (in the ground).
    blitz: (k, i, j) => (b.castlePark[k] ? (hash(Math.floor(i / 4), Math.floor(j / 4)) < 0.16 ? b.massing[k] : 0) : b.massing[k]),
  };
  for (const era of Object.keys(eras)) if (!only.includes(era)) delete eras[era];
  // Keep the street open where the pre-war photograph stands (Wine Street); the map's blocks there are too coarse.
  // And where buildings are modelled by hand, on their own outlines: St John on the Wall in every era; the Exchange,
  // its arcade and Christ Church (all 18th century or later) except in the 1640s, when houses stood there.
  const open = CLEARINGS.map(([lat, lon, r]) => [source.toWindow(lat, lon), r / (map.span / RES)]);
  const always = mask(source, [ST_JOHN_FOOTPRINT]);
  const landmarks = mask(source, MEDIEVAL_CLEAR);
  const later = mask(source, [EXCHANGE_FOOTPRINT, ARCADE_FOOTPRINT, CHRIST_CHURCH_FOOTPRINT]);
  // The old streets, each in the eras it existed, kept clear of the map's blocks (whose hatching spills over them).
  const cellM = map.span / RES;
  yield;
  const streets = Object.fromEntries(Object.keys(eras).map((era) => [era, streetMask(source, b.streets ?? [], era, cellM)]));
  yield;
  // (Kept, before the walls are added below, to draw the streets on the ground.)
  b.streetMasks = { ...(b.streetMasks ?? {}), ...Object.fromEntries(Object.entries(streets).map(([era, m]) => [era, Uint8Array.from(m)])) };
  // While the town wall stands (c.1400, c.1650) houses keep a few metres off it; and inside it versus outside.
  const wallLine = [{ from: 'medieval', half: 5, lines: [TOWN_WALL, CASTLE_STREET_WALL, INNER_WALL, MARSH_WALL, PORT_WALL].map((w) => w.map(([lat, lon]) => [lat, lon])) }];
  const nearWall = streetMask(source, wallLine, 'medieval', cellM);
  const withinWalls = mask(source, [WALLED_TOWN]);
  for (const era of ['medieval', 'castle']) if (streets[era]) for (let k = 0; k < nearWall.length; k++) if (nearWall[k]) streets[era][k] = 1;
  for (const [era, h] of Object.entries(eras)) {
    eras[era] = (k, i, j) => (always[k] || b.nearWater?.[k] > 0.001 || ((era === 'medieval' || era === 'castle') && landmarks[k]) || streets[era][k] || (TIDAL_ERAS.includes(era) && b.fromeQuay?.[k]) || (era !== 'castle' && era !== 'medieval' && later[k]) || open.some(([c, r]) => Math.hypot(i - c.i, j - c.j) < r) ? 0 : h(k, i, j));
  }
  // The map's blocks are divided into house plots on a grid: about 6 m in the 1640s (narrow timber-framed houses),
  // 8 m c.1900 and in 1941. A plot is built if most of it is built on the map; it takes the mean height there, and
  // notes which of its sides face open ground (a street or yard), for its frontages. Plot sides run north, east,
  // south, west, in that order.
  const cell = map.span / RES;
  const out = {};
  for (const [era, height] of Object.entries(eras)) {
    const p = Math.max(1, Math.round(({ medieval: 6, castle: 6, georgian: 7 }[era] ?? 8) / cell));
    const G = Math.ceil(RES / p);
    const tall = new Float32Array(G * G);
    for (let gj = 0; gj < G; gj++) {
      if (gj % 12 === 0) yield;
      for (let gi = 0; gi < G; gi++) {
        let n = 0;
        let sum = 0;
        let onStreet = 0;
        let onLandmark = 0;
        for (let j = gj * p; j < Math.min(RES, (gj + 1) * p); j++) {
          for (let i = gi * p; i < Math.min(RES, (gi + 1) * p); i++) {
            const k = j * RES + i;
            onStreet += streets[era][k];
            if (era === 'medieval' || era === 'castle') onLandmark += landmarks[k];
            if (b.harbour[k]) continue;
            const h = height(k, i, j);
            if (h > 0) {
              n++;
              sum += h;
            }
          }
        }
        // (A plot reaching into an old street isn't built: the street wins. Nor one touching a landmark's ground at
        // all (a church and its yard, a house built from the kit): it would stand in it.)
        if (n >= p * p * 0.5 && onStreet <= p * p * 0.04 && !onLandmark) tall[gj * G + gi] = sum / n;
      }
    }
    const built = (gi, gj) => gi >= 0 && gj >= 0 && gi < G && gj < G && tall[gj * G + gi] > 0;
    const list = [];
    // Before the Victorian rebuilding, the ground behind the houses is gardens and orchards (Millerd's plan of
    // 1673 shows long garden plots behind narrow street fronts).
    const garden = TIDAL_ERAS.includes(era) ? new Uint8Array(RES * RES) : null;
    const plant = (gi, gj) => {
      for (let j = gj * p; j < Math.min(RES, (gj + 1) * p); j++) for (let i = gi * p; i < Math.min(RES, (gi + 1) * p); i++) garden[j * RES + i] = 255;
    };
    // Which plots are built (first, so each house's open sides are known from its neighbours as they'll stand).
    const kept = new Uint8Array(G * G);
    const openOf = (gi, gj) => [!built(gi, gj - 1), !built(gi + 1, gj), !built(gi, gj + 1), !built(gi - 1, gj)];
    for (let gj = 0; gj < G; gj++) {
      if (gj % 24 === 0) yield;
      for (let gi = 0; gi < G; gi++) {
        if (!built(gi, gj)) continue;
        const open = openOf(gi, gj);
        // Before the 18th century the houses stood along the streets with gardens, yards and workshops behind:
        // keep the street fronts (with the odd gap for a lane or yard) and only a few plots behind them.
        // Inside the walls a prosperous port was densely built (Braun & Hogenberg, 1568): the street fronts almost
        // continuous, and most of the ground behind taken by back ranges, workshops and stores round small yards.
        // Outside the walls, in the suburbs, houses stand looser along the roads.
        if (era === 'medieval' || era === 'castle') {
          const mid = Math.min(RES - 1, gj * p + (p >> 1)) * RES + Math.min(RES - 1, gi * p + (p >> 1));
          const inside = withinWalls[mid] || portward[mid];
          const front = inside ? 0.95 : 0.5;
          const back = inside ? 0.6 : 0.05;
          const keep = open.some(Boolean) ? hash(gi * 3.1, gj * 0.7) < front : hash(gi * 0.9, gj * 4.3) < back;
          if (!keep) {
            if (!open.some(Boolean)) plant(gi, gj); // behind the frontage: a garden (gaps in the frontage stay yards)
            continue;
          }
        } else if (garden && !open.some(Boolean) && hash(gi * 0.9, gj * 4.3) < 0.5) {
          plant(gi, gj); // c.1750: half the plots behind the street fronts are still gardens
          continue;
        }
        kept[gj * G + gi] = 1;
      }
    }
    // A side of a house is open (its fronts, windows and door face it) if the plot beside it isn't built and the
    // ground just across it can be walked on: not a church or other landmark, a house built from the kit, the river
    // or the harbour. Its door is on a side facing a street if it has one, else a yard or garden; a house with no
    // such side (shut in by others, or backing onto a church) isn't built: its plot is a yard.
    const keptAt = (gi, gj) => gi >= 0 && gj >= 0 && gi < G && gj < G && kept[gj * G + gi];
    const across = (gi, gj, side) => {
      // Three pixels just outside the plot's edge, along its middle.
      const [i0, j0, i1, j1] = [gi * p, gj * p, (gi + 1) * p - 1, (gj + 1) * p - 1];
      return [0.25, 0.5, 0.75].map((t) => {
        const i = side === 1 ? i1 + 1 : side === 3 ? i0 - 1 : Math.round(i0 + (i1 - i0) * t);
        const j = side === 0 ? j0 - 1 : side === 2 ? j1 + 1 : Math.round(j0 + (j1 - j0) * t);
        return i < 0 || j < 0 || i >= RES || j >= RES ? -1 : j * RES + i;
      });
    };
    const walkable = (k) => k < 0 || !((era === 'medieval' || era === 'castle') && landmarks[k]) && !always[k] && !b.harbour[k] && !b.frome?.[k] && !b.pool?.[k];
    for (let gj = 0; gj < G; gj++) {
      if (gj % 24 === 0) yield;
      for (let gi = 0; gi < G; gi++) {
        if (!kept[gj * G + gi]) continue;
        const nb = [[gi, gj - 1], [gi + 1, gj], [gi, gj + 1], [gi - 1, gj]];
        const sides = nb.map(([ni, nj], side) => (keptAt(ni, nj) ? null : across(gi, gj, side)));
        const open = sides.map((ks) => !!ks && ks.filter(walkable).length >= 2);
        if (!open.some(Boolean)) {
          kept[gj * G + gi] = 0;
          continue;
        }
        const street = sides.map((ks, side) => open[side] && ks.some((k) => k >= 0 && streets[era][k]));
        const door = street.indexOf(true) >= 0 ? street.indexOf(true) : open.indexOf(true);
        const [i0, j0, i1, j1] = [gi * p, gj * p, Math.min(RES, (gi + 1) * p), Math.min(RES, (gj + 1) * p)];
        list.push([Math.round(tall[gj * G + gi] * 10) / 10, null, [ll(i0, j0), ll(i1, j0), ll(i1, j1), ll(i0, j1)], {
          open, door, seed: hash(gi * 1.7, gj * 2.3),
        }]);
      }
    }
    out[era] = list;
    if (garden) {
      yield;
      (b.gardens ??= {})[era] = garden;
      // The town: its houses, gardens and streets, and about 10 m round them. Beyond is open country (fields).
      const town = new Uint8Array(RES * RES);
      for (let k = 0; k < town.length; k++) town[k] = garden[k] || height(k, k % RES, (k - (k % RES)) / RES) > 0 || streets[era][k] ? 1 : 0;
      const reach = Math.max(1, Math.round(10 / cellM));
      const grown = new Uint8Array(RES * RES);
      for (let j = 0; j < RES; j++) {
        for (let i = 0; i < RES; i++) {
          if (!town[j * RES + i]) continue;
          for (let dj = -reach; dj <= reach; dj += Math.max(1, reach >> 1)) {
            for (let di = -reach; di <= reach; di += Math.max(1, reach >> 1)) {
              const x = i + di;
              const y = j + dj;
              if (x >= 0 && y >= 0 && x < RES && y < RES) grown[y * RES + x] = 255;
            }
          }
        }
      }
      (b.towns ??= {})[era] = grown;
    }
  }
  console.info(`[bristol] blocks: ${Object.entries(out).map(([e, l]) => `${e} ${l.length}`).join(', ')}`);
  return out;
}

// How the buildings are drawn in each era (objects.js): today's as they are; c.1400 and c.1650 as timber-framed
// houses with jettied storeys and steep gables; c.1750 as Georgian brick and stone, with some older timber houses
// still standing; 1938 and 1942 as Victorian and Edwardian stone and brick fronts with shops.
export function styleFor(era) {
  return { medieval: 1, castle: 1, georgian: 3, then: 2, blitz: 2 }[era] ?? 0;
}

// Today's trees only today (the LIDAR measured them now).
export function treesFor(era) {
  return era === 'now';
}

// The ground at life size: paved streets (1), or in the 1640s packed earth and cobbles (2).
export function pavedFor(era) {
  return { medieval: 2, castle: 2, georgian: 3, then: 4, blitz: 4 }[era] ?? 1;
}

// A 0-255 mask softened (two box blurs of 2 px), so lines drawn at its half-way level run smoothly rather than
// following the pixels.
function soften(m) {
  return boxBlur(boxBlur(m, 2), 2);
}

// The street layout for the life-size ground, RES x RES x RGBA: in 1938 and 1942 the old streets (red the
// carriageway, with pavements about 1.8 m wide either side; green the whole street); before 1800, the gardens
// behind the houses (blue) and the town itself (alpha; beyond it, fields).
export function streetsFor(map) {
  const b = map.bristol;
  // Before 1800: gardens behind the houses (blue).
  const garden = b?.gardens?.[map.era];
  if (garden) {
    const town = b.towns[map.era];
    const out = new Uint8Array(RES * RES * 4);
    // The streets drawn smoothly (anti-aliased and softened), so their edges follow their lines, not the pixels.
    // (Painted at the widths of a medieval town's streets, the houses where they stand: main and market streets
    // about 6.8 m of cobbles, ordinary streets 4 m, lanes and passages 2 m; between the cobbles and the house fronts,
    // trodden earth. Only the paint: the plots, the houses and where you can walk keep the mapped widths.)
    const paintHalf = (h) => (h >= 3.5 ? Math.min(h, 3.4) : h >= 2 ? Math.min(h, 2.0) : Math.min(h, 1.0));
    const painted = b.streets?.map((st) => (st.half ? { ...st, half: paintHalf(st.half) } : st));
    const road = b.streets && ((b.streetSoft ??= {})[map.era] ??= soften(streetMask(map.source, painted, map.era, map.span / RES, 0, true)));
    for (let k = 0; k < RES * RES; k++) {
      out[k * 4 + 1] = road ? Math.min(255, road[k] * 1.3) : 0; // green: the streets
      out[k * 4 + 2] = garden[k];
      out[k * 4 + 3] = town[k]; // alpha: the town (beyond it, fields)
    }
    return out;
  }
  if (!b?.streets || !['then', 'blitz'].includes(map.era)) return null;
  if (!b.streetRGBA) {
    const cell = map.span / RES;
    const road = soften(streetMask(map.source, b.streets, 'then', cell, 1.8, true));
    const all = soften(streetMask(map.source, b.streets, 'then', cell, 0, true));
    b.streetRGBA = new Uint8Array(RES * RES * 4);
    for (let k = 0; k < RES * RES; k++) {
      b.streetRGBA[k * 4] = Math.min(255, road[k] * 1.6);
      b.streetRGBA[k * 4 + 1] = Math.min(255, all[k] * 1.6);
      b.streetRGBA[k * 4 + 3] = 255;
    }
  }
  return b.streetRGBA;
}

// Today's buildings now; the map's blocks in the historic eras.
export function footprintsFor(map, era) {
  if (era === 'now') return map.source.buildings;
  const b = map.bristol;
  // (A period not yet worked out for this patch of ground: work it out now, the first time it's shown.)
  if (b?.blocks && !(era in b.blocks) && b.massing && ['then', 'medieval', 'castle', 'georgian', 'blitz'].includes(era)) {
    Object.assign(b.blocks, blocksFor(map, [era]));
  }
  return b?.blocks?.[era] ?? [];
}

// The heights shown for an era: `ground` (reshaped land and river bed, which takes the height exaggeration) and
// `surface` (ground plus buildings, drawn true to scale on top).
export function composeGrid(map, era) {
  const { terrain, surface } = map.grids;
  const b = map.bristol;
  if (era === 'now' || !b) return { ground: terrain, surface: map.source.buildings ? terrain : surface };
  // Ground first: before 1809 the harbour basins are the tidal Avon's muddy channel, and the cuts don't exist yet.
  const ground = Float32Array.from(terrain);
  if (TIDAL_ERAS.includes(era)) {
    for (let k = 0; k < ground.length; k++) {
      if (b.pool?.[k]) ground[k] = Math.min(ground[k], 3.5);
      if (b.pitArea?.[k] && b.pitRim != null) ground[k] = Math.max(ground[k], b.pitRim);
      if (b.pit?.[k] && b.pitRim != null) ground[k] = b.pitRim - PIT_DEPTH;
      if (b.fromeBank?.[k] > 0 && !b.harbour[k]) ground[k] = Math.min(ground[k], ground[k] + (QUAYSIDE - ground[k]) * b.fromeBank[k]);
      // (A tidal river about 2 m deep at mid tide between stone quays, not a ravine.)
      if (b.frome?.[k] && !b.harbour[k]) ground[k] = Math.min(ground[k], 1.0 + (1 - (b.fromeBed ?? b.fromeDepth)[k]) * 5.5);
      if (b.harbour[k]) ground[k] = 0.5 + Math.pow(1 - (b.avonBed ?? b.channel)[k], 1.3) * 5.8;
      if (b.cuts[k]) ground[k] = 8.5;
    }
  }
  // The city's blocks are drawn as buildings (footprintsFor); only the Blitz rubble is part of the ground. The
  // 1640s city was compact (blocks only near Bristol Bridge, none inside the castle): see blocksFor.
  const built = Float32Array.from(ground);
  if (era === 'blitz') {
    for (let k = 0; k < built.length; k++) {
      if (!b.massing?.[k] || b.harbour[k] || !b.castlePark[k]) continue;
      const i = k % RES;
      const j = (k - i) / RES;
      if (hash(Math.floor(i / 4), Math.floor(j / 4)) >= 0.16) built[k] += 1.5 * hash(i, j);
    }
  }
  return { ground, surface: built };
}

// The harbour basins seed the sea fill (they're held behind lock gates, not joined to the open river).
export function seaSeeds(map) {
  const h = map.bristol?.harbour;
  if (!h) return [];
  const out = [];
  for (let k = 0; k < h.length; k++) if (h[k]) out.push(k);
  // Before 1800 the Frome is open and tidal: it fills from its own channel (the harbour it joins may lie outside
  // the loaded patch of ground).
  const frome = map.bristol.frome;
  if (frome && TIDAL_ERAS.includes(map.era)) for (let k = 0; k < frome.length; k++) if (frome[k] || map.bristol.pool?.[k]) out.push(k);
  return out;
}

// The 1640s tidal channel and low water go well below today's lowest ground, so the model's base starts at 0 m.
export const baseFloor = 0;

export function waterLevel(map) {
  if (map.waterLevel != null) return map.waterLevel;
  // Before the Floating Harbour the water rose and fell with the tide; shown here above half tide (5.5 m), when
  // the Frome and the Avon stand well up their quays.
  return TIDAL_ERAS.includes(map.era) ? map.source.tides?.[map.tide] ?? 5.5 : HARBOUR_LEVEL;
}

// The riverbed between the tides, before the Floating Harbour: Avon mud (shown where the tide has gone out).
export function beachFor(map) {
  return TIDAL_ERAS.includes(map.era) ? { kind: 'mud', top: 6.6, mudBelow: 6.6 } : null;
}

// --- models ---

const stone = new THREE.MeshStandardMaterial({ color: 0x9a907f, roughness: 0.9 });
const redStone = new THREE.MeshStandardMaterial({ color: 0x8e6a58, roughness: 0.9 });
const slate = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.75 });
const timber = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.8 });
const plaster = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.9 });

// Bristol Castle in the 1640s (conjectural form): curtain walls with towers round the outer ward, a great keep in
// its north-west part (Leland, c.1540), a west gate with barbican towards the town, and the Water Gate on the Avon.
// Battlements along a wall from (x0, z0) to (x1, z1) at height y: merlons 0.9 m wide with gaps between.
function merlons(parts, x0, z0, x1, z1, y, depth = 0.9) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.floor(len / 1.8);
  const rot = -Math.atan2(z1 - z0, x1 - x0);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    parts.push(metreUVs(new THREE.BoxGeometry(0.9, 1.1, depth)).rotateY(rot).translate(x0 + (x1 - x0) * t, y + 0.55, z0 + (z1 - z0) * t));
  }
}

// Bristol Castle in the 1640s, after the "South prospect" engraving: a curtain wall round the castle ward with round
// towers and a gatehouse, all battlemented; the great keep, tall and square, with corner turrets rising above its
// battlements, arrow slits and a few windows. The keep's size isn't recorded on Wikipedia (a guess in the range of
// the largest Norman keeps); the wall line is the castle ward's.
// The keep's great hall, furnished (conjecturally): a flagstone floor, two rows of pillars, a great hearth with a
// fire on the north wall, a high table and long tables with benches, banners, and torches. In metres about the
// hall's centre (cx, cz), floor at 0. Returns { group, segs (solid parts: { a, b, half } in metres), animate }.
const hallWood = phMaterial('medieval_wood');
const bannerMats = [0x7a1e1e, 0x1e3a6e, 0xb08a2a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide }));
function keepHall(cx, cz, W, D) {
  const g = new THREE.Group();
  const stone = [];
  const wood = [];
  const segs = [];
  stone.push(metreUVs(new THREE.BoxGeometry(W, 0.1, D)).translate(cx, 0.0, cz)); // the floor
  for (const sx of [-1, 1]) {
    for (const t of [-0.25, 0.25]) {
      const x = cx + sx * W * 0.22;
      const z = cz + t * D;
      stone.push(roundUVs(new THREE.CylinderGeometry(0.7, 0.8, 8, 12), 0.75, 8, 2).translate(x, 4, z));
      segs.push({ a: [x, z], b: [x + 0.01, z], half: 0.85 });
    }
  }
  // The hearth, against the north wall, with its fire.
  const hz = cz - D / 2 + 0.8;
  stone.push(metreUVs(new THREE.BoxGeometry(4, 3.2, 1.6)).translate(cx, 1.6, hz - 0.2));
  stone.push(metreUVs(new THREE.BoxGeometry(2.4, 2, 1.8)).translate(cx, 1.0, hz + 0.1)); // (cut by the fire's glow)
  segs.push({ a: [cx - 2, hz], b: [cx + 2, hz], half: 1 });
  const fire = [0xff6a1a, 0xffa030, 0xffd070].map((c, k) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.5 - k * 0.12, 1.2 - k * 0.25, 7).translate(0, (1.2 - k * 0.25) / 2, 0), torchFlameMat);
    m.position.set(cx + (k - 1) * 0.3, 0.2, hz + 1.1);
    g.add(m);
    return m;
  });
  // Tables: a high table across the north end, long tables down the hall, benches beside them.
  const table = (x, z, len, along) => {
    const [lx, lz] = along ? [len, 1.1] : [1.1, len];
    wood.push(new THREE.BoxGeometry(lx, 0.08, lz).translate(x, 0.78, z));
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) wood.push(new THREE.BoxGeometry(0.1, 0.78, 0.1).translate(x + ox * (lx / 2 - 0.15), 0.39, z + oz * (lz / 2 - 0.15)));
    for (const sd of [-1, 1]) {
      const [bx, bz] = along ? [x, z + sd * 0.9] : [x + sd * 0.9, z];
      wood.push(new THREE.BoxGeometry(along ? len : 0.35, 0.45, along ? 0.35 : len).translate(bx, 0.22, bz));
    }
    segs.push(along ? { a: [x - len / 2, z], b: [x + len / 2, z], half: 1.1 } : { a: [x, z - len / 2], b: [x, z + len / 2], half: 1.1 });
  };
  table(cx, hz + 3.6, 7, true);
  table(cx - W * 0.12, cz + 2.5, 8, false);
  table(cx + W * 0.12, cz + 2.5, 8, false);
  // Banners on the side walls.
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.2), bannerMats[(k + (sx > 0 ? 1 : 0)) % 3]);
      b.rotation.y = sx * -Math.PI / 2;
      b.position.set(cx + sx * (W / 2 - 0.05), 4.6, cz + (k - 1) * D * 0.3);
      g.add(b);
    }
  }
  // Torches on the walls.
  const flames = [];
  for (const [x, z] of [[cx - W / 2 + 0.2, cz - D * 0.15], [cx - W / 2 + 0.2, cz + D * 0.2], [cx + W / 2 - 0.2, cz - D * 0.15], [cx + W / 2 - 0.2, cz + D * 0.2], [cx - 2.4, cz + D / 2 - 0.2], [cx + 2.4, cz + D / 2 - 0.2]]) {
    wood.push(new THREE.BoxGeometry(0.1, 0.5, 0.1).translate(x, 2.4, z));
    flames.push(new THREE.ConeGeometry(0.12, 0.4, 6).translate(x, 2.85, z));
  }
  g.add(new THREE.Mesh(mergeGeometries(stone.map((q) => (q.index ? q.toNonIndexed() : q))), castleStone));
  g.add(new THREE.Mesh(mergeGeometries(wood.map((q) => (q.index ? q.toNonIndexed() : q))), hallWood));
  g.add(new THREE.Mesh(mergeGeometries(flames.map((q) => (q.index ? q.toNonIndexed() : q))), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
  const animate = (t) => fire.forEach((m, k) => m.scale.set(1 + 0.15 * Math.sin(t * 11 + k * 2), 0.8 + 0.35 * Math.abs(Math.sin(t * 7.3 + k * 1.7)), 1));
  return { group: g, segs, animate };
}

function castle(ctx) {
  // Placed anywhere in the place's square (not just the loaded window) and shown from afar, so it can be seen from
  // the old city's streets.
  const pts = CASTLE_WARD.map(([lat, lon]) => ctx.atAny(lat, lon));
  const a = pts[0];
  const [ax, az] = ctx.metres(a.i, a.j);
  const local = pts.map((p) => {
    const [x, z] = ctx.metres(p.i, p.j);
    return [x - ax, z - az];
  });
  const parts = [];
  const slits = [];
  // The great keep, with corner turrets standing above its parapet.
  const [kx, kz] = (() => {
    const w = ctx.atAny(...KEEP);
    const [x, z] = ctx.metres(w.i, w.j);
    return [x - ax, z - az];
  })();
  const keep = ctx.atAny(...KEEP);
  const ground = ctx.terrainAny(keep.i, keep.j);
  const KW = 28;
  const KD = 22;
  const KH = 30;
  // Its walls, 3 m thick, round a great hall you can walk into through an arched door in the south face (towards
  // the ward), with a floor above at 8 m and the roof below the parapet. (Interior conjectural.)
  const T = 3;
  parts.push(metreUVs(new THREE.BoxGeometry(KW, KH, T)).translate(kx, KH / 2 - 3, kz - KD / 2 + T / 2));
  for (const sx of [-1, 1]) parts.push(metreUVs(new THREE.BoxGeometry(T, KH, KD - 2 * T)).translate(kx + sx * (KW / 2 - T / 2), KH / 2 - 3, kz));
  const door = archedWall(-KW / 2, KW / 2, -3, KH - 3, T, [{ cx: 0, w: 3.2, y0: -2.9, spring: 3.2, apex: 4.8 }]);
  parts.push((door.index ? door.toNonIndexed() : door).translate(kx, 0, kz + KD / 2));
  for (const y of [8, KH - 3.6]) parts.push(metreUVs(new THREE.BoxGeometry(KW - 2 * T + 0.2, 0.6, KD - 2 * T + 0.2)).translate(kx, y + 0.3, kz));
  const hall = keepHall(kx, kz, KW - 2 * T, KD - 2 * T);
  // A plinth (battered base).
  parts.push(metreUVs(new THREE.BoxGeometry(KW + 2, 3, KD + 2)).translate(kx, -1.5, kz));
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let c = 0; c < 4; c++) {
    const [sx0, sz0] = corners[c];
    const [sx1, sz1] = corners[(c + 1) % 4];
    merlons(parts, kx + (sx0 * KW) / 2, kz + (sz0 * KD) / 2, kx + (sx1 * KW) / 2, kz + (sz1 * KD) / 2, KH - 3, 1);
    // Corner turret: 6 m square, 7 m above the keep's parapet, with its own battlements.
    const tx = kx + sx0 * (KW / 2 - 1);
    const tz = kz + sz0 * (KD / 2 - 1);
    parts.push(metreUVs(new THREE.BoxGeometry(6, KH + 7, 6)).translate(tx, (KH + 7) / 2 - 3, tz));
    for (const [ex0, ez0, ex1, ez1] of [[-3, -3, 3, -3], [3, -3, 3, 3], [3, 3, -3, 3], [-3, 3, -3, -3]]) merlons(parts, tx + ex0, tz + ez0, tx + ex1, tz + ez1, KH + 4, 0.7);
  }
  // Arrow slits and windows on each face of the keep, in three storeys.
  for (const [nx, nz, w] of [[0, -1, KW], [0, 1, KW], [-1, 0, KD], [1, 0, KD]]) {
    for (let level = 0; level < 3; level++) {
      for (let k = 0; k < 4; k++) {
        const t = (k + 0.5) / 4 - 0.5;
        const x = kx + nx * (KW / 2 + 0.05) + (nz ? t * (w - 8) : 0);
        const z = kz + nz * (KD / 2 + 0.05) + (nx ? t * (w - 8) : 0);
        const tall = level === 2 ? [1.2, 2.4] : [0.4, 2];
        slits.push(new THREE.BoxGeometry(nx ? 0.1 : tall[0], tall[1], nz ? 0.1 : tall[0]).translate(x, 4 + level * 8, z));
      }
    }
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(parts.map((q) => (q.index ? q.toNonIndexed() : q))), castleStone));
  g.add(new THREE.Mesh(mergeGeometries(slits), castleDark));
  g.add(hall.group);
  // (The keep's origin is the ward's first corner, its heights from the ground at the keep. The curtain wall
  // round the ward steps with the ground, like the town wall: 11 m high, a tower at every corner, the gate on the
  // west side facing the town.)
  const last = CASTLE_WARD[CASTLE_WARD.length - 1];
  const ward = [...CASTLE_WARD.map(([lat, lon]) => [lat, lon, null]), [(last[0] + CASTLE_WARD[0][0]) / 2, (last[1] + CASTLE_WARD[0][1]) / 2, 'Castle gate']];
  // Walking: the keep's walls (with the doorway open) and the hall's pillars, hearth and tables, at the right
  // resolution for a doorway; inside, the hall's floor.
  const mpp = ctx.metresPerPixel;
  const kp = (x, z) => [a.i + x / mpp, a.j + z / mpp];
  const [n, sth, w, e] = [kz - KD / 2 + T / 2, kz + KD / 2 - T / 2, kx - KW / 2 + T / 2, kx + KW / 2 - T / 2];
  const segs = [
    { a: kp(w, n), b: kp(e, n), half: T / 2 }, { a: kp(w, n), b: kp(w, sth), half: T / 2 }, { a: kp(e, n), b: kp(e, sth), half: T / 2 },
    { a: kp(w, sth), b: kp(kx - 1.6, sth), half: T / 2 }, { a: kp(kx + 1.6, sth), b: kp(e, sth), half: T / 2 },
    ...hall.segs.map(({ a: p, b: q, half }) => ({ a: kp(...p), b: kp(...q), half })),
  ];
  const inHall = (i, j) => {
    const x = (i - a.i) * mpp;
    const z = (j - a.j) * mpp;
    return Math.abs(x - kx) < KW / 2 - T && Math.abs(z - kz) < KD / 2 + 0.5 ? ground + 0.05 : null;
  };
  return [
    { ...a, model: { group: g, top: 38 }, era: ['medieval', 'castle'], trueSize: true, baseAlt: ground, far: true, collide: collider(segs, mpp), walk: inHall, animate: hall.animate },
    ...wallRun(ctx, ward, true, { height: 11, towers: true }),
  ];
}

// A church from its mapped footprint: walls, a pitched roof along its long axis, and a west tower.
// state: 'whole' or 'gutted' (roofless shell, as after the Blitz) or 'tower' (tower alone).
export function church(ctx, outline, { towerH, wallH = 11, state, era }) {
  const pts = outline.map(([lat, lon]) => ctx.at(lat, lon));
  if (pts.some((p) => !p)) return null;
  const ci = pts.reduce((s, p) => s + p.i, 0) / pts.length;
  const cj = pts.reduce((s, p) => s + p.j, 0) / pts.length;
  const [cx, cz] = ctx.metres(ci, cj);
  const local = pts.map((p) => {
    const [x, z] = ctx.metres(p.i, p.j);
    return [x - cx, z - cz];
  });
  // Long axis from the farthest pair of corners.
  let best = [0, 1];
  let bestD = 0;
  local.forEach((p, m) => local.forEach((q, n) => {
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d > bestD) {
      bestD = d;
      best = [m, n];
    }
  }));
  const [p, q] = [local[best[0]], local[best[1]]];
  const angle = Math.atan2(q[1] - p[1], q[0] - p[0]);
  const length = bestD;
  const width = Math.min(18, length * 0.45);
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = -angle;
  g.add(body);
  if (state !== 'tower') {
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(length * 0.8, state === 'gutted' ? wallH * 0.8 : wallH, 1.2), redStone);
      wall.geometry = new THREE.BoxGeometry(length * 0.8, (state === 'gutted' ? wallH * 0.8 : wallH) + 8, 1.2); // down 8 m, to meet the ground on any slope
      wall.position.set(length * 0.1, wallH / 2 - 5, side * width / 2);
      body.add(wall);
    }
    for (const end of [-1, 1]) {
      const gable = new THREE.Mesh(new THREE.BoxGeometry(1.2, wallH, width), redStone);
      gable.geometry = new THREE.BoxGeometry(1.2, wallH + 8, width);
      gable.position.set(length * 0.1 + end * length * 0.4, wallH / 2 - 5, 0);
      body.add(gable);
    }
    if (state === 'whole') {
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, width * 0.62, length * 0.8, 3), slate);
      roof.rotation.z = Math.PI / 2;
      roof.scale.set(1, 1, 0.55);
      roof.position.set(length * 0.1, wallH + 2.5, 0);
      body.add(roof);
    }
  }
  const tower = new THREE.Mesh(new THREE.BoxGeometry(7, towerH, 7), redStone);
  tower.geometry = new THREE.BoxGeometry(7, towerH + 8, 7);
  tower.position.set(-length * 0.4 + 2, towerH / 2 - 5, 0);
  body.add(tower);
  // (Solid: you can't walk through it.)
  return { i: ci, j: cj, model: { group: g, top: towerH }, era, trueSize: true, solid: { polys: [pts.map((q) => [q.i, q.j])] } };
}

// The Dutch House: a 17th-century timber-framed house on the corner of High Street and Wine Street, five storeys
// with jettied upper floors. Lost after the Blitz. Position and size approximate.
function dutchHouse(ctx) {
  const a = ctx.at(51.4549, -2.5932);
  if (!a) return [];
  const g = new THREE.Group();
  for (let s = 0; s < 5; s++) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(8 + s * 0.5, 3.2, 10 + s * 0.5), s % 2 ? plaster : plaster);
    floor.position.y = 1.6 + s * 3.2;
    g.add(floor);
    for (const side of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(8.6 + s * 0.5, 0.35, 0.3), timber);
      beam.position.set(0, s * 3.2 + 0.2, side * (5.1 + s * 0.25));
      g.add(beam);
    }
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(8, 5, 4), timber);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 18.5;
  g.add(roof);
  return [{ ...a, model: { group: g, top: 21 }, era: ['georgian', 'then'], trueSize: true }]; // the Dutch House (1676; lost 1940)
}

// SS Great Britain as she is today, back in the dock she was built in, with the glass plate at her waterline.
// (She was away from 1845 to 1970, so she's shown only in 'now'.) Bow towards the harbour end of the dock.
function ssGreatBritainToday(ctx, source) {
  const outline = source.osm?.features.find((f) => f.name === 'SS Great Britain')?.outline;
  if (!outline) return [];
  const pts = outline.map(([lat, lon]) => ctx.at(lat, lon));
  if (pts.some((p) => !p)) return [];
  let best = [0, 1];
  let d = 0;
  pts.forEach((p, a) => pts.forEach((q, b) => {
    const l = Math.hypot(p.i - q.i, p.j - q.j);
    if (l > d) {
      d = l;
      best = [a, b];
    }
  }));
  let [stern, bow] = [pts[best[0]], pts[best[1]]];
  const harbour = ctx.map.bristol?.harbour;
  if (harbour) {
    const near = (p) => {
      let m = Infinity;
      for (let k = 0; k < harbour.length; k += 2) if (harbour[k]) m = Math.min(m, Math.hypot((k % 512) - p.i, Math.floor(k / 512) - p.j));
      return m;
    };
    if (near(stern) < near(bow)) [stern, bow] = [bow, stern];
  }
  const mid = { i: (stern.i + bow.i) / 2, j: (stern.j + bow.j) / 2 };
  const [sx, sz] = ctx.metres(stern.i, stern.j);
  const [bx, bz] = ctx.metres(bow.i, bow.j);
  const g = new THREE.Group();
  const ship = greatBritain({ asBuilt: false });
  ship.rotation.y = -Math.atan2(bz - sz, bx - sx);
  g.add(ship);
  return [{ ...mid, model: { group: g, top: 40 }, era: 'now', trueSize: true, baseAlt: 6.9 }];
}

// The Matthew (replica), moored in the Floating Harbour off Princes Wharf (M Shed): the nearest harbour water to that
// spot, lying along the quay (which runs north-east to south-west here). Approximate.
const MATTHEW_BERTH = [51.44795, -2.59795];
function matthewToday(ctx) {
  const at = ctx.at(...MATTHEW_BERTH);
  const harbour = ctx.map.bristol?.harbour;
  if (!at || !harbour) return [];
  let best = null;
  const r = Math.ceil(60 / ctx.metresPerPixel);
  for (let dj = -r; dj <= r; dj++) {
    for (let di = -r; di <= r; di++) {
      const i = Math.round(at.i + di);
      const j = Math.round(at.j + dj);
      if (i < 0 || j < 0 || i >= RES || j >= RES || !harbour[j * RES + i]) continue;
      const d = Math.hypot(di, dj);
      if (!best || d < best.d) best = { i, j, d };
    }
  }
  if (!best) return [];
  // Stand off the quay a little, into the water.
  const off = 5 / ctx.metresPerPixel;
  const dirI = (best.i - at.i) / (best.d || 1);
  const dirJ = (best.j - at.j) / (best.d || 1);
  const g = new THREE.Group();
  const ship = matthew();
  ship.rotation.y = Math.PI / 4; // bow to the north-east
  g.add(ship);
  return [{ i: best.i + dirI * off, j: best.j + dirJ * off, model: { group: g, top: 22 }, era: 'now', trueSize: true, baseAlt: HARBOUR_LEVEL }];
}

// The town wall and its gates (c.1400 and c.1650): rubble stone about 8 m high and 2 m thick with a battlemented
// walk, round towers at the corners, and a gatehouse with a vaulted passage at each named gate (St John's is
// modelled on its own, with its church). Each stretch stands on the ground beneath it. Heights are typical of
// English town walls, not recorded for Bristol's.
function townWalls(ctx) {
  return [TOWN_WALL, CASTLE_STREET_WALL, INNER_WALL, MARSH_WALL, PORT_WALL].flatMap((w) => wallRun(ctx, w, false));
}

export function wallRun(ctx, line, closed, { height = 8, towers = false, merlonned = true, era = ['medieval', 'castle'] } = {}) {
  // The era's ground where it's loaded (the old quays and banks lie below today's), else today's.
  const groundAt = (i, j) => (i >= 0 && j >= 0 && i <= RES - 1 && j <= RES - 1 && ctx.map.ground ? ctx.map.sample(i, j, ctx.map.ground) : NaN) || ctx.terrainAny(i, j);
  const pts = line.map(([lat, lon, name, across]) => ({ w: ctx.atAny(lat, lon), name, across }));
  const a = pts[0].w;
  const [ax, az] = ctx.metres(a.i, a.j);
  const P = pts.map(({ w, name, across }) => {
    const [x, z] = ctx.metres(w.i, w.j);
    return { x: x - ax, z: z - az, g: groundAt(w.i, w.j), name, across };
  });
  const H = height;
  const T = 2;
  const parts = [];
  // What you can't walk through, in window pixels: the wall's stretches, its towers, and the sides of its gatehouses
  // (their passages stay open).
  const [m0x, m0z] = ctx.metres(0, 0);
  const [m1x] = ctx.metres(1, 0);
  const mpp = m1x - m0x;
  const px = (x, z) => [a.i + x / mpp, a.j + z / mpp];
  const solid = { lines: [], dots: [] };
  const slits = []; // arrow slits and torch brackets
  const windows = []; // lit after dark
  const flames = [];
  const glows = [];
  let sinceTorch = 12;
  // A torch on a wall face at (x, z), facing out along (nx, nz), its flame at height y.
  const torch = (x, z, nx, nz, y, rot) => {
    slits.push(new THREE.BoxGeometry(0.08, 0.5, 0.3).rotateY(rot).translate(x - nx * 0.1, y - 0.25, z - nz * 0.1));
    flames.push(new THREE.ConeGeometry(0.11, 0.38, 6).translate(x, y + 0.19, z));
    glows.push(x, y + 0.3, z);
  };
  // The opening left at a gate, on the side towards the previous point (before) or the next (after). St John's
  // church stands on the wall from its gate north-eastwards (about 38 m), but only about 4 m to the south-west.
  const gap = (p, side) => (p.name ? (p.name.startsWith('St John') ? (side === 'before' ? 4.3 : 9) : p.name === 'postern' ? 1.4 : 4.5) : 0);
  for (let k = 0; k < (closed ? P.length : P.length - 1); k++) {
    const p = P[k];
    const q = P[(k + 1) % P.length];
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    const s0 = gap(p, 'after');
    const s1 = len - gap(q, 'before');
    if (s1 - s0 < 0.5) continue;
    const ux = (q.x - p.x) / len;
    const uz = (q.z - p.z) / len;
    const rot = -Math.atan2(uz, ux);
    // In pieces of up to 6 m, each at the height of the ground under it, so the wall steps down the hill.
    const n = Math.ceil((s1 - s0) / 6);
    for (let m = 0; m < n; m++) {
      const t0 = s0 + ((s1 - s0) * m) / n;
      const t1 = s0 + ((s1 - s0) * (m + 1)) / n;
      const cx = p.x + ux * (t0 + t1) / 2;
      const cz = p.z + uz * (t0 + t1) / 2;
      // Its height from the ground under the piece itself (the highest of its ends and middle), so the wall's top
      // stands its full height above the ground everywhere, not just at the run's corners.
      const g = Math.max(...[t0, (t0 + t1) / 2, t1].map((t) => groundAt(a.i + (p.x + ux * t) / mpp, a.j + (p.z + uz * t) / mpp)));
      // (Down to 12 m below, so the wall meets the ground even where it falls away, or has been cut down to the
      // old quays or the moat.)
      parts.push(metreUVs(new THREE.BoxGeometry(t1 - t0 + 0.05, H + 12, T), 3).rotateY(rot).translate(cx, g + (H - 12) / 2, cz));
      if (merlonned) merlons(parts, p.x + ux * t0, p.z + uz * t0, p.x + ux * t1, p.z + uz * t1, g + H, 0.7);
      if (!merlonned) continue;
      // An arrow slit in every other stretch (now and then a lit window instead), and a torch every 30 m or so on
      // the side facing out.
      if ((k + m) % 2 === 0) {
        const lit = (k * 7 + m * 3) % 5 === 0;
        (lit ? windows : slits).push(new THREE.BoxGeometry(lit ? 0.5 : 0.16, lit ? 0.8 : 1.3, T + 0.08).rotateY(rot).translate(cx, g + H * 0.55, cz));
      }
      sinceTorch += t1 - t0;
      if (sinceTorch > 30) {
        sinceTorch = 0;
        const [nx, nz] = [-uz, ux];
        for (const sd of [-1, 1]) torch(cx + nx * sd * (T / 2 + 0.18), cz + nz * sd * (T / 2 + 0.18), nx * sd, nz * sd, g + H * 0.45 + 1.2, rot);
      }
    }
    // (Square-ended: round ends reached 1.2 m into each gap, closing the posterns' 2.8 m openings to 0.4 m.)
    // (At a postern a little short of its jambs too, which mark its sides: on a diagonal stretch the 1.17 m mask
    // otherwise left only a corner-to-corner gap.)
    const c0 = s0 + (p.name === 'postern' ? 0.4 : 0);
    const c1 = s1 - (q.name === 'postern' ? 0.4 : 0);
    solid.lines.push({ pts: [px(p.x + ux * c0, p.z + uz * c0), px(p.x + ux * c1, p.z + uz * c1)], half: T / 2 + 0.2, cap: 'butt' });
    // A round tower where the wall turns sharply (not at gates).
    if (!closed && k >= P.length - 2) continue;
    const r = P[(k + 2) % P.length];
    const turn = Math.abs(Math.atan2((r.z - q.z) * ux - (r.x - q.x) * uz, (r.x - q.x) * ux + (r.z - q.z) * uz));
    if (!q.name && towers !== 'none' && (turn > 0.5 || towers)) {
      parts.push(roundUVs(new THREE.CylinderGeometry(3.2, 3.6, H + 15, 14), 3.4, H + 15, 3).translate(q.x, q.g + (H + 15) / 2 - 12, q.z));
      solid.dots.push({ at: px(q.x, q.z), r: 3.6 });
      // Battlements round its top, and slits (one lit) round its sides.
      const top = q.g + H + 3;
      for (let n = 0; n < 12; n++) {
        const a = (n / 12) * Math.PI * 2;
        parts.push(metreUVs(new THREE.BoxGeometry(0.75, 1.1, 0.6)).rotateY(-a).translate(q.x + Math.cos(a) * 2.95, top + 0.55, q.z + Math.sin(a) * 2.95));
      }
      parts.push(metreUVs(new THREE.CylinderGeometry(3.45, 3.3, 0.5, 14)).translate(q.x, top - 0.2, q.z)); // a corbelled string course
      for (let n = 0; n < 3; n++) {
        const a = (n / 3) * Math.PI * 2 + k;
        (n === 0 ? windows : slits).push(new THREE.BoxGeometry(0.3, n === 0 ? 0.8 : 1.2, n === 0 ? 0.5 : 0.18).rotateY(-a + Math.PI / 2).translate(q.x + Math.cos(a) * 3.25, q.g + H * 0.7, q.z + Math.sin(a) * 3.25));
      }
    }
  }
  // Gatehouses at the named gates (other than St John's): a tower over a pointed, vaulted passage.
  const gates = [];
  const fine = []; // posterns' sides, tested exactly: { at: [i, j] (window pixels), cx, cz (along the wall), deep }
  // A postern is a plain doorway in a short stretch of wall.
  P.forEach((p, k) => {
    if (!p.name || p.name.startsWith('St John')) return;
    const prev = P[Math.max(0, k - 1)];
    const next = P[Math.min(P.length - 1, k + 1)];
    // Its passage along the street through it (bearing b: east sin b, south -cos b), else square to the wall.
    const b = ((p.across ?? 0) + 90) * (Math.PI / 180);
    const rot = p.across != null ? -Math.atan2(-Math.cos(b), Math.sin(b)) : -Math.atan2(next.z - prev.z, next.x - prev.x);
    const [cx, cz] = [Math.cos(rot), -Math.sin(rot)]; // along the wall
    const postern = p.name === 'postern';
    const half = postern ? 1.5 : 4.6; // half its width along the wall
    const deep = postern ? T : 8; // through the wall
    // Its floor: the lowest ground under it, so the passage never stands above the street on a slope. Its arch is
    // measured from the highest ground under it (along the passage and a step beyond each face), so on a hill the
    // passage is as tall on the uphill side as on the downhill one, and the gatehouse taller by the difference.
    let g = Infinity;
    let gHigh = -Infinity;
    for (const s of [-1, 0, 1]) for (const t of [-1, 0, 1]) {
      const x = p.x + cx * s * half - cz * t * (deep / 2);
      const z = p.z + cz * s * half + cx * t * (deep / 2);
      g = Math.min(g, groundAt(a.i + x / mpp, a.j + z / mpp));
    }
    for (const t of [-1.4, -1, -0.5, 0, 0.5, 1, 1.4]) {
      const x = p.x - cz * t * (deep / 2);
      const z = p.z + cx * t * (deep / 2);
      gHigh = Math.max(gHigh, groundAt(a.i + x / mpp, a.j + z / mpp));
    }
    const rise = Math.max(0, gHigh - g);
    (ctx.map.gateReport ??= {})[`${p.name} ${Math.round(p.x)},${Math.round(p.z)}`] = Math.round(rise * 10) / 10;
    const passage = postern ? { cx: 0, w: 1.6, y0: -12, spring: 2.0 + rise, apex: 2.8 + rise } : { cx: 0, w: 3.4, y0: -12, spring: 3.2 + rise, apex: 5.0 + rise };
    const top = (postern ? H : H + 4) + rise;
    const body = archedWall(-half, half, -12, top, deep, [passage]).translate(0, 0, deep / 2);
    const pieces = [body.index ? body.toNonIndexed() : body];
    if (!postern) pieces.push(metreUVs(new THREE.BoxGeometry(9.6, 0.4, 8.4), 2).translate(0, top + 0.2, 0).toNonIndexed());
    const gate = mergeGeometries(pieces);
    gate.rotateY(rot).translate(p.x, g, p.z);
    gates.push(gate);
    // Windows over the arch on both faces (firelit after dark), and a torch either side of the passage.
    const at = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(new THREE.Vector3(p.x, g, p.z));
    for (const sd of [-1, 1]) {
      const face = sd * (deep / 2 + 0.03);
      if (!postern) for (const lx of [-2.2, 2.2]) windows.push(new THREE.BoxGeometry(0.6, 1.0, 0.1).rotateY(rot).translate(...at(lx, top - 2.6, face).toArray()));
      const [nx, nz] = [Math.sin(rot) * sd, Math.cos(rot) * sd];
      for (const lx of postern ? [1.4] : [-2.6, 2.6]) {
        const w = at(lx, 0, sd * (deep / 2 + 0.18));
        torch(w.x, w.z, nx, nz, groundAt(a.i + w.x / mpp, a.j + w.z / mpp) + 2.7, rot);
      }
    }
    // Its two sides (either side of the passage), through the wall. A postern's are tested exactly (fine), not in
    // the 1.17 m mask, where its 1.5 m doorway closed up (the user couldn't walk through).
    if (postern) fine.push({ at: px(p.x, p.z), cx, cz, deep });
    const side = 3.15;
    for (const sgn of postern ? [] : [-1, 1]) {
      const ox = p.x + cx * sgn * side;
      const oz = p.z + cz * sgn * side;
      solid.lines.push({ pts: [px(ox - cz * deep / 2, oz + cx * deep / 2), px(ox + cz * deep / 2, oz - cx * deep / 2)], half: 1.5 });
    }
    if (merlonned) merlons(parts, p.x - (half - 0.2) * cx, p.z - (half - 0.2) * cz, p.x + (half - 0.2) * cx, p.z + (half - 0.2) * cz, g + top + 0.4, 0.7);
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(parts), castleStone));
  if (gates.length) g.add(new THREE.Mesh(mergeGeometries(gates), castleStone));
  const nonIndexed = (list) => list.map((q) => (q.index ? q.toNonIndexed() : q));
  if (slits.length) g.add(new THREE.Mesh(mergeGeometries(nonIndexed(slits)), slitMat));
  if (windows.length) g.add(new THREE.Mesh(mergeGeometries(nonIndexed(windows)), wallWindowMat));
  if (flames.length) g.add(new THREE.Mesh(mergeGeometries(nonIndexed(flames)), torchFlameMat));
  let glow = null;
  if (glows.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(glows, 3));
    glow = new THREE.Points(geo, torchGlowMat);
    glow.frustumCulled = false;
    g.add(glow);
  }
  // Torches flicker; their glows are about 3 m across (point sizes are in world units, so follow the scale).
  const animate = (t) => {
    if (!g.visible) return;
    torchFlameMat.opacity = (0.55 + 0.4 * dayUniforms.uNight.value) * (0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.1));
    if (glow) torchGlowMat.size = 3 * g.getWorldScale(_ws).x;
  };
  // (Either side of a postern's 1.5 m doorway, out to where the wall's own mask begins.)
  const collide = fine.length ? (i, j) => fine.some(({ at: [pi, pj], cx, cz, deep }) => {
    const dx = (i - pi) * mpp;
    const dz = (j - pj) * mpp;
    const u = Math.abs(dx * cx + dz * cz);
    return u > 0.75 && u < 2.0 && Math.abs(dz * cx - dx * cz) < deep / 2 + 0.3;
  }) : undefined;
  return [{ ...a, model: { group: g, top: H + 6 }, era, trueSize: true, baseAlt: 0, far: true, solid, animate, collide }];
}

const yardsKept = new Set();
export function bristolStructures(ctx, source) {
  const items = [...castle(ctx), ...townWalls(ctx), ...dutchHouse(ctx), ...ssGreatBritainToday(ctx, source), ...matthewToday(ctx)];
  const outline = (name) => source.osm?.features.find((f) => f.name === name)?.outline;
  const peter = outline("St Peter's Church");
  const mary = outline('Saint Mary-le-Port Church');
  // In c.1400 and c.1650 they're built from the kit like the other churches (churches.js), with their yards kept
  // clear of houses; later, as they were.
  const ground = (i, j) => (i >= 0 && j >= 0 && i <= RES - 1 && j <= RES - 1 && ctx.map.ground ? ctx.map.sample(i, j, ctx.map.ground) : NaN) || ctx.terrainAny(i, j);
  for (const [o, towerH, later] of [[peter, 28, [['georgian', 'whole'], ['then', 'whole'], ['blitz', 'gutted']]], [mary, 30, [['georgian', 'whole'], ['then', 'whole'], ['blitz', 'tower']]]]) {
    if (!o) continue;
    if (!yardsKept.has(towerH)) MEDIEVAL_CLEAR.push(outlineClear(o, 6)); // (once: this runs for every window)
    yardsKept.add(towerH);
    const kit = kitChurch(ctx, o, { towerH, era: ['medieval', 'castle'], ground });
    if (kit) items.push(kit);
    for (const [era, state] of later) {
      const it = church(ctx, o, { towerH, state, era });
      if (it) items.push(it);
    }
  }
  return items;
}

// --- scenes ---

function bomber() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x3a3e36, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 16, 8), grey);
  body.rotation.z = Math.PI / 2;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 22), grey);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 7), grey);
  tail.position.x = -7;
  g.add(body, wing, tail);
  return g;
}

export class BlitzNight {
  static title = 'The Blitz, 24 November 1940 (dramatisation)';
  static caption = "148 aircraft set out and 135 reached Bristol, dropping around 12,000 incendiaries and 160 tons of high explosive. Fires burned through the night between Broad Quay and Old Market; of some 500 buildings around Wine Street and Castle Street, about 80 survived. 200 people died. Aircraft, searchlights and fires here are illustrative.";

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    this.map = ctx.map;
    this.map.setEra('then');
    ctx.audio.siren(10);
    this.planes = [0, 1, 2, 3].map((k) => {
      const p = bomber();
      root.add(p);
      return { p, start: 6 + k * 9, lane: (k - 1.5) * 220, engine: null };
    });
    // Where incendiaries fall: built-up cells inside Castle Park's outline (the old shopping heart) and around it.
    this.targets = [];
    const b = this.map.bristol;
    for (let tries = 0; tries < 4000 && this.targets.length < 40; tries++) {
      const i = Math.floor(rand(0, RES));
      const j = Math.floor(rand(0, RES));
      const k = j * RES + i;
      if (b?.massing?.[k] && (b.castlePark[k] || Math.random() < 0.08)) this.targets.push({ i, j });
    }
    this.fires = [];
    this.lights = [[-500, 400], [450, 380], [-300, -450]].map(([e, n]) => {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(6, 0.8, 1, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.geometry.translate(0, 0.5, 0);
      root.add(beam);
      return { beam, e, n };
    });
    this.nextDrop = 8;
    this.nextFlak = 6;
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    let lead = null;
    for (const pl of this.planes) {
      const d = -2200 + 70 * (t - pl.start);
      pl.p.visible = t > pl.start && d < 2200;
      if (!pl.p.visible) {
        if (pl.engine && d >= 2200) {
          pl.engine.stop();
          pl.engine = null;
        }
        continue;
      }
      pl.engine ??= ctx.audio.engine();
      ctx.place(pl.p, d * 0.6 + pl.lane * 0.8, d * 0.8 - pl.lane * 0.6, 900);
      pl.p.scale.setScalar(ctx.minSize(22));
      pl.p.rotation.y = Math.atan2(0.8, 0.6);
      pl.engine.move(ctx.audioPos(pl.p));
      if (Math.abs(d) < 900) lead = pl.p;
    }
    for (const l of this.lights) {
      ctx.place(l.beam, l.e, l.n, ctx.groundAlt(l.e, l.n));
      const aim = lead ? lead.position.clone().sub(l.beam.position) : new THREE.Vector3(Math.sin(t * 0.4 + l.e), 3, Math.cos(t * 0.3 + l.n));
      const len = lead ? aim.length() : 1200 * ctx.scaleTrue();
      const w = ctx.minSize(200);
      l.beam.scale.set(w, len, w);
      l.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim.normalize());
    }
    if (t > 6 && t < 52 && (this.nextFlak -= dt) <= 0) {
      this.nextFlak = rand(0.4, 0.9);
      const e = rand(-900, 900);
      const n = rand(-700, 700);
      this.fx.burst(ctx, e, n, rand(700, 1100), { size: 22, life: 5 });
      const ap = ctx.audioPosAt(e, n, 900);
      ctx.audio.flak(ap, ap.length());
    }
    // Incendiaries: a white flash on a roof, then a fire that grows.
    if (t > 9 && t < 48 && this.targets.length && (this.nextDrop -= dt) <= 0) {
      this.nextDrop = rand(0.4, 1.2);
      const tg = this.targets.splice(Math.floor(rand(0, this.targets.length)), 1)[0];
      const span = this.map.span;
      const [e, n] = [(tg.i / (RES - 1) - 0.5) * span - ctx.anchorMetres[0], -((tg.j / (RES - 1) - 0.5) * span - ctx.anchorMetres[1])];
      const roof = this.map.sample(tg.i, tg.j);
      this.fx.burst(ctx, e, n, roof + 3, { flash: 0xffffff, smoke: 0x2a2420, size: 10, life: 3 });
      const fire = { e, n, roof, size: 3, fire: new FireLite(this.root) };
      this.fires.push(fire);
      if (Math.random() < 0.3) {
        const ap = ctx.audioPosAt(e, n, roof);
        ctx.audio.blast(ap, ap.length());
      }
    }
    // After the raid the old heart is gone: switch to the 1941 state while the fires burn down.
    if (t > 50 && this.map.era !== 'blitz') this.map.setEra('blitz');
    for (const f of this.fires) {
      f.size = t < 55 ? Math.min(9, f.size + dt * 0.4) : Math.max(0, f.size - dt * 0.5);
      f.fire.update(ctx, dt, f.e, f.n, (this.map.era === 'blitz' ? f.roof - 8 : f.roof) + 1, f.size);
    }
    this.fx.update(dt);
    return t < 72;
  }

  stop() {
    for (const pl of this.planes) pl.engine?.stop();
    this.fx.clear();
    this.ctx.audio.allClear();
  }
}

// A lighter fire than the stronghold's beacon, for dozens at once.
class FireLite {
  constructor(root) {
    this.root = root;
    this.flames = [0, 1, 2].map(() => {
      const s = puff(0xff7a20, 0.9, true);
      root.add(s);
      return s;
    });
    this.fx = new Effects(root);
    this.smokeT = rand(0, 0.5);
  }

  update(ctx, dt, e, n, alt, size) {
    const k = ctx.minSize(Math.max(size, 1));
    this.flames.forEach((f) => {
      f.visible = size > 0.2;
      ctx.place(f, e + rand(-0.3, 0.3) * size, n + rand(-0.3, 0.3) * size, alt + rand(0.2, 0.6) * size);
      f.scale.setScalar(size * k * rand(0.6, 1.2));
    });
    if (size > 0.5 && (this.smokeT -= dt) <= 0) {
      this.smokeT = 0.5;
      this.fx.burst(ctx, e, n, alt + size * 2, { flash: 0x000000, smoke: 0x2a2622, size: size * 3, life: 8 });
    }
    this.fx.update(dt);
  }
}

function ship() {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x3e2e22, roughness: 0.8 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(26, 3, 7), hullMat);
  hull.position.y = 1.5;
  g.add(hull);
  for (const x of [-5, 5]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 20, 6), hullMat);
    mast.position.set(x, 12, 0);
    const yard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 10), hullMat);
    yard.position.set(x, 18, 0);
    g.add(mast, yard);
  }
  return g;
}

export class TideBefore1809 {
  static title = 'The tide goes out: Bristol before the Floating Harbour';
  static caption = "Before 1809 the docks were the tidal Avon and Frome. The tide here rises and falls about 14 m, so at low water ships settled on the mud at the quays; they had to be built and stowed to take it: 'shipshape and Bristol fashion'. Jessop's Floating Harbour (1804–1809) held the water level constant, with the New Cut dug to take the river's tide.";

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.map = ctx.map;
    this.map.setEra('castle');
    // Ships along the quays: harbour cells that are near its edge.
    const b = this.map.bristol;
    this.ships = [];
    for (let tries = 0; tries < 6000 && this.ships.length < 7 && b; tries++) {
      const i = Math.floor(rand(0, RES));
      const j = Math.floor(rand(0, RES));
      const k = j * RES + i;
      if (!b.harbour[k] || b.channel[k] > 0.5 || b.channel[k] < 0.15) continue;
      const span = this.map.span;
      const e = (i / (RES - 1) - 0.5) * span - ctx.anchorMetres[0];
      const n = -((j / (RES - 1) - 0.5) * span - ctx.anchorMetres[1]);
      if (Math.hypot(e, n) > 600 || this.ships.some((s) => Math.hypot(s.e - e, s.n - n) < 60)) continue;
      const g = ship();
      root.add(g);
      this.ships.push({ g, e, n, i, j, yaw: rand(0, Math.PI), tilt: rand(-1, 1) > 0 ? 1 : -1 });
    }
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    // High water to low over 30 s, hold, then back in.
    const level = t < 30 ? 8.5 - 7.7 * (t / 30) : t < 42 ? 0.8 : 0.8 + 7.7 * Math.min(1, (t - 42) / 20);
    this.map.waterLevel = level;
    this.map.status = `TIDE ${level.toFixed(1)} m · ${level < 2 ? 'LOW WATER: SHIPS ON THE MUD' : level > 7.5 ? 'HIGH WATER' : t < 30 ? 'EBBING' : 'FLOODING'}`;
    if (Math.floor(t * 2) !== this.lastSign) {
      this.lastSign = Math.floor(t * 2);
      this.map.drawSign();
    }
    for (const s of this.ships) {
      const bed = this.map.sample(s.i, s.j);
      const aground = level < bed + 2.5;
      ctx.place(s.g, s.e, s.n, Math.max(level - 1.5, bed));
      s.g.scale.setScalar(ctx.minSize(26));
      s.g.rotation.set(0, s.yaw, aground ? s.tilt * 0.12 : 0);
    }
    return t < 64;
  }

  stop() {
    this.map.waterLevel = null;
    this.map.status = '';
  }
}
