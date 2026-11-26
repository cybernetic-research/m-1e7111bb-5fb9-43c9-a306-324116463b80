import{letterFace,spell}from"./futhorc.js";import{TOURS}from"./tours.js";import{makeJourney}from"./journeys.js";import{phTexture}from"./phtex.js";const kitTexture=name=>{const t=new THREE.TextureLoader().load(`assets/models/megakit/${name}.png`);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t};import*as THREE from"three";import{dayUniforms}from"./daylight.js";import{fogUniforms,FOG_PARS,FOG_VARY,fogVertex}from"./fog.js";import{Shade,shadeUniforms,SHADE_GLSL}from"./shade.js";import{MODELLED}from"./landmarks.js";import{FarTerrain}from"./far.js";import{evidenceReport}from"./evidence.js";import{scanPlaced}from"./splats.js";import{RES}from"./terrain.js";import{OVR,BASEMAPS,composeOverlay}from"./overlay.js";import{traceContours,ringMaterial}from"./rings.js";import{Features}from"./features.js";import{Captions}from"./captions.js";import{Objects}from"./objects.js";import{Views}from"./views.js";import{ScenarioPlayer}from"./scenarios.js";const LATER_NAMES={clifton:[1836,"Clifton and the Avon Gorge","The Avon Gorge"],"clevedon-pier":[1869,"Clevedon","Clevedon"],"birnbeck-pier":[1867,"Birnbeck and Worlebury","Birnbeck Island"],"sea-mills":[9999,"Sea Mills","Sea Mills"]};const MESH=384;const FLAT=.02;const MAX_EXAG=2;const LIFE_SPAN=600;const UP=new THREE.Vector3(0,1,0);const vertexShader=`
  uniform sampler2D uHeight;
  uniform sampler2D uContour;
  uniform float uBase, uVScale, uHScale, uRise;
  uniform mat4 uHolder; 
  varying vec2 vUv;
  varying vec2 vClip;
  ${FOG_VARY}
  void main() {
    vUv = vec2(uv.x, 1.0 - uv.y); 
    vec3 p = position;
    
    float ground = texture2D(uContour, vUv).r;
    float surface = texture2D(uHeight, vUv).r;
    p.y += ((ground - uBase) * uVScale + (surface - ground) * uHScale) * uRise;
    vClip = (uHolder * vec4(p, 1.0)).xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    ${fogVertex("modelViewMatrix * vec4(p, 1.0)")}
  }
`;const fragmentShader=`
  ${FOG_PARS}
  uniform sampler2D uHeight;
  uniform sampler2D uContour;
  uniform sampler2D uOverlay;
  uniform sampler2D uRiver; 
  uniform sampler2D uStreets; 
  uniform sampler2D uTexCobble, uTexMud, uTexYard; 
  uniform float uTime;
  uniform float uBeachKind, uBeachTop, uMudBelow, uSandSouthOf;
  uniform float uInterval, uMin, uMax, uRise, uHalf, uCell, uReveal, uExag, uEdge, uOverlayOn, uBaseOn, uLines, uOpacity, uSolid, uTundra, uPaved;
  uniform vec3 uDayTint, uSunDir, uSkyHaze; 
  uniform sampler2D uShade; 
  uniform float uShadeOn, uSunUp;
  ${SHADE_GLSL}
  uniform float uNight;
  uniform float uEvidence; 
  varying vec2 vUv;
  varying vec2 vClip;

  float hash12(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  vec3 tint(float t) {
    vec3 a = vec3(0.16, 0.38, 0.22), b = vec3(0.62, 0.62, 0.38), c = vec3(0.56, 0.40, 0.27), d = vec3(0.95, 0.94, 0.92);
    return t < 0.4 ? mix(a, b, t / 0.4) : t < 0.75 ? mix(b, c, (t - 0.4) / 0.35) : mix(c, d, (t - 0.75) / 0.25);
  }

  
  
  
  uniform vec3 uRedRock;
  float redRockAmount(float slope) {
    if (uRedRock.z <= 0.0) return 0.0;
    float d = length(vUv - uRedRock.xy) / uRedRock.z;
    return (1.0 - smoothstep(0.7, 1.0, d)) * mix(0.35, 1.0, smoothstep(0.2, 0.55, slope));
  }
  vec3 redRock(float e, float grain) {
    float band = 0.9 + 0.1 * sin(e * 5.0) + 0.06 * sin(e * 13.0);
    return vec3(0.58, 0.29, 0.19) * band * (0.85 + 0.3 * grain);
  }
  void main() {
    float r = length(vClip);
    if (r > uHalf) discard;
    
    float sweep = vUv.y;
    if (sweep > uReveal) discard;

    float e = texture2D(uHeight, vUv).r;
    vec2 px = vec2(1.0 / ${RES}.0, 0.0);
    float gx = (texture2D(uHeight, vUv + px.xy).r - texture2D(uHeight, vUv - px.xy).r) / (2.0 * uCell);
    float gn = (texture2D(uHeight, vUv - px.yx).r - texture2D(uHeight, vUv + px.yx).r) / (2.0 * uCell);
    vec3 n = normalize(vec3(-gx * uExag, 1.0, gn * uExag));
    
    vec3 sun = normalize(mix(vec3(-1.0, 1.3, -1.0), uSunDir, uSolid));
    float shade = clamp(dot(n, sun), 0.0, 1.0);
    float light = mix(0.75 + 0.45 * shade, mix(0.35, 0.62, uSolid) + mix(0.95, 0.52, uSolid) * shade, uRise); 

    float t = clamp((e - uMin) / max(uMax - uMin, 1.0), 0.0, 1.0);
    
    
    float slope = length(vec2(gx, gn));
    
    
    
    if (uPaved > 1.5 && uPaved < 2.5 && uSolid > 0.5) {
      vec2 mq = vUv * ${RES}.0 * uCell; 
      vec4 sq = texture2D(uStreets, vUv);
      vec3 mudq = texture2D(uTexMud, mq / 4.0).rgb * vec3(0.80, 0.72, 0.62);
      vec3 cob = texture2D(uTexCobble, mq / 2.5).rgb;
      
      
      float saxonq = step(2.05, uPaved);
      vec3 g0 = mix(mudq, mix(cob, mudq * 0.92, saxonq), smoothstep(0.35, 0.65, sq.g));
      vec3 fieldq = mix(vec3(0.40, 0.33, 0.23), vec3(0.33, 0.40, 0.21), saxonq) * (0.85 + 0.3 * mudq.r);
      g0 = mix(g0, fieldq, 1.0 - smoothstep(0.2, 0.8, sq.a));
      g0 = mix(g0, redRock(e, mudq.r), redRockAmount(slope) * (1.0 - smoothstep(0.35, 0.65, sq.g)));
      
      if (uBeachKind > 0.5 && e < uBeachTop) g0 = mix(g0, vec3(0.28, 0.25, 0.21) * (0.85 + 0.3 * mudq.r), 1.0 - smoothstep(uBeachTop - 0.8, uBeachTop, e));
      vec3 cq = g0 * light;
      if (uShadeOn > 0.5) {
        vec4 shq = texture2D(uShade, vUv);
        cq *= shadeFactor(shq.b, shq.r, shq.g, shq.b);
      }
      cq *= uDayTint;
      cq = mix(cq, uFogCol, fogAmount());
      gl_FragColor = vec4(cq, smoothstep(uHalf, uHalf - uEdge, r) * uOpacity);
      return;
    }
    float mottle = 0.5 + 0.25 * sin(vUv.x * 1900.0 + sin(vUv.y * 1300.0) * 2.0) * sin(vUv.y * 1700.0 + sin(vUv.x * 1100.0) * 2.0);
    vec3 grass = mix(vec3(0.25, 0.38, 0.16), vec3(0.38, 0.47, 0.22), mottle);
    grass = mix(grass, vec3(0.44, 0.38, 0.27), smoothstep(0.45, 0.9, slope));
    
    
    float drift = vnoise(vUv * 180.0) * 0.55 + vnoise(vUv * 650.0) * 0.3 + vnoise(vUv * 2400.0) * 0.15;
    vec3 tundra = mix(vec3(0.56, 0.58, 0.48), vec3(0.90, 0.92, 0.93), smoothstep(0.42, 0.6, drift) * (1.0 - smoothstep(0.25, 0.6, slope)));
    grass = mix(grass, tundra, uTundra);
    
    
    
    
    
    
    vec2 mm = vUv * ${RES}.0 * uCell; 
    
    float near = 1.0 - smoothstep(0.02, 0.07, length(fwidth(mm)));
    vec2 sc = mm / vec2(0.2, 0.11);
    sc.x += step(0.5, fract(sc.y * 0.5)) * 0.5;
    vec2 sf = fract(sc);
    float sh = fract(sin(dot(floor(sc), vec2(12.9898, 78.233))) * 43758.5453);
    vec3 setts = mix(vec3(0.40, 0.40, 0.41), vec3(0.52, 0.50, 0.48), sh) * (1.0 - 0.4 * step(0.88, max(sf.x, sf.y)));
    setts = mix(vec3(0.43, 0.42, 0.42), setts, near);
    
    
    vec2 pc = mm / 0.12;
    vec2 pg = floor(pc);
    vec2 pfr = fract(pc);
    float d1 = 8.0;
    float d2 = 8.0;
    float ph = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 h = vec2(fract(sin(dot(pg + o, vec2(127.1, 311.7))) * 43758.5453), fract(sin(dot(pg + o, vec2(269.5, 183.3))) * 43758.5453));
        vec2 r = o + 0.1 + h * 0.8 - pfr;
        float d = dot(r, r);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          ph = h.x;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
    float stone = smoothstep(0.04, 0.22, sqrt(d2) - sqrt(d1));
    vec3 pebbles = mix(vec3(0.33, 0.29, 0.24), mix(vec3(0.46, 0.43, 0.38), vec3(0.60, 0.55, 0.47), ph) * (0.85 + 0.25 * stone), stone);
    pebbles = mix(vec3(0.44, 0.40, 0.34), pebbles, near);
    vec3 earth = mix(vec3(0.42, 0.35, 0.26), vec3(0.52, 0.45, 0.34), vnoise(mm * 0.4));
    earth *= 0.9 + 0.15 * vnoise(mm * 4.0);
    earth = mix(earth, pebbles, smoothstep(0.66, 0.74, vnoise(mm * 0.05)) * 0.85);
    vec3 tar = mix(vec3(0.22, 0.22, 0.23), vec3(0.30, 0.30, 0.30), vnoise(mm * 3.0));
    vec2 fc = mm / vec2(0.9, 0.6);
    vec2 ff = fract(fc);
    float fh = fract(sin(dot(floor(fc), vec2(7.1, 3.7))) * 43758.5453);
    vec3 flags = mix(vec3(0.55, 0.53, 0.49), vec3(0.63, 0.60, 0.55), fh) * (1.0 - 0.35 * step(0.95, max(ff.x, ff.y)) * near);
    vec4 st = texture2D(uStreets, vUv);
    vec3 street = mix(flags, tar, smoothstep(0.55, 0.7, st.r));
    street = mix(street, vec3(0.66, 0.65, 0.62), smoothstep(0.38, 0.5, st.r) - smoothstep(0.5, 0.6, st.r));
    
    
    vec3 cobble = texture2D(uTexCobble, mm / 2.5).rgb;
    vec3 mud = texture2D(uTexMud, mm / 4.0).rgb;
    vec3 yard = texture2D(uTexYard, mm / 3.0).rgb;
    float tracks = smoothstep(0.55, 0.75, vnoise(mm * 0.12)) * 0.7;
    
    tracks = max(tracks, step(2.05, uPaved) * step(uPaved, 2.5) * (0.75 + 0.2 * vnoise(mm * 0.5)));
    vec3 oldStreet = mix(cobble, mud, tracks);
    
    
    float kennel = smoothstep(0.9, 0.97, st.g) * (0.7 + 0.3 * vnoise(mm * 1.3));
    oldStreet = mix(oldStreet, vec3(0.13, 0.11, 0.08), kennel * 0.75);
    float puddle = smoothstep(0.6, 0.66, vnoise(mm * 0.3) * 0.65 + vnoise(mm * 1.6) * 0.35) * smoothstep(0.2, 0.6, tracks + kennel);
    oldStreet = mix(oldStreet, mix(vec3(0.10, 0.09, 0.08), uSkyHaze * 0.55, 0.55), puddle);
    vec2 dg = floor(mm / 0.9);
    vec2 dr = fract(mm / 0.9) - 0.5 - (vec2(hash12(dg), hash12(dg + 5.0)) - 0.5) * 0.6;
    float dung = step(0.93, hash12(dg + 11.0)) * (1.0 - smoothstep(0.08, 0.16, length(dr)));
    oldStreet = mix(oldStreet, vec3(0.20, 0.15, 0.08), dung * near);
    float straw = smoothstep(0.78, 0.86, vnoise(vec2(mm.x * 2.5 + mm.y * 0.7, mm.y * 2.5 - mm.x * 0.6))) * step(0.55, vnoise(mm * 0.2));
    oldStreet = mix(oldStreet, vec3(0.62, 0.52, 0.30), straw * 0.55 * near);
    float sides = 1.0 - smoothstep(0.35, 0.8, st.g);
    oldStreet *= 1.0 - 0.3 * sides * (0.6 + 0.4 * vnoise(mm * 0.7));
    
    float wobble = (vnoise(mm * 0.45) - 0.5) * 0.22;
    earth = mix(yard * 0.95, oldStreet, smoothstep(0.3, 0.7, st.g + wobble));
    vec3 paving = setts;
    paving = mix(paving, earth, step(1.5, uPaved) * step(uPaved, 2.5));
    paving = mix(paving, pebbles, step(2.5, uPaved) * step(uPaved, 3.5));
    paving = mix(paving, mix(setts, street, step(0.5, st.g)), step(3.5, uPaved));
    
    vec3 lawn = mix(vec3(0.30, 0.40, 0.20), vec3(0.40, 0.46, 0.25), vnoise(mm * 0.8));
    float bed = step(0.55, fract(mm.x / 1.1 + vnoise(mm * 0.05) * 3.0)) * step(0.45, vnoise(mm * 0.06));
    vec3 gardenCol = mix(lawn, vec3(0.34, 0.27, 0.19) * (0.9 + 0.2 * vnoise(mm * 5.0)), bed * 0.85);
    paving = mix(paving, gardenCol, smoothstep(0.3, 0.7, st.b) * step(1.5, uPaved) * step(uPaved, 3.5));
    
    vec3 field = mix(vec3(0.33, 0.43, 0.21), vec3(0.42, 0.48, 0.27), vnoise(mm * 0.15)) * (0.9 + 0.15 * vnoise(mm * 2.0));
    paving = mix(paving, field, (1.0 - smoothstep(0.2, 0.8, st.a)) * step(1.5, uPaved) * step(uPaved, 3.5));
    
    paving *= 0.88 + 0.22 * vnoise(mm * 0.25);
    grass = mix(grass, paving, min(uPaved, 1.0));
    vec3 land = mix(tint(t), grass, max(uSolid * (1.0 - uBaseOn), uTundra));
    vec3 col = (e <= 0.3 ? vec3(0.13, 0.33, 0.58) : land) * light;
    vec4 ov = texture2D(uOverlay, vUv);
    
    col = mix(col, ov.rgb * mix(1.0, 0.72 + 0.4 * shade, uRise), ov.a * uOverlayOn * (1.0 - uTundra) * mix(1.0, 0.6, uSolid));
    
    float leafy = smoothstep(0.0, 0.06, ov.g - max(ov.r, ov.b));
    
    col = mix(col, paving * light, min(uPaved, 1.0) * uSolid * mix((1.0 - leafy) * 0.85, 1.0, step(1.5, uPaved)));
    
    
    if (uBeachKind > 0.5 && uSolid > 0.0 && e < uBeachTop) {
      float sandy = uBeachKind > 2.5 ? 0.0 : uBeachKind > 1.5 ? 1.0 : step(uSandSouthOf, vUv.y);
      float fine = vnoise(vUv * 5200.0);
      float ripple = 0.5 + 0.5 * sin(vUv.x * 2600.0 + vnoise(vUv * 300.0) * 6.0);
      vec3 sand = mix(vec3(0.80, 0.72, 0.52), vec3(0.90, 0.83, 0.64), ripple * 0.6 + fine * 0.4);
      float stone = vnoise(vUv * 9000.0);
      vec3 pebbles = mix(vec3(0.38, 0.36, 0.33), vec3(0.62, 0.58, 0.52), smoothstep(0.3, 0.7, stone));
      pebbles = mix(pebbles, vec3(0.50, 0.40, 0.30), step(0.82, vnoise(vUv * 4100.0 + 7.0)));
      vec3 mud = mix(vec3(0.30, 0.27, 0.23), vec3(0.42, 0.38, 0.32), fine) + 0.06 * ripple;
      
      float ledge = smoothstep(0.6, 0.68, vnoise(vUv * 1300.0) * 0.7 + vnoise(vUv * 4000.0) * 0.3) * step(uBeachKind, 2.5); 
      vec3 rock = mix(vec3(0.22, 0.22, 0.19), vec3(0.46, 0.44, 0.40), smoothstep(uMudBelow - 1.0, uMudBelow + 2.0, e)) * (0.8 + 0.4 * fine);
      pebbles = mix(pebbles, rock, ledge);
      mud = mix(mud, rock * 0.85, ledge * (1.0 - sandy));
      vec3 upper = mix(pebbles, sand, sandy);
      vec3 beach = mix(mud, upper, smoothstep(uMudBelow - 0.6, uMudBelow + 0.6, e));
      float w = uSolid * (1.0 - smoothstep(uBeachTop - 0.8, uBeachTop, e)) * (1.0 - smoothstep(0.5, 1.0, slope));
      col = mix(col, beach * (0.6 + 0.5 * shade), w * 0.9);
    }
    
    float riv = texture2D(uRiver, vUv).r;
    if (riv > 0.0) {
      float streak = vnoise(vUv * 1400.0 + vec2(uTime * 0.7, uTime * 0.45));
      vec3 water = mix(vec3(0.22, 0.34, 0.38), vec3(0.78, 0.86, 0.88), pow(streak, 3.0));
      col = mix(col, water * (0.75 + 0.35 * shade), riv * 0.92);
    }
    
    float cliff = smoothstep(1.1, 1.8, slope) * uSolid;
    col = mix(col, vec3(0.66, 0.64, 0.58) * (0.55 + 0.6 * shade), cliff);
    col = mix(col, redRock(e, mottle) * light, redRockAmount(slope) * uSolid);

    float ec = texture2D(uContour, vUv).r;
    float c = ec / uInterval;
    float minor = 1.0 - smoothstep(0.5, 1.5, abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-5));
    float c5 = c / 5.0;
    float major = 1.0 - smoothstep(1.0, 2.2, abs(fract(c5 - 0.5) - 0.5) / max(fwidth(c5), 1e-6));
    float line = max(minor * 0.7, major) * step(0.3, ec) * uLines * mix(1.0, 0.55, uBaseOn);

    vec3 ink = mix(vec3(1.0, 0.92, 0.72), vec3(0.18, 0.1, 0.05), uRise * 0.85);
    col = mix(col, ink, line);
    
    if (uShadeOn > 0.5 && uSolid > 0.5) {
      vec4 sh = texture2D(uShade, vUv);
      col *= shadeFactor(sh.b, sh.r, sh.g, sh.b);
    }
    col *= mix(vec3(1.0), uDayTint, uSolid); 
    float alpha = max(max(mix(0.35, 0.96, uRise), line), ov.a * uOverlayOn * 0.92);
    alpha = mix(alpha, 1.0, uSolid); 
    float edge = smoothstep(uHalf, uHalf - uEdge, r);
    col += vec3(0.5, 0.9, 1.0) * smoothstep(0.02, 0.0, uReveal - sweep) * step(uReveal, 0.999);
    if (uEvidence > 0.5) {
      float lum = dot(col, vec3(0.3, 0.59, 0.11));
      vec3 grey = vec3(0.25 + 0.6 * lum);
      col = mix(grey, vec3(0.88, 0.63, 0.13) * (0.6 + 0.7 * lum), smoothstep(0.3, 0.7, st.g) * uSolid);
    }
    col = mix(col, uFogCol, fogAmount() * uSolid);
    gl_FragColor = vec4(col, alpha * edge * uOpacity);
  }
`;function levelPads(grid,pads){const out=Float32Array.from(grid);for(const{i,j,r,skirt,h,rect}of pads){if(rect){levelRect(out,i,j,rect,skirt,h);continue}const R=Math.ceil(r+skirt);for(let dj=-R;dj<=R;dj++){for(let di=-R;di<=R;di++){const x=Math.round(i)+di;const y=Math.round(j)+dj;if(x<0||y<0||x>=RES||y>=RES)continue;const d=Math.hypot(x-i,y-j);if(d>r+skirt)continue;const k=y*RES+x;const t=d<=r?1:1-(d-r)/skirt;out[k]=out[k]+(h-out[k])*t*t*(3-2*t)}}}return out}function levelRect(out,i,j,{x0,z0,x1,z1,cos,sin,mpp},skirt,h){const R=Math.ceil(Math.max(Math.hypot(x0,z0),Math.hypot(x1,z0),Math.hypot(x0,z1),Math.hypot(x1,z1))/mpp+skirt);for(let dj=-R;dj<=R;dj++){for(let di=-R;di<=R;di++){const x=Math.round(i)+di;const y=Math.round(j)+dj;if(x<0||y<0||x>=RES||y>=RES)continue;const dx=(x-i)*mpp;const dz=(y-j)*mpp;const mx=dx*cos-dz*sin;const mz=dx*sin+dz*cos;const ex=Math.max(x0-mx,0,mx-x1);const ez=Math.max(z0-mz,0,mz-z1);const d=Math.hypot(ex,ez)/mpp;if(d>skirt)continue;const k=y*RES+x;const t=d<=0?1:1-d/skirt;out[k]=out[k]+(h-out[k])*t*t*(3-2*t)}}}function niceStep(raw){const p=10**Math.floor(Math.log10(raw));for(const m of[1,2,2.5,5,10])if(raw<=m*p)return m*p;return 10*p}function canvasPlane(w,h,width){const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width*h/w),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));return{canvas,ctx:canvas.getContext("2d"),tex,mesh}}function drawMarker(sprite,text){const canvas=sprite.material.map.image;const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);let size=44;do ctx.font=`bold ${size}px ui-monospace, Menlo, monospace`;while(ctx.measureText(text).width>490&&(size-=2)>16);ctx.textAlign="center";ctx.textBaseline="middle";ctx.lineWidth=10;ctx.strokeStyle="rgba(10,14,20,0.85)";ctx.strokeText(text,256,48);ctx.fillStyle="#ffe9b8";ctx.fillText(text,256,48);sprite.material.map.needsUpdate=true}function marker(){const canvas=document.createElement("canvas");canvas.width=512;canvas.height=96;const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true}));sprite.center.set(.5,0);sprite.renderOrder=10;const pin=new THREE.Mesh(new THREE.CylinderGeometry(.0015,.0015,1,6),new THREE.MeshBasicMaterial({color:16771512}));const group=new THREE.Group;group.add(pin,sprite);return{group,pin,sprite}}const ease=t=>t*t*(3-2*t);const _v=new THREE.Vector3;const _q=new THREE.Quaternion;class ContourMap{constructor(game,sources){this.game=game;this.sources=sources;this.index=0;this.group=new THREE.Group;this.group.visible=false;this.holder=new THREE.Group;this.group.add(this.holder);game.scene.add(this.group);this.heightData=new Uint16Array(RES*RES);this.heightTex=new THREE.DataTexture(this.heightData,RES,RES,THREE.RedFormat,THREE.HalfFloatType);this.riverData=new Uint8Array(RES*RES);this.riverTex=new THREE.DataTexture(this.riverData,RES,RES,THREE.RedFormat,THREE.UnsignedByteType);this.riverTex.magFilter=THREE.LinearFilter;this.riverTex.needsUpdate=true;this.heightTex.minFilter=this.heightTex.magFilter=THREE.LinearFilter;this.streetData=new Uint8Array(RES*RES*4);this.streetTex=new THREE.DataTexture(this.streetData,RES,RES,THREE.RGBAFormat,THREE.UnsignedByteType);this.streetTex.minFilter=this.streetTex.magFilter=THREE.LinearFilter;this.streetTex.needsUpdate=true;this.contourData=new Uint16Array(RES*RES);this.contourTex=new THREE.DataTexture(this.contourData,RES,RES,THREE.RedFormat,THREE.HalfFloatType);this.contourTex.minFilter=this.contourTex.magFilter=THREE.LinearFilter;this.overlayCanvas=document.createElement("canvas");this.overlayCanvas.width=this.overlayCanvas.height=OVR;this.overlayTex=new THREE.CanvasTexture(this.overlayCanvas);this.overlayTex.colorSpace=THREE.NoColorSpace;this.overlayTex.flipY=false;this.overlayTex.anisotropy=8;this.uniforms={uHeight:{value:this.heightTex},uContour:{value:this.contourTex},uOverlay:{value:this.overlayTex},uBase:{value:0},uVScale:{value:0},uHScale:{value:0},uRise:{value:0},uHolder:{value:new THREE.Matrix4},uInterval:{value:5},uMin:{value:0},uMax:{value:1},uHalf:{value:.4},uCell:{value:1},uReveal:{value:0},uExag:{value:1},uEdge:{value:.012},uOverlayOn:{value:0},uBaseOn:{value:0},uLines:{value:1},uOpacity:{value:1},uTundra:{value:0},uPaved:{value:0},uTime:{value:0},uBeachKind:{value:0},uBeachTop:{value:0},uMudBelow:{value:0},uSandSouthOf:{value:2},uRiver:{value:this.riverTex},uStreets:{value:this.streetTex},uTexCobble:{value:phTexture("cobblestone_floor_08","diff",true)},uTexPlaster:{value:kitTexture("T_Plaster_BaseColor")},uTexOak:{value:kitTexture("T_WoodTrim_BaseColor")},uTexRoof:{value:kitTexture("T_RoundTiles_BaseColor")},uKitCentre:{value:new THREE.Vector2},uKitR:{value:0},uNearCentre:{value:new THREE.Vector2},uNearR:{value:0},uTexMud:{value:phTexture("muddy_tracks","diff",true)},uTexYard:{value:phTexture("stony_dirt_path","diff",true)},uEvidence:{value:0},uRedRock:{value:new THREE.Vector3},uSize:{value:1},uSolid:{value:0},uSeaHalf:{value:.4},uRoofPhoto:{value:0},...dayUniforms,...fogUniforms,...shadeUniforms};this.material=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader,fragmentShader,transparent:true});this.seaMask=new Uint8Array(RES*RES);this.seaTex=new THREE.DataTexture(this.seaMask,RES,RES,THREE.RedFormat,THREE.UnsignedByteType);this.seaTex.minFilter=this.seaTex.magFilter=THREE.LinearFilter;this.uniforms.uSeaMask={value:this.seaTex};this.uniforms.uSeaLocal={value:new THREE.Matrix4};this.uniforms.uDryC={value:new THREE.Vector2};this.uniforms.uDryAx={value:new THREE.Vector2(1,0)};this.uniforms.uDryHalf={value:new THREE.Vector2};this.sea=new THREE.Mesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,vertexShader:`
        uniform mat4 uHolder, uSeaLocal;
        uniform float uSize;
        varying vec2 vClip;
        varying vec2 vSeaUv;
        void main() {
          vec4 d = uSeaLocal * vec4(position, 1.0); 
          vSeaUv = d.xz / uSize + 0.5;
          vClip = (uHolder * d).xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,fragmentShader:`
        uniform float uSeaHalf, uEdge, uOpacity, uSolid, uNight, uEvidence;
        uniform vec3 uDayTint, uSkyHaze;
        uniform sampler2D uSeaMask;
        uniform vec2 uDryC, uDryAx, uDryHalf;
        varying vec2 vClip;
        varying vec2 vSeaUv;
        void main() {
          float r = length(vClip);
          if (r > uSeaHalf) discard;
          if (texture2D(uSeaMask, clamp(vSeaUv, 0.0, 1.0)).r < 0.5) discard;
          if (uDryHalf.x > 0.0) {
            vec2 q = vSeaUv - uDryC;
            vec2 u = vec2(dot(q, uDryAx), dot(q, vec2(-uDryAx.y, uDryAx.x))) / uDryHalf;
            if (pow(abs(u.x), 4.0) + pow(abs(u.y), 4.0) < 1.0) discard;
          }
          
          vec3 col = vec3(0.36, 0.42, 0.42);
          col = mix(col, mix(col * uDayTint, uSkyHaze * 0.7, 0.25), uSolid); 
          if (uEvidence > 0.5) col = vec3(0.80, 0.58, 0.14); 
          gl_FragColor = vec4(col, mix(0.88, 0.97, uSolid) * smoothstep(uSeaHalf, uSeaHalf - uEdge, r) * uOpacity);
        }
      `}));this.sea.visible=false;this.sea.frustumCulled=false;this.holder.add(this.sea);this.rings=new THREE.LineSegments(new THREE.BufferGeometry,ringMaterial(this.uniforms));this.rings.frustumCulled=false;this.rings.visible=false;this.holder.add(this.rings);this.mesh=null;this.size=0;this.rise=0;this.riseTarget=0;this.exag=1;this.exagFor=-1;this.span=1;this.loading=false;this.queued=false;this.firstLoad=true;this.status="";this.style="surface";this.baseIndex=0;this.water=false;this.era="now";this.eraId="now";this.year=null;this.mode="table";this.lifeT=0;this.peak=marker();this.landmark=marker();this.holder.add(this.peak.group,this.landmark.group);this.RES=RES;this.objects=new Objects(this);this.views=new Views(this);this.tide="mid";this.features=new Features(this);this.shade=new Shade(this);this.far=new FarTerrain(this);this.captions=new Captions(this);this.scenario=new ScenarioPlayer(this,game.audio);this.xray=false;this.overlayJob=0}get source(){return this.sources[this.index]}get base(){return BASEMAPS[this.baseIndex]}place(spec,head){const away=new THREE.Vector3().subVectors(spec.center,head).setY(0);const axes=[spec.xAxis,spec.zAxis,spec.xAxis.clone().negate(),spec.zAxis.clone().negate()];const north=axes.reduce((a,b)=>b.dot(away)>a.dot(away)?b:a).clone().setY(0).normalize();const south=north.clone().negate();const east=new THREE.Vector3().crossVectors(north,UP);const alongNS=Math.abs(north.dot(spec.zAxis))>.7?spec.depth:spec.width;const alongEW=Math.abs(north.dot(spec.zAxis))>.7?spec.width:spec.depth;const size=THREE.MathUtils.clamp(Math.min(alongEW-.06,alongNS-.2),.3,1);this.tablePose={position:spec.center.clone().addScaledVector(south,-.07).add(new THREE.Vector3(0,.004,0)),quaternion:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(east,UP,south))};if(this.mode==="table"){this.group.position.copy(this.tablePose.position);this.group.quaternion.copy(this.tablePose.quaternion);this.group.scale.setScalar(1)}if(size!==this.size)this.build(size);this.group.visible=true;if(this.firstLoad&&!this.deferFirst)this.load()}build(size){this.size=size;if(this.mesh){this.mesh.geometry.dispose();this.mesh.removeFromParent()}const geometry=new THREE.PlaneGeometry(size,size,MESH-1,MESH-1).rotateX(-Math.PI/2);this.mesh=new THREE.Mesh(geometry,this.material);this.mesh.frustumCulled=false;this.holder.add(this.mesh);this.uniforms.uHalf.value=size/2;this.uniforms.uSize.value=size;this.frame?.removeFromParent();const h=size/2+.006;this.frame=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({length:96},(_,k)=>new THREE.Vector3(Math.cos(k/96*Math.PI*2)*h,.001,Math.sin(k/96*Math.PI*2)*h))),new THREE.LineBasicMaterial({color:16771512,transparent:true,opacity:.6}));this.group.add(this.frame);this.sign?.mesh.removeFromParent();this.sign=canvasPlane(1024,300,Math.min(size,.6));this.sign.mesh.position.set(0,.17,-size/2-.03);this.signMap?.removeFromParent();if(this.game.minimap){const sw=Math.min(size,.6);const sh=sw*300/1024;this.signMap=this.game.minimap.mesh(sh*1.15);this.signMap.material.depthTest=true;this.signMap.renderOrder=0;this.signMap.position.set(-sw/2-sh*.6-.008,.17+sh*.075,-size/2-.03);this.group.add(this.signMap)}this.group.add(this.sign.mesh);this.drawSign();this.game.ui.layout(this,size)}load(){if(this.loading){this.queued=true;return}this.loading=true;this.status="LOADING\u2026";this.drawSign();const source=this.source;source.window().then(elev=>{if(source===this.source)return this.apply(elev)}).catch(err=>{console.error(err);this.status="NO TERRAIN DATA (OFFLINE?)";this.drawSign()}).finally(()=>{this.loading=false;if(this.queued){this.queued=false;this.load()}})}nextFrame(label){const session=this.game.renderer.xr.isPresenting?this.game.renderer.xr.getSession():null;const one=()=>new Promise(r=>{let done=false;const go=()=>{if(done)return;done=true;setTimeout(r,0)};if(session)session.requestAnimationFrame(go);else requestAnimationFrame(go);setTimeout(go,300)});const p=(this.frameQueue??Promise.resolve()).then(one);this.frameQueue=p;if(label)p.then(()=>(this.stageLog??=[]).push([label,Math.round(performance.now())]));return p}async apply({terrain,surface}){const source=this.source;const was=this.windowAt;if(was&&was.span===source.span&&this.grids&&(was.cx!==source.cx||was.cy!==source.cy))this.shiftOld(source.cx-was.cx,source.cy-was.cy,source.span);this.windowAt={cx:source.cx,cy:source.cy,span:source.span};this.objectsReady=false;this.crossings=null;this.grids={terrain,surface};this.span=source.span;if(!this.eras.some(e=>e.id===this.eraId)){this.era="now";this.eraId="now";this.year=null}const deferObjects=source.onApply?.(this)==="defer";await this.nextFrame("apply:relief");let min=Infinity;let max=-Infinity;let peakI=0;for(let i=0;i<terrain.length;i++){const e=terrain[i];this.contourData[i]=THREE.DataUtils.toHalfFloat(e);if(e<min)min=e;if(e>max){max=e;peakI=i}}this.contourTex.needsUpdate=true;this.showGrid();this.span=source.span;const range=Math.max(max-Math.max(min,0),1);Object.assign(this,{min,max});const u=this.uniforms;u.uMin.value=Math.max(min,0);u.uMax.value=max;u.uBase.value=Math.min(min,source.baseFloor??min);u.uInterval.value=niceStep(range/18);u.uCell.value=this.span/RES;if(this.exagFor!==this.index){this.exagFor=this.index;this.scenario.reset();this.xray=false;this.game.ui.layout(this,this.size);const trueScale=this.size/this.span;this.exag=THREE.MathUtils.clamp(Math.round(FLAT/Math.max(1e-6,range*trueScale)*2)/2,1,MAX_EXAG);this.resetView();u.uReveal.value=0}else if(this.pendingView){const{visible,real}=this.pendingView;const k=this.span/visible;this.holder.scale.setScalar(k);const d=this.realToData(real);_v.set(d.x,0,d.z).multiplyScalar(k).applyAxisAngle(UP,this.holder.rotation.y);this.holder.position.set(-_v.x,0,-_v.z)}this.pendingView=null;if(this.mode==="life")u.uReveal.value=1;this.peakAt={i:peakI%RES,j:Math.floor(peakI/RES),e:max};drawMarker(this.peak.sprite,`\u25B2 ${Math.round(max)} m`);const lm=source.landmarks()[0];this.landmarkAt=lm&&{i:lm.x/this.span*RES,j:lm.y/this.span*RES};if(this.landmarkAt){const r=Math.round(60/(this.span/RES));let best={i:this.landmarkAt.i,j:this.landmarkAt.j,e:this.sample(this.landmarkAt.i,this.landmarkAt.j)};for(let dj=-r;dj<=r;dj++){for(let di=-r;di<=r;di++){const i=Math.round(this.landmarkAt.i)+di;const j=Math.round(this.landmarkAt.j)+dj;if(di*di+dj*dj>r*r||i<0||j<0||i>=RES||j>=RES)continue;const e=this.sample(i,j);if(e>best.e)best={i,j,e}}}this.landmarkAt=best;const later=LATER_NAMES[source.slug];const year=this.eras?.find(e=>e.id===(this.eraId??this.era))?.year;const lmName=later&&year!=null&&year<later[0]?later[2]:lm.name;drawMarker(this.landmark.sprite,`${lmName} ${Math.round(best.e)} m`)}this.captions.rebuild(source);this.views.rebuild(source);await this.nextFrame("apply:features");if(this.mode==="life")await this.features.rebuildStaged(source,()=>this.nextFrame());else await this.features.rebuildStaged(source,()=>this.nextFrame(),true);if(this.features.activePads().length)this.showGrid();await this.nextFrame("apply:rest");this.far.build(source);if(!deferObjects)this.rebuildObjects();this.floodSea();this.scenario.reanchor();this.game.life?.onApply();if(this.pendingPlan)setTimeout(()=>this.runPlan(),0);this.ringsStale=true;if(this.style==="rings")this.traceRings();this.refreshOverlay();this.status=this.game.ui.picking&&this.dioramaStatus?this.dioramaStatus:"";this.drawSign();this.onApply?.();if(this.features.dropped&&this.features.builtEra!==this.era)this.load();if(this.firstLoad){this.firstLoad=false;setTimeout(()=>{this.riseTarget=1},1600)}}refreshOverlay(){const job=++this.overlayJob;const base=this.base;const c=this.source.corners().nw;const inGB=c.lat>49.8&&c.lat<61&&c.lon>-8.7&&c.lon<1.8;const usable=base.id!=="none"&&!(base.gbOnly&&!inGB)&&(!base.only||this.source.slug===base.only);const extras=[...this.overlayExtras??[],...this.source.overlayFor?.(this,this.era)??[]];const want=usable||this.water||this.source.osm||extras.length;this.uniforms.uBaseOn.value=usable?1:0;this.uniforms.uRoofPhoto.value=0;if(!want){this.uniforms.uOverlayOn.value=0;return}const baseDraw=usable&&base.plan?async ctx=>(await import("./planmap.js")).drawPlan(ctx,this,OVR,{legend:false}):usable&&base.warp?async ctx=>(await import("./planmap.js")).drawImageMap(ctx,this,OVR,base.warp):null;composeOverlay(this.overlayCanvas,this.source,{base:usable?base:null,water:this.water,sites:true,extras,baseDraw}).then(()=>{if(job!==this.overlayJob)return;this.overlayTex.needsUpdate=true;this.uniforms.uOverlayOn.value=1})}showGrid(){if(!this.grids)return;const then=this.era!=="now"&&!this.source.thenSurface;let ground=this.grids.terrain;if(this.gridOverride)this.elev=this.grids[this.gridOverride];else if(this.source.composeGrid)({ground,surface:this.elev}=this.source.composeGrid(this,this.era));else this.elev=then||this.source.buildings?this.grids.terrain:this.grids.surface;this.uniforms.uTundra.value=this.source.tundraFor?.(this)??0;this.uniforms.uPaved.value=this.source.pavedFor?.(this.era)??(this.source.paved?1:0);const beach=this.source.beachFor?this.source.beachFor(this):this.source.beach;this.uniforms.uBeachKind.value=beach?{sand:2,mud:3}[beach.kind]??1:0;if(beach){this.uniforms.uBeachTop.value=beach.top;this.uniforms.uMudBelow.value=beach.mudBelow;const c=this.source.corners();this.uniforms.uSandSouthOf.value=beach.sandSouthOf?this.source.toWindow(beach.sandSouthOf,(c.nw.lon+c.ne.lon)/2).j/RES:2}const streets=this.source.streetsFor?.(this);if(streets||this.streetsShown){this.streetData.set(streets??new Uint8Array(RES*RES*4));this.streetTex.needsUpdate=true;this.streetsShown=!!streets}const river=this.source.riverFor?.(this,ground);if(river||this.riverShown){this.riverData.set(river??new Uint8Array(RES*RES));this.riverTex.needsUpdate=true;this.riverShown=!!river}const pads=this.features.activePads();if(pads.length){ground=levelPads(ground,pads);this.elev=levelPads(this.elev,pads)}if(ground!==this.ground){this.ground=ground;for(let i=0;i<ground.length;i++)this.contourData[i]=THREE.DataUtils.toHalfFloat(ground[i]);this.contourTex.needsUpdate=true}for(let i=0;i<this.elev.length;i++)this.heightData[i]=THREE.DataUtils.toHalfFloat(this.elev[i]);this.heightTex.needsUpdate=true}waterNow(){if(this.waterOverride!=null)return this.waterOverride;const s=this.source;return s.waterLevel?.(this)??(s.tides?s.tides[this.tide]:s.tide)}setTide(name){if(!this.source.tides||this.tide===name)return;const order=["low","mid","high"];this.tide=order[(order.indexOf(name)+2)%3];this.cycleTide()}cycleTide(){const order=["low","mid","high"];this.tide=order[(order.indexOf(this.tide)+1)%order.length];this.status=this.source.beachFor&&!this.source.beachFor(this)?"THE FLOATING HARBOUR (1809) HOLDS THE WATER: NO TIDE":`${this.tide.toUpperCase()} TIDE \xB7 ${this.waterNow().toFixed(1)} m`;this.floodSea();this.drawSign()}floodSea(){const level=this.waterNow();const mask=this.seaMask;mask.fill(0);if(level!=null&&this.grids){const g=this.ground??this.grids.terrain;const queue=new Int32Array(RES*RES);let head=0;let tail=0;const seed=k=>{if(!mask[k]&&g[k]<level){mask[k]=255;queue[tail++]=k}};for(let k=0;k<RES;k++){seed(k);seed((RES-1)*RES+k);seed(k*RES);seed(k*RES+RES-1)}for(const k of this.source.seaSeeds?.(this)??[])seed(k);while(head<tail){const k=queue[head++];const i=k%RES;if(i>0)seed(k-1);if(i<RES-1)seed(k+1);if(k>=RES)seed(k-RES);if(k<RES*(RES-1))seed(k+RES)}}this.seaTex.needsUpdate=true}seaY(v){const tide=this.waterNow();return tide==null?null:(tide-this.uniforms.uBase.value)*v*this.uniforms.uRise.value}displayY(i,j,v,h,grid=this.elev){const ground=this.sample(i,j,this.ground??this.grids?.terrain);return(ground-this.uniforms.uBase.value)*v+(this.sample(i,j,grid)-ground)*h}sample(i,j,grid=this.elev){const x=THREE.MathUtils.clamp(Math.round(i),0,RES-1);const y=THREE.MathUtils.clamp(Math.round(j),0,RES-1);return grid?grid[y*RES+x]:0}groupToData(x,z){const h=this.holder;_v.set(x-h.position.x,0,z-h.position.z).applyAxisAngle(UP,-h.rotation.y).divideScalar(h.scale.x);return{x:_v.x,z:_v.z}}elevationAtLocal(x,z,grid){const d=this.groupToData(x,z);const i=(d.x/this.size+.5)*(RES-1);const j=(d.z/this.size+.5)*(RES-1);if(i<0||j<0||i>RES-1||j>RES-1)return null;return this.sample(i,j,grid)}standAtLocal(x,z){const e=this.elevationAtLocal(x,z);if(e==null)return null;const d=this.groupToData(x,z);const w=this.features.walkHeight((d.x/this.size+.5)*(RES-1),(d.z/this.size+.5)*(RES-1));if(w?.force)return w.h;return w!=null&&w>e?w:e}gothicEra(){return!!this.letterFace()}letterFace(){return letterFace(this.eras.find(x=>x.id===this.eraId)?.year)}placeName(){const s=this.source;const later=LATER_NAMES[s?.slug];const year=this.eras?.find(e=>e.id===(this.eraId??this.era))?.year;return later&&year!=null&&year<later[0]?later[1]:s?.name}drawSign(){if(!this.sign)return;const{ctx,canvas,tex}=this.sign;const s={...this.source,name:this.placeName()};ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle="rgba(12,16,22,0.78)";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle="rgba(255,233,184,0.6)";ctx.lineWidth=3;ctx.strokeRect(3,3,canvas.width-6,canvas.height-6);ctx.fillStyle="#ffe9b8";ctx.textAlign="left";const gothic=this.gothicEra();const title=gothic?s.name:s.name.toUpperCase();let titleSize=gothic?74:60;const face=this.letterFace();const runes=face==="Saxon"&&document.fonts?.check?.("20px Runes")?spell(s.name.split(":")[0]):"";if(runes)titleSize=60;do ctx.font=gothic?`${titleSize}px ${face}, serif`:`bold ${titleSize}px ui-monospace, Menlo, monospace`;while(ctx.measureText(title).width>(runes?520:860)&&(titleSize-=2)>30);ctx.fillText(title,36,88);if(runes){const w=ctx.measureText(title).width;ctx.fillStyle="#c9a86a";let rs=40;do ctx.font=`${rs}px Runes, serif`;while(ctx.measureText(runes).width>860-w-60&&(rs-=2)>16);ctx.fillText(runes,36+w+30,86);ctx.fillStyle="#ffe9b8"}const period=this.eras.find(e=>e.id===this.eraId)?.label??(this.era==="now"?"TODAY":"THEN");const time=this.game.daylight?` \xB7 ${this.game.daylight.name.toUpperCase()}`:"";this.game.ui?.setBadge?.((this.eras.length>1?`${s.name.split(":")[0].toUpperCase()} \xB7 ${period}`:s.name.split(":")[0].toUpperCase())+time,gothic?s.name.split(":")[0]:null);if(this.eras.length>1){const label=period;ctx.fillStyle="#ffb347";let size=30;do ctx.font=`bold ${size}px ui-monospace, Menlo, monospace`;while(ctx.measureText(label).width>820&&(size-=2)>16);ctx.textAlign="right";ctx.fillText(label,900,34);ctx.textAlign="left";ctx.fillStyle="#ffe9b8"}ctx.font="32px ui-monospace, Menlo, monospace";const across=this.span/this.viewScale;const kmv=across>=1e3?`${(across/1e3).toFixed(1)} km`:`${Math.round(across)} m`;ctx.fillText(`${kmv} across \xB7 contour ${this.uniforms.uInterval.value} m \xB7 height \xD7${+this.exag.toFixed(1)}`,36,140);ctx.fillStyle=this.status?"#ffb347":"#9fb4c4";const layers=[this.base.id!=="none"?this.base.label.toLowerCase():null,this.water?"water":null,this.style==="rings"?"rings only":null,this.era==="then"&&s.history?"reconstruction (conjectural)":null].filter(Boolean).join(" + ");ctx.fillText(this.status||s.statusFor?.(this)||`${s.kind} \xB7 ${Math.round(this.min??0)}\u2013${Math.round(this.max??0)} m${layers?" \xB7 "+layers:""}`,36,192);ctx.font="21px ui-monospace, Menlo, monospace";ctx.fillStyle="#7f8f9c";const credits=[s.attribution,this.base.credit,(this.water||s.osm)&&s.osm?s.osm.attribution:null].filter(Boolean);credits.slice(0,3).forEach((c,k)=>ctx.fillText(c,36,232+k*24));ctx.fillStyle="#ffe9b8";ctx.beginPath();ctx.moveTo(960,120);ctx.lineTo(985,190);ctx.lineTo(935,190);ctx.fill();ctx.font="bold 40px ui-monospace, Menlo, monospace";ctx.textAlign="center";ctx.fillText("N",960,240);tex.needsUpdate=true}next(d){if(this.mode==="life")return;this.source.release?.();this.index=(this.index+d+this.sources.length)%this.sources.length;this.source.reset();this.load()}resetView(){this.holder.position.set(0,0,0);this.holder.rotation.set(0,0,0);this.holder.scale.setScalar(1)}get viewScale(){return this.holder.scale.x}setView(x,z,rotation,scale){const k=THREE.MathUtils.clamp(scale,.5,this.span/this.source.minSpan*2);this.holder.position.set(x,0,z);this.holder.rotation.y=rotation;this.holder.scale.setScalar(k)}settle(){if(this.mode==="life"||!this.elev)return;const k=this.viewScale;const visible=this.span/k;const centre=this.groupToData(0,0);const off=Math.hypot(centre.x,centre.z)/(this.size/2);const want=THREE.MathUtils.clamp(visible*1.6,this.source.minSpan,this.source.maxSpan);if(this.span/want>1.8||this.span/want<.55||off>.4){const real=this.dataToReal(centre.x,centre.z);this.pendingView={visible,real};this.source.zoomToSpan(want);this.source.centreOn(real);this.load()}}toggleRelief(){this.riseTarget=this.riseTarget>.5?0:1}traceRings(){if(!this.ringsStale||!this.grids)return;this.ringsStale=false;this.rings.geometry.dispose();this.rings.geometry=traceContours(this.grids.terrain,this.uniforms.uInterval.value,Math.max(this.min,0),this.max)}toggleEvidence(){this.evidenceView=!this.evidenceView;this.features?.setEvidenceView(this.evidenceView);this.uniforms.uEvidence.value=this.evidenceView?1:0;if(this.evidenceView){const c=this.evidenceReport().counts;this.status=`ARCHAEOLOGY: ${c.green} WELL ESTABLISHED (GREEN), ${c.amber} INTERPRETED (AMBER), ${c.red} SPECULATIVE (RED)`+(c.untagged?`, ${c.untagged} UNTAGGED (GREY)`:"");this.status+=" \xB7 POINT AT A THING: HOW DO WE KNOW?"}else{this.status="";this.captions?.close()}this.drawSign()}toggleRings(){this.style=this.style==="rings"?"surface":"rings";if(this.style==="rings")this.traceRings();if(this.style==="rings")this.riseTarget=1;this.drawSign()}cycleBase(){this.baseIndex=(this.baseIndex+1)%BASEMAPS.length;this.refreshOverlay();this.drawSign()}toggleWater(){this.water=!this.water;this.refreshOverlay();this.drawSign()}get eras(){return this.source.eras??[{id:"now",base:"aerial"},{id:"then",label:"THEN \xB7 c.1900",base:"historic"}]}toggleEra(){const list=this.eras;const k=list.findIndex(e=>e.id===this.eraId);this.setEra(list[(k+1)%list.length].id)}async rebuildObjectsStaged(frame){const steps=this.rebuildObjects(true);if(!steps)return;for(const _ of steps)await frame();this.buildSolid();this.objectsFor=this.era;this.objectsReady=true}housesReady(){return!!this.objectsReady&&this.objectsFor===this.era&&!!this.objects.solid}rebuildObjects(steps=false){const source=this.source;if(!source.buildings||!this.grids)return;const list=source.footprintsFor?source.footprintsFor(this,this.era):source.buildings;const trees=source.treesFor?source.treesFor(this.era):!source.footprintsFor||["now","georgian"].includes(this.era);const clear=(source.splats??[]).filter(s=>scanPlaced(source.slug,s)).map(s=>[s.lat,s.lon,s.clear??40]);clear.push(...(MODELLED[source.slug]??[]).filter(c=>!c[3]||c[3].includes(this.era)).map(c=>c.slice(0,3)));const grids={terrain:this.ground??this.grids.terrain,surface:this.grids.surface};if(steps)return this.objects.rebuildSteps(source,grids,list,{exclude:source.buildings,trees,clear});this.objects.rebuild(source,grids,list,{exclude:source.buildings,trees,clear});this.buildSolid();this.objectsFor=this.era;this.objectsReady=true}pickEra(id){const era=this.eras.find(e=>e.id===id)??this.eras[0];this.eraId=era.id;this.era=era.as??era.id;this.year=era.year??null;return era}setEra(id){const era=this.pickEra(id);if(this.features.dropped&&(this.features.builtEra!==this.era||this.features.builtYear!==this.year)&&this.features.slug===this.source.slug&&!this.firstLoad)this.load();if(this.source.footprintsFor&&this.objectsFor!==this.era){this.showGrid();this.rebuildObjects()}this.baseIndex=BASEMAPS.findIndex(b=>b.id===era.base);this.features.operational=this.era!=="now";this.showGrid();if(this.source.waterLevel)this.floodSea();this.refreshOverlay();this.drawSign();if(this.game.life?.active&&this.eras.length>1){this.captions?.openCaption({title:era.label??era.id.toUpperCase(),text:era.note??"",era:"Period"})}}buildSolid(){const cell=this.span/RES;const c=new OffscreenCanvas(RES,RES);const g=c.getContext("2d",{willReadFrequently:true});g.fillStyle=g.strokeStyle="#fff";g.lineCap="round";for(const it of this.features.items){if(!it.solid||!this.features.eraOk(it))continue;for(const{pts,half,cap}of it.solid.lines??[]){g.lineWidth=Math.max(1,half*2/cell);g.lineCap=cap??"round";g.beginPath();pts.forEach(([i,j],k)=>k?g.lineTo(i,j):g.moveTo(i,j));g.stroke()}for(const poly of it.solid.polys??[]){g.beginPath();poly.forEach(([i,j],k)=>k?g.lineTo(i,j):g.moveTo(i,j));g.closePath();g.fill()}for(const{at,r}of it.solid.dots??[]){g.beginPath();g.arc(at[0],at[1],r/cell,0,Math.PI*2);g.fill()}}const d=g.getImageData(0,0,RES,RES).data;this.solid=new Uint8Array(RES*RES);for(let k=0;k<this.solid.length;k++)this.solid[k]=d[k*4+3]>127?1:0}shiftOld(dx,dy,span){const k=this.size/span;const di=dx/span*(RES-1);const dj=dy/span*(RES-1);for(const m of[this.objects.buildings,this.objects.trees]){m.position.x-=dx*k;m.position.z-=dy*k}for(const it of this.features.items){it.i-=di;it.j-=dj;it.stale=true;it.shift=[(it.shift?.[0]??0)+di,(it.shift?.[1]??0)+dj]}const si=Math.round(di);const sj=Math.round(dj);const move=a=>{if(!a)return a;const out=new Uint8Array(a.length);for(let j=0;j<RES;j++){const oj=j+sj;if(oj<0||oj>=RES)continue;for(let i=0;i<RES;i++){const oi=i+si;if(oi>=0&&oi<RES)out[j*RES+i]=a[oj*RES+oi]}}return out};this.solid=move(this.solid);if(this.objects.solid)this.objects.solid=move(this.objects.solid)}blockedAt(i,j){const x=Math.round(i);const y=Math.round(j);if(x<0||y<0||x>=RES||y>=RES)return false;const below=this.features.blockedBelow(i,j);if(below!=null)return below;const k=y*RES+x;return!!(this.solid?.[k]||this.objects.solid?.[k]&&!this.objects.enterable?.[k])||this.features.blockedFine(i,j)}blockedForFolk(i,j){if(this.blockedAt(i,j))return true;const x=Math.round(i);const y=Math.round(j);if(x<0||y<0||x>=RES||y>=RES)return false;return!!this.objects.solid?.[y*RES+x]}scales(){const h=this.size/this.span;const tableV=this.exag*this.size/this.span;return{h,v:THREE.MathUtils.lerp(tableV,h,ease(this.lifeT))}}update(dt){if(!this.group.visible||!this.mesh)return;if(this.sceneAfterLife&&this.game.life.state==="on"&&!this.game.life.pendingView&&!this.loading&&this.game.life.curtainT<.05){const scene=this.scenario.startNamed(this.sceneAfterLife);this.sceneAfterLife=null;if(scene){this.status=scene.title.toUpperCase();this.game.flash?.(scene.title,scene.caption);this.drawSign()}}this.far.update();this.shade?.update();if(this.mode==="table"&&this.lifeT===0&&this.tablePose){this.group.position.copy(this.tablePose.position);this.group.quaternion.copy(this.tablePose.quaternion);this.group.position.y+=this.lift??0}this.uniforms.uTime.value+=dt;this.rise+=THREE.MathUtils.clamp(this.riseTarget-this.rise,-dt/1.2,dt/1.2);const u=this.uniforms;const life=this.lifeT>0;const{h,v}=this.scales();u.uRise.value=life?1:this.rise*this.rise*(3-2*this.rise);this.holder.updateMatrix();u.uHolder.value.copy(this.holder.matrix);u.uVScale.value=v;u.uHScale.value=h;u.uExag.value=Math.max(1,v/h*.6);u.uReveal.value=Math.min(1,u.uReveal.value+dt/1.1);u.uEdge.value=THREE.MathUtils.lerp(.012,this.size*.12,ease(this.lifeT));u.uSolid.value=ease(this.lifeT);const rings=this.style==="rings";this.mesh.visible=!rings;this.rings.visible=rings;const tableBits=this.lifeT<.02;this.sign.mesh.visible=this.frame.visible=tableBits;if(this.signMap)this.signMap.visible=tableBits;for(const c of this.game.ui.chips)c.mesh.visible=tableBits;const scale=this.group.scale.x;const lifeNow=scale>1.5;const k=this.viewScale;for(const[m,at]of[[this.peak,this.peakAt],[this.landmark,this.landmarkAt]]){if(!at){m.group.visible=false;continue}const x=(at.i/(RES-1)-.5)*this.size;const z=(at.j/(RES-1)-.5)*this.size;const y=(at.e-u.uBase.value)*v*u.uRise.value;m.group.position.set(x,y,z);m.group.visible=u.uReveal.value>=1&&this.onMap(m.group.position);const pinH=(lifeNow?8/scale:.05)/k;const pinW=(lifeNow?.3/scale/.0015:1)/k;m.pin.scale.set(pinW,pinH,pinW);m.pin.position.y=pinH/2;m.pin.visible=!lifeNow;m.sprite.position.y=pinH;const w=(lifeNow?14/scale:.16)/k;m.sprite.scale.set(w,w*.19,1)}if(this.peakAt&&this.landmarkAt&&Math.hypot(this.peakAt.i-this.landmarkAt.i,this.peakAt.j-this.landmarkAt.j)<12){this.peak.group.visible=false}this.features.update(dt,h,v,scale,u.uReveal.value>=1);this.captions.update(h,v,scale,u.uReveal.value>=1);const tide=this.waterNow();if(tide!==this.floodedAt){this.floodedAt=tide;this.floodSea()}this.sea.visible=tide!=null&&this.style!=="rings"&&!this.hideSea;if(this.sea.visible){this.sea.position.y=(tide-u.uBase.value)*v*u.uRise.value;const reach=this.lifeT>0?this.size*40:this.size*1.5;this.sea.scale.set(reach,1,reach);u.uSeaHalf.value=this.lifeT>0?reach/2:u.uHalf.value;this.sea.updateMatrix();u.uSeaLocal.value.copy(this.sea.matrix)}this.objects.setVisible((this.source.footprintsFor?this.objectsFor===this.era:this.era==="now")&&this.style!=="rings"&&!!this.source.buildings);this.views.update(h,v,scale,u.uReveal.value>=1);this.scenario.update(dt,h,v,k*scale)}toggleXray(){this.xray=!this.xray}goTo(slug,plan){const index=this.sources.findIndex(s=>s.slug===slug);if(index<0)return;this.visits=(this.visits??0)+1;this.scenario.stop();this.pendingPlan={slug,...plan};if(index===this.index&&this.grids&&!this.loading){this.runPlan();return}if(index!==this.index){this.source.release?.();this.index=index;this.source.reset()}if(plan?.era){this.eraId=plan.era;const e=this.eras.find(x=>x.id===plan.era);this.era=e?.as??plan.era;this.year=e?.year??null}const src=this.source;if(plan?.diorama&&!this.game.life.active&&src.realOf){const{at,across}=plan.diorama;const real=src.realOf(...at);this.holder.rotation.y=0;src.zoomToSpan(THREE.MathUtils.clamp(across,src.minSpan,src.maxSpan));src.centreOn(real);this.pendingView={visible:across,real};this.pendingPlan.dioramaLoaded=true}this.load()}runPlan(){const plan=this.pendingPlan;if(!plan||plan.slug!==this.source.slug)return;this.pendingPlan=null;this.setEra(plan.era&&this.eras.some(e=>e.id===plan.era)?plan.era:"now");if(plan.tour){const script=TOURS[plan.tour];if(script)this.game.tour.start(script);return}if(plan.journey){const[dest,means,from]=plan.journey.split(":");const script=makeJourney(dest,means,from??"bristol",{arcade:this.game.playMode==="arcade"});if(script)this.game.tour.start(script);return}this.sceneAfterLife=plan.scene&&plan.view!=null&&!plan.diorama&&!this.game.life.active?plan.scene:null;if(plan.scene&&!this.sceneAfterLife){const scene=this.scenario.startNamed(plan.scene);if(scene){this.status=scene.title.toUpperCase();this.game.flash?.(scene.title,scene.caption);this.drawSign()}}const scan=plan.splat?this.source.splats?.find(s=>s.name===plan.splat):null;this.activeScan=scan?.name??null;if(scan&&!this.game.life.active){this.game.life.enter(this.views.groupSpot({at:[scan.lat,scan.lon]}),scan.face??0);return}if(typeof plan.view==="string"){const k=this.views.list.findIndex(v=>v.name===plan.view);plan.view=k>=0?k:0}const view=plan.view!=null?this.views.list[plan.view]:null;if(plan.diorama&&!this.game.life.active){const{at,across}=plan.diorama;const w=this.source.toWindow(...at);const real=this.dataToReal((w.i/(RES-1)-.5)*this.size,(w.j/(RES-1)-.5)*this.size);if(!plan.dioramaLoaded){this.holder.rotation.y=0;this.pendingView={visible:across,real};this.source.zoomToSpan(THREE.MathUtils.clamp(across,this.source.minSpan,this.source.maxSpan));this.source.centreOn(real);this.load()}this.dioramaView=view?plan.view:null;this.game.ui.picking=true;this.dioramaStatus=view?`POINT AT A STREET TO GO IN, OR PRESS LIFE SIZE FOR ${view.name.toUpperCase()}`:"POINT AT A STREET TO GO IN";this.status=this.dioramaStatus;this.drawSign();return}if(view&&!this.game.life.active){this.views.index=plan.view;this.game.life.enter(this.views.groupSpot(view),this.views.bearingOf(view),view)}}toggleScenario(){if(this.scenario.running){this.scenario.stop();this.status=""}else{const scene=this.scenario.start();this.status=scene?scene.title.toUpperCase():"";if(scene)this.game.flash?.(scene.title,scene.caption);else if(this.game.life?.active)this.game.flash?.("No scene in this period","There is no scene here for the period you are in. Change the period from the menu, or pick a scene there.")}this.drawSign()}nearMap(p){_v.copy(p).applyMatrix4(this.holder.matrix);return Math.hypot(_v.x,_v.z)<this.uniforms.uHalf.value*4}onMap(p){_v.copy(p).applyMatrix4(this.holder.matrix);return Math.hypot(_v.x,_v.z)<this.uniforms.uHalf.value}evidenceReport(){return evidenceReport(this)}dataToReal(x,z){const c=this.source.centreMetres();const k=this.span/this.size;return{x:c.x+x*k,y:c.y+z*k}}realToData(r){const c=this.source.centreMetres();const k=this.size/this.span;return{x:(r.x-c.x)*k,z:(r.y-c.y)*k}}worldToLocal(p){return this.group.worldToLocal(_v.copy(p))}}export{ContourMap,LIFE_SPAN};
