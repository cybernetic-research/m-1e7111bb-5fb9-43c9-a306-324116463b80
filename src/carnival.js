import * as THREE from 'three';
import { puff, Effects, rand } from './scenarios.js';

// St Pauls Carnival (since 1968; first Saturday in July). Source: Wikipedia (St Pauls Carnival). A masquerade
// procession with ornate costumes and floats from schools and cultural groups, steel bands, and sound systems in
// the neighbouring streets. The route here is an illustrative loop on St Pauls streets (from OpenStreetMap), and
// every figure, costume, float and tune is original and generic. Music is synthesised in the browser.

const BRIGHT = [0xffd23f, 0xee4266, 0x3bceac, 0x0ead69, 0x540d6e, 0xff7f11, 0x1b98e0, 0xf72585, 0xffbe0b];
const SKIN = [0x5a3a28, 0x7a4a30, 0x8d5a3b, 0xa86b45, 0xc68a60, 0xe0b48a, 0x3f2a1e];
const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...extra });

function along(path, dist) {
  let left = Math.max(0, dist);
  for (let k = 1; k < path.length; k++) {
    const [ax, ay] = path[k - 1];
    const [bx, by] = path[k];
    const len = Math.hypot(bx - ax, by - ay);
    if (left <= len) {
      const t = len ? left / len : 0;
      return { e: ax + (bx - ax) * t, n: ay + (by - ay) * t, heading: Math.atan2(by - ay, bx - ax) };
    }
    left -= len;
  }
  const [ax, ay] = path[path.length - 2];
  const [bx, by] = path[path.length - 1];
  return { e: bx, n: by, heading: Math.atan2(by - ay, bx - ax), end: true };
}

// A float: a decorated flatbed with a canopy, flags, and either a sound system or a steel band. +x forward.
function float(kind, colour) {
  const g = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(12, 1.2, 3.4), mat(0x2a2a2a));
  bed.position.y = 1;
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.8, 3.6), mat(colour));
  skirt.position.y = 0.6;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.6), mat(0xdddddd));
  cab.position.set(7.2, 1.6, 0);
  g.add(bed, skirt, cab);
  for (let k = 0; k < 4; k++) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), mat(0xcccccc));
    pole.position.set(-5 + k * 3.3, 3.2, 1.6 * (k % 2 ? 1 : -1));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), mat(BRIGHT[(k * 3 + colour) % BRIGHT.length], { side: THREE.DoubleSide }));
    flag.position.set(-5 + k * 3.3 - 0.6, 4.4, 1.6 * (k % 2 ? 1 : -1));
    g.add(pole, flag);
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(11, 0.2, 3.6), mat(BRIGHT[(colour + 2) % BRIGHT.length]));
  canopy.position.y = 4.8;
  g.add(canopy);
  if (kind === 'sound') {
    for (const [x, z, h] of [[-5, -1, 2.4], [-5, 1, 2.4], [-3.6, -1, 1.6], [-3.6, 1, 1.6]]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 1.2), mat(0x111111));
      box.position.set(x, 1.6 + h / 2, z);
      const cone = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), mat(0x333333));
      cone.position.set(x + 0.61, 1.6 + h / 2, z);
      cone.rotation.y = Math.PI / 2;
      g.add(box, cone);
    }
  } else {
    for (let k = 0; k < 6; k++) {
      const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 12), mat(0xd8d8d8, { metalness: 0.8, roughness: 0.3 }));
      pan.position.set(-4 + (k % 3) * 2.4, 2.3, k < 3 ? -0.9 : 0.9);
      g.add(pan);
    }
  }
  return g;
}

// Generic figures as instances: bodies in bright costume colours, heads in a range of skin tones, and for
// masqueraders a big fan-shaped costume frame behind them.
function figures(count, withWings) {
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.25, 1.0, 3, 6), mat(0xffffff), count);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), mat(0xffffff), count);
  const wing = withWings ? new THREE.InstancedMesh(new THREE.CircleGeometry(1.4, 16, 0, Math.PI), mat(0xffffff, { side: THREE.DoubleSide, emissive: 0x222222 }), count) : null;
  for (let k = 0; k < count; k++) {
    body.setColorAt(k, new THREE.Color(BRIGHT[(k * 7) % BRIGHT.length]));
    head.setColorAt(k, new THREE.Color(SKIN[(k * 5) % SKIN.length]));
    wing?.setColorAt(k, new THREE.Color(BRIGHT[(k * 3 + 4) % BRIGHT.length]));
  }
  return { body, head, wing };
}

// A short, original, calypso-flavoured phrase for the steel band (C major, syncopated), and a bass line.
const PHRASE = [[72, 0], [76, 0.5], [79, 0.75], [77, 1.25], [76, 1.5], [74, 2], [72, 2.5], [74, 2.75], [76, 3.25],
  [79, 4], [81, 4.5], [79, 4.75], [77, 5.25], [76, 5.5], [74, 6], [76, 6.5], [72, 7]];
const BASS = [[36, 0], [36, 1.5], [43, 2], [41, 4], [41, 5.5], [43, 6]];
const midi = (m) => 440 * 2 ** ((m - 69) / 12);

export class Carnival {
  static title = 'St Pauls Carnival (illustration)';
  static caption = "St Pauls Carnival began in 1968 to bring together the area's African, Caribbean, European and Asian communities and to challenge negative stereotypes. Held on the first Saturday in July, with a masquerade procession of costumes and floats, steel bands and sound systems; about 70,000 came in 2008. The route, people and music here are illustrative.";

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    this.path = (ctx.map.source.route?.path ?? []).map(([lat, lon]) => ctx.en(lat, lon));
    if (this.path.length < 2) this.path = [[-300, 0], [300, 0]];
    this.length = this.path.slice(1).reduce((a, [x, y], k) => a + Math.hypot(x - this.path[k][0], y - this.path[k][1]), 0);
    // Six floats, alternating sound systems and steel bands, with masqueraders between them.
    this.floats = Array.from({ length: 6 }, (_, k) => {
      const kind = k % 2 ? 'pan' : 'sound';
      const g = float(kind, k * 2 + 1);
      root.add(g);
      return { g, kind, offset: -k * 45 };
    });
    this.masCount = 240;
    this.mas = figures(this.masCount, true);
    root.add(this.mas.body, this.mas.head, this.mas.wing);
    this.masPeople = Array.from({ length: this.masCount }, (_, k) => ({ offset: -rand(0, 270), side: rand(-4, 4), phase: rand(0, 6) }));
    // Spectators lining the route.
    this.crowdCount = 900;
    this.crowd = figures(this.crowdCount, false);
    root.add(this.crowd.body, this.crowd.head);
    this.crowdPeople = Array.from({ length: this.crowdCount }, () => ({ at: rand(0, this.length), side: (Math.random() < 0.5 ? -1 : 1) * rand(7, 11), phase: rand(0, 6) }));
    // Bunting: rows of little flags strung across the route.
    this.bunting = [];
    for (let d = 20; d < this.length; d += 60) {
      for (let k = 0; k < 9; k++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 3), mat(BRIGHT[k % BRIGHT.length], { side: THREE.DoubleSide }));
        f.rotation.x = Math.PI;
        root.add(f);
        this.bunting.push({ f, d, across: -8 + k * 2 });
      }
    }
    this.tmp = new THREE.Object3D();
    this.beat = 0;
    this.nextBar = 0;
  }

  // The procession starts off the route and advances along it at a walking pace (~1.1 m/s, sped up 6x).
  head() {
    return this.t * 6.5;
  }

  pos(dist, side) {
    const p = along(this.path, dist);
    const c = Math.cos(p.heading);
    const s = Math.sin(p.heading);
    return { e: p.e - s * side, n: p.n + c * side, heading: p.heading, on: dist > 0 && !p.end };
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    const head = this.head();
    const sTrue = ctx.scaleTrue();
    const figScale = Math.max(sTrue, ctx.minSize(2) * 0.25);
    // Floats.
    for (const f of this.floats) {
      const p = this.pos(head + f.offset, 0);
      f.g.visible = p.on;
      ctx.place(f.g, p.e, p.n, ctx.groundAlt(p.e, p.n));
      f.g.scale.setScalar(Math.max(sTrue, ctx.minSize(12) * 0.5));
      f.g.rotation.y = p.heading;
      f.g.position.y += Math.abs(Math.sin(t * 8)) * 0.05 * sTrue; // the bass shakes it
    }
    // Masqueraders: dancing, wings swaying.
    const tmp = this.tmp;
    this.root.add(tmp);
    this.masPeople.forEach((m, k) => {
      const p = this.pos(head + m.offset, m.side);
      const bounce = Math.abs(Math.sin(t * 6 + m.phase)) * 0.35;
      ctx.place(tmp, p.e, p.n, ctx.groundAlt(p.e, p.n) + 0.75 + bounce);
      tmp.scale.setScalar(p.on ? figScale : 0.00001);
      tmp.rotation.set(0, p.heading - Math.PI / 2 + Math.sin(t * 3 + m.phase) * 0.6, Math.sin(t * 6 + m.phase) * 0.15);
      tmp.updateMatrix();
      this.mas.body.setMatrixAt(k, tmp.matrix);
      tmp.position.y += 0.83 * figScale;
      tmp.updateMatrix();
      this.mas.head.setMatrixAt(k, tmp.matrix);
      tmp.position.y -= 0.4 * figScale;
      tmp.translateZ(-0.3);
      tmp.updateMatrix();
      this.mas.wing.setMatrixAt(k, tmp.matrix);
    });
    // Spectators: swaying, and cheering as the floats pass.
    this.crowdPeople.forEach((c, k) => {
      const p = this.pos(c.at, c.side);
      const near = Math.abs(c.at - head) < 300;
      const sway = near ? Math.abs(Math.sin(t * 5 + c.phase)) * 0.2 : 0;
      ctx.place(tmp, p.e, p.n, ctx.groundAlt(p.e, p.n) + 0.75 + sway);
      tmp.scale.setScalar(figScale);
      tmp.rotation.set(0, p.heading + (c.side > 0 ? 0 : Math.PI), 0);
      tmp.updateMatrix();
      this.crowd.body.setMatrixAt(k, tmp.matrix);
      tmp.position.y += 0.83 * figScale;
      tmp.updateMatrix();
      this.crowd.head.setMatrixAt(k, tmp.matrix);
    });
    this.root.remove(tmp);
    for (const im of [this.mas.body, this.mas.head, this.mas.wing, this.crowd.body, this.crowd.head]) im.instanceMatrix.needsUpdate = true;
    for (const b of this.bunting) {
      const p = this.pos(b.d, b.across);
      ctx.place(b.f, p.e, p.n, ctx.groundAlt(p.e, p.n) + 6 + Math.sin(b.across * 0.4) * 0.4);
      b.f.scale.setScalar(Math.max(sTrue, ctx.minSize(1) * 0.3));
    }
    // Confetti over the procession now and then.
    if ((this.confT = (this.confT ?? 0) - dt) <= 0) {
      this.confT = 0.35;
      const p = this.pos(head - rand(0, 250), rand(-4, 4));
      // Only at life size: on the table a puff can't be smaller than a few centimetres, which swamps the streets.
      if (p.on && ctx.map.lifeT > 0) this.fx.burst(ctx, p.e, p.n, ctx.groundAlt(p.e, p.n) + 5, { flash: BRIGHT[Math.floor(rand(0, BRIGHT.length))], smoke: BRIGHT[Math.floor(rand(0, BRIGHT.length))], size: 3, life: 2 });
    }
    this.fx.update(dt);
    this.music(dt);
    return t < 240 && head - 300 < this.length;
  }

  // Each float plays from where it is: steel bands play the phrase, sound systems a bass and kick.
  music(dt) {
    const ctx = this.ctx;
    const bar = 2.4; // seconds per phrase bar of 8 beats at 200 bpm
    if ((this.nextBar -= dt) > 0) return;
    this.nextBar = bar;
    const head = this.head();
    for (const f of this.floats) {
      const p = this.pos(head + f.offset, 0);
      if (!p.on) continue;
      const out = ctx.audio.out(ctx.audioPosAt(p.e, p.n, ctx.groundAlt(p.e, p.n) + 2));
      if (f.kind === 'pan') {
        for (const [m, beat] of PHRASE) {
          const at = beat * (bar / 8);
          ctx.audio.tone(midi(m), midi(m) * 0.998, 0.35, { type: 'sine', gain: 0.07, at, out });
          ctx.audio.tone(midi(m) * 2.01, midi(m) * 2, 0.18, { type: 'sine', gain: 0.025, at, out });
        }
      } else {
        for (const [m, beat] of BASS) ctx.audio.tone(midi(m), midi(m), 0.4, { type: 'sine', gain: 0.28, at: beat * (bar / 8), out });
        for (let b = 0; b < 8; b++) ctx.audio.tone(110, 40, 0.15, { type: 'sine', gain: 0.25, at: b * (bar / 8), out });
      }
    }
  }

  stop() {
    this.fx.clear();
  }
}
