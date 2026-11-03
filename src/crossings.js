import * as THREE from 'three';
import { RES } from './terrain.js';
import { metreUVs } from './textures.js';
import { collider } from './collide.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Wherever one of the period's streets crosses the Frome, the castle moat or the Marsh's water, a light timber footbridge
// carries it over, so every route stays walkable (for you and for the townsfolk). Each route is followed along its
// line in the window; each run of water with dry ground at both ends that no bridge already spans (a walkable
// surface over its middle: the stone bridges, the castle's) gets a bridge on the route's own line from bank to bank:
// a plank deck on trestles, resting on the ground of each bank and cambered a little over the water, handrails both
// sides. Routes into the Avon and the harbour (tidal water, crossed only by Bristol Bridge) are listed, not bridged.
// The result (and a check afterwards that each crossing can be walked) is kept in map.crossings and logged.

const MAX_SPAN = 45; // metres: longer runs of water aren't bridged with timber (reported instead)
const CLEAR = 0.9; // the deck stands at least this far above the water

const woodTex = new THREE.TextureLoader().load('assets/models/megakit/T_WoodTrim_BaseColor.png');
woodTex.colorSpace = THREE.SRGBColorSpace;
woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 });

export function footbridges(ctx, { eras }) {
  const map = ctx.map;
  const mpp = ctx.metresPerPixel;
  const a = { i: (RES - 1) / 2, j: (RES - 1) / 2 };
  const root = new THREE.Group();
  const bridges = []; // { A, B (pixels, extended onto the banks), w (m), hA, hB, top (m OD) }
  let hit = () => false;
  let done = false;
  const k = (i, j) => Math.round(j) * RES + Math.round(i);
  const ground = (i, j) => {
    const g = map.ground ? map.sample(i, j, map.ground) : NaN;
    return Number.isFinite(g) ? g : ctx.terrainAny(i, j);
  };

  // The deck's height a fraction t along a bridge.
  const deckAt = (br, t) => {
    const ramp = Math.min(1, Math.min(t, 1 - t) * br.len / 3); // reaching full height 3 m in from each end
    const line = br.hA + (br.hB - br.hA) * t;
    return Math.max(line + 0.25 * Math.sin(Math.PI * t), line + (br.top - line) * ramp);
  };
  // Where (i, j) is on a bridge: [bridge, t] or null.
  const on = (i, j) => {
    for (const br of bridges) {
      const dx = br.B[0] - br.A[0];
      const dy = br.B[1] - br.A[1];
      const t = ((i - br.A[0]) * dx + (j - br.A[1]) * dy) / (dx * dx + dy * dy);
      if (t < 0 || t > 1) continue;
      const off = Math.abs((i - br.A[0]) * dy - (j - br.A[1]) * dx) / Math.hypot(dx, dy);
      if (off * mpp < br.w / 2) return [br, t];
    }
    return null;
  };

  const build = () => {
    const started = performance.now();
    const b = map.bristol;
    const water = map.waterNow?.() ?? 0;
    const wetHere = (i, j) => {
      const q = k(i, j);
      return !!(b.frome?.[q] || b.pool?.[q]);
    };
    const tidal = (i, j) => {
      const q = k(i, j);
      return !!(b.harbour?.[q] || map.seaMask?.[q]);
    };
    // A walkable surface at (i, j) from any structure of the period, shown or not (on the table, structures beyond
    // its edge are hidden, but their bridges still stand), or from the footbridges already placed.
    const others = map.features.items.filter((it) => it.walk && it !== self && map.features.eraOk(it));
    const walkAt = (i, j) => on(i, j) || others.some((it) => {
      const r = it.walk(i, j);
      return r != null && !(typeof r === 'object' && r.force);
    });
    // How much of the water between p and q some walkable surface already spans (a stone bridge, the castle's).
    const covered = (p, q) => {
      let wetN = 0;
      let over = 0;
      for (let t = 0; t <= 1; t += 0.05) {
        const i = p[0] + (q[0] - p[0]) * t;
        const j = p[1] + (q[1] - p[1]) * t;
        if (!wetHere(i, j)) continue;
        wetN++;
        // (Any surface within a few metres of the line counts: a parallel bridge alongside is a duplicate.)
        const ox = (-(q[1] - p[1]) / Math.hypot(q[0] - p[0], q[1] - p[1])) * (5 / mpp);
        const oy = ((q[0] - p[0]) / Math.hypot(q[0] - p[0], q[1] - p[1])) * (5 / mpp);
        if ([0, 1, -1, 2, -2].some((sd) => walkAt(i + ox * sd, j + oy * sd))) over++;
      }
      // And any walkable surface over the water within 12 m of its middle (an existing bridge just up or down stream).
      const mi = (p[0] + q[0]) / 2;
      const mj = (p[1] + q[1]) / 2;
      const r = 12 / mpp;
      for (let dj = -r; dj <= r; dj += 2 / mpp) {
        for (let di = -r; di <= r; di += 2 / mpp) {
          if (di * di + dj * dj > r * r || !wetHere(mi + di, mj + dj)) continue;
          if (walkAt(mi + di, mj + dj)) return 1;
        }
      }
      return wetN ? over / wetN : 0;
    };
    const report = { added: [], existing: 0, unresolved: [], intoWater: [], junctions: [], along: [], grazes: 0, tidal: 0 };
    // The routes, joined into chains: the map's lines come in pieces, which meet end to end (to about a metre).
    const lines = [];
    // Only the period's own streets are bridged: today's lanes and paths (kept walkable on land) stop at the bank, so
    // the Frome and the castle's moats aren't lined with footbridges where modern park paths happen to cross them.
    const historic = (x) => (x.from === 'medieval' || !x.from) && !x.name.startsWith('Lanes and paths');
    for (const st of (b.streets ?? []).filter(historic)) for (const l of st.lines ?? []) if (l.length > 1) lines.push({ st, pts: l.map((p) => [p[0], p[1]]) });
    const key = (p) => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)}`;
    const ends = new Map(); // node -> [[line index, 0 (start) | 1 (end)]...]
    lines.forEach((l, n) => {
      for (const [e, p] of [[0, l.pts[0]], [1, l.pts[l.pts.length - 1]]]) {
        const kk = key(p);
        if (!ends.has(kk)) ends.set(kk, []);
        ends.get(kk).push([n, e]);
      }
    });
    const degree = (p) => ends.get(key(p))?.length ?? 0;
    const used = new Set();
    const chains = [];
    lines.forEach((l, n) => {
      if (used.has(n)) return;
      used.add(n);
      let pts = l.pts.slice();
      // Grow at each end through nodes where just two pieces meet.
      for (const front of [false, true]) {
        for (;;) {
          const p = front ? pts[0] : pts[pts.length - 1];
          const at = ends.get(key(p)) ?? [];
          if (at.length !== 2) break;
          const next = at.find(([m]) => !used.has(m));
          if (!next) break;
          used.add(next[0]);
          let q = lines[next[0]].pts.slice();
          if (front ? next[1] === 0 : next[1] === 1) q.reverse(); // so it runs on from p
          pts = front ? [...q.slice(0, -1), ...pts] : [...pts, ...q.slice(1)];
        }
      }
      chains.push({ st: l.st, pts });
    });
    for (const { st, pts: line } of chains) {
      {
        // Samples every half pixel along the route: [i, j, lat, lon, wet, tidal, depth].
        const S = [];
        for (let n = 0; n + 1 < line.length; n++) {
          const p = map.source.toWindow(line[n][0], line[n][1]);
          const q = map.source.toWindow(line[n + 1][0], line[n + 1][1]);
          const steps = Math.max(1, Math.ceil(Math.hypot(q.i - p.i, q.j - p.j) * 2));
          for (let s = 0; s <= (n + 2 === line.length ? steps : steps - 1); s++) {
            const t = s / steps;
            const i = p.i + (q.i - p.i) * t;
            const j = p.j + (q.j - p.j) * t;
            if (i < 2 || j < 2 || i > RES - 3 || j > RES - 3) {
              S.push(null);
              continue;
            }
            const qq = k(i, j);
            S.push([i, j, line[n][0] + (line[n + 1][0] - line[n][0]) * t, line[n][1] + (line[n + 1][1] - line[n][1]) * t, wetHere(i, j), tidal(i, j), b.pool?.[qq] ? 1 : b.fromeDepth?.[qq] ?? 0]);
          }
        }
        // Runs of water.
        for (let s = 0; s < S.length; s++) {
          if (!S[s] || !(S[s][4] || S[s][5])) continue;
          let e = s;
          while (e + 1 < S.length && S[e + 1] && (S[e + 1][4] || S[e + 1][5])) e++;
          const before = S[s - 1];
          const after = S[e + 1];
          const mid = S[(s + e) >> 1];
          const run = S.slice(s, e + 1);
          const isTidal = run.every((x) => !x[4]); // (the Frome is tidal too, but it's ours to bridge)
          const deep = Math.max(...run.map((x) => x[6]));
          const where = [+mid[2].toFixed(5), +mid[3].toFixed(5)];
          const bridged = walkAt(mid[0], mid[1]);
          const runLen = (e - s + 1) * 0.5 * mpp;
          const edge = s === 0 ? line[0] : e === S.length - 1 ? line[line.length - 1] : null;
          // A route that stops in the water, or meets others there (modern lanes over the culverted river), is carried
          // straight on along its own line to the far bank.
          let [from, to] = [before, after];
          let stub = null;
          // From a dry point, heading (dx, dy) into the water: the way over to the far bank, straight on if that's not
          // much longer than the shortest way over within a right angle of it (through the middle of the channel, so
          // not just back to this bank). [far point, metres] or null.
          const over = (dry, dx, dy) => {
            const dl = Math.hypot(dx, dy) || 1;
            const tries = [];
            for (let turn = -90; turn <= 90; turn += 10) {
              const c = Math.cos((turn * Math.PI) / 180);
              const sn = Math.sin((turn * Math.PI) / 180);
              const ux = (dx * c - dy * sn) / dl;
              const uy = (dx * sn + dy * c) / dl;
              let depth = 0;
              for (let m = 0.5; m * mpp < MAX_SPAN; m += 0.5) {
                const i = dry[0] + ux * m;
                const j = dry[1] + uy * m;
                if (i < 2 || j < 2 || i > RES - 3 || j > RES - 3) break;
                const q = k(i, j);
                depth = Math.max(depth, b.pool?.[q] ? 1 : b.fromeDepth?.[q] ?? 0);
                if (!wetHere(i, j) && !tidal(i, j)) {
                  if (depth >= 0.6) tries.push({ turn, far: [i + ux * 0.5, j + uy * 0.5], len: m * mpp });
                  break;
                }
              }
            }
            if (!tries.length) return null;
            const shortest = tries.reduce((x, y) => (y.len < x.len ? y : x));
            const straight = tries.find((t) => t.turn === 0);
            return straight && straight.len <= shortest.len * 1.5 + 2 ? straight : shortest;
          };
          if (!before && !after) stub = 'along'; // (a piece of route wholly in the water: a modern path on the river's bed)
          else if (!bridged && !isTidal && deep >= 0.75) {
            if (!before || !after) {
              // A route that stops in the water, or meets others there, is carried on over to the far bank.
              const dry = before ?? after;
              const inner = before ? S[s] : S[e];
              const o = over(dry, inner[0] - dry[0], inner[1] - dry[1]);
              stub = edge && degree(edge) >= 3 ? 'junctions' : 'intoWater';
              if (o) [from, to] = before ? [before, o.far] : [o.far, after];
            } else {
              // A route across at a slant: the shortest way over from where it enters, unless its own line is nearly as short.
              const o = over(before, S[s][0] - before[0], S[s][1] - before[1]);
              const own = Math.hypot(after[0] - before[0], after[1] - before[1]) * mpp;
              if (o && own > o.len * 1.5 + 2) to = o.far;
            }
          }
          if (bridged) report.existing++;
          else if (isTidal) report.tidal++;
          else if (deep < 0.75) report.grazes++; // only along the river's edge
          else if (!from || !to) report[stub].push({ street: st.name, at: where, metres: Math.round(runLen) });
          else {
            const before = from;
            const after = to;
            if (stub) report.carried = (report.carried ?? 0) + 1;
            const span = Math.hypot(after[0] - before[0], after[1] - before[1]) * mpp;
            if (span > MAX_SPAN || runLen > MAX_SPAN) report.along.push({ street: st.name, at: where, metres: Math.round(runLen) });
            else if (span < 6) report.grazes++; // (a few metres across: only the water's edge)
            else if (bridges.some((br) => segGap(br.A, br.B, before, after) * mpp < 12) || covered(before, after) > 0.3) report.existing++; // (one crosses here already)
            else {
              // From bank to bank on the route's line, 1.5 m onto each bank.
              const ux = (after[0] - before[0]) / (span / mpp);
              const uy = (after[1] - before[1]) / (span / mpp);
              const ext = 1.5 / mpp;
              const A = [before[0] - ux * ext, before[1] - uy * ext];
              const B = [after[0] + ux * ext, after[1] + uy * ext];
              const hA = ground(...A);
              const hB = ground(...B);
              const len = span + 3;
              const w = Math.min(4, Math.max(2.6, (st.half ?? 1.5) * 2));
              const br = { A, B, mid: [mid[0], mid[1]], len, w, hA, hB, top: Math.max(water + CLEAR, Math.min(hA, hB)), street: st.name };
              bridges.push(br);
              const bm = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
              report.added.push({ street: st.name, at: [+(where[0] + (bm[1] - mid[1]) * -mpp / 111320).toFixed(5), +(where[1] + (bm[0] - mid[0]) * mpp / 69318).toFixed(5)], span: Math.round(span) });
            }
          }
          s = e;
        }
      }
    }
    // The geometry: a plank deck in short sections following its line; trestles of posts and a cross-beam, every
    // 2.5 m over the water; posts and a handrail along each side.
    const deck = [];
    const frame = [];
    const segs = [];
    for (const br of bridges) {
      const [ax, az] = [(br.A[0] - a.i) * mpp, (br.A[1] - a.j) * mpp];
      const [bx, bz] = [(br.B[0] - a.i) * mpp, (br.B[1] - a.j) * mpp];
      const ang = -Math.atan2(bz - az, bx - ax);
      const at = (t, side) => [ax + (bx - ax) * t - Math.sin(ang) * side, az + (bz - az) * t - Math.cos(ang) * side];
      const n = Math.max(4, Math.ceil(br.len / 1.2));
      for (let s = 0; s < n; s++) {
        const t0 = s / n;
        const t1 = (s + 1) / n;
        const y0 = deckAt(br, t0);
        const y1 = deckAt(br, t1);
        const [x, z] = at((t0 + t1) / 2, 0);
        const piece = metreUVs(new THREE.BoxGeometry(br.len / n + 0.02, 0.16, br.w), 1);
        piece.rotateZ(Math.atan2(y1 - y0, br.len / n)).rotateY(ang).translate(x, (y0 + y1) / 2 - 0.08, z);
        deck.push(piece);
      }
      const rail = (side) => {
        const posts = Math.max(2, Math.ceil(br.len / 2.5));
        let prev = null;
        for (let p = 0; p <= posts; p++) {
          const t = p / posts;
          const y = deckAt(br, t);
          const [x, z] = at(t, side);
          frame.push(new THREE.BoxGeometry(0.14, 1.05, 0.14).translate(x, y + 0.5, z));
          if (prev) {
            const len = Math.hypot(x - prev[0], z - prev[1]);
            const g = new THREE.BoxGeometry(len, 0.1, 0.1).rotateZ(Math.atan2(y - prev[2], len)).rotateY(ang);
            frame.push(g.translate((x + prev[0]) / 2, (y + prev[2]) / 2 + 1.0, (z + prev[1]) / 2));
          }
          prev = [x, z, y];
        }
        const [p0, p1] = [[br.A[0] - Math.sin(ang) * side / mpp, br.A[1] - Math.cos(ang) * side / mpp], [br.B[0] - Math.sin(ang) * side / mpp, br.B[1] - Math.cos(ang) * side / mpp]];
        segs.push({ a: p0, b: p1, half: 0.12 });
      };
      rail(br.w / 2 - 0.07);
      rail(-br.w / 2 + 0.07);
      // Trestles where the deck is over water (or well above the ground).
      const legs = Math.max(1, Math.round(br.len / 2.5));
      for (let p = 1; p < legs; p++) {
        const t = p / legs;
        const y = deckAt(br, t);
        const [ci, cj] = [br.A[0] + (br.B[0] - br.A[0]) * t, br.A[1] + (br.B[1] - br.A[1]) * t];
        const foot = Math.min(ground(ci, cj), (map.waterNow?.() ?? 0)) - 1.5;
        if (y - foot < 0.6) continue;
        for (const side of [-1, 1]) {
          const [x, z] = at(t, side * (br.w / 2 - 0.25));
          frame.push(new THREE.BoxGeometry(0.22, y - foot, 0.22).translate(x, (y + foot) / 2 - 0.16, z));
        }
        const [x, z] = at(t, 0);
        frame.push(new THREE.BoxGeometry(0.2, 0.22, br.w + 0.2).rotateY(ang).translate(x, y - 0.3, z));
      }
    }
    root.clear();
    if (deck.length) root.add(new THREE.Mesh(mergeAll(deck), wood), new THREE.Mesh(mergeAll(frame.map((g) => metreUVs(g, 1))), wood));
    hit = segs.length ? collider(segs, mpp) : () => false;
    // Check: every crossing is now walkable along its whole run (sampled), for you and for the townsfolk.
    let walkable = 0;
    const gaps = [];
    for (const br of bridges) {
      let ok = true;
      for (let t = 0.02; t < 1; t += 0.02) {
        const i = br.A[0] + (br.B[0] - br.A[0]) * t;
        const j = br.A[1] + (br.B[1] - br.A[1]) * t;
        if (!on(i, j) || hit(i, j)) ok = false;
      }
      if (ok) walkable++;
      else gaps.push(br.street);
    }
    report.walkable = walkable;
    report.gaps = gaps;
    report.ms = Math.round(performance.now() - started);
    map.crossings = report;
    console.info(`[crossings] ${report.added.length} footbridges added (${walkable} checked walkable), ${report.existing} crossings already bridged, ` +
      `${report.along.length} stretches running along the river bed, ${report.junctions.length} junctions in water, ${report.intoWater.length} routes ending in water, ` +
      `${report.grazes} only grazing the bank, ${report.tidal} tidal (Avon/harbour) not bridged`);
  };

  const self = {
    ...a, model: { group: root, top: 4 }, era: eras, trueSize: true, baseAlt: 0, far: true,
    walk: (i, j) => {
      const o = on(i, j);
      return o ? deckAt(o[0], o[1]) : null;
    },
    collide: (i, j) => hit(i, j),
    animate: () => {
      if (done || !eras.includes(map.era) || !map.bristol?.gardens?.[map.era] || !map.bristol.streets || !map.objects.solid) return;
      done = true;
      build();
    },
  };
  // (Others ask: is this point on a footbridge? So the townsfolk can cross.)
  map.onFootbridge = (i, j) => !!on(i, j);
  return [self];
}

function mergeAll(list) {
  return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
}

// The least distance between two segments (window pixels), 0 where they cross.
function segGap(p, q, r, t) {
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  if (cr(p, q, r) * cr(p, q, t) < 0 && cr(r, t, p) * cr(r, t, q) < 0) return 0;
  const d = (o, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const u = Math.max(0, Math.min(1, ((o[0] - a[0]) * dx + (o[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(a[0] + dx * u - o[0], a[1] + dy * u - o[1]);
  };
  return Math.min(d(p, r, t), d(q, r, t), d(r, p, q), d(t, p, q));
}
