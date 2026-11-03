import * as THREE from 'three';
import { timberTexture } from './textures.js';
import { puff, Effects, rand } from './scenarios.js';

// SS Great Britain's float-out, 19 July 1843. Source: Wikipedia (SS Great Britain): 98 m long, 15.39 m beam, iron
// hull, one funnel, six masts as built (five schooner-rigged, one square-rigged); built by William Patterson in the
// Great Western Dockyard to Brunel's design. Prince Albert came; Clarissa Miles named her, the first bottle fell
// short into the water and a second was broken on the hull; the tow rope snapped. Crowd and timings illustrative.

const hullMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 });
const bandMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc0, roughness: 0.7 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.8 });
const sailMat = new THREE.MeshStandardMaterial({ color: 0xe9e2cc, roughness: 0.9, side: THREE.DoubleSide });

// A hull lofted from stations: x forward (stern -L/2, bow +L/2), y up from the waterline, z across. Below the
// waterline each section is a rounded "U" to the keel; above it the sides rise almost straight to the deck, which
// sweeps up towards the ends (sheer). paint(x, y) gives each vertex's colour.
export function hullGeometry({ L, B, draught, freeboard, sheer = 1, bowLen = 0.28, sternLen = 0.12, paint }) {
  const NS = 48;
  const NP = 14;
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const halfBreadth = (t) => {
    // t: 0 at the stern, 1 at the bow.
    if (t > 1 - bowLen) return (B / 2) * Math.sqrt(Math.max(0, 1 - ((t - (1 - bowLen)) / bowLen) ** 2));
    if (t < sternLen) return (B / 2) * (0.55 + 0.45 * Math.sin(((t / sternLen) * Math.PI) / 2));
    return B / 2;
  };
  for (let s = 0; s <= NS; s++) {
    const t = s / NS;
    const x = -L / 2 + t * L;
    const b = Math.max(0.05, halfBreadth(t));
    const deck = freeboard + sheer * (2 * t - 1) ** 2 * 1.6;
    const keel = -draught * Math.min(1, 0.35 + Math.min(t, 1 - t) * 6);
    for (let p = 0; p <= NP; p++) {
      const f = p / NP;
      let y;
      let w;
      if (f < 0.6) {
        const phi = (f / 0.6) * (Math.PI / 2);
        y = keel * Math.cos(phi);
        w = b * Math.sin(phi);
      } else {
        const u = (f - 0.6) / 0.4;
        y = u * deck;
        w = b * (1 - 0.05 * u); // a little tumblehome
      }
      for (const side of [1, -1]) {
        pos.push(x, y, side * w);
        c.set(paint(x, y, deck));
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const idx = [];
  const row = (NP + 1) * 2;
  for (let s = 0; s < NS; s++) {
    for (let p = 0; p < NP; p++) {
      for (const side of [0, 1]) {
        const a = s * row + p * 2 + side;
        const b = a + 2;
        const c2 = a + row;
        const d = b + row;
        if (side === 0) idx.push(a, c2, b, b, c2, d);
        else idx.push(a, b, c2, b, d, c2);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // Texture coordinates in metres: u up the side (so plank textures run fore and aft), v along the ship.
  const uv = [];
  for (let k = 0; k < pos.length; k += 3) uv.push(pos[k + 1] / 2, pos[k] / 2);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Deck: the outline at deck height.
  const outline = [];
  for (let s = 0; s <= NS; s++) outline.push(new THREE.Vector2(-L / 2 + (s / NS) * L, halfBreadth(s / NS) * 0.95));
  for (let s = NS; s >= 0; s--) outline.push(new THREE.Vector2(-L / 2 + (s / NS) * L, -halfBreadth(s / NS) * 0.95));
  const deckGeo = new THREE.ShapeGeometry(new THREE.Shape(outline)).rotateX(Math.PI / 2).translate(0, freeboard - 0.2, 0);
  return { hull: geo, deck: deckGeo, halfBreadth };
}

const hullPaint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
const deckMat = new THREE.MeshStandardMaterial({ color: 0x9a8668, roughness: 0.9, side: THREE.DoubleSide });
const lineMat = new THREE.LineBasicMaterial({ color: 0x2a2520 });
const flagColours = [0xc8102e, 0xf2c200, 0x1d4f91, 0xffffff, 0x2e8b3a];

// Shrouds from a masthead down to the ship's sides, and any extra lines (stays, bunting lines).
function rigging(lines) {
  const pts = [];
  for (const [a, b] of lines) pts.push(...a, ...b);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, lineMat);
}

// Signal-flag bunting along a line from a to b: small coloured triangles.
function bunting(a, b, n) {
  const g = new THREE.Group();
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const flag = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.35, 0, 0), new THREE.Vector3(0.35, 0, 0), new THREE.Vector3(0, -0.9, 0)]),
      new THREE.MeshBasicMaterial({ color: flagColours[k % flagColours.length], side: THREE.DoubleSide }));
    flag.position.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 1.2, a[2] + (b[2] - a[2]) * t);
    g.add(flag);
  }
  return g;
}

// An original model of the ship. +x forward; origin at the waterline amidships. Black iron hull, a cream band with
// gilded scrollwork at the stern and bow, one funnel, six masts (the second square-rigged), dressed overall.
// asBuilt: with sails set (1843); otherwise as she is today, sails stowed.
export function greatBritain({ asBuilt = true } = {}) {
  const g = new THREE.Group();
  const L = 98;
  const B = 15.39;
  const gold = 0xc9a23a;
  const { hull, deck, halfBreadth } = hullGeometry({
    L, B, draught: 4.9, freeboard: 6, sheer: 0.6, bowLen: 0.26, sternLen: 0.1,
    paint: (x, y, top) => {
      if (y > top - 0.9) return x < -L / 2 + 6 || x > L / 2 - 5 ? gold : 0xe6dcc0;
      if (x < -L / 2 + 3 && y > 1.5) return gold; // the gilded stern
      if (y < -0.2 && !asBuilt) return 0x5a2a20; // red-brown below today's "waterline" glass
      return 0x15171a;
    },
  });
  g.add(new THREE.Mesh(hull, hullPaint), new THREE.Mesh(deck, deckMat));
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 9, 14), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 }));
  funnel.position.set(4, 10, 0);
  g.add(funnel);
  const xs = [34, 22, 10, -6, -20, -34];
  const lines = [];
  const tops = [];
  xs.forEach((x, k) => {
    const h = k === 1 ? 34 : 28;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, h, 6), woodMat);
    mast.position.set(x, 6 + h / 2, 0);
    g.add(mast);
    const top = [x, 6 + h, 0];
    tops.push(top);
    const b = halfBreadth((x + L / 2) / L);
    for (const side of [1, -1]) for (const dx of [-2, 0, 2]) lines.push([[x, 6 + h * 0.85, 0], [x + dx, 6.2, side * b]]);
    if (k === 1) {
      for (const [y, w] of [[14, 16], [22, 13], [29, 9]]) {
        const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, w, 5), woodMat);
        yard.rotation.x = Math.PI / 2;
        yard.position.set(x, 6 + y, 0);
        g.add(yard);
        if (asBuilt) {
          const sail = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 6.5), sailMat);
          sail.rotation.y = Math.PI / 2;
          sail.position.set(x + 0.3, 6 + y - 3.5, 0);
          g.add(sail);
        }
      }
    } else {
      // Gaff and boom of the fore-and-aft sail.
      for (const y of [7.5, h - 2]) {
        const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 5), woodMat);
        spar.rotation.z = Math.PI / 2 + (y > 8 ? -0.25 : 0);
        spar.position.set(x - 4.5, 6 + y, 0);
        g.add(spar);
      }
      if (asBuilt) {
        const sail = new THREE.Mesh(new THREE.PlaneGeometry(9, h - 8), sailMat);
        sail.position.set(x - 4.8, 6 + (h - 8) / 2 + 4, 0);
        g.add(sail);
      }
    }
  });
  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 16, 6), woodMat);
  bowsprit.rotation.z = Math.PI / 2 - 0.25;
  bowsprit.position.set(L / 2 + 6, 7.5, 0);
  g.add(bowsprit);
  const jib = [L / 2 + 13, 9.4, 0];
  // Stays between the mastheads, to the bowsprit and down to the stern, dressed with flags.
  const chain = [[-L / 2 + 1, 7, 0], ...[...tops].reverse(), jib];
  for (let k = 1; k < chain.length; k++) {
    lines.push([chain[k - 1], chain[k]]);
    g.add(bunting(chain[k - 1], chain[k], 10));
  }
  g.add(rigging(lines));
  return g;
}

// The Matthew (the 1997 replica of John Cabot's ship of 1497, kept in Bristol): a small caravel about 19 m on deck,
// 5.5 m beam, honey-coloured timber with dark wales, raised castles fore and aft, three masts (square sails on the
// fore and main, a lateen on the mizzen). An original, simplified model; sizes approximate.
export function matthew() {
  const g = new THREE.Group();
  const L = 19;
  const B = 5.6;
  const { hull, deck } = hullGeometry({
    L, B, draught: 2.1, freeboard: 2.2, sheer: 1.3, bowLen: 0.3, sternLen: 0.08,
    paint: (x, y) => (y < -0.3 ? 0x3a3630 : 0xffffff),
  });
  // Honey-coloured planking (the texture's planks run fore and aft); tarred below the waterline.
  const planks = new THREE.MeshStandardMaterial({ map: timberTexture(0xb98445), vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(hull, planks), new THREE.Mesh(deck, deckMat));
  const timber = new THREE.MeshStandardMaterial({ color: 0xa8743a, roughness: 0.8 });
  // Sterncastle (two levels) and forecastle.
  const aft = new THREE.Mesh(new THREE.BoxGeometry(5, 1.8, B * 0.9), timber);
  aft.position.set(-L / 2 + 3, 3.4, 0);
  const poop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, B * 0.75), timber);
  poop.position.set(-L / 2 + 2.2, 4.9, 0);
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 2.4, 1.6, 3), timber);
  fore.rotation.y = Math.PI / 2;
  fore.position.set(L / 2 - 2.2, 4.1, 0);
  g.add(aft, poop, fore);
  const lines = [];
  // Fore and main: square sails on yards. Mizzen: a lateen on a long slanting yard.
  for (const [x, h, sails] of [[5.5, 13, [[9.5, 6, 3.5]]], [0.5, 19, [[10, 9, 5], [16, 5.5, 3]]]]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.25, h, 6), woodMat);
    mast.position.set(x, 2 + h / 2, 0);
    g.add(mast);
    for (const [y, w, d] of sails) {
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, w + 1, 5), woodMat);
      yard.rotation.x = Math.PI / 2;
      yard.position.set(x, 2 + y, 0);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 4, 2), sailMat);
      const sp = sail.geometry.attributes.position;
      for (let k = 0; k < sp.count; k++) sp.setZ(k, 0.6 * Math.cos((sp.getX(k) / w) * Math.PI)); // bellied
      sail.rotation.y = Math.PI / 2;
      sail.position.set(x + 0.3, 2 + y - d / 2, 0);
      g.add(yard, sail);
    }
    for (const side of [1, -1]) lines.push([[x, 2 + h * 0.8, 0], [x - 1, 2.6, side * B * 0.48]]);
  }
  const miz = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 11, 6), woodMat);
  miz.position.set(-5.5, 7.5, 0);
  const lateenYard = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 11, 5), woodMat);
  lateenYard.rotation.z = -0.95;
  lateenYard.position.set(-5.5, 8.5, 0);
  const lateen = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4.2, 4.6, 0), new THREE.Vector3(3.9, 12.6, 0), new THREE.Vector3(-4.2, 5.2, 0),
    new THREE.Vector3(3.9, 12.6, 0), new THREE.Vector3(-1.2, 4.4, 0), new THREE.Vector3(-4.2, 4.6, 0)]).translate(-1.5, 0, 0.1), sailMat);
  lateen.geometry.computeVertexNormals();
  g.add(miz, lateenYard, lateen);
  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 6, 5), woodMat);
  bowsprit.rotation.z = Math.PI / 2 - 0.35;
  bowsprit.position.set(L / 2 + 1.8, 4.2, 0);
  g.add(bowsprit);
  // Flags: St George's cross at the mainmast head, pennants at the others.
  const flagTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 40;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 64, 40);
    x.fillStyle = '#c8102e';
    x.fillRect(27, 0, 10, 40);
    x.fillRect(0, 15, 64, 10);
    return new THREE.CanvasTexture(c);
  })();
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide }));
  flag.position.set(-0.6, 22.2, 0);
  g.add(flag, bunting([L / 2 + 4.5, 5.3, 0], [5.5, 15, 0], 6), bunting([5.5, 15, 0], [0.5, 21, 0], 5), bunting([0.5, 21, 0], [-L / 2 + 0.5, 6.4, 0], 9));
  lines.push([[L / 2 + 4.5, 5.3, 0], [5.5, 15, 0]], [[5.5, 15, 0], [0.5, 21, 0]], [[0.5, 21, 0], [-L / 2 + 0.5, 6.4, 0]]);
  g.add(rigging(lines));
  return g;
}

function crowd(count) {
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.25, 1.0, 3, 6), new THREE.MeshStandardMaterial({ roughness: 0.9 }), count);
  const colours = [0x1e1e22, 0x3a2a22, 0x2a3346, 0x5a4a3a, 0x6a2a2a, 0xd8d0c0].map((c) => new THREE.Color(c));
  for (let k = 0; k < count; k++) body.setColorAt(k, colours[k % colours.length]);
  return body;
}

export class FloatOut1843 {
  static title = 'SS Great Britain floats out, 19 July 1843';
  static caption = "Brunel's iron screw steamship, the largest ship of her day at 98 m, was floated out of her dock in the Great Western Dockyard before huge crowds. Prince Albert came by the new railway; Clarissa Miles named her, but the first bottle fell short into the water and a second had to be broken on the hull. Then the tow rope snapped. Crowd and timings are illustrative.";

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    ctx.map.setEra('then');
    this.ship = greatBritain();
    root.add(this.ship);
    // The dock (from the ship's OSM outline): she starts in it, heading out east into the harbour.
    const outline = ctx.map.source.osm?.features.find((f) => f.name === 'SS Great Britain')?.outline ?? [];
    const pts = outline.map(([lat, lon]) => ctx.en(lat, lon));
    let best = [0, 0];
    let d = 0;
    pts.forEach((p, a) => pts.forEach((q, b) => {
      const l = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (l > d) {
        d = l;
        best = [a, b];
      }
    }));
    const [p, q] = pts.length ? [pts[best[0]], pts[best[1]]] : [[-49, 0], [49, 0]];
    // Which end of the dock opens to the harbour: the one nearer harbour water. She leaves that way, then turns into
    // open water (the nearest harbour cell well clear of the dock).
    const water = this.harbourCells(ctx);
    const nearest = (pt, min = 0) => water.reduce((b, w) => {
      const d2 = Math.hypot(w[0] - pt[0], w[1] - pt[1]);
      return d2 >= min && d2 < b.d ? { d: d2, w } : b;
    }, { d: Infinity, w: null });
    const [stern, bow] = nearest(p).d < nearest(q).d ? [q, p] : [p, q];
    this.dock = { e: (stern[0] + bow[0]) / 2, n: (stern[1] + bow[1]) / 2, heading: Math.atan2(bow[1] - stern[1], bow[0] - stern[0]) };
    const out = nearest(bow, 60).w ?? [bow[0] + (bow[0] - stern[0]), bow[1] + (bow[1] - stern[1])];
    this.path = [[this.dock.e, this.dock.n], [bow[0] + Math.cos(this.dock.heading) * 25, bow[1] + Math.sin(this.dock.heading) * 25], out];
    this.crowd = crowd(700);
    root.add(this.crowd);
    // Spectators along both sides of the dock and the quays beyond.
    this.spots = Array.from({ length: 700 }, () => {
      const along = rand(-70, 160);
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = side * rand(14, 30);
      const c = Math.cos(this.dock.heading);
      const s = Math.sin(this.dock.heading);
      return [this.dock.e + c * along - s * off, this.dock.n + s * along + c * off];
    });
    this.tmp = new THREE.Object3D();
    this.bottle = puff(0x2a6a3a, 1, false);
    root.add(this.bottle);
    this.bottle.visible = false;
  }

  // Harbour water cells, as metres east/north of the scene's anchor.
  harbourCells(ctx) {
    const map = ctx.map;
    const b = map.bristol;
    const cells = [];
    if (!b) return cells;
    const [ax, az] = ctx.anchorMetres;
    for (let k = 0; k < b.harbour.length; k += 3) {
      if (!b.harbour[k]) continue;
      const i = k % 512;
      const j = (k - i) / 512;
      const x = (i / 511 - 0.5) * map.span - ax;
      const z = (j / 511 - 0.5) * map.span - az;
      if (Math.hypot(x, z) < 400) cells.push([x, -z]);
    }
    return cells;
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    const level = ctx.map.source.waterLevel?.(ctx.map) ?? 6.9;
    // Out of the dock and into the harbour, then slowing to a stop as the tow parts.
    const tow = t < 14 ? 0 : t < 34 ? (t - 14) * 4 : 80 + Math.min(12, (t - 34) * 0.6);
    let left = tow;
    let at = this.path[0];
    let heading = this.dock.heading;
    for (let k = 1; k < this.path.length; k++) {
      const [ax, ay] = this.path[k - 1];
      const [bx, by] = this.path[k];
      const len = Math.hypot(bx - ax, by - ay);
      const want = Math.atan2(by - ay, bx - ax);
      if (left <= len || k === this.path.length - 1) {
        const f = Math.min(1, left / len);
        at = [ax + (bx - ax) * f, ay + (by - ay) * f];
        heading = this.heading == null ? want : this.heading + Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading)) * Math.min(1, dt * 0.6);
        break;
      }
      left -= len;
    }
    this.heading = t < 14 ? this.dock.heading : heading;
    ctx.placeOnWater(this.ship, at[0], at[1], 0);
    this.ship.scale.setScalar(Math.max(ctx.scaleTrue(), ctx.minSize(98) * 0.6));
    this.ship.rotation.y = this.heading;
    const c = Math.cos(this.dock.heading);
    const s = Math.sin(this.dock.heading);
    // The naming: the first bottle falls short and splashes; the second smashes on the bow.
    if (t > 6 && t < 7.5) {
      this.bottle.visible = true;
      const f = (t - 6) / 1.5;
      ctx.place(this.bottle, this.dock.e + c * (52 + 4 * f), this.dock.n + s * (52 + 4 * f), level + 8 - 9 * f * f);
      this.bottle.scale.setScalar(ctx.minSize(4) * 2);
    } else this.bottle.visible = false;
    if (t > 7.5 && !this.first) {
      this.first = true;
      this.fx.burst(ctx, this.dock.e + c * 56, this.dock.n + s * 56, level + 1, { flash: 0xffffff, smoke: 0xe8f0f4, size: 4, life: 1.5 });
      ctx.audio.splash(ctx.audioPosAt(this.dock.e + c * 56, this.dock.n + s * 56, level), 0);
      ctx.map.status = 'THE FIRST BOTTLE FALLS SHORT…';
      ctx.map.drawSign();
    }
    if (t > 10 && !this.second) {
      this.second = true;
      this.fx.burst(ctx, this.dock.e + c * 49, this.dock.n + s * 49, level + 5, { flash: 0xffffff, smoke: 0xd8e8d0, size: 3, life: 1 });
      ctx.audio.noise(0.3, { gain: 0.4, f0: 5000, type: 'highpass' });
      ctx.map.status = 'SHE IS NAMED GREAT BRITAIN';
      ctx.map.drawSign();
      // A cheer that rolls round the dock.
      ctx.audio.noise(4, { gain: 0.35, f0: 900, f1: 1400, type: 'bandpass', q: 0.6 });
    }
    if (t > 34 && !this.snapped) {
      this.snapped = true;
      ctx.audio.noise(0.15, { gain: 0.6, f0: 3000, type: 'highpass' });
      ctx.map.status = 'THE TOW ROPE SNAPS';
      ctx.map.drawSign();
    }
    // The crowd, with hats going up at the naming.
    const tmp = this.tmp;
    this.root.add(tmp);
    const sc = Math.max(ctx.scaleTrue(), ctx.minSize(2) * 0.25);
    this.spots.forEach(([e, n], k) => {
      const jump = t > 10 && t < 13 ? Math.abs(Math.sin((t * 6 + k) * 1.3)) * 0.4 : 0;
      ctx.place(tmp, e, n, ctx.groundAlt(e, n) + 0.75 + jump);
      tmp.scale.setScalar(sc);
      tmp.updateMatrix();
      this.crowd.setMatrixAt(k, tmp.matrix);
    });
    this.root.remove(tmp);
    this.crowd.instanceMatrix.needsUpdate = true;
    this.fx.update(dt);
    return t < 46;
  }

  stop() {
    this.fx.clear();
    this.ctx.map.status = '';
    this.ctx.map.drawSign();
  }
}
