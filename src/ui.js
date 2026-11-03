import * as THREE from 'three';
import { STRUCTURES } from './structures.js';
import { SCENARIOS } from './registry.js';
import { bearing } from './views.js';
import { adjustScan } from './splats.js';

// Two rows of buttons along the near edge of the map. Zoom, pan and rotate are gestures on the map itself:
// one hand drags it, two hands pinch to zoom and twist to rotate.
const TABLE_ROWS = [
  [['prev', '◀ PLACE'], ['next', 'PLACE ▶'], ['relief', 'FLAT / 3D'], ['rings', 'RINGS'], ['resetView', '⟲ RESET']],
  [['menu', '☰ MENU'], ['base', 'MAP ⟳'], ['water', 'WATER'], ['era', 'NOW / THEN'], ['life', 'LIFE SIZE']],
];
// At life size the table is gone, so a smaller set floats at waist height in front of you.
const BELT = [['menu', '☰ MENU'], ['exitLife', '◀ TABLE'], ['nextView', 'NEXT VIEW ▶'], ['adjust', 'ADJUST SCAN'], ['era', 'NOW / THEN'], ['base', 'MAP ⟳'],
  ['info', 'ⓘ INFO'], ['scenario', '▶ SCENE'], ['tide', 'TIDE'], ['time', '☀ TIME OF DAY']];

function chipTexture(label, hot) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 112;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hot ? 'rgba(255,233,184,0.95)' : 'rgba(12,16,22,0.82)';
  ctx.fillRect(0, 0, 256, 112);
  ctx.strokeStyle = '#ffe9b8';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 106);
  ctx.fillStyle = hot ? '#0c1016' : '#ffe9b8';
  ctx.font = `bold ${label.length > 9 ? 32 : 38}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 58);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeChip(action, label, w) {
  const mats = [false, true].map((hot) => new THREE.MeshBasicMaterial({ map: chipTexture(label, hot), transparent: true, depthTest: false }));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.44), mats[0]);
  mesh.renderOrder = 20;
  mesh.userData = { action };
  return { mesh, action, mats };
}

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _plane = new THREE.Plane();
const TURN_RATE = THREE.MathUtils.degToRad(110); // per second, stick fully over
const UP = new THREE.Vector3(0, 1, 0);

// The view is holder position P, rotation θ about vertical, uniform scale k (all in the map group's frame).
function viewOf(map) {
  const h = map.holder;
  return { x: h.position.x, z: h.position.z, rot: h.rotation.y, k: h.scale.x };
}
// The point of the model (data frame) that sits under group-frame point q in view v.
function contentAt(v, q) {
  const p = new THREE.Vector3(q.x - v.x, 0, q.z - v.z).applyAxisAngle(UP, -v.rot).divideScalar(v.k);
  return p;
}
// Place the view so content point c sits under group-frame point q, with rotation rot and scale k.
function viewPutting(c, q, rot, k) {
  const p = c.clone().multiplyScalar(k).applyAxisAngle(UP, rot);
  return { x: q.x - p.x, z: q.z - p.z, rot, k };
}

// Buttons, pointing rays, dragging the terrain, thumbsticks and keys, for both table and life size.
export class UI {
  constructor(game) {
    this.game = game;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.camera = game.camera; // needed to hit sprites (caption pins)
    this.chips = [];
    this.pointers = [];
    this.picking = false;
    this.belt = new THREE.Group();
    this.belt.visible = false;
    game.scene.add(this.belt);
    this.beltChips = BELT.map(([action, label], k) => {
      const chip = makeChip(action, label, 0.1);
      chip.mesh.position.set((k - (BELT.length - 1) / 2) * 0.108, 0, 0);
      this.belt.add(chip.mesh);
      return chip;
    });
    // Above the belt, a badge saying where and when you are (e.g. BRISTOL · c.1900 · VICTORIAN CITY).
    const badge = document.createElement('canvas');
    badge.width = 1024;
    badge.height = 96;
    this.badge = { canvas: badge, tex: new THREE.CanvasTexture(badge), text: '' };
    this.badge.tex.colorSpace = THREE.SRGBColorSpace;
    const badgeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.058), new THREE.MeshBasicMaterial({ map: this.badge.tex, transparent: true, depthTest: false }));
    badgeMesh.renderOrder = 20;
    badgeMesh.position.set(0, 0.058, 0);
    this.belt.add(badgeMesh);
    // The corner map, above the buttons, immediately to the left of the badge (so next to the place's name).
    if (game.minimap) {
      const mini = game.minimap.mesh(0.2);
      mini.position.set(-0.31 - 0.1 - 0.006, 0.058 - 0.029 + 0.1, 0);
      this.belt.add(mini);
      this.beltMap = mini;
    }
    this.beltYaw = null;
    this.keys = new Set();
    this.grabs = []; // pointers currently holding the map
    this.gesture = null;
  }

  layout(map, size) {
    for (const c of this.chips) c.mesh.removeFromParent();
    const gap = 0.008;
    const perRow = TABLE_ROWS[0].length;
    const w = Math.min(0.11, (size + 0.1) / perRow - gap);
    // A third row with whatever this place offers: captions, a scenario, hidden structures.
    const slug = map.source.slug;
    const extra = [['info', 'ⓘ INFO']];
    if (SCENARIOS[slug]) extra.push(['scenario', '▶ SCENE']);
    if ((STRUCTURES[slug] ?? []).some((b) => b.xray)) extra.push(['xray', 'X-RAY']);
    if (map.source.tides) extra.push(['tide', 'TIDE']);
    this.chips = [...TABLE_ROWS, extra].flatMap((row, r) => row.map(([action, label], k) => {
      const chip = makeChip(action, label, w);
      const total = row.length * (w + gap) - gap;
      chip.mesh.position.set(-total / 2 + w / 2 + k * (w + gap), 0.012 + r * 0.004, size / 2 + 0.045 + r * (w * 0.44 + 0.012));
      chip.mesh.rotation.x = -Math.PI / 2 + 0.55; // tilted up toward the player
      map.group.add(chip.mesh);
      return chip;
    }));
  }

  get allChips() {
    return this.belt.visible ? this.beltChips : this.chips;
  }

  act(action) {
    const { map, life } = this.game;
    console.info(`[ui] ${action}`);
    if (action === 'life') {
      // First press: choose where to stand. Pressing again stands you on the named summit.
      if (this.picking) {
        this.picking = false;
        // From a diorama: go in at the menu entry's viewpoint.
        const view = map.dioramaView != null ? map.views.list[map.dioramaView] : null;
        map.dioramaView = null;
        if (view) {
          map.views.index = map.views.list.indexOf(view);
          life.enter(map.views.groupSpot(view), map.views.bearingOf(view));
        } else life.enter(null);
      } else {
        this.picking = true;
        map.status = 'POINT AT WHERE TO STAND (OR PRESS LIFE SIZE AGAIN FOR THE SUMMIT)';
        map.drawSign();
      }
      this.game.sfx?.click();
      return;
    }
    ({
      prev: () => map.next(-1), next: () => map.next(1), relief: () => map.toggleRelief(), rings: () => map.toggleRings(),
      base: () => map.cycleBase(), water: () => map.toggleWater(), era: () => map.toggleEra(), exitLife: () => life.exit(),
      info: () => map.captions.toggle(), scenario: () => map.toggleScenario(), xray: () => map.toggleXray(),
      tide: () => map.source.tides && map.cycleTide(), nextView: () => life.nextView(), menu: () => this.game.menu.toggle(),
      adjust: () => this.toggleAdjust(),
      time: () => {
        this.game.daylight.next();
        map.drawSign();
      },
      resetView: () => {
        map.source.reset();
        map.resetView();
        map.load();
      },
    })[action]?.();
    this.game.sfx?.click();
  }

  showBelt(on) {
    this.belt.visible = on;
    this.beltYaw = null;
    this.picking = false;
  }

  // --- pointers: XR controllers / hands, or the mouse ---

  setupXR(renderer) {
    for (let i = 0; i < 2; i++) {
      const ray = renderer.xr.getController(i);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0xffe9b8, transparent: true, opacity: 0.6 }));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9b8 }));
      this.game.scene.add(ray, dot);
      ray.add(line);
      const p = { ray, line, dot, source: null, grab: null, buttons: [] };
      ray.addEventListener('connected', (e) => { p.source = e.data; });
      ray.addEventListener('disconnected', () => {
        this.release(p);
        p.source = null;
      });
      ray.addEventListener('selectstart', () => this.press(p));
      ray.addEventListener('selectend', () => this.release(p));
      this.pointers.push(p);
    }
  }

  // The place and period on the badge above the belt.
  // gothic: the place's name to letter in blackletter at the start (before 1700), the rest left as it is.
  setBadge(text, gothic = null) {
    const b = this.badge;
    if (!b || (b.text === text && b.gothic === gothic)) return;
    b.text = text;
    b.gothic = gothic;
    const dom = document.getElementById('period');
    if (dom) {
      dom.textContent = gothic ? text.slice(text.indexOf(' · ')) : text;
      if (gothic) {
        const name = document.createElement('span');
        name.className = 'gothic';
        name.textContent = gothic;
        dom.prepend(name);
      }
      dom.style.display = 'block';
    }
    const ctx = b.canvas.getContext('2d');
    ctx.clearRect(0, 0, 1024, 96);
    ctx.fillStyle = 'rgba(12,16,22,0.85)';
    ctx.fillRect(0, 0, 1024, 96);
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, 1018, 90);
    ctx.fillStyle = '#ffb347';
    ctx.textBaseline = 'middle';
    // Left-aligned, so the place's name sits next to the map beside the badge.
    ctx.textAlign = 'left';
    const rest = gothic ? text.slice(text.indexOf(' · ')) : text;
    const head = gothic ?? '';
    let size = 48;
    let hw = 0;
    for (;;) {
      ctx.font = `${Math.round(size * 1.35)}px Medieval, serif`;
      hw = head ? ctx.measureText(head + ' ').width : 0;
      ctx.font = `bold ${size}px ui-monospace, Menlo, monospace`;
      if (hw + ctx.measureText(rest).width <= 990 || (size -= 2) <= 20) break;
    }
    if (head) {
      ctx.font = `${Math.round(size * 1.35)}px Medieval, serif`;
      ctx.fillText(head, 18, 54);
      ctx.font = `bold ${size}px ui-monospace, Menlo, monospace`;
    }
    ctx.fillText(rest, 18 + hw, 50);
    b.tex.needsUpdate = true;
  }

  setupScreen(dom, camera, orbit) {
    const p = { mouse: true, grab: null };
    this.pointers.push(p);
    this.screen = { camera, orbit, yaw: 0, pitch: 0, look: null };
    const ndc = new THREE.Vector2();
    const aim = (e) => {
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(ndc, camera);
      p.origin = this.raycaster.ray.origin.clone();
      p.dir = this.raycaster.ray.direction.clone();
    };
    // Capture phase, so a drag on the map can switch the orbit camera off before it sees the event.
    dom.addEventListener('pointerdown', (e) => {
      aim(e);
      if (this.press(p)) orbit.enabled = false;
      else if (this.game.life.active) this.screen.look = { x: e.clientX, y: e.clientY, moved: false };
    }, { capture: true });
    // Wheel over the map zooms it about the cursor; elsewhere it's ignored (the orbit camera doesn't zoom).
    orbit.enableZoom = false;
    dom.addEventListener('wheel', (e) => {
      aim(e);
      const m = this.game.life.active ? null : this.hitMap({ origin: p.origin, dir: p.dir });
      if (!m?.inside) return;
      e.preventDefault();
      this.nudgeView(m.local, Math.exp(-e.deltaY * 0.0015), 0);
    }, { passive: false });
    dom.addEventListener('pointermove', (e) => {
      aim(e);
      const look = this.screen.look;
      if (!look) return;
      this.screen.yaw -= (e.clientX - look.x) * 0.004;
      this.screen.pitch = THREE.MathUtils.clamp(this.screen.pitch - (e.clientY - look.y) * 0.004, -1.3, 1.3);
      look.moved ||= Math.abs(e.clientX - look.x) + Math.abs(e.clientY - look.y) > 3;
      look.x = e.clientX;
      look.y = e.clientY;
    });
    window.addEventListener('pointerup', () => {
      // A click (not a drag) on the ground at life size walks you there.
      const look = this.screen.look;
      if (look && !look.moved && p.origin) {
        if (this.game.huntAt?.(p.origin, p.dir)) {
          this.screen.look = null;
          this.release(p);
          return;
        }
        const hit = this.game.life.rayGround(p.origin, p.dir);
        if (hit) this.game.life.teleport(hit);
      }
      this.screen.look = null;
      this.release(p);
      orbit.enabled = !this.game.life.active;
    });
    const map = this.game.map;
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (this.game.life.active) {
        // While adjusting a scan, I/J/K/L, U/O and Y/H move it; only P (finish) and Escape keep their meaning.
        if (this.adjusting) {
          if (e.code === 'KeyP' || e.code === 'Escape') this.act('adjust');
          return;
        }
        if (e.code === 'Escape' || e.code === 'KeyL') this.act('exitLife');
        if (e.code === 'KeyT') this.act('era');
        if (e.code === 'KeyY') this.act('time');
        if (e.code === 'KeyM') this.act('base');
        if (e.code === 'KeyO') this.act('water');
        if (e.code === 'KeyG') this.act('rings');
        if (e.code === 'Tab') this.act('menu');
        if (e.code === 'KeyP') this.act('adjust');
        return;
      }
      const keys = {
        KeyR: () => this.act('relief'), BracketLeft: () => this.act('prev'), BracketRight: () => this.act('next'),
        KeyG: () => this.act('rings'), KeyM: () => this.act('base'), KeyO: () => this.act('water'), KeyT: () => this.act('era'),
        KeyL: () => this.act('life'), Digit0: () => this.act('resetView'), Tab: () => this.act('menu'),
      };
      keys[e.code]?.();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (['KeyQ', 'KeyE', 'Equal', 'Minus'].includes(e.code)) map.settle();
    });
  }

  // Flat screen at life size: stand at eye height, look by dragging, WASD to walk, Q/E to turn.
  enterScreenLife(on) {
    const s = this.screen;
    if (!s) return;
    const cam = s.camera;
    if (on) {
      s.saved = { position: cam.position.clone(), quaternion: cam.quaternion.clone() };
      s.orbit.enabled = false;
      // Face north, the way the map was facing on the table.
      const north = new THREE.Vector3(0, 0, -1).applyQuaternion(this.game.map.group.quaternion).setY(0).normalize();
      s.yaw = Math.atan2(-north.x, -north.z);
      // Level, at a standing adult's eye height (1.7 m), like a photograph taken in the street.
      s.pitch = 0;
      cam.position.set(cam.position.x, 1.7, cam.position.z);
    } else if (s.saved) {
      cam.position.copy(s.saved.position);
      cam.quaternion.copy(s.saved.quaternion);
      s.orbit.enabled = true;
      s.orbit.update();
    }
  }

  ray(p) {
    if (p.mouse) return p.origin ? { origin: p.origin, dir: p.dir } : null;
    if (!p.source) return null;
    p.ray.getWorldPosition(_o);
    p.ray.getWorldQuaternion(_q);
    return { origin: _o.clone(), dir: _d.set(0, 0, -1).applyQuaternion(_q).clone() };
  }

  hitChip(r) {
    const meshes = this.allChips.filter((c) => c.mesh.visible).map((c) => c.mesh);
    if (!meshes.length) return null;
    this.raycaster.set(r.origin, r.dir);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    return hit ? { chip: hit.object, distance: hit.distance, point: hit.point } : null;
  }

  hitPin(r) {
    const pins = [...this.game.map.views.meshes(), ...this.game.map.captions.meshes()];
    if (!pins.length) return null;
    this.raycaster.set(r.origin, r.dir);
    return this.raycaster.intersectObjects(pins, false)[0]?.object ?? null;
  }

  // Where the ray meets the table plane, in map coordinates (only if it's on the map).
  hitMap(r) {
    const map = this.game.map;
    if (!map.group.visible || this.game.life.active) return null;
    map.group.updateWorldMatrix(true, false);
    _plane.setFromNormalAndCoplanarPoint(_p.set(0, 1, 0), map.group.getWorldPosition(new THREE.Vector3()));
    this.raycaster.set(r.origin, r.dir);
    const world = this.raycaster.ray.intersectPlane(_plane, new THREE.Vector3());
    if (!world) return null;
    const local = map.group.worldToLocal(world.clone());
    return { world, local, inside: Math.hypot(local.x, local.z) < map.size / 2 };
  }

  press(p) {
    const r = this.ray(p);
    if (!r) return false;
    // The menu, when open, takes every press that lands on it.
    this.raycaster.set(r.origin, r.dir);
    const menuHit = this.game.menu.hit(this.raycaster);
    if (menuHit) {
      this.game.menu.choose(this.game.menu.regionAt(menuHit.uv));
      this.game.sfx?.click();
      return true;
    }
    const chip = this.hitChip(r);
    if (chip) {
      this.act(chip.chip.userData.action);
      return true;
    }
    const pin = this.hitPin(r);
    if (pin?.userData.view && !this.game.life.active) {
      // A viewpoint: stand there, life size, facing the way it's set up to face.
      const map = this.game.map;
      const view = pin.userData.view;
      map.views.index = map.views.list.indexOf(view);
      this.game.life.enter(map.views.groupSpot(view), bearing(view));
      this.game.sfx?.click();
      return true;
    }
    if (pin?.userData.caption) {
      this.game.map.captions.openCaption(pin.userData.caption);
      this.game.sfx?.click();
      return true;
    }
    const life = this.game.life;
    if (life.active) {
      if (p.mouse) return false; // the mouse looks around; a click without dragging teleports
      if (this.game.huntAt?.(r.origin, r.dir)) return true; // (an arrow at a beast, outskirts.js)
      const hit = life.rayGround(r.origin, r.dir);
      if (hit) life.teleport(hit);
      return !!hit;
    }
    const m = this.hitMap(r);
    if (m?.inside && this.picking) {
      this.picking = false;
      this.game.map.dioramaView = null;
      life.enter({ x: m.local.x, z: m.local.z });
      return true;
    }
    if (m?.inside) {
      p.grab = { start: m.local.clone(), now: m.local.clone() };
      this.grabs.push(p);
      this.startGesture();
      return true;
    }
    return false;
  }

  release(p) {
    if (!p.grab) return;
    p.grab = null;
    this.grabs = this.grabs.filter((g) => g !== p);
    if (this.grabs.length) this.startGesture();
    else {
      this.gesture = null;
      this.game.map.settle();
    }
  }

  // Each time a hand joins or leaves, the gesture restarts from the current view, so nothing jumps.
  startGesture() {
    for (const g of this.grabs) g.grab.start.copy(g.grab.now);
    this.gesture = viewOf(this.game.map);
  }

  applyGesture() {
    const map = this.game.map;
    const v0 = this.gesture;
    if (!v0 || !this.grabs.length) return;
    const [a, b] = this.grabs.map((g) => g.grab);
    let v;
    if (!b) {
      v = { ...v0, x: v0.x + a.now.x - a.start.x, z: v0.z + a.now.z - a.start.z };
    } else {
      // Two hands: the model point between them stays between them; spreading zooms, twisting rotates.
      const mid0 = a.start.clone().add(b.start).multiplyScalar(0.5);
      const mid = a.now.clone().add(b.now).multiplyScalar(0.5);
      const d0 = b.start.clone().sub(a.start);
      const d = b.now.clone().sub(a.now);
      const ratio = Math.max(0.05, d.length()) / Math.max(0.05, d0.length());
      const turn = -(Math.atan2(d.z, d.x) - Math.atan2(d0.z, d0.x));
      v = viewPutting(contentAt(v0, mid0), mid, v0.rot + turn, v0.k * ratio);
    }
    map.setView(v.x, v.z, v.rot, v.k);
  }

  // Zoom or turn the view about a point on the table (thumbsticks, mouse wheel, keys).
  nudgeView(q, factor, turn) {
    const map = this.game.map;
    const v = viewOf(map);
    const n = viewPutting(contentAt(v, q), q, v.rot + turn, v.k * factor);
    map.setView(n.x, n.z, n.rot, n.k);
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => map.settle(), 400);
  }

  update(dt) {
    const { map, life } = this.game;
    const hot = new Set();
    if (this.belt.visible) this.followBelt();
    // (On the flat screen the corner map is on the page, top left; the belt's copy would poke into the view.)
    if (this.beltMap) this.beltMap.visible = this.game.mode !== 'screen';
    life.move.set(0, 0);
    for (const p of this.pointers) {
      const r = this.ray(p);
      if (!r) {
        if (p.line) p.line.visible = p.dot.visible = false;
        continue;
      }
      this.raycaster.set(r.origin, r.dir);
      const menuHit = this.game.menu.hit(this.raycaster);
      if (menuHit) {
        this.game.menu.setHover(this.game.menu.regionAt(menuHit.uv));
        if (p.line) {
          p.line.visible = true;
          p.line.scale.z = menuHit.distance;
          p.dot.visible = true;
          p.dot.position.copy(menuHit.point);
          p.dot.scale.setScalar(1);
        }
        continue;
      }
      const chip = this.hitChip(r);
      const m = chip ? null : this.hitMap(r);
      const ground = !chip && life.state === 'on' && !p.mouse ? life.rayGround(r.origin, r.dir) : null;
      if (chip) hot.add(chip.chip);
      if (p.grab && m) p.grab.now.copy(m.local);
      if (p.line) {
        const target = chip ? chip.point : m?.inside ? m.world : ground;
        p.line.visible = true;
        p.line.scale.z = target ? target.distanceTo(r.origin) : 0.6;
        p.dot.visible = !!target;
        if (target) p.dot.position.copy(target);
        p.dot.scale.setScalar(ground && !chip ? Math.max(1, target.distanceTo(r.origin) * 0.4) : 1);
      }
      if (p.source?.gamepad) this.gamepad(p, dt);
    }
    this.applyGesture();
    if (this.screen && life.active) this.screenWalk(dt);
    if (this.screen && !life.active) this.screenKeys(dt);
    for (const c of this.allChips) c.mesh.material = c.mats[hot.has(c.mesh) ? 1 : 0];
  }

  screenKeys(dt) {
    const k = this.keys;
    const turn = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0);
    const zoom = (k.has('Equal') ? 1 : 0) - (k.has('Minus') ? 1 : 0);
    if (turn || zoom) this.nudgeView(new THREE.Vector3(), Math.exp(zoom * dt * 1.2), turn * dt * 1.2);
  }

  screenWalk(dt) {
    const s = this.screen;
    const k = this.keys;
    if (this.adjusting) {
      const ax = (k.has('KeyL') ? 1 : 0) - (k.has('KeyJ') ? 1 : 0);
      const ay = (k.has('KeyI') ? 1 : 0) - (k.has('KeyK') ? 1 : 0);
      const turn = (k.has('KeyO') ? 1 : 0) - (k.has('KeyU') ? 1 : 0);
      const up = (k.has('KeyY') ? 1 : 0) - (k.has('KeyH') ? 1 : 0);
      this.adjustFrom(ax, ay, turn, up, dt);
    }
    if (k.has('KeyQ')) s.yaw += dt * 1.5;
    if (k.has('KeyE')) s.yaw -= dt * 1.5;
    s.camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
    const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? 4 : 1;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    this.game.life.move.set(side * 3 * fast, fwd * 3 * fast);
  }

  // The belt menu drifts after you: it re-centres in front of you when you turn more than ~35°.
  followBelt() {
    const head = this.game.head;
    const cam = this.game.camera;
    const fwd = _d.set(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(_q)).setY(0).normalize();
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    if (this.beltYaw == null || Math.abs(Math.atan2(Math.sin(yaw - this.beltYaw), Math.cos(yaw - this.beltYaw))) > 0.6) {
      this.beltYaw = yaw;
    }
    const dir = _o.set(-Math.sin(this.beltYaw), 0, -Math.cos(this.beltYaw));
    this.belt.position.copy(head).addScaledVector(dir, 0.5).add(_p.set(0, -0.5, 0));
    this.belt.rotation.set(-0.7, this.beltYaw, 0, 'YXZ');
  }

  // ADJUST SCAN (life size): the 3D scan nearest you can be slid, turned and raised to line it up by eye.
  // Left stick slides it (relative to where you're facing), right stick turns it (left/right) and raises or
  // lowers it (up/down). Press ADJUST SCAN again to finish. Saved in this browser and printed to the console.
  toggleAdjust() {
    const map = this.game.map;
    if (this.adjusting) {
      console.info(`[scan] ${this.adjusting.name}: ${JSON.stringify(this.adjusting.scan)}`);
      this.adjusting = null;
      map.status = '';
      map.drawSign();
      return;
    }
    const scans = map.features.items.filter((it) => it.scan);
    if (!scans.length || !this.game.life.active) return;
    const head = this.game.head;
    const dist = (it) => {
      const p = new THREE.Vector3();
      it.model.group.getWorldPosition(p);
      return p.distanceTo(head);
    };
    this.adjusting = scans.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    this.showAdjust();
  }

  showAdjust() {
    const s = this.adjusting.scan;
    const map = this.game.map;
    map.status = `ADJUSTING ${this.adjusting.name.toUpperCase()} · ${Math.round(s.heading)}° · ${s.alt.toFixed(1)} m`;
    map.drawSign();
    this.game.flash?.(`Adjusting ${this.adjusting.name}`, `Left stick: slide it. Right stick left/right: turn it; up/down: raise or lower it. Press ADJUST SCAN again when it lines up.\n\nHeading ${Math.round(s.heading)}°, height ${s.alt.toFixed(1)} m OD.`);
  }

  adjustFrom(dx, dy, turn, up, dt) {
    if (!this.adjusting) return false;
    const cam = this.game.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    // World forward -> map east/north (the map group may be turned at life size).
    const q = this.game.map.group.getWorldQuaternion(new THREE.Quaternion()).invert();
    const f = fwd.applyQuaternion(q);
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const speed = 2 * dt;
    const east = (f.x * dy + r.x * dx) * speed;
    const north = -(f.z * dy + r.z * dx) * speed;
    if (!east && !north && !turn && !up) return true;
    adjustScan(this.game.map.source, this.adjusting, { east, north, turn: turn * 30 * dt, up: up * dt });
    this.adjustSign = (this.adjustSign ?? 0) - dt;
    if (this.adjustSign <= 0) {
      this.adjustSign = 0.25;
      this.showAdjust();
    }
    return true;
  }

  // Table: stick up/down zooms, left/right turns the map, A/X next place, B/Y flat ↔ 3D.
  // Life size: left stick walks, right stick turns smoothly, B/Y goes back to the table.
  gamepad(p, dt) {
    const g = p.source.gamepad;
    const { map, life } = this.game;
    const [, , sx = 0, sy = 0] = g.axes;
    const pressed = g.buttons.map((b) => b.pressed);
    const edge = (n) => pressed[n] && !p.buttons[n];
    if (life.active && this.adjusting) {
      if (p.source.handedness === 'left') this.adjustFrom(Math.abs(sx) > 0.15 ? sx : 0, Math.abs(sy) > 0.15 ? -sy : 0, 0, 0, dt);
      else this.adjustFrom(0, 0, Math.abs(sx) > 0.2 ? sx : 0, Math.abs(sy) > 0.2 ? -sy : 0, dt);
      p.buttons = pressed;
      return;
    }
    if (life.active) {
      if (p.source.handedness === 'left') {
        const fast = pressed[3] ? 4 : 1; // click the stick to hurry
        life.move.x += Math.abs(sx) > 0.15 ? sx * 3 * fast : 0;
        life.move.y += Math.abs(sy) > 0.15 ? -sy * 3 * fast : 0;
      } else {
        // Smooth turning, faster the further the stick is pushed. Turning right swings the landscape the other
        // way round you, so it's a positive (anticlockwise from above) turn of the world.
        const push = Math.abs(sx) > 0.15 ? (Math.abs(sx) - 0.15) / 0.85 : 0;
        if (push) life.turn(Math.sign(sx) * push * TURN_RATE * dt);
      }
      if (edge(5)) this.act('exitLife');
      if (edge(4)) this.act('era');
    } else {
      const zoom = Math.abs(sy) > 0.2 ? -sy : 0;
      const turn = Math.abs(sx) > 0.2 ? -sx : 0;
      if (zoom || turn) this.nudgeView(new THREE.Vector3(), Math.exp(zoom * dt * 1.3), turn * dt * 1.3);
      if (edge(4)) this.act('next');
      if (edge(5)) this.act('relief');
      if (edge(3)) this.game.bringMap?.(); // click a thumbstick: bring the map to you
    }
    p.buttons = pressed;
  }
}
