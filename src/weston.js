import * as THREE from 'three';
import { RES } from './terrain.js';

// Walking from Weston to Brean Down at low tide. At low water the sands and mud of Weston Bay stretch out to Brean
// Down, but between Uphill and the Down the River Axe winds across the flats in a soft, deep channel, and the tide
// in the Bristol Channel (one of the biggest ranges in the world, over 12 m at springs) comes in fast across the
// level ground. People do get stuck in the mud here and need rescuing. The route, timings and the speed of the
// tide are compressed for the scene; the rescue hovercraft is a generic, original model.

const START = [51.34700, -2.98420]; // on the sand by the Grand Pier
const MID = [[51.33400, -2.99050], [51.33250, -2.99150]]; // halfway down the beach, walking south
export const UPHILL = [51.32700, -2.99700]; // near Uphill, the Axe mouth ahead
const BREAN = [51.32480, -3.00580]; // the foot of Brean Down, across the channel
const HOVER_FROM = [51.32920, -2.99300];
const HOVER_TO = [51.32300, -2.98800]; // Uphill slipway (approximate)

const LOW = -4;
const HIGH_AT_RESCUE = 2.6;

// A rescue hovercraft: black skirt, white hull and cabin with orange bands, two ducted fans at the back. +x forward.
function hovercraft() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xf26a1b, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.2 });
  const skirt = new THREE.Mesh(new THREE.CapsuleGeometry(1.6, 6, 6, 16).rotateZ(Math.PI / 2), black);
  skirt.scale.set(1, 0.45, 1.6);
  skirt.position.y = 0.7;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.5, 4.6), white);
  deck.position.y = 1.45;
  const band = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.25, 4.7), orange);
  band.position.y = 1.3;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.5, 3.2), white);
  cabin.position.set(1.4, 2.4, 0);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 2.8), glass);
  screen.position.set(3.12, 2.6, 0);
  g.add(skirt, deck, band, cabin, screen);
  for (const z of [-1.2, 1.2]) {
    const duct = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.16, 8, 20), orange);
    duct.rotation.y = Math.PI / 2;
    duct.position.set(-3.3, 2.7, z);
    g.add(duct);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0x6fb0ff }));
  lamp.position.set(1.4, 3.3, 0);
  g.add(lamp);
  return { g, lamp };
}

export class WalkToBrean {
  static title = 'Walking to Brean Down at low tide';
  static caption = "At low water Weston's sands and mud seem to run all the way to Brean Down. But between Uphill and the Down the River Axe crosses the flats in a soft, deep channel, and the Channel's huge tide floods in fast. Time is compressed here; don't try it for real.";

  constructor(ctx, root) {
    this.ctx = ctx;
    this.t = 0;
    this.stage = 'arrive';
    this.sink = 0;
    this.craft = hovercraft();
    root.add(this.craft.g);
    this.craft.g.visible = false;
    this.level = LOW;
    ctx.map.waterOverride = LOW;
    ctx.map.floodSea();
    this.redraw = 0;
  }

  // Real-world metres (east, south from the square's corner) for a lat/lon. Only while no terrain is loading.
  real(map, [lat, lon]) {
    const w = map.source.toWindow(lat, lon);
    return map.dataToReal((w.i / (RES - 1) - 0.5) * map.size, (w.j / (RES - 1) - 0.5) * map.size);
  }

  // Bare ground at a real point, if it's in the loaded window.
  groundAt(map, real) {
    const d = map.realToData(real);
    const i = (d.x / map.size + 0.5) * (RES - 1);
    const j = (d.z / map.size + 0.5) * (RES - 1);
    if (i < 0 || j < 0 || i > RES - 1 || j > RES - 1) return null;
    return map.sample(i, j, map.grids.terrain);
  }

  // Jump to a spot (with a fresh window of terrain round it), facing a bearing.
  hop(map, life, target, face, text) {
    this.at = { ...target };
    this.alt = this.alt ?? 3;
    life.setRide({ real: this.at, alt: this.alt });
    life.reloadAround(target);
    life.q = life.facing(face);
    this.waitLoad = true;
    if (text) map.game.flash?.(WalkToBrean.title, text);
  }

  update(dt) {
    const map = this.ctx.map;
    const life = map.game.life;
    this.t += dt;
    if (life.state !== 'on') return this.t < 90;
    if (!this.pts) {
      if (map.loading) return true;
      this.pts = {
        start: this.real(map, START), mid0: this.real(map, MID[0]), mid1: this.real(map, MID[1]),
        uphill: this.real(map, UPHILL), brean: this.real(map, BREAN), hoverFrom: this.real(map, HOVER_FROM), hoverTo: this.real(map, HOVER_TO),
      };
      this.hop(map, life, this.pts.start, 200, "Low tide by the Grand Pier. Brean Down is 3 km away across the sands, and at low water it looks as if you could walk there.");
      this.clock = 0;
    }
    const P = this.pts;
    // Wait for the terrain round a new spot, then stand on it.
    if (this.waitLoad) {
      if (map.loading) return true;
      this.waitLoad = false;
    }
    this.clock += dt;
    const g = this.groundAt(map, this.at);
    if (g != null && this.stage !== 'rescued') this.alt = g - this.sink + 0.02;
    const walk = (to, speed) => {
      const dx = to.x - this.at.x;
      const dy = to.y - this.at.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.5) return true;
      const step = Math.min(d, speed * dt);
      this.at = { x: this.at.x + (dx / d) * step, y: this.at.y + (dy / d) * step };
      return false;
    };
    if (this.stage === 'arrive' && this.clock > 8) {
      this.stage = 'mid';
      this.clock = 0;
      this.hop(map, life, P.mid0, 190, "Half an hour on, halfway down the beach. Weston's firm sand is giving way to softer, wetter mud the further out you go.");
    } else if (this.stage === 'mid') {
      walk(P.mid1, 1.3);
      if (this.clock > 12) {
        this.stage = 'axe';
        this.clock = 0;
        this.level = Math.max(this.level, -1.5); // the tide is well on its way in by now
        this.hop(map, life, P.uphill, 255, 'Near Uphill. Ahead, the River Axe winds out across the mud to the sea, between you and Brean Down. The tide has turned.');
      }
    } else if (this.stage === 'axe') {
      // Out across the flats towards the Down; in the channel's soft mud each step sinks deeper.
      const soft = g != null && g < 0.6;
      if (soft) this.sink = Math.min(0.75, this.sink + dt * 0.05);
      const speed = soft ? Math.max(0, 1.2 * (1 - this.sink / 0.5)) : 1.2;
      walk(P.brean, speed);
      if (this.sink > 0.5 && !this.stuckSaid) {
        this.stuckSaid = true;
        map.game.flash?.(WalkToBrean.title, 'Stuck. The mud grips your legs, and pulling one free pushes the other deeper. And the tide is coming in across the flats faster than you could walk, even on firm sand.');
        this.stuckAt = this.clock;
      }
      if (this.stuckSaid && this.clock - this.stuckAt > 22) {
        this.stage = 'rescue';
        this.clock = 0;
        this.craft.g.visible = true;
        this.craftAt = { ...P.hoverFrom };
        map.game.flash?.(WalkToBrean.title, 'Help arrives: a rescue hovercraft can cross mud and water that no boat or person can. On this coast the Coastguard mud teams and rescue hovercraft are called out to people stuck like this.');
      }
    } else if (this.stage === 'rescue') {
      // The hovercraft comes alongside, then carries you back to Uphill.
      const target = this.aboard ? P.hoverTo : { x: this.at.x + 4, y: this.at.y };
      const dx = target.x - this.craftAt.x;
      const dy = target.y - this.craftAt.y;
      const d = Math.hypot(dx, dy);
      const step = Math.min(d, 7 * dt);
      if (d > 0.5) this.craftAt = { x: this.craftAt.x + (dx / d) * step, y: this.craftAt.y + (dy / d) * step };
      this.craftHeading = Math.atan2(-dy, dx);
      if (!this.aboard && d < 0.6) {
        this.aboard = true;
        this.sink = 0;
        this.boardAt = this.clock;
      }
      if (this.aboard) {
        this.at = { x: this.craftAt.x - 1, y: this.craftAt.y };
        const cg = this.groundAt(map, this.craftAt);
        this.alt = Math.max(cg ?? 0, this.level) + 1.7;
        if (d <= 0.5 && this.clock - this.boardAt > 6) {
          this.stage = 'rescued';
          map.game.flash?.(WalkToBrean.title, "Safe at Uphill. In real life: Weston's sands near the front are fine at low tide, but don't walk out onto the mud or towards Brean Down across the Axe. Check the tide times, and if you see someone stuck, call 999 and ask for the Coastguard.");
          this.endAt = this.t;
        }
      }
    }
    // The tide: low until you reach the Axe, then rising fast.
    // Until you're aboard the hovercraft it stops about chest-deep on you.
    if (this.stage === 'axe' || this.stage === 'rescue' || this.stage === 'rescued') {
      const cap = this.aboard ? HIGH_AT_RESCUE : (g ?? 1) - this.sink + 1.2;
      if (this.level < cap) this.level = Math.min(cap, this.level + dt * 0.12);
    }
    map.waterOverride = this.level;
    if ((this.redraw -= dt) <= 0) {
      this.redraw = 0.4;
      map.floodSea();
    }
    life.setRide({ real: this.at, alt: this.alt });
    // Place the hovercraft (in the scene's own east/north frame: convert from real metres).
    if (this.craft.g.visible && this.craftAt) {
      const a = this.anchorReal ?? (this.anchorReal = this.real(map, this.ctx.opts.anchor));
      const e = this.craftAt.x - a.x;
      const n = -(this.craftAt.y - a.y);
      const cg = this.groundAt(map, this.craftAt) ?? this.level;
      this.ctx.place(this.craft.g, e, n, Math.max(cg, this.level) + 0.1);
      this.craft.g.scale.setScalar(this.ctx.minSize(9));
      this.craft.g.rotation.y = this.craftHeading ?? 0;
      this.craft.lamp.material.color.setHex(Math.floor(this.t * 2) % 2 ? 0x6fb0ff : 0x1a2a40);
    }
    return !(this.endAt && this.t - this.endAt > 12) && this.t < 260;
  }

  stop() {
    const map = this.ctx.map;
    map.waterOverride = null;
    map.floodSea();
    map.game.life.setRide(null);
  }
}
