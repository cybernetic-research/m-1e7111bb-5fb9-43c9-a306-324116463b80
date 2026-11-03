import * as THREE from 'three';
import { PERIODS, CATALOGUE, AREAS } from './catalogue.js';
import { VIEWS } from './views.js';

// The time machine menu. Three tabs:
//   BY TIME   periods down the left; that period's events and places on the right
//   BY PLACE  places grouped by area down the left; everything at the chosen place on the right
//   HERE      everything at the place you're at now (its eras, scenes, viewpoints and scans)
// Lists page with ▲ ▼. Point and pull the trigger (or click) on anything. Hit-testing uses the rectangles
// recorded while drawing, so layout and hit areas can't drift apart.

const W = 1500;
const H = 980;
const TOP = 150; // below the title bar and tabs
const LEFT_W = 400;
const ROW = 70;
const ROWS = 10;

const ICON = { scene: '▶', view: '◉', era: '◷', visit: '→', splat: '✦' };

export class Menu {
  constructor(game) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9 * (H / W)),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false }));
    this.mesh.renderOrder = 60;
    this.mesh.visible = false;
    game.scene.add(this.mesh);
    this.tab = 'time';
    this.period = 'roman';
    this.place = null;
    this.leftPage = 0;
    this.rightPage = 0;
    this.regions = [];
    this.hover = null;
  }

  get open() {
    return this.mesh.visible;
  }

  toggle() {
    this.mesh.visible = !this.mesh.visible;
    if (this.mesh.visible) {
      this.tab = this.game.map.source.slug ? this.tab : 'time';
      this.placeInFront();
      this.draw();
    }
  }

  placeInFront() {
    const { camera, head } = this.game;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    this.mesh.position.copy(head).addScaledVector(fwd, 1.0);
    this.mesh.lookAt(head);
  }

  sources() {
    return this.game.map.sources;
  }

  // Everything you can do at a place: its eras, its scenes, its viewpoints, its scans (and catalogue extras).
  placeEntries(slug) {
    const map = this.game.map;
    const source = this.sources().find((s) => s.slug === slug);
    if (!source) return [];
    const out = [];
    const eras = source.eras ?? (source.west ? [{ id: 'now', label: 'TODAY' }, { id: 'then', label: 'c.1900 (OS map)' }] : [{ id: 'now', label: 'VISIT' }]);
    for (const e of eras) out.push({ kind: e.id === 'now' && !source.west ? 'visit' : 'era', label: titleCase(e.label ?? (e.id === 'now' ? 'Today' : e.id)), place: slug, era: e.id });
    for (const def of map.scenario.registry[slug] ?? []) out.push({ kind: 'scene', label: def.Scene.title, place: slug, scene: def.Scene.name });
    (VIEWS[slug] ?? []).forEach((v, k) => out.push({ kind: 'view', label: `Stand at: ${v.name}`, place: slug, view: k }));
    (source.splats ?? []).forEach((s) => out.push({ kind: 'splat', label: `3D scan: ${s.name}`, place: slug, splat: s.name, view: s.view }));
    return out;
  }

  periodEntries() {
    const have = new Set(this.sources().map((s) => s.slug));
    return CATALOGUE.filter((e) => e.period === this.period && have.has(e.place))
      .map((e) => ({ ...e, kind: e.scene ? 'scene' : e.view != null ? 'view' : 'era' }));
  }

  // The left column for each tab.
  leftItems() {
    if (this.tab === 'time') return PERIODS.map((p) => ({ id: p.id, label: p.label, sub: p.years }));
    if (this.tab === 'place') {
      const items = [];
      const slugs = new Set(this.sources().map((s) => s.slug));
      for (const area of AREAS) {
        const listed = new Set(AREAS.flatMap((a) => (a.places === '*' ? [] : a.places)));
        const places = area.places === '*' ? this.sources().map((s) => s.slug).filter((s) => !listed.has(s)) : area.places.filter((p) => slugs.has(p));
        if (!places.length) continue;
        items.push({ header: area.label });
        for (const p of places) items.push({ id: p, label: this.sources().find((s) => s.slug === p).name });
      }
      return items;
    }
    return [];
  }

  rightItems() {
    if (this.tab === 'time') return this.periodEntries();
    if (this.tab === 'place') return this.place ? this.placeEntries(this.place) : [];
    return this.placeEntries(this.game.map.source.slug);
  }

  draw() {
    const ctx = this.canvas.getContext('2d');
    const regions = [];
    const box = (x, y, w, h, action, id) => regions.push({ x, y, w, h, action, id });
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,12,16,0.95)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#ffe9b8';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);

    // Where you are.
    const map = this.game.map;
    const era = map.eras.find((e) => e.id === map.era);
    ctx.fillStyle = '#9fb4c4';
    ctx.font = '24px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`YOU ARE AT: ${map.source.name}${era && map.era !== 'now' ? ` · ${titleCase(era.label ?? era.id)}` : ''}`, 36, 44);
    // Close.
    ctx.textAlign = 'right';
    ctx.fillStyle = this.hover === 'close' ? '#ffe9b8' : '#9fb4c4';
    ctx.font = 'bold 30px ui-monospace, Menlo, monospace';
    ctx.fillText('✕ CLOSE', W - 36, 46);
    box(W - 200, 10, 190, 50, () => this.toggle(), 'close');

    // Tabs.
    const tabs = [['time', 'BY TIME'], ['place', 'BY PLACE'], ['here', 'HERE']];
    tabs.forEach(([id, label], k) => {
      const x = 30 + k * 250;
      const on = this.tab === id;
      ctx.fillStyle = on ? '#ffe9b8' : this.hover === `tab-${id}` ? 'rgba(255,233,184,0.25)' : 'rgba(255,233,184,0.08)';
      ctx.fillRect(x, 70, 236, 64);
      ctx.fillStyle = on ? '#0c1016' : '#ffe9b8';
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px ui-monospace, Menlo, monospace';
      ctx.fillText(label, x + 118, 113);
      box(x, 70, 236, 64, () => {
        this.tab = id;
        this.rightPage = 0;
        this.leftPage = 0;
        this.draw();
      }, `tab-${id}`);
    });

    // Left column.
    const left = this.leftItems();
    const rightX = left.length ? LEFT_W + 50 : 30;
    if (left.length) {
      const per = ROWS - 1; // leave room for the pager
      const pages = Math.max(1, Math.ceil(left.length / per));
      this.leftPage = Math.min(this.leftPage, pages - 1);
      left.slice(this.leftPage * per, this.leftPage * per + per).forEach((item, n) => {
        const y = TOP + 10 + n * ROW;
        if (item.header) {
          ctx.fillStyle = '#ffb347';
          ctx.textAlign = 'left';
          ctx.font = 'bold 22px ui-monospace, Menlo, monospace';
          ctx.fillText(item.header.toUpperCase(), 40, y + 44);
          return;
        }
        const on = (this.tab === 'time' ? this.period : this.place) === item.id;
        const id = `left-${item.id}`;
        ctx.fillStyle = on ? '#ffe9b8' : this.hover === id ? 'rgba(255,233,184,0.25)' : 'rgba(255,233,184,0.06)';
        ctx.fillRect(30, y, LEFT_W, ROW - 8);
        ctx.fillStyle = on ? '#0c1016' : '#ffe9b8';
        ctx.textAlign = 'left';
        let size = 26;
        do ctx.font = `bold ${size}px ui-monospace, Menlo, monospace`; while (ctx.measureText(item.label).width > LEFT_W - (item.sub ? 120 : 30) && (size -= 2) > 14);
        ctx.fillText(item.label, 48, y + 40);
        if (item.sub) {
          ctx.textAlign = 'right';
          ctx.font = '18px ui-monospace, Menlo, monospace';
          ctx.fillStyle = on ? '#3a3020' : '#9fb4c4';
          ctx.fillText(item.sub, 30 + LEFT_W - 14, y + 40);
        }
        box(30, y, LEFT_W, ROW - 8, () => {
          if (this.tab === 'time') this.period = item.id;
          else this.place = item.id;
          this.rightPage = 0;
          this.draw();
        }, id);
      });
      if (pages > 1) this.pager(ctx, box, 30, LEFT_W, this.leftPage, pages, (p) => { this.leftPage = p; });
    }

    // Right column: the things you can do.
    const right = this.rightItems();
    const rw = W - rightX - 30;
    const perRight = right.length > ROWS ? ROWS - 1 : ROWS;
    const pages = Math.max(1, Math.ceil(right.length / perRight));
    this.rightPage = Math.min(this.rightPage, pages - 1);
    if (!right.length) {
      ctx.fillStyle = '#9fb4c4';
      ctx.textAlign = 'left';
      ctx.font = '28px ui-monospace, Menlo, monospace';
      ctx.fillText(this.tab === 'place' ? '← Choose a place.' : 'Nothing here yet.', rightX + 10, TOP + 60);
    }
    const names = Object.fromEntries(this.sources().map((s) => [s.slug, s.name]));
    right.slice(this.rightPage * perRight, this.rightPage * perRight + perRight).forEach((e, n) => {
      const y = TOP + 10 + n * ROW;
      const id = `right-${this.rightPage * perRight + n}`;
      const current = e.place === map.source.slug && ((e.era && e.era === map.era && !e.scene && e.view == null));
      ctx.fillStyle = this.hover === id ? 'rgba(255,233,184,0.25)' : current ? 'rgba(111,255,208,0.12)' : 'rgba(255,233,184,0.05)';
      ctx.fillRect(rightX, y, rw, ROW - 8);
      ctx.fillStyle = e.kind === 'scene' ? '#ffb347' : e.kind === 'view' || e.kind === 'splat' ? '#6fffd0' : '#ffe9b8';
      ctx.textAlign = 'left';
      ctx.font = 'bold 30px ui-monospace, Menlo, monospace';
      ctx.fillText(ICON[e.kind] ?? '→', rightX + 16, y + 42);
      ctx.fillStyle = '#ffe9b8';
      let size = 28;
      const label = e.label;
      do ctx.font = `bold ${size}px Georgia, serif`; while (ctx.measureText(label).width > rw - (this.tab === 'time' ? 360 : 90) && (size -= 2) > 16);
      ctx.fillText(label, rightX + 60, y + 42);
      if (this.tab === 'time') {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#9fb4c4';
        ctx.font = '20px ui-monospace, Menlo, monospace';
        ctx.fillText(names[e.place] ?? e.place, rightX + rw - 16, y + 42);
      }
      box(rightX, y, rw, ROW - 8, () => {
        this.mesh.visible = false;
        this.game.goTo(e);
      }, id);
    });
    if (pages > 1) this.pager(ctx, box, rightX, rw, this.rightPage, pages, (p) => { this.rightPage = p; });

    // Key.
    ctx.textAlign = 'left';
    ctx.font = '20px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#7f8f9c';
    ctx.fillText('▶ play a scene   ◉ stand there (life size)   ◷ show that era   ✦ 3D scan   → visit', 36, H - 22);
    this.regions = regions;
    this.tex.needsUpdate = true;
  }

  pager(ctx, box, x, w, page, pages, set) {
    const y = TOP + 10 + (ROWS - 1) * ROW + 6;
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#9fb4c4';
    ctx.fillText(`${page + 1} / ${pages}`, x + w / 2, y + 34);
    for (const [dx, label, d] of [[0, '▲ PREV', -1], [w - 160, 'NEXT ▼', 1]]) {
      const id = `pg-${x}-${d}`;
      ctx.fillStyle = this.hover === id ? 'rgba(255,233,184,0.3)' : 'rgba(255,233,184,0.1)';
      ctx.fillRect(x + dx, y, 160, 50);
      ctx.fillStyle = '#ffe9b8';
      ctx.fillText(label, x + dx + 80, y + 34);
      box(x + dx, y, 160, 50, () => {
        set((page + d + pages) % pages);
        this.draw();
      }, id);
    }
  }

  regionAt(uv) {
    const x = uv.x * W;
    const y = (1 - uv.y) * H;
    return this.regions.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) ?? null;
  }

  hit(raycaster) {
    if (!this.open) return null;
    return raycaster.intersectObject(this.mesh, false)[0] ?? null;
  }

  setHover(region) {
    const id = region?.id ?? null;
    if (id === this.hover) return;
    this.hover = id;
    this.draw();
  }

  choose(region) {
    region?.action();
  }
}

// Only shouting-caps labels (like 'BATH TODAY') are softened; mixed-case ones are left as written.
function titleCase(s) {
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.replace(/[^A-Z]/g, '').length < letters.length * 0.8) return s;
  return s.toLowerCase().replace(/(^|[\s·(])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bc\.(\d)/g, 'c.$1');
}
