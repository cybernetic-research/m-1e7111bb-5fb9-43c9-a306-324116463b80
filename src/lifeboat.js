import * as THREE from 'three';
import { hullGeometry } from './ssgb.js';
import { Effects } from './scenarios.js';

// Weston-super-Mare's lifeboat on Birnbeck Island (Wikipedia: the RNLI station there opened in 1882; lifeboats
// launched down a long slipway from the island until the pier's decay forced a move in the 2010s). The crew were
// called by maroons (signal rockets) and ran out along the pier. The boathouse, the slipway's line and length, and
// the boat (a generic, original slipway lifeboat) are approximate.

const SLIP_TOP = [51.35840, -3.00010];
const SLIP_BEARING = 330; // down the slipway, into the Channel
const SLIP_LEN = 90;
const SLIP_TOP_ALT = 9;
const SLIP_END_ALT = -3;
const PIER = [[51.356481, -2.994502], [51.357867, -2.99876]]; // shore to island

const rad = (d) => (d * Math.PI) / 180;
const concrete = new THREE.MeshStandardMaterial({ color: 0x8e8b84, roughness: 0.95 });
const timber = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 });
const brick = new THREE.MeshStandardMaterial({ color: 0xa65a40, roughness: 0.85 });
const slate = new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.7 });
const navy = new THREE.MeshStandardMaterial({ color: 0x1b2a55, roughness: 0.5 });
const orange = new THREE.MeshStandardMaterial({ color: 0xf26a1b, roughness: 0.5 });
const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.2, metalness: 0.3 });

// The boathouse and slipway, as a structure on the island.
export function lifeboatStation(ctx) {
  const top = (ctx.atAny ?? ctx.at)(...SLIP_TOP);
  if (!top) return [];
  const g = new THREE.Group();
  const along = new THREE.Group(); // +x down the slipway; y is metres OD
  // Map frame: east +x, north -z. Bearing b (clockwise from north) -> direction (sin b, -cos b) in x, z.
  along.rotation.y = -Math.atan2(-Math.cos(rad(SLIP_BEARING)), Math.sin(rad(SLIP_BEARING)));
  g.add(along);
  const drop = SLIP_TOP_ALT - SLIP_END_ALT;
  const slope = Math.atan2(drop, SLIP_LEN);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(SLIP_LEN, drop), 0.5, 4.5), timber);
  ramp.rotation.z = -slope;
  ramp.position.set(SLIP_LEN / 2, (SLIP_TOP_ALT + SLIP_END_ALT) / 2, 0);
  along.add(ramp);
  // Piles under it, down to the rock.
  for (let x = 6; x < SLIP_LEN; x += 8) {
    const deck = SLIP_TOP_ALT - (x / SLIP_LEN) * drop;
    for (const z of [-1.8, 1.8]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, deck + 8, 6), timber);
      pile.position.set(x, (deck - 8) / 2, z);
      along.add(pile);
    }
  }
  // The boathouse at the top, its doors facing down the slipway.
  const house = new THREE.Mesh(new THREE.BoxGeometry(22, 9, 9), brick);
  house.position.set(-11, SLIP_TOP_ALT + 4.5, 0);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 6.6, 22.4, 4, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 4), slate);
  roof.scale.set(1, 0.55, 1);
  roof.position.set(-11, SLIP_TOP_ALT + 9 + 1.6, 0);
  const doors = new THREE.Mesh(new THREE.PlaneGeometry(6, 7), new THREE.MeshStandardMaterial({ color: 0x1f3d6e, roughness: 0.6, side: THREE.DoubleSide }));
  doors.rotation.y = Math.PI / 2;
  doors.position.set(0.05, SLIP_TOP_ALT + 3.5, 0);
  along.add(house, roof, doors);
  return [{ ...top, model: { group: g, top: 14 }, era: 'both', trueSize: true, baseAlt: 0, far: true }];
}

// A slipway lifeboat (original design): navy hull, orange wheelhouse with windows, a short mast. +x forward.
function lifeboat() {
  const g = new THREE.Group();
  const { hull, deck } = hullGeometry({
    L: 15, B: 5, draught: 1.3, freeboard: 1.8, sheer: 0.8, bowLen: 0.35, sternLen: 0.1,
    paint: (x, y) => (y < -0.4 ? 0xb03a2e : 0x1b2a55),
  });
  g.add(new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide })), new THREE.Mesh(deck, navy));
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 3.8), orange);
  cabin.position.set(-0.5, 3, 0);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 3.2), orange);
  upper.position.set(-1, 4.9, 0);
  g.add(cabin, upper);
  for (const z of [-1.92, 1.92]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.8, 0.05), glass);
    win.position.set(-0.4, 3.4, z);
    g.add(win);
  }
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 2.8), glass);
  screen.position.set(0.52, 5, 0);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.5, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
  mast.position.set(-1.4, 7.3, 0);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0x6fb0ff }));
  lamp.position.set(-1.4, 9.1, 0);
  g.add(screen, mast, lamp);
  return { g, lamp };
}

// A crew member in yellow waterproofs.
function crewMember() {
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c418, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 3, 8), yellow);
  body.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc89a78 }));
  head.position.y = 1.65;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.35), new THREE.MeshStandardMaterial({ color: 0x24262a }));
  legs.position.y = 0.3;
  g.add(body, head, legs);
  return g;
}

export class LifeboatLaunch {
  static title = 'Maroons! The lifeboat launches from Birnbeck';
  static caption = "Weston's lifeboat was kept on Birnbeck Island from 1882. When a call came, maroons (signal rockets) were fired, the crew ran out along the pier, and the boat ran down the long slipway into the Channel. The boat, crew and timings here are illustrative.";

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    this.boat = lifeboat();
    root.add(this.boat.g);
    this.crew = Array.from({ length: 4 }, () => {
      const c = crewMember();
      root.add(c);
      return c;
    });
    this.pier = PIER.map((ll) => ctx.en(...ll));
    this.top = ctx.en(...SLIP_TOP);
    const b = rad(SLIP_BEARING);
    this.dir = [Math.sin(b), Math.cos(b)]; // east, north
    this.maroons = [0, 5];
    this.splashed = false;
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    // Maroons: two bangs high over the island.
    for (let k = 0; k < this.maroons.length; k++) {
      if (t >= this.maroons[k]) {
        this.maroons.splice(k, 1);
        ctx.audio.rocket(ctx.audioPosAt(this.top[0], this.top[1], 20));
        this.fx.burst(ctx, this.top[0] - 20, this.top[1] + 10, 90, { flash: 0xffe2a0, smoke: 0x8a8a8a, size: 10, life: 8 });
        setTimeout(() => ctx.audio.blast(ctx.audioPosAt(this.top[0], this.top[1], 90), 400), 900);
        break;
      }
    }
    // The crew run out along the pier (from halfway) to the island.
    const [a, b2] = this.pier;
    this.crew.forEach((c, k) => {
      const p = Math.min(1, Math.max(0, (t - 3 - k * 0.8) / 20));
      const f = 0.5 + 0.5 * p;
      const e = a[0] + (b2[0] - a[0]) * f + (k % 2 ? 1.2 : -1.2);
      const n = a[1] + (b2[1] - a[1]) * f;
      ctx.place(c, e, n, 11.4 + (p < 1 ? Math.abs(Math.sin(t * 9 + k)) * 0.12 : 0));
      c.scale.setScalar(ctx.minSize(2));
      c.rotation.y = Math.atan2(b2[1] - a[1], b2[0] - a[0]);
      c.visible = c.visible && p < 1;
    });
    // The boat: at the top of the slipway, then away down it (gathering speed), then out to sea.
    const g = this.boat.g;
    g.scale.setScalar(ctx.minSize(15));
    const heading = Math.atan2(this.dir[1], this.dir[0]);
    const slope = Math.atan2(SLIP_TOP_ALT - SLIP_END_ALT, SLIP_LEN);
    if (t < 30) {
      const s = t < 26 ? 4 : 4 + 90 * ((t - 26) / 4) ** 2; // released at 26 s, gathering speed
      const run = Math.min(SLIP_LEN, s);
      const alt = SLIP_TOP_ALT - (run / SLIP_LEN) * (SLIP_TOP_ALT - SLIP_END_ALT) + 1.6;
      ctx.place(g, this.top[0] + this.dir[0] * run, this.top[1] + this.dir[1] * run, Math.max(alt, (ctx.tide ?? 0) + 0.2));
      g.rotation.set(0, heading, -slope);
      if (alt < (ctx.tide ?? 0) + 1.5 && !this.splashed) {
        this.splashed = true;
        ctx.audio.splash(ctx.audioPos(g));
        for (let k = 0; k < 3; k++) {
          this.fx.burst(ctx, this.top[0] + this.dir[0] * (run + k * 3), this.top[1] + this.dir[1] * (run + k * 3), (ctx.tide ?? 0) + 1, { flash: 0xffffff, smoke: 0xe8eef0, size: 9, life: 2.5 });
        }
      }
    } else {
      // Out to sea: on along the slipway's line, then swinging west down the Channel.
      const u = t - 30;
      const swing = Math.min(1, u / 25) * 0.9;
      const hd = heading + swing;
      const e = this.top[0] + this.dir[0] * SLIP_LEN + Math.cos(heading + swing / 2) * 14 * u;
      const n = this.top[1] + this.dir[1] * SLIP_LEN + Math.sin(heading + swing / 2) * 14 * u;
      ctx.placeOnWater(g, e, n, 0.3);
      g.rotation.set(0, hd, 0.06 + Math.sin(t * 2.2) * 0.03);
      if (Math.floor(t * 4) % 2 === 0 && Math.floor(t * 4) !== this.lastWake) {
        this.lastWake = Math.floor(t * 4);
        this.fx.burst(ctx, e - Math.cos(hd) * 8, n - Math.sin(hd) * 8, (ctx.tide ?? 0) + 0.3, { flash: 0xffffff, smoke: 0xf2f6f8, size: 4, life: 2 });
      }
    }
    this.boat.lamp.material.color.setHex(Math.floor(t * 2) % 2 ? 0x6fb0ff : 0x1a2a40);
    this.fx.update(dt);
    return t < 78;
  }

  stop() {
    this.fx.clear();
  }
}
