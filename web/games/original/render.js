// Frame composition: backdrop -> gameplay layer (floor, obstacles w/ sun rim light, motes, strays,
// birds, ribbon, hawks) -> glow -> weather -> blurred foreground -> grade/vignette/grain.
import { css, mix, hash1, clamp, lerp, fbm1 } from './util.js';
import { drawSky, drawClouds, drawLayer, drawHaze } from './backdrop.js';
import { glowPush, glowFlush, glowClear } from './glow.js';
import { LV, floorY, WATER_Y, isWaterAt } from './level.js';
import { F, HAWKS } from './flock.js';
import { drawFx, drawWeather, LANT } from './fx.js';

let cv, c, fgCv, fgC, vigCv, grainPat, grainCv;
export const V = { w: 0, h: 0, s: 1, camX: 0, t: 0, W: 200, dpr: 1, shakeX: 0, shakeY: 0, quality: 1 };

export function initRender(canvas) {
  cv = canvas; c = cv.getContext('2d', { alpha: false });
  fgCv = document.createElement('canvas'); fgC = fgCv.getContext('2d');
  grainCv = document.createElement('canvas'); grainCv.width = grainCv.height = 128;
  const g = grainCv.getContext('2d'); const id = g.createImageData(128, 128);
  for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  g.putImageData(id, 0, 0); grainPat = c.createPattern(grainCv, 'repeat');
  resize();
}
export function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, V.quality ? 2 : 1.25);
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  cv.width = w; cv.height = h; V.w = w; V.h = h; V.dpr = dpr;
  // world: 100 units tall; in portrait we still show 100 units tall (narrow view) so gameplay is the same vertically
  V.s = h / 100; V.W = w / V.s;
  fgCv.width = Math.max(2, w >> 2); fgCv.height = Math.max(2, h >> 2);
  vigCv = document.createElement('canvas'); vigCv.width = 256; vigCv.height = 256;
  const vg = vigCv.getContext('2d'); const rg = vg.createRadialGradient(128, 128, 60, 128, 128, 182);
  rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(10,0,25,0.42)'); vg.fillStyle = rg; vg.fillRect(0, 0, 256, 256);
  grainPat = c.createPattern(grainCv, 'repeat');
}

const _a = [0, 0, 0], _b = [0, 0, 0], _d = [0, 0, 0], _e = [0, 0, 0];
const BALLOON = [[226, 92, 84], [244, 186, 82], [96, 160, 196], [180, 98, 170]];

export function drawFrame(P, G) {
  const { w, h, s } = V; const t = V.t;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  glowClear();
  drawSky(c, V, P);
  drawClouds(c, V, P, 0);
  drawLayer(c, V, P, 0);
  drawLayer(c, V, P, 1);
  drawHaze(c, V, P, 52, 76, 0.35);
  drawLayer(c, V, P, 2);
  drawClouds(c, V, P, 1);
  drawLayer(c, V, P, 3);
  drawHaze(c, V, P, 66, 90, 0.28);
  drawLayer(c, V, P, 4);
  if (V.quality) drawLayer(c, V, P, 5);
  drawHaze(c, V, P, 74, 100, 0.22);
  mix(P.glow, LANT, P.lantern, _e);
  glowFlush(c, s, _e);

  // ---- gameplay layer (with screen shake) ----
  c.setTransform(1, 0, 0, 1, V.shakeX * s, V.shakeY * s);
  const camX = V.camX;
  drawBolts(P, camX, 0);
  for (const o of LV.obs) drawObstacle(o, P, camX);
  drawFloor(P, camX);
  drawStrays(P, camX);
  drawMotes(P, camX);
  drawTouchRings(P, G);
  drawRibbon(P, camX);
  drawBirds(P, camX);
  drawHawks(P, camX);
  drawFx(c, s, camX, P);
  drawBolts(P, camX, 1);
  glowFlush(c, s, P.mote);
  c.setTransform(1, 0, 0, 1, 0, 0);
  drawWeather(c, V, P, V.quality);
  glowFlush(c, s, LANT);
  if (V.quality) drawForeground(P);
  // grade: vignette + grain + flash
  c.drawImage(vigCv, 0, 0, w, h);
  if (V.quality && grainPat) { c.globalAlpha = 0.045; c.globalCompositeOperation = 'overlay'; c.save(); c.translate((t * 977) % 128, (t * 613) % 128); c.fillStyle = grainPat; c.fillRect(-128, -128, w + 256, h + 256); c.restore(); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; }
  if (G.flash > 0) { c.fillStyle = `rgba(235,245,255,${Math.min(0.55, G.flash).toFixed(3)})`; c.fillRect(0, 0, w, h); }
  if (G.hurt > 0) { const rg = c.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, h * 1.1); rg.addColorStop(0, 'rgba(120,10,30,0)'); rg.addColorStop(1, `rgba(120,10,30,${(G.hurt * 0.5).toFixed(3)})`); c.fillStyle = rg; c.fillRect(0, 0, w, h); }
}

// ---------- floor / water ----------
function drawFloor(P, camX) {
  const { w, h, s, t } = V;
  const step = Math.max(4, w / 160);
  const water = isWaterAt(camX + V.W * 0.5) || isWaterAt(camX) || isWaterAt(camX + V.W);
  // ground silhouette
  mix(P.near, P.rim, 0.16, _a); mix(P.near, P.fog, 0.25, _b);
  c.beginPath(); c.moveTo(-step, h + 10);
  let minY = 1e9;
  for (let x = -step; x <= w + step; x += step) { const wx = camX + x / s; let y = floorY(wx); if (isWaterAt(wx)) y = WATER_Y + 4; y *= s; if (y < minY) minY = y; c.lineTo(x, y); }
  c.lineTo(w + step, h + 10); c.closePath();
  // ground props in same path
  const cw = 7, i0 = Math.floor((camX - 10) / cw), i1 = Math.floor((camX + V.W + 10) / cw);
  for (let i = i0; i <= i1; i++) {
    const hh = hash1(i, 900); const wx = (i + hash1(i, 901)) * cw; if (isWaterAt(wx)) continue;
    const st = styleAtX(wx); const y = floorY(wx) * s + 0.4 * s, x = (wx - camX) * s, k = hash1(i, 902);
    if (hh < 0.45) grass(x, y, s * (0.7 + k * 0.6), k, t);
    else if (hh < 0.6) groundProp(st, x, y, s, k, t);
  }
  const g = c.createLinearGradient(0, minY, 0, h);
  g.addColorStop(0, css(_a)); g.addColorStop(0.35, css(P.near)); g.addColorStop(1, css(P.near));
  c.fillStyle = g; c.fill();
  if (water) drawWater(P, camX);
}
function styleAtX(x) { const li = Math.floor(x / 2000); return ['dunes', 'canyon', 'coast', 'valley', 'peaks'][((li % 5) + 5) % 5]; }
function grass(x, y, s, k, t) {
  const n = 3 + ((k * 4) | 0);
  for (let j = 0; j < n; j++) {
    const bx = x + (j - n / 2) * 0.35 * s, hgt = (1.2 + hash1(j, k * 1000) * 1.6) * s, sway = Math.sin(t * 1.6 + x * 0.01 + j) * 0.3 * s;
    c.moveTo(bx - 0.14 * s, y); c.quadraticCurveTo(bx + sway * 0.4, y - hgt * 0.6, bx + sway, y - hgt); c.quadraticCurveTo(bx + sway * 0.4 + 0.1 * s, y - hgt * 0.5, bx + 0.14 * s, y); c.closePath();
  }
}
function groundProp(st, x, y, s, k, t) {
  if (st === 'dunes' || st === 'canyon') { // cactus / rock
    if (k < 0.5) { const hh = (2.5 + k * 3) * s, ww = 0.55 * s; c.moveTo(x - ww, y); c.lineTo(x - ww, y - hh); c.arc(x, y - hh, ww, Math.PI, 0); c.lineTo(x + ww, y); c.closePath(); c.moveTo(x + ww, y - hh * 0.5); c.lineTo(x + 1.5 * ww, y - hh * 0.5); c.lineTo(x + 1.5 * ww, y - hh * 0.8); c.arc(x + 1.9 * ww, y - hh * 0.8, 0.4 * ww, Math.PI, 0); c.lineTo(x + 2.3 * ww, y - hh * 0.35); c.lineTo(x + ww, y - hh * 0.35); c.closePath(); }
    else { c.moveTo(x + 1.6 * s, y); c.ellipse(x, y, 1.6 * s * (0.6 + k), 1.0 * s, 0, Math.PI, 0); }
  } else if (st === 'peaks' || st === 'coast') { // pine
    const hh = (3 + k * 4) * s;
    for (let j = 0; j < 3; j++) { const yy = y - j * hh * 0.28, ww = (1.4 - j * 0.32) * s; c.moveTo(x - ww, yy); c.lineTo(x, yy - hh * 0.45); c.lineTo(x + ww, yy); c.closePath(); }
  } else if (st === 'valley') { // lantern post / bush
    if (k < 0.4) { c.rect(x - 0.12 * s, y - 3.6 * s, 0.24 * s, 3.6 * s); c.rect(x - 0.45 * s, y - 4.3 * s, 0.9 * s, 0.8 * s); glowPush(x / s, (y / s) - 3.9, 1.2, 0.85, LANT); }
    else { c.moveTo(x + 1.3 * s, y); c.arc(x, y - 0.6 * s, 1.3 * s, 0, Math.PI, true); }
  }
}
function drawWater(P, camX) {
  const { w, h, s, t } = V;
  const wy = WATER_Y * s;
  // only where water is: compute x-range
  let x0 = 1e9, x1 = -1e9; const step = 8 * V.dpr;
  for (let x = 0; x <= w; x += step) if (isWaterAt(camX + x / s)) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  if (x0 > x1) return; x0 = Math.max(0, x0 - step); x1 = Math.min(w, x1 + step);
  const g = c.createLinearGradient(0, wy, 0, h);
  mix(P.water, P.skyLow, 0.35, _a); mix(P.water, P.near, 0.55, _b);
  g.addColorStop(0, css(_a)); g.addColorStop(1, css(_b));
  c.fillStyle = g;
  c.beginPath(); c.moveTo(x0, h);
  for (let x = x0; x <= x1 + 1; x += step) c.lineTo(x, wy + Math.sin((camX * s + x) * 0.02 / V.dpr + t * 2) * 0.25 * s);
  c.lineTo(x1, h); c.closePath(); c.fill();
  // sun glitter column + wave lines
  const sx = P.sunX * w;
  c.fillStyle = css(P.sun, 0.5);
  for (let i = 0; i < 26; i++) {
    const yy = wy + (0.6 + i * 0.32) * s; if (yy > h) break;
    const ww = (1.5 + hash1(i, 33) * 5) * s * (1 + i * 0.05), xx = sx + (hash1(i, 34) - 0.5) * 7 * s + Math.sin(t * 1.5 + i) * s;
    if (xx > x0 && xx < x1) c.fillRect(xx - ww / 2, yy, ww, Math.max(1, s * 0.16));
  }
  c.fillStyle = css(P.cap, 0.18);
  for (let i = 0; i < 40; i++) {
    const yy = wy + (1 + hash1(i, 35) * 7) * s, ww = (2 + hash1(i, 36) * 6) * s;
    const xx = ((hash1(i, 37) * w * 1.2 - (camX * s * (0.8 + (yy - wy) / s * 0.06))) % (w * 1.2) + w * 1.2) % (w * 1.2) - w * 0.1;
    if (xx > x0 && xx < x1) c.fillRect(xx, yy, ww, Math.max(1, s * 0.12));
  }
}

// ---------- obstacles ----------
function tracePoly(o, camX, dx = 0, dy = 0) {
  const p = o.pts, s = V.s; c.moveTo((p[0] - camX) * s + dx, p[1] * s + dy);
  for (let i = 2; i < p.length; i += 2) c.lineTo((p[i] - camX) * s + dx, p[i + 1] * s + dy);
  c.closePath();
}
function drawObstacle(o, P, camX) {
  const { s, w, h } = V;
  const sx0 = (o.minX - camX) * s, sx1 = (o.maxX - camX) * s;
  if (sx1 < -50 || sx0 > w + 50) return;
  if (o.type === 'poly') {
    // sun-facing rim: fill with rim colour, then body shifted away from the sun, clipped
    const cxp = (sx0 + sx1) / 2, cyp = (o.minY + o.maxY) / 2 * s;
    let dx = P.sunX * w - cxp, dy = P.sunY * h - cyp; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const rw = (o.kind === 'pole' || o.kind === 'tower' ? 0.25 : 0.55) * s;
    mix(P.near, P.rim, 0.55 - P.rain * 0.2, _a);
    c.save();
    c.beginPath(); tracePoly(o, camX); c.fillStyle = css(_a); c.fill(); c.clip();
    mix(P.near, P.fog, o.kind === 'hang' ? 0.12 : 0.05, _b); mix(P.near, P.fog, 0.32, _d);
    const g = c.createLinearGradient(0, o.minY * s, 0, Math.min(o.maxY, 100) * s);
    if (o.kind === 'hang') { g.addColorStop(0, css(_d)); g.addColorStop(1, css(_b)); }
    else { g.addColorStop(0, css(_b)); g.addColorStop(0.7, css(P.near)); g.addColorStop(1, css(_d)); }
    c.beginPath(); tracePoly(o, camX, -dx * rw, -dy * rw); c.fillStyle = g; c.fill();
    // strata bands (sandstone / rock layering)
    if (o.kind !== 'pole' && o.kind !== 'tower') {
      mix(P.near, P.rim, 0.07, _d); c.fillStyle = css(_d, 0.55); c.beginPath();
      const step = o.st === 'canyon' ? 3.2 : o.st === 'dunes' ? 4 : 6;
      for (let y = o.minY + 3; y < o.maxY; y += step) {
        const y0 = y * s; c.moveTo(sx0 - 10, y0);
        for (let x = sx0 - 10; x <= sx1 + 10; x += 6 * V.dpr) c.lineTo(x, y0 + Math.sin(x * 0.03 / V.dpr + y) * 0.35 * s);
        c.lineTo(sx1 + 10, y0 + 0.55 * s); c.lineTo(sx0 - 10, y0 + 0.55 * s); c.closePath();
      }
      c.fill();
    }
    // caps (snow on peaks, grass on islands)
    if (o.capTop !== undefined && (o.st === 'peaks' || o.kind === 'island' || o.st === 'valley')) {
      const snow = o.st === 'peaks';
      if (snow) mix(P.cap, P.rim, 0.2, _d); else mix(P.near, [90, 140, 90], 0.22, _d);
      c.fillStyle = css(_d, snow ? 0.95 : 0.9); c.beginPath();
      const cy = o.capTop + (snow ? 4.5 : 1.6);
      c.moveTo(sx0 - 5, (o.minY - 3) * s);
      for (let x = sx0 - 5; x <= sx1 + 5; x += 4 * V.dpr) c.lineTo(x, (cy + Math.sin(x * 0.11 / V.dpr) * (snow ? 1.2 : 0.4) + hash1((x / 4) | 0, 5) * (snow ? 0.6 : 0.2)) * s);
      c.lineTo(sx1 + 5, (o.minY - 3) * s); c.closePath(); c.fill();
    }
    c.restore();
    // decorations (trees on top, vines below)
    if (o.deco.length) drawDeco(o, P, camX);
    // arch: perfect-thread hint glow inside the hole
    if (o.kind === 'arch' && o.hole && !o.threaded) {
      const hx = ((o.hole.x0 + o.hole.x1) / 2 - camX), hy = (o.hole.y0 + o.hole.y1) / 2;
      glowPush(hx, hy, 3.5, 0.12 + 0.06 * Math.sin(V.t * 3));
    }
  } else if (o.type === 'circle') drawBalloon(o, P, camX);
  else if (o.type === 'blade') drawBlades(o, P, camX);
  else if (o.type === 'line') drawString(o, P, camX);
}
function drawDeco(o, P, camX) {
  const s = V.s, t = V.t;
  mix(P.near, P.fog, 0.02, _a); c.fillStyle = css(_a); c.beginPath();
  for (const d of o.deco) {
    const x = (d.x - camX) * s, y = d.y * s, k = d.s || 1;
    if (d.k === 'pine') { const hh = 5 * s * k; for (let j = 0; j < 4; j++) { const yy = y - j * hh * 0.22, ww = (1.6 - j * 0.33) * s * k; c.moveTo(x - ww, yy); c.lineTo(x, yy - hh * 0.4); c.lineTo(x + ww, yy); c.closePath(); } }
    else if (d.k === 'round') { c.rect(x - 0.2 * s * k, y - 2.5 * s * k, 0.4 * s * k, 2.6 * s * k); c.moveTo(x + 1.8 * s * k, y - 3.4 * s * k); c.arc(x, y - 3.4 * s * k, 1.8 * s * k, 0, 6.283); c.moveTo(x + 1.3 * s * k + 1.1 * s * k, y - 4.5 * s * k); c.arc(x + 1.1 * s * k, y - 4.5 * s * k, 1.3 * s * k, 0, 6.283); }
    else if (d.k === 'palm') { const hh = 6 * s * k; c.moveTo(x - 0.2 * s, y); c.quadraticCurveTo(x + 0.5 * s, y - hh * 0.6, x + 1.2 * s * k, y - hh); c.lineTo(x + 1.5 * s * k, y - hh); c.quadraticCurveTo(x + 0.8 * s, y - hh * 0.6, x + 0.25 * s, y); c.closePath(); const tx = x + 1.35 * s * k, ty = y - hh; for (let j = 0; j < 5; j++) { const a = -2.9 + j * 0.62, L = 2.8 * s * k; c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * L * 0.5, ty + Math.sin(a) * L * 0.5 - 0.5 * s, tx + Math.cos(a) * L, ty + Math.sin(a) * L * 0.4 + L * 0.35); c.quadraticCurveTo(tx + Math.cos(a) * L * 0.5, ty + Math.sin(a) * L * 0.5, tx, ty + 0.25 * s); } }
    else if (d.k === 'cactus') { const hh = 3.5 * s * k, ww = 0.5 * s * k; c.moveTo(x - ww, y); c.lineTo(x - ww, y - hh); c.arc(x, y - hh, ww, Math.PI, 0); c.lineTo(x + ww, y); c.closePath(); }
    else if (d.k === 'vine') { const L = d.l * s, sw = Math.sin(t * 1.2 + d.x) * 0.5 * s; c.moveTo(x - 0.12 * s, y - 1 * s); c.quadraticCurveTo(x + sw, y + L * 0.6, x + sw * 1.5, y + L); c.lineTo(x + sw * 1.5 + 0.18 * s, y + L); c.quadraticCurveTo(x + sw + 0.2 * s, y + L * 0.6, x + 0.12 * s, y - 1 * s); c.closePath(); }
  }
  c.fill();
}
function drawBalloon(o, P, camX) {
  const s = V.s, x = (o.x - camX) * s, y = o.y * s, r = o.r * s;
  const hue = BALLOON[o.col % 4];
  mix(P.near, hue, 0.5 * (1 - P.stars * 0.5), _a); mix(_a, P.rim, 0.35, _b); mix(P.near, hue, 0.22, _d);
  // ropes
  c.strokeStyle = css(P.near, 0.9); c.lineWidth = Math.max(1, 0.15 * s);
  c.beginPath(); c.moveTo(x - r * 0.55, y + r * 0.95); c.lineTo(x - r * 0.22, y + r * 1.42); c.moveTo(x + r * 0.55, y + r * 0.95); c.lineTo(x + r * 0.22, y + r * 1.42); c.stroke();
  // envelope with lit side
  const env = () => { c.beginPath(); c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI, true); c.quadraticCurveTo(x - r, y + r * 0.75, x - r * 0.35, y + r * 1.05); c.lineTo(x + r * 0.35, y + r * 1.05); c.quadraticCurveTo(x + r, y + r * 0.75, x + r, y); c.closePath(); };
  c.save(); env(); c.fillStyle = css(_b); c.fill(); c.clip();
  let dx = P.sunX * V.w - x, dy = P.sunY * V.h - y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  c.beginPath(); c.arc(x - dx * r * 0.35, y - dy * r * 0.35, r * 1.02, 0, 6.283); c.fillStyle = css(_a); c.fill();
  // vertical gores
  c.fillStyle = css(_d, 0.7);
  for (let k = -2; k <= 2; k += 2) { c.beginPath(); c.ellipse(x + k * r * 0.33, y + r * 0.1, r * 0.12, r * 1.1, 0, 0, 6.283); c.fill(); }
  c.restore();
  c.fillStyle = css(P.near); c.fillRect(x - r * 0.24, y + r * 1.45, r * 0.48, r * 0.38);
  if (P.lantern > 0.2 || P.stars > 0.3) glowPush(o.x - camX, o.y + o.r * 1.2, 1.4, 0.7, LANT);
}
function drawBlades(o, P, camX) {
  const s = V.s, x = (o.x - camX) * s, y = o.y * s;
  mix(P.near, P.rim, 0.12, _a);
  c.fillStyle = css(_a); c.strokeStyle = css(_a); c.lineWidth = Math.max(1, 0.35 * s);
  c.beginPath();
  for (let k = 0; k < o.n; k++) {
    const a = o.ang + k * 6.2832 / o.n, ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
    const r0 = 1.5 * s, r1 = o.r * s, wd = 1.5 * s;
    c.moveTo(x + ca * 0.5 * s, y + sa * 0.5 * s); c.lineTo(x + ca * r1, y + sa * r1);
    // sail
    c.moveTo(x + ca * r0, y + sa * r0); c.lineTo(x + ca * r1, y + sa * r1); c.lineTo(x + ca * r1 + px * wd, y + sa * r1 + py * wd); c.lineTo(x + ca * r0 + px * wd * 0.7, y + sa * r0 + py * wd * 0.7); c.closePath();
  }
  c.stroke(); c.fill();
  // lattice lines on sails
  mix(P.near, P.fog, 0.3, _b); c.strokeStyle = css(_b, 0.6); c.lineWidth = Math.max(1, 0.12 * s); c.beginPath();
  for (let k = 0; k < o.n; k++) {
    const a = o.ang + k * 6.2832 / o.n, ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
    for (let j = 1; j < 5; j++) { const rr = (1.5 + (o.r - 1.5) * j / 5) * s, wd = 1.5 * s * (0.7 + 0.3 * j / 5); c.moveTo(x + ca * rr, y + sa * rr); c.lineTo(x + ca * rr + px * wd, y + sa * rr + py * wd); }
  }
  c.stroke();
  c.fillStyle = css(P.near); c.beginPath(); c.arc(x, y, 1.1 * s, 0, 6.283); c.fill();
}
function drawString(o, P, camX) {
  const s = V.s, p = o.pts, t = V.t;
  c.strokeStyle = css(P.near); c.lineWidth = Math.max(1.5, o.thick * 1.2 * s);
  c.beginPath(); c.moveTo((p[0] - camX) * s, p[1] * s);
  for (let i = 2; i < p.length; i += 2) c.lineTo((p[i] - camX) * s, p[i + 1] * s);
  c.stroke();
  for (const i of o.lant) {
    const x = (p[i * 2] - camX) * s, y = p[i * 2 + 1] * s + 1.4 * s, sw = Math.sin(t * 2 + i) * 0.2 * s;
    c.strokeStyle = css(P.near); c.lineWidth = Math.max(1, 0.1 * s); c.beginPath(); c.moveTo(x, y - 1.4 * s); c.lineTo(x + sw, y - 0.8 * s); c.stroke();
    c.fillStyle = i % 3 === 0 ? '#ff7a4a' : i % 3 === 1 ? '#ffb24a' : '#ff5a5a';
    c.beginPath(); c.ellipse(x + sw, y, 0.75 * s, 0.95 * s, 0, 0, 6.283); c.fill();
    c.fillStyle = css(P.near); c.fillRect(x + sw - 0.45 * s, y - 1.05 * s, 0.9 * s, 0.25 * s); c.fillRect(x + sw - 0.45 * s, y + 0.82 * s, 0.9 * s, 0.25 * s);
    glowPush(p[i * 2] - camX + sw / s, p[i * 2 + 1] + 1.4, 1.9, 0.9, LANT);
  }
}
function drawBolts(P, camX, pass) {
  const s = V.s, h = V.h;
  for (const b of LV.bolts) {
    const x = (b.x - camX) * s; if (x < -40 || x > V.w + 40) continue;
    if (b.st === 1 && pass === 0) { // telegraph: flickering charge column
      const a = 0.12 + 0.18 * Math.abs(Math.sin(b.t * 30)) * (b.t / 1.25);
      const g = c.createLinearGradient(x - 3 * s, 0, x + 3 * s, 0);
      g.addColorStop(0, 'rgba(200,230,255,0)'); g.addColorStop(0.5, `rgba(220,240,255,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(200,230,255,0)');
      c.fillStyle = g; c.fillRect(x - 3 * s, 0, 6 * s, h);
      glowPush(b.x - camX, WATER_Y - 0.5, 3 * (b.t / 1.25), 0.6);
    } else if (b.st === 2 && pass === 1) {
      c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = Math.max(2, 0.55 * s); c.lineJoin = 'round';
      c.beginPath(); let px = x, py = 0; c.moveTo(px, py);
      const seed = b.seed + ((b.t * 20) | 0);
      for (let i = 1; i <= 14; i++) { py = i / 14 * WATER_Y * s; px = x + (hash1(i, seed) - 0.5) * 4 * s; c.lineTo(px, py); if (i === 6 || i === 10) { c.moveTo(px, py); c.lineTo(px + (hash1(i, seed + 1) - 0.5) * 10 * s, py + 6 * s); c.moveTo(px, py); } }
      c.stroke();
      for (let i = 0; i < 6; i++) glowPush(b.x - camX + (hash1(i, seed) - 0.5) * 3, i / 5 * WATER_Y, 5, 0.8, [190, 220, 255]);
    }
  }
}

// ---------- motes, strays ----------
function drawMotes(P, camX) {
  const s = V.s, t = V.t;
  c.fillStyle = '#fffdf2';
  c.beginPath();
  for (const m of LV.motes) {
    if (!m.alive) continue;
    const x = m.x - camX; if (x < -5 || x > V.W + 5) continue;
    const y = m.y + Math.sin(t * 2 + m.ph) * 0.6, pu = 0.8 + 0.2 * Math.sin(t * 5 + m.ph);
    glowPush(x, y, 1.7 * pu, 0.95);
    const r = 0.42 * s * pu; c.moveTo(x * s + r, y * s); c.arc(x * s, y * s, r, 0, 6.283);
  }
  c.fill();
}
function drawStrays(P, camX) {
  const s = V.s, t = V.t;
  c.fillStyle = css(P.bird); c.beginPath();
  for (const g of LV.strays) {
    if (g.taken) continue;
    for (let i = 0; i < g.n; i++) {
      const x = (g.x - camX + (i - g.n / 2) * 1.5) * s, y = g.y * s, bob = Math.max(0, Math.sin(t * 3 + i * 1.7 + g.ph)) * 0.25 * s;
      const dir = (i % 2) ? 1 : -1;
      c.moveTo(x + 0.6 * s, y - 0.55 * s); c.ellipse(x, y - 0.55 * s, 0.62 * s, 0.42 * s, 0, 0, 6.283);
      c.moveTo(x + dir * 0.5 * s + 0.32 * s, y - 1.0 * s - bob); c.arc(x + dir * 0.5 * s, y - 1.0 * s - bob, 0.32 * s, 0, 6.283);
      c.moveTo(x - dir * 0.4 * s, y - 0.5 * s); c.lineTo(x - dir * 1.3 * s, y - 0.2 * s); c.lineTo(x - dir * 0.5 * s, y - 0.2 * s); c.closePath();
    }
  }
  c.fill();
  // little "call" notes above perched groups to signal them
  for (const g of LV.strays) if (!g.taken) { const x = g.x - camX; if (x > -5 && x < V.W + 5) glowPush(x, g.y - 3 + Math.sin(t * 2 + g.ph) * 0.4, 1.1, 0.35 + 0.25 * Math.sin(t * 4 + g.ph)); }
}

// ---------- birds ----------
let _x = 0, _y = 0, _ca = 1, _sa = 0, _L = 1;
function M(lx, ly) { c.moveTo(_x + (lx * _ca - ly * _sa) * _L, _y + (lx * _sa + ly * _ca) * _L); }
function T(lx, ly) { c.lineTo(_x + (lx * _ca - ly * _sa) * _L, _y + (lx * _sa + ly * _ca) * _L); }
function birdPath(x, y, ang, wing, L) {
  _x = x; _y = y; _ca = Math.cos(ang); _sa = Math.sin(ang); _L = L;
  const wy = -1.25 * wing, wx = -0.25 + Math.abs(wing) * 0.05;
  M(1.0, 0.02); T(0.62, -0.2); T(0.2, -0.14); T(wx + 0.1, wy * 0.6 - 0.1); T(wx - 0.25, wy); T(-0.22, -0.08);
  T(-0.72, -0.1); T(-1.08, -0.3); T(-0.86, 0.02); T(-1.08, 0.26); T(-0.6, 0.14); T(0.3, 0.2);
  c.closePath();
}
function wingOf(b) { const w = Math.sin(b.ph); return b.glide > 0.5 ? lerp(w, 0.15, b.glide) : w; }
function angOf(b) { return clamp(Math.atan2(b.vy, Math.max(10, b.vx)), -0.8, 0.8); }

export let SPECIES = 0; export function setSpecies(i) { SPECIES = i; }
function drawBirds(P, camX) {
  const s = V.s;
  const night = P.stars > 0.6;
  // species tint
  let col = P.bird;
  if (SPECIES === 2) { mix(P.bird, [250, 246, 238], 0.75, _a); col = _a; }
  else if (SPECIES === 3) { mix(P.bird, [255, 210, 140], 0.6, _a); col = _a; }
  else if (SPECIES === 1) { mix(P.bird, [30, 40, 90], 0.35, _a); col = _a; }
  c.fillStyle = css(col);
  c.beginPath();
  for (const b of F.birds) {
    if (b.isLead) continue;
    const x = (b.x - camX) * s, y = b.y * s;
    if (x < -20 || x > V.w + 20) continue;
    if (!b.alive) { if (b.die > 1.2) continue; c.save(); c.globalAlpha = 1 - b.die / 1.2; }
    const L = 1.5 * s * b.sz * (SPECIES === 2 ? 1.15 : 1);
    birdPath(x, y, b.alive ? angOf(b) : b.rot, b.alive ? wingOf(b) : 0.3, L);
    if (!b.alive) { c.fill(); c.restore(); c.beginPath(); }
    if ((night || SPECIES === 3) && b.alive && (b.ox * 7 | 0) % 3 === 0) glowPush(b.x - camX, b.y, 0.9, 0.35, SPECIES === 3 ? LANT : null);
  }
  c.fill();
  // lead bird: pale with a warm rim
  const Lb = F.lead;
  if (Lb && Lb.alive) {
    const x = (Lb.x - camX) * s, y = Lb.y * s;
    mix([255, 247, 236], P.rim, 0.25, _b);
    c.fillStyle = css(_b); c.beginPath(); birdPath(x, y, angOf(Lb), wingOf(Lb), 1.55 * s); c.fill();
    glowPush(Lb.x - camX, Lb.y, 2.2, 0.35);
  }
}
function drawRibbon(P, camX) {
  const R = F.ribbon, s = V.s, t = V.t; if (!F.lead || !F.lead.alive || R.length < 2) return;
  const len = Math.min(R.length, Math.round(10 + (F.ribbonLen || 0)));
  c.fillStyle = '#e8483c';
  c.beginPath();
  // two edges of a tapered strip with flutter
  for (let pass = 0; pass < 2; pass++) {
    const sign = pass ? -1 : 1;
    for (let k = 0; k < len; k++) {
      const i = pass ? len - 1 - k : k; const p = R[i], q = R[Math.max(0, i - 1)], r2 = R[Math.min(len - 1, i + 1)];
      let nx = -(r2.y - q.y), ny = r2.x - q.x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const wdt = 0.42 * (1 - i / len) + 0.06, fl = Math.sin(t * 9 - i * 0.55) * 0.35 * (i / len);
      const x = (p.x - camX + nx * (fl + sign * wdt)) * s, y = (p.y + ny * (fl + sign * wdt)) * s;
      if (k === 0 && pass === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
  }
  c.closePath(); c.fill();
  if (P.stars > 0.5 || P.lantern > 0.5) for (let i = 0; i < len; i += 4) glowPush(R[i].x - camX, R[i].y, 0.9, 0.25, [255, 90, 70]);
}
function drawHawks(P, camX) {
  const s = V.s, t = V.t;
  for (const h of HAWKS) {
    const x = (h.x - camX) * s, y = h.y * s;
    if (h.st === 'warn') {
      // edge warning badge
      const bx = V.w - 4.5 * s, by = clamp(y, 8 * s, V.h - 8 * s), pu = 1 + 0.15 * Math.sin(t * 14);
      c.fillStyle = `rgba(255,80,60,${(0.25 + 0.2 * Math.sin(t * 14)).toFixed(3)})`; c.beginPath(); c.arc(bx, by, 3.6 * s * pu, 0, 6.283); c.fill();
      c.fillStyle = 'rgba(255,245,235,0.95)'; c.beginPath(); c.arc(bx, by, 2.5 * s, 0, 6.283); c.fill();
      c.fillStyle = '#3a1020'; c.beginPath(); hawkPath(bx, by, Math.PI, Math.sin(t * 10), 1.2 * s); c.fill();
      continue;
    }
    mix(P.near, [0, 0, 0], 0.3, _a); c.fillStyle = css(_a);
    const ang = Math.atan2(h.vy, h.vx - (V.speed || 30) * 0.3);
    c.beginPath(); hawkPath(x, y, ang, Math.sin(h.ph) * (h.st === 'dive' ? 0.35 : 1), 2.6 * s); c.fill();
    // eye glint
    c.fillStyle = '#ffcf6a'; c.beginPath(); c.arc(x + Math.cos(ang) * 1.9 * s, y + Math.sin(ang) * 1.9 * s - 0.2 * s, 0.22 * s, 0, 6.283); c.fill();
  }
}
function hawkPath(x, y, ang, wing, L) {
  _x = x; _y = y; _ca = Math.cos(ang); _sa = Math.sin(ang); _L = L;
  const wy = -1.5 * wing;
  M(1.0, 0.05); T(0.82, -0.12); T(0.6, -0.16); T(0.25, -0.12); T(0.05, wy * 0.55); T(-0.35, wy); T(-0.42, wy * 0.85);
  T(-0.5, wy * 0.6); T(-0.3, -0.05); T(-0.95, -0.12); T(-1.05, 0.12); T(-0.3, 0.16); T(0.5, 0.18); T(0.95, 0.15);
  c.closePath();
}
function drawTouchRings(P, G) {
  if (!G.touching) return;
  const s = V.s; const n = F.split ? 2 : 1;
  for (let g = 0; g < n; g++) {
    const a = F.anchors[g]; c.strokeStyle = css(P.mote, 0.22); c.lineWidth = Math.max(1, 0.2 * s);
    c.beginPath(); c.arc(a.x * s, a.y * s, (F.radius * (F.split ? 0.8 : 1.2)) * s, 0, 6.283); c.stroke();
  }
}

// ---------- blurred foreground silhouettes (fake depth of field) ----------
function drawForeground(P) {
  const fw = fgCv.width, fh = fgCv.height, k = fh / 100;
  fgC.clearRect(0, 0, fw, fh);
  mix(P.near, [0, 0, 0], 0.35, _a); fgC.fillStyle = css(_a);
  const par = 1.7, u0 = V.camX * par, cw = 150;
  let any = false;
  fgC.beginPath();
  for (let ci = Math.floor(u0 / cw); ci <= Math.floor((u0 + fw / k) / cw); ci++) {
    if (hash1(ci, 77) > 0.42) continue;
    any = true;
    const ux = (ci + hash1(ci, 78)) * cw, x = (ux - u0) * k, typ = hash1(ci, 79);
    if (typ < 0.6) { // tall grass clump bottom
      for (let j = 0; j < 9; j++) {
        const bx = x + (j - 4) * 1.6 * k, hh = (8 + hash1(j, ci) * 16) * k, sw = Math.sin(V.t * 1.3 + j + ci) * 2 * k;
        fgC.moveTo(bx - 0.9 * k, fh + 2); fgC.quadraticCurveTo(bx + sw * 0.4, fh - hh * 0.6, bx + sw + (j - 4) * 0.8 * k, fh - hh); fgC.quadraticCurveTo(bx + sw * 0.4 + 0.6 * k, fh - hh * 0.5, bx + 0.9 * k, fh + 2); fgC.closePath();
      }
    } else { // overhanging branch from top
      const yy = -2 * k; fgC.moveTo(x - 30 * k, yy); fgC.quadraticCurveTo(x, yy + 9 * k, x + 22 * k, yy + 5 * k); fgC.lineTo(x + 22 * k, yy + 6.5 * k); fgC.quadraticCurveTo(x, yy + 11 * k, x - 30 * k, yy + 3 * k); fgC.closePath();
      for (let j = 0; j < 8; j++) { const lx = x - 24 * k + j * 6 * k, ly = yy + 6 * k + Math.sin(j) * 2 * k + Math.sin(V.t + j) * 0.6 * k; fgC.moveTo(lx + 3 * k, ly + 2 * k); fgC.ellipse(lx, ly + 2 * k, 3 * k, 1.4 * k, 0.6 + j * 0.2, 0, 6.283); }
    }
  }
  if (!any) return;
  fgC.fill();
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.globalAlpha = 0.9; c.drawImage(fgCv, 0, 0, V.w, V.h); c.globalAlpha = 1;
}
