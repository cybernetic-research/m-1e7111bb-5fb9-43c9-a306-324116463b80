import * as THREE from 'three';

// The time of day at life size: the sun's height and bearing over Bristol (a summer's day: sunrise about 5:30,
// sunset about 20:30, the sun about 60 degrees up at 13:00), and from it the colour and strength of the light, the sky's
// colours, and a tint for the hand-written shaders (the ground, the houses, the trees and the water), which don't use
// three.js lights. At night windows and fires glow (uNight). On the table the light stays as it is.

const RISE = 5.5;
const SET = 20.5;
const NOON = (RISE + SET) / 2;
const MAX_ELEV = 60 * (Math.PI / 180);

// Named times to step through, with the hour each one shows.
export const TIMES = [['Dawn', 5.8], ['Morning', 8.5], ['Midday', 13], ['Afternoon', 16.5], ['Evening', 19.3], ['Dusk', 20.6], ['Night', 23.5]];

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix3 = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);

// Uniforms shared by the custom shaders (added to the map's uniforms).
export const dayUniforms = {
  uDayTint: { value: new THREE.Vector3(1, 1, 1) },
  uSunDir: { value: new THREE.Vector3(-0.3, 1.6, 0.9).normalize() },
  uNight: { value: 0 },
  uSkyZenith: { value: new THREE.Vector3(0.6, 0.66, 0.74) },
  uSkyHaze: { value: new THREE.Vector3(0.83, 0.85, 0.87) },
  uSkyGround: { value: new THREE.Vector3(0.47, 0.5, 0.44) },
};

// Materials that light up after dark: { mat, kind } ('window': dark by day, firelit at night; 'flame': brighter at
// night; 'glow': only at night).
export const nightMaterials = [];
const DARK = new THREE.Color(0x14100c);
const LIT = new THREE.Color(0xffa548);

function light(mat, kind, night) {
  if (kind === 'window') mat.color.copy(DARK).lerp(LIT, night);
  else if (kind === 'flame') mat.opacity = 0.55 + 0.4 * night;
  else if (kind === 'glow') mat.opacity = 0.9 * night;
}
// Register a material to light up after dark (kind as above); returns it.
export function nightLit(mat, kind) {
  nightMaterials.push({ mat, kind });
  light(mat, kind, dayUniforms.uNight.value);
  return mat;
}

// The light at an hour (0-24): { s: sine of the sun's elevation, dir: towards the sun (x east, y up, z south) }.
function sunAt(hour) {
  // Elevation follows a sine through the day, dipping below the horizon at night; bearing swings east to west.
  const f = (hour - RISE) / (SET - RISE); // 0 at sunrise, 1 at sunset
  const elev = f >= 0 && f <= 1 ? MAX_ELEV * Math.sin(Math.PI * f) : -0.35 * Math.sin(Math.PI * Math.min(1, ((hour - SET + 24) % 24) / (24 - (SET - RISE))));
  const az = Math.PI * (0.5 + (hour - RISE) / (SET - RISE) * 1.0) + (hour - NOON) * 0.02; // radians clockwise from north
  const c = Math.cos(elev);
  return { s: Math.sin(elev), dir: new THREE.Vector3(Math.sin(az) * c, Math.max(0.08, Math.sin(elev)), -Math.cos(az) * c).normalize() };
}

export class Daylight {
  constructor(game) {
    this.game = game;
    // (Mid-morning to start: a sun low enough to throw the houses' shadows across the streets, lighting them in
    // shafts and patches.)
    this.hour = 8.5;
    this.target = 8.5;
    this.index = TIMES.findIndex(([, h]) => h === 8.5);
    this.apply();
  }

  // Step to the next named time (it eases there over a couple of seconds).
  next() {
    this.index = (this.index + 1) % TIMES.length;
    this.target = TIMES[this.index][1];
    return TIMES[this.index][0];
  }

  get name() {
    return TIMES[this.index][0];
  }

  update(dt) {
    // The lights follow the time of day at life size; on the table they stay as they were.
    const { hemi, sun } = this.game.lights;
    const l = this.game.life?.active ? this.lights : { sun: [1, 1, 1], sunI: 1.5, hemi: [1, 1, 1], hemiI: 1.5 };
    sun.color.setRGB(...l.sun);
    sun.intensity = l.sunI;
    hemi.color.setRGB(...l.hemi);
    hemi.intensity = l.hemiI;
    if (this.hour === this.target) return;
    // Forward through the clock (past midnight if need be), about 6 hours a second.
    let d = (this.target - this.hour + 24) % 24;
    const step = Math.min(d, dt * 6);
    this.hour = (this.hour + step) % 24;
    if (d - step < 1e-3) this.hour = this.target;
    this.apply();
  }

  apply() {
    const { s, dir } = sunAt(this.hour);
    const day = smooth(-0.08, 0.3, s); // 0 at night, 1 in full day
    const low = 1 - smooth(0.02, 0.35, s); // the warm light of a low sun
    const night = 1 - smooth(-0.12, 0.04, s);
    const u = dayUniforms;
    // The tint for the custom shaders: moonlit blue at night, warm at sunrise and sunset, near-white by day.
    const warm = mix3([1.0, 1.0, 0.98], [1.08, 0.78, 0.56], low * smooth(-0.1, 0.05, s));
    const tint = mix3([0.13, 0.16, 0.27], warm, day);
    u.uDayTint.value.set(...tint);
    u.uSunDir.value.copy(dir);
    u.uNight.value = night;
    for (const { mat, kind } of nightMaterials) light(mat, kind, night);
    // The sky: the old light overcast by day, glowing at the horizon at sunrise and sunset, near-black at night.
    const zen = mix3(mix3([0.02, 0.03, 0.07], [0.30, 0.34, 0.52], smooth(-0.15, 0.0, s)), [0.60, 0.66, 0.74], smooth(0.05, 0.35, s));
    const haze = mix3(mix3([0.05, 0.06, 0.11], [0.96, 0.62, 0.40], smooth(-0.15, 0.0, s)), [0.83, 0.85, 0.87], smooth(0.08, 0.4, s));
    const gnd = mix3([0.03, 0.035, 0.05], [0.47, 0.50, 0.44], day);
    u.uSkyZenith.value.set(...zen);
    u.uSkyHaze.value.set(...haze);
    u.uSkyGround.value.set(...gnd);
    // three.js lights (for the models: animals, carts, the landmarks): the sun and the sky's fill.
    this.lights = {
      sun: mix3([1, 1, 1], [1, 0.72, 0.5], low), sunI: 1.5 * day + 0.08,
      hemi: mix3([0.45, 0.52, 0.8], [1, 1, 1], day), hemiI: 0.25 + 1.25 * day,
    };
  }
}
