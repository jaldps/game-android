// Gameplay layer: floor profile, obstacles (polygons, balloons, windmill blades, lantern strings,
// lightning), motes, perched strays. Pattern director spawns content ahead of the camera.
import { fbm1, hash1, noise1, clamp, smooth, lerp, segDist, mulberry32 } from './util.js';
import { LEG_LEN, LEGS } from './palette.js';

export const WATER_Y = 92.5;

function styleBlendX(x) {
  const li = Math.max(0, Math.floor(x / LEG_LEN)); const f = x - li * LEG_LEN;
  return [LEGS[li % 5].style, LEGS[(li + 1) % 5].style, smooth(LEG_LEN - 200, LEG_LEN, f)];
}
function floorStyle(st, x) {
  switch (st) {
    case 'dunes': return 91 - 5.5 * fbm1(x * 0.018, 5, 2) - 1.5 * Math.sin(x * 0.05);
    case 'canyon': { const v = fbm1(x * 0.014, 8, 2) * 3; return 93 - 3 * (Math.floor(v) + smooth(0.7, 0.95, v - Math.floor(v))); }
    case 'coast': return WATER_Y;
    case 'valley': { const v = fbm1(x * 0.02, 12, 2) * 4; return 93 - 1.8 * (Math.floor(v) + smooth(0.6, 1, v - Math.floor(v))); }
    case 'peaks': { const n = fbm1(x * 0.02, 15, 3); return 92 - 7 * Math.pow(1 - Math.abs(2 * n - 1), 1.6); }
  }
  return 92;
}
export function floorY(x) {
  const sb = styleBlendX(x); let y = floorStyle(sb[0], x);
  if (sb[2] > 0) y = lerp(y, floorStyle(sb[1], x), sb[2]);
  return y;
}
export function isWaterAt(x) { const sb = styleBlendX(x); return (sb[2] < 0.5 ? sb[0] : sb[1]) === 'coast'; }

// ---------------- state ----------------
export const LV = { obs: [], motes: [], strays: [], bolts: [], spawnX: 0, rng: mulberry32(1), tutorialSplit: false, count: 0 };

export function resetLevel(seed, startX) {
  LV.obs.length = 0; LV.motes.length = 0; LV.strays.length = 0; LV.bolts.length = 0;
  LV.rng = mulberry32(seed * 7919 + 13); LV.spawnX = startX + 150; LV.count = 0; LV.tutorialSplit = false;
}

// ---------------- polygon builders ----------------
function mkPoly(pts, kind, extra) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < pts.length; i += 2) { const x = pts[i], y = pts[i + 1]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const o = { type: 'poly', pts: new Float32Array(pts), kind, minX, maxX, minY, maxY, deco: [], ...extra };
  return o;
}
// pillar rising from the floor; profile fn(t)->half-width multiplier along height (t=0 base, 1 top)
function pillarUp(x, base, top, hw, prof, rough, seed, n = 12) {
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, y = lerp(base, top, t), w = hw * prof(t);
    const jl = (hash1(i, seed) - 0.5) * rough, jr = (hash1(i, seed + 9) - 0.5) * rough;
    L.push(x - w + jl, y); R.push(x + w + jr, y);
  }
  const pts = [];
  for (let i = 0; i < L.length; i += 2) pts.push(L[i], L[i + 1]);
  // rounded/jagged crown
  const cw = hw * prof(1);
  for (let k = 1; k < 5; k++) { const a = k / 5; pts.push(x - cw + 2 * cw * a + (hash1(k, seed + 3) - 0.5) * rough, top - Math.sin(a * Math.PI) * cw * 0.35 - (hash1(k, seed + 4)) * rough * 0.6); }
  for (let i = R.length - 2; i >= 0; i -= 2) pts.push(R[i], R[i + 1]);
  return pts;
}
// Hanging rock. The top flares into a wide slab ABOVE the frame (y<0) so it reads as an
// overhanging cliff reaching into shot, not a stick floating in open sky. The flare is keyed
// to world y, so it has always resolved to the true width by the time it enters play space.
const HANG_TOP = -17;
function flareAt(y) { const u = Math.max(0, Math.min(1, -y / 14)); return 1 + 2.7 * u * u * (3 - 2 * u); }
function pillarDown(x, top, bottom, hw, prof, rough, seed, n = 16) {
  const pts = [], W = i => { const t = i / n, y = lerp(top, bottom, t); return [hw * prof(t) * flareAt(y), y, t]; };
  pts.push(x - hw * flareAt(top) - 3, top - 2);
  for (let i = 0; i <= n; i++) { const [w, y] = W(i); pts.push(x - w + (hash1(i, seed) - 0.5) * rough * (y < 0 ? 2 : 1), y); }
  const bw = hw * prof(1);
  for (let k = 1; k < 4; k++) { const a = k / 4; pts.push(x - bw + 2 * bw * a, bottom + Math.sin(a * Math.PI) * bw * 0.5 + hash1(k, seed + 2) * rough); }
  for (let i = n; i >= 0; i--) { const [w, y] = W(i); pts.push(x + w + (hash1(i, seed + 5) - 0.5) * rough * (y < 0 ? 2 : 1), y); }
  pts.push(x + hw * flareAt(top) + 3, top - 2);
  return pts;
}
const PROF = {
  dunes: t => 1 - 0.18 * t + 0.22 * smooth(0.75, 1, t),          // sandstone, flared cap
  canyon: t => 1 - 0.25 * t + 0.15 * Math.sin(t * 9),             // wobbly hoodoo
  coast: t => 1 - 0.15 * t + (t > 0.55 ? -0.12 : 0),               // stepped sea stack
  valley: t => 0.74 + 0.3 * Math.sin(t * Math.PI * 0.75) - 0.62 * t * t, // slim karst tower, flared foot
  peaks: t => 1 - 0.85 * t,                                         // sharp spire
};
const ROUGH = { dunes: 1.0, canyon: 1.3, coast: 1.8, valley: 0.7, peaks: 1.6 };
// Hanging profiles taper hard to a tip — a blunt club reads as a baseball bat, not rock.
const PROF_D = {
  dunes: t => (1 - 0.85 * t * t) * (1 - 0.1 * t) + 0.04,
  canyon: t => 1 - 0.8 * t + 0.1 * Math.sin(t * 8) * (1 - t),
  coast: t => 1 - 0.78 * t + 0.08 * Math.sin(t * 5.5) * (1 - t),
  valley: t => (1 - 0.9 * t * t * t) * (1 - 0.3 * t) + 0.03,
  peaks: t => 1 - 0.95 * t,
};

function spire(st, x, height, hw, seed) {
  const base = floorY(x) + 3;
  const pts = pillarUp(x, base, base - 3 - height, hw, PROF[st], ROUGH[st], seed);
  const o = mkPoly(pts, 'spire', { st, capTop: base - 3 - height });
  if (st === 'valley' || st === 'coast' || st === 'peaks') addTrees(o, x, base - 3 - height, hw * PROF[st](1), st, seed);
  return o;
}
function hang(st, x, len, hw, seed) {
  const pts = pillarDown(x, HANG_TOP, len, hw, PROF_D[st], ROUGH[st], seed);
  const o = mkPoly(pts, 'hang', { st });
  // a few icicles / root-tips clinging to the underside of the overhang slab
  for (let i = 0; i < 4; i++) {
    const side = i < 2 ? -1 : 1, k = (i % 2);
    o.deco.push({ k: 'drip', x: x + side * hw * (1.5 + k * 1.1 + hash1(i, seed + 31) * 0.5), y: -2.5 + hash1(i, seed + 32) * 2.5, l: 2 + hash1(i, seed + 33) * 5 });
  }
  return o;
}
function arch(st, x, w, top, holeTop, seed) {
  const base = floorY(x) + 3, legW = w * 0.24, r = ROUGH[st] * 0.6;
  const pts = [];
  const xl = x - w / 2, xr = x + w / 2;
  // outer left leg up
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(xl + t * 1.2 + (hash1(i, seed) - 0.5) * r, lerp(base, top + 4, t)); }
  // top lintel (rounded)
  for (let i = 1; i < 10; i++) { const a = i / 10; pts.push(lerp(xl + 1.2, xr - 1.2, a), top + 4 - Math.sin(a * Math.PI) * 4 + (hash1(i, seed + 1) - 0.5) * r); }
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(xr - 1.2 + t * 1.2 + (hash1(i, seed + 2) - 0.5) * r, lerp(top + 4, base, t)); }
  // inner right leg up, hole arc, inner left leg down
  pts.push(xr - legW, base);
  const ix0 = xr - legW, ix1 = xl + legW, springY = holeTop + (ix0 - ix1) * 0.5;
  for (let i = 0; i <= 4; i++) pts.push(ix0 + (hash1(i, seed + 3) - 0.5) * r * 0.5, lerp(base, springY, i / 4));
  for (let i = 1; i < 12; i++) { const a = i / 12 * Math.PI; pts.push((ix0 + ix1) / 2 + Math.cos(a) * (ix0 - ix1) / 2, springY - Math.sin(a) * (springY - holeTop)); }
  for (let i = 4; i >= 0; i--) pts.push(ix1 + (hash1(i, seed + 4) - 0.5) * r * 0.5, lerp(base, springY, i / 4));
  pts.push(xl + legW, base);
  const o = mkPoly(pts, 'arch', { st, hole: { x0: ix1, x1: ix0, y0: holeTop, y1: base - 2 }, capTop: top });
  return o;
}
function island(st, x, y, w, seed) {
  // flat-ish grassy top, jagged hanging underside
  const pts = []; const hw = w / 2;
  for (let i = 0; i <= 8; i++) { const a = i / 8; pts.push(x - hw + a * w, y - 1.2 * Math.sin(a * Math.PI) - hash1(i, seed) * 0.8); }
  const depth = w * (0.75 + hash1(1, seed) * 0.3);
  for (let i = 1; i < 12; i++) {
    const a = 1 - i / 12; const px = x - hw + a * w; const env = Math.sin(a * Math.PI);
    pts.push(px + (hash1(i, seed + 7) - 0.5) * 2, y + 1.5 + env * env * depth * (0.7 + 0.3 * hash1(i, seed + 8)) * (i % 2 ? 1 : 0.82));
  }
  const o = mkPoly(pts, 'island', { st, capTop: y - 1.5 });
  addTrees(o, x, y - 0.4, hw * 0.85, st, seed);
  // hanging roots/vines
  for (let i = 0; i < 5; i++) o.deco.push({ k: 'vine', x: x - hw * 0.7 + i * hw * 0.35 + hash1(i, seed + 11) * 2, y: y + 2 + hash1(i, seed + 12) * 3, l: 3 + hash1(i, seed + 13) * 6 });
  return o;
}
function mesa(st, x, w, h, seed) {
  const base = floorY(x) + 3, top = base - h, pts = [];
  pts.push(x - w / 2 - 3, base);
  for (let i = 1; i <= 5; i++) pts.push(x - w / 2 - 3 + i * 0.5 + (hash1(i, seed) - 0.5) * 1.2, lerp(base, top + 2, i / 5));
  pts.push(x - w / 2 + 1, top);
  for (let i = 1; i < 8; i++) pts.push(x - w / 2 + 1 + (w - 2) * i / 8, top - (hash1(i, seed + 1)) * 0.9);
  pts.push(x + w / 2 - 1, top);
  for (let i = 5; i >= 1; i--) pts.push(x + w / 2 + 3 - i * 0.5 + (hash1(i, seed + 2) - 0.5) * 1.2, lerp(base, top + 2, i / 5));
  pts.push(x + w / 2 + 3, base);
  const o = mkPoly(pts, 'mesa', { st, capTop: top });
  if (hash1(3, seed) > 0.4) addTrees(o, x, top, w * 0.4, st, seed);
  return o;
}
function addTrees(o, x, y, hw, st, seed) {
  const n = 1 + Math.floor(hash1(2, seed) * 3);
  const kind = st === 'peaks' ? 'pine' : st === 'valley' ? 'round' : st === 'coast' ? 'pine' : st === 'canyon' ? 'cactus' : 'palm';
  for (let i = 0; i < n; i++) o.deco.push({ k: kind, x: x + (hash1(i, seed + 20) - 0.5) * hw * 1.4, y: y + 0.6, s: 0.55 + hash1(i, seed + 21) * 0.45 });
}

// ---------------- content helpers ----------------
function moteArc(x0, y0, x1, y1, lift, n) {
  for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); LV.motes.push({ x: lerp(x0, x1, t), y: lerp(y0, y1, t) - Math.sin(t * Math.PI) * lift, alive: true, ph: Math.random() * 6.28, f: 0 }); }
}
// A "river" of light: never a dead-straight row of dots — always a travelling wave so the
// line you fly reads as a drawn curve. Phase varies per call so rivers don't rhyme.
let _mphase = 0;
function moteLine(x0, y, x1, n, wave = 3.2) {
  const ph = (_mphase += 1.37), w = Math.max(1.8, wave);
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    LV.motes.push({ x: lerp(x0, x1, t), y: y + Math.sin(t * Math.PI * 1.7 + ph) * w + Math.sin(t * Math.PI * 4.3 + ph * 2) * w * 0.28, alive: true, ph: i * 0.6, f: 0 });
  }
}
function addStrays(x, y, n) { LV.strays.push({ x, y, n, taken: false, t: 0, ph: Math.random() * 6 }); }

// ---------------- director ----------------
export function difficulty(x) { const li = Math.floor(x / LEG_LEN); return Math.min(1.4, li * 0.2 + (x / LEG_LEN - li) * 0.16); }

export function spawnAhead(camX, W) {
  const R = LV.rng;
  while (LV.spawnX < camX + W + 70) {
    const x = LV.spawnX, sb = styleBlendX(x), st = sb[2] > 0.5 ? sb[1] : sb[0];
    const D = difficulty(x), li = Math.floor(x / LEG_LEN), f = x / LEG_LEN - li;
    LV.count++;
    // leg transition: a breather with a mote river
    if (f > 0.93 || f < 0.03) { moteLine(x, 40 + R() * 20, x + 50, 9, 6); LV.spawnX += 70; continue; }
    const seed = (x * 13) | 0;
    let w = pattern(st, x, D, R, seed, li);
    LV.spawnX += w + lerp(34, 22, Math.min(1, D)) + R() * 16;
  }
  // cull
  const cut = camX - 40;
  while (LV.obs.length && LV.obs[0].maxX < cut && LV.obs[0].type !== 'bolt') LV.obs.shift();
  for (let i = LV.obs.length - 1; i >= 0; i--) if (LV.obs[i].maxX < cut) LV.obs.splice(i, 1);
  for (let i = LV.motes.length - 1; i >= 0; i--) if (LV.motes[i].x < cut) LV.motes.splice(i, 1);
  for (let i = LV.strays.length - 1; i >= 0; i--) if (LV.strays[i].x < cut && (LV.strays[i].taken ? LV.strays[i].t > 3 : true)) LV.strays.splice(i, 1);
  for (let i = LV.bolts.length - 1; i >= 0; i--) if (LV.bolts[i].x < cut) LV.bolts.splice(i, 1);
}

function pattern(st, x, D, R, seed, li) {
  const O = LV.obs;
  const pool = POOLS[st];
  let tot = 0; for (const p of pool) tot += p[1] + (p[2] || 0) * D;
  let r = R() * tot, pick = pool[0][0];
  for (const p of pool) { r -= p[1] + (p[2] || 0) * D; if (r <= 0) { pick = p[0]; break; } }
  // the first split pillar in a run is a guided tutorial moment
  if (!LV.tutorialSplit && LV.count > 3 && li === 0) { pick = 'island'; LV.tutorialSplit = true; }
  const fl = floorY(x);
  switch (pick) {
    case 'spire': {
      const h = lerp(26, 52, R()) + D * 8, hw = lerp(4, 7, R());
      O.push(spire(st, x + hw, h, hw, seed));
      const top = fl - h - 6; moteArc(x - 10, top + 8, x + hw * 2 + 10, top + 8, 10, 6);
      if (R() < 0.35) addStrays(x + hw, O[O.length - 1].minY - 1.2, 3 + (R() * 4 | 0));
      return hw * 2 + 6;
    }
    case 'hang': {
      const len = lerp(30, 56, R()) + D * 6, hw = lerp(4, 7.5, R());
      O.push(hang(st, x + hw, len, hw, seed));
      moteArc(x - 8, len + 12, x + hw * 2 + 8, len + 12, -6, 5);
      return hw * 2 + 6;
    }
    case 'gate': {
      const gap = lerp(34, 25, Math.min(1, D)) + R() * 6, cy = lerp(32, 62, R()), hw = lerp(4, 6.5, R());
      O.push(hang(st, x + hw, cy - gap / 2, hw, seed));
      O.push(spire(st, x + hw + R() * 3, fl - (cy + gap / 2), hw, seed + 77));
      moteLine(x - 14, cy, x + hw * 2 + 14, 6, Math.min(1.8, gap * 0.05));
      return hw * 2 + 8;
    }
    case 'arch': {
      const w = lerp(30, 40, R()), holeTop = lerp(fl - 46, fl - 34, R()), top = holeTop - lerp(9, 14, R());
      O.push(arch(st, x + w / 2, w, top, holeTop, seed));
      moteLine(x - 10, (holeTop + fl) / 2 - 2, x + w + 10, 7, 2.2);
      if (R() < 0.6) addStrays(x + w / 2 + (R() - 0.5) * 8, top - 1.2, 4 + (R() * 4 | 0));
      return w + 6;
    }
    case 'island': {
      const w = lerp(16, 26, R()), y = lerp(36, 48, R());
      O.push(island(st, x + w / 2, y, w, seed));
      moteArc(x - 6, y - 14, x + w + 6, y - 14, 4, 5);
      moteArc(x - 6, y + w * 0.9 + 12, x + w + 6, y + w * 0.9 + 12, -4, 5);
      if (R() < 0.55) addStrays(x + w / 2, y - 1.6, 3 + (R() * 3 | 0));
      return w + 8;
    }
    case 'field': {
      let cx = x; const n = 2 + (R() * 2 | 0) + (D > 0.6 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const hw = lerp(3, 5, R()), h = lerp(16, 40, R()) + D * 6;
        O.push(spire(st, cx + hw, h, hw, seed + i * 31)); cx += hw * 2 + lerp(14, 24, R());
      }
      moteLine(x, fl - 50 - R() * 10, cx, n * 3, 4);
      return cx - x;
    }
    case 'mesa': {
      const w = lerp(26, 40, R()), h = lerp(18, 30, R());
      O.push(mesa(st, x + w / 2 + 3, w, h, seed));
      if (R() < 0.6) { const len = lerp(14, 30, R()) + D * 6; O.push(hang(st, x + w / 2 + 3, len, 5.5, seed + 3)); moteLine(x, (len + fl - h) / 2, x + w + 6, 7); }
      else moteArc(x, fl - h - 8, x + w + 6, fl - h - 8, 6, 7);
      if (R() < 0.5) addStrays(x + w / 2 + 3 + (R() - 0.5) * w * 0.5, fl - h - 1.3, 4 + (R() * 3 | 0));
      return w + 8;
    }
    case 'balloon': {
      const n = 1 + (R() * 2 | 0); let w = 0;
      for (let i = 0; i < n; i++) {
        const r = lerp(5, 7, R()), bx = x + r + i * 26, by = lerp(30, 66, R());
        O.push({ type: 'circle', kind: 'balloon', x: bx, y: by, r, vy: -lerp(1.5, 3, R()), minX: bx - r, maxX: bx + r, ph: R() * 6, col: (R() * 4) | 0 });
        w = i * 26 + r * 2;
      }
      moteLine(x - 6, lerp(24, 70, R()), x + w + 6, 6, 8);
      return w + 6;
    }
    case 'windmill': {
      const tx = x + 14, th = lerp(30, 44, R()), cy = fl - th, rr = lerp(11, 14, R());
      const pts = [tx - 3.2, fl + 3, tx - 1.8, cy, tx + 1.8, cy, tx + 3.2, fl + 3];
      const tower = mkPoly(pts, 'tower', { st });
      O.push(tower);
      O.push({ type: 'blade', kind: 'windmill', x: tx, y: cy, r: rr, n: 4, ang: R() * 6, spd: lerp(0.7, 1.3, R()) * (1 + D * 0.4), thick: 1.1, minX: tx - rr, maxX: tx + rr });
      moteArc(x, cy - rr - 8, x + 28, cy - rr - 8, 5, 6);
      return 28;
    }
    case 'lanterns': {
      const span = lerp(40, 56, R()), y0 = lerp(36, 58, R());
      const p1 = mkPoly([x - 1, fl + 3, x - 0.6, y0 - 6, x + 0.6, y0 - 6, x + 1, fl + 3], 'pole', { st });
      const p2 = mkPoly([x + span - 1, fl + 3, x + span - 0.6, y0 - 6, x + span + 0.6, y0 - 6, x + span + 1, fl + 3], 'pole', { st });
      O.push(p1, p2);
      const sag = lerp(7, 11, R()); const pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(x + span * t, y0 - 5 + Math.sin(t * Math.PI) * sag); }
      const ln = { type: 'line', kind: 'string', pts: new Float32Array(pts), thick: 0.7, minX: x, maxX: x + span, lant: [] };
      for (let i = 1; i < 8; i++) ln.lant.push(i);
      O.push(ln);
      const below = R() < 0.5;
      moteLine(x + 6, below ? y0 + sag + 10 : y0 - 16, x + span - 6, 7, 2);
      return span + 4;
    }
    case 'stacks': {
      let cx = x; const n = 2 + (R() * 2 | 0);
      for (let i = 0; i < n; i++) { const hw = lerp(4, 6, R()), h = lerp(18, 44, R()) + D * 6; O.push(spire(st, cx + hw, h, hw, seed + i * 17)); cx += hw * 2 + lerp(16, 26, R()); }
      moteLine(x, lerp(26, 40, R()), cx, n * 3, 6);
      if (R() < 0.5) { const top = O[O.length - 1]; addStrays((top.minX + top.maxX) / 2, top.minY - 1.3, 3 + (R() * 3 | 0)); }
      return cx - x;
    }
    case 'bolt': {
      // Two columns at most, spaced wide enough that a full flock slips between them.
      const n = 1 + (D > 0.65 && R() < 0.5 ? 1 : 0), gap = 38;
      for (let i = 0; i < n; i++) LV.bolts.push({ x: x + 12 + i * gap, st: 0, t: 0, seed: (R() * 1e6) | 0 });
      // a mote river straight down the safe lane between/after the columns
      moteLine(x + 12 + (n - 1) * gap * 0.5 + (n > 1 ? 0 : 20), lerp(30, 60, R()), x + 12 + (n - 1) * gap * 0.5 + (n > 1 ? 0 : 20) + 34, 7, 8);
      return n * gap + 16;
    }
    case 'river': {
      const y = lerp(28, 66, R()); moteLine(x, y, x + 50, 10, 9);
      if (R() < 0.6 && !isWaterAt(x + 25)) addStrays(x + 25, floorY(x + 25) - 1.1, 4 + (R() * 4 | 0));
      return 50;
    }
  }
  return 20;
}
// [pattern, base weight, weight added per difficulty]
const POOLS = {
  dunes: [['spire', 3], ['arch', 3], ['island', 1.5], ['balloon', 2], ['field', 1, 1], ['gate', 0.5, 2], ['river', 1.2]],
  canyon: [['mesa', 3], ['gate', 2, 2], ['hang', 2, 1], ['arch', 2], ['field', 1.5, 1], ['spire', 1.5], ['island', 1], ['river', 0.8]],
  coast: [['stacks', 3], ['bolt', 2, 1.5], ['gate', 1.5, 1.5], ['arch', 1.5], ['island', 1], ['spire', 1.5], ['river', 0.8]],
  valley: [['windmill', 2.5], ['lanterns', 2.5], ['spire', 2], ['island', 2], ['gate', 1, 1.5], ['hang', 1], ['river', 0.8]],
  peaks: [['spire', 3], ['hang', 2.5, 1], ['gate', 2, 2], ['field', 1.5, 1], ['island', 1.5], ['arch', 1], ['river', 0.6]],
};

// ---------------- dynamic update ----------------
export function updateLevel(dt, t, camX, W, speed, audio) {
  for (const o of LV.obs) {
    if (o.type === 'circle') { o.y += o.vy * dt; if (o.y < 18) o.vy = Math.abs(o.vy) * 0.6; if (o.y > 70) o.vy = -Math.abs(o.vy); }
    else if (o.type === 'blade') o.ang += o.spd * dt;
  }
  for (const b of LV.bolts) {
    if (b.st === 0 && b.x - camX < W * 0.36 + 1.25 * speed) { b.st = 1; b.t = 0; audio && audio.crackle(); }
    else if (b.st === 1) { b.t += dt; if (b.t > 1.6) { b.st = 2; b.t = 0; audio && audio.thunder(); } }
    else if (b.st === 2) { b.t += dt; if (b.t > 0.3) { b.st = 3; b.t = 0; } }
    else if (b.st === 3) b.t += dt;
  }
}

// ---------------- signed distance query ----------------
const _cp = [0, 0];
export const HIT = { d: 0, nx: 0, ny: 0, o: null };
function polyDist(o, px, py) {
  const p = o.pts, n = p.length; let best = 1e9, bx = 0, by = 0, inside = false;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const ax = p[j], ay = p[j + 1], cx = p[i], cy = p[i + 1];
    if (((ay > py) !== (cy > py)) && (px < (cx - ax) * (py - ay) / (cy - ay) + ax)) inside = !inside;
    const d = segDist(px, py, ax, ay, cx, cy, _cp); if (d < best) { best = d; bx = _cp[0]; by = _cp[1]; }
  }
  let nx = px - bx, ny = py - by; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
  if (inside) { best = -best; nx = -nx; ny = -ny; }
  _pn[0] = nx; _pn[1] = ny; return best;
}
const _pn = [0, 0];
// returns distance to nearest solid; fills HIT with outward normal. margin limits work.
export function sdf(px, py, margin = 12) {
  let best = floorY(px) - py; HIT.nx = 0; HIT.ny = -1; HIT.o = null;
  for (const o of LV.obs) {
    if (px < o.minX - margin || px > o.maxX + margin) continue;
    let d, nx, ny;
    if (o.type === 'poly') {
      if (py < o.minY - margin || py > o.maxY + margin) continue;
      d = polyDist(o, px, py); nx = _pn[0]; ny = _pn[1];
    } else if (o.type === 'circle') {
      const dx = px - o.x, dy = py - o.y, l = Math.hypot(dx, dy) || 1; d = l - o.r; nx = dx / l; ny = dy / l;
      // basket below balloon
      const bd = Math.max(Math.abs(px - o.x) - o.r * 0.25, Math.abs(py - (o.y + o.r * 1.6)) - o.r * 0.25);
      if (bd < d) { d = bd; nx = 0; ny = py > o.y + o.r * 1.6 ? 1 : -1; }
    } else if (o.type === 'blade') {
      d = 1e9;
      for (let k = 0; k < o.n; k++) {
        const a = o.ang + k * 6.2832 / o.n, ex = o.x + Math.cos(a) * o.r, ey = o.y + Math.sin(a) * o.r;
        const dd = segDist(px, py, o.x, o.y, ex, ey, _cp) - o.thick;
        if (dd < d) { d = dd; const l = Math.hypot(px - _cp[0], py - _cp[1]) || 1; nx = (px - _cp[0]) / l; ny = (py - _cp[1]) / l; }
      }
    } else if (o.type === 'line') {
      d = 1e9; const p = o.pts;
      for (let i = 0; i < p.length - 2; i += 2) {
        const dd = segDist(px, py, p[i], p[i + 1], p[i + 2], p[i + 3], _cp) - o.thick;
        if (dd < d) { d = dd; const l = Math.hypot(px - _cp[0], py - _cp[1]) || 1; nx = (px - _cp[0]) / l; ny = (py - _cp[1]) / l; }
      }
    } else continue;
    if (d < best) { best = d; HIT.nx = nx; HIT.ny = ny; HIT.o = o; }
  }
  HIT.d = best; return best;
}
// lightning column check
export function boltAt(px, py) {
  for (const b of LV.bolts) if (b.st === 2 && Math.abs(px - b.x) < 1.15 && py > 4) return b;
  return null;
}
