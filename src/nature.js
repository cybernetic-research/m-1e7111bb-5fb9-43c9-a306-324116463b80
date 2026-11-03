import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Quaternius's Stylized Nature MegaKit (CC0; assets/models/nature): trees, bushes, plants and rocks, shared by
// trees.js (the town's trees) and outskirts.js (the woods at the world's edge), so each model loads once.
const NATURE = 'assets/models/nature/';
const loader = new GLTFLoader();
// A model of the kit's as instanceable parts, 1 m tall, standing at the origin.
const parts = new Map();
export function natureParts(name) {
  if (!parts.has(name)) {
    parts.set(name, loader.loadAsync(NATURE + name + '.gltf').then((g) => {
      g.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g.scene);
      const h = box.max.y - box.min.y || 1;
      const out = [];
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
        geo.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2).scale(1 / h, 1 / h, 1 / h);
        const m = o.material;
        m.metalness = 0;
        if (m.map && /Leaves|Leaf|Grass|Flowers/.test(m.name)) {
          m.alphaTest = 0.4;
          m.side = THREE.DoubleSide;
          m.transparent = false;
        }
        out.push({ geometry: geo, material: m });
      });
      return out;
    }).catch((err) => {
      console.warn('[trees] missing', name, err);
      return [];
    }));
  }
  return parts.get(name);
}

