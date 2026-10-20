// Crowd simulation: agents (SoA), teams, spatial hash, flocking/packing, recruitment, absorption, elimination.
import * as THREE from 'three';
import { GRID, SIM } from './config.js';
import { hAt, BLOCKED, W, HF_N, HF, makeField, computeField, fieldDir } from './world.js';
import { rand, range } from './rng.js';

const N = SIM.MAX;
export const A = {
  n: N,
  x: new Float32Array(N), z: new Float32Array(N), y: new Float32Array(N),
  vx: new Float32Array(N), vz: new Float32Array(N),
  team: new Int16Array(N).fill(-2),      // -2 free slot, -1 neutral, >=0 team id
  leader: new Uint8Array(N),
  phase: new Float32Array(N), yaw: new Float32Array(N), run: new Float32Array(N),
  hop: new Float32Array(N), flash: new Float32Array(N), fade: new Float32Array(N),
  wang: new Float32Array(N), wt: new Float32Array(N), idle: new Uint8Array(N),
  ct: new Float32Array(N), tch: new Uint8Array(N), ctT: new Int16Array(N).fill(-1),
  pend: new Int16Array(N).fill(-1), pendAt: new Float32Array(N),
  sx: new Float32Array(N), sz: new Float32Array(N),
};
export const teams = [];
export const S = { time: 0, neutral: 0, active: 0, events: [], fieldRR: 0, neutralTarget: SIM.NEUTRAL0, respawnAcc: 0, view: null, frozen: false };

export function crowdRadius(count) { return 0.36 * Math.sqrt(Math.max(1, count)) + 0.6; }

// ---------- setup ----------
export function resetSim() {
  A.team.fill(-2); A.leader.fill(0); A.pend.fill(-1); A.ctT.fill(-1); A.ct.fill(0); A.hop.fill(0); A.flash.fill(0); A.fade.fill(0);
  teams.length = 0; S.time = 0; S.events.length = 0; S.neutral = 0; S.respawnAcc = 0; S.fieldRR = 0;
}
function freeSlot() { for (let i = 0; i < N; i++) if (A.team[i] === -2) return i; return -1; }
let slotHint = 0;
function allocSlot() {
  for (let k = 0; k < N; k++) { const i = (slotHint + k) % N; if (A.team[i] === -2) { slotHint = i + 1; return i; } }
  return -1;
}
export function addTeam(o) {
  const id = teams.length;
  const i = allocSlot(); if (i < 0) return null;
  const t = { id, name: o.name, hex: o.color, color: new THREE.Color(o.color), isPlayer: !!o.isPlayer, leader: i, count: 1, alive: true, elimT: 0, killedBy: -1, kills: 0, recruits: 0, absorbed: 0, maxCount: 1,
    field: makeField(), fieldT: -9, vx: 0, vz: 0, inX: 0, inZ: 0, hat: o.hat || 'none', ai: null, lastHit: -9, bubble: 0, rank: 0 };
  teams.push(t);
  placeAgent(i, o.x, o.z); A.team[i] = id; A.leader[i] = 1; A.fade[i] = 0;
  return t;
}
function placeAgent(i, x, z) {
  A.x[i] = x; A.z[i] = z; A.y[i] = Math.max(0, hAt(x, z)); A.vx[i] = 0; A.vz[i] = 0;
  A.phase[i] = rand() * 6.28; A.yaw[i] = rand() * 6.28; A.run[i] = 0; A.hop[i] = 0; A.flash[i] = 0;
  A.wang[i] = rand() * 6.28; A.wt[i] = range(0.5, 4); A.idle[i] = rand() < 0.25 ? 1 : 0; A.ct[i] = 0; A.ctT[i] = -1; A.pend[i] = -1; A.leader[i] = 0;
}
export function spawnNeutral(avoid) {
  const cells = W.spawnCells; if (!cells.length) return -1;
  for (let tries = 0; tries < 12; tries++) {
    const k = cells[(rand() * cells.length) | 0];
    const x = -GRID.HALF + ((k % HF_N) + 0.5) * 0.5 + range(-0.4, 0.4), z = -GRID.HALF + (((k / HF_N) | 0) + 0.5) * 0.5 + range(-0.4, 0.4);
    if (hAt(x, z) >= BLOCKED) continue;
    if (avoid) {
      let bad = false;
      for (const t of teams) { if (!t.alive) continue; const L = t.leader; const r = crowdRadius(t.count) + 6; if ((A.x[L] - x) ** 2 + (A.z[L] - z) ** 2 < r * r) { bad = true; break; } }
      if (!bad && S.view && x > S.view.x0 && x < S.view.x1 && z > S.view.z0 && z < S.view.z1) bad = true;
      if (bad) continue;
    }
    const i = allocSlot(); if (i < 0) return -1;
    placeAgent(i, x, z); A.team[i] = -1; A.fade[i] = avoid ? 1 : 0; S.neutral++;
    return i;
  }
  return -1;
}
export function spawnNeutrals(n) { for (let k = 0; k < n; k++) spawnNeutral(false); }
// give a team followers immediately (used for warp/menus)
export function seedFollowers(t, n) {
  const L = t.leader;
  for (let k = 0; k < n; k++) {
    const i = allocSlot(); if (i < 0) return;
    const a = rand() * 6.28, r = Math.sqrt(rand()) * crowdRadius(t.count + n);
    let x = A.x[L] + Math.cos(a) * r, z = A.z[L] + Math.sin(a) * r;
    if (hAt(x, z) >= BLOCKED) { x = A.x[L] + range(-0.5, 0.5); z = A.z[L] + range(-0.5, 0.5); }
    placeAgent(i, x, z); A.team[i] = t.id; t.count++;
  }
  t.maxCount = Math.max(t.maxCount, t.count);
}

// ---------- spatial hash ----------
const CS = 1.0, GN = Math.ceil(GRID.SPAN / CS) + 2, G0 = -GRID.HALF - CS;
const cellStart = new Int32Array(GN * GN + 1), cellItems = new Int32Array(N), cellOf = new Int32Array(N);
function buildHash() {
  cellStart.fill(0);
  for (let i = 0; i < N; i++) {
    if (A.team[i] === -2) { cellOf[i] = -1; continue; }
    let cx = ((A.x[i] - G0) / CS) | 0, cz = ((A.z[i] - G0) / CS) | 0;
    cx = cx < 0 ? 0 : cx >= GN ? GN - 1 : cx; cz = cz < 0 ? 0 : cz >= GN ? GN - 1 : cz;
    const c = cz * GN + cx; cellOf[i] = c; cellStart[c + 1]++;
  }
  for (let c = 0; c < GN * GN; c++) cellStart[c + 1] += cellStart[c];
  const fill = cellFill; fill.set(cellStart.subarray(0, GN * GN));
  for (let i = 0; i < N; i++) { const c = cellOf[i]; if (c >= 0) cellItems[fill[c]++] = i; }
}
const cellFill = new Int32Array(GN * GN);
// query helper: iterate agents near (x,z) within radius r -> callback(i, d2)
export function forNear(x, z, r, cb) {
  const c0 = Math.max(0, ((x - r - G0) / CS) | 0), c1 = Math.min(GN - 1, ((x + r - G0) / CS) | 0);
  const r0 = Math.max(0, ((z - r - G0) / CS) | 0), r1 = Math.min(GN - 1, ((z + r - G0) / CS) | 0);
  for (let cz = r0; cz <= r1; cz++) for (let cx = c0; cx <= c1; cx++) {
    const c = cz * GN + cx; for (let k = cellStart[c]; k < cellStart[c + 1]; k++) { const i = cellItems[k]; const d2 = (A.x[i] - x) ** 2 + (A.z[i] - z) ** 2; if (d2 < r * r) cb(i, d2); }
  }
}

// ---------- conversion ----------
function convert(i, T, cause) {
  const old = A.team[i];
  if (old === T) return;
  if (old >= 0) { teams[old].count--; } else if (old === -1) S.neutral--;
  // fade only decays on the neutral branch of step(); a neutral recruited mid-fade-in would otherwise
  // keep fade > 0 forever and stay permanently shrunk (another route to an invisible follower).
  A.team[i] = T; A.pend[i] = -1; A.ct[i] = 0; A.ctT[i] = -1; A.fade[i] = 0;
  const t = teams[T]; t.count++; if (t.count > t.maxCount) t.maxCount = t.count;
  if (old === -1) t.recruits++; else t.absorbed++;
  A.flash[i] = 1; A.hop[i] = 1;
  S.events.push({ type: 'join', i, team: T, from: old, x: A.x[i], z: A.z[i], y: A.y[i] });
}
function eliminate(T, by) {
  const t = teams[T]; if (!t.alive) return;
  t.alive = false; t.elimT = S.time; t.killedBy = by; teams[by].kills++;
  const L = t.leader; const lx = A.x[L], lz = A.z[L];
  A.leader[L] = 0;
  convert(L, by, 'leader');
  // cascade: remaining followers flip outward from the fallen leader
  for (let i = 0; i < N; i++) if (A.team[i] === T) { const d = Math.hypot(A.x[i] - lx, A.z[i] - lz); A.pend[i] = by; A.pendAt[i] = S.time + 0.15 + d / 22 + rand() * 0.15; }
  S.events.push({ type: 'elim', team: T, by, x: lx, z: lz });
}

// ---------- step ----------
const _f = [0, 0];
export function step(dt) {
  if (!(dt > 0)) dt = 0;                 // a zero/!finite frame must never poison the sim
  const invDt = dt > 1e-6 ? 1 / dt : 0;  // never divide by dt directly (0/0 -> NaN -> NaN pose -> invisible crowd)
  S.time += dt;
  buildHash();
  const SEP = SIM.SEP, SEP2 = SEP * SEP, CON2 = SIM.CONTACT ** 2, REC2 = SIM.RECRUIT ** 2;
  A.sx.fill(0); A.sz.fill(0);
  // neighbour pass
  for (let i = 0; i < N; i++) {
    const ti = A.team[i]; if (ti === -2) continue;
    const xi = A.x[i], zi = A.z[i], yi = A.y[i];
    const c = cellOf[i]; const cx = c % GN, cz = (c / GN) | 0;
    for (let dz = -1; dz <= 1; dz++) {
      const rz = cz + dz; if (rz < 0 || rz >= GN) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const rx = cx + dx; if (rx < 0 || rx >= GN) continue;
        const cc = rz * GN + rx;
        for (let k = cellStart[cc]; k < cellStart[cc + 1]; k++) {
          const j = cellItems[k]; if (j <= i) continue;
          const ddx = A.x[j] - xi, ddz = A.z[j] - zi; const d2 = ddx * ddx + ddz * ddz;
          if (d2 > 0.62 && d2 > REC2) continue;
          if (Math.abs(A.y[j] - yi) > 0.9) continue;     // different levels (roof vs street)
          const tj = A.team[j];
          // interactions
          if (ti !== tj) {
            if (ti === -1 && tj >= 0) { if (d2 < REC2 && A.pend[i] < 0 && teams[tj].alive) A.pend[i] = tj, A.pendAt[i] = S.time; }
            else if (tj === -1 && ti >= 0) { if (d2 < REC2 && A.pend[j] < 0 && teams[ti].alive) A.pend[j] = ti, A.pendAt[j] = S.time; }
            else if (ti >= 0 && tj >= 0 && d2 < CON2) {
              const Ti = teams[ti], Tj = teams[tj];
              if (Ti.alive && Tj.alive && Ti.count !== Tj.count) {
                const big = Ti.count > Tj.count ? ti : tj, small = big === ti ? j : i;
                if (!A.tch[small]) { A.ct[small] += dt; A.tch[small] = 1; } A.ctT[small] = big;
              } else if (Ti.alive && !Tj.alive) { A.pend[j] = ti; A.pendAt[j] = Math.min(A.pendAt[j] || 1e9, S.time); }
              else if (!Ti.alive && Tj.alive) { A.pend[i] = tj; A.pendAt[i] = Math.min(A.pendAt[i] || 1e9, S.time); }
            }
          }
          // separation (positional): leader ignores own followers' push
          if (d2 < SEP2 && d2 > 1e-6) {
            const d = Math.sqrt(d2); const ov = (SEP - d) / d * 0.5;
            let wi = 0.5, wj = 0.5;
            if (A.leader[i] && ti === tj) { wi = 0; wj = 1; } else if (A.leader[j] && ti === tj) { wi = 1; wj = 0; }
            else if (A.leader[i]) { wi = 0.15; wj = 0.85; } else if (A.leader[j]) { wi = 0.85; wj = 0.15; }
            A.sx[i] -= ddx * ov * wi * 2; A.sz[i] -= ddz * ov * wi * 2;
            A.sx[j] += ddx * ov * wj * 2; A.sz[j] += ddz * ov * wj * 2;
          }
        }
      }
    }
  }
  // resolve absorption + pending conversions
  for (let i = 0; i < N; i++) {
    const t = A.team[i]; if (t === -2) continue;
    if (A.ctT[i] >= 0) {
      const big = A.ctT[i];
      const need = A.leader[i] ? 0.32 : SIM.ABSORB_T;
      if (A.ct[i] > need && t >= 0 && teams[big].alive && teams[t].alive && teams[big].count > teams[t].count) {
        if (A.leader[i]) eliminate(t, big); else convert(i, big, 'absorb');
      }
      if (!A.tch[i]) { A.ct[i] = Math.max(0, A.ct[i] - dt * 2); if (A.ct[i] === 0) A.ctT[i] = -1; }
      A.tch[i] = 0;
    }
    const p = A.pend[i];
    if (p >= 0 && S.time >= A.pendAt[i]) {
      if (teams[p].alive) convert(i, p, A.team[i] === -1 ? 'recruit' : 'cascade');
      else { if (A.team[i] >= 0 && !teams[A.team[i]].alive) { teams[A.team[i]].count--; A.team[i] = -1; S.neutral++; } A.pend[i] = -1; }
    }
  }
  // flow fields: refresh one team per step (round-robin)
  if (teams.length) {
    S.fieldRR = (S.fieldRR + 1) % teams.length; const t = teams[S.fieldRR];
    if (t.alive && t.count > 3) { computeField(t.field, A.x[t.leader], A.z[t.leader], 70); t.fieldT = S.time; }
  }
  // movement
  const FS = SIM.FOLLOW_SPEED, LS = SIM.LEADER_SPEED;
  for (let i = 0; i < N; i++) {
    const t = A.team[i]; if (t === -2) continue;
    let dvx = 0, dvz = 0, acc = 8;
    if (A.leader[i]) {
      const T = teams[t];
      dvx = T.inX * LS; dvz = T.inZ * LS; acc = 14;
      if (S.frozen) { dvx = 0; dvz = 0; }
    } else if (t >= 0) {
      const T = teams[t]; const L = T.leader;
      const tx = A.x[L] + A.vx[L] * 0.32, tz = A.z[L] + A.vz[L] * 0.32;
      const ddx = tx - A.x[i], ddz = tz - A.z[i]; const d = Math.sqrt(ddx * ddx + ddz * ddz) + 1e-5;
      const cr = crowdRadius(T.count);
      if (d < cr + 5 || T.fieldT < 0) {
        const sp = Math.min(FS, Math.max(0, d - 0.25) * 2.6);
        dvx = ddx / d * sp; dvz = ddz / d * sp;
      } else {
        fieldDir(T.field, A.x[i], A.z[i], _f); let fx = _f[0], fz = _f[1];
        if (fx === 0 && fz === 0) { fx = ddx / d; fz = ddz / d; }
        dvx = fx * FS * 1.05; dvz = fz * FS * 1.05;
      }
      if (S.frozen) { dvx *= 0.2; dvz *= 0.2; }
    } else {
      // neutral wander
      A.wt[i] -= dt;
      if (A.wt[i] <= 0) { A.wt[i] = range(1.5, 5); A.idle[i] = rand() < 0.3 ? 1 : 0; A.wang[i] += range(-1.6, 1.6); }
      if (!A.idle[i]) { dvx = Math.cos(A.wang[i]) * SIM.NEUTRAL_SPEED; dvz = Math.sin(A.wang[i]) * SIM.NEUTRAL_SPEED; }
      acc = 3;
      if (A.fade[i] > 0) A.fade[i] = Math.max(0, A.fade[i] - dt * 1.5);
    }
    const k = Math.min(1, dt * acc);
    A.vx[i] += (dvx - A.vx[i]) * k; A.vz[i] += (dvz - A.vz[i]) * k;
    // integrate with collision (separation displacement clamped)
    let sxi = A.sx[i], szi = A.sz[i]; const sl = Math.hypot(sxi, szi); if (sl > 0.25) { sxi *= 0.25 / sl; szi *= 0.25 / sl; }
    let mx = A.vx[i] * dt + sxi * 0.9, mz = A.vz[i] * dt + szi * 0.9;
    const x0 = A.x[i], z0 = A.z[i]; const hc = hAt(x0, z0);
    let blocked = false;
    const nx = x0 + mx; if (hAt(nx, z0) - hc > SIM.STEP) { mx = 0; A.vx[i] *= -0.1; blocked = true; }
    const nz = z0 + mz; if (hAt(x0 + mx, nz) - hc > SIM.STEP) { mz = 0; A.vz[i] *= -0.1; blocked = true; }
    if (blocked && t === -1) A.wang[i] += Math.PI * (0.6 + rand() * 0.8);
    A.x[i] = x0 + mx; A.z[i] = z0 + mz;
    // height: climb instantly, fall with gravity-ish ease
    const hg = hAt(A.x[i], A.z[i]); const hy = hg >= BLOCKED ? A.y[i] : hg;
    if (hy > A.y[i]) A.y[i] = hy; else A.y[i] = Math.max(hy, A.y[i] - dt * 9);
    // anim
    const sp = Math.hypot(mx, mz) * invDt;
    A.phase[i] += sp * dt * 3.4;
    if (A.phase[i] > 6283.2 || !(A.phase[i] > -6283.2)) A.phase[i] = A.phase[i] % 6.283185 || 0;  // keep float32 sin() precise, self-heal
    A.run[i] += (Math.min(1, sp / 6.5) - A.run[i]) * Math.min(1, dt * 8);
    if (sp > 0.3) { const ty = Math.atan2(mx, mz); let dy = ty - A.yaw[i]; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); A.yaw[i] += dy * Math.min(1, dt * 10); }
    if (A.hop[i] > 0) A.hop[i] = Math.max(0, A.hop[i] - dt * 3.2);
    if (A.flash[i] > 0) A.flash[i] = Math.max(0, A.flash[i] - dt * 3.5);
  }
  // team velocity cache for leaders
  for (const T of teams) { const L = T.leader; T.vx = A.vx[L]; T.vz = A.vz[L]; }
}

// neutral population upkeep (call ~every frame with dt)
export function upkeep(dt, roundFrac) {
  // target shrinks slowly over the round so the endgame is about crowd fights
  S.neutralTarget = Math.round(SIM.NEUTRAL0 * (1 - 0.28 * roundFrac));
  let active = 0; for (let i = 0; i < N; i++) if (A.team[i] !== -2) active++;
  S.active = active;
  if (S.neutral < S.neutralTarget && active < N - 50) {
    S.respawnAcc += dt * 14;
    while (S.respawnAcc >= 1) { S.respawnAcc -= 1; spawnNeutral(true); }
  }
}
export function standings() {
  const list = teams.slice();
  list.sort((a, b) => (b.alive - a.alive) || (a.alive ? b.count - a.count : b.elimT - a.elimT));
  list.forEach((t, k) => t.rank = k + 1);
  return list;
}
