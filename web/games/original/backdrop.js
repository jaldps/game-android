// Layered parallax backdrop: sky gradient, stars, aurora, sun/moon + halo, streak clouds,
// 6 procedural silhouette layers (biome-specific terrain + props) with atmospheric mist.
import { fbm1, hash1, noise1, clamp, smooth, mix, css, lerp } from './util.js';
import { LEG_LEN, LEGS } from './palette.js';
import { glowPush } from './glow.js';

export const LAYERS = [
  { p: 0.025, base: 64, amp: 24, fr: 0.010, depth: 0.16, cw: 70 },
  { p: 0.06, base: 69, amp: 21, fr: 0.016, depth: 0.29, cw: 46 },
  { p: 0.11, base: 75, amp: 19, fr: 0.022, depth: 0.43, cw: 34 },
  { p: 0.19, base: 81, amp: 17, fr: 0.031, depth: 0.58, cw: 26 },
  { p: 0.31, base: 87, amp: 15, fr: 0.045, depth: 0.73, cw: 21 },
  { p: 0.5, base: 94, amp: 13, fr: 0.062, depth: 0.86, cw: 17 },
];
const STYLE_AMP = { dunes: 0.8, canyon: 1.0, coast: 0.55, valley: 0.9, peaks: 1.55 };

function styleH(style, u, L, i) {
  const n = fbm1(u * L.fr, 101 + i * 31, 3);
  switch (style) {
    case 'dunes': { const m = fbm1(u * L.fr * 0.7, 7 + i, 2); const c = 1 - Math.abs(Math.sin(u * L.fr * 3.1 + m * 4)); return (0.25 + 0.55 * m + 0.2 * c * c) * L.amp * 0.9; }
    case 'canyon': { const v = n * 3.2; const f = v - Math.floor(v); return ((Math.floor(v) + smooth(0.72, 0.95, f)) / 3.2) * L.amp * 1.15 + 1; }
    case 'coast': { return Math.max(0, n - 0.42) * 2.3 * L.amp + 0.5; }
    case 'valley': { const v = n * 7; const st = (Math.floor(v) + smooth(0.6, 1, v - Math.floor(v))) / 7; return (0.15 + 0.85 * st) * L.amp; }
    case 'peaks': { const r = 1 - Math.abs(2 * n - 1); const r2 = 1 - Math.abs(2 * fbm1(u * L.fr * 2.3, 55 + i, 2) - 1); return (Math.pow(r, 2.2) * 0.85 + r2 * r2 * 0.15) * L.amp; }
  }
  return 0;
}
// style + blend weight for a gameplay-equivalent distance d
function styleBlend(d) {
  const li = Math.max(0, Math.floor(d / LEG_LEN)); const f = d - li * LEG_LEN;
  const A = LEGS[li % 5].style, B = LEGS[(li + 1) % 5].style;
  return [A, B, smooth(LEG_LEN - 260, LEG_LEN + 40, f)];
}
// A layer's u advances at only L.p of the camera, so u/L.p would place a far ridge thousands of
// units — several legs — ahead, and Monsoon Coast ends up full of Lantern Valley pagodas. Style
// is instead read at the biome distance the PLAYER is at, offset by the on-screen position, so
// every layer is the same biome and the crossfade sweeps across the frame together.
let _refCam = 0;
export function setStyleRef(camX) { _refCam = camX; }
function styleDist(L, u) { return _refCam + (u - _refCam * L.p); }
export function layerHeight(i, u) {
  const L = LAYERS[i]; const d = styleDist(L, u);
  const sb = styleBlend(d);
  let h = styleH(sb[0], u, L, i) * STYLE_AMP[sb[0]];
  if (sb[2] > 0) h = lerp(h, styleH(sb[1], u, L, i) * STYLE_AMP[sb[1]], sb[2]);
  return L.base - h;
}

// ---------- props (all drawn into the current path; s = px per unit) ----------
function pRect(c, x, y, w, h) { c.rect(x, y, w, h); }
function pTreeRound(c, x, y, s, k) {
  pRect(c, x - 0.35 * s, y - 5 * s, 0.7 * s, 5.2 * s);
  c.moveTo(x + 3.2 * s, y - 6.5 * s); c.arc(x, y - 6.5 * s, 3.2 * s, 0, 6.283);
  c.moveTo(x + 2.4 * s - 1.6 * s, y - 8.6 * s); c.arc(x - 1.6 * s, y - 8.6 * s, 2.4 * s, 0, 6.283);
  c.moveTo(x + 1.6 * s + 2.2 * s, y - 7.8 * s); c.arc(x + 1.6 * s, y - 7.8 * s, 2.2 * s, 0, 6.283);
}
function pCypress(c, x, y, s, k) {
  const h = (8 + k * 6) * s;
  c.moveTo(x, y - h); c.quadraticCurveTo(x + 1.9 * s, y - h * 0.45, x + 0.8 * s, y); c.lineTo(x - 0.8 * s, y); c.quadraticCurveTo(x - 1.9 * s, y - h * 0.45, x, y - h); c.closePath();
}
function pPine(c, x, y, s, k) {
  const h = (7 + k * 5) * s; pRect(c, x - 0.3 * s, y - 1.5 * s, 0.6 * s, 1.6 * s);
  for (let j = 0; j < 4; j++) { const yy = y - 1.2 * s - j * h * 0.22, w = (2.6 - j * 0.5) * s * (0.8 + k * 0.4); c.moveTo(x - w, yy); c.lineTo(x, yy - h * 0.38); c.lineTo(x + w, yy); c.closePath(); }
}
function pPalm(c, x, y, s, k) {
  const h = (9 + k * 4) * s, lean = (k - 0.5) * 4 * s;
  c.moveTo(x - 0.45 * s, y); c.quadraticCurveTo(x + lean * 0.2, y - h * 0.6, x + lean, y - h); c.lineTo(x + lean + 0.5 * s, y - h); c.quadraticCurveTo(x + lean * 0.2 + 0.7 * s, y - h * 0.6, x + 0.45 * s, y); c.closePath();
  const tx = x + lean, ty = y - h;
  for (let j = 0; j < 6; j++) {
    const a = -Math.PI + (j / 5) * Math.PI + (j % 2 ? 0.2 : -0.1), len = (4.2 + (j % 3) * 0.6) * s;
    const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.6 + len * 0.45;
    const mx = tx + Math.cos(a) * len * 0.5, my = ty + Math.sin(a) * len * 0.5 - 0.6 * s;
    c.moveTo(tx, ty); c.quadraticCurveTo(mx, my - 0.9 * s, ex, ey); c.quadraticCurveTo(mx, my + 0.5 * s, tx, ty + 0.3 * s); c.closePath();
  }
}
function pCactus(c, x, y, s, k) {
  const h = (5 + k * 4) * s, w = 0.9 * s;
  c.moveTo(x - w / 2, y); c.lineTo(x - w / 2, y - h + w / 2); c.arc(x, y - h + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w / 2, y); c.closePath();
  const ay = y - h * (0.45 + k * 0.15), ah = h * 0.35;
  c.moveTo(x - w / 2, ay); c.lineTo(x - 2 * w, ay); c.lineTo(x - 2 * w, ay - ah + w * 0.35); c.arc(x - 1.6 * w, ay - ah + w * 0.35, w * 0.4, Math.PI, 0); c.lineTo(x - 1.2 * w, ay - w * 0.7); c.lineTo(x - w / 2, ay - w * 0.7); c.closePath();
  const by = y - h * 0.35;
  c.moveTo(x + w / 2, by); c.lineTo(x + 1.9 * w, by); c.lineTo(x + 1.9 * w, by - ah * 0.8 + w * 0.35); c.arc(x + 1.5 * w, by - ah * 0.8 + w * 0.35, w * 0.4, 0, Math.PI, true); c.lineTo(x + 1.1 * w, by - w * 0.7); c.lineTo(x + w / 2, by - w * 0.7); c.closePath();
}
function pTower(c, x, y, s, k, t, glow) {
  const w = (2.4 + k) * s, h = (9 + k * 9) * s;
  c.moveTo(x - w / 2 - 0.5 * s, y); c.lineTo(x - w / 2, y - h); for (let j = 0; j < 3; j++) { const bx = x - w / 2 + j * w / 2.5; c.lineTo(bx, y - h - 0.9 * s); c.lineTo(bx + w / 5, y - h - 0.9 * s); c.lineTo(bx + w / 5, y - h); }
  c.lineTo(x + w / 2, y - h); c.lineTo(x + w / 2 + 0.5 * s, y); c.closePath();
  // flag pole + pennant
  pRect(c, x - 0.12 * s, y - h - 5 * s, 0.24 * s, 4.2 * s);
  const wv = Math.sin(t * 3 + x) * 0.5 * s; c.moveTo(x, y - h - 5 * s); c.quadraticCurveTo(x + 2 * s, y - h - 4.9 * s + wv, x + 4 * s, y - h - 4.3 * s + wv); c.lineTo(x, y - h - 3.7 * s); c.closePath();
  if (glow) glowPush(x / glow.s, (y - h * 0.6) / glow.s, 1.5, 0.5);
}
function pArch(c, x, y, s, k) {
  const w = (10 + k * 8) * s, h = (8 + k * 7) * s, t = w * 0.22;
  c.moveTo(x - w / 2, y); c.lineTo(x - w / 2 + t * 0.2, y - h); c.quadraticCurveTo(x, y - h - 2.4 * s, x + w / 2 - t * 0.2, y - h); c.lineTo(x + w / 2, y); c.lineTo(x + w / 2 - t, y);
  c.lineTo(x + w / 2 - t, y - h * 0.55); c.quadraticCurveTo(x, y - h * 1.15 + t, x - w / 2 + t, y - h * 0.55); c.lineTo(x - w / 2 + t, y); c.closePath();
}
function pHoodoo(c, x, y, s, k) {
  let yy = y; const n = 3 + ((k * 3) | 0);
  for (let j = 0; j < n; j++) { const rw = (1.5 - j * 0.12 + Math.sin(j * 2.1 + k * 9) * 0.25) * s, rh = 1.7 * s; c.moveTo(x + rw, yy - rh / 2); c.ellipse(x, yy - rh / 2, rw, rh * 0.62, 0, 0, 6.283); yy -= rh * 0.9; }
  c.moveTo(x + 2.4 * s, yy - 0.4 * s); c.ellipse(x + 0.3 * s, yy - 0.4 * s, 2.4 * s, 0.8 * s, 0.1, 0, 6.283);
}
function pBalloon(c, x, y, s, k, t) {
  const yy = y - (14 + k * 10) * s + Math.sin(t * 0.6 + k * 20) * 1.2 * s, r = (2.2 + k * 0.6) * s;
  c.moveTo(x + r, yy); c.arc(x, yy, r, 0, Math.PI, true); c.quadraticCurveTo(x - r, yy + r * 0.9, x - r * 0.3, yy + r * 1.5); c.lineTo(x + r * 0.3, yy + r * 1.5); c.quadraticCurveTo(x + r, yy + r * 0.9, x + r, yy); c.closePath();
  pRect(c, x - r * 0.25, yy + r * 1.75, r * 0.5, r * 0.4);
}
function pPagoda(c, x, y, s, k, t, glow) {
  const tiers = 3 + ((k * 3) | 0); let yy = y, w = (4.2 + k) * s;
  pRect(c, x - w * 0.42, y - 2.2 * s, w * 0.84, 2.2 * s); yy -= 2.2 * s;
  for (let j = 0; j < tiers; j++) {
    const ew = w * 0.75; c.moveTo(x - ew - 0.9 * s, yy); c.quadraticCurveTo(x - ew * 0.4, yy - 0.3 * s, x - ew * 0.55, yy - 1.1 * s); c.lineTo(x + ew * 0.55, yy - 1.1 * s); c.quadraticCurveTo(x + ew * 0.4, yy - 0.3 * s, x + ew + 0.9 * s, yy); c.closePath();
    pRect(c, x - ew * 0.4, yy - 2.3 * s, ew * 0.8, 1.3 * s);
    if (glow && j < tiers - 1) glowPush(x / glow.s, (yy - 1.7 * s) / glow.s, 1.1, 0.8);
    yy -= 2.2 * s; w *= 0.84;
  }
  pRect(c, x - 0.12 * s, yy - 2.5 * s, 0.24 * s, 2.6 * s);
}
function pWindmill(c, x, y, s, k, t) {
  const h = (8 + k * 4) * s;
  // stone tower with a cap
  c.moveTo(x - 1.9 * s, y); c.lineTo(x - 1.0 * s, y - h); c.lineTo(x + 1.0 * s, y - h); c.lineTo(x + 1.9 * s, y); c.closePath();
  c.moveTo(x - 1.5 * s, y - h); c.quadraticCurveTo(x, y - h - 2.1 * s, x + 1.5 * s, y - h); c.closePath();
  // four solid sails, each a tapered blade with a spine — reads cleanly at any size
  const a0 = t * (0.5 + k * 0.4), cx = x, cy = y - h - 0.3 * s, L = (5 + k * 1.6) * s, W0 = 1.25 * s;
  for (let j = 0; j < 4; j++) {
    const a = a0 + j * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
    const r0 = 0.7 * s;
    c.moveTo(cx + ca * r0 - px * W0 * 0.3, cy + sa * r0 - py * W0 * 0.3);
    c.lineTo(cx + ca * L - px * W0 * 0.12, cy + sa * L - py * W0 * 0.12);
    c.lineTo(cx + ca * L + px * W0, cy + sa * L + py * W0);
    c.lineTo(cx + ca * r0 + px * W0 * 0.55, cy + sa * r0 + py * W0 * 0.55);
    c.closePath();
  }
  c.moveTo(cx + 0.75 * s, cy); c.arc(cx, cy, 0.75 * s, 0, 6.283);
}
function pHouse(c, x, y, s, k, t, glow) {
  const w = (3 + k * 2) * s, h = (2.2 + k) * s;
  pRect(c, x - w / 2, y - h, w, h);
  c.moveTo(x - w / 2 - 0.6 * s, y - h); c.lineTo(x - w * 0.15, y - h - 2.2 * s); c.lineTo(x + w * 0.15, y - h - 2.2 * s); c.lineTo(x + w / 2 + 0.6 * s, y - h); c.closePath();
  if (glow) glowPush((x - w * 0.2) / glow.s, (y - h * 0.5) / glow.s, 0.9, 0.9);
}
function pLighthouse(c, x, y, s, k, t, glow) {
  const h = 13 * s;
  c.moveTo(x - 1.5 * s, y); c.lineTo(x - 0.9 * s, y - h); c.lineTo(x + 0.9 * s, y - h); c.lineTo(x + 1.5 * s, y); c.closePath();
  pRect(c, x - 1.2 * s, y - h - 0.5 * s, 2.4 * s, 0.5 * s); pRect(c, x - 0.7 * s, y - h - 2.1 * s, 1.4 * s, 1.6 * s);
  c.moveTo(x - 1 * s, y - h - 2.1 * s); c.lineTo(x, y - h - 3.3 * s); c.lineTo(x + 1 * s, y - h - 2.1 * s); c.closePath();
  if (glow) glowPush(x / glow.s, (y - h - 1.3 * s) / glow.s, 4, 1.0);
}
function pStack(c, x, y, s, k) {
  const w = (3 + k * 3) * s, h = (6 + k * 10) * s;
  c.moveTo(x - w * 0.6, y); c.lineTo(x - w * 0.5, y - h * 0.5); c.lineTo(x - w * 0.42, y - h * 0.55); c.lineTo(x - w * 0.36, y - h); c.lineTo(x - w * 0.05, y - h - 0.8 * s); c.lineTo(x + w * 0.3, y - h * 0.94); c.lineTo(x + w * 0.4, y - h * 0.6); c.lineTo(x + w * 0.52, y - h * 0.56); c.lineTo(x + w * 0.62, y); c.closePath();
}
function pTorii(c, x, y, s, k) {
  const w = 6 * s, h = 6 * s;
  pRect(c, x - w * 0.38, y - h, 0.6 * s, h); pRect(c, x + w * 0.38 - 0.6 * s, y - h, 0.6 * s, h);
  pRect(c, x - w * 0.5, y - h * 0.8, w, 0.5 * s);
  c.moveTo(x - w * 0.62, y - h - 0.2 * s); c.quadraticCurveTo(x, y - h + 0.6 * s, x + w * 0.62, y - h - 0.2 * s); c.lineTo(x + w * 0.58, y - h - 1.0 * s); c.quadraticCurveTo(x, y - h - 0.2 * s, x - w * 0.58, y - h - 1.0 * s); c.closePath();
}
function pMonastery(c, x, y, s, k, t, glow) {
  const w = (6 + k * 4) * s;
  pRect(c, x - w / 2, y - 3 * s, w, 3.2 * s);
  pRect(c, x - w * 0.3, y - 6.5 * s, w * 0.6, 3.6 * s);
  c.moveTo(x - w * 0.36, y - 6.5 * s); c.lineTo(x, y - 9.5 * s); c.lineTo(x + w * 0.36, y - 6.5 * s); c.closePath();
  pRect(c, x - 0.1 * s, y - 11 * s, 0.2 * s, 1.8 * s);
  if (glow) { glowPush((x - w * 0.15) / glow.s, (y - 5 * s) / glow.s, 1.0, 0.8); glowPush((x + w * 0.2) / glow.s, (y - 1.5 * s) / glow.s, 1.0, 0.7); }
}

const PROPS = {
  dunes: [[pArch, 0.12, 0, 2], [pTower, 0.18, 0, 5], [pCactus, 0.25, 2, 6], [pPalm, 0.2, 3, 6], [pTreeRound, 0.12, 2, 6], [pBalloon, 0.08, 1, 3]],
  canyon: [[pHoodoo, 0.3, 1, 6], [pCactus, 0.25, 2, 6], [pTower, 0.12, 0, 4], [pArch, 0.12, 0, 4], [pTreeRound, 0.1, 3, 6]],
  coast: [[pStack, 0.38, 0, 6], [pLighthouse, 0.07, 1, 4], [pPine, 0.3, 2, 6], [pHouse, 0.12, 3, 6]],
  valley: [[pPagoda, 0.2, 0, 6], [pCypress, 0.3, 1, 6], [pWindmill, 0.12, 2, 5], [pHouse, 0.22, 3, 6], [pTorii, 0.08, 3, 6], [pTreeRound, 0.12, 2, 6]],
  peaks: [[pPine, 0.5, 2, 6], [pMonastery, 0.12, 1, 5], [pTower, 0.08, 0, 3]],
};
const GLOWY = new Set([pPagoda, pHouse, pLighthouse, pMonastery, pTower]);

function pickProp(style, h, i) {
  const list = PROPS[style]; let tot = 0;
  for (const e of list) if (i >= e[2] && i <= e[3]) tot += e[1];
  let r = h * tot;
  for (const e of list) { if (i < e[2] || i > e[3]) continue; r -= e[1]; if (r <= 0) return e[0]; }
  return null;
}

// ---------- sky ----------
const _c1 = [0, 0, 0], _c2 = [0, 0, 0], _c3 = [0, 0, 0];
let stars = null;
function initStars() {
  stars = []; for (let i = 0; i < 160; i++) stars.push({ x: hash1(i, 3), y: Math.pow(hash1(i, 9), 1.6) * 0.62, r: 0.12 + hash1(i, 5) * 0.28, p: hash1(i, 7) * 6.28 });
}

// colour of the sky gradient at normalised height v (same stops as drawSky)
function skyAt(P, v, out) {
  if (v <= 0.36) mix(P.skyTop, P.skyMid, v / 0.36, out);
  else if (v <= 0.64) mix(P.skyMid, P.skyLow, (v - 0.36) / 0.28, out);
  else mix(P.skyLow, P.fog, (v - 0.64) / 0.36, out);
  return out;
}
export function drawSky(c, V, P) {
  const { w, h, s, t } = V;
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, css(P.skyTop)); g.addColorStop(0.36, css(P.skyMid)); g.addColorStop(0.64, css(P.skyLow)); g.addColorStop(1, css(P.fog));
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // stars
  if (P.stars > 0.02) {
    if (!stars) initStars();
    c.fillStyle = '#fff';
    for (const st of stars) {
      const a = P.stars * (0.45 + 0.55 * Math.sin(t * 1.3 + st.p)) * (1 - st.y * 1.2);
      if (a <= 0.02) continue; c.globalAlpha = a;
      const x = ((st.x * w * 1.3 - V.camX * s * 0.004) % (w * 1.3) + w * 1.3) % (w * 1.3) - w * 0.15;
      const r = st.r * s * 0.55; c.fillRect(x - r, st.y * h - r, r * 2, r * 2);
    }
    c.globalAlpha = 1;
  }
  // aurora curtains
  if (P.aurora > 0.02) drawAurora(c, V, P);
  // sun / moon halo + disk
  const sx = P.sunX * w, sy = P.sunY * h, sr = P.sunR * s;
  c.globalCompositeOperation = 'lighter';
  let rg = c.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 9);
  rg.addColorStop(0, css(P.glow, 0.55)); rg.addColorStop(0.25, css(P.glow, 0.2)); rg.addColorStop(1, css(P.glow, 0));
  c.fillStyle = rg; c.fillRect(sx - sr * 9, sy - sr * 9, sr * 18, sr * 18);
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = css(P.sun, 0.96 - P.rain * 0.35); c.beginPath(); c.arc(sx, sy, sr, 0, 6.283); c.fill();
  if (P.moon > 0.05) { // crescent: overlay a disk tinted with the EXACT local sky colour
    skyAt(P, P.sunY, _c1); c.fillStyle = css(_c1, P.moon); c.beginPath(); c.arc(sx + sr * 0.5, sy - sr * 0.26, sr * 0.92, 0, 6.283); c.fill();
    // terminator softening so the dark limb isn't a hard bite
    c.globalCompositeOperation = 'lighter';
    const tg = c.createRadialGradient(sx - sr * 0.3, sy + sr * 0.2, 0, sx - sr * 0.3, sy + sr * 0.2, sr * 1.3);
    tg.addColorStop(0, css(P.sun, 0.22 * P.moon)); tg.addColorStop(1, css(P.sun, 0));
    c.fillStyle = tg; c.beginPath(); c.arc(sx, sy, sr, 0, 6.283); c.fill();
    c.globalCompositeOperation = 'source-over';
  }
  // god rays (soft wedges)
  if (P.rain < 0.6) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.translate(sx, sy);
    const ra = 0.05 * (1 - P.rain) * (1 - P.moon * 0.6);
    for (let i = 0; i < 7; i++) {
      const a = 1.2 + i * 0.37 + Math.sin(t * 0.07 + i) * 0.05; const L = h * 1.6;
      c.fillStyle = css(P.glow, ra * (0.6 + 0.4 * Math.sin(t * 0.3 + i * 2.1)));
      c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a - 0.035) * L, Math.sin(a - 0.035) * L); c.lineTo(Math.cos(a + 0.035) * L, Math.sin(a + 0.035) * L); c.closePath(); c.fill();
    }
    c.restore();
  }
}

function drawAurora(c, V, P) {
  const { w, h, s, t } = V;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let band = 0; band < 3; band++) {
    const baseY = (0.16 + band * 0.09) * h, amp = 0.05 * h;
    const col = band === 1 ? [120, 255, 200] : band === 0 ? [90, 200, 255] : [190, 120, 255];
    const g = c.createLinearGradient(0, baseY - 0.18 * h, 0, baseY + 0.06 * h);
    g.addColorStop(0, css(col, 0)); g.addColorStop(0.7, css(col, 0.16 * P.aurora)); g.addColorStop(1, css(col, 0));
    c.fillStyle = g; c.beginPath();
    const step = w / 48;
    for (let x = 0; x <= w + step; x += step) {
      const y = baseY + Math.sin(x / w * 5 + t * 0.25 + band * 2) * amp + Math.sin(x / w * 13 - t * 0.4 + band) * amp * 0.3;
      if (x === 0) c.moveTo(x, y + 0.06 * h); else c.lineTo(x, y + 0.06 * h);
    }
    for (let x = w + step; x >= 0; x -= step) {
      const y = baseY + Math.sin(x / w * 5 + t * 0.25 + band * 2) * amp + Math.sin(x / w * 13 - t * 0.4 + band) * amp * 0.3;
      c.lineTo(x, y - 0.18 * h - Math.sin(x / w * 21 + t * 0.6) * 0.03 * h);
    }
    c.closePath(); c.fill();
  }
  c.restore();
}

// Alto-style long streak clouds
export function drawClouds(c, V, P, layer) {
  const { w, h, s, camX, t } = V;
  const n = 9, par = layer === 0 ? 0.012 : 0.028;
  const a = layer === 0 ? 0.22 : 0.16;
  c.fillStyle = css(P.cloud, a + P.rain * 0.25);
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const k = i + layer * 50;
    const y = (0.08 + hash1(k, 11) * 0.42) * h;
    const len = (0.12 + hash1(k, 12) * 0.3) * w, th = (0.5 + hash1(k, 13) * 1.2) * s;
    const span = w + len + 200;
    const x = ((hash1(k, 14) * span - (camX * par + t * 0.6 * (1 + layer)) * s) % span + span) % span - len - 100;
    c.moveTo(x + th, y); c.arc(x + th, y, th, Math.PI * 0.5, Math.PI * 1.5); c.lineTo(x + len - th, y - th); c.arc(x + len - th, y, th, -Math.PI * 0.5, Math.PI * 0.5); c.closePath();
    // a second shorter streak offset below
    if (hash1(k, 15) > 0.4) { const x2 = x + len * 0.25, l2 = len * 0.55, y2 = y + th * 2.6; c.moveTo(x2 + th * 0.7, y2); c.arc(x2 + th * 0.7, y2, th * 0.7, Math.PI * 0.5, Math.PI * 1.5); c.lineTo(x2 + l2, y2 - th * 0.7); c.arc(x2 + l2, y2, th * 0.7, -Math.PI * 0.5, Math.PI * 0.5); c.closePath(); }
  }
  c.fill();
  // storm cloud masses: two soft-bottomed banks hanging off the top of the frame, lit along
  // their crowns so they read as weather rather than grey discs
  if (P.rain > 0.05 && layer === 1) {
    for (let bank = 0; bank < 2; bank++) {
      mix(P.cloud, P.near, bank ? 0.55 : 0.28, _c2);
      const span = w + 120 * s, par = bank ? 0.12 : 0.045, yb = bank ? -1 : -6, N = 30;
      c.save(); c.beginPath();
      c.rect(-2, -30 * s, w + 4, (28 + (bank ? 5 : 0)) * s);
      for (let i = 0; i < N; i++) {
        const k = i + bank * 60;
        const x = ((hash1(k, 21) * span - camX * par * s - t * (1 + bank) * s) % span + span) % span - 60 * s;
        // lumpy: a few big masses, many small puffs, so the skyline never repeats a scallop
        const big = hash1(k, 24) > 0.62;
        const r = (big ? 9 + hash1(k, 22) * 13 : 3.5 + hash1(k, 22) * 6) * s * (bank ? 0.82 : 1);
        const y = (yb + hash1(k, 23) * (big ? 7 : 11)) * s;
        c.moveTo(x + r, y); c.ellipse(x, y, r, r * (0.72 + hash1(k, 25) * 0.4), 0, 0, 6.283);
      }
      c.clip();
      const g = c.createLinearGradient(0, -12 * s, 0, 24 * s);
      g.addColorStop(0, css(_c2, 0.95 * P.rain)); g.addColorStop(0.45, css(_c2, 0.82 * P.rain));
      g.addColorStop(0.78, css(_c2, 0.3 * P.rain)); g.addColorStop(1, css(_c2, 0));
      c.fillStyle = g; c.fillRect(0, -32 * s, w, 60 * s);
      c.restore();
    }
    c.beginPath();
  }
}

// ---------- silhouette layers ----------
const _col = [0, 0, 0], _mist = [0, 0, 0], _top = [0, 0, 0];
export function drawLayer(c, V, P, i) {
  const L = LAYERS[i]; const { w, h, s, camX, t } = V;
  mix(P.fog, P.near, L.depth, _col);
  mix(_col, P.fog, 0.62, _mist);
  mix(_col, P.rim, 0.10 * (1 - L.depth * 0.5), _top);
  const u0 = camX * L.p;
  const step = Math.max(4, w / 150);
  // path: terrain + props
  c.beginPath();
  let topY = 1e9;
  c.moveTo(-2, h + 2);
  for (let x = -step; x <= w + step; x += step) {
    const y = layerHeight(i, u0 + x / s) * s; if (y < topY) topY = y; c.lineTo(x, y);
  }
  c.lineTo(w + step, h + 2); c.closePath();
  const glowCtx = (i >= 2) ? { s } : null;
  const ps = s * (0.36 + i * 0.13);
  const cw = L.cw, uL = u0 - 20, uR = u0 + w / s + 20;
  for (let ci = Math.floor(uL / cw); ci <= Math.floor(uR / cw); ci++) {
    const hh = hash1(ci, 300 + i * 13);
    if (hh > 0.62) continue;
    const u = (ci + 0.2 + hash1(ci, 400 + i) * 0.6) * cw;
    const sb = styleBlend(styleDist(L, u)); const st = sb[2] > 0.5 ? sb[1] : sb[0];
    const fn = pickProp(st, hash1(ci, 500 + i), i); if (!fn) continue;
    const x = (u - u0) * s; const y = layerHeight(i, u) * s + 0.6 * s;
    fn(c, x, y, ps, hash1(ci, 600 + i), t, (GLOWY.has(fn) && glowCtx && (P.lantern > 0.2 || P.stars > 0.5)) ? glowCtx : null);
  }
  const g = c.createLinearGradient(0, topY, 0, (L.base + 6) * s);
  g.addColorStop(0, css(_top)); g.addColorStop(0.45, css(_col)); g.addColorStop(1, css(_mist));
  c.fillStyle = g; c.fill();
  // snow caps on peaks: lighter band clipped near the ridge
  return topY;
}

// horizontal haze band between layers
export function drawHaze(c, V, P, y0, y1, a) {
  const g = c.createLinearGradient(0, y0 * V.s, 0, y1 * V.s);
  g.addColorStop(0, css(P.fog, 0)); g.addColorStop(0.6, css(P.fog, a)); g.addColorStop(1, css(P.fog, a * 0.4));
  c.fillStyle = g; c.fillRect(0, y0 * V.s, V.w, (y1 - y0) * V.s);
}
