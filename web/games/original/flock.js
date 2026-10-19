// The murmuration: formation-spring boids with curl-noise swirl, separation, obstacle squeeze,
// two-group split, a ribboned lead bird, and hawks that hunt stragglers.
import { noise2, clamp, lerp, hash1 } from './util.js';
import { sdf, HIT, boltAt, WATER_Y, isWaterAt, LV } from './level.js';

export const F = {
  birds: [], anchors: [mkAnchor(), mkAnchor()], targets: [{ x: 70, y: 45 }, { x: 70, y: 45 }],
  split: false, locked: false, alive: 0, lead: null, ribbon: [], radius: 8, cx: 0, cy: 0, nG: [0, 0],
  invuln: false, maxAlive: 0, lost: 0,
};
function mkAnchor() { return { x: 70, y: 45, vx: 0, vy: 0 }; }
const RIB = 34;

function newBird(x, y, rng) {
  const a = rng() * 6.283, r = Math.sqrt(rng());
  return { x, y, vx: 0, vy: 0, ox: Math.cos(a) * r, oy: Math.sin(a) * r, g: 0, alive: true, die: 0, ph: rng() * 6.28,
    fs: 13 + rng() * 6, k: 2.6 + rng() * 2.2, sz: 0.85 + rng() * 0.3, nb: 0, isLead: false, rot: 0, spin: 0, glide: 0, sx: 0, sy: 0, grace: 0 };
}

export function resetFlock(n, camX, rng) {
  F.birds.length = 0; F.split = false; F.locked = false; F.lost = 0;
  for (const A of F.anchors) { A.x = 60; A.y = 46; A.vx = A.vy = 0; }
  F.targets[0].x = F.targets[1].x = 60; F.targets[0].y = F.targets[1].y = 46;
  for (let i = 0; i < n; i++) { const b = newBird(0, 0, rng); b.x = camX + 60 + b.ox * 8; b.y = 46 + b.oy * 6; b.vx = 30; F.birds.push(b); }
  setLead(F.birds[0]);
  F.ribbon.length = 0; for (let i = 0; i < RIB; i++) F.ribbon.push({ x: F.birds[0].x - i * 0.8, y: F.birds[0].y });
  F.alive = n; F.maxAlive = n;
}
function setLead(b) {
  for (const o of F.birds) o.isLead = false;
  b.isLead = true; b.ox = 0.62; b.oy = -0.05; b.sz = 1.35; b.k = 6;
  F.lead = b;
}
export function addBirds(n, x, y, rng, camSpeed) {
  for (let i = 0; i < n; i++) { const b = newBird(x, y, rng); b.x = x + (rng() - 0.5) * 3; b.y = y - rng() * 2; b.vx = camSpeed * 0.6; b.vy = -12 - rng() * 10; b.k = 1.5; b.grace = 1.1; b.g = F.split ? nearestGroup(b) : 0; F.birds.push(b); }
}
function nearestGroup(b) {
  const A = F.anchors; return (Math.hypot(b.y - A[0].y, 0) < Math.hypot(b.y - A[1].y, 0)) ? 0 : 1;
}
export function startSplit() {
  if (F.split) return; F.split = true; F.locked = false;
  const A0 = F.anchors[0], A1 = F.anchors[1]; A1.x = A0.x; A1.y = A0.y; A1.vx = A0.vx; A1.vy = A0.vy;
  F.targets[1].x = F.targets[0].x; F.targets[1].y = F.targets[0].y;
}
export function endSplit(keep = 0) {
  if (!F.split) return; F.split = false;
  if (keep === 1) { const a = F.anchors[0], b = F.anchors[1]; a.x = b.x; a.y = b.y; a.vx = b.vx; a.vy = b.vy; F.targets[0].x = F.targets[1].x; F.targets[0].y = F.targets[1].y; }
  for (const b of F.birds) b.g = 0;
}

// cb: { onDeath(bird, cause), }
export function updateFlock(dt, t, camX, speed, W, cb) {
  const B = F.birds, A = F.anchors;
  // anchors chase targets (critically damped spring) in camera space
  for (let g = 0; g < 2; g++) {
    const T = F.targets[g], a = A[g];
    T.x = clamp(T.x, 18, W * 0.62); T.y = clamp(T.y, 6, 92);
    const K = 46, C = 12.5;
    a.vx += ((T.x - a.x) * K - a.vx * C) * dt; a.vy += ((T.y - a.y) * K - a.vy * C) * dt;
    a.x += a.vx * dt; a.y += a.vy * dt;
  }
  // group assignment during a fresh split
  if (F.split && !F.locked) {
    const dx = F.targets[1].x - F.targets[0].x, dy = F.targets[1].y - F.targets[0].y, dl = Math.hypot(dx, dy);
    if (dl > 0.5) for (const b of B) if (b.alive) b.g = (b.ox * dx * 1.25 + b.oy * dy * 0.8 > 0) ? 1 : 0;
    if (dl > 7) F.locked = true;
  }
  // stats per group
  let n = 0; const cnt = F.nG; cnt[0] = cnt[1] = 0;
  let mx0 = 0, my0 = 0, mx1 = 0, my1 = 0;
  for (const b of B) if (b.alive) { n++; cnt[b.g]++; if (b.g) { mx1 += b.ox; my1 += b.oy; } else { mx0 += b.ox; my0 += b.oy; } }
  F.alive = n; if (n > F.maxAlive) F.maxAlive = n;
  if (cnt[0]) { mx0 /= cnt[0]; my0 /= cnt[0]; } if (cnt[1]) { mx1 /= cnt[1]; my1 /= cnt[1]; }
  const R0 = 2.4 + Math.sqrt(Math.max(1, cnt[0])) * 0.9, R1 = 2.4 + Math.sqrt(Math.max(1, cnt[1])) * 0.9;
  F.radius = 2.4 + Math.sqrt(Math.max(1, n)) * 0.9;
  // neighbour pass (separation + density)
  for (let i = 0; i < B.length; i++) { B[i].sx = 0; B[i].sy = 0; B[i].nb = 0; }
  for (let i = 0; i < B.length; i++) {
    const a = B[i]; if (!a.alive) continue;
    for (let j = i + 1; j < B.length; j++) {
      const b = B[j]; if (!b.alive) continue;
      const dx = a.x - b.x, dy = a.y - b.y; if (dx > 6 || dx < -6) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 < 36) { a.nb++; b.nb++;
        if (d2 < 3.6 && d2 > 1e-4) { const d = Math.sqrt(d2), f = (1.9 - d) / d * 22; a.sx += dx * f; a.sy += dy * f; b.sx -= dx * f; b.sy -= dy * f; }
      }
    }
  }
  let cx = 0, cy = 0;
  for (const b of B) {
    if (!b.alive) { // tumbling fall
      b.die += dt; b.vy += 60 * dt; b.vx *= 1 - 0.8 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.spin * dt; continue;
    }
    const g = b.g, a = A[g], R = g ? R1 : R0, mx = g ? mx1 : mx0, my = g ? my1 : my0;
    const sw = t * 0.32;
    const nxo = (noise2(b.ox * 1.4 + sw, b.oy * 1.4 + 3.1, 11) - 0.5) * 1.5;
    const nyo = (noise2(b.ox * 1.4 + 7.7, b.oy * 1.4 - sw, 23) - 0.5) * 1.5;
    let ox = (b.ox - mx * 0.9 + nxo), oy = (b.oy - my * 0.9 + nyo);
    if (b.isLead) { ox = b.ox; oy = b.oy; }
    // stretch along motion (stream), squash across
    const tx = camX + a.x + ox * R * 1.3 - a.vx * 0.07 * (1 + b.ox) , ty = a.y + oy * R * 0.82 - a.vy * 0.05 * (1 + b.ox * 0.5);
    let ax = (tx - b.x) * b.k * 3.2 - (b.vx - speed - a.vx) * 2.4 + b.sx;
    let ay = (ty - b.y) * b.k * 3.2 - (b.vy - a.vy) * 2.4 + b.sy;
    if (b.k < 2.6) b.k += dt * 0.8; // newly recruited birds ease in
    // obstacle squeeze: sample slightly ahead. Strong + wide so the murmuration POURS around
    // rock instead of smearing into it; the outer birds still graze on a tight thread.
    const d = sdf(b.x + b.vx * 0.12, b.y + b.vy * 0.12, 10);
    if (d < 7.5) { const u = (7.5 - Math.max(d, -1)) / 7.5, f = u * u * 150; ax += HIT.nx * f; ay += HIT.ny * f; }
    // A charging lightning column shoves the flock DOWNSTREAM (always +x, never back through
    // the column — the camera is dragging them right anyway, so a two-sided push would just
    // feed the left half back into the strike). The flock surges ahead of the crackle.
    for (const bo of LV.bolts) {
      if (bo.st !== 1 && bo.st !== 2) continue;
      const dx2 = b.x - bo.x; if (dx2 > 7 || dx2 < -26) continue;
      const u = dx2 > 0 ? 1 - dx2 / 7 : 1 + dx2 / 26;
      ax += u * u * 215 * (bo.st === 2 ? 1 : Math.min(1, bo.t / 1.1));
    }
    if (b.grace > 0) b.grace -= dt;
    b.vx += ax * dt; b.vy += ay * dt;
    const rvx = b.vx - speed, sp = Math.hypot(rvx, b.vy), mxs = 95;
    if (sp > mxs) { b.vx = speed + rvx / sp * mxs; b.vy = b.vy / sp * mxs; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -4) { b.y = -4; b.vy = Math.abs(b.vy) * 0.3; }
    // flap: faster when climbing, glide when diving
    const climb = clamp(-b.vy / 30, -1, 1);
    b.glide = lerp(b.glide, climb < -0.35 ? 1 : 0, dt * 4);
    b.ph += dt * b.fs * (1 + Math.max(0, climb) * 0.6) * (1 - b.glide * 0.85);
    cx += b.x; cy += b.y;
    // collisions
    if (!F.invuln && b.grace <= 0) {
      const dd = sdf(b.x, b.y, 2);
      const bolt = boltAt(b.x, b.y);
      if (dd < -0.55 || bolt) kill(b, bolt ? 'bolt' : (HIT.o ? HIT.o.kind : (isWaterAt(b.x) ? 'water' : 'ground')), cb);
    } else {
      const dd = sdf(b.x, b.y, 2); if (dd < 0.3) { b.x += HIT.nx * (0.3 - dd); b.y += HIT.ny * (0.3 - dd); }
    }
  }
  if (n) { F.cx = cx / n; F.cy = cy / n; }
  // remove long-dead birds
  for (let i = B.length - 1; i >= 0; i--) if (!B[i].alive && B[i].die > 2.5) B.splice(i, 1);
  // ribbon follows the lead bird
  const L = F.lead;
  if (L) {
    const R = F.ribbon; R[0].x = L.x - 0.9; R[0].y = L.y + 0.1;
    for (let i = 1; i < R.length; i++) {
      const p = R[i], q = R[i - 1]; p.y += Math.sin(t * 5 + i * 0.45) * 0.05; p.y += 1.9 * dt; // slight droop
      const dx = p.x - q.x, dy = p.y - q.y, l = Math.hypot(dx, dy) || 1, seg = 0.62;
      p.x = q.x + dx / l * seg; p.y = q.y + dy / l * seg;
    }
  }
}

export function kill(b, cause, cb) {
  if (!b.alive) return;
  b.alive = false; b.die = 0; b.spin = (Math.random() - 0.5) * 18; b.vy = Math.min(b.vy, 0) - 8; b.vx *= 0.5;
  F.lost++;
  if (b.isLead) {
    b.isLead = false;
    let best = null, bs = -1e9;
    for (const o of F.birds) if (o.alive && o.ox > bs) { bs = o.ox; best = o; }
    if (best) setLead(best); else F.lead = null;
  }
  cb && cb.onDeath && cb.onDeath(b, cause);
}

// ---------------- hawks ----------------
export const HAWKS = [];
export function resetHawks() { HAWKS.length = 0; }
export function spawnHawk(camX, W, rng) {
  HAWKS.push({ st: 'warn', t: 0, x: camX + W + 10, y: 8 + rng() * 30, vx: 0, vy: 0, target: null, ph: 0, side: rng() < 0.5 ? -1 : 1 });
}
export function updateHawks(dt, camX, speed, W, cb) {
  for (let i = HAWKS.length - 1; i >= 0; i--) {
    const h = HAWKS[i]; h.t += dt; h.ph += dt * (h.st === 'dive' ? 6 : 9);
    if (h.st === 'warn') {
      h.x = camX + W + 6; h.vx = speed;
      if (h.t > 1.3) { h.st = 'dive'; h.t = 0; h.target = pickStraggler(); cb.hawkScreech && cb.hawkScreech(); }
    } else if (h.st === 'dive') {
      const tg = h.target;
      if (!tg || !tg.alive) { h.target = pickStraggler(); if (!h.target) { h.st = 'leave'; continue; } }
      const T = h.target; const dx = T.x - h.x, dy = T.y - h.y, d = Math.hypot(dx, dy) || 1;
      const sp = 62 + Math.min(1, h.t / 1.2) * 30;
      h.vx += ((speed + dx / d * sp) - h.vx) * dt * 3.2; h.vy += (dy / d * sp - h.vy) * dt * 3.2;
      h.x += h.vx * dt; h.y += h.vy * dt;
      if (d < 14 && T.nb >= 8) { h.st = 'confused'; h.t = 0; cb.hawkDeterred && cb.hawkDeterred(h); continue; }
      if (d < 2.4) { kill(T, 'hawk', cb); h.st = 'leave'; h.t = 0; h.caught = true; continue; }
      if (h.t > 4) { h.st = 'leave'; h.t = 0; }
    } else { // confused / leave: veer up and away
      h.vy += (-50 - h.vy) * dt * 2; h.vx += (speed + (h.st === 'confused' ? 30 : -10) - h.vx) * dt * 2;
      h.x += h.vx * dt; h.y += h.vy * dt;
      if (h.y < -20 || h.x < camX - 30 || h.x > camX + W + 40) HAWKS.splice(i, 1);
    }
  }
}
function pickStraggler() {
  let best = null, bs = 1e9;
  for (const b of F.birds) { if (!b.alive) continue; const sc = b.nb * 10 - Math.abs(b.y - F.cy) * 0.6 - (b.isLead ? -50 : 0); if (sc < bs) { bs = sc; best = b; } }
  return best;
}
