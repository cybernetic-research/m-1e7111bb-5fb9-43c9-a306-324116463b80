import{zoneAt}from"./zones.js";import*as THREE from"three";import{FOG_PARS,FOG_VARY,fogVertex,fogUniforms}from"./fog.js";import{dayUniforms}from"./daylight.js";const VIEWS=16;const W_PX=1024;const H_PX=176;const BOTTOM=-5;const TOP=95;const SETTLE=2.5;const DAY_HOUR=13;const NIGHT_HOUR=23.5;const vertexShader=`
  varying vec2 vUv;
  ${FOG_VARY}
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    ${fogVertex("mv")}
    gl_Position = projectionMatrix * mv;
  }
`;const fragmentShader=`
  #include <packing>
  uniform sampler2D uCol, uNightCol, uDepth;
  uniform float uPacked; 
  uniform vec3 uDayTint;
  uniform float uNight;
  uniform vec2 uCam, uRight, uFwd;
  uniform float uW, uNear, uFar;
  uniform vec3 uWin; 
  varying vec2 vUv;
  ${FOG_PARS}
  void main() {
    vec4 c = texture2D(uCol, vUv);
    if (c.a < 0.5) discard;
    vec3 night = texture2D(uNightCol, vUv).rgb;
    
    c.rgb = mix(c.rgb * uDayTint / vec3(1.0, 1.0, 0.98), night, uNight);
    float z = uPacked > 0.5 ? unpackRGBAToDepth(texture2D(uDepth, vUv)) : texture2D(uDepth, vUv).r;
    float dist = uNear + z * (uFar - uNear);
    vec2 p = uCam + uRight * (vUv.x - 0.5) * uW + uFwd * dist;
    if (abs(p.x - uWin.x) < uWin.z && abs(p.y - uWin.y) < uWin.z) discard;
    gl_FragColor = vec4(mix(c.rgb, uFogCol, fogAmount()), 1.0);
  }
`;const MIST_TOP=32;const mistVertex=`
  varying vec2 vUv;
  ${FOG_VARY}
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    ${fogVertex("mv")}
    gl_Position = projectionMatrix * mv;
  }
`;const mistFragment=`
  uniform float uTime, uWidth, uSeed, uStrength;
  varying vec2 vUv;
  ${FOG_PARS}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 4; k++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  void main() {
    
    vec2 m = vec2(vUv.x * uWidth, vUv.y * ${MIST_TOP.toFixed(1)}) / 40.0;
    float n = fbm(m + vec2(uTime * 0.012 + uSeed, -uTime * 0.004));
    float n2 = fbm(m * 1.7 - vec2(uTime * 0.02, 0.0) + uSeed * 3.1);
    float d = mix(n, n2, 0.45);
    float foot = 1.0 - smoothstep(0.08, 0.85, vUv.y - (d - 0.5) * 0.35); 
    float sides = smoothstep(0.0, 0.12, vUv.x) * smoothstep(0.0, 0.12, 1.0 - vUv.x);
    float a = smoothstep(0.24, 0.62, d) * foot * sides * uStrength;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uFogCol * 1.04, a);
  }
`;const _v=new THREE.Vector3;const _w=new THREE.Vector3;class Impostor{constructor(game){this.game=game;this.map=game.map;this.key=null;this.shots=null;this.taking=null;this.settle=0;this.detoured=false;this.material=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:{uCol:{value:null},uNightCol:{value:null},uDepth:{value:null},uDayTint:dayUniforms.uDayTint,uNight:dayUniforms.uNight,uCam:{value:new THREE.Vector2},uRight:{value:new THREE.Vector2},uFwd:{value:new THREE.Vector2},uW:{value:1},uNear:{value:0},uFar:{value:1},uWin:{value:new THREE.Vector3},uPacked:{value:0},...fogUniforms},side:THREE.DoubleSide});this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),this.material);this.mesh.frustumCulled=false;this.mesh.visible=false;this.mesh.name="town impostor";this.time=0;this.mist=[0,1,2].map(k=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({vertexShader:mistVertex,fragmentShader:mistFragment,uniforms:{uTime:{value:0},uWidth:{value:1},uSeed:{value:k*7.3},uStrength:{value:[.9,.8,.7][k]},...fogUniforms},transparent:true,depthWrite:false,side:THREE.DoubleSide}));m.frustumCulled=false;m.visible=false;m.renderOrder=2;m.name="town mist";return m})}hide(){this.mesh.visible=false;for(const m of this.mist)m.visible=false}dispose(){for(const s of[...this.shots??[],...this.taking??[]]){s.rt.depthTexture?.dispose();s.rt.dispose();s.night?.dispose()}this.shots=null;this.taking=null}detourFor(life,real){const map=this.map;const zones=life.zones();const target=zones?.find(z=>z.impostor);if(!target)return null;const key=`${map.source.slug}/${map.era}/${target.name}`;if(key!==this.key){this.dispose();this.key=key;this.settle=0;this.detoured=false}if(this.shots||this.detoured||zoneAt(zones,real)===target||this.game.life?.skyline?.has(target))return null;this.detoured=true;return target}update(life,dt){const map=this.map;this.time+=dt;const target=life.zones()?.find(z=>z.impostor);if(!target)return this.hide();const key=`${map.source.slug}/${map.era}/${target.name}`;if(key!==this.key){this.dispose();this.key=key;this.settle=0;this.detoured=false}if(this.returning&&!map.loading&&(map.housesReady?.()??true))this.returning=false;if(life.skyline?.has(target)){if(life.detour){const back=life.detour;life.detour=null;this.returning=true;life.reloadAround(back)}return this.hide()}if(!this.shots&&!this.detoured&&life.zone!==target&&!map.loading){this.detoured=true;const head=map.holder.worldToLocal(_v.copy(this.game.head));life.startDetour(target,map.dataToReal(head.x,head.z));return this.hide()}if(life.zone===target){this.hide();if(this.shots)return;const ready=!map.loading&&(map.housesReady?.()??true);if(!ready){this.settle=0;if(this.taking)this.dispose();return}this.settle+=dt;if(this.settle<SETTLE)return;this.taking??=[];this.take(life,target,this.taking.length);if(this.taking.length===VIEWS){this.shots=this.taking;this.taking=null;console.info(`[impostor] ${VIEWS} views of ${target.name} taken`);if(life.detour){const back=life.detour;life.detour=null;this.returning=true;life.reloadAround(back)}}return}if(!this.shots)return this.hide();this.show(life,target)}local(p,e,out){const map=this.map;const d=map.realToData(p);const u=map.uniforms;return out.set(d.x,(e-u.uBase.value)*map.scales().v*u.uRise.value,d.z)}take(life,zone,n){const map=this.map;const{renderer,scene}=this.game;const k=life.scaleNow();const R=Math.max(...zone.poly.map(p=>Math.hypot(p.x-zone.centre.x,p.y-zone.centre.y)))+30;const W=2*R;const back=R+60;const a=n/VIEWS*Math.PI*2;const out=new THREE.Vector2(Math.cos(a),Math.sin(a));const fwd=out.clone().negate();const right=new THREE.Vector2(-fwd.y,fwd.x);const cam=new THREE.Vector2().copy(zone.centre).addScaledVector(out,back);const mid=(BOTTOM+TOP)/2;map.holder.updateMatrixWorld(true);const eye=map.holder.localToWorld(this.local(cam,mid,_v.set(0,0,0)));const at=map.holder.localToWorld(this.local(zone.centre,mid,_w.set(0,0,0)));const camera=new THREE.OrthographicCamera(-W/2*k,W/2*k,(TOP-mid)*k,(BOTTOM-mid)*k,10*k,(back+R+40)*k);camera.position.copy(eye);camera.up.set(0,1,0);camera.lookAt(at);camera.updateMatrixWorld(true);const rt=new THREE.WebGLRenderTarget(W_PX,H_PX,{samples:0});rt.depthTexture=new THREE.DepthTexture(W_PX,H_PX);rt.depthTexture.type=THREE.UnsignedIntType;rt.isXRRenderTarget=true;rt.texture.colorSpace=THREE.SRGBColorSpace;const night=new THREE.WebGLRenderTarget(W_PX,H_PX,{samples:0});night.isXRRenderTarget=true;night.texture.colorSpace=THREE.SRGBColorSpace;const keep=new Set([map.features.group,map.objects.buildings,map.objects.trees]);const hidden=[];const hideAllBut=(parent,pass)=>{for(const c of parent.children)if(!pass.has(c)&&!c.isLight&&c.visible){c.visible=false;hidden.push(c)}};hideAllBut(scene,new Set([map.group]));hideAllBut(map.group,new Set([map.holder]));hideAllBut(map.holder,keep);map.features.group.traverse(o=>{if((o.isPoints||o.isSprite)&&o.visible){o.visible=false;hidden.push(o)}});const background=scene.background;scene.background=null;const fog=[fogUniforms.uFogNear.value,fogUniforms.uFogFar.value,scene.fog?.near,scene.fog?.far];fogUniforms.uFogNear.value=1e8;fogUniforms.uFogFar.value=2e8;if(scene.fog){scene.fog.near=1e8;scene.fog.far=2e8}const xr=renderer.xr.enabled;const before=renderer.getRenderTarget();const clear=renderer.getClearColor(new THREE.Color);const clearA=renderer.getClearAlpha();renderer.xr.enabled=false;renderer.setClearColor(0,0);const daylight=this.game.daylight;const hour=daylight?.hour;for(const[target,h]of[[rt,DAY_HOUR],[night,NIGHT_HOUR]]){if(daylight)this.lightAt(daylight,h);renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera)}if(daylight)this.lightAt(daylight,hour);renderer.setRenderTarget(before);renderer.setClearColor(clear,clearA);renderer.xr.enabled=xr;for(const c of hidden)c.visible=true;scene.background=background;fogUniforms.uFogNear.value=fog[0];fogUniforms.uFogFar.value=fog[1];if(scene.fog){scene.fog.near=fog[2];scene.fog.far=fog[3]}this.taking.push({rt,night,a,cam,right,fwd,W,near:10,far:back+R+40})}lightAt(daylight,hour){daylight.hour=hour;daylight.apply();const{hemi,sun}=this.game.lights;const l=daylight.lights;sun.color.setRGB(...l.sun);sun.intensity=l.sunI;hemi.color.setRGB(...l.hemi);hemi.intensity=l.hemiI}show(life,zone){const map=this.map;const head=map.holder.worldToLocal(_v.copy(this.game.head));const me=map.dataToReal(head.x,head.z);let b=Math.atan2(me.y-zone.centre.y,me.x-zone.centre.x);if(b<0)b+=Math.PI*2;const s=this.shots[Math.round(b/(Math.PI*2)*VIEWS)%VIEWS];const u=this.material.uniforms;u.uCol.value=s.rt.texture;u.uNightCol.value=s.night.texture;u.uDepth.value=s.rt.depthTexture;u.uCam.value.copy(s.cam);u.uRight.value.copy(s.right);u.uFwd.value.copy(s.fwd);u.uW.value=s.W;u.uNear.value=s.near;u.uFar.value=s.far;const c=map.dataToReal(0,0);u.uWin.value.set(c.x,c.y,map.span/2-4);const m=this.mesh;if(m.parent!==map.holder)map.holder.add(m);const mid=(BOTTOM+TOP)/2;this.local(zone.centre,mid,m.position);const h=map.size/map.span;m.scale.set(s.W*h,(TOP-BOTTOM)*map.scales().v*map.uniforms.uRise.value,1);m.rotation.set(0,Math.atan2(Math.cos(s.a),Math.sin(s.a)),0);m.visible=true;this.placeMist(me,zone,s.W,c,map.span/2)}placeMist(me,zone,W,win,half){const map=this.map;const dx=zone.centre.x-me.x;const dy=zone.centre.y-me.y;const D=Math.hypot(dx,dy);const ux=dx/D;const uy=dy/D;const tx=ux?((ux>0?win.x+half:win.x-half)-me.x)/ux:Infinity;const ty=uy?((uy>0?win.y+half:win.y-half)-me.y)/uy:Infinity;const edge=Math.max(0,Math.min(tx,ty));const gap=D-edge;const h=map.size/map.span;const v=map.scales().v*map.uniforms.uRise.value;this.mist.forEach((mesh,k)=>{if(gap<30){mesh.visible=false;return}const t=edge+gap*[.2,.45,.7][k];const p={x:me.x+ux*t,y:me.y+uy*t};if(mesh.parent!==map.holder)map.holder.add(mesh);this.local(p,MIST_TOP/2-2,mesh.position);const width=W*(.6+.4*(t/D));mesh.scale.set(width*h,(MIST_TOP+4)*v,1);mesh.rotation.set(0,Math.atan2(-ux,-uy),0);mesh.material.uniforms.uTime.value=this.time;mesh.material.uniforms.uWidth.value=width;mesh.visible=true})}bakeView(life,zone,n){const{renderer}=this.game;this.taking=[];this.take(life,zone,n);const s=this.taking[0];this.taking=null;const w=W_PX;const h=H_PX;const pack=new THREE.WebGLRenderTarget(w,h,{samples:0});const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:{tDepth:{value:s.rt.depthTexture}},vertexShader:"varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",fragmentShader:"#include <packing>\nuniform sampler2D tDepth; varying vec2 vUv; void main() { gl_FragColor = packDepthToRGBA(min(texture2D(tDepth, vUv).r, 0.9999)); }",depthTest:false,depthWrite:false}));const scene=new THREE.Scene;scene.add(quad);const cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);const before=renderer.getRenderTarget();const xr=renderer.xr.enabled;renderer.xr.enabled=false;renderer.setRenderTarget(pack);renderer.render(scene,cam);renderer.setRenderTarget(before);renderer.xr.enabled=xr;const png=(rt,type)=>{const buf=new Uint8Array(w*h*4);renderer.readRenderTargetPixels(rt,0,0,w,h,buf);const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d");const im=x.createImageData(w,h);for(let r=0;r<h;r++)im.data.set(buf.subarray((h-1-r)*w*4,(h-r)*w*4),r*w*4);x.putImageData(im,0,0);return c.toDataURL(type)};const out={day:png(s.rt,"image/png"),night:png(s.night,"image/png"),depth:png(pack,"image/png"),view:{a:s.a,cam:[s.cam.x,s.cam.y],right:[s.right.x,s.right.y],fwd:[s.fwd.x,s.fwd.y],W:s.W,near:s.near,far:s.far}};for(const r of[s.rt,s.night,pack]){r.depthTexture?.dispose();r.dispose()}quad.geometry.dispose();quad.material.dispose();return out}}export{BOTTOM,Impostor,TOP,VIEWS,fragmentShader,vertexShader};
