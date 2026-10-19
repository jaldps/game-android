// City layout: blocks, buildings, platforms with ramps, props, walkable heightfield, nav grid + flow fields.
import { GRID } from './config.js';
import { rand, range, irange, pick, chance, shuffle } from './rng.js';

export const BLOCKED = 100;
export const HF_RES = 0.5;
export const HF_N = Math.ceil(GRID.SPAN / HF_RES);
export const HF = new Float32Array(HF_N * HF_N);
export const ZONE = new Uint8Array(HF_N * HF_N);   // 0 road, 1 sidewalk, 2 lot, 3 park, 4 plaza, 5 roof, 6 ramp
export const NAV_RES = 2;
export const NAV_N = Math.ceil(GRID.SPAN / NAV_RES);
export const NAVH = new Float32Array(NAV_N * NAV_N);
export const NAVOK = new Uint8Array(NAV_N * NAV_N);

export const W = { blocks: [], buildings: [], platforms: [], ramps: [], props: [], spawnCells: [], typeGrid: null, TN: 0, leaderSpots: [] };

const H0 = -GRID.HALF;
export function hAt(x, z) {
  const i = ((x - H0) / HF_RES) | 0, j = ((z - H0) / HF_RES) | 0;
  if (i < 1 || j < 1 || i >= HF_N - 1 || j >= HF_N - 1) return BLOCKED;
  return HF[j * HF_N + i];
}
export function zoneAt(x, z) {
  const i = ((x - H0) / HF_RES) | 0, j = ((z - H0) / HF_RES) | 0;
  if (i < 0 || j < 0 || i >= HF_N || j >= HF_N) return 0;
  return ZONE[j * HF_N + i];
}
function rectIdx(x0, z0, x1, z1, fn) {
  const i0 = Math.max(0, Math.floor((x0 - H0) / HF_RES)), i1 = Math.min(HF_N - 1, Math.ceil((x1 - H0) / HF_RES) - 1);
  const j0 = Math.max(0, Math.floor((z0 - H0) / HF_RES)), j1 = Math.min(HF_N - 1, Math.ceil((z1 - H0) / HF_RES) - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * HF_N + i, H0 + (i + 0.5) * HF_RES, H0 + (j + 0.5) * HF_RES);
}
function setRect(x0, z0, x1, z1, h, zone) { rectIdx(x0, z0, x1, z1, k => { HF[k] = h; if (zone != null) ZONE[k] = zone; }); }
function block(x0, z0, x1, z1) { rectIdx(x0, z0, x1, z1, k => { HF[k] = BLOCKED; }); }
function blockCircle(x, z, r) { rectIdx(x - r, z - r, x + r, z + r, (k, cx, cz) => { if ((cx - x) ** 2 + (cz - z) ** 2 <= r * r) HF[k] = BLOCKED; }); }

const prop = (type, x, z, rot = 0, s = 1, extra) => { const p = { type, x, z, rot, s, y: 0, ...extra }; W.props.push(p); return p; };

// block i,j -> world rect of the whole block (incl. sidewalk)
export function blockRect(i, j) { const x0 = GRID.X0 + GRID.ROAD + i * GRID.PITCH, z0 = GRID.X0 + GRID.ROAD + j * GRID.PITCH; return [x0, z0, x0 + GRID.BLOCK, z0 + GRID.BLOCK]; }

export function buildWorld(cityId) {
  HF.fill(0); ZONE.fill(0);
  W.blocks = []; W.buildings = []; W.platforms = []; W.ramps = []; W.props = []; W.spawnCells = []; W.leaderSpots = [];
  const NB = GRID.NB, R = GRID.RING, TN = NB + 2 * R; W.TN = TN;
  W.typeGrid = new Uint8Array(TN * TN);
  // ---- assign block types for the playfield
  const types = [];
  const c = (NB - 1) / 2;
  const pool = [];
  const nPark = 6, nPlaza = 5, nPlat = 6, nPark2 = 4;
  for (let k = 0; k < nPark; k++) pool.push(1);
  for (let k = 0; k < nPlaza; k++) pool.push(2);
  for (let k = 0; k < nPlat; k++) pool.push(3);
  for (let k = 0; k < nPark2; k++) pool.push(4);
  while (pool.length < NB * NB - 1) pool.push(0);
  shuffle(pool);
  let pi = 0;
  for (let j = 0; j < NB; j++) for (let i = 0; i < NB; i++) {
    let t = (i === c && j === c) ? 2 : pool[pi++];
    types.push(t);
  }
  // avoid too many same-type neighbours: simple pass swapping adjacent duplicates of non-building types
  for (let pass = 0; pass < 3; pass++) for (let j = 0; j < NB; j++) for (let i = 0; i < NB; i++) {
    const t = types[j * NB + i]; if (t === 0 || (i === c && j === c)) continue;
    const nb = [[1, 0], [0, 1]].some(([a, b]) => i + a < NB && j + b < NB && types[(j + b) * NB + i + a] === t);
    if (nb) { const k = Math.floor(rand() * NB * NB); if (types[k] === 0) { types[k] = t; types[j * NB + i] = 0; } }
  }
  // ---- heightfield base: everything inside is road (0); blocks raised to CURB
  for (let j = -R; j < NB + R; j++) for (let i = -R; i < NB + R; i++) {
    const inside = i >= 0 && j >= 0 && i < NB && j < NB;
    const t = inside ? types[j * NB + i] : 5;
    W.typeGrid[(j + R) * TN + (i + R)] = t;
    const [x0, z0, x1, z1] = blockRect(i, j);
    const b = { i, j, t, x0, z0, x1, z1, inside };
    W.blocks.push(b);
    if (inside) { setRect(x0, z0, x1, z1, GRID.CURB, 1); }
  }
  // ---- populate blocks
  for (const b of W.blocks) {
    if (!b.inside) { decorBlock(b); continue; }
    sidewalkProps(b);
    const L = GRID.WALK, lx0 = b.x0 + L, lz0 = b.z0 + L, lx1 = b.x1 - L, lz1 = b.z1 - L;
    b.lot = [lx0, lz0, lx1, lz1];
    if (b.t === 0) buildingBlock(b);
    else if (b.t === 1) parkBlock(b);
    else if (b.t === 2) plazaBlock(b);
    else if (b.t === 3) platformBlock(b);
    else if (b.t === 4) parkingBlock(b);
  }
  // roadside parked cars (obstacles) occasionally
  for (let k = 0; k < 18; k++) {
    const vertical = chance(0.5); const ri = irange(0, NB); const seg = irange(0, NB - 1);
    const side = chance(0.5) ? 1 : -1;
    const rc = GRID.X0 + ri * GRID.PITCH + GRID.ROAD / 2 + side * (GRID.ROAD / 2 - 1.25);
    const along = GRID.X0 + GRID.ROAD + seg * GRID.PITCH + range(7, GRID.BLOCK - 7);
    const x = vertical ? rc : along, z = vertical ? along : rc;
    if (hAt(x, z) !== 0) continue;
    const rot = vertical ? 0 : Math.PI / 2;
    prop('car', x, z, rot + (side > 0 ? Math.PI : 0), 1, { color: pick(['#ff6b6b', '#4dabf7', '#ffd43b', '#ffffff', '#69db7c', '#b197fc', '#ff922b', '#e9ecef']) });
    if (vertical) block(x - 0.95, z - 2.0, x + 0.95, z + 2.0); else block(x - 2.0, z - 0.95, x + 2.0, z + 0.95);
  }
  // world border: outermost cells blocked
  for (let i = 0; i < HF_N; i++) { HF[i] = BLOCKED; HF[(HF_N - 1) * HF_N + i] = BLOCKED; HF[i * HF_N] = BLOCKED; HF[i * HF_N + HF_N - 1] = BLOCKED; }
  buildNav();
  // leader spawn spots: road intersections spread out
  const spots = [];
  for (let j = 0; j <= NB; j++) for (let i = 0; i <= NB; i++) spots.push([GRID.X0 + i * GRID.PITCH + GRID.ROAD / 2, GRID.X0 + j * GRID.PITCH + GRID.ROAD / 2]);
  W.leaderSpots = shuffle(spots);
  // spawn cells for neutrals (weighted toward sidewalks, plazas, parks, roofs)
  for (let j = 2; j < HF_N - 2; j += 2) for (let i = 2; i < HF_N - 2; i += 2) {
    const k = j * HF_N + i; if (HF[k] >= BLOCKED) continue;
    const z = ZONE[k]; const w = [0.35, 1, 0.8, 1.1, 1.3, 1.5, 0.4][z];
    if (rand() < w) W.spawnCells.push(k);
  }
  return W;
}

// ---------- block contents ----------
function sidewalkProps(b) {
  // lamps + street trees along the four sidewalks
  const L = GRID.WALK, step = 9.33;
  const edges = [
    [b.x0, b.z0 + 0.7, 1, 0, 0], [b.x0, b.z1 - 0.7, 1, 0, Math.PI], [b.x0 + 0.7, b.z0, 0, 1, -Math.PI / 2], [b.x1 - 0.7, b.z0, 0, 1, Math.PI / 2],
  ];
  for (const [sx, sz, dx, dz, rot] of edges) {
    for (let k = 1; k < 3; k++) {
      const x = sx + dx * k * step, z = sz + dz * k * step;
      prop('lamp', x, z, rot);
    }
    for (let k = 0; k < 3; k++) {
      if (chance(0.45)) continue;
      const t = (k + 0.5) * step; const x = sx + dx * t + (dz ? (rot > 0 ? -0.7 : 0.7) : 0), z = sz + dz * t + (dx ? (rot > 1 ? -0.7 : 0.7) : 0);
      const r = rand();
      if (r < 0.5) { prop('streettree', x, z, rand() * 6); blockCircle(x, z, 0.45); }
      else if (r < 0.65) prop('bench', x, z, rot);
      else if (r < 0.78) prop('hydrant', x, z, 0);
      else if (r < 0.9) prop('bin', x, z, 0);
      else { prop('busstop', x, z, rot); }
    }
  }
}

function buildingBlock(b) {
  const [lx0, lz0, lx1, lz1] = b.lot; const S = lx1 - lx0;
  setRect(lx0, lz0, lx1, lz1, GRID.CURB, 2);
  const r = rand(); const alley = 3.2, m = 0.8;
  const rects = [];
  if (r < 0.28) rects.push([lx0 + m, lz0 + m, lx1 - m, lz1 - m]);
  else if (r < 0.62) {
    const vert = chance(0.5); const sp = range(0.38, 0.62) * S;
    if (vert) { rects.push([lx0 + m, lz0 + m, lx0 + sp - alley / 2, lz1 - m]); rects.push([lx0 + sp + alley / 2, lz0 + m, lx1 - m, lz1 - m]); }
    else { rects.push([lx0 + m, lz0 + m, lx1 - m, lz0 + sp - alley / 2]); rects.push([lx0 + m, lz0 + sp + alley / 2, lx1 - m, lz1 - m]); }
  } else {
    const sx = range(0.4, 0.6) * S, sz = range(0.4, 0.6) * S;
    rects.push([lx0 + m, lz0 + m, lx0 + sx - alley / 2, lz0 + sz - alley / 2]);
    rects.push([lx0 + sx + alley / 2, lz0 + m, lx1 - m, lz0 + sz - alley / 2]);
    rects.push([lx0 + m, lz0 + sz + alley / 2, lx0 + sx - alley / 2, lz1 - m]);
    rects.push([lx0 + sx + alley / 2, lz0 + sz + alley / 2, lx1 - m, lz1 - m]);
  }
  for (const [x0, z0, x1, z1] of rects) addBuilding(x0, z0, x1, z1, false);
  // alley props
  if (rects.length > 1 && chance(0.6)) { const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2; prop('dumpster', cx + range(-4, 4), cz + range(-4, 4), chance(0.5) ? 0 : Math.PI / 2); }
}

export function addBuilding(x0, z0, x1, z1, decor, minH = 0) {
  const w = x1 - x0, d = z1 - z0; const area = w * d;
  const r = rand(); let style, h;
  if (area > 260 && r < 0.45) { style = 1; h = range(22, 40); }
  else if (r < 0.5) { style = 0; h = range(10, 22); }
  else if (r < 0.7) { style = 4; h = range(9, 18); }
  else { style = 2; h = range(5.5, 9); }
  if (decor) h *= range(1.0, 1.6);
  h = Math.max(h, minH);
  const bld = { x0, z0, x1, z1, h, style, seed: rand() * 97, color: Math.floor(rand() * 10), office: Math.floor(rand() * 4), setback: area > 150 && chance(0.45), decor };
  W.buildings.push(bld);
  if (!decor) block(x0, z0, x1, z1);
  return bld;
}

function parkBlock(b) {
  const [lx0, lz0, lx1, lz1] = b.lot; const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
  setRect(lx0, lz0, lx1, lz1, GRID.CURB, 3);
  // central fountain
  prop('fountain', cx, cz, 0); blockCircle(cx, cz, 2.6);
  // trees in the four lawns
  for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const n = irange(2, 3);
    for (let k = 0; k < n; k++) {
      const x = cx + qx * range(4.5, 9.5), z = cz + qz * range(4.5, 9.5);
      prop(chance(0.3) ? 'pine' : 'tree', x, z, rand() * 6, range(0.85, 1.2)); blockCircle(x, z, 0.5);
    }
    if (chance(0.7)) prop('bush', cx + qx * range(2.5, 4), cz + qz * range(7, 9.5), rand() * 6, range(0.8, 1.2));
    prop('bench', cx + qx * 2.2, cz + qz * 6.2, qx > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  prop('flowers', cx + 6.2, cz, 0); prop('flowers', cx - 6.2, cz, 0);
}

function plazaBlock(b) {
  const [lx0, lz0, lx1, lz1] = b.lot; const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
  setRect(lx0, lz0, lx1, lz1, GRID.CURB, 4);
  const t = rand();
  if (t < 0.5) { prop('statue', cx, cz, rand() * 6); blockCircle(cx, cz, 1.6); }
  else { prop('bigfountain', cx, cz, 0); blockCircle(cx, cz, 3.4); }
  for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + qx * 7.5, z = cz + qz * 7.5;
    prop('planter', x, z, 0); block(x - 1.1, z - 1.1, x + 1.1, z + 1.1);
    if (chance(0.6)) prop('umbrella', cx + qx * 7.5, cz - qz * 3.2 + qz * 0.0, rand() * 6, 1, { color: pick(['#ff6b6b', '#ffd43b', '#4dabf7', '#ff8cc6', '#63e6be']) });
  }
  if (chance(0.7)) { const x = cx + (chance(0.5) ? 1 : -1) * 4, z = cz + (chance(0.5) ? 1 : -1) * 9.4; prop('kiosk', x, z, 0, 1, { color: pick(['#ff6b6b', '#4dabf7', '#ffa94d', '#9775fa']) }); block(x - 1.3, z - 1.0, x + 1.3, z + 1.0); }
}

function platformBlock(b) {
  const [lx0, lz0, lx1, lz1] = b.lot; const S = lx1 - lx0; const PH = 3.6 + GRID.CURB;
  // platform covers the lot; a ramp strip (width 5) runs along one side, rising toward a corner
  const side = irange(0, 3); const RW = 5, RL = 15;
  setRect(lx0, lz0, lx1, lz1, GRID.CURB, 2);
  const plat = { x0: lx0, z0: lz0, x1: lx1, z1: lz1, h: PH, seed: rand() * 97, color: Math.floor(rand() * 10), side, ramp: null };
  W.platforms.push(plat);
  setRect(lx0, lz0, lx1, lz1, PH, 5);
  // ramp: in local frame u along the ramp (0..RL rising), v across (0..RW). Place along chosen side, starting at a corner.
  let ramp;
  if (side === 0) ramp = { x0: lx0, z0: lz1 - RW, x1: lx0 + RL, z1: lz1, dir: 'x+' };        // south edge, rises toward +x
  else if (side === 1) ramp = { x0: lx1 - RL, z0: lz0, x1: lx1, z1: lz0 + RW, dir: 'x-' };   // north edge, rises toward -x
  else if (side === 2) ramp = { x0: lx0, z0: lz0, x1: lx0 + RW, z1: lz0 + RL, dir: 'z+' };   // west edge, rises toward +z
  else ramp = { x0: lx1 - RW, z0: lz1 - RL, x1: lx1, z1: lz1, dir: 'z-' };                   // east edge, rises toward -z
  ramp.h0 = GRID.CURB; ramp.h1 = PH; plat.ramp = ramp; W.ramps.push(ramp);
  rectIdx(ramp.x0, ramp.z0, ramp.x1, ramp.z1, (k, cx, cz) => {
    let t;
    if (ramp.dir === 'x+') t = (cx - ramp.x0) / RL; else if (ramp.dir === 'x-') t = (ramp.x1 - cx) / RL;
    else if (ramp.dir === 'z+') t = (cz - ramp.z0) / RL; else t = (ramp.z1 - cz) / RL;
    HF[k] = ramp.h0 + (ramp.h1 - ramp.h0) * Math.max(0, Math.min(1, t)); ZONE[k] = 6;
  });
  // rooftop props (obstacles), keep the centre open for crowds
  const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
  const n = irange(2, 3);
  for (let k = 0; k < n; k++) {
    const x = cx + (chance(0.5) ? 1 : -1) * range(5, 7.5), z = cz + (chance(0.5) ? 1 : -1) * range(5, 7.5);
    if (pointInRect(x, z, ramp, 2.5)) continue;
    const big = chance(0.5);
    prop(big ? 'roofhut' : 'acunit', x, z, chance(0.5) ? 0 : Math.PI / 2, 1, { y: PH });
    if (big) block(x - 1.6, z - 1.3, x + 1.6, z + 1.3); else block(x - 0.8, z - 0.8, x + 0.8, z + 0.8);
  }
  for (let k = 0; k < 4; k++) {
    const x = cx + range(-8, 8), z = cz + range(-8, 8);
    if (pointInRect(x, z, ramp, 2)) continue;
    if (Math.abs(x - cx) < 4 && Math.abs(z - cz) < 4) continue;
    prop('roofplanter', x, z, 0, 1, { y: PH }); block(x - 0.7, z - 0.7, x + 0.7, z + 0.7);
  }
}
function pointInRect(x, z, r, m = 0) { return x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m; }

function parkingBlock(b) {
  const [lx0, lz0, lx1, lz1] = b.lot;
  setRect(lx0, lz0, lx1, lz1, GRID.CURB, 2);
  b.parking = true;
  // two rows of stalls along north/south; cars as obstacles
  const cols = ['#ff6b6b', '#4dabf7', '#ffd43b', '#f8f9fa', '#69db7c', '#b197fc', '#ff922b', '#343a40', '#e64980'];
  for (const row of [0, 1]) {
    const z = row ? lz1 - 3.0 : lz0 + 3.0;
    for (let k = 0; k < 7; k++) {
      if (chance(0.35)) continue;
      const x = lx0 + 1.6 + k * 2.8 + 0.1;
      prop('car', x, z, row ? 0 : Math.PI, 1, { color: pick(cols), park: 1 });
      block(x - 0.95, z - 2.0, x + 0.95, z + 2.0);
    }
  }
  const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
  prop('tree', cx - 6, cz, rand() * 6, 0.9); blockCircle(cx - 6, cz, 0.5);
  prop('tree', cx + 6, cz, rand() * 6, 0.9); blockCircle(cx + 6, cz, 0.5);
}

function decorBlock(b) {
  // ring outside the playfield: tall buildings + sidewalk props; a planter hedge marks the edge
  const L = GRID.WALK; const lx0 = b.x0 + L, lz0 = b.z0 + L, lx1 = b.x1 - L, lz1 = b.z1 - L;
  b.lot = [lx0, lz0, lx1, lz1];
  const S = lx1 - lx0;
  if (chance(0.5)) addBuilding(lx0 + 0.6, lz0 + 0.6, lx1 - 0.6, lz1 - 0.6, true, 12);
  else {
    const sp = range(0.4, 0.6) * S;
    if (chance(0.5)) { addBuilding(lx0 + 0.6, lz0 + 0.6, lx0 + sp - 1.4, lz1 - 0.6, true, 10); addBuilding(lx0 + sp + 1.4, lz0 + 0.6, lx1 - 0.6, lz1 - 0.6, true, 10); }
    else { addBuilding(lx0 + 0.6, lz0 + 0.6, lx1 - 0.6, lz0 + sp - 1.4, true, 10); addBuilding(lx0 + 0.6, lz0 + sp + 1.4, lx1 - 0.6, lz1 - 0.6, true, 10); }
  }
  // hedge on the side facing the playfield
  const edges = [];
  if (b.i === -1) edges.push('e'); if (b.i === GRID.NB) edges.push('w'); if (b.j === -1) edges.push('s'); if (b.j === GRID.NB) edges.push('n');
  for (const e of edges) {
    for (let k = 0; k < 4; k++) {
      const t = b.x0 + 2 + k * 8; const tz = b.z0 + 2 + k * 8;
      if (e === 'e') prop('hedge', b.x1 - 1.2, tz + 2, Math.PI / 2);
      if (e === 'w') prop('hedge', b.x0 + 1.2, tz + 2, Math.PI / 2);
      if (e === 's') prop('hedge', t + 2, b.z1 - 1.2, 0);
      if (e === 'n') prop('hedge', t + 2, b.z0 + 1.2, 0);
    }
  }
}

// ---------- navigation ----------
function buildNav() {
  for (let j = 0; j < NAV_N; j++) for (let i = 0; i < NAV_N; i++) {
    const x = H0 + (i + 0.5) * NAV_RES, z = H0 + (j + 0.5) * NAV_RES;
    // cell walkable if most samples are walkable
    let ok = 0, hs = 0, n = 0;
    for (const [a, c] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 0]]) { const h = hAt(x + a, z + c); n++; if (h < BLOCKED) { ok++; hs = Math.max(hs, h); } }
    const k = j * NAV_N + i;
    const hc = hAt(x, z);
    NAVOK[k] = (ok >= 4 && hc < BLOCKED) ? 1 : 0;
    NAVH[k] = hc < BLOCKED ? hc : hs;
  }
}
export function navCell(x, z) {
  const i = Math.floor((x - H0) / NAV_RES), j = Math.floor((z - H0) / NAV_RES);
  if (i < 0 || j < 0 || i >= NAV_N || j >= NAV_N) return -1;
  return j * NAV_N + i;
}
export function navCenter(k, out) { out[0] = H0 + ((k % NAV_N) + 0.5) * NAV_RES; out[1] = H0 + (Math.floor(k / NAV_N) + 0.5) * NAV_RES; return out; }
// nearest walkable nav cell (spiral search)
export function nearestNav(x, z) {
  let k = navCell(x, z); if (k >= 0 && NAVOK[k]) return k;
  const i0 = Math.floor((x - H0) / NAV_RES), j0 = Math.floor((z - H0) / NAV_RES);
  for (let r = 1; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= NAV_N || j >= NAV_N) continue;
    const kk = j * NAV_N + i; if (NAVOK[kk]) return kk;
  }
  return -1;
}

// Flow field toward a goal: dist (Uint16) + per-cell direction (Int8 x2). Moving A->B allowed if h(B)-h(A) <= 1.1
const Q = new Int32Array(NAV_N * NAV_N);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export function makeField() { return { dist: new Uint16Array(NAV_N * NAV_N), goal: -1, t: -9 }; }
export function computeField(F, gx, gz, maxD = 65535) {
  const g = nearestNav(gx, gz); F.goal = g; const dist = F.dist; dist.fill(65535);
  if (g < 0) return F;
  let qh = 0, qt = 0; Q[qt++] = g; dist[g] = 0;
  while (qh < qt) {
    const k = Q[qh++]; const d = dist[k]; if (d >= maxD) continue;
    const i = k % NAV_N, j = (k / NAV_N) | 0; const hk = NAVH[k];
    for (let n = 0; n < 4; n++) {
      const ii = i + DIRS[n][0], jj = j + DIRS[n][1];
      if (ii < 0 || jj < 0 || ii >= NAV_N || jj >= NAV_N) continue;
      const kk = jj * NAV_N + ii; if (!NAVOK[kk] || dist[kk] !== 65535) continue;
      if (hk - NAVH[kk] > 1.1) continue;   // agent at kk must be able to climb to k
      dist[kk] = d + 1; Q[qt++] = kk;
    }
  }
    return F;
}

// direction (unit, written to out[0..1]) from the cell at (x,z) toward the goal; returns cell distance or -1
export function fieldDir(F, x, z, out) {
  const k = navCell(x, z); out[0] = 0; out[1] = 0;
  if (k < 0 || F.goal < 0) return -1;
  const dist = F.dist; const d0 = dist[k]; if (d0 === 65535) return -1; if (d0 === 0) return 0;
  const i = k % NAV_N, j = (k / NAV_N) | 0; let best = d0, bx = 0, bz = 0;
  for (let n = 0; n < 8; n++) {
    const di = DIRS[n][0], dj = DIRS[n][1], ii = i + di, jj = j + dj;
    if (ii < 0 || jj < 0 || ii >= NAV_N || jj >= NAV_N) continue;
    const dd = dist[jj * NAV_N + ii]; if (dd === 65535) continue;
    if (n >= 4 && (dist[j * NAV_N + ii] === 65535 || dist[jj * NAV_N + i] === 65535)) continue;
    const cost = dd + (n >= 4 ? 0.41 : 0);
    if (cost < best - 0.01) { best = cost; bx = di; bz = dj; }
  }
  const l = Math.hypot(bx, bz) || 1; out[0] = bx / l; out[1] = bz / l;
  return d0;
}
