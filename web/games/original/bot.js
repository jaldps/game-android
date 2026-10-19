// Autoplay brain: scores candidate flight lines against the SDF, motes, strays, bolts; splits around islands.
import { sdf, LV, floorY } from './level.js';
import { F, HAWKS, startSplit, endSplit } from './flock.js';
import { clamp, lerp } from './util.js';

const B = { y: 45, x: 60, splitFor: null, t: 0 };
export function resetBot() { B.y = 45; B.x = 60; B.splitFor = null; B.t = 0; }

function lineCost(camX, ax, ay, ty, speed, R) {
  let cost = 0;
  for (let k = 1; k <= 7; k++) {
    const tau = k * 0.22; const x = camX + ax + speed * tau; const y = lerp(ay, ty, Math.min(1, tau / 0.75));
    const d = sdf(x, y, R + 6); const m = R * 0.75 + 2.5;
    if (d < m) cost += (m - d) * (m - d) * (k < 3 ? 4 : 2);
    for (const mo of LV.motes) { if (!mo.alive) continue; const dx = mo.x - x; if (dx > 4 || dx < -4) continue; const dy = mo.y - y; if (dy < R * 0.7 && dy > -R * 0.7) cost -= 1.6; }
    for (const s of LV.strays) { if (s.taken) continue; const dx = s.x - x; if (dx > 5 || dx < -5) continue; if (Math.abs(s.y - y) < 7) cost -= 6; }
  }
  if (ty < 10 || ty > 88) cost += 30;
  return cost;
}

export function botThink(dt, camX, W, speed) {
  B.t += dt;
  const A = F.anchors[0], R = F.radius;
  // split around floating islands when no hawk is hunting
  const hawk = HAWKS.some(h => h.st === 'dive' || h.st === 'warn');
  if (!F.split && !hawk && F.alive >= 14) {
    for (const o of LV.obs) {
      if (o.kind !== 'island') continue; const dx = o.minX - (camX + A.x);
      if (dx > 4 && dx < speed * 1.3 && A.y > o.minY - 6 && A.y < o.maxY + 6) { startSplit(); B.splitFor = o; break; }
    }
  }
  if (F.split && B.splitFor) {
    const o = B.splitFor;
    F.targets[0].y = clamp(o.minY - 10, 8, 90); F.targets[1].y = clamp(Math.min(o.maxY + 10, floorY(o.maxX) - 9), 8, 90);
    F.targets[0].x = F.targets[1].x = W * 0.3;
    if (camX + A.x - 8 > o.maxX + 4 || hawk) { endSplit(0); B.splitFor = null; B.y = F.targets[0].y; }
    return;
  }
  if (F.split) endSplit(0);
  let best = B.y, bc = 1e9;
  for (let y = 8; y <= 88; y += 2.5) {
    const c = lineCost(camX, A.x, A.y, y, speed, R) + Math.abs(y - B.y) * 0.06 + Math.abs(y - 50) * 0.05;
    if (c < bc) { bc = c; best = y; }
  }
  B.y = lerp(B.y, best, Math.min(1, dt * 7));
  // lightning: hang back or rush past
  let tx = W * 0.3 + Math.sin(B.t * 0.4) * 6;
  for (const b of LV.bolts) {
    if (b.st !== 1 && b.st !== 2) continue; const rx = b.x - camX;
    if (Math.abs(rx - tx) < R + 6) tx = rx > tx ? rx - R - 8 : rx + R + 8;
  }
  B.x = lerp(B.x, tx, Math.min(1, dt * 3));
  F.targets[0].y = B.y; F.targets[0].x = B.x;
}
