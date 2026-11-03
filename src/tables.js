import * as THREE from 'three';

const REACH = 1.6; // metres: the furthest table the map will be put on by itself
const outlineMat = new THREE.LineBasicMaterial({ color: 0xffe9b8, transparent: true, opacity: 0.35 });

// Finds a table among the Quest's detected planes. Falls back to a virtual one in front of the player,
// and on a flat screen builds a real-looking table to sit the map on.
export class Tables {
  constructor(game) {
    this.game = game;
    this.planes = new Map();
    this.virtualOutline = null;
  }

  updateXR(frame, refSpace) {
    const planes = frame.detectedPlanes;
    if (planes?.size !== this.count) {
      this.count = planes?.size;
      console.info(`[tables] ${planes ? planes.size : 'no'} detected planes`);
    }
    if (!planes) return;
    const seen = new Set();
    planes.forEach((plane) => {
      seen.add(plane);
      if (plane.orientation !== 'horizontal') return;
      const pose = frame.getPose(plane.planeSpace, refSpace);
      if (!pose) return;
      let entry = this.planes.get(plane);
      if (!entry || entry.changed !== plane.lastChangedTime) {
        const xs = Array.from(plane.polygon, (p) => p.x);
        const zs = Array.from(plane.polygon, (p) => p.z);
        entry = {
          changed: plane.lastChangedTime, label: plane.semanticLabel || '',
          minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs),
          matrix: new THREE.Matrix4(),
        };
        this.planes.set(plane, entry);
      }
      entry.matrix.fromArray(pose.transform.matrix);
    });
    for (const plane of this.planes.keys()) if (!seen.has(plane)) this.planes.delete(plane);
  }

  // The nearest table-height surface. Anything labelled "table" wins; otherwise any horizontal plane
  // between knee and chest height that's big enough.
  pick(head) {
    let best = null;
    let bestScore = Infinity;
    for (const e of this.planes.values()) {
      const m = e.matrix;
      const center = new THREE.Vector3((e.minX + e.maxX) / 2, 0, (e.minZ + e.maxZ) / 2).applyMatrix4(m);
      const width = e.maxX - e.minX;
      const depth = e.maxZ - e.minZ;
      const isTable = e.label === 'table' || e.label === 'desk';
      if (!isTable && (center.y < 0.45 || center.y > 1.2 || width * depth < 0.15)) continue;
      if (Math.min(width, depth) < 0.4) continue;
      // Only one within reach: a plane across the room (or a stale one from another room setup, beyond the
      // boundary) would put the map where you can't get at it.
      const away = Math.hypot(center.x - head.x, center.z - head.z);
      if (away > REACH) continue;
      const score = away - (isTable ? 1 : 0);
      if (score < bestScore) {
        bestScore = score;
        const xAxis = new THREE.Vector3(1, 0, 0).transformDirection(m);
        const zAxis = new THREE.Vector3(0, 0, 1).transformDirection(m);
        best = { center, xAxis, zAxis, width, depth, virtual: false, label: e.label };
      }
    }
    return best;
  }

  virtual(head, forward) {
    const center = head.clone().addScaledVector(forward, 0.75);
    center.y = THREE.MathUtils.clamp(head.y - 0.75, 0.6, 0.95);
    const zAxis = forward.clone().negate();
    const xAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), zAxis);
    const spec = { center, xAxis, zAxis, width: 1.0, depth: 1.0, virtual: true };
    this.showVirtual(spec);
    return spec;
  }

  showVirtual(spec) {
    this.virtualOutline?.removeFromParent();
    if (!spec) return;
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => spec.center.clone()
      .addScaledVector(spec.xAxis, (a * spec.width) / 2).addScaledVector(spec.zAxis, (b * spec.depth) / 2));
    this.virtualOutline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), outlineMat);
    this.game.scene.add(this.virtualOutline);
  }

  buildScreenTable() {
    const scene = new THREE.Group();
    this.game.scene.add(scene);
    this.screenProps = scene;
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.7 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 1.1), wood);
    top.position.y = 0.73;
    scene.add(top);
    for (const [x, z] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.71, 0.05), wood);
      leg.position.set(x, 0.355, z);
      scene.add(leg);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    return {
      center: new THREE.Vector3(0, 0.75, 0), xAxis: new THREE.Vector3(1, 0, 0), zAxis: new THREE.Vector3(0, 0, 1),
      width: 1.3, depth: 1.1, virtual: false,
    };
  }
}
