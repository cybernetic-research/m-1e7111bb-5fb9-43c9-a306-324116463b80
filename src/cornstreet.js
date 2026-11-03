import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stoneTexture, timberTexture, textured, metreUVs, roundUVs } from './textures.js';
import { arch, wall } from './stjohn.js';

// Corn Street, where the old city traded: the Exchange and St Nicholas Market behind it, the Nails on the pavement,
// the Commercial Rooms opposite, and Christ Church's spire at the crossroads.
// - The Exchange (John Wood the Elder, 1741–43):
//   - a Palladian front of nine bays on a rusticated ground floor, four Corinthian columns and a pediment over the
//     middle three;
//   - its clock has two minute hands, one for London time and one for Bristol's, ten minutes behind;
//   - the courtyard behind was roofed over and is now the hall of St Nicholas Market, which runs on into the Glass
//     Arcade.
// - The Nails: four bronze pillars where merchants paid cash ("on the nail").
// - The Commercial Rooms (C. A. Busby, 1810–11): an Ionic portico with three statues on the parapet.
// - Christ Church (William Paty, 1786–91): a tower and spire at the meeting of Corn, Broad, Wine and High Streets.
// Sources: OpenStreetMap (outlines and the Nails' positions), Wikipedia, LIDAR (heights).
// Simplified or approximate: the carving, the stall layout in the market, the statues, and the storey heights.

const BEARING = 56.5; // Corn Street, from the Commercial Rooms towards Christ Church
export const EXCHANGE_FOOTPRINT = [[51.4541547, -2.59351], [51.4544893, -2.5938668], [51.4546541, -2.5934695],
  [51.4543196, -2.5931121]];
export const ARCADE_FOOTPRINT = [[51.4541547, -2.59351], [51.4543196, -2.5931121], [51.4544584, -2.5926874],
  [51.4543942, -2.5926208], [51.4540665, -2.5934173]];
const EXCHANGE = { lat: 51.4545719, lon: -2.5936678, ground: 16.8 }; // the middle of the Corn Street front
const NAILS = [[51.4545509, -2.5938544], [51.4545949, -2.5937384], [51.4546361, -2.5936297], [51.4546755, -2.5935258]];
const COMMERCIAL_ROOMS = { lat: 51.4544439, lon: -2.5944001, ground: 14.9 }; // the middle of its front
const CHRIST_CHURCH = { lat: 51.4550938, lon: -2.5930767, ground: 16.9 }; // the spire (the LIDAR's highest point)
export const CHRIST_CHURCH_FOOTPRINT = [[51.4553152, -2.5928955], [51.4552948, -2.5928006], [51.4551819, -2.5927049],
  [51.455049, -2.592927], [51.4550744, -2.592966], [51.4550205, -2.5930564], [51.4550829, -2.5931436],
  [51.4551341, -2.5930577], [51.4551487, -2.5930802], [51.4551595, -2.5930621], [51.4551711, -2.5930799],
  [51.4551861, -2.5930624], [51.4552181, -2.5931117], [51.4552448, -2.5930669], [51.4552281, -2.5930413]];

const bathStone = textured(stoneTexture(0xcdb98e, 41), { tile: 1.6 });
const paleStone = textured(stoneTexture(0xddd0b0, 42), { tile: 1.0 });
const oak = textured(timberTexture(0x5b3f28), { tile: 1.5 });
const shadow = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 1 });
const windowGlass = new THREE.MeshStandardMaterial({ color: 0x3a4650, roughness: 0.25, metalness: 0.3 });
const iron = new THREE.MeshStandardMaterial({ color: 0x2f3a33, roughness: 0.6, metalness: 0.4 });
const roofGlass = new THREE.MeshStandardMaterial({
  color: 0xdfe8ec, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
});
const bronze = new THREE.MeshStandardMaterial({ color: 0x5e4a2c, roughness: 0.45, metalness: 0.8 });
const gilt = new THREE.MeshStandardMaterial({ color: 0xd9a93a, roughness: 0.35, metalness: 0.7 });
const flags = textured(stoneTexture(0xa9a398, 43), { tile: 1.4 });

// A model frame lined up with Corn Street: +x along the street (towards Christ Church), +z to its right.
function frame(bearing = BEARING) {
  const f = new THREE.Group();
  f.rotation.y = THREE.MathUtils.degToRad(90 - bearing);
  return f;
}

const merge = (list) => mergeGeometries(list.map((m) => (m.index ? m.toNonIndexed() : m)));

// A column: base, shaft, and a capital (Corinthian: a flared bell; Ionic: a cushion with volutes).
function column(r, h, kind = 'corinthian') {
  const parts = [];
  parts.push(metreUVs(new THREE.BoxGeometry(r * 2.6, 0.35, r * 2.6), 1).translate(0, 0.17, 0));
  parts.push(new THREE.CylinderGeometry(r * 1.2, r * 1.3, 0.25, 16).translate(0, 0.47, 0));
  parts.push(roundUVs(new THREE.CylinderGeometry(r * 0.88, r, h - 1.4, 16), r, h - 1.4, 1).translate(0, 0.6 + (h - 1.4) / 2, 0));
  if (kind === 'corinthian') {
    parts.push(new THREE.CylinderGeometry(r * 1.45, r * 0.9, 0.7, 16).translate(0, h - 0.6, 0));
  } else {
    parts.push(new THREE.BoxGeometry(r * 2.4, 0.3, r * 1.4).translate(0, h - 0.65, 0));
    for (const s of [-1, 1]) parts.push(new THREE.CylinderGeometry(0.17, 0.17, r * 1.4, 10).rotateX(Math.PI / 2).translate(s * r * 1.1, h - 0.65, 0));
  }
  parts.push(metreUVs(new THREE.BoxGeometry(r * 2.8, 0.25, r * 2.8), 1).translate(0, h - 0.12, 0));
  return merge(parts);
}

// A pediment: a low triangle, w wide and h high, d deep (from z = 0 towards +z), sitting on y = 0.
function pediment(w, h, d) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  return metreUVs(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }), 1);
}

// A balustrade from x0 to x1 on a face at z, standing on y.
function balustrade(x0, x1, y, z) {
  const parts = [
    metreUVs(new THREE.BoxGeometry(x1 - x0, 0.18, 0.5), 1).translate((x0 + x1) / 2, y + 0.09, z),
    metreUVs(new THREE.BoxGeometry(x1 - x0, 0.16, 0.55), 1).translate((x0 + x1) / 2, y + 0.92, z),
  ];
  for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.36) parts.push(new THREE.CylinderGeometry(0.07, 0.11, 0.66, 8).translate(x, y + 0.51, z));
  return merge(parts);
}

// A clock dial with an hour hand and two minute hands, London's and (ten minutes behind) Bristol's.
function exchangeClock(r) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f1ead8';
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#222';
  g.lineWidth = 5;
  g.stroke();
  g.fillStyle = '#222';
  g.font = 'bold 28px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((n, k) => {
    const a = (k / 12) * Math.PI * 2;
    g.fillText(n, 128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96);
  });
  g.lineCap = 'round';
  // 2:40 in London; 2:30 in Bristol.
  for (const [a, len, w, col] of [[Math.PI * 2 * (2.6 / 12), 50, 9, '#222'], [Math.PI * 2 * (40 / 60), 84, 5, '#222'], [Math.PI * 2 * (30 / 60), 84, 5, '#a3241e']]) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
}

// A market stall: a timber counter and back, a striped awning, and its goods in a few bright colours.
const awnings = [0x2f6b4f, 0x8e2a2a, 0x2e4a7a, 0x7a5a1e];
function stalls(list) {
  const counters = [];
  const cloth = awnings.map(() => []);
  const goods = [];
  const stripes = [];
  list.forEach(({ x, z, face }, k) => {
    // Each stall is 2.4 m wide along x, its counter towards the aisle (face = +1 or -1 in z).
    counters.push(metreUVs(new THREE.BoxGeometry(2.3, 0.95, 0.7), 1).translate(x, 0.47, z + face * 0.6));
    counters.push(metreUVs(new THREE.BoxGeometry(2.3, 2.4, 0.08), 1).translate(x, 1.2, z - face * 0.9));
    for (const s of [-1, 1]) counters.push(new THREE.BoxGeometry(0.08, 2.4, 0.08).translate(x + s * 1.12, 1.2, z + face * 0.9));
    const awning = new THREE.BoxGeometry(2.4, 0.06, 2.0).rotateX(face * 0.25).translate(x, 2.55, z);
    cloth[k % awnings.length].push(awning);
    for (let s = -1; s <= 1; s += 0.5) stripes.push(new THREE.BoxGeometry(0.22, 0.07, 2.02).rotateX(face * 0.25).translate(x + s * 1.0, 2.56, z));
    for (let n = 0; n < 6; n++) {
      const gx = x - 0.9 + n * 0.36;
      goods.push({ geo: new THREE.BoxGeometry(0.28, 0.12 + ((n * 7 + k * 3) % 5) * 0.05, 0.4).translate(gx, 1.0, z + face * 0.6), hue: (n * 0.17 + k * 0.29) % 1 });
    }
  });
  const g = new THREE.Group();
  if (counters.length) g.add(new THREE.Mesh(merge(counters), oak));
  cloth.forEach((list2, k) => list2.length && g.add(new THREE.Mesh(merge(list2), new THREE.MeshStandardMaterial({ color: awnings[k], roughness: 0.9 }))));
  if (stripes.length) g.add(new THREE.Mesh(merge(stripes), new THREE.MeshStandardMaterial({ color: 0xf1ecdf, roughness: 0.9 })));
  if (goods.length) {
    const geos = goods.map(({ geo, hue }) => {
      const col = new THREE.Color().setHSL(hue, 0.55, 0.5);
      const n = geo.attributes.position.count;
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => [col.r, col.g, col.b][i % 3]), 3));
      return geo;
    });
    g.add(new THREE.Mesh(merge(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })));
  }
  return g;
}

// The Exchange. x along Corn Street, z back from the front (the front face is z = 0, facing the street at -z).
const EX = { half: 16.6, front: 12, hall: 36, back: 44.7, height: 15 };
function exchange() {
  const g = frame();
  const { half, height } = EX;
  // The front and back ranges, solid but for the central passage through each; the hall's side walls between.
  const door = { cx: 0, w: 3.2, y0: -1.5, spring: 3.0, apex: 4.6 };
  g.add(new THREE.Mesh(merge([
    wall(-half, half, -2.5, height, EX.front, [door]).translate(0, 0, EX.front),
    wall(-half, half, -2.5, height - 1, EX.back - EX.hall, [door]).translate(0, 0, EX.back),
    metreUVs(new THREE.BoxGeometry(0.9, height + 2.5, EX.hall - EX.front), 1.6).translate(-half + 0.45, (height - 2.5) / 2, (EX.front + EX.hall) / 2),
    metreUVs(new THREE.BoxGeometry(0.9, height + 2.5, EX.hall - EX.front), 1.6).translate(half - 0.45, (height - 2.5) / 2, (EX.front + EX.hall) / 2),
  ]), bathStone));
  // The front: rusticated ground floor (deep joints), a string course, arched ground-floor windows, the tall windows
  // of the main floor with alternate triangular and flat hoods, small top-floor windows.
  const bays = Array.from({ length: 9 }, (_, k) => -14.8 + k * 3.7);
  const dark = [];
  const glass = [];
  const dress = [];
  for (let y = 0.5; y < 4.6; y += 0.55) {
    for (const [x0, x1] of [[-half, -door.w / 2 - 0.4], [door.w / 2 + 0.4, half]]) dark.push(new THREE.BoxGeometry(x1 - x0, 0.05, 0.04).translate((x0 + x1) / 2, y, -0.02));
  }
  dress.push(metreUVs(new THREE.BoxGeometry(half * 2 + 0.3, 0.35, 0.4), 1).translate(0, 4.7, -0.15));
  bays.forEach((x, k) => {
    if (k !== 4) glass.push(new THREE.ShapeGeometry(arch(new THREE.Shape(), x, 1.3, 1.0, 3.0, 3.7), 6).rotateY(Math.PI).translate(0, 0, -0.03));
    glass.push(new THREE.PlaneGeometry(1.3, 2.6).rotateY(Math.PI).translate(x, 7.1, -0.03));
    glass.push(new THREE.PlaneGeometry(1.2, 1.4).rotateY(Math.PI).translate(x, 11.0, -0.03));
    dress.push(metreUVs(new THREE.BoxGeometry(1.7, 0.25, 0.3), 1).translate(x, 5.65, -0.15)); // sill
    if (k % 2 === 0 && k !== 4) dress.push(pediment(1.9, 0.6, 0.3).rotateY(Math.PI).translate(x, 8.55, 0));
    else dress.push(metreUVs(new THREE.BoxGeometry(1.8, 0.22, 0.3), 1).translate(x, 8.65, -0.15));
  });
  // The door: a pedimented doorcase.
  dress.push(metreUVs(new THREE.BoxGeometry(0.5, 4.6, 0.35), 1).translate(-door.w / 2 - 0.25, 2.3, -0.17));
  dress.push(metreUVs(new THREE.BoxGeometry(0.5, 4.6, 0.35), 1).translate(door.w / 2 + 0.25, 2.3, -0.17));
  // Columns, entablature, the pediment, the cornice and the balustrade either side.
  const cols = [-5.55, -1.85, 1.85, 5.55].map((x) => column(0.45, 8.0).translate(x, 4.9, -0.45));
  dress.push(...cols);
  dress.push(metreUVs(new THREE.BoxGeometry(15.4, 1.1, 1.0), 1).translate(0, 13.45, -0.5));
  dress.push(metreUVs(new THREE.BoxGeometry(half * 2 + 0.6, 0.45, 0.7), 1).translate(0, 14.2, -0.3));
  dress.push(pediment(16.2, 3.2, 1.1).rotateY(Math.PI).translate(0, 14.4, 0.05));
  dress.push(balustrade(-half, -8.1, 14.4, -0.2), balustrade(8.1, half, 14.4, -0.2));
  g.add(new THREE.Mesh(merge(dress), paleStone));
  g.add(new THREE.Mesh(merge(glass), windowGlass));
  g.add(new THREE.Mesh(merge(dark), shadow));
  const clock = exchangeClock(0.85);
  clock.rotation.y = Math.PI;
  clock.position.set(0, 15.5, -1.1);
  g.add(clock);
  // The hall: flagged floor, a colonnade round it carrying a cornice, and a glazed roof on iron ribs.
  const inner = half - 0.9;
  const hall = [];
  hall.push(metreUVs(new THREE.BoxGeometry(inner * 2, 0.3, EX.hall - EX.front), 1.4).translate(0, 0.0, (EX.front + EX.hall) / 2));
  g.add(new THREE.Mesh(merge(hall), flags));
  const colonnade = [];
  for (let z = EX.front + 2; z <= EX.hall - 2; z += 3) for (const s of [-1, 1]) colonnade.push(column(0.3, 6.5).translate(s * (inner - 2.5), 0, z));
  for (let x = -inner + 5.5; x <= inner - 5.5; x += 3) for (const z of [EX.front + 2, EX.hall - 2]) colonnade.push(column(0.3, 6.5).translate(x, 0, z));
  colonnade.push(metreUVs(new THREE.BoxGeometry(0.8, 0.8, EX.hall - EX.front - 3), 1).translate(-(inner - 2.5), 6.9, (EX.front + EX.hall) / 2));
  colonnade.push(metreUVs(new THREE.BoxGeometry(0.8, 0.8, EX.hall - EX.front - 3), 1).translate(inner - 2.5, 6.9, (EX.front + EX.hall) / 2));
  colonnade.push(metreUVs(new THREE.BoxGeometry((inner - 2.5) * 2, 0.8, 0.8), 1).translate(0, 6.9, EX.front + 2));
  colonnade.push(metreUVs(new THREE.BoxGeometry((inner - 2.5) * 2, 0.8, 0.8), 1).translate(0, 6.9, EX.hall - 2));
  g.add(new THREE.Mesh(merge(colonnade), paleStone));
  const span = EX.hall - EX.front;
  const pitch = Math.atan2(3, inner);
  const slope = Math.hypot(inner, 3);
  const panes = [];
  const ribs = [];
  for (const s of [-1, 1]) {
    panes.push(new THREE.PlaneGeometry(slope, span).rotateX(-Math.PI / 2).rotateZ(-s * pitch).translate(s * inner / 2, height - 1.5, (EX.front + EX.hall) / 2));
    for (let z = EX.front; z <= EX.hall + 0.01; z += 2) ribs.push(new THREE.BoxGeometry(slope, 0.15, 0.1).rotateZ(-s * pitch).translate(s * inner / 2, height - 1.55, z));
  }
  ribs.push(new THREE.BoxGeometry(0.2, 0.2, span).translate(0, height, (EX.front + EX.hall) / 2));
  g.add(new THREE.Mesh(merge(panes), roofGlass), new THREE.Mesh(merge(ribs), iron));
  // Stalls in two rows down the hall, either side of a central aisle, and along the colonnades.
  const list = [];
  for (let z = EX.front + 4; z <= EX.hall - 4; z += 2.6) {
    list.push({ x: -2.8, z, face: 0 }, { x: 2.8, z, face: 0 });
  }
  const hallStalls = stalls(list.map((s) => ({ x: s.z - (EX.front + EX.hall) / 2, z: s.x, face: Math.sign(-s.x) })));
  hallStalls.rotation.y = -Math.PI / 2;
  hallStalls.position.set(0, 0, (EX.front + EX.hall) / 2);
  g.add(hallStalls);
  return g;
}

// The Glass Arcade behind the Exchange: an iron-and-glass roof over a lane of stalls (in the Exchange's frame, its
// lane running along x behind the back range).
function glassArcade(g) {
  const z0 = EX.back;
  const z1 = 56.4;
  const x0 = -EX.half;
  const x1 = 49.5;
  const y = -0.6; // the lane is a little below the hall
  const mid = (z0 + z1) / 2;
  const w = z1 - z0;
  const panes = [];
  const ribs = [];
  const posts = [];
  const pitch = Math.atan2(2, w / 2);
  const slope = Math.hypot(w / 2, 2);
  for (const s of [-1, 1]) {
    panes.push(new THREE.PlaneGeometry(x1 - x0, slope).rotateX(-Math.PI / 2 + s * pitch).translate((x0 + x1) / 2, y + 8, mid + (s * w) / 4));
  }
  for (let x = x0; x <= x1 + 0.01; x += 3) {
    for (const s of [-1, 1]) ribs.push(new THREE.BoxGeometry(0.1, 0.15, slope).rotateX(s * pitch).translate(x, y + 7.95, mid + (s * w) / 4));
    for (const z of [z0 + 0.3, z1 - 0.3]) posts.push(new THREE.CylinderGeometry(0.1, 0.12, 7, 8).translate(x, y + 3.5, z));
  }
  ribs.push(new THREE.BoxGeometry(x1 - x0, 0.2, 0.2).translate((x0 + x1) / 2, y + 9, mid));
  for (const z of [z0 + 0.3, z1 - 0.3]) ribs.push(new THREE.BoxGeometry(x1 - x0, 0.3, 0.2).translate((x0 + x1) / 2, y + 7, z));
  // Hanging lamps down the lane.
  const lamps = [];
  for (let x = x0 + 4; x < x1; x += 6) lamps.push(new THREE.SphereGeometry(0.22, 10, 8).translate(x, y + 5.2, mid), new THREE.CylinderGeometry(0.01, 0.01, 2.6, 4).translate(x, y + 6.6, mid));
  g.add(new THREE.Mesh(merge(panes), roofGlass), new THREE.Mesh(merge([...ribs, ...posts]), iron));
  g.add(new THREE.Mesh(merge(lamps), new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffd98a, emissiveIntensity: 0.8 })));
  g.add(new THREE.Mesh(metreUVs(new THREE.BoxGeometry(x1 - x0, 0.2, w), 1.4).translate((x0 + x1) / 2, y - 0.1, mid), flags));
  const list = [];
  for (let x = x0 + 2; x < x1 - 1; x += 2.6) {
    if (Math.abs(x) < 2.5) continue; // the way through from the hall
    list.push({ x, z: z0 + 1.6, face: 1 }, { x, z: z1 - 1.6, face: -1 });
  }
  const row = stalls(list);
  row.position.y = y;
  g.add(row);
}

// The Nails: a bronze pillar with a flat round top and a raised rim.
function nail() {
  const parts = [
    new THREE.CylinderGeometry(0.2, 0.26, 0.12, 16).translate(0, 0.06, 0),
    new THREE.CylinderGeometry(0.09, 0.13, 0.75, 12).translate(0, 0.5, 0),
    new THREE.CylinderGeometry(0.16, 0.09, 0.14, 12).translate(0, 0.94, 0),
    new THREE.CylinderGeometry(0.36, 0.33, 0.06, 24).translate(0, 1.03, 0),
    new THREE.TorusGeometry(0.35, 0.025, 6, 24).rotateX(Math.PI / 2).translate(0, 1.07, 0),
  ];
  return new THREE.Mesh(merge(parts), bronze);
}

// A robed figure for a parapet (generic; the Commercial Rooms' three represent Bristol, Commerce and Navigation).
function figure() {
  const parts = [
    new THREE.CylinderGeometry(0.22, 0.36, 1.4, 12).translate(0, 0.7, 0),
    new THREE.CylinderGeometry(0.17, 0.22, 0.45, 12).translate(0, 1.6, 0),
    new THREE.SphereGeometry(0.14, 12, 10).translate(0, 1.95, 0),
    new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6).rotateZ(0.6).translate(0.3, 1.5, 0.05),
    metreUVs(new THREE.BoxGeometry(0.8, 0.3, 0.8), 1).translate(0, -0.15, 0),
  ];
  return merge(parts);
}

// The Commercial Rooms: an Ionic portico of four columns before its front (z = 0, facing Corn Street at +z), a
// plain entablature and parapet, and three statues on top.
function commercialRooms() {
  const g = frame();
  const parts = [];
  for (const x of [-4.5, -1.5, 1.5, 4.5]) parts.push(column(0.45, 7.4, 'ionic').translate(x, 0.6, 2.4));
  parts.push(metreUVs(new THREE.BoxGeometry(12.4, 0.6, 3.6), 1).translate(0, 0.3, 1.8)); // the steps
  parts.push(metreUVs(new THREE.BoxGeometry(11.8, 1.1, 3.2), 1).translate(0, 8.55, 1.6));
  parts.push(metreUVs(new THREE.BoxGeometry(12.4, 0.4, 3.6), 1).translate(0, 9.3, 1.8));
  parts.push(metreUVs(new THREE.BoxGeometry(12.4, 1.2, 3.0), 1).translate(0, 10.1, 1.5));
  for (const x of [-4, 0, 4]) parts.push(figure().translate(x, 10.7, 1.8));
  g.add(new THREE.Mesh(merge(parts), paleStone));
  const doors = [];
  for (const x of [-3, 0, 3]) doors.push(new THREE.ShapeGeometry(arch(new THREE.Shape(), x, 1.5, 0.6, 3.6, 4.2), 6).translate(0, 0, 0.03));
  g.add(new THREE.Mesh(merge(doors), shadow));
  return g;
}

// Christ Church's tower and spire (Georgian Classical): a square tower in stages with a clock, an open octagonal
// lantern of columns, and a slender spire with a vane.
function christChurch() {
  const g = frame();
  const parts = [];
  const w = 6.4;
  parts.push(metreUVs(new THREE.BoxGeometry(w, 20, w), 1.6).translate(0, 10, 0));
  parts.push(metreUVs(new THREE.BoxGeometry(w + 0.4, 0.5, w + 0.4), 1).translate(0, 10.5, 0));
  parts.push(metreUVs(new THREE.BoxGeometry(w + 0.6, 0.6, w + 0.6), 1).translate(0, 20.2, 0));
  parts.push(balustrade(-w / 2, w / 2, 20.5, w / 2 - 0.2));
  parts.push(balustrade(-w / 2, w / 2, 20.5, -w / 2 + 0.2));
  parts.push(balustrade(-w / 2, w / 2, 20.5, 0).rotateY(Math.PI / 2).translate(w / 2 - 0.2, 0, 0));
  parts.push(balustrade(-w / 2, w / 2, 20.5, 0).rotateY(Math.PI / 2).translate(-w / 2 + 0.2, 0, 0));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    parts.push(column(0.22, 5.2).translate(Math.sin(a) * 2.2, 20.6, Math.cos(a) * 2.2));
  }
  parts.push(new THREE.CylinderGeometry(1.6, 1.6, 5.2, 8).translate(0, 23.2, 0));
  parts.push(new THREE.CylinderGeometry(2.7, 2.7, 0.6, 8).translate(0, 26.1, 0));
  parts.push(new THREE.CylinderGeometry(0.12, 1.9, 20, 8).translate(0, 36.4, 0));
  g.add(new THREE.Mesh(merge(parts), paleStone));
  const openings = [];
  for (let a = 0; a < 4; a++) {
    openings.push(new THREE.ShapeGeometry(arch(new THREE.Shape(), 0, 1.6, 13, 16.6, 17.6), 6).translate(0, 0, w / 2 + 0.02).rotateY((a * Math.PI) / 2));
  }
  g.add(new THREE.Mesh(merge(openings), shadow));
  for (let a = 0; a < 4; a++) {
    const dial = exchangeClock(0.9);
    dial.position.set(Math.sin((a * Math.PI) / 2) * (w / 2 + 0.03), 8.2, Math.cos((a * Math.PI) / 2) * (w / 2 + 0.03));
    dial.rotation.y = (a * Math.PI) / 2;
    g.add(dial);
  }
  const vane = new THREE.Mesh(merge([new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6).translate(0, 47, 0), new THREE.ConeGeometry(0.25, 0.9, 4).rotateZ(Math.PI / 2).scale(1, 1, 0.25).translate(0, 47.4, 0)]), gilt);
  g.add(vane);
  return g;
}

// Christ Church's body: its mapped outline raised in pale stone to about 15 m under a lead roof, with tall
// round-headed windows. (Its tower and spire are modelled separately.)
function christChurchBody(ctx) {
  const pts = CHRIST_CHURCH_FOOTPRINT.map(([lat, lon]) => ctx.at(lat, lon));
  if (pts.some((p) => !p)) return null;
  const ai = pts.reduce((a, p) => a + p.i, 0) / pts.length;
  const aj = pts.reduce((a, p) => a + p.j, 0) / pts.length;
  const [ax, az] = ctx.metres(ai, aj);
  const local = pts.map((p) => {
    const [x, z] = ctx.metres(p.i, p.j);
    return new THREE.Vector2(x - ax, -(z - az));
  });
  const h = 15;
  const body = metreUVs(new THREE.ExtrudeGeometry(new THREE.Shape(local), { depth: h + 2.5, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -2.5, 0), 1.6);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(body, paleStone));
  const lead = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(local)).rotateX(-Math.PI / 2).translate(0, h + 0.02, 0), new THREE.MeshStandardMaterial({ color: 0x6d737a, roughness: 0.6 }));
  g.add(lead);
  // Windows on every wall long enough for them, facing outwards.
  const wins = [];
  const n = local.length;
  const inside = (x, z) => {
    let hit = false;
    for (let a = 0, b = n - 1; a < n; b = a++) {
      const [xa, za] = [local[a].x, -local[a].y];
      const [xb, zb] = [local[b].x, -local[b].y];
      if (za > z !== zb > z && x < ((xb - xa) * (z - za)) / (zb - za) + xa) hit = !hit;
    }
    return hit;
  };
  for (let k = 0; k < n; k++) {
    const [x0, z0] = [local[k].x, -local[k].y];
    const [x1, z1] = [local[(k + 1) % n].x, -local[(k + 1) % n].y];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 5) continue;
    let [nx, nz] = [(z1 - z0) / len, -(x1 - x0) / len];
    if (inside((x0 + x1) / 2 + nx * 0.3, (z0 + z1) / 2 + nz * 0.3)) [nx, nz] = [-nx, -nz];
    const count = Math.floor(len / 4);
    for (let m = 0; m < count; m++) {
      const t = (m + 0.5) / count;
      const win = new THREE.ShapeGeometry(arch(new THREE.Shape(), 0, 1.5, 4, 9.5, 10.3), 6);
      win.rotateY(Math.atan2(nx, nz)).translate(x0 + (x1 - x0) * t + nx * 0.03, 0, z0 + (z1 - z0) * t + nz * 0.03);
      wins.push(win);
    }
  }
  if (wins.length) g.add(new THREE.Mesh(merge(wins), windowGlass));
  return { i: ai, j: aj, model: { group: g, top: h }, era: ['now', 'georgian', 'then', 'blitz'], trueSize: true, baseAlt: CHRIST_CHURCH.ground };
}

export function cornStreet(ctx) {
  const items = [];
  const body = christChurchBody(ctx);
  if (body) items.push(body);
  const ex = ctx.at(EXCHANGE.lat, EXCHANGE.lon);
  if (ex) {
    const g = new THREE.Group();
    const f = exchange();
    glassArcade(f);
    g.add(f);
    items.push({ ...ex, model: { group: g, top: 18 }, era: ['now', 'georgian', 'then', 'blitz'], trueSize: true, baseAlt: EXCHANGE.ground });
  }
  for (const [lat, lon] of NAILS) {
    const at = ctx.at(lat, lon);
    if (!at) continue;
    const g = new THREE.Group();
    g.add(nail());
    items.push({ ...at, model: { group: g, top: 1.1 }, era: ['castle', 'georgian', 'then', 'blitz', 'now'], trueSize: true }); // 16th–17th century
  }
  const cr = ctx.at(COMMERCIAL_ROOMS.lat, COMMERCIAL_ROOMS.lon);
  if (cr) {
    const g = new THREE.Group();
    g.add(commercialRooms());
    items.push({ ...cr, model: { group: g, top: 12 }, era: ['now', 'then', 'blitz'], trueSize: true, baseAlt: COMMERCIAL_ROOMS.ground });
  }
  const cc = ctx.at(CHRIST_CHURCH.lat, CHRIST_CHURCH.lon);
  if (cc) {
    const g = new THREE.Group();
    g.add(christChurch());
    items.push({ ...cc, model: { group: g, top: 47 }, era: ['now', 'georgian', 'then', 'blitz'], trueSize: true, baseAlt: CHRIST_CHURCH.ground });
  }
  return items;
}
