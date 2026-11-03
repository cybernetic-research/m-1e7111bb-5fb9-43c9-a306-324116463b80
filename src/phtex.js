import * as THREE from 'three';

// Photographic textures from Poly Haven (CC0; assets/textures/polyhaven, 1k JPGs). One shared copy of each.
// raw: keep the image's sRGB values as they are (for the hand-written shaders, whose colours are display values);
// otherwise the colour map is treated as sRGB for the standard (lit, PBR) materials.

const loader = new THREE.TextureLoader();
const cache = new Map();

export function phTexture(id, kind = 'diff', raw = false) {
  const key = `${id}/${kind}/${raw}`;
  if (!cache.has(key)) {
    const t = loader.load(`assets/textures/polyhaven/${id}_${kind}_1k.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.colorSpace = kind === 'diff' && !raw ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    cache.set(key, t);
  }
  return cache.get(key);
}

// A lit material with a Poly Haven colour and normal map. UVs are in tiles (see metreUVs), one image per tile.
export function phMaterial(id, { color = 0xffffff, roughness = 0.9, side = THREE.FrontSide } = {}) {
  return new THREE.MeshStandardMaterial({
    map: phTexture(id), normalMap: phTexture(id, 'nor'), color, roughness, side,
  });
}
