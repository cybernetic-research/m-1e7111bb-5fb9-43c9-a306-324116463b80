// Which scenes each place offers, in the order SCENE plays them. Anchors are lat/lon: the scene's 0 east, 0 north.
import { AirRaid, UboatAttack } from './scenarios.js';
import {
  WorksAtFullBlast, BuildingTheBridge, RocksRailway1941, RideRocksRailway, PaddleSteamer, PierCollapse, HmsBirnbeck,
  MagazineExplosion, Panjandrum, Earthquake1275, Stronghold,
} from './scenes.js';
import { BlitzNight, TideBefore1809 } from './bristol.js';
import { WarmleyWorks, PreachingToTheColliers } from './kingswood.js';
import { FirstFlight1969, LastLanding2003, RUNWAY } from './concorde.js';
import { FloatOut1843 } from './ssgb.js';
import { Carnival } from './carnival.js';
import { HowTheGorgeFormed } from './cheddar.js';
import { LifeboatLaunch } from './lifeboat.js';
import { WalkToBrean, UPHILL } from './weston.js';
import { SacredSpring, GeorgianPromenade, RomanPort } from './bath.js';

const CLIFTON = [51.4549, -2.6278];
const BREAN_FORT = [51.32812, -3.03445];
const CLEVEDON = { shore: [51.4427, -2.86149], head: [51.443744, -2.865196], offshore: [51.4475, -2.8800] };
const BIRNBECK = { shore: [51.356481, -2.994502], head: [51.358669, -2.998532], offshore: [51.3640, -3.0080] };

export const SCENARIOS = {
  'weston-bay': [{ Scene: WalkToBrean, anchor: UPHILL, opts: { anchor: UPHILL } }],
  cheddar: [{ Scene: HowTheGorgeFormed, anchor: [51.2845, -2.7600] }],
  'troopers-hill': [{ Scene: WorksAtFullBlast, anchor: [51.45422, -2.53742] }],
  clifton: [
    { Scene: BuildingTheBridge, anchor: CLIFTON },
    { Scene: RocksRailway1941, anchor: CLIFTON },
    { Scene: RideRocksRailway, anchor: CLIFTON },
    { Scene: AirRaid, anchor: CLIFTON },
  ],
  'clevedon-pier': [
    { Scene: PaddleSteamer, anchor: CLEVEDON.shore, opts: CLEVEDON },
    { Scene: PierCollapse, anchor: CLEVEDON.shore, opts: CLEVEDON },
  ],
  'birnbeck-pier': [
    { Scene: PaddleSteamer, anchor: BIRNBECK.shore, opts: BIRNBECK },
    { Scene: HmsBirnbeck, anchor: [51.3579, -2.9990] },
    { Scene: LifeboatLaunch, anchor: BIRNBECK.shore },
  ],
  'brean-down': [
    { Scene: MagazineExplosion, anchor: BREAN_FORT },
    // Brean Sands, on the beach below the dunes south of the Down, at low tide.
    { Scene: Panjandrum, anchor: [51.3165, -3.0150] },
    { Scene: UboatAttack, anchor: BREAN_FORT },
  ],
  kingswood: [
    { Scene: WarmleyWorks, anchor: [51.45288, -2.47947] },
    { Scene: PreachingToTheColliers, anchor: [51.45142, -2.50892] },
  ],
  filton: [
    { Scene: FirstFlight1969, anchor: RUNWAY[0] },
    { Scene: LastLanding2003, anchor: RUNWAY[0] },
  ],
  bath: [
    { Scene: SacredSpring, anchor: [51.381115, -2.359734] },
    { Scene: GeorgianPromenade, anchor: [51.38727, -2.36823] },
  ],
  'sea-mills': [{ Scene: RomanPort, anchor: [51.479124, -2.647553] }],
  'st-pauls': [{ Scene: Carnival, anchor: [51.4630, -2.5845] }],
  'bristol-centre': [
    { Scene: FloatOut1843, anchor: [51.44915, -2.608397] },
    { Scene: BlitzNight, anchor: [51.4555, -2.5895] },
    { Scene: TideBefore1809, anchor: [51.4528, -2.5925] },
  ],
  'glastonbury-tor': [{ Scene: Earthquake1275, anchor: [51.14468, -2.69877] }],
  'cadbury-castle': [{ Scene: Stronghold, anchor: [51.02462, -2.53207], opts: { outline: 'Cadbury Castle' } }],
  'cadbury-hill': [{ Scene: Stronghold, anchor: [51.38057, -2.80339], opts: { outline: 'Cadbury Hill Fort' } }],
};
