import * as THREE from 'three';

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();

// Synthesised, spatialised sound for buttons and scenarios. Nothing is sampled; it's all oscillators and noise.
export class Audio {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // World positions are given in metres; at table scale things are a few centimetres away, so the scenario code
  // passes positions already scaled up to "how far it would really be" relative to the listener.
  // (ref: the distance in metres within which it's at full volume; it fades beyond.)
  out(pos, ref = 30) {
    if (!this.ctx) return null;
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    p.connect(this.master);
    return p;
  }

  updateListener(camera) {
    if (!this.ctx) return;
    camera.matrixWorld.decompose(_p, _q, _s);
    _f.set(0, 0, -1).applyQuaternion(_q);
    _u.set(0, 1, 0).applyQuaternion(_q);
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.forwardX) {
      for (const [k, v] of [['positionX', 0], ['positionY', 0], ['positionZ', 0], ['forwardX', _f.x], ['forwardY', _f.y],
        ['forwardZ', _f.z], ['upX', _u.x], ['upY', _u.y], ['upZ', _u.z]]) l[k].setValueAtTime(v, t);
    }
  }

  noise(dur, { gain = 0.3, f0 = 1000, f1 = f0, q = 1, type = 'lowpass', at = 0, out } = {}) {
    if (!this.ctx) return null;
    const c = this.ctx;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(out || this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
    return src;
  }

  tone(f0, f1, dur, { type = 'sine', gain = 0.2, at = 0, out } = {}) {
    if (!this.ctx) return null;
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  click() {
    this.tone(1400, 700, 0.06, { gain: 0.12 });
  }

  // Air-raid siren: the rising and falling wail.
  siren(dur = 9) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.22;
    const depth = c.createGain();
    depth.gain.value = 180;
    lfo.connect(depth).connect(o.frequency);
    o.frequency.value = 420;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1600;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 1.5);
    g.gain.setValueAtTime(0.12, t + dur - 2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur);
    lfo.stop(t + dur);
  }

  // The all-clear: one steady note.
  allClear(dur = 6) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 560;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 1);
    g.gain.setValueAtTime(0.1, t + dur - 1.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur);
  }

  // Deep ground rumble (earthquakes, collapses, the aftermath of big explosions).
  rumble(dur = 6, pos) {
    if (!this.ctx) return;
    const out = this.out(pos);
    this.noise(dur, { gain: 0.7, f0: 160, f1: 40, out });
    this.tone(38, 28, dur, { gain: 0.5, out });
  }

  // A church bell, struck once.
  bell(pos, pitch = 1) {
    if (!this.ctx) return;
    const out = this.out(pos);
    for (const [f, g] of [[220, 0.25], [440, 0.12], [587, 0.08], [880, 0.05]]) this.tone(f * pitch, f * pitch * 0.995, 3.5, { gain: g, out });
  }

  // Steamer whistle: a long, slightly rough chord.
  whistle(pos, dur = 2.5) {
    if (!this.ctx) return;
    const out = this.out(pos);
    for (const f of [262, 330, 392]) this.tone(f, f, dur, { type: 'square', gain: 0.05, out });
    this.noise(dur, { gain: 0.08, f0: 1200, type: 'bandpass', q: 3, out });
  }

  // A big explosion: crack, roar and a long tail.
  blast(pos, distance = 0) {
    if (!this.ctx) return;
    const at = distance / 340;
    const out = this.out(pos);
    this.noise(0.4, { gain: 1, f0: 6000, f1: 800, at, out });
    this.noise(4, { gain: 1, f0: 1200, f1: 30, at, out });
    this.tone(45, 18, 3.5, { gain: 0.8, at, out });
  }

  rocket(pos) {
    if (!this.ctx) return;
    this.noise(1.2, { gain: 0.25, f0: 2500, f1: 600, type: 'bandpass', q: 1.5, out: this.out(pos) });
  }

  // Fire crackle that keeps going until stopped.
  crackle(pos) {
    if (!this.ctx) return { stop() {} };
    let on = true;
    const tick = () => {
      if (!on) return;
      this.noise(0.04 + Math.random() * 0.06, { gain: 0.05 + Math.random() * 0.12, f0: 2000 + Math.random() * 3000, type: 'bandpass', q: 2, out: this.out(pos) });
      setTimeout(tick, 40 + Math.random() * 160);
    };
    this.noise(30, { gain: 0.08, f0: 300, out: this.out(pos) });
    tick();
    return { stop() { on = false; } };
  }

  // A twin-engine drone with the slow beat of unsynchronised engines. Returns a handle to move or stop it.
  engine() {
    if (!this.ctx) return { move() {}, stop() {} };
    const c = this.ctx;
    const panner = this.out({ x: 0, y: 0, z: -500 });
    panner.refDistance = 80;
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.5, c.currentTime + 2);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const oscs = [62, 65.5, 124, 131].map((freq) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.connect(f);
      o.start();
      return o;
    });
    f.connect(g).connect(panner);
    return {
      move(pos) {
        const t = c.currentTime;
        panner.positionX.setTargetAtTime(pos.x, t, 0.05);
        panner.positionY.setTargetAtTime(pos.y, t, 0.05);
        panner.positionZ.setTargetAtTime(pos.z, t, 0.05);
      },
      stop() {
        g.gain.setTargetAtTime(0, c.currentTime, 0.4);
        oscs.forEach((o) => o.stop(c.currentTime + 2));
      },
    };
  }

  flak(pos, distance = 0) {
    if (!this.ctx) return;
    const at = distance / 340; // sound arrives after the flash
    const out = this.out(pos);
    this.noise(0.9, { gain: 0.6, f0: 1800, f1: 90, at, out });
    this.tone(90, 35, 0.5, { gain: 0.35, at, out });
  }

  gun(pos, distance = 0) {
    if (!this.ctx) return;
    const at = distance / 340;
    const out = this.out(pos);
    this.noise(1.6, { gain: 0.9, f0: 900, f1: 40, at, out });
    this.tone(55, 25, 1.2, { gain: 0.6, at, out });
  }

  splash(pos, distance = 0) {
    if (!this.ctx) return;
    const out = this.out(pos);
    this.noise(1.4, { gain: 0.5, f0: 2500, f1: 300, type: 'bandpass', q: 0.7, at: distance / 340, out });
  }

  rattle(pos, distance = 0) {
    if (!this.ctx) return;
    const out = this.out(pos);
    for (let k = 0; k < 6; k++) this.noise(0.05, { gain: 0.25, f0: 3000, type: 'highpass', at: distance / 340 + k * 0.07, out });
  }
}
