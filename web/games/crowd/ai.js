// Bot brains: harvest neutral clusters, chase smaller crowds, flee bigger ones. Navigation via flow fields.
import { GRID } from './config.js';
import { A, teams, crowdRadius, S } from './sim.js';
import { makeField, computeField, fieldDir } from './world.js';
import { rand, range } from './rng.js';

const DC = 12, DN = Math.ceil(GRID.SPAN / DC), D0 = -GRID.HALF;
const dens = new Float32Array(DN * DN), sumX = new Float32Array(DN * DN), sumZ = new Float32Array(DN * DN);
let densT = -9; const _o = [0, 0];
function updateDensity() {
  dens.fill(0); sumX.fill(0); sumZ.fill(0);
  for (let i = 0; i < A.n; i++) {
    if (A.team[i] !== -1) continue;
    const cx = Math.min(DN - 1, Math.max(0, ((A.x[i] - D0) / DC) | 0)), cz = Math.min(DN - 1, Math.max(0, ((A.z[i] - D0) / DC) | 0));
    const c = cz * DN + cx; dens[c]++; sumX[c] += A.x[i]; sumZ[c] += A.z[i];
  }
}

export function makeBrain(skill) {
  return { skill, t: rand() * 0.3, mode: 'harvest', gx: 0, gz: 0, field: makeField(), fieldT: -9, fgx: 1e9, fgz: 1e9, prey: -1, wobble: rand() * 6, stuck: 0, lx: 0, lz: 0, claim: -1, hesitate: 0 };
}

export function updateBrain(T, dt) {
  const B = T.ai; const L = T.leader; const x = A.x[L], z = A.z[L];
  if (S.time - densT > 0.5) { densT = S.time; updateDensity(); }
  B.t -= dt;
  if (B.t <= 0) {
    B.t = 0.25 + (1 - B.skill) * 0.45 + rand() * 0.15;
    decide(T, B, x, z);
  }
  // navigate toward goal
  let dx = B.gx - x, dz = B.gz - z; const d = Math.hypot(dx, dz);
  let mx = 0, mz = 0;
  if (B.hesitate > 0) { B.hesitate -= dt; T.inX *= 0.9; T.inZ *= 0.9; return; }
  if (d < 1.2) { mx = 0; mz = 0; B.t = Math.min(B.t, 0.05); }
  else {
    const fd = fieldDir(B.field, x, z, _o);
    if (fd > 3) { mx = _o[0]; mz = _o[1]; if (mx === 0 && mz === 0) { mx = dx / d; mz = dz / d; } }
    else { mx = dx / d; mz = dz / d; }
    // slight steering wobble so bots don't move like robots
    B.wobble += dt * 1.3; const w = Math.sin(B.wobble) * 0.18 * (1.2 - B.skill);
    const c = Math.cos(w), s = Math.sin(w); const rx = mx * c - mz * s, rz = mx * s + mz * c; mx = rx; mz = rz;
  }
  // stuck detection
  const moved = Math.hypot(x - B.lx, z - B.lz); B.lx = x; B.lz = z;
  if (moved < dt * 1.0 && d > 2) { B.stuck += dt; if (B.stuck > 1.2) { B.stuck = 0; B.fieldT = -9; B.gx = x + range(-20, 20); B.gz = z + range(-20, 20); } } else B.stuck = Math.max(0, B.stuck - dt);
  const kk = Math.min(1, dt * 10); T.inX += (mx - T.inX) * kk; T.inZ += (mz - T.inZ) * kk;
  const l = Math.hypot(T.inX, T.inZ); if (l > 1) { T.inX /= l; T.inZ /= l; }
}

function setGoal(B, gx, gz, urgent) {
  B.gx = Math.max(-GRID.HALF + 3, Math.min(GRID.HALF - 3, gx)); B.gz = Math.max(-GRID.HALF + 3, Math.min(GRID.HALF - 3, gz));
  const moved = Math.hypot(B.gx - B.fgx, B.gz - B.fgz);
  if (moved > (urgent ? 3 : 6) || S.time - B.fieldT > 1.5) { computeField(B.field, B.gx, B.gz); B.fieldT = S.time; B.fgx = B.gx; B.fgz = B.gz; }
}

function decide(T, B, x, z) {
  const my = T.count; const myR = crowdRadius(my);
  // threats & prey
  let threat = null, tD = 1e9, prey = null, pScore = 0;
  const aware = 16 + B.skill * 14;
  for (const O of teams) {
    if (O === T || !O.alive) continue;
    const ox = A.x[O.leader], oz = A.z[O.leader]; const d = Math.hypot(ox - x, oz - z); const oR = crowdRadius(O.count);
    if (O.count > my * 1.08 && d < oR + myR + aware * 0.7) { if (d < tD) { tD = d; threat = O; } }
    else if (O.count < my * 0.85 && d < aware + 22 + myR) { const sc = (O.count + 8) / (d + 10); if (sc > pScore) { pScore = sc; prey = O; } }
  }
  if (threat && B.skill > 0.3 + rand() * 0.3) {
    const ox = A.x[threat.leader], oz = A.z[threat.leader];
    let ax = x - ox, az = z - oz; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
    // pick the best of several escape directions (prefer open space with neutrals)
    let best = -1e9, bx = x + ax * 25, bz = z + az * 25;
    for (let k = -2; k <= 2; k++) {
      const a = Math.atan2(az, ax) + k * 0.55; const gx = x + Math.cos(a) * 26, gz = z + Math.sin(a) * 26;
      if (Math.abs(gx) > GRID.HALF - 6 || Math.abs(gz) > GRID.HALF - 6) continue;
      const c = cellD(gx, gz); const sc = (c >= 0 ? dens[c] : 0) - Math.abs(k) * 2;
      if (sc > best) { best = sc; bx = gx; bz = gz; }
    }
    B.mode = 'flee'; setGoal(B, bx, bz, true); return;
  }
  if (prey) {
    const L = prey.leader; const lead = 0.4 + B.skill * 0.5;
    B.mode = 'chase'; B.prey = prey.id; setGoal(B, A.x[L] + A.vx[L] * lead, A.z[L] + A.vz[L] * lead, true); return;
  }
  // harvest: best neutral cluster weighted by distance, with stickiness
  let best = -1, bs = 0;
  for (let c = 0; c < DN * DN; c++) {
    const n = dens[c]; if (n < 1) continue;
    const cx = sumX[c] / n, cz = sumZ[c] / n; const d = Math.hypot(cx - x, cz - z);
    let sc = n / (1 + d / (18 + B.skill * 10));
    if (c === B.claim) sc *= 1.35;
    // avoid clusters next to bigger crowds
    for (const O of teams) { if (O === T || !O.alive || O.count <= my) continue; const od = Math.hypot(A.x[O.leader] - cx, A.z[O.leader] - cz); if (od < 20) sc *= 0.35; }
    if (sc > bs) { bs = sc; best = c; }
  }
  if (best >= 0) {
    B.claim = best; const n = dens[best]; let gx = sumX[best] / n, gz = sumZ[best] / n;
    const d = Math.hypot(gx - x, gz - z);
    if (d < 8) { // inside the cluster: sweep through it, aim at the nearest dense side
      const a = Math.atan2(gz - z, gx - x) + Math.sin(S.time * 0.7 + B.wobble) * 0.8; gx = x + Math.cos(a) * 10; gz = z + Math.sin(a) * 10;
    }
    B.mode = 'harvest'; setGoal(B, gx, gz, false);
    if (B.skill < 0.65 && rand() < 0.03) B.hesitate = range(0.2, 0.6);
  } else { B.mode = 'roam'; setGoal(B, range(-GRID.HALF * 0.7, GRID.HALF * 0.7), range(-GRID.HALF * 0.7, GRID.HALF * 0.7), false); }
}
function cellD(x, z) { const cx = ((x - D0) / DC) | 0, cz = ((z - D0) / DC) | 0; if (cx < 0 || cz < 0 || cx >= DN || cz >= DN) return -1; return cz * DN + cx; }
