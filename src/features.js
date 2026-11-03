import * as THREE from 'three';
import { shadeMaterial } from './shade.js';
import { dayUniforms } from './daylight.js';
import { RES } from './terrain.js';
import { STRUCTURES } from './structures.js';
import { LANDMARKS } from './landmarks.js';
import { splatItems } from './splats.js';

// Feature kinds worth a label, and the ones that get a 3D model.
const LABELLED = new Set(['chimney', 'ruins', 'archaeological_site', 'embankment', 'castle', 'tower', 'water_well', 'wayside_cross', 'monument', 'folly', 'manor', 'bridge', 'watermill', 'mill']);
const SKIP_NAMES = /boundary stone/i;

const stone = new THREE.MeshStandardMaterial({ color: 0x8a7f72, roughness: 0.9 });
const darkStone = new THREE.MeshStandardMaterial({ color: 0x6e655a, roughness: 0.95 });
// Reconstruction materials: Pennant sandstone walls and Welsh slate roofs, the usual Bristol combination (a guess here).
const pennant = new THREE.MeshStandardMaterial({ color: 0x7d7468, roughness: 0.92, flatShading: true, side: THREE.DoubleSide });
const slate = new THREE.MeshStandardMaterial({ color: 0x474c55, roughness: 0.75, flatShading: true, side: THREE.DoubleSide });
const brick = new THREE.MeshStandardMaterial({ color: 0x8c5a43, roughness: 0.9 });
const glowMat = new THREE.MeshBasicMaterial({ color: 0xff7a24 });

// A building from a footprint (metres around its own centre): stone walls from below ground up to the eaves,
// then a hipped roof rising to a shrunken copy of the footprint, so any traced shape gets a sensible roof.
function building(pts, bottom, eaves, ridge) {
  const walls = [];
  const roof = [];
  const n = pts.length;
  const inner = pts.map(([x, z]) => [x * 0.42, z * 0.42]);
  const top = eaves + ridge;
  for (let k = 0; k < n; k++) {
    const [ax, az] = pts[k];
    const [bx, bz] = pts[(k + 1) % n];
    walls.push(ax, bottom, az, bx, bottom, bz, bx, eaves, bz, ax, bottom, az, bx, eaves, bz, ax, eaves, az);
    const [cx, cz] = inner[(k + 1) % n];
    const [dx, dz] = inner[k];
    roof.push(ax, eaves, az, bx, eaves, bz, cx, top, cz, ax, eaves, az, cx, top, cz, dx, top, dz);
  }
  for (const tri of THREE.ShapeUtils.triangulateShape(inner.map(([x, z]) => new THREE.Vector2(x, z)), [])) {
    for (const v of tri) roof.push(inner[v][0], top, inner[v][1]);
  }
  const g = new THREE.Group();
  for (const [arr, mat] of [[walls, pennant], [roof, slate]]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mat));
  }
  return g;
}

// Troopers Hill chimney: OSM gives its height (15.92 m). The tapering square section and 2.4 m base are my estimate.
function chimneyModel(height) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.25, height, 4, 1), stone);
  shaft.rotation.y = Math.PI / 4;
  shaft.position.y = height / 2;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.5, 4, 1), darkStone);
  cap.rotation.y = Math.PI / 4;
  cap.position.y = height;
  g.add(shaft, cap);
  return { group: g, top: height + 0.3 };
}

// St Michael's Tower: a plain tower block with a parapet. Proportions are approximate (about 21 m tall, 6 m square).
function towerModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 21, 6), stone);
  body.position.y = 10.5;
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(6.6, 1.2, 6.6), darkStone);
  parapet.position.y = 21.3;
  g.add(body, parapet);
  return { group: g, top: 22 };
}

// (One shared texture for every smoke puff: it used to be made afresh for each plume at every reload.)
let dot = null;
function softDot() {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  dot = new THREE.CanvasTexture(c);
  dot.userData.shared = true;
  return dot;
}

// A coal-smoke plume in real metres: puffs rise, spread and drift downwind, then fade.
class Smoke {
  constructor(count = 320, color = 0x3a3632, opacity = 0.4) {
    this.count = count;
    this.positions = new Float32Array(this.count * 3);
    this.ages = new Float32Array(this.count).map(() => Math.random() * 14);
    this.seeds = new Float32Array(this.count).map(() => Math.random());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.PointsMaterial({
      map: softDot(), color, size: 1, transparent: true, opacity, depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  // origin: chimney top in map-local units; h: local units per real metre horizontally; v: same vertically.
  update(dt, origin, h, v, pointSize) {
    const life = 14;
    for (let k = 0; k < this.count; k++) {
      const a = (this.ages[k] = (this.ages[k] + dt) % life);
      const s = this.seeds[k];
      const rise = 2.2 * a - 0.04 * a * a;
      const drift = 1.6 * a + 0.12 * a * a; // wind from the west
      const spread = 0.4 + 0.9 * a;
      this.positions[k * 3] = origin.x + (drift + Math.sin(s * 40 + a) * spread) * h;
      this.positions[k * 3 + 1] = origin.y + rise * v;
      this.positions[k * 3 + 2] = origin.z + Math.cos(s * 31 + a * 0.7) * spread * h;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.material.size = pointSize;
  }
}

function label(text, color = '#d8f0ff') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  let size = 40;
  do ctx.font = `bold ${size}px ui-monospace, Menlo, monospace`; while (ctx.measureText(text).width > 490 && (size -= 2) > 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(10,14,20,0.85)';
  ctx.strokeText(text, 256, 48);
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 48);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  return sprite;
}

// Everything named on the current site, positioned on the terrain and kept in sync with zoom, pan and life size.
// Each thing is modelled in real metres around an anchor point and scaled into the map by (h, v, h) every frame,
// so it follows the terrain's exaggeration on the table and comes out true size at life size.
export class Features {
  constructor(map) {
    this.map = map;
    this.group = new THREE.Group();
    map.holder.add(this.group);
    this.items = [];
    this.emitters = [];
    this.operational = false;
  }

  // Is this item shown in the era on display?
  eraOk(it) {
    const era = this.map.era;
    return it.era === 'both' || it.era === era || (Array.isArray(it.era) && it.era.includes(era)) || (it.era === 'then' && era !== 'now' && !this.map.source.eras);
  }

  // Building pads for the era on display: the ground under each such building is levelled to the height at its
  // centre (where it stands), blending back into the hillside over a few metres. Window pixels.
  activePads() {
    const map = this.map;
    if (!map.grids) return [];
    const mpp = map.span / RES;
    return this.items.filter((it) => it.pad && this.eraOk(it)).map((it) => ({
      i: it.i, j: it.j, r: it.pad / mpp, skirt: 3 / mpp, h: map.sample(it.i, it.j, map.grids.terrain),
    }));
  }

  // Is window pixel (i, j) (fractional) inside a structure's fine-grained solid parts? For walls with doorways in
  // them, finer than the 1 m mask: a structure may offer collide(i, j).
  blockedFine(i, j) {
    // (A stale item, from before the window moved, is asked at its old pixels.)
    for (const it of this.items) if (it.collide && it.model?.group.visible && (it.shift ? it.collide(i + it.shift[0], j + it.shift[1]) : it.collide(i, j))) return true;
    return false;
  }

  // The height (metres OD) of a walkable surface at window pixel (i, j), if a structure offers one there.
  // A walk() may return { h, force: true } for a floor under the ground (a cave), which wins over everything.
  walkHeight(i, j) {
    let best = null;
    let forced = null;
    for (const it of this.items) {
      if (!it.walk || (it.model && !it.model.group.visible)) continue;
      let r = it.shift ? it.walk(i + it.shift[0], j + it.shift[1]) : it.walk(i, j);
      if (r == null) continue;
      if (typeof r === 'object') {
        if (r.force) {
          forced = forced == null ? r.h : Math.max(forced, r.h);
          continue;
        }
        r = r.h;
      }
      if (best == null || r > best) best = r;
    }
    return forced != null ? { h: forced, force: true } : best;
  }

  // Build the structures afresh for the loaded ground. rebuildStaged spreads it over frames (a builder, or a part
  // of one, a frame), building into a new group while the old one stays on show, then swaps them over.
  rebuild(source) {
    for (const _ of this.build(source));
  }

  async rebuildStaged(source, frame) {
    this.building = true;
    try {
      for (const _ of this.build(source)) await frame();
    } finally {
      this.building = false;
    }
  }

  swapIn(group, items, emitters) {
    // Free the old items' GPU buffers first (their geometries, and the canvas textures of their labels and signs):
    // left alone, every reload of terrain added a couple of hundred of each. Shared materials are kept (freeing one
    // would mean compiling its shader again).
    for (const it of this.items) it.dispose?.(); // (things kept out of the scene: animals and townsfolk far off)
    this.group.traverse((o) => {
      if (o.isSkinnedMesh) o.skeleton?.dispose(); // (its bones' texture)
      if (!o.geometry?.userData.keep) o.geometry?.dispose?.();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (m.map?.isCanvasTexture && !m.map.userData.shared) m.map.dispose();
        if (o.isSprite) m.dispose();
      }
    });
    const parent = this.group.parent ?? this.map.holder;
    this.group.removeFromParent();
    this.group.clear();
    parent.add(group);
    this.group = group;
    this.items = items;
    this.emitters = emitters;
  }

  *build(source) {
    const group = new THREE.Group();
    const items = [];
    const emitters = [];
    const map = this.map;
    const span = map.span;
    // Window pixel -> metres from the window centre, and ground height (bare earth) there.
    const metres = (i, j) => [(i / (RES - 1) - 0.5) * span, (j / (RES - 1) - 0.5) * span];
    const ground = (i, j) => map.sample(i, j, map.grids.terrain);
    const inWindow = ({ i, j }) => i >= 0 && j >= 0 && i < RES && j < RES;
    const add = (item) => {
      if (item.model) group.add(item.model.group);
      if (item.sprite) group.add(item.sprite);
      items.push(item);
      return item;
    };

    for (const f of source.osm?.features ?? []) {
      if (!LABELLED.has(f.kind) || SKIP_NAMES.test(f.name) || f.tags?.['tower:type'] === 'communication') continue;
      const at = source.toWindow(f.lat, f.lon);
      if (!inWindow(at)) continue;
      let model = null;
      if (f.kind === 'chimney') model = chimneyModel(f.height || 15);
      else if (/st\.? michael/i.test(f.name)) model = towerModel();
      // (Today's map names; where a place has periods, only shown today.)
      const item = add({ ...at, sprite: label(f.name), model, era: source.eras ? 'now' : 'both' });
      // A chimney on a site with a reconstruction is the end of the flue: it smokes when the works are running.
      if (f.kind === 'chimney' && source.history) emitters.push({ item, fx: new Smoke(320), size: [9, 0.02] });
    }

    // Hand-built landmark structures (the Suspension Bridge, the Rocks Railway).
    const ctx = {
      at: (lat, lon) => {
        const w = source.toWindow(lat, lon);
        return inWindow(w) ? w : null;
      },
      // Anywhere in the place's LIDAR square, even outside the loaded window (for big landmarks seen from afar:
      // the piers), with bare-earth heights read from the full square.
      atAny: (lat, lon) => source.toWindow(lat, lon),
      terrainAny: (i, j) => {
        if (!source.data) return ground(i, j);
        const x = Math.round(source.cx - source.span / 2 + (i * source.span) / RES);
        const y = Math.round(source.cy - source.span / 2 + (j * source.span) / RES);
        if (x < 0 || y < 0 || x >= source.size || y >= source.size) return ground(i, j);
        return source.data[y * source.size + x] / 100 - (source.meta.offset ?? 0);
      },
      metres,
      metresPerPixel: span / RES,
      map,
      terrain: ground,
      surface: (i, j) => map.sample(i, j, map.grids.surface),
    };
    const addBuilt = (it) => {
      add(it);
      // A structure may smoke (a chimney, a fire): { count, color, opacity, size } from the top of its model.
      if (it.smoke) emitters.push({ item: it, fx: new Smoke(it.smoke.count ?? 120, it.smoke.color, it.smoke.opacity), size: [it.smoke.size ?? 5, 0.01] });
    };
    yield;
    for (const build of [...(STRUCTURES[source.slug] ?? []), ...(LANDMARKS[source.slug] ?? [])]) {
      const made = build(ctx, source);
      // (A builder may hand back its parts one at a time, a generator: each is built in its own frame.)
      if (!Array.isArray(made) && typeof made?.next === 'function') {
        for (const part of made) {
          for (const it of part) addBuilt(it);
          yield;
        }
      } else for (const it of made) addBuilt(it);
      yield;
    }
    for (const it of splatItems(source, ctx)) add(it);

    const hist = source.history;
    if (hist) {
    // Reconstruction ('then' only). Footprints are traced from the c.1900 OS map; the rest is conjecture.
    let cx = 0;
    let cz = 0;
    let count = 0;
    for (const b of hist.buildings) {
      const pts = b.footprint.map(([lat, lon]) => source.toWindow(lat, lon));
      if (!pts.every(inWindow)) continue;
      const ai = pts.reduce((a, p) => a + p.i, 0) / pts.length;
      const aj = pts.reduce((a, p) => a + p.j, 0) / pts.length;
      const [ax, az] = metres(ai, aj);
      const g0 = ground(ai, aj);
      const heights = pts.map((p) => ground(p.i, p.j) - g0);
      const local = pts.map((p) => {
        const [x, z] = metres(p.i, p.j);
        return [x - ax, z - az];
      });
      const model = { group: building(local, Math.min(...heights) - 1.5, Math.max(...heights) + b.eaves, b.ridge), top: b.eaves + b.ridge };
      add({ i: ai, j: aj, model, era: 'then' });
      cx += ai;
      cz += aj;
      count++;
    }
    for (const k of hist.kilns) {
      const at = source.toWindow(...k.at);
      if (!inWindow(at)) continue;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(k.radius * 0.75, k.radius, k.height, 14), brick);
      body.position.y = k.height / 2;
      const glow = new THREE.Mesh(new THREE.CircleGeometry(k.radius * 0.6, 14), glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = k.height + 0.05;
      g.add(body, glow);
      const item = add({ ...at, model: { group: g, top: k.height }, era: 'then' });
      emitters.push({ item, fx: new Smoke(40), size: [4, 0.008] });
    }
    for (const st of hist.stacks) {
      const at = source.toWindow(...st.at);
      if (!inWindow(at)) continue;
      const item = add({ ...at, model: chimneyModel(st.height), era: 'then' });
      emitters.push({ item, fx: new Smoke(200), size: [7, 0.014] });
    }
    if (hist.flue) {
      // Stone flue hugging the ground, in short sections so it follows the hillside.
      const pts = hist.flue.path.map(([lat, lon]) => source.toWindow(lat, lon));
      if (pts.every(inWindow)) {
        const [ax, az] = metres(pts[0].i, pts[0].j);
        const g0 = ground(pts[0].i, pts[0].j);
        const g = new THREE.Group();
        const box = new THREE.BoxGeometry(hist.flue.width, hist.flue.height, 1);
        for (let k = 1; k < pts.length; k++) {
          const [x0, z0] = metres(pts[k - 1].i, pts[k - 1].j);
          const [x1, z1] = metres(pts[k].i, pts[k].j);
          const len = Math.hypot(x1 - x0, z1 - z0);
          const steps = Math.max(1, Math.round(len / 4));
          for (let s = 0; s < steps; s++) {
            const t = (s + 0.5) / steps;
            const x = x0 + (x1 - x0) * t;
            const z = z0 + (z1 - z0) * t;
            const gi = pts[k - 1].i + (pts[k].i - pts[k - 1].i) * t;
            const gj = pts[k - 1].j + (pts[k].j - pts[k - 1].j) * t;
            const seg = new THREE.Mesh(box, pennant);
            seg.scale.z = (len / steps) * 1.05;
            seg.position.set(x - ax, ground(gi, gj) - g0 + hist.flue.height / 2 - 0.3, z - az);
            seg.rotation.y = Math.atan2(x1 - x0, z1 - z0);
            g.add(seg);
          }
        }
        const mid = pts[Math.floor(pts.length / 2)];
        add({ i: pts[0].i, j: pts[0].j, model: { group: g, top: 0 }, era: 'then', hugsGround: true });
        add({ ...mid, sprite: label(hist.flue.name, '#ffd08a'), era: 'then' });
      }
    }
    if (count) add({ i: cx / count, j: cz / count, sprite: label(`${hist.title} · reconstruction`, '#ffd08a'), lift: 14, era: 'then' });
      }
    this.swapIn(group, items, emitters);
  }

  // Town-wide models (walls, the castle, bridges, ships...) on the table are cut off exactly at the round map's edge
  // by clipping planes round it (a 32-sided polygon), so nothing stands out over the bare table and a wall that
  // crosses the map shows even where it starts off it. At life size the planes come off.
  clipTable(life) {
    const map = this.map;
    const g = map.game;
    if (g?.renderer && !g.renderer.localClippingEnabled) g.renderer.localClippingEnabled = true;
    const want = life ? null : TABLE_CLIP;
    if (!life) {
      // The planes, in world space: the map's circle (radius uHalf about the origin of the map group's frame).
      map.group.updateWorldMatrix(true, false);
      const m = map.group.matrixWorld;
      const r = map.uniforms.uHalf.value - map.uniforms.uEdge.value; // (to where the terrain's faded rim ends)
      for (let n = 0; n < TABLE_CLIP.length; n++) {
        const t = (n / TABLE_CLIP.length) * Math.PI * 2;
        const rim = _q.set(Math.cos(t) * r, 0, Math.sin(t) * r).applyMatrix4(m);
        const centre = _c2.set(0, 0, 0).applyMatrix4(m);
        const nrm = centre.sub(rim).setY(0).normalize();
        TABLE_CLIP[n].setFromNormalAndCoplanarPoint(nrm, rim);
      }
    }
    // Materials are (re)visited when the mode changes and now and then (items are rebuilt as data loads).
    this.clipTick = (this.clipTick ?? 0) + 1;
    if (this.clipLife === life && this.clipTick % 30) return;
    this.clipLife = life;
    // (Every lit material in the town takes the streets' light and shade at life size: shade.js.)
    for (const it of this.items) {
      it.model?.group.traverse((o) => {
        if (o.material) for (const mt of Array.isArray(o.material) ? o.material : [o.material]) shadeMaterial(mt);
      });
    }
    for (const it of this.items) {
      if (!it.far || !it.model) continue;
      it.model.group.traverse((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const mt of mats) if (mt.clippingPlanes !== want) {
          mt.clippingPlanes = want;
          mt.needsUpdate = true;
        }
      });
    }
  }

  // h: map-local units per real metre across, v: per real metre up. scale: the map group's world scale.
  update(dt, h, v, scale, visible) {
    const map = this.map;
    const life = scale > 1.5;
    const k = map.viewScale;
    for (const it of this.items) {
      const x = (it.i / (RES - 1) - 0.5) * map.size;
      const z = (it.j / (RES - 1) - 0.5) * map.size;
      // Things stand on whichever ground is showing: today's surface, or bare earth 'then'.
      // X-ray structures run underground from bare earth; everything else stands on whatever ground is showing.
      const groundY = it.baseAlt != null
        ? (it.baseAlt - map.uniforms.uBase.value) * v // pinned to a known level (e.g. road level for the railway)
        : map.displayY(it.i, it.j, v, h, it.onShown ? map.elev : it.era !== 'both' || it.xray ? map.grids.terrain : map.elev);
      _p.set(x, groundY, z);
      const era = map.era;
      const eraOk = this.eraOk(it);
      // A scan not yet placed shows only when it's the one chosen from the menu.
      const scanOk = (!it.splat || it.placed || map.activeScan === it.name) && (!it.lifeOnly || life);
      const show = visible && eraOk && scanOk && (!it.xray || map.xray) && !(it.tag && this.hiddenTags?.has(it.tag)) && (it.far ? life || map.nearMap(_p) : map.onMap(_p));
      if (!it.stale) it.animate?.(performance.now() / 1000, this.operational); // (stale ones wait, frozen, to be replaced)
      it.build?.(this.buildProgress ?? 1);
      if (it.model) {
        it.model.group.visible = show;
        it.model.group.position.copy(_p);
        // On the table a 16 m chimney would be a millimetre wide: keep a minimum footprint so you can see it.
        // Big structures and reconstructions are always true size; small landmarks get a minimum width.
        const minWidth = life || it.era === 'then' || it.trueSize ? 0 : 0.004 / 2.4 / k;
        // Buildings keep true proportions; only things that hug the hillside take the hills' exaggeration.
        const up = it.hugsGround ? v : h;
        it.adjust?.(v, h);
        it.model.group.scale.set(Math.max(h, minWidth), up, Math.max(h, minWidth));
        it.up = up;
      }
      if (it.sprite) {
        const top = ((it.model ? it.model.top : 0) + (it.lift ?? 0)) * (it.model ? it.up : h);
        it.sprite.visible = show;
        // Labels stay a readable size: about 13 cm on the table, about 12 m across in life size.
        const w = (life ? 12 / scale : 0.13) / k;
        it.sprite.scale.set(w, w * 0.19, 1);
        it.sprite.position.set(x, groundY + top + (life ? 3 / scale : 0.012 / k), z);
      }
    }
    this.clipTable(life);
    for (const em of this.emitters) {
      const m = em.item.model.group;
      const show = visible && this.operational && m.visible;
      em.fx.points.visible = show;
      if (!em.fx.points.parent) this.group.add(em.fx.points);
      if (show) {
        // Smoke takes the time of day's light at life size (dark against a night sky).
        em.base ??= em.fx.material.color.clone();
        const tint = dayUniforms.uDayTint.value;
        em.fx.material.color.copy(em.base);
        if (life) em.fx.material.color.multiply(_c.setRGB(Math.min(1, tint.x), Math.min(1, tint.y), Math.min(1, tint.z)));
        const top = _q.set(m.position.x, m.position.y + em.item.model.top * (em.item.up ?? h), m.position.z);
        // Smoke is drawn at true proportions (not height-exaggerated), and puffs are enlarged on the table.
        // Point sizes are in world units and ignore the groups' scale.
        const hs = Math.max(h, 0.0025 / k);
        em.fx.update(dt, top, hs, hs, life ? em.size[0] : em.size[1]);
      }
    }
  }
}

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _c2 = new THREE.Vector3();
const TABLE_CLIP = Array.from({ length: 32 }, () => new THREE.Plane());
const _c = new THREE.Color();
