import * as THREE from 'three';
import { outskirts, BEAR_PIT, PIT_R, HORSE_FAIR } from './outskirts.js';
import { RES } from './terrain.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { metreUVs, roundUVs } from './textures.js';
import { wallRun, TOWN_WALL, CASTLE_STREET_WALL, INNER_WALL, MARSH_WALL, PORT_WALL, FROME, CASTLE_WARD, KEEP, QUAYSIDE, EAST_MOAT, MARSH_POOL, MEDIEVAL_CLEAR } from './bristol.js';
import { wall as archedWall } from './stjohn.js';
import { phMaterial } from './phtex.js';
import { townLife } from './townlife.js';
import { kitHouses } from './houses.js';
import { housePlan, buildHouses, kitMaterial } from './kithouse.js';
import { houseFittings } from './fittings.js';
import { footbridges } from './crossings.js';
import { townTrees } from './trees.js';
import { townsfolk } from './people.js';
import { ambience } from './ambience.js';
import { kitChurch, outlineClear } from './churches.js';
import { dayUniforms } from './daylight.js';

// Documented landmarks of medieval and early modern Bristol (c.1400, c.1650, and those still standing c.1750), and
// the features named on the corner map for each period.
// - Churches on their mapped outlines (OpenStreetMap; simplified), drawn whole: St Nicholas over its gate, All
//   Saints, the old Christ Church (rebuilt 1786–91), St Stephen's, St Thomas, Temple Church and St Mary Redcliffe;
//   the Chapel of the Three Kings of Cologne at the top of Christmas Steps (c.1504) in c.1650. Tower heights are
//   approximate; St Mary Redcliffe's spire, struck by lightning in 1446, is left out.
// - Bristol Bridge (1247–1764): four stone arches across the Avon on today's bridge's line, lined both sides with
//   tall timber houses. The arch spans, house sizes and heights are approximate.
// - The High Cross (1373) at the crossing of High, Broad, Corn and Wine Streets, moved away in 1733 (it now stands
//   at Stourhead): a tiered Gothic cross about 12 m high, its form simplified.
// - St James' Priory (founded c.1129; its tower c.1374) on its mapped outline, and north of the Frome towards it, a
//   plague burial ground (the Black Death reached Bristol in 1348): its site, walls, trenches and crosses are
//   illustrative, not documented.

const OUTLINES = {
  "Christ Church": [[51.4553152, -2.5928955], [51.4552948, -2.5928006], [51.4551819, -2.5927049], [51.455049, -2.592927], [51.4550744, -2.592966], [51.4550205, -2.5930564], [51.4550829, -2.5931436], [51.4551341, -2.5930577], [51.4551487, -2.5930802], [51.4551595, -2.5930621], [51.4551711, -2.5930799], [51.4551861, -2.5930624], [51.4552181, -2.5931117], [51.4552448, -2.5930669], [51.4552281, -2.5930413]],
  "St Nicholas": [[51.4539434, -2.5925509], [51.4540738, -2.592126], [51.4539463, -2.5920253], [51.453817, -2.5924468], [51.4538416, -2.5924662], [51.4538244, -2.592522], [51.4538956, -2.5925782], [51.4539117, -2.5925258]],
  "St Thomas": [[51.452498, -2.5894681], [51.4524046, -2.5893961], [51.4522588, -2.589883], [51.4523376, -2.5899437], [51.4523086, -2.5900407], [51.4523703, -2.5900882], [51.4525241, -2.5895742], [51.4524771, -2.5895379]],
  "All Saints": [[51.4546056, -2.5933501], [51.4546463, -2.5932533], [51.4546032, -2.5932066], [51.4546566, -2.5930799], [51.4546963, -2.5931229], [51.4547649, -2.5929599], [51.4548139, -2.593013], [51.4547752, -2.5931049], [51.4548169, -2.5931501], [51.4547365, -2.5933579], [51.4546834, -2.5933004], [51.4546447, -2.5933925]],
  "St Stephen's": [[51.4542382, -2.5958045], [51.454364, -2.5958267], [51.4543347, -2.5962542], [51.4541928, -2.5962291], [51.4541952, -2.596088], [51.4542185, -2.5960922]],
  "Bristol Bridge": [[51.4537355, -2.5917148], [51.4534217, -2.5911285], [51.453544, -2.5909599], [51.4538578, -2.5915461]],
  "St Mary Redcliffe": [[51.4484768, -2.5900308], [51.4484593, -2.5898531], [51.4485163, -2.5898403], [51.4485136, -2.5897692], [51.44843, -2.5897711], [51.448415, -2.5896148], [51.4485027, -2.5895931], [51.4484817, -2.5893744], [51.4484333, -2.5893864], [51.4484262, -2.5892448], [51.448381, -2.5892585], [51.4483766, -2.5891468], [51.4483161, -2.5891618], [51.4482986, -2.5889805], [51.4482181, -2.5890005], [51.4482355, -2.5891817], [51.4481691, -2.5891982], [51.4481856, -2.5893584], [51.4482053, -2.5894541], [51.4481362, -2.5894535], [51.4481259, -2.5895461], [51.4481412, -2.5896873], [51.4482256, -2.5896664], [51.4482435, -2.5898524], [51.4481919, -2.5898775], [51.4481989, -2.5899484], [51.4482515, -2.5899354], [51.4482566, -2.5900853]],
  "Temple Church": [[51.4522408, -2.5860866], [51.4522831, -2.5861378], [51.4521527, -2.5869738], [51.4520811, -2.586945], [51.4520298, -2.5870717], [51.4519578, -2.5870062], [51.4520612, -2.586346], [51.4521235, -2.5863666], [51.4521394, -2.5862425], [51.4522254, -2.5862708]],
  "St James' Priory": [[51.4585718, -2.5929408], [51.4585408, -2.5930522], [51.4584999, -2.5930229], [51.4584742, -2.5931151], [51.4585224, -2.5931499], [51.4585226, -2.593174], [51.4585285, -2.5931549], [51.4585703, -2.5931885], [51.4585719, -2.59322], [51.4585794, -2.5931958], [51.4586552, -2.5932567], [51.4586587, -2.5932834], [51.4586647, -2.5932643], [51.4587346, -2.5933173], [51.4588366, -2.5929652], [51.4587511, -2.5929015], [51.4587691, -2.5928395], [51.4586282, -2.5927311], [51.4586125, -2.5927915], [51.4585925, -2.5927829], [51.4585827, -2.5928181], [51.4586021, -2.5928319]],
  // St Philip and St Jacob ("Pip 'n' Jay"; OSM "Central"), east of the castle across its moat, by Old Market: its
  // mapped outline's extent, as a rectangle (the kit church is built in its oriented box anyway).
  "St Philip and St Jacob": [[51.45463, -2.58470], [51.45463, -2.58410], [51.45434, -2.58410], [51.45434, -2.58470]],
  "Chapel of the Three Kings": [[51.4561458, -2.5973915], [51.4561564, -2.5973921], [51.4561587, -2.5974705], [51.4560918, -2.5974706], [51.4560904, -2.5973883]],
};

const stone = phMaterial('castle_wall_varriation', { color: 0xd8d0c0 });
const paleStone = phMaterial('medieval_blocks_05');
const daub = phMaterial('white_rough_plaster', { color: 0xf0e6d0 });
const oak = phMaterial('medieval_wood');
const tile = phMaterial('clay_roof_tiles_02');
const shadow = new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 1 });

const EARLY = ['medieval', 'castle'];
const CHURCHES = [
  ['St Nicholas', 30, EARLY],
  ['All Saints', 25, EARLY],
  ['Christ Church', 30, ['medieval', 'castle']],
  ["St Stephen's", 40, EARLY],
  ['St Thomas', 30, EARLY],
  ['Temple Church', 35, [...EARLY, 'georgian']],
  ['St Mary Redcliffe', 45, [...EARLY, 'georgian']],
  ["St James' Priory", 24, EARLY],
  ['St Philip and St Jacob', 28, EARLY],
  ['Chapel of the Three Kings', 6, ['castle']],
];

const merge = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));

// Bristol Bridge with its houses, between the midpoints of the mapped bridge's ends.
function bristolBridge(ctx) {
  const o = OUTLINES['Bristol Bridge'];
  const ends = [[(o[0][0] + o[3][0]) / 2, (o[0][1] + o[3][1]) / 2], [(o[1][0] + o[2][0]) / 2, (o[1][1] + o[2][1]) / 2]];
  const [p, q] = ends.map(([lat, lon]) => ctx.atAny(lat, lon));
  const [px, pz] = ctx.metres(p.i, p.j);
  const [qx, qz] = ctx.metres(q.i, q.j);
  const L = Math.hypot(qx - px, qz - pz) + 8; // reaching a little onto each bank
  const deck = Math.max(ctx.terrainAny(p.i, p.j), ctx.terrainAny(q.i, q.j));
  const g = new THREE.Group();
  const f = new THREE.Group();
  f.rotation.y = -Math.atan2(qz - pz, qx - px);
  g.add(f);
  // Four pointed arches on piers with cutwaters, the whole width of the bridge and its houses (16 m).
  const W = 16;
  const span = L / 4;
  const arches = [0, 1, 2, 3].map((k) => ({ cx: -L / 2 + span * (k + 0.5), w: span - 3.2, y0: -12, spring: -6.5, apex: -2.2 }));
  const body = archedWall(-L / 2, L / 2, -13, 0.4, W, arches).translate(0, 0, W / 2);
  const cut = [];
  for (let k = 1; k < 4; k++) {
    for (const s of [-1, 1]) cut.push(new THREE.CylinderGeometry(0.01, 1.6, 4, 3).rotateX(s * Math.PI / 2).rotateZ(Math.PI / 2).translate(-L / 2 + span * k, -9, s * (W / 2 + 1.6)));
  }
  f.add(new THREE.Mesh(merge([body, ...cut.map((c) => metreUVs(c, 2))]), stone));
  // The roadway between the houses, and the houses along both sides, built from the kit (kithouse.js): jettied,
  // gables to the roadway, shops and houses by turns, their backs overhanging the river.
  // No two alike, and no regular rhythm: each house's width (two or three bays), depth, jetty, shop or house, the
  // gaps between them, how far each stands back and a slight skew all vary (seeded), and each side runs on its own.
  const placed = [];
  let seed = 1247;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let n = 0;
  for (const side of [-1, 1]) {
    let x = -L / 2 + 2 + rand() * 2;
    for (;;) {
      const w = rand() < 0.4 ? 3 : 2;
      const W = w * 2;
      if (x + W > L / 2 - 2) break;
      const r = rand();
      const plan = housePlan({ w, d: rand() < 0.5 ? 3 : 4, kind: r < 0.55 ? 'shop' : 'house', brick: r > 0.9, jetty: rand() < 0.75, seed: rand(), goods: rand() < 0.5 ? ['GOODS_RED', 'GOODS_BLUE', 'GOODS_OCHRE'] : null });
      const back = rand() * 0.5;
      const skew = (rand() - 0.5) * 0.06;
      placed.push({ plan, matrix: new THREE.Matrix4().makeRotationY((side > 0 ? Math.PI : 0) + skew).setPosition(x + W / 2, 0.4, side * (2.4 + back)) });
      x += W + 0.15 + (rand() < 0.25 ? 1 + rand() * 2 : rand() * 0.4);
      n++;
    }
  }
  buildHouses(placed).then((h) => f.add(h));
  // Solid: the two rows of houses, either side of the roadway.
  const along = [(q.i - p.i), (q.j - p.j)];
  const len = Math.hypot(...along);
  const [ui, uj] = [along[0] / len, along[1] / len];
  const off = 5 / ctx.metresPerPixel;
  const solid = { lines: [-1, 1].map((sd) => ({ pts: [[p.i - uj * off * sd, p.j + ui * off * sd], [q.i - uj * off * sd, q.j + ui * off * sd]], half: 2.6 })) };
  // Walking: the roadway between the house rows (its top 0.4 m above the deck level), bank to bank and a little
  // onto each, so you cross on it instead of sinking through to the river.
  const { walk } = deckOf(ctx, p, q, L, 2.4, deck + 0.4, 0);
  return [{ i: (p.i + q.i) / 2, j: (p.j + q.j) / 2, model: { group: g, top: 14 }, era: EARLY, trueSize: true, baseAlt: deck, far: true, solid, walk }];
}

// The High Cross: three octagonal steps, two arcaded stages with niches for statues, and a pinnacle with a cross.
function highCross(ctx) {
  const at = ctx.at(51.454893, -2.592665);
  if (!at) return [];
  const parts = [];
  [[3.4, 0.4], [2.9, 0.8], [2.4, 1.2]].forEach(([r, y]) => parts.push(new THREE.CylinderGeometry(r, r, 0.4, 8).translate(0, y - 0.2, 0)));
  parts.push(roundUVs(new THREE.CylinderGeometry(1.6, 1.7, 4.2, 8), 1.6, 4.2, 1.2).translate(0, 1.2 + 2.1, 0));
  parts.push(new THREE.CylinderGeometry(2.0, 1.7, 0.5, 8).translate(0, 5.6, 0));
  parts.push(roundUVs(new THREE.CylinderGeometry(1.05, 1.15, 3.4, 8), 1.1, 3.4, 1.2).translate(0, 5.85 + 1.7, 0));
  parts.push(new THREE.CylinderGeometry(1.4, 1.1, 0.4, 8).translate(0, 9.45, 0));
  parts.push(new THREE.CylinderGeometry(0.05, 0.9, 3.0, 8).translate(0, 11.15, 0));
  parts.push(new THREE.BoxGeometry(0.16, 1.0, 0.16).translate(0, 13.0, 0), new THREE.BoxGeometry(0.6, 0.16, 0.16).translate(0, 13.2, 0));
  const niches = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    niches.push(new THREE.PlaneGeometry(0.75, 2.4).rotateY(a).translate(Math.sin(a) * 1.58, 3.4, Math.cos(a) * 1.58));
    niches.push(new THREE.PlaneGeometry(0.5, 1.8).rotateY(a).translate(Math.sin(a) * 1.04, 7.6, Math.cos(a) * 1.04));
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(merge(parts), paleStone), new THREE.Mesh(merge(niches), shadow));
  return [{ ...at, model: { group: g, top: 13.5 }, era: EARLY, trueSize: true, solid: { dots: [{ at: [at.i, at.j], r: 3.4 }] } }];
}

// A single-arched stone bridge from a to b ([lat, lon]), its roadway at `deck` metres OD, 7 m wide with parapets.
// A low stone bridge straight across the water from bank a to bank b (the shortest span between the two roads),
// each end resting on the ground of its own bank (so where the banks differ the deck slopes between them, like a
// ramp), over a single shallow arch.
function stoneBridge(ctx, [alat, alon], [blat, blon], era) {
  const a = ctx.atAny(alat, alon);
  const b = ctx.atAny(blat, blon);
  const mpp = ctx.metresPerPixel;
  const [ax, az] = ctx.metres(a.i, a.j);
  const [bx, bz] = ctx.metres(b.i, b.j);
  const L = Math.hypot(bx - ax, bz - az) + 2; // resting a metre onto each bank
  const [ui, uj] = [(b.i - a.i) / ((L - 2) / mpp), (b.j - a.j) / ((L - 2) / mpp)]; // a metre along, in pixels
  // The road's level just beyond each end.
  const hA = groundAt(ctx, a.i - ui * 1.5, a.j - uj * 1.5);
  const hB = groundAt(ctx, b.i + ui * 1.5, b.j + uj * 1.5);
  const deckAt = (x) => hA + (hB - hA) * Math.min(1, Math.max(0, (x + L / 2) / L)); // x along, from the middle
  const g = new THREE.Group();
  const f = new THREE.Group();
  f.rotation.y = -Math.atan2(bz - az, bx - ax);
  g.add(f);
  const body = archedWall(-L / 2, L / 2, -9, 0.3, 5, [{ cx: 0, w: L - 5, y0: -10, spring: -3.2, apex: -0.9 }]).translate(0, 0, 2.5);
  const parapets = [-2.3, 2.3].map((z) => metreUVs(new THREE.BoxGeometry(L, 0.9, 0.4, 8, 1, 1), 2).translate(0, 0.75, z));
  const geo = merge([body, ...parapets]);
  // Lean it from one bank's level to the other's.
  const p = geo.attributes.position;
  for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) + deckAt(p.getX(k)));
  geo.computeVertexNormals();
  f.add(new THREE.Mesh(geo, stone));
  const deck = deckOf(ctx, a, b, L, 2.1, 0, 0.2);
  const flat = deck.walk;
  deck.walk = (i, j) => {
    if (flat(i, j) == null) return null;
    const x = ((i - (a.i + b.i) / 2) * (bx - ax) + (j - (a.j + b.j) / 2) * (bz - az)) * mpp / (L - 2);
    return deckAt(x) + 0.3;
  };
  return [{ i: (a.i + b.i) / 2, j: (a.j + b.j) / 2, model: { group: g, top: 2 }, era, trueSize: true, baseAlt: 0, far: true, ...deck }];
}

// Walking on a bridge from window pixel a to b (L metres long, half-width w, its deck at h), and its parapets (or
// rails), which you can't walk through: { walk, solid }.
function deckOf(ctx, a, b, L, w, h, rail) {
  const mpp = ctx.metresPerPixel;
  const ci = (a.i + b.i) / 2;
  const cj = (a.j + b.j) / 2;
  const len = Math.hypot(b.i - a.i, b.j - a.j) * mpp || 1;
  const [ux, uz] = [((b.i - a.i) * mpp) / len, ((b.j - a.j) * mpp) / len];
  const walk = (i, j) => {
    const dx = (i - ci) * mpp;
    const dz = (j - cj) * mpp;
    return Math.abs(dx * ux + dz * uz) <= L / 2 && Math.abs(dz * ux - dx * uz) <= w ? h : null;
  };
  const px = (x, z) => [ci + x / mpp, cj + z / mpp];
  const lines = [-1, 1].map((s) => ({ pts: [px(-ux * L / 2 - uz * s * (w + rail), -uz * L / 2 + ux * s * (w + rail)), px(ux * L / 2 - uz * s * (w + rail), uz * L / 2 + ux * s * (w + rail))], half: rail + 0.05 }));
  return { walk, solid: { lines } };
}


// The bridges across the Frome in the user's drawing, each the shortest span across the water where two roads meet
// it, at the level of the banks: Frome Bridge, from the end of Christmas Street (out through the Frome Gate) to the
// foot of Christmas Steps; one further up, to Lewins Mead and Greyfriars; and one from the gate on Castle Street,
// north to Broadmead. (Bristol Bridge is separate.)
const FROME_BRIDGES = [
  [[51.456228, -2.596186], [51.456272, -2.59645]],
  [[51.45662, -2.596056], [51.4567, -2.596299]],
  [[51.456249, -2.589458], [51.456391, -2.58961]],
];
function fromeBridges(ctx) {
  return FROME_BRIDGES.flatMap(([a, b]) => stoneBridge(ctx, a, b, [...EARLY, 'georgian']));
}

// Greyfriars: the Franciscan friary (founded c.1234) north of the Frome by Lewins Mead. Its church, drawn as a long
// aisleless friary church with a small belfry; site and size approximate (nothing of it is mapped today).
const GREYFRIARS_CHURCH = [[51.45735, -2.59640], [51.45762, -2.59578], [51.45750, -2.59567], [51.45723, -2.59629]];

// The friary's precinct: a cloister on the church's north side (away from the river), a range of friars' buildings
// beyond it, and a precinct wall round them with its gate on the south, towards Lewins Mead and the Frome. Layout conjectural (the
// usual plan of a friary), sizes approximate.
const GREYFRIARS_CLOISTER = [[51.457401, -2.596282], [51.457545, -2.59595], [51.45773, -2.596156], [51.457586, -2.596488]];
const GREYFRIARS_RANGE = [[51.457586, -2.596488], [51.45773, -2.596156], [51.457797, -2.59623], [51.457653, -2.596562]];
const GREYFRIARS_PRECINCT = [[51.45720, -2.59680, null], [51.45790, -2.59680, null], [51.45800, -2.59600, null],
  [51.45770, -2.59540, null], [51.45720, -2.59580, null], [51.45716, -2.59610, 'Greyfriars gate', 31], [51.45712, -2.59640, null]];
MEDIEVAL_CLEAR.push(GREYFRIARS_PRECINCT.map(([lat, lon]) => [lat, lon]));

// Houses keep a few metres off the churches and the friary: their outlines grown by about 4 m, and the rectangles
// the kit churches are built in (churches.js), grown by 6 m (their churchyards).
for (const o of [...CHURCHES.map(([name]) => OUTLINES[name]), GREYFRIARS_CHURCH]) MEDIEVAL_CLEAR.push(outlineClear(o, 6));
for (const o of [...CHURCHES.map(([name]) => OUTLINES[name]), GREYFRIARS_CHURCH]) {
  const c = [o.reduce((a, p) => a + p[0], 0) / o.length, o.reduce((a, p) => a + p[1], 0) / o.length];
  MEDIEVAL_CLEAR.push(o.map(([lat, lon]) => {
    const dy = (lat - c[0]) * 111320;
    const dx = (lon - c[1]) * 69318;
    const d = Math.hypot(dx, dy) || 1;
    return [c[0] + ((dy * (d + 4)) / d) / 111320, c[1] + ((dx * (d + 4)) / d) / 69318];
  }));
}

// The ground shown in the current era where it's loaded (the old quays and banks lie below today's), else today's.
const groundAt = (ctx, i, j) => (i >= 0 && j >= 0 && i <= RES - 1 && j <= RES - 1 && ctx.map.ground ? ctx.map.sample(i, j, ctx.map.ground) : NaN) || ctx.terrainAny(i, j);

// Christmas Steps: the steep lane from the foot of Christmas Street up to the Chapel of the Three Kings, its
// stone steps laid in 1669 (before then a steep, partly stepped lane, drawn here with steps too). Treads 0.45 m deep
// following the hill, across the lane's width, each one walkable.
const STEPS_LINE = [[51.456088, -2.596655], [51.456167, -2.597325]]; // foot to top
function christmasSteps(ctx) {
  const [p, q] = STEPS_LINE.map(([lat, lon]) => ctx.at(lat, lon));
  if (!p || !q) return [];
  const [px, pz] = ctx.metres(p.i, p.j);
  const [qx, qz] = ctx.metres(q.i, q.j);
  const L = Math.hypot(qx - px, qz - pz);
  const [ux, uz] = [(qx - px) / L, (qz - pz) / L];
  const mpp = ctx.metresPerPixel;
  const W = 3.2; // the lane's width
  const going = 0.45;
  const n = Math.ceil(L / going);
  // Each tread's height: the ground under it, never lower than the one below (so the flight only climbs).
  const h0 = groundAt(ctx, p.i, p.j);
  const h1 = groundAt(ctx, q.i, q.j);
  const up = h1 >= h0 ? 1 : -1;
  const tops = [];
  for (let k = 0; k < n; k++) {
    const t = ((k + 0.5) * going) / L;
    const g = groundAt(ctx, p.i + (q.i - p.i) * t, p.j + (q.j - p.j) * t);
    const prev = tops.length ? tops[tops.length - 1] : h0;
    tops.push(up > 0 ? Math.max(prev, g) : Math.min(prev, g));
  }
  const parts = [];
  const rot = -Math.atan2(uz, ux);
  for (let k = 0; k < n; k++) {
    const x = (k + 0.5) * going;
    parts.push(metreUVs(new THREE.BoxGeometry(going + 0.02, 2, W), 1).rotateY(rot).translate(ux * x, tops[k] - 1, uz * x));
  }
  // Low walls either side, at the foot of the houses.
  for (const s of [-1, 1]) {
    for (let k = 0; k < n; k += 4) {
      const len = Math.min(4, n - k) * going;
      const x = k * going + len / 2;
      const top = tops[Math.min(n - 1, k + 3)] + 0.5;
      parts.push(metreUVs(new THREE.BoxGeometry(len + 0.02, 2.5, 0.3), 1).rotateY(rot).translate(ux * x - uz * s * (W / 2 + 0.15), top - 1.25, uz * x + ux * s * (W / 2 + 0.15)));
    }
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(merge(parts), paleStone));
  // Walkable: the tread under you, anywhere on the lane.
  const walk = (i, j) => {
    const dx = (i - p.i) * mpp;
    const dz = (j - p.j) * mpp;
    const along = dx * ux + dz * uz;
    if (along < 0 || along > n * going || Math.abs(dz * ux - dx * uz) > W / 2) return null;
    return tops[Math.min(n - 1, Math.floor(along / going))];
  };
  return [{ ...p, model: { group: g, top: 4 }, era: ['medieval', 'castle', 'georgian', 'then', 'blitz', 'now'], trueSize: true, baseAlt: 0, walk }];
}

// Greyfriars' cloister (an arcaded walk round a garth, lean-to roofs) and the friars' range beyond it.
function greyfriarsBuildings(ctx) {
  const ll = (o) => o.map(([lat, lon]) => ctx.at(lat, lon));
  const cl = ll(GREYFRIARS_CLOISTER);
  const rg = ll(GREYFRIARS_RANGE);
  if ([...cl, ...rg].some((w) => !w)) return [];
  const a = cl[0];
  const [ax, az] = ctx.metres(a.i, a.j);
  const loc = (w) => {
    const [x, z] = ctx.metres(w.i, w.j);
    return { x: x - ax, z: z - az, g: groundAt(ctx, w.i, w.j) };
  };
  const C = cl.map(loc);
  const R = rg.map(loc);
  const base = Math.min(...C.map((c) => c.g), ...R.map((r) => r.g));
  const walls = [];
  const roofs = [];
  // Between two corners: a wall face of length len, rotated to lie from u to v, centred, offset inward by `inset`.
  const along = (u, v, inset, mk) => {
    const len = Math.hypot(v.x - u.x, v.z - u.z);
    const rot = -Math.atan2(v.z - u.z, v.x - u.x);
    const [nx, nz] = [-(v.z - u.z) / len, (v.x - u.x) / len];
    const mx = (u.x + v.x) / 2 + nx * inset;
    const mz = (u.z + v.z) / 2 + nz * inset;
    return mk(len, rot, mx, mz);
  };
  // The cloister's sign of "inward" (towards its middle).
  const mid = { x: C.reduce((s, c) => s + c.x, 0) / 4, z: C.reduce((s, c) => s + c.z, 0) / 4 };
  const solid = { polys: [] };
  const toPx = (x, z) => [a.i + x / ctx.metresPerPixel, a.j + z / ctx.metresPerPixel];
  for (let k = 1; k < 4; k++) {
    // Three walks (the fourth side is the church): an arcade on the garth side, a lean-to roof over the walk.
    const u = C[k];
    const v = C[(k + 1) % 4];
    const len = Math.hypot(v.x - u.x, v.z - u.z);
    let [nx, nz] = [-(v.z - u.z) / len, (v.x - u.x) / len];
    if (nx * (mid.x - u.x) + nz * (mid.z - u.z) < 0) [nx, nz] = [-nx, -nz];
    const rot = -Math.atan2(v.z - u.z, v.x - u.x);
    const bays = Math.max(3, Math.round(len / 3));
    const arches = Array.from({ length: bays }, (_, b) => ({ cx: -len / 2 + (len * (b + 0.5)) / bays, w: (len / bays) * 0.62, y0: 0.6, spring: 2.2, apex: 3.0 }));
    const arcade = archedWall(-len / 2, len / 2, -6, 3.6, 0.6, arches).translate(0, 0, 0.3);
    arcade.rotateY(rot).translate((u.x + v.x) / 2 + nx * 3.2, base, (u.z + v.z) / 2 + nz * 3.2);
    walls.push(arcade);
    const back = metreUVs(new THREE.BoxGeometry(len, 10, 0.6), 1).rotateY(rot).translate((u.x + v.x) / 2, base - 1, (u.z + v.z) / 2);
    walls.push(back);
    const roof = metreUVs(new THREE.BoxGeometry(len, 0.2, 4.2), 1).rotateY(rot);
    const tilt = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3((v.x - u.x) / len, 0, (v.z - u.z) / len), -0.38 * Math.sign(nx * (v.z - u.z) / len - nz * (v.x - u.x) / len || 1));
    roof.applyMatrix4(tilt).translate((u.x + v.x) / 2 + nx * 1.7, base + 4.4, (u.z + v.z) / 2 + nz * 1.7);
    roofs.push(roof);
    // You can't walk through the outer wall, nor the arcade's piers (only through the arches), so block the outer.
    solid.polys.push([toPx(u.x - nx * 0.3, u.z - nz * 0.3), toPx(v.x - nx * 0.3, v.z - nz * 0.3), toPx(v.x + nx * 0.3, v.z + nz * 0.3), toPx(u.x + nx * 0.3, u.z + nz * 0.3)]);
  }
  // The friars' range: two halls of the kit's (stone below, timber above), back to back along it.
  const [r0, r1, r2, r3] = R;
  const rl = Math.hypot(r1.x - r0.x, r1.z - r0.z);
  const dir = [(r1.x - r0.x) / rl, (r1.z - r0.z) / rl];
  const hiR = Math.max(...R.map((r) => r.g));
  const halls = [];
  for (const [p, q, sd] of [[r0, r3, -1], [r1, r2, 1]]) {
    const plan = housePlan({ w: 4, d: Math.min(7, Math.floor(rl / 4)), kind: 'hall', seed: sd > 0 ? 0.71 : 0.29 });
    halls.push({ plan, matrix: new THREE.Matrix4().makeRotationY(Math.atan2(sd * dir[0], sd * dir[1])).setPosition((p.x + q.x) / 2, hiR + 0.05, (p.z + q.z) / 2) });
  }
  const g0 = new THREE.Group();
  walls.push(metreUVs(new THREE.BoxGeometry(rl, hiR - base + 3, Math.hypot(r2.x - r1.x, r2.z - r1.z)), 1).rotateY(-Math.atan2(dir[1], dir[0])).translate((r0.x + r2.x) / 2, (hiR + base - 3) / 2, (r0.z + r2.z) / 2));
  solid.polys.push(R.map((r) => toPx(r.x, r.z)));
  const g = new THREE.Group();
  const wallMesh = new THREE.Mesh(merge(walls), paleStone);
  const roofMesh = new THREE.Mesh(merge(roofs), tile);
  g.add(wallMesh, roofMesh, g0);
  // The cloister in the kit's stone and tiles too, once they're loaded with the halls.
  buildHouses(halls).then((h) => {
    g0.add(h);
    wallMesh.material = kitMaterial('MI_UnevenBrick') ?? paleStone;
    roofMesh.material = kitMaterial('MI_RoundTiles') ?? tile;
  });
  return [{ ...a, model: { group: g, top: 12 }, era: EARLY, trueSize: true, baseAlt: 0, solid }];
}

// A plague burial ground north of the Frome, by Broadmead (illustrative): a low stone wall with a gateway, long
// trench graves and single mounds with wooden crosses, a stone cross in the middle, a few yews.
export const PLAGUE_GROUND = [[51.45672, -2.59095], [51.45700, -2.59020], [51.45670, -2.58995], [51.45642, -2.59070]];
// (Houses keep 4 m clear of its wall.)
{
  const [cl, co] = [PLAGUE_GROUND.reduce((s, p) => s + p[0], 0) / 4, PLAGUE_GROUND.reduce((s, p) => s + p[1], 0) / 4];
  MEDIEVAL_CLEAR.push(PLAGUE_GROUND.map(([lat, lon]) => {
    const dy = (lat - cl) * 111320;
    const dx = (lon - co) * 69318;
    const d = Math.hypot(dx, dy) || 1;
    return [cl + ((dy * (d + 4)) / d) / 111320, co + ((dx * (d + 4)) / d) / 69318];
  }));
}
const earth = new THREE.MeshStandardMaterial({ color: 0x4a3b2a, roughness: 1 });
const turf = new THREE.MeshStandardMaterial({ color: 0x55603a, roughness: 1, side: THREE.DoubleSide });
const yew = new THREE.MeshStandardMaterial({ color: 0x1f3320, roughness: 1 });
function plagueGround(ctx) {
  const pts = PLAGUE_GROUND.map(([lat, lon]) => ctx.at(lat, lon));
  if (pts.some((w) => !w)) return [];
  const a = { i: pts.reduce((s, p) => s + p.i, 0) / 4, j: pts.reduce((s, p) => s + p.j, 0) / 4 };
  const [ax, az] = ctx.metres(a.i, a.j);
  const C = pts.map((w) => {
    const [x, z] = ctx.metres(w.i, w.j);
    return [x - ax, z - az];
  });
  const mpp = ctx.metresPerPixel;
  const gAt = (x, z) => groundAt(ctx, a.i + x / mpp, a.j + z / mpp);
  // Its own frame: u along the first side, v across.
  const [ux, uz] = [C[1][0] - C[0][0], C[1][1] - C[0][1]];
  const uLen = Math.hypot(ux, uz);
  const [vx, vz] = [C[3][0] - C[0][0], C[3][1] - C[0][1]];
  const vLen = Math.hypot(vx, vz);
  const at = (s, t) => [C[0][0] + (ux * s) + (vx * t), C[0][1] + (uz * s) + (vz * t)]; // s, t in 0..1
  const rot = -Math.atan2(uz, ux);
  const rand = (() => {
    let x = 1348;
    return () => ((x = (x * 16807) % 2147483647) / 2147483647);
  })();
  const mounds = [];
  const wood = [];
  const stoneG = [];
  const trees = [];
  // Four plague trenches along the far side, each a long low mound.
  for (let k = 0; k < 4; k++) {
    const [x, z] = at(0.5, 0.72 - k * 0.1);
    const g = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(uLen * 0.27, 0.35, 1.0).rotateY(rot);
    mounds.push(g.translate(x, gAt(x, z) - 0.1, z));
    const [cx, cz] = at(0.5 - 0.3, 0.72 - k * 0.1);
    wood.push(new THREE.BoxGeometry(0.1, 1.3, 0.1).translate(cx, gAt(cx, cz) + 0.6, cz), new THREE.BoxGeometry(0.6, 0.09, 0.09).rotateY(rot).translate(cx, gAt(cx, cz) + 1.0, cz));
  }
  // Single graves in rows, each with a little wooden cross at its head (some leaning).
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 9; k++) {
      if (rand() < 0.25) continue;
      const s = 0.1 + k * 0.1 + (rand() - 0.5) * 0.02;
      const t = 0.12 + r * 0.075;
      if (Math.abs(s - 0.5) < 0.08 && t > 0.2) continue; // the path to the cross
      const [x, z] = at(s, t);
      const g0 = gAt(x, z);
      mounds.push(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.45, 0.28, 1.05).rotateY(rot + Math.PI / 2).translate(x, g0 - 0.05, z));
      const [hx, hz] = [x - (vx / vLen) * 1.1, z - (vz / vLen) * 1.1];
      const lean = (rand() - 0.5) * 0.4;
      wood.push(new THREE.BoxGeometry(0.07, 0.95, 0.07).rotateX(lean).rotateY(rot).translate(hx, g0 + 0.42, hz));
      wood.push(new THREE.BoxGeometry(0.42, 0.06, 0.06).rotateX(lean).rotateY(rot).translate(hx, g0 + 0.66, hz));
    }
  }
  // A stone cross on steps in the middle.
  {
    const [x, z] = at(0.5, 0.45);
    const g0 = gAt(x, z);
    stoneG.push(new THREE.BoxGeometry(2.2, 0.35, 2.2).rotateY(rot).translate(x, g0 + 0.1, z), new THREE.BoxGeometry(1.4, 0.35, 1.4).rotateY(rot).translate(x, g0 + 0.45, z));
    stoneG.push(new THREE.BoxGeometry(0.32, 3.4, 0.32).rotateY(rot).translate(x, g0 + 2.3, z), new THREE.BoxGeometry(1.1, 0.26, 0.26).rotateY(rot).translate(x, g0 + 3.4, z));
  }
  // Yews by the wall.
  for (const [s, t] of [[0.08, 0.85], [0.92, 0.85], [0.92, 0.15]]) {
    const [x, z] = at(s, t);
    const g0 = gAt(x, z);
    trees.push(new THREE.ConeGeometry(2.2, 6.5, 8).translate(x, g0 + 4.2, z), new THREE.SphereGeometry(2.3, 8, 6).scale(1, 0.8, 1).translate(x, g0 + 2.4, z));
    wood.push(new THREE.CylinderGeometry(0.3, 0.4, 1.4, 6).translate(x, g0 + 0.7, z));
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(merge(mounds), earth), new THREE.Mesh(merge(wood), oak), new THREE.Mesh(merge(stoneG.map((q) => metreUVs(q, 1))), stone), new THREE.Mesh(merge(trees), yew));
  const turfG = new THREE.ShapeGeometry(new THREE.Shape(C.map(([x, z]) => new THREE.Vector2(x, -z)))).rotateX(-Math.PI / 2);
  const pos = turfG.attributes.position;
  for (let k = 0; k < pos.count; k++) pos.setY(k, gAt(pos.getX(k), pos.getZ(k)) + 0.04);
  g.add(new THREE.Mesh(turfG, turf));
  const items = [{ ...a, model: { group: g, top: 8 }, era: EARLY, trueSize: true, baseAlt: 0 }];
  // The wall, with a gateway in the middle of the side facing the lane to the Frome bridge.
  const ll = PLAGUE_GROUND;
  const gap = 0.12;
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const line = [[...lerp(ll[1], ll[2], 0.5 + gap), null], [...ll[2], null], [...ll[3], null], [...ll[0], null], [...ll[1], null], [...lerp(ll[1], ll[2], 0.5 - gap), null]];
  items.push(...wallRun(ctx, line, false, { height: 1.6, towers: 'none', merlonned: false, era: EARLY }));
  return items;
}

// (A generator of parts: Features builds them a frame apart, so a reload doesn't stall the headset.)
export function* medievalLandmarks(ctx) {
  yield [...bristolBridge(ctx), ...highCross(ctx), ...fromeBridges(ctx), ...christmasSteps(ctx)];
  yield townLife(ctx, { eras: EARLY, dayUniforms });
  yield kitHouses(ctx, { eras: EARLY });
  yield [...houseFittings(ctx, { eras: EARLY }), ...footbridges(ctx, { eras: EARLY }), ...townTrees(ctx, { eras: EARLY })];
  // Townsfolk: about the gates and the churchyards too.
  const gates = [...TOWN_WALL, ...CASTLE_STREET_WALL, ...INNER_WALL, ...PORT_WALL].filter((p) => p[2] && p[2] !== 'postern').map(([lat, lon]) => [lat, lon]);
  const churchyards = [...CHURCHES.map(([name]) => centre(OUTLINES[name])), centre(GREYFRIARS_CHURCH)];
  // (and the crowds at the outskirts: round the bear pit's rail, and dealers along the horse fair)
  const crowds = [[...BEAR_PIT, 12, PIT_R + 3, 'bearpit'], ...HORSE_FAIR.map(([lat, lon]) => [lat, lon, 3, 10, 'horsefair'])];
  yield [...townsfolk(ctx, { eras: EARLY, gates, churches: churchyards, crowds }), ...outskirts(ctx, { eras: EARLY }), ...ambience(ctx, { eras: EARLY, churches: churchyards })];
  yield [...plagueGround(ctx), ...greyfriarsBuildings(ctx), ...wallRun(ctx, GREYFRIARS_PRECINCT, true, { height: 3.5, towers: 'none', merlonned: false, era: EARLY })];
  // The churches, built from the kit (churches.js); the great ones (towers over 32 m) have three-stage naves.
  const ground = (i, j) => groundAt(ctx, i, j);
  const gf = kitChurch(ctx, GREYFRIARS_CHURCH, { towerH: 16, era: EARLY, ground });
  if (gf) yield [gf];
  for (const [name, towerH, eras] of CHURCHES) {
    const it = kitChurch(ctx, OUTLINES[name], { towerH, era: eras, ground, stages: towerH > 32 ? 3 : 2 });
    if (it) yield [it];
  }
}

// What the corner map names in each period: outlines (poly), lines and points, drawn and labelled in black.
const pts = (list) => list.map(([lat, lon]) => [lat, lon]);
const centre = (o) => [o.reduce((s, p) => s + p[0], 0) / o.length, o.reduce((s, p) => s + p[1], 0) / o.length];
const CHRISTMAS_STEPS = [[51.456088, -2.596655], [51.456167, -2.597325], [51.45646, -2.597766], [51.45672, -2.597975]];
export function mapFeatures(era) {
  const early = EARLY.includes(era);
  const tidal = early || era === 'georgian';
  const out = [];
  const bridgeO = OUTLINES['Bristol Bridge'];
  out.push({ name: 'Bristol Bridge', line: [[(bridgeO[0][0] + bridgeO[3][0]) / 2, (bridgeO[0][1] + bridgeO[3][1]) / 2], [(bridgeO[1][0] + bridgeO[2][0]) / 2, (bridgeO[1][1] + bridgeO[2][1]) / 2]] });
  out.push({ name: "St John's Gate", at: [51.455871, -2.59513] });
  out.push({ name: early ? 'Christmas Steps (lane; steps 1669)' : 'Christmas Steps', line: CHRISTMAS_STEPS });
  if (early) {
    out.push({ name: 'Town wall', line: pts(TOWN_WALL) });
    out.push({ name: 'Castle Street wall', line: pts(CASTLE_STREET_WALL) });
    out.push({ name: 'Inner wall', line: pts(INNER_WALL) });
    out.push({ name: 'Marsh wall', line: pts(MARSH_WALL) });
    out.push({ name: 'Port Wall', line: pts(PORT_WALL) });
    out.push({ name: 'Castle', poly: pts(CASTLE_WARD) });
    out.push({ name: 'Castle moat', line: EAST_MOAT });
    out.push({ name: 'The Marsh', poly: MARSH_POOL });
    for (const [lat, lon, gate] of [...TOWN_WALL, ...CASTLE_STREET_WALL, ...INNER_WALL, ...PORT_WALL]) if (gate && gate !== 'postern' && !gate.startsWith('St John')) out.push({ name: gate, at: [lat, lon] });
    out.push({ name: 'Keep (approx.)', at: KEEP });
    out.push({ name: 'High Cross', at: [51.454893, -2.592665] });
    out.push({ name: 'Greyfriars (site approx.)', poly: GREYFRIARS_CHURCH });
    out.push({ name: 'Frome Bridge', at: [51.45625, -2.596318] });
    out.push({ name: 'Blackfriars', at: [51.457217, -2.587427] });
    out.push({ name: "St Bartholomew's Hospital", at: [51.45640, -2.59690] });
    out.push({ name: 'Plague burial ground (illustrative)', poly: PLAGUE_GROUND });
    out.push({ name: 'Stag & Hounds (guildhall)', at: [51.45556, -2.58292] });
    out.push({ name: 'Guildhall', at: [51.45558, -2.59459] });
    out.push({ name: 'Old Market', at: [51.45615, -2.58150] });
    out.push({ name: 'Horse fair', at: HORSE_FAIR[1] });
    out.push({ name: 'Bear pit (illustrative)', at: BEAR_PIT });
    out.push({ name: 'Llandoger Trow', at: [51.45190, -2.59313] });
    out.push({ name: 'Hatchet Inn', at: [51.45396, -2.60042] });
  }
  if (tidal) out.push({ name: 'River Frome', line: pts(FROME) });
  for (const [name, , eras] of CHURCHES) {
    if (eras.includes(era) || (!early && ['St Mary Redcliffe', 'Temple Church'].includes(name))) out.push({ name, at: centre(OUTLINES[name]) });
  }
  if (!early) out.push({ name: 'The Exchange', at: [51.4544048, -2.5934897] });
  if (era === 'now') out.push({ name: 'Castle Park (castle site)', at: [51.4559, -2.5883] });
  return out;
}
