import * as THREE from 'three';
import { RES, lonLatToPx } from './terrain.js';
import { BASEMAPS, tile } from './overlay.js';
import { VIEWS } from './views.js';

// A small north-up map in the corner (bottom left; in the headset, left of the life-size controls) showing where
// you are: an arrow for your position and the way you're facing at life size, the loaded patch of terrain as a
// square, the other places as dots, and the period's main features outlined and named in black (a place's
// mapFeaturesFor(era), else its viewpoints). OpenStreetMap's standard map, around 750 m across at life size; zoomed out to fit the
// whole place at the table.

const SIZE = 384;
const base = BASEMAPS.find((b) => b.id === 'map');
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class Minimap {
  constructor(game) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE;
    this.canvas.id = 'minimap';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tiles = new Map(); // "z/x/y" -> ImageBitmap (or null while loading / if missing)
    this.wait = 0;
  }

  // A mesh showing the same map, for the life-size belt.
  mesh(size) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: this.tex, depthTest: false, transparent: true }));
    m.renderOrder = 20;
    return m;
  }

  // Lat/lon at window pixel (i, j): interpolated between the window's corners (exact enough for any place).
  latLon(source, i, j) {
    const c = source.corners();
    const u = i / RES;
    const v = j / RES;
    const lerp = (a, b, t) => a + (b - a) * t;
    return {
      lat: lerp(lerp(c.nw.lat, c.ne.lat, u), lerp(c.sw.lat, c.se.lat, u), v),
      lon: lerp(lerp(c.nw.lon, c.ne.lon, u), lerp(c.sw.lon, c.se.lon, u), v),
    };
  }

  // Where you are (lat/lon) and which way you face (degrees from north), or null before a place is loaded.
  where() {
    const { map, life } = this.game;
    const source = map.source;
    if (!source || !map.grids) return null;
    if (!life.active) return { ...this.latLon(source, RES / 2, RES / 2), bearing: null };
    // Head -> the map's data frame (x east, z south) -> window pixels.
    map.group.updateMatrixWorld();
    map.holder.updateMatrix();
    const local = map.group.worldToLocal(_v.copy(this.game.head));
    local.applyMatrix4(_m.copy(map.holder.matrix).invert());
    const i = (local.x / map.size + 0.5) * (RES - 1);
    const j = (local.z / map.size + 0.5) * (RES - 1);
    // The way you're looking, in the same frame.
    const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(this.game.camera.getWorldQuaternion(new THREE.Quaternion()));
    const q = map.group.getWorldQuaternion(new THREE.Quaternion()).multiply(map.holder.quaternion).invert();
    ahead.applyQuaternion(q);
    return { ...this.latLon(source, i, j), bearing: (Math.atan2(ahead.x, -ahead.z) * 180) / Math.PI };
  }

  image(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (!this.tiles.has(key)) {
      this.tiles.set(key, null);
      tile(base, z, x, y).then((img) => {
        this.tiles.set(key, img);
        this.wait = 0; // draw again now it's here
      });
    }
    return this.tiles.get(key);
  }

  update(dt) {
    if ((this.wait -= dt) > 0) return;
    this.wait = 0.25;
    const here = this.where();
    this.canvas.style.display = here ? 'block' : 'none';
    const caption = document.getElementById('period');
    if (caption) caption.style.left = here ? '284px' : '12px';
    if (!here) return;
    const { map, life } = this.game;
    const source = map.source;
    // Zoom: about 750 m across at life size; at the table, enough to show the whole loaded window.
    const lat = here.lat;
    const mPerPx0 = 156543.034 * Math.cos((lat * Math.PI) / 180);
    const across = life.active ? 750 : Math.max(800, source.span * 1.6);
    const z = Math.max(3, Math.min(17, Math.round(Math.log2((mPerPx0 * SIZE) / across))));
    const c = lonLatToPx(here.lon, here.lat, z);
    const g = this.ctx;
    g.fillStyle = '#e8e4da';
    g.fillRect(0, 0, SIZE, SIZE);
    const x0 = c.x - SIZE / 2;
    const y0 = c.y - SIZE / 2;
    for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + SIZE) / 256); ty++) {
      for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + SIZE) / 256); tx++) {
        const img = this.image(z, tx, ty);
        if (img) g.drawImage(img, tx * 256 - x0, ty * 256 - y0);
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, 0, SIZE, SIZE);
    const px = (la, lo) => {
      const p = lonLatToPx(lo, la, z);
      return [p.x - x0, p.y - y0];
    };
    // The loaded terrain.
    const k = source.corners();
    g.strokeStyle = 'rgba(200, 90, 20, 0.9)';
    g.lineWidth = 2;
    g.beginPath();
    [k.nw, k.ne, k.se, k.sw].forEach((p, n) => (n ? g.lineTo(...px(p.lat, p.lon)) : g.moveTo(...px(p.lat, p.lon))));
    g.closePath();
    g.stroke();
    // The other places, as dots.
    g.fillStyle = '#2b4f7a';
    for (const s of map.sources) {
      if (s === source) continue;
      const home = s.meta ?? s.home;
      if (!home?.lat) continue;
      const [x, y] = px(home.lat, home.lon);
      if (x < 0 || y < 0 || x > SIZE || y > SIZE) continue;
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
    }
    // The period's features: outlines, lines and points, in black with white-edged labels.
    const feats = source.mapFeaturesFor?.(map.era) ?? (VIEWS[source.slug] ?? []).map((v) => ({ name: v.name, at: v.at }));
    g.lineJoin = 'round';
    g.font = "bold 13px sans-serif";
    g.textAlign = 'left';
    const labels = [];
    for (const f of feats) {
      const line = f.poly ?? f.line;
      if (line?.length) {
        g.strokeStyle = '#000';
        g.lineWidth = f.poly ? 2 : 2.5;
        g.setLineDash(f.poly ? [] : f.name.includes('wall') || f.name.includes('Wall') ? [] : [5, 3]);
        g.beginPath();
        line.forEach(([la, lo], n) => (n ? g.lineTo(...px(la, lo)) : g.moveTo(...px(la, lo))));
        if (f.poly) g.closePath();
        g.stroke();
        g.setLineDash([]);
        const mid = line[Math.floor(line.length / 2)];
        labels.push([f.name, ...px(mid[0], mid[1])]);
      } else if (f.at) {
        const [x, y] = px(f.at[0], f.at[1]);
        g.fillStyle = '#000';
        g.beginPath();
        g.arc(x, y, 3, 0, Math.PI * 2);
        g.fill();
        labels.push([f.name, x + 5, y + 4]);
      }
    }
    for (const [text, x, y] of labels) {
      if (x < -40 || y < 0 || x > SIZE || y > SIZE) continue;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.strokeText(text, x, y);
      g.fillStyle = '#000';
      g.fillText(text, x, y);
    }
    // You: an arrow the way you're facing at life size, a dot at the table.
    g.save();
    g.translate(SIZE / 2, SIZE / 2);
    g.fillStyle = '#d0281e';
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    if (here.bearing == null) {
      g.arc(0, 0, 6, 0, Math.PI * 2);
    } else {
      g.rotate((here.bearing * Math.PI) / 180);
      g.moveTo(0, -12);
      g.lineTo(8, 9);
      g.lineTo(0, 4);
      g.lineTo(-8, 9);
      g.closePath();
    }
    g.fill();
    g.stroke();
    g.restore();
    // North, and the map's credit.
    g.fillStyle = 'rgba(12,16,22,0.8)';
    g.fillRect(SIZE - 22, 4, 18, 20);
    g.fillStyle = '#ffe9b8';
    g.font = 'bold 14px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.fillText('N', SIZE - 13, 19);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(0, SIZE - 14, SIZE, 14);
    g.fillStyle = '#333';
    g.font = '10px sans-serif';
    g.fillText('© OpenStreetMap contributors', SIZE / 2, SIZE - 3);
    this.tex.needsUpdate = true;
  }
}
