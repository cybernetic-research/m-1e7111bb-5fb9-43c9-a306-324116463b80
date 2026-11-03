import * as THREE from 'three';
import { puff, Effects, rand } from './scenarios.js';

// Filton: Concorde's first British flight (1969) and the last Concorde flight of all (2003).
// Sources: Wikipedia (Concorde; Filton Airport). Concorde: 61.66 m long, 25.6 m span, 12.2 m tall; the nose drooped
// 5° for take-off and 12.5° for landing. Runway 09/27: 2,467 m by 91 m, along OSM's disused runway (now partly
// built over by Brabazon). Crowds, timings and the flight path are illustrative.

// Runway centre line, west to east.
export const RUNWAY = [[51.5199, -2.6066], [51.5196, -2.5712]];
const WHITE = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.4, metalness: 0.1 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.6 });

// An original model of the Concorde airframe: fuselage, ogival delta wing, fin, four engines, drooping nose.
// +x is forward; origin at the main gear, on the ground.
export function concorde() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 3.6;
  g.add(body);
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 46, 16), WHITE);
  fuselage.rotation.z = Math.PI / 2;
  fuselage.position.x = 0;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.45, 7, 16), WHITE);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -26.5;
  body.add(fuselage, tail);
  // The droop nose hinges just ahead of the cockpit.
  const hinge = new THREE.Group();
  hinge.position.set(23, 0, 0);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.45, 9, 16), WHITE);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 4.5;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.6), DARK);
  visor.position.set(-0.8, 1.2, 0);
  hinge.add(nose, visor);
  body.add(hinge);
  // Ogival delta wing in plan (x forward, z out to the right), mirrored.
  const half = [[10, 0], [4, 2.2], [-4, 5.5], [-12, 9.5], [-20, 12.8], [-23.5, 12.8], [-25.5, 0]];
  const shape = new THREE.Shape([...half, ...half.slice(1, -1).reverse().map(([x, z]) => [x, -z])].map(([x, z]) => new THREE.Vector2(x, z)));
  const wing = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }), WHITE);
  wing.rotation.x = Math.PI / 2;
  wing.position.y = -0.6;
  body.add(wing);
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([[-15, 0], [-27, 0], [-29.5, 8.6], [-25, 8.6]].map(([x, y]) => new THREE.Vector2(x, y))),
    { depth: 0.4, bevelEnabled: false }), WHITE);
  fin.position.set(0, 1.2, -0.2);
  body.add(fin);
  const glows = [];
  for (const z of [-6.2, -3.6, 3.6, 6.2]) {
    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(11, 1.3, 1.5), WHITE);
    nacelle.position.set(-17, -1.4, z);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 12), new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 0 }));
    glow.rotation.y = -Math.PI / 2;
    glow.position.set(-22.6, -1.4, z);
    body.add(nacelle, glow);
    glows.push(glow);
  }
  // Undercarriage (hidden in flight).
  const gear = new THREE.Group();
  for (const [x, z] of [[0, -3.8], [0, 3.8], [18, 0]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3.4, 6), DARK);
    leg.position.set(x, 1.7, z);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.6, 12), DARK);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.6, z);
    gear.add(leg, wheel);
  }
  g.add(gear);
  return { group: g, body, hinge, gear, glows };
}

// The runway as it was: a dark strip 91 m wide, painted onto the ground (so it follows the exaggerated relief),
// with a white centre line.
function runwayStrip(ctx) {
  const [we, wn] = ctx.en(...RUNWAY[0]);
  const [ee, en] = ctx.en(...RUNWAY[1]);
  const len = Math.hypot(ee - we, en - wn);
  const half = 45.5 / 111320;
  const centre = 0.6 / 111320;
  const [[la, lo], [lb, lob]] = RUNWAY;
  ctx.map.overlayExtras = [
    { color: 'rgba(70,72,76,0.97)', poly: [[la + half, lo], [lb + half, lob], [lb - half, lob], [la - half, lo]] },
    { color: 'rgba(240,240,240,0.9)', poly: [[la + centre, lo + 0.0005], [lb + centre, lob - 0.0005], [lb - centre, lob - 0.0005], [la - centre, lo + 0.0005]] },
  ];
  ctx.map.refreshOverlay();
  return { heading: Math.atan2(en - wn, ee - we), len, we, wn, ee, en };
}

function crowdAlong(ctx, root, along, count) {
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.25, 1.0, 3, 6), new THREE.MeshStandardMaterial({ roughness: 0.9 }), count);
  const colours = [0x2f3d5a, 0x5a2f2f, 0x3d5a3a, 0x8a7a5a, 0x4a4a4a, 0x6a3a5a].map((c) => new THREE.Color(c));
  for (let k = 0; k < count; k++) body.setColorAt(k, colours[k % colours.length]);
  root.add(body);
  const spots = Array.from({ length: count }, () => along(Math.random(), rand(0, 1)));
  return { body, spots };
}

class FiltonScene {
  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    ctx.map.gridOverride = 'terrain'; // the airfield before Brabazon's houses
    ctx.map.showGrid();
    this.runway = runwayStrip(ctx);
    this.plane = concorde();
    root.add(this.plane.group);
    // Spectators along the north side of the runway, near the middle.
    const r = this.runway;
    const nx = -Math.sin(r.heading);
    const ny = Math.cos(r.heading);
    this.crowd = crowdAlong(ctx, root, (f, d) => [r.we + (r.ee - r.we) * (0.3 + f * 0.4) + nx * (70 + d * 25), r.wn + (r.en - r.wn) * (0.3 + f * 0.4) + ny * (70 + d * 25)], 500);
    this.tmp = new THREE.Object3D();
  }

  placeStatic() {
    const ctx = this.ctx;
    const tmp = this.tmp;
    this.root.add(tmp);
    const s = Math.max(ctx.scaleTrue(), ctx.minSize(2) * 0.25);
    this.crowd.spots.forEach(([e, n], k) => {
      ctx.place(tmp, e, n, ctx.groundAlt(e, n) + 0.75);
      tmp.scale.setScalar(s);
      tmp.updateMatrix();
      this.crowd.body.setMatrixAt(k, tmp.matrix);
    });
    this.root.remove(tmp);
    this.crowd.body.instanceMatrix.needsUpdate = true;
  }

  // Put the aircraft at a point along the runway line (metres from the west end; may run past either end), height
  // above the runway, pitch, and heading sign (+1 flying east).
  placePlane(dist, height, pitch, dir) {
    const ctx = this.ctx;
    const r = this.runway;
    const c = Math.cos(r.heading);
    const s = Math.sin(r.heading);
    const e = r.we + c * dist;
    const n = r.wn + s * dist;
    const ground = ctx.groundAlt(Math.min(Math.max(e, Math.min(r.we, r.ee)), Math.max(r.we, r.ee)), n);
    const g = this.plane.group;
    ctx.place(g, e, n, ground + height);
    g.scale.setScalar(Math.max(ctx.scaleTrue(), ctx.minSize(62) * 1.7)); // at least ~5 cm long on the table
    g.rotation.set(0, r.heading + (dir < 0 ? Math.PI : 0), 0);
    this.plane.body.rotation.z = pitch;
    this.plane.gear.visible = height < 40;
    return { e, n, alt: ground + height };
  }

  trail(at, thrust) {
    const ctx = this.ctx;
    for (const glow of this.plane.glows) glow.material.opacity = thrust;
    if (thrust > 0.2 && (this.trailT = (this.trailT ?? 0) - 0.016) <= 0) {
      this.trailT = 0.1;
      this.fx.burst(ctx, at.e, at.n, at.alt, { flash: 0xffa050, smoke: 0x8a8580, size: 14, life: 5 });
    }
  }

  stop() {
    this.fx.clear();
    this.roar?.stop?.();
  }
}

export class FirstFlight1969 extends FiltonScene {
  static title = 'Concorde 002 takes off from Filton, 9 April 1969';
  static caption = 'The first British-built Concorde flew from Filton to RAF Fairford, piloted by Brian Trubshaw. Thousands of people watched; the crowd, timing and climb-out here are illustrative.';

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    this.placeStatic();
    const len = this.runway.len;
    // Hold, roll (accelerating), rotate at ~70% of the runway, climb away east and up.
    const roll = Math.max(0, t - 4);
    const dist = 80 + 0.5 * 4.5 * roll * roll;
    const lift = Math.max(0, dist - len * 0.7);
    const height = lift > 0 ? lift * 0.18 + lift * lift * 0.00006 : 0;
    this.plane.hinge.rotation.z = -THREE.MathUtils.degToRad(height > 400 ? 0 : 5);
    const at = this.placePlane(dist, height, lift > 0 ? Math.min(0.24, lift * 0.002) : 0, 1);
    const thrust = t > 4 ? 1 : t > 2 ? 0.4 : 0;
    this.trail(at, height < 1500 ? thrust : 0);
    if (t > 4 && !this.roared) {
      this.roared = true;
      ctx.audio.noise(30, { gain: 0.9, f0: 900, f1: 300, type: 'lowpass' });
      ctx.audio.tone(70, 55, 30, { type: 'sawtooth', gain: 0.25 });
    }
    this.fx.update(dt);
    return t < 32;
  }
}

export class LastLanding2003 extends FiltonScene {
  static title = "The last Concorde flight lands at Filton, 26 November 2003";
  static caption = "Concorde's final flight ended here at Filton, where the British aircraft had been built; G-BOAF stays on, now displayed at Aerospace Bristol (opened 2017). The approach and crowd here are illustrative.";

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    this.placeStatic();
    const len = this.runway.len;
    // Approach from the west on a 3° glide path, nose drooped 12.5°, touch down, roll out.
    // About 85 m/s on the approach; braking only once the wheels are down.
    const speed = this.touched ? Math.max(4, 85 - (t - this.touchT) * 7) : 85;
    this.dist = (this.dist ?? -1700) + speed * dt;
    const touchdown = 350;
    const height = Math.max(0, (touchdown - this.dist) * Math.tan(THREE.MathUtils.degToRad(3)));
    this.plane.hinge.rotation.z = -THREE.MathUtils.degToRad(12.5);
    const flare = height < 15 && height > 0 ? 0.12 : height > 0 ? 0.08 : 0.05 * Math.max(0, 1 - (t - (this.touchT ?? t)) / 2);
    const at = this.placePlane(Math.min(this.dist, len * 0.8), height, flare, 1);
    if (height === 0 && !this.touched) {
      this.touched = true;
      this.touchT = t;
      this.fx.burst(ctx, at.e, at.n, at.alt + 1, { flash: 0x000000, smoke: 0xd8d4cc, size: 10, life: 3 });
      ctx.audio.noise(1.5, { gain: 0.6, f0: 2000, f1: 200 });
    }
    if (!this.roared) {
      this.roared = true;
      ctx.audio.noise(26, { gain: 0.6, f0: 700, f1: 200, type: 'lowpass' });
    }
    for (const glow of this.plane.glows) glow.material.opacity = height > 0 ? 0.25 : 0;
    this.fx.update(dt);
    return t < 44;
  }
}
