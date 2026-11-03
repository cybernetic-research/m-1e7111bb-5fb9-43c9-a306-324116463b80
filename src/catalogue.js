// The time machine's index: for each period, what you can visit and what happens there.
// Each entry: place (asset slug), label, era (the map era to show), scene (name of a scene class to play), view
// (index of a viewpoint to stand at, life size). Places themselves are listed in main.js.

// Medieval Bristol's walled town and castle, framed on the table before you go in.
const TOWN = { at: [51.4556, -2.5915], across: 1300 };

export const PERIODS = [
  { id: 'deep-time', label: 'DEEP TIME', years: 'to 4000 BC' },
  { id: 'iron-age', label: 'IRON AGE', years: 'to AD 43' },
  { id: 'roman', label: 'ROMAN', years: '43–410' },
  { id: 'early-medieval', label: 'POST-ROMAN', years: '410–1066' },
  { id: 'medieval', label: 'MEDIEVAL', years: '1066–1485' },
  { id: 'tudor-stuart', label: 'TUDOR & STUART', years: '1485–1714' },
  { id: 'georgian', label: 'GEORGIAN', years: '1714–1837' },
  { id: 'victorian', label: 'VICTORIAN', years: '1837–1901' },
  { id: 'early-1900s', label: 'EARLY 1900s', years: '1901–1939' },
  { id: 'ww2', label: 'WORLD WAR II', years: '1939–1945' },
  { id: 'postwar', label: 'POST-WAR', years: '1945–2000' },
  { id: 'today', label: 'TODAY', years: 'now' },
];

export const CATALOGUE = [
  // Deep time: Cheddar Gorge
  { period: 'deep-time', place: 'cheddar', label: 'How Cheddar Gorge formed', era: 'now', scene: 'HowTheGorgeFormed' },
  { period: 'deep-time', place: 'cheddar', label: 'The Carboniferous sea, 350 million years ago', era: 'carboniferous' },
  { period: 'deep-time', place: 'cheddar', label: 'Mendip before the gorge (reconstruction)', era: 'before', view: 1 },
  { period: 'deep-time', place: 'cheddar', label: 'Cheddar Gorge in the Ice Age', era: 'ice-age', view: 0 },
  { period: 'deep-time', place: 'cheddar', label: 'The meltwater river in the Ice Age', era: 'ice-age', view: 0 },
  { period: 'deep-time', place: 'cheddar', label: 'Wild horses and reindeer on the Mendips', era: 'ice-age', view: 4 },
  { period: 'deep-time', place: 'cheddar', label: "Inside Gough's Cave, 15,000 years ago", era: 'ice-age', view: 3 },
  { period: 'deep-time', place: 'cheddar', label: "Cheddar Man's camp, about 9,000 years ago", era: 'mesolithic', view: 5 },
  // Iron Age and post-Roman hilltops
  { period: 'iron-age', place: 'cadbury-castle', label: 'Cadbury Castle: the hillfort town', era: 'iron-age', view: 0 },
  { period: 'iron-age', place: 'cadbury-castle', label: 'Inside a roundhouse', era: 'iron-age', view: 1 },
  { period: 'iron-age', place: 'cadbury-hill', label: 'Cadbury Congresbury hillfort', era: 'iron-age', view: 0 },
  { period: 'iron-age', place: 'cadbury-hill', label: 'Inside a roundhouse, Congresbury', era: 'iron-age', view: 1 },
  { period: 'iron-age', place: 'brean-down', label: 'Brean Down hillfort', era: 'iron-age', view: 3 },
  { period: 'iron-age', place: 'bath', label: 'The sacred spring of Sulis', era: 'roman' },
  { period: 'roman', place: 'bath', label: 'Aquae Sulis: the baths and temple', era: 'roman', scene: 'SacredSpring' },
  { period: 'roman', place: 'sea-mills', label: 'Abona: the Roman port at Sea Mills', era: 'roman', scene: 'RomanPort' },
  { period: 'roman', place: 'somerdale', label: 'Keynsham Roman villas', era: 'now' },
  { period: 'early-medieval', place: 'cadbury-castle', label: 'Cadbury Castle, c. AD 500', era: 'ad500', scene: 'Stronghold', view: 0 },
  { period: 'early-medieval', place: 'cadbury-castle', label: 'Inside the great hall', era: 'ad500', view: 2 },
  { period: 'early-medieval', place: 'cadbury-hill', label: 'Cadbury Congresbury, c. AD 500', era: 'ad500', scene: 'Stronghold', view: 0 },
  { period: 'early-medieval', place: 'bath', label: 'Bath: the lost baths', era: 'medieval' },
  // Medieval
  { period: 'medieval', place: 'glastonbury-tor', label: 'The earthquake on the Tor, 1275', scene: 'Earthquake1275' },
  { period: 'medieval', place: 'bath', label: "Bath: the King's Bath over the spring", era: 'medieval' },
  { period: 'medieval', place: 'somerdale', label: 'Keynsham Abbey', era: 'now', view: 1 },
  { period: 'medieval', place: 'bristol-centre', label: 'Medieval Bristol, c.1400: the town on the table', era: 'medieval', diorama: TOWN },
  { period: 'medieval', place: 'bristol-centre', label: 'Medieval Bristol, c.1400: Wine Street', era: 'medieval', view: 1, diorama: TOWN },
  { period: 'medieval', place: 'bristol-centre', label: "St John's Gate, c.1400", era: 'medieval', view: 6, diorama: TOWN },
  { period: 'medieval', place: 'bristol-centre', label: 'Redcliffe and the Port Wall, c.1400', era: 'medieval', view: 18, diorama: TOWN },
  { period: 'medieval', place: 'bristol-centre', label: 'High Street to Bristol Bridge, c.1400', era: 'medieval', view: 17, diorama: TOWN },
  { period: 'medieval', place: 'bristol-centre', label: 'Towards Christmas Steps and the Frome, c.1400', era: 'medieval', view: 15, diorama: TOWN },
  { period: 'medieval', place: 'bristol-centre', label: 'Frome Bridge and Christmas Steps, c.1400', era: 'medieval', view: 16, diorama: TOWN },
  { period: 'medieval', place: 'bristol-centre', label: "St John on the Wall today", era: 'now', view: 6 },
  { period: 'medieval', place: 'bristol-centre', label: "Inside St John's church", era: 'now', view: 8 },
  { period: 'medieval', place: 'bristol-centre', label: "St John's Conduit (water since 1374)", era: 'now', view: 9 },
  // Tudor and Stuart
  { period: 'tudor-stuart', place: 'thornbury-castle', label: 'Thornbury Castle, 1510–21', era: 'now', view: 0 },
  { period: 'tudor-stuart', place: 'bristol-centre', label: 'Bristol Castle and the tidal port, c.1650', era: 'castle', view: 0 },
  { period: 'tudor-stuart', place: 'bristol-centre', label: 'The tide goes out (before 1809)', scene: 'TideBefore1809' },
  { period: 'tudor-stuart', place: 'kingswood', label: 'Siston Court', era: 'now', view: 3 },
  // Georgian
  { period: 'georgian', place: 'bristol-centre', label: 'The Atlantic port, c.1750: Corn Street', era: 'georgian', view: 10 },
  { period: 'georgian', place: 'bristol-centre', label: 'The Exchange and the Nails today', era: 'now', view: 10 },
  { period: 'georgian', place: 'bristol-centre', label: 'Christ Church and the Commercial Rooms', era: 'now', view: 14 },
  { period: 'georgian', place: 'bath', label: 'Bath: taking the waters, 1770s', era: 'georgian', scene: 'GeorgianPromenade' },
  { period: 'georgian', place: 'kingswood', label: "Champion's Warmley works, 1760s", scene: 'WarmleyWorks' },
  { period: 'georgian', place: 'kingswood', label: 'Preaching to the colliers, 1739', scene: 'PreachingToTheColliers' },
  { period: 'georgian', place: 'troopers-hill', label: "Crew's Hole copper works", era: 'then', scene: 'WorksAtFullBlast' },
  // Victorian
  { period: 'victorian', place: 'bristol-centre', label: 'SS Great Britain floats out, 1843', scene: 'FloatOut1843' },
  { period: 'victorian', place: 'clifton', label: 'Building the Suspension Bridge, 1836–64', scene: 'BuildingTheBridge' },
  { period: 'victorian', place: 'clifton', label: 'Clifton Rocks Railway, 1893', era: 'then', view: 2 },
  { period: 'victorian', place: 'clifton', label: 'Ride the Rocks Railway up the cliff', era: 'then', view: 2, scene: 'RideRocksRailway' },
  { period: 'victorian', place: 'brean-down', label: 'The fort magazine explodes, 1900', scene: 'MagazineExplosion' },
  { period: 'early-1900s', place: 'bristol-centre', label: 'Wine Street before the war, 1938', era: 'then', view: 1 },
  { period: 'early-1900s', place: 'bristol-centre', label: 'Shops before the war (photo)', era: 'then', view: 5 },
  { period: 'victorian', place: 'brean-down', label: 'Brean Down Fort, 1860s', era: 'then', view: 0 },
  { period: 'georgian', place: 'blaise-castle', label: 'Blaise Castle, the folly', era: 'now', view: 0 },
  // Early 1900s
  { period: 'early-1900s', place: 'clevedon-pier', label: 'A paddle steamer calls at Clevedon', scene: 'PaddleSteamer' },
  { period: 'early-1900s', place: 'birnbeck-pier', label: 'A steamer at Birnbeck', scene: 'PaddleSteamer' },
  { period: 'early-1900s', place: 'birnbeck-pier', label: "Weston's Grand Pier, 1904–1930", era: 'then', view: 5 },
  { period: 'early-1900s', place: 'birnbeck-pier', label: 'On the Grand Pier, 1904', era: 'then', view: 4 },
  { period: 'early-1900s', place: 'birnbeck-pier', label: 'From Birnbeck to the Grand Pier', era: 'then', view: 7 },
  // Second World War
  { period: 'ww2', place: 'bristol-centre', label: 'The Blitz, 24 November 1940', scene: 'BlitzNight' },
  { period: 'ww2', place: 'bristol-centre', label: 'Wartime Bristol, 1942', era: 'blitz', view: 1 },
  { period: 'ww2', place: 'clifton', label: 'Air raid over the gorge', scene: 'AirRaid' },
  { period: 'ww2', place: 'clifton', label: 'Inside the Rocks Railway, 1941', scene: 'RocksRailway1941' },
  { period: 'ww2', place: 'birnbeck-pier', label: 'HMS Birnbeck', scene: 'HmsBirnbeck' },
  { period: 'ww2', place: 'brean-down', label: 'The Great Panjandrum', scene: 'Panjandrum' },
  { period: 'ww2', place: 'brean-down', label: 'What if: a U-boat off the fort', scene: 'UboatAttack' },
  // Post-war
  { period: 'postwar', place: 'filton', label: 'Concorde 002 first flight, 1969', scene: 'FirstFlight1969' },
  { period: 'postwar', place: 'st-pauls', label: 'St Pauls Carnival (since 1968)', scene: 'Carnival' },
  { period: 'postwar', place: 'clevedon-pier', label: 'The day the pier fell, 1970', scene: 'PierCollapse' },
  { period: 'postwar', place: 'birnbeck-pier', label: 'Maroons! The lifeboat launches from Birnbeck', era: 'now', scene: 'LifeboatLaunch', view: 6 },
  // Today
  { period: 'today', place: 'filton', label: 'The last Concorde lands, 2003', scene: 'LastLanding2003' },
  { period: 'today', place: 'bristol-centre', label: 'St Nicholas Market: the Exchange hall', era: 'now', view: 11 },
  { period: 'today', place: 'bristol-centre', label: 'St Nicholas Market: the Glass Arcade', era: 'now', view: 12 },
  { period: 'today', place: 'bristol-centre', label: 'SS Great Britain in her dock', era: 'now', view: 3 },
  { period: 'today', place: 'bristol-centre', label: 'The Matthew at Princes Wharf', era: 'now', view: 4 },
  { period: 'today', place: 'clifton', label: 'Clifton Suspension Bridge', era: 'now', view: 1 },
  { period: 'today', place: 'bath', label: 'Bath today', era: 'now' },
  { period: 'today', place: 'cheddar', label: 'Cheddar Gorge today', era: 'now', view: 0 },
  { period: 'today', place: 'birnbeck-pier', label: 'The Grand Pier today', era: 'now', view: 5 },
  { period: 'today', place: 'weston-bay', label: 'Walking to Brean Down at low tide (and why not to)', era: 'now', view: 0, scene: 'WalkToBrean' },
  { period: 'today', place: 'weston-bay', label: 'Weston sands', era: 'now', view: 0 },
  { period: 'today', place: 'birnbeck-pier', label: 'Walk the Grand Pier', era: 'now', view: 4 },
  { period: 'today', place: 'cheddar', label: "Gough's Cave show cave", era: 'now', view: 3 },
  { period: 'today', place: 'troopers-hill', label: 'Troopers Hill nature reserve', era: 'now', view: 0 },
  { period: 'today', place: 'glastonbury-tor', label: "St Michael's Tower", era: 'now', view: 0 },
];

// How BY PLACE groups the places ('*' = any place not listed elsewhere: the worldwide terrain).
export const AREAS = [
  { label: 'Bristol', places: ['bristol-centre', 'clifton', 'troopers-hill', 'st-pauls', 'kingswood', 'filton', 'blaise-castle', 'sea-mills'] },
  { label: 'The coast', places: ['clevedon-pier', 'birnbeck-pier', 'weston-bay', 'brean-down'] }, // Birnbeck's square also holds Weston's Grand Pier
  { label: 'Bath & Somerset', places: ['bath', 'somerdale', 'cheddar', 'glastonbury-tor', 'cadbury-castle', 'cadbury-hill'] },
  { label: 'Gloucestershire', places: ['thornbury-castle'] },
  { label: 'Worldwide', places: '*' },
];
