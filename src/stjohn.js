import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stoneTexture, timberTexture, textured, metreUVs } from './textures.js';

// St John on the Wall (the Church of St John the Baptist), over St John's Gate at the foot of Broad Street: the only
// one of Bristol's medieval city gates still standing, with its church built along the old town wall.
// Sources:
// - OpenStreetMap: the church and gate outlines, and the three passages through the gate.
// - Historic England list entry 1202022:
//   - a two-stage tower with diagonal buttresses and a central clock, and an octagonal spire, over a fan-vaulted
//     central gateway, with side gateways of c.1820;
//   - niches on the south side with painted statues of Brennus and Belinus, Bristol's legendary founders;
//   - a six-bay nave and two-bay chancel with three-light windows and a crenellated parapet;
//   - St John's Conduit on the north side at the east end, with lion-head spouts and a panel dated 1866.
// - Wikipedia: 34 m tall.
// - LIDAR: the tower's and the nave's heights.
// Approximate or simplified: the tracery, the vault ribs, the statues, the furnishings inside, and the stage heights.

export const ST_JOHN = { lat: 51.455871, lon: -2.595130 }; // the middle of the central arch
const BEARING = 37.5; // the line of the old wall (and the church), degrees from north, towards the east end
const STREET = 10.7; // the street under the arch, metres OD (LIDAR)

// The church and gate's mapped outline: kept clear of the map's blocks and today's footprints.
export const ST_JOHN_FOOTPRINT = [[51.4558806, -2.5950508], [51.4559792, -2.5949278], [51.4561011, -2.5947757],
  [51.4561441, -2.5948612], [51.4561223, -2.5948879], [51.4559249, -2.5951297], [51.4558551, -2.5952182],
  [51.4558433, -2.5952332], [51.4558105, -2.5951357], [51.4558755, -2.5950572]];

// In the model, +x runs along the wall towards the east end, +z faces Broad Street (the south side), y is metres
// above the street under the arch.
const GATE = { x0: -6.2, x1: 4.6, top: 8 }; // the gate block, 7.6 m deep like the church
const HALF = 3.8; // half the depth of the gate and the width of the church
const NAVE = { x0: 4.6, x1: 35.3, eaves: 9.6, floor: 1.1 }; // six bays of nave and two of chancel
const BAY = (NAVE.x1 - NAVE.x0) / 8;
const TOWER = { half: 3.2, stage: 14, top: 20.2, spire: 34 };

const rubble = textured(stoneTexture(0x9a8b74, 31), { tile: 2.2 });
const dressing = textured(stoneTexture(0xc8bea6, 32), { tile: 1.2 });
const flags = textured(stoneTexture(0xb3aa98, 33), { tile: 1.6 });
const oak = textured(timberTexture(0x5b3f28), { tile: 1.5 });
const plaster = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.95 });
const lead = new THREE.MeshStandardMaterial({ color: 0x6d737a, roughness: 0.6, metalness: 0.2 });
const glass = new THREE.MeshStandardMaterial({
  color: 0x8fa6b8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
  emissive: 0x2a3440,
});
const leadwork = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.6 });
const shadow = new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 1 });
const gilt = new THREE.MeshStandardMaterial({ color: 0xd9a93a, roughness: 0.35, metalness: 0.7 });

// A pointed arch outline (a window, a niche, a passage) on a path or shape: centre cx, width w, from y0 up to the
// springing line, then two curves up to the apex.
export function arch(path, cx, w, y0, spring, apex) {
  const rise = apex - spring;
  path.moveTo(cx - w / 2, y0);
  path.lineTo(cx + w / 2, y0);
  path.lineTo(cx + w / 2, spring);
  path.quadraticCurveTo(cx + w / 2, spring + rise * 0.75, cx, apex);
  path.quadraticCurveTo(cx - w / 2, spring + rise * 0.75, cx - w / 2, spring);
  path.closePath();
  return path;
}

// A wall in the x–y plane from (x0, y0) to (x1, y1), `depth` thick from z = 0 towards -z, with arched openings
// [{ cx, w, y0, spring, apex }].
export function wall(x0, x1, y0, y1, depth, openings = []) {
  const s = new THREE.Shape();
  s.moveTo(x0, y0);
  s.lineTo(x1, y0);
  s.lineTo(x1, y1);
  s.lineTo(x0, y1);
  s.closePath();
  for (const o of openings) s.holes.push(arch(new THREE.Path(), o.cx, o.w, o.y0, o.spring, o.apex));
  return metreUVs(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, -depth), 1);
}

// Glass and lead in a window opening: a pane, mullions dividing it into `lights`, and a transom.
function glazing(o, lights, z) {
  const pane = new THREE.ShapeGeometry(arch(new THREE.Shape(), o.cx, o.w, o.y0, o.spring, o.apex), 8).translate(0, 0, z);
  const bars = [];
  for (let k = 1; k < lights; k++) {
    const x = o.cx - o.w / 2 + (o.w * k) / lights;
    const top = o.spring + (o.apex - o.spring) * (1 - Math.abs(x - o.cx) / (o.w / 2)) * 0.8;
    bars.push(new THREE.BoxGeometry(0.12, top - o.y0, 0.16).translate(x, (o.y0 + top) / 2, z));
  }
  bars.push(new THREE.BoxGeometry(o.w, 0.1, 0.14).translate(o.cx, (o.y0 + o.spring) / 2 + 0.3, z));
  return { pane, bars };
}

// A row of merlons along x from x0 to x1 at height y, on a wall face centred at z.
function merlons(x0, x1, y, z, depth = 0.6) {
  const out = [];
  const n = Math.max(1, Math.round((x1 - x0) / 1.2));
  const step = (x1 - x0) / n;
  for (let k = 0; k < n; k++) out.push(metreUVs(new THREE.BoxGeometry(step * 0.55, 0.65, depth), 1).translate(x0 + step * (k + 0.5), y + 0.32, z));
  return out;
}

// A statue in a niche: a crowned king in a long robe and cloak, painted, holding a sceptre. (Brennus and Belinus, as
// legend has it; these figures are simplified.)
export function king(robe, cloak) {
  const g = new THREE.Group();
  const paint = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  const gown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 1.2, 12), paint(robe));
  gown.position.y = 0.6;
  const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.75, 12, 1, true, Math.PI * 0.6, Math.PI * 1.8), paint(cloak));
  mantle.material.side = THREE.DoubleSide;
  mantle.position.y = 1.05;
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.4, 12), paint(robe));
  chest.position.y = 1.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), paint(0xd8b48e));
  head.position.y = 1.67;
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 8).rotateX(Math.PI), paint(0x6b4a2c));
  beard.position.set(0, 1.56, 0.07);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.1, 10, 1, true), gilt);
  crown.material.side = THREE.DoubleSide;
  crown.position.y = 1.8;
  const points = mergeGeometries(Array.from({ length: 5 }, (_, k) => {
    const a = (k / 5) * Math.PI * 2;
    return new THREE.ConeGeometry(0.025, 0.08, 4).translate(Math.sin(a) * 0.13, 1.89, Math.cos(a) * 0.13);
  }));
  const sceptre = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6), gilt);
  sceptre.position.set(0.22, 1.25, 0.12);
  sceptre.rotation.z = -0.15;
  g.add(gown, mantle, chest, head, beard, crown, new THREE.Mesh(points, gilt), sceptre);
  return g;
}

// A clock dial: dark blue with gilt numerals and hands, drawn on a canvas.
function clockFace(r) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1d2a4a';
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#d9a93a';
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = '#e2b54a';
  g.font = 'bold 30px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const nums = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  nums.forEach((n, k) => {
    const a = (k / 12) * Math.PI * 2;
    g.fillText(n, 128 + Math.sin(a) * 95, 128 - Math.cos(a) * 95);
  });
  g.lineCap = 'round';
  g.strokeStyle = '#e2b54a';
  for (const [a, len, w] of [[Math.PI * 2 * (10.1 / 12), 52, 9], [Math.PI * 2 * (2 / 60), 80, 6]]) {
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

// The gate: a block the depth of the church with the medieval central arch (fan-vaulted inside) and the two
// footway arches of c.1820, the kings in their niches on the Broad Street side, and the tower over the middle.
function gate(g) {
  const centre = { cx: 0, w: 3.6, y0: -1.5, spring: 3.4, apex: 5.6 };
  const sides = [{ cx: -4.7, w: 1.7, y0: -1.5, spring: 2.2, apex: 3.2 }, { cx: 3.35, w: 1.5, y0: -1.5, spring: 2.2, apex: 3.1 }];
  const block = wall(GATE.x0, GATE.x1, -2.5, GATE.top, HALF * 2, [centre, ...sides]).translate(0, 0, HALF);
  g.add(new THREE.Mesh(block, rubble));
  // Dressed stone round the arches on both faces (a band just proud of the wall).
  const rims = [];
  for (const o of [centre, ...sides]) {
    // A band round the arch: up the outer edge, over, down, then back along the opening's edge.
    // (Points from the right foot round to the left foot.)
    const edge = (w, apex) => {
      const rise = apex - o.spring;
      const q = (t, x0, y0, cx, cy, x1, y1) => new THREE.Vector2((1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1);
      const r = o.cx + w / 2;
      const l = o.cx - w / 2;
      const pts = [new THREE.Vector2(r, 0)];
      for (let k = 0; k <= 8; k++) pts.push(q(k / 8, r, o.spring, r, o.spring + rise * 0.75, o.cx, apex));
      for (let k = 1; k <= 8; k++) pts.push(q(k / 8, o.cx, apex, l, o.spring + rise * 0.75, l, o.spring));
      pts.push(new THREE.Vector2(l, 0));
      return pts;
    };
    const band = new THREE.Shape([...edge(o.w + 0.7, o.apex + 0.45), ...edge(o.w, o.apex).reverse()]);
    for (const z of [HALF + 0.08, -HALF - 0.08]) rims.push(metreUVs(new THREE.ExtrudeGeometry(band, { depth: 0.08, bevelEnabled: false }).translate(0, 0, z - 0.04), 1));
  }
  g.add(new THREE.Mesh(mergeGeometries(rims), dressing));
  // The fan vault: ribs springing from each side of the passage, every 1.9 m, meeting along the crown.
  const ribs = [];
  for (let z = -HALF + 0.95; z < HALF; z += 1.9) {
    for (const s of [-1, 1]) {
      for (const lean of [-0.5, 0, 0.5]) {
        const len = 2.6;
        ribs.push(new THREE.BoxGeometry(0.12, len, 0.14).translate(0, len / 2, 0).rotateZ(s * (0.55 + lean * 0.5)).rotateY(lean * 0.6)
          .translate(s * (centre.w / 2 - 0.06), centre.spring, z));
      }
    }
    ribs.push(new THREE.BoxGeometry(0.4, 0.06, 0.4).rotateY(Math.PI / 4).translate(0, centre.apex - 0.05, z)); // the boss
  }
  g.add(new THREE.Mesh(mergeGeometries(ribs), dressing));
  // The old gates: heavy oak leaves at the north end, folded back against the passage walls.
  for (const s of [-1, 1]) {
    const leaf = metreUVs(new THREE.BoxGeometry(0.12, centre.spring + 0.4, 1.75), 1).translate(s * (centre.w / 2 - 0.1), (centre.spring + 0.4) / 2 - 0.3, -HALF + 1.0);
    g.add(new THREE.Mesh(leaf, oak));
  }
  // Brennus and Belinus in canopied niches either side of the arch, on the south face.
  for (const [x, robe, cloak] of [[-2.75, 0x8e2a2a, 0x2e4a7a], [2.45, 0x2e4a7a, 0x8e2a2a]]) {
    const recess = new THREE.Mesh(new THREE.ShapeGeometry(arch(new THREE.Shape(), x, 0.95, 3.7, 5.7, 6.3), 8), shadow);
    recess.position.z = HALF + 0.01;
    const hood = metreUVs(new THREE.BoxGeometry(1.25, 0.2, 0.4), 1).translate(x, 6.45, HALF + 0.2);
    const ledge = metreUVs(new THREE.BoxGeometry(1.1, 0.18, 0.45), 1).translate(x, 3.62, HALF + 0.2);
    g.add(recess, new THREE.Mesh(mergeGeometries([hood, ledge]), dressing));
    const k = king(robe, cloak);
    k.position.set(x, 3.71, HALF + 0.2);
    g.add(k);
  }
  // A crenellated parapet along the block's top either side of the tower.
  const crest = [];
  for (const [x0, x1] of [[GATE.x0, -TOWER.half], [TOWER.half, GATE.x1]]) {
    crest.push(...merlons(x0, x1, GATE.top, HALF - 0.3), ...merlons(x0, x1, GATE.top, -HALF + 0.3));
  }
  crest.push(...merlons(-HALF + 0.3, HALF - 0.3, GATE.top, 0).map((m) => m.rotateY(Math.PI / 2).translate(GATE.x0 + 0.3, 0, 0)));
  g.add(new THREE.Mesh(mergeGeometries(crest), rubble));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(GATE.x1 - GATE.x0 - 0.4, 0.2, HALF * 2 - 0.4).translate((GATE.x0 + GATE.x1) / 2, GATE.top - 0.1, 0), lead);
  g.add(roof);
}

// The tower: two stages over the gate with diagonal buttresses at the corners, a clock on the Broad Street face,
// two-light belfry openings, a crenellated parapet with corner pinnacles, and the octagonal spire with a weathercock.
function tower(g) {
  const t = TOWER;
  const body = metreUVs(new THREE.BoxGeometry(t.half * 2, t.top - GATE.top, t.half * 2), 2.2).translate(0, (GATE.top + t.top) / 2, 0);
  g.add(new THREE.Mesh(body, rubble));
  const dress = [];
  // The string course between the stages, and the parapet.
  dress.push(metreUVs(new THREE.BoxGeometry(t.half * 2 + 0.3, 0.3, t.half * 2 + 0.3), 1).translate(0, t.stage, 0));
  dress.push(metreUVs(new THREE.BoxGeometry(t.half * 2 + 0.4, 0.35, t.half * 2 + 0.4), 1).translate(0, t.top, 0));
  for (let a = 0; a < 4; a++) {
    const side = merlons(-t.half, t.half, t.top + 0.17, t.half - 0.1, 0.45);
    dress.push(...side.map((m) => m.rotateY((a * Math.PI) / 2)));
  }
  // Diagonal buttresses: stepping in as they rise, ending in pinnacles above the parapet.
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const a = Math.atan2(sx, sz);
    for (const [y0, y1, w] of [[GATE.top, t.stage, 1.0], [t.stage, t.top, 0.8]]) {
      dress.push(metreUVs(new THREE.BoxGeometry(w, y1 - y0, 1.3), 1).translate(0, (y0 + y1) / 2, 0.45).rotateY(a).translate(sx * t.half, 0, sz * t.half));
    }
    dress.push(new THREE.ConeGeometry(0.35, 2.0, 4).rotateY(Math.PI / 4).translate(sx * t.half, t.top + 1.2, sz * t.half));
  }
  g.add(new THREE.Mesh(mergeGeometries(dress.map((d) => d.index ? d.toNonIndexed() : d)), dressing));
  // Belfry openings on all four faces: two lights under a hood, dark with louvres.
  const louvres = [];
  for (let a = 0; a < 4; a++) {
    for (const x of [-0.75, 0.75]) {
      const hole = new THREE.ShapeGeometry(arch(new THREE.Shape(), x, 1.0, t.stage + 1.4, t.stage + 3.8, t.stage + 4.6), 6).translate(0, 0, t.half + 0.02);
      louvres.push(hole.rotateY((a * Math.PI) / 2));
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(louvres), shadow));
  const slats = [];
  for (let a = 0; a < 4; a++) {
    for (const x of [-0.75, 0.75]) {
      for (let y = t.stage + 1.7; y < t.stage + 3.8; y += 0.35) {
        slats.push(new THREE.BoxGeometry(0.9, 0.06, 0.14).rotateX(-0.5).translate(x, y, t.half + 0.06).rotateY((a * Math.PI) / 2));
      }
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(slats), oak));
  // The clock, on the Broad Street face of the lower stage, in a stone surround.
  const surround = metreUVs(new THREE.BoxGeometry(2.6, 2.6, 0.15), 1).translate(0, 11.2, t.half + 0.07);
  g.add(new THREE.Mesh(surround, dressing));
  const dial = clockFace(1.1);
  dial.position.set(0, 11.2, t.half + 0.16);
  g.add(dial);
  // A small window above the arch on the north face.
  const north = new THREE.Mesh(new THREE.ShapeGeometry(arch(new THREE.Shape(), 0, 0.8, 9.6, 11.2, 11.8), 6), shadow);
  north.rotation.y = Math.PI;
  north.position.z = -t.half - 0.02;
  g.add(north);
  // The octagonal spire, and the weathercock.
  const h = t.spire - t.top - 0.3;
  const spire = new THREE.Mesh(metreUVs(new THREE.CylinderGeometry(0.1, 2.5, h, 8).rotateY(Math.PI / 8), 1.5).translate(0, t.top + 0.3 + h / 2, 0), dressing);
  g.add(spire);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6).translate(0, t.spire + 0.5, 0), gilt);
  const cock = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 4).rotateZ(Math.PI / 2).scale(1, 1, 0.25).translate(0, t.spire + 0.9, 0), gilt);
  g.add(rod, cock);
}

// The nave and chancel along the wall: buttressed walls with three-light windows (a crypt below on the north side,
// where the ground falls to Quay Street), a crenellated parapet, a five-light east window, a low lead roof, and inside,
// a flagged floor, pews either side of the aisle, a pulpit, a font, the altar rail and the communion table.
function church(g) {
  const { x0, x1, eaves, floor } = NAVE;
  const windows = [];
  for (let k = 0; k < 8; k++) windows.push({ cx: x0 + BAY * (k + 0.5), w: 2.1, y0: 3.7, spring: 6.9, apex: 8.5 });
  const walls = [];
  // South (Broad Street side) and north (Quay Street side) walls, 0.8 m thick.
  walls.push(wall(x0, x1, -2.5, eaves, 0.8, windows).translate(0, 0, HALF));
  const crypt = [];
  for (let k = 1; k < 8; k += 2) crypt.push({ cx: x0 + BAY * (k + 0.5), w: 0.9, y0: -0.6, spring: 0.3, apex: 0.6 });
  walls.push(wall(x0, x1, -2.5, eaves, 0.8, [...windows, ...crypt]).translate(0, 0, -HALF + 0.8));
  // The west wall above the gate block, and the east wall with its great window.
  walls.push(wall(-HALF, HALF, GATE.top - 0.5, eaves, 0.8).rotateY(-Math.PI / 2).translate(x0, 0, 0));
  const east = { cx: 0, w: 4.0, y0: 3.4, spring: 6.8, apex: 9.0 };
  walls.push(wall(-HALF, HALF, -2.5, eaves, 0.8, [east]).rotateY(Math.PI / 2).translate(x1, 0, 0));
  g.add(new THREE.Mesh(mergeGeometries(walls), rubble));
  // Inside, the walls are plastered: a thin skin just inside each long wall, with the windows cut through it.
  const skin = [];
  for (const z of [HALF - 0.8, -HALF + 0.82]) skin.push(wall(x0 + 0.05, x1 - 0.85, floor, eaves - 0.4, 0.02, windows).translate(0, 0, z));
  g.add(new THREE.Mesh(mergeGeometries(skin), plaster));
  // Glass and tracery.
  const panes = [];
  const bars = [];
  for (const o of windows) {
    for (const z of [HALF - 0.4, -HALF + 0.4]) {
      const w = glazing(o, 3, z);
      panes.push(w.pane);
      bars.push(...w.bars);
    }
  }
  for (const o of crypt) panes.push(new THREE.ShapeGeometry(arch(new THREE.Shape(), o.cx, o.w, o.y0, o.spring, o.apex), 4).translate(0, 0, -HALF + 0.4));
  const ew = glazing(east, 5, 0);
  panes.push(ew.pane.rotateY(Math.PI / 2).translate(x1 - 0.4, 0, 0));
  bars.push(...ew.bars.map((b) => b.rotateY(Math.PI / 2).translate(x1 - 0.4, 0, 0)));
  g.add(new THREE.Mesh(mergeGeometries(panes), glass));
  g.add(new THREE.Mesh(mergeGeometries(bars.map((b) => b.toNonIndexed())), dressing));
  // Hood moulds over the windows, buttresses between the bays, and the crenellated parapet.
  const dress = [];
  for (const o of windows) {
    for (const s of [1, -1]) dress.push(metreUVs(new THREE.BoxGeometry(o.w + 0.5, 0.15, 0.2), 1).translate(o.cx, o.apex + 0.25, s * (HALF + 0.08)));
  }
  for (let k = 0; k <= 8; k++) {
    const x = x0 + BAY * k + (k === 0 ? 0.4 : k === 8 ? -0.4 : 0);
    for (const s of [1, -1]) {
      dress.push(metreUVs(new THREE.BoxGeometry(0.7, eaves + 2.5 - 1.5, 0.8), 1).translate(x, (eaves - 1.5 - 2.5) / 2, s * (HALF + 0.4)));
      dress.push(metreUVs(new THREE.BoxGeometry(0.6, 1.0, 0.45), 1).rotateX(s * 0.5).translate(x, eaves - 1.0, s * (HALF + 0.3)));
    }
  }
  dress.push(metreUVs(new THREE.BoxGeometry(x1 - x0, 0.25, 0.2), 1).translate((x0 + x1) / 2, eaves, HALF + 0.05));
  dress.push(metreUVs(new THREE.BoxGeometry(x1 - x0, 0.25, 0.2), 1).translate((x0 + x1) / 2, eaves, -HALF - 0.05));
  dress.push(...merlons(x0, x1, eaves + 0.1, HALF - 0.3), ...merlons(x0, x1, eaves + 0.1, -HALF + 0.3));
  dress.push(...merlons(-HALF + 0.3, HALF - 0.3, eaves + 0.1, 0).map((m) => m.rotateY(Math.PI / 2).translate(x1 - 0.3, 0, 0)));
  const gableCross = [new THREE.BoxGeometry(0.15, 1.2, 0.15).translate(x1 - 0.3, eaves + 1.4, 0), new THREE.BoxGeometry(0.15, 0.15, 0.7).translate(x1 - 0.3, eaves + 1.6, 0)];
  dress.push(...gableCross);
  g.add(new THREE.Mesh(mergeGeometries(dress.map((d) => d.index ? d.toNonIndexed() : d)), dressing));
  // The roof: low-pitched lead outside; inside, a panelled oak ceiling on tie-beams.
  const roofLen = x1 - x0 - 0.8;
  const ridge = new THREE.CylinderGeometry(HALF - 0.4, HALF - 0.4, roofLen, 4, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 4).scale(1, 0.2, 1).translate((x0 + x1 - 0.8) / 2 + 0.4, eaves + 0.1, 0);
  g.add(new THREE.Mesh(ridge, lead));
  const ceiling = metreUVs(new THREE.PlaneGeometry(roofLen, HALF * 2 - 1.6).rotateX(Math.PI / 2), 1.5).translate((x0 + x1 - 0.8) / 2 + 0.4, eaves - 0.4, 0);
  g.add(new THREE.Mesh(ceiling, oak));
  const beams = [];
  for (let k = 0; k <= 8; k++) beams.push(new THREE.BoxGeometry(0.3, 0.35, HALF * 2 - 1.6).translate(x0 + 0.4 + (roofLen * k) / 8, eaves - 0.6, 0));
  for (const z of [-1.2, 1.2]) beams.push(new THREE.BoxGeometry(roofLen, 0.2, 0.2).translate((x0 + x1 - 0.8) / 2 + 0.4, eaves - 0.5, z));
  // Furnishings: pews (1621) both sides of the aisle, the pulpit, the font (1624), the altar rail, the communion table
  // (1635) in the raised chancel.
  const chancel = x0 + BAY * 6;
  const fittings = [];
  for (let x = x0 + 3.2; x < chancel - 2.5; x += 1.05) {
    for (const s of [-1, 1]) {
      const z = s * 1.75;
      fittings.push(new THREE.BoxGeometry(0.45, 0.08, 2.2).translate(x, floor + 0.45, z));
      fittings.push(new THREE.BoxGeometry(0.08, 0.95, 2.2).translate(x + 0.3, floor + 0.48, z));
      fittings.push(new THREE.BoxGeometry(0.5, 0.95, 0.06).translate(x + 0.05, floor + 0.48, s * 0.62));
    }
  }
  fittings.push(new THREE.CylinderGeometry(0.6, 0.45, 1.3, 8).translate(chancel - 1.2, floor + 1.25, 2.3)); // the pulpit
  fittings.push(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6).translate(chancel - 1.2, floor + 0.6, 2.3));
  fittings.push(new THREE.BoxGeometry(0.08, 0.9, HALF * 2 - 2.6).translate(chancel + BAY * 0.9, floor + 0.75, 0)); // the rail
  fittings.push(new THREE.BoxGeometry(0.9, 0.95, 2.0).translate(x1 - 1.9, floor + 0.3 + 0.48, 0)); // the table
  g.add(new THREE.Mesh(mergeGeometries([...beams, ...fittings].map((b) => b.toNonIndexed())), oak));
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.4, 2.05).translate(x1 - 1.9, floor + 0.3 + 0.82, 0), new THREE.MeshStandardMaterial({ color: 0x7a1f26, roughness: 0.9 }));
  g.add(cloth);
  const stone = [];
  stone.push(metreUVs(new THREE.BoxGeometry(x1 - x0 - 1.2, 0.3, HALF * 2 - 1.6), 1.6).translate((x0 + x1) / 2, floor - 0.15, 0));
  stone.push(metreUVs(new THREE.BoxGeometry(x1 - 0.8 - chancel, 0.3, HALF * 2 - 1.6), 1.6).translate((chancel + x1 - 0.8) / 2, floor + 0.15, 0));
  g.add(new THREE.Mesh(mergeGeometries(stone), flags));
  const font = new THREE.Mesh(mergeGeometries([
    new THREE.CylinderGeometry(0.5, 0.42, 0.5, 8).translate(0, 0.95, 0),
    new THREE.CylinderGeometry(0.2, 0.3, 0.7, 8).translate(0, 0.35, 0),
  ]).translate(x0 + 1.6, floor, -2.0), dressing);
  g.add(font);
}

// St John's Conduit on the north wall at the east end: a stone frame with an arched niche, lion-head spouts over a
// trough, and the dated panel. The street there is a metre and a half lower than under the arch.
function conduit(g) {
  const x = 32.4;
  const y = -0.6;
  const z = -HALF - 0.8;
  const parts = [];
  parts.push(metreUVs(new THREE.BoxGeometry(2.4, 3.0, 0.3), 1).translate(x, y + 1.5, z - 0.15));
  parts.push(metreUVs(new THREE.BoxGeometry(2.6, 0.25, 0.45), 1).translate(x, y + 3.1, z - 0.2));
  parts.push(metreUVs(new THREE.BoxGeometry(1.8, 0.5, 0.6), 1).translate(x, y + 0.25, z - 0.6)); // the trough
  g.add(new THREE.Mesh(mergeGeometries(parts), dressing));
  const niche = new THREE.Mesh(new THREE.ShapeGeometry(arch(new THREE.Shape(), x, 1.3, y + 0.6, y + 1.9, y + 2.5), 6), shadow);
  niche.rotation.y = Math.PI;
  niche.position.set(2 * x, 0, z - 0.31);
  g.add(niche);
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.4, metalness: 0.6 });
  for (const dx of [-0.35, 0.35]) {
    const lion = new THREE.Mesh(mergeGeometries([
      new THREE.SphereGeometry(0.13, 10, 8).translate(0, 0, 0),
      new THREE.CylinderGeometry(0.03, 0.03, 0.18, 6).rotateX(Math.PI / 2).translate(0, -0.06, -0.15),
    ]), bronze);
    lion.position.set(x + dx, y + 1.05, z - 0.33);
    g.add(lion);
  }
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const p = c.getContext('2d');
  p.fillStyle = '#d8cfb8';
  p.fillRect(0, 0, 256, 96);
  p.fillStyle = '#3a3026';
  p.font = 'bold 26px Georgia, serif';
  p.textAlign = 'center';
  p.fillText("ST JOHN'S CONDUIT", 128, 40);
  p.font = '24px Georgia, serif';
  p.fillText('1866', 128, 76);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.52), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  panel.rotation.y = Math.PI;
  panel.position.set(x, y + 2.75, z - 0.31);
  g.add(panel);
}

// The whole landmark, for central Bristol. Standing on the street under the arch, in every era (it survived the Blitz).
export function stJohnOnTheWall(ctx) {
  const at = ctx.at(ST_JOHN.lat, ST_JOHN.lon);
  if (!at) return [];
  const g = new THREE.Group();
  const frame = new THREE.Group();
  frame.rotation.y = THREE.MathUtils.degToRad(90 - BEARING);
  g.add(frame);
  gate(frame);
  tower(frame);
  church(frame);
  conduit(frame);
  const item = { ...at, model: { group: g, top: TOWER.spire }, era: 'both', trueSize: true, baseAlt: STREET };
  // Walkable inside: the nave's flagged floor and the raised chancel.
  const mpp = ctx.metresPerPixel;
  const a = frame.rotation.y;
  const chancel = NAVE.x0 + BAY * 6;
  item.walk = (i, j) => {
    const dx = (i - at.i) * mpp;
    const dz = (j - at.j) * mpp;
    const x = dx * Math.cos(a) - dz * Math.sin(a);
    const z = dx * Math.sin(a) + dz * Math.cos(a);
    if (x < NAVE.x0 + 0.3 || x > NAVE.x1 - 0.9 || Math.abs(z) > HALF - 0.9) return null;
    return STREET + NAVE.floor + (x > chancel ? 0.3 : 0);
  };
  return [item];
}
