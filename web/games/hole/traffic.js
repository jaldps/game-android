// Moving life: cars follow the road graph with corner arcs and simple queueing; pedestrians walk sidewalk loops or wander parks/plazas.
import { CITY } from './config.js';
import { city } from './city.js';
import { gridMove, gridInsert, writeObject } from './objects.js';
import { rand, range, pick, chance } from './rng.js';

const LANE = CITY.ROAD * 0.25;
const HALFR = CITY.ROAD * 0.5;

function laneStart(a, b) { // point where the car leaves intersection a heading to b
  const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
  const rx = -dz, rz = dx; // driver's right
  return { x: a.x + dx * HALFR + rx * LANE, z: a.z + dz * HALFR + rz * LANE, dx, dz };
}
function laneEnd(a, b) {
  const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
  const rx = -dz, rz = dx;
  return { x: b.x - dx * HALFR + rx * LANE, z: b.z - dz * HALFR + rz * LANE, dx, dz };
}
const edgeKey = (a, b) => a.i + a.j * 64 + (b.i + b.j * 64) * 4096;
const occupancy = new Map(); // edge -> array of cars

function segLen() { return CITY.PITCH - CITY.ROAD; }

export function updateCars(dt, holes) {
  occupancy.clear();
  for (const c of city.cars) { if (c.state !== 0) continue; const d = c.drive; if (!d.turn) { const k = edgeKey(d.a, d.b); let arr = occupancy.get(k); if (!arr) occupancy.set(k, arr = []); arr.push(c); } }
  for (const c of city.cars) {
    if (c.state !== 0) continue;
    const d = c.drive;
    let v = d.speed;
    if (!d.turn) {
      // queue behind the car ahead on the same edge
      const arr = occupancy.get(edgeKey(d.a, d.b));
      for (const o of arr) if (o !== c && o.drive.s > d.s && o.drive.s - d.s < (o.drive.len + d.len) * 0.5 + 1.6) { v = 0; break; }
      // brake for nearby big holes (panic swerve feel): slow when the road ahead is a hole
      d.cur += (v - d.cur) * Math.min(1, dt * 3);
      d.s += d.cur * dt;
      const L = segLen();
      if (d.s >= L) {
        // choose next node
        const opts = d.b.nb.filter(n => n !== d.a);
        const nxt = opts.length ? pick(opts) : d.a;
        const p0 = laneEnd(d.a, d.b), p2 = laneStart(d.b, nxt);
        // control point: intersection of lane lines
        let cx, cz;
        if (p0.dx !== 0 && p2.dz !== 0) { cx = p2.x; cz = p0.z; } else if (p0.dz !== 0 && p2.dx !== 0) { cx = p0.x; cz = p2.z; } else { cx = (p0.x + p2.x) / 2; cz = (p0.z + p2.z) / 2; }
        const len = Math.hypot(cx - p0.x, cz - p0.z) + Math.hypot(p2.x - cx, p2.z - cz);
        d.turn = { p0, cx, cz, p2, t: 0, len: Math.max(1, len), nxt };
      } else {
        const p0 = laneStart(d.a, d.b);
        c.x = p0.x + p0.dx * d.s; c.z = p0.z + p0.dz * d.s; c.yaw = Math.atan2(p0.dx, p0.dz);
      }
    }
    if (d.turn) {
      const tr = d.turn;
      tr.t += d.cur * dt / tr.len * 0.95;
      if (tr.t >= 1) { d.a = d.b; d.b = tr.nxt; d.s = 0; d.turn = null; const p0 = laneStart(d.a, d.b); c.x = p0.x; c.z = p0.z; c.yaw = Math.atan2(p0.dx, p0.dz); }
      else {
        const t = tr.t, u = 1 - t;
        const x = u * u * tr.p0.x + 2 * u * t * tr.cx + t * t * tr.p2.x;
        const z = u * u * tr.p0.z + 2 * u * t * tr.cz + t * t * tr.p2.z;
        const tx = 2 * u * (tr.cx - tr.p0.x) + 2 * t * (tr.p2.x - tr.cx), tz = 2 * u * (tr.cz - tr.p0.z) + 2 * t * (tr.p2.z - tr.cz);
        c.x = x; c.z = z; if (tx * tx + tz * tz > 1e-6) c.yaw = Math.atan2(tx, tz);
      }
    }
    gridMove(c); c.dirty = true;
  }
}

function loopPos(w) {
  const b = w.b; const inset = w.inset; const side = CITY.BLOCK - 2 * inset; const per = side * 4;
  let s = ((w.s % per) + per) % per;
  const x0 = b.x0 + inset, z0 = b.z0 + inset;
  let x, z, dx, dz;
  if (s < side) { x = x0 + s; z = z0; dx = 1; dz = 0; }
  else if (s < 2 * side) { x = x0 + side; z = z0 + (s - side); dx = 0; dz = 1; }
  else if (s < 3 * side) { x = x0 + side - (s - 2 * side); z = z0 + side; dx = -1; dz = 0; }
  else { x = x0; z = z0 + side - (s - 3 * side); dx = 0; dz = -1; }
  return [x, z, dx * w.dir, dz * w.dir];
}

export function updatePeds(dt, time) {
  for (const p of city.peds) {
    if (p.state !== 0) continue;
    const w = p.walk;
    if (w.mode === 'loop') {
      w.s += w.speed * w.dir * dt;
      const [x, z, dx, dz] = loopPos(w);
      p.x = x; p.z = z;
      const ty = Math.atan2(dx, dz); let dy = ty - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * Math.min(1, dt * 10);
      if (p.animSpd !== w.speed * 5.2) { p.animSpd = w.speed * 5.2; p.parts[0].pool.setAttr('aAnim', p.parts[0].id, p.parts[0].ph ?? (p.parts[0].ph = rand() * 6.28), 0, p.animSpd); }
    } else {
      if (w.idle > 0) {
        w.idle -= dt;
        if (p.animSpd !== 0) { p.animSpd = 0; p.parts[0].pool.setAttr('aAnim', p.parts[0].id, 0, 0, 0); }
        if (w.idle <= 0) { w.tx = w.b.cx + range(-w.wanderR, w.wanderR); w.tz = w.b.cz + range(-w.wanderR, w.wanderR); }
      } else {
        const dx = w.tx - p.x, dz = w.tz - p.z; const dd = Math.hypot(dx, dz);
        if (dd < 0.3) { w.idle = range(0.5, 3.5); }
        else {
          p.x += dx / dd * w.speed * dt; p.z += dz / dd * w.speed * dt;
          const ty = Math.atan2(dx, dz); let dy = ty - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * Math.min(1, dt * 8);
          if (p.animSpd !== w.speed * 5.2) { p.animSpd = w.speed * 5.2; p.parts[0].pool.setAttr('aAnim', p.parts[0].id, rand() * 6.28, 0, p.animSpd); }
        }
      }
    }
    gridMove(p); p.dirty = true;
  }
}

// Recycle eaten pedestrians / cars so the streets stay alive.
export function respawnLife(holes, dt) {
  const far = (x, z) => { for (const h of holes) if (h.alive && Math.hypot(h.x - x, h.z - z) < h.r + 22) return false; return true; };
  let alive = 0; for (const p of city.peds) if (p.state === 0) alive++;
  if (alive < city.pedTarget * 0.8) {
    const p = city.peds.find(o => o.state === 2);
    if (p) {
      const b = pick(city.blocks);
      if (far(b.cx, b.cz)) {
        p.state = 0; p.fall = null; p.q.identity(); p.y = 0; p.lean = 0; p.animSpd = -1;
        p.walk = { mode: 'loop', b, inset: range(1.0, CITY.WALK - 0.5), s: rand() * 80, dir: chance(0.5) ? 1 : -1, speed: range(1.1, 1.7) };
        p.base = CITY.CURB_H; p.parts[0].pool.setAttr('aAnim', p.parts[0].id, rand() * 6, 0, 6);
        const [x, z] = loopPos(p.walk); p.x = x; p.z = z; gridInsert(p); writeObject(p);
      }
    }
  }
  let carsAlive = 0; for (const c of city.cars) if (c.state === 0) carsAlive++;
  if (carsAlive < city.carTarget * 0.7) {
    const c = city.cars.find(o => o.state === 2 && o.type !== 'bus' && o.type !== 'truck');
    if (c) {
      const a = pick(city.nodes), b = pick(a.nb);
      if (far(a.x, a.z)) {
        c.state = 0; c.fall = null; c.q.identity(); c.y = 0; c.lean = 0;
        c.drive.a = a; c.drive.b = b; c.drive.s = 0; c.drive.turn = null; c.drive.cur = 0;
        const p0 = laneStart(a, b); c.x = p0.x; c.z = p0.z; gridInsert(c); writeObject(c);
      }
    }
  }
}
