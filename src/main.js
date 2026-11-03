import { mapFeatures } from './medieval.js';
import { Minimap } from './minimap.js';
import * as THREE from 'three';
import { Daylight } from './daylight.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LidarSource, TileSource } from './terrain.js';
import { ContourMap } from './contour-map.js';
import { Tables } from './tables.js';
import { UI } from './ui.js';
import { Life } from './life.js';
import { Audio } from './audio.js';
import { SCENARIOS } from './registry.js';
import * as Bristol from './bristol.js';
import { Menu } from './menu.js';
import * as Bath from './bath.js';
import { HILLFORT_ERAS } from './hillforts.js';
import * as Cheddar from './cheddar.js';

const params = new URLSearchParams(location.search);

const PLACES = [
  { name: 'Matterhorn', lat: 45.9763, lon: 7.6586, z: 12 },
  { name: 'Ben Nevis', lat: 56.7969, lon: -5.0036, z: 12 },
  { name: 'Cheddar Gorge', lat: 51.2852, lon: -2.7600, z: 14 },
  { name: 'Grand Canyon', lat: 36.0970, lon: -112.0960, z: 11 },
  { name: 'Mount Fuji', lat: 35.3606, lon: 138.7274, z: 11 },
  { name: 'Scafell Pike', lat: 54.4542, lon: -3.2115, z: 12 },
  { name: 'Mount St Helens', lat: 46.1912, lon: -122.1944, z: 12 },
  { name: 'Kilimanjaro', lat: -3.0674, lon: 37.3556, z: 11 },
];

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 1e8, 2e8); // (at life size only: fog.js; set from the start, so no material recompiles)
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.02, 50);
camera.position.set(0, 1.45, 0.95);
scene.add(camera);
const hemi = new THREE.HemisphereLight(0xffffff, 0x404050, 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(-1, 3, 1);
scene.add(sun);

const game = { scene, camera, renderer, params, mode: null, head: new THREE.Vector3(), lights: { hemi, sun } };
game.daylight = new Daylight(game);

game.audio = new Audio();
game.sfx = game.audio;

const overlay = document.getElementById('overlay');
const btnAR = document.getElementById('btn-ar');
const btnScreen = document.getElementById('btn-screen');
const status = document.getElementById('status');

const TIDES = { low: -4.0, mid: 1.0, high: 5.5 };

// Sites baked from 1 m LIDAR (tools/bake_lidar.py + tools/bake_osm.py), then worldwide tile places.
// thenSurface: the landmark structures (bridge, piers, fort) already stood c.1900, so 'then' keeps the surface model.
const LIDAR_SITES = [
  // tides: the sea surface in metres above Ordnance Datum at low, mid and high water. The Bristol Channel's range
  // is huge (about -5.5 m to +6.5 m at springs); the default is mid tide, which leaves the beaches showing.
  ['troopers-hill', { hasHistory: true }],
  ['kingswood'], ['st-pauls', { hasRoute: true }], ['filton'], ['blaise-castle'],
  ['bristol-centre', {
    // Before the Floating Harbour (1809) the Avon and Frome were tidal: TIDE runs low, mid and high water (metres OD,
    // approximate: at low water a trickle in the channel and the ships on the mud; high water just below the quays).
    paved: true, eras: Bristol.ERAS, composeGrid: Bristol.composeGrid, onApply: Bristol.onApply, waterLevel: Bristol.waterLevel, tide: 6.9,
    tides: { low: 1.2, mid: 5.5, high: 7.2 }, beachFor: Bristol.beachFor,
    baseFloor: Bristol.baseFloor, seaSeeds: Bristol.seaSeeds, footprintsFor: Bristol.footprintsFor, styleFor: Bristol.styleFor, pavedFor: Bristol.pavedFor, streetsFor: Bristol.streetsFor, treesFor: Bristol.treesFor, mapFeaturesFor: mapFeatures,
  }],
  ['clifton', { thenSurface: true, tides: TIDES, noTrees: [[51.4549, -2.6278, 125]] }],
  ['sea-mills', {
    tides: TIDES, eras: [{ id: 'now', base: 'aerial' }, { id: 'roman', label: 'ABONA · ROMAN PORT', base: 'none' }],
    footprintsFor: (map, era) => (era === 'now' ? map.source.buildings : []),
  }],
  // Beaches: Clevedon and Birnbeck are muddy pebbles; Weston's sands start south of Knightstone.
  ['clevedon-pier', { thenSurface: true, tides: TIDES, beach: { kind: 'pebble', top: 7, mudBelow: 3 } }],
  ['birnbeck-pier', { thenSurface: true, tides: TIDES, beach: { kind: 'pebble', top: 7, mudBelow: 2, sandSouthOf: 51.3515 } }],
  // Weston's sand runs down the beach to the mud of the outer flats and the Axe estuary.
  ['weston-bay', { tides: TIDES, beach: { kind: 'sand', top: 7, mudBelow: 1.4 } }],
  ['brean-down', {
    thenSurface: true, tides: TIDES, beach: { kind: 'sand', top: 7, mudBelow: -1 },
    eras: [{ id: 'now', base: 'aerial' }, { id: 'then', label: 'THEN · c.1900', base: 'historic' }, HILLFORT_ERAS['iron-age']],
  }],
  ['somerdale'], ['thornbury-castle'],
  ['bath', { eras: Bath.BATH_ERAS, footprintsFor: Bath.footprintsFor }],
  ['glastonbury-tor'],
  ['cheddar', {
    eras: Cheddar.CHEDDAR_ERAS, composeGrid: Cheddar.composeGrid, onApply: Cheddar.onApply, waterLevel: Cheddar.waterLevel,
    tundraFor: Cheddar.tundraFor, riverFor: Cheddar.riverFor, footprintsFor: Cheddar.footprintsFor, treesFor: Cheddar.treesFor,
  }],
  ['cadbury-castle', { eras: [{ id: 'now', base: 'aerial' }, HILLFORT_ERAS['iron-age'], HILLFORT_ERAS.ad500] }],
  ['cadbury-hill', { eras: [{ id: 'now', base: 'aerial' }, HILLFORT_ERAS['iron-age'], HILLFORT_ERAS.ad500] }],
];
const sources = (await Promise.all(LIDAR_SITES.map(([slug, options]) => LidarSource.load(slug, options).catch((err) => {
  console.error(`LIDAR asset ${slug} missing`, err);
  return null;
})))).filter(Boolean);
sources.push(...PLACES.map((p) => new TileSource(p)));
game.tables = new Tables(game);
game.minimap = new Minimap(game); // before the UI, which puts a copy on the life-size belt
game.ui = new UI(game);
game.map = new ContourMap(game, sources);
game.life = new Life(game);
game.map.scenario.registry = SCENARIOS;
game.menu = new Menu(game);
// From the menu: back to the table first if at life size, then load the place and set it up.
game.goTo = (entry) => {
  if (game.life.active) game.life.finishExit();
  game.map.goTo(entry.place, entry);
};
game.setFar = (far) => {
  camera.far = far;
  camera.updateProjectionMatrix();
};
// Scenario titles and their "this is a dramatisation" note appear in the caption panel.
game.flash = (title, text) => game.map.captions.openCaption({ title, text, era: 'Dramatisation' });
game.onLife = (on) => {
  game.map.status = '';
  game.map.drawSign();
  if (game.mode === 'screen') {
    game.ui.enterScreenLife(on);
  }
};
if (params.has('place')) game.map.index = Number(params.get('place')) % sources.length;
status.textContent = `${sources.length} places ready`;

let placedOn = null; // 'real' | 'virtual'
let searchT = 0;

// Bring the map to a table in front of you (a click of either thumbstick at table scale): where it was put might
// be out of reach. It stays there (a table found afterwards doesn't move it).
game.bringMap = () => {
  if (game.mode !== 'ar' || game.life.active) return;
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0;
  fwd.normalize();
  const near = game.tables.pick(game.head);
  game.tables.showVirtual(null);
  game.map.place(near ?? game.tables.virtual(game.head, fwd), game.head);
  placedOn = 'yours';
  console.info(`[tables] brought to you${near ? ', on the table in reach' : ''}`);
};

function placeOnTable(dt) {
  if (placedOn === 'yours') return;
  const real = game.tables.pick(game.head);
  if (real && placedOn !== 'real') {
    console.info(`[tables] placing on ${real.label || 'a horizontal plane'} ${real.width.toFixed(2)} x ${real.depth.toFixed(2)} m at ${real.center.y.toFixed(2)} m`);
    game.tables.showVirtual(null);
    game.map.place(real, game.head);
    placedOn = 'real';
    return;
  }
  // Give the Quest a few seconds to report the room before falling back to a virtual table.
  if (!placedOn && (searchT += dt) > 3) {
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    console.info('[tables] no table found, using a virtual one');
    game.map.place(game.tables.virtual(game.head, fwd), game.head);
    placedOn = 'virtual';
  }
}

async function startAR() {
  let session;
  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'plane-detection'],
    });
  } catch (err) {
    btnAR.textContent = 'AR FAILED TO START';
    console.error(err);
    return;
  }
  game.sfx.init();
  if (game.mode !== 'ar') {
    game.mode = 'ar';
    scene.background = null;
    game.ui.setupXR(renderer);
  }
  placedOn = null;
  searchT = 0;
  session.addEventListener('end', () => {
    overlay.style.display = '';
    btnAR.textContent = 'RE-ENTER AR';
    btnScreen.style.display = 'none';
    game.map.group.visible = false;
    if (game.life.active) game.life.finishExit();
  });
  await renderer.xr.setSession(session);
  overlay.style.display = 'none';
}

function startScreen() {
  game.sfx.init();
  game.mode = 'screen';
  scene.background = new THREE.Color(0x14181e);
  const table = game.tables.buildScreenTable();
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0.76, -0.05);
  orbit.maxPolarAngle = Math.PI * 0.47;
  orbit.minDistance = 0.3;
  orbit.maxDistance = 3;
  orbit.update();
  game.ui.setupScreen(renderer.domElement, camera, orbit);
  camera.getWorldPosition(game.head);
  game.map.place(table, game.head);
  overlay.style.display = 'none';
  btnAR.style.display = 'none';
}

btnScreen.addEventListener('click', startScreen);
btnAR.addEventListener('click', startAR);

if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-ar').then((ok) => {
    btnAR.disabled = !ok;
    btnAR.textContent = ok ? 'START AR' : 'AR NOT AVAILABLE HERE';
  }).catch(() => { btnAR.textContent = 'AR NOT AVAILABLE HERE'; });
} else {
  btnAR.textContent = window.isSecureContext ? 'NO WEBXR IN THIS BROWSER' : 'AR NEEDS HTTPS';
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (renderer.xr.isPresenting) renderer.xr.updateCamera(camera);
  camera.getWorldPosition(game.head);
  if (frame) {
    game.tables.updateXR(frame, renderer.xr.getReferenceSpace());
    placeOnTable(dt);
  }
  if (game.mode) {
    game.audio.updateListener(camera);
    game.ui.update(dt);
    game.life.update(dt);
    game.map.update(dt);
    game.minimap.update(dt);
    game.daylight.update(dt);
    // The flat-screen room's table and floor only on the flat screen, and never at life size (left showing, they
    // stood under you there: in a headset, a dark shape like a gun held low in the middle of the view); nor the
    // outline of a virtual table at life size.
    if (game.tables.screenProps) game.tables.screenProps.visible = game.mode === 'screen' && !renderer.xr.isPresenting && !game.life.active;
    if (game.tables.virtualOutline) game.tables.virtualOutline.visible = !game.life.active;
  }
  renderer.render(scene, camera);
});

// The blackletter for place names before 1700 (UnifrakturMaguntia, SIL Open Font Licence): redraw the labels once
// it has loaded.
new FontFace('Medieval', 'url(assets/fonts/UnifrakturMaguntia-Book.ttf)').load().then((f) => {
  document.fonts.add(f);
  game.map.drawSign();
}).catch((err) => console.warn('[font] blackletter not loaded', err));

if (params.get('autostart') === 'screen') startScreen();
window.__game = game;
