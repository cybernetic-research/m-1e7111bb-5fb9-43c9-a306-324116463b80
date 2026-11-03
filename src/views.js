import * as THREE from 'three';

// Fixed viewpoints: point at one on the table and pull the trigger to stand there, life size, facing `face`
// (degrees clockwise from north) or towards `look` (a lat/lon). At life size NEXT VIEW hops between them.

// The compass bearing a view faces.
export function bearing(view) {
  if (!view.look) return view.face ?? 0;
  const [la, lo] = view.at;
  const [lb, lob] = view.look;
  const de = (lob - lo) * Math.cos((la * Math.PI) / 180);
  const dn = lb - la;
  return (Math.atan2(de, dn) * 180) / Math.PI;
}
export const VIEWS = {
  'troopers-hill': [
    { name: 'The chimney', at: [51.45625, -2.53515], face: 200 },
    { name: 'Crew\'s Hole riverside', at: [51.4538, -2.5372], face: 20 },
    { name: 'The summit', at: [51.45619, -2.5356], face: 250 },
  ],
  kingswood: [
    { name: 'The Warmley Giant', at: [51.45505, -2.47805], face: 30 },
    { name: 'Warmley clock tower', at: [51.4530, -2.4800], face: 90 },
    { name: 'Hanham Mount', at: [51.4512, -2.5089], face: 230 },
    { name: 'Siston Court', at: [51.4758, -2.4535], face: 60 },
  ],
  'st-pauls': [
    { name: 'City Road', at: [51.46423, -2.585416], face: 235 },
    { name: 'Grosvenor Road', at: [51.4638, -2.5835], face: 45 },
    { name: 'Portland Square', at: [51.4610, -2.5858], face: 90 },
  ],
  filton: [
    { name: 'Runway crowd line', at: [51.5205, -2.5900], face: 180 },
    { name: 'Concorde hangar', at: [51.5216, -2.5790], face: 0 },
  ],
  'blaise-castle': [
    { name: 'The folly', at: [51.50236, -2.63718], look: [51.502554, -2.637336] },
    { name: "Goram's Chair", at: [51.49985, -2.63690], face: 270 },
    { name: 'Blaise Hamlet', at: [51.50700, -2.63580], face: 0 },
    { name: 'Blaise Castle House', at: [51.50560, -2.63250], face: 0 },
  ],
  'bristol-centre': [
    { name: 'Castle Park', at: [51.45590, -2.58935], look: [51.45595, -2.58650], exact: true },
    { name: 'Wine Street', at: [51.455237, -2.59213], look: [51.455634, -2.590746], exact: true },
    { name: 'Welsh Back', at: [51.45240, -2.59238], face: 100 },
    { name: 'Across from SS Great Britain', at: [51.45010, -2.60820], look: [51.44915, -2.608397] },
    { name: 'The Matthew, Princes Wharf', at: [51.447977, -2.597897], look: [51.44803, -2.59805] },
    // The pre-war photograph's stand (c.1900 era).
    { name: 'Pre-war photo, Wine Street', at: [51.45540, -2.59172], look: [51.45540, -2.59143] },
    // St John on the Wall: up Broad Street to the gate, through the arch, inside the church, and the conduit.
    { name: "St John's Gate, Broad Street", at: [51.455753, -2.594801], look: [51.455871, -2.595130], exact: true },
    { name: "Under St John's Arch", at: [51.455850, -2.595095], look: [51.456094, -2.595472], exact: true },
    { name: "Inside St John's church", at: [51.455941, -2.595087], look: [51.456114, -2.594831], exact: true },
    { name: "St John's Conduit", at: [51.456151, -2.594948], look: [51.456123, -2.594889], exact: true },
    // Corn Street: the Exchange and the Nails, inside St Nicholas Market, the Glass Arcade, the Commercial Rooms,
    // and Christ Church's spire.
    { name: 'The Exchange and the Nails', at: [51.4546770, -2.5937789], look: [51.4545719, -2.5936678], exact: true },
    { name: 'Inside the Exchange (St Nicholas Market)', at: [51.4544668, -2.5935567], look: [51.4543168, -2.5933966], exact: true },
    { name: 'The Glass Arcade', at: [51.4542431, -2.5931456], look: [51.4543922, -2.5927835], exact: true },
    { name: 'The Commercial Rooms', at: [51.4543837, -2.5943366], look: [51.4544439, -2.5944001], exact: true },
    { name: "Christ Church, Corn Street", at: [51.4547992, -2.5933246], look: [51.4550938, -2.5930767], exact: true },
    // From St John's Gate towards Christmas Steps: looking left, down to the Frome and the Quay.
    { name: 'Christmas Street, towards the Quay', at: [51.45585, -2.59540], look: [51.4546, -2.5969], exact: true },
    { name: 'Frome Gate and Frome Bridge', at: [51.45600, -2.59530], look: [51.45642, -2.59603], exact: true },
    { name: 'Foot of Christmas Steps', at: [51.45608, -2.59662], look: [51.456167, -2.597325], exact: true },
    // High Street, from the High Cross down to Bristol Bridge.
    { name: 'High Street to Bristol Bridge', at: [51.45462, -2.59255], look: [51.45370, -2.59150], exact: true },
    // Redcliffe, looking up Redcliff Street to Redcliffe Gate in the Port Wall (c.1400–1650).
    { name: 'Redcliff Street to the Port Wall', at: [51.45016, -2.589957], look: [51.44945, -2.58999], exact: true },
    // St John on the Wall from outside, at the foot of Christmas Street.
    { name: "St John's from outside the wall", at: [51.45603, -2.59536], look: [51.45585, -2.59515], exact: true },
    // Along Castle Street to the castle: the bridge over the moat to its gate.
    { name: 'The castle gate', at: [51.45584, -2.58935], look: [51.45576, -2.58800], exact: true },
    { name: 'Inside the castle keep', at: [51.45612, -2.58720], look: [51.45628, -2.58720], exact: true },
    { name: 'The market place (St Nicholas Market)', at: [51.45428, -2.59360], look: [51.45420, -2.59260], exact: true },
    { name: 'Shops on High Street', at: [51.45428, -2.59222], look: [51.45422, -2.59200], exact: true },
    { name: 'Ships at the Quay (the Frome)', at: [51.45490, -2.59682], look: [51.45420, -2.59745], exact: true },
    { name: 'Old Market', at: [51.45594, -2.58230], look: [51.45630, -2.58080], exact: true },
    { name: 'The Marsh fair', at: [51.45085, -2.59580], look: [51.45030, -2.59630], exact: true },
    // By request, at today's sites: the Christmas Steps alehouse and the shops at the foot of the steps, the
    // Llandoger Trow and the Hatchet (as alehouses), a plague burial ground by Broadmead, a guildhall on Old Market Street (the Stag & Hounds site).
    { name: 'Christmas Steps: alehouse and shops', at: [51.456135, -2.597120], look: [51.45620, -2.59640], exact: true },
    { name: 'The Llandoger Trow', at: [51.45211, -2.59311], look: [51.45193, -2.59316], exact: true },
    { name: 'The Hatchet', at: [51.454096, -2.600572], look: [51.45402, -2.60045], exact: true },
    { name: 'Plague burial ground', at: [51.45676, -2.59012], look: [51.45672, -2.59095], exact: true },
    { name: 'The guildhall on Old Market Street', at: [51.45590, -2.58310], look: [51.45556, -2.58292], exact: true },
    // The churches (built from the kit).
    { name: 'St Mary Redcliffe', at: [51.44900, -2.58935], look: [51.44835, -2.58955], exact: true },
    { name: 'Temple Church', at: [51.452280, -2.586638], look: [51.452121, -2.586573], exact: true },
    { name: "St James' Priory", at: [51.45825, -2.59245], look: [51.45865, -2.59300], exact: true },
    { name: 'St Nicholas', at: [51.454113, -2.592454], look: [51.453937, -2.592314], exact: true },
    { name: 'All Saints and the High Cross', at: [51.454880, -2.593366], look: [51.454711, -2.593183], exact: true },
    { name: 'On Bristol Bridge', at: [51.45371, -2.59147], look: [51.45348, -2.59104], exact: true },
    { name: 'Greyfriars', at: [51.45752, -2.59668], look: [51.45769, -2.59636], exact: true },
    { name: 'Footbridges over the Frome, by Broadmead', at: [51.45630, -2.59000], look: [51.45617, -2.58989], exact: true },
    { name: 'Towards Broad Plain from the castle moat', at: [51.45560, -2.58470], look: [51.45428, -2.58175], exact: true },
    // The outskirts (outskirts.js): the horse fair, the bear pit, and the woods at the world's edge beyond Old Market.
    { name: 'The horse fair', at: [51.45822, -2.59072], look: [51.45850, -2.58985], exact: true },
    { name: 'The bear pit', at: [51.45935, -2.59090], look: [51.459455, -2.590731], exact: true },
    { name: "The woods beyond Lawford's Gate", at: [51.45680, -2.57790], look: [51.45700, -2.57560], exact: true }, // (out of the wolves' reach)
    // (Last, so the others keep their numbers.) The Guildhall in Broad Street, from the street before it.
    { name: 'The Guildhall, Broad Street', at: [51.455685, -2.594480], look: [51.455623, -2.594538], exact: true },
  ],
  clifton: [
    { name: 'Clifton Observatory', at: [51.4568, -2.6262], face: 220 },
    { name: 'Bridge, Clifton end', at: [51.45585, -2.62605], look: [51.4543762, -2.6291734] },
    { name: 'Hotwell Road', at: [51.453293, -2.626832], look: [51.4532514, -2.6265865] },
  ],
  'clevedon-pier': [
    { name: 'Pier toll house', at: [51.4426, -2.8613], face: 300 },
    { name: 'Seafront', at: [51.4405, -2.8620], face: 330 },
    { name: 'Beside the pier', at: [51.44236, -2.86222], look: [51.44322, -2.86334] },
    { name: 'On the pier', at: [51.44290, -2.86215], look: [51.443744, -2.865196], onDeck: true },
    { name: 'The pier head', at: [51.443800, -2.865420], look: [51.44290, -2.86215], onDeck: true },
  ],
  'birnbeck-pier': [
    { name: 'Pier entrance', at: [51.3562, -2.9938], face: 300 },
    { name: 'Worlebury hillside', at: [51.3565, -2.9880], face: 280 },
    { name: 'On the pier', at: [51.35665, -2.995021], look: [51.357867, -2.99876], onDeck: true },
    { name: 'Below the pier', at: [51.35640, -2.99600], look: [51.35720, -2.99660] },
    { name: 'On the Grand Pier', at: [51.347700, -2.983300], look: [51.347780, -2.985620], onDeck: true },
    { name: 'Beach by the Grand Pier', at: [51.347150, -2.983300], look: [51.347780, -2.986200] },
    { name: 'By the lifeboat slipway', at: [51.358433, -2.998720], look: [51.35875, -3.00040], onDeck: true },
    { name: 'Birnbeck, looking to the Grand Pier', at: [51.357174, -2.996631], look: [51.34777, -2.98660], onDeck: true },
  ],
  'brean-down': [
    { name: 'Brean Down Fort', at: [51.32775, -3.03270], look: [51.32812, -3.03445] },
    { name: 'The summit', at: [51.32560, -3.0200], face: 270 },
    { name: 'Brean Sands', at: [51.3175, -3.0115], face: 270 },
    { name: 'The Iron Age hillfort', at: [51.32425, -3.00905], look: [51.32448, -3.00882] },
  ],
  somerdale: [
    { name: 'Somerdale factory', at: [51.4232, -2.4978], face: 270 },
    { name: 'Keynsham Abbey', at: [51.4175, -2.4962], face: 0 },
  ],
  'thornbury-castle': [
    { name: 'Castle gatehouse', at: [51.6140, -2.5316], face: 90 },
    { name: "St Mary's Church", at: [51.6130, -2.5293], face: 300 },
  ],
  'glastonbury-tor': [
    { name: "St Michael's Tower", at: [51.14455, -2.6986], face: 270 },
    { name: 'Glastonbury Abbey', at: [51.1462, -2.7155], face: 0 },
  ],
  bath: [
    { name: 'Roman Baths', at: [51.38085, -2.35945], look: [51.381115, -2.359734] },
    { name: 'Abbey Churchyard', at: [51.38130, -2.35920], look: [51.38145, -2.35887] },
    { name: 'Royal Crescent lawn', at: [51.38640, -2.36823], look: [51.38727, -2.36823] },
    { name: 'Pulteney Bridge', at: [51.38270, -2.35830], look: [51.383019, -2.357899] },
  ],
  'sea-mills': [
    { name: 'Roman Abona', at: [51.47930, -2.64720], face: 300 },
    { name: 'Trym mouth', at: [51.48070, -2.64900], face: 290 },
  ],
  'weston-bay': [
    { name: 'Weston sands by the Grand Pier', at: [51.34700, -2.98420], face: 200 },
    { name: 'Uphill and the Axe mouth', at: [51.32700, -2.99700], look: [51.32480, -3.00580] },
    { name: 'On the Grand Pier', at: [51.347700, -2.983300], look: [51.347780, -2.985620], onDeck: true },
  ],
  cheddar: [
    // The deepest part of the gorge (about 120 m below its rims), looking up at the south cliff.
    { name: 'The gorge floor', at: [51.28507, -2.75956], look: [51.28453, -2.75675] },
    { name: 'The cliff top', at: [51.28453, -2.75675], look: [51.28507, -2.75956] },
    // Gough's Cave, at the foot of the gorge (entrance position approximate), looking up the gorge.
    { name: "Gough's Cave", at: [51.28205, -2.76740], look: [51.281819, -2.767417] },
    // Inside, at the first chamber, looking on down the passage.
    { name: "Inside Gough's Cave", at: [51.281372, -2.767480], look: [51.281013, -2.767530], onDeck: true },
    // The plateau north of the gorge, where the wild horses graze in the Ice Age.
    { name: 'The Mendip plateau', at: [51.28768, -2.75975], look: [51.2878, -2.7590] },
    { name: "Cheddar Man's camp", at: [51.28228, -2.76752], look: [51.28212, -2.76718] },
  ],
  'cadbury-castle': [
    { name: 'The hilltop', at: [51.02385, -2.53225], look: [51.02421, -2.53273] },
    // Inside the chief's roundhouse (Iron Age), by the back wall, looking over the hearth to the door.
    { name: 'Inside a roundhouse', at: [51.0242325, -2.5327657], look: [51.0241623, -2.5326543] },
    // Inside the great hall (AD 500), at its west end looking along it.
    { name: 'The great hall', at: [51.0245985, -2.5321641], look: [51.02462, -2.53207] },
  ],
  'cadbury-hill': [
    { name: 'The hillfort', at: [51.3806, -2.8034], face: 270 },
    { name: 'Inside a roundhouse', at: [51.3805225, -2.8033960], look: [51.3804555, -2.8032888] },
  ],
};

function pinTexture(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const text = `◉ ${name}`;
  let size = 38;
  do ctx.font = `bold ${size}px ui-monospace, Menlo, monospace`; while (ctx.measureText(text).width > 470 && (size -= 2) > 16);
  const w = Math.min(500, ctx.measureText(text).width + 30);
  ctx.fillStyle = 'rgba(8,36,30,0.88)';
  ctx.fillRect(256 - w / 2, 10, w, 76);
  ctx.strokeStyle = '#6fffd0';
  ctx.lineWidth = 4;
  ctx.strokeRect(256 - w / 2, 10, w, 76);
  ctx.fillStyle = '#b8ffe8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Views {
  constructor(map) {
    this.map = map;
    this.group = new THREE.Group();
    map.holder.add(this.group);
    this.pins = [];
    this.index = 0;
  }

  get list() {
    return VIEWS[this.map.source.slug] ?? [];
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
    for (const view of VIEWS[source.slug] ?? []) {
      const { i, j } = source.toWindow(...view.at);
      if (i < 0 || j < 0 || i >= 512 || j >= 512) continue;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture(view.name), transparent: true, depthTest: false }));
      sprite.center.set(0.5, 0);
      sprite.renderOrder = 41;
      sprite.userData.view = view;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 1, 6), new THREE.MeshBasicMaterial({ color: 0x6fffd0 }));
      this.group.add(sprite, stem);
      this.pins.push({ sprite, stem, i, j, view });
    }
  }

  bearingOf(view) {
    return bearing(view);
  }

  meshes() {
    return this.pins.filter((p) => p.sprite.visible).map((p) => p.sprite);
  }

  // Where a view stands, in the map group's frame (what Life.enter takes).
  groupSpot(view) {
    const map = this.map;
    let { i, j } = map.source.toWindow(...view.at);
    // If the spot is inside a building, step out to the nearest open ground (searching up to ~40 m).
    // "Open" means about 4 m clear all round, so a sliver between two terraced houses doesn't count.
    // Water counts as occupied too: a viewpoint should never drop you in the harbour or the sea.
    const sea = map.seaMask;
    const occupied = (x, y) => {
      const xi = Math.round(x);
      const yi = Math.round(y);
      if (xi >= 0 && yi >= 0 && xi < 512 && yi < 512 && sea[yi * 512 + xi]) return true;
      return map.objects.occupied?.(x, y) ?? false;
    };
    const cell = map.span / 512;
    const clear = Math.max(1, Math.ceil(3 / cell));
    const busy = (x, y) => {
      for (let dy = -clear; dy <= clear; dy++) for (let dx = -clear; dx <= clear; dx++) if (occupied(x + dx, y + dy)) return true;
      return false;
    };
    // (Not for a viewpoint on a pier deck, which stands over the water on purpose, or one placed exactly in a narrow street or inside a building.)
    if (!(view.onDeck || view.exact) && busy(i, j)) {
      search: for (let r = 1; r * cell < 60; r++) {
        for (let a = 0; a < 24; a++) {
          const ii = i + Math.cos((a / 24) * Math.PI * 2) * r;
          const jj = j + Math.sin((a / 24) * Math.PI * 2) * r;
          if (!busy(ii, jj)) {
            [i, j] = [ii, jj];
            break search;
          }
        }
      }
    }
    const d = new THREE.Vector3((i / 511 - 0.5) * map.size, 0, (j / 511 - 0.5) * map.size);
    map.holder.updateMatrix();
    d.applyMatrix4(map.holder.matrix);
    return { x: d.x, z: d.z };
  }

  update(h, v, scale, visible) {
    const map = this.map;
    const life = scale > 1.5;
    const k = map.viewScale;
    for (const p of this.pins) {
      const x = (p.i / 511 - 0.5) * map.size;
      const z = (p.j / 511 - 0.5) * map.size;
      const y = map.displayY(p.i, p.j, v, h, map.ground ?? map.grids.terrain);
      const lift = (life ? 0 : 0.05) / k;
      p.stem.position.set(x, y + lift / 2, z);
      p.stem.scale.set(1 / k, lift || 0.0001, 1 / k);
      p.sprite.position.set(x, y + lift, z);
      const w = 0.11 / k;
      p.sprite.scale.set(w, w * 0.19, 1);
      const show = visible && !life && map.onMap(p.sprite.position);
      p.sprite.visible = show;
      p.stem.visible = show;
    }
  }
}
