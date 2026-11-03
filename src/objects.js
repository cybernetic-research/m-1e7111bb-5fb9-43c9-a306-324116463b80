import * as THREE from 'three';
import { FOG_PARS, FOG_VARY, fogVertex } from './fog.js';
import { SHADE_GLSL } from './shade.js';
import { RES } from './terrain.js';

// Buildings and trees as objects on bare earth, instead of draping the LIDAR surface model (which turns every
// tree and house into a spike and every street between them into a ravine).
// - Buildings: OpenStreetMap footprints (assets/<site>-buildings.json), raised to the height the LIDAR measured
//   there (surface minus bare earth), or the mapped height / storeys where OSM has them. Flat roofs, coloured from
//   the aerial photo underneath; walls in stone and brick shades.
// - Trees: wherever the LIDAR shows something 3 m or more above the ground that isn't a building: one tree per
//   local high point of the canopy, at its measured height.
// Both are true to scale on the (height-exaggerated) ground, and are rebuilt whenever new terrain is loaded.

const MAX_BUILDINGS = 40000;
const MAX_TREES = 40000;
const WALLS = [0xc8bca8, 0xd6c8ae, 0xb08a70, 0xe0d4bc, 0xa89c8c, 0xcfc2a4].map((c) => new THREE.Color(c));

const common = /* glsl */ `
  uniform float uBase, uVScale, uHScale, uRise, uSize, uHalf, uEdge, uOpacity, uOverlayOn, uBaseOn, uRoofPhoto;
  uniform mat4 uHolder;
  uniform vec3 uDayTint; // the time of day at life size (daylight.js)
  uniform float uNight, uSolid;
  uniform vec2 uKitCentre;
  uniform float uKitR;
`;
const clip = /* glsl */ `
  float r = length(vClip);
  if (r > uHalf) discard;
  float edge = smoothstep(uHalf, uHalf - uEdge, r);
`;
const SUN = 'normalize(vec3(-0.5, 1.4, 0.6))';

function buildingMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${common}
      ${FOG_VARY}
      attribute float ground;
      attribute float above;
      attribute vec3 wall;
      attribute float along;
      attribute float kind;
      varying float vKind;
      varying vec2 vClip;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWall;
      varying float vRoof;
      varying float vAlong;
      varying float vAbove;
      varying vec2 vLocal;
      varying float vGround;
      void main() {
        vLocal = position.xz;
        vGround = ground;
        vAlong = along;
        vAbove = above;
        vKind = kind;
        vec3 p = vec3(position.x, (ground - uBase) * uVScale * uRise + above * uHScale * uRise, position.z);
        vClip = (uHolder * vec4(p, 1.0)).xz;
        vUv = vec2(position.x / uSize + 0.5, position.z / uSize + 0.5);
        vNormal = normal;
        vWall = wall;
        vRoof = step(0.5, normal.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        ${fogVertex('modelViewMatrix * vec4(p, 1.0)')}
      }
    `,
    fragmentShader: /* glsl */ `
      ${common}
      ${FOG_PARS}
      uniform sampler2D uOverlay;
      varying vec2 vClip;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWall;
      varying float vRoof;
      varying float vAlong;
      varying float vAbove;
      varying float vKind;
      varying vec2 vLocal;
      uniform sampler2D uTexPlaster, uTexOak, uTexRoof;
      uniform sampler2D uShade;
      uniform float uShadeOn, uSunUp;
      varying float vGround;
      ${SHADE_GLSL}
      uniform float uCell;
      float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      // Brick in stretcher bond (225 x 75 mm courses, lime mortar), p in metres along and up a wall.
      vec3 brickwork(vec2 p, vec3 base) {
        float row = floor(p.y / 0.075);
        float x = p.x / 0.225 + 0.5 * mod(row, 2.0);
        vec2 f = vec2(fract(x), fract(p.y / 0.075));
        float mortar = clamp(step(0.94, f.x) + step(0.84, f.y), 0.0, 1.0);
        return mix(base * (0.8 + 0.34 * hash2(vec2(floor(x), row))), vec3(0.66, 0.62, 0.55), mortar);
      }
      // Coursed ashlar: dressed stone blocks about 0.8 x 0.32 m with fine joints.
      vec3 ashlar(vec2 p, vec3 base) {
        float row = floor(p.y / 0.32);
        float x = p.x / 0.8 + 0.37 * row;
        vec2 f = vec2(fract(x), fract(p.y / 0.32));
        float joint = clamp(step(0.985, f.x) + step(0.965, f.y), 0.0, 1.0);
        return mix(base * (0.9 + 0.14 * hash2(vec2(floor(x), row))), base * 0.7, joint);
      }
      void main() {
        ${clip}
        // abs(): footprints are traced either way round, so a wall's normal may point inwards.
        float light = 0.66 + 0.36 * abs(dot(normalize(vNormal), ${SUN})); // soft, as under a lightly overcast sky
        // Roofs take the aerial photo's colour when it's showing, else slate grey.
        vec4 ov = texture2D(uOverlay, vUv);
        vec3 roof = mix(vec3(0.36, 0.34, 0.35), ov.rgb, ov.a * uOverlayOn * uRoofPhoto);
        // Windows: a column every 3 m along each wall (walls under 2.5 m long have none) and a row per 3.2 m storey,
        // in pale surrounds. Only drawn when near enough to see them (screen-space size).
        vec3 wallCol = vWall;
        float fade = 1.0 - smoothstep(0.6, 1.4, fwidth(vAlong) + fwidth(vAbove));
        float hw = fract(dot(vWall, vec3(12.9898, 78.233, 37.719)) * 43.7);
        // Brick courses and stone joints only up close, where they can be seen without shimmering.
        float detail = vAlong >= 0.0 ? 1.0 - smoothstep(0.02, 0.06, fwidth(vAbove) + fwidth(vAlong) * 0.3) : 0.0;
        vec2 wp = vec2(vAlong, vAbove);
        vec3 awning = vec3(0.0);
        float glow = 0.0; // a lit window, after dark
        if (vKind > 0.5 && vKind < 1.5) {
          // Timber-framed: limewashed render (cream, ochre or pink) between dark oak posts, rails and braces; small
          // leaded windows; dark shop openings on the ground floor; clay-tile roofs.
          vec3 render = mix(vec3(0.88, 0.84, 0.72), vec3(0.84, 0.72, 0.50), step(0.5, hw));
          render = mix(render, vec3(0.87, 0.76, 0.70), step(0.82, hw));
          vec3 oak = vec3(0.21, 0.14, 0.09);
          // From photographs (Poly Haven, CC0): lime plaster, tinted each house's colour; oak timbers.
          vec2 mw = vUv * ${RES}.0 * uCell;
          // (Textures are the kit's: plaster, its timber, its round tiles.)
          vec3 plaster = texture2D(uTexPlaster, wp / 2.0).rgb;
          render *= mix(vec3(1.0), 0.75 + 0.35 * plaster / 0.7, detail * 0.8 + 0.2);
          // Its timbers one colour, its own: tarred black, dark brown oak or oxblood red, each a little lighter or
          // darker, warmer or cooler than the next house's; the kit's timber texture only for the grain.
          float ht = fract(hw * 23.1);
          vec3 timber = ht < 0.4 ? vec3(0.05, 0.045, 0.04) : ht < 0.8 ? vec3(0.19, 0.12, 0.07) : vec3(0.25, 0.075, 0.055);
          timber *= (0.82 + 0.36 * fract(hw * 41.7)) * vec3(0.94 + 0.12 * fract(hw * 57.3), 1.0, 0.94 + 0.12 * fract(hw * 71.9));
          float grain = dot(texture2D(uTexOak, vec2(wp.x / 1.2, wp.y / 2.5)).rgb, vec3(0.3, 0.59, 0.11));
          oak = timber * clamp(0.65 + grain * 1.2, 0.6, 1.4);
          wallCol = render * (0.9 + 0.12 * vn(wp * 1.5));
          // Near you at life size the kit's doors and windows stand in the bays (fittings.js), so none is painted.
          float kit = step(distance(vLocal, uKitCentre), uKitR);
          if (vAlong >= 0.0) {
            float fy = fract(vAbove / 2.9);
            float bay = floor(vAlong / ${BAY});
            float fx = fract(vAlong / ${BAY});
            float kind = mod(bay + floor(hw * 7.0), 3.0);
            float t = max(step(fy, 0.07) + step(0.93, fy), step(abs(fy - 0.5), 0.03) * (1.0 - kit));
            t = max(t, step(fx, 0.1));
            t = max(t, step(kind, 0.5) * step(abs(fx - fy * 2.0), 0.12) * step(fy, 0.5) * (1.0 - kit));
            float win = step(0.5, kind) * step(kind, 1.5) * step(0.18, fx) * step(fx, 0.9) * step(0.56, fy) * step(fy, 0.88) * step(2.9, vAbove) * (1.0 - kit);
            vec2 q = vec2(vAlong + vAbove, vAlong - vAbove) * 6.0;
            vec3 glass = mix(vec3(0.24, 0.27, 0.28), vec3(0.10, 0.10, 0.10), step(0.82, max(fract(q.x), fract(q.y))));
            float shop = step(vAbove, 2.9) * step(0.5, mod(bay, 2.0)) * step(0.16, fx) * step(fx, 0.92) * step(0.1, fy) * step(fy, 0.86) * (1.0 - kit);
            wallCol = mix(wallCol, oak, clamp(t, 0.0, 1.0) * fade);
            wallCol = mix(wallCol, glass, win * fade);
            wallCol = mix(wallCol, vec3(0.09, 0.07, 0.05), shop * fade);
            // After dark about half the windows show firelight or a candle, and the odd open shop door.
            glow = max(win * step(0.5, hash2(vec2(bay * 1.3 + hw * 17.0, floor(vAbove / 2.9)))),
                       shop * 0.6 * step(0.75, hash2(vec2(bay * 2.1, hw * 9.0)))) * fade;
          } else if (vAlong < -2.5) {
            // The jetty's underside: joists in the kit's timber.
            wallCol = oak * 0.8;
          }
          // Each roof its own weathered colour (the kit's tiles are a bright orange): old clay gone brown, umber
          // or grey-red, a few of grey stone tiles; patches of soot and lichen.
          vec3 rt = texture2D(uTexRoof, mw / 2.5).rgb;
          float rl = dot(rt, vec3(0.3, 0.59, 0.11));
          float hr = fract(hw * 13.7);
          vec3 tile = mix(rt, vec3(rl) * vec3(1.08, 0.92, 0.84), 0.35 + 0.45 * hr) * (0.58 + 0.28 * fract(hw * 5.3));
          tile = mix(tile, vec3(rl) * vec3(0.78, 0.77, 0.76), step(0.84, fract(hw * 3.1)));
          tile *= 0.82 + 0.3 * vn(mw * 0.6 + hw * 31.0);
          tile = mix(tile, vec3(0.27, 0.28, 0.18), 0.35 * smoothstep(0.62, 0.92, vn(mw * 0.3 + hw * 17.0)));
          roof = tile;
        } else if (vKind > 2.5) {
          // Georgian: red-brown brick or Bath stone; tall sash windows with white glazing bars (six over six) in
          // pale stone surrounds; panelled doors on the ground floor; stone string courses; slate roofs.
          vec3 brick = mix(vec3(0.55, 0.31, 0.23), vec3(0.47, 0.27, 0.21), step(0.3, hw));
          vec3 base = mix(brick, vec3(0.80, 0.73, 0.58), step(0.62, hw));
          vec3 pale = vec3(0.88, 0.85, 0.76);
          wallCol = mix(base, hw < 0.62 ? brickwork(wp, base) : ashlar(wp, base), detail);
          if (vAlong >= 0.0) {
            float fy = fract(vAbove / 3.3);
            float fx = fract(vAlong / 2.4);
            float bay = floor(vAlong / 2.4);
            float frameW = step(0.29, fx) * step(fx, 0.71) * step(0.15, fy) * step(fy, 0.85);
            float glassW = step(0.33, fx) * step(fx, 0.67) * step(0.19, fy) * step(fy, 0.81);
            float bars = glassW * clamp(step(0.88, fract((fx - 0.33) / 0.34 * 3.0)) + step(0.9, fract((fy - 0.19) / 0.62 * 4.0)), 0.0, 1.0);
            vec3 win = mix(vec3(0.14, 0.18, 0.22) + 0.07 * fy, vec3(0.93, 0.92, 0.88), bars);
            float door = step(vAbove, 3.3) * step(abs(mod(bay + floor(hw * 5.0), 3.0) - 1.0), 0.5) * step(0.32, fx) * step(fx, 0.68) * step(0.03, fy) * step(fy, 0.78);
            wallCol = mix(wallCol, mix(pale, win, glassW), frameW * fade);
            glow = glassW * (1.0 - bars) * step(0.55, hash2(vec2(bay + hw * 13.0, floor(vAbove / 3.3)))) * fade;
            wallCol = mix(wallCol, mix(vec3(0.10, 0.16, 0.13), vec3(0.12, 0.10, 0.09), step(0.5, hw)), door * fade);
            wallCol = mix(wallCol, pale, step(fy, 0.04) * step(3.0, vAbove) * fade);
          } else if (vAlong < -1.5 && vAlong > -2.5) {
            wallCol = pale;
          }
          roof = vec3(0.32, 0.33, 0.36);
        } else if (vKind > 1.5) {
          // Victorian: Bath stone, grey stone or red brick fronts; tall sash windows in pale surrounds; plate-glass
          // shopfronts under painted fascias; a pale cornice; slate roofs.
          vec3 stone = mix(vec3(0.78, 0.71, 0.56), vec3(0.64, 0.62, 0.58), step(0.55, hw));
          stone = mix(stone, vec3(0.56, 0.31, 0.24), step(0.85, hw));
          wallCol = mix(stone, hw > 0.85 ? brickwork(wp, stone) : ashlar(wp, stone), detail);
          if (vAlong >= 0.0) {
            float fy = fract(vAbove / 3.6);
            if (vAbove < 3.6) {
              float fs = fract(vAlong / 4.0);
              float glassS = step(0.08, fs) * step(fs, 0.92) * step(0.15, vAbove) * step(vAbove, 2.75);
              float fascia = step(2.85, vAbove) * step(vAbove, 3.45);
              vec3 paint = mix(vec3(0.14, 0.26, 0.20), vec3(0.36, 0.12, 0.10), step(0.5, fract(hw * 7.0)));
              wallCol = mix(wallCol, paint, fascia * fade);
              wallCol = mix(wallCol, vec3(0.13, 0.16, 0.19) + 0.05 * vAbove / 3.0, glassS * fade);
            } else {
              float fx = fract(vAlong / 2.7);
              float frameW = step(0.27, fx) * step(fx, 0.73) * step(0.14, fy) * step(fy, 0.8);
              float glassW = step(0.32, fx) * step(fx, 0.68) * step(0.19, fy) * step(fy, 0.76);
              wallCol = mix(wallCol, mix(vec3(0.86, 0.82, 0.72), vec3(0.16, 0.2, 0.24) + 0.08 * fy, glassW), frameW * fade);
              wallCol *= 1.0 - 0.15 * step(fy, 0.04) * fade;
            }
          } else if (vAlong < -1.5 && vAlong > -2.5) {
            wallCol = vec3(0.86, 0.82, 0.72);
          }
          roof = vec3(0.32, 0.33, 0.36);
          awning = mix(vec3(0.20, 0.36, 0.26), vec3(0.62, 0.22, 0.18), step(0.5, fract(hw * 3.0)));
          awning = mix(awning, vec3(0.86, 0.80, 0.66), step(0.8, fract(hw * 5.0)));
        } else if (vAlong >= 0.0 && vAbove > 0.7 && fade > 0.0) {
          float u = fract(vAlong / 3.0);
          float v = fract((vAbove - 0.7) / 3.2);
          float frameW = step(0.26, u) * step(u, 0.74) * step(0.18, v) * step(v, 0.78);
          float glassW = step(0.31, u) * step(u, 0.69) * step(0.23, v) * step(v, 0.73);
          vec3 glassCol = vec3(0.16, 0.2, 0.24) + 0.08 * v;
          wallCol = mix(wallCol, mix(vWall * 1.18, glassCol, glassW), frameW * fade);
        }
        // Weathering on the historic buildings: uneven grime, darker where rain runs down and damp rises.
        if (vKind > 0.5 && vAlong >= 0.0) {
          wallCol *= 0.84 + 0.2 * vn(vec2(vAlong * 0.7, vAbove * 0.18));
          wallCol *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.7, vAbove));
        }
        vec3 col = mix(wallCol, roof, vRoof) * light;
        // The streets' light and shade (shade.js): sampled just either side of a wall (its own building would
        // shade it; the street side wins).
        if (uShadeOn > 0.5 && uSolid > 0.5) {
          vec2 side = normalize(vNormal).xz * (0.8 / (${RES}.0 * uCell)) * (1.0 - vRoof);
          vec4 sa = texture2D(uShade, vUv + side);
          vec4 sb = texture2D(uShade, vUv - side);
          col *= shadeFactor(vGround + max(vAbove, 0.0), min(sa.r, sb.r), max(sa.g, sb.g), min(sa.b, sb.b));
        }
        if (vAlong < -3.5) col = awning * light;
        // The time of day at life size, and lit windows at night.
        col *= mix(vec3(1.0), uDayTint, uSolid);
        col = mix(col, vec3(1.0, 0.64, 0.30) * (0.75 + 0.35 * vn(wp * 2.0)), glow * (1.0 - vRoof) * uNight * uSolid);
        col = mix(col, uFogCol, fogAmount() * uSolid);
        gl_FragColor = vec4(col, edge * uOpacity);
      }
    `,
  });
}

function treeMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    vertexShader: /* glsl */ `
      ${common}
      ${FOG_VARY}
      attribute vec2 iPos;
      attribute float iGround;
      attribute float iH;
      attribute float iR;
      attribute float iShade;
      varying vec2 vClip;
      varying vec3 vNormal;
      varying float vTrunk;
      varying float vShade;
      void main() {
        // Base geometry: x/z in crown radii, y in tree heights.
        vec3 p = vec3(iPos.x + position.x * iR * uHScale,
                      (iGround - uBase) * uVScale * uRise + position.y * iH * uHScale * uRise,
                      iPos.y + position.z * iR * uHScale);
        vClip = (uHolder * vec4(p, 1.0)).xz;
        vNormal = normal;
        vTrunk = step(position.y, 0.3);
        vShade = iShade;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        ${fogVertex('modelViewMatrix * vec4(p, 1.0)')}
      }
    `,
    fragmentShader: /* glsl */ `
      ${common}
      ${FOG_PARS}
      varying vec2 vClip;
      varying vec3 vNormal;
      varying float vTrunk;
      varying float vShade;
      void main() {
        ${clip}
        float light = 0.5 + 0.55 * max(dot(normalize(vNormal), ${SUN}), 0.0);
        vec3 leaf = mix(vec3(0.16, 0.30, 0.12), vec3(0.30, 0.42, 0.16), vShade);
        vec3 col = mix(leaf, vec3(0.30, 0.22, 0.15), vTrunk) * light;
        col *= mix(vec3(1.0), uDayTint, uSolid);
        col = mix(col, uFogCol, fogAmount() * uSolid);
        gl_FragColor = vec4(col, edge * uOpacity);
      }
    `,
  });
}

// One tree, in crown radii across and tree heights up: a trunk, and a slightly lumpy crown.
function treeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.1, 0.14, 0.4, 5).translate(0, 0.2, 0);
  const crown = new THREE.IcosahedronGeometry(1, 1);
  const pos = crown.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const wob = 1 + 0.12 * Math.sin(pos.getX(k) * 5 + pos.getZ(k) * 3);
    pos.setXYZ(k, pos.getX(k) * wob, 0.64 + pos.getY(k) * 0.36 * wob, pos.getZ(k) * wob);
  }
  crown.computeVertexNormals();
  const merged = new THREE.BufferGeometry();
  const parts = [trunk.toNonIndexed(), crown.toNonIndexed()];
  const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const P = new Float32Array(n * 3);
  const N = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    P.set(g.attributes.position.array, o * 3);
    N.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  merged.setAttribute('position', new THREE.BufferAttribute(P, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return merged;
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [xa, ya] = poly[a];
    const [xb, yb] = poly[b];
    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}

// A house on a plot (an axis-aligned rectangle c[0..3] = NW, NE, SE, SW in map units), in an era's style:
//   1  timber-framed (c.1400–1650, and survivors later): 1–2 storeys of 2.7–3.15 m, the upper jettied 0.25–0.55 m out
//      over the street side(s); a steep gabled
//      roof with its gable end to the street.
//   2  Victorian, c.1900: 2–5 storeys of 3.6 m, a projecting cornice on the street side(s), shop awnings on some.
// open: which sides (N, E, S, W) face a street. doorSide: the side its door is on (bristol.js). mpm: map units per metre. v(x, z, y, normal, along) writes a vertex;
// along >= 0 is metres along a wall (for its timbers and windows), -1 plain, -2 cornice, -3 dark timber, -4 awning.
// Where house() puts each house's chimney top ([x, z] in map units, height in metres), when a list is given.
let chimneyTops = null;
// Where house() puts a timber house's doors and windows (fittings.js builds them from the kit at life size), when
// a list is given: [x, z (map units), y (metres above the house's ground), outward normal [x, z], storey height,
// 'door' | 'window' | 'shuttered', seed].
let fittings = null;
// The bays of a timber house's walls (the painted posts stand at each multiple).
export const BAY = 1.4;

function house(style, c, h, open, seed, mpm, v, doorSide = null) {
  let noted = false;
  const fract = (x) => x - Math.floor(x);
  // Cities are mixed: in c.1750 about a quarter of the houses are still the old timber ones; by 1938 most are
  // Victorian or Edwardian, about a quarter Georgian, and a few timber houses survive.
  const s2 = fract(seed * 7.31);
  if (style === 3 && s2 < 0.25) style = 1;
  else if (style === 2 && s2 < 0.1) style = 1;
  else if (style === 2 && s2 < 0.35) style = 3;
  const emit = v;
  v = (x, z, y, nrm, along) => emit(x, z, y, nrm, along, style);

  const ex = [(c[1][0] - c[0][0]), (c[1][1] - c[0][1])];
  const sz = [(c[3][0] - c[0][0]), (c[3][1] - c[0][1])];
  const wx = Math.hypot(...ex) / mpm;
  const wz = Math.hypot(...sz) / mpm;
  const e = [ex[0] / (wx * mpm), ex[1] / (wx * mpm)]; // unit east, in map units per metre
  const so = [sz[0] / (wz * mpm), sz[1] / (wz * mpm)]; // unit south
  const dirs = [[-so[0], -so[1]], e, so, [-e[0], -e[1]]]; // outward normals of N, E, S, W
  const at = (p, d, m) => [p[0] + d[0] * m * mpm, p[1] + d[1] * m * mpm];
  // The rectangle grown by o[k] metres on side k.
  const grow = (o) => [
    at(at(c[0], dirs[0], o[0]), dirs[3], o[3]), at(at(c[1], dirs[0], o[0]), dirs[1], o[1]),
    at(at(c[2], dirs[2], o[2]), dirs[1], o[1]), at(at(c[3], dirs[2], o[2]), dirs[3], o[3]),
  ];
  // Each house stands 35 cm inside its plot, so neighbours (and their leans) never pass through one another.
  c = grow([-0.35, -0.35, -0.35, -0.35]);
  const quad = (a, b, y0, y1, n, along0, along1) => {
    v(a[0], a[1], y0, n, along0); v(b[0], b[1], y0, n, along1); v(b[0], b[1], y1, n, along1);
    v(a[0], a[1], y0, n, along0); v(b[0], b[1], y1, n, along1); v(a[0], a[1], y1, n, along0);
  };
  const box = (r, y0, y1, flags = [0, 0, 0, 0]) => {
    for (let k = 0; k < 4; k++) {
      const a = r[k];
      const b = r[(k + 1) % 4];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) / mpm;
      const d = dirs[k];
      quad(a, b, y0, y1, [d[0], 0, d[1]], flags[k] || 0, flags[k] || len);
    }
  };
  const flat = (r, y, n, along = -1) => {
    for (const t of [[0, 1, 2], [0, 2, 3]]) for (const q of t) v(r[q][0], r[q][1], y, n, along);
  };
  const up = [0, 1, 0];
  const down = [0, -1, 0];
  // A chimney stack: a small box at point p rising from y0 to y1. (The first of each house's stacks is noted, for
  // its smoke: see chimneyTops.)
  const stack = (p, y0, y1) => {
    if (chimneyTops && !noted) {
      chimneyTops.push([p[0], p[1], y1]);
      noted = true;
    }
    const q = (de, ds) => [p[0] + (e[0] * de + so[0] * ds) * mpm, p[1] + (e[1] * de + so[1] * ds) * mpm];
    const r = [q(-0.5, -0.35), q(0.5, -0.35), q(0.5, 0.35), q(-0.5, 0.35)];
    box(r, y0, y1, [-1, -1, -1, -1]);
    flat(r, y1, up);
  };
  if (style === 1) {
    // Old timber houses are never straight: each leans a little (up to ~1.5 cm per metre of height, its own way), has
    // its own storey height and jetty depth, and its ridge sags towards one end.
    const r1 = (k) => fract(Math.sin(seed * 91.7 + k * 13.1) * 4375.85);
    const lean = [(r1(1) - 0.5) * 0.03, (r1(2) - 0.5) * 0.03];
    const straight = v;
    v = (x, z, y, nrm, along) => straight(x + lean[0] * Math.max(0, y) * mpm, z + lean[1] * Math.max(0, y) * mpm, y, nrm, along);
    const H = 2.7 + r1(3) * 0.45;
    // Mostly two storeys with rooms in the roof; some single-storey, a few of three (mixed roof heights).
    const n = r1(6) < 0.15 ? 1 : r1(6) < 0.88 ? 2 : 3;
    const J = 0.25 + r1(4) * 0.3;
    let prev = null;
    for (let s = 0; s < n; s++) {
      const r = grow(open.map((o) => (o ? s * J : 0)));
      box(r, s ? s * H : -2, (s + 1) * H);
      // Its door and windows, in the bays of the walls that face a street: a door in the middle bay of the first
      // street side; windows in about half the other bays (shuttered now and then).
      if (fittings) {
        let first = true;
        for (let k = 0; k < 4; k++) {
          if (!open[k]) continue;
          const a = r[k];
          const b = r[(k + 1) % 4];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]) / mpm;
          const nb = Math.floor(len / BAY);
          // (On the side bristol.js chose, facing a street where it can: else the first open side.)
          const door = s === 0 && (doorSide != null && open[doorSide] ? k === doorSide : first) ? Math.floor((nb - 1) / 2) : -1;
          first = false;
          for (let q = 0; q < nb; q++) {
            const t = ((q + 0.5) * BAY) / len;
            const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            const pick = r1(20 + q * 3 + s * 17 + k * 5);
            const what = q === door ? 'door' : pick < (s ? 0.55 : 0.4) ? (pick < 0.12 ? 'shuttered' : 'window') : null;
            const y = s * H + 0.05;
            if (what) fittings.push([p[0] + lean[0] * y * mpm, p[1] + lean[1] * y * mpm, y, dirs[k], H, what, pick]);
          }
        }
      }
      // The underside of each jetty.
      if (prev) {
        for (let k = 0; k < 4; k++) {
          if (!open[k]) continue;
          const a0 = prev[k];
          const b0 = prev[(k + 1) % 4];
          const a1 = r[k];
          const b1 = r[(k + 1) % 4];
          for (const q of [a0, b0, b1, a0, b1, a1]) v(q[0], q[1], s * H, down, -3);
        }
      }
      prev = r;
    }
    // The roof: ridge across the plot from the street, so the gable faces it. (N/S street: ridge runs N-S.)
    const top = n * H;
    const nsFront = open[0] || open[2];
    const ewFront = open[1] || open[3];
    const ridgeNS = nsFront && !ewFront ? true : ewFront && !nsFront ? false : seed > 0.5;
    const r = prev;
    const [a, b, cc, d] = ridgeNS ? [r[0], r[1], r[2], r[3]] : [r[1], r[2], r[3], r[0]];
    // a-b is a gable end, b-cc an eave side, cc-d the other gable, d-a the other eave.
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]) / mpm;
    const rise = Math.min(6, span * 0.6);
    const sag = r1(5) * 0.5; // the far end of the ridge has dropped
    const m1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m2 = [(cc[0] + d[0]) / 2, (cc[1] + d[1]) / 2];
    const ga = ridgeNS ? dirs[0] : dirs[1];
    const gb = ridgeNS ? dirs[2] : dirs[3];
    // Gable triangles (timbered like the walls).
    v(a[0], a[1], top, [ga[0], 0, ga[1]], 0); v(b[0], b[1], top, [ga[0], 0, ga[1]], span); v(m1[0], m1[1], top + rise, [ga[0], 0, ga[1]], span / 2);
    v(cc[0], cc[1], top, [gb[0], 0, gb[1]], 0); v(d[0], d[1], top, [gb[0], 0, gb[1]], span); v(m2[0], m2[1], top + rise - sag, [gb[0], 0, gb[1]], span / 2);
    // Two roof slopes.
    for (const [p0, p1, q0, q1] of [[b, cc, m1, m2], [d, a, m2, m1]]) {
      const out = [(p0[0] + p1[0]) / 2 - (m1[0] + m2[0]) / 2, (p0[1] + p1[1]) / 2 - (m1[1] + m2[1]) / 2];
      const ol = Math.hypot(...out) || 1;
      const nrm = [(out[0] / ol) * 0.6, 0.8, (out[1] / ol) * 0.6];
      const y0 = p0 === b ? top + rise : top + rise - sag; // the ridge end above r0
      const y1 = p0 === b ? top + rise - sag : top + rise;
      for (const [q, y] of [[p0, top], [p1, top], [q1, y1], [p0, top], [q1, y1], [q0, y0]]) v(q[0], q[1], y, nrm, -1);
    }
    // A stack at the back gable, standing above the ridge.
    stack([(m2[0] * 3 + m1[0]) / 4, (m2[1] * 3 + m1[1]) / 4], top - 1, top + rise - sag * 0.75 + 0.9);
    return;
  }
  // Victorian (2) or Georgian (3): storeys of 3.6 or 3.3 m, a flat roof behind a cornice and parapet, chimney stacks
  // on the party walls.
  const H = style === 3 ? 3.3 : 3.6;
  const n = Math.max(2, Math.min(style === 3 ? 4 : 5, Math.round(h / H) + (seed > 0.75 ? 1 : 0) - (seed < 0.2 ? 1 : 0)));
  const top = n * H;
  box(c, -2, top + 0.2);
  flat(c, top + 0.2, up);
  for (let k = 0; k < 4; k++) {
    if (open[k] || fract(seed * (k + 3.7)) < 0.5) continue;
    const mid = [(c[k][0] + c[(k + 1) % 4][0]) / 2, (c[k][1] + c[(k + 1) % 4][1]) / 2];
    stack(at(mid, dirs[k], -0.4), top, top + 1.6);
  }
  for (let k = 0; k < 4; k++) {
    if (!open[k]) continue;
    const d = dirs[k];
    const a = c[k];
    const b = c[(k + 1) % 4];
    const a1 = at(a, d, 0.35);
    const b1 = at(b, d, 0.35);
    const n3 = [d[0], 0, d[1]];
    for (const q of [a, b, b1, a, b1, a1]) v(q[0], q[1], top - 0.45, down, -2);
    quad(a1, b1, top - 0.45, top + 0.2, n3, -2, -2);
    for (const q of [a, b, b1, a, b1, a1]) v(q[0], q[1], top + 0.2, up, -2);
    // A shop awning over the pavement on about half the street fronts.
    if (style === 2 && seed > 0.45) {
      const a2 = at(a, d, 1.6);
      const b2 = at(b, d, 1.6);
      const slope = [d[0] * 0.35, 0.94, d[1] * 0.35];
      for (const [q, y] of [[a, 3.05], [b, 3.05], [b2, 2.45], [a, 3.05], [b2, 2.45], [a2, 2.45]]) v(q[0], q[1], y, slope, -4);
    }
  }
}

export class Objects {
  constructor(map) {
    this.map = map;
    this.buildings = new THREE.Mesh(new THREE.BufferGeometry(), buildingMaterial(map.uniforms));
    this.buildings.frustumCulled = false;
    const base = treeGeometry();
    this.treeGeo = new THREE.InstancedBufferGeometry();
    this.treeGeo.setAttribute('position', base.attributes.position);
    this.treeGeo.setAttribute('normal', base.attributes.normal);
    this.trees = new THREE.Mesh(this.treeGeo, treeMaterial(map.uniforms));
    this.trees.frustumCulled = false;
    map.holder.add(this.buildings, this.trees);
    this.visible = false;
  }

  // grids: the window's terrain and surface (RES x RES metres). footprints: [height, levels, [[lat, lon]...]], the
  // buildings to show. exclude: every known footprint (so trees are never planted where a building stands, even
  // when it isn't shown). trees: whether to plant today's trees at all.
  // clear: [[lat, lon, radius m]] areas where a 3D scan shows the real thing, so no boxes or trees are drawn there.
  rebuild(...args) {
    for (const _ of this.rebuildSteps(...args));
  }

  // The same, as steps (rebuildObjectsStaged runs one a frame): it pauses every few hundred buildings and every
  // block of rows of the tree search.
  *rebuildSteps(source, grids, footprints, { exclude = footprints, trees = true, clear = [] } = {}) {
    const map = this.map;
    const { terrain, surface } = grids;
    const size = map.size;
    const cell = map.span / RES;
    const toX = (i) => (i / (RES - 1) - 0.5) * size;
    const sample = (grid, i, j) => grid[Math.min(RES - 1, Math.max(0, Math.round(j))) * RES + Math.min(RES - 1, Math.max(0, Math.round(i)))];

    // --- buildings ---
    const occupied = new OffscreenCanvas(RES, RES);
    const octx = occupied.getContext('2d', { willReadFrequently: true });
    octx.fillStyle = '#fff';
    // Each building's height above the ground, as a picture (red = 4 x metres): for the shadows and the shade in
    // the streets (shade.js).
    const heights = new OffscreenCanvas(RES, RES);
    const hctx = heights.getContext('2d', { willReadFrequently: true });
    const P = [];
    const N = [];
    const G = [];
    const A = [];
    const W = [];
    const L = [];
    const K = []; // each vertex's building style (see house())
    let count = 0;
    const chimneysOut = []; // each house's chimney top: { i, j, top (metres OD), seed }
    const fittingsOut = []; // each timber house's doors and windows: { x, z (metres from the window's middle), y (OD), ... }
    const clearZones = clear.map(([lat, lon, radius]) => {
      const w = source.toWindow(lat, lon);
      return [w.i, w.j, radius / cell];
    });
    const inClear = (i, j) => clearZones.some(([ci, cj, cr]) => Math.hypot(i - ci, j - cj) < cr);
    // The era's building style (see house()); 0: as mapped.
    const style = source.styleFor?.(map.era) ?? 0;
    const mpm = size / map.span;
    let done = 0;
    for (const [tagH, levels, outline, plot] of footprints ?? []) {
      if (++done % 250 === 0) yield;
      if (count >= MAX_BUILDINGS) break;
      const pts = outline.map(([lat, lon]) => {
        const w = source.toWindow(lat, lon);
        return [w.i, w.j];
      });
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      if (x1 < 0 || y1 < 0 || x0 > RES - 1 || y0 > RES - 1) continue;
      if (inClear((x0 + x1) / 2, (y0 + y1) / 2)) continue;
      // Height: mapped height, else storeys, else the LIDAR's 70th-percentile surface above ground inside it.
      let ground = Infinity;
      const above = [];
      const step = Math.max(0.5, Math.min(x1 - x0, y1 - y0) / 6);
      for (let y = y0 + step / 2; y < y1; y += step) {
        for (let x = x0 + step / 2; x < x1; x += step) {
          if (!pointInPolygon(x, y, pts)) continue;
          const g = sample(terrain, x, y);
          ground = Math.min(ground, g);
          above.push(sample(surface, x, y) - g);
        }
      }
      for (const [x, y] of pts) ground = Math.min(ground, sample(terrain, x, y));
      if (!Number.isFinite(ground)) continue;
      above.sort((a, b) => a - b);
      const lidar = above.length ? above[Math.floor(above.length * 0.7)] : 0;
      const h = Math.min(120, Math.max(2.8, tagH ?? (levels ? levels * 3 + 1 : lidar)));
      octx.beginPath();
      pts.forEach(([x, y], k) => (k ? octx.lineTo(x, y) : octx.moveTo(x, y)));
      octx.fill();
      hctx.fillStyle = `rgb(${Math.min(255, Math.round(h * 4))},0,0)`;
      hctx.beginPath();
      pts.forEach(([x, y], k) => (k ? hctx.lineTo(x, y) : hctx.moveTo(x, y)));
      hctx.fill();
      const wall = WALLS[count % WALLS.length];
      const local = pts.map(([i, j]) => [toX(i), toX(j)]);
      if (style && plot && local.length === 4) {
        chimneyTops = [];
        fittings = [];
        house(style, local, h, plot.open, plot.seed, mpm, (x, z, y, n, along, kind) => {
          K.push(kind);
          P.push(x, 0, z);
          N.push(n[0], n[1], n[2]);
          G.push(ground);
          A.push(y);
          W.push(wall.r, wall.g, wall.b);
          L.push(along);
        }, plot.door);
        for (const [x, z, y] of chimneyTops) chimneysOut.push({ i: (x / size + 0.5) * (RES - 1), j: (z / size + 0.5) * (RES - 1), top: ground + y, seed: plot.seed });
        chimneyTops = null;
        for (const [x, z, y, n, H, kind, seed] of fittings) fittingsOut.push({ x: x / mpm, z: z / mpm, y: ground + y, n, H, kind, seed });
        fittings = null;
        count++;
        continue;
      }
      // Walls (from slightly below ground so slopes don't leave gaps).
      for (let k = 0; k < local.length; k++) {
        const [ax, az] = local[k];
        const [bx, bz] = local[(k + 1) % local.length];
        const nx = bz - az;
        const nz = -(bx - ax);
        const nl = Math.hypot(nx, nz) || 1;
        // Distance along the wall in metres, for placing windows (-1: too short for any).
        const metres = (nl / size) * map.span;
        const end = metres < 2.5 ? -1 : metres;
        for (const [x, z, y, s] of [[ax, az, -2, 0], [bx, bz, -2, 1], [bx, bz, h, 1], [ax, az, -2, 0], [bx, bz, h, 1], [ax, az, h, 0]]) {
          K.push(0);
          P.push(x, 0, z);
          N.push(nx / nl, 0, nz / nl);
          G.push(ground);
          A.push(y);
          W.push(wall.r, wall.g, wall.b);
          L.push(end < 0 ? -1 : s * end);
        }
      }
      const tris = THREE.ShapeUtils.triangulateShape(local.map(([x, z]) => new THREE.Vector2(x, z)), []);
      for (const tri of tris) {
        for (const v of tri) {
          K.push(0);
          P.push(local[v][0], 0, local[v][1]);
          N.push(0, 1, 0);
          G.push(ground);
          A.push(h);
          W.push(wall.r, wall.g, wall.b);
          L.push(-1);
        }
      }
      count++;
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    bg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    bg.setAttribute('ground', new THREE.Float32BufferAttribute(G, 1));
    bg.setAttribute('above', new THREE.Float32BufferAttribute(A, 1));
    bg.setAttribute('wall', new THREE.Float32BufferAttribute(W, 3));
    bg.setAttribute('along', new THREE.Float32BufferAttribute(L, 1));
    bg.setAttribute('kind', new THREE.Float32BufferAttribute(K, 1));
    this.buildings.geometry.dispose();
    this.buildings.geometry = bg;
    this.chimneys = chimneysOut;
    this.fittings = fittingsOut;
    // (Built for the window now loaded: any shift that kept the old ones in place while it loaded is undone.)
    this.buildings.position.set(0, 0, 0);

    // --- trees ---
    // The buildings shown, as a mask: solid for walking at life size (see ContourMap.blockedAt).
    const shown = octx.getImageData(0, 0, RES, RES).data;
    this.solid = new Uint8Array(RES * RES);
    for (let k = 0; k < this.solid.length; k++) this.solid[k] = shown[k * 4 + 3] > 127 ? 1 : 0;
    const hpx = hctx.getImageData(0, 0, RES, RES).data;
    this.heights = new Float32Array(RES * RES);
    for (let k = 0; k < this.heights.length; k++) this.heights[k] = hpx[k * 4 + 3] > 127 ? hpx[k * 4] / 4 : 0;
    // Mark every known footprint, shown or not, so its measured height isn't mistaken for a tree.
    for (const [, , outline] of exclude ?? []) {
      octx.beginPath();
      outline.forEach(([lat, lon], k) => {
        const w = source.toWindow(lat, lon);
        if (k) octx.lineTo(w.i, w.j);
        else octx.moveTo(w.i, w.j);
      });
      octx.fill();
    }
    const occ = octx.getImageData(0, 0, RES, RES).data;
    const built = (k) => occ[k * 4 + 3] > 0;
    this.occupied = (i, j) => {
      const x = Math.round(i);
      const y = Math.round(j);
      return x >= 0 && y >= 0 && x < RES && y < RES && built(y * RES + x);
    };
    const r = Math.max(1, Math.round(4 / cell)); // canopy peaks at least ~4 m apart
    const pos = [];
    const gr = [];
    const hs = [];
    const rs = [];
    const sh = [];
    // Don't plant trees where a modelled structure stands (the bridge deck shows up as 'canopy' over the gorge).
    // Nor in the sea: where the survey caught the water above the mud, it reads as 'canopy'. Nothing grows below
    // the high-water mark.
    const shore = source.tides ? source.tides.high + 0.5 : -Infinity;
    const kept = (source.noTrees ?? []).map(([lat, lon, radius]) => {
      const w = source.toWindow(lat, lon);
      return [w.i, w.j, radius / cell];
    });
    for (let j = r; j < RES - r; j++) {
      if (j % 96 === 0) yield;
      for (let i = r; i < RES - r; i++) {
        const k = j * RES + i;
        const h = surface[k] - terrain[k];
        if (!trees || h < 3 || h > 45 || built(k) || terrain[k] < shore) continue;
        if (kept.some(([ci, cj, cr]) => Math.hypot(i - ci, j - cj) < cr) || inClear(i, j)) continue;
        // Is this the highest point of the canopy around it?
        let peak = true;
        for (let dj = -r; dj <= r && peak; dj++) {
          for (let di = -r; di <= r; di++) {
            if ((di || dj) && surface[k + dj * RES + di] - terrain[k + dj * RES + di] > h) {
              peak = false;
              break;
            }
          }
        }
        if (!peak) continue;
        pos.push(toX(i), toX(j));
        gr.push(terrain[k]);
        hs.push(h);
        rs.push(Math.min(7, Math.max(1.5, h * 0.32, cell * r * 0.7)));
        sh.push((Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1);
      }
    }
    let n = hs.length;
    const keep = n > MAX_TREES ? Math.ceil(n / MAX_TREES) : 1;
    const pick = (arr, stride) => Float32Array.from({ length: Math.floor(n / keep) * stride }, (_, x) => arr[Math.floor(x / stride) * keep * stride + (x % stride)]);
    const iPos = pick(pos, 2);
    n = Math.floor(n / keep);
    this.treeGeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 2));
    this.treeGeo.setAttribute('iGround', new THREE.InstancedBufferAttribute(pick(gr, 1), 1));
    this.treeGeo.setAttribute('iH', new THREE.InstancedBufferAttribute(pick(hs, 1), 1));
    this.treeGeo.setAttribute('iR', new THREE.InstancedBufferAttribute(pick(rs, 1), 1));
    this.treeGeo.setAttribute('iShade', new THREE.InstancedBufferAttribute(pick(sh.map((x) => Math.abs(x)), 1), 1));
    this.treeGeo.instanceCount = n;
    this.trees.position.set(0, 0, 0); // (the shift kept while loading, undone)
    console.info(`[objects] ${count} buildings, ${n} trees`);
  }

  setVisible(on) {
    this.buildings.visible = on;
    this.trees.visible = on;
  }
}
