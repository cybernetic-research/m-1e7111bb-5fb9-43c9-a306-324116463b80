import*as THREE from"three";import{RES}from"./terrain.js";const STEP=2;function traceContours(elev,interval,min,max){const n=Math.floor((RES-1)/STEP);const at=(i,j)=>elev[j*STEP*RES+i*STEP];const pos=[];const lev=[];const major=[];for(let level=Math.ceil(Math.max(min,.5)/interval)*interval;level<=max;level+=interval){const isMajor=Math.abs(level/interval/5-Math.round(level/interval/5))<1e-6?1:0;for(let j=0;j<n;j++){for(let i=0;i<n;i++){const a=at(i,j);const b=at(i+1,j);const c=at(i+1,j+1);const d=at(i,j+1);const code=(a>level?8:0)|(b>level?4:0)|(c>level?2:0)|(d>level?1:0);if(code===0||code===15)continue;const top=()=>[i+(level-a)/(b-a),j];const right=()=>[i+1,j+(level-b)/(c-b)];const bottom=()=>[i+(level-d)/(c-d),j+1];const left=()=>[i,j+(level-a)/(d-a)];const segs={1:[[left,bottom]],2:[[bottom,right]],3:[[left,right]],4:[[top,right]],5:[[left,top],[bottom,right]],6:[[top,bottom]],7:[[left,top]],8:[[left,top]],9:[[top,bottom]],10:[[left,bottom],[top,right]],11:[[top,right]],12:[[left,right]],13:[[bottom,right]],14:[[left,bottom]]}[code];for(const[p,q]of segs){for(const[x,y]of[p(),q()]){pos.push(x/n,0,y/n);lev.push(level);major.push(isMajor)}}}}}const geometry=new THREE.BufferGeometry;geometry.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));geometry.setAttribute("elev",new THREE.Float32BufferAttribute(lev,1));geometry.setAttribute("major",new THREE.Float32BufferAttribute(major,1));return geometry}function ringMaterial(uniforms){return new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,vertexShader:`
      attribute float elev;
      attribute float major;
      uniform float uBase, uVScale, uRise, uSize;
      uniform mat4 uHolder;
      varying float vT;
      varying float vMajor;
      varying vec2 vClip;
      uniform float uMin, uMax;
      void main() {
        vec3 p = vec3((position.x - 0.5) * uSize, (elev - uBase) * uVScale * uRise, (position.z - 0.5) * uSize);
        vClip = (uHolder * vec4(p, 1.0)).xz;
        vT = clamp((elev - uMin) / max(uMax - uMin, 1.0), 0.0, 1.0);
        vMajor = major;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,fragmentShader:`
      uniform float uHalf, uEdge;
      varying float vT;
      varying float vMajor;
      varying vec2 vClip;
      void main() {
        float r = length(vClip);
        if (r > uHalf) discard;
        
        vec3 col = mix(vec3(0.35, 0.85, 1.0), vec3(1.0, 0.78, 0.4), vT);
        float a = mix(0.55, 1.0, vMajor);
        a *= smoothstep(uHalf, uHalf - uEdge, r);
        gl_FragColor = vec4(col * mix(0.85, 1.25, vMajor), a);
      }
    `})}export{ringMaterial,traceContours};
