// Bot brains: pick juicy targets, chase smaller holes, flee bigger ones.
import { CITY, HOLE } from './config.js';
import { holes } from './holes.js';
import { city } from './city.js';
import { gridQuery } from './objects.js';
import { rand, range } from './rng.js';

const _q = [];
export function makeBrain(skill) {
  return { skill, think: rand() * 0.3, tx: 0, tz: 0, has: false, ix: 0, iz: 0, wanderT: 0, chase: null, obj: null };
}

export function updateBrain(h, dt, time) {
  const b = h.ai; if (!b || !h.alive) return;
  b.think -= dt;
  if (b.think <= 0) {
    b.think = 0.3 + (1 - b.skill) * 0.3 + rand() * 0.15;
    decide(h, b);
  }
  let dx = b.tx - h.x, dz = b.tz - h.z;
  let d = Math.hypot(dx, dz);
  // flee vector recomputed each frame (cheap: few holes)
  let fx = 0, fz = 0;
  // Flee, but only from a real and close threat. A wide panic radius means a hole that is behind
  // spends the whole round running and never eats, which is a death spiral it cannot leave.
  for (const o of holes) {
    if (o === h || !o.alive || o.r < h.r * HOLE.EAT_HOLE_RATIO) continue;
    const ox = h.x - o.x, oz = h.z - o.z; const od = Math.hypot(ox, oz);
    const danger = o.r + 4 + h.r;
    if (od < danger * (0.55 + b.skill * 0.35)) { const w = (1 - od / (danger * 1.3)) * 1.7; fx += ox / (od || 1) * w; fz += oz / (od || 1) * w; }
  }
  let ix = d > 0.3 ? dx / d : 0, iz = d > 0.3 ? dz / d : 0;
  ix += fx; iz += fz;
  // keep off the edges
  const lim = CITY.HALF - h.r - 3;
  if (h.x < -lim) ix += 1.5; if (h.x > lim) ix -= 1.5; if (h.z < -lim) iz += 1.5; if (h.z > lim) iz -= 1.5;
  const il = Math.hypot(ix, iz);
  if (il > 1e-3) { ix /= il; iz /= il; }
  const sp = d < h.r * 0.3 && !fx && !fz ? 0.35 : (0.82 + b.skill * 0.18);
  b.ix += (ix * sp - b.ix) * Math.min(1, dt * 6); b.iz += (iz * sp - b.iz) * Math.min(1, dt * 6);
  h.input.x = b.ix; h.input.z = b.iz;
}

function decide(h, b) {
  // 1) chase a smaller hole nearby — and hunt the player specifically, from much further out
  let bestHole = null, bestHD = 1e9;
  for (const o of holes) {
    if (o === h || !o.alive || o.invuln > 0) continue;
    if (h.r > o.r * HOLE.EAT_HOLE_RATIO * 1.03) {
      const d = Math.hypot(o.x - h.x, o.z - h.z);
      // hunting the player is worth a detour, but not a map-wide homing beacon
      const reach = (8 + h.r * 1.7 * b.skill) * (o.isPlayer ? 1.5 : 1);
      const score = d / (o.isPlayer ? 1.8 : 1);
      if (d < reach && score < bestHD) { bestHD = score; bestHole = o; }
    }
  }
  if (bestHole && rand() < (bestHole.isPlayer ? 0.55 : 0.3 + b.skill * 0.4)) {
    const lead = bestHole.isPlayer ? 0.8 : 0.4;
    b.tx = bestHole.x + bestHole.vx * lead; b.tz = bestHole.z + bestHole.vz * lead; return;
  }
  const fit = h.r * HOLE.FIT;
  // 2) a set-piece you have outgrown is worth crossing the map for — it is the round's big prize
  for (const m of city.megas) {
    if (m.state !== 0 || m.size >= fit) continue;
    const d = Math.hypot(m.x - h.x, m.z - h.z);
    if (d < 95) { b.tx = m.x; b.tz = m.z; b.obj = m; return; }
  }
  // 3) best food cluster within reach
  const R = 12 + h.r * 3.2;
  gridQuery(h.x, h.z, R, _q);
  let best = null, bestS = 0;
  for (let i = 0; i < _q.length; i++) {
    const o = _q[i]; if (o.state !== 0 || o.size >= fit) continue;
    const d = Math.hypot(o.x - h.x, o.z - h.z);
    if (d > R) continue;
    // prefer valuable, near objects slightly ahead of current heading
    const ahead = (h.vx * (o.x - h.x) + h.vz * (o.z - h.z)) / ((d || 1) * (Math.hypot(h.vx, h.vz) || 1));
    let s = (o.value + 0.6) / Math.pow(d + 3, 1.25) * (1 + ahead * 0.35) * (0.75 + rand() * 0.5 * (1.4 - b.skill));
    if (o.drive) s *= 0.55;
    if (o === b.obj) s *= 1.45;   // commitment: finish the snack you set off for
    if (s > bestS) { bestS = s; best = o; }
  }
  if (best) {
    b.tx = best.x; b.tz = best.z; b.has = true; b.obj = best;
    if (best.drive) { const lead = Math.min(1.2, Math.hypot(best.x - h.x, best.z - h.z) / 8); b.tx += Math.sin(best.yaw) * best.drive.cur * lead; b.tz += Math.cos(best.yaw) * best.drive.cur * lead; }
    return;
  }
  // 4) nothing in reach — strike out across the city
  b.obj = null;
  b.tx = range(-CITY.SPAN * 0.4, CITY.SPAN * 0.4); b.tz = range(-CITY.SPAN * 0.4, CITY.SPAN * 0.4);
}
