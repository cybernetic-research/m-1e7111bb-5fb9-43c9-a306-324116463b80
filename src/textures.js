import * as THREE from 'three';

// Surface textures drawn in code (no image files): stone, thatch, wattle, timber, shingles, ironwork paint.
// Each covers one "tile" of real metres; geometry gets UVs in tiles with metreUVs() / roundUVs(), so a 20 m wall
// shows 20 m of stonework rather than one stretched block.

const cache = new Map();

function canvasTexture(key, px, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  draw(g, px);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

// A repeatable pseudo-random sequence, so textures come out the same every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// A colour (0xRRGGBB, as written in sRGB) scaled by k, as a canvas style. (Not through THREE.Color, which would
// convert to linear values and paint the canvas too dark.)
const shade = (hex, k) => {
  const ch = (shift) => Math.min(255, Math.round(((hex >> shift) & 255) * k));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

// Coursed stone: rows of blocks with mortar lines. tile = 2 m.
export function stoneTexture(hex = 0x8f8a80, seed = 1) {
  return canvasTexture(`stone${hex}${seed}`, 256, (g, n) => {
    const r = rng(seed);
    g.fillStyle = shade(hex, 0.7);
    g.fillRect(0, 0, n, n);
    const rows = 8;
    const h = n / rows;
    for (let y = 0; y < rows; y++) {
      let x = -r() * 40;
      while (x < n) {
        const w = 30 + r() * 46;
        g.fillStyle = shade(hex, 0.82 + r() * 0.36);
        g.fillRect(x + 2, y * h + 2, w - 3, h - 3);
        // Wrap blocks that run off the right edge round to the left, so the tile repeats cleanly.
        if (x + w > n) g.fillRect(x + 2 - n, y * h + 2, w - 3, h - 3);
        x += w;
      }
    }
    // Weathering speckle.
    for (let k = 0; k < 900; k++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.12})`;
      g.fillRect(r() * n, r() * n, 2, 2);
    }
  });
}

// Long straw thatch, combed downwards. tile = 2 m.
export function thatchTexture(hex = 0x9b8456) {
  return canvasTexture(`thatch${hex}`, 256, (g, n) => {
    const r = rng(7);
    g.fillStyle = shade(hex, 0.75);
    g.fillRect(0, 0, n, n);
    for (let k = 0; k < 2600; k++) {
      const x = r() * n;
      const y = r() * n;
      const len = 14 + r() * 26;
      g.strokeStyle = shade(hex, 0.6 + r() * 0.6);
      g.lineWidth = 1 + r();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y + len);
      g.stroke();
      if (y + len > n) {
        g.beginPath();
        g.moveTo(x, y - n);
        g.lineTo(x, y + len - n);
        g.stroke();
      }
    }
    // Courses of thatch, each overlapping the one below.
    for (let y = 0; y < n; y += n / 4) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, y, n, 3);
    }
  });
}

// Wattle and daub: limewashed clay, patchy, with hints of the hazel weave beneath. tile = 2 m.
export function daubTexture(hex = 0xb9a88a) {
  return canvasTexture(`daub${hex}`, 256, (g, n) => {
    const r = rng(3);
    g.fillStyle = shade(hex, 1);
    g.fillRect(0, 0, n, n);
    for (let k = 0; k < 400; k++) {
      g.fillStyle = shade(hex, 0.8 + r() * 0.3);
      g.beginPath();
      g.arc(r() * n, r() * n, 4 + r() * 14, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(70,50,30,0.22)';
    g.lineWidth = 3;
    for (let y = 0; y < n; y += 16) {
      g.beginPath();
      for (let x = 0; x <= n; x += 8) g.lineTo(x, y + Math.sin((x / n) * Math.PI * 8 + y) * 3);
      g.stroke();
    }
  });
}

// Upright timber planks (or posts). tile = 2 m.
export function timberTexture(hex = 0x6b4a2e) {
  return canvasTexture(`timber${hex}`, 256, (g, n) => {
    const r = rng(11);
    const w = n / 8;
    for (let k = 0; k < 8; k++) {
      g.fillStyle = shade(hex, 0.8 + r() * 0.35);
      g.fillRect(k * w, 0, w, n);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(k * w, 0, 2, n);
      for (let s = 0; s < 14; s++) {
        g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`;
        g.fillRect(k * w + r() * w, 0, 1, n);
      }
    }
  });
}

// Overlapping wooden shingles. tile = 2 m.
export function shingleTexture(hex = 0x6f6a55) {
  return canvasTexture(`shingle${hex}`, 256, (g, n) => {
    const r = rng(5);
    g.fillStyle = shade(hex, 0.6);
    g.fillRect(0, 0, n, n);
    const rows = 10;
    const h = n / rows;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * 12;
      for (let x = -off; x < n; x += 24) {
        g.fillStyle = shade(hex, 0.8 + r() * 0.35);
        g.fillRect(x + 1, y * h, 22, h - 2);
      }
    }
    // Moss.
    for (let k = 0; k < 300; k++) {
      g.fillStyle = `rgba(80,110,40,${r() * 0.35})`;
      g.fillRect(r() * n, r() * n, 3 + r() * 6, 2 + r() * 3);
    }
  });
}

// Red-brown brick in stretcher bond, sooty. tile = 2 m.
export function brickTexture(hex = 0x8a4a34) {
  return canvasTexture(`brick${hex}`, 256, (g, n) => {
    const r = rng(17);
    g.fillStyle = shade(hex, 0.45);
    g.fillRect(0, 0, n, n);
    const rows = 26;
    const h = n / rows;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * 14;
      for (let x = -off; x < n; x += 28) {
        g.fillStyle = shade(hex, 0.7 + r() * 0.45);
        g.fillRect(x + 1, y * h + 1, 26, h - 2);
      }
    }
    for (let k = 0; k < 500; k++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.15})`;
      g.fillRect(r() * n, r() * n, 3, 3);
    }
  });
}

// Rough grass for earth-covered roofs and banks. tile = 4 m.
export function grassTexture(hex = 0x5d7a3a) {
  return canvasTexture(`grass${hex}`, 128, (g, n) => {
    const r = rng(9);
    g.fillStyle = shade(hex, 1);
    g.fillRect(0, 0, n, n);
    for (let k = 0; k < 1500; k++) {
      g.fillStyle = shade(hex, 0.7 + r() * 0.6);
      g.fillRect(r() * n, r() * n, 1, 2 + r() * 3);
    }
  });
}

// Gravel / beaten earth. tile = 4 m.
export function gravelTexture(hex = 0x9a9488) {
  return canvasTexture(`gravel${hex}`, 128, (g, n) => {
    const r = rng(13);
    g.fillStyle = shade(hex, 1);
    g.fillRect(0, 0, n, n);
    for (let k = 0; k < 2500; k++) {
      g.fillStyle = shade(hex, 0.7 + r() * 0.6);
      g.fillRect(r() * n, r() * n, 1 + r() * 2, 1 + r() * 2);
    }
  });
}

// A material with one of the textures above, in tiles of `tile` metres.
export function textured(tex, { tile = 2, color = 0xffffff, side = THREE.FrontSide, roughness = 0.9 } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tex, color, roughness, side });
  m.userData.tile = tile;
  return m;
}

// UVs in tiles for any geometry: each face is projected onto the plane it most nearly faces. Good for boxes,
// extrusions and anything flat-sided.
export function metreUVs(geo, tile = 2) {
  const p = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let k = 0; k < p.count; k++) {
    const ax = Math.abs(nrm.getX(k));
    const ay = Math.abs(nrm.getY(k));
    const az = Math.abs(nrm.getZ(k));
    let u;
    let v;
    if (ay >= ax && ay >= az) [u, v] = [p.getX(k), p.getZ(k)];
    else if (ax >= az) [u, v] = [p.getZ(k), p.getY(k)];
    else [u, v] = [p.getX(k), p.getY(k)];
    uv[k * 2] = u / tile;
    uv[k * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.userData.uvDone = true;
  return geo;
}

// UVs in tiles for a cylinder or cone made by three.js (u round, v up), given its radius and height.
export function roundUVs(geo, radius, height, tile = 2) {
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * Math.PI * 2 * radius) / tile, (uv.getY(k) * height) / tile);
  geo.userData.uvDone = true;
  return geo;
}
