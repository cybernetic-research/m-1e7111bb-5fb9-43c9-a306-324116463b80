import * as THREE from 'three';
import { puff, Effects, rand } from './scenarios.js';

// Kingswood and Warmley scenes. Sources: Wikipedia (William Champion; Kingswood School; George Whitefield).
// Stack positions, the statue's form and the crowd are illustrative.

const brick = new THREE.MeshStandardMaterial({ color: 0x8c5a43, roughness: 0.9 });
const clinker = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.95 });
const glowMat = new THREE.MeshBasicMaterial({ color: 0xff7a24 });

// The Warmley Giant: Neptune, about 30 feet (9 m) tall, in clinker and slag, holding a trident. Form simplified.
function neptune() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 5.5, 10), clinker);
  body.position.y = 3.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), clinker);
  head.position.y = 6.7;
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 8), clinker);
  beard.rotation.x = Math.PI;
  beard.position.set(0, 5.9, 0.5);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3, 6), clinker);
  arm.rotation.z = Math.PI / 2.6;
  arm.position.set(1.4, 5.2, 0);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 6), clinker);
  shaft.position.set(2.5, 4.8, 0);
  g.add(body, head, beard, arm, shaft);
  for (const dx of [-0.5, 0, 0.5]) {
    const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 1.2, 5), clinker);
    prong.position.set(2.5 + dx, 9.7, 0);
    g.add(prong);
  }
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.3, 1, 10), clinker);
  plinth.position.y = 0.5;
  g.add(plinth);
  return g;
}

// A brass or copper furnace stack: a tapering brick cone with glowing fire-holes at its foot.
function furnaceStack(height) {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 4, height, 12, 1, true), brick);
  cone.position.y = height / 2;
  g.add(cone);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.7, 10), glowMat);
    hole.position.set(Math.cos(a) * 3.8, 1, Math.sin(a) * 3.8);
    hole.lookAt(Math.cos(a) * 10, 1, Math.sin(a) * 10);
    g.add(hole);
  }
  return { group: g, top: height };
}

export class WarmleyWorks {
  static title = "Champion's Warmley works in the 1760s (reconstruction)";
  static caption = "By 1754 Warmley had 15 copper furnaces, 12 brass furnaces and 4 zinc furnaces, with mills for rolling, cutting and wire-drawing: one of the largest brass works in Europe. Its brass basins, 'Neptunes', were made for the transatlantic slave trade. The stacks and their positions here are illustrative.";

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.fx = new Effects(root);
    // Ten stacks scattered around the works (the real layout isn't recorded on Wikipedia).
    this.stacks = Array.from({ length: 10 }, (_, k) => {
      const a = (k / 10) * Math.PI * 2 + rand(-0.2, 0.2);
      const r = rand(40, 140);
      const s = furnaceStack(rand(14, 20));
      root.add(s.group);
      return { ...s, e: Math.cos(a) * r, n: Math.sin(a) * r, smokeT: rand(0, 0.5) };
    });
    this.statue = neptune();
    root.add(this.statue);
    [this.statueE, this.statueN] = ctx.en(51.45522, -2.47789);
    ctx.audio.rumble(10);
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    for (const s of this.stacks) {
      ctx.place(s.group, s.e, s.n, ctx.groundAlt(s.e, s.n));
      s.group.scale.setScalar(ctx.minSize(20));
      if ((s.smokeT -= dt) <= 0) {
        s.smokeT = rand(0.25, 0.5);
        this.fx.burst(ctx, s.e + rand(-2, 2), s.n + rand(-2, 2), ctx.groundAlt(s.e, s.n) + s.top + 2,
          { flash: 0x000000, smoke: 0x2c2a2a, size: 10, life: 9 });
      }
    }
    ctx.place(this.statue, this.statueE, this.statueN, ctx.groundAlt(this.statueE, this.statueN));
    this.statue.scale.setScalar(ctx.minSize(10));
    this.fx.update(dt);
    return this.t < 70;
  }

  stop() {
    this.fx.clear();
  }
}

// Generic figures for crowds: a body and a head, in a few muted coat colours. Not any particular person.
function crowd(count) {
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.25, 1.0, 3, 6), new THREE.MeshStandardMaterial({ roughness: 0.9 }), count);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8b89a, roughness: 0.8 }), count);
  const coats = [0x2f2a26, 0x3d3a34, 0x4a3b2c, 0x2c3238, 0x5a4a3a].map((c) => new THREE.Color(c));
  for (let k = 0; k < count; k++) body.setColorAt(k, coats[k % coats.length]);
  return { body, heads };
}

export class PreachingToTheColliers {
  static title = 'Preaching to the Kingswood colliers, 1739 (dramatisation)';
  static caption = "Barred from more and more pulpits, George Whitefield preached to the Kingswood colliers in the open air in 1739, then asked John Wesley to take the work on. Tradition remembers Hanham Mount as one of the places. The crowd here is illustrative.";

  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.t = 0;
    this.count = 400;
    this.crowd = crowd(this.count);
    root.add(this.crowd.body, this.crowd.heads);
    this.people = Array.from({ length: this.count }, (_, k) => {
      // Rows in an arc facing the preacher, filling in as people arrive.
      const row = Math.floor(k / 40);
      const a = (k % 40) / 39 * Math.PI * 0.9 - Math.PI * 0.45;
      const r = 8 + row * 1.6 + rand(-0.4, 0.4);
      return { e: Math.sin(a) * r, n: -Math.cos(a) * r + rand(-0.3, 0.3), arrive: rand(0, 20) + row * 1.2, phase: rand(0, 6) };
    });
    this.preacher = new THREE.Group();
    const coat = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 3, 6), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    coat.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8b89a }));
    head.position.y = 1.65;
    const bands = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    bands.position.set(0, 1.4, 0.26);
    this.preacher.add(coat, head, bands);
    root.add(this.preacher);
    this.m = new THREE.Matrix4();
    this.tmp = new THREE.Object3D();
    this.murmur = ctx.audio.noise(80, { gain: 0.06, f0: 500, type: 'bandpass', q: 0.8 });
    this.sang = false;
  }

  update(dt) {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    ctx.place(this.preacher, 0, 0, ctx.groundAlt(0, 0) + 0.6);
    this.preacher.scale.setScalar(Math.max(ctx.scaleTrue(), ctx.minSize(4) * 0.4));
    this.preacher.rotation.y = Math.PI;
    const tmp = this.tmp;
    this.root.add(tmp);
    // Close to true size even on the table (enlarging each person would merge the crowd into a blob).
    const scale = Math.max(ctx.scaleTrue(), ctx.minSize(2) * 0.25);
    this.people.forEach((p, k) => {
      const here = t > p.arrive;
      ctx.place(tmp, p.e, p.n, ctx.groundAlt(p.e, p.n) + 0.75);
      tmp.scale.setScalar(here ? scale : 0.0001);
      tmp.rotation.set(0, Math.atan2(-p.e, -p.n) + Math.sin(t * 0.7 + p.phase) * 0.05, 0);
      tmp.updateMatrix();
      this.crowd.body.setMatrixAt(k, tmp.matrix);
      tmp.position.y += 0.83 * scale;
      tmp.updateMatrix();
      this.crowd.heads.setMatrixAt(k, tmp.matrix);
    });
    this.root.remove(tmp);
    this.crowd.body.instanceMatrix.needsUpdate = true;
    this.crowd.heads.instanceMatrix.needsUpdate = true;
    // The crowd takes up a hymn: slow chords.
    if (t > 30 && !this.sang) {
      this.sang = true;
      const chords = [[196, 247, 294], [220, 262, 330], [175, 220, 262], [196, 247, 294], [147, 185, 220], [196, 247, 294]];
      chords.forEach((c, n) => c.forEach((f) => ctx.audio.tone(f, f, 2.4, { type: 'triangle', gain: 0.05, at: n * 2.2 })));
    }
    return t < 60;
  }

  stop() {
    try { this.murmur?.stop(); } catch { /* already stopped */ }
  }
}
