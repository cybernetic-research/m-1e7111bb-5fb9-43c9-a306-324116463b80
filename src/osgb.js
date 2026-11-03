// WGS84 lat/lon <-> OSGB36 British National Grid (Helmert + transverse Mercator, Ordnance Survey formulas, ~5 m).
// Same maths as tools/osgb.py, which matched postcodes.io's official grid reference to the metre.

const rad = (d) => (d * Math.PI) / 180;

// (Memoised: the same points (walls, streets, outlines) are converted again every time terrain loads.)
const bngCache = new Map();
export function toBNG(lat, lon) {
  const key = lat * 1e3 + lon; // (unique enough: lat and lon here differ by far more than this mixes)
  let hit = bngCache.get(key);
  if (hit && hit.lat === lat && hit.lon === lon) return hit.r;
  const r = toBNGRaw(lat, lon);
  if (bngCache.size > 300000) bngCache.clear();
  bngCache.set(key, { lat, lon, r });
  return r;
}

function toBNGRaw(lat, lon) {
  let a = 6378137.0;
  let b = 6356752.3141;
  let e2 = 1 - (b * b) / (a * a);
  let phi = rad(lat);
  let lam = rad(lon);
  let nu = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const x = nu * Math.cos(phi) * Math.cos(lam);
  const y = nu * Math.cos(phi) * Math.sin(lam);
  const z = (1 - e2) * nu * Math.sin(phi);
  const [tx, ty, tz, s] = [-446.448, 125.157, -542.060, 20.4894e-6];
  const [rx, ry, rz] = [-0.1502, -0.2470, -0.8421].map((v) => rad(v / 3600));
  const x2 = tx + (1 + s) * x - rz * y + ry * z;
  const y2 = ty + rz * x + (1 + s) * y - rx * z;
  const z2 = tz - ry * x + rx * y + (1 + s) * z;

  a = 6377563.396;
  b = 6356256.909;
  e2 = 1 - (b * b) / (a * a);
  const p = Math.hypot(x2, y2);
  phi = Math.atan2(z2, p * (1 - e2));
  for (let i = 0; i < 10; i++) {
    nu = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    phi = Math.atan2(z2 + e2 * nu * Math.sin(phi), p);
  }
  lam = Math.atan2(y2, x2);

  const F0 = 0.9996012717;
  const phi0 = rad(49);
  const lam0 = rad(-2);
  const n = (a - b) / (a + b);
  nu = (a * F0) / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const rho = (a * F0 * (1 - e2)) / (1 - e2 * Math.sin(phi) ** 2) ** 1.5;
  const eta2 = nu / rho - 1;
  const dp = phi - phi0;
  const sp = phi + phi0;
  const M = b * F0 * ((1 + n + 1.25 * n ** 2 + 1.25 * n ** 3) * dp
    - (3 * n + 3 * n ** 2 + (21 / 8) * n ** 3) * Math.sin(dp) * Math.cos(sp)
    + ((15 / 8) * n ** 2 + (15 / 8) * n ** 3) * Math.sin(2 * dp) * Math.cos(2 * sp)
    - (35 / 24) * n ** 3 * Math.sin(3 * dp) * Math.cos(3 * sp));
  const c = Math.cos(phi);
  const sn = Math.sin(phi);
  const t = Math.tan(phi);
  const I = M - 100000;
  const II = (nu / 2) * sn * c;
  const III = (nu / 24) * sn * c ** 3 * (5 - t ** 2 + 9 * eta2);
  const IIIA = (nu / 720) * sn * c ** 5 * (61 - 58 * t ** 2 + t ** 4);
  const IV = nu * c;
  const V = (nu / 6) * c ** 3 * (nu / rho - t ** 2);
  const VI = (nu / 120) * c ** 5 * (5 - 18 * t ** 2 + t ** 4 + 14 * eta2 - 58 * t ** 2 * eta2);
  const d = lam - lam0;
  return { e: 400000 + IV * d + V * d ** 3 + VI * d ** 5, n: I + II * d ** 2 + III * d ** 4 + IIIA * d ** 6 };
}

// Inverse by Newton's method on toBNG: plenty for a few corner points per map.
export function fromBNG(e, n, guess) {
  let lat = guess?.lat ?? 52;
  let lon = guess?.lon ?? -2;
  for (let i = 0; i < 8; i++) {
    const p = toBNG(lat, lon);
    const pLat = toBNG(lat + 1e-5, lon);
    const pLon = toBNG(lat, lon + 1e-5);
    const j11 = (pLat.e - p.e) / 1e-5;
    const j12 = (pLon.e - p.e) / 1e-5;
    const j21 = (pLat.n - p.n) / 1e-5;
    const j22 = (pLon.n - p.n) / 1e-5;
    const de = e - p.e;
    const dn = n - p.n;
    const det = j11 * j22 - j12 * j21;
    lat += (j22 * de - j12 * dn) / det;
    lon += (-j21 * de + j11 * dn) / det;
  }
  return { lat, lon };
}
