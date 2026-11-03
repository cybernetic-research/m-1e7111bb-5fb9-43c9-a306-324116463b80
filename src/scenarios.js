import * as THREE from 'three';

// Dramatised "what it might have been like" scenes. They are illustrations, not reconstructions of specific events,
// and each says so on screen. Everything is laid out in real metres around an anchor and placed through `ctx`:
//   ctx.place(obj, eastM, northM, altitudeM)  positions obj (true scale) at a real-world spot above sea level
//   ctx.sea                                   sea level is altitude 0
//   ctx.audioPos(obj)                         that object's position relative to you, in real metres, for sound
//   ctx.minSize(metres)                       on the table, the scale that keeps a thing at least a few cm across

const _v = new THREE.Vector3();
export const rand = (a, b) => a + Math.random() * (b - a);

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
export const DOT = softDot();

// A short-lived glowing or smoky blob (flak burst, muzzle flash, splash spray).
export function puff(color, opacity, additive) {
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: DOT, color, transparent: true, opacity, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
}

// Generic twin-engine bomber, about 22 m span. Black crosses on the wings; no other markings.
function bomber() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x5b6150, roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb8c8, roughness: 0.2, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 16, 10), grey);
  body.rotation.z = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 8;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 22), grey);
  wing.position.x = 1.5;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 7), grey);
  tail.position.x = -7;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.2), grey);
  fin.position.set(-7.2, 1.5, 0);
  g.add(body, nose, wing, tail, fin);
  const props = [];
  for (const z of [-4.5, 4.5]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.6, 4, 8), grey);
    nacelle.rotation.z = Math.PI / 2;
    nacelle.position.set(3, -0.2, z);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.4, 0.25), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    prop.position.set(5.1, -0.2, z);
    g.add(nacelle, prop);
    props.push(prop);
  }
  const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const z of [-7.5, 7.5]) {
    for (const [w, d] of [[2.4, 0.5], [0.5, 2.4]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.32, d), black);
      bar.position.set(1.5, 0.02, z);
      g.add(bar);
    }
  }
  return { group: g, props };
}

// Generic Second World War U-boat, about 67 m long: hull, deck casing and conning tower.
function uboat() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x5d646a, roughness: 0.6 });
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(3, 58, 6, 12), grey);
  hull.rotation.z = Math.PI / 2;
  hull.scale.set(1, 1, 0.9);
  const casing = new THREE.Mesh(new THREE.BoxGeometry(50, 1, 3.5), grey);
  casing.position.y = 2.8;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 3), grey);
  tower.position.set(2, 5, 0);
  g.add(hull, casing, tower);
  return { group: g, top: 7 };
}

// Shared bits: searchlight beams, flying shells, bursts that flash then hang as smoke.
export class Effects {
  constructor(root) {
    this.root = root;
    this.fx = [];
  }

  burst(ctx, east, north, alt, { flash = 0xffd27a, smoke = 0x2a2a2a, size = 18, life = 6 } = {}) {
    const f = puff(flash, 1, true);
    const s = puff(smoke, 0.75, false);
    this.root.add(f, s);
    let t = 0;
    this.fx.push((dt) => {
      t += dt;
      ctx.place(f, east, north, alt);
      ctx.place(s, east, north, alt + t * 1.5);
      const k = ctx.minSize(size);
      f.scale.setScalar(size * k * (t < 0.15 ? 1.4 : 0));
      s.scale.setScalar(size * k * Math.min(1, 0.4 + t * 1.5));
      s.material.opacity = 0.75 * Math.max(0, 1 - t / life);
      if (t < life) return true;
      this.root.remove(f, s);
      return false;
    });
  }

  update(dt) {
    this.fx = this.fx.filter((f) => f(dt));
  }

  clear() {
    this.root.clear();
    this.fx = [];
  }
}

// --- Clifton: an air raid over the gorge, 1940-41 (dramatised) ---
export class AirRaid {
  static title = 'Air raid over the gorge, 1940 (dramatisation)';
  static caption = 'Bristol was bombed many times in 1940–41. This is an illustration of a raid, not a record of a particular one.';

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    this.plane = bomber();
    root.add(this.plane.group);
    // Searchlights on the downs and in Leigh Woods (positions illustrative).
    this.lights = [[-260, 220], [-300, -160], [240, 280]].map(([e, n]) => {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(6, 0.8, 1, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.geometry.translate(0, 0.5, 0);
      root.add(beam);
      return { beam, e, n };
    });
    this.nextFlak = 3;
    this.hitT = null;
    this.trail = [];
    ctx.audio.siren(10);
    this.engine = ctx.audio.engine();
  }

  // The plane runs north-east over the gorge in a low pass at 400 m, 75 m/s, from 2 km out to 2 km beyond.
  planeAt(t) {
    const d = -2000 + 75 * (t - 6);
    const dir = [0.78, 0.62];
    return [dir[0] * d, dir[1] * d, 400];
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    const [e, n, alt] = this.planeAt(t);
    const p = this.plane.group;
    ctx.place(p, e, n, alt);
    p.scale.setScalar(ctx.minSize(22));
    p.rotation.y = Math.atan2(0.62, 0.78); // heading north-east (map north is -z)
    for (const prop of this.plane.props) prop.rotation.x += dt * 60;
    this.engine.move(ctx.audioPos(p));

    for (const l of this.lights) {
      ctx.place(l.beam, l.e, l.n, ctx.groundAlt(l.e, l.n));
      const from = l.beam.position.clone();
      _v.copy(p.position).sub(from);
      const len = _v.length();
      const w = ctx.minSize(200); // true width at life size, a thin pencil of light on the table
      l.beam.scale.set(w, len, w);
      l.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v.normalize());
    }

    // Flak bursts around (and mostly behind) the plane once it's within range.
    if (Math.abs(e) < 1500 && (this.nextFlak -= dt) <= 0) {
      this.nextFlak = rand(0.25, 0.7);
      const be = e + rand(-90, 60);
      const bn = n + rand(-90, 60);
      const ba = alt + rand(-60, 80);
      this.fx.burst(ctx, be, bn, ba);
      const ap = ctx.audioPosAt(be, bn, ba);
      ctx.audio.flak(ap, ap.length());
      if (this.hitT == null && t > 26 && Math.random() < 0.15) this.hitT = t;
    }
    // Hit: one engine trails smoke for the rest of the run.
    if (this.hitT != null && (this.trailT = (this.trailT ?? 0) - dt) <= 0) {
      this.trailT = 0.12;
      this.fx.burst(ctx, e - 6, n - 4, alt, { flash: 0x000000, smoke: 0x1a1a1a, size: 10, life: 8 });
    }
    this.fx.update(dt);
    return t < 70;
  }

  stop() {
    this.engine.stop();
    this.fx.clear();
    this.ctx.audio.allClear();
  }
}

// --- Brean Down: what if a U-boat surfaced off the fort? (imagined) ---
export class UboatAttack {
  static title = 'What if: a U-boat off Brean Down (dramatisation)';
  static caption = "Brean Down Fort guarded the Bristol Channel, and was re-armed in the Second World War. This engagement is imagined.";

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    this.sub = uboat();
    root.add(this.sub.group);
    // Positions in metres from the fort: close inshore, so it can be seen from the ramparts.
    this.boat = [180, 380];
    this.shells = [];
    this.nextShot = 9;
    this.shots = 0;
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    // Surface from t=2..8, sit on the surface, dive from t=34.
    const depth = t < 2 ? -9 : t < 8 ? -9 + (t - 2) * 1.5 : t < 34 ? 0 : -(t - 34) * 0.9;
    const drift = t * 2.5;
    ctx.placeOnWater(this.sub.group, this.boat[0] + drift, this.boat[1], depth);
    this.sub.group.scale.setScalar(ctx.minSize(67));
    this.sub.group.rotation.y = 0.3;
    this.sub.group.visible = depth > -8;

    // The fort fires every few seconds once the boat is up; shells take ~3 s to arrive.
    if (t > 9 && t < 34 && (this.nextShot -= dt) <= 0) {
      this.nextShot = rand(3, 4.5);
      this.shots++;
      this.fx.burst(ctx, rand(-10, 10), rand(-10, 10), ctx.groundAlt(0, 0) + 4, { flash: 0xffe0a0, smoke: 0x8a8580, size: 26, life: 4 });
      const ap = ctx.audioPosAt(0, 0, ctx.groundAlt(0, 0));
      ctx.audio.gun(ap, ap.length());
      const target = [this.boat[0] + drift + 3 * 2.5 + rand(-60, 60), this.boat[1] + rand(-70, 70)];
      const shell = puff(0xffd080, 1, true);
      this.root.add(shell);
      this.shells.push({ shell, from: [0, 0, ctx.groundAlt(0, 0) + 6], to: target, t: 0 });
    }
    this.shells = this.shells.filter((s) => {
      s.t += dt / 3;
      const k = Math.min(1, s.t);
      const e = s.from[0] + (s.to[0] - s.from[0]) * k;
      const n = s.from[1] + (s.to[1] - s.from[1]) * k;
      const a = s.from[2] * (1 - k) + 90 * Math.sin(Math.PI * k);
      ctx.place(s.shell, e, n, a);
      s.shell.scale.setScalar(ctx.minSize(6) * 6);
      if (k < 1) return true;
      this.root.remove(s.shell);
      // Splash: a tall white column that slumps back into the sea.
      this.fx.burst(ctx, e, n, (ctx.tide ?? ctx.groundAlt(e, n)) + 15, { flash: 0xffffff, smoke: 0xe8f0f4, size: 30, life: 3 });
      const ap = ctx.audioPosAt(e, n, 0);
      ctx.audio.splash(ap, ap.length());
      this.splashes = (this.splashes ?? 0) + 1;
      return false;
    });
    this.fx.update(dt);
    return t < 46;
  }

  stop() {
    this.fx.clear();
  }
}


// Runs one scene at a time inside the map, providing the real-world-to-map conversions the scenes use.
// The registry (src/registry.js) lists each place's scenes; SCENE plays them in turn.
export class ScenarioPlayer {
  constructor(map, audio) {
    this.map = map;
    this.audio = audio;
    this.root = new THREE.Group();
    map.holder.add(this.root);
    this.scene = null;
    this.registry = {};
    this.next = 0;
    this.scales = { h: 1, v: 1, world: 1 };
  }

  get running() {
    return !!this.scene;
  }

  reset() {
    this.stop();
    this.next = 0;
  }

  // Play the place's scene with this class name (from the time machine menu).
  startNamed(name) {
    const list = this.registry[this.map.source.slug] ?? [];
    const k = list.findIndex((d) => d.Scene.name === name);
    if (k < 0) return null;
    this.next = k;
    return this.start();
  }

  start() {
    const map = this.map;
    const list = this.registry[map.source.slug];
    if (!list?.length || !map.grids) return null;
    this.stop();
    const def = list[this.next++ % list.length];
    this.def = def;
    this.reanchor();
    this.scene = new def.Scene(this.context(def), this.root);
    console.info(`[scenario] ${def.Scene.title}`);
    return def.Scene;
  }

  // The anchor is in the loaded window's frame, so it moves whenever new terrain is fetched (zoom, pan, life size).
  reanchor() {
    if (!this.def) return;
    const map = this.map;
    const w = map.source.toWindow(...this.def.anchor);
    this.anchor = { x: (w.i / (map.RES - 1) - 0.5) * map.size, z: (w.j / (map.RES - 1) - 0.5) * map.size };
  }

  stop() {
    this.scene?.stop();
    this.scene = null;
    this.root.clear();
    // Undo anything a scene changed on the map.
    const map = this.map;
    map.features.buildProgress = 1;
    map.features.hiddenTags = null;
    if (map.overlayExtras) {
      map.overlayExtras = null;
      map.refreshOverlay();
    }
    map.hideSea = false;
    if (map.gridOverride) {
      map.gridOverride = null;
      map.showGrid();
    }
  }

  context(def) {
    const map = this.map;
    const self = this;
    const [lat0, lon0] = def.anchor;
    const toLocal = (east, north) => ({ x: self.anchor.x + east * self.scales.h, z: self.anchor.z - north * self.scales.h });
    const ij = (x, z) => [(x / map.size + 0.5) * (map.RES - 1), (z / map.size + 0.5) * (map.RES - 1)];
    const tmp = new THREE.Object3D();
    const ctx = {
      audio: this.audio,
      map,
      opts: def.opts ?? {},
      get tide() {
        return map.waterNow();
      },
      // A lat/lon as metres east/north of this scene's anchor.
      en(lat, lon) {
        return [(lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180), (lat - lat0) * 111320];
      },
      surfaceAlt(east, north) {
        const { x, z } = toLocal(east, north);
        const [i, j] = ij(x, z);
        return map.sample(i, j, map.grids.surface);
      },
      // The anchor as metres east/south of the loaded window's centre (for scenes that pick grid cells).
      get anchorMetres() {
        const k = map.span / map.size;
        return [self.anchor.x * k, self.anchor.z * k];
      },
      // Map units per real metre (true scale, no minimum).
      scaleTrue() {
        return self.scales.h;
      },
      // Shake the whole model (earthquakes, blasts): `metres` of real-world jolt.
      shake(metres) {
        const k = metres * self.scales.h * self.scales.world;
        map.group.position.x += rand(-k, k);
        map.group.position.y += rand(-k, k) * 0.5;
        map.group.position.z += rand(-k, k);
      },
      groundAlt(east, north) {
        const { x, z } = toLocal(east, north);
        const [i, j] = ij(x, z);
        return map.sample(i, j, map.grids.terrain);
      },
      place(obj, east, north, alt) {
        const { x, z } = toLocal(east, north);
        const [i, j] = ij(x, z);
        const ground = map.sample(i, j, map.grids.terrain);
        const groundY = map.displayY(i, j, self.scales.v, self.scales.h, map.grids.terrain);
        obj.position.set(x, groundY + (alt - ground) * self.scales.h, z);
        obj.visible = map.onMap(obj.position) || map.lifeT > 0;
      },
      // On the water as it appears in the LIDAR (the sea surface and mudflats sit a few metres above 0 m).
      placeOnWater(obj, east, north, aboveSurface) {
        const { x, z } = toLocal(east, north);
        const [i, j] = ij(x, z);
        const water = map.seaY(self.scales.v) ?? map.displayY(i, j, self.scales.v, self.scales.h);
        obj.position.set(x, water + aboveSurface * self.scales.h, z);
        obj.visible = map.onMap(obj.position) || map.lifeT > 0;
      },
      // Scale for something `metres` across: true size, but at least ~3 cm on the table so you can see it.
      minSize(metres) {
        return Math.max(self.scales.h, 0.03 / (metres * self.scales.world));
      },
      // Where something is relative to you, in real metres (for sound), whatever the map's scale.
      audioPos(obj) {
        obj.getWorldPosition(_v).sub(map.game.head).divideScalar(self.scales.world * self.scales.h);
        return _v.clone();
      },
      audioPosAt(east, north, alt) {
        self.root.add(tmp);
        ctx.place(tmp, east, north, alt);
        tmp.updateWorldMatrix(true, false);
        const p = ctx.audioPos(tmp);
        self.root.remove(tmp);
        return p;
      },
    };
    return ctx;
  }

  // world: how many world metres one map unit is (view zoom x life-size growth).
  update(dt, h, v, world) {
    this.scales = { h, v, world };
    if (this.scene && !this.scene.update(dt)) this.stop();
  }
}
