import * as THREE from 'three';
import { dayUniforms } from './daylight.js';

// Fog in the far distance at life size, the colour of the horizon's haze (daylight.js): from NEAR metres out it
// thickens evenly to FAR. Three's own materials take it from scene.fog; the shaders written here (the ground, the
// houses, the far landscape) from these uniforms. On the table, none.
const NEAR = 120;
const FAR = 1000;
export const fogUniforms = {
  uFogCol: dayUniforms.uSkyHaze, // (the same vector: the sky's haze)
  uFogNear: { value: 1e8 },
  uFogFar: { value: 2e8 },
};
export const FOG_PARS = /* glsl */ `
  uniform vec3 uFogCol;
  uniform float uFogNear, uFogFar;
  varying float vFogD;
  float fogAmount() { return clamp((vFogD - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0); }
`;
// (In a vertex shader: the varying, and its distance from the eye, as three's own fog measures it.)
export const FOG_VARY = 'varying float vFogD;';
export const fogVertex = (mv) => `vFogD = -(${mv}).z;`;

const _c = new THREE.Color();
// Each frame: k world units per metre at life size, or null on the table.
export function updateFog(scene, k) {
  if (!scene.fog) scene.fog = new THREE.Fog(0xffffff, 1e8, 2e8);
  const near = k ? NEAR * k : 1e8;
  const far = k ? FAR * k : 2e8;
  fogUniforms.uFogNear.value = near;
  fogUniforms.uFogFar.value = far;
  scene.fog.near = near;
  scene.fog.far = far;
  const h = dayUniforms.uSkyHaze.value;
  // (The haze is written to the screen as it is; three's materials work in linear colour.)
  scene.fog.color.copy(_c.setRGB(h.x, h.y, h.z, THREE.SRGBColorSpace));
}
