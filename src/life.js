import * as THREE from 'three';
import { LIFE_SPAN } from './contour-map.js';
import { RES } from './terrain.js';
import { bearing } from './views.js';
import { dayUniforms } from './daylight.js';
import { updateFog } from './fog.js';

const GROW_TIME = 2.6; // seconds for the table model to swell to life size
const FADE_TIME = 0.6;
const ease = (t) => t * t * (3 - 2 * t);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _w2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0);

function buildSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uSkyTurn: { value: new THREE.Matrix3() }, ...dayUniforms },
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    // The sky for the time of day (daylight.js): zenith, horizon haze and ground colours, a glow round the sun, and
    // stars at night. The sun's direction is in the landscape's frame; the sky turns with it (uSkyTurn).
    fragmentShader: /* glsl */ `
      uniform float uOpacity, uNight;
      uniform vec3 uSkyZenith, uSkyHaze, uSkyGround, uSunDir;
      uniform mat3 uSkyTurn;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(uSkyHaze, uSkyZenith, pow(h, 0.6)) : mix(uSkyHaze, uSkyGround, min(1.0, -h * 6.0));
        vec3 sunDir = normalize(uSkyTurn * uSunDir);
        float toSun = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.75, 0.45) * pow(toSun, 12.0) * 0.35 * (1.0 - uNight);
        col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, toSun) * (1.0 - uNight); // the sun's disc
        // Stars are fixed to the landscape (turning with the thumbstick turns the land round you, and the sky with
        // it), each a small soft dot at a random spot in its cell, so they don't flicker as you look about.
        vec3 sd = transpose(uSkyTurn) * d;
        vec3 g = sd * 90.0;
        vec3 cell = floor(g);
        vec3 spot = cell + 0.25 + 0.5 * vec3(hash(cell + 1.0), hash(cell + 2.0), hash(cell + 5.0));
        float dist = length(g - spot);
        float star = step(0.93, hash(cell)) * smoothstep(0.09, 0.03, dist) * smoothstep(0.0, 0.15, h) * uNight;
        col += vec3(0.85, 0.88, 1.0) * star * (0.4 + 0.6 * hash(cell + 3.0));
        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), material);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.visible = false;
  return sky;
}

// Life size: the table model grows around a chosen spot until it's 1:1 and you're standing on it. While there,
// the real-world point under your feet is tracked (the "anchor"), so walking, turning, teleporting and reloading
// sharper terrain around you never shifts the landscape unexpectedly.
export class Life {
  constructor(game) {
    this.game = game;
    this.map = game.map;
    this.sky = buildSky();
    game.scene.add(this.sky);
    this.state = 'off'; // entering | on | exiting
    this.t = 0;
    this.move = new THREE.Vector2(); // strafe, forward in m/s, set by the input code each frame
    this.groundY = null;
  }

  get active() {
    return this.state !== 'off';
  }

  feet() {
    const h = this.game.head;
    return new THREE.Vector3(h.x, 0, h.z);
  }

  // spot: where to stand, in the map group's frame (from pointing at the table), or null for the named summit.
  enter(spot, face) {
    const map = this.map;
    if (this.active || !map.elev) return;
    let data;
    if (spot) data = map.groupToData(spot.x, spot.z);
    else if (map.landmarkAt) data = { x: (map.landmarkAt.i / (RES - 1) - 0.5) * map.size, z: (map.landmarkAt.j / (RES - 1) - 0.5) * map.size };
    else data = map.groupToData(0, 0);
    const src = map.source;
    const h = map.holder;
    this.saved = {
      view: src.snapshot(), index: map.index, half: map.uniforms.uHalf.value,
      holder: { position: h.position.clone(), rotation: h.rotation.y, scale: h.scale.x },
    };
    this.spotReal = map.dataToReal(data.x, data.z);
    // Fold the table view (zoom, rotation, pan) into the map group so growth starts from exactly what you see.
    map.group.updateMatrixWorld(true);
    h.updateMatrix();
    const m = new THREE.Matrix4().multiplyMatrices(map.group.matrixWorld, h.matrix);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    m.decompose(pos, quat, scl);
    map.group.position.copy(pos);
    map.group.quaternion.copy(quat);
    map.group.scale.setScalar(scl.x);
    map.resetView();
    map.uniforms.uHalf.value = map.size * 0.75; // the whole loaded square, not just the round table view
    this.spot = data;
    this.from = { position: pos.clone(), quaternion: quat.clone(), scale: scl.x };
    // Keep north where it was on the table, but level; or, for a viewpoint, turn so its view is straight ahead.
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.from.quaternion).setY(0).normalize();
    this.q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), fwd);
    if (face != null) this.q = this.facing(face);
    map.group.updateMatrixWorld(true);
    const e = map.standAtLocal(data.x, data.z) ?? map.uniforms.uBase.value;
    const { v } = map.scales();
    this.spotWorld0 = map.group.localToWorld(new THREE.Vector3(data.x, (e - map.uniforms.uBase.value) * v * map.uniforms.uRise.value, data.z));
    this.target = this.feet();
    this.scale = map.span / map.size;
    this.state = 'entering';
    this.t = 0;
    map.mode = 'life';
    map.riseTarget = 1;
    this.sky.visible = true;
    this.game.setFar(9000);
    this.game.ui.showBelt(true);
    this.game.onLife?.(true);
    console.info(`[life] entering at ${map.source.name}, spot ${data.x.toFixed(3)}, ${data.z.toFixed(3)}`);
  }

  // The rotation that puts compass direction `face` (degrees clockwise from north) straight ahead of you.
  facing(face) {
    const cam = this.game.camera;
    const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    const a = THREE.MathUtils.degToRad(face);
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)), ahead);
  }

  // Hop to the next viewpoint without leaving life size.
  nextView() {
    const map = this.map;
    const views = map.views.list;
    if (this.state !== 'on' || !views.length) return;
    map.views.index = (map.views.index + 1) % views.length;
    const view = views[map.views.index];
    // Go to the mapped spot first; once the ground there has loaded, step out of any building or water (onApply).
    const { i, j } = map.source.toWindow(...view.at);
    const real = map.dataToReal((i / 511 - 0.5) * map.size, (j / 511 - 0.5) * map.size);
    this.anchor = { real, world: this.feet() };
    this.pendingView = view;
    this.q = this.facing(bearing(view));
    this.groundY = null;
    map.status = view.name.toUpperCase();
    map.drawSign();
    this.reloadAround(real);
  }

  // Called when new terrain has been applied at life size.
  onApply() {
    const view = this.pendingView;
    if (!view || this.state !== 'on') return;
    this.pendingView = null;
    const map = this.map;
    const spot = map.views.groupSpot(view);
    const d = map.groupToData(spot.x, spot.z);
    this.anchor.real = map.dataToReal(d.x, d.z);
    this.groundY = null;
  }

  exit() {
    if (this.state !== 'on' && this.state !== 'entering') return;
    this.ride = null;
    this.state = 'exiting';
    this.t = 0;
  }

  // Carry you along (a ride): each frame, ride = { real, alt } puts that real-world point (metres) under your feet
  // at that height (metres OD). null to stop and walk again.
  setRide(ride) {
    if (this.state !== 'on') return;
    if (ride) {
      if (!this.ride) this.anchor.world = this.feet();
      this.anchor.real = ride.real;
    } else {
      this.groundY = null;
    }
    this.ride = ride;
  }

  // Put the anchor's real-world point under its world position, ground under your feet.
  applyAnchor(dt) {
    const map = this.map;
    const S = map.span / map.size;
    const local = map.realToData(this.anchor.real);
    const g = map.group;
    g.scale.setScalar(S);
    g.quaternion.copy(this.q);
    _v.set(local.x * S, 0, local.z * S).applyQuaternion(this.q);
    g.position.x = this.anchor.world.x - _v.x;
    g.position.z = this.anchor.world.z - _v.z;
    g.updateMatrixWorld();
    const headLocal = g.worldToLocal(_w.copy(this.game.head));
    // Riding (the Rocks Railway): the car's floor is the ground, with no easing so you move with it.
    if (this.ride) {
      g.position.y = -(this.ride.alt - map.uniforms.uBase.value);
      this.groundY = g.position.y;
      return headLocal;
    }
    const e = map.standAtLocal(headLocal.x, headLocal.z);
    if (e != null) {
      const want = -(e - map.uniforms.uBase.value);
      this.groundY = this.groundY == null ? want : THREE.MathUtils.lerp(this.groundY, want, 1 - Math.exp(-dt * 6));
    }
    if (this.groundY != null) g.position.y = this.groundY;
    return headLocal;
  }

  // Walk, turn and teleport all move the anchor's world position; the landscape follows.
  walk(dt) {
    if (!this.move.lengthSq() || this.ride) return;
    const cam = this.game.camera;
    const fwd = _v.set(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(_q)).setY(0).normalize();
    const right = _w.crossVectors(fwd, Y);
    // The step the landscape takes (the opposite of yours).
    const step = new THREE.Vector3().addScaledVector(fwd, -this.move.y * dt).addScaledVector(right, -this.move.x * dt);
    // Collision: you can't walk into a wall or a building. Look a body's width (35 cm) ahead of where you'd be;
    // if that's blocked, try sliding along it (each of the two directions on its own). Already inside something?
    // Then you can walk out.
    const free = (s) => {
      if (!s.lengthSq()) return false;
      const ahead = this.game.head.clone().sub(s).addScaledVector(s.clone().normalize(), -0.35 * this.scaleNow());
      return !this.blockedWorld(ahead);
    };
    if (this.blockedWorld(this.game.head) || free(step)) this.anchor.world.add(step);
    else {
      const sx = new THREE.Vector3(step.x, 0, 0);
      const sz = new THREE.Vector3(0, 0, step.z);
      if (free(sx)) this.anchor.world.add(sx);
      else if (free(sz)) this.anchor.world.add(sz);
    }
  }

  // World units per real metre at life size.
  scaleNow() {
    const map = this.map;
    return map.group.scale.x * (map.size / map.span) * map.holder.scale.x;
  }

  // Is a world-space point over something solid (see ContourMap.blockedAt)?
  // The window pixel { i, j } under a world point (at life size).
  pixelOf(p) {
    const map = this.map;
    const local = map.group.worldToLocal(_w2.copy(p));
    map.holder.updateMatrix();
    local.applyMatrix4(_m.copy(map.holder.matrix).invert());
    return { i: (local.x / map.size + 0.5) * (RES - 1), j: (local.z / map.size + 0.5) * (RES - 1) };
  }

  blockedWorld(p) {
    const map = this.map;
    if (this.state !== 'on') return false;
    const local = map.group.worldToLocal(_w2.copy(p));
    map.holder.updateMatrix();
    local.applyMatrix4(_m.copy(map.holder.matrix).invert());
    const i = (local.x / map.size + 0.5) * (RES - 1);
    const j = (local.z / map.size + 0.5) * (RES - 1);
    return map.blockedAt(i, j);
  }

  turn(radians) {
    if (this.state !== 'on') return;
    const h = this.feet();
    const r = new THREE.Quaternion().setFromAxisAngle(Y, radians);
    this.anchor.world.sub(h).applyQuaternion(r).add(h);
    this.q.premultiply(r);
  }

  teleport(worldPoint) {
    if (this.state !== 'on' || this.ride) return;
    this.anchor.world.x += this.game.head.x - worldPoint.x;
    this.anchor.world.z += this.game.head.z - worldPoint.z;
    this.groundY = null;
  }

  // Where a ray first meets the ground, by stepping along it.
  rayGround(origin, dir) {
    const map = this.map;
    if (this.state !== 'on') return null;
    for (let t = 0.3; t < 600; t += 0.4 + t * 0.02) {
      const p = _v.copy(origin).addScaledVector(dir, t);
      const local = map.group.worldToLocal(_w.copy(p));
      const e = map.elevationAtLocal(local.x, local.z);
      if (e == null) continue;
      if (p.y <= map.group.position.y + (e - map.uniforms.uBase.value)) return p.clone();
    }
    return null;
  }

  reloadAround(real) {
    const map = this.map;
    const src = map.source;
    const before = [src.zoom, src.cx, src.cy];
    src.zoomToSpan(LIFE_SPAN); // zoom first: re-centring is clamped to what the current zoom allows
    src.centreOn(real);
    // Near the edge of the place's square the patch can't be centred on you (it's held inside the square): if it
    // wouldn't move, don't reload (it used to reload over and over there, rebuilding everything each time).
    if (map.grids && src.zoom === before[0] && Math.hypot(src.cx - before[1], src.cy - before[2]) < 1) return;
    map.load();
  }

  update(dt) {
    const map = this.map;
    const head = this.game.head;
    updateFog(this.game.scene, this.state === 'on' ? this.scaleNow() : null);
    this.sky.position.copy(head);
    // The sun's direction is given in the landscape's own frame: turn it as the landscape is turned.
    if (map.mesh) this.sky.material.uniforms.uSkyTurn.value.setFromMatrix4(_m.extractRotation(map.mesh.matrixWorld));
    if (this.state === 'entering') {
      this.t = Math.min(1, this.t + dt / GROW_TIME);
      const e = ease(this.t);
      map.lifeT = e;
      const S = Math.exp(THREE.MathUtils.lerp(Math.log(this.from.scale), Math.log(this.scale), e));
      const Q = _q.copy(this.from.quaternion).slerp(this.q, e);
      const elevSpot = map.standAtLocal(this.spot.x, this.spot.z) ?? map.uniforms.uBase.value;
      const { v } = map.scales();
      const L = _v.set(this.spot.x, (elevSpot - map.uniforms.uBase.value) * v, this.spot.z).multiplyScalar(S).applyQuaternion(Q);
      const W = _w.copy(this.spotWorld0).lerp(this.target, e);
      map.group.scale.setScalar(S);
      map.group.quaternion.copy(Q);
      map.group.position.copy(W).sub(L);
      this.sky.material.uniforms.uOpacity.value = e;
      if (this.t >= 1) {
        this.state = 'on';
        this.anchor = { real: this.spotReal, world: this.target.clone() };
        this.groundY = null;
        this.reloadAround(this.spotReal);
      }
    } else if (this.state === 'on') {
      this.walk(dt);
      const headLocal = this.applyAnchor(dt);
      // Walked far from the middle of the loaded terrain: load a fresh patch centred on you.
      const off = Math.hypot(headLocal.x - map.holder.position.x, headLocal.z - map.holder.position.z);
      if (off > map.size * 0.28 && !map.loading) this.reloadAround(map.dataToReal(headLocal.x, headLocal.z));
    } else if (this.state === 'exiting') {
      this.t = Math.min(1, this.t + dt / FADE_TIME);
      map.uniforms.uOpacity.value = 1 - this.t;
      this.sky.material.uniforms.uOpacity.value = 1 - this.t;
      if (this.t >= 1) this.finishExit();
    }
  }

  finishExit() {
    const map = this.map;
    this.state = 'off';
    map.mode = 'table';
    map.lifeT = 0;
    map.group.scale.setScalar(1);
    map.group.position.copy(map.tablePose.position);
    map.group.quaternion.copy(map.tablePose.quaternion);
    map.source.restore(this.saved.view);
    const sh = this.saved.holder;
    map.setView(sh.position.x, sh.position.z, sh.rotation, sh.scale);
    map.uniforms.uHalf.value = this.saved.half;
    map.uniforms.uOpacity.value = 1;
    this.sky.visible = false;
    this.game.setFar(50);
    this.game.ui.showBelt(false);
    this.game.onLife?.(false);
    map.load();
  }
}
