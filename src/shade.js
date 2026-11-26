import*as THREE from"three";import{RES}from"./terrain.js";import{dayUniforms}from"./daylight.js";const BUDGET=3;const AO_STEPS=10;const SOLID_H=8;const shadeUniforms={uShade:{value:null},uShadeM:{value:new THREE.Matrix4},uShadeOn:{value:0},uSunUp:{value:0},uShadeGeo:{value:new THREE.Vector3(1,0,0)}};const SHADE_GLSL=`
  vec3 shadeFactor(float od, float top, float open, float gnd) {
    float s = mix(1.0, 1.0 - smoothstep(-0.5, 1.1, top - od), uSunUp); 
    float h = clamp((od - gnd) / 9.0, 0.0, 1.0);
    float o = mix(open, 1.0, h * 0.7);
    return mix(vec3(0.80, 0.86, 1.0), vec3(1.03, 1.0, 0.95), s) * (0.55 + 0.45 * o) * mix(0.66, 1.08, s);
  }
`;class Shade{constructor(map){this.map=map;this.half=new Uint16Array(RES*RES*4);this.tex=new THREE.DataTexture(this.half,RES,RES,THREE.RGBAFormat,THREE.HalfFloatType);this.tex.minFilter=this.tex.magFilter=THREE.LinearFilter;this.tex.needsUpdate=true;shadeUniforms.uShade.value=this.tex;this.top=new Float32Array(RES*RES);this.open=new Float32Array(RES*RES).fill(1);this.inputs=null;this.job=null;this.sun=null;this.aoReady=false}gather(){const map=this.map;const ground=map.ground??map.grids?.terrain;const hs=map.objects.heights;const fs=map.solid;const os=map.objects.solid;const tops=new Float32Array(RES*RES);let max=0;for(let k=0;k<tops.length;k++){let h=hs?.[k]||0;if(!h&&(fs?.[k]||os?.[k]))h=SOLID_H;tops[k]=h>0?ground[k]+h:-1e9;if(h>max)max=h}return{tops,ground,max}}update(){const map=this.map;const life=map.game?.life?.state==="on";const sunDir=dayUniforms.uSunDir.value;shadeUniforms.uSunUp.value=THREE.MathUtils.smoothstep(sunDir.y,.02,.12);if(map.group){const{v}=map.scales();const size=map.size;const base=map.uniforms.uBase.value;_a.set(1/size,0,0,.5,0,1/v,0,base,0,0,1/size,.5,0,0,0,1);map.group.updateWorldMatrix(true,false);shadeUniforms.uShadeM.value.multiplyMatrices(_a,_inv.copy(map.group.matrixWorld).invert());const src=map.source;const mpp=src?.meta?.metresPerPixel??1;if(src?.span&&src.west!=null){const e0=src.west+(src.cx-src.span/2)*mpp;const n0=src.north-(src.cy-src.span/2)*mpp;shadeUniforms.uShadeGeo.value.set(src.span*mpp,e0-Math.floor(e0/1e3)*1e3,n0-Math.floor(n0/1e3)*1e3)}}const key=[map.ground??map.grids?.terrain,map.objects.heights,map.solid,map.objects.solid];if(!this.inputs||key.some((x,n)=>x!==this.inputs.key[n])){if(!key[0]||!key[1]){shadeUniforms.uShadeOn.value=0;return}this.inputs={key,...this.gather()};this.job=null;this.aoReady=false;this.sun=null;shadeUniforms.uShadeOn.value=0}if(!life||!this.inputs.max)return;if(!this.job){if(!this.aoReady)this.job=this.aoJob();else if(!this.sun||this.sun.y<=.02&&sunDir.y>.02){this.sun=sunDir.clone();this.job=this.sunJob(this.sun)}else return}const t0=performance.now();while(performance.now()-t0<BUDGET){if(this.job.next().done){this.job=null;break}}}*aoJob(){const{tops,ground}=this.inputs;const mpp=this.map.span/RES;const dirs=Array.from({length:8},(_,n)=>[Math.cos(n*Math.PI/4),Math.sin(n*Math.PI/4)]);for(let j=0;j<RES;j++){for(let i=0;i<RES;i++){const k=j*RES+i;const g=ground[k];let occ=0;for(const[dx,dy]of dirs){let best=0;for(let s=1;s<=AO_STEPS;s++){const x=Math.round(i+dx*s);const y=Math.round(j+dy*s);if(x<0||y<0||x>=RES||y>=RES)break;const t=(tops[y*RES+x]-g)/(s*mpp);if(t>best)best=t}occ+=Math.atan(best)}this.open[k]=1-occ/(8*Math.PI/2)}if(j%8===7)yield}this.aoReady=true}*sunJob(dir){const{tops,ground,max}=this.inputs;const mpp=this.map.span/RES;const flat=Math.hypot(dir.x,dir.z);const top=this.top;if(dir.y<=.02||flat<1e-4){top.fill(-1e9)}else{const tanE=dir.y/flat;const ux=dir.x/flat;const uy=dir.z/flat;const steps=Math.min(60,Math.ceil(max/(mpp*tanE)));const fall=mpp*tanE;for(let j=0;j<RES;j++){for(let i=0;i<RES;i++){let best=-1e9;const own=tops[j*RES+i]+.5;for(let s=1;s<=steps;s++){const x=Math.round(i+ux*s);const y=Math.round(j+uy*s);if(x<0||y<0||x>=RES||y>=RES)break;const t=tops[y*RES+x];if(t<own)continue;const c=t-s*fall;if(c>best)best=c}top[j*RES+i]=best}if(j%4===3)yield}}const h=this.half;const f=THREE.DataUtils.toHalfFloat;for(let k=0;k<RES*RES;k++){h[k*4]=f(Math.max(-1e3,top[k]));h[k*4+1]=f(this.open[k]);h[k*4+2]=f(ground[k]);h[k*4+3]=f(1);if(k%32768===32767)yield}this.tex.needsUpdate=true;shadeUniforms.uShadeOn.value=1}}const _a=new THREE.Matrix4;const _inv=new THREE.Matrix4;const GRIME_GLSL=`
  float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float gNoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  vec3 grime(vec3 w, vec3 n, float above) {
    float wall = 1.0 - abs(n.y);
    float blot = gNoise(w * 0.8) * 0.55 + gNoise(w * 2.6) * 0.3 + gNoise(w * 7.0) * 0.15;
    float streak = gNoise(vec3(w.x * 4.0, w.y * 0.15, w.z * 4.0));
    float base = 1.0 - smoothstep(0.0, 1.3, above);
    float d = 0.4 * smoothstep(0.4, 0.75, blot) + 0.3 * smoothstep(0.5, 0.85, streak) * wall + 0.45 * base * wall * (0.6 + 0.4 * blot);
    return mix(vec3(1.0), vec3(0.5, 0.43, 0.33), clamp(d, 0.0, 0.75));
  }
`;function shadeMaterial(m,{grime=false}={}){if(!m||m.userData.shaded||!(m.isMeshStandardMaterial||m.isMeshLambertMaterial||m.isMeshPhongMaterial))return;m.userData.shaded=true;m.userData.grime=grime;const prev=m.onBeforeCompile;const prevKey=m.customProgramCacheKey;m.onBeforeCompile=(sh,r)=>{prev?.call(m,sh,r);Object.assign(sh.uniforms,shadeUniforms);sh.vertexShader=sh.vertexShader.replace("#include <common>","#include <common>\nvarying vec3 vShW;\nvarying vec3 vShN;").replace("#include <project_vertex>",`#include <project_vertex>
        vec4 shP = vec4(transformed, 1.0);
        vec3 shN = objectNormal;
        #ifdef USE_INSTANCING
          shP = instanceMatrix * shP;
          shN = mat3(instanceMatrix) * shN;
        #endif
        #ifdef USE_BATCHING
          shP = batchingMatrix * shP;
          shN = mat3(batchingMatrix) * shN;
        #endif
        vShW = (modelMatrix * shP).xyz;
        vShN = normalize(mat3(modelMatrix) * shN);`);sh.fragmentShader=sh.fragmentShader.replace("#include <common>",`#include <common>
        varying vec3 vShW;
        varying vec3 vShN;
        uniform sampler2D uShade;
        uniform mat4 uShadeM;
        uniform float uShadeOn, uSunUp;
        uniform vec3 uShadeGeo;
        ${SHADE_GLSL}
        ${grime?GRIME_GLSL:""}`).replace("#include <dithering_fragment>",`
        if (uShadeOn > 0.5) {
          vec3 side = vec3(vShN.x, 0.0, vShN.z) * 0.8;
          vec2 a = (uShadeM * vec4(vShW + side, 1.0)).xz;
          vec2 b = (uShadeM * vec4(vShW - side, 1.0)).xz;
          vec4 sa = texture2D(uShade, a);
          vec4 sb = texture2D(uShade, b);
          float od = (uShadeM * vec4(vShW, 1.0)).y;
          gl_FragColor.rgb *= shadeFactor(od, min(sa.r, sb.r), max(sa.g, sb.g), min(sa.b, sb.b));
          ${grime?`vec3 sl = (uShadeM * vec4(vShW, 1.0)).xyz;
          vec3 gw = vec3(sl.x * uShadeGeo.x + uShadeGeo.y, sl.y, uShadeGeo.z - sl.z * uShadeGeo.x); // (metres on the ground's grid)
          gl_FragColor.rgb *= grime(gw, vShN, od - min(sa.b, sb.b));`:""}
        }
        #include <dithering_fragment>`)};m.customProgramCacheKey=()=>(prevKey?prevKey.call(m):"")+(grime?"|shade|grime":"|shade");m.needsUpdate=true}export{SHADE_GLSL,Shade,shadeMaterial,shadeUniforms};
