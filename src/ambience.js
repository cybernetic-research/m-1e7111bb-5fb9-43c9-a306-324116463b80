import * as THREE from 'three';
import { RES } from './terrain.js';

// The sounds of the town at life size in c.1400 and c.1650, all synthesised (audio.js samples nothing), quiet, and
// placed where they come from:
// - Church bells now and then from one of the churches near you: a few strokes of a bell's inharmonic partials.
// - The animals near you (townlife.js) calling once in a while: hens clucking, sheep and goats bleating, a cow
//   lowing, a horse snorting; gulls crying over the water.
// - The talk of a crowd: several voices babbling (each a buzzing pitch through two shifting vowel filters, in
//   syllables and pauses) over a soft murmur; it swells with the number of townsfolk within CROWD metres of you
//   and comes from among them.

const CROWD = 25; // metres
const ANIMALS = 35; // metres: the furthest animal heard

export function ambience(ctx, { eras, churches = [] }) {
  const map = ctx.map;
  const mpp = ctx.metresPerPixel;
  const a = { i: (RES - 1) / 2, j: (RES - 1) / 2 };
  const root = new THREE.Group();
  const audio = () => map.game?.audio;
  let nextBell = 20 + Math.random() * 30;
  let nextCall = 3;
  let nextGull = 15;
  let crowd = null;
  let last = null;
  const _w = new THREE.Vector3();

  // A window pixel (and height) as a position relative to you, in metres, as the panner wants it.
  const rel = (i, j, y = 1.5) => {
    root.localToWorld(_w.set((i - a.i) * mpp, 0, (j - a.j) * mpp));
    const s = root.getWorldScale(new THREE.Vector3()).x || 1;
    return new THREE.Vector3((_w.x - map.game.head.x) / s, y - 1.6, (_w.z - map.game.head.z) / s);
  };
  // A voice: an oscillator (frequency path [[t, f]...]), optionally wavering, through band-pass filters, with a
  // simple envelope.
  const voice = (pos, ref, { type = 'sawtooth', path, dur, gain, filters = [[900, 2]], vib = 0, vibRate = 6, attack = 0.03 }) => {
    const au = audio();
    const c = au?.ctx;
    if (!c) return;
    const t = c.currentTime + 0.02;
    const out = au.out(pos, ref);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(path[0][1], t);
    for (const [dt, f] of path.slice(1)) o.frequency.linearRampToValueAtTime(f, t + dt);
    if (vib) {
      const l = c.createOscillator();
      const lg = c.createGain();
      l.frequency.value = vibRate;
      lg.gain.value = vib;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.1);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [f, q] of filters) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      o.connect(bp).connect(g);
    }
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.1);
  };
  const later = (s, f) => setTimeout(f, s * 1000);

  const CALLS = {
    chicken: (p) => {
      for (let k = 0; k < 3 + Math.floor(Math.random() * 3); k++) later(k * 0.16, () => voice(p, 4, { type: 'triangle', path: [[0, 520], [0.07, 430]], dur: 0.08, gain: 0.05, filters: [[1100, 3]] }));
      if (Math.random() < 0.4) later(0.7, () => voice(p, 4, { type: 'sawtooth', path: [[0, 520], [0.12, 950], [0.3, 700]], dur: 0.32, gain: 0.04, filters: [[1300, 4], [2600, 6]] }));
    },
    sheep: (p) => voice(p, 6, { path: [[0, 290], [0.8, 260]], dur: 0.85, gain: 0.05, vib: 14, vibRate: 7, filters: [[850, 4], [2300, 6]] }),
    goat: (p) => voice(p, 6, { path: [[0, 390], [0.6, 340]], dur: 0.6, gain: 0.045, vib: 25, vibRate: 11, filters: [[1000, 5], [2600, 7]] }),
    cow: (p) => voice(p, 10, { path: [[0, 125], [0.4, 135], [1.6, 100]], dur: 1.7, gain: 0.07, filters: [[400, 2], [800, 4]], attack: 0.2 }),
    // A dog: a bark or two (a mastiff deeper), now and then a run of them.
    dog: (p, deep = 1) => {
      const n = Math.random() < 0.3 ? 3 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
      for (let k = 0; k < n; k++) {
        later(k * (0.28 + Math.random() * 0.12), () => voice(p, 10, { type: 'sawtooth', path: [[0, 420 / deep], [0.04, 620 / deep], [0.14, 330 / deep]], dur: 0.16, gain: 0.06, filters: [[900 / deep, 3], [1800 / deep, 5]], attack: 0.01 }));
      }
    },
    mastiff: (p) => CALLS.dog(p, 1.45),
    horse: (p) => {
      // Mostly a snort (breath through the nose); now and then a whinny.
      const au = audio();
      if (Math.random() < 0.75) au?.noise(0.35, { gain: 0.05, f0: 900, f1: 300, q: 1.2, type: 'bandpass', out: au.out(p, 6) });
      else voice(p, 8, { path: [[0, 950], [0.5, 760], [1.1, 520]], dur: 1.15, gain: 0.04, vib: 55, vibRate: 10, filters: [[1400, 4], [2800, 6]] });
    },
  };
  const gull = (p) => {
    for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) later(k * 0.35, () => voice(p, 25, { type: 'sawtooth', path: [[0, 1150], [0.08, 1450], [0.28, 900]], dur: 0.3, gain: 0.03, filters: [[1600, 3], [3200, 5]] }));
  };
  // A bell: its hum, prime, tierce, quint and nominal, ringing on; a few strokes.
  const bells = (p, strokes, pitch) => {
    const au = audio();
    if (!au?.ctx) return;
    for (let s = 0; s < strokes; s++) {
      later(s * 2.6, () => {
        const out = au.out(p, 60);
        for (const [r, g, d] of [[0.5, 0.02, 7], [1, 0.03, 5], [1.2, 0.018, 4], [1.5, 0.012, 3.5], [2, 0.014, 3], [2.5, 0.006, 2]]) au.tone(330 * pitch * r, 330 * pitch * r * 0.998, d, { gain: g, out });
      });
    }
  };

  // The crowd: voices babbling, and a murmur under them, through a gain set by how many are near.
  const makeCrowd = () => {
    const au = audio();
    const c = au.ctx;
    const gain = c.createGain();
    gain.gain.value = 0;
    const pan = au.out(new THREE.Vector3(0, 0, -5), 8);
    const soft = c.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 2200;
    gain.connect(soft).connect(pan);
    const murmur = c.createBufferSource();
    murmur.buffer = au.noiseBuf;
    murmur.loop = true;
    const mf = c.createBiquadFilter();
    mf.type = 'bandpass';
    mf.frequency.value = 450;
    mf.Q.value = 0.8;
    const mg = c.createGain();
    mg.gain.value = 0.25;
    murmur.connect(mf).connect(mg).connect(gain);
    murmur.start();
    const VOWELS = [[800, 1200], [500, 1900], [320, 2300], [500, 900], [360, 800], [650, 1700]];
    const voices = [];
    for (let v = 0; v < 7; v++) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      const base = v % 2 ? 190 + Math.random() * 50 : 105 + Math.random() * 30; // women's and men's voices
      o.frequency.value = base;
      const f1 = c.createBiquadFilter();
      const f2 = c.createBiquadFilter();
      f1.type = f2.type = 'bandpass';
      f1.Q.value = 5;
      f2.Q.value = 7;
      const g = c.createGain();
      g.gain.value = 0;
      o.connect(f1).connect(g);
      o.connect(f2).connect(g);
      const vg = c.createGain();
      vg.gain.value = 0.35;
      g.connect(vg).connect(gain);
      o.start();
      voices.push({ o, f1, f2, g, base, next: c.currentTime + Math.random() });
    }
    // Each animation tick, schedule the next syllables (vowel, pitch, loudness) a little ahead.
    const talk = () => {
      const now = c.currentTime;
      for (const v of voices) {
        while (v.next < now + 0.3) {
          const t = v.next;
          if (Math.random() < 0.15) {
            v.g.gain.setTargetAtTime(0, t, 0.04);
            v.next = t + 0.4 + Math.random() * 1.4; // a pause
            continue;
          }
          const [a1, a2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
          const len = 0.09 + Math.random() * 0.16;
          v.f1.frequency.setTargetAtTime(a1, t, 0.02);
          v.f2.frequency.setTargetAtTime(a2, t, 0.02);
          v.o.frequency.setTargetAtTime(v.base * (0.85 + Math.random() * 0.35), t, 0.05);
          v.g.gain.setTargetAtTime(0.5 + Math.random() * 0.5, t, 0.02);
          v.g.gain.setTargetAtTime(0.05, t + len * 0.8, 0.03);
          v.next = t + len;
        }
      }
    };
    return { gain, pan, talk };
  };

  const animate = (t) => {
    const dt = last == null ? 0 : Math.min(0.2, t - last);
    last = t;
    const au = audio();
    const life = map.game?.life?.state === 'on';
    const here = life && eras.includes(map.era) && au?.ctx;
    if (crowd && !here && au?.ctx) crowd.gain.gain.setTargetAtTime(0, au.ctx.currentTime, 0.3);
    if (!here) return;
    const me = map.game.life.pixelOf(map.game.head);
    if (!me) return;
    // The crowd: as loud as the number near (about fifteen is a crowd), from among them.
    crowd ??= makeCrowd();
    let n = 0;
    let si = 0;
    let sj = 0;
    for (const f of map.townFolk ?? []) {
      if (Math.hypot(f.i - me.i, f.j - me.j) * mpp < CROWD) {
        n++;
        si += f.i;
        sj += f.j;
      }
    }
    const level = n < 3 ? 0 : Math.min(1, (n - 2) / 13) * 0.12;
    crowd.gain.gain.setTargetAtTime(level, au.ctx.currentTime, 0.8);
    if (n) {
      const p = rel(si / n, sj / n);
      crowd.pan.positionX.setTargetAtTime(p.x, au.ctx.currentTime, 0.5);
      crowd.pan.positionY.setTargetAtTime(p.y, au.ctx.currentTime, 0.5);
      crowd.pan.positionZ.setTargetAtTime(p.z, au.ctx.currentTime, 0.5);
    }
    if (level > 0) crowd.talk();
    // Bells from a church near you, every minute or two.
    if ((nextBell -= dt) <= 0) {
      nextBell = 50 + Math.random() * 70;
      const near = churches.map(([lat, lon]) => map.source.toWindow(lat, lon)).filter((w) => Math.hypot(w.i - me.i, w.j - me.j) * mpp < 400);
      if (near.length) {
        const w = near[Math.floor(Math.random() * near.length)];
        bells(rel(w.i, w.j, 25), 3 + Math.floor(Math.random() * 4), 0.8 + Math.random() * 0.5);
      }
    }
    // An animal near you calls.
    if ((nextCall -= dt) <= 0) {
      nextCall = 3 + Math.random() * 6;
      const near = (map.townAnimals ?? []).filter((an) => an.pivot && Math.hypot(an.i - me.i, an.j - me.j) * mpp < ANIMALS && CALLS[an.kind]);
      if (near.length) {
        const an = near[Math.floor(Math.random() * near.length)];
        CALLS[an.kind](rel(an.i, an.j, an.kind === 'chicken' ? 0.4 : 1.2));
      }
    }
    // Gulls over the water, if there's water near.
    if ((nextGull -= dt) <= 0) {
      nextGull = 12 + Math.random() * 25;
      const b = map.bristol;
      for (let k = 0; k < 30; k++) {
        const i = me.i + (Math.random() - 0.5) * 120 / mpp;
        const j = me.j + (Math.random() - 0.5) * 120 / mpp;
        const q = Math.round(j) * RES + Math.round(i);
        if (b?.frome?.[q] || b?.harbour?.[q] || map.seaMask?.[q]) {
          gull(rel(i, j, 20));
          break;
        }
      }
    }
  };
  return [{ ...a, model: { group: root, top: 1 }, era: eras, trueSize: true, baseAlt: 0, far: true, animate }];
}
