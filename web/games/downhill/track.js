// Procedural downhill course: centerline samples every 1 m (horizontal arc length) with heading, curvature,
// width, bank, ground profile (jumps, drops, rollers, bridges, stairs...), racing line and safe-speed profile.
// Lateral coordinate u: positive = rider's right. right(θ) = (-cosθ, sinθ) in xz; forward = (sinθ, cosθ).
import { mulberry, smoothstep, clamp } from './rng.js';
import { BIOMES, TUNE } from './config.js';

function smoothArr(a, win, passes = 2) {
  const n = a.length; let src = a, out = new Float32Array(n); const h = win >> 1;
  for (let p = 0; p < passes; p++) {
    let acc = 0;
    for (let i = -h; i <= h; i++) acc += src[clamp(i, 0, n - 1)];
    for (let i = 0; i < n; i++) { out[i] = acc / (2 * h + 1); acc += src[Math.min(n - 1, i + h + 1)] - src[Math.max(0, i - h)]; }
    src = out; out = new Float32Array(n);
  }
  return src;
}

export function buildTrack(course) {
  const bio = BIOMES[course.biome];
  for (let attempt = 0; attempt < 80; attempt++) {
    const t = tryBuild(course, bio, course.seed * 977 + attempt * 7919);
    if (t) { t.attempt = attempt; return t; }
  }
  throw new Error('track generation failed');
}

function tryBuild(course, bio, seed) {
  const R = mulberry(seed), rr = (a, b) => a + (b - a) * R();
  const N = course.len + 1;
  const W0 = bio.width;
  const kRaw = new Float32Array(N), gRaw = new Float32Array(N), wRaw = new Float32Array(N).fill(W0);
  let i = 0, h = 0, lastSwitch = -9999, lastFlat = 0;
  const [g0, g1] = bio.grade;
  const seg = (len, k, g, w = W0) => { len = Math.round(len); for (let j = 0; j < len && i < N; j++, i++) { kRaw[i] = k; gRaw[i] = g; wRaw[i] = w; h += k; } };
  const turnTo = (target, radius, g, w) => { const ang = target - h; const len = Math.max(6, Math.abs(ang) * radius); seg(len, ang / Math.round(len), g, w); };
  const tight = course.biome === 'village';

  seg(30, 0, -0.03, W0 + 3.5); // start area
  seg(26, 0, g1 * 0.9);
  const endPlan = N - 150;
  while (i < endPlan) {
    if (Math.abs(h) > 0.95) { turnTo(rr(-0.25, 0.25), rr(26, 40), rr(g0, g1)); seg(rr(15, 30), 0, rr(g0, g1)); continue; }
    const r = R(); const left = endPlan - i;
    if (r < 0.12 && i - lastSwitch > 380 && left > 300 && i > 140) {
      const side = h >= 0 ? 1 : -1, n = 2; let dir = side;
      turnTo(dir * 1.35, 24, g0 * 0.8);
      seg(rr(40, 55), 0, g0 * 0.9);
      for (let k = 0; k < n; k++) {
        dir = -dir;
        turnTo(dir * 1.35, rr(15.5, 17.5), g0 * 0.6, W0 + 0.8);
        seg(k === n - 1 ? rr(26, 36) : rr(44, 56), 0, rr(g0, g1));
      }
      turnTo(0, 26, g1);
      lastSwitch = i;
    } else if (r < 0.2 && i - lastFlat > 300) {
      seg(rr(28, 40), rr(-0.006, 0.006), rr(-0.03, -0.06)); lastFlat = i;
    } else if (r < 0.42) {
      seg(rr(40, 80), 0, rr(g0 * 1.1, g1 * 1.15));
    } else if (r < 0.62) {
      const a = rr(0.45, 0.85) * (R() < 0.5 ? 1 : -1), rad = tight ? rr(16, 24) : rr(19, 32);
      turnTo(clamp(h + a, -1, 1), rad, rr(g0, g1));
      turnTo(clamp(h - 2 * a, -1, 1), rad, rr(g0, g1));
      seg(rr(10, 20), 0, rr(g0, g1));
    } else {
      let a = rr(0.35, 1.1) * (R() < 0.5 ? 1 : -1);
      if (Math.abs(h + a) > 1.1) a = -a;
      turnTo(h + a, tight ? rr(16, 30) : rr(18, 46), rr(g0, g1));
      seg(rr(8, 24), 0, rr(g0, g1));
    }
  }
  turnTo(h * 0.3, 40, g1);
  const rem = N - i; seg(Math.max(0, rem - 60), 0, g0);
  seg(N - i, 0, -0.02, W0 + 4);

  const K = smoothArr(kRaw, 13), G = smoothArr(gRaw, 25), W = smoothArr(wRaw, 9);
  const X = new Float32Array(N), Z = new Float32Array(N), TH = new Float32Array(N), Y = new Float32Array(N);
  let x = 0, z = 0, hh = 0, y = 0;
  for (let j = 0; j < N; j++) { X[j] = x; Z[j] = z; TH[j] = hh; Y[j] = y; hh += K[j]; x += Math.sin(hh); z += Math.cos(hh); y += G[j]; }
  // non-adjacent sections must stay apart (terrain shoulders + scenery need room)
  for (let a = 0; a < N; a += 3) for (let b = a + 75; b < N; b += 3) {
    const dx = X[a] - X[b], dz = Z[a] - Z[b];
    if (dx * dx + dz * dz < 27 * 27) return null;
  }

  // ---------- features ----------
  const GOFF = new Float32Array(N);  // dirt/ground profile offset (terrain + ribbon + physics)
  const feats = []; const busy = new Uint8Array(N);
  const straight = (s0, len, lim) => { for (let j = s0; j < s0 + len; j++) if (j >= N || Math.abs(K[j]) > lim || busy[j]) return false; return true; };
  const reserve = (s0, len, pad = 20) => { for (let j = Math.max(0, s0 - pad); j < Math.min(N, s0 + len + pad); j++) busy[j] = 1; };
  const place = (len, lim, fn, tries = 90) => {
    for (let t = 0; t < tries; t++) {
      const s0 = Math.floor(rr(80, N - 170 - len));
      if (straight(s0, len, lim)) { reserve(s0, len); fn(s0); return true; }
    }
    return false;
  };
  const tw = j => W[j] * 0.5;
  const weights = {
    pine: { table: 3, kicker: 3, rollers: 2, rocks: 2, roots: 2, bridge: 1, drop: 1, gap: 1 },
    village: { stairs: 4, kicker: 3, drop: 2, rollers: 1, table: 1 },
    desert: { table: 3, gap: 2, kicker: 3, drop: 2, rocks: 2, bridge: 1, rollers: 1 },
    autumn: { roots: 3, table: 2, kicker: 3, bridge: 2, drop: 1, rollers: 2, rocks: 1 },
  }[course.biome];
  const bag = []; for (const k in weights) for (let n = 0; n < weights[k]; n++) bag.push(k);
  const count = Math.round(N / 75 * course.feat);
  const plan = [];
  // guarantee variety: one of each first, then random
  for (const k in weights) plan.push(k);
  while (plan.length < count) plan.push(bag[Math.floor(R() * bag.length)]);
  const recover = (s0, D, len) => { for (let u = 0; u < len && s0 + u < N; u++) GOFF[s0 + u] -= D * (1 - u / len); }; // offset -D fading back to 0

  for (const f of plan) {
    if (f === 'table') place(24, 0.012, s0 => {
      const H = rr(1.25, 1.7), a = 6, tb = 3.5, ld = 11;
      for (let u = 0; u < a + tb + ld; u++) { const t = u < a ? H * Math.pow(u / a, 1.6) : u < a + tb ? H : H * 0.5 * (1 + Math.cos(Math.PI * (u - a - tb) / ld)); GOFF[s0 + u] += t; }
      feats.push({ type: 'table', s0, s1: s0 + a + tb + ld, lip: s0 + a, H });
    });
    else if (f === 'gap') place(28, 0.01, s0 => {
      const H = 1.7, a = 6, d1 = 1.5, gap = 4, face = 3, ld = 11, D = 1.3, L2 = 0.9, tot = a + d1 + gap + face + ld;
      for (let u = 0; u <= tot; u++) {
        let o;
        if (u < a) o = H * Math.pow(u / a, 1.6);
        else if (u < a + d1) o = H + (-D - H) * smoothstep(0, 1, (u - a) / d1);
        else if (u < a + d1 + gap) o = -D;
        else if (u < a + d1 + gap + face) o = -D + (L2 + D) * smoothstep(0, 1, (u - a - d1 - gap) / face);
        else o = L2 * 0.5 * (1 + Math.cos(Math.PI * (u - a - d1 - gap - face) / ld));
        GOFF[s0 + u] += o;
      }
      feats.push({ type: 'gap', s0, s1: s0 + tot, lip: s0 + a, H });
    });
    else if (f === 'drop') place(18, 0.015, s0 => {
      const D = rr(1.3, 1.9);
      for (let u = 0; u < 6; u++) GOFF[s0 + u] += u < 4 ? 0.35 * Math.pow(u / 4, 2) : 0.35 + (-D - 0.35) * smoothstep(0, 1, (u - 4) / 1.5);
      recover(s0 + 6, D, 40);
      feats.push({ type: 'drop', s0, s1: s0 + 6, lip: s0 + 4, H: D });
    });
    else if (f === 'rollers') place(30, 0.02, s0 => {
      const n = 3 + Math.floor(R() * 2), P = 7, A = rr(0.45, 0.65);
      for (let u = 0; u < n * P; u++) GOFF[s0 + u] += A * 0.5 * (1 - Math.cos(2 * Math.PI * u / P));
      feats.push({ type: 'rollers', s0, s1: s0 + n * P, n, P, A });
    });
    else if (f === 'kicker') place(10, 0.02, s0 => {
      const side = R() < 0.3 ? 0 : (R() < 0.5 ? -1 : 1);
      const half = 1.05, u0 = side * Math.max(0, tw(s0) - half - 0.35);
      feats.push({ type: 'kicker', s0, s1: s0 + 4, lip: s0 + 4, H: rr(1.0, 1.25), len: 4, u0, half });
    });
    else if (f === 'rocks') place(20, 0.03, s0 => {
      const rocks = []; const n = 2 + Math.floor(R() * 2);
      for (let k = 0; k < n; k++) { const s = s0 + 3 + k * (14 / n) + rr(-1, 1); const u = rr(-tw(s0) + 0.7, tw(s0) - 0.7); rocks.push({ s, u, r: rr(0.45, 0.6) }); }
      for (let u = 0; u < 20; u++) GOFF[s0 + u] += 0.06 * Math.sin(u * 2.3) * Math.sin(u * 0.7);
      feats.push({ type: 'rocks', s0, s1: s0 + 20, rocks });
    });
    else if (f === 'roots') place(16, 0.035, s0 => {
      const bars = []; for (let u = 1; u < 16; u += rr(1.4, 3)) bars.push({ s: s0 + u, a: rr(-0.5, 0.5) });
      feats.push({ type: 'roots', s0, s1: s0 + 16, bars });
    });
    else if (f === 'bridge') place(30, 0.006, s0 => {
      const L = Math.round(rr(16, 22)), dip = rr(2.8, 3.6);
      for (let u = 0; u <= L + 6; u++) { const t = Math.min(smoothstep(0, 4, u - 1), smoothstep(0, 4, L + 5 - u)); GOFF[s0 + u] -= dip * t; }
      feats.push({ type: 'bridge', s0: s0 + 1, s1: s0 + L + 5, deck: [s0 + 1, s0 + L + 5], dip });
    });
    else if (f === 'stairs') place(16, 0.02, s0 => {
      const L = Math.round(rr(7, 11)), D = rr(1.4, 2.2);
      for (let u = 0; u < L; u++) GOFF[s0 + u] += -D * (u / L);
      recover(s0 + L, D, 34);
      feats.push({ type: 'stairs', s0, s1: s0 + L, D, steps: Math.round(D / 0.22) });
    });
  }
  feats.sort((a, b) => a.s0 - b.s0);
  // per-sample feature lookup (for lateral-dependent physics: kickers, bridges, stairs)
  const FI = new Int16Array(N).fill(-1);
  feats.forEach((f, k) => { for (let j = Math.max(0, Math.floor(f.s0) - 1); j <= Math.min(N - 1, Math.ceil(f.s1) + 1); j++) FI[j] = k; });

  // ---------- berms ----------
  const Ks = smoothArr(K, 9);
  const bankRaw = new Float32Array(N);
  for (let j = 0; j < N; j++) { const k = Ks[j]; const a = Math.abs(k); bankRaw[j] = a > 1 / 55 ? Math.sign(k) * clamp((a - 1 / 55) * 9, 0, 0.38) : 0; if (FI[j] >= 0) bankRaw[j] = 0; }
  const BANK = smoothArr(bankRaw, 11);

  // ---------- surface ----------
  const surf = bio.trail;

  // ---------- safe speed + racing line ----------
  const VS = new Float32Array(N), LINE = new Float32Array(N);
  const Kw = smoothArr(K, 15, 2);
  for (let j = 0; j < N; j++) { const a = Math.abs(Kw[j]) + 1e-4; VS[j] = Math.min(30, Math.sqrt((TUNE.latAcc + Math.abs(BANK[j]) * 14) / a)); }
  for (let j = N - 2; j >= 0; j--) VS[j] = Math.min(VS[j], Math.sqrt(VS[j + 1] * VS[j + 1] + 2 * 6.5));
  const Kl = smoothArr(K, 31, 2);
  for (let j = 0; j < N; j++) LINE[j] = -Math.sign(Kl[j]) * Math.min(1, Math.abs(Kl[j]) * 28) * (W[j] * 0.5 - 0.9);

  const cps = [Math.round(N * 0.25), Math.round(N * 0.5), Math.round(N * 0.75)];
  const finish = N - 40;
  const t = { N, X, Z, Y, TH, K, W, GOFF, BANK, FI, feats, VS, LINE, cps, finish, start: 14, surf, biome: course.biome, course, obstacles: [] };
  t.minX = Infinity; t.maxX = -Infinity; t.minZ = Infinity; t.maxZ = -Infinity;
  for (let j = 0; j < N; j++) { t.minX = Math.min(t.minX, X[j]); t.maxX = Math.max(t.maxX, X[j]); t.minZ = Math.min(t.minZ, Z[j]); t.maxZ = Math.max(t.maxZ, Z[j]); }
  buildHash(t);
  return t;
}

// ---------- spatial hash for nearest-centerline queries ----------
const CELL = 10;
function buildHash(t) {
  t.hx0 = Math.floor((t.minX - 200) / CELL); t.hz0 = Math.floor((t.minZ - 200) / CELL);
  t.hw = Math.ceil((t.maxX + 200) / CELL) - t.hx0 + 1; t.hh = Math.ceil((t.maxZ + 200) / CELL) - t.hz0 + 1;
  const cells = new Array(t.hw * t.hh);
  for (let j = 0; j < t.N; j++) {
    const cx = Math.floor(t.X[j] / CELL) - t.hx0, cz = Math.floor(t.Z[j] / CELL) - t.hz0;
    const k = cz * t.hw + cx; (cells[k] || (cells[k] = [])).push(j);
  }
  t.cells = cells;
}
/** nearest centerline point: writes {i, s, u, d} into out; returns false if none within maxR */
export function nearest(t, x, z, maxR, out) {
  const cx = Math.floor(x / CELL) - t.hx0, cz = Math.floor(z / CELL) - t.hz0;
  let best = -1, bd = Infinity;
  const rings = Math.ceil(maxR / CELL);
  for (let r = 0; r <= rings; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const X = cx + dx, Z = cz + dz; if (X < 0 || Z < 0 || X >= t.hw || Z >= t.hh) continue;
      const c = t.cells[Z * t.hw + X]; if (!c) continue;
      for (let q = 0; q < c.length; q++) { const j = c[q]; const ddx = t.X[j] - x, ddz = t.Z[j] - z; const d = ddx * ddx + ddz * ddz; if (d < bd) { bd = d; best = j; } }
    }
    if (best >= 0 && Math.sqrt(bd) < (r - 0.5) * CELL) break;
  }
  if (best < 0 || bd > maxR * maxR) return false;
  // refine: project on the local tangent
  const th = t.TH[best]; const fx = Math.sin(th), fz = Math.cos(th);
  const dx = x - t.X[best], dz = z - t.Z[best];
  let along = dx * fx + dz * fz;
  let s = clamp(best + along, 0, t.N - 1);
  const u = -dx * Math.cos(th) + dz * Math.sin(th);
  out.i = best; out.s = s; out.u = u; out.d = Math.abs(u);
  return true;
}

// ---------- interpolated frame queries ----------
export function frameAt(t, s, o) {
  s = clamp(s, 0, t.N - 1.001); const i = Math.floor(s), f = s - i;
  o.x = t.X[i] + (t.X[i + 1] - t.X[i]) * f;
  o.z = t.Z[i] + (t.Z[i + 1] - t.Z[i]) * f;
  o.y = t.Y[i] + (t.Y[i + 1] - t.Y[i]) * f + t.GOFF[i] + (t.GOFF[i + 1] - t.GOFF[i]) * f;
  o.th = t.TH[i] + (t.TH[i + 1] - t.TH[i]) * f;
  o.k = t.K[i] + (t.K[i + 1] - t.K[i]) * f;
  o.bank = t.BANK[i] + (t.BANK[i + 1] - t.BANK[i]) * f;
  o.w = t.W[i] + (t.W[i + 1] - t.W[i]) * f;
  return o;
}
export const trackY = (t, s) => { s = clamp(s, 0, t.N - 1.001); const i = Math.floor(s), f = s - i; return t.Y[i] + (t.Y[i + 1] - t.Y[i]) * f + t.GOFF[i] + (t.GOFF[i + 1] - t.GOFF[i]) * f; };
export const lerpArr = (A, s) => { const n = A.length; s = clamp(s, 0, n - 1.001); const i = Math.floor(s), f = s - i; return A[i] + (A[i + 1] - A[i]) * f; };

/** Extra physical height from props (kickers, bridge decks, stair steps) at (s,u). Also returns surface kind in o.kind */
export function propOffset(t, s, u, o) {
  o.kind = 0; o.wall = 0;
  const j = Math.floor(clamp(s, 0, t.N - 1)); const fi = t.FI[j]; if (fi < 0) return 0;
  const f = t.feats[fi];
  if (f.type === 'kicker') {
    if (s >= f.s0 && s <= f.s1 && Math.abs(u - f.u0) < f.half) { o.kind = 2; const q = (s - f.s0) / f.len; return f.H * Math.pow(q, 1.45); }
  } else if (f.type === 'bridge') {
    if (s >= f.deck[0] && s <= f.deck[1]) {
      const g = lerpArr(t.GOFF, s), g0 = t.GOFF[f.deck[0] - 1] || 0, g1 = t.GOFF[Math.min(t.N - 1, f.deck[1] + 1)];
      const q = (s - f.deck[0]) / (f.deck[1] - f.deck[0]); const deck = g0 + (g1 - g0) * q;
      o.kind = 2; o.wall = t.W[j] * 0.5 - 0.35; return Math.max(0, deck - g);
    }
  } else if (f.type === 'stairs') {
    if (s >= f.s0 && s < f.s1) {
      const L = f.s1 - f.s0, q = (s - f.s0) / L; const n = f.steps; const k = Math.floor(q * n);
      const stepY = -f.D * (k / n), smooth = -f.D * q; o.kind = 1; return stepY - smooth;
    }
  }
  return 0;
}
