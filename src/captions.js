import * as THREE from 'three';

// Caption pins: short pieces of history placed on the map. Each has a theme and era so they can later be strung
// into stories (Victorian engineering, the slave trade, the Second World War...). Drafts are marked until checked.
// assets/<slug>-captions.json: [{ title, text, lat, lon, era, theme, draft, years }]
// years: [from, to], the span a caption belongs to; at a place with periods it shows only in periods inside it.

function pinTexture(title) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  let size = 40;
  do ctx.font = `bold ${size}px ui-monospace, Menlo, monospace`; while (ctx.measureText(`ⓘ ${title}`).width > 470 && (size -= 2) > 16);
  const w = Math.min(500, ctx.measureText(`ⓘ ${title}`).width + 30);
  ctx.fillStyle = 'rgba(40,24,6,0.85)';
  ctx.fillRect(256 - w / 2, 10, w, 76);
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = 4;
  ctx.strokeRect(256 - w / 2, 10, w, 76);
  ctx.fillStyle = '#ffd08a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`ⓘ ${title}`, 256, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function wrap(ctx, text, width) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > width && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

export class Captions {
  constructor(map) {
    this.map = map;
    this.group = new THREE.Group();
    map.holder.add(this.group);
    this.pins = [];
    this.show = true;
    this.open = null;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 640;
    this.panelCanvas = canvas;
    this.panelTex = new THREE.CanvasTexture(canvas);
    this.panelTex.colorSpace = THREE.SRGBColorSpace;
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.35),
      new THREE.MeshBasicMaterial({ map: this.panelTex, transparent: true, depthTest: false }));
    this.panel.renderOrder = 50;
    this.panel.visible = false;
    map.game.scene.add(this.panel);
  }

  rebuild(source) {
    // (Free the old pins' textures, materials and stems: they used to pile up on the GPU with every reload.)
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    this.group.clear();
    this.pins = [];
    this.close();
    for (const c of source.captions ?? []) {
      const { i, j } = source.toWindow(c.lat, c.lon);
      if (i < 0 || j < 0 || i >= 512 || j >= 512) continue;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture(c.title), transparent: true, depthTest: false }));
      sprite.center.set(0.5, 0);
      sprite.renderOrder = 40;
      sprite.userData.caption = c;
      this.group.add(sprite);
      this.pins.push({ sprite, i, j, c });
    }
  }

  meshes() {
    return this.pins.filter((p) => p.sprite.visible).map((p) => p.sprite);
  }

  toggle() {
    this.show = !this.show;
    if (!this.show) this.close();
  }

  openCaption(c) {
    if (this.open === c) return this.close();
    this.open = c;
    const ctx = this.panelCanvas.getContext('2d');
    const { width: W, height: H } = this.panelCanvas;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(14,12,10,0.92)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.fillStyle = '#ffd08a';
    ctx.font = 'bold 50px Georgia, serif';
    ctx.fillText(c.title, 40, 76);
    ctx.font = 'italic 28px Georgia, serif';
    ctx.fillStyle = '#c8a878';
    ctx.fillText([c.era, c.theme].filter(Boolean).join(' · '), 40, 120);
    ctx.font = '32px Georgia, serif';
    ctx.fillStyle = '#f2e8d8';
    wrap(ctx, c.text, W - 80).slice(0, 9).forEach((line, k) => ctx.fillText(line, 40, 178 + k * 40));
    // Footer: source, any doubt worth checking, and a draft flag for text that hasn't been checked yet.
    ctx.font = '22px ui-monospace, Menlo, monospace';
    let y = H - 30;
    if (c.check) {
      ctx.fillStyle = '#ff9a6a';
      const lines = wrap(ctx, `Check: ${c.check}`, W - 80).slice(0, 2);
      y -= (lines.length - 1) * 26;
      lines.forEach((line, k) => ctx.fillText(line, 40, y + k * 26));
      y -= 30;
    }
    if (c.source || c.draft) {
      ctx.fillStyle = c.draft ? '#ff9a6a' : '#9f9078';
      ctx.fillText(c.draft ? 'DRAFT · facts to check before sharing' : `Source: ${c.source}`, 40, y);
    }
    this.panelTex.needsUpdate = true;
    this.panel.visible = true;
  }

  close() {
    this.open = null;
    this.panel.visible = false;
  }

  update(h, v, scale, visible) {
    const map = this.map;
    const life = scale > 1.5;
    const k = map.viewScale;
    for (const p of this.pins) {
      const x = (p.i / 511 - 0.5) * map.size;
      const z = (p.j / 511 - 0.5) * map.size;
      const y = map.displayY(p.i, p.j, v, h);
      p.sprite.position.set(x, y + (life ? 25 / scale : 0.03 / k), z);
      const year = map.eras.find((e) => e.id === map.era)?.year;
      const inPeriod = !p.c.years || year == null || (year >= p.c.years[0] && year <= p.c.years[1]);
      p.sprite.visible = visible && this.show && inPeriod && map.onMap(p.sprite.position);
      const w = (life ? 22 / scale : 0.12) / k;
      p.sprite.scale.set(w, w * 0.19, 1);
    }
    if (!this.panel.visible) return;
    // On the table the panel stands over the sign; at life size it floats in front of you.
    const cam = map.game.camera;
    if (life) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize();
      this.panel.position.copy(map.game.head).addScaledVector(fwd, 1.1).add(new THREE.Vector3(0, -0.1, 0));
      this.panel.lookAt(map.game.head);
      this.panel.scale.setScalar(1.2);
    } else {
      map.sign.mesh.getWorldPosition(this.panel.position);
      this.panel.position.y += 0.16;
      this.panel.quaternion.copy(map.group.quaternion);
      this.panel.scale.setScalar(1);
    }
  }
}
