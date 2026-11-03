import * as THREE from 'three';
import { RES } from './terrain.js';
import { piece } from './kithouse.js';
import { nightLit } from './daylight.js';

// The kit's doors and windows (Medieval Village MegaKit) on the town's timber houses (objects.js), at life size:
// a door in a frame on each house's street front, windows (now and then shuttered, or with their shutters open) in
// about half the bays of its street walls. objects.js lists where each goes; they're drawn as instances of the kit's
// pieces, only within RADIUS metres of you (80) (the list is refreshed as you walk), and the houses' painted windows are
// left off inside the same circle, so the two never show together.

const RADIUS = 80;
const REFRESH = 12; // metres walked before the circle follows you
const KIT_H = 3.12; // the kit's storey, which its pieces fit

// What each kind of fitting is made of: [piece, x, z offset (metres; the wall's face is z = 0)].
const MAKE = {
  door: [['DoorFrame_Flat_WoodDark', 0, 0.02], ['Door_1_Flat', -0.53, 0.07]],
  window: [['Window_Thin_Flat1', 0, 0.03]],
  open: [['Window_Thin_Flat1', 0, 0.03], ['WindowShutters_Thin_Flat_Open', 0, 0.03]],
  shuttered: [['Window_Thin_Flat1', 0, 0.03], ['WindowShutters_Thin_Flat_Closed', 0, 0.03]],
};

// The glass at night: about half the windows show firelight.
const litGlass = nightLit(new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.3 }), 'window');
const darkGlass = new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: 0.3 });

export function houseFittings(ctx, { eras }) {
  const map = ctx.map;
  const a = { i: (RES - 1) / 2, j: (RES - 1) / 2 };
  const root = new THREE.Group();
  let parts = null; // [{ geometry, material, offset matrix, kinds }]
  let built = null; // the objects.fittings list the instances were made for
  let meshes = [];
  let centre = null;
  const _h = new THREE.Vector3();
  Promise.all(Object.values(MAKE).flat().map(([n]) => n).filter((n, k, l) => l.indexOf(n) === k).map(async (n) => [n, await piece(n)]))
    .then((loaded) => {
      const byName = new Map(loaded);
      parts = [];
      for (const [kind, list] of Object.entries(MAKE)) {
        for (const [name, x, z] of list) {
          for (const { geometry, material } of byName.get(name) ?? []) {
            const glass = material.name === 'MI_WindowGlass';
            for (const lit of glass ? [true, false] : [null]) {
              parts.push({ kind, geometry, material: glass ? (lit ? litGlass : darkGlass) : material, lit, offset: new THREE.Matrix4().makeTranslation(x, 0, z) });
            }
          }
        }
      }
    });

  // Which kind each fitting is (a window's shutters are open on about a third).
  const kindOf = (f) => (f.kind === 'window' && (f.seed * 37.1) % 1 < 0.35 ? 'open' : f.kind);
  const build = (list) => {
    for (const m of meshes) {
      root.remove(m);
      m.dispose();
    }
    meshes = parts.map((p) => {
      const n = list.filter((f) => kindOf(f) === p.kind && (p.lit == null || ((f.seed * 53.3) % 1 < 0.5) === p.lit)).length;
      const m = new THREE.InstancedMesh(p.geometry, p.material, Math.max(1, n));
      m.count = 0;
      m.frustumCulled = false;
      m.userData.part = p;
      root.add(m);
      return m;
    });
    built = list;
    centre = null;
  };
  const _m = new THREE.Matrix4();
  const _r = new THREE.Matrix4();
  const _s = new THREE.Matrix4();
  // Fill the instances with the fittings within RADIUS of (cx, cz) (metres, in this item's frame).
  const fill = (cx, cz) => {
    for (const m of meshes) m.count = 0;
    for (const f of built) {
      if (Math.hypot(f.x - cx, f.z - cz) > RADIUS) continue;
      const kind = kindOf(f);
      const lit = (f.seed * 53.3) % 1 < 0.5;
      _r.makeRotationY(Math.atan2(f.n[0], f.n[1]));
      _s.makeScale(1, f.H / KIT_H, 1);
      for (const m of meshes) {
        const p = m.userData.part;
        if (p.kind !== kind || (p.lit != null && p.lit !== lit)) continue;
        _m.makeTranslation(f.x, f.y, f.z).multiply(_r).multiply(_s).multiply(p.offset);
        m.setMatrixAt(m.count++, _m);
      }
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    centre = [cx, cz];
    // The same circle, in map units, for the houses' shader (so painted windows are left off inside it).
    const toMap = (metres) => metres * (map.size / map.span);
    map.uniforms.uKitCentre.value.set(toMap(cx), toMap(cz));
    map.uniforms.uKitR.value = toMap(RADIUS);
  };

  let lastFill = -Infinity;
  const animate = (t) => {
    const life = map.game?.life?.state === 'on';
    const list = map.objects?.fittings;
    if (!parts || !list || !life || !root.parent || !eras.includes(map.era)) {
      map.uniforms.uKitR.value = 0;
      return;
    }
    if (list !== built) build(list);
    // Where you are, in this item's frame (metres from the window's middle).
    root.updateWorldMatrix(true, false);
    root.worldToLocal(_h.copy(map.game.head));
    if ((!centre || Math.hypot(_h.x - centre[0], _h.z - centre[1]) > REFRESH) && t - lastFill > 1) {
      lastFill = t;
      fill(_h.x, _h.z);
      window.__fills = (window.__fills ?? 0) + 1;
    } else if (centre) map.uniforms.uKitR.value = (map.size / map.span) * RADIUS;
  };
  return [{ ...a, model: { group: root, top: 10 }, era: eras, trueSize: true, baseAlt: 0, far: true, animate }];
}
