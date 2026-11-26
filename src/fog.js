import*as THREE from"three";import{dayUniforms}from"./daylight.js";const NEAR=120;const FAR=1e3;const fogUniforms={uFogCol:dayUniforms.uSkyHaze,uFogNear:{value:1e8},uFogFar:{value:2e8}};const FOG_PARS=`
  uniform vec3 uFogCol;
  uniform float uFogNear, uFogFar;
  varying float vFogD;
  float fogAmount() { return clamp((vFogD - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0); }
`;const FOG_VARY="varying float vFogD;";const fogVertex=mv=>`vFogD = -(${mv}).z;`;const _c=new THREE.Color;const CAVE_NEAR=2;const CAVE_FAR=15;const CAVE_DARK=new THREE.Color(.012,.009,.006);function updateFog(scene,k,under=false){if(!scene.fog)scene.fog=new THREE.Fog(16777215,1e8,2e8);if(k&&under){scene.fog.near=CAVE_NEAR*k;scene.fog.far=CAVE_FAR*k;scene.fog.color.copy(CAVE_DARK);return}const near=k?NEAR*k:1e8;const far=k?FAR*k:2e8;fogUniforms.uFogNear.value=near;fogUniforms.uFogFar.value=far;scene.fog.near=near;scene.fog.far=far;const h=dayUniforms.uSkyHaze.value;scene.fog.color.copy(_c.setRGB(h.x,h.y,h.z,THREE.SRGBColorSpace))}export{FOG_PARS,FOG_VARY,fogUniforms,fogVertex,updateFog};
